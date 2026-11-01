// Creator thumbnails: every garment and accessory gets its own small SVG drawn from its build parameters.
import { describe, expect, it } from 'vitest';
import { ACCESSORIES, GARMENTS } from '../../../src/content/character';
import { accessoryIconSvg, garmentIconSvg } from '../../../src/ui/creator/garmentIcon';

describe('garment and accessory thumbnails', () => {
  it('draws a valid, non-trivial SVG for every garment, distinct from every other garment', () => {
    const seen = new Map<string, string>();
    for (const g of GARMENTS) {
      const svg = garmentIconSvg(g);
      expect(svg, g.id).toMatch(/^<svg viewBox="0 0 48 48"[^>]*>.+<\/svg>$/s);
      expect(svg.includes('NaN') || svg.includes('undefined') || svg.includes('Infinity'), `${g.id} has bad numbers`).toBe(false);
      expect(svg.length, g.id).toBeGreaterThan(160);
      // the colour is the garment's own
      expect(svg.toLowerCase(), g.id).toContain(g.defaultColor.toLowerCase().slice(0, 4));
      // identical outlines may only differ by colour: compare with the colour removed
      const shape = svg.replace(/#[0-9a-f]{6}/gi, '#');
      expect(seen.has(shape), `${g.id} looks the same as ${seen.get(shape)}`).toBe(false);
      seen.set(shape, g.id);
    }
  });

  it('recolours with the chosen colour', () => {
    const g = GARMENTS.find((x) => x.id === 'hoodie')!;
    expect(garmentIconSvg(g, '#123456')).toContain('#123456');
    expect(garmentIconSvg(g, '#123456')).not.toContain(g.defaultColor);
  });

  it('draws every accessory, distinct from the others', () => {
    const seen = new Map<string, string>();
    for (const a of ACCESSORIES) {
      const svg = accessoryIconSvg(a);
      expect(svg, a.id).toMatch(/^<svg viewBox="0 0 48 48"[^>]*>.+<\/svg>$/s);
      expect(svg.includes('NaN') || svg.includes('undefined'), a.id).toBe(false);
      const shape = svg.replace(/#[0-9a-f]{6}/gi, '#');
      expect(seen.has(shape), `${a.id} looks the same as ${seen.get(shape)}`).toBe(false);
      seen.set(shape, a.id);
    }
  });
});
