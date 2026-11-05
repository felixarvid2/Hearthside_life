// Pure planning for the Milestone 12 pool tool (Lot.pools). Like exteriorPlans.ts a plan checks the whole operation,
// prices it and lists exactly what changes (PoolDiff) plus the measurement and highlight the renderer shows. Nothing
// here mutates state or allocates ids, so previews can run on every pointer move and a rejected preview never spends money.
//
// Rules:
// - a pool is an inclusive rectangle of level-0 tiles, at least 2x3 / 3x2 and at most 12x12;
// - it stays on the lot and does not overlap walls, openings, objects, stairs, another pool or an upper floor;
// - it does not cover a person;
// - the deck next to at least one short-side ladder must stay reachable from the lot entry, and the water must not cut
//   any previously reachable tile off from the entry;
// - cost is the style's price per water tile times the tile count; removal refunds the same day or 80 % later.
// Ladders are free: moving, adding and removing one is an undoable command with no money.

import { exteriorOf, poolStyleOf } from '../content/exterior';
import type { ContentDB } from '../content/types';
import { MINUTES_PER_DAY } from '../core/clock';
import { tileKey } from '../core/ids';
import type { Cents, Id, Lot, Pool, PoolLadder, WorldState } from '../core/types';
import { inLot } from '../world/lots';
import { buildNavGrid, isFree, reachableMask } from '../world/navgrid';
import { levelSeeds } from '../world/levels';
import {
  isPoolEdgeTile, ladderDeckTile, poolContains, poolTiles, poolWidth, poolDepth, poolsOf, shortSideLadders,
  POOL_MAX_EDGE, POOL_MIN_LONG, POOL_MIN_SHORT,
} from '../world/pools';
import { objectTiles } from '../world/placement';
import { levelReach } from '../world/structure';
import { edgeTiles } from '../world/walls';
import { chargeFor, editAccess, RESALE_RATE, saleValue } from './plans';
import type { BuildConflict, Point } from './buildPlans';

const LONG_AGO = -MINUTES_PER_DAY;
const NOT_ENOUGH = 'Not enough household funds.';
export const PENDING_POOL = 'pending:pool:';

/** Inclusive tile rectangle of a pool. */
export interface PoolRect { x0: number; z0: number; x1: number; z1: number }

// ---------------------------------------------------------------------------------------------
// Requests and diff
// ---------------------------------------------------------------------------------------------

export type PoolRequest =
  /** Builds a pool; `ladder` is an explicit edge tile, or absent to auto-place on a short side. */
  | { kind: 'pool'; rect: PoolRect; styleId: string; ladder?: Point }
  | { kind: 'erasePool'; poolId?: Id; tile?: Point }
  | { kind: 'moveLadder'; poolId: Id; from: Point; to: Point }
  | { kind: 'addLadder'; poolId: Id; tile: Point }
  | { kind: 'removeLadder'; poolId: Id; tile: Point };

export interface PoolDelta { id: Id; before: Pool | null; after: Pool | null }
export interface PoolDiff { pools: PoolDelta[] }

export const emptyPoolDiff = (): PoolDiff => ({ pools: [] });
export function isEmptyPoolDiff(d: PoolDiff): boolean { return d.pools.length === 0; }

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Writes a diff into the lot (the "after" sides). */
export function applyPoolDiff(lot: Lot, d: PoolDiff): void {
  for (const p of d.pools) {
    if (p.after) (lot.pools ??= {})[p.id] = copy(p.after);
    else if (lot.pools) delete lot.pools[p.id];
  }
  if (lot.pools && Object.keys(lot.pools).length === 0) delete lot.pools;
}

/** Writes the "before" sides back. */
export function revertPoolDiff(lot: Lot, d: PoolDiff): void {
  applyPoolDiff(lot, { pools: d.pools.map((p) => ({ id: p.id, before: p.after, after: p.before })) });
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** True when the lot still holds exactly the "before" records of the diff (so redo is safe). */
export function poolDiffMatchesLot(lot: Lot, d: PoolDiff): boolean {
  return d.pools.every((p) => same(lot.pools?.[p.id], p.before));
}

/** A copy of the lot with the diff applied (read-only use: shares objects with the original). */
export function virtualPoolLot(lot: Lot, d: PoolDiff): Lot {
  const out: Lot = { ...lot, pools: { ...(lot.pools ?? {}) } };
  applyPoolDiff(out, d);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------------------------

/** Price of a pool rectangle in a style (per water tile). */
export function poolPrice(styleId: string, rect: PoolRect, content?: ContentDB): Cents {
  const style = poolStyleOf(exteriorOf(content), styleId);
  return style.pricePerTile * Math.max(0, rect.x1 - rect.x0 + 1) * Math.max(0, rect.z1 - rect.z0 + 1);
}

/** Refund for removing a pool (full on the day it was built, else 80 %; nothing in the sandbox). */
export function poolRefund(state: WorldState, pool: Pool, content?: ContentDB): Cents {
  if (pool.purchasePrice !== undefined) {
    return saleValue(state, { boughtAt: pool.boughtAt ?? LONG_AGO, purchasePrice: pool.purchasePrice });
  }
  if (state.settings.unlimitedFunds) return 0;
  return Math.round(poolPrice(pool.styleId, pool, content) * RESALE_RATE);
}

// ---------------------------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------------------------

export interface PoolHighlight {
  level: number;
  /** Water tiles covered by the new pool. */
  tiles: Point[];
  /** Pools that would appear / disappear. */
  newPools: PoolRect[];
  removedPools: PoolRect[];
  blocked: BuildConflict[];
}

export interface PoolCounts { tiles: number; ladders: number; removed: number; poolsRemoved: number }

export interface PoolPlan {
  ok: boolean;
  reasons: string[];
  noop: boolean;
  label: string;
  /** Net money now (charge - refund). */
  cost: Cents;
  charge: Cents;
  refund: Cents;
  counts: PoolCounts;
  measure: { text: string; areaM2?: number };
  highlight: PoolHighlight;
  diff: PoolDiff;
}

const noCounts = (): PoolCounts => ({ tiles: 0, ladders: 0, removed: 0, poolsRemoved: 0 });
const rectOf = (p: Pool): PoolRect => ({ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1 });
const inside = (r: PoolRect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

function failPlan(reasons: string[], label = 'Build pool'): PoolPlan {
  return {
    ok: false, reasons, noop: false, label, cost: 0, charge: 0, refund: 0, counts: noCounts(), measure: { text: '' },
    highlight: { level: 0, tiles: [], newPools: [], removedPools: [], blocked: [] }, diff: emptyPoolDiff(),
  };
}

interface Draft {
  label: string;
  emptyReason: string;
  diff: PoolDiff;
  charge: Cents;
  refund: Cents;
  counts: PoolCounts;
  measure: PoolPlan['measure'];
  highlight: PoolHighlight;
  reasons: string[];
}

function newDraft(label: string, emptyReason: string): Draft {
  return {
    label, emptyReason, diff: emptyPoolDiff(), charge: 0, refund: 0, counts: noCounts(), measure: { text: '' }, reasons: [],
    highlight: { level: 0, tiles: [], newPools: [], removedPools: [], blocked: [] },
  };
}

function peopleInside(state: Pick<WorldState, 'people'>, lot: Lot, rect: PoolRect): string[] {
  const names: string[] = [];
  for (const p of Object.values(state.people) as Array<{ firstName: string; location: { kind: string; lotId?: Id; level?: number; x?: number; z?: number } }>) {
    const l = p.location;
    if (l.kind !== 'lot' || l.lotId !== lot.id || l.level !== 0) continue;
    if (inside(rect, Math.floor(l.x ?? 0), Math.floor(l.z ?? 0))) names.push(p.firstName);
  }
  return names;
}

function rectReasons(state: Pick<WorldState, 'people'>, content: ContentDB, lot: Lot, rect: PoolRect): string[] {
  const reasons: string[] = [];
  const w = rect.x1 - rect.x0 + 1, d = rect.z1 - rect.z0 + 1;
  if (![rect.x0, rect.z0, rect.x1, rect.z1].every(Number.isInteger)) return ['Pools snap to the grid.'];
  if (rect.x0 < 0 || rect.z0 < 0 || rect.x1 >= lot.width || rect.z1 >= lot.depth) return ['Pools have to stay on the lot.'];
  if (Math.min(w, d) < POOL_MIN_SHORT || Math.max(w, d) < POOL_MIN_LONG) return [`A pool is at least ${POOL_MIN_SHORT} x ${POOL_MIN_LONG} m.`];
  if (Math.max(w, d) > POOL_MAX_EDGE) return [`A pool is at most ${POOL_MAX_EDGE} x ${POOL_MAX_EDGE} m.`];

  // walls (and the openings in them) may not touch the water
  for (const wall of Object.values(lot.walls)) {
    if (wall.level !== 0) continue;
    if (edgeTiles(wall).some((t) => inside(rect, t.x, t.z))) { reasons.push('A wall runs through the pool.'); break; }
  }
  // upper floor: not under the house
  for (let z = rect.z0; z <= rect.z1 && reasons.length === 0; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (lot.floors[tileKey(1, x, z)] !== undefined) { reasons.push('There is a floor above: pools go outside or on the ground floor.'); break; }
    }
  }
  // objects on the ground floor (any layer)
  for (const obj of Object.values(lot.objects)) {
    if (obj.level !== 0) continue;
    const def = content.objects[obj.defId];
    const tiles = def ? objectTiles(obj, def) : [{ x: obj.x, z: obj.z }];
    if (tiles.some((t) => inside(rect, t.x, t.z))) {
      reasons.push(`Move the ${def?.name ?? 'object'} first.`);
      break;
    }
  }
  // other pools
  for (const other of poolsOf(lot)) {
    if (rect.x0 <= other.x1 && rect.x1 >= other.x0 && rect.z0 <= other.z1 && rect.z1 >= other.z0) {
      reasons.push('It would overlap another pool.');
      break;
    }
  }
  const people = peopleInside(state, lot, rect);
  if (people.length > 0) reasons.push(`${people[0]} is standing there.`);
  return [...new Set(reasons)];
}

/** The pool navigation after a diff (level 0 grid + reachable mask from the entry). */
function reachAfter(lot: Lot, content: ContentDB, diff: PoolDiff): { freeDeck: (x: number, z: number) => boolean; reachable: (x: number, z: number) => boolean } {
  const virtual = virtualPoolLot(lot, diff);
  const grid = buildNavGrid(virtual, content, 0);
  const seeds = levelSeeds(virtual, content, 0).filter((t) => inLot(virtual, t.x, t.z));
  const mask = seeds.length > 0 ? reachableMask(grid, seeds) : new Uint8Array(grid.width * grid.depth);
  return {
    freeDeck: (x, z) => inLot(virtual, x, z) && isFree(grid, x, z),
    reachable: (x, z) => inLot(virtual, x, z) && mask[z * grid.width + x] === 1,
  };
}

/** The first walkable tile that the entry could reach before but not after (the pool walled the lot off). */
function cutOffWalkable(before: Lot, after: Lot, content: ContentDB): { x: number; z: number; level: number } | null {
  const n = Math.max(before.levels, 1);
  const b = levelReach(before, content, n), a = levelReach(after, content, n);
  for (let l = 0; l < n; l++) {
    const gb = b.grids[l], ga = a.grids[l];
    if (!gb || !ga) continue;
    for (let i = 0; i < gb.occupant.length; i++) {
      // Tiles the pool itself covers are built on, not cut off: only tiles that stay walkable matter.
      if (gb.occupant[i] !== -1 || ga.occupant[i] !== -1 || b.masks[l]![i] !== 1 || a.masks[l]![i] === 1) continue;
      const x = i % gb.width, z = Math.floor(i / gb.width);
      return { x, z, level: l };
    }
  }
  return null;
}

function planBuild(state: WorldState, content: ContentDB, lot: Lot, req: Extract<PoolRequest, { kind: 'pool' }>): Draft {
  const d = newDraft('Build pool', 'There is already a pool there.');
  const style = exteriorOf(content).poolStyles[req.styleId];
  if (!style || style.status !== 'ready') { d.reasons.push('That pool style is not available.'); return d; }
  const rect = { x0: Math.min(req.rect.x0, req.rect.x1), z0: Math.min(req.rect.z0, req.rect.z1), x1: Math.max(req.rect.x0, req.rect.x1), z1: Math.max(req.rect.z0, req.rect.z1) };
  const reasons = rectReasons(state, content, lot, rect);
  if (reasons.length > 0) { d.reasons.push(...reasons); return d; }
  const w = rect.x1 - rect.x0 + 1, h = rect.z1 - rect.z0 + 1;

  const id = `${PENDING_POOL}0`;
  const base: Pool = { id, level: 0, ...rect, styleId: style.id, ladders: [], purchasePrice: chargeFor(state, poolPrice(style.id, rect, content)), boughtAt: state.clock.minutes };
  // find the ladder first (the deck must stay reachable once the water blocks the way)
  const diff: PoolDiff = { pools: [{ id, before: null, after: base }] };
  const nav = reachAfter(lot, content, diff);
  let candidates: PoolLadder[];
  if (req.ladder) {
    if (!isPoolEdgeTile(base, req.ladder.x, req.ladder.z)) { d.reasons.push('A ladder has to sit on the edge of the pool.'); return d; }
    candidates = [{ x: req.ladder.x, z: req.ladder.z, side: sideFor(rect, req.ladder.x, req.ladder.z)! }];
  } else {
    candidates = shortSideLadders(base);
  }
  const ladder = candidates.find((l) => {
    const deck = ladderDeckTile(l);
    return nav.freeDeck(deck.x, deck.z) && nav.reachable(deck.x, deck.z);
  });
  if (!ladder) {
    d.reasons.push(req.ladder ? 'Swimmers need a way in from the deck.' : 'The pool needs a short side with deck space to get in.');
    d.highlight.blocked.push({ kind: 'tile', x: rect.x0, z: rect.z0, reason: 'No way in.' });
    return d;
  }
  base.ladders = [{ ...ladder }];
  d.diff = diff;

  const cut = cutOffWalkable(lot, virtualPoolLot(lot, diff), content);
  if (cut) {
    d.reasons.push('That pool would cut part of the lot off from the street.');
    d.highlight.blocked.push({ kind: 'tile', x: cut.x, z: cut.z, reason: 'Cut off.' });
    return d;
  }

  d.charge = base.purchasePrice ?? 0;
  d.counts.tiles = w * h;
  d.counts.ladders = 1;
  for (const t of poolTiles(base)) d.highlight.tiles.push(t);
  d.highlight.newPools.push(rect);
  d.measure = { areaM2: w * h, text: `${w} x ${h} m (${w * h} m2)` };
  d.label = `${d.charge > 0 ? 'Build' : 'Place'} ${style.name.toLowerCase()} pool (${w} x ${h} m)`;
  return d;
}

/** The edge of a rect a tile sits on. */
function sideFor(r: PoolRect, x: number, z: number): PoolLadder['side'] | null {
  if (!inside(r, x, z)) return null;
  if (z === r.z0) return 'n';
  if (z === r.z1) return 's';
  if (x === r.x0) return 'w';
  if (x === r.x1) return 'e';
  return null;
}

function planErase(state: WorldState, content: ContentDB, lot: Lot, req: Extract<PoolRequest, { kind: 'erasePool' }>): Draft {
  const d = newDraft('Remove pool', 'There is no pool there.');
  let pool: Pool | undefined;
  if (req.poolId) pool = lot.pools?.[req.poolId];
  else if (req.tile) pool = poolsOf(lot).find((p) => poolContains(p, req.tile!.x, req.tile!.z));
  if (!pool) return d;
  if (peopleInside(state, lot, pool).length > 0) { d.reasons.push('Someone is in the pool.'); return d; }
  d.diff.pools.push({ id: pool.id, before: copy(pool), after: null });
  d.highlight.removedPools.push(rectOf(pool));
  d.refund += poolRefund(state, pool, content);
  d.counts.poolsRemoved = 1;
  d.measure = { areaM2: poolWidth(pool) * poolDepth(pool), text: `${poolWidth(pool)} x ${poolDepth(pool)} m` };
  d.label = 'Remove pool';
  return d;
}

function planLadder(lot: Lot, content: ContentDB, req: Extract<PoolRequest, { kind: 'moveLadder' | 'addLadder' | 'removeLadder' }>): Draft {
  const pool = lot.pools?.[req.poolId];
  const labels = { moveLadder: 'Move ladder', addLadder: 'Add ladder', removeLadder: 'Remove ladder' } as const;
  const d = newDraft(labels[req.kind], 'Nothing would change.');
  if (!pool) { d.reasons.push('That pool is gone.'); return d; }
  const after: Pool = copy(pool);
  const tile = req.kind === 'moveLadder' ? req.to : req.tile;
  if (req.kind === 'removeLadder') {
    const at = after.ladders.findIndex((l) => l.x === tile.x && l.z === tile.z);
    if (at < 0) return d;
    if (after.ladders.length <= 1) { d.reasons.push('A pool needs at least one ladder.'); return d; }
    after.ladders.splice(at, 1);
    d.label = 'Remove ladder';
  } else {
    const side = sideFor(rectOf(after), tile.x, tile.z);
    if (!side) { d.reasons.push('A ladder has to sit on the edge of the pool.'); return d; }
    if (after.ladders.some((l) => l.x === tile.x && l.z === tile.z)) return d;
    const ladder: PoolLadder = { x: tile.x, z: tile.z, side };
    const deck = ladderDeckTile(ladder);
    const nav = reachAfter(lot, content, emptyPoolDiff());
    if (!nav.freeDeck(deck.x, deck.z) || !nav.reachable(deck.x, deck.z)) { d.reasons.push('The ladder needs a clear deck tile to climb out onto.'); return d; }
    if (req.kind === 'moveLadder') {
      const at = after.ladders.findIndex((l) => l.x === req.from.x && l.z === req.from.z);
      if (at < 0) return d;
      after.ladders[at] = ladder;
      d.label = 'Move ladder';
    } else {
      after.ladders.push(ladder);
      d.label = 'Add ladder';
    }
  }
  d.diff.pools.push({ id: pool.id, before: copy(pool), after });
  d.counts.ladders = after.ladders.length - pool.ladders.length;
  d.measure = { text: `${after.ladders.length} ladder${after.ladders.length === 1 ? '' : 's'}` };
  return d;
}

// ---------------------------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------------------------

/** Plans a pool operation for a household: validity, reasons, cost, counts, measurement, highlight and the exact diff. Pure. */
export function planPool(state: WorldState, content: ContentDB, lotId: Id, householdId: Id, req: PoolRequest): PoolPlan {
  const access = editAccess(state, lotId, householdId);
  if ('reason' in access) return failPlan([access.reason]);
  const { lot, hh } = access;
  let d: Draft;
  switch (req.kind) {
    case 'pool': d = planBuild(state, content, lot, req); break;
    case 'erasePool': d = planErase(state, content, lot, req); break;
    case 'moveLadder':
    case 'addLadder':
    case 'removeLadder': d = planLadder(lot, content, req); break;
  }
  const base = (reasons: string[], noop: boolean, conflicts: BuildConflict[] = []): PoolPlan => ({
    ok: reasons.length === 0, reasons, noop, label: d.label, cost: d.charge - d.refund, charge: d.charge, refund: d.refund, counts: d.counts, measure: d.measure,
    highlight: { ...d.highlight, blocked: [...d.highlight.blocked, ...conflicts] }, diff: d.diff,
  });
  if (d.reasons.length > 0) return base([...new Set(d.reasons)], false);
  if (isEmptyPoolDiff(d.diff)) return base([d.emptyReason], true);
  const cost = d.charge - d.refund;
  if (cost > hh.funds) return base([NOT_ENOUGH], false);
  return base([], false);
}
