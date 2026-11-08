// Milestone 12: swimming. A pool is never walked into: the person routes to the deck by a ladder, changes into
// the swim outfit, climbs in at the ladder and then moves procedurally inside the water rectangle (swim laps or
// float in place). Getting out always walks back to the nearest ladder and climbs out onto the deck; a cancel
// request during the swim is handled gracefully (cancelGraceful) so nobody is ever left in the water.
//
// The scripted stages live in `a.data.stage`: toDeck -> enter -> swim -> exit. All positions are clamped to the
// pool rectangle, and no stage uses normal routing inside the water (routeTick's 'here' goal returns at once).

import { TICK_MINUTES } from '../core/clock';
import { facingTo } from '../core/geometry';
import type { Tile } from '../core/nav';
import type { ActionInstance, Person, Pool, PoolLadder } from '../core/types';
import { computeRooms, roomIndex } from '../world/rooms';
import {
  ladderDeckTile, ladderWaterTile, poolAt, poolBesideTile, poolById, poolCenter, poolDepth, poolWidth, usableLadders,
} from '../world/pools';
import { switchOutfit } from './behaviors';
import type { SimCtx } from './context';
import { interactionDef, lotLoc, setAnim, tileOfLoc } from './context';
import { planRoute, routeFromPath } from './movement';
import type { Behavior, Step } from './steps';
import { defDuration, performRates, skillRate } from './steps';
import { currentWeather } from './weather';

/** Metres per game minute while swimming laps inside the pool. */
const SWIM_TILES_PER_MINUTE = 1.6;
const CLIMB_MINUTES = 0.75;
const EXIT_MINUTES = 0.9;

const isRelax = (a: Pick<ActionInstance, 'interactionId'>): boolean => a.interactionId === 'relaxInPool';

/** True when the action is one of the pool swim/float interactions (a swimmer is in the water). */
export function isPoolSwimAction(a: Pick<ActionInstance, 'interactionId'>): boolean {
  return a.interactionId === 'swimInPool' || a.interactionId === 'relaxInPool';
}

/** The pool an action works in: data.poolId first, else the water tile it targets. */
function poolFor(ctx: SimCtx, p: Person, a: ActionInstance): Pool | null {
  const loc = lotLoc(p);
  if (!loc) return null;
  const lot = ctx.state.lots[loc.lotId];
  if (!lot) return null;
  const id = a.data.poolId;
  if (typeof id === 'string') return poolById(lot, id) ?? null;
  return a.target.kind === 'tile' ? poolAt(lot, 0, a.target.x, a.target.z) ?? null : null;
}

/** True when the pool (not the person) is in the open air under no roof. */
export function poolIsOutdoors(ctx: Pick<SimCtx, 'state'>, lot: { id: string }, pool: Pool): boolean {
  const real = ctx.state.lots[lot.id];
  if (!real) return false;
  const centre = poolCenter(pool);
  const rooms = computeRooms(real, 0);
  const idx = roomIndex(rooms, real.width, real.depth)[centre.z * real.width + centre.x] ?? -1;
  const room = rooms[idx];
  if (!room || !room.outdoor) return false;
  for (const r of Object.values(real.roofs ?? {})) {
    if (r.level === 0 && centre.x >= r.x0 && centre.x < r.x1 && centre.z >= r.z0 && centre.z < r.z1) return false;
  }
  return true;
}

/** A deck tile with a reachable, walkable ladder exit; null when the pool has no way in. */
function exitLadder(ctx: SimCtx, lotId: string, pool: Pool, near: Tile): PoolLadder | null {
  for (const l of usableLadders(ctx.state.lots[lotId]!, pool, near)) {
    const d = ladderDeckTile(l);
    if (ctx.nav.isWalkable(lotId, 0, d.x, d.z)) return l;
  }
  return null;
}

/** The swimming path inside the pool: the clockwise perimeter of an inset rectangle, a closed loop. */
export function poolLapPath(pool: Pool): Tile[] {
  const inset = poolWidth(pool) >= 4 && poolDepth(pool) >= 4 ? 1 : 0;
  const x0 = pool.x0 + inset, x1 = pool.x1 - inset, z0 = pool.z0 + inset, z1 = pool.z1 - inset;
  const out: Tile[] = [];
  for (let x = x0; x <= x1; x++) out.push({ x, z: z0 });
  for (let z = z0 + 1; z <= z1; z++) out.push({ x: x1, z });
  for (let x = x1 - 1; x >= x0; x--) out.push({ x, z: z1 });
  for (let z = z1 - 1; z > z0; z--) out.push({ x: x0, z });
  return out;
}

function enterSwimOutfit(ctx: SimCtx, p: Person, a: ActionInstance): void {
  if (a.data.prevOutfit !== undefined) return;
  if ((p.outfits.outfits.swim?.length ?? 0) === 0) return;
  a.data.prevOutfit = p.outfits.current.category;
  a.data.prevOutfitIndex = p.outfits.current.index;
  switchOutfit(ctx, p, 'swim', 0);
}

function startExit(ctx: SimCtx, p: Person, a: ActionInstance): void {
  const loc = lotLoc(p);
  const pool = poolFor(ctx, p, a);
  a.data.stage = 'exit';
  a.elapsed = 0;
  a.replans = 0;
  if (!loc || !pool) return;
  const here = tileOfLoc(loc);
  const ladder = exitLadder(ctx, loc.lotId, pool, here) ?? pool.ladders[0];
  if (!ladder) return;
  const water = ladderWaterTile(ladder), deck = ladderDeckTile(ladder);
  a.data.exitFromX = loc.x;
  a.data.exitFromZ = loc.z;
  a.data.exitX = water.x + 0.5;
  a.data.exitZ = water.z + 0.5;
  a.data.exitDeckX = deck.x + 0.5;
  a.data.exitDeckZ = deck.z + 0.5;
  // backX/backZ is set only for the climb out, so the middle of the swim never teleports the person.
  a.data.backX = deck.x + 0.5;
  a.data.backZ = deck.z + 0.5;
  loc.facing = facingTo(loc.x, loc.z, deck.x + 0.5, deck.z + 0.5);
  setAnim(p, 'swim', ctx.now);
}

/** Petting the person's location inside the water on a lap path as the action advances. */
function advanceLap(p: Person, a: ActionInstance, pool: Pool): void {
  const loc = lotLoc(p);
  if (!loc) return;
  const path = poolLapPath(pool);
  if (path.length === 0) return;
  const n = path.length;
  let pos = (typeof a.data.lapPos === 'number' ? a.data.lapPos : 0) + SWIM_TILES_PER_MINUTE * TICK_MINUTES;
  if (!Number.isFinite(pos)) pos = 0;
  pos = ((pos % n) + n) % n;
  const i = Math.floor(pos), f = pos - i;
  const from = path[i]!, to = path[(i + 1) % n]!;
  loc.x = from.x + 0.5 + (to.x - from.x) * f;
  loc.z = from.z + 0.5 + (to.z - from.z) * f;
  loc.facing = facingTo(loc.x, loc.z, to.x + 0.5, to.z + 0.5);
  a.data.lapPos = pos;
}

function exitStep(p: Person, a: ActionInstance): void {
  const loc = lotLoc(p);
  if (!loc) return;
  const fx = typeof a.data.exitFromX === 'number' ? a.data.exitFromX : loc.x;
  const fz = typeof a.data.exitFromZ === 'number' ? a.data.exitFromZ : loc.z;
  const ex = typeof a.data.exitX === 'number' ? a.data.exitX : fx;
  const ez = typeof a.data.exitZ === 'number' ? a.data.exitZ : fz;
  const f = Math.max(0, Math.min(1, a.elapsed / EXIT_MINUTES));
  loc.x = fx + (ex - fx) * f;
  loc.z = fz + (ez - fz) * f;
  if (typeof a.data.exitDeckX === 'number' && typeof a.data.exitDeckZ === 'number') {
    loc.facing = facingTo(loc.x, loc.z, a.data.exitDeckX, a.data.exitDeckZ);
  }
}

function stepFor(ctx: SimCtx, p: Person, a: ActionInstance): Step | string {
  const def = interactionDef(ctx, a.interactionId);
  if (!def) return 'That is not available.';
  const relax = isRelax(a);
  const stage = typeof a.data.stage === 'string' ? a.data.stage : 'toDeck';
  switch (stage) {
    case 'toDeck': {
      const x = a.data.deckX, z = a.data.deckZ;
      if (typeof x !== 'number' || typeof z !== 'number') return 'There is no way into the pool.';
      return { goal: { kind: 'tile', tile: { x, z, level: 0 }, label: 'pool ladder' }, posture: 'walking', performAnim: 'walk', duration: { kind: 'instant' }, rates: {} };
    }
    case 'enter':
      return { goal: { kind: 'here' }, posture: 'standing', performAnim: relax ? 'float' : 'swim', duration: { kind: 'fixed', minutes: CLIMB_MINUTES }, rates: {} };
    case 'swim':
      return {
        goal: { kind: 'here' }, posture: 'standing', performAnim: relax ? 'float' : 'swim',
        duration: defDuration(def), rates: performRates(ctx, p, def, null, null, 'standing'), skill: skillRate(def, null),
      };
    case 'exit':
      return { goal: { kind: 'here' }, posture: 'standing', performAnim: 'swim', duration: { kind: 'fixed', minutes: EXIT_MINUTES }, rates: {} };
    default:
      return 'That is not available.';
  }
}

/** Swim in the Pool / Relax in the Pool: both share this behavior (the def decides the anim and the rates). */
export const poolSwimBehavior: Behavior = {
  check(ctx, p, a) {
    const loc = lotLoc(p);
    if (!loc) return `${p.firstName} isn't on the lot.`;
    const pool = poolFor(ctx, p, a);
    if (!pool) return 'There is no pool there.';
    if (!exitLadder(ctx, loc.lotId, pool, poolCenter(pool))) return 'The pool has no ladder with a clear deck.';
    // Outdoor pools close in the snow; indoor pools (level-0 rooms) stay open.
    const lot = ctx.state.lots[loc.lotId];
    if (lot && currentWeather(ctx.state) === 'snow' && poolIsOutdoors(ctx, lot, pool)) return 'It is snowing.';
    return null;
  },
  reserve(ctx, p, a) {
    const loc = lotLoc(p);
    if (!loc) return `${p.firstName} isn't here.`;
    const pool = poolFor(ctx, p, a);
    if (!pool) return 'There is no pool there.';
    const lot = ctx.state.lots[loc.lotId];
    if (!lot) return 'There is no pool there.';
    // The nearest ladder with a reachable deck the person can actually walk to.
    for (const ladder of usableLadders(lot, pool, tileOfLoc(loc))) {
      const deck = ladderDeckTile(ladder);
      if (!ctx.nav.isWalkable(loc.lotId, 0, deck.x, deck.z)) continue;
      const path = planRoute(ctx, p, [deck]);
      if (!path) continue;
      a.data.poolId = pool.id;
      a.data.ladderX = ladder.x;
      a.data.ladderZ = ladder.z;
      a.data.deckX = deck.x;
      a.data.deckZ = deck.z;
      a.data.stage = 'toDeck';
      const cur = tileOfLoc(loc);
      if (path.length > 0 || cur.x !== deck.x || cur.z !== deck.z) a.route = routeFromPath(loc, cur, path);
      return null;
    }
    return "Can't reach the pool ladder.";
  },
  step: stepFor,
  begin(ctx, p, a) {
    const stage = typeof a.data.stage === 'string' ? a.data.stage : 'toDeck';
    if (stage === 'toDeck') {
      enterSwimOutfit(ctx, p, a);
      return null;
    }
    const loc = lotLoc(p);
    const pool = poolFor(ctx, p, a);
    if (!loc || !pool) return 'The pool is gone.';
    if (stage === 'enter') {
      const ladder: PoolLadder = {
        x: typeof a.data.ladderX === 'number' ? a.data.ladderX : pool.ladders[0]?.x ?? pool.x0,
        z: typeof a.data.ladderZ === 'number' ? a.data.ladderZ : pool.ladders[0]?.z ?? pool.z0,
        side: pool.ladders.find((l) => l.x === a.data.ladderX && l.z === a.data.ladderZ)?.side ?? 'n',
      };
      const water = ladderWaterTile(ladder);
      loc.x = water.x + 0.5;
      loc.z = water.z + 0.5;
      loc.posture = 'standing';
      return null;
    }
    if (stage === 'swim') {
      if (isRelax(a)) {
        const c = poolCenter(pool);
        a.data.floatX = c.x + 0.5;
        a.data.floatZ = c.z + 0.5;
        loc.x = c.x + 0.5;
        loc.z = c.z + 0.5;
      } else {
        a.data.lapPos = 0;
        const first = poolLapPath(pool)[0];
        if (first) { loc.x = first.x + 0.5; loc.z = first.z + 0.5; }
      }
      return null;
    }
    if (stage === 'exit') {
      startExit(ctx, p, a);
    }
    return null;
  },
  tick(ctx, p, a) {
    const stage = typeof a.data.stage === 'string' ? a.data.stage : 'toDeck';
    if (stage === 'swim') {
      if (isRelax(a)) {
        const loc = lotLoc(p);
        if (loc && typeof a.data.floatX === 'number' && typeof a.data.floatZ === 'number') {
          loc.x = a.data.floatX;
          loc.z = a.data.floatZ;
        }
      } else {
        const pool = poolFor(ctx, p, a);
        if (pool) advanceLap(p, a, pool);
      }
    } else if (stage === 'exit') {
      exitStep(p, a);
    }
    return null;
  },
  next(_ctx, _p, a) {
    const stage = typeof a.data.stage === 'string' ? a.data.stage : 'toDeck';
    if (stage === 'toDeck') { a.data.stage = 'enter'; return true; }
    if (stage === 'enter') { a.data.stage = 'swim'; return true; }
    if (stage === 'swim') { a.data.stage = 'exit'; return true; }
    return false;
  },
  apply(_ctx, _p, a) {
    // A cancelled swim gives no completion bonus; the time already spent still counted through the rates.
    if (a.data.result === 'cancelled') return;
  },
  cancelGraceful(ctx, p, a) {
    if (a.phase !== 'perform') return false;
    const stage = typeof a.data.stage === 'string' ? a.data.stage : 'toDeck';
    if (stage !== 'swim' && stage !== 'enter' && stage !== 'exit') return false;
    if (stage === 'exit') return true; // already climbing out: ignore further cancel requests
    startExit(ctx, p, a);
    a.data.result = 'cancelled';
    a.data.cancelled = true;
    return true;
  },
  end(ctx, p, a) {
    const loc = lotLoc(p);
    // Nobody is ever left standing in the water, whatever ended the action.
    if (loc) {
      const lot = ctx.state.lots[loc.lotId];
      const floor = { x: Math.floor(loc.x), z: Math.floor(loc.z) };
      if (lot && poolAt(lot, 0, floor.x, floor.z)) {
        const pool = poolFor(ctx, p, a);
        const ladder = pool ? exitLadder(ctx, loc.lotId, pool, floor) : null;
        const deck = ladder ? ladderDeckTile(ladder) : (typeof a.data.deckX === 'number' && typeof a.data.deckZ === 'number' ? { x: a.data.deckX, z: a.data.deckZ } : null);
        if (deck) { loc.x = deck.x + 0.5; loc.z = deck.z + 0.5; }
      }
      loc.posture = 'standing';
      delete loc.rise;
    }
    if (a.data.prevOutfit !== undefined) {
      switchOutfit(ctx, p, a.data.prevOutfit as Person['outfits']['current']['category'], typeof a.data.prevOutfitIndex === 'number' ? a.data.prevOutfitIndex : 0);
      delete a.data.prevOutfit;
      delete a.data.prevOutfitIndex;
    }
    setAnim(p, 'idle', ctx.now);
  },
  interruptible: false,
};

/** Get Out: the queue special-cases this interaction (sim/simulation.ts); the behavior only explains availability. */
export const getOutBehavior: Behavior = {
  check(_ctx, p, a) {
    const head = p.queue[0];
    if (!head || !isPoolSwimAction(head) || head === a) return `${p.firstName} isn't in the pool.`;
    return null;
  },
  reserve: () => null,
  step: () => ({ goal: { kind: 'here' }, posture: 'standing', performAnim: 'idle', duration: { kind: 'instant' }, rates: {} }),
  interruptible: false,
};

// ---------------------------------------------------------------------------------------------
// Toddlers: paddling at the edge (Milestone 13)
// ---------------------------------------------------------------------------------------------

/** Tiles within which a grown-up must be to watch a paddling toddler. */
export const SUPERVISION_RADIUS = 8;

/** An awake teen or adult on the toddler's lot and level within SUPERVISION_RADIUS (the toddler itself excluded). */
export function supervisorNear(ctx: SimCtx, p: Person): Person | null {
  const loc = lotLoc(p);
  if (!loc) return null;
  for (const o of Object.values(ctx.state.people)) {
    if (o.id === p.id || !GROWN_UP.includes(o.lifeStage)) continue;
    const l = lotLoc(o);
    if (!l || l.lotId !== loc.lotId || l.level !== loc.level || l.posture === 'lying') continue;
    if (Math.hypot(l.x - loc.x, l.z - loc.z) <= SUPERVISION_RADIUS) return o;
  }
  return null;
}
const GROWN_UP: readonly Person['lifeStage'][] = ['teen', 'youngAdult', 'adult', 'elder'];

/**
 * Paddle at the Edge: a toddler stands on the dry deck tile beside the water (never in it) and splashes. It needs a grown-up
 * close by when it starts, and the activity ends as soon as nobody is watching.
 */
export const paddleBehavior: Behavior = {
  check(ctx, p, a) {
    const loc = lotLoc(p);
    const lot = loc ? ctx.state.lots[loc.lotId] : undefined;
    if (!loc || !lot || a.target.kind !== 'tile') return 'Paddle at the pool edge.';
    if (!poolBesideTile(lot, a.target.level ?? 0, a.target.x, a.target.z)) return 'Toddlers paddle only on the deck right beside the water.';
    if (!ctx.nav.isWalkable(lot.id, 0, a.target.x, a.target.z)) return "Can't reach the pool edge.";
    return supervisorNear(ctx, p) ? null : 'A grown-up needs to be watching close by.';
  },
  reserve(ctx, p, a) {
    const loc = lotLoc(p);
    if (!loc || a.target.kind !== 'tile') return 'Paddle at the pool edge.';
    const goal = { x: a.target.x, z: a.target.z, level: 0 };
    const cur = tileOfLoc(loc);
    const path = cur.x === goal.x && cur.z === goal.z ? [] : planRoute(ctx, p, [goal]);
    if (!path) return "Can't reach the pool edge.";
    a.route = routeFromPath(loc, cur, path);
    return null;
  },
  step(ctx, p, a): Step | string {
    const def = interactionDef(ctx, a.interactionId);
    if (!def || a.target.kind !== 'tile') return 'Paddle at the pool edge.';
    const loc = lotLoc(p);
    const lot = loc ? ctx.state.lots[loc.lotId] : undefined;
    const pool = lot ? poolBesideTile(lot, 0, a.target.x, a.target.z) : undefined;
    const c = pool ? poolCenter(pool) : null;
    return {
      goal: { kind: 'tile', tile: { x: a.target.x, z: a.target.z, level: 0 }, ...(c ? { face: { x: c.x + 0.5, z: c.z + 0.5 } } : {}), label: 'the pool edge' },
      posture: 'standing', performAnim: def.anims.perform, duration: defDuration(def), rates: performRates(ctx, p, def, null, null, 'standing'), skill: skillRate(def, null),
    };
  },
  tick(ctx, p) { return supervisorNear(ctx, p) ? null : 'done'; },
  interruptible: false,
};
