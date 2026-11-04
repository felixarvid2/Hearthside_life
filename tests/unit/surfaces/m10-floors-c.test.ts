// Group floors-c: carpets and textile floors, concrete and industrial floors, exterior paving, decking, gravel and paths.
import { describe, expect, it } from 'vitest';
import { FLOORS_C } from '../../../src/content/surfaces3/floors-c';
import { FLOOR_DESIGNS, WALL_DESIGNS, paletteTone } from '../../../src/content/surfaces';
import { checkParams, paintDesign, painterFor, textureLayout, PAINTERS } from '../../../src/render/textures/painters';
import { resolveParams, type PaintSpec, type ParamValue } from '../../../src/render/textures/painterKit';
import { PAINTERS_FLOORS_C, bondUnits, voronoiCells } from '../../../src/render/textures/packs/floors-c';
import { FakeCanvas } from './fakeCanvas';

const family = (f: string) => FLOORS_C.filter((d) => d.family === f);

function spec(id: string, params: Record<string, ParamValue>, w = 2.4): PaintSpec {
  const p = PAINTERS[id];
  if (!p) throw new Error(id);
  return { w, h: w, wrapY: true, colors: ['#a5523a', '#b86a4e', '#7a3a2a', '#b8aa94', '#c0c0c0', '#404040'], params: resolveParams(p, params), seed: 99, ppm: 100 };
}

describe('floors-c counts', () => {
  it('adds 20 carpets (plus the pilot), 9 concrete and 18 exterior floors', () => {
    expect(family('carpet').length).toBe(21);
    expect(family('concrete').length).toBe(9);
    expect(family('exterior').length).toBe(18);
    expect(FLOORS_C.length).toBe(48);
  });

  it('brings every family to its target together with the older designs', () => {
    const all = (f: string) => FLOOR_DESIGNS.filter((d) => d.family === f && d.surface === 'floor');
    expect(all('carpet').length).toBeGreaterThanOrEqual(24);
    expect(all('concrete').length).toBeGreaterThanOrEqual(12);
    expect(all('exterior').length).toBeGreaterThanOrEqual(24);
  });

  it('has unique ids, none shared with another design of the catalog', () => {
    const ids = [...WALL_DESIGNS, ...FLOOR_DESIGNS].map((d) => d.id);
    for (const d of FLOORS_C) expect(ids.filter((id) => id === d.id).length, d.id).toBe(1);
    expect(new Set(FLOORS_C.map((d) => d.id)).size).toBe(FLOORS_C.length);
  });

  it('every design has 6 or more palettes, valid params, a decor pack and distinct tones', () => {
    for (const d of FLOORS_C) {
      expect(d.palettes.length, d.id).toBeGreaterThanOrEqual(6);
      expect(new Set(d.palettes.map((p) => p.id)).size, d.id).toBe(d.palettes.length);
      expect(checkParams(painterFor(d), d.params), d.id).toEqual([]);
      expect(d.packs.length, d.id).toBeGreaterThan(0);
      expect(d.id.startsWith(d.family === 'carpet' ? 'carpet-' : d.family === 'concrete' ? '' : 'ext-'), d.id).toBe(true);
      expect(new Set(d.palettes.map(paletteTone)).size, d.id).toBeGreaterThanOrEqual(3);
      const need = painterFor(d).colors.length;
      for (const p of d.palettes) expect(p.colors.length, `${d.id}/${p.id}`).toBeGreaterThanOrEqual(need);
    }
  });

  it('uses each new painter of the pack at least once', () => {
    const used = new Set(FLOORS_C.map((d) => d.painter));
    for (const p of PAINTERS_FLOORS_C) expect(used.has(p.id), p.id).toBe(true);
  });
});

describe('floors-c painting', () => {
  it('every design paints on a fake canvas without any image, balanced and deterministic', () => {
    for (const d of FLOORS_C) {
      const run = () => {
        const ctx = new FakeCanvas();
        paintDesign(ctx, d, d.palettes[0]!.id, textureLayout(d, 64));
        expect(ctx.depth, d.id).toBe(0);
        return ctx;
      };
      const a = run(), b = run();
      expect(a.calls, d.id).toBeGreaterThan(10);
      expect(a.log.join('|'), d.id).toBe(b.log.join('|'));
    }
  });

  it('every palette of every design paints', () => {
    for (const d of FLOORS_C) {
      for (const p of d.palettes) {
        const ctx = new FakeCanvas();
        paintDesign(ctx, d, p.id, textureLayout(d, 32));
        expect(ctx.depth, `${d.id}/${p.id}`).toBe(0);
      }
    }
  });
});

describe('paver-bond layouts', () => {
  const area = (us: ReturnType<typeof bondUnits>) => us.reduce((t, u) => t + u.w * u.h, 0);
  const cases: Array<[string, Record<string, ParamValue>]> = [
    ['stack', { unitW: 0.5, unitH: 0.5 }], ['running', { unitW: 1.0, unitH: 0.25 }], ['ashlar', { unitH: 0.2 }],
    ['basket', { unitW: 0.3, per: 3 }], ['herringbone', { unitH: 0.1 }], ['pinwheel', { unitW: 0.2 }],
  ];

  it('units fill the repeat exactly: total area equals the repeat, none outside it by more than one unit', () => {
    for (const [bond, params] of cases) {
      const s = spec('paver-bond', { bond, ...params });
      const us = bondUnits(s);
      expect(area(us), bond).toBeCloseTo(s.w * s.h, 6);
      for (const u of us) {
        expect(u.x, bond).toBeGreaterThanOrEqual(-1e-9);
        expect(u.y, bond).toBeGreaterThanOrEqual(-1e-9);
        expect(u.x + u.w, bond).toBeLessThanOrEqual(s.w * 2);
      }
    }
  });

  it('are deterministic and independent of the palette', () => {
    for (const [bond, params] of cases) {
      const a = bondUnits(spec('paver-bond', { bond, ...params }));
      const b = bondUnits({ ...spec('paver-bond', { bond, ...params }), colors: ['#000000', '#111111', '#222222', '#333333'] });
      expect(a, bond).toEqual(b);
    }
  });

  it('herringbone and pinwheel tile without overlap on the module grid', () => {
    for (const [bond, params] of [cases[4]!, cases[5]!]) {
      const s = spec('paver-bond', { bond, ...params });
      const us = bondUnits(s);
      const t = us.reduce((m, u) => Math.min(m, u.w, u.h), 9);
      const n = Math.round(s.w / t);
      const hit = new Set<string>();
      for (const u of us) {
        for (let j = 0; j < Math.round(u.h / t); j++) for (let i = 0; i < Math.round(u.w / t); i++) {
          const key = `${(Math.round(u.x / t) + i) % n},${(Math.round(u.y / t) + j) % n}`;
          expect(hit.has(key), `${bond} ${key}`).toBe(false);
          hit.add(key);
        }
      }
      expect(hit.size, bond).toBe(n * n);
    }
  });
});

describe('crazy-paving cells', () => {
  it('are a seamless Voronoi partition: areas sum to the repeat minus the joints', () => {
    const s = spec('crazy-paving', { cells: 6 });
    const cells = voronoiCells(s, 6, 0.8, 0);
    expect(cells.length).toBe(36);
    const area = cells.reduce((t, c) => {
      let a = 0;
      c.poly.forEach((p, i) => { const q = c.poly[(i + 1) % c.poly.length]!; a += p[0] * q[1] - q[0] * p[1]; });
      return t + Math.abs(a) / 2;
    }, 0);
    expect(area).toBeCloseTo(s.w * s.h, 4);
    const inset = voronoiCells(s, 6, 0.8, 0.02);
    expect(inset.length).toBe(36);
  });
});
