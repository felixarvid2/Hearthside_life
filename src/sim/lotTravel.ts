// Lot travel (Milestone 7): the detailed simulation runs on one lot at a time, the active lot. People of the household
// the player runs travel to another lot as a trip:
//
//   1. startTrip: every traveller on the lot walks to the lot entry (the `travelTo` action) and is then "in transit";
//      one `travelArrive` schedule entry (occurrence `travel:<first traveller>:<minute>`) is set for 20-40 minutes later
//      (world/neighbourhood.ts travelMinutes). Nothing is charged: travel is free. The destination is built now if it
//      never was (world/lotBuilders.ts), so a broken layout is reported before anybody leaves.
//   2. completeTrip, when the entry comes due: activateLot switches the active lot. Everybody on the old lot who is not
//      travelling goes off-lot (household members left behind are "at home", townies and guests return to where the
//      light schedule has them), the destination lot becomes active, the travellers appear at its entry and the people
//      who were already there (residents at home, townies at a venue) are placed on it. Nothing about anybody is
//      re-generated: jobs, relationships and looks live in the person records.
//
// Because a lot's state is part of the world state, "saving" the left lot and "loading" the new one are the same
// object: a round trip leaves both lots exactly as they were (only the people on them change).

import { minuteOfDay } from '../core/clock';
import { addFeed, isProcessed } from '../core/state';
import type { Id, Lot, Person, ScheduledEvent, WorldState } from '../core/types';
import { ensureLotBuilt } from '../world/lotBuilders';
import { hoursText, lotIsOpen, travelMinutes, venueInfo } from '../world/neighbourhood';
import { abortQueue } from './actions';
import type { SimCtx } from './context';
import { lotLoc } from './context';
import { eventsOf } from './events';
import { entrySpots, homeLocation, placeOnLot, scatterSpots, takeOffLot, visitingLocation } from './places';
import { insertAction, makeAction } from './queue';
import { syncPresence } from './townlife';

/** Event types that start by themselves when somebody walks in; they do not keep the household from going out. */
const AMBIENT_EVENTS: ReadonlySet<string> = new Set(['visit', 'welcomeWagon', 'dropIn', 'reconciliation']);

export type TripResult =
  | { ok: true; minutes: number; arriveAt: number; occurrence: string }
  | { ok: false; reason: string };

/** The trip under way (its travelArrive entry is still waiting), or null. */
export function activeTrip(state: WorldState): ScheduledEvent | null {
  return state.schedule.find((e) => e.kind === 'travelArrive' && !isProcessed(state, e.occurrence)) ?? null;
}

const names = (people: Person[]): string => {
  const n = people.map((p) => p.firstName);
  return n.length <= 1 ? n[0] ?? 'Nobody' : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
};

/** The lot a traveller sets out from: the active lot when they are on it, else their home. */
function originOf(state: WorldState, p: Person): Lot | undefined {
  const loc = p.location;
  const id = loc.kind === 'lot' ? loc.lotId : loc.lotId ?? state.households[p.householdId]?.homeLotId ?? state.activeLotId;
  return state.lots[id] ?? state.lots[state.activeLotId];
}

/** Why these people cannot set out for the lot now, or null. Pure. */
export function travelProblem(ctx: SimCtx, personIds: Id[], lotId: Id): string | null {
  const state = ctx.state;
  const lot = state.lots[lotId];
  if (!lot) return 'There is no such place.';
  const hh = state.households[state.activeHouseholdId];
  const ids = [...new Set(personIds)];
  if (!hh || ids.length === 0) return 'Choose who goes.';
  const people: Person[] = [];
  for (const id of ids) {
    const p = state.people[id];
    if (!p) return 'Unknown person.';
    if (p.householdId !== hh.id) return `${p.firstName} doesn't live with you.`;
    const loc = p.location;
    if (loc.kind === 'offlot') {
      if (loc.transit) return `${p.firstName} is already on the way.`;
      if (loc.place === 'work') return `${p.firstName} is at work.`;
      if (loc.place === 'school') return `${p.firstName} is at school.`;
      if (loc.place !== 'home') return `${p.firstName} is out.`;
    }
    people.push(p);
  }
  if (activeTrip(state)) return 'A trip is already under way.';
  if (people.every((p) => lotLoc(p)?.lotId === lotId)) return `Already at ${lot.name}.`;
  const hosting = eventsOf(state).find((e) => e.householdId === hh.id && (e.status === 'invited' || e.status === 'running') && !AMBIENT_EVENTS.has(e.type));
  if (hosting) return `Finish or cancel "${hosting.title}" first.`;
  const from = originOf(state, people[0]!);
  const minutes = from ? travelMinutes(from, lot) : 20;
  const v = venueInfo(lot);
  if (v && !lotIsOpen(lot, minuteOfDay(ctx.now + minutes))) {
    return `${lot.name} will be closed when you get there (open ${hoursText(v)}).`;
  }
  return null;
}

/** Sets people off for a lot (see the header). Nothing changes when this returns `ok: false`. */
export function startTrip(ctx: SimCtx, personIds: Id[], lotId: Id): TripResult {
  const problem = travelProblem(ctx, personIds, lotId);
  if (problem) return { ok: false, reason: problem };
  const state = ctx.state;
  const lot = state.lots[lotId]!;
  const ids = [...new Set(personIds)];
  const people = ids.map((id) => state.people[id]!);
  const built = ensureLotBuilt(state, ctx.content, lotId);
  if (!built.ok) return { ok: false, reason: built.reason };
  if (built.built) ctx.nav.invalidate(lotId);
  const from = originOf(state, people[0]!);
  const minutes = from ? travelMinutes(from, lot) : 20;
  const arriveAt = ctx.now + minutes;
  const occurrence = `travel:${ids[0]}:${Math.round(ctx.now)}`;
  for (const p of people) {
    if (lotLoc(p)) {
      abortQueue(ctx, p, null);
      insertAction(ctx, p, makeAction(ctx, p, { interactionId: 'travelTo', target: { kind: 'self' }, data: { lotId, arriveAt, trip: occurrence } }, 'player'));
    } else {
      p.location = { kind: 'offlot', place: 'errand', lotId, since: ctx.now, until: arriveAt, transit: true };
      ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'location' });
    }
  }
  state.schedule.push({ occurrence, at: arriveAt, kind: 'travelArrive', data: { lotId, personIds: ids.join(','), fromLotId: state.activeLotId } });
  addFeed(state, ctx.events, 'info', `${names(people)} set off for ${lot.name} (about ${minutes} minutes).`, people[0]!.id);
  ctx.events.emit({ type: 'travel', what: 'departed', personIds: ids, lotId });
  return { ok: true, minutes, arriveAt, occurrence };
}

/** The household's way home: everybody who is on a lot goes to the home lot. */
export function startTripHome(ctx: SimCtx, personIds?: Id[]): TripResult {
  const state = ctx.state;
  const hh = state.households[state.activeHouseholdId];
  if (!hh?.homeLotId) return { ok: false, reason: 'There is no home to go to.' };
  const ids = personIds ?? hh.memberIds.filter((id) => {
    const p = state.people[id];
    return !!p && lotLoc(p) !== null && lotLoc(p)!.lotId !== hh.homeLotId;
  });
  if (ids.length === 0) return { ok: false, reason: 'Everybody is already home.' };
  return startTrip(ctx, ids, hh.homeLotId);
}

/** A `travelArrive` entry came due: the travellers arrive and their lot becomes active. */
export function completeTrip(ctx: SimCtx, e: ScheduledEvent): void {
  const state = ctx.state;
  const lotId = typeof e.data?.lotId === 'string' ? e.data.lotId : '';
  const ids = typeof e.data?.personIds === 'string' ? e.data.personIds.split(',') : [];
  const arrivals: Person[] = [];
  for (const id of ids) {
    const p = state.people[id];
    if (!p) continue;
    const loc = p.location;
    if (loc.kind === 'offlot' && loc.transit && loc.lotId === lotId) arrivals.push(p);
    else if (lotLoc(p) && p.queue.some((a) => a.interactionId === 'travelTo' && a.data.trip === e.occurrence)) {
      // Still on the way to the door: the car came, they are on it.
      takeOffLot(ctx, p, { kind: 'offlot', place: 'errand', lotId, since: ctx.now, until: e.at, transit: true });
      arrivals.push(p);
    }
  }
  const lot = state.lots[lotId];
  if (!lot || arrivals.length === 0) {
    addFeed(state, ctx.events, 'info', 'The trip was called off.');
    return;
  }
  const r = activateLot(ctx, lotId, arrivals);
  if (!r.ok) {
    // Could not open the lot: everybody goes home instead (never leave anybody in limbo).
    for (const p of arrivals) p.location = homeLocation(state, p, ctx.now);
    addFeed(state, ctx.events, 'warning', r.reason);
  }
}

export type ActivateResult = { ok: true } | { ok: false; reason: string };

/** Where an NPC rests when the lot they are on stops being simulated in detail. */
function restingLocation(state: WorldState, p: Person, fromLot: Lot, now: number) {
  if (fromLot.kind === 'venue') return visitingLocation(fromLot.id, now);
  return homeLocation(state, p, now);
}

/**
 * Makes `lotId` the active lot. Travellers (`arrivals`, already off-lot in transit or just returning) are placed at its
 * entry. Everyone else on the lot being left goes off-lot, and the people who were already at the new lot are placed on it.
 * Nothing is generated: this only moves people between the state's on-lot and off-lot locations.
 */
export function activateLot(ctx: SimCtx, lotId: Id, arrivals: Person[]): ActivateResult {
  const state = ctx.state;
  const lot = state.lots[lotId];
  if (!lot) return { ok: false, reason: 'There is no such place.' };
  const built = ensureLotBuilt(state, ctx.content, lotId);
  if (!built.ok) return { ok: false, reason: built.reason };
  if (built.built) ctx.nav.invalidate(lotId);
  const fromId = state.activeLotId;
  const keep = new Set(arrivals.map((p) => p.id));

  // 1. Whoever is on a lot that is not the new one leaves it.
  for (const p of Object.values(state.people)) {
    const loc = lotLoc(p);
    if (!loc || loc.lotId === lotId || keep.has(p.id)) continue;
    const left = state.lots[loc.lotId] ?? lot;
    const to = p.householdId === state.activeHouseholdId ? homeLocation(state, p, ctx.now) : restingLocation(state, p, left, ctx.now);
    takeOffLot(ctx, p, to);
  }
  state.activeLotId = lotId;

  // 2. The light schedule catches up so the new lot shows who is really there.
  syncPresence(ctx, true);

  // 3. People who were already at this lot (home, or at the venue) are placed on it.
  const present = Object.values(state.people).filter((p) => {
    const loc = p.location;
    return loc.kind === 'offlot' && !loc.transit && loc.lotId === lotId && (loc.place === 'home' || loc.place === 'visiting') && !keep.has(p.id);
  });
  const spots = scatterSpots(ctx, lot, present.map((p) => p.id));
  present.forEach((p, i) => placeOnLot(ctx, p, lot, spots[i]!));

  // 4. The travellers arrive at the entry.
  const entries = entrySpots(ctx, lot, arrivals.length);
  arrivals.forEach((p, i) => placeOnLot(ctx, p, lot, entries[Math.min(i, entries.length - 1)]!));

  if (fromId !== lotId) ctx.events.emit({ type: 'lot.activated', lotId, fromLotId: fromId });
  if (arrivals.length > 0) {
    ctx.events.emit({ type: 'travel', what: 'arrived', personIds: arrivals.map((p) => p.id), lotId });
    const home = state.households[state.activeHouseholdId]?.homeLotId === lotId;
    addFeed(state, ctx.events, 'info', home ? `${names(arrivals)} came home.` : `${names(arrivals)} arrived at ${lot.name}.`, arrivals[0]!.id);
  }
  return { ok: true };
}
