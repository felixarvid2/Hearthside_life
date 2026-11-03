// Aging and birthdays (Milestone 8). With aging on (`SimSettings.aging`: long, normal or custom) `Person.stageDays` advances at the
// daily rollover; when it reaches the length of the person's stage (core/lifeStages.ts stageLength) it is their birthday and they
// move to the next life stage. A birthday happens once per person and stage (occurrence `birthday:<personId>:<stage>`): it
// emits an event, adds a memory and the Birthday moodlet, shows a notification and migrates the person (school, job, outfits,
// personality). The "Age up now" interaction at a birthday cake (or a caregiver's "Celebrate a birthday" for a little one)
// triggers the same birthday early, whatever the aging setting.
//
// An elder who reaches the end of the stage stays an elder, unless `elderEndOfLife` is on: then they pass away peacefully
// (a memory for the family, the person removed cleanly). The last grown-up of a household that still has dependents is
// spared, and so is the last member of the household the player runs.

import { isDependentStage, isGrownStage, isSchoolStage, nextStage, stageLength, STAGE_LABELS } from '../core/lifeStages';
import { newId } from '../core/ids';
import { addFeed, isProcessed, markProcessed } from '../core/state';
import type { LifeStage, Outfit, OutfitCategory, Person } from '../core/types';
import { abortQueue } from './actions';
import type { SimCtx } from './context';
import { householdOf, lotLoc, setAnim } from './context';
import { relativesOf } from './family';
import { addMoodlet } from './mood';
import { unstick } from './movement';
import { addMemory } from './relationships';
import { ensureSchool } from './school';
import { dissolveHousehold } from './split';

export type AgeUpResult = { ok: true; stage: LifeStage } | { ok: false; reason: string };

/** Why this person cannot have a birthday now, or null. */
export function ageUpProblem(ctx: Pick<SimCtx, 'state'>, p: Person): string | null {
  const next = nextStage(p.lifeStage);
  if (!next) return `${p.firstName} is already an elder.`;
  if (isProcessed(ctx.state, birthdayOccurrence(p, next))) return `${p.firstName} already had this birthday.`;
  if ((p.cooldowns['@birthday'] ?? 0) > ctx.state.clock.minutes) return `${p.firstName} already celebrated today.`;
  return null;
}

const birthdayOccurrence = (p: Pick<Person, 'id'>, stage: LifeStage) => `birthday:${p.id}:${stage}`;

/**
 * The birthday: moves the person to the next life stage (once per person and stage). `via` 'cake' is the early birthday; the
 * stage clock restarts either way.
 */
export function ageUp(ctx: SimCtx, p: Person, via: 'time' | 'cake'): AgeUpResult {
  const next = nextStage(p.lifeStage);
  if (!next) return { ok: false, reason: `${p.firstName} is already an elder.` };
  const occ = birthdayOccurrence(p, next);
  if (isProcessed(ctx.state, occ)) return { ok: false, reason: `${p.firstName} already had this birthday.` };
  if (via === 'cake') {
    const problem = ageUpProblem(ctx, p);
    if (problem) return { ok: false, reason: problem };
    p.cooldowns['@birthday'] = ctx.now + 1440;
  }
  markProcessed(ctx.state, occ);
  const from = p.lifeStage;
  p.lifeStage = next;
  p.stageDays = 0;
  migrateStage(ctx, p, from, next);
  addMoodlet(ctx.content, p, 'birthday', ctx.now, 'birthday');
  addMemory(ctx.state, p, { kind: 'birthday', importance: 3, text: `Grew from ${STAGE_LABELS[from].toLowerCase()} to ${STAGE_LABELS[next].toLowerCase()}` });
  ctx.events.emit({ type: 'birthday', personId: p.id, stage: next, via });
  ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'appearance' });
  if (householdOf(ctx, p)?.isPlayable) {
    const a = /^[aeiou]/i.test(STAGE_LABELS[next]) ? 'an' : 'a';
    addFeed(ctx.state, ctx.events, 'family', `Happy birthday, ${p.firstName}! ${p.firstName} is now ${a} ${STAGE_LABELS[next].toLowerCase()}.`, p.id);
  }
  return { ok: true, stage: next };
}

/** What changes when somebody moves from one life stage to another: school, job, outfits, personality, posture. */
export function migrateStage(ctx: SimCtx, p: Person, from: LifeStage, to: LifeStage): void {
  // School: elementary for children, high school for teens, nothing before and after. Performance carries over, halved.
  const carried = p.school ? Math.round(p.school.performance / 2) : 0;
  p.school = null;
  if (isSchoolStage(to)) {
    ensureSchool(ctx.content, p);
    const school = p.school as Person['school'];
    if (school) school.performance = carried;
  } else if (isSchoolStage(from) && p.householdId) {
    addMemory(ctx.state, p, { kind: 'other', importance: 2, text: 'Finished school' });
  }
  // A job: children and teens have none (no part-time jobs exist yet); an unfinished shift counts as processed.
  if (p.career && !isGrownStage(to)) {
    const sh = p.career.shift;
    if (sh && sh.status !== 'done' && sh.status !== 'missed') markProcessed(ctx.state, sh.occurrence);
    for (const a of [...p.queue]) if (a.interactionId === 'goToWork') a.cancelRequested = true;
    p.career = null;
  }
  // Outfits: every category the wardrobe lists exists, and everyday plus sleepwear are never empty.
  ensureOutfits(ctx, p);
  // Skills: a toddler starts with the toddler skills (motor, talking and potty training) at level 1.
  if (to === 'toddler') for (const id of ['motor', 'talking', 'potty']) if (ctx.content.skills[id] && !p.skills[id]) p.skills[id] = { level: 1, xp: 0 };
  // Personality: a teen who becomes a young adult has the full three traits and an aspiration.
  if (to === 'youngAdult') topUpPersonality(ctx, p);
  // Posture: a baby leaves the crib as a toddler.
  if (from === 'baby') {
    const loc = lotLoc(p);
    if (loc) {
      loc.posture = 'standing';
      setAnim(p, 'idle', ctx.now);
      unstick(ctx, p);
    }
  }
}

function ensureOutfits(ctx: SimCtx, p: Person): void {
  const w = p.outfits;
  const copyOf = (o: Outfit, name: string): Outfit => ({ ...JSON.parse(JSON.stringify(o)) as Outfit, id: newId(ctx.state, 'out'), name });
  const first = (Object.values(w.outfits).find((l) => l && l.length > 0) ?? [])[0];
  if (!first) return;
  for (const cat of ['everyday', 'sleep'] as OutfitCategory[]) {
    if (!w.outfits[cat] || w.outfits[cat]!.length === 0) w.outfits[cat] = [copyOf(first, cat === 'sleep' ? 'Sleepwear' : 'Everyday')];
  }
  const cur = w.outfits[w.current.category];
  if (!cur || !cur[w.current.index]) w.current = { category: 'everyday', index: 0 };
}

function topUpPersonality(ctx: SimCtx, p: Person): void {
  const traitIds = Object.values(ctx.content.traits).filter((t) => t.status === 'ready').map((t) => t.id).sort();
  const conflicts = (a: string, b: string) => ctx.content.traits[a]?.conflicts.includes(b) || ctx.content.traits[b]?.conflicts.includes(a);
  let guard = 0;
  while (p.traits.length < 3 && traitIds.length > 0 && guard++ < 40) {
    const id = ctx.rng.pick(traitIds);
    if (!p.traits.includes(id) && !p.traits.some((t) => conflicts(t, id))) p.traits.push(id);
  }
  if (!p.aspiration) {
    const asp = Object.values(ctx.content.aspirations).filter((a) => a.status === 'ready').map((a) => a.id).sort();
    if (asp.length > 0) p.aspiration = { aspirationId: ctx.rng.pick(asp), stage: 0, progress: {}, completedStages: 0, rewards: [] };
  }
}

// ---------------------------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------------------------

/** Daily rollover: advances every person's stage clock and runs the birthdays that are due. */
export function dailyAging(ctx: SimCtx): void {
  const settings = ctx.state.settings;
  if (settings.aging === 'off') return;
  for (const p of Object.values(ctx.state.people)) {
    if (!ctx.state.people[p.id]) continue; // passed away earlier in this loop
    const len = stageLength(settings, p.lifeStage);
    if (len === null) continue;
    p.stageDays = Math.max(0, Math.floor(p.stageDays ?? 0)) + 1;
    if (p.stageDays < len) continue;
    if (p.lifeStage !== 'elder') { ageUp(ctx, p, 'time'); continue; }
    if (settings.elderEndOfLife === true && !passAwayProblem(ctx, p)) passAway(ctx, p);
    else p.stageDays = len;
  }
}

/** Why an elder cannot pass away now (they are the last grown-up with dependents, or the last member of the household the player runs). */
export function passAwayProblem(ctx: Pick<SimCtx, 'state'>, p: Person): string | null {
  const hh = ctx.state.households[p.householdId];
  if (!hh) return null;
  const others = hh.memberIds.map((id) => ctx.state.people[id]).filter((o): o is Person => !!o && o.id !== p.id);
  if (hh.id === ctx.state.activeHouseholdId && others.length === 0) return 'The last member of the household stays.';
  if (others.some((o) => isDependentStage(o.lifeStage) || o.lifeStage === 'child') && !others.some((o) => isGrownStage(o.lifeStage))) return 'Somebody has to look after the children.';
  return null;
}

/** An elder passes away peacefully: family members remember, and the person is removed from the world cleanly. */
export function passAway(ctx: SimCtx, p: Person): void {
  const hh = householdOf(ctx, p);
  const playable = hh?.isPlayable === true;
  const family = new Set<string>(relativesOf(ctx.state, p.id).map((r) => r.person.id));
  for (const id of hh?.memberIds ?? []) if (id !== p.id) family.add(id);
  for (const id of family) {
    const rel = ctx.state.people[id];
    if (!rel) continue;
    addMemory(ctx.state, rel, { kind: 'passedAway', importance: 3, withId: p.id, text: `${p.firstName} ${p.lastName} passed away peacefully.` });
    if (rel.householdId === p.householdId) addMoodlet(ctx.content, rel, 'missedThem', ctx.now, 'family');
  }
  if (playable) addFeed(ctx.state, ctx.events, 'family', `${p.firstName} ${p.lastName} passed away peacefully, surrounded by family. They will be remembered.`);
  removePerson(ctx, p.id);
  if (hh) dissolveHousehold(ctx.state, hh); // an empty household in town leaves its home free
  ctx.events.emit({ type: 'family', what: 'passedAway', personIds: [p.id], ...(hh ? { householdId: hh.id } : {}) });
}

/** Removes a person from the world without leaving references behind (queue, household, relationships, bonds, ties, schedule, events). */
export function removePerson(ctx: SimCtx, id: string): void {
  const state = ctx.state;
  const p = state.people[id];
  if (!p) return;
  if (lotLoc(p)) abortQueue(ctx, p, null);
  const hh = state.households[p.householdId];
  if (hh) hh.memberIds = hh.memberIds.filter((m) => m !== id);
  for (const key of Object.keys(state.relationships)) {
    const r = state.relationships[key]!;
    if (r.from === id || r.to === id) delete state.relationships[key];
  }
  for (const key of Object.keys(state.bonds)) {
    const b = state.bonds[key]!;
    if (b.a === id || b.b === id) delete state.bonds[key];
  }
  for (const o of Object.values(state.people)) {
    if (o.parentIds?.includes(id)) o.parentIds = o.parentIds.filter((x) => x !== id);
    o.memories = o.memories.filter((m) => m.withId !== id || m.importance === 3);
  }
  state.schedule = state.schedule.filter((e) => e.personId !== id);
  for (const ev of state.homeEvents ?? []) {
    ev.guestIds = ev.guestIds.filter((g) => g !== id);
    ev.arrivedIds = ev.arrivedIds.filter((g) => g !== id);
    if (ev.hostId === id && (ev.status === 'invited' || ev.status === 'running')) ev.status = 'cancelled';
  }
  delete state.people[id];
  ctx.events.emit({ type: 'person.removed', personId: id });
}
