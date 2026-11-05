// Milestone 7 neighbourhood generation: thirteen generated lots and the named NPC households that live in them are created
// exactly once, with names, traits, jobs and relationships, and then never rerolled - not by lot changes, not by saving
// and loading. Saves from before the milestone get the same neighbourhood generated around what they already have.

import { describe, expect, it, vi } from 'vitest';
import { NEIGHBOR_HOUSEHOLD, premadeHouseholds } from '../../../src/characters/creator';
import { cloneState } from '../../../src/core/state';
import type { Person, WorldState } from '../../../src/core/types';
import { ensureNeighbourhood } from '../../../src/game/neighbourhood';
import { createNewWorld } from '../../../src/game/newWorld';
import { exportWorld, validateWorld } from '../../../src/persistence/index';
import { coreWithoutSaves, db, freshStore } from './harness';

vi.setConfig({ testTimeout: 60_000 });

const premades = premadeHouseholds(db);
const make = (seed = 42): WorldState => createNewWorld(db, { seed, mode: 'guided', household: premades[0]!, neighbor: NEIGHBOR_HOUSEHOLD(db) });

/** What makes a person who they are: must never change after generation. */
const identity = (p: Person) => JSON.stringify([
  p.id, p.firstName, p.lastName, p.pronouns, p.lifeStage, p.bio, p.voice, p.walkStyle, p.romance, p.appearance, p.outfits, p.traits,
  p.likes, p.dislikes, p.aspiration?.aspirationId ?? null, p.career?.careerId ?? null,
]);

const npcHouseholds = (s: WorldState) => (s.neighbourhood?.npcHouseholdIds ?? []).map((id) => s.households[id]!);

describe('the generated neighbourhood', () => {
  it('has four named NPC households with homes, jobs, traits and relationships among them', () => {
    const s = make();
    expect(s.neighbourhood).toMatchObject({ version: 1 });
    const hhs = npcHouseholds(s);
    expect(hhs).toHaveLength(4);
    const homes = new Set<string>();
    for (const hh of hhs) {
      expect(hh.name.length).toBeGreaterThan(1);
      expect(hh.isPlayable).toBe(false);
      expect(hh.memberIds.length).toBeGreaterThanOrEqual(1);
      expect(hh.homeLotId).toBeTruthy();
      homes.add(hh.homeLotId!);
      const lot = s.lots[hh.homeLotId!]!;
      expect(lot.kind).toBe('residential');
      // owned or rented, never both and never neither
      expect([lot.ownerHouseholdId === hh.id, lot.rent !== undefined].filter(Boolean)).toHaveLength(1);
      expect(hh.funds).toBeGreaterThan(0);
      expect(hh.ledger.reduce((sum, l) => sum + l.amount, 0)).toBe(hh.funds);
      expect(hh.memberIds.some((id) => s.people[id]!.career !== null), `${hh.name} has a job`).toBe(true);
      for (const id of hh.memberIds) {
        const p = s.people[id]!;
        expect(p.isNpc).toBe(true);
        // Children have fewer traits than the full three of a grown-up (as adopted children do).
        expect(p.traits).toHaveLength(p.lifeStage === 'baby' ? 1 : p.lifeStage === 'child' || p.lifeStage === 'toddler' ? 2 : 3);
        expect(p.location).toMatchObject({ kind: 'offlot', place: 'home', lotId: hh.homeLotId });
        // Adults, or the children of a family household (Milestone 8 gap).
        expect(['baby', 'toddler', 'child', 'teen', 'adult']).toContain(p.lifeStage);
      }
    }
    expect(homes.size).toBe(4);
    // basic relationships among the households, and the people next door
    const statuses = Object.values(s.bonds).filter((b) => {
      const a = s.people[b.a]!, c = s.people[b.b]!;
      return a.householdId !== c.householdId && !s.households[a.householdId]!.isPlayable && !s.households[c.householdId]!.isPlayable;
    }).map((b) => b.status);
    expect(statuses.length).toBeGreaterThanOrEqual(5);
    expect(statuses).toEqual(expect.arrayContaining(['friend', 'acquaintance', 'rival']));
    // household members know each other already (ties)
    const roommates = hhs.find((h) => h.memberIds.length === 2)!;
    const [a, b] = roommates.memberIds;
    expect(s.relationships[`${a}>${b}`]!.familiarity).toBeGreaterThan(0);
    // the player and the people next door are not mixed up with them
    expect(hhs.some((h) => h.id === s.activeHouseholdId)).toBe(false);
  });

  it('is deterministic for a seed, different for another, and leaves the world random generator alone', () => {
    const a = make(42), b = make(42), c = make(43);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(npcHouseholds(c).map((h) => h.name)).not.toEqual(npcHouseholds(a).map((h) => h.name));
    // identical random future with and without the neighbourhood: the world rng is put back
    const bare = cloneState(a);
    expect(a.rng).toEqual(bare.rng);
    const fresh = coreWithoutSaves();
    fresh.startNewGame('guided', premades[0]!, 42);
    expect(fresh.state()!.rng).toEqual(a.rng);
  });

  it('passes the save validation with no missing content, survives JSON, and has valid homes after they are built', () => {
    const s = make();
    expect(cloneState(s)).toEqual(s);
    const v = validateWorld(s, db);
    expect(v.errors).toEqual([]);
    expect(v.missing).toEqual([]);
  });

  it('is not regenerated or changed by saving, loading, importing and visiting lots', async () => {
    const core = coreWithoutSaves();
    core.startNewGame('guided', premades[0]!, 42);
    const before = core.state()!;
    const people = Object.values(before.people).filter((p) => p.isNpc);
    const idsBefore = people.map(identity);
    const lotNames = Object.values(before.lots).map((l) => `${l.id}:${l.name}:${l.address}`);
    const marker = JSON.stringify(before.neighbourhood);
    const hhIds = Object.keys(before.households);

    // visit a neighbour's home and a venue, and come home
    const members = before.households[before.activeHouseholdId]!.memberIds;
    const target = npcHouseholds(before)[1]!.homeLotId!;
    expect(core.travel(members, target).ok).toBe(true);
    core.advanceTicks(4 * 60);
    expect(core.state()!.activeLotId).toBe(target);
    const park = Object.values(before.lots).find((l) => l.venueType === 'park')!.id;
    expect(core.travel(members, park).ok).toBe(true);
    core.advanceTicks(4 * 60);
    expect(core.state()!.activeLotId).toBe(park);

    // save and load through the store, then export and import
    const store = await freshStore();
    const gc = coreWithoutSaves();
    await store.save('slot-1', 'neighbourhood', core.state()!);
    const loaded = await store.load('slot-1', db);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    gc.replaceState(loaded.state);
    const imp = coreWithoutSaves();
    expect((await imp.importWorld(exportWorld(core.state()!, '2026-11-02T00:00:00.000Z'))).ok).toBe(true);

    for (const state of [core.state()!, gc.state()!, imp.state()!]) {
      expect(Object.keys(state.households)).toEqual(hhIds);
      expect(JSON.stringify(state.neighbourhood)).toBe(marker);
      expect(Object.values(state.lots).map((l) => `${l.id}:${l.name}:${l.address}`)).toEqual(lotNames);
      expect(Object.values(state.people).filter((p) => p.isNpc || before.people[p.id]!.isNpc).map(identity)).toEqual(idsBefore);
    }
    // the visited lots were built once and are saved as built
    expect(gc.state()!.lots[target]!.built).toBe(true);
    expect(JSON.stringify(gc.state()!.lots[park])).toBe(JSON.stringify(core.state()!.lots[park]));
    expect(JSON.stringify(imp.state()!.lots[target])).toBe(JSON.stringify(core.state()!.lots[target]));
  });
});

describe('saves from before the neighbourhood', () => {
  /** Removes everything the generator added, leaving a world as Milestone 6 saved it. */
  function legacy(s: WorldState): WorldState {
    const old = cloneState(s);
    const gone = new Set(old.neighbourhood!.npcHouseholdIds);
    const people = new Set<string>();
    for (const id of gone) {
      for (const p of old.households[id]!.memberIds) people.add(p);
      const lot = old.households[id]!.homeLotId!;
      delete old.lots[lot];
      delete old.households[id];
    }
    for (const [id, lot] of Object.entries(old.lots)) if (lot.built === false) delete old.lots[id];
    for (const id of people) delete old.people[id];
    for (const k of Object.keys(old.relationships)) { const [a, b] = k.split('>'); if (people.has(a!) || people.has(b!)) delete old.relationships[k]; }
    for (const [k, b] of Object.entries(old.bonds)) if (people.has(b.a) || people.has(b.b)) delete old.bonds[k];
    for (const lot of Object.values(old.lots)) delete lot.map;
    delete old.neighbourhood;
    return old;
  }

  it('get a neighbourhood generated on load, deterministically, with the household, lot and neighbours untouched', () => {
    const original = make(42);
    const old = legacy(original);
    expect(Object.keys(old.lots)).toHaveLength(2);
    expect(old.neighbourhood).toBeUndefined();
    const rngBefore = [...old.rng];
    const homeBefore = JSON.stringify(old.lots[old.activeLotId]);
    const playerBefore = JSON.stringify([old.households[old.activeHouseholdId], ...old.households[old.activeHouseholdId]!.memberIds.map((id) => old.people[id])]);
    const nextDoor = Object.values(old.households).find((h) => !h.isPlayable)!;

    const a = cloneState(old), b = cloneState(old);
    expect(ensureNeighbourhood(a, db)).toBe(true);
    expect(ensureNeighbourhood(b, db)).toBe(true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // deterministic
    expect(ensureNeighbourhood(a, db)).toBe(false); // exactly once

    expect(Object.keys(a.lots)).toHaveLength(15);
    expect(a.rng).toEqual(rngBefore);
    expect(npcHouseholds(a)).toHaveLength(4);
    expect(npcHouseholds(a).map((h) => h.name)).toEqual(npcHouseholds(original).map((h) => h.name));
    const strip = (s: WorldState) => JSON.stringify(s.lots[s.activeLotId], (k, v) => (k === 'map' ? undefined : v));
    expect(strip(a)).toBe(homeBefore);
    const a0 = a.households[a.activeHouseholdId]!;
    expect(JSON.stringify([a0, ...a0.memberIds.map((id) => a.people[id])])).toBe(playerBefore);
    const nh = a.households[nextDoor.id]!;
    expect(JSON.stringify([nh, nh.memberIds.map((id) => a.people[id]), { ...a.lots[nh.homeLotId!], map: undefined }])).toBe(JSON.stringify([nextDoor, nextDoor.memberIds.map((id) => old.people[id]), { ...old.lots[nextDoor.homeLotId!], map: undefined }]));
    expect(validateWorld(a, db).errors).toEqual([]);
  });

  it('are completed when loaded through the game (replaceState and import), and the loaded game can travel at once', async () => {
    const old = legacy(make(42));
    const core = coreWithoutSaves();
    core.replaceState(cloneState(old));
    core.setMode('live');
    const s = core.state()!;
    expect(Object.keys(s.lots)).toHaveLength(15);
    expect(s.neighbourhood?.nextDoorHouseholdId).toBe(Object.values(old.households).find((h) => !h.isPlayable)!.id); // the people next door keep their number on the phone
    const imp = coreWithoutSaves();
    const json = JSON.stringify({ format: 'hearthside-world', schemaVersion: 1, exportedAt: 'x', packs: [], world: old });
    expect((await imp.importWorld(json)).ok).toBe(true);
    expect(Object.keys(imp.state()!.lots)).toHaveLength(15);
    const members = s.households[s.activeHouseholdId]!.memberIds;
    const cafe = Object.values(s.lots).find((l) => l.venueType === 'cafe')!;
    expect(core.travel(members, cafe.id)).toMatchObject({ ok: true });
  });
});
