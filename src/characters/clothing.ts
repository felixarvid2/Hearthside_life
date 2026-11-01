// Procedural garments built on the fitted body template (template.ts). Garments are skinned shells: rings of
// the body grids, re-sampled with exact hem rows, offset outward along the smooth normals by a layer
// thickness, loosened by "drape" (cloth hangs instead of following concave body regions) and bridged across
// concave dips with a per-ring convex hull. Skirts are generated cones skinned with blended pelvis/thigh
// weights; shoes are shells around the source feet with a thicker sole. Every vertex gets body-shape morph
// deltas from bodyShape.ts so clothing fits every body preset. Necklines, armholes, bibs and leg cuts are
// fragment-level cut-offs in bind space (see CutParams, applied by the cloth shader). Pure module.

import type { GarmentDef } from '../content/types';
import { BODY_PARAM_IDS, bodyDeltas } from './bodyShape';
import { hullRadii, sampleProfile } from './fit';
import type { MeshData } from './meshData';
import { addVertex, computeSmoothNormals, emptyMesh, mirrorMesh, stitchRings, sweep, v3 } from './meshData';
import type { Skin, Vec3 } from './rig';
import { blendSkins, boneIndex, clamp, lerp, smoothstep } from './rig';
import type { BodyTemplate, Grid } from './template';
import { gridNormal, legPoint } from './template';

/** Panel ids stored in aCloth.w (shared with the cloth shader). */
export const PANEL = { torso: 0, sleeve: 1, leg: 2, skirt: 3, collar: 4, sole: 5, shoe: 6, inner: 7, bib: 8, innerSleeve: 9, innerCollar: 10 } as const;

export const CLOTH_ATTRS = { aCloth: 4 };

/** Body regions a garment hides (body vertices there are pushed inward to prevent poke-through). */
export interface Coverage {
  torso: { yMin: number; yMaxBack: number; yMaxFront: number } | null;
  armMaxX: number;
  legMinY: number;
  footMaxY: number;
}

/** Bind-space cut and trim parameters for the cloth shader (four vec4 uniforms). */
export interface CutParams {
  /** neck: back height, front depth, half width, shape (0 crew, 1 scoop, 2 v, 3 square, 4 none) */
  neck: [number, number, number, number];
  /** armhole height, strap inner |x|, strap outer |x|, mode (0 none, 1 straps) */
  arm: [number, number, number, number];
  /** swimsuit leg cut height (0 = none), bib top y, bib half width, overalls flag */
  misc: [number, number, number, number];
  /** torso hem y, sleeve end |x|, leg hem y, waist top y */
  hem: [number, number, number, number];
  /** neck of the shirt under a suit jacket (same layout as `neck`; all zero = the inner shirt uses `neck`) */
  inner: [number, number, number, number];
}

export interface GarmentBuild {
  mesh: MeshData;
  coverage: Coverage;
  cuts: CutParams;
}

const NO_COVER: Coverage = { torso: null, armMaxX: 0, legMinY: 10, footMaxY: 0 };

type B = Record<string, number | string | boolean>;
const num = (b: B, k: string, d: number) => (typeof b[k] === 'number' ? (b[k] as number) : d);
const str = (b: B, k: string, d: string) => (typeof b[k] === 'string' ? (b[k] as string) : d);
const bool = (b: B, k: string) => b[k] === true;

interface RP { p: Vec3; n: Vec3; skin: Skin; u: number; v: number }
type Ring = RP[];

// ---------------------------------------------------------------------------------------------
// Grid sampling
// ---------------------------------------------------------------------------------------------

/** Interpolated grid ring at axis coordinate s (extrapolated straight beyond the ends). */
function sampleRing(g: Grid, s: number, axis: 'x' | 'y'): { pos: Vec3[]; nrm: Vec3[]; skin: Skin[]; ang: number[] } {
  const n = g.rows;
  const asc = (g.s[n - 1] as number) > (g.s[0] as number);
  let j0 = 0;
  let t = 0;
  let extra = 0;
  const first = g.s[0] as number, last = g.s[n - 1] as number;
  const beyondEnd = asc ? s > last : s < last;
  const beforeStart = asc ? s < first : s > first;
  if (beyondEnd) { j0 = n - 2; t = 1; extra = s - last; }
  else if (beforeStart) { j0 = 0; t = 0; extra = s - first; }
  else {
    for (let j = 0; j < n - 1; j++) {
      const a = g.s[j] as number, b = g.s[j + 1] as number;
      if ((s - a) * (s - b) <= 0) { j0 = j; t = b === a ? 0 : (s - a) / (b - a); break; }
    }
  }
  const pos: Vec3[] = [], nrm: Vec3[] = [], skin: Skin[] = [], ang: number[] = [];
  for (let i = 0; i < g.cols; i++) {
    const a = legPoint(g, j0, i), b = legPoint(g, j0 + 1, i);
    const p = v3.lerp(a, b, t);
    if (extra !== 0) { if (axis === 'y') p[1] += extra; else p[0] += extra; }
    pos.push(p);
    nrm.push(v3.norm(v3.lerp(gridNormal(g, j0, i), gridNormal(g, j0 + 1, i), t)));
    const sa = g.skin[j0 * g.cols + i] as Skin, sb = g.skin[(j0 + 1) * g.cols + i] as Skin;
    skin.push(t <= 0.001 ? sa : t >= 0.999 ? sb : blendSkins([{ skin: sa, f: 1 - t }, { skin: sb, f: t }]));
    ang.push(g.ang[j0 * g.cols + i] as number);
  }
  return { pos, nrm, skin, ang };
}

/** Axis coordinates from a to b with roughly `step` spacing (always includes both ends exactly). */
function stations(a: number, b: number, step: number): number[] {
  const n = Math.max(1, Math.round(Math.abs(b - a) / step));
  const out: number[] = [];
  for (let k = 0; k <= n; k++) out.push(a + ((b - a) * k) / n);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Body-relative fitting (necklines follow the scanned shoulder slope) and rolled rims
// ---------------------------------------------------------------------------------------------

const halfWidths = new WeakMap<Grid, number[]>();

/** Largest |x| of each torso ring (cached per grid). */
function ringHalfWidths(g: Grid): number[] {
  let w = halfWidths.get(g);
  if (w) return w;
  w = [];
  for (let j = 0; j < g.rows; j++) {
    let m = 0;
    for (let i = 0; i < g.cols; i++) m = Math.max(m, Math.abs(g.pos[(j * g.cols + i) * 3] as number));
    w.push(m);
  }
  halfWidths.set(g, w);
  return w;
}

/** Height above the shoulders at which the torso narrows to the given half width (the neck column grows out of the shoulder slope). */
export function heightAtHalfWidth(t: BodyTemplate, hw: number): number {
  const g = t.torso;
  const w = ringHalfWidths(g);
  // only the shoulder slope and neck count: a body whose shoulders are narrower than the target gets the opening at the shoulder line
  const floorY = t.lm.shoulderY + 0.01;
  for (let j = g.rows - 1; j > 0; j--) {
    if ((g.s[j - 1] as number) < floorY) break;
    const wj = w[j] as number, wl = w[j - 1] as number;
    if (wl >= hw && wj < hw) {
      const f = (hw - wj) / (wl - wj);
      return lerp(g.s[j] as number, g.s[j - 1] as number, f);
    }
  }
  return floorY;
}

/** Largest |x| of the torso at height y (interpolated between rings). */
export function halfWidthAt(t: BodyTemplate, y: number): number {
  const g = t.torso;
  const w = ringHalfWidths(g);
  for (let j = 0; j < g.rows - 1; j++) {
    const a = g.s[j] as number, b = g.s[j + 1] as number;
    if ((y - a) * (y - b) <= 0) return lerp(w[j] as number, w[j + 1] as number, b === a ? 0 : (y - a) / (b - a));
  }
  return w[y < (g.s[0] as number) ? 0 : g.rows - 1] as number;
}

/**
 * Rolled rim: extra rings that curl the open end of a shell round into a small tube (outer face, turn, inner face), so
 * hems, cuffs and sleeve ends have thickness instead of ending as a cut-off sheet. `along` points out of the opening;
 * `rho` is the tube radius in metres. Returns the rings to add after (end) or before (start) the shell's end ring.
 */
function rimRings(end: Ring, along: Vec3, rho: number): Ring[] {
  const out: Ring[] = [];
  for (const phi of [Math.PI / 3, (2 * Math.PI) / 3, Math.PI]) {
    const d = rho * Math.sin(phi);
    const o = -rho + rho * Math.cos(phi);
    out.push(end.map((q) => {
      const p = v3.madd(v3.madd(q.p, along, d), q.n, o);
      return { ...q, p };
    }));
  }
  return out;
}

/** Appends a rolled rim to the last ring of a list (or prepends it before the first ring). */
function withRim(rings: Ring[], where: 'first' | 'last', along: Vec3, rho: number): Ring[] {
  if (rho <= 0 || rings.length === 0) return rings;
  if (where === 'last') return [...rings, ...rimRings(rings[rings.length - 1] as Ring, along, rho)];
  return [...rimRings(rings[0] as Ring, along, rho).reverse(), ...rings];
}

// ---------------------------------------------------------------------------------------------
// Shape helpers (radial operations in a ring's cross-section plane)
// ---------------------------------------------------------------------------------------------

/** Ring centre for torso/leg rows (horizontal) or arm rows (y-z plane). */
function centreOf(t: BodyTemplate, part: 'torso' | 'leg' | 'arm', s: number): [number, number] {
  const prof = part === 'torso' ? t.profiles.torso : part === 'leg' ? t.profiles.leg : t.profiles.arm;
  const c = sampleProfile(prof, s, 0);
  return [c.ca, c.cb];
}

function planar(part: 'torso' | 'leg' | 'arm', p: Vec3): [number, number] {
  return part === 'arm' ? [p[1], p[2]] : [p[0], p[2]];
}

function setPlanar(part: 'torso' | 'leg' | 'arm', p: Vec3, a: number, b: number): Vec3 {
  return part === 'arm' ? [p[0], a, b] : [a, p[1], b];
}

/** Scales a ring point radially so its distance from the centre becomes r. */
function withRadius(part: 'torso' | 'leg' | 'arm', p: Vec3, c: [number, number], r: number): Vec3 {
  const [a, b] = planar(part, p);
  const da = a - c[0], db = b - c[1];
  const l = Math.hypot(da, db) || 1e-9;
  return setPlanar(part, p, c[0] + (da / l) * r, c[1] + (db / l) * r);
}

function radius(part: 'torso' | 'leg' | 'arm', p: Vec3, c: [number, number]): number {
  const [a, b] = planar(part, p);
  return Math.hypot(a - c[0], b - c[1]);
}

/**
 * Builds offset rings for a grid between axis coords, ordered as given (first = start).
 * opts.drape: rows after `drapeFrom` may not shrink faster than `slope` per metre (cloth hangs).
 */
function shellRings(t: BodyTemplate, g: Grid, part: 'torso' | 'leg' | 'arm', ss: number[], o: {
  thickness: number; ease?: (s: number) => number; hull?: (s: number) => number; drapeFrom?: number; slope?: number;
  uScale: number; side?: 1 | -1;
  /** Hanging folds: radial ripple amplitude (m) as a function of the axis coordinate, and the number of folds around. */
  fold?: (s: number) => number; folds?: number;
  /** Radial offset (m) as a function of the axis coordinate and the angle around: quilting, pleats. */
  wave?: (s: number, ang: number) => number;
}): Ring[] {
  const axis = part === 'arm' ? 'x' : 'y';
  const rings: Ring[] = [];
  let prevR: number[] | null = null;
  let prevS = 0;
  for (const s of ss) {
    const smp = sampleRing(g, s, axis);
    const c = centreOf(t, part, s);
    let pts = smp.pos.map((p, i) => v3.madd(p, smp.nrm[i] as Vec3, o.thickness + (o.ease ? o.ease(s) : 0)));
    // convex hull bridging
    const hk = o.hull ? o.hull(s) : 0;
    if (hk > 0) {
      const flat = pts.map((p) => planar(part, p));
      const hr = hullRadii(flat, c[0], c[1]);
      pts = pts.map((p, i) => withRadius(part, p, c, lerp(radius(part, p, c), hr[i] as number, hk)));
    }
    // drape envelope
    let rs = pts.map((p) => radius(part, p, c));
    if (prevR && o.drapeFrom !== undefined && o.slope !== undefined) {
      const active = (part === 'arm' ? s >= o.drapeFrom : s <= o.drapeFrom) && (part !== 'torso' || s > t.lm.crotchY + t.junctionSpan);
      if (active) {
        const ds = Math.abs(s - prevS);
        rs = rs.map((r, i) => Math.max(r, (prevR![i] as number) - (o.slope as number) * ds));
        pts = pts.map((p, i) => withRadius(part, p, c, rs[i] as number));
      }
    }
    if (o.fold) {
      const amp = o.fold(s);
      if (amp > 1e-5) {
        const k = o.folds ?? 7;
        pts = pts.map((p, i) => withRadius(part, p, c, (rs[i] as number) + amp * Math.sin((smp.ang[i] as number) * k + s * 5 + 0.7)));
      }
    }
    if (o.wave) pts = pts.map((p, i) => withRadius(part, p, c, radius(part, p, c) + (o.wave as (s: number, a: number) => number)(s, smp.ang[i] as number)));
    prevR = rs;
    prevS = s;
    rings.push(pts.map((p, i) => ({ p, n: smp.nrm[i] as Vec3, skin: smp.skin[i] as Skin, u: (smp.ang[i] as number) * o.uScale, v: part === 'arm' ? Math.abs(s) : s })));
  }
  return rings;
}

// ---------------------------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------------------------

function morphsAt(t: BodyTemplate, p: Vec3, skin: Skin): Record<string, Vec3> {
  return bodyDeltas(t.ctx, p, skin) as unknown as Record<string, Vec3>;
}

function emitRings(m: MeshData, t: BodyTemplate, rings: Ring[], panel: number, flip: boolean, closed = true): number[][] {
  const out: number[][] = [];
  const starts: number[] = [];
  for (const ring of rings) {
    const ids = ring.map((q) => addVertex(m, q.p, q.skin, { aCloth: [q.u, q.v, 0, panel] }, morphsAt(t, q.p, q.skin)));
    starts.push(ids[0] as number);
    out.push(ids);
  }
  const cols = (rings[0] as Ring).length;
  stitchRings(m, starts, cols, flip, closed);
  return out;
}

function newMesh(): MeshData { return emptyMesh(CLOTH_ATTRS, BODY_PARAM_IDS); }

function mirrored(t: BodyTemplate, m: MeshData): MeshData {
  return mirrorMesh(m, (j) => t.boneMirror[j] ?? j, { aCloth: [0] });
}

function merge(dst: MeshData, src: MeshData): void {
  const base = dst.positions.length / 3;
  dst.positions.push(...src.positions); dst.normals.push(...src.normals);
  dst.skinIndex.push(...src.skinIndex); dst.skinWeight.push(...src.skinWeight);
  for (const [k, a] of Object.entries(dst.attrs)) a.data.push(...(src.attrs[k]?.data ?? new Array((src.positions.length / 3) * a.size).fill(0)));
  for (const [k, arr] of Object.entries(dst.morphs)) arr.push(...(src.morphs[k] ?? new Array(src.positions.length).fill(0)));
  for (const i of src.indices) dst.indices.push(i + base);
}

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------

interface TorsoOpts {
  yBottom: number; yTop: number; thickness: number; drape: number; hullFrom?: number; panel?: number; overBottoms?: boolean; rim?: number; step?: number;
  /** Quilting: bulge height (m) between seams every `period` metres. */
  puff?: number; period?: number;
}

/** Torso shell between two heights (rings ascending). Returns rings for further use. */
function torsoPiece(m: MeshData, t: BodyTemplate, o: TorsoOpts): void {
  const lm = t.lm;
  const yc = lm.crotchY;
  const ss = stations(o.yTop, Math.max(o.yBottom, yc), o.step ?? 0.024); // descending, for the drape envelope
  const hullFrom = o.hullFrom ?? yc + t.junctionSpan;
  const slope = lerp(0.7, 0.04, clamp(o.drape, 0, 1));
  const tuckOut = o.overBottoms ? (s: number) => 0.012 + 0.012 * smoothstep(lm.waistY, lm.crotchY + 0.03, s) : undefined;
  const rings = shellRings(t, t.torso, 'torso', ss, {
    thickness: o.thickness, uScale: 0.15, ease: tuckOut ? (s) => (s < lm.waistY + 0.02 ? tuckOut(s) * smoothstep(lm.waistY + 0.02, lm.waistY - 0.04, s) : 0) : undefined,
    hull: (s) => smoothstep(hullFrom, hullFrom + 0.04, s) * 0.95,
    drapeFrom: lm.chestY - 0.02, slope,
    // loose cloth hangs in soft vertical folds below the chest; tight garments (drape 0) stay smooth
    fold: o.drape > 0.3 && !o.puff ? (s) => 0.0045 * o.drape * (1 - smoothstep(lm.waistY, lm.chestY - 0.02, s)) : undefined,
    wave: o.puff ? (s) => o.puff! * Math.abs(Math.sin((Math.PI * s) / (o.period ?? 0.078))) * smoothstep(lm.crotchY + 0.02, lm.crotchY + 0.08, s) : undefined,
  });
  rings.reverse();
  emitRings(m, t, o.rim ? withRim(rings, 'first', [0, -1, 0], o.rim) : rings, o.panel ?? PANEL.torso, false);
}

/** Left leg shell from the crotch junction down to yHem (or a short gusset), mirrored for the right leg. */
function legPieces(m: MeshData, t: BodyTemplate, yHem: number, thickness: number, loose: number, cuff: boolean, panel: number = PANEL.leg, rim = 0, flare = 0): void {
  const lm = t.lm;
  const ss = stations(lm.crotchY, yHem, 0.034);
  const kneeY = lm.kneeY;
  const rings = shellRings(t, t.legL, 'leg', ss, {
    thickness, uScale: 0.08,
    // wide legs fall away from the knee: the extra radius grows toward the hem
    ease: (s) => loose * 0.012 * smoothstep(lm.crotchY - 0.02, lm.crotchY - 0.1, s) * (cuff ? 1 - smoothstep(yHem + 0.09, yHem + 0.02, s) : 1)
      + flare * smoothstep(kneeY + 0.18, Math.min(yHem, kneeY - 0.1), s),
    drapeFrom: lerp(lm.crotchY - 0.05, kneeY + 0.1, 0.5),
    slope: lerp(0.45, 0.02, clamp(loose, 0, 1)),
  });
  if (cuff) {
    // gather the last rows back to a snug cuff
    const n = rings.length;
    for (let k = Math.max(0, n - 3); k < n; k++) {
      const s = ss[k] as number;
      const c = centreOf(t, 'leg', s);
      const smp = sampleRing(t.legL, s, 'y');
      const ring = rings[k] as Ring;
      ring.forEach((q, i) => {
        const snug = radius('leg', v3.madd(smp.pos[i] as Vec3, smp.nrm[i] as Vec3, thickness + 0.004), c);
        const f = (k - (n - 3)) / 2;
        q.p = withRadius('leg', q.p, c, lerp(radius('leg', q.p, c), snug, f));
      });
    }
  }
  const left = newMesh();
  emitRings(left, t, withRim(rings, 'last', [0, -1, 0], rim), panel, true);
  merge(m, left);
  merge(m, mirrored(t, left));
}

/** Left sleeve from inside the shoulder to |x| = xEnd, mirrored. */
function sleevePieces(m: MeshData, t: BodyTemplate, xEnd: number, thickness: number, loose: number, cuffs: boolean, panel: number = PANEL.sleeve, rim = 0,
  shape: { balloon?: number; bell?: number; puff?: number } = {}): void {
  const lm = t.lm;
  // starts inside the shoulder, overlapping the torso shell, so no scanned acromion shows between sleeve and body
  const x0 = lm.armStartX - 0.012;
  const ss = stations(x0, xEnd, 0.024);
  const ramp = (s: number) => 0.3 + 0.7 * smoothstep(x0, x0 + 0.1, s);
  const rings = shellRings(t, t.armL, 'arm', ss, {
    thickness: thickness * 0.7, uScale: 0.05,
    ease: (s) => ramp(s) * (thickness * 0.3 + 0.002 + loose * 0.008 * (1 - smoothstep(xEnd - 0.06, xEnd, s) * (cuffs ? 1 : 0)))
      // gathered balloon sleeve (full at the middle, pulled in at the cuff) and bell sleeve (opens toward the end)
      + (shape.balloon ?? 0) * smoothstep(x0 + 0.04, x0 + 0.18, s) * (1 - smoothstep(xEnd - 0.1, xEnd - 0.01, s))
      + (shape.bell ?? 0) * smoothstep(x0 + 0.15, xEnd, s),
    drapeFrom: x0 + 0.1,
    slope: lerp(0.5, 0.0, clamp(loose, 0, 1)),
    wave: shape.puff ? (s) => shape.puff! * Math.abs(Math.sin((Math.PI * Math.abs(s)) / 0.078)) * smoothstep(x0 + 0.02, x0 + 0.08, s) : undefined,
  });
  const left = newMesh();
  emitRings(left, t, withRim(rings, 'last', [1, 0, 0], rim), panel, false);
  merge(m, left);
  merge(m, mirrored(t, left));
}

/** Skirt cone from yTop (waist) down to yHem; blended pelvis/thigh skinning. */
function skirtPiece(m: MeshData, t: BodyTemplate, yTop: number, yHem: number, flare: number, thickness: number, panel: number = PANEL.skirt, rim = 0,
  style: { pleats?: number; taper?: number; hemWave?: number } = {}): void {
  const lm = t.lm;
  const raw = t.raw;
  const pleats = style.pleats ?? 0;
  const taper = style.taper ?? 0;
  const cols = pleats > 0 ? Math.max(48, pleats * 4) : 48;
  const pelvis = boneIndex(raw, 'pelvis');
  const thighL = boneIndex(raw, 'thigh_l');
  const thighR = boneIndex(raw, 'thigh_r');
  const hipTop = lm.crotchY + 0.11;
  // reference ring at the hips: max radius per angle over the torso rows between hipTop and the waist
  const tor = t.profiles.torso;
  const centreAt = (y: number) => { const c = sampleProfile(tor, Math.max(y, lm.crotchY + 0.02), 0); return [c.ca, c.cb] as [number, number]; };
  const angleOf = (i: number) => (Math.PI * 2 * i) / cols - Math.PI; // back -> left? ordering: -PI..PI
  const surfaceR = (y: number, a: number) => sampleProfile(tor, y, a).r;
  const hipR = (a: number) => {
    let r = 0;
    for (let y = Math.max(lm.crotchY + 0.03, yHem); y <= Math.min(yTop, hipTop); y += 0.01) r = Math.max(r, surfaceR(y, a));
    return r;
  };
  // leg clearance: farthest leg point (from the torso centre) in each direction at a height
  const legClear = (y: number, a: number, c: [number, number]): number => {
    if (y > lm.crotchY) return 0;
    const smp = sampleRing(t.legL, y, 'y');
    let best = 0;
    const dir: [number, number] = [Math.sin(a), Math.cos(a)];
    for (const side of [1, -1]) for (const p of smp.pos) {
      const x = p[0] * side - c[0], z = p[2] - c[1];
      const along = x * dir[0] + z * dir[1];
      const perp = Math.abs(-x * dir[1] + z * dir[0]);
      if (perp < 0.03) best = Math.max(best, along);
    }
    return best;
  };
  const ss = stations(yTop, yHem, 0.025);
  const rings: Ring[] = [];
  const hipRs = Array.from({ length: cols }, (_, i) => hipR(angleOf(i)));
  for (const y of ss) {
    const c = centreAt(y);
    const below = clamp((hipTop - y) / Math.max(0.05, hipTop - yHem), 0, 1);
    const ring: Ring = [];
    for (let i = 0; i < cols; i++) {
      const a = angleOf(i);
      const body = y >= hipTop ? surfaceR(y, a) : hipRs[i] as number;
      let r = Math.max(body, lerp(surfaceR(Math.min(y, yTop), a), hipRs[i] as number, smoothstep(yTop, hipTop, y))) + thickness + 0.004;
      // bell flare: eases out of the hips instead of a straight cone, a little fuller at the sides than front and back
      const bell = 0.5 * smoothstep(0, 1, below) + 0.5 * Math.pow(below, 1.5);
      r += flare * 0.17 * bell * (0.85 + 0.15 * Math.abs(Math.sin(a)));
      // soft godet folds that widen toward the hem and twist slightly with height; the hem hangs lower on the ridges
      const foldAmp = pleats > 0 ? 0 : (0.02 + 0.09 * flare) * smoothstep(0.25, 0.85, below);
      const fold = pleats > 0 ? 0 : 0.7 * Math.sin(a * 6 + y * 5 + 0.6) + 0.3 * Math.sin(a * 13 - y * 3 + 1.9);
      r *= 1 + foldAmp * (0.5 + 0.5 * fold);
      if (pleats > 0) {
        // knife pleats: a triangle wave of sharp folds that opens from the hip yoke to the hem
        const ph = (a * pleats) / (Math.PI * 2);
        const tri = Math.abs(ph - Math.floor(ph) - 0.5) * 2; // 0 at a fold crest .. 1 at the valley
        r += (0.012 + 0.03 * flare) * smoothstep(0.05, 0.4, below) * (tri - 0.5) * 1.6 + 0.014 * smoothstep(0.05, 0.4, below);
      }
      // a pencil skirt narrows toward the knees (the legs below still keep it off the thighs)
      if (taper > 0) r = lerp(r, (hipRs[i] as number) * 0.86 + thickness, taper * smoothstep(0.1, 0.9, below));
      r = Math.max(r, legClear(y, a, c) + 0.025);
      const yy = y - 0.03 * flare * fold * smoothstep(0.5, 1, below);
      const p: Vec3 = [c[0] + Math.sin(a) * r, yy, c[1] + Math.cos(a) * r];
      // skin: torso near the top, blending into the thighs toward the hem by side
      const top = t.transfer.skinAt([c[0] + Math.sin(a) * surfaceR(Math.min(y, yTop), a) * 0.98, Math.max(y, lm.crotchY + 0.06), c[1] + Math.cos(a) * surfaceR(Math.min(y, yTop), a) * 0.98]);
      // the front follows the thighs closely (lap when seated), the back stays with the pelvis
      const f = lerp(0.35, 0.95, smoothstep(-0.2, 0.6, Math.cos(a))) * smoothstep(hipTop + 0.02, hipTop - 0.14, y);
      const sideL = clamp(0.5 + 0.7 * Math.sin(a), 0, 1);
      const skin = f > 0.001 ? blendSkins([
        { skin: top, f: 1 - f },
        { skin: { j: [thighL, pelvis, 0, 0], w: [1, 0, 0, 0] }, f: f * sideL },
        { skin: { j: [thighR, pelvis, 0, 0], w: [1, 0, 0, 0] }, f: f * (1 - sideL) },
      ]) : top;
      ring.push({ p, n: [Math.sin(a), 0, Math.cos(a)], skin, u: a * 0.2, v: y });
    }
    rings.push(ring);
  }
  rings.reverse(); // ascending y
  emitRings(m, t, withRim(rings, 'first', [0, -1, 0], rim), panel, false);
}

type CollarKind = 'shirt' | 'stand' | 'roll' | 'hood' | 'shawl' | 'lapel';

/** Cross-section of each collar kind: [up, outward, tip flag] rows, from the neckline outwards/upwards. */
const COLLAR_PROFILES: Record<CollarKind, number[][]> = {
  shirt: [[-0.004, -0.001, 0], [0.008, 0.002, 0], [0.0105, 0.012, 0], [-0.004, 0.024, 1]],
  stand: [[-0.004, -0.002, 0], [0.014, -0.004, 0], [0.024, -0.005, 0], [0.027, -0.001, 1]],
  // turtleneck: a tall tube that folds over at the top
  roll: [[-0.012, 0.0, 0], [0.006, 0.0075, 0], [0.022, 0.0105, 0], [0.036, 0.0105, 0], [0.046, 0.0085, 0], [0.048, 0.0, 0], [0.04, -0.0075, 0]],
  // hood worn down: a thick rolled cowl, pulled down into a pouch on the back
  hood: [[-0.006, 0.0, 0], [0.008, 0.014, 0], [0.02, 0.028, 0], [0.036, 0.032, 0], [0.044, 0.02, 0], [0.04, 0.004, 0], [0.024, -0.004, 0]],
  // shawl collar of a robe: a round roll along the V opening
  shawl: [[-0.006, 0.0, 0], [0.006, 0.01, 0], [0.018, 0.02, 0], [0.026, 0.016, 0], [0.026, 0.004, 0], [0.012, -0.002, 0]],
  // jacket lapel: a flat fold lying on the chest
  lapel: [[-0.008, -0.001, 0], [0.002, 0.004, 0], [0.012, 0.012, 0], [0.012, 0.026, 0], [-0.004, 0.04, 1], [-0.016, 0.036, 1]],
};

/**
 * Collar piece around the neckline: shirt/stand collar, turtleneck roll, hood cowl (all follow a dip of `frontDepth` at the front),
 * and the shawl/lapel kinds, which follow the V opening of the garment exactly (`halfW` is the V's half width at the shoulder).
 */
function collarPiece(m: MeshData, t: BodyTemplate, kind: CollarKind, thickness: number, neckY: number, frontDepth: number, halfW = 0.09, panel: number = PANEL.collar): void {
  const K = kind === 'hood' ? 36 : 32;
  const closed = kind === 'roll';
  const gap = closed ? 0 : kind === 'shirt' ? 0.18 : kind === 'hood' ? 0.8 : kind === 'shawl' || kind === 'lapel' ? 0.04 : 0.06;
  const profile = COLLAR_PROFILES[kind];
  const rows: Ring[] = profile.map(() => []);
  const vEdge = kind === 'shawl' || kind === 'lapel';
  for (let k = 0; k <= K; k++) {
    const a = gap + ((Math.PI * 2 - 2 * gap) * k) / K; // from front-left around the back to front-right
    const th = a; // torso angle convention: 0 = front, increasing toward +x
    const frontness = Math.max(0, Math.cos(th));
    let y = neckY - (kind === 'hood' ? 0.03 : 0) - (closed ? 0 : frontDepth * Math.pow(frontness, 1.6));
    let smp = sampleRing(t.torso, y, 'y');
    let best = 0;
    const nearest = () => {
      let bd = 9;
      smp.ang.forEach((ca, i) => { const d = Math.abs(Math.atan2(Math.sin(ca - th), Math.cos(ca - th))); if (d < bd) { bd = d; best = i; } });
    };
    nearest();
    if (vEdge) {
      // follow the garment's V: the height at this x is back - depth * (1 - |x| / halfW) on the front
      for (let it = 0; it < 4; it++) {
        const x = Math.abs((smp.pos[best] as Vec3)[0]);
        const front = (smp.pos[best] as Vec3)[2] > -0.012;
        y = neckY - (front ? frontDepth * Math.max(0, 1 - x / halfW) : 0);
        smp = sampleRing(t.torso, y, 'y');
        nearest();
      }
    }
    const i0 = best;
    const base = v3.madd(smp.pos[i0] as Vec3, smp.nrm[i0] as Vec3, thickness);
    const out: Vec3 = v3.norm([Math.sin(th), 0, Math.cos(th)]);
    const skin = smp.skin[i0] as Skin;
    // the hood hangs into a pouch on the back, the lapel lies a little further out toward the shoulders
    const back = Math.max(0, -Math.cos(th));
    const pouch = kind === 'hood' ? Math.pow(back, 1.4) : 0;
    profile.forEach(([up, outward, tip], r) => {
      const sag = pouch * (r === 0 ? 0 : 0.07 * (0.4 + 0.6 * Math.min(1, r / 3)));
      let p: Vec3 = [base[0] + out[0] * (outward as number), base[1] + (up as number) - sag, base[2] + out[2] * (outward as number)];
      if (pouch > 0) p = [p[0] + out[0] * pouch * 0.012 * r, p[1], p[2] + out[2] * pouch * 0.012 * r];
      if (kind === 'shirt' && (tip as number) > 0) {
        // collar points: longer toward the front
        const extra = 0.016 * Math.pow(frontness, 3);
        p = [p[0] + out[0] * extra * 0.4, p[1] - extra, p[2] + out[2] * extra * 0.4];
      }
      (rows[r] as Ring).push({ p, n: out, skin, u: th * 0.15, v: base[1] + (up as number) });
    });
  }
  emitRings(m, t, rows, panel, true, false);
}

// ---------------------------------------------------------------------------------------------
// Shoes
// ---------------------------------------------------------------------------------------------

function shoePiece(m: MeshData, t: BodyTemplate, b: B): number {
  const raw = t.raw;
  const names = raw.boneNames;
  const style = str(b, 'style', 'sneaker');
  const height = num(b, 'height', 0.08);
  const sole = num(b, 'sole', 0.02);
  // left foot vertices
  const fv: Vec3[] = [];
  for (let v = 0; v < raw.positions.length / 3; v++) {
    const nm = names[t.transfer.dominant[v] as number] as string;
    if (nm === 'foot_l' || nm === 'ball_l') fv.push([raw.positions[v * 3] as number, raw.positions[v * 3 + 1] as number, raw.positions[v * 3 + 2] as number]);
  }
  const zMin = Math.min(...fv.map((p) => p[2])), zMax = Math.max(...fv.map((p) => p[2]));
  const xc = fv.reduce((s, p) => s + p[0], 0) / fv.length;
  const N = 12;
  const path: Vec3[] = [];
  const rx: number[] = [], ry: number[] = [];
  const slab = (zMax - zMin) / N;
  const open = style === 'sandal';
  const pointed = num(b, 'pointed', 0);
  for (let k = 0; k <= N; k++) {
    // a pointed toe extends past the foot and narrows
    const z = lerp(zMin - 0.008, zMax + 0.01 + pointed * 0.03, k / N);
    const near = fv.filter((p) => Math.abs(p[2] - z) < slab * 1.2);
    const src = near.length >= 3 ? near : fv.filter((p) => Math.abs(p[2] - z) < slab * 3);
    const x0 = Math.min(...src.map((p) => p[0])), x1 = Math.max(...src.map((p) => p[0]));
    let top = Math.max(...src.map((p) => p[1])) + 0.008;
    const cap = style === 'boot' ? 0.13 : Math.min(height, 0.13);
    top = Math.min(top, cap);
    const u = k / N;
    const toeRound = Math.sin(Math.min(1, (1 - u) * 3.2) * Math.PI / 2);
    const heelRound = Math.sin(Math.min(1, u * 4.5) * Math.PI / 2);
    const w = ((x1 - x0) / 2 + 0.007) * (0.55 + 0.45 * Math.min(toeRound, heelRound)) * lerp(1, 0.5, pointed * smoothstep(0.55, 1, u));
    const bottom = -0.002;
    const hh = Math.max(0.012, (top - bottom) / 2) * (0.5 + 0.5 * Math.min(toeRound, heelRound * 1.2));
    path.push([lerp(xc, (x0 + x1) / 2, 0.7), bottom + hh, z]);
    rx.push(w);
    ry.push(open ? Math.min(hh, sole / 2 + 0.002) : hh);
    if (open) (path[k] as Vec3)[1] = sole / 2 - 0.001;
  }
  const footFilter = t.transfer.boneFilter((n) => /^(foot|ball|calf)_l$/.test(n));
  const start = m.positions.length / 3;
  sweep(m, { path, rx, ry, segments: 14, exponent: open ? 4 : 3.1, up: [0, 1, 0], capStart: 2, capEnd: 2 }, (v) => {
    const p = v.p;
    const skin = t.transfer.skinAt([p[0], Math.max(0.01, Math.min(p[1], 0.1)), p[2]], footFilter, 0.025);
    const soleM = p[1] < sole ? PANEL.sole : PANEL.shoe;
    return addVertex(m, p, skin, { aCloth: [p[0] * 1.0, p[2], p[1], soleM] }, morphsAt(t, p, skin), v.n);
  });
  // sole lip: push bottom vertices slightly outward
  for (let i = start; i < m.positions.length / 3; i++) {
    const y = m.positions[i * 3 + 1] as number;
    if (y < sole * 0.6) {
      const x = m.positions[i * 3] as number;
      m.positions[i * 3] = xc + (x - xc) * 1.06;
    }
  }
  if (style === 'sandal') {
    // a wide strap over the instep
    const z = lerp(zMin, zMax, 0.62);
    const near = fv.filter((p) => Math.abs(p[2] - z) < 0.02);
    const x0 = Math.min(...near.map((p) => p[0])) - 0.004, x1 = Math.max(...near.map((p) => p[0])) + 0.004;
    const top = Math.max(...near.map((p) => p[1])) + 0.006;
    const arc: Vec3[] = [];
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI * (k / 10);
      arc.push([(x0 + x1) / 2 - Math.cos(a) * (x1 - x0) / 2, sole * 0.6 + Math.sin(a) * (top - sole * 0.6), z]);
    }
    sweep(m, { path: arc, rx: arc.map(() => 0.024), ry: arc.map(() => 0.0035), segments: 6, exponent: 4, up: [0, 0, 1], closeStart: true, closeEnd: true }, (v) => {
      const skin = t.transfer.skinAt([v.p[0], Math.min(v.p[1], 0.08), v.p[2]], footFilter, 0.025);
      return addVertex(m, v.p, skin, { aCloth: [v.p[0], v.p[2], v.p[1], PANEL.shoe] }, morphsAt(t, v.p, skin), v.n);
    });
  }
  return start;
}

// ---------------------------------------------------------------------------------------------
// Garment assembly
// ---------------------------------------------------------------------------------------------

/**
 * Neckline description for a neck style. The back height is where the scanned torso narrows to the style's half width,
 * so the opening sits on the shoulder slope of whatever body the garment is fitted to (a fixed height cut across the
 * broad Meshy shoulders left the trapezius bare above a flat edge).
 */
function neckline(t: BodyTemplate, neck: string): { backY: number; depth: number; halfW: number; shape: number } {
  const at = (hw: number) => heightAtHalfWidth(t, hw);
  switch (neck) {
    case 'crew': return { backY: at(0.095), depth: 0.04, halfW: 0.095, shape: 0 };
    case 'collar': return { backY: at(0.088), depth: 0.03, halfW: 0.088, shape: 2 };
    case 'high': return { backY: at(0.078), depth: 0.02, halfW: 0.078, shape: 0 };
    case 'v': return { backY: at(0.105), depth: 0.12, halfW: 0.105, shape: 2 };
    case 'scoop': return { backY: at(0.15), depth: 0.115, halfW: 0.11, shape: 1 };
    case 'tank': return { backY: at(0.16), depth: 0.125, halfW: 0.1, shape: 1 };
    case 'square': return { backY: t.lm.chestY + 0.02, depth: 0.03, halfW: 0.085, shape: 3 };
    // roll neck: the opening is a plain ring where the torso has narrowed to the neck; the roll collar stands on it
    case 'turtle': return { backY: at(0.125), depth: 0, halfW: 0.125, shape: 0 };
    // deep V openings: the garment is open (or lapelled) down to the chest, whatever is worn beneath shows in the V
    case 'cardigan': return { backY: at(0.125), depth: 0.3, halfW: 0.13, shape: 2 };
    case 'lapel': return { backY: at(0.105), depth: 0.2, halfW: 0.12, shape: 2 };
    case 'shawl': return { backY: at(0.11), depth: 0.26, halfW: 0.125, shape: 2 };
    case 'wrap': return { backY: at(0.105), depth: 0.17, halfW: 0.11, shape: 2 };
    case 'vest': return { backY: at(0.1), depth: 0.2, halfW: 0.095, shape: 2 };
    case 'boat': return { backY: at(0.135), depth: 0.035, halfW: 0.125, shape: 1 };
    default: return { backY: at(0.09), depth: 0.03, halfW: 0.09, shape: 4 };
  }
}

/** Strap and armhole placement for sleeveless tops on this body: straps sit on the shoulder slope, not at a fixed |x|. */
function strapZone(t: BodyTemplate, strap: number): { inner: number; outer: number } {
  const sh = halfWidthAt(t, t.lm.shoulderY + 0.03);
  const inner = 0.42 * sh;
  return { inner, outer: inner + strap };
}

/** Builds the geometry, body coverage and shader cut parameters of one garment for a body template. */
export function buildGarment(t: BodyTemplate, def: GarmentDef): GarmentBuild {
  const b = def.build;
  const lm = t.lm;
  const m = newMesh();
  const shape = str(b, 'shape', 'shirt');
  const layerT = def.layer === 'outer' ? 0.019 : def.layer === 'top' ? 0.011 : def.layer === 'full' ? 0.0095 : 0.0075;
  const thickness = num(b, 'thickness', layerT);
  const cuts: CutParams = { neck: [0, 0, 0, 4], arm: [0, 0, 0, 0], misc: [0, 0, 0, 0], hem: [0, 0, 0, 0], inner: [0, 0, 0, 0] };
  const cover: Coverage = { ...NO_COVER };
  const armLen = lm.wristX + 0.01 - lm.armStartX;
  const yWaist = (w: number) => lm.crotchY + w * (lm.waistY - lm.crotchY);
  const yLeg = (l: number) => lm.crotchY + l * (lm.ankleY - 0.035 - lm.crotchY);

  const hemRim = Math.min(0.0048, thickness * 0.55);
  const shirtTop = (yHem: number, panelSleeve = true, noHem = false, bodyT = thickness) => {
    const neckName = str(b, 'neck', 'crew');
    const neck = neckline(t, neckName);
    const yTop = Math.min(Math.max(neck.backY, heightAtHalfWidth(t, 0.095)) + 0.03, (t.torso.s[t.torso.rows - 1] as number) - 0.01);
    const puff = num(b, 'puff', 0);
    torsoPiece(m, t, { yBottom: yHem, yTop, thickness: bodyT, drape: num(b, 'drape', 0.5), overBottoms: def.layer === 'top' || def.layer === 'outer', rim: hemRim && !noHem ? hemRim : 0, puff });
    cuts.neck = [neck.backY, neck.depth, neck.halfW, neck.shape];
    const sleeve = num(b, 'sleeve', 0);
    let xEnd = 0;
    if (sleeve > 0 && panelSleeve) {
      xEnd = lm.armStartX + 0.04 + sleeve * (armLen - 0.045);
      sleevePieces(m, t, xEnd, bodyT, num(b, 'sleeveLoose', 0.3), bool(b, 'cuffs'), PANEL.sleeve, hemRim, { balloon: num(b, 'balloon', 0), bell: num(b, 'bell', 0), puff });
    } else if (neckName === 'tank' || num(b, 'strap', 0) > 0 || sleeve === 0) {
      const z = strapZone(t, num(b, 'strap', 0.04));
      cuts.arm = [lm.chestY + 0.03, z.inner, z.outer, 1];
    }
    const collar = str(b, 'collar', neckName === 'collar' ? 'shirt' : neckName === 'high' ? 'stand' : neckName === 'turtle' ? 'roll' : neckName === 'shawl' ? 'shawl' : '');
    for (const kind of collar.split('+').filter(Boolean) as CollarKind[]) {
      collarPiece(m, t, kind, bodyT, neck.backY, neck.depth, neck.halfW);
    }
    if (bool(b, 'hood')) collarPiece(m, t, 'hood', bodyT, neck.backY, neck.depth);
    cuts.hem[0] = yHem;
    cuts.hem[1] = xEnd;
    cover.torso = { yMin: yHem, yMaxBack: neck.backY, yMaxFront: neck.backY - neck.depth };
    if (cuts.arm[3] > 0) cover.torso = { yMin: yHem, yMaxBack: Math.min(neck.backY, lm.chestY + 0.03), yMaxFront: Math.min(neck.backY - neck.depth, lm.chestY + 0.03) };
    cover.armMaxX = xEnd;
  };

  if (shape === 'shirt') {
    const yHem = lerp(lm.crotchY, lm.waistY, num(b, 'hem', 0.1));
    shirtTop(yHem);
  } else if (shape === 'pants') {
    const yTop = yWaist(num(b, 'waist', 0.85));
    const yHem = yLeg(num(b, 'leg', 1));
    torsoPiece(m, t, { yBottom: lm.crotchY, yTop, thickness, drape: num(b, 'drape', 0.2) });
    legPieces(m, t, yHem, thickness, num(b, 'legLoose', 0.4), bool(b, 'cuff'), PANEL.leg, hemRim, num(b, 'legFlare', 0));
    cuts.hem = [0, 0, yHem, yTop];
    // the skin is hidden a little below the waistband so the ragged edge of the scanned mesh stays under the cloth
    cover.torso = { yMin: lm.crotchY - 0.05, yMaxBack: yTop - 0.022, yMaxFront: yTop - 0.022 };
    cover.legMinY = yHem;
  } else if (shape === 'skirt') {
    const yTop = yWaist(num(b, 'waist', 0.95));
    const yHem = yLeg(num(b, 'length', 0.5));
    skirtPiece(m, t, yTop, yHem, num(b, 'flare', 0.5), thickness, PANEL.skirt, hemRim, { pleats: num(b, 'pleats', 0), taper: num(b, 'taper', 0) });
    cuts.hem = [0, 0, yHem, yTop];
    cover.torso = { yMin: lm.crotchY + 0.06, yMaxBack: yTop - 0.022, yMaxFront: yTop - 0.022 };
  } else if (shape === 'dress') {
    const yW = yWaist(num(b, 'waist', 1));
    const yHem = yLeg(num(b, 'length', 0.55));
    shirtTop(yW - 0.03, true, true);
    skirtPiece(m, t, yW, yHem, num(b, 'flare', 0.6), thickness + (def.layer === 'outer' ? 0.028 : 0.002), PANEL.skirt, hemRim, { pleats: num(b, 'pleats', 0), taper: num(b, 'taper', 0) });
    cuts.hem[0] = 0;
    cuts.hem[2] = yHem;
    cuts.hem[3] = yW;
    if (cover.torso) cover.torso.yMin = lm.crotchY + 0.06;
  } else if (shape === 'jumpsuit') {
    // one piece from the neck to the ankles: torso down to the crotch, sleeves, a collar, trouser legs
    const yHem = yLeg(num(b, 'leg', 1));
    shirtTop(lm.crotchY, true, true);
    legPieces(m, t, yHem, thickness, num(b, 'legLoose', 0.5), bool(b, 'cuff'), PANEL.leg, hemRim, num(b, 'legFlare', 0));
    cuts.hem[0] = 0;
    cuts.hem[2] = yHem;
    cuts.hem[3] = yWaist(num(b, 'waist', 1));
    if (cover.torso) cover.torso.yMin = lm.crotchY - 0.05;
    cover.legMinY = yHem;
  } else if (shape === 'suit') {
    // jacket (V opening with lapels) over a shirt and tie, with creased trousers; one garment, three panels
    const yHem = yLeg(num(b, 'leg', 1));
    const yTopP = yWaist(0.98);
    const jacketHem = lm.hipY - num(b, 'jacketDrop', 0.02);
    torsoPiece(m, t, { yBottom: lm.crotchY, yTop: yTopP + 0.02, thickness: thickness * 0.8, drape: 0.2 });
    legPieces(m, t, yHem, thickness * 0.8, num(b, 'legLoose', 0.5), false, PANEL.leg, hemRim * 0.8);
    // the shirt shows in the jacket's V: its own collar-height neck
    const shirtNeck = neckline(t, 'collar');
    const yTopIn = Math.min(shirtNeck.backY + 0.03, (t.torso.s[t.torso.rows - 1] as number) - 0.01);
    torsoPiece(m, t, { yBottom: yWaist(0.6), yTop: yTopIn, thickness: thickness * 1.05, drape: 0.3, panel: PANEL.inner });
    cuts.inner = [shirtNeck.backY, shirtNeck.depth, shirtNeck.halfW, 2];
    collarPiece(m, t, 'shirt', thickness * 1.05, shirtNeck.backY, shirtNeck.depth, shirtNeck.halfW, PANEL.innerCollar);
    shirtTop(jacketHem, true, false, thickness * 1.6);
    cuts.hem[2] = yHem;
    cuts.hem[3] = yTopP;
    // the cuts of the jacket's torso apply to its panel only; the trousers and the shirt carry their own
    if (cover.torso) cover.torso.yMin = lm.crotchY - 0.05;
    cover.legMinY = yHem;
  } else if (shape === 'overalls') {
    const yHem = yLeg(num(b, 'leg', 1));
    // inner tee (shirt colour)
    const sleeveEnd = lm.armStartX + 0.04 + num(b, 'sleeve', 0.3) * (armLen - 0.045);
    const crew = neckline(t, 'crew');
    const yTopO = Math.min(crew.backY + 0.03, (t.torso.s[t.torso.rows - 1] as number) - 0.01);
    const zO = strapZone(t, 0.034);
    torsoPiece(m, t, { yBottom: yWaist(0.7), yTop: yTopO, thickness: thickness * 0.8, drape: 0.3, panel: PANEL.inner, rim: hemRim * 0.8 });
    sleevePieces(m, t, sleeveEnd, thickness * 0.8, 0.5, false, PANEL.innerSleeve, hemRim * 0.8);
    // denim: pants plus bib/strap shell (masked in the shader)
    torsoPiece(m, t, { yBottom: lm.crotchY, yTop: yTopO, thickness: thickness * 1.5, drape: 0.3, panel: PANEL.bib });
    legPieces(m, t, yHem, thickness * 1.5, num(b, 'legLoose', 0.5), false, PANEL.leg, hemRim);
    cuts.neck = [crew.backY, crew.depth, crew.halfW, 0];
    cuts.arm = [0, zO.inner, zO.outer, 0];
    cuts.misc = [0, lm.chestY - 0.02, 0.085, 1];
    cuts.hem = [yWaist(0.7), sleeveEnd, yHem, yWaist(0.95)];
    cover.torso = { yMin: lm.crotchY - 0.05, yMaxBack: crew.backY, yMaxFront: crew.backY - crew.depth };
    cover.armMaxX = sleeveEnd;
    cover.legMinY = yHem;
  } else if (shape === 'swimsuit') {
    // swimsuit; with `leg` and `sleeve` also the sports one-piece (unitard)
    const neck = neckline(t, str(b, 'neck', 'scoop'));
    const sleeve = num(b, 'sleeve', 0);
    const leg = num(b, 'leg', 0);
    torsoPiece(m, t, { yBottom: lm.crotchY, yTop: Math.min(neckline(t, 'crew').backY + 0.02, (t.torso.s[t.torso.rows - 1] as number) - 0.01), thickness: 0.004, drape: 0, step: 0.013 });
    const yHem = leg > 0 ? yLeg(leg) : lm.crotchY - 0.03;
    legPieces(m, t, yHem, 0.004, 0, false, PANEL.leg, 0);
    cuts.neck = [neck.backY, neck.depth, neck.halfW, neck.shape];
    let xEnd = 0;
    if (sleeve > 0) {
      xEnd = lm.armStartX + 0.04 + sleeve * (armLen - 0.045);
      sleevePieces(m, t, xEnd, 0.004, 0, false, PANEL.sleeve, 0);
    } else {
      const z = strapZone(t, num(b, 'strap', 0.04));
      cuts.arm = [lm.chestY + 0.03, z.inner, z.outer, 1];
    }
    cuts.misc = [num(b, 'legCut', leg > 0 ? 0 : 0.085), 0, 0, 0];
    cuts.hem = [0, xEnd, yHem, 0];
    cover.torso = { yMin: lm.crotchY + 0.06, yMaxBack: sleeve > 0 ? neck.backY : lm.chestY, yMaxFront: sleeve > 0 ? neck.backY - neck.depth : lm.chestY - 0.04 };
    cover.armMaxX = xEnd;
    if (leg > 0) { cover.torso.yMin = lm.crotchY - 0.05; cover.legMinY = yHem; }
  } else if (shape === 'shoe') {
    const left = newMesh();
    shoePiece(left, t, b);
    const style = str(b, 'style', 'sneaker');
    cuts.hem[0] = num(b, 'sole', 0.02);
    if (style === 'boot') {
      const top = num(b, 'height', 0.2);
      const ss = stations(top, lm.ankleY - 0.03, 0.02);
      const ease = num(b, 'shaft', 0.003);
      const rings = shellRings(t, t.legL, 'leg', ss, { thickness: 0.009, uScale: 0.08, ease: () => ease });
      emitRings(left, t, rings.reverse(), PANEL.shoe, false);
    }
    merge(m, left);
    merge(m, mirrored(t, left));
    cover.footMaxY = style === 'sandal' ? 0 : Math.min(0.09, num(b, 'height', 0.08));
    if (style === 'boot') cover.legMinY = 10;
  }
  computeSmoothNormals(m, 1e-5);
  return { mesh: m, coverage: cover, cuts };
}

/** Merges coverages of several garments (union of torso ranges when they overlap). */
export function mergeCoverage(list: Coverage[]): Coverage {
  const out: Coverage = { torso: null, armMaxX: 0, legMinY: 10, footMaxY: 0 };
  const ranges = list.map((c) => c.torso).filter((x): x is NonNullable<Coverage['torso']> => !!x).sort((a, b) => a.yMin - b.yMin);
  for (const r of ranges) {
    if (!out.torso) { out.torso = { ...r }; continue; }
    if (r.yMin <= out.torso.yMaxFront + 0.02) {
      out.torso.yMaxBack = Math.max(out.torso.yMaxBack, r.yMaxBack);
      out.torso.yMaxFront = Math.max(out.torso.yMaxFront, r.yMaxFront);
    } else if (r.yMaxBack - r.yMin > out.torso.yMaxBack - out.torso.yMin) out.torso = { ...r };
  }
  for (const c of list) {
    out.armMaxX = Math.max(out.armMaxX, c.armMaxX);
    out.legMinY = Math.min(out.legMinY, c.legMinY);
    out.footMaxY = Math.max(out.footMaxY, c.footMaxY);
  }
  return out;
}

