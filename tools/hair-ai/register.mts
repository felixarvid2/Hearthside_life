// Registers a TRELLIS mannequin head onto the parametric head (src/characters/headShape.ts, head-local metres). The hair keeps
// its place relative to the face: the visible mannequin surface (face, ears, skull where the hair does not cover it) is fitted to
// the head surface by a robust (trimmed) nearest-distance fit over a yaw and an anisotropic scale and translation. At run time
// HeadMap carries head-local hair onto the scanned heads of both body frames, as for the procedural hair.

import type { Vec3 } from './mesh.mts';

export interface Transform { s: Vec3; t: Vec3; yaw: number }

export function applyTransform(T: Transform, p: ArrayLike<number>, o: number, out: Vec3): Vec3 {
  const x = (p[o] as number) * T.s[0], y = (p[o + 1] as number) * T.s[1], z = (p[o + 2] as number) * T.s[2];
  const c = Math.cos(T.yaw), s = Math.sin(T.yaw);
  out[0] = c * x + s * z + T.t[0];
  out[1] = y + T.t[1];
  out[2] = -s * x + c * z + T.t[2];
  return out;
}

/** Distance field of a point set on a voxel grid (two-pass 3-4-5 chamfer transform), queried by trilinear interpolation. */
export class DistanceField {
  private d: Float32Array;
  private nx: number;
  private ny: number;
  private nz: number;
  private min: Vec3;
  private cell: number;
  private far: number;
  constructor(pts: ArrayLike<number>, min: Vec3, max: Vec3, cell: number) {
    this.min = min; this.cell = cell;
    this.nx = Math.ceil((max[0] - min[0]) / cell) + 1; this.ny = Math.ceil((max[1] - min[1]) / cell) + 1; this.nz = Math.ceil((max[2] - min[2]) / cell) + 1;
    this.far = Math.max(this.nx, this.ny, this.nz) * cell;
    const nx = this.nx, ny = this.ny, nz = this.nz;
    const INF = 1e9;
    const g = new Float32Array(nx * ny * nz).fill(INF);
    for (let i = 0; i < pts.length / 3; i++) {
      const x = Math.round(((pts[i * 3] as number) - min[0]) / cell), y = Math.round(((pts[i * 3 + 1] as number) - min[1]) / cell), z = Math.round(((pts[i * 3 + 2] as number) - min[2]) / cell);
      if (x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz) g[(z * ny + y) * nx + x] = 0;
    }
    const W = [3, 4, 5];
    const at = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
    const relax = (x: number, y: number, z: number, dx: number, dy: number, dz: number) => {
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) return;
      const w = W[Math.abs(dx) + Math.abs(dy) + Math.abs(dz) - 1] as number;
      const v = (g[at(X, Y, Z)] as number) + w;
      if (v < (g[at(x, y, z)] as number)) g[at(x, y, z)] = v;
    };
    const fwd: Array<[number, number, number]> = [], bwd: Array<[number, number, number]> = [];
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy && !dz) continue;
      const first = dz < 0 || (dz === 0 && (dy < 0 || (dy === 0 && dx < 0)));
      (first ? fwd : bwd).push([dx, dy, dz]);
    }
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) for (const [dx, dy, dz] of fwd) relax(x, y, z, dx, dy, dz);
    for (let z = nz - 1; z >= 0; z--) for (let y = ny - 1; y >= 0; y--) for (let x = nx - 1; x >= 0; x--) for (const [dx, dy, dz] of bwd) relax(x, y, z, dx, dy, dz);
    const far = this.far;
    this.d = g.map((v) => (v >= INF ? far : (v / 3) * cell));
  }
  /** Distance (same units as the points) at a position; the border value outside the grid. */
  at(x: number, y: number, z: number): number {
    const fx = (x - this.min[0]) / this.cell, fy = (y - this.min[1]) / this.cell, fz = (z - this.min[2]) / this.cell;
    if (fx < 0 || fy < 0 || fz < 0 || fx >= this.nx - 1 || fy >= this.ny - 1 || fz >= this.nz - 1) return this.far;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz), ax = fx - x0, ay = fy - y0, az = fz - z0;
    const nx = this.nx, ny = this.ny, d = this.d;
    const v = (xx: number, yy: number, zz: number) => d[(zz * ny + yy) * nx + xx] as number;
    const c00 = v(x0, y0, z0) * (1 - ax) + v(x0 + 1, y0, z0) * ax, c10 = v(x0, y0 + 1, z0) * (1 - ax) + v(x0 + 1, y0 + 1, z0) * ax;
    const c01 = v(x0, y0, z0 + 1) * (1 - ax) + v(x0 + 1, y0, z0 + 1) * ax, c11 = v(x0, y0 + 1, z0 + 1) * (1 - ax) + v(x0 + 1, y0 + 1, z0 + 1) * ax;
    return (c00 * (1 - ay) + c10 * ay) * (1 - az) + (c01 * (1 - ay) + c11 * ay) * az;
  }
}

/** Nelder-Mead minimiser (small dimension, no gradients). */
export function nelderMead(f: (x: number[]) => number, x0: number[], step: number[], iters = 400): { x: number[]; fx: number } {
  const n = x0.length;
  let sim = [x0.slice(), ...x0.map((_, i) => { const p = x0.slice(); p[i] = (p[i] as number) + (step[i] as number); return p; })];
  let fs = sim.map(f);
  for (let it = 0; it < iters; it++) {
    const order = fs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]).map((a) => a[1]);
    sim = order.map((i) => sim[i] as number[]);
    fs = order.map((i) => fs[i] as number);
    const cen = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) for (let d = 0; d < n; d++) cen[d] = (cen[d] as number) + (sim[i] as number[])[d]! / n;
    const worst = sim[n] as number[];
    const at = (k: number) => cen.map((c, d) => c + k * (worst[d]! - c));
    const xr = at(-1), fr = f(xr);
    if (fr < (fs[0] as number)) {
      const xe = at(-2), fe = f(xe);
      if (fe < fr) { sim[n] = xe; fs[n] = fe; } else { sim[n] = xr; fs[n] = fr; }
    } else if (fr < (fs[n - 1] as number)) { sim[n] = xr; fs[n] = fr; } else {
      const xc = at(fr < (fs[n] as number) ? -0.5 : 0.5), fc = f(xc);
      if (fc < Math.min(fr, fs[n] as number)) { sim[n] = xc; fs[n] = fc; } else {
        for (let i = 1; i <= n; i++) { sim[i] = (sim[i] as number[]).map((v, d) => (sim[0] as number[])[d]! + 0.5 * (v - (sim[0] as number[])[d]!)); fs[i] = f(sim[i] as number[]); }
      }
    }
  }
  let b = 0;
  for (let i = 1; i <= n; i++) if ((fs[i] as number) < (fs[b] as number)) b = i;
  return { x: sim[b] as number[], fx: fs[b] as number };
}

export interface FitInput {
  /** Visible mannequin surface points (xyz triples, model space), the neck included. */
  head: Float32Array;
  /** Head surface samples (head-local metres) and the face subset used for the reverse term. */
  surface: Float32Array;
  face: Float32Array;
}

export interface FitResult { T: Transform; cost: number; forward: number; reverse: number }

function trimmedMean(v: number[], keep: number): number {
  v.sort((a, b) => a - b);
  const n = Math.max(1, Math.floor(v.length * keep));
  let s = 0;
  for (let i = 0; i < n; i++) s += v[i] as number;
  return s / n;
}

/**
 * Fits the transform mannequin -> head-local. Forward term: each visible mannequin point should lie on the head surface (the
 * worst 35 % are ignored: neck, ears, stand, hair fragments). Reverse term: the face of the head should lie on mannequin points.
 */
export function fitHead(inp: FitInput, init: { scale: number; ty: number }): FitResult {
  const field = new DistanceField(inp.surface, [-0.14, -0.1, -0.14], [0.14, 0.3, 0.16], 0.004);
  const mfield = new DistanceField(inp.head, [-0.7, -0.7, -0.7], [0.7, 0.7, 0.7], 0.012);
  const step = Math.max(1, Math.floor(inp.head.length / 3 / 700));
  const sub: number[] = [];
  for (let i = 0; i < inp.head.length / 3; i += step) sub.push(inp.head[i * 3]!, inp.head[i * 3 + 1]!, inp.head[i * 3 + 2]!);
  const q: Vec3 = [0, 0, 0];
  const cost = (x: number[]): { c: number; f: number; r: number } => {
    const T: Transform = { s: [x[0]!, x[1]!, x[2]!], t: [x[3]!, x[4]!, x[5]!], yaw: x[6]! };
    // keep the scale near-isotropic: hair must not be distorted much
    const mean = (T.s[0] + T.s[1] + T.s[2]) / 3;
    const aniso = Math.abs(T.s[0] / mean - 1) + Math.abs(T.s[1] / mean - 1) + Math.abs(T.s[2] / mean - 1);
    const d: number[] = [];
    for (let i = 0; i < sub.length / 3; i++) { applyTransform(T, sub, i * 3, q); d.push(field.at(q[0], q[1], q[2])); }
    const f = trimmedMean(d, 0.65);
    // reverse: head face sample -> nearest mannequin point (inverse transform of the sample)
    const ci = Math.cos(-T.yaw), si = Math.sin(-T.yaw);
    let r = 0, rw = 0;
    const nf = inp.face.length / 3;
    for (let i = 0; i < nf; i++) {
      // face samples must have mannequin surface close by; dome samples only pull where there is data (the hair hides most of it)
      const dome = inp.face[i * 3 + 1]! > 0.15;
      const x0 = inp.face[i * 3]! - T.t[0], y0 = inp.face[i * 3 + 1]! - T.t[1], z0 = inp.face[i * 3 + 2]! - T.t[2];
      const mx = (ci * x0 + si * z0) / T.s[0], my = y0 / T.s[1], mz = (-si * x0 + ci * z0) / T.s[2];
      const w = dome ? 0.5 : 1;
      r += Math.min(mfield.at(mx, my, mz), dome ? 0.05 : 0.3) * mean * w;
      rw += w;
    }
    r /= rw;
    return { c: f + 0.8 * r + 0.004 * aniso, f, r };
  };
  let best: { x: number[]; fx: number } | null = null;
  for (const k of [0.8, 1, 1.25]) for (const dy of [-0.03, 0, 0.03]) {
    const s0 = init.scale * k;
    const res = nelderMead((x) => cost(x).c, [s0, s0, s0, 0, init.ty + dy, 0, 0], [s0 * 0.1, s0 * 0.1, s0 * 0.1, 0.01, 0.01, 0.01, 0.08], 220);
    if (!best || res.fx < best.fx) best = res;
  }
  const fin = nelderMead((x) => cost(x).c, best!.x, [best!.x[0]! * 0.04, best!.x[1]! * 0.04, best!.x[2]! * 0.04, 0.004, 0.004, 0.004, 0.03], 300);
  const c = cost(fin.x);
  return { T: { s: [fin.x[0]!, fin.x[1]!, fin.x[2]!], t: [fin.x[3]!, fin.x[4]!, fin.x[5]!], yaw: fin.x[6]! }, cost: c.c, forward: c.f, reverse: c.r };
}
