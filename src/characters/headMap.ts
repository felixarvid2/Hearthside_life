// Head map: carries things built on the parametric head (hair caps and curls, facial hair, glasses, earrings and the
// face-paint coordinates) onto the head of a Meshy body. Both heads are described in the same way: a table of
// horizontal "first hit" distances from a vertical axis (angle x height), measured on the surface mesh. A point of the
// parametric head is moved to the Meshy head by (1) a piecewise-linear height map through the eye line, brow line and
// crown, and (2) scaling its horizontal offset from the axis by Meshy radius / parametric radius at the same angle and
// height. Hair therefore keeps its offset from the scalp and its hairline relative to brows and eyes. Pure module.

import { CROWN_Y, FACE_LAYOUT as FL, H_MIN, HEAD_OFFSET, HEAD_SCALE, headColumns, headPoint, headRows, headToBind } from './headShape';
import type { MeshData } from './meshData';
import type { Vec3 } from './rig';
import { clamp, smoothstep } from './rig';

export interface RadiusTable {
  y0: number;
  y1: number;
  rows: number;
  cols: number;
  axisX: number;
  axisZ: number;
  /** rows * cols distances; angle runs from the front (+z) toward +x, cols points over a full turn. */
  r: number[];
}

/** What the build step stores in the GLB for the runtime. */
export interface MeshyHeadInfo {
  eyeY: number;
  browY: number;
  crownY: number;
  table: RadiusTable;
}

/** First horizontal hit of rays leaving the axis, per height row and angle (distances in metres). */
export function castRadii(pos: ArrayLike<number>, index: ArrayLike<number>, axisX: number, axisZ: number, y0: number, y1: number, rows: number, cols: number): RadiusTable {
  const r = new Array<number>(rows * cols).fill(Infinity);
  const dirs = Array.from({ length: cols }, (_, i) => { const a = (i / cols) * Math.PI * 2; return [Math.sin(a), Math.cos(a)] as const; });
  const nt = Math.floor(index.length / 3);
  for (let t = 0; t < nt; t++) {
    const a = index[t * 3] as number, b = index[t * 3 + 1] as number, c = index[t * 3 + 2] as number;
    const ya = pos[a * 3 + 1] as number, yb = pos[b * 3 + 1] as number, yc = pos[c * 3 + 1] as number;
    const lo = Math.min(ya, yb, yc), hi = Math.max(ya, yb, yc);
    if (hi < y0 || lo > y1) continue;
    const j0 = Math.max(0, Math.ceil(((lo - y0) / (y1 - y0)) * (rows - 1))), j1 = Math.min(rows - 1, Math.floor(((hi - y0) / (y1 - y0)) * (rows - 1)));
    for (let j = j0; j <= j1; j++) {
      const y = y0 + ((y1 - y0) * j) / (rows - 1);
      // intersection of the triangle with the plane at y: a segment in (x, z)
      const seg: Array<[number, number]> = [];
      const ids = [a, b, c];
      for (let e = 0; e < 3; e++) {
        const p = ids[e] as number, q = ids[(e + 1) % 3] as number;
        const yp = pos[p * 3 + 1] as number, yq = pos[q * 3 + 1] as number;
        if ((yp - y) * (yq - y) > 0 || yp === yq) continue;
        const f = (y - yp) / (yq - yp);
        seg.push([(pos[p * 3] as number) + ((pos[q * 3] as number) - (pos[p * 3] as number)) * f, (pos[p * 3 + 2] as number) + ((pos[q * 3 + 2] as number) - (pos[p * 3 + 2] as number)) * f]);
      }
      if (seg.length < 2) continue;
      const [x1, z1] = seg[0] as [number, number], [x2, z2] = seg[1] as [number, number];
      const sx = x2 - x1, sz = z2 - z1;
      for (let i = 0; i < cols; i++) {
        const [dx, dz] = dirs[i] as readonly [number, number];
        // ray O + t d = P1 + u s
        const den = dx * sz - dz * sx;
        if (Math.abs(den) < 1e-12) continue;
        const ox = x1 - axisX, oz = z1 - axisZ;
        const t0 = (ox * sz - oz * sx) / den;
        const u = (ox * dz - oz * dx) / den;
        if (u < -1e-6 || u > 1 + 1e-6 || t0 < 0.02) continue;
        if (t0 < (r[j * cols + i] as number)) r[j * cols + i] = t0;
      }
    }
  }
  fillTable(r, rows, cols);
  return { y0, y1, rows, cols, axisX, axisZ, r };
}

/** Replaces missing hits by neighbours (rows, then angles) and smooths over angle. */
function fillTable(r: number[], rows: number, cols: number): void {
  for (let pass = 0; pass < 6; pass++) {
    let missing = 0;
    const next = r.slice();
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (Number.isFinite(r[j * cols + i])) continue;
      let s = 0, n = 0;
      for (const [dj, di] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const jj = j + dj;
        if (jj < 0 || jj >= rows) continue;
        const v = r[jj * cols + ((i + di + cols) % cols)] as number;
        if (Number.isFinite(v)) { s += v; n++; }
      }
      if (n) next[j * cols + i] = s / n; else missing++;
    }
    for (let k = 0; k < r.length; k++) r[k] = next[k] as number;
    if (!missing) break;
  }
  for (let k = 0; k < r.length; k++) if (!Number.isFinite(r[k])) r[k] = 0.08;
  const sm = r.slice();
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = r[j * cols + ((i + cols - 1) % cols)] as number, b = r[j * cols + i] as number, c = r[j * cols + ((i + 1) % cols)] as number;
    sm[j * cols + i] = 0.25 * a + 0.5 * b + 0.25 * c;
  }
  for (let k = 0; k < r.length; k++) r[k] = sm[k] as number;
}

/** Bilinear lookup (periodic in angle, clamped in height). Angle 0 = +z, growing toward +x. */
export function sampleRadius(t: RadiusTable, theta: number, y: number): number {
  const f = clamp(((y - t.y0) / (t.y1 - t.y0)) * (t.rows - 1), 0, t.rows - 1);
  const j = Math.min(t.rows - 2, Math.floor(f)), fy = f - j;
  let a = (theta / (Math.PI * 2)) * t.cols;
  a -= Math.floor(a / t.cols) * t.cols;
  const i = Math.floor(a) % t.cols, fx = a - Math.floor(a), i2 = (i + 1) % t.cols;
  const g = (jj: number, ii: number) => t.r[jj * t.cols + ii] as number;
  const top = g(j, i) * (1 - fx) + g(j, i2) * fx, bot = g(j + 1, i) * (1 - fx) + g(j + 1, i2) * fx;
  return top * (1 - fy) + bot * fy;
}

const ROWS = 56;
const COLS = 48;

/** Radius table of the parametric head with the Head bone at `origin` (bind space). */
export function classicHeadTable(origin: Vec3): RadiusTable {
  const cols = headColumns(64);
  const rows = headRows();
  const pos: number[] = [];
  for (const h of rows) for (const th of cols) { const p = headToBind(origin, headPoint(th, h)); pos.push(p[0], p[1], p[2]); }
  const idx: number[] = [];
  const C = cols.length;
  for (let r = 0; r + 1 < rows.length; r++) for (let c = 0; c < C; c++) {
    const a = r * C + c, b = r * C + ((c + 1) % C), d = (r + 1) * C + c, e = (r + 1) * C + ((c + 1) % C);
    idx.push(a, b, d, b, e, d);
  }
  const base = origin[1] + HEAD_OFFSET[1];
  const y0 = base + (H_MIN + 0.002) * HEAD_SCALE, y1 = base + (CROWN_Y - 0.002) * HEAD_SCALE;
  const axisZ = axisFor(pos, base + FL.eyeY * HEAD_SCALE);
  return castRadii(pos, idx, origin[0] + HEAD_OFFSET[0], axisZ, y0, y1, ROWS, COLS);
}

/** Head axis z: the middle of the head's depth on the band around the eyes (excludes the nose and the neck). */
export function axisFor(pos: ArrayLike<number>, eyeY: number): number {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.length / 3; i++) {
    const y = pos[i * 3 + 1] as number;
    if (y < eyeY - 0.01 || y > eyeY + 0.07 || Math.abs(pos[i * 3] as number) > 0.12) continue;
    const z = pos[i * 3 + 2] as number;
    if (z < lo) lo = z;
    if (z > hi) hi = z;
  }
  return Number.isFinite(lo) ? (lo + hi) / 2 : 0;
}

/** Radius table of a Meshy head (bind space) from its triangles; `eyeY` is the height of its eyes. */
export function meshyHeadInfo(pos: ArrayLike<number>, index: ArrayLike<number>, eyeY: number, browY: number, crownY: number): MeshyHeadInfo {
  const k = (crownY - eyeY) / ((CROWN_Y - FL.eyeY) * HEAD_SCALE);
  const chin = eyeY - (FL.eyeY - (H_MIN - 0.004)) * HEAD_SCALE * k;
  // only the triangles of the head (the table never looks below the chin)
  const keep: number[] = [];
  for (let t = 0; t < index.length / 3; t++) {
    let ok = true;
    for (let e = 0; e < 3; e++) {
      const v = index[t * 3 + e] as number;
      if ((pos[v * 3 + 1] as number) < chin - 0.12 || Math.abs(pos[v * 3] as number) > 0.16) ok = false;
    }
    if (ok) keep.push(index[t * 3] as number, index[t * 3 + 1] as number, index[t * 3 + 2] as number);
  }
  const axisZ = axisFor(pos, eyeY);
  const table = castRadii(pos, keep, 0, axisZ, chin - 0.03, crownY, ROWS, COLS);
  return { eyeY, browY, crownY, table };
}

/** Maps parametric head space (bind coordinates of the classic head) to the Meshy head and back. */
export class HeadMap {
  private readonly classic: RadiusTable;
  private readonly keysC: number[];
  private readonly keysM: number[];
  private readonly chinC: number;
  private readonly slopeBelow: number;
  /** Height of the chin on the Meshy head (from the parametric proportions below the eyes). */
  readonly chinM: number;

  constructor(readonly info: MeshyHeadInfo, readonly origin: Vec3) {
    this.classic = classicHeadTable(origin);
    const base = origin[1] + HEAD_OFFSET[1];
    const eyeC = base + FL.eyeY * HEAD_SCALE, browC = base + FL.browY * HEAD_SCALE, crownC = base + CROWN_Y * HEAD_SCALE;
    this.chinC = base + (H_MIN - 0.004) * HEAD_SCALE;
    this.slopeBelow = (info.crownY - info.eyeY) / (crownC - eyeC);
    this.chinM = info.eyeY - (eyeC - this.chinC) * this.slopeBelow;
    this.keysC = [eyeC, browC, crownC];
    this.keysM = [info.eyeY, info.browY, info.crownY];
  }

  /** Meshy height of a classic height. */
  mapY(y: number): number {
    const c = this.keysC, m = this.keysM;
    if (y <= c[0]!) return m[0]! + (y - c[0]!) * this.slopeBelow;
    for (let i = 0; i < 2; i++) if (y <= c[i + 1]!) return m[i]! + ((y - c[i]!) / (c[i + 1]! - c[i]!)) * (m[i + 1]! - m[i]!);
    return m[2]! + (y - c[2]!) * ((m[2]! - m[1]!) / (c[2]! - c[1]!));
  }

  /** Classic height of a Meshy height. */
  unmapY(y: number): number {
    const c = this.keysC, m = this.keysM;
    if (y <= m[0]!) return c[0]! + (y - m[0]!) / this.slopeBelow;
    for (let i = 0; i < 2; i++) if (y <= m[i + 1]!) return c[i]! + ((y - m[i]!) / (m[i + 1]! - m[i]!)) * (c[i + 1]! - c[i]!);
    return c[2]! + (y - m[2]!) * ((c[2]! - c[1]!) / (m[2]! - m[1]!));
  }

  private scale(theta: number, yC: number, yM: number): number {
    const rc = sampleRadius(this.classic, theta, yC), rm = sampleRadius(this.info.table, theta, yM);
    return clamp(rm / Math.max(rc, 1e-3), 0.5, 1.8);
  }

  /** Classic-head bind point -> Meshy head. Fades to the identity below the chin (hair that hangs to the shoulders). */
  toMeshy(p: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
    const w = smoothstep(this.chinC - 0.16, this.chinC - 0.015, p[1]);
    if (w <= 0) { out[0] = p[0]; out[1] = p[1]; out[2] = p[2]; return out; }
    const t = this.classic;
    const dx = p[0] - t.axisX, dz = p[2] - t.axisZ;
    const theta = Math.atan2(dx, dz);
    const yM = this.mapY(p[1]);
    const s = this.scale(theta, p[1], yM);
    const mt = this.info.table;
    out[0] = p[0] + w * (mt.axisX + dx * s - p[0]);
    out[1] = p[1] + w * (yM - p[1]);
    out[2] = p[2] + w * (mt.axisZ + dz * s - p[2]);
    return out;
  }

  /** Meshy head point -> classic head bind coordinates (no fade: meant for head surface points). */
  toClassic(p: Vec3): Vec3 {
    const mt = this.info.table;
    const dx = p[0] - mt.axisX, dz = p[2] - mt.axisZ;
    const theta = Math.atan2(dx, dz);
    const yC = this.unmapY(p[1]);
    const s = this.scale(theta, yC, p[1]);
    return [this.classic.axisX + dx / s, yC, this.classic.axisZ + dz / s];
  }

  /** Moves every vertex of a hair/facial hair/accessory mesh onto the Meshy head (normals are rebuilt by the caller). */
  apply(m: MeshData): void {
    const q: Vec3 = [0, 0, 0];
    for (let i = 0; i < m.positions.length; i += 3) {
      this.toMeshy([m.positions[i] as number, m.positions[i + 1] as number, m.positions[i + 2] as number], q);
      m.positions[i] = q[0]; m.positions[i + 1] = q[1]; m.positions[i + 2] = q[2];
    }
  }
}
