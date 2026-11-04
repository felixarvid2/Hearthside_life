// Group walls-e (M10): 19 wood panel designs and 32 wall tile designs paint with a fake canvas and no images loaded.
import { describe, expect, it } from 'vitest';
import { paletteTone } from '../../../src/content/surfaces';
import { WALLS_E } from '../../../src/content/surfaces3/walls-e';
import { MAP_IDS, MOTIF_IDS } from '../../../src/render/textures/mapKit';
import { PAINTERS_WALLS_E } from '../../../src/render/textures/packs/walls-e';
import { checkParams, paintDesign, painterFor, textureLayout } from '../../../src/render/textures/painters';
import { FakeCanvas } from './fakeCanvas';

const count = (family: string) => WALLS_E.filter((d) => d.family === family).length;

describe('walls-e designs', () => {
  it('hit the allocated counts per family', () => {
    expect(count('wood-panel')).toBe(19);
    expect(count('tile')).toBe(32);
    expect(WALLS_E.length).toBe(51);
  });

  it('have unique ids with a family prefix, and unique names', () => {
    const ids = WALLS_E.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(WALLS_E.map((d) => d.name)).size).toBe(ids.length);
    for (const d of WALLS_E) expect(d.id.startsWith(d.family === 'tile' ? 'tile-' : 'panel-'), d.id).toBe(true);
  });

  it('have at least 8 palettes with light, dark, neutral and accent tones', () => {
    for (const d of WALLS_E) {
      expect(d.palettes.length, d.id).toBeGreaterThanOrEqual(8);
      expect([...new Set(d.palettes.map(paletteTone))].sort(), d.id).toEqual(['accent', 'dark', 'light', 'neutral']);
      expect(d.packs.length, d.id).toBeGreaterThan(0);
    }
  });

  it('use valid params, known maps and motifs, and painters of this group', () => {
    const own = new Set(PAINTERS_WALLS_E.map((p) => p.id));
    for (const d of WALLS_E) {
      expect(own.has(d.painter), d.id).toBe(true);
      expect(checkParams(painterFor(d), d.params), d.id).toEqual([]);
      const map = d.params.map;
      if (typeof map === 'string' && map) expect((MAP_IDS as readonly string[]).includes(map), `${d.id} map`).toBe(true);
      const motif = d.params.motif;
      if (typeof motif === 'string' && motif) expect(MOTIF_IDS.includes(motif), `${d.id} motif`).toBe(true);
    }
  });

  it('have no two designs with the same painter and params', () => {
    const keys = WALLS_E.map((d) => `${d.painter}:${JSON.stringify(Object.entries(d.params).sort())}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('paint every palette with the fake canvas and no images, deterministically', { timeout: 120000 }, () => {
    for (const d of WALLS_E) {
      for (const pal of d.palettes) {
        const a = new FakeCanvas();
        paintDesign(a, d, pal.id, textureLayout(d, 64));
        expect(a.depth, `${d.id}/${pal.id}`).toBe(0);
        expect(a.calls, d.id).toBeGreaterThan(5);
      }
      const x = new FakeCanvas(), y = new FakeCanvas();
      paintDesign(x, d, d.palettes[0]!.id, textureLayout(d, 64));
      paintDesign(y, d, d.palettes[0]!.id, textureLayout(d, 64));
      expect(x.log.join('|'), d.id).toBe(y.log.join('|'));
    }
  });
});
