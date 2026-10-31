// Plain (three.js-free) mesh assembly used by every generator: positions, skin, custom attributes, morph
// deltas and indices in growable arrays, plus helpers for ring grids, swept tubes and smooth normals.
// src/characters/geometry.ts converts a MeshData into a THREE.BufferGeometry.

import type { Skin, Vec3 } from './rig';

export interface MeshData {
  positions: number[];
  normals: number[];
  indices: number[];
  skinIndex: number[];
  skinWeight: number[];
  /** Custom vertex attributes (e.g. aInfo, aCloth) with their item size. */
  attrs: Record<string, { size: number; data: number[] }>;
  /** Morph target deltas by name (relative), 3 floats per vertex. */
  morphs: Record<string, number[]>;
}

export function emptyMesh(attrSizes: Record<string, number> = {}, morphNames: readonly string[] = []): MeshData {
  const attrs: MeshData['attrs'] = {};
  for (const [k, size] of Object.entries(attrSizes)) attrs[k] = { size, data: [] };
  const morphs: MeshData['morphs'] = {};
  for (const m of morphNames) morphs[m] = [];
  return { positions: [], normals: [], indices: [], skinIndex: [], skinWeight: [], attrs, morphs };
}

export function vertexCount(m: MeshData): number { return m.positions.length / 3; }

/** Appends one vertex; missing attribute values are zero-filled, missing morphs are zero deltas. */
export function addVertex(m: MeshData, p: Vec3, skin: Skin, attrs: Record<string, ArrayLike<number>> = {}, morphs: Record<string, Vec3> = {}, n?: Vec3): number {
  const i = m.positions.length / 3;
  m.positions.push(p[0], p[1], p[2]);
  m.normals.push(n ? n[0] : 0, n ? n[1] : 0, n ? n[2] : 0);
  m.skinIndex.push(skin.j[0], skin.j[1], skin.j[2], skin.j[3]);
  m.skinWeight.push(skin.w[0], skin.w[1], skin.w[2], skin.w[3]);
  for (const [k, a] of Object.entries(m.attrs)) {
    const v = attrs[k];
    for (let c = 0; c < a.size; c++) a.data.push(v ? ((v[c] as number) ?? 0) : 0);
  }
  for (const [k, arr] of Object.entries(m.morphs)) {
    const d = morphs[k];
    arr.push(d ? d[0] : 0, d ? d[1] : 0, d ? d[2] : 0);
  }
  return i;
}

export function addTri(m: MeshData, a: number, b: number, c: number): void { m.indices.push(a, b, c); }

/** Appends `src` into `dst` (attributes/morphs present in dst only; others are dropped, missing zero-filled). */
export function appendMesh(dst: MeshData, src: MeshData): void {
  const base = dst.positions.length / 3;
  const n = src.positions.length / 3;
  dst.positions.push(...src.positions);
  dst.normals.push(...(src.normals.length === src.positions.length ? src.normals : new Array(n * 3).fill(0)));
  dst.skinIndex.push(...src.skinIndex);
  dst.skinWeight.push(...src.skinWeight);
  for (const [k, a] of Object.entries(dst.attrs)) {
    const s = src.attrs[k];
    if (s && s.size === a.size) a.data.push(...s.data);
    else for (let i = 0; i < n * a.size; i++) a.data.push(0);
  }
  for (const [k, arr] of Object.entries(dst.morphs)) {
    const s = src.morphs[k];
    if (s) arr.push(...s);
    else for (let i = 0; i < n * 3; i++) arr.push(0);
  }
  for (const i of src.indices) dst.indices.push(i + base);
}

/**
 * Quad strips between consecutive rings of `cols` vertices (closed around). `ring(r)` returns the first
 * vertex index of ring r. `flip` reverses the winding.
 */
export function stitchRings(m: MeshData, ringStarts: number[], cols: number, flip = false, closed = true): void {
  for (let r = 0; r + 1 < ringStarts.length; r++) {
    const a0 = ringStarts[r] as number;
    const b0 = ringStarts[r + 1] as number;
    const n = closed ? cols : cols - 1;
    for (let c = 0; c < n; c++) {
      const c1 = (c + 1) % cols;
      const a = a0 + c, b = a0 + c1, d = b0 + c, e = b0 + c1;
      if (flip) { addTri(m, a, d, b); addTri(m, b, d, e); }
      else { addTri(m, a, b, d); addTri(m, b, e, d); }
    }
  }
}

/** Triangle fan from a centre vertex to a ring. */
export function fan(m: MeshData, center: number, ringStart: number, cols: number, flip = false): void {
  for (let c = 0; c < cols; c++) {
    const a = ringStart + c, b = ringStart + ((c + 1) % cols);
    if (flip) addTri(m, center, b, a); else addTri(m, center, a, b);
  }
}

/** Area-weighted smooth normals; vertices closer than `weld` share one normal (hides seams between parts). */
export function computeSmoothNormals(m: MeshData, weld = 1e-5, only?: { from: number; to: number }): void {
  const n = m.positions.length / 3;
  const from = only?.from ?? 0;
  const to = only?.to ?? n;
  const key = (i: number) => {
    const p = m.positions;
    return `${Math.round((p[i * 3] as number) / weld)},${Math.round((p[i * 3 + 1] as number) / weld)},${Math.round((p[i * 3 + 2] as number) / weld)}`;
  };
  const group = new Map<string, number>();
  const gid = new Int32Array(n);
  let groups = 0;
  for (let i = from; i < to; i++) {
    const k = key(i);
    let g = group.get(k);
    if (g === undefined) { g = groups++; group.set(k, g); }
    gid[i] = g;
  }
  const acc = new Float64Array(groups * 3);
  const p = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t] as number, b = m.indices[t + 1] as number, c = m.indices[t + 2] as number;
    if (a < from || a >= to || b < from || b >= to || c < from || c >= to) continue;
    const ux = (p[b * 3] as number) - (p[a * 3] as number), uy = (p[b * 3 + 1] as number) - (p[a * 3 + 1] as number), uz = (p[b * 3 + 2] as number) - (p[a * 3 + 2] as number);
    const vx = (p[c * 3] as number) - (p[a * 3] as number), vy = (p[c * 3 + 1] as number) - (p[a * 3 + 1] as number), vz = (p[c * 3 + 2] as number) - (p[a * 3 + 2] as number);
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      const g = gid[v] as number;
      acc[g * 3] = (acc[g * 3] as number) + nx; acc[g * 3 + 1] = (acc[g * 3 + 1] as number) + ny; acc[g * 3 + 2] = (acc[g * 3 + 2] as number) + nz;
    }
  }
  for (let i = from; i < to; i++) {
    const g = gid[i] as number;
    const x = acc[g * 3] as number, y = acc[g * 3 + 1] as number, z = acc[g * 3 + 2] as number;
    const l = Math.hypot(x, y, z) || 1;
    m.normals[i * 3] = x / l; m.normals[i * 3 + 1] = y / l; m.normals[i * 3 + 2] = z / l;
  }
}

/** Mirrors a mesh across x = 0 (positions, normals, winding); `boneMirror` maps joint indices. */
export function mirrorMesh(src: MeshData, boneMirror: (j: number) => number, mirrorAttr: Record<string, number[]> = {}): MeshData {
  const out: MeshData = {
    positions: src.positions.slice(), normals: src.normals.slice(), indices: [], skinIndex: src.skinIndex.map(boneMirror), skinWeight: src.skinWeight.slice(),
    attrs: {}, morphs: {},
  };
  for (let i = 0; i < out.positions.length; i += 3) { out.positions[i] = -(out.positions[i] as number); out.normals[i] = -(out.normals[i] as number); }
  for (const [k, a] of Object.entries(src.attrs)) {
    const data = a.data.slice();
    const neg = mirrorAttr[k];
    if (neg) for (let i = 0; i < data.length; i += a.size) for (const c of neg) data[i + c] = -(data[i + c] as number);
    out.attrs[k] = { size: a.size, data };
  }
  for (const [k, d] of Object.entries(src.morphs)) {
    const arr = d.slice();
    for (let i = 0; i < arr.length; i += 3) arr[i] = -(arr[i] as number);
    out.morphs[k] = arr;
  }
  for (let t = 0; t < src.indices.length; t += 3) out.indices.push(src.indices[t] as number, src.indices[t + 2] as number, src.indices[t + 1] as number);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------------------------

export const v3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
  norm: (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  madd: (a: Vec3, b: Vec3, s: number): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
};

// ---------------------------------------------------------------------------------------------
// Swept tubes (fingers, ponytails, braids, straps, glasses frames...)
// ---------------------------------------------------------------------------------------------

export interface SweepOptions {
  /** Path points. */
  path: Vec3[];
  /** Half extents of the cross-section along the frame's X and Y axes, per path point. */
  rx: number[];
  ry?: number[];
  /** Ring segments. */
  segments: number;
  /** Superellipse exponent (2 = ellipse, larger = boxier). */
  exponent?: number;
  /** Preferred direction of the frame's Y axis. */
  up?: Vec3;
  /** Number of extra rings forming rounded caps (0 = flat fan). */
  capStart?: number;
  capEnd?: number;
  /** Close ends at all. */
  closeStart?: boolean;
  closeEnd?: boolean;
}

export interface SweepVertex { p: Vec3; t: number; around: number; ring: number; n: Vec3 }

/**
 * Sweeps a cross-section along a path. Calls `emit` for each vertex (returning its mesh index) so callers can
 * attach skin and attributes; triangles are added to `m`.
 */
export function sweep(m: MeshData, o: SweepOptions, emit: (v: SweepVertex) => number): void {
  const n = o.path.length;
  const seg = o.segments;
  const ex = o.exponent ?? 2;
  const up0: Vec3 = o.up ?? [0, 1, 0];
  const ry = o.ry ?? o.rx;
  // cumulative length
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) cum.push((cum[i - 1] as number) + v3.len(v3.sub(o.path[i] as Vec3, o.path[i - 1] as Vec3)));
  const total = (cum[n - 1] as number) || 1;
  const tangents: Vec3[] = o.path.map((_, i) => v3.norm(v3.sub(o.path[Math.min(n - 1, i + 1)] as Vec3, o.path[Math.max(0, i - 1)] as Vec3)));
  // frames: X = up x T, Y = T x X (with parallel transport of the up hint)
  const frames: Array<{ X: Vec3; Y: Vec3 }> = [];
  let up = up0;
  for (let i = 0; i < n; i++) {
    const T = tangents[i] as Vec3;
    let X = v3.cross(up, T);
    if (v3.len(X) < 1e-6) X = v3.cross([1, 0, 0], T);
    X = v3.norm(X);
    const Y = v3.norm(v3.cross(T, X));
    frames.push({ X, Y });
    up = Y;
  }
  const se = (c: number) => Math.sign(c) * Math.pow(Math.abs(c), 2 / ex);
  const ringStarts: number[] = [];
  const addRing = (center: Vec3, X: Vec3, Y: Vec3, ax: number, ay: number, t: number, ring: number) => {
    let first = -1;
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const c = se(Math.cos(a)), s = se(Math.sin(a));
      const off = v3.add(v3.scale(X, c * ax), v3.scale(Y, s * ay));
      const nrm = v3.norm(v3.add(v3.scale(X, c / Math.max(ax, 1e-6)), v3.scale(Y, s / Math.max(ay, 1e-6))));
      const idx = emit({ p: v3.add(center, off), t, around: k / seg, ring, n: nrm });
      if (k === 0) first = idx;
    }
    ringStarts.push(first);
  };
  let ringNo = 0;
  const capS = o.capStart ?? 0;
  const capE = o.capEnd ?? 0;
  const T0 = tangents[0] as Vec3;
  const Tn = tangents[n - 1] as Vec3;
  const f0 = frames[0]!;
  const fn = frames[n - 1]!;
  // start cap rings (rounded)
  for (let c = capS; c >= 1; c--) {
    const ang = (c / (capS + 1)) * (Math.PI / 2);
    const k = Math.cos(ang);
    const back = Math.sin(ang) * Math.min(o.rx[0] as number, ry[0] as number);
    addRing(v3.madd(o.path[0] as Vec3, T0, -back), f0.X, f0.Y, (o.rx[0] as number) * k, (ry[0] as number) * k, 0, ringNo++);
  }
  for (let i = 0; i < n; i++) addRing(o.path[i] as Vec3, frames[i]!.X, frames[i]!.Y, o.rx[i] as number, ry[i] as number, (cum[i] as number) / total, ringNo++);
  for (let c = 1; c <= capE; c++) {
    const ang = (c / (capE + 1)) * (Math.PI / 2);
    const k = Math.cos(ang);
    const fwd = Math.sin(ang) * Math.min(o.rx[n - 1] as number, ry[n - 1] as number);
    addRing(v3.madd(o.path[n - 1] as Vec3, Tn, fwd), fn.X, fn.Y, (o.rx[n - 1] as number) * k, (ry[n - 1] as number) * k, 1, ringNo++);
  }
  // orientation: X x Y = T and rings advance along +T, so (a, b, d) faces outward (no flip)
  stitchRings(m, ringStarts, seg, false);
  if (o.closeStart !== false) {
    const back = capS > 0 ? Math.min(o.rx[0] as number, ry[0] as number) : 0;
    const c = emit({ p: v3.madd(o.path[0] as Vec3, T0, -back), t: 0, around: 0, ring: -1, n: v3.scale(T0, -1) });
    fan(m, c, ringStarts[0] as number, seg, true);
  }
  if (o.closeEnd !== false) {
    const fwd = capE > 0 ? Math.min(o.rx[n - 1] as number, ry[n - 1] as number) : 0;
    const c = emit({ p: v3.madd(o.path[n - 1] as Vec3, Tn, fwd), t: 1, around: 0, ring: -2, n: Tn });
    fan(m, c, ringStarts[ringStarts.length - 1] as number, seg, false);
  }
}
