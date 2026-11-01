// Milestone 3 wardrobe content in 3D: every garment and accessory builds on both body frames in both character styles,
// stays near the body, is distinct from the others, hats stand off the skull so squeezed hair stays hidden, and the hat fit
// leaves hair below the band alone.
import { beforeAll, describe, expect, it } from 'vitest';
import { ACCESSORIES, GARMENTS, HAIR } from '../../../src/content/character';
import { buildAccessory } from '../../../src/characters/accessories';
import { buildGarment } from '../../../src/characters/clothing';
import { buildHair } from '../../../src/characters/hair';
import { HeadMap } from '../../../src/characters/headMap';
import { CROWN_Y, HEAD_OFFSET, HEAD_SCALE, headBasePoint } from '../../../src/characters/headShape';
import { HAT_FIT, SKULL_MARGIN, Y_LOW, addHatFit, skullRadius, squeezeToSkull } from '../../../src/characters/hatFit';
import type { Vec3 } from '../../../src/characters/rig';
import { buildBodyTemplate } from '../../../src/characters/template';
import type { BodyTemplate } from '../../../src/characters/template';
import { loadMeshyBody, loadRawBody } from './loadRaw';

type Key = 'a' | 'b' | 'classic' | 'classic-b';
const bodies = {} as Record<Key, BodyTemplate>;

beforeAll(async () => {
  for (const f of ['a', 'b'] as const) {
    const m = await loadMeshyBody(f);
    const t = buildBodyTemplate(m.raw, { stylise: false, skinParts: false });
    t.headMap = new HeadMap(m.extras.head, t.headOrigin);
    bodies[f] = t;
  }
  bodies.classic = buildBodyTemplate(await loadRawBody('a'));
  bodies['classic-b'] = buildBodyTemplate(await loadRawBody('b'));
}, 180_000);

const ready = GARMENTS.filter((g) => g.status === 'ready');

describe('Milestone 3 content minimums', () => {
  it('has at least 48 distinct garments with the catalog spread of the brief', () => {
    expect(ready.length).toBeGreaterThanOrEqual(48);
    const byLayer = (l: string) => ready.filter((g) => g.layer === l).length;
    expect(byLayer('top')).toBeGreaterThanOrEqual(12);
    expect(byLayer('bottom')).toBeGreaterThanOrEqual(12);
    expect(byLayer('full')).toBeGreaterThanOrEqual(8);
    expect(byLayer('outer')).toBeGreaterThanOrEqual(5);
    expect(byLayer('shoes')).toBeGreaterThanOrEqual(9);
    for (const cat of ['everyday', 'formal', 'work', 'athletic', 'sleep', 'swim'] as const) {
      expect(ready.filter((g) => g.categories.includes(cat)).length, cat).toBeGreaterThanOrEqual(6);
    }
    expect(new Set(ready.map((g) => g.name)).size).toBe(ready.length);
    expect(new Set(ready.map((g) => JSON.stringify(g.build))).size).toBe(ready.length);
    for (const g of ready) {
      expect(g.description.length, g.id).toBeGreaterThan(20);
      if (g.defaultPattern) expect(g.patterns, g.id).toContain(g.defaultPattern);
    }
  });

  it('has at least 12 accessories of at least 6 kinds, each recolourable', () => {
    const list = ACCESSORIES.filter((a) => a.status === 'ready');
    expect(list.length).toBeGreaterThanOrEqual(12);
    expect(new Set(list.map((a) => a.kind)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(list.map((a) => a.name)).size).toBe(list.length);
    for (const a of list) expect(a.defaultColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('has at least 24 hairstyles', () => { expect(HAIR.filter((h) => h.status === 'ready').length).toBeGreaterThanOrEqual(24); });
});

describe.each(['a', 'b', 'classic', 'classic-b'] as const)('garments on body %s', (key) => {
  it('builds every garment as a finite, bounded, indexed mesh with sane coverage', { timeout: 120_000 }, () => {
    const t = bodies[key];
    for (const g of ready) {
      const r = buildGarment(t, g);
      const n = r.mesh.positions.length / 3;
      expect(n, g.id).toBeGreaterThan(30);
      expect(r.mesh.indices.length % 3, g.id).toBe(0);
      expect(r.mesh.indices.length / 3, `${g.id} triangles`).toBeLessThan(45_000);
      for (const v of r.mesh.positions) if (!Number.isFinite(v)) throw new Error(`${g.id}: non-finite position`);
      for (const i of r.mesh.indices) if (i >= n) throw new Error(`${g.id}: bad index`);
      let minY = Infinity, maxY = -Infinity, maxX = 0, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < n; i++) {
        const x = Math.abs(r.mesh.positions[i * 3] as number), y = r.mesh.positions[i * 3 + 1] as number, z = r.mesh.positions[i * 3 + 2] as number;
        minY = Math.min(minY, y); maxY = Math.max(maxY, y); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
      expect(minY, `${g.id} minY`).toBeGreaterThan(-0.05);
      expect(maxY, `${g.id} maxY`).toBeLessThan(t.lm.headY + 0.1);
      expect(maxX, `${g.id} maxX`).toBeLessThan(t.lm.wristX + 0.15);
      expect(minZ, `${g.id} minZ`).toBeGreaterThan(-0.45);
      expect(maxZ, `${g.id} maxZ`).toBeLessThan(0.5);
      for (const group of [r.cuts.neck, r.cuts.arm, r.cuts.misc, r.cuts.hem, r.cuts.inner]) for (const v of group) expect(Number.isFinite(v), `${g.id} cuts`).toBe(true);
      const c = r.coverage;
      if (c.torso) {
        expect(c.torso.yMaxBack, g.id).toBeGreaterThan(c.torso.yMin);
        // the skin under a garment is hidden from its hem up (a crop top ends below the chest)
        expect(c.torso.yMin, g.id).toBeLessThan(t.lm.chestY);
      }
      if (g.build.shape === 'pants' || ['jumpsuit', 'suit', 'overalls', 'unitard'].includes(g.id)) expect(c.legMinY, `${g.id} legs`).toBeLessThan(10);
    }
  });

  it('gives each garment a silhouette of its own (bounding box and size differ from every other garment of its layer)', { timeout: 120_000 }, () => {
    const t = bodies[key];
    const sig = new Map<string, string>();
    for (const g of ready) {
      const r = buildGarment(t, g);
      const p = r.mesh.positions;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < p.length; i += 3) { x0 = Math.min(x0, p[i] as number); x1 = Math.max(x1, p[i] as number); y0 = Math.min(y0, p[i + 1] as number); y1 = Math.max(y1, p[i + 1] as number); z0 = Math.min(z0, p[i + 2] as number); z1 = Math.max(z1, p[i + 2] as number); }
      const s = [g.layer, ...[x1 - x0, y1 - y0, z1 - z0].map((v) => Math.round(v * 200)), p.length / 3].join('|');
      expect(sig.has(s), `${g.id} has the same silhouette as ${sig.get(s)}`).toBe(false);
      sig.set(s, g.id);
    }
  });
});

describe.each(['a', 'b', 'classic', 'classic-b'] as const)('accessories on body %s', (key) => {
  it('builds every accessory as a finite mesh near its anchor', { timeout: 120_000 }, () => {
    const t = bodies[key];
    for (const a of ACCESSORIES) {
      const m = buildAccessory(t, a);
      const n = m.positions.length / 3;
      expect(n, a.id).toBeGreaterThan(20);
      expect(m.indices.length / 3, `${a.id} triangles`).toBeLessThan(12_000);
      for (const v of m.positions) if (!Number.isFinite(v)) throw new Error(`${a.id}: non-finite`);
      for (const i of m.indices) if (i >= n) throw new Error(`${a.id}: bad index`);
      expect(m.attrs.color?.data.length, `${a.id} colour attribute`).toBe(n * 3);
      let y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < n; i++) { y0 = Math.min(y0, m.positions[i * 3 + 1] as number); y1 = Math.max(y1, m.positions[i * 3 + 1] as number); }
      if (a.kind === 'hat' || a.kind === 'glasses' || a.kind === 'earrings') { expect(y0, a.id).toBeGreaterThan(t.headOrigin[1] - 0.12); expect(y1, a.id).toBeLessThan(t.headOrigin[1] + 0.4); }
      if (a.kind === 'scarf' || a.kind === 'necklace') { expect(y0, a.id).toBeGreaterThan(t.lm.waistY); expect(y1, a.id).toBeLessThan(t.headOrigin[1] + 0.02); }
      if (a.kind === 'watch' || a.kind === 'bracelet') expect(y0, a.id).toBeGreaterThan(t.lm.shoulderY - 0.25);
    }
  });
});

/** Local (head-space) point of a bind point on the classic template (hats are built there). */
const toLocal = (t: BodyTemplate, p: ArrayLike<number>): Vec3 => [
  ((p[0] as number) - t.headOrigin[0] - HEAD_OFFSET[0]) / HEAD_SCALE, ((p[1] as number) - t.headOrigin[1] - HEAD_OFFSET[1]) / HEAD_SCALE, ((p[2] as number) - t.headOrigin[2] - HEAD_OFFSET[2]) / HEAD_SCALE,
];

describe('hats and hair', () => {
  it('hats stand off the skull by more than the squeezed hair keeps, so hair stays hidden inside', { timeout: 120_000 }, () => {
    const t = bodies.classic;
    // skull samples
    const skull: Vec3[] = [];
    for (let i = 0; i < 90; i++) for (let j = 0; j < 80; j++) skull.push(headBasePoint(-Math.PI + (Math.PI * 2 * i) / 90, -0.04 + (0.29 * j) / 79));
    for (const a of ACCESSORIES.filter((x) => x.kind === 'hat' && x.build.style !== 'headband')) {
      const m = buildAccessory(t, a);
      let worst = Infinity;
      for (let i = 0; i < m.positions.length; i += 3) {
        const l = toLocal(t, [m.positions[i] as number, m.positions[i + 1] as number, m.positions[i + 2] as number]);
        if (l[1] < Y_LOW + 0.045) continue; // below the hair squeeze band the hat may touch the hair
        let d = Infinity;
        for (const s of skull) d = Math.min(d, Math.hypot(l[0] - s[0], l[1] - s[1], l[2] - s[2]));
        worst = Math.min(worst, d);
      }
      expect(worst, a.id).toBeGreaterThan(SKULL_MARGIN + 0.0008); // the inner lip of a rim is the closest point, the crown stands off further
    }
  });

  it('squeezes hair above the band onto the skull and leaves hair below it alone', () => {
    expect(squeezeToSkull([0.05, Y_LOW - 0.01, 0.1])).toEqual([0.05, Y_LOW - 0.01, 0.1]);
    for (const p of [[0.0, 0.3, 0.0], [0.08, 0.2, 0.12], [-0.12, 0.17, -0.1], [0.0, 0.12, 0.2], [0.1, 0.25, -0.2]] as Vec3[]) {
      const q = squeezeToSkull(p);
      expect(q[1]).toBeLessThanOrEqual(CROWN_Y + SKULL_MARGIN + 1e-9);
      const R = skullRadius(Math.min(q[1], CROWN_Y - 0.004), Math.atan2(q[0], q[2])) + SKULL_MARGIN;
      expect(Math.hypot(q[0], q[2])).toBeLessThanOrEqual(R + 1e-6);
      // squeezing twice changes nothing more
      const q2 = squeezeToSkull(q);
      expect(Math.hypot(q2[0] - q[0], q2[1] - q[1], q2[2] - q[2])).toBeLessThan(1e-6);
    }
  });

  it.each(['classic', 'a'] as const)('hair meshes get a hatFit morph that pulls tall hair down and keeps low hair', (key) => {
    const t = bodies[key];
    const tall = HAIR.find((h) => h.id === 'afro-coily')!;
    const mesh = buildHair(t, tall, null);
    addHatFit(t, mesh);
    const d = mesh.morphs[HAT_FIT]!;
    expect(d.length).toBe(mesh.positions.length);
    let moved = 0, topBefore = -Infinity, topAfter = -Infinity;
    for (let i = 0; i < mesh.positions.length / 3; i++) {
      const y = mesh.positions[i * 3 + 1] as number;
      topBefore = Math.max(topBefore, y); topAfter = Math.max(topAfter, y + (d[i * 3 + 1] as number));
      if (Math.hypot(d[i * 3] as number, d[i * 3 + 1] as number, d[i * 3 + 2] as number) > 1e-5) moved++;
      // hair below the chin line (hanging) never moves
      if (y < t.headOrigin[1] - 0.05) expect(Math.hypot(d[i * 3] as number, d[i * 3 + 1] as number, d[i * 3 + 2] as number)).toBeLessThan(1e-9);
    }
    expect(moved).toBeGreaterThan(50);
    expect(topAfter).toBeLessThan(topBefore - 0.02);
    // a style that hugs the head barely changes
    const buzz = buildHair(t, HAIR.find((h) => h.id === 'buzz')!, null);
    addHatFit(t, buzz);
    const db = buzz.morphs[HAT_FIT]!;
    let maxBuzz = 0;
    for (let i = 0; i < db.length; i++) maxBuzz = Math.max(maxBuzz, Math.abs(db[i] as number));
    expect(maxBuzz).toBeLessThan(0.02);
  });
});
