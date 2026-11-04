// Group floors-b (M10 surfaces): ceramic, porcelain and mosaic tiles; stone, marble and terrazzo; the tile-lay painter.
import { describe, expect, it } from 'vitest';
import { FLOORS_B } from '../../../src/content/surfaces3/floors-b';
import { paletteTone } from '../../../src/content/surfaces';
import { MAP_IDS, MOTIF_IDS, designMaps } from '../../../src/render/textures/mapKit';
import { checkParams, paintDesign, painterFor, PAINTERS, textureLayout } from '../../../src/render/textures/painters';
import { layTiles, rectPeriod, insetPoly } from '../../../src/render/textures/packs/floors-b';
import { resolveParams, type PaintSpec, type ParamValue } from '../../../src/render/textures/painterKit';
import { FakeCanvas } from './fakeCanvas';

const count = (family: string) => FLOORS_B.filter((d) => d.family === family).length;

describe('floors-b designs', () => {
  it('has the allocated counts per family', () => {
    expect(count('tile')).toBe(25);
    expect(count('stone')).toBe(21);
    expect(FLOORS_B).toHaveLength(46);
  });

  it('has unique ids and names, at least six palettes, a decor pack and a floor surface', () => {
    expect(new Set(FLOORS_B.map((d) => d.id)).size).toBe(FLOORS_B.length);
    expect(new Set(FLOORS_B.map((d) => d.name)).size).toBe(FLOORS_B.length);
    for (const d of FLOORS_B) {
      expect(d.palettes.length, d.id).toBeGreaterThanOrEqual(6);
      expect(d.packs.length, d.id).toBeGreaterThan(0);
      expect(d.surface).toBe('floor');
      expect(d.description.length, d.id).toBeGreaterThan(30);
      expect(new Set(d.palettes.map((p) => p.id)).size, d.id).toBe(d.palettes.length);
    }
  });

  it('covers light, dark and neutral or accent tones in every design', () => {
    for (const d of FLOORS_B) {
      const tones = new Set(d.palettes.map((p) => paletteTone(p)));
      expect(tones.has('dark'), `${d.id} dark`).toBe(true);
      expect(tones.size, `${d.id} ${[...tones].join(',')}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('passes checkParams and names maps and motifs that exist', () => {
    for (const d of FLOORS_B) {
      expect(checkParams(painterFor(d), d.params), d.id).toEqual([]);
      for (const m of designMaps(d)) expect([...MAP_IDS, ...MOTIF_IDS].includes(m as never), `${d.id} ${m}`).toBe(true);
    }
  });

  it('paints every design and palette with a fake canvas and no images, deterministically', () => {
    for (const d of FLOORS_B) {
      const run = (palette: string) => {
        const ctx = new FakeCanvas();
        paintDesign(ctx, d, palette, textureLayout(d, 48));
        expect(ctx.depth, d.id).toBe(0);
        return ctx.log.join('|');
      };
      const a = run(d.palettes[0]!.id);
      expect(a.length, d.id).toBeGreaterThan(100);
      expect(run(d.palettes[0]!.id), d.id).toBe(a);
      run(d.palettes[d.palettes.length - 1]!.id);
    }
  });

  it('keeps distinct designs distinct: no two share painter and params', () => {
    const keys = FLOORS_B.map((d) => `${d.painter}|${JSON.stringify(d.params)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

function spec(params: Record<string, ParamValue>, w = 1.2): PaintSpec {
  const painter = PAINTERS['tile-lay']!;
  return { w, h: w, wrapY: true, colors: ['#e8e2d6', '#f4f0e8', '#8a847a', '#bdb7ab', '#4a4a4e', '#c9a24e'], params: resolveParams(painter, params), seed: 77, ppm: 100 };
}

const inside = (p: Array<[number, number]>, x: number, y: number): boolean => {
  let sgn = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!, b = p[(i + 1) % p.length]!;
    const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (Math.abs(c) < 1e-9) continue;
    if (sgn === 0) sgn = Math.sign(c);
    else if (Math.sign(c) !== sgn) return false;
  }
  return true;
};

describe('tile-lay geometry', () => {
  const CASES: Array<[string, Record<string, ParamValue>, number]> = [
    ['grid', { layout: 'grid', tileW: 0.2, tileH: 0.1 }, 1.2],
    ['grid checker diagonal', { layout: 'grid', checker: true, angle: '45', tileW: 0.3, tileH: 0.3 }, 1.27],
    ['grid notched', { layout: 'grid', notch: 0.2929, tileW: 0.2, tileH: 0.2 }, 1.2],
    ['running thirds', { layout: 'running', offset: 0.333, tileW: 0.6, tileH: 0.2 }, 1.2],
    ['herringbone', { layout: 'herringbone', tileW: 0.3, tileH: 0.1 }, 1.2],
    ['herringbone 45', { layout: 'herringbone', angle: '45', tileW: 0.3, tileH: 0.1 }, 1.27],
    ['chevron', { layout: 'chevron', tileW: 0.3, tileH: 0.08 }, 1.27],
    ['basketweave', { layout: 'basketweave', tileW: 0.18, bars: 3 }, 1.08],
    ['hopscotch', { layout: 'hopscotch', tileW: 0.2, tileH: 0.1 }, 1.2],
    ['hex', { layout: 'hex', tileW: 0.2, tileH: 0.1155 }, 1.4],
    ['picket', { layout: 'hex', tileW: 0.08, tileH: 0.2 }, 1.34],
    ['cubes', { layout: 'cubes', tileW: 0.2 }, 1.4],
    ['triangles', { layout: 'triangles', tileW: 0.15 }, 1.04],
    ['ashlar', { layout: 'ashlar', tileW: 0.4, tileH: 0.3, rowVar: 0.3, mix: 0.8 }, 1.6],
  ];

  it.each(CASES)('%s tiles the repeat exactly once', (_name, params, w) => {
    const s = spec(params, w);
    const { tiles } = layTiles(s);
    expect(tiles.length).toBeGreaterThan(3);
    let bad = 0;
    for (let k = 0; k < 600; k++) {
      // a deterministic scatter of sample points over the repeat
      const x = ((k * 0.6180339887) % 1) * w, y = ((k * 0.7548776662) % 1) * w;
      const hits = tiles.filter((t) => inside(t.pts, x, y)).length;
      if (hits !== 1) bad++;
    }
    // points that sit on a joint count twice; everything else exactly once
    expect(bad).toBeLessThanOrEqual(3);
  });

  it('closes the crazy paving torus: every seed appears and cells are gapped', () => {
    const s = spec({ layout: 'crazy', tileW: 0.3, tileH: 0.3, grout: 0.008 }, 1.5);
    const { tiles, gapped } = layTiles(s);
    expect(gapped).toBe(true);
    expect(new Set(tiles.map((t) => t.key)).size).toBe(25);
  });

  it('finds the rectangle period of a rotated lattice', () => {
    const [qx, qy] = rectPeriod([0.3, 0], [0, 0.3], Math.PI / 4);
    expect(qx).toBeCloseTo(0.3 * Math.SQRT2, 6);
    expect(qy).toBeCloseTo(0.3 * Math.SQRT2, 6);
  });

  it('insets a square by the grout width on each side', () => {
    const p = insetPoly([[0, 0], [1, 0], [1, 1], [0, 1]], 0.1);
    for (const [x, y] of p) { expect(x === 0.1 || x === 0.9 || Math.abs(x - 0.1) < 1e-9 || Math.abs(x - 0.9) < 1e-9).toBe(true); expect(y).toBeGreaterThan(0.05); }
    const rev = insetPoly([[0, 1], [1, 1], [1, 0], [0, 0]], 0.1);
    expect(Math.min(...rev.map((q) => q[0]))).toBeCloseTo(0.1, 9);
  });

  it('paints with a tinted image provider without errors', () => {
    const d = FLOORS_B.find((x) => x.id === 'stone-marble-checker')!;
    const ctx = new (class extends FakeCanvas { drawImage(): void { this.log.push('img'); } })();
    paintDesign(ctx, d, d.palettes[0]!.id, textureLayout(d, 48));
    expect(ctx.depth).toBe(0);
  });
});

describe('floors-b sources', () => {
  it('uses the generated materials and cement motifs of the group', () => {
    const used = new Set(FLOORS_B.flatMap((d) => designMaps(d)));
    for (const id of ['fb-marble-calacatta', 'fb-marble-carrara', 'fb-marble-nero', 'fb-marble-breccia', 'fb-onyx-banded', 'fb-travertine',
      'fb-limestone', 'fb-granite', 'fb-basalt', 'fb-sandstone', 'fb-quartzite', 'fb-terrazzo-large', 'fb-terrazzo-fine', 'fb-glaze-pooled',
      'fb-terracotta', 'fb-glaze-crackle', 'fb-glass-cloud', 'motif-cement-star', 'motif-cement-fleur', 'motif-cement-fan', 'motif-cement-meander']) expect(used.has(id), id).toBe(true);
  });
});
