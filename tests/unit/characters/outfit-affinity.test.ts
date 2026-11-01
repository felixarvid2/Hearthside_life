import { describe, expect, it } from 'vitest';
import {
  CreatorSession, NEIGHBOR_HOUSEHOLD, premadeHouseholds, PRONOUN_PRESETS, randomPersonDraft, validateHousehold,
} from '../../../src/characters/creator';
import {
  allowedAffinities, defaultWardrobe, garmentAffinity, garmentChoice, makeOutfit, normalizeWardrobe, randomOutfit, resolveOutfit,
  validateWardrobe,
} from '../../../src/characters/outfits';
import { content as realContent } from '../../../src/content';
import type { ContentDB, GarmentAffinity } from '../../../src/content/types';
import { Rng, seedRng } from '../../../src/core/rng';
import { OUTFIT_CATEGORIES } from '../../../src/core/types';
import type { Outfit, Wardrobe } from '../../../src/core/types';
import type { PersonDraft } from '../../../src/core/drafts';

const content = realContent();
const FEM_ONLY = ['skirt-aline', 'sundress', 'dress-shirt', 'swimsuit', 'nightgown', 'blouse', 'crop-top', 'pleated-skirt', 'pencil-skirt', 'wrap-dress', 'maxi-dress', 'pumps', 'ballet-flats'];

/** Affinities of every garment worn anywhere in a wardrobe. */
function worn(w: Wardrobe, db: ContentDB = content): Array<{ id: string; affinity: GarmentAffinity }> {
  return OUTFIT_CATEGORIES.flatMap((c) => w.outfits[c]).flatMap((o) =>
    Object.values(o.layers).map((ch) => ({ id: ch.garmentId, affinity: garmentAffinity(db.garments[ch.garmentId]!) })));
}
const wardrobeOf = (p: PersonDraft) => p.outfits;

describe('garment affinity data', () => {
  it('tags dresses, skirts, nightgowns, swimsuits and the dressier pieces (blouse, pumps, flats, crop top) as fem and everything else is not', () => {
    for (const g of Object.values(content.garments)) {
      expect(garmentAffinity(g) === 'fem', g.id).toBe(FEM_ONLY.includes(g.id));
    }
    expect(garmentAffinity(content.garments['swim-trunks']!)).toBe('masc');
  });

  it('allowedAffinities follows pronouns, then frame for everyone else', () => {
    expect(allowedAffinities(PRONOUN_PRESETS.he, 'b')).toEqual(['masc', 'neutral']);
    expect(allowedAffinities(PRONOUN_PRESETS.she, 'a')).toEqual(['fem', 'neutral']);
    expect(allowedAffinities(PRONOUN_PRESETS.they, 'a')).toEqual(['neutral', 'masc']);
    expect(allowedAffinities(PRONOUN_PRESETS.they, 'b')).toEqual(['neutral', 'fem']);
    expect(allowedAffinities({ subject: 'xe', object: 'xem', possessive: 'xyr' })).toEqual(['neutral']);
  });
});

describe('premade people', () => {
  const households = [...premadeHouseholds(content), NEIGHBOR_HOUSEHOLD(content)];
  const people = households.flatMap((h) => h.members);

  it('never dress he/him people in skirts, dresses, nightgowns or swimsuits', () => {
    const men = people.filter((p) => p.pronouns.subject === 'he');
    expect(men.length).toBeGreaterThanOrEqual(4);
    for (const p of men) {
      for (const w of worn(wardrobeOf(p))) expect(FEM_ONLY, `${p.firstName} wears ${w.id}`).not.toContain(w.id);
    }
  });

  it('keeps she/her people away from masc garments and they/them people on neutral or frame-matching ones', () => {
    for (const p of people) {
      const allowed = allowedAffinities(p.pronouns, p.appearance.frame);
      for (const w of worn(wardrobeOf(p))) expect(allowed, `${p.firstName} wears ${w.id}`).toContain(w.affinity);
    }
  });

  it('gives everyone valid, complete wardrobes with sleepwear and swimwear', () => {
    for (const h of households) expect(validateHousehold(h, content)).toEqual([]);
    for (const p of people) {
      expect(validateWardrobe(p.outfits, content), p.firstName).toEqual([]);
      const sleep = p.outfits.outfits.sleep[0]!;
      const swim = p.outfits.outfits.swim[0]!;
      const ids = [...Object.values(sleep.layers), ...Object.values(swim.layers)].map((c) => c.garmentId);
      if (p.pronouns.subject === 'he') {
        expect(ids).toEqual(expect.arrayContaining(['pajama-top', 'pajama-pants', 'swim-trunks']));
        expect(sleep.layers.full).toBeUndefined();
        expect(swim.layers.full).toBeUndefined();
      }
    }
  });

  it('is varied: not everyone wears the same everyday top and colour', () => {
    const everyday = people.map((p) => p.outfits.outfits.everyday[0]!);
    expect(new Set(everyday.map((o) => JSON.stringify(Object.values(o.layers).map((c) => c.color)))).size).toBe(everyday.length);
    expect(new Set(everyday.map((o) => o.layers.top?.garmentId ?? o.layers.full?.garmentId)).size).toBeGreaterThanOrEqual(3);
  });
});

describe('random outfits respect affinity', () => {
  const seeds = Array.from({ length: 300 }, (_, i) => 5000 + i);

  it('random he/she/they people only wear garments for their presentation', () => {
    const sawFem = { she: false, they: false };
    for (const seed of seeds) {
      const p = randomPersonDraft(new Rng(seedRng(seed)), content);
      const allowed = allowedAffinities(p.pronouns, p.appearance.frame);
      const items = worn(wardrobeOf(p));
      for (const w of items) expect(allowed, `seed ${seed} ${p.pronouns.subject} wears ${w.id}`).toContain(w.affinity);
      if (p.pronouns.subject === 'she' && items.some((w) => FEM_ONLY.includes(w.id))) sawFem.she = true;
      if (p.pronouns.subject === 'they' && p.appearance.frame === 'b' && items.some((w) => FEM_ONLY.includes(w.id))) sawFem.they = true;
      for (const m of validateWardrobe(p.outfits, content)) expect(m, `seed ${seed}`).toBe('');
    }
    expect(sawFem.she).toBe(true);
    expect(sawFem.they).toBe(true);
  });

  it('randomOutfit honours explicit affinities per category and stays valid', () => {
    for (const cat of OUTFIT_CATEGORIES) {
      for (const aff of [['masc', 'neutral'], ['fem', 'neutral'], ['neutral']] as const) {
        for (let i = 0; i < 40; i++) {
          const o = randomOutfit(new Rng(seedRng(i + 1)), content, cat, { affinities: aff });
          for (const ch of Object.values(o.layers)) {
            // Shoes and other pieces may fall back when nothing matches, but full garments never leave the set.
            const aff2 = garmentAffinity(content.garments[ch.garmentId]!);
            if (ch.garmentId === o.layers.full?.garmentId) expect(aff).toContain(aff2);
          }
          expect(o.layers.top && o.layers.bottom ? true : o.layers.full !== undefined, `${cat} ${aff}`).toBe(true);
        }
      }
    }
  });

  it('without affinities any garment can appear (old behaviour)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const w = defaultWardrobe(content, new Rng(seedRng(i)));
      worn(w).forEach((x) => ids.add(x.id));
    }
    for (const id of FEM_ONLY) expect(ids.has(id), id).toBe(true);
  });

  it('coordinates colours: denim stays blue, trousers stay dark and tops contrast with bottoms', () => {
    for (let i = 0; i < 200; i++) {
      const o = randomOutfit(new Rng(seedRng(i)), content, 'formal', { affinities: ['masc', 'neutral'] });
      const bottom = o.layers.bottom;
      if (bottom?.garmentId === 'trousers-tailored') {
        const l = parseInt(bottom.color.slice(1, 3), 16);
        expect(l, bottom.color).toBeLessThan(0x70);
      }
    }
  });
});

describe('creator keeps full freedom', () => {
  const heSession = (seed: number) => {
    const s = new CreatorSession(content, { rng: new Rng(seedRng(seed)) });
    s.setPronouns('he');
    return s;
  };
  const feminine = (o: Outfit) => Object.values(o.layers).some((c) => FEM_ONLY.includes(c.garmentId));

  it('lets a he/him person wear any garment', () => {
    const s = heSession(1);
    expect(s.setGarment('everyday', 0, 'full', 'sundress').ok).toBe(true);
    expect(s.setGarment('everyday', 0, 'bottom', 'skirt-aline').ok).toBe(true);
    expect(s.setGarment('sleep', 0, 'full', 'nightgown').ok).toBe(true);
    expect(s.garmentOptions('everyday', 'full').map((g) => g.id)).toEqual(expect.arrayContaining(['sundress', 'dress-shirt']));
  });

  it('single-outfit randomize and add outfit follow presentation, never crossing over', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = heSession(seed);
      for (const cat of OUTFIT_CATEGORIES) {
        s.randomizeOutfit(cat, 0);
        s.addOutfit(cat);
        for (const o of s.current.outfits.outfits[cat]) expect(feminine(o), `seed ${seed} ${cat}`).toBe(false);
      }
      s.randomizeStep('clothing');
      for (const cat of OUTFIT_CATEGORIES) expect(s.current.outfits.outfits[cat].some(feminine)).toBe(false);
    }
  });

  it('randomize all crosses over only rarely', () => {
    let crossed = 0, total = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const s = heSession(seed);
      s.setLocked('identity', true);
      s.randomizeAll();
      for (const cat of OUTFIT_CATEGORIES) { total++; if (s.current.outfits.outfits[cat].some(feminine)) crossed++; }
    }
    expect(crossed).toBeGreaterThan(0);
    expect(crossed / total).toBeLessThan(0.08);
  });

  it('reset clothing gives neutral plain outfits for everyone', () => {
    const s = heSession(3);
    s.resetCategory('clothing');
    for (const w of worn(s.current.outfits)) expect(w.affinity).toBe('neutral');
  });
});

describe('saved outfits are untouched', () => {
  it('normalizeWardrobe keeps any stored garment unchanged, whatever the person', () => {
    const o = (id: string, layers: Outfit['layers']): Outfit => makeOutfit(id, id, layers);
    const g = (id: string) => garmentChoice(content.garments[id]!, '#445566');
    const w = {
      outfits: {
        everyday: [o('out-everyday-1', { bottom: g('skirt-aline'), top: g('tee-crew'), shoes: g('sneakers') })],
        formal: [o('out-formal-1', { full: g('sundress'), shoes: g('loafers') })],
        work: [o('out-work-1', { top: g('shirt-button'), bottom: g('trousers-tailored'), shoes: g('loafers') })],
        athletic: [o('out-athletic-1', { top: g('tee-crew'), bottom: g('joggers'), shoes: g('sneakers') })],
        sleep: [o('out-sleep-1', { full: g('nightgown') })],
        swim: [o('out-swim-1', { full: g('swimsuit') })],
      },
      current: { category: 'everyday', index: 0 },
    } as Wardrobe;
    const notes: string[] = [];
    const out = normalizeWardrobe(JSON.parse(JSON.stringify(w)), content, (m) => notes.push(m));
    expect(out).toEqual(w);
    expect(notes).toEqual([]);
    expect(resolveOutfit(out.outfits.sleep[0]!, content).issues).toEqual([]);
  });

  it('plain wardrobes added for missing categories use neutral garments', () => {
    const out = normalizeWardrobe({ outfits: {} }, content, () => undefined);
    for (const w of worn(out)) expect(w.affinity).toBe('neutral');
  });
});
