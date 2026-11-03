// Milestone 9: walking between floors. A route that crosses levels carries `level` and `rise` on its waypoints (core/types
// ActionInstance.route): `level` is the floor the person is on once they reach the waypoint, `rise` the height above that floor in
// metres (stair cells). While walking, the person's height moves smoothly toward the next waypoint and the walk is slower
// (STAIR_SLOWDOWN). `location.level` flips at the top (or, going down, at the first stair cell) and `location.rise` is 0 on a floor.
// People never stop on a stair: settleOnStairs finishes a crossing that was interrupted.

import type { Tile } from '../core/nav';
import type { Person } from '../core/types';
import { LEVEL_HEIGHT, levelY, stairLinks, STAIR_SLOWDOWN, type StairLink } from '../world/levels';
import type { LotLocation, SimCtx } from './context';
import { lotLoc } from './context';

export type Waypoint = { x: number; z: number; level?: number; rise?: number };

export { STAIR_SLOWDOWN };

/** True when walking from the person's position to this waypoint is a stair stride (slower, no walkability check). */
export function isStairStep(loc: Pick<LotLocation, 'level' | 'rise'>, wp: Waypoint): boolean {
  return (wp.rise ?? 0) !== 0 || (loc.rise ?? 0) !== 0 || (wp.level !== undefined && wp.level !== loc.level);
}

/** Moves the height a fraction `f` (0..1) of the way from the current height to the waypoint's. */
export function progressHeight(loc: LotLocation, wp: Waypoint, f: number): void {
  const cur = levelY(loc.level) + (loc.rise ?? 0);
  const target = levelY(wp.level ?? loc.level) + (wp.rise ?? 0);
  const rise = cur + (target - cur) * f - levelY(loc.level);
  if (Math.abs(rise) < 1e-6) delete loc.rise; else loc.rise = Math.round(rise * 1e6) / 1e6;
}

/** Arriving at a waypoint: take its level and rise. */
export function arriveHeight(loc: LotLocation, wp: Waypoint): void {
  if (wp.level !== undefined) loc.level = wp.level;
  if (wp.rise) loc.rise = wp.rise; else delete loc.rise;
}

/** Waypoint tags for a path from the person's tile; paths that cross levels tag every waypoint with its level and rise. */
export function tagWaypoints(loc: Pick<LotLocation, 'level' | 'rise'>, path: readonly Tile[]): Array<{ level?: number; rise?: number }> {
  const crossing = path.some((t) => t.level !== undefined);
  return path.map((t) => (crossing ? { level: t.level ?? loc.level, ...(t.rise ? { rise: t.rise } : {}) } : {}));
}

function linkAt(ctx: SimCtx, loc: LotLocation): StairLink | undefined {
  const lot = ctx.state.lots[loc.lotId];
  if (!lot) return undefined;
  const tx = Math.floor(loc.x), tz = Math.floor(loc.z);
  return stairLinks(lot, ctx.content).find((l) => l.level === loc.level && l.cells.some((c) => c.x === tx && c.z === tz));
}

/**
 * Ends a crossing nobody is walking any more (the action was cancelled, the route dropped): the person goes to the nearer end of
 * the stair they stand on. Without a stair underneath they simply drop to the floor they are on.
 */
export function settleOnStairs(ctx: SimCtx, p: Person): void {
  const loc = lotLoc(p);
  if (!loc || !loc.rise) return;
  const link = linkAt(ctx, loc);
  if (link && loc.rise >= LEVEL_HEIGHT / 2) {
    loc.level = link.head.level ?? link.level + 1;
    loc.x = link.head.x + 0.5; loc.z = link.head.z + 0.5;
  } else if (link) {
    loc.x = link.foot.x + 0.5; loc.z = link.foot.z + 0.5;
  }
  delete loc.rise;
}
