// Loading of the shared character assets: the two body frames (fitted into smooth templates), their bind
// skeletons, the animation clips, and a cache of generated geometry shared by every CharacterView.
// Shared assets are owned here: CharacterView.dispose() never frees them; disposeCharacterAssets() does.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BodyFrame } from '../core/types';
import type { AiHairData } from './aiHair';
import { HeadMap } from './headMap';
import { buildMeshyMesh } from './meshyBody';
import type { MeshyExtras } from './meshyBody';
import type { RawBody, Vec3 } from './rig';
import type { BodyTemplate } from './template';
import { buildBodyTemplate } from './template';
import { toGeometry } from './geometry';

/** 'detailed': the scanned Meshy bodies (public/assets/characters/meshy_*.glb); 'classic': the procedural bodies. */
export type CharacterStyle = 'detailed' | 'classic';

/** Textures and build data of a Meshy body frame. */
export interface MeshyFrame {
  albedo: THREE.Texture;
  mask: THREE.Texture;
  extras: MeshyExtras;
}

export interface FrameAssets {
  frame: BodyFrame;
  /** Cache key of everything generated for this frame ('a', 'b' for classic bodies; 'am', 'bm' for Meshy bodies). */
  key: string;
  /** Present for Meshy bodies: the skin shader recolours its albedo through the mask. */
  meshy: MeshyFrame | null;
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
  const assets: CharacterAssets = { frames: null as unknown as Record<BodyFrame, FrameAssets>, style, sets: {}, baseUrl: base, clips, cache: new Map() };
  await setCharacterStyle(assets, style);
  return assets;
}

/**
 * Switches the active frame set, loading it first when needed. Returns the style in effect: a failed load of the
 * detailed bodies keeps (or loads) the classic ones. Views must be rebuilt after a change (CharacterView.refreshStyle).
 */
export async function setCharacterStyle(assets: CharacterAssets, style: CharacterStyle): Promise<CharacterStyle> {
  let want = style;
  if (!assets.sets[want]) {
    try {
      assets.sets[want] = await loadFrameSet(assets.baseUrl, want);
    } catch (e) {
      if (want === 'classic') throw e;
      console.warn('[characters] detailed bodies unavailable, using the classic bodies', e);
      want = 'classic';
      assets.sets.classic ??= await loadFrameSet(assets.baseUrl, 'classic');
    }
  }
  assets.style = want;
  assets.frames = assets.sets[want]!;
  return want;
}

async function loadFrameSet(base: string, style: CharacterStyle): Promise<Record<BodyFrame, FrameAssets>> {
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
    frame, key: frame, meshy: null, raw, template, rootBone,
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
    frame, key: `${frame}m`, meshy: { albedo, mask, extras }, raw, template, rootBone,
    boneNames: skeleton.bones.map((bn) => bn.name),
    boneInverses: skeleton.boneInverses.map((m) => m.clone()),
    skinGeometry: toGeometry(skinMesh, `skin-${frame}m`),
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
  for (const set of Object.values(assets.sets)) {
    for (const f of Object.values(set)) {
      f.skinGeometry.dispose();
      f.meshy?.albedo.dispose();
      f.meshy?.mask.dispose();
    }
  }
}
