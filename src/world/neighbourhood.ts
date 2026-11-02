// The neighbourhood's lot records (Milestone 7): twelve generated lots plus the two the new world creates first
// (the player's home and the next-door house), their map positions, travel times and the opening hours and
// capacity of the public venues. Pure data and helpers; the NPC households that live in the lots are generated in
// game/neighbourhood.ts and the lot layouts in world/lotBuilders.ts.

import { dollars } from '../core/money';
import type { Rng } from '../core/rng';
import type { Cents, Id, Lot, WorldState } from '../core/types';
import type { VenueType } from './lotBuilders';
import { createLot } from './lots';

export type { VenueType } from './lotBuilders';

export interface VenueInfo {
  type: VenueType;
  /** Short kind label ("Park", "Cafe"). */
  label: string;
  /** Opening hours as minutes of the day. */
  open: number;
  close: number;
  /** Most townies the light schedule puts here at once. */
  capacity: number;
}

const h = (hour: number) => hour * 60;

export const VENUES: Readonly<Record<VenueType, VenueInfo>> = {
  park: { type: 'park', label: 'Park', open: h(6), close: h(22), capacity: 5 },
  cafe: { type: 'cafe', label: 'Cafe', open: h(7), close: h(21), capacity: 4 },
  gym: { type: 'gym', label: 'Gym', open: h(6), close: h(22), capacity: 3 },
  library: { type: 'library', label: 'Library', open: h(9), close: h(20), capacity: 3 },
  arts: { type: 'arts', label: 'Arts centre', open: h(10), close: h(21), capacity: 4 },
  market: { type: 'market', label: 'Market', open: h(8), close: h(20), capacity: 4 },
};

export const VENUE_TYPES: readonly VenueType[] = ['park', 'cafe', 'gym', 'library', 'arts', 'market'];

export function isVenueType(v: unknown): v is VenueType {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(VENUES, v);
}

/** Venue facts for a lot, or undefined for a home (and for unknown venue types). */
export function venueInfo(lot: Pick<Lot, 'kind' | 'venueType'>): VenueInfo | undefined {
  return lot.kind === 'venue' && isVenueType(lot.venueType) ? VENUES[lot.venueType] : undefined;
}

/** True when the venue is open at this minute of the day (homes are always "open"). */
export function lotIsOpen(lot: Pick<Lot, 'kind' | 'venueType'>, minuteOfDay: number): boolean {
  const v = venueInfo(lot);
  return !v || (minuteOfDay >= v.open && minuteOfDay < v.close);
}

/** "7:00 AM - 9:00 PM". */
export function hoursText(v: VenueInfo): string {
  const t = (m: number) => { const hr = Math.floor(m / 60); return `${((hr + 11) % 12) + 1}:00 ${hr < 12 ? 'AM' : 'PM'}`; };
  return `${t(v.open)} - ${t(v.close)}`;
}

/** Plan of one generated lot. Households of the occupied homes are attached in game/neighbourhood.ts (by `home` index). */
export interface LotSpec {
  key: string;
  name: string;
  kind: 'residential' | 'venue';
  venueType?: VenueType;
  size: number;
  landValue: Cents;
  blurb: string;
  map: { x: number; y: number };
  variant: number;
  /** Residential only: which generated household lives here (index), or a listing for an empty home. */
  home?: number;
  listing?: { mode: 'rent'; rent: Cents } | { mode: 'sale'; price: Cents };
  /** Occupied home: rented from the town (true) or owned by the household. */
  rented?: boolean;
}

/** The twelve generated lots, in creation order (ids are allocated in this order, so they are stable for a seed). */
export const LOT_SPECS: readonly LotSpec[] = [
  { key: 'park', name: 'Lakeside Park', kind: 'venue', venueType: 'park', size: 32, landValue: dollars(30000), variant: 0,
    blurb: 'Lawns and a pond at the end of the street: stroll, sit on a bench, meet people.', map: { x: 50, y: 14 } },
  { key: 'cafe', name: 'Kettle & Crumb', kind: 'venue', venueType: 'cafe', size: 24, landValue: dollars(26000), variant: 0,
    blurb: 'A small cafe with a counter, a few tables and the smell of fresh bread.', map: { x: 28, y: 32 } },
  { key: 'gym', name: 'Foundry Fitness', kind: 'venue', venueType: 'gym', size: 24, landValue: dollars(28000), variant: 0,
    blurb: 'Treadmills and weights in an old foundry hall.', map: { x: 72, y: 32 } },
  { key: 'library', name: 'Pagebridge Library', kind: 'venue', venueType: 'library', size: 24, landValue: dollars(27000), variant: 0,
    blurb: 'Quiet reading rooms, shelves from floor to ceiling and a few computers.', map: { x: 12, y: 52 } },
  { key: 'arts', name: 'Lantern Hall', kind: 'venue', venueType: 'arts', size: 32, landValue: dollars(29000), variant: 0,
    blurb: 'The community arts and music centre: easels, a piano and small events.', map: { x: 88, y: 52 } },
  { key: 'market', name: 'Greengage Market', kind: 'venue', venueType: 'market', size: 32, landValue: dollars(26000), variant: 0,
    blurb: 'A small market with fresh produce and a few stalls.', map: { x: 50, y: 40 } },
  { key: 'res1', name: 'Bluebell Cottage', kind: 'residential', size: 24, landValue: dollars(15500), variant: 0, home: 0, rented: true,
    blurb: 'A rented cottage with a flower box under every window.', map: { x: 22, y: 72 } },
  { key: 'res2', name: 'Sorrel Lodge', kind: 'residential', size: 24, landValue: dollars(17500), variant: 1, home: 1,
    blurb: 'A lived-in lodge with a reading chair by the window.', map: { x: 78, y: 72 } },
  { key: 'res3', name: 'Kestrel House', kind: 'residential', size: 24, landValue: dollars(16500), variant: 2, home: 2, rented: true,
    blurb: 'Two housemates, one kitchen and a rota on the fridge.', map: { x: 34, y: 58 } },
  { key: 'res4', name: 'Heron Row 4', kind: 'residential', size: 24, landValue: dollars(18000), variant: 3, home: 3,
    blurb: 'A tidy terrace house at the quiet end of the street.', map: { x: 66, y: 58 } },
  { key: 'vac1', name: 'Marigold Flat', kind: 'residential', size: 24, landValue: dollars(13500), variant: 4,
    listing: { mode: 'rent', rent: dollars(125) }, blurb: 'An empty flat to rent, ready to move in.', map: { x: 8, y: 74 } },
  { key: 'vac2', name: 'Hazelbank House', kind: 'residential', size: 24, landValue: dollars(16000), variant: 5,
    listing: { mode: 'sale', price: dollars(21000) }, blurb: 'An empty family house for sale.', map: { x: 92, y: 74 } },
];

/** Map positions of the two lots the new world creates first. */
export const HOME_MAP = { x: 40, y: 84 } as const;
export const NEIGHBOUR_MAP = { x: 60, y: 84 } as const;

/** Original street names used for the venues' address line (the residential street is chosen by the new world). */
const VENUE_STREETS: readonly string[] = ['Market Square', 'Quayside Walk', 'Old Mill Road', 'Cinder Lane'];

export interface NeighbourhoodLots {
  /** Lot ids by LotSpec key, in creation order. */
  byKey: Record<string, Id>;
  order: Id[];
}

/**
 * Creates the twelve generated lot records (empty, `built: false`) with names, addresses, map positions and listings.
 * `names` picks street numbers; the lots are created in LOT_SPECS order.
 */
export function createNeighbourhoodLots(state: WorldState, names: Rng, street: string): NeighbourhoodLots {
  const venueStreet = names.pick(VENUE_STREETS);
  const byKey: Record<string, Id> = {};
  const order: Id[] = [];
  let houseNumber = names.int(2, 6) * 2;
  let venueNumber = names.int(1, 9);
  for (const spec of LOT_SPECS) {
    const venue = spec.kind === 'venue';
    const address = venue ? `${venueNumber++} ${venueStreet}` : `${(houseNumber += 4)} ${street}`;
    const lot = createLot(state, {
      name: spec.name, address, width: spec.size, depth: spec.size, kind: spec.kind, landValue: spec.landValue,
      entry: { x: Math.floor(spec.size / 2), z: spec.size - 1, level: 0 }, ...(spec.venueType ? { venueType: spec.venueType } : {}),
    });
    lot.built = false;
    lot.variant = spec.variant;
    lot.blurb = spec.blurb;
    lot.map = { ...spec.map };
    if (venue) lot.ground = 'paving';
    if (spec.listing?.mode === 'rent') lot.rent = spec.listing.rent;
    if (spec.listing?.mode === 'sale') lot.price = spec.listing.price;
    byKey[spec.key] = lot.id;
    order.push(lot.id);
  }
  return { byKey, order };
}

/** Travel time in game minutes between two lots: 20 to 40 minutes by map distance, in steps of five. */
export function travelMinutes(from: Pick<Lot, 'map'>, to: Pick<Lot, 'map'>): number {
  const a = from.map ?? { x: 50, y: 50 }, b = to.map ?? { x: 50, y: 50 };
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  return Math.max(20, Math.min(40, 20 + Math.round(((d / 100) * 25) / 5) * 5));
}
