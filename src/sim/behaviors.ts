// Interaction behaviors for objects and self interactions (sleep, sit, toilet, shower, snack, TV,
// computer, reading, outfits) and the behavior registry. Cooking, travel and social behaviors live in
// cooking.ts, travel.ts and social.ts.

import { offeredInteractionIds } from '../content/capabilities';
import { BOOK_MAX_LEVEL, creativityPay, photoSaleMult, researchPaperMult } from '../content/skillEffects';
import { fishPortionValue, fishSpecies, resolveCatch } from '../content/fishing';
import type { InteractionDef } from '../content/types';
import { facingDir } from '../core/geometry';
import { newId } from '../core/ids';
import { addFeed, transact } from '../core/state';
import type { ActionInstance, OutfitCategory, Person, Posture } from '../core/types';
import { OUTFIT_CATEGORIES } from '../core/types';
import type { ObjRef, SimCtx } from './context';
import {
  behaviorOf, dist, hashString, interactionDef, isSeat, isVisitor, lotLoc, lotObjects, objectCenter, objectName, objectRef, venueRestriction,
} from './context';
import { bakeBehavior } from './baking';
import { cookBehavior, eatMealBehavior } from './cooking';
import { gardenBehavior } from './garden';
import { needsPower, powerIsOff } from './economy';
import { BROKEN_OK_BEHAVIORS, isBroken } from './housekeeping';
import { callRepairBehavior, cleanBehavior, mopBehavior, repairBehavior, serviceBehavior, tidyBehavior, washDishesBehavior } from './housework';
import { getOutBehavior, paddleBehavior, poolSwimBehavior } from './pool';
import { placePot, storeFishBehavior } from './furnishings';
import { isOutdoors, nearestOutdoorTile } from './weather';
import { makePlacedObject } from '../world/objects';
import { validatePlacement } from '../world/placement';
import { socialBehavior } from './social';
import type { Behavior, Step, UseCandidate } from './steps';
import {
  candidateFree, defDuration, hasUsePoint, objectCandidates, performRates, pickUsePoint, skillRate, usePointGoal, usePointObject,
  clearUsePoint,
} from './steps';
import {
  goHereBehavior, goToSchoolBehavior, goToWorkBehavior, inviteBehavior, inviteHomeBehavior, leaveLotBehavior, phoneChatBehavior, phoneDateBehavior, planEventBehavior,
  travelToBehavior,
} from './travel';
import {
  MEAL_SPOIL_MINUTES, READ_SEAT_RADIUS, SLEEP_NIGHT_BEDTIME, SLEEP_NIGHT_END, SLEEP_WAKE_BEFORE_SHIFT, SLEEP_WAKE_MINUTE, SLEEP_WAKE_SPREAD,
  TV_SEAT_RADIUS,
} from './tuning';
import { atDayMinute, dayIndex, hourOfDay } from '../core/clock';
import { nextShift } from './careers';
import { ageUp, ageUpProblem } from './aging';
import { adoptionStartProblem } from './adoption';
import { careBehavior } from './care';
import { completeHomework, homeworkProblem, nextSchoolDay } from './school';
import { addMoodlet } from './mood';

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

/**
 * Whose utilities power the object a person is using: the owner of the lot (a home), nobody's for a public venue, else
 * the person's own household.
 */
function powerHouseholdOf(ctx: SimCtx, p: Person): string {
  const loc = lotLoc(p);
  const lot = loc ? ctx.state.lots[loc.lotId] : undefined;
  if (lot?.kind === 'venue') return '';
  const owner = lot?.ownerHouseholdId;
  return owner && ctx.state.households[owner] ? owner : p.householdId;
}

/** Checks shared by object and self interactions: target present, visitor rules, affordability. */
export function interactionCheck(ctx: SimCtx, p: Person, a: ActionInstance, ignoreCost = false): string | null {
  const def = interactionDef(ctx, a.interactionId);
  if (!def) return 'That interaction is not available.';
  if (isVisitor(ctx, p) && !def.allowVisitors) return 'Only residents can do that.';
  const restricted = venueRestriction(ctx, p, def);
  if (restricted) return restricted;
  if (def.requiresSkill) {
    const { id, level } = def.requiresSkill;
    const have = p.skills[id]?.level ?? 1;
    if (have < level) return `Needs ${ctx.content.skills[id]?.name ?? 'skill'} level ${level}.`;
  }
  if (def.kind === 'object') {
    if (a.target.kind !== 'object') return 'Pick an object.';
    const ref = targetObject(ctx, p, a);
    if (!ref) return 'It is gone.';
    if (!offeredInteractionIds(ref.def).includes(def.id)) return `Can't do that with the ${objectName(ctx, ref.def.id)}.`;
    if (isBroken(ref.obj) && !BROKEN_OK_BEHAVIORS.has(def.behavior ?? 'generic')) return 'Broken';
    if (needsPower(ref.def) && powerIsOff(ctx.state, powerHouseholdOf(ctx, p))) return 'Power is off';
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

/**
 * Milestone 12, task O: an activity that has to happen in the open air. If the person is indoors they walk to the
 * nearest walkable outdoor tile on the lot first; everything else is the generic step.
 */
function outdoorStep(ctx: SimCtx, p: Person, a: ActionInstance): Step | string {
  if (isOutdoors(ctx, p)) return primaryStep(ctx, p, a);
  const def = defOf(ctx, a);
  const tile = nearestOutdoorTile(ctx, p);
  if (!tile) return 'There is nowhere outdoors to do this.';
  const posture = def.posture === 'walking' ? 'standing' : def.posture;
  return {
    goal: { kind: 'tile', tile, label: 'outdoors' }, posture, performAnim: def.anims.perform,
    ...(def.anims.prepare ? { prepareAnim: def.anims.prepare } : {}),
    ...(def.anims.cleanup ? { cleanupAnim: def.anims.cleanup } : {}),
    duration: defDuration(def), rates: performRates(ctx, p, def, null, null, posture), skill: skillRate(def, null),
  };
}

const outdoorBehavior: Behavior = { ...genericBehavior, step: outdoorStep };

/** Build a Snowman: an outdoor activity that leaves a snowman on a free tile next to the builder. */
const buildSnowmanBehavior: Behavior = {
  ...genericBehavior,
  step: outdoorStep,
  apply(ctx, p) {
    const loc = lotLoc(p);
    const def = ctx.content.objects.snowman;
    if (!loc || !def) return;
    const lot = ctx.state.lots[loc.lotId];
    if (!lot) return;
    const from = { x: Math.floor(loc.x), z: Math.floor(loc.z), level: loc.level };
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const x = from.x + dx, z = from.z + dz;
        const v = validatePlacement(ctx.state, ctx.content, lot.id, { defId: def.id, x, z, rot: 0, level: from.level });
        if (!v.ok) continue;
        const obj = makePlacedObject(ctx.state, def, { x, z, rot: 0, level: from.level },
          { ownerHouseholdId: lot.ownerHouseholdId, purchasePrice: 0, boughtAt: ctx.now });
        obj.snowman = { madeAt: ctx.now, warmDays: 0 };
        lot.objects[obj.id] = obj;
        ctx.events.emit({ type: 'lot.changed', lotId: lot.id, what: 'objects' });
        return;
      }
    }
  },
};

/** Changes the outfit and notifies the renderer (swim uses this too, sim/pool.ts). */
export function switchOutfit(ctx: SimCtx, p: Person, category: OutfitCategory, index = 0): void {
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
  step(ctx, p, a) {
    const s = primaryStep(ctx, p, a);
    // Night sleep lasts until the morning wake time instead of stopping at full energy.
    if (typeof s === 'string' || typeof a.data.wakeAt !== 'number') return s;
    return { ...s, duration: { kind: 'external' } };
  },
  tick(ctx, p, a) {
    if (typeof a.data.wakeAt !== 'number') return null;
    if (ctx.now >= a.data.wakeAt || a.elapsed >= 13 * 60) return 'done';
    // Wake early for a bursting bladder or real hunger.
    return p.needs.bladder < 8 || p.needs.hunger < 8 ? 'done' : null;
  },
  begin(ctx, p, a) {
    const r = chargeCost(ctx, p, a);
    if (r) return r;
    if (a.data.wakeAt === undefined) {
      const wake = morningWake(ctx, p);
      if (wake !== null) a.data.wakeAt = wake;
    }
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

/**
 * When sleep starts in the evening or at night: the next morning wake time (06:30-07:45, spread per
 * person), earlier when a shift starts soon. Null for daytime sleep, which ends when rested.
 */
function morningWake(ctx: SimCtx, p: Person): number | null {
  const h = hourOfDay(ctx.now);
  if (!(h >= SLEEP_NIGHT_BEDTIME || h < SLEEP_NIGHT_END)) return null;
  const day = h >= SLEEP_NIGHT_BEDTIME ? dayIndex(ctx.now) + 1 : dayIndex(ctx.now);
  let wake = atDayMinute(day, SLEEP_WAKE_MINUTE + (hashString(p.id) % (SLEEP_WAKE_SPREAD / 15 + 1)) * 15);
  const shift = nextShift(ctx.state, ctx.content, p, ctx.now);
  if (shift && shift.start - SLEEP_WAKE_BEFORE_SHIFT < wake) wake = Math.max(ctx.now + 60, shift.start - SLEEP_WAKE_BEFORE_SHIFT);
  // Pupils are up in time for school.
  const school = p.school ? nextSchoolDay(ctx.state, ctx.content, p, ctx.now) : null;
  if (school && school.start - SLEEP_WAKE_BEFORE_SHIFT < wake && school.start - ctx.now < 24 * 60) wake = Math.max(ctx.now + 60, school.start - SLEEP_WAKE_BEFORE_SHIFT);
  return wake;
}

/** Seats a TV can be watched from: within 5 m and facing it. */
function tvSeats(ctx: SimCtx, p: Person, tv: ObjRef): UseCandidate[] {
  const c = objectCenter(tv);
  return seatCandidates(ctx, p, (s) => dist(s.x, s.z, c.x, c.z) <= TV_SEAT_RADIUS && seatFaces(s, c));
}

/** Chairs in front of a computer. */
function computerSeats(ctx: SimCtx, p: Person, pc: ObjRef): UseCandidate[] {
  const c = objectCenter(pc);
  return seatCandidates(ctx, p, (s) => dist(s.x, s.z, c.x, c.z) <= 1.6 && seatFaces(s, c, 0.3));
}

/**
 * Whether the person could start this interaction on the object right now as far as free spots go
 * (slots, stand tiles, seats sharing a slot's spot, and the TV/computer seat alternatives).
 * Objects without any use point return true (the action then fails with its own reason).
 */
export function freeUsePointExists(ctx: SimCtx, p: Person, def: InteractionDef, objectId: string): boolean {
  const loc = lotLoc(p);
  const ref = loc ? objectRef(ctx, loc.lotId, objectId) : null;
  if (!loc || !ref) return false;
  const cands = objectCandidates(ctx, loc.lotId, objectId, def.slotKinds);
  if (cands.some((c) => candidateFree(ctx, loc.lotId, loc.level, c))) return true;
  const seats = def.behavior === 'watchTv' ? tvSeats(ctx, p, ref) : def.behavior === 'computer' ? computerSeats(ctx, p, ref) : [];
  if (seats.some((c) => candidateFree(ctx, loc.lotId, loc.level, c))) return true;
  return cands.length === 0 && seats.length === 0;
}

/** Watch TV: a free seat within 5 m facing the TV, else stand at the TV's slot. */
const watchTvBehavior: Behavior = {
  check: interactionCheck,
  reserve(ctx, p, a) {
    const tv = targetObject(ctx, p, a);
    if (!tv) return 'It is gone.';
    const seats = tvSeats(ctx, p, tv);
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
    const seats = computerSeats(ctx, p, pc);
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

/**
 * Freelance work (Milestone 6): articles, books, programming gigs, paintings and busking. The action trains its
 * skill as usual; on completion it sells the result for a fee that scales with that skill. Payment goes through
 * transact with occurrence `freelance:<personId>:<actionId>`, so a completed sale can never pay twice.
 */
const FREELANCE_BASE: Record<string, number> = {
  writeArticle: 1800, writeBook: 9000, programGig: 3200, paintToSell: 2400, busk: 600, sellPhotos: 2400, writePaper: 4200,
  sellBakes: 2600, sellPottery: 2200,
};

/** Freelance work whose fee also grows with the Creativity skill (paintings, writing, music and baking). */
const CREATIVE_FREELANCE = new Set(['writeArticle', 'writeBook', 'paintToSell', 'busk', 'sellBakes', 'sellPottery']);

/** The skill level needed for a freelance action that is gated (photography sales at 2, research papers at 5). */
const FREELANCE_LEVEL: Record<string, number> = { sellPhotos: 2, writePaper: 5 };

export function freelanceFee(interactionId: string, skillLevel: number, creativityLevel = 1): number {
  const base = FREELANCE_BASE[interactionId] ?? 1000;
  const raw = base * (0.55 + Math.max(1, Math.min(10, skillLevel)) * 0.12);
  const mult = interactionId === 'sellPhotos' ? photoSaleMult(skillLevel)
    : interactionId === 'writePaper' ? researchPaperMult(skillLevel) : 1;
  const creative = CREATIVE_FREELANCE.has(interactionId) ? creativityPay(creativityLevel) : 1;
  return Math.max(100, Math.round(raw * mult * creative));
}

const freelanceBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    if (r) return r;
    const def = defOf(ctx, a);
    const need = FREELANCE_LEVEL[def.id];
    if (need !== undefined) {
      const skillId = def.skill?.id;
      const level = skillId ? p.skills[skillId]?.level ?? 1 : 1;
      if (level < need) return `Needs ${ctx.content.skills[skillId ?? '']?.name ?? 'skill'} level ${need}.`;
    }
    return null;
  },
  reserve(ctx, p, a) {
    const target = targetObject(ctx, p, a);
    if (target?.def.tags.includes('computer')) {
      const seats = computerSeats(ctx, p, target);
      if (seats.length > 0 && !pickUsePoint(ctx, p, a, 'seat', seats, { plan: true, what: 'chair' })) return null;
    }
    return defOf(ctx, a).kind === 'object' ? reservePrimary(ctx, p, a) : null;
  },
  step(ctx, p, a) {
    const target = targetObject(ctx, p, a);
    if (target?.def.tags.includes('computer') && hasUsePoint(a, 'seat')) {
      return seatStep(ctx, p, a, defOf(ctx, a), target);
    }
    return primaryStep(ctx, p, a);
  },
  begin: chargeCost,
  apply(ctx, p, a) {
    const def = defOf(ctx, a);
    const skillId = def.skill?.id;
    const level = skillId ? p.skills[skillId]?.level ?? 1 : 1;
    const fee = freelanceFee(def.id, level, p.skills.creativity?.level ?? 1);
    const r = transact(ctx.state, ctx.events, p.householdId, fee, 'sale', `${def.name} (${p.firstName})`, { occurrence: `freelance:${p.id}:${a.id}` });
    if (r.ok) {
      const quality = level >= 7 ? 'a strong piece' : level >= 4 ? 'a solid piece' : 'a modest piece';
      const what = def.id === 'sellPhotos' ? 'a set of photo prints' : def.id === 'writePaper' ? 'a research paper' : quality;
      addFeed(ctx.state, ctx.events, 'money', `${p.firstName} sold ${what} for $${(fee / 100).toFixed(2)}.`, p.id);
    }
  },
  interruptible: true,
};

/**
 * Photography practice (Milestone 11, task C): take photos at a camera tripod (or on a photo walk at an outdoor
 * venue, Photography 3+). The action trains Photography; the pictures themselves are only described in the feed.
 * Selling prints is freelance work (sellPhotos) and pays once with a once-only occurrence id.
 */
const photoBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    if (r) return r;
    if (defOf(ctx, a).id === 'photoWalk' && (p.skills.photography?.level ?? 1) < 3) return 'Needs Photography level 3.';
    return null;
  },
  reserve: (ctx, p, a) => (defOf(ctx, a).kind === 'object' ? reservePrimary(ctx, p, a) : null),
  step: primaryStep,
  begin: chargeCost,
  apply(ctx, p) {
    addFeed(ctx.state, ctx.events, 'info', `${p.firstName} spent a while behind the camera.`, p.id);
  },
  interruptible: true,
};

/**
 * Fishing (Milestone 11, task C): fish the garden pond at home, or the lake at the park (Fishing 2+). The catch is
 * resolved once on completion from stable hashes of the person and the action, so saving and loading cannot reroll
 * it. Higher levels unlock better species, more fish per trip and, from level 8, never an empty line. The fish are
 * placed on the floor at the angler's feet as a 'fish' world item: eat them like a meal portion or sell them.
 */
const fishBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    if (r) return r;
    if (defOf(ctx, a).id === 'fishVenue' && (p.skills.fishing?.level ?? 1) < 2) return 'Needs Fishing level 2.';
    return null;
  },
  reserve: (ctx, p, a) => (defOf(ctx, a).kind === 'object' ? reservePrimary(ctx, p, a) : null),
  step: primaryStep,
  begin: chargeCost,
  apply(ctx, p, a) {
    const loc = lotLoc(p);
    if (!loc) return;
    const level = p.skills.fishing?.level ?? 1;
    const h = hashString(`fish:${p.id}:${a.id}`);
    const caught = resolveCatch(level, (h % 1000) / 1000, (Math.floor(h / 1000) % 1000) / 1000);
    if (!caught.species || caught.portions <= 0) {
      addFeed(ctx.state, ctx.events, 'info', `${p.firstName} fished for a while, but nothing was biting.`, p.id);
      return;
    }
    const item = {
      id: newId(ctx.state, 'itm'),
      kind: 'fish' as const,
      lotId: loc.lotId,
      position: { x: loc.x + 0.5, z: loc.z + 0.5, level: loc.level },
      recipeId: caught.species.id,
      portions: caught.portions,
      quality: 1,
      createdAt: ctx.now,
      spoilsAt: ctx.now + MEAL_SPOIL_MINUTES,
      ownerHouseholdId: p.householdId,
    };
    ctx.state.items[item.id] = item;
    ctx.events.emit({ type: 'item.changed', itemId: item.id, lotId: item.lotId });
    const many = caught.portions > 1 ? ` ${caught.portions} of them` : '';
    addFeed(ctx.state, ctx.events, 'info', `${p.firstName} caught a ${caught.species.name}${many}.`, p.id);
  },
  interruptible: true,
};

/** Sell a caught fish (item interaction): paid once per item with occurrence `fishsell:<itemId>`. */
const sellCatchBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    if (r) return r;
    const item = a.target.kind === 'item' ? ctx.state.items[a.target.itemId] : undefined;
    if (!item || item.kind !== 'fish') return 'The fish is gone.';
    if (item.ownerHouseholdId && item.ownerHouseholdId !== p.householdId) return "That's someone else's catch.";
    return null;
  },
  reserve: () => null,
  step(ctx, _p, a): Step | string {
    const item = a.target.kind === 'item' ? ctx.state.items[a.target.itemId] : undefined;
    if (!item) return 'The fish is gone.';
    return {
      goal: {
        kind: 'tile',
        tile: { x: Math.floor(item.position.x), z: Math.floor(item.position.z), level: item.position.level },
        face: { x: item.position.x, z: item.position.z },
        label: 'the fish',
      },
      posture: 'standing', performAnim: 'interact', duration: { kind: 'fixed', minutes: 10 }, rates: {},
    };
  },
  apply(ctx, p, a) {
    const item = a.target.kind === 'item' ? ctx.state.items[a.target.itemId] : undefined;
    if (!item || item.kind !== 'fish') return;
    const species = fishSpecies(item.recipeId);
    const level = p.skills.fishing?.level ?? 1;
    const value = species ? fishPortionValue(species, level) * item.portions : 200;
    const r = transact(ctx.state, ctx.events, p.householdId, value, 'sale', `Fish (${p.firstName})`, { occurrence: `fishsell:${item.id}` });
    if (!r.ok) return;
    delete ctx.state.items[item.id];
    ctx.events.emit({ type: 'item.changed', itemId: item.id, lotId: item.lotId });
    addFeed(ctx.state, ctx.events, 'money', `${p.firstName} sold ${species?.name ?? 'a fish'} for $${(value / 100).toFixed(2)}.`, p.id);
  },
  interruptible: false,
};

/** Throw a Pot (Milestone 13): a timed activity at the wheel that leaves a handmade pot on a free tile. */
const potteryBehavior: Behavior = { ...genericBehavior, apply: (ctx, p) => placePot(ctx, p) };

/** Do the Laundry (Milestone 13): a timed chore at a washer or dryer; its door and drum follow the running action (render). */
const laundryBehavior: Behavior = { ...genericBehavior };

/** Phone or mailbox shortcuts that open the household bills panel. */
const openBillsBehavior: Behavior = {
  check: interactionCheck,
  reserve: () => null,
  step: primaryStep,
  apply(ctx, p) { ctx.events.emit({ type: 'ui.request', what: 'bills', personId: p.id }); },
};

/** Phone or computer job search: opens the career panel, where a new job can be taken or the current one quit. */
const openCareersBehavior: Behavior = {
  check: interactionCheck,
  reserve: (ctx, p, a) => (defOf(ctx, a).kind === 'object' ? reservePrimary(ctx, p, a) : null),
  step: primaryStep,
  apply(ctx, p) { ctx.events.emit({ type: 'ui.request', what: 'careers', personId: p.id }); },
};

/** Skills a skill book (readSkillBook, data.skillId) can teach, and the title of each book. */
export const SKILL_BOOKS: Readonly<Record<string, string>> = {
  cooking: 'Cookbook', handiness: 'Home Repair Manual', gardening: 'Gardening Almanac', charisma: 'Public Speaking Guide',
  programming: 'Programming Primer',
};

/** The skill a read action trains: the book's skill for readSkillBook, else the interaction's own skill. */
function bookSkill(def: InteractionDef, a: ActionInstance, shelf: ObjRef | null): Step['skill'] {
  if (def.id !== 'readSkillBook') return skillRate(def, shelf);
  const id = a.data.skillId;
  if (typeof id !== 'string' || !(id in SKILL_BOOKS)) return undefined;
  return { id, xpPerHour: def.skill ? def.skill.xpPerHour * (shelf?.def.stats.skill ?? 1) : 0 };
}

/** Read: take a book from the bookcase, then read at a nearby free seat (or standing). */
const readBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    if (r || a.interactionId !== 'readSkillBook') return r;
    const id = a.data.skillId;
    if (typeof id !== 'string' || !(id in SKILL_BOOKS) || !ctx.content.skills[id]) return 'Choose a book to study.';
    return (p.skills[id]?.level ?? 1) >= BOOK_MAX_LEVEL ? `Nothing new in these books (${ctx.content.skills[id]!.name} ${BOOK_MAX_LEVEL}+).` : null;
  },
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
    if (hasUsePoint(a, 'seat')) {
      const s = seatStep(ctx, p, a, def, shelf);
      return typeof s === 'string' ? s : { ...s, skill: bookSkill(def, a, shelf) };
    }
    return {
      goal: { kind: 'here' }, posture: 'standing', performAnim: def.anims.perform, duration: defDuration(def),
      rates: performRates(ctx, p, def, shelf, null, 'standing'), skill: bookSkill(def, a, shelf),
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

/** Homework (Milestone 8): at a desk, table or computer, sitting down at a chair in front of it when there is one. */
const homeworkBehavior: Behavior = {
  ...computerBehavior,
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    return r ?? homeworkProblem(ctx, p);
  },
  apply(ctx, p) { completeHomework(ctx, p, false); },
};

/** Phone or computer: the adoption agency (Milestone 8) opens the adoption dialog. */
const openAdoptBehavior: Behavior = {
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    return r ?? adoptionStartProblem(ctx, p);
  },
  reserve: (ctx, p, a) => (defOf(ctx, a).kind === 'object' ? reservePrimary(ctx, p, a) : null),
  step: primaryStep,
  apply(ctx, p) { ctx.events.emit({ type: 'ui.request', what: 'adopt', personId: p.id }); },
};

/** Age up now at a birthday cake (Milestone 8): the birthday comes early, the people around celebrate. */
const ageUpBehavior: Behavior = {
  ...genericBehavior,
  check(ctx, p, a) {
    const r = interactionCheck(ctx, p, a);
    return r ?? ageUpProblem(ctx, p);
  },
  apply(ctx, p) {
    const loc = lotLoc(p);
    const r = ageUp(ctx, p, 'cake');
    if (!r.ok || !loc) return;
    for (const o of Object.values(ctx.state.people)) {
      const ol = lotLoc(o);
      if (o.id === p.id || !ol || ol.lotId !== loc.lotId || dist(ol.x, ol.z, loc.x, loc.z) > 6) continue;
      addMoodlet(ctx.content, o, 'celebrating', ctx.now, 'birthday');
    }
  },
  interruptible: false,
};

// ---------------------------------------------------------------------------------------------
// Registry (built lazily so module import order never matters)
// ---------------------------------------------------------------------------------------------

let registry: Record<string, Behavior> | null = null;

function buildRegistry(): Record<string, Behavior> {
  return {
    generic: genericBehavior,
    outdoor: outdoorBehavior,
    buildSnowman: buildSnowmanBehavior,
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
    bake: bakeBehavior,
    eatMeal: eatMealBehavior,
    clean: cleanBehavior,
    washDishes: washDishesBehavior,
    mop: mopBehavior,
    tidy: tidyBehavior,
    repair: repairBehavior,
    service: serviceBehavior,
    callRepair: callRepairBehavior,
    goToWork: goToWorkBehavior,
    goToSchool: goToSchoolBehavior,
    care: careBehavior,
    homework: homeworkBehavior,
    ageUp: ageUpBehavior,
    openAdopt: openAdoptBehavior,
    goHere: goHereBehavior,
    leaveLot: leaveLotBehavior,
    travelTo: travelToBehavior,
    inviteHome: inviteHomeBehavior,
    invite: inviteBehavior,
    phoneChat: phoneChatBehavior,
    phoneDate: phoneDateBehavior,
    planEvent: planEventBehavior,
    freelance: freelanceBehavior,
    photo: photoBehavior,
    fish: fishBehavior,
    sellCatch: sellCatchBehavior,
    openBills: openBillsBehavior,
    openCareers: openCareersBehavior,
    social: socialBehavior,
    garden: gardenBehavior,
    poolSwim: poolSwimBehavior,
    getOut: getOutBehavior,
    paddle: paddleBehavior,
    pottery: potteryBehavior,
    storeFish: storeFishBehavior,
    laundry: laundryBehavior,
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
