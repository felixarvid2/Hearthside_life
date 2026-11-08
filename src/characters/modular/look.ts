// The serializable look of a modular character: migration of stored data, derivation for people who have none yet
// (nothing is written back implicitly), sanitizing against the manifest, and the outfit of a category. Pure functions.

import type { Appearance, Hex, OutfitCategory } from '../../core/types';
import { OUTFIT_CATEGORIES } from '../../core/types';
import type { ContentDB } from '../../content/types';
import { findBody, findFacialHair, findGarment, findHair } from './manifest';
import { conflicts } from './restrictions';
import { MODULAR_LOOK_VERSION, MODULAR_SLOTS } from './types';
import type { ModularLook, ModularManifest, ModularOutfit, ModularSlot } from './types';

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isHex = (v: unknown): v is Hex => typeof v === 'string' && /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);

/** Slot order used when resolving conflicts: a one-piece wins over top and bottom, then inner to outer. */
const SLOT_PRIORITY: readonly ModularSlot[] = ['full', 'top', 'bottom', 'outer', 'shoes', 'hat', 'eyewear', 'earrings', 'neck', 'wrist', 'waist', 'bag'];

/**
 * Reads a stored look (any version this build knows). Version 2 is current; version 1 (no facial hair) is migrated by
 * adding `facialHairId: null`. Returns a clean copy, or null when the data
 * cannot be understood (wrong shape, missing body or colors, unknown future version).
 */
export function migrateModularLook(raw: unknown): ModularLook | null {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  if (!isRec(v) || typeof v.v !== 'number') return null;
  if (v.v === 1) return readLook(v, 1);
  if (v.v === 2) return readLook(v, 2);
  return null;
}

/** Shared reader of v1 and v2 (v1 had no `facialHairId`); the result is always the current version. */
function readLook(r: Record<string, unknown>, version: 1 | 2): ModularLook | null {
  if (typeof r.bodyId !== 'string' || !r.bodyId) return null;
  if (r.hairId !== null && r.hairId !== undefined && typeof r.hairId !== 'string') return null;
  if (version === 2 && r.facialHairId !== null && r.facialHairId !== undefined && typeof r.facialHairId !== 'string') return null;
  const c = r.colors;
  if (!isRec(c) || !isHex(c.skin) || !isHex(c.eyes) || !isHex(c.hair)) return null;
  const garments: Record<string, Record<string, Hex>> = {};
  if (c.garments !== undefined) {
    if (!isRec(c.garments)) return null;
    for (const [gid, regs] of Object.entries(c.garments)) {
      if (!isRec(regs)) return null;
      const row: Record<string, Hex> = {};
      for (const [rid, hex] of Object.entries(regs)) { if (!isHex(hex)) return null; row[rid] = hex; }
      garments[gid] = row;
    }
  }
  const outfits: ModularLook['outfits'] = {};
  if (r.outfits !== undefined) {
    if (!isRec(r.outfits)) return null;
    for (const cat of OUTFIT_CATEGORIES) {
      const o = r.outfits[cat];
      if (o === undefined) continue;
      if (!isRec(o)) return null;
      const row: ModularOutfit = {};
      for (const slot of MODULAR_SLOTS) {
        const id = o[slot];
        if (id === undefined || id === null) continue;
        if (typeof id !== 'string') return null;
        row[slot] = id;
      }
      outfits[cat] = row;
    }
  }
  const morphs: Record<string, number> = {};
  if (r.morphs !== undefined) {
    if (!isRec(r.morphs)) return null;
    for (const [k, n] of Object.entries(r.morphs)) { if (typeof n !== 'number' || !Number.isFinite(n)) return null; morphs[k] = n; }
  }
  const out: ModularLook = { v: MODULAR_LOOK_VERSION, bodyId: r.bodyId, hairId: (r.hairId as string | null | undefined) ?? null, facialHairId: version === 2 ? ((r.facialHairId as string | null | undefined) ?? null) : null, outfits, colors: { skin: c.skin, eyes: c.eyes, hair: c.hair, garments }, morphs };
  if (typeof r.seed === 'number' && Number.isFinite(r.seed)) out.seed = r.seed;
  return out;
}

/** The look of a person who has no `appearance.modular`: manifest defaults plus the colors of their classic appearance. */
export function deriveModularLook(appearance: Appearance, manifest: ModularManifest, _content?: ContentDB): ModularLook {
  const bodyId = manifest.defaults.bodyByFrame[appearance.frame];
  const outfit: ModularOutfit = {};
  for (const slot of MODULAR_SLOTS) {
    const id = manifest.defaults.outfit[slot];
    const g = id ? findGarment(manifest, id) : undefined;
    if (g && g.files[bodyId]) outfit[slot] = g.id;
  }
  const hairDef = manifest.defaults.hairstyle ? findHair(manifest, manifest.defaults.hairstyle) : undefined;
  return {
    v: MODULAR_LOOK_VERSION,
    bodyId,
    hairId: hairDef && hairDef.files[bodyId] ? hairDef.id : null,
    facialHairId: null,
    outfits: { everyday: outfit },
    colors: { skin: appearance.skin, eyes: appearance.face?.eyeColor ?? manifest.defaults.eyeColor, hair: appearance.hair.color, garments: {} },
    morphs: {},
  };
}

/** The look to draw for a person: their stored one when it reads, else the derived one. */
export function lookFor(appearance: Appearance, manifest: ModularManifest, content?: ContentDB): ModularLook {
  return (appearance.modular ? migrateModularLook(appearance.modular) : null) ?? deriveModularLook(appearance, manifest, content);
}

/** The outfit worn in a category; a category without one falls back to 'everyday'. */
export function outfitFor(look: ModularLook, category: OutfitCategory): ModularOutfit {
  return look.outfits[category] ?? look.outfits.everyday ?? {};
}

/**
 * A copy of `look` that only names things the manifest can draw: an unknown body becomes the default one; hair and garments
 * that do not exist, are not fitted to that body, sit in the wrong slot or exclude each other are dropped. `issues` says what
 * was changed. The input is not modified.
 */
export function resolveLook(look: ModularLook, manifest: ModularManifest): { look: ModularLook; issues: string[] } {
  const issues: string[] = [];
  const out = structuredClone(look);
  let body = findBody(manifest, out.bodyId);
  if (!body) {
    const fallback = manifest.defaults.bodyByFrame.a;
    issues.push(`Unknown body '${out.bodyId}', using '${fallback}'.`);
    out.bodyId = fallback;
    body = findBody(manifest, fallback);
  }
  const bodyId = out.bodyId;
  out.facialHairId ??= null;
  if (out.hairId !== null) {
    const h = findHair(manifest, out.hairId);
    if (!h) { issues.push(`Unknown hairstyle '${out.hairId}' dropped.`); out.hairId = null; }
    else if (!h.files[bodyId]) { issues.push(`Hairstyle '${h.id}' does not fit body '${bodyId}' and was dropped.`); out.hairId = null; }
  }
  const keptByCat: Array<Array<NonNullable<ReturnType<typeof findGarment>>>> = [];
  for (const cat of OUTFIT_CATEGORIES) {
    const src = out.outfits[cat];
    if (!src) continue;
    const kept: ModularOutfit = {};
    const keptDefs = new Map<ModularSlot, NonNullable<ReturnType<typeof findGarment>>>();
    const where = `${cat} outfit`;
    for (const slot of SLOT_PRIORITY) {
      const id = src[slot];
      if (id === undefined) continue;
      const g = findGarment(manifest, id);
      if (!g) { issues.push(`Unknown garment '${id}' dropped from the ${where}.`); continue; }
      if (g.slot !== slot) { issues.push(`Garment '${id}' is a ${g.slot}, not a ${slot}; dropped from the ${where}.`); continue; }
      if (!g.files[bodyId]) { issues.push(`Garment '${id}' does not fit body '${bodyId}' and was dropped from the ${where}.`); continue; }
      if (out.hairId !== null && conflicts(manifest, id, out.hairId)) { issues.push(`Garment '${id}' cannot be worn with hairstyle '${out.hairId}'; dropped from the ${where}.`); continue; }
      const clash = [...keptDefs.entries()].find(([s, k]) => conflicts(manifest, id, k.id)
        || (slot === 'full' && (s === 'top' || s === 'bottom')) || (s === 'full' && (slot === 'top' || slot === 'bottom')));
      if (clash) { issues.push(`Garment '${id}' cannot be worn with '${clash[1].id}'; dropped from the ${where}.`); continue; }
      kept[slot] = id;
      keptDefs.set(slot, g);
    }
    out.outfits[cat] = kept;
    keptByCat.push([...keptDefs.values()]);
  }
  if (out.facialHairId !== null) {
    const f = findFacialHair(manifest, out.facialHairId);
    if (!f) { issues.push(`Unknown facial hair '${out.facialHairId}' dropped.`); out.facialHairId = null; }
    else if (!f.files[bodyId]) { issues.push(`Facial hair '${f.id}' does not fit body '${bodyId}' and was dropped.`); out.facialHairId = null; }
    else {
      const other = (out.hairId !== null && conflicts(manifest, f.id, out.hairId) ? out.hairId : null)
        ?? keptByCat.flat().find((g) => conflicts(manifest, f.id, g.id))?.id ?? null;
      if (other) { issues.push(`Facial hair '${f.id}' cannot be worn with '${other}'; dropped.`); out.facialHairId = null; }
    }
  }
  return { look: out, issues };
}
