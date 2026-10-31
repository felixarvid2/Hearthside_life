// Headless playtests: three game days at full autonomy in the real starter house with the real content,
// navigation and simulation, for the Guided Start single and the roommate household. Prints a day summary
// per person (run with `npx vitest run tests/unit/integration --reporter=default` to see it).

import { describe, expect, it } from 'vitest';
import { atDayMinute } from '../../../src/core/clock';
import { NEED_IDS } from '../../../src/core/types';
import { neighbours } from '../../../src/sim/index';
import { Recorder, coreWithoutSaves, db, members } from './harness';

const DAYS = 3;
const STUCK_TICKS = 3 * 60 * 4; // three game hours

function playtest(householdIndex: number, seed: number) {
  const core = coreWithoutSaves();
  const draft = core.premadeHouseholds()[householdIndex]!;
  const start = core.startNewGame(householdIndex === 0 ? 'guided' : 'create', draft, seed);
  expect(start).toEqual({ ok: true });
  const rec = new Recorder(core);
  rec.runUntil(atDayMinute(DAYS, 8 * 60)); // day 0 08:00 -> day 3 08:00
  return { core, rec, state: core.state()! };
}

/** Needs that are allowed to fall below 15 (known sim bug, see bugs.test.ts). */
function checkHousehold(name: string, r: ReturnType<typeof playtest>, exempt: readonly string[] = []) {
  const { rec, state } = r;
  const people = members(state);
  for (const line of rec.summary()) console.log(`[${name}] ${line}`);

  for (const p of people) {
    const days = rec.days.get(p.id)!.slice(0, DAYS);
    // Nobody stuck: the current action changes or progresses (or the person moves) at least every 3 game hours.
    const still = rec.longestStill.get(p.id);
    expect(still?.ticks ?? 0, `${p.firstName} stood still: ${still?.what} until ${still ? rec.stamp(still.at) : ''}`).toBeLessThan(STUCK_TICKS);
    // No route failure loops.
    expect(rec.failureRuns.get(p.id) ?? 0, `${p.firstName} repeated route failures`).toBeLessThanOrEqual(2);
    const routeFailures = days.flatMap((d) => d.failed).filter((f) => /reach|blocked|get there|move/i.test(f.reason));
    expect(routeFailures.length, `${p.firstName} route failures: ${JSON.stringify(routeFailures)}`).toBeLessThanOrEqual(3 * DAYS);
    // Needs stay mostly above 15.
    const onLot = days.reduce((s, d) => s + d.onLotTicks, 0);
    for (const n of NEED_IDS) {
      if (exempt.includes(n)) continue;
      const low = days.reduce((s, d) => s + d.lowTicks[n], 0);
      expect(low / onLot, `${p.firstName} ${n} below 15 for ${low} of ${onLot} ticks`).toBeLessThan(0.1);
    }
    // Eats every day, sleeps in a bed every night.
    for (const [i, d] of days.entries()) {
      expect((d.done.eatMeal ?? 0) + (d.done.grabSnack ?? 0), `${p.firstName} ate on day ${i + 1}`).toBeGreaterThan(0);
    }
    expect(days.reduce((s, d) => s + d.bedSleeps, 0), `${p.firstName} slept in a bed`).toBeGreaterThanOrEqual(DAYS - 1);
    expect(days.reduce((s, d) => s + d.sleepMinutes, 0) / 60, `${p.firstName} hours asleep`).toBeGreaterThan(6 * (DAYS - 1));
    for (const v of Object.values(p.needs)) expect(Number.isFinite(v)).toBe(true);
  }

  // Food gets cooked and eaten.
  const all = [...rec.days.values()].flatMap((d) => d.slice(0, DAYS));
  expect(all.reduce((s, d) => s + (d.done.cookMeal ?? 0), 0)).toBeGreaterThanOrEqual(DAYS);
  expect(all.reduce((s, d) => s + (d.done.eatMeal ?? 0), 0)).toBeGreaterThanOrEqual(DAYS);

  // The first neighbour arrives on day 0 around 17:00, introduces themself and leaves again.
  const neighbour = neighbours(state)[0]!;
  const arrival = rec.arrivals.find((a) => a.personId === neighbour.id);
  expect(arrival, 'the neighbour visited').toBeDefined();
  expect(arrival!.at).toBeGreaterThanOrEqual(atDayMinute(0, 17 * 60));
  expect(arrival!.at).toBeLessThan(atDayMinute(0, 17 * 60 + 15));
  const intro = rec.socials.filter((s) => s.socialId === 'introduce' && s.accepted && (s.actorId === neighbour.id || s.targetId === neighbour.id));
  expect(intro.length, 'the neighbour was introduced').toBeGreaterThan(0);
  expect(intro[0]!.at).toBeLessThan(atDayMinute(0, 20 * 60));
  for (const p of people) {
    const rel = state.relationships[`${p.id}>${neighbour.id}`];
    expect(rel?.familiarity ?? 0, `${p.firstName} knows ${neighbour.firstName}`).toBeGreaterThan(0);
  }
  expect(rec.finished.some((f) => f.personId === neighbour.id && f.interactionId === 'leaveLot' && f.result === 'done')).toBe(true);

  // Work shifts are attended and paid exactly once per shift.
  const hh = state.households[state.activeHouseholdId]!;
  for (const p of people.filter((x) => x.career)) {
    const level = db.careers[p.career!.careerId]!.levels[0]!;
    const shiftDays = [0, 1, 2].filter((d) => level.days.includes(d % 7));
    const left = rec.careers.filter((c) => c.personId === p.id && c.what === 'leftForWork');
    const paid = rec.careers.filter((c) => c.personId === p.id && c.what === 'paid');
    const missed = rec.careers.filter((c) => c.personId === p.id && c.what === 'missed');
    expect(missed, `${p.firstName} missed no shift`).toHaveLength(0);
    expect(left).toHaveLength(shiftDays.length);
    expect(paid).toHaveLength(shiftDays.length);
    const wages = hh.ledger.filter((l) => l.kind === 'wage' && l.label.includes(p.firstName));
    expect(wages.map((w) => w.occurrence)).toEqual(shiftDays.map((d) => `pay:${p.id}:${d}`));
    expect(new Set(wages.map((w) => w.occurrence)).size).toBe(wages.length);
    for (const [i, w] of wages.entries()) {
      expect(w.amount).toBe(paid[i]!.amount);
      expect(w.amount).toBeGreaterThan(0);
      expect(w.amount).toBeLessThanOrEqual(Math.round((level.hourlyWage * (level.end - level.start)) / 60));
      expect(state.processed[`money:${w.occurrence}`]).toBeDefined();
    }
    expect(p.career!.daysWorked).toBe(shiftDays.length);
  }

  // Money: every ledger entry is integer cents and the balance adds up from the start entry.
  expect(hh.ledger[0]!.kind).toBe('start');
  expect(hh.ledger.reduce((s, l) => s + l.amount, 0)).toBe(hh.funds);
  for (const l of hh.ledger) expect(Number.isInteger(l.amount)).toBe(true);

  // Feed entries are readable sentences.
  expect(state.feed.length).toBeGreaterThan(5);
  for (const f of state.feed) {
    expect(f.text.length, f.text).toBeGreaterThan(5);
    expect(f.text.length, f.text).toBeLessThan(200);
    expect(f.text, f.text).not.toMatch(/undefined|NaN|null|\[object|\{|\}|\$-/);
    expect(f.text, f.text).toMatch(/^["A-Z]/);
  }
}

describe('three days at full autonomy in the starter house', () => {
  it('Guided Start single (Lindqvist)', () => {
    const r = playtest(0, 101);
    expect(members(r.state)).toHaveLength(1);
    // Social is exempt here: a single person has no autonomous social outlet after the first visit
    // (sim bug, documented by the it.fails test in bugs.test.ts).
    checkHousehold('guided', r, ['social']);
  }, 120_000);

  it('roommates (Brennan & Okafor)', () => {
    const r = playtest(1, 202);
    expect(members(r.state)).toHaveLength(2);
    checkHousehold('roommates', r);
    // The roommates talk to each other.
    const [a, b] = members(r.state);
    expect(r.rec.socials.some((s) => s.accepted && ((s.actorId === a!.id && s.targetId === b!.id) || (s.actorId === b!.id && s.targetId === a!.id)))).toBe(true);
  }, 120_000);
});
