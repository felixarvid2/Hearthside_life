// Radial profile fitting: describes a body segment of the mannequin as a smooth tube around an axis.
// The source mannequin is built from separate rigid-looking segments with grooves at every joint; sampling
// the segment vertices into per-row angular radius bins, then dilating along the axis and smoothing, yields
// one continuous surface without the segmented look. Pure module (no three.js).

import type { Vec3 } from './rig';
import { clamp } from './rig';

/** 'y' = vertical tube (torso, legs): point = (ca + r sin a, s, cb + r cos a), angle 0 = front (+z), PI/2 = +x.
 *  'x' = arm tube along +x: point = (s, ca + r cos a, cb + r sin a), angle 0 = up (+y), PI/2 = front (+z). */
export type TubeAxis = 'x' | 'y';

export interface Profile {
  axis: TubeAxis;
  /** Row axis coordinates, ascending. */
  s: number[];
  /** Row centres in the cross-section plane (axis y: x and z; axis x: y and z). */
  ca: number[];
  cb: number[];
  /** Angular bins per row. */
  bins: number;
  /** Radius per row and bin. */
  r: Float64Array[];
}

export interface FitOptions {
  rows: number;
  bins?: number;
  /** Half thickness of the slab of vertices that defines one row (metres). */
  slab?: number;
  /** Rows to dilate (running max) along the axis to close the grooves between segments. */
  dilate?: number;
  /** Gaussian smoothing sigma along rows / bins. */
  smoothRows?: number;
  smoothBins?: number;
}

export function axisCoord(axis: TubeAxis, p: ArrayLike<number>, o = 0): number {
  return axis === 'y' ? (p[o + 1] as number) : Math.abs(p[o] as number);
}

function planeCoords(axis: TubeAxis, p: ArrayLike<number>, o: number): [number, number] {
  return axis === 'y' ? [p[o] as number, p[o + 2] as number] : [p[o + 1] as number, p[o + 2] as number];
}

/** Angle and radius of a plane offset (da, db) around a centre, using the tube's angle convention. */
export function planeAngle(axis: TubeAxis, da: number, db: number): number {
  return axis === 'y' ? Math.atan2(da, db) : Math.atan2(db, da);
}

/** Unit direction in the cross-section plane for an angle: returns [da, db]. */
export function planeDir(axis: TubeAxis, a: number): [number, number] {
  return axis === 'y' ? [Math.sin(a), Math.cos(a)] : [Math.cos(a), Math.sin(a)];
}

/** 3D point for an axis coordinate, centre, angle and radius. `side` mirrors x for arms (-1 = right arm). */
export function tubePoint(axis: TubeAxis, s: number, ca: number, cb: number, a: number, r: number, side = 1): Vec3 {
  const [da, db] = planeDir(axis, a);
  if (axis === 'y') return [ca + r * da, s, cb + r * db];
  return [side * s, ca + r * da, cb + r * db];
}

const TAU = Math.PI * 2;

/**
 * Fits a radial profile to a vertex subset between axis coordinates s0 and s1.
 * `positions` is a flat xyz array; `verts` are the vertex indices that belong to the segment.
 * For arm tubes the absolute x is used, so pass one side's vertices.
 */
export function fitProfile(positions: ArrayLike<number>, verts: readonly number[], axis: TubeAxis, s0: number, s1: number, opt: FitOptions): Profile {
  const rows = Math.max(2, opt.rows);
  const bins = opt.bins ?? 48;
  const slab0 = opt.slab ?? 0.012;
  const s: number[] = [];
  for (let j = 0; j < rows; j++) s.push(s0 + ((s1 - s0) * j) / (rows - 1));

  // Collect each vertex's axis coordinate once.
  const vs = verts.map((v) => axisCoord(axis, positions, v * 3));

  // Pass 1: slab centres (bounding-box midpoints), then smoothing.
  const ca: number[] = [];
  const cb: number[] = [];
  const slabOf: number[][] = [];
  for (let j = 0; j < rows; j++) {
    let slab = slab0;
    let members: number[] = [];
    for (let tries = 0; tries < 6; tries++) {
      members = [];
      for (let k = 0; k < verts.length; k++) if (Math.abs((vs[k] as number) - (s[j] as number)) <= slab) members.push(verts[k] as number);
      if (members.length >= 8) break;
      slab *= 1.6;
    }
    slabOf.push(members);
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const v of members) {
      const [a, b] = planeCoords(axis, positions, v * 3);
      if (axis === 'x' && (positions[v * 3] as number) < 0) continue;
      amin = Math.min(amin, a); amax = Math.max(amax, a); bmin = Math.min(bmin, b); bmax = Math.max(bmax, b);
    }
    ca.push(Number.isFinite(amin) ? (amin + amax) / 2 : NaN);
    cb.push(Number.isFinite(bmin) ? (bmin + bmax) / 2 : NaN);
  }
  fillNaN(ca); fillNaN(cb);
  const sca = smooth1D(ca, 1.2);
  const scb = smooth1D(cb, 1.2);

  // Pass 2: angular max radius per bin (support-function spread to neighbouring bins).
  let r: Float64Array[] = [];
  for (let j = 0; j < rows; j++) {
    const row = new Float64Array(bins);
    for (const v of slabOf[j] as number[]) {
      const [a, b] = planeCoords(axis, positions, v * 3);
      const da = a - (sca[j] as number);
      const db = b - (scb[j] as number);
      const rad = Math.hypot(da, db);
      const ang = planeAngle(axis, da, db);
      const bf = ((ang / TAU) * bins + bins) % bins;
      const b0 = Math.round(bf);
      for (let d = -2; d <= 2; d++) {
        const bi = (((b0 + d) % bins) + bins) % bins;
        const delta = ((bi - bf) / bins) * TAU;
        const rr = rad * Math.cos(delta);
        if (rr > (row[bi] as number)) row[bi] = rr;
      }
    }
    fillCircular(row);
    r.push(row);
  }
  // Rows without any data copy their neighbour.
  for (let j = 0; j < rows; j++) if (maxOf(r[j] as Float64Array) <= 0) r[j] = new Float64Array(nearestFilled(r, j));

  // Dilate along the axis (closes joint grooves), then smooth.
  const dil = opt.dilate ?? 1;
  if (dil > 0) {
    const out: Float64Array[] = [];
    for (let j = 0; j < rows; j++) {
      const row = new Float64Array(bins);
      for (let k = 0; k < bins; k++) {
        let m = 0;
        for (let d = -dil; d <= dil; d++) {
          const jj = clamp(j + d, 0, rows - 1);
          m = Math.max(m, (r[jj] as Float64Array)[k] as number);
        }
        row[k] = m;
      }
      out.push(row);
    }
    r = out;
  }
  r = smoothGrid(r, opt.smoothRows ?? 1.2, opt.smoothBins ?? 1.0);
  return { axis, s, ca: sca, cb: scb, bins, r };
}

/** Radius, centre at an axis coordinate and angle (linear in rows, circular-linear in bins). */
export function sampleProfile(p: Profile, s: number, a: number): { r: number; ca: number; cb: number } {
  const n = p.s.length;
  const s0 = p.s[0] as number;
  const s1 = p.s[n - 1] as number;
  const f = clamp(((s - s0) / (s1 - s0)) * (n - 1), 0, n - 1);
  const j0 = Math.min(n - 2, Math.floor(f));
  const t = f - j0;
  const bf = ((((a / TAU) * p.bins) % p.bins) + p.bins) % p.bins;
  const k0 = Math.floor(bf) % p.bins;
  const k1 = (k0 + 1) % p.bins;
  const u = bf - Math.floor(bf);
  const row = (j: number) => {
    const rr = p.r[j] as Float64Array;
    return (rr[k0] as number) * (1 - u) + (rr[k1] as number) * u;
  };
  return {
    r: row(j0) * (1 - t) + row(j0 + 1) * t,
    ca: (p.ca[j0] as number) * (1 - t) + (p.ca[j0 + 1] as number) * t,
    cb: (p.cb[j0] as number) * (1 - t) + (p.cb[j0 + 1] as number) * t,
  };
}

/** 3D surface point of a profile. */
export function profilePoint(p: Profile, s: number, a: number, side = 1, scale = 1): Vec3 {
  const q = sampleProfile(p, s, a);
  return tubePoint(p.axis, s, q.ca, q.cb, a, q.r * scale, side);
}

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

function maxOf(a: ArrayLike<number>): number { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, a[i] as number); return m; }

function nearestFilled(r: Float64Array[], j: number): Float64Array {
  for (let d = 1; d < r.length; d++) {
    for (const jj of [j - d, j + d]) if (jj >= 0 && jj < r.length && maxOf(r[jj] as Float64Array) > 0) return r[jj] as Float64Array;
  }
  return r[j] as Float64Array;
}

function fillNaN(a: number[]): void {
  const n = a.length;
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(a[i])) continue;
    let lo = i - 1; while (lo >= 0 && Number.isNaN(a[lo])) lo--;
    let hi = i + 1; while (hi < n && Number.isNaN(a[hi])) hi++;
    if (lo < 0 && hi >= n) { a[i] = 0; continue; }
    if (lo < 0) a[i] = a[hi] as number;
    else if (hi >= n) a[i] = a[lo] as number;
    else a[i] = (a[lo] as number) + (((a[hi] as number) - (a[lo] as number)) * (i - lo)) / (hi - lo);
  }
}

/** Fills zero bins by circular linear interpolation between filled bins. */
export function fillCircular(row: Float64Array): void {
  const n = row.length;
  const filled: number[] = [];
  for (let i = 0; i < n; i++) if ((row[i] as number) > 0) filled.push(i);
  if (filled.length === 0) return;
  if (filled.length === 1) { row.fill(row[filled[0] as number] as number); return; }
  for (let fi = 0; fi < filled.length; fi++) {
    const a = filled[fi] as number;
    const b = filled[(fi + 1) % filled.length] as number;
    const gap = (b - a + n) % n;
    for (let d = 1; d < gap; d++) {
      const i = (a + d) % n;
      row[i] = (row[a] as number) + (((row[b] as number) - (row[a] as number)) * d) / gap;
    }
  }
}

export function smooth1D(a: readonly number[], sigma: number): number[] {
  if (sigma <= 0) return [...a];
  const n = a.length;
  const rad = Math.ceil(sigma * 2.5);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let s = 0, ws = 0;
    for (let d = -rad; d <= rad; d++) {
      const j = clamp(i + d, 0, n - 1);
      const w = Math.exp(-(d * d) / (2 * sigma * sigma));
      s += (a[j] as number) * w; ws += w;
    }
    out.push(s / ws);
  }
  return out;
}

function smoothGrid(r: Float64Array[], sRows: number, sBins: number): Float64Array[] {
  const rows = r.length;
  const bins = (r[0] as Float64Array).length;
  let cur = r;
  if (sBins > 0) {
    const rad = Math.ceil(sBins * 2.5);
    cur = cur.map((row) => {
      const out = new Float64Array(bins);
      for (let k = 0; k < bins; k++) {
        let s = 0, ws = 0;
        for (let d = -rad; d <= rad; d++) {
          const w = Math.exp(-(d * d) / (2 * sBins * sBins));
          s += (row[(((k + d) % bins) + bins) % bins] as number) * w; ws += w;
        }
        out[k] = s / ws;
      }
      return out;
    });
  }
  if (sRows > 0) {
    const rad = Math.ceil(sRows * 2.5);
    const out: Float64Array[] = [];
    for (let j = 0; j < rows; j++) {
      const row = new Float64Array(bins);
      for (let k = 0; k < bins; k++) {
        let s = 0, ws = 0;
        for (let d = -rad; d <= rad; d++) {
          const jj = clamp(j + d, 0, rows - 1);
          const w = Math.exp(-(d * d) / (2 * sRows * sRows));
          s += ((cur[jj] as Float64Array)[k] as number) * w; ws += w;
        }
        row[k] = s / ws;
      }
      out.push(row);
    }
    cur = out;
  }
  return cur;
}

/** Radii of a closed 2D ring projected onto its convex hull (bridges concave dips, e.g. between breasts). */
export function hullRadii(pts: Array<[number, number]>, ca: number, cb: number): number[] {
  // Andrew's monotone chain
  const idx = pts.map((p, i) => ({ p, i })).sort((u, v) => u.p[0] - v.p[0] || u.p[1] - v.p[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const { p } of idx) { while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop(); lower.push(p); }
  const upper: Array<[number, number]> = [];
  for (let i = idx.length - 1; i >= 0; i--) { const p = idx[i]!.p; while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop(); upper.push(p); }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  // For each point, radius of the hull along the ray from the centre through the point.
  return pts.map((p) => {
    const dx = p[0] - ca, dy = p[1] - cb;
    const len = Math.hypot(dx, dy) || 1e-9;
    const ux = dx / len, uy = dy / len;
    let best = len;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i]!, b = hull[(i + 1) % hull.length]!;
      // ray (ca,cb) + t*(ux,uy) against segment a-b
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const den = ux * ey - uy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const ax = a[0] - ca, ay = a[1] - cb;
      const t = (ax * ey - ay * ex) / den;
      const s = (ax * uy - ay * ux) / den;
      if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.max(best, t);
    }
    return best;
  });
}
