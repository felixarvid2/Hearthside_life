// Group walls-d (M10 surfaces): counts per family, unique ids, params, palettes, motif references and a fake-canvas
// paint of every design without images.
import { describe, expect, it } from 'vitest';
import { WALLS_D } from '../../../src/content/surfaces3/walls-d';
import { WALL_DESIGNS, paletteTone } from '../../../src/content/surfaces';
import { MOTIF_IDS } from '../../../src/render/textures/mapKit';
import { PAINTERS, checkParams, paintDesign, paintThumbnail, textureLayout } from '../../../src/render/textures/painters';
import { PAINTERS_WALLS_D } from '../../../src/render/textures/packs/walls-d';
import { FakeCanvas } from './fakeCanvas';

const count = (family: string) => WALLS_D.filter((d) => d.family === family).length;

describe('walls-d: content', () => {
  it('adds the allocated number of designs per family', () => {
    expect(count('vintage-deco')).toBe(21);
    expect(count('playful')).toBe(22);
    expect(count('themed')).toBe(17);
    expect(WALLS_D).toHaveLength(60);
  });

  it('has unique ids, also against the whole wall catalog', () => {
    const ids = WALLS_D.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    const mine = new Set(ids);
    expect(WALL_DESIGNS.filter((d) => mine.has(d.id)).length).toBe(ids.length);
  });

  it('gives every design at least eight palettes covering light, dark and neutral/accent tones', () => {
    for (const d of WALLS_D) {
      expect(d.palettes.length, d.id).toBeGreaterThanOrEqual(8);
      expect(new Set(d.palettes.map((p) => p.id)).size, d.id).toBe(d.palettes.length);
      const painter = PAINTERS[d.painter];
      for (const p of d.palettes) expect(p.colors.length, `${d.id}/${p.id}`).toBeGreaterThanOrEqual(painter?.colors.length ?? 1);
      const tones = new Set(d.palettes.map(paletteTone));
      expect(tones.has('dark') || tones.has('neutral'), d.id).toBe(true);
      expect(tones.size, d.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('names a registered painter with valid params, packs and tags', () => {
    for (const d of WALLS_D) {
      const painter = PAINTERS[d.painter];
      expect(painter, d.id).toBeDefined();
      if (painter) expect(checkParams(painter, d.params), d.id).toEqual([]);
      expect(d.packs.length, d.id).toBeGreaterThan(0);
      expect(d.tags.length, d.id).toBeGreaterThanOrEqual(5);
      expect(d.description.length, d.id).toBeGreaterThan(40);
    }
  });

  it('only references motif images that were built', () => {
    for (const d of WALLS_D) {
      for (const k of ['motif', 'motif2']) {
        const v = d.params[k];
        if (typeof v === 'string' && v !== '') expect(MOTIF_IDS, `${d.id}.${k}`).toContain(v);
      }
    }
  });
});

describe('walls-d: painting without images', () => {
  it('paints every design and palette, finite and balanced, and deterministically', () => {
    for (const d of WALLS_D) {
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

  it('registers the new painters, documented, for walls', () => {
    expect(PAINTERS_WALLS_D.map((p) => p.id).sort()).toEqual(['deco-geo', 'play-geo', 'quilt-set']);
    for (const p of PAINTERS_WALLS_D) {
      expect(PAINTERS[p.id]).toBe(p);
      expect(p.surface).toBe('wall');
      for (const [k, v] of Object.entries(p.params)) expect(v.doc.length, `${p.id}.${k}`).toBeGreaterThan(5);
    }
  });

  it('every deco-geo style paints and keeps its layout across palettes', () => {
    const base = WALLS_D.find((d) => d.painter === 'deco-geo');
    expect(base).toBeDefined();
    if (!base) return;
    for (const style of ['sunray', 'skyline', 'ziggurat', 'arches', 'lattice', 'arcs', 'pilaster']) {
      const d = { ...base, id: `t-${style}`, params: { ...base.params, style } };
      const layout = textureLayout(d, 64);
      const [p0, p1] = d.palettes;
      const strip = (log: string[]) => log.filter((l) => !l.startsWith('fs ') && !l.startsWith('ss '));
      const a = new FakeCanvas(), b = new FakeCanvas();
      paintDesign(a, d, p0?.id ?? '', layout);
      paintDesign(b, d, p1?.id ?? '', layout);
      expect(a.depth, style).toBe(0);
      expect(strip(a.log), style).toEqual(strip(b.log));
    }
  });
});
