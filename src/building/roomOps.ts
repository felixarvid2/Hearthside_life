// Milestone 13: move, resize and duplicate a room in Build mode (until now only delete existed). Pure planning, in the
// style of buildPlans.ts: an operation is validated as a whole, priced and turned into the exact change (RoomDiff),
// which roomCommands.ts applies and undoes. Nothing here mutates state or allocates ids.
//
// What a "room" is here: an enclosed, rectangular room (computeRooms: its tiles fill their bounding rectangle). Other shapes
// are refused with a reason ("Only rectangular rooms ...").
//
//   move       the whole room (perimeter walls, doors and windows in them, floor, furniture and the food on it) shifts by
//              (dx, dz) tiles. It is a relocation: the walls keep their paid prices, so the net cost is 0. A wall shared with
//              the room next door stays where it is (it belongs to that room too), so the moved room gets new walls on that
//              side at its destination and the neighbour keeps its wall. Doors and windows in shared walls stay with them.
//   resize     one side moves by `delta` tiles (negative = north/west). New walls and floor are priced like building, removed
//              ones are refunded like demolition. Doors and windows on the moving side move with it.
//   duplicate  a copy of the room's shell (walls, floor, doors, windows) at (dx, dz), charged at today's prices; with
//              `copyObjects` the furniture is bought again as well. The copy may not overlap the original.
//
// Validation (every reason is player-facing; the first conflicts locate the problem for the red highlight):
// - the destination stays on the lot, outside every other indoor room, and no wall runs through its interior;
// - structure: the same rules as every build (validateDiff): walls through furniture or people, doors without a wall, wall
//   items whose wall goes, upper floors with support, nobody walled in, every object still reachable;
// - people are never pushed: anybody standing in the room or its destination blocks a move or a shrink;
// - furniture that moves is placed again with the normal placement rules (collisions, wall items on walls, access), furniture
//   that stays is checked by the new walls; a shrink is blocked by furniture in the strip that would be cut off.

import type { ContentDB } from '../content/types';
import { edgeKey, parseEdgeKey, tileKey } from '../core/ids';
import type { Cents, FinishRef, Id, Lot, Opening, PlacedObject, Wall, WorldItem, WorldState } from '../core/types';
import { hasLevel, inLot } from '../world/lots';
import { objectTiles, validatePlacement } from '../world/placement';
import { computeRooms, roomAt, type Room } from '../world/rooms';
import {
  validateDiff, virtualLot, type BuildConflict, type BuildDiff, type FloorDelta, type OpeningDelta, type WallDelta,
} from '../world/structure';
import { edgeTiles, openingEdgeKeys } from '../world/walls';
import { chargeFor, editAccess } from './plans';
import {
  floorRefund, openingRefund, PENDING_PREFIX, rectPerimeter, structurePrice, wallRefund, type EdgeRef, type Point, type Rect,
} from './buildPlans';

export type RoomSide = 'n' | 'e' | 's' | 'w';

export type RoomOp =
  | { kind: 'moveRoom'; level: number; tile: Point; dx: number; dz: number }
  | { kind: 'resizeRoom'; level: number; tile: Point; side: RoomSide; delta: number }
  | { kind: 'duplicateRoom'; level: number; tile: Point; dx: number; dz: number; copyObjects?: boolean };

export interface ObjectMove { id: Id; before: { x: number; z: number }; after: { x: number; z: number } }
export interface ItemMove { id: Id; before: WorldItem['position']; after: WorldItem['position'] }

/** The exact change of a room operation: the structural diff plus furniture and items. Records are JSON copies. */
export interface RoomDiff extends BuildDiff {
  moves: ObjectMove[];
  /** Furniture copies of a duplicate; ids start with PENDING_PREFIX until a command applies them. */
  adds: PlacedObject[];
  items: ItemMove[];
}

export interface RoomOpPlan {
  ok: boolean;
  reasons: string[];
  label: string;
  /** Net money now (charge - refund), integer cents. */
  cost: Cents;
  charge: Cents;
  refund: Cents;
  /** Source and destination as vertex rectangles (null when the room could not be found). */
  from: Rect | null;
  to: Rect | null;
  counts: { walls: number; openings: number; floors: number; objects: number };
  diff: RoomDiff;
  /** Red/green highlight data for the UI: destination tiles and what blocks. */
  highlight: { level: number; tiles: Point[]; blocked: BuildConflict[] };
  /** Short text such as "5 x 4 m (20 m2)". */
  measure: string;
}

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const tk = (t: { x: number; z: number }) => `${t.x},${t.z}`;
const rectTileList = (r: Rect): Point[] => {
  const out: Point[] = [];
  for (let z = r.z0; z < r.z1; z++) for (let x = r.x0; x < r.x1; x++) out.push({ x, z });
  return out;
};
const inRect = (r: Rect, x: number, z: number) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;
const sizeText = (r: Rect) => `${r.x1 - r.x0} x ${r.z1 - r.z0} m (${(r.x1 - r.x0) * (r.z1 - r.z0)} m2)`;

export function emptyRoomDiff(level: number): RoomDiff { return { level, walls: [], openings: [], floors: [], moves: [], adds: [], items: [] }; }

function fail(level: number, reasons: string[], label: string, extra: Partial<RoomOpPlan> = {}): RoomOpPlan {
  return {
    ok: false, reasons, label, cost: 0, charge: 0, refund: 0, from: null, to: null, counts: { walls: 0, openings: 0, floors: 0, objects: 0 },
    diff: emptyRoomDiff(level), highlight: { level, tiles: [], blocked: [] }, measure: '', ...extra,
  };
}

/** The enclosed rectangular room at a tile: its room record and vertex rectangle, or the reason there is none. */
export function rectangularRoomAt(lot: Lot, level: number, tile: Point): { room: Room; rect: Rect } | { reason: string } {
  if (!hasLevel(lot, level) || !inLot(lot, tile.x, tile.z)) return { reason: 'That spot is not on the lot.' };
  const room = roomAt(computeRooms(lot, level), tile.x, tile.z);
  if (!room || room.outdoor) return { reason: 'Choose an enclosed room.' };
  const xs = room.tiles.map((t) => t.x), zs = room.tiles.map((t) => t.z);
  const rect: Rect = { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs) + 1, z1: Math.max(...zs) + 1 };
  if ((rect.x1 - rect.x0) * (rect.z1 - rect.z0) !== room.tiles.length) return { reason: 'Only rectangular rooms can be moved, resized or duplicated.' };
  return { room, rect };
}

/** Which side of a rectangle a perimeter edge lies on. */
function sideOf(e: EdgeRef, r: Rect): RoomSide {
  if (e.dir === 'h') return e.z === r.z0 ? 'n' : 's';
  return e.x === r.x0 ? 'w' : 'e';
}

/** The side of the edge's wall that faces into the rectangle. */
function insideSide(e: EdgeRef, r: Rect): 'a' | 'b' {
  const [ta] = edgeTiles(e);
  return inRect(r, ta.x, ta.z) ? 'a' : 'b';
}

const shift = (e: EdgeRef, dx: number, dz: number): EdgeRef => ({ dir: e.dir, x: e.x + dx, z: e.z + dz });
const keyOf = (e: EdgeRef, level: number) => edgeKey(level, e.dir, e.x, e.z);

/** Wall copy on a new edge (finishes keep their inside/outside orientation; prices carry over when `keepPrice`). */
function wallOn(src: Wall, e: EdgeRef, level: number, srcRect: Rect, dstRect: Rect, keepPrice: boolean, paid?: Cents, boughtAt?: number): Wall {
  const si = insideSide(src, srcRect), di = insideSide(e, dstRect);
  const inside = si === 'a' ? src.sideA : src.sideB, outside = si === 'a' ? src.sideB : src.sideA;
  const w: Wall = {
    id: keyOf(e, level), level, dir: e.dir, x: e.x, z: e.z, height: src.height,
    sideA: copy(di === 'a' ? inside : outside), sideB: copy(di === 'a' ? outside : inside),
  };
  if (keepPrice) {
    if (src.purchasePrice !== undefined) w.purchasePrice = src.purchasePrice;
    if (src.boughtAt !== undefined) w.boughtAt = src.boughtAt;
  } else {
    if (paid !== undefined) w.purchasePrice = paid;
    if (boughtAt !== undefined) w.boughtAt = boughtAt;
  }
  return w;
}

/** Price of a new wall like the build tool: structure plus both finishes' design prices. */
function newWallPrice(state: WorldState, content: ContentDB, w: Wall): Cents {
  const price = (d: FinishRef) => content.wallDesigns[d.designId]?.price ?? 0;
  return chargeFor(state, structurePrice(w.height) + price(w.sideA) + price(w.sideB));
}

/** Objects whose whole footprint lies in the tile set (the furniture that belongs to the room). */
function objectsIn(lot: Lot, content: ContentDB, level: number, tiles: Set<string>): PlacedObject[] {
  return Object.values(lot.objects)
    .filter((o) => o.level === level)
    .filter((o) => {
      const t = objectTiles(o, content.objects[o.defId]);
      return t.length > 0 && t.every((q) => tiles.has(tk(q)));
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Objects with at least one tile in the set. */
function objectsTouching(lot: Lot, content: ContentDB, level: number, tiles: Set<string>): PlacedObject[] {
  return Object.values(lot.objects)
    .filter((o) => o.level === level && objectTiles(o, content.objects[o.defId]).some((q) => tiles.has(tk(q))))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

function peopleOn(state: WorldState, lot: Lot, level: number, tiles: Set<string>) {
  return Object.values(state.people)
    .filter((p) => p.location.kind === 'lot' && p.location.lotId === lot.id && p.location.level === level && tiles.has(`${Math.floor(p.location.x)},${Math.floor(p.location.z)}`))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Sort placement order: things that carry others first (floor layer before surface, wall and rug items). */
const LAYER_ORDER: Record<string, number> = { floor: 0, rug: 1, ceiling: 2, wall: 3, surface: 4 };

/** Planning entry point. Pure. */
export function planRoomOp(state: WorldState, content: ContentDB, lotId: Id, householdId: Id, op: RoomOp): RoomOpPlan {
  const level = op.level;
  const label = op.kind === 'moveRoom' ? 'Move room' : op.kind === 'resizeRoom' ? 'Resize room' : 'Duplicate room';
  const access = editAccess(state, lotId, householdId);
  if ('reason' in access) return fail(level, [access.reason], label);
  const { lot, hh } = access;
  const found = rectangularRoomAt(lot, level, op.tile);
  if ('reason' in found) return fail(level, [found.reason], label);
  const { room, rect: R } = found;
  const reasons: string[] = [];
  const conflicts: BuildConflict[] = [];
  const reject = (reason: string, c?: BuildConflict) => { if (!reasons.includes(reason)) reasons.push(reason); if (c) conflicts.push(c); };

  // ---- the target rectangle ----
  let T: Rect;
  let dx = 0, dz = 0;
  if (op.kind === 'resizeRoom') {
    if (!Number.isInteger(op.delta) || op.delta === 0) return fail(level, ['Choose how far to move that side.'], label, { from: R });
    T = { ...R };
    if (op.side === 'n') T.z0 += op.delta; else if (op.side === 's') T.z1 += op.delta;
    else if (op.side === 'w') T.x0 += op.delta; else T.x1 += op.delta;
    if (T.x1 <= T.x0 || T.z1 <= T.z0) return fail(level, ['The room cannot get that small.'], label, { from: R });
  } else {
    if (!Number.isInteger(op.dx) || !Number.isInteger(op.dz) || (op.dx === 0 && op.dz === 0)) return fail(level, ['Choose where to put it.'], label, { from: R });
    dx = op.dx; dz = op.dz;
    T = { x0: R.x0 + dx, z0: R.z0 + dz, x1: R.x1 + dx, z1: R.z1 + dz };
  }
  const measure = sizeText(T);
  const dstTiles = rectTileList(T);
  const srcSet = new Set(rectTileList(R).map(tk)), dstSet = new Set(dstTiles.map(tk));
  const fromTo = { from: R, to: T, measure };
  if (T.x0 < 0 || T.z0 < 0 || T.x1 > lot.width || T.z1 > lot.depth) {
    return fail(level, ['That would reach off the lot.'], label, { ...fromTo, highlight: { level, tiles: dstTiles, blocked: [] } });
  }
  if (op.kind === 'duplicateRoom' && dstTiles.some((t) => srcSet.has(tk(t)))) {
    return fail(level, ['The copy cannot overlap the original room.'], label, { ...fromTo, highlight: { level, tiles: dstTiles, blocked: [] } });
  }

  // ---- other rooms ----
  const rooms = computeRooms(lot, level);
  const otherTiles = new Set<string>();
  for (const r of rooms) if (r !== room && !r.outdoor) for (const t of r.tiles) otherTiles.add(tk(t));
  const added = dstTiles.filter((t) => !srcSet.has(tk(t)));
  if (op.kind !== 'resizeRoom' || added.length > 0) {
    if (added.some((t) => otherTiles.has(tk(t)))) reject('That overlaps another room.');
  }

  // ---- walls ----
  const ringR = rectPerimeter(R), ringT = rectPerimeter(T);
  const wallMap: Record<string, Wall> = { ...lot.walls };
  const removed = new Set<string>();
  const wallDeltas = new Map<string, { before: Wall | null; after: Wall | null }>();
  const isShared = (e: EdgeRef): boolean => {
    const w = lot.walls[keyOf(e, level)];
    if (!w) return false;
    const [ta, tb] = edgeTiles(w);
    const other = inRect(R, ta.x, ta.z) ? tb : ta;
    return otherTiles.has(tk(other));
  };
  let charge: Cents = 0, refund: Cents = 0;
  const countWalls = () => wallDeltas.size;

  const srcWallFor = (eT: EdgeRef): { src: Wall; srcEdge: EdgeRef } | null => {
    if (op.kind === 'resizeRoom') {
      // nearest old edge on the same side of the rectangle
      const side = sideOf(eT, T);
      let best: { w: Wall; e: EdgeRef; d: number } | null = null;
      for (const e of ringR) {
        if (sideOf(e, R) !== side) continue;
        const w = lot.walls[keyOf(e, level)];
        if (!w) continue;
        const d = Math.abs(e.x - eT.x) + Math.abs(e.z - eT.z);
        if (!best || d < best.d) best = { w, e, d };
      }
      return best ? { src: best.w, srcEdge: best.e } : null;
    }
    const srcEdge = shift(eT, -dx, -dz);
    const w = lot.walls[keyOf(srcEdge, level)];
    return w ? { src: w, srcEdge } : null;
  };

  const ringKeysT = new Set(ringT.map((e) => keyOf(e, level)));
  const movedOpenings: Array<{ o: Opening; to: string }> = [];
  const droppedOpenings: Opening[] = [];
  const newOpenings: Opening[] = [];

  if (op.kind !== 'duplicateRoom') {
    // remove the room's own perimeter (not walls shared with another room, not edges the target keeps)
    const keep = op.kind === 'resizeRoom' ? ringKeysT : new Set<string>();
    for (const e of ringR) {
      const k = keyOf(e, level);
      const w = lot.walls[k];
      if (!w || isShared(e) || keep.has(k)) continue;
      delete wallMap[k];
      removed.add(k);
      wallDeltas.set(k, { before: copy(w), after: null });
    }
  }

  // build the target perimeter
  for (const eT of ringT) {
    const k = keyOf(eT, level);
    if (wallMap[k]) continue; // an existing wall is reused
    const s = srcWallFor(eT);
    if (!s) { reject('The room has no wall to copy here.'); continue; }
    let w: Wall;
    if (op.kind === 'moveRoom') w = wallOn(s.src, eT, level, R, T, true);
    else w = wallOn(s.src, eT, level, R, T, false, 0, state.clock.minutes);
    if (op.kind !== 'moveRoom') {
      const price = newWallPrice(state, content, w);
      w.purchasePrice = price;
      charge += price;
    }
    wallMap[k] = w;
    const prev = wallDeltas.get(k);
    wallDeltas.set(k, { before: prev ? prev.before : null, after: w });
  }
  // a wall removed and put back identical is no change
  for (const [k, d] of [...wallDeltas]) if (d.before && d.after && JSON.stringify(d.before) === JSON.stringify(d.after)) wallDeltas.delete(k);
  if (op.kind === 'resizeRoom') {
    for (const [, d] of wallDeltas) if (d.before && !d.after) refund += wallRefund(state, d.before);
  }

  // no wall may run through the interior of the target
  for (let z = T.z0; z < T.z1; z++) {
    for (let x = T.x0 + 1; x < T.x1; x++) {
      if (wallMap[edgeKey(level, 'v', x, z)]) reject('A wall is in the way inside the new room.', { kind: 'edge', key: edgeKey(level, 'v', x, z), reason: 'In the way.' });
    }
  }
  for (let z = T.z0 + 1; z < T.z1; z++) {
    for (let x = T.x0; x < T.x1; x++) {
      if (wallMap[edgeKey(level, 'h', x, z)]) reject('A wall is in the way inside the new room.', { kind: 'edge', key: edgeKey(level, 'h', x, z), reason: 'In the way.' });
    }
  }

  // ---- openings ----
  const openingMap: Record<string, Opening> = { ...lot.openings };
  const openingDeltas = new Map<Id, OpeningDelta>();
  const onRing = (o: Opening) => openingEdgeKeys(o).every((k) => ringR.some((e) => keyOf(e, level) === k));
  const ringOpenings = Object.values(lot.openings).filter(onRing).sort((a, b) => (a.id < b.id ? -1 : 1));
  const sharedKeys = new Set(ringR.filter(isShared).map((e) => keyOf(e, level)));
  if (op.kind === 'moveRoom') {
    for (const o of ringOpenings) {
      if (openingEdgeKeys(o).some((k) => sharedKeys.has(k))) continue; // stays with the neighbour's wall
      const first = parseEdgeKey(o.wallId);
      const to = keyOf(shift({ dir: first.dir, x: first.x, z: first.z }, dx, dz), level);
      movedOpenings.push({ o, to });
    }
  } else if (op.kind === 'resizeRoom') {
    for (const o of ringOpenings) {
      const keys = openingEdgeKeys(o);
      if (keys.every((k) => ringKeysT.has(k))) continue; // stays
      if (keys.some((k) => sharedKeys.has(k))) continue;
      const first = parseEdgeKey(o.wallId);
      const side = sideOf({ dir: first.dir, x: first.x, z: first.z }, R);
      if (side === op.side) {
        const nx = first.dir === 'v' ? first.x + op.delta : first.x, nz = first.dir === 'h' ? first.z + op.delta : first.z;
        movedOpenings.push({ o, to: edgeKey(level, first.dir, nx, nz) });
      } else droppedOpenings.push(o);
    }
  } else {
    let n = 0;
    for (const o of ringOpenings) {
      const first = parseEdgeKey(o.wallId);
      const to = keyOf(shift({ dir: first.dir, x: first.x, z: first.z }, dx, dz), level);
      const def = content.openings[o.defId];
      const paid = chargeFor(state, def?.price ?? 0);
      newOpenings.push({ ...copy(o), id: `${PENDING_PREFIX}opn:${n++}`, wallId: to, purchasePrice: paid, boughtAt: state.clock.minutes });
      charge += paid;
    }
  }
  for (const m of movedOpenings) {
    const after: Opening = { ...copy(m.o), wallId: m.to };
    openingMap[m.o.id] = after;
    openingDeltas.set(m.o.id, { id: m.o.id, before: copy(m.o), after });
  }
  for (const o of droppedOpenings) { delete openingMap[o.id]; openingDeltas.set(o.id, { id: o.id, before: copy(o), after: null }); refund += openingRefund(state, o); }
  // openings that sat on a wall that was removed and not carried go with it (move: shared walls are not removed)
  for (const o of Object.values(lot.openings)) {
    if (openingDeltas.has(o.id)) continue;
    if (openingEdgeKeys(o).some((k) => removed.has(k))) {
      delete openingMap[o.id];
      openingDeltas.set(o.id, { id: o.id, before: copy(o), after: null });
      if (op.kind === 'resizeRoom') refund += openingRefund(state, o);
    }
  }
  for (const o of newOpenings) openingDeltas.set(o.id, { id: o.id, before: null, after: o });

  // ---- floors ----
  const floorDeltas: FloorDelta[] = [];
  const floorAfter: Record<string, FinishRef | null> = {};
  const srcFloor = (t: Point): FinishRef | undefined => {
    const direct = lot.floors[tileKey(level, t.x, t.z)];
    if (direct) return direct;
    // resize: nearest tile of the old room
    const cx = Math.min(Math.max(t.x, R.x0), R.x1 - 1), cz = Math.min(Math.max(t.z, R.z0), R.z1 - 1);
    return lot.floors[tileKey(level, cx, cz)];
  };
  if (op.kind === 'moveRoom') {
    for (const t of rectTileList(R)) floorAfter[tileKey(level, t.x, t.z)] = null;
    for (const t of dstTiles) {
      const f = lot.floors[tileKey(level, t.x - dx, t.z - dz)];
      floorAfter[tileKey(level, t.x, t.z)] = f ? copy(f) : null;
    }
  } else if (op.kind === 'duplicateRoom') {
    for (const t of dstTiles) {
      const f = lot.floors[tileKey(level, t.x - dx, t.z - dz)];
      if (f) floorAfter[tileKey(level, t.x, t.z)] = copy(f);
    }
  } else {
    for (const t of rectTileList(R)) if (!inRect(T, t.x, t.z)) floorAfter[tileKey(level, t.x, t.z)] = null;
    for (const t of added) { const f = srcFloor(t); if (f) floorAfter[tileKey(level, t.x, t.z)] = copy(f); }
  }
  for (const [key, after] of Object.entries(floorAfter)) {
    const before = lot.floors[key] ?? null;
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    floorDeltas.push({ key, before: before ? copy(before) : null, after });
    if (op.kind !== 'moveRoom') {
      if (after && !before) charge += chargeFor(state, content.floorDesigns[after.designId]?.price ?? 0);
      if (before && !after) refund += floorRefund(state, content, before);
    }
  }

  // ---- people ----
  if (op.kind === 'moveRoom' || (op.kind === 'resizeRoom')) {
    const watch = op.kind === 'moveRoom' ? new Set([...srcSet, ...dstSet]) : new Set([...srcSet].filter((k) => !dstSet.has(k)));
    for (const p of peopleOn(state, lot, level, watch)) reject(`${p.firstName} is in the way.`, { kind: 'person', personId: p.id, reason: 'In the way.' });
  }

  // ---- furniture ----
  const diff: RoomDiff = emptyRoomDiff(level);
  diff.walls = [...wallDeltas].map(([key, d]): WallDelta => ({ key, before: d.before, after: d.after }));
  diff.openings = [...openingDeltas.values()];
  diff.floors = floorDeltas;
  const moving: PlacedObject[] = op.kind === 'resizeRoom' ? [] : objectsIn(lot, content, level, srcSet);
  const movingIds = new Set(moving.map((o) => o.id));
  if (op.kind === 'resizeRoom') {
    const strip = new Set([...srcSet].filter((k) => !dstSet.has(k)));
    for (const o of objectsTouching(lot, content, level, strip)) {
      const name = content.objects[o.defId]?.name ?? 'furniture';
      reject(`Clear the ${name} out of the strip first.`, { kind: 'object', objectId: o.id, reason: 'In the way.' });
    }
  } else if (op.kind === 'moveRoom') {
    // furniture straddling the room boundary cannot happen with walls in place, but a half-inside object blocks the move
    for (const o of objectsTouching(lot, content, level, srcSet)) {
      if (!movingIds.has(o.id)) reject(`The ${content.objects[o.defId]?.name ?? 'furniture'} is not fully inside the room.`, { kind: 'object', objectId: o.id, reason: 'Half in.' });
    }
  }
  if (moving.length > 0 && op.kind !== 'resizeRoom') {
    if (op.kind === 'moveRoom') {
      for (const o of moving) diff.moves.push({ id: o.id, before: { x: o.x, z: o.z }, after: { x: o.x + dx, z: o.z + dz } });
      for (const it of Object.values(state.items)) {
        if (it.lotId !== lot.id || it.position.level !== level || !srcSet.has(`${Math.floor(it.position.x)},${Math.floor(it.position.z)}`)) continue;
        diff.items.push({ id: it.id, before: copy(it.position), after: { ...copy(it.position), x: it.position.x + dx, z: it.position.z + dz } });
      }
    } else if (op.copyObjects) {
      const order = [...moving].sort((a, b) => (LAYER_ORDER[content.objects[a.defId]?.layer ?? 'floor'] ?? 0) - (LAYER_ORDER[content.objects[b.defId]?.layer ?? 'floor'] ?? 0) || (a.id < b.id ? -1 : 1));
      const idFor = new Map<Id, Id>(order.map((o, i) => [o.id, `${PENDING_PREFIX}obj:${i}`]));
      for (const o of order) {
        const def = content.objects[o.defId];
        const price = chargeFor(state, def?.price ?? 0);
        charge += price;
        const supportId = o.supportId ? idFor.get(o.supportId) : undefined;
        diff.adds.push({
          id: idFor.get(o.id)!, defId: o.defId, level, x: o.x + dx, z: o.z + dz, rot: o.rot, finishes: copy(o.finishes), purchasePrice: price,
          boughtAt: state.clock.minutes, ownerHouseholdId: hh.id, condition: { dirt: 0, broken: false }, ...(supportId ? { supportId } : {}),
        });
      }
    }
  }

  const empty = diff.walls.length === 0 && diff.openings.length === 0 && diff.floors.length === 0 && diff.moves.length === 0 && diff.adds.length === 0;
  const counts = { walls: countWalls(), openings: diff.openings.length, floors: diff.floors.length, objects: diff.moves.length + diff.adds.length };
  const base = (): RoomOpPlan => ({
    ok: reasons.length === 0, reasons, label, cost: charge - refund, charge, refund, from: R, to: T, counts, diff, measure,
    highlight: { level, tiles: dstTiles, blocked: conflicts },
  });
  if (reasons.length > 0) return base();
  if (empty) { reasons.push('Nothing would change.'); return base(); }

  // ---- structure rules (the same as every build) ----
  const structure: BuildDiff = { level, walls: diff.walls, openings: diff.openings, floors: diff.floors };
  // validateDiff judges furniture against the lot as it is now, so the furniture that moves is taken out of the way first
  const vstate = withoutObjects(state, lot, movingIds);
  const check = validateDiff(vstate, content, vstate.lots[lot.id]!, structure);
  for (const r of check.reasons) reject(r);
  conflicts.push(...check.conflicts);
  if (reasons.length > 0) return base();

  // ---- moved or copied furniture: placed again under the normal rules, in the new structure ----
  if (diff.moves.length > 0 || diff.adds.length > 0) {
    const vlot = virtualLot(vstate.lots[lot.id]!, structure);
    const pstate: WorldState = { ...vstate, lots: { ...vstate.lots, [lot.id]: vlot } };
    const queue: Array<{ obj: PlacedObject; id: Id; x: number; z: number }> = diff.moves.map((m) => ({ obj: lot.objects[m.id]!, id: m.id, x: m.after.x, z: m.after.z }));
    // copies keep their place in the room next to the originals, so originals must be back (they stay) before copies are checked
    if (op.kind === 'duplicateRoom') for (const o of moving) vlot.objects = { ...vlot.objects, [o.id]: o };
    const items = op.kind === 'moveRoom' ? queue : diff.adds.map((a) => ({ obj: a, id: a.id, x: a.x, z: a.z }));
    items.sort((a, b) => (LAYER_ORDER[content.objects[a.obj.defId]?.layer ?? 'floor'] ?? 0) - (LAYER_ORDER[content.objects[b.obj.defId]?.layer ?? 'floor'] ?? 0) || (a.id < b.id ? -1 : 1));
    const placed = new Map<Id, Id>();
    for (const it of items) {
      const def = content.objects[it.obj.defId];
      if (!def) continue;
      const res = validatePlacement(pstate, content, lot.id, { defId: def.id, x: it.x, z: it.z, rot: it.obj.rot, level });
      if (!res.ok) {
        for (const r of res.reasons) reject(`${def.name}: ${r}`, { kind: 'object', objectId: it.obj.id, reason: r });
        continue;
      }
      // later pieces see this one in place
      const clone: PlacedObject = { ...it.obj, x: it.x, z: it.z, level };
      const supportId = res.supportId ?? (it.obj.supportId ? (placed.get(it.obj.supportId) ?? it.obj.supportId) : undefined);
      if (supportId) clone.supportId = supportId; else delete clone.supportId;
      placed.set(it.id, clone.id);
      vlot.objects = { ...vlot.objects, [clone.id]: clone };
    }
  }
  return base();
}

/** The state with some objects of a lot taken out (a shallow copy: nothing in the original changes). */
function withoutObjects(state: WorldState, lot: Lot, ids: Set<Id>): WorldState {
  if (ids.size === 0) return state;
  const objects = { ...lot.objects };
  for (const id of ids) delete objects[id];
  return { ...state, lots: { ...state.lots, [lot.id]: { ...lot, objects } } };
}

// ---------------------------------------------------------------------------------------------
// Applying a diff
// ---------------------------------------------------------------------------------------------

/** Writes the diff into the lot and items (the caller validated it and replaced pending ids). */
export function applyRoomDiff(state: WorldState, lot: Lot, d: RoomDiff): void {
  for (const w of d.walls) { if (w.after) lot.walls[w.key] = copy(w.after); else delete lot.walls[w.key]; }
  for (const o of d.openings) { if (o.after) lot.openings[o.id] = copy(o.after); else delete lot.openings[o.id]; }
  for (const f of d.floors) { if (f.after) lot.floors[f.key] = copy(f.after); else delete lot.floors[f.key]; }
  for (const m of d.moves) { const o = lot.objects[m.id]; if (o) { o.x = m.after.x; o.z = m.after.z; } }
  for (const a of d.adds) lot.objects[a.id] = copy(a);
  for (const m of d.items) { const it = state.items[m.id]; if (it) it.position = copy(m.after); }
}

/** Restores the lot and items to the state before the diff. */
export function revertRoomDiff(state: WorldState, lot: Lot, d: RoomDiff): void {
  for (const w of d.walls) { if (w.before) lot.walls[w.key] = copy(w.before); else delete lot.walls[w.key]; }
  for (const o of d.openings) { if (o.before) lot.openings[o.id] = copy(o.before); else delete lot.openings[o.id]; }
  for (const f of d.floors) { if (f.before) lot.floors[f.key] = copy(f.before); else delete lot.floors[f.key]; }
  for (const m of d.moves) { const o = lot.objects[m.id]; if (o) { o.x = m.before.x; o.z = m.before.z; } }
  for (const a of d.adds) delete lot.objects[a.id];
  for (const m of d.items) { const it = state.items[m.id]; if (it) it.position = copy(m.before); }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** True when every "before" record of the diff is what the lot holds now, so the diff still applies. */
export function roomDiffMatches(state: WorldState, lot: Lot, d: RoomDiff): boolean {
  return d.walls.every((w) => same(lot.walls[w.key] ?? null, w.before))
    && d.openings.every((o) => same(lot.openings[o.id] ?? null, o.before))
    && d.floors.every((f) => same(lot.floors[f.key] ?? null, f.before))
    && d.moves.every((m) => { const o = lot.objects[m.id]; return !!o && o.x === m.before.x && o.z === m.before.z; })
    && d.adds.every((a) => !lot.objects[a.id])
    && d.items.every((m) => { const it = state.items[m.id]; return !!it && same(it.position, m.before); });
}
