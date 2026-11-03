// Milestone 9 gardening: deterministic growth by game day, watering and weeds, harvests that pay once, perennials, catch-up and the
// plant / water / weed / harvest interactions run through the simulation (time skipped by moving the clock).

import { describe, expect, it } from 'vitest';
import { CROPS, EXTERIOR, GARDEN_INTERACTIONS } from '../../../src/content/exterior';
import { GARDEN_OBJECTS } from '../../../src/content/exteriorObjects';
import { dayIndex, MINUTES_PER_DAY, TICK_MINUTES } from '../../../src/core/clock';
import { cloneState } from '../../../src/core/state';
import type { PlacedObject } from '../../../src/core/types';
import {
  advanceGardens, CATCH_UP_DAYS, cropsFor, gardenOf, gardenReason, gardenStage, harvest, harvestYield, isWilted, nextCrop, plant, water, weed,
} from '../../../src/sim/garden';
import { runUntil, place } from './fixtures';
import { setup } from './choreFixtures';

function bed(defId = 'garden-vegpatch', id = 'obj_bed1'): PlacedObject {
  return { id, defId, level: 0, x: 0, z: 0, rot: 0, finishes: {}, purchasePrice: 0, boughtAt: 0, ownerHouseholdId: null, condition: { dirt: 0, broken: false } };
}

describe('crop content', () => {
  it('every crop is grown by a real garden object and every bed has crops', () => {
    const ids = new Set(GARDEN_OBJECTS.map((o) => o.id));
    for (const c of CROPS) {
      expect(c.days).toBeGreaterThan(0);
      expect(c.yield[0]).toBeLessThanOrEqual(c.yield[1]);
      expect(c.unitPrice).toBeGreaterThan(0);
      expect(c.grownIn.every((d) => ids.has(d))).toBe(true);
    }
    for (const d of ['garden-vegpatch', 'garden-fruit-tree', 'garden-herb-planter']) expect(cropsFor(d).length).toBeGreaterThan(0);
    expect(Object.keys(EXTERIOR.crops)).toHaveLength(CROPS.length);
    expect(GARDEN_INTERACTIONS.map((i) => i.id)).toEqual(['gardenPlant', 'gardenWater', 'gardenWeed', 'gardenHarvest']);
  });
});

describe('growth', () => {
  it('a watered bed ripens after the crop days, a dry one takes about three times as long', () => {
    const a = bed();
    const crop = plant(a, 0)!;
    let day = 0;
    while (gardenStage(a.garden) < 3 && day < 60) {
      water(a, day);
      weed(a, day);
      day += 1;
      advanceGardens(stateWith(a), null, day);
    }
    expect(day).toBe(crop.days);
    expect(gardenStage(a.garden)).toBe(3);

    const b = bed('garden-vegpatch', 'obj_bed1');
    plant(b, 0);
    const wb = stateWith(b);
    advanceGardens(wb, null, crop.days * 3 + 3);
    expect(gardenStage(b.garden)).toBe(3);
    const c = bed('garden-vegpatch', 'obj_bed1');
    plant(c, 0);
    advanceGardens(stateWith(c), null, crop.days);
    expect(gardenStage(c.garden)).toBeLessThan(3); // dry for the whole time
    expect(isWilted(c.garden)).toBe(true);
  });

  it('weeds slow a watered bed to half speed and pulling them resets them', () => {
    const a = bed();
    plant(a, 0);
    const g = a.garden!;
    g.water = 1; g.weeds = 0.9;
    const before = g.growth;
    advanceGardens(stateWith(a), null, 1);
    expect(g.growth - before).toBeCloseTo(0.5, 5);
    expect(gardenReason('gardenWeed', a, 1)).toBeNull();
    weed(a, 1);
    expect(g.weeds).toBe(0);
    expect(gardenReason('gardenWeed', a, 1)).toMatch(/No weeds/);
  });

  it('is deterministic: the same bed and days give the same state, however the days are batched', () => {
    const run = (steps: number[]) => {
      const a = bed();
      plant(a, 0);
      water(a, 0);
      const s = stateWith(a);
      let day = 0;
      for (const n of steps) { day += n; advanceGardens(s, null, day); }
      return JSON.stringify(a.garden);
    };
    expect(run([5])).toBe(run([1, 1, 1, 1, 1]));
    expect(run([2, 3])).toBe(run([5]));
  });

  it('catches up at most a month, and an untouched bed never dies', () => {
    const a = bed();
    plant(a, 0);
    advanceGardens(stateWith(a), null, 500);
    expect(a.garden!.day).toBe(500);
    expect(a.garden!.growth).toBeLessThanOrEqual(a.garden!.need);
    expect(CATCH_UP_DAYS).toBe(30);
    expect(a.garden!.crop).not.toBeNull();
  });

  it('fruit trees start with a crop; herbs and veg start empty', () => {
    const t = bed('garden-fruit-tree', 'obj_tree');
    advanceGardens(stateWith(t), null, 3);
    expect(t.garden!.crop).toMatch(/apple|lemon/);
    const h = bed('garden-herb-planter', 'obj_herb');
    advanceGardens(stateWith(h), null, 3);
    expect(h.garden!.crop).toBeNull();
    expect(gardenStage(h.garden)).toBe(0);
    expect(gardenReason('gardenPlant', h, 3)).toBeNull();
    expect(gardenReason('gardenHarvest', h, 3)).toMatch(/Nothing/);
    expect(gardenReason('gardenWater', h, 3)).toMatch(/Nothing/);
  });
});

describe('harvest', () => {
  it('yields within the crop range, better gardeners get more, annuals are spent and perennials regrow', () => {
    const a = bed();
    const crop = plant(a, 0)!;
    a.garden!.growth = a.garden!.need;
    const lo = harvestYield(crop, a, 1), hi = harvestYield(crop, a, 10);
    expect(lo).toBeGreaterThanOrEqual(crop.yield[0]);
    expect(lo).toBeLessThanOrEqual(crop.yield[1]);
    expect(hi - lo).toBe(3);
    const r = harvest(a, 5, 1)!;
    expect(r.pieces).toBe(lo);
    expect(r.earned).toBe(Math.round(lo * crop.unitPrice * 0.75));
    if (crop.regrow === 0) { expect(a.garden!.crop).toBeNull(); } else { expect(a.garden!.crop).toBe(crop.id); expect(a.garden!.need).toBe(crop.regrow); }
    expect(a.garden!.harvests).toBe(1);
    expect(harvest(a, 5, 1)).toBeNull();

    const h = bed('garden-herb-planter', 'obj_herb');
    const herb = plant(h, 0)!;
    h.garden!.growth = h.garden!.need;
    harvest(h, 4, 1);
    expect(h.garden!.crop).toBe(herb.id);
    expect(gardenStage(h.garden)).toBe(1);
    expect(h.garden!.need).toBe(herb.regrow);
  });

  it('the beds rotate through their crops', () => {
    const a = bed();
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) { a.garden = { crop: null, growth: 0, need: 0, water: 0, weeds: 0, day: 0, harvests: i }; seen.add(nextCrop(a, a.defId)!.id); }
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe('interactions in the simulation', () => {
  it('plant, water, wait days, harvest: money arrives once and the skill grows', () => {
    const { w, h } = setup();
    const o = place(w.state, w.lot, 'garden-vegpatch', 7, 0);
    h.content.objects['garden-vegpatch'] = GARDEN_OBJECTS.find((d) => d.id === 'garden-vegpatch')!;
    for (const i of GARDEN_INTERACTIONS) h.content.interactions[i.id] = i;
    const mira = w.state.people[w.mira]!;
    const run = (id: string) => {
      const r = h.sim.queue(w.mira, { interactionId: id, target: { kind: 'object', objectId: o.id, slotId: null } });
      expect(r.ok, `${id}: ${!r.ok ? r.reason : ''}`).toBe(true);
      runUntil(h, () => !mira.queue.some((a) => a.interactionId === id), 3000);
    };
    expect(h.sim.options(w.mira, { kind: 'object', objectId: o.id, slotId: null }).map((x) => x.interactionId)).toContain('gardenPlant');
    const funds0 = w.state.households[mira.householdId]!.funds;
    run('gardenPlant');
    expect(w.state.households[mira.householdId]!.funds).toBe(funds0 - 300); // seeds
    expect(o.garden!.crop).not.toBeNull();
    const xp0 = mira.skills.gardening?.xp ?? 0;
    run('gardenWater');
    expect(o.garden!.water).toBe(1);
    expect(mira.skills.gardening!.xp).toBeGreaterThan(xp0);
    // not ripe yet
    const r = h.sim.queue(w.mira, { interactionId: 'gardenHarvest', target: { kind: 'object', objectId: o.id, slotId: null } });
    expect(r.ok).toBe(false);
    // skip a week of game time: dry beds grow slowly, so water it every couple of days
    for (let d = 0; d < 9 && gardenStage(o.garden) < 3; d++) {
      w.state.clock.minutes = (dayIndex(w.state.clock.minutes) + 1) * MINUTES_PER_DAY - TICK_MINUTES; // the next tick crosses midnight
      h.sim.tick();
      water(o, 0);
    }
    expect(gardenStage(o.garden)).toBe(3);
    const before = w.state.households[mira.householdId]!.funds;
    const harvests = o.garden!.harvests;
    run('gardenHarvest');
    expect(o.garden!.harvests).toBe(harvests + 1);
    const gained = w.state.households[mira.householdId]!.funds - before;
    expect(gained).toBeGreaterThan(0);
    expect(w.state.processed[`money:harvest:${o.id}:${harvests}`]).toBeDefined();
    expect(w.state.feed.some((f) => /picked/.test(f.text))).toBe(true);
  });

  it('survives a save round trip with the garden state', () => {
    const { w } = setup();
    const o = place(w.state, w.lot, 'garden-vegpatch', 7, 0);
    plant(o, 0);
    water(o, 0);
    const copy = cloneState(w.state);
    expect(copy.lots[w.lot.id]!.objects[o.id]!.garden).toEqual(o.garden);
    expect(JSON.parse(JSON.stringify(copy)).lots[w.lot.id].objects[o.id].garden).toEqual(o.garden);
    expect(gardenOf(copy.lots[w.lot.id]!.objects[o.id]!, 0).crop).toBe(o.garden!.crop);
  });
});

/** A minimal world state holding one object (the growth step only looks at lots and their objects). */
function stateWith(o: PlacedObject): Parameters<typeof advanceGardens>[0] {
  return { lots: { lot: { objects: { [o.id]: o } } } } as unknown as Parameters<typeof advanceGardens>[0];
}
