// Outfit rules for Hearthside Life characters (pure: no three.js, no DOM).
//
// - resolveOutfit turns an Outfit into drawable layers in a fixed order (shoes, bottom, top, full, outer).
//   A full garment replaces top and bottom; unknown ids are reported in `issues` and skipped.
// - validateOutfit checks one outfit against the rules of its category.
// - Wardrobe helpers (currentOutfit, outfitFor, makeOutfit, setLayer, ...) used by the creator, the
//   simulation (changeOutfit) and the renderer.
// - Random outfits with colour harmony (randomOutfit, defaultWardrobe) for random and premade people.
//
// Garments are never restricted by body frame or pronouns: every garment fits every frame. Each garment has a
// presentation affinity ('masc' | 'fem' | 'neutral') that only steers DEFAULT outfits (premades, random people);
// the creator offers every garment to everyone.

import type { AccessoryDef, ContentDB, GarmentAffinity, GarmentDef } from '../content/types';
import { Rng, seedRng } from '../core/rng';
import { OUTFIT_CATEGORIES } from '../core/types';
import type { BodyFrame, GarmentChoice, GarmentLayer, Hex, Outfit, OutfitCategory, Pronouns, Wardrobe } from '../core/types';

/** Draw order of garment layers (inner to outer). */
export const LAYER_DRAW_ORDER: readonly GarmentLayer[] = ['shoes', 'bottom', 'top', 'full', 'outer'];
/** Categories where shoes are optional. */
export const SHOES_OPTIONAL: readonly OutfitCategory[] = ['sleep', 'swim'];
export const MAX_OUTFITS_PER_CATEGORY = 5;
export const MAX_ACCESSORIES = 4;
/** Accessory kinds of which only one can be worn at a time ('other' is unlimited). */
export const SINGLE_ACCESSORY_KINDS: readonly AccessoryDef['kind'][] =
  ['glasses', 'hat', 'earrings', 'necklace', 'bag', 'watch', 'scarf'];

export const OUTFIT_CATEGORY_NAMES: Record<OutfitCategory, string> = {
  everyday: 'Everyday', formal: 'Formal', work: 'Work', athletic: 'Athletic', sleep: 'Sleepwear', swim: 'Swimwear',
};
export const LAYER_NAMES: Record<GarmentLayer, string> = {
  top: 'Top', bottom: 'Bottom', full: 'Full outfit', outer: 'Outerwear', shoes: 'Shoes',
};

export const NOTE_FULL_REPLACES = 'A full outfit replaces the top and bottom.';
export const NOTE_PIECE_REPLACES_FULL = 'A top or bottom replaces the full outfit.';

// ---------------------------------------------------------------------------------------------
// Colour helpers (shared with the creator)
// ---------------------------------------------------------------------------------------------

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

/** True for '#rrggbb'. */
export function isHex(v: unknown): v is Hex { return typeof v === 'string' && HEX6.test(v); }

/** Lower-case '#rrggbb' from '#rrggbb' or '#rgb'; `fallback` for anything else. */
export function normalizeHex(v: unknown, fallback: Hex): Hex {
  if (typeof v !== 'string') return fallback;
  if (HEX6.test(v)) return v.toLowerCase();
  if (HEX3.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  return fallback;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function hexToRgb(hex: Hex): [number, number, number] {
  const n = parseInt(normalizeHex(hex, '#808080').slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): Hex {
  const to = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** [hue 0..360, saturation 0..1, lightness 0..1] */
export function hexToHsl(hex: Hex): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToHex(h: number, s: number, l: number): Hex {
  const hh = ((h % 360) + 360) % 360, ss = clamp01(s), ll = clamp01(l);
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x]
    : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Lighter (dl > 0) or darker (dl < 0) version of a colour. */
export function shadeHex(hex: Hex, dl: number): Hex {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, l + dl);
}

/** Linear RGB mix: t = 0 gives a, t = 1 gives b. */
export function mixHex(a: Hex, b: Hex, t: number): Hex {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  return rgbToHex(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t);
}

// ---------------------------------------------------------------------------------------------
// Resolution and validation
// ---------------------------------------------------------------------------------------------

export interface ResolvedOutfit {
  /** Drawable layers in draw order; choices are sanitised (valid colours, allowed pattern). */
  layers: Array<{ layer: GarmentLayer; choice: GarmentChoice; def: GarmentDef }>;
  accessories: Array<{ def: AccessoryDef; color: string }>;
  issues: string[];
}

/** Resolves an outfit into garment definitions for drawing. Never throws; problems go to `issues`. */
export function resolveOutfit(outfit: Outfit, content: ContentDB): ResolvedOutfit {
  const issues: string[] = [];
  const found: Partial<Record<GarmentLayer, ResolvedOutfit['layers'][number]>> = {};
  for (const layer of LAYER_DRAW_ORDER) {
    const choice = outfit.layers?.[layer];
    if (!choice) continue;
    const def = content.garments[choice.garmentId];
    if (!def) { issues.push(`Unknown garment "${choice.garmentId}" (${LAYER_NAMES[layer]}) was skipped.`); continue; }
    if (def.layer !== layer) {
      issues.push(`${def.name} is ${LAYER_NAMES[def.layer].toLowerCase()} and cannot be worn as ${LAYER_NAMES[layer].toLowerCase()}; skipped.`);
      continue;
    }
    found[layer] = { layer, def, choice: sanitizeChoice(choice, def, content, issues) };
  }
  const hasFull = found.full !== undefined;
  const layers: ResolvedOutfit['layers'] = [];
  for (const layer of LAYER_DRAW_ORDER) {
    if (hasFull && (layer === 'top' || layer === 'bottom')) continue;
    const entry = found[layer];
    if (entry) layers.push(entry);
  }
  const accessories: ResolvedOutfit['accessories'] = [];
  for (const acc of outfit.accessories ?? []) {
    const def = content.accessories[acc.accessoryId];
    if (!def) { issues.push(`Unknown accessory "${acc.accessoryId}" was skipped.`); continue; }
    accessories.push({ def, color: normalizeHex(acc.color, def.defaultColor) });
  }
  return { layers, accessories, issues };
}

function sanitizeChoice(choice: GarmentChoice, def: GarmentDef, content: ContentDB, issues: string[]): GarmentChoice {
  const color = normalizeHex(choice.color, def.defaultColor);
  let pattern = typeof choice.pattern === 'string' && choice.pattern ? choice.pattern : 'solid';
  if (!patternAllowed(def, pattern, content)) {
    issues.push(`Pattern "${pattern}" is not available for ${def.name}; drawn solid.`);
    pattern = 'solid';
  }
  return { garmentId: def.id, color, pattern, patternColor: normalizeHex(choice.patternColor, shadeHex(color, -0.2)) };
}

function patternAllowed(def: GarmentDef, pattern: string, content: ContentDB): boolean {
  if (pattern === 'solid') return true;
  const known = Object.keys(content.patterns ?? {}).length === 0 || content.patterns[pattern] !== undefined;
  return known && def.patterns.includes(pattern);
}

/** Ready garments that fit a category and layer, in registry order. */
export function garmentsFor(content: ContentDB, category: OutfitCategory, layer: GarmentLayer): GarmentDef[] {
  return Object.values(content.garments ?? {})
    .filter((g) => g.status === 'ready' && g.layer === layer && g.categories.includes(category));
}

/** Whether the content can dress a category: a body layer (top+bottom or full) and shoes. */
export function categoryCoverage(content: ContentDB, category: OutfitCategory): { body: boolean; shoes: boolean } {
  const n = (layer: GarmentLayer) => garmentsFor(content, category, layer).length > 0;
  return { body: (n('top') && n('bottom')) || n('full'), shoes: n('shoes') };
}

/**
 * Checks an outfit against its category: a top and bottom or a full garment, shoes (except sleep and swim),
 * every garment tagged for the category, allowed patterns, valid colours, one accessory per kind.
 * Body-layer and shoe requirements apply only when the content can satisfy them, unless `strict`.
 */
export function validateOutfit(
  outfit: Outfit, category: OutfitCategory, content: ContentDB, opts: { strict?: boolean } = {},
): string[] {
  const issues: string[] = [];
  const catName = OUTFIT_CATEGORY_NAMES[category];
  const layers = outfit.layers ?? {};
  for (const layer of LAYER_DRAW_ORDER) {
    const choice = layers[layer];
    if (!choice) continue;
    const label = LAYER_NAMES[layer];
    const def = content.garments[choice.garmentId];
    if (!def) { issues.push(`${label}: garment "${choice.garmentId}" is not available.`); continue; }
    if (def.layer !== layer) issues.push(`${label}: ${def.name} is not ${label.toLowerCase()}.`);
    if (!def.categories.includes(category)) issues.push(`${label}: ${def.name} is not suitable for ${catName} outfits.`);
    if (def.status !== 'ready') issues.push(`${label}: ${def.name} is not finished yet.`);
    if (!isHex(choice.color)) issues.push(`${label}: the colour is not valid.`);
    if (!patternAllowed(def, choice.pattern, content)) issues.push(`${label}: pattern "${choice.pattern}" is not available for ${def.name}.`);
    else if (choice.pattern !== 'solid' && !isHex(choice.patternColor)) issues.push(`${label}: the pattern colour is not valid.`);
  }
  const cover = categoryCoverage(content, category);
  if (layers.full && (layers.top || layers.bottom)) issues.push(NOTE_FULL_REPLACES + ' Remove one of them.');
  if (!layers.full && !(layers.top && layers.bottom) && (opts.strict || cover.body)) {
    issues.push(layers.top ? 'Add a bottom or choose a full outfit.'
      : layers.bottom ? 'Add a top or choose a full outfit.'
        : 'Choose a top and a bottom, or a full outfit.');
  }
  if (!SHOES_OPTIONAL.includes(category) && !layers.shoes && (opts.strict || cover.shoes)) issues.push('Choose shoes.');
  const kinds = new Set<string>();
  const accessories = outfit.accessories ?? [];
  if (accessories.length > MAX_ACCESSORIES) issues.push(`At most ${MAX_ACCESSORIES} accessories can be worn.`);
  for (const acc of accessories) {
    const def = content.accessories[acc.accessoryId];
    if (!def) { issues.push(`Accessory "${acc.accessoryId}" is not available.`); continue; }
    if (SINGLE_ACCESSORY_KINDS.includes(def.kind)) {
      if (kinds.has(def.kind)) issues.push(`Only one ${def.kind} item can be worn at a time.`);
      kinds.add(def.kind);
    }
    if (!isHex(acc.color)) issues.push(`${def.name}: the colour is not valid.`);
  }
  return issues;
}

/** Validates every outfit of a wardrobe (at least one per category) and the worn outfit reference. */
export function validateWardrobe(wardrobe: Wardrobe, content: ContentDB): string[] {
  const issues: string[] = [];
  for (const cat of OUTFIT_CATEGORIES) {
    const list = wardrobe.outfits?.[cat] ?? [];
    const name = OUTFIT_CATEGORY_NAMES[cat];
    if (list.length === 0) { issues.push(`${name}: add at least one outfit.`); continue; }
    if (list.length > MAX_OUTFITS_PER_CATEGORY) issues.push(`${name}: at most ${MAX_OUTFITS_PER_CATEGORY} outfits.`);
    list.forEach((o, i) => {
      const prefix = list.length > 1 ? `${name} ${i + 1}` : name;
      for (const msg of validateOutfit(o, cat, content)) issues.push(`${prefix}: ${msg}`);
    });
  }
  const cur = wardrobe.current;
  if (!cur || !wardrobe.outfits?.[cur.category]?.[cur.index]) issues.push('The worn outfit does not exist.');
  return issues;
}

// ---------------------------------------------------------------------------------------------
// Wardrobe helpers
// ---------------------------------------------------------------------------------------------

export function emptyOutfit(id: string, name: string): Outfit { return { id, name, layers: {}, accessories: [] }; }

export function makeOutfit(
  id: string, name: string, layers: Outfit['layers'], accessories: Outfit['accessories'] = [],
): Outfit {
  return { id, name, layers: { ...layers }, accessories: accessories.map((a) => ({ ...a })) };
}

/** A garment choice with the garment's default colour unless one is given. */
export function garmentChoice(def: GarmentDef, color?: Hex, pattern = 'solid', patternColor?: Hex): GarmentChoice {
  const c = normalizeHex(color, def.defaultColor);
  return { garmentId: def.id, color: c, pattern, patternColor: normalizeHex(patternColor, shadeHex(c, -0.2)) };
}

/** Readable, wardrobe-unique outfit id (`out-<category>-<n>`); the simulation may assign world ids later. */
export function outfitId(category: OutfitCategory, n: number): string { return `out-${category}-${n}`; }

export function nextOutfitId(wardrobe: Wardrobe, category: OutfitCategory): string {
  const used = new Set(OUTFIT_CATEGORIES.flatMap((c) => (wardrobe.outfits[c] ?? []).map((o) => o.id)));
  let n = 1;
  while (used.has(outfitId(category, n))) n++;
  return outfitId(category, n);
}

export function emptyWardrobe(): Wardrobe {
  return {
    outfits: { everyday: [], formal: [], work: [], athletic: [], sleep: [], swim: [] },
    current: { category: 'everyday', index: 0 },
  };
}

/** The outfit a person is wearing now (falls back to the first outfit of the category, then everyday). */
export function currentOutfit(person: { outfits: Wardrobe }): Outfit {
  const w = person.outfits;
  const list = w.outfits?.[w.current?.category] ?? [];
  return list[w.current?.index ?? 0] ?? list[0] ?? w.outfits?.everyday?.[0] ?? emptyOutfit('out-none', 'None');
}

/** The outfit worn for a category: the worn one when already in that category, else its first outfit. */
export function outfitFor(person: { outfits: Wardrobe }, category: OutfitCategory): Outfit {
  const w = person.outfits;
  const list = w.outfits?.[category] ?? [];
  const index = w.current?.category === category ? w.current.index : 0;
  return list[index] ?? list[0] ?? currentOutfit(person);
}

/**
 * Sets or clears one layer with automatic conflict resolution: a full garment removes top and bottom,
 * a top or bottom removes a full garment. Returns a new outfit and a note when something was replaced.
 */
export function setLayer(outfit: Outfit, layer: GarmentLayer, choice: GarmentChoice | null): { outfit: Outfit; note: string | null } {
  const layers = { ...outfit.layers };
  let note: string | null = null;
  if (choice === null) delete layers[layer];
  else {
    layers[layer] = { ...choice };
    if (layer === 'full' && (layers.top || layers.bottom)) { delete layers.top; delete layers.bottom; note = NOTE_FULL_REPLACES; }
    if ((layer === 'top' || layer === 'bottom') && layers.full) { delete layers.full; note = NOTE_PIECE_REPLACES_FULL; }
  }
  return { outfit: { ...outfit, layers, accessories: outfit.accessories.map((a) => ({ ...a })) }, note };
}

/**
 * Adds an accessory. One item per single kind (a new hat replaces the old one, with a note);
 * fails when the outfit already has the maximum number of accessories.
 */
export function addAccessory(
  outfit: Outfit, def: AccessoryDef, content: ContentDB, color?: Hex,
): { ok: true; outfit: Outfit; note: string | null } | { ok: false; reason: string } {
  const accessories = outfit.accessories.filter((a) => a.accessoryId !== def.id).map((a) => ({ ...a }));
  let note: string | null = null;
  if (SINGLE_ACCESSORY_KINDS.includes(def.kind)) {
    const clash = accessories.findIndex((a) => content.accessories[a.accessoryId]?.kind === def.kind);
    if (clash >= 0) { accessories.splice(clash, 1); note = `Only one ${def.kind} item can be worn; the previous one was replaced.`; }
  }
  if (accessories.length >= MAX_ACCESSORIES) return { ok: false, reason: `At most ${MAX_ACCESSORIES} accessories can be worn.` };
  accessories.push({ accessoryId: def.id, color: normalizeHex(color, def.defaultColor) });
  return { ok: true, outfit: { ...outfit, layers: { ...outfit.layers }, accessories }, note };
}

// ---------------------------------------------------------------------------------------------
// Presentation affinity (defaults only)
// ---------------------------------------------------------------------------------------------

/** A garment's affinity ('neutral' when untagged). */
export function garmentAffinity(def: GarmentDef | AccessoryDef): GarmentAffinity { return def.affinity ?? 'neutral'; }

/**
 * Affinities a person's default outfits are drawn from: he/him gets masc + neutral, she/her fem + neutral.
 * Anyone else (they/them, custom pronouns) gets neutral plus the affinity of their body frame when known
 * ('a' leans masc, 'b' leans fem). Used for premades, random people and "randomize"; never to restrict a choice.
 */
export function allowedAffinities(pronouns: Pronouns | undefined, frame?: BodyFrame): readonly GarmentAffinity[] {
  const subject = pronouns?.subject.trim().toLowerCase();
  if (subject === 'he') return ['masc', 'neutral'];
  if (subject === 'she') return ['fem', 'neutral'];
  return frame === 'a' ? ['neutral', 'masc'] : frame === 'b' ? ['neutral', 'fem'] : ['neutral'];
}

// ---------------------------------------------------------------------------------------------
// Random outfits with colour harmony
// ---------------------------------------------------------------------------------------------

/** Colours for one outfit: main (tops/full), second, accent (patterns, sporty shoes), neutral, dark. */
export interface OutfitPalette { main: Hex; second: Hex; accent: Hex; neutral: Hex; dark: Hex }

const LIGHT_NEUTRALS: readonly Hex[] = ['#f2efe8', '#e4ddd0', '#d9cfbf', '#c8b48a', '#b9bcc2', '#ece6f0'];
const MID_NEUTRALS: readonly Hex[] = ['#8a8f98', '#6b5b4b', '#7d7461', '#5d6b7a', '#9a8f80'];
const DARK_NEUTRALS: readonly Hex[] = ['#1f1f22', '#2b2d33', '#2f3a52', '#3b302a', '#33392f'];

/** Saturation and lightness ranges per category: formal is deep, sleepwear pastel, athletic bright. */
const TONE: Record<OutfitCategory, { s: [number, number]; l: [number, number] }> = {
  everyday: { s: [0.28, 0.52], l: [0.35, 0.6] },
  formal: { s: [0.2, 0.45], l: [0.18, 0.38] },
  work: { s: [0.15, 0.4], l: [0.3, 0.5] },
  athletic: { s: [0.55, 0.8], l: [0.42, 0.58] },
  sleep: { s: [0.2, 0.4], l: [0.7, 0.85] },
  swim: { s: [0.55, 0.85], l: [0.4, 0.6] },
};
const FULL_CHANCE: Record<OutfitCategory, number> = { everyday: 0.2, formal: 0.4, work: 0.2, athletic: 0.2, sleep: 0.5, swim: 0.8 };
const OUTER_CHANCE: Record<OutfitCategory, number> = { everyday: 0.3, formal: 0.5, work: 0.35, athletic: 0.1, sleep: 0.1, swim: 0 };
const OPTIONAL_SHOES_CHANCE = 0.3;
const ACCESSORY_CHANCE: Record<OutfitCategory, number> = { everyday: 0.45, formal: 0.6, work: 0.25, athletic: 0.15, sleep: 0, swim: 0.2 };
const PATTERN_CHANCE = 0.2;

/** Fixed colours for garments whose real-world colour range is narrow, so random outfits look plausible. */
const DENIM_COLORS: readonly Hex[] = ['#3f5a85', '#4a6a96', '#2f4468', '#6d86a8', '#364a6b'];
/** Tailored trousers: dark for formal, a wider range for work. */
const SUIT_COLORS: readonly Hex[] = ['#2b2d33', '#2f3a52', '#3a3b44', '#3b302a', '#4a4f5c'];
const WORK_TROUSER_COLORS: readonly Hex[] = ['#3a3b44', '#4a4f5c', '#6b6a63', '#8a7f66', '#2f3a52'];
/** Chance that a sleep or swim outfit uses garments made for it (pyjamas, trunks) rather than everyday pieces. */
const SPECIFIC_CHANCE = 0.85;
const LEATHER_COLORS: readonly Hex[] = ['#3b2a22', '#6b4630', '#4a3426', '#2b2d33'];
/** Minimum lightness gap between a top and a bottom worn together. */
const MIN_PIECE_CONTRAST = 0.14;

/** A harmonious palette around a base hue (analogous, complementary, monochrome or triad scheme). */
export function harmonyPalette(rng: Rng, category: OutfitCategory, baseHue: number): OutfitPalette {
  const tone = TONE[category];
  const s = rng.range(tone.s[0], tone.s[1]);
  const l = rng.range(tone.l[0], tone.l[1]);
  const h = baseHue;
  const neutral = rng.pick(category === 'formal' ? DARK_NEUTRALS : rng.chance(0.5) ? LIGHT_NEUTRALS : MID_NEUTRALS);
  const dark = rng.pick(DARK_NEUTRALS);
  const main = hslToHex(h, s, l);
  switch (rng.int(0, 3)) {
    case 0: return { main, second: hslToHex(h + 30, s * 0.9, Math.min(0.9, l + 0.08)), accent: hslToHex(h - 35, s, l - 0.05), neutral, dark };
    case 1: return { main, second: neutral, accent: hslToHex(h + 180, s, l), neutral, dark };
    case 2: return { main, second: hslToHex(h, s * 0.8, Math.min(0.9, l + 0.2)), accent: hslToHex(h, s, l - 0.15), neutral, dark };
    default: return { main, second: hslToHex(h + 120, s * 0.6, Math.min(0.9, l + 0.05)), accent: hslToHex(h + 240, s * 0.7, l), neutral, dark };
  }
}

function plainPalette(category: OutfitCategory): OutfitPalette {
  const light = category === 'sleep' ? '#d9dfe8' : '#e4ddd0';
  return { main: category === 'formal' ? '#2f3a52' : light, second: '#5d6b7a', accent: '#8a8f98', neutral: '#5d6b7a', dark: '#2b2d33' };
}

export interface RandomOutfitOptions {
  id?: string;
  name?: string;
  /** Base hue for the colour harmony (random when omitted). */
  hue?: number;
  /** Neutral colours, no patterns, no accessories (for blank characters). */
  plain?: boolean;
  /** Glasses worn with this outfit (kept consistent across a person's wardrobe). */
  glassesId?: string | null;
  /**
   * Garment affinities to draw from (see allowedAffinities). Omitted = any garment. A layer with no matching
   * garment falls back to any garment, so outfits stay valid; full garments are never taken from outside the set
   * while top and bottom pieces exist.
   */
  affinities?: readonly GarmentAffinity[];
}

/** A random, valid (when the content allows it) outfit for a category with harmonised colours. */
export function randomOutfit(rng: Rng, content: ContentDB, category: OutfitCategory, opts: RandomOutfitOptions = {}): Outfit {
  const hue = opts.hue ?? rng.range(0, 360);
  const pal = opts.plain ? plainPalette(category) : harmonyPalette(rng, category, hue);
  // Sleep and swim outfits mostly use garments made for them (pyjamas, swim trunks) when the pool has any.
  const specificTag = category === 'sleep' ? 'sleepwear' : category === 'swim' ? 'swimwear' : null;
  const specific = specificTag !== null && rng.chance(SPECIFIC_CHANCE);
  const matching = (layer: GarmentLayer): GarmentDef[] => {
    const all = garmentsFor(content, category, layer);
    const fits = opts.affinities ? all.filter((g) => opts.affinities!.includes(garmentAffinity(g))) : all;
    const made = specific ? fits.filter((g) => g.tags.includes(specificTag!)) : [];
    return made.length > 0 ? made : fits;
  };
  /** Matching garments of a layer, else (for pieces, shoes, outer) anything that fits the category. */
  const lenient = (layer: GarmentLayer): GarmentDef[] => {
    const m = matching(layer);
    return m.length > 0 ? m : garmentsFor(content, category, layer);
  };
  const pick = (list: GarmentDef[]): GarmentDef | null => (list.length > 0 ? rng.pick(list) : null);
  const choose = (def: GarmentDef, color: Hex, pattern?: string): GarmentChoice => {
    const patterns = def.patterns.filter((p) => p !== 'solid' && patternAllowed(def, p, content));
    const patterned = pattern !== undefined ? pattern !== 'solid' && patterns.includes(pattern)
      : !opts.plain && patterns.length > 0 && rng.chance(PATTERN_CHANCE);
    const chosen = pattern !== undefined ? (patterned ? pattern : 'solid') : patterned ? rng.pick(patterns) : 'solid';
    const patternColor = pal.accent.toLowerCase() === color.toLowerCase() ? shadeHex(color, 0.25) : pal.accent;
    return garmentChoice(def, color, chosen, patternColor);
  };
  const isDenim = (def: GarmentDef) => def.tags.includes('denim');
  /** Tops and bottoms that look odd together: collared tops with joggers, knitwear with shorts. */
  const pairs = (top: GarmentDef, bottom: GarmentDef) =>
    !(top.tags.includes('collar') && bottom.tags.includes('cosy')) && !(top.tags.includes('winter') && bottom.tags.includes('short'));

  const layers: Outfit['layers'] = {};
  const strictPieces = matching('top').length > 0 && matching('bottom').length > 0;
  const canPieces = lenient('top').length > 0 && lenient('bottom').length > 0;
  const strictFull = matching('full');
  const hasFull = strictFull.length > 0 || (!canPieces && garmentsFor(content, category, 'full').length > 0);
  if (hasFull && (!canPieces || (strictFull.length > 0 && (!strictPieces || rng.chance(FULL_CHANCE[category]))))) {
    const full = pick(strictFull.length > 0 ? strictFull : garmentsFor(content, category, 'full'));
    if (full) layers.full = choose(full, !opts.plain && isDenim(full) ? rng.pick(DENIM_COLORS) : pal.main);
  } else {
    const top = pick(lenient('top'));
    const bottoms = lenient('bottom');
    const bottom = pick(top ? (bottoms.filter((b) => pairs(top, b)).length > 0 ? bottoms.filter((b) => pairs(top, b)) : bottoms) : bottoms);
    let topChoice: GarmentChoice | null = null;
    if (top) { topChoice = choose(top, pal.main); layers.top = topChoice; }
    if (bottom) {
      let color: Hex = rng.chance(0.6) ? pal.neutral : pal.second;
      let pattern: string | undefined;
      if (!opts.plain && isDenim(bottom)) color = rng.pick(DENIM_COLORS);
      else if (!opts.plain && bottom.tags.includes('smart') && bottom.tags.includes('long')) {
        color = rng.pick(category === 'formal' ? SUIT_COLORS : WORK_TROUSER_COLORS);
      }
      else if (!opts.plain && category === 'sleep') {
        // Pyjamas come as a set: the same colour (or its partner) and the same pattern as the top.
        color = rng.chance(0.7) ? pal.main : pal.second;
        pattern = topChoice?.pattern;
      } else if (!opts.plain && topChoice) {
        // Keep a readable gap between top and bottom.
        const lt = hexToHsl(topChoice.color)[2];
        if (Math.abs(hexToHsl(color)[2] - lt) < MIN_PIECE_CONTRAST) color = lt > 0.5 ? pal.dark : rng.pick(LIGHT_NEUTRALS);
      }
      layers.bottom = choose(bottom, color, pattern);
    }
  }
  const wearsShorts = layers.bottom !== undefined && content.garments[layers.bottom.garmentId]?.tags.includes('short') === true;
  if (!SHOES_OPTIONAL.includes(category) || rng.chance(OPTIONAL_SHOES_CHANCE)) {
    const allShoes = lenient('shoes');
    const dressy = allShoes.filter((g) => !(wearsShorts && g.tags.includes('boots')));
    const shoes = pick(dressy.length > 0 ? dressy : allShoes);
    if (shoes) {
      const leather = shoes.tags.includes('leather') || shoes.tags.includes('boots');
      layers.shoes = garmentChoice(shoes, leather && !opts.plain ? rng.pick(LEATHER_COLORS)
        : category === 'athletic' && rng.chance(0.5) ? pal.accent : pal.dark);
    }
  }
  if (rng.chance(OUTER_CHANCE[category]) && !wearsShorts) {
    const outer = pick(lenient('outer'));
    if (outer) layers.outer = choose(outer, rng.chance(0.5) ? pal.second : pal.dark);
  }

  const accessories: Outfit['accessories'] = [];
  const glasses = opts.glassesId ? content.accessories[opts.glassesId] : undefined;
  if (glasses) accessories.push({ accessoryId: glasses.id, color: glasses.defaultColor });
  if (!opts.plain && rng.chance(ACCESSORY_CHANCE[category])) {
    const kinds = new Set(accessories.map((a) => content.accessories[a.accessoryId]?.kind));
    const pool = Object.values(content.accessories ?? {})
      .filter((a) => a.status === 'ready' && a.kind !== 'glasses' && !kinds.has(a.kind)
        && (!opts.affinities || opts.affinities.includes(garmentAffinity(a))));
    if (pool.length > 0) {
      const acc = rng.pick(pool);
      accessories.push({ accessoryId: acc.id, color: rng.chance(0.5) ? acc.defaultColor : pal.accent });
    }
  }
  return {
    id: opts.id ?? outfitId(category, 1),
    name: opts.name ?? OUTFIT_CATEGORY_NAMES[category],
    layers,
    accessories,
  };
}

export interface WardrobeOptions {
  /** Favourite hue; each category varies around it. Random when omitted. */
  hue?: number;
  /** Neutral, pattern-free outfits without accessories. */
  plain?: boolean;
  /** Glasses for every daytime outfit: an accessory id, true (random glasses), false/null (none). Default: 20 % chance. */
  glasses?: string | boolean | null;
  /** Garment affinities to draw from (see allowedAffinities). Omitted = any garment. */
  affinities?: readonly GarmentAffinity[];
  /** Chance (0..1, default 0) that an outfit ignores `affinities` and draws from every garment (full randomize only). */
  crossover?: number;
}

/** One outfit per category (valid whenever the content can dress that category), worn: everyday. */
export function defaultWardrobe(content: ContentDB, rng: Rng, opts: WardrobeOptions = {}): Wardrobe {
  const hue = opts.hue ?? rng.range(0, 360);
  const glassesPool = Object.values(content.accessories ?? {}).filter((a) => a.status === 'ready' && a.kind === 'glasses');
  let glassesId: string | null = null;
  if (typeof opts.glasses === 'string') glassesId = content.accessories[opts.glasses] ? opts.glasses : null;
  else if (!opts.plain && glassesPool.length > 0 && (opts.glasses === true || (opts.glasses === undefined && rng.chance(0.2)))) {
    glassesId = rng.pick(glassesPool).id;
  }
  const w = emptyWardrobe();
  for (const cat of OUTFIT_CATEGORIES) {
    const daytime = cat !== 'sleep' && cat !== 'swim';
    const crossed = opts.affinities !== undefined && (opts.crossover ?? 0) > 0 && rng.chance(opts.crossover ?? 0);
    w.outfits[cat] = [randomOutfit(rng, content, cat, {
      ...(opts.affinities && !crossed ? { affinities: opts.affinities } : {}),
      id: outfitId(cat, 1),
      name: OUTFIT_CATEGORY_NAMES[cat],
      hue: hue + rng.range(-25, 25),
      plain: opts.plain ?? false,
      glassesId: daytime ? glassesId : null,
    })];
  }
  return w;
}

// ---------------------------------------------------------------------------------------------
// Import helpers and wardrobe normalization (used by the template readers)
// ---------------------------------------------------------------------------------------------

export const OUTFIT_NAME_MAX_LENGTH = 32;
/** Seed for plain outfits (stable, so blank people are identical). */
const PLAIN_SEED = 7;

export type Json = Record<string, unknown>;
/** Receives one human-readable substitution note. */
export type Note = (message: string) => void;
export const asObj = (v: unknown): Json => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : {});
export const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');
export const asNum = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Strips control characters and limits length (keeps spaces so typing works). */
export function cleanText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
}

/** Neutral, pattern-free outfits for every category (the wardrobe of blank people). */
export function plainWardrobe(content: ContentDB): Wardrobe {
  return defaultWardrobe(content, new Rng(seedRng(PLAIN_SEED)), { plain: true, affinities: ['neutral'] });
}

/** Reads one outfit from untrusted JSON, replacing missing garments by the first fitting ready garment. */
function normalizeOutfit(raw: unknown, cat: OutfitCategory, i: number, content: ContentDB, note: Note, w: Wardrobe): Outfit {
  const r = asObj(raw), layersIn = asObj(r.layers);
  const catName = OUTFIT_CATEGORY_NAMES[cat];
  const usedIds = new Set(OUTFIT_CATEGORIES.flatMap((c) => w.outfits[c].map((o) => o.id)));
  const id = asStr(r.id) && !usedIds.has(asStr(r.id)) ? asStr(r.id) : nextOutfitId(w, cat);
  const layers: Outfit['layers'] = {};
  for (const layer of LAYER_DRAW_ORDER) {
    if (layersIn[layer] === undefined || layersIn[layer] === null) continue;
    const c = asObj(layersIn[layer]);
    const gid = asStr(c.garmentId);
    let def = content.garments[gid];
    if (!def || def.layer !== layer) {
      const repl = garmentsFor(content, cat, layer)[0];
      note(repl ? `${catName} ${LAYER_NAMES[layer].toLowerCase()} "${gid}" is not available; using ${repl.name} instead.`
        : `${catName} ${LAYER_NAMES[layer].toLowerCase()} "${gid}" is not available and was removed.`);
      if (!repl) continue;
      def = repl;
    }
    const color = normalizeHex(c.color, def.defaultColor);
    let pattern = asStr(c.pattern) || 'solid';
    if (pattern !== 'solid' && !def.patterns.includes(pattern)) { note(`Pattern "${pattern}" is not available for ${def.name}; solid is used.`); pattern = 'solid'; }
    layers[layer] = { garmentId: def.id, color, pattern, patternColor: normalizeHex(c.patternColor, shadeHex(color, -0.2)) };
  }
  if (layers.full && (layers.top || layers.bottom)) {
    delete layers.top; delete layers.bottom;
    note(`${catName}: the full outfit replaces the top and bottom.`);
  }
  const accessories: Outfit['accessories'] = [];
  for (const a of asArr(r.accessories)) {
    const ar = asObj(a), aid = asStr(ar.accessoryId);
    const adef = content.accessories[aid];
    if (!adef) { note(`Accessory "${aid}" is not available and was removed.`); continue; }
    if (accessories.length < MAX_ACCESSORIES) accessories.push({ accessoryId: aid, color: normalizeHex(ar.color, adef.defaultColor) });
  }
  return { id, name: cleanText(r.name, OUTFIT_NAME_MAX_LENGTH) || `${catName} ${i + 1}`, layers, accessories };
}

/** Reads a wardrobe from untrusted JSON (templates); missing assets are replaced or removed with a note. */
export function normalizeWardrobe(raw: unknown, content: ContentDB, note: Note): Wardrobe {
  const r = asObj(raw), outfits = asObj(r.outfits);
  const w = emptyWardrobe();
  const missing: string[] = [];
  for (const cat of OUTFIT_CATEGORIES) {
    asArr(outfits[cat]).slice(0, MAX_OUTFITS_PER_CATEGORY).forEach((o, i) => { w.outfits[cat].push(normalizeOutfit(o, cat, i, content, note, w)); });
    if (w.outfits[cat].length === 0) {
      w.outfits[cat].push(randomOutfit(new Rng(seedRng(PLAIN_SEED)), content, cat, { id: nextOutfitId(w, cat), plain: true, affinities: ['neutral'] }));
      missing.push(OUTFIT_CATEGORY_NAMES[cat]);
    }
  }
  if (missing.length === OUTFIT_CATEGORIES.length) note('No outfits were included; plain outfits were added.');
  else if (missing.length > 0) note(`Plain outfits were added for: ${missing.join(', ')}.`);
  const cur = asObj(r.current);
  const category = (OUTFIT_CATEGORIES as readonly unknown[]).includes(cur.category) ? (cur.category as OutfitCategory) : 'everyday';
  const index = typeof cur.index === 'number' && w.outfits[category][cur.index] ? cur.index : 0;
  w.current = { category, index };
  return w;
}
