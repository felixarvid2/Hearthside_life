// Structural checks for plain data coming from storage or from files. They describe what is wrong in plain
// English with a path, never throw, and know nothing about content (see references.ts for that).

import { NEED_IDS, OUTFIT_CATEGORIES } from '../core/types';

export type Obj = Record<string, unknown>;

export const isRecord = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isStr = (v: unknown): v is string => typeof v === 'string';
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
export const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);
export const has = (rec: object, key: string): boolean => Object.prototype.hasOwnProperty.call(rec, key);

/** At most this many problems are collected per check; the rest are summarised. */
export const MAX_PROBLEMS = 60;

export function addProblem(list: string[], message: string): void {
  if (list.length < MAX_PROBLEMS) list.push(message);
  else if (list.length === MAX_PROBLEMS) list.push('More problems were found but are not listed.');
}

/** Field check helpers: each appends one problem when `v` does not fit. */
export function expect(list: string[], ok: boolean, path: string, what: string): boolean {
  if (!ok) addProblem(list, `${path} ${what}`);
  return ok;
}

export function checkNumberRecord(v: unknown, path: string, list: string[]): void {
  if (!expect(list, isRecord(v), path, 'must be an object of numbers')) return;
  for (const [k, n] of Object.entries(v as Obj)) expect(list, isNum(n), `${path}.${k}`, 'must be a number');
}

export function checkAppearance(v: unknown, path: string, list: string[]): void {
  if (!expect(list, isRecord(v), path, 'must be an object')) return;
  const a = v as Obj;
  expect(list, a.frame === 'a' || a.frame === 'b', `${path}.frame`, "must be 'a' or 'b'");
  expect(list, isHex(a.skin), `${path}.skin`, 'must be a colour like #c08a6a');
  checkNumberRecord(a.body, `${path}.body`, list);
  expect(list, a.bodyPresetId === null || isStr(a.bodyPresetId), `${path}.bodyPresetId`, 'must be text or null');
  const face = a.face;
  if (expect(list, isRecord(face), `${path}.face`, 'must be an object')) {
    const f = face as Obj;
    expect(list, f.presetId === null || isStr(f.presetId), `${path}.face.presetId`, 'must be text or null');
    checkNumberRecord(f.params, `${path}.face.params`, list);
    expect(list, isHex(f.eyeColor), `${path}.face.eyeColor`, 'must be a colour');
    expect(list, isStr(f.browStyle), `${path}.face.browStyle`, 'must be text');
    expect(list, isHex(f.browColor), `${path}.face.browColor`, 'must be a colour');
    expect(list, isNum(f.freckles), `${path}.face.freckles`, 'must be a number');
    expect(list, isNum(f.blush), `${path}.face.blush`, 'must be a number');
    expect(list, isNum(f.lipTint), `${path}.face.lipTint`, 'must be a number');
    expect(list, isHex(f.lipColor), `${path}.face.lipColor`, 'must be a colour');
  }
  const hair = a.hair;
  if (expect(list, isRecord(hair), `${path}.hair`, 'must be an object')) {
    const h = hair as Obj;
    expect(list, isStr(h.styleId), `${path}.hair.styleId`, 'must be text');
    expect(list, isHex(h.color), `${path}.hair.color`, 'must be a colour');
    expect(list, h.highlight === null || isHex(h.highlight), `${path}.hair.highlight`, 'must be a colour or null');
    expect(list, h.facialHairId === null || isStr(h.facialHairId), `${path}.hair.facialHairId`, 'must be text or null');
  }
}

export function checkWardrobe(v: unknown, path: string, list: string[]): void {
  if (!expect(list, isRecord(v), path, 'must be an object')) return;
  const w = v as Obj;
  const outfits = w.outfits;
  if (expect(list, isRecord(outfits), `${path}.outfits`, 'must be an object')) {
    for (const cat of OUTFIT_CATEGORIES) {
      const arr = (outfits as Obj)[cat];
      if (!expect(list, Array.isArray(arr), `${path}.outfits.${cat}`, 'must be a list of outfits')) continue;
      (arr as unknown[]).forEach((o, i) => checkOutfit(o, `${path}.outfits.${cat}[${i}]`, list));
    }
  }
  const cur = w.current;
  if (expect(list, isRecord(cur), `${path}.current`, 'must be an object')) {
    const c = cur as Obj;
    const catOk = expect(list, isStr(c.category) && (OUTFIT_CATEGORIES as readonly string[]).includes(c.category), `${path}.current.category`, 'must be an outfit category');
    const idxOk = expect(list, isInt(c.index) && (c.index as number) >= 0, `${path}.current.index`, 'must be a whole number from 0');
    if (catOk && idxOk && isRecord(outfits)) {
      const arr = (outfits as Obj)[c.category as string];
      if (Array.isArray(arr) && arr.length > 0 && (c.index as number) >= arr.length) {
        addProblem(list, `${path}.current points at outfit ${String(c.index)} but ${String(c.category)} only has ${arr.length}`);
      }
    }
  }
}

function checkOutfit(v: unknown, path: string, list: string[]): void {
  if (!expect(list, isRecord(v), path, 'must be an object')) return;
  const o = v as Obj;
  expect(list, isStr(o.id), `${path}.id`, 'must be text');
  expect(list, isStr(o.name), `${path}.name`, 'must be text');
  if (expect(list, isRecord(o.layers), `${path}.layers`, 'must be an object')) {
    for (const [layer, choice] of Object.entries(o.layers as Obj)) {
      if (choice === undefined) continue;
      if (!expect(list, isRecord(choice), `${path}.layers.${layer}`, 'must be an object')) continue;
      const g = choice as Obj;
      expect(list, isStr(g.garmentId), `${path}.layers.${layer}.garmentId`, 'must be text');
      expect(list, isHex(g.color), `${path}.layers.${layer}.color`, 'must be a colour');
      expect(list, isStr(g.pattern), `${path}.layers.${layer}.pattern`, 'must be text');
      expect(list, isHex(g.patternColor), `${path}.layers.${layer}.patternColor`, 'must be a colour');
    }
  }
  if (expect(list, Array.isArray(o.accessories), `${path}.accessories`, 'must be a list')) {
    (o.accessories as unknown[]).forEach((acc, i) => {
      if (!expect(list, isRecord(acc), `${path}.accessories[${i}]`, 'must be an object')) return;
      expect(list, isStr((acc as Obj).accessoryId), `${path}.accessories[${i}].accessoryId`, 'must be text');
      expect(list, isHex((acc as Obj).color), `${path}.accessories[${i}].color`, 'must be a colour');
    });
  }
}

export function checkNeeds(v: unknown, path: string, list: string[]): void {
  if (!expect(list, isRecord(v), path, 'must be an object')) return;
  for (const need of NEED_IDS) expect(list, isNum((v as Obj)[need]), `${path}.${need}`, 'must be a number');
}

const LIFE_STAGES = ['baby', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'];

export function checkLifeStage(v: unknown, path: string, list: string[]): void {
  expect(list, isStr(v) && LIFE_STAGES.includes(v), path, `must be one of ${LIFE_STAGES.join(', ')}`);
}

function checkStringList(v: unknown, path: string, list: string[]): void {
  if (!expect(list, Array.isArray(v), path, 'must be a list of text')) return;
  (v as unknown[]).forEach((s, i) => expect(list, isStr(s), `${path}[${i}]`, 'must be text'));
}

function checkPronouns(v: unknown, path: string, list: string[]): void {
  if (!expect(list, isRecord(v), path, 'must be an object')) return;
  for (const k of ['subject', 'object', 'possessive']) expect(list, isStr((v as Obj)[k]), `${path}.${k}`, 'must be text');
}

/** The creator's PersonDraft (core/drafts.ts). */
export function checkPersonDraft(v: unknown, path: string, list: string[]): void {
  if (!expect(list, isRecord(v), path, 'must be an object')) return;
  const p = v as Obj;
  expect(list, isStr(p.firstName), `${path}.firstName`, 'must be text');
  expect(list, isStr(p.lastName), `${path}.lastName`, 'must be text');
  checkPronouns(p.pronouns, `${path}.pronouns`, list);
  checkLifeStage(p.lifeStage, `${path}.lifeStage`, list);
  expect(list, isStr(p.bio), `${path}.bio`, 'must be text');
  if (expect(list, isRecord(p.voice), `${path}.voice`, 'must be an object')) {
    expect(list, isStr((p.voice as Obj).preset), `${path}.voice.preset`, 'must be text');
    expect(list, isNum((p.voice as Obj).pitch), `${path}.voice.pitch`, 'must be a number');
  }
  expect(list, isStr(p.walkStyle), `${path}.walkStyle`, 'must be text');
  if (expect(list, isRecord(p.romance), `${path}.romance`, 'must be an object')) {
    const r = p.romance as Obj;
    expect(list, Array.isArray(r.interestedIn) && (r.interestedIn as unknown[]).every((x) => x === 'a' || x === 'b' || x === 'any'),
      `${path}.romance.interestedIn`, "must be a list of 'a', 'b' or 'any'");
    expect(list, isBool(r.open), `${path}.romance.open`, 'must be true or false');
  }
  checkAppearance(p.appearance, `${path}.appearance`, list);
  checkWardrobe(p.outfits, `${path}.outfits`, list);
  checkStringList(p.traits, `${path}.traits`, list);
  checkStringList(p.likes, `${path}.likes`, list);
  checkStringList(p.dislikes, `${path}.dislikes`, list);
  expect(list, p.aspirationId === null || isStr(p.aspirationId), `${path}.aspirationId`, 'must be text or null');
  expect(list, p.careerId === null || isStr(p.careerId), `${path}.careerId`, 'must be text or null');
}

const FAMILY_TIES = ['parent', 'child', 'sibling', 'spouse', 'roommate', 'none'];
/** Household size limit in the full game (brief section 7). */
export const MAX_HOUSEHOLD_SIZE = 8;

/** The creator's HouseholdDraft (core/drafts.ts). */
export function checkHouseholdDraft(v: unknown, path: string, list: string[]): void {
  if (!expect(list, isRecord(v), path, 'must be an object')) return;
  const h = v as Obj;
  expect(list, isStr(h.name), `${path}.name`, 'must be text');
  let count = 0;
  if (expect(list, Array.isArray(h.members), `${path}.members`, 'must be a list of people')) {
    const members = h.members as unknown[];
    count = members.length;
    expect(list, count >= 1 && count <= MAX_HOUSEHOLD_SIZE, `${path}.members`, `must hold 1 to ${MAX_HOUSEHOLD_SIZE} people`);
    members.forEach((m, i) => checkPersonDraft(m, `${path}.members[${i}]`, list));
  }
  if (expect(list, Array.isArray(h.ties), `${path}.ties`, 'must be a list')) {
    (h.ties as unknown[]).forEach((t, i) => {
      if (!expect(list, isRecord(t), `${path}.ties[${i}]`, 'must be an object')) return;
      const tie = t as Obj;
      expect(list, isInt(tie.a) && (tie.a as number) >= 0 && (tie.a as number) < count, `${path}.ties[${i}].a`, 'must be the index of a member');
      expect(list, isInt(tie.b) && (tie.b as number) >= 0 && (tie.b as number) < count, `${path}.ties[${i}].b`, 'must be the index of a member');
      expect(list, isStr(tie.tie) && FAMILY_TIES.includes(tie.tie), `${path}.ties[${i}].tie`, `must be one of ${FAMILY_TIES.join(', ')}`);
    });
  }
}
