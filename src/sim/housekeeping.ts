// Housekeeping state: dirt and wear of objects, breakdowns, dirty dishes, floor messes, accidents and the moods
// the state of the home causes. Pure functions of WorldState and the seeded rng (state.rng), so every outcome is
// deterministic and survives save/load.
//
// - Objects with the 'cleanable' tag gain dirt (0..1) each time they are used; objects with a repair tag
//   ('plumbing', 'appliance', 'electronics') gain wear and may break. See content/capabilities.ts.
// - Meals leave dirty dishes (a WorldItem of kind 'dishes', one per surface) that are washed at a sink or
//   dishwasher; spills, puddles and crumbs are WorldItems of kind 'mess'. Items are only created when the
//   content defines the matching chore, so worlds without chores behave as before.
// - Home moodlets (Dirty Kitchen, Dirty Bathroom, Messy Floors, Things Need Fixing, Fresh and Clean Home) are
//   refreshed every HOME_MOOD_INTERVAL minutes while their condition holds.

import { isCleanable, isDishStation, isRepairable } from '../content/capabilities';
import type { ObjectDef } from '../content/types';
import { newId } from '../core/ids';
import { addFeed } from '../core/state';
import type { Id, Person, PlacedObject, WorldItem } from '../core/types';
import type { ObjRef, SimCtx } from './context';
import { clamp, lotLoc, lotObjects, objectName, setThought } from './context';
import { freeSurfaceTiles } from './cooking';
import { addMoodlet } from './mood';
import { footprintTiles } from '../core/geometry';
import {
  ACCIDENT_BELOW, ACCIDENT_BLADDER, ACCIDENT_HYGIENE, AGE_BREAK_FACTOR, AGE_FULL_DAYS, BREAK_CHANCE, DIRT_FILTHY, DIRT_PER_USE,
  DIRT_UNWASHED_EXTRA, DIRT_VISIBLE, DIRTY_KITCHEN_SCORE, DISH_STACK_MAX, FRESH_HOME_MAX_DIRT, FRESH_HOME_MIN_OBJECTS,
  HOME_MOOD_INTERVAL, HOME_MOODLET_MINUTES, MESS_LIMIT_PER_LOT, QUALITY_BREAK_MULT, WEAR_BREAK_FACTOR, WEAR_PER_USE,
} from './tuning';

// ---------------------------------------------------------------------------------------------
// Switches and condition accessors
// ---------------------------------------------------------------------------------------------

/** Cleaning chores exist in the content. Without them objects never get dirty or break (older content, test fixtures). */
export const housekeepingOn = (ctx: Pick<SimCtx, 'content'>): boolean => ctx.content.interactions.cleanObject !== undefined;
/** Dirty dishes and floor messes are created only when the content has chores to clear them. */
export const dishesOn = (ctx: Pick<SimCtx, 'content'>): boolean => ctx.content.interactions.washDishes !== undefined;
export const messesOn = (ctx: Pick<SimCtx, 'content'>): boolean => ctx.content.interactions.mopFloor !== undefined;

export const isBroken = (obj: PlacedObject): boolean => obj.condition?.broken === true;
export const dirtOf = (obj: PlacedObject): number => obj.condition?.dirt ?? 0;
export const wearOf = (obj: PlacedObject): number => obj.condition?.wear ?? 0;
export const failsOf = (obj: PlacedObject): number => obj.condition?.fails ?? 0;

function cond(obj: PlacedObject): NonNullable<PlacedObject['condition']> {
  return (obj.condition ??= { dirt: 0, broken: false });
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const stage = (dirt: number) => (dirt >= DIRT_FILTHY ? 2 : dirt >= DIRT_VISIBLE ? 1 : 0);

function changed(ctx: SimCtx, lotId: Id, obj: PlacedObject): void {
  ctx.events.emit({ type: 'object.changed', objectId: obj.id, lotId, what: 'condition' });
}

/** True when the lot belongs to a household the player runs (feed messages are only for those). */
export function playableLot(ctx: SimCtx, lotId: Id): boolean {
  const lot = ctx.state.lots[lotId];
  const owner = lot?.ownerHouseholdId ? ctx.state.households[lot.ownerHouseholdId] : undefined;
  return owner ? owner.isPlayable : lotId === ctx.state.activeLotId;
}

/** Sets an object's dirt (clamped 0..1); the renderer is told when its visible stage changes. */
export function setDirt(ctx: SimCtx, lotId: Id, obj: PlacedObject, value: number): void {
  const c = cond(obj);
  const before = stage(c.dirt);
  c.dirt = r3(clamp(value, 0, 1));
  if (stage(c.dirt) !== before) changed(ctx, lotId, obj);
}

export const addDirt = (ctx: SimCtx, lotId: Id, obj: PlacedObject, amount: number): void => setDirt(ctx, lotId, obj, dirtOf(obj) + amount);

/** Dirt an object gains from one use (0 for objects that are not cleanable). */
export function dirtPerUse(def: ObjectDef): number {
  if (!isCleanable(def)) return 0;
  for (const [tag, dirt] of DIRT_PER_USE) if (def.tags.includes(tag)) return dirt;
  return 0.02;
}

/** Behaviors of the cleaning and repair chores. */
export const CHORE_BEHAVIORS: ReadonlySet<string> = new Set(['clean', 'washDishes', 'mop', 'tidy', 'repair', 'service', 'callRepair']);
/** Behaviors that still work on a broken object (everything else is refused with "Broken"). */
export const BROKEN_OK_BEHAVIORS: ReadonlySet<string> = new Set(['clean', 'repair', 'callRepair']);

// ---------------------------------------------------------------------------------------------
// Use: dirt, wear and breakdowns
// ---------------------------------------------------------------------------------------------

/** Break chance of one more use of an object right now (0 for objects that cannot break). */
export function breakChance(ctx: Pick<SimCtx, 'now'>, ref: ObjRef): number {
  if (!isRepairable(ref.def) || isBroken(ref.obj)) return 0;
  const q = QUALITY_BREAK_MULT[clamp(Math.round(ref.def.quality), 1, 5)] ?? 1;
  const ageDays = Math.max(0, (ctx.now - ref.obj.boughtAt) / 1440);
  return BREAK_CHANCE * q * (1 + wearOf(ref.obj) * WEAR_BREAK_FACTOR) * (1 + Math.min(1, ageDays / AGE_FULL_DAYS) * AGE_BREAK_FACTOR);
}

/**
 * Records one completed use of an object by `p`: dirt for cleanable objects (more from someone who has not
 * washed), wear and a seeded chance of breaking for repairable ones. Returns true when the object broke.
 */
export function useObject(ctx: SimCtx, p: Person, lotId: Id, ref: ObjRef): boolean {
  if (!housekeepingOn(ctx)) return false;
  const per = dirtPerUse(ref.def);
  if (per > 0) addDirt(ctx, lotId, ref.obj, per * (1 + (1 - clamp(p.needs.hygiene, 0, 100) / 100) * DIRT_UNWASHED_EXTRA));
  if (!isRepairable(ref.def) || isBroken(ref.obj)) return false;
  const q = QUALITY_BREAK_MULT[clamp(Math.round(ref.def.quality), 1, 5)] ?? 1;
  const chance = breakChance(ctx, ref);
  const c = cond(ref.obj);
  c.wear = r3(Math.min(1, wearOf(ref.obj) + WEAR_PER_USE * q));
  if (!ctx.rng.chance(chance)) return false;
  breakObject(ctx, lotId, ref, p);
  return true;
}

/** Breaks an object: unusable until repaired. Players are told in the feed. */
export function breakObject(ctx: SimCtx, lotId: Id, ref: ObjRef, who?: Person): void {
  const c = cond(ref.obj);
  c.broken = true;
  c.brokenAt = ctx.now;
  c.fails = 0;
  changed(ctx, lotId, ref.obj);
  if (playableLot(ctx, lotId)) {
    addFeed(ctx.state, ctx.events, 'warning', `The ${objectName(ctx, ref.def.id)} broke down.`, who?.id);
  }
}

/** Marks an object working again. `wearKept` is the fraction of wear that stays (a repair is not a new part). */
export function fixObject(ctx: SimCtx, lotId: Id, ref: ObjRef, wearKept = 0.3): void {
  const c = cond(ref.obj);
  c.broken = false;
  delete c.brokenAt;
  c.fails = 0;
  c.wear = r3(wearOf(ref.obj) * wearKept);
  changed(ctx, lotId, ref.obj);
}

/** What replaces a broken object's role in the home: objects of the same group (toilets, bathing, stoves, fridges). */
export function fixtureGroup(def: ObjectDef): string {
  const t = def.tags;
  if (t.includes('toilet')) return 'toilet';
  if (t.includes('shower') || t.includes('bath')) return 'bathing';
  if (t.includes('stove')) return 'stove';
  if (t.includes('fridge')) return 'fridge';
  return def.id;
}

/** True when this broken object is the home's last working one of its kind (a need or the kitchen depends on it). */
export function isEssential(ctx: SimCtx, lotId: Id, level: number, ref: ObjRef): boolean {
  const group = fixtureGroup(ref.def);
  if (group === ref.def.id) return false;
  return !lotObjects(ctx, lotId, level).some((o) => o.obj.id !== ref.obj.id && !isBroken(o.obj) && fixtureGroup(o.def) === group);
}

// ---------------------------------------------------------------------------------------------
// Messes and dishes
// ---------------------------------------------------------------------------------------------

const FAR_FUTURE = 365 * 1440;

function itemsOfKind(ctx: SimCtx, lotId: Id, kind: WorldItem['kind']): WorldItem[] {
  return Object.values(ctx.state.items).filter((it) => it.kind === kind && it.lotId === lotId);
}

/** The walkable tile closest to (x, z) within two tiles (the tile itself first), or null. Keeps messes reachable. */
export function walkableNear(ctx: SimCtx, lotId: Id, level: number, x: number, z: number): { x: number; z: number } | null {
  const cx = Math.floor(x), cz = Math.floor(z);
  let best: { x: number; z: number } | null = null, bestD = Infinity;
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!ctx.nav.isWalkable(lotId, level, cx + dx, cz + dz)) continue;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = { x: cx + dx, z: cz + dz }; }
    }
  }
  return best;
}

/** Leaves a puddle, spill or crumbs on the floor tile at (x, z) (or the nearest walkable tile). A second mess on a tile makes it worse. */
export function spawnMess(ctx: SimCtx, lotId: Id, level: number, x: number, z: number, variant: 'puddle' | 'crumbs' | 'spill', severity = 0.5): WorldItem | null {
  if (!messesOn(ctx)) return null;
  const spot = walkableNear(ctx, lotId, level, x, z);
  if (!spot) return null;
  const tx = spot.x, tz = spot.z;
  const here = itemsOfKind(ctx, lotId, 'mess').find((it) => it.position.level === level && Math.floor(it.position.x) === tx && Math.floor(it.position.z) === tz);
  if (here) {
    here.quality = r3(Math.min(1, here.quality + severity * 0.5));
    ctx.events.emit({ type: 'item.changed', itemId: here.id, lotId });
    return here;
  }
  if (itemsOfKind(ctx, lotId, 'mess').length >= MESS_LIMIT_PER_LOT) return null;
  const item: WorldItem = {
    id: newId(ctx.state, 'itm'), kind: 'mess', lotId, position: { x: tx + 0.5, z: tz + 0.5, level }, recipeId: variant, portions: 1,
    quality: r3(clamp(severity, 0.1, 1)), createdAt: ctx.now, spoilsAt: ctx.now + FAR_FUTURE, ownerHouseholdId: null,
  };
  ctx.state.items[item.id] = item;
  ctx.events.emit({ type: 'item.changed', itemId: item.id, lotId });
  return item;
}

/** True when the lot has anything dirty dishes can be washed at (working or not). */
export function hasDishStation(ctx: SimCtx, lotId: Id): boolean {
  const lot = ctx.state.lots[lotId];
  if (!lot) return false;
  return Object.values(lot.objects).some((o) => { const d = ctx.content.objects[o.defId]; return !!d && isDishStation(d); });
}

/**
 * Leaves `plates` dirty plates on a surface (merged into the surface's existing stack) or on the floor tile at
 * (x, z). Nothing happens when the content has no dish chore or the lot has no sink or dishwasher.
 */
export function addDirtyDishes(
  ctx: SimCtx, lotId: Id, level: number, surface: ObjRef | null, x: number, z: number, plates: number, recipeId: string, owner: Id | null,
): WorldItem | null {
  if (!dishesOn(ctx) || !hasDishStation(ctx, lotId)) return null;
  const tx = Math.floor(x), tz = Math.floor(z);
  const existing = itemsOfKind(ctx, lotId, 'dishes').find((it) => (surface
    ? it.position.onObjectId === surface.obj.id
    : !it.position.onObjectId && it.position.level === level && Math.floor(it.position.x) === tx && Math.floor(it.position.z) === tz));
  if (existing) {
    existing.portions = Math.min(DISH_STACK_MAX, existing.portions + plates);
    ctx.events.emit({ type: 'item.changed', itemId: existing.id, lotId });
    return existing;
  }
  let pos: WorldItem['position'];
  if (surface) {
    const free = freeSurfaceTiles(ctx, lotId, surface)[0] ?? footprintTiles(surface.obj.x, surface.obj.z, surface.def.footprint, surface.obj.rot)[0]!;
    pos = { x: free.x + 0.5, z: free.z + 0.5, level: surface.obj.level, onObjectId: surface.obj.id };
  } else pos = { x: tx + 0.5, z: tz + 0.5, level };
  const item: WorldItem = {
    id: newId(ctx.state, 'itm'), kind: 'dishes', lotId, position: pos, recipeId, portions: Math.min(DISH_STACK_MAX, plates), quality: 1,
    createdAt: ctx.now, spoilsAt: ctx.now + FAR_FUTURE, ownerHouseholdId: owner,
  };
  ctx.state.items[item.id] = item;
  ctx.events.emit({ type: 'item.changed', itemId: item.id, lotId });
  return item;
}

/** Removes an item and tells the renderer. */
export function removeItem(ctx: SimCtx, item: WorldItem): void {
  delete ctx.state.items[item.id];
  ctx.events.emit({ type: 'item.changed', itemId: item.id, lotId: item.lotId });
}

// ---------------------------------------------------------------------------------------------
// The state of a home
// ---------------------------------------------------------------------------------------------

export interface HomeSummary {
  /** Dirty kitchen things plus half a point per dirty plate. */
  kitchenScore: number;
  /** Bathroom fixtures that are filthy. */
  filthyBathroom: number;
  messes: number;
  dishes: number;
  broken: number;
  cleanables: number;
  maxDirt: number;
}

/** Cleanliness summary of the objects, dishes and messes on a lot. */
export function homeSummary(ctx: SimCtx, lotId: Id): HomeSummary {
  const s: HomeSummary = { kitchenScore: 0, filthyBathroom: 0, messes: 0, dishes: 0, broken: 0, cleanables: 0, maxDirt: 0 };
  const lot = ctx.state.lots[lotId];
  if (!lot) return s;
  for (const o of Object.values(lot.objects)) {
    const def = ctx.content.objects[o.defId];
    if (!def) continue;
    if (isRepairable(def) && isBroken(o)) s.broken++;
    if (!isCleanable(def)) continue;
    s.cleanables++;
    const dirt = dirtOf(o);
    s.maxDirt = Math.max(s.maxDirt, dirt);
    if (def.category === 'kitchen' || def.tags.includes('dining')) { if (dirt >= DIRT_FILTHY * 0.85) s.kitchenScore += 1; }
    if (def.category === 'bathroom' && dirt >= DIRT_FILTHY) s.filthyBathroom++;
  }
  for (const it of Object.values(ctx.state.items)) {
    if (it.lotId !== lotId) continue;
    if (it.kind === 'dishes') { s.dishes += it.portions; s.kitchenScore += it.portions * 0.5; }
    else if (it.kind === 'mess') s.messes++;
  }
  return s;
}

const HOME_MOODLETS = ['dirtyKitchen', 'dirtyBathroom', 'messyFloors', 'brokenThings', 'freshHome'] as const;

function setHomeMoodlet(ctx: SimCtx, p: Person, id: (typeof HOME_MOODLETS)[number], on: boolean): void {
  if (on) {
    addMoodlet(ctx.content, p, id, ctx.now, 'home');
    const m = p.moodlets.find((x) => x.id === id);
    if (m) m.until = ctx.now + HOME_MOODLET_MINUTES;
  } else if (p.moodlets.some((m) => m.id === id)) p.moodlets = p.moodlets.filter((m) => m.id !== id);
}

/** Refreshes the home moodlets of everyone standing in their own home. */
function updateHomeMoods(ctx: SimCtx): void {
  const cache = new Map<Id, HomeSummary>();
  for (const p of Object.values(ctx.state.people)) {
    const loc = lotLoc(p);
    if (!loc || ctx.state.households[p.householdId]?.homeLotId !== loc.lotId) continue;
    let s = cache.get(loc.lotId);
    if (!s) { s = homeSummary(ctx, loc.lotId); cache.set(loc.lotId, s); }
    setHomeMoodlet(ctx, p, 'dirtyKitchen', s.kitchenScore >= DIRTY_KITCHEN_SCORE);
    setHomeMoodlet(ctx, p, 'dirtyBathroom', s.filthyBathroom > 0);
    setHomeMoodlet(ctx, p, 'messyFloors', s.messes >= 2);
    setHomeMoodlet(ctx, p, 'brokenThings', s.broken > 0);
    setHomeMoodlet(ctx, p, 'freshHome', s.cleanables >= FRESH_HOME_MIN_OBJECTS && s.maxDirt <= FRESH_HOME_MAX_DIRT && s.dishes === 0 && s.messes === 0 && s.broken === 0);
  }
}

/** Someone with a completely empty bladder who is not on the toilet has an accident: a puddle and a bad mood. */
function accidents(ctx: SimCtx): void {
  for (const p of Object.values(ctx.state.people)) {
    const loc = lotLoc(p);
    if (!loc || loc.posture === 'lying' || p.needs.bladder > ACCIDENT_BELOW) continue;
    const head = p.queue[0];
    if (head && ctx.content.interactions[head.interactionId]?.behavior === 'toilet' && head.phase === 'perform') continue;
    p.needs.bladder = ACCIDENT_BLADDER;
    p.needs.hygiene = Math.max(0, p.needs.hygiene - ACCIDENT_HYGIENE);
    spawnMess(ctx, loc.lotId, loc.level, loc.x, loc.z, 'puddle', 0.7);
    addMoodlet(ctx.content, p, 'accident', ctx.now, 'bladder');
    setThought(p, 'bladder', 'Oh no...', ctx.now + 60);
    if (ctx.state.households[p.householdId]?.isPlayable) addFeed(ctx.state, ctx.events, 'warning', `${p.firstName} didn't make it to the toilet in time.`, p.id);
  }
}

/** Simulation flow step: accidents every tick, home moods every HOME_MOOD_INTERVAL minutes. */
export function runHousekeeping(ctx: SimCtx): void {
  if (!housekeepingOn(ctx)) return;
  accidents(ctx);
  if (ctx.now % HOME_MOOD_INTERVAL === 0) updateHomeMoods(ctx);
}
