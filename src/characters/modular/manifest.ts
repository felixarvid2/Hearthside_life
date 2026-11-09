// Loading, validation and lookups of the modular character manifest (public/assets/characters/modular/manifest.json).
// Pure data helpers: nothing here touches three.js.

import { BODY_REGIONS, MODULAR_SLOTS, categoryOfSlot } from './types';
import type { LifeStage } from '../../core/types';
import { partAllowedForStage } from './stageRules';
import type { BodyPresetDef, FacialHairDef, GarmentDef, HairstyleDef, ModularManifest, ModularSlot, OutfitPresetDef } from './types';

/** Fetches `${baseUrl}characters/modular/manifest.json`. Rejects when it cannot be read or is not a version 1 manifest. */
export async function loadModularManifest(baseUrl = './assets/'): Promise<ModularManifest> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const res = await fetch(`${base}characters/modular/manifest.json`);
  if (!res.ok) throw new Error(`modular manifest: HTTP ${res.status}`);
  const m = (await res.json()) as ModularManifest;
  if (!m || m.version !== 1 || !Array.isArray(m.bodies)) throw new Error('modular manifest: unsupported format');
  return m;
}

const dupes = (ids: string[]): string[] => ids.filter((id, i) => ids.indexOf(id) !== i);

/** Structural problems of a manifest, in plain English (empty = fine). */
export function validateManifest(m: ModularManifest): string[] {
  const out: string[] = [];
  if (m.version !== 1) out.push(`Unsupported manifest version ${String(m.version)}.`);
  const rigIds = m.rigs.map((r) => r.id);
  const bodyIds = m.bodies.map((b) => b.id);
  for (const id of new Set(dupes(rigIds))) out.push(`Duplicate rig id '${id}'.`);
  for (const id of new Set(dupes(bodyIds))) out.push(`Duplicate body id '${id}'.`);
  for (const id of new Set(dupes(m.garments.map((g) => g.id)))) out.push(`Duplicate garment id '${id}'.`);
  for (const id of new Set(dupes(m.hairstyles.map((h) => h.id)))) out.push(`Duplicate hairstyle id '${id}'.`);
  const regions = BODY_REGIONS as readonly string[];
  const slots = MODULAR_SLOTS as readonly string[];
  for (const b of m.bodies) {
    if (!rigIds.includes(b.rig)) out.push(`Body '${b.id}' uses unknown rig '${b.rig}'.`);
    if (!b.file) out.push(`Body '${b.id}' has no file.`);
  }
  const files = (what: string, id: string, f: Record<string, string>) => {
    for (const k of Object.keys(f)) if (!bodyIds.includes(k)) out.push(`${what} '${id}' has a file for unknown body '${k}'.`);
  };
  const colors = (what: string, id: string, regs: GarmentDef['colorRegions']) => {
    for (const rid of new Set(dupes(regs.map((r) => r.id)))) out.push(`${what} '${id}' has duplicate color region '${rid}'.`);
  };
  for (const g of m.garments) {
    if (!rigIds.includes(g.rig)) out.push(`Garment '${g.id}' uses unknown rig '${g.rig}'.`);
    if (!slots.includes(g.slot)) out.push(`Garment '${g.id}' has unknown slot '${g.slot}'.`);
    if (slots.includes(g.slot) && g.category !== categoryOfSlot(g.slot)) out.push(`Garment '${g.id}' in slot '${g.slot}' must have category '${categoryOfSlot(g.slot)}', not '${g.category}'.`);
    for (const c of g.conflicts) if (!slots.includes(c)) out.push(`Garment '${g.id}' conflicts with unknown slot '${c}'.`);
    for (const r of g.hides) if (!regions.includes(r)) out.push(`Garment '${g.id}' hides unknown body region '${r}'.`);
    files('Garment', g.id, g.files);
    colors('Garment', g.id, g.colorRegions);
  }
  for (const h of m.hairstyles) {
    if (!rigIds.includes(h.rig)) out.push(`Hairstyle '${h.id}' uses unknown rig '${h.rig}'.`);
    if (h.attachment !== 'skinned' && h.attachment !== 'head-bone') out.push(`Hairstyle '${h.id}' has unknown attachment '${String(h.attachment)}'.`);
    files('Hairstyle', h.id, h.files);
    colors('Hairstyle', h.id, h.colorRegions);
  }
  const facial = m.facialHair ?? [];
  for (const id of new Set(dupes(facial.map((h) => h.id)))) out.push(`Duplicate facial hair id '${id}'.`);
  for (const h of facial) {
    if (!rigIds.includes(h.rig)) out.push(`Facial hair '${h.id}' uses unknown rig '${h.rig}'.`);
    if (h.attachment !== 'skinned' && h.attachment !== 'head-bone') out.push(`Facial hair '${h.id}' has unknown attachment '${String(h.attachment)}'.`);
    files('Facial hair', h.id, h.files);
    colors('Facial hair', h.id, h.colorRegions);
  }
  const partIds = new Set([...m.garments.map((g) => g.id), ...m.hairstyles.map((h) => h.id), ...facial.map((h) => h.id)]);
  for (const [slot, list] of Object.entries(m.restrictions?.slots ?? {})) {
    if (!slots.includes(slot)) out.push(`Restriction on unknown slot '${slot}'.`);
    for (const s of list ?? []) if (!slots.includes(s)) out.push(`Slot '${slot}' is restricted against unknown slot '${s}'.`);
  }
  for (const [id, list] of Object.entries(m.restrictions?.parts ?? {})) {
    if (!partIds.has(id)) out.push(`Restriction on unknown part '${id}'.`);
    for (const o of list) if (!partIds.has(o)) out.push(`Part '${id}' is restricted against unknown part '${o}'.`);
  }
  const presetIds = (m.outfitPresets ?? []).map((p) => p.id);
  for (const id of new Set(dupes(presetIds))) out.push(`Duplicate outfit preset id '${id}'.`);
  for (const p of m.outfitPresets ?? []) {
    if (!p.label) out.push(`Outfit preset '${p.id}' has no label.`);
    const entries = Object.entries(p.outfit ?? {});
    if (entries.length === 0) out.push(`Outfit preset '${p.id}' is empty.`);
    for (const [slot, gid] of entries) {
      if (!slots.includes(slot)) { out.push(`Outfit preset '${p.id}' uses unknown slot '${slot}'.`); continue; }
      const g = m.garments.find((x) => x.id === gid);
      if (!g) out.push(`Outfit preset '${p.id}' names unknown garment '${String(gid)}'.`);
      else if (g.slot !== slot) out.push(`Outfit preset '${p.id}' puts '${g.id}' (a ${g.slot}) in the ${slot} slot.`);
    }
    for (const [gid, regs] of Object.entries(p.colors ?? {})) {
      const g = m.garments.find((x) => x.id === gid);
      if (!g) { out.push(`Outfit preset '${p.id}' colours unknown garment '${gid}'.`); continue; }
      for (const rid of Object.keys(regs)) if (!g.colorRegions.some((r) => r.id === rid)) out.push(`Outfit preset '${p.id}' colours unknown region '${rid}' of '${gid}'.`);
    }
  }
  for (const f of ['a', 'b'] as const) {
    const id = m.defaults.bodyByFrame[f];
    if (!bodyIds.includes(id)) out.push(`Default body for frame ${f} ('${id}') does not exist.`);
  }
  if (m.defaults.hairstyle !== null && !m.hairstyles.some((h) => h.id === m.defaults.hairstyle)) out.push(`Default hairstyle '${m.defaults.hairstyle}' does not exist.`);
  for (const [slot, id] of Object.entries(m.defaults.outfit)) {
    const g = m.garments.find((x) => x.id === id);
    if (!g) out.push(`Default outfit garment '${String(id)}' does not exist.`);
    else if (g.slot !== slot) out.push(`Default outfit garment '${g.id}' is a ${g.slot}, not a ${slot}.`);
  }
  return out;
}

// ---- lookups ----

export const findBody = (m: ModularManifest, id: string): BodyPresetDef | undefined => m.bodies.find((b) => b.id === id);
export const findFacialHair = (m: ModularManifest, id: string): FacialHairDef | undefined => m.facialHair?.find((h) => h.id === id);
export const findGarment = (m: ModularManifest, id: string): GarmentDef | undefined => m.garments.find((g) => g.id === id);
export const findHair = (m: ModularManifest, id: string): HairstyleDef | undefined => m.hairstyles.find((h) => h.id === id);

export const findPreset = (m: ModularManifest, id: string): OutfitPresetDef | undefined => m.outfitPresets?.find((p) => p.id === id);

/** Garments that have a file for the body (optionally only one slot). */
export function garmentsFor(m: ModularManifest, bodyId: string, slot?: ModularSlot, stage?: LifeStage): GarmentDef[] {
  return m.garments.filter((g) => !!g.files[bodyId] && (slot === undefined || g.slot === slot) && partAllowedForStage('garment', g.id, stage));
}

/** Hairstyles that have a file for the body. */
export function hairFor(m: ModularManifest, bodyId: string, stage?: LifeStage): HairstyleDef[] {
  return m.hairstyles.filter((h) => !!h.files[bodyId] && partAllowedForStage('hair', h.id, stage));
}

/** Facial hair styles that have a file for the body. */
export function facialHairFor(m: ModularManifest, bodyId: string, stage?: LifeStage): FacialHairDef[] {
  return (m.facialHair ?? []).filter((h) => !!h.files[bodyId] && partAllowedForStage('facial', h.id, stage));
}
