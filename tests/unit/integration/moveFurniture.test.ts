// Milestone 13: what happens to the furniture when the household moves: it stays (default), comes along into the inventory, or is sold.

import { describe, expect, it, vi } from 'vitest';
import { premadeHouseholds } from '../../../src/characters/creator';
import { saleValue } from '../../../src/building/plans';
import type { GameCore } from '../../../src/game/GameCore';
import { movableFurniture } from '../../../src/sim/households';
import { coreWithoutSaves, db } from './harness';

vi.setConfig({ testTimeout: 60_000 });

function game(): GameCore {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', premadeHouseholds(db)[1]!, 42)).toEqual({ ok: true });
  const s = core.state()!;
  s.settings.visitors = false;
  s.schedule = s.schedule.filter((e) => e.kind === 'travelArrive');
  return core;
}
const flatOf = (c: GameCore) => Object.values(c.state()!.lots).find((l) => l.name === 'Marigold Flat')!;

describe('furniture when moving', () => {
  it('previews each choice: what goes, what is sold, and what the house then fetches', () => {
    const core = game();
    const s = core.state()!;
    const hh = s.households[s.activeHouseholdId]!;
    const flat = flatOf(core);
    const leave = core.movePreview(flat.id)!;
    const take = core.movePreview(flat.id, { furniture: 'take' })!;
    const sell = core.movePreview(flat.id, { furniture: 'sell' })!;
    expect(leave.furniture.choice).toBe('leave');
    expect(leave.furniture.count).toBeGreaterThan(5);
    expect(leave.furniture.count).toBe(movableFurniture({ state: s, content: db }, hh, s.lots[hh.homeLotId!]).length);
    // the house sells for less once the furniture leaves it
    expect(take.proceeds).toBeLessThan(leave.proceeds);
    expect(take.lines.join(' ')).toMatch(/go with you into the household inventory/);
    expect(sell.lines.join(' ')).toMatch(/are sold for \$/);
    expect(leave.lines.join(' ')).toMatch(/stay in the house/);
    expect(sell.furniture.saleValue).toBeGreaterThan(0);
    expect(leave.furniture.worth).toBeGreaterThanOrEqual(leave.furniture.saleValue);
  });

  it('"take" moves the pieces into the inventory with their identity and price, and the house is sold without them', () => {
    const core = game();
    const s = core.state()!;
    const hh = s.households[s.activeHouseholdId]!;
    const oldId = hh.homeLotId!;
    const flat = flatOf(core);
    const before = movableFurniture({ state: s, content: db }, hh, s.lots[oldId]).map((o) => ({ id: o.id, defId: o.defId, price: o.purchasePrice }));
    const all = Object.keys(s.lots[oldId]!.objects).length;
    const funds = hh.funds;
    const pv = core.movePreview(flat.id, { furniture: 'take' })!;
    expect(core.moveHousehold(flat.id, { furniture: 'take' })).toEqual({ ok: true });
    expect(hh.homeLotId).toBe(flat.id);
    expect(hh.inventory.map((e) => e.object.id).sort()).toEqual(before.map((b) => b.id).sort());
    for (const e of hh.inventory) {
      expect(e.object.ownerHouseholdId).toBe(hh.id);
      expect(e.object.supportId).toBeUndefined();
      expect(e.object.purchasePrice).toBe(before.find((b) => b.id === e.object.id)!.price);
    }
    expect(Object.keys(s.lots[oldId]!.objects).length).toBe(all - before.length);
    expect(hh.funds).toBe(funds - flat.rent! + pv.proceeds);
    expect(hh.ledger.reduce((a, l) => a + l.amount, 0)).toBe(hh.funds);
    for (const o of Object.values(s.lots[oldId]!.objects)) if (o.supportId) expect(s.lots[oldId]!.objects[o.supportId]).toBeDefined();
  });

  it('"sell" pays the sale value once and leaves nothing in the inventory', () => {
    const core = game();
    const s = core.state()!;
    const hh = s.households[s.activeHouseholdId]!;
    const oldId = hh.homeLotId!;
    const flat = flatOf(core);
    const value = movableFurniture({ state: s, content: db }, hh, s.lots[oldId]).reduce((a, o) => a + saleValue(s, o), 0);
    const funds = hh.funds;
    const inventory = hh.inventory.length;
    const pv = core.movePreview(flat.id, { furniture: 'sell' })!;
    expect(pv.furniture.saleValue).toBe(value);
    expect(core.moveHousehold(flat.id, { furniture: 'sell' })).toEqual({ ok: true });
    expect(hh.inventory.length).toBe(inventory);
    expect(hh.funds).toBe(funds - flat.rent! + pv.proceeds + value);
    expect(hh.ledger.filter((l) => l.occurrence?.endsWith(':furniture'))).toHaveLength(1);
    expect(hh.ledger.reduce((a, l) => a + l.amount, 0)).toBe(hh.funds);
  });

  it('"leave" keeps today\'s behaviour: the furniture stays and is part of the sale', () => {
    const core = game();
    const s = core.state()!;
    const hh = s.households[s.activeHouseholdId]!;
    const oldId = hh.homeLotId!;
    const count = Object.keys(s.lots[oldId]!.objects).length;
    expect(core.moveHousehold(flatOf(core).id)).toEqual({ ok: true });
    expect(Object.keys(s.lots[oldId]!.objects).length).toBe(count);
    expect(hh.inventory).toHaveLength(0);
  });
});
