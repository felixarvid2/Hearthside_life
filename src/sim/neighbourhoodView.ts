// Read-only view of the neighbourhood for the interface (GameAPI.neighbourhood, Milestone 7): every lot with its kind,
// name, address, household, who is there and whether the household can go, plus the households and the trip under way.
// Pure: building it never changes the world.

import { minuteOfDay } from '../core/clock';
import { fullName } from '../core/state';
import type { Cents, GameMinutes, Id, Lot, Person, WorldState } from '../core/types';
import { hoursText, lotIsOpen, travelMinutes, venueInfo } from '../world/neighbourhood';
import type { SimCtx } from './context';
import { lotLoc } from './context';
import { upcomingCommunityEvents } from './community';
import type { CommunityEventInfo } from './community';
import { householdBrief, isVacant } from './households';
import { activeTrip, travelProblem } from './lotTravel';
import { placeOf } from './places';

export interface LotPerson {
  personId: Id;
  name: string;
  householdId: Id;
  householdName: string;
  /** Belongs to the household the player runs. */
  yours: boolean;
  /** On the lot in detail (the active lot); false for people the light schedule has there. */
  here: boolean;
  /** Badge text ("At Lakeside Park"). */
  status: string;
}

export type Tenure = 'yours' | 'owned' | 'rented' | 'for-rent' | 'for-sale';

export interface LotInfo {
  id: Id;
  name: string;
  address: string;
  kind: 'residential' | 'venue';
  venueType: string | null;
  /** "Park", "Cafe", "Home"... */
  label: string;
  blurb: string;
  map: { x: number; y: number };
  size: { width: number; depth: number };
  active: boolean;
  /** The active household's home. */
  isHome: boolean;
  built: boolean;
  objects: number;
  /** A venue with things to do (a built layout with objects); homes are always usable. */
  usable: boolean;
  open: boolean;
  hours: string | null;
  householdId: Id | null;
  householdName: string | null;
  tenure: Tenure | null;
  rent: Cents | null;
  price: Cents | null;
  /** Minutes the trip from where the household is takes. */
  travelMinutes: number | null;
  /** Null when the household can set out for this lot now; else the reason ("Kettle & Crumb will be closed..."). */
  travelProblem: string | null;
  people: LotPerson[];
}

export interface HouseholdInfo {
  id: Id;
  name: string;
  homeLotId: Id | null;
  homeLotName: string | null;
  /** The household the player runs. */
  active: boolean;
  memberIds: Id[];
  memberNames: string[];
  funds: Cents;
  where: string;
  /** Can the player switch to this household (not the active one, has a home)? */
  switchable: boolean;
}

export interface TripInfo {
  occurrence: string;
  personIds: Id[];
  lotId: Id;
  lotName: string;
  arriveAt: GameMinutes;
}

export interface NeighbourhoodInfo {
  street: string | null;
  now: GameMinutes;
  activeLotId: Id;
  activeHouseholdId: Id;
  /** Home lot of the household the player runs. */
  homeLotId: Id | null;
  lots: LotInfo[];
  households: HouseholdInfo[];
  trip: TripInfo | null;
  /** What is on at the venues in the next week (running events first). */
  events: CommunityEventInfo[];
}

function personBadge(state: WorldState, p: Person, activeLotId: Id): LotPerson {
  const hh = state.households[p.householdId];
  return {
    personId: p.id, name: fullName(p), householdId: p.householdId, householdName: hh?.name ?? '',
    yours: p.householdId === state.activeHouseholdId, here: lotLoc(p)?.lotId === activeLotId, status: placeOf(state, p).text,
  };
}

/** Everyone at a lot: on it in detail, or placed there by the light schedule (at home, or at the venue). */
export function peopleAt(state: WorldState, lotId: Id): Person[] {
  return Object.values(state.people).filter((p) => {
    const loc = p.location;
    if (loc.kind === 'lot') return loc.lotId === lotId;
    return !loc.transit && loc.lotId === lotId && (loc.place === 'home' || loc.place === 'visiting');
  });
}

export function neighbourhoodInfo(ctx: SimCtx): NeighbourhoodInfo {
  const state = ctx.state;
  const hh = state.households[state.activeHouseholdId];
  const activeLot = state.lots[state.activeLotId];
  const members = hh?.memberIds.map((id) => state.people[id]).filter((p): p is Person => !!p) ?? [];
  // The people who could set out now: those on a lot (or left at home).
  const movers = members.filter((p) => p.location.kind === 'lot' || (p.location.kind === 'offlot' && p.location.place === 'home' && !p.location.transit)).map((p) => p.id);
  const trip = activeTrip(state);
  const origin: Lot | undefined = activeLot;
  const lots: LotInfo[] = Object.values(state.lots).map((lot) => {
    const venue = venueInfo(lot);
    const household = Object.values(state.households).find((h) => h.homeLotId === lot.id) ?? null;
    const vacant = isVacant(state, lot);
    const tenure: Tenure | null = lot.kind !== 'residential' ? null
      : vacant ? (lot.rent !== undefined ? 'for-rent' : lot.price !== undefined ? 'for-sale' : null)
        : household?.id === state.activeHouseholdId ? 'yours'
          : lot.ownerHouseholdId === null && lot.rent !== undefined ? 'rented' : 'owned';
    const built = lot.built !== false;
    const objects = Object.keys(lot.objects).length;
    return {
      id: lot.id, name: lot.name, address: lot.address, kind: lot.kind, venueType: lot.venueType ?? null,
      label: venue?.label ?? 'Home', blurb: lot.blurb ?? '', map: lot.map ? { ...lot.map } : { x: 50, y: 50 },
      size: { width: lot.width, depth: lot.depth }, active: lot.id === state.activeLotId, isHome: lot.id === hh?.homeLotId,
      built, objects, usable: lot.kind === 'residential' ? built : built && objects > 0,
      open: lotIsOpen(lot, minuteOfDay(ctx.now)), hours: venue ? hoursText(venue) : null,
      householdId: household?.id ?? null, householdName: household?.name ?? null, tenure,
      rent: lot.rent ?? null, price: lot.price ?? null,
      travelMinutes: origin && origin.id !== lot.id ? travelMinutes(origin, lot) : null,
      travelProblem: movers.length === 0 ? 'Nobody is free to go.' : travelProblem(ctx, movers, lot.id),
      people: peopleAt(state, lot.id).map((p) => personBadge(state, p, state.activeLotId)),
    };
  });
  const households: HouseholdInfo[] = Object.values(state.households).map((h) => {
    const brief = householdBrief(state, h);
    return {
      id: h.id, name: h.name, homeLotId: h.homeLotId, homeLotName: brief.homeLotName, active: h.id === state.activeHouseholdId,
      memberIds: [...h.memberIds], memberNames: brief.memberNames, funds: h.funds, where: brief.where,
      switchable: h.id !== state.activeHouseholdId && !!h.homeLotId && h.memberIds.length > 0,
    };
  });
  return {
    street: state.neighbourhood?.street ?? null, now: ctx.now, activeLotId: state.activeLotId, activeHouseholdId: state.activeHouseholdId,
    homeLotId: hh?.homeLotId ?? null, lots, households, events: upcomingCommunityEvents(state, ctx.content, ctx.now, 7),
    trip: trip ? {
      occurrence: trip.occurrence, personIds: typeof trip.data?.personIds === 'string' ? trip.data.personIds.split(',') : [],
      lotId: String(trip.data?.lotId ?? ''), lotName: state.lots[String(trip.data?.lotId ?? '')]?.name ?? '', arriveAt: trip.at,
    } : null,
  };
}
