// Procedural hair and facial hair, attached to the Head bone (long parts blend into the neck and upper
// spine so they follow the torso). Every style starts from a scalp cap sampled from the sculpted head
// surface above a style-specific hairline and offset outward, plus style pieces: curl clusters, a bob or
// long curtain (routed behind the shoulders), ponytail, bun, afro volume or braids. Facial hair is a shell
// over masked regions of the same head surface, so it receives the jaw/chin morphs. Pure module.

import type { FacialHairDef, HairDef } from '../content/types';
import { BODY_PARAM_IDS, bodyDeltas } from './bodyShape';
import { sampleProfile } from './fit';
import { HEAD_SCALE, HEAD_SCULPT_IDS, H_MAX, headDeltas, headNormal, headPoint, headToBind } from './headShape';
import type { MeshData, SweepVertex } from './meshData';
import { addTri, addVertex, computeSmoothNormals, emptyMesh, fan, stitchRings, sweep, v3 } from './meshData';
import type { Skin, Vec3 } from './rig';
import { blendSkins, boneIndex, clamp, gauss, lerp, rigidSkin, smoothstep } from './rig';
import type { BodyTemplate } from './template';

/** aHair = (u across strands m, v along strands m, root-to-tip 0..1, piece id); aFlow = strand direction (bind). */
export const HAIR_ATTRS = { aHair: 4, aFlow: 3 };
export const HAIR_MORPHS: readonly string[] = [...BODY_PARAM_IDS, ...HEAD_SCULPT_IDS, 'hairClear'];
/** Extra distance (m) the 'hairClear' morph moves hanging hair away from the back at influence 1 (bulky tops). */
export const HAIR_CLEAR = 0.03;
/** Piece ids: 0 cap, 1 curl, 2 curtain, 3 tail/braid, 4 bun, 5 tie, 6 facial hair. */
export const HAIR_PIECE = { cap: 0, curl: 1, curtain: 2, tail: 3, bun: 4, tie: 5, facial: 6 } as const;
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

interface Ctx { t: BodyTemplate; m: MeshData; head: number; neck: number; spine3: number; spine2: number; O: Vec3 }

function headSkinFor(c: Ctx, yBind: number, yLocal: number): Skin {
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

function morphs(c: Ctx, p: Vec3, skin: Skin, headLocal: Vec3 | null, theta: number): Record<string, Vec3> {
  const out = bodyDeltas(c.t.ctx, p, skin) as unknown as Record<string, Vec3>;
  const hang = smoothstep(c.t.lm.neckBaseY + 0.03, c.t.lm.neckBaseY - 0.05, p[1]);
  if (hang > 0) out.hairClear = [Math.sign(p[0]) * HAIR_CLEAR * 0.2 * hang, 0, -HAIR_CLEAR * hang];
  if (headLocal) {
    const hd = headDeltas(headLocal, theta) as unknown as Record<string, Vec3>;
    for (const [k, d] of Object.entries(hd)) out[k] = v3.scale(d, HEAD_SCALE);
  }
  return out;
}

function emit(c: Ctx, local: Vec3, aHair: [number, number, number, number], flowLocal: Vec3, opts: { skinLocalY?: number; base?: Vec3 | null; theta?: number; bind?: Vec3 } = {}): number {
  const p = opts.bind ?? headToBind(c.O, local);
  const skin = headSkinFor(c, p[1], opts.skinLocalY ?? local[1]);
  const base = opts.base === undefined ? null : opts.base;
  return addVertex(c.m, p, skin, { aHair, aFlow: v3.norm(flowLocal) }, morphs(c, p, skin, base, opts.theta ?? 0));
}

/** Back surface z (bind) of the torso at height y, for routing hair behind the shoulders. */
function backZ(t: BodyTemplate, y: number): number {
  const q = sampleProfile(t.profiles.torso, Math.min(y, t.lm.neckBaseY + 0.02), Math.PI);
  return q.cb - q.r;
}

// ---------------------------------------------------------------------------------------------
// Scalp cap
// ---------------------------------------------------------------------------------------------

interface CapOpts { cap: number; top: number; hairline: string; fringe: number; part: string; sweepSide: number; volume: number; roundness: number }

function capThickness(o: CapOpts, theta: number, y: number, edge: number, rel: number): number {
  const up = smoothstep(0.09, 0.2, y);
  const frontEdge = 1 - 0.55 * smoothstep(0.3, 0.9, Math.cos(theta)) * (1 - smoothstep(0.15, 0.2, y));
  let th = lerp(o.cap, o.top, up) + o.volume * (0.75 + 0.25 * up) * frontEdge;
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

function buildCap(c: Ctx, o: CapOpts): void {
  const cols = 44;
  const rows = 15;
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
        const ctr: Vec3 = [0, 0.11, -0.012];
        const d = v3.sub(p, ctr);
        const R = 0.098 + o.volume;
        p = v3.lerp(p, v3.madd(ctr, v3.norm(d), R), o.roundness * smoothstep(0.0, 0.06, edge + 0.01));
      }
      const flowDown = v3.norm(v3.sub(base, headPoint(th, Math.min(H_MAX, h + 0.01))));
      const idx = emit(c, p, [th * 0.09, base[1], rel, HAIR_PIECE.cap], flowDown, { base, theta: th });
      if (i === 0) starts.push(idx);
    });
  }
  stitchRings(c.m, starts, cols, false);
  const top = headPoint(0, H_MAX);
  let crown = v3.madd(top, [0, 1, 0], o.top + o.volume);
  if (o.roundness > 0) {
    const ctr: Vec3 = [0, 0.11, -0.012];
    crown = v3.lerp(crown, v3.madd(ctr, v3.norm(v3.sub(crown, ctr)), 0.098 + o.volume), o.roundness);
  }
  const ti = emit(c, crown, [0, top[1], 1, HAIR_PIECE.cap], [0, 0, 1], { base: top });
  fan(c.m, ti, starts[starts.length - 1] as number, cols, false);
}

// ---------------------------------------------------------------------------------------------
// Curtains (bob, long, waves)
// ---------------------------------------------------------------------------------------------

interface CurtainOpts { from: number; to: number; yTop: number; yEnd: number; offset: number; flare: number; wave: number; tuck: number; behindShoulders: boolean }

function buildCurtain(c: Ctx, o: CurtainOpts): void {
  const t = c.t;
  const cols = 34;
  const rows = Math.max(6, Math.round((o.yTop - o.yEnd) / 0.018));
  const starts: number[] = [];
  const envelope: number[] = new Array(cols).fill(0);
  const shoulderTop = t.lm.neckBaseY + 0.015;
  for (let r = 0; r <= rows; r++) {
    const rel = r / rows;
    const yl = lerp(o.yTop, o.yEnd, rel);
    for (let i = 0; i < cols; i++) {
      const u = i / (cols - 1);
      const th = lerp(o.from, o.to, u);
      // the head-hugging fall: widest head radius above this height, offset outward
      const hy = clamp(yl, -0.03, 0.16);
      const hp = headPoint(th, hy);
      const rad = Math.hypot(hp[0], hp[2] + 0.005);
      envelope[i] = Math.max(envelope[i] as number, rad);
      const R = (envelope[i] as number) + o.offset + o.flare * smoothstep(o.yTop - 0.04, o.yEnd, yl) - o.tuck * smoothstep(o.yEnd + 0.03, o.yEnd, yl);
      const wave = o.wave * Math.sin(yl * 55 + th * 2.5) * smoothstep(o.yTop, o.yTop - 0.05, yl);
      let local: Vec3 = [Math.sin(th) * (R + wave), yl, -0.005 + Math.cos(th) * (R + wave)];
      let bind = headToBind(c.O, local);
      if (o.behindShoulders) {
        // below the jaw, route every column behind the shoulders on a gentle arc over the upper back
        const s = 2 * u - 1;
        const by = bind[1];
        const target: Vec3 = [-s * 0.125, by, Math.min(backZ(t, by), backZ(t, shoulderTop)) - 0.03 - 0.02 * (1 - s * s)];
        const f = smoothstep(t.lm.headY + 0.0, shoulderTop - 0.02, by);
        bind = v3.lerp(bind, target, f);
        if (f > 0) bind[2] = Math.min(bind[2], lerp(bind[2], backZ(t, by) - 0.028, f));
        local = [(bind[0] - c.O[0]) / HEAD_SCALE, yl, (bind[2] - c.O[2]) / HEAD_SCALE];
      }
      const idx = emit(c, local, [th * 0.1, -yl, 0.25 + 0.75 * rel, HAIR_PIECE.curtain], [0, -1, 0], { bind, base: yl > 0.0 ? hp : null, theta: th });
      if (i === 0) starts.push(idx);
    }
  }
  stitchRings(c.m, starts, cols, true, false);
}

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------

function sphereBlob(c: Ctx, centerLocal: Vec3, r: number, squash: Vec3, piece: number, seg = 7, rings = 5): void {
  const starts: number[] = [];
  for (let k = 1; k < rings; k++) {
    const v = (k / rings) * Math.PI;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const d: Vec3 = [Math.sin(v) * Math.cos(a) * squash[0], Math.cos(v) * squash[1], Math.sin(v) * Math.sin(a) * squash[2]];
      const idx = emit(c, v3.madd(centerLocal, d, r), [a * r, v * r, k / rings, piece], [Math.cos(a + 1.3), 0.2, Math.sin(a + 1.3)]);
      if (i === 0) starts.push(idx);
    }
  }
  stitchRings(c.m, starts, seg, true);
  const top = emit(c, v3.madd(centerLocal, [0, squash[1], 0], r), [0, 0, 0, piece], [0, 1, 0]);
  fan(c.m, top, starts[0] as number, seg, false);
  const bot = emit(c, v3.madd(centerLocal, [0, -squash[1], 0], r), [0, 0, 1, piece], [0, -1, 0]);
  fan(c.m, bot, starts[starts.length - 1] as number, seg, true);
}

function curls(c: Ctx, size: number, count: number): void {
  // golden-angle distribution over the crown, front to back
  for (let k = 0; k < count; k++) {
    const f = (k + 0.5) / count;
    const th = k * 2.39996;
    const h = lerp(0.125, H_MAX - 0.004, Math.sqrt(1 - f));
    const base = headPoint(th, h);
    if (base[1] < hairlineY(th, 'natural', 0) + 0.02) continue;
    const n = headNormal(th, h);
    const r = size * (0.8 + 0.4 * (((k * 7919) % 13) / 13));
    sphereBlob(c, v3.madd(base, n, 0.004 + r * 0.3), r, [1, 0.8, 1], HAIR_PIECE.curl, 9, 6);
  }
}

function tube(c: Ctx, pathBind: Vec3[], radii: number[], piece: number, braid: boolean, segments = 10): void {
  const lm = c.t.lm;
  const n = pathBind.length;
  sweep(c.m, { path: pathBind, rx: radii, ry: radii.map((r) => r * 0.92), segments, up: [0, 0, -1], capStart: 1, capEnd: 2 }, (v: SweepVertex) => {
    const yl = (v.p[1] - c.O[1]) / HEAD_SCALE;
    const skin = headSkinFor(c, v.p[1], yl);
    const tdir = v3.norm(v3.sub(pathBind[Math.min(n - 1, Math.round(v.t * (n - 1)) + 1)] as Vec3, pathBind[Math.max(0, Math.round(v.t * (n - 1)) - 1)] as Vec3));
    void lm;
    return addVertex(c.m, v.p, skin, { aHair: [v.around * 0.06, v.t * 0.4, v.t, braid ? HAIR_PIECE.tail : piece], aFlow: tdir }, morphs(c, v.p, skin, null, 0), v.n);
  });
}

function ponytail(c: Ctx, length: number): void {
  const t = c.t;
  const tie = headToBind(c.O, [0, 0.168, -0.098]);
  const path: Vec3[] = [tie];
  const pts = 12;
  for (let k = 1; k <= pts; k++) {
    const f = k / pts;
    const y = tie[1] - 0.02 - length * f;
    const back = Math.min(backZ(t, y) - 0.045, tie[2] - 0.05 - 0.02 * Math.sin(f * Math.PI));
    path.push([0.004 * Math.sin(f * 6), y + 0.03 * (1 - f) * (1 - f), lerp(tie[2] - 0.035, back, smoothstep(0, 0.35, f))]);
  }
  const radii = path.map((_, k) => { const f = k / pts; return 0.017 + 0.012 * Math.sin(Math.min(1, f * 2.2) * Math.PI * 0.5) * (1 - f) - 0.009 * f * f; });
  tube(c, path, radii, HAIR_PIECE.tail, false, 10);
  // tie
  const ring: Vec3[] = [];
  const d = v3.norm(v3.sub(path[1] as Vec3, tie));
  for (let k = 0; k <= 8; k++) ring.push(v3.madd(tie, d, 0.004 * k - 0.006));
  tube(c, ring, ring.map(() => 0.02), HAIR_PIECE.tie, false, 10);
}

function braids(c: Ctx, length: number): void {
  const t = c.t;
  for (const side of [1, -1]) {
    const start = headToBind(c.O, [side * 0.06, 0.05, -0.062]);
    const path: Vec3[] = [];
    const pts = 18;
    for (let k = 0; k <= pts; k++) {
      const f = k / pts;
      const y = start[1] - length * f;
      const z = Math.min(start[2] - 0.01 * f, backZ(t, y) - 0.036);
      const x = side * lerp(0.075, 0.085, f);
      path.push([x, y, lerp(start[2], z, smoothstep(0, 0.3, f))]);
    }
    // braided bulges
    const radii = path.map((_, k) => 0.0145 * (1 - 0.35 * (k / pts)) * (0.82 + 0.18 * Math.abs(Math.sin(k * 1.9))));
    tube(c, path, radii, HAIR_PIECE.tail, true, 9);
    const tipTie = path[pts - 1] as Vec3;
    const tieRing = [v3.add(tipTie, [0, 0.006, 0]), tipTie, v3.add(tipTie, [0, -0.006, 0])];
    tube(c, tieRing, [0.011, 0.011, 0.011], HAIR_PIECE.tie, false, 8);
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
  const c: Ctx = { t, m, head: boneIndex(raw, 'Head'), neck: boneIndex(raw, 'neck_01'), spine3: boneIndex(raw, 'spine_03'), spine2: boneIndex(raw, 'spine_02'), O: t.headOrigin };
  if (def) {
    const b = def.build;
    const piece = str(b, 'piece', 'none');
    const capO: CapOpts = {
      cap: num(b, 'cap', 0.008), top: num(b, 'top', 0.012), hairline: str(b, 'hairline', 'natural'), fringe: num(b, 'fringe', 0),
      part: str(b, 'part', 'none'), sweepSide: num(b, 'sweep', 0), volume: piece === 'afro' ? num(b, 'volume', 0.05) : 0, roundness: piece === 'afro' ? 0.6 : 0,
    };
    buildCap(c, capO);
    const len = num(b, 'length', 0.2);
    if (piece === 'curls') curls(c, num(b, 'curlSize', 0.016) * 0.85, Math.round(num(b, 'curlCount', 40) * 1.35));
    if (piece === 'bob') {
      buildCurtain(c, { from: 1.02, to: Math.PI * 2 - 1.02, yTop: 0.13, yEnd: 0.13 - len, offset: num(b, 'cap', 0.012) + 0.002, flare: num(b, 'flare', 0.01), wave: 0, tuck: 0.008, behindShoulders: false });
    }
    if (piece === 'long') {
      buildCurtain(c, { from: 1.2, to: Math.PI * 2 - 1.2, yTop: 0.125, yEnd: 0.1 - len / HEAD_SCALE, offset: num(b, 'cap', 0.01) + 0.003, flare: 0.006, wave: num(b, 'wave', 0), tuck: 0, behindShoulders: true });
    }
    if (piece === 'ponytail') ponytail(c, len);
    if (piece === 'bun') {
      const s = num(b, 'bunSize', 0.05);
      sphereBlob(c, [0, 0.218, -0.04], s * 0.52, [1, 0.82, 1], HAIR_PIECE.bun, 14, 9);
    }
    if (piece === 'braids') braids(c, len);
  }
  if (facial) buildFacialHair(c, facial);
  computeSmoothNormals(m, 1e-6);
  return m;
}
