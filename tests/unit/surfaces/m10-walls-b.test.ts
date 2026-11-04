// Group walls-b (M10): 18 stripes/checks and 26 geometric designs paint with a fake canvas and no images loaded.
import { describe, expect, it } from 'vitest';
import { paletteTone } from '../../../src/content/surfaces';
import { WALLS_B } from '../../../src/content/surfaces3/walls-b';
import { MOTIF_IDS, MAP_IDS } from '../../../src/render/textures/mapKit';
import { PAINTERS_WALLS_B } from '../../../src/render/textures/packs/walls-b';
import { checkParams, paintDesign, painterFor, textureLayout } from '../../../src/render/textures/painters';
import { FakeCanvas } from './fakeCanvas';

const count = (family: string) => WALLS_B.filter((d) => d.family === family).length;

describe('walls-b designs', () => {
  it('hit the allocated counts per family', () => {
    expect(count('stripes')).toBe(18);
    expect(count('geometric')).toBe(26);
    expect(WALLS_B.length).toBe(44);
  });

  it('have unique ids with a family prefix, and names', () => {
    const ids = WALLS_B.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(WALLS_B.map((d) => d.name)).size).toBe(ids.length);
    for (const d of WALLS_B) expect(d.id.startsWith(d.family === 'stripes' ? 'stripes-' : 'geo-') || d.id.startsWith('check-'), d.id).toBe(true);
  });

  it('have at least 8 palettes covering light, dark and a second tone', () => {
    for (const d of WALLS_B) {
      expect(d.palettes.length, d.id).toBeGreaterThanOrEqual(8);
      const tones = new Set(d.palettes.map(paletteTone));
      expect(tones.has('light'), d.id).toBe(true);
      expect(tones.has('dark'), d.id).toBe(true);
      expect(tones.size, d.id).toBeGreaterThanOrEqual(3);
      expect(d.packs.length, d.id).toBeGreaterThan(0);
    }
  });

  it('use valid params, known maps and painters of this group or the motif painter', () => {
    const own = new Set(PAINTERS_WALLS_B.map((p) => p.id));
    for (const d of WALLS_B) {
      expect(own.has(d.painter) || d.painter === 'motif-wall', d.id).toBe(true);
      expect(checkParams(painterFor(d), d.params), d.id).toEqual([]);
      const ground = d.params.ground;
      if (typeof ground === 'string' && ground) expect((MAP_IDS as readonly string[]).includes(ground), `${d.id} ground`).toBe(true);
      if (d.painter === 'motif-wall') expect(MOTIF_IDS.includes(String(d.params.motif)), `${d.id} motif`).toBe(true);
    }
  });

  it('paint every palette with the fake canvas and no images, deterministically', () => {
    for (const d of WALLS_B) {
      for (const pal of d.palettes) {
        const a = new FakeCanvas();
        paintDesign(a, d, pal.id, textureLayout(d, 64));
        expect(a.depth, d.id).toBe(0);
        expect(a.calls, d.id).toBeGreaterThan(5);
      }
      const x = new FakeCanvas(), y = new FakeCanvas();
      paintDesign(x, d, d.palettes[0]!.id, textureLayout(d, 64));
      paintDesign(y, d, d.palettes[0]!.id, textureLayout(d, 64));
      expect(x.log.join('|'), d.id).toBe(y.log.join('|'));
    }
  });
});
