// Placed-object record helpers shared by lot generation and build/buy commands.

import type { ContentDB, ObjectDef } from '../content/types';
import { newId } from '../core/ids';
import type { GameMinutes, Id, Lot, PlacedObject, Rot, WorldState } from '../core/types';

/** Default swatch (swatches[0]) for every finish region of a definition. */
export function defaultFinishes(def: Pick<ObjectDef, 'finishes'>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of def.finishes) {
    const first = r.swatches[0];
    if (first) out[r.id] = first.id;
  }
  return out;
}

/**
 * Checks chosen finishes against the definition and fills missing regions with their default swatch.
 * Returns the complete finish map, or a reason when a region or swatch does not exist.
 */
export function resolveFinishes(def: ObjectDef, chosen: Record<string, string> | undefined): { ok: true; finishes: Record<string, string> } | { ok: false; reason: string } {
  const finishes = defaultFinishes(def);
  for (const [region, swatch] of Object.entries(chosen ?? {})) {
    const r = def.finishes.find((f) => f.id === region);
    if (!r) return { ok: false, reason: `${def.name} has no "${region}" finish.` };
    if (!r.swatches.some((s) => s.id === swatch)) return { ok: false, reason: `Unknown ${r.label.toLowerCase()} swatch "${swatch}".` };
    finishes[region] = swatch;
  }
  return { ok: true, finishes };
}

/** A new placed-object record (not yet added to a lot). */
export function makePlacedObject(
  state: WorldState, def: ObjectDef,
  at: { x: number; z: number; rot: Rot; level: number; supportId?: Id },
  o: { finishes?: Record<string, string>; ownerHouseholdId: Id | null; boughtAt?: GameMinutes; purchasePrice?: number },
): PlacedObject {
  return {
    id: newId(state, 'obj'),
    defId: def.id,
    level: at.level,
    x: at.x,
    z: at.z,
    rot: at.rot,
    finishes: { ...(o.finishes ?? defaultFinishes(def)) },
    purchasePrice: o.purchasePrice ?? def.price,
    boughtAt: o.boughtAt ?? state.clock.minutes,
    ownerHouseholdId: o.ownerHouseholdId,
    condition: { dirt: 0, broken: false },
    ...(at.supportId ? { supportId: at.supportId } : {}),
  };
}

/** Objects resting on a support, and world items (served meals) on it. */
export function itemsOnObject(state: WorldState, lot: Lot, objectId: Id): { objects: PlacedObject[]; itemIds: Id[] } {
  const objects = Object.values(lot.objects).filter((o) => o.supportId === objectId);
  const itemIds = Object.values(state.items)
    .filter((it) => it.lotId === lot.id && it.position.onObjectId === objectId)
    .map((it) => it.id);
  return { objects, itemIds };
}

/** Plain deep copy of a JSON record (state records are JSON by contract). */
export function copyRecord<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T; }

/** Content definition of a placed object (undefined when the content does not know it). */
export function defOf(content: ContentDB, obj: Pick<PlacedObject, 'defId'>): ObjectDef | undefined {
  return content.objects[obj.defId];
}
