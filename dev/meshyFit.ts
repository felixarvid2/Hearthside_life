// Meshy (AI-generated, unrigged) body -> mannequin bind space + skin weights from the mannequin.
// Pure module (no three.js): used by dev/meshy.ts and by the Node check dev/meshy/check.mts.
//
// Steps: orientation/units -> uniform scale to `height`, feet on y = 0, centred in x -> arm line
// straightened onto the mannequin's T-pose arm line (and optionally lengthened) -> z aligned to the mannequin
// chest -> Gaussian skin transfer per region (arm / trunk / head / leg, per side) -> weights shared across UV
// seams and smoothed over the mesh.

import type { RawBody, Skin, Vec3 } from '../src/characters/rig';
import { blendSkins, bonePosition, clamp, skinFromMap, smoothstep } from '../src/characters/rig';
import { SkinTransfer, armTest, sideTest } from '../src/characters/skinTransfer';

export interface FitOptions {
  /** Final height in metres (feet to crown). */
  height: number;
  /** Stretch of the arms along x beyond the shoulder (1 = keep the Meshy proportions). */
  armScale: number;
  /** Gaussian sigma (m) of the skin transfer. */
  sigma: number;
  /** Weight smoothing passes over the (seam-welded) mesh. */
  smooth: number;
  /** Smoothing strength per pass, 0..1. */
  smoothAmount: number;
}

export const DEFAULT_FIT: FitOptions = { height: 1.78, armScale: 1.08, sigma: 0.02, smooth: 4, smoothAmount: 0.5 };

export interface FitReport {
  scale: number;
  facingFlipped: boolean;
  /** Mesh height before scaling (source units). */
  sourceHeight: number;
  armLine: { y: number; z: number; srcY: number; srcZ: number };
  zShift: number;
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

  // ---- orientation and units ----
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) { const y = P[i * 3 + 1] as number; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const srcH = maxY - minY;
  // facing: the feet reach further toward the front than the heel; compare the foot-sole z extent with the knee z centre
  const zExt = (y0: number, y1: number) => { let a = Infinity, b = -Infinity; for (let i = 0; i < n; i++) { const y = ((P[i * 3 + 1] as number) - minY) / srcH; if (y >= y0 && y < y1) { const z = P[i * 3 + 2] as number; if (z < a) a = z; if (z > b) b = z; } } return [a, b] as const; };
  const foot = zExt(0, 0.04), knee = zExt(0.24, 0.3);
  const kc = (knee[0] + knee[1]) / 2;
  const flip = foot[0] - kc < -(foot[1] - kc); // toes point to -z
  if (flip) for (let i = 0; i < n; i++) { P[i * 3] = -(P[i * 3] as number); P[i * 3 + 2] = -(P[i * 3 + 2] as number); N[i * 3] = -(N[i * 3] as number); N[i * 3 + 2] = -(N[i * 3 + 2] as number); }
  const scale = o.height / srcH;
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < n; i++) { const x = P[i * 3] as number; if (x < minX) minX = x; if (x > maxX) maxX = x; }
  const cx = (minX + maxX) / 2;
  for (let i = 0; i < n; i++) {
    P[i * 3] = ((P[i * 3] as number) - cx) * scale;
    P[i * 3 + 1] = ((P[i * 3 + 1] as number) - minY) * scale;
    P[i * 3 + 2] = (P[i * 3 + 2] as number) * scale;
  }

  // ---- mannequin facts ----
  const raw = collapseFingers(rawIn);
  const up = bonePosition(raw, 'upperarm_l');
  const armY = up[1], armZ = up[2];
  const neckY = bonePosition(raw, 'neck_01')[1];
  const shoulderX = up[0]; // 0.19: where the upper arm starts
  const crotchY = bonePosition(raw, 'thigh_l')[1] - 0.06;
  // mannequin trunk centre z (chest band) for the z alignment
  const bandZ = (pos: Float32Array, idx: (v: number) => boolean, y0: number, y1: number, xMax: number) => {
    const zs: number[] = [];
    for (let v = 0; v < pos.length / 3; v++) {
      const y = pos[v * 3 + 1] as number;
      if (y >= y0 && y <= y1 && Math.abs(pos[v * 3] as number) < xMax && idx(v)) zs.push(pos[v * 3 + 2] as number);
    }
    return zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0;
  };
  const chestZ = bandZ(raw.positions, () => true, 1.0, 1.3, 0.14);
  const myChestZ = bandZ(P, () => true, 1.0, 1.3, 0.14);
  const zShift = chestZ - myChestZ;
  for (let i = 0; i < n; i++) P[i * 3 + 2] = (P[i * 3 + 2] as number) + zShift;

  // ---- arm line ----
  // centre line of the arm (bbox centre of y and z per |x| bin), measured on the upper body
  const binW = 0.03, x0 = shoulderX + 0.05;
  const bins = new Map<number, { y0: number; y1: number; z0: number; z1: number }>();
  const upperY = o.height * 0.6;
  let tip = 0;
  for (let i = 0; i < n; i++) {
    const ax = Math.abs(P[i * 3] as number), y = P[i * 3 + 1] as number;
    if (ax < x0 || y < upperY) continue;
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
    const py = cy[b - 1], pz = cz[b - 1];
    cy.push(e ? (e.y0 + e.y1) / 2 : (py ?? armY));
    cz.push(e ? (e.z0 + e.z1) / 2 : (pz ?? armZ));
  }
  const srcArmY = median(cy.slice(0, Math.max(3, nb >> 1))), srcArmZ = median(cz.slice(0, Math.max(3, nb >> 1)));
  const lineAt = (arr: number[], ax: number) => {
    const f = clamp((ax - x0) / binW - 0.5, 0, nb - 1);
    const i = Math.floor(f), j = Math.min(nb - 1, i + 1), t = f - i;
    return (arr[i] as number) * (1 - t) + (arr[j] as number) * t;
  };
  // inner arm bins (near the shoulder) keep their own offset, so the shoulder blends into the torso
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
    // lengthen: x grows beyond the shoulder, ramped in so the shoulder shape is kept
    const k = 1 + (o.armScale - 1) * smoothstep(shoulderX, shoulderX + 0.15, ax) * wy;
    P[i * 3] = sgn * (shoulderX + (ax - shoulderX) * k);
  }

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
    if (y < crotchY + 0.04 && ax > 0) {
      // legs (and the lower hem of the shorts): strictly one side
      skin = sk(side || 1, bodyTest(side || 1), 'leg');
      regionOf[w] = 3;
      if (y > crotchY - 0.02 || side === 0) skin = blendSkins([{ skin, f: 0.5 }, { skin: sk(0, bodyTest(0), 'body'), f: 0.5 }]);
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
  for (let t = 0; t + 2 < src.index.length; t += 3) {
    const a = weldOf[src.index[t] as number] as number, b = weldOf[src.index[t + 1] as number] as number, c = weldOf[src.index[t + 2] as number] as number;
    if (a !== b) { nbrs[a]!.add(b); nbrs[b]!.add(a); }
    if (b !== c) { nbrs[b]!.add(c); nbrs[c]!.add(b); }
    if (a !== c) { nbrs[a]!.add(c); nbrs[c]!.add(a); }
  }
  // only smooth between vertices of the same side (a crotch seam must not average the two legs)
  const sideOf = (w: number) => { const x = P[(reps[w] as number) * 3] as number; return Math.abs(x) < 0.012 ? 0 : x > 0 ? 1 : -1; };
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
    positions: P, normals: N, joints, weights,
    report: {
      scale, facingFlipped: flip, sourceHeight: srcH,
      armLine: { y: armY, z: armZ, srcY: srcArmY, srcZ: srcArmZ },
      zShift, tris: src.index.length / 3, verts: n, weldedVerts: m, regions, head: { min: hmin, max: hmax }, skull, ms: Date.now() - t0,
    },
  };
}
