// Character lab: a grid of characters covering every hairstyle, garment, both frames and several body/face
// presets, with animation, rotation and zoom controls. Used to check clothing/body/animation compatibility.
// Open with `npx vite` and visit /dev/characters.html. window.lab exposes hooks for automated screenshots.

import * as THREE from 'three';
import type { AnimId } from '../src/core/anim';
import type { Appearance, BodyFrame, GarmentChoice, GarmentLayer, Outfit } from '../src/core/types';
import type { ContentDB } from '../src/content/types';
import * as CH from '../src/content/character';
import { loadCharacterAssets, setCharacterStyle } from '../src/characters/assets';
import type { CharacterAssets } from '../src/characters/assets';
import { CharacterView } from '../src/characters/CharacterView';

function byId<T extends { id: string }>(list: readonly T[]): Record<string, T> {
  return Object.fromEntries(list.map((x) => [x.id, x]));
}

/** ContentDB with only the character registries (the lab must not depend on other modules' content). */
function characterContent(): ContentDB {
  return {
    objects: {}, openings: {}, wallDesigns: {}, floorDesigns: {}, interactions: {}, socials: {}, traits: {}, aspirations: {},
    skills: {}, careers: {}, moodlets: {}, recipes: {}, packs: {}, preferences: [],
    hair: byId(CH.HAIR), facialHair: byId(CH.FACIAL_HAIR), garments: byId(CH.GARMENTS), accessories: byId(CH.ACCESSORIES),
    patterns: byId(CH.PATTERNS), facePresets: byId(CH.FACE_PRESETS), bodyPresets: byId(CH.BODY_PRESETS), browStyles: byId(CH.BROW_STYLES),
    voices: byId(CH.VOICES), faceParams: CH.FACE_PARAMS, bodyParams: CH.BODY_PARAMS, skinTones: CH.SKIN_TONES,
    hairColors: CH.HAIR_COLORS, eyeColors: CH.EYE_COLORS,
  };
}

const content = characterContent();
const params = new URLSearchParams(location.search);
const MAX_PEOPLE = Number(params.get('n') ?? 99);
const SHADOWS = params.get('shadows') !== '0';
const STYLE = params.get('style') === 'classic' ? 'classic' : 'detailed';
const swatch = (list: Array<{ color: string }>, i: number) => (list[i % list.length] as { color: string }).color;

function appearance(i: number, frame: BodyFrame, hairId: string): Appearance {
  const bodyPresets = CH.BODY_PRESETS.filter((b) => b.frame === frame);
  const bp = bodyPresets[i % bodyPresets.length]!;
  const fp = CH.FACE_PRESETS[i % CH.FACE_PRESETS.length]!;
  const hairColor = swatch(CH.HAIR_COLORS, i * 5 + 2);
  return {
    frame,
    skin: swatch(CH.SKIN_TONES, i * 3 + 1),
    body: { ...bp.params },
    bodyPresetId: bp.id,
    face: {
      presetId: fp.id, params: { ...fp.params }, eyeColor: swatch(CH.EYE_COLORS, i * 7 + 1),
      browStyle: CH.BROW_STYLES[i % CH.BROW_STYLES.length]!.id, browColor: hairColor,
      freckles: i % 4 === 1 ? 0.8 : 0, blush: i % 3 === 0 ? 0.5 : 0.15, lipTint: i % 2 ? 0.6 : 0.15, lipColor: i % 2 ? '#b8434f' : '#a5605a',
    },
    hair: { styleId: hairId, color: hairColor, highlight: i % 5 === 3 ? '#d9b26a' : null, facialHairId: frame === 'a' && i % 3 === 1 ? CH.FACIAL_HAIR[i % CH.FACIAL_HAIR.length]!.id : null },
  };
}

function outfitFor(ids: string[], i: number): Outfit {
  const layers: Partial<Record<GarmentLayer, GarmentChoice>> = {};
  for (const id of ids) {
    const g = content.garments[id];
    if (!g) continue;
    const pattern = g.patterns[(i % g.patterns.length)] ?? 'solid';
    layers[g.layer] = { garmentId: id, color: g.defaultColor, pattern, patternColor: '#f6f1e6' };
  }
  const accessories: Outfit['accessories'] = [];
  if (i % 4 === 0) accessories.push({ accessoryId: 'glasses-round', color: '#3a3632' });
  if (i % 5 === 1) accessories.push({ accessoryId: 'glasses-square', color: '#1f1b19' });
  if (i % 4 === 2) accessories.push({ accessoryId: 'earrings-hoop', color: '#d9b65a' });
  if (i % 5 === 3) accessories.push({ accessoryId: 'earrings-stud', color: '#e2c46b' });
  return { id: `out_${i}`, name: 'Lab', layers, accessories };
}

const OUTFITS: string[][] = [
  ['tee-crew', 'jeans-straight', 'sneakers'],
  ['shirt-button', 'trousers-tailored', 'loafers'],
  ['sundress', 'sandals-slide'],
  ['sweater-knit', 'skirt-aline', 'boots-ankle'],
  ['tank-top', 'shorts-casual', 'sneakers'],
  ['tee-long', 'joggers', 'sneakers', 'jacket-zip'],
  ['overalls', 'boots-ankle'],
  ['polo-shirt', 'shorts-casual', 'loafers'],
  ['pajama-top', 'pajama-pants', 'slippers'],
  ['dress-shirt', 'loafers'],
  ['swimsuit'],
  ['swim-trunks', 'sandals-slide'],
  ['nightgown', 'slippers'],
];

// ---- scene ----
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = SHADOWS;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9e2d6');
scene.add(new THREE.HemisphereLight('#fff6ea', '#b49a7c', 1.25));
const sun = new THREE.DirectionalLight('#fff1dc', 2.3);
sun.position.set(4, 9, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -12; sun.shadow.camera.right = 12; sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12;
scene.add(sun);
const fill = new THREE.DirectionalLight('#dfe8ff', 0.5);
fill.position.set(-5, 3, -4);
scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#d9cbb4', roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const persp = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 200);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
let camera: THREE.Camera = persp;
const view = { yaw: 0, pitch: 0.12, dist: 22, target: new THREE.Vector3(0, 0.9, 0), ortho: false, orthoHeight: 12 };

function updateCamera(): void {
  const dir = new THREE.Vector3(Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(view.yaw) * Math.cos(view.pitch));
  const cam = view.ortho ? ortho : persp;
  cam.position.copy(view.target).addScaledVector(dir, view.dist);
  cam.lookAt(view.target);
  if (view.ortho) {
    const a = innerWidth / innerHeight;
    ortho.left = (-view.orthoHeight * a) / 2; ortho.right = (view.orthoHeight * a) / 2;
    ortho.top = view.orthoHeight / 2; ortho.bottom = -view.orthoHeight / 2;
    ortho.updateProjectionMatrix();
  } else {
    persp.aspect = innerWidth / innerHeight;
    persp.updateProjectionMatrix();
  }
  camera = cam;
}

const people: CharacterView[] = [];
let labAssets: CharacterAssets;
let labOutfits: Outfit[] = [];
let currentAnim: AnimId = 'idle';

async function main(): Promise<void> {
  const t0 = performance.now();
  const assets = await loadCharacterAssets('/assets/', STYLE);
  labAssets = assets;
  const loadMs = performance.now() - t0;
  const hairs = CH.HAIR.map((h) => h.id);
  const count = Math.min(MAX_PEOPLE, Math.max(hairs.length, OUTFITS.length) + 3);
  const cols = 8;
  for (let i = 0; i < count; i++) {
    const frame: BodyFrame = i % 2 === 0 ? 'a' : 'b';
    const hair = hairs[i % hairs.length]!;
    const pv = new CharacterView(assets, content, appearance(i, frame, hair), outfitFor(OUTFITS[i % OUTFITS.length]!, i));
    const r = Math.floor(i / cols), c = i % cols;
    pv.root.position.set((c - (cols - 1) / 2) * 1.3 + (r % 2) * 0.65, 0, r * 2.4 - 1.2);
    scene.add(pv.root);
    people.push(pv);
  }
  updateCamera();
  buildBar();
  const timer = new THREE.Timer();
  const info = document.getElementById('info')!;
  let frames = 0, acc = 0;
  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = timer.getDelta();
    for (const p of people) p.update(dt);
    renderer.render(scene, camera);
    frames++; acc += dt;
    if (acc > 1) {
      info.textContent = `${people.length} people  ${(frames / acc).toFixed(1)} fps  calls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}  load ${loadMs.toFixed(0)} ms`;
      frames = 0; acc = 0;
    }
  });
  Object.assign(window as unknown as Record<string, unknown>, { lab, ready: true });
}

function buildBar(): void {
  const bar = document.getElementById('bar')!;
  const anims: AnimId[] = ['idle', 'walk', 'sitIdle', 'sleep', 'eat', 'talk', 'sitDown', 'standUp', 'lieDown', 'getUp', 'dance', 'phone'];
  for (const a of anims) {
    const b = document.createElement('button');
    b.textContent = a;
    b.onclick = () => lab.anim(a);
    bar.appendChild(b);
  }
  const ctl: Array<[string, () => void]> = [
    ['rotate', () => { view.yaw += Math.PI / 4; updateCamera(); }],
    ['zoom +', () => { view.dist *= 0.8; updateCamera(); }],
    ['zoom -', () => { view.dist *= 1.25; updateCamera(); }],
    ['ortho', () => { view.ortho = !view.ortho; updateCamera(); }],
  ];
  for (const [label, fn] of ctl) { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; bar.appendChild(b); }
}

/** Hooks for automated screenshots. */
const lab = {
  /** Replaces person i: appearance fields (skin, body, face, hair) and an outfit given as garment ids. */
  set(i: number, o: { frame?: BodyFrame; skin?: string; hair?: string; hairColor?: string; facial?: string | null; body?: Record<string, number>; face?: Record<string, number>; eyeColor?: string; browColor?: string; freckles?: number; blush?: number; outfit?: string[] }): void {
    const p = people[i]!;
    const a = appearance(i, o.frame ?? (i % 2 === 0 ? 'a' : 'b'), o.hair ?? CH.HAIR[0]!.id);
    if (o.skin) a.skin = o.skin;
    if (o.hairColor) { a.hair.color = o.hairColor; a.face.browColor = o.hairColor; }
    if (o.facial !== undefined) a.hair.facialHairId = o.facial;
    if (o.body) a.body = { ...a.body, ...o.body };
    if (o.face) a.face.params = { ...a.face.params, ...o.face };
    if (o.eyeColor) a.face.eyeColor = o.eyeColor;
    if (o.browColor) a.face.browColor = o.browColor;
    if (o.freckles !== undefined) a.face.freckles = o.freckles;
    if (o.blush !== undefined) a.face.blush = o.blush;
    p.setAppearance(a);
    if (o.outfit) { labOutfits[i] = outfitFor(o.outfit, i); p.setOutfit(labOutfits[i]!); }
  },
  async style(s: 'classic' | 'detailed'): Promise<string> {
    const now = await setCharacterStyle(labAssets, s);
    for (const p of people) p.refreshStyle();
    return now;
  },
  /**
   * Frame cost with `n` people walking in the live camera framing (SwiftShader, so only relative numbers mean anything):
   * animation update + render + a pixel readback per frame, averaged over `frames`.
   */
  bench(n: number, frames = 12): { msPerFrame: number; updateMs: number; triangles: number; calls: number } {
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    people.forEach((p, k) => { p.root.visible = k < n; if (k < n) { p.play('walk'); p.root.position.set(((k % 4) - 1.5) * 0.9, 0, Math.floor(k / 4) * 1.1 - 0.5); p.root.rotation.y = 0.5; } });
    lab.orthoCam(true, 6);
    lab.cam(0.8, 0.65, 12, 0, 0.9, 0);
    for (let k = 0; k < 3; k++) { for (const p of people) p.update(0.05); renderer.render(scene, camera); }
    let upd = 0;
    const t0 = performance.now();
    for (let k = 0; k < frames; k++) {
      const u0 = performance.now();
      for (const p of people) if (p.root.visible) p.update(0.05);
      upd += performance.now() - u0;
      renderer.render(scene, camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    }
    const ms = (performance.now() - t0) / frames;
    return { msPerFrame: ms, updateMs: upd / frames, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls };
  },
  /** Clears the lab's grid and shows one person in the middle (for screenshots). */
  solo(i: number): void { people.forEach((p, k) => { p.root.visible = k === i; }); },
  anim(a: AnimId, posture?: 'standing' | 'seated' | 'lying'): void {
    currentAnim = a;
    for (const p of people) p.play(a, posture ? { posture } : {});
  },
  /** Switches person i to the other body frame and a new body preset (tests setAppearance rebuilds). */
  swapFrame(i: number): void {
    const frame: BodyFrame = i % 2 === 0 ? 'b' : 'a';
    people[i]!.setAppearance(appearance(i + 3, frame, CH.HAIR[(i + 4) % CH.HAIR.length]!.id));
  },
  dispose(i: number): void { people[i]!.dispose(); },
  charStats(i: number): { triangles: number; drawCalls: number } { return people[i]!.stats(); },
  playOne(i: number, a: AnimId, posture?: 'standing' | 'seated' | 'lying'): void { people[i]!.play(a, posture ? { posture } : {}); },
  /** Orbit camera: yaw (rad), pitch (rad), distance (m), target xyz. */
  cam(yaw: number, pitch: number, dist: number, tx = 0, ty = 0.9, tz = 0, fov = 30): void {
    Object.assign(view, { yaw, pitch, dist });
    view.target.set(tx, ty, tz);
    persp.fov = fov;
    updateCamera();
  },
  orthoCam(on: boolean, height = 12): void { view.ortho = on; view.orthoHeight = height; updateCamera(); },
  person(i: number): { x: number; z: number } { const p = people[i]!; return { x: p.root.position.x, z: p.root.position.z }; },
  count(): number { return people.length; },
  stats(): { calls: number; triangles: number } { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; },
  /** Debug: hides the skin mesh of person i (shows garment shells alone). */
  hideSkin(i: number, hide = true): void { const m = people[i]!.root.getObjectByName('skin'); if (m) m.visible = !hide; },
  only(indices: number[] | null): void { people.forEach((p, i) => { p.root.visible = !indices || indices.includes(i); }); },
  place(i: number, x: number, z: number, rotY = 0, y = 0): void { const p = people[i]!; p.root.position.set(x, y, z); p.root.rotation.y = rotY; },
  step(dt: number, n = 1): void { for (let k = 0; k < n; k++) for (const p of people) p.update(dt); },
  current: () => currentAnim,
  /** Skinned-pose measurements of person i in its current pose (root-relative, metres). */
  measure(i: number): Record<string, number> {
    const pv = people[i]!;
    pv.root.updateMatrixWorld(true);
    const skin = pv.root.getObjectByName('skin') as THREE.SkinnedMesh;
    const info = skin.geometry.getAttribute('aInfo');
    const pos = skin.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    const inv = new THREE.Matrix4().copy(pv.root.matrixWorld).invert();
    let minY = Infinity, seatY = Infinity, seatZ = 0, headX = 0, headY = 0, headZ = 0, footZ = 0, footY = 0, maxZ = -Infinity, minZ = Infinity;
    let hn = 0, fn = 0;
    for (let k = 0; k < pos.count; k++) {
      skin.getVertexPosition(k, v);
      v.applyMatrix4(skin.matrixWorld).applyMatrix4(inv);
      const part = info.getX(k), by = pos.getY(k);
      minY = Math.min(minY, v.y); maxZ = Math.max(maxZ, v.z); minZ = Math.min(minZ, v.z);
      if ((part === 0 || part === 1) && by > 0.78 && by < 1.0 && v.y < seatY) { seatY = v.y; seatZ = v.z; }
      if (part === 5) { headX += v.x; headY += v.y; headZ += v.z; hn++; }
      if (part === 4) { footZ += v.z; footY += v.y; fn++; }
    }
    return { minY, seatY, seatZ, headX: headX / hn, headY: headY / hn, headZ: headZ / hn, footZ: footZ / fn, footY: footY / fn, maxZ, minZ };
  },
  /** Adds a simple seat (box) or bed proxy for alignment checks. */
  prop(kind: 'seat' | 'bed', x: number, z: number, height: number, rotY = 0): void {
    const g = kind === 'seat' ? new THREE.BoxGeometry(0.5, height, 0.5) : new THREE.BoxGeometry(1.0, height, 2.0);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: kind === 'seat' ? '#8a6a4a' : '#d8d2c8', roughness: 0.8 }));
    m.position.set(x, height / 2, z);
    m.rotation.y = rotY;
    scene.add(m);
  },
};

main().catch((e) => { document.getElementById('info')!.textContent = String(e?.stack ?? e); console.error(e); });
