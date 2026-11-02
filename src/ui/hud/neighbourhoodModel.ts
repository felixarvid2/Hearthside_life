// Pure view-model of the neighbourhood map (Milestone 7): turns the plain data of GameAPI.neighbourhood() into the
// words, marks, groups and action states the map panel draws. No DOM, no game calls: everything is a function of its
// arguments, so it is tested in tests/unit/ui/neighbourhoodModel.test.ts.

import { formatClock, formatDuration } from '../../core/clock';
import { formatMoney } from '../../core/money';
import type { Id, Person, WorldState } from '../../core/types';
import type { HouseholdInfo, LotInfo, LotPerson, MovePreview, NeighbourhoodInfo, TripInfo } from '../../game/api';
import { activeTrip } from '../../sim/lotTravel';
import { placeOf, type PlaceKind } from '../../sim/places';

// ---- icons, marks and one-line status ----

const VENUE_ICONS: Record<string, string> = { park: 'park', cafe: 'cafe', gym: 'gym', library: 'book', arts: 'arts', market: 'market' };

/** Icon name (src/ui/kit/icons.ts) for a lot: its venue type, or a house. */
export function lotIconName(lot: Pick<LotInfo, 'kind' | 'venueType'>): string {
  return lot.kind === 'venue' ? VENUE_ICONS[lot.venueType ?? ''] ?? 'pin' : 'home';
}

export type StatusTone = 'open' | 'closed' | 'yours' | 'free' | 'neutral';

/** The short line under a lot's name: "Open", "Closed", "Your home", "For rent $125/wk", or the name of the household that lives there. */
export function lotStatus(lot: LotInfo): { text: string; tone: StatusTone } {
  if (lot.kind === 'venue') return lot.open ? { text: 'Open', tone: 'open' } : { text: 'Closed', tone: 'closed' };
  switch (lot.tenure) {
    case 'yours': return { text: 'Your home', tone: 'yours' };
    case 'for-rent': return { text: `For rent ${lot.rent !== null ? `${formatMoney(lot.rent)}/wk` : ''}`.trim(), tone: 'free' };
    case 'for-sale': return { text: `For sale ${lot.price !== null ? formatMoney(lot.price) : ''}`.trim(), tone: 'free' };
    default: return { text: lot.householdName ?? 'Home', tone: 'neutral' };
  }
}

/** Longer tenure sentence for the detail sheet, or null for venues. */
export function tenureText(lot: LotInfo): string | null {
  const who = lot.householdName ? `the ${lot.householdName} household` : 'nobody';
  switch (lot.tenure) {
    case 'yours': return 'Your household lives here.';
    case 'owned': return `Owned by ${who}.`;
    case 'rented': return `Rented by ${who}${lot.rent !== null ? ` for ${formatMoney(lot.rent)} a week` : ''}.`;
    case 'for-rent': return `Empty, for rent${lot.rent !== null ? `: ${formatMoney(lot.rent)} a week` : ''}.`;
    case 'for-sale': return `Empty, for sale${lot.price !== null ? `: ${formatMoney(lot.price)}` : ''}.`;
    default: return null;
  }
}

export interface LotMark { id: 'active' | 'home'; text: string }

/** "You are here" and "Your home" marks. */
export function lotMarks(lot: Pick<LotInfo, 'active' | 'isHome'>): LotMark[] {
  const out: LotMark[] = [];
  if (lot.active) out.push({ id: 'active', text: 'You are here' });
  if (lot.isHome) out.push({ id: 'home', text: 'Your home' });
  return out;
}

const firstName = (full: string): string => full.split(' ')[0] ?? full;

/** Who is there, short: "Mira, Sage +2", or "Nobody". */
export function peopleLine(people: LotPerson[], max = 2): string {
  if (people.length === 0) return 'Nobody';
  const ordered = [...people].sort((a, b) => Number(b.yours) - Number(a.yours) || a.name.localeCompare(b.name));
  const shown = ordered.slice(0, max).map((p) => firstName(p.name));
  return people.length > max ? `${shown.join(', ')} +${people.length - max}` : shown.join(', ');
}

/** "Open 6:00 AM - 10:00 PM" / "Closed, opens ..." style line for venues; null for homes. */
export function hoursLine(lot: Pick<LotInfo, 'hours' | 'open'>): string | null {
  return lot.hours ? `${lot.open ? 'Open' : 'Closed'} ${lot.hours}` : null;
}

export function travelLine(lot: Pick<LotInfo, 'active' | 'travelMinutes'>): string | null {
  if (lot.active) return null;
  return lot.travelMinutes !== null ? `${lot.travelMinutes} min away` : null;
}

// ---- map and list ----

/** CSS percentages for a pin, kept inside the map so the pin never hangs over the edge. */
export function pinPosition(lot: Pick<LotInfo, 'map'>): { left: number; top: number } {
  const clamp = (n: number) => Math.max(7, Math.min(93, Number.isFinite(n) ? n : 50));
  return { left: clamp(lot.map.x), top: clamp(lot.map.y) };
}

export interface LotSection { id: 'here' | 'places' | 'homes' | 'empty'; title: string; lots: LotInfo[] }

/** List view: where you are first, then the public places, the homes with households, and the empty homes. */
export function lotSections(lots: LotInfo[]): LotSection[] {
  const byName = (a: LotInfo, b: LotInfo) => a.name.localeCompare(b.name);
  const here = lots.filter((l) => l.active);
  const rest = lots.filter((l) => !l.active);
  const sections: LotSection[] = [
    { id: 'here', title: 'You are here', lots: here },
    { id: 'places', title: 'Places to go', lots: rest.filter((l) => l.kind === 'venue').sort(byName) },
    { id: 'homes', title: 'Homes', lots: rest.filter((l) => l.kind === 'residential' && l.tenure !== 'for-rent' && l.tenure !== 'for-sale').sort((a, b) => Number(b.isHome) - Number(a.isHome) || byName(a, b)) },
    { id: 'empty', title: 'Empty homes', lots: rest.filter((l) => l.kind === 'residential' && (l.tenure === 'for-rent' || l.tenure === 'for-sale')).sort(byName) },
  ];
  return sections.filter((s) => s.lots.length > 0);
}

export interface MapSummary { lots: number; venues: number; usableVenues: number; homes: number; open: number }

export function mapSummary(lots: LotInfo[]): MapSummary {
  const venues = lots.filter((l) => l.kind === 'venue');
  return {
    lots: lots.length, venues: venues.length, usableVenues: venues.filter((l) => l.usable).length,
    homes: lots.length - venues.length, open: venues.filter((l) => l.open).length,
  };
}

// ---- the trip under way ----

export interface TripView {
  lotId: Id;
  lotName: string;
  /** "On the way to Lakeside Park". */
  title: string;
  /** "Mira and Sage". */
  who: string;
  arrivesText: string;
  minutesLeft: number;
  /** "Mira and Sage - arrives 2:20 PM (in 18 min)". */
  line: string;
}

export function joinNames(names: string[]): string {
  if (names.length === 0) return 'Nobody';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The trip under way read straight from the world (cheap enough for the HUD's regular refresh), or null. */
export function tripFromState(state: WorldState): TripInfo | null {
  const e = activeTrip(state);
  if (!e) return null;
  const lotId = String(e.data?.lotId ?? '');
  return {
    occurrence: e.occurrence, personIds: typeof e.data?.personIds === 'string' ? e.data.personIds.split(',') : [],
    lotId, lotName: state.lots[lotId]?.name ?? '', arriveAt: e.at,
  };
}

export function tripView(trip: TripInfo | null, now: number, nameOf: (id: Id) => string): TripView | null {
  if (!trip) return null;
  const minutesLeft = Math.max(0, Math.ceil(trip.arriveAt - now));
  const who = joinNames(trip.personIds.map(nameOf));
  const arrivesText = formatClock(trip.arriveAt);
  return {
    lotId: trip.lotId, lotName: trip.lotName, title: `On the way to ${trip.lotName || 'another lot'}`, who, arrivesText, minutesLeft,
    line: `${who} - arrives ${arrivesText}${minutesLeft > 0 ? ` (in ${formatDuration(minutesLeft)})` : ''}`,
  };
}

// ---- who can set out ----

export interface Traveller {
  id: Id;
  name: string;
  canGo: boolean;
  /** Why not ("is at work"), else null. */
  why: string | null;
  /** Where they are now, for the chip ("At home", "At Lakeside Park"). */
  where: string;
  kind: PlaceKind;
}

/** Whether a household member can set out (mirrors the checks of sim/lotTravel.travelProblem that depend on the person). */
export function memberTravel(state: WorldState, p: Person): { canGo: boolean; why: string | null } {
  const loc = p.location;
  if (loc.kind === 'lot') return { canGo: true, why: null };
  if (loc.transit) return { canGo: false, why: 'is already on the way' };
  if (loc.place === 'work') return { canGo: false, why: 'is at work' };
  if (loc.place === 'school') return { canGo: false, why: 'is at school' };
  if (loc.place !== 'home') return { canGo: false, why: `is out (${placeOf(state, p).text.toLowerCase()})` };
  return { canGo: true, why: null };
}

export function travellers(state: WorldState, memberIds: Id[]): Traveller[] {
  const out: Traveller[] = [];
  for (const id of memberIds) {
    const p = state.people[id];
    if (!p) continue;
    const t = memberTravel(state, p);
    out.push({ id, name: p.firstName, canGo: t.canGo, why: t.why, where: placeOf(state, p).text, kind: placeOf(state, p).kind });
  }
  return out;
}

/** Who is ticked at first: the selected person when they can go, else the first who can (`all`: everybody who can). */
export function defaultTravellers(list: Traveller[], selectedId: Id | null, all = false): Id[] {
  if (all) return list.filter((t) => t.canGo).map((t) => t.id);
  const sel = list.find((t) => t.id === selectedId && t.canGo);
  if (sel) return [sel.id];
  const first = list.find((t) => t.canGo);
  return first ? [first.id] : [];
}

/** Keeps only the ticked people who still can go (the world moves on while the sheet is open). */
export function keepTravellers(list: Traveller[], ticked: Iterable<Id>): Id[] {
  const ok = new Set(list.filter((t) => t.canGo).map((t) => t.id));
  return [...ticked].filter((id) => ok.has(id));
}

// ---- actions of a lot ----

export interface LotActions {
  /** You are on this lot. */
  here: boolean;
  /** "Go here" (a lot that is not your home and not the active lot). */
  visit: boolean;
  /** The primary action is "Go home" (your home, when you are elsewhere). */
  goHome: boolean;
  move: 'rent' | 'buy' | null;
  /** An NPC household that can be played from this home. */
  play: HouseholdInfo | null;
}

export function lotActions(lot: LotInfo, households: HouseholdInfo[]): LotActions {
  const household = lot.householdId ? households.find((h) => h.id === lot.householdId) ?? null : null;
  return {
    here: lot.active,
    visit: !lot.active && !lot.isHome,
    goHome: lot.isHome && !lot.active,
    move: lot.tenure === 'for-rent' ? 'rent' : lot.tenure === 'for-sale' ? 'buy' : null,
    play: household && !household.active && household.switchable && lot.tenure !== 'yours' ? household : null,
  };
}

/** Whether the household is away from its home lot (shows the global "Go home" button). */
export function awayFromHome(info: Pick<NeighbourhoodInfo, 'activeLotId' | 'homeLotId'>): boolean {
  return info.homeLotId !== null && info.activeLotId !== info.homeLotId;
}

// ---- moving house ----

/** The lines of the move confirmation: the preview's own sentences plus what changes hands. */
export function moveSummary(pv: MovePreview, lotName: string): { title: string; confirm: string; lines: string[] } {
  const buy = pv.mode === 'buy';
  const lines = [...pv.lines];
  lines.push(`${buy ? 'You pay' : 'Paid now'}: ${formatMoney(pv.cost)}.`);
  if (pv.proceeds > 0) lines.push(`You receive ${formatMoney(pv.proceeds)} for your current home.`);
  return { title: buy ? `Buy ${lotName}?` : `Move into ${lotName}?`, confirm: buy ? 'Buy and move' : 'Rent and move', lines };
}

// ---- off-lot household members ----

export interface AwayInfo {
  kind: PlaceKind;
  /** "At Lakeside Park". */
  text: string;
  /** Lot they are at or heading to, when it is one you can go to. */
  lotId: Id | null;
  lotName: string | null;
  /** "Back around 5:00 PM" or "Arrives 2:20 PM", or null. */
  when: string | null;
  /** Whether "Go to <place>" makes sense: a lot other than the active one, not in transit. */
  canGoTo: boolean;
}

export function awayInfo(state: WorldState, p: Person): AwayInfo | null {
  if (p.location.kind === 'lot') return null;
  const place = placeOf(state, p);
  const until = p.location.until;
  const transit = place.kind === 'transit';
  return {
    kind: place.kind, text: place.text, lotId: place.lotId, lotName: place.lotName,
    when: until !== null ? `${transit ? 'Arrives' : 'Back around'} ${formatClock(until)}` : null,
    canGoTo: !transit && !!place.lotId && place.lotId !== state.activeLotId,
  };
}

/** Icon for the away badge on a household member. */
export function awayIconName(kind: PlaceKind): string {
  switch (kind) {
    case 'work': case 'school': return 'briefcase';
    case 'home': return 'home';
    case 'transit': return 'car';
    default: return 'pin';
  }
}
