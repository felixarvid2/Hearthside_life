// Declarative house plans for generated lots (starter and neighbour houses). A plan lists wall runs,
// openings, room finishes (by a probe tile inside each room), extra floor areas, the front path and the
// furniture. buildHouse() applies it to an empty lot and validates every furniture placement with
// validatePlacement, throwing on the first invalid one so layout or footprint mismatches surface early.

import type { ContentDB } from '../content/types';
import { MINUTES_PER_DAY } from '../core/clock';
import { edgeKey, tileKey } from '../core/ids';
import type { Tile } from '../core/nav';
import type { EdgeDir, FinishRef, Lot, PlacedObject, Rot, WorldState } from '../core/types';
import { stairHoles, syncLevels } from './levels';
import { inLot } from './lots';
import { buildNavGrid, edgePassable, isFree } from './navgrid';
import { makePlacedObject } from './objects';
import { validatePlacement } from './placement';
import { computeRooms, roomAt } from './rooms';
import { addOpening, addWallRun, setWallSideFinish, type WallSide } from './walls';

/** A design and a palette index (taken modulo the number of palettes; 0 = the default palette). */
export interface SurfaceChoice { design: string; palette: number }

export interface HousePlan {
  /** Wall runs between grid vertices (straight lines), ground floor. */
  walls: Array<[Tile, Tile]>;
  openings: Array<{ dir: EdgeDir; x: number; z: number; defId: string; flip?: boolean }>;
  /** Every enclosed room must be listed; `probe` is any tile inside it. */
  rooms: Array<{ name: string; probe: Tile; wall: SurfaceChoice; floor: SurfaceChoice }>;
  /** Wall sides facing the yard. */
  exterior: SurfaceChoice;
  /** Single wall sides painted differently from their room (e.g. a striped feature wall). */
  featureWalls?: Array<{ dir: EdgeDir; x: number; z: number; side: WallSide; finish: SurfaceChoice }>;
  /** Floor areas painted after the rooms (porch, a kitchen strip in an open-plan room), as tile rectangles. */
  floorAreas?: Array<{ x0: number; z0: number; x1: number; z1: number; finish: SurfaceChoice }>;
  /** Paved path from the lot entry to this tile (in front of the porch). */
  path: { to: Tile; finish: SurfaceChoice };
  /** Placed in order: supports before the items on them. */
  furniture: Array<{ defId: string; x: number; z: number; rot: Rot }>;
  /**
   * Milestone 9: a second storey (level 1). Built after the ground floor's furniture, so a staircase placed there has already
   * opened its stairwell (rooms are floored around it). Every enclosed room must be listed, as on the ground floor.
   */
  upper?: {
    walls: Array<[Tile, Tile]>;
    openings: Array<{ dir: EdgeDir; x: number; z: number; defId: string; flip?: boolean }>;
    rooms: Array<{ name: string; probe: Tile; wall: SurfaceChoice; floor: SurfaceChoice }>;
    /** Wall sides facing outside. */
    exterior: SurfaceChoice;
    furniture: Array<{ defId: string; x: number; z: number; rot: Rot }>;
  };
}

/** Finish reference for a design and palette index from the content; throws when the design is missing. */
export function finishFor(content: ContentDB, surface: 'wall' | 'floor', choice: SurfaceChoice): FinishRef {
  const design = (surface === 'wall' ? content.wallDesigns : content.floorDesigns)[choice.design];
  if (!design) throw new Error(`House plan: unknown ${surface} design "${choice.design}"`);
  const n = design.palettes.length;
  const palette = n > 0 ? design.palettes[((choice.palette % n) + n) % n] : undefined;
  if (!palette) throw new Error(`House plan: ${surface} design "${choice.design}" has no palettes`);
  return { designId: design.id, paletteId: palette.id };
}

/** Applies a plan to an empty lot. Throws on a non-empty lot, unknown content or any invalid placement. */
export function buildHouse(state: WorldState, content: ContentDB, lot: Lot, plan: HousePlan, label: string): PlacedObject[] {
  if (Object.keys(lot.walls).length || Object.keys(lot.objects).length || Object.keys(lot.openings).length) {
    throw new Error(`${label}: lot ${lot.id} is not empty`);
  }
  const exterior = finishFor(content, 'wall', plan.exterior);
  for (const [from, to] of plan.walls) addWallRun(lot, 0, from, to, { a: exterior, b: exterior });

  for (const o of plan.openings) {
    const def = content.openings[o.defId];
    if (!def) throw new Error(`${label}: unknown opening "${o.defId}"`);
    addOpening(state, lot, def, edgeKey(0, o.dir, o.x, o.z), o.flip ?? false);
  }

  const rooms = computeRooms(lot, 0);
  if (!roomAt(rooms, lot.entry.x, lot.entry.z)?.outdoor) throw new Error(`${label}: the lot entry must be outside the house`);
  const assigned = new Set<number>();
  for (const spec of plan.rooms) {
    const room = roomAt(rooms, spec.probe.x, spec.probe.z);
    if (!room || room.outdoor) throw new Error(`${label}: room "${spec.name}" at (${spec.probe.x}, ${spec.probe.z}) is not enclosed`);
    if (assigned.has(room.id)) throw new Error(`${label}: room "${spec.name}" is listed twice`);
    assigned.add(room.id);
    const wall = finishFor(content, 'wall', spec.wall);
    const floor = finishFor(content, 'floor', spec.floor);
    for (const s of room.sides) {
      const w = lot.walls[s.wallId];
      if (w) setWallSideFinish(w, s.side, wall);
    }
    for (const t of room.tiles) lot.floors[tileKey(0, t.x, t.z)] = { ...floor };
  }
  for (const room of rooms) {
    if (!room.outdoor && !assigned.has(room.id)) throw new Error(`${label}: room at (${room.tiles[0]?.x}, ${room.tiles[0]?.z}) has no finishes`);
  }

  for (const f of plan.featureWalls ?? []) {
    const w = lot.walls[edgeKey(0, f.dir, f.x, f.z)];
    if (!w) throw new Error(`${label}: no wall for feature wall ${f.dir} (${f.x}, ${f.z})`);
    setWallSideFinish(w, f.side, finishFor(content, 'wall', f.finish));
  }
  for (const a of plan.floorAreas ?? []) {
    const finish = finishFor(content, 'floor', a.finish);
    for (let z = a.z0; z <= a.z1; z++) for (let x = a.x0; x <= a.x1; x++) {
      if (!inLot(lot, x, z)) throw new Error(`${label}: floor area tile (${x}, ${z}) is off the lot`);
      lot.floors[tileKey(0, x, z)] = { ...finish };
    }
  }
  const pathFinish = finishFor(content, 'floor', plan.path.finish);
  for (const t of pathTiles(lot, content, { x: lot.entry.x, z: lot.entry.z }, plan.path.to)) {
    lot.floors[tileKey(0, t.x, t.z)] = { ...pathFinish };
  }

  const placed: PlacedObject[] = [];
  for (const f of plan.furniture) placed.push(placeChecked(state, content, lot, f, label));
  if (plan.upper) placed.push(...buildUpper(state, content, lot, plan.upper, label));
  syncLevels(lot);
  return placed;
}

/** The second storey of a plan (see HousePlan.upper). Stairwell tiles stay open. */
function buildUpper(state: WorldState, content: ContentDB, lot: Lot, up: NonNullable<HousePlan['upper']>, label: string): PlacedObject[] {
  const exterior = finishFor(content, 'wall', up.exterior);
  for (const [from, to] of up.walls) addWallRun(lot, 1, from, to, { a: exterior, b: exterior });
  for (const o of up.openings) {
    const def = content.openings[o.defId];
    if (!def) throw new Error(`${label}: unknown opening "${o.defId}"`);
    addOpening(state, lot, def, edgeKey(1, o.dir, o.x, o.z), o.flip ?? false);
  }
  const holes = stairHoles(lot, content, 1);
  const rooms = computeRooms(lot, 1);
  const assigned = new Set<number>();
  for (const spec of up.rooms) {
    const room = roomAt(rooms, spec.probe.x, spec.probe.z);
    if (!room || room.outdoor) throw new Error(`${label}: upstairs room "${spec.name}" at (${spec.probe.x}, ${spec.probe.z}) is not enclosed`);
    if (assigned.has(room.id)) throw new Error(`${label}: upstairs room "${spec.name}" is listed twice`);
    assigned.add(room.id);
    const wall = finishFor(content, 'wall', spec.wall);
    const floor = finishFor(content, 'floor', spec.floor);
    for (const s of room.sides) {
      const w = lot.walls[s.wallId];
      if (w) setWallSideFinish(w, s.side, wall);
    }
    for (const t of room.tiles) if (!holes.has(`${t.x},${t.z}`)) lot.floors[tileKey(1, t.x, t.z)] = { ...floor };
  }
  for (const room of rooms) {
    if (!room.outdoor && !assigned.has(room.id)) throw new Error(`${label}: upstairs room at (${room.tiles[0]?.x}, ${room.tiles[0]?.z}) has no finishes`);
  }
  const placed: PlacedObject[] = [];
  for (const f of up.furniture) placed.push(placeChecked(state, content, lot, { ...f, level: 1 }, label));
  return placed;
}

/**
 * Places one furnishing after validatePlacement; throws with the reasons when invalid. Furnishings count as
 * pre-owned (bought the day before) so selling them gives the depreciated value, not a same-day refund.
 */
export function placeChecked(state: WorldState, content: ContentDB, lot: Lot, f: { defId: string; x: number; z: number; rot: Rot; level?: number }, label: string): PlacedObject {
  const def = content.objects[f.defId];
  if (!def) throw new Error(`${label}: unknown object "${f.defId}"`);
  const level = f.level ?? 0;
  const v = validatePlacement(state, content, lot.id, { defId: f.defId, x: f.x, z: f.z, rot: f.rot, level });
  if (!v.ok) throw new Error(`${label}: cannot place ${f.defId} at (${f.x}, ${f.z}) rot ${f.rot}: ${v.reasons.join(' ')}`);
  const obj = makePlacedObject(state, def, { x: f.x, z: f.z, rot: f.rot, level, ...(v.supportId ? { supportId: v.supportId } : {}) }, {
    ownerHouseholdId: lot.ownerHouseholdId,
    boughtAt: state.clock.minutes - MINUTES_PER_DAY,
  });
  lot.objects[obj.id] = obj;
  return obj;
}

/**
 * Tiles of a paved path from `from` to `to`: north/south along from.x, then east/west along to.z when that
 * L-shape crosses no wall; otherwise the shortest 4-neighbour route around the walls.
 */
export function pathTiles(lot: Lot, content: ContentDB, from: Tile, to: Tile): Tile[] {
  const g = buildNavGrid(lot, content, 0);
  const l: Tile[] = [];
  const sz = to.z >= from.z ? 1 : -1;
  for (let z = from.z; z !== to.z + sz; z += sz) l.push({ x: from.x, z });
  const sx = to.x >= from.x ? 1 : -1;
  for (let x = from.x + sx; x !== to.x + sx; x += sx) l.push({ x, z: to.z });
  let ok = l.every((t) => isFree(g, t.x, t.z));
  for (let i = 1; ok && i < l.length; i++) ok = edgePassable(g, l[i - 1] as Tile, l[i] as Tile);
  if (ok) return l;

  const W = lot.width;
  const prev = new Int32Array(W * lot.depth).fill(-2);
  const start = from.z * W + from.x, goal = to.z * W + to.x;
  prev[start] = -1;
  const queue = [start];
  for (let qi = 0; qi < queue.length && prev[goal] === -2; qi++) {
    const i = queue[qi] as number;
    const x = i % W, z = (i - x) / W;
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const n = { x: x + dx, z: z + dz };
      if (!isFree(g, n.x, n.z) || !edgePassable(g, { x, z }, n)) continue;
      const j = n.z * W + n.x;
      if (prev[j] !== -2) continue;
      prev[j] = i;
      queue.push(j);
    }
  }
  if (prev[goal] === -2) throw new Error(`No path from the lot entry (${from.x}, ${from.z}) to (${to.x}, ${to.z})`);
  const out: Tile[] = [];
  for (let i = goal; i !== -1; i = prev[i] as number) out.push({ x: i % W, z: Math.floor(i / W) });
  return out.reverse();
}
