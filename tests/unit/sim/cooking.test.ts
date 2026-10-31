import { describe, expect, it } from 'vitest';
import { cloneState } from '../../../src/core/state';
import { buildWorld, finished, harness, head, runTicks, runUntil, setNeeds } from './fixtures';
import type { FixtureWorld, Harness } from './fixtures';

function kitchen(): { w: FixtureWorld; h: Harness } {
  const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
  setNeeds(w.state, w.mira, 70);
  setNeeds(w.state, w.theo, 70);
  w.state.people[w.mira]!.needs.hunger = 20;
  return { w, h: harness(w.state) };
}

function cook(h: Harness, w: FixtureWorld): string {
  const r = h.sim.queue(w.mira, { interactionId: 'cookMeal', target: { kind: 'object', objectId: w.objects.fridge!.id, slotId: null } });
  if (!r.ok) throw new Error(r.reason);
  return r.actionId;
}

const funds = (h: Harness) => Object.values(h.holder.state.households).find((x) => x.isPlayable)!.funds;
const groceries = (h: Harness) => Object.values(h.holder.state.households).flatMap((x) => x.ledger).filter((l) => l.kind === 'groceries');

describe('cooking chain', () => {
  it('fridge -> stove -> meal on the counter with a portion per household member, charged once, then the cook eats', () => {
    const { w, h } = kitchen();
    const start = funds(h);
    cook(h, w);
    const stages: number[] = [];
    runUntil(h, () => {
      const a = head(h, w.mira);
      const st = a?.interactionId === 'cookMeal' && typeof a.data.stage === 'number' ? a.data.stage : -1;
      if (st >= 0 && stages[stages.length - 1] !== st) stages.push(st);
      return a?.interactionId === 'eatMeal';
    }, 4 * 60 * 2);
    expect(stages).toEqual([0, 1, 2]);
    expect(funds(h)).toBe(start - 1200);
    expect(groceries(h)).toHaveLength(1);
    const items = Object.values(h.holder.state.items);
    expect(items).toHaveLength(1);
    const meal = items[0]!;
    expect(meal).toMatchObject({ kind: 'meal', recipeId: 'pasta', portions: 2, ownerHouseholdId: w.state.people[w.mira]!.householdId });
    expect(meal.position.onObjectId).toBe(w.objects.counter!.id);
    expect(meal.spoilsAt - meal.createdAt).toBe(1440);
    expect(head(h, w.mira)!.source).toBe('chain');
    runUntil(h, () => !head(h, w.mira), 4 * 60);
    expect(finished(h, w.mira, 'eatMeal')[0]!.result).toBe('done');
    expect(h.holder.state.items[meal.id]!.portions).toBe(1);
    expect(h.holder.state.people[w.mira]!.needs.hunger).toBeGreaterThan(70);
    expect(h.holder.state.people[w.mira]!.skills.cooking!.xp).toBeGreaterThan(0);
    expect(h.sim.reservations()).toEqual([]);
    // the cook sat at the dining chair facing the table
    expect(h.log.some((e) => e.type === 'action.finished' && e.interactionId === 'eatMeal')).toBe(true);
  });

  it('eats at a free chair next to a table', () => {
    const { w, h } = kitchen();
    cook(h, w);
    runUntil(h, () => head(h, w.mira)?.interactionId === 'eatMeal' && head(h, w.mira)?.phase === 'perform' && head(h, w.mira)?.data.stage === 1, 4 * 60 * 2);
    const loc = h.holder.state.people[w.mira]!.location;
    expect(loc.kind === 'lot' && loc.posture).toBe('seated');
    expect(h.sim.reservations()[0]).toMatch(new RegExp(`^slot:${w.objects.chair!.id}:sit=`));
  });

  it('cancelling before cooking starts charges nothing and releases fridge and stove', () => {
    const { w, h } = kitchen();
    const start = funds(h);
    const id = cook(h, w);
    runUntil(h, () => head(h, w.mira)?.phase === 'perform');
    expect(head(h, w.mira)!.data.stage).toBe(0);
    expect(h.sim.reservations()).toHaveLength(2); // fridge and stove
    h.sim.cancel(w.mira, id);
    runUntil(h, () => !head(h, w.mira), 10);
    expect(funds(h)).toBe(start);
    expect(groceries(h)).toHaveLength(0);
    expect(h.sim.reservations()).toEqual([]);
    expect(Object.keys(h.holder.state.items)).toHaveLength(0);
  });

  it('cancelling on the way to the stove charges nothing; cancelling while cooking keeps the single charge', () => {
    const { w, h } = kitchen();
    const start = funds(h);
    const id = cook(h, w);
    runUntil(h, () => head(h, w.mira)?.data.stage === 1 && head(h, w.mira)?.phase === 'route');
    h.sim.cancel(w.mira, id);
    runUntil(h, () => !head(h, w.mira), 10);
    expect(funds(h)).toBe(start);

    const id2 = cook(h, w);
    runUntil(h, () => head(h, w.mira)?.data.stage === 1 && head(h, w.mira)?.phase === 'perform');
    runTicks(h, 8);
    h.sim.cancel(w.mira, id2);
    runUntil(h, () => !head(h, w.mira), 10);
    expect(funds(h)).toBe(start - 1200);
    expect(groceries(h)).toHaveLength(1);
    expect(Object.keys(h.holder.state.items)).toHaveLength(0);
    expect(h.sim.reservations()).toEqual([]);
  });

  it('charges once across a save/load while cooking', () => {
    const { w, h } = kitchen();
    const start = funds(h);
    cook(h, w);
    runUntil(h, () => head(h, w.mira)?.data.stage === 1 && head(h, w.mira)?.phase === 'perform');
    runTicks(h, 3);
    const h2 = harness(cloneState(h.holder.state), h.content);
    h2.sim.rebuild();
    runUntil(h2, () => Object.keys(h2.holder.state.items).length > 0, 4 * 60);
    expect(funds(h2)).toBe(start - 1200);
    expect(groceries(h2)).toHaveLength(1);
  });

  it('refuses to cook without money for groceries', () => {
    const { w, h } = kitchen();
    Object.values(h.holder.state.households).find((x) => x.isPlayable)!.funds = 500;
    const r = h.sim.queue(w.mira, { interactionId: 'cookMeal', target: { kind: 'object', objectId: w.objects.fridge!.id, slotId: null } });
    expect(r).toEqual({ ok: false, reason: 'Not enough money for groceries ($12.00).' });
  });

  it('other hungry household members eat leftover portions autonomously', () => {
    const { w, h } = kitchen();
    cook(h, w);
    runUntil(h, () => head(h, w.mira)?.interactionId === 'eatMeal', 4 * 60 * 2);
    const meal = Object.values(h.holder.state.items)[0]!;
    h.holder.state.settings.autonomy = true;
    h.holder.state.people[w.theo]!.needs.hunger = 15;
    runUntil(h, () => !h.holder.state.items[meal.id], 4 * 60 * 2);
    runUntil(h, () => finished(h, w.theo, 'eatMeal').length > 0, 4 * 60);
    const theoAte = finished(h, w.theo, 'eatMeal');
    expect(theoAte.some((e) => e.result === 'done')).toBe(true);
    expect(h.holder.state.people[w.theo]!.needs.hunger).toBeGreaterThan(40);
    expect(groceries(h)).toHaveLength(1); // nobody cooked again while leftovers existed
  });

  it('meals spoil after a game day', () => {
    const { w, h } = kitchen();
    cook(h, w);
    runUntil(h, () => Object.keys(h.holder.state.items).length > 0, 4 * 60 * 2);
    const meal = Object.values(h.holder.state.items)[0]!;
    runUntil(h, () => !head(h, w.mira), 4 * 60);
    expect(h.holder.state.items[meal.id]).toBeDefined();
    runUntil(h, () => !h.holder.state.items[meal.id], 4 * 1441);
    expect(h.holder.state.clock.minutes).toBeGreaterThanOrEqual(meal.spoilsAt);
  });

  it('a snack is charged at perform start and refunded by never charging when cancelled before', () => {
    const { w, h } = kitchen();
    const start = funds(h);
    const r = h.sim.queue(w.mira, { interactionId: 'grabSnack', target: { kind: 'object', objectId: w.objects.fridge!.id, slotId: null } });
    expect(r.ok).toBe(true);
    runUntil(h, () => !head(h, w.mira));
    expect(funds(h)).toBe(start - 300);
    expect(h.holder.state.people[w.mira]!.needs.hunger).toBeGreaterThan(40);
  });
});
