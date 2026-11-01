import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { content } from '../../../src/content/index';
import { MODEL_BOUNDS, OBJECTS, fittedBounds } from '../../../src/content/objects';
import { INTERACTIONS } from '../../../src/content/interactions';
import { TRAITS, describeTraitEffects } from '../../../src/content/traits';
import { RECIPES, RECIPE_FOOD_TAGS } from '../../../src/content/recipes';
import { M1_OBJECTS, validateContent, type ManifestModel } from '../../../src/content/validate';
import { blockingTiles, rotateCell, rotateLocal, rotatedSize } from '../../../src/core/geometry';
import type { Rot } from '../../../src/core/types';

const manifest = JSON.parse(readFileSync(new URL('../../../public/assets/manifest.json', import.meta.url), 'utf8')) as {
  furniture: Record<string, ManifestModel>;
};
const db = content();
const ready = <T extends { status: string }>(rec: Record<string, T>) => Object.values(rec).filter((x) => x.status === 'ready');

describe('content registry', () => {
  it('validates without errors (including model fit against the asset manifest)', () => {
    const { errors, warnings } = validateContent(db, { models: manifest.furniture });
    if (warnings.length) console.info(`content warnings:\n${warnings.join('\n')}`);
    expect(errors).toEqual([]);
  });

  it('meets the Milestone 1 minimum counts for gameplay registries', () => {
    expect(ready(db.objects).length).toBeGreaterThanOrEqual(40); // M1 needs 15; this build ships ~40
    expect(Object.keys(M1_OBJECTS).every((id) => db.objects[id]?.status === 'ready')).toBe(true);
    expect(ready(db.interactions).length).toBeGreaterThanOrEqual(24);
    expect(ready(db.socials).length).toBeGreaterThanOrEqual(24); // Milestone 5 minimum
    expect(ready(db.traits).length).toBeGreaterThanOrEqual(20);
    expect(ready(db.aspirations).length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(db.skills)).toHaveLength(16);
    for (const id of ['cooking', 'logic', 'programming', 'charisma', 'fitness', 'gardening', 'music']) expect(db.skills[id]?.status).toBe('ready');
    expect(db.careers.culinary?.levels).toHaveLength(10);
    expect(ready(db.recipes).length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(db.packs)).toHaveLength(12);
    expect(db.preferences.length).toBeGreaterThanOrEqual(30);
    for (const cat of ['social', 'tidiness', 'energy', 'creativity', 'leisure', 'lifestyle']) {
      expect(TRAITS.some((t) => t.category === cat)).toBe(true);
    }
  });

  it('meets Milestone 1 counts for surfaces and character content once those registries are filled', () => {
    if (Object.keys(db.wallDesigns).length) expect(ready(db.wallDesigns).length).toBeGreaterThanOrEqual(12);
    if (Object.keys(db.floorDesigns).length) expect(ready(db.floorDesigns).length).toBeGreaterThanOrEqual(8);
    if (Object.keys(db.hair).length) expect(ready(db.hair).length).toBeGreaterThanOrEqual(8);
    if (Object.keys(db.garments).length) expect(ready(db.garments).length).toBeGreaterThanOrEqual(12);
  });

  it('keeps MODEL_BOUNDS in sync with the asset manifest', () => {
    for (const [asset, [min, max]] of Object.entries(MODEL_BOUNDS)) {
      const m = manifest.furniture[asset];
      expect(m, asset).toBeDefined();
      expect(m!.min).toEqual(min);
      expect(m!.max).toEqual(max);
    }
  });

  it('counts each ready object as a distinct design (no shared model)', () => {
    const assets = OBJECTS.filter((o) => o.status === 'ready').map((o) => o.model.asset);
    expect(new Set(assets).size).toBe(assets.length);
  });

  it('fits every model in its footprint, centred in x, bottom on the floor (wall items mounted)', () => {
    for (const o of OBJECTS) {
      const b = fittedBounds(o.model)!;
      expect(b, o.id).not.toBeNull();
      expect(b.x0).toBeGreaterThanOrEqual(-0.001);
      expect(b.x1).toBeLessThanOrEqual(o.footprint.w + 0.001);
      expect(b.z0).toBeGreaterThanOrEqual(-0.001);
      expect(b.z1).toBeLessThanOrEqual(o.footprint.d + 0.001);
      expect(Math.abs((b.x0 + b.x1) / 2 - o.footprint.w / 2)).toBeLessThan(0.001);
      if (o.layer !== 'wall' && o.layer !== 'ceiling') expect(Math.abs(b.y0)).toBeLessThan(0.001);
      else expect(b.y0).toBeGreaterThan(0.5);
      if (o.layer === 'ceiling') expect(b.y1, o.id).toBeCloseTo(2.8, 2);
    }
  });

  it('keeps approach tiles outside blocking footprints and anchors inside at every rotation', () => {
    for (const o of OBJECTS.filter((x) => x.blocksMovement)) {
      for (const rot of [0, 1, 2, 3] as Rot[]) {
        const tiles = blockingTiles(0, 0, o, rot);
        const size = rotatedSize(o.footprint, rot);
        for (const s of o.slots) {
          const a = rotateCell(s.approach[0], s.approach[1], o.footprint, rot);
          expect(tiles.some((t) => t.x === a.x && t.z === a.z), `${o.id}/${s.id} rot ${rot}`).toBe(false);
          if (s.kind === 'sit' || s.kind === 'sleep') {
            const p = rotateLocal(s.pos[0], s.pos[1], o.footprint, rot);
            expect(p.x).toBeGreaterThan(0);
            expect(p.x).toBeLessThan(size.w);
            expect(p.z).toBeGreaterThan(0);
            expect(p.z).toBeLessThan(size.d);
          }
        }
      }
    }
  });

  it('balances sleep, meals and snacks as specified', () => {
    const sleep = INTERACTIONS.find((i) => i.id === 'sleep')!;
    const perHour = (sleep.needsPerHour.energy ?? 0) * (db.objects['bed-double-oak']!.stats.energy ?? 1);
    const hours = 90 / perHour; // a typical bedtime: energy 10 -> 100
    expect(hours).toBeGreaterThanOrEqual(7);
    expect(hours).toBeLessThanOrEqual(8);
    for (const r of RECIPES) {
      expect(r.hunger).toBeGreaterThanOrEqual(45);
      expect(r.hunger).toBeLessThanOrEqual(60);
      expect(RECIPE_FOOD_TAGS[r.id]?.every((t) => db.preferences.some((p) => p.id === t))).toBe(true);
    }
    expect(INTERACTIONS.find((i) => i.id === 'grabSnack')!.needsOnComplete.hunger).toBe(25);
    expect(INTERACTIONS.find((i) => i.id === 'grabSnack')!.cost).toBe(300);
  });

  it('prices beds and quality tiers sensibly', () => {
    const single = db.objects['bed-single-pine']!;
    expect(single.tier).toBe('budget');
    expect(single.price).toBeGreaterThanOrEqual(25000);
    expect(single.price).toBeLessThanOrEqual(40000);
    // a better bed restores energy faster
    expect(db.objects['bed-double-oak']!.stats.energy!).toBeGreaterThan(single.stats.energy!);
    // premium seats are more comfortable than budget ones
    expect(db.objects['sofa-modern']!.stats.comfort!).toBeGreaterThan(db.objects['sofa-tweed']!.stats.comfort!);
    expect(db.objects['tv-flatscreen']!.stats.fun!).toBeGreaterThan(db.objects['tv-vintage']!.stats.fun!);
  });

  it('generates trait effect text from exactly the implemented effects', () => {
    for (const t of TRAITS) {
      expect(t.effectText).toEqual(describeTraitEffects(t.effects));
      expect(t.effectText.length).toBeGreaterThan(0);
    }
  });

  it('rejects broken content', () => {
    const broken = structuredClone(db);
    broken.objects['bed-double-oak']!.interactions.push('flyToMoon');
    broken.objects['sofa-tweed']!.slots[0]!.approach = [0, 0];
    broken.traits.outgoing!.conflicts = ['neat'];
    broken.socials.chat!.success.actorMoodlet = 'noSuchMoodlet';
    broken.objects['rug-rectangle']!.finishes[0]!.swatches = [];
    const { errors } = validateContent(broken, { models: manifest.furniture });
    const text = errors.join('\n');
    expect(text).toContain("unknown interaction 'flyToMoon'");
    expect(text).toContain('inside the blocking footprint');
    expect(text).toContain('not symmetric');
    expect(text).toContain("unknown moodlet 'noSuchMoodlet'");
    expect(text).toContain('empty palette');
  });
});
