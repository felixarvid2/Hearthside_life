// Object placement rules (brief section 17). validatePlacement never mutates state; build/buy commands,
// previews and the starter lots all use it, so the same rules apply everywhere.
//
// Checks, in order (the access checks only run when the basic checks pass):
// - lot, definition, level, rotation and integer position; footprint inside the lot;
// - no wall on an edge inside the footprint;
// - overlaps by layer: floor vs floor, rug vs rug, ceiling vs ceiling, surface items vs surface items on the
//   same support, wall items vs wall items on the same wall;
// - surface items rest completely on one supporting floor object that has a surfaceHeight;
// - wall items (and any def with needsWall) back onto solid wall edges without doors or windows;
// - blocking objects keep both tiles of every door and the lot entry clear and never cover a standing or
//   walking person (seated and lying people are on their object);
// - access: at least one slot is usable (not through a wall) and reachable from the lot entry; a blocking
//   object never cuts off part of the lot and never takes the last usable slot of another object.

import type { ContentDB, ObjectDef } from '../content/types';
import { footprintTiles, rotateCell } from '../core/geometry';
import type { Tile } from '../core/nav';
import type { Id, Lot, PlacedObject, Rot, WorldState } from '../core/types';
import { hasLevel, inLot } from './lots';
import { blocksMovement, buildNavGrid, reachableMask, type NavGrid } from './navgrid';
import { slotAccess, type SlotAccess } from './slots';
import { edgeBetween, edgeOnSide, edgeTiles, openingOnWall, type TileSide } from './walls';

export { resolveSlots } from './slots';

export interface PlacementRequest {
  defId: string;
  x: number;
  z: number;
  rot: Rot;
  level: number;
  /** Object treated as absent (the object being moved). */
  ignoreObjectId?: Id;
}

export interface PlacementResult {
  ok: boolean;
  /** Player-facing reasons the placement is invalid (empty when ok). */
  reasons: string[];
  /** Footprint tiles of the request (empty when the definition is unknown). */
  tiles: Tile[];
  /** Surface items: the object they would rest on. */
  supportId?: Id;
  /** Non-blocking notes, e.g. that some of the object's sides cannot be used. */
  warnings: string[];
}

/** Id used for the hypothetical object during access checks. */
export const PLACING_ID = '__placing__';

/** Tiles covered by a placed object (empty for unknown definitions). */
export function objectTiles(obj: Pick<PlacedObject, 'x' | 'z' | 'rot'>, def: Pick<ObjectDef, 'footprint'> | undefined): Tile[] {
  return def ? footprintTiles(obj.x, obj.z, def.footprint, obj.rot) : [];
}

/** Compass side an object's back faces (wall-attached objects hang on this side). */
export function backSide(rot: Rot): TileSide {
  return (['n', 'w', 's', 'e'] as const)[rot];
}

/** Wall edges behind a wall-attached object: the back side of each tile of its rot-0 back row. */
export function backEdges(req: { x: number; z: number; rot: Rot; level: number }, def: Pick<ObjectDef, 'footprint'>): string[] {
  const out: string[] = [];
  for (let i = 0; i < def.footprint.w; i++) {
    const c = rotateCell(i, 0, def.footprint, req.rot);
    out.push(edgeOnSide(req.level, { x: req.x + c.x, z: req.z + c.z }, backSide(req.rot)).key);
  }
  return out;
}

const keyOf = (t: Tile) => `${t.x},${t.z}`;

/** Validates placing (or moving, with ignoreObjectId) an object. Pure: never changes state. */
export function validatePlacement(state: WorldState, content: ContentDB, lotId: Id, req: PlacementRequest): PlacementResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const fail = (reason: string, tiles: Tile[] = []): PlacementResult => ({ ok: false, reasons: [reason], tiles, warnings });

  const lot = state.lots[lotId];
  if (!lot) return fail('Unknown lot.');
  const def = content.objects[req.defId];
  if (!def) return fail(`Unknown object "${req.defId}".`);
  if (![0, 1, 2, 3].includes(req.rot)) return fail('Invalid rotation.');
  if (!hasLevel(lot, req.level)) return fail('That floor does not exist.');
  if (!Number.isInteger(req.x) || !Number.isInteger(req.z)) return fail('Objects snap to whole tiles.');

  const tiles = footprintTiles(req.x, req.z, def.footprint, req.rot);
  if (tiles.some((t) => !inLot(lot, t.x, t.z))) return fail('It does not fit on the lot.', tiles);
  const fp = new Set(tiles.map(keyOf));

  // Walls inside the footprint.
  for (const t of tiles) {
    for (const n of [{ x: t.x + 1, z: t.z }, { x: t.x, z: t.z + 1 }]) {
      if (!fp.has(keyOf(n))) continue;
      const e = edgeBetween(req.level, t, n);
      if (e && lot.walls[e.key]) { reasons.push('A wall runs through it.'); break; }
    }
    if (reasons.length) break;
  }

  const others = Object.values(lot.objects)
    .filter((o) => o.level === req.level && o.id !== req.ignoreObjectId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // unknown definitions occupy their origin tile (as in the navigation grid)
  const overlaps = (o: PlacedObject) => {
    const od = content.objects[o.defId];
    return (od ? objectTiles(o, od) : [{ x: o.x, z: o.z }]).some((t) => fp.has(keyOf(t)));
  };

  // Layer rules.
  let supportId: Id | undefined;
  if (def.layer === 'surface') {
    const support = findSupport(content, others, tiles);
    if (!support) reasons.push('It needs a table, counter or other surface to stand on.');
    else {
      supportId = support.id;
      const taken = others.find((o) => o.supportId === support.id && content.objects[o.defId]?.layer === 'surface' && overlaps(o));
      if (taken) reasons.push(`The ${content.objects[taken.defId]?.name ?? 'item'} is already there.`);
    }
  } else if (def.layer === 'wall') {
    const backs = new Set(backEdges(req, def));
    const hit = others.find((o) => {
      const od = content.objects[o.defId];
      return od?.layer === 'wall' && overlaps(o) && backEdges(o, od).some((k) => backs.has(k));
    });
    if (hit) reasons.push(`It overlaps the ${content.objects[hit.defId]?.name ?? 'object'}.`);
  } else {
    const hit = others.find((o) => {
      const od = content.objects[o.defId];
      return (od ? od.layer === def.layer : def.layer === 'floor') && overlaps(o);
    });
    if (hit) reasons.push(`It overlaps the ${content.objects[hit.defId]?.name ?? 'object'}.`);
  }

  if (def.layer === 'wall' || def.needsWall) {
    for (const k of backEdges(req, def)) {
      if (!lot.walls[k]) { reasons.push('It needs a wall behind it.'); break; }
      if (openingOnWall(lot, k)) { reasons.push('It cannot hang over a door or window.'); break; }
    }
  }

  const blocking = blocksMovement(def);
  if (blocking) {
    if (doorTiles(lot, content, req.level).some((t) => fp.has(keyOf(t)))) reasons.push('Keep doorways clear.');
    if (lot.entry.level === req.level && fp.has(keyOf(lot.entry))) reasons.push('Keep the lot entry clear.');
    const person = Object.values(state.people).find((p) => p.location.kind === 'lot' && p.location.lotId === lot.id
      && p.location.level === req.level && (p.location.posture === 'standing' || p.location.posture === 'walking')
      && fp.has(keyOf({ x: Math.floor(p.location.x), z: Math.floor(p.location.z) })));
    if (person) reasons.push(`${person.firstName} is standing there.`);
  }

  if (reasons.length === 0) accessChecks(content, lot, req, def, tiles, supportId, reasons, warnings);
  return { ok: reasons.length === 0, reasons, tiles, ...(supportId ? { supportId } : {}), warnings };
}

/** Both tiles of every door on the level (kept clear of blocking furniture). */
export function doorTiles(lot: Lot, content: ContentDB, level: number): Tile[] {
  const out: Tile[] = [];
  for (const op of Object.values(lot.openings)) {
    const wall = lot.walls[op.wallId];
    if (!wall || wall.level !== level || content.openings[op.defId]?.kind !== 'door') continue;
    out.push(...edgeTiles(wall));
  }
  return out;
}

function findSupport(content: ContentDB, others: PlacedObject[], tiles: Tile[]): PlacedObject | undefined {
  const first = tiles[0];
  if (!first) return undefined;
  for (const o of others) {
    const od = content.objects[o.defId];
    if (!od || od.layer !== 'floor' || !od.surfaceHeight || od.surfaceHeight <= 0) continue;
    const cover = new Set(objectTiles(o, od).map(keyOf));
    if (!cover.has(keyOf(first))) continue;
    return tiles.every((t) => cover.has(keyOf(t))) ? o : undefined;
  }
  return undefined;
}

function countReachable(access: SlotAccess[], mask: Uint8Array, g: NavGrid): number {
  return access.filter((a) => a.usable && mask[a.slot.approach.z * g.width + a.slot.approach.x] === 1).length;
}

function accessChecks(
  content: ContentDB, lot: Lot, req: PlacementRequest, def: ObjectDef, tiles: Tile[], supportId: Id | undefined,
  reasons: string[], warnings: string[],
): void {
  const blocking = blocksMovement(def);
  const hypo: PlacedObject = {
    id: PLACING_ID, defId: def.id, level: req.level, x: req.x, z: req.z, rot: req.rot, finishes: {}, purchasePrice: 0,
    boughtAt: 0, ownerHouseholdId: null, condition: { dirt: 0, broken: false }, ...(supportId ? { supportId } : {}),
  };
  const after = buildNavGrid(lot, content, req.level, {
    ...(req.ignoreObjectId ? { ignoreObjectId: req.ignoreObjectId } : {}),
    ...(blocking ? { extra: { id: PLACING_ID, tiles } } : {}),
  });
  const objAfter = (id: Id) => (id === PLACING_ID ? hypo : id === req.ignoreObjectId ? undefined : lot.objects[id]);
  const entry = lot.entry.level === req.level && inLot(lot, lot.entry.x, lot.entry.z) ? lot.entry : null;
  const maskAfter = entry ? reachableMask(after, entry) : null;

  if (def.slots.length > 0) {
    const access = slotAccess({ grid: after, content, objectById: objAfter }, hypo, def);
    const usable = access.filter((a) => a.usable);
    if (usable.length === 0) reasons.push('There is no free side to use it from.');
    else {
      if (maskAfter && countReachable(usable, maskAfter, after) === 0) reasons.push('It cannot be reached from the lot entry.');
      if (usable.length < access.length) warnings.push('Some of its sides cannot be used.');
    }
  }
  if (!blocking || !entry || !maskAfter) return;

  const before = buildNavGrid(lot, content, req.level);
  const maskBefore = reachableMask(before, entry);
  for (let i = 0; i < maskBefore.length; i++) {
    if (maskBefore[i] && after.occupant[i] === -1 && !maskAfter[i]) { reasons.push('It would cut off part of the lot.'); break; }
  }
  const objBefore = (id: Id) => lot.objects[id];
  const others = Object.values(lot.objects)
    .filter((o) => o.level === req.level && o.id !== req.ignoreObjectId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const other of others) {
    const od = content.objects[other.defId];
    if (!od || od.slots.length === 0) continue;
    if (countReachable(slotAccess({ grid: before, content, objectById: objBefore }, other, od), maskBefore, before) === 0) continue;
    if (countReachable(slotAccess({ grid: after, content, objectById: objAfter }, other, od), maskAfter, after) === 0) {
      reasons.push(`It would block access to the ${od.name}.`);
    }
  }
}
