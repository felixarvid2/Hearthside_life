// Milestone 12, task C: Cook a Meal on a multi-floor lot. The option is offered from a fridge on any floor, so
// the chain has to find and route to a stove on a floor the cook can reach: the same level first, then the
// nearest one on another level the staircase connects. With no reachable stove the option is disabled and the
// request is refused, so availability and execution never disagree.

import { describe, expect, it } from 'vitest';
import type { FinishRef, PlacedObject } from '../../../src/core/types';
import type { GameCore } from '../../../src/game/GameCore';
import { coreWithoutSaves, db, members } from './harness';

const OAK: FinishRef = { designId: 'oak-planks', paletteId: db.floorDesigns['oak-planks']!.palettes[0]!.id };
const STAIR = 'stair-straight-basic';

/** Seconds from now to give a whole cook chain (stage 0 + recipe + serving). */
const COOK_TICKS = 4 * 90;

/**
 * The starter home with a second storey over the kitchen end and a staircase inside it. The fridge and stove
 * stay on the ground floor, so a cook standing upstairs has to walk down: the case the acceptance run hit.
 */
function twoStorey(seed = 21): GameCore {
  const core = coreWithoutSaves();
  expect(core.startNewGame('sandbox', core.premadeHouseholds()[0]!, seed)).toEqual({ ok: true });
  core.setMode('build');
  core.setBuildTool({ kind: 'room', floor: OAK, doors: [{ defId: 'door-panel', side: 's' }] });
  expect(core.buildApply({ from: { x: 11, z: 10 }, to: { x: 19, z: 17 }, level: 1 }), 'upper room').toMatchObject({ ok: true });
  core.setBuildTool({ kind: 'stairs', defId: STAIR, rot: 0 });
  expect(core.buildApply({ from: { x: 17.5, z: 12.5 }, level: 0 }), 'staircase').toMatchObject({ ok: true });
  core.setMode('live');
  return core;
}

function findObject(core: GameCore, re: RegExp): PlacedObject {
  const s = core.state()!;
  const lot = s.lots[s.activeLotId]!;
  const o = Object.values(lot.objects).find((x) => re.test(x.defId));
  expect(o, `${re} on the lot`).toBeTruthy();
  return o!;
}

function runUntil(core: GameCore, done: () => boolean, maxTicks: number): boolean {
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return true;
    core.advanceTicks(1);
  }
  return done();
}

describe('cook a meal across floors', () => {
  it('cooks from an upper floor and eats: the stove downstairs is found and reached', () => {
    const core = twoStorey();
    const s = core.state()!;
    const lot = s.lots[s.activeLotId]!;
    const person = members(s)[0]!;
    const fridge = findObject(core, /fridge/);
    const stove = findObject(core, /stove/);
    expect(stove.level).toBe(0);
    // the cook starts in the upper room, above the kitchen
    person.location = { kind: 'lot', lotId: lot.id, level: 1, x: 14.5, z: 12.5, facing: 0, posture: 'standing' };

    const opt = core.options(person.id, { kind: 'object', objectId: fridge.id }).find((o) => o.interactionId === 'cookMeal');
    expect(opt, 'Cook a Meal offered upstairs').toBeTruthy();
    expect(opt!.enabled).toBe(true);

    const finished: Array<{ interactionId: string; result: string; reason?: string }> = [];
    core.events.onAny((e) => { if (e.type === 'action.finished') finished.push(e); });
    expect(core.queue(person.id, opt!)).toMatchObject({ ok: true });

    // Reserve picks the only stove straight away, even though it is on another floor.
    core.advanceTicks(1);
    expect(person.queue[0]?.data.stoveObj).toBe(stove.id);

    // The whole chain runs: fridge reach-in upstairs... no, downstairs; then the stove; then serving.
    expect(runUntil(core, () => finished.some((f) => f.interactionId === 'cookMeal' && f.result === 'done'), COOK_TICKS),
      JSON.stringify(finished)).toBe(true);

    const meal = Object.values(s.items).find((it) => it.kind === 'meal');
    expect(meal, 'a meal was served').toBeTruthy();
    expect(meal!.position.level).toBe(0); // on the kitchen floor, not the floor above it
    expect(person.location.kind === 'lot' && person.location.level).toBe(0);
    // and the cook sits down to eat it (the chain continues with eatMeal)
    expect(runUntil(core, () => finished.some((f) => f.interactionId === 'eatMeal' && f.result === 'done'), COOK_TICKS),
      JSON.stringify(finished)).toBe(true);
  }, 30_000);

  it('does not offer cookMeal when there is no stove on any floor, and nothing is queued', () => {
    const core = twoStorey();
    const s = core.state()!;
    const lot = s.lots[s.activeLotId]!;
    const person = members(s)[0]!;
    const fridge = findObject(core, /fridge/);
    const stove = findObject(core, /stove/);
    core.setMode('buy');
    expect(core.sell(stove.id)).toMatchObject({ ok: true });
    core.setMode('live');
    expect(Object.values(lot.objects).some((o) => /stove/.test(o.defId))).toBe(false);

    person.location = { kind: 'lot', lotId: lot.id, level: 1, x: 14.5, z: 12.5, facing: 0, posture: 'standing' };
    const opt = core.options(person.id, { kind: 'object', objectId: fridge.id }).find((o) => o.interactionId === 'cookMeal');
    expect(opt, 'the entry is still listed, greyed').toBeTruthy();
    expect(opt!.enabled).toBe(false);
    expect(opt!.reason).toMatch(/needs a stove/i);
    // The request is refused with the same reason, and no action is left behind.
    const r = core.queue(person.id, opt!);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.reason).toMatch(/needs a stove/i);
    core.advanceTicks(4);
    expect(person.queue.filter((a) => a.interactionId === 'cookMeal')).toHaveLength(0);
    expect(Object.values(s.items).filter((it) => it.kind === 'meal')).toHaveLength(0);
  }, 30_000);

  it('prefers a stove on the cook’s own floor over the one downstairs', () => {
    const core = twoStorey();
    const s = core.state()!;
    const lot = s.lots[s.activeLotId]!;
    const person = members(s)[0]!;
    const fridge = findObject(core, /fridge/);
    const downstairs = findObject(core, /stove/);
    expect(downstairs.level).toBe(0);
    // Buy a second stove in the upper room.
    s.households[s.activeHouseholdId]!.funds = 5_000_000;
    core.setMode('buy');
    expect(core.startPlacement('stove-basic')).toMatchObject({ ok: true });
    core.setPlacementLevel(1);
    core.placementTile(13, 12);
    const placed = core.confirmPlacement();
    expect(placed, JSON.stringify(placed)).toMatchObject({ ok: true });
    core.setMode('live');
    const upstairs = lot.objects[placed.objectId!]!;
    expect(upstairs).toMatchObject({ level: 1, defId: 'stove-basic' });

    person.location = { kind: 'lot', lotId: lot.id, level: 1, x: 14.5, z: 12.5, facing: 0, posture: 'standing' };
    const opt = core.options(person.id, { kind: 'object', objectId: fridge.id }).find((o) => o.interactionId === 'cookMeal')!;
    expect(opt.enabled).toBe(true);
    expect(core.queue(person.id, opt)).toMatchObject({ ok: true });
    core.advanceTicks(1);
    // Both stoves are on reachable floors; the one on the cook's floor wins.
    expect(person.queue[0]?.data.stoveObj).toBe(upstairs.id);
  }, 30_000);
});
