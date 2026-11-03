// Milestone 8 gap: children in the generated town households. Some family-type homes get one to three children with
// mixed life stages; the parent ties, surnames, stage clocks and school records are sensible; generation is
// deterministic per seed; romance stays between adults; and a full simulated week runs cleanly with the children.

import { describe, expect, it, vi } from 'vitest';
import { NEIGHBOR_HOUSEHOLD, premadeHouseholds } from '../../../src/characters/creator';
import { MINUTES_PER_DAY } from '../../../src/core/clock';
import { NORMAL_STAGE_DAYS, isGrownStage, isSchoolStage } from '../../../src/core/lifeStages';
import { romanceInterest } from '../../../src/core/relations';
import type { Person, WorldState } from '../../../src/core/types';
import { createNewWorld } from '../../../src/game/newWorld';
import { validateWorld } from '../../../src/persistence/index';
import { socialStageReason } from '../../../src/sim/gating';
import { coreWithoutSaves, db } from './harness';

vi.setConfig({ testTimeout: 240_000 });

const premades = premadeHouseholds(db);
const CHILD_STAGES = ['baby', 'toddler', 'child', 'teen'] as const;

function make(seed: number): WorldState {
  return createNewWorld(db, { seed, mode: 'guided', household: premades[0]!, neighbor: NEIGHBOR_HOUSEHOLD(db) });
}

const npcHouseholds = (s: WorldState) => (s.neighbourhood?.npcHouseholdIds ?? []).map((id) => s.households[id]!);
const townPeople = (s: WorldState) => npcHouseholds(s).flatMap((hh) => hh.memberIds.map((id) => s.people[id]!));
const children = (s: WorldState): Person[] => townPeople(s).filter((p) => !isGrownStage(p.lifeStage));
const adults = (s: WorldState): Person[] => townPeople(s).filter((p) => isGrownStage(p.lifeStage));

describe('children in town households', () => {
  it('gives about a third to a half of the homes one to three children with valid parents and school records', () => {
    const s = make(11);
    const hhs = npcHouseholds(s);
    const families = hhs.filter((hh) => hh.memberIds.some((id) => !isGrownStage(s.people[id]!.lifeStage)));
    expect(families.length).toBeGreaterThanOrEqual(1);
    expect(families.length).toBeLessThanOrEqual(2); // one or two of the four homes

    expect(children(s).length).toBeGreaterThanOrEqual(2);
    for (const hh of families) {
      const kids = hh.memberIds.map((id) => s.people[id]!).filter((p) => !isGrownStage(p.lifeStage));
      expect(kids.length).toBeGreaterThanOrEqual(1);
      expect(kids.length).toBeLessThanOrEqual(3);
      // a home with more than one child mixes the stages
      if (kids.length > 1) expect(new Set(kids.map((p) => p.lifeStage)).size).toBe(kids.length);
      for (const kid of kids) {
        expect(CHILD_STAGES).toContain(kid.lifeStage);
        const parents = (kid.parentIds ?? []).map((id) => s.people[id]!);
        expect(parents.length).toBeGreaterThanOrEqual(1);
        expect(parents.length).toBeLessThanOrEqual(2);
        for (const parent of parents) {
          expect(parent).toBeDefined();
          expect(parent.householdId).toBe(hh.id);
          expect(isGrownStage(parent.lifeStage)).toBe(true);
          expect(parent.lastName).toBe(kid.lastName);
        }
        // the stage clock starts part-way through a normal stage
        expect(Number.isInteger(kid.stageDays)).toBe(true);
        expect(kid.stageDays!).toBeGreaterThanOrEqual(0);
        expect(kid.stageDays!).toBeLessThan(NORMAL_STAGE_DAYS[kid.lifeStage]);
        if (isSchoolStage(kid.lifeStage)) expect(kid.school).toMatchObject({ attended: 0, missed: 0, homeworkDay: -1 });
        else expect(kid.school ?? null).toBeNull();
      }
    }
    // the whole town covers more than one stage of childhood
    expect(new Set(children(s).map((p) => p.lifeStage)).size).toBeGreaterThanOrEqual(2);
    expect(validateWorld(s, db).errors).toEqual([]);
  });

  it('is deterministic per seed and varies with another seed', () => {
    const a = make(21), b = make(21), c = make(22);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
    expect(children(a).map((p) => `${p.firstName} ${p.lastName}:${p.lifeStage}`))
      .toEqual(children(b).map((p) => `${p.firstName} ${p.lastName}:${p.lifeStage}`));
  });

  it('keeps romance between adults only', () => {
    const s = make(11);
    const grown = adults(s);
    const young = children(s);
    expect(grown.length).toBeGreaterThan(0);
    expect(young.length).toBeGreaterThan(0);
    const flirt = db.socials['flirt']!;
    for (const kid of young) {
      for (const adult of grown) {
        expect(romanceInterest(adult, kid)).toBe(false);
        expect(romanceInterest(kid, adult)).toBe(false);
        // Babies and toddlers are turned away as too little; children and teens hit the romance rule itself.
        if (kid.lifeStage === 'child' || kid.lifeStage === 'teen') {
          expect(socialStageReason(flirt, adult, kid)).toBe('Only between adults.');
          expect(socialStageReason(flirt, kid, adult)).toBe('Only between adults.');
        }
      }
    }
  });

  it('runs a simulated week with the town children without errors', () => {
    const core = coreWithoutSaves();
    expect(core.startNewGame('guided', premades[0]!, 33)).toEqual({ ok: true });
    const s = core.state()!;
    const townKids = children(s).map((p) => p.id);
    expect(townKids.length).toBeGreaterThan(0);
    core.advanceTicks(7 * MINUTES_PER_DAY * 4);
    const after = core.state()!;
    expect(after.clock.minutes).toBeGreaterThanOrEqual(7 * MINUTES_PER_DAY);
    expect(validateWorld(after, db).errors).toEqual([]);
    // the children are still people of the world, with their family links intact where they still exist
    for (const id of townKids) {
      const p = after.people[id];
      if (!p) continue;
      for (const parentId of p.parentIds ?? []) expect(after.people[parentId]).toBeDefined();
    }
  });
});
