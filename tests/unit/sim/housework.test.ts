// Cleaning, dishes, floor messes, breakdowns, repairs and the repairperson, in the small fixture world with the real
// housework interactions and tag capabilities added (the plain fixture content has no chores, so older tests are untouched).

import { describe, expect, it } from 'vitest';
import { cloneState } from '../../../src/core/state';
import type { Id } from '../../../src/core/types';
import { SKILL_BOOKS } from '../../../src/sim/behaviors';
import { breakChance, dirtOf, isBroken, homeSummary, spawnMess } from '../../../src/sim/housekeeping';
import { repairChance, repairFee } from '../../../src/sim/housework';
import { THRESHOLDS, setup } from './choreFixtures';
import type { Setup } from './choreFixtures';
import { buildWorld, finished, harness, head, pureCtx, runTicks, runUntil, setNeeds } from './fixtures';
import type { Harness } from './fixtures';

const obj = (s: Setup, key: string) => s.w.state.lots[s.w.lot.id]!.objects[s.w.objects[key]!.id]!;
const target = (id: Id) => ({ kind: 'object' as const, objectId: id, slotId: null });
const queue = (s: Setup, who: Id, interactionId: string, t: ReturnType<typeof target> | { kind: 'item'; itemId: Id } | { kind: 'self' }, data?: Record<string, string | number>) => {
  const r = s.h.sim.queue(who, { interactionId, target: t, ...(data ? { data } : {}) });
  if (!r.ok) throw new Error(`${interactionId}: ${r.reason}`);
  return r.actionId;
};
const done = (s: Setup, who: Id, interactionId: string) => finished(s.h, who, interactionId).filter((e) => e.result === 'done').length;
const skillLevel = (s: Setup, who: Id, id: string, xp: number) => { s.w.state.people[who]!.skills[id] = { level: THRESHOLDS.filter((t) => xp >= t).length + 1, xp }; };
const opt = (s: Setup, who: Id, t: Parameters<Harness['sim']['options']>[1], id: string) => s.h.sim.options(who, t).filter((o) => o.interactionId === id);

describe('dirt', () => {
  it('using a cleanable object gets it dirty, more so for someone who has not washed; untagged objects stay clean', () => {
    const s = setup();
    setNeeds(s.w.state, s.w.mira, 100);
    s.w.state.people[s.w.mira]!.needs.bladder = 10;
    queue(s, s.w.mira, 'useToilet', target(s.w.objects.toilet!.id));
    runUntil(s.h, () => done(s, s.w.mira, 'useToilet') === 1);
    const clean = dirtOf(obj(s, 'toilet'));
    expect(clean).toBeGreaterThan(0.03);
    expect(clean).toBeLessThan(0.06);
    const s2 = setup();
    setNeeds(s2.w.state, s2.w.mira, 100);
    s2.w.state.people[s2.w.mira]!.needs.bladder = 10;
    s2.w.state.people[s2.w.mira]!.needs.hygiene = 0;
    queue(s2, s2.w.mira, 'useToilet', target(s2.w.objects.toilet!.id));
    runUntil(s2.h, () => done(s2, s2.w.mira, 'useToilet') === 1);
    expect(dirtOf(obj(s2, 'toilet'))).toBeGreaterThan(clean * 1.3);
    expect(dirtOf(obj(s2, 'wardrobe'))).toBe(0);
  });

  it('a dirty shower washes less well', () => {
    const fresh = setup(), grimy = setup();
    for (const s of [fresh, grimy]) { s.w.state.people[s.w.mira]!.needs.hygiene = 20; }
    obj(grimy, 'shower').condition.dirt = 1;
    for (const s of [fresh, grimy]) { queue(s, s.w.mira, 'takeShower', target(s.w.objects.shower!.id)); runUntil(s.h, () => done(s, s.w.mira, 'takeShower') === 1); }
    const a = fresh.w.state.people[fresh.w.mira]!, b = grimy.w.state.people[grimy.w.mira]!;
    expect(b.needs.hygiene).toBeLessThan(a.needs.hygiene);
  });

  it('a dirty stove makes worse meals', () => {
    const quality = (dirt: number) => {
      const s = setup({ seed: 5 });
      obj(s, 'stove').condition.dirt = dirt;
      s.w.state.people[s.w.mira]!.needs.hunger = 20;
      s.w.state.people[s.w.mira]!.skills.cooking = { level: 10, xp: 3200 }; // no mishaps worth speaking of
      queue(s, s.w.mira, 'cookMeal', target(s.w.objects.fridge!.id));
      runUntil(s.h, () => Object.values(s.h.holder.state.items).some((i) => i.kind === 'meal'), 4 * 120);
      return Object.values(s.h.holder.state.items).find((i) => i.kind === 'meal')!.quality;
    };
    expect(quality(1)).toBeLessThan(quality(0));
  });
});

describe('cleaning', () => {
  it('offers Clean only on dirty objects, cleans them, and is faster with Handiness', () => {
    const minutes = (level: number) => {
      const s = setup();
      const toilet = obj(s, 'toilet');
      expect(opt(s, s.w.mira, target(toilet.id), 'cleanObject')).toHaveLength(0);
      toilet.condition.dirt = 0.8;
      expect(opt(s, s.w.mira, target(toilet.id), 'cleanObject')).toMatchObject([{ enabled: true, label: 'Clean' }]);
      if (level > 1) skillLevel(s, s.w.mira, 'handiness', THRESHOLDS[level - 2]!);
      const xp0 = s.w.state.people[s.w.mira]!.skills.handiness?.xp ?? 0;
      const t0 = s.w.state.clock.minutes;
      queue(s, s.w.mira, 'cleanObject', target(toilet.id));
      runUntil(s.h, () => done(s, s.w.mira, 'cleanObject') === 1);
      expect(toilet.condition.dirt).toBe(0);
      expect(s.w.state.people[s.w.mira]!.skills.handiness!.xp).toBeGreaterThan(xp0);
      expect(s.h.sim.reservations()).toEqual([]);
      return s.w.state.clock.minutes - t0;
    };
    expect(minutes(10)).toBeLessThan(minutes(1));
  });

  it('only one person cleans the same object', () => {
    const s = setup();
    obj(s, 'toilet').condition.dirt = 0.9;
    queue(s, s.w.mira, 'cleanObject', target(s.w.objects.toilet!.id));
    runTicks(s.h, 8);
    expect(opt(s, s.w.theo, target(s.w.objects.toilet!.id), 'cleanObject')).toMatchObject([{ enabled: false, reason: 'Someone else is already on it.' }]);
  });

  it('tidying up takes grime off nearby things and sweeps crumbs', () => {
    const s = setup();
    obj(s, 'stove').condition.dirt = 0.6;
    obj(s, 'counter').condition.dirt = 0.5;
    const loc = s.w.state.people[s.w.mira]!.location;
    expect(loc.kind).toBe('lot');
    // stand in the kitchen
    s.w.state.people[s.w.mira]!.location = { kind: 'lot', lotId: s.w.lot.id, level: 0, x: 2.5, z: 2.5, facing: 0, posture: 'standing' };
    spawnMess(pureCtx(s.h), s.w.lot.id, 0, 3.5, 2.5, 'crumbs', 0.3);
    queue(s, s.w.mira, 'tidyUp', { kind: 'self' });
    runUntil(s.h, () => done(s, s.w.mira, 'tidyUp') === 1);
    expect(dirtOf(obj(s, 'stove'))).toBeCloseTo(0.4, 5);
    expect(dirtOf(obj(s, 'counter'))).toBeCloseTo(0.3, 5);
    expect(Object.values(s.w.state.items).filter((i) => i.kind === 'mess')).toHaveLength(0);
    // nothing left to tidy: refused with a reason
    expect(opt(s, s.w.mira, { kind: 'self' }, 'tidyUp')[0]).toMatchObject({ enabled: true });
    obj(s, 'stove').condition.dirt = 0;
    obj(s, 'counter').condition.dirt = 0;
    expect(opt(s, s.w.mira, { kind: 'self' }, 'tidyUp')[0]).toMatchObject({ enabled: false, reason: 'Nothing to tidy here.' });
  });
});

describe('dishes and floor messes', () => {
  function eatOne(s: Setup): void {
    const hunger = s.w.state.people[s.w.mira]!;
    hunger.needs.hunger = 15;
    queue(s, s.w.mira, 'cookMeal', target(s.w.objects.fridge!.id));
    runUntil(s.h, () => done(s, s.w.mira, 'eatMeal') === 1, 4 * 200);
  }

  it('eating leaves dirty plates (merged per surface) that are washed at the sink and then gone', () => {
    const s = setup({ seed: 9 });
    eatOne(s);
    const dishes = Object.values(s.w.state.items).filter((i) => i.kind === 'dishes');
    expect(dishes).toHaveLength(1);
    expect(dishes[0]).toMatchObject({ portions: 1, recipeId: 'pasta', ownerHouseholdId: s.w.state.people[s.w.mira]!.householdId });
    expect(dishes[0]!.position.onObjectId).toBe(s.w.objects.table!.id);
    expect(homeSummary(pureCtx(s.h), s.w.lot.id).dishes).toBe(1);
    const menu = s.h.sim.options(s.w.mira, { kind: 'item', itemId: dishes[0]!.id });
    expect(menu.map((o) => o.interactionId)).toEqual(['washDishes']);
    queue(s, s.w.mira, 'washDishes', { kind: 'item', itemId: dishes[0]!.id });
    runUntil(s.h, () => done(s, s.w.mira, 'washDishes') === 1);
    expect(Object.values(s.w.state.items).filter((i) => i.kind === 'dishes')).toHaveLength(0);
    expect(s.h.sim.reservations()).toEqual([]);
    expect(dirtOf(s.w.state.lots[s.w.lot.id]!.objects[s.sink]!)).toBeGreaterThan(0);
  });

  it('cancelling a wash keeps the dishes and releases everything; a broken sink refuses with a reason', () => {
    const s = setup({ seed: 9 });
    eatOne(s);
    const item = Object.values(s.w.state.items).find((i) => i.kind === 'dishes')!;
    const id = queue(s, s.w.mira, 'washDishes', { kind: 'item', itemId: item.id });
    runUntil(s.h, () => head(s.h, s.w.mira)?.data.stage === 1 && head(s.h, s.w.mira)?.phase === 'perform');
    s.h.sim.cancel(s.w.mira, id);
    runUntil(s.h, () => !head(s.h, s.w.mira));
    expect(s.w.state.items[item.id]).toBeDefined();
    expect(s.h.sim.reservations()).toEqual([]);
    s.w.state.lots[s.w.lot.id]!.objects[s.sink]!.condition.broken = true;
    expect(s.h.sim.options(s.w.mira, { kind: 'item', itemId: item.id })[0]).toMatchObject({ enabled: false, reason: 'No working sink or dishwasher.' });
  });

  it('a floor mess can be mopped up; mess items are capped and merge on one tile', () => {
    const s = setup();
    const ctx = pureCtx(s.h);
    const m = spawnMess(ctx, s.w.lot.id, 0, 8.5, 8.5, 'puddle', 0.4)!;
    expect(spawnMess(ctx, s.w.lot.id, 0, 8.2, 8.9, 'puddle', 0.4)).toBe(m);
    expect(m.quality).toBeGreaterThan(0.4);
    expect(s.h.sim.options(s.w.mira, { kind: 'item', itemId: m.id }).map((o) => o.interactionId)).toEqual(['mopFloor']);
    queue(s, s.w.mira, 'mopFloor', { kind: 'item', itemId: m.id });
    runUntil(s.h, () => done(s, s.w.mira, 'mopFloor') === 1);
    expect(s.w.state.items[m.id]).toBeUndefined();
    for (let i = 0; i < 20; i++) spawnMess(ctx, s.w.lot.id, 0, 1.5 + (i % 10), 9.5 + Math.floor(i / 10), 'spill', 0.3);
    expect(Object.values(s.w.state.items).filter((i) => i.kind === 'mess').length).toBeLessThanOrEqual(10);
  });

  it('an empty bladder away from the toilet is an accident: puddle, mood and a reset bladder', () => {
    const s = setup();
    const mira = s.w.state.people[s.w.mira]!;
    mira.needs.bladder = 0;
    mira.needs.hygiene = 60;
    runTicks(s.h, 2);
    expect(mira.needs.bladder).toBeGreaterThan(40);
    expect(mira.needs.hygiene).toBeLessThan(50);
    expect(mira.moodlets.some((m) => m.id === 'accident')).toBe(true);
    expect(Object.values(s.w.state.items).some((i) => i.kind === 'mess' && i.recipeId === 'puddle')).toBe(true);
    expect(s.w.state.feed.at(-1)!.text).toMatch(/didn't make it/);
  });
});

describe('breakdowns', () => {
  it('break chance depends on quality, wear and age; non-repairable objects never break', () => {
    const s = setup();
    const ctx = pureCtx(s.h);
    const ref = (key: string) => ({ obj: obj(s, key), def: s.content.objects[obj(s, key).defId]! });
    expect(breakChance(ctx, ref('wardrobe'))).toBe(0);
    const base = breakChance(ctx, ref('toilet'));
    expect(base).toBeGreaterThan(0);
    expect(base).toBeLessThan(0.02);
    obj(s, 'toilet').condition.wear = 1;
    expect(breakChance(ctx, ref('toilet'))).toBeGreaterThan(base * 3);
    s.content.objects['toilet-basic']!.quality = 5;
    expect(breakChance(ctx, ref('toilet'))).toBeLessThan(base * 3);
  });

  it('a certain breakdown makes the object unusable with the reason "Broken", is reported once and can still be cleaned', () => {
    const s = setup();
    const tv = obj(s, 'tv');
    tv.condition.wear = 1;
    // force the roll: the chance is far below 1, so draw uses until it breaks (deterministic for the seed)
    for (let i = 0; i < 400 && !isBroken(tv); i++) {
      queue(s, s.w.mira, 'watchTv', target(tv.id));
      runUntil(s.h, () => !head(s.h, s.w.mira), 4 * 80);
    }
    expect(isBroken(tv)).toBe(true);
    expect(s.w.state.feed.filter((f) => /broke down/.test(f.text))).toHaveLength(1);
    const watch = opt(s, s.w.mira, target(tv.id), 'watchTv')[0]!;
    expect(watch).toMatchObject({ enabled: false, reason: 'Broken' });
    const r = s.h.sim.queue(s.w.mira, { interactionId: 'watchTv', target: target(tv.id) });
    expect(r).toEqual({ ok: false, reason: 'Broken' });
    expect(opt(s, s.w.mira, target(tv.id), 'repairObject')).toMatchObject([{ enabled: true }]);
    expect(opt(s, s.w.mira, target(tv.id), 'callRepairperson')[0]!.label).toBe('Call a Repairperson ($85)');
    tv.condition.dirt = 0.5;
    expect(opt(s, s.w.mira, target(tv.id), 'cleanObject')).toHaveLength(0); // the TV is not cleanable
    obj(s, 'toilet').condition.broken = true;
    obj(s, 'toilet').condition.dirt = 0.5;
    expect(opt(s, s.w.mira, target(s.w.objects.toilet!.id), 'cleanObject')[0]).toMatchObject({ enabled: true });
    expect(opt(s, s.w.mira, target(s.w.objects.toilet!.id), 'useToilet')[0]).toMatchObject({ enabled: false, reason: 'Broken' });
  });

  it('a broken stove or fridge stops cooking with a clear reason', () => {
    const s = setup();
    obj(s, 'stove').condition.broken = true;
    const cook = opt(s, s.w.mira, target(s.w.objects.fridge!.id), 'cookMeal')[0]!;
    expect(cook).toMatchObject({ enabled: false, reason: 'The stove is broken.' });
    obj(s, 'stove').condition.broken = false;
    obj(s, 'fridge').condition.broken = true;
    expect(opt(s, s.w.mira, target(s.w.objects.fridge!.id), 'cookMeal')[0]).toMatchObject({ enabled: false, reason: 'Broken' });
  });
});

describe('repairs', () => {
  const breakIt = (s: Setup, key: string) => { obj(s, key).condition.broken = true; };

  it('repairs always succeed within a few attempts, never lock anyone up, train Handiness, and failures can shock', () => {
    const s = setup({ seed: 3 });
    breakIt(s, 'computer');
    const mira = s.w.state.people[s.w.mira]!;
    let attempts = 0;
    while (isBroken(obj(s, 'computer')) && attempts < 12) {
      mira.needs.energy = 100;
      queue(s, s.w.mira, 'repairObject', target(s.w.objects.computer!.id));
      runUntil(s.h, () => done(s, s.w.mira, 'repairObject') === attempts + 1, 4 * 120);
      attempts++;
    }
    expect(isBroken(obj(s, 'computer'))).toBe(false);
    expect(attempts).toBeLessThanOrEqual(7);
    expect(mira.skills.handiness!.xp).toBeGreaterThan(40 * attempts / 2);
    expect(s.h.sim.reservations()).toEqual([]);
    expect(s.w.state.feed.some((f) => /fixed the desktop computer|fixed the computer/.test(f.text))).toBe(true);
  });

  it('success chance and time improve with Handiness; earlier failures add a guarantee; skills help specific repairs', () => {
    const s = setup();
    const mira = s.w.state.people[s.w.mira]!;
    const comp = { obj: obj(s, 'computer'), def: s.content.objects['computer-desktop']! };
    const toilet = { obj: obj(s, 'toilet'), def: s.content.objects['toilet-basic']! };
    const base = repairChance(mira, comp);
    mira.skills.handiness = { level: 10, xp: 3200 };
    expect(repairChance(mira, comp)).toBeGreaterThan(base + 0.4);
    mira.skills.handiness = { level: 1, xp: 0 };
    mira.skills.programming = { level: 10, xp: 3200 };
    expect(repairChance(mira, comp)).toBeGreaterThan(base + 0.2);
    expect(repairChance(mira, toilet)).toBeLessThan(repairChance(mira, comp)); // programming only helps electronics
    comp.obj.condition.fails = 6;
    expect(repairChance(mira, comp)).toBe(0.98);
  });

  it('is deterministic: the same seed repairs the same way, also across a save and load', () => {
    const run = (reload: boolean) => {
      const s = setup({ seed: 77 });
      breakIt(s, 'toilet');
      queue(s, s.w.mira, 'repairObject', target(s.w.objects.toilet!.id));
      runTicks(s.h, 60);
      if (reload) { s.h.holder.state = cloneState(s.h.holder.state); s.h.sim.rebuild(); }
      runTicks(s.h, 4 * 200);
      const st = s.h.holder.state;
      return JSON.stringify([st.lots[s.w.lot.id]!.objects[s.w.objects.toilet!.id]!.condition, st.rng, st.people[s.w.mira]!.skills]);
    };
    expect(run(false)).toBe(run(false));
    expect(run(true)).toBe(run(false));
  });

  it('calling a repairperson charges the fee exactly once and the object is fixed after a delay', () => {
    const s = setup({ funds: 100000 });
    breakIt(s, 'shower');
    const hh = s.w.state.households[s.w.state.activeHouseholdId]!;
    const before = hh.funds;
    queue(s, s.w.mira, 'callRepairperson', target(s.w.objects.shower!.id));
    runUntil(s.h, () => done(s, s.w.mira, 'callRepairperson') === 1);
    expect(hh.funds).toBe(before - 8500);
    expect(hh.ledger.filter((l) => l.kind === 'repair')).toHaveLength(1);
    expect(s.h.sim.queue(s.w.theo, { interactionId: 'callRepairperson', target: target(s.w.objects.shower!.id) })).toEqual({ ok: false, reason: 'A repairperson is already on the way.' });
    expect(isBroken(obj(s, 'shower'))).toBe(true);
    runUntil(s.h, () => !isBroken(obj(s, 'shower')), 4 * 60 * 4);
    expect(hh.funds).toBe(before - 8500);
    expect(s.w.state.feed.at(-1)!.text).toBe('The repairperson fixed the shower stall.');
    expect(s.w.state.schedule.filter((e) => e.kind === 'custom')).toHaveLength(0);
    // survives save/load in the middle: the due event is applied once
    const s2 = setup({ funds: 100000 });
    breakIt(s2, 'shower');
    queue(s2, s2.w.mira, 'callRepairperson', target(s2.w.objects.shower!.id));
    runUntil(s2.h, () => done(s2, s2.w.mira, 'callRepairperson') === 1);
    s2.h.holder.state = cloneState(s2.h.holder.state);
    s2.h.sim.rebuild();
    runUntil(s2.h, () => !isBroken(s2.h.holder.state.lots[s2.w.lot.id]!.objects[s2.w.objects.shower!.id]!), 4 * 60 * 4);
    expect(s2.h.holder.state.households[s2.w.state.activeHouseholdId]!.ledger.filter((l) => l.kind === 'repair')).toHaveLength(1);
  });

  it('without the money the call is refused with the amount, and Charisma lowers the fee', () => {
    const s = setup({ funds: 5000 });
    breakIt(s, 'shower');
    expect(opt(s, s.w.mira, target(s.w.objects.shower!.id), 'callRepairperson')[0]).toMatchObject({ enabled: false, reason: 'Not enough money ($85.00).' });
    const mira = s.w.state.people[s.w.mira]!;
    const fee0 = repairFee(mira);
    mira.skills.charisma = { level: 10, xp: 3200 };
    expect(repairFee(mira)).toBe(Math.round(fee0 * 0.82));
    expect(Number.isInteger(repairFee(mira))).toBe(true);
  });

  it('servicing removes wear', () => {
    const s = setup();
    obj(s, 'toilet').condition.wear = 0.7;
    expect(opt(s, s.w.mira, target(s.w.objects.fridge!.id), 'serviceObject')).toHaveLength(0);
    queue(s, s.w.mira, 'serviceObject', target(s.w.objects.toilet!.id));
    runUntil(s.h, () => done(s, s.w.mira, 'serviceObject') === 1);
    expect(obj(s, 'toilet').condition.wear).toBeCloseTo(0.2, 5);
    expect(s.w.state.people[s.w.mira]!.skills.handiness!.xp).toBeGreaterThan(0);
  });
});

describe('skill books', () => {
  it('offer a book per skill, train it up to level 5 and then say there is nothing new', () => {
    const s = setup();
    const opts = opt(s, s.w.mira, target(s.w.objects.bookcase!.id), 'readSkillBook');
    expect(opts.map((o) => o.label)).toEqual(Object.values(SKILL_BOOKS).map((t) => `Study: ${t}`));
    const handy = opts.find((o) => o.data?.skillId === 'handiness')!;
    expect(handy.enabled).toBe(true);
    queue(s, s.w.mira, 'readSkillBook', target(s.w.objects.bookcase!.id), { skillId: 'handiness' });
    runUntil(s.h, () => done(s, s.w.mira, 'readSkillBook') === 1, 4 * 120);
    expect(s.w.state.people[s.w.mira]!.skills.handiness!.xp).toBeGreaterThan(20);
    expect(s.w.state.people[s.w.mira]!.skills.logic).toBeUndefined();
    s.w.state.people[s.w.mira]!.skills.handiness = { level: 5, xp: 1000 };
    expect(opt(s, s.w.mira, target(s.w.objects.bookcase!.id), 'readSkillBook').find((o) => o.data?.skillId === 'handiness')).toMatchObject({ enabled: false });
    expect(s.h.sim.queue(s.w.mira, { interactionId: 'readSkillBook', target: target(s.w.objects.bookcase!.id) })).toMatchObject({ ok: false, reason: 'Choose a book to study.' });
  });
});

describe('autonomy', () => {
  const choresDone = (traits: string[], hours = 6) => {
    const s = setup({ autonomy: true, miraTraits: traits, seed: 11 });
    s.w.state.settings.autonomyLevel = 1;
    for (const k of ['toilet', 'shower', 'stove', 'counter', 'table']) obj(s, k).condition.dirt = 0.55;
    const theo = s.w.state.people[s.w.theo]!;
    theo.queue = [];
    for (let i = 0; i < hours * 60 * 4; i++) {
      runTicks(s.h, 1);
      for (const id of [s.w.mira]) for (const n of Object.keys(s.w.state.people[id]!.needs) as Array<keyof typeof theo.needs>) s.w.state.people[id]!.needs[n] = Math.max(s.w.state.people[id]!.needs[n], 70);
    }
    return finished(s.h, s.w.mira).filter((e) => e.result === 'done' && ['cleanObject', 'tidyUp', 'washDishes', 'mopFloor'].includes(e.interactionId)).length;
  };

  it('tidy people clean much more than messy ones', () => {
    const neat = choresDone(['neat']), messy = choresDone(['messy']);
    expect(neat).toBeGreaterThan(messy);
    expect(neat).toBeGreaterThanOrEqual(3);
  });

  it('broken essentials get repaired without being asked, by hand or by a repairperson, and never loop', () => {
    const s = setup({ autonomy: true, seed: 21, funds: 300000 });
    obj(s, 'toilet').condition.broken = true;
    runUntil(s.h, () => !isBroken(obj(s, 'toilet')), 4 * 60 * 10);
    const attempts = [s.w.mira, s.w.theo].flatMap((id) => finished(s.h, id, 'repairObject'));
    expect(attempts.length).toBeLessThanOrEqual(7);
    expect(s.h.sim.reservations().filter((r) => r.includes('toilet'))).toEqual([]);
  });
});

describe('home moods', () => {
  it('a spotless home is Fresh and Clean; dirty dishes and a filthy bathroom are not', () => {
    const s = setup();
    const moods = () => s.w.state.people[s.w.mira]!.moodlets.map((m) => m.id);
    runUntil(s.h, () => s.w.state.clock.minutes % 20 === 0 && s.w.state.clock.minutes > s.w.state.clock.minutes - 1 && moods().includes('freshHome'), 200);
    obj(s, 'toilet').condition.dirt = 0.9;
    runTicks(s.h, 4 * 20);
    expect(moods()).toContain('dirtyBathroom');
    expect(moods()).not.toContain('freshHome');
    obj(s, 'toilet').condition.dirt = 0;
    const table = s.w.state.lots[s.w.lot.id]!.objects[s.w.objects.table!.id]!;
    const ctx = pureCtx(s.h);
    ctx.state.items.itm_dish = { id: 'itm_dish', kind: 'dishes', lotId: s.w.lot.id, position: { x: 2.5, z: 4.5, level: 0, onObjectId: table.id }, recipeId: 'pasta', portions: 4, quality: 1, createdAt: 0, spoilsAt: 9e9, ownerHouseholdId: null };
    runTicks(s.h, 4 * 20);
    expect(moods()).toContain('dirtyKitchen');
    expect(moods()).not.toContain('dirtyBathroom');
    obj(s, 'stove').condition.broken = true;
    runTicks(s.h, 4 * 20);
    expect(moods()).toContain('brokenThings');
  });
});

describe('without chores in the content nothing changes', () => {
  it('objects do not get dirty or break and no dishes appear', () => {
    const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
    const h = harness(w.state);
    setNeeds(w.state, w.mira, 70);
    w.state.people[w.mira]!.needs.hunger = 15;
    h.sim.queue(w.mira, { interactionId: 'cookMeal', target: { kind: 'object', objectId: w.objects.fridge!.id, slotId: null } });
    runUntil(h, () => finished(h, w.mira, 'eatMeal').length === 1, 4 * 200);
    expect(Object.values(w.state.items).every((i) => i.kind === 'meal')).toBe(true);
    expect(Object.values(w.state.lots[w.lot.id]!.objects).every((o) => o.condition.dirt === 0 && !o.condition.broken)).toBe(true);
  });
});

