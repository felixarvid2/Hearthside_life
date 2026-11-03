// Milestone 9 terrain paint (Lot.terrain): ground paint per level-0 tile, keyed by tileKey(0, x, z). A missing entry shows the
// lot's `ground` (grass, dirt or paving). Paint only goes on open ground: not under a floor and not inside an enclosed room.
// Painting a tile with the paint that equals the lot ground removes the entry, so a lot never stores redundant paint.

import { EXTERIOR } from '../content/exterior';
import { tileKey } from '../core/ids';
import type { Lot } from '../core/types';
import { inLot } from './lots';
import { computeRooms } from './rooms';

/** The paint id a tile shows: its stored paint, else the lot ground. */
export function terrainAt(lot: Pick<Lot, 'terrain' | 'ground'>, x: number, z: number): string {
  return lot.terrain?.[tileKey(0, x, z)] ?? lot.ground;
}

/** Whether a paint id exists in the content. */
export function isTerrainPaint(id: string): boolean { return !!EXTERIOR.terrain[id]; }

/** Stored paint value for a paint on this lot: undefined when it is the lot's own ground (no entry needed). */
export function storedPaint(lot: Pick<Lot, 'ground'>, paintId: string): string | undefined {
  return paintId === lot.ground ? undefined : paintId;
}

/** Why a tile cannot be painted, or null. Indoor tiles are found through the level-0 rooms. */
export function paintBlockReason(lot: Lot, x: number, z: number, indoor?: ReadonlySet<string>): string | null {
  if (!Number.isInteger(x) || !Number.isInteger(z) || !inLot(lot, x, z)) return 'Paint has to stay on the lot.';
  if (lot.floors[tileKey(0, x, z)]) return 'Indoor floors keep their own finish.';
  const inside = indoor ?? indoorTiles(lot);
  if (inside.has(`${x},${z}`)) return 'Paint goes on open ground, not inside a room.';
  return null;
}

/** Tiles of the enclosed rooms on level 0, as "x,z". */
export function indoorTiles(lot: Lot): Set<string> {
  const out = new Set<string>();
  for (const room of computeRooms(lot, 0)) if (!room.outdoor) for (const t of room.tiles) out.add(`${t.x},${t.z}`);
  return out;
}

/** Number of painted tiles per paint id (for the build panel and tests). */
export function paintCounts(lot: Pick<Lot, 'terrain'>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.values(lot.terrain ?? {})) out[id] = (out[id] ?? 0) + 1;
  return out;
}
