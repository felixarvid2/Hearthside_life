// Meshy (AI-generated, unrigged) body -> mannequin bind space + skin weights from the mannequin.
// Pure module (no three.js): used by dev/meshy.ts and by the Node check dev/meshy/check.mts.
//
// Steps: orientation -> landmarks (crotch from the leg gap, arm line) -> piecewise vertical warp onto the mannequin's
// crotch / arm line / height, feet on y = 0, body axis on x = 0 -> arm line
// straightened onto the mannequin's T-pose arm line (and optionally lengthened) -> z aligned to the mannequin
// chest -> Gaussian skin transfer per region (arm / trunk / head / leg, per side) -> weights shared across UV
// seams and smoothed over the mesh.

import type { RawBody, Skin, Vec3 } from '../src/characters/rig';
import { blendSkins, bonePosition, clamp, skinFromMap, smoothstep } from '../src/characters/rig';
import { SkinTransfer, armTest, sideTest } from '../src/characters/skinTransfer';

export interface FitOptions {
  /** Final height in metres (feet to crown). */
  height: number;
  /** Stretch of the arms along x beyond the shoulder (0 = automatic: hand tip at 96 % of the mannequin's). */
  armScale: number;
  /** x/z scale of the body below the neck (the legs and torso are stretched in y only to meet the mannequin's joints). */
  girth: number;
  /** Gaussian sigma (m) of the skin transfer. */
  sigma: number;
  /** Move the leg centre lines onto the bone axes. */
  straightenLegs: boolean;
  /** Drop triangles that bridge the two legs below the crotch. */
  splitLegs: boolean;
  /** Weight smoothing passes over the (seam-welded) mesh. */
  smooth: number;
  /** Smoothing strength per pass, 0..1. */
  smoothAmount: number;
}

export const DEFAULT_FIT: FitOptions = { height: 1.8, armScale: 0, girth: 0.9, straightenLegs: true, splitLegs: true, sigma: 0.03, smooth: 4, smoothAmount: 0.5 };

export interface FitReport {
  /** Landmarks found on the Meshy mesh (source units, above the feet) and the scales applied. */
  landmarks: { crotch: number; arm: number; axisX: number; legScale: number; torsoScale: number; girth: number; headScale: number; armScale: number };
  facingFlipped: boolean;
  /** Mesh height before scaling (source units). */
  sourceHeight: number;
  armLine: { y: number; z: number; srcY: number; srcZ: number };
  zShift: number;
  /** Triangles removed by splitLegs. */
  cutTris: number;
  /** Largest sideways move (m) of the leg straightening. */
  legShift: number;
  tris: number;
  verts: number;
  weldedVerts: number;
  /** Vertices per region id. */
  regions: Record<string, number>;
  /** Source head box in bind space (after normalisation), for hair fitting. */
  head: { min: Vec3; max: Vec3 };
  /** Head x/z extent on the skull band 1.60-1.70 m (for fitting hair) and the crown height. */
  skull: { x0: number; x1: number; z0: number; z1: number; crown: number };
  ms: number;
}

export interface FitResult {
  /** Triangles to draw (the source index minus the leg-bridging triangles). */
  index: Uint32Array;
  positions: Float32Array;
  normals: Float32Array;
  joints: Uint16Array;
  weights: Float32Array;
  report: FitReport;
}

const FINGER = /^(thumb|index|middle|ring|pinky)/;

/** Copy of the mannequin with every finger influence moved to the hand bone ("coarse hands"). */
export function collapseFingers(raw: RawBody): RawBody {
  const names = raw.boneNames;
  const remap = names.map((nm, i) => {
    if (!FINGER.test(nm)) return i;
    const hand = names.indexOf(nm.endsWith('_r') ? 'hand_r' : 'hand_l');
    return hand < 0 ? i : hand;
  });
  const n = raw.positions.length / 3;
  const joints = new Uint16Array(n * 4);
  const weights = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const map = new Map<number, number>();
    for (let k = 0; k < 4; k++) {
      const w = raw.weights[v * 4 + k] as number;
      if (w <= 0) continue;
      const b = remap[raw.joints[v * 4 + k] as number] as number;
      map.set(b, (map.get(b) ?? 0) + w);
    }
    const s = skinFromMap(map);
    for (let k = 0; k < 4; k++) { joints[v * 4 + k] = s.j[k] as number; weights[v * 4 + k] = s.w[k] as number; }
  }
  return { ...raw, joints, weights };
}

/** Median of a list. */
function median(a: number[]): number { const s = [...a].sort((x, y) => x - y); return s.length ? (s[s.length >> 1] as number) : 0; }

export function fitMeshy(src: { positions: Float32Array; normals: Float32Array; index: ArrayLike<number> }, rawIn: RawBody, opts: Partial<FitOptions> = {}): FitResult {
  const t0 = Date.now();
  const o: FitOptions = { ...DEFAULT_FIT, ...opts };
  const n = src.positions.length / 3;
  const P = new Float32Array(src.positions);
  const N = new Float32Array(src.normals);

  // ---- orientation ----
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) { const y = P[i * 3 + 1] as number; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const H = maxY - minY;
  // facing: the toes reach further forward than the heel; compare the foot z extent with the knee z centre
  const zExt = (y0: number, y1: number) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { const y = ((P[i * 3 + 1] as number) - minY) / H; if (y >= y0 && y < y1) { const z = P[i * 3 + 2] as number; if (z < lo) lo = z; if (z > hi) hi = z; } } return [lo, hi] as const; };
  const foot = zExt(0, 0.04), knee = zExt(0.24, 0.3);
  const kc = (knee[0] + knee[1]) / 2;
  const flip = foot[0] - kc < -(foot[1] - kc); // toes point to -z
  if (flip) for (let i = 0; i < n; i++) { P[i * 3] = -(P[i * 3] as number); P[i * 3 + 2] = -(P[i * 3 + 2] as number); N[i * 3] = -(N[i * 3] as number); N[i * 3 + 2] = -(N[i * 3 + 2] as number); }

  // ---- mannequin facts ----
  const raw = collapseFingers(rawIn);
  const up = bonePosition(raw, 'upperarm_l');
  const armT = up[1], armZ = up[2];
  const neckY = bonePosition(raw, 'neck_01')[1];
  const shoulderX = up[0]; // where the upper arm starts
  const dom = new SkinTransfer(raw).dominant;
  const pelvis = raw.boneNames.indexOf('pelvis');
  let crotchT = Infinity;
  for (let v = 0; v < raw.positions.length / 3; v++) if (dom[v] === pelvis && Math.abs(raw.positions[v * 3] as number) < 0.03) crotchT = Math.min(crotchT, raw.positions[v * 3 + 1] as number);
  crotchT += 0.014; // as in template.ts
  const handIdx = raw.boneNames.indexOf('hand_l');
  let tipT = 0;
  for (let v = 0; v < raw.positions.length / 3; v++) if (dom[v] === handIdx) tipT = Math.max(tipT, raw.positions[v * 3] as number);

  // ---- landmarks of the Meshy body (source units) ----
  // 1. leg gap: rows of the body where the middle is empty between the legs; its top is the crotch, its centre the body axis.
  const tri = src.index;
  const nt = Math.floor(tri.length / 3);
  const tMin = new Float32Array(nt), tMax = new Float32Array(nt);
  for (let t = 0; t < nt; t++) {
    const y0 = P[(tri[t * 3] as number) * 3 + 1] as number, y1 = P[(tri[t * 3 + 1] as number) * 3 + 1] as number, y2 = P[(tri[t * 3 + 2] as number) * 3 + 1] as number;
    tMin[t] = Math.min(y0, y1, y2); tMax[t] = Math.max(y0, y1, y2);
  }
  const rowIntervals = (y: number): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (let t = 0; t < nt; t++) {
      if ((tMin[t] as number) > y || (tMax[t] as number) < y) continue;
      const xs: number[] = [];
      for (let e = 0; e < 3; e++) {
        const a = tri[t * 3 + e] as number, b = tri[t * 3 + ((e + 1) % 3)] as number;
        const ya = P[a * 3 + 1] as number, yb = P[b * 3 + 1] as number;
        if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
        const f = (y - ya) / (yb - ya);
        xs.push((P[a * 3] as number) + ((P[b * 3] as number) - (P[a * 3] as number)) * f);
      }
      if (xs.length >= 2) out.push([Math.min(...xs), Math.max(...xs)]);
    }
    return out.sort((p, q) => p[0] - q[0]);
  };
  const gapAt = (y: number, near: number, reach: number): [number, number] | null => {
    let best: [number, number] | null = null, bd = Infinity;
    let hi = -Infinity;
    const iv = rowIntervals(y);
    for (let k = 0; k < iv.length; k++) {
      const [a, b] = iv[k] as [number, number];
      if (k > 0 && a - hi > 0.004 * H / 1.9) {
        const c = (a + hi) / 2;
        if (Math.abs(c - near) < reach && Math.abs(c - near) < bd) { bd = Math.abs(c - near); best = [hi, a]; }
      }
      hi = Math.max(hi, b);
    }
    return best;
  };
  const mid0 = (() => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { const x = P[i * 3] as number; if (x < lo) lo = x; if (x > hi) hi = x; } return (lo + hi) / 2; })();
  const gapCenters: number[] = [];
  let crotchR = 0, miss = 0;
  for (let y = minY + 0.25 * H; y < minY + 0.62 * H; y += H / 400) {
    const g = gapAt(y, mid0, 0.1 * H);
    if (g) { gapCenters.push((g[0] + g[1]) / 2); crotchR = y - minY; miss = 0; } else if (++miss > 6) break;
  }
  const cx = gapCenters.length ? median(gapCenters) : mid0;

  // 2. arm line: centre of the arm (bbox centre of y and z per x bin) on the upper body
  const binR = 0.016 * H, x0R = 0.13 * H;
  const binsR = new Map<number, { y0: number; y1: number; z0: number; z1: number }>();
  let tipR = 0;
  for (let i = 0; i < n; i++) {
    const ax = Math.abs((P[i * 3] as number) - cx), y = (P[i * 3 + 1] as number) - minY;
    if (ax < x0R || y < 0.7 * H) continue;
    tipR = Math.max(tipR, ax);
    const bi = Math.floor((ax - x0R) / binR);
    const z = P[i * 3 + 2] as number;
    const e = binsR.get(bi);
    if (!e) binsR.set(bi, { y0: y, y1: y, z0: z, z1: z });
    else { e.y0 = Math.min(e.y0, y); e.y1 = Math.max(e.y1, y); e.z0 = Math.min(e.z0, z); e.z1 = Math.max(e.z1, z); }
  }
  const nbR = Math.floor((tipR - x0R) / binR) + 1;
  const armRs: number[] = [];
  for (let bi = 1; bi < Math.max(2, nbR >> 1); bi++) { const e = binsR.get(bi); if (e) armRs.push((e.y0 + e.y1) / 2); }
  const armR = median(armRs);

  // ---- vertical landmark warp into bind space ----
  // legs [0, crotch] and torso [crotch, arm line] are stretched onto the mannequin's crotch and arm line; the head
  // keeps its proportions (uniform scale) and sets the total height. x/z follow the torso scale below the neck and
  // the head scale above it.
  const sL = crotchT / crotchR, sT = (armT - crotchT) / (armR - crotchR), sH = (o.height - armT) / (H - armR);
  const yMap = (yr: number) => (yr < crotchR ? yr * sL : yr < armR ? crotchT + (yr - crotchR) * sT : armT + (yr - armR) * sH);
  const ySlope = (yr: number) => (yr < crotchR ? sL : yr < armR ? sT : sH);
  for (let i = 0; i < n; i++) {
    const yr = (P[i * 3 + 1] as number) - minY;
    const k = o.girth + (sH - o.girth) * smoothstep(armR + 0.03 * H, armR + 0.09 * H, yr);
    const sy = ySlope(yr);
    P[i * 3] = ((P[i * 3] as number) - cx) * k;
    P[i * 3 + 1] = yMap(yr);
    P[i * 3 + 2] = (P[i * 3 + 2] as number) * k;
    const nx = (N[i * 3] as number) / k, ny = (N[i * 3 + 1] as number) / sy, nz = (N[i * 3 + 2] as number) / k;
    const l = Math.hypot(nx, ny, nz) || 1;
    N[i * 3] = nx / l; N[i * 3 + 1] = ny / l; N[i * 3 + 2] = nz / l;
  }
  // z alignment: chest centre onto the mannequin's
  const bandZ = (pos: Float32Array, y0: number, y1: number, xMax: number) => {
    let lo = Infinity, hi = -Infinity;
    for (let v = 0; v < pos.length / 3; v++) {
      const y = pos[v * 3 + 1] as number;
      if (y >= y0 && y <= y1 && Math.abs(pos[v * 3] as number) < xMax) { const z = pos[v * 3 + 2] as number; if (z < lo) lo = z; if (z > hi) hi = z; }
    }
    return (lo + hi) / 2;
  };
  const zShift = bandZ(raw.positions, 1.0, 1.3, 0.14) - bandZ(P, 1.0, 1.3, 0.14);
  for (let i = 0; i < n; i++) P[i * 3 + 2] = (P[i * 3 + 2] as number) + zShift;

  // ---- arm line straightening and lengthening ----
  const armY = armT;
  const binW = binR * o.girth, x0 = x0R * o.girth;
  const bins = new Map<number, { y0: number; y1: number; z0: number; z1: number }>();
  let tip = 0;
  for (let i = 0; i < n; i++) {
    const ax = Math.abs(P[i * 3] as number), y = P[i * 3 + 1] as number;
    if (ax < x0 || y < 0.7 * o.height) continue;
    tip = Math.max(tip, ax);
    const b = Math.floor((ax - x0) / binW);
    const z = P[i * 3 + 2] as number;
    const e = bins.get(b);
    if (!e) bins.set(b, { y0: y, y1: y, z0: z, z1: z });
    else { e.y0 = Math.min(e.y0, y); e.y1 = Math.max(e.y1, y); e.z0 = Math.min(e.z0, z); e.z1 = Math.max(e.z1, z); }
  }
  const nb = Math.floor((tip - x0) / binW) + 1;
  const cy: number[] = [], cz: number[] = [];
  for (let b = 0; b < nb; b++) {
    const e = bins.get(b);
    cy.push(e ? (e.y0 + e.y1) / 2 : (cy[b - 1] ?? armY));
    cz.push(e ? (e.z0 + e.z1) / 2 : (cz[b - 1] ?? armZ));
  }
  const srcArmY = median(cy.slice(0, Math.max(3, nb >> 1))), srcArmZ = median(cz.slice(0, Math.max(3, nb >> 1)));
  const lineAt = (arr: number[], ax: number) => {
    const f = clamp((ax - x0) / binW - 0.5, 0, nb - 1);
    const i = Math.floor(f), j = Math.min(nb - 1, i + 1), t = f - i;
    return (arr[i] as number) * (1 - t) + (arr[j] as number) * t;
  };
  // arm length: auto = hand tip at 96 % of the mannequin's
  const armScale = o.armScale > 0 ? o.armScale : (0.96 * tipT - shoulderX) / (tip - shoulderX);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3] as number, y = P[i * 3 + 1] as number;
    const ax = Math.abs(x), sgn = x < 0 ? -1 : 1;
    const wx = smoothstep(shoulderX - 0.02, shoulderX + 0.1, ax);
    const wy = smoothstep(armY - 0.26, armY - 0.17, y) * (1 - smoothstep(armY + 0.17, armY + 0.26, y));
    const w = wx * wy;
    if (w <= 0) continue;
    const ly = lineAt(cy, ax), lz = lineAt(cz, ax);
    P[i * 3 + 1] = y + (armY - ly) * w;
    P[i * 3 + 2] = (P[i * 3 + 2] as number) + (armZ - lz) * w;
    const k = 1 + (armScale - 1) * smoothstep(shoulderX, shoulderX + 0.15, ax) * wy;
    P[i * 3] = sgn * (shoulderX + (ax - shoulderX) * k);
  }
  const crotchY = crotchT;

  // ---- straighten the legs onto the mannequin's leg axes ----
  // The bones run straight down at x = +-0.089; a generated body often stands with its feet wider apart than its hips,
  // which would make every leg rotation swing the limb around an off-centre pivot. The leg centre line (bbox centre
  // per height row, per side) is moved onto the bone axis, fading out toward the pelvis.
  const legAxis = bonePosition(raw, 'thigh_l')[0];
  let legShift = 0;
  if (o.straightenLegs) {
    const rows = 40, row = (y: number) => Math.max(0, Math.min(rows - 1, Math.floor((y / crotchT) * rows)));
    for (const sg of [1, -1]) {
      const lo = new Float32Array(rows).fill(Infinity), hi = new Float32Array(rows).fill(-Infinity);
      for (let i = 0; i < n; i++) {
        const x = (P[i * 3] as number) * sg, y = P[i * 3 + 1] as number;
        if (x <= 0.01 || x > 0.42 || y >= crotchT) continue;
        const r = row(y);
        if (x < (lo[r] as number)) lo[r] = x;
        if (x > (hi[r] as number)) hi[r] = x;
      }
      const centre = (y: number) => { const f = Math.max(0, Math.min(rows - 1, (y / crotchT) * rows - 0.5)); const a = Math.floor(f), b = Math.min(rows - 1, a + 1), t = f - a; const ca = ((lo[a] as number) + (hi[a] as number)) / 2, cb = ((lo[b] as number) + (hi[b] as number)) / 2; return Number.isFinite(ca) && Number.isFinite(cb) ? ca + (cb - ca) * t : legAxis; };
      for (let i = 0; i < n; i++) {
        const x = (P[i * 3] as number) * sg, y = P[i * 3 + 1] as number;
        if (x <= 0 || y >= crotchT + 0.05) continue;
        const w = 1 - smoothstep(crotchT - 0.1, crotchT + 0.03, y);
        const dx = (legAxis - centre(Math.min(y, crotchT - 0.001))) * w * smoothstep(0, 0.03, x);
        P[i * 3] = (P[i * 3] as number) + sg * dx;
        legShift = Math.max(legShift, Math.abs(dx));
      }
    }
  }

  // ---- split the legs: triangles that bridge the two legs below the crotch (shorts seams, thighs fused by the
  // generator) would stretch between the legs in every walking/sitting pose; they are dropped ----
  const keepIdx: number[] = [];
  for (let t = 0; t + 2 < tri.length; t += 3) {
    const a = tri[t] as number, b = tri[t + 1] as number, c = tri[t + 2] as number;
    const ya = P[a * 3 + 1] as number, yb = P[b * 3 + 1] as number, yc = P[c * 3 + 1] as number;
    const l0 = (P[a * 3] as number) >= 0, l1 = (P[b * 3] as number) >= 0, l2 = (P[c * 3] as number) >= 0;
    if (o.splitLegs && Math.max(ya, yb, yc) < crotchY - 0.01 && !(l0 === l1 && l1 === l2)) continue;
    keepIdx.push(a, b, c);
  }
  const index = new Uint32Array(keepIdx);

  // ---- weld positions (UV seams duplicate vertices) ----
  const key = (i: number) => `${Math.round((P[i * 3] as number) * 2e4)},${Math.round((P[i * 3 + 1] as number) * 2e4)},${Math.round((P[i * 3 + 2] as number) * 2e4)}`;
  const weldOf = new Int32Array(n);
  const reps: number[] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const k = key(i);
    let w = seen.get(k);
    if (w === undefined) { w = reps.length; reps.push(i); seen.set(k, w); }
    weldOf[i] = w;
  }
  const m = reps.length;

  // ---- skin transfer per welded vertex ----
  const T = new SkinTransfer(raw);
  const isLimbArm = (nm: string) => /^(upperarm|lowerarm|hand)/.test(nm);
  const bodyTest = (side: number) => { const st = sideTest(side); return (nm: string) => st(nm) && !isLimbArm(nm); };
  const regions: Record<string, number> = {};
  const skins: Skin[] = new Array(m);
  const regionOf = new Uint8Array(m); // 0 trunk, 1 arm, 2 head, 3 leg
  const filterCache = new Map<string, (v: number) => boolean>();
  const filt = (id: string, test: (nm: string) => boolean) => { let f = filterCache.get(id); if (!f) { f = T.boneFilter(test); filterCache.set(id, f); } return f; };
  const headMinY = neckY + 0.04;
  for (let w = 0; w < m; w++) {
    const i = reps[w] as number;
    const x = P[i * 3] as number, y = P[i * 3 + 1] as number, z = P[i * 3 + 2] as number;
    const p: Vec3 = [x, y, z];
    const side = Math.abs(x) < 0.012 ? 0 : x > 0 ? 1 : -1;
    const sk = (s: number, test: (nm: string) => boolean, id: string) => T.skinAt(p, filt(`${id}${s}`, test), o.sigma);
    let skin: Skin;
    const ax = Math.abs(x);
    const armBand = Math.abs(y - armY) < 0.17;
    const tArm = armBand ? smoothstep(shoulderX - 0.05, shoulderX + 0.04, ax) : 0;
    if (y < crotchY + 0.04) {
      // legs (and the lower hem of the shorts): strictly one side; just below the hips they blend into the pelvis
      const ls = x >= 0 ? 1 : -1;
      skin = sk(ls, bodyTest(ls), 'leg');
      regionOf[w] = 3;
      const up2 = smoothstep(crotchY - 0.03, crotchY + 0.04, y);
      if (up2 > 0) skin = blendSkins([{ skin, f: 1 - up2 }, { skin: sk(side, bodyTest(side), 'body'), f: up2 }]);
    } else if (tArm > 0) {
      const a = sk(side || 1, armTest(side || 1), 'arm');
      skin = tArm >= 1 ? a : blendSkins([{ skin: sk(side, bodyTest(side), 'body'), f: 1 - tArm }, { skin: a, f: tArm }]);
      regionOf[w] = 1;
    } else if (y > headMinY && ax < 0.14) {
      skin = sk(0, bodyTest(0), 'headbody');
      regionOf[w] = 2;
    } else {
      skin = sk(side, bodyTest(side), 'body');
      regionOf[w] = 0;
    }
    skins[w] = skin;
  }

  // ---- smoothing over the welded mesh ----
  const nbrs: Array<Set<number>> = Array.from({ length: m }, () => new Set<number>());
  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = weldOf[index[t] as number] as number, b = weldOf[index[t + 1] as number] as number, c = weldOf[index[t + 2] as number] as number;
    if (a !== b) { nbrs[a]!.add(b); nbrs[b]!.add(a); }
    if (b !== c) { nbrs[b]!.add(c); nbrs[c]!.add(b); }
    if (a !== c) { nbrs[a]!.add(c); nbrs[c]!.add(a); }
  }
  // only smooth between vertices of the same side (a crotch seam must not average the two legs)
  const sideOf = (w: number) => { const x = P[(reps[w] as number) * 3] as number, y = P[(reps[w] as number) * 3 + 1] as number; return y < crotchY - 0.03 ? (x >= 0 ? 1 : -1) : Math.abs(x) < 0.012 ? 0 : x > 0 ? 1 : -1; };
  for (let pass = 0; pass < o.smooth; pass++) {
    const next: Skin[] = new Array(m);
    for (let w = 0; w < m; w++) {
      const s = skins[w] as Skin;
      const list = [...(nbrs[w] as Set<number>)].filter((q) => sideOf(q) === sideOf(w) || regionOf[w] !== 3);
      if (!list.length || o.smoothAmount <= 0) { next[w] = s; continue; }
      const parts: Array<{ skin: Skin; f: number }> = [{ skin: s, f: 1 - o.smoothAmount }];
      const f = o.smoothAmount / list.length;
      for (const q of list) parts.push({ skin: skins[q] as Skin, f });
      next[w] = blendSkins(parts);
    }
    for (let w = 0; w < m; w++) skins[w] = next[w] as Skin;
  }

  const joints = new Uint16Array(n * 4);
  const weights = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const s = skins[weldOf[i] as number] as Skin;
    for (let k = 0; k < 4; k++) { joints[i * 4 + k] = s.j[k] as number; weights[i * 4 + k] = s.w[k] as number; }
  }
  for (let w = 0; w < m; w++) { const k = ['trunk', 'arm', 'head', 'leg'][regionOf[w] as number] as string; regions[k] = (regions[k] ?? 0) + 1; }

  // head box (vertices above the neck, in the centre)
  const hmin: Vec3 = [Infinity, Infinity, Infinity], hmax: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const y = P[i * 3 + 1] as number;
    if (y < headMinY + 0.03 || Math.abs(P[i * 3] as number) > 0.14) continue;
    for (let k = 0; k < 3; k++) { const v = P[i * 3 + k] as number; if (v < (hmin[k] as number)) hmin[k] = v; if (v > (hmax[k] as number)) hmax[k] = v; }
  }

  const skull = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, crown: -Infinity };
  for (let i = 0; i < n; i++) {
    const y = P[i * 3 + 1] as number;
    if (Math.abs(P[i * 3] as number) > 0.14) continue;
    skull.crown = Math.max(skull.crown, y);
    if (y < 1.6 || y > 1.7) continue;
    skull.x0 = Math.min(skull.x0, P[i * 3] as number); skull.x1 = Math.max(skull.x1, P[i * 3] as number);
    skull.z0 = Math.min(skull.z0, P[i * 3 + 2] as number); skull.z1 = Math.max(skull.z1, P[i * 3 + 2] as number);
  }

  return {
    index, positions: P, normals: N, joints, weights,
    report: {
      landmarks: { crotch: crotchR, arm: armR, axisX: cx, legScale: sL, torsoScale: sT, girth: o.girth, headScale: sH, armScale }, facingFlipped: flip, sourceHeight: H,
      armLine: { y: armY, z: armZ, srcY: srcArmY, srcZ: srcArmZ },
      zShift, cutTris: (tri.length - index.length) / 3, legShift, tris: index.length / 3, verts: n, weldedVerts: m, regions, head: { min: hmin, max: hmax }, skull, ms: Date.now() - t0,
    },
  };
}
