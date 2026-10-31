// Walls live on grid edges (see docs/ARCHITECTURE.md "Units and coordinates"):
// - 'h' edge (x, z) runs from (x, z) to (x+1, z). Side 'a' faces tile (x, z-1) (north), side 'b' faces (x, z) (south).
// - 'v' edge (x, z) runs from (x, z) to (x, z+1). Side 'a' faces tile (x-1, z) (west), side 'b' faces (x, z) (east).
// A wall's id is its edge key. Openings (doors, windows) sit in a wall and reference it by that key.

import type { ContentDB, OpeningDef } from '../content/types';
import { edgeKey, newId } from '../core/ids';
import type { Tile } from '../core/nav';
import type { EdgeDir, FinishRef, Lot, Opening, Wall, WorldState } from '../core/types';

/** Wall height in metres for M1 walls. */
export const DEFAULT_WALL_HEIGHT = 2.8;

export type WallSide = 'a' | 'b';
/** Compass side of a tile: north (-z), east (+x), south (+z), west (-x). */
export type TileSide = 'n' | 'e' | 's' | 'w';

/** A grid edge without its wall record. */
export interface Edge { level: number; dir: EdgeDir; x: number; z: number; key: string }

/** Neighbour offsets per compass side. */
export const SIDE_OFFSETS: Readonly<Record<TileSide, { dx: number; dz: number }>> = {
  n: { dx: 0, dz: -1 },
  e: { dx: 1, dz: 0 },
  s: { dx: 0, dz: 1 },
  w: { dx: -1, dz: 0 },
};

/** The grid edge on one compass side of a tile. */
export function edgeOnSide(level: number, tile: Tile, side: TileSide): Edge {
  switch (side) {
    case 'n': return mkEdge(level, 'h', tile.x, tile.z);
    case 's': return mkEdge(level, 'h', tile.x, tile.z + 1);
    case 'w': return mkEdge(level, 'v', tile.x, tile.z);
    case 'e': return mkEdge(level, 'v', tile.x + 1, tile.z);
  }
}

function mkEdge(level: number, dir: EdgeDir, x: number, z: number): Edge {
  return { level, dir, x, z, key: edgeKey(level, dir, x, z) };
}

/** Edge between two orthogonally adjacent tiles, or null when they are not adjacent. */
export function edgeBetween(level: number, a: Tile, b: Tile): Edge | null {
  const dx = b.x - a.x, dz = b.z - a.z;
  if (dx === 0 && Math.abs(dz) === 1) return mkEdge(level, 'h', a.x, Math.max(a.z, b.z));
  if (dz === 0 && Math.abs(dx) === 1) return mkEdge(level, 'v', Math.max(a.x, b.x), a.z);
  return null;
}

/** The wall between two orthogonally adjacent tiles, if any. */
export function wallBetween(lot: Lot, level: number, a: Tile, b: Tile): Wall | undefined {
  const e = edgeBetween(level, a, b);
  return e ? lot.walls[e.key] : undefined;
}

/** True when the edge lies on the lot (including its boundary). */
export function edgeInLot(lot: Pick<Lot, 'width' | 'depth'>, dir: EdgeDir, x: number, z: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(z)) return false;
  return dir === 'h'
    ? x >= 0 && x < lot.width && z >= 0 && z <= lot.depth
    : x >= 0 && x <= lot.width && z >= 0 && z < lot.depth;
}

/** Which side of the wall faces the tile, or null when the tile does not touch the wall. */
export function wallSideFacing(wall: Pick<Wall, 'dir' | 'x' | 'z'>, tile: Tile): WallSide | null {
  if (wall.dir === 'h') {
    if (tile.x !== wall.x) return null;
    if (tile.z === wall.z - 1) return 'a';
    if (tile.z === wall.z) return 'b';
    return null;
  }
  if (tile.z !== wall.z) return null;
  if (tile.x === wall.x - 1) return 'a';
  if (tile.x === wall.x) return 'b';
  return null;
}

/** The tile a wall side faces (may be outside the lot for boundary walls). */
export function tileOnSide(wall: Pick<Wall, 'dir' | 'x' | 'z'>, side: WallSide): Tile {
  if (wall.dir === 'h') return side === 'a' ? { x: wall.x, z: wall.z - 1 } : { x: wall.x, z: wall.z };
  return side === 'a' ? { x: wall.x - 1, z: wall.z } : { x: wall.x, z: wall.z };
}

/** Both tiles touching an edge: [side a tile, side b tile]. */
export function edgeTiles(edge: Pick<Wall, 'dir' | 'x' | 'z'>): [Tile, Tile] {
  return [tileOnSide(edge, 'a'), tileOnSide(edge, 'b')];
}

/** Finish of one side of a wall. */
export function wallSideFinish(wall: Wall, side: WallSide): FinishRef {
  return side === 'a' ? wall.sideA : wall.sideB;
}

/** Sets the finish of one side (copies the ref so callers can reuse theirs). */
export function setWallSideFinish(wall: Wall, side: WallSide, finish: FinishRef): void {
  const ref = { designId: finish.designId, paletteId: finish.paletteId };
  if (side === 'a') wall.sideA = ref; else wall.sideB = ref;
}

/** Creates or replaces the wall on an edge. Throws when the edge is off the lot. */
export function setWall(
  lot: Lot, level: number, dir: EdgeDir, x: number, z: number,
  finish: { a: FinishRef; b: FinishRef }, height = DEFAULT_WALL_HEIGHT,
): Wall {
  if (!edgeInLot(lot, dir, x, z)) throw new Error(`setWall: edge ${dir} (${x}, ${z}) is outside lot ${lot.id}`);
  if (!Number.isInteger(level) || level < 0 || level >= lot.levels) throw new Error(`setWall: lot ${lot.id} has no level ${level}`);
  const id = edgeKey(level, dir, x, z);
  const wall: Wall = {
    id, level, dir, x, z, height,
    sideA: { designId: finish.a.designId, paletteId: finish.a.paletteId },
    sideB: { designId: finish.b.designId, paletteId: finish.b.paletteId },
  };
  lot.walls[id] = wall;
  return wall;
}

/** Removes a wall and any opening in it. Returns the removed wall, if there was one. */
export function removeWall(lot: Lot, wallId: string): Wall | undefined {
  const wall = lot.walls[wallId];
  if (!wall) return undefined;
  for (const o of Object.values(lot.openings)) if (o.wallId === wallId) delete lot.openings[o.id];
  delete lot.walls[wallId];
  return wall;
}

/**
 * Builds a straight wall run between two grid vertices (same x or same z), both sides with `finish`.
 * Returns the walls in order from `from` to `to`.
 */
export function addWallRun(
  lot: Lot, level: number, from: Tile, to: Tile, finish: { a: FinishRef; b: FinishRef }, height = DEFAULT_WALL_HEIGHT,
): Wall[] {
  const out: Wall[] = [];
  if (from.z === to.z) {
    const step = to.x >= from.x ? 1 : -1;
    for (let x = from.x; x !== to.x; x += step) out.push(setWall(lot, level, 'h', Math.min(x, x + step), from.z, finish, height));
  } else if (from.x === to.x) {
    const step = to.z >= from.z ? 1 : -1;
    for (let z = from.z; z !== to.z; z += step) out.push(setWall(lot, level, 'v', from.x, Math.min(z, z + step), finish, height));
  } else {
    throw new Error('addWallRun: runs must be straight (same x or same z)');
  }
  return out;
}

/** Outlines the tile rectangle [x0, x1) x [z0, z1) with walls (both sides `finish`). */
export function addRectWalls(
  lot: Lot, level: number, x0: number, z0: number, x1: number, z1: number, finish: { a: FinishRef; b: FinishRef },
): Wall[] {
  return [
    ...addWallRun(lot, level, { x: x0, z: z0 }, { x: x1, z: z0 }, finish),
    ...addWallRun(lot, level, { x: x0, z: z1 }, { x: x1, z: z1 }, finish),
    ...addWallRun(lot, level, { x: x0, z: z0 }, { x: x0, z: z1 }, finish),
    ...addWallRun(lot, level, { x: x1, z: z0 }, { x: x1, z: z1 }, finish),
  ];
}

/** The opening in a wall, if any (M1 openings are one tile wide). */
export function openingOnWall(lot: Lot, wallId: string): Opening | undefined {
  for (const o of Object.values(lot.openings)) if (o.wallId === wallId) return o;
  return undefined;
}

/** Map of wall id -> opening for fast lookups (navigation grids, placement). */
export function openingsByWall(lot: Lot): Record<string, Opening> {
  const out: Record<string, Opening> = {};
  for (const o of Object.values(lot.openings)) out[o.wallId] = o;
  return out;
}

/** The opening definition for an opening (undefined when content does not know it). */
export function openingDef(content: ContentDB, opening: Opening): OpeningDef | undefined {
  return content.openings[opening.defId];
}

/** True when the wall holds a door, so people can walk through this edge. */
export function isDoorway(lot: Lot, content: ContentDB, wallId: string): boolean {
  const o = openingOnWall(lot, wallId);
  return !!o && content.openings[o.defId]?.kind === 'door';
}

/** True when the wall holds a window. Windows never let people through. */
export function isWindowWall(lot: Lot, content: ContentDB, wallId: string): boolean {
  const o = openingOnWall(lot, wallId);
  return !!o && content.openings[o.defId]?.kind === 'window';
}

/**
 * Door swing convention: `flip: false` swings the leaf into the tile on side 'b' of the wall, `flip: true`
 * into the tile on side 'a'. Returns the side the leaf swings toward.
 */
export function doorSwingSide(opening: Pick<Opening, 'flip'>): WallSide {
  return opening.flip ? 'a' : 'b';
}

/**
 * Adds an opening to an existing wall (no money, no validation beyond the wall existing and being free).
 * Used by lot generation; player edits go through building commands.
 */
export function addOpening(state: WorldState, lot: Lot, def: OpeningDef, wallId: string, flip = false): Opening {
  if (!lot.walls[wallId]) throw new Error(`addOpening: no wall at ${wallId}`);
  if (openingOnWall(lot, wallId)) throw new Error(`addOpening: wall ${wallId} already has an opening`);
  const opening: Opening = { id: newId(state, 'opn'), defId: def.id, wallId, flip, purchasePrice: def.price };
  lot.openings[opening.id] = opening;
  return opening;
}
