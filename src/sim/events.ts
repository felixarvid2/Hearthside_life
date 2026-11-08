// Social events at home (Milestone 5): dates, dinner and house parties, celebrations, and the visits that just
// happen (a neighbour's welcome, a friend dropping by, somebody coming to clear the air). One system runs them all:
//
//   plan -> invited -> (guests arrive) -> start -> running (goals progress as people talk, laugh and eat) -> end
//
// - An event is plain data in `state.homeEvents` (core/types.ts HomeEvent); its type comes from content/events.ts.
// - Invitations are visitArrive entries in `state.schedule` (occurrence `evarrive:<event>:<guest>`) plus an eventStart
//   and an eventEnd entry. Every schedule entry is processed once; the reward is applied once more behind the
//   status check and the occurrence `eventdone:<id>`, so fast-forward, load and replay cannot pay twice.
// - Goals are counted from resolved socials (noteSocial) and meals (noteEat), never from rendering.
// - The final score is goal progress, attendance and the guests' mood; the rating (poor / fair / good / great)
//   scales the relationship changes, needs, moodlets and memories. Randomness only comes from `ctx.rng` (when a
//   reconciliation visit is rolled) and from stable hashes of ids, so the same state gives the same result.
// - Dates happen at home (there is no lot travel yet); the caterer's food is put on a table when the event starts.

import { DAY_NAMES, atDayMinute, dayIndex, formatClock, hourOfDay, minuteOfDay, weekday } from '../core/clock';
import { newId, pairKey } from '../core/ids';
import { romanceInterest } from '../core/relations';
import { addFeed, isProcessed, markProcessed, transact } from '../core/state';
import type {
  EventGoal, GameMinutes, HomeEvent, HomeEventType, Id, Lot, Person, ScheduledEvent, WorldItem, WorldState,
} from '../core/types';
import type { EventDef, SocialDef } from '../content/types';
import type { SimCtx } from './context';
import { hashString, householdOf, isTable, lotLoc, lotObjects } from './context';
import { hoursText, lotIsOpen, travelMinutes, venueInfo } from '../world/neighbourhood';
import { freeSurfaceTiles } from './cooking';
import { isBroken } from './housekeeping';
import { addMoodlet, computeMood } from './mood';
import { changeNeed } from './needs';
import { homeLocation, takeOffLot, visitingLocation } from './places';
import { startTrip, startTripHome } from './lotTravel';
import { addMemory, applyRelDelta, ensureRel, hasRecentMemory, peekRel, setBondStatus } from './relationships';
import {
  EVENT_ARRIVE_EARLY, EVENT_ARRIVE_SPREAD, EVENT_GOAL_SHARE, EVENT_HISTORY, EVENT_LEAVE_SPREAD, EVENT_MAX_LEAD_DAYS, EVENT_RATING,
  EVENT_SOCIAL_BONUS, MEAL_SPOIL_MINUTES, RECONCILE_CHANCE, RECONCILE_COOLDOWN_DAYS, RECONCILE_WINDOW_DAYS,
} from './tuning';

// ---------------------------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------------------------

export function eventsOf(state: WorldState): HomeEvent[] { return state.homeEvents ?? []; }

export function findEvent(state: WorldState, id: Id): HomeEvent | undefined { return eventsOf(state).find((e) => e.id === id); }

const isActive = (e: HomeEvent) => e.status === 'invited' || e.status === 'running';

/** Planned or running events (the household's calendar). */
export function activeEvents(state: WorldState, householdId?: Id): HomeEvent[] {
  return eventsOf(state).filter((e) => isActive(e) && (householdId === undefined || e.householdId === householdId));
}

/** Everybody who takes part: the host's household and the guests who showed up. */
export function participantsOf(state: WorldState, ev: HomeEvent): Id[] {
  return [...(state.households[ev.householdId]?.memberIds ?? []), ...ev.arrivedIds.filter((id) => !(state.households[ev.householdId]?.memberIds ?? []).includes(id))];
}

/** The running event a person takes part in, if any. */
export function runningEventOf(state: WorldState, personId: Id): HomeEvent | undefined {
  return eventsOf(state).find((e) => e.status === 'running' && participantsOf(state, e).includes(personId));
}

function eventDef(ctx: Pick<SimCtx, 'content'>, ev: Pick<HomeEvent, 'type'>): EventDef | undefined { return ctx.content.events?.[ev.type]; }

const names = (state: WorldState, ids: Id[]): string => {
  const n = ids.map((id) => state.people[id]?.firstName ?? 'someone');
  return n.length <= 1 ? (n[0] ?? 'nobody') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
};

const playableHost = (ctx: SimCtx, ev: HomeEvent): boolean => ctx.state.households[ev.householdId]?.isPlayable === true;

function emit(ctx: SimCtx, ev: HomeEvent, what: 'planned' | 'started' | 'goal' | 'ended' | 'cancelled'): void {
  ctx.events.emit({ type: 'homeEvent', eventId: ev.id, what });
}


// ---------------------------------------------------------------------------------------------
// Events at a public venue (Milestone 13): the household and the guests travel there
// ---------------------------------------------------------------------------------------------

/** The venue lot an event request names, `null` for the host's home, or 'bad' for any other lot. */
export function venueLotFor(ctx: Pick<SimCtx, 'state'>, host: Person, lotId?: Id): Lot | null | 'bad' {
  if (!lotId) return null;
  const lot = ctx.state.lots[lotId];
  if (!lot) return 'bad';
  if (lot.kind === 'venue') return lot;
  return lot.id === ctx.state.households[host.householdId]?.homeLotId ? null : 'bad';
}

/** Why the venue cannot host a gathering of `minutes` starting at `at` (hours, notice for the trip), or null. */
export function venueSlotProblem(ctx: SimCtx, host: Person, venue: Lot, at: GameMinutes, minutes: number): string | null {
  const v = venueInfo(venue);
  if (v && (!lotIsOpen(venue, minuteOfDay(at)) || dayIndex(at + minutes - 1) !== dayIndex(at) || minuteOfDay(at + minutes) > v.close)) {
    return `${venue.name} is not open for all of it (open ${hoursText(v)}).`;
  }
  const from = ctx.state.lots[lotLoc(host)?.lotId ?? ctx.state.households[host.householdId]?.homeLotId ?? ctx.state.activeLotId];
  const travel = from ? travelMinutes(from, venue) : 20;
  if (at < ctx.now + travel + 10) return `Needs at least ${travel + 10} minutes' notice to get to ${venue.name}.`;
  return null;
}

export function isVenueEvent(state: WorldState, ev: Pick<HomeEvent, 'lotId'>): boolean { return state.lots[ev.lotId]?.kind === 'venue'; }

/** True once a guest of a venue event has been called there (from `departAt` on) and the event is not over. */
export function atVenueEvent(state: WorldState, personId: Id, now: GameMinutes): boolean {
  return eventsOf(state).some((e) => isActive(e) && e.guestIds.includes(personId) && isVenueEvent(state, e) && now >= (e.departAt ?? e.startAt));
}

const guestIsAt = (p: Person, lotId: Id): boolean => (p.location.kind === 'lot' ? p.location.lotId === lotId
  : !p.location.transit && p.location.place === 'visiting' && p.location.lotId === lotId);

/** Marks the guests of active events at this lot as arrived when they are there (on it, or at the venue off-lot). */
export function gatherAtVenue(ctx: SimCtx, lotId: Id): void {
  for (const ev of eventsOf(ctx.state)) {
    if (!isActive(ev) || ev.lotId !== lotId || !isVenueEvent(ctx.state, ev)) continue;
    for (const gid of ev.guestIds) {
      const g = ctx.state.people[gid];
      if (!g || ev.arrivedIds.includes(gid) || !guestIsAt(g, lotId)) continue;
      ev.arrivedIds.push(gid);
      if (playableHost(ctx, ev)) addFeed(ctx.state, ctx.events, 'social', `${g.firstName} arrived for the ${ev.title.toLowerCase()}.`, g.id);
      emit(ctx, ev, 'goal');
    }
  }
}

const memberIds = (ctx: SimCtx, ev: HomeEvent): Id[] => [ev.hostId, ...ev.guestIds.filter((id) => ctx.state.people[id]?.householdId === ev.householdId)];

/** The guests go home from the venue: those on the lot leave by the door, those off-lot are simply home again. */
function sendGuestsHome(ctx: SimCtx, ev: HomeEvent, spread: boolean): void {
  for (const gid of ev.guestIds) {
    const g = ctx.state.people[gid];
    if (!g || g.householdId === ev.householdId || !guestIsAt(g, ev.lotId)) continue;
    if (lotLoc(g)) setDeparture(ctx, gid, ctx.now + 5 + (spread ? hashString(gid + ev.id) % EVENT_LEAVE_SPREAD : 0));
    else { g.location = homeLocation(ctx.state, g, ctx.now); ctx.events.emit({ type: 'person.changed', personId: g.id, what: 'location' }); }
  }
}

function failVenueEvent(ctx: SimCtx, ev: HomeEvent, why: string): void {
  cancelEvent(ctx, ev.id);
  if (playableHost(ctx, ev)) addFeed(ctx.state, ctx.events, 'warning', `The ${ev.title.toLowerCase()} at ${ctx.state.lots[ev.lotId]?.name ?? 'the venue'} fell through: ${why}`, ev.hostId);
}

/** eventTravel 'out': the household sets off, and the guests are at the venue. Tries again every 10 minutes until the start. */
function departForVenue(ctx: SimCtx, ev: HomeEvent): void {
  if (ev.status !== 'invited') return;
  const hh = ctx.state.households[ev.householdId];
  if (!hh?.isPlayable || ctx.state.activeHouseholdId !== hh.id) { cancelEvent(ctx, ev.id); return; }
  const people = memberIds(ctx, ev).map((id) => ctx.state.people[id]).filter((p): p is Person => !!p);
  const host = ctx.state.people[ev.hostId]!;
  const goers = people.filter((p) => (lotLoc(p) ? lotLoc(p)!.lotId !== ev.lotId : p.location.kind === 'offlot' && !p.location.transit && p.location.place === 'home'));
  const hostThere = lotLoc(host)?.lotId === ev.lotId;
  let ok = hostThere;
  if (goers.some((p) => p.id === host.id)) {
    const r = startTrip(ctx, goers.map((p) => p.id), ev.lotId, { allowHosting: true });
    ok = r.ok;
    if (!r.ok) {
      if (ctx.now + 10 < ev.startAt) {
        ctx.state.schedule.push({ occurrence: `evtravel:${ev.id}:out:${Math.round(ctx.now)}`, at: ctx.now + 10, kind: 'eventTravel', data: { eventId: ev.id, phase: 'out' } });
        return;
      }
      failVenueEvent(ctx, ev, r.reason);
      return;
    }
  } else if (!hostThere) {
    if (ctx.now + 10 < ev.startAt) {
      ctx.state.schedule.push({ occurrence: `evtravel:${ev.id}:out:${Math.round(ctx.now)}`, at: ctx.now + 10, kind: 'eventTravel', data: { eventId: ev.id, phase: 'out' } });
      return;
    }
    failVenueEvent(ctx, ev, `${host.firstName} could not get away.`);
    return;
  }
  if (!ok) return;
  for (const gid of ev.guestIds) {
    const g = ctx.state.people[gid];
    if (!g || g.householdId === ev.householdId || guestIsAt(g, ev.lotId)) continue;
    if (lotLoc(g)) takeOffLot(ctx, g, visitingLocation(ev.lotId, ctx.now));
    else if (g.location.kind === 'offlot' && !g.location.transit && (g.location.place === 'home' || g.location.place === 'visiting')) {
      g.location = visitingLocation(ev.lotId, ctx.now);
      ctx.events.emit({ type: 'person.changed', personId: g.id, what: 'location' });
    }
  }
  gatherAtVenue(ctx, ev.lotId);
}

/** eventTravel 'home': when the event is over the household goes home from the venue (a few tries if a trip is under way). */
function returnFromVenue(ctx: SimCtx, ev: HomeEvent, attempt: number): void {
  if (ctx.state.activeLotId !== ev.lotId) return;
  const ids = memberIds(ctx, ev).filter((id) => { const p = ctx.state.people[id]; return !!p && lotLoc(p)?.lotId === ev.lotId; });
  if (ids.length === 0) return;
  const r = startTripHome(ctx, ids);
  if (!r.ok && attempt < 4) {
    ctx.state.schedule.push({ occurrence: `evtravel:${ev.id}:home:${attempt + 1}`, at: ctx.now + 15, kind: 'eventTravel', data: { eventId: ev.id, phase: 'home', attempt: attempt + 1 } });
  }
}

// ---------------------------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------------------------

/** Next sensible start: this evening at 19:00, or after the notice the type needs, or tomorrow evening when it is late. */
export function defaultStart(now: GameMinutes, def: Pick<EventDef, 'leadMinutes'>): GameMinutes {
  const earliest = now + Math.max(30, def.leadMinutes);
  const today = atDayMinute(dayIndex(now), 19 * 60);
  if (earliest <= today) return today;
  if (hourOfDay(earliest) < 21) return Math.ceil(earliest / 15) * 15;
  return atDayMinute(dayIndex(now) + 1, 19 * 60);
}

/** Catering cost for an event with these guests (the host household's members count). */
export function cateringCost(ctx: SimCtx, def: EventDef, host: Person, guestCount: number): number {
  const members = ctx.state.households[host.householdId]?.memberIds.length ?? 1;
  return def.cateringPerPerson * (members + guestCount);
}

/** Why `host` cannot marry `partner` in a wedding, or null: they must be engaged, adults, and still in love. */
export function weddingProblem(ctx: SimCtx, host: Person, partner: Person): string | null {
  const bond = ctx.state.bonds[pairKey(host.id, partner.id)];
  if (bond?.status === 'spouse') return `${host.firstName} and ${partner.firstName} are already married.`;
  if (bond?.status !== 'engaged') return `${host.firstName} and ${partner.firstName} must be engaged first. The first guest is the one you marry.`;
  const mine = peekRel(ctx.state, host.id, partner.id), theirs = peekRel(ctx.state, partner.id, host.id);
  if (mine.romance < 50 || theirs.romance < 50 || theirs.trust < 30) return `${partner.firstName} isn't quite ready for the wedding yet.`;
  return null;
}

/** Why this event cannot be planned (host, guests, notice, money), or null when it can. */
export function canPlanEvent(ctx: SimCtx, host: Person, guestIds: Id[], type: HomeEventType, startAt?: GameMinutes, lotId?: Id): string | null {
  const def = ctx.content.events?.[type];
  if (!def || def.status !== 'ready') return 'That kind of gathering is not available.';
  const hh = householdOf(ctx, host);
  if (!hh?.isPlayable) return `${host.firstName} cannot host.`;
  if (!['youngAdult', 'adult', 'elder'].includes(host.lifeStage)) return 'Only adults can plan gatherings.';
  if (!lotLoc(host) && host.location.kind !== 'offlot') return `${host.firstName} isn't home.`;
  if (activeEvents(ctx.state, hh.id).length > 0) return 'Another gathering is already planned.';
  const unique = [...new Set(guestIds)];
  if (unique.length < def.minGuests) return def.minGuests === 1 ? 'Choose a guest.' : `Invite at least ${def.minGuests} guests.`;
  if (unique.length > def.maxGuests) return `At most ${def.maxGuests} guests.`;
  for (const id of unique) {
    const g = ctx.state.people[id];
    if (!g || g.id === host.id) return 'Unknown guest.';
    const gh = ctx.state.households[g.householdId];
    const isDate = def.romantic;
    const spouseToBe = def.wedding === true && id === unique[0];
    if (g.householdId === host.householdId && !isDate && !spouseToBe) return `${g.firstName} lives here.`;
    if (spouseToBe) {
      const why = weddingProblem(ctx, host, g);
      if (why) return why;
    }
    if (eventsOf(ctx.state).some((e) => isActive(e) && (e.guestIds.includes(g.id) || e.arrivedIds.includes(g.id)))) return `${g.firstName} is already invited somewhere.`;
    if (def.planned && peekRel(ctx.state, host.id, g.id).familiarity <= 0 && g.householdId !== host.householdId) return `Hasn't met ${g.firstName} yet.`;
    if (peekRel(ctx.state, g.id, host.id).friendship < -30) return `${g.firstName} wouldn't come.`;
    if (def.romantic) {
      if (!romanceInterest(host, g)) return `${host.firstName} isn't interested in ${g.firstName} that way.`;
      if (ensureRel(ctx.state, host.id, g.id).romanceBlocked) return `${g.firstName} isn't interested in that.`;
    }
    const gl = lotLoc(g);
    if (!gl) {
      // At home, or out at a venue (the phone reaches them); at work, in transit or elsewhere they cannot be asked.
      if (g.location.kind !== 'offlot' || g.location.transit || (g.location.place !== 'home' && g.location.place !== 'visiting')) return `${g.firstName} isn't home right now.`;
      if (gh?.isPlayable) return `${g.firstName} isn't here.`;
    }
  }
  const now = ctx.now;
  const at = startAt ?? defaultStart(now, def);
  if (at < now + def.leadMinutes) return `Needs at least ${def.leadMinutes} minutes' notice.`;
  const venue = venueLotFor(ctx, host, lotId);
  if (venue === 'bad') return 'Gatherings are held at home or at a public venue.';
  if (venue) {
    if (!def.venueOk) return `A ${def.name.toLowerCase()} is held at home.`;
    const why = venueSlotProblem(ctx, host, venue, at, def.minutes);
    if (why) return why;
  }
  if (at > now + EVENT_MAX_LEAD_DAYS * 1440) return `Plan at most ${EVENT_MAX_LEAD_DAYS} days ahead.`;
  const cost = cateringCost(ctx, def, host, unique.length);
  if (cost > 0 && !ctx.state.settings.unlimitedFunds && (hh.funds ?? 0) < cost) return `Not enough money for food ($${(cost / 100).toFixed(0)}).`;
  return null;
}

function makeGoals(def: EventDef, guestCount: number): EventGoal[] {
  return def.goals.map((g) => ({
    kind: g.kind, text: g.text, weight: g.weight, progress: 0, done: false,
    target: Math.max(1, g.target, g.perGuest !== undefined ? Math.round(g.perGuest * guestCount) : 0),
  }));
}

function trimHistory(state: WorldState): void {
  const list = state.homeEvents ?? [];
  const done = list.filter((e) => !isActive(e));
  if (done.length <= EVENT_HISTORY) return;
  const drop = new Set(done.slice(0, done.length - EVENT_HISTORY).map((e) => e.id));
  state.homeEvents = list.filter((e) => !drop.has(e.id));
}

function pushEvent(state: WorldState, ev: HomeEvent): void {
  if (!state.homeEvents) state.homeEvents = [];
  state.homeEvents.push(ev);
  trimHistory(state);
}

/** Extends a visitor's stay: their pending departure moves to `until` (never earlier), or is created. */
export function holdVisitor(ctx: SimCtx, personId: Id, until: GameMinutes): void {
  const pending = ctx.state.schedule.filter((e) => e.kind === 'visitLeave' && e.personId === personId && !isProcessed(ctx.state, e.occurrence));
  if (pending.length === 0) {
    ctx.state.schedule.push({ occurrence: `leave:${personId}:${Math.round(ctx.now)}`, at: until, kind: 'visitLeave', personId });
    return;
  }
  for (const e of pending) if (e.at < until) e.at = until;
}

/** Moves a visitor's departure to `at` (earlier or later). */
function setDeparture(ctx: SimCtx, personId: Id, at: GameMinutes): void {
  ctx.state.schedule = ctx.state.schedule.filter((e) => !(e.kind === 'visitLeave' && e.personId === personId));
  ctx.state.schedule.push({ occurrence: `leave:${personId}:${Math.round(ctx.now)}`, at, kind: 'visitLeave', personId });
}

export interface PlanRequest { type: HomeEventType; hostId: Id; guestIds: Id[]; startAt?: GameMinutes; lotId?: Id }
export type PlanResult = { ok: true; eventId: Id } | { ok: false; reason: string };

/**
 * Plans an event: checks everything, records it, sends the invitations (scheduled arrivals) and the start and end
 * entries. A romantic event also needs the guest's consent (`skipConsent` when an accepted social already asked).
 */
export function planEvent(ctx: SimCtx, req: PlanRequest, opts: { skipConsent?: boolean } = {}): PlanResult {
  const host = ctx.state.people[req.hostId];
  if (!host) return { ok: false, reason: 'Unknown host.' };
  const reason = canPlanEvent(ctx, host, req.guestIds, req.type, req.startAt, req.lotId);
  if (reason) return { ok: false, reason };
  const def = ctx.content.events?.[req.type]!;
  const guests = [...new Set(req.guestIds)].map((id) => ctx.state.people[id]!);
  if (def.romantic && !opts.skipConsent) {
    const g = guests[0]!;
    if (!romanceInterest(g, host)) {
      ensureRel(ctx.state, host.id, g.id).romanceBlocked = true;
      addMoodlet(ctx.content, host, 'flustered', ctx.now, req.type);
      return { ok: false, reason: `${g.firstName} kindly says they'd rather stay friends.` };
    }
    const back = peekRel(ctx.state, g.id, host.id);
    if (back.romance < 10 || back.friendship < 15) {
      addMoodlet(ctx.content, host, 'flustered', ctx.now, req.type);
      return { ok: false, reason: `${g.firstName} isn't ready for a date yet.` };
    }
  }
  const startAt = req.startAt ?? defaultStart(ctx.now, def);
  const venue = venueLotFor(ctx, host, req.lotId);
  const ev: HomeEvent = {
    id: newId(ctx.state, 'evt'), type: req.type, title: def.name, status: 'invited', hostId: host.id, householdId: host.householdId,
    lotId: venue && venue !== 'bad' ? venue.id : lotLoc(host)?.lotId ?? ctx.state.activeLotId, guestIds: guests.map((g) => g.id), arrivedIds: [], createdAt: ctx.now,
    startAt, endAt: startAt + def.minutes, goals: makeGoals(def, guests.length), pairs: [], ate: [],
  };
  if (def.wedding) { ev.partnerId = guests[0]!.id; ev.ceremonyAt = startAt + (def.ceremonyMinutes ?? 30); }
  const atVenue = venue !== null && venue !== 'bad';
  if (atVenue) {
    const from = ctx.state.lots[lotLoc(host)?.lotId ?? ctx.state.households[host.householdId]?.homeLotId ?? ctx.state.activeLotId];
    ev.departAt = Math.max(ctx.now + 1, startAt - (from ? travelMinutes(from, venue) : 20) - 5);
    ctx.state.schedule.push({ occurrence: `evtravel:${ev.id}:out`, at: ev.departAt, kind: 'eventTravel', data: { eventId: ev.id, phase: 'out' } });
  }
  pushEvent(ctx.state, ev);
  for (const g of guests) {
    applyRelDelta(ctx.state, host.id, g.id, { familiarity: 1 }, ctx.now);
    applyRelDelta(ctx.state, g.id, host.id, { familiarity: 1, friendship: 1 }, ctx.now);
    if (atVenue) continue;
    if (lotLoc(g)) {
      ev.arrivedIds.push(g.id);
      if (g.householdId !== host.householdId) holdVisitor(ctx, g.id, ev.endAt + (hashString(g.id + ev.id) % EVENT_LEAVE_SPREAD));
    } else {
      const at = Math.max(ctx.now + 1, startAt - EVENT_ARRIVE_EARLY + (hashString(g.id + ev.id) % EVENT_ARRIVE_SPREAD));
      ctx.state.schedule.push({
        occurrence: `evarrive:${ev.id}:${g.id}`, at, kind: 'visitArrive', personId: g.id, data: { invitedBy: host.id, eventId: ev.id },
      });
    }
  }
  ctx.state.schedule.push({ occurrence: `eventstart:${ev.id}`, at: startAt, kind: 'eventStart', data: { eventId: ev.id } });
  ctx.state.schedule.push({ occurrence: `eventend:${ev.id}`, at: ev.endAt, kind: 'eventEnd', data: { eventId: ev.id } });
  if (ev.ceremonyAt !== undefined) ctx.state.schedule.push({ occurrence: `eventstage:${ev.id}`, at: ev.ceremonyAt, kind: 'eventStage', data: { eventId: ev.id } });
  if (playableHost(ctx, ev)) {
    addFeed(ctx.state, ctx.events, 'social', `${host.firstName} planned a ${def.name.toLowerCase()}${atVenue ? ` at ${venue.name}` : ''} for ${DAY_NAMES[weekday(startAt)]} at ${formatClock(startAt)} with ${names(ctx.state, ev.guestIds)}.`, host.id);
  }
  emit(ctx, ev, 'planned');
  return { ok: true, eventId: ev.id };
}

/** An accepted invitation in person (or on the phone): plans the event for this evening. A failure is told kindly. */
export function planEventFromSocial(ctx: SimCtx, actor: Person, target: Person, type: HomeEventType): void {
  const r = planEvent(ctx, { type, hostId: actor.id, guestIds: [target.id] }, { skipConsent: true });
  if (!r.ok && householdOf(ctx, actor)?.isPlayable) {
    addFeed(ctx.state, ctx.events, 'social', `${target.firstName} said yes, but it will have to wait: ${r.reason}`, actor.id);
  }
}

/** Cancels a planned event: invitations are withdrawn, guests who already came are sent home with a small sting. */
export function cancelEvent(ctx: SimCtx, id: Id): { ok: boolean; reason?: string } {
  const ev = findEvent(ctx.state, id);
  if (!ev) return { ok: false, reason: 'No such event.' };
  if (ev.status !== 'invited') return { ok: false, reason: 'It has already started.' };
  ev.status = 'cancelled';
  ctx.state.schedule = ctx.state.schedule.filter((e) => !(e.data?.eventId === id && (e.kind === 'eventStart' || e.kind === 'eventEnd' || e.kind === 'eventStage' || e.kind === 'eventTravel' || e.kind === 'visitArrive')));
  for (const gid of ev.guestIds) {
    const g = ctx.state.people[gid];
    if (!g) continue;
    applyRelDelta(ctx.state, gid, ev.hostId, { friendship: ev.arrivedIds.includes(gid) ? -2 : -1, trust: -1 }, ctx.now);
    if (ev.arrivedIds.includes(gid) && lotLoc(g)) setDeparture(ctx, gid, ctx.now + 5 + (hashString(gid + id) % EVENT_LEAVE_SPREAD));
  }
  if (isVenueEvent(ctx.state, ev)) sendGuestsHome(ctx, ev, false);
  if (playableHost(ctx, ev)) addFeed(ctx.state, ctx.events, 'social', `The ${ev.title.toLowerCase()} was called off.`, ev.hostId);
  emit(ctx, ev, 'cancelled');
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------------------------

function serveCatering(ctx: SimCtx, ev: HomeEvent, def: EventDef): void {
  const host = ctx.state.people[ev.hostId];
  const lot = ctx.state.lots[ev.lotId];
  if (!host || !lot || def.cateringPerPerson <= 0) return;
  const hostsHere = (ctx.state.households[ev.householdId]?.memberIds ?? []).filter((id) => lotLoc(ctx.state.people[id]!)?.lotId === lot.id).length;
  const portions = Math.max(1, hostsHere + ev.guestIds.length);
  const tables = lotObjects(ctx, lot.id, 0)
    .filter((r) => isTable(r.def) && !isBroken(r.obj))
    .map((r) => ({ r, free: freeSurfaceTiles(ctx, lot.id, r) }))
    .filter((x) => x.free.length > 0)
    .sort((a, b) => Number(b.r.def.tags.includes('dining') || b.r.def.id.includes('dining')) - Number(a.r.def.tags.includes('dining') || a.r.def.id.includes('dining'))
      || b.free.length - a.free.length || (a.r.obj.id < b.r.obj.id ? -1 : 1));
  const table = tables[0];
  if (!table) return;
  const cost = def.cateringPerPerson * portions;
  const paid = transact(ctx.state, ctx.events, ev.householdId, -cost, 'groceries', `${ev.title}: food`, { occurrence: `event:${ev.id}:food` });
  if (!paid.ok) {
    if (playableHost(ctx, ev)) addFeed(ctx.state, ctx.events, 'warning', `There was no money for the food at the ${ev.title.toLowerCase()}.`, ev.hostId);
    return;
  }
  const t = table.free[0]!;
  const recipe = Object.values(ctx.content.recipes).filter((x) => x.status === 'ready').sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1))[0];
  const item: WorldItem = {
    id: newId(ctx.state, 'itm'), kind: 'meal', lotId: lot.id, position: { x: t.x + 0.5, z: t.z + 0.5, level: table.r.obj.level, onObjectId: table.r.obj.id },
    recipeId: recipe?.id ?? 'meal', portions, quality: 0.85, createdAt: ctx.now, spoilsAt: ctx.now + MEAL_SPOIL_MINUTES, ownerHouseholdId: null,
  };
  ctx.state.items[item.id] = item;
  ev.catered = cost;
  ctx.events.emit({ type: 'item.changed', itemId: item.id, lotId: item.lotId });
  if (playableHost(ctx, ev)) addFeed(ctx.state, ctx.events, 'info', `Food is on the table for the ${ev.title.toLowerCase()}.`, ev.hostId);
}

/** eventStart: the event begins, the food is set out and the goals become visible. Processed once. */
export function startEvent(ctx: SimCtx, id: Id): void {
  const ev = findEvent(ctx.state, id);
  if (!ev || ev.status !== 'invited') return;
  const def = eventDef(ctx, ev);
  if (!def) return;
  if (isVenueEvent(ctx.state, ev)) {
    gatherAtVenue(ctx, ev.lotId);
    const host = ctx.state.people[ev.hostId];
    const there = !!host && (lotLoc(host)?.lotId === ev.lotId || (host.location.kind === 'offlot' && host.location.transit === true && host.location.lotId === ev.lotId));
    if (!there) { failVenueEvent(ctx, ev, 'the host did not make it there in time.'); return; }
  }
  ev.status = 'running';
  if (ev.ceremonyAt !== undefined) ev.stage = 'ceremony';
  serveCatering(ctx, ev, def);
  if (playableHost(ctx, ev)) addFeed(ctx.state, ctx.events, 'social', `The ${ev.title.toLowerCase()} has begun.`, ev.hostId);
  emit(ctx, ev, 'started');
}

/** A guest who was invited to an event has arrived (called from visitors.ts). Returns the planned departure time. */
export function guestArrived(ctx: SimCtx, p: Person, eventId: Id): GameMinutes | null {
  const ev = findEvent(ctx.state, eventId);
  if (!ev || !isActive(ev)) return null;
  if (!ev.arrivedIds.includes(p.id)) ev.arrivedIds.push(p.id);
  if (playableHost(ctx, ev)) addFeed(ctx.state, ctx.events, 'social', `${p.firstName} arrived for the ${ev.title.toLowerCase()}.`, p.id);
  emit(ctx, ev, 'goal');
  return Math.max(ev.endAt, ctx.now + 30) + (hashString(p.id + ev.id) % EVENT_LEAVE_SPREAD);
}

/**
 * Starts an event that simply happens (a welcome visit, a friend dropping by, a reconciliation) when the visitor
 * walks in. It lasts until the visitor's planned departure. No event starts without a host or a second event.
 */
export function startAmbientEvent(ctx: SimCtx, type: HomeEventType, visitor: Person, leaveAt: GameMinutes): HomeEvent | null {
  const def = ctx.content.events?.[type];
  const loc = lotLoc(visitor);
  const hh = ctx.state.households[ctx.state.activeHouseholdId];
  if (!def || def.status !== 'ready' || !loc || !hh) return null;
  if (eventsOf(ctx.state).some((e) => isActive(e) && e.arrivedIds.includes(visitor.id))) return null;
  const host = hh.memberIds.map((id) => ctx.state.people[id]).find((m) => !!m && lotLoc(m)?.lotId === loc.lotId) ?? ctx.state.people[hh.memberIds[0] ?? ''];
  if (!host) return null;
  const ev: HomeEvent = {
    id: newId(ctx.state, 'evt'), type, title: def.name, status: 'running', hostId: host.id, householdId: hh.id, lotId: loc.lotId,
    guestIds: [visitor.id], arrivedIds: [visitor.id], createdAt: ctx.now, startAt: ctx.now, endAt: Math.max(ctx.now + 30, leaveAt),
    goals: makeGoals(def, 1), pairs: [], ate: [],
  };
  pushEvent(ctx.state, ev);
  ctx.state.schedule.push({ occurrence: `eventend:${ev.id}`, at: ev.endAt, kind: 'eventEnd', data: { eventId: ev.id } });
  emit(ctx, ev, 'started');
  return ev;
}


// ---------------------------------------------------------------------------------------------
// Weddings: ceremony and celebration
// ---------------------------------------------------------------------------------------------

/**
 * The ceremony of a wedding (eventStage entry, once): when the couple are together on the lot and still engaged, the
 * bond becomes `spouse` with the outcome of the "Get Married" social (relationship gains, Just Married moodlet, a
 * permanent memory), the 'ceremony' goal is done and the event moves on to the celebration. Otherwise the vows are
 * postponed ("missed"): the party still goes on, with a lower score.
 */
export function performCeremony(ctx: SimCtx, id: Id): void {
  const ev = findEvent(ctx.state, id);
  if (!ev || ev.status === 'cancelled' || ev.ceremony || ev.partnerId === undefined) return;
  if (ev.status === 'invited') return; // the start entry comes first; ensureEventEnds repairs a lost one
  const occurrence = `wedding:${ev.id}:ceremony`;
  if (isProcessed(ctx.state, occurrence)) return;
  markProcessed(ctx.state, occurrence);
  const a = ctx.state.people[ev.hostId], b = ctx.state.people[ev.partnerId];
  const la = a ? lotLoc(a) : null, lb = b ? lotLoc(b) : null;
  const engaged = !!a && !!b && ctx.state.bonds[pairKey(a.id, b.id)]?.status === 'engaged';
  ev.stage = 'celebration';
  if (!a || !b || !engaged || !la || !lb || la.lotId !== lb.lotId) {
    ev.ceremony = 'missed';
    if (playableHost(ctx, ev)) addFeed(ctx.state, ctx.events, 'warning', `The vows had to wait: ${a?.firstName ?? 'the host'} and ${b?.firstName ?? 'their partner'} were not together for the ceremony.`, ev.hostId);
    emit(ctx, ev, 'goal');
    return;
  }
  const out = ctx.content.socials.marry?.success;
  const gain = out?.actor ?? { romance: 10, friendship: 5, trust: 6 };
  applyRelDelta(ctx.state, a.id, b.id, gain, ctx.now);
  applyRelDelta(ctx.state, b.id, a.id, out?.target ?? gain, ctx.now);
  if (out?.social) { changeNeed(ctx, a, 'social', out.social); changeNeed(ctx, b, 'social', out.social); }
  if (out?.fun) { changeNeed(ctx, a, 'fun', out.fun); changeNeed(ctx, b, 'fun', out.fun); }
  addMoodlet(ctx.content, a, 'newlywed', ctx.now, 'wedding');
  addMoodlet(ctx.content, b, 'newlywed', ctx.now, 'wedding');
  setBondStatus(ctx.state, ctx.events, a.id, b.id, 'spouse', ctx.now);
  addMemory(ctx.state, a, { kind: 'married', importance: 3, withId: b.id, text: `${a.firstName} and ${b.firstName} got married at their wedding.` });
  addMemory(ctx.state, b, { kind: 'married', importance: 3, withId: a.id, text: `${b.firstName} and ${a.firstName} got married at their wedding.` });
  // Everybody who came to see it remembers it a little.
  for (const gid of ev.arrivedIds) {
    const g = ctx.state.people[gid];
    if (g && g.id !== a.id && g.id !== b.id) addMemory(ctx.state, g, { kind: 'party', importance: 2, withId: a.id, text: `Was at the wedding of ${a.firstName} and ${b.firstName}.` });
  }
  ev.ceremony = 'done';
  bump(ctx, ev, 'ceremony', 1);
  if (playableHost(ctx, ev)) addFeed(ctx.state, ctx.events, 'social', `${a.firstName} and ${b.firstName} said their vows. The celebration begins!`, a.id);
  emit(ctx, ev, 'goal');
}

// ---------------------------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------------------------

function bump(ctx: SimCtx, ev: HomeEvent, kind: EventGoal['kind'], to?: number): void {
  for (const g of ev.goals) {
    if (g.kind !== kind || g.done) continue;
    g.progress = to !== undefined ? Math.max(g.progress, to) : g.progress + 1;
    if (g.progress >= g.target) {
      g.done = true;
      if (playableHost(ctx, ev)) addFeed(ctx.state, ctx.events, 'social', `${ev.title}: ${g.text} - done!`, ev.hostId);
    }
    emit(ctx, ev, 'goal');
  }
}

const TALK_CATEGORIES = new Set(['greeting', 'friendly', 'funny', 'deep', 'support', 'family']);

/** Counts a resolved social toward the goals of running events both people take part in. */
export function noteSocial(ctx: SimCtx, actor: Person, target: Person, def: SocialDef, accepted: boolean): void {
  if (!accepted) return;
  for (const ev of eventsOf(ctx.state)) {
    if (ev.status !== 'running') continue;
    const who = participantsOf(ctx.state, ev);
    if (!who.includes(actor.id) || !who.includes(target.id)) continue;
    const hostSide = ctx.state.households[ev.householdId]?.memberIds ?? [];
    const guestInvolved = !hostSide.includes(actor.id) || !hostSide.includes(target.id);
    if (!guestInvolved) continue; // the household talking among themselves is not the event
    if (def.id !== 'waveGoodbye' && TALK_CATEGORIES.has(def.category)) bump(ctx, ev, 'chat');
    if (def.category === 'funny') bump(ctx, ev, 'laugh');
    if (def.category === 'romantic') bump(ctx, ev, 'romantic');
    if (def.id === 'apologize' || def.id === 'makeUp') bump(ctx, ev, 'reconcile');
    if (def.id !== 'waveGoodbye') {
      const key = pairKey(actor.id, target.id);
      if (!ev.pairs.includes(key)) { ev.pairs.push(key); bump(ctx, ev, 'mingle', ev.pairs.length); }
    }
  }
}

/**
 * Counts an accepted group chat toward the goals of running events: one 'chat' (not one per pair) and every pair of the
 * circle toward 'mingle'.
 */
export function noteGroup(ctx: SimCtx, people: Person[], accepted: boolean): void {
  if (!accepted) return;
  for (const ev of eventsOf(ctx.state)) {
    if (ev.status !== 'running') continue;
    const who = participantsOf(ctx.state, ev);
    if (!people.every((p) => who.includes(p.id))) continue;
    const hostSide = ctx.state.households[ev.householdId]?.memberIds ?? [];
    if (people.every((p) => hostSide.includes(p.id))) continue;
    bump(ctx, ev, 'chat');
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const key = pairKey(people[i]!.id, people[j]!.id);
        if (!ev.pairs.includes(key)) ev.pairs.push(key);
      }
    }
    bump(ctx, ev, 'mingle', ev.pairs.length);
  }
}

/** Counts a finished meal toward the 'eat' goal of the running event the eater takes part in. */
export function noteEat(ctx: SimCtx, p: Person): void {
  const ev = runningEventOf(ctx.state, p.id);
  if (!ev || ev.ate.includes(p.id)) return;
  ev.ate.push(p.id);
  bump(ctx, ev, 'eat', ev.ate.length);
}

/** Extra appetite for talking while a running event still has social goals open. */
export function eventSocialBonus(ctx: SimCtx, p: Person): number {
  const ev = runningEventOf(ctx.state, p.id);
  if (!ev) return 0;
  return ev.goals.some((g) => !g.done && g.kind !== 'eat') ? EVENT_SOCIAL_BONUS : 0;
}

/** Catering meals a participant may still take (the event has an open 'eat' goal and they have not eaten). */
export function eventMealsFor(ctx: SimCtx, p: Person): WorldItem[] {
  const ev = runningEventOf(ctx.state, p.id);
  const loc = lotLoc(p);
  if (!ev || !loc || ev.ate.includes(p.id) || !ev.goals.some((g) => g.kind === 'eat' && !g.done) || !ev.catered) return [];
  return Object.values(ctx.state.items).filter((it) => it.kind === 'meal' && it.lotId === loc.lotId && it.ownerHouseholdId === null && it.portions - ctx.res.itemReserved(it.id) > 0);
}

/** True when `a` and `b` are the two sides of a running romantic event (a date). */
export function onDateTogether(ctx: SimCtx, a: Person, b: Person): boolean {
  return eventsOf(ctx.state).some((ev) => ev.status === 'running' && eventDef(ctx, ev)?.romantic === true
    && [ev.hostId, ...ev.guestIds].includes(a.id) && [ev.hostId, ...ev.guestIds].includes(b.id));
}

// ---------------------------------------------------------------------------------------------
// Ending
// ---------------------------------------------------------------------------------------------

/** 0..100 from goal progress (goals that could not be served are waived), attendance and the guests' mood. */
export function scoreEvent(ctx: SimCtx, ev: HomeEvent): number {
  const goals = ev.goals.filter((g) => !(g.kind === 'eat' && !ev.catered));
  const total = goals.reduce((s, g) => s + g.weight, 0);
  const got = goals.reduce((s, g) => s + g.weight * Math.min(1, g.progress / g.target), 0);
  const goalPart = total > 0 ? got / total : 1;
  const present = ev.arrivedIds.filter((id) => ev.guestIds.includes(id));
  const attendance = ev.guestIds.length > 0 ? present.length / ev.guestIds.length : 1;
  const moods = present.map((id) => ctx.state.people[id]).filter((p): p is Person => !!p).map((p) => computeMood(ctx.content, p).value);
  const avg = moods.length > 0 ? moods.reduce((a, b) => a + b, 0) / moods.length : 0;
  const moodPart = Math.max(0, Math.min(1, (avg + 25) / 60));
  return Math.round(100 * attendance * (EVENT_GOAL_SHARE * goalPart + (1 - EVENT_GOAL_SHARE) * moodPart));
}

/** eventEnd: scores the event and pays out once, then the guests leave politely. Processed once. */
export function endEvent(ctx: SimCtx, id: Id): void {
  const ev = findEvent(ctx.state, id);
  if (!ev || !isActive(ev)) return;
  const def = eventDef(ctx, ev);
  const occurrence = `eventdone:${ev.id}`;
  if (isProcessed(ctx.state, occurrence)) return;
  markProcessed(ctx.state, occurrence);
  ev.status = 'done';
  ev.score = scoreEvent(ctx, ev);
  const [, rating, mult] = EVENT_RATING.find(([min]) => ev.score! >= min) ?? EVENT_RATING[EVENT_RATING.length - 1]!;
  ev.rating = rating;
  const present = ev.arrivedIds.map((gid) => ctx.state.people[gid]).filter((p): p is Person => !!p && ev.guestIds.includes(p.id));
  const host = ctx.state.people[ev.hostId];
  if (def && host && present.length > 0) {
    const R = def.reward;
    const hostSide = (ctx.state.households[ev.householdId]?.memberIds ?? []).map((m) => ctx.state.people[m]).filter((p): p is Person => !!p);
    const delta = (v: number) => (mult >= 0 ? v * mult : v * mult);
    for (const g of present) {
      const d = { friendship: delta(R.friendship), trust: delta(R.trust), ...(R.romance ? { romance: delta(R.romance) } : {}) };
      applyRelDelta(ctx.state, host.id, g.id, d, ctx.now);
      applyRelDelta(ctx.state, g.id, host.id, d, ctx.now);
      if (R.social) { changeNeed(ctx, g, 'social', R.social * Math.max(0.2, mult)); }
      if (R.fun) { changeNeed(ctx, g, 'fun', R.fun * Math.max(0, mult)); }
      const first = def.romantic && !hasRecentMemory(host, g.id, ['firstDate', 'greatDate', 'badDate'], 100 * 1440, ctx.now);
      if (rating === 'poor') {
        addMoodlet(ctx.content, g, R.badMoodlet, ctx.now, ev.type);
        const kind = R.memory.badKind ?? R.memory.kind;
        const imp = Math.min(R.memory.importance, 2) as 1 | 2;
        addMemory(ctx.state, host, { kind: def.romantic ? 'badDate' : kind, importance: imp, withId: g.id, text: R.memory.badText.replaceAll('{a}', host.firstName).replaceAll('{b}', g.firstName) });
        addMemory(ctx.state, g, { kind: def.romantic ? 'badDate' : kind, importance: imp, withId: host.id, text: R.memory.badText.replaceAll('{a}', g.firstName).replaceAll('{b}', host.firstName) });
      } else if (rating !== 'fair') {
        addMoodlet(ctx.content, g, R.moodlet, ctx.now, ev.type);
        const kind = first ? 'firstDate' : R.memory.kind;
        const text = first ? `Their first date: a lovely evening at home with {b}.` : R.memory.text;
        addMemory(ctx.state, host, { kind, importance: R.memory.importance, withId: g.id, text: text.replaceAll('{a}', host.firstName).replaceAll('{b}', g.firstName) });
        addMemory(ctx.state, g, { kind, importance: R.memory.importance, withId: host.id, text: text.replaceAll('{a}', g.firstName).replaceAll('{b}', host.firstName) });
      }
    }
    for (const m of hostSide) {
      if (R.social) changeNeed(ctx, m, 'social', R.social * Math.max(0.2, mult));
      if (R.fun) changeNeed(ctx, m, 'fun', R.fun * Math.max(0, mult));
      if (rating === 'poor') addMoodlet(ctx.content, m, R.badMoodlet, ctx.now, ev.type);
      else if (rating !== 'fair') addMoodlet(ctx.content, m, R.moodlet, ctx.now, ev.type);
    }
  }
  if (isVenueEvent(ctx.state, ev)) {
    gatherAtVenue(ctx, ev.lotId);
    sendGuestsHome(ctx, ev, true);
    ctx.state.schedule.push({ occurrence: `evtravel:${ev.id}:home`, at: ctx.now + 10, kind: 'eventTravel', data: { eventId: ev.id, phase: 'home' } });
  }
  // Guests go home at the departure scheduled when they were invited or arrived (event end + a small spread); see visitors.ts depart().
  if (playableHost(ctx, ev)) {
    const word = present.length === 0 ? 'Nobody came to the' : rating === 'great' ? 'A great' : rating === 'good' ? 'A good' : rating === 'fair' ? 'An okay' : 'A disappointing';
    addFeed(ctx.state, ctx.events, 'social', present.length === 0 ? `${word} ${ev.title.toLowerCase()}.` : `${word} ${ev.title.toLowerCase()} (${ev.score}/100).`, ev.hostId);
  }
  emit(ctx, ev, 'ended');
  trimHistory(ctx.state);
}

// ---------------------------------------------------------------------------------------------
// Schedule entries and daily rolls
// ---------------------------------------------------------------------------------------------

/** Handles eventStart / eventEnd schedule entries (processSchedule marks them processed first). */
export function runEventEntry(ctx: SimCtx, e: ScheduledEvent): void {
  const id = e.data?.eventId;
  if (typeof id !== 'string') return;
  if (e.kind === 'eventStart') startEvent(ctx, id);
  else if (e.kind === 'eventStage') performCeremony(ctx, id);
  else if (e.kind === 'eventEnd') endEvent(ctx, id);
  else if (e.kind === 'eventTravel') {
    const ev = findEvent(ctx.state, id);
    if (!ev) return;
    if (e.data?.phase === 'home') returnFromVenue(ctx, ev, typeof e.data.attempt === 'number' ? e.data.attempt : 0);
    else departForVenue(ctx, ev);
  }
}

/** Safety net after load: running events whose end entry is gone (an edited save) end now. */
export function ensureEventEnds(ctx: SimCtx): void {
  for (const ev of eventsOf(ctx.state)) {
    if (!isActive(ev)) continue;
    if (ctx.now >= ev.endAt + 5 && !ctx.state.schedule.some((e) => e.kind === 'eventEnd' && e.data?.eventId === ev.id)) endEvent(ctx, ev.id);
    else if (ev.status === 'running' && ev.ceremonyAt !== undefined && !ev.ceremony && ctx.now >= ev.ceremonyAt + 5
      && !ctx.state.schedule.some((e) => e.kind === 'eventStage' && e.data?.eventId === ev.id)) performCeremony(ctx, ev.id);
    else if (ev.status === 'invited' && ctx.now >= ev.startAt + 5 && !ctx.state.schedule.some((e) => e.kind === 'eventStart' && e.data?.eventId === ev.id)) startEvent(ctx, ev.id);
  }
}

/**
 * Daily roll for reconciliations: somebody who recently argued with (or was insulted by) a member of the active
 * household, and still feels cool about it, comes by to clear the air. Needs visible conditions (an unsettled
 * argument memory in the last days), the visitors setting, and happens at most once a week per pair.
 */
export function dailyReconciliation(ctx: SimCtx, day: number): void {
  const hh = ctx.state.households[ctx.state.activeHouseholdId];
  if (!ctx.state.settings.visitors || !hh || day < 1) return;
  if (activeEvents(ctx.state, hh.id).length > 0) return;
  const week = Math.floor(day / RECONCILE_COOLDOWN_DAYS);
  const candidates: Array<{ npc: Person; member: Person }> = [];
  for (const npc of Object.values(ctx.state.people)) {
    if (!npc.isNpc || npc.location.kind !== 'offlot' || npc.location.place !== 'home') continue;
    if (ctx.state.schedule.some((e) => e.kind === 'visitArrive' && e.personId === npc.id)) continue;
    for (const mid of hh.memberIds) {
      const member = ctx.state.people[mid];
      if (!member) continue;
      if (!hasRecentMemory(npc, mid, ['argument', 'insult'], RECONCILE_WINDOW_DAYS * 1440, ctx.now)) continue;
      const rel = peekRel(ctx.state, npc.id, mid);
      if (rel.familiarity < 20 || rel.friendship > 25) continue;
      if (isProcessed(ctx.state, `reconcile:${pairKey(npc.id, mid)}:${week}`)) continue;
      candidates.push({ npc, member });
    }
  }
  if (candidates.length === 0 || !ctx.rng.chance(RECONCILE_CHANCE)) return;
  const pick = ctx.rng.pick(candidates);
  markProcessed(ctx.state, `reconcile:${pairKey(pick.npc.id, pick.member.id)}:${week}`);
  const at = atDayMinute(day, ctx.rng.int(10 * 4, 17 * 4) * 15);
  ctx.state.schedule.push({
    occurrence: `visit:${pick.npc.id}:reconcile:${day}`, at, kind: 'visitArrive', personId: pick.npc.id,
    data: { invitedBy: pick.member.id, reconcile: true },
  });
}

/** True while `p` is an invited participant of an event that has not ended (their visit is managed by the event). */
export function inActiveEvent(state: WorldState, personId: Id): boolean {
  return eventsOf(state).some((e) => isActive(e) && (e.guestIds.includes(personId) || e.arrivedIds.includes(personId)));
}
