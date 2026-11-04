// Detail-map painters: the pure side (mapKit.ts) with a fake image provider, and the shipped map files.
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FLOOR_DESIGNS, WALL_DESIGNS } from '../../../src/content/surfaces';
import type { SurfaceDesign } from '../../../src/content/types';
import { MAP_IDS, MOTIF_IDS, MURAL_IDS, designMaps, drawMapRect, setSurfaceMapProvider } from '../../../src/render/textures/mapKit';
import { paintDesign, textureLayout } from '../../../src/render/textures/painters';
import { FakeCanvas } from './fakeCanvas';

const ALL: SurfaceDesign[] = [...WALL_DESIGNS, ...FLOOR_DESIGNS];
const MAP_DESIGNS = ALL.filter((d) => designMaps(d).length > 0);

/** FakeCanvas that also records image draws (the real canvas has drawImage; the plain fake does not). */
class ImageCanvas extends FakeCanvas {
  images: Array<[number, number, number, number]> = [];
  drawImage(_image: unknown, dx: number, dy: number, dw: number, dh: number): void {
    for (const v of [dx, dy, dw, dh]) if (!Number.isFinite(v)) throw new Error('non-finite drawImage');
    this.images.push([dx, dy, dw, dh]);
    this.log.push(`img ${dx.toFixed(4)},${dy.toFixed(4)},${dw.toFixed(4)},${dh.toFixed(4)}`);
  }
}

afterEach(() => setSurfaceMapProvider(null));

describe('detail maps', () => {
  const listIds = (sub: string) => {
    const dir = resolve(__dirname, '../../../public/assets/surfaces', sub);
    return readdirSync(dir).filter((f) => f.endsWith('.webp')).map((f) => f.replace(/\.webp$/, '')).sort();
  };
  const sizes = (sub: string, ids: readonly string[]) => ids.map((id) => statSync(resolve(__dirname, '../../../public/assets/surfaces', sub, `${id}.webp`)).size);

  it('lists the maps, motifs and murals that exist on disk (the generated id lists) and no stray files', () => {
    expect(listIds('')).toEqual([...MAP_IDS].sort());
    expect(listIds('motifs')).toEqual([...MOTIF_IDS].sort());
    expect(listIds('murals')).toEqual([...MURAL_IDS].sort());
    for (const id of [...MAP_IDS, ...MOTIF_IDS, ...MURAL_IDS]) expect(id, id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    // the three kinds never share an id: a design param names one image without a kind
    expect(new Set([...MAP_IDS, ...MOTIF_IDS, ...MURAL_IDS]).size).toBe(MAP_IDS.length + MOTIF_IDS.length + MURAL_IDS.length);
  });

  it('keeps the image files small', () => {
    for (const n of sizes('', MAP_IDS)) expect(n).toBeLessThan(150 * 1024);
    for (const n of sizes('motifs', MOTIF_IDS)) expect(n).toBeLessThan(60 * 1024);
    for (const n of sizes('murals', MURAL_IDS)) expect(n).toBeLessThan(150 * 1024);
    expect(sizes('', MAP_IDS).reduce((a, b) => a + b, 0)).toBeLessThan(0.08 * 1024 * 1024 * MAP_IDS.length + 0.4 * 1024 * 1024);
  });

  it('uses every shipped map, motif and mural in at least one design', () => {
    const used = new Set(MAP_DESIGNS.flatMap((d) => designMaps(d)));
    for (const id of [...MAP_IDS, ...MOTIF_IDS, ...MURAL_IDS]) expect(used.has(id), id).toBe(true);
  });

  it('designMaps reads map, ground, motif, motif2 and mural, and ignores procedural motif names', () => {
    expect(designMaps({ params: { map: 'grain-oak' } })).toEqual(['grain-oak']);
    expect(designMaps({ params: { motif: 'chevron', size: 0.3 } })).toEqual([]);
    expect(designMaps({ params: { motif: 0.48 } })).toEqual([]);
    const m = MOTIF_IDS[0] ?? 'x', u = MURAL_IDS[0] ?? 'y';
    expect(designMaps({ params: { motif: m, motif2: m, ground: 'paper-linen', mural: u, map: '' } })).toEqual(['paper-linen', m, u]);
    expect(designMaps({ params: { motif: m, motif2: '', ground: '' } })).toEqual([m]);
  });

  it('drawMapRect tiles the rectangle and overdraws by a pixel fraction', () => {
    const ctx = new ImageCanvas();
    expect(drawMapRect(ctx, {}, 0, 0, 1, 1, 0.5, 0, 0, 100)).toBe(true);
    expect(ctx.images).toHaveLength(4);
    expect(ctx.images[0]?.[2]).toBeCloseTo(0.5 + 0.006, 6);
    expect(ctx.depth).toBe(0);
    // phase: tiles start before the rectangle when the origin is offset
    const shifted = new ImageCanvas();
    drawMapRect(shifted, {}, 0, 0, 1, 1, 0.5, -0.2, -0.2, 100);
    expect(shifted.images).toHaveLength(9);
  });

  it('draws nothing without an image or a canvas that can draw images', () => {
    expect(drawMapRect(new ImageCanvas(), null, 0, 0, 1, 1, 0.5, 0, 0, 100)).toBe(false);
    expect(drawMapRect(new FakeCanvas(), {}, 0, 0, 1, 1, 0.5, 0, 0, 100)).toBe(false);
  });
});

describe('map painters', () => {
  it('paint a flat fallback (no image draws) while no map is available, and still paint something', () => {
    for (const d of MAP_DESIGNS) {
      const ctx = new ImageCanvas();
      paintDesign(ctx, d, d.palettes[0]?.id ?? '', textureLayout(d, 64));
      expect(ctx.images, d.id).toHaveLength(0);
      expect(ctx.depth, d.id).toBe(0);
      expect(ctx.calls, d.id).toBeGreaterThan(20);
    }
  });

  it('draw tinted map images when the provider has them, balanced and deterministic', () => {
    const asked: string[] = [];
    setSurfaceMapProvider((id, colors) => { asked.push(`${id}|${colors.slice(0, 3).join(',')}`); return { id }; });
    for (const d of MAP_DESIGNS) {
      const pal = d.palettes[1] ?? d.palettes[0];
      const a = new ImageCanvas(), b = new ImageCanvas();
      paintDesign(a, d, pal?.id ?? '', textureLayout(d, 64));
      paintDesign(b, d, pal?.id ?? '', textureLayout(d, 64));
      expect(a.images.length, d.id).toBeGreaterThan(0);
      expect(a.depth, d.id).toBe(0);
      expect(a.log, d.id).toEqual(b.log);
    }
    // the palette decides the tint: the provider is asked with the palette's colours
    expect(asked.some((q) => q.startsWith('grain-oak|'))).toBe(true);
    const oak = FLOOR_DESIGNS.find((d) => d.id === 'oak-wide-boards') as SurfaceDesign;
    const colours = (oak.palettes[1]?.colors ?? []).slice(0, 3).join(',');
    expect(asked).toContain(`grain-oak|${colours}`);
  });

  it('keep the layout the same across palettes when images are available', () => {
    setSurfaceMapProvider((id) => ({ id }));
    for (const d of MAP_DESIGNS) {
      const strip = (c: ImageCanvas) => c.log.filter((l) => !l.startsWith('fs') && !l.startsWith('ss'));
      const a = new ImageCanvas(), b = new ImageCanvas();
      paintDesign(a, d, d.palettes[0]?.id ?? '', textureLayout(d, 64));
      paintDesign(b, d, d.palettes[2]?.id ?? '', textureLayout(d, 64));
      expect(strip(a), d.id).toEqual(strip(b));
    }
  });
});
