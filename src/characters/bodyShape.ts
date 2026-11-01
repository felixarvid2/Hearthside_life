// Body shape controls as displacement fields. Every BODY_PARAMS id maps to a field evaluated per vertex from
// its bind position and skin weights: Delta(p) = sum over influencing bones of weight * field(bone, p).
// Because the field only depends on position and skin, the same function produces matching morph targets
// for the body, every garment, long hair and accessories, so clothing keeps fitting when the body changes.
// Pure module. Ranges: every value is -1..1 (see clampBodyParams); at +-1 no displacement exceeds about 4 cm.

import type { ParamDef } from '../content/types';
import type { RawBody, Skin, Vec3 } from './rig';
import { clamp, gauss, smoothstep } from './rig';

/** Body heights (bind space, metres) used to localise the fields. */
export interface Landmarks {
  crotchY: number;
  hipY: number;
  bellyY: number;
  waistY: number;
  chestY: number;
  shoulderY: number;
  neckBaseY: number;
  headY: number;
  /** Arm tube start (x of the shoulder joint region), elbow and wrist x for the left arm. */
  armStartX: number;
  elbowX: number;
  wristX: number;
  kneeY: number;
  ankleY: number;
  /** Mean |x| of the foot (shoe details). */
  footX: number;
}

export const BODY_PARAM_IDS = ['build', 'muscle', 'shoulders', 'chest', 'waist', 'belly', 'hips', 'arms', 'legs', 'neck'] as const;
export type BodyParamId = (typeof BODY_PARAM_IDS)[number];

interface Seg { a: Vec3; dir: Vec3; len: number }

/** Precomputed bone segments (bone -> its main child) and landmarks for one frame. */
export interface ShapeContext {
  boneNames: string[];
  segs: Seg[];
  lm: Landmarks;
}

const CHILD: Record<string, string> = {
  pelvis: 'spine_01', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck_01', neck_01: 'Head',
  clavicle_l: 'upperarm_l', upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', hand_l: 'middle_01_l',
  clavicle_r: 'upperarm_r', upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r', hand_r: 'middle_01_r',
  thigh_l: 'calf_l', calf_l: 'foot_l', foot_l: 'ball_l', thigh_r: 'calf_r', calf_r: 'foot_r', foot_r: 'ball_r',
};

export function shapeContext(raw: Pick<RawBody, 'boneNames' | 'bonePos'>, lm: Landmarks): ShapeContext {
  const segs: Seg[] = raw.boneNames.map((name, i) => {
    const a = raw.bonePos[i] as Vec3;
    const childName = CHILD[name];
    let b: Vec3 = name === 'Head' ? [a[0], a[1] + 0.25, a[2]] : [a[0], a[1] + 0.01, a[2]];
    if (childName) {
      const ci = raw.boneNames.indexOf(childName);
      if (ci >= 0) b = raw.bonePos[ci] as Vec3;
    }
    const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(d[0], d[1], d[2]) || 1e-6;
    return { a, dir: [d[0] / len, d[1] / len, d[2] / len], len };
  });
  return { boneNames: [...raw.boneNames], segs, lm };
}

type FieldFn = (bone: string, p: Vec3, t: number, q: Vec3, lm: Landmarks) => Vec3 | null;

const scaleQ = (q: Vec3, k: number): Vec3 => [q[0] * k, q[1] * k, q[2] * k];
const isTorso = (b: string) => b === 'pelvis' || b === 'spine_01' || b === 'spine_02' || b === 'spine_03';
const base = (b: string) => b.replace(/_[lr]$/, '');
/** 1 on the front of the torso (q pointing to +z), 0 on the back. */
const front = (q: Vec3) => smoothstep(-0.1, 0.7, q[2] / (Math.hypot(q[0], q[2]) || 1));

const FIELDS: Record<BodyParamId, FieldFn> = {
  build(bone, p, t, q, lm) {
    const b = base(bone);
    if (isTorso(bone)) {
      const k = 0.115 + 0.04 * gauss(p[1] - lm.bellyY, 0.09);
      const d = scaleQ([q[0], 0, q[2]], k);
      d[2] += 0.018 * front(q) * gauss(p[1] - lm.bellyY, 0.08);
      return d;
    }
    if (b === 'clavicle') return scaleQ(q, 0.08);
    if (b === 'neck_01') return scaleQ(q, 0.08);
    if (b === 'upperarm') return scaleQ(q, 0.13);
    if (b === 'lowerarm') return scaleQ(q, 0.1 * (1 - 0.5 * clamp(t, 0, 1)));
    if (b === 'thigh') return scaleQ(q, 0.14 * (1 - 0.3 * clamp(t, 0, 1)));
    if (b === 'calf') return scaleQ(q, 0.1 * (1 - 0.6 * clamp(t, 0, 1)));
    return null;
  },
  muscle(bone, p, t, q, lm) {
    const b = base(bone);
    if (b === 'upperarm') return scaleQ(q, 0.14 * gauss(t - 0.45, 0.25));
    if (b === 'lowerarm') return scaleQ(q, 0.09 * gauss(t - 0.25, 0.25));
    if (b === 'clavicle') return scaleQ(q, 0.1);
    if (bone === 'spine_03' || bone === 'spine_02') {
      const d = scaleQ([q[0], 0, q[2]], 0.045 * gauss(p[1] - lm.chestY, 0.1));
      d[2] += 0.01 * front(q) * gauss(p[1] - lm.chestY, 0.06);
      return d;
    }
    if (b === 'thigh') return scaleQ(q, 0.08 * gauss(t - 0.35, 0.3));
    if (b === 'calf') return scaleQ(q, 0.1 * gauss(t - 0.3, 0.2));
    if (b === 'neck_01') return scaleQ(q, 0.08);
    return null;
  },
  shoulders(bone, p, t, _q, lm) {
    const b = base(bone);
    const sx = Math.sign(p[0]);
    const band = smoothstep(lm.chestY - 0.1, lm.shoulderY - 0.02, p[1]);
    if (isTorso(bone) || b === 'clavicle' || b === 'neck_01') {
      return [sx * 0.026 * smoothstep(0.04, 0.17, Math.abs(p[0])) * band, 0.006 * band * smoothstep(0.06, 0.16, Math.abs(p[0])), 0];
    }
    if (b === 'upperarm') { const f = (1 - clamp(t, 0, 1)) ** 2; return [sx * 0.026 * f, 0.006 * f, 0]; }
    return null;
  },
  chest(bone, p, _t, q, lm) {
    if (bone !== 'spine_03' && bone !== 'spine_02' && base(bone) !== 'clavicle') return null;
    const g = gauss(p[1] - lm.chestY, 0.065);
    const lobes = gauss(Math.abs(p[0]) - 0.075, 0.05);
    const f = front(q);
    return [Math.sign(p[0]) * 0.006 * g * f, -0.004 * g * f * lobes, 0.032 * g * f * lobes + 0.006 * g * f];
  },
  waist(bone, p, _t, q, lm) {
    if (!isTorso(bone)) return null;
    return scaleQ([q[0], 0, q[2]], 0.15 * gauss(p[1] - lm.waistY, 0.07));
  },
  belly(bone, p, _t, q, lm) {
    if (!isTorso(bone)) return null;
    const g = gauss(p[1] - lm.bellyY, 0.075) * gauss(p[0], 0.1);
    const f = front(q) ** 1.5;
    return [0, -0.006 * g * f, 0.045 * g * f + 0.006 * g];
  },
  hips(bone, p, t, q, lm) {
    const b = base(bone);
    const g = gauss(p[1] - lm.hipY, 0.075);
    if (bone === 'pelvis' || bone === 'spine_01') {
      const back = 1 - front(q);
      return [q[0] * 0.17 * g, 0, q[2] * (0.06 + 0.1 * back) * g];
    }
    if (b === 'thigh') {
      const outer = smoothstep(-0.3, 0.6, (Math.sign(p[0]) * q[0]) / (Math.hypot(q[0], q[2]) || 1));
      return scaleQ([q[0], 0, q[2]], 0.13 * (1 - smoothstep(0, 0.5, t)) * (0.4 + 0.6 * outer));
    }
    return null;
  },
  arms(bone, _p, t, q) {
    const b = base(bone);
    if (b === 'upperarm') return scaleQ(q, 0.16);
    if (b === 'lowerarm') return scaleQ(q, 0.13 * (1 - 0.45 * clamp(t, 0, 1)));
    if (b === 'clavicle') return scaleQ(q, 0.05);
    return null;
  },
  legs(bone, _p, t, q) {
    const b = base(bone);
    if (b === 'thigh') return scaleQ(q, 0.15 * (1 - 0.3 * clamp(t, 0, 1)));
    if (b === 'calf') return scaleQ(q, 0.13 * (1 - 0.65 * clamp(t, 0, 1)));
    return null;
  },
  neck(bone, p, _t, q, lm) {
    const mask = 1 - smoothstep(lm.headY + 0.0, lm.headY + 0.04, p[1]);
    if (bone === 'neck_01' || bone === 'Head') return scaleQ([q[0], 0, q[2]], 0.18 * mask);
    if (bone === 'spine_03' || base(bone) === 'clavicle') return scaleQ([q[0], 0, q[2]], 0.1 * smoothstep(lm.neckBaseY - 0.05, lm.neckBaseY + 0.01, p[1]) * mask);
    return null;
  },
};

/** Displacements of point p (bind space) with skin `skin` for every body parameter at value +1. */
export function bodyDeltas(ctx: ShapeContext, p: Vec3, skin: Skin): Record<BodyParamId, Vec3> {
  const out = {} as Record<BodyParamId, Vec3>;
  for (const id of BODY_PARAM_IDS) out[id] = [0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const w = skin.w[k] as number;
    if (w <= 1e-4) continue;
    const bi = skin.j[k] as number;
    const seg = ctx.segs[bi];
    const name = ctx.boneNames[bi];
    if (!seg || !name) continue;
    const rel: Vec3 = [p[0] - seg.a[0], p[1] - seg.a[1], p[2] - seg.a[2]];
    const along = rel[0] * seg.dir[0] + rel[1] * seg.dir[1] + rel[2] * seg.dir[2];
    const q: Vec3 = [rel[0] - seg.dir[0] * along, rel[1] - seg.dir[1] * along, rel[2] - seg.dir[2] * along];
    const t = along / seg.len;
    for (const id of BODY_PARAM_IDS) {
      const d = FIELDS[id](name, p, t, q, ctx.lm);
      if (!d) continue;
      const o = out[id];
      o[0] += d[0] * w; o[1] += d[1] * w; o[2] += d[2] * w;
    }
  }
  return out;
}

/** Clamps body values to their ParamDef ranges and drops unknown ids. */
export function clampBodyParams(values: Record<string, number>, defs: readonly ParamDef[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of defs) {
    const v = values[d.id];
    out[d.id] = typeof v === 'number' && Number.isFinite(v) ? clamp(v, d.min, d.max) : 0;
  }
  return out;
}
