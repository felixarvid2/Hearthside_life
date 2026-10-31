import { describe, expect, it } from 'vitest';
import { FLOOR_DESIGNS, WALL_DESIGNS } from '../../../src/content/surfaces';
import type { SurfaceDesign } from '../../../src/content/types';
import { hexLayout, partition } from '../../../src/render/textures/floorPainters';
import { drawWrapped, mixSeed, resolveParams, rngFor, type PaintSpec } from '../../../src/render/textures/painterKit';
import {
  MAX_PX_PER_REPEAT, PAINTERS, WALL_TEXTURE_HEIGHT, checkParams, paintDesign, paintThumbnail, painterFor, textureLayout,
} from '../../../src/render/textures/painters';
import { FakeCanvas } from './fakeCanvas';

const ALL: SurfaceDesign[] = [...WALL_DESIGNS, ...FLOOR_DESIGNS];

function render(design: SurfaceDesign, paletteId: string, px = 64): FakeCanvas {
  const ctx = new FakeCanvas();
  paintDesign(ctx, design, paletteId, textureLayout(design, px));
  return ctx;
}

describe('painter registry', () => {
  it('has unique painter ids matching their keys', () => {
    for (const [id, p] of Object.entries(PAINTERS)) expect(p.id).toBe(id);
  });

  it('every design references an existing painter of the right surface', () => {
    for (const d of ALL) {
      const p = PAINTERS[d.painter];
      expect(p, `${d.id} -> ${d.painter}`).toBeDefined();
      expect(p?.surface, d.id).toBe(d.surface);
    }
  });

  it('every wall design uses its own painter (distinct structure, not recolours)', () => {
    expect(new Set(WALL_DESIGNS.map((d) => d.painter)).size).toBe(WALL_DESIGNS.length);
    expect(new Set(FLOOR_DESIGNS.map((d) => d.painter)).size).toBe(FLOOR_DESIGNS.length);
  });

  it('design params are known and in range', () => {
    for (const d of ALL) expect(checkParams(painterFor(d), d.params), d.id).toEqual([]);
  });

  it('painter param defaults are themselves in range', () => {
    for (const p of Object.values(PAINTERS)) {
      const defaults = Object.fromEntries(Object.entries(p.params).map(([k, s]) => [k, s.default]));
      expect(checkParams(p, defaults), p.id).toEqual([]);
      expect(p.colors.length, p.id).toBeGreaterThan(0);
      expect(p.thumbSpan, p.id).toBeGreaterThan(0.2);
    }
  });

  it('palettes provide every colour role the painter needs', () => {
    for (const d of ALL) {
      const roles = painterFor(d).colors.length;
      for (const pal of d.palettes) expect(pal.colors.length, `${d.id}/${pal.id}`).toBeGreaterThanOrEqual(roles);
    }
  });

  it('checkParams rejects bad values', () => {
    const p = PAINTERS['subway-tile'];
    expect(p).toBeDefined();
    if (!p) return;
    expect(checkParams(p, { tileW: 5 })).toHaveLength(1);
    expect(checkParams(p, { bond: 'zigzag' })).toHaveLength(1);
    expect(checkParams(p, { nope: 1 })).toHaveLength(1);
    expect(resolveParams(p, { tileW: 0.2 }).tileH).toBe(0.075);
  });
});

describe('texture layout', () => {
  it('walls cover repeat x 2.8 m, floors are square; never above the pixel cap', () => {
    for (const d of ALL) {
      for (const q of ['low', 'high'] as const) {
        const l = textureLayout(d, q);
        expect(Math.max(l.widthPx, l.heightPx), d.id).toBeLessThanOrEqual(MAX_PX_PER_REPEAT[q]);
        expect(l.widthM).toBe(d.repeat);
        if (d.surface === 'wall') {
          expect(l.heightM).toBe(WALL_TEXTURE_HEIGHT);
          expect(l.wrapY).toBe(false);
        } else {
          expect(l.heightM).toBe(d.repeat);
          expect(l.widthPx).toBe(l.heightPx);
          expect(l.wrapY).toBe(true);
        }
      }
    }
  });
});

describe('painters', () => {
  it('run against a fake canvas without errors for every design and palette, with balanced save/restore', () => {
    for (const d of ALL) {
      for (const pal of d.palettes) {
        const ctx = render(d, pal.id, 48);
        expect(ctx.depth, `${d.id}/${pal.id}`).toBe(0);
        expect(ctx.calls, d.id).toBeGreaterThan(20);
      }
    }
  });

  it('are deterministic', () => {
    for (const d of ALL) {
      const a = render(d, d.palettes[0]?.id ?? '', 96);
      const b = render(d, d.palettes[0]?.id ?? '', 96);
      expect(a.hash, d.id).toBe(b.hash);
      expect(a.calls).toBe(b.calls);
      expect(a.log).toEqual(b.log);
    }
  });

  it('keep the same layout across palettes (only colours change)', () => {
    for (const d of ALL) {
      const strip = (c: FakeCanvas) => c.log.filter((l) => !l.startsWith('fs') && !l.startsWith('ss'));
      const a = render(d, d.palettes[0]?.id ?? '', 64);
      const b = render(d, d.palettes[1]?.id ?? '', 64);
      expect(strip(a), d.id).toEqual(strip(b));
    }
  });

  it('change with the seed param', () => {
    const d = WALL_DESIGNS.find((x) => x.id === 'floral-sprig') as SurfaceDesign;
    const a = render(d, 'cream-rose');
    const b = render({ ...d, params: { ...d.params, seed: 7 } }, 'cream-rose');
    expect(a.hash).not.toBe(b.hash);
  });

  it('paint thumbnails', () => {
    for (const d of ALL) {
      const ctx = new FakeCanvas();
      paintThumbnail(ctx, d, d.palettes[0]?.id ?? '', 48);
      expect(ctx.depth, d.id).toBe(0);
      expect(ctx.calls, d.id).toBeGreaterThan(20);
    }
  });
});

describe('kit helpers', () => {
  it('drawWrapped draws copies on the opposite edges only when needed', () => {
    const spec: PaintSpec = { w: 1, h: 1, wrapY: true, colors: [], params: {}, seed: 1, ppm: 100 };
    const seen: string[] = [];
    const ctx = new FakeCanvas();
    let n = 0;
    drawWrapped(ctx, spec, 0.4, 0.4, 0.6, 0.6, () => n++);
    expect(n).toBe(1);
    n = 0;
    drawWrapped(ctx, spec, -0.1, -0.1, 0.1, 0.1, () => n++);
    expect(n).toBe(4); // base + right + bottom + corner
    n = 0;
    drawWrapped(ctx, { ...spec, wrapY: false }, 0.9, -0.1, 1.1, 0.1, () => n++);
    expect(n).toBe(2);
    expect(seen).toEqual([]);
  });

  it('seeded generators are reproducible and key-sensitive', () => {
    expect(rngFor(5, 1, 2).next()).toBe(rngFor(5, 1, 2).next());
    expect(rngFor(5, 1, 2).next()).not.toBe(rngFor(5, 2, 1).next());
    expect(mixSeed(1, 2)).not.toBe(mixSeed(2, 1));
  });

  it('partition always sums to the total using allowed sizes', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const total of [6, 7, 11, 12, 13]) {
        const parts = partition(total, [2, 3, 4], rngFor(seed));
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        for (const p of parts) expect([2, 3, 4]).toContain(p);
      }
    }
  });

  it('hex layout keeps hexagons within 5% of regular', () => {
    for (const repeat of [0.6, 1.0, 1.2, 1.44]) {
      for (const multiple of [1, 4]) {
        const l = hexLayout(repeat, 0.03, multiple);
        expect(Math.abs(l.fy - 1), `${repeat}/${multiple}`).toBeLessThan(0.05);
        expect(l.pairs % multiple).toBe(0);
        expect(l.rows % multiple).toBe(0);
        expect(3 * l.pairs * l.r).toBeCloseTo(repeat, 9);
      }
    }
  });
});
