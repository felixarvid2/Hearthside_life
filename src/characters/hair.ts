// Procedural hair and facial hair, attached to the Head bone (long parts blend into the neck and upper
// spine so they follow the torso). Every style starts from a thin scalp cap sampled from the sculpted head
// surface above a style-specific hairline, dressed with layers of tapered strand cards ("locks": overlapping
// clumps whose tips the shader cuts into pointed strands): crown and hairline tiers, bangs, a two-layer drape
// for bob / waves / long hair (routed behind the shoulders), a bundle of locks for the ponytail, wound gores for
// the bun, spiral coils for curls and afro, plaited beads for braids. Facial hair is a shell over masked regions
// of the same head surface, so it receives the jaw/chin morphs. One mesh, one draw call, at most ~3k triangles
// per style. Pure module.

import type { FacialHairDef, HairDef } from '../content/types';
import { BODY_PARAM_IDS, bodyDeltas } from './bodyShape';
import { sampleProfile } from './fit';
import { HEAD_OFFSET, HEAD_SCALE, HEAD_SCULPT_IDS, H_MAX, H_MIN, headDeltas, headNormal, headPoint, headToBind } from './headShape';
import type { MeshData, SweepVertex } from './meshData';
import { addTri, addVertex, computeSmoothNormals, emptyMesh, fan, stitchRings, sweep, v3 } from './meshData';
import type { Skin, Vec3 } from './rig';
import { blendSkins, boneIndex, clamp, gauss, lerp, rigidSkin, smoothstep } from './rig';
import type { BodyTemplate } from './template';

/**
 * aHair = (u across strands m, v along strands m, root-to-tip 0..1, piece id); aFlow = strand direction (bind);
 * aLock = (clump seed, baked light 0..1, edge fade 0..1, tooth length as a fraction of the card).
 */
export const HAIR_ATTRS = { aHair: 4, aFlow: 3, aLock: 4 };
export const HAIR_MORPHS: readonly string[] = [...BODY_PARAM_IDS, ...HEAD_SCULPT_IDS, 'hairClear'];
/** Extra distance (m) the 'hairClear' morph moves hanging hair away from the back at influence 1 (bulky tops). */
export const HAIR_CLEAR = 0.03;
/** Piece ids: 0 cap, 1 curl/coil, 2 drape, 3 tail/braid, 4 bun, 5 tie, 6 facial hair, 7 scalp lock. */
export const HAIR_PIECE = { cap: 0, curl: 1, curtain: 2, tail: 3, bun: 4, tie: 5, facial: 6, lock: 7 } as const;
/** Strand texture ids for the hair shader. */
export const STRAND_IDS: Record<string, number> = { straight: 0, wavy: 1, curly: 2, coily: 3, braided: 4, stubble: 5 };

type B = Record<string, number | string | boolean>;
const num = (b: B, k: string, d: number) => (typeof b[k] === 'number' ? (b[k] as number) : d);
const str = (b: B, k: string, d: string) => (typeof b[k] === 'string' ? (b[k] as string) : d);

/** Natural hairline height (head-local y) by angle (0 = front centre). */
export function hairlineY(theta: number, kind: string, fringe: number): number {
  const a = Math.abs(Math.atan2(Math.sin(theta), Math.cos(theta)));
  const deg = (a * 180) / Math.PI;
  const keys: Array<[number, number]> = [[0, 0.152], [35, 0.149], [58, 0.137], [70, 0.11], [78, 0.074], [86, 0.072], [92, 0.116], [114, 0.114], [128, 0.06], [150, 0.012], [180, -0.004]];
  let y = keys[keys.length - 1]![1];
  for (let i = 0; i + 1 < keys.length; i++) {
    const [d0, y0] = keys[i]!, [d1, y1] = keys[i + 1]!;
    if (deg >= d0 && deg <= d1) { const t = (deg - d0) / (d1 - d0); y = y0 + (y1 - y0) * (t * t * (3 - 2 * t)); break; }
  }
  if (kind === 'high') y += 0.01 * smoothstep(70, 0, deg);
  if (kind === 'fringe') y -= fringe * 0.042 * smoothstep(62, 30, deg);
  return y;
}

export interface Ctx { t: BodyTemplate; m: MeshData; head: number; neck: number; spine3: number; spine2: number; O: Vec3; rnd: () => number }

export function headSkinFor(c: Ctx, yBind: number, yLocal: number): Skin {
  // Head above the jaw; neck below; upper spine below the shoulders
  const fNeck = smoothstep(0.0, -0.07, yLocal);
  const fSpine = smoothstep(c.t.lm.neckBaseY + 0.01, c.t.lm.neckBaseY - 0.09, yBind);
  const fSpine2 = smoothstep(c.t.lm.chestY - 0.02, c.t.lm.chestY - 0.12, yBind);
  if (fNeck <= 0.001) return rigidSkin(c.head);
  return blendSkins([
    { skin: rigidSkin(c.head), f: 1 - fNeck },
    { skin: rigidSkin(c.neck), f: fNeck * (1 - fSpine) },
    { skin: rigidSkin(c.spine3), f: fNeck * fSpine * (1 - fSpine2) },
    { skin: rigidSkin(c.spine2), f: fNeck * fSpine * fSpine2 },
  ]);
}

export function hairMorphs(c: Ctx, p: Vec3, skin: Skin, headLocal: Vec3 | null, theta: number): Record<string, Vec3> {
  const out = bodyDeltas(c.t.ctx, p, skin) as unknown as Record<string, Vec3>;
  const hang = smoothstep(c.t.lm.neckBaseY + 0.03, c.t.lm.neckBaseY - 0.05, p[1]);
  if (hang > 0) out.hairClear = [Math.sign(p[0]) * HAIR_CLEAR * 0.2 * hang, 0, -HAIR_CLEAR * hang];
  if (headLocal) {
    const hd = headDeltas(headLocal, theta) as unknown as Record<string, Vec3>;
    for (const [k, d] of Object.entries(hd)) out[k] = v3.scale(d, HEAD_SCALE);
  }
  return out;
}

/** Build context of a hair mesh on `t` (used by modules that place their own geometry on the head, see aiHair.ts). */
export function hairContext(t: BodyTemplate, m: MeshData): Ctx {
  const raw = t.raw;
  return { t, m, head: boneIndex(raw, 'Head'), neck: boneIndex(raw, 'neck_01'), spine3: boneIndex(raw, 'spine_03'), spine2: boneIndex(raw, 'spine_02'), O: t.headOrigin, rnd: rng(1) };
}

const LOCK_PLAIN: [number, number, number, number] = [0.5, 1, 1, 0];

function emit(c: Ctx, local: Vec3, aHair: [number, number, number, number], flowLocal: Vec3, opts: { skinLocalY?: number; base?: Vec3 | null; theta?: number; bind?: Vec3; lock?: [number, number, number, number] } = {}): number {
  const p = opts.bind ?? headToBind(c.O, local);
  const skin = headSkinFor(c, p[1], opts.skinLocalY ?? local[1]);
  const base = opts.base === undefined ? null : opts.base;
  return addVertex(c.m, p, skin, { aHair, aFlow: v3.norm(flowLocal), aLock: opts.lock ?? LOCK_PLAIN }, hairMorphs(c, p, skin, base, opts.theta ?? 0));
}

/** Small deterministic generator (mulberry32) so a style always builds the same strands. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Back surface z (bind) of the torso at height y, for routing hair behind the shoulders. */
function backZ(t: BodyTemplate, y: number): number {
  const q = sampleProfile(t.profiles.torso, Math.min(y, t.lm.neckBaseY + 0.02), Math.PI);
  return q.cb - q.r;
}

// ---------------------------------------------------------------------------------------------
// Locks: tapered strand cards. A card is a three-vertex-wide ribbon (left edge, raised middle, right edge) along a
// path; the shader cuts its tip into pointed strands (alpha test), so the hair is built from layered, overlapping
// clumps with ragged ends instead of one shell. Per-vertex data baked here: aHair.xy = strand coordinates, z = root to
// tip, w = piece; aLock = (clump seed, light 0..1 baked ambient occlusion, edge fade 0..1, tooth length as a fraction
// of the card).
// ---------------------------------------------------------------------------------------------

interface Pt { p: Vec3; n: Vec3; w: number; base?: Vec3 | null; theta?: number }
interface CardOpts { piece: number; seed: number; depth: number; root?: number; tooth: number; bow?: number; fade?: number; /** Root-to-tip fraction over which the root dissolves into the layer below. */ rootFade?: number }

/** Card half width along its length: narrow at the root, full at a fifth, tapering toward the tip (`tipW` of the full width). */
function lockWidth(s: number, w: number, tipW = 0.12): number {
  return w * lerp(0.55, 1, smoothstep(0, 0.22, s)) * lerp(1, tipW, smoothstep(0.35, 1, s));
}

function card(c: Ctx, pts: Pt[], o: CardOpts): void {
  const n = pts.length;
  if (n < 2) return;
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) cum.push((cum[i - 1] as number) + v3.len(v3.sub((pts[i] as Pt).p, (pts[i - 1] as Pt).p)));
  const total = (cum[n - 1] as number) || 1e-6;
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const pt = pts[i] as Pt;
    const t = v3.norm(v3.sub((pts[Math.min(n - 1, i + 1)] as Pt).p, (pts[Math.max(0, i - 1)] as Pt).p));
    let side = v3.cross(pt.n, t);
    if (v3.len(side) < 1e-5) side = v3.cross([0, 1, 0], t);
    side = v3.norm(side);
    const nn = v3.norm(v3.cross(t, side));
    const s = (cum[i] as number) / total;
    const light = o.depth * lerp(o.root ?? 0.6, 1, smoothstep(0, 0.45, s));
    const row: number[] = [];
    for (let k = -1; k <= 1; k++) {
      let p = v3.madd(pt.p, side, k * pt.w);
      if (k === 0) p = v3.madd(p, nn, (o.bow ?? 0.3) * pt.w);
      row.push(emit(c, [0, 0, 0], [k * pt.w + o.seed * 11.7, (cum[i] as number) + o.seed * 5.3, s, o.piece], t, { bind: p, base: pt.base ?? null, theta: pt.theta ?? 0, lock: [o.seed, light, Math.min(o.fade ?? 1, o.rootFade ? smoothstep(0, o.rootFade, s) : 1), o.tooth], skinLocalY: (p[1] - c.O[1] - HEAD_OFFSET[1]) / HEAD_SCALE }));
    }
    rows.push(row);
  }
  for (let i = 0; i + 1 < n; i++) {
    const a = rows[i] as number[], b = rows[i + 1] as number[];
    addTri(c.m, a[0] as number, b[0] as number, a[1] as number); addTri(c.m, a[1] as number, b[0] as number, b[1] as number);
    addTri(c.m, a[1] as number, b[1] as number, a[2] as number); addTri(c.m, a[2] as number, b[1] as number, b[2] as number);
  }
}

// ---------------------------------------------------------------------------------------------
// Scalp cap
// ---------------------------------------------------------------------------------------------

interface CapOpts { cols?: number; cap: number; top: number; hairline: string; fringe: number; part: string; sweepSide: number; volume: number; roundness: number; rows: number; flowTo: Vec3 | null }

function capThickness(o: CapOpts, theta: number, y: number, edge: number, rel: number): number {
  const up = smoothstep(0.09, 0.2, y);
  const frontEdge = 1 - 0.55 * smoothstep(0.3, 0.9, Math.cos(theta)) * (1 - smoothstep(0.15, 0.2, y));
  let th = lerp(o.cap, o.top, up) + (o.roundness > 0 ? 0 : o.volume) * (0.75 + 0.25 * up) * frontEdge;
  // part groove
  if (o.part !== 'none') {
    const px = o.part === 'left' ? 0.032 : o.part === 'right' ? -0.032 : 0;
    const x = Math.sin(theta);
    th *= 1 - 0.55 * gauss(x * 0.08 - px, 0.006) * smoothstep(0.12, 0.17, y) * smoothstep(-0.6, 0.2, Math.cos(theta));
  }
  // soft taper onto the skin at the hairline
  const ramp = 0.014 + 0.024 * smoothstep(0.4, 0.95, Math.cos(theta));
  th *= lerp(0.15, 1, smoothstep(0, 1, rel)) * (0.08 + 0.92 * smoothstep(0, ramp, edge));
  return Math.max(0.0015, th);
}

const AFRO_CENTER: Vec3 = [0, 0.105, -0.014];
/** Radius (head-local m) of the afro's smooth shell; the coils on it add about 2 cm. */
const afroRadius = (volume: number, dir: Vec3) => (0.088 + volume) * (1 - 0.34 * smoothstep(0.2, 0.9, dir[2] / (Math.hypot(dir[0], dir[2]) || 1)) * smoothstep(-0.3, 0.2, dir[1]) * smoothstep(0.8, 0.35, dir[1]) - 0.08 * smoothstep(0.3, -0.5, dir[1]));

function buildCap(c: Ctx, o: CapOpts): void {
  const cols = o.cols ?? 36;
  const rows = o.rows;
  const starts: number[] = [];
  const thetas: number[] = [];
  for (let i = 0; i < cols; i++) thetas.push(-Math.PI + (Math.PI * 2 * i) / cols);
  for (let r = 0; r < rows; r++) {
    const rel = r / rows;
    thetas.forEach((th, i) => {
      const yl = hairlineY(th, o.hairline, o.fringe);
      const h = lerp(yl, H_MAX, Math.pow(rel, 0.85));
      const base = headPoint(th, h);
      const n = headNormal(th, h);
      const edge = base[1] - yl;
      let thick = capThickness(o, th, base[1], edge, rel * 3);
      // fringe floats in front of the forehead
      const frontF = smoothstep(55, 20, Math.abs((th * 180) / Math.PI));
      if (o.hairline === 'fringe') thick += o.fringe * 0.006 * frontF * (1 - smoothstep(0.0, 0.05, edge - 0.002));
      // sweep the fringe toward one side (quiff)
      let p = v3.madd(base, n, thick);
      if (o.sweepSide !== 0) p = v3.add(p, [o.sweepSide * 0.006 * frontF * smoothstep(0.13, 0.17, base[1]), 0.004 * frontF * smoothstep(0.14, 0.18, base[1]), 0.004 * frontF]);
      if (o.roundness > 0) {
        // pull the outer surface toward a sphere (afro)
        const d = v3.sub(p, AFRO_CENTER);
        const nd = v3.norm(d);
        const lump = 1 + 0.032 * (Math.sin(nd[0] * 24 + 1) * Math.sin(nd[1] * 22 + 2) + Math.sin(nd[2] * 26 + 3) * Math.sin(nd[0] * 19 + 0.5) + 0.7 * Math.sin(nd[1] * 27 + nd[2] * 12));
        p = v3.lerp(p, v3.madd(AFRO_CENTER, nd, afroRadius(o.volume, nd) * lump), o.roundness * smoothstep(0.0, 0.1, edge + 0.01));
      }
      let flow = v3.norm(v3.sub(base, headPoint(th, Math.min(H_MAX, h + 0.01))));
      if (o.flowTo) flow = v3.norm(v3.sub(o.flowTo, base));
      const fade = smoothstep(0, 0.02, edge);
      const idx = emit(c, p, [th * 0.09, base[1], 1 - rel, HAIR_PIECE.cap], flow, { base, theta: th, lock: [0.37, 0.5, fade, 0] });
      if (i === 0) starts.push(idx);
    });
  }
  stitchRings(c.m, starts, cols, false);
  const top = headPoint(0, H_MAX);
  let crown = v3.madd(top, [0, 1, 0], o.top + o.volume);
  if (o.roundness > 0) crown = v3.lerp(crown, v3.madd(AFRO_CENTER, v3.norm(v3.sub(crown, AFRO_CENTER)), afroRadius(o.volume, [0, 1, 0])), o.roundness);
  const ti = emit(c, crown, [0, top[1], 0, HAIR_PIECE.cap], [0, 0, 1], { base: top, lock: [0.37, 0.5, 1, 0] });
  fan(c.m, ti, starts[starts.length - 1] as number, cols, false);
}

// ---------------------------------------------------------------------------------------------
// Scalp locks: cards that follow the head surface from the crown toward the hairline (or toward a tie point)
// ---------------------------------------------------------------------------------------------

interface ScalpPath {
  th0: number; th1: number; h0: number; h1: number;
  /** 0..1: how far the path arches over the crown on its way (hair pulled back over the top of the head). */
  arch?: number;
  lift0?: number; lift1?: number;
  /** Extra outward flick at the tip (m). */
  flick?: number;
  w: number; tipW?: number; steps: number;
}

function scalpPts(c: Ctx, o: ScalpPath, cap: CapOpts): Pt[] {
  const pts: Pt[] = [];
  const mid = (o.h0 + o.h1) / 2;
  for (let i = 0; i <= o.steps; i++) {
    const s = i / o.steps;
    const th = lerp(o.th0, o.th1, s);
    const h = clamp(lerp(o.h0, o.h1, s) + (o.arch ? (H_MAX - mid) * o.arch * Math.sin(Math.PI * s) : 0), H_MIN, H_MAX - 0.002);
    const base = headPoint(th, h);
    const n = headNormal(th, h);
    const lift = capThickness(cap, th, base[1], 1, 1) + lerp(o.lift0 ?? 0.003, o.lift1 ?? 0.004, s) + (o.flick ?? 0) * s * s;
    pts.push({ p: headToBind(c.O, v3.madd(base, n, lift)), n, w: lockWidth(s, o.w, o.tipW), base, theta: th });
  }
  return pts;
}

interface ScalpOpts {
  cap: CapOpts;
  /** Crown-tier and hairline-tier card counts. */
  n1: number; n2: number;
  /** Angles (|theta|, rad) the hairline tier covers: [0, PI] is all around, [0, 1.25] only the front. */
  reach: number;
  w: number;
  /** Fan-out from the centre line toward each side (rad over the length of a card; part styles). */
  spread: number;
  /** Side-swept fringe (rad over a card, signed). */
  sweep: number;
  /** Where all cards converge (head-local theta, h), or null for cards running down the head. */
  toward: ((th: number) => { th: number; h: number }) | null;
  tooth: number;
  volume: number;
  kind: string;
  fringe: number;
}

function scalpLocks(c: Ctx, o: ScalpOpts): void {
  const rnd = c.rnd;
  const frontF = (th: number) => smoothstep(1.35, 0.35, Math.abs(Math.atan2(Math.sin(th), Math.cos(th))));
  const place = (th0: number, h0: number, h1: number, depth: number, w: number, steps: number, lenJ: number) => {
    let th1 = th0;
    let hEnd = h1;
    let arch = 0;
    let hStart = h0;
    if (o.toward) {
      const tg = o.toward(th0);
      let d = tg.th - th0;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      th1 = th0 + d;
      hEnd = tg.h;
      arch = Math.min(1, Math.abs(d) / Math.PI) * 0.9;
    } else {
      th1 = th0 + (o.spread * Math.sign(Math.sin(th0) || 1) + o.sweep) * frontF(th0) * (0.7 + 0.6 * rnd());
      hEnd = h1 - lenJ;
    }
    const pts = scalpPts(c, { th0, th1, h0: hStart, h1: hEnd, arch, w, steps, lift0: 0.003, lift1: o.toward ? 0.004 : 0.003 + o.volume * 0.4, flick: o.toward ? 0 : 0.004 }, o.cap);
    card(c, pts, { piece: HAIR_PIECE.lock, seed: rnd(), depth, root: 0.7, tooth: o.toward ? 0 : o.tooth, bow: 0.3 });
  };
  // crown tier: from the very top down to the middle of the head
  for (let i = 0; i < o.n1; i++) {
    const th = -Math.PI + ((i + rnd() * 0.8) / o.n1) * Math.PI * 2;
    const hl = hairlineY(th, o.kind, o.fringe);
    const mid = o.toward ? hl + 0.008 : lerp(hl, H_MAX, 0.42);
    place(th, H_MAX - 0.006 - rnd() * 0.02, mid, 0.78 + 0.1 * rnd(), o.w * 1.15, o.toward ? 8 : 5, 0.0);
  }
  // hairline tier: from the middle down to the hairline, tips hanging a little over it
  for (let i = 0; i < o.n2; i++) {
    const th = -Math.PI + ((i + rnd() * 0.9) / o.n2) * Math.PI * 2;
    if (Math.abs(th) > o.reach) continue;
    const hl = hairlineY(th, o.kind, o.fringe);
    const mid = lerp(hl, H_MAX, 0.48);
    const long = o.toward ? 0 : 0.004 + 0.012 * rnd();
    place(th, mid + 0.02, hl + 0.006, 0.9 + 0.1 * rnd(), o.w * (0.85 + 0.3 * rnd()), o.toward ? 8 : 5, long);
  }
}

/** Fringe / bangs: cards from the front of the crown down over the forehead with ragged tips. */
function bangs(c: Ctx, cap: CapOpts, o: { count: number; fringe: number; kind: string; sweep: number; part: string; w: number; volume: number }): void {
  const rnd = c.rnd;
  for (let i = 0; i < o.count; i++) {
    const f = o.count === 1 ? 0 : i / (o.count - 1) - 0.5;
    const th0 = f * 1.45 + (rnd() - 0.5) * 0.08;
    const hl = hairlineY(th0, o.kind, o.fringe);
    const drop = o.kind === 'fringe' ? 0.004 : 0.035 * o.fringe;
    const part = o.part === 'center' ? Math.sign(th0 || 1) * 0.22 : o.part === 'left' ? 0.1 : o.part === 'right' ? -0.1 : 0;
    const sweep = o.sweep * 0.5 + part;
    const th1 = th0 + sweep * (0.55 + 0.7 * rnd());
    const pts = scalpPts(c, { th0, th1, h0: H_MAX - 0.012 - rnd() * 0.02, h1: hl - drop - rnd() * 0.01, arch: 0, w: o.w * (0.85 + 0.35 * rnd()), steps: 6, lift0: 0.003, lift1: 0.0035 + o.volume * 0.5 + 0.004 * Math.abs(f), flick: 0.002 + 0.003 * o.fringe }, cap);
    card(c, pts, { piece: HAIR_PIECE.lock, seed: rnd(), depth: 0.96, root: 0.7, tooth: 0.15, bow: 0.35 });
  }
}

// ---------------------------------------------------------------------------------------------
// Drape: cards that fall from the head over the sides and back (bob, waves, long hair)
// ---------------------------------------------------------------------------------------------

interface DrapeSpec {
  th: number;
  /** 0..1 position across the whole fall (routes the card behind the shoulders at its own x). */
  u: number;
  yStart: number; yEnd: number; rows: number;
  offset: number; flare: number; tuck: number; billow: number;
  sway: number; swayPhase: number; swayFreq: number;
  w: number; tipW: number; seed: number; depth: number; tooth: number;
  behind: boolean;
}

function drape(c: Ctx, o: DrapeSpec): void {
  const t = c.t;
  const shoulderTop = t.lm.neckBaseY + 0.015;
  const pts: Pt[] = [];
  let env = 0;
  const sn = Math.sin(o.th), cs = Math.cos(o.th);
  for (let r = 0; r <= o.rows; r++) {
    const f = r / o.rows;
    // rows are dense where the card bends over the head and sparse on the straight fall
    const yl = lerp(o.yStart, o.yEnd, Math.pow(f, 0.85));
    const hy = clamp(yl, -0.03, 0.16);
    const hp = headPoint(o.th, hy);
    env = Math.max(env, Math.hypot(hp[0], hp[2] + 0.005));
    const lift = lerp(o.offset * 0.8, o.offset, smoothstep(0.15, 0.1, yl)) + o.flare * smoothstep(o.yStart - 0.04, o.yEnd, yl) - o.tuck * smoothstep(o.yEnd + 0.03, o.yEnd, yl) + o.billow * Math.sin(Math.PI * Math.min(1, f * 1.1)) * smoothstep(0.1, 0.0, yl);
    const R = env + lift;
    const sw = o.sway * Math.sin(f * o.swayFreq + o.swayPhase) * smoothstep(0.0, 0.25, f);
    let local: Vec3 = [sn * R + cs * sw, yl, -0.005 + cs * R - sn * sw];
    let bind = headToBind(c.O, local);
    let n: Vec3 = [sn, 0, cs];
    if (o.behind) {
      // below the jaw, route every card behind the shoulders: spread over the upper back, hanging down the back surface.
      // Cards that already hang behind the head (the centre of the back) only keep clear of the back; the ones from the sides
      // sweep back over a longer stretch so the fall does not flare out in a flat wing
      const s = 2 * o.u - 1;
      const by = bind[1];
      const lat = smoothstep(0.15, 0.7, Math.abs(sn));
      const zBack = Math.min(backZ(t, by), backZ(t, shoulderTop)) - 0.004 - 0.008 * (1 - s * s) - (o.offset - 0.004) * 0.7;
      const fb = smoothstep(t.lm.headY, shoulderTop - 0.02, by);
      const fz = smoothstep(t.lm.headY + 0.04, shoulderTop - 0.15, by) * lat;
      const z = lerp(bind[2], zBack, fz);
      bind = [lerp(bind[0], -s * 0.094 + sw, fb), by, Math.min(z, backZ(t, by) - 0.006)];
      n = v3.norm(v3.lerp(n, [0, 0, -1], fz));
      local = [(bind[0] - c.O[0]) / HEAD_SCALE, yl, (bind[2] - c.O[2]) / HEAD_SCALE];
    }
    void local;
    pts.push({ p: bind, n, w: lockWidth(f, o.w, o.tipW), base: yl > 0.0 ? hp : null, theta: o.th });
  }
  card(c, pts, { piece: HAIR_PIECE.curtain, seed: o.seed, depth: o.depth, root: 0.75, tooth: o.tooth, bow: 0.4, rootFade: 0.1 });
}

interface FallOpts { from: number; to: number; count: number; yTop: number; yEnd: number; offset: number; flare: number; tuck: number; wave: number; behind: boolean; w: number; tipW: number; tooth: number; rows: number; jitter: number }

/** Two layers of overlapping drape cards: a shorter, darker inner layer under a longer outer one. */
function fall(c: Ctx, o: FallOpts): void {
  const rnd = c.rnd;
  for (let layer = 0; layer < 2; layer++) {
    const inner = layer === 0;
    for (let i = 0; i < o.count; i++) {
      const u = (i + (inner ? 0.5 : rnd() * 0.5 + 0.1)) / o.count;
      const th = lerp(o.from, o.to, u);
      const len = o.yTop - o.yEnd;
      const yEnd = o.yEnd + (inner ? len * 0.12 : 0) + (rnd() - 0.5) * o.jitter;
      drape(c, {
        th, u, yStart: o.yTop + 0.02, yEnd, rows: o.rows,
        offset: o.offset - (inner ? 0.007 : 0) + 0.002 * rnd(), flare: o.flare * (inner ? 0.6 : 1), tuck: o.tuck, billow: inner ? 0.0 : o.flare * 0.5,
        sway: o.wave, swayPhase: rnd() * 6.28 + th * 2.5, swayFreq: 7.5,
        w: o.w * (inner ? 1.25 : 0.9 + 0.3 * rnd()), tipW: o.tipW, seed: rnd(), depth: inner ? 0.62 : 0.94 + 0.06 * rnd(), tooth: o.tooth, behind: o.behind,
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------

/** A coil of hair: a spiral ribbon rooted on the scalp (head-local), growing along `dir`. */
function coil(c: Ctx, rootLocal: Vec3, dir: Vec3, o: { len: number; radius: number; turns: number; seed: number; depth: number; piece: number; steps: number }): void {
  const u = v3.norm(dir);
  let v = v3.cross(u, [0, 1, 0]);
  if (v3.len(v) < 0.2) v = v3.cross(u, [1, 0, 0]);
  v = v3.norm(v);
  const w3 = v3.cross(u, v);
  const a0 = o.seed * 6.28;
  const pts: Pt[] = [];
  for (let i = 0; i <= o.steps; i++) {
    const s = i / o.steps;
    const ang = a0 + s * o.turns * Math.PI * 2;
    const rad = o.radius * (0.55 + 0.45 * Math.sin(Math.min(1, s * 1.6) * Math.PI * 0.5)) * (1 - 0.35 * s * s);
    const radial = v3.add(v3.scale(v, Math.cos(ang)), v3.scale(w3, Math.sin(ang)));
    const centre = v3.madd(rootLocal, u, o.len * s - 0.002);
    // the ribbon runs along the spiral and its width spans the pitch, so the turns touch like a spring
    const pitch = o.len / o.turns;
    pts.push({ p: headToBind(c.O, v3.madd(centre, radial, rad)), n: radial, w: Math.max(0.0025, pitch * 0.75 * (1 - 0.5 * s * s)), base: null });
  }
  card(c, pts, { piece: o.piece, seed: o.seed, depth: o.depth, root: 0.55, tooth: 0.0, bow: 0.5 });
}

function curls(c: Ctx, cap: CapOpts, size: number, count: number): void {
  const rnd = c.rnd;
  // golden-angle distribution over the crown, front to back
  for (let k = 0; k < count; k++) {
    const f = (k + 0.5) / count;
    const th = k * 2.39996;
    const h = lerp(0.118, H_MAX - 0.004, Math.sqrt(1 - f));
    const base = headPoint(th, h);
    if (base[1] < hairlineY(th, 'natural', 0) + 0.018) continue;
    const n = headNormal(th, h);
    const r = size * (0.85 + 0.4 * rnd());
    const root = v3.madd(base, n, capThickness(cap, th, base[1], 1, 1) * 0.6);
    // curls spring up and out, drooping a little at the sides
    const dir = v3.norm(v3.add(v3.scale(n, 1), [0, 0.25 - 0.5 * smoothstep(0.17, 0.12, base[1]), 0]));
    coil(c, root, dir, { len: r * 2.1, radius: r * 0.95, turns: 1.4, seed: rnd(), depth: 0.8 + 0.2 * rnd(), piece: HAIR_PIECE.curl, steps: 8 });
  }
}

/** Afro: a lumpy shell (see buildCap) covered with dense springy coils, which carry the silhouette and the texture. */
function afro(c: Ctx, volume: number): void {
  const rnd = c.rnd;
  const count = 92;
  for (let k = 0; k < count; k++) {
    const f = (k + 0.5) / count;
    // golden spiral over the sphere above the brow line
    const cosv = lerp(0.99, -0.3, Math.pow(f, 0.9));
    const a = k * 2.39996;
    const dir: Vec3 = [Math.sqrt(1 - cosv * cosv) * Math.sin(a), cosv, Math.sqrt(1 - cosv * cosv) * Math.cos(a)];
    const th = Math.atan2(dir[0], dir[2]);
    const root = v3.madd(AFRO_CENTER, dir, afroRadius(volume, dir) - 0.004);
    if (root[1] < hairlineY(th, 'natural', 0) + 0.03) continue;
    const r = 0.0185 * (0.85 + 0.35 * rnd());
    coil(c, root, v3.norm(v3.add(dir, [0, 0.12, 0])), { len: r * 2.3, radius: r * 0.9, turns: 1.4, seed: rnd(), depth: 0.78 + 0.22 * rnd(), piece: HAIR_PIECE.curl, steps: 6 });
  }
}

function tube(c: Ctx, pathBind: Vec3[], radii: number[], piece: number, segments = 8, depth = 0.55): void {
  const n = pathBind.length;
  sweep(c.m, { path: pathBind, rx: radii, ry: radii.map((r) => r * 0.92), segments, up: [0, 0, -1], capStart: 0, capEnd: 0 }, (v: SweepVertex) => {
    const yl = (v.p[1] - c.O[1]) / HEAD_SCALE;
    const skin = headSkinFor(c, v.p[1], yl);
    const tdir = v3.norm(v3.sub(pathBind[Math.min(n - 1, Math.round(v.t * (n - 1)) + 1)] as Vec3, pathBind[Math.max(0, Math.round(v.t * (n - 1)) - 1)] as Vec3));
    return addVertex(c.m, v.p, skin, { aHair: [v.around * 0.06, v.t * 0.4, v.t, piece], aFlow: tdir, aLock: [0.5, depth, 1, 0] }, hairMorphs(c, v.p, skin, null, 0), v.n);
  });
}

/** Ponytail: a bundle of tapered locks around a swinging axis that leaves the tie, arcs back and hangs along the back. */
function ponytail(c: Ctx, length: number): void {
  const t = c.t;
  const rnd = c.rnd;
  const tie = headToBind(c.O, [0, 0.166, -0.096]);
  const axis: Vec3[] = [];
  const N = 12;
  // the running-minimum of the surface behind the point keeps the hanging bundle off the head and the back
  let zEnv = Infinity;
  for (let k = 0; k <= N; k++) {
    const f = k / N;
    const lift = 0.016 * Math.sin(Math.min(1, f * 3) * Math.PI * 0.5) * (1 - f);
    const y = tie[1] + lift - 0.01 - length * Math.pow(f, 0.95);
    const yl = (y - c.O[1] - HEAD_OFFSET[1]) / HEAD_SCALE;
    const zSurface = yl > -0.035 ? headToBind(c.O, headPoint(Math.PI, clamp(yl, -0.03, 0.16)))[2] : backZ(t, y);
    zEnv = Math.min(zEnv, Math.min(zSurface, backZ(t, Math.max(y, t.lm.neckBaseY - 0.06))));
    const out = 0.042 * Math.sin(Math.min(1, f / 0.24) * Math.PI * 0.5) * (1 - 0.7 * smoothstep(0.22, 0.8, f));
    axis.push([0.004 * Math.sin(f * 5), y, Math.min(tie[2] - 0.012 - out, zEnv - 0.02 - 0.008 * Math.sin(f * Math.PI))]);
  }
  axis[0] = tie;
  const K = 7;
  for (let k = 0; k < K; k++) {
    const phi = ((k + (rnd() - 0.5) * 0.4) / K) * Math.PI * 2;
    const fe = 0.8 + 0.2 * rnd();
    const pts: Pt[] = [];
    const rows = 10;
    for (let r = 0; r <= rows; r++) {
      const s = r / rows;
      const f = s * fe;
      const i = Math.min(N - 1, Math.floor(f * N));
      const ft = f * N - i;
      const a = axis[i] as Vec3, b = axis[i + 1] as Vec3;
      const ctr = v3.lerp(a, b, ft);
      const tg = v3.norm(v3.sub(b, a));
      const X = v3.norm(v3.cross(tg, [0, 0, 1]));
      const Y = v3.norm(v3.cross(X, tg));
      // the bundle: full at the tie, a little fuller just below it, narrowing to the tips
      const rho = 0.025 * (0.5 + 0.5 * smoothstep(0, 0.1, f)) * (1 + 0.25 * Math.sin(Math.min(1, f * 3) * Math.PI)) * (1 - 0.82 * smoothstep(0.25, 1, f));
      const radial = v3.add(v3.scale(X, Math.cos(phi)), v3.scale(Y, Math.sin(phi)));
      // each lock sways a touch around the bundle so the tips fan apart
      const spread = 1 + 0.5 * smoothstep(0.55, 1, f);
      pts.push({ p: v3.madd(ctr, radial, rho * spread), n: radial, w: Math.max(0.003, lockWidth(s, rho * 1.05 + 0.004, 0.1)), base: null });
    }
    card(c, pts, { piece: HAIR_PIECE.tail, seed: rnd(), depth: 0.8 + 0.2 * rnd(), root: 0.8, tooth: 0.14, bow: 0.45 });
  }
  // tie
  const ring: Vec3[] = [];
  const d = v3.norm(v3.sub(axis[1] as Vec3, tie));
  for (let k = 0; k <= 4; k++) ring.push(v3.madd(tie, d, 0.0035 * k + 0.002));
  tube(c, ring, ring.map(() => 0.0225), HAIR_PIECE.tie, 9, 0.5);
}

/** Bun: twisted gores wrapped around a ball, sitting on the crown. */
function bun(c: Ctx, size: number): void {
  const rnd = c.rnd;
  const ctr: Vec3 = [0, 0.258, -0.04];
  const R = size * 0.72;
  const sq = 0.88;
  const K = 13;
  for (let k = 0; k < K; k++) {
    const phi = ((k + (rnd() - 0.5) * 0.25) / K) * Math.PI * 2;
    const pts: Pt[] = [];
    const rows = 8;
    for (let r = 0; r <= rows; r++) {
      const s = r / rows;
      const alpha = Math.PI * (0.04 + 0.92 * s);
      const ph = phi + 1.1 * s;
      const d: Vec3 = [Math.sin(alpha) * Math.cos(ph), Math.cos(alpha) * sq, Math.sin(alpha) * Math.sin(ph)];
      const nrm = v3.norm([d[0], d[1] / sq / sq, d[2]]);
      const half = Math.max(0.0035, ((Math.PI * R * Math.sin(alpha)) / K) * 1.25);
      pts.push({ p: headToBind(c.O, v3.madd(ctr, d, R)), n: nrm, w: half, base: null });
    }
    card(c, pts, { piece: HAIR_PIECE.bun, seed: rnd(), depth: 0.82 + 0.18 * rnd(), root: 0.9, tooth: 0, bow: 0.55 });
  }
  // the band at the base of the bun
  const base = headToBind(c.O, [0, ctr[1] - R * sq * 0.78, ctr[2]]);
  tube(c, [v3.add(base, [0, -0.003, 0]), v3.add(base, [0, 0.004, 0])], [R * 0.9, R * 0.9], HAIR_PIECE.tie, 12, 0.5);
}

/** One plaited bead: a flattened ellipsoid whose long axis leans to one side, so a chain of them reads as a braid. */
function bead(c: Ctx, centre: Vec3, axis: Vec3, lean: number, a: number, b: number, depth: number, seed: number): void {
  const side: Vec3 = [1, 0, 0];
  const dep: Vec3 = v3.norm(v3.cross(side, axis));
  const A = v3.norm(v3.add(v3.scale(axis, Math.cos(lean)), v3.scale(side, Math.sin(lean))));
  const B = v3.norm(v3.cross(dep, A));
  const seg = 7;
  const starts: number[] = [];
  const put = (p: Vec3, aHair: [number, number, number, number], flow: Vec3): number =>
    emit(c, [0, 0, 0], aHair, flow, { bind: p, base: null, lock: [seed, depth, 1, 0], skinLocalY: (p[1] - c.O[1] - HEAD_OFFSET[1]) / HEAD_SCALE });
  for (let k = 1; k <= 2; k++) {
    const v = (k / 3) * Math.PI;
    for (let i = 0; i < seg; i++) {
      const ang = (i / seg) * Math.PI * 2;
      const p = v3.add(centre, v3.add(v3.scale(A, Math.cos(v) * a), v3.add(v3.scale(B, Math.sin(v) * Math.cos(ang) * b), v3.scale(dep, Math.sin(v) * Math.sin(ang) * b * 0.92))));
      const idx = put(p, [ang * b, v * a, k / 3, HAIR_PIECE.tail], A);
      if (i === 0) starts.push(idx);
    }
  }
  stitchRings(c.m, starts, seg, false);
  const top = put(v3.madd(centre, A, a), [0, 0, 0, HAIR_PIECE.tail], A);
  fan(c.m, top, starts[0] as number, seg, false);
  const bot = put(v3.madd(centre, A, -a), [0, a * 2, 1, HAIR_PIECE.tail], A);
  fan(c.m, bot, starts[1] as number, seg, true);
}

function braids(c: Ctx, length: number): void {
  const t = c.t;
  const rnd = c.rnd;
  for (const side of [1, -1]) {
    const start = headToBind(c.O, [side * 0.056, 0.05, -0.084]);
    const path: Vec3[] = [];
    const pts = 28;
    for (let k = 0; k <= pts; k++) {
      const f = k / pts;
      const y = start[1] - length * f;
      const z = Math.min(start[2] - 0.006 * f, backZ(t, y) - 0.018);
      const x = side * lerp(0.07, 0.086, f);
      path.push([x, y, lerp(start[2], z, smoothstep(0, 0.55, f))]);
    }
    const step = 2;
    let lean = 0.62;
    for (let k = 0; k + step <= pts - 3; k += step) {
      const a = path[k] as Vec3, b = path[k + step] as Vec3;
      const f = k / pts;
      const ax = v3.norm(v3.sub(b, a));
      const scale = 1 - 0.38 * f;
      bead(c, v3.lerp(a, b, 0.5), ax, lean, 0.021 * scale, 0.0165 * scale, 0.72 + 0.28 * Math.abs(Math.sin(k * 1.7)), rnd());
      lean = -lean;
    }
    // the tuft below the tie, and the tie itself
    const end = path[pts - 3] as Vec3;
    const tieBase = v3.add(end, [0, 0.004, 0]);
    for (let q = 0; q < 3; q++) {
      const dx = (q - 1) * 0.007;
      const lenQ = 0.04 + 0.014 * rnd();
      const tp: Pt[] = [];
      for (let r = 0; r <= 4; r++) {
        const s = r / 4;
        tp.push({ p: v3.add(tieBase, [dx * (1 + 1.4 * s), -lenQ * s, -0.004 * s]), n: [0, 0, -1], w: lockWidth(s, 0.0085, 0.1), base: null });
      }
      card(c, tp, { piece: HAIR_PIECE.tail, seed: rnd(), depth: 0.9, root: 0.8, tooth: 0.2, bow: 0.4 });
    }
    tube(c, [v3.add(tieBase, [0, 0.006, 0]), tieBase, v3.add(tieBase, [0, -0.006, 0])], [0.0105, 0.0105, 0.0105], HAIR_PIECE.tie, 8, 0.5);
  }
}

// ---------------------------------------------------------------------------------------------
// Facial hair
// ---------------------------------------------------------------------------------------------

function facialMask(b: B, th: number, y: number, x: number): number {
  const ax = Math.abs(x);
  const front = Math.cos(th);
  const must = num(b, 'mustache', 0) * smoothstep(0.034, 0.038, y) * (1 - smoothstep(0.046, 0.05, y)) * (1 - smoothstep(0.022, 0.028, ax)) * smoothstep(0.3, 0.6, front);
  const chin = num(b, 'chin', 0) * (1 - smoothstep(0.018, 0.024, y)) * smoothstep(-0.016, -0.006, y) * (1 - smoothstep(0.02, 0.027, ax)) * smoothstep(0.4, 0.7, front);
  const jawAmt = num(b, 'jaw', 0);
  const jaw = jawAmt * (1 - smoothstep(0.05 + 0.03 * (1 - front), 0.06 + 0.03 * (1 - front), y)) * smoothstep(-0.035, -0.02, y) * smoothstep(-0.25, 0.05, front);
  const lips = gauss(x, 0.019) * gauss(y - 0.0285, 0.0075);
  return clamp(Math.max(must, chin, jaw) - lips * 1.6 * (1 - must), 0, 1);
}

function buildFacialHair(c: Ctx, def: FacialHairDef): void {
  const b = def.build;
  if (str(b, 'kind', 'paint') !== 'shell') return;
  const thick = num(b, 'thickness', 0.006);
  const chinBulk = Math.max(0, num(b, 'chin', 0) - 1);
  const cols = 56;
  const ys: number[] = [];
  for (let y = -0.036; y <= 0.1; y += 0.003) ys.push(y);
  const ths: number[] = [];
  for (let i = 0; i <= cols; i++) ths.push(-Math.PI * 0.62 + (Math.PI * 1.24 * i) / cols);
  const grid: number[][] = [];
  const masks: number[][] = [];
  for (const y of ys) {
    const row: number[] = [], mrow: number[] = [];
    for (const th of ths) {
      const base = headPoint(th, y);
      const m = facialMask(b, th, base[1], base[0]);
      const n = headNormal(th, y);
      const off = 0.0008 + thick * smoothstep(0, 1, m) + chinBulk * 0.012 * gauss(base[0], 0.025) * smoothstep(0.02, -0.01, base[1]) * m;
      const p = v3.madd(base, n, off);
      row.push(emit(c, p, [th * 0.09, base[1], m, HAIR_PIECE.facial], [0, -1, 0.3], { base, theta: th }));
      mrow.push(m);
    }
    grid.push(row);
    masks.push(mrow);
  }
  for (let r = 0; r + 1 < ys.length; r++) for (let i = 0; i < cols; i++) {
    const ms = [masks[r]![i]!, masks[r]![i + 1]!, masks[r + 1]![i]!, masks[r + 1]![i + 1]!];
    if (Math.max(...ms) < 0.02) continue;
    const a = grid[r]![i]!, bb = grid[r]![i + 1]!, d = grid[r + 1]![i]!, e = grid[r + 1]![i + 1]!;
    addTri(c.m, a, bb, d); addTri(c.m, bb, e, d);
  }
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

/** Builds hair (and optional facial hair) for a body frame. */
export function buildHair(t: BodyTemplate, def: HairDef | null, facial: FacialHairDef | null): MeshData {
  const m = emptyMesh(HAIR_ATTRS, HAIR_MORPHS);
  const raw = t.raw;
  const c: Ctx = { t, m, head: boneIndex(raw, 'Head'), neck: boneIndex(raw, 'neck_01'), spine3: boneIndex(raw, 'spine_03'), spine2: boneIndex(raw, 'spine_02'), O: t.headOrigin, rnd: rng(hashStr(def?.id ?? 'facial')) };
  if (def) {
    const b = def.build;
    const piece = str(b, 'piece', 'none');
    const kind = str(b, 'hairline', 'natural');
    const fringe = num(b, 'fringe', 0);
    const part = str(b, 'part', 'none');
    const sweep = num(b, 'sweep', 0);
    const len = num(b, 'length', 0.2);
    const cap = num(b, 'cap', 0.008);
    const top = num(b, 'top', 0.012);
    const stubble = str(b, 'strand', 'straight') === 'stubble';
    const TIE: Vec3 = [0, 0.166, -0.096];
    const capO: CapOpts = {
      cap, top, hairline: kind, fringe, part, sweepSide: -sweep, volume: piece === 'afro' ? num(b, 'volume', 0.05) : 0, roundness: piece === 'afro' ? 0.85 : 0,
      rows: stubble ? 8 : piece === 'afro' ? 14 : 11, cols: 36, flowTo: piece === 'ponytail' || piece === 'bun' ? TIE : null,
    };
    buildCap(c, capO);
    const scalp = (o: Partial<ScalpOpts>) => scalpLocks(c, { cap: capO, n1: 16, n2: 34, reach: Math.PI, w: 0.0125, spread: 0, sweep: -sweep * 0.5, toward: null, tooth: 0.2, volume: Math.max(0, top - 0.012), kind, fringe, ...o });
    const spreadFor = part === 'center' ? 0.3 : 0;
    if (piece === 'none' && !stubble) {
      scalp({ spread: spreadFor });
      if (fringe > 0) bangs(c, capO, { count: 9, fringe, kind, sweep: -sweep, part, w: 0.0115, volume: Math.max(0, top - 0.012) });
    }
    if (piece === 'curls') curls(c, capO, num(b, 'curlSize', 0.016), Math.round(num(b, 'curlCount', 40) * 1.15));
    if (piece === 'afro') afro(c, num(b, 'volume', 0.05));
    if (piece === 'bob') {
      scalp({ reach: 1.25, n1: 12, n2: 20, spread: spreadFor, w: 0.0135 });
      bangs(c, capO, { count: 9, fringe, kind, sweep: 0, part, w: 0.0125, volume: 0 });
      fall(c, { from: 1.02, to: Math.PI * 2 - 1.02, count: 20, yTop: 0.13, yEnd: 0.13 - len, offset: cap + 0.002, flare: num(b, 'flare', 0.01), tuck: 0.008, wave: 0, behind: false, w: 0.0165, tipW: 0.8, tooth: 0.05, rows: 7, jitter: 0.034 });
    }
    if (piece === 'long') {
      scalp({ reach: 1.8, n1: 12, n2: 20, spread: spreadFor, w: 0.0135 });
      const wave = num(b, 'wave', 0);
      fall(c, { from: 1.75, to: Math.PI * 2 - 1.75, count: 20, yTop: 0.125, yEnd: 0.1 - len / HEAD_SCALE, offset: cap + 0.003, flare: 0.006, tuck: 0, wave: wave * 1.6, behind: true, w: 0.0185, tipW: wave > 0 ? 0.3 : 0.45, tooth: wave > 0 ? 0.1 : 0.07, rows: wave > 0 ? 9 : 11, jitter: 0.03 });
    }
    if (piece === 'ponytail') {
      scalp({ toward: () => ({ th: Math.PI, h: 0.166 }) });
      ponytail(c, len);
    }
    if (piece === 'bun') {
      scalp({ toward: () => ({ th: Math.PI, h: H_MAX - 0.03 }) });
      bun(c, num(b, 'bunSize', 0.05));
    }
    if (piece === 'braids') {
      scalp({ toward: (th) => ({ th: Math.sign(th || 1) * 2.6, h: 0.05 }), n1: 14, n2: 28 });
      braids(c, len);
    }
  }
  if (facial) buildFacialHair(c, facial);
  t.headMap?.apply(m);
  computeSmoothNormals(m, 1e-6);
  return m;
}
