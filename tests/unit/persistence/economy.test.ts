// Save compatibility of the Milestone 6 economy fields: auto-pay, a household power flag, work effort and a
// pending on-the-job decision on people, and household bills. All are optional additions to schema 1, so
// older saves load unchanged and malformed values are repaired instead of breaking the save.

import { describe, expect, it } from 'vitest';
import type { Bill, WorldState } from '../../../src/core/types';
import { SCHEMA_VERSION } from '../../../src/core/types';
import { fillEconomyDefaults, migrate, validateWorld } from '../../../src/persistence/schema';
import { makeContent, makeWorld, snapshot } from './fixtures';

const robin = (w: WorldState) => Object.values(w.people)[0]!;
const household = (w: WorldState) => Object.values(w.households).find((h) => h.isPlayable)!;

function validBill(w: WorldState): Bill {
  return {
    id: 'bill-test', householdId: household(w).id, week: 0, amount: 7370, base: 6700, lateFee: 670,
    issuedAt: 480, dueAt: 4800, graceEndsAt: 7680, status: 'overdue',
  };
}

describe('economy fields in saves', () => {
  it('a save without the new fields loads unchanged and valid', () => {
    const world = makeWorld();
    expect(household(world).powerOff).toBeUndefined();
    const raw = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    delete (raw.settings as Record<string, unknown>).autoPayBills;
    delete raw.bills;
    const before = snapshot(raw as unknown as WorldState);
    const r = migrate(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toEqual(before);
    expect(r.migrated).toBe(false);
    expect((r.state.bills as unknown)).toBeUndefined();
    expect(validateWorld(r.state, makeContent()).errors).toEqual([]);
  });

  it('new fields survive JSON, migrate untouched and validate', () => {
    const world = makeWorld();
    world.settings.autoPayBills = true;
    household(world).powerOff = true;
    robin(world).career!.effort = 'hard';
    robin(world).career!.pendingEvent = { eventId: 'difficult-customer', day: 3, chosen: 'calm' };
    world.bills = [validBill(world)];
    const copy = JSON.parse(JSON.stringify(world)) as WorldState;
    const r = migrate(copy);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toEqual(world);
    expect(r.migrated).toBe(false);
    expect(validateWorld(r.state, makeContent()).errors).toEqual([]);
    expect(r.state.bills![0]).toEqual(validBill(world));
  });

  it('repairs malformed effort, pending decisions, power flags and bills', () => {
    const world = makeWorld();
    const raw = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    const settings = raw.settings as Record<string, unknown>;
    settings.autoPayBills = 'yes';
    const hhs = Object.values(raw.households as Record<string, Record<string, unknown>>);
    hhs[0]!.powerOff = 'yes';
    const people = Object.values(raw.people as Record<string, Record<string, unknown>>);
    const career = people[0]!.career as Record<string, unknown>;
    career.effort = 'extreme';
    career.pendingEvent = { eventId: 5, day: 'x' };
    people[1]!.career = null;
    raw.bills = [
      { ...validBill(world), paidAt: 'yesterday' },
      { ...validBill(world), id: 'bill-bad-status', status: 'banana' },
      { ...validBill(world), id: 'bill-neg', amount: -1 },
      { id: 'bill-missing' },
      'not a bill',
    ];
    const r = migrate(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.settings.autoPayBills).toBeUndefined();
    expect(household(r.state).powerOff).toBeUndefined();
    expect(r.state.people[robin(r.state).id]!.career!.effort).toBeUndefined();
    expect(r.state.people[robin(r.state).id]!.career!.pendingEvent).toBeUndefined();
    const bills = r.state.bills!;
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({ id: 'bill-test', status: 'overdue' });
    expect('paidAt' in bills[0]!).toBe(false);
    expect(validateWorld(r.state, makeContent()).errors).toEqual([]);
  });

  it('keeps well-formed optional values and drops only the bad parts', () => {
    const world = makeWorld();
    const raw = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    (raw.settings as Record<string, unknown>).autoPayBills = false;
    const hh = Object.values(raw.households as Record<string, Record<string, unknown>>)[0]!;
    hh.powerOff = false;
    const p = Object.values(raw.people as Record<string, Record<string, unknown>>)[0]!;
    const career = p.career as Record<string, unknown>;
    career.effort = 'slack';
    career.pendingEvent = { eventId: 'cover-shift', day: 0, chosen: 'accept' };
    raw.bills = [{ ...validBill(world), status: 'cutoff', cutOffAt: 8000, paidAt: 9000 }];
    const r = migrate(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.settings.autoPayBills).toBe(false);
    expect(household(r.state).powerOff).toBe(false);
    const c = r.state.people[robin(r.state).id]!.career!;
    expect(c.effort).toBe('slack');
    expect(c.pendingEvent).toEqual({ eventId: 'cover-shift', day: 0, chosen: 'accept' });
    expect(r.state.bills![0]).toMatchObject({ status: 'cutoff', cutOffAt: 8000, paidAt: 9000 });
  });

  it('is idempotent and leaves the schema version alone', () => {
    expect(SCHEMA_VERSION).toBe(1);
    const raw = JSON.parse(JSON.stringify(makeWorld())) as Record<string, unknown>;
    raw.bills = [validBill(makeWorld())];
    fillEconomyDefaults(raw);
    const once = JSON.stringify(raw);
    fillEconomyDefaults(raw);
    expect(JSON.stringify(raw)).toBe(once);
    fillEconomyDefaults({});
    fillEconomyDefaults({ bills: {} });
    fillEconomyDefaults({ households: { a: 5 }, people: { b: null }, settings: { autoPayBills: 3 } });
  });
});
