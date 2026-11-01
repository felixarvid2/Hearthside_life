// Navigation contract between the simulation and the world. Implemented by src/world/nav.ts.

import type { Id, Posture } from './types';

export interface Tile { x: number; z: number }

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
  /** Walkable tile the person must reach before using the slot. */
  approach: Tile;
  posture: Posture;
}

export interface NavProvider {
  /** Grid A* on the lot level. Returns tiles from the first step after `from` to the reached goal, [] if already there, null if unreachable. */
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
