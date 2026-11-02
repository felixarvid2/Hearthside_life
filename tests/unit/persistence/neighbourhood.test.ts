// Save compatibility of the Milestone 7 fields: lot layout flags and map positions, rent and price, people in transit,
// and the neighbourhood marker. All are optional additions to schema 1: older saves load unchanged (a world without the
// marker gets its neighbourhood when the game loads it), and malformed values are repaired, never turned into a second
// neighbourhood.

import { describe, expect, it } from 'vitest';
import { NEIGHBOR_HOUSEHOLD, premadeHouseholds } from '../../../src/characters/creator';
import { cloneState } from '../../../src/core/state';
import type { WorldState } from '../../../src/core/types';
import { createNewWorld } from '../../../src/game/newWorld';
import { fillNeighbourhoodDefaults, migrate, validateWorld, validateWorldStructure } from '../../../src/persistence/schema';
import { db, coreWithoutSaves, freshStore } from '../integration/harness';
import { makeContent, makeWorld } from './fixtures';

const world = (): WorldState => createNewWorld(db, { seed: 5, mode: 'guided', household: premadeHouseholds(db)[0]!, neighbor: NEIGHBOR_HOUSEHOLD(db) });
const raw = (w: WorldState) => JSON.parse(JSON.stringify(w)) as Record<string, unknown>;

describe('neighbourhood fields in saves', () => {
  it('a save without them loads unchanged and valid', () => {
    const w = makeWorld();
    const copy = raw(w);
    const r = migrate(copy);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toEqual(w);
    expect(r.state.neighbourhood).toBeUndefined();
    expect(validateWorld(r.state, makeContent()).errors).toEqual([]);
  });

  it('a whole generated neighbourhood survives JSON and migrate untouched and validates', () => {
    const w = world();
    const r = migrate(raw(w));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toEqual(w);
    expect(r.migrated).toBe(false);
    expect(validateWorld(r.state, db)).toMatchObject({ errors: [], missing: [] });
  });

  it('repairs malformed lot fields, transit flags and a damaged marker, but never drops the marker', () => {
    const w = world();
    const data = raw(w);
    const lots = Object.values(data.lots as Record<string, Record<string, unknown>>);
    lots[2]!.built = 'yes';
    lots[2]!.variant = -3;
    lots[2]!.blurb = 7;
    lots[3]!.map = { x: 'left', y: 4 };
    lots[3]!.rent = 12.5;
    lots[4]!.price = 'cheap';
    const people = Object.values(data.people as Record<string, Record<string, unknown>>);
    people[0]!.location = { kind: 'offlot', place: 'home', since: 0, until: null, transit: 'sure' };
    data.neighbourhood = { version: 9, street: 4, npcHouseholdIds: ['hh_nope', ...(w.neighbourhood!.npcHouseholdIds)], nextDoorHouseholdId: 'hh_nope', moves: -1 };
    fillNeighbourhoodDefaults(data);
    expect(lots[2]).not.toHaveProperty('built');
    expect(lots[2]).not.toHaveProperty('variant');
    expect(lots[2]).not.toHaveProperty('blurb');
    expect(lots[3]).not.toHaveProperty('map');
    expect(lots[3]).not.toHaveProperty('rent');
    expect(lots[4]).not.toHaveProperty('price');
    expect((people[0]!.location as Record<string, unknown>)).not.toHaveProperty('transit');
    expect(data.neighbourhood).toEqual({ version: 1, street: 'Main Street', npcHouseholdIds: w.neighbourhood!.npcHouseholdIds });
  });

  it('keeps people in transit and the trip across a save in the middle of the journey', async () => {
    const core = coreWithoutSaves();
    core.startNewGame('guided', premadeHouseholds(db)[1]!, 11);
    const s = core.state()!;
    s.settings.visitors = false;
    s.schedule = s.schedule.filter((e) => e.kind !== 'visitArrive');
    const ids = s.households[s.activeHouseholdId]!.memberIds;
    for (const id of ids) core.quitCareer(id);
    const park = Object.values(s.lots).find((l) => l.venueType === 'park')!;
    expect(core.travel(ids, park.id)).toMatchObject({ ok: true });
    core.advanceTicks(4 * 10);
    expect(ids.every((id) => (core.state()!.people[id]!.location as { transit?: boolean }).transit === true)).toBe(true);

    const store = await freshStore();
    expect((await store.save('slot-2', 'mid trip', core.state()!)).ok).toBe(true);
    const loaded = await store.load('slot-2', db);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(validateWorldStructure(loaded.state)).toMatchObject({ errors: [] });
    const other = coreWithoutSaves();
    other.replaceState(loaded.state);
    other.setMode('live');
    expect(other.neighbourhood()!.trip).toMatchObject({ lotId: park.id, personIds: ids });
    // both finish the journey the same way: everybody arrives exactly once
    for (const c of [core, other]) {
      c.advanceTicks(4 * 60);
      const w = c.state()!;
      expect(w.activeLotId).toBe(park.id);
      for (const id of ids) expect(w.people[id]!.location).toMatchObject({ kind: 'lot', lotId: park.id });
      expect(c.neighbourhood()!.trip).toBeNull();
    }
    expect(JSON.stringify(other.state()!.people)).toBe(JSON.stringify(core.state()!.people));
    expect(JSON.stringify(other.state()!.lots[park.id])).toBe(JSON.stringify(core.state()!.lots[park.id]));
  });

  it('sends anybody left in transit without a trip home instead of leaving them in limbo', () => {
    const core = coreWithoutSaves();
    core.startNewGame('guided', premadeHouseholds(db)[0]!, 11);
    const s = cloneState(core.state()!);
    const id = s.households[s.activeHouseholdId]!.memberIds[0]!;
    const home = s.households[s.activeHouseholdId]!.homeLotId!;
    s.people[id]!.location = { kind: 'offlot', place: 'errand', lotId: Object.keys(s.lots)[3]!, since: 0, until: 10, transit: true };
    s.schedule = [];
    core.replaceState(s);
    core.advanceTicks(4 * 60); // 9:00, the hourly check
    expect(core.state()!.people[id]!.location).toMatchObject({ kind: 'offlot', place: 'home', lotId: home });
    expect((core.state()!.people[id]!.location as { transit?: boolean }).transit).toBeUndefined();
  });
});
