// Re-atlasing for the simplified Meshy bodies (used by tools/build-meshy-bodies.mts; pure, no DOM, no node modules).
// The generated meshes come with an atlas of hundreds of small charts, so no simplifier can reduce them without
// triangles that straddle charts. Instead the surface is simplified on its own (welded), cut into a few large planar
// charts (body region x projection axis, so a triangle never turns more than ~55 degrees away from its chart), packed
// into a new square atlas, and the new texels are filled from the source texture through the closest source surface
// point. Colours and the texel classes (skin / baked clothing / iris / brow) are transferred the same way.

export interface AtlasInput {
  positions: Float32Array;
  normals: Float32Array;
  index: Uint32Array;
  /** Body region per vertex (charts never mix regions). */
  region: Uint8Array;
}

export interface AtlasMesh {
  /** Source vertex of every new vertex (vertices are duplicated per chart). */
  source: Uint32Array;
  positions: Float32Array;
  normals: Float32Array;
  uv: Float32Array;
  index: Uint32Array;
  charts: number;
  /** Texels per metre the layout ended with (before the per-region density factors). */
  texelsPerMetre: number;
}

export interface AtlasOptions {
  size: number;
  /** Texel padding around every chart (bleed for filtering and mip levels). */
  pad: number;
  /** Relative texel density per region id (1 when missing). */
  density: Record<number, number>;
  /** Triangles in a chart component smaller than this are merged into a neighbouring chart. */
  minChartTris: number;
}

const axisOf = (n: [number, number, number]): number => {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  if (ax >= ay && ax >= az) return n[0] >= 0 ? 0 : 1;
  if (ay >= az) return n[1] >= 0 ? 2 : 3;
  return n[2] >= 0 ? 4 : 5;
};

/** Projection of a point onto the plane of axis a (0/1 = +-x, 2/3 = +-y, 4/5 = +-z). */
const project = (p: ArrayLike<number>, o: number, a: number): [number, number] => {
  const axis = a >> 1, sign = (a & 1) === 0 ? 1 : -1;
  if (axis === 0) return [-sign * (p[o + 2] as number), p[o + 1] as number];
  if (axis === 1) return [sign * (p[o] as number), -sign * (p[o + 2] as number)];
  return [sign * (p[o] as number), p[o + 1] as number];
};

export function buildAtlas(inp: AtlasInput, o: AtlasOptions): AtlasMesh {
  const { positions: P, normals: N, index, region } = inp;
  const nt = index.length / 3;
  // ---- face normals, region and axis per triangle ----
  const tReg = new Uint8Array(nt);
  const tAxis = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = index[t * 3] as number, b = index[t * 3 + 1] as number, c = index[t * 3 + 2] as number;
    const e1 = [P[b * 3]! - P[a * 3]!, P[b * 3 + 1]! - P[a * 3 + 1]!, P[b * 3 + 2]! - P[a * 3 + 2]!], e2 = [P[c * 3]! - P[a * 3]!, P[c * 3 + 1]! - P[a * 3 + 1]!, P[c * 3 + 2]! - P[a * 3 + 2]!];
    let n: [number, number, number] = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    // follow the vertex normals so the choice does not depend on the winding
    const vn = [N[a * 3]! + N[b * 3]! + N[c * 3]!, N[a * 3 + 1]! + N[b * 3 + 1]! + N[c * 3 + 1]!, N[a * 3 + 2]! + N[b * 3 + 2]! + N[c * 3 + 2]!];
    if (n[0] * vn[0]! + n[1] * vn[1]! + n[2] * vn[2]! < 0) n = [-n[0], -n[1], -n[2]];
    tAxis[t] = axisOf(n);
    const r = [region[a], region[b], region[c]];
    tReg[t] = r[0] === r[1] || r[0] === r[2] ? (r[0] as number) : (r[1] as number);
  }
  // ---- triangle adjacency through shared edges ----
  const edge = new Map<number, number[]>();
  const ek = (a: number, b: number) => (a < b ? a * 1_000_003 + b : b * 1_000_003 + a);
  for (let t = 0; t < nt; t++) for (let e = 0; e < 3; e++) {
    const k = ek(index[t * 3 + e] as number, index[t * 3 + ((e + 1) % 3)] as number);
    const l = edge.get(k);
    if (l) l.push(t); else edge.set(k, [t]);
  }
  const adj: number[][] = Array.from({ length: nt }, () => []);
  for (const l of edge.values()) for (const a of l) for (const b of l) if (a !== b) adj[a]!.push(b);
  const key = (t: number) => (tReg[t] as number) * 6 + (tAxis[t] as number);
  // ---- smooth the axis choice, then merge tiny components ----
  for (let it = 0; it < 3; it++) {
    const next = tAxis.slice();
    for (let t = 0; t < nt; t++) {
      const counts = new Map<number, number>();
      for (const q of adj[t]!) if (tReg[q] === tReg[t]) counts.set(tAxis[q] as number, (counts.get(tAxis[q] as number) ?? 0) + 1);
      if ((counts.get(tAxis[t] as number) ?? 0) > 0) continue;
      let best = -1, bc = 1;
      for (const [ax, c] of counts) if (c > bc) { bc = c; best = ax; }
      if (best >= 0) next[t] = best;
    }
    tAxis.set(next);
  }
  let chartOf = new Int32Array(nt);
  const components = (): number => {
    chartOf.fill(-1);
    let n = 0;
    for (let s = 0; s < nt; s++) {
      if (chartOf[s]! >= 0) continue;
      const stack = [s];
      chartOf[s] = n;
      while (stack.length) {
        const t = stack.pop() as number;
        for (const q of adj[t]!) if (chartOf[q]! < 0 && key(q) === key(t)) { chartOf[q] = n; stack.push(q); }
      }
      n++;
    }
    return n;
  };
  let nc = components();
  for (let pass = 0; pass < 3; pass++) {
    const size = new Int32Array(nc);
    for (let t = 0; t < nt; t++) size[chartOf[t] as number]!++;
    let changed = false;
    for (let t = 0; t < nt; t++) {
      if ((size[chartOf[t] as number] as number) >= o.minChartTris) continue;
      const counts = new Map<number, number>();
      for (const q of adj[t]!) if (tReg[q] === tReg[t] && (size[chartOf[q] as number] as number) >= o.minChartTris) counts.set(tAxis[q] as number, (counts.get(tAxis[q] as number) ?? 0) + 1);
      let best = -1, bc = 0;
      for (const [ax, c] of counts) if (c > bc) { bc = c; best = ax; }
      if (best >= 0) { tAxis[t] = best; changed = true; }
    }
    nc = components();
    if (!changed) break;
  }
  // ---- split vertices per chart and project ----
  const vmap = new Map<number, number>();
  const source: number[] = [];
  const planar: number[] = [];
  const idx: number[] = [];
  const chartVerts: number[][] = Array.from({ length: nc }, () => []);
  for (let t = 0; t < nt; t++) {
    const c = chartOf[t] as number;
    const ax = tAxis[t] as number;
    for (let e = 0; e < 3; e++) {
      const v = index[t * 3 + e] as number;
      const k = c * 4_000_037 + v;
      let nv = vmap.get(k);
      if (nv === undefined) {
        nv = source.length;
        vmap.set(k, nv);
        source.push(v);
        const [u, w] = project(P, v * 3, ax);
        planar.push(u, w);
        chartVerts[c]!.push(nv);
      }
      idx.push(nv);
    }
  }
  // ---- pack: shelf packing, binary search for the largest scale that fits ----
  const info = chartVerts.map((vs, c) => {
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const v of vs) { const u = planar[v * 2]!, w = planar[v * 2 + 1]!; if (u < u0) u0 = u; if (u > u1) u1 = u; if (w < v0) v0 = w; if (w > v1) v1 = w; }
    let reg = 0;
    for (let t = 0; t < nt; t++) if (chartOf[t] === c) { reg = tReg[t] as number; break; }
    return { c, u0, v0, w: u1 - u0, h: v1 - v0, d: o.density[reg] ?? 1 };
  });
  const place = (s: number) => {
    const rects = info.map((r) => ({ r, pw: Math.ceil(r.w * s * r.d) + 2 * o.pad + 1, ph: Math.ceil(r.h * s * r.d) + 2 * o.pad + 1 })).sort((a, b) => b.ph - a.ph);
    const out = new Map<number, { x: number; y: number; sc: number }>();
    let x = 0, y = 0, rowH = 0;
    for (const q of rects) {
      if (q.pw > o.size) return null;
      if (x + q.pw > o.size) { x = 0; y += rowH; rowH = 0; }
      if (y + q.ph > o.size) return null;
      out.set(q.r.c, { x, y, sc: s * q.r.d });
      x += q.pw;
      rowH = Math.max(rowH, q.ph);
    }
    return out;
  };
  let lo = 50, hi = 4000, best = place(lo);
  if (!best) throw new Error('atlas: charts do not fit even at the lowest density');
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const r = place(mid);
    if (r) { lo = mid; best = r; } else hi = mid;
  }
  const uv = new Float32Array(source.length * 2);
  for (const r of info) {
    const p = best.get(r.c)!;
    for (const v of chartVerts[r.c]!) {
      uv[v * 2] = (p.x + o.pad + 0.5 + (planar[v * 2]! - r.u0) * p.sc) / o.size;
      uv[v * 2 + 1] = (p.y + o.pad + 0.5 + (planar[v * 2 + 1]! - r.v0) * p.sc) / o.size;
    }
  }
  const src = Uint32Array.from(source);
  const positions = new Float32Array(src.length * 3), normals = new Float32Array(src.length * 3);
  src.forEach((s, i) => { for (let d = 0; d < 3; d++) { positions[i * 3 + d] = P[s * 3 + d] as number; normals[i * 3 + d] = N[s * 3 + d] as number; } });
  return { source: src, positions, normals, uv, index: Uint32Array.from(idx), charts: nc, texelsPerMetre: lo };
}

// ---------------------------------------------------------------------------------------------
// Texture transfer
// ---------------------------------------------------------------------------------------------

export interface SourceSurface {
  positions: Float32Array;
  index: Uint32Array;
  uv: Float32Array;
  rgb: Uint8Array;
  /** Class per texel of the source texture (optional). */
  classes: Uint8Array | null;
  size: number;
}

export interface BakeResult { rgb: Uint8Array; classes: Uint8Array; covered: Uint8Array }

/** Closest point of triangle (a, b, c) to p: barycentric weights and squared distance. */
function closestOnTriangle(p: number[], a: number[], b: number[], c: number[]): { w: [number, number, number]; d2: number } {
  const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], ac = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!], ap = [p[0]! - a[0]!, p[1]! - a[1]!, p[2]! - a[2]!];
  const dot = (u: number[], v: number[]) => u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!;
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  const fin = (w: [number, number, number]) => {
    const q = [a[0]! * w[0] + b[0]! * w[1] + c[0]! * w[2], a[1]! * w[0] + b[1]! * w[1] + c[1]! * w[2], a[2]! * w[0] + b[2]! * w[1] + c[2]! * w[2]];
    return { w, d2: (q[0]! - p[0]!) ** 2 + (q[1]! - p[1]!) ** 2 + (q[2]! - p[2]!) ** 2 };
  };
  if (d1 <= 0 && d2 <= 0) return fin([1, 0, 0]);
  const bp = [p[0]! - b[0]!, p[1]! - b[1]!, p[2]! - b[2]!];
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return fin([0, 1, 0]);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return fin([1 - v, v, 0]); }
  const cp = [p[0]! - c[0]!, p[1]! - c[1]!, p[2]! - c[2]!];
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return fin([0, 0, 1]);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return fin([1 - w, 0, w]); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return fin([0, 1 - w, w]); }
  const den = 1 / (va + vb + vc);
  const v = vb * den, w = vc * den;
  return fin([1 - v - w, v, w]);
}

/** Fills the new atlas from the source texture through the closest source surface point of every new texel. */
export function bakeAtlas(mesh: Pick<AtlasMesh, 'positions' | 'normals' | 'uv' | 'index'>, src: SourceSurface, size: number, padding: number): BakeResult {
  const nt = src.index.length / 3;
  // spatial grid of the source triangles (bounding boxes) and their face normals
  const cell = 0.02;
  const grid = new Map<number, number[]>();
  const cellKey = (x: number, y: number, z: number) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
  const fn = new Float32Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    const ids = [src.index[t * 3]!, src.index[t * 3 + 1]!, src.index[t * 3 + 2]!];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const v of ids) for (let d = 0; d < 3; d++) { const x = src.positions[v * 3 + d]!; if (x < lo[d]!) lo[d] = x; if (x > hi[d]!) hi[d] = x; }
    for (let x = Math.floor(lo[0]! / cell); x <= Math.floor(hi[0]! / cell); x++) for (let y = Math.floor(lo[1]! / cell); y <= Math.floor(hi[1]! / cell); y++) for (let z = Math.floor(lo[2]! / cell); z <= Math.floor(hi[2]! / cell); z++) {
      const k = cellKey(x, y, z);
      const l = grid.get(k);
      if (l) l.push(t); else grid.set(k, [t]);
    }
    const a = ids[0]!, b = ids[1]!, c = ids[2]!;
    const e1 = [src.positions[b * 3]! - src.positions[a * 3]!, src.positions[b * 3 + 1]! - src.positions[a * 3 + 1]!, src.positions[b * 3 + 2]! - src.positions[a * 3 + 2]!], e2 = [src.positions[c * 3]! - src.positions[a * 3]!, src.positions[c * 3 + 1]! - src.positions[a * 3 + 1]!, src.positions[c * 3 + 2]! - src.positions[a * 3 + 2]!];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
    for (let d = 0; d < 3; d++) fn[t * 3 + d] = n[d]! / l;
  }
  const vp = (v: number) => [src.positions[v * 3]!, src.positions[v * 3 + 1]!, src.positions[v * 3 + 2]!];
  const rgb = new Uint8Array(size * size * 3), classes = new Uint8Array(size * size), covered = new Uint8Array(size * size);
  const S = src.size;
  const nearest = (p: number[], n: number[]): { t: number; w: [number, number, number] } | null => {
    let best: { t: number; w: [number, number, number] } | null = null, bd = Infinity;
    const cx = Math.floor(p[0]! / cell), cy = Math.floor(p[1]! / cell), cz = Math.floor(p[2]! / cell);
    for (let r = 1; r <= 3 && !best; r++) {
      for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) {
        const l = grid.get(cellKey(x, y, z));
        if (!l) continue;
        for (const t of l) {
          // the texel's surface faces the same way as the source triangle (skips the opposite side of thin parts)
          if (fn[t * 3]! * n[0]! + fn[t * 3 + 1]! * n[1]! + fn[t * 3 + 2]! * n[2]! < 0.25) continue;
          const q = closestOnTriangle(p, vp(src.index[t * 3]!), vp(src.index[t * 3 + 1]!), vp(src.index[t * 3 + 2]!));
          if (q.d2 < bd) { bd = q.d2; best = { t, w: q.w }; }
        }
      }
    }
    return best;
  };
  const nTri = mesh.index.length / 3;
  for (let t = 0; t < nTri; t++) {
    const ids = [mesh.index[t * 3]!, mesh.index[t * 3 + 1]!, mesh.index[t * 3 + 2]!];
    const tx = ids.map((v) => mesh.uv[v * 2]! * size), ty = ids.map((v) => mesh.uv[v * 2 + 1]! * size);
    const den = (ty[1]! - ty[2]!) * (tx[0]! - tx[2]!) + (tx[2]! - tx[1]!) * (ty[0]! - ty[2]!);
    if (Math.abs(den) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(...tx) - 1)), x1 = Math.min(size - 1, Math.ceil(Math.max(...tx) + 1));
    const y0 = Math.max(0, Math.floor(Math.min(...ty) - 1)), y1 = Math.min(size - 1, Math.ceil(Math.max(...ty) + 1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const l0 = ((ty[1]! - ty[2]!) * (px - tx[2]!) + (tx[2]! - tx[1]!) * (py - ty[2]!)) / den;
      const l1 = ((ty[2]! - ty[0]!) * (px - tx[2]!) + (tx[0]! - tx[2]!) * (py - ty[2]!)) / den;
      const l2 = 1 - l0 - l1;
      const e = -0.02;
      if (l0 < e || l1 < e || l2 < e) continue;
      const k = y * size + x;
      if (covered[k]) continue;
      const p = [0, 1, 2].map((d) => l0 * mesh.positions[ids[0]! * 3 + d]! + l1 * mesh.positions[ids[1]! * 3 + d]! + l2 * mesh.positions[ids[2]! * 3 + d]!);
      const n = [0, 1, 2].map((d) => l0 * mesh.normals[ids[0]! * 3 + d]! + l1 * mesh.normals[ids[1]! * 3 + d]! + l2 * mesh.normals[ids[2]! * 3 + d]!);
      const nl = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
      const hit = nearest(p, [n[0]! / nl, n[1]! / nl, n[2]! / nl]);
      if (!hit) continue;
      const a = src.index[hit.t * 3]!, b = src.index[hit.t * 3 + 1]!, c = src.index[hit.t * 3 + 2]!;
      const u = (hit.w[0] * src.uv[a * 2]! + hit.w[1] * src.uv[b * 2]! + hit.w[2] * src.uv[c * 2]!) * S - 0.5;
      const v = (hit.w[0] * src.uv[a * 2 + 1]! + hit.w[1] * src.uv[b * 2 + 1]! + hit.w[2] * src.uv[c * 2 + 1]!) * S - 0.5;
      const iu = Math.max(0, Math.min(S - 2, Math.floor(u))), iv = Math.max(0, Math.min(S - 2, Math.floor(v)));
      const fu = Math.max(0, Math.min(1, u - iu)), fv = Math.max(0, Math.min(1, v - iv));
      for (let ch = 0; ch < 3; ch++) {
        const s00 = src.rgb[(iv * S + iu) * 3 + ch]!, s10 = src.rgb[(iv * S + iu + 1) * 3 + ch]!, s01 = src.rgb[((iv + 1) * S + iu) * 3 + ch]!, s11 = src.rgb[((iv + 1) * S + iu + 1) * 3 + ch]!;
        rgb[k * 3 + ch] = Math.round((s00 * (1 - fu) + s10 * fu) * (1 - fv) + (s01 * (1 - fu) + s11 * fu) * fv);
      }
      if (src.classes) classes[k] = src.classes[Math.min(S - 1, Math.max(0, Math.round(v))) * S + Math.min(S - 1, Math.max(0, Math.round(u)))]!;
      covered[k] = 1;
    }
  }
  // bleed into the padding
  const cov = covered.slice();
  bleed(rgb, classes, cov, size, padding);
  return { rgb, classes, covered };
}

function bleed(rgb: Uint8Array, classes: Uint8Array, covered: Uint8Array, size: number, rings: number): void {
  let cur = covered;
  for (let r = 0; r < rings; r++) {
    const next = cur.slice();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const k = y * size + x;
      if (cur[k]) continue;
      let sr = 0, sg = 0, sb = 0, c = 0, cls = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const q = yy * size + xx;
        if (!cur[q]) continue;
        sr += rgb[q * 3]!; sg += rgb[q * 3 + 1]!; sb += rgb[q * 3 + 2]!; c++; cls = classes[q]!;
      }
      if (c) { rgb[k * 3] = sr / c; rgb[k * 3 + 1] = sg / c; rgb[k * 3 + 2] = sb / c; classes[k] = cls; next[k] = 1; }
    }
    cur = next;
  }
}
