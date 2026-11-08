// Editing operations on a ModularLook for the creator: equip a hairstyle or garment (with the conflict rules of
// restrictions.ts and plain-English feedback), outfit presets, colours, and a random look. Pure functions: they mutate
// the look they are given (the creator session hands them a copy inside its undoable edit) and return the notes to show.
//
// Hair and facial hair are shared by every outfit category, garments are per category, so a hair/garment conflict is checked against all
// categories: wearing a hood in "work" also rules out a ponytail for "everyday".

import type { Hex, OutfitCategory } from '../../core/types';
import { OUTFIT_CATEGORIES } from '../../core/types';
import type { Rng } from '../../core/rng';
import { facialHairFor, findBody, findFacialHair, findGarment, findHair, findPreset, garmentsFor, hairFor } from './manifest';
import { outfitFor } from './look';
import { blockersOf, conflicts, equipWith } from './restrictions';
import { ACCESSORY_SLOTS, MODULAR_SLOTS } from './types';
import type { GarmentDef, ModularLook, ModularManifest, ModularOutfit, ModularSlot } from './types';

/** Slot order presets are put on in: the one-piece first, so the pieces it excludes are never worn with it. */
const PRESET_ORDER: readonly ModularSlot[] = ['full', 'top', 'bottom', 'outer', 'shoes', ...ACCESSORY_SLOTS];

export const isHexColor = (v: unknown): v is Hex => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/** Display name of a garment, hairstyle or facial hair id (the id itself when the manifest does not know it). */
export function partLabel(m: ModularManifest, id: string): string {
  return findGarment(m, id)?.label ?? findHair(m, id)?.label ?? findFacialHair(m, id)?.label ?? id;
}

/**
 * The one-piece rule: 'full' never goes with 'top' or 'bottom' (also enforced by resolveLook). 'outer' is deliberately
 * not part of it: a coat goes over a top and over a one-piece.
 */
const fullClash = (a: ModularSlot, b: ModularSlot): boolean =>
  (a === 'full' && (b === 'top' || b === 'bottom')) || (b === 'full' && (a === 'top' || a === 'bottom'));

/** Every outfit the look names explicitly (categories without one fall back to 'everyday' and are not listed). */
function allOutfits(look: ModularLook): ModularOutfit[] {
  return OUTFIT_CATEGORIES.flatMap((c) => (look.outfits[c] ? [look.outfits[c] as ModularOutfit] : []));
}

/** The outfit of a category as an own, editable copy (a category without one starts from 'everyday'). */
function ownOutfit(look: ModularLook, category: OutfitCategory): ModularOutfit {
  return { ...outfitFor(look, category) };
}

/** Does hairstyle `hairId` fit every garment worn in any category, and the facial hair? */
function hairFitsOutfits(m: ModularManifest, look: ModularLook, hairId: string): boolean {
  return allOutfits(look).every((o) => blockersOf(m, o, null, hairId).length === 0)
    && (look.facialHairId === null || !conflicts(m, hairId, look.facialHairId));
}

/** The hairstyle to switch to when the current one has to go: the default if it fits, else the first that does, else none. */
export function fallbackHair(m: ModularManifest, look: ModularLook, avoid?: string): string | null {
  const ids = [...(m.defaults.hairstyle ? [m.defaults.hairstyle] : []), ...hairFor(m, look.bodyId).map((h) => h.id)];
  for (const id of ids) {
    if (id === avoid) continue;
    const h = findHair(m, id);
    if (h && h.files[look.bodyId] && hairFitsOutfits(m, look, id)) return id;
  }
  return null;
}

/** Labels of what equipping garment `garmentId` in `category` would take off or change (for hints on the cards). */
export function wouldReplace(m: ModularManifest, look: ModularLook, category: OutfitCategory, garmentId: string): string[] {
  const g = findGarment(m, garmentId);
  if (!g) return [];
  const outfit = outfitFor(look, category);
  const ids = new Set(blockersOf(m, outfit, look.hairId, garmentId, look.facialHairId));
  for (const s of MODULAR_SLOTS) if (outfit[s] && fullClash(g.slot, s)) ids.add(outfit[s] as string);
  return [...ids].map((id) => partLabel(m, id));
}

/** Labels of the garments (any category) that choosing hairstyle `hairId` would take off. */
export function hairWouldReplace(m: ModularManifest, look: ModularLook, hairId: string): string[] {
  const out = new Set<string>();
  for (const o of allOutfits(look)) for (const id of blockersOf(m, o, null, hairId)) out.add(partLabel(m, id));
  if (look.facialHairId !== null && conflicts(m, hairId, look.facialHairId)) out.add(partLabel(m, look.facialHairId));
  return [...out];
}

/** Labels of what choosing facial hair `facialId` would change: garments (any category) it excludes, and the hairstyle. */
export function facialHairWouldReplace(m: ModularManifest, look: ModularLook, facialId: string): string[] {
  const out = new Set<string>();
  for (const o of allOutfits(look)) for (const id of blockersOf(m, o, null, facialId)) out.add(partLabel(m, id));
  if (look.hairId !== null && conflicts(m, facialId, look.hairId)) out.add(partLabel(m, look.hairId));
  return [...out];
}

// ---- hairstyle ----

/** Wears a hairstyle (null = none). Garments in any category that do not fit with it are taken off. Returns the notes. */
export function equipHair(m: ModularManifest, look: ModularLook, hairId: string | null): string[] {
  const notes: string[] = [];
  if (hairId === null) { look.hairId = null; return notes; }
  const h = findHair(m, hairId);
  if (!h || !h.files[look.bodyId]) return notes;
  for (const cat of OUTFIT_CATEGORIES) {
    const src = look.outfits[cat];
    if (!src) continue;
    const next: ModularOutfit = { ...src };
    for (const id of blockersOf(m, src, null, hairId)) {
      const slot = findGarment(m, id)?.slot;
      if (slot) delete next[slot];
      const note = `${partLabel(m, id)} doesn't fit with ${h.label} - taken off.`;
      if (!notes.includes(note)) notes.push(note);
    }
    look.outfits[cat] = next;
  }
  look.hairId = hairId;
  if (look.facialHairId !== null && conflicts(m, hairId, look.facialHairId)) {
    notes.push(`${partLabel(m, look.facialHairId)} doesn't fit with ${h.label} - taken off.`);
    look.facialHairId = null;
  }
  return notes;
}

// ---- facial hair ----

/**
 * Wears facial hair (null = none). Garments in any category that do not fit with it are taken off; a hairstyle that does not
 * fit is swapped for another. Returns the notes.
 */
export function equipFacialHair(m: ModularManifest, look: ModularLook, facialId: string | null): string[] {
  const notes: string[] = [];
  if (facialId === null) { look.facialHairId = null; return notes; }
  const f = findFacialHair(m, facialId);
  if (!f || !f.files[look.bodyId]) return notes;
  for (const cat of OUTFIT_CATEGORIES) {
    const src = look.outfits[cat];
    if (!src) continue;
    const next: ModularOutfit = { ...src };
    for (const id of blockersOf(m, src, null, facialId)) {
      const slot = findGarment(m, id)?.slot;
      if (slot) delete next[slot];
      const note = `${partLabel(m, id)} doesn't fit with ${f.label} - taken off.`;
      if (!notes.includes(note)) notes.push(note);
    }
    look.outfits[cat] = next;
  }
  look.facialHairId = facialId;
  if (look.hairId !== null && conflicts(m, facialId, look.hairId)) swapBlockedHair(m, look, look.hairId, f.label, notes);
  return notes;
}

/** The current hairstyle had to go: put the fallback in its place (all categories considered) and say why. */
function swapBlockedHair(m: ModularManifest, look: ModularLook, prevHair: string, culprit: string, notes: string[]): void {
  const fb = fallbackHair(m, look, prevHair);
  look.hairId = fb;
  const who = `${partLabel(m, prevHair)} doesn't fit with ${culprit}`;
  notes.push(fb ? `${who} - switched to ${partLabel(m, fb)}.` : `${who} - removed.`);
}

// ---- garments ----

/**
 * Puts a garment on in a category. It replaces what is in its slot; everything it cannot be worn with (restrictions, a
 * one-piece vs top/bottom) is taken off, and a hairstyle that does not fit is swapped for another. Returns the notes.
 */
export function equipGarment(m: ModularManifest, look: ModularLook, category: OutfitCategory, garmentId: string): string[] {
  const g = findGarment(m, garmentId);
  if (!g || !g.files[look.bodyId]) return [];
  const notes: string[] = [];
  const before = ownOutfit(look, category);
  const prevHair = look.hairId;
  const prevFacial = look.facialHairId;
  const eq = equipWith(m, before, prevHair, garmentId, prevFacial);
  const next = eq.outfit;
  for (const s of MODULAR_SLOTS) if (next[s] && s !== g.slot && fullClash(g.slot, s)) delete next[s];
  for (const s of MODULAR_SLOTS) {
    const id = before[s];
    if (id && s !== g.slot && next[s] !== id) notes.push(`${partLabel(m, id)} doesn't fit with ${g.label} - taken off.`);
  }
  look.outfits[category] = next;
  look.hairId = eq.hairId;
  look.facialHairId = eq.facialHairId;
  if (prevFacial !== null && eq.facialHairId === null) notes.push(`${partLabel(m, prevFacial)} doesn't fit with ${g.label} - taken off.`);
  if (prevHair !== null && eq.hairId === null) swapBlockedHair(m, look, prevHair, g.label, notes);
  return notes;
}

/** Takes the garment off a slot of a category. */
export function unequipSlot(look: ModularLook, category: OutfitCategory, slot: ModularSlot): void {
  const o = ownOutfit(look, category);
  delete o[slot];
  look.outfits[category] = o;
}

/** Sets one colour region of a garment. False when the garment or region is unknown or the colour is not a hex colour. */
export function setGarmentRegionColor(m: ModularManifest, look: ModularLook, garmentId: string, regionId: string, hex: string): boolean {
  const g = findGarment(m, garmentId);
  if (!g || !g.colorRegions.some((r) => r.id === regionId) || !isHexColor(hex)) return false;
  look.colors.garments[garmentId] = { ...look.colors.garments[garmentId], [regionId]: hex.toLowerCase() };
  return true;
}

// ---- presets ----

/** Replaces a category's outfit by an outfit preset (parts that are not fitted to the body are skipped). Returns the notes. */
export function applyPreset(m: ModularManifest, look: ModularLook, category: OutfitCategory, presetId: string): string[] | null {
  const p = findPreset(m, presetId);
  if (!p) return null;
  const notes: string[] = [];
  const startHair = look.hairId;
  const startFacial = look.facialHairId;
  look.outfits[category] = {};
  for (const slot of PRESET_ORDER) {
    const id = p.outfit[slot];
    if (!id) continue;
    const g = findGarment(m, id);
    if (!g || !g.files[look.bodyId]) { if (g) notes.push(`${g.label} isn't available for this body.`); continue; }
    const eq = equipWith(m, ownOutfit(look, category), look.hairId, id, look.facialHairId);
    look.outfits[category] = eq.outfit;
    look.hairId = eq.hairId;
    look.facialHairId = eq.facialHairId;
  }
  for (const [gid, regs] of Object.entries(p.colors ?? {})) {
    for (const [rid, hex] of Object.entries(regs)) setGarmentRegionColor(m, look, gid, rid, hex);
  }
  if (startFacial !== null && look.facialHairId === null) notes.push(`${partLabel(m, startFacial)} doesn't fit with ${p.label} - taken off.`);
  if (startHair !== null && look.hairId === null) {
    const culprit = Object.values(look.outfits[category] ?? {}).find((id) => id && conflicts(m, id, startHair));
    swapBlockedHair(m, look, startHair, culprit ? partLabel(m, culprit) : p.label, notes);
  }
  return notes;
}

// ---- random ----

const pickColor = (rng: Rng, hexes: readonly Hex[]): Hex => rng.pick(hexes);

/** Random palette colours for the regions of a garment that offer a palette. */
function randomizeGarmentColors(look: ModularLook, g: GarmentDef, rng: Rng): void {
  const row: Record<string, Hex> = { ...look.colors.garments[g.id] };
  for (const r of g.colorRegions) if (r.palette && r.palette.length > 0) row[r.id] = pickColor(rng, r.palette);
  if (Object.keys(row).length > 0) look.colors.garments[g.id] = row;
}

/** Chance that random clothing wears something in an accessory slot. */
const ACCESSORY_CHANCE: Record<(typeof ACCESSORY_SLOTS)[number], number> = { hat: 0.12, eyewear: 0.15, earrings: 0.15, neck: 0.12, wrist: 0.12, waist: 0.08, bag: 0.08 };
/** Chance that a random hair roll also grows facial hair. */
const FACIAL_HAIR_CHANCE = 0.3;

export interface RandomParts { body?: boolean; hair?: boolean; clothing?: boolean }

/**
 * Re-rolls parts of a look. The result may still need `resolveLook` (the creator session always runs it). Never throws on
 * empty catalogs: a part with nothing to choose from stays as it is.
 */
export function randomizeLook(m: ModularManifest, look: ModularLook, rng: Rng, parts: RandomParts): void {
  if (parts.body) {
    const bodies = m.bodies;
    if (bodies.length > 0) look.bodyId = rng.pick(bodies).id;
    const def = findBody(m, look.bodyId);
    look.morphs = {};
    for (const mo of def?.morphs ?? []) look.morphs[mo.id] = Math.round(rng.range(mo.range[0], mo.range[1]) * 100) / 100;
  }
  if (parts.clothing) {
    for (const cat of OUTFIT_CATEGORIES) {
      look.outfits[cat] = {};
      const pick = (slot: ModularSlot, chance = 1): void => {
        // random clothes never push the current hairstyle out (it may be locked)
        const list = garmentsFor(m, look.bodyId, slot).filter((g) => (look.hairId === null || !conflicts(m, g.id, look.hairId))
          && (look.facialHairId === null || !conflicts(m, g.id, look.facialHairId)));
        if (list.length === 0 || !rng.chance(chance)) return;
        const g = rng.pick(list);
        equipGarment(m, look, cat, g.id);
        randomizeGarmentColors(look, g, rng);
      };
      const onePiece = garmentsFor(m, look.bodyId, 'full').some((g) => look.hairId === null || !conflicts(m, g.id, look.hairId)) && rng.chance(0.2);
      if (onePiece) pick('full');
      else { pick('top'); pick('bottom'); }
      pick('outer', 0.25);
      pick('shoes', 0.6);
      // accessories stay sparse: a few slots at most, most outfits wear one or none
      for (const slot of ACCESSORY_SLOTS) pick(slot, ACCESSORY_CHANCE[slot]);
    }
  }
  if (parts.hair) {
    const fits = hairFor(m, look.bodyId).filter((h) => hairFitsOutfits(m, look, h.id));
    if (fits.length > 0) equipHair(m, look, rng.pick(fits).id);
    // facial hair: often none, and only a style that fits the hairstyle and every worn garment
    look.facialHairId = null;
    const beards = facialHairFor(m, look.bodyId).filter((f) => (look.hairId === null || !conflicts(m, f.id, look.hairId))
      && allOutfits(look).every((o) => blockersOf(m, o, null, f.id).length === 0));
    if (beards.length > 0 && rng.chance(FACIAL_HAIR_CHANCE)) look.facialHairId = rng.pick(beards).id;
  }
  look.seed = rng.nextU32();
}
