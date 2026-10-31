// Interaction slots in lot space. resolveSlots() is pure geometry: the definition's anchors, facing and
// approach tiles rotated with the object (core/geometry rotateLocal / rotateFacing / rotateCell), so
// footprints, anchors and approach tiles always turn together.
//
// slotAccess() then decides how a person actually reaches each slot on the current lot:
// 1. the definition's approach tile, when it is walkable and not separated from the object by a wall;
// 2. surface items only (TV, computer): when that tile holds a seat (a dining or desk chair pushed up to
//    the support), the seat's own approach tile, since people use the item from the chair;
// 3. otherwise the nearest walkable neighbour of the slot's anchor tile, preferring the definition's
//    direction (front, then the sides, then the back), e.g. a dining chair pushed up to a table is
//    approached from its side, and a bed standing against a wall from its foot end.
// A slot with none of these is unusable (an appliance facing a wall is never operated through it).

import type { ContentDB, ObjectDef, ObjectSlot } from '../content/types';
import { facingDir, footprintTiles, rotateCell, rotateFacing, rotateLocal } from '../core/geometry';
import type { Tile, WorldSlot } from '../core/nav';
import type { Id, Lot, PlacedObject } from '../core/types';
import { blocksMovement, edgeOpen, isFree, occupantAt, type NavGrid } from './navgrid';

/** Rot-0 local cell holding the slot anchor, clamped into the footprint. Rotated as a cell so the anchor
 *  tile is rotation-consistent even for anchors that sit exactly on a tile boundary. */
export function slotAnchorCell(slot: Pick<ObjectSlot, 'pos'>, fp: { w: number; d: number }): { x: number; z: number } {
  const cx = Math.min(fp.w - 1, Math.max(0, Math.floor(slot.pos[0])));
  const cz = Math.min(fp.d - 1, Math.max(0, Math.floor(slot.pos[1])));
  return { x: cx, z: cz };
}

/** Lot tile containing the slot's anchor. */
export function slotAnchorTile(obj: Pick<PlacedObject, 'x' | 'z' | 'rot'>, def: Pick<ObjectDef, 'footprint'>, slot: Pick<ObjectSlot, 'pos'>): Tile {
  const c = slotAnchorCell(slot, def.footprint);
  const r = rotateCell(c.x, c.z, def.footprint, obj.rot);
  return { x: obj.x + r.x, z: obj.z + r.z };
}

/** One definition slot resolved into lot space (definition approach tile, no access fallback). */
export function resolveSlot(obj: PlacedObject, def: ObjectDef, slot: ObjectSlot): WorldSlot {
  const fp = def.footprint;
  const p = rotateLocal(slot.pos[0], slot.pos[1], fp, obj.rot);
  const a = rotateCell(slot.approach[0], slot.approach[1], fp, obj.rot);
  return {
    objectId: obj.id,
    slotId: slot.id,
    kind: slot.kind,
    x: obj.x + p.x,
    z: obj.z + p.z,
    height: slot.height,
    facing: rotateFacing(slot.facing, obj.rot),
    approach: { x: obj.x + a.x, z: obj.z + a.z },
    posture: slot.posture,
  };
}

/**
 * All slots of a placed object in lot space, straight from the definition (anchors, facing and approach
 * tiles rotated with the object). The lot parameter is part of the module contract; access on the
 * current lot (fallback approach tiles) is decided by slotAccess / LotNav.slotsOf.
 */
export function resolveSlots(_lot: Lot, obj: PlacedObject, def: ObjectDef): WorldSlot[] {
  return def.slots.map((s) => resolveSlot(obj, def, s));
}

/** Unit grid direction an object's front faces (+z at rot 0). */
export function frontDir(rot: PlacedObject['rot']): { x: number; z: number } {
  const d = facingDir(rotateFacing(0, rot));
  return { x: Math.round(d.x), z: Math.round(d.z) };
}

export type AccessVia = 'definition' | 'seat' | 'nearby' | 'none';

export interface SlotAccess {
  /** The slot with the approach tile people actually use (the definition's when unusable). */
  slot: WorldSlot;
  usable: boolean;
  via: AccessVia;
  /** For via 'seat': the chair people use the item from. */
  seatId?: Id;
}

export interface AccessContext {
  grid: NavGrid;
  content: ContentDB;
  /** Placed objects by id, including a hypothetical object being placed. */
  objectById: (id: Id) => PlacedObject | undefined;
}

const ORTHO: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * True when tile `a` touches the footprint without a wall in between: inside it, orthogonally adjacent
 * across an open edge, or diagonally adjacent with an open corner. Approach tiles that do not touch the
 * footprint at all (slots used from a distance) are accepted.
 */
export function touchesFootprint(g: NavGrid, a: Tile, tiles: readonly Tile[]): boolean {
  let adjacent = false;
  for (const f of tiles) {
    if (f.x === a.x && f.z === a.z) return true;
    if (Math.abs(a.x - f.x) + Math.abs(a.z - f.z) === 1) {
      adjacent = true;
      if (edgeOpen(g, a, f)) return true;
    }
  }
  if (adjacent) return false;
  let diagonal = false;
  for (const f of tiles) {
    const dx = a.x - f.x, dz = a.z - f.z;
    if (Math.abs(dx) !== 1 || Math.abs(dz) !== 1) continue;
    diagonal = true;
    const c1 = { x: f.x + dx, z: f.z }, c2 = { x: f.x, z: f.z + dz };
    if ((edgeOpen(g, f, c1) && edgeOpen(g, c1, a)) || (edgeOpen(g, f, c2) && edgeOpen(g, c2, a))) return true;
  }
  return !diagonal;
}

/** Fallback approach tiles around a slot anchor, best first. */
function nearbyCandidates(anchor: Tile, defApproach: Tile, front: { x: number; z: number }, includeAnchor: boolean): Tile[] {
  let dx = Math.sign(defApproach.x - anchor.x), dz = Math.sign(defApproach.z - anchor.z);
  if (dx === 0 && dz === 0) { dx = front.x; dz = front.z; }
  const list = ORTHO.map(([ox, oz], order) => ({ t: { x: anchor.x + ox, z: anchor.z + oz }, score: ox * dx + oz * dz, order }));
  list.sort((a, b) => b.score - a.score || a.order - b.order);
  return [...(includeAnchor ? [anchor] : []), ...list.map((e) => e.t)];
}

/** How each slot of an object is reached on the given grid (see the module comment for the rules). */
export function slotAccess(ctx: AccessContext, obj: PlacedObject, def: ObjectDef, allowSeat = true): SlotAccess[] {
  const g = ctx.grid;
  const tiles = footprintTiles(obj.x, obj.z, def.footprint, obj.rot);
  const front = frontDir(obj.rot);
  const out: SlotAccess[] = [];
  for (const slot of def.slots) {
    const ws = resolveSlot(obj, def, slot);
    const anchor = slotAnchorTile(obj, def, slot);
    if (isFree(g, ws.approach.x, ws.approach.z) && touchesFootprint(g, ws.approach, tiles)) {
      out.push({ slot: ws, usable: true, via: 'definition' });
      continue;
    }
    if (allowSeat && def.layer === 'surface') {
      const seat = seatAccess(ctx, obj.id, ws.approach);
      if (seat) {
        out.push({ slot: { ...ws, approach: seat.approach }, usable: true, via: 'seat', seatId: seat.seatId });
        continue;
      }
    }
    let found: Tile | null = null;
    for (const c of nearbyCandidates(anchor, ws.approach, front, !blocksMovement(def))) {
      const same = c.x === anchor.x && c.z === anchor.z;
      if (isFree(g, c.x, c.z) && (same || edgeOpen(g, anchor, c))) { found = c; break; }
    }
    if (found) out.push({ slot: { ...ws, approach: found }, usable: true, via: 'nearby' });
    else out.push({ slot: ws, usable: false, via: 'none' });
  }
  return out;
}

function seatAccess(ctx: AccessContext, selfId: Id, tile: Tile): { seatId: Id; approach: Tile } | null {
  const seatId = occupantAt(ctx.grid, tile.x, tile.z);
  if (!seatId || seatId === selfId) return null;
  const seat = ctx.objectById(seatId);
  const sdef = seat ? ctx.content.objects[seat.defId] : undefined;
  if (!seat || !sdef || !sdef.slots.some((s) => s.kind === 'sit')) return null;
  const sit = slotAccess(ctx, seat, sdef, false).find((a) => a.usable && a.slot.kind === 'sit');
  return sit ? { seatId, approach: sit.slot.approach } : null;
}

/**
 * Walkable tiles next to an object for standing interactions, best first: its own tiles when it does
 * not block (wall decor, rugs), then tiles in front, beside and behind it. Never across a wall.
 */
export function standTiles(g: NavGrid, obj: PlacedObject, def: ObjectDef): Tile[] {
  const tiles = footprintTiles(obj.x, obj.z, def.footprint, obj.rot);
  const inFp = new Set(tiles.map((t) => `${t.x},${t.z}`));
  const front = frontDir(obj.rot);
  const best = new Map<string, { t: Tile; pri: number }>();
  const add = (t: Tile, pri: number) => {
    const k = `${t.x},${t.z}`;
    const cur = best.get(k);
    if (!cur || pri < cur.pri) best.set(k, { t, pri });
  };
  if (!blocksMovement(def)) for (const t of tiles) if (isFree(g, t.x, t.z)) add(t, 0);
  for (const f of tiles) {
    for (const [ox, oz] of ORTHO) {
      const n = { x: f.x + ox, z: f.z + oz };
      if (inFp.has(`${n.x},${n.z}`) || !isFree(g, n.x, n.z) || !edgeOpen(g, f, n)) continue;
      const dot = ox * front.x + oz * front.z;
      add(n, dot > 0 ? 1 : dot === 0 ? 2 : 3);
    }
  }
  return [...best.values()].sort((a, b) => a.pri - b.pri || a.t.z - b.t.z || a.t.x - b.t.x).map((e) => e.t);
}
