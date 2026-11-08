// Household economy (Milestone 6): weekly bills, late fees and utility cut-offs.
//
// A bill is issued once per household per week (occurrence `bill:<householdId>:<week>`). It covers property tax
// (a small percentage of the home's value, or the weekly rent of a rented home) plus utilities that grow with the number of electronics and
// appliances on the home lot. Payment is a normal `transact` with occurrence `billpay:<billId>`, so it can never
// be applied twice. Late fees and cut-offs carry their own occurrence markers (`billlate:<id>`, `billcut:<id>`),
// and power is derived from the unpaid bills of the household, so save/load cannot lose or repeat a step.

import { START_MINUTE, TICK_MINUTES } from '../core/clock';
import { newId } from '../core/ids';
import { addFeed, isProcessed, markProcessed, transact } from '../core/state';
import type { Bill, Cents, Household, Id, WorldState } from '../core/types';
import type { ContentDB, ObjectDef } from '../content/types';
import type { SimCtx } from './context';

export const BILL_INTERVAL_DAYS = 7;
export const BILL_DUE_DAYS = 3;
export const BILL_GRACE_DAYS = 2;
export const BILL_LATE_FEE_RATE = 0.1;
export const BILL_LATE_FEE_MIN: Cents = 500;
export const BILL_PROPERTY_TAX_RATE = 0.0025;
export const BILL_PROPERTY_TAX_MIN: Cents = 4500;
export const BILL_UTILITIES_BASE: Cents = 2200;
export const BILL_UTILITY_ELECTRONICS: Cents = 500;
export const BILL_UTILITY_APPLIANCE: Cents = 900;
export const BILL_LIMIT = 16;
/** Weekly pension of an elder without a job (balance audit, docs/BALANCE.md: retired elders had no income at all). */
export const ELDER_PENSION: Cents = 30000;

const DAY_MINUTES = 1440;

/** Objects that stop working when the power is cut off. */
export function needsPower(def: ObjectDef): boolean {
  return def.tags.includes('electronics') || def.tags.includes('appliance');
}

/** Power state of a household (false when a bill was cut off and is still unpaid). */
export function powerIsOff(state: WorldState, householdId: Id): boolean {
  return state.households[householdId]?.powerOff === true;
}

/** Value of the household's home: land plus placed objects and openings at purchase price. */
export function homeLotValue(state: WorldState, householdId: Id): Cents {
  const lotId = state.households[householdId]?.homeLotId;
  const lot = lotId ? state.lots[lotId] : undefined;
  if (!lot) return 0;
  let v = lot.landValue;
  for (const obj of Object.values(lot.objects)) v += obj.purchasePrice;
  for (const op of Object.values(lot.openings)) v += op.purchasePrice;
  return v;
}

export interface BillBreakdown {
  /** Property tax of an owned home (0 for a rental). */
  propertyTax: Cents;
  /** Weekly rent of a rental home (Milestone 7; 0 for an owned home). It replaces the property tax. */
  rent: Cents;
  utilities: Cents;
  electronics: number;
  appliances: number;
  base: Cents;
}

/** What the next bill will cost, with the counts that make up the utilities (pure). */
export function billBreakdown(state: WorldState, content: ContentDB, householdId: Id): BillBreakdown {
  const lotId = state.households[householdId]?.homeLotId;
  const lot = lotId ? state.lots[lotId] : undefined;
  const rented = !!lot && lot.rent !== undefined && lot.ownerHouseholdId !== householdId;
  let electronics = 0, appliances = 0;
  if (lot) {
    for (const obj of Object.values(lot.objects)) {
      if (obj.ownerHouseholdId !== householdId && !(rented && obj.ownerHouseholdId === null)) continue;
      const def = content.objects[obj.defId];
      if (!def) continue;
      if (def.tags.includes('electronics')) electronics++;
      if (def.tags.includes('appliance')) appliances++;
    }
  }
  const propertyTax = rented ? 0 : Math.max(BILL_PROPERTY_TAX_MIN, Math.round(homeLotValue(state, householdId) * BILL_PROPERTY_TAX_RATE));
  const rent = rented ? lot!.rent! : 0;
  const utilities = BILL_UTILITIES_BASE + electronics * BILL_UTILITY_ELECTRONICS + appliances * BILL_UTILITY_APPLIANCE;
  return { propertyTax, rent, utilities, electronics, appliances, base: propertyTax + rent + utilities };
}

/** Week index since the world started (the first week is 0). */
export function billWeek(now: number): number {
  return Math.max(0, Math.floor((now - START_MINUTE) / (BILL_INTERVAL_DAYS * DAY_MINUTES)));
}

/** Bills of one household, oldest first. */
export function householdBills(state: WorldState, householdId: Id): Bill[] {
  return (state.bills ?? []).filter((b) => b.householdId === householdId).sort((a, b) => a.week - b.week || a.issuedAt - b.issuedAt);
}

/** Open (unpaid) bills of one household. */
export function openBills(state: WorldState, householdId: Id): Bill[] {
  return householdBills(state, householdId).filter((b) => b.status !== 'paid');
}

/** Amount owed by a household right now. */
export function amountOwed(state: WorldState, householdId: Id): Cents {
  return openBills(state, householdId).reduce((sum, b) => sum + b.amount, 0);
}

function currentWeekBill(state: WorldState, householdId: Id, week: number): Bill | undefined {
  return (state.bills ?? []).find((b) => b.householdId === householdId && b.week === week);
}

/** Issues a household's bill for `week` once (and auto-pays it when the setting is on). */
function issueBill(ctx: SimCtx, hh: Household, week: number): void {
  const state = ctx.state;
  const occurrence = `bill:${hh.id}:${week}`;
  if (isProcessed(state, occurrence) || currentWeekBill(state, hh.id, week)) return;
  markProcessed(state, occurrence);
  const bd = billBreakdown(state, ctx.content, hh.id);
  if (bd.base <= 0) return;
  const now = ctx.now;
  const bill: Bill = {
    id: newId(state, 'bill'),
    householdId: hh.id,
    week,
    amount: bd.base,
    base: bd.base,
    lateFee: 0,
    issuedAt: now,
    dueAt: now + BILL_DUE_DAYS * DAY_MINUTES,
    graceEndsAt: now + (BILL_DUE_DAYS + BILL_GRACE_DAYS) * DAY_MINUTES,
    status: 'due',
  };
  state.bills ??= [];
  state.bills.push(bill);
  trimBills(state);
  const n = state.bills.filter((b) => b.householdId === hh.id).length;
  addFeed(state, ctx.events, 'money', n === 1
    ? `The first household bill is due in ${BILL_DUE_DAYS} days: $${(bill.amount / 100).toFixed(2)}. Pay it from the phone or the mailbox.`
    : `A new household bill is due in ${BILL_DUE_DAYS} days: $${(bill.amount / 100).toFixed(2)}.`, hh.memberIds[0]);
  if (state.settings.autoPayBills) {
    const r = payBill(ctx, hh.id, bill.id);
    if (!r.ok && r.reason) addFeed(state, ctx.events, 'warning', `Auto-pay failed: ${r.reason}`, hh.memberIds[0]);
  }
}

function trimBills(state: WorldState): void {
  const bills = state.bills ?? [];
  if (bills.length <= BILL_LIMIT) return;
  // Keep the newest bills; paid old ones go first.
  const ranked = [...bills].sort((a, b) => Number(a.status === 'paid') - Number(b.status === 'paid') || a.issuedAt - b.issuedAt);
  const drop = new Set(ranked.slice(0, bills.length - BILL_LIMIT).map((b) => b.id));
  state.bills = bills.filter((b) => !drop.has(b.id));
}

/** Pays each retired elder (no career) of a playable household the weekly pension, once per week (occurrence `pension:<personId>:<week>`). */
function payPensions(ctx: SimCtx, week: number): void {
  const state = ctx.state;
  for (const hh of Object.values(state.households)) {
    if (!hh.isPlayable || !hh.homeLotId) continue;
    for (const id of hh.memberIds) {
      const p = state.people[id];
      if (!p || p.lifeStage !== 'elder' || p.career || p.location.kind !== 'lot') continue;
      const occurrence = `pension:${p.id}:${week}`;
      if (isProcessed(state, occurrence)) continue;
      const r = transact(state, ctx.events, hh.id, ELDER_PENSION, 'wage', `Pension (${p.firstName})`, { occurrence });
      if (r.ok) addFeed(state, ctx.events, 'money', `${p.firstName} received the weekly pension: $${(ELDER_PENSION / 100).toFixed(2)}.`, p.id);
    }
  }
}

/** Per-tick bill processing: issue this week's bill, apply late fees and cut utilities off after the grace period. */
export function updateBills(ctx: SimCtx): void {
  const state = ctx.state;
  state.bills ??= [];
  const week = billWeek(ctx.now);
  for (const hh of Object.values(state.households)) {
    if (!hh.isPlayable || !hh.homeLotId) continue;
    if (!currentWeekBill(state, hh.id, week)) issueBill(ctx, hh, week);
  }
  payPensions(ctx, week);
  for (const bill of state.bills) {
    if (bill.status === 'paid') continue;
    if (bill.status !== 'cutoff' && bill.status !== 'overdue' && ctx.now >= bill.dueAt && bill.amount > 0) {
      const late = `billlate:${bill.id}`;
      if (!isProcessed(state, late)) {
        markProcessed(state, late);
        bill.lateFee = Math.max(BILL_LATE_FEE_MIN, Math.round(bill.base * BILL_LATE_FEE_RATE));
        bill.amount = bill.base + bill.lateFee;
        bill.status = 'overdue';
        const hh = state.households[bill.householdId];
        addFeed(state, ctx.events, 'warning', `A household bill is overdue. A $${(bill.lateFee / 100).toFixed(2)} late fee was added ($${(bill.amount / 100).toFixed(2)} due).`, hh?.memberIds[0]);
      }
    }
    if (bill.status !== 'cutoff' && ctx.now >= bill.graceEndsAt) {
      const cut = `billcut:${bill.id}`;
      if (!isProcessed(state, cut)) {
        markProcessed(state, cut);
        bill.status = 'cutoff';
        bill.cutOffAt = ctx.now;
        const hh = state.households[bill.householdId];
        if (hh) hh.powerOff = true;
        addFeed(state, ctx.events, 'warning', 'The utilities were cut off: an unpaid bill passed its grace period. Electronics and appliances will not work until it is paid.', hh?.memberIds[0]);
      }
    }
  }
  // Repair a stale flag (an edited save, or a bill paid elsewhere).
  for (const hh of Object.values(state.households)) {
    const off = (state.bills ?? []).some((b) => b.householdId === hh.id && b.status === 'cutoff');
    if (hh.powerOff && !off) hh.powerOff = false;
    if (hh.powerOff !== true && off) hh.powerOff = true;
  }
}

export interface PayBillResult { ok: boolean; reason?: string; amount?: Cents }

/**
 * Pays one bill from the household's funds. The charge is applied once (occurrence `billpay:<billId>`), even if
 * the game is saved between the transaction and the status update. Paying the last cut-off bill restores power.
 */
export function payBill(ctx: SimCtx, householdId: Id, billId: Id): PayBillResult {
  const state = ctx.state;
  const bill = (state.bills ?? []).find((b) => b.id === billId && b.householdId === householdId);
  const hh = state.households[householdId];
  if (!bill || !hh) return { ok: false, reason: 'That bill is no longer here.' };
  if (bill.status === 'paid') return { ok: false, reason: 'That bill is already paid.' };
  const r = transact(state, ctx.events, householdId, -bill.amount, 'bill', `Household bill (week ${bill.week + 1})`, { occurrence: `billpay:${bill.id}` });
  if (!r.ok) return { ok: false, reason: r.reason };
  bill.status = 'paid';
  bill.paidAt = ctx.now;
  const off = (state.bills ?? []).some((b) => b.householdId === householdId && b.status === 'cutoff');
  if (hh.powerOff && !off) {
    hh.powerOff = false;
    addFeed(state, ctx.events, 'money', 'The bill was paid: the power is back on.', hh.memberIds[0]);
  } else {
    addFeed(state, ctx.events, 'money', `Paid a household bill of $${(bill.amount / 100).toFixed(2)}.`, hh.memberIds[0]);
  }
  return { ok: true, amount: bill.amount };
}

/** Turns on auto-pay for the household (bills are paid as they are issued). */
export function setAutoPay(state: WorldState, on: boolean): void {
  state.settings.autoPayBills = on;
}

/** Next tick at which an unpaid bill changes state (for tests and the UI countdown). */
export function nextBillDeadline(bill: Bill): number {
  if (bill.status === 'paid') return Infinity;
  if (bill.status === 'due') return bill.dueAt;
  if (bill.status === 'overdue') return bill.graceEndsAt;
  return Infinity;
}

/** True when a bill's due date is within `minutes` (used for a gentle reminder in the feed). */
export function billDueSoon(bill: Bill, now: number, minutes = TICK_MINUTES): boolean {
  return bill.status === 'due' && bill.dueAt > now && bill.dueAt <= now + minutes;
}
