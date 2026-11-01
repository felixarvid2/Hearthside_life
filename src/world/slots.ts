// Interaction slots in lot space. resolveSlots() is pure geometry: the definition's anchors, facing and
// approach tiles rotated with the object (core/geometry rotateLocal / rotateFacing / rotateCell), so
// footprints, anchors and approach tiles always turn together.
//
// slotAccess() decides whether and how a person reaches each slot on the current lot. The simulation walks
// to `approach` and then stands, sits or lies at the anchor (x, z, facing, posture), so both must be sound:
// - A standing person never stands inside other furniture: a standing slot's anchor tile must be walkable,
//   unless it lies inside the object's own blocking footprint (a shower stall).
// - Anchor outside the footprint (use slots in front of a fridge, stove, sink, TV...): only the authored
//   approach tile counts. It must be walkable, touch the object without a wall in between and connect to the
//   anchor tile. An appliance facing a wall is therefore unusable, never operated through the wall.
// - Surface items (TV, computer) whose approach tile holds a seat that faces the item across an open edge
//   (a desk chair pushed up to the desk) are used from that seat: the slot becomes the seat's sit position.
// - Anchor inside the footprint (seats, beds, shower): the authored approach, else the nearest walkable
//   neighbour of the anchor tile across an open edge, preferring the authored direction (front, sides, back),
//   e.g. a dining chair pushed up to a table is approached from its side, a bed against a wall from its foot.
// A slot meeting none of these is unusable; LotNav.slotsOf only returns usable slots.

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

/** Lot tile of the footprint cell nearest to the slot anchor (the anchor tile clamped into the footprint). */
export function slotAnchorTile(obj: Pick<PlacedObject, 'x' | 'z' | 'rot'>, def: Pick<ObjectDef, 'footprint'>, slot: Pick<ObjectSlot, 'pos'>): Tile {
  const c = slotAnchorCell(slot, def.footprint);
  const r = rotateCell(c.x, c.z, def.footprint, obj.rot);
  return { x: obj.x + r.x, z: obj.z + r.z };
}

/** Lot tile containing the slot anchor (may lie outside the footprint) and whether it is inside it. */
export function slotAnchorPlace(obj: Pick<PlacedObject, 'x' | 'z' | 'rot'>, def: Pick<ObjectDef, 'footprint'>, slot: Pick<ObjectSlot, 'pos'>): { tile: Tile; inside: boolean } {
  const lx = Math.floor(slot.pos[0]), lz = Math.floor(slot.pos[1]);
  const inside = lx >= 0 && lz >= 0 && lx < def.footprint.w && lz < def.footprint.d;
  const r = rotateCell(lx, lz, def.footprint, obj.rot);
  return { tile: { x: obj.x + r.x, z: obj.z + r.z }, inside };
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
  const blocking = blocksMovement(def);
  const front = frontDir(obj.rot);
  const out: SlotAccess[] = [];
  for (const slot of def.slots) {
    const ws = resolveSlot(obj, def, slot);
    const { tile: anchor, inside } = slotAnchorPlace(obj, def, slot);
    const standing = slot.posture === 'standing' || slot.posture === 'walking';
    // a standing person must not end up inside other furniture (the object's own stall excepted)
    const anchorOk = !standing || (inside && blocking) || isFree(g, anchor.x, anchor.z);
    const reaches = (t: Tile) => isFree(g, t.x, t.z) && touchesFootprint(g, t, tiles) && touchesFootprint(g, t, [anchor]);
    if (anchorOk && reaches(ws.approach)) {
      out.push({ slot: ws, usable: true, via: 'definition' });
      continue;
    }
    if (allowSeat && def.layer === 'surface' && !inside) {
      const seat = seatAccess(ctx, obj, tiles, ws.approach);
      if (seat) {
        const s = seat.sit;
        out.push({ slot: { ...ws, x: s.x, z: s.z, height: s.height, facing: s.facing, approach: s.approach, posture: s.posture }, usable: true, via: 'seat', seatId: seat.seatId });
        continue;
      }
    }
    let found: Tile | null = null;
    if (inside && anchorOk) {
      for (const c of nearbyCandidates(anchor, ws.approach, front, !blocking)) {
        const same = c.x === anchor.x && c.z === anchor.z;
        if (isFree(g, c.x, c.z) && (same || edgeOpen(g, anchor, c))) { found = c; break; }
      }
    }
    if (found) out.push({ slot: { ...ws, approach: found }, usable: true, via: 'nearby' });
    else out.push({ slot: ws, usable: false, via: 'none' });
  }
  return out;
}

/** Only the usable slots, with the approach tiles people actually use. */
export function usableSlots(ctx: AccessContext, obj: PlacedObject, def: ObjectDef): WorldSlot[] {
  return slotAccess(ctx, obj, def).filter((a) => a.usable).map((a) => a.slot);
}

/**
 * A seat standing on the item's approach tile that people can use the item from: it touches one of the
 * item's tiles across an open edge, its sit slot faces the item (within about 60 degrees) and is usable.
 */
function seatAccess(ctx: AccessContext, item: PlacedObject, itemTiles: Tile[], tile: Tile): { seatId: Id; sit: WorldSlot } | null {
  const g = ctx.grid;
  const seatId = occupantAt(g, tile.x, tile.z);
  if (!seatId || seatId === item.id) return null;
  if (!itemTiles.some((f) => Math.abs(f.x - tile.x) + Math.abs(f.z - tile.z) === 1 && edgeOpen(g, f, tile))) return null;
  const seat = ctx.objectById(seatId);
  const sdef = seat ? ctx.content.objects[seat.defId] : undefined;
  if (!seat || !sdef) return null;
  const cx = itemTiles.reduce((a, t) => a + t.x + 0.5, 0) / itemTiles.length;
  const cz = itemTiles.reduce((a, t) => a + t.z + 0.5, 0) / itemTiles.length;
  for (const a of slotAccess(ctx, seat, sdef, false)) {
    if (!a.usable || a.slot.kind !== 'sit') continue;
    const f = facingDir(a.slot.facing);
    const dx = cx - a.slot.x, dz = cz - a.slot.z, len = Math.hypot(dx, dz);
    if (len > 1e-6 && (f.x * dx + f.z * dz) / len > 0.5) return { seatId, sit: a.slot };
  }
  return null;
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
