// Group floors-a (M10 surfaces): wooden planks, parquet, laminate and vinyl.
import { describe, expect, it } from 'vitest';
import { FLOORS_A } from '../../../src/content/surfaces3/floors-a';
import { paletteTone } from '../../../src/content/surfaces';
import { designMaps } from '../../../src/render/textures/mapKit';
import { MAP_IDS } from '../../../src/render/textures/mapKit';
import { checkParams, paintDesign, painterFor, textureLayout } from '../../../src/render/textures/painters';
import { FakeCanvas } from './fakeCanvas';

const count = (family: string) => FLOORS_A.filter((d) => d.family === family).length;

describe('floors-a designs', () => {
  it('has the allocated counts per family', () => {
    expect(count('wood-planks')).toBe(36);
    expect(count('parquet')).toBe(20);
    expect(count('laminate-vinyl')).toBe(18);
    expect(FLOORS_A).toHaveLength(74);
  });

  it('has unique ids and names, at least six palettes and a decor pack', () => {
    expect(new Set(FLOORS_A.map((d) => d.id)).size).toBe(FLOORS_A.length);
    expect(new Set(FLOORS_A.map((d) => d.name)).size).toBe(FLOORS_A.length);
    for (const d of FLOORS_A) {
      expect(d.palettes.length, d.id).toBeGreaterThanOrEqual(6);
      expect(d.packs.length, d.id).toBeGreaterThan(0);
      expect(d.surface).toBe('floor');
      expect(new Set(d.palettes.map((p) => p.id)).size, d.id).toBe(d.palettes.length);
    }
  });

  it('covers light, dark and neutral tones in every design', () => {
    for (const d of FLOORS_A) {
      const tones = new Set(d.palettes.map((p) => paletteTone(p)));
      expect(tones.size, `${d.id} ${[...tones].join(',')}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('passes checkParams and names maps that exist', () => {
    for (const d of FLOORS_A) {
      expect(checkParams(painterFor(d), d.params), d.id).toEqual([]);
      for (const m of designMaps(d)) expect((MAP_IDS as readonly string[]).includes(m), `${d.id} ${m}`).toBe(true);
    }
  });

  it('paints every design and palette with a fake canvas and no images, deterministically', () => {
    for (const d of FLOORS_A) {
      const run = () => {
        const ctx = new FakeCanvas();
        paintDesign(ctx, d, d.palettes[0]!.id, textureLayout(d, 48));
        expect(ctx.depth, d.id).toBe(0);
        return ctx.log.join('|');
      };
      const a = run();
      expect(a.length, d.id).toBeGreaterThan(100);
      expect(run(), d.id).toBe(a);
    }
  });

  it('paints the last palette too', () => {
    for (const d of FLOORS_A) {
      const ctx = new FakeCanvas();
      paintDesign(ctx, d, d.palettes[d.palettes.length - 1]!.id, textureLayout(d, 32));
      expect(ctx.depth).toBe(0);
    }
  });

  it('uses every grain and print map of the group', () => {
    const used = new Set(FLOORS_A.flatMap((d) => designMaps(d)));
    for (const id of ['grain-walnut', 'grain-elm', 'print-cork', 'print-woven', 'print-rubber', 'grain-oak-rift']) expect(used.has(id), id).toBe(true);
  });

  it('keeps distinct designs distinct: no two share painter, params and map', () => {
    const keys = FLOORS_A.map((d) => `${d.painter}|${JSON.stringify(d.params)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
