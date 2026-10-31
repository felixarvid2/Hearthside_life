// Pure previews for Build/Buy tools: validity, reasons, cost and affected tiles for what confirming would do.
// They never mutate state, so hovering, cancelling or an invalid preview can never spend money.

import type { ContentDB } from '../content/types';
import type { Tile } from '../core/nav';
import type { Cents, FinishRef, Id, WorldState } from '../core/types';
import type { WallSide } from '../world/walls';
import {
  planBuy, planFloorPaint, planMove, planPlaceFromInventory, planSell, planWallPaint, type BuyRequest, type Pose,
} from './plans';

export interface PreviewResult {
  ok: boolean;
  reasons: string[];
  /** Money confirming would charge now (0 in the sandbox; negative = income, e.g. a sale). */
  cost: Cents;
  /** Footprint tiles for objects; changed tiles for floors; tiles faced by changed wall sides for walls. */
  tiles: Tile[];
}

export type PaintTarget =
  | { kind: 'wallSide'; wallId: string; side: WallSide }
  | { kind: 'roomWalls'; level: number; tile: Tile }
  | { kind: 'floorTiles'; level: number; tiles: Tile[] }
  | { kind: 'roomFloor'; level: number; tile: Tile };

export interface PaintPreviewResult extends PreviewResult {
  /** Number of wall sides or floor tiles that would change. */
  count: number;
  /** Wall sides that would change (empty for floors). */
  sides: Array<{ wallId: string; side: WallSide }>;
}

/** Preview of buying and placing an object (includes affordability). */
export function previewBuy(state: WorldState, content: ContentDB, lotId: Id, householdId: Id, req: BuyRequest): PreviewResult {
  const p = planBuy(state, content, lotId, householdId, req);
  return { ok: p.ok, reasons: p.reasons, cost: p.cost, tiles: p.tiles };
}

/** Preview of moving or rotating a placed object (always free). */
export function previewMove(state: WorldState, content: ContentDB, lotId: Id, objectId: Id, to: Pose): PreviewResult {
  const p = planMove(state, content, lotId, objectId, to);
  return { ok: p.ok, reasons: p.reasons, cost: 0, tiles: p.tiles };
}

/** Preview of placing an object from the household inventory (free). */
export function previewPlaceFromInventory(state: WorldState, content: ContentDB, lotId: Id, householdId: Id, index: number, to: Pose): PreviewResult {
  const p = planPlaceFromInventory(state, content, lotId, householdId, index, to);
  return { ok: p.ok, reasons: p.reasons, cost: 0, tiles: p.tiles };
}

/** Preview of selling an object: cost is minus the sale value. */
export function previewSell(state: WorldState, content: ContentDB, lotId: Id, householdId: Id, objectId: Id): PreviewResult & { value: Cents } {
  const p = planSell(state, content, lotId, householdId, objectId);
  return { ok: p.ok, reasons: p.reasons, cost: p.cost, tiles: p.tiles, value: p.value };
}

/** Preview of a wall or floor paint operation; only sides/tiles that would change are counted and charged. */
export function previewPaint(state: WorldState, content: ContentDB, lotId: Id, householdId: Id, target: PaintTarget, finish: FinishRef): PaintPreviewResult {
  if (target.kind === 'wallSide' || target.kind === 'roomWalls') {
    const p = planWallPaint(state, content, lotId, householdId,
      target.kind === 'wallSide' ? { kind: 'side', wallId: target.wallId, side: target.side } : { kind: 'room', level: target.level, tile: target.tile },
      finish);
    return { ok: p.ok, reasons: p.reasons, cost: p.cost, tiles: p.tiles, count: p.changes.length, sides: p.changes.map((c) => ({ wallId: c.wallId, side: c.side })) };
  }
  const p = planFloorPaint(state, content, lotId, householdId,
    target.kind === 'floorTiles' ? { kind: 'tiles', level: target.level, tiles: target.tiles } : { kind: 'room', level: target.level, tile: target.tile },
    finish);
  return { ok: p.ok, reasons: p.reasons, cost: p.cost, tiles: p.tiles, count: p.changes.length, sides: [] };
}
