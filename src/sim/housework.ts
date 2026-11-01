// Housework behaviors: clean an object, wash dirty dishes, mop up a floor mess, tidy up, repair and service
// breakable objects, call a repairperson, and the repairperson's visit. Durations and success chances depend on
// Handiness (content/skillEffects.ts); chores cost a little fun and energy; nothing here can leave a person stuck:
// a failed repair only wastes time (and may shock), and every attempt makes the next one likelier to work.

import { isDishStation, isRepairable } from '../content/capabilities';
import {
  charismaDiscount, cleaningTime, logicRepair, programmingRepair, repairBase, repairMinutes, repairShock,
} from '../content/skillEffects';
import { addFeed, transact } from '../core/state';
import type { ActionInstance, Id, Person, ScheduledEvent, WorldItem } from '../core/types';
import { defOf, interactionCheck, primaryStep, reservePrimary, targetObject } from './behaviors';
import type { ObjRef, SimCtx } from './context';
import { behaviorOf, clamp, dist, lotLoc, lotObjects, objectCenter, objectName, objectRef } from './context';
import {
  CHORE_BEHAVIORS, dirtOf, failsOf, fixObject, isBroken, removeItem, setDirt, spawnMess, useObject, walkableNear, wearOf,
} from './housekeeping';
import { addMoodlet } from './mood';
import { changeNeed } from './needs';
import { addSkillXp } from './skills';
import type { Behavior, Step, UseCandidate } from './steps';
import { clearUsePoint, objectCandidates, performRates, pickUsePoint, skillRate, standCandidates, usePointGoal, usePointObject } from './steps';
import {
  CLEAN_BASE_MINUTES, CLEAN_DIRT_MINUTES, DISHWASHER_MULT, MOP_MINUTES, REPAIRPERSON_DELAY_MAX, REPAIRPERSON_DELAY_MIN, REPAIRPERSON_FEE,
  REPAIR_MAX_CHANCE, REPAIR_MIN_CHANCE, REPAIR_PITY, SERVICE_MIN_WEAR, SERVICE_WEAR_REMOVED, SHOCK_ENERGY, SPLASH_HYGIENE, TIDY_DIRT_REMOVED,
  TIDY_RADIUS, WASH_BASE_MINUTES, WASH_MINUTES_PER_PLATE,
} from './tuning';

const stageOf = (a: ActionInstance) => (typeof a.data.stage === 'number' ? a.data.stage : 0);
const skillOf = (p: Person, id: string) => p.skills[id]?.level ?? 1;
const CLEAN_MIN_DIRT = 0.05;

// ---------------------------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------------------------

/** Minutes to clean an object at its current dirt. */
export function cleanMinutes(p: Person, ref: ObjRef): number {
  return Math.max(3, Math.round((CLEAN_BASE_MINUTES + CLEAN_DIRT_MINUTES * dirtOf(ref.obj)) * cleaningTime(skillOf(p, 'handiness'))));
}

/** Chance that one repair attempt on this object succeeds. */
export function repairChance(p: Person, ref: ObjRef): number {
  let c = repairBase(skillOf(p, 'handiness')) + logicRepair(skillOf(p, 'logic')) + REPAIR_PITY * failsOf(ref.obj) + 0.02 * (ref.def.quality - 3);
  if (ref.def.tags.includes('electronics')) c += programmingRepair(skillOf(p, 'programming'));
  return clamp(c, REPAIR_MIN_CHANCE, REPAIR_MAX_CHANCE);
}

/** Chance that a failed repair of this object shocks the repairer. */
export function shockChance(p: Person, ref: ObjRef): number {
  if (!ref.def.tags.includes('electronics') && !ref.def.tags.includes('appliance')) return 0;
  return clamp(repairShock(skillOf(p, 'handiness')) - 0.03 * (skillOf(p, 'programming') - 1), 0, 1);
}

/** Minutes to service an object. */
export function serviceMinutes(p: Person): number {
  return Math.max(6, Math.round(20 * cleaningTime(skillOf(p, 'handiness'))));
}

/** The repairperson's fee for this person (Charisma haggles it down). */
export function repairFee(p: Person): number {
  return Math.round(REPAIRPERSON_FEE * (1 - charismaDiscount(skillOf(p, 'charisma'))));
}

/** Working sinks and dishwashers on a lot level. */
export function workingStations(ctx: SimCtx, lotId: Id, level: number): ObjRef[] {
  return lotObjects(ctx, lotId, level).filter((r) => isDishStation(r.def) && !isBroken(r.obj));
}

function washMinutes(p: Person, plates: number, station: ObjRef | null): number {
  const base = WASH_BASE_MINUTES + plates * WASH_MINUTES_PER_PLATE;
  const mult = station?.def.tags.includes('dishes') ? DISHWASHER_MULT : 1;
  return Math.max(2, Math.round(base * mult * cleaningTime(skillOf(p, 'handiness'))));
}

/** True when another person's started chore already works on this object. */
function busyElsewhere(ctx: SimCtx, objectId: Id, a: ActionInstance): boolean {
  for (const o of Object.values(ctx.state.people)) {
    for (const x of o.queue) {
      if (x.id === a.id || x.phase === 'queued' || x.target.kind !== 'object' || x.target.objectId !== objectId) continue;
      if (CHORE_BEHAVIORS.has(behaviorOf(ctx, x.interactionId) ?? '')) return true;
    }
  }
  return false;
}

const SOMEONE = 'Someone else is already on it.';

function itemOf(ctx: SimCtx, a: ActionInstance): WorldItem | undefined {
  return a.target.kind === 'item' ? ctx.state.items[a.target.itemId] : undefined;
}

/** Stand tiles to work on an item: next to its surface, or on its own tile when it lies on the floor. */
function itemCandidates(ctx: SimCtx, lotId: Id, item: WorldItem): UseCandidate[] {
  const surface = item.position.onObjectId ? objectRef(ctx, lotId, item.position.onObjectId) : null;
  return surface
    ? standCandidates(ctx, lotId, surface.obj.id)
    : [{ objectId: item.id, tile: { x: Math.floor(item.position.x), z: Math.floor(item.position.z) } }];
}

/** Goal for the item's stored use point (a surface object, or its floor tile). */
function itemGoal(ctx: SimCtx, p: Person, a: ActionInstance, item: WorldItem, label: string): Step['goal'] | string {
  const loc = lotLoc(p);
  const onSurface = typeof a.data.useObj === 'string' && loc !== null && objectRef(ctx, loc.lotId, a.data.useObj) !== null;
  if (onSurface) return usePointGoal(ctx, p, a, 'use');
  const x = a.data.useX, z = a.data.useZ;
  if (typeof x !== 'number' || typeof z !== 'number') return `The ${label} is gone.`;
  return { kind: 'tile', tile: { x, z }, face: { x: item.position.x, z: item.position.z }, label };
}

function playable(ctx: SimCtx, p: Person): boolean {
  return ctx.state.households[p.householdId]?.isPlayable === true;
}

// ---------------------------------------------------------------------------------------------
// Clean an object
// ---------------------------------------------------------------------------------------------

export const cleanBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    if (r) return r;
    const ref = targetObject(ctx, p, a);
    if (!ref) return 'It is gone.';
    if (dirtOf(ref.obj) < CLEAN_MIN_DIRT) return 'Already spotless.';
    return busyElsewhere(ctx, ref.obj.id, a) ? SOMEONE : null;
  },
  reserve: (ctx, p, a) => reservePrimary(ctx, p, a, []),
  step(ctx, p, a) {
    const s = primaryStep(ctx, p, a);
    const ref = targetObject(ctx, p, a);
    if (typeof s === 'string' || !ref) return typeof s === 'string' ? s : 'It is gone.';
    return { ...s, posture: 'standing', duration: { kind: 'fixed', minutes: cleanMinutes(p, ref) } };
  },
  apply(ctx, p, a) {
    const ref = targetObject(ctx, p, a), loc = lotLoc(p);
    if (!ref || !loc) return;
    const before = dirtOf(ref.obj);
    setDirt(ctx, loc.lotId, ref.obj, 0);
    // Scrubbing a filthy toilet is not clean work.
    if (ref.def.tags.includes('toilet') || ref.def.tags.includes('bath')) changeNeed(ctx, p, 'hygiene', -(2 + 4 * before));
  },
  interruptible: true,
};

// ---------------------------------------------------------------------------------------------
// Dirty dishes
// ---------------------------------------------------------------------------------------------

/** Wash dirty dishes: pick them up where they are (1 min), carry them to a working sink or dishwasher and wash. */
export const washDishesBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    if (r) return r;
    const loc = lotLoc(p), item = itemOf(ctx, a);
    if (!item || item.kind !== 'dishes' || !loc || item.lotId !== loc.lotId) return 'The dishes are gone.';
    if (item.ownerHouseholdId && item.ownerHouseholdId !== p.householdId) return "Those aren't your dishes.";
    if (ctx.res.itemReserved(item.id, a.id) > 0) return SOMEONE;
    if (stageOf(a) <= 1 && workingStations(ctx, loc.lotId, loc.level).length === 0) return 'No working sink or dishwasher.';
    return null;
  },
  reserve(ctx, p, a) {
    const loc = lotLoc(p), item = itemOf(ctx, a);
    if (!loc || !item) return 'The dishes are gone.';
    a.data.stage = 0;
    const stations = workingStations(ctx, loc.lotId, loc.level);
    if (stations.length === 0) return 'No working sink or dishwasher.';
    const r = pickUsePoint(ctx, p, a, 'use', itemCandidates(ctx, loc.lotId, item), { plan: true, what: 'dishes' });
    if (r) return r;
    const cands = stations.flatMap((s) => objectCandidates(ctx, loc.lotId, s.obj.id, []));
    return pickUsePoint(ctx, p, a, 'wash', cands, { plan: false, what: 'sink', from: { x: item.position.x, z: item.position.z } });
  },
  step(ctx, p, a): Step | string {
    const def = defOf(ctx, a);
    const item = itemOf(ctx, a);
    if (!item) return 'The dishes are gone.';
    if (stageOf(a) === 0) {
      const goal = itemGoal(ctx, p, a, item, 'dishes');
      if (typeof goal === 'string') return goal;
      return { goal, posture: 'standing', performAnim: 'pickUp', duration: { kind: 'fixed', minutes: 1 }, rates: {} };
    }
    const goal = usePointGoal(ctx, p, a, 'wash');
    if (typeof goal === 'string') return goal;
    const station = usePointObject(ctx, p, a, 'wash');
    return {
      goal, posture: 'standing', performAnim: 'clean', prepareAnim: 'carry',
      duration: { kind: 'fixed', minutes: washMinutes(p, item.portions, station) },
      rates: performRates(ctx, p, def, station, null, 'standing'), skill: skillRate(def, station),
    };
  },
  next(_ctx, _p, a) {
    if (stageOf(a) !== 0) return false;
    clearUsePoint(a, 'use');
    a.data.stage = 1;
    a.route = [];
    return true;
  },
  apply(ctx, p, a) {
    const item = itemOf(ctx, a), loc = lotLoc(p);
    if (item) removeItem(ctx, item);
    const station = usePointObject(ctx, p, a, 'wash');
    if (station && loc) useObject(ctx, p, loc.lotId, station);
  },
  interruptible: true,
};

/** Wipe up a floor mess (puddle, spill or crumbs). */
export const mopBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    if (r) return r;
    const loc = lotLoc(p), item = itemOf(ctx, a);
    if (!item || item.kind !== 'mess' || !loc || item.lotId !== loc.lotId) return 'The mess is gone.';
    return ctx.res.itemReserved(item.id, a.id) > 0 ? SOMEONE : null;
  },
  reserve(ctx, p, a) {
    const loc = lotLoc(p), item = itemOf(ctx, a);
    if (!loc || !item) return 'The mess is gone.';
    a.data.stage = 0;
    // A mess nobody can walk to (furniture was placed on it) moves to the nearest free tile.
    if (!item.position.onObjectId && !ctx.nav.isWalkable(loc.lotId, loc.level, Math.floor(item.position.x), Math.floor(item.position.z))) {
      const spot = walkableNear(ctx, loc.lotId, item.position.level, item.position.x, item.position.z);
      if (!spot) { removeItem(ctx, item); return 'The mess is gone.'; }
      item.position.x = spot.x + 0.5;
      item.position.z = spot.z + 0.5;
    }
    const r = pickUsePoint(ctx, p, a, 'use', itemCandidates(ctx, loc.lotId, item), { plan: true, what: 'mess' });
    // Still unreachable (walled off): the mess is not worth keeping around.
    if (r && r.startsWith("Can't reach")) removeItem(ctx, item);
    return r;
  },
  step(ctx, p, a): Step | string {
    const def = defOf(ctx, a);
    const item = itemOf(ctx, a);
    if (!item) return 'The mess is gone.';
    const goal = itemGoal(ctx, p, a, item, 'mess');
    if (typeof goal === 'string') return goal;
    const minutes = Math.max(2, Math.round(MOP_MINUTES * (0.7 + 0.6 * item.quality) * cleaningTime(skillOf(p, 'handiness'))));
    return {
      goal, posture: 'standing', performAnim: 'clean', duration: { kind: 'fixed', minutes },
      rates: performRates(ctx, p, def, null, null, 'standing'), skill: skillRate(def, null),
    };
  },
  apply(ctx, _p, a) {
    const item = itemOf(ctx, a);
    if (item) removeItem(ctx, item);
  },
  interruptible: true,
};

// ---------------------------------------------------------------------------------------------
// Tidy up
// ---------------------------------------------------------------------------------------------

function tidyTargets(ctx: SimCtx, p: Person): { objects: ObjRef[]; crumbs: WorldItem[] } {
  const loc = lotLoc(p);
  if (!loc) return { objects: [], crumbs: [] };
  const objects = lotObjects(ctx, loc.lotId, loc.level).filter((r) => {
    if (!r.def.tags.includes('cleanable') || dirtOf(r.obj) < 0.1) return false;
    const c = objectCenter(r);
    return dist(loc.x, loc.z, c.x, c.z) <= TIDY_RADIUS;
  });
  const crumbs = Object.values(ctx.state.items).filter((it) => it.kind === 'mess' && it.recipeId === 'crumbs' && it.lotId === loc.lotId
    && it.position.level === loc.level && dist(loc.x, loc.z, it.position.x, it.position.z) <= TIDY_RADIUS);
  return { objects, crumbs };
}

/** Tidy up around the person: takes the worst grime off nearby things and sweeps up crumbs. */
export const tidyBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    if (r) return r;
    const t = tidyTargets(ctx, p);
    return t.objects.length === 0 && t.crumbs.length === 0 ? 'Nothing to tidy here.' : null;
  },
  reserve: () => null,
  step: (ctx, p, a) => {
    const s = primaryStep(ctx, p, a);
    if (typeof s === 'string') return s;
    return { ...s, duration: { kind: 'fixed', minutes: Math.max(4, Math.round(12 * cleaningTime(skillOf(p, 'handiness')))) } };
  },
  apply(ctx, p) {
    const loc = lotLoc(p);
    if (!loc) return;
    const t = tidyTargets(ctx, p);
    for (const r of t.objects) setDirt(ctx, loc.lotId, r.obj, dirtOf(r.obj) - TIDY_DIRT_REMOVED);
    for (const it of t.crumbs) removeItem(ctx, it);
  },
  interruptible: true,
};

// ---------------------------------------------------------------------------------------------
// Repairs
// ---------------------------------------------------------------------------------------------

/** Repair a broken object. Success depends on Handiness, Logic, Programming (electronics) and earlier failures. */
export const repairBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    if (r) return r;
    const ref = targetObject(ctx, p, a);
    if (!ref) return 'It is gone.';
    if (!isRepairable(ref.def)) return "That can't be repaired.";
    if (!isBroken(ref.obj)) return 'Not broken.';
    return busyElsewhere(ctx, ref.obj.id, a) ? SOMEONE : null;
  },
  reserve: (ctx, p, a) => reservePrimary(ctx, p, a, []),
  step(ctx, p, a) {
    const s = primaryStep(ctx, p, a);
    if (typeof s === 'string') return s;
    return { ...s, posture: 'standing', duration: { kind: 'fixed', minutes: repairMinutes(skillOf(p, 'handiness')) } };
  },
  apply(ctx, p, a) {
    const ref = targetObject(ctx, p, a), loc = lotLoc(p);
    if (!ref || !loc || !isBroken(ref.obj)) return;
    const name = objectName(ctx, ref.def.id);
    if (ctx.rng.chance(repairChance(p, ref))) {
      fixObject(ctx, loc.lotId, ref);
      addMoodlet(ctx.content, p, 'fixedIt', ctx.now, 'repair');
      addSkillXp(ctx, p, 'handiness', 15);
      if (playable(ctx, p)) addFeed(ctx.state, ctx.events, 'info', `${p.firstName} fixed the ${name}.`, p.id);
      return;
    }
    // Failure: time wasted, the next attempt is likelier to work; electrics may shock, pipes may splash.
    const c = (ref.obj.condition ??= { dirt: 0, broken: true });
    c.fails = failsOf(ref.obj) + 1;
    if (ctx.rng.chance(shockChance(p, ref))) {
      changeNeed(ctx, p, 'energy', -SHOCK_ENERGY);
      addMoodlet(ctx.content, p, 'shocked', ctx.now, 'repair');
      if (playable(ctx, p)) addFeed(ctx.state, ctx.events, 'warning', `${p.firstName} got a nasty shock fixing the ${name}.`, p.id);
    } else if (ref.def.tags.includes('plumbing') && ctx.rng.chance(0.4)) {
      changeNeed(ctx, p, 'hygiene', -SPLASH_HYGIENE);
      addMoodlet(ctx.content, p, 'soaked', ctx.now, 'repair');
      spawnMess(ctx, loc.lotId, loc.level, loc.x, loc.z, 'puddle', 0.5);
      if (playable(ctx, p)) addFeed(ctx.state, ctx.events, 'warning', `The ${name} sprayed ${p.firstName} during the repair.`, p.id);
    } else if (playable(ctx, p)) {
      addFeed(ctx.state, ctx.events, 'info', `${p.firstName} couldn't fix the ${name} this time.`, p.id);
    }
  },
  interruptible: true,
};

/** Service a worn object: takes wear off so it breaks down less often. Practises Handiness. */
export const serviceBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    if (r) return r;
    const ref = targetObject(ctx, p, a);
    if (!ref) return 'It is gone.';
    if (!isRepairable(ref.def)) return "That doesn't need servicing.";
    if (wearOf(ref.obj) < SERVICE_MIN_WEAR) return 'Running fine, no service needed yet.';
    return busyElsewhere(ctx, ref.obj.id, a) ? SOMEONE : null;
  },
  reserve: (ctx, p, a) => reservePrimary(ctx, p, a, []),
  step(ctx, p, a) {
    const s = primaryStep(ctx, p, a);
    if (typeof s === 'string') return s;
    return { ...s, posture: 'standing', duration: { kind: 'fixed', minutes: serviceMinutes(p) } };
  },
  apply(ctx, p, a) {
    const ref = targetObject(ctx, p, a);
    if (!ref || !ref.obj.condition) return;
    ref.obj.condition.wear = Math.round(Math.max(0, wearOf(ref.obj) - SERVICE_WEAR_REMOVED) * 1000) / 1000;
  },
  interruptible: true,
};

// ---------------------------------------------------------------------------------------------
// The repairperson
// ---------------------------------------------------------------------------------------------

const REPAIR_TASK = 'repair';

/** True when a repairperson is already on the way to this object. */
export function repairPending(ctx: Pick<SimCtx, 'state'>, objectId: Id): boolean {
  return ctx.state.schedule.some((e) => e.kind === 'custom' && e.data?.task === REPAIR_TASK && e.data.objectId === objectId);
}

/** Call a repairperson for a fixed fee. The fee is charged once, when the call is made, together with the visit. */
export const callRepairBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    if (r) return r;
    const ref = targetObject(ctx, p, a);
    if (!ref) return 'It is gone.';
    if (!isRepairable(ref.def) || !isBroken(ref.obj)) return 'Not broken.';
    if (repairPending(ctx, ref.obj.id)) return 'A repairperson is already on the way.';
    if (busyElsewhere(ctx, ref.obj.id, a)) return SOMEONE;
    const funds = ctx.state.households[p.householdId]?.funds ?? 0;
    const fee = repairFee(p);
    return funds < fee && !ctx.state.settings.unlimitedFunds ? `Not enough money ($${(fee / 100).toFixed(2)}).` : null;
  },
  reserve: () => null,
  step(ctx, p, a): Step | string {
    const def = defOf(ctx, a);
    if (!targetObject(ctx, p, a)) return 'It is gone.';
    return { goal: { kind: 'here' }, posture: 'standing', performAnim: 'phone', duration: { kind: 'fixed', minutes: def.duration.kind === 'fixed' ? def.duration.minutes : 4 }, rates: {} };
  },
  apply(ctx, p, a) {
    const ref = targetObject(ctx, p, a), loc = lotLoc(p);
    if (!ref || !loc || !isBroken(ref.obj) || repairPending(ctx, ref.obj.id)) return;
    const fee = repairFee(p);
    const name = objectName(ctx, ref.def.id);
    const r = transact(ctx.state, ctx.events, p.householdId, -fee, 'repair', `Repairperson: ${ref.def.name}`, { occurrence: `repair:${a.id}` });
    if (!r.ok) {
      if (playable(ctx, p)) addFeed(ctx.state, ctx.events, 'warning', `${p.firstName} couldn't afford a repairperson for the ${name}.`, p.id);
      return;
    }
    const delay = ctx.rng.int(REPAIRPERSON_DELAY_MIN, REPAIRPERSON_DELAY_MAX);
    ctx.state.schedule.push({
      occurrence: `fixit:${a.id}`, at: ctx.now + delay, kind: 'custom', personId: p.id, householdId: p.householdId,
      data: { task: REPAIR_TASK, objectId: ref.obj.id, lotId: loc.lotId },
    });
    if (playable(ctx, p)) addFeed(ctx.state, ctx.events, 'info', `${p.firstName} called a repairperson for the ${name}. They'll be along in a couple of hours.`, p.id);
  },
  interruptible: true,
};

/** The repairperson arrives (a due 'custom' schedule entry with task 'repair'). */
export function runScheduledTask(ctx: SimCtx, e: ScheduledEvent): void {
  if (e.data?.task !== REPAIR_TASK) return;
  const lotId = e.data.lotId, objectId = e.data.objectId;
  if (typeof lotId !== 'string' || typeof objectId !== 'string') return;
  const ref = objectRef(ctx, lotId, objectId);
  if (!ref || !isBroken(ref.obj)) return;
  fixObject(ctx, lotId, ref, 0);
  const lot = ctx.state.lots[lotId];
  const owner = lot?.ownerHouseholdId ? ctx.state.households[lot.ownerHouseholdId] : undefined;
  if (!owner || owner.isPlayable) addFeed(ctx.state, ctx.events, 'info', `The repairperson fixed the ${objectName(ctx, ref.def.id)}.`, e.personId);
}
