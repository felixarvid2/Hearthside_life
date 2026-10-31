import { beforeAll, describe, expect, it } from 'vitest';
import { BODY_PARAMS, FACIAL_HAIR, GARMENTS, HAIR, ACCESSORIES } from '../../../src/content/character';
import { BODY_PARAM_IDS, bodyDeltas, clampBodyParams } from '../../../src/characters/bodyShape';
import { fitProfile, hullRadii, sampleProfile } from '../../../src/characters/fit';
import { HEAD_SCULPT_IDS, headDeltas, headPoint, headRows, headColumns, H_MAX } from '../../../src/characters/headShape';
import { buildBodyTemplate, legPoint } from '../../../src/characters/template';
import type { BodyTemplate } from '../../../src/characters/template';
import { buildGarment, mergeCoverage } from '../../../src/characters/clothing';
import { buildHair, hairlineY } from '../../../src/characters/hair';
import { buildAccessory } from '../../../src/characters/accessories';
import type { MeshData } from '../../../src/characters/meshData';
import { SkinTransfer, armTest, trunkTest } from '../../../src/characters/skinTransfer';
import { lyingPlacement, seatedPlacement, POSTURE_ANCHORS } from '../../../src/characters/posture';
import { loadRawBody } from './loadRaw';

function finiteMesh(m: MeshData): void {
  expect(m.indices.length).toBeGreaterThan(0);
  const n = m.positions.length / 3;
  let bad = 0;
  for (const v of m.positions) if (!Number.isFinite(v)) bad++;
  for (const v of m.normals) if (!Number.isFinite(v)) bad++;
  for (const i of m.indices) if (i >= n) bad++;
  for (let i = 0; i < n; i++) {
    const s = (m.skinWeight[i * 4] as number) + (m.skinWeight[i * 4 + 1] as number) + (m.skinWeight[i * 4 + 2] as number) + (m.skinWeight[i * 4 + 3] as number);
    if (Math.abs(s - 1) > 1e-3) bad++;
  }
  let maxDelta = 0;
  for (const d of Object.values(m.morphs)) { if (d.length !== n * 3) bad++; for (const v of d) maxDelta = Math.max(maxDelta, Math.abs(v)); }
  expect(bad).toBe(0);
  expect(maxDelta).toBeLessThan(0.08);
}

describe('pure helpers', () => {
  it('clamps body params to their ranges and drops unknown ids', () => {
    const out = clampBodyParams({ build: 3, waist: -7, nonsense: 1, hips: Number.NaN }, BODY_PARAMS);
    expect(out.build).toBe(1);
    expect(out.waist).toBe(-1);
    expect(out.hips).toBe(0);
    expect('nonsense' in out).toBe(false);
    expect(Object.keys(out).sort()).toEqual([...BODY_PARAM_IDS].sort());
  });

  it('fits a radial profile to a cylinder and bridges concave rings with the hull', () => {
    const pts: number[] = [];
    for (let y = 0; y <= 1; y += 0.02) for (let a = 0; a < 64; a++) pts.push(Math.sin((a / 64) * Math.PI * 2) * 0.1, y, Math.cos((a / 64) * Math.PI * 2) * 0.1 + 0.05);
    const ids = Array.from({ length: pts.length / 3 }, (_, i) => i);
    const prof = fitProfile(pts, ids, 'y', 0.1, 0.9, { rows: 9 });
    for (const a of [0, 1, 2.5, 4]) {
      const q = sampleProfile(prof, 0.5, a);
      expect(q.r).toBeGreaterThan(0.095);
      expect(q.r).toBeLessThan(0.106);
      expect(q.cb).toBeCloseTo(0.05, 2);
    }
    // a star with a dent: hull radius of the dent equals the chord, not the dent
    const ring: Array<[number, number]> = [[1, 0], [0.7, 0.7], [0, 0.2], [-0.7, 0.7], [-1, 0], [0, -1]];
    const hr = hullRadii(ring, 0, 0);
    expect(hr[2]).toBeCloseTo(0.7, 5);
    expect(hr[0]).toBeCloseTo(1, 5);
  });

  it('head sculpt deltas stay bounded and leave the scalp still (hair stays attached)', () => {
    for (const h of headRows()) for (const th of headColumns(24)) {
      const p = headPoint(th, h);
      const d = headDeltas(p, th);
      for (const id of HEAD_SCULPT_IDS) {
        const l = Math.hypot(...d[id]);
        expect(l).toBeLessThan(0.016);
        if (p[1] > 0.17) expect(l).toBeLessThan(1e-3);
      }
    }
    expect(headPoint(0, H_MAX)[1]).toBeGreaterThan(0.2);
  });

  it('hairline wraps above the ears and down to the nape', () => {
    expect(hairlineY(0, 'natural', 0)).toBeGreaterThan(0.14);
    expect(hairlineY(Math.PI / 2, 'natural', 0)).toBeGreaterThan(0.1);
    expect(hairlineY(Math.PI, 'natural', 0)).toBeLessThan(0.02);
    expect(hairlineY(0, 'fringe', 1)).toBeLessThan(hairlineY(0, 'natural', 0) - 0.03);
  });

  it('posture placement puts the seat contact on the anchor', () => {
    const p = seatedPlacement({ x: 2, y: 0.5, z: 3 }, Math.PI / 2);
    // facing +x: the buttocks are 0.18 m behind the root along -x
    expect(p.x + Math.sin(p.yaw) * POSTURE_ANCHORS.seated.seatZ).toBeCloseTo(2, 6);
    expect(p.y).toBeCloseTo(0.5 - POSTURE_ANCHORS.seated.seatHeight, 6);
    const l = lyingPlacement({ x: 0, y: 0.5, z: 0 }, 0);
    expect(l.z + POSTURE_ANCHORS.lying.centerZ).toBeCloseTo(0, 6);
    expect(l.y).toBeCloseTo(0.54, 6);
  });
});

describe.each(['a', 'b'] as const)('body template frame %s (real asset)', (frame) => {
  let t: BodyTemplate;
  beforeAll(async () => { t = buildBodyTemplate(await loadRawBody(frame)); }, 60000);

  it('builds a finite skin mesh with all morph targets', { timeout: 30000 }, () => {
    finiteMesh(t.skinMesh);
    const tris = t.skinMesh.indices.length / 3;
    expect(tris).toBeGreaterThan(5000);
    expect(tris).toBeLessThan(14000);
  });

  it('closes the crotch junction exactly and keeps the torso symmetric', () => {
    const C = t.torso.cols, M = t.M;
    for (let i = 0; i <= M; i++) {
      const a = legPoint(t.torso, 0, i), b = legPoint(t.legL, 0, i);
      for (let k = 0; k < 3; k++) expect(a[k]).toBeCloseTo(b[k] as number, 6);
    }
    for (let j = 0; j < t.torso.rows; j++) for (let i = 1; i < M; i++) {
      const a = legPoint(t.torso, j, i), b = legPoint(t.torso, j, C - i);
      expect(a[0]).toBeCloseTo(-b[0], 6);
      expect(a[2]).toBeCloseTo(b[2], 6);
    }
    // crotch line on the centre plane
    for (let i = M; i < C; i++) expect(legPoint(t.legL, 0, i)[0]).toBeCloseTo(0, 6);
  });

  it('keeps body morphs bounded over the full range', () => {
    const m = t.skinMesh;
    for (const id of BODY_PARAM_IDS) {
      const d = m.morphs[id]!;
      let max = 0;
      for (let i = 0; i < d.length; i += 3) max = Math.max(max, Math.hypot(d[i]!, d[i + 1]!, d[i + 2]!));
      expect(max, id).toBeGreaterThan(0.002);
      expect(max, id).toBeLessThan(0.06);
    }
    // the same field drives clothing: a point and its skin give identical deltas wherever evaluated
    const k = 5 * t.torso.cols + 3;
    const p = legPoint(t.torso, 5, 3);
    const d1 = bodyDeltas(t.ctx, p, t.torso.skin[k]!);
    const d2 = bodyDeltas(t.ctx, [...p], t.torso.skin[k]!);
    expect(d1.waist).toEqual(d2.waist);
  });

  it('selects skin regions by side (no cross-body weights)', () => {
    const tr = new SkinTransfer(t.raw);
    const left = tr.skinAt([0.09, 0.6, 0], tr.boneFilter(trunkTest(1)));
    for (let q = 0; q < 4; q++) if (left.w[q]! > 0.01) expect(t.raw.boneNames[left.j[q]!]).not.toMatch(/_r$/);
    const arm = tr.skinAt([0.4, 1.44, -0.07], tr.boneFilter(armTest(1)));
    expect(t.raw.boneNames[arm.j[0]]).toMatch(/arm_l$/);
  });

  it('builds every garment as a finite shell with sensible coverage', { timeout: 60000 }, () => {
    const covers = [];
    for (const g of GARMENTS) {
      const built = buildGarment(t, g);
      finiteMesh(built.mesh);
      covers.push(built.coverage);
      if (g.layer === 'shoes') expect(built.coverage.torso).toBeNull();
      else if (g.layer !== 'outer') expect(built.coverage.torso).not.toBeNull();
      if (g.layer === 'bottom' && g.build.shape === 'pants') expect(built.coverage.legMinY).toBeLessThan(t.lm.crotchY);
      // garments lie outside the body: shells are offset outward from the fitted surface
      let lo = Infinity, hi = -Infinity;
      for (let i = 1; i < built.mesh.positions.length; i += 3) { lo = Math.min(lo, built.mesh.positions[i]!); hi = Math.max(hi, built.mesh.positions[i]!); }
      expect(lo).toBeGreaterThan(-0.02);
      expect(hi).toBeLessThan(1.7);
    }
    const merged = mergeCoverage(covers);
    expect(merged.armMaxX).toBeGreaterThan(t.lm.elbowX);
  });

  it('builds every hairstyle, facial hair and accessory', { timeout: 60000 }, () => {
    for (const h of HAIR) {
      const m = buildHair(t, h, null);
      finiteMesh(m);
      // long styles stay behind the back below the shoulders
      for (let i = 0; i < m.positions.length; i += 3) {
        const y = m.positions[i + 1]!, z = m.positions[i + 2]!;
        if (y < t.lm.neckBaseY - 0.05 && z > -0.1) throw new Error(`${h.id} hangs in front of the shoulders`);
      }
    }
    for (const f of FACIAL_HAIR.filter((x) => x.build.kind === 'shell')) finiteMesh(buildHair(t, null, f));
    for (const a of ACCESSORIES) finiteMesh(buildAccessory(t, a));
  });
});
