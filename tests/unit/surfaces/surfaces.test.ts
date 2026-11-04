import { describe, expect, it } from 'vitest';
import {
  FLOOR_DESIGNS, FLOOR_FAMILIES, OPENINGS, WALL_DESIGNS, WALL_FAMILIES, colorMetrics, defaultFinish, findPalette,
  paletteTone, tierForPrice,
} from '../../../src/content/surfaces';
import type { SurfaceDesign } from '../../../src/content/types';
import { MAP_IDS, MOTIF_IDS, MURAL_IDS } from '../../../src/render/textures/mapKit';

const HEX = /^#[0-9a-f]{6}$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PACKS = new Set([
  'everyday-essentials', 'modern-minimal', 'cozy-cottage', 'mid-century', 'classic-townhouse', 'industrial-loft',
  'coastal-home', 'art-deco', 'botanical-living', 'kids-storybook', 'creative-studio', 'garden-patio',
]);

function unique(ids: string[]): boolean { return new Set(ids).size === ids.length; }

describe('surface catalog', () => {
  it('has the Milestone 2 counts', () => {
    expect(WALL_DESIGNS.filter((d) => d.status === 'ready').length).toBeGreaterThanOrEqual(48);
    expect(FLOOR_DESIGNS.filter((d) => d.status === 'ready').length).toBeGreaterThanOrEqual(32);
    expect(OPENINGS.filter((o) => o.kind === 'door').length).toBeGreaterThanOrEqual(6);
    expect(OPENINGS.filter((o) => o.kind === 'window').length).toBeGreaterThanOrEqual(8);
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

  it('uses known family ids and covers every family of the brief', () => {
    const fam = new Set(WALL_FAMILIES.map((f) => f.id));
    for (const d of WALL_DESIGNS) expect(fam.has(d.family), d.id).toBe(true);
    expect(new Set(WALL_DESIGNS.map((d) => d.family)).size).toBe(WALL_FAMILIES.length);
    const ffamilies = new Set(FLOOR_DESIGNS.map((d) => d.family));
    expect(ffamilies.size).toBe(FLOOR_FAMILIES.length);
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
    // a mural is one picture over the whole run: its repeat is the mural width
    expect(d.repeat, d.id).toBeLessThanOrEqual(d.painter === 'mural-wall' ? 6 : 4);
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

  it('walls: complete entries with at least 8 curated palettes (murals keep a few art-directed ones)', () => {
    for (const d of WALL_DESIGNS) {
      expect(d.surface).toBe('wall');
      checkDesign(d, d.paletteNote ? 4 : 8);
      if (d.paletteNote) expect(d.paletteNote.length, d.id).toBeGreaterThan(20);
    }
  });

  it('no two designs share a painter and params (distinct layouts, not recolours)', () => {
    for (const list of [WALL_DESIGNS, FLOOR_DESIGNS]) {
      const keys = list.map((d) => `${d.painter}:${JSON.stringify(Object.entries(d.params).sort())}`);
      expect(unique(keys)).toBe(true);
    }
  });

  it('keeps added detail maps and design ids in step', () => {
    for (const d of [...WALL_DESIGNS, ...FLOOR_DESIGNS]) {
      for (const key of ['map', 'ground']) {
        const v = d.params[key];
        if (typeof v === 'string' && v !== '') expect(MAP_IDS as readonly string[], `${d.id} ${key}`).toContain(v);
      }
      // `motif` also names procedural shapes in older painters; only the motif painters take image ids
      if (d.painter === 'motif-wall' || d.painter === 'motif-floor') {
        expect(MOTIF_IDS, `${d.id} motif`).toContain(d.params.motif);
        const m2 = d.params.motif2;
        if (typeof m2 === 'string' && m2 !== '') expect(MOTIF_IDS, `${d.id} motif2`).toContain(m2);
      }
      if (d.painter === 'mural-wall') expect(MURAL_IDS, `${d.id} mural`).toContain(d.params.mural);
    }
  });

  it('floors: complete entries with at least 6 palette variants', () => {
    for (const d of FLOOR_DESIGNS) { expect(d.surface).toBe('floor'); checkDesign(d, 6); }
  });

  it('every wall design offers light, dark, neutral and accent palettes', () => {
    for (const d of WALL_DESIGNS) {
      const tones = new Set(d.palettes.map(paletteTone));
      // art-directed murals only need a light, a dark and a mid scheme
      expect([...tones].sort(), d.id).toEqual(d.paletteNote ? expect.arrayContaining(['dark', 'light']) : ['accent', 'dark', 'light', 'neutral']);
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
        expect(['panel', 'glazed', 'plank', 'flush', 'fullglass', 'dutch', 'louvre']).toContain(o.style.leaf);
      } else {
        expect(o.sill).toBeGreaterThanOrEqual(0.5);
        expect(o.sill + o.height).toBeLessThanOrEqual(2.2 + 1e-9);
        expect(['sash', 'casement', 'fixed', 'slider']).toContain(o.style.window);
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
