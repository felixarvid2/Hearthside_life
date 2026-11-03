import { describe, expect, it } from 'vitest';
import {
  familyGenerations, householdIssues, memberIssues, randomPersonDraft, tieBetween, tieIssues, traitsConflict, validateHousehold,
} from '../../../src/characters/creator';
import type { HouseholdDraft, PersonDraft } from '../../../src/core/drafts';
import { Rng, seedRng } from '../../../src/core/rng';
import { fixtureContent } from './fixtures';

const content = fixtureContent();
const person = (seed: number, patch: Partial<PersonDraft> = {}): PersonDraft => ({ ...randomPersonDraft(new Rng(seedRng(seed)), content), ...patch });
const household = (n: number, ties: HouseholdDraft['ties'] = []): HouseholdDraft => ({
  name: 'Test', members: Array.from({ length: n }, (_, i) => person(100 + i, { firstName: `P${i}`, lastName: 'Test' })), ties,
});
const messages = (d: HouseholdDraft) => tieIssues(d).map((i) => i.message);

describe('tie validation', () => {
  it('accepts a consistent family', () => {
    // 0 and 1 are spouses, 2 and 3 are their children and siblings of each other, 4 is a roommate
    const d = household(5, [
      { a: 0, b: 1, tie: 'spouse' }, { a: 2, b: 0, tie: 'parent' }, { a: 2, b: 1, tie: 'parent' },
      { a: 0, b: 3, tie: 'child' }, { a: 3, b: 1, tie: 'parent' }, { a: 2, b: 3, tie: 'sibling' }, { a: 4, b: 0, tie: 'roommate' },
    ]);
    expect(tieIssues(d)).toEqual([]);
    expect(validateHousehold(d, content)).toEqual([]);
    expect(tieBetween(d, 3, 0)).toBe('parent');
    expect(tieBetween(d, 0, 3)).toBe('child');
    expect(tieBetween(d, 1, 4)).toBe('none');
  });

  it('places members on family-tree rows', () => {
    // 0+1 spouses; 2 and 3 their children; 4 is 2's spouse; 5 is a roommate
    const d = household(6, [
      { a: 0, b: 1, tie: 'spouse' }, { a: 2, b: 0, tie: 'parent' }, { a: 3, b: 1, tie: 'parent' }, { a: 2, b: 3, tie: 'sibling' },
      { a: 2, b: 4, tie: 'spouse' },
    ]);
    expect(familyGenerations(d)).toEqual([0, 0, 1, 1, 1, 0]);
    const cyclic = household(2, [{ a: 0, b: 1, tie: 'parent' }, { a: 1, b: 0, tie: 'parent' }]);
    expect(familyGenerations(cyclic).every((g) => g < 2)).toBe(true);
  });

  it('accepts both directions when they mean the same thing', () => {
    expect(messages(household(2, [{ a: 0, b: 1, tie: 'parent' }, { a: 1, b: 0, tie: 'child' }]))).toEqual([]);
    expect(messages(household(2, [{ a: 0, b: 1, tie: 'sibling' }, { a: 1, b: 0, tie: 'sibling' }]))).toEqual([]);
  });

  it('rejects contradictory pairs', () => {
    expect(messages(household(2, [{ a: 0, b: 1, tie: 'spouse' }, { a: 1, b: 0, tie: 'sibling' }]))[0])
      .toBe("P1 Test cannot be both P0 Test's spouse and sibling.");
    expect(messages(household(2, [{ a: 0, b: 1, tie: 'parent' }, { a: 1, b: 0, tie: 'parent' }])).length).toBe(1);
  });

  it('treats partner like spouse: symmetric, one per person, never together with spouse for a pair', () => {
    const d = household(3, [{ a: 1, b: 0, tie: 'partner' }]);
    expect(tieIssues(d)).toEqual([]);
    expect(tieBetween(d, 0, 1)).toBe('partner');
    expect(messages(household(2, [{ a: 0, b: 1, tie: 'partner' }, { a: 1, b: 0, tie: 'partner' }]))).toEqual([]);
    expect(messages(household(2, [{ a: 0, b: 1, tie: 'partner' }, { a: 0, b: 1, tie: 'spouse' }])))
      .toEqual(["P1 Test cannot be both P0 Test's partner and spouse."]);
    expect(messages(household(3, [{ a: 0, b: 1, tie: 'partner' }, { a: 0, b: 2, tie: 'spouse' }]))).toContain('P0 Test can only have one partner or spouse.');
    expect(messages(household(3, [{ a: 0, b: 1, tie: 'partner' }, { a: 2, b: 0, tie: 'partner' }]))).toContain('P0 Test can only have one partner or spouse.');
    const young = household(2, [{ a: 0, b: 1, tie: 'partner' }]);
    young.members[1]!.lifeStage = 'teen';
    expect(messages(young)[0]).toMatch(/Only adults can be partners/);
    const anc = household(3, [{ a: 0, b: 1, tie: 'parent' }, { a: 1, b: 2, tie: 'parent' }, { a: 0, b: 2, tie: 'partner' }]);
    expect(messages(anc)).toEqual(["P0 Test and P2 Test cannot be partners when one is the other's ancestor."]);
    expect(familyGenerations(household(3, [{ a: 2, b: 0, tie: 'parent' }, { a: 1, b: 0, tie: 'partner' }]))).toEqual([0, 0, 1]);
  });

  it('rejects self ties, missing members and unknown kinds', () => {
    expect(messages(household(2, [{ a: 1, b: 1, tie: 'sibling' }]))).toEqual(['P1 Test cannot have a relationship with themselves.']);
    expect(messages(household(2, [{ a: 0, b: 5, tie: 'sibling' }]))[0]).toMatch(/not in the household/);
    expect(messages(household(2, [{ a: 0, b: 1, tie: 'cousin' as never }]))[0]).toMatch(/Unknown relationship/);
    expect(messages(household(2, [{ a: 0, b: 1, tie: 'none' }]))).toEqual([]);
  });

  it('rejects two spouses, three parents and ancestry cycles', () => {
    expect(messages(household(3, [{ a: 0, b: 1, tie: 'spouse' }, { a: 0, b: 2, tie: 'spouse' }]))).toContain('P0 Test can only have one partner or spouse.');
    expect(messages(household(4, [{ a: 0, b: 1, tie: 'parent' }, { a: 0, b: 2, tie: 'parent' }, { a: 0, b: 3, tie: 'parent' }])))
      .toContain('P0 Test can have at most two parents.');
    const cycle = messages(household(3, [{ a: 0, b: 1, tie: 'parent' }, { a: 1, b: 2, tie: 'parent' }, { a: 2, b: 0, tie: 'parent' }]));
    expect(cycle.some((m) => m.includes('own ancestor'))).toBe(true);
  });

  it('rejects siblings or spouses who are also ancestor and descendant', () => {
    // 1 is 0's parent, 2 is 1's parent (0's grandparent); 0 and 2 as siblings is contradictory
    const d = household(3, [{ a: 0, b: 1, tie: 'parent' }, { a: 1, b: 2, tie: 'parent' }, { a: 0, b: 2, tie: 'sibling' }]);
    expect(messages(d)).toEqual(["P0 Test and P2 Test cannot be siblings when one is the other's ancestor."]);
  });

  it('applies life-stage rules for parents and spouses', () => {
    const d = household(2, [{ a: 0, b: 1, tie: 'parent' }]);
    d.members[1]!.lifeStage = 'teen';
    expect(messages(d)).toContain('P1 Test is too young to be a parent.');
    const e = household(2, [{ a: 0, b: 1, tie: 'parent' }]);
    e.members[0]!.lifeStage = 'elder';
    expect(messages(e)).toContain('P1 Test cannot be the parent of someone older.');
    const f = household(2, [{ a: 0, b: 1, tie: 'spouse' }]);
    f.members[1]!.lifeStage = 'child';
    expect(messages(f)[0]).toMatch(/Only adults can be spouses/);
  });
});

describe('trait validation', () => {
  it('detects conflicts declared on either side', () => {
    expect(traitsConflict(content, 'neat', 'messy')).toBe(true);
    expect(traitsConflict(content, 'messy', 'neat')).toBe(true);
    expect(traitsConflict(content, 'neat', 'foodie')).toBe(false);
    const oneSided = fixtureContent();
    oneSided.traits.messy!.conflicts = [];
    expect(traitsConflict(oneSided, 'messy', 'neat')).toBe(true);
  });

  it('requires exactly three ready, distinct, non-conflicting traits per adult', () => {
    const msgs = (traits: string[]) => memberIssues(person(1, { traits }), 0, content).filter((i) => i.step === 'personality').map((i) => i.message);
    expect(msgs(['neat', 'foodie', 'bookish'])).toEqual([]);
    expect(msgs(['neat', 'foodie'])).toEqual(['Choose exactly 3 traits (2 chosen).']);
    expect(msgs(['neat', 'messy', 'foodie'])).toEqual(['Neat and Messy are opposites; keep only one.']);
    expect(msgs(['neat', 'neat', 'foodie'])).toContain('Neat is chosen twice.');
    expect(msgs(['neat', 'foodie', 'unfinished'])).toContain('Unfinished is not finished yet.');
    expect(msgs(['neat', 'foodie', 'telepathic'])).toContain('Trait "telepathic" is not available.');
  });

  it('requires an aspiration when the content offers any, and checks jobs and preferences', () => {
    const msgs = (patch: Partial<PersonDraft>) => memberIssues(person(2, patch), 0, content).map((i) => i.message);
    expect(msgs({ aspirationId: null })).toContain('Choose an aspiration.');
    expect(msgs({ aspirationId: 'astronaut' })).toContain('The aspiration is not available.');
    expect(msgs({ careerId: 'pirate' })).toContain('The job is not available.');
    expect(msgs({ likes: ['music:jazz'], dislikes: ['music:jazz'] })).toContain('Jazz cannot be both liked and disliked.');
    expect(msgs({ likes: ['music:polka'], dislikes: [] })).toContain('Preference "music:polka" is not available.');
  });
});

describe('member and household validation', () => {
  it('requires names, a supported life stage and known assets', () => {
    const p = person(3, { firstName: ' ', lastName: '', lifeStage: 'teen' });
    p.appearance.hair.styleId = 'mohawk-9000';
    p.appearance.face.eyeColor = 'blue';
    p.appearance.body.build = 7;
    p.appearance.face.params.tail = 0.2;
    const msgs = memberIssues(p, 0, content).map((i) => `${i.step}: ${i.message}`);
    expect(msgs).toEqual(expect.arrayContaining([
      'identity: First name is required.',
      'identity: Last name is required.',
      'identity: This life stage cannot be created yet (available: youngAdult, adult).',
      'hair: Hairstyle "mohawk-9000" is not available.',
      'faceBody: Eye colour is not valid.',
      'faceBody: Body control "build" is out of range.',
      'faceBody: Face control "tail" is not available.',
    ]));
    expect(memberIssues(p, 0, content, { lifeStages: ['adult', 'teen'] }).some((i) => i.message.includes('life stage'))).toBe(false);
  });

  it('includes outfit problems under the clothing step', () => {
    const p = person(4);
    p.outfits.outfits.everyday[0]!.layers = {};
    const issues = memberIssues(p, 0, content).filter((i) => i.step === 'clothing');
    expect(issues.map((i) => i.message)).toEqual(['Everyday: Choose a top and a bottom, or a full outfit.', 'Everyday: Choose shoes.']);
  });

  it('checks the household name, member count and caregivers', () => {
    const d = household(9);
    d.name = '  ';
    const msgs = householdIssues(d, content).filter((i) => i.member === null).map((i) => i.message);
    expect(msgs).toEqual(['Household name is required.', 'A household can have at most 8 people.']);
    expect(householdIssues({ name: 'X', members: [], ties: [] }, content).map((i) => i.message)).toContain('Add at least one person.');
    const kids = household(1);
    kids.members[0]!.lifeStage = 'child';
    kids.members[0]!.traits = [];
    expect(validateHousehold(kids, content, { lifeStages: ['child'] })).toContain('The household needs at least one young adult or older.');
  });

  it('prefixes member issues with the member name', () => {
    const d = household(2);
    d.members[1]!.aspirationId = null;
    expect(validateHousehold(d, content)).toEqual(['P1 Test: Choose an aspiration.']);
  });
});
