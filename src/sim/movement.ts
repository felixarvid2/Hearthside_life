// Walking: route planning through the NavProvider, per-tick movement at a fixed speed (diagonal steps
// cover sqrt 2 tiles), bounded replanning when the way gets blocked, and freeing people who end up on
// a blocked tile after a build change.

import { TICK_MINUTES } from '../core/clock';
import { facingTo } from '../core/geometry';
import type { Tile } from '../core/nav';
import type { ActionInstance, Person } from '../core/types';
import type { LotLocation, SimCtx } from './context';
import { dist, lotLoc, setAnim, tileKeyXZ, tileOfLoc } from './context';
import type { Goal } from './steps';
import { MAX_REPLANS, WALK_TILES_PER_MINUTE } from './tuning';

const EPS = 1e-6;

/** Plans a path from the person's tile to any of the goals (frees them first when standing on a blocked tile). */
export function planRoute(ctx: SimCtx, p: Person, goals: Tile[]): Tile[] | null {
  const loc = lotLoc(p);
  if (!loc || goals.length === 0) return null;
  unstick(ctx, p);
  ctx.counters.routeRequests++;
  return ctx.nav.findPath(loc.lotId, loc.level, tileOfLoc(loc), goals);
}

/** Converts a nav path into tile-centre waypoints, starting with the current tile's centre when off-centre. */
export function routeFromPath(loc: { x: number; z: number }, cur: Tile, path: Tile[]): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  const cx = cur.x + 0.5, cz = cur.z + 0.5;
  if (Math.abs(loc.x - cx) > EPS || Math.abs(loc.z - cz) > EPS) out.push({ x: cx, z: cz });
  for (const t of path) out.push({ x: t.x + 0.5, z: t.z + 0.5 });
  return out;
}

/** Tiles that satisfy a goal, or a failure reason. */
export function goalTiles(ctx: SimCtx, p: Person, goal: Goal): Tile[] | string {
  const loc = lotLoc(p);
  if (!loc) return `${p.firstName} isn't here.`;
  switch (goal.kind) {
    case 'here': return [tileOfLoc(loc)];
    case 'slot': return [goal.slot.approach];
    case 'tile': return [goal.tile];
    case 'person': {
      const other = ctx.state.people[goal.personId];
      const oloc = other ? lotLoc(other) : null;
      if (!other || !oloc || oloc.lotId !== loc.lotId) return `${other?.firstName ?? 'They'} left.`;
      const t = tileOfLoc(oloc);
      const out: Tile[] = [];
      // orthogonal neighbours first so conversations prefer facing each other squarely
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]] as const;
      for (const [dx, dz] of dirs) {
        const n = { x: t.x + dx, z: t.z + dz };
        if (!ctx.nav.isWalkable(loc.lotId, loc.level, n.x, n.z)) continue;
        if (dx !== 0 && dz !== 0) {
          // diagonal neighbours only when both orthogonal steps are open (no talking through wall corners)
          if (!ctx.nav.canStep(loc.lotId, loc.level, t, { x: t.x + dx, z: t.z }) || !ctx.nav.canStep(loc.lotId, loc.level, t, { x: t.x, z: t.z + dz })) continue;
        } else if (!ctx.nav.canStep(loc.lotId, loc.level, t, n)) continue;
        out.push(n);
      }
      return out;
    }
  }
}

function unreachableText(goal: Goal): string {
  switch (goal.kind) {
    case 'slot': return `Can't reach the ${goal.label}.`;
    case 'tile': return goal.label === 'there' ? "Can't get there." : `Can't reach the ${goal.label}.`;
    case 'person': return `Can't reach ${goal.label}.`;
    case 'here': return "Can't move.";
  }
}

function blockedText(goal: Goal): string {
  const what = goal.kind === 'person' ? goal.label : goal.kind === 'here' ? 'there' : goal.label === 'there' ? 'there' : `the ${goal.label}`;
  return `Couldn't get to ${what}: the way is blocked.`;
}

export type RouteResult = 'arrived' | 'moving' | { fail: string };

/**
 * Advances the person along the action's route for one tick. Plans (or replans) when needed:
 * a route whose last waypoint no longer satisfies the goal is dropped; a step that became impossible
 * counts as a blocked replan (at most MAX_REPLANS, then the action fails with a readable reason).
 */
export function routeTick(ctx: SimCtx, p: Person, a: ActionInstance, goal: Goal): RouteResult {
  const loc = lotLoc(p);
  if (!loc) return { fail: `${p.firstName} isn't here.` };
  if (goal.kind === 'here') { stopWalking(p, ctx); return 'arrived'; }
  const goals = goalTiles(ctx, p, goal);
  if (typeof goals === 'string') return { fail: goals };
  if (goals.length === 0) return { fail: unreachableText(goal) };
  const goalSet = new Set(goals.map(tileKeyXZ));

  const last = a.route[a.route.length - 1];
  if (last && !goalSet.has(tileKeyXZ({ x: Math.floor(last.x), z: Math.floor(last.z) }))) a.route = [];

  if (a.route.length === 0) {
    const cur = tileOfLoc(loc);
    if (goalSet.has(tileKeyXZ(cur))) {
      const cx = cur.x + 0.5, cz = cur.z + 0.5;
      if (Math.abs(loc.x - cx) <= EPS && Math.abs(loc.z - cz) <= EPS) { stopWalking(p, ctx); return 'arrived'; }
      a.route = [{ x: cx, z: cz }];
    } else {
      const path = planRoute(ctx, p, goals);
      if (!path) return { fail: unreachableText(goal) };
      a.route = routeFromPath(loc, tileOfLoc(loc), path);
    }
  }

  let budget = WALK_TILES_PER_MINUTE * TICK_MINUTES;
  loc.posture = 'walking';
  setAnim(p, 'walk', ctx.now);
  while (budget > EPS && a.route.length > 0) {
    const wp = a.route[0]!;
    const d = dist(loc.x, loc.z, wp.x, wp.z);
    if (d > EPS) loc.facing = facingTo(loc.x, loc.z, wp.x, wp.z);
    if (d <= budget) {
      loc.x = wp.x; loc.z = wp.z;
      budget -= d;
      a.route.shift();
      const nxt = a.route[0];
      if (nxt) {
        const from = { x: Math.floor(wp.x), z: Math.floor(wp.z) };
        const to = { x: Math.floor(nxt.x), z: Math.floor(nxt.z) };
        if (!ctx.nav.isWalkable(loc.lotId, loc.level, to.x, to.z) || !ctx.nav.canStep(loc.lotId, loc.level, from, to)) {
          a.replans += 1;
          a.route = [];
          if (a.replans > MAX_REPLANS) return { fail: blockedText(goal) };
          return 'moving';
        }
      }
    } else {
      loc.x += ((wp.x - loc.x) / d) * budget;
      loc.z += ((wp.z - loc.z) / d) * budget;
      budget = 0;
    }
  }
  if (a.route.length === 0) {
    const cur = tileOfLoc(loc);
    const cx = cur.x + 0.5, cz = cur.z + 0.5;
    if (goalSet.has(tileKeyXZ(cur)) && Math.abs(loc.x - cx) <= EPS && Math.abs(loc.z - cz) <= EPS) {
      stopWalking(p, ctx);
      return 'arrived';
    }
  }
  return 'moving';
}

function stopWalking(p: Person, ctx: SimCtx): void {
  const loc = lotLoc(p);
  if (loc && loc.posture === 'walking') loc.posture = 'standing';
  if (p.anim.id === 'walk') setAnim(p, 'idle', ctx.now);
}

/**
 * Moves a standing person off a tile that is no longer walkable (an object was placed or a wall built
 * there) to the nearest walkable tile within a few steps. Seated or lying people are left alone.
 */
export function unstick(ctx: SimCtx, p: Person): void {
  const loc = lotLoc(p);
  if (!loc || loc.posture === 'seated' || loc.posture === 'lying') return;
  const cur = tileOfLoc(loc);
  if (ctx.nav.isWalkable(loc.lotId, loc.level, cur.x, cur.z)) return;
  const t = nearestWalkable(ctx, loc, cur);
  if (t) { loc.x = t.x + 0.5; loc.z = t.z + 0.5; }
}

export function nearestWalkable(ctx: SimCtx, loc: LotLocation, from: Tile, radius = 6): Tile | null {
  for (let r = 1; r <= radius; r++) {
    let best: Tile | null = null, bestD = Infinity;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = from.x + dx, z = from.z + dz;
        if (!ctx.nav.isWalkable(loc.lotId, loc.level, x, z)) continue;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = { x, z }; }
      }
    }
    if (best) return best;
  }
  return null;
}
