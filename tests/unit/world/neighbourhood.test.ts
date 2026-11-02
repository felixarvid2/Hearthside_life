// Milestone 7 lot records and lazy layouts: twelve generated lots with six venue types, opening hours, travel times, and
// the builders indirection (a lot is laid out once, on first use, and a failing builder leaves the lot untouched).

import { describe, expect, it } from 'vitest';
import { NEIGHBOR_HOUSEHOLD, premadeHouseholds } from '../../../src/characters/creator';
import { createNewWorld } from '../../../src/game/newWorld';
import { createEmptyWorld } from '../../../src/core/state';
import { Rng, seedRng } from '../../../src/core/rng';
import {
  LOT_SPECS, VENUES, VENUE_TYPES, createNeighbourhoodLots, hoursText, lotIsOpen, travelMinutes, venueInfo,
} from '../../../src/world/neighbourhood';
import { DEFAULT_BUILDERS, STUB_BUILDERS, ensureLotBuilt, isLotBuilt, lotBuilders, setLotBuilders } from '../../../src/world/lotBuilders';
import { db } from '../integration/harness';

const world = () => createNewWorld(db, { seed: 7, mode: 'guided', household: premadeHouseholds(db)[0]!, neighbor: NEIGHBOR_HOUSEHOLD(db) });

describe('lot records', () => {
  it('creates twelve generated lots in a stable order with unique names and addresses', () => {
    const s = createEmptyWorld(1, 'guided');
    const lots = createNeighbourhoodLots(s, new Rng(seedRng(5)), 'Test Street');
    expect(lots.order).toHaveLength(12);
    expect(LOT_SPECS).toHaveLength(12);
    const all = Object.values(s.lots);
    expect(new Set(all.map((l) => l.name)).size).toBe(12);
    expect(new Set(all.map((l) => l.address)).size).toBe(12);
    for (const l of all) {
      expect(l.built).toBe(false);
      expect(l.entry).toEqual({ x: Math.floor(l.width / 2), z: l.depth - 1, level: 0 });
      expect(l.map!.x).toBeGreaterThanOrEqual(0);
      expect(l.map!.x).toBeLessThanOrEqual(100);
      expect(Object.keys(l.objects)).toHaveLength(0);
    }
    // same inputs, same lots
    const t = createEmptyWorld(1, 'guided');
    createNeighbourhoodLots(t, new Rng(seedRng(5)), 'Test Street');
    expect(JSON.stringify(t.lots)).toBe(JSON.stringify(s.lots));
  });

  it('a new world has 14 lots: the home, the house next door, six public venues and six more homes', () => {
    const s = world();
    const lots = Object.values(s.lots);
    expect(lots).toHaveLength(14);
    const venues = lots.filter((l) => l.kind === 'venue');
    expect(venues.map((l) => l.venueType).sort()).toEqual([...VENUE_TYPES].sort());
    const homes = lots.filter((l) => l.kind === 'residential');
    expect(homes).toHaveLength(8);
    const lived = homes.filter((l) => Object.values(s.households).some((h) => h.homeLotId === l.id));
    expect(lived).toHaveLength(6); // the player, next door and four named households
    const empty = homes.filter((l) => !lived.includes(l));
    expect(empty.map((l) => (l.rent !== undefined ? 'rent' : l.price !== undefined ? 'sale' : 'none')).sort()).toEqual(['rent', 'sale']);
    // the two lots the world creates first keep their layout and are positioned on the map
    const [home, next] = lots;
    expect(home!.built).toBeUndefined();
    expect(home!.map).toBeDefined();
    expect(next!.map).toBeDefined();
  });

  it('venues have opening hours and a capacity; homes are always open', () => {
    for (const t of VENUE_TYPES) {
      const v = VENUES[t];
      expect(v.open).toBeLessThan(v.close);
      expect(v.capacity).toBeGreaterThan(0);
      expect(hoursText(v)).toMatch(/AM - .*PM/);
    }
    const s = world();
    const park = Object.values(s.lots).find((l) => l.venueType === 'park')!;
    expect(lotIsOpen(park, 7 * 60)).toBe(true);
    expect(lotIsOpen(park, 23 * 60)).toBe(false);
    const library = Object.values(s.lots).find((l) => l.venueType === 'library')!;
    expect(lotIsOpen(library, 8 * 60)).toBe(false);
    expect(venueInfo(Object.values(s.lots)[0]!)).toBeUndefined();
    expect(lotIsOpen(Object.values(s.lots)[0]!, 3 * 60)).toBe(true);
  });

  it('travel takes 20 to 40 game minutes by map distance', () => {
    const s = world();
    const lots = Object.values(s.lots);
    const minutes = new Set<number>();
    for (const a of lots) for (const b of lots) if (a !== b) minutes.add(travelMinutes(a, b));
    for (const m of minutes) { expect(m).toBeGreaterThanOrEqual(20); expect(m).toBeLessThanOrEqual(40); expect(m % 5).toBe(0); }
    expect(minutes.size).toBeGreaterThan(2);
    const [home, next] = lots;
    expect(travelMinutes(home!, next!)).toBe(travelMinutes(next!, home!));
  });
});

describe('lazy lot layouts', () => {
  it('builds a lot once, on first use, with the real layouts; every generated lot builds', () => {
    const s = world();
    for (const lot of Object.values(s.lots)) {
      if (lot.built !== false) continue;
      expect(isLotBuilt(s, lot.id)).toBe(false);
      const r = ensureLotBuilt(s, db, lot.id);
      expect(r, lot.name).toEqual({ ok: true, built: true });
      expect(lot.built).toBe(true);
      const objects = Object.keys(lot.objects).length;
      expect(objects, `${lot.name} has things in it`).toBeGreaterThan(8);
      // a second call changes nothing
      const before = JSON.stringify(lot);
      expect(ensureLotBuilt(s, db, lot.id)).toEqual({ ok: true, built: false });
      expect(JSON.stringify(lot)).toBe(before);
    }
  });

  it('a builder that throws leaves the lot as it was and reports a readable reason', () => {
    const s = world();
    const lot = Object.values(s.lots).find((l) => l.venueType === 'park')!;
    const before = JSON.stringify(s.lots[lot.id]);
    const nextId = s.nextId;
    const prev = setLotBuilders({ venue: (state, _c, lotId) => { state.lots[lotId]!.walls['x'] = {} as never; state.nextId += 5; throw new Error('boom'); } });
    try {
      const r = ensureLotBuilt(s, db, lot.id);
      expect(r).toEqual({ ok: false, reason: expect.stringContaining('Lakeside Park could not be prepared (boom)') });
      expect(JSON.stringify(s.lots[lot.id])).toBe(before);
      expect(s.nextId).toBe(nextId);
      expect(s.lots[lot.id]!.built).toBe(false);
    } finally { setLotBuilders(prev); }
    expect(lotBuilders()).toBe(prev);
  });

  it('the light stub builders give empty venues and furnished homes', () => {
    const s = world();
    const prev = setLotBuilders(STUB_BUILDERS);
    try {
      const park = Object.values(s.lots).find((l) => l.venueType === 'park')!;
      expect(ensureLotBuilt(s, db, park.id)).toEqual({ ok: true, built: true });
      expect(Object.keys(park.objects)).toHaveLength(0);
      const home = Object.values(s.lots).find((l) => l.built === false && l.kind === 'residential')!;
      expect(ensureLotBuilt(s, db, home.id)).toEqual({ ok: true, built: true });
      expect(Object.keys(home.objects).length).toBeGreaterThan(15);
    } finally { setLotBuilders(prev); }
    expect(lotBuilders()).toBe(DEFAULT_BUILDERS);
  });
});
