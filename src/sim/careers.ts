// Off-lot careers. Each working day has a shift occurrence `shift:<personId>:<day>`. goToWork is queued
// automatically 45 minutes before the start while the person is on the lot (the player may cancel it);
// reaching the lot entry puts the person "at work" off-lot until the shift ends. Late arrival shortens
// the paid time; not arriving by the shift's midpoint is a missed shift. Pay is applied once per shift
// with occurrence `pay:<personId>:<day>`. Performance comes from mood at the shift start, skills,
// punctuality and completion; promotions and demotions emit events.
//
// CareerLevelDef.promotion holds the requirements to advance FROM that level to the next one.

import type { CareerDef, CareerLevelDef, ContentDB } from '../content/types';
import { TICK_MINUTES, atDayMinute, dayIndex, formatClock, weekday, DAY_NAMES } from '../core/clock';
import { facingTo } from '../core/geometry';
import { addFeed, isProcessed, markProcessed, transact } from '../core/state';
import type { GameMinutes, Person, WorldState } from '../core/types';
import { abortQueue, requestCancel } from './actions';
import { checkAspiration } from './aspirations';
import type { SimCtx } from './context';
import { clamp, householdOf, lotLoc, setAnim } from './context';
import { addMoodlet, computeMood } from './mood';
import { insertAction, makeAction } from './queue';
import { addMemory } from './relationships';
import {
  COMMUTE_LEAD_MINUTES, DEMOTION_PERFORMANCE, MISSED_SHIFT_PERFORMANCE, SHIFT_WINDOW_MINUTES,
} from './tuning';
import { walkInTile } from './travel';

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
    if (w && w.end > from && !isProcessed(state, w.occurrence)) return w;
  }
  return null;
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
    if (!w || isProcessed(ctx.state, w.occurrence)) continue;
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
      if (!w || ctx.now >= w.end || isProcessed(ctx.state, w.occurrence)) continue;
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
  // Performance from mood at the start of the shift and work-related traits.
  const mood = computeMood(ctx.content, p).value;
  let traitBonus = 0;
  for (const t of p.traits) traitBonus += ctx.content.traits[t]?.effects.workPerformance ?? 0;
  cs.performance = clamp(cs.performance + (mood / 100) * 6 + traitBonus, -100, 100);
  abortQueue(ctx, p, null, keepActionId);
  p.location = { kind: 'offlot', place: 'work', since: ctx.now, until: w.end };
  p.thought = null;
  setAnim(p, 'idle', ctx.now);
  ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'location' });
  ctx.events.emit({ type: 'career', personId: p.id, what: 'leftForWork' });
  if (late > 0) ctx.events.emit({ type: 'career', personId: p.id, what: 'late' });
  addFeed(ctx.state, ctx.events, 'career', late > 0
    ? `${p.firstName} left for work ${Math.round(late)} min late.`
    : `${p.firstName} left for work.`, p.id);
}

function endShift(ctx: SimCtx, p: Person, w: ShiftWindow): void {
  const cs = p.career;
  if (!cs?.shift) return;
  const sh = cs.shift;
  sh.status = 'done';
  markProcessed(ctx.state, w.occurrence);
  const len = w.end - w.start;
  const worked = clamp(sh.workedMinutes, 0, len);
  const pay = Math.round((w.level.hourlyWage * worked) / 60);
  if (pay > 0) {
    transact(ctx.state, ctx.events, p.householdId, pay, 'wage', `${w.career.name} wage (${p.firstName})`, { occurrence: `pay:${p.id}:${w.day}` });
  }
  ctx.events.emit({ type: 'career', personId: p.id, what: 'paid', amount: pay });
  if (pay > 0) addMoodlet(ctx.content, p, 'payday', ctx.now, 'career');
  // Performance: completion, punctuality and skills.
  const completion = len > 0 ? worked / len : 0;
  let delta = completion >= 0.95 ? 4 : completion * 6 - 3;
  delta -= Math.min(10, sh.lateMinutes / 6);
  const req = Object.entries(w.level.promotion.skills);
  if (req.length > 0) {
    let s = 0;
    for (const [skill, lvl] of req) s += Math.min(1, (p.skills[skill]?.level ?? 0) / Math.max(1, lvl));
    delta += (s / req.length) * 2;
  } else delta += 1;
  cs.performance = clamp(cs.performance + delta, -100, 100);
  cs.daysWorked += 1;
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
  if (cs.performance >= cur.promotion.performance && skillsOk) {
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

/** Puts a returning person at their home lot's entry and lets them walk in. */
function returnHome(ctx: SimCtx, p: Person): void {
  const hh = householdOf(ctx, p);
  const lotId = hh?.homeLotId ?? ctx.state.activeLotId;
  const lot = ctx.state.lots[lotId];
  if (!lot) {
    p.location = { kind: 'offlot', place: 'home', since: ctx.now, until: null };
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
