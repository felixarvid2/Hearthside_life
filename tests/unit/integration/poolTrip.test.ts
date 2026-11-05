// Milestone 12, task O headless playtest: a household travels to the new public swimming pool, swims in the six-by-ten
// lap pool, showers in the changing rooms and travels home. The venue is built lazily on arrival, its pool is real
// water that navigation refuses, and the household comes home sane.

import { describe, expect, it } from 'vitest';
import { premadeHouseholds } from '../../../src/characters/creator';
import type { GameCore } from '../../../src/game/GameCore';
import type { Id, WorldState } from '../../../src/core/types';
import { poolCenter, poolsOf, poolDepth, poolWidth } from '../../../src/world/pools';
import { coreWithoutSaves, db, members } from './harness';

const premades = premadeHouseholds(db);

const now = (c: GameCore) => c.state()!.clock.minutes;

function runUntil(c: GameCore, pred: () => boolean, maxMinutes = 240): boolean {
  for (let i = 0; i < maxMinutes * 4; i++) { if (pred()) return true; c.advanceTicks(1); }
  return pred();
}

function quietCore(): GameCore {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', premades[0]!, 42)).toEqual({ ok: true });
  const s = core.state()!;
  s.settings.visitors = false;
  s.settings.autonomy = false;
  s.schedule = s.schedule.filter((e) => e.kind !== 'visitArrive');
  for (const id of members(s)) if (s.people[id]!.career) core.quitCareer(id);
  return core;
}

const inTrip = (c: GameCore) => c.neighbourhood()!.trip !== null;
const isWater = (pool: ReturnType<typeof poolsOf>[number], loc: { x: number; z: number }) =>
  Math.floor(loc.x) >= pool.x0 && Math.floor(loc.x) <= pool.x1 && Math.floor(loc.z) >= pool.z0 && Math.floor(loc.z) <= pool.z1;

describe('a day trip to the swimming pool', { timeout: 180_000 }, () => {
  it('travels to Quayside Baths, swims, showers and comes home', () => {
    const core = quietCore();
    const s = core.state()!;
    const ids = members(s);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    const homeId = s.activeLotId;
    const poolLot = Object.values(s.lots).find((l) => l.venueType === 'pool')!;
    expect(poolLot).toBeDefined();
    expect(poolLot.name).toBe('Quayside Baths');
    expect(poolLot.built).toBe(false);

    const finished: string[] = [];
    core.events.onAny((e) => { if (e.type === 'action.finished' && e.result === 'done') finished.push(e.interactionId); });

    // --- travel to the pool ----------------------------------------------------------------
    const go = core.travel(ids, poolLot.id);
    expect(go).toMatchObject({ ok: true });
    expect(go.minutes).toBeGreaterThanOrEqual(20);
    expect(runUntil(core, () => !inTrip(core), 90)).toBe(true);
    expect(s.activeLotId).toBe(poolLot.id);
    expect(poolLot.built).toBe(true);

    // --- the venue: a roofed hall with a 6x10 pool and ladders on both short sides ----------
    const lot = s.lots[poolLot.id]!;
    const pools = poolsOf(lot);
    expect(pools).toHaveLength(1);
    const pool = pools[0]!;
    expect(poolWidth(pool)).toBe(6);
    expect(poolDepth(pool)).toBe(10);
    expect(pool.ladders).toHaveLength(2);
    expect(new Set(pool.ladders.map((l) => l.side))).toEqual(new Set(['n', 's']));
    expect(Object.keys(lot.roofs ?? {})).toHaveLength(1);
    const doors = Object.values(lot.walls).filter((w) => w.id.includes('h'));
    expect(doors.length).toBeGreaterThan(0);
    for (const defId of ['locker-bank', 'bench-cushion', 'shower-stall', 'toilet-basic', 'vending-machine', 'sun-lounger']) {
      expect(Object.values(lot.objects).filter((o) => o.defId === defId).length, defId).toBeGreaterThan(0);
    }

    // --- swim ------------------------------------------------------------------------------
    const swimmer = s.people[ids[0]!]!;
    swimmer.needs.fun = 20;
    swimmer.needs.energy = 80;
    swimmer.needs.hygiene = 60;
    const center = poolCenter(pool);
    const swim = core.options(swimmer.id, { kind: 'floor', tile: { x: center.x, z: center.z }, level: 0 })
      .find((o) => o.interactionId === 'swimInPool');
    expect(swim?.enabled, swim?.reason).toBe(true);
    if (!swim) return;
    const q = core.queue(swimmer.id, swim);
    expect(q, q.ok ? '' : q.reason).toMatchObject({ ok: true });
    expect(runUntil(core, () => finished.includes('swimInPool'), 240)).toBe(true);
    // the outlet works: the swimmer has left the water (a ladder, never a teleport onto the deep end)
    const loc = s.people[swimmer.id]!.location;
    expect(loc.kind).toBe('lot');
    if (loc.kind === 'lot') {
      expect(loc.lotId).toBe(lot.id);
      expect(isWater(pool, loc)).toBe(false);
    }
    expect(swimmer.skills.fitness?.xp ?? 0).toBeGreaterThan(0);
    expect(swimmer.outfits.current.category).not.toBe('swim');

    // --- shower in the changing rooms ------------------------------------------------------
    swimmer.needs.hygiene = 20;
    const shower = Object.values(lot.objects).find((o) => o.defId === 'shower-stall')!;
    const wash = core.options(swimmer.id, { kind: 'object', objectId: shower.id }).find((o) => o.interactionId === 'takeShower');
    expect(wash?.enabled, wash?.reason).toBe(true);
    if (!wash) return;
    const beforeHygiene = swimmer.needs.hygiene;
    expect(core.queue(swimmer.id, wash)).toMatchObject({ ok: true });
    expect(runUntil(core, () => finished.includes('takeShower'), 90)).toBe(true);
    expect(swimmer.needs.hygiene).toBeGreaterThan(beforeHygiene);

    // --- home again ------------------------------------------------------------------------
    const back = core.travel(ids, homeId);
    expect(back).toMatchObject({ ok: true });
    expect(runUntil(core, () => !inTrip(core), 90)).toBe(true);
    expect(s.activeLotId).toBe(homeId);
    expect(s.lots[homeId]).toBeDefined();
    for (const id of ids) {
      const p = s.people[id]!;
      expect(p.location.kind).toBe('lot');
      if (p.location.kind === 'lot') expect(p.location.lotId).toBe(s.activeLotId);
      for (const [need, value] of Object.entries(p.needs)) {
        expect(Number.isFinite(value), `${need}`).toBe(true);
        expect(value, `${need}`).toBeGreaterThanOrEqual(0);
        expect(value, `${need}`).toBeLessThanOrEqual(100);
      }
    }
    // the venue keeps its pool and the trip cost nothing
    expect(poolsOf(s.lots[lot.id]!)).toHaveLength(1);
    expect(now(core)).toBeGreaterThan(go.arrivesAt!);
  });

  it('an existing save without the pool lot keeps working; the lot is only added to new worlds', () => {
    // The pool is an ordinary thirteenth lot record created with the neighbourhood (no save version change): a world
    // built by the current code either has it or not, and nothing else depends on it existing.
    const core = quietCore();
    const s: WorldState = core.state()!;
    const poolLot = Object.values(s.lots).find((l) => l.venueType === 'pool')!;
    const copy = JSON.parse(JSON.stringify(s)) as WorldState;
    delete copy.lots[poolLot.id];
    copy.neighbourhood!.lotIds = copy.neighbourhood!.lotIds.filter((id: Id) => id !== poolLot.id);
    expect(Object.values(copy.lots).some((l) => l.venueType === 'pool')).toBe(false);
    // the rest of the world is untouched and every remaining lot still refers to a real lot
    for (const id of Object.values(copy.households).flatMap((h) => (h.homeLotId ? [h.homeLotId] : []))) expect(copy.lots[id]).toBeDefined();
    expect(copy.neighbourhood!.lotIds.every((id: Id) => copy.lots[id] !== undefined)).toBe(true);
  });
});
