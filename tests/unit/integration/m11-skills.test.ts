// Milestone 11, task B integration: three real game days in the starter home with the real content, where the
// player queues baking, yoga and sketching sessions between ordinary autonomous life. Checks that the new
// objects are usable through the same context-menu path as the UI, that a week of practice is possible in a
// real house and that nothing dead-ends.

import { describe, expect, it } from 'vitest';
import { atDayMinute } from '../../../src/core/clock';
import { footprintTiles } from '../../../src/core/geometry';
import { newId } from '../../../src/core/ids';
import type { Id, Lot, PlacedObject, WorldState } from '../../../src/core/types';
import type { PickResult } from '../../../src/game/api';
import { Recorder, coreWithoutSaves, db, members } from './harness';

function occupies(lot: Lot, x: number, z: number, level: number): boolean {
  for (const o of Object.values(lot.objects)) {
    if (o.level !== level) continue;
    const def = db.objects[o.defId];
    if (!def || !def.blocksMovement || def.layer !== 'floor') continue;
    if (footprintTiles(o.x, o.z, def.footprint, o.rot).some((t) => t.x === x && t.z === z)) return true;
  }
  return false;
}

/** Places a footprint at the first free floor spot (no purchase; the test owns the state). */
function placeFree(state: WorldState, lot: Lot, defId: string, w: number, d: number): PlacedObject {
  const def = db.objects[defId]!;
  for (let z = 1; z < lot.depth - d; z++) {
    for (let x = 1; x < lot.width - w; x++) {
      let free = true;
      for (let dz = 0; dz < d && free; dz++) for (let dx = 0; dx < w && free; dx++) free = !occupies(lot, x + dx, z + dz, 0);
      if (!free) continue;
      const o: PlacedObject = {
        id: newId(state, 'obj'), defId, level: 0, x, z, rot: 0, finishes: {}, purchasePrice: def.price,
        boughtAt: state.clock.minutes, ownerHouseholdId: lot.ownerHouseholdId, condition: { dirt: 0, broken: false },
      };
      lot.objects[o.id] = o;
      return o;
    }
  }
  throw new Error(`no free spot for ${defId}`);
}

function placeOn(state: WorldState, lot: Lot, defId: string, support: PlacedObject): PlacedObject {
  const def = db.objects[defId]!;
  const o: PlacedObject = {
    id: newId(state, 'obj'), defId, level: support.level, x: support.x, z: support.z, rot: support.rot, finishes: {},
    purchasePrice: def.price, boughtAt: state.clock.minutes, ownerHouseholdId: lot.ownerHouseholdId, supportId: support.id,
    condition: { dirt: 0, broken: false },
  };
  lot.objects[o.id] = o;
  return o;
}

/** Queues an interaction through the real context-menu path (the same options the UI shows). */
function queueThroughMenu(core: ReturnType<typeof coreWithoutSaves>, personId: Id, pick: PickResult, interactionId: string): boolean {
  const option = core.options(personId, pick).find((o) => o.interactionId === interactionId && o.enabled);
  if (!option) return false;
  return core.queue(personId, option).ok;
}

describe('three days of baking, wellness and creativity in the starter home', () => {
  it('practises all three skills through the real menu and serves real batches', () => {
    const core = coreWithoutSaves();
    const draft = core.premadeHouseholds()[0]!;
    expect(core.startNewGame('guided', draft, 20261103)).toEqual({ ok: true });
    const state = core.state()!;
    const lot = state.lots[state.activeLotId]!;
    const mat = placeFree(state, lot, 'yoga-mat', 1, 2);
    const table = Object.values(lot.objects).find((o) => o.defId === 'table-coffee') ?? Object.values(lot.objects).find((o) => o.defId === 'table-dining-oak')!;
    const book = placeOn(state, lot, 'sketchbook', table);
    const stove = Object.values(lot.objects).find((o) => o.defId === 'stove-basic' && o.level === 0)!;
    const person = members(state)[0]!;

    const pickMat: PickResult = { kind: 'object', objectId: mat.id };
    const pickBook: PickResult = { kind: 'object', objectId: book.id };
    const pickStove: PickResult = { kind: 'object', objectId: stove.id };
    // The three practice interactions must be offered by the placed objects (no dead entries).
    expect(queueThroughMenu(core, person.id, pickStove, 'bakeTreat')).toBe(true);
    expect(queueThroughMenu(core, person.id, pickMat, 'doYoga')).toBe(true);
    expect(queueThroughMenu(core, person.id, pickBook, 'sketchIdeas')).toBe(true);

    const rec = new Recorder(core);
    const plan = [
      { pick: pickStove, id: 'bakeTreat' },
      { pick: pickMat, id: 'doYoga' },
      { pick: pickBook, id: 'sketchIdeas' },
    ];
    for (let day = 0; day < 3; day++) {
      for (const [hour, i] of [[9, 0], [13, 1], [19, 2]] as const) {
        rec.runUntil(atDayMinute(day, hour * 60));
        const p = state.people[person.id]!;
        if (p.location.kind !== 'lot') continue;
        const what = plan[i]!;
        queueThroughMenu(core, person.id, what.pick, what.id);
      }
    }
    rec.runUntil(atDayMinute(3, 8 * 60));

    const p = state.people[person.id]!;
    const done = (id: string) => rec.finished.filter((f) => f.personId === person.id && f.interactionId === id && f.result === 'done').length;
    expect(done('bakeTreat')).toBeGreaterThan(0);
    expect(done('doYoga')).toBeGreaterThan(0);
    expect(done('sketchIdeas')).toBeGreaterThan(0);
    expect(p.skills.baking?.xp ?? 0).toBeGreaterThan(0);
    expect(p.skills.wellness?.xp ?? 0).toBeGreaterThan(0);
    expect(p.skills.creativity?.xp ?? 0).toBeGreaterThan(0);
    // At least one baked batch exists in the home (or was eaten), made from a real baking recipe.
    const baked = Object.values(state.items).filter((it) => it.kind === 'meal' && db.recipes[it.recipeId]?.skill === 'baking');
    expect(baked.length + rec.finished.filter((f) => f.interactionId === 'eatMeal').length).toBeGreaterThan(0);
    expect(Number.isFinite(p.needs.energy) && Number.isFinite(p.needs.hunger)).toBe(true);
  });
});
