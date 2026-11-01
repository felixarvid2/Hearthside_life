// Live-mode context menus: maps what the player picked to a simulation target and sim options to UI menu
// entries. The menu token carries the exact request ({ interactionId, target, data }) back to queue().

import type { ActionInstance, Lot } from '../../core/types';
import type { ActionData, InteractionOption } from '../../sim/types';
import { tileOnSide } from '../../world/walls';
import type { MenuOption, PickResult } from '../api';

/** What MenuOption.token holds. */
export interface MenuToken {
  interactionId: string;
  target: ActionInstance['target'];
  data?: ActionData;
}

/**
 * Simulation target for a pick: person -> person (the selected person's own id gives the self menu),
 * object -> object (any slot), item -> item, floor -> tile ("Go here"), wall -> the tile on the picked side.
 */
export function targetForPick(pick: PickResult, lot: Lot | undefined): ActionInstance['target'] | null {
  switch (pick.kind) {
    case 'person': return { kind: 'person', personId: pick.personId };
    case 'object': return { kind: 'object', objectId: pick.objectId, slotId: null };
    case 'item': return { kind: 'item', itemId: pick.itemId };
    case 'floor': return { kind: 'tile', x: pick.tile.x, z: pick.tile.z, level: pick.level };
    case 'wall': {
      const wall = lot?.walls[pick.wallId];
      const t = wall ? tileOnSide(wall, pick.side) : pick.tile;
      return { kind: 'tile', x: t.x, z: t.z, level: pick.level };
    }
    case 'none': return null;
  }
}

/** A sim InteractionOption as a UI MenuOption. */
export function toMenuOption(o: InteractionOption): MenuOption {
  const token: MenuToken = { interactionId: o.interactionId, target: o.target, ...(o.data ? { data: o.data } : {}) };
  return {
    interactionId: o.interactionId, label: o.label, icon: o.icon, group: o.group, enabled: o.enabled,
    ...(o.reason ? { reason: o.reason } : {}), ...(o.section ? { section: o.section } : {}), ...(o.hint ? { hint: o.hint } : {}), token,
  };
}

const TARGET_KINDS = new Set(['object', 'person', 'tile', 'item', 'self']);

/** Reads a token handed back by the UI; null when it is not one this module made. */
export function readToken(token: unknown, interactionId: string): MenuToken | null {
  if (typeof token !== 'object' || token === null) return null;
  const t = token as Partial<MenuToken>;
  if (typeof t.interactionId !== 'string' || t.interactionId !== interactionId) return null;
  const target = t.target as { kind?: unknown } | undefined;
  if (!target || typeof target !== 'object' || !TARGET_KINDS.has(String(target.kind))) return null;
  if (t.data !== undefined && (typeof t.data !== 'object' || t.data === null)) return null;
  return { interactionId: t.interactionId, target: t.target as ActionInstance['target'], ...(t.data ? { data: { ...t.data } } : {}) };
}
