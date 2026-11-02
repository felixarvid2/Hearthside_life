// New-world composition (pure: no three.js, no DOM, no storage). Builds the Milestone 1 neighbourhood for a
// fresh game: a furnished 24 x 24 starter home for the playable household, the neighbours' smaller house next
// door, the people created from creator drafts, household ties, starting funds and the first neighbour visit, and
// the rest of the neighbourhood (twelve more lots, venues and named NPC households, game/neighbourhood.ts).
// The same seed and drafts always give the same world (JSON-identical).

import type { ContentDB } from '../content/types';
import { atDayMinute } from '../core/clock';
import type { HouseholdDraft } from '../core/drafts';
import { facingTo } from '../core/geometry';
import type { Tile } from '../core/nav';
import { Rng, seedRng } from '../core/rng';
import { addFeed, addHousehold, createEmptyWorld, markProcessed, transact } from '../core/state';
import { dollars } from '../core/money';
import type { Cents, Id, Lot, PersonLocation, StartMode, WorldState } from '../core/types';
import { applyHouseholdTies, createPerson } from '../sim/people';
import { generateNeighbourhood } from './neighbourhood';
import { FIRST_VISIT_MINUTE } from '../sim/tuning';
import { neighbours, scheduleVisit } from '../sim/visitors';
import { createLot, inLot } from '../world/lots';
import { LotNav } from '../world/nav';
import { doorTiles } from '../world/placement';
import { computeRooms, roomIndex } from '../world/rooms';
import { furnishNeighborHouse, furnishStarterHouse } from '../world/starter';
import { edgeTiles } from '../world/walls';

export interface NewWorldOptions {
  seed: number;
  mode: StartMode;
  /** The playable household (creator output or a premade household). */
  household: HouseholdDraft;
  /** The neighbours next door (not playable); they live off-lot at home and visit. */
  neighbor: HouseholdDraft;
}

/** Starting household funds per start mode. The sandbox also sets settings.unlimitedFunds (building is free). */
export const STARTING_FUNDS: Readonly<Record<StartMode, Cents>> = {
  guided: dollars(9000),
  create: dollars(12000),
  sandbox: dollars(50000),
};

/** Funds of the (non-playable) neighbour household. */
export const NEIGHBOR_FUNDS: Cents = dollars(6000);
export const LOT_SIZE = 24;
export const HOME_LAND_VALUE: Cents = dollars(18000);
export const NEIGHBOR_LAND_VALUE: Cents = dollars(15000);
/** Arrival/departure tiles on the south edge (the street). */
export const HOME_ENTRY = { x: 12, z: 23, level: 0 } as const;
export const NEIGHBOR_ENTRY = { x: 14, z: 23, level: 0 } as const;

/** Original street and house names; one street is chosen per seed. */
const STREETS: readonly string[] = [
  'Bramblewick Lane', 'Lanternfield Road', 'Copperbeech Row', 'Willowmere Close', 'Tidewell Street', 'Hollyhock Way',
  'Larkspur Crescent', 'Millbrook Terrace',
];
const HOME_NAMES: readonly string[] = ['Hearthstone Cottage', 'Plum Tree House', 'Wren Cottage', 'Blue Door House'];
const NEIGHBOR_NAMES: readonly string[] = ['Juniper House', 'The Old Bakery', 'Fernside', 'Rowan Lodge'];

/**
 * Creates a complete new world. Throws when the content cannot build the houses (missing designs or objects)
 * or when the household draft has no members.
 */
export function createNewWorld(content: ContentDB, opts: NewWorldOptions): WorldState {
  const { seed, mode, household, neighbor } = opts;
  if (household.members.length === 0) throw new Error('createNewWorld: the household has no members.');
  const state = createEmptyWorld(seed, mode);
  // Names come from a separate generator so the world rng is only advanced by the simulation (and createPerson).
  const names = new Rng(seedRng((seed ^ 0x51ee7) >>> 0));
  const street = names.pick(STREETS);
  const homeNumber = names.int(3, 40) * 2;
  const homeAddress = `${homeNumber} ${street}`;
  const neighborAddress = `${homeNumber + 2} ${street}`;

  // Home lot and household (owner set before furnishing so the furniture belongs to the household).
  const home = createLot(state, {
    name: names.pick(HOME_NAMES), address: homeAddress, width: LOT_SIZE, depth: LOT_SIZE, kind: 'residential',
    landValue: HOME_LAND_VALUE, entry: { ...HOME_ENTRY },
  });
  const hh = addHousehold(state, household.name.trim() || household.members[0]!.lastName || 'Household', 0, home.id, true);
  home.ownerHouseholdId = hh.id;
  furnishStarterHouse(state, content, home.id);

  // Neighbour lot and household.
  const next = createLot(state, {
    name: names.pick(NEIGHBOR_NAMES), address: neighborAddress, width: LOT_SIZE, depth: LOT_SIZE, kind: 'residential',
    landValue: NEIGHBOR_LAND_VALUE, entry: { ...NEIGHBOR_ENTRY },
  });
  const nh = addHousehold(state, neighbor.name.trim() || neighbor.members[0]?.lastName || 'Neighbours', 0, next.id, false);
  transact(state, null, nh.id, NEIGHBOR_FUNDS, 'start', 'Starting funds', { occurrence: `start:${nh.id}` });
  next.ownerHouseholdId = nh.id;
  furnishNeighborHouse(state, content, next.id);

  state.activeHouseholdId = hh.id;
  state.activeLotId = home.id;

  // Money: starting funds as a ledger entry (sandbox shows $50,000 and builds for free).
  transact(state, null, hh.id, STARTING_FUNDS[mode], 'start', mode === 'sandbox' ? 'Sandbox starting funds' : 'Starting funds', { occurrence: `start:${hh.id}` });

  // The playable household stands just inside the front door.
  const spots = arrivalSpots(state, content, home, household.members.length);
  const memberIds: Id[] = household.members.map((draft, i) => {
    const s = spots[i] ?? spots[spots.length - 1]!;
    const at: PersonLocation = { kind: 'lot', lotId: home.id, level: 0, x: s.x + 0.5, z: s.z + 0.5, facing: s.facing, posture: 'standing' };
    return createPerson(state, content, draft, hh.id, at).id;
  });
  applyHouseholdTies(state, memberIds, household.ties);

  // Neighbours are at home, off-lot, until they visit.
  const neighborIds: Id[] = neighbor.members.map((draft) => createPerson(state, content, draft, nh.id, {
    kind: 'offlot', place: 'home', lotId: next.id, since: state.clock.minutes, until: null,
  }).id);
  applyHouseholdTies(state, neighborIds, neighbor.ties);

  // The rest of the neighbourhood: twelve more lot records and the named households that live in them (Milestone 7).
  generateNeighbourhood(state, content);

  // First neighbour visit on day 0 at 17:00, exactly as the simulation's ensureFirstVisit would schedule it.
  const first = neighbours(state)[0];
  if (first && state.settings.visitors) {
    scheduleVisit(state, first.id, atDayMinute(0, FIRST_VISIT_MINUTE), `visit:${first.id}:0`, { first: true });
    markProcessed(state, 'visitday:0');
  }

  const people = memberIds.map((id) => state.people[id]!.firstName);
  const who = people.length === 1 ? people[0]! : `${people.slice(0, -1).join(', ')} and ${people.at(-1)!}`;
  const intro = mode === 'sandbox'
    ? `Welcome to ${street}! Build freely: construction is free in the sandbox.`
    : `Welcome to ${street}! ${who} just moved into ${homeAddress}.`;
  addFeed(state, null, 'info', intro, memberIds.length === 1 ? memberIds[0] : undefined);
  if (first) addFeed(state, null, 'social', `The ${state.households[nh.id]!.name} family next door might drop by this evening.`);
  return state;
}

export interface Spot { x: number; z: number; facing: number }

/**
 * Walkable tiles just inside the front door (the door between the yard and a room, nearest to the lot entry),
 * in breadth-first order from the door, never on a door tile. Falls back to the lot entry.
 */
export function arrivalSpots(state: WorldState, content: ContentDB, lot: Lot, count: number): Spot[] {
  const nav = new LotNav(() => state, content);
  const rooms = computeRooms(lot, 0);
  const index = roomIndex(rooms, lot.width, lot.depth);
  const roomOf = (t: Tile) => (inLot(lot, t.x, t.z) ? rooms[index[t.z * lot.width + t.x] ?? -1] : undefined);
  let best: { inside: Tile; outside: Tile; d: number } | null = null;
  for (const op of Object.values(lot.openings)) {
    const wall = lot.walls[op.wallId];
    if (!wall || wall.level !== 0 || content.openings[op.defId]?.kind !== 'door') continue;
    const [ta, tb] = edgeTiles(wall);
    const ra = roomOf(ta), rb = roomOf(tb);
    if (!ra || !rb || ra.outdoor === rb.outdoor) continue;
    const inside = ra.outdoor ? tb : ta, outside = ra.outdoor ? ta : tb;
    const d = Math.abs(outside.x - lot.entry.x) + Math.abs(outside.z - lot.entry.z);
    if (!best || d < best.d) best = { inside, outside, d };
  }
  const fallback: Spot[] = [{ x: lot.entry.x, z: lot.entry.z, facing: facingTo(lot.entry.x, lot.entry.z, lot.width / 2, lot.depth / 2) }];
  if (!best) return fallback;
  const facing = facingTo(best.outside.x, best.outside.z, best.inside.x, best.inside.z);
  const doors = new Set(doorTiles(lot, content, 0).map((t) => `${t.x},${t.z}`));
  const room = roomOf(best.inside);
  const out: Spot[] = [];
  const seen = new Set<string>([`${best.inside.x},${best.inside.z}`]);
  const queue: Tile[] = [best.inside];
  for (let qi = 0; qi < queue.length && out.length < Math.max(1, count); qi++) {
    const t = queue[qi]!;
    if (!doors.has(`${t.x},${t.z}`) && nav.isWalkable(lot.id, 0, t.x, t.z)) out.push({ x: t.x, z: t.z, facing });
    for (const [dx, dz] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
      const n = { x: t.x + dx, z: t.z + dz };
      const key = `${n.x},${n.z}`;
      if (seen.has(key) || roomOf(n) !== room || !nav.canStep(lot.id, 0, t, n)) continue;
      seen.add(key);
      queue.push(n);
    }
  }
  return out.length > 0 ? out : fallback;
}
