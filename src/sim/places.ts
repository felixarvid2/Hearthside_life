// Where people are (Milestone 7): readable locations for the interface, and the two moves that every lot change is
// built from: placing a person on the active lot and taking them off it. Detailed simulation only ever runs for people
// on the active lot; everyone else has an off-lot location (home, work, visiting a lot, in transit) that the light
// schedule (sim/townlife.ts) keeps up to date from timestamps, with no pathfinding.

import { computeRooms, roomIndex } from '../world/rooms';
import { facingTo } from '../core/geometry';
import type { Tile } from '../core/nav';
import type { GameMinutes, Id, Lot, Person, PersonLocation, WorldState } from '../core/types';
import { abortQueue } from './actions';
import type { SimCtx } from './context';
import { hashString, lotLoc, setAnim } from './context';

export type PlaceKind = 'lot' | 'home' | 'work' | 'school' | 'venue' | 'visiting' | 'transit' | 'away';

/** A person's location in words ("At Lakeside Park", "At home", "At work", "On the way to Lantern Hall"). */
export interface PersonPlace {
  kind: PlaceKind;
  /** The lot they are at, visiting or travelling to; null for work, school and errands. */
  lotId: Id | null;
  lotName: string | null;
  /** Badge text for the household strip. */
  text: string;
  /** Arrival minute while in transit, else null. */
  arrivesAt: GameMinutes | null;
}

/** Where a person is, for badges and the neighbourhood map. Never changes the state. */
export function placeOf(state: WorldState, p: Person): PersonPlace {
  const loc = p.location;
  const lotName = (id: Id | undefined) => (id ? state.lots[id]?.name ?? null : null);
  const homeLotId = state.households[p.householdId]?.homeLotId ?? null;
  if (loc.kind === 'lot') {
    const lot = state.lots[loc.lotId];
    const home = loc.lotId === homeLotId;
    return { kind: home ? 'home' : lot?.kind === 'venue' ? 'venue' : 'visiting', lotId: loc.lotId, lotName: lot?.name ?? null, text: home ? 'At home' : `At ${lot?.name ?? 'another lot'}`, arrivesAt: null };
  }
  const name = lotName(loc.lotId);
  if (loc.transit) {
    return { kind: 'transit', lotId: loc.lotId ?? null, lotName: name, text: name ? `On the way to ${name}` : 'On the way', arrivesAt: loc.until };
  }
  switch (loc.place) {
    case 'home': return { kind: 'home', lotId: loc.lotId ?? homeLotId, lotName: name ?? lotName(homeLotId ?? undefined), text: 'At home', arrivesAt: null };
    case 'work': return { kind: 'work', lotId: null, lotName: null, text: 'At work', arrivesAt: null };
    case 'school': return { kind: 'school', lotId: null, lotName: null, text: 'At school', arrivesAt: null };
    case 'visiting': {
      const lot = loc.lotId ? state.lots[loc.lotId] : undefined;
      return { kind: lot?.kind === 'venue' ? 'venue' : 'visiting', lotId: loc.lotId ?? null, lotName: name, text: name ? `At ${name}` : 'Visiting', arrivesAt: null };
    }
    default: return { kind: 'away', lotId: null, lotName: null, text: 'Out and about', arrivesAt: null };
  }
}

/** True when the person belongs to the household the player runs. */
export function isControlled(state: WorldState, p: Person): boolean {
  return p.householdId === state.activeHouseholdId;
}

/** Id of the lot a person currently is at (on it, at home there, visiting it, heading there), or null. */
export function lotOfPerson(p: Person): Id | null {
  const loc = p.location;
  return loc.kind === 'lot' ? loc.lotId : loc.lotId ?? null;
}

export interface Spot { x: number; z: number; facing: number }

const centreFacing = (lot: Lot, x: number, z: number) => facingTo(x, z, lot.width / 2, lot.depth / 2);

/**
 * Walkable tiles at the lot entry for arrivals: the entry tile first, then its walkable neighbours breadth-first.
 * Falls back to the entry tile itself.
 */
export function entrySpots(ctx: Pick<SimCtx, 'nav'>, lot: Lot, count: number): Spot[] {
  const start: Tile = { x: lot.entry.x, z: lot.entry.z };
  const out: Spot[] = [];
  const seen = new Set<string>([`${start.x},${start.z}`]);
  const queue: Tile[] = [start];
  for (let qi = 0; qi < queue.length && out.length < Math.max(1, count); qi++) {
    const t = queue[qi]!;
    if (ctx.nav.isWalkable(lot.id, lot.entry.level, t.x, t.z)) out.push({ x: t.x + 0.5, z: t.z + 0.5, facing: centreFacing(lot, t.x + 0.5, t.z + 0.5) });
    for (const [dx, dz] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
      const n = { x: t.x + dx, z: t.z + dz };
      const key = `${n.x},${n.z}`;
      if (seen.has(key) || n.x < 0 || n.z < 0 || n.x >= lot.width || n.z >= lot.depth) continue;
      seen.add(key);
      queue.push(n);
    }
    if (qi > 400) break;
  }
  return out.length > 0 ? out : [{ x: start.x + 0.5, z: start.z + 0.5, facing: centreFacing(lot, start.x + 0.5, start.z + 0.5) }];
}

/**
 * Deterministic walkable spots spread over the lot for people who were already there when it became active. Homes
 * prefer tiles inside the house; venues avoid the strip just inside the entry. `salt` (a person id) varies the order.
 */
export function scatterSpots(ctx: Pick<SimCtx, 'nav' | 'state'>, lot: Lot, salts: string[]): Spot[] {
  const indoor = lot.kind === 'residential';
  const tiles: Tile[] = [];
  let useRoom: ((t: Tile) => boolean) | null = null;
  if (indoor && Object.keys(lot.walls).length > 0) {
    const rooms = computeRooms(lot, 0);
    const index = roomIndex(rooms, lot.width, lot.depth);
    useRoom = (t) => { const r = rooms[index[t.z * lot.width + t.x] ?? -1]; return !!r && !r.outdoor; };
  }
  for (let z = 0; z < lot.depth; z++) {
    for (let x = 0; x < lot.width; x++) {
      if (!ctx.nav.isWalkable(lot.id, 0, x, z)) continue;
      if (useRoom && !useRoom({ x, z })) continue;
      if (!indoor && z >= lot.depth - 3) continue;
      tiles.push({ x, z });
    }
  }
  const pool = tiles.length > 0 ? tiles : entrySpots(ctx, lot, 1).map((s) => ({ x: Math.floor(s.x), z: Math.floor(s.z) }));
  const used = new Set<string>();
  return salts.map((salt) => {
    const ranked = [...pool].sort((a, b) => hashString(`${salt}:${a.x},${a.z}`) - hashString(`${salt}:${b.x},${b.z}`));
    const pick = ranked.find((t) => !used.has(`${t.x},${t.z}`)) ?? ranked[0]!;
    used.add(`${pick.x},${pick.z}`);
    return { x: pick.x + 0.5, z: pick.z + 0.5, facing: centreFacing(lot, pick.x + 0.5, pick.z + 0.5) };
  });
}

/** Puts a person on a lot, standing, with an empty queue. */
export function placeOnLot(ctx: Pick<SimCtx, 'events' | 'now'>, p: Person, lot: Lot, spot: Spot): void {
  p.queue = [];
  p.thought = null;
  p.location = { kind: 'lot', lotId: lot.id, level: lot.entry.level, x: spot.x, z: spot.z, facing: spot.facing, posture: 'standing' };
  setAnim(p, 'idle', ctx.now);
  ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'location' });
}

/** Takes a person off the lot they are on: their queue ends and they get the given off-lot location. */
export function takeOffLot(ctx: SimCtx, p: Person, to: PersonLocation): void {
  if (lotLoc(p)) abortQueue(ctx, p, null);
  p.queue = [];
  p.thought = null;
  p.location = to;
  setAnim(p, 'idle', ctx.now);
  ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'location' });
}

/** Off-lot "at home" location for a person. */
export function homeLocation(state: WorldState, p: Person, since: GameMinutes): PersonLocation {
  const lotId = state.households[p.householdId]?.homeLotId ?? undefined;
  return { kind: 'offlot', place: 'home', ...(lotId ? { lotId } : {}), since, until: null };
}

/** Off-lot "at this lot" location (a venue or another home). */
export function visitingLocation(lotId: Id, since: GameMinutes): PersonLocation {
  return { kind: 'offlot', place: 'visiting', lotId, since, until: null };
}
