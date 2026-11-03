// Off-lot careers. Each working day has a shift occurrence `shift:<personId>:<day>`. goToWork is queued
// automatically 45 minutes before the start while the person is on the lot (the player may cancel it);
// reaching the lot entry puts the person "at work" off-lot until the shift ends. Late arrival shortens
// the paid time; not arriving by the shift's midpoint is a missed shift. Pay is applied once per shift
// with occurrence `pay:<personId>:<day>`. Performance comes from mood at the shift start, skills,
// punctuality and completion; promotions and demotions emit events.
//
// CareerLevelDef.promotion holds the requirements to advance FROM that level to the next one.
//
// Teenagers can hold one part-time job (CareerDef.partTime, three levels) besides school; everything else (shifts,
// pay, promotion, quitting) follows the same path. A part-time job ends when the teenager becomes a young adult.

import type { CareerDef, CareerLevelDef, ContentDB } from '../content/types';
import { TICK_MINUTES, atDayMinute, dayIndex, formatClock, weekday, DAY_NAMES } from '../core/clock';
import { isGrownStage } from '../core/lifeStages';
import { facingTo } from '../core/geometry';
import { addFeed, isProcessed, markProcessed, transact } from '../core/state';
import type { CareerEventState, GameMinutes, LifeStage, Lot, Person, WorldState, WorkEffort } from '../core/types';
import { abortQueue, requestCancel } from './actions';
import { checkAspiration } from './aspirations';
import type { SimCtx } from './context';
import { clamp, householdOf, lotLoc, setAnim } from './context';
import { addMoodlet, computeMood } from './mood';
import { insertAction, makeAction } from './queue';
import { addMemory, peekRel } from './relationships';
import { addSkillXp } from './skills';
import {
  COMMUTE_LEAD_MINUTES, DEMOTION_PERFORMANCE, MISSED_SHIFT_PERFORMANCE, SHIFT_WINDOW_MINUTES,
} from './tuning';
import { walkInTile } from './travel';

/** Chance that a small on-the-job decision comes up during a shift. */
export const CAREER_EVENT_CHANCE = 0.45;

export interface ShiftWindow {
  occurrence: string;
  day: number;
  start: GameMinutes;
  end: GameMinutes;
  level: CareerLevelDef;
  career: CareerDef;
}

/** Level definition for a career state. */
export function careerLevelDef(content: ContentDB, careerId: string, level: number): CareerLevelDef | undefined {
  const career = content.careers[careerId];
  return career?.levels.find((l) => l.level === level) ?? career?.levels[level - 1];
}

/**
 * The jobs a person of a stage may take, in name order: part-time jobs for teenagers, full careers for grown-ups,
 * nothing for children (and younger). One source of truth for the job panel and the command checks.
 */
export function careersForStage(content: Pick<ContentDB, 'careers'>, stage: LifeStage): CareerDef[] {
  const partTime = stage === 'teen';
  if (!partTime && !isGrownStage(stage)) return [];
  return Object.values(content.careers)
    .filter((c) => c.status === 'ready' && c.levels.length > 0 && !!c.partTime === partTime)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The person's shift on a given day (null on days off or without a career). */
export function shiftOn(content: ContentDB, p: Person, day: number): ShiftWindow | null {
  const cs = p.career;
  if (!cs || day < 0) return null;
  const career = content.careers[cs.careerId];
  const level = careerLevelDef(content, cs.careerId, cs.level);
  if (!career || !level) return null;
  if (!level.days.includes(weekday(atDayMinute(day, 0)))) return null;
  const start = atDayMinute(day, level.start);
  const end = level.end > level.start ? atDayMinute(day, level.end) : atDayMinute(day + 1, level.end);
  return { occurrence: `shift:${p.id}:${day}`, day, start, end, level, career };
}

/** Window of a shift occurrence id (`shift:<personId>:<day>`). */
export function shiftWindowOf(content: ContentDB, p: Person, occurrence: string): ShiftWindow | null {
  const day = Number(occurrence.slice(occurrence.lastIndexOf(':') + 1));
  return Number.isFinite(day) ? shiftOn(content, p, day) : null;
}

/** The next shift that has not ended and was not processed yet. */
export function nextShift(state: WorldState, content: ContentDB, p: Person, from: GameMinutes): ShiftWindow | null {
  const today = dayIndex(from);
  for (let d = today - 1; d <= today + 8; d++) {
    const w = shiftOn(content, p, d);
    if (w && shiftCountsFor(p, w) && w.end > from && !isProcessed(state, w.occurrence)) return w;
  }
  return null;
}

/** A shift only counts once the person was already employed when its window opened (joining mid-shift is not a miss). */
function shiftCountsFor(p: Person, w: ShiftWindow): boolean {
  return !p.career || w.start + SHIFT_WINDOW_MINUTES >= p.career.joinedAt;
}

/** Readable "Next shift: Tuesday 9:00 AM". */
export function shiftText(w: ShiftWindow | null): string {
  if (!w) return 'No upcoming shift.';
  return `Next shift: ${DAY_NAMES[weekday(w.start)]} ${formatClock(w.start)}.`;
}

/** Career summary for the UI: next/current shift, status, expected pay and lateness. */
export function careerInfo(state: WorldState, content: ContentDB, p: Person): {
  title: string; level: number; performance: number; next: ShiftWindow | null;
  status: 'none' | 'upcoming' | 'commuting' | 'atWork' | 'done' | 'missed'; expectedPay: number; workedMinutes: number; lateMinutes: number;
} | null {
  const cs = p.career;
  if (!cs) return null;
  const level = careerLevelDef(content, cs.careerId, cs.level);
  const now = state.clock.minutes;
  const sh = cs.shift;
  const current = sh ? shiftWindowOf(content, p, sh.occurrence) : null;
  const active = sh && current && (sh.status === 'atWork' || sh.status === 'commuting' || sh.status === 'upcoming') ? current : null;
  const next = active ?? nextShift(state, content, p, now);
  const len = next ? next.end - next.start : 0;
  const expectedMinutes = sh && active && sh.status === 'atWork' ? Math.max(0, len - sh.lateMinutes) : len;
  return {
    title: level?.title ?? 'Employee',
    level: cs.level,
    performance: cs.performance,
    next,
    status: active ? sh!.status : 'none',
    expectedPay: next ? Math.round((next.level.hourlyWage * expectedMinutes) / 60) : 0,
    workedMinutes: sh?.workedMinutes ?? 0,
    lateMinutes: sh?.lateMinutes ?? 0,
  };
}

/** The shift that can be commuted to right now (goToWork), or null. */
export function commutableShift(ctx: SimCtx, p: Person): ShiftWindow | null {
  const cs = p.career;
  if (!cs) return null;
  const today = dayIndex(ctx.now);
  for (const d of [today - 1, today]) {
    const w = shiftOn(ctx.content, p, d);
    if (!w || !shiftCountsFor(p, w) || isProcessed(ctx.state, w.occurrence)) continue;
    if (ctx.now < w.start - SHIFT_WINDOW_MINUTES || ctx.now >= missDeadline(w)) continue;
    if (cs.shift && cs.shift.occurrence === w.occurrence && cs.shift.status !== 'upcoming' && cs.shift.status !== 'commuting') continue;
    return w;
  }
  return null;
}

function missDeadline(w: ShiftWindow): GameMinutes {
  return w.start + (w.end - w.start) / 2;
}

/** Per-tick career processing (simulation flow step 3). */
export function updateCareers(ctx: SimCtx): void {
  for (const p of Object.values(ctx.state.people)) {
    const cs = p.career;
    if (!cs || p.isNpc || !ctx.content.careers[cs.careerId]) continue;
    // Not on the active lot: in transit, or on the way somewhere (Milestone 7) - the shift clock still runs only at work.
    if (cs.shift?.status === 'atWork') {
      const w = shiftWindowOf(ctx.content, p, cs.shift.occurrence);
      if (!w) { cs.shift.status = 'done'; returnHome(ctx, p); continue; }
      const from = Math.max(ctx.now - TICK_MINUTES, w.start), to = Math.min(ctx.now, w.end);
      if (to > from) cs.shift.workedMinutes += to - from;
      if (ctx.now >= w.end) endShift(ctx, p, w);
      continue;
    }
    const today = dayIndex(ctx.now);
    for (const d of [today - 1, today]) {
      const w = shiftOn(ctx.content, p, d);
      if (!w || !shiftCountsFor(p, w) || ctx.now >= w.end || isProcessed(ctx.state, w.occurrence)) continue;
      if (ctx.now < w.start - SHIFT_WINDOW_MINUTES) continue;
      if (cs.shift?.occurrence !== w.occurrence) cs.shift = { occurrence: w.occurrence, status: 'upcoming', workedMinutes: 0, lateMinutes: 0 };
      const sh = cs.shift;
      if (sh.status !== 'upcoming' && sh.status !== 'commuting') break;
      if (ctx.now >= missDeadline(w)) { missShift(ctx, p, w); break; }
      const commuteKey = `commute:${p.id}:${w.day}`;
      if (sh.status === 'upcoming' && lotLoc(p) && ctx.now >= w.start - COMMUTE_LEAD_MINUTES && !isProcessed(ctx.state, commuteKey)) {
        markProcessed(ctx.state, commuteKey);
        if (!p.queue.some((a) => a.interactionId === 'goToWork')) {
          insertAction(ctx, p, makeAction(ctx, p, { interactionId: 'goToWork', target: { kind: 'self' } }, 'schedule'));
        }
      } else if (sh.status === 'upcoming' && p.location.kind === 'offlot' && p.location.place === 'home' && !p.location.transit
        && ctx.now >= w.start - COMMUTE_LEAD_MINUTES && !isProcessed(ctx.state, commuteKey)) {
        // Left at home while the household is out (Milestone 7): they leave for work from there, with nobody to walk.
        startShift(ctx, p, '');
      }
      break;
    }
  }
}

function missShift(ctx: SimCtx, p: Person, w: ShiftWindow): void {
  const cs = p.career;
  if (!cs?.shift) return;
  cs.shift.status = 'missed';
  markProcessed(ctx.state, w.occurrence);
  cs.performance = clamp(cs.performance + MISSED_SHIFT_PERFORMANCE, -100, 100);
  for (const a of [...p.queue]) if (a.interactionId === 'goToWork') requestCancel(ctx, p, a.id);
  ctx.events.emit({ type: 'career', personId: p.id, what: 'missed' });
  addMoodlet(ctx.content, p, 'missedWork', ctx.now, 'career');
  addFeed(ctx.state, ctx.events, 'warning', `${p.firstName} missed work today.`, p.id);
  checkDemotion(ctx, p, w.career);
}

/** Called when the commuting person reaches the lot entry: they go off-lot and are at work. */
export function startShift(ctx: SimCtx, p: Person, keepActionId: string): void {
  const cs = p.career;
  const w = commutableShift(ctx, p);
  if (!cs || !w) return;
  const late = Math.max(0, ctx.now - w.start);
  cs.shift = { occurrence: w.occurrence, status: 'atWork', workedMinutes: 0, lateMinutes: late };
  markProcessed(ctx.state, `commute:${p.id}:${w.day}`);
  // Performance from mood, needs, skills and the chosen effort at the start of the shift.
  const mood = computeMood(ctx.content, p).value;
  let traitBonus = 0;
  for (const t of p.traits) traitBonus += ctx.content.traits[t]?.effects.workPerformance ?? 0;
  const effort = cs.effort ?? 'normal';
  const effortBonus = effort === 'hard' ? 3 : effort === 'slack' ? -4 : 0;
  let skillBonus = 0;
  const careerSkills = w.career.skills;
  if (careerSkills.length > 0) {
    let total = 0;
    for (const id of careerSkills) total += Math.min(10, p.skills[id]?.level ?? 1);
    skillBonus = (total / careerSkills.length / 10) * 3;
  }
  const needPenalty = (p.needs.energy < 30 ? -2 : 0) + (p.needs.fun < 25 ? -1 : 0);
  cs.performance = clamp(cs.performance + (mood / 100) * 6 + traitBonus + effortBonus + skillBonus + needPenalty, -100, 100);
  // Sometimes a small decision comes up during the shift; the player may answer it in the Career tab.
  const eventIds = Object.keys(ctx.content.careerEvents ?? {});
  if (eventIds.length > 0 && cs.pendingEvent == null && ctx.rng.chance(CAREER_EVENT_CHANCE)) {
    cs.pendingEvent = { eventId: ctx.rng.pick(eventIds), day: w.day };
  }
  abortQueue(ctx, p, null, keepActionId);
  // The lot they set out from (a venue is fine, Milestone 7) decides where they come back to.
  const origin = p.location.kind === 'lot' ? p.location.lotId : p.location.lotId ?? householdOf(ctx, p)?.homeLotId ?? undefined;
  p.location = { kind: 'offlot', place: 'work', ...(origin ? { lotId: origin } : {}), since: ctx.now, until: w.end };
  p.thought = null;
  setAnim(p, 'idle', ctx.now);
  ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'location' });
  ctx.events.emit({ type: 'career', personId: p.id, what: 'leftForWork' });
  if (late > 0) ctx.events.emit({ type: 'career', personId: p.id, what: 'late' });
  addFeed(ctx.state, ctx.events, 'career', late > 0
    ? `${p.firstName} left for work ${Math.round(late)} min late.`
    : `${p.firstName} left for work.`, p.id);
}

/**
 * Marks the person as being at work for the shift now running, without any walking (the light schedule of people
 * outside the player's household, Milestone 7). Pay and counting happen later in townlife.lightCareers.
 */
export function beginLightShift(ctx: SimCtx, p: Person): void {
  const cs = p.career;
  if (!cs) return;
  const day = dayIndex(ctx.now);
  for (const d of [day - 1, day]) {
    const w = shiftOn(ctx.content, p, d);
    if (w && ctx.now >= w.start - 20 && ctx.now < w.end) {
      if (cs.shift?.occurrence !== w.occurrence) cs.shift = { occurrence: w.occurrence, status: 'atWork', workedMinutes: 0, lateMinutes: 0 };
      if (p.location.kind === 'offlot' && p.location.place === 'work') p.location.until = w.end;
      return;
    }
  }
}

function endShift(ctx: SimCtx, p: Person, w: ShiftWindow): void {
  const cs = p.career;
  if (!cs?.shift) return;
  const sh = cs.shift;
  sh.status = 'done';
  markProcessed(ctx.state, w.occurrence);
  // An unanswered on-the-job decision defaults to its first option at the end of the shift.
  if (cs.pendingEvent) {
    if (!cs.pendingEvent.chosen) {
      const eventDef = ctx.content.careerEvents?.[cs.pendingEvent.eventId];
      if (eventDef?.options[0]) resolveCareerEvent(ctx, p, eventDef.options[0].id);
    }
    cs.pendingEvent = null;
  }
  const len = w.end - w.start;
  const worked = clamp(sh.workedMinutes, 0, len);
  const effort = cs.effort ?? 'normal';
  const pay = Math.round((w.level.hourlyWage * worked) / 60);
  if (pay > 0) {
    transact(ctx.state, ctx.events, p.householdId, pay, 'wage', `${w.career.name} wage (${p.firstName})`, { occurrence: `pay:${p.id}:${w.day}` });
  }
  ctx.events.emit({ type: 'career', personId: p.id, what: 'paid', amount: pay });
  if (pay > 0) addMoodlet(ctx.content, p, 'payday', ctx.now, 'career');
  // On-the-job practice (a little of every skill the career uses).
  if (worked > 0) for (const skillId of w.career.skills) addSkillXp(ctx, p, skillId, (worked / 60) * 3);
  // Performance: completion, punctuality, skills and effort.
  const completion = len > 0 ? worked / len : 0;
  let delta = completion >= 0.95 ? 4 : completion * 6 - 3;
  delta -= Math.min(10, sh.lateMinutes / 6);
  delta += effort === 'hard' ? 2 : effort === 'slack' ? -2.5 : 0;
  const req = Object.entries(w.level.promotion.skills);
  if (req.length > 0) {
    let s = 0;
    for (const [skill, lvl] of req) s += Math.min(1, (p.skills[skill]?.level ?? 0) / Math.max(1, lvl));
    delta += (s / req.length) * 2;
  } else delta += 1;
  cs.performance = clamp(cs.performance + delta, -100, 100);
  cs.daysWorked += 1;
  // Hard work is tiring; slacking off leaves a little more energy for the evening.
  if (effort === 'hard') p.needs.energy = clamp(p.needs.energy - 8, 0, 100);
  else if (effort === 'slack') p.needs.energy = clamp(p.needs.energy + 4, 0, 100);
  checkPromotion(ctx, p, w);
  returnHome(ctx, p);
  addFeed(ctx.state, ctx.events, 'money', `${p.firstName} came home from work and earned $${(pay / 100).toFixed(2)}.`, p.id);
  checkAspiration(ctx, p);
}

function checkPromotion(ctx: SimCtx, p: Person, w: ShiftWindow): void {
  const cs = p.career;
  if (!cs) return;
  const next = careerLevelDef(ctx.content, cs.careerId, cs.level + 1);
  const cur = careerLevelDef(ctx.content, cs.careerId, cs.level);
  if (!next || !cur || next.level <= cs.level) { checkDemotion(ctx, p, w.career); return; }
  const skillsOk = Object.entries(cur.promotion.skills).every(([s, lvl]) => (p.skills[s]?.level ?? 0) >= lvl);
  const daysOk = cs.daysWorked >= (cur.promotion.days ?? 0);
  const relationshipOk = !cur.promotion.relationship || hasCareerRelationship(ctx.state, p, cur.promotion.relationship.minFriendship);
  if (cs.performance >= cur.promotion.performance && skillsOk && daysOk && relationshipOk) {
    cs.level = next.level;
    cs.performance = 10;
    ctx.events.emit({ type: 'career', personId: p.id, what: 'promoted' });
    addMoodlet(ctx.content, p, 'promoted', ctx.now, 'career');
    addFeed(ctx.state, ctx.events, 'career', `${p.firstName} was promoted to ${next.title}!`, p.id);
    addMemory(ctx.state, p, { kind: 'promotion', importance: 3, text: `Promoted to ${next.title}` });
    return;
  }
  checkDemotion(ctx, p, w.career);
}

/** True when the person has a mutual friendship outside the household at or above `minFriendship`. */
function hasCareerRelationship(state: WorldState, p: Person, minFriendship: number): boolean {
  const hh = state.households[p.householdId];
  for (const rel of Object.values(state.relationships)) {
    if (rel.from !== p.id || rel.friendship < minFriendship) continue;
    if (!state.people[rel.to] || hh?.memberIds.includes(rel.to)) continue;
    if (peekRel(state, rel.to, p.id).friendship >= minFriendship) return true;
  }
  return false;
}

function checkDemotion(ctx: SimCtx, p: Person, career: CareerDef): void {
  const cs = p.career;
  if (!cs || cs.level <= 1 || cs.performance > DEMOTION_PERFORMANCE) return;
  const prev = careerLevelDef(ctx.content, cs.careerId, cs.level - 1);
  if (!prev) return;
  cs.level = prev.level;
  cs.performance = -10;
  ctx.events.emit({ type: 'career', personId: p.id, what: 'demoted' });
  addFeed(ctx.state, ctx.events, 'warning', `${p.firstName} was demoted to ${prev.title} (${career.name}).`, p.id);
}

// ---------------------------------------------------------------------------------------------
// Player commands (Milestone 6)
// ---------------------------------------------------------------------------------------------

export interface CareerCommandResult { ok: boolean; reason?: string }

/** Hires a household member at level 1 of a career. Returns a readable reason when that is not possible. */
export function joinCareer(ctx: SimCtx, p: Person, careerId: string): CareerCommandResult {
  if (p.isNpc) return { ok: false, reason: `${p.firstName} decides for themself.` };
  if (p.career) return { ok: false, reason: `${p.firstName} already has a job. Quit it first.` };
  const def = ctx.content.careers[careerId];
  if (!def || def.status !== 'ready' || def.levels.length === 0) return { ok: false, reason: 'That career is not available.' };
  if (def.partTime) {
    if (p.lifeStage !== 'teen') return { ok: false, reason: 'Part-time jobs are for teenagers.' };
  } else if (!isGrownStage(p.lifeStage)) {
    return { ok: false, reason: p.lifeStage === 'teen' ? 'Only part-time jobs fit around school.' : `${p.firstName} is too young for a job.` };
  }
  p.career = {
    careerId, level: 1, performance: 0, joinedAt: ctx.now, daysWorked: 0, shift: null, effort: 'normal', pendingEvent: null,
  };
  const title = careerLevelDef(ctx.content, careerId, 1)?.title ?? def.name;
  ctx.events.emit({ type: 'career', personId: p.id, what: 'joined' });
  addFeed(ctx.state, ctx.events, 'career', `${p.firstName} started work as a ${title} (${def.name}).`, p.id);
  addMoodlet(ctx.content, p, 'newJob', ctx.now, 'career');
  return { ok: true };
}

/** Leaves the current job. A running or upcoming shift is cancelled (no pay). */
export function quitCareer(ctx: SimCtx, p: Person): CareerCommandResult {
  const cs = p.career;
  if (!cs) return { ok: false, reason: `${p.firstName} does not have a job.` };
  const atWork = p.location.kind === 'offlot' && p.location.place === 'work';
  if (cs.shift && cs.shift.status !== 'done' && cs.shift.status !== 'missed') markProcessed(ctx.state, cs.shift.occurrence);
  for (const a of [...p.queue]) if (a.interactionId === 'goToWork') requestCancel(ctx, p, a.id);
  const def = ctx.content.careers[cs.careerId];
  p.career = null;
  ctx.events.emit({ type: 'career', personId: p.id, what: 'quit' });
  addFeed(ctx.state, ctx.events, 'career', `${p.firstName} quit the ${def?.name ?? 'job'}.`, p.id);
  if (atWork) returnHome(ctx, p);
  checkAspiration(ctx, p);
  return { ok: true };
}

/** Chooses how hard the person works on the next shifts. */
export function setCareerEffort(_ctx: SimCtx, p: Person, effort: WorkEffort): CareerCommandResult {
  if (!p.career) return { ok: false, reason: `${p.firstName} does not have a job.` };
  if (effort !== 'slack' && effort !== 'normal' && effort !== 'hard') return { ok: false, reason: 'Unknown work effort.' };
  p.career.effort = effort;
  return { ok: true };
}

/** The pending career event of a person, with its definition, or null. */
export function pendingCareerEvent(ctx: Pick<SimCtx, 'content'>, p: Person): { state: CareerEventState; def: NonNullable<ContentDB['careerEvents']>[string] } | null {
  const state = p.career?.pendingEvent;
  const def = state ? ctx.content.careerEvents?.[state.eventId] : undefined;
  return state && def ? { state, def } : null;
}

/** Chooses an option of the shift's on-the-job decision. Each event pays out at most once. */
export function resolveCareerEvent(ctx: SimCtx, p: Person, optionId: string): CareerCommandResult {
  const cs = p.career;
  const pending = cs?.pendingEvent;
  const def = pending ? ctx.content.careerEvents?.[pending.eventId] : undefined;
  const option = def?.options.find((o) => o.id === optionId);
  if (!cs || !pending || !def || !option) return { ok: false, reason: 'There is no work decision waiting.' };
  if (pending.chosen) return { ok: false, reason: 'That decision was already made.' };
  pending.chosen = option.id;
  const occurrence = `careerevent:${p.id}:${pending.day}`;
  if (!isProcessed(ctx.state, occurrence)) {
    markProcessed(ctx.state, occurrence);
    cs.performance = clamp(cs.performance + option.performance, -100, 100);
    if (option.pay && option.pay !== 0) {
      transact(ctx.state, ctx.events, p.householdId, option.pay, 'career',
        `${def.title} (${p.firstName})`, { occurrence: `careereventpay:${p.id}:${pending.day}`, allowDebt: option.pay < 0 });
    }
    if (option.skill) addSkillXp(ctx, p, option.skill.id, option.skill.xp);
    if (option.moodlet) addMoodlet(ctx.content, p, option.moodlet, ctx.now, 'career');
    ctx.events.emit({ type: 'career', personId: p.id, what: 'event', amount: option.pay });
    addFeed(ctx.state, ctx.events, 'career', `${p.firstName} ${option.result}`, p.id);
  }
  return { ok: true };
}

/**
 * Where a worker goes when the shift ends (Milestone 7): back to the lot the household is on now (they may have gone
 * to work from a venue), or home when they set out from their home while the household was elsewhere. Workers of a
 * household outside the player's control always go home.
 */
function returnLot(ctx: SimCtx, p: Person): Lot | undefined {
  const hh = householdOf(ctx, p);
  const home = hh?.homeLotId ? ctx.state.lots[hh.homeLotId] : undefined;
  if (!hh || hh.id !== ctx.state.activeHouseholdId) return home;
  const active = ctx.state.lots[ctx.state.activeLotId];
  const from = p.location.kind === 'offlot' ? p.location.lotId : undefined;
  if (home && from === home.id && home.id !== active?.id) return home;
  return active ?? home;
}

/** Puts a returning person at the entry of the lot they come back to and lets them walk in. */
export function returnHome(ctx: SimCtx, p: Person): void {
  const lot = returnLot(ctx, p);
  if (!lot) {
    p.location = { kind: 'offlot', place: 'home', since: ctx.now, until: null };
    return;
  }
  const lotId = lot.id;
  if (lotId !== ctx.state.activeLotId) {
    // The household is elsewhere: the worker is simply at home again (off-lot).
    p.location = { kind: 'offlot', place: 'home', lotId, since: ctx.now, until: null };
    setAnim(p, 'idle', ctx.now);
    ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'location' });
    ctx.events.emit({ type: 'career', personId: p.id, what: 'returned' });
    return;
  }
  const x = lot.entry.x + 0.5, z = lot.entry.z + 0.5;
  p.location = {
    kind: 'lot', lotId, level: lot.entry.level, x, z, posture: 'standing',
    facing: facingTo(x, z, lot.width / 2, lot.depth / 2),
  };
  setAnim(p, 'idle', ctx.now);
  ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'location' });
  ctx.events.emit({ type: 'career', personId: p.id, what: 'returned' });
  const t = walkInTile(ctx, p);
  if (t) insertAction(ctx, p, makeAction(ctx, p, { interactionId: 'goHere', target: { kind: 'tile', x: t.x, z: t.z, level: lot.entry.level } }, 'schedule'));
}
