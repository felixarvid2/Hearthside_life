// Build-mode finish painting: maps a paint tool and a pick to a building paint target, previews it (cost,
// count, validity) with the highlight the renderer shows, builds the matching undoable command, and reads
// finishes for the eyedropper. Pure: nothing here changes the state.

import { paintFloorTiles, paintRoomFloor, paintRoomWalls, paintWallSide } from '../../building/commands';
import { previewPaint, type PaintTarget } from '../../building/preview';
import type { ContentDB } from '../../content/types';
import type { UndoableCommand } from '../../core/commands';
import { tileKey } from '../../core/ids';
import type { Tile } from '../../core/nav';
import type { FinishRef, Id, Lot, WorldState } from '../../core/types';
import { inLot } from '../../world/lots';
import { computeRooms, roomAt } from '../../world/rooms';
import { tileOnSide } from '../../world/walls';
import type { PaintPreview, PaintTool, PickResult } from '../api';

/** What the renderer highlights for the current paint preview. */
export type PaintHighlight =
  | { kind: 'wallSides'; sides: Array<{ wallId: string; side: 'a' | 'b' }> }
  | { kind: 'floorTiles'; level: number; tiles: Tile[] };

/** Matches the reasons building gives for edits that would change nothing ("It already has that finish."). */
const NO_OP = /already/i;

/** The floor tile a wall side faces (null when it lies off the lot). */
function facedTile(lot: Lot, wallId: string, side: 'a' | 'b'): Tile | null {
  const wall = lot.walls[wallId];
  if (!wall) return null;
  const t = tileOnSide(wall, side);
  return inLot(lot, t.x, t.z) ? t : null;
}

/** Paint target for a wall or floor tool and a pick, or a short reason when the pick does not fit the tool. */
export function paintTargetFor(lot: Lot, tool: PaintTool, pick: PickResult): PaintTarget | string {
  if (tool.kind === 'eyedropper') return 'The eyedropper picks finishes; it does not paint.';
  if (tool.kind === 'wall') {
    if (pick.kind === 'wall') {
      if (!lot.walls[pick.wallId]) return 'There is no wall there.';
      if (tool.scope === 'side') return { kind: 'wallSide', wallId: pick.wallId, side: pick.side };
      const t = facedTile(lot, pick.wallId, pick.side);
      return t ? { kind: 'roomWalls', level: pick.level, tile: t } : 'That side faces off the lot.';
    }
    if (pick.kind === 'floor' && tool.scope === 'room') return { kind: 'roomWalls', level: pick.level, tile: { ...pick.tile } };
    return 'Point at a wall.';
  }
  let tile: Tile | null = null;
  let level = 0;
  if (pick.kind === 'floor') { tile = pick.tile; level = pick.level; }
  else if (pick.kind === 'wall') { tile = facedTile(lot, pick.wallId, pick.side); level = pick.level; }
  if (!tile) return 'Point at the floor.';
  return tool.scope === 'room'
    ? { kind: 'roomFloor', level, tile: { x: tile.x, z: tile.z } }
    : { kind: 'floorTiles', level, tiles: [{ x: tile.x, z: tile.z }] };
}

/** Everything a target covers on the current lot, changed or not (for highlighting a no-op target). */
function targetGeometry(lot: Lot, target: PaintTarget): PaintHighlight | null {
  switch (target.kind) {
    case 'wallSide':
      return lot.walls[target.wallId] ? { kind: 'wallSides', sides: [{ wallId: target.wallId, side: target.side }] } : null;
    case 'roomWalls': {
      const room = roomAt(computeRooms(lot, target.level), target.tile.x, target.tile.z);
      return room && room.sides.length ? { kind: 'wallSides', sides: room.sides.map((s) => ({ ...s })) } : null;
    }
    case 'floorTiles': {
      const tiles = target.tiles.filter((t) => inLot(lot, t.x, t.z)).map((t) => ({ x: t.x, z: t.z }));
      return tiles.length ? { kind: 'floorTiles', level: target.level, tiles } : null;
    }
    case 'roomFloor': {
      const room = roomAt(computeRooms(lot, target.level), target.tile.x, target.tile.z);
      return room && !room.outdoor ? { kind: 'floorTiles', level: target.level, tiles: room.tiles.map((t) => ({ ...t })) } : null;
    }
  }
}

export interface PaintEvaluation {
  preview: PaintPreview;
  highlight: PaintHighlight | null;
  target: PaintTarget | null;
}

/**
 * Preview of painting the pick with the tool. Edits that would change nothing are silent (ok false, no reason)
 * but still highlight what is pointed at; other problems carry their reason.
 */
export function evaluatePaint(
  state: WorldState, content: ContentDB, lotId: Id, householdId: Id, tool: PaintTool, pick: PickResult,
): PaintEvaluation {
  const lot = state.lots[lotId];
  if (!lot) return { preview: { ok: false, reason: 'No lot is loaded.', cost: 0, count: 0 }, highlight: null, target: null };
  const target = paintTargetFor(lot, tool, pick);
  if (typeof target === 'string' || tool.kind === 'eyedropper') {
    return { preview: { ok: false, reason: typeof target === 'string' ? target : 'Choose a finish first.', cost: 0, count: 0 }, highlight: null, target: null };
  }
  const p = previewPaint(state, content, lotId, householdId, target, tool.finish);
  let highlight: PaintHighlight | null;
  if (p.count > 0) {
    highlight = target.kind === 'wallSide' || target.kind === 'roomWalls'
      ? { kind: 'wallSides', sides: p.sides.map((s) => ({ ...s })) }
      : { kind: 'floorTiles', level: target.level, tiles: p.tiles.map((t) => ({ x: t.x, z: t.z })) };
  } else highlight = targetGeometry(lot, target);
  const reason = p.reasons[0];
  const silent = !p.ok && p.count === 0 && reason !== undefined && NO_OP.test(reason);
  const preview: PaintPreview = { ok: p.ok, cost: p.cost, count: p.count, ...(!p.ok && reason && !silent ? { reason } : {}) };
  return { preview, highlight, target };
}

/** The undoable command for a paint target. */
export function paintCommand(lotId: Id, householdId: Id, target: PaintTarget, finish: FinishRef): UndoableCommand {
  switch (target.kind) {
    case 'wallSide': return paintWallSide(lotId, householdId, target.wallId, target.side, finish);
    case 'roomWalls': return paintRoomWalls(lotId, householdId, target.level, target.tile, finish);
    case 'floorTiles': return paintFloorTiles(lotId, householdId, target.level, target.tiles, finish);
    case 'roomFloor': return paintRoomFloor(lotId, householdId, target.level, target.tile, finish);
  }
}

/**
 * Finish under a pick for the eyedropper: a wall side's finish, or the floor finish of a tile (a wall pick
 * reads the floor in front of that side when `want` is 'floor'). Null for bare ground or nothing usable.
 */
export function finishAt(lot: Lot, pick: PickResult, want: 'wall' | 'floor' | null): { kind: 'wall' | 'floor'; finish: FinishRef } | null {
  if (pick.kind === 'wall' && want !== 'floor') {
    const wall = lot.walls[pick.wallId];
    if (!wall) return null;
    const f = pick.side === 'a' ? wall.sideA : wall.sideB;
    return { kind: 'wall', finish: { designId: f.designId, paletteId: f.paletteId } };
  }
  if (want === 'wall') return null;
  const tile = pick.kind === 'floor' ? pick.tile : pick.kind === 'wall' ? facedTile(lot, pick.wallId, pick.side) : null;
  if (!tile || (pick.kind !== 'floor' && pick.kind !== 'wall')) return null;
  const f = lot.floors[tileKey(pick.level, tile.x, tile.z)];
  return f ? { kind: 'floor', finish: { designId: f.designId, paletteId: f.paletteId } } : null;
}

export function sameFinish(a: FinishRef, b: FinishRef): boolean {
  return a.designId === b.designId && a.paletteId === b.paletteId;
}
