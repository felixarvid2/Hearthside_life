// motif-wall, motif-floor and mural-wall: deterministic, seamless (edge stamps wrap), flat fallback without images,
// validated params.
import { afterEach, describe, expect, it } from 'vitest';
import { FLOOR_DESIGNS, WALL_DESIGNS } from '../../../src/content/surfaces';
import { MOTIF_IDS, MURAL_IDS, setSurfaceMapProvider } from '../../../src/render/textures/mapKit';
import { motifStamps } from '../../../src/render/textures/motifPainters';
import { PAINTERS, checkParams } from '../../../src/render/textures/painters';
import { resolveParams, type PaintSpec, type ParamValue } from '../../../src/render/textures/painterKit';
import { FakeCanvas } from './fakeCanvas';

/** Records image draws with their centre under the translations that were active (stamps are translate, rotate, draw). */
class TrackCanvas extends FakeCanvas {
  images: Array<{ cx: number; cy: number; dw: number; dh: number; rotated: number }> = [];
  private pos: Array<[number, number, number]> = [[0, 0, 0]];
  override save(): void { super.save(); this.pos.push([...(this.pos[this.pos.length - 1] as [number, number, number])]); }
  override restore(): void { super.restore(); this.pos.pop(); }
  override translate(x: number, y: number): void {
    super.translate(x, y);
    const p = this.pos[this.pos.length - 1] as [number, number, number];
    p[0] += x; p[1] += y;
  }
  override rotate(a: number): void {
    super.rotate(a);
    (this.pos[this.pos.length - 1] as [number, number, number])[2] += a;
  }
  drawImage(_image: unknown, dx: number, dy: number, dw: number, dh: number): void {
    for (const v of [dx, dy, dw, dh]) if (!Number.isFinite(v)) throw new Error('non-finite drawImage');
    const p = this.pos[this.pos.length - 1] as [number, number, number];
    this.images.push({ cx: p[0] + dx + dw / 2, cy: p[1] + dy + dh / 2, dw, dh, rotated: p[2] });
    this.log.push(`img ${dx.toFixed(4)},${dy.toFixed(4)},${dw.toFixed(4)},${dh.toFixed(4)}`);
  }
}

const COLORS = ['#f1e8d8', '#c9707b', '#e3b5b0', '#f5f1e8'];
const motif = MOTIF_IDS[0] ?? '';
const mural = MURAL_IDS[0] ?? '';

function spec(id: string, surface: 'wall' | 'floor', params: Record<string, ParamValue>, w = 1.2): PaintSpec {
  const painter = PAINTERS[id];
  if (!painter) throw new Error(id);
  return { w, h: surface === 'wall' ? 2.8 : w, wrapY: surface === 'floor', colors: COLORS, params: resolveParams(painter, params), seed: 4242, ppm: 100 };
}
function paint(id: string, s: PaintSpec): TrackCanvas {
  const ctx = new TrackCanvas();
  PAINTERS[id]?.paint(ctx, s);
  expect(ctx.depth, id).toBe(0);
  return ctx;
}

afterEach(() => setSurfaceMapProvider(null));

const LAYOUTS = ['grid', 'half-drop', 'brick', 'diagonal', 'scatter', 'trail'];

describe('motif painters: registry and params', () => {
  it('are registered with documented params', () => {
    for (const id of ['motif-wall', 'motif-floor', 'mural-wall']) {
      const p = PAINTERS[id];
      expect(p, id).toBeDefined();
      for (const [k, v] of Object.entries(p?.params ?? {})) expect(v.doc.length, `${id}.${k}`).toBeGreaterThan(5);
    }
    expect(PAINTERS['motif-wall']?.surface).toBe('wall');
    expect(PAINTERS['motif-floor']?.surface).toBe('floor');
    expect(PAINTERS['mural-wall']?.surface).toBe('wall');
  });

  it('validate params with checkParams', () => {
    const wall = PAINTERS['motif-wall'];
    const floor = PAINTERS['motif-floor'];
    if (!wall || !floor) throw new Error('missing painters');
    expect(checkParams(wall, { motif, layout: 'half-drop', cols: 4, rows: 6, size: 0.9, ground: 'paper-linen', motif2: '' })).toEqual([]);
    expect(checkParams(wall, { layout: 'spiral' }).length).toBe(1);
    expect(checkParams(wall, { cols: 0 }).length).toBe(1);
    expect(checkParams(wall, { cols: 2.5 }).length).toBe(1);
    expect(checkParams(wall, { rows: 13 }).length).toBe(1);
    expect(checkParams(wall, { size: 1.3 }).length).toBe(1);
    expect(checkParams(wall, { motif: 'no-such-motif' }).length).toBe(1);
    expect(checkParams(wall, { ground: 'no-such-map' }).length).toBe(1);
    expect(checkParams(wall, { bogus: 1 }).length).toBe(1);
    expect(checkParams(floor, { layout: 'tile', spin: 'quarter', groutColor: 'trim', grout: 0.006 })).toEqual([]);
    expect(checkParams(floor, { layout: 'tile', spin: 'sideways' }).length).toBe(1);
    expect(checkParams(PAINTERS['mural-wall'] as never, { mural, fade: 0.5 })).toEqual([]);
    expect(checkParams(PAINTERS['mural-wall'] as never, { mural: 'nope' }).length).toBe(1);
  });

  it('every shipped design of these painters validates and paints balanced', () => {
    const designs = [...WALL_DESIGNS, ...FLOOR_DESIGNS].filter((d) => ['motif-wall', 'motif-floor', 'mural-wall'].includes(d.painter));
    expect(designs.length).toBeGreaterThanOrEqual(3);
    for (const d of designs) {
      const p = PAINTERS[d.painter];
      expect(checkParams(p as never, d.params), d.id).toEqual([]);
      const s = spec(d.painter, d.surface, d.params, d.repeat);
      expect(paint(d.painter, s).calls, d.id).toBeGreaterThan(10);
    }
  });
});

describe('motif stamps', () => {
  const base = { motif, motif2: motif, cols: 3, rows: 4, size: 0.8, rotJitter: 20, scaleJitter: 0.2, mirror: true };

  it('are deterministic and independent of the palette', () => {
    for (const layout of LAYOUTS) {
      const a = motifStamps(spec('motif-wall', 'wall', { ...base, layout }));
      const b = motifStamps({ ...spec('motif-wall', 'wall', { ...base, layout }), colors: ['#000000', '#111111', '#222222', '#333333'] });
      expect(a.length, layout).toBeGreaterThan(0);
      expect(a, layout).toEqual(b);
      const c = motifStamps({ ...spec('motif-wall', 'wall', { ...base, layout }), seed: 7 });
      if (layout === 'scatter') expect(c, layout).not.toEqual(a);
    }
  });

  it('stay finite, inside the repeat horizontally and sized as asked', () => {
    for (const layout of LAYOUTS) for (const surface of ['wall', 'floor'] as const) {
      const s = spec(surface === 'wall' ? 'motif-wall' : 'motif-floor', surface, { ...base, layout });
      for (const st of motifStamps(s)) {
        expect(Number.isFinite(st.x + st.y + st.size + st.rot), layout).toBe(true);
        expect(st.x, layout).toBeGreaterThanOrEqual(0);
        expect(st.x, layout).toBeLessThan(s.w);
        if (surface === 'floor') { expect(st.y).toBeGreaterThanOrEqual(0); expect(st.y).toBeLessThan(s.h); }
        expect(st.size, layout).toBeGreaterThan(0);
        expect(st.size, layout).toBeLessThanOrEqual(Math.min(s.w / 4, s.h / 4) * 1.3);
      }
    }
  });

  it('use an even column count for half-drop and diagonal so the repeat stays seamless', () => {
    const s = spec('motif-wall', 'wall', { motif, layout: 'half-drop', cols: 3, rows: 4 });
    const xs = new Set(motifStamps(s).map((st) => st.x.toFixed(4)));
    expect(xs.size).toBe(4);
    const s2 = spec('motif-wall', 'wall', { motif, layout: 'grid', cols: 3, rows: 4 });
    expect(new Set(motifStamps(s2).map((st) => st.x.toFixed(4))).size).toBe(3);
  });

  it('wrap: a stamp that crosses the repeat edge is drawn again one repeat over, both ways', () => {
    setSurfaceMapProvider(() => ({}));
    for (const layout of LAYOUTS) for (const surface of ['wall', 'floor'] as const) {
      const id = surface === 'wall' ? 'motif-wall' : 'motif-floor';
      const s = spec(id, surface, { ...base, motif2: '', layout, scale: 1 });
      const ctx = paint(id, s);
      const near = (cx: number, cy: number) => ctx.images.some((im) => Math.abs(im.cx - cx) < 1e-6 && Math.abs(im.cy - cy) < 1e-6);
      for (const st of motifStamps(s)) {
        const r = st.size * 0.75;
        if (surface === 'wall' && (st.y + r <= 0 || st.y - r >= s.h)) continue; // outside the wall: not drawn at all
        if (st.x - r < 0) expect(near(st.x + s.w, st.y), `${layout} ${surface} left`).toBe(true);
        if (st.x + r > s.w) expect(near(st.x - s.w, st.y), `${layout} ${surface} right`).toBe(true);
        if (surface === 'floor') {
          if (st.y - r < 0) expect(near(st.x, st.y + s.h), `${layout} floor top`).toBe(true);
          if (st.y + r > s.h) expect(near(st.x, st.y - s.h), `${layout} floor bottom`).toBe(true);
        }
      }
    }
  });
});

describe('motif painters: images and fallback', () => {
  it('draw the motif images when the provider has them (tinted with the motif colour) and are deterministic', () => {
    const asked: string[] = [];
    setSurfaceMapProvider((id, colors, kind) => { asked.push(`${kind}:${id}|${colors.join(',')}`); return { id }; });
    const params = { motif, motif2: motif, ground: 'paper-linen', layout: 'grid', cols: 2, rows: 3 };
    const a = paint('motif-wall', spec('motif-wall', 'wall', params));
    const b = paint('motif-wall', spec('motif-wall', 'wall', params));
    expect(a.images.length).toBeGreaterThan(0);
    expect(a.log).toEqual(b.log);
    expect(asked).toContain(`motif:${motif}|${COLORS[1]}`);
    expect(asked).toContain(`motif:${motif}|${COLORS[2]}`);
    expect(asked.some((q) => q.startsWith('material:paper-linen|'))).toBe(true);
    // the ground map is tinted around the ground colour at low contrast: the base colour is the ground itself
    expect(asked.find((q) => q.startsWith('material:paper-linen|'))?.split('|')[1]?.split(',')[0]).toBe(COLORS[0]);
  });

  it('fall back to flat dots and diamonds of the same layout without images', () => {
    for (const layout of LAYOUTS) {
      const params = { motif, motif2: motif, layout, cols: 3, rows: 3, ground: 'paper-linen' };
      const plain = paint('motif-wall', spec('motif-wall', 'wall', params));
      expect(plain.images, layout).toHaveLength(0);
      expect(plain.calls, layout).toBeGreaterThan(20);
      // a canvas without drawImage paints the same fallback
      const bare = new FakeCanvas();
      PAINTERS['motif-wall']?.paint(bare, spec('motif-wall', 'wall', params));
      expect(bare.depth).toBe(0);
      expect(bare.log).toEqual(plain.log);
    }
  });

  it('floor tiles: n x n tiles, each a motif centred and turned by the spin rule, with grout', () => {
    setSurfaceMapProvider(() => ({}));
    const spun = paint('motif-floor', spec('motif-floor', 'floor', { motif, layout: 'tile', cols: 4, spin: 'quarter', size: 0.7 }, 2));
    expect(spun.images).toHaveLength(16);
    const turns = new Set(spun.images.map((im) => (Math.round((im.rotated / (Math.PI / 2)) % 4) + 4) % 4));
    expect([...turns].sort()).toEqual([0, 1, 2, 3]);
    const flat = paint('motif-floor', spec('motif-floor', 'floor', { motif, layout: 'tile', cols: 4, spin: 'none' }, 2));
    expect(new Set(flat.images.map((im) => im.rotated))).toEqual(new Set([0]));
    const random = paint('motif-floor', spec('motif-floor', 'floor', { motif, layout: 'tile', cols: 4, spin: 'random' }, 2));
    const again = paint('motif-floor', spec('motif-floor', 'floor', { motif, layout: 'tile', cols: 4, spin: 'random' }, 2));
    expect(random.log).toEqual(again.log);
    // filler motif on the tile corners wraps at the edges
    const corners = paint('motif-floor', spec('motif-floor', 'floor', { motif, motif2: motif, layout: 'tile', cols: 3 }, 2));
    expect(corners.images.length).toBeGreaterThan(9 + 9);
  });

  it('mural-wall stretches the mural over the whole repeat, tinted as a tritone, with fade and skirting', () => {
    const asked: string[] = [];
    setSurfaceMapProvider((id, colors, kind) => { asked.push(`${kind}:${id}|${colors.slice(0, 3).join(',')}`); return { id }; });
    const s = spec('mural-wall', 'wall', { mural, fade: 0.6, skirt: 0.1 }, 5.6);
    const ctx = paint('mural-wall', s);
    expect(ctx.images).toHaveLength(1);
    expect(ctx.images[0]).toMatchObject({ dw: 5.6, dh: 2.8 });
    expect(asked).toEqual([`mural:${mural}|${COLORS.slice(0, 3).join(',')}`]);
    const mirrored = paint('mural-wall', spec('mural-wall', 'wall', { mural, mirror: true }, 5.6));
    expect(mirrored.log.some((l) => l.startsWith('sc'))).toBe(true);
  });

  it('mural-wall paints a flat fallback without the image', () => {
    const ctx = paint('mural-wall', spec('mural-wall', 'wall', { mural, fade: 1 }, 5.6));
    expect(ctx.images).toHaveLength(0);
    expect(ctx.calls).toBeGreaterThan(10);
  });
});
