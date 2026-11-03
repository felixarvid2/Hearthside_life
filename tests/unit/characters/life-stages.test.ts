// Milestone 8 creator rules: which life stages are offered (only those with a body), choosing a stage, and the household rules
// for children (somebody young adult or older, a parent or guardian for babies and toddlers, parents not younger than children).

import { afterEach, describe, expect, it } from 'vitest';
import {
  CREATOR_LIFE_STAGES, CreatorSession, availableLifeStages, householdIssues, memberIssues, randomPersonDraft, setStageBodyAvailability,
  validateHousehold,
} from '../../../src/characters/creator';
import type { HouseholdDraft, PersonDraft } from '../../../src/core/drafts';
import { Rng, seedRng } from '../../../src/core/rng';
import type { LifeStage } from '../../../src/core/types';
import { fixtureContent } from './fixtures';

const content = fixtureContent();
const person = (seed: number, patch: Partial<PersonDraft> = {}): PersonDraft => ({ ...randomPersonDraft(new Rng(seedRng(seed)), content), ...patch });
const family = (stages: LifeStage[], ties: HouseholdDraft['ties'] = []): HouseholdDraft => ({
  name: 'Fam', members: stages.map((s, i) => person(200 + i, { firstName: `P${i}`, lastName: 'Fam', lifeStage: s, traits: s === 'adult' || s === 'youngAdult' || s === 'elder' ? person(200 + i).traits : [] })), ties,
});
const ALL_OPEN = () => true;

afterEach(() => setStageBodyAvailability(null));

describe('life stages in the creator', () => {
  it('the creator knows all seven stages but offers only those with a body (young adult and adult until then)', () => {
    expect(CREATOR_LIFE_STAGES).toEqual(['baby', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder']);
    expect(availableLifeStages()).toEqual(['youngAdult', 'adult']);
    setStageBodyAvailability((s) => s === 'child' || s === 'teen');
    expect(availableLifeStages()).toEqual(['child', 'teen', 'youngAdult', 'adult']);
    setStageBodyAvailability(ALL_OPEN);
    expect(availableLifeStages()).toEqual(CREATOR_LIFE_STAGES);
    setStageBodyAvailability(() => false);
    expect(availableLifeStages()).toEqual(['youngAdult', 'adult']);
  });

  it('refuses a stage whose body is missing, and accepts it once the body exists', () => {
    const p = person(1, { lifeStage: 'child' });
    expect(memberIssues(p, 0, content).some((i) => /life stage/.test(i.message))).toBe(true);
    setStageBodyAvailability(ALL_OPEN);
    expect(memberIssues(p, 0, content).some((i) => /life stage/.test(i.message))).toBe(false);
  });

  it('a session sets the life stage of the current person (undoable) and drops the job of a child', () => {
    const s = new CreatorSession(content, { start: 'blank' });
    expect(s.setLifeStage('teen')).toEqual({ ok: false, reason: 'That life stage is not available yet.' });
    expect(s.setLifeStage('youngAdult').ok).toBe(true);
    expect(s.current.lifeStage).toBe('youngAdult');
    setStageBodyAvailability(ALL_OPEN);
    expect(s.setLifeStage('child').ok).toBe(true);
    expect(s.current.lifeStage).toBe('child');
    expect(s.current.careerId).toBeNull();
    s.undo();
    expect(s.current.lifeStage).toBe('youngAdult');
    expect(s.setLifeStage('ancient' as LifeStage).ok).toBe(false);
  });

  it('a household needs at least one young adult or older', () => {
    setStageBodyAvailability(ALL_OPEN);
    const kids = family(['child', 'teen']);
    expect(validateHousehold(kids, content)).toContain('The household needs at least one young adult or older.');
    expect(validateHousehold(family(['teen', 'youngAdult']), content)).not.toContain('The household needs at least one young adult or older.');
    expect(validateHousehold(family(['child', 'elder']), content)).not.toContain('The household needs at least one young adult or older.');
  });

  it('a baby or toddler needs a parent or guardian: a parent tie to a young adult or older', () => {
    setStageBodyAvailability(ALL_OPEN);
    const lonely = family(['adult', 'baby']);
    const msg = householdIssues(lonely, content).filter((i) => i.member === 1).map((i) => i.message);
    expect(msg).toEqual(['A baby needs a parent or guardian in the household: set a Parent tie to a young adult or older.']);
    const tied = family(['adult', 'baby', 'toddler'], [{ a: 1, b: 0, tie: 'parent' }, { a: 2, b: 0, tie: 'parent' }]);
    expect(householdIssues(tied, content).filter((i) => /parent or guardian/.test(i.message))).toEqual([]);
    // a teen as the only "parent" is no guardian
    const teenMum = family(['adult', 'teen', 'toddler'], [{ a: 2, b: 1, tie: 'parent' }]);
    expect(householdIssues(teenMum, content).some((i) => /parent or guardian/.test(i.message))).toBe(true);
  });

  it('parents must be grown up and not younger than their children', () => {
    setStageBodyAvailability(ALL_OPEN);
    const teenParent = family(['adult', 'teen'], [{ a: 0, b: 1, tie: 'parent' }]);
    expect(validateHousehold(teenParent, content).join(' ')).toMatch(/too young to be a parent/);
    const reversed = family(['elder', 'adult'], [{ a: 0, b: 1, tie: 'parent' }]);
    expect(validateHousehold(reversed, content).join(' ')).toMatch(/cannot be the parent of someone older/);
    const fine = family(['elder', 'adult', 'child'], [{ a: 1, b: 0, tie: 'parent' }, { a: 2, b: 1, tie: 'parent' }]);
    expect(validateHousehold(fine, content)).toEqual([]);
  });

  it('children and babies need no aspiration, three traits or job', () => {
    setStageBodyAvailability(ALL_OPEN);
    const kid = person(9, { lifeStage: 'child', traits: ['cheerful'], aspirationId: null, careerId: null });
    expect(memberIssues(kid, 0, content).map((i) => i.message)).toEqual([]);
    expect(memberIssues({ ...kid, careerId: Object.keys(content.careers)[0] ?? null }, 0, content).some((i) => /Only adults can have a job/.test(i.message))).toBe(Object.keys(content.careers).length > 0);
  });
});
