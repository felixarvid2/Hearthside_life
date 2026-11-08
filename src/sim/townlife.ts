// The light schedule (Milestone 7): what everyone outside the player's household does while the player is busy on the
// active lot. Nothing here walks anywhere. A person's day is a pure function of the world (their job, traits, likes, the
// day and the 90-minute slot), so the same minute always gives the same answer; the world only moves people when a
// 30-minute boundary passes (`syncPresence`), and pays jobs and bills from timestamps (`lightCareers`, `lightBills`).
//
// Who is where:
// - at work during a shift (with a short commute), at home at night;
// - otherwise, in free time, each 90-minute slot they either stay home or visit an open public venue, chosen by their
//   traits and likes, with at most `VenueInfo.capacity` people per venue;
// - people who are on a lot as guests, in an event, about to visit or in a conversation are left alone until they are free.
//
// On the active lot the same decisions show as people walking in (from the lot entry) and leaving (the `leaveLot`
// action); everywhere else they just change their off-lot location, so "who is at the park" is always readable from the
// state and survives saving, loading and lot changes.

import type { ContentDB } from '../content/types';
import { dayIndex, minuteOfDay, weekday } from '../core/clock';
import { isProcessed, markProcessed, transact } from '../core/state';
import type { Id, Lot, Person, PersonLocation, WorldState } from '../core/types';
import { lotIsOpen, venueInfo } from '../world/neighbourhood';
import type { SimCtx } from './context';
import { clamp, hashString, lotLoc } from './context';
import { billBreakdown, billWeek, openBills, payBill } from './economy';
import { atVenueEvent, inActiveEvent } from './events';
import { entrySpots, homeLocation, isControlled, placeOnLot, takeOffLot, visitingLocation } from './places';
import { insertAction, makeAction } from './queue';
import { applyRelDelta, peekRel } from './relationships';
import { beginLightShift, shiftOn } from './careers';
import { beginLightSchool, lightSchool, schoolDayOn } from './school';
import { isDependentStage } from '../core/lifeStages';
import { walkInTile } from './travel';
import type { ActionData } from './types';

export type Place = { kind: 'home' } | { kind: 'work' } | { kind: 'school' } | { kind: 'venue'; lotId: Id };

/** Slots of the free-time day: 07:00 to 22:30 in 90-minute blocks. */
export const SLOT_MINUTES = 90;
export const DAY_START = 7 * 60;
export const DAY_END = 22 * 60 + 30;
/** NPCs are shown at work this many minutes before the shift starts. */
export const WORK_LEAD_MINUTES = 20;
/** Friendship that light socialising at venues never takes past this value. */
export const LIGHT_FRIENDSHIP_CAP = 35;

const HOME: Place = { kind: 'home' };

/** The venue lots, in lot order. */
export function venueLots(state: WorldState): Lot[] {
  return Object.values(state.lots).filter((l) => venueInfo(l) !== undefined);
}

/** How much a person likes a kind of venue (higher = more often), from traits and likes. */
export function venueWeight(content: ContentDB, p: Person, venueType: string): number {
  let w = 2;
  const bias = (key: string): number => p.traits.reduce((m, t) => m * (content.traits[t]?.effects.autonomyBias?.[key] ?? 1), 1);
  const likes = (tag: string) => (p.likes.includes(tag) ? 1.8 : 1) * (p.dislikes.includes(tag) ? 0.5 : 1);
  switch (venueType) {
    case 'park': w = 3 * bias('social') * likes('topic:nature') * likes('activity:gardening'); break;
    case 'cafe': w = 3 * bias('social') * bias('cookMeal') * likes('food:breakfast') * likes('topic:food'); break;
    case 'gym': w = 2 * bias('active') * likes('activity:fitness') * likes('topic:sports'); break;
    case 'library': w = 2 * bias('reading') * likes('activity:reading') * likes('topic:books'); break;
    case 'arts': w = 2 * bias('creative') * bias('music') * likes('activity:music') * likes('activity:dance') * likes('topic:music'); break;
    case 'market': w = 2.5 * bias('cookMeal') * likes('activity:cooking') * likes('topic:food'); break;
    case 'pool': w = 2.2 * bias('active') * likes('activity:fitness') * likes('activity:swim'); break;
    default: break;
  }
  return Math.max(0.2, w);
}

/**
 * Where a person (outside the player's household) is supposed to be at `now`, ignoring venue capacity. Pure and
 * deterministic: it reads the person's job, traits and likes and the clock, never the random generator.
 */
export function plannedPlace(state: WorldState, content: ContentDB, p: Person, now: number): Place {
  const day = dayIndex(now), mod = minuteOfDay(now);
  // Babies and toddlers stay at home; pupils are at school during school hours (Milestone 8).
  if (isDependentStage(p.lifeStage)) return HOME;
  const sw = schoolDayOn(content, p, day);
  if (sw && now >= sw.start - WORK_LEAD_MINUTES && now < sw.end) return { kind: 'school' };
  if (p.career) {
    for (const d of [day - 1, day]) {
      const w = shiftOn(content, p, d);
      if (w && now >= w.start - WORK_LEAD_MINUTES && now < w.end) return { kind: 'work' };
    }
  }
  if (mod < DAY_START || mod >= DAY_END) return HOME;
  const slot = Math.floor((mod - DAY_START) / SLOT_MINUTES);
  const slotStart = DAY_START + slot * SLOT_MINUTES;
  // No outing right before a shift.
  if (p.career) {
    const w = shiftOn(content, p, day);
    if (w && w.start > now && w.start < now + SLOT_MINUTES + 60) return HOME;
  }
  const weekend = weekday(now) >= 5;
  const social = p.traits.reduce((m, t) => m * (content.traits[t]?.effects.autonomyBias?.social ?? 1), 1);
  const goChance = (weekend ? 70 : slotStart >= 17 * 60 ? 58 : 36) + (social > 1 ? 12 : social < 1 ? -12 : 0);
  if (hashString(`${p.id}:${day}:${slot}:go`) % 100 >= goChance) return HOME;
  const open = venueLots(state).filter((l) => lotIsOpen(l, slotStart) && lotIsOpen(l, Math.min(slotStart + SLOT_MINUTES - 1, mod)));
  if (open.length === 0) return HOME;
  const weights = open.map((l) => venueWeight(content, p, l.venueType ?? ''));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = (hashString(`${p.id}:${day}:${slot}:where`) % 10000) / 10000 * total;
  for (let i = 0; i < open.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return { kind: 'venue', lotId: open[i]!.id };
  }
  return { kind: 'venue', lotId: open[open.length - 1]!.id };
}

/** Everyone outside the player's household. */
export function npcPeople(state: WorldState): Person[] {
  return Object.values(state.people).filter((p) => !isControlled(state, p));
}

/**
 * Plans for everyone outside the household at `now`, with venue capacity applied (people who do not fit change their
 * mind and stay home, in a stable order). Keyed by person id.
 */
export function plansAt(state: WorldState, content: ContentDB, now: number): Map<Id, Place> {
  const plans = new Map<Id, Place>();
  const byVenue = new Map<Id, Person[]>();
  for (const p of npcPeople(state)) {
    const place = plannedPlace(state, content, p, now);
    plans.set(p.id, place);
    if (place.kind === 'venue') {
      const list = byVenue.get(place.lotId) ?? [];
      list.push(p);
      byVenue.set(place.lotId, list);
    }
  }
  const slot = Math.floor((minuteOfDay(now) - DAY_START) / SLOT_MINUTES);
  const day = dayIndex(now);
  for (const [lotId, list] of byVenue) {
    const cap = venueInfo(state.lots[lotId]!)?.capacity ?? 4;
    if (list.length <= cap) continue;
    list.sort((a, b) => hashString(`${a.id}:${day}:${slot}:cap`) - hashString(`${b.id}:${day}:${slot}:cap`) || (a.id < b.id ? -1 : 1));
    for (const p of list.slice(cap)) plans.set(p.id, HOME);
  }
  return plans;
}

/** Who the light schedule has at a lot right now (venue patrons or residents who are home), by person id. */
export function whoIsPlannedAt(state: WorldState, content: ContentDB, lotId: Id, now: number): Id[] {
  const lot = state.lots[lotId];
  if (!lot) return [];
  const plans = plansAt(state, content, now);
  const out: Id[] = [];
  for (const p of npcPeople(state)) {
    const plan = plans.get(p.id) ?? HOME;
    if (plan.kind === 'venue' && plan.lotId === lotId) out.push(p.id);
    else if (plan.kind === 'home' && state.households[p.householdId]?.homeLotId === lotId) out.push(p.id);
  }
  return out;
}

/**
 * How much the light schedule leaves a person alone: 'hard' (in transit, a guest on a lot, in a conversation, already
 * leaving) means no moves at all; 'soft' (an invitation or visit is about to bring them over) only allows leaving a
 * venue for home, so they are free when the host expects them. Somebody at work stays at work: they are missed.
 */
function engagement(ctx: SimCtx, p: Person): 'hard' | 'soft' | null {
  const loc = p.location;
  if (loc.kind === 'offlot' && loc.transit) return 'hard';
  if (atVenueEvent(ctx.state, p.id, ctx.now)) return 'hard';
  const sched = ctx.state.schedule;
  if (lotLoc(p)) {
    // Only residents at home and patrons of a venue follow the plan; anybody else on a lot is a guest, who leaves on their own.
    const here = ctx.state.lots[lotLoc(p)!.lotId];
    if (here?.kind === 'residential' && here.id !== ctx.state.households[p.householdId]?.homeLotId) return 'hard';
    if (inActiveEvent(ctx.state, p.id)) return 'hard';
    if (sched.some((e) => e.personId === p.id && e.kind === 'visitLeave')) return 'hard';
    if (p.queue.some((a) => a.interactionId === 'leaveLot' || a.data.social === true || a.data.role === 'listen')) return 'hard';
    return null;
  }
  if (inActiveEvent(ctx.state, p.id)) return 'soft';
  if (sched.some((e) => e.personId === p.id && e.kind === 'visitArrive' && e.at <= ctx.now + 120)) return 'soft';
  return null;
}

function homeLotIdOf(state: WorldState, p: Person): Id | null {
  return state.households[p.householdId]?.homeLotId ?? null;
}

/** True when the person's current location already matches the place. */
function isAt(state: WorldState, p: Person, place: Place): boolean {
  const loc = p.location;
  if (place.kind === 'work') return loc.kind === 'offlot' && loc.place === 'work';
  if (place.kind === 'school') return loc.kind === 'offlot' && loc.place === 'school';
  const target = place.kind === 'home' ? homeLotIdOf(state, p) : place.lotId;
  if (loc.kind === 'lot') return loc.lotId === target;
  if (place.kind === 'home') return loc.place === 'home';
  return loc.place === 'visiting' && loc.lotId === place.lotId;
}

/** The off-lot location that stands for a place. */
function offLotFor(state: WorldState, p: Person, place: Place, now: number): PersonLocation {
  if (place.kind === 'home') return homeLocation(state, p, now);
  if (place.kind === 'venue') return visitingLocation(place.lotId, now);
  if (place.kind === 'school') return { kind: 'offlot', place: 'school', since: now, until: null };
  return { kind: 'offlot', place: 'work', since: now, until: null };
}

/** Sends a person to a place: walking out of the lot when they are on it, else just changing their location. */
function moveTo(ctx: SimCtx, p: Person, place: Place): void {
  const state = ctx.state;
  if (lotLoc(p)) {
    // Leave through the lot entry; the leaveLot action finishes the move.
    p.queue = p.queue.filter((a) => a.phase !== 'queued');
    if (p.queue[0] && p.queue[0].phase !== 'queued') p.queue[0].cancelRequested = true;
    const data: ActionData = place.kind === 'venue' ? { to: 'venue', lotId: place.lotId } : { to: place.kind };
    p.queue.push(makeAction(ctx, p, { interactionId: 'leaveLot', target: { kind: 'self' }, data }, 'schedule'));
    ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'queue' });
    return;
  }
  const target = place.kind === 'home' ? homeLotIdOf(state, p) : place.kind === 'venue' ? place.lotId : null;
  const lot = target ? state.lots[target] : undefined;
  if (lot && lot.id === state.activeLotId && place.kind !== 'work' && place.kind !== 'school') {
    // Arrives on the lot the player is on: walks in from the entry.
    placeOnLot(ctx, p, lot, entrySpots(ctx, lot, 1)[0]!);
    const t = walkInTile(ctx, p);
    if (t) insertAction(ctx, p, makeAction(ctx, p, { interactionId: 'goHere', target: { kind: 'tile', x: t.x, z: t.z, level: lot.entry.level } }, 'schedule'));
    return;
  }
  p.location = offLotFor(state, p, place, ctx.now);
  if (place.kind === 'work') beginLightShift(ctx, p);
  if (place.kind === 'school') beginLightSchool(ctx, p);
  ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'location' });
}

/**
 * Moves everyone outside the household to where the schedule says they are now. Runs every 30 game minutes; `force`
 * also moves people who would be left alone (used when a lot becomes active, so the lot shows the right people).
 */
export function syncPresence(ctx: SimCtx, force = false): void {
  const plans = plansAt(ctx.state, ctx.content, ctx.now);
  for (const p of npcPeople(ctx.state)) {
    if (atVenueEvent(ctx.state, p.id, ctx.now)) continue; // called to a venue event: the event moves them
    const busy = engagement(ctx, p);
    if (busy === 'hard' && (!force || (p.location.kind === 'offlot' && p.location.transit))) continue;
    const place = plans.get(p.id) ?? HOME;
    if (busy === 'soft' && !force && !(place.kind === 'home' && p.location.kind === 'offlot' && p.location.place === 'visiting')) continue;
    if (isAt(ctx.state, p, place)) {
      if (place.kind === 'work') beginLightShift(ctx, p);
      if (place.kind === 'school') beginLightSchool(ctx, p);
      continue;
    }
    // A person on a lot who is a guest elsewhere is not pulled around by the plan.
    moveTo(ctx, p, place);
  }
}

// ---------------------------------------------------------------------------------------------
// Jobs and bills of people outside the household (once per occurrence, same keys as Milestone 6)
// ---------------------------------------------------------------------------------------------

/**
 * Pays finished shifts of everyone outside the household. A shift that has ended and was not processed pays its full
 * length once (`pay:<personId>:<day>`, the same key a controlled worker uses) and marks the shift processed
 * (`shift:<personId>:<day>`), so switching households or loading can never pay or count a shift twice.
 */
export function lightCareers(ctx: SimCtx): void {
  const today = dayIndex(ctx.now);
  for (const p of npcPeople(ctx.state)) {
    const cs = p.career;
    const career = cs ? ctx.content.careers[cs.careerId] : undefined;
    if (!cs || !career) continue;
    for (const d of [today - 1, today]) {
      const w = shiftOn(ctx.content, p, d);
      if (!w || ctx.now < w.end || isProcessed(ctx.state, w.occurrence)) continue;
      // A shift that ended before this person started the job does not count.
      if (w.start + 60 < cs.joinedAt) { markProcessed(ctx.state, w.occurrence); continue; }
      markProcessed(ctx.state, w.occurrence);
      const len = w.end - w.start;
      const late = cs.shift?.occurrence === w.occurrence && cs.shift.status === 'atWork' ? cs.shift.lateMinutes : 0;
      const pay = Math.round((w.level.hourlyWage * clamp(len - late, 0, len)) / 60);
      if (pay > 0) transact(ctx.state, ctx.events, p.householdId, pay, 'wage', `${career.name} wage (${p.firstName})`, { occurrence: `pay:${p.id}:${d}` });
      cs.daysWorked += 1;
      cs.performance = clamp(cs.performance + 2, -100, 100);
      cs.shift = { occurrence: w.occurrence, status: 'done', workedMinutes: len - late, lateMinutes: late };
      ctx.events.emit({ type: 'career', personId: p.id, what: 'paid', amount: pay });
    }
  }
}

/**
 * Households outside the player's pay their weekly bill automatically: the first time a week is seen (occurrence
 * `bill:<householdId>:<week>`, the key the controlled bill uses, so a household that becomes controlled mid-week gets no
 * second bill) the base amount is charged once (`billpay:npc:<householdId>:<week>`) when the household can afford it;
 * otherwise the week is skipped (no debt, no late fee). Open bills left over from when the household was controlled are
 * paid as soon as there is money.
 */
export function lightBills(ctx: SimCtx): void {
  const week = billWeek(ctx.now);
  for (const hh of Object.values(ctx.state.households)) {
    if (hh.id === ctx.state.activeHouseholdId || !hh.homeLotId) continue;
    for (const bill of openBills(ctx.state, hh.id)) payBill(ctx, hh.id, bill.id);
    const issued = `bill:${hh.id}:${week}`;
    if (isProcessed(ctx.state, issued)) continue;
    markProcessed(ctx.state, issued);
    const bd = billBreakdown(ctx.state, ctx.content, hh.id);
    if (bd.base <= 0 || hh.funds < bd.base) continue;
    transact(ctx.state, ctx.events, hh.id, -bd.base, 'bill', `Household bill (week ${week + 1})`, { occurrence: `billpay:npc:${hh.id}:${week}` });
  }
}

/** Townies who spend the same block at an inactive venue get to know each other a little (bounded). */
export function lightSocial(ctx: SimCtx): void {
  const here = new Map<Id, Person[]>();
  for (const p of npcPeople(ctx.state)) {
    const loc = p.location;
    if (loc.kind !== 'offlot' || loc.place !== 'visiting' || loc.transit || !loc.lotId || loc.lotId === ctx.state.activeLotId) continue;
    const list = here.get(loc.lotId) ?? [];
    list.push(p);
    here.set(loc.lotId, list);
  }
  for (const list of here.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!, b = list[j]!;
        if (a.householdId === b.householdId) continue;
        for (const [x, y] of [[a, b], [b, a]] as const) {
          if (peekRel(ctx.state, x.id, y.id).friendship >= LIGHT_FRIENDSHIP_CAP) continue;
          applyRelDelta(ctx.state, x.id, y.id, { familiarity: 1, friendship: 0.4 }, ctx.now);
        }
      }
    }
  }
}

/** One step of the light world, called every game minute that is a multiple of 15 (simulation flow step 3c). */
export function runLightWorld(ctx: SimCtx): void {
  const mod = Math.round(minuteOfDay(ctx.now));
  lightCareers(ctx);
  lightSchool(ctx, (p) => !isControlled(ctx.state, p));
  lightBills(ctx);
  if (mod % 30 === 0) { syncPresence(ctx); lightSocial(ctx); }
}

/**
 * Safety net, hourly: anybody on a lot other than the active one (an edited save, an interrupted move) is taken off it, so
 * the simulation only ever has people on the lot it runs in detail, and anybody in transit without a trip is brought home.
 */
export function reconcileStrays(ctx: SimCtx): void {
  const tripLots = new Set(ctx.state.schedule.filter((e) => e.kind === 'travelArrive').map((e) => e.data?.lotId));
  for (const p of Object.values(ctx.state.people)) {
    // In transit with no trip that will bring them in (a damaged save): they are home again.
    if (p.location.kind === 'offlot' && p.location.transit && !tripLots.has(p.location.lotId)) {
      p.location = homeLocation(ctx.state, p, ctx.now);
      ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'location' });
      continue;
    }
    const loc = lotLoc(p);
    if (!loc || loc.lotId === ctx.state.activeLotId) continue;
    const lot = ctx.state.lots[loc.lotId];
    takeOffLot(ctx, p, isControlled(ctx.state, p) || lot?.kind !== 'venue' ? homeLocation(ctx.state, p, ctx.now) : visitingLocation(loc.lotId, ctx.now));
  }
}
