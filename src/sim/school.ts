// School (Milestone 8). Children and teens go to school on weekdays (content/school.ts), following the careers pattern
// (sim/careers.ts): a school day has the occurrence `school:<personId>:<day>`; the pupil sets off for school
// SCHOOL_COMMUTE_LEAD_MINUTES before the bell (`goToSchool`, queued automatically while on the lot), is away
// ("At school", off-lot) until the end, and comes home to homework. A pupil who has not left SCHOOL_MISS_AFTER_MINUTES
// after the start has missed the day.
//
// Weekends and one week off after every four school weeks are holidays. Homework is done once per school day (an interaction at a
// desk, table or computer, or a parent helping): `SchoolState.homeworkDay` is the latest school day whose homework is
// finished. A weekly report card (occurrence `report:<personId>:<week>`) gives a grade letter and a moodlet.
//
// Everyone outside the player's household (townlife.lightSchool) follows the same days without walking: they are "at
// school" during school hours and the day is counted from the clock.
//
// SchoolState.performance (-100..100) rises with attendance and homework and falls with missed days, missed homework and a low
// mood at the start of the day.

import type { ContentDB, SchoolDef } from '../content/types';
import { atDayMinute, dayIndex, formatClock, weekday, DAY_NAMES } from '../core/clock';
import { isSchoolStage } from '../core/lifeStages';
import { addFeed, isProcessed, markProcessed } from '../core/state';
import type { GameMinutes, Person, SchoolState, WorldState } from '../core/types';
import { abortQueue, requestCancel } from './actions';
import type { SimCtx } from './context';
import { clamp, householdOf, lotLoc, setAnim } from './context';
import { returnHome } from './careers';
import { addMoodlet, computeMood } from './mood';
import { insertAction, makeAction } from './queue';
import { addMemory } from './relationships';
import { addSkillXp } from './skills';
import {
  SCHOOL_ATTEND_PERFORMANCE, SCHOOL_COMMUTE_LEAD_MINUTES, SCHOOL_HIGH_MOOD, SCHOOL_HOMEWORK_HELP_BONUS, SCHOOL_HOMEWORK_MISSED_PERFORMANCE,
  SCHOOL_HOMEWORK_PERFORMANCE, SCHOOL_LOW_MOOD, SCHOOL_MISSED_PERFORMANCE, SCHOOL_MISS_AFTER_MINUTES, SCHOOL_WEEKS_ON,
} from './tuning';

export interface SchoolWindow {
  occurrence: string;
  day: number;
  start: GameMinutes;
  end: GameMinutes;
  school: SchoolDef;
}

/** The school of a life stage ('elementary' for children, 'high' for teens), or undefined. */
export function schoolForStage(content: Pick<ContentDB, 'schools'>, stage: Person['lifeStage']): SchoolDef | undefined {
  return Object.values(content.schools ?? {}).find((s) => s.status === 'ready' && s.stages.includes(stage));
}

/** A fresh school record for a person of a school stage (null for other stages). */
export function newSchoolState(content: Pick<ContentDB, 'schools'>, stage: Person['lifeStage'], performance = 0): SchoolState | null {
  if (!isSchoolStage(stage)) return null;
  const def = schoolForStage(content, stage);
  return def ? { schoolId: def.id, performance, homeworkDay: -1, attended: 0, missed: 0 } : null;
}

/** Gives a child or teen a school record when they have none or the wrong one; clears it for everybody else. */
export function ensureSchool(content: Pick<ContentDB, 'schools'>, p: Person): void {
  if (!isSchoolStage(p.lifeStage)) { if (p.school) p.school = null; return; }
  const def = schoolForStage(content, p.lifeStage);
  if (!def) return;
  if (!p.school) p.school = newSchoolState(content, p.lifeStage);
  else if (p.school.schoolId !== def.id) p.school = { ...p.school, schoolId: def.id, homeworkDay: -1 };
}

/** True on a holiday week: after every SCHOOL_WEEKS_ON school weeks one week is off (week 0 is the first school week). */
export function schoolHoliday(day: number): boolean {
  return Math.floor(day / 7) % (SCHOOL_WEEKS_ON + 1) === SCHOOL_WEEKS_ON;
}

/** The person's school on a given day (null at weekends, in holidays and for people who do not go to school). */
export function schoolDayOn(content: ContentDB, p: Person, day: number): SchoolWindow | null {
  if (day < 0 || !p.school || !isSchoolStage(p.lifeStage)) return null;
  const def = content.schools?.[p.school.schoolId];
  if (!def || def.status !== 'ready') return null;
  if (!def.days.includes(weekday(atDayMinute(day, 0))) || schoolHoliday(day)) return null;
  return { occurrence: `school:${p.id}:${day}`, day, start: atDayMinute(day, def.start), end: atDayMinute(day, def.end), school: def };
}

/** The next school day that has not ended yet. */
export function nextSchoolDay(state: WorldState, content: ContentDB, p: Person, from: GameMinutes): SchoolWindow | null {
  const today = dayIndex(from);
  for (let d = today; d <= today + 16; d++) {
    const w = schoolDayOn(content, p, d);
    if (w && w.end > from && !isProcessed(state, w.occurrence)) return w;
  }
  return null;
}

/** Letter grade of a performance value. */
export function gradeLetter(performance: number): string {
  return performance >= 60 ? 'A' : performance >= 30 ? 'B' : performance >= 0 ? 'C' : performance >= -30 ? 'D' : 'F';
}

const missDeadline = (w: SchoolWindow): GameMinutes => w.start + SCHOOL_MISS_AFTER_MINUTES;

function attending(p: Person): boolean { return p.location.kind === 'offlot' && p.location.place === 'school'; }

/** The school day that can be set out for right now (goToSchool), or null. */
export function commutableSchool(ctx: Pick<SimCtx, 'state' | 'content' | 'now'>, p: Person): SchoolWindow | null {
  const w = schoolDayOn(ctx.content, p, dayIndex(ctx.now));
  if (!w || isProcessed(ctx.state, w.occurrence)) return null;
  if (ctx.now < w.start - SCHOOL_COMMUTE_LEAD_MINUTES - 15 || ctx.now >= missDeadline(w)) return null;
  return w;
}

// ---------------------------------------------------------------------------------------------
// Homework
// ---------------------------------------------------------------------------------------------

/** The school day whose homework is still to do: the latest attended day (within a week) after `homeworkDay`, or null. */
export function homeworkDueDay(state: WorldState, content: ContentDB, p: Person, now: GameMinutes): number | null {
  if (!p.school) return null;
  const today = dayIndex(now);
  for (let d = today; d >= Math.max(0, today - 7); d--) {
    const w = schoolDayOn(content, p, d);
    if (!w) continue;
    if (isProcessed(state, `schoolatt:${p.id}:${d}`)) return p.school.homeworkDay < d ? d : null;
  }
  return null;
}

/** Why homework cannot be done now, or null. */
export function homeworkProblem(ctx: Pick<SimCtx, 'state' | 'content' | 'now'>, p: Person): string | null {
  if (!isSchoolStage(p.lifeStage) || !p.school) return `${p.firstName} has no homework.`;
  if (homeworkDueDay(ctx.state, ctx.content, p, ctx.now) === null) {
    const w = nextSchoolDay(ctx.state, ctx.content, p, ctx.now);
    return w && w.day === dayIndex(ctx.now) && ctx.now < w.end ? 'Homework comes after school.' : 'No homework right now.';
  }
  return null;
}

/**
 * Finishes the homework of the latest school day. Once only per school day (`homework:<personId>:<day>`): the performance
 * and moodlet pay-off are never repeated. `help` adds the bonus of a helper. Returns false when nothing was due.
 */
export function completeHomework(ctx: SimCtx, p: Person, help = false): boolean {
  const day = homeworkDueDay(ctx.state, ctx.content, p, ctx.now);
  if (day === null || !p.school) return false;
  p.school.homeworkDay = day;
  const occ = `homework:${p.id}:${day}`;
  if (!isProcessed(ctx.state, occ)) {
    markProcessed(ctx.state, occ);
    p.school.performance = clamp(p.school.performance + SCHOOL_HOMEWORK_PERFORMANCE + (help ? SCHOOL_HOMEWORK_HELP_BONUS : 0), -100, 100);
    addMoodlet(ctx.content, p, 'homeworkDone', ctx.now, 'school');
    addSkillXp(ctx, p, 'logic', 8);
    ctx.events.emit({ type: 'school', personId: p.id, what: 'homework' });
    if (householdOf(ctx, p)?.isPlayable) addFeed(ctx.state, ctx.events, 'info', `${p.firstName} finished the homework${help ? ' with some help' : ''}.`, p.id);
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// The school day of a pupil in the player's household
// ---------------------------------------------------------------------------------------------

/** Per-tick school processing for the household the player runs (simulation flow step 3). */
export function updateSchool(ctx: SimCtx): void {
  const today = dayIndex(ctx.now);
  for (const p of Object.values(ctx.state.people)) {
    if (p.isNpc || !isSchoolStage(p.lifeStage)) continue;
    if (!p.school) ensureSchool(ctx.content, p);
    const w = schoolDayOn(ctx.content, p, today);
    if (!w || isProcessed(ctx.state, w.occurrence)) continue;
    if (attending(p)) {
      if (ctx.now >= w.end) endSchoolDay(ctx, p, w);
      continue;
    }
    if (ctx.now < w.start - SCHOOL_COMMUTE_LEAD_MINUTES) continue;
    if (ctx.now >= w.start) checkMissedHomework(ctx, p, w);
    if (ctx.now >= missDeadline(w)) { missSchoolDay(ctx, p, w); continue; }
    const key = `schoolgo:${p.id}:${w.day}`;
    if (isProcessed(ctx.state, key)) continue;
    if (lotLoc(p)) {
      markProcessed(ctx.state, key);
      if (!p.queue.some((a) => a.interactionId === 'goToSchool')) {
        insertAction(ctx, p, makeAction(ctx, p, { interactionId: 'goToSchool', target: { kind: 'self' } }, 'schedule'));
      }
    } else if (p.location.kind === 'offlot' && p.location.place === 'home' && !p.location.transit) {
      // Left at home while the household is out: they set off from there, with nobody to walk.
      markProcessed(ctx.state, key);
      startSchoolDay(ctx, p, '');
    }
  }
}

/** The homework of the previous school day was not done by the time the next one begins: performance drops once. */
function checkMissedHomework(ctx: SimCtx, p: Person, w: SchoolWindow): void {
  if (!p.school) return;
  for (let d = w.day - 1; d >= Math.max(0, w.day - 8); d--) {
    if (!schoolDayOn(ctx.content, p, d)) continue;
    if (isProcessed(ctx.state, `schoolatt:${p.id}:${d}`) && p.school.homeworkDay < d) {
      const occ = `homeworkmiss:${p.id}:${d}`;
      if (!isProcessed(ctx.state, occ)) {
        markProcessed(ctx.state, occ);
        p.school.performance = clamp(p.school.performance + SCHOOL_HOMEWORK_MISSED_PERFORMANCE, -100, 100);
      }
    }
    return;
  }
}

/** Called when the commuting pupil reaches the lot entry: they go off-lot and are at school. */
export function startSchoolDay(ctx: SimCtx, p: Person, keepActionId: string): void {
  const w = commutableSchool(ctx, p);
  if (!w || !p.school) return;
  checkMissedHomework(ctx, p, w);
  const late = Math.max(0, ctx.now - w.start);
  const mood = computeMood(ctx.content, p).value;
  if (mood <= SCHOOL_LOW_MOOD) p.school.performance = clamp(p.school.performance - 1.5, -100, 100);
  else if (mood >= SCHOOL_HIGH_MOOD) p.school.performance = clamp(p.school.performance + 0.5, -100, 100);
  if (late > 20) p.school.performance = clamp(p.school.performance - Math.min(2, late / 30), -100, 100);
  abortQueue(ctx, p, null, keepActionId);
  const origin = p.location.kind === 'lot' ? p.location.lotId : p.location.lotId ?? householdOf(ctx, p)?.homeLotId ?? undefined;
  p.location = { kind: 'offlot', place: 'school', ...(origin ? { lotId: origin } : {}), since: ctx.now, until: w.end };
  p.thought = null;
  setAnim(p, 'idle', ctx.now);
  ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'location' });
  ctx.events.emit({ type: 'school', personId: p.id, what: 'left' });
  addFeed(ctx.state, ctx.events, 'info', `${p.firstName} left for school.`, p.id);
}

/** Counts an attended school day and brings the pupil home. */
function endSchoolDay(ctx: SimCtx, p: Person, w: SchoolWindow): void {
  markProcessed(ctx.state, w.occurrence);
  markProcessed(ctx.state, `schoolatt:${p.id}:${w.day}`);
  if (p.school) {
    p.school.attended += 1;
    p.school.performance = clamp(p.school.performance + SCHOOL_ATTEND_PERFORMANCE, -100, 100);
  }
  addSkillXp(ctx, p, 'logic', 6);
  returnHome(ctx, p);
  ctx.events.emit({ type: 'school', personId: p.id, what: 'returned' });
  addFeed(ctx.state, ctx.events, 'info', `${p.firstName} came home from school with homework.`, p.id);
}

function missSchoolDay(ctx: SimCtx, p: Person, w: SchoolWindow): void {
  markProcessed(ctx.state, w.occurrence);
  if (p.school) {
    p.school.missed += 1;
    p.school.performance = clamp(p.school.performance + SCHOOL_MISSED_PERFORMANCE, -100, 100);
  }
  for (const a of [...p.queue]) if (a.interactionId === 'goToSchool') requestCancel(ctx, p, a.id);
  addMoodlet(ctx.content, p, 'missedSchool', ctx.now, 'school');
  ctx.events.emit({ type: 'school', personId: p.id, what: 'missed' });
  addFeed(ctx.state, ctx.events, 'warning', `${p.firstName} missed school today.`, p.id);
}

/**
 * Marks the pupil as being at school without any walking (the light schedule of people outside the player's household,
 * Milestone 7 style). Attendance is counted later by `lightSchool`.
 */
export function beginLightSchool(ctx: SimCtx, p: Person): void {
  const w = schoolDayOn(ctx.content, p, dayIndex(ctx.now));
  if (w && p.location.kind === 'offlot' && p.location.place === 'school') p.location.until = w.end;
}

/** Counts finished school days of everyone outside the player's household (once per occurrence). */
export function lightSchool(ctx: SimCtx, isLight: (p: Person) => boolean): void {
  const today = dayIndex(ctx.now);
  for (const p of Object.values(ctx.state.people)) {
    if (!isLight(p) || !isSchoolStage(p.lifeStage)) continue;
    if (!p.school) ensureSchool(ctx.content, p);
    for (const d of [today - 1, today]) {
      const w = schoolDayOn(ctx.content, p, d);
      if (!w || ctx.now < w.end || isProcessed(ctx.state, w.occurrence)) continue;
      markProcessed(ctx.state, w.occurrence);
      markProcessed(ctx.state, `schoolatt:${p.id}:${d}`);
      if (p.school) {
        p.school.attended += 1;
        p.school.homeworkDay = Math.max(p.school.homeworkDay, d); // townspeople do their homework by themselves
        p.school.performance = clamp(p.school.performance + 2, -100, 100);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Report cards
// ---------------------------------------------------------------------------------------------

/**
 * Weekly report card, issued on Monday for the week that ended (`report:<personId>:<week>`, once only): a grade letter,
 * a moodlet for A/B and D/F and a memory. Weeks without school (holidays) have none. Called from the daily rollover.
 */
export function reportCards(ctx: SimCtx, day: number): void {
  if (weekday(atDayMinute(day, 0)) !== 0 || day < 7) return;
  const week = Math.floor(day / 7) - 1;
  for (const p of Object.values(ctx.state.people)) {
    const s = p.school;
    if (!s || !isSchoolStage(p.lifeStage)) continue;
    const occ = `report:${p.id}:${week}`;
    if (isProcessed(ctx.state, occ)) continue;
    let counted = false;
    for (let d = week * 7; d < week * 7 + 5; d++) if (isProcessed(ctx.state, `school:${p.id}:${d}`)) counted = true;
    if (!counted) continue;
    markProcessed(ctx.state, occ);
    const grade = gradeLetter(s.performance);
    s.lastGrade = grade;
    s.reportWeek = week;
    if (grade === 'A' || grade === 'B') addMoodlet(ctx.content, p, 'goodReport', ctx.now, 'school');
    else if (grade === 'D' || grade === 'F') addMoodlet(ctx.content, p, 'badReport', ctx.now, 'school');
    addMemory(ctx.state, p, { kind: 'report', importance: 1, text: `Report card: ${grade}` });
    ctx.events.emit({ type: 'school', personId: p.id, what: 'report', grade });
    if (householdOf(ctx, p)?.isPlayable) {
      const note = grade === 'A' ? 'Outstanding!' : grade === 'B' ? 'Well done.' : grade === 'C' ? 'Doing fine.' : grade === 'D' ? 'Needs to try harder.' : 'Struggling; homework and attendance would help.';
      addFeed(ctx.state, ctx.events, 'family', `${p.firstName}'s report card this week: ${grade}. ${note}`, p.id);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// For the interface
// ---------------------------------------------------------------------------------------------

export type SchoolStatus = 'none' | 'holiday' | 'weekend' | 'upcoming' | 'atSchool' | 'done' | 'missed';

export interface SchoolInfo {
  schoolName: string;
  hours: string;
  days: string;
  performance: number;
  grade: string;
  lastGrade: string | null;
  attended: number;
  missed: number;
  status: SchoolStatus;
  /** One line about today ("School starts at 8:00 AM"). */
  statusText: string;
  next: SchoolWindow | null;
  homeworkDue: boolean;
  /** Shown when homework cannot be done now. */
  homeworkText: string;
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatDayRange(days: number[]): string {
  if (days.length === 0) return '';
  const sorted = [...days].sort((a, b) => a - b);
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1]! + 1);
  return consecutive && sorted.length > 1 ? `${DAY_SHORT[sorted[0]!]} to ${DAY_SHORT[sorted[sorted.length - 1]!]}` : sorted.map((d) => DAY_SHORT[d]).join(', ');
}

/** Everything the School tab shows for a child or teen; null for other stages. */
export function schoolInfo(state: WorldState, content: ContentDB, p: Person): SchoolInfo | null {
  if (!isSchoolStage(p.lifeStage) || !p.school) return null;
  const def = content.schools?.[p.school.schoolId];
  if (!def) return null;
  const now = state.clock.minutes;
  const today = dayIndex(now);
  const todayW = schoolDayOn(content, p, today);
  const next = nextSchoolDay(state, content, p, now);
  let status: SchoolStatus;
  let statusText: string;
  const weekend = weekday(now) >= 5;
  const hh = (m: number) => formatClock(atDayMinute(0, m));
  if (!todayW) {
    status = weekend ? 'weekend' : schoolHoliday(today) ? 'holiday' : 'none';
    statusText = status === 'weekend' ? 'No school at the weekend.' : status === 'holiday' ? 'School holiday this week.' : 'No school today.';
  } else if (attending(p)) {
    status = 'atSchool';
    statusText = `At school until ${hh(def.end)}.`;
  } else if (isProcessed(state, `schoolatt:${p.id}:${today}`)) {
    status = 'done';
    statusText = 'School is over for today.';
  } else if (isProcessed(state, todayW.occurrence) || now >= missDeadline(todayW)) {
    status = 'missed';
    statusText = 'Missed school today.';
  } else {
    status = 'upcoming';
    statusText = `School starts at ${hh(def.start)}.`;
  }
  const due = homeworkDueDay(state, content, p, now) !== null;
  const nextText = next ? `Next school day: ${DAY_NAMES[weekday(next.start)]} ${formatClock(next.start)}.` : '';
  return {
    schoolName: def.name, hours: `${hh(def.start)} to ${hh(def.end)}`, days: formatDayRange(def.days),
    performance: p.school.performance, grade: gradeLetter(p.school.performance), lastGrade: p.school.lastGrade ?? null,
    attended: p.school.attended, missed: p.school.missed, status, statusText: status === 'upcoming' || status === 'atSchool' ? statusText : `${statusText} ${nextText}`.trim(), next,
    homeworkDue: due, homeworkText: due ? 'Homework is due. Do it at a desk, table or computer.' : 'No homework right now.',
  };
}

