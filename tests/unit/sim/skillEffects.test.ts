// Skill levels change the daily-life simulation: every practised skill has a tangible, tested effect, and the level
// texts in content/skills.ts quote the same numbers (they are generated from content/skillEffects.ts).

import { describe, expect, it } from 'vitest';
import { content } from '../../../src/content/index';
import * as fx from '../../../src/content/skillEffects';
import { BUILTIN_INTERACTIONS } from '../../../src/sim/context';
import { decayNeeds } from '../../../src/sim/needs';
import { socialAcceptance } from '../../../src/sim/social';
import { addSkillXp } from '../../../src/sim/skills';
import { performRates } from '../../../src/sim/steps';
import { choreContent, setup } from './choreFixtures';
import { finished, pureCtx, runUntil, setNeeds } from './fixtures';

const db = content();
const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('effect functions', () => {
  it('are monotonic in the level and stay in range', () => {
    const rising = [fx.cookingQuality, fx.cleaningTime, fx.cookingTime, fx.fitnessEnergyDecay, fx.fitnessEnergyCost, fx.fitnessSweat];
    for (const f of rising) {
      const v = levels.map(f);
      for (let i = 1; i < v.length; i++) expect(f === fx.cookingQuality ? v[i]! >= v[i - 1]! : v[i]! <= v[i - 1]!).toBe(true);
      expect(v[0]).toBeCloseTo(f === fx.cookingQuality ? 0.41 : 1, 5);
    }
    for (const f of [fx.logicStudy, fx.logicRepair, fx.programmingRepair, fx.charismaAcceptance, fx.charismaDiscount, fx.gardeningGroceries, fx.repairBase, fx.musicFun]) {
      const v = levels.map(f);
      for (let i = 1; i < v.length; i++) expect(v[i]!).toBeGreaterThanOrEqual(v[i - 1]!);
    }
    for (const f of [fx.cookingMishap, fx.cookingSpill, fx.repairMinutes, fx.repairShock]) {
      const v = levels.map(f);
      for (let i = 1; i < v.length; i++) expect(v[i]!).toBeLessThanOrEqual(v[i - 1]!);
    }
    expect(fx.cookingSpill(8)).toBe(0);
    expect(fx.repairShock(6)).toBe(0);
    expect(fx.repairMinutes(1)).toBe(40);
    expect(fx.repairMinutes(10)).toBeLessThan(20);
    expect(fx.repairBase(10)).toBeLessThan(1);
  });
});

describe('level texts', () => {
  it('quote the numbers the game uses, and every ready skill promises something real', () => {
    const text = (id: string) => db.skills[id]!.unlocks.map((u) => u.text).join(' | ');
    expect(text('handiness')).toContain(`${fx.repairMinutes(1)} minutes`);
    expect(text('handiness')).toContain(`${fx.repairMinutes(10)} minutes`);
    expect(text('fitness')).toContain(fx.effectText.fitnessEnergy10);
    expect(text('gardening')).toContain(fx.effectText.gardening10);
    expect(text('charisma')).toContain(fx.effectText.charismaDiscount10);
    for (const s of Object.values(db.skills).filter((x) => x.status === 'ready')) {
      expect(s.unlocks.length, `${s.id} has level texts`).toBeGreaterThan(0);
      expect(s.unlocks.some((u) => !u.text.includes('(later)')), `${s.id} promises something that exists`).toBe(true);
    }
    expect(db.skills.handiness!.status).toBe('ready');
  });

  it('every ready skill is trained by an interaction', () => {
    const trained = new Set(Object.values(db.interactions).filter((i) => i.status === 'ready' && i.skill).map((i) => i.skill!.id));
    trained.add('logic'); // skill books and reading
    for (const s of Object.values(db.skills).filter((x) => x.status === 'ready')) expect(trained.has(s.id), s.id).toBe(true);
  });
});

describe('effects in the simulation', () => {
  it('fitness slows the drain of energy and cuts the cost of workouts', () => {
    const s = setup();
    const ctx = pureCtx(s.h);
    const mira = s.w.state.people[s.w.mira]!;
    const drain = (level: number) => {
      mira.skills.fitness = { level, xp: 0 };
      mira.needs.energy = 80;
      for (let i = 0; i < 240; i++) decayNeeds(ctx, mira);
      return 80 - mira.needs.energy;
    };
    expect(drain(10)).toBeLessThan(drain(1));
    const jog = db.interactions.jogInPlace!;
    const rates = (level: number) => { mira.skills.fitness = { level, xp: 0 }; return performRates(ctx, mira, jog, null, null, 'standing'); };
    expect(rates(10).energy!).toBeGreaterThan(rates(1).energy!); // less negative
    expect(rates(10).hygiene!).toBeGreaterThan(rates(1).hygiene!);
  });

  it('music makes listening more fun', () => {
    const s = setup();
    const ctx = pureCtx(s.h);
    const mira = s.w.state.people[s.w.mira]!;
    const listen = db.interactions.listenToMusic!;
    mira.skills.music = { level: 1, xp: 0 };
    const low = performRates(ctx, mira, listen, null, null, 'standing').fun!;
    mira.skills.music = { level: 10, xp: 3200 };
    expect(performRates(ctx, mira, listen, null, null, 'standing').fun!).toBeCloseTo(low * fx.musicFun(10), 5);
  });

  it('logic makes other skills grow faster but not logic itself', () => {
    const s = setup();
    const ctx = pureCtx(s.h);
    const mira = s.w.state.people[s.w.mira]!;
    const gain = (skill: string, logic: number) => {
      mira.skills.logic = { level: logic, xp: 0 };
      mira.skills[skill] = { level: 1, xp: 0 };
      addSkillXp(ctx, mira, skill, 10);
      return mira.skills[skill]!.xp;
    };
    expect(gain('cooking', 1)).toBe(10);
    expect(gain('cooking', 10)).toBeCloseTo(10 * (1 + fx.logicStudy(10)), 1);
    expect(gain('logic', 10)).toBe(10);
  });

  it('charisma makes social interactions land more often', () => {
    const s = setup();
    const ctx = pureCtx(s.h);
    const [mira, theo] = [s.w.state.people[s.w.mira]!, s.w.state.people[s.w.theo]!];
    const chat = { ...s.content.socials.tellJoke!, acceptance: 0.3 };
    mira.skills.charisma = { level: 1, xp: 0 };
    const low = socialAcceptance(ctx, mira, theo, chat);
    mira.skills.charisma = { level: 10, xp: 3200 };
    expect(socialAcceptance(ctx, mira, theo, chat)).toBeCloseTo(low + fx.charismaAcceptance(10), 5);
  });

  it('gardening lowers grocery bills, cooking speeds up with level, and experienced cooks burn less', () => {
    const cookOnce = (gardening: number, cooking: number) => {
      const s = setup({ seed: 4 });
      s.w.state.people[s.w.mira]!.skills.gardening = { level: gardening, xp: 0 };
      s.w.state.people[s.w.mira]!.skills.cooking = { level: cooking, xp: 0 };
      setNeeds(s.w.state, s.w.mira, 80);
      s.w.state.people[s.w.mira]!.needs.hunger = 15;
      const hh = s.w.state.households[s.w.state.activeHouseholdId]!;
      const funds0 = hh.funds;
      const t0 = s.w.state.clock.minutes;
      s.h.sim.queue(s.w.mira, { interactionId: 'cookMeal', target: { kind: 'object', objectId: s.w.objects.fridge!.id, slotId: null } });
      runUntil(s.h, () => finished(s.h, s.w.mira, 'cookMeal').length === 1, 4 * 200);
      const recipe = Object.values(s.w.state.items).find((i) => i.kind === 'meal')!.recipeId;
      return { cost: funds0 - hh.funds, minutes: s.w.state.clock.minutes - t0, recipe, quality: Object.values(s.w.state.items).find((i) => i.kind === 'meal')!.quality };
    };
    const plain = cookOnce(1, 1), green = cookOnce(10, 1);
    expect(green.recipe).toBe(plain.recipe);
    expect(green.cost).toBe(Math.round(plain.cost * (1 - fx.gardeningGroceries(10))));
    // a level-9 cook of the same recipe is quicker (cooking time multiplier) than a level-1 cook
    const fixedRecipe = (level: number) => {
      const s = setup({ seed: 4 });
      s.w.state.people[s.w.mira]!.skills.cooking = { level, xp: 0 };
      s.h.sim.queue(s.w.mira, { interactionId: 'cookMeal', target: { kind: 'object', objectId: s.w.objects.fridge!.id, slotId: null }, data: { recipeId: 'stew' } });
      const t0 = s.w.state.clock.minutes;
      setNeeds(s.w.state, s.w.mira, 80);
      runUntil(s.h, () => Object.values(s.w.state.items).some((i) => i.kind === 'meal'), 4 * 200);
      return s.w.state.clock.minutes - t0;
    };
    expect(fixedRecipe(9)).toBeLessThan(fixedRecipe(1));
  });

  it('burnt meals and spills come from low Cooking: beginners fail often, level 8+ never spills', () => {
    const results = (level: number) => {
      let burnt = 0, spills = 0;
      for (let seed = 1; seed <= 24; seed++) {
        const s = setup({ seed });
        s.w.state.people[s.w.mira]!.skills.cooking = { level, xp: 0 };
        s.w.state.people[s.w.mira]!.needs.hunger = 15;
        s.h.sim.queue(s.w.mira, { interactionId: 'cookMeal', target: { kind: 'object', objectId: s.w.objects.fridge!.id, slotId: null }, data: { recipeId: 'stew' } });
        runUntil(s.h, () => Object.values(s.w.state.items).some((i) => i.kind === 'meal'), 4 * 200);
        const meal = Object.values(s.w.state.items).find((i) => i.kind === 'meal')!;
        if (meal.quality < fx.cookingQuality(level) * 0.8) burnt++;
        if (Object.values(s.w.state.items).some((i) => i.kind === 'mess')) spills++;
      }
      return { burnt, spills };
    };
    const novice = results(1), master = results(8);
    expect(novice.burnt).toBeGreaterThan(master.burnt);
    expect(novice.spills).toBeGreaterThan(3);
    expect(master.spills).toBe(0);
  }, 60_000);
});

describe('real content', () => {
  it('has the chore interactions and the sim knows their behaviors', () => {
    for (const id of ['cleanObject', 'washDishes', 'mopFloor', 'tidyUp', 'repairObject', 'serviceObject', 'callRepairperson', 'readSkillBook']) {
      expect(db.interactions[id]?.status, id).toBe('ready');
    }
    expect(BUILTIN_INTERACTIONS.goHere).toBeDefined();
    expect(choreContent().interactions.cleanObject).toBeDefined();
    expect(Object.values(db.moodlets).map((m) => m.name)).toEqual(expect.arrayContaining(['Dirty Kitchen', 'Fresh and Clean Home']));
  });
});

