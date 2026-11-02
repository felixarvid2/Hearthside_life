// MPFB body prototype: the game's Meshy bodies (left of each pair) next to MakeHuman bodies made with MPFB
// (public/assets/characters/mpfb_{f,m}.glb, built by `npm run assets:mpfb`), in the same light, on the same skeleton and clips.
// Open with `npx vite` and visit /dev/mpfb.html. URL params:
//   view=full|front|threeq|face|live   focus=0..3 (close views: 0 Meshy F, 1 MPFB F, 2 Meshy M, 3 MPFB M)   clip=idle|walk|sitIdle|...
//   morph=weight|muscle|bust|waist|hips|shoulders|belly   v=-1..1 (the last four only widen: v 0..1)   tone=<skin tone index 0..>   yaw=<radians>   clean=1 (hide the UI)
//   face=<name>:<v>,<name>:<v>   face morphs of the GLB (face_jaw_width:1,face_smile:-0.5; -1..1)   eye=<eye colour index>   lips=0..1 (strength of the `_LIPS` tint)
//   f=<url of the female GLB>   m=<url of the male GLB>
// window.lab exposes hooks for the screenshot script (dev/mpfb/shoot.mjs).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { AnimId } from '../src/core/anim';
import type { Appearance, BodyFrame, Outfit } from '../src/core/types';
import type { ContentDB } from '../src/content/types';
import * as CH from '../src/content/character';
import { loadCharacterAssets } from '../src/characters/assets';
import { CharacterView } from '../src/characters/CharacterView';
import { Lighting } from '../src/render/lighting';

const params = new URLSearchParams(location.search);
const str = (k: string, d: string) => params.get(k) ?? d;
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
if (params.get('clean') === '1') document.body.classList.add('clean');

function byId<T extends { id: string }>(list: readonly T[]): Record<string, T> { return Object.fromEntries(list.map((x) => [x.id, x])); }
const content: ContentDB = {
  objects: {}, openings: {}, wallDesigns: {}, floorDesigns: {}, interactions: {}, socials: {}, traits: {}, aspirations: {},
  skills: {}, careers: {}, moodlets: {}, recipes: {}, packs: {}, preferences: [],
  hair: byId(CH.HAIR), facialHair: byId(CH.FACIAL_HAIR), garments: byId(CH.GARMENTS), accessories: byId(CH.ACCESSORIES),
  patterns: byId(CH.PATTERNS), facePresets: byId(CH.FACE_PRESETS), bodyPresets: byId(CH.BODY_PRESETS), browStyles: byId(CH.BROW_STYLES),
  voices: byId(CH.VOICES), faceParams: CH.FACE_PARAMS, bodyParams: CH.BODY_PARAMS, skinTones: CH.SKIN_TONES,
  hairColors: CH.HAIR_COLORS, eyeColors: CH.EYE_COLORS,
};

const BROW = '#4a3322';
let eyeIndex = num('eye', 2);
const eyeColor = () => CH.EYE_COLORS[eyeIndex % CH.EYE_COLORS.length]!.color;
const LIP_COLOR = '#b0555a';
let lipStrength = num('lips', 0.08);
let toneIndex = num('tone', 3);
const tone = () => CH.SKIN_TONES[toneIndex % CH.SKIN_TONES.length]!.color;

function appearance(frame: BodyFrame, body: Record<string, number> = {}): Appearance {
  const fp = CH.FACE_PRESETS[0]!;
  return {
    frame, skin: tone(), body, bodyPresetId: CH.BODY_PRESETS.filter((b) => b.frame === frame)[0]!.id,
    face: { presetId: fp.id, params: { ...fp.params }, eyeColor: eyeColor(), browStyle: CH.BROW_STYLES[0]!.id, browColor: BROW, freckles: 0, blush: 0.12, lipTint: 0.15, lipColor: '#a5605a' },
    hair: { styleId: 'none', color: '#5b3824', highlight: null, facialHairId: null },
  };
}
const NO_OUTFIT: Outfit = { id: 'none', name: 'Bare', layers: {}, accessories: [] };

// ---- renderer, the game's noon lighting plus the portrait/creator three-point light ----
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.enabled = params.get('shadows') !== '0';
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const lighting = new Lighting(scene);
lighting.setFocus(0, 0, 6);
lighting.setShadows(renderer.shadowMap.enabled);
lighting.update(12);
lighting.sun.position.set(-1, 30, 18);
lighting.sun.target.position.set(0, 0, 0);
scene.background = lighting.background;
renderer.toneMappingExposure = lighting.exposure;
const portrait = new THREE.Group();
portrait.add(new THREE.HemisphereLight('#fff6ea', '#b49a7c', 1.5));
const key = new THREE.DirectionalLight('#fff1dc', 2.6); key.position.set(1.5, 2.5, 3); portrait.add(key);
const rim = new THREE.DirectionalLight('#ffe2c0', 1.0); rim.position.set(-2, 2, -2); portrait.add(rim);
scene.add(portrait);
lighting.hemi.visible = lighting.sun.visible = lighting.fill.visible = false;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#d9cbb4', roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 100);

// ---- people: [Meshy F, MPFB F, Meshy M, MPFB M] ----
const SLOTS = [
  { label: 'Meshy female', x: -1.5, frame: 'b' as BodyFrame }, { label: 'MPFB female', x: -0.5, frame: 'b' as BodyFrame },
  { label: 'Meshy male', x: 0.5, frame: 'a' as BodyFrame }, { label: 'MPFB male', x: 1.5, frame: 'a' as BodyFrame },
];
const groups: THREE.Group[] = SLOTS.map((s) => { const g = new THREE.Group(); g.position.x = s.x; scene.add(g); return g; });
const tags = SLOTS.map((s) => { const d = document.createElement('div'); d.className = 'tag'; d.textContent = s.label; document.body.appendChild(d); return d; });

interface Mpfb { skinImage: CanvasImageSource; scene: THREE.Group; mixer: THREE.AnimationMixer; meshes: THREE.SkinnedMesh[]; morphNames: string[]; skinMean: THREE.Color; info: Record<string, unknown> }
let meshy: CharacterView[] = [];
const mpfb: Array<Mpfb | null> = [null, null];
let clips: Map<string, THREE.AnimationClip>;
let clipName = 'Idle_Loop';
const ANIM_OF: Record<string, [AnimId, string]> = { idle: ['idle', 'Idle_Loop'], walk: ['walk', 'Walk_Loop'], sitIdle: ['sitIdle', 'Sitting_Idle_Loop'], talk: ['talk', 'Idle_Talking_Loop'], wave: ['wave', 'Interact'], eat: ['eat', 'Consume'], dance: ['dance', 'Dance_Loop'], jog: ['jog', 'Jog_Fwd_Loop'] };

async function meanColor(img: CanvasImageSource): Promise<THREE.Color> {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img as CanvasImageSource, 0, 0, 32, 32);
  const d = ctx.getImageData(0, 0, 32, 32).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3]! < 200) continue; r += d[i]!; g += d[i + 1]!; b += d[i + 2]!; n++; }
  return new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
}

async function loadMpfb(url: string): Promise<Mpfb> {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const meshes: THREE.SkinnedMesh[] = [];
  gltf.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) { const m = o as THREE.SkinnedMesh; m.frustumCulled = false; m.castShadow = true; meshes.push(m); } });
  const skin = meshes.find((m) => (m.material as THREE.Material).name === 'mpfb_skin')!;
  const skinImage = (skin.material as THREE.MeshStandardMaterial).map!.image as CanvasImageSource;
  let info: Record<string, unknown> = {};
  gltf.scene.traverse((o) => { if (o.userData?.mpfbBody) info = o.userData.mpfbBody as Record<string, unknown>; });
  const sm = (info.skinMean as number[] | undefined) ?? null;
  const skinMean = sm ? new THREE.Color().setRGB(sm[0]!, sm[1]!, sm[2]!, THREE.LinearSRGBColorSpace) : await meanColor(skinImage);
  return { skinImage, scene: gltf.scene, mixer: new THREE.AnimationMixer(gltf.scene), meshes, morphNames: Object.keys(skin.morphTargetDictionary ?? {}), skinMean, info };
}

const SRGB_TO_LIN = Float32Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const lin2srgb = (c: number) => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
/**
 * Skin tone the way the game's Meshy skin shader does it (baked shading kept): the painted albedo is divided by its mean colour
 * and multiplied by the chosen tone. Luminance carries the shading; a fraction CHROMA of the per-channel ratio keeps lips, knees
 * and nails slightly redder than the rest.
 */
const CHROMA = 0.35;
function recolourSkin(p: Mpfb, toneHex: string): void {
  const skinMat = p.meshes.map((m) => m.material as THREE.MeshStandardMaterial).find((m) => m.name === 'mpfb_skin')!;
  const src = p.skinImage;
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, 1024, 1024);
  const img = ctx.getImageData(0, 0, 1024, 1024);
  const t = new THREE.Color(toneHex);
  const m = p.skinMean;
  const lm = 0.2126 * m.r + 0.7152 * m.g + 0.0722 * m.b;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = SRGB_TO_LIN[d[i]!]!, g = SRGB_TO_LIN[d[i + 1]!]!, b = SRGB_TO_LIN[d[i + 2]!]!;
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / lm;
    d[i] = lin2srgb(Math.min(1, t.r * (l * (1 - CHROMA) + (r / m.r) * CHROMA)));
    d[i + 1] = lin2srgb(Math.min(1, t.g * (l * (1 - CHROMA) + (g / m.g) * CHROMA)));
    d[i + 2] = lin2srgb(Math.min(1, t.b * (l * (1 - CHROMA) + (b / m.b) * CHROMA)));
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  skinMat.map?.dispose();
  skinMat.map = tex;
  skinMat.color.set('#ffffff');
  skinMat.needsUpdate = true;
}

const lipUniforms = { lipColor: { value: new THREE.Color(LIP_COLOR) }, lipStrength: { value: lipStrength } };
/** Lips: the skin's `_LIPS` vertex weight (0..1) shifts the skin colour towards the lip colour's hue (luminance kept, so every tone works). This is what the game's skin shader does too. */
function patchLips(mat: THREE.MeshStandardMaterial): void {
  if (mat.userData.lipsPatched) return;
  mat.userData.lipsPatched = true;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, lipUniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float _lips;\nvarying float vLips;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLips = _lips;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLips;\nuniform vec3 lipColor;\nuniform float lipStrength;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 lipMul = lipColor / max(dot(lipColor, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
        diffuseColor.rgb *= mix(vec3(1.0), lipMul, clamp(vLips * lipStrength, 0.0, 1.0));`);
  };
  mat.customProgramCacheKey = () => 'mpfb-lips';
  mat.needsUpdate = true;
}

function tint(p: Mpfb): void {
  recolourSkin(p, tone());
  for (const m of p.meshes) {
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.name === 'mpfb_skin') patchLips(mat);
    if (mat.name === 'mpfb_iris') mat.color.set(eyeColor());
    if (mat.name === 'mpfb_brows' || mat.name === 'mpfb_lashes') { mat.color.set(mat.name === 'mpfb_brows' ? BROW : '#2b2018'); mat.depthWrite = false; }
  }
}

const GAIN: Record<string, number> = { weight: 3, muscle: 2 };
function setMorph(name: string, v: number): void {
  const pairs: Record<string, [string, string]> = { weight: ['weight_up', 'weight_down'], muscle: ['muscle_up', 'muscle_down'], bust: ['bust_up', 'bust_down'] };
  const single: Record<string, string> = { waist: 'waist_wide', hips: 'hips_wide', shoulders: 'shoulders_wide', belly: 'belly_round' };
  const meshyParam: Record<string, string> = { weight: 'build', muscle: 'muscle', bust: 'chest', waist: 'waist', hips: 'hips' };
  for (const p of mpfb) {
    if (!p) continue;
    for (const m of p.meshes) {
      const infl = m.morphTargetInfluences;
      if (!infl) continue;
      infl.fill(0);
      const set = (n: string, w: number) => { const i = m.morphTargetDictionary?.[n]; if (i !== undefined) infl[i] = w; };
      // MakeHuman's weight and muscle macros are subtle (about 2 cm of waist depth over the full range): the slider drives them x3 / x2
      const gain = GAIN[name] ?? 1;
      if (name === 'bust' && p === mpfb[1]) continue; // the male cup-size target only makes a lump
      if (pairs[name]) set(v >= 0 ? pairs[name]![0] : pairs[name]![1], Math.abs(v) * gain);
      else if (single[name]) set(single[name]!, Math.max(0, v) * gain);
    }
  }
  const mp = meshyParam[name];
  meshy.forEach((cv, i) => { const a = appearance(i === 0 ? 'b' : 'a', mp ? { [mp]: v } : {}); cv.setAppearance(a); });
}

/** Sets morph influences by GLB name (body 0..1, face -1..1), on top of whatever the slider morph set. */
function applyMorphs(map: Record<string, number>): void {
  for (const p of mpfb) {
    if (!p) continue;
    for (const m of p.meshes) {
      const infl = m.morphTargetInfluences;
      if (!infl) continue;
      for (const [n, v] of Object.entries(map)) { const i = m.morphTargetDictionary?.[n]; if (i !== undefined) infl[i] = v; }
    }
  }
}
const parseFace = (q: string) => Object.fromEntries(q.split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split(':'); return [k!, Number(v)]; }));

function play(name: string): void {
  if (name === 'bind') {  // the bind pose (T-pose) of the MPFB bodies, to check the retarget without animation
    for (const p of mpfb) if (p) { p.mixer.stopAllAction(); p.meshes.forEach((m) => m.skeleton.pose()); }
    meshy.forEach((cv) => cv.play('idle'));
    return;
  }
  const [id, clip] = ANIM_OF[name] ?? ANIM_OF.idle!;
  clipName = clip;
  meshy.forEach((cv) => cv.play(id, { posture: id === 'sitIdle' ? 'seated' : 'standing' }));
  for (const p of mpfb) {
    if (!p) continue;
    p.mixer.stopAllAction();
    const c = clips.get(clip);
    if (c) p.mixer.clipAction(c).reset().play();
  }
}

// ---- views ----
type ViewName = 'full' | 'front' | 'threeq' | 'face' | 'torso' | 'live';
interface View { dist: number; fov: number; ty: number; turn: number; focus: boolean }
const VIEWS: Record<ViewName, View> = {
  full: { dist: 5.2, fov: 28, ty: 0.9, turn: 0, focus: false },
  front: { dist: 5.2, fov: 28, ty: 0.9, turn: 0, focus: false },
  threeq: { dist: 5.2, fov: 28, ty: 0.9, turn: -0.65, focus: false },
  face: { dist: 1.0, fov: 24, ty: 1.6, turn: 0, focus: true },
  torso: { dist: 2.4, fov: 24, ty: 1.3, turn: 0, focus: true },
  live: { dist: 8, fov: 18, ty: 0.9, turn: 0, focus: false },
};
let viewName = str('view', 'full') as ViewName;
let focus = num('focus', 0);
let turnOverride: number | null = params.has('yaw') ? num('yaw', 0) : null;

function frame(): void {
  const v = VIEWS[viewName] ?? VIEWS.full;
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = v.fov;
  const cx = v.focus ? SLOTS[focus]!.x : 0;
  const dist = v.focus ? v.dist : v.dist * Math.max(1, (4 * 1.0 + 0.6) / (v.dist * 2 * Math.tan((v.fov * Math.PI) / 360) * (w / h)));
  camera.position.set(cx, v.ty + (viewName === 'live' ? 2.4 : 0.06 * dist), dist);
  camera.lookAt(cx, v.ty, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  groups.forEach((g, i) => { g.rotation.y = turnOverride ?? v.turn; g.visible = !v.focus || i === focus; });
  tags.forEach((d, i) => {
    d.style.display = v.focus ? 'none' : '';
    const p = new THREE.Vector3(SLOTS[i]!.x, 0, 0).project(camera);
    d.style.left = `${((p.x + 1) / 2) * w}px`;
    d.style.top = `${((1 - p.y) / 2) * h + 6}px`;
  });
}

async function main(): Promise<void> {
  const assets = await loadCharacterAssets('/assets/', 'detailed');
  clips = assets.clips;
  meshy = [new CharacterView(assets, content, appearance('b'), NO_OUTFIT), new CharacterView(assets, content, appearance('a'), NO_OUTFIT)];
  groups[0]!.add(meshy[0]!.root);
  groups[2]!.add(meshy[1]!.root);
  const urls = [str('f', '/assets/characters/mpfb_f.glb'), str('m', '/assets/characters/mpfb_m.glb')];
  for (let i = 0; i < 2; i++) {
    try { mpfb[i] = await loadMpfb(urls[i]!); } catch (e) { console.warn('MPFB body not loaded', urls[i], e); continue; }
    groups[i * 2 + 1]!.add(mpfb[i]!.scene);
    tint(mpfb[i]!);
  }
  play(str('clip', 'idle'));
  if (params.has('morph')) setMorph(str('morph', 'weight'), num('v', 0));
  if (params.has('face')) applyMorphs(parseFace(str('face', '')));
  buildBar();
  frame();
  addEventListener('resize', frame);
  const timer = new THREE.Timer();
  const info = document.getElementById('info')!;
  let frames = 0, acc = 0;
  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = timer.getDelta();
    meshy.forEach((cv) => cv.update(dt));
    mpfb.forEach((p) => p?.mixer.update(dt));
    const live = viewName === 'live';
    portrait.visible = !live;
    lighting.hemi.visible = lighting.sun.visible = lighting.fill.visible = live;
    renderer.render(scene, camera);
    frames++; acc += dt;
    if (acc > 1) {
      info.textContent = `${(frames / acc).toFixed(1)} fps  calls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}  clip ${clipName}  morphs ${mpfb[0]?.morphNames.length ?? 0}`;
      frames = 0; acc = 0;
    }
  });
  Object.assign(window as unknown as Record<string, unknown>, { lab, ready: true });
}

function buildBar(): void {
  const bar = document.getElementById('bar')!;
  const btn = (label: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; bar.appendChild(b); };
  for (const a of Object.keys(ANIM_OF)) btn(a, () => play(a));
  for (const v of Object.keys(VIEWS)) btn(v, () => { viewName = v as ViewName; frame(); });
  btn('focus +', () => { focus = (focus + 1) % 4; frame(); });
  btn('tone +', () => { toneIndex++; mpfb.forEach((p) => p && tint(p)); meshy.forEach((cv, i) => cv.setAppearance(appearance(i === 0 ? 'b' : 'a'))); });
  const sel = document.createElement('select');
  for (const m of ['weight', 'muscle', 'bust', 'waist', 'hips', 'shoulders', 'belly']) sel.add(new Option(m, m));
  const rng = document.createElement('input');
  rng.type = 'range'; rng.min = '-1'; rng.max = '1'; rng.step = '0.05'; rng.value = '0';
  const lab2 = document.createElement('label');
  lab2.append('morph ', sel, rng);
  rng.oninput = () => setMorph(sel.value, Number(rng.value));
  sel.onchange = () => { rng.value = '0'; setMorph(sel.value, 0); };
  bar.appendChild(lab2);
  const faceNames = mpfb[0]?.morphNames.filter((n) => n.startsWith('face_')) ?? [];
  if (faceNames.length) {
    const fs = document.createElement('select');
    for (const n of faceNames) fs.add(new Option(n, n));
    const fr = document.createElement('input');
    fr.type = 'range'; fr.min = '-1'; fr.max = '1'; fr.step = '0.05'; fr.value = '0';
    const lab3 = document.createElement('label');
    lab3.append('face ', fs, fr);
    fr.oninput = () => applyMorphs({ [fs.value]: Number(fr.value) });
    fs.onchange = () => { fr.value = '0'; };
    bar.appendChild(lab3);
  }
}

/** Hooks for automated screenshots. */
const lab = {
  set(o: { view?: ViewName; focus?: number; clip?: string; morph?: string; v?: number; yaw?: number | null; tone?: number; eye?: number; lips?: number; morphs?: Record<string, number>; freeze?: number }): void {
    if (o.eye !== undefined) { eyeIndex = o.eye; mpfb.forEach((p) => p && tint(p)); }
    if (o.lips !== undefined) { lipStrength = o.lips; lipUniforms.lipStrength.value = o.lips; }
    if (o.view) viewName = o.view;
    if (o.focus !== undefined) focus = o.focus;
    if (o.yaw !== undefined) turnOverride = o.yaw;
    if (o.tone !== undefined) { toneIndex = o.tone; mpfb.forEach((p) => p && tint(p)); meshy.forEach((cv, i) => cv.setAppearance(appearance(i === 0 ? 'b' : 'a'))); }
    if (o.clip) play(o.clip);
    if (o.morph) setMorph(o.morph, o.v ?? 0);
    if (o.morphs) applyMorphs(o.morphs);
    frame();
  },
  info: () => ({ morphs: mpfb[0]?.morphNames ?? [], tone: tone() }),
};

main().catch((e) => { document.getElementById('info')!.textContent = `error: ${e}`; console.error(e); });
