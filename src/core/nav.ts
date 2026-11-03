// Navigation contract between the simulation and the world. Implemented by src/world/nav.ts.

import type { Id, Posture } from './types';

export interface Tile {
  x: number;
  z: number;
  /**
   * Milestone 9: floor level. In `NavProvider.findPath` goals, absent = the level searched from; in a returned path it is set
   * on every node when the path crosses levels (and absent when it stays on one level).
   */
  level?: number;
  /** Milestone 9: path nodes on a staircase: metres above the floor of `level` (absent = 0). */
  rise?: number;
}

/** An object's interaction slot resolved into lot space. */
export interface WorldSlot {
  objectId: Id;
  slotId: string;
  kind: 'sit' | 'sleep' | 'use' | 'stand';
  /** Anchor position in metres (lot space) and height above the floor. */
  x: number;
  z: number;
  height: number;
  facing: number;
  /** Walkable tile the person must reach before using the slot (carries `level` for objects above the ground floor). */
  approach: Tile;
  /** Milestone 9: floor level of the object (absent = 0). */
  level?: number;
  posture: Posture;
}

export interface NavProvider {
  /**
   * Grid A* from a tile of `level`; goals may be on other levels (`Tile.level`), and the search crosses staircases. Returns tiles
   * from the first step after `from` to the reached goal, [] if already there, null if unreachable. When the path leaves `level`
   * every node carries its `level` (stair nodes also a `rise`).
   */
  findPath(lotId: Id, level: number, from: Tile, goals: Tile[], opts?: { blocked?: ReadonlySet<string> }): Tile[] | null;
  isWalkable(lotId: Id, level: number, x: number, z: number): boolean;
  /** True when a person can step between two adjacent tiles (walls, doors, corners). */
  canStep(lotId: Id, level: number, from: Tile, to: Tile): boolean;
  /** Resolved slots of a placed object (empty when the object has none or was removed). */
  slotsOf(lotId: Id, objectId: Id): WorldSlot[];
  /** Walkable tiles adjacent to an object usable for standing interactions. */
  standTilesNear(lotId: Id, objectId: Id): Tile[];
  /** Rebuild caches after a construction change on the lot. */
  invalidate(lotId: Id): void;
  /** Statistics for the developer overlay. */
  stats(): { routeRequests: number; lastRouteMs: number };
}
