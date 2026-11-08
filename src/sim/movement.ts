// Walking: route planning through the NavProvider, per-tick movement at a fixed speed (diagonal steps
// cover sqrt 2 tiles), bounded replanning when the way gets blocked, and freeing people who end up on
// a blocked tile after a build change.

import { TICK_MINUTES } from '../core/clock';
import { facingTo } from '../core/geometry';
import type { Tile } from '../core/nav';
import type { ActionInstance, Person } from '../core/types';
import type { LotLocation, SimCtx } from './context';
import { dist, lotLoc, setAnim, tileOfLoc } from './context';
import type { Goal } from './steps';
import { arriveHeight, isStairStep, progressHeight, settleOnStairs, STAIR_SLOWDOWN, tagWaypoints } from './stairs';
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

/**
 * Converts a nav path into tile-centre waypoints, starting with the current tile's centre when off-centre. A path that crosses
 * levels (sim/stairs.ts) gives every waypoint its level and stair rise.
 */
export function routeFromPath(loc: { x: number; z: number; level?: number; rise?: number }, cur: Tile, path: Tile[]): Array<{ x: number; z: number; level?: number; rise?: number }> {
  const out: Array<{ x: number; z: number; level?: number; rise?: number }> = [];
  const cx = cur.x + 0.5, cz = cur.z + 0.5;
  const here = { level: loc.level ?? 0, rise: loc.rise };
  const tags = tagWaypoints(here, path);
  const crossing = tags.some((t) => t.level !== undefined);
  if (Math.abs(loc.x - cx) > EPS || Math.abs(loc.z - cz) > EPS) out.push(crossing ? { x: cx, z: cz, level: here.level } : { x: cx, z: cz });
  path.forEach((t, i) => out.push({ x: t.x + 0.5, z: t.z + 0.5, ...tags[i]! }));
  return out;
}

/** Key of a goal or waypoint tile that tells floors apart. */
const lvKey = (level: number, t: { x: number; z: number }) => `${level}:${t.x},${t.z}`;

/** Tiles that satisfy a goal, or a failure reason. */
export function goalTiles(ctx: SimCtx, p: Person, goal: Goal): Tile[] | string {
  const loc = lotLoc(p);
  if (!loc) return `${p.firstName} isn't here.`;
  switch (goal.kind) {
    case 'here': return [tileOfLoc(loc)];
    // slots carry their floor (absent = ground floor); tile goals without a level are on the person's floor
    case 'slot': return [{ ...goal.slot.approach, level: goal.slot.approach.level ?? 0 }];
    case 'tile': return [goal.tile];
    case 'person': {
      const other = ctx.state.people[goal.personId];
      const oloc = other ? lotLoc(other) : null;
      if (!other || !oloc || oloc.lotId !== loc.lotId) return `${other?.firstName ?? 'They'} left.`;
      const t = tileOfLoc(oloc);
      const ol = oloc.level;
      const out: Tile[] = [];
      // orthogonal neighbours first so conversations prefer facing each other squarely
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]] as const;
      for (const [dx, dz] of dirs) {
        const n = { x: t.x + dx, z: t.z + dz };
        if (!ctx.nav.isWalkable(loc.lotId, ol, n.x, n.z)) continue;
        if (dx !== 0 && dz !== 0) {
          // diagonal neighbours only when both orthogonal steps are open (no talking through wall corners)
          if (!ctx.nav.canStep(loc.lotId, ol, t, { x: t.x + dx, z: t.z }) || !ctx.nav.canStep(loc.lotId, ol, t, { x: t.x, z: t.z + dz })) continue;
        } else if (!ctx.nav.canStep(loc.lotId, ol, t, n)) continue;
        out.push(ol === loc.level ? n : { ...n, level: ol });
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
  const goalSet = new Set(goals.map((g) => lvKey(g.level ?? loc.level, g)));

  const last = a.route[a.route.length - 1];
  if (last && !goalSet.has(lvKey(last.level ?? loc.level, { x: Math.floor(last.x), z: Math.floor(last.z) }))) a.route = [];

  if (a.route.length === 0) {
    const cur = tileOfLoc(loc);
    if (!loc.rise && goalSet.has(lvKey(loc.level, cur))) {
      const cx = cur.x + 0.5, cz = cur.z + 0.5;
      if (Math.abs(loc.x - cx) <= EPS && Math.abs(loc.z - cz) <= EPS) { stopWalking(p, ctx); return 'arrived'; }
      a.route = [{ x: cx, z: cz }];
    } else {
      const path = planRoute(ctx, p, goals);
      if (!path) return { fail: unreachableText(goal) };
      a.route = routeFromPath(loc, tileOfLoc(loc), path);
    }
  }

  // An action can ask for another gait (a jog along the park track): `moveAnim` and `pace` in its data.
  const pace = typeof a.data.pace === 'number' && a.data.pace > 0 ? a.data.pace : 1;
  let budget = WALK_TILES_PER_MINUTE * TICK_MINUTES * pace;
  loc.posture = 'walking';
  setAnim(p, a.data.moveAnim === 'jog' ? 'jog' : 'walk', ctx.now);
  while (budget > EPS && a.route.length > 0) {
    const wp = a.route[0]!;
    const d = dist(loc.x, loc.z, wp.x, wp.z);
    // stairs are slower: the same stride costs more of the tick's walking budget
    const cost = isStairStep(loc, wp) ? d * STAIR_SLOWDOWN : d;
    if (d > EPS) loc.facing = facingTo(loc.x, loc.z, wp.x, wp.z);
    if (cost <= budget) {
      loc.x = wp.x; loc.z = wp.z;
      arriveHeight(loc, wp);
      budget -= cost;
      a.route.shift();
      const nxt = a.route[0];
      if (nxt) {
        const from = { x: Math.floor(wp.x), z: Math.floor(wp.z) };
        const to = { x: Math.floor(nxt.x), z: Math.floor(nxt.z) };
        const toLevel = nxt.level ?? loc.level;
        if (!isStairStep(loc, nxt) && (!ctx.nav.isWalkable(loc.lotId, toLevel, to.x, to.z) || !ctx.nav.canStep(loc.lotId, toLevel, from, to))) {
          a.replans += 1;
          a.route = [];
          if (a.replans > MAX_REPLANS) return { fail: blockedText(goal) };
          return 'moving';
        }
      }
    } else {
      const f = budget / cost;
      loc.x += (wp.x - loc.x) * f;
      loc.z += (wp.z - loc.z) * f;
      progressHeight(loc, wp, f);
      budget = 0;
    }
  }
  if (a.route.length === 0) {
    const cur = tileOfLoc(loc);
    const cx = cur.x + 0.5, cz = cur.z + 0.5;
    if (!loc.rise && goalSet.has(lvKey(loc.level, cur)) && Math.abs(loc.x - cx) <= EPS && Math.abs(loc.z - cz) <= EPS) {
      stopWalking(p, ctx);
      return 'arrived';
    }
  }
  return 'moving';
}

function stopWalking(p: Person, ctx: SimCtx): void {
  const loc = lotLoc(p);
  if (loc && loc.posture === 'walking') loc.posture = 'standing';
  if (p.anim.id === 'walk' || p.anim.id === 'jog') setAnim(p, 'idle', ctx.now);
}

/**
 * Moves a standing person off a tile that is no longer walkable (an object was placed or a wall built
 * there) to the nearest walkable tile within a few steps. Seated or lying people are left alone.
 */
export function unstick(ctx: SimCtx, p: Person): void {
  const loc = lotLoc(p);
  if (!loc || loc.posture === 'seated' || loc.posture === 'lying') return;
  if (loc.rise) settleOnStairs(ctx, p);
  const cur = tileOfLoc(loc);
  if (ctx.nav.isWalkable(loc.lotId, loc.level, cur.x, cur.z)) return;
  const t = nearestWalkable(ctx, loc, cur);
  if (t) { loc.x = t.x + 0.5; loc.z = t.z + 0.5; return; }
  // Milestone 9: the floor they stood on is gone (an undo took the upper floor or the stairs away): they end up on the floor below
  for (let level = loc.level - 1; level >= 0; level--) {
    const below = nearestWalkable(ctx, loc, cur, 6, level);
    if (below) { loc.level = level; loc.x = below.x + 0.5; loc.z = below.z + 0.5; delete loc.rise; return; }
  }
}

export function nearestWalkable(ctx: SimCtx, loc: LotLocation, from: Tile, radius = 6, level = loc.level): Tile | null {
  for (let r = level === loc.level ? 1 : 0; r <= radius; r++) {
    let best: Tile | null = null, bestD = Infinity;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = from.x + dx, z = from.z + dz;
        if (!ctx.nav.isWalkable(loc.lotId, level, x, z)) continue;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = { x, z }; }
      }
    }
    if (best) return best;
  }
  return null;
}
