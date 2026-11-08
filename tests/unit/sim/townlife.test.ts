// The light schedule (Milestone 7, sim/townlife.ts): where everybody outside the player's household is at any minute is a
// pure, deterministic function of the world; NPC households pay their bills automatically, once a week, without debt; rented
// homes pay rent instead of property tax.

import { describe, expect, it } from 'vitest';
import { NEIGHBOR_HOUSEHOLD, premadeHouseholds } from '../../../src/characters/creator';
import { MINUTES_PER_DAY, atDayMinute, dayIndex, minuteOfDay } from '../../../src/core/clock';
import { cloneState } from '../../../src/core/state';
import type { Person, WorldState } from '../../../src/core/types';
import { createNewWorld } from '../../../src/game/newWorld';
import { billBreakdown } from '../../../src/sim/economy';
import { shiftOn } from '../../../src/sim/careers';
import { WORK_LEAD_MINUTES, plannedPlace, plansAt, venueWeight } from '../../../src/sim/townlife';
import { VENUES, lotIsOpen } from '../../../src/world/neighbourhood';
import { coreWithoutSaves, db } from '../integration/harness';

const world = (seed = 42): WorldState => createNewWorld(db, { seed, mode: 'guided', household: premadeHouseholds(db)[0]!, neighbor: NEIGHBOR_HOUSEHOLD(db) });
const npcs = (s: WorldState): Person[] => Object.values(s.people).filter((p) => p.isNpc);

describe('plannedPlace', () => {
  it('is pure and deterministic: no state is read or written besides the world, and the rng stays put', () => {
    const s = world();
    const before = JSON.stringify(s);
    const rng = [...s.rng];
    const a = npcs(s).map((p) => plannedPlace(s, db, p, atDayMinute(2, 19 * 60 + 30)));
    const b = npcs(s).map((p) => plannedPlace(cloneState(s), db, p, atDayMinute(2, 19 * 60 + 30)));
    expect(a).toEqual(b);
    expect(JSON.stringify(s)).toBe(before);
    expect(s.rng).toEqual(rng);
  });

  it('puts people at work during their shift (with a short lead), at home at night, and never in a closed venue', () => {
    const s = world();
    let atWork = 0, atVenue = 0;
    for (const p of npcs(s)) {
      for (let t = 0; t < 7 * MINUTES_PER_DAY; t += 15) {
        const place = plannedPlace(s, db, p, t);
        const day = dayIndex(t);
        const shifts = [shiftOn(db, p, day - 1), shiftOn(db, p, day)].filter((w): w is NonNullable<typeof w> => !!w);
        const inShift = shifts.some((w) => t >= w.start - WORK_LEAD_MINUTES && t < w.end);
        expect(place.kind === 'work', `${p.firstName} at ${t}`).toBe(inShift);
        if (place.kind === 'work') atWork++;
        const mod = minuteOfDay(t);
        if (!inShift && (mod < 7 * 60 || mod >= 22 * 60 + 30)) expect(place.kind).toBe('home');
        if (place.kind === 'venue') {
          atVenue++;
          expect(lotIsOpen(s.lots[place.lotId]!, mod), `${s.lots[place.lotId]!.name} at ${mod}`).toBe(true);
          expect(s.lots[place.lotId]!.kind).toBe('venue');
        }
      }
    }
    expect(atWork).toBeGreaterThan(500);
    expect(atVenue).toBeGreaterThan(500);
  });

  it('keeps every venue within its capacity, at any minute', () => {
    const s = world();
    for (let t = 0; t < 3 * MINUTES_PER_DAY; t += 30) {
      const counts = new Map<string, number>();
      for (const place of plansAt(s, db, t).values()) if (place.kind === 'venue') counts.set(place.lotId, (counts.get(place.lotId) ?? 0) + 1);
      for (const [lotId, n] of counts) expect(n).toBeLessThanOrEqual(VENUES[s.lots[lotId]!.venueType as keyof typeof VENUES].capacity);
    }
  });

  it('lets traits steer where people go: athletes favour the gym, readers the library', () => {
    const s = world();
    const base = npcs(s)[0]!;
    const athlete: Person = { ...base, id: 'per_athlete', traits: ['athletic'], career: null, likes: [], dislikes: [] };
    const reader: Person = { ...base, id: 'per_reader', traits: ['bookish'], career: null, likes: [], dislikes: [] };
    expect(venueWeight(db, athlete, 'gym')).toBeGreaterThan(venueWeight(db, reader, 'gym'));
    expect(venueWeight(db, reader, 'library')).toBeGreaterThan(venueWeight(db, athlete, 'library'));
    const gym = Object.values(s.lots).find((l) => l.venueType === 'gym')!;
    const library = Object.values(s.lots).find((l) => l.venueType === 'library')!;
    const tally = (p: Person) => {
      const n = { gym: 0, library: 0 };
      for (let d = 0; d < 120; d++) for (let t = 9 * 60; t < 20 * 60; t += 90) {
        const place = plannedPlace(s, db, p, atDayMinute(d, t));
        if (place.kind === 'venue' && place.lotId === gym.id) n.gym++;
        if (place.kind === 'venue' && place.lotId === library.id) n.library++;
      }
      return n;
    };
    const a = tally(athlete), r = tally(reader);
    expect(a.gym).toBeGreaterThan(r.gym);
    expect(r.library).toBeGreaterThan(a.library);
  });
});

describe('households outside the player\'s control', () => {
  it('pay the weekly bill automatically once, never go into debt, and pay rent instead of property tax in rented homes', () => {
    const core = coreWithoutSaves();
    core.startNewGame('guided', premadeHouseholds(db)[0]!, 42);
    const s = core.state()!;
    s.settings.visitors = false;
    s.settings.townLife = false; // jobs and moves would change who can pay
    s.schedule = [];
    const others = Object.values(s.households).filter((h) => !h.isPlayable);
    const rented = others.find((h) => s.lots[h.homeLotId!]!.rent !== undefined)!;
    const owned = others.find((h) => s.lots[h.homeLotId!]!.ownerHouseholdId === h.id)!;
    expect(billBreakdown(s, db, rented.id)).toMatchObject({ propertyTax: 0, rent: s.lots[rented.homeLotId!]!.rent });
    expect(billBreakdown(s, db, owned.id).rent).toBe(0);
    expect(billBreakdown(s, db, owned.id).propertyTax).toBeGreaterThan(0);
    const poor = others.find((h) => h !== rented && h !== owned)!;
    for (const id of poor.memberIds) s.people[id]!.career = null;
    poor.funds = 100; poor.ledger = [{ id: 'led_p', at: 0, kind: 'start', amount: 100, label: 'Starting funds' }];
    core.advanceTicks(4 * 60 * 24 * 15); // two weeks
    for (const h of others) {
      const bills = h.ledger.filter((l) => l.kind === 'bill');
      const occ = bills.map((l) => l.occurrence);
      expect(new Set(occ).size, h.name).toBe(occ.length);
      expect(h.funds).toBeGreaterThanOrEqual(0);
      if (h !== poor) expect(bills.length, `${h.name} paid weeks 1 and 2 and 3`).toBe(3);
      expect(bills.every((l) => l.amount < 0)).toBe(true);
      expect(h.ledger.reduce((sum, l) => sum + l.amount, 0)).toBe(h.funds);
    }
    expect(rented.ledger.filter((l) => l.kind === 'bill')[0]!.amount).toBeLessThanOrEqual(-(s.lots[rented.homeLotId!]!.rent!));
    // no bill records, no late fees, no cut-offs for them
    expect((s.bills ?? []).every((b) => b.householdId === s.activeHouseholdId)).toBe(true);
    expect(others.every((h) => !h.powerOff)).toBe(true);
    // the person whose household could not afford it paid nothing
    expect(poor.ledger.filter((l) => l.kind === 'bill' && l.amount < -100)).toHaveLength(0);
  }, 60_000);
});
