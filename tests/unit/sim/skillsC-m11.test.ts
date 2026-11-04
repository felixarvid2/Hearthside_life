// Milestone 11, task C: Photography, Fishing and Research. Pure catch/catch-value rules, skill effects, level
// gates on the new interactions, the once-only fish sale, and the Science shift effect. The week-long practice
// and save/load payout replay live in tests/unit/integration/skillsC-m11.test.ts.

import { describe, expect, it } from 'vitest';
import { OBJECTS } from '../../../src/content/objects';
import {
  FISH_SPECIES, fishForLevel, fishPortionValue, fishSpecies, resolveCatch,
} from '../../../src/content/fishing';
import { photoSaleMult, researchPaperMult, researchScience, researchStudy } from '../../../src/content/skillEffects';
import { fillDailyLifeDefaults } from '../../../src/persistence/schema';
import { cloneState, transact } from '../../../src/core/state';
import type { GameEvent } from '../../../src/core/events';
import type { WorldState, Id } from '../../../src/core/types';
import { startShift } from '../../../src/sim/careers';
import { freelanceFee } from '../../../src/sim/behaviors';
import { addSkillXp } from '../../../src/sim/skills';
import { buildWorld, harness, pureCtx, runUntil, setNeeds } from './fixtures';
import { skillsContent, skillsSetup } from './skillsCFixtures';
import type { SkillsSetup as Setup } from './skillsCFixtures';

const realObject = (id: string) => OBJECTS.find((o) => o.id === id)!;

type ActTarget =
  | { kind: 'object'; objectId: Id; slotId?: string | null }
  | { kind: 'item'; itemId: Id }
  | { kind: 'self' };

function act(s: Setup, interactionId: string, target: ActTarget, maxTicks = 30000): string {
  const t = target.kind === 'object' ? { ...target, slotId: target.slotId ?? null } : target;
  const q = s.h.sim.queue(s.w.mira, { interactionId, target: t as never });
  if (!q.ok) throw new Error(`${interactionId}: ${q.reason}`);
  runUntil(s.h, () => s.h.log.some((e) => e.type === 'action.finished' && e.actionId === q.actionId), maxTicks);
  const f = s.h.log.find((e): e is Extract<GameEvent, { type: 'action.finished' }> => e.type === 'action.finished' && e.actionId === q.actionId);
  expect(f, `${interactionId} finished`).toBeTruthy();
  expect(f!.result, `${interactionId}: ${f!.result === 'failed' ? f!.reason : ''}`).toBe('done');
  return q.actionId;
}

const fishItems = (state: WorldState) => Object.values(state.items).filter((it) => it.kind === 'fish');
const person = (s: Setup) => s.h.holder.state.people[s.w.mira]!;

describe('fishing catch rules', () => {
  it('never hooks a species above the level, and biases upward with level', () => {
    for (let level = 1; level <= 10; level++) {
      for (const sp of fishForLevel(level)) expect(sp.minLevel, `${level}:${sp.id}`).toBeLessThanOrEqual(level);
      expect(fishForLevel(level).length).toBeGreaterThanOrEqual(1);
    }
    expect(fishForLevel(1).map((s) => s.id)).toEqual(['fish-roach', 'fish-perch']);
    expect(fishForLevel(8).map((s) => s.id)).toContain('fish-carp');
  });

  it('gives one fish early, two or three later, never nothing from level 8, and rarer fish reduce the count', () => {
    expect(resolveCatch(1, 0.9, 0.9)).toMatchObject({ portions: 1 });
    expect(resolveCatch(1, 0.9, 0.1).species).toBeNull();
    expect(resolveCatch(3, 0.9, 0.9).portions).toBe(2);
    expect(resolveCatch(5, 0.9, 0.9).portions).toBe(3);
    expect(resolveCatch(9, 0, 0.9).portions).toBe(3);
    for (const roll of [0, 0.1, 0.4, 0.9, 0.999]) expect(resolveCatch(8, 0.99, roll).species, `roll ${roll}`).not.toBeNull();
    const carp = resolveCatch(10, 0.999, 0.9);
    expect(carp.species?.id).toBe('fish-carp');
    expect(carp.portions).toBe(2); // the prize fish comes one fewer
    // The same two rolls always give the same catch (the behaviour hashes person + action into them).
    expect(resolveCatch(6, 0.37, 0.78)).toEqual(resolveCatch(6, 0.37, 0.78));
  });

  it('pays more per fish as Fishing rises and knows every species by id', () => {
    const roach = fishSpecies('fish-roach')!;
    expect(roach).toBe(FISH_SPECIES[0]);
    expect(fishPortionValue(roach, 10)).toBeGreaterThan(fishPortionValue(roach, 1));
    expect(fishPortionValue(roach, 8)).toBeGreaterThan(fishPortionValue(roach, 7));
    expect(fishSpecies('nope')).toBeUndefined();
  });
});

describe('photography and research effects', () => {
  it('adds gallery and photo-essay bonuses at levels 5 and 8, and a paper bonus at 8', () => {
    expect(photoSaleMult(4)).toBe(1);
    expect(photoSaleMult(5)).toBe(1.25);
    expect(photoSaleMult(8)).toBeCloseTo(1.5);
    expect(photoSaleMult(10)).toBeCloseTo(1.5);
    expect(researchPaperMult(7)).toBe(1);
    expect(researchPaperMult(8)).toBe(1.2);
    expect(researchStudy(10)).toBeCloseTo(0.18);
    expect(researchScience(10)).toBeCloseTo(3.6);
  });

  it('makes freelance photo sales and papers worth more at the unlock levels', () => {
    expect(freelanceFee('sellPhotos', 4)).toBeLessThan(freelanceFee('sellPhotos', 5));
    expect(freelanceFee('sellPhotos', 7)).toBeLessThan(freelanceFee('sellPhotos', 8));
    expect(freelanceFee('writePaper', 7)).toBeLessThan(freelanceFee('writePaper', 8));
  });

  it('gives Research-skill study bonus xp to Logic and Programming only', () => {
    const c = skillsContent();
    const xpAfter = (skill: string, researchLevel: number) => {
      const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
      const h = harness(w.state, c);
      const p = h.holder.state.people[w.mira]!;
      p.skills.research = { level: researchLevel, xp: 0 };
      addSkillXp(pureCtx(h), p, skill, 100);
      return p.skills[skill]!.xp;
    };
    expect(xpAfter('programming', 10)).toBeCloseTo(xpAfter('programming', 1) * 1.18, 5);
    expect(xpAfter('logic', 10)).toBeCloseTo(xpAfter('logic', 1) * 1.18, 5);
    expect(xpAfter('fishing', 10)).toBeCloseTo(xpAfter('fishing', 1), 5);
  });

  it('lifts Science career performance at the start of a shift', () => {
    const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
    const content = skillsContent();
    content.careers.science = { ...content.careers.culinary!, id: 'science', name: 'Science', skills: ['logic'] };
    const h = harness(w.state, content);
    const start = (id: Id, researchLevel: number) => {
      const p = h.holder.state.people[id]!;
      setNeeds(h.holder.state, id, 70);
      p.skills.research = { level: researchLevel, xp: 0 };
      p.career = {
        careerId: 'science', level: 1, performance: 0, joinedAt: 0, daysWorked: 0, shift: null,
        effort: 'normal', pendingEvent: null,
      };
      startShift(pureCtx(h), p, '');
      return p.career!.performance;
    };
    const beginner = start(w.mira, 1);
    const researcher = start(w.theo, 10);
    expect(researcher - beginner).toBeCloseTo(3.6, 5);
  });
});

describe('the new practice interactions', () => {
  it('trains Photography at the camera, and level 2 unlocks selling prints', () => {
    const s = skillsSetup();
    const p = person(s);
    // Selling needs Photography 2.
    expect(s.h.sim.queue(s.w.mira, { interactionId: 'sellPhotos', target: { kind: 'object', objectId: s.camera.id, slotId: null } }).ok).toBe(false);
    act(s, 'takePhotos', { kind: 'object', objectId: s.camera.id });
    expect(p.skills.photography!.xp).toBeGreaterThan(0);
    act(s, 'takePhotos', { kind: 'object', objectId: s.camera.id });
    expect(p.skills.photography!.level).toBeGreaterThanOrEqual(2);
    const before = s.h.holder.state.households[p.householdId]!.funds;
    const actionId = act(s, 'sellPhotos', { kind: 'object', objectId: s.camera.id });
    const after = s.h.holder.state.households[p.householdId]!.funds;
    expect(after - before).toBe(freelanceFee('sellPhotos', p.skills.photography!.level));
    expect(s.h.holder.state.households[p.householdId]!.ledger.some((l) => l.occurrence === `freelance:${p.id}:${actionId}`)).toBe(true);
  });

  it('gates photo walks at Photography 3, and allows them at a park', () => {
    const s = skillsSetup();
    s.w.lot.kind = 'venue';
    s.w.lot.venueType = 'park';
    const p = person(s);
    p.skills.photography = { level: 2, xp: 250 };
    const blocked = s.h.sim.queue(s.w.mira, { interactionId: 'photoWalk', target: { kind: 'self' } });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toContain('Photography level 3');
    p.skills.photography = { level: 3, xp: 450 };
    act(s, 'photoWalk', { kind: 'self' });
    expect(p.skills.photography!.xp).toBeGreaterThan(450);
  });

  it('fishes the garden pond into a food item, and sells it once', () => {
    const s = skillsSetup();
    const p = person(s);
    p.skills.fishing = { level: 8, xp: 2500 };
    act(s, 'fishPond', { kind: 'object', objectId: s.pond.id });
    const items = fishItems(s.h.holder.state);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(fishSpecies(item.recipeId)).toBeTruthy();
    expect(item.portions).toBeGreaterThanOrEqual(2);
    const before = s.h.holder.state.households[p.householdId]!.funds;
    act(s, 'sellCatch', { kind: 'item', itemId: item.id });
    // The catch itself trained Fishing, so the sale uses the level at the moment of the sale.
    const expected = fishPortionValue(fishSpecies(item.recipeId)!, p.skills.fishing!.level) * item.portions;
    const state = s.h.holder.state;
    expect(state.households[p.householdId]!.funds - before).toBe(expected);
    expect(fishItems(state)).toHaveLength(0);
    const entry = state.households[p.householdId]!.ledger.find((l) => l.occurrence === `fishsell:${item.id}`);
    expect(entry?.amount).toBe(expected);
    // A saved game that finishes the sale again cannot pay twice.
    const copy = cloneState(state);
    const again = transact(copy, null, p.householdId, expected, 'sale', 'replay', { occurrence: `fishsell:${item.id}` });
    expect(again.ok).toBe(true);
    expect(copy.households[p.householdId]!.funds).toBe(state.households[p.householdId]!.funds);
  });

  it('gates park fishing at Fishing 2', () => {
    const s = skillsSetup();
    s.w.lot.kind = 'venue';
    s.w.lot.venueType = 'park';
    const p = person(s);
    const blocked = s.h.sim.queue(s.w.mira, { interactionId: 'fishVenue', target: { kind: 'self' } });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toContain('Fishing level 2');
    p.skills.fishing = { level: 2, xp: 100 };
    act(s, 'fishVenue', { kind: 'self' });
    expect(p.skills.fishing!.xp).toBeGreaterThan(100);
  });

  it('eats a landed fish like a meal portion', () => {
    const s = skillsSetup();
    const p = person(s);
    p.skills.fishing = { level: 8, xp: 2500 };
    act(s, 'fishPond', { kind: 'object', objectId: s.pond.id });
    const item = fishItems(s.h.holder.state)[0]!;
    const portions = item.portions;
    const before = { ...p.needs };
    act(s, 'eatMeal', { kind: 'item', itemId: item.id });
    expect(p.needs.hunger).toBeGreaterThan(before.hunger - 5);
    const left = s.h.holder.state.items[item.id];
    expect(!left || left.portions < portions).toBe(true);
  });

  it('trains Research online and at the telescope, and level 5 unlocks papers', () => {
    const s = skillsSetup();
    const p = person(s);
    act(s, 'researchOnline', { kind: 'object', objectId: s.w.objects.computer!.id });
    act(s, 'researchOnline', { kind: 'object', objectId: s.w.objects.computer!.id });
    expect(p.skills.research!.level).toBeGreaterThanOrEqual(2);
    act(s, 'researchSky', { kind: 'object', objectId: s.telescope.id });
    expect(p.skills.research!.xp).toBeGreaterThan(100);
    p.skills.research = { level: 4, xp: 450 };
    expect(s.h.sim.queue(s.w.mira, { interactionId: 'writePaper', target: { kind: 'object', objectId: s.w.objects.computer!.id, slotId: null } }).ok).toBe(false);
    p.skills.research = { level: 5, xp: 700 };
    const before = s.h.holder.state.households[p.householdId]!.funds;
    act(s, 'writePaper', { kind: 'object', objectId: s.w.objects.computer!.id });
    expect(s.h.holder.state.households[p.householdId]!.funds - before).toBe(freelanceFee('writePaper', 5));
  });

  it('keeps fish items on save/load (persistence treats them as known kinds)', () => {
    const raw: Record<string, unknown> = { items: { a: { kind: 'fish', portions: 2 } } };
    fillDailyLifeDefaults(raw);
    expect((raw.items as Record<string, { kind: string }>).a!.kind).toBe('fish');
  });
});

// A small guard so a later content edit cannot silently drop a definition this file relies on.
describe('content wiring', () => {
  it('offers every new interaction on the intended object', () => {
    expect(realObject('camera-tripod').interactions).toEqual(expect.arrayContaining(['takePhotos', 'sellPhotos']));
    expect(realObject('telescope').interactions).toContain('researchSky');
    expect(realObject('garden-pond-fishing').interactions).toContain('fishPond');
    expect(realObject('computer-desktop').interactions).toEqual(expect.arrayContaining(['researchOnline', 'writePaper']));
    expect(realObject('laptop').interactions).toEqual(expect.arrayContaining(['researchOnline', 'writePaper']));
  });
});
