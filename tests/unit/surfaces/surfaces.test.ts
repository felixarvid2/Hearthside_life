import { describe, expect, it } from 'vitest';
import {
  FLOOR_DESIGNS, FLOOR_FAMILIES, OPENINGS, WALL_DESIGNS, WALL_FAMILIES, colorMetrics, defaultFinish, findPalette,
  paletteTone, tierForPrice,
} from '../../../src/content/surfaces';
import type { SurfaceDesign } from '../../../src/content/types';

const HEX = /^#[0-9a-f]{6}$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PACKS = new Set([
  'everyday-essentials', 'modern-minimal', 'cozy-cottage', 'mid-century', 'classic-townhouse', 'industrial-loft',
  'coastal-home', 'art-deco', 'botanical-living', 'kids-storybook', 'creative-studio', 'garden-patio',
]);

function unique(ids: string[]): boolean { return new Set(ids).size === ids.length; }

describe('surface catalog', () => {
  it('has the Milestone 1 counts', () => {
    expect(WALL_DESIGNS.filter((d) => d.status === 'ready')).toHaveLength(12);
    expect(FLOOR_DESIGNS.filter((d) => d.status === 'ready')).toHaveLength(8);
    expect(OPENINGS.length).toBeGreaterThanOrEqual(4);
  });

  it('uses unique, kebab-case ids across walls, floors and openings', () => {
    const all = [...WALL_DESIGNS, ...FLOOR_DESIGNS, ...OPENINGS].map((d) => d.id);
    expect(unique(all)).toBe(true);
    for (const id of all) expect(id).toMatch(ID);
  });

  it('contains the shared ids other modules rely on', () => {
    const walls = new Set(WALL_DESIGNS.map((d) => d.id));
    const floors = new Set(FLOOR_DESIGNS.map((d) => d.id));
    for (const id of ['plain-paint', 'subway-tile', 'stripes-regency', 'brick-classic']) expect(walls.has(id), id).toBe(true);
    for (const id of ['oak-planks', 'checker-tile', 'carpet-plush', 'hex-mosaic', 'stone-pavers']) expect(floors.has(id), id).toBe(true);
    const byId = Object.fromEntries(OPENINGS.map((o) => [o.id, o]));
    expect(byId['door-panel']?.kind).toBe('door');
    expect(byId['door-glazed']?.kind).toBe('door');
    expect(byId['window-sash']?.kind).toBe('window');
    expect(byId['window-wide']?.kind).toBe('window');
  });

  it('gives every wall design its own family (one per family) and a known family id', () => {
    const fam = new Set(WALL_FAMILIES.map((f) => f.id));
    expect(unique(WALL_DESIGNS.map((d) => d.family))).toBe(true);
    for (const d of WALL_DESIGNS) expect(fam.has(d.family), d.id).toBe(true);
    const ffam = new Set(FLOOR_FAMILIES.map((f) => f.id));
    for (const d of FLOOR_DESIGNS) expect(ffam.has(d.family), d.id).toBe(true);
  });

  const checkDesign = (d: SurfaceDesign, minPalettes: number) => {
    expect(d.name.length, d.id).toBeGreaterThan(2);
    expect(d.description.length, d.id).toBeGreaterThan(20);
    expect(d.tags.length, d.id).toBeGreaterThanOrEqual(3);
    expect(d.packs.length, d.id).toBeGreaterThan(0);
    for (const p of d.packs) expect(PACKS.has(p), `${d.id} pack ${p}`).toBe(true);
    expect(Number.isInteger(d.price) && d.price > 0, d.id).toBe(true);
    expect(tierForPrice(d.surface, d.price), `${d.id} tier`).toBe(d.tier);
    expect(d.repeat, d.id).toBeGreaterThan(0.1);
    expect(d.repeat, d.id).toBeLessThanOrEqual(4);
    expect(d.palettes.length, d.id).toBeGreaterThanOrEqual(minPalettes);
    expect(unique(d.palettes.map((p) => p.id)), `${d.id} palette ids`).toBe(true);
    expect(unique(d.palettes.map((p) => p.name)), `${d.id} palette names`).toBe(true);
    expect(unique(d.palettes.map((p) => p.colors.join())), `${d.id} palette colours`).toBe(true);
    const len = d.palettes[0]?.colors.length;
    for (const p of d.palettes) {
      expect(p.id, d.id).toMatch(ID);
      expect(p.name.length).toBeGreaterThan(2);
      expect(p.colors.length, `${d.id}/${p.id}`).toBe(len);
      for (const c of p.colors) expect(c, `${d.id}/${p.id}`).toMatch(HEX);
    }
  };

  it('walls: complete entries with at least 8 curated palettes', () => {
    for (const d of WALL_DESIGNS) { expect(d.surface).toBe('wall'); checkDesign(d, 8); }
  });

  it('floors: complete entries with at least 6 palette variants', () => {
    for (const d of FLOOR_DESIGNS) { expect(d.surface).toBe('floor'); checkDesign(d, 6); }
  });

  it('every wall design offers light, dark, neutral and accent palettes', () => {
    for (const d of WALL_DESIGNS) {
      const tones = new Set(d.palettes.map(paletteTone));
      expect([...tones].sort(), d.id).toEqual(['accent', 'dark', 'light', 'neutral']);
    }
  });

  it('every floor design offers at least three distinct tones', () => {
    for (const d of FLOOR_DESIGNS) expect(new Set(d.palettes.map(paletteTone)).size, d.id).toBeGreaterThanOrEqual(3);
  });

  it('classifies tones sensibly', () => {
    expect(paletteTone({ id: 'a', name: 'a', colors: ['#ffffff'] })).toBe('light');
    expect(paletteTone({ id: 'a', name: 'a', colors: ['#202020'] })).toBe('dark');
    expect(paletteTone({ id: 'a', name: 'a', colors: ['#d4442f'] })).toBe('accent');
    expect(paletteTone({ id: 'a', name: 'a', colors: ['#9a9a9a'] })).toBe('neutral');
    expect(colorMetrics('#000000').lightness).toBeCloseTo(0, 5);
    expect(colorMetrics('#ffffff').lightness).toBeCloseTo(100, 1);
  });

  it('palette lookup falls back to the default palette', () => {
    const d = WALL_DESIGNS[0] as SurfaceDesign;
    expect(findPalette(d, 'missing')).toBe(d.palettes[0]);
    expect(findPalette(d, d.palettes[2]?.id ?? '')).toBe(d.palettes[2]);
    expect(defaultFinish(d)).toEqual({ designId: d.id, paletteId: d.palettes[0]?.id });
  });

  it('openings have consistent sizes and styles', () => {
    for (const o of OPENINGS) {
      expect(o.width, o.id).toBe(1);
      expect(Number.isInteger(o.price) && o.price > 0).toBe(true);
      const hole = o.style.holeWidth;
      expect(typeof hole === 'number' && hole > 0.5 && hole <= 0.96, o.id).toBe(true);
      const casing = o.style.casing;
      expect(typeof casing === 'number' && (hole as number) / 2 + casing <= o.width / 2, `${o.id} casing fits the tile`).toBe(true);
      if (o.kind === 'door') {
        expect(o.height).toBeCloseTo(2.1, 5);
        expect(o.sill).toBe(0);
        expect(['panel', 'glazed', 'plank']).toContain(o.style.leaf);
      } else {
        expect(o.sill).toBeGreaterThan(0.5);
        expect(o.sill + o.height).toBeLessThanOrEqual(2.2);
        expect(['sash', 'casement', 'fixed']).toContain(o.style.window);
      }
      for (const k of ['frameColor', 'hardware', 'leafColor']) {
        const v = o.style[k];
        if (v !== undefined) expect(v, `${o.id}.${k}`).toMatch(HEX);
      }
    }
    const sash = OPENINGS.find((o) => o.id === 'window-sash');
    expect(sash?.sill).toBeCloseTo(0.9, 5);
    expect(sash?.height).toBeCloseTo(1.2, 5);
  });
});
