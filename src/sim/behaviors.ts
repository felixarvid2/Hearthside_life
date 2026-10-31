// Interaction behaviors for objects and self interactions (sleep, sit, toilet, shower, snack, TV,
// computer, reading, outfits) and the behavior registry. Cooking, travel and social behaviors live in
// cooking.ts, travel.ts and social.ts.

import type { InteractionDef } from '../content/types';
import { facingDir } from '../core/geometry';
import { transact } from '../core/state';
import type { ActionInstance, OutfitCategory, Person, Posture } from '../core/types';
import { OUTFIT_CATEGORIES } from '../core/types';
import type { ObjRef, SimCtx } from './context';
import {
  behaviorOf, dist, interactionDef, isSeat, isVisitor, lotLoc, lotObjects, objectCenter, objectName, objectRef,
} from './context';
import { cookBehavior, eatMealBehavior } from './cooking';
import { socialBehavior } from './social';
import type { Behavior, Step, UseCandidate } from './steps';
import {
  defDuration, hasUsePoint, objectCandidates, performRates, pickUsePoint, skillRate, usePointGoal, usePointObject,
  clearUsePoint,
} from './steps';
import { goHereBehavior, goToWorkBehavior, inviteBehavior, leaveLotBehavior, phoneChatBehavior } from './travel';
import { READ_SEAT_RADIUS, TV_SEAT_RADIUS } from './tuning';

// ---------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------

/** The interaction definition of an action (behaviors are only used for known interactions). */
export function defOf(ctx: SimCtx, a: ActionInstance): InteractionDef {
  const def = interactionDef(ctx, a.interactionId);
  if (!def) throw new Error(`No interaction ${a.interactionId}`);
  return def;
}

/** The action's target object, when it exists on the person's lot. */
export function targetObject(ctx: SimCtx, p: Person, a: ActionInstance): ObjRef | null {
  const loc = lotLoc(p);
  if (!loc || a.target.kind !== 'object') return null;
  return objectRef(ctx, loc.lotId, a.target.objectId);
}

/** Checks shared by object and self interactions: target present, visitor rules, affordability. */
export function interactionCheck(ctx: SimCtx, p: Person, a: ActionInstance, ignoreCost = false): string | null {
  const def = interactionDef(ctx, a.interactionId);
  if (!def) return 'That interaction is not available.';
  if (isVisitor(ctx, p) && !def.allowVisitors) return 'Only residents can do that.';
  if (def.kind === 'object') {
    if (a.target.kind !== 'object') return 'Pick an object.';
    const ref = targetObject(ctx, p, a);
    if (!ref) return 'It is gone.';
    if (!ref.def.interactions.includes(def.id)) return `Can't do that with the ${objectName(ctx, ref.def.id)}.`;
  }
  if (!ignoreCost && def.cost && a.data.charged !== true) {
    const hh = ctx.state.households[p.householdId];
    if (!hh || hh.funds < def.cost) return `Not enough money ($${(def.cost / 100).toFixed(2)}).`;
  }
  return null;
}

/** interactionCheck without the cost check (behaviors that price themselves, e.g. cooking). */
export function interactionCheckNoCost(ctx: SimCtx, p: Person, a: ActionInstance): string | null {
  return interactionCheck(ctx, p, a, true);
}

/** Charges an interaction's cost once when perform begins (occurrence `cost:<actionId>`). */
export function chargeCost(ctx: SimCtx, p: Person, a: ActionInstance): string | null {
  const def = interactionDef(ctx, a.interactionId);
  if (!def?.cost || a.data.charged === true) return null;
  const r = transact(ctx.state, ctx.events, p.householdId, -def.cost, 'groceries', def.name, { occurrence: `cost:${a.id}` });
  if (!r.ok) return `Not enough money ($${(def.cost / 100).toFixed(2)}).`;
  a.data.charged = true;
  return null;
}

/** Reserves the primary use point on the target object (a requested slot first, then the nearest free one). */
export function reservePrimary(ctx: SimCtx, p: Person, a: ActionInstance, kinds?: readonly string[]): string | null {
  const loc = lotLoc(p);
  const ref = targetObject(ctx, p, a);
  if (!loc || !ref || a.target.kind !== 'object') return 'It is gone.';
  const def = defOf(ctx, a);
  let cands = objectCandidates(ctx, loc.lotId, ref.obj.id, kinds ?? def.slotKinds);
  const wanted = a.target.slotId;
  if (wanted) {
    const only = cands.filter((c) => c.slot?.slotId === wanted);
    if (only.length > 0) cands = only;
  }
  const r = pickUsePoint(ctx, p, a, 'use', cands, { plan: true, what: objectName(ctx, ref.def.id) });
  if (r) return r;
  const slot = a.data.useSlot;
  a.target.slotId = typeof slot === 'string' ? slot : null;
  return null;
}

/** Posture at a goal: the slot's posture (a lying activity such as a nap on a sofa lies down); at a
 *  stand tile people stand. */
function postureAt(goal: Step['goal'], def: InteractionDef): Posture {
  if (goal.kind === 'slot') return def.posture === 'lying' ? 'lying' : goal.slot.posture;
  return def.posture === 'seated' || def.posture === 'lying' ? 'standing' : def.posture;
}

/** Step at the primary use point (or in place for self interactions). */
export function primaryStep(ctx: SimCtx, p: Person, a: ActionInstance): Step | string {
  const def = defOf(ctx, a);
  if (def.kind === 'self' || def.kind === 'tile' || !hasUsePoint(a, 'use')) {
    if (def.kind === 'object') return 'It is gone.';
    const posture = def.posture === 'walking' ? 'standing' : def.posture;
    return {
      goal: { kind: 'here' }, posture, performAnim: def.anims.perform,
      ...(def.anims.prepare ? { prepareAnim: def.anims.prepare } : {}),
      ...(def.anims.cleanup ? { cleanupAnim: def.anims.cleanup } : {}),
      duration: defDuration(def), rates: performRates(ctx, p, def, null, null, posture), skill: skillRate(def, null),
    };
  }
  const goal = usePointGoal(ctx, p, a, 'use');
  if (typeof goal === 'string') return goal;
  const ref = usePointObject(ctx, p, a, 'use');
  const posture = postureAt(goal, def);
  return {
    goal, posture, performAnim: def.anims.perform,
    ...(def.anims.prepare ? { prepareAnim: def.anims.prepare } : {}),
    ...(def.anims.cleanup ? { cleanupAnim: def.anims.cleanup } : {}),
    duration: defDuration(def), rates: performRates(ctx, p, def, ref, null, posture), skill: skillRate(def, ref),
  };
}

/** Free seat candidates (sit slots of seating objects) on the person's lot level, filtered. */
export function seatCandidates(
  ctx: SimCtx, p: Person, filter: (slot: { x: number; z: number; facing: number }, ref: ObjRef) => boolean,
): UseCandidate[] {
  const loc = lotLoc(p);
  if (!loc) return [];
  const out: UseCandidate[] = [];
  for (const ref of lotObjects(ctx, loc.lotId, loc.level)) {
    if (!isSeat(ref.def)) continue;
    for (const slot of ctx.nav.slotsOf(loc.lotId, ref.obj.id)) {
      if (slot.kind !== 'sit') continue;
      if (filter(slot, ref)) out.push({ objectId: ref.obj.id, slot });
    }
  }
  return out;
}

/** True when a seat at `slot` looks toward `target` (within about 60 degrees). */
export function seatFaces(slot: { x: number; z: number; facing: number }, target: { x: number; z: number }, minDot = 0.5): boolean {
  const d = dist(slot.x, slot.z, target.x, target.z);
  if (d < 1e-6) return true;
  const f = facingDir(slot.facing);
  return (f.x * (target.x - slot.x) + f.z * (target.z - slot.z)) / d >= minDot;
}

/** Step seated at the reserved seat, using `def` with the primary object's stats. */
function seatStep(ctx: SimCtx, p: Person, a: ActionInstance, def: InteractionDef, primary: ObjRef | null): Step | string {
  const goal = usePointGoal(ctx, p, a, 'seat');
  if (typeof goal === 'string') return goal;
  const seat = usePointObject(ctx, p, a, 'seat');
  const posture: Posture = goal.kind === 'slot' ? goal.slot.posture : 'seated';
  return {
    goal, posture, prepareAnim: 'sitDown', performAnim: def.anims.perform, cleanupAnim: 'standUp',
    duration: defDuration(def), rates: performRates(ctx, p, def, primary, seat, posture), skill: skillRate(def, primary),
  };
}

// ---------------------------------------------------------------------------------------------
// Behaviors
// ---------------------------------------------------------------------------------------------

/** Plain interactions: use a slot or stand next to the object (or act in place for self interactions). */
export const genericBehavior: Behavior = {
  check: interactionCheck,
  reserve(ctx, p, a) {
    return defOf(ctx, a).kind === 'object' ? reservePrimary(ctx, p, a) : null;
  },
  step: primaryStep,
  begin: chargeCost,
  interruptible: true,
};

/** Need-restoring interactions that should not be interrupted for small talk. */
const restoreBehavior: Behavior = { ...genericBehavior, interruptible: false };

function switchOutfit(ctx: SimCtx, p: Person, category: OutfitCategory, index = 0): void {
  const list = p.outfits.outfits[category];
  if (!list || list.length === 0) return;
  const i = Math.max(0, Math.min(index, list.length - 1));
  if (p.outfits.current.category === category && p.outfits.current.index === i) return;
  p.outfits.current = { category, index: i };
  ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'outfit' });
}

/** Sleep: lie in a bed slot until energy is full, wearing the sleep outfit while in bed. */
const sleepBehavior: Behavior = {
  ...restoreBehavior,
  begin(ctx, p, a) {
    const r = chargeCost(ctx, p, a);
    if (r) return r;
    if (a.data.prevOutfit === undefined && (p.outfits.outfits.sleep?.length ?? 0) > 0) {
      a.data.prevOutfit = p.outfits.current.category;
      a.data.prevOutfitIndex = p.outfits.current.index;
      switchOutfit(ctx, p, 'sleep', 0);
    }
    return null;
  },
  end(ctx, p, a) {
    if (a.data.prevOutfit === undefined) return;
    const prev = a.data.prevOutfit as OutfitCategory;
    const idx = typeof a.data.prevOutfitIndex === 'number' ? a.data.prevOutfitIndex : 0;
    switchOutfit(ctx, p, 'everyday', prev === 'everyday' ? idx : 0);
  },
};

/** Watch TV: a free seat within 5 m facing the TV, else stand at the TV's slot. */
const watchTvBehavior: Behavior = {
  check: interactionCheck,
  reserve(ctx, p, a) {
    const tv = targetObject(ctx, p, a);
    if (!tv) return 'It is gone.';
    const c = objectCenter(tv);
    const seats = seatCandidates(ctx, p, (s) => dist(s.x, s.z, c.x, c.z) <= TV_SEAT_RADIUS && seatFaces(s, c));
    if (seats.length > 0 && !pickUsePoint(ctx, p, a, 'seat', seats, { plan: true, what: 'seat' })) return null;
    return reservePrimary(ctx, p, a);
  },
  step(ctx, p, a) {
    if (hasUsePoint(a, 'seat')) {
      const tv = targetObject(ctx, p, a);
      if (!tv) return 'The TV is gone.';
      return seatStep(ctx, p, a, defOf(ctx, a), tv);
    }
    return primaryStep(ctx, p, a);
  },
  begin: chargeCost,
  interruptible: true,
};

/** Computer: sit at a chair in front of the desk when there is one, else stand at the computer. */
const computerBehavior: Behavior = {
  check: interactionCheck,
  reserve(ctx, p, a) {
    const pc = targetObject(ctx, p, a);
    if (!pc) return 'It is gone.';
    const c = objectCenter(pc);
    const seats = seatCandidates(ctx, p, (s) => dist(s.x, s.z, c.x, c.z) <= 1.6 && seatFaces(s, c, 0.3));
    if (seats.length > 0 && !pickUsePoint(ctx, p, a, 'seat', seats, { plan: true, what: 'chair' })) return null;
    return reservePrimary(ctx, p, a);
  },
  step(ctx, p, a) {
    if (hasUsePoint(a, 'seat')) {
      const pc = targetObject(ctx, p, a);
      if (!pc) return 'The computer is gone.';
      return seatStep(ctx, p, a, defOf(ctx, a), pc);
    }
    return primaryStep(ctx, p, a);
  },
  begin: chargeCost,
  interruptible: true,
};

/** Read: take a book from the bookcase, then read at a nearby free seat (or standing). */
const readBehavior: Behavior = {
  check: interactionCheck,
  reserve: (ctx, p, a) => reservePrimary(ctx, p, a),
  step(ctx, p, a) {
    const def = defOf(ctx, a);
    const stage = typeof a.data.stage === 'number' ? a.data.stage : 0;
    if (stage === 0) {
      const goal = usePointGoal(ctx, p, a, 'use');
      if (typeof goal === 'string') return goal;
      return { goal, posture: 'standing', performAnim: 'pickUp', duration: { kind: 'fixed', minutes: 1 }, rates: {} };
    }
    const shelf = objectRef(ctx, lotLoc(p)?.lotId ?? '', typeof a.data.bookFrom === 'string' ? a.data.bookFrom : '');
    if (hasUsePoint(a, 'seat')) return seatStep(ctx, p, a, def, shelf);
    return {
      goal: { kind: 'here' }, posture: 'standing', performAnim: def.anims.perform, duration: defDuration(def),
      rates: performRates(ctx, p, def, shelf, null, 'standing'), skill: skillRate(def, shelf),
    };
  },
  next(ctx, p, a) {
    const stage = typeof a.data.stage === 'number' ? a.data.stage : 0;
    if (stage !== 0) return false;
    const loc = lotLoc(p);
    if (!loc) return `${p.firstName} isn't here.`;
    a.data.bookFrom = typeof a.data.useObj === 'string' ? a.data.useObj : null;
    clearUsePoint(a, 'use');
    a.data.stage = 1;
    a.route = [];
    const seats = seatCandidates(ctx, p, (s) => dist(s.x, s.z, loc.x, loc.z) <= READ_SEAT_RADIUS);
    if (seats.length > 0) pickUsePoint(ctx, p, a, 'seat', seats, { plan: true, what: 'seat' });
    return true;
  },
  begin: chargeCost,
  interruptible: true,
};

function outfitCategory(a: ActionInstance): OutfitCategory | null {
  const c = a.data.category;
  return typeof c === 'string' && (OUTFIT_CATEGORIES as readonly string[]).includes(c) ? (c as OutfitCategory) : null;
}

/** Change outfit at a wardrobe (or in place for a self interaction): data.category, optional data.index. */
const changeOutfitBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    if (r) return r;
    const cat = outfitCategory(a);
    if (!cat) return 'Choose an outfit category.';
    if ((p.outfits.outfits[cat]?.length ?? 0) === 0) return 'No outfits in that category yet.';
    return null;
  },
  reserve(ctx, p, a) { return defOf(ctx, a).kind === 'object' ? reservePrimary(ctx, p, a) : null; },
  step(ctx, p, a) {
    const s = primaryStep(ctx, p, a);
    if (typeof s === 'string') return s;
    const d = defOf(ctx, a).duration;
    return { ...s, posture: 'standing', duration: { kind: 'fixed', minutes: d.kind === 'fixed' && d.minutes > 0 ? d.minutes : 2 } };
  },
  apply(ctx, p, a) {
    const cat = outfitCategory(a);
    if (cat) switchOutfit(ctx, p, cat, typeof a.data.index === 'number' ? a.data.index : 0);
  },
};

/** Edit outfits at the wardrobe: asks the UI to open the wardrobe editor. */
const editOutfitsBehavior: Behavior = {
  check: interactionCheck,
  reserve(ctx, p, a) { return defOf(ctx, a).kind === 'object' ? reservePrimary(ctx, p, a) : null; },
  step(ctx, p, a) {
    const s = primaryStep(ctx, p, a);
    if (typeof s === 'string') return s;
    return { ...s, posture: 'standing', duration: { kind: 'fixed', minutes: 1 } };
  },
  apply(ctx, p) {
    ctx.events.emit({ type: 'ui.request', what: 'editOutfits', personId: p.id });
  },
};

// ---------------------------------------------------------------------------------------------
// Registry (built lazily so module import order never matters)
// ---------------------------------------------------------------------------------------------

let registry: Record<string, Behavior> | null = null;

function buildRegistry(): Record<string, Behavior> {
  return {
    generic: genericBehavior,
    sit: genericBehavior,
    rest: restoreBehavior,
    snack: restoreBehavior,
    toilet: restoreBehavior,
    shower: restoreBehavior,
    sleep: sleepBehavior,
    watchTv: watchTvBehavior,
    computer: computerBehavior,
    read: readBehavior,
    changeOutfit: changeOutfitBehavior,
    editOutfits: editOutfitsBehavior,
    cook: cookBehavior,
    eatMeal: eatMealBehavior,
    goToWork: goToWorkBehavior,
    goHere: goHereBehavior,
    leaveLot: leaveLotBehavior,
    invite: inviteBehavior,
    phoneChat: phoneChatBehavior,
    social: socialBehavior,
  };
}

/** Behavior ids the simulation implements (content `behavior` values outside this list run as 'generic'). */
export function knownBehaviors(): string[] {
  registry ??= buildRegistry();
  return Object.keys(registry);
}

/** Behavior implementation for a behavior id (unknown ids use the generic behavior). */
export function behaviorById(id: string): Behavior {
  registry ??= buildRegistry();
  return registry[id] ?? genericBehavior;
}

/** Behavior for an action, or null when the interaction is unknown. */
export function behaviorFor(ctx: SimCtx, a: Pick<ActionInstance, 'interactionId'>): Behavior | null {
  const id = behaviorOf(ctx, a.interactionId);
  return id ? behaviorById(id) : null;
}
