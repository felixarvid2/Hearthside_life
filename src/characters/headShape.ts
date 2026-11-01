// Procedural head: an original sculpted head surface (cranium, jaw, chin, nose, lips, cheeks, brow ridge,
// eye sockets) that replaces the mannequin's faceless egg. The surface is a function of (theta, h):
//   theta = angle around the vertical axis (0 = front/+z, PI/2 = character's left/+x),
//   h     = height in head-local metres up to DOME_START, then a virtual coordinate over the dome to the crown.
// Head-local space: origin at the Head bone's bind position, axes as in bind space. Face sculpt parameters
// are displacement fields of the base surface point, so facial hair and anything else sampled from the same
// surface receives identical morph deltas. Pure module.

import type { Vec3 } from './rig';
import { clamp, gauss, smoothstep } from './rig';

export const HEAD_SCULPT_IDS = [
  'faceLength', 'faceWidth', 'jawWidth', 'chin', 'cheeks', 'cheekbones', 'noseWidth', 'noseLength', 'noseBridge',
  'lipFullness', 'mouthWidth', 'earSize',
] as const;
export type HeadSculptId = (typeof HEAD_SCULPT_IDS)[number];

/** Face paint layout (head-local metres) shared with the skin shader. */
export const FACE_LAYOUT = {
  eyeX: 0.0328, eyeY: 0.098, eyeHalfW: 0.014, eyeHalfH: 0.0079,
  browX0: 0.0085, browX1: 0.0475, browY: 0.1158,
  mouthY: 0.0285, mouthHalfW: 0.0198,
  noseTipY: 0.062, noseBaseY: 0.049,
} as const;

export const H_MIN = -0.042;
export const DOME_START = 0.145;
export const DOME_SPAN = 0.1; // virtual h range of the dome
export const H_MAX = DOME_START + DOME_SPAN;
export const CROWN_Y = 0.229;
/** Uniform scale from head-local units to bind space (stylised, slightly larger head). */
export const HEAD_SCALE = 1.1;

/** Offset of the head-local origin from the Head bone (seats the jaw lower on the neck). */
export const HEAD_OFFSET: Vec3 = [0, -0.02, 0.004];

/** Bind-space position of a head-local point (origin = Head bone bind position + HEAD_OFFSET). */
export function headToBind(origin: Vec3, p: Vec3): Vec3 {
  return [origin[0] + HEAD_OFFSET[0] + p[0] * HEAD_SCALE, origin[1] + HEAD_OFFSET[1] + p[1] * HEAD_SCALE, origin[2] + HEAD_OFFSET[2] + p[2] * HEAD_SCALE];
}

/** Monotone piecewise-cubic (Catmull-Rom with clamped ends) through (x, y) keys. */
function curve(keys: Array<[number, number]>): (x: number) => number {
  return (x: number) => {
    const n = keys.length;
    if (x <= keys[0]![0]) return keys[0]![1];
    if (x >= keys[n - 1]![0]) return keys[n - 1]![1];
    let i = 0;
    while (i < n - 2 && x > keys[i + 1]![0]) i++;
    const [x0, y0] = keys[i]!;
    const [x1, y1] = keys[i + 1]!;
    const ym = i > 0 ? keys[i - 1]![1] : y0;
    const yp = i + 2 < n ? keys[i + 2]![1] : y1;
    const t = (x - x0) / (x1 - x0);
    const m0 = (y1 - ym) / 2;
    const m1 = (yp - y0) / 2;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
  };
}

const W = curve([[-0.042, 0.04], [-0.02, 0.048], [-0.005, 0.055], [0.005, 0.059], [0.018, 0.0635], [0.032, 0.0665], [0.05, 0.0695], [0.07, 0.0725], [0.09, 0.0755], [0.11, 0.0775], [0.13, 0.0785], [0.145, 0.0785]]);
const F = curve([[-0.042, 0.032], [-0.02, 0.054], [-0.005, 0.076], [0.005, 0.0855], [0.018, 0.0885], [0.032, 0.0915], [0.05, 0.093], [0.07, 0.0935], [0.09, 0.0915], [0.11, 0.0935], [0.13, 0.0955], [0.145, 0.0935]]);
const B = curve([[-0.042, 0.042], [-0.02, 0.05], [-0.005, 0.06], [0.005, 0.066], [0.018, 0.074], [0.032, 0.082], [0.05, 0.09], [0.07, 0.097], [0.09, 0.102], [0.11, 0.105], [0.13, 0.106], [0.145, 0.105]]);
const NF = curve([[-0.042, 2.0], [-0.005, 1.8], [0.005, 1.7], [0.018, 1.85], [0.032, 2.05], [0.05, 2.25], [0.07, 2.45], [0.09, 2.55], [0.11, 2.5], [0.13, 2.35], [0.145, 2.25]]);

const se = (c: number, n: number) => Math.sign(c) * Math.pow(Math.abs(c), 2 / n);

/** Undecorated head surface point (no features) at (theta, h). */
export function headBasePoint(theta: number, h: number): Vec3 {
  let y: number, w: number, f: number, b: number, nf: number;
  if (h <= DOME_START) {
    y = h; w = W(h); f = F(h); b = B(h); nf = NF(h);
  } else {
    const e = clamp((h - DOME_START) / DOME_SPAN, 0, 1) * (Math.PI / 2);
    const c = Math.cos(e);
    y = DOME_START + (CROWN_Y - DOME_START) * Math.sin(e);
    w = W(DOME_START) * Math.pow(c, 0.8);
    f = F(DOME_START) * Math.pow(c, 0.78);
    b = B(DOME_START) * Math.pow(c, 0.8);
    nf = 2 + (NF(DOME_START) - 2) * c;
  }
  const s = Math.sin(theta), c = Math.cos(theta);
  const x = w * se(s, c > 0 ? nf : 2);
  const z = c >= 0 ? f * se(c, nf) : b * se(c, 2);
  return [x, y, z];
}

// ---- features -------------------------------------------------------------------------------

const NOSE_P = curve([[0.038, 0], [0.045, 0.004], [0.05, 0.0115], [0.055, 0.0195], [0.0615, 0.0245], [0.068, 0.0235], [0.08, 0.0175], [0.095, 0.0112], [0.108, 0.0062], [0.12, 0.0022], [0.132, 0]]);
const NOSE_W = curve([[0.038, 0.012], [0.05, 0.0115], [0.058, 0.0098], [0.065, 0.0075], [0.08, 0.0057], [0.1, 0.0052], [0.12, 0.0068], [0.132, 0.008]]);

const g2 = (dx: number, dy: number, sx: number, sy: number) => Math.exp(-(dx * dx) / (2 * sx * sx) - (dy * dy) / (2 * sy * sy));
const frontMask = (p: Vec3) => smoothstep(0.02, 0.07, p[2]);
const horiz = (p: Vec3): Vec3 => { const l = Math.hypot(p[0], p[2]) || 1; return [p[0] / l, 0, p[2] / l]; };

/** Nose protrusion weight 0..1 (used for nose-width scaling). */
function noseMask(p: Vec3): number {
  const P = NOSE_P(p[1]);
  const s = NOSE_W(p[1]);
  const m = (P / 0.0245) * Math.exp(-(p[0] * p[0]) / (2 * s * s)) + 0.6 * g2(Math.abs(p[0]) - 0.0115, p[1] - 0.054, 0.0045, 0.0045);
  return clamp(m, 0, 1) * frontMask(p);
}

/** Sculpted head point: base surface plus facial features (all params at 0). */
export function headPoint(theta: number, h: number): Vec3 {
  const p = headBasePoint(theta, h);
  return addFeatures(p);
}

export function addFeatures(p: Vec3): Vec3 {
  const fz = frontMask(p);
  const ax = Math.abs(p[0]);
  let dz = 0;
  // nose
  const s = NOSE_W(p[1]);
  dz += NOSE_P(p[1]) * Math.exp(-(p[0] * p[0]) / (2 * s * s)) * fz;
  dz += 0.0045 * g2(ax - 0.011, p[1] - 0.0535, 0.0038, 0.0038) * fz; // alae
  // brow ridge, eye sockets, eyeball
  dz += 0.003 * gauss(p[1] - 0.13, 0.01) * gauss(p[0], 0.045) * fz;
  dz -= 0.0046 * g2(ax - 0.033, p[1] - 0.099, 0.015, 0.0105) * fz;
  dz += 0.0026 * g2(ax - 0.0325, p[1] - 0.098, 0.0085, 0.0062) * fz;
  // lips, mouth groove, philtrum, chin
  dz += 0.0042 * gauss(p[0], 0.015) * gauss(p[1] - 0.0355, 0.0042) * fz;
  dz += 0.0048 * gauss(p[0], 0.0135) * gauss(p[1] - 0.0215, 0.0045) * fz;
  dz -= 0.0018 * gauss(p[0], 0.02) * gauss(p[1] - 0.0285, 0.0013) * fz;
  dz -= 0.0011 * gauss(p[0], 0.003) * gauss(p[1] - 0.043, 0.004) * fz;
  dz += 0.004 * g2(p[0], p[1] - 0.006, 0.014, 0.01) * fz;
  dz -= 0.0017 * gauss(p[1] - 0.0135, 0.004) * gauss(p[0], 0.016) * fz;
  // cheekbones (outward), temples (inward)
  const rh = horiz(p);
  const cb = 0.003 * g2(ax - 0.055, p[1] - 0.083, 0.014, 0.012) - 0.0022 * g2(ax - 0.073, p[1] - 0.128, 0.012, 0.016) * (1 - fz);
  return [p[0] + rh[0] * cb, p[1], p[2] + dz + rh[2] * cb];
}

/** Displacements at parameter value +1 for a base (featured) head point. */
export function headDeltas(p: Vec3, theta: number): Record<HeadSculptId, Vec3> {
  const fz = frontMask(p);
  const ax = Math.abs(p[0]);
  const rh = horiz(p);
  const c = Math.cos(theta);
  const sAbs = Math.abs(Math.sin(theta));
  const faceSide = smoothstep(-0.7, 0.2, c);
  const lower = smoothstep(0.115, 0.0, p[1]);
  const band = smoothstep(-0.01, 0.03, p[1]) * (1 - smoothstep(0.12, 0.16, p[1]));
  const chinM = g2(p[0], p[1] - 0.005, 0.02, 0.016) * fz;
  const tip = g2(p[0], p[1] - 0.06, 0.012, 0.012) * fz;
  const bridge = gauss(p[0], 0.008) * smoothstep(0.12, 0.09, p[1]) * smoothstep(0.045, 0.06, p[1]) * fz;
  const upperLip = gauss(p[0], 0.017) * gauss(p[1] - 0.0355, 0.005) * fz;
  const lowerLip = gauss(p[0], 0.015) * gauss(p[1] - 0.0215, 0.0055) * fz;
  const mouth = gauss(p[0], 0.03) * gauss(p[1] - 0.029, 0.013) * fz;
  const nm = noseMask(p);
  const cheeks = g2(ax - 0.046, p[1] - 0.056, 0.018, 0.016) * smoothstep(-0.2, 0.4, c);
  const cheekbones = g2(ax - 0.058, p[1] - 0.086, 0.013, 0.01) - 0.5 * g2(ax - 0.05, p[1] - 0.058, 0.014, 0.012);
  const jaw = gauss(p[1] - 0.02, 0.026) * smoothstep(0.25, 0.85, sAbs) * smoothstep(-0.8, -0.1, c);
  return {
    faceLength: [0, -0.013 * lower * faceSide, 0.002 * lower * fz],
    faceWidth: [rh[0] * 0.0085 * band * Math.pow(sAbs, 0.7), 0, rh[2] * 0.003 * band * Math.pow(sAbs, 0.7)],
    jawWidth: [rh[0] * 0.011 * jaw, 0, rh[2] * 0.004 * jaw],
    chin: [0, -0.009 * chinM, 0.0055 * chinM],
    cheeks: [rh[0] * 0.0075 * cheeks, 0, rh[2] * 0.0075 * cheeks],
    cheekbones: [rh[0] * 0.006 * cheekbones, 0, rh[2] * 0.006 * cheekbones],
    noseWidth: [p[0] * 0.45 * nm, 0, 0],
    noseLength: [0, -0.0065 * tip, 0.003 * tip],
    noseBridge: [0, 0, 0.0055 * bridge],
    lipFullness: [0, 0.0014 * upperLip - 0.0018 * lowerLip, 0.003 * (upperLip + lowerLip)],
    mouthWidth: [p[0] * 0.22 * mouth, 0, -0.001 * mouth * ax * 40],
    earSize: [0, 0, 0],
  } satisfies Record<HeadSculptId, Vec3>;
}

// ---- grid -----------------------------------------------------------------------------------

/** Column angles with extra density at the face (front). */
export function headColumns(cols: number): number[] {
  const a = 0.42;
  const out: number[] = [];
  for (let c = 0; c < cols; c++) {
    const s = -1 + (2 * c) / cols;
    out.push(Math.PI * ((1 - a) * s + a * s * s * s));
  }
  return out;
}

/** Row h values: dense over the face, coarser below the jaw and over the dome. */
export function headRows(): number[] {
  const rows: number[] = [];
  for (let h = H_MIN; h < -0.005; h += 0.009) rows.push(h);
  for (let h = -0.005; h < 0.136; h += 0.0062) rows.push(h);
  rows.push(0.14, DOME_START);
  for (let k = 1; k <= 9; k++) rows.push(DOME_START + (DOME_SPAN * k) / 10);
  return rows;
}

/** Outward unit normal of the featured head surface by finite differences. */
export function headNormal(theta: number, h: number): Vec3 {
  const e = 1e-4;
  const p0 = headPoint(theta - e, h), p1 = headPoint(theta + e, h);
  const q0 = headPoint(theta, Math.max(H_MIN, h - e)), q1 = headPoint(theta, Math.min(H_MAX, h + e));
  const tu: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const tv: Vec3 = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]];
  // tu x tv points outward for this parameterisation (theta grows toward +x on the front, h grows up)
  let n: Vec3 = [tu[1] * tv[2] - tu[2] * tv[1], tu[2] * tv[0] - tu[0] * tv[2], tu[0] * tv[1] - tu[1] * tv[0]];
  const l = Math.hypot(n[0], n[1], n[2]);
  if (l < 1e-12) return [0, 1, 0];
  n = [n[0] / l, n[1] / l, n[2] / l];
  return n;
}

// ---- ears -----------------------------------------------------------------------------------

export const EAR = { x: 0.0742, y: 0.083, z: -0.008, ry: 0.0285, rz: 0.0165, rx: 0.0085, tiltBack: 0.25, flare: 0.32 };

/** Ear point (left ear; mirror x for the right) from ellipsoid angles u (around) and v (pole to pole). */
export function earPoint(u: number, v: number): { p: Vec3; anchor: Vec3; outer: number; inner: number } {
  // ellipsoid in ear-local coords: x = thickness (out), y = up, z = forward
  const sv = Math.sin(v), cv = Math.cos(v);
  let lx = EAR.rx * cv;
  const ly = EAR.ry * sv * Math.cos(u);
  const lz = EAR.rz * sv * Math.sin(u);
  // concha: dent on the outer face inside the rim
  const rim = Math.hypot(ly / (EAR.ry * 0.78), lz / (EAR.rz * 0.72));
  const outer = cv > 0 ? 1 : 0;
  const inner = outer * clamp(1 - rim, 0, 1);
  if (cv > 0) lx -= 0.0075 * smoothstep(1.0, 0.45, rim);
  // lobe: thinner, rounder bottom
  // rotate: tilt top backward (around x), flare the back edge away from the head (around y)
  const ct = Math.cos(EAR.tiltBack), st = Math.sin(EAR.tiltBack);
  const y1 = ly * ct + lz * st;
  const z1 = -ly * st + lz * ct;
  const cf = Math.cos(EAR.flare), sf = Math.sin(EAR.flare);
  const x2 = lx * cf - z1 * sf;
  const z2 = lx * sf + z1 * cf;
  const anchor: Vec3 = [EAR.x - 0.004, EAR.y, EAR.z];
  return { p: [EAR.x + x2, EAR.y + y1, EAR.z + z2], anchor, outer, inner };
}
