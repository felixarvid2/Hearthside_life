// Shared skeleton facts and the raw (as-loaded) body data used by the procedural generators.
// Pure module: no three.js, so fitting, skinning transfer and shape fields can be tested in Node.
//
// Bind space = the bodies' T-pose model space: metres, feet at y = 0, facing +z, character's LEFT side at +x,
// arms along +-x. Bone names follow the shared 65-joint skeleton of body_a/body_b.

import type { BodyFrame } from '../core/types';

export type Vec3 = [number, number, number];

/** Bone names used by the generators. */
export const BONE = {
  root: 'root', pelvis: 'pelvis', spine1: 'spine_01', spine2: 'spine_02', spine3: 'spine_03', neck: 'neck_01', head: 'Head',
  clavicleL: 'clavicle_l', clavicleR: 'clavicle_r', upperArmL: 'upperarm_l', upperArmR: 'upperarm_r',
  lowerArmL: 'lowerarm_l', lowerArmR: 'lowerarm_r', handL: 'hand_l', handR: 'hand_r',
  thighL: 'thigh_l', thighR: 'thigh_r', calfL: 'calf_l', calfR: 'calf_r', footL: 'foot_l', footR: 'foot_r',
  ballL: 'ball_l', ballR: 'ball_r',
} as const;

/** Mesh, skin and bind skeleton of one body frame as loaded from its GLB. */
export interface RawBody {
  frame: BodyFrame;
  /** Bind positions, n * 3. */
  positions: Float32Array;
  /** Skeleton bone indices, n * 4. */
  joints: Uint16Array;
  /** Skin weights, n * 4. */
  weights: Float32Array;
  /** Triangle indices. */
  index: Uint32Array;
  /** Bone names in skeleton order (index = joint index). */
  boneNames: string[];
  /** Bind-pose world position of every bone (same order). */
  bonePos: Vec3[];
  /** Bone parent index (-1 for the root). */
  boneParent: number[];
}

export function boneIndex(raw: Pick<RawBody, 'boneNames'>, name: string): number {
  const i = raw.boneNames.indexOf(name);
  if (i < 0) throw new Error(`bone ${name} missing`);
  return i;
}

export function bonePosition(raw: Pick<RawBody, 'boneNames' | 'bonePos'>, name: string): Vec3 {
  return raw.bonePos[boneIndex(raw, name)] as Vec3;
}

/** Index of the bone with the largest weight for vertex v. */
export function dominantBone(raw: Pick<RawBody, 'joints' | 'weights'>, v: number): number {
  let best = 0;
  let bw = -1;
  for (let k = 0; k < 4; k++) {
    const w = raw.weights[v * 4 + k] ?? 0;
    if (w > bw) { bw = w; best = raw.joints[v * 4 + k] ?? 0; }
  }
  return best;
}

/** Swaps a bone name to the other side ('_l' <-> '_r'); names without a side are returned unchanged. */
export function mirrorBoneName(name: string): string {
  if (name.endsWith('_l')) return name.slice(0, -2) + '_r';
  if (name.endsWith('_r')) return name.slice(0, -2) + '_l';
  return name;
}

/** Skin influences of one vertex: up to 4 bone indices with weights summing to 1. */
export interface Skin { j: [number, number, number, number]; w: [number, number, number, number] }

export function rigidSkin(bone: number): Skin { return { j: [bone, 0, 0, 0], w: [1, 0, 0, 0] }; }

/** Normalises an accumulated bone -> weight map into the 4 strongest influences. */
export function skinFromMap(map: Map<number, number>): Skin {
  const top = [...map.entries()].filter(([, w]) => w > 1e-6).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
  const j: Skin['j'] = [0, 0, 0, 0];
  const w: Skin['w'] = [0, 0, 0, 0];
  top.forEach(([b, x], i) => { j[i] = b; w[i] = x / sum; });
  if (top.length === 0) w[0] = 1;
  return { j, w };
}

/** Linear blend of skins (weights renormalised to the 4 strongest bones). */
export function blendSkins(parts: Array<{ skin: Skin; f: number }>): Skin {
  const map = new Map<number, number>();
  for (const { skin, f } of parts) {
    if (f <= 0) continue;
    for (let k = 0; k < 4; k++) {
      const w = (skin.w[k] as number) * f;
      const b = skin.j[k] as number;
      if (w > 0) map.set(b, (map.get(b) ?? 0) + w);
    }
  }
  return skinFromMap(map);
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const gauss = (x: number, sigma: number) => Math.exp(-(x * x) / (2 * sigma * sigma));
