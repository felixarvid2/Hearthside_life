// Runtime data of a Meshy body: the per-vertex attributes the skin shader needs (body part and coverage axis for the
// garment push-in, head-local face coordinates for blush, freckles and stubble) and the morph targets, evaluated from
// the same displacement fields the garments use (bodyShape.ts, headShape.ts) so clothing follows the body exactly.
// The build step (tools/build-meshy-bodies.mts) writes the geometry; this module derives the rest at load. Pure.

import { BODY_PARAM_IDS, bodyDeltas } from './bodyShape';
import type { HeadMap, MeshyHeadInfo } from './headMap';
import { HEAD_OFFSET, HEAD_SCALE, HEAD_SCULPT_IDS, headDeltas } from './headShape';
import type { MeshData } from './meshData';
import { emptyMesh } from './meshData';
import type { RawBody, Skin, Vec3 } from './rig';
import { dominantBone, smoothstep } from './rig';
import type { BodyTemplate } from './template';
import { PART, SKIN_MORPHS } from './template';

/** Stored in the extras of the body node of meshy_a.glb / meshy_b.glb. */
export interface MeshyExtras {
  version: 1;
  frame: 'a' | 'b';
  /** Mean linear colour of the baked skin and of the baked tank top / shorts. */
  skinMean: [number, number, number];
  clothMean: [number, number, number];
  /** Bind-space height separating the iris (below) from the brow (above) in mask channel B. */
  splitY: number;
  head: MeshyHeadInfo;
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
}

/** The skin MeshData of a Meshy body: attributes, body morphs (all 10 sliders) and face sculpt morphs. */
export function buildMeshyMesh(inp: MeshyBuildInput): MeshData {
  const { raw, normals, uv, template: t, headMap } = inp;
  const n = raw.positions.length / 3;
  const m = emptyMesh(SKIN_ATTRS_MESHY, SKIN_MORPHS);
  const chinY = headMap.chinM;
  const O = t.headOrigin;
  const morphNames = [...BODY_PARAM_IDS, ...HEAD_SCULPT_IDS] as string[];
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
    const body = bodyDeltas(t.ctx, p, skin) as unknown as Record<string, Vec3>;
    const head = hw > 0 ? (headDeltas(local, theta) as unknown as Record<string, Vec3>) : null;
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
