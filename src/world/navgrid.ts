// Navigation grid for one lot level: which tiles furniture blocks and what stands on every grid edge
// (nothing, a wall or a door). Shared by LotNav (routing), placement (access checks) and the starter lots.
// Pure data and functions; no state mutation, no rendering.
//
// Movement rules (docs/ARCHITECTURE.md, brief section 21):
// - A tile is walkable when it is on the lot and no blocking floor object covers it. People never block.
// - An orthogonal step crosses one edge: allowed when the edge has no wall, or the wall holds a door.
//   Windows and solid walls block.
// - A diagonal step is allowed only when both orthogonal neighbours are walkable and all four edges around
//   the shared corner are completely open (no wall, no door frame), so no wall corner is ever cut.

import type { ContentDB } from '../content/types';
import { blockingTiles } from '../core/geometry';
import type { Tile } from '../core/nav';
import { tileKey } from '../core/ids';
import type { Id, Lot } from '../core/types';
import { fenceEdgeState } from './fences';
import { stairHoles } from './levels';
import { poolTiles, poolsOf } from './pools';
import { openingEdgeKeys } from './walls';

/** Occupant id of tiles of an upper level that have no floor (or a stairwell hole): nobody can stand there. */
export const VOID_ID = '__void__';

/** Edge states stored in NavGrid.hEdges / vEdges. */
export const EDGE_OPEN = 0;
export const EDGE_WALL = 1;
export const EDGE_DOOR = 2;

export interface NavGrid {
  readonly width: number;
  readonly depth: number;
  readonly level: number;
  /** Per tile (index z * width + x): index into `occupantIds` of the blocking object, -1 = free. */
  readonly occupant: Int32Array;
  readonly occupantIds: readonly Id[];
  /** 'h' edges: index z * width + x for z in [0, depth]. */
  readonly hEdges: Uint8Array;
  /** 'v' edges: index z * (width + 1) + x for x in [0, width]. */
  readonly vEdges: Uint8Array;
}

export interface GridOverrides {
  /** Object treated as absent (e.g. the object being moved). */
  ignoreObjectId?: Id;
  /** Extra blocking footprint (e.g. the object being placed) and the id reported for its tiles. */
  extra?: { id: Id; tiles: readonly Tile[] };
}

/** True when the object definition blocks walking on its footprint. Only floor-layer objects can block. */
export function blocksMovement(def: { layer: string; blocksMovement: boolean }): boolean {
  return def.layer === 'floor' && def.blocksMovement;
}

/** Builds the navigation grid of one lot level. Unknown object definitions block their origin tile. */
export function buildNavGrid(lot: Lot, content: ContentDB, level: number, o: GridOverrides = {}): NavGrid {
  const W = lot.width, D = lot.depth;
  const occupant = new Int32Array(W * D).fill(-1);
  const occupantIds: Id[] = [];
  const hEdges = new Uint8Array(W * (D + 1));
  const vEdges = new Uint8Array((W + 1) * D);

  const block = (id: Id, tiles: readonly Tile[]) => {
    const idx = occupantIds.length;
    occupantIds.push(id);
    for (const t of tiles) if (t.x >= 0 && t.z >= 0 && t.x < W && t.z < D) occupant[t.z * W + t.x] = idx;
  };

  const objects = Object.values(lot.objects).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const obj of objects) {
    if (obj.level !== level || obj.id === o.ignoreObjectId) continue;
    const def = content.objects[obj.defId];
    if (!def) { block(obj.id, [{ x: obj.x, z: obj.z }]); continue; }
    if (blocksMovement(def)) block(obj.id, blockingTiles(obj.x, obj.z, def, obj.rot));
  }
  if (o.extra) block(o.extra.id, o.extra.tiles);
  // Milestone 12: pool water is never walkable; the deck around it is (people enter only at a ladder, sim/pool.ts).
  if (level === 0) for (const pool of poolsOf(lot)) block(`pool:${pool.id}`, poolTiles(pool));
  // Milestone 9: above the ground floor only floored tiles can be walked on (balconies included, stairwells not)
  if (level >= 1) {
    const holes = stairHoles(lot, content, level);
    const voidIdx = occupantIds.length;
    occupantIds.push(VOID_ID);
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        if (lot.floors[tileKey(level, x, z)] === undefined || holes.has(`${x},${z}`)) occupant[z * W + x] = voidIdx;
      }
    }
  }

  const doors = new Set<string>();
  for (const op of Object.values(lot.openings)) if (content.openings[op.defId]?.kind === 'door') for (const k of openingEdgeKeys(op)) doors.add(k);
  for (const wall of Object.values(lot.walls)) {
    if (wall.level !== level) continue;
    const state = doors.has(wall.id) ? EDGE_DOOR : EDGE_WALL;
    if (wall.dir === 'h') {
      if (wall.x >= 0 && wall.x < W && wall.z >= 0 && wall.z <= D) hEdges[wall.z * W + wall.x] = state;
    } else if (wall.x >= 0 && wall.x <= W && wall.z >= 0 && wall.z < D) {
      vEdges[wall.z * (W + 1) + wall.x] = state;
    }
  }
  // Milestone 9: a fence is a wall edge and a gate behaves like a door (a wall on the same edge wins)
  for (const f of Object.values(lot.fences ?? {})) {
    if (f.level !== level) continue;
    const fs = fenceEdgeState(lot, level, f.dir, f.x, f.z);
    if (fs === 'open') continue;
    const state = fs === 'gate' ? EDGE_DOOR : EDGE_WALL;
    if (f.dir === 'h') {
      if (f.x >= 0 && f.x < W && f.z >= 0 && f.z <= D && hEdges[f.z * W + f.x] === EDGE_OPEN) hEdges[f.z * W + f.x] = state;
    } else if (f.x >= 0 && f.x <= W && f.z >= 0 && f.z < D && vEdges[f.z * (W + 1) + f.x] === EDGE_OPEN) {
      vEdges[f.z * (W + 1) + f.x] = state;
    }
  }
  return { width: W, depth: D, level, occupant, occupantIds, hEdges, vEdges };
}

export function inGrid(g: NavGrid, x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < g.width && z < g.depth;
}

/** On the grid and not covered by a blocking object. */
export function isFree(g: NavGrid, x: number, z: number): boolean {
  return inGrid(g, x, z) && g.occupant[z * g.width + x] === -1;
}

/** Id of the blocking object covering the tile, if any. */
export function occupantAt(g: NavGrid, x: number, z: number): Id | undefined {
  if (!inGrid(g, x, z)) return undefined;
  const i = g.occupant[z * g.width + x] ?? -1;
  return i >= 0 ? g.occupantIds[i] : undefined;
}

/** State of the edge between two orthogonally adjacent tiles (EDGE_WALL for non-adjacent pairs). */
export function edgeState(g: NavGrid, a: Tile, b: Tile): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  if (dx === 0 && Math.abs(dz) === 1) {
    const z = Math.max(a.z, b.z);
    if (a.x < 0 || a.x >= g.width || z < 0 || z > g.depth) return EDGE_WALL;
    return g.hEdges[z * g.width + a.x] ?? EDGE_WALL;
  }
  if (dz === 0 && Math.abs(dx) === 1) {
    const x = Math.max(a.x, b.x);
    if (a.z < 0 || a.z >= g.depth || x < 0 || x > g.width) return EDGE_WALL;
    return g.vEdges[a.z * (g.width + 1) + x] ?? EDGE_WALL;
  }
  return EDGE_WALL;
}

/** People can cross the edge (no wall, or a door). */
export function edgePassable(g: NavGrid, a: Tile, b: Tile): boolean {
  return edgeState(g, a, b) !== EDGE_WALL;
}

/** The edge holds no wall at all (used for corner rules and "not through a wall" checks). */
export function edgeOpen(g: NavGrid, a: Tile, b: Tile): boolean {
  return edgeState(g, a, b) === EDGE_OPEN;
}

export type FreeFn = (x: number, z: number) => boolean;

/**
 * True when a person can step from `from` to the 8-neighbour `to`. `from` itself need not be walkable
 * (someone getting up from a chair stands on the chair's tile); `to` must be.
 */
export function canStepGrid(g: NavGrid, from: Tile, to: Tile, free: FreeFn = (x, z) => isFree(g, x, z)): boolean {
  const dx = to.x - from.x, dz = to.z - from.z;
  if ((dx === 0 && dz === 0) || Math.abs(dx) > 1 || Math.abs(dz) > 1) return false;
  if (!inGrid(g, from.x, from.z) || !free(to.x, to.z)) return false;
  if (dx === 0 || dz === 0) return edgePassable(g, from, to);
  const n1 = { x: from.x + dx, z: from.z };
  const n2 = { x: from.x, z: from.z + dz };
  return free(n1.x, n1.z) && free(n2.x, n2.z)
    && edgeOpen(g, from, n1) && edgeOpen(g, n1, to) && edgeOpen(g, from, n2) && edgeOpen(g, n2, to);
}

const ORTHO: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/** Fixed neighbour order (N, E, S, W, NE, SE, SW, NW) for deterministic searches. */
const DIRS8: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

/**
 * Tiles reachable from `start` (4-neighbour flood fill; diagonal steps never add connectivity because
 * they require both orthogonal neighbours). Returns a mask indexed z * width + x. The start tile(s) are
 * included even when not walkable.
 */
export function reachableMask(g: NavGrid, start: Tile | readonly Tile[], free: FreeFn = (x, z) => isFree(g, x, z)): Uint8Array {
  const W = g.width;
  const mask = new Uint8Array(W * g.depth);
  const queue: number[] = [];
  for (const s of Array.isArray(start) ? (start as readonly Tile[]) : [start as Tile]) {
    if (!inGrid(g, s.x, s.z) || mask[s.z * W + s.x]) continue;
    mask[s.z * W + s.x] = 1;
    queue.push(s.z * W + s.x);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi] as number;
    const x = i % W, z = (i - x) / W;
    for (const [dx, dz] of ORTHO) {
      const nx = x + dx, nz = z + dz;
      if (!free(nx, nz)) continue;
      const j = nz * W + nx;
      if (mask[j]) continue;
      if (!edgePassable(g, { x, z }, { x: nx, z: nz })) continue;
      mask[j] = 1;
      queue.push(j);
    }
  }
  return mask;
}

const SQRT2 = Math.SQRT2;

function octile(ax: number, az: number, bx: number, bz: number): number {
  const dx = Math.abs(ax - bx), dz = Math.abs(az - bz);
  return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
}

/** Binary min-heap ordered by (f, h, insertion sequence) so equal-cost searches resolve identically. */
export class OpenHeap {
  private f: number[] = [];
  private h: number[] = [];
  private s: number[] = [];
  private v: number[] = [];
  get size(): number { return this.v.length; }

  push(f: number, h: number, s: number, v: number): void {
    this.f.push(f); this.h.push(h); this.s.push(s); this.v.push(v);
    let i = this.v.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.v[0] as number;
    const last = this.v.length - 1;
    this.swap(0, last);
    this.f.pop(); this.h.pop(); this.s.pop(); this.v.pop();
    let i = 0;
    const n = this.v.length;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    const fa = this.f[a] as number, fb = this.f[b] as number;
    if (fa !== fb) return fa < fb;
    const ha = this.h[a] as number, hb = this.h[b] as number;
    if (ha !== hb) return ha < hb;
    return (this.s[a] as number) < (this.s[b] as number);
  }

  private swap(a: number, b: number): void {
    for (const arr of [this.f, this.h, this.s, this.v]) {
      const t = arr[a] as number;
      arr[a] = arr[b] as number;
      arr[b] = t;
    }
  }
}

/**
 * Grid A* with 8 directions (orthogonal cost 1, diagonal sqrt 2) and an octile heuristic to the nearest
 * goal. Returns the tiles after `from` up to the reached goal, [] when `from` is a goal, null when no goal
 * is reachable. Goals that are not walkable are ignored.
 */
export function findPathGrid(g: NavGrid, from: Tile, goals: readonly Tile[], free: FreeFn = (x, z) => isFree(g, x, z)): Tile[] | null {
  const W = g.width, N = W * g.depth;
  if (!inGrid(g, from.x, from.z)) return null;
  for (const t of goals) if (t.x === from.x && t.z === from.z) return [];
  const goalList: Tile[] = [];
  const isGoal = new Uint8Array(N);
  for (const t of goals) {
    if (!free(t.x, t.z)) continue;
    const i = t.z * W + t.x;
    if (isGoal[i]) continue;
    isGoal[i] = 1;
    goalList.push({ x: t.x, z: t.z });
  }
  if (goalList.length === 0) return null;
  const heuristic = (x: number, z: number) => {
    let best = Infinity;
    for (const t of goalList) best = Math.min(best, octile(x, z, t.x, t.z));
    return best;
  };

  const gScore = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open = new OpenHeap();
  let seq = 0;
  const start = from.z * W + from.x;
  gScore[start] = 0;
  const h0 = heuristic(from.x, from.z);
  open.push(h0, h0, seq++, start);

  while (open.size > 0) {
    const i = open.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (isGoal[i]) return reconstruct(came, i, start, W);
    const x = i % W, z = (i - x) / W;
    const gi = gScore[i] as number;
    for (const [dx, dz] of DIRS8) {
      const nx = x + dx, nz = z + dz;
      if (!canStepGrid(g, { x, z }, { x: nx, z: nz }, free)) continue;
      const j = nz * W + nx;
      if (closed[j]) continue;
      const ng = gi + (dx !== 0 && dz !== 0 ? SQRT2 : 1);
      if (ng >= (gScore[j] as number)) continue;
      gScore[j] = ng;
      came[j] = i;
      const h = heuristic(nx, nz);
      open.push(ng + h, h, seq++, j);
    }
  }
  return null;
}

function reconstruct(came: Int32Array, goal: number, start: number, W: number): Tile[] {
  const out: Tile[] = [];
  for (let i = goal; i !== start && i !== -1; i = came[i] as number) out.push({ x: i % W, z: Math.floor(i / W) });
  out.reverse();
  return out;
}
