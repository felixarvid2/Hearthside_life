// Room detection: connected regions of tiles bounded by walls. Openings do not change room shapes:
// a door connects navigation, never rooms, so two rooms joined by a door stay two rooms.

import { edgeKey } from '../core/ids';
import type { Tile } from '../core/nav';
import type { Lot } from '../core/types';
import type { WallSide } from './walls';

export interface Room {
  /** Index in the computeRooms result; stable for an unchanged lot (rooms are ordered by their first tile, row-major). */
  id: number;
  level: number;
  /** Tiles in row-major order (z, then x). */
  tiles: Tile[];
  /** True for the region that is open to the lot border (the yard). */
  outdoor: boolean;
  /** Every wall side that faces a tile of this room, sorted by wall id then side. */
  sides: Array<{ wallId: string; side: WallSide }>;
}

/**
 * Flood-fills the lot level into rooms. Walls on an edge separate the two tiles regardless of openings.
 * A region is outdoor when one of its border tiles has no wall on the lot-boundary edge, so a house whose
 * walls run along the lot boundary still has enclosed rooms.
 */
export function computeRooms(lot: Lot, level: number): Room[] {
  const W = lot.width, D = lot.depth;
  const label = new Int32Array(W * D).fill(-1);
  const has = (dir: 'h' | 'v', x: number, z: number) => lot.walls[edgeKey(level, dir, x, z)] !== undefined;
  const rooms: Room[] = [];
  const stack: number[] = [];

  for (let start = 0; start < W * D; start++) {
    if (label[start] !== -1) continue;
    const id = rooms.length;
    const indices: number[] = [];
    let outdoor = false;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop() as number;
      indices.push(i);
      const x = i % W, z = (i - x) / W;
      // north
      if (!has('h', x, z)) { if (z > 0) visit(i - W); else outdoor = true; }
      // south
      if (!has('h', x, z + 1)) { if (z < D - 1) visit(i + W); else outdoor = true; }
      // west
      if (!has('v', x, z)) { if (x > 0) visit(i - 1); else outdoor = true; }
      // east
      if (!has('v', x + 1, z)) { if (x < W - 1) visit(i + 1); else outdoor = true; }
    }
    indices.sort((p, q) => p - q);
    const tiles = indices.map((i) => ({ x: i % W, z: Math.floor(i / W) }));
    rooms.push({ id, level, tiles, outdoor, sides: roomSides(lot, level, tiles) });

    function visit(j: number): void {
      if (label[j] !== -1) return;
      label[j] = id;
      stack.push(j);
    }
  }
  return rooms;
}

function roomSides(lot: Lot, level: number, tiles: Tile[]): Room['sides'] {
  const out: Room['sides'] = [];
  for (const t of tiles) {
    // side 'b' of the north and west edges faces this tile; side 'a' of the south and east edges does.
    const n = edgeKey(level, 'h', t.x, t.z);
    const s = edgeKey(level, 'h', t.x, t.z + 1);
    const w = edgeKey(level, 'v', t.x, t.z);
    const e = edgeKey(level, 'v', t.x + 1, t.z);
    if (lot.walls[n]) out.push({ wallId: n, side: 'b' });
    if (lot.walls[s]) out.push({ wallId: s, side: 'a' });
    if (lot.walls[w]) out.push({ wallId: w, side: 'b' });
    if (lot.walls[e]) out.push({ wallId: e, side: 'a' });
  }
  out.sort((p, q) => (p.wallId < q.wallId ? -1 : p.wallId > q.wallId ? 1 : p.side < q.side ? -1 : p.side > q.side ? 1 : 0));
  return out;
}

/** The room containing tile (x, z), if any. */
export function roomAt(rooms: readonly Room[], x: number, z: number): Room | undefined {
  for (const r of rooms) for (const t of r.tiles) if (t.x === x && t.z === z) return r;
  return undefined;
}

/** Row-major room index per tile (width * depth entries) for repeated lookups. */
export function roomIndex(rooms: readonly Room[], width: number, depth: number): Int32Array {
  const out = new Int32Array(width * depth).fill(-1);
  for (const r of rooms) for (const t of r.tiles) out[t.z * width + t.x] = r.id;
  return out;
}
