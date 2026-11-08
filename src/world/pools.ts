// Milestone 12: pure helpers for pools (Lot.pools). No state is changed here. The simulation, the navigation grid,
// the build plans and the renderer all share these so a pool is the same rectangle everywhere.

import type { Tile } from '../core/nav';
import type { Lot, Pool, PoolLadder } from '../core/types';
import { inLot } from './lots';

/** Smallest pool: two tiles on the short side, three on the long side. */
export const POOL_MIN_SHORT = 2;
export const POOL_MIN_LONG = 3;
/** Largest pool edge, in tiles. */
export const POOL_MAX_EDGE = 12;

export function poolWidth(pool: Pick<Pool, 'x0' | 'x1'>): number { return pool.x1 - pool.x0 + 1; }
export function poolDepth(pool: Pick<Pool, 'z0' | 'z1'>): number { return pool.z1 - pool.z0 + 1; }
export function poolTileCount(pool: Pick<Pool, 'x0' | 'x1' | 'z0' | 'z1'>): number { return poolWidth(pool) * poolDepth(pool); }

export function poolContains(pool: Pick<Pool, 'x0' | 'x1' | 'z0' | 'z1'>, x: number, z: number): boolean {
  return x >= pool.x0 && x <= pool.x1 && z >= pool.z0 && z <= pool.z1;
}

export function poolTiles(pool: Pool): Tile[] {
  const out: Tile[] = [];
  for (let z = pool.z0; z <= pool.z1; z++) for (let x = pool.x0; x <= pool.x1; x++) out.push({ x, z });
  return out;
}

/** Every pool on a lot (pools are ground level only). Stable by id. */
export function poolsOf(lot: Lot): Pool[] {
  return Object.values(lot.pools ?? {}).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The pool covering a tile, or undefined. */
export function poolAt(lot: Lot, level: number, x: number, z: number): Pool | undefined {
  if (level !== 0) return undefined;
  for (const pool of Object.values(lot.pools ?? {})) {
    if (pool.level === 0 && poolContains(pool, x, z)) return pool;
  }
  return undefined;
}

/** The pool with this id. */
export function poolById(lot: Lot, id: string | undefined): Pool | undefined {
  return id ? lot.pools?.[id] : undefined;
}

/** Middle water tile of a pool (where autonomy and the context menu point). */
export function poolCenter(pool: Pool): Tile {
  return { x: Math.floor((pool.x0 + pool.x1) / 2), z: Math.floor((pool.z0 + pool.z1) / 2) };
}

/** The edge of the rectangle a water tile sits on (north and west win when a 1-tile pool would touch two). */
export function poolSideAt(pool: Pick<Pool, 'x0' | 'x1' | 'z0' | 'z1'>, x: number, z: number): PoolLadder['side'] | null {
  if (x < pool.x0 || x > pool.x1 || z < pool.z0 || z > pool.z1) return null;
  if (z === pool.z0) return 'n';
  if (z === pool.z1) return 's';
  if (x === pool.x0) return 'w';
  return 'e';
}

export function isPoolEdgeTile(pool: Pool, x: number, z: number): boolean {
  return poolContains(pool, x, z) && (x === pool.x0 || x === pool.x1 || z === pool.z0 || z === pool.z1);
}

/** The dry deck tile next to a ladder (the tile a swimmer climbs out onto). */
export function ladderDeckTile(ladder: Pick<PoolLadder, 'x' | 'z' | 'side'>): Tile {
  switch (ladder.side) {
    case 'n': return { x: ladder.x, z: ladder.z - 1 };
    case 's': return { x: ladder.x, z: ladder.z + 1 };
    case 'w': return { x: ladder.x - 1, z: ladder.z };
    case 'e': return { x: ladder.x + 1, z: ladder.z };
  }
}

/** The water tile a ladder drops into (adjacent to the ladder on the pool side). */
export function ladderWaterTile(ladder: Pick<PoolLadder, 'x' | 'z' | 'side'>): Tile {
  switch (ladder.side) {
    case 'n': return { x: ladder.x, z: ladder.z + 1 };
    case 's': return { x: ladder.x, z: ladder.z - 1 };
    case 'w': return { x: ladder.x + 1, z: ladder.z };
    case 'e': return { x: ladder.x - 1, z: ladder.z };
  }
}

/** The ladder on a pool edge tile, or undefined. */
export function ladderAt(pool: Pool, x: number, z: number): PoolLadder | undefined {
  return pool.ladders.find((l) => l.x === x && l.z === z);
}

/** Candidate ladders on the two short sides, middle tile first (the auto-placement preference). */
export function shortSideLadders(pool: Pool): PoolLadder[] {
  const out: PoolLadder[] = [];
  const w = poolWidth(pool), d = poolDepth(pool);
  const midX = pool.x0 + Math.floor((w - 1) / 2);
  const midZ = pool.z0 + Math.floor((d - 1) / 2);
  if (w <= d) {
    // north and south are the short sides
    for (const x of orderFrom(midX, pool.x0, pool.x1)) {
      out.push({ x, z: pool.z0, side: 'n' });
      out.push({ x, z: pool.z1, side: 's' });
    }
  } else {
    for (const z of orderFrom(midZ, pool.z0, pool.z1)) {
      out.push({ x: pool.x0, z, side: 'w' });
      out.push({ x: pool.x1, z, side: 'e' });
    }
  }
  return out;
}

/** [middle, middle-1, middle+1, ...] clamped into [lo, hi]. */
function orderFrom(mid: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= hi - lo; i++) {
    if (i === 0) out.push(mid);
    else {
      if (mid - i >= lo) out.push(mid - i);
      if (mid + i <= hi) out.push(mid + i);
    }
  }
  return out;
}

/** All ladders a player may choose on the pool's edge (for move/add). */
export function edgeLadders(pool: Pool): PoolLadder[] {
  const out: PoolLadder[] = [];
  for (let x = pool.x0; x <= pool.x1; x++) {
    out.push({ x, z: pool.z0, side: 'n' });
    if (pool.z1 !== pool.z0) out.push({ x, z: pool.z1, side: 's' });
  }
  for (let z = pool.z0 + 1; z < pool.z1; z++) {
    out.push({ x: pool.x0, z, side: 'w' });
    if (pool.x1 !== pool.x0) out.push({ x: pool.x1, z, side: 'e' });
  }
  return out;
}

/** True when the tile is on the lot (used by plan validation). */
export function ladderOnLot(lot: Lot, ladder: PoolLadder): boolean {
  return inLot(lot, ladder.x, ladder.z);
}

/** Ladders with a dry deck tile on the lot, nearest first to a point (swimmers exit here). */
export function usableLadders(lot: Lot, pool: Pool, near?: Tile): PoolLadder[] {
  const usable = pool.ladders.filter((l) => {
    const d = ladderDeckTile(l);
    return inLot(lot, d.x, d.z);
  });
  if (!near) return usable;
  return usable.slice().sort((a, b) => {
    const da = Math.abs(ladderDeckTile(a).x - near.x) + Math.abs(ladderDeckTile(a).z - near.z);
    const db = Math.abs(ladderDeckTile(b).x - near.x) + Math.abs(ladderDeckTile(b).z - near.z);
    return da - db;
  });
}

/** True when a tile is covered by any pool on the lot. */
export function isWaterTile(lot: Lot, level: number, x: number, z: number): boolean {
  return poolAt(lot, level, x, z) !== undefined;
}

/**
 * Milestone 13: a pool whose water touches this dry tile on a side (the tile is on the deck, beside the water) - the "shallow
 * edge" where a toddler may paddle. Undefined for water tiles and tiles away from a pool.
 */
export function poolBesideTile(lot: Lot, level: number, x: number, z: number): Pool | undefined {
  if (level !== 0 || isWaterTile(lot, level, x, z)) return undefined;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const p = poolAt(lot, level, x + dx, z + dz);
    if (p) return p;
  }
  return undefined;
}

/** The dry tile beside the pool nearest to (x, z), for a toddler who pointed at water: null when the pool is walled in. */
export function nearestPoolEdgeTile(lot: Lot, pool: Pool, x: number, z: number): Tile | null {
  let best: Tile | null = null, bestD = Infinity;
  for (let tz = pool.z0 - 1; tz <= pool.z1 + 1; tz++) {
    for (let tx = pool.x0 - 1; tx <= pool.x1 + 1; tx++) {
      if (tx < 0 || tz < 0 || tx >= lot.width || tz >= lot.depth || !poolBesideTile(lot, 0, tx, tz)) continue;
      const d = (tx - x) ** 2 + (tz - z) ** 2;
      if (d < bestD) { bestD = d; best = { x: tx, z: tz }; }
    }
  }
  return best;
}
