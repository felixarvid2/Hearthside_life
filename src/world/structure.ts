// Structural edits: the exact change a build operation makes to a lot's walls, openings and floors (BuildDiff)
// and the construction-safety rules it must satisfy (brief section 17). Everything here is pure: the diff is
// applied to a throwaway copy of the lot (virtualLot) and the rules look at before and after; the real lot is
// never touched. building/buildPlans.ts creates diffs and prices them, building/buildCommands.ts applies them.
//
// Rules checked by validateDiff (all of them must hold, nothing is applied partially):
// - Walls: on the lot and on an existing level; none through an object's footprint (an edge between two
//   tiles of the same object, any layer); none within reach of a person (standing, walking, seated or lying);
//   a wall that holds a wall-mounted object (mirror, picture) cannot be removed while the object hangs on it.
// - Openings: every spanned edge has a wall of the same level and no other opening; the wall is high enough
//   (sill + height); no wall joins the middle of a multi-tile opening (a T junction inside its span); nothing
//   hangs on the edges; doors keep both tiles beside every spanned edge free of blocking furniture.
// - People: every person on the level who could walk to the lot entry before the change still can after it
//   (no one gets walled in, and removing the only door of a room with people in it is refused).
// - Objects: every object slot that was usable stays usable (a bed keeps a usable side, a fridge keeps its
//   front), and an object that could be reached from the lot entry still can (no sealed furniture).
//   Parts of the lot that were already cut off before the change are not judged.
// - Floors above the ground (Milestone 9, world/levels.ts levelProblems): a build may not leave an upper floor without support,
//   an upper wall without floor, furniture without floor under it, a floor in a stairwell, or a tall wall under an upper floor;
//   nobody is left standing on a floor that is erased. Reachability counts the staircases: the check below runs over every level.
// - Recovery for people: there is none; a wall near a person is refused with their name in the reason.

import type { ContentDB, OpeningDef } from '../content/types';
import { edgeKey, parseEdgeKey } from '../core/ids';
import type { Tile } from '../core/nav';
import type { FinishRef, Id, Lot, Opening, Person, PlacedObject, Wall, WorldState } from '../core/types';
import { reachableAll, usableLinks } from './levelNav';
import { levelsInUse, newLevelProblems, stairGeometry, stairLinks, type LevelProblem } from './levels';
import { hasLevel, inLot } from './lots';
import { buildNavGrid, edgePassable, isFree, VOID_ID, type NavGrid } from './navgrid';
import { accessPoints, backEdges, objectTiles } from './placement';
import { slotAccess, type AccessContext } from './slots';
import { edgeInLot, edgeTiles, openingEdgeKeys, openingSpan } from './walls';

export interface WallDelta { key: string; before: Wall | null; after: Wall | null }
export interface OpeningDelta { id: Id; before: Opening | null; after: Opening | null }
export interface FloorDelta { key: string; before: FinishRef | null; after: FinishRef | null }

/** The exact change of one build operation on one level. Records are plain JSON copies. */
export interface BuildDiff {
  level: number;
  walls: WallDelta[];
  openings: OpeningDelta[];
  floors: FloorDelta[];
}

/** A place that blocks an operation, for the red highlight in the UI. */
export type BuildConflict =
  | { kind: 'edge'; key: string; reason: string }
  | { kind: 'tile'; x: number; z: number; reason: string }
  | { kind: 'person'; personId: Id; reason: string }
  | { kind: 'object'; objectId: Id; reason: string }
  | { kind: 'opening'; openingId: Id; reason: string };

export interface DiffCheck { reasons: string[]; conflicts: BuildConflict[] }

/** Distance (metres) a standing or walking person keeps from a new wall; seated and lying people use the small one. */
export const PERSON_CLEARANCE = 0.3;
export const SEATED_CLEARANCE = 0.15;

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A copy of the lot with the diff applied. Shares objects with the original (read-only use). */
export function virtualLot(lot: Lot, diff: BuildDiff): Lot {
  const walls = { ...lot.walls };
  const openings = { ...lot.openings };
  const floors = { ...lot.floors };
  for (const d of diff.walls) { if (d.after) walls[d.key] = d.after; else delete walls[d.key]; }
  for (const d of diff.openings) { if (d.after) openings[d.id] = d.after; else delete openings[d.id]; }
  for (const d of diff.floors) { if (d.after) floors[d.key] = d.after; else delete floors[d.key]; }
  return { ...lot, walls, openings, floors };
}

/** Writes the diff into the real lot (callers have validated it). Records are copied. */
export function applyDiff(lot: Lot, diff: BuildDiff): void {
  for (const d of diff.walls) { if (d.after) lot.walls[d.key] = copy(d.after); else delete lot.walls[d.key]; }
  for (const d of diff.openings) { if (d.after) lot.openings[d.id] = copy(d.after); else delete lot.openings[d.id]; }
  for (const d of diff.floors) { if (d.after) lot.floors[d.key] = copy(d.after); else delete lot.floors[d.key]; }
}

/** Restores the lot to the state before the diff. */
export function revertDiff(lot: Lot, diff: BuildDiff): void {
  for (const d of diff.walls) { if (d.before) lot.walls[d.key] = copy(d.before); else delete lot.walls[d.key]; }
  for (const d of diff.openings) { if (d.before) lot.openings[d.id] = copy(d.before); else delete lot.openings[d.id]; }
  for (const d of diff.floors) { if (d.before) lot.floors[d.key] = copy(d.before); else delete lot.floors[d.key]; }
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** True when every "before" record of the diff is exactly what the lot holds now (so the diff still applies). */
export function diffMatchesLot(lot: Lot, diff: BuildDiff): boolean {
  return diff.walls.every((d) => sameJson(lot.walls[d.key] ?? null, d.before))
    && diff.openings.every((d) => sameJson(lot.openings[d.id] ?? null, d.before))
    && diff.floors.every((d) => sameJson(lot.floors[d.key] ?? null, d.before));
}

export function isEmptyDiff(diff: BuildDiff): boolean {
  return diff.walls.length === 0 && diff.openings.length === 0 && diff.floors.length === 0;
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------

/** Segment of a wall edge in lot coordinates. */
export function edgeSegment(e: { dir: 'h' | 'v'; x: number; z: number }): { ax: number; az: number; bx: number; bz: number } {
  return e.dir === 'h' ? { ax: e.x, az: e.z, bx: e.x + 1, bz: e.z } : { ax: e.x, az: e.z, bx: e.x, bz: e.z + 1 };
}

function distToSegment(px: number, pz: number, s: { ax: number; az: number; bx: number; bz: number }): number {
  const dx = s.bx - s.ax, dz = s.bz - s.az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (pz - s.az) * dz) / len2));
  return Math.hypot(px - (s.ax + t * dx), pz - (s.az + t * dz));
}

function peopleOnLevel(state: WorldState, lot: Lot, level: number): Person[] {
  return Object.values(state.people)
    .filter((p) => p.location.kind === 'lot' && p.location.lotId === lot.id && p.location.level === level)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const sortedObjects = (lot: Lot, level: number): PlacedObject[] =>
  Object.values(lot.objects).filter((o) => o.level === level).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** Tiles of an object; unknown definitions occupy their origin tile (as in the navigation grid). */
function tilesOf(content: ContentDB, o: PlacedObject): Tile[] {
  const d = content.objects[o.defId];
  return d ? objectTiles(o, d) : [{ x: o.x, z: o.z }];
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

/**
 * Checks a diff against the lot as it is now. Pure. `reasons` is empty when the diff is allowed;
 * `conflicts` locate what is in the way.
 */
export function validateDiff(state: WorldState, content: ContentDB, lot: Lot, diff: BuildDiff): DiffCheck {
  const out: DiffCheck = { reasons: [], conflicts: [] };
  const reject = (c: BuildConflict | null, reason: string) => {
    if (!out.reasons.includes(reason)) out.reasons.push(reason);
    if (c) out.conflicts.push(c);
  };
  if (!hasLevel(lot, diff.level)) { reject(null, 'That floor does not exist.'); return out; }

  const added: Wall[] = [];
  const removed: Wall[] = [];
  for (const d of diff.walls) {
    if (d.after) {
      const w = d.after;
      if (w.level !== diff.level || w.id !== d.key || w.id !== edgeKey(w.level, w.dir, w.x, w.z)) { reject(null, 'That wall is not valid.'); continue; }
      if (!edgeInLot(lot, w.dir, w.x, w.z)) { reject({ kind: 'edge', key: d.key, reason: 'Off the lot.' }, 'Walls have to stay on the lot.'); continue; }
      if (!d.before) added.push(w);
    } else if (d.before) removed.push(d.before);
  }

  const virtual = virtualLot(lot, diff);
  const level = diff.level;

  // --- new walls: objects and people ---
  if (added.length) {
    const objects = sortedObjects(lot, level);
    for (const w of added) {
      const [ta, tb] = edgeTiles(w);
      for (const o of objects) {
        const tiles = tilesOf(content, o);
        if (tiles.some((t) => t.x === ta.x && t.z === ta.z) && tiles.some((t) => t.x === tb.x && t.z === tb.z)) {
          const name = content.objects[o.defId]?.name ?? 'object';
          reject({ kind: 'edge', key: w.id, reason: `Runs through the ${name}.` }, `A wall would run through the ${name}.`);
          out.conflicts.push({ kind: 'object', objectId: o.id, reason: 'In the way.' });
          break;
        }
      }
      const seg = edgeSegment(w);
      for (const p of peopleOnLevel(state, lot, level)) {
        if (p.location.kind !== 'lot') continue;
        const near = p.location.posture === 'seated' || p.location.posture === 'lying' ? SEATED_CLEARANCE : PERSON_CLEARANCE;
        if (distToSegment(p.location.x, p.location.z, seg) < near) {
          reject({ kind: 'person', personId: p.id, reason: 'In the way.' }, `${p.firstName} is standing in the way.`);
        }
      }
    }
  }

  if (added.length) {
    for (const o of Object.values(virtual.openings)) {
      if (openingSpan(o) < 2 || diff.openings.some((d) => d.id === o.id)) continue;
      const hit = joinedAt(virtual, level, o);
      if (hit && added.some((w) => w.id === hit)) {
        const name = content.openings[o.defId]?.name ?? 'door or window';
        reject({ kind: 'edge', key: hit, reason: 'Joins the opening.' }, `A wall would join the middle of the ${name}.`);
      }
    }
  }

  // --- removed walls: wall-mounted objects ---
  if (removed.length) {
    const gone = new Set(removed.map((w) => w.id));
    for (const o of sortedObjects(lot, level)) {
      const d = content.objects[o.defId];
      if (!d || !(d.layer === 'wall' || d.needsWall)) continue;
      const hit = backEdges(o, d).find((k) => gone.has(k));
      if (hit) reject({ kind: 'object', objectId: o.id, reason: 'Hangs on this wall.' }, `The ${d.name} hangs on that wall. Remove it first.`);
    }
  }

  // --- openings ---
  for (const d of diff.openings) {
    if (d.after) checkOpening(content, lot, virtual, level, d.after, reject);
  }
  // an opening that kept its record must still sit in walls (defensive: plans remove openings with their walls)
  for (const o of Object.values(virtual.openings)) {
    if (diff.openings.some((d) => d.id === o.id)) continue;
    if (!openingEdgeKeys(o).every((k) => virtual.walls[k])) reject({ kind: 'opening', openingId: o.id, reason: 'No wall.' }, 'A door or window would be left without a wall.');
  }

  // --- floors ---
  for (const d of diff.floors) {
    if (!d.after) continue;
    const [lv, x, z] = d.key.split(':').map(Number) as [number, number, number];
    if (lv !== level || !inLot(lot, x, z)) reject({ kind: 'tile', x, z, reason: 'Off the lot.' }, 'Floors have to stay on the lot.');
  }
  // nobody is left on a floor that is taken away
  for (const d of diff.floors) {
    if (!d.before || d.after || level < 1) continue;
    const [, x, z] = d.key.split(':').map(Number) as [number, number, number];
    const p = peopleOnLevel(state, lot, level).find((q) => q.location.kind === 'lot' && Math.floor(q.location.x) === x && Math.floor(q.location.z) === z);
    if (p) reject({ kind: 'person', personId: p.id, reason: 'Standing there.' }, `${p.firstName} is standing on that floor.`);
  }

  // --- floors, walls and furniture above the ground ---
  if (out.reasons.length === 0) {
    for (const p of newLevelProblems(lot, virtual, content)) reject(problemConflict(p), p.text);
  }

  // --- access and people ---
  const needsAccessCheck = added.length > 0 || diff.floors.some((d) => d.before && !d.after && level >= 1)
    || diff.openings.some((d) => d.before && (!d.after || d.after.wallId !== d.before.wallId || openingSpan(d.after) !== openingSpan(d.before)));
  if (needsAccessCheck && out.reasons.length === 0) connectivity(state, content, lot, virtual, level, reject);
  return out;
}

function problemConflict(p: LevelProblem): BuildConflict | null {
  switch (p.kind) {
    case 'floor':
    case 'hole': { const [, x, z] = p.key.split(':').map(Number) as [number, number, number]; return { kind: 'tile', x, z, reason: p.text }; }
    case 'wall': return { kind: 'edge', key: p.key.replace(/^tall:/, ''), reason: p.text };
    case 'object': return { kind: 'object', objectId: p.key, reason: p.text };
  }
}

type Reject = (c: BuildConflict | null, reason: string) => void;

/** Key of a perpendicular wall that meets the inside of a multi-tile opening's span, if any. */
function joinedAt(lot: Lot, level: number, opening: Pick<Opening, 'wallId' | 'span'>): string | null {
  const keys = openingEdgeKeys(opening);
  for (let i = 1; i < keys.length; i++) {
    const e = parseEdgeKey(keys[i]!);
    const joins = e.dir === 'h'
      ? [edgeKey(level, 'v', e.x, e.z - 1), edgeKey(level, 'v', e.x, e.z)]
      : [edgeKey(level, 'h', e.x - 1, e.z), edgeKey(level, 'h', e.x, e.z)];
    const hit = joins.find((k) => lot.walls[k]);
    if (hit) return hit;
  }
  return null;
}

function checkOpening(
  content: ContentDB, lot: Lot, virtual: Lot, level: number, opening: Opening, reject: Reject,
): void {
  const def: OpeningDef | undefined = content.openings[opening.defId];
  if (!def) { reject({ kind: 'opening', openingId: opening.id, reason: 'Unknown.' }, `Unknown opening "${opening.defId}".`); return; }
  const kind = def.kind === 'door' ? 'door' : 'window';
  const span = openingSpan(opening);
  if (span !== Math.max(1, Math.round(def.width))) { reject({ kind: 'opening', openingId: opening.id, reason: 'Wrong width.' }, `The ${def.name} does not fit that wall.`); return; }
  let first: ReturnType<typeof parseEdgeKey>;
  try { first = parseEdgeKey(opening.wallId); } catch { reject(null, 'That wall is not valid.'); return; }
  if (first.level !== level) { reject(null, 'That wall is on another floor.'); return; }
  const keys = openingEdgeKeys(opening);
  const walls = keys.map((k) => virtual.walls[k]);
  const missing = keys.find((_k, i) => !walls[i]);
  if (missing) {
    reject({ kind: 'edge', key: missing, reason: 'No wall.' }, span > 1 ? `The ${def.name} needs a wall along its whole width.` : `A ${kind} needs a wall.`);
    return;
  }
  // other openings on the same edges
  for (const o of Object.values(virtual.openings)) {
    if (o.id === opening.id) continue;
    if (openingEdgeKeys(o).some((k) => keys.includes(k))) {
      reject({ kind: 'opening', openingId: o.id, reason: 'In the way.' }, `There is already a ${content.openings[o.defId]?.kind ?? 'door or window'} there.`);
      return;
    }
  }
  // wall height
  const top = def.sill + def.height;
  if (walls.some((w) => w && w.height + 1e-6 < top)) {
    reject({ kind: 'edge', key: keys[0]!, reason: 'Too low.' }, `The wall is too low for a ${def.name}.`);
    return;
  }
  // a wall joining the middle of a wide opening
  const joined = joinedAt(virtual, level, opening);
  if (joined) { reject({ kind: 'edge', key: joined, reason: 'Joins the opening.' }, `A wall joins the middle of the ${def.name}. Choose a straight stretch of wall.`); return; }
  // wall-mounted objects behind the edges
  for (const o of sortedObjects(lot, level)) {
    const d = content.objects[o.defId];
    if (!d || !(d.layer === 'wall' || d.needsWall)) continue;
    if (backEdges(o, d).some((k) => keys.includes(k))) {
      reject({ kind: 'object', objectId: o.id, reason: 'Hangs there.' }, `The ${d.name} hangs there.`);
      return;
    }
  }
  // door clearance: furniture that blocks movement beside the doorway
  if (kind === 'door') {
    const grid = buildNavGrid(virtual, content, level);
    for (const k of keys) {
      const w = virtual.walls[k]!;
      for (const t of edgeTiles(w)) {
        if (!inLot(lot, t.x, t.z)) continue;
        if (!isFree(grid, t.x, t.z)) {
          const id = grid.occupantIds[grid.occupant[t.z * grid.width + t.x] ?? -1];
          if (id === VOID_ID) continue; // Milestone 9: a door onto open air upstairs (a balcony may follow)
          const o = id ? lot.objects[id] : undefined;
          const name = (o && content.objects[o.defId]?.name) ?? (id?.startsWith('pool:') ? 'pool' : 'furniture');
          reject({ kind: 'tile', x: t.x, z: t.z, reason: 'Blocked.' }, `The ${name} blocks the doorway.`);
          if (o) reject({ kind: 'object', objectId: o.id, reason: 'In the way.' }, `The ${name} blocks the doorway.`);
          return;
        }
      }
    }
  }
}

/** Reachability of a person's tile from the entry: free tiles by the mask; blocked ones (a chair) through a free neighbour. */
function reachesEntry(g: NavGrid, mask: Uint8Array, t: Tile): boolean {
  if (isFree(g, t.x, t.z)) return mask[t.z * g.width + t.x] === 1;
  for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
    const n = { x: t.x + dx, z: t.z + dz };
    if (isFree(g, n.x, n.z) && edgePassable(g, t, n) && mask[n.z * g.width + n.x] === 1) return true;
  }
  return false;
}

interface LevelReach { grids: NavGrid[]; masks: Uint8Array[] }

/** Navigation grids of every level in use plus what can be reached from the lot entry across the staircases. */
export function levelReach(lot: Lot, content: ContentDB, minLevels = 1): LevelReach {
  const n = Math.max(1, levelsInUse(lot), minLevels);
  const grids: NavGrid[] = [];
  for (let l = 0; l < n; l++) grids.push(buildNavGrid(lot, content, l));
  const links = usableLinks(grids, stairLinks(lot, content));
  const seeds = lot.entry.level < n && inLot(lot, lot.entry.x, lot.entry.z) ? [{ x: lot.entry.x, z: lot.entry.z, level: lot.entry.level }] : [];
  return { grids, masks: reachableAll({ grids, links }, seeds) };
}

/** The first person who could reach the lot entry on `before` but not on `after` (stairs removed or moved, walls built). */
export function strandedPerson(state: WorldState, content: ContentDB, before: Lot, after: Lot, minLevels = 1): Person | null {
  const b = levelReach(before, content, minLevels), a = levelReach(after, content, minLevels);
  for (const p of Object.values(state.people).sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))) {
    if (p.location.kind !== 'lot' || p.location.lotId !== before.id) continue;
    const l = p.location.level;
    const gb = b.grids[l], ga = a.grids[l];
    if (!gb || !ga) continue;
    const t = { x: Math.floor(p.location.x), z: Math.floor(p.location.z) };
    if (!inLot(before, t.x, t.z)) continue;
    if (reachesEntry(gb, b.masks[l]!, t) && !reachesEntry(ga, a.masks[l]!, t)) return p;
  }
  return null;
}

function connectivity(state: WorldState, content: ContentDB, lot: Lot, virtual: Lot, level: number, reject: Reject): void {
  if (!inLot(lot, lot.entry.x, lot.entry.z)) return;
  const b = levelReach(lot, content, level + 1), a = levelReach(virtual, content, level + 1);

  for (const p of Object.values(state.people).sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))) {
    if (p.location.kind !== 'lot' || p.location.lotId !== lot.id) continue;
    const l = p.location.level;
    const gb = b.grids[l], ga = a.grids[l];
    if (!gb || !ga) continue;
    const t = { x: Math.floor(p.location.x), z: Math.floor(p.location.z) };
    if (!inLot(lot, t.x, t.z)) continue;
    if (reachesEntry(gb, b.masks[l]!, t) && !reachesEntry(ga, a.masks[l]!, t)) {
      reject({ kind: 'person', personId: p.id, reason: 'Would be trapped.' }, `${p.firstName} would be trapped. Leave a way out first.`);
    }
  }

  const reachable = (tiles: Tile[], mask: Uint8Array, g: NavGrid) => tiles.some((t) => mask[t.z * g.width + t.x] === 1);
  for (const o of Object.values(lot.objects).sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))) {
    const def = content.objects[o.defId];
    const before = b.grids[o.level], after = a.grids[o.level];
    if (!def || !before || !after) continue;
    const maskB = b.masks[o.level]!, maskA = a.masks[o.level]!;
    const ctxB: AccessContext = { grid: before, content, objectById: (id) => lot.objects[id] };
    const ctxA: AccessContext = { grid: after, content, objectById: (id) => virtual.objects[id] };
    if (def.slots.length > 0) {
      const sb = slotAccess(ctxB, o, def);
      const sa = slotAccess(ctxA, o, def);
      const lost = sb.findIndex((s, i) => s.usable && !sa[i]?.usable);
      if (lost >= 0) {
        reject({ kind: 'object', objectId: o.id, reason: 'Would lose a side.' }, `It would cut off a side of the ${def.name} that people use.`);
        continue;
      }
    }
    const pb = accessPoints(ctxB, o, def);
    if (!pb || !reachable(pb.tiles, maskB, before)) continue;
    const pa = accessPoints(ctxA, o, def);
    if (!pa || !reachable(pa.tiles, maskA, after)) {
      reject({ kind: 'object', objectId: o.id, reason: 'Would be sealed in.' }, `It would block access to the ${def.name}. Leave a way in first.`);
    }
  }
}

/**
 * Why a staircase cannot be sold, stored or moved to `to` right now: somebody is on it, or somebody upstairs (or downstairs)
 * would lose their way to the lot entry. Null when it is fine or the object is not a staircase.
 */
export function stairChangeReason(
  state: WorldState, content: ContentDB, lot: Lot, obj: PlacedObject, to?: { x: number; z: number; rot: PlacedObject['rot']; level: number },
): string | null {
  const def = content.objects[obj.defId];
  const geo = stairGeometry(obj, def);
  if (!geo) return null;
  for (const p of Object.values(state.people)) {
    if (p.location.kind !== 'lot' || p.location.lotId !== lot.id || !p.location.rise) continue;
    if (geo.footprint.some((t) => t.x === Math.floor((p.location as { x: number }).x) && t.z === Math.floor((p.location as { z: number }).z))) {
      return `${p.firstName} is on the stairs.`;
    }
  }
  const objects = { ...lot.objects };
  if (to) objects[obj.id] = { ...obj, ...to }; else delete objects[obj.id];
  const stranded = strandedPerson(state, content, lot, { ...lot, objects }, obj.level + 2);
  return stranded ? `${stranded.firstName} would be stuck on another floor. Leave a way down first.` : null;
}
