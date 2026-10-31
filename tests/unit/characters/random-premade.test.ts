import { describe, expect, it } from 'vitest';
import {
  isNaturalHairColor, NEIGHBOR_HOUSEHOLD, premadeHouseholdList, premadeHouseholds, randomPersonDraft, validateHousehold,
} from '../../../src/characters/creator';
import { FIRST_NAMES, SURNAMES } from '../../../src/characters/names';
import type { PersonDraft } from '../../../src/core/drafts';
import { Rng, seedRng } from '../../../src/core/rng';
import { emptyContent, fixtureContent } from './fixtures';

const content = fixtureContent();
const make = (seed: number) => randomPersonDraft(new Rng(seedRng(seed)), content);
const valid = (p: PersonDraft) => validateHousehold({ name: p.lastName, members: [p], ties: [] }, content);

describe('randomPersonDraft', () => {
  it('is deterministic per seed and differs between seeds', () => {
    expect(make(42)).toEqual(make(42));
    expect(JSON.stringify(make(42))).not.toBe(JSON.stringify(make(43)));
  });

  it('survives a JSON round trip unchanged (no -0, no undefined, no class instances)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const p = make(seed);
      expect(JSON.parse(JSON.stringify(p)), `seed ${seed}`).toEqual(p);
    }
  });

  it('always produces valid adults', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const p = make(seed);
      expect(p.lifeStage).toBe('adult');
      expect(valid(p), `seed ${seed}`).toEqual([]);
      expect(p.traits).toHaveLength(3);
      expect(p.likes.some((id) => p.dislikes.includes(id))).toBe(false);
    }
  });

  it('never ties hair, facial hair or clothing to frame or pronouns', () => {
    const people = Array.from({ length: 400 }, (_, i) => make(1000 + i));
    const combos = new Set<string>();
    for (const p of people) {
      const hair = content.hair[p.appearance.hair.styleId]!;
      combos.add(`${p.appearance.frame}:${hair.length}`);
      if (p.appearance.hair.facialHairId) combos.add(`${p.appearance.frame}:facial`);
      if (p.outfits.outfits.everyday[0]!.layers.full) combos.add(`${p.appearance.frame}:dress`);
      combos.add(`${p.pronouns.subject}:${p.appearance.frame}`);
    }
    for (const frame of ['a', 'b']) {
      for (const length of ['shaved', 'short', 'medium', 'long']) expect(combos.has(`${frame}:${length}`), `${frame} ${length}`).toBe(true);
      expect(combos.has(`${frame}:facial`)).toBe(true);
      expect(combos.has(`${frame}:dress`)).toBe(true);
      for (const pr of ['she', 'he', 'they']) expect(combos.has(`${pr}:${frame}`)).toBe(true);
    }
  });

  it('is varied and mostly uses natural hair colours', () => {
    const people = Array.from({ length: 300 }, (_, i) => make(5000 + i));
    const natural = people.filter((p) => isNaturalHairColor(p.appearance.hair.color)).length;
    expect(natural / people.length).toBeGreaterThan(0.85);
    expect(natural).toBeLessThan(people.length); // fantasy colours do appear sometimes
    expect(new Set(people.map((p) => p.firstName)).size).toBeGreaterThan(60);
    expect(new Set(people.map((p) => p.appearance.skin)).size).toBeGreaterThan(5);
    expect(new Set(people.map((p) => p.appearance.hair.styleId)).size).toBe(8); // all ready styles, never the dev one
    expect(people.some((p) => p.appearance.face.freckles > 0)).toBe(true);
    expect(people.some((p) => p.careerId === null) && people.some((p) => p.careerId !== null)).toBe(true);
  });

  it('honours options and avoids used first names', () => {
    const p = randomPersonDraft(new Rng(seedRng(7)), content, {
      lastName: 'Fenwick', frame: 'b', pronouns: { subject: 'xe', object: 'xem', possessive: 'xyr' }, careerChance: 0,
      avoidFirstNames: FIRST_NAMES.slice(0, FIRST_NAMES.length - 1),
    });
    expect(p.lastName).toBe('Fenwick');
    expect(p.appearance.frame).toBe('b');
    expect(p.pronouns.subject).toBe('xe');
    expect(p.careerId).toBeNull();
    expect(p.firstName).toBe(FIRST_NAMES[FIRST_NAMES.length - 1]);
  });

  it('produces empty arrays instead of crashing on empty content', () => {
    const p = randomPersonDraft(new Rng(seedRng(1)), emptyContent());
    expect(p.traits).toEqual([]);
    expect(p.aspirationId).toBeNull();
    expect(p.careerId).toBeNull();
    expect(p.likes).toEqual([]);
    expect(p.appearance.hair.styleId).toBe('');
    expect(p.appearance.skin).toMatch(/^#[0-9a-f]{6}$/);
    expect(validateHousehold({ name: 'X', members: [p], ties: [] }, emptyContent())).toEqual([]);
  });
});

describe('names', () => {
  it('has about 80 first names and 60 surnames, all unique', () => {
    expect(FIRST_NAMES.length).toBeGreaterThanOrEqual(80);
    expect(SURNAMES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(FIRST_NAMES).size).toBe(FIRST_NAMES.length);
    expect(new Set(SURNAMES).size).toBe(SURNAMES.length);
  });
});

describe('premade households', () => {
  it('provides a single, roommates, a couple and siblings, all valid', () => {
    const list = premadeHouseholdList(content);
    expect(list.map((h) => h.purpose)).toEqual(['guided', 'roommates', 'couple', 'siblings']);
    expect(list[0]!.draft.members).toHaveLength(1);
    expect(list[1]!.draft.ties).toEqual([{ a: 0, b: 1, tie: 'roommate' }]);
    expect(list[2]!.draft.ties).toEqual([{ a: 0, b: 1, tie: 'spouse' }]);
    for (const h of list) expect(validateHousehold(h.draft, content), h.name).toEqual([]);
    expect(premadeHouseholds(content)).toEqual(list.map((h) => h.draft));
  });

  it('resolves authored wishes against the content', () => {
    const [guided, roommates] = premadeHouseholds(content);
    const maren = guided!.members[0]!;
    expect(maren.firstName).toBe('Maren');
    expect(maren.careerId).toBe('culinary');
    expect(maren.traits).toEqual(expect.arrayContaining(['foodie', 'cheerful', 'neat']));
    expect(maren.aspirationId).toBe('masterChef');
    expect(maren.likes).toContain('activity:cooking');
    expect(content.hair[maren.appearance.hair.styleId]?.length).toBe('medium');
    const theo = roommates!.members[0]!;
    expect(theo.traits).toContain('night-owl'); // 'nightOwl' wish matches the 'night-owl' id
    expect(theo.appearance.hair.facialHairId).not.toBeNull();
    expect(theo.appearance.hair.color).toBe('#8c3a1e'); // auburn swatch
  });

  it('is deterministic and the neighbour household is valid and friendly', () => {
    expect(premadeHouseholds(content)).toEqual(premadeHouseholds(content));
    const n = NEIGHBOR_HOUSEHOLD(content);
    expect(n.members.length).toBeGreaterThanOrEqual(1);
    expect(n.members.length).toBeLessThanOrEqual(2);
    expect(validateHousehold(n, content)).toEqual([]);
    expect(n.members.some((m) => m.traits.includes('outgoing'))).toBe(true);
  });

  it('does not crash with empty registries', () => {
    const drafts = premadeHouseholds(emptyContent());
    expect(drafts).toHaveLength(4);
    expect(drafts[0]!.members[0]!.traits).toEqual([]);
    expect(drafts[0]!.members[0]!.careerId).toBeNull();
    expect(NEIGHBOR_HOUSEHOLD(emptyContent()).members[0]!.aspirationId).toBeNull();
  });
});
