// Milestone 9 roofs, pure geometry and rules. A roof (Lot.roofs) covers a tile rectangle [x0, x1) x [z0, z1) and rests on
// the top of its level's walls. `buildRoofMesh` turns a style, size, ridge direction and pitch into flat triangle lists in
// plan metres (origin at the rectangle's min corner, y = 0 at the wall top), split into four parts so the renderer can
// give each its own material:
//   slope  the roof surface (finish material; uv in metres, divided by the finish's repeat)
//   gable  the triangles that close a gable end (the colour of the wall below)
//   trim   fascia, rake and soffit edges
//   glass  the vertical band of a clerestory
// Eaves overhang by EAVE metres on every side, gable ends by RAKE. The styles are the twelve of content/exterior.ts.
// Also here: roof rectangle rules (overlap, level support), the roof base height and the auto roof (rectangles covering
// the rooms of the top level).

import { EXTERIOR, type RoofStyleDef } from '../content/exterior';
import { edgeKey, tileKey } from '../core/ids';
import type { EdgeDir, Lot, Roof } from '../core/types';
import { DEFAULT_WALL_HEIGHT } from './walls';
import { computeRooms } from './rooms';

export const EAVE = 0.45;
export const RAKE = 0.14;
/** Thickness of the roof edge seen from the side. */
export const ROOF_EDGE = 0.14;
/** Height of one floor, mirrored from M9-core's LEVEL_HEIGHT (src/world/lots.ts exports it once M9-core lands). */
export const ROOF_LEVEL_HEIGHT = 3.0;

export type RoofPartKind = 'slope' | 'gable' | 'trim' | 'glass';
export interface RoofMeshPart { pos: number[]; nor: number[]; uv: number[] }
export interface RoofMeshData {
  parts: Record<RoofPartKind, RoofMeshPart>;
  /** Highest point above the wall top and lowest (the eave edge dips below it). */
  maxY: number;
  minY: number;
  triangles: number;
}

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Newell normal of a planar polygon. */
function newell(pts: V3[]): V3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x, y, z];
}

/** Ear-clipping triangulation of a simple planar polygon; returns index triples. */
function triangulate(pts: V3[], n: V3): Array<[number, number, number]> {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  const drop = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const p2 = pts.map((p) => (drop === 0 ? [p[1], p[2]] : drop === 1 ? [p[0], p[2]] : [p[0], p[1]]) as [number, number]);
  const sign = (drop === 0 ? n[0] : drop === 1 ? -n[1] : n[2]) >= 0 ? 1 : -1;
  const idx = pts.map((_, i) => i);
  const out: Array<[number, number, number]> = [];
  const cr = (a: number, b: number, c: number) => (p2[b]![0] - p2[a]![0]) * (p2[c]![1] - p2[a]![1]) - (p2[b]![1] - p2[a]![1]) * (p2[c]![0] - p2[a]![0]);
  const inside = (p: number, a: number, b: number, c: number) => {
    const d1 = cr(a, b, p), d2 = cr(b, c, p), d3 = cr(c, a, p);
    return (d1 >= -1e-9 && d2 >= -1e-9 && d3 >= -1e-9) || (d1 <= 1e-9 && d2 <= 1e-9 && d3 <= 1e-9);
  };
  let guard = 0;
  while (idx.length > 3 && guard++ < 200) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length]!, b = idx[i]!, c = idx[(i + 1) % idx.length]!;
      const area = cr(a, b, c) * sign;
      if (area <= 1e-9) continue;
      if (idx.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c) && Math.abs(cr(a, b, p)) + Math.abs(cr(b, c, p)) + Math.abs(cr(c, a, p)) > 1e-9)) continue;
      out.push([a, b, c]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push([idx[0]!, idx[1]!, idx[2]!]);
  return out;
}

class RoofBuilder {
  readonly parts: Record<RoofPartKind, RoofMeshPart> = {
    slope: { pos: [], nor: [], uv: [] }, gable: { pos: [], nor: [], uv: [] }, trim: { pos: [], nor: [], uv: [] }, glass: { pos: [], nor: [], uv: [] },
  };
  maxY = -Infinity;
  minY = Infinity;
  triangles = 0;

  /** Adds a planar polygon, oriented so its normal faces `outward` ('up' / 'down' pick the sign of y). */
  poly(kind: RoofPartKind, raw: V3[], outward: V3 | 'up' | 'down'): void {
    const pts: V3[] = [];
    for (const p of raw) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) > 1e-6) pts.push(p);
    }
    while (pts.length > 1 && Math.hypot(pts[0]![0] - pts[pts.length - 1]![0], pts[0]![1] - pts[pts.length - 1]![1], pts[0]![2] - pts[pts.length - 1]![2]) <= 1e-6) pts.pop();
    if (pts.length < 3) return;
    let n = newell(pts);
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-9) return;
    n = [n[0] / len, n[1] / len, n[2] / len];
    const want: V3 = outward === 'up' ? [0, 1, 0] : outward === 'down' ? [0, -1, 0] : outward;
    let ordered = pts;
    if (dot(n, want) < 0) { ordered = [...pts].reverse(); n = [-n[0], -n[1], -n[2]]; }
    const tris = triangulate(ordered, n);
    // planar uv basis: e1 horizontal along the face, e2 up the face
    const e1 = Math.abs(n[1]) > 0.999 ? ([1, 0, 0] as V3) : norm(cross([0, 1, 0], n));
    const e2 = cross(n, e1);
    const part = this.parts[kind];
    for (const [a, b, c] of tris) {
      for (const i of [a, b, c]) {
        const p = ordered[i]!;
        part.pos.push(p[0], p[1], p[2]);
        part.nor.push(n[0], n[1], n[2]);
        part.uv.push(dot(p, e1), dot(p, e2));
        this.maxY = Math.max(this.maxY, p[1]);
        this.minY = Math.min(this.minY, p[1]);
      }
      this.triangles++;
    }
  }
}

/** Piecewise-linear y of a profile at v. */
function profileY(profile: Array<[number, number]>, v: number): number {
  for (let i = 0; i < profile.length - 1; i++) {
    const [v0, y0] = profile[i]!, [v1, y1] = profile[i + 1]!;
    if (v >= Math.min(v0, v1) - 1e-9 && v <= Math.max(v0, v1) + 1e-9 && Math.abs(v1 - v0) > 1e-9) return y0 + ((y1 - y0) * (v - v0)) / (v1 - v0);
  }
  return profile[profile.length - 1]![1];
}

interface Frame {
  /** Maps (u along the ridge, v across, y) to the plan's (x, y, z). */
  p(u: number, v: number, y: number): V3;
  /** Maps a direction in (u, v, y). */
  d(u: number, v: number, y: number): V3;
}

function frameFor(ridge: EdgeDir, ox = 0, oz = 0): Frame {
  return ridge === 'h'
    ? { p: (u, v, y) => [ox + u, y, oz + v], d: (u, v, y) => [u, y, v] }
    : { p: (u, v, y) => [ox + v, y, oz + u], d: (u, v, y) => [v, y, u] };
}

interface Seg { kind: 'slope' | 'glass'; a: [number, number]; b: [number, number] }

/**
 * A prism along the ridge: `top` is the roof profile as (v, y) points from the left eave to the right eave. Slope segments
 * run from u = -rake to L + rake; the area under the profile within v in [0, S] is closed at both ends in `endKind`.
 */
function extrude(
  rb: RoofBuilder, f: Frame, L: number, S: number, top: Array<[number, number]>, segs: Seg[], o: { rake: number; thick: number; endKind: RoofPartKind; baseY?: number },
): void {
  const { rake, thick } = o;
  const base = o.baseY ?? 0;
  for (const s of segs) {
    const [v0, y0] = s.a, [v1, y1] = s.b;
    if (s.kind === 'glass') {
      const out = f.d(0, v1 > v0 ? -1 : 1, 0);
      rb.poly('glass', [f.p(0, v0, y0), f.p(L, v0, y0), f.p(L, v1, y1), f.p(0, v1, y1)], out);
      continue;
    }
    rb.poly('slope', [f.p(-rake, v0, y0), f.p(L + rake, v0, y0), f.p(L + rake, v1, y1), f.p(-rake, v1, y1)], 'up');
    // underside (only the overhanging parts are visible; drawn along the whole segment, it is hidden elsewhere)
    rb.poly('trim', [f.p(-rake, v0, y0 - thick), f.p(L + rake, v0, y0 - thick), f.p(L + rake, v1, y1 - thick), f.p(-rake, v1, y1 - thick)], 'down');
    // rake fascia at both ends
    for (const [u, sgn] of [[-rake, -1], [L + rake, 1]] as const) {
      rb.poly('trim', [f.p(u, v0, y0), f.p(u, v1, y1), f.p(u, v1, y1 - thick), f.p(u, v0, y0 - thick)], f.d(sgn, 0, 0));
    }
  }
  // eave fascia
  const first = top[0]!, last = top[top.length - 1]!;
  for (const [pt, side] of [[first, -1], [last, 1]] as const) {
    rb.poly('trim', [f.p(-rake, pt[0], pt[1]), f.p(L + rake, pt[0], pt[1]), f.p(L + rake, pt[0], pt[1] - thick), f.p(-rake, pt[0], pt[1] - thick)], f.d(0, side, 0));
  }
  // gable-end closures between the wall top and the profile, within the wall span
  const inner: Array<[number, number]> = [[0, profileY(top, 0)]];
  for (const [v, y] of top) if (v > 1e-6 && v < S - 1e-6) inner.push([v, y]);
  inner.push([S, profileY(top, S)]);
  for (const [u, sgn] of [[0, -1], [L, 1]] as const) {
    const ring: V3[] = [f.p(u, 0, base), ...inner.map(([v, y]) => f.p(u, v, y)), f.p(u, S, base)];
    // the wall top is at base; profile points below it (the shed's low eave) are clipped to the wall top
    rb.poly(o.endKind, ring.map((p) => [p[0], Math.max(p[1], base), p[2]] as V3), f.d(sgn, 0, 0));
  }
}

/** Layered rectangles for hip, pyramid and mansard: each ring joins two nested rectangles. */
interface Layer { x0: number; z0: number; x1: number; z1: number; y: number }
function ring(rb: RoofBuilder, a: Layer, b: Layer): void {
  const A = (x: number, z: number, l: Layer): V3 => [x, l.y, z];
  const sides: Array<[V3, V3, V3, V3]> = [
    [A(a.x0, a.z0, a), A(a.x1, a.z0, a), A(b.x1, b.z0, b), A(b.x0, b.z0, b)], // north
    [A(a.x1, a.z0, a), A(a.x1, a.z1, a), A(b.x1, b.z1, b), A(b.x1, b.z0, b)], // east
    [A(a.x1, a.z1, a), A(a.x0, a.z1, a), A(b.x0, b.z1, b), A(b.x1, b.z1, b)], // south
    [A(a.x0, a.z1, a), A(a.x0, a.z0, a), A(b.x0, b.z0, b), A(b.x0, b.z1, b)], // west
  ];
  for (const s of sides) rb.poly('slope', s, 'up');
}

/** Edge of a layered roof: fascia and soffit around the outer ring. */
function layerEdge(rb: RoofBuilder, l: Layer, thick: number): void {
  const pts: V3[] = [[l.x0, l.y, l.z0], [l.x1, l.y, l.z0], [l.x1, l.y, l.z1], [l.x0, l.y, l.z1]];
  const outs: V3[] = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];
  for (let i = 0; i < 4; i++) {
    const a = pts[i]!, b = pts[(i + 1) % 4]!;
    rb.poly('trim', [a, b, [b[0], b[1] - thick, b[2]], [a[0], a[1] - thick, a[2]]], outs[i]!);
  }
  rb.poly('trim', pts.map((p) => [p[0], p[1] - thick, p[2]] as V3), 'down');
}

const rad = (deg: number) => (deg * Math.PI) / 180;

function roofStyleOf(id: string): RoofStyleDef {
  const s = EXTERIOR.roofStyles[id];
  if (!s) throw new Error(`unknown roof style ${id}`);
  return s;
}

/** The mesh data of a roof style over a w x d metre rectangle. */
export function buildRoofMesh(styleId: string, w: number, d: number, ridge: EdgeDir, pitchDeg: number): RoofMeshData {
  const st = roofStyleOf(styleId);
  const rb = new RoofBuilder();
  const pitch = Math.max(st.pitchMin, Math.min(st.pitchMax, pitchDeg));
  const t = Math.tan(rad(pitch));
  const e = EAVE, th = ROOF_EDGE;
  const hipLike = (): { min: number; max: number } => ({ min: Math.min(w, d), max: Math.max(w, d) });
  // directional styles run the ridge along `ridge`: L along it, S across it
  const L = ridge === 'h' ? w : d, S = ridge === 'h' ? d : w;
  const f = frameFor(ridge);

  switch (styleId) {
    case 'gable': {
      const top: Array<[number, number]> = [[-e, -e * t], [S / 2, (S / 2) * t], [S + e, -e * t]];
      extrude(rb, f, L, S, top, [{ kind: 'slope', a: top[0]!, b: top[1]! }, { kind: 'slope', a: top[1]!, b: top[2]! }], { rake: RAKE, thick: th, endKind: 'gable' });
      break;
    }
    case 'a-frame': {
      const ee = 0.22;
      const top: Array<[number, number]> = [[-ee, -ee * t], [S / 2, (S / 2) * t], [S + ee, -ee * t]];
      extrude(rb, f, L, S, top, [{ kind: 'slope', a: top[0]!, b: top[1]! }, { kind: 'slope', a: top[1]!, b: top[2]! }], { rake: RAKE, thick: 0.1, endKind: 'gable' });
      break;
    }
    case 'shed': {
      const top: Array<[number, number]> = [[-e, -e * t], [S + e, (S + e) * t]];
      extrude(rb, f, L, S, top, [{ kind: 'slope', a: top[0]!, b: top[1]! }], { rake: RAKE, thick: th, endKind: 'gable' });
      break;
    }
    case 'flat': {
      const y = 0.14, ee = 0.3;
      const top: Array<[number, number]> = [[-ee, y], [S + ee, y]];
      extrude(rb, f, L, S, top, [{ kind: 'slope', a: top[0]!, b: top[1]! }], { rake: 0.3, thick: 0.14, endKind: 'trim' });
      break;
    }
    case 'saltbox': {
      const vr = S / 3, t2 = (vr * t) / (S - vr);
      const top: Array<[number, number]> = [[-e, -e * t], [vr, vr * t], [S + e, -e * t2]];
      extrude(rb, f, L, S, top, [{ kind: 'slope', a: top[0]!, b: top[1]! }, { kind: 'slope', a: top[1]!, b: top[2]! }], { rake: RAKE, thick: th, endKind: 'gable' });
      break;
    }
    case 'butterfly': {
      const hEdge = (S / 2) * t + 0.3, valley = 0.25;
      const top: Array<[number, number]> = [[-e, hEdge + e * t], [S / 2, valley], [S + e, hEdge + e * t]];
      extrude(rb, f, L, S, top, [{ kind: 'slope', a: top[0]!, b: top[1]! }, { kind: 'slope', a: top[1]!, b: top[2]! }], { rake: RAKE, thick: th, endKind: 'gable' });
      break;
    }
    case 'gambrel': {
      const tu = Math.tan(rad(24)), a = Math.min(S * 0.2, 1.6), ya = a * t;
      const top: Array<[number, number]> = [[-e, -e * t], [a, ya], [S / 2, ya + (S / 2 - a) * tu], [S - a, ya], [S + e, -e * t]];
      extrude(rb, f, L, S, top, top.slice(0, -1).map((p, i) => ({ kind: 'slope' as const, a: p, b: top[i + 1]! })), { rake: RAKE, thick: th, endKind: 'gable' });
      break;
    }
    case 'clerestory': {
      const vb = S * 0.32, h1 = vb * t, band = 1.0;
      const top: Array<[number, number]> = [[-e, -e * t], [vb, h1], [vb, h1 + band], [S + e, h1 + band + (S + e - vb) * t * 0.35]];
      extrude(rb, f, L, S, top, [
        { kind: 'slope', a: top[0]!, b: top[1]! }, { kind: 'glass', a: top[1]!, b: top[2]! }, { kind: 'slope', a: top[2]!, b: top[3]! },
      ], { rake: RAKE, thick: th, endKind: 'gable' });
      break;
    }
    case 'hip': {
      const { min } = hipLike();
      const i = min / 2;
      const outer: Layer = { x0: -e, z0: -e, x1: w + e, z1: d + e, y: -e * t };
      const top: Layer = { x0: i, z0: i, x1: w - i, z1: d - i, y: i * t };
      ring(rb, outer, top);
      layerEdge(rb, outer, th);
      break;
    }
    case 'pyramid': {
      const outer: Layer = { x0: -e, z0: -e, x1: w + e, z1: d + e, y: -e * t };
      const cx = w / 2, cz = d / 2, apex = Math.min(w, d) / 2 * t;
      const top: Layer = { x0: cx, z0: cz, x1: cx, z1: cz, y: apex };
      ring(rb, outer, top);
      layerEdge(rb, outer, th);
      break;
    }
    case 'mansard': {
      const { min } = hipLike();
      const tl = t, i1 = Math.max(0.5, Math.min(1.4, min * 0.17)), y1 = i1 * tl;
      const i2 = Math.max(i1 + 0.25, min / 2 - 0.2);
      const y2 = y1 + (i2 - i1) * 0.18;
      const outer: Layer = { x0: -0.25, z0: -0.25, x1: w + 0.25, z1: d + 0.25, y: -0.25 * tl };
      const l1: Layer = { x0: i1, z0: i1, x1: w - i1, z1: d - i1, y: y1 };
      const l2: Layer = { x0: Math.min(i2, w / 2), z0: Math.min(i2, d / 2), x1: Math.max(w - i2, w / 2), z1: Math.max(d - i2, d / 2), y: y2 };
      ring(rb, outer, l1);
      ring(rb, l1, l2);
      if (l2.x1 - l2.x0 > 1e-6 && l2.z1 - l2.z0 > 1e-6) {
        rb.poly('slope', [[l2.x0, l2.y, l2.z0], [l2.x1, l2.y, l2.z0], [l2.x1, l2.y, l2.z1], [l2.x0, l2.y, l2.z1]], 'up');
      }
      layerEdge(rb, outer, th);
      break;
    }
    case 'dutch-gable': {
      const { min } = hipLike();
      const i1 = Math.max(0.5, min * 0.22), y1 = i1 * t;
      const outer: Layer = { x0: -e, z0: -e, x1: w + e, z1: d + e, y: -e * t };
      const l1: Layer = { x0: i1, z0: i1, x1: w - i1, z1: d - i1, y: y1 };
      ring(rb, outer, l1);
      layerEdge(rb, outer, th);
      // the small gable on the flat top: ridge along the long side of the remaining rectangle
      const rw = w - 2 * i1, rd = d - 2 * i1;
      const along: EdgeDir = ridge === 'h' ? (rw >= rd * 0.8 ? 'h' : 'v') : (rd >= rw * 0.8 ? 'v' : 'h');
      const Lp = along === 'h' ? rw : rd, Sp = along === 'h' ? rd : rw;
      const fp = frameFor(along, i1, i1);
      const tp = t * 1.15, ep = 0.12;
      const top: Array<[number, number]> = [[-ep, y1 - ep * tp], [Sp / 2, y1 + (Sp / 2) * tp], [Sp + ep, y1 - ep * tp]];
      // the prism sits on the flat top: its own eaves overhang slightly, its ends are closed with wall-colour gables
      extrude(rb, fp, Lp, Sp, top, [{ kind: 'slope', a: top[0]!, b: top[1]! }, { kind: 'slope', a: top[1]!, b: top[2]! }], { rake: 0.08, thick: 0.1, endKind: 'gable', baseY: y1 });
      break;
    }
    default:
      throw new Error(`unknown roof style ${styleId}`);
  }
  return { parts: rb.parts, maxY: rb.maxY, minY: rb.minY, triangles: rb.triangles };
}

/** The ridge direction that follows the long side of a rectangle. */
export function longRidge(w: number, d: number): EdgeDir { return w >= d ? 'h' : 'v'; }

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------

export interface RoofRect { x0: number; z0: number; x1: number; z1: number }

export function roofArea(r: RoofRect): number { return Math.max(0, r.x1 - r.x0) * Math.max(0, r.z1 - r.z0); }

export function roofsOverlap(a: RoofRect, b: RoofRect): boolean { return a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1; }

/** Height of the wall top of a level under a roof: the tallest wall standing on the rectangle's outline, else the standard height. */
export function roofBaseHeight(lot: Lot, level: number, r: RoofRect): number {
  let h = 0;
  const consider = (dir: EdgeDir, x: number, z: number) => { const w = lot.walls[edgeKey(level, dir, x, z)]; if (w) h = Math.max(h, w.height); };
  for (let x = r.x0; x < r.x1; x++) { consider('h', x, r.z0); consider('h', x, r.z1); }
  for (let z = r.z0; z < r.z1; z++) { consider('v', r.x0, z); consider('v', r.x1, z); }
  return level * ROOF_LEVEL_HEIGHT + (h || DEFAULT_WALL_HEIGHT);
}

/** Whether a tile has a floor on the given level (the support test for a roof). */
function floored(lot: Lot, level: number, x: number, z: number): boolean { return !!lot.floors[tileKey(level, x, z)]; }

/** Tiles of the rectangle that have a floor on the roof's level. A roof with none has nothing to cover. */
export function coveredTiles(lot: Lot, level: number, r: RoofRect): number {
  let n = 0;
  for (let z = r.z0; z < r.z1; z++) for (let x = r.x0; x < r.x1; x++) if (floored(lot, level, x, z)) n++;
  return n;
}

/** True when something holds the roof up: a floored tile under it, or a wall of its level on its outline. */
export function hasRoofSupport(lot: Lot, level: number, r: RoofRect): boolean {
  if (coveredTiles(lot, level, r) > 0) return true;
  for (let x = r.x0; x < r.x1; x++) if (lot.walls[edgeKey(level, 'h', x, r.z0)] || lot.walls[edgeKey(level, 'h', x, r.z1)]) return true;
  for (let z = r.z0; z < r.z1; z++) if (lot.walls[edgeKey(level, 'v', r.x0, z)] || lot.walls[edgeKey(level, 'v', r.x1, z)]) return true;
  return false;
}

export interface LevelRect extends RoofRect { level: number }

/**
 * Rectangles for an auto roof: the enclosed rooms of every level, minus the tiles that have a floor above them (those are roofed by the
 * level above), grouped into rectangles by a greedy row merge (largest first), so an L-shaped house gets two roofs rather than one that
 * overhangs the garden. With `level`, only that level's rooms. Pure and deterministic, ordered by level, then top-left corner.
 */
export function autoRoofRects(lot: Lot, level?: number): LevelRect[] {
  const used = Math.max(0, ...Object.values(lot.walls).map((w) => w.level), ...Object.keys(lot.floors).map((k) => Number(k.split(':')[0])));
  const out: LevelRect[] = [];
  // from the top down: what a level above covers (its enclosed rooms and its floors, stairwells included) is roofed by that level
  const above = new Set<string>();
  const wanted = (L: number) => level === undefined || level === L;
  for (let L = Math.max(used, level ?? 0); L >= 0; L--) {
    const tiles = new Set<string>();
    const rooms = new Set<string>();
    for (const room of computeRooms(lot, L)) {
      if (room.outdoor) continue;
      for (const t of room.tiles) { rooms.add(`${t.x},${t.z}`); if (!above.has(`${t.x},${t.z}`)) tiles.add(`${t.x},${t.z}`); }
    }
    for (const k of rooms) above.add(k);
    for (const k of Object.keys(lot.floors)) { const [lv, x, z] = k.split(':').map(Number) as [number, number, number]; if (lv === L) above.add(`${x},${z}`); }
    if (!wanted(L)) continue;
    const rects: RoofRect[] = [];
    const taken = new Set<string>();
    const sorted = [...tiles].map((k) => k.split(',').map(Number) as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [x, z] of sorted) {
      if (taken.has(`${x},${z}`)) continue;
      let x1 = x;
      while (tiles.has(`${x1 + 1},${z}`) && !taken.has(`${x1 + 1},${z}`)) x1++;
      let z1 = z;
      const rowOk = (zz: number) => { for (let xx = x; xx <= x1; xx++) if (!tiles.has(`${xx},${zz}`) || taken.has(`${xx},${zz}`)) return false; return true; };
      while (rowOk(z1 + 1)) z1++;
      for (let zz = z; zz <= z1; zz++) for (let xx = x; xx <= x1; xx++) taken.add(`${xx},${zz}`);
      rects.push({ x0: x, z0: z, x1: x1 + 1, z1: z1 + 1 });
    }
    // merge neighbouring rectangles of equal extent into one roof so a rectangular house is one roof
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < rects.length && !merged; i++) {
        for (let j = i + 1; j < rects.length && !merged; j++) {
          const a = rects[i]!, b = rects[j]!;
          if (a.x0 === b.x0 && a.x1 === b.x1 && (a.z1 === b.z0 || b.z1 === a.z0)) { rects[i] = { x0: a.x0, x1: a.x1, z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) }; rects.splice(j, 1); merged = true; }
          else if (a.z0 === b.z0 && a.z1 === b.z1 && (a.x1 === b.x0 || b.x1 === a.x0)) { rects[i] = { z0: a.z0, z1: a.z1, x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1) }; rects.splice(j, 1); merged = true; }
        }
      }
    }
    rects.sort((a, b) => a.z0 - b.z0 || a.x0 - b.x0);
    for (const r of rects) out.push({ ...r, level: L });
  }
  return out.sort((a, b) => a.level - b.level || a.z0 - b.z0 || a.x0 - b.x0);
}

export function roofOf(lot: Lot, id: string): Roof | undefined { return lot.roofs?.[id]; }
