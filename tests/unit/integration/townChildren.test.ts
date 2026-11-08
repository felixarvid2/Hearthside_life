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
import { ensureTownChildren } from '../../../src/game/neighbourhood';
import { removePerson } from '../../../src/sim/aging';
import { Rng } from '../../../src/core/rng';
import { Reservations } from '../../../src/sim/reservations';
import type { SimCtx } from '../../../src/sim/context';
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

describe('town children for older saves', () => {
  /** A world as an older save has it: the same town, but without the generated children and the migration marker. */
  function oldSave(seed: number): WorldState {
    const s = make(seed);
    const ctx = { state: s, content: db, nav: { invalidate: () => undefined }, events: { emit: () => undefined }, rng: new Rng(s.rng), res: new Reservations(), now: s.clock.minutes, counters: { routeRequests: 0 } } as unknown as SimCtx;
    for (const p of children(s)) removePerson(ctx, p.id);
    delete s.neighbourhood!.townChildren;
    return s;
  }

  it('adds children on load, keeps every existing id, job and relationship, and runs once', () => {
    const s = oldSave(11);
    expect(children(s)).toHaveLength(0);
    const peopleBefore = JSON.stringify(Object.values(s.people).map((p) => [p.id, p.firstName, p.career?.careerId ?? null, p.traits, p.parentIds ?? null]));
    const relsBefore = Object.keys(s.relationships).length;
    const nextId = s.nextId;
    const rng = [...s.rng];
    const n = ensureTownChildren(s, db);
    expect(n).toBeGreaterThan(0);
    expect(children(s)).toHaveLength(n);
    expect(s.neighbourhood!.townChildren).toBe(true);
    expect([...s.rng]).toEqual(rng); // the world's random future is untouched
    expect(s.nextId).toBeGreaterThan(nextId); // new ids come after all the old ones
    const old = JSON.parse(peopleBefore) as Array<[string, string, string | null, string[], string[] | null]>;
    for (const [id, first, career, traits, parents] of old) {
      const p = s.people[id]!;
      expect([p.firstName, p.career?.careerId ?? null, p.traits, p.parentIds ?? null]).toEqual([first, career, traits, parents]);
    }
    expect(Object.keys(s.relationships).length).toBeGreaterThanOrEqual(relsBefore);
    for (const kid of children(s)) {
      expect(CHILD_STAGES).toContain(kid.lifeStage);
      expect(kid.parentIds!.length).toBeGreaterThanOrEqual(1);
      for (const pid of kid.parentIds!) {
        expect(s.people[pid]!.householdId).toBe(kid.householdId);
        expect(isGrownStage(s.people[pid]!.lifeStage)).toBe(true);
      }
      expect(s.households[kid.householdId]!.memberIds).toContain(kid.id);
      expect(kid.location).toMatchObject({ kind: 'offlot', place: 'home', lotId: s.households[kid.householdId]!.homeLotId });
      if (isSchoolStage(kid.lifeStage)) expect(kid.school).toBeTruthy();
    }
    expect(ensureTownChildren(s, db)).toBe(0);
    expect(children(s)).toHaveLength(n);
  });

  it('is deterministic per save and differs between worlds; households with children already are left alone', () => {
    const a = oldSave(11), b = oldSave(11), c = oldSave(23);
    ensureTownChildren(a, db); ensureTownChildren(b, db); ensureTownChildren(c, db);
    const print = (s: WorldState) => JSON.stringify(children(s).map((p) => [p.id, p.firstName, p.lifeStage, p.householdId, p.stageDays]));
    expect(print(a)).toBe(print(b));
    expect(print(a)).not.toBe(print(c));
    const full = make(11); // a new world already has them and the marker
    const kids = print(full);
    expect(ensureTownChildren(full, db)).toBe(0);
    expect(print(full)).toBe(kids);
    const partial = oldSave(11);
    delete partial.neighbourhood!.townChildren;
    const kept = npcHouseholds(partial).find((h) => h.memberIds.length > 0)!;
    // a home that already has a child gets no more
    ensureTownChildren(a, db);
    delete a.neighbourhood!.townChildren;
    const before = children(a).length;
    expect(ensureTownChildren(a, db)).toBe(0);
    expect(children(a)).toHaveLength(before);
    void kept;
  });

  it('the loaded game runs a day with the new children and the save stays valid', () => {
    const s = oldSave(11);
    const core = coreWithoutSaves();
    core.replaceState(s);
    expect(children(core.state()!).length).toBeGreaterThan(0);
    core.advanceTicks(Math.ceil(MINUTES_PER_DAY / 0.25));
    const copy = JSON.parse(JSON.stringify(core.state()!)) as WorldState;
    expect(validateWorld(copy, db).errors).toEqual([]);
    expect(children(core.state()!).every((p) => core.state()!.households[p.householdId]!.memberIds.includes(p.id))).toBe(true);
  });
});
