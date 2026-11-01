// Content references: finds ids in saved data that the current content does not define. Missing references are
// only reported - the data keeps them, so loading again with the content restores them (brief section 23).

import type { ContentDB } from '../content/types';
import type { Appearance, Household, Lot, Person, Wardrobe, WorldItem } from '../core/types';
import type { PersonDraft } from '../core/drafts';
import type { MissingKind, MissingRef, WorldReport } from './types';
import { has } from './shape';

const MAX_EXAMPLES = 3;

/** Collects unknown ids grouped by kind and id. */
export class MissingCollector {
  private readonly groups = new Map<string, MissingRef>();

  /** Records `id` as missing unless `table` defines it. Returns true when it is defined. */
  check(kind: MissingKind, table: object, id: string, where: string): boolean {
    if (has(table, id)) return true;
    this.add(kind, id, where);
    return false;
  }

  add(kind: MissingKind, id: string, where: string): void {
    const key = `${kind}\u0000${id}`;
    let ref = this.groups.get(key);
    if (!ref) { ref = { kind, id, count: 0, where: [] }; this.groups.set(key, ref); }
    ref.count++;
    if (ref.where.length < MAX_EXAMPLES) ref.where.push(where);
  }

  result(): MissingRef[] { return [...this.groups.values()]; }
}

export function collectAppearanceRefs(c: MissingCollector, content: ContentDB, a: Appearance, where: string): void {
  c.check('hair', content.hair, a.hair.styleId, `${where}.hair.styleId`);
  if (a.hair.facialHairId !== null) c.check('facialHair', content.facialHair, a.hair.facialHairId, `${where}.hair.facialHairId`);
  if (a.bodyPresetId !== null) c.check('bodyPreset', content.bodyPresets, a.bodyPresetId, `${where}.bodyPresetId`);
  if (a.face.presetId !== null) c.check('facePreset', content.facePresets, a.face.presetId, `${where}.face.presetId`);
  c.check('browStyle', content.browStyles, a.face.browStyle, `${where}.face.browStyle`);
}

export function collectWardrobeRefs(c: MissingCollector, content: ContentDB, w: Wardrobe, where: string): void {
  for (const [category, outfits] of Object.entries(w.outfits)) {
    outfits.forEach((outfit, i) => {
      const at = `${where}.outfits.${category}[${i}]`;
      for (const [layer, choice] of Object.entries(outfit.layers)) {
        if (!choice) continue;
        c.check('garment', content.garments, choice.garmentId, `${at}.layers.${layer}`);
        if (choice.pattern !== 'solid') c.check('pattern', content.patterns, choice.pattern, `${at}.layers.${layer}.pattern`);
      }
      outfit.accessories.forEach((acc, j) => c.check('accessory', content.accessories, acc.accessoryId, `${at}.accessories[${j}]`));
    });
  }
}

/** The parts a creator draft and a living person have in common: look, voice, traits, aspiration, career. */
function collectIdentityRefs(
  c: MissingCollector, content: ContentDB, who: {
    appearance: Appearance; outfits: Wardrobe; voice: { preset: string }; traits: string[];
    aspirationId: string | null; careerId: string | null;
  }, where: string,
): void {
  collectAppearanceRefs(c, content, who.appearance, `${where}.appearance`);
  collectWardrobeRefs(c, content, who.outfits, `${where}.outfits`);
  c.check('voice', content.voices, who.voice.preset, `${where}.voice.preset`);
  who.traits.forEach((t, i) => c.check('trait', content.traits, t, `${where}.traits[${i}]`));
  if (who.aspirationId !== null) c.check('aspiration', content.aspirations, who.aspirationId, `${where}.aspiration`);
  if (who.careerId !== null) c.check('career', content.careers, who.careerId, `${where}.career`);
}

export function collectDraftRefs(c: MissingCollector, content: ContentDB, d: PersonDraft, where: string): void {
  collectIdentityRefs(c, content, d, where);
}

export function collectPersonRefs(c: MissingCollector, content: ContentDB, p: Person, where: string): void {
  collectIdentityRefs(c, content, {
    appearance: p.appearance, outfits: p.outfits, voice: p.voice, traits: p.traits,
    aspirationId: p.aspiration ? p.aspiration.aspirationId : null,
    careerId: p.career ? p.career.careerId : null,
  }, where);
  for (const skillId of Object.keys(p.skills)) c.check('skill', content.skills, skillId, `${where}.skills.${skillId}`);
  p.moodlets.forEach((m, i) => c.check('moodlet', content.moodlets, m.id, `${where}.moodlets[${i}]`));
  p.queue.forEach((a, i) => {
    // Queue entries name an InteractionDef or a SocialDef.
    if (!has(content.interactions, a.interactionId) && !has(content.socials, a.interactionId)) {
      c.add('interaction', a.interactionId, `${where}.queue[${i}]`);
    }
  });
}

function collectFinishRefs(
  c: MissingCollector, designs: ContentDB['wallDesigns'], designKind: MissingKind, paletteKind: MissingKind,
  finish: { designId: string; paletteId: string }, where: string,
): void {
  if (!c.check(designKind, designs, finish.designId, where)) return;
  const design = designs[finish.designId];
  if (design && !design.palettes.some((p) => p.id === finish.paletteId)) {
    c.add(paletteKind, `${finish.designId}/${finish.paletteId}`, where);
  }
}

export function collectLotRefs(c: MissingCollector, content: ContentDB, lot: Lot, where: string): void {
  for (const [id, obj] of Object.entries(lot.objects)) c.check('object', content.objects, obj.defId, `${where}.objects.${id}`);
  for (const [id, op] of Object.entries(lot.openings)) c.check('opening', content.openings, op.defId, `${where}.openings.${id}`);
  for (const [id, wall] of Object.entries(lot.walls)) {
    collectFinishRefs(c, content.wallDesigns, 'wallDesign', 'wallPalette', wall.sideA, `${where}.walls.${id}.sideA`);
    collectFinishRefs(c, content.wallDesigns, 'wallDesign', 'wallPalette', wall.sideB, `${where}.walls.${id}.sideB`);
  }
  for (const [key, finish] of Object.entries(lot.floors)) {
    collectFinishRefs(c, content.floorDesigns, 'floorDesign', 'floorPalette', finish, `${where}.floors.${key}`);
  }
}

export function collectHouseholdRefs(c: MissingCollector, content: ContentDB, hh: Household, where: string): void {
  hh.inventory.forEach((entry, i) => c.check('object', content.objects, entry.object.defId, `${where}.inventory[${i}]`));
}

export function collectItemRefs(c: MissingCollector, content: ContentDB, item: WorldItem, where: string): void {
  // Floor messes name their variant ('puddle', 'crumbs', 'spill') in recipeId, not a recipe.
  if (item.kind !== 'mess') c.check('recipe', content.recipes, item.recipeId, where);
}

const KIND_LABEL: Record<MissingKind, string> = {
  object: 'object', opening: 'door or window', wallDesign: 'wall design', wallPalette: 'wall colour variant',
  floorDesign: 'floor design', floorPalette: 'floor colour variant', garment: 'garment', accessory: 'accessory',
  pattern: 'clothing pattern', hair: 'hairstyle', facialHair: 'facial hair style', facePreset: 'face preset',
  bodyPreset: 'body preset', browStyle: 'brow style', voice: 'voice', trait: 'trait', aspiration: 'aspiration',
  career: 'career', interaction: 'action', skill: 'skill', moodlet: 'moodlet', recipe: 'recipe',
};

/** One readable line per missing reference, e.g. `Missing object "sofa-retro" (used 2 times)`. */
export function describeMissing(missing: readonly MissingRef[]): string[] {
  return missing.map((m) => {
    const uses = m.count === 1 ? 'used once' : `used ${m.count} times`;
    return `Missing ${KIND_LABEL[m.kind]} "${m.id}" (${uses}, e.g. ${m.where[0] ?? 'unknown location'})`;
  });
}

/** Everything a load or import report says, as readable lines for the UI (migration note, missing content, warnings). */
export function describeReport(report: WorldReport): string[] {
  const lines: string[] = [];
  if (report.migratedFrom !== null) lines.push(`Upgraded from an older save format (schema ${report.migratedFrom}).`);
  lines.push(...describeMissing(report.missing), ...report.warnings);
  return lines;
}
