// Buy-mode placement previews (tile input) and the commands that confirm them. Previews only read the state
// (building/preview.ts); confirming runs buyObject / moveObject / placeFromInventory through the undo stack.

import { buyObject, moveObject, placeFromInventory } from '../../building/commands';
import { previewBuy, previewMove, previewPlaceFromInventory } from '../../building/preview';
import type { ContentDB } from '../../content/types';
import type { UndoableCommand } from '../../core/commands';
import type { Id, WorldState } from '../../core/types';
import type { PlacementState } from '../api';

/** True when a move preview sits exactly where the object already is (confirming changes nothing). */
export function isUnchangedMove(state: WorldState, lotId: Id, p: PlacementState): boolean {
  if (p.source !== 'move' || !p.objectId) return false;
  const obj = state.lots[lotId]?.objects[p.objectId];
  return !!obj && obj.x === p.x && obj.z === p.z && obj.rot === p.rot && obj.level === p.level;
}

/**
 * Validity, reasons and cost of a placement preview. A move back to the object's own spot is valid and free
 * (confirming it simply ends the move), so the no-op rejection of moveObject never shows as an error.
 */
export function evaluatePlacement(
  state: WorldState, content: ContentDB, lotId: Id, householdId: Id, p: PlacementState,
): Pick<PlacementState, 'ok' | 'reasons' | 'cost'> {
  const pose = { x: p.x, z: p.z, rot: p.rot, level: p.level };
  switch (p.source) {
    case 'buy': {
      const r = previewBuy(state, content, lotId, householdId, { defId: p.defId, ...pose });
      return { ok: r.ok, reasons: r.reasons, cost: r.cost };
    }
    case 'move': {
      if (!p.objectId) return { ok: false, reasons: ['Nothing to move.'], cost: 0 };
      if (isUnchangedMove(state, lotId, p)) return { ok: true, reasons: [], cost: 0 };
      const r = previewMove(state, content, lotId, p.objectId, pose);
      return { ok: r.ok, reasons: r.reasons, cost: 0 };
    }
    case 'inventory': {
      if (p.inventoryIndex === null) return { ok: false, reasons: ['Nothing to place.'], cost: 0 };
      const r = previewPlaceFromInventory(state, content, lotId, householdId, p.inventoryIndex, pose);
      return { ok: r.ok, reasons: r.reasons, cost: 0 };
    }
  }
}

/** The undoable command that confirms a placement. */
export function placementCommand(lotId: Id, householdId: Id, p: PlacementState): UndoableCommand | null {
  const pose = { x: p.x, z: p.z, rot: p.rot, level: p.level };
  switch (p.source) {
    case 'buy': return buyObject(lotId, householdId, { defId: p.defId, ...pose });
    case 'move': return p.objectId ? moveObject(lotId, p.objectId, pose) : null;
    case 'inventory': return p.inventoryIndex !== null ? placeFromInventory(lotId, householdId, p.inventoryIndex, pose) : null;
  }
}
