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
export const PANEL = { torso: 0, sleeve: 1, leg: 2, skirt: 3, collar: 4, sole: 5, shoe: 6, inner: 7, bib: 8 } as const;

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

interface TorsoOpts { yBottom: number; yTop: number; thickness: number; drape: number; hullFrom?: number; panel?: number; overBottoms?: boolean }

/** Torso shell between two heights (rings ascending). Returns rings for further use. */
function torsoPiece(m: MeshData, t: BodyTemplate, o: TorsoOpts): void {
  const lm = t.lm;
  const yc = lm.crotchY;
  const ss = stations(o.yTop, Math.max(o.yBottom, yc), 0.024); // descending, for the drape envelope
  const hullFrom = o.hullFrom ?? yc + t.junctionSpan;
  const slope = lerp(0.7, 0.04, clamp(o.drape, 0, 1));
  const tuckOut = o.overBottoms ? (s: number) => 0.012 + 0.012 * smoothstep(lm.waistY, lm.crotchY + 0.03, s) : undefined;
  const rings = shellRings(t, t.torso, 'torso', ss, {
    thickness: o.thickness, uScale: 0.15, ease: tuckOut ? (s) => (s < lm.waistY + 0.02 ? tuckOut(s) * smoothstep(lm.waistY + 0.02, lm.waistY - 0.04, s) : 0) : undefined,
    hull: (s) => smoothstep(hullFrom, hullFrom + 0.04, s) * 0.95,
    drapeFrom: lm.chestY - 0.02, slope,
  });
  rings.reverse();
  emitRings(m, t, rings, o.panel ?? PANEL.torso, false);
}

/** Left leg shell from the crotch junction down to yHem (or a short gusset), mirrored for the right leg. */
function legPieces(m: MeshData, t: BodyTemplate, yHem: number, thickness: number, loose: number, cuff: boolean, panel: number = PANEL.leg): void {
  const lm = t.lm;
  const ss = stations(lm.crotchY, yHem, 0.028);
  const kneeY = lm.kneeY;
  const rings = shellRings(t, t.legL, 'leg', ss, {
    thickness, uScale: 0.08,
    ease: (s) => loose * 0.012 * smoothstep(lm.crotchY - 0.02, lm.crotchY - 0.1, s) * (cuff ? 1 - smoothstep(yHem + 0.09, yHem + 0.02, s) : 1),
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
  emitRings(left, t, rings, panel, true);
  merge(m, left);
  merge(m, mirrored(t, left));
}

/** Left sleeve from inside the shoulder to |x| = xEnd, mirrored. */
function sleevePieces(m: MeshData, t: BodyTemplate, xEnd: number, thickness: number, loose: number, cuffs: boolean, panel: number = PANEL.sleeve): void {
  const lm = t.lm;
  const x0 = lm.armStartX + 0.02;
  const ss = stations(x0, xEnd, 0.024);
  const ramp = (s: number) => smoothstep(x0, x0 + 0.09, s);
  const rings = shellRings(t, t.armL, 'arm', ss, {
    thickness: thickness * 0.7, uScale: 0.05,
    ease: (s) => ramp(s) * (thickness * 0.3 + 0.003 + loose * 0.01 * (1 - smoothstep(xEnd - 0.06, xEnd, s) * (cuffs ? 1 : 0))),
    drapeFrom: x0 + 0.09,
    slope: lerp(0.5, 0.0, clamp(loose, 0, 1)),
  });
  const left = newMesh();
  emitRings(left, t, rings, panel, false);
  merge(m, left);
  merge(m, mirrored(t, left));
}

/** Skirt cone from yTop (waist) down to yHem; blended pelvis/thigh skinning. */
function skirtPiece(m: MeshData, t: BodyTemplate, yTop: number, yHem: number, flare: number, thickness: number, panel: number = PANEL.skirt): void {
  const lm = t.lm;
  const raw = t.raw;
  const cols = 48;
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
    for (let y = Math.max(lm.crotchY + 0.03, yHem); y <= Math.min(yTop, hipTop + 0.06); y += 0.01) r = Math.max(r, surfaceR(y, a));
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
      r += flare * 0.16 * Math.pow(below, 1.6) * (0.8 + 0.2 * Math.abs(Math.cos(a)));
      r = Math.max(r, legClear(y, a, c) + 0.025);
      r *= 1 + 0.025 * below * Math.sin(a * 9 + 0.6); // soft folds
      const p: Vec3 = [c[0] + Math.sin(a) * r, y, c[1] + Math.cos(a) * r];
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
  emitRings(m, t, rings, panel, false);
}

/** Collar band around the neckline (shirt collar or stand collar). */
function collarPiece(m: MeshData, t: BodyTemplate, kind: 'shirt' | 'stand', thickness: number, neckY: number, frontDepth: number): void {
  const K = 28;
  const gap = kind === 'shirt' ? 0.18 : 0.06; // opening angle at the front
  const rows: Ring[] = [];
  const profile = kind === 'shirt'
    ? [[-0.004, -0.002, 0], [0.016, -0.003, 0], [0.021, 0.0015, 0], [0.004, 0.009, 1]]
    : [[-0.004, -0.002, 0], [0.014, -0.004, 0], [0.024, -0.005, 0], [0.027, -0.001, 1]];
  for (let r = 0; r < profile.length; r++) rows.push([]);
  for (let k = 0; k <= K; k++) {
    const a = gap + ((Math.PI * 2 - 2 * gap) * k) / K; // from front-left around the back to front-right
    const th = a; // torso angle convention: 0 = front, increasing toward +x
    const frontness = Math.max(0, Math.cos(th));
    const y = neckY - frontDepth * Math.pow(frontness, 1.6);
    const smp = sampleRing(t.torso, y, 'y');
    // nearest column by angle
    let best = 0, bd = 9;
    smp.ang.forEach((ca, i) => { const d = Math.abs(Math.atan2(Math.sin(ca - th), Math.cos(ca - th))); if (d < bd) { bd = d; best = i; } });
    const i0 = best;
    const base = v3.madd(smp.pos[i0] as Vec3, smp.nrm[i0] as Vec3, thickness);
    const out: Vec3 = v3.norm([Math.sin(th), 0, Math.cos(th)]);
    const skin = smp.skin[i0] as Skin;
    profile.forEach(([up, outward, tip], r) => {
      let p: Vec3 = [base[0] + out[0] * (outward as number), base[1] + (up as number), base[2] + out[2] * (outward as number)];
      if (kind === 'shirt' && (tip as number) > 0) {
        // collar points: longer toward the front
        const extra = 0.016 * Math.pow(frontness, 3);
        p = [p[0] + out[0] * extra * 0.4, p[1] - extra, p[2] + out[2] * extra * 0.4];
      }
      (rows[r] as Ring).push({ p, n: out, skin, u: th * 0.15, v: base[1] + (up as number) });
    });
  }
  emitRings(m, t, rows, PANEL.collar, true, false);
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
  const N = 16;
  const path: Vec3[] = [];
  const rx: number[] = [], ry: number[] = [];
  const slab = (zMax - zMin) / N;
  const open = style === 'sandal';
  for (let k = 0; k <= N; k++) {
    const z = lerp(zMin - 0.008, zMax + 0.01, k / N);
    const near = fv.filter((p) => Math.abs(p[2] - z) < slab * 1.2);
    const src = near.length >= 3 ? near : fv.filter((p) => Math.abs(p[2] - z) < slab * 3);
    const x0 = Math.min(...src.map((p) => p[0])), x1 = Math.max(...src.map((p) => p[0]));
    let top = Math.max(...src.map((p) => p[1])) + 0.008;
    const cap = style === 'boot' ? 0.13 : Math.min(height, 0.13);
    top = Math.min(top, cap);
    const u = k / N;
    const toeRound = Math.sin(Math.min(1, (1 - u) * 3.2) * Math.PI / 2);
    const heelRound = Math.sin(Math.min(1, u * 4.5) * Math.PI / 2);
    const w = ((x1 - x0) / 2 + 0.007) * (0.55 + 0.45 * Math.min(toeRound, heelRound));
    const bottom = -0.002;
    const hh = Math.max(0.012, (top - bottom) / 2) * (0.5 + 0.5 * Math.min(toeRound, heelRound * 1.2));
    path.push([lerp(xc, (x0 + x1) / 2, 0.7), bottom + hh, z]);
    rx.push(w);
    ry.push(open ? Math.min(hh, sole / 2 + 0.002) : hh);
    if (open) (path[k] as Vec3)[1] = sole / 2 - 0.001;
  }
  const footFilter = t.transfer.boneFilter((n) => /^(foot|ball|calf)_l$/.test(n));
  const start = m.positions.length / 3;
  sweep(m, { path, rx, ry, segments: 18, exponent: open ? 4 : 3.1, up: [0, 1, 0], capStart: 2, capEnd: 3 }, (v) => {
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

/** Neckline description for a neck style. */
function neckline(t: BodyTemplate, neck: string): { backY: number; depth: number; halfW: number; shape: number } {
  const nb = t.lm.neckBaseY;
  switch (neck) {
    case 'crew': return { backY: nb + 0.004, depth: 0.04, halfW: 0.07, shape: 0 };
    case 'collar': return { backY: nb + 0.012, depth: 0.03, halfW: 0.06, shape: 2 };
    case 'high': return { backY: nb + 0.015, depth: 0.02, halfW: 0.06, shape: 0 };
    case 'v': return { backY: nb + 0.0, depth: 0.12, halfW: 0.075, shape: 2 };
    case 'scoop': return { backY: nb - 0.035, depth: 0.12, halfW: 0.1, shape: 1 };
    case 'tank': return { backY: nb - 0.06, depth: 0.13, halfW: 0.075, shape: 1 };
    case 'square': return { backY: t.lm.chestY + 0.02, depth: 0.03, halfW: 0.085, shape: 3 };
    default: return { backY: nb + 0.01, depth: 0.03, halfW: 0.07, shape: 4 };
  }
}

/** Builds the geometry, body coverage and shader cut parameters of one garment for a body template. */
export function buildGarment(t: BodyTemplate, def: GarmentDef): GarmentBuild {
  const b = def.build;
  const lm = t.lm;
  const m = newMesh();
  const shape = str(b, 'shape', 'shirt');
  const layerT = def.layer === 'outer' ? 0.019 : def.layer === 'top' ? 0.011 : def.layer === 'full' ? 0.0095 : 0.0075;
  const thickness = num(b, 'thickness', layerT);
  const cuts: CutParams = { neck: [0, 0, 0, 4], arm: [0, 0, 0, 0], misc: [0, 0, 0, 0], hem: [0, 0, 0, 0] };
  const cover: Coverage = { ...NO_COVER };
  const armLen = lm.wristX + 0.01 - lm.armStartX;
  const yWaist = (w: number) => lm.crotchY + w * (lm.waistY - lm.crotchY);
  const yLeg = (l: number) => lm.crotchY + l * (lm.ankleY - 0.035 - lm.crotchY);

  const shirtTop = (yHem: number, panelSleeve = true) => {
    const neck = neckline(t, str(b, 'neck', 'crew'));
    const yTop = Math.min(lm.neckBaseY + 0.045, (t.torso.s[t.torso.rows - 1] as number) - 0.01);
    torsoPiece(m, t, { yBottom: yHem, yTop, thickness, drape: num(b, 'drape', 0.5), overBottoms: def.layer === 'top' || def.layer === 'outer' });
    cuts.neck = [neck.backY, neck.depth, neck.halfW, neck.shape];
    const sleeve = num(b, 'sleeve', 0);
    let xEnd = 0;
    if (sleeve > 0 && panelSleeve) {
      xEnd = lm.armStartX + 0.04 + sleeve * (armLen - 0.045);
      sleevePieces(m, t, xEnd, thickness, num(b, 'sleeveLoose', 0.3), bool(b, 'cuffs'));
    } else if (str(b, 'neck', '') === 'tank' || num(b, 'strap', 0) > 0 || sleeve === 0) {
      const strap = num(b, 'strap', 0.04);
      cuts.arm = [lm.chestY + 0.03, 0.072, 0.072 + strap, 1];
    }
    if (str(b, 'neck', '') === 'collar') collarPiece(m, t, 'shirt', thickness, neck.backY, neck.depth);
    if (str(b, 'neck', '') === 'high') collarPiece(m, t, 'stand', thickness, neck.backY, neck.depth);
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
    torsoPiece(m, t, { yBottom: lm.crotchY, yTop, thickness, drape: 0.2 });
    legPieces(m, t, yHem, thickness, num(b, 'legLoose', 0.4), bool(b, 'cuff'));
    cuts.hem = [0, 0, yHem, yTop];
    cover.torso = { yMin: lm.crotchY - 0.05, yMaxBack: yTop, yMaxFront: yTop };
    cover.legMinY = yHem;
  } else if (shape === 'skirt') {
    const yTop = yWaist(num(b, 'waist', 0.95));
    const yHem = yLeg(num(b, 'length', 0.5));
    skirtPiece(m, t, yTop, yHem, num(b, 'flare', 0.5), thickness);
    cuts.hem = [0, 0, yHem, yTop];
    cover.torso = { yMin: lm.crotchY + 0.06, yMaxBack: yTop, yMaxFront: yTop };
  } else if (shape === 'dress') {
    const yW = yWaist(num(b, 'waist', 1));
    const yHem = yLeg(num(b, 'length', 0.55));
    shirtTop(yW - 0.03);
    skirtPiece(m, t, yW, yHem, num(b, 'flare', 0.6), thickness + 0.002);
    cuts.hem[0] = 0;
    cuts.hem[2] = yHem;
    cuts.hem[3] = yW;
    if (cover.torso) cover.torso.yMin = lm.crotchY + 0.06;
  } else if (shape === 'overalls') {
    const yHem = yLeg(num(b, 'leg', 1));
    // inner tee (shirt colour)
    const sleeveEnd = lm.armStartX + 0.04 + num(b, 'sleeve', 0.3) * (armLen - 0.045);
    torsoPiece(m, t, { yBottom: yWaist(0.7), yTop: lm.neckBaseY + 0.04, thickness: thickness * 0.8, drape: 0.3, panel: PANEL.inner });
    sleevePieces(m, t, sleeveEnd, thickness * 0.8, 0.5, false, PANEL.inner);
    // denim: pants plus bib/strap shell (masked in the shader)
    torsoPiece(m, t, { yBottom: lm.crotchY, yTop: lm.neckBaseY + 0.03, thickness: thickness * 1.5, drape: 0.3, panel: PANEL.bib });
    legPieces(m, t, yHem, thickness * 1.5, num(b, 'legLoose', 0.5), false);
    cuts.neck = [lm.neckBaseY + 0.004, 0.04, 0.07, 0];
    cuts.misc = [0, lm.chestY - 0.02, 0.085, 1];
    cuts.hem = [yWaist(0.7), sleeveEnd, yHem, yWaist(0.95)];
    cover.torso = { yMin: lm.crotchY - 0.05, yMaxBack: lm.neckBaseY, yMaxFront: lm.neckBaseY - 0.04 };
    cover.armMaxX = sleeveEnd;
    cover.legMinY = yHem;
  } else if (shape === 'swimsuit') {
    const neck = neckline(t, str(b, 'neck', 'scoop'));
    torsoPiece(m, t, { yBottom: lm.crotchY, yTop: lm.neckBaseY + 0.03, thickness: 0.004, drape: 0 });
    legPieces(m, t, lm.crotchY - 0.03, 0.004, 0, false);
    cuts.neck = [neck.backY, neck.depth, neck.halfW, neck.shape];
    cuts.arm = [lm.chestY + 0.03, 0.06, 0.06 + num(b, 'strap', 0.04), 1];
    cuts.misc = [0.085, 0, 0, 0];
    cover.torso = { yMin: lm.crotchY + 0.04, yMaxBack: lm.chestY, yMaxFront: lm.chestY - 0.04 };
  } else if (shape === 'shoe') {
    const left = newMesh();
    shoePiece(left, t, b);
    const style = str(b, 'style', 'sneaker');
    if (style === 'boot') {
      const top = num(b, 'height', 0.2);
      const ss = stations(top, lm.ankleY - 0.03, 0.02);
      const rings = shellRings(t, t.legL, 'leg', ss, { thickness: 0.009, uScale: 0.08, ease: () => 0.003 });
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

