// Garments fitted to the scanned Meshy bodies: necklines and strap lines follow the body's own shoulder slope (not a fixed
// height cut for the narrower classic body), open ends carry a rolled rim, and the triangle budget stays bounded.
import { beforeAll, describe, expect, it } from 'vitest';
import { GARMENTS } from '../../../src/content/character';
import { buildGarment, halfWidthAt, heightAtHalfWidth } from '../../../src/characters/clothing';
import { buildBodyTemplate } from '../../../src/characters/template';
import type { BodyTemplate } from '../../../src/characters/template';
import { loadMeshyBody, loadRawBody } from './loadRaw';

const bodies = {} as Record<'a' | 'b' | 'classic' | 'classic-b', BodyTemplate>;

beforeAll(async () => {
  for (const f of ['a', 'b'] as const) {
    const m = await loadMeshyBody(f);
    bodies[f] = buildBodyTemplate(m.raw, { stylise: false, skinParts: false });
  }
  bodies.classic = buildBodyTemplate(await loadRawBody('a'));
  bodies['classic-b'] = buildBodyTemplate(await loadRawBody('b'));
}, 120_000);

describe.each(['a', 'b', 'classic', 'classic-b'] as const)('garment fit on body %s', (f) => {
  it('puts the neck opening where the torso has narrowed to the neck, on the shoulder slope', () => {
    const t = bodies[f];
    for (const [id, hw] of [['tee-crew', 0.095], ['polo-shirt', 0.088], ['sweater-knit', 0.095]] as const) {
      const g = GARMENTS.find((x) => x.id === id)!;
      const b = buildGarment(t, g);
      const y = b.cuts.neck[0];
      expect(halfWidthAt(t, y), id).toBeGreaterThan(hw - 0.012);
      expect(halfWidthAt(t, y), id).toBeLessThan(hw + 0.012);
      // above the shoulders, below the head
      expect(y).toBeGreaterThan(t.lm.shoulderY + 0.04);
      expect(y).toBeLessThan(t.lm.headY + 0.04);
      // body hidden under the garment reaches up to the opening
      expect(b.coverage.torso!.yMaxBack).toBeCloseTo(y, 5);
    }
  });

  it('keeps straps of sleeveless tops on the shoulder, inside the shoulder width', () => {
    const t = bodies[f];
    const sh = halfWidthAt(t, t.lm.shoulderY + 0.03);
    for (const id of ['tank-top', 'sundress', 'swimsuit']) {
      const b = buildGarment(t, GARMENTS.find((x) => x.id === id)!);
      expect(b.cuts.arm[3], id).toBeGreaterThan(0);
      expect(b.cuts.arm[1], id).toBeGreaterThan(0.3 * sh);
      expect(b.cuts.arm[2], id).toBeLessThan(sh);
      expect(b.cuts.arm[2], id).toBeGreaterThan(b.cuts.arm[1]);
      // the back of the opening stays at the shoulders, never down the torso (a target wider than the body must not run away)
      if (id !== 'sundress') expect(b.cuts.neck[0], id).toBeGreaterThan(t.lm.shoulderY); // the sundress has a square bodice line
    }
  });

  it('measures the neck line on the torso monotonically', () => {
    const t = bodies[f];
    let prev = Infinity;
    for (const hw of [0.07, 0.09, 0.11, 0.13, 0.15]) {
      const y = heightAtHalfWidth(t, hw);
      expect(y).toBeLessThan(prev);
      prev = y;
    }
  });

  it('rolls hems, cuffs and sleeve ends into a rim and stays within the triangle budget', { timeout: 60_000 }, () => {
    const t = bodies[f];
    let total = 0;
    for (const g of GARMENTS) {
      const b = buildGarment(t, g);
      const tris = b.mesh.indices.length / 3;
      total += tris;
      expect(tris, g.id).toBeLessThan(9500); // the three-piece suit is the largest garment: jacket, shirt and trousers
      // the rim rings are extra geometry: a tee has more triangles than the same shell would without them
      for (let i = 0; i < b.mesh.positions.length; i++) expect(Number.isFinite(b.mesh.positions[i]!), g.id).toBe(true);
    }
    expect(total).toBeLessThan(200000); // 54 garments; one worn outfit is a handful of them
    const tee = buildGarment(t, GARMENTS.find((x) => x.id === 'tee-crew')!);
    const shorts = buildGarment(t, GARMENTS.find((x) => x.id === 'shorts-casual')!);
    // lowest tee vertex is below the hem line used by the cut parameters (the rim hangs 2 x rho below it)
    let lo = Infinity;
    for (let i = 1; i < tee.mesh.positions.length; i += 3) lo = Math.min(lo, tee.mesh.positions[i]!);
    expect(lo).toBeLessThan(tee.cuts.hem[0] - 0.001);
    let loS = Infinity;
    for (let i = 1; i < shorts.mesh.positions.length; i += 3) loS = Math.min(loS, shorts.mesh.positions[i]!);
    expect(loS).toBeLessThan(shorts.cuts.hem[2] - 0.001);
  });
});
