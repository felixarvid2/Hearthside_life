// Milestone 13: the furnishings that used to be display pieces now work through the real menu: games, pottery, instruments,
// the recliner, the sofa bed, the microwave, the laundry and the fish in the fridge.

import { describe, expect, it } from 'vitest';
import { footprintTiles } from '../../../src/core/geometry';
import { newId } from '../../../src/core/ids';
import type { Id, Lot, PlacedObject, WorldItem, WorldState } from '../../../src/core/types';
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

/** Places an object at the first spot whose footprint and one ring of tiles around it are free (the test owns the state). */
function placeFree(state: WorldState, lot: Lot, defId: string): PlacedObject {
  const def = db.objects[defId]!;
  const { w, d } = def.footprint;
  for (let z = 2; z < lot.depth - d - 2; z++) {
    for (let x = 2; x < lot.width - w - 2; x++) {
      let free = true;
      for (let dz = -1; dz <= d && free; dz++) for (let dx = -1; dx <= w && free; dx++) free = !occupies(lot, x + dx, z + dz, 0);
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

function setup(seed = 20261108) {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', [...core.premadeHouseholds()].sort((a, b) => b.members.length - a.members.length)[0]!, seed)).toEqual({ ok: true });
  const state = core.state()!;
  const lot = state.lots[state.activeLotId]!;
  const person = members(state)[0]!;
  return { core, state, lot, person, rec: new Recorder(core) };
}
type Rig = ReturnType<typeof setup>;

/** Queues through the same options the context menu shows, and runs until the action ends. Returns the end result. */
function use(rig: Rig, pick: PickResult, interactionId: string, personId: Id = rig.person.id, maxTicks = 4 * 200): string {
  const option = rig.core.options(personId, pick).find((o) => o.interactionId === interactionId && o.enabled);
  expect(option, `${interactionId} is offered and enabled`).toBeTruthy();
  const before = rig.rec.finished.length;
  expect(rig.core.queue(personId, option!).ok).toBe(true);
  for (let i = 0; i < maxTicks; i++) {
    rig.core.advanceTicks(1);
    const f = rig.rec.finished.slice(before).find((x) => x.personId === personId && x.interactionId === interactionId);
    if (f) return f.result;
  }
  return 'timeout';
}

const obj = (id: Id): PickResult => ({ kind: 'object', objectId: id });

describe('games, pottery and instruments', () => {
  it.each([
    ['pool-table-classic', 'playPool'], ['dartboard-cabinet', 'throwDarts'], ['foosball-table', 'playFoosball'], ['table-tennis-table', 'playTableTennis'],
  ])('%s: %s adds fun', (defId, interaction) => {
    const rig = setup();
    rig.person.needs.fun = 20;
    const start = rig.person.needs.fun;
    const o = placeFree(rig.state, rig.lot, defId);
    expect(use(rig, obj(o.id), interaction)).toBe('done');
    expect(rig.person.needs.fun).toBeGreaterThan(start + 2);
  });

  it('the pottery wheel trains Creativity and leaves a handmade pot worth something', () => {
    const rig = setup();
    const wheel = placeFree(rig.state, rig.lot, 'pottery-wheel');
    const before = Object.values(rig.lot.objects).filter((o) => o.defId === 'pot-handmade').length;
    expect(use(rig, obj(wheel.id), 'throwPottery')).toBe('done');
    const pots = Object.values(rig.lot.objects).filter((o) => o.defId === 'pot-handmade');
    expect(pots.length).toBe(before + 1);
    expect(pots[0]!.purchasePrice).toBeGreaterThanOrEqual(db.objects['pot-handmade']!.price);
    expect(rig.person.skills.creativity?.xp ?? 0).toBeGreaterThan(0);
  });

  it('selling a pot pays once through the freelance path', () => {
    const rig = setup();
    const wheel = placeFree(rig.state, rig.lot, 'pottery-wheel');
    const funds = () => rig.state.households[rig.person.householdId]!.funds;
    const f0 = funds();
    expect(use(rig, obj(wheel.id), 'sellPottery')).toBe('done');
    expect(funds()).toBeGreaterThan(f0);
  });

  it.each([['drum-kit-display', 'playDrums'], ['harp-concert', 'playHarp'], ['cello-stand', 'playCello']])('%s: %s trains Music', (defId, interaction) => {
    const rig = setup();
    const o = placeFree(rig.state, rig.lot, defId);
    expect(use(rig, obj(o.id), interaction)).toBe('done');
    expect(rig.person.skills.music?.xp ?? 0).toBeGreaterThan(0);
  });
});

describe('recliner, sofa bed', () => {
  it('Recline restores energy while seated', () => {
    const rig = setup();
    rig.person.needs.energy = 30;
    const o = placeFree(rig.state, rig.lot, 'recliner-classic');
    expect(use(rig, obj(o.id), 'reclineBack')).toBe('done');
    expect(rig.person.needs.energy).toBeGreaterThan(31);
  });

  it('the sofa bed offers Sleep and the sleeper lies down', () => {
    const rig = setup();
    rig.person.needs.energy = 15;
    const o = placeFree(rig.state, rig.lot, 'sofa-bed-convertible');
    const option = rig.core.options(rig.person.id, obj(o.id)).find((x) => x.interactionId === 'sleep');
    expect(option?.enabled, option?.reason).toBe(true);
    expect(rig.core.queue(rig.person.id, option!).ok).toBe(true);
    let lying = false;
    for (let i = 0; i < 4 * 120 && !lying; i++) { rig.core.advanceTicks(1); lying = rig.person.location.kind === 'lot' && rig.person.location.posture === 'lying'; }
    expect(lying).toBe(true);
  });

  it('every bed in the beds category offers sleep', () => {
    for (const d of Object.values(db.objects)) {
      if (d.category === 'beds' && d.status === 'ready' && d.tags.includes('bed')) expect(d.interactions, d.id).toContain('sleep');
    }
  });
});

describe('microwave and laundry', () => {
  it('a microwave on a counter heats a meal for a few dollars', () => {
    const rig = setup();
    const counter = placeFree(rig.state, rig.lot, 'counter-basic');
    const mw: PlacedObject = {
      id: newId(rig.state, 'obj'), defId: 'microwave-steel', level: 0, x: counter.x, z: counter.z, rot: 0, finishes: {}, purchasePrice: 1, boughtAt: 0,
      ownerHouseholdId: rig.lot.ownerHouseholdId, supportId: counter.id, condition: { dirt: 0, broken: false },
    };
    rig.lot.objects[mw.id] = mw;
    rig.person.needs.hunger = 30;
    const funds = () => rig.state.households[rig.person.householdId]!.funds;
    const f0 = funds();
    expect(use(rig, obj(mw.id), 'microwaveMeal')).toBe('done');
    expect(rig.person.needs.hunger).toBeGreaterThan(55);
    expect(rig.state.households[rig.person.householdId]!.ledger.some((l) => l.label === 'Microwave a Meal' && l.amount === -400)).toBe(true);
    expect(funds()).toBeLessThan(f0);
  });

  it.each(['washing-machine', 'washer-top-load', 'washer-dryer-stack'])('%s: Do the Laundry freshens the doer', (defId) => {
    const rig = setup();
    rig.person.needs.hygiene = 40;
    const o = placeFree(rig.state, rig.lot, defId);
    expect(use(rig, obj(o.id), 'doLaundry')).toBe('done');
    expect(rig.person.needs.hygiene).toBeGreaterThan(45);
    expect(rig.person.moodlets.some((m) => m.id === 'freshLaundry')).toBe(true);
  });
});

describe('fish in the fridge', () => {
  function fishRig() {
    const rig = setup();
    const fridge = Object.values(rig.lot.objects).find((o) => db.objects[o.defId]?.tags.includes('fridge') && o.level === 0)!;
    const loc = rig.person.location;
    if (loc.kind !== 'lot') throw new Error('not on lot');
    const fish: WorldItem = {
      id: newId(rig.state, 'itm'), kind: 'fish', lotId: rig.lot.id, position: { x: Math.floor(loc.x) + 0.5, z: Math.floor(loc.z) + 0.5, level: loc.level },
      recipeId: 'fish-trout', portions: 2, quality: 1, createdAt: rig.state.clock.minutes, spoilsAt: rig.state.clock.minutes + 1440, ownerHouseholdId: rig.person.householdId,
    };
    rig.state.items[fish.id] = fish;
    return { rig, fridge, fish };
  }

  it('stores a fish, hides it, slows its spoilage and cooks it on request', () => {
    const { rig, fridge, fish } = fishRig();
    const t0 = rig.state.clock.minutes;
    expect(use(rig, { kind: 'item', itemId: fish.id }, 'storeFish')).toBe('done');
    const stored = rig.state.items[fish.id]!;
    expect(stored.stored).toBe(true);
    expect(stored.position.onObjectId).toBe(fridge.id);
    expect(stored.spoilsAt - t0).toBeGreaterThan(2 * 1440);
    // stored fish is not offered as food any more
    expect(rig.core.options(rig.person.id, { kind: 'item', itemId: fish.id }).find((o) => o.interactionId === 'eatMeal')?.enabled ?? false).toBe(false);
    // Cook the Catch is offered at the fridge and consumes the fish
    const cook = rig.core.options(rig.person.id, obj(fridge.id)).find((o) => o.label === 'Cook the Catch');
    expect(cook?.enabled, cook?.reason).toBe(true);
    expect(rig.core.queue(rig.person.id, cook!).ok).toBe(true);
    for (let i = 0; i < 4 * 240 && rig.state.items[fish.id]; i++) rig.core.advanceTicks(1);
    expect(rig.state.items[fish.id], 'the fish was used up').toBeUndefined();
    for (let i = 0; i < 4 * 120 && !Object.values(rig.state.items).some((it) => it.recipeId === 'pan-fried-fish'); i++) rig.core.advanceTicks(1);
    const dish = Object.values(rig.state.items).find((it) => it.recipeId === 'pan-fried-fish' || it.kind === 'dishes');
    expect(dish, 'a fish dish was served').toBeTruthy();
  });

  it('Cook the Catch is not offered without a stored fish', () => {
    const rig = setup();
    const fridge = Object.values(rig.lot.objects).find((o) => db.objects[o.defId]?.tags.includes('fridge'))!;
    expect(rig.core.options(rig.person.id, obj(fridge.id)).some((o) => o.label === 'Cook the Catch')).toBe(false);
  });
});

describe('games for two', () => {
  it('Play Pool Together needs a pool table on the lot', () => {
    const rig = setup();
    const [a, b] = members(rig.state);
    expect(b, 'a second household member').toBeTruthy();
    const social = () => rig.core.options(a!.id, { kind: 'person', personId: b!.id }).find((o) => o.interactionId === 'playPoolTogether');
    expect(social()?.enabled).toBe(false);
    expect(social()?.reason).toMatch(/pool table/i);
    placeFree(rig.state, rig.lot, 'pool-table-classic');
    expect(social()?.enabled, social()?.reason).toBe(true);
  });
});
