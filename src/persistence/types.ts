// Shared persistence types: save slots, save metadata, content-reference reports and the clock.

import type { Cents, GameMinutes } from '../core/types';

/** Source of "now" for save timestamps. Injected so tests control it; the default is the system clock. */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

export type SlotId = 'slot-1' | 'slot-2' | 'slot-3' | 'slot-4' | 'slot-5' | 'autosave' | 'backup';
export type SaveKind = 'manual' | 'autosave' | 'backup';

/** The five named manual slots. */
export const MANUAL_SLOTS: readonly SlotId[] = ['slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5'];
/** Every slot the store lists, in display order. */
export const SLOT_IDS: readonly SlotId[] = [...MANUAL_SLOTS, 'autosave', 'backup'];

export function isSlotId(x: unknown): x is SlotId { return typeof x === 'string' && (SLOT_IDS as readonly string[]).includes(x); }
export function isManualSlot(x: unknown): x is SlotId { return typeof x === 'string' && (MANUAL_SLOTS as readonly string[]).includes(x); }

export function slotKind(slotId: SlotId): SaveKind {
  return slotId === 'autosave' ? 'autosave' : slotId === 'backup' ? 'backup' : 'manual';
}

/** Label for a slot that has no (usable) name of its own, e.g. 'Slot 3', 'Autosave'. */
export function defaultSlotName(slotId: SlotId): string {
  if (slotId === 'autosave') return 'Autosave';
  if (slotId === 'backup') return 'Backup';
  return `Slot ${slotId.slice(5)}`;
}

/** What the load screen shows for one slot. Empty slots are listed too so the UI can always show five. */
export interface SaveMeta {
  slotId: SlotId;
  name: string;
  /** ISO timestamp from the injected clock; '' for an empty slot. */
  savedAt: string;
  gameMinutes: GameMinutes;
  householdName: string;
  funds: Cents;
  schemaVersion: number;
  kind: SaveKind;
  empty: boolean;
  /** Set when the slot cannot be listed normally (damaged entry, storage unavailable). */
  problem?: string;
}

export function emptyMeta(slotId: SlotId, problem?: string): SaveMeta {
  return {
    slotId, name: defaultSlotName(slotId), savedAt: '', gameMinutes: 0, householdName: '', funds: 0,
    schemaVersion: 0, kind: slotKind(slotId), empty: true, ...(problem ? { problem } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Content references
// ---------------------------------------------------------------------------------------------

export type MissingKind =
  | 'object' | 'opening' | 'wallDesign' | 'wallPalette' | 'floorDesign' | 'floorPalette'
  | 'garment' | 'accessory' | 'pattern' | 'hair' | 'facialHair' | 'facePreset' | 'bodyPreset' | 'browStyle' | 'voice'
  | 'trait' | 'aspiration' | 'career' | 'interaction' | 'skill' | 'moodlet' | 'recipe';

/** A content id that the saved data refers to but the current content does not define. Never deleted from the data. */
export interface MissingRef {
  kind: MissingKind;
  /** The unknown id; palette references are reported as `<designId>/<paletteId>`. */
  id: string;
  /** How many places refer to it. */
  count: number;
  /** Up to a few example locations in the data, e.g. `lots.lot_1.objects.obj_4`. */
  where: string[];
}

/** Non-fatal findings that accompany a successfully loaded or imported world. */
export interface WorldReport {
  missing: MissingRef[];
  warnings: string[];
  /** Schema version the data had before migration, or null when it was already current. */
  migratedFrom: number | null;
}
