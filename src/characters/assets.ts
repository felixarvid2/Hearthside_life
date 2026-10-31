// Loading of the shared character assets: the two body frames (fitted into smooth templates), their bind
// skeletons, the animation clips, and a cache of generated geometry shared by every CharacterView.
// Shared assets are owned here: CharacterView.dispose() never frees them; disposeCharacterAssets() does.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BodyFrame } from '../core/types';
import type { RawBody, Vec3 } from './rig';
import type { BodyTemplate } from './template';
import { buildBodyTemplate } from './template';
import { toGeometry } from './geometry';

export interface FrameAssets {
  frame: BodyFrame;
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
  frames: Record<BodyFrame, FrameAssets>;
  /** Animation clips by source name (e.g. 'Idle_Loop'). */
  clips: Map<string, THREE.AnimationClip>;
  /** Generated geometry shared across characters, keyed by frame/style id. */
  cache: Map<string, THREE.BufferGeometry>;
}

/** Loads bodies and clips from `${baseUrl}characters/...` and fits both body templates. */
export async function loadCharacterAssets(baseUrl = './assets/'): Promise<CharacterAssets> {
  const loader = new GLTFLoader();
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const [a, b, an1, an2] = await Promise.all(
    ['body_a', 'body_b', 'anims_1', 'anims_2'].map((n) => loader.loadAsync(`${base}characters/${n}.glb`)),
  );
  const clips = new Map<string, THREE.AnimationClip>();
  for (const g of [an1!, an2!]) for (const clip of g.animations) clips.set(clip.name, clip);
  const frames = {
    a: frameFromGltf('a', a!.scene),
    b: frameFromGltf('b', b!.scene),
  } as Record<BodyFrame, FrameAssets>;
  return { frames, clips, cache: new Map() };
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
    frame, raw, template, rootBone,
    boneNames: skeleton.bones.map((bn) => bn.name),
    boneInverses: skeleton.boneInverses.map((m) => m.clone()),
    skinGeometry: toGeometry(template.skinMesh, `skin-${frame}`),
  };
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
  for (const f of Object.values(assets.frames)) f.skinGeometry.dispose();
}
