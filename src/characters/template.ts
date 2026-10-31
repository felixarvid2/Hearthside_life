// Body template: replaces the segmented mannequin skin with one smooth fitted surface per body frame and
// keeps that surface as parametric grids (torso, left leg, left arm) that garments are sampled from.
//
// Topology: the torso grid (rings of 2M points, from the crotch up into the head) and the two leg grids
// (2M points, from the crotch down to the ankle) meet at a "pair of pants" junction: the torso's bottom ring
// is made of the outer halves of both leg rings, pinched to the crotch at front and back centre, and each
// leg's inner half starts on the crotch line. Arms are separate capped tubes that start inside the shoulder.
// Hands are procedural (relaxed fingers: the clips do not animate fingers), feet come from the source mesh,
// the head is the sculpted surface from headShape.ts. Pure module.

import type { BodyFrame } from '../core/types';
import type { Landmarks, ShapeContext } from './bodyShape';
import { BODY_PARAM_IDS, bodyDeltas, shapeContext } from './bodyShape';
import type { Profile } from './fit';
import { fitProfile, profilePoint, sampleProfile } from './fit';
import { HEAD_SCALE, HEAD_SCULPT_IDS, H_MAX, H_MIN, earPoint, headColumns, headDeltas, headPoint, headRows, headToBind } from './headShape';
import type { MeshData, SweepVertex } from './meshData';
import { addTri, addVertex, computeSmoothNormals, emptyMesh, fan, mirrorMesh, stitchRings, sweep, v3 } from './meshData';
import type { RawBody, Skin, Vec3 } from './rig';
import { blendSkins, boneIndex, bonePosition, mirrorBoneName, rigidSkin, smoothstep } from './rig';
import { SkinTransfer, armTest, trunkTest } from './skinTransfer';

/** Vertex part ids stored in aInfo.x (shared with the skin shader). */
export const PART = { torso: 0, leg: 1, arm: 2, hand: 3, foot: 4, head: 5, ear: 6 } as const;

export const SKIN_MORPHS: readonly string[] = [...BODY_PARAM_IDS, ...HEAD_SCULPT_IDS];

/** A parametric ring grid in bind space. */
export interface Grid {
  rows: number;
  cols: number;
  pos: Float32Array;
  nrm: Float32Array;
  /** Axis coordinate per row (y for torso/legs, x for the arm). */
  s: Float32Array;
  /** Angle per point (radians, tube convention of fit.ts). */
  ang: Float32Array;
  skin: Skin[];
}

export interface BodyTemplate {
  frame: BodyFrame;
  raw: RawBody;
  lm: Landmarks;
  ctx: ShapeContext;
  transfer: SkinTransfer;
  /** Half the torso/leg ring size. */
  M: number;
  torso: Grid;
  legL: Grid;
  armL: Grid;
  profiles: { torso: Profile; leg: Profile; arm: Profile };
  /** Height of the lobe blend above the crotch junction. */
  junctionSpan: number;
  /** Head bone bind position (origin of head-local space). */
  headOrigin: Vec3;
  /** Mirror table: joint index -> joint index of the other side. */
  boneMirror: number[];
  /** The complete skin mesh (body + head), bind space, with aInfo/aFace attributes and SKIN_MORPHS. */
  skinMesh: MeshData;
}

/** Shape offsets baked into each frame's default body (values in BODY_PARAMS units). */
export const FRAME_BASE: Record<BodyFrame, Partial<Record<string, number>>> = {
  a: { shoulders: -0.35, muscle: -0.35, arms: -0.2, chest: -0.1, neck: -0.25 },
  b: { shoulders: -0.55, muscle: -0.3, arms: -0.3, waist: -0.2, hips: 0.25, chest: 0.1, neck: -0.35 },
};

const TORSO_BONES = new Set(['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'neck_01']);

export function buildBodyTemplate(raw: RawBody): BodyTemplate {
  const n = raw.positions.length / 3;
  const P = raw.positions;
  const transfer = new SkinTransfer(raw);
  const names = raw.boneNames;
  const dom = transfer.dominant;
  const nameOf = (v: number) => names[dom[v] as number] as string;
  const boneMirror = names.map((nm) => { const i = names.indexOf(mirrorBoneName(nm)); return i < 0 ? names.indexOf(nm) : i; });

  // ---- landmarks ----
  const yOf = (v: number) => P[v * 3 + 1] as number;
  const xOf = (v: number) => P[v * 3] as number;
  const verts = (test: (name: string, v: number) => boolean) => { const out: number[] = []; for (let v = 0; v < n; v++) if (test(nameOf(v), v)) out.push(v); return out; };
  const pelvisCenter = verts((nm, v) => nm === 'pelvis' && Math.abs(xOf(v)) < 0.03);
  const crotchY = Math.min(...pelvisCenter.map(yOf)) + 0.014;
  const footVerts = verts((nm) => /^(foot|ball)_l$/.test(nm));
  const footTop = Math.max(...footVerts.map(yOf));
  const upperArm = verts((nm) => nm === 'upperarm_l');
  const head = bonePosition(raw, 'Head');
  const lm: Landmarks = {
    crotchY,
    hipY: bonePosition(raw, 'thigh_l')[1] - 0.005,
    bellyY: (bonePosition(raw, 'pelvis')[1] + bonePosition(raw, 'spine_01')[1]) / 2 + 0.03,
    waistY: (bonePosition(raw, 'spine_01')[1] + bonePosition(raw, 'spine_02')[1]) / 2,
    chestY: bonePosition(raw, 'spine_03')[1] + 0.02,
    shoulderY: bonePosition(raw, 'upperarm_l')[1],
    neckBaseY: bonePosition(raw, 'neck_01')[1] + 0.01,
    headY: head[1],
    armStartX: Math.min(...upperArm.map(xOf)),
    elbowX: bonePosition(raw, 'lowerarm_l')[0],
    wristX: bonePosition(raw, 'hand_l')[0],
    kneeY: bonePosition(raw, 'calf_l')[1],
    ankleY: footTop - 0.006,
    footX: footVerts.reduce((acc, v) => acc + xOf(v), 0) / Math.max(1, footVerts.length),
  };
  const ctx = shapeContext(raw, lm);
  const H = 0.1;
  const torsoTop = head[1] + 0.055;

  // ---- profiles ----
  const torsoSet = verts((nm, v) => TORSO_BONES.has(nm) || (/^thigh_[lr]$/.test(nm) && yOf(v) > crotchY - 0.005));
  const torsoProfile = fitProfile(P, torsoSet, 'y', crotchY - 0.01, torsoTop, { rows: 46, slab: 0.012, dilate: 1, smoothRows: 1.3, smoothBins: 1.2 });
  // the neck above the source neck segment shrinks into the head
  const neckVerts = verts((nm) => nm === 'neck_01');
  const neckTop = Math.max(...neckVerts.map(yOf));
  torsoProfile.r.forEach((row, j) => {
    const s = torsoProfile.s[j] as number;
    const k = 1 - 0.1 * smoothstep(lm.neckBaseY - 0.01, lm.neckBaseY + 0.04, s) - 0.16 * smoothstep(neckTop - 0.03, torsoTop, s);
    for (let b = 0; b < row.length; b++) row[b] = (row[b] as number) * k;
  });
  const legSet = verts((nm) => nm === 'thigh_l' || nm === 'calf_l');
  const legProfile = fitProfile(P, legSet, 'y', lm.ankleY - 0.012, crotchY + H + 0.04, { rows: 44, slab: 0.012, dilate: 2, smoothRows: 1.6, smoothBins: 1.2 });
  const armSet = verts((nm) => nm === 'upperarm_l' || nm === 'lowerarm_l');
  const armEnd = lm.wristX + 0.01;
  const armProfile = fitProfile(P, armSet, 'x', lm.armStartX, armEnd, { rows: 34, slab: 0.012, dilate: 2, smoothRows: 1.6, smoothBins: 1.2 });

  const M = 16;
  const C = 2 * M;
  const NT = 32;
  const NL = 28;
  const NA = 26;
  const KA = 16;

  // ---- leg junction angles ----
  const torsoAt = (y: number, a: number) => profilePoint(torsoProfile, y, a);
  const Pf = torsoAt(crotchY, 0); Pf[0] = 0;
  const Pb = torsoAt(crotchY, Math.PI); Pb[0] = 0;
  const lc = sampleProfile(legProfile, crotchY, 0);
  const phiF = Math.atan2(Pf[0] - lc.ca, Pf[2] - lc.cb);
  let phiB = Math.atan2(Pb[0] - lc.ca, Pb[2] - lc.cb);
  while (phiB < phiF) phiB += Math.PI * 2;
  const legAngle = (i: number) => (i <= M ? phiF + ((phiB - phiF) * i) / M : phiB + ((phiF + Math.PI * 2 - phiB) * (i - M)) / M);

  // ---- leg grid (left) ----
  const legL = newGrid(NL, C);
  for (let j = 0; j < NL; j++) {
    const y = crotchY + ((lm.ankleY - crotchY) * j) / (NL - 1);
    legL.s[j] = y;
    for (let i = 0; i < C; i++) {
      const a = legAngle(i);
      let p: Vec3;
      if (j === 0) {
        if (i === 0) p = [...Pf] as Vec3;
        else if (i === M) p = [...Pb] as Vec3;
        else if (i > M) p = v3.lerp(Pb, Pf, (i - M) / M);
        else p = profilePoint(legProfile, y, a);
      } else {
        p = profilePoint(legProfile, y, a);
        if (j === 1 && i > M) p[0] = Math.max(p[0], 0.004); // keep the first inner ring off the centre line
      }
      setGrid(legL, j, i, p, a);
    }
  }

  // ---- torso grid ----
  const torso = newGrid(NT, C);
  for (let j = 0; j < NT; j++) {
    const y = crotchY + ((torsoTop - crotchY) * j) / (NT - 1);
    torso.s[j] = y;
    const w = smoothstep(crotchY, crotchY + H, y);
    for (let i = 0; i <= M; i++) {
      const th = (Math.PI * i) / M;
      const fit = torsoAt(y, th);
      let lobe: Vec3;
      if (i === 0) lobe = torsoAt(y, 0);
      else if (i === M) lobe = torsoAt(y, Math.PI);
      else lobe = profilePoint(legProfile, y, legAngle(i));
      const p = j === 0 ? ([...legPoint(legL, 0, i)] as Vec3) : v3.lerp(lobe, fit, w);
      if (i === 0 || i === M) p[0] = 0;
      setGrid(torso, j, i, p, th);
      if (i > 0 && i < M) setGrid(torso, j, C - i, [-p[0], p[1], p[2]], -th);
    }
  }

  // ---- arm grid (left) ----
  const armL = newGrid(NA, KA);
  for (let j = 0; j < NA; j++) {
    const x = lm.armStartX + ((armEnd - lm.armStartX) * j) / (NA - 1);
    armL.s[j] = x;
    const k = (0.72 + 0.28 * smoothstep(0, 3, j)) * (1 - 0.12 * smoothstep(NA - 4, NA - 1, j));
    for (let i = 0; i < KA; i++) {
      const a = (Math.PI * 2 * i) / KA;
      setGrid(armL, j, i, profilePoint(armProfile, x, a, 1, k), a);
    }
  }

  // ---- skin weights ----
  const legFilter = transfer.boneFilter(trunkTest(1));
  const centreFilter = transfer.boneFilter(trunkTest(0));
  const armFilter = transfer.boneFilter(armTest(1));
  for (let j = 0; j < NL; j++) for (let i = 0; i < C; i++) {
    const p = legPoint(legL, j, i);
    const centre = j === 0 && (i === 0 || i >= M);
    legL.skin[j * C + i] = transfer.skinAt(p, centre ? centreFilter : legFilter);
  }
  for (let j = 0; j < NT; j++) for (let i = 0; i <= M; i++) {
    const p = legPoint(torso, j, i);
    torso.skin[j * C + i] = transfer.skinAt(p, i === 0 || i === M ? centreFilter : legFilter);
  }
  for (let j = 0; j < NA; j++) for (let i = 0; i < KA; i++) armL.skin[j * KA + i] = transfer.skinAt(legPoint(armL, j, i), armFilter);
  smoothSkins(legL, 2);
  smoothSkins(torso, 2, M);
  smoothSkins(armL, 2);
  // junction consistency and torso symmetry
  for (let i = 0; i <= M; i++) torso.skin[i] = legL.skin[i] as Skin;
  for (let j = 0; j < NT; j++) for (let i = 1; i < M; i++) torso.skin[j * C + (C - i)] = mirrorSkin(torso.skin[j * C + i] as Skin, boneMirror);

  // stylisation baked into the frame default (0 on every slider): softer shoulders and limbs than the source mannequins
  const base = FRAME_BASE[raw.frame];
  for (const g of [torso, legL, armL]) {
    for (let k = 0; k < g.rows * g.cols; k++) {
      const p: Vec3 = [g.pos[k * 3] as number, g.pos[k * 3 + 1] as number, g.pos[k * 3 + 2] as number];
      const d = bodyDeltas(ctx, p, g.skin[k] as Skin);
      for (const [id, val] of Object.entries(base)) {
        const v = val ?? 0;
        const dd = d[id as keyof typeof d];
        g.pos[k * 3] = (g.pos[k * 3] as number) + dd[0] * v; g.pos[k * 3 + 1] = (g.pos[k * 3 + 1] as number) + dd[1] * v; g.pos[k * 3 + 2] = (g.pos[k * 3 + 2] as number) + dd[2] * v;
      }
    }
  }
  // the crotch line and pinch points stay on the centre plane (shared by both legs)
  for (let i = 0; i < C; i++) if (i === 0 || i >= M) legL.pos[i * 3] = 0;
  // keep the junction exact after the bake (torso row 0 = leg row 0 outer half, mirrored)
  for (let i = 0; i <= M; i++) {
    const p = legPoint(legL, 0, i);
    setGrid(torso, 0, i, i === 0 || i === M ? [0, p[1], p[2]] : p, torso.ang[i] as number);
    if (i > 0 && i < M) setGrid(torso, 0, C - i, [-p[0], p[1], p[2]], torso.ang[C - i] as number);
  }

  const t: BodyTemplate = {
    frame: raw.frame, raw, lm, ctx, transfer, M, torso, legL, armL,
    profiles: { torso: torsoProfile, leg: legProfile, arm: armProfile }, junctionSpan: H,
    headOrigin: head, boneMirror, skinMesh: emptyMesh(),
  };
  t.skinMesh = buildSkinMesh(t);
  return t;
}

// ---------------------------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------------------------

function newGrid(rows: number, cols: number): Grid {
  return {
    rows, cols, pos: new Float32Array(rows * cols * 3), nrm: new Float32Array(rows * cols * 3), s: new Float32Array(rows),
    ang: new Float32Array(rows * cols), skin: new Array<Skin>(rows * cols).fill(rigidSkin(0)),
  };
}

function setGrid(g: Grid, j: number, i: number, p: Vec3, a: number): void {
  const k = j * g.cols + i;
  g.pos[k * 3] = p[0]; g.pos[k * 3 + 1] = p[1]; g.pos[k * 3 + 2] = p[2];
  g.ang[k] = a;
}

export function legPoint(g: Grid, j: number, i: number): Vec3 {
  const k = j * g.cols + i;
  return [g.pos[k * 3] as number, g.pos[k * 3 + 1] as number, g.pos[k * 3 + 2] as number];
}

export function gridNormal(g: Grid, j: number, i: number): Vec3 {
  const k = j * g.cols + i;
  return [g.nrm[k * 3] as number, g.nrm[k * 3 + 1] as number, g.nrm[k * 3 + 2] as number];
}

export function mirrorSkin(s: Skin, boneMirror: number[]): Skin {
  return { j: [boneMirror[s.j[0]] ?? s.j[0], boneMirror[s.j[1]] ?? s.j[1], boneMirror[s.j[2]] ?? s.j[2], boneMirror[s.j[3]] ?? s.j[3]], w: [...s.w] as Skin['w'] };
}

/** Smooths skins along rows (columns unchanged). `halfCols` limits to columns 0..halfCols (mirrored later). */
function smoothSkins(g: Grid, iters: number, halfCols?: number): void {
  const last = halfCols ?? g.cols - 1;
  for (let it = 0; it < iters; it++) {
    const next = g.skin.slice();
    for (let j = 0; j < g.rows; j++) for (let i = 0; i <= last; i++) {
      const a = g.skin[Math.max(0, j - 1) * g.cols + i] as Skin;
      const b = g.skin[j * g.cols + i] as Skin;
      const c = g.skin[Math.min(g.rows - 1, j + 1) * g.cols + i] as Skin;
      next[j * g.cols + i] = blendSkins([{ skin: a, f: 0.25 }, { skin: b, f: 0.5 }, { skin: c, f: 0.25 }]);
    }
    g.skin = next;
  }
}

// ---------------------------------------------------------------------------------------------
// Skin mesh assembly
// ---------------------------------------------------------------------------------------------

const SKIN_ATTRS = { aInfo: 4, aFace: 3 };

function bodyMorphs(t: BodyTemplate, p: Vec3, skin: Skin): Record<string, Vec3> {
  return bodyDeltas(t.ctx, p, skin) as unknown as Record<string, Vec3>;
}

/** Adds a grid as rings to the mesh; returns the start index of every ring. */
function emitGrid(m: MeshData, t: BodyTemplate, g: Grid, part: number, side: number, mirrorX: boolean, ringIndex: number[][]): number[] {
  const starts: number[] = [];
  for (let j = 0; j < g.rows; j++) {
    const row: number[] = [];
    for (let i = 0; i < g.cols; i++) {
      let p = legPoint(g, j, i);
      let skin = g.skin[j * g.cols + i] as Skin;
      if (mirrorX) { p = [-p[0], p[1], p[2]]; skin = mirrorSkin(skin, t.boneMirror); }
      const s = part === PART.arm ? Math.abs(p[0]) : p[1];
      const ang = g.ang[j * g.cols + i] as number;
      const frontness = part === PART.torso ? Math.cos(ang) : 0;
      const idx = addVertex(m, p, skin, { aInfo: [part, s, frontness, side] }, bodyMorphs(t, p, skin));
      row.push(idx);
      if (i === 0) starts.push(idx);
    }
    ringIndex.push(row);
  }
  return starts;
}

function buildSkinMesh(t: BodyTemplate): MeshData {
  const m = emptyMesh(SKIN_ATTRS, SKIN_MORPHS);
  const C = t.torso.cols;
  // torso: rows ascending y; angle increases toward +x on the front => (a, b, d) outward needs a flip check
  const torsoRings: number[][] = [];
  const ts = emitGrid(m, t, t.torso, PART.torso, 0, false, torsoRings);
  stitchRings(m, ts, C, false);
  capRing(m, torsoRings[torsoRings.length - 1] as number[], t, [0, (t.torso.s[t.torso.rows - 1] as number) + 0.01, 0], PART.torso, false);
  // legs: rows descending y
  const legRingsL: number[][] = [];
  const ls = emitGrid(m, t, t.legL, PART.leg, 1, false, legRingsL);
  stitchRings(m, ls, C, true);
  const legRingsR: number[][] = [];
  const rs = emitGrid(m, t, t.legL, PART.leg, -1, true, legRingsR);
  stitchRings(m, rs, C, false);
  capRing(m, legRingsL[legRingsL.length - 1] as number[], t, null, PART.leg, true);
  capRing(m, legRingsR[legRingsR.length - 1] as number[], t, null, PART.leg, false);
  // arms: rows ascending |x|; angle from +y toward +z
  const armRingsL: number[][] = [];
  const as = emitGrid(m, t, t.armL, PART.arm, 1, false, armRingsL);
  stitchRings(m, as, t.armL.cols, false);
  capRing(m, armRingsL[0] as number[], t, null, PART.arm, true);
  capRing(m, armRingsL[armRingsL.length - 1] as number[], t, null, PART.arm, false);
  const armRingsR: number[][] = [];
  const ars = emitGrid(m, t, t.armL, PART.arm, -1, true, armRingsR);
  stitchRings(m, ars, t.armL.cols, true);
  capRing(m, armRingsR[0] as number[], t, null, PART.arm, false);
  capRing(m, armRingsR[armRingsR.length - 1] as number[], t, null, PART.arm, true);

  const bodyEnd = m.positions.length / 3;
  // normals for the trunk (welds the crotch junction)
  computeSmoothNormals(m, 1e-5, { from: 0, to: bodyEnd });
  // write normals back into the grids (garments offset along them)
  writeBackNormals(m, t.torso, torsoRings);
  writeBackNormals(m, t.legL, legRingsL);
  writeBackNormals(m, t.armL, armRingsL);

  // hands, feet, head
  const handL = buildHand(t, 1);
  appendPart(m, handL);
  appendPart(m, mirrorMesh(handL, (j) => t.boneMirror[j] ?? j, { aInfo: [3] }));
  appendPart(m, buildFeet(t));
  appendPart(m, buildHead(t));
  return m;
}

function appendPart(dst: MeshData, part: MeshData): void {
  const start = dst.positions.length / 3;
  // morph/attr layout of parts matches dst (built with SKIN_ATTRS / SKIN_MORPHS)
  const base = start;
  dst.positions.push(...part.positions);
  dst.normals.push(...part.normals);
  dst.skinIndex.push(...part.skinIndex);
  dst.skinWeight.push(...part.skinWeight);
  for (const [k, a] of Object.entries(dst.attrs)) {
    const src = part.attrs[k];
    const nv = part.positions.length / 3;
    if (src) a.data.push(...src.data); else for (let i = 0; i < nv * a.size; i++) a.data.push(0);
  }
  for (const [k, arr] of Object.entries(dst.morphs)) {
    const src = part.morphs[k];
    if (src) arr.push(...src); else for (let i = 0; i < part.positions.length; i++) arr.push(0);
  }
  for (const i of part.indices) dst.indices.push(i + base);
}

function writeBackNormals(m: MeshData, g: Grid, rings: number[][]): void {
  for (let j = 0; j < g.rows; j++) for (let i = 0; i < g.cols; i++) {
    const v = (rings[j] as number[])[i] as number;
    const k = j * g.cols + i;
    g.nrm[k * 3] = m.normals[v * 3] as number; g.nrm[k * 3 + 1] = m.normals[v * 3 + 1] as number; g.nrm[k * 3 + 2] = m.normals[v * 3 + 2] as number;
  }
}

/** Closes a ring with a fan to its centroid (pushed by `centre` when given). */
function capRing(m: MeshData, ring: number[], t: BodyTemplate, centre: Vec3 | null, part: number, flip: boolean): void {
  let c: Vec3 = [0, 0, 0];
  for (const v of ring) { c = v3.add(c, [m.positions[v * 3] as number, m.positions[v * 3 + 1] as number, m.positions[v * 3 + 2] as number]); }
  c = v3.scale(c, 1 / ring.length);
  if (centre) c = [c[0], centre[1], c[2]];
  const first = ring[0] as number;
  const skin: Skin = { j: [m.skinIndex[first * 4] as number, m.skinIndex[first * 4 + 1] as number, m.skinIndex[first * 4 + 2] as number, m.skinIndex[first * 4 + 3] as number], w: [m.skinWeight[first * 4] as number, m.skinWeight[first * 4 + 1] as number, m.skinWeight[first * 4 + 2] as number, m.skinWeight[first * 4 + 3] as number] };
  const s = part === PART.arm ? Math.abs(c[0]) : c[1];
  const ci = addVertex(m, c, skin, { aInfo: [part, s, 0, Math.sign(c[0])] }, bodyMorphs(t, c, skin));
  const ringStart = ring[0] as number;
  // rings are contiguous in the mesh
  fan(m, ci, ringStart, ring.length, flip);
}

// ---------------------------------------------------------------------------------------------
// Hands (procedural, relaxed pose)
// ---------------------------------------------------------------------------------------------

function buildHand(t: BodyTemplate, side: 1): MeshData {
  const raw = t.raw;
  const m = emptyMesh(SKIN_ATTRS, SKIN_MORPHS);
  const hand = boneIndex(raw, 'hand_l');
  const lower = boneIndex(raw, 'lowerarm_l');
  const W = bonePosition(raw, 'hand_l');
  const fingers = ['index', 'middle', 'ring', 'pinky'] as const;
  const knuckles = fingers.map((f) => bonePosition(raw, `${f}_01_l`));
  const kx = knuckles.reduce((s, k) => s + k[0], 0) / 4;
  const ky = knuckles.reduce((s, k) => s + k[1], 0) / 4;
  const kz = knuckles.reduce((s, k) => s + k[2], 0) / 4;
  const zSpan = Math.abs((knuckles[0] as Vec3)[2] - (knuckles[3] as Vec3)[2]);
  const skinAt = (p: Vec3): Skin => {
    const f = 0.5 * smoothstep(W[0] + 0.012, W[0] - 0.012, p[0]);
    return f > 0.001 ? { j: [hand, lower, 0, 0], w: [1 - f, f, 0, 0] } : rigidSkin(hand);
  };
  const emit = (v: SweepVertex) => addVertex(m, v.p, skinAt(v.p), { aInfo: [PART.hand, Math.abs(v.p[0]), 0, side] }, {}, v.n);
  // palm: a rounded block from inside the forearm to the knuckles; frame X = -z (width), Y = +y (thickness)
  const fingerScale = 0.8;
  const zc = kz;
  const palmPath: Vec3[] = [];
  const prx: number[] = [], pry: number[] = [];
  const start: Vec3 = [W[0] - 0.03, W[1] + 0.002, W[2]];
  const end: Vec3 = [kx - 0.004, ky - 0.002, zc];
  const halfW = (zSpan * 0.7) / 2 + 0.0115;
  for (let k = 0; k <= 6; k++) {
    const u = k / 6;
    const p = v3.lerp(start, end, u);
    p[1] -= 0.003 * Math.sin(u * Math.PI);
    palmPath.push(p);
    prx.push(0.021 + (halfW - 0.021) * smoothstep(0.1, 0.65, u));
    pry.push(0.016 - 0.0035 * smoothstep(0.3, 1, u));
  }
  sweep(m, { path: palmPath, rx: prx, ry: pry, segments: 12, exponent: 3.2, up: [0, 1, 0], capStart: 0, capEnd: 2 }, emit);
  // fingers: relaxed curl, gathered slightly toward the middle finger
  const radius = { index: 0.0099, middle: 0.0103, ring: 0.0097, pinky: 0.0086 };
  fingers.forEach((f, fi) => {
    const b1 = knuckles[fi] as Vec3;
    const b2 = bonePosition(raw, `${f}_02_l`);
    const b3 = bonePosition(raw, `${f}_03_l`);
    const b4 = bonePosition(raw, `${f}_04_leaf_l`);
    const lens = [v3.len(v3.sub(b2, b1)), v3.len(v3.sub(b3, b2)), v3.len(v3.sub(b4, b3)) * 0.9].map((l) => l * fingerScale);
    const curls = [0.22, 0.42, 0.34];
    const spread = (b1[2] - zc) * 0.68;
    let p: Vec3 = [b1[0] - 0.012, ky - 0.002, zc + spread];
    const path: Vec3[] = [p];
    let ang = 0;
    for (let s2 = 0; s2 < 3; s2++) {
      ang += curls[s2] as number;
      const dir: Vec3 = [Math.cos(ang), -Math.sin(ang), 0];
      const half = v3.madd(p, dir, (lens[s2] as number) / 2);
      p = v3.madd(p, dir, lens[s2] as number);
      path.push(half, p);
    }
    const r0 = radius[f];
    const rx = path.map((_, k) => r0 * (1 - 0.18 * (k / (path.length - 1))));
    sweep(m, { path, rx, ry: rx.map((r) => r * 0.9), segments: 7, up: [0, 1, 0], capStart: 0, capEnd: 2 }, emit);
  });
  // thumb: from the heel of the palm, resting along the index finger
  const front = zc + halfW - 0.004;
  const tb: Vec3 = [W[0] + 0.004, W[1] - 0.004, W[2] + 0.01];
  const tj: Vec3 = [W[0] + 0.03, W[1] - 0.014, front - 0.002];
  const d1 = v3.norm([0.78, -0.42, 0.3]);
  const d2 = v3.norm([0.92, -0.38, 0.02]);
  const tm = v3.madd(tj, d1, 0.032);
  const tt = v3.madd(tm, d2, 0.028);
  const thumbPath: Vec3[] = [tb, v3.lerp(tb, tj, 0.5), tj, v3.lerp(tj, tm, 0.5), tm, v3.lerp(tm, tt, 0.5), tt];
  const trx = [0.014, 0.0138, 0.0128, 0.0115, 0.0108, 0.0102, 0.0094];
  sweep(m, { path: thumbPath, rx: trx, ry: trx.map((r) => r * 0.88), segments: 9, up: [0, 1, 0], capStart: 1, capEnd: 2 }, emit);
  computeSmoothNormals(m, 1e-6);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Feet (from the source mesh)
// ---------------------------------------------------------------------------------------------

function buildFeet(t: BodyTemplate): MeshData {
  const raw = t.raw;
  const m = emptyMesh(SKIN_ATTRS, SKIN_MORPHS);
  const names = raw.boneNames;
  const keep = new Map<number, number>();
  const isFoot = (v: number) => /^(foot|ball)_[lr]$/.test(names[t.transfer.dominant[v] as number] as string);
  for (let tri = 0; tri < raw.index.length; tri += 3) {
    const a = raw.index[tri] as number, b = raw.index[tri + 1] as number, c = raw.index[tri + 2] as number;
    if (!isFoot(a) || !isFoot(b) || !isFoot(c)) continue;
    const ids = [a, b, c].map((v) => {
      let id = keep.get(v);
      if (id === undefined) {
        const p: Vec3 = [raw.positions[v * 3] as number, raw.positions[v * 3 + 1] as number, raw.positions[v * 3 + 2] as number];
        const skin: Skin = {
          j: [raw.joints[v * 4] as number, raw.joints[v * 4 + 1] as number, raw.joints[v * 4 + 2] as number, raw.joints[v * 4 + 3] as number],
          w: [raw.weights[v * 4] as number, raw.weights[v * 4 + 1] as number, raw.weights[v * 4 + 2] as number, raw.weights[v * 4 + 3] as number],
        };
        id = addVertex(m, p, skin, { aInfo: [PART.foot, p[1], 0, Math.sign(p[0])] });
        keep.set(v, id);
      }
      return id;
    });
    addTri(m, ids[0] as number, ids[1] as number, ids[2] as number);
  }
  computeSmoothNormals(m, 0.004);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Head (sculpted surface + ears)
// ---------------------------------------------------------------------------------------------

/** Skin of a head-local point: Head bone, blending into the neck below the jaw. */
export function headSkin(raw: RawBody, local: Vec3): Skin {
  const head = boneIndex(raw, 'Head');
  const neck = boneIndex(raw, 'neck_01');
  const f = 0.55 * smoothstep(0.012, -0.035, local[1]) * (local[2] < 0.03 ? 1 : 0.6);
  return f > 0.001 ? { j: [head, neck, 0, 0], w: [1 - f, f, 0, 0] } : rigidSkin(head);
}

function headMorphs(p: Vec3, theta: number): Record<string, Vec3> {
  const d = headDeltas(p, theta) as unknown as Record<string, Vec3>;
  for (const k of Object.keys(d)) d[k] = v3.scale(d[k] as Vec3, HEAD_SCALE);
  return d;
}

export const HEAD_COLS = 40;

function buildHead(t: BodyTemplate): MeshData {
  const m = emptyMesh(SKIN_ATTRS, SKIN_MORPHS);
  const O = t.headOrigin;
  const cols = headColumns(HEAD_COLS);
  const rows = headRows();
  const starts: number[] = [];
  for (const h of rows) {
    cols.forEach((th, c) => {
      const p = headPoint(th, h);
      const idx = addVertex(m, headToBind(O, p), headSkin(t.raw, p), { aInfo: [PART.head, p[1], Math.cos(th), Math.sign(p[0])], aFace: p }, headMorphs(p, th));
      if (c === 0) starts.push(idx);
    });
  }
  // rows ascend in y, columns go back(-x) -> front -> back(+x): (a, b, d) faces outward
  stitchRings(m, starts, HEAD_COLS, false);
  const top = headPoint(0, H_MAX);
  const ti = addVertex(m, headToBind(O, top), headSkin(t.raw, top), { aInfo: [PART.head, top[1], 0, 0], aFace: top }, headMorphs(top, 0));
  fan(m, ti, starts[starts.length - 1] as number, HEAD_COLS, false);
  const bot: Vec3 = [0, H_MIN - 0.004, -0.004];
  const bi = addVertex(m, headToBind(O, bot), headSkin(t.raw, bot), { aInfo: [PART.head, bot[1], 0, 0], aFace: bot }, {});
  fan(m, bi, starts[0] as number, HEAD_COLS, true);
  computeSmoothNormals(m, 1e-6);
  // ears
  const ear = buildEar(t);
  const earR = mirrorMesh(ear, (j) => t.boneMirror[j] ?? j, { aFace: [0], aInfo: [3] });
  for (const e of [ear, earR]) {
    const base = m.positions.length / 3;
    m.positions.push(...e.positions); m.normals.push(...e.normals); m.skinIndex.push(...e.skinIndex); m.skinWeight.push(...e.skinWeight);
    for (const [k, a] of Object.entries(m.attrs)) a.data.push(...(e.attrs[k]?.data ?? []));
    for (const [k, arr] of Object.entries(m.morphs)) arr.push(...(e.morphs[k] ?? new Array(e.positions.length).fill(0)));
    for (const i of e.indices) m.indices.push(i + base);
  }
  return m;
}

function buildEar(t: BodyTemplate): MeshData {
  const m = emptyMesh(SKIN_ATTRS, SKIN_MORPHS);
  const O = t.headOrigin;
  const U = 16, V = 10;
  const starts: number[] = [];
  const skin = rigidSkin(boneIndex(t.raw, 'Head'));
  for (let vi = 1; vi < V; vi++) {
    const v = (vi / V) * Math.PI;
    for (let ui = 0; ui < U; ui++) {
      const u = (ui / U) * Math.PI * 2;
      const e = earPoint(u, v);
      const grow = v3.scale(v3.sub(e.p, e.anchor), 0.24 * HEAD_SCALE);
      const idx = addVertex(m, headToBind(O, e.p), skin, { aInfo: [PART.ear, e.p[1], e.inner, 1], aFace: e.p }, { earSize: grow });
      if (ui === 0) starts.push(idx);
    }
  }
  stitchRings(m, starts, U, true);
  const outerPole = earPoint(0, 0);
  const innerPole = earPoint(0, Math.PI);
  const a = addVertex(m, headToBind(O, outerPole.p), skin, { aInfo: [PART.ear, outerPole.p[1], 1, 1], aFace: outerPole.p }, { earSize: v3.scale(v3.sub(outerPole.p, outerPole.anchor), 0.24 * HEAD_SCALE) });
  fan(m, a, starts[0] as number, U, false);
  const b = addVertex(m, headToBind(O, innerPole.p), skin, { aInfo: [PART.ear, innerPole.p[1], 0, 1], aFace: innerPole.p }, { earSize: v3.scale(v3.sub(innerPole.p, innerPole.anchor), 0.24 * HEAD_SCALE) });
  fan(m, b, starts[starts.length - 1] as number, U, true);
  computeSmoothNormals(m, 1e-6);
  return m;
}
