// Runtime data of a Meshy body: the per-vertex attributes the skin shader needs (body part and coverage axis for the
// garment push-in, head-local face coordinates for blush, freckles and stubble) and the morph targets, evaluated from
// the same displacement fields the garments use (bodyShape.ts, headShape.ts) so clothing follows the body exactly.
// The build step (tools/build-meshy-bodies.mts) writes the geometry; this module derives the rest at load. Pure.

import { BODY_PARAM_IDS, morphDeltas } from './bodyShape';
import type { HeadMap, MeshyHeadInfo } from './headMap';
import { sampleRadius } from './headMap';
import { EAR, FACE_LAYOUT as FL, HEAD_OFFSET, HEAD_SCALE, HEAD_SCULPT_IDS, headDeltas } from './headShape';
import type { MeshData } from './meshData';
import { emptyMesh } from './meshData';
import type { RawBody, Skin, Vec3 } from './rig';
import { dominantBone, smoothstep } from './rig';
import type { BodyTemplate } from './template';
import { PART } from './template';

/** Stored in the extras of the body node of meshy_a.glb / meshy_b.glb. */
export interface MeshyExtras {
  version: 1;
  frame: 'a' | 'b';
  /** Mean linear colour of the baked skin; luminance of the baked tank top / shorts ([dark, light, split], see meshyBake). */
  skinMean: [number, number, number];
  clothLum: [number, number, number];
  /** Bind-space height separating the iris (below) from the brow (above) in mask channel B. */
  splitY: number;
  head: MeshyHeadInfo;
}

/**
 * Creator face parameters the procedural skin paints (eye and brow placement). The baked face cannot be repainted, so
 * on a Meshy body they move the vertices under the baked eyes and brows instead (the texture follows the surface).
 */
export const PAINT_MORPH_IDS = ['eyeSize', 'eyeSpacing', 'eyeTilt', 'eyeHeight', 'browHeight', 'browTilt'] as const;

/** Displacements (head-local metres, parametric face layout) of the eye/brow parameters at value +1 for a face point. */
export function paintDeltas(p: Vec3): Record<(typeof PAINT_MORPH_IDS)[number], Vec3> {
  const front = smoothstep(0.03, 0.07, p[2]);
  const ax = Math.abs(p[0]), sx = Math.sign(p[0]);
  const ge = front * Math.exp(-(((ax - FL.eyeX) / 0.0215) ** 2 + ((p[1] - FL.eyeY) / 0.016) ** 2) / 2);
  const bx = (FL.browX0 + FL.browX1) / 2;
  const gb = front * Math.exp(-(((ax - bx) / 0.026) ** 2 + ((p[1] - FL.browY) / 0.0105) ** 2) / 2);
  const dx = p[0] - sx * FL.eyeX, dy = p[1] - FL.eyeY;
  return {
    eyeSize: [dx * 0.22 * ge, dy * 0.28 * ge, 0],
    eyeSpacing: [sx * 0.0035 * ge, 0, 0],
    eyeTilt: [0, 0.14 * (ax - FL.eyeX) * ge, 0],
    eyeHeight: [0, 0.004 * (ge + gb), 0],
    browHeight: [0, 0.0045 * gb, 0],
    browTilt: [0, 0.004 * ((ax - FL.browX0) / (FL.browX1 - FL.browX0) - 0.3) * gb, 0],
  };
}

/** Ear growth (parameter earSize at +1): the ears of the scanned head stick out of the skull radius; they scale about the ear anchor. */
function earDelta(p: Vec3, local: Vec3, table: MeshyHeadInfo['table']): Vec3 {
  const out = Math.hypot(p[0] - table.axisX, p[2] - table.axisZ) - sampleRadius(table, Math.atan2(p[0] - table.axisX, p[2] - table.axisZ), p[1]);
  // only the sides of the head: the nose and the corners of the mouth also stick out of the skull radius on some heads
  const w = smoothstep(0.004, 0.012, out) * smoothstep(0.02, 0.05, Math.abs(local[0])) * (1 - smoothstep(0.015, 0.04, local[2]));
  if (w <= 0) return [0, 0, 0];
  const a: Vec3 = [Math.sign(local[0]) * (EAR.x - 0.004), EAR.y, EAR.z];
  return [(local[0] - a[0]) * 0.24 * w, (local[1] - a[1]) * 0.24 * w, (local[2] - a[2]) * 0.24 * w];
}

export const SKIN_ATTRS_MESHY = { aInfo: 4, aFace: 3, uv: 2 };

const FEET = /^(foot|ball)_/;
const HAND = /^(hand|thumb|index|middle|ring|pinky)/;
const ARM = /^(upperarm|lowerarm)_/;
const LEG = /^(thigh|calf)_/;

/** Part id and coverage axis of a vertex (see PART and the skin shader's push-in). */
export function partOf(boneName: string, y: number, x: number, crotchY: number): { part: number; s: number } {
  if (boneName === 'Head') return { part: PART.head, s: y };
  if (FEET.test(boneName)) return { part: PART.foot, s: y };
  if (HAND.test(boneName)) return { part: PART.hand, s: Math.abs(x) };
  if (ARM.test(boneName)) return { part: PART.arm, s: Math.abs(x) };
  if (LEG.test(boneName) && y < crotchY) return { part: PART.leg, s: y };
  return { part: PART.torso, s: y };
}

/** Where the face-paint coordinates of a Meshy vertex are defined: the head surface above the chin. */
export function headWeight(y: number, x: number, chinY: number): number {
  return smoothstep(chinY - 0.03, chinY + 0.02, y) * (Math.abs(x) < 0.13 ? 1 : 0);
}

export interface MeshyBuildInput {
  raw: RawBody;
  normals: Float32Array;
  uv: Float32Array;
  template: BodyTemplate;
  headMap: HeadMap;
  /**
   * MPFB bodies: the body morph ids and where their deltas come from for vertex i (its own authored targets). Without these the
   * displacement fields of `template.ctx` provide BODY_PARAM_IDS.
   */
  body?: { ids: readonly string[]; at: (i: number, p: Vec3, skin: Skin) => Record<string, Vec3> };
}

/** The skin MeshData of a Meshy body: attributes, body morphs (all 10 sliders) and face sculpt morphs. */
export function buildMeshyMesh(inp: MeshyBuildInput): MeshData {
  const { raw, normals, uv, template: t, headMap } = inp;
  const n = raw.positions.length / 3;
  const bodyIds = inp.body?.ids ?? BODY_PARAM_IDS;
  const m = emptyMesh(SKIN_ATTRS_MESHY, [...bodyIds, ...HEAD_SCULPT_IDS, ...PAINT_MORPH_IDS]);
  const chinY = headMap.chinM;
  const O = t.headOrigin;
  const morphNames = [...bodyIds, ...HEAD_SCULPT_IDS, ...PAINT_MORPH_IDS] as string[];
  for (let i = 0; i < n; i++) {
    const p: Vec3 = [raw.positions[i * 3] as number, raw.positions[i * 3 + 1] as number, raw.positions[i * 3 + 2] as number];
    const skin: Skin = {
      j: [raw.joints[i * 4] as number, raw.joints[i * 4 + 1] as number, raw.joints[i * 4 + 2] as number, raw.joints[i * 4 + 3] as number],
      w: [raw.weights[i * 4] as number, raw.weights[i * 4 + 1] as number, raw.weights[i * 4 + 2] as number, raw.weights[i * 4 + 3] as number],
    };
    m.positions.push(p[0], p[1], p[2]);
    m.normals.push(normals[i * 3] as number, normals[i * 3 + 1] as number, normals[i * 3 + 2] as number);
    m.skinIndex.push(...skin.j);
    m.skinWeight.push(...skin.w);
    const nm = raw.boneNames[dominantBone(raw, i)] as string;
    const { part, s } = partOf(nm, p[1], p[0], t.lm.crotchY);
    m.attrs.aInfo!.data.push(part, s, normals[i * 3 + 2] as number, Math.sign(p[0]));
    m.attrs.uv!.data.push(uv[i * 2] as number, uv[i * 2 + 1] as number);
    const hw = headWeight(p[1], p[0], chinY);
    let local: Vec3 = [0, 0, 0];
    let theta = 0;
    if (hw > 0) {
      const c = headMap.toClassic(p);
      local = [(c[0] - O[0] - HEAD_OFFSET[0]) / HEAD_SCALE, (c[1] - O[1] - HEAD_OFFSET[1]) / HEAD_SCALE, (c[2] - O[2] - HEAD_OFFSET[2]) / HEAD_SCALE];
      theta = Math.atan2(local[0], local[2]);
    }
    m.attrs.aFace!.data.push(local[0], local[1], local[2]);
    const body = inp.body ? inp.body.at(i, p, skin) : morphDeltas(t.ctx, p, skin);
    const head = hw > 0 ? ({ ...headDeltas(local, theta), ...paintDeltas(local), earSize: earDelta(p, local, headMap.info.table) } as unknown as Record<string, Vec3>) : null;
    for (const id of morphNames) {
      const arr = m.morphs[id] as number[];
      const d = body[id] ?? (head ? head[id] : null);
      if (!d) { arr.push(0, 0, 0); continue; }
      const k = body[id] ? 1 : HEAD_SCALE * hw;
      arr.push(d[0] * k, d[1] * k, d[2] * k);
    }
  }
  for (const k of raw.index) m.indices.push(k);
  return m;
}
