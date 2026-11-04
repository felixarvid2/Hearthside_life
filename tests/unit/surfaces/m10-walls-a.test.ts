// Group walls-a (M10 surfaces): counts per family, unique ids, params, palettes and a fake-canvas paint of every design.
import { describe, expect, it } from 'vitest';
import { WALLS_A } from '../../../src/content/surfaces3/walls-a';
import { WALL_DESIGNS } from '../../../src/content/surfaces';
import { PAINTERS, WALL_TEXTURE_HEIGHT, checkParams, paintDesign, paintThumbnail, textureLayout } from '../../../src/render/textures/painters';
import { PAINTERS_WALLS_A } from '../../../src/render/textures/packs/walls-a';
import { FakeCanvas } from './fakeCanvas';

const count = (family: string) => WALLS_A.filter((d) => d.family === family).length;

describe('walls-a: content', () => {
  it('adds the allocated number of designs per family (the pilot mural counts as a mural)', () => {
    expect(count('paint')).toBe(24);
    expect(count('luxury')).toBe(17);
    expect(count('mural')).toBe(19);
    expect(WALLS_A).toHaveLength(60);
  });

  it('has unique ids, also against the whole wall catalog', () => {
    const ids = WALLS_A.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    const mine = new Set(ids);
    expect(WALL_DESIGNS.filter((d) => mine.has(d.id)).length).toBe(ids.length);
    expect(new Set(WALL_DESIGNS.map((d) => d.id)).size).toBe(WALL_DESIGNS.length);
  });

  it('gives every design at least eight palettes with unique ids, names and enough colours', () => {
    for (const d of WALLS_A) {
      expect(d.palettes.length, d.id).toBeGreaterThanOrEqual(8);
      expect(new Set(d.palettes.map((p) => p.id)).size, d.id).toBe(d.palettes.length);
      const painter = PAINTERS[d.painter];
      for (const p of d.palettes) expect(p.colors.length, `${d.id}/${p.id}`).toBeGreaterThanOrEqual(painter?.colors.length ?? 1);
    }
  });

  it('names a registered painter with valid params, packs and tags', () => {
    for (const d of WALLS_A) {
      const painter = PAINTERS[d.painter];
      expect(painter, d.id).toBeDefined();
      if (painter) expect(checkParams(painter, d.params), d.id).toEqual([]);
      expect(d.packs.length, d.id).toBeGreaterThan(0);
      expect(d.tags.length, d.id).toBeGreaterThanOrEqual(5);
      expect(d.description.length, d.id).toBeGreaterThan(40);
    }
  });
});

describe('walls-a: painting without images', () => {
  it('paints every design and palette, finite and balanced, and deterministically', () => {
    for (const d of WALLS_A) {
      const layout = textureLayout(d, 64);
      for (const p of [d.palettes[0], d.palettes[d.palettes.length - 1]]) {
        const a = new FakeCanvas(), b = new FakeCanvas();
        paintDesign(a, d, p?.id ?? '', layout);
        paintDesign(b, d, p?.id ?? '', layout);
        expect(a.depth, d.id).toBe(0);
        expect(a.calls, d.id).toBeGreaterThan(0);
        expect(a.log.join('|'), d.id).toBe(b.log.join('|'));
      }
      const t = new FakeCanvas();
      paintThumbnail(t, d, d.palettes[0]?.id ?? '', 96);
      expect(t.depth, d.id).toBe(0);
    }
  });

  it('the new painters are registered, documented and wall painters', () => {
    expect(PAINTERS_WALLS_A.length).toBeGreaterThan(0);
    for (const p of PAINTERS_WALLS_A) {
      expect(PAINTERS[p.id], p.id).toBe(p);
      expect(p.surface).toBe('wall');
      for (const [k, v] of Object.entries(p.params)) expect(v.doc.length, `${p.id}.${k}`).toBeGreaterThan(5);
    }
    expect(WALL_TEXTURE_HEIGHT).toBe(2.8);
  });

  it('the paint-effect painters keep their layout across palettes', () => {
    const d = WALLS_A.find((x) => x.id === 'paint-arches');
    expect(d).toBeDefined();
    if (!d) return;
    const layout = textureLayout(d, 64);
    const [p0, p1] = d.palettes;
    const strip = (log: string[]) => log.filter((l) => !l.startsWith('fs '));
    const a = new FakeCanvas(), b = new FakeCanvas();
    paintDesign(a, d, p0?.id ?? '', layout);
    paintDesign(b, d, p1?.id ?? '', layout);
    expect(strip(a.log)).toEqual(strip(b.log));
  });
});
