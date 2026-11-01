import { describe, expect, it } from 'vitest';
import {
  addAccessory, categoryCoverage, currentOutfit, defaultWardrobe, garmentChoice, hexToHsl, hslToHex, makeOutfit,
  normalizeHex, outfitFor, randomOutfit, resolveOutfit, setLayer, validateOutfit, validateWardrobe,
} from '../../../src/characters/outfits';
import { Rng, seedRng } from '../../../src/core/rng';
import { OUTFIT_CATEGORIES } from '../../../src/core/types';
import type { Wardrobe } from '../../../src/core/types';
import { emptyContent, fixtureContent } from './fixtures';

const content = fixtureContent();
const g = (id: string) => {
  const def = content.garments[id];
  if (!def) throw new Error(`fixture garment ${id} missing`);
  return def;
};

describe('resolveOutfit', () => {
  it('returns layers in draw order shoes, bottom, top, outer', () => {
    const o = makeOutfit('o1', 'Test', {
      outer: garmentChoice(g('hoodie')), top: garmentChoice(g('tee')), shoes: garmentChoice(g('sneakers')), bottom: garmentChoice(g('jeans')),
    });
    const r = resolveOutfit(o, content);
    expect(r.layers.map((l) => l.layer)).toEqual(['shoes', 'bottom', 'top', 'outer']);
    expect(r.layers.map((l) => l.def.id)).toEqual(['sneakers', 'jeans', 'tee', 'hoodie']);
    expect(r.issues).toEqual([]);
  });

  it('lets a full garment exclude top and bottom', () => {
    const o = makeOutfit('o1', 'Test', {
      top: garmentChoice(g('tee')), bottom: garmentChoice(g('jeans')), full: garmentChoice(g('dress')), shoes: garmentChoice(g('sandals')),
    });
    const r = resolveOutfit(o, content);
    expect(r.layers.map((l) => l.layer)).toEqual(['shoes', 'full']);
  });

  it('reports and skips unknown garments and accessories, and wrong layers', () => {
    const o = makeOutfit('o1', 'Test', {
      top: { garmentId: 'ghost-shirt', color: '#ffffff', pattern: 'solid', patternColor: '#000000' },
      bottom: garmentChoice(g('tee')), // a top in the bottom slot
      shoes: garmentChoice(g('sneakers')),
    }, [{ accessoryId: 'ghost-hat', color: '#000000' }, { accessoryId: 'watch', color: 'nope' }]);
    const r = resolveOutfit(o, content);
    expect(r.layers.map((l) => l.def.id)).toEqual(['sneakers']);
    expect(r.issues.some((i) => i.includes('ghost-shirt'))).toBe(true);
    expect(r.issues.some((i) => i.includes('cannot be worn as bottom'))).toBe(true);
    expect(r.issues.some((i) => i.includes('ghost-hat'))).toBe(true);
    expect(r.accessories).toHaveLength(1);
    expect(r.accessories[0]?.color).toBe('#333333'); // invalid colour falls back to the default
  });

  it('a full garment that cannot be resolved does not hide top and bottom', () => {
    const o = makeOutfit('o1', 'Test', {
      top: garmentChoice(g('tee')), bottom: garmentChoice(g('jeans')),
      full: { garmentId: 'missing-dress', color: '#ffffff', pattern: 'solid', patternColor: '#000000' },
    });
    expect(resolveOutfit(o, content).layers.map((l) => l.layer)).toEqual(['bottom', 'top']);
  });

  it('sanitises disallowed patterns and invalid colours', () => {
    const o = makeOutfit('o1', 'Test', { top: { garmentId: 'tee', color: 'red', pattern: 'plaid', patternColor: '#123456' } });
    const r = resolveOutfit(o, content);
    expect(r.layers[0]?.choice.pattern).toBe('solid');
    expect(r.layers[0]?.choice.color).toBe('#777777');
    expect(r.issues.some((i) => i.includes('plaid'))).toBe(true);
  });
});

describe('validateOutfit', () => {
  const ok = makeOutfit('o', 'Everyday', { top: garmentChoice(g('tee')), bottom: garmentChoice(g('jeans')), shoes: garmentChoice(g('sneakers')) });

  it('accepts top + bottom + shoes and full + shoes', () => {
    expect(validateOutfit(ok, 'everyday', content)).toEqual([]);
    const dress = makeOutfit('o', 'Dress', { full: garmentChoice(g('dress')), shoes: garmentChoice(g('sandals')) });
    expect(validateOutfit(dress, 'everyday', content)).toEqual([]);
  });

  it('requires a body layer and shoes except for sleep and swim', () => {
    const topOnly = makeOutfit('o', 'x', { top: garmentChoice(g('tee')) });
    const issues = validateOutfit(topOnly, 'everyday', content);
    expect(issues).toContain('Add a bottom or choose a full outfit.');
    expect(issues).toContain('Choose shoes.');
    expect(validateOutfit(makeOutfit('o', 'x', { full: garmentChoice(g('nightgown')) }), 'sleep', content)).toEqual([]);
    expect(validateOutfit(makeOutfit('o', 'x', { full: garmentChoice(g('swimsuit')) }), 'swim', content)).toEqual([]);
    expect(validateOutfit(makeOutfit('o', 'x', {}), 'swim', content)).toEqual(['Choose a top and a bottom, or a full outfit.']);
  });

  it('requires garments tagged for the category and ready', () => {
    const issues = validateOutfit(makeOutfit('o', 'x', { top: garmentChoice(g('pj-top')), bottom: garmentChoice(g('jeans')), shoes: garmentChoice(g('oxfords')) }), 'formal', content);
    expect(issues.some((i) => i.includes('pj top is not suitable for Formal'))).toBe(true);
    expect(issues.some((i) => i.includes('jeans is not suitable for Formal'))).toBe(true);
    const dev = validateOutfit(makeOutfit('o', 'x', { ...ok.layers, outer: garmentChoice(g('cape')) }), 'everyday', content);
    expect(dev.some((i) => i.includes('not finished'))).toBe(true);
  });

  it('flags unknown garments, bad patterns, duplicate accessory kinds and full+top combinations', () => {
    const o = makeOutfit('o', 'x', {
      top: { garmentId: 'tee', color: '#ffffff', pattern: 'plaid', patternColor: '#000000' },
      bottom: garmentChoice(g('jeans')), full: garmentChoice(g('dress')),
      shoes: { garmentId: 'moon-boots', color: '#ffffff', pattern: 'solid', patternColor: '#000000' },
    }, [{ accessoryId: 'cap', color: '#000000' }, { accessoryId: 'beanie', color: '#000000' }]);
    const issues = validateOutfit(o, 'everyday', content);
    expect(issues.some((i) => i.includes('moon-boots'))).toBe(true);
    expect(issues.some((i) => i.includes('pattern "plaid"'))).toBe(true);
    expect(issues.some((i) => i.includes('Only one hat'))).toBe(true);
    expect(issues.some((i) => i.includes('full outfit replaces'))).toBe(true);
  });

  it('only demands what the content can provide unless strict', () => {
    const empty = emptyContent();
    expect(validateOutfit(makeOutfit('o', 'x', {}), 'everyday', empty)).toEqual([]);
    expect(validateOutfit(makeOutfit('o', 'x', {}), 'everyday', empty, { strict: true }).length).toBe(2);
    expect(categoryCoverage(content, 'swim')).toEqual({ body: true, shoes: true });
  });
});

describe('wardrobe helpers', () => {
  const w: Wardrobe = defaultWardrobe(content, new Rng(seedRng(3)));

  it('currentOutfit and outfitFor pick the worn outfit or the first of a category', () => {
    const second = { ...w.outfits.everyday[0]!, id: 'out-everyday-2', name: 'Second' };
    const ww: Wardrobe = { ...w, outfits: { ...w.outfits, everyday: [w.outfits.everyday[0]!, second] }, current: { category: 'everyday', index: 1 } };
    expect(currentOutfit({ outfits: ww }).id).toBe('out-everyday-2');
    expect(outfitFor({ outfits: ww }, 'everyday').id).toBe('out-everyday-2');
    expect(outfitFor({ outfits: ww }, 'sleep').id).toBe(ww.outfits.sleep[0]!.id);
    const broken: Wardrobe = { ...ww, current: { category: 'formal', index: 9 } };
    expect(currentOutfit({ outfits: broken }).id).toBe(ww.outfits.formal[0]!.id);
    const noSwim: Wardrobe = { ...ww, outfits: { ...ww.outfits, swim: [] } };
    expect(outfitFor({ outfits: noSwim }, 'swim').id).toBe('out-everyday-2');
  });

  it('setLayer resolves full/top/bottom conflicts with a note', () => {
    const base = makeOutfit('o', 'x', { top: garmentChoice(g('tee')), bottom: garmentChoice(g('jeans')) });
    const r1 = setLayer(base, 'full', garmentChoice(g('dress')));
    expect(Object.keys(r1.outfit.layers)).toEqual(['full']);
    expect(r1.note).toMatch(/replaces the top and bottom/);
    const r2 = setLayer(r1.outfit, 'top', garmentChoice(g('shirt')));
    expect(Object.keys(r2.outfit.layers)).toEqual(['top']);
    expect(r2.note).toMatch(/replaces the full outfit/);
    expect(base.layers.top).toBeDefined(); // input untouched
  });

  it('addAccessory keeps one item per kind and caps the count', () => {
    let o = makeOutfit('o', 'x', {});
    const add = (id: string) => {
      const r = addAccessory(o, content.accessories[id]!, content);
      if (r.ok) o = r.outfit;
      return r;
    };
    add('cap');
    const r = add('beanie');
    expect(r.ok && r.note).toMatch(/Only one hat/);
    expect(o.accessories.map((a) => a.accessoryId)).toEqual(['beanie']);
    add('watch'); add('pendant'); add('glasses-round');
    expect(o.accessories).toHaveLength(4);
    expect(add('scarf-wool').ok).toBe(false); // a fifth item
    expect(add('cap').ok).toBe(true); // replacing the hat keeps the count
    expect(o.accessories.map((a) => a.accessoryId)).toEqual(['watch', 'pendant', 'glasses-round', 'cap']);
  });

  it('defaultWardrobe gives one valid outfit per category, deterministically', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const ward = defaultWardrobe(content, new Rng(seedRng(seed)));
      for (const cat of OUTFIT_CATEGORIES) expect(ward.outfits[cat]).toHaveLength(1);
      expect(validateWardrobe(ward, content)).toEqual([]);
    }
    expect(defaultWardrobe(content, new Rng(seedRng(9)))).toEqual(defaultWardrobe(content, new Rng(seedRng(9))));
    const plain = defaultWardrobe(content, new Rng(seedRng(9)), { plain: true });
    for (const cat of OUTFIT_CATEGORIES) {
      expect(plain.outfits[cat][0]!.accessories).toEqual([]);
      for (const choice of Object.values(plain.outfits[cat][0]!.layers)) expect(choice?.pattern).toBe('solid');
    }
  });

  it('keeps glasses consistent across daytime outfits', () => {
    const ward = defaultWardrobe(content, new Rng(seedRng(5)), { glasses: 'glasses-round' });
    for (const cat of ['everyday', 'formal', 'work', 'athletic'] as const) {
      expect(ward.outfits[cat][0]!.accessories.some((a) => a.accessoryId === 'glasses-round')).toBe(true);
    }
    expect(ward.outfits.sleep[0]!.accessories.some((a) => a.accessoryId === 'glasses-round')).toBe(false);
  });

  it('random outfits use harmonised, valid colours', () => {
    const rng = new Rng(seedRng(11));
    for (let i = 0; i < 30; i++) {
      for (const cat of OUTFIT_CATEGORIES) {
        const o = randomOutfit(rng, content, cat);
        expect(validateOutfit(o, cat, content)).toEqual([]);
        for (const c of Object.values(o.layers)) expect(c?.color).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('works with empty content', () => {
    const ward = defaultWardrobe(emptyContent(), new Rng(seedRng(1)));
    expect(ward.outfits.everyday[0]!.layers).toEqual({});
    expect(validateWardrobe(ward, emptyContent())).toEqual([]);
  });
});

describe('colour helpers', () => {
  it('round-trips HSL and normalises hex', () => {
    for (const hex of ['#d9774b', '#2f8f83', '#000000', '#ffffff', '#3a2619']) {
      const [h, s, l] = hexToHsl(hex);
      expect(hslToHex(h, s, l)).toBe(hex);
    }
    expect(normalizeHex('#ABC', '#000000')).toBe('#aabbcc');
    expect(normalizeHex('blue', '#000000')).toBe('#000000');
  });
});
