// Adapted from CharacterStudio (https://github.com/M3-org/CharacterStudio), src/library/manifestRestrictions.js, commit 293182b.
//
// MIT License
//
// Copyright (c) 2022 Atlas Foundation
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
// What changed: CharacterStudio's ManifestRestrictions keeps per-trait-group `restrictedTraits` / `restrictedTypes` and
// per-item `_restrictedItems`, made symmetric when the maps are built, and removes what a newly chosen trait restricts. Here
// the "types" are our outfit slots and the "items" are garment, hairstyle and facial hair ids, read from `ModularManifest.restrictions`
// plus each garment's own `conflicts` (slots). Symmetry is computed on the fly instead of mutating maps. Dropped: blendshape
// restrictions, required-trait validation, console logging and the TraitModelsGroup / React state plumbing.

import { findFacialHair, findGarment, findHair } from './manifest';
import type { FacialHairDef, GarmentDef, HairstyleDef, ModularManifest, ModularOutfit, ModularSlot } from './types';
import { MODULAR_SLOTS } from './types';

type Part = { kind: 'garment'; def: GarmentDef } | { kind: 'hair'; def: HairstyleDef } | { kind: 'facial'; def: FacialHairDef };

const partOf = (m: ModularManifest, id: string): Part | null => {
  const g = findGarment(m, id);
  if (g) return { kind: 'garment', def: g };
  const h = findHair(m, id);
  if (h) return { kind: 'hair', def: h };
  const f = findFacialHair(m, id);
  return f ? { kind: 'facial', def: f } : null;
};

/** One direction of a slot exclusion: does `a` (a garment slot) exclude `b`'s slot, by the manifest or by the garment's conflicts? */
function slotExcludes(m: ModularManifest, a: GarmentDef, b: GarmentDef): boolean {
  return a.conflicts.includes(b.slot) || (m.restrictions?.slots?.[a.slot]?.includes(b.slot) ?? false);
}

/** True when the two parts cannot be worn together (symmetric; a part never conflicts with itself or with its own slot). */
export function conflicts(m: ModularManifest, aId: string, bId: string): boolean {
  if (aId === bId) return false;
  if (m.restrictions?.parts?.[aId]?.includes(bId) || m.restrictions?.parts?.[bId]?.includes(aId)) return true;
  const a = partOf(m, aId), b = partOf(m, bId);
  if (!a || !b || a.kind !== 'garment' || b.kind !== 'garment') return false;
  if (a.def.slot === b.def.slot) return false;
  return slotExcludes(m, a.def, b.def) || slotExcludes(m, b.def, a.def);
}

/** Ids worn in `outfit` (slot order) followed by the hairstyle and the facial hair. */
const worn = (outfit: ModularOutfit, hairId: string | null, facialHairId: string | null): string[] => {
  const ids = MODULAR_SLOTS.flatMap((s) => (outfit[s] !== undefined ? [outfit[s] as string] : []));
  if (hairId !== null) ids.push(hairId);
  if (facialHairId !== null) ids.push(facialHairId);
  return ids;
};

/**
 * Ids currently worn that block `candidateId`. The garment in the candidate's own slot (or the current hairstyle / facial
 * hair, for those kinds) is not a blocker: equipping replaces it. Unknown candidates are blocked by nothing.
 */
export function blockersOf(m: ModularManifest, outfit: ModularOutfit, hairId: string | null, candidateId: string, facialHairId: string | null = null): string[] {
  const cand = partOf(m, candidateId);
  if (!cand) return [];
  const own = cand.kind === 'garment' ? outfit[cand.def.slot] : cand.kind === 'hair' ? (hairId ?? undefined) : (facialHairId ?? undefined);
  return worn(outfit, hairId, facialHairId).filter((id) => id !== own && id !== candidateId && conflicts(m, candidateId, id));
}

/**
 * The outfit and hairstyle after equipping `candidateId`: it replaces what is in its slot, and everything it conflicts with
 * is removed (the CharacterStudio behaviour). The inputs are not modified. Unknown ids change nothing.
 */
export function equipWith(m: ModularManifest, outfit: ModularOutfit, hairId: string | null, candidateId: string, facialHairId: string | null = null): { outfit: ModularOutfit; hairId: string | null; facialHairId: string | null } {
  const cand = partOf(m, candidateId);
  if (!cand) return { outfit: { ...outfit }, hairId, facialHairId };
  const blocked = new Set(blockersOf(m, outfit, hairId, candidateId, facialHairId));
  const next: ModularOutfit = {};
  for (const s of MODULAR_SLOTS as readonly ModularSlot[]) {
    const id = outfit[s];
    if (id !== undefined && !blocked.has(id)) next[s] = id;
  }
  let hair = hairId !== null && blocked.has(hairId) ? null : hairId;
  let facial = facialHairId !== null && blocked.has(facialHairId) ? null : facialHairId;
  if (cand.kind === 'garment') next[cand.def.slot] = candidateId;
  else if (cand.kind === 'hair') hair = candidateId;
  else facial = candidateId;
  return { outfit: next, hairId: hair, facialHairId: facial };
}
