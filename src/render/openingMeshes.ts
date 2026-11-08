// Procedural door and window meshes, and the wall cut-out each opening needs.
//
// Local space of a built opening (place it with the renderer's wall transform):
//   origin = centre of the wall edge at floor level; +x runs along the wall (the tile spans x -0.5..0.5 for
//   a 1-tile opening), +y up, z across the wall thickness (wall faces at z = +-WALL_THICKNESS / 2).
//   Everything stays inside x -width/2..width/2, so neighbouring openings never overlap.
//
// Doors: the leaf is a child Group named OPENING_LEAF_NAME ('leaf') whose origin is the hinge axis (on the
// frame edge at -x, on the +z face of the closed leaf). Rotating it by a negative angle about y swings the
// door open toward +z; use setDoorOpen(). For a door that should open toward -z, or hinge on +x, pass
// { flip: true } (the whole opening is turned 180 degrees about y).
//
// Meshes are merged per material (frame, leaf, glass, hardware), so an opening costs 3-5 draw calls.
// Geometry and materials are shared between instances of the same definition: never dispose them on a
// single instance; call disposeOpeningMeshes() when tearing the renderer down.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { OpeningDef } from '../content/types';

export const WALL_THICKNESS = 0.12;
export const OPENING_LEAF_NAME = 'leaf';

/** The rectangle to cut out of the wall, in the opening's local space (x centred on the tile). */
export interface OpeningCutout {
  bottom: number;
  top: number;
  halfWidth: number;
}

function sNum(def: OpeningDef, key: string, fallback: number): number {
  const v = def.style[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function sStr(def: OpeningDef, key: string, fallback: string): string {
  const v = def.style[key];
  return typeof v === 'string' ? v : fallback;
}
function sBool(def: OpeningDef, key: string): boolean {
  return def.style[key] === true;
}

/** Hole width in metres (style.holeWidth, kept 4 cm inside the tile span). */
function holeWidth(def: OpeningDef): number {
  const fallback = def.width * (def.kind === 'door' ? 0.86 : 0.8);
  return Math.min(sNum(def, 'holeWidth', fallback), def.width - 0.04);
}

/** Wall hole for an opening: from `bottom` to `top` metres above the floor, x in [-halfWidth, halfWidth]. */
export function openingCutout(def: OpeningDef): OpeningCutout {
  const bottom = def.kind === 'door' ? 0 : def.sill;
  return { bottom, top: bottom + def.height, halfWidth: holeWidth(def) / 2 };
}

// ---------------------------------------------------------------------------------------------
// Materials (shared)
// ---------------------------------------------------------------------------------------------

type MaterialKind = 'paint' | 'wood' | 'metal' | 'glass' | 'frosted';
const materials = new Map<string, THREE.Material>();

function material(kind: MaterialKind, color: string): THREE.Material {
  const key = `${kind}:${color}`;
  let m = materials.get(key);
  if (m) return m;
  switch (kind) {
    case 'paint': m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0 }); break;
    case 'wood': m = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0 }); break;
    case 'metal': m = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.85 }); break;
    case 'glass':
      m = new THREE.MeshStandardMaterial({
        color: '#cfe4ec', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false,
        side: THREE.DoubleSide,
      });
      break;
    case 'frosted':
      m = new THREE.MeshStandardMaterial({
        color: '#eef3f3', roughness: 0.6, metalness: 0, transparent: true, opacity: 0.78, depthWrite: false,
        side: THREE.DoubleSide,
      });
      break;
  }
  m.name = `opening-${key}`;
  materials.set(key, m);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Geometry collection
// ---------------------------------------------------------------------------------------------

type Pt = [number, number];

/** Collects primitive geometries per bucket and merges each bucket into one mesh. */
class Parts {
  private buckets = new Map<string, THREE.BufferGeometry[]>();

  add(bucket: string, g: THREE.BufferGeometry): void {
    const list = this.buckets.get(bucket) ?? [];
    list.push(g); // all primitives are indexed, as mergeGeometries requires
    this.buckets.set(bucket, list);
  }

  /** Axis-aligned box from min corner to max corner. */
  box(bucket: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const sx = Math.abs(x1 - x0), sy = Math.abs(y1 - y0), sz = Math.abs(z1 - z0);
    if (sx < 1e-5 || sy < 1e-5 || sz < 1e-5) return;
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(bucket, g);
  }

  /** A box of length `len` centred at (cx, cy, cz), rotated by `angle` about z (for braces). */
  bar(bucket: string, cx: number, cy: number, cz: number, len: number, thick: number, depth: number, angle: number): void {
    const g = new THREE.BoxGeometry(len, thick, depth);
    g.rotateZ(angle);
    g.translate(cx, cy, cz);
    this.add(bucket, g);
  }

  /** A flat shape (outer outline plus optional holes) extruded from z0 to z1. */
  extrude(bucket: string, outer: Pt[], holes: Pt[][], z0: number, z1: number): void {
    const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.abs(z1 - z0), bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, Math.min(z0, z1));
    this.add(bucket, g);
  }

  /** Moves every geometry of `other` into this collection, transformed by `m` (bays, folded leaves). */
  absorb(other: Parts, m: THREE.Matrix4, rename?: Record<string, string>): void {
    for (const [bucket, list] of other.buckets) {
      for (const g of list) this.add(rename?.[bucket] ?? bucket, g.applyMatrix4(m));
    }
    other.buckets.clear();
  }

  mesh(bucket: string, mat: THREE.Material, name: string): THREE.Mesh | null {
    const src = this.buckets.get(bucket);
    if (!src || src.length === 0) return null;
    // boxes are indexed and extrusions are not: merge everything non-indexed with the same attributes
    const list = src.map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      if (n !== g) g.dispose();
      for (const a of Object.keys(n.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'uv') n.deleteAttribute(a);
      return n;
    });
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) throw new Error(`openingMeshes: could not merge '${bucket}'`);
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = name;
    const glass = mat.transparent;
    mesh.castShadow = !glass;
    mesh.receiveShadow = !glass;
    if (glass) mesh.renderOrder = 1;
    return mesh;
  }
}

// ---------------------------------------------------------------------------------------------
// Outlines, glazing bars and infill plates (arched, round and angled lights)
// ---------------------------------------------------------------------------------------------

export type LightShape = 'rect' | 'arch' | 'round' | 'oval' | 'lunette' | 'octagon' | 'gothic' | 'gable';
const TAU = Math.PI * 2;

function arcPts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

/** Counter-clockwise convex outline of a light that touches the box x0..x1, y0..y1. `rise` is the height of an arch. */
export function lightOutline(shape: LightShape, x0: number, y0: number, x1: number, y1: number, rise = 0): Pt[] {
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  switch (shape) {
    case 'arch': {
      const r = Math.max(0.05, Math.min(rise > 0 ? rise : w / 2, h * 0.7));
      return [[x0, y0], [x1, y0], ...arcPts(cx, y1 - r, w / 2, r, 0, Math.PI, 20)];
    }
    case 'lunette': return [[x0, y0], [x1, y0], ...arcPts(cx, y0, w / 2, h, 0, Math.PI, 24).slice(1, -1)];
    case 'round': case 'oval': return arcPts(cx, cy, w / 2, h / 2, 0, TAU, 40).slice(0, -1);
    case 'octagon': {
      const c = Math.min(w, h) * 0.29;
      return [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]];
    }
    case 'gothic': {
      const spring = y1 - Math.min(h * 0.55, w * 0.866);
      const apex = Math.min(y1 - spring, w * 0.866);
      const k = apex / (w * 0.866); // squash the 60 degree arcs when there is less height
      const right = arcPts(x0, spring, w, w * 0.866 * k, 0, Math.PI / 3, 12); // from the right spring to the apex
      const left = arcPts(x1, spring, w, w * 0.866 * k, (2 * Math.PI) / 3, Math.PI, 12);
      return [[x0, y0], [x1, y0], ...right, ...left];
    }
    case 'gable': {
      const ys = y1 - Math.min(h * 0.4, w * 0.5);
      return [[x0, y0], [x1, y0], [x1, ys], [cx, y1], [x0, ys]];
    }
    default: return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  }
}

/** The outline shrunk by `m` on every side (about its box centre): the inside edge of a frame member. */
function insetOutline(poly: Pt[], m: number): Pt[] {
  const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const kx = Math.max(0.05, (x1 - x0 - 2 * m) / (x1 - x0)), ky = Math.max(0.05, (y1 - y0 - 2 * m) / (y1 - y0));
  return poly.map(([x, y]) => [cx + (x - cx) * kx, cy + (y - cy) * ky] as Pt);
}

/** Clips the segment a-b to a convex counter-clockwise polygon (Cyrus-Beck); null when nothing is left. */
function clipSegment(poly: Pt[], a: Pt, b: Pt): [Pt, Pt] | null {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    const ex = q[0] - p[0], ey = q[1] - p[1];
    const nx = -ey, ny = ex; // inward normal of a counter-clockwise edge
    const num = (a[0] - p[0]) * nx + (a[1] - p[1]) * ny;
    const den = dx * nx + dy * ny;
    if (Math.abs(den) < 1e-9) { if (num < 0) return null; continue; }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 >= t1) return null;
  }
  return [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1]];
}

/** One glazing bar from a to b, clipped to the light. */
function addBar(p: Parts, bucket: string, poly: Pt[], a: Pt, b: Pt, zc: number, thick: number, depth: number): void {
  const seg = clipSegment(poly, a, b);
  if (!seg) return;
  const [s, e] = seg;
  const len = Math.hypot(e[0] - s[0], e[1] - s[1]);
  if (len < 0.01) return;
  p.bar(bucket, (s[0] + e[0]) / 2, (s[1] + e[1]) / 2, zc, len + 0.004, thick, depth, Math.atan2(e[1] - s[1], e[0] - s[0]));
}

export type BarPattern = 'grid' | 'diamond' | 'prairie' | 'cross' | 'topgrid' | 'fan' | 'spokes' | 'none';

/** Glazing bars across a light: its polygon `poly` (inside the frame members) decides where each bar is cut off. */
function addPattern(p: Parts, bucket: string, poly: Pt[], pattern: BarPattern, nx: number, ny: number, zc: number, depth: number, bar = 0.018): void {
  const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2;
  const line = (a: Pt, b: Pt) => addBar(p, bucket, poly, a, b, zc, bar, depth);
  const vlines = (n: number, ya = y0, yb = y1) => { for (let i = 1; i < n; i++) line([x0 + (w * i) / n, ya], [x0 + (w * i) / n, yb]); };
  const hlines = (n: number, xa = x0, xb = x1) => { for (let j = 1; j < n; j++) line([xa, y0 + (h * j) / n], [xb, y0 + (h * j) / n]); };
  switch (pattern) {
    case 'none': return;
    case 'cross': line([cx, y0], [cx, y1]); line([x0, y0 + h * 0.62], [x1, y0 + h * 0.62]); return;
    case 'topgrid': { const yb = y0 + h * 0.7; line([x0, yb], [x1, yb]); vlines(nx, yb, y1); return; }
    case 'prairie': {
      const m = Math.min(w, h) * 0.2;
      line([x0 + m, y0], [x0 + m, y1]); line([x1 - m, y0], [x1 - m, y1]);
      line([x0, y0 + m], [x1, y0 + m]); line([x0, y1 - m], [x1, y1 - m]);
      return;
    }
    case 'diamond': {
      const dx = w / nx, dy = h / ny;
      for (let i = -ny; i <= nx + ny; i++) {
        line([x0 + i * dx - dx * 12, y0 - dy * 12], [x0 + i * dx + dx * 12, y0 + dy * 12]);
        line([x0 + i * dx + dx * 12, y0 - dy * 12], [x0 + i * dx - dx * 12, y0 + dy * 12]);
      }
      return;
    }
    case 'fan': {
      const ox = cx, oy = y0 + h * 0.5;
      for (let i = 1; i < nx; i++) {
        const a = Math.PI * (i / nx);
        line([ox, oy], [ox + Math.cos(a) * 3, oy + Math.sin(a) * 3]);
      }
      line([x0, oy], [x1, oy]);
      return;
    }
    case 'spokes': {
      const oy = (y0 + y1) / 2;
      for (let i = 0; i < Math.max(2, nx); i++) {
        const a = (Math.PI * i) / Math.max(2, nx);
        line([cx - Math.cos(a) * 3, oy - Math.sin(a) * 3], [cx + Math.cos(a) * 3, oy + Math.sin(a) * 3]);
      }
      return;
    }
    default: vlines(nx); hlines(ny);
  }
}

/**
 * A fixed light of any outline: glass, a ring of frame members, bars, and plates filling the corners of the box
 * (x0..x1, y0..y1) that the outline leaves open, so the wall hole stays a rectangle but the window is not.
 */
function addShapedLight(
  p: Parts, shape: LightShape, x0: number, y0: number, x1: number, y1: number, zc: number, member: number,
  pattern: BarPattern, nx: number, ny: number, rise = 0, plateDepth = WALL_THICKNESS + 0.008,
): void {
  const outer = lightOutline(shape, x0, y0, x1, y1, rise);
  const inner = insetOutline(outer, member);
  const z0 = zc - SASH_T / 2, z1 = zc + SASH_T / 2;
  p.extrude('frame', outer, [inner], z0, z1);
  p.extrude('glass', inner, [], zc - 0.003, zc + 0.003);
  addPattern(p, 'frame', inner, pattern, nx, ny, zc, SASH_T * 0.55);
  if (shape !== 'rect') {
    const box: Pt[] = [[x0 - 0.004, y0 - 0.004], [x1 + 0.004, y0 - 0.004], [x1 + 0.004, y1 + 0.004], [x0 - 0.004, y1 + 0.004]];
    p.extrude('frame', box, [insetOutline(outer, 0.002)], -plateDepth / 2, plateDepth / 2);
  }
}

// ---------------------------------------------------------------------------------------------
// Shared frame: lining, stops, architraves
// ---------------------------------------------------------------------------------------------

interface FrameDims { hw: number; bottom: number; top: number; fw: number; cw: number; tileHalf: number }

function frameDims(def: OpeningDef): FrameDims {
  const cut = openingCutout(def);
  const tileHalf = def.width / 2;
  const fw = sNum(def, 'frame', 0.05);
  // architraves stay 5 mm inside the tile so neighbouring openings never collide
  const cw = Math.max(0.02, Math.min(sNum(def, 'casing', 0.06), tileHalf - cut.halfWidth - 0.005));
  return { hw: cut.halfWidth, bottom: cut.bottom, top: cut.top, fw, cw, tileHalf };
}

function addLiningAndCasing(p: Parts, d: FrameDims, withBottom: boolean): void {
  const T = WALL_THICKNESS;
  const lz = T / 2 + 0.004;
  // jamb lining (covers the wall reveal) and head
  p.box('frame', -d.hw, d.bottom, -lz, -d.hw + d.fw, d.top, lz);
  p.box('frame', d.hw - d.fw, d.bottom, -lz, d.hw, d.top, lz);
  p.box('frame', -d.hw, d.top - d.fw, -lz, d.hw, d.top, lz);
  if (withBottom) p.box('frame', -d.hw, d.bottom, -lz, d.hw, d.bottom + d.fw * 0.8, lz);
  // architraves on both faces: flat casing plus a raised back band on the outer edge
  for (const side of [-1, 1]) {
    const z0 = side * (T / 2), z1 = side * (T / 2 + 0.016), z2 = side * (T / 2 + 0.024);
    const casingBottom = withBottom ? d.bottom : 0;
    p.box('frame', -d.hw - d.cw, casingBottom, z0, -d.hw + 0.006, d.top + d.cw, z1);
    p.box('frame', d.hw - 0.006, casingBottom, z0, d.hw + d.cw, d.top + d.cw, z1);
    p.box('frame', -d.hw - d.cw, d.top - 0.006, z0, d.hw + d.cw, d.top + d.cw, z1);
    const bb = Math.min(0.016, d.cw * 0.35);
    p.box('frame', -d.hw - d.cw, casingBottom, z1, -d.hw - d.cw + bb, d.top + d.cw, z2);
    p.box('frame', d.hw + d.cw - bb, casingBottom, z1, d.hw + d.cw, d.top + d.cw, z2);
    p.box('frame', -d.hw - d.cw, d.top + d.cw - bb, z1, d.hw + d.cw, d.top + d.cw, z2);
  }
}

// ---------------------------------------------------------------------------------------------
// Doors
// ---------------------------------------------------------------------------------------------
//
// Style keys beyond the Milestone 1 set (all optional):
//   motion   'swing' (default) | 'cafe' (half-height leaves that swing both ways) | 'bifold' (folding pairs)
//            | 'slide' (parallel panes in tracks) | 'pocket' (leaf slides into the wall) | 'barn' (leaf on a rail
//            outside the wall) | 'rollup' (sectional garage door)
//   leaves   1 or 2 (a double door; for 'slide' use panes 2-4)
//   leafBottom, leafTop   metres, for leaves that do not fill the opening (cafe doors)
//   sideW, sideLites, sidePanel   sidelights on both sides (metres wide, lites high, solid panel height)
//   transomH, transom 'rect' | 'fan', transomLites   fixed light above the leaves
//   leaf kinds: shaker, cross, halfglass, porthole, slot, grooved, screen, arched (archInset 'panel' | 'glass' |
//     'plank', archRise), shoji, garage ('sections', litesX), slat, roller; plank takes brace 'x' and straps
//   handle 'knob' | 'lever' | 'bar' | 'pull' | 'ring' | 'thumb' | 'none'
//   leafMat 'paint' | 'wood' | 'metal', frameMat 'paint' | 'wood', glass 'clear' | 'frosted'

const LEAF_T = 0.04;

/** Rectangular frame of members around an opening in leaf-local space (x0..x1, y0..y1). */
function addGlazing(p: Parts, bucket: string, glassBucket: string, x0: number, y0: number, x1: number, y1: number, nx: number, ny: number, zc: number, barT: number): void {
  p.box(glassBucket, x0, y0, zc - 0.003, x1, y1, zc + 0.003);
  const bw = 0.018;
  for (let i = 1; i < nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx;
    p.box(bucket, x - bw / 2, y0, zc - barT / 2, x + bw / 2, y1, zc + barT / 2);
  }
  for (let j = 1; j < ny; j++) {
    const y = y0 + ((y1 - y0) * j) / ny;
    p.box(bucket, x0, y - bw / 2, zc - barT / 2, x1, y + bw / 2, zc + barT / 2);
  }
}

/** Raised-and-fielded panel between frame members (leaf-local; leaf occupies z -LEAF_T..0). */
function addPanel(p: Parts, x0: number, y0: number, x1: number, y1: number): void {
  const zc = -LEAF_T / 2;
  p.box('leaf', x0, y0, zc - LEAF_T * 0.28, x1, y1, zc + LEAF_T * 0.28);
  const inset = Math.min(0.035, (x1 - x0) * 0.2, (y1 - y0) * 0.2);
  p.box('leaf', x0 + inset, y0 + inset, zc - LEAF_T * 0.4, x1 - inset, y1 - inset, zc + LEAF_T * 0.4);
}

/** A flat panel sunk between the stiles and rails (shaker style). */
function addFlatPanel(p: Parts, x0: number, y0: number, x1: number, y1: number): void {
  p.box('leaf', x0, y0, -LEAF_T * 0.72, x1, y1, -LEAF_T * 0.28);
}

function buildLeaf(def: OpeningDef, p: Parts, leafW: number, y0: number, y1: number): void {
  const kind = sStr(def, 'leaf', 'panel');
  const zc = -LEAF_T / 2;
  const full = (x0: number, ya: number, x1: number, yb: number) => p.box('leaf', x0, ya, -LEAF_T, x1, yb, 0);
  const nxL = Math.max(1, Math.round(sNum(def, 'litesX', 1))), nyL = Math.max(1, Math.round(sNum(def, 'litesY', 1)));
  const H = y1 - y0;
  const stileRail = (st: number, top: number, bot: number) => {
    full(0, y0, st, y1);
    full(leafW - st, y0, leafW, y1);
    full(st, y1 - top, leafW - st, y1);
    full(st, y0, leafW - st, y0 + bot);
  };
  /** A slab with a rectangular opening cut out, for glass to sit in. */
  const aperture = (ax0: number, ay0: number, ax1: number, ay1: number) => {
    full(0, y0, leafW, ay0);
    full(0, ay1, leafW, y1);
    full(0, ay0, ax0, ay1);
    full(ax1, ay0, leafW, ay1);
  };
  if (kind === 'flush') {
    // a plain slab with a shallow raised edge band and a recessed reveal line near the top
    full(0, y0, leafW, y1);
    p.box('leaf', 0.02, y0 + 0.02, 0, leafW - 0.02, y1 - 0.02, 0.004);
    p.box('leaf', 0.02, y1 - 0.34, 0.004, leafW - 0.02, y1 - 0.332, 0.007);
    return;
  }
  if (kind === 'grooved') {
    full(0, y0, leafW, y1);
    const n = Math.max(3, Math.floor(leafW / 0.1));
    for (let i = 1; i < n; i++) {
      const x = (leafW * i) / n;
      p.box('leaf', x - 0.008, y0 + 0.03, 0, x + 0.008, y1 - 0.03, 0.007);
      p.box('leaf', x - 0.008, y0 + 0.03, -LEAF_T - 0.007, x + 0.008, y1 - 0.03, -LEAF_T);
    }
    return;
  }
  if (kind === 'halfglass') {
    const ay0 = y0 + H * 0.46, ay1 = y1 - 0.1, ax0 = 0.08, ax1 = leafW - 0.08;
    aperture(ax0, ay0, ax1, ay1);
    addGlazing(p, 'leaf', 'glass', ax0, ay0, ax1, ay1, nxL, nyL, zc, LEAF_T * 0.6);
    p.box('leaf', 0.04, y0 + 0.1, 0, leafW - 0.04, ay0 - 0.1, 0.005); // raised lower panel
    return;
  }
  if (kind === 'slot') {
    const ax0 = leafW * 0.22, ax1 = ax0 + 0.11, ay0 = y0 + H * 0.2, ay1 = y1 - 0.12;
    aperture(ax0, ay0, ax1, ay1);
    addGlazing(p, 'leaf', 'glass', ax0, ay0, ax1, ay1, 1, nyL, zc, LEAF_T * 0.6);
    return;
  }
  if (kind === 'porthole') {
    const r = Math.min(0.2, leafW * 0.3), cy = y0 + H * 0.66, cx = leafW / 2;
    const circle = (rad: number): Pt[] => arcPts(cx, cy, rad, rad, 0, TAU, 28).slice(0, -1);
    p.extrude('leaf', [[0, y0], [leafW, y0], [leafW, y1], [0, y1]], [circle(r)], -LEAF_T, 0);
    p.extrude('glass', circle(r), [], zc - 0.003, zc + 0.003);
    p.extrude('metal', circle(r + 0.03), [circle(r)], -LEAF_T - 0.012, 0.012);
    return;
  }
  if (kind === 'fullglass') {
    // slim stile-and-rail frame around one big glazed field with optional lites
    const st = 0.07, top = 0.07, bot = 0.12;
    stileRail(st, top, bot);
    addGlazing(p, 'leaf', 'glass', st, y0 + bot, leafW - st, y1 - top, Math.max(1, Math.round(sNum(def, 'litesX', 1))), Math.max(1, Math.round(sNum(def, 'litesY', 1))), zc, LEAF_T * 0.6);
    return;
  }
  if (kind === 'shoji') {
    // light timber lattice over translucent paper, with a solid kick panel
    const st = 0.04, kick = 0.26;
    stileRail(st, st, kick);
    addGlazing(p, 'leaf', 'glass', st, y0 + kick, leafW - st, y1 - st, nxL, nyL, zc, LEAF_T * 0.7);
    p.box('leaf', st, y0 + kick - 0.02, -LEAF_T, leafW - st, y0 + kick, 0);
    return;
  }
  if (kind === 'screen') {
    const st = 0.06, kick = 0.3, mid = y0 + H * 0.42;
    stileRail(st, st, 0.06);
    full(st, mid - 0.04, leafW - st, mid + 0.04);
    addFlatPanel(p, st, y0 + 0.06, leafW - st, y0 + kick);
    // fine wire mesh above the kick panel
    for (let x = st + 0.035; x < leafW - st - 0.01; x += 0.035) p.box('leaf', x - 0.0015, mid + 0.04, zc - 0.002, x + 0.0015, y1 - st, zc + 0.002);
    for (let y = mid + 0.075; y < y1 - st - 0.01; y += 0.035) p.box('leaf', st, y - 0.0015, zc - 0.002, leafW - st, y + 0.0015, zc + 0.002);
    for (let x = st + 0.035; x < leafW - st - 0.01; x += 0.035) p.box('leaf', x - 0.0015, y0 + kick, zc - 0.002, x + 0.0015, mid - 0.04, zc + 0.002);
    for (let y = y0 + kick + 0.035; y < mid - 0.04; y += 0.035) p.box('leaf', st, y - 0.0015, zc - 0.002, leafW - st, y + 0.0015, zc + 0.002);
    return;
  }
  if (kind === 'arched') {
    const rise = sNum(def, 'archRise', leafW / 2);
    const outline = lightOutline('arch', 0, y0, leafW, y1, rise);
    const inset = sStr(def, 'archInset', 'panel');
    const lowerTop = y0 + H * 0.38;
    if (inset === 'glass') {
      const hole = lightOutline('arch', 0.1, lowerTop + 0.12, leafW - 0.1, y1 - 0.1, Math.max(0.06, rise - 0.1));
      p.extrude('leaf', outline, [hole], -LEAF_T, 0);
      p.extrude('glass', hole, [], zc - 0.003, zc + 0.003);
      addPattern(p, 'leaf', hole, 'fan', Math.max(3, nxL + 2), nyL, zc, LEAF_T * 0.6);
      p.box('leaf', 0.1, y0 + 0.14, 0, leafW - 0.1, lowerTop, 0.006);
    } else if (inset === 'plank') {
      p.extrude('leaf', outline, [], -LEAF_T, 0);
      const n = Math.max(3, Math.round(leafW / 0.16));
      for (let i = 1; i < n; i++) addBar(p, 'leaf', outline, [(leafW * i) / n, y0], [(leafW * i) / n, y1 + 0.2], zc, 0.008, LEAF_T + 0.012);
      for (const ly of [y0 + 0.3, lowerTop + 0.25]) p.box('metal', 0.04, ly - 0.012, 0.0, leafW * 0.8, ly + 0.012, 0.012);
    } else {
      p.extrude('leaf', outline, [], -LEAF_T, 0);
      const raised = lightOutline('arch', 0.1, lowerTop + 0.1, leafW - 0.1, y1 - 0.1, Math.max(0.06, rise - 0.1));
      p.extrude('leaf', raised, [], -LEAF_T - 0.01, 0.01);
      p.box('leaf', 0.1, y0 + 0.14, -LEAF_T - 0.01, leafW - 0.1, lowerTop, 0.01);
    }
    return;
  }
  if (kind === 'garage') {
    const n = Math.max(2, Math.round(sNum(def, 'sections', 4)));
    const sh = H / n, cols = Math.max(1, Math.round(leafW / 0.75));
    for (let s = 0; s < n; s++) {
      const sa = y0 + s * sh + 0.004, sb = y0 + (s + 1) * sh - 0.004;
      const glazed = s === n - 1 && sNum(def, 'litesX', 0) > 0;
      if (glazed) {
        aperture(0, sa, leafW, sb); // sections are separate slabs; cut the window out of the top one below
        continue;
      }
      full(0, sa, leafW, sb);
      for (let c = 0; c < cols; c++) {
        const cx0 = 0.06 + ((leafW - 0.12) * c) / cols + 0.02, cx1 = 0.06 + ((leafW - 0.12) * (c + 1)) / cols - 0.02;
        p.box('leaf', cx0, sa + 0.05, 0, cx1, sb - 0.05, 0.008);
      }
    }
    if (sNum(def, 'litesX', 0) > 0) {
      const sa = y0 + (n - 1) * sh + 0.004, sb = y1 - 0.004;
      full(0, sa, 0.06, sb); full(leafW - 0.06, sa, leafW, sb);
      full(0.06, sa, leafW - 0.06, sa + 0.05); full(0.06, sb - 0.05, leafW - 0.06, sb);
      addGlazing(p, 'leaf', 'glass', 0.06, sa + 0.05, leafW - 0.06, sb - 0.05, Math.round(sNum(def, 'litesX', 4)), 1, zc, LEAF_T * 0.6);
    }
    return;
  }
  if (kind === 'slat') {
    p.box('leaf', 0, y0, -LEAF_T * 0.7, leafW, y1, -LEAF_T * 0.3);
    const pitch = 0.1, n = Math.floor(H / pitch);
    for (let i = 0; i < n; i++) {
      const ya = y0 + i * (H / n) + 0.004, yb = y0 + (i + 1) * (H / n) - 0.004;
      p.box('leaf', 0, ya, i % 2 ? -LEAF_T : -LEAF_T * 0.9, leafW, yb, i % 2 ? 0 : 0.008);
    }
    return;
  }
  if (kind === 'roller') {
    p.box('leaf', 0, y0 + 0.07, -LEAF_T * 0.6, leafW, y1, -LEAF_T * 0.4);
    const n = Math.floor((H - 0.07) / 0.05);
    for (let i = 0; i < n; i++) {
      const ya = y0 + 0.07 + i * ((H - 0.07) / n);
      p.box('leaf', 0, ya, i % 2 ? -LEAF_T : -LEAF_T * 0.4, leafW, ya + (H - 0.07) / n - 0.004, i % 2 ? -LEAF_T * 0.6 : 0.004);
    }
    p.box('metal', 0, y0, -LEAF_T, leafW, y0 + 0.07, 0.006);
    return;
  }
  if (kind === 'cross') {
    // cottage cross-buck: a frame around two sunk panels, each with an X of battens
    const st = 0.1, rail = 0.09;
    stileRail(st, rail, 0.16);
    const mid = y0 + H * 0.5;
    full(st, mid - rail / 2, leafW - st, mid + rail / 2);
    for (const [ya, yb] of [[y0 + 0.16, mid - rail / 2], [mid + rail / 2, y1 - rail]] as const) {
      addFlatPanel(p, st, ya, leafW - st, yb);
      const w = leafW - 2 * st, h = yb - ya;
      const len = Math.hypot(w, h) - 0.03, ang = Math.atan2(h, w);
      p.bar('leaf', leafW / 2, (ya + yb) / 2, zc, len, 0.035, LEAF_T * 0.85, ang);
      p.bar('leaf', leafW / 2, (ya + yb) / 2, zc, len, 0.035, LEAF_T * 0.85, -ang);
    }
    return;
  }
  if (kind === 'shaker') {
    const st = 0.11, top = 0.11, bot = 0.2, rail = 0.09;
    stileRail(st, top, bot);
    const rows = Math.max(1, Math.round(sNum(def, 'panelRows', 1)));
    const ya = y0 + bot, yb = y1 - top, rh = (yb - ya - (rows - 1) * rail) / rows;
    for (let r = 0; r < rows; r++) {
      const pa = ya + r * (rh + rail), pb = pa + rh;
      if (r > 0) full(st, pa - rail, leafW - st, pa);
      addFlatPanel(p, st, pa, leafW - st, pb);
    }
    return;
  }
  if (kind === 'dutch') {
    // two plank halves with a gap between them, each on its own ledges
    const split = 1.05, gap = 0.006;
    const halves: Array<[number, number]> = [[y0, split - gap / 2], [split + gap / 2, y1]];
    for (const [ya, yb] of halves) {
      const n = 4, bw = leafW / n;
      p.box('leaf', 0.004, ya, zc - LEAF_T * 0.22, leafW - 0.004, yb, zc + LEAF_T * 0.22);
      for (let i = 0; i < n; i++) full(i * bw + 0.002, ya, (i + 1) * bw - 0.002, yb);
      for (const ly of [ya + 0.14, yb - 0.14]) p.box('leaf', 0.03, ly - 0.06, -LEAF_T - 0.02, leafW - 0.03, ly + 0.06, -LEAF_T);
    }
    p.box('metal', leafW * 0.5 - 0.05, split - 0.02, -LEAF_T - 0.012, leafW * 0.5 + 0.05, split + 0.02, -LEAF_T);
    return;
  }
  if (kind === 'louvre') {
    // stile-and-rail frame filled with angled slats
    const st = 0.1, top = 0.11, bot = Math.min(0.16, H * 0.2);
    stileRail(st, top, bot);
    full(st, (y0 + y1) / 2 - 0.05, leafW - st, (y0 + y1) / 2 + 0.05);
    const slatPitch = 0.045;
    for (const [ya, yb] of [[y0 + bot, (y0 + y1) / 2 - 0.05], [(y0 + y1) / 2 + 0.05, y1 - top]] as const) {
      const count = Math.max(2, Math.floor((yb - ya) / slatPitch));
      for (let i = 0; i < count; i++) {
        const g = new THREE.BoxGeometry(leafW - 2 * st, 0.007, 0.05);
        g.rotateX(0.62);
        g.translate(leafW / 2, ya + ((i + 0.5) * (yb - ya)) / count, zc);
        p.add('leaf', g);
      }
    }
    return;
  }
  if (kind === 'plank') {
    const n = Math.max(2, Math.round(sNum(def, 'planks', 5)));
    const bw = leafW / n;
    p.box('leaf', 0.004, y0, zc - LEAF_T * 0.22, leafW - 0.004, y1, zc + LEAF_T * 0.22); // backing behind the grooves
    for (let i = 0; i < n; i++) full(i * bw + 0.002, y0, (i + 1) * bw - 0.002, y1);
    // ledges and braces on the -z face
    const ledgeYs = [y0 + 0.22, (y0 + y1) / 2, y1 - 0.22];
    const lx0 = 0.035, lx1 = leafW - 0.035, lh = 0.13, ld = 0.022;
    for (const ly of ledgeYs) p.box('leaf', lx0, ly - lh / 2, -LEAF_T - ld, lx1, ly + lh / 2, -LEAF_T);
    const x = sStr(def, 'brace', 'z') === 'x';
    for (let k = 0; k < 2; k++) {
      const ya = (ledgeYs[k] ?? 0) + lh / 2, yb = (ledgeYs[k + 1] ?? 0) - lh / 2;
      const xa = lx0 + 0.04, xb = lx1 - 0.04;
      const len = Math.hypot(xb - xa, yb - ya);
      p.bar('leaf', (xa + xb) / 2, (ya + yb) / 2, -LEAF_T - ld / 2, len, 0.11, ld, Math.atan2(yb - ya, xb - xa));
      if (x) p.bar('leaf', (xa + xb) / 2, (ya + yb) / 2, -LEAF_T - ld / 2, len, 0.11, ld, -Math.atan2(yb - ya, xb - xa));
    }
    if (sBool(def, 'straps')) {
      for (const ly of [ledgeYs[0]!, ledgeYs[2]!]) {
        p.box('metal', -0.004, ly - 0.03, -LEAF_T - ld - 0.008, leafW * 0.62, ly + 0.03, -LEAF_T - ld);
        p.box('metal', -0.004, ly - 0.03, 0, leafW * 0.62, ly + 0.03, 0.01);
      }
    }
    return;
  }
  // stile-and-rail leaf
  const stile = Math.min(0.11, leafW * 0.15);
  const topRail = 0.11, bottomRail = 0.2, lockRail = 0.16;
  const lockY = Math.min(y0 + 0.986, (y0 + y1) / 2);
  full(0, y0, stile, y1);
  full(leafW - stile, y0, leafW, y1);
  full(stile, y1 - topRail, leafW - stile, y1);
  full(stile, y0, leafW - stile, y0 + bottomRail);
  full(stile, lockY - lockRail / 2, leafW - stile, lockY + lockRail / 2);
  const muntin = 0.09;
  const cx = leafW / 2;
  const lowerTop = lockY - lockRail / 2, lowerBottom = y0 + bottomRail;
  const upperBottom = lockY + lockRail / 2, upperTop = y1 - topRail;
  const panelRows = Math.max(1, Math.round(sNum(def, 'panelRows', 2)));
  // panels in two columns: one row below the lock rail, panelRows - 1 rows above it (unless glazed)
  const addPanelGrid = (ya: number, yb: number, rows: number) => {
    full(cx - muntin / 2, ya, cx + muntin / 2, yb);
    const rh = (yb - ya - (rows - 1) * muntin) / rows;
    for (let r = 0; r < rows; r++) {
      const pa = ya + r * (rh + muntin), pb = pa + rh;
      if (r > 0) full(stile, pa - muntin, leafW - stile, pa);
      addPanel(p, stile, pa, cx - muntin / 2, pb);
      addPanel(p, cx + muntin / 2, pa, leafW - stile, pb);
    }
  };
  addPanelGrid(lowerBottom, lowerTop, 1);
  if (kind === 'glazed') {
    addGlazing(p, 'leaf', 'glass', stile, upperBottom, leafW - stile, upperTop,
      Math.max(1, Math.round(sNum(def, 'litesX', 2))), Math.max(1, Math.round(sNum(def, 'litesY', 3))), zc, LEAF_T * 0.6);
  } else {
    addPanelGrid(upperBottom, upperTop, Math.max(1, panelRows - 1));
  }
}

function addDoorHardware(def: OpeningDef, p: Parts, leafW: number, y0: number, y1: number, hinges: boolean): void {
  const handle = sStr(def, 'handle', 'knob');
  const motion = sStr(def, 'motion', 'swing');
  const centred = motion === 'rollup';
  const hx = centred ? leafW / 2 : leafW - 0.065, hy = centred ? y0 + 0.3 : Math.min(0.98, y0 + (y1 - y0) * 0.5);
  for (const side of [-1, 1]) {
    const face = side > 0 ? 0 : -LEAF_T;
    const out = (d: number) => face + side * d;
    if (handle === 'none') break;
    if (handle === 'bar') {
      const bx = centred ? hx : leafW - 0.07;
      const len = centred ? 0.3 : 0.55;
      for (const dy of [-len / 2 + 0.04, len / 2 - 0.04]) p.box('metal', bx - 0.008, hy + dy - 0.008, out(0.002), bx + 0.008, hy + dy + 0.008, out(0.045));
      p.box('metal', bx - 0.011, hy - len / 2, out(0.04), bx + 0.011, hy + len / 2, out(0.062));
      continue;
    }
    if (handle === 'pull') {
      const g = new THREE.CylinderGeometry(0.032, 0.032, 0.012, 20);
      g.rotateX(Math.PI / 2);
      g.translate(hx - 0.02, hy, out(0.004));
      p.add('metal', g);
      continue;
    }
    if (handle === 'ring') {
      const g = new THREE.TorusGeometry(0.05, 0.007, 8, 20);
      g.translate(hx - 0.03, hy, out(0.04));
      p.add('metal', g);
      p.box('metal', hx - 0.05, hy + 0.02, out(0.002), hx - 0.01, hy + 0.06, out(0.03));
      continue;
    }
    if (handle === 'thumb') {
      p.box('metal', hx - 0.025, hy - 0.09, out(0.002), hx + 0.025, hy + 0.09, out(0.012));
      p.box('metal', hx - 0.1, hy + 0.1, out(0.012), hx + 0.01, hy + 0.116, out(0.026));
      continue;
    }
    const rose = new THREE.CylinderGeometry(0.028, 0.028, 0.008, 20);
    rose.rotateX(Math.PI / 2);
    rose.translate(hx, hy, out(0.004));
    p.add('metal', rose);
    const neck = new THREE.CylinderGeometry(0.009, 0.009, 0.05, 12);
    neck.rotateX(Math.PI / 2);
    neck.translate(hx, hy, out(0.03));
    p.add('metal', neck);
    if (handle === 'lever') {
      p.box('metal', hx - 0.12, hy - 0.009, out(0.047) - 0.009, hx + 0.006, hy + 0.009, out(0.047) + 0.009);
    } else {
      const knob = new THREE.SphereGeometry(0.028, 16, 12);
      knob.translate(hx, hy, out(0.06));
      p.add('metal', knob);
    }
    // key escutcheon below the handle
    p.box('metal', hx - 0.009, hy - 0.1, out(0.002) - 0.002, hx + 0.009, hy - 0.06, out(0.002) + 0.002);
  }
  // hinges on the hinge edge
  if (hinges) for (const hy2 of [y0 + 0.22, (y0 + y1) / 2 + 0.25, y1 - 0.22]) p.box('metal', -0.006, hy2 - 0.05, -0.012, 0.004, hy2 + 0.05, 0.002);
}

const woodLeaf = (def: OpeningDef): boolean => {
  const k = sStr(def, 'leaf', 'panel');
  return sStr(def, 'leafMat', k === 'plank' || k === 'dutch' || k === 'slat' ? 'wood' : 'paint') === 'wood';
};

/** The fixed light above leaves or in a window head: a flat bar and a rectangular or fan-shaped light. */
function addTransom(
  p: Parts, ix0: number, ix1: number, yBar: number, yTop: number, type: string, zc: number, member: number, nx: number, glassPattern: BarPattern,
): void {
  p.box('frame', ix0, yBar - 0.02, zc - SASH_T / 2, ix1, yBar + 0.02, zc + SASH_T / 2);
  const fan = type === 'fan';
  addShapedLight(p, fan ? 'arch' : 'rect', ix0, yBar + 0.02, ix1, yTop, zc, member, fan ? 'fan' : glassPattern, Math.max(1, nx), 1, fan ? yTop - yBar - 0.02 : 0);
}

function buildDoor(def: OpeningDef): THREE.Group {
  const d = frameDims(def);
  const p = new Parts();
  addLiningAndCasing(p, d, false);
  const T = WALL_THICKNESS;
  const motion = sStr(def, 'motion', 'swing');
  const swinging = motion === 'swing' || motion === 'cafe' || motion === 'bifold';
  const ix0 = -d.hw + d.fw, ix1 = d.hw - d.fw, headY = d.top - d.fw;
  const gap = 0.003;

  // threshold, and stops for leaves that close against them (stops sit on the -z side: leaves open toward +z)
  p.box('frame', -d.hw, 0, -T / 2 - 0.004, d.hw, 0.012, T / 2 + 0.004);
  if (swinging) {
    const stopZ0 = -LEAF_T / 2 - 0.016, stopZ1 = -LEAF_T / 2;
    p.box('frame', ix0, 0.012, stopZ0, ix0 + 0.012, headY, stopZ1);
    p.box('frame', ix1 - 0.012, 0.012, stopZ0, ix1, headY, stopZ1);
    p.box('frame', ix0, headY - 0.012, stopZ0, ix1, headY, stopZ1);
  }

  // fixed light above the leaves
  let leafTop = headY - gap;
  const transomH = sNum(def, 'transomH', 0);
  if (transomH > 0) {
    const yBar = headY - transomH;
    addTransom(p, ix0, ix1, yBar, headY, sStr(def, 'transom', 'rect'), 0, 0.03, Math.round(sNum(def, 'transomLites', 3)), 'grid');
    leafTop = yBar - 0.02 - gap;
  }
  // sidelights beside the leaves
  let lx0 = ix0, lx1 = ix1;
  const sideW = sNum(def, 'sideW', 0);
  if (sideW > 0) {
    const panel = sNum(def, 'sidePanel', 0);
    const lites = Math.max(1, Math.round(sNum(def, 'sideLites', 3)));
    for (const s of [-1, 1]) {
      const xa = s < 0 ? ix0 : ix1 - sideW, xb = s < 0 ? ix0 + sideW : ix1;
      if (panel > 0) p.box('frame', xa, 0.012, -LEAF_T / 2 - 0.012, xb, panel, LEAF_T / 2 + 0.012);
      addShapedLight(p, 'rect', xa, panel + 0.012, xb, leafTop + gap, 0, 0.03, 'grid', 1, lites);
      const mx = s < 0 ? xb : xa;
      p.box('frame', mx - 0.02, 0.012, -LEAF_T / 2 - 0.012, mx + 0.02, leafTop + gap, LEAF_T / 2 + 0.012);
    }
    lx0 = ix0 + sideW + 0.02; lx1 = ix1 - sideW - 0.02;
  }
  const region = lx1 - lx0;
  const y0 = 0.014 + sNum(def, 'leafBottom', 0);
  const y1 = sNum(def, 'leafTop', leafTop);
  const leafMat = (woodLeaf(def) ? 'wood' : sStr(def, 'leafMat', 'paint') === 'metal' ? 'metal' : 'paint') as MaterialKind;
  const frameColor = sStr(def, 'frameColor', '#f1ede4');
  const leafColor = sStr(def, 'leafColor', frameColor);
  const hardwareColor = sStr(def, 'hardware', '#b8955a');
  const glassMat = material(sStr(def, 'glass', 'clear') === 'frosted' ? 'frosted' : 'glass', '#ffffff');
  const leaves = Math.max(1, Math.min(2, Math.round(sNum(def, 'leaves', 1))));

  /** One leaf (or half of a bi-fold) as a Group whose origin is its hinge/start edge. */
  const makeLeaf = (w: number, hinges: boolean, handle: boolean): THREE.Group => {
    const lp = new Parts();
    buildLeaf(def, lp, w, y0, y1);
    if (handle) addDoorHardware(def, lp, w, y0, y1, hinges);
    else if (hinges) addDoorHardware({ ...def, style: { ...def.style, handle: 'none' } }, lp, w, y0, y1, true);
    const g = new THREE.Group();
    const body = lp.mesh('leaf', material(leafMat, leafColor), 'leafBody');
    if (body) g.add(body);
    const glass = lp.mesh('glass', glassMat, 'glass');
    if (glass) g.add(glass);
    const metal = lp.mesh('metal', material('metal', hardwareColor), 'hardware');
    if (metal) g.add(metal);
    return g;
  };
  const leafList: THREE.Group[] = [];
  const named = (g: THREE.Group, i: number) => { g.name = i === 0 ? OPENING_LEAF_NAME : `${OPENING_LEAF_NAME}${i + 1}`; leafList.push(g); return g; };

  if (swinging) {
    const w = leaves === 1 ? region - 2 * gap : (region - 2 * gap - 0.004) / 2;
    for (let i = 0; i < leaves; i++) {
      const dir = i === 0 ? 1 : -1;
      let leaf: THREE.Group;
      if (motion === 'bifold') {
        leaf = makeLeaf(w / 2, true, false);
        const fold = makeLeaf(w / 2, false, true);
        fold.name = 'fold';
        fold.position.set(w / 2, 0, 0);
        leaf.add(fold);
      } else leaf = makeLeaf(w, true, true);
      named(leaf, i);
      leaf.position.set(i === 0 ? lx0 + gap : lx1 - gap, 0, LEAF_T / 2);
      if (dir < 0) leaf.scale.x = -1;
      leaf.userData = { motion: motion === 'bifold' ? 'bifold' : 'swing', dir, hinge: dir > 0 ? 'minX' : 'maxX', maxSwing: motion === 'cafe' ? 1.25 : motion === 'bifold' ? 1.45 : Math.PI / 2, width: w };
    }
    if (sStr(def, 'leaf', 'panel') === 'arched' && leaves === 1) {
      // fill the corners the round-topped leaf leaves open in the rectangular hole
      const rise = sNum(def, 'archRise', w / 2), spring = y1 - rise, ax = lx0 + gap, cx = ax + w / 2;
      const left: Pt[] = [[lx0, spring], [ax, spring], ...arcPts(cx, spring, w / 2, rise, Math.PI, Math.PI / 2, 12).slice(1), [cx, headY], [lx0, headY]];
      const right: Pt[] = [[lx1, spring], [lx1, headY], [cx, headY], ...arcPts(cx, spring, w / 2, rise, Math.PI / 2, 0, 12), [ax + w, spring]].reverse() as Pt[];
      for (const poly of [left, right]) p.extrude('frame', poly, [], -(T + 0.008) / 2, (T + 0.008) / 2);
    }
  } else if (motion === 'slide') {
    // parallel panes in tracks: the outer panes of 2-4 are fixed or slide over their neighbour
    const n = Math.max(2, Math.min(4, Math.round(sNum(def, 'panes', 2))));
    const overlap = 0.05;
    const w = (region + (n - 1) * overlap) / n;
    const moving = n === 2 ? [1] : n === 3 ? [0, 2] : [1, 2];
    for (let i = 0; i < n; i++) {
      const front = moving.includes(i);
      const leaf = makeLeaf(w, false, front);
      named(leaf, i);
      const x = lx0 + i * (w - overlap);
      leaf.position.set(x, 0, front ? 0.03 : -0.014);
      const toward = i === 0 ? 1 : i === n - 1 ? -1 : (i < (n - 1) / 2 ? -1 : 1);
      const dist = (w - overlap) * 0.98;
      leaf.userData = front
        ? { motion: 'slide', dir: toward, baseX: x, slide: toward * dist, width: w }
        : { motion: 'fixed', width: w };
    }
    // head and sill tracks
    p.box('frame', ix0, 0.012, -0.045, ix1, 0.03, 0.05);
    p.box('frame', ix0, headY - 0.03, -0.045, ix1, headY, 0.05);
  } else if (motion === 'pocket') {
    const w = leaves === 1 ? region - 2 * gap : (region - 2 * gap - 0.004) / 2;
    for (let i = 0; i < leaves; i++) {
      const leaf = makeLeaf(w, false, true);
      named(leaf, i);
      const x = lx0 + gap + i * (w + 0.004);
      const dir = leaves === 1 ? 1 : i === 0 ? -1 : 1;
      leaf.position.set(x, 0, LEAF_T / 2);
      leaf.userData = { motion: 'slide', dir, baseX: x, slide: dir * (w + 0.03), width: w };
    }
  } else if (motion === 'barn') {
    // leaves hang on a rail outside the wall and slide along it
    const w = leaves === 1 ? Math.min(2 * d.hw + 0.1, def.width - 0.012) : Math.min((2 * d.hw + 0.1) / 2, (def.width - 0.012) / 2);
    const bz = T / 2 + 0.034;
    const top = d.top + 0.02;
    const by1 = top;
    for (let i = 0; i < leaves; i++) {
      const lp = new Parts();
      buildLeaf(def, lp, w, 0.03, by1);
      addDoorHardware({ ...def, style: { ...def.style, handle: sStr(def, 'handle', 'bar') } }, lp, w, 0.03, by1, false);
      const leaf = new THREE.Group();
      const body = lp.mesh('leaf', material(leafMat, leafColor), 'leafBody');
      if (body) leaf.add(body);
      const glass = lp.mesh('glass', glassMat, 'glass');
      if (glass) leaf.add(glass);
      const metal = lp.mesh('metal', material('metal', hardwareColor), 'hardware');
      if (metal) leaf.add(metal);
      named(leaf, i);
      const x = leaves === 1 ? -w / 2 : i === 0 ? -w : 0;
      leaf.position.set(x, 0, bz + LEAF_T);
      const dir = leaves === 1 ? 1 : i === 0 ? -1 : 1;
      leaf.userData = { motion: 'slide', dir, baseX: x, slide: dir * w * 0.95, width: w };
    }
    const railZ = bz + LEAF_T + 0.04;
    const rp = new Parts();
    rp.box('metal', -def.width / 2 + 0.01, by1 + 0.05, railZ - 0.012, def.width / 2 - 0.01, by1 + 0.075, railZ + 0.012);
    for (const hx of leafList.map((l) => (l.userData.baseX as number) + (l.userData.width as number) / 2)) {
      rp.box('metal', hx - 0.04, by1 - 0.02, bz + LEAF_T - 0.002, hx + 0.04, by1 + 0.06, bz + LEAF_T + 0.012);
      rp.box('metal', hx - 0.014, by1 + 0.03, railZ - 0.01, hx + 0.014, by1 + 0.07, bz + LEAF_T + 0.01);
    }
    for (const sx of [-1, 1]) rp.box('metal', sx * (def.width / 2 - 0.05) - 0.01, by1 + 0.03, bz + LEAF_T + 0.002, sx * (def.width / 2 - 0.05) + 0.01, by1 + 0.08, railZ);
    p.absorb(rp, new THREE.Matrix4(), { metal: 'rail' });
  } else {
    // roll-up sectional door: the leaf hangs from its top edge and gathers upward
    const w = region - 2 * gap;
    const leaf = makeLeaf(w, false, true);
    const body = leaf.children;
    for (const c of body) c.position.y = -y1;
    named(leaf, 0);
    leaf.position.set(lx0 + gap, y1, LEAF_T / 2);
    leaf.userData = { motion: 'rollup', width: w };
    p.box('frame', ix0, 0.012, -LEAF_T / 2 - 0.02, ix0 + 0.03, headY, LEAF_T / 2 + 0.02);
    p.box('frame', ix1 - 0.03, 0.012, -LEAF_T / 2 - 0.02, ix1, headY, LEAF_T / 2 + 0.02);
  }

  const group = new THREE.Group();
  const frameMat: MaterialKind = sStr(def, 'frameMat', woodLeaf(def) ? 'wood' : 'paint') === 'wood' ? 'wood' : 'paint';
  const frameMesh = p.mesh('frame', material(frameMat, frameColor), 'frame');
  if (frameMesh) group.add(frameMesh);
  const fg = p.mesh('glass', glassMat, 'frameGlass');
  if (fg) group.add(fg);
  const rail = p.mesh('rail', material('metal', sStr(def, 'railColor', '#262626')), 'rail');
  if (rail) group.add(rail);
  for (const l of leafList) group.add(l);
  return group;
}

// ---------------------------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------------------------
//
// Style keys beyond the Milestone 1 set (all optional):
//   window   'sash' | 'casement' | 'fixed' | 'slider' | 'jalousie' (blades) | 'ribbon' (panes) | 'bay' (bayDepth,
//            bayFront: 1 = box bay, less = angled)
//   shape    for 'fixed': rect | arch | round | oval | lunette | octagon | gothic | gable (rise for arches)
//   pattern  grid | diamond | prairie | cross | topgrid | fan | spokes | none (litesX/litesY set the counts)
//   transom  true | 'fan' (casement: fixed light in the head, fan-shaped for 'fan')
//   shutters 'louvre' | 'board' | 'panel' (accentColor); flowerbox (accentColor, plantColor)
//   hood     'cornice' | 'pediment' | 'lintel' | 'awning'; grille (bar count); juliet (balcony rail)

const SASH_T = 0.036;

/** A sash: frame members around glass with optional glazing bars, centred on z = zc. */
function addSash(p: Parts, x0: number, y0: number, x1: number, y1: number, zc: number, member: number, nx: number, ny: number, bottomRail = member, pattern: BarPattern = 'grid'): void {
  const z0 = zc - SASH_T / 2, z1 = zc + SASH_T / 2;
  p.box('frame', x0, y0, z0, x0 + member, y1, z1);
  p.box('frame', x1 - member, y0, z0, x1, y1, z1);
  p.box('frame', x0 + member, y1 - member, z0, x1 - member, y1, z1);
  p.box('frame', x0 + member, y0, z0, x1 - member, y0 + bottomRail, z1);
  if (pattern === 'grid') {
    addGlazing(p, 'frame', 'glass', x0 + member, y0 + bottomRail, x1 - member, y1 - member, nx, ny, zc, SASH_T * 0.55);
  } else {
    const gx0 = x0 + member, gx1 = x1 - member, gy0 = y0 + bottomRail, gy1 = y1 - member;
    p.box('glass', gx0, gy0, zc - 0.003, gx1, gy1, zc + 0.003);
    addPattern(p, 'frame', [[gx0, gy0], [gx1, gy0], [gx1, gy1], [gx0, gy1]], pattern, nx, ny, zc, SASH_T * 0.55);
  }
}

function addShutters(p: Parts, d: FrameDims, kind: string): void {
  const T = WALL_THICKNESS;
  const x0 = d.hw + d.cw + 0.012;
  const sw = d.tileHalf - 0.004 - x0;
  if (sw < 0.06) return;
  const y0 = Math.max(0.02, d.bottom - 0.03), y1 = d.top + d.cw * 0.6;
  const z0 = T / 2 + 0.026, z1 = z0 + 0.026;
  for (const s of [-1, 1]) {
    const xa = s < 0 ? -x0 - sw : x0, xb = s < 0 ? -x0 : x0 + sw;
    const st = Math.min(0.035, sw * 0.25);
    p.box('accent', xa, y0, z0, xa + st, y1, z1); p.box('accent', xb - st, y0, z0, xb, y1, z1);
    p.box('accent', xa + st, y0, z0, xb - st, y0 + st, z1); p.box('accent', xa + st, y1 - st, z0, xb - st, y1, z1);
    if (kind === 'louvre') {
      const n = Math.max(3, Math.floor((y1 - y0 - 2 * st) / 0.045));
      for (let i = 0; i < n; i++) {
        const g = new THREE.BoxGeometry(xb - xa - 2 * st, 0.006, 0.03);
        g.rotateX(0.7);
        g.translate((xa + xb) / 2, y0 + st + ((i + 0.5) * (y1 - y0 - 2 * st)) / n, (z0 + z1) / 2);
        p.add('accent', g);
      }
    } else if (kind === 'board') {
      const n = Math.max(2, Math.round(sw / 0.07));
      for (let i = 1; i < n; i++) p.box('accent', xa + (sw * i) / n - 0.003, y0 + st, z1, xa + (sw * i) / n + 0.003, y1 - st, z1 + 0.004);
      for (const ly of [y0 + 0.2, y1 - 0.2]) p.box('accent', xa, ly - 0.04, z1, xb, ly + 0.04, z1 + 0.012);
      p.bar('accent', (xa + xb) / 2, (y0 + y1) / 2, z1 + 0.006, Math.hypot(sw, y1 - y0 - 0.4) * 0.62, 0.04, 0.012, Math.atan2(y1 - y0 - 0.4, s * sw));
    } else {
      const rail = 0.07;
      p.box('accent', xa + st, y0 + st, z0, xb - st, y1 - st, z0 + 0.012); // backing
      const mid = (y0 + y1) / 2;
      p.box('accent', xa + st, mid - rail / 2, z0, xb - st, mid + rail / 2, z1);
      p.box('accent', xa + st + 0.03, y0 + st + 0.03, z1, xb - st - 0.03, mid - rail / 2 - 0.03, z1 + 0.008);
      p.box('accent', xa + st + 0.03, mid + rail / 2 + 0.03, z1, xb - st - 0.03, y1 - st - 0.03, z1 + 0.008);
    }
  }
}

function addFlowerBox(p: Parts, d: FrameDims): void {
  const T = WALL_THICKNESS;
  const x0 = -d.hw - d.cw * 0.3, x1 = d.hw + d.cw * 0.3;
  const yb = d.bottom - 0.2, yt = d.bottom - 0.05, z0 = T / 2 + 0.04, z1 = z0 + 0.15;
  p.box('frame', x0, yb, z0, x1, yt, z1);
  p.box('frame', x0 - 0.01, yt - 0.02, z0 - 0.005, x1 + 0.01, yt, z1 + 0.01);
  for (let i = 0; i < 9; i++) {
    const t = (i + 0.5) / 9, x = x0 + 0.03 + (x1 - x0 - 0.06) * t;
    const h = 0.1 + ((i * 7) % 5) * 0.025;
    p.box('plant', x - 0.035, yt, z0 + 0.01, x + 0.035, yt + h, z1 - 0.01);
    if (i % 2 === 0) p.box('accent', x - 0.025, yt + h, z0 + 0.03, x + 0.025, yt + h + 0.04, z1 - 0.03);
  }
}

function addHood(p: Parts, d: FrameDims, kind: string): void {
  const T = WALL_THICKNESS;
  const x0 = -d.hw - d.cw, x1 = d.hw + d.cw, y = d.top + d.cw;
  if (kind === 'cornice' || kind === 'lintel') {
    const hgt = kind === 'lintel' ? 0.07 : 0.05;
    for (const s of [-1, 1]) {
      p.box(kind === 'lintel' ? 'accent' : 'frame', x0 - 0.02, y, s * (T / 2), x1 + 0.02, y + hgt, s * (T / 2 + 0.05));
      if (kind === 'cornice') p.box('frame', x0 - 0.035, y + hgt, s * (T / 2), x1 + 0.035, y + hgt + 0.02, s * (T / 2 + 0.07));
      if (kind === 'lintel') p.box('accent', -0.04, y - d.cw * 0.5, s * (T / 2), 0.04, y + hgt + 0.03, s * (T / 2 + 0.06)); // keystone
    }
  } else if (kind === 'pediment') {
    for (const s of [-1, 1]) {
      p.extrude('frame', [[x0 - 0.03, y], [x1 + 0.03, y], [0, y + Math.min(0.1, (x1 - x0) * 0.2)]], [], s > 0 ? T / 2 : -T / 2 - 0.03, s > 0 ? T / 2 + 0.03 : -T / 2);
      p.box('frame', x0 - 0.03, y - 0.012, s * (T / 2), x1 + 0.03, y, s * (T / 2 + 0.04));
    }
  } else if (kind === 'awning') {
    const ext = 0.22, ra = Math.atan2(0.1, ext);
    const g = new THREE.BoxGeometry(Math.min(x1 - x0 + 0.12, d.tileHalf * 2 - 0.01), 0.012, Math.hypot(ext, 0.1));
    g.rotateX(ra);
    g.translate(0, y + 0.075, T / 2 + ext / 2 + 0.015);
    p.add('accent', g);
  }
}

function addGrille(p: Parts, d: FrameDims, n: number): void {
  const T = WALL_THICKNESS;
  const z = T / 2 + 0.034, x0 = -d.hw + 0.02, x1 = d.hw - 0.02;
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / Math.max(1, n - 1);
    p.box('metal', x - 0.008, d.bottom + 0.02, z - 0.008, x + 0.008, d.top - 0.02, z + 0.008);
  }
  for (const y of [d.bottom + 0.05, d.top - 0.05, (d.bottom + d.top) / 2]) p.box('metal', x0 - 0.015, y - 0.012, z - 0.012, x1 + 0.015, y + 0.012, z + 0.012);
}

function addJuliet(p: Parts, d: FrameDims): void {
  const T = WALL_THICKNESS;
  const x0 = -d.hw, x1 = d.hw, z0 = T / 2 + 0.04, zf = z0 + 0.14, h = 1.0, y0 = Math.max(0.05, d.bottom);
  p.box('metal', x0, y0, z0 - 0.01, x1, y0 + 0.03, zf); // shelf
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = x0 + 0.03 + ((x1 - x0 - 0.06) * i) / (n - 1);
    p.box('metal', x - 0.008, y0 + 0.03, zf - 0.01, x + 0.008, y0 + h, zf);
  }
  p.box('metal', x0, y0 + h, zf - 0.02, x1, y0 + h + 0.03, zf + 0.012);
  for (const sx of [x0, x1 - 0.02]) p.box('metal', sx, y0 + 0.03, z0, sx + 0.02, y0 + h + 0.03, zf);
}

function buildWindow(def: OpeningDef): THREE.Group {
  const d = frameDims(def);
  const p = new Parts();
  addLiningAndCasing(p, d, true);
  const T = WALL_THICKNESS;
  const kind = sStr(def, 'window', 'sash');
  // sill through the wall, protruding on both faces, with an apron under it on each face (a bay brings its own seat)
  if (kind !== 'bay') {
    const sx = Math.min(d.hw + d.cw + 0.012, d.tileHalf - 0.004);
    p.box('frame', -sx, d.bottom - 0.032, -T / 2 - 0.035, sx, d.bottom + 0.004, T / 2 + 0.035);
    for (const side of [-1, 1]) {
      p.box('frame', -d.hw - d.cw * 0.6, d.bottom - 0.032 - 0.06, side * (T / 2), d.hw + d.cw * 0.6, d.bottom - 0.032, side * (T / 2 + 0.014));
    }
  }
  const nx = Math.max(1, Math.round(sNum(def, 'litesX', 1)));
  const ny = Math.max(1, Math.round(sNum(def, 'litesY', 1)));
  const ix0 = -d.hw + d.fw, ix1 = d.hw - d.fw;
  const iy0 = d.bottom + d.fw * 0.8, iy1 = d.top - d.fw;
  const member = sNum(def, 'member', 0.04);
  const pattern = sStr(def, 'pattern', 'grid') as BarPattern;
  const handleAt = (x: number, y: number, zc: number) => p.box('metal', x - 0.006, y - 0.05, zc + SASH_T / 2, x + 0.006, y + 0.05, zc + SASH_T / 2 + 0.014);
  /** Fixed head light above a casement; returns the top of the opening sash. */
  const headLight = (): number => {
    const t = (def.style as Record<string, unknown>).transom;
    if (!t) return iy1;
    const tH = Math.min(t === 'fan' ? 0.45 : 0.32, (iy1 - iy0) * 0.3);
    const barY = iy1 - tH;
    addTransom(p, ix0, ix1, barY, iy1, t === 'fan' ? 'fan' : 'rect', 0, member * 0.8, nx + 1, 'grid');
    return barY - 0.022;
  };

  if (kind === 'slider') {
    // two panes in separate tracks, overlapping in the middle
    const mx = (ix0 + ix1) / 2, overlap = 0.03;
    addSash(p, ix0, iy0, mx + overlap, iy1, 0.016, member, nx, ny, member, pattern);
    addSash(p, mx - overlap, iy0, ix1, iy1, -0.016, member, nx, ny, member, pattern);
    p.box('metal', mx - overlap - 0.012, (iy0 + iy1) / 2 - 0.06, 0.016 + SASH_T / 2, mx - overlap, (iy0 + iy1) / 2 + 0.06, 0.016 + SASH_T / 2 + 0.012);
  } else if (kind === 'sash') {
    const mid = (iy0 + iy1) / 2;
    const meet = 0.016;
    addSash(p, ix0, iy0, ix1, mid + meet, 0.014, member, nx, ny, member * 1.4, pattern);
    addSash(p, ix0, mid - meet, ix1, iy1, -0.014, member, nx, ny, member, pattern);
    // sash lifts on the lower rail
    for (const fx of [-0.25, 0.25]) {
      const hx = (ix0 + ix1) / 2 + fx * (ix1 - ix0);
      p.box('metal', hx - 0.02, iy0 + member * 0.3, 0.014 + SASH_T / 2, hx + 0.02, iy0 + member * 0.9, 0.014 + SASH_T / 2 + 0.012);
    }
  } else if (kind === 'casement') {
    const top = headLight();
    const mx = (ix0 + ix1) / 2;
    const hy = (iy0 + top) / 2;
    if (sBool(def, 'single')) {
      // one sash across the whole opening, a handle on its free edge
      addSash(p, ix0, iy0, ix1, top, 0.004, member, nx, ny, member, pattern);
      handleAt(ix1 - member, hy, 0.004);
    } else {
      p.box('frame', mx - 0.02, iy0, -SASH_T / 2, mx + 0.02, top, SASH_T / 2);
      addSash(p, ix0, iy0, mx - 0.02, top, 0.004, member, nx, ny, member, pattern);
      addSash(p, mx + 0.02, iy0, ix1, top, 0.004, member, nx, ny, member, pattern);
      for (const hx of [mx - 0.02 - member / 2, mx + 0.02 + member / 2]) handleAt(hx, hy, 0.004);
    }
  } else if (kind === 'ribbon') {
    // a row of equal panes, every other one opening
    const n = Math.max(2, Math.round(sNum(def, 'panes', 3)));
    const mu = 0.03, w = (ix1 - ix0 - (n - 1) * mu) / n;
    for (let i = 0; i < n; i++) {
      const xa = ix0 + i * (w + mu);
      addSash(p, xa, iy0, xa + w, iy1, 0.004, member, nx, ny, member, pattern);
      if (i < n - 1) p.box('frame', xa + w, iy0, -SASH_T / 2, xa + w + mu, iy1, SASH_T / 2);
      if (i % 2 === 1) handleAt(xa + member * 0.6, (iy0 + iy1) / 2, 0.004);
    }
  } else if (kind === 'jalousie') {
    const n = Math.max(4, Math.round(sNum(def, 'blades', 8)));
    p.box('frame', ix0, iy0, -SASH_T / 2, ix0 + 0.03, iy1, SASH_T / 2);
    p.box('frame', ix1 - 0.03, iy0, -SASH_T / 2, ix1, iy1, SASH_T / 2);
    const span = iy1 - iy0;
    for (let i = 0; i < n; i++) {
      const g = new THREE.BoxGeometry(ix1 - ix0 - 0.06, 0.004, span / n * 1.25);
      g.rotateX(0.75);
      g.translate((ix0 + ix1) / 2, iy0 + ((i + 0.5) * span) / n, 0);
      p.add('glass', g);
    }
    for (const sx of [ix0 + 0.03, ix1 - 0.03]) for (let i = 0; i < n; i++) p.box('metal', sx - (sx < 0 ? 0 : 0.012), iy0 + (i * span) / n + 0.01, -0.012, sx + (sx < 0 ? 0.012 : 0), iy0 + (i * span) / n + 0.018, 0.012);
  } else if (kind === 'bay') {
    const W = ix1 - ix0, D = sNum(def, 'bayDepth', 0.32), ratio = Math.max(0.3, Math.min(1, sNum(def, 'bayFront', 0.55)));
    const fw = W * ratio;
    const sideL = Math.hypot((W - fw) / 2, D);
    const bm = member * 0.9;
    // front and two angled sides
    addSash(p, -fw / 2, iy0, fw / 2, iy1, D, bm, nx, ny, bm, pattern);
    for (const s of [-1, 1]) {
      const q = new Parts();
      addSash(q, -sideL / 2, iy0, sideL / 2, iy1, 0, bm, Math.max(1, nx - 1), ny, bm, pattern);
      const dx = -s * ((W - fw) / 2), phi = Math.atan2(-D, dx);
      const m = new THREE.Matrix4().makeTranslation(s * (W + fw) / 4, 0, D / 2).multiply(new THREE.Matrix4().makeRotationY(s < 0 ? phi : phi));
      p.absorb(q, m);
    }
    // seat and head boards (trapezoids; shape y is -z after the quarter turn)
    const trap: Pt[] = [[-W / 2 - 0.02, 0.02], [W / 2 + 0.02, 0.02], [fw / 2 + 0.03, -D - 0.03], [-fw / 2 - 0.03, -D - 0.03]];
    for (const [y, t] of [[d.bottom - 0.04, 0.045], [iy1 + d.fw, 0.05]] as const) {
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(trap.map(([x, z]) => new THREE.Vector2(x, z))), { depth: t, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);
      g.translate(0, y, 0);
      p.add('frame', g);
    }
  } else {
    const shape = sStr(def, 'shape', 'rect') as LightShape;
    if (shape === 'rect') addSash(p, ix0, iy0, ix1, iy1, 0, member * 0.75, nx, ny, member * 0.75, pattern);
    else addShapedLight(p, shape, ix0, iy0, ix1, iy1, 0, member * 0.9, pattern, nx, ny, sNum(def, 'rise', 0));
  }

  // decoration outside the wall opening
  const shutters = sStr(def, 'shutters', '');
  if (shutters) addShutters(p, d, shutters);
  if (sBool(def, 'flowerbox')) addFlowerBox(p, d);
  const hood = sStr(def, 'hood', '');
  if (hood) addHood(p, d, hood);
  const grille = sNum(def, 'grille', 0);
  if (grille > 0) addGrille(p, d, Math.round(grille));
  if (sBool(def, 'juliet')) addJuliet(p, d);

  const group = new THREE.Group();
  const frame = p.mesh('frame', material('paint', sStr(def, 'frameColor', '#f3f0e8')), 'frame');
  if (frame) group.add(frame);
  const glass = p.mesh('glass', material(sStr(def, 'glass', 'clear') === 'frosted' ? 'frosted' : 'glass', '#ffffff'), 'glass');
  if (glass) group.add(glass);
  const metal = p.mesh('metal', material('metal', sStr(def, 'hardware', '#9a9ea3')), 'hardware');
  if (metal) group.add(metal);
  const accent = p.mesh('accent', material('paint', sStr(def, 'accentColor', '#3f5a48')), 'accent');
  if (accent) group.add(accent);
  const plant = p.mesh('plant', material('paint', sStr(def, 'plantColor', '#4f7a3f')), 'plant');
  if (plant) group.add(plant);
  return group;
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

const prototypes = new Map<string, THREE.Group>();

function protoKey(def: OpeningDef): string {
  return JSON.stringify([def.id, def.kind, def.width, def.height, def.sill, def.style]);
}

/**
 * Builds the mesh for an opening definition (see the header for local space). Instances share geometry
 * and materials with a cached prototype; each call returns an independent Group (its own leaf pivot).
 */
export function buildOpeningMesh(def: OpeningDef, opts: { flip?: boolean } = {}): THREE.Group {
  const key = protoKey(def);
  let proto = prototypes.get(key);
  if (!proto) {
    proto = def.kind === 'door' ? buildDoor(def) : buildWindow(def);
    proto.name = `opening:${def.id}`;
    proto.userData = { openingId: def.id, kind: def.kind, cutout: openingCutout(def) };
    prototypes.set(key, proto);
  }
  const g = proto.clone(true);
  g.userData = { ...proto.userData };
  if (opts.flip) g.rotation.y = Math.PI;
  return g;
}

/** Every moving leaf of a door built by buildOpeningMesh: 'leaf', 'leaf2', ... */
function doorLeaves(group: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  for (const c of group.children) if (c.name === OPENING_LEAF_NAME || /^leaf\d+$/.test(c.name)) out.push(c);
  return out;
}

/**
 * Opens a door built by buildOpeningMesh: 0 = closed, 1 = fully open. Swinging leaves turn toward local +z,
 * folding leaves concertina, sliding and pocket leaves run along x, and a roll-up door gathers toward its head.
 */
export function setDoorOpen(group: THREE.Object3D, amount: number): void {
  const t = Math.max(0, Math.min(1, amount));
  for (const leaf of doorLeaves(group)) {
    const u = leaf.userData as { motion?: string; dir?: number; maxSwing?: number; baseX?: number; slide?: number };
    const max = typeof u.maxSwing === 'number' ? u.maxSwing : Math.PI / 2;
    switch (u.motion) {
      case 'fixed': break;
      case 'slide': leaf.position.x = (u.baseX ?? 0) + t * (u.slide ?? 0); break;
      case 'rollup': leaf.scale.y = 1 - t * 0.97; break;
      case 'bifold': {
        const dir = u.dir ?? 1;
        leaf.rotation.y = -t * max * 0.9 * dir;
        const fold = leaf.getObjectByName('fold');
        if (fold) fold.rotation.y = t * max * 1.8 * dir;
        break;
      }
      default: leaf.rotation.y = -t * max * (u.dir ?? 1);
    }
  }
}

/** Frees all cached opening geometry and materials (renderer teardown). */
export function disposeOpeningMeshes(): void {
  for (const proto of prototypes.values()) {
    proto.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
  prototypes.clear();
  for (const m of materials.values()) m.dispose();
  materials.clear();
}
