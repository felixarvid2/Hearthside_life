// Stable room identities and room outlines for the Build mode UI.
//
// computeRooms() (./rooms.ts) numbers rooms by position, so ids shift whenever another room appears earlier in
// the lot. RoomTracker keeps a runtime-only `uid` per room: after every change the new rooms are matched to the
// previous ones by shared tiles, so a room that did not change keeps its uid (and a room that was only resized,
// or that lost a part to a new dividing wall, keeps the uid of its biggest remaining part). Finishes never need
// tracking: they live on wall sides and floor tiles, which a room merely observes.
//
// roomOutlines() turns a room into closed vertex loops (grid vertices, collinear points merged) for highlighting.

import type { Tile } from '../core/nav';
import type { Lot } from '../core/types';
import { computeRooms, type Room } from './rooms';

export interface TrackedRoom extends Room {
  /** Runtime identity that survives edits that do not change the room (not saved). */
  uid: string;
}

/** A grid vertex (corner between tiles), in tile units. */
export interface Vertex { x: number; z: number }

export interface RoomDelta {
  /** uids present after the change and not before. */
  created: string[];
  /** uids present before the change and not after. */
  removed: string[];
  /** uids present before and after (the room may have been resized). */
  kept: string[];
}

export class RoomTracker {
  private last = new Map<string, TrackedRoom[]>();
  private counter = 0;

  /** Forget everything (new game or load). */
  reset(): void { this.last.clear(); this.counter = 0; }

  /** The rooms of a lot level as last computed by update() (empty before the first update). */
  current(lotId: string, level: number): TrackedRoom[] { return this.last.get(`${lotId}#${level}`) ?? []; }

  /** Recomputes the rooms of a lot level, matching them to the previous result. */
  update(lot: Lot, level: number): TrackedRoom[] {
    const key = `${lot.id}#${level}`;
    const prev = this.last.get(key) ?? [];
    const next = computeRooms(lot, level);
    const out = assignUids(prev, next, () => `room_${(this.counter++).toString(36)}`);
    this.last.set(key, out);
    return out;
  }

  /** Which uids appeared, disappeared or stayed between two results of update(). */
  static delta(before: readonly TrackedRoom[], after: readonly TrackedRoom[]): RoomDelta {
    const b = new Set(before.map((r) => r.uid));
    const a = new Set(after.map((r) => r.uid));
    return {
      created: [...a].filter((u) => !b.has(u)),
      removed: [...b].filter((u) => !a.has(u)),
      kept: [...a].filter((u) => b.has(u)),
    };
  }
}

function assignUids(prev: readonly TrackedRoom[], next: readonly Room[], fresh: () => string): TrackedRoom[] {
  const owner = new Map<string, number>(); // tile key -> index in prev
  prev.forEach((r, i) => { for (const t of r.tiles) owner.set(`${t.x},${t.z}`, i); });
  // overlap counts per (new room, old room)
  const pairs: Array<{ n: number; ni: number; pi: number }> = [];
  next.forEach((r, ni) => {
    const counts = new Map<number, number>();
    for (const t of r.tiles) {
      const pi = owner.get(`${t.x},${t.z}`);
      if (pi !== undefined) counts.set(pi, (counts.get(pi) ?? 0) + 1);
    }
    for (const [pi, n] of counts) pairs.push({ n, ni, pi });
  });
  // biggest overlap first; an identical room therefore always claims its own uid; ties resolve by position
  pairs.sort((a, b) => b.n - a.n || a.ni - b.ni || a.pi - b.pi);
  const uidOf = new Array<string | undefined>(next.length).fill(undefined);
  const taken = new Set<number>();
  for (const p of pairs) {
    if (uidOf[p.ni] !== undefined || taken.has(p.pi)) continue;
    uidOf[p.ni] = prev[p.pi]!.uid;
    taken.add(p.pi);
  }
  return next.map((r, i) => ({ ...r, uid: uidOf[i] ?? fresh() }));
}

/**
 * Closed outlines of a room as vertex loops in grid vertices (collinear points merged). The first loop is
 * the outer boundary when the room has no holes; a room around a pillar or an enclosed yard has more loops.
 * Loops run clockwise as seen from above for outer boundaries (+x east, +z south) and the other way for holes.
 */
export function roomOutlines(tiles: readonly Tile[]): Vertex[][] {
  const inRoom = new Set(tiles.map((t) => `${t.x},${t.z}`));
  const has = (x: number, z: number) => inRoom.has(`${x},${z}`);
  // directed boundary edges with the room on the right-hand side (clockwise outer loops)
  const next = new Map<string, Vertex[]>();
  const add = (a: Vertex, b: Vertex) => {
    const k = `${a.x},${a.z}`;
    const list = next.get(k);
    if (list) list.push(b); else next.set(k, [b]);
  };
  for (const t of tiles) {
    const { x, z } = t;
    if (!has(x, z - 1)) add({ x, z }, { x: x + 1, z }); // north edge, going east
    if (!has(x + 1, z)) add({ x: x + 1, z }, { x: x + 1, z: z + 1 }); // east edge, going south
    if (!has(x, z + 1)) add({ x: x + 1, z: z + 1 }, { x, z: z + 1 }); // south edge, going west
    if (!has(x - 1, z)) add({ x, z: z + 1 }, { x, z }); // west edge, going north
  }
  const loops: Vertex[][] = [];
  const used = new Set<string>();
  const eid = (a: Vertex, b: Vertex) => `${a.x},${a.z}>${b.x},${b.z}`;
  const starts: Vertex[] = [...next.keys()].map(parseKey).sort((p, q) => p.z - q.z || p.x - q.x);
  for (const start of starts) {
    for (const first of next.get(`${start.x},${start.z}`)!) {
      if (used.has(eid(start, first))) continue;
      const loop: Vertex[] = [];
      let from = start;
      let to = first;
      for (;;) {
        used.add(eid(from, to));
        loop.push(from);
        if (to.x === start.x && to.z === start.z) break;
        const dir = { dx: to.x - from.x, dz: to.z - from.z };
        const options = (next.get(`${to.x},${to.z}`) ?? []).filter((o) => !used.has(eid(to, o)));
        if (options.length === 0) break;
        // at a pinch point (two loops touching at a vertex) turn right first so loops stay simple
        options.sort((p, q) => turnRank(dir, p, to) - turnRank(dir, q, to));
        from = to;
        to = options[0]!;
      }
      loops.push(simplify(loop));
    }
  }
  return loops.filter((l) => l.length >= 4);
}

function parseKey(k: string): Vertex {
  const [x, z] = k.split(',').map(Number) as [number, number];
  return { x, z };
}

/** Rank of a turn: right turn 0, straight 1, left 2 (with +z pointing down the screen). */
function turnRank(prev: { dx: number; dz: number }, to: Vertex, from: Vertex): number {
  const dx = to.x - from.x, dz = to.z - from.z;
  const cross = prev.dx * dz - prev.dz * dx;
  return cross > 0 ? 0 : cross === 0 ? 1 : 2;
}

function simplify(loop: Vertex[]): Vertex[] {
  const n = loop.length;
  const out: Vertex[] = [];
  for (let i = 0; i < n; i++) {
    const a = loop[(i + n - 1) % n]!, b = loop[i]!, c = loop[(i + 1) % n]!;
    if ((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x) !== 0) out.push({ x: b.x, z: b.z });
  }
  return out;
}

/** Area of a room in square metres (one per tile). */
export function roomArea(room: Pick<Room, 'tiles'>): number { return room.tiles.length; }
