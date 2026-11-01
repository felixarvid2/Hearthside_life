// Hat fit: a morph target ('hatFit') for hair meshes that squeezes the hair above the hat band down onto the skull,
// so a beanie, cap or sun hat sits on the head instead of swallowing a bun, an afro or a tall quiff. It is derived
// from the finished hair vertices alone (procedural and generated hairstyles alike), so no hair generator needs to
// know about hats: CharacterView adds it after building a hair mesh and drives it with the worn hat's `fit`.
//
// Hair above `Y_LOW` (head-local metres, about the brow line) is pulled in toward the sculpted skull: the horizontal
// distance from the head axis is limited to the skull radius at that height plus a small margin, and anything above
// the crown is lowered to it. The effect fades in over the band zone, so hair below the hat (side locks, ponytails
// hanging from under the hat, fringes beneath a brim) is left alone. Hats are built to stand off the skull by more
// than the margin, so the squeezed hair stays hidden inside them. Pure module.

import { CROWN_Y, DOME_SPAN, DOME_START, HEAD_OFFSET, HEAD_SCALE, headBasePoint, headToBind } from './headShape';
import type { MeshData } from './meshData';
import type { Vec3 } from './rig';
import { clamp, lerp, smoothstep } from './rig';
import type { BodyTemplate } from './template';

export const HAT_FIT = 'hatFit';
/** Hair below this head-local height is never touched; the fit is complete 0.04 above it. */
export const Y_LOW = 0.078;
/** Gap (head-local m) left between the squeezed hair and the skull. */
export const SKULL_MARGIN = 0.0035;

const ROWS = 36;
const COLS = 72;
const Y0 = 0.06;
const TAU = Math.PI * 2;
let table: Float32Array | null = null;

/** Horizontal skull radii per (height, angle around the axis) of the base head, built once. */
function skullTable(): Float32Array {
  if (table) return table;
  const t = new Float32Array(ROWS * COLS);
  for (let j = 0; j < ROWS; j++) {
    const y = lerp(Y0, CROWN_Y - 0.002, j / (ROWS - 1));
    const h = y <= DOME_START ? y : DOME_START + (DOME_SPAN * Math.asin(clamp((y - DOME_START) / (CROWN_Y - DOME_START), 0, 1))) / (Math.PI / 2);
    for (let i = 0; i < COLS; i++) {
      const phi = -Math.PI + (TAU * i) / COLS;
      // the angle around the axis grows monotonically with the surface parameter: bisect for it
      let lo = -Math.PI, hi = Math.PI;
      for (let it = 0; it < 22; it++) {
        const mid = (lo + hi) / 2;
        const p = headBasePoint(mid, h);
        if (Math.atan2(p[0], p[2]) < phi) lo = mid; else hi = mid;
      }
      const p = headBasePoint((lo + hi) / 2, h);
      t[j * COLS + i] = Math.hypot(p[0], p[2]);
    }
  }
  table = t;
  return t;
}

/** Skull radius at a head-local height and angle (0 = front, growing toward +x). */
export function skullRadius(y: number, phi: number): number {
  const t = skullTable();
  const f = clamp(((y - Y0) / (CROWN_Y - 0.002 - Y0)) * (ROWS - 1), 0, ROWS - 1);
  const j = Math.min(ROWS - 2, Math.floor(f)), fy = f - j;
  let a = ((phi + Math.PI) / TAU) * COLS;
  a -= Math.floor(a / COLS) * COLS;
  const i = Math.floor(a) % COLS, fx = a - Math.floor(a), i2 = (i + 1) % COLS;
  const g = (jj: number, ii: number) => t[jj * COLS + ii] as number;
  return (g(j, i) * (1 - fx) + g(j, i2) * fx) * (1 - fy) + (g(j + 1, i) * (1 - fx) + g(j + 1, i2) * fx) * fy;
}

/** The squeezed position of a head-local point (a copy; the input when it is not affected). */
export function squeezeToSkull(p: Vec3): Vec3 {
  const w = smoothstep(Y_LOW, Y_LOW + 0.04, p[1]);
  if (w <= 0) return p;
  const ys = Math.min(p[1], CROWN_Y + SKULL_MARGIN);
  const r = Math.hypot(p[0], p[2]);
  const R = skullRadius(Math.min(ys, CROWN_Y - 0.004), Math.atan2(p[0], p[2])) + SKULL_MARGIN;
  const k = r > R ? R / r : 1;
  if (k === 1 && ys === p[1]) return p;
  return [lerp(p[0], p[0] * k, w), lerp(p[1], ys, w), lerp(p[2], p[2] * k, w)];
}

/** Adds the 'hatFit' morph target (relative bind-space deltas) to a hair mesh whose vertices are final. */
export function addHatFit(t: BodyTemplate, m: MeshData): void {
  const O = t.headOrigin;
  const hm = t.headMap;
  const toLocal = (p: Vec3): Vec3 => {
    const c = hm ? hm.toClassic(p) : p;
    return [(c[0] - O[0] - HEAD_OFFSET[0]) / HEAD_SCALE, (c[1] - O[1] - HEAD_OFFSET[1]) / HEAD_SCALE, (c[2] - O[2] - HEAD_OFFSET[2]) / HEAD_SCALE];
  };
  const toBind = (l: Vec3): Vec3 => { const c = headToBind(O, l); return hm ? hm.toMeshy(c) : c; };
  const n = m.positions.length / 3;
  const d = new Array<number>(n * 3).fill(0);
  for (let i = 0; i < n; i++) {
    const p: Vec3 = [m.positions[i * 3] as number, m.positions[i * 3 + 1] as number, m.positions[i * 3 + 2] as number];
    // cheap reject: far below the head (hanging hair, shoulders)
    if (p[1] < O[1] - 0.05) continue;
    const l = toLocal(p);
    const q = squeezeToSkull(l);
    if (q === l) continue;
    const a = toBind(l), b = toBind(q);
    d[i * 3] = b[0] - a[0]; d[i * 3 + 1] = b[1] - a[1]; d[i * 3 + 2] = b[2] - a[2];
  }
  m.morphs[HAT_FIT] = d;
}
