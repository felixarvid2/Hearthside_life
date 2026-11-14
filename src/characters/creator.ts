// Character creator model for Hearthside Life (pure: no three.js, no DOM).
//
// - CreatorSession edits a HouseholdDraft (src/core/drafts.ts) for the creator UI: seven steps with free
//   navigation, a current member, snapshot undo/redo with labels, randomization locks, face/body presets,
//   copy/paste appearance, members (max 8, adults in M1), ties, clamped setters for every PersonDraft field
//   and validation (validateHousehold).
// - exportAppearance/importAppearance and exportHouseholdTemplate/importHouseholdTemplate: versioned JSON
//   with missing-asset substitution (only in the returned data, with a list of what was replaced).
// - Random people, default wardrobes and premade households are built in names.ts and outfits.ts and
//   re-exported here, so creator.ts is the module's public entry point.
//
// Content registries are read defensively: an empty catalog yields empty choices, never a crash.

import type { ContentDB, ParamDef, TraitDef } from '../content/types';
import type { HouseholdDraft, PersonDraft } from '../core/drafts';
import { type Rng, uiRng } from '../core/rng';
import { applyPreset, equipFacialHair, equipGarment, equipHair, randomizeLook, setGarmentRegionColor, unequipSlot, fallbackHair } from './modular/equip';
import { deriveModularLook, lookFor, resolveLook } from './modular/look';
import { findBody, findFacialHair, findGarment, findHair, findPreset } from './modular/manifest';
import type { ModularLook, ModularManifest, ModularSlot } from './modular/types';
import type {
  Appearance, BodyFrame, FamilyTie, GarmentLayer, Hex, LifeStage, Outfit, OutfitCategory, Pronouns, Wardrobe,
} from '../core/types';
import {
  ADULT_STAGES, BIO_MAX_LENGTH, blankPersonDraft, browFor, clampParam, defaultAppearance, inRegistry, knownOrUnchecked,
  LIFE_STAGES, MAX_DISLIKES, MAX_LIKES, memberName, NAME_MAX_LENGTH, normalizeAppearance, normalizePerson, paramRange,
  paramsFrom, PRONOUN_MAX_LENGTH, PRONOUN_PRESETS, pronounPresetOf, randomFirstName, randomizeBody, randomizeFace,
  randomizeHair, randomizeIdentity, randomizePersonality, randomPersonDraft, readyDefs, traitsConflict,
  TRAITS_PER_ADULT, WALK_STYLES, DEFAULT_WALK_STYLE, type PronounPreset,
} from './names';
import {
  addAccessory, allowedAffinities, asArr, asObj, cleanText, defaultWardrobe, garmentChoice, garmentsFor, isHex, LAYER_NAMES,
  MAX_OUTFITS_PER_CATEGORY, nextOutfitId, normalizeHex, normalizeWardrobe, OUTFIT_CATEGORY_NAMES,
  OUTFIT_NAME_MAX_LENGTH, plainWardrobe, randomOutfit, setLayer, validateWardrobe, type Json,
} from './outfits';

export {
  ADULT_STAGES, BIO_MAX_LENGTH, blankPersonDraft, defaultAppearance, DEFAULT_WALK_STYLE, isNaturalHairColor, LIFE_STAGES,
  MAX_DISLIKES, MAX_LIKES, memberName, NAME_MAX_LENGTH, NEIGHBOR_HOUSEHOLD, personToDraft, premadeHouseholdList,
  premadeHouseholds, PRONOUN_PRESETS, pronounPresetOf, randomizeBody, randomizeFace, randomizeHair, randomizeIdentity,
  randomizePersonality, randomPersonDraft, traitsConflict, TRAITS_PER_ADULT, WALK_STYLES,
  type PremadeHousehold, type PronounPreset, type RandomPersonOptions,
} from './names';
export { currentOutfit, defaultWardrobe, outfitFor, resolveOutfit, validateOutfit, validateWardrobe } from './outfits';

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

export type CreatorStep = 'identity' | 'faceBody' | 'hair' | 'clothing' | 'personality' | 'household' | 'review';
export const CREATOR_STEPS: readonly CreatorStep[] = ['identity', 'faceBody', 'hair', 'clothing', 'personality', 'household', 'review'];
export const STEP_NAMES: Record<CreatorStep, string> = {
  identity: 'Identity', faceBody: 'Face & Body', hair: 'Hair', clothing: 'Clothing', personality: 'Personality',
  household: 'Household', review: 'Review',
};

/** Lockable/randomizable categories. Skin belongs to `face`; frame and shape to `body`. */
export type LockCategory = 'identity' | 'face' | 'body' | 'hair' | 'clothing' | 'personality';
export const LOCK_CATEGORIES: readonly LockCategory[] = ['identity', 'face', 'body', 'hair', 'clothing', 'personality'];
export const CATEGORY_NAMES: Record<LockCategory, string> = {
  identity: 'Identity', face: 'Face', body: 'Body', hair: 'Hair', clothing: 'Clothing', personality: 'Personality',
};
/** Categories edited on each step (what "randomize this step" and "reset" touch). */
export const STEP_CATEGORIES: Record<CreatorStep, readonly LockCategory[]> = {
  identity: ['identity'], faceBody: ['face', 'body'], hair: ['hair'], clothing: ['clothing'],
  personality: ['personality'], household: [], review: [],
};
/** Hair before face so brows can follow the new hair colour. */
/** Chance per category that "Randomize all" dresses someone outside their usual presentation. */
const CROSSOVER_CHANCE = 0.03;
const RANDOMIZE_ORDER: readonly LockCategory[] = ['identity', 'body', 'hair', 'face', 'clothing', 'personality'];

export const MAX_HOUSEHOLD_MEMBERS = 8;
export const HOUSEHOLD_NAME_MAX_LENGTH = 40;
export const UNDO_LIMIT = 100;
/** Every life stage the creator can make once all bodies exist (Milestone 8). */
export const CREATOR_LIFE_STAGES: readonly LifeStage[] = LIFE_STAGES;

/**
 * Stages offered before their body exists are never listed: until the character bodies of a stage are delivered the creator
 * only offers young adult and adult. The game registers `stageBodyAvailable` of src/characters/assets.ts (when that export
 * exists) with `setStageBodyAvailability`; tests may register their own.
 */
const GUARDED_STAGES: readonly LifeStage[] = ['youngAdult', 'adult'];
let bodyAvailable: ((stage: LifeStage) => boolean) | null = null;
export function setStageBodyAvailability(fn: ((stage: LifeStage) => boolean) | null): void { bodyAvailable = fn; }

/** The life stages the creator offers right now: those with a delivered body (young adult and adult until then). */
export function availableLifeStages(): readonly LifeStage[] {
  const fn = bodyAvailable;
  if (!fn) return GUARDED_STAGES;
  const out = CREATOR_LIFE_STAGES.filter((s) => GUARDED_STAGES.includes(s) || fn(s));
  return out.length > 0 ? out : GUARDED_STAGES;
}

export const FAMILY_TIES: readonly FamilyTie[] = ['parent', 'child', 'sibling', 'partner', 'spouse', 'roommate', 'none'];
/** Romantic ties: adults only, at most one per person (partner or spouse), never between ancestor and descendant. */
export const ROMANTIC_TIES: readonly FamilyTie[] = ['partner', 'spouse'];
/** If b is a's `tie`, then a is b's `TIE_INVERSE[tie]`. */
export const TIE_INVERSE: Record<FamilyTie, FamilyTie> = {
  parent: 'child', child: 'parent', sibling: 'sibling', partner: 'partner', spouse: 'spouse', roommate: 'roommate', none: 'none',
};
export const TIE_NAMES: Record<FamilyTie, string> = {
  parent: 'Parent', child: 'Child', sibling: 'Sibling', partner: 'Partner', spouse: 'Spouse', roommate: 'Roommate',
  none: 'No relation',
};

export type CreatorResult = { ok: true; note?: string } | { ok: false; reason: string };
const OK: CreatorResult = { ok: true };
const fail = (reason: string): CreatorResult => ({ ok: false, reason });
const NOT_MODULAR = 'The Quaternius character style is not active.';
/** Life stages drawn with the modular bodies (src/characters/personView.ts wantsModular): all of them. */
const modularStage = (_s: LifeStage): boolean => true;
/** Keeps a stored modular look's shared colours equal to the classic appearance (the source of truth). */
function mirrorModularColors(a: Appearance): void {
  const l = a.modular;
  if (!l || typeof l !== 'object' || !l.colors) return;
  l.colors.skin = a.skin;
  l.colors.eyes = a.face.eyeColor;
  l.colors.hair = a.hair.color;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/** Rounds to 0.001 and never returns -0 (JSON would turn it into 0). */
const round3 = (v: number) => Math.round(v * 1000) / 1000 || 0;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const isIndex = (i: number, n: number) => Number.isInteger(i) && i >= 0 && i < n;

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

/** One validation problem; `member` is the member index (null for household-level issues). */
export interface CreatorIssue { member: number | null; step: CreatorStep; message: string }

export interface ValidateOptions {
  /** Life stages that may be created (default CREATOR_LIFE_STAGES). */
  lifeStages?: readonly LifeStage[];
}

function paramIssues(params: Record<string, number>, defs: readonly ParamDef[], what: string, add: (m: string) => void): void {
  for (const [id, v] of Object.entries(params)) {
    const r = paramRange(defs, id);
    if (!r) add(`${what} control "${id}" is not available.`);
    else if (!(typeof v === 'number' && v >= r.min && v <= r.max)) add(`${what} control "${defs.find((d) => d.id === id)?.name ?? id}" is out of range.`);
  }
}

/** Every problem of one person (identity, appearance assets, outfits, personality). */
export function memberIssues(p: PersonDraft, index: number, content: ContentDB, opts: ValidateOptions = {}): CreatorIssue[] {
  const out: CreatorIssue[] = [];
  const at = (step: CreatorStep) => (message: string) => { out.push({ member: index, step, message }); };
  const identity = at('identity'), faceBody = at('faceBody'), hair = at('hair'), clothing = at('clothing'), personality = at('personality');
  const stages = opts.lifeStages ?? availableLifeStages();
  const adult = ADULT_STAGES.includes(p.lifeStage);

  if (!p.firstName.trim()) identity('First name is required.');
  if (!p.lastName.trim()) identity('Last name is required.');
  if (!p.pronouns.subject.trim() || !p.pronouns.object.trim() || !p.pronouns.possessive.trim()) identity('Fill in all three pronouns.');
  if (!stages.includes(p.lifeStage)) identity(`This life stage cannot be created yet (available: ${stages.join(', ')}).`);
  if (!knownOrUnchecked(content.voices, p.voice.preset)) identity('Choose a voice.');
  if (!(p.voice.pitch >= -1 && p.voice.pitch <= 1)) identity('Voice pitch is out of range.');
  if (!WALK_STYLES.some((w) => w.id === p.walkStyle)) identity('Choose a walking style.');

  const a = p.appearance;
  if (a.frame !== 'a' && a.frame !== 'b') faceBody('Choose a body frame.');
  const colors: Array<[string, unknown]> = [['Skin', a.skin], ['Eye', a.face.eyeColor], ['Brow', a.face.browColor], ['Lip', a.face.lipColor]];
  for (const [what, c] of colors) if (!isHex(c)) faceBody(`${what} colour is not valid.`);
  if (a.bodyPresetId && !inRegistry(content.bodyPresets, a.bodyPresetId)) faceBody('The body preset is not available.');
  if (a.face.presetId && !inRegistry(content.facePresets, a.face.presetId)) faceBody('The face preset is not available.');
  if (!knownOrUnchecked(content.browStyles, a.face.browStyle)) faceBody('Choose a brow style.');
  paramIssues(a.body, content.bodyParams ?? [], 'Body', faceBody);
  paramIssues(a.face.params, content.faceParams ?? [], 'Face', faceBody);
  const units: Array<[string, number]> = [['Freckles', a.face.freckles], ['Blush', a.face.blush], ['Lip tint', a.face.lipTint]];
  for (const [what, v] of units) if (!(v >= 0 && v <= 1)) faceBody(`${what} is out of range.`);

  if (!knownOrUnchecked(content.hair, a.hair.styleId)) hair(a.hair.styleId ? `Hairstyle "${a.hair.styleId}" is not available.` : 'Choose a hairstyle.');
  else if (content.hair[a.hair.styleId]?.status === 'dev') hair('This hairstyle is not finished yet.');
  if (a.hair.facialHairId && !inRegistry(content.facialHair, a.hair.facialHairId)) hair('The facial hair style is not available.');
  if (!isHex(a.hair.color)) hair('Hair colour is not valid.');
  if (a.hair.highlight !== null && !isHex(a.hair.highlight)) hair('Highlight colour is not valid.');

  for (const m of validateWardrobe(p.outfits, content)) clothing(m);

  const traitName = (id: string) => content.traits[id]?.name ?? id;
  if (adult) {
    const need = Math.min(TRAITS_PER_ADULT, readyDefs(content.traits).length);
    if (need > 0 && p.traits.length !== need) personality(`Choose exactly ${need} traits (${p.traits.length} chosen).`);
  }
  p.traits.forEach((id, i) => {
    const def = content.traits[id];
    if (p.traits.indexOf(id) !== i) personality(`${traitName(id)} is chosen twice.`);
    else if (!def) personality(`Trait "${id}" is not available.`);
    else if (def.status !== 'ready') personality(`${def.name} is not finished yet.`);
    for (const other of p.traits.slice(i + 1)) {
      if (other !== id && traitsConflict(content, id, other)) personality(`${traitName(id)} and ${traitName(other)} are opposites; keep only one.`);
    }
  });
  if (adult && readyDefs(content.aspirations).length > 0 && !p.aspirationId) personality('Choose an aspiration.');
  if (p.aspirationId && !inRegistry(content.aspirations, p.aspirationId)) personality('The aspiration is not available.');
  if (p.aspirationId && !adult) personality('Only adults can have an aspiration.');
  if (p.careerId && !inRegistry(content.careers, p.careerId)) personality('The job is not available.');
  if (p.careerId && !adult) personality('Only adults can have a job.');
  const prefs = content.preferences ?? [];
  const prefName = (id: string) => prefs.find((x) => x.id === id)?.name ?? id;
  if (prefs.length > 0) {
    for (const id of new Set([...p.likes, ...p.dislikes])) if (!prefs.some((x) => x.id === id)) personality(`Preference "${id}" is not available.`);
  }
  for (const id of p.likes) if (p.dislikes.includes(id)) personality(`${prefName(id)} cannot be both liked and disliked.`);
  if (p.likes.length > MAX_LIKES) personality(`At most ${MAX_LIKES} likes.`);
  if (p.dislikes.length > MAX_DISLIKES) personality(`At most ${MAX_DISLIKES} dislikes.`);
  return out;
}

/** What member b is to member a ('none' without a tie). */
export function tieBetween(draft: HouseholdDraft, a: number, b: number): FamilyTie {
  for (const t of draft.ties) {
    if (t.a === a && t.b === b) return t.tie;
    if (t.a === b && t.b === a) return TIE_INVERSE[t.tie];
  }
  return 'none';
}

/**
 * Family-graph problems: missing members, self ties, contradictory pairs (e.g. spouse and sibling, partner and
 * spouse, or both parent of each other), more than one partner/spouse or two parents, ancestry cycles, siblings or
 * partners/spouses who are also ancestor and descendant, and life-stage rules for parents, partners and spouses.
 */
export function tieIssues(draft: HouseholdDraft): CreatorIssue[] {
  const out: CreatorIssue[] = [];
  const add = (message: string) => { if (!out.some((i) => i.message === message)) out.push({ member: null, step: 'household', message }); };
  const n = draft.members.length;
  const name = (i: number) => memberName(draft.members[i], i);
  const pairs = new Map<string, { lo: number; hi: number; rel: FamilyTie }>(); // rel = what hi is to lo
  for (const t of draft.ties) {
    if (!isIndex(t.a, n) || !isIndex(t.b, n)) { add('A relationship refers to someone who is not in the household.'); continue; }
    if (t.a === t.b) { add(`${name(t.a)} cannot have a relationship with themselves.`); continue; }
    if (!FAMILY_TIES.includes(t.tie)) { add(`Unknown relationship "${String(t.tie)}".`); continue; }
    if (t.tie === 'none') continue;
    const lo = Math.min(t.a, t.b), hi = Math.max(t.a, t.b);
    const rel = t.a === lo ? t.tie : TIE_INVERSE[t.tie];
    const prev = pairs.get(`${lo}|${hi}`);
    if (!prev) pairs.set(`${lo}|${hi}`, { lo, hi, rel });
    else if (prev.rel !== rel) {
      add(`${name(hi)} cannot be both ${name(lo)}'s ${TIE_NAMES[prev.rel].toLowerCase()} and ${TIE_NAMES[rel].toLowerCase()}.`);
    }
  }
  const parents: number[][] = Array.from({ length: n }, () => []);
  const romances: number[] = Array.from({ length: n }, () => 0);
  const stage = (i: number) => LIFE_STAGES.indexOf(draft.members[i]?.lifeStage ?? 'adult');
  const isAdult = (i: number) => ADULT_STAGES.includes(draft.members[i]?.lifeStage ?? 'adult');
  for (const { lo, hi, rel } of pairs.values()) {
    if (rel === 'parent' || rel === 'child') {
      const parent = rel === 'parent' ? hi : lo, child = rel === 'parent' ? lo : hi;
      parents[child]?.push(parent);
      if (!isAdult(parent)) add(`${name(parent)} is too young to be a parent.`);
      else if (stage(parent) < stage(child)) add(`${name(parent)} cannot be the parent of someone older.`);
    }
    if (ROMANTIC_TIES.includes(rel)) {
      romances[lo] = (romances[lo] ?? 0) + 1; romances[hi] = (romances[hi] ?? 0) + 1;
      if (!isAdult(lo) || !isAdult(hi)) add(`Only adults can be ${rel === 'spouse' ? 'spouses' : 'partners'} (${name(lo)} and ${name(hi)}).`);
    }
  }
  romances.forEach((c, i) => { if (c > 1) add(`${name(i)} can only have one partner or spouse.`); });
  parents.forEach((ps, i) => { if (ps.length > 2) add(`${name(i)} can have at most two parents.`); });
  // ancestors via parent links (cycle-safe)
  const ancestors = (i: number): Set<number> => {
    const seen = new Set<number>();
    const stack = [...(parents[i] ?? [])];
    while (stack.length > 0) {
      const p = stack.pop() as number;
      if (seen.has(p)) continue;
      seen.add(p);
      stack.push(...(parents[p] ?? []));
    }
    return seen;
  };
  const anc = Array.from({ length: n }, (_, i) => ancestors(i));
  anc.forEach((s, i) => { if (s.has(i)) add(`${name(i)} cannot be their own ancestor; check the parent and child ties.`); });
  for (const { lo, hi, rel } of pairs.values()) {
    if ((rel === 'sibling' || ROMANTIC_TIES.includes(rel)) && (anc[lo]?.has(hi) || anc[hi]?.has(lo))) {
      const what = rel === 'sibling' ? 'siblings' : rel === 'spouse' ? 'spouses' : 'partners';
      add(`${name(lo)} and ${name(hi)} cannot be ${what} when one is the other's ancestor.`);
    }
  }
  return out;
}

/**
 * Generation row per member for a simple family tree: 0 for people without parents in the household,
 * parents above children, and partners, spouses and siblings on the same row. Cycles are cut (validation reports them).
 */
export function familyGenerations(draft: HouseholdDraft): number[] {
  const n = draft.members.length;
  const gen: number[] = Array.from({ length: n }, () => 0);
  for (let pass = 0; pass < n * 2; pass++) {
    let changed = false;
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (a === b) continue;
        const t = tieBetween(draft, a, b); // b is a's t
        const ga = gen[a] ?? 0, gb = gen[b] ?? 0;
        const want = t === 'parent' ? gb + 1 : (ROMANTIC_TIES.includes(t) || t === 'sibling') ? gb : -1;
        if (want > ga && want < n) { gen[a] = want; changed = true; }
      }
    }
    if (!changed) break;
  }
  return gen;
}

/** All household and member issues, structured for the review step ("Fix" links by step and member). */
export function householdIssues(draft: HouseholdDraft, content: ContentDB, opts: ValidateOptions = {}): CreatorIssue[] {
  const out: CreatorIssue[] = [];
  const add = (message: string) => { out.push({ member: null, step: 'household', message }); };
  if (!draft.name.trim()) add('Household name is required.');
  if (draft.members.length === 0) add('Add at least one person.');
  if (draft.members.length > MAX_HOUSEHOLD_MEMBERS) add(`A household can have at most ${MAX_HOUSEHOLD_MEMBERS} people.`);
  draft.members.forEach((p, i) => out.push(...memberIssues(p, i, content, opts)));
  out.push(...tieIssues(draft));
  // Life stages (Milestone 8): somebody has to run the household, and little ones need a parent or guardian in it.
  const grown = (i: number) => ADULT_STAGES.includes(draft.members[i]?.lifeStage ?? 'adult');
  if (draft.members.length > 0 && !draft.members.some((p) => ADULT_STAGES.includes(p.lifeStage))) add('The household needs at least one young adult or older.');
  draft.members.forEach((p, i) => {
    if (p.lifeStage !== 'baby' && p.lifeStage !== 'toddler') return;
    const hasGuardian = draft.members.some((_, j) => j !== i && grown(j) && tieBetween(draft, i, j) === 'parent');
    if (!hasGuardian) out.push({ member: i, step: 'household', message: `A ${p.lifeStage} needs a parent or guardian in the household: set a Parent tie to a young adult or older.` });
  });
  return out;
}

/** Issues as readable strings ("Ada Lin: Choose an aspiration."); empty when the household can move in. */
export function validateHousehold(draft: HouseholdDraft, content: ContentDB, opts: ValidateOptions = {}): string[] {
  return householdIssues(draft, content, opts).map((i) =>
    i.member === null ? i.message : `${memberName(draft.members[i.member], i.member)}: ${i.message}`);
}

// ---------------------------------------------------------------------------------------------
// CreatorSession
// ---------------------------------------------------------------------------------------------

export interface CreatorValidation {
  ok: boolean;
  issues: CreatorIssue[];
  /** Issues per member index. */
  members: CreatorIssue[][];
  household: CreatorIssue[];
}

export interface CreatorSessionOptions {
  /** Draft to edit (deep-copied). Default: one random person (`start: 'blank'` for an unnamed default). */
  draft?: HouseholdDraft;
  start?: 'random' | 'blank';
  /** Source of UI randomness (default uiRng()). */
  rng?: Rng;
  undoLimit?: number;
}

interface HistoryEntry { label: string; snap: string }
interface EditContext { cur: number; note: string | null }

export interface TraitOption { def: TraitDef; selected: boolean; enabled: boolean; reason?: string }

/**
 * Editing session for the character creator. The UI reads `draft`, `current`, `step` and `validate()`,
 * and changes things only through methods. Every edit returns a CreatorResult (with an optional note when
 * a conflict was resolved automatically), is undoable, and notifies `onChange` listeners.
 * Consecutive edits of the same field (slider drags, typing) merge into one undo step until `endEdit()`
 * or a different edit.
 */
export class CreatorSession {
  readonly content: ContentDB;
  /** Increases on every change (edits, undo/redo, navigation, locks, selection). */
  version = 0;
  private d: HouseholdDraft;
  private cur = 0;
  private stepIdx = 0;
  private locks = new Set<LockCategory>();
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private coalesceKey: string | null = null;
  private clipboard: string | null = null;
  private listeners = new Set<() => void>();
  private readonly rng: Rng;
  private readonly undoLimit: number;
  private modularDef: ModularManifest | null = null;

  constructor(content: ContentDB, opts: CreatorSessionOptions = {}) {
    this.content = content;
    this.rng = opts.rng ?? uiRng();
    this.undoLimit = Math.max(1, opts.undoLimit ?? UNDO_LIMIT);
    if (opts.draft) this.d = clone(opts.draft);
    else {
      const first = opts.start === 'blank' ? blankPersonDraft(content) : randomPersonDraft(this.rng, content);
      this.d = { name: first.lastName, members: [first], ties: [] };
    }
    if (this.d.members.length === 0) this.d.members.push(randomPersonDraft(this.rng, content));
  }

  // ---- reading ----

  /** The draft being edited. Read-only: change it through the session's methods. */
  get draft(): Readonly<HouseholdDraft> { return this.d; }
  get members(): readonly PersonDraft[] { return this.d.members; }
  get currentIndex(): number { return this.cur; }
  /** The member being edited. */
  get current(): PersonDraft { return this.d.members[this.cur] as PersonDraft; }
  member(index: number): PersonDraft | undefined { return this.d.members[index]; }
  get step(): CreatorStep { return CREATOR_STEPS[this.stepIdx] ?? 'identity'; }
  get stepIndex(): number { return this.stepIdx; }

  /** Subscribe to changes; returns an unsubscribe function. */
  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  // ---- steps (free navigation, never loses edits) ----

  setStep(step: CreatorStep): void {
    const i = CREATOR_STEPS.indexOf(step);
    if (i >= 0 && i !== this.stepIdx) { this.stepIdx = i; this.endEdit(); this.changed(); }
  }
  nextStep(): CreatorStep { this.setStep(CREATOR_STEPS[Math.min(this.stepIdx + 1, CREATOR_STEPS.length - 1)] ?? 'review'); return this.step; }
  prevStep(): CreatorStep { this.setStep(CREATOR_STEPS[Math.max(this.stepIdx - 1, 0)] ?? 'identity'); return this.step; }

  // ---- undo / redo ----

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }
  undoLabel(): string | null { return this.undoStack.at(-1)?.label ?? null; }
  redoLabel(): string | null { return this.redoStack.at(-1)?.label ?? null; }
  /** Undoes the last edit; returns its label or null. */
  undo(): string | null { return this.travel(this.undoStack, this.redoStack); }
  redo(): string | null { return this.travel(this.redoStack, this.undoStack); }
  /** Ends the current gesture so the next edit of the same field becomes its own undo step. */
  endEdit(): void { this.coalesceKey = null; }

  // ---- locks and randomization ----

  isLocked(category: LockCategory): boolean { return this.locks.has(category); }
  lockedCategories(): LockCategory[] { return LOCK_CATEGORIES.filter((c) => this.locks.has(c)); }
  setLocked(category: LockCategory, locked: boolean): void {
    if (this.locks.has(category) === locked) return;
    if (locked) this.locks.add(category); else this.locks.delete(category);
    this.changed();
  }
  toggleLock(category: LockCategory): boolean { this.setLocked(category, !this.locks.has(category)); return this.locks.has(category); }

  /** Randomizes one category of the current member; refused when that category is locked. */
  randomize(category: LockCategory): CreatorResult {
    if (this.locks.has(category)) return fail(`${CATEGORY_NAMES[category]} is locked.`);
    return this.randomizeCategories(`Randomize ${CATEGORY_NAMES[category].toLowerCase()}`, [category]);
  }
  /** Randomizes the unlocked categories of a step (default: the current step). */
  randomizeStep(step: CreatorStep = this.step): CreatorResult {
    const cats = STEP_CATEGORIES[step].filter((c) => !this.locks.has(c));
    if (cats.length === 0) return fail(STEP_CATEGORIES[step].length ? 'Everything on this step is locked.' : 'Nothing to randomize on this step.');
    return this.randomizeCategories(`Randomize ${STEP_NAMES[step].toLowerCase()}`, cats);
  }
  /** Randomizes every unlocked category of the current member. */
  randomizeAll(): CreatorResult {
    const cats = RANDOMIZE_ORDER.filter((c) => !this.locks.has(c));
    if (cats.length === 0) return fail('Every category is locked.');
    return this.randomizeCategories('Randomize all', cats);
  }

  /** Resets a category of the current member to defaults (identity keeps names and pronouns). */
  resetCategory(category: LockCategory): CreatorResult {
    const c = this.content;
    return this.mutateMember(`Reset ${CATEGORY_NAMES[category].toLowerCase()}`, (p) => {
      const def = defaultAppearance(c);
      const a = p.appearance;
      switch (category) {
        case 'identity':
          p.voice = { preset: Object.keys(c.voices ?? {})[0] ?? '', pitch: 0 }; p.walkStyle = DEFAULT_WALK_STYLE;
          p.romance = { interestedIn: ['any'], open: true }; p.bio = '';
          break;
        case 'face': a.skin = def.skin; a.face = { ...def.face, browColor: browFor(a.hair.color) }; break;
        case 'body': a.body = def.body; a.bodyPresetId = null; this.resetModular(p, 'body'); break;
        case 'hair': a.hair = def.hair; this.resetModular(p, 'hair'); break;
        case 'clothing': p.outfits = plainWardrobe(c); this.resetModular(p, 'clothing'); break;
        case 'personality': p.traits = []; p.likes = []; p.dislikes = []; p.aspirationId = null; p.careerId = null; break;
      }
    });
  }

  // ---- presets, copy/paste ----

  applyFacePreset(presetId: string): CreatorResult {
    const preset = this.content.facePresets[presetId];
    if (!preset) return fail('That face preset is not available.');
    return this.mutateMember(`Face preset: ${preset.name}`, (p) => {
      p.appearance.face.presetId = preset.id;
      p.appearance.face.params = paramsFrom(this.content.faceParams ?? [], preset.params);
    });
  }

  /** Applies a body preset, including its frame. */
  applyBodyPreset(presetId: string): CreatorResult {
    const preset = this.content.bodyPresets[presetId];
    if (!preset) return fail('That body preset is not available.');
    return this.mutateMember(`Body preset: ${preset.name}`, (p) => {
      p.appearance.frame = preset.frame;
      p.appearance.bodyPresetId = preset.id;
      p.appearance.body = paramsFrom(this.content.bodyParams ?? [], preset.params);
    });
  }

  /** Copies a member's appearance and outfits to the session clipboard. */
  copyAppearance(index: number = this.cur): CreatorResult {
    const p = this.d.members[index];
    if (!p) return fail('That person is not in the household.');
    this.clipboard = JSON.stringify({ lifeStage: p.lifeStage, appearance: p.appearance, outfits: p.outfits });
    this.changed();
    return OK;
  }
  canPasteAppearance(): boolean { return this.clipboard !== null; }
  /** Pastes the copied appearance (and outfits when asked) onto the current member. */
  pasteAppearance(opts: { outfits?: boolean } = {}): CreatorResult {
    if (!this.clipboard) return fail('Copy an appearance first.');
    const data = JSON.parse(this.clipboard) as { lifeStage: LifeStage; appearance: Appearance; outfits: Wardrobe };
    return this.mutateMember('Paste appearance', (p) => {
      if (data.lifeStage !== p.lifeStage) return 'Appearance can only be pasted between people of the same life stage.';
      p.appearance = data.appearance;
      if (opts.outfits) p.outfits = data.outfits;
    });
  }

  // ---- members ----

  selectMember(index: number): CreatorResult {
    if (!isIndex(index, this.d.members.length)) return fail('That person is not in the household.');
    if (index !== this.cur) { this.cur = index; this.endEdit(); this.changed(); }
    return OK;
  }

  /** Adds a random (default) or blank adult sharing the household surname, and selects them. */
  addMember(opts: { blank?: boolean } = {}): CreatorResult {
    if (this.d.members.length >= MAX_HOUSEHOLD_MEMBERS) return fail(`A household can have at most ${MAX_HOUSEHOLD_MEMBERS} people.`);
    return this.mutate(opts.blank ? 'Add blank person' : 'Add person', (d, ctx) => {
      const lastName = d.members[0]?.lastName || d.name || undefined;
      const p = opts.blank
        ? blankPersonDraft(this.content, lastName ? { lastName } : {})
        : randomPersonDraft(this.rng, this.content, { avoidFirstNames: d.members.map((m) => m.firstName), ...(lastName ? { lastName } : {}) });
      d.members.push(p);
      ctx.cur = d.members.length - 1;
    });
  }

  removeMember(index: number = this.cur): CreatorResult {
    if (!isIndex(index, this.d.members.length)) return fail('That person is not in the household.');
    if (this.d.members.length <= 1) return fail('A household needs at least one person.');
    return this.mutate(`Remove ${memberName(this.d.members[index], index)}`, (d, ctx) => {
      d.members.splice(index, 1);
      d.ties = remapTies(d.ties, (i) => (i === index ? null : i > index ? i - 1 : i));
      if (ctx.cur > index || ctx.cur >= d.members.length) ctx.cur = Math.max(0, ctx.cur - 1);
    });
  }

  /** Copies a member (new first name, no ties) right after the original and selects the copy. */
  duplicateMember(index: number = this.cur): CreatorResult {
    const src = this.d.members[index];
    if (!src) return fail('That person is not in the household.');
    if (this.d.members.length >= MAX_HOUSEHOLD_MEMBERS) return fail(`A household can have at most ${MAX_HOUSEHOLD_MEMBERS} people.`);
    return this.mutate(`Duplicate ${memberName(src, index)}`, (d, ctx) => {
      const copy = clone(src);
      copy.firstName = randomFirstName(this.rng, copy.pronouns.subject, d.members.map((m) => m.firstName));
      d.members.splice(index + 1, 0, copy);
      d.ties = remapTies(d.ties, (i) => (i > index ? i + 1 : i));
      ctx.cur = index + 1;
    });
  }

  /** Moves a member to another position; ties and the selection follow. */
  moveMember(from: number, to: number): CreatorResult {
    const n = this.d.members.length;
    if (!isIndex(from, n) || !isIndex(to, n)) return fail('That position is not in the household.');
    if (from === to) return OK;
    return this.mutate('Reorder people', (d, ctx) => {
      const order = d.members.map((_, i) => i);
      order.splice(to, 0, order.splice(from, 1)[0] as number);
      d.members = order.map((i) => d.members[i] as PersonDraft);
      d.ties = remapTies(d.ties, (i) => order.indexOf(i));
      ctx.cur = order.indexOf(ctx.cur);
    });
  }

  // ---- household and ties ----

  setHouseholdName(name: string): CreatorResult {
    return this.mutate('Household name', (d) => { d.name = cleanText(name, HOUSEHOLD_NAME_MAX_LENGTH); }, 'householdName');
  }

  /** What member b is to member a. */
  tie(a: number, b: number): FamilyTie { return tieBetween(this.d, a, b); }

  /** Sets what member b is to member a ('none' removes the tie). Refused when it would contradict other ties. */
  setTie(a: number, b: number, tie: FamilyTie): CreatorResult {
    const n = this.d.members.length;
    if (!isIndex(a, n) || !isIndex(b, n)) return fail('That person is not in the household.');
    if (a === b) return fail('A person cannot have a relationship with themselves.');
    if (!FAMILY_TIES.includes(tie)) return fail('Unknown relationship.');
    const before = new Set(tieIssues(this.d).map((i) => i.message));
    return this.mutate(`Relationship: ${TIE_NAMES[tie]}`, (d) => {
      d.ties = d.ties.filter((t) => !((t.a === a && t.b === b) || (t.a === b && t.b === a)));
      if (tie !== 'none') d.ties.push(a < b ? { a, b, tie } : { a: b, b: a, tie: TIE_INVERSE[tie] });
      const added = tieIssues(d).find((i) => !before.has(i.message));
      if (added) return added.message;
    });
  }

  // ---- identity ----

  setFirstName(v: string): CreatorResult {
    return this.mutateMember('First name', (p) => { p.firstName = cleanText(v, NAME_MAX_LENGTH); }, 'firstName');
  }
  /** Also renames the household while its name is empty or equals the first member's old surname. */
  setLastName(v: string): CreatorResult {
    return this.mutateMember('Last name', (p, d, ctx) => {
      const old = p.lastName;
      p.lastName = cleanText(v, NAME_MAX_LENGTH);
      followLastName(d, ctx.cur, old);
    }, 'lastName');
  }
  /** A preset ('she' | 'he' | 'they') or custom pronouns. */
  setPronouns(v: PronounPreset | Pronouns): CreatorResult {
    const p0 = typeof v === 'string' ? PRONOUN_PRESETS[v] : v;
    if (!p0) return fail('Unknown pronouns.');
    const next = {
      subject: cleanText(p0.subject, PRONOUN_MAX_LENGTH), object: cleanText(p0.object, PRONOUN_MAX_LENGTH),
      possessive: cleanText(p0.possessive, PRONOUN_MAX_LENGTH),
    };
    return this.mutateMember('Pronouns', (p) => { p.pronouns = next; }, typeof v === 'string' ? undefined : 'pronouns');
  }
  /** Sets the life stage of the current person (only stages with a body: `availableLifeStages()`). */
  setLifeStage(stage: LifeStage): CreatorResult {
    if (!LIFE_STAGES.includes(stage)) return fail('Unknown life stage.');
    if (!availableLifeStages().includes(stage)) return fail('That life stage is not available yet.');
    return this.mutateMember('Life stage', (p) => {
      p.lifeStage = stage;
      // a stored modular look drops what the new stage may not wear (facial hair on a child, a gown on a toddler)
      if (this.modularDef && p.appearance.modular) p.appearance.modular = resolveLook(p.appearance.modular, this.modularDef, stage).look;
      if (!ADULT_STAGES.includes(stage)) { p.careerId = null; p.aspirationId = null; }
    });
  }
  setBio(v: string): CreatorResult { return this.mutateMember('Bio', (p) => { p.bio = cleanText(v, BIO_MAX_LENGTH); }, 'bio'); }
  setVoicePreset(id: string): CreatorResult {
    if (!knownOrUnchecked(this.content.voices, id)) return fail('That voice is not available.');
    return this.mutateMember('Voice', (p) => { p.voice.preset = id; });
  }
  setVoicePitch(v: number): CreatorResult { return this.setNumber('Voice pitch', 'pitch', v, -1, 1, (p, x) => { p.voice.pitch = x; }); }
  setWalkStyle(id: string): CreatorResult {
    if (!WALK_STYLES.some((w) => w.id === id)) return fail('Unknown walking style.');
    return this.mutateMember('Walking style', (p) => { p.walkStyle = id; });
  }
  /** Romantic interest by body frame presentation; 'any' replaces specific choices; [] = not interested. */
  setRomanceInterest(values: ReadonlyArray<'a' | 'b' | 'any'>): CreatorResult {
    const valid = values.filter((x) => x === 'a' || x === 'b' || x === 'any');
    const next: Array<'a' | 'b' | 'any'> = valid.includes('any') || (valid.includes('a') && valid.includes('b')) ? ['any'] : [...new Set(valid)];
    return this.mutateMember('Romantic interest', (p) => { p.romance.interestedIn = next; });
  }
  setRomanceOpen(open: boolean): CreatorResult { return this.mutateMember('Open to romance', (p) => { p.romance.open = !!open; }); }

  // ---- face and body ----

  /** Changes the frame; a body preset made for the other frame is cleared (controls are kept). */
  setFrame(frame: BodyFrame): CreatorResult {
    if (frame !== 'a' && frame !== 'b') return fail('Unknown body frame.');
    return this.mutateMember('Body frame', (p, _d, ctx) => {
      const a = p.appearance;
      a.frame = frame;
      if (a.bodyPresetId && this.content.bodyPresets[a.bodyPresetId]?.frame !== frame) a.bodyPresetId = null;
      // a stored modular look keeps its body in step with the frame (see setModularBody)
      const m = this.modularDef;
      if (m && a.modular && modularStage(p.lifeStage)) {
        const note = this.retargetBody(p, m.defaults.bodyByFrame[frame]);
        if (note) ctx.note = note;
      }
    });
  }
  setSkin(hex: string): CreatorResult { return this.setColor('Skin colour', 'skin', hex, (p, c) => { p.appearance.skin = c; }); }
  setBodyParam(id: string, value: number): CreatorResult {
    const v = clampParam(this.content.bodyParams ?? [], id, value);
    if (v === null) return fail('Unknown body control.');
    return this.mutateMember(this.paramLabel(this.content.bodyParams, id), (p) => { p.appearance.body[id] = v; }, `body:${id}`);
  }
  setFaceParam(id: string, value: number): CreatorResult {
    const v = clampParam(this.content.faceParams ?? [], id, value);
    if (v === null) return fail('Unknown face control.');
    return this.mutateMember(this.paramLabel(this.content.faceParams, id), (p) => { p.appearance.face.params[id] = v; }, `face:${id}`);
  }
  setEyeColor(hex: string): CreatorResult { return this.setColor('Eye colour', 'eye', hex, (p, c) => { p.appearance.face.eyeColor = c; }); }
  setBrowStyle(id: string): CreatorResult {
    if (!knownOrUnchecked(this.content.browStyles, id)) return fail('That brow style is not available.');
    return this.mutateMember('Brow style', (p) => { p.appearance.face.browStyle = id; });
  }
  setBrowColor(hex: string): CreatorResult { return this.setColor('Brow colour', 'brow', hex, (p, c) => { p.appearance.face.browColor = c; }); }
  setFreckles(v: number): CreatorResult { return this.setNumber('Freckles', 'freckles', v, 0, 1, (p, x) => { p.appearance.face.freckles = x; }); }
  setBlush(v: number): CreatorResult { return this.setNumber('Blush', 'blush', v, 0, 1, (p, x) => { p.appearance.face.blush = x; }); }
  setLipTint(v: number): CreatorResult { return this.setNumber('Lip tint', 'lipTint', v, 0, 1, (p, x) => { p.appearance.face.lipTint = x; }); }
  setLipColor(hex: string): CreatorResult { return this.setColor('Lip colour', 'lip', hex, (p, c) => { p.appearance.face.lipColor = c; }); }

  // ---- hair ----

  setHairStyle(id: string): CreatorResult {
    if (!inRegistry(this.content.hair, id)) return fail('That hairstyle is not available.');
    return this.mutateMember('Hairstyle', (p) => { p.appearance.hair.styleId = id; });
  }
  setHairColor(hex: string): CreatorResult { return this.setColor('Hair colour', 'hair', hex, (p, c) => { p.appearance.hair.color = c; }); }
  setHairHighlight(hex: string | null): CreatorResult {
    if (hex === null) return this.mutateMember('Hair highlight', (p) => { p.appearance.hair.highlight = null; });
    return this.setColor('Hair highlight', 'highlight', hex, (p, c) => { p.appearance.hair.highlight = c; });
  }
  setFacialHair(id: string | null): CreatorResult {
    if (id !== null && !inRegistry(this.content.facialHair, id)) return fail('That facial hair style is not available.');
    return this.mutateMember('Facial hair', (p) => { p.appearance.hair.facialHairId = id; });
  }

  // ---- modular (Quaternius) looks ----
  //
  // A person's modular look lives in `appearance.modular` (types.ts ModularLook) and is only written once someone edits it
  // here: the first edit materializes it from `lookFor` (the derived look), so old saves and untouched people keep
  // following their classic appearance. Source of truth for the shared colours is the CLASSIC appearance (skin, eye colour,
  // hair colour): every edit copies them into the stored look's `colors` (mirrorModularColors), so the two never disagree
  // and the classic colour controls keep working in both styles. The body follows the frame (A = defaults.bodyByFrame.a)
  // and the other way round. Every modular edit is one undoable mutateMember, so undo, Cancel and the wardrobe's Cancel
  // restore the previous look. Edits end with resolveLook, so a stored look never names anything the manifest cannot draw.

  /** Gives the session the modular manifest while the 'quaternius' style is active (null = classic style; not undoable). */
  setModularManifest(m: ModularManifest | null): void {
    if (this.modularDef === m) return;
    this.modularDef = m;
    this.changed();
  }
  get modularManifest(): ModularManifest | null { return this.modularDef; }

  /** True when this member is edited as a modular person: the style is active and the life stage uses modular bodies. */
  isModular(index: number = this.cur): boolean {
    const p = this.d.members[index];
    return !!this.modularDef && !!p && modularStage(p.lifeStage);
  }

  /** The look drawn for a member (stored, else derived); null when not modular. */
  modularLook(index: number = this.cur): ModularLook | null {
    const p = this.d.members[index];
    return this.modularDef && p && modularStage(p.lifeStage) ? lookFor(p.appearance, this.modularDef, undefined, p.lifeStage) : null;
  }

  setModularBody(bodyId: string): CreatorResult {
    const m = this.modularDef;
    if (!m) return fail(NOT_MODULAR);
    const body = findBody(m, bodyId);
    if (!body) return fail('That body is not available.');
    return this.modularEdit(`Body: ${body.label}`, (p, _look, ctx) => {
      const note = this.retargetBody(p, bodyId);
      if (note) ctx.note = note;
    });
  }

  setModularHair(hairId: string | null): CreatorResult {
    const m = this.modularDef;
    if (!m) return fail(NOT_MODULAR);
    const h = hairId === null ? null : findHair(m, hairId);
    if (hairId !== null && !h) return fail('That hairstyle is not available.');
    return this.modularEdit(h ? `Hairstyle: ${h.label}` : 'No hairstyle', (_p, look, ctx) => {
      if (h && !h.files[look.bodyId]) return `${h.label} is not available for this body.`;
      const notes = equipHair(m, look, hairId);
      if (notes.length) ctx.note = notes.join(' ');
    });
  }

  /** Wears facial hair (a beard or moustache; takes the hair colour), or none (null). Garments / hairstyles it excludes change. */
  setModularFacialHair(facialHairId: string | null): CreatorResult {
    const m = this.modularDef;
    if (!m) return fail(NOT_MODULAR);
    const f = facialHairId === null ? null : findFacialHair(m, facialHairId);
    if (facialHairId !== null && !f) return fail('That facial hair is not available.');
    return this.modularEdit(f ? `Facial hair: ${f.label}` : 'No facial hair', (_p, look, ctx) => {
      if (f && !f.files[look.bodyId]) return `${f.label} is not available for this body.`;
      const notes = equipFacialHair(m, look, facialHairId);
      if (notes.length) ctx.note = notes.join(' ');
    });
  }

  /** Wears a garment in a slot of an outfit category, or takes the slot's garment off (null). */
  setModularGarment(category: OutfitCategory, slot: ModularSlot, garmentId: string | null): CreatorResult {
    const m = this.modularDef;
    if (!m) return fail(NOT_MODULAR);
    const g = garmentId === null ? null : findGarment(m, garmentId);
    if (garmentId !== null && !g) return fail('That garment is not available.');
    if (g && g.slot !== slot) return fail(`${g.label} does not go in the ${slot} slot.`);
    return this.modularEdit(g ? `Garment: ${g.label}` : `No ${slot}`, (_p, look, ctx) => {
      if (!g) { unequipSlot(look, category, slot); return; }
      if (!g.files[look.bodyId]) return `${g.label} is not available for this body.`;
      const notes = equipGarment(m, look, category, g.id);
      if (notes.length) ctx.note = notes.join(' ');
    });
  }

  setModularGarmentColor(garmentId: string, regionId: string, hex: string): CreatorResult {
    const m = this.modularDef;
    if (!m) return fail(NOT_MODULAR);
    const g = findGarment(m, garmentId);
    if (!g) return fail('That garment is not available.');
    const c = normalizeHex(hex, '');
    if (!isHex(c)) return fail('That is not a valid colour.');
    if (!g.colorRegions.some((r) => r.id === regionId)) return fail('That part of the garment cannot be recoloured.');
    return this.modularEdit(`${g.label} colour`, (_p, look) => { setGarmentRegionColor(m, look, garmentId, regionId, c); }, `mcolor:${garmentId}:${regionId}`);
  }

  /** Sets a body morph declared by the current body (clamped to its range). */
  setModularMorph(id: string, value: number): CreatorResult {
    const m = this.modularDef;
    if (!m) return fail(NOT_MODULAR);
    if (typeof value !== 'number' || !Number.isFinite(value)) return fail('That is not a number.');
    const cur = this.modularLook();
    const def = cur ? findBody(m, cur.bodyId)?.morphs.find((x) => x.id === id) : undefined;
    if (!def) return fail('That body control is not available.');
    const v = round3(clamp(value, def.range[0], def.range[1]));
    return this.modularEdit(def.label, (_p, look) => { look.morphs[id] = v; }, `morph:${id}`);
  }

  /** Replaces a category's outfit by a manifest outfit preset. */
  applyOutfitPreset(presetId: string, category: OutfitCategory = 'everyday'): CreatorResult {
    const m = this.modularDef;
    if (!m) return fail(NOT_MODULAR);
    const preset = findPreset(m, presetId);
    if (!preset) return fail('That outfit is not available.');
    return this.modularEdit(`Outfit: ${preset.label}`, (_p, look, ctx) => {
      const notes = applyPreset(m, look, category, presetId);
      if (notes && notes.length) ctx.note = notes.join(' ');
    });
  }

  /** Runs a modular edit on the current member: materializes the look, applies `fn`, then makes the result valid. */
  private modularEdit(label: string, fn: (p: PersonDraft, look: ModularLook, ctx: EditContext) => string | void, key?: string): CreatorResult {
    const m = this.modularDef;
    if (!m) return fail(NOT_MODULAR);
    return this.mutateMember(label, (p, _d, ctx) => {
      if (!modularStage(p.lifeStage)) return NOT_MODULAR;
      const err = fn(p, this.materialize(p, m), ctx);
      if (typeof err === 'string') return err;
      this.settle(p, m, ctx);
    }, key);
  }

  /** Writes the derived look into the draft when it has none yet. */
  private materialize(p: PersonDraft, m: ModularManifest): ModularLook {
    const look = lookFor(p.appearance, m, undefined, p.lifeStage);
    p.appearance.modular = look;
    return look;
  }

  /** Makes the stored look drawable; what had to go is added to the edit's note. */
  private settle(p: PersonDraft, m: ModularManifest, ctx: EditContext): void {
    const look = p.appearance.modular;
    if (!look) return;
    const before = JSON.stringify(look);
    const res = resolveLook(look, m, p.lifeStage);
    p.appearance.modular = res.look;
    if (res.issues.length > 0 && JSON.stringify(res.look) !== before) {
      const extra = 'Some parts did not fit together and were removed.';
      ctx.note = ctx.note ? `${ctx.note} ${extra}` : extra;
    }
  }

  /** Switches the stored look to another body and the frame that goes with it; returns a note for parts that do not fit. */
  private retargetBody(p: PersonDraft, bodyId: string): string | null {
    const m = this.modularDef;
    const look = p.appearance.modular;
    if (!m || !look) return null;
    const body = findBody(m, bodyId);
    if (!body) return null;
    const had = new Set<string>([...Object.values(look.outfits).flatMap((o) => Object.values(o ?? {})), ...(look.hairId ? [look.hairId] : []), ...(look.facialHairId ? [look.facialHairId] : [])]);
    if (look.bodyId !== bodyId) look.morphs = {};
    look.bodyId = bodyId;
    const frame = body.frame ?? (['a', 'b'] as const).find((f) => m.defaults.bodyByFrame[f] === bodyId);
    if (frame && p.appearance.frame !== frame) {
      p.appearance.frame = frame;
      const preset = p.appearance.bodyPresetId;
      if (preset && this.content.bodyPresets[preset]?.frame !== frame) p.appearance.bodyPresetId = null;
    }
    const res = resolveLook(look, m, p.lifeStage);
    p.appearance.modular = res.look;
    const kept = new Set<string>([...Object.values(res.look.outfits).flatMap((o) => Object.values(o ?? {})), ...(res.look.hairId ? [res.look.hairId] : []), ...(res.look.facialHairId ? [res.look.facialHairId] : [])]);
    const lost = [...had].filter((id) => !kept.has(id)).map((id) => findGarment(m, id)?.label ?? findHair(m, id)?.label ?? findFacialHair(m, id)?.label ?? id);
    if (lost.length === 0) return null;
    // a hairstyle that is not fitted to the new body is replaced instead of leaving the head bare
    let swapped = '';
    if (look.hairId && !res.look.hairId) {
      const fb = fallbackHair(m, res.look, undefined, p.lifeStage);
      if (fb) { res.look.hairId = fb; swapped = ` Hair switched to ${findHair(m, fb)?.label ?? fb}.`; }
    }
    return `${lost.join(', ')} ${lost.length === 1 ? "isn't" : "aren't"} available for ${body.label} - taken off.${swapped}`;
  }

  /** Randomize hook: re-rolls parts of the stored (or materialized) modular look of a modular member. */
  private randomModular(p: PersonDraft, parts: { body?: boolean; hair?: boolean; clothing?: boolean }): void {
    const m = this.modularDef;
    if (!m || !modularStage(p.lifeStage)) return;
    const look = lookFor(p.appearance, m, undefined, p.lifeStage);
    if (parts.body) {
      // the frame was just rolled: the body follows it (see setFrame), morphs are re-rolled for that body
      // any body of that frame: its default, or a second build of it
      const ofFrame = m.bodies.filter((b) => (b.frame ?? (m.defaults.bodyByFrame.a === b.id ? 'a' : m.defaults.bodyByFrame.b === b.id ? 'b' : null)) === p.appearance.frame);
      look.bodyId = ofFrame.length > 0 ? this.rng.pick(ofFrame).id : m.defaults.bodyByFrame[p.appearance.frame];
      randomizeLook(m, look, this.rng, { body: false });
      const def = findBody(m, look.bodyId);
      look.morphs = {};
      for (const mo of def?.morphs ?? []) if (mo.group !== 'stage') look.morphs[mo.id] = round3(this.rng.range(mo.range[0], mo.range[1]));
    }
    p.appearance.modular = look;
    randomizeLook(m, look, this.rng, { hair: !!parts.hair, clothing: !!parts.clothing, stage: p.lifeStage });
    p.appearance.modular = resolveLook(look, m, p.lifeStage).look;
  }

  /** Reset hook: puts one category of a stored modular look back to what the manifest derives for this person. */
  private resetModular(p: PersonDraft, category: 'body' | 'hair' | 'clothing'): void {
    const m = this.modularDef;
    const look = p.appearance.modular;
    if (!m || !look || !modularStage(p.lifeStage)) return;
    const def = deriveModularLook(p.appearance, m, undefined, p.lifeStage);
    if (category === 'body') { look.bodyId = def.bodyId; look.morphs = {}; }
    else if (category === 'hair') { look.hairId = def.hairId; look.facialHairId = def.facialHairId; }
    else look.outfits = def.outfits;
    p.appearance.modular = resolveLook(look, m, p.lifeStage).look;
  }

  // ---- clothing ----

  /** Ready garments for a category's layer (what the garment picker should offer). */
  garmentOptions(category: OutfitCategory, layer: GarmentLayer) { return garmentsFor(this.content, category, layer); }

  /**
   * Puts a garment on a layer (null clears it). Keeps the previous colour and, when allowed, pattern.
   * A full outfit replaces top and bottom and vice versa; the result carries a note when that happens.
   */
  setGarment(category: OutfitCategory, index: number, layer: GarmentLayer, garmentId: string | null): CreatorResult {
    const def = garmentId === null ? null : this.content.garments[garmentId];
    if (garmentId !== null) {
      if (!def) return fail('That garment is not available.');
      if (def.layer !== layer) return fail(`${def.name} is not ${LAYER_NAMES[layer].toLowerCase()}.`);
      if (!def.categories.includes(category)) return fail(`${def.name} is not suitable for ${OUTFIT_CATEGORY_NAMES[category]} outfits.`);
    }
    return this.editOutfit(LAYER_NAMES[layer], category, index, (o, ctx) => {
      const prev = o.layers[layer];
      const choice = def ? garmentChoice(def, prev?.color ?? def.defaultColor,
        prev ? (prev.pattern === 'solid' || def.patterns.includes(prev.pattern) ? prev.pattern : 'solid') : (def.defaultPattern ?? 'solid'), prev?.patternColor) : null;
      const r = setLayer(o, layer, choice);
      o.layers = r.outfit.layers;
      ctx.note = r.note;
    });
  }
  setGarmentColor(category: OutfitCategory, index: number, layer: GarmentLayer, hex: string): CreatorResult {
    if (!isHex(normalizeHex(hex, ''))) return fail('That is not a valid colour.');
    const c = normalizeHex(hex, '#000000');
    return this.editLayer(`${LAYER_NAMES[layer]} colour`, category, index, layer, (ch) => { ch.color = c; }, `color:${category}:${index}:${layer}`);
  }
  setGarmentPattern(category: OutfitCategory, index: number, layer: GarmentLayer, patternId: string): CreatorResult {
    return this.editLayer(`${LAYER_NAMES[layer]} pattern`, category, index, layer, (ch) => {
      const def = this.content.garments[ch.garmentId];
      if (patternId !== 'solid' && (!def || !def.patterns.includes(patternId))) return 'That pattern is not available for this garment.';
      ch.pattern = patternId;
    });
  }
  setGarmentPatternColor(category: OutfitCategory, index: number, layer: GarmentLayer, hex: string): CreatorResult {
    if (!isHex(normalizeHex(hex, ''))) return fail('That is not a valid colour.');
    const c = normalizeHex(hex, '#000000');
    return this.editLayer(`${LAYER_NAMES[layer]} pattern colour`, category, index, layer, (ch) => { ch.patternColor = c; }, `pcolor:${category}:${index}:${layer}`);
  }
  addAccessory(category: OutfitCategory, index: number, accessoryId: string, color?: string): CreatorResult {
    const def = this.content.accessories[accessoryId];
    if (!def) return fail('That accessory is not available.');
    return this.editOutfit(`Add ${def.name}`, category, index, (o, ctx) => {
      const r = addAccessory(o, def, this.content, color && isHex(normalizeHex(color, '')) ? normalizeHex(color, def.defaultColor) : undefined);
      if (!r.ok) return r.reason;
      o.accessories = r.outfit.accessories;
      ctx.note = r.note;
    });
  }
  removeAccessory(category: OutfitCategory, index: number, accessoryId: string): CreatorResult {
    return this.editOutfit('Remove accessory', category, index, (o) => { o.accessories = o.accessories.filter((a) => a.accessoryId !== accessoryId); });
  }
  setAccessoryColor(category: OutfitCategory, index: number, accessoryId: string, hex: string): CreatorResult {
    if (!isHex(normalizeHex(hex, ''))) return fail('That is not a valid colour.');
    return this.editOutfit('Accessory colour', category, index, (o) => {
      const acc = o.accessories.find((a) => a.accessoryId === accessoryId);
      if (!acc) return 'That accessory is not part of this outfit.';
      acc.color = normalizeHex(hex, acc.color);
    }, `acc:${category}:${index}:${accessoryId}`);
  }
  /** Adds an outfit to a category: a copy of `copyOf` or a random one. */
  addOutfit(category: OutfitCategory, opts: { copyOf?: number } = {}): CreatorResult {
    return this.mutateMember('Add outfit', (p) => {
      const list = p.outfits.outfits[category];
      if (list.length >= MAX_OUTFITS_PER_CATEGORY) return `At most ${MAX_OUTFITS_PER_CATEGORY} outfits per category.`;
      const id = nextOutfitId(p.outfits, category);
      const name = `${OUTFIT_CATEGORY_NAMES[category]} ${list.length + 1}`;
      const src = opts.copyOf !== undefined ? list[opts.copyOf] : undefined;
      list.push(src ? { ...clone(src), id, name } : randomOutfit(this.rng, this.content, category, { id, name, affinities: allowedAffinities(p.pronouns, p.appearance.frame) }));
    });
  }
  removeOutfit(category: OutfitCategory, index: number): CreatorResult {
    return this.mutateMember('Remove outfit', (p) => {
      const list = p.outfits.outfits[category];
      if (!list[index]) return 'That outfit does not exist.';
      if (list.length <= 1) return 'Every category needs at least one outfit.';
      list.splice(index, 1);
      const cur = p.outfits.current;
      if (cur.category === category && cur.index >= index) cur.index = Math.max(0, cur.index === index ? 0 : cur.index - 1);
    });
  }
  renameOutfit(category: OutfitCategory, index: number, name: string): CreatorResult {
    const n = cleanText(name, OUTFIT_NAME_MAX_LENGTH);
    if (!n.trim()) return fail('Outfit name cannot be empty.');
    return this.editOutfit('Outfit name', category, index, (o) => { o.name = n; }, `oname:${category}:${index}`);
  }
  /** Chooses the outfit worn when the person moves in. */
  setWornOutfit(category: OutfitCategory, index: number): CreatorResult {
    return this.mutateMember('Worn outfit', (p) => {
      if (!p.outfits.outfits[category]?.[index]) return 'That outfit does not exist.';
      p.outfits.current = { category, index };
    });
  }
  /** Replaces one outfit with a random one (refused while clothing is locked). */
  randomizeOutfit(category: OutfitCategory, index: number): CreatorResult {
    if (this.locks.has('clothing')) return fail('Clothing is locked.');
    return this.editOutfit('Randomize outfit', category, index, (o) => {
      const r = randomOutfit(this.rng, this.content, category, { id: o.id, name: o.name, affinities: this.affinities() });
      o.layers = r.layers; o.accessories = r.accessories;
    });
  }

  // ---- personality ----

  /** Ready traits with whether each can be chosen now and why not. */
  traitOptions(): TraitOption[] {
    const chosen = this.current.traits;
    return readyDefs(this.content.traits).map((def) => {
      const selected = chosen.includes(def.id);
      if (selected) return { def, selected, enabled: true };
      const clash = chosen.find((id) => traitsConflict(this.content, id, def.id));
      if (clash) return { def, selected, enabled: false, reason: `Opposite of ${this.content.traits[clash]?.name ?? clash}.` };
      if (chosen.length >= TRAITS_PER_ADULT) return { def, selected, enabled: false, reason: `Already ${TRAITS_PER_ADULT} traits.` };
      return { def, selected, enabled: true };
    });
  }
  toggleTrait(id: string): CreatorResult {
    const def = this.content.traits[id];
    return this.mutateMember(def ? `Trait: ${def.name}` : 'Trait', (p) => {
      if (p.traits.includes(id)) { p.traits = p.traits.filter((t) => t !== id); return; }
      if (!def || def.status !== 'ready') return 'That trait is not available.';
      if (p.traits.length >= TRAITS_PER_ADULT) return `A person has ${TRAITS_PER_ADULT} traits. Remove one first.`;
      const clash = p.traits.find((t) => traitsConflict(this.content, t, id));
      if (clash) return `${def.name} and ${this.content.traits[clash]?.name ?? clash} are opposites.`;
      p.traits.push(id);
    });
  }
  setTraits(ids: readonly string[]): CreatorResult {
    const unique = [...new Set(ids)];
    if (unique.length > TRAITS_PER_ADULT) return fail(`A person has at most ${TRAITS_PER_ADULT} traits.`);
    for (const id of unique) if (this.content.traits[id]?.status !== 'ready') return fail(`Trait "${id}" is not available.`);
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const a = unique[i] as string, b = unique[j] as string;
        if (traitsConflict(this.content, a, b)) return fail(`${this.content.traits[a]?.name} and ${this.content.traits[b]?.name} are opposites.`);
      }
    }
    return this.mutateMember('Traits', (p) => { p.traits = unique; });
  }
  setAspiration(id: string | null): CreatorResult {
    if (id !== null && this.content.aspirations[id]?.status !== 'ready') return fail('That aspiration is not available.');
    return this.mutateMember('Aspiration', (p) => {
      if (id !== null && !ADULT_STAGES.includes(p.lifeStage)) return 'Only adults can have an aspiration.';
      p.aspirationId = id;
    });
  }
  /** Starting job (null = none). */
  setCareer(id: string | null): CreatorResult {
    if (id !== null && this.content.careers[id]?.status !== 'ready') return fail('That job is not available.');
    return this.mutateMember('Job', (p) => {
      if (id !== null && !ADULT_STAGES.includes(p.lifeStage)) return 'Only adults can have a job.';
      p.careerId = id;
    });
  }
  /** Toggles a like (removing it from dislikes). */
  toggleLike(id: string): CreatorResult { return this.togglePreference(id, 'likes', 'dislikes', MAX_LIKES); }
  toggleDislike(id: string): CreatorResult { return this.togglePreference(id, 'dislikes', 'likes', MAX_DISLIKES); }

  // ---- validation, result, templates ----

  validate(): CreatorValidation {
    const issues = householdIssues(this.d, this.content);
    return {
      ok: issues.length === 0,
      issues,
      members: this.d.members.map((_, i) => issues.filter((x) => x.member === i)),
      household: issues.filter((x) => x.member === null),
    };
  }

  /** A trimmed deep copy for confirming (household name falls back to the first surname). */
  finalDraft(): HouseholdDraft {
    const d = clone(this.d);
    for (const p of d.members) { p.firstName = p.firstName.trim(); p.lastName = p.lastName.trim(); p.bio = p.bio.trim(); }
    d.name = d.name.trim() || d.members[0]?.lastName || 'Household';
    return d;
  }

  exportMemberAppearance(index: number = this.cur, opts: { includeOutfits?: boolean } = {}): string | null {
    const p = this.d.members[index];
    return p ? exportAppearance(p, { name: memberName(p, index), includeOutfits: opts.includeOutfits ?? true }) : null;
  }

  /** Applies an appearance preset JSON to the current member; missing assets are substituted and listed. */
  importMemberAppearance(json: unknown, opts: { outfits?: boolean } = {}): { ok: true; substitutions: string[] } | { ok: false; reason: string } {
    const r = importAppearance(json, this.content);
    if (!r.ok) return { ok: false, reason: r.error };
    const res = this.mutateMember('Load appearance preset', (p) => {
      p.appearance = r.appearance;
      if (opts.outfits !== false && r.outfits) p.outfits = r.outfits;
    });
    return res.ok ? { ok: true, substitutions: r.substitutions } : { ok: false, reason: res.reason };
  }

  // ---- internals ----

  private changed(): void {
    this.version++;
    for (const fn of [...this.listeners]) fn();
  }

  private snapshot(): string { return JSON.stringify({ d: this.d, cur: this.cur }); }

  private travel(from: HistoryEntry[], to: HistoryEntry[]): string | null {
    const e = from.pop();
    if (!e) return null;
    to.push({ label: e.label, snap: this.snapshot() });
    const s = JSON.parse(e.snap) as { d: HouseholdDraft; cur: number };
    this.d = s.d;
    this.cur = clamp(s.cur, 0, this.d.members.length - 1);
    this.coalesceKey = null;
    this.changed();
    return e.label;
  }

  /** Runs an edit on a copy; commits it (with one undo entry, merged by `key`) only when it succeeds and changes something. */
  private mutate(label: string, fn: (d: HouseholdDraft, ctx: EditContext) => string | void, key?: string): CreatorResult {
    const ctx: EditContext = { cur: this.cur, note: null };
    const next = clone(this.d);
    const err = fn(next, ctx);
    if (typeof err === 'string') return fail(err);
    for (const p of next.members) mirrorModularColors(p.appearance);
    const result: CreatorResult = ctx.note ? { ok: true, note: ctx.note } : OK;
    if (ctx.cur === this.cur && JSON.stringify(next) === JSON.stringify(this.d)) return result;
    const fullKey = key ? `${this.cur}:${key}` : null;
    if (!(fullKey !== null && fullKey === this.coalesceKey && this.undoStack.length > 0)) {
      this.undoStack.push({ label, snap: this.snapshot() });
      if (this.undoStack.length > this.undoLimit) this.undoStack.shift();
    }
    this.redoStack = [];
    this.coalesceKey = fullKey;
    this.d = next;
    this.cur = clamp(ctx.cur, 0, next.members.length - 1);
    this.changed();
    return result;
  }

  private mutateMember(label: string, fn: (p: PersonDraft, d: HouseholdDraft, ctx: EditContext) => string | void, key?: string): CreatorResult {
    return this.mutate(label, (d, ctx) => {
      const p = d.members[ctx.cur];
      return p ? fn(p, d, ctx) : 'No person is selected.';
    }, key);
  }

  private editOutfit(label: string, category: OutfitCategory, index: number, fn: (o: Outfit, ctx: EditContext) => string | void, key?: string): CreatorResult {
    return this.mutateMember(label, (p, _d, ctx) => {
      const o = p.outfits.outfits[category]?.[index];
      return o ? fn(o, ctx) : 'That outfit does not exist.';
    }, key);
  }

  private editLayer(label: string, category: OutfitCategory, index: number, layer: GarmentLayer, fn: (c: NonNullable<Outfit['layers'][GarmentLayer]>) => string | void, key?: string): CreatorResult {
    return this.editOutfit(label, category, index, (o) => {
      const choice = o.layers[layer];
      return choice ? fn(choice) : `Choose ${LAYER_NAMES[layer].toLowerCase()} first.`;
    }, key);
  }

  private setColor(label: string, key: string, hex: string, apply: (p: PersonDraft, c: Hex) => void): CreatorResult {
    const c = normalizeHex(hex, '');
    if (!isHex(c)) return fail('That is not a valid colour.');
    return this.mutateMember(label, (p) => { apply(p, c); }, key);
  }

  private setNumber(label: string, key: string, v: number, min: number, max: number, apply: (p: PersonDraft, x: number) => void): CreatorResult {
    if (typeof v !== 'number' || !Number.isFinite(v)) return fail('That is not a number.');
    const x = round3(clamp(v, min, max));
    return this.mutateMember(label, (p) => { apply(p, x); }, key);
  }

  private paramLabel(defs: readonly ParamDef[] | undefined, id: string): string { return defs?.find((d) => d.id === id)?.name ?? id; }

  private togglePreference(id: string, into: 'likes' | 'dislikes', other: 'likes' | 'dislikes', max: number): CreatorResult {
    const pref = (this.content.preferences ?? []).find((x) => x.id === id);
    if (!pref) return fail('That preference is not available.');
    return this.mutateMember(`${into === 'likes' ? 'Like' : 'Dislike'}: ${pref.name}`, (p) => {
      if (p[into].includes(id)) { p[into] = p[into].filter((x) => x !== id); return; }
      if (p[into].length >= max) return `At most ${max} ${into}.`;
      p[other] = p[other].filter((x) => x !== id);
      p[into].push(id);
    });
  }

  /** Garment affinities for default outfits of the current member (derived from pronouns and frame). */
  private affinities() { return allowedAffinities(this.current.pronouns, this.current.appearance.frame); }

  private randomizeCategories(label: string, cats: readonly LockCategory[]): CreatorResult {
    return this.mutateMember(label, (p, d, ctx) => {
      const others = d.members.filter((_, i) => i !== ctx.cur);
      for (const cat of RANDOMIZE_ORDER) {
        if (!cats.includes(cat)) continue;
        switch (cat) {
          case 'identity': {
            const old = p.lastName;
            const keepLast = old.trim() !== '' && others.some((o) => o.lastName === old);
            const pronouns = p.pronouns;
            randomizeIdentity(this.rng, this.content, p, { avoidFirstNames: others.map((o) => o.firstName), ...(keepLast ? { lastName: old } : {}) });
            if (pronounPresetOf(pronouns) === 'custom') p.pronouns = pronouns;
            followLastName(d, ctx.cur, old);
            break;
          }
          case 'body':
            randomizeBody(this.rng, this.content, p.appearance);
            this.randomModular(p, { body: true });
            break;
          case 'hair':
            randomizeHair(this.rng, this.content, p.appearance, p.lifeStage);
            this.randomModular(p, { hair: true });
            break;
          case 'face': randomizeFace(this.rng, this.content, p.appearance); break;
          case 'clothing':
            // Defaults follow the person's presentation; a full randomize may cross over now and then.
            p.outfits = defaultWardrobe(this.content, this.rng, {
              affinities: allowedAffinities(p.pronouns, p.appearance.frame), ...(label === 'Randomize all' ? { crossover: CROSSOVER_CHANCE } : {}),
            });
            this.randomModular(p, { clothing: true });
            break;
          case 'personality': randomizePersonality(this.rng, this.content, p); break;
        }
      }
    });
  }
}

function remapTies(ties: HouseholdDraft['ties'], map: (i: number) => number | null): HouseholdDraft['ties'] {
  const out: HouseholdDraft['ties'] = [];
  for (const t of ties) {
    const a = map(t.a), b = map(t.b);
    if (a !== null && b !== null && a >= 0 && b >= 0) out.push({ a, b, tie: t.tie });
  }
  return out;
}

/** The household name follows the first member's surname while empty or equal to the old surname. */
function followLastName(d: HouseholdDraft, index: number, oldLast: string): void {
  const p = d.members[index];
  if (index === 0 && p && (d.name.trim() === '' || d.name === oldLast)) d.name = p.lastName;
}

// ---------------------------------------------------------------------------------------------
// Templates (versioned JSON with missing-asset substitution)
// ---------------------------------------------------------------------------------------------

export const APPEARANCE_TEMPLATE_FORMAT = 'hearthside-life/appearance';
export const HOUSEHOLD_TEMPLATE_FORMAT = 'hearthside-life/household';
export const TEMPLATE_VERSION = 1;

export interface AppearanceTemplate { format: typeof APPEARANCE_TEMPLATE_FORMAT; version: number; name: string; appearance: Appearance; outfits?: Wardrobe }
export interface HouseholdTemplate { format: typeof HOUSEHOLD_TEMPLATE_FORMAT; version: number; name: string; household: HouseholdDraft }

export type AppearanceImport =
  | { ok: true; name: string; appearance: Appearance; outfits: Wardrobe | null; substitutions: string[] }
  | { ok: false; error: string };
export type HouseholdImport =
  | { ok: true; draft: HouseholdDraft; substitutions: string[]; issues: string[] }
  | { ok: false; error: string };

/** Appearance preset JSON (outfits included unless `includeOutfits` is false). */
export function exportAppearance(
  person: { appearance: Appearance; outfits?: Wardrobe; firstName?: string; lastName?: string },
  opts: { name?: string; includeOutfits?: boolean } = {},
): string {
  const t: AppearanceTemplate = {
    format: APPEARANCE_TEMPLATE_FORMAT, version: TEMPLATE_VERSION,
    name: opts.name ?? (`${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() || 'Appearance'),
    appearance: clone(person.appearance),
    ...(opts.includeOutfits !== false && person.outfits ? { outfits: clone(person.outfits) } : {}),
  };
  return JSON.stringify(t, null, 2);
}

/** Household template JSON. */
export function exportHouseholdTemplate(draft: HouseholdDraft, opts: { name?: string } = {}): string {
  const t: HouseholdTemplate = {
    format: HOUSEHOLD_TEMPLATE_FORMAT, version: TEMPLATE_VERSION, name: opts.name ?? (draft.name || 'Household'), household: clone(draft),
  };
  return JSON.stringify(t, null, 2);
}

/** Reads an appearance preset (string or parsed object). Unknown assets are replaced by defaults and listed. */
export function importAppearance(json: unknown, content: ContentDB): AppearanceImport {
  const parsed = readTemplate(json, APPEARANCE_TEMPLATE_FORMAT);
  if (!parsed.ok) return parsed;
  const subs: string[] = [];
  const note = (m: string) => { subs.push(m); };
  const raw = parsed.data;
  if (raw.appearance === undefined) return { ok: false, error: 'The preset contains no appearance.' };
  const appearance = normalizeAppearance(raw.appearance, content, note);
  const outfits = raw.outfits === undefined ? null : normalizeWardrobe(raw.outfits, content, note);
  return { ok: true, name: cleanText(raw.name, 60) || 'Appearance', appearance, outfits, substitutions: subs };
}

/** Reads a household template (string or parsed object), substituting missing assets; `issues` are validation results. */
export function importHouseholdTemplate(json: unknown, content: ContentDB): HouseholdImport {
  const parsed = readTemplate(json, HOUSEHOLD_TEMPLATE_FORMAT);
  if (!parsed.ok) return parsed;
  const subs: string[] = [];
  const hh = asObj(parsed.data.household);
  const rawMembers = asArr(hh.members);
  if (rawMembers.length === 0) return { ok: false, error: 'The template contains no people.' };
  if (rawMembers.length > MAX_HOUSEHOLD_MEMBERS) subs.push(`Only the first ${MAX_HOUSEHOLD_MEMBERS} people were kept.`);
  const members = rawMembers.slice(0, MAX_HOUSEHOLD_MEMBERS).map((m, i) => {
    const r = asObj(m);
    const who = `${cleanText(r.firstName, NAME_MAX_LENGTH)} ${cleanText(r.lastName, NAME_MAX_LENGTH)}`.trim() || `Person ${i + 1}`;
    return normalizePerson(m, content, (msg) => { subs.push(`${who}: ${msg}`); });
  });
  const ties: HouseholdDraft['ties'] = [];
  let dropped = 0;
  for (const t of asArr(hh.ties)) {
    const r = asObj(t);
    const a = r.a, b = r.b, tie = r.tie;
    if (typeof a === 'number' && typeof b === 'number' && isIndex(a, members.length) && isIndex(b, members.length) && a !== b
      && typeof tie === 'string' && (FAMILY_TIES as readonly string[]).includes(tie)) ties.push({ a, b, tie: tie as FamilyTie });
    else dropped++;
  }
  if (dropped > 0) subs.push(`${dropped} relationship${dropped > 1 ? 's' : ''} referring to missing people or unknown kinds ${dropped > 1 ? 'were' : 'was'} removed.`);
  const draft: HouseholdDraft = { name: cleanText(hh.name, HOUSEHOLD_NAME_MAX_LENGTH) || members[0]?.lastName || 'Household', members, ties };
  return { ok: true, draft, substitutions: subs, issues: validateHousehold(draft, content) };
}

function readTemplate(json: unknown, format: string): { ok: true; data: Json } | { ok: false; error: string } {
  let raw: unknown = json;
  if (typeof json === 'string') {
    try { raw = JSON.parse(json); } catch { return { ok: false, error: 'The file is not valid JSON.' }; }
  }
  const data = asObj(raw);
  if (data.format !== format) {
    const other = data.format === APPEARANCE_TEMPLATE_FORMAT ? 'an appearance preset' : data.format === HOUSEHOLD_TEMPLATE_FORMAT ? 'a household template' : null;
    return { ok: false, error: other ? `This file is ${other}, not ${format === APPEARANCE_TEMPLATE_FORMAT ? 'an appearance preset' : 'a household template'}.` : 'This file is not a Hearthside Life template.' };
  }
  const version = data.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, error: 'The template has no valid version.' };
  if (version > TEMPLATE_VERSION) return { ok: false, error: 'The template was made with a newer version of Hearthside Life.' };
  return { ok: true, data: migrateTemplate(data, version) };
}

/** Upgrades older template versions to TEMPLATE_VERSION (version 1 is current). */
function migrateTemplate(data: Json, version: number): Json {
  void version;
  return data;
}
