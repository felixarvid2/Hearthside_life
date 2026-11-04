// Group walls-f: brick and stone (28) and concrete, industrial and weathered (17): counts, params, palettes, and every
// design paints with a fake canvas and no images loaded (plus once with a stub image, to run the map paths).
import { afterEach, describe, expect, it } from 'vitest';
import { WALLS_F } from '../../../src/content/surfaces3/walls-f';
import { paletteTone } from '../../../src/content/surfaces';
import { setSurfaceMapProvider } from '../../../src/render/textures/mapKit';
import { PAINTERS, checkParams } from '../../../src/render/textures/painters';
import { PAINTERS_WALLS_F } from '../../../src/render/textures/packs/walls-f';
import { resolveParams, type PaintSpec } from '../../../src/render/textures/painterKit';
import { FakeCanvas } from './fakeCanvas';

class ImageCanvas extends FakeCanvas {
  images = 0;
  drawImage(_i: unknown, dx: number, dy: number, dw: number, dh: number): void {
    for (const v of [dx, dy, dw, dh]) if (!Number.isFinite(v)) throw new Error('non-finite drawImage');
    this.images++;
  }
}

afterEach(() => setSurfaceMapProvider(null));

function specOf(d: (typeof WALLS_F)[number], paletteIndex = 0): PaintSpec {
  const painter = PAINTERS[d.painter];
  if (!painter) throw new Error(d.painter);
  return {
    w: d.repeat, h: 2.8, wrapY: false, colors: d.palettes[paletteIndex]?.colors ?? [], params: resolveParams(painter, d.params),
    seed: 1234, ppm: 100,
  };
}

describe('walls-f content', () => {
  it('hits the allocated counts per family', () => {
    expect(WALLS_F.filter((d) => d.family === 'brick-stone')).toHaveLength(28);
    expect(WALLS_F.filter((d) => d.family === 'concrete')).toHaveLength(17);
    expect(WALLS_F).toHaveLength(45);
  });

  it('has unique ids, at least 8 palettes with all four tones, and painters that exist', () => {
    expect(new Set(WALLS_F.map((d) => d.id)).size).toBe(WALLS_F.length);
    for (const d of WALLS_F) {
      expect(d.surface).toBe('wall');
      expect(d.palettes.length, d.id).toBeGreaterThanOrEqual(8);
      expect([...new Set(d.palettes.map(paletteTone))].sort(), d.id).toEqual(['accent', 'dark', 'light', 'neutral']);
      expect(PAINTERS[d.painter], d.id).toBeDefined();
    }
  });

  it('passes checkParams and keeps distinct layouts', () => {
    for (const d of WALLS_F) {
      const painter = PAINTERS[d.painter];
      expect(painter && checkParams(painter, d.params), d.id).toEqual([]);
    }
    const keys = WALLS_F.map((d) => `${d.painter}:${JSON.stringify(Object.entries(d.params).sort())}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('mixes price tiers in each family', () => {
    for (const fam of ['brick-stone', 'concrete']) {
      expect(new Set(WALLS_F.filter((d) => d.family === fam).map((d) => d.tier)).size, fam).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('walls-f painters', () => {
  it('registers the pack painters with documented params', () => {
    for (const p of PAINTERS_WALLS_F) {
      expect(PAINTERS[p.id], p.id).toBe(p);
      for (const [k, v] of Object.entries(p.params)) expect(v.doc.length, `${p.id}.${k}`).toBeGreaterThan(5);
    }
  });

  it('paints every design without images, deterministically, with balanced state', () => {
    for (const d of WALLS_F) {
      const a = new FakeCanvas(), b = new FakeCanvas();
      PAINTERS[d.painter]?.paint(a, specOf(d));
      PAINTERS[d.painter]?.paint(b, specOf(d));
      expect(a.depth, d.id).toBe(0);
      expect(a.calls, d.id).toBeGreaterThan(20);
      expect(a.hash, d.id).toBe(b.hash);
    }
  });

  it('draws map windows when an image is available (and every unit takes its own)', () => {
    setSurfaceMapProvider(() => ({}));
    for (const d of WALLS_F) {
      const ctx = new ImageCanvas();
      PAINTERS[d.painter]?.paint(ctx, specOf(d, 2));
      expect(ctx.depth, d.id).toBe(0);
      if (d.painter !== 'tread-wall') expect(ctx.images, d.id).toBeGreaterThan(d.painter === 'map-wall' ? 0 : 5);
    }
  });

  it('tiles seamlessly: units crossing the repeat edge are also drawn shifted by one repeat', () => {
    class Shift extends FakeCanvas {
      shifts = 0;
      w = 0;
      override translate(x: number, y: number): void {
        super.translate(x, y);
        if (Math.abs(Math.abs(x) - this.w) < 1e-9 && y === 0) this.shifts++;
      }
    }
    for (const d of WALLS_F) {
      if (['map-wall', 'seam-metal'].includes(d.painter)) continue;
      const ctx = new Shift();
      ctx.w = d.repeat;
      PAINTERS[d.painter]?.paint(ctx, specOf(d));
      expect(ctx.shifts, d.id).toBeGreaterThan(0);
    }
  });
});
