// Meshy body test: an AI-generated (Meshy text-to-3D, unrigged) character mesh is normalised into the mannequin's
// bind space, skinned with weights transferred from the mannequin (dev/meshyFit.ts) and driven by the game's own
// skeleton and clips (Animator). The current procedural character (CharacterView) stands next to it.
// Open with `npx vite` and visit /dev/meshy.html. URL params:
//   clip=idle|walk|sitIdle|sleep|eat|talk|...   view=live|front|threeq|full|shoulders|elbows|hips|knees
//   scene=stand|sit|lie   glb=<url>   tex=<px>   hair=<hair id>   wire=1   bind=1   freeze=1   shadows=0
//   sigma, smooth, armScale, height   (fit options)   ppm=<live zoom>   frame=a|b   clean=1 (hide UI)
// window.lab exposes hooks for the screenshot script (dev/meshy/shoot.mjs).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AnimId } from '../src/core/anim';
import type { Appearance, BodyFrame, GarmentChoice, GarmentLayer, Outfit, Posture } from '../src/core/types';
import type { ContentDB } from '../src/content/types';
import * as CH from '../src/content/character';
import { cloneSkeleton, loadCharacterAssets } from '../src/characters/assets';
import { toGeometry } from '../src/characters/geometry';
import { buildBodyTemplate } from '../src/characters/template';
import type { CharacterAssets, FrameAssets } from '../src/characters/assets';
import { Animator } from '../src/characters/animation';
import { CharacterView, hairGeometry } from '../src/characters/CharacterView';
import { createHairMaterial } from '../src/characters/materials';
import { STRAND_IDS } from '../src/characters/hair';
import { POSTURE_ANCHORS } from '../src/characters/posture';
import { CameraRig, DEFAULT_PPM } from '../src/render/cameraRig';
import { Lighting } from '../src/render/lighting';
import { DEFAULT_FIT, fitMeshy } from './meshyFit';
import { meshyRawBody } from './meshyRaw';
import type { FitOptions, FitReport } from './meshyFit';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
if (params.get('clean') === '1') document.body.classList.add('clean');

// ---------------------------------------------------------------------------------------------
// content for the procedural comparison person (character registries only, as in dev/characters.ts)
// ---------------------------------------------------------------------------------------------

function byId<T extends { id: string }>(list: readonly T[]): Record<string, T> { return Object.fromEntries(list.map((x) => [x.id, x])); }
const content: ContentDB = {
  objects: {}, openings: {}, wallDesigns: {}, floorDesigns: {}, interactions: {}, socials: {}, traits: {}, aspirations: {},
  skills: {}, careers: {}, moodlets: {}, recipes: {}, packs: {}, preferences: [],
  hair: byId(CH.HAIR), facialHair: byId(CH.FACIAL_HAIR), garments: byId(CH.GARMENTS), accessories: byId(CH.ACCESSORIES),
  patterns: byId(CH.PATTERNS), facePresets: byId(CH.FACE_PRESETS), bodyPresets: byId(CH.BODY_PRESETS), browStyles: byId(CH.BROW_STYLES),
  voices: byId(CH.VOICES), faceParams: CH.FACE_PARAMS, bodyParams: CH.BODY_PARAMS, skinTones: CH.SKIN_TONES,
  hairColors: CH.HAIR_COLORS, eyeColors: CH.EYE_COLORS,
};

// models: the three Meshy bases (male/female wear base-layer underwear and are bald; 'test' has a tee, shorts and cropped hair)
const MODELS = {
  test: { glb: '/dev/meshy/base_male_test.glb', frame: 'a' as BodyFrame, outfit: ['tee-crew|#d7d4dc', 'shorts-casual|#3a3a3e', 'sneakers|#b9b5c8'] },
  male: { glb: '/dev/meshy/base_male_underwear.glb', frame: 'a' as BodyFrame, outfit: [] as string[] },
  female: { glb: '/dev/meshy/base_female_underwear.glb', frame: 'b' as BodyFrame, outfit: [] as string[] },
};
const MODEL = (params.get('model') as keyof typeof MODELS | null) ?? 'male';
const MODEL_DEF = MODELS[MODEL in MODELS ? MODEL : 'male'];
const FRAME: BodyFrame = (params.get('frame') as BodyFrame | null) ?? MODEL_DEF.frame;
/** garments=1: the generated garments are fitted to the Meshy body (template built from the Meshy mesh) and drawn over it. */
const GARMENTS = params.get('garments') === '1';
const OUTFIT_IDS = (params.get('outfit') ?? (MODEL === 'female' ? 'tank-top|#c9c3d6,shorts-casual|#4a4a52,sandals-slide|#8a6a4a' : 'tee-crew|#d7d4dc,shorts-casual|#3a3a3e,sneakers|#b9b5c8')).split(',').filter(Boolean);
const HAIR_ID = params.get('procHair') ?? (MODEL === 'female' ? 'bob-chin' : 'crop-side-part');

function proceduralAppearance(): Appearance {
  const bp = CH.BODY_PRESETS.filter((b) => b.frame === FRAME)[0]!;
  const fp = CH.FACE_PRESETS[0]!;
  return {
    frame: FRAME, skin: CH.SKIN_TONES[3]!.color, body: { ...bp.params }, bodyPresetId: bp.id,
    face: {
      presetId: fp.id, params: { ...fp.params }, eyeColor: CH.EYE_COLORS[2]!.color, browStyle: CH.BROW_STYLES[0]!.id, browColor: '#3d2a1f',
      freckles: 0, blush: 0.15, lipTint: 0.15, lipColor: '#a5605a',
    },
    hair: { styleId: HAIR_ID, color: '#5b3824', highlight: null, facialHairId: null },
  };
}

/** Closest catalogue match of the Meshy base layer when garments=0: boxer briefs / tank top + bike shorts have no catalogue garment, so swimwear. */
const PROC_BASE_IDS = (params.get('procOutfit') ?? (MODEL === 'test' ? OUTFIT_IDS.join(',') : MODEL === 'female' ? 'tank-top|#4d4a57,shorts-casual|#4d4a57' : 'swim-trunks|#3b4052')).split(',').filter(Boolean);

function proceduralOutfit(ids: string[] = OUTFIT_IDS): Outfit {
  // the procedural person wears the catalogue garments closest to the Meshy model's base layer (or the same garments when garments=1)
  const layers: Partial<Record<GarmentLayer, GarmentChoice>> = {};
  for (const spec of ids) {
    const [id, color] = spec.split('|') as [string, string | undefined];
    const g = content.garments[id!];
    if (g) layers[g.layer] = { garmentId: g.id, color: color ?? g.defaultColor, pattern: 'solid', patternColor: '#f6f1e6' };
  }
  return { id: 'meshy-cmp', name: 'Compare', layers, accessories: [] };
}

// ---------------------------------------------------------------------------------------------
// renderer, lights (the game's own day lighting at noon + the portrait/creator three-point light), floor
// ---------------------------------------------------------------------------------------------

const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const PR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(PR);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.enabled = params.get('shadows') !== '0';
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const lighting = new Lighting(scene);
lighting.setFocus(0, 0, 6);
lighting.setShadows(renderer.shadowMap.enabled);
lighting.update(12);
lighting.sun.position.set(-3 + 2, 30, 18); // overhead-ish sun as in the lot view
lighting.sun.target.position.set(0, 0, 0);
scene.background = lighting.background;
renderer.toneMappingExposure = lighting.exposure;

const portraitLights = new THREE.Group();
{
  portraitLights.add(new THREE.HemisphereLight('#fff6ea', '#b49a7c', 1.5));
  const key = new THREE.DirectionalLight('#fff1dc', 2.6);
  key.position.set(1.5, 2.5, 3);
  portraitLights.add(key);
  const rim = new THREE.DirectionalLight('#ffe2c0', 1.0);
  rim.position.set(-2, 2, -2);
  portraitLights.add(rim);
  portraitLights.visible = false;
  scene.add(portraitLights);
}

const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#d9cbb4', roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ---------------------------------------------------------------------------------------------
// cameras: the live-mode rig (orthographic, pitch 37 deg, yaw 45 deg, 66 px per metre) and a perspective close-up camera
// ---------------------------------------------------------------------------------------------

const rig = new CameraRig();
rig.setBounds(-50, -50, 50, 50);
rig.target.set(0, 0.8, 0);
rig.reducedMotion = true;
const persp = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
type ViewName = 'live' | 'front' | 'threeq' | 'full' | 'shoulders' | 'elbows' | 'hips' | 'knees';
interface View { rig: boolean; yaw: number; pitch: number; dist: number; fov: number; ty: number; tz: number; gap: number; turn: number; lights: 'game' | 'portrait'; ppm?: number }
const VIEWS: Record<ViewName, View> = {
  live: { rig: true, yaw: Math.PI / 4, pitch: 0, dist: 0, fov: 0, ty: 0.8, tz: 0, gap: 1.0, turn: 0, lights: 'game', ppm: DEFAULT_PPM },
  front: { rig: false, yaw: 0, pitch: 0.03, dist: 1.25, fov: 24, ty: 1.62, tz: 0, gap: 0.5, turn: 0, lights: 'portrait' },
  threeq: { rig: false, yaw: 0, pitch: 0.05, dist: 1.25, fov: 24, ty: 1.62, tz: 0, gap: 0.5, turn: -0.65, lights: 'portrait' },
  full: { rig: false, yaw: 0, pitch: 0.06, dist: 5, fov: 28, ty: 0.9, tz: 0, gap: 1.0, turn: 0, lights: 'portrait' },
  shoulders: { rig: false, yaw: 0, pitch: 0.05, dist: 1.8, fov: 28, ty: 1.38, tz: 0, gap: 0.95, turn: 0, lights: 'portrait' },
  elbows: { rig: false, yaw: 0, pitch: 0.05, dist: 1.8, fov: 28, ty: 1.2, tz: 0, gap: 0.95, turn: 0, lights: 'portrait' },
  hips: { rig: false, yaw: 0, pitch: 0.05, dist: 1.8, fov: 28, ty: 0.95, tz: 0, gap: 0.95, turn: 0, lights: 'portrait' },
  knees: { rig: false, yaw: 0, pitch: 0.05, dist: 1.8, fov: 28, ty: 0.55, tz: 0, gap: 0.95, turn: 0, lights: 'portrait' },
};
let view: View = { ...VIEWS.live };
let viewName: ViewName = 'live';
let rigK = 0;

function resize(): void {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  rig.setSize(w, h);
  persp.aspect = w / h;
  persp.updateProjectionMatrix();
}

function activeCamera(): THREE.Camera {
  const w = innerWidth, h = innerHeight;
  if (view.rig) {
    rig.setSize(w, h);
    rig.setYawStep(rigK);
    rig.setZoom(view.ppm ?? DEFAULT_PPM);
    rig.target.set(0, view.ty, view.tz);
    rig.update(0);
    return rig.camera;
  }
  persp.fov = view.fov;
  persp.aspect = w / h;
  const dir = new THREE.Vector3(Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(view.yaw) * Math.cos(view.pitch));
  persp.position.set(0, view.ty, view.tz).addScaledVector(dir, view.dist);
  persp.lookAt(0, view.ty, view.tz);
  persp.updateProjectionMatrix();
  persp.updateMatrixWorld(true);
  return persp;
}

// ---------------------------------------------------------------------------------------------
// the Meshy character
// ---------------------------------------------------------------------------------------------

interface MeshyAsset {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  report: FitReport;
  fit: FitOptions;
  fileBytes: number;
  texSize: [number, number];
  sourceTris: number;
  /** Fitted mesh as a RawBody (template / garment generators). */
  meshyRaw: ReturnType<typeof meshyRawBody>;
}

function downscaleTexture(tex: THREE.Texture, size: number): THREE.Texture {
  const img = tex.image as CanvasImageSource & { width: number; height: number };
  if (!size || size >= img.width) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, size, size);
  const out = new THREE.CanvasTexture(c);
  out.colorSpace = THREE.SRGBColorSpace;
  out.flipY = tex.flipY;
  out.wrapS = tex.wrapS; out.wrapT = tex.wrapT;
  out.generateMipmaps = true;
  out.minFilter = THREE.LinearMipmapLinearFilter;
  return out;
}

async function loadMeshy(fa: FrameAssets): Promise<MeshyAsset> {
  const url = params.get('glb') ?? MODEL_DEF.glb;
  const resp = await fetch(url);
  const buf = await resp.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(buf, url.slice(0, url.lastIndexOf('/') + 1));
  let mesh: THREE.Mesh | null = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
  if (!mesh) throw new Error('no mesh in the Meshy GLB');
  const m = mesh as THREE.Mesh;
  const g = m.geometry.clone();
  g.applyMatrix4(m.matrixWorld);
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const idx = g.getIndex();
  const n = pos.count;
  const index = new Uint32Array(idx ? idx.count : n);
  for (let i = 0; i < index.length; i++) index[i] = idx ? idx.getX(i) : i;
  const fit: FitOptions = {
    ...DEFAULT_FIT,
    height: num('height', DEFAULT_FIT.height), girth: num('girth', DEFAULT_FIT.girth), armScale: num('armScale', DEFAULT_FIT.armScale),
    splitLegs: params.get('split') !== '0', straightenLegs: params.get('legs') !== '0', sigma: num('sigma', DEFAULT_FIT.sigma), smooth: num('smooth', DEFAULT_FIT.smooth), smoothAmount: num('smoothAmount', DEFAULT_FIT.smoothAmount),
  };
  const res = fitMeshy({ positions: new Float32Array(pos.array), normals: new Float32Array(nor.array), index }, fa.raw, fit);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(res.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(res.normals, 3));
  geo.setAttribute('uv', g.getAttribute('uv').clone());
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(res.joints, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(res.weights, 4));
  geo.setIndex(new THREE.BufferAttribute(res.index, 1));
  geo.computeBoundingSphere();
  const src = (m.material as THREE.MeshStandardMaterial);
  let map = src.map ?? null;
  const texSize: [number, number] = map ? [(map.image as { width: number }).width, (map.image as { height: number }).height] : [0, 0];
  if (map) map = downscaleTexture(map, num('tex', 0));
  if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; }
  const material = new THREE.MeshStandardMaterial({ map, roughness: num('rough', 0.85), metalness: 0 });
  return { geometry: geo, material, report: res.report, fit, fileBytes: buf.byteLength, texSize: map && num('tex', 0) ? [(map.image as { width: number }).width, (map.image as { height: number }).height] : texSize, sourceTris: index.length / 3, meshyRaw: meshyRawBody(fa.raw, res) };
}

class MeshyCharacter {
  readonly root: THREE.Group;
  private animator: Animator | null = null;
  readonly skeleton: THREE.Skeleton;
  readonly mesh: THREE.SkinnedMesh;
  private extras: THREE.Object3D[] = [];
  private hairMat: { material: THREE.Material; uniforms: ReturnType<typeof createHairMaterial>['uniforms'] } | null = null;
  hairMesh: THREE.SkinnedMesh | null = null;

  /** With `cv` the Meshy mesh replaces the skin of a CharacterView (whose garments were generated on the Meshy body). */
  constructor(private fa: FrameAssets, assets: CharacterAssets, private asset: MeshyAsset, wire: boolean, private cv: CharacterView | null = null) {
    if (cv) {
      this.root = cv.root;
      const skin = cv.root.getObjectByName('skin') as THREE.SkinnedMesh;
      skin.visible = false;
      this.skeleton = skin.skeleton;
    } else {
      this.root = new THREE.Group();
      const { root, skeleton } = cloneSkeleton(fa);
      this.skeleton = skeleton;
      this.root.add(root);
    }
    this.mesh = new THREE.SkinnedMesh(asset.geometry, asset.material);
    this.mesh.name = 'meshy';
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.root.add(this.mesh);
    if (wire) {
      const w = new THREE.SkinnedMesh(asset.geometry, new THREE.MeshBasicMaterial({ color: '#10202a', wireframe: true, transparent: true, opacity: 0.55 }));
      w.bind(this.skeleton, new THREE.Matrix4());
      w.frustumCulled = false;
      this.root.add(w);
      this.extras.push(w);
    }
    if (!cv) {
      this.animator = new Animator(this.root, assets.clips);
      this.animator.play('idle', { fade: 0 });
    }
  }

  stopAnim(): void { this.animator?.mixer.stopAllAction(); this.cv?.update(0); }

  /** Adds the procedural hair geometry, refitted to the Meshy head box (see hairFit). */
  addHair(assets: CharacterAssets, hairId: string, color: string): { fit: Record<string, number> } {
    const g0 = hairGeometry(assets, this.fa, content, hairId, null);
    if (!g0) throw new Error(`hair ${hairId} has no geometry`);
    const g = g0.clone();
    const fit = hairFit(this.fa, this.asset.report);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const out = new Float32Array(p.array.length);
    for (let i = 0; i < p.count; i++) {
      out[i * 3] = fit.cx + ((p.getX(i) - fit.tcx) * fit.sx);
      out[i * 3 + 1] = fit.y0 + (p.getY(i) - fit.y0) * (p.getY(i) >= fit.y0 ? fit.sy : 1) + fit.dy;
      out[i * 3 + 2] = fit.cz + ((p.getZ(i) - fit.tcz) * fit.sz);
    }
    g.setAttribute('position', new THREE.BufferAttribute(out, 3));
    g.computeBoundingSphere();
    const { material, uniforms } = createHairMaterial();
    material.color.set(color);
    const def = content.hair[hairId];
    uniforms.uStrand.value = STRAND_IDS[typeof def?.build.strand === 'string' ? def.build.strand : 'straight'] ?? 0;
    const hm = new THREE.SkinnedMesh(g, material);
    hm.userData.hairFit = fit;
    hm.name = 'hair';
    hm.bind(this.skeleton, new THREE.Matrix4());
    hm.frustumCulled = false;
    hm.castShadow = true;
    this.root.add(hm);
    this.hairMesh = hm;
    this.hairMat = { material, uniforms };
    return { fit: fit as unknown as Record<string, number> };
  }

  update(dt: number): void { if (this.cv) this.cv.update(dt); else this.animator!.update(Math.min(dt, 0.1)); }
  play(a: AnimId, posture?: Posture): void { if (this.cv) this.cv.play(a, { fade: 0, posture }); else this.animator!.play(a, { fade: 0, posture }); }
  stats(): { triangles: number; drawCalls: number } {
    const t = this.asset.geometry.getIndex()!.count / 3;
    return { triangles: t + (this.hairMesh ? this.hairMesh.geometry.getIndex()!.count / 3 : 0), drawCalls: 1 + (this.hairMesh ? 1 : 0) };
  }
  dispose(): void { this.animator?.dispose(); this.cv?.dispose(); this.hairMat?.material.dispose(); this.root.removeFromParent(); }
}

/**
 * Maps the template head the procedural hair was built on onto the Meshy head: the hair keeps its shape, scaled
 * in x/z to the Meshy skull width/depth around the head centre and in y so the crown meets the Meshy crown.
 * Measured on the skull band between 1.60 m and 1.70 m (above the brow, below the crown curve).
 */
function hairFit(fa: FrameAssets, rep: FitReport): { cx: number; cz: number; tcx: number; tcz: number; sx: number; sy: number; sz: number; y0: number; dy: number; tpl: Record<string, number>; meshy: Record<string, number> } {
  const sg = fa.skinGeometry;
  const info = sg.getAttribute('aInfo');
  const pos = sg.getAttribute('position');
  const tb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, top: -Infinity };
  const y0 = 1.6;
  for (let i = 0; i < pos.count; i++) {
    if (info.getX(i) !== 5) continue;
    const y = pos.getY(i);
    tb.top = Math.max(tb.top, y);
    if (y < y0 || y > y0 + 0.1) continue;
    tb.x0 = Math.min(tb.x0, pos.getX(i)); tb.x1 = Math.max(tb.x1, pos.getX(i));
    tb.z0 = Math.min(tb.z0, pos.getZ(i)); tb.z1 = Math.max(tb.z1, pos.getZ(i));
  }
  const mb = rep.skull;
  const mx = mb.x1 - mb.x0, mz = mb.z1 - mb.z0;
  const tx = tb.x1 - tb.x0, tz = tb.z1 - tb.z0;
  return {
    cx: (mb.x0 + mb.x1) / 2, cz: (mb.z0 + mb.z1) / 2, tcx: (tb.x0 + tb.x1) / 2, tcz: (tb.z0 + tb.z1) / 2,
    sx: params.has('hsx') ? num('hsx', 1) : mx / tx, sz: params.has('hsz') ? num('hsz', 1) : mz / tz,
    sy: params.has('hsy') ? num('hsy', 1) : (mb.crown - y0) / (tb.top - y0), y0, dy: num('hdy', 0),
    tpl: { width: tx, depth: tz, crown: tb.top }, meshy: { width: mx, depth: mz, crown: mb.crown },
  };
}

// ---------------------------------------------------------------------------------------------
// slots: one per character (a group holding the person and a seat/bed proxy)
// ---------------------------------------------------------------------------------------------

type SceneName = 'stand' | 'sit' | 'lie';
interface Slot { group: THREE.Group; seat: THREE.Mesh; bed: THREE.Mesh; person: THREE.Object3D }

function makeSlot(person: THREE.Object3D): Slot {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.8 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, POSTURE_ANCHORS.seated.seatHeight, 0.5), mat);
  seat.position.set(0, POSTURE_ANCHORS.seated.seatHeight / 2, POSTURE_ANCHORS.seated.seatZ - 0.02);
  const BED_H = 0.5;
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.0, BED_H, 2.1), new THREE.MeshStandardMaterial({ color: '#d8d2c8', roughness: 0.85 }));
  bed.position.set(0, BED_H / 2, POSTURE_ANCHORS.lying.centerZ);
  seat.visible = bed.visible = false;
  seat.castShadow = bed.castShadow = true; seat.receiveShadow = bed.receiveShadow = true;
  group.add(seat, bed, person);
  return { group, seat, bed, person };
}

// ---------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------

const BED_TOP = 0.5;
let assets: CharacterAssets;
let asset: MeshyAsset;
let proc: CharacterView;
let meshy: MeshyCharacter;
let slotP: Slot, slotM: Slot;
let sceneName: SceneName = 'stand';
let currentAnim: AnimId = 'idle';
let showProc = true, showMeshy = true;
let frozen = params.get('freeze') === '1';
let bindPose = params.get('bind') === '1';
let hairInfo: Record<string, unknown> | null = null;
let loadMs = 0;

function layout(): void {
  const right = new THREE.Vector3(Math.cos(view.yaw), 0, -Math.sin(view.yaw));
  const forward = new THREE.Vector3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw));
  const camYaw = view.rig ? rig.yaw : view.yaw;
  if (view.rig) { right.set(Math.cos(rig.yaw), 0, -Math.sin(rig.yaw)); forward.set(-Math.sin(rig.yaw), 0, -Math.cos(rig.yaw)); }
  const lying = sceneName === 'lie';
  const dir = lying ? forward : right;
  const gap = lying ? 1.4 : view.gap;
  const spin = lying ? -Math.PI / 2 : view.turn;
  const both = showProc && showMeshy;
  const offA = both ? -gap / 2 : 0, offB = both ? gap / 2 : 0;
  slotP.group.position.copy(dir).multiplyScalar(lying ? offB : offA);
  slotM.group.position.copy(dir).multiplyScalar(lying ? offA : offB);
  slotP.group.rotation.y = slotM.group.rotation.y = camYaw + spin;
  const seated = sceneName === 'sit', lie = sceneName === 'lie';
  for (const s of [slotP, slotM]) {
    s.seat.visible = seated; s.bed.visible = lie;
    s.person.position.y = lie ? BED_TOP - POSTURE_ANCHORS.lying.backY : 0;
  }
  slotP.group.visible = showProc; slotM.group.visible = showMeshy;
}

function setView(name: ViewName, over: Partial<View> = {}): void {
  viewName = name;
  view = { ...VIEWS[name], ...over };
  for (const k of ['ppm', 'yaw', 'dist', 'ty', 'gap', 'turn', 'fov'] as const) if (params.has(k) && !(k in over)) view[k] = num(k, 0);
  portraitLights.visible = view.lights === 'portrait';
  lighting.hemi.visible = lighting.sun.visible = lighting.fill.visible = view.lights === 'game';
  portraitLights.rotation.y = view.rig ? 0 : view.yaw;
  // lying needs the camera further back for the 2 m bodies
  if (!view.rig && sceneName === 'lie' && name === 'full') view.dist = 6.5;
  layout();
}

function setScene(s: SceneName): void {
  sceneName = s;
  layout();
}

function play(a: AnimId, posture?: Posture): void {
  currentAnim = a;
  const p = posture ?? (a === 'sleep' || a === 'lieDown' ? 'lying' : a === 'sitIdle' || a === 'sitDown' || a === 'sitTalk' ? 'seated' : 'standing');
  proc.play(a, { fade: 0, posture: p });
  meshy.play(a, p);
  if (p === 'lying') setScene('lie'); else if (p === 'seated') setScene('sit'); else if (sceneName !== 'stand' && (a === 'idle' || a === 'walk')) setScene('stand');
  if (!frozen) return;
  // frozen: apply the first frame immediately
  proc.update(0); meshy.update(0);
}

function pose(): void {
  slotP.group.updateMatrixWorld(true);
  slotM.group.updateMatrixWorld(true);
}

function step(dt: number, n = 1): void {
  for (let k = 0; k < n; k++) { proc.update(dt); meshy.update(dt); }
  pose();
}

/** A CharacterView whose body template (and therefore garments, hair and morph targets) was built from the Meshy mesh. */
function meshyGarmentView(base: CharacterAssets, fa: FrameAssets): CharacterView {
  const template = buildBodyTemplate(asset.meshyRaw);
  const derived: FrameAssets = { ...fa, raw: asset.meshyRaw, template, skinGeometry: toGeometry(template.skinMesh, 'skin-meshy') };
  const assetsM: CharacterAssets = { frames: { a: derived, b: derived }, clips: base.clips, cache: new Map() };
  const a = proceduralAppearance();
  a.hair = { ...a.hair, styleId: '' }; // bald: hair comes from addHair (fitted)
  const cv = new CharacterView(assetsM, content, a, proceduralOutfit());
  cv.root.traverse((o) => { o.castShadow = true; o.frustumCulled = false; });
  return cv;
}

async function main(): Promise<void> {
  const t0 = performance.now();
  assets = await loadCharacterAssets('/assets/');
  const fa = assets.frames[FRAME];
  asset = await loadMeshy(fa);
  loadMs = performance.now() - t0;
  proc = new CharacterView(assets, content, proceduralAppearance(), proceduralOutfit(GARMENTS ? OUTFIT_IDS : PROC_BASE_IDS));
  proc.root.traverse((o) => { o.castShadow = true; o.frustumCulled = false; });
  meshy = new MeshyCharacter(fa, assets, asset, params.get('wire') === '1', GARMENTS ? meshyGarmentView(assets, fa) : null);
  if (params.has('hair')) hairInfo = meshy.addHair(assets, params.get('hair')!, params.get('hairColor') ?? '#5b3824');
  slotP = makeSlot(proc.root);
  slotM = makeSlot(meshy.root);
  scene.add(slotP.group, slotM.group);
  setView((params.get('view') as ViewName) in VIEWS ? (params.get('view') as ViewName) : 'live');
  rigK = num('k', 0);
  const sc = params.get('scene') as SceneName | null;
  if (sc) setScene(sc);
  play((params.get('clip') as AnimId | null) ?? 'idle');
  if (params.has('t')) step(num('t', 0), 1);
  buildBar();
  resize();
  addEventListener('resize', () => { resize(); });
  const timer = new THREE.Timer();
  const info = document.getElementById('info')!;
  let frames = 0, acc = 0;
  const proj = new THREE.Vector3();
  const tagA = document.getElementById('tagA')!, tagB = document.getElementById('tagB')!;
  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = timer.getDelta();
    if (!frozen) step(dt);
    if (bindPose) { meshy.stopAnim(); proc.update(0); }
    pose();
    const cam = activeCamera();
    layout();
    renderer.render(scene, cam);
    for (const [tag, slot, vis] of [[tagA, slotP, showProc], [tagB, slotM, showMeshy]] as const) {
      proj.set(0, 0, 0).applyMatrix4(slot.group.matrixWorld).project(cam);
      tag.style.display = vis && !document.body.classList.contains('clean') ? 'block' : 'none';
      tag.style.left = `${(proj.x + 1) / 2 * innerWidth}px`;
      tag.style.top = `${Math.min(innerHeight - 24, (1 - proj.y) / 2 * innerHeight + 6)}px`;
    }
    frames++; acc += dt;
    if (acc > 1) {
      const s = meshy.stats(), p = proc.stats();
      info.textContent = `${(frames / acc).toFixed(1)} fps  tris meshy ${s.triangles} / procedural ${p.triangles}  view ${viewName}  clip ${currentAnim}  load ${loadMs.toFixed(0)} ms  fit ${asset.report.ms} ms`;
      frames = 0; acc = 0;
    }
  });
  Object.assign(window as unknown as Record<string, unknown>, { lab, ready: true });
}

function buildBar(): void {
  const bar = document.getElementById('bar')!;
  const btn = (label: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; bar.appendChild(b); return b; };
  const sep = () => { const s = document.createElement('span'); s.className = 'sep'; bar.appendChild(s); };
  for (const a of ['idle', 'walk', 'jog', 'sitIdle', 'sleep', 'eat', 'talk', 'dance', 'wave', 'phone', 'foldArms', 'cook', 'carry', 'pickUp'] as AnimId[]) btn(a, () => lab.play(a));
  sep();
  for (const v of Object.keys(VIEWS) as ViewName[]) btn(v, () => setView(v));
  sep();
  btn('rotate', () => { rigK = (rigK + 1) % 4; });
  btn('proc', () => { showProc = !showProc; layout(); });
  btn('meshy', () => { showMeshy = !showMeshy; layout(); });
  btn('bind', () => { bindPose = !bindPose; });
  btn('freeze', () => { frozen = !frozen; });
}

// ---------------------------------------------------------------------------------------------
// hooks for the screenshot script
// ---------------------------------------------------------------------------------------------

/** Edge stretch of the skinned Meshy mesh in the current pose: posed edge length / bind edge length. */
function stretchReport(): { max: number; p99: number; over2: number; over3: number; edges: number; worst: Array<{ ratio: number; bindY: number; bindX: number; bone: string }> } {
  const geo = asset.geometry;
  const idx = geo.getIndex()!;
  const bindPos = geo.getAttribute('position');
  const si = geo.getAttribute('skinIndex');
  meshy.root.updateMatrixWorld(true);
  meshy.skeleton.update();
  const n = bindPos.count;
  const posed = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { meshy.mesh.getVertexPosition(i, v); posed[i * 3] = v.x; posed[i * 3 + 1] = v.y; posed[i * 3 + 2] = v.z; }
  const seen = new Set<number>();
  const ratios: Array<{ r: number; a: number }> = [];
  const edge = (a: number, b: number) => {
    const k = a < b ? a * n + b : b * n + a;
    if (seen.has(k)) return;
    seen.add(k);
    const d0 = Math.hypot(bindPos.getX(a) - bindPos.getX(b), bindPos.getY(a) - bindPos.getY(b), bindPos.getZ(a) - bindPos.getZ(b));
    if (d0 < 0.003) return; // seam duplicates and tiny edges
    const d1 = Math.hypot((posed[a * 3] as number) - (posed[b * 3] as number), (posed[a * 3 + 1] as number) - (posed[b * 3 + 1] as number), (posed[a * 3 + 2] as number) - (posed[b * 3 + 2] as number));
    ratios.push({ r: d1 / d0, a });
  };
  for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); edge(a, b); edge(b, c); edge(c, a); }
  ratios.sort((x, y) => y.r - x.r);
  const names = assets.frames[FRAME].boneNames;
  return {
    max: ratios[0]?.r ?? 0, p99: ratios[Math.floor(ratios.length * 0.01)]?.r ?? 0,
    over2: ratios.filter((x) => x.r > 2).length, over3: ratios.filter((x) => x.r > 3).length, edges: ratios.length,
    worst: ratios.slice(0, 8).map((x) => ({ ratio: +x.r.toFixed(2), bindY: +bindPos.getY(x.a).toFixed(3), bindX: +bindPos.getX(x.a).toFixed(3), bone: names[si.getX(x.a)] ?? '?' })),
  };
}

function benchInstances(kind: 'proc' | 'meshy', n: number): { objs: THREE.Object3D[]; update: (dt: number) => void; tris: number; calls: number } {
  const objs: THREE.Object3D[] = [];
  const upd: Array<(dt: number) => void> = [];
  let tris = 0, calls = 0;
  const cols = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const x = (i % cols) * 1.1 - cols * 0.55, z = Math.floor(i / cols) * 1.1 - cols * 0.55;
    if (kind === 'proc') {
      const c = new CharacterView(assets, content, proceduralAppearance(), proceduralOutfit(PROC_BASE_IDS));
      c.root.traverse((o) => { o.frustumCulled = false; });
      c.root.position.set(x, 0, z);
      c.play('walk', { fade: 0 });
      scene.add(c.root); objs.push(c.root); upd.push((dt) => c.update(dt));
      const s = c.stats(); tris += s.triangles; calls += s.drawCalls;
    } else {
      const c = new MeshyCharacter(assets.frames[FRAME], assets, asset, false);
      c.root.position.set(x, 0, z);
      c.play('walk');
      scene.add(c.root); objs.push(c.root); upd.push((dt) => c.update(dt));
      const s = c.stats(); tris += s.triangles; calls += s.drawCalls;
    }
  }
  return { objs, update: (dt) => upd.forEach((f) => f(dt)), tris, calls };
}

const lab = {
  play(a: AnimId, posture?: Posture): void { play(a, posture); },
  scene(s: SceneName): void { setScene(s); },
  view(name: ViewName, over: Partial<View> = {}): void { setView(name, over); },
  k(k: number): void { rigK = ((k % 4) + 4) % 4; },
  show(p: boolean, m: boolean): void { showProc = p; showMeshy = m; layout(); },
  freeze(on: boolean): void { frozen = on; },
  bind(on: boolean): void { bindPose = on; },
  /** Advances both animators by dt seconds (n times) and updates matrices. */
  advance(dt: number, n = 1): void { step(dt, n); },
  stretch: () => stretchReport(),
  report: () => ({ fit: asset.report, opts: asset.fit, tex: asset.texSize, glbBytes: asset.fileBytes, sourceTris: asset.sourceTris, hair: hairInfo, loadMs }),
  stats: () => ({ meshy: meshy.stats(), proc: proc.stats(), render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles } }),
  /** Renders `frames` frames of n characters walking and returns ms per frame (CPU render + GPU/raster sync). */
  bench(kind: 'proc' | 'meshy', n: number, frames = 20): { msPerFrame: number; updateMs: number; tris: number; calls: number } {
    slotP.group.visible = slotM.group.visible = false;
    const set = benchInstances(kind, n);
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    const cam = activeCamera();
    renderer.render(scene, cam);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let upd = 0;
    const t0 = performance.now();
    for (let f = 0; f < frames; f++) {
      const u0 = performance.now();
      set.update(1 / 30);
      upd += performance.now() - u0;
      renderer.render(scene, cam);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    }
    const ms = (performance.now() - t0) / frames;
    for (const o of set.objs) o.removeFromParent();
    layout();
    return { msPerFrame: +ms.toFixed(2), updateMs: +(upd / frames).toFixed(2), tris: set.tris, calls: set.calls };
  },
};

main().catch((e) => { document.getElementById('info')!.textContent = String(e?.stack ?? e); console.error(e); });
