// Milestone 9: navigation across levels. One graph over (level, tile) nodes: every level's grid (world/navgrid.ts) plus the
// staircase links (world/levels.ts StairLink) between a foot tile and a head tile one level up. Pure functions over grids; LotNav
// (world/nav.ts) caches the grids and links and calls these.

import type { Tile } from '../core/nav';
import { linkNodes, type StairLink } from './levels';
import { canStepGrid, edgePassable, isFree, OpenHeap, type FreeFn, type NavGrid } from './navgrid';

const SQRT2 = Math.SQRT2;
const ORTHO: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIRS8: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

export interface LevelGraph {
  grids: ReadonlyArray<NavGrid>;
  /** Links whose foot and head tiles are both walkable. */
  links: ReadonlyArray<StairLink>;
}

/** Keeps the links that can actually be walked (both ends free). */
export function usableLinks(grids: ReadonlyArray<NavGrid>, links: readonly StairLink[]): StairLink[] {
  return links.filter((l) => {
    const lo = grids[l.level], hi = grids[l.level + 1];
    return !!lo && !!hi && isFree(lo, l.foot.x, l.foot.z) && isFree(hi, l.head.x, l.head.z);
  });
}

/** node id = level * (W * D) + z * W + x */
function nodeId(g: NavGrid, level: number, x: number, z: number): number { return level * g.width * g.depth + z * g.width + x; }

function linkMap(graph: LevelGraph): Map<number, Array<{ to: number; link: StairLink; up: boolean }>> {
  const out = new Map<number, Array<{ to: number; link: StairLink; up: boolean }>>();
  const g0 = graph.grids[0];
  if (!g0) return out;
  const add = (from: number, e: { to: number; link: StairLink; up: boolean }) => { const l = out.get(from); if (l) l.push(e); else out.set(from, [e]); };
  for (const link of graph.links) {
    const a = nodeId(g0, link.level, link.foot.x, link.foot.z);
    const b = nodeId(g0, link.level + 1, link.head.x, link.head.z);
    add(a, { to: b, link, up: true });
    add(b, { to: a, link, up: false });
  }
  return out;
}

/**
 * Tiles of every level reachable from the start nodes (4-neighbour flood fill on each grid, plus the staircase links). Returns
 * one mask per grid, indexed z * width + x. Start tiles are included even when they are not walkable.
 */
export function reachableAll(graph: LevelGraph, starts: ReadonlyArray<Tile & { level: number }>, free?: (level: number) => FreeFn): Uint8Array[] {
  const grids = graph.grids;
  const g0 = grids[0];
  const masks = grids.map((g) => new Uint8Array(g.width * g.depth));
  if (!g0) return masks;
  const W = g0.width, N = W * g0.depth;
  const links = linkMap(graph);
  const queue: number[] = [];
  for (const s of starts) {
    const g = grids[s.level];
    if (!g || s.x < 0 || s.z < 0 || s.x >= g.width || s.z >= g.depth) continue;
    const m = masks[s.level]!;
    if (m[s.z * W + s.x]) continue;
    m[s.z * W + s.x] = 1;
    queue.push(nodeId(g0, s.level, s.x, s.z));
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const id = queue[qi]!;
    const level = Math.floor(id / N), i = id % N;
    const g = grids[level]!;
    const x = i % W, z = (i - x) / W;
    const f = free ? free(level) : (px: number, pz: number) => isFree(g, px, pz);
    for (const [dx, dz] of ORTHO) {
      const nx = x + dx, nz = z + dz;
      if (!f(nx, nz)) continue;
      const j = nz * W + nx;
      const m = masks[level]!;
      if (m[j]) continue;
      if (!edgePassable(g, { x, z }, { x: nx, z: nz })) continue;
      m[j] = 1;
      queue.push(nodeId(g0, level, nx, nz));
    }
    for (const e of links.get(id) ?? []) {
      const tl = Math.floor(e.to / N), ti = e.to % N;
      const m = masks[tl]!;
      if (m[ti]) continue;
      m[ti] = 1;
      queue.push(e.to);
    }
  }
  return masks;
}

export interface MultiGoal extends Tile { level: number }

/**
 * A* over the level graph (8 directions inside a level, staircase links between levels). Returns the nodes after `from` up to the
 * reached goal ([] when `from` is a goal, null when none is reachable). Nodes carry `level`; stair cells carry `rise`.
 */
export function findPathAll(
  graph: LevelGraph, from: MultiGoal, goals: readonly MultiGoal[], free: (level: number) => FreeFn,
): Tile[] | null {
  const grids = graph.grids;
  const g0 = grids[0];
  if (!g0) return null;
  const W = g0.width, N = W * g0.depth;
  const total = N * grids.length;
  const fromGrid = grids[from.level];
  if (!fromGrid || from.x < 0 || from.z < 0 || from.x >= W || from.z >= g0.depth) return null;
  for (const t of goals) if (t.level === from.level && t.x === from.x && t.z === from.z) return [];
  const isGoal = new Uint8Array(total);
  const goalList: MultiGoal[] = [];
  for (const t of goals) {
    const g = grids[t.level];
    if (!g || !free(t.level)(t.x, t.z)) continue;
    const id = nodeId(g0, t.level, t.x, t.z);
    if (isGoal[id]) continue;
    isGoal[id] = 1;
    goalList.push(t);
  }
  if (goalList.length === 0) return null;
  const links = linkMap(graph);
  const heuristic = (x: number, z: number) => {
    let best = Infinity;
    for (const t of goalList) {
      const dx = Math.abs(x - t.x), dz = Math.abs(z - t.z);
      best = Math.min(best, dx + dz + (SQRT2 - 2) * Math.min(dx, dz));
    }
    return best;
  };
  const gScore = new Float64Array(total).fill(Infinity);
  const came = new Int32Array(total).fill(-1);
  const via = new Map<number, { link: StairLink; up: boolean }>();
  const closed = new Uint8Array(total);
  const open = new OpenHeap();
  let seq = 0;
  const start = nodeId(g0, from.level, from.x, from.z);
  gScore[start] = 0;
  const h0 = heuristic(from.x, from.z);
  open.push(h0, h0, seq++, start);

  while (open.size > 0) {
    const id = open.pop();
    if (closed[id]) continue;
    closed[id] = 1;
    if (isGoal[id]) return reconstruct(id);
    const level = Math.floor(id / N), i = id % N;
    const g = grids[level]!;
    const x = i % W, z = (i - x) / W;
    const gi = gScore[id] as number;
    const f = free(level);
    for (const [dx, dz] of DIRS8) {
      const nx = x + dx, nz = z + dz;
      if (!canStepGrid(g, { x, z }, { x: nx, z: nz }, f)) continue;
      const j = level * N + nz * W + nx;
      if (closed[j]) continue;
      const ng = gi + (dx !== 0 && dz !== 0 ? SQRT2 : 1);
      if (ng >= (gScore[j] as number)) continue;
      gScore[j] = ng;
      came[j] = id;
      via.delete(j);
      const h = heuristic(nx, nz);
      open.push(ng + h, h, seq++, j);
    }
    for (const e of links.get(id) ?? []) {
      if (closed[e.to]) continue;
      const tl = Math.floor(e.to / N), ti = e.to % N;
      if (!free(tl)(ti % W, Math.floor(ti / W))) continue;
      const ng = gi + e.link.cost;
      if (ng >= (gScore[e.to] as number)) continue;
      gScore[e.to] = ng;
      came[e.to] = id;
      via.set(e.to, { link: e.link, up: e.up });
      const h = heuristic(ti % W, Math.floor(ti / W));
      open.push(ng + h, h, seq++, e.to);
    }
  }
  return null;

  function reconstruct(goal: number): Tile[] {
    const chain: number[] = [];
    for (let id = goal; id !== start && id !== -1; id = came[id] as number) chain.push(id);
    chain.reverse();
    const out: Tile[] = [];
    for (const id of chain) {
      const level = Math.floor(id / N), i = id % N;
      const l = via.get(id);
      if (l) out.push(...linkNodes(l.link, l.up));
      else out.push({ x: i % W, z: Math.floor(i / W), level });
    }
    return out;
  }
}
