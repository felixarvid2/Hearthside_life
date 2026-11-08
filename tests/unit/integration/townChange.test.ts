// social gaps pass: townspeople change jobs and NPC households move to empty homes, from the world generator, on the real world.

import { describe, expect, it, vi } from 'vitest';
import { premadeHouseholds } from '../../../src/characters/creator';
import { atDayMinute, weekday } from '../../../src/core/clock';
import { cloneState } from '../../../src/core/state';
import type { WorldState } from '../../../src/core/types';
import type { GameCore } from '../../../src/game/GameCore';
import { isVacant } from '../../../src/sim/households';
import { changeJob, dailyTownChange, homesFor, jobChangeCandidates, movableHouseholds, moveTownHousehold } from '../../../src/sim/townChange';
import { Rng } from '../../../src/core/rng';
import { Reservations } from '../../../src/sim/reservations';
import type { SimCtx } from '../../../src/sim/context';
import { coreWithoutSaves, db } from './harness';

vi.setConfig({ testTimeout: 120_000 });

const premades = premadeHouseholds(db);

function game(seed = 42): GameCore {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', premades[0]!, seed)).toEqual({ ok: true });
  const s = core.state()!;
  s.settings.visitors = false;
  s.schedule = s.schedule.filter((e) => e.kind === 'travelArrive');
  return core;
}
const ctxOf = (c: GameCore): SimCtx => {
  const s = c.state()!;
  return { state: s, content: db, nav: { invalidate: () => undefined } as never, events: { emit: () => undefined } as never, rng: new Rng(s.rng), res: new Reservations(), now: s.clock.minutes, counters: { routeRequests: 0 } };
};
const homes = (s: WorldState) => Object.values(s.households).map((h) => h.homeLotId);

/** A fingerprint of the town's jobs and homes. */
const townPrint = (s: WorldState): string => JSON.stringify([
  Object.values(s.people).map((p) => [p.id, p.career?.careerId ?? null]),
  Object.values(s.households).map((h) => [h.id, h.homeLotId]),
]);

describe('jobs in town', () => {
  it('hires the unemployed, switches careers and lets a second earner quit, never touching the player', () => {
    const c = game();
    const s = c.state()!;
    const ctx = ctxOf(c);
    const cands = jobChangeCandidates(ctx);
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.every((p) => p.householdId !== s.activeHouseholdId)).toBe(true);
    const jobless = cands.find((p) => !p.career) ?? (() => { const p = cands[0]!; p.career = null; return p; })();
    expect(changeJob(ctx, jobless)).toBe('hired');
    expect(jobless.career).toMatchObject({ level: 1, shift: null });
    expect(db.careers[jobless.career!.careerId]!.partTime).toBeFalsy();
    const before = jobless.career!.careerId;
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const r = changeJob(ctx, jobless);
      seen.add(r!);
      if (!jobless.career) changeJob(ctx, jobless); // hire again
    }
    expect(seen.has('switched')).toBe(true);
    expect(jobless.career?.careerId).toBeDefined();
    void before;
  });

  it('a lone earner never quits', () => {
    const c = game();
    const s = c.state()!;
    const ctx = ctxOf(c);
    const p = jobChangeCandidates(ctx).find((x) => s.households[x.householdId]!.memberIds.length === 1 && x.lifeStage !== 'elder');
    if (!p) return;
    if (!p.career) changeJob(ctx, p);
    for (let i = 0; i < 25; i++) expect(changeJob(ctx, p)).not.toBe('quit');
  });
});

describe('the daily roll', () => {
  it('moves one household on moving day only, and changes jobs on any day', () => {
    const c = game();
    const s = c.state()!;
    const ctx = ctxOf(c);
    const thursday = [...Array(14).keys()].map((d) => d + 2).find((d) => weekday(atDayMinute(d, 0)) === 3)!;
    const monday = [...Array(14).keys()].map((d) => d + 2).find((d) => weekday(atDayMinute(d, 0)) === 0)!;
    const printHomes = () => JSON.stringify(Object.values(s.households).map((h) => h.homeLotId));
    const start = printHomes();
    for (let i = 0; i < 40; i++) { ctx.now = atDayMinute(monday, 0); dailyTownChange(ctx, monday); }
    expect(printHomes()).toBe(start); // nobody moves on a Monday
    let moved = false;
    for (let i = 0; i < 60 && !moved; i++) {
      ctx.now = atDayMinute(thursday, 0);
      ctx.state.processed = Object.fromEntries(Object.entries(ctx.state.processed).filter(([k]) => !k.startsWith('money:townmove')));
      dailyTownChange(ctx, thursday);
      moved = printHomes() !== start;
    }
    expect(moved).toBe(true);
    expect(ctx.state.rng).not.toEqual([0, 0, 0, 0]);
  });
});

describe('the Town life setting', () => {
  it('switched off, the town stays exactly as it is', () => {
    const c = game();
    const s = c.state()!;
    s.settings.townLife = false;
    const ctx = ctxOf(c);
    const start = townPrint(s);
    const rng = [...s.rng];
    for (let d = 2; d < 60; d++) { ctx.now = atDayMinute(d, 0); dailyTownChange(ctx, d); }
    expect(townPrint(s)).toBe(start);
    expect([...s.rng]).toEqual(rng);
  });
});

describe('moving house in town', () => {
  it('moves an NPC household into an empty home they can afford: money, ownership, locations and the old home', () => {
    const c = game();
    const s = c.state()!;
    const ctx = ctxOf(c);
    const hh = movableHouseholds(ctx)[0]!;
    const oldId = hh.homeLotId!;
    const targets = homesFor(ctx, hh);
    expect(targets.length).toBeGreaterThan(0);
    const target = targets[0]!;
    expect(isVacant(s, target)).toBe(true);
    const funds = hh.funds;
    const renting = target.rent !== undefined;
    expect(moveTownHousehold(ctx, hh.id, target.id)).toBe(true);
    expect(hh.homeLotId).toBe(target.id);
    expect(isVacant(s, s.lots[oldId]!)).toBe(true);
    expect(isVacant(s, target)).toBe(false);
    for (const m of hh.memberIds) expect(s.people[m]!.location).toMatchObject({ kind: 'offlot', place: 'home', lotId: target.id });
    expect(hh.ledger.reduce((a, l) => a + l.amount, 0)).toBe(hh.funds);
    if (renting) expect(target.ownerHouseholdId).toBeNull(); else expect(target.ownerHouseholdId).toBe(hh.id);
    expect(hh.funds).not.toBe(funds);
    // a second go the same day is refused (paid once)
    expect(moveTownHousehold(ctx, hh.id, target.id)).toBe(false);
    expect(target.built).not.toBe(false);
    // everybody still has exactly one home
    const used = homes(s).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });

  it('never moves the player, the neighbours next door, or anybody on the active lot', () => {
    const c = game();
    const s = c.state()!;
    const ctx = ctxOf(c);
    const ids = movableHouseholds(ctx).map((h) => h.id);
    expect(ids).not.toContain(s.activeHouseholdId);
    expect(ids).not.toContain(s.neighbourhood!.nextDoorHouseholdId);
    const hh = movableHouseholds(ctx)[0]!;
    const lotId = hh.homeLotId!;
    s.activeLotId = lotId;
    expect(movableHouseholds(ctx).map((h) => h.id)).not.toContain(hh.id);
  });

  it('over three weeks the town changes, identically for the same seed and different for another', () => {
    const run = (seed: number) => {
      const c = game(seed);
      const start = townPrint(c.state()!);
      c.advanceTicks(Math.ceil((atDayMinute(21, 0) - c.state()!.clock.minutes) / 0.25));
      return { start, end: townPrint(c.state()!), state: c.state()! };
    };
    const a = run(7), b = run(7), d = run(8);
    expect(a.end).toBe(b.end);
    expect(a.end).not.toBe(a.start);
    expect(d.end).not.toBe(a.end);
    // invariants after three weeks
    for (const s of [a.state, d.state]) {
      const used = homes(s).filter(Boolean);
      expect(new Set(used).size).toBe(used.length);
      for (const hh of Object.values(s.households)) {
        expect(hh.ledger.reduce((x, l) => x + l.amount, 0)).toBe(hh.funds);
        for (const m of hh.memberIds) {
          const p = s.people[m]!;
          if (p.location.kind === 'offlot' && p.location.place === 'home' && p.location.lotId) expect(p.location.lotId).toBe(hh.homeLotId);
        }
      }
    }
    expect(cloneState(a.state).neighbourhood).toEqual(a.state.neighbourhood);
  });
});
