// Loading of the shared character assets: the two body frames (fitted into smooth templates), their bind
// skeletons, the animation clips, and a cache of generated geometry shared by every CharacterView.
// Shared assets are owned here: CharacterView.dispose() never frees them; disposeCharacterAssets() does.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BodyFrame, LifeStage } from '../core/types';
import type { StageBody } from './stages';
import { stageBodyFile, stageBodyOf, stageFallbackScale } from './stages';
import type { AiHairData } from './aiHair';
import { HeadMap } from './headMap';
import { buildMeshyMesh } from './meshyBody';
import type { MeshyExtras } from './meshyBody';
import type { MpfbExtras, MpfbPart, MpfbPrim } from './mpfbBody';
import { MPFB_PARTS, assembleMpfb } from './mpfbBody';
import type { RawBody, Vec3 } from './rig';
import type { BodyTemplate } from './template';
import { buildBodyTemplate } from './template';
import { toGeometry } from './geometry';

/**
 * 'mpfb': the natural MakeHuman bodies (public/assets/characters/mpfb_*.glb, labelled "Natural" in Settings); 'detailed': the
 * scanned Meshy bodies (meshy_*.glb); 'classic': the procedural bodies.
 */
export type CharacterStyle = 'mpfb' | 'detailed' | 'classic';

// Life stages (heights, which stages have a body of their own, file names): the pure part is in stages.ts
export { ADULT_HEIGHT, STAGE_BODIES, STAGE_HEIGHTS, stageBodyAvailable, stageBodyFile, stageBodyOf, stageFallbackScale } from './stages';
export type { StageBody } from './stages';

/** The frames of a loaded stage body (the baby fills both frames) and its clips with the translation tracks scaled to its skeleton. */
export interface StageSet {
  frames: Record<BodyFrame, FrameAssets>;
  clips: Record<BodyFrame, Map<string, THREE.AnimationClip>>;
}

/** Textures and build data of a Meshy body frame. */
export interface MeshyFrame {
  albedo: THREE.Texture;
  mask: THREE.Texture;
  extras: MeshyExtras;
}

/** Textures, extra primitives and morph facts of an MPFB body frame (the skin primitive is `FrameAssets.skinGeometry`). */
export interface MpfbFrame {
  extras: MpfbExtras;
  sex: 'f' | 'm';
  skinMap: THREE.Texture;
  /** Colour textures of the eyes (sclera), the iris (neutral grey, tinted by the eye colour), brows and lashes. */
  maps: Partial<Record<'eyes' | 'iris' | 'brows' | 'lashes', THREE.Texture>>;
  /** Shared geometry of the primitives drawn on top of the skin (same skeleton, same morph targets). */
  parts: Partial<Record<Exclude<MpfbPart, 'skin'>, THREE.BufferGeometry>>;
  /** Colour of the underwear material in the GLB. */
  underwear: THREE.Color;
  /** Names of every morph target the body's meshes may carry (body morphs, then the displacement-field sliders). */
  morphNames: readonly string[];
}

export interface FrameAssets {
  frame: BodyFrame;
  /** Cache key of everything generated for this frame ('a', 'b' for classic bodies; 'am', 'bm' for Meshy bodies; 'ap', 'bp' for MPFB; 'ap:child' etc. for a stage body). */
  key: string;
  /** Present for Meshy bodies: the skin shader recolours its albedo through the mask. */
  meshy: MeshyFrame | null;
  /** Present for MPFB bodies: textures, the primitives on top of the skin and the morph target names. */
  mpfb: MpfbFrame | null;
  raw: RawBody;
  template: BodyTemplate;
  /** Bind-pose bone hierarchy; cloned per character. */
  rootBone: THREE.Bone;
  /** Bone names in skin-joint order. */
  boneNames: string[];
  boneInverses: THREE.Matrix4[];
  /** Shared skin geometry (body + head). */
  skinGeometry: THREE.BufferGeometry;
}

export interface CharacterAssets {
  /** The frames of the active style. */
  frames: Record<BodyFrame, FrameAssets>;
  style: CharacterStyle;
  /** Frame sets loaded so far (a style is loaded on first use). */
  sets: Partial<Record<CharacterStyle, Record<BodyFrame, FrameAssets>>>;
  /** Life-stage bodies loaded so far (natural style only, loaded on first use: `requestStageBody`). */
  stages: Partial<Record<StageBody, StageSet>>;
  stagesPending?: Partial<Record<StageBody, Promise<StageSet | null>>>;
  /** Stage bodies that failed to load (not tried again). */
  stagesFailed?: Set<StageBody>;
  baseUrl: string;
  /** Animation clips by source name (e.g. 'Idle_Loop'). */
  clips: Map<string, THREE.AnimationClip>;
  /** Generated geometry shared across characters, keyed by frame/style id. */
  cache: Map<string, THREE.BufferGeometry>;
  /** AI hairstyles loaded so far (`loadAiHair`); the tint map belongs to the asset and is freed with it. */
  aiHair?: Map<string, AiHairAsset>;
  aiHairPending?: Map<string, Promise<AiHairAsset | null>>;
}

/** A loaded AI hairstyle: its mesh data (head-local) and greyscale tint map. */
export interface AiHairAsset {
  data: AiHairData;
  map: THREE.Texture;
}

/**
 * Loads the animation clips and the bodies of `style` from `${baseUrl}characters/...` and fits their templates. When the
 * detailed bodies cannot be loaded the classic ones are used (`assets.style` says which).
 */
export async function loadCharacterAssets(baseUrl = './assets/', style: CharacterStyle = 'detailed'): Promise<CharacterAssets> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const loader = new GLTFLoader();
  const [an1, an2] = await Promise.all(['anims_1', 'anims_2'].map((n) => loader.loadAsync(`${base}characters/${n}.glb`)));
  const clips = new Map<string, THREE.AnimationClip>();
  for (const g of [an1!, an2!]) for (const clip of g.animations) clips.set(clip.name, clip);
  const assets: CharacterAssets = { frames: null as unknown as Record<BodyFrame, FrameAssets>, style, sets: {}, stages: {}, baseUrl: base, clips, cache: new Map() };
  await setCharacterStyle(assets, style);
  return assets;
}

/**
 * Switches the active frame set, loading it first when needed. Returns the style in effect: a failed load of the
 * detailed bodies keeps (or loads) the classic ones. Views must be rebuilt after a change (CharacterView.refreshStyle).
 */
export async function setCharacterStyle(assets: CharacterAssets, style: CharacterStyle): Promise<CharacterStyle> {
  let want = style;
  // a style that cannot be loaded falls back to the next simpler one: mpfb -> detailed -> classic
  const chain: CharacterStyle[] = style === 'mpfb' ? ['mpfb', 'detailed', 'classic'] : style === 'detailed' ? ['detailed', 'classic'] : ['classic'];
  for (const [i, s] of chain.entries()) {
    want = s;
    if (assets.sets[s]) break;
    try {
      assets.sets[s] = await loadFrameSet(assets.baseUrl, s);
      break;
    } catch (e) {
      if (i === chain.length - 1) throw e;
      console.warn(`[characters] ${s} bodies unavailable, trying ${chain[i + 1]}`, e);
    }
  }
  assets.style = want;
  assets.frames = assets.sets[want]!;
  return want;
}

// ---------------------------------------------------------------------------------------------
// Life-stage bodies (lazy)
// ---------------------------------------------------------------------------------------------

/** The loaded stage body, or null (not requested yet, still loading, failed, or the adult bodies). */
export function stageSet(assets: CharacterAssets, stage: LifeStage): StageSet | null {
  const body = stageBodyOf(stage);
  return body ? assets.stages[body] ?? null : null;
}

/**
 * Loads the body of a life stage (natural style only; the other styles scale the adult rig) the first time a person of that stage is
 * shown. Resolves to null when the stage has no body of its own, or it cannot be loaded (the caller keeps the scaled adult).
 */
export function requestStageBody(assets: CharacterAssets, stage: LifeStage): Promise<StageSet | null> {
  const body = stageBodyOf(stage);
  if (!body || assets.style !== 'mpfb') return Promise.resolve(null);
  const have = assets.stages[body];
  if (have) return Promise.resolve(have);
  if (assets.stagesFailed?.has(body)) return Promise.resolve(null);
  const pending = (assets.stagesPending ??= {});
  let p = pending[body];
  if (!p) {
    p = loadStageSet(assets, body).then((set) => { assets.stages[body] = set; delete pending[body]; return set; }).catch((e) => {
      console.warn(`[characters] ${body} bodies unavailable, scaling the adult body instead`, e);
      (assets.stagesFailed ??= new Set()).add(body);
      delete pending[body];
      return null;
    });
    pending[body] = p;
  }
  return p;
}

async function loadStageSet(assets: CharacterAssets, body: StageBody): Promise<StageSet> {
  const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const adult = assets.sets.mpfb ?? assets.frames;
  const make = async (frame: BodyFrame): Promise<[FrameAssets, Map<string, THREE.AnimationClip>]> => {
    const gltf = await loader.loadAsync(`${assets.baseUrl}characters/${stageBodyFile(body, frame)}.glb`);
    const fa = mpfbFrameFromGltf(frame, gltf.scene, `:${body}`);
    return [fa, retargetClips(assets.clips, adult[frame], fa)];
  };
  if (body === 'baby') {
    // one body for both sexes (built on frame b's skeleton)
    const [fa, clips] = await make('b');
    return { frames: { a: fa, b: fa }, clips: { a: clips, b: clips } };
  }
  const [[fa, ca], [fb, cb]] = await Promise.all([make('a'), make('b')]);
  return { frames: { a: fa, b: fb }, clips: { a: ca, b: cb } };
}

/**
 * The adult clips for a stage skeleton. Every bone keeps its rotation tracks (the stage skeleton has the adult's rest rotations and
 * scaled bone lengths); only the translation tracks, which exist for the root and pelvis, are scaled by how much lower the stage's
 * pelvis sits, so children are neither stretched to adult bone lengths nor sink into the floor.
 */
export function retargetClips(clips: Map<string, THREE.AnimationClip>, adult: FrameAssets, stage: FrameAssets): Map<string, THREE.AnimationClip> {
  const ratio = (name: string): number => {
    const a = adult.rootBone.getObjectByName(name), s = stage.rootBone.getObjectByName(name);
    const la = a?.position.length() ?? 0;
    return la > 1e-4 && s ? s.position.length() / la : 0;
  };
  const pelvis = ratio('pelvis') || 1;
  const out = new Map<string, THREE.AnimationClip>();
  for (const [name, clip] of clips) {
    const tracks = clip.tracks.map((tr) => {
      const m = /^(.*)\.position$/.exec(tr.name);
      if (!m) return tr.clone();
      const k = ratio(m[1]!) || pelvis;
      const t = tr.clone();
      for (let i = 0; i < t.values.length; i++) t.values[i] = (t.values[i] as number) * k;
      return t;
    });
    out.set(name, new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }
  return out;
}

/**
 * What draws a person of `stage` with body frame `frame`: the stage's own body when it is loaded (clips scaled to it), else the active
 * style's adult frame scaled uniformly to the stage's height (`scale`, 1 for the adults), with the shared clips.
 */
export function resolveBody(assets: CharacterAssets, frame: BodyFrame, stage: LifeStage): { fa: FrameAssets; clips: Map<string, THREE.AnimationClip>; scale: number; own: boolean } {
  const set = assets.style === 'mpfb' ? stageSet(assets, stage) : null;
  if (set) return { fa: set.frames[frame], clips: set.clips[frame], scale: 1, own: true };
  return { fa: assets.frames[frame], clips: assets.clips, scale: stageFallbackScale(stage), own: false };
}

async function loadFrameSet(base: string, style: CharacterStyle): Promise<Record<BodyFrame, FrameAssets>> {
  if (style === 'mpfb') {
    // meshopt-compressed GLBs; the decoder (a small wasm module) is only fetched when this style is used
    const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const [m, f] = await Promise.all(['mpfb_m', 'mpfb_f'].map((n) => loader.loadAsync(`${base}characters/${n}.glb`)));
    return { a: mpfbFrameFromGltf('a', m!.scene), b: mpfbFrameFromGltf('b', f!.scene) };
  }
  const loader = new GLTFLoader();
  const names = style === 'detailed' ? ['meshy_a', 'meshy_b'] : ['body_a', 'body_b'];
  const [a, b] = await Promise.all(names.map((n) => loader.loadAsync(`${base}characters/${n}.glb`)));
  const make = style === 'detailed' ? meshyFrameFromGltf : frameFromGltf;
  return { a: make('a', a!.scene), b: make('b', b!.scene) };
}

function frameFromGltf(frame: BodyFrame, scene: THREE.Object3D): FrameAssets {
  let mesh: THREE.SkinnedMesh | null = null;
  scene.traverse((o) => { if (!mesh && (o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh; });
  if (!mesh) throw new Error(`body ${frame}: no skinned mesh`);
  const sm = mesh as THREE.SkinnedMesh;
  const skeleton = sm.skeleton;
  const raw = rawFromMesh(frame, sm);
  const template = buildBodyTemplate(raw);
  const rootBone = skeleton.bones.find((bn) => !(bn.parent && (bn.parent as THREE.Bone).isBone)) ?? skeleton.bones[0]!;
  rootBone.removeFromParent();
  rootBone.updateMatrixWorld(true);
  sm.geometry.dispose();
  return {
    frame, key: frame, meshy: null, mpfb: null, raw, template, rootBone,
    boneNames: skeleton.bones.map((bn) => bn.name),
    boneInverses: skeleton.boneInverses.map((m) => m.clone()),
    skinGeometry: toGeometry(template.skinMesh, `skin-${frame}`),
  };
}

/** A Meshy body GLB: skinned mesh bound to the shared skeleton, albedo in the base colour slot, mask in the occlusion slot. */
function meshyFrameFromGltf(frame: BodyFrame, scene: THREE.Object3D): FrameAssets {
  let mesh: THREE.SkinnedMesh | null = null;
  scene.traverse((o) => { if (!mesh && (o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh; });
  if (!mesh) throw new Error(`meshy body ${frame}: no skinned mesh`);
  const sm = mesh as THREE.SkinnedMesh;
  const extras = (sm.userData.meshyBody ?? sm.parent?.userData.meshyBody) as MeshyExtras | undefined;
  const mat = sm.material as THREE.MeshStandardMaterial;
  if (!extras || !mat.map || !mat.aoMap) throw new Error(`meshy body ${frame}: missing extras or textures`);
  const albedo = mat.map, mask = mat.aoMap;
  albedo.colorSpace = THREE.SRGBColorSpace;
  mask.colorSpace = THREE.NoColorSpace;
  for (const t of [albedo, mask]) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; }
  const skeleton = sm.skeleton;
  const raw = rawFromMesh(frame, sm);
  // the scanned surface is the body: no stylisation, no procedural hands, feet or head
  const template = buildBodyTemplate(raw, { stylise: false, skinParts: false });
  const headMap = new HeadMap(extras.head, template.headOrigin);
  template.headMap = headMap;
  // the GLB stores its attributes interleaved: read them through the accessors, not the shared array
  const normals = attributeArray(sm.geometry.getAttribute('normal'), 3);
  const uv = attributeArray(sm.geometry.getAttribute('uv'), 2);
  const skinMesh = buildMeshyMesh({ raw, normals, uv, template, headMap });
  template.skinMesh = skinMesh;
  const rootBone = skeleton.bones.find((bn) => !(bn.parent && (bn.parent as THREE.Bone).isBone)) ?? skeleton.bones[0]!;
  rootBone.removeFromParent();
  rootBone.updateMatrixWorld(true);
  sm.geometry.dispose();
  mat.dispose();
  return {
    frame, key: `${frame}m`, meshy: { albedo, mask, extras }, mpfb: null, raw, template, rootBone,
    boneNames: skeleton.bones.map((bn) => bn.name),
    boneInverses: skeleton.boneInverses.map((m) => m.clone()),
    skinGeometry: toGeometry(skinMesh, `skin-${frame}m`),
  };
}

/**
 * An MPFB body GLB: five skinned primitives (skin, underwear, eyes, brows, lashes) on the shared skeleton with the same morph targets,
 * named in the mesh extras. The skin primitive is the body (template, garments and hair are fitted to it); the others are kept as
 * shared geometry that every CharacterView draws as extra meshes on its own skeleton.
 */
function mpfbFrameFromGltf(frame: BodyFrame, scene: THREE.Object3D, keySuffix = ''): FrameAssets {
  const meshes: Partial<Record<MpfbPart, THREE.SkinnedMesh>> = {};
  let extras: MpfbExtras | undefined;
  scene.traverse((o) => {
    if (o.userData?.mpfbBody) extras = o.userData.mpfbBody as MpfbExtras;
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh) return;
    const part = ((sm.material as THREE.Material).name ?? '').replace(/^mpfb_/, '') as MpfbPart;
    if ((MPFB_PARTS as readonly string[]).includes(part)) meshes[part] = sm;
  });
  const skinMesh = meshes.skin;
  if (!skinMesh || !extras) throw new Error(`mpfb body ${frame}: missing skin primitive or extras`);
  const mats = Object.fromEntries(MPFB_PARTS.map((p) => [p, meshes[p]?.material as THREE.MeshStandardMaterial | undefined])) as Record<MpfbPart, THREE.MeshStandardMaterial | undefined>;
  const skinMap = mats.skin?.map;
  if (!skinMap) throw new Error(`mpfb body ${frame}: no skin texture`);
  const maps: MpfbFrame['maps'] = {};
  for (const p of ['eyes', 'iris', 'brows', 'lashes'] as const) { const t = mats[p]?.map; if (t) maps[p] = t; }
  for (const t of [skinMap, ...Object.values(maps)]) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; }
  const prims = Object.fromEntries(MPFB_PARTS.filter((p) => meshes[p]).map((p) => [p, mpfbPrim(meshes[p]!)])) as Partial<Record<MpfbPart, MpfbPrim>>;
  const skeleton = skinMesh.skeleton;
  const raw = rawFromMesh(frame, skinMesh);
  const { template, meshes: built, source } = assembleMpfb(raw, prims, extras);
  const parts: MpfbFrame['parts'] = {};
  for (const p of MPFB_PARTS) if (p !== 'skin' && built[p]) parts[p] = toGeometry(built[p]!, `${p}-${frame}p`);
  const rootBone = skeleton.bones.find((bn) => !(bn.parent && (bn.parent as THREE.Bone).isBone)) ?? skeleton.bones[0]!;
  rootBone.removeFromParent();
  rootBone.updateMatrixWorld(true);
  const underwear = mats.underwear?.color.clone() ?? new THREE.Color('#d9d3c9');
  for (const sm of Object.values(meshes)) { sm.geometry.dispose(); (sm.material as THREE.Material).dispose(); }
  return {
    frame, key: `${frame}p${keySuffix}`, meshy: null, mpfb: { extras, sex: extras.sex, skinMap, maps, parts, underwear, morphNames: source.ids }, raw, template, rootBone,
    boneNames: skeleton.bones.map((bn) => bn.name),
    boneInverses: skeleton.boneInverses.map((m) => m.clone()),
    skinGeometry: toGeometry(built.skin!, `skin-${frame}p`),
  };
}

/** A primitive of a loaded MPFB GLB as plain arrays (morph targets by name, relative). */
function mpfbPrim(sm: THREE.SkinnedMesh): MpfbPrim {
  const g = sm.geometry;
  const raw = rawFromMesh('a', sm);
  const targets: Record<string, Float32Array> = {};
  const dict = sm.morphTargetDictionary ?? {};
  for (const [name, i] of Object.entries(dict)) {
    const a = g.morphAttributes.position?.[i];
    if (a) targets[name] = attributeArray(a as THREE.BufferAttribute, 3);
  }
  const uv = g.getAttribute('uv');
  // the `_LIPS` vertex attribute of the skin: three.js's GLTFLoader names it `_lips`
  const lipsAttr = g.getAttribute('_lips');
  let lips: Float32Array | null = null;
  if (lipsAttr) { lips = new Float32Array(lipsAttr.count); for (let i = 0; i < lips.length; i++) lips[i] = lipsAttr.getX(i); }
  return {
    positions: raw.positions, normals: attributeArray(g.getAttribute('normal'), 3), uv: uv ? attributeArray(uv, 2) : null, lips,
    joints: raw.joints, weights: raw.weights, index: raw.index, targets,
  };
}

export function attributeArray(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size: 2 | 3): Float32Array {
  const out = new Float32Array(a.count * size);
  for (let i = 0; i < a.count; i++) {
    out[i * size] = a.getX(i); out[i * size + 1] = a.getY(i);
    if (size === 3) out[i * 3 + 2] = a.getZ(i);
  }
  return out;
}

/** Extracts positions, skin and bind skeleton facts from a loaded body mesh. */
export function rawFromMesh(frame: BodyFrame, sm: THREE.SkinnedMesh): RawBody {
  const g = sm.geometry;
  const pos = g.getAttribute('position');
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  const n = pos.count;
  const positions = new Float32Array(n * 3);
  const joints = new Uint16Array(n * 4);
  const weights = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = pos.getX(i); positions[i * 3 + 1] = pos.getY(i); positions[i * 3 + 2] = pos.getZ(i);
    joints[i * 4] = si.getX(i); joints[i * 4 + 1] = si.getY(i); joints[i * 4 + 2] = si.getZ(i); joints[i * 4 + 3] = si.getW(i);
    const w = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
    const s = w[0]! + w[1]! + w[2]! + w[3]! || 1;
    for (let k = 0; k < 4; k++) weights[i * 4 + k] = w[k]! / s;
  }
  const idx = g.getIndex();
  const index = new Uint32Array(idx ? idx.count : n);
  for (let i = 0; i < index.length; i++) index[i] = idx ? idx.getX(i) : i;
  const bones = sm.skeleton.bones;
  const bonePos: Vec3[] = sm.skeleton.boneInverses.map((inv) => {
    const m = inv.clone().invert();
    return [m.elements[12]!, m.elements[13]!, m.elements[14]!];
  });
  const boneParent = bones.map((bn) => bones.indexOf(bn.parent as THREE.Bone));
  return { frame, positions, joints, weights, index, boneNames: bones.map((bn) => bn.name), bonePos, boneParent };
}

/** A per-character copy of a frame's bind skeleton. */
export function cloneSkeleton(fa: FrameAssets): { root: THREE.Bone; skeleton: THREE.Skeleton; byName: Map<string, THREE.Bone> } {
  const root = fa.rootBone.clone(true);
  const byName = new Map<string, THREE.Bone>();
  root.traverse((o) => { if ((o as THREE.Bone).isBone) byName.set(o.name, o as THREE.Bone); });
  const bones = fa.boneNames.map((nm) => {
    const bn = byName.get(nm);
    if (!bn) throw new Error(`bone ${nm} missing in clone`);
    return bn;
  });
  return { root, skeleton: new THREE.Skeleton(bones, fa.boneInverses), byName };
}

/**
 * Loads `${baseUrl}characters/${asset}` (an AI hairstyle GLB, see aiHair.ts) once. Resolves to null when it cannot be
 * loaded (the character then keeps the procedural look in the style's own `build`).
 */
export function loadAiHair(assets: CharacterAssets, id: string, asset: string): Promise<AiHairAsset | null> {
  const loaded = (assets.aiHair ??= new Map()).get(id);
  if (loaded) return Promise.resolve(loaded);
  const pending = (assets.aiHairPending ??= new Map());
  let p = pending.get(id);
  if (!p) {
    p = new GLTFLoader().loadAsync(`${assets.baseUrl}characters/${asset}`).then((gltf) => {
      const a = aiHairFromScene(id, gltf.scene);
      assets.aiHair!.set(id, a);
      return a;
    }).catch((e) => {
      console.warn(`[characters] hairstyle ${id} unavailable, using its procedural fallback`, e);
      return null;
    });
    pending.set(id, p);
  }
  return p;
}

/** Reads a hair GLB scene into mesh data and its tint map. */
export function aiHairFromScene(id: string, scene: THREE.Object3D): AiHairAsset {
  let mesh: THREE.Mesh | null = null;
  scene.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
  if (!mesh) throw new Error(`hair ${id}: no mesh`);
  const g = (mesh as THREE.Mesh).geometry;
  const mat = (mesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
  const idx = g.getIndex();
  if (!idx || !mat.map) throw new Error(`hair ${id}: missing index or tint map`);
  const color = g.getAttribute('color');
  const n = g.getAttribute('position').count;
  const shade = new Float32Array(n);
  for (let i = 0; i < n; i++) shade[i] = color ? color.getX(i) : 1;
  const index = new Uint32Array(idx.count);
  for (let i = 0; i < index.length; i++) index[i] = idx.getX(i);
  const map = mat.map;
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = 4;
  const data: AiHairData = { id, positions: attributeArray(g.getAttribute('position'), 3), normals: attributeArray(g.getAttribute('normal'), 3), uv: attributeArray(g.getAttribute('uv'), 2), shade, index };
  g.dispose();
  mat.dispose();
  return { data, map };
}

/** Returns a cached generated geometry or builds and caches it. */
export function cachedGeometry(assets: CharacterAssets, key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = assets.cache.get(key);
  if (!g) { g = build(); assets.cache.set(key, g); }
  return g;
}

/** Frees every shared GPU resource (call when no CharacterView remains). */
export function disposeCharacterAssets(assets: CharacterAssets): void {
  for (const g of assets.cache.values()) g.dispose();
  assets.cache.clear();
  for (const a of assets.aiHair?.values() ?? []) a.map.dispose();
  assets.aiHair?.clear();
  assets.aiHairPending?.clear();
  const frameSets: Array<Record<BodyFrame, FrameAssets>> = [...Object.values(assets.sets), ...Object.values(assets.stages).map((st) => st.frames)];
  for (const set of frameSets) {
    for (const f of new Set(Object.values(set))) {
      f.skinGeometry.dispose();
      f.meshy?.albedo.dispose();
      f.meshy?.mask.dispose();
      if (f.mpfb) {
        f.mpfb.skinMap.dispose();
        for (const t of Object.values(f.mpfb.maps)) t.dispose();
        for (const g of Object.values(f.mpfb.parts)) g.dispose();
      }
    }
  }
}
