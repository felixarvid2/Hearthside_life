// Milestone 11, task B: Baking, Wellness and Creativity. Content checks against the real registries, the skill
// effects as pure numbers, and simulation tests for the bake chain (charged once, secondary Creativity xp),
// the wellness practice objects, level gating and a simulated week of practice for each skill.

import { describe, expect, it } from 'vitest';
import { content } from '../../../src/content/index';
import { INTERACTIONS } from '../../../src/content/interactions';
import { OBJECTS } from '../../../src/content/objects';
import { RECIPES } from '../../../src/content/recipes';
import { SKILLS } from '../../../src/content/skills';
import {
  bakingMishap, bakingQuality, bakingTime, creativityFun, creativityPay, wellnessDecay, wellnessStress,
} from '../../../src/content/skillEffects';
import type { ContentDB, InteractionDef, ObjectDef, ObjectSlot, RecipeDef, SkillDef } from '../../../src/content/types';
import { atDayMinute } from '../../../src/core/clock';
import { computeMood } from '../../../src/sim/mood';
import { decayNeeds } from '../../../src/sim/needs';
import { freelanceFee } from '../../../src/sim/behaviors';
import { performRates } from '../../../src/sim/steps';
import type { Person } from '../../../src/core/types';
import {
  buildWorld, fixtureContent, harness, head, place, pureCtx, runTicks, runUntil, setNeeds,
} from './fixtures';
import type { FixtureWorld, Harness } from './fixtures';

const db = content();
const REAL_READY = (x: { status: string }) => x.status === 'ready';

describe('Milestone 11 task B content', () => {
  it('ships Baking, Wellness and Creativity as ready skills with ten levels', () => {
    for (const id of ['baking', 'wellness', 'creativity']) {
      const s = db.skills[id];
      expect(s, id).toBeDefined();
      expect(s!.status).toBe('ready');
      expect(s!.thresholds).toHaveLength(9);
    }
    // Every unlock promised by the three skills is real content or a real effect constant.
    const baking = SKILLS.find((s) => s.id === 'baking')!;
    const wellness = SKILLS.find((s) => s.id === 'wellness')!;
    const creativity = SKILLS.find((s) => s.id === 'creativity')!;
    for (const s of [baking, wellness, creativity]) {
      expect(s.unlocks.length).toBeGreaterThanOrEqual(3);
      for (const u of s.unlocks) expect(u.text.length).toBeGreaterThan(10);
    }
    expect(baking.unlocks.some((u) => u.text.includes('Berry Muffins'))).toBe(true);
    expect(baking.unlocks.some((u) => u.text.includes('Apple Pie'))).toBe(true);
    expect(wellness.unlocks.some((u) => u.level === 1 && u.text.includes('Meditate'))).toBe(true);
    expect(creativity.unlocks.some((u) => u.level === 2 && u.text.includes('also train Creativity'))).toBe(true);
  });

  it('adds five baking recipes with their own skill and increasing levels', () => {
    const baked = RECIPES.filter((r) => r.skill === 'baking');
    expect(baked.map((r) => r.id)).toEqual(['rustic-bread', 'berry-muffins', 'buttermilk-scones', 'celebration-cake', 'apple-pie']);
    expect(baked.every(REAL_READY)).toBe(true);
    expect(baked.map((r) => r.minCookingLevel)).toEqual([1, 2, 3, 5, 7]);
    for (const r of baked) expect(db.skills[r.skill!]).toBeDefined();
  });

  it('offers the practice interactions from real objects', () => {
    const offered = (id: string) => OBJECTS.filter((o) => o.status === 'ready' && o.interactions.includes(id)).map((o) => o.id);
    for (const stove of ['stove-basic', 'stove-electric', 'bread-oven']) {
      expect(offered('bakeTreat'), stove).toContain(stove);
      expect(offered('sellBakes'), stove).toContain(stove);
    }
    expect(offered('doYoga')).toContain('yoga-mat');
    expect(offered('stretch')).toContain('yoga-mat');
    expect(offered('sketchIdeas')).toContain('sketchbook');
    const mat = db.objects['yoga-mat']!;
    expect(mat.layer).toBe('rug');
    expect(mat.blocksMovement).toBe(false);
    const oven = db.objects['bread-oven']!;
    expect(oven.stats.baking).toBeGreaterThan(db.objects['stove-electric']!.stats.baking!);
  });

  it('trains Creativity as a secondary skill and gates selling bakes at Baking 5', () => {
    const byId = new Map(INTERACTIONS.map((i) => [i.id, i]));
    for (const id of ['paintCanvas', 'playPiano', 'writeArticle', 'writeBook', 'paintToSell', 'busk', 'bakeTreat']) {
      expect(byId.get(id)!.secondarySkill, id).toEqual({ id: 'creativity', fraction: 0.35 });
    }
    expect(byId.get('sellBakes')!.requiresSkill).toEqual({ id: 'baking', level: 5 });
    expect(byId.get('meditate')!.venues).toContain('home');
  });

  it('keeps the effect numbers the skill texts promise', () => {
    expect(bakingQuality(1)).toBeCloseTo(0.45);
    expect(bakingQuality(10)).toBeCloseTo(0.9);
    expect(bakingMishap(1)).toBeCloseTo(0.2);
    expect(bakingMishap(10)).toBe(0);
    expect(bakingTime(10)).toBeCloseTo(0.78);
    expect(wellnessDecay(10)).toBeCloseTo(0.91);
    expect(wellnessStress(10)).toBeCloseTo(0.73);
    expect(creativityFun(10)).toBeCloseTo(1.27);
    expect(creativityPay(10)).toBeCloseTo(1.36);
  });

  it('pays creative freelance work more with Creativity, but not programming', () => {
    expect(freelanceFee('sellBakes', 5, 10)).toBeGreaterThan(freelanceFee('sellBakes', 5, 1));
    expect(freelanceFee('sellBakes', 5, 10) / freelanceFee('sellBakes', 5, 1)).toBeCloseTo(1.36, 1);
    expect(freelanceFee('programGig', 5, 10)).toBe(freelanceFee('programGig', 5, 1));
  });
});

// ---------------------------------------------------------------------------------------------
// Simulation with a small content DB that mirrors the real M11 pieces
// ---------------------------------------------------------------------------------------------

const THRESHOLDS = [100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];
const recipe = (id: string, name: string, minutes: number, cost: number, hunger: number, level: number): RecipeDef =>
  ({ id, name, description: name, minutes, cost, servings: 4, hunger, minCookingLevel: level, skill: 'baking', status: 'ready' });

const slot = (id: string, kind: ObjectSlot['kind'], pos: [number, number], approach: [number, number], posture: ObjectSlot['posture'], facing = 0): ObjectSlot =>
  ({ id, kind, pos, approach, posture, facing, height: 0 });

function inter(id: string, o: Partial<InteractionDef>): InteractionDef {
  return {
    id, name: id, description: id, icon: id, kind: 'object', slotKinds: [], anims: { perform: 'interact' }, posture: 'standing',
    duration: { kind: 'fixed', minutes: 10 }, needsPerHour: {}, needsOnComplete: {}, autonomy: { enabled: false, ads: {}, tags: [] },
    allowVisitors: false, status: 'ready', ...o,
  };
}

function obj(id: string, o: Partial<ObjectDef> & { footprint: { w: number; d: number } }): ObjectDef {
  return {
    id, name: id, description: id, category: 'decor', rooms: [], style: 'test', tags: [], packs: [], tier: 'standard',
    price: 10000, quality: 3, functional: true, model: { asset: id, scale: 2, offset: [0, 0, 0], yaw: 0 }, layer: 'floor',
    blocksMovement: true, height: 1, slots: [], interactions: [], stats: {}, finishes: [], status: 'ready', ...o,
  };
}

function m11Content(): ContentDB {
  const c = fixtureContent();
  for (const id of ['baking', 'wellness', 'creativity']) {
    c.skills[id] = {
      id, name: id[0]!.toUpperCase() + id.slice(1), icon: 'star', description: id, thresholds: [...THRESHOLDS], unlocks: [], status: 'ready',
    } as SkillDef;
  }
  c.moodlets.proudBake = { id: 'proudBake', name: 'Proud Baker', description: '', icon: 'star', value: 8, minutes: 180 };
  c.moodlets.calm = { id: 'calm', name: 'Calm', description: '', icon: 'heart', value: 10, minutes: 180 };
  c.moodlets.inspired = { id: 'inspired', name: 'Inspired', description: '', icon: 'star', value: 8, minutes: 180 };
  c.recipes['rustic-bread'] = recipe('rustic-bread', 'Rustic Loaf', 30, 600, 40, 1);
  c.recipes['apple-pie'] = recipe('apple-pie', 'Apple Pie', 60, 1600, 46, 7);

  c.interactions.bakeTreat = inter('bakeTreat', {
    behavior: 'bake', slotKinds: ['use'], anims: { perform: 'cook' }, duration: { kind: 'fixed', minutes: 30 },
    needsPerHour: { fun: 8, energy: -2 }, skill: { id: 'baking', xpPerHour: 55 },
    secondarySkill: { id: 'creativity', fraction: 0.35 }, moodletOnComplete: 'proudBake',
    autonomy: { enabled: true, ads: { fun: 8 }, tags: ['baking', 'creative'] },
  });
  c.interactions.sellBakes = inter('sellBakes', {
    behavior: 'freelance', slotKinds: ['use'], duration: { kind: 'fixed', minutes: 45 }, skill: { id: 'baking', xpPerHour: 45 },
    requiresSkill: { id: 'baking', level: 5 },
  });
  c.interactions.meditate = inter('meditate', {
    kind: 'self', behavior: 'generic', posture: 'seated', anims: { prepare: 'sitDown', perform: 'sitIdle', cleanup: 'standUp' },
    duration: { kind: 'fixed', minutes: 30 }, needsPerHour: { fun: 5, energy: 2 }, skill: { id: 'wellness', xpPerHour: 45 },
    moodletOnComplete: 'calm', venues: ['home'],
  });
  c.interactions.doYoga = inter('doYoga', {
    behavior: 'generic', slotKinds: ['use'], anims: { perform: 'exercise' }, duration: { kind: 'fixed', minutes: 40 },
    needsPerHour: { fun: 8, energy: -3, hygiene: -3 }, skill: { id: 'wellness', xpPerHour: 60 }, moodletOnComplete: 'calm',
    allowVisitors: true,
  });
  c.interactions.stretch = inter('stretch', {
    behavior: 'generic', slotKinds: ['use'], anims: { perform: 'exercise' }, duration: { kind: 'fixed', minutes: 15 },
    needsPerHour: { fun: 6, energy: 1 }, skill: { id: 'wellness', xpPerHour: 40 },
  });
  c.interactions.sketchIdeas = inter('sketchIdeas', {
    behavior: 'computer', slotKinds: ['use'], posture: 'seated', anims: { perform: 'interact' },
    duration: { kind: 'fixed', minutes: 45 }, needsPerHour: { fun: 12, energy: -2 }, skill: { id: 'creativity', xpPerHour: 55 },
    moodletOnComplete: 'inspired', allowVisitors: true,
  });

  c.objects['stove-basic']!.interactions.push('bakeTreat', 'sellBakes');
  c.objects['stove-basic']!.stats.baking = 1;
  c.objects['yoga-mat'] = obj('yoga-mat', {
    footprint: { w: 1, d: 2 }, layer: 'rug', blocksMovement: false, interactions: ['doYoga', 'stretch'],
    slots: [slot('use', 'use', [0.5, 1], [0, 0], 'standing', Math.PI)],
  });
  c.objects['sketchbook'] = obj('sketchbook', {
    footprint: { w: 1, d: 1 }, layer: 'surface', blocksMovement: false, interactions: ['sketchIdeas'],
    slots: [slot('use', 'use', [0.5, 1.3], [0, 1], 'standing')],
  });
  return c;
}

function m11World(): { w: FixtureWorld; h: Harness } {
  const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
  const c = m11Content();
  // The fixture places its furniture with the base content; add the M11 objects now that the harness uses M11 content.
  const mat = place(w.state, w.lot, 'yoga-mat', 7, 9);
  place(w.state, w.lot, 'sketchbook', 4, 9, 0, w.objects.desk!.id);
  (w.objects as Record<string, { id: string }>).yogaMat = mat;
  return { w, h: harness(w.state, c) };
}

const person = (h: Harness, id: string): Person => h.holder.state.people[id]!;
const funds = (h: Harness) => Object.values(h.holder.state.households).find((x) => x.isPlayable)!.funds;
const ledger = (h: Harness) => Object.values(h.holder.state.households).find((x) => x.isPlayable)!.ledger;

type Target = { kind: 'object'; objectId: string } | { kind: 'self' };

function queue(h: Harness, personId: string, interactionId: string, target: Target) {
  const full = target.kind === 'object' ? { ...target, slotId: null } : target;
  const r = h.sim.queue(personId, { interactionId, target: full });
  if (!r.ok) throw new Error(r.reason);
  return r.actionId;
}

describe('baking', () => {
  it('bakes at the stove: ingredients charged once, a batch served, Baking and a little Creativity trained', () => {
    const { w, h } = m11World();
    setNeeds(w.state, w.mira, 70);
    const start = funds(h);
    queue(h, w.mira, 'bakeTreat', { kind: 'object', objectId: w.objects.stove!.id });
    runUntil(h, () => Object.values(h.holder.state.items).some((it) => it.kind === 'meal'), 600);

    const batch = Object.values(h.holder.state.items).find((it) => it.kind === 'meal')!;
    expect(batch.recipeId).toBe('rustic-bread');
    expect(batch.ownerHouseholdId).toBe(person(h, w.mira).householdId);
    expect(batch.quality).toBeGreaterThan(0.2);
    expect(batch.quality).toBeLessThanOrEqual(0.55);
    expect(ledger(h).filter((l) => l.kind === 'groceries')).toHaveLength(1);
    expect(ledger(h).find((l) => l.kind === 'groceries')!.amount).toBe(-600);
    expect(funds(h)).toBe(start - 600);

    const baking = person(h, w.mira).skills.baking!;
    const creativity = person(h, w.mira).skills.creativity!;
    expect(baking.xp).toBeGreaterThan(20);
    expect(creativity.xp).toBeCloseTo(baking.xp * 0.35, 1);
    expect(person(h, w.mira).moodlets.some((m) => m.id === 'proudBake')).toBe(true);
    runUntil(h, () => !head(h, w.mira), 600);
    expect(h.sim.reservations()).toEqual([]);
  });

  it('charges nothing when the bake is cancelled before it starts', () => {
    const { w, h } = m11World();
    const start = funds(h);
    const id = queue(h, w.mira, 'bakeTreat', { kind: 'object', objectId: w.objects.stove!.id });
    runTicks(h, 1);
    h.sim.cancel(w.mira, id);
    runUntil(h, () => !head(h, w.mira), 20);
    expect(funds(h)).toBe(start);
    expect(ledger(h).filter((l) => l.kind === 'groceries')).toHaveLength(0);
    expect(Object.keys(h.holder.state.items)).toHaveLength(0);
  });

  it('gates selling a box of bakes at Baking 5 and pays the sale once', () => {
    const { w, h } = m11World();
    const p = person(h, w.mira);
    p.skills.baking = { level: 4, xp: 699 };
    const blocked = h.sim.queue(w.mira, { interactionId: 'sellBakes', target: { kind: 'object', objectId: w.objects.stove!.id, slotId: null } });
    expect(blocked).toEqual({ ok: false, reason: 'Needs Baking level 5.' });

    p.skills.baking = { level: 5, xp: 700 };
    p.skills.creativity = { level: 1, xp: 0 };
    const start = funds(h);
    queue(h, w.mira, 'sellBakes', { kind: 'object', objectId: w.objects.stove!.id });
    runUntil(h, () => ledger(h).some((l) => l.kind === 'sale'), 600);
    const sales = ledger(h).filter((l) => l.kind === 'sale');
    expect(sales).toHaveLength(1);
    expect(sales[0]!.amount).toBe(freelanceFee('sellBakes', 5, 1));
    expect(funds(h)).toBe(start + sales[0]!.amount);
    expect(sales[0]!.occurrence).toMatch(/^freelance:/);
  });
});

describe('wellness and creativity practice', () => {
  it('meditates anywhere at home and does yoga on the mat, both training Wellness', () => {
    const { w, h } = m11World();
    setNeeds(w.state, w.mira, 70);
    queue(h, w.mira, 'meditate', { kind: 'self' });
    runUntil(h, () => !head(h, w.mira), 400);
    expect(person(h, w.mira).skills.wellness?.xp ?? 0).toBeGreaterThan(0);
    expect(person(h, w.mira).moodlets.some((m) => m.id === 'calm')).toBe(true);

    const before = person(h, w.mira).skills.wellness!.xp;
    queue(h, w.mira, 'doYoga', { kind: 'object', objectId: (w.objects as Record<string, { id: string }>).yogaMat!.id });
    runUntil(h, () => !head(h, w.mira), 500);
    expect(person(h, w.mira).skills.wellness!.xp).toBeGreaterThan(before);
    const stretched = h.sim.queue(w.mira, { interactionId: 'stretch', target: { kind: 'object', objectId: (w.objects as Record<string, { id: string }>).yogaMat!.id, slotId: null } });
    expect(stretched.ok).toBe(true);
  });

  it('sketches ideas in the sketchbook for Creativity', () => {
    const { w, h } = m11World();
    setNeeds(w.state, w.mira, 70);
    const book = Object.values(w.lot.objects).find((o) => o.defId === 'sketchbook')!;
    queue(h, w.mira, 'sketchIdeas', { kind: 'object', objectId: book.id });
    runUntil(h, () => !head(h, w.mira), 500);
    expect(person(h, w.mira).skills.creativity?.xp ?? 0).toBeGreaterThan(20);
    expect(person(h, w.mira).moodlets.some((m) => m.id === 'inspired')).toBe(true);
  });

  it('a steady practice slows energy and fun decay', () => {
    const drop = (level: number) => {
      const { w, h } = m11World();
      const p = person(h, w.mira);
      p.skills.wellness = { level, xp: 0 };
      setNeeds(w.state, w.mira, 100);
      for (let i = 0; i < 480; i++) decayNeeds(pureCtx(h), p);
      return { energy: 100 - p.needs.energy, fun: 100 - p.needs.fun };
    };
    const calm = drop(10);
    const novice = drop(1);
    expect(calm.energy).toBeLessThan(novice.energy);
    expect(calm.fun).toBeLessThan(novice.fun);
    expect(calm.energy / novice.energy).toBeCloseTo(wellnessDecay(10), 2);
  });

  it('bad moodlets weigh less with Wellness', () => {
    const moodWith = (level: number) => {
      const { w, h } = m11World();
      const p = person(h, w.mira);
      p.skills.wellness = { level, xp: 0 };
      setNeeds(w.state, w.mira, 50);
      p.moodlets = [{ id: 'proudBake', value: -20, until: null }];
      return computeMood(h.content, p).value;
    };
    expect(moodWith(10)).toBeGreaterThan(moodWith(1));
    expect(moodWith(10)).toBe(Math.round(-20 * wellnessStress(10)));
  });

  it('creative activities are more fun with Creativity', () => {
    const funWith = (level: number) => {
      const { w, h } = m11World();
      const p = person(h, w.mira);
      p.skills.creativity = { level, xp: 0 };
      return performRates(pureCtx(h), p, h.content.interactions.bakeTreat!, null, null, 'standing').fun!;
    };
    expect(funWith(10)).toBeCloseTo(funWith(1) * creativityFun(10), 5);
  });
});

describe('a simulated week of practice', () => {
  const WEEK = 7;

  /** Runs three practice sessions a day for a week at 09:00, 14:00 and 19:00. */
  function practiceWeek(run: (day: number) => void) {
    for (let day = 0; day < WEEK; day++) {
      for (const hour of [9, 14, 19]) {
        run(day * 1440 + hour * 60);
      }
    }
  }

  it('bakes every day and reaches Baking level 2', () => {
    const { w, h } = m11World();
    setNeeds(w.state, w.mira, 70);
    practiceWeek((minute) => {
      h.holder.state.clock.minutes = atDayMinute(0, minute);
      queue(h, w.mira, 'bakeTreat', { kind: 'object', objectId: w.objects.stove!.id });
      runUntil(h, () => !head(h, w.mira), 700);
    });
    expect(person(h, w.mira).skills.baking!.level).toBeGreaterThanOrEqual(2);
    expect(person(h, w.mira).skills.creativity!.xp).toBeGreaterThan(0);
  });

  it('practises yoga all week and reaches Wellness level 2', () => {
    const { w, h } = m11World();
    setNeeds(w.state, w.mira, 70);
    practiceWeek((minute) => {
      h.holder.state.clock.minutes = atDayMinute(0, minute);
      queue(h, w.mira, 'doYoga', { kind: 'object', objectId: (w.objects as Record<string, { id: string }>).yogaMat!.id });
      runUntil(h, () => !head(h, w.mira), 700);
    });
    expect(person(h, w.mira).skills.wellness!.level).toBeGreaterThanOrEqual(2);
  });

  it('sketches all week and reaches Creativity level 2', () => {
    const { w, h } = m11World();
    setNeeds(w.state, w.mira, 70);
    const book = Object.values(w.lot.objects).find((o) => o.defId === 'sketchbook')!;
    practiceWeek((minute) => {
      h.holder.state.clock.minutes = atDayMinute(0, minute);
      queue(h, w.mira, 'sketchIdeas', { kind: 'object', objectId: book.id });
      runUntil(h, () => !head(h, w.mira), 700);
    });
    expect(person(h, w.mira).skills.creativity!.level).toBeGreaterThanOrEqual(2);
  });
});
