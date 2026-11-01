// Household bills (Milestone 6): weekly property tax and utilities, a due date, a late fee, a utility cut-off
// after the grace period, payment that restores power, auto-pay and save/load safety. All money moves through
// transact with an occurrence, so every step is applied once.

import { describe, expect, it } from 'vitest';
import { atDayMinute } from '../../../src/core/clock';
import { cloneState } from '../../../src/core/state';
import type { Household } from '../../../src/core/types';
import {
  BILL_LATE_FEE_MIN, BILL_PROPERTY_TAX_MIN, BILL_UTILITIES_BASE, BILL_UTILITY_APPLIANCE,
  BILL_UTILITY_ELECTRONICS, amountOwed, billBreakdown, billDueSoon, billWeek, homeLotValue, householdBills,
  nextBillDeadline, openBills, payBill, powerIsOff, setAutoPay, updateBills,
} from '../../../src/sim/economy';
import { buildWorld, harness, pureCtx, runTicks } from './fixtures';
import type { FixtureWorld, Harness } from './fixtures';

const DAY = 1440;

function economyWorld(): { w: FixtureWorld; h: Harness } {
  const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
  return { w, h: harness(w.state) };
}

const hh = (h: Harness): Household => Object.values(h.holder.state.households).find((x) => x.isPlayable)!;
const ledger = (h: Harness) => hh(h).ledger;

/** Advances the wall clock and runs one bill update at that minute. */
function at(h: Harness, minute: number) {
  h.holder.state.clock.minutes = minute;
  updateBills(pureCtx(h));
}

describe('household bills', () => {
  it('issues one weekly bill on the first tick and charges property tax plus utilities', () => {
    const { h } = economyWorld();
    h.content.objects['fridge-standard']!.tags.push('appliance');
    h.content.objects['tv-flatscreen']!.tags.push('electronics');
    runTicks(h, 1);
    const bills = householdBills(h.holder.state, hh(h).id);
    expect(bills).toHaveLength(1);
    const bill = bills[0]!;
    expect(bill).toMatchObject({ week: 0, status: 'due', lateFee: 0, amount: bill.base });
    expect(h.holder.state.processed[`bill:${hh(h).id}:0`]).toBeDefined();
    const bd = billBreakdown(h.holder.state, h.content, hh(h).id);
    expect(bd).toMatchObject({ electronics: 1, appliances: 1 });
    expect(bd.utilities).toBe(BILL_UTILITIES_BASE + BILL_UTILITY_ELECTRONICS + BILL_UTILITY_APPLIANCE);
    expect(bd.propertyTax).toBe(Math.max(BILL_PROPERTY_TAX_MIN, Math.round(homeLotValue(h.holder.state, hh(h).id) * 0.0025)));
    expect(bill.base).toBe(bd.propertyTax + bd.utilities);
    expect(bill.dueAt).toBe(bill.issuedAt + 3 * DAY);
    expect(bill.graceEndsAt).toBe(bill.issuedAt + 5 * DAY);
    expect(nextBillDeadline(bill)).toBe(bill.dueAt);
    expect(billDueSoon(bill, bill.dueAt - 2, 5)).toBe(true);
    expect(billDueSoon(bill, bill.dueAt)).toBe(false);
    // A second update in the same week does not duplicate the bill.
    at(h, h.holder.state.clock.minutes + 600);
    expect(householdBills(h.holder.state, hh(h).id)).toHaveLength(1);
    expect(ledger(h)).toHaveLength(0);
  });

  it('property tax grows with the home value instead of only using the minimum', () => {
    const { w, h } = economyWorld();
    w.lot.landValue = 8_000_000;
    runTicks(h, 1);
    const bd = billBreakdown(h.holder.state, h.content, hh(h).id);
    expect(bd.propertyTax).toBe(Math.round(homeLotValue(h.holder.state, hh(h).id) * 0.0025));
    expect(bd.propertyTax).toBe(20_400);
    expect(bd.propertyTax).toBeGreaterThan(BILL_PROPERTY_TAX_MIN);
    expect(householdBills(h.holder.state, hh(h).id)[0]!.amount).toBe(bd.base);
  });

  it('adds one late fee after the due date and cuts the utilities off after the grace period', () => {
    const { w, h } = economyWorld();
    h.content.objects['computer-desktop']!.tags = ['electronics'];
    runTicks(h, 1);
    const bill = openBills(h.holder.state, hh(h).id)[0]!;
    const base = bill.base;
    at(h, bill.dueAt);
    expect(bill.status).toBe('overdue');
    expect(bill.lateFee).toBe(Math.max(BILL_LATE_FEE_MIN, Math.round(base * 0.1)));
    expect(bill.amount).toBe(base + bill.lateFee);
    expect(nextBillDeadline(bill)).toBe(bill.graceEndsAt);
    // Running the same deadline again does not add a second late fee.
    at(h, bill.dueAt + 60);
    expect(bill.lateFee).toBe(Math.max(BILL_LATE_FEE_MIN, Math.round(base * 0.1)));
    expect(bill.amount).toBe(base + bill.lateFee);
    expect(powerIsOff(h.holder.state, hh(h).id)).toBe(false);
    at(h, bill.graceEndsAt);
    expect(bill.status).toBe('cutoff');
    expect(bill.cutOffAt).toBe(bill.graceEndsAt);
    expect(powerIsOff(h.holder.state, hh(h).id)).toBe(true);
    expect(amountOwed(h.holder.state, hh(h).id)).toBe(bill.amount);
    // Electronics and appliances now refuse to run with a readable reason.
    const computer = h.sim.options(w.mira, { kind: 'object', objectId: w.objects.computer!.id, slotId: null })
      .find((o) => o.interactionId === 'playComputerGames')!;
    expect(computer).toMatchObject({ enabled: false, reason: 'Power is off' });
    // Repairing the stale flag does not invent bills or hide a cut-off.
    updateBills(pureCtx(h));
    expect(powerIsOff(h.holder.state, hh(h).id)).toBe(true);
  });

  it('pays a bill once, restores power, and refuses a second payment', () => {
    const { h } = economyWorld();
    runTicks(h, 1);
    const bill = openBills(h.holder.state, hh(h).id)[0]!;
    at(h, bill.graceEndsAt);
    expect(powerIsOff(h.holder.state, hh(h).id)).toBe(true);
    const before = hh(h).funds;
    const r = payBill(pureCtx(h), hh(h).id, bill.id);
    expect(r).toEqual({ ok: true, amount: bill.amount });
    expect(hh(h).funds).toBe(before - bill.amount);
    expect(bill.status).toBe('paid');
    expect(bill.paidAt).toBe(bill.graceEndsAt);
    expect(powerIsOff(h.holder.state, hh(h).id)).toBe(false);
    const payment = ledger(h).filter((l) => l.kind === 'bill');
    expect(payment).toHaveLength(1);
    expect(payment[0]).toMatchObject({ amount: -bill.amount, occurrence: `billpay:${bill.id}` });
    expect(h.holder.state.processed[`money:billpay:${bill.id}`]).toBeDefined();
    const funds = hh(h).funds;
    expect(payBill(pureCtx(h), hh(h).id, bill.id)).toMatchObject({ ok: false, reason: 'That bill is already paid.' });
    expect(hh(h).funds).toBe(funds);
    expect(ledger(h).filter((l) => l.kind === 'bill')).toHaveLength(1);
    // Power stays on after another update and nothing is owed for the paid bill.
    updateBills(pureCtx(h));
    expect(powerIsOff(h.holder.state, hh(h).id)).toBe(false);
    expect(amountOwed(h.holder.state, hh(h).id)).toBe(0);
  });

  it('will not pay a bill the household cannot afford', () => {
    const { w, h } = economyWorld();
    w.state.households[hh(h).id]!.funds = 100;
    runTicks(h, 1);
    const bill = openBills(h.holder.state, hh(h).id)[0]!;
    expect(payBill(pureCtx(h), hh(h).id, bill.id)).toMatchObject({ ok: false });
    expect(bill.status).toBe('due');
    expect(ledger(h)).toHaveLength(0);
    expect(hh(h).funds).toBe(100);
  });

  it('auto-pay pays each bill as it is issued and keeps the balance exact', () => {
    const { h } = economyWorld();
    const household = hh(h);
    setAutoPay(h.holder.state, true);
    runTicks(h, 1);
    const first = householdBills(h.holder.state, household.id)[0]!;
    expect(first.status).toBe('paid');
    expect(household.funds).toBe(500000 - first.amount);
    expect(ledger(h).filter((l) => l.kind === 'bill')).toHaveLength(1);
    // Week 1 is issued and paid as well; no late fee is ever added.
    at(h, atDayMinute(7, 8 * 60));
    const bills = householdBills(h.holder.state, household.id);
    expect(bills).toHaveLength(2);
    expect(bills.every((b) => b.status === 'paid' && b.lateFee === 0)).toBe(true);
    expect(ledger(h).filter((l) => l.kind === 'bill')).toHaveLength(2);
    expect(household.funds).toBe(500000 - bills.reduce((s, b) => s + b.amount, 0));
    setAutoPay(h.holder.state, false);
    at(h, atDayMinute(14, 8 * 60));
    expect(householdBills(h.holder.state, household.id)).toHaveLength(3);
    expect(householdBills(h.holder.state, household.id)[2]!.status).toBe('due');
  });

  it('survives save/load at every step without repeating money', () => {
    const { h } = economyWorld();
    runTicks(h, 1);
    const bill = openBills(h.holder.state, hh(h).id)[0]!;
    // Save just before the due date, load, and cross it once.
    at(h, bill.dueAt - 60);
    const loaded = harness(cloneState(h.holder.state), h.content);
    at(loaded, bill.dueAt);
    const reloaded = harness(cloneState(loaded.holder.state), h.content);
    at(reloaded, bill.dueAt + 120);
    const copy = openBills(reloaded.holder.state, hh(reloaded).id)[0]!;
    expect(copy.lateFee).toBe(Math.max(BILL_LATE_FEE_MIN, Math.round(copy.base * 0.1)));
    expect(copy.amount).toBe(copy.base + copy.lateFee);
    // Pay in one copy, save, then pay again in a stale copy of the paid state.
    expect(payBill(pureCtx(reloaded), hh(reloaded).id, copy.id)).toMatchObject({ ok: true });
    const paidState = cloneState(reloaded.holder.state);
    const paid = harness(paidState, h.content);
    const funds = hh(paid).funds;
    expect(payBill(pureCtx(paid), hh(paid).id, copy.id)).toMatchObject({ ok: false });
    // A stale save whose status lags behind the transaction still cannot charge twice.
    const stale = cloneState(paidState);
    const staleBill = (stale.bills ?? []).find((b) => b.id === copy.id)!;
    staleBill.status = 'overdue';
    staleBill.paidAt = undefined;
    const staleH = harness(stale, h.content);
    const staleFunds = hh(staleH).funds;
    // The transaction is already in the processed map, so the stale save charges nothing even though its
    // bill status still says overdue.
    expect(payBill(pureCtx(staleH), hh(staleH).id, copy.id)).toMatchObject({ ok: true });
    expect(hh(staleH).funds).toBe(staleFunds);
    expect(ledger(staleH).filter((l) => l.kind === 'bill')).toHaveLength(1);
    expect(ledger(paid)).toHaveLength(1);
    expect(hh(paid).funds).toBe(funds);
  });

  it('bill weeks start at zero and advance every seven days', () => {
    expect(billWeek(atDayMinute(0, 8 * 60))).toBe(0);
    expect(billWeek(atDayMinute(6, 23 * 60))).toBe(0);
    expect(billWeek(atDayMinute(7, 8 * 60))).toBe(1);
    expect(billWeek(atDayMinute(14, 8 * 60))).toBe(2);
  });

  it('uses at most sixteen remembered bills per world', () => {
    const { h } = economyWorld();
    for (let week = 0; week < 20; week++) at(h, atDayMinute(week * 7, 8 * 60));
    expect((h.holder.state.bills ?? []).length).toBeLessThanOrEqual(16);
  });
});
