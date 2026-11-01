// Headless playtests of the daily-life systems: households of 1, 2 and 4 people live seven game days at full
// autonomy in the real starter house with the real content. Nobody gets stuck, needs are looked after, dishes
// are washed, grime is cleaned, broken things are repaired or reported, chores do not loop and money stays exact.
// Run `npx vitest run tests/unit/integration/dailylife.test.ts --reporter=default --silent=false` for the day summaries.

import { describe, expect, it } from 'vitest';
import { atDayMinute, MINUTES_PER_DAY } from '../../../src/core/clock';
import type { HouseholdDraft } from '../../../src/core/drafts';
import { cloneState } from '../../../src/core/state';
import { NEED_IDS } from '../../../src/core/types';
import type { Id, WorldState } from '../../../src/core/types';
import type { GameCore } from '../../../src/game/GameCore';
import { Recorder, coreWithoutSaves, db, members } from './harness';

const DAYS = 7;
const STUCK_TICKS = 3 * 60 * 4; // three game hours
const CHORES = ['cleanObject', 'washDishes', 'mopFloor', 'tidyUp', 'repairObject', 'serviceObject', 'callRepairperson'];

/** Households of 1 (Guided Start), 2 (roommates) and 4 (roommates + couple) people. */
function household(core: GameCore, n: 1 | 2 | 4): HouseholdDraft {
  const p = core.premadeHouseholds();
  if (n === 1) return p[0]!;
  if (n === 2) return p[1]!;
  return {
    name: 'Four', members: [...p[1]!.members, ...p[2]!.members],
    ties: [{ a: 0, b: 1, tie: 'roommate' }, { a: 2, b: 3, tie: 'spouse' }, { a: 0, b: 2, tie: 'roommate' }, { a: 0, b: 3, tie: 'roommate' }, { a: 1, b: 2, tie: 'roommate' }, { a: 1, b: 3, tie: 'roommate' }],
  };
}

interface Chore { at: number; personId: Id; interactionId: string; target: string }

function play(n: 1 | 2 | 4, seed: number, opts: { reloadAtDay?: number } = {}) {
  const core = coreWithoutSaves();
  expect(core.startNewGame(n === 1 ? 'guided' : 'create', household(core, n), seed)).toEqual({ ok: true });
  // Seven days of full autonomy would run past the unpaid-bill grace period (Milestone 6): the power would be cut
  // and the fridge and stove become unusable, so the household could not eat. These playtests are about daily life,
  // not about bill pressure (tests/unit/sim/economy.test.ts covers cut-offs), so the household auto-pays.
  core.setSimSettings({ autoPayBills: true });
  const rec = new Recorder(core);
  const chores: Chore[] = [];
  const failed: Array<{ personId: Id; interactionId: string; reason: string; target: string; at: number }> = [];
  const targets = new Map<Id, string>();
  core.events.onAny((e) => {
    const s = core.state()!;
    if (e.type === 'action.started') {
      const a = s.people[e.personId]?.queue.find((x) => x.id === e.actionId);
      if (a) targets.set(a.id, a.target.kind === 'object' ? a.target.objectId : a.target.kind === 'item' ? a.target.itemId : 'self');
    } else if (e.type === 'action.finished' && CHORES.includes(e.interactionId)) {
      const target = targets.get(e.actionId) ?? '?';
      if (e.result === 'done') chores.push({ at: s.clock.minutes, personId: e.personId, interactionId: e.interactionId, target });
      else if (e.result === 'failed') failed.push({ personId: e.personId, interactionId: e.interactionId, reason: e.reason ?? '', target, at: s.clock.minutes });
    }
  });
  const end = atDayMinute(DAYS, 8 * 60); // day 0 08:00 -> day 7 08:00
  if (opts.reloadAtDay !== undefined) {
    rec.runUntil(atDayMinute(opts.reloadAtDay, 12 * 60));
    core.replaceState(cloneState(core.state()!));
  }
  rec.runUntil(end);
  return { core, rec, state: core.state()!, chores, failed };
}

type Run = ReturnType<typeof play>;

function check(name: string, r: Run, n: 1 | 2 | 4, exemptNeeds: readonly string[] = []) {
  const { rec, state, chores, failed } = r;
  const people = members(state);
  expect(people).toHaveLength(n);
  for (const line of rec.summary()) console.log(`[${name}] ${line}`);
  const hh = state.households[state.activeHouseholdId]!;
  const lot = state.lots[state.activeLotId]!;

  for (const p of people) {
    const days = rec.days.get(p.id)!.slice(0, DAYS);
    // Nobody stuck, no route-failure loops.
    const still = rec.longestStill.get(p.id);
    expect(still?.ticks ?? 0, `${p.firstName} stood still: ${still?.what} until ${still ? rec.stamp(still.at) : ''}`).toBeLessThan(STUCK_TICKS);
    expect(rec.failureRuns.get(p.id) ?? 0, `${p.firstName} repeated route failures`).toBeLessThanOrEqual(2);
    // Needs maintained (below 15 for less than a tenth of the time).
    const onLot = days.reduce((s, d) => s + d.onLotTicks, 0);
    for (const need of NEED_IDS) {
      if (exemptNeeds.includes(need)) continue;
      const low = days.reduce((s, d) => s + d.lowTicks[need], 0);
      expect(low / onLot, `${p.firstName} ${need} below 15 for ${low} of ${onLot} ticks`).toBeLessThan(0.1);
    }
    for (const [i, d] of days.entries()) expect((d.done.eatMeal ?? 0) + (d.done.grabSnack ?? 0), `${p.firstName} ate on day ${i + 1}`).toBeGreaterThan(0);
    for (const v of Object.values(p.needs)) expect(Number.isFinite(v)).toBe(true);
    // Chores do not loop: no chore failing over and over, and a modest number of chores a day.
    const mine = failed.filter((f) => f.personId === p.id);
    expect(mine.length, `${p.firstName} failed chores: ${JSON.stringify(mine.slice(0, 5))}`).toBeLessThanOrEqual(2 * DAYS);
    const choresMine = chores.filter((c) => c.personId === p.id);
    expect(choresMine.length, `${p.firstName} did ${choresMine.length} chores`).toBeLessThan(14 * DAYS);
  }
  // The same thing is not cleaned twice within half an hour, and repairs of one breakdown stay within the pity limit.
  for (const kind of ['cleanObject', 'washDishes', 'mopFloor']) {
    const byTarget = new Map<string, number>();
    for (const c of chores.filter((x) => x.interactionId === kind)) {
      const last = byTarget.get(c.target);
      if (last !== undefined) expect(c.at - last, `${kind} on ${c.target} repeated after ${c.at - last} min`).toBeGreaterThanOrEqual(15);
      byTarget.set(c.target, c.at);
    }
  }
  const repairs = chores.filter((c) => c.interactionId === 'repairObject').length;
  const breakdowns = state.feed.filter((f) => /broke down|scorched/.test(f.text)).length;
  expect(repairs, 'repair attempts').toBeLessThanOrEqual(7 * Math.max(1, breakdowns) + 2);

  // Dishes get washed: nothing waits longer than 18 hours, and no pile at the end.
  const dishes = Object.values(state.items).filter((i) => i.kind === 'dishes');
  for (const d of dishes) expect(state.clock.minutes - d.createdAt, 'dishes waited').toBeLessThan(18 * 60);
  expect(dishes.reduce((s, d) => s + d.portions, 0)).toBeLessThanOrEqual(2 * n + 2);
  expect(chores.filter((c) => c.interactionId === 'washDishes').length, 'dishes washed').toBeGreaterThanOrEqual(DAYS);
  // Floor messes do not pile up either.
  expect(Object.values(state.items).filter((i) => i.kind === 'mess').length).toBeLessThanOrEqual(3);
  // Grime stays under control and every broken thing is either repaired soon or was reported.
  for (const o of Object.values(lot.objects)) {
    expect(o.condition.dirt, `${o.defId} dirt`).toBeLessThanOrEqual(1);
    expect(o.condition.dirt, `${o.defId} dirt after a week`).toBeLessThan(0.9);
    if (o.condition.broken) {
      expect(state.clock.minutes - (o.condition.brokenAt ?? state.clock.minutes), `${o.defId} stayed broken`).toBeLessThan(MINUTES_PER_DAY);
      expect(state.feed.some((f) => f.kind === 'warning' && f.text.includes('broke down')) || state.feed.length === 60, `${o.defId} broke without a report`).toBe(true);
    }
  }
  // Something was cleaned.
  expect(chores.filter((c) => c.interactionId === 'cleanObject' || c.interactionId === 'tidyUp').length, 'cleaning happened').toBeGreaterThan(0);

  // Money is exact: integer cents, one ledger entry per occurrence, the balance adds up from the start entry.
  expect(hh.ledger[0]!.kind).toBe('start');
  expect(hh.ledger.reduce((s, l) => s + l.amount, 0)).toBe(hh.funds);
  const occ = hh.ledger.map((l) => l.occurrence).filter((o): o is string => !!o);
  expect(new Set(occ).size).toBe(occ.length);
  for (const l of hh.ledger) {
    expect(Number.isInteger(l.amount)).toBe(true);
    if (l.kind === 'repair') { expect(l.amount).toBeLessThan(0); expect(l.amount).toBeGreaterThanOrEqual(-8500); expect(state.processed[`money:${l.occurrence}`]).toBeDefined(); }
  }
  const calls = chores.filter((c) => c.interactionId === 'callRepairperson').length;
  expect(hh.ledger.filter((l) => l.kind === 'repair')).toHaveLength(calls);
  expect(hh.funds).toBeGreaterThanOrEqual(0);
  expect(state.schedule.filter((e) => e.kind === 'custom').every((e) => e.at > state.clock.minutes)).toBe(true);

  // Feed entries are readable sentences.
  for (const f of state.feed) {
    expect(f.text, f.text).not.toMatch(/undefined|NaN|null|\[object|\{|\}|\$-/);
    expect(f.text, f.text).toMatch(/^["A-Z]/);
  }
}

/** Extra seeds for soak runs: DL_SEEDS=1,2,3 npx vitest run tests/unit/integration/dailylife.test.ts */
const SEEDS = (process.env.DL_SEEDS ?? '101,202,303').split(',').map(Number);

describe('seven days of daily life at full autonomy', () => {
  for (const seed of SEEDS) {
    it(`one person (Guided Start), seed ${seed}`, () => {
      const r = play(1, seed);
      check(`1p/${seed}`, r, 1, ['social']); // a single person has no autonomous social outlet (see bugs.test.ts)
    }, 120_000);
    it(`two roommates, seed ${seed}`, () => {
      const r = play(2, seed);
      check(`2p/${seed}`, r, 2);
    }, 120_000);
    it(`four people sharing the starter house, seed ${seed}`, () => {
      const r = play(4, seed);
      check(`4p/${seed}`, r, 4);
    }, 120_000);
  }

  it('is deterministic, also across a save and load in the middle of the week', () => {
    const run = (reload?: number) => {
      const r = play(2, 404, reload === undefined ? {} : { reloadAtDay: reload });
      const s: WorldState = cloneState(r.state);
      delete s.settings.speed;
      return JSON.stringify(s);
    };
    const a = run();
    expect(run()).toBe(a);
    expect(run(3)).toBe(a);
  }, 180_000);

  it('the daily-life content has what the game needs: chores, moods, repairable and cleanable objects', () => {
    const tags = (t: string) => Object.values(db.objects).filter((o) => o.functional && o.tags.includes(t));
    expect(tags('cleanable').length).toBeGreaterThan(10);
    expect(tags('plumbing').length).toBeGreaterThanOrEqual(7);
    expect(tags('electronics').length).toBeGreaterThanOrEqual(5);
    expect(tags('appliance').length).toBeGreaterThanOrEqual(5);
    expect(tags('sink').length).toBeGreaterThanOrEqual(3);
  });
});
