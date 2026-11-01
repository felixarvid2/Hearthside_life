// Milestone 3 wardrobe rules with the real catalog: accessory slots (one hat, one necklace, a watch and a bracelet together),
// random outfits only draw accessories that suit the category, sunglasses are never a default, garments start with their own
// default pattern, and the picker offers the new garments in every category that tags them.
import { describe, expect, it } from 'vitest';
import { CreatorSession } from '../../../src/characters/creator';
import { MAX_ACCESSORIES, addAccessory, defaultWardrobe, emptyOutfit, garmentsFor, randomOutfit, resolveOutfit, validateOutfit } from '../../../src/characters/outfits';
import { content as realContent } from '../../../src/content';
import { Rng, seedRng } from '../../../src/core/rng';
import { OUTFIT_CATEGORIES } from '../../../src/core/types';
import type { Outfit } from '../../../src/core/types';

const content = realContent();
const acc = (id: string) => content.accessories[id]!;

function wear(o: Outfit, ...ids: string[]): Outfit {
  let cur = o;
  for (const id of ids) {
    const r = addAccessory(cur, acc(id), content);
    if (!r.ok) throw new Error(r.reason);
    cur = r.outfit;
  }
  return cur;
}

describe('accessory slots', () => {
  it('one hat at a time: a cap replaces a beanie and a headband', () => {
    let o = wear(emptyOutfit('o', 'o'), 'beanie');
    const r = addAccessory(o, acc('cap'), content);
    expect(r.ok && r.note).toMatch(/Only one hat/);
    o = r.ok ? r.outfit : o;
    expect(o.accessories.map((a) => a.accessoryId)).toEqual(['cap']);
    o = wear(o, 'headband');
    expect(o.accessories.map((a) => a.accessoryId)).toEqual(['headband']);
  });

  it('a watch and a bracelet are worn together (left and right wrist), two necklaces are not', () => {
    const o = wear(emptyOutfit('o', 'o'), 'watch', 'bracelet', 'necklace-pendant', 'scarf');
    expect(o.accessories).toHaveLength(4);
    expect(validateOutfit(o, 'everyday', content)).not.toContain('Only one watch item can be worn at a time.');
    const swap = addAccessory(o, acc('necklace-pearls'), content);
    // at the limit the swap still works because it replaces the pendant
    expect(swap.ok && swap.outfit.accessories.map((a) => a.accessoryId)).toContain('necklace-pearls');
    expect(swap.ok && swap.outfit.accessories.map((a) => a.accessoryId)).not.toContain('necklace-pendant');
    const full = addAccessory(o, acc('sunglasses'), content);
    expect(full.ok).toBe(false);
    expect(MAX_ACCESSORIES).toBe(4);
  });

  it('sunglasses and glasses share the glasses slot', () => {
    const o = wear(emptyOutfit('o', 'o'), 'glasses-round', 'sunglasses');
    expect(o.accessories.map((a) => a.accessoryId)).toEqual(['sunglasses']);
  });

  it('resolves every accessory with its colour', () => {
    const o = wear(emptyOutfit('o', 'o'), 'beanie', 'scarf', 'watch', 'bracelet');
    const r = resolveOutfit(o, content);
    expect(r.issues).toEqual([]);
    expect(r.accessories.map((a) => a.def.id)).toEqual(['beanie', 'scarf', 'watch', 'bracelet']);
  });
});

describe('random outfits', () => {
  it('only draw accessories made for the category and never default to sunglasses', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      for (const cat of OUTFIT_CATEGORIES) {
        const o = randomOutfit(new Rng(seedRng(seed)), content, cat, { glassesId: null });
        for (const a of o.accessories) {
          const def = acc(a.accessoryId);
          seen.add(def.id);
          if (def.categories) expect(def.categories, `${cat}: ${def.id}`).toContain(cat);
          expect(def.build.tint, def.id).not.toBe(true);
        }
        expect(validateOutfit(o, cat, content), `${cat} #${seed}`).toEqual([]);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(7);
    for (let seed = 1; seed <= 60; seed++) {
      const w = defaultWardrobe(content, new Rng(seedRng(seed)), { glasses: true });
      for (const a of w.outfits.everyday[0]!.accessories) expect(acc(a.accessoryId).build.tint).not.toBe(true);
    }
  });

  it('use the new garments', () => {
    const used = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) for (const cat of OUTFIT_CATEGORIES) {
      for (const l of Object.values(randomOutfit(new Rng(seedRng(seed)), content, cat).layers)) used.add(l.garmentId);
    }
    for (const id of ['hoodie', 'cardigan', 'blazer', 'trench-coat', 'chinos', 'pleated-skirt', 'jumpsuit', 'suit', 'bathrobe', 'pumps', 'running-shoes', 'rain-boots']) expect(used.has(id), id).toBe(true);
  });
});

describe('garment catalog in the creator', () => {
  it('offers the new garments per category and layer', () => {
    const ids = (cat: Parameters<typeof garmentsFor>[1], layer: Parameters<typeof garmentsFor>[2]) => garmentsFor(content, cat, layer).map((g) => g.id);
    expect(ids('everyday', 'top')).toEqual(expect.arrayContaining(['hoodie', 'blouse', 'henley', 'turtleneck', 'flannel-shirt']));
    expect(ids('formal', 'top')).toEqual(expect.arrayContaining(['blouse', 'waistcoat', 'turtleneck']));
    expect(ids('athletic', 'bottom')).toEqual(expect.arrayContaining(['leggings', 'bike-shorts']));
    expect(ids('work', 'outer')).toEqual(expect.arrayContaining(['blazer', 'cardigan', 'trench-coat']));
    expect(ids('sleep', 'full')).toEqual(expect.arrayContaining(['bathrobe', 'nightgown']));
    expect(ids('formal', 'full')).toEqual(expect.arrayContaining(['suit', 'wrap-dress', 'jumpsuit', 'maxi-dress']));
    expect(ids('athletic', 'shoes')).toEqual(expect.arrayContaining(['running-shoes', 'sneakers']));
    expect(ids('formal', 'shoes')).toEqual(expect.arrayContaining(['pumps', 'loafers', 'ballet-flats']));
  });

  it('starts a freshly chosen garment with its own default pattern and keeps the previous pattern when swapping', () => {
    const s = new CreatorSession(content, { rng: new Rng(seedRng(3)) });
    s.setGarment('everyday', 0, 'top', 'tee-crew');
    s.setGarmentPattern('everyday', 0, 'top', 'stripes');
    s.setGarment('everyday', 0, 'top', 'flannel-shirt');
    expect(s.current.outfits.outfits.everyday[0]!.layers.top!.pattern).toBe('stripes'); // allowed there too: kept
    s.setGarment('everyday', 0, 'top', null);
    s.setGarment('everyday', 0, 'top', 'flannel-shirt');
    expect(s.current.outfits.outfits.everyday[0]!.layers.top!.pattern).toBe('plaid');
    s.setGarment('everyday', 0, 'bottom', null);
    s.setGarment('everyday', 0, 'bottom', 'pleated-skirt');
    expect(s.current.outfits.outfits.everyday[0]!.layers.bottom!.pattern).toBe('plaid');
    // switching the full outfit replaces top and bottom, and a pattern the new garment cannot wear falls back to solid
    expect(s.setGarmentPattern('everyday', 0, 'bottom', 'polka').ok).toBe(false);
  });
});
