// People for Hearthside Life (pure: no three.js, no DOM): original names and bios, identity options,
// appearance defaults, random people, the authored premade households and the readers that turn untrusted
// template JSON back into valid people. CreatorSession and validation live in creator.ts.
//
// Names are common real-world names of many origins. They lean loosely toward pronoun sets only to make
// random people feel natural; nothing here ties hair, clothing, facial hair, body frame or identity together.

import type { ContentDB, HairDef, ParamDef, Swatch } from '../content/types';
import type { HouseholdDraft, PersonDraft } from '../core/drafts';
import { Rng, seedRng } from '../core/rng';
import { migrateModularLook } from './modular/look';
import type { Appearance, BodyFrame, FamilyTie, Hex, LifeStage, Person, Pronouns } from '../core/types';
import {
  allowedAffinities, asArr, asNum, asObj, asStr, cleanText, defaultWardrobe, hexToHsl, isHex, mixHex, normalizeHex, normalizeWardrobe,
  plainWardrobe, shadeHex, type Note,
} from './outfits';

// ---------------------------------------------------------------------------------------------
// Identity options and limits
// ---------------------------------------------------------------------------------------------

export const TRAITS_PER_ADULT = 3;
export const MAX_LIKES = 5;
export const MAX_DISLIKES = 5;
export const NAME_MAX_LENGTH = 24;
export const BIO_MAX_LENGTH = 280;
export const PRONOUN_MAX_LENGTH = 12;
/** Every life stage, youngest first. */
export const LIFE_STAGES: readonly LifeStage[] = ['baby', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'];
/** Stages with adult rules (romance, careers, caregiving, three traits). */
export const ADULT_STAGES: readonly LifeStage[] = ['youngAdult', 'adult', 'elder'];

export type PronounPreset = 'she' | 'he' | 'they';
export const PRONOUN_PRESETS: Record<PronounPreset, Pronouns> = {
  she: { subject: 'she', object: 'her', possessive: 'her' },
  he: { subject: 'he', object: 'him', possessive: 'his' },
  they: { subject: 'they', object: 'them', possessive: 'their' },
};

/** Walking-style presets (animation variants arrive in a later milestone; the choice is stored now). */
export const WALK_STYLES: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'easy', name: 'Easygoing' }, { id: 'brisk', name: 'Brisk' }, { id: 'bouncy', name: 'Bouncy' },
  { id: 'proud', name: 'Proud' }, { id: 'shy', name: 'Shy' },
];
export const DEFAULT_WALK_STYLE = 'easy';

const FALLBACK_SKIN: readonly Hex[] = ['#f6dcc7', '#ecc09f', '#d9a27c', '#b97c55', '#8d5a3b', '#5e3b26'];
const FALLBACK_HAIR: readonly Hex[] = ['#1c1714', '#3b2a20', '#5a3d2b', '#8a5a36', '#b7884f', '#d9b77a', '#8a3b22', '#9a9a9a'];
const FALLBACK_EYES: readonly Hex[] = ['#4a2f1d', '#6b4a2b', '#3d6b8c', '#4f7a4a', '#7a7a5a', '#5a6a7a'];
const LIPSTICKS: readonly Hex[] = ['#9e2b3a', '#b5505e', '#c2675f', '#7a3045', '#d27a6e'];

// ---------------------------------------------------------------------------------------------
// Names and bios
// ---------------------------------------------------------------------------------------------

/** First names that usually read as feminine, masculine or either. */
export const FEMININE_NAMES: readonly string[] = [
  'Amara', 'Sofia', 'Priya', 'Ingrid', 'Mei', 'Nia', 'Aiko', 'Zara', 'Leila', 'Freya', 'Lucia', 'Yara', 'Ama',
  'Saanvi', 'Imani', 'Noor', 'Chiara', 'Esme', 'Ines', 'Talia', 'Malia', 'Ayla', 'Elena', 'Signe', 'Hana', 'Lena',
  'Clara', 'Nadia', 'Maren', 'Odette', 'Rosa', 'Thandiwe', 'Beatriz', 'Yuna', 'Farah',
];
export const MASCULINE_NAMES: readonly string[] = [
  'Leon', 'Kenji', 'Mateo', 'Tariq', 'Oskar', 'Rafael', 'Elias', 'Tomas', 'Arjun', 'Kwame', 'Dmitri', 'Henrik',
  'Diego', 'Felix', 'Hugo', 'Mikael', 'Omar', 'Bao', 'Viktor', 'Kofi', 'Ravi', 'Joaquin', 'Emeka', 'Farid', 'Ruben',
  'Anders', 'Tevita', 'Idris', 'Lorenzo', 'Matthias',
];
export const NEUTRAL_NAMES: readonly string[] = [
  'Robin', 'Alex', 'Sasha', 'Jordan', 'Rowan', 'Ari', 'Noa', 'Quinn', 'Sage', 'Riley', 'Eden', 'Kit', 'Remy',
  'Jules', 'Kai', 'Sami', 'Jun', 'Avery', 'Morgan', 'Shay', 'Tenzin', 'Nico', 'Emerson', 'Lane',
];
/** Every first name (about 90). */
export const FIRST_NAMES: readonly string[] = [...FEMININE_NAMES, ...MASCULINE_NAMES, ...NEUTRAL_NAMES];

/** Surnames of many origins (about 60). */
export const SURNAMES: readonly string[] = [
  'Okafor', 'Lindqvist', 'Nakamura', 'Haddad', 'Moreau', 'Petrov', 'Castillo', 'Mensah', 'Kowalski', 'Fernandes',
  'Nguyen', 'Brennan', 'Achterberg', 'Sato', 'Adeyemi', 'Rossi', 'Halvorsen', 'Kapoor', 'Dubois', 'Varga', 'Holm',
  'Marsh', 'Ellery', 'Whitlock', 'Penrose', 'Abara', 'Quispe', 'Tanaka', 'Mwangi', 'Rahman', 'Novak', 'Eriksen',
  'Laurent', 'Bianchi', 'Sorensen', 'Akhtar', 'Oyelaran', 'Fairweather', 'Ashdown', 'Kaur', 'Zielinski',
  'Takahashi', 'Obi', 'Lund', 'Herrera', 'Osei', 'Bergstrom', 'Duarte', 'Farouk', 'Ishikawa', 'Magnusson', 'Ndlovu',
  'Rivera', 'Saarinen', 'Torres', 'Yilmaz', 'Zhou', 'Lambert', 'Hartley', 'Quintero', 'Amadi', 'Sandoval',
];

/** Short third-person bios written without pronouns so they fit anyone. */
export const BIOS: readonly string[] = [
  'Keeps a notebook of overheard conversations, strictly for research.',
  'Can fix a squeaky hinge but not a sourdough starter.',
  'Believes every room needs one plant and one good lamp.',
  'Learned to cook from late-night radio shows and sheer stubbornness.',
  'Moved here for the quiet streets and stayed for the bakery.',
  'Collects postcards from places still waiting to be visited.',
  'Runs at dawn, naps at noon and calls it balance.',
  'Has strong opinions about tea and enjoys sharing them.',
  'Always the first to say hello to new neighbours.',
  'Reads three books at once and finishes all of them eventually.',
  'Hums while cooking and refuses to admit it.',
  'Saving up for a piano and practising on the kitchen table.',
  'Never met a board game that did not need winning.',
  'Grew up by the sea and still checks the weather like a sailor.',
  'Rearranges the furniture whenever life feels stuck.',
  'Writes thank-you notes by hand, even for small favours.',
  'Dreams of a tiny restaurant with only six tables.',
  'Knows the name of every dog on the street.',
  'Prefers night walks to morning runs and sunsets to sunrises.',
  'Keeps spare umbrellas for friends who forget theirs.',
];

/** Picks a first name. `pronounSubject` ('she', 'he', ...) only biases the pool; any name can come up. */
export function randomFirstName(rng: Rng, pronounSubject?: string, avoid: readonly string[] = []): string {
  const s = (pronounSubject ?? '').toLowerCase();
  const leaning = s === 'she' ? FEMININE_NAMES : s === 'he' ? MASCULINE_NAMES : null;
  const pool = leaning && rng.chance(0.85) ? [...leaning, ...NEUTRAL_NAMES] : FIRST_NAMES;
  return pickAvoiding(rng, pool, avoid);
}

export function randomSurname(rng: Rng, avoid: readonly string[] = []): string { return pickAvoiding(rng, SURNAMES, avoid); }

export function randomBio(rng: Rng): string { return rng.pick(BIOS); }

function pickAvoiding(rng: Rng, pool: readonly string[], avoid: readonly string[]): string {
  const taken = new Set(avoid.map((n) => n.trim().toLowerCase()));
  const free = pool.filter((n) => !taken.has(n.toLowerCase()));
  return rng.pick(free.length > 0 ? free : pool);
}

// ---------------------------------------------------------------------------------------------
// Content and colour helpers
// ---------------------------------------------------------------------------------------------

/** Entries with status 'ready' (dev entries are never offered). */
export function readyDefs<T extends { status: string }>(rec: Record<string, T> | undefined): T[] {
  return Object.values(rec ?? {}).filter((d) => d.status === 'ready');
}
function values<T>(rec: Record<string, T> | undefined): T[] { return Object.values(rec ?? {}); }
export function inRegistry(rec: Record<string, unknown> | undefined, id: string): boolean { return !!rec && rec[id] !== undefined; }
/** True when the registry is empty (nothing to check against) or contains the id. */
export function knownOrUnchecked(rec: Record<string, unknown> | undefined, id: string): boolean {
  return Object.keys(rec ?? {}).length === 0 || inRegistry(rec, id);
}
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/** Rounds to 0.001 and never returns -0 (JSON would turn it into 0). */
const round3 = (v: number) => Math.round(v * 1000) / 1000 || 0;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const swatchColors = (list: readonly Swatch[] | undefined, fallback: readonly Hex[]): Hex[] => {
  const colors = (list ?? []).map((s) => s.color).filter(isHex).map((c) => c.toLowerCase());
  return colors.length > 0 ? colors : [...fallback];
};
const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Display name for messages: full name, or "Person N" while unnamed. */
export function memberName(p: PersonDraft | undefined, index: number): string {
  const n = p ? `${p.firstName.trim()} ${p.lastName.trim()}`.trim() : '';
  return n || `Person ${index + 1}`;
}

export function pronounPresetOf(p: Pronouns): PronounPreset | 'custom' {
  for (const k of Object.keys(PRONOUN_PRESETS) as PronounPreset[]) {
    const q = PRONOUN_PRESETS[k];
    if (q.subject === p.subject && q.object === p.object && q.possessive === p.possessive) return k;
  }
  return 'custom';
}

export function traitsConflict(content: ContentDB, a: string, b: string): boolean {
  return !!content.traits[a]?.conflicts.includes(b) || !!content.traits[b]?.conflicts.includes(a);
}

/** Natural hair colours: blacks, browns, blondes, reds, greys and whites. Others count as fantasy colours. */
export function isNaturalHairColor(hex: Hex): boolean {
  const [h, s, l] = hexToHsl(hex);
  if (s < 0.2 || l < 0.15 || l > 0.9) return true;
  return (h <= 45 || h >= 345) && s <= 0.75;
}

// ---------------------------------------------------------------------------------------------
// Parameters (body and face controls)
// ---------------------------------------------------------------------------------------------

/** Allowed range of a control. [-1, 1] while the content defines no controls; null for an unknown id. */
export function paramRange(defs: readonly ParamDef[], id: string): { min: number; max: number } | null {
  if (defs.length === 0) return { min: -1, max: 1 };
  const d = defs.find((p) => p.id === id);
  return d ? { min: d.min, max: d.max } : null;
}

/** Value clamped into the control's range (rounded to 0.001), or null for an unknown control or non-number. */
export function clampParam(defs: readonly ParamDef[], id: string, value: number): number | null {
  const r = paramRange(defs, id);
  if (!r || typeof value !== 'number' || !Number.isFinite(value)) return null;
  return round3(clamp(value, r.min, r.max));
}

function neutralParams(defs: readonly ParamDef[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of defs) out[d.id] = round3(clamp(0, d.min, d.max));
  return out;
}

/** Known controls only, clamped; missing ones neutral. Without defined controls, copies clamped to [-1, 1]. */
export function paramsFrom(defs: readonly ParamDef[], source: Record<string, number>): Record<string, number> {
  const out = neutralParams(defs);
  for (const [id, v] of Object.entries(source)) {
    const c = clampParam(defs, id, v);
    if (c !== null) out[id] = c;
  }
  return out;
}

/** Random controls around `base` (a preset) with a spread relative to each range. */
function randomParams(rng: Rng, defs: readonly ParamDef[], base: Record<string, number> | undefined, spread: number): Record<string, number> {
  const out: Record<string, number> = base ? paramsFrom(defs, base) : neutralParams(defs);
  for (const d of defs) {
    const tri = (rng.next() + rng.next() + rng.next() - 1.5) / 1.5; // -1..1, centre-weighted
    out[d.id] = round3(clamp((out[d.id] ?? 0) + tri * spread * ((d.max - d.min) / 2), d.min, d.max));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------------------------

function defaultHairId(content: ContentDB): string {
  const hair = readyDefs(content.hair);
  return (hair.find((h) => h.length === 'short') ?? hair[0])?.id ?? '';
}
const firstId = (rec: Record<string, { id: string }> | undefined) => values(rec)[0]?.id ?? '';
function lipFor(skin: Hex): Hex { return shadeHex(mixHex(skin, '#b5505e', 0.4), -0.06); }
/** Brow colour that suits a hair colour (natural dark brown for fantasy colours). */
export function browFor(hair: Hex): Hex { return isNaturalHairColor(hair) ? shadeHex(hair, -0.08) : '#3b2a20'; }

/** A neutral adult appearance from the first/middle catalog entries. */
export function defaultAppearance(content: ContentDB): Appearance {
  const skins = swatchColors(content.skinTones, FALLBACK_SKIN);
  const skin = skins[Math.floor(skins.length / 2)] ?? '#d9a27c';
  const hairColor = swatchColors(content.hairColors, FALLBACK_HAIR).find(isNaturalHairColor) ?? '#3b2a20';
  return {
    frame: 'a',
    skin,
    body: neutralParams(content.bodyParams ?? []),
    bodyPresetId: null,
    face: {
      presetId: null,
      params: neutralParams(content.faceParams ?? []),
      eyeColor: swatchColors(content.eyeColors, FALLBACK_EYES)[0] ?? '#4a2f1d',
      browStyle: firstId(content.browStyles),
      browColor: browFor(hairColor),
      freckles: 0, blush: 0, lipTint: 0,
      lipColor: lipFor(skin),
    },
    hair: { styleId: defaultHairId(content), color: hairColor, highlight: null, facialHairId: null },
  };
}

/** An unnamed adult with default appearance and plain valid outfits. */
export function blankPersonDraft(content: ContentDB, opts: { firstName?: string; lastName?: string } = {}): PersonDraft {
  return {
    firstName: opts.firstName ?? '',
    lastName: opts.lastName ?? '',
    pronouns: { ...PRONOUN_PRESETS.they },
    lifeStage: 'adult',
    bio: '',
    voice: { preset: firstId(content.voices), pitch: 0 },
    walkStyle: DEFAULT_WALK_STYLE,
    romance: { interestedIn: ['any'], open: true },
    appearance: defaultAppearance(content),
    outfits: plainWardrobe(content),
    traits: [], likes: [], dislikes: [],
    aspirationId: null, careerId: null,
  };
}

/** Converts a live person back into a draft (e.g. to edit outfits in the wardrobe screen). */
export function personToDraft(person: Person): PersonDraft {
  return clone({
    firstName: person.firstName, lastName: person.lastName, pronouns: person.pronouns, lifeStage: person.lifeStage,
    bio: person.bio, voice: person.voice, walkStyle: person.walkStyle, romance: person.romance,
    appearance: person.appearance, outfits: person.outfits, traits: person.traits, likes: person.likes,
    dislikes: person.dislikes, aspirationId: person.aspiration?.aspirationId ?? null,
    careerId: person.career?.careerId ?? null,
  });
}

// ---------------------------------------------------------------------------------------------
// Random people
// ---------------------------------------------------------------------------------------------

export interface RandomPersonOptions {
  firstName?: string;
  lastName?: string;
  pronouns?: Pronouns;
  frame?: BodyFrame;
  lifeStage?: LifeStage;
  /** First names already used in the household. */
  avoidFirstNames?: readonly string[];
  /** Chance of a starting career, 0..1 (default 0.5). */
  careerChance?: number;
  /** Favourite outfit hue in degrees. */
  hue?: number;
}

/** Randomizes pronouns, names, voice, walk style, romance and bio. */
export function randomizeIdentity(rng: Rng, content: ContentDB, p: PersonDraft, opts: RandomPersonOptions = {}): void {
  const r = rng.next();
  p.pronouns = { ...(opts.pronouns ?? PRONOUN_PRESETS[r < 0.42 ? 'she' : r < 0.84 ? 'he' : 'they']) };
  p.firstName = opts.firstName ?? randomFirstName(rng, p.pronouns.subject, opts.avoidFirstNames);
  p.lastName = opts.lastName ?? randomSurname(rng);
  const voices = values(content.voices);
  p.voice = { preset: voices.length > 0 ? rng.pick(voices).id : '', pitch: round3(Math.round(rng.range(-0.6, 0.6) * 20) / 20) };
  p.walkStyle = rng.pick(WALK_STYLES).id;
  const q = rng.next();
  p.romance = { interestedIn: q < 0.35 ? ['a'] : q < 0.7 ? ['b'] : q < 0.92 ? ['any'] : [], open: rng.chance(0.9) };
  p.bio = rng.chance(0.7) ? randomBio(rng) : '';
}

/** Randomizes frame, body preset and body controls. */
export function randomizeBody(rng: Rng, content: ContentDB, a: Appearance, frame?: BodyFrame): void {
  a.frame = frame ?? (rng.chance(0.5) ? 'a' : 'b');
  const presets = values(content.bodyPresets).filter((b) => b.frame === a.frame);
  const preset = presets.length > 0 && rng.chance(0.5) ? rng.pick(presets) : null;
  a.bodyPresetId = preset?.id ?? null;
  a.body = randomParams(rng, content.bodyParams ?? [], preset?.params, preset ? 0.12 : 0.5);
}

function randomHairColor(rng: Rng, content: ContentDB, lifeStage: LifeStage): Hex {
  const all = swatchColors(content.hairColors, FALLBACK_HAIR);
  const natural = all.filter(isNaturalHairColor);
  const fantasy = all.filter((c) => !isNaturalHairColor(c));
  if (lifeStage === 'elder' && rng.chance(0.6)) {
    const greys = natural.filter((c) => { const [, s, l] = hexToHsl(c); return s < 0.15 && l > 0.45; });
    if (greys.length > 0) return rng.pick(greys);
  }
  if (fantasy.length > 0 && (natural.length === 0 || rng.chance(0.08))) return rng.pick(fantasy);
  return rng.pick(natural.length > 0 ? natural : all);
}

/** Randomizes hairstyle, colours and facial hair (any style for any frame or pronouns). */
export function randomizeHair(rng: Rng, content: ContentDB, a: Appearance, lifeStage: LifeStage = 'adult'): void {
  const hair = readyDefs(content.hair);
  a.hair.styleId = hair.length > 0 ? rng.pick(hair).id : '';
  a.hair.color = randomHairColor(rng, content, lifeStage);
  a.hair.highlight = rng.chance(0.15) ? (rng.chance(0.6) ? shadeHex(a.hair.color, 0.18) : randomHairColor(rng, content, lifeStage)) : null;
  if (a.hair.highlight === a.hair.color) a.hair.highlight = null;
  const facial = readyDefs(content.facialHair);
  a.hair.facialHairId = facial.length > 0 && rng.chance(0.22) ? rng.pick(facial).id : null;
}

/** Randomizes skin, face preset and controls, eyes, brows (matching the hair colour) and makeup. */
export function randomizeFace(rng: Rng, content: ContentDB, a: Appearance): void {
  let skin = rng.pick(swatchColors(content.skinTones, FALLBACK_SKIN));
  if (rng.chance(0.2)) skin = shadeHex(skin, rng.range(-0.03, 0.03));
  a.skin = skin;
  const presets = values(content.facePresets);
  const preset = presets.length > 0 && rng.chance(0.6) ? rng.pick(presets) : null;
  const brows = values(content.browStyles);
  const lipTint = rng.chance(0.5) ? round3(rng.range(0.1, 0.7)) : 0;
  a.face = {
    presetId: preset?.id ?? null,
    params: randomParams(rng, content.faceParams ?? [], preset?.params, preset ? 0.12 : 0.45),
    eyeColor: rng.pick(swatchColors(content.eyeColors, FALLBACK_EYES)),
    browStyle: brows.length > 0 ? rng.pick(brows).id : '',
    browColor: browFor(a.hair.color),
    freckles: rng.chance(0.25) ? round3(rng.range(0.15, 0.8)) : 0,
    blush: rng.chance(0.5) ? round3(rng.range(0.05, 0.35)) : 0,
    lipTint,
    lipColor: lipTint > 0.4 && rng.chance(0.5) ? rng.pick(LIPSTICKS) : lipFor(skin),
  };
}

/** Up to `count` ready, non-conflicting traits: `preferred` first (in order), then random. */
function pickTraits(rng: Rng, content: ContentDB, preferred: readonly string[], count: number): string[] {
  const out: string[] = [];
  const tryAdd = (id: string) => {
    if (out.length < count && content.traits[id]?.status === 'ready' && !out.includes(id)
      && !out.some((o) => traitsConflict(content, o, id))) out.push(id);
  };
  preferred.forEach(tryAdd);
  for (const t of rng.shuffle(readyDefs(content.traits))) tryAdd(t.id);
  return out;
}

/** Randomizes traits, aspiration, career (adults), likes and dislikes. */
export function randomizePersonality(rng: Rng, content: ContentDB, p: PersonDraft, opts: RandomPersonOptions = {}): void {
  const adult = ADULT_STAGES.includes(p.lifeStage);
  p.traits = pickTraits(rng, content, [], TRAITS_PER_ADULT);
  const aspirations = readyDefs(content.aspirations);
  // Aspirations are for adults only (children and teens choose one when they grow up).
  p.aspirationId = adult && aspirations.length > 0 ? rng.pick(aspirations).id : null;
  const careers = readyDefs(content.careers).filter((c) => !c.partTime); // part-time jobs are for teenagers
  p.careerId = adult && careers.length > 0 && rng.chance(opts.careerChance ?? 0.5) ? rng.pick(careers).id : null;
  const prefs = rng.shuffle([...(content.preferences ?? [])]);
  const nl = Math.min(prefs.length, rng.int(2, 3));
  const nd = Math.min(prefs.length - nl, rng.int(1, 2));
  p.likes = prefs.slice(0, nl).map((x) => x.id);
  p.dislikes = prefs.slice(nl, nl + nd).map((x) => x.id);
}

/** A complete random person: deterministic for a given generator state and content. */
export function randomPersonDraft(rng: Rng, content: ContentDB, opts: RandomPersonOptions = {}): PersonDraft {
  const p = blankPersonDraft(content);
  p.lifeStage = opts.lifeStage ?? 'adult';
  randomizeIdentity(rng, content, p, opts);
  randomizeBody(rng, content, p.appearance, opts.frame);
  randomizeHair(rng, content, p.appearance, p.lifeStage);
  randomizeFace(rng, content, p.appearance);
  p.outfits = defaultWardrobe(content, rng, {
    affinities: allowedAffinities(p.pronouns, p.appearance.frame), ...(opts.hue === undefined ? {} : { hue: opts.hue }),
  });
  randomizePersonality(rng, content, p, opts);
  return p;
}

// ---------------------------------------------------------------------------------------------
// Authored premade people. Content ids (traits, aspirations, careers, preferences, hair) are wishes: the
// creator resolves each against the live registries (matching ids or names loosely) and fills gaps from
// what exists, so premades stay valid while catalogs grow.
// ---------------------------------------------------------------------------------------------

export interface PremadePersonSpec {
  firstName: string;
  lastName: string;
  pronouns: 'she' | 'he' | 'they';
  frame: BodyFrame;
  bio: string;
  /** Seed for the generated appearance details (face, body, outfits). */
  seed: number;
  /** 0 = lightest, 1 = deepest available skin tone. */
  skin: number;
  /** Preferred hair look; matched against HairDef length/texture and hair-colour swatch names. */
  hair: { length?: HairDef['length']; texture?: HairDef['texture']; color?: string; facialHair?: boolean };
  /** Favourite outfit hue in degrees (colour harmony base). */
  hue: number;
  traits: string[];
  aspiration: string[];
  career: string | null;
  likes: string[];
  dislikes: string[];
  romance: Array<'a' | 'b' | 'any'>;
}

export interface PremadeHouseholdSpec {
  id: string;
  name: string;
  /** Short card text for the start screen. */
  description: string;
  purpose: 'guided' | 'roommates' | 'couple' | 'siblings' | 'neighbor';
  members: PremadePersonSpec[];
  ties: Array<{ a: number; b: number; tie: FamilyTie }>;
}

export const PREMADE_HOUSEHOLD_SPECS: readonly PremadeHouseholdSpec[] = [
  {
    id: 'lindqvist', name: 'Lindqvist', purpose: 'guided',
    description: 'Maren has just moved in with a box of cookbooks and a new kitchen job. A gentle first household.',
    members: [{
      firstName: 'Maren', lastName: 'Lindqvist', pronouns: 'she', frame: 'b', seed: 1101, skin: 0.15, hue: 18,
      bio: 'Moved to Hearthside with a box of cookbooks and big plans for the kitchen.',
      hair: { length: 'medium', texture: 'wavy', color: 'blond' },
      traits: ['foodie', 'cheerful', 'neat'], aspiration: ['home-chef', 'masterChef', 'cooking'],
      career: 'culinary', likes: ['activity:cooking', 'music:folk', 'food:comfort-food'], dislikes: ['activity:gaming'],
      romance: ['any'],
    }],
    ties: [],
  },
  {
    id: 'brennan-okafor', name: 'Brennan & Okafor', purpose: 'roommates',
    description: 'Theo and Sasha split the rent, the chores and an ongoing chess rivalry.',
    members: [
      {
        firstName: 'Theo', lastName: 'Brennan', pronouns: 'he', frame: 'a', seed: 2201, skin: 0.3, hue: 205,
        bio: 'Writes code by day and terrible poetry by night.',
        hair: { length: 'short', texture: 'curly', color: 'auburn', facialHair: true },
        traits: ['tech-enthusiast', 'bookish', 'night-owl'], aspiration: ['bookworm', 'knowledge'],
        career: null, likes: ['activity:gaming', 'music:electronic', 'topic:technology'], dislikes: ['activity:fitness'],
        romance: ['b'],
      },
      {
        firstName: 'Sasha', lastName: 'Okafor', pronouns: 'they', frame: 'a', seed: 2202, skin: 0.85, hue: 140,
        bio: 'Knows the name of every dog on the street and most of their owners.',
        hair: { length: 'short', texture: 'coily', color: 'black' },
        traits: ['outgoing', 'athletic', 'creative'], aspiration: ['social-butterfly', 'friendship'],
        career: 'culinary', likes: ['activity:fitness', 'music:pop', 'topic:sports'], dislikes: ['music:classical'],
        romance: ['any'],
      },
    ],
    ties: [{ a: 0, b: 1, tie: 'roommate' }],
  },
  {
    id: 'moreau', name: 'Moreau', purpose: 'couple',
    description: 'Ines and Rafael have been married for three years and still argue about where the sofa goes.',
    members: [
      {
        firstName: 'Ines', lastName: 'Moreau', pronouns: 'she', frame: 'b', seed: 3301, skin: 0.55, hue: 330,
        bio: 'Rearranges the furniture whenever life feels stuck.',
        hair: { length: 'long', texture: 'straight', color: 'dark brown' },
        traits: ['creative', 'ambitious', 'neat'], aspiration: ['dream-home', 'homeDesign'],
        career: null, likes: ['decor:modern', 'decor:mid-century', 'topic:travel'], dislikes: ['decor:cottage'],
        romance: ['a'],
      },
      {
        firstName: 'Rafael', lastName: 'Moreau', pronouns: 'he', frame: 'a', seed: 3302, skin: 0.6, hue: 30,
        bio: 'Hums while cooking and refuses to admit it.',
        hair: { length: 'short', texture: 'wavy', color: 'black', facialHair: true },
        traits: ['family-oriented', 'patient', 'foodie'], aspiration: ['home-chef', 'masterChef', 'family'],
        career: 'culinary', likes: ['activity:cooking', 'music:jazz', 'food:roasts'], dislikes: ['activity:gaming'],
        romance: ['b'],
      },
    ],
    ties: [{ a: 0, b: 1, tie: 'spouse' }],
  },
  {
    id: 'sato', name: 'Sato', purpose: 'siblings',
    description: 'Kenji and Aiko share a house, a car and very different ideas about bedtime.',
    members: [
      {
        firstName: 'Kenji', lastName: 'Sato', pronouns: 'he', frame: 'a', seed: 4401, skin: 0.3, hue: 220,
        bio: 'Runs at dawn, naps at noon and calls it balance.',
        hair: { length: 'medium', texture: 'straight', color: 'black' },
        traits: ['athletic', 'cheerful', 'messy'], aspiration: ['fitness-devotee', 'fitness'],
        career: 'culinary', likes: ['activity:fitness', 'music:rock', 'food:breakfast'], dislikes: ['activity:reading'],
        romance: ['any'],
      },
      {
        firstName: 'Aiko', lastName: 'Sato', pronouns: 'she', frame: 'b', seed: 4402, skin: 0.28, hue: 275,
        bio: 'Saving up for a piano and practising on the kitchen table.',
        hair: { length: 'long', texture: 'tied', color: 'black' },
        traits: ['music-lover', 'reserved', 'night-owl'], aspiration: ['musician', 'career-climber'],
        career: null, likes: ['music:classical', 'activity:music', 'topic:books'], dislikes: ['music:rock'],
        romance: ['a'],
      },
    ],
    ties: [{ a: 0, b: 1, tie: 'sibling' }],
  },
];

/** The friendly couple next door who visit the player's household. */
export const NEIGHBOR_SPEC: PremadeHouseholdSpec = {
  id: 'penrose', name: 'Penrose', purpose: 'neighbor',
  description: 'Harriet and Kofi live next door and always have a spare umbrella.',
  members: [
    {
      firstName: 'Harriet', lastName: 'Penrose', pronouns: 'she', frame: 'b', seed: 9101, skin: 0.1, hue: 95,
      bio: 'Keeps spare umbrellas for friends who forget theirs.',
      hair: { length: 'short', texture: 'wavy', color: 'grey' },
      traits: ['outgoing', 'cheerful', 'patient'], aspiration: ['social-butterfly', 'friendship'],
      career: null, likes: ['activity:gardening', 'music:folk', 'decor:botanical'], dislikes: ['activity:gaming'],
      romance: ['a'],
    },
    {
      firstName: 'Kofi', lastName: 'Penrose', pronouns: 'he', frame: 'a', seed: 9102, skin: 0.9, hue: 200,
      bio: 'Always the first to say hello to new neighbours.',
      hair: { length: 'shaved', color: 'black', facialHair: true },
      traits: ['outgoing', 'foodie', 'relaxed'], aspiration: ['home-chef', 'masterChef'],
      career: 'culinary', likes: ['activity:cooking', 'music:jazz', 'food:seafood'], dislikes: ['activity:tv'],
      romance: ['b'],
    },
  ],
  ties: [{ a: 0, b: 1, tie: 'spouse' }],
};

// ---------------------------------------------------------------------------------------------
// Building premade households
// ---------------------------------------------------------------------------------------------

export interface PremadeHousehold {
  id: string;
  name: string;
  description: string;
  purpose: PremadeHouseholdSpec['purpose'];
  draft: HouseholdDraft;
}

/** Ids of definitions matching wishes by id or name, ignoring case and punctuation ('night-owl' = 'nightOwl'). */
function resolveIds(defs: ReadonlyArray<{ id: string; name: string }>, wishes: readonly string[]): string[] {
  const out: string[] = [];
  for (const w of wishes) {
    const k = normKey(w);
    const hit = defs.find((d) => d.id === w) ?? defs.find((d) => normKey(d.id) === k || normKey(d.name) === k);
    if (hit && !out.includes(hit.id)) out.push(hit.id);
  }
  return out;
}

const HAIR_HINT_COLORS: Record<string, Hex> = {
  black: '#1c1714', 'dark brown': '#3b2a20', brown: '#5a3d2b', auburn: '#8a3b22', red: '#a0452a', blond: '#d9b77a',
  grey: '#a3a3a3', white: '#e8e6e1',
};

function nearestColor(colors: readonly Hex[], target: Hex): Hex {
  const t = hexToHsl(target);
  let best = target, bestD = Infinity;
  for (const c of colors) {
    const h = hexToHsl(c);
    const dh = Math.min(Math.abs(h[0] - t[0]), 360 - Math.abs(h[0] - t[0])) / 180;
    const d = dh * dh * 0.3 + (h[1] - t[1]) ** 2 + (h[2] - t[2]) ** 2 * 3;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function premadePerson(content: ContentDB, m: PremadePersonSpec): PersonDraft {
  const rng = new Rng(seedRng(m.seed));
  const p = randomPersonDraft(rng, content, {
    firstName: m.firstName, lastName: m.lastName, pronouns: PRONOUN_PRESETS[m.pronouns], frame: m.frame, hue: m.hue, careerChance: 0,
  });
  p.bio = m.bio;
  p.romance = { interestedIn: [...m.romance], open: true };
  const a = p.appearance;
  const skins = swatchColors(content.skinTones, FALLBACK_SKIN).sort((x, y) => hexToHsl(y)[2] - hexToHsl(x)[2]);
  a.skin = skins[Math.round(clamp(m.skin, 0, 1) * (skins.length - 1))] ?? a.skin;
  a.face.lipColor = lipFor(a.skin);
  const hair = readyDefs(content.hair);
  if (hair.length > 0) {
    const score = (h: (typeof hair)[number]) => (m.hair.length && h.length === m.hair.length ? 3 : 0) + (m.hair.texture && h.texture === m.hair.texture ? 2 : 0);
    const best = Math.max(...hair.map(score));
    a.hair.styleId = rng.pick(hair.filter((h) => score(h) === best)).id;
  }
  const hint = m.hair.color ? HAIR_HINT_COLORS[m.hair.color] : undefined;
  if (hint) a.hair.color = nearestColor(swatchColors(content.hairColors, FALLBACK_HAIR), hint);
  a.hair.highlight = null;
  const facial = readyDefs(content.facialHair);
  a.hair.facialHairId = m.hair.facialHair && facial.length > 0 ? rng.pick(facial).id : null;
  a.face.browColor = browFor(a.hair.color);
  p.traits = pickTraits(rng, content, resolveIds(readyDefs(content.traits), m.traits), TRAITS_PER_ADULT);
  const aspirations = readyDefs(content.aspirations);
  const adult = ADULT_STAGES.includes(p.lifeStage);
  p.aspirationId = adult ? (resolveIds(aspirations, m.aspiration)[0] ?? (aspirations.length > 0 ? rng.pick(aspirations).id : null)) : null;
  p.careerId = m.career ? resolveIds(readyDefs(content.careers), [m.career])[0] ?? null : null;
  const prefs = content.preferences ?? [];
  const likes = resolveIds(prefs, m.likes), dislikes = resolveIds(prefs, m.dislikes).filter((id) => !likes.includes(id));
  if (likes.length > 0) { p.likes = likes; p.dislikes = p.dislikes.filter((id) => !likes.includes(id)); }
  if (dislikes.length > 0) { p.dislikes = dislikes; p.likes = p.likes.filter((id) => !dislikes.includes(id)); }
  return p;
}

function buildPremade(content: ContentDB, spec: PremadeHouseholdSpec): HouseholdDraft {
  return { name: spec.name, members: spec.members.map((m) => premadePerson(content, m)), ties: spec.ties.map((t) => ({ ...t })) };
}

/** Premade households with card info; [0] is the Guided Start single. Deterministic for given content. */
export function premadeHouseholdList(content: ContentDB): PremadeHousehold[] {
  return PREMADE_HOUSEHOLD_SPECS.map((s) => ({ id: s.id, name: s.name, description: s.description, purpose: s.purpose, draft: buildPremade(content, s) }));
}

/** Premade household drafts: a single (Guided Start), roommates, a couple and siblings. */
export function premadeHouseholds(content: ContentDB): HouseholdDraft[] { return premadeHouseholdList(content).map((h) => h.draft); }

/** The friendly neighbours (two adults, one with a job) who visit the player. */
export function NEIGHBOR_HOUSEHOLD(content: ContentDB): HouseholdDraft { return buildPremade(content, NEIGHBOR_SPEC); }

// ---------------------------------------------------------------------------------------------
// Template readers (untrusted JSON to valid people)
// ---------------------------------------------------------------------------------------------

function readColor(v: unknown, fallback: Hex, what: string, note: Note): Hex {
  const c = normalizeHex(v, '');
  if (isHex(c)) return c;
  note(`${what} colour was invalid and was replaced.`);
  return fallback;
}

function readParams(raw: unknown, defs: readonly ParamDef[], what: string, note: Note): Record<string, number> {
  const out = neutralParams(defs);
  for (const [id, v] of Object.entries(asObj(raw))) {
    if (typeof v !== 'number' || !Number.isFinite(v)) { note(`${what} control "${id}" had no valid value.`); continue; }
    const c = clampParam(defs, id, v);
    if (c === null) { note(`${what} control "${id}" is not available and was dropped.`); continue; }
    if (Math.abs(c - v) > 0.0015) note(`${what} control "${id}" was out of range and was adjusted.`);
    out[id] = c;
  }
  return out;
}

/** Id kept when in the registry; otherwise the fallback, with a note naming both. */
function readId(id: string, rec: Record<string, { id: string; name: string }> | undefined, fallback: string, what: string, note: Note): string {
  if (inRegistry(rec, id)) return id;
  if (id || fallback) note(`${what} "${id}" is not available; using ${rec?.[fallback]?.name ?? (fallback || 'none')} instead.`);
  return fallback;
}

function readOptionalId(v: unknown, rec: Record<string, { id: string }> | undefined, what: string, note: Note): string | null {
  if (v === null || v === undefined || v === '') return null;
  const id = asStr(v);
  if (inRegistry(rec, id)) return id;
  note(`${what} "${id}" is not available and was removed.`);
  return null;
}

/** Reads an appearance from untrusted JSON; unknown assets become defaults, each with a note. */
export function normalizeAppearance(raw: unknown, content: ContentDB, note: Note): Appearance {
  const def = defaultAppearance(content);
  const r = asObj(raw), face = asObj(r.face), hair = asObj(r.hair);
  let frame: BodyFrame = 'a';
  if (r.frame === 'a' || r.frame === 'b') frame = r.frame;
  else note('Unknown body frame; frame A is used.');
  const skin = readColor(r.skin, def.skin, 'Skin', note);
  const hairColor = readColor(hair.color, def.hair.color, 'Hair', note);
  const presetBody = readOptionalId(r.bodyPresetId, content.bodyPresets, 'Body preset', note);
  // the modular (Quaternius) look is kept when it reads; a damaged one is dropped and the look is derived again
  const modular = r.modular === undefined ? null : migrateModularLook(r.modular);
  if (r.modular !== undefined && !modular) note('The modular look could not be read and was dropped.');
  return {
    ...(modular ? { modular } : {}),
    frame,
    skin,
    body: readParams(r.body, content.bodyParams ?? [], 'Body', note),
    bodyPresetId: presetBody && content.bodyPresets[presetBody]?.frame === frame ? presetBody : null,
    face: {
      presetId: readOptionalId(face.presetId, content.facePresets, 'Face preset', note),
      params: readParams(face.params, content.faceParams ?? [], 'Face', note),
      eyeColor: readColor(face.eyeColor, def.face.eyeColor, 'Eye', note),
      browStyle: readId(asStr(face.browStyle), content.browStyles, def.face.browStyle, 'Brow style', note),
      browColor: readColor(face.browColor, browFor(hairColor), 'Brow', note),
      freckles: round3(clamp(asNum(face.freckles, 0), 0, 1)),
      blush: round3(clamp(asNum(face.blush, 0), 0, 1)),
      lipTint: round3(clamp(asNum(face.lipTint, 0), 0, 1)),
      lipColor: readColor(face.lipColor, lipFor(skin), 'Lip', note),
    },
    hair: {
      styleId: readId(asStr(hair.styleId), content.hair, def.hair.styleId, 'Hairstyle', note),
      color: hairColor,
      highlight: hair.highlight === null || hair.highlight === undefined ? null : readColor(hair.highlight, shadeHex(hairColor, 0.18), 'Highlight', note),
      facialHairId: readOptionalId(hair.facialHairId, content.facialHair, 'Facial hair', note),
    },
  };
}

/** Reads a person from untrusted JSON (templates); unknown content ids are replaced or removed with notes. */
export function normalizePerson(raw: unknown, content: ContentDB, note: Note): PersonDraft {
  const r = asObj(raw);
  const base = blankPersonDraft(content);
  const pr = asObj(r.pronouns);
  const pronouns = asStr(pr.subject) && asStr(pr.object) && asStr(pr.possessive)
    ? { subject: cleanText(pr.subject, PRONOUN_MAX_LENGTH), object: cleanText(pr.object, PRONOUN_MAX_LENGTH), possessive: cleanText(pr.possessive, PRONOUN_MAX_LENGTH) }
    : base.pronouns;
  let lifeStage: LifeStage = 'adult';
  if ((LIFE_STAGES as readonly unknown[]).includes(r.lifeStage)) lifeStage = r.lifeStage as LifeStage;
  else note('Unknown life stage; adult is used.');
  const voice = asObj(r.voice);
  const walk = asStr(r.walkStyle);
  if (!WALK_STYLES.some((x) => x.id === walk)) note(`Walking style "${walk}" is not available; Easygoing is used.`);
  const romance = asObj(r.romance);
  const keepKnown = (list: unknown, rec: Record<string, unknown> | undefined, what: string): string[] => {
    const out: string[] = [];
    for (const v of asArr(list)) {
      const id = asStr(v);
      if (rec && rec[id] !== undefined) { if (!out.includes(id)) out.push(id); } else note(`${what} "${id}" is not available and was removed.`);
    }
    return out;
  };
  const prefs: Record<string, true> = {};
  for (const x of content.preferences ?? []) prefs[x.id] = true;
  const voiceId = asStr(voice.preset);
  return {
    firstName: cleanText(r.firstName, NAME_MAX_LENGTH),
    lastName: cleanText(r.lastName, NAME_MAX_LENGTH),
    pronouns,
    lifeStage,
    bio: cleanText(r.bio, BIO_MAX_LENGTH),
    voice: {
      preset: knownOrUnchecked(content.voices, voiceId) ? voiceId : readId(voiceId, content.voices, base.voice.preset, 'Voice', note),
      pitch: round3(clamp(asNum(voice.pitch, 0), -1, 1)),
    },
    walkStyle: WALK_STYLES.some((x) => x.id === walk) ? walk : DEFAULT_WALK_STYLE,
    romance: {
      interestedIn: asArr(romance.interestedIn).filter((x): x is 'a' | 'b' | 'any' => x === 'a' || x === 'b' || x === 'any'),
      open: romance.open !== false,
    },
    appearance: normalizeAppearance(r.appearance, content, note),
    outfits: normalizeWardrobe(r.outfits, content, note),
    traits: keepKnown(r.traits, content.traits, 'Trait').slice(0, TRAITS_PER_ADULT),
    likes: keepKnown(r.likes, prefs, 'Preference').slice(0, MAX_LIKES),
    dislikes: keepKnown(r.dislikes, prefs, 'Preference').slice(0, MAX_DISLIKES),
    aspirationId: readOptionalId(r.aspirationId, content.aspirations, 'Aspiration', note),
    careerId: readOptionalId(r.careerId, content.careers, 'Job', note),
  };
}
