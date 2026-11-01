// Lot records: creation and small lookup helpers shared by world and building code.

import { newId } from '../core/ids';
import type { Cents, Id, Lot, LotKind, TilePos, WorldState } from '../core/types';

/** Lot sizes the game supports in M1 (square lots, tiles per side). */
export const LOT_SIZES: readonly number[] = [24, 32, 48];

export interface CreateLotOptions {
  name: string;
  address: string;
  width: number;
  depth: number;
  kind: LotKind;
  landValue: Cents;
  /** Arrival/departure tile; must be on the lot. */
  entry: TilePos;
  venueType?: string;
}

/** Creates an empty lot (no walls, floors, openings or objects), adds it to `state.lots` and returns it. */
export function createLot(state: WorldState, opts: CreateLotOptions): Lot {
  const { width, depth, entry } = opts;
  if (!Number.isInteger(width) || !Number.isInteger(depth) || width < 4 || depth < 4 || width > 64 || depth > 64) {
    throw new Error(`createLot: unsupported lot size ${width}x${depth}`);
  }
  if (!Number.isInteger(opts.landValue) || opts.landValue < 0) throw new Error(`createLot: bad land value ${opts.landValue}`);
  if (!Number.isInteger(entry.x) || !Number.isInteger(entry.z) || entry.x < 0 || entry.z < 0 || entry.x >= width || entry.z >= depth) {
    throw new Error(`createLot: entry (${entry.x}, ${entry.z}) is outside the ${width}x${depth} lot`);
  }
  if (entry.level !== 0) throw new Error('createLot: the entry must be on the ground floor (level 0)');
  const lot: Lot = {
    id: newId(state, 'lot'),
    name: opts.name,
    address: opts.address,
    kind: opts.kind,
    ...(opts.venueType !== undefined ? { venueType: opts.venueType } : {}),
    width,
    depth,
    landValue: opts.landValue,
    ownerHouseholdId: null,
    entry: { x: entry.x, z: entry.z, level: entry.level },
    levels: 1,
    walls: {},
    floors: {},
    openings: {},
    objects: {},
    ground: 'grass',
  };
  state.lots[lot.id] = lot;
  return lot;
}

/** The lot with this id or throws (for code paths where a missing lot is a programming error). */
export function requireLot(state: WorldState, lotId: Id): Lot {
  const lot = state.lots[lotId];
  if (!lot) throw new Error(`Unknown lot ${lotId}`);
  return lot;
}

/** True when tile (x, z) lies on the lot. */
export function inLot(lot: Pick<Lot, 'width' | 'depth'>, x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < lot.width && z < lot.depth;
}

/** True when the level exists on the lot (0 = ground floor). */
export function hasLevel(lot: Pick<Lot, 'levels'>, level: number): boolean {
  return Number.isInteger(level) && level >= 0 && level < lot.levels;
}
