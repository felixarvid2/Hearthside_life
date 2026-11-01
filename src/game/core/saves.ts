// Save-slot helpers for GameCore: SaveMeta (persistence) -> SaveSlotInfo (GameAPI), and the listing shown
// when storage is not available at all.

import { SLOT_IDS, emptyMeta, type SaveMeta } from '../../persistence/types';
import type { SaveSlotInfo } from '../api';

export function toSlotInfo(m: SaveMeta): SaveSlotInfo {
  return {
    slotId: m.slotId, name: m.name, savedAt: m.savedAt, gameMinutes: m.gameMinutes, householdName: m.householdName,
    funds: m.funds, kind: m.kind, empty: m.empty,
  };
}

/** Seven empty slots (storage unavailable). */
export function emptySlots(): SaveSlotInfo[] {
  return SLOT_IDS.map((id) => toSlotInfo(emptyMeta(id)));
}

export const NO_STORAGE = 'Saving is not available in this browser (storage is blocked or full). Use Export to keep a copy of your world.';
