// Baking chain (Milestone 11, task B): bake at a stove or bread oven and serve the batch as a portion item,
// exactly like a cooked meal. Ingredients are charged once when baking starts (occurrence `bake:<actionId>`);
// cancelling before that charges nothing. Baking quality and mishap chance come from the Baking level
// (content/skillEffects.ts); a dirty oven bakes worse and is likelier to burn the batch.

import { bakingMishap, bakingQuality, bakingTime } from '../content/skillEffects';
import type { RecipeDef } from '../content/types';
import { addFeed, transact } from '../core/state';
import type { ActionInstance, Person } from '../core/types';
import type { SimCtx } from './context';
import { clamp, dist, isStove, lotLoc, lotObjects, objectCenter } from './context';
import { defOf, interactionCheckNoCost, reservePrimary } from './behaviors';
import { dirtOf, housekeepingOn, spawnMess, useObject } from './housekeeping';
import { freeSurfaceTiles, recipeCost, serveMeal } from './cooking';
import type { Behavior, Step } from './steps';
import { performRates, skillRate, usePointGoal, usePointObject } from './steps';
import { DIRTY_STOVE_MISHAP, DIRTY_STOVE_QUALITY } from './tuning';

/** Skill that gates the bake recipes and sets their quality. */
export const BAKING_SKILL = 'baking';

const bakingLevel = (p: Person): number => p.skills[BAKING_SKILL]?.level ?? 1;

/** Bake recipes the person knows, best first (higher level requirement, then cheaper). */
function bakeableRecipes(ctx: SimCtx, p: Person): RecipeDef[] {
  const level = bakingLevel(p);
  return Object.values(ctx.content.recipes)
    .filter((r) => r.status === 'ready' && r.skill === BAKING_SKILL && r.minCookingLevel <= level)
    .sort((x, y) => y.minCookingLevel - x.minCookingLevel || x.cost - y.cost || (x.id < y.id ? -1 : 1));
}

/** The recipe this bake makes: data.recipeId when valid, else the best affordable one. */
export function chooseBake(ctx: SimCtx, p: Person, a: ActionInstance): RecipeDef | string {
  const level = bakingLevel(p);
  const wanted = typeof a.data.recipeId === 'string' ? ctx.content.recipes[a.data.recipeId] : undefined;
  if (wanted && wanted.skill === BAKING_SKILL) return wanted.minCookingLevel <= level ? wanted : `Needs Baking level ${wanted.minCookingLevel}.`;
  const list = bakeableRecipes(ctx, p);
  if (list.length === 0) return 'No baking recipes known.';
  const funds = ctx.state.households[p.householdId]?.funds ?? 0;
  return list.find((r) => recipeCost(p, r) <= funds) ?? [...list].sort((x, y) => recipeCost(p, x) - recipeCost(p, y) || (x.id < y.id ? -1 : 1))[0]!;
}

/** Quality of the batch before mishaps: Baking level plus the oven's baking bonus, worse when dirty. */
export function bakeQuality(p: Person, oven: ReturnType<typeof usePointObject>): number {
  const q = (bakingQuality(bakingLevel(p)) + (oven?.def.stats.baking ?? 0) * 0.05) *
    (1 - DIRTY_STOVE_QUALITY * (oven ? dirtOf(oven.obj) : 0));
  return Math.round(clamp(q, 0.1, 1) * 100) / 100;
}

/** The nearest free counter (or table) to serve the batch on, so it is not left on the floor. */
function serveSurface(ctx: SimCtx, p: Person) {
  const loc = lotLoc(p);
  if (!loc) return null;
  let best = null, bestDist = Infinity;
  for (const ref of lotObjects(ctx, loc.lotId, loc.level)) {
    if (ref.def.surfaceHeight === undefined || ref.def.layer !== 'floor' || isStove(ref.def)) continue;
    if (freeSurfaceTiles(ctx, loc.lotId, ref).length === 0) continue;
    const c = objectCenter(ref);
    const d = dist(c.x, c.z, loc.x, loc.z);
    if (d < bestDist) { bestDist = d; best = ref; }
  }
  return best;
}

/** What happened at the oven: it gets dirty and worn, a beginner may burn the batch, crumbs fall. */
function bakeOutcome(ctx: SimCtx, p: Person, a: ActionInstance, oven: ReturnType<typeof usePointObject>, quality: number): number {
  const loc = lotLoc(p);
  if (!loc || !housekeepingOn(ctx)) return quality;
  const level = bakingLevel(p);
  const dirt = oven ? dirtOf(oven.obj) : 0;
  const recipe = typeof a.data.recipeId === 'string' ? ctx.content.recipes[a.data.recipeId] : undefined;
  const playable = ctx.state.households[p.householdId]?.isPlayable === true;
  let q = quality;
  const burnt = ctx.rng.chance(bakingMishap(level) + DIRTY_STOVE_MISHAP * dirt);
  if (burnt) {
    q = Math.round(q * 0.6 * 100) / 100;
    if (playable) addFeed(ctx.state, ctx.events, 'info', `${p.firstName} burnt the ${(recipe?.name ?? 'bake').toLowerCase()} a little.`, p.id);
  }
  if (ctx.rng.chance(Math.max(0, 0.12 - 0.01 * level))) spawnMess(ctx, loc.lotId, loc.level, loc.x, loc.z, 'crumbs', 0.3);
  if (oven) useObject(ctx, p, loc.lotId, oven);
  return q;
}

/** Bake a batch: use the oven for the recipe's baking time, then serve it on a free surface. */
export const bakeBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheckNoCost(ctx, p, a);
    if (r) return r;
    if (a.data.charged !== true) {
      const recipe = chooseBake(ctx, p, a);
      if (typeof recipe === 'string') return recipe;
      const cost = recipeCost(p, recipe);
      const funds = ctx.state.households[p.householdId]?.funds ?? 0;
      if (funds < cost) return `Not enough money for ingredients ($${(cost / 100).toFixed(2)}).`;
    }
    return null;
  },
  reserve(ctx, p, a) {
    const recipe = chooseBake(ctx, p, a);
    if (typeof recipe === 'string') return recipe;
    a.data.recipeId = recipe.id;
    return reservePrimary(ctx, p, a);
  },
  step(ctx, p, a): Step | string {
    const def = defOf(ctx, a);
    const goal = usePointGoal(ctx, p, a, 'use');
    if (typeof goal === 'string') return goal;
    const oven = usePointObject(ctx, p, a, 'use');
    const recipe = typeof a.data.recipeId === 'string' ? ctx.content.recipes[a.data.recipeId] : undefined;
    const minutes = (recipe?.minutes ?? 45) * bakingTime(bakingLevel(p));
    return {
      goal, posture: 'standing', performAnim: 'cook',
      duration: { kind: 'fixed', minutes: Math.max(1, Math.round(minutes)) },
      rates: performRates(ctx, p, def, oven, null, 'standing'),
      skill: skillRate(def, oven) ?? { id: BAKING_SKILL, xpPerHour: 55 },
    };
  },
  begin(ctx, p, a) {
    if (a.data.charged === true) return null;
    const recipe = typeof a.data.recipeId === 'string' ? ctx.content.recipes[a.data.recipeId] : undefined;
    if (!recipe) return 'Unknown recipe.';
    const cost = recipeCost(p, recipe);
    const r = transact(ctx.state, ctx.events, p.householdId, -cost, 'groceries', `Ingredients: ${recipe.name}`, { occurrence: `bake:${a.id}` });
    if (!r.ok) return `Not enough money for ingredients ($${(cost / 100).toFixed(2)}).`;
    a.data.charged = true;
    return null;
  },
  next(ctx, p, a) {
    if (!lotLoc(p)) return `${p.firstName} isn't here.`;
    const oven = usePointObject(ctx, p, a, 'use');
    a.data.quality = bakeOutcome(ctx, p, a, oven, bakeQuality(p, oven));
    const recipe = typeof a.data.recipeId === 'string' ? ctx.content.recipes[a.data.recipeId] : undefined;
    serveMeal(ctx, p, a, serveSurface(ctx, p));
    if (ctx.state.households[p.householdId]?.isPlayable === true) {
      addFeed(ctx.state, ctx.events, 'info', `${p.firstName} baked ${recipe?.name ?? 'a batch'}.`, p.id);
    }
    return false;
  },
};
