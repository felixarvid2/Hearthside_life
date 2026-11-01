// Cooking chain and meals: fridge -> stove -> serve a meal item (portions for the household) on the
// nearest free surface, then the cook eats. Groceries are charged once when cooking actually starts
// (occurrence `cook:<actionId>`); cancelling before that charges nothing. Leftover portions are eaten by
// other household members through autonomy; meals spoil after a game day.

import { cookingMishap, cookingQuality, cookingSpill, cookingTime, gardeningGroceries } from '../content/skillEffects';
import type { RecipeDef } from '../content/types';
import { footprintTiles, facingDir } from '../core/geometry';
import { newId } from '../core/ids';
import { addFeed, transact } from '../core/state';
import type { ActionInstance, Id, Person, WorldItem } from '../core/types';
import type { ObjRef, SimCtx } from './context';
import {
  clamp, insideFootprint, isStove, isTable, lotLoc, lotObjects, objectCenter, objectRef, tileOfLoc, dist,
} from './context';
import { defOf, interactionCheckNoCost, reservePrimary, seatCandidates, targetObject } from './behaviors';
import { addDirtyDishes, breakObject, dirtOf, housekeepingOn, isBroken, spawnMess, useObject } from './housekeeping';
import { addMoodlet } from './mood';
import { changeNeed } from './needs';
import { insertAction, makeAction } from './queue';
import type { Behavior, Step, UseCandidate } from './steps';
import {
  clearUsePoint, defDuration, hasUsePoint, objectCandidates, performRates, pickUsePoint, skillRate,
  standCandidates, syncReservations, usePointGoal, usePointObject,
} from './steps';
import { DIRTY_STOVE_MISHAP, DIRTY_STOVE_QUALITY, DIRT_FILTHY, MEAL_SEAT_RADIUS, MEAL_SPOIL_MINUTES } from './tuning';

const stageOf = (a: ActionInstance) => (typeof a.data.stage === 'number' ? a.data.stage : 0);

/** Cooking skill id used for recipes and meal quality. */
export const COOKING_SKILL = 'cooking';

/** Grocery cost of a recipe for this person (gardeners save on groceries). */
export function recipeCost(p: Person, recipe: RecipeDef): number {
  return Math.round(recipe.cost * (1 - gardeningGroceries(p.skills.gardening?.level ?? 1)));
}

/** Recipes the person can cook, best first (higher level requirement, then cheaper). */
function cookableRecipes(ctx: SimCtx, p: Person): RecipeDef[] {
  const level = p.skills[COOKING_SKILL]?.level ?? 1;
  return Object.values(ctx.content.recipes)
    .filter((r) => r.status === 'ready' && r.minCookingLevel <= level)
    .sort((x, y) => y.minCookingLevel - x.minCookingLevel || x.cost - y.cost || (x.id < y.id ? -1 : 1));
}

/** The recipe this action cooks: data.recipeId when valid, else the best affordable one. */
export function chooseRecipe(ctx: SimCtx, p: Person, a: ActionInstance): RecipeDef | string {
  const level = p.skills[COOKING_SKILL]?.level ?? 1;
  const wanted = typeof a.data.recipeId === 'string' ? ctx.content.recipes[a.data.recipeId] : undefined;
  if (wanted) return wanted.minCookingLevel <= level ? wanted : `Needs Cooking level ${wanted.minCookingLevel}.`;
  const list = cookableRecipes(ctx, p);
  if (list.length === 0) return 'No recipes known.';
  const funds = ctx.state.households[p.householdId]?.funds ?? 0;
  // Nothing affordable: report the cheapest recipe so the reason names the smallest amount needed.
  return list.find((r) => recipeCost(p, r) <= funds) ?? [...list].sort((x, y) => recipeCost(p, x) - recipeCost(p, y) || (x.id < y.id ? -1 : 1))[0]!;
}

/** Stoves on the person's level; broken ones only when `broken` is set. */
export function stovesOn(ctx: SimCtx, p: Person, broken = false): ObjRef[] {
  const loc = lotLoc(p);
  return loc ? lotObjects(ctx, loc.lotId, loc.level).filter((r) => isStove(r.def) && (broken || !isBroken(r.obj))) : [];
}

/** Footprint tiles of a surface object not covered by surface objects or items. */
export function freeSurfaceTiles(ctx: SimCtx, lotId: Id, ref: ObjRef): Array<{ x: number; z: number }> {
  const lot = ctx.state.lots[lotId];
  if (!lot || ref.def.surfaceHeight === undefined) return [];
  const used = new Set<string>();
  for (const o of Object.values(lot.objects)) {
    if (o.supportId !== ref.obj.id) continue;
    const d = ctx.content.objects[o.defId];
    if (!d) continue;
    for (const t of footprintTiles(o.x, o.z, d.footprint, o.rot)) used.add(`${t.x},${t.z}`);
  }
  for (const it of Object.values(ctx.state.items)) {
    if (it.lotId === lotId && it.position.onObjectId === ref.obj.id) used.add(`${Math.floor(it.position.x)},${Math.floor(it.position.z)}`);
  }
  return footprintTiles(ref.obj.x, ref.obj.z, ref.def.footprint, ref.obj.rot).filter((t) => !used.has(`${t.x},${t.z}`));
}

function mealQuality(p: Person, stove: ObjRef | null): number {
  const level = p.skills[COOKING_SKILL]?.level ?? 1;
  const q = (cookingQuality(level) + (stove?.def.stats.cooking ?? 0) * 0.05) * (1 - DIRTY_STOVE_QUALITY * (stove ? dirtOf(stove.obj) : 0));
  return Math.round(clamp(q, 0.1, 1) * 100) / 100;
}

/**
 * What happened at the stove once the dish is done: the stove gets dirty and worn, a beginner (or a dirty stove)
 * may burn the food, low levels spill on the floor, and a burn on a filthy stove can scorch it. Returns the
 * quality of the dish. Only with housekeeping content.
 */
function stoveOutcome(ctx: SimCtx, p: Person, a: ActionInstance, stove: ObjRef | null, quality: number): number {
  const loc = lotLoc(p);
  if (!loc || !housekeepingOn(ctx)) return quality;
  const level = p.skills[COOKING_SKILL]?.level ?? 1;
  const dirt = stove ? dirtOf(stove.obj) : 0;
  const recipe = typeof a.data.recipeId === 'string' ? ctx.content.recipes[a.data.recipeId] : undefined;
  const playable = ctx.state.households[p.householdId]?.isPlayable === true;
  let q = quality;
  const burnt = ctx.rng.chance(cookingMishap(level) + DIRTY_STOVE_MISHAP * dirt);
  if (burnt) {
    q = Math.round(q * 0.6 * 100) / 100;
    if (playable) addFeed(ctx.state, ctx.events, 'info', `${p.firstName} burnt the ${(recipe?.name ?? 'meal').toLowerCase()} a little.`, p.id);
  }
  if (ctx.rng.chance(cookingSpill(level))) spawnMess(ctx, loc.lotId, loc.level, loc.x, loc.z, 'spill', 0.4);
  if (stove) {
    const broke = useObject(ctx, p, loc.lotId, stove);
    if (burnt && !broke && !isBroken(stove.obj) && dirt >= DIRT_FILTHY && level <= 4 && ctx.rng.chance(0.3)) {
      breakObject(ctx, loc.lotId, stove, p);
      changeNeed(ctx, p, 'hygiene', -8);
      addMoodlet(ctx.content, p, 'singed', ctx.now, 'cook');
      if (playable) addFeed(ctx.state, ctx.events, 'warning', `A grease flare-up scorched the stove while ${p.firstName} cooked.`, p.id);
    }
  }
  return q;
}

/** Creates the meal item on a surface (first free tile) or on the floor at the cook's tile. */
function serveMeal(ctx: SimCtx, p: Person, a: ActionInstance, surface: ObjRef | null): WorldItem | null {
  const loc = lotLoc(p);
  if (!loc) return null;
  const recipe = typeof a.data.recipeId === 'string' ? ctx.content.recipes[a.data.recipeId] : undefined;
  let pos: WorldItem['position'];
  if (surface) {
    const tiles = freeSurfaceTiles(ctx, loc.lotId, surface);
    const t = tiles[0] ?? footprintTiles(surface.obj.x, surface.obj.z, surface.def.footprint, surface.obj.rot)[0]!;
    pos = { x: t.x + 0.5, z: t.z + 0.5, level: surface.obj.level, onObjectId: surface.obj.id };
  } else {
    const t = tileOfLoc(loc);
    pos = { x: t.x + 0.5, z: t.z + 0.5, level: loc.level };
  }
  const size = ctx.state.households[p.householdId]?.memberIds.length ?? 1;
  const item: WorldItem = {
    id: newId(ctx.state, 'itm'),
    kind: 'meal',
    lotId: loc.lotId,
    position: pos,
    recipeId: recipe?.id ?? 'meal',
    portions: Math.max(1, size),
    quality: typeof a.data.quality === 'number' ? a.data.quality : 0.5,
    createdAt: ctx.now,
    spoilsAt: ctx.now + MEAL_SPOIL_MINUTES,
    ownerHouseholdId: p.householdId,
  };
  ctx.state.items[item.id] = item;
  a.data.itemId = item.id;
  ctx.events.emit({ type: 'item.changed', itemId: item.id, lotId: item.lotId });
  if (surface) useObject(ctx, p, loc.lotId, surface);
  return item;
}

/** Cook a meal: fridge (2 min) -> stove (recipe minutes, cooking xp, groceries charged) -> serve. */
export const cookBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheckNoCost(ctx, p, a);
    if (r) return r;
    if (a.data.charged !== true) {
      const recipe = chooseRecipe(ctx, p, a);
      if (typeof recipe === 'string') return recipe;
      const funds = ctx.state.households[p.householdId]?.funds ?? 0;
      if (funds < recipeCost(p, recipe)) return `Not enough money for groceries ($${(recipeCost(p, recipe) / 100).toFixed(2)}).`;
    }
    if (stageOf(a) <= 1 && stovesOn(ctx, p).length === 0) return stovesOn(ctx, p, true).length > 0 ? 'The stove is broken.' : 'Needs a stove.';
    return null;
  },
  reserve(ctx, p, a) {
    const recipe = chooseRecipe(ctx, p, a);
    if (typeof recipe === 'string') return recipe;
    a.data.recipeId = recipe.id;
    a.data.stage = 0;
    const r = reservePrimary(ctx, p, a);
    if (r) return r;
    const fridge = targetObject(ctx, p, a);
    const loc = lotLoc(p);
    if (!fridge || !loc) return 'It is gone.';
    const cands: UseCandidate[] = stovesOn(ctx, p).flatMap((s) => objectCandidates(ctx, loc.lotId, s.obj.id, []));
    return pickUsePoint(ctx, p, a, 'stove', cands, { plan: false, what: 'stove', from: objectCenter(fridge) });
  },
  step(ctx, p, a): Step | string {
    const def = defOf(ctx, a);
    const stage = stageOf(a);
    if (stage === 0) {
      const goal = usePointGoal(ctx, p, a, 'use');
      if (typeof goal === 'string') return goal;
      return { goal, posture: 'standing', performAnim: 'openFridge', duration: { kind: 'fixed', minutes: 2 }, rates: {} };
    }
    if (stage === 1) {
      const goal = usePointGoal(ctx, p, a, 'stove');
      if (typeof goal === 'string') return goal;
      const stove = usePointObject(ctx, p, a, 'stove');
      const recipe = typeof a.data.recipeId === 'string' ? ctx.content.recipes[a.data.recipeId] : undefined;
      const minutes = (recipe?.minutes ?? (def.duration.kind === 'fixed' ? def.duration.minutes : 30)) * cookingTime(p.skills[COOKING_SKILL]?.level ?? 1);
      return {
        goal, posture: 'standing', performAnim: def.anims.perform === 'idle' ? 'cook' : def.anims.perform,
        duration: { kind: 'fixed', minutes: Math.max(1, Math.round(minutes)) }, rates: performRates(ctx, p, def, stove, null, 'standing'),
        skill: skillRate(def, stove) ?? { id: COOKING_SKILL, xpPerHour: 20 },
      };
    }
    const goal = usePointGoal(ctx, p, a, 'surf');
    if (typeof goal === 'string') return goal;
    return { goal, posture: 'standing', performAnim: 'pickUp', duration: { kind: 'fixed', minutes: 1 }, rates: {} };
  },
  begin(ctx, p, a) {
    if (stageOf(a) !== 1 || a.data.charged === true) return null;
    const recipe = typeof a.data.recipeId === 'string' ? ctx.content.recipes[a.data.recipeId] : undefined;
    if (!recipe) return 'Unknown recipe.';
    const cost = recipeCost(p, recipe);
    const r = transact(ctx.state, ctx.events, p.householdId, -cost, 'groceries', `Groceries: ${recipe.name}`, { occurrence: `cook:${a.id}` });
    if (!r.ok) return `Not enough money for groceries ($${(cost / 100).toFixed(2)}).`;
    a.data.charged = true;
    return null;
  },
  next(ctx, p, a) {
    const stage = stageOf(a);
    const loc = lotLoc(p);
    if (!loc) return `${p.firstName} isn't here.`;
    if (stage === 0) {
      clearUsePoint(a, 'use');
      a.data.stage = 1;
      a.route = [];
      return true;
    }
    if (stage === 1) {
      const stove = usePointObject(ctx, p, a, 'stove');
      a.data.quality = stoveOutcome(ctx, p, a, stove, mealQuality(p, stove));
      const from = stove ? objectCenter(stove) : { x: loc.x, z: loc.z };
      clearUsePoint(a, 'stove');
      const cands: UseCandidate[] = [];
      for (const ref of lotObjects(ctx, loc.lotId, loc.level)) {
        if (ref.def.surfaceHeight === undefined || ref.def.layer !== 'floor' || isStove(ref.def)) continue;
        if (freeSurfaceTiles(ctx, loc.lotId, ref).length === 0) continue;
        cands.push(...standCandidates(ctx, loc.lotId, ref.obj.id));
      }
      if (cands.length === 0 || pickUsePoint(ctx, p, a, 'surf', cands, { plan: true, what: 'counter', from })) {
        serveMeal(ctx, p, a, null);
        return false;
      }
      a.data.stage = 2;
      return true;
    }
    return false;
  },
  end(ctx, p, a, result) {
    // Cooking finished (paid for) but serving was cancelled or failed: the food is not lost, it is put down
    // on the chosen counter when it still exists, else at the cook's feet.
    if (result === 'done' || a.data.charged !== true || stageOf(a) !== 2 || typeof a.data.itemId === 'string' || !lotLoc(p)) return;
    const surf = usePointObject(ctx, p, a, 'surf');
    serveMeal(ctx, p, a, surf && freeSurfaceTiles(ctx, lotLoc(p)!.lotId, surf).length > 0 ? surf : null);
  },
  apply(ctx, p, a) {
    if (typeof a.data.itemId !== 'string') serveMeal(ctx, p, a, usePointObject(ctx, p, a, 'surf'));
    const itemId = a.data.itemId;
    if (typeof itemId === 'string' && ctx.state.items[itemId]) {
      const eat = makeAction(ctx, p, { interactionId: 'eatMeal', target: { kind: 'item', itemId } }, 'chain');
      if (ctx.content.interactions.eatMeal) insertAction(ctx, p, eat);
    }
  },
};

function itemOf(ctx: SimCtx, a: ActionInstance): WorldItem | undefined {
  return a.target.kind === 'item' ? ctx.state.items[a.target.itemId] : undefined;
}

/** The table the seat's front point lies on, if any. */
function tableAtSeat(ctx: SimCtx, lotId: Id, level: number, slot: { x: number; z: number; facing: number }): ObjRef | null {
  const f = facingDir(slot.facing);
  const fx = slot.x + f.x * 0.75, fz = slot.z + f.z * 0.75;
  return lotObjects(ctx, lotId, level).find((r) => isTable(r.def) && insideFootprint(r, fx, fz)) ?? null;
}

/** True when the seat's front point lies on a table. */
function seatAtTable(ctx: SimCtx, lotId: Id, level: number, slot: { x: number; z: number; facing: number }): boolean {
  return tableAtSeat(ctx, lotId, level, slot) !== null;
}

/** Eat a meal portion: pick it up, then sit at a free chair at a table (or stand) and eat. */
export const eatMealBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheckNoCost(ctx, p, a);
    if (r) return r;
    if (a.data.itemTaken === true) return null;
    const loc = lotLoc(p);
    const item = itemOf(ctx, a);
    if (!item || !loc || item.lotId !== loc.lotId) return 'The food is gone.';
    if (item.ownerHouseholdId && item.ownerHouseholdId !== p.householdId) return "That's someone else's food.";
    if (item.portions - ctx.res.itemReserved(item.id, a.id) <= 0) return 'No portions left.';
    return null;
  },
  reserve(ctx, p, a) {
    const loc = lotLoc(p);
    const item = itemOf(ctx, a);
    if (!loc || !item) return 'The food is gone.';
    a.data.stage = 0;
    const surface = item.position.onObjectId ? objectRef(ctx, loc.lotId, item.position.onObjectId) : null;
    const cands: UseCandidate[] = surface
      ? standCandidates(ctx, loc.lotId, surface.obj.id)
      : [{ objectId: item.id, tile: { x: Math.floor(item.position.x), z: Math.floor(item.position.z) } }];
    return pickUsePoint(ctx, p, a, 'use', cands, { plan: true, what: 'food' });
  },
  step(ctx, p, a): Step | string {
    const def = defOf(ctx, a);
    if (stageOf(a) === 0) {
      // After the pickup the item may be gone (last portion taken): the stored use point still applies.
      const item = itemOf(ctx, a);
      if (!item && a.data.itemTaken !== true) return 'The food is gone.';
      let goal: Step['goal'];
      const loc = lotLoc(p);
      const onSurface = typeof a.data.useObj === 'string' && loc !== null && objectRef(ctx, loc.lotId, a.data.useObj) !== null;
      if (onSurface) {
        const g = usePointGoal(ctx, p, a, 'use');
        if (typeof g === 'string') return g;
        goal = g;
      } else {
        const x = a.data.useX, z = a.data.useZ;
        if (typeof x !== 'number' || typeof z !== 'number') return 'The food is gone.';
        goal = { kind: 'tile', tile: { x, z }, ...(item ? { face: { x: item.position.x, z: item.position.z } } : {}), label: 'food' };
      }
      return { goal, posture: 'standing', performAnim: 'pickUp', duration: { kind: 'fixed', minutes: 1 }, rates: {} };
    }
    const recipe = typeof a.data.recipeId === 'string' ? ctx.content.recipes[a.data.recipeId] : undefined;
    const quality = typeof a.data.quality === 'number' ? a.data.quality : 0.5;
    const duration = defDuration(def);
    const minutes = duration.kind === 'fixed' ? duration.minutes : 25;
    const total = (recipe?.hunger ?? 40) * (0.7 + 0.3 * quality);
    let goal: Step['goal'] = { kind: 'here' };
    let posture: Step['posture'] = 'standing';
    let seat: ObjRef | null = null;
    if (hasUsePoint(a, 'seat')) {
      const g = usePointGoal(ctx, p, a, 'seat');
      if (typeof g === 'string') return g;
      goal = g;
      posture = g.kind === 'slot' ? g.slot.posture : 'seated';
      seat = usePointObject(ctx, p, a, 'seat');
    }
    const rates = performRates(ctx, p, def, null, seat, posture);
    rates.hunger = (rates.hunger ?? 0) + (total / Math.max(1, minutes)) * 60;
    return {
      goal, posture, performAnim: def.anims.perform === 'idle' ? 'eat' : def.anims.perform,
      ...(posture === 'seated' ? { prepareAnim: 'sitDown' as const, cleanupAnim: 'standUp' as const } : {}),
      duration: { kind: 'fixed', minutes }, rates,
    };
  },
  begin(ctx, _p, a) {
    if (stageOf(a) !== 0 || a.data.itemTaken === true) return null;
    const item = itemOf(ctx, a);
    if (!item || item.portions <= 0) return 'The food is gone.';
    item.portions -= 1;
    a.data.itemTaken = true;
    if (item.position.onObjectId) a.data.mealSurface = item.position.onObjectId;
    a.data.recipeId = item.recipeId;
    a.data.quality = item.quality;
    if (item.portions <= 0) delete ctx.state.items[item.id];
    ctx.events.emit({ type: 'item.changed', itemId: item.id, lotId: item.lotId });
    syncReservations(ctx, a);
    return null;
  },
  next(ctx, p, a) {
    if (stageOf(a) !== 0) return false;
    const loc = lotLoc(p);
    if (!loc) return `${p.firstName} isn't here.`;
    clearUsePoint(a, 'use');
    a.data.stage = 1;
    a.route = [];
    const seats = seatCandidates(ctx, p, (s) => dist(s.x, s.z, loc.x, loc.z) <= MEAL_SEAT_RADIUS && seatAtTable(ctx, loc.lotId, loc.level, s));
    if (seats.length > 0) pickUsePoint(ctx, p, a, 'seat', seats, { plan: true, what: 'chair' });
    return true;
  },
  /** Eating leaves a dirty plate on the table (or where the meal stood) and crumbs on the table. */
  apply(ctx, p, a) {
    const loc = lotLoc(p);
    if (!loc) return;
    let table: ObjRef | null = null;
    if (hasUsePoint(a, 'seat')) {
      const g = usePointGoal(ctx, p, a, 'seat');
      if (typeof g !== 'string' && g.kind === 'slot') table = tableAtSeat(ctx, loc.lotId, loc.level, g.slot);
    }
    if (!table && typeof a.data.mealSurface === 'string') table = objectRef(ctx, loc.lotId, a.data.mealSurface);
    addDirtyDishes(ctx, loc.lotId, loc.level, table, loc.x, loc.z, 1, typeof a.data.recipeId === 'string' ? a.data.recipeId : 'meal', p.householdId);
    if (table) useObject(ctx, p, loc.lotId, table);
  },
};

/** Removes spoiled meals (called every tick; cheap). */
export function spoilMeals(ctx: SimCtx): void {
  for (const item of Object.values(ctx.state.items)) {
    if (item.kind === 'meal' && item.spoilsAt <= ctx.now) {
      delete ctx.state.items[item.id];
      ctx.events.emit({ type: 'item.changed', itemId: item.id, lotId: item.lotId });
    }
  }
}

/** Meal items on a lot with portions not yet reserved, for autonomy. */
export function availableMeals(ctx: SimCtx, lotId: Id, householdId: Id): WorldItem[] {
  return Object.values(ctx.state.items).filter((it) =>
    it.kind === 'meal' && it.lotId === lotId && (it.ownerHouseholdId === null || it.ownerHouseholdId === householdId) &&
    it.portions - ctx.res.itemReserved(it.id) > 0);
}
