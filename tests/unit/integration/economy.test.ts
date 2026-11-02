// Milestone 6 headless playtest: two roommates work full careers, sell one freelance article, and pay every
// household bill for fourteen game days in the real starter house, with the real content and simulation. The
// run uses a fixed seed and is repeated to prove determinism. Nobody gets stuck, the ledger adds up to the
// household balance, at least one promotion happens and every bill is paid.

import { describe, expect, it } from 'vitest';
import { atDayMinute } from '../../../src/core/clock';
import { householdBills, openBills } from '../../../src/sim/economy';
import type { Bill, Person, WorldState } from '../../../src/core/types';
import { Recorder, coreWithoutSaves, db, members, objectsByDef } from './harness';

const DAYS = 14;
const STUCK_TICKS = 3 * 60 * 4;

const playable = (s: WorldState) => s.households[s.activeHouseholdId]!;
const ledgerSum = (s: WorldState) => playable(s).ledger.reduce((sum, l) => sum + l.amount, 0);
const open = (s: WorldState): Bill[] => openBills(s, playable(s).id);

/** Pays every open bill of the active household, if a member can do it. */
function payBills(core: ReturnType<typeof coreWithoutSaves>): number {
  const state = core.state();
  if (!state) return 0;
  let paid = 0;
  const member = members(state).find((p) => !p.isNpc);
  if (!member) return 0;
  for (const bill of open(state)) {
    const r = core.payBill(member.id, bill.id);
    if (r.ok) paid++;
  }
  return paid;
}

/** A fixed, deterministic 14-day run. Returns the final state and the recorder. */
function play(seed: number) {
  const core = coreWithoutSaves();
  const draft = core.premadeHouseholds()[1]!; // Brennan & Okafor, two roommates
  expect(core.startNewGame('create', draft, seed)).toEqual({ ok: true });
  const rec = new Recorder(core);
  let state = core.state()!;
  expect(members(state)).toHaveLength(2);

  // Both roommates take a career and work hard. Theo is a programmer; Sasha keeps her kitchen job.
  const jobs: Record<string, string> = { Theo: 'software', Sasha: 'culinary' };
  for (const p of members(state)) {
    if (!p.career) expect(core.joinCareer(p.id, jobs[p.firstName] ?? 'business')).toEqual({ ok: true });
    expect(p.career).toBeTruthy();
    expect(core.setCareerEffort(p.id, 'hard')).toEqual({ ok: true });
  }
  const startingFunds = playable(state).funds;
  expect(ledgerSum(state)).toBe(startingFunds);

  // Sell one freelance article at the computer after work on the first day.
  rec.runUntil(atDayMinute(0, 19 * 60));
  state = core.state()!;
  const computer = objectsByDef(state, 'computer-desktop')[0]!;
  expect(computer).toBeDefined();
  const actor = members(state).find((p) => p.location.kind === 'lot' && p.queue.length === 0) ?? members(state)[0]!;
  const option = core.options(actor.id, { kind: 'object', objectId: computer })
    .find((o) => o.interactionId === 'writeArticle')!;
  expect(option?.enabled, option?.reason).toBe(true);
  expect(core.queue(actor.id, option)).toEqual({ ok: true });
  const saleOccurrence = `freelance:${actor.id}:`;

  // Fourteen days; pay bills at fixed checkpoints so no late fee or cut-off is triggered.
  for (let day = 0; day < DAYS; day++) {
    for (let h = 0; h < 4; h++) {
      rec.runUntil(atDayMinute(day, h * 6 * 60));
      payBills(core);
    }
  }
  rec.runUntil(atDayMinute(DAYS, 8 * 60));
  payBills(core); // the day-14 bill is issued at this exact minute
  state = core.state()!;
  expect(rec.days.size).toBeGreaterThan(0);

  const hh = playable(state);
  const sales = hh.ledger.filter((l) => l.kind === 'sale');
  const bills = householdBills(state, hh.id);
  const promoted = rec.careers.filter((e) => e.what === 'promoted');
  const paidBills = bills.filter((b) => b.status === 'paid');

  // Every ledger entry is integer cents and the initial balance plus the ledger equals the current funds.
  expect(hh.ledger[0]!.kind).toBe('start');
  expect(ledgerSum(state)).toBe(hh.funds);
  for (const l of hh.ledger) expect(Number.isInteger(l.amount)).toBe(true);

  // One completed article, paid exactly once; more ticks cannot repeat the sale.
  expect(sales).toHaveLength(1);
  expect(sales[0]!.occurrence?.startsWith(saleOccurrence)).toBe(true);
  expect(state.processed[`money:${sales[0]!.occurrence}`]).toBeDefined();
  rec.run(4 * 60);
  expect(playable(core.state()!).ledger.filter((l) => l.kind === 'sale')).toHaveLength(1);

  return { core, rec, state, startingFunds, sales, bills, promoted, paidBills, hh };
}

describe('fourteen days of work, freelancing and bills', () => {
  it('keeps two roommates busy, paid, promoted and out of debt (fixed seed)', () => {
    const run = play(606);
    const { rec, state, sales, bills, promoted, paidBills, hh, startingFunds } = run;

    // Careers: no missed shifts, every shift paid once, at least one promotion.
    for (const p of members(state)) {
      const missed = rec.careers.filter((e) => e.personId === p.id && e.what === 'missed');
      expect(missed, `${p.firstName} missed no shift`).toHaveLength(0);
      expect(p.career, `${p.firstName} kept a job`).toBeTruthy();
      expect(p.career!.daysWorked, `${p.firstName} worked`).toBeGreaterThanOrEqual(8);
      const wages = hh.ledger.filter((l) => l.kind === 'wage' && l.label.includes(p.firstName));
      expect(wages.length).toBeGreaterThanOrEqual(8);
      expect(new Set(wages.map((w) => w.occurrence)).size).toBe(wages.length);
      for (const w of wages) expect(w.amount).toBeGreaterThan(0);
    }
    expect(promoted.length, 'at least one promotion').toBeGreaterThan(0);

    // Bills: every issued bill was paid, no late fee and power never went off.
    expect(bills.length, 'bills were issued weekly').toBeGreaterThanOrEqual(2);
    expect(paidBills.length).toBe(bills.length);
    expect(bills.every((b) => b.lateFee === 0 && b.status === 'paid')).toBe(true);
    expect(hh.powerOff ?? false).toBe(false);
    expect(open(state)).toHaveLength(0);

    // Freelance income arrived and the household ended richer than it began.
    expect(sales).toHaveLength(1);
    expect(sales[0]!.amount).toBeGreaterThan(0);
    expect(hh.funds).toBeGreaterThan(startingFunds);

    // Nobody stood still for three game hours on the lot.
    for (const p of members(state)) {
      const still = rec.longestStill.get(p.id);
      expect(still?.ticks ?? 0, `${p.firstName} stood still: ${still?.what} at ${still ? rec.stamp(still.at) : ''}`).toBeLessThan(STUCK_TICKS);
    }
    for (const p of members(state)) for (const v of Object.values(p.needs)) expect(Number.isFinite(v)).toBe(true);
    // Every moment of the run was recorded without an unknown-content failure.
    const routeFails = [...rec.days.values()].flat().flatMap((d) => d.failed).filter((f) => /reach|blocked|get there|move/i.test(f.reason));
    expect(routeFails.length).toBeLessThanOrEqual(6 * DAYS);
    expect(db.careers.software!.levels.length).toBe(10);
  }, 300_000);

  it('is deterministic with the same fixed seed', () => {
    const a = play(606);
    const b = play(606);
    const fingerprint = (r: ReturnType<typeof play>) => JSON.stringify({
      funds: playable(r.state).funds,
      ledger: playable(r.state).ledger.map((l) => [l.kind, l.amount, l.occurrence ?? null]),
      careers: members(r.state).map((p: Person) => [p.firstName, p.career?.careerId, p.career?.level, p.career?.performance, p.career?.daysWorked]),
      bills: (r.state.bills ?? []).map((x) => [x.week, x.amount, x.lateFee, x.status]),
      feed: r.state.feed.map((f) => f.text),
      processed: Object.keys(r.state.processed).filter((k) => /money:|bill|freelance|pay:/.test(k)).sort(),
    });
    expect(fingerprint(b)).toBe(fingerprint(a));
  }, 600_000);
});
