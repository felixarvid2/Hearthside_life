// Group walls-c (M10): 28 new floral designs plus the pilot peony, 21 botanical and nature designs; all motif prints.
import { describe, expect, it } from 'vitest';
import { paletteTone } from '../../../src/content/surfaces';
import { WALLS_C } from '../../../src/content/surfaces3/walls-c';
import { MAP_IDS, MOTIF_IDS } from '../../../src/render/textures/mapKit';
import { checkParams, paintDesign, painterFor, textureLayout } from '../../../src/render/textures/painters';
import { FakeCanvas } from './fakeCanvas';

const count = (family: string) => WALLS_C.filter((d) => d.family === family).length;

describe('walls-c designs', () => {
  it('hit the allocated counts per family', () => {
    expect(count('floral')).toBe(29); // 28 new + the pilot peony
    expect(count('botanical')).toBe(21);
    expect(WALLS_C.length).toBe(50);
  });

  it('have unique ids with a family prefix, and unique names', () => {
    const ids = WALLS_C.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(WALLS_C.map((d) => d.name)).size).toBe(ids.length);
    for (const d of WALLS_C) expect(d.id.startsWith(`${d.family}-`), d.id).toBe(true);
  });

  it('differ in layout, motif, scale or ground: no two designs share the same print setup', () => {
    const keys = WALLS_C.map((d) => JSON.stringify({ ...d.params, skirt: 0 }) + d.repeat);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('have at least 8 palettes covering light, dark and a second tone, and decor packs', () => {
    for (const d of WALLS_C) {
      expect(d.palettes.length, d.id).toBeGreaterThanOrEqual(8);
      const tones = new Set(d.palettes.map(paletteTone));
      expect(tones.has('light'), d.id).toBe(true);
      expect(tones.has('dark'), d.id).toBe(true);
      expect(tones.size, d.id).toBeGreaterThanOrEqual(3);
      expect(d.packs.length, d.id).toBeGreaterThan(0);
    }
  });

  it('use valid params, known motifs and ground maps', () => {
    for (const d of WALLS_C) {
      expect(d.painter, d.id).toBe('motif-wall');
      expect(checkParams(painterFor(d), d.params), d.id).toEqual([]);
      expect(MOTIF_IDS.includes(String(d.params.motif)), `${d.id} motif`).toBe(true);
      if (d.params.motif2) expect(MOTIF_IDS.includes(String(d.params.motif2)), `${d.id} motif2`).toBe(true);
      const ground = d.params.ground;
      if (typeof ground === 'string' && ground) expect((MAP_IDS as readonly string[]).includes(ground), `${d.id} ground`).toBe(true);
    }
  });

  it('paint every palette with the fake canvas and no images, deterministically', () => {
    for (const d of WALLS_C) {
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
