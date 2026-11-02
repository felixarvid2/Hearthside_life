// Usability check for generated lots: everything that would make a venue or a home unusable for people.

import type { ContentDB } from '../content/types';
import { tileKey } from '../core/ids';
import type { Tile } from '../core/nav';
import type { Id, Lot, WorldState } from '../core/types';
import { requireLot } from './lots';
import { LotNav } from './nav';
import { buildNavGrid, isFree, reachableMask } from './navgrid';
import { backEdges, doorTiles, validatePlacement } from './placement';
import { slotAccess } from './slots';
import { wallBetween } from './walls';

/** Throws when the finished lot has usability problems (shared by every builder, so a bad layout never reaches a save). */
export function finish(state: WorldState, content: ContentDB, lot: Lot, label: string): void {
  const problems = lotProblems(state, content, lot.id);
  if (problems.length > 0) throw new Error(`${label}: ${problems.slice(0, 4).join('; ')}${problems.length > 4 ? ` (+${problems.length - 4} more)` : ''}`);
}

/**
 * Everything that would make a lot unusable for people, as readable sentences (empty = fine):
 * - the entry and every door tile are walkable and connected to the entry;
 * - every object slot is usable (not through a wall, never inside furniture) and its approach tile reachable from the entry;
 * - interactive objects without slots have a free, reachable side;
 * - every placement still validates (re-checked with the object itself ignored);
 * - no free tile of the lot is sealed off from the entry (nobody can get trapped), apart from tiles that only a decorative
 *   object stands next to.
 */
export function lotProblems(state: WorldState, content: ContentDB, lotId: Id): string[] {
  const lot = requireLot(state, lotId);
  const out: string[] = [];
  const nav = new LotNav(() => state, content);
  const grid = buildNavGrid(lot, content, 0);
  const entry: Tile = { x: lot.entry.x, z: lot.entry.z };
  if (!isFree(grid, entry.x, entry.z)) return [`the lot entry (${entry.x}, ${entry.z}) is blocked`];
  const mask = reachableMask(grid, entry);
  const reach = (t: Tile) => isFree(grid, t.x, t.z) && mask[t.z * grid.width + t.x] === 1;
  const actx = { grid, content, objectById: (id: Id) => lot.objects[id] };

  for (const t of doorTiles(lot, content, 0)) if (!reach(t)) out.push(`a door tile (${t.x}, ${t.z}) cannot be reached from the entry`);
  for (const obj of Object.values(lot.objects)) {
    const def = content.objects[obj.defId];
    if (!def) { out.push(`unknown object ${obj.defId}`); continue; }
    const label = `${def.name} at (${obj.x}, ${obj.z})`;
    for (const a of slotAccess(actx, obj, def)) {
      if (!a.usable) out.push(`${label}: slot ${a.slot.slotId} is not usable`);
      else if (!reach(a.slot.approach)) out.push(`${label}: slot ${a.slot.slotId} cannot be reached from the entry`);
    }
    if (nav.slotsOf(lot.id, obj.id).length !== def.slots.length) out.push(`${label}: not every slot resolves`);
    if (def.slots.length === 0 && def.interactions.length > 0) {
      const stand = nav.standTilesNear(lot.id, obj.id);
      if (!stand.some(reach)) out.push(`${label}: no free side to use it from`);
    }
    const v = validatePlacement(state, content, lot.id, { defId: obj.defId, x: obj.x, z: obj.z, rot: obj.rot, level: obj.level, ignoreObjectId: obj.id });
    if (v.reasons.length > 0) out.push(`${label}: ${v.reasons.join(' ')}`);
  }
  // wall-hung objects keep their wall
  for (const obj of Object.values(lot.objects)) {
    const def = content.objects[obj.defId];
    if (def && (def.layer === 'wall' || def.needsWall)) for (const k of backEdges(obj, def)) if (!lot.walls[k]) out.push(`${def.name} at (${obj.x}, ${obj.z}) lost its wall`);
  }
  // sealed pockets: free tiles nobody can walk to
  let sealed = 0;
  let first: Tile | null = null;
  for (let z = 0; z < grid.depth; z++) for (let x = 0; x < grid.width; x++) {
    if (isFree(grid, x, z) && mask[z * grid.width + x] === 0) { sealed++; first ??= { x, z }; }
  }
  if (sealed > 0) out.push(`${sealed} free tile(s) are sealed off from the entry, the first at (${first!.x}, ${first!.z})`);
  return out;
}

/** Plain-text map of a lot (walls, doors, objects by first letter) for debugging layouts. */
export function lotAscii(state: WorldState, content: ContentDB, lotId: Id): string {
  const lot = requireLot(state, lotId);
  const g = buildNavGrid(lot, content, 0);
  const rows: string[] = [];
  for (let z = 0; z < lot.depth; z++) {
    let r = '';
    for (let x = 0; x < lot.width; x++) {
      const occ = g.occupant[z * g.width + x] ?? -1;
      const id = occ >= 0 ? g.occupantIds[occ] : undefined;
      const obj = id ? lot.objects[id] : undefined;
      const hasFloor = !!lot.floors[tileKey(0, x, z)];
      r += obj ? (obj.defId[0] ?? '?').toUpperCase() : hasFloor ? '.' : ' ';
      const east = x + 1 < lot.width ? wallBetween(lot, 0, { x, z }, { x: x + 1, z }) : undefined;
      r += east ? '|' : ' ';
    }
    rows.push(r);
  }
  return rows.join('\n');
}
