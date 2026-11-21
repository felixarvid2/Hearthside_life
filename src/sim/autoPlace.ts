// Automatic placement of furniture that came along on a move ("Place it in the new home").
// Deterministic: items go in a stable order (big floor pieces first, surface items last, ties by id) and every item tries
// the rooms of the new home (same room kind as before first, then the other indoor rooms; ground floor before upper floors),
// tile by tile in row-major order, with the four rotations. Each candidate goes through the same validatePlacement as Buy mode
// (footprint, walls, wall-mounted items, doors and paths kept clear, reachability), so nothing is placed that Buy mode would refuse.
// The number of validator calls per move is capped, so a big inventory cannot stall the frame; what is left stays in the inventory.

import type { ContentDB } from '../content/types';
import { footprintTiles } from '../core/geometry';
import { tileKey } from '../core/ids';
import type { Household, Id, Lot, PlacedObject, Rot, WorldState } from '../core/types';
import { MAX_LEVELS } from '../world/levels';
import { computeRooms, type Room } from '../world/rooms';
import { validatePlacement } from '../world/placement';

/** Upper bound on validatePlacement calls for one move. */
export const AUTO_PLACE_BUDGET = 6000;

const ROTS: readonly Rot[] = [0, 1, 2, 3];

/** The room kind that fits a set of objects best: the most common entry of `def.rooms` (first entries count double; ties: alphabetical). */
function dominantKind(content: Pick<ContentDB, 'objects'>, objs: readonly PlacedObject[]): string | null {
  const tally = new Map<string, number>();
  for (const o of objs) {
    const kinds = content.objects[o.defId]?.rooms ?? [];
    kinds.forEach((k, i) => tally.set(k, (tally.get(k) ?? 0) + (i === 0 ? 2 : 1)));
  }
  let best: string | null = null;
  for (const [k, n] of [...tally].sort((a, b) => (a[0] < b[0] ? -1 : 1))) if (best === null || n > tally.get(best)!) best = k;
  return best;
}

const inRoom = (room: Room, x: number, z: number) => room.tiles.some((t) => t.x === x && t.z === z);

/** The kind of room (kitchen, bedroom...) each object stands in, judged from what else stands there. Call before the objects leave. */
export function roomKindsOf(content: Pick<ContentDB, 'objects'>, lot: Lot, objectIds: readonly Id[]): Record<Id, string> {
  const out: Record<Id, string> = {};
  const byLevel = new Map<number, Room[]>();
  for (const id of objectIds) {
    const o = lot.objects[id];
    if (!o) continue;
    if (!byLevel.has(o.level)) byLevel.set(o.level, computeRooms(lot, o.level));
    const room = byLevel.get(o.level)!.find((r) => inRoom(r, o.x, o.z));
    if (!room || room.outdoor) continue;
    const kind = dominantKind(content, Object.values(lot.objects).filter((p) => p.level === o.level && inRoom(room, p.x, p.z)));
    if (kind) out[id] = kind;
  }
  return out;
}

export interface AutoPlaceResult { placed: number; left: number }

/** Places the objects with the given ids from the household inventory into `lot`; returns how many went in and how many stayed. */
export function autoPlaceInventory(
  state: WorldState, content: ContentDB, hh: Household, lot: Lot, objectIds: readonly Id[], kinds: Record<Id, string>,
): AutoPlaceResult {
  const wanted = new Set(objectIds);
  const items = hh.inventory.filter((e) => wanted.has(e.object.id)).map((e) => e.object);
  const area = (o: PlacedObject) => { const d = content.objects[o.defId]; return d ? d.footprint.w * d.footprint.d : 0; };
  const late = (o: PlacedObject) => (content.objects[o.defId]?.layer === 'surface' ? 1 : 0);
  items.sort((a, b) => late(a) - late(b) || area(b) - area(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Rooms per level, ground floor first, each with the kind of what already stands there. Upper levels only count where there is floor.
  const rooms: Array<{ room: Room; kind: string | null }> = [];
  for (let level = 0; level < MAX_LEVELS; level++) {
    for (const room of computeRooms(lot, level)) {
      if (level > 0 && !room.tiles.some((t) => lot.floors[tileKey(level, t.x, t.z)] !== undefined)) continue;
      rooms.push({ room, kind: dominantKind(content, Object.values(lot.objects).filter((p) => p.level === level && inRoom(room, p.x, p.z))) });
    }
  }

  let budget = AUTO_PLACE_BUDGET;
  let placed = 0;
  for (const obj of items) {
    const def = content.objects[obj.defId];
    if (!def) continue;
    const outdoorOnly = def.rooms.length > 0 && def.rooms.every((r) => r === 'outdoor');
    const want = kinds[obj.id] ?? def.rooms[0] ?? null;
    const matches = (r: { kind: string | null }) => r.kind !== null && r.kind === want;
    // Ground floor first, then same kind, then room order (Array.sort is stable).
    const ordered = rooms.filter(({ room }) => (outdoorOnly ? room.outdoor : !room.outdoor))
      .sort((a, b) => a.room.level - b.room.level || Number(!matches(a)) - Number(!matches(b)));
    search:
    for (const { room } of ordered) {
      for (const t of room.tiles) {
        for (const rot of ROTS) {
          if (budget <= 0) break search;
          // cheap rejection: the whole footprint of a floor piece must lie in this room
          if (def.layer !== 'surface' && footprintTiles(t.x, t.z, def.footprint, rot).some((f) => !inRoom(room, f.x, f.z))) continue;
          budget--;
          const v = validatePlacement(state, content, lot.id, { defId: obj.defId, x: t.x, z: t.z, rot, level: room.level });
          if (!v.ok) continue;
          const i = hh.inventory.findIndex((e) => e.object.id === obj.id);
          if (i < 0) break search;
          hh.inventory.splice(i, 1);
          obj.x = t.x; obj.z = t.z; obj.rot = rot; obj.level = room.level;
          if (v.supportId) obj.supportId = v.supportId; else delete obj.supportId;
          obj.ownerHouseholdId = hh.id;
          lot.objects[obj.id] = obj;
          placed++;
          break search;
        }
      }
    }
  }
  return { placed, left: items.length - placed };
}
