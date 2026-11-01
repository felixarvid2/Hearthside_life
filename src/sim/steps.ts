// Building blocks for interaction behaviors: the Behavior contract, Step descriptions, use-point
// selection (specific slots or stand tiles, reserved and reachable) and need-rate computation.

import { fitnessEnergyCost, fitnessSweat, musicFun, paintingFun } from '../content/skillEffects';
import type { InteractionDef } from '../content/types';
import type { AnimId } from '../core/anim';
import type { Tile, WorldSlot } from '../core/nav';
import type { ActionInstance, Id, NeedId, Person, Posture } from '../core/types';
import type { ObjRef, SimCtx } from './context';
import { dist, findSlot, isSeat, lotLoc, lotObjects, objectCenter, objectName, objectRef, tileOfLoc } from './context';
import { planRoute, routeFromPath } from './movement';
import type { UsePointPrefix } from './reservations';
import { reservationKeys, slotKey, surfaceKey, tileResKey } from './reservations';
import { DIRTY_WASH_PENALTY } from './tuning';

/** Where the current stage of an action takes place. */
export type Goal =
  | { kind: 'slot'; objectId: Id; slot: WorldSlot; label: string }
  | { kind: 'tile'; tile: Tile; face?: { x: number; z: number }; label: string }
  | { kind: 'person'; personId: Id; label: string }
  | { kind: 'here' };

export type StepDuration =
  | { kind: 'fixed'; minutes: number }
  | { kind: 'untilFull'; need: NeedId; maxMinutes: number }
  | { kind: 'instant' }
  /** Ends only when the behavior's tick hook says so (conversation listener). */
  | { kind: 'external' };

/** One stage of an action, recomputed from the action's data every tick (never stored). */
export interface Step {
  goal: Goal;
  /** Posture while performing. */
  posture: Posture;
  prepareAnim?: AnimId;
  performAnim: AnimId;
  cleanupAnim?: AnimId;
  duration: StepDuration;
  /** Final need change per game hour while performing (modifiers already applied). */
  rates: Partial<Record<NeedId, number>>;
  /** Skill xp per game hour while performing (object multiplier applied; trait rate applied on grant). */
  skill?: { id: string; xpPerHour: number };
}

export type EndResult = 'done' | 'failed' | 'cancelled';

/** Implementation of an interaction `behavior`. Every hook receives the acting person and action. */
export interface Behavior {
  /** Static availability (also used by context menus); returns a readable reason or null. */
  check(ctx: SimCtx, p: Person, a: ActionInstance): string | null;
  /** Chooses and reserves the use points of the first stage; returns a reason on failure. */
  reserve(ctx: SimCtx, p: Person, a: ActionInstance): string | null;
  /** Current stage; a string is a failure reason (the target vanished or can no longer be used). */
  step(ctx: SimCtx, p: Person, a: ActionInstance): Step | string;
  /** Reached the goal: 'wait' keeps waiting there (conversation partner busy), a string fails. */
  arrive?(ctx: SimCtx, p: Person, a: ActionInstance): 'wait' | string | null;
  /** Perform of the current stage is about to begin (after revalidation): charge costs, take portions. */
  begin?(ctx: SimCtx, p: Person, a: ActionInstance): string | null;
  /** Each perform tick after rates were applied: a reason fails, 'done' ends the stage. */
  tick?(ctx: SimCtx, p: Person, a: ActionInstance): string | 'done' | null;
  /** After a stage: true when another stage follows (data updated), a string fails. */
  next?(ctx: SimCtx, p: Person, a: ActionInstance): boolean | string;
  /** Completion effects beyond the generic needsOnComplete, skill xp and moodlet. */
  apply?(ctx: SimCtx, p: Person, a: ActionInstance): void;
  /** Runs exactly once for every ending, after posture and reservations were handled. */
  end?(ctx: SimCtx, p: Person, a: ActionInstance, result: EndResult): void;
  /** True when a running autonomous action of this behavior may be interrupted for a conversation. */
  interruptible?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Use points
// ---------------------------------------------------------------------------------------------

export interface UseCandidate {
  objectId: Id;
  slot?: WorldSlot;
  tile?: Tile;
}

function approachOf(c: UseCandidate): Tile | null {
  return c.slot ? c.slot.approach : c.tile ?? null;
}

/** Clears a use point from an action's data. */
export function clearUsePoint(a: ActionInstance, prefix: UsePointPrefix): void {
  delete a.data[`${prefix}Obj`];
  delete a.data[`${prefix}Slot`];
  delete a.data[`${prefix}X`];
  delete a.data[`${prefix}Z`];
}

export function hasUsePoint(a: ActionInstance, prefix: UsePointPrefix): boolean {
  return typeof a.data[`${prefix}Obj`] === 'string';
}

function setUsePoint(a: ActionInstance, prefix: UsePointPrefix, c: UseCandidate): void {
  clearUsePoint(a, prefix);
  a.data[`${prefix}Obj`] = c.objectId;
  if (c.slot) a.data[`${prefix}Slot`] = c.slot.slotId;
  else if (c.tile) { a.data[`${prefix}X`] = c.tile.x; a.data[`${prefix}Z`] = c.tile.z; }
}

/** Item capacity for reservations: a meal's remaining portions; dishes and messes are cleaned by one person at a time. */
export function itemCapacity(ctx: SimCtx): (itemId: Id) => number {
  return (id) => { const it = ctx.state.items[id]; return !it ? 0 : it.kind === 'meal' ? it.portions : 1; };
}

/** Re-syncs an action's reservations with its data. Returns false when something is held by another action. */
export function syncReservations(ctx: SimCtx, a: ActionInstance): boolean {
  return ctx.res.sync(a.id, reservationKeys(a), itemCapacity(ctx));
}

/**
 * A sit slot of a seating object occupying the same spot as `slot` (for example a computer's use slot that
 * the world resolves onto the desk chair in front of it). Using either one occupies the seat.
 */
export function coincidentSeat(ctx: SimCtx, lotId: Id, level: number, slot: WorldSlot): UseCandidate | null {
  for (const ref of lotObjects(ctx, lotId, level)) {
    if (ref.obj.id === slot.objectId || !isSeat(ref.def)) continue;
    for (const s of ctx.nav.slotsOf(lotId, ref.obj.id)) {
      if (s.kind === 'sit' && Math.abs(s.x - slot.x) < 0.05 && Math.abs(s.z - slot.z) < 0.05) return { objectId: ref.obj.id, slot: s };
    }
  }
  return null;
}

/** True when a candidate use point, and any seat sharing its spot, is free for `actionId`. */
export function candidateFree(ctx: SimCtx, lotId: Id, level: number, c: UseCandidate, actionId?: Id): boolean {
  const key = c.slot ? slotKey(c.objectId, c.slot.slotId) : c.tile ? tileResKey(c.tile.x, c.tile.z) : null;
  if (!key || !ctx.res.isFree(key, actionId)) return false;
  if (c.slot && c.slot.kind !== 'sit') {
    const seat = coincidentSeat(ctx, lotId, level, c.slot);
    if (seat?.slot && !ctx.res.isFree(slotKey(seat.objectId, seat.slot.slotId), actionId)) return false;
  }
  return true;
}

/**
 * Picks the first free and (optionally) reachable candidate, ordered by distance from `from`.
 * Stores it under `prefix` in the action's data and, when `plan` is set, stores the route.
 * Returns null on success or a readable reason.
 */
export function pickUsePoint(
  ctx: SimCtx, p: Person, a: ActionInstance, prefix: UsePointPrefix, candidates: UseCandidate[],
  opts: { plan: boolean; what: string; from?: { x: number; z: number } },
): string | null {
  const loc = lotLoc(p);
  if (!loc) return `${p.firstName} isn't here.`;
  const from = opts.from ?? loc;
  const scored = candidates
    .map((c, i) => {
      const ap = approachOf(c);
      return { c, i, d: ap ? dist(from.x, from.z, ap.x + 0.5, ap.z + 0.5) : Infinity };
    })
    .filter((s) => Number.isFinite(s.d))
    .sort((x, y) => x.d - y.d || x.i - y.i);
  let sawFree = false;
  for (const { c } of scored) {
    if (!candidateFree(ctx, loc.lotId, loc.level, c, a.id)) continue;
    if (prefix === 'surf' && !ctx.res.isFree(surfaceKey(c.objectId), a.id)) continue;
    sawFree = true;
    if (opts.plan) {
      const goal = approachOf(c);
      if (!goal) continue;
      const cur = tileOfLoc(loc);
      const path = planRoute(ctx, p, [goal]);
      if (!path) continue;
      a.route = routeFromPath(loc, cur, path);
    }
    setUsePoint(a, prefix, c);
    // A use slot that sits on a seat (e.g. the chair in front of a computer) also holds that seat.
    if (prefix !== 'seat' && c.slot && c.slot.kind !== 'sit' && !hasUsePoint(a, 'seat')) {
      const seat = coincidentSeat(ctx, loc.lotId, loc.level, c.slot);
      if (seat) setUsePoint(a, 'seat', seat);
    }
    return null;
  }
  if (candidates.length === 0) return `Nowhere to use the ${opts.what}.`;
  return sawFree ? `Can't reach the ${opts.what}.` : `Someone is using the ${opts.what}.`;
}

/** Candidate use points on an object: slots of the given kinds, else 'use' slots, else stand tiles. */
export function objectCandidates(ctx: SimCtx, lotId: Id, objectId: Id, kinds: readonly string[]): UseCandidate[] {
  const slots = ctx.nav.slotsOf(lotId, objectId);
  if (kinds.length > 0) return slots.filter((s) => kinds.includes(s.kind)).map((slot) => ({ objectId, slot }));
  const use = slots.filter((s) => s.kind === 'use');
  if (use.length > 0) return use.map((slot) => ({ objectId, slot }));
  return ctx.nav.standTilesNear(lotId, objectId).map((tile) => ({ objectId, tile }));
}

/** Stand tiles near an object as candidates. */
export function standCandidates(ctx: SimCtx, lotId: Id, objectId: Id): UseCandidate[] {
  return ctx.nav.standTilesNear(lotId, objectId).map((tile) => ({ objectId, tile }));
}

const GONE: Record<UsePointPrefix, string> = {
  use: 'It is gone.', seat: 'The seat is gone.', stove: 'The stove is gone.', surf: 'The counter is gone.', wash: 'The sink is gone.',
};

/** Goal for a stored use point, or a failure reason when its object or slot vanished. */
export function usePointGoal(ctx: SimCtx, p: Person, a: ActionInstance, prefix: UsePointPrefix): Goal | string {
  const loc = lotLoc(p);
  if (!loc) return `${p.firstName} isn't here.`;
  const objId = a.data[`${prefix}Obj`];
  if (typeof objId !== 'string') return 'Nothing to use.';
  const ref = objectRef(ctx, loc.lotId, objId);
  if (!ref) return GONE[prefix];
  const label = objectName(ctx, ref.def.id);
  const slotId = a.data[`${prefix}Slot`];
  if (typeof slotId === 'string') {
    const slot = findSlot(ctx, loc.lotId, objId, slotId);
    if (!slot) return `The ${label} can't be used from there anymore.`;
    return { kind: 'slot', objectId: objId, slot, label };
  }
  const x = a.data[`${prefix}X`], z = a.data[`${prefix}Z`];
  if (typeof x !== 'number' || typeof z !== 'number') return 'Nothing to use.';
  return { kind: 'tile', tile: { x, z }, face: objectCenter(ref), label };
}

/** Object referenced by a use point, if it still exists. */
export function usePointObject(ctx: SimCtx, p: Person, a: ActionInstance, prefix: UsePointPrefix): ObjRef | null {
  const loc = lotLoc(p);
  const objId = a.data[`${prefix}Obj`];
  if (!loc || typeof objId !== 'string') return null;
  return objectRef(ctx, loc.lotId, objId);
}

// ---------------------------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------------------------

/** Multiplier for need gains from the person's traits (enjoys) and likes/dislikes for an interaction. */
export function enjoyMult(ctx: SimCtx, p: Person, def: Pick<InteractionDef, 'id' | 'autonomy'>): number {
  const tags = [def.id, ...def.autonomy.tags];
  let m = 1;
  for (const t of p.traits) {
    const enjoys = ctx.content.traits[t]?.effects.enjoys;
    if (!enjoys) continue;
    for (const tag of tags) { const v = enjoys[tag]; if (v !== undefined) m *= v; }
  }
  for (const tag of tags) {
    if (p.likes.includes(`activity:${tag}`)) m *= 1.2;
    if (p.dislikes.includes(`activity:${tag}`)) m *= 0.8;
  }
  return m;
}

function statMult(need: NeedId, ref: ObjRef | null): number {
  const s = ref?.def.stats;
  if (!s) return 1;
  if (need === 'energy') return s.energy ?? 1;
  if (need === 'fun') return s.fun ?? 1;
  // Dirty showers, baths and basins wash less well.
  if (need === 'hygiene') return (s.hygiene ?? 1) * (1 - DIRTY_WASH_PENALTY * (ref?.obj.condition?.dirt ?? 0));
  return 1;
}

/** Comfort 0..10 scales gains while seated or lying (5 = standard). */
export function comfortMult(ref: ObjRef | null): number {
  return 0.8 + (ref?.def.stats.comfort ?? 5) / 25;
}

/** Final per-hour need rates for an interaction: object stats, comfort (seated/lying) and enjoyment. */
export function performRates(
  ctx: SimCtx, p: Person, def: InteractionDef, primary: ObjRef | null, seat: ObjRef | null, posture: Posture,
): Partial<Record<NeedId, number>> {
  const out: Partial<Record<NeedId, number>> = {};
  const enjoy = enjoyMult(ctx, p, def);
  for (const [need, base] of Object.entries(def.needsPerHour) as Array<[NeedId, number]>) {
    let v = base;
    if (v > 0) {
      v *= statMult(need, primary);
      if (posture === 'seated' || posture === 'lying') v *= comfortMult(seat ?? primary);
      v *= enjoy;
      if (need === 'fun' && def.autonomy.tags.includes('music')) v *= musicFun(p.skills.music?.level ?? 1);
      if (need === 'fun' && def.autonomy.tags.includes('painting')) v *= paintingFun(p.skills.painting?.level ?? 1);
    } else if (v < 0 && def.autonomy.tags.includes('active')) {
      // Fit people tire less and sweat less from workouts.
      const fit = p.skills.fitness?.level ?? 1;
      if (need === 'energy') v *= fitnessEnergyCost(fit);
      else if (need === 'hygiene') v *= fitnessSweat(fit);
    }
    out[need] = v;
  }
  return out;
}

/** Skill training of an interaction with the object's skill multiplier. */
export function skillRate(def: InteractionDef, primary: ObjRef | null): Step['skill'] {
  if (!def.skill) return undefined;
  return { id: def.skill.id, xpPerHour: def.skill.xpPerHour * (primary?.def.stats.skill ?? 1) };
}

/** Interaction duration as a step duration. */
export function defDuration(def: InteractionDef): StepDuration {
  const d = def.duration;
  if (d.kind === 'untilFull') return { kind: 'untilFull', need: d.need, maxMinutes: d.maxMinutes };
  return d.minutes > 0 ? { kind: 'fixed', minutes: d.minutes } : { kind: 'instant' };
}
