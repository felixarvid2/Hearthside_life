import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, atDayMinute } from '../../../src/core/clock';
import { isProcessed } from '../../../src/core/state';
import { SCHOOLS } from '../../../src/content/school';
import {
  completeHomework, gradeLetter, homeworkDueDay, homeworkProblem, lightSchool, reportCards, schoolDayOn, schoolHoliday, schoolInfo,
} from '../../../src/sim/school';
import { plannedPlace } from '../../../src/sim/townlife';
import { pureCtx, runTicks, runUntil, setNeeds } from './fixtures';
import { addMember, familyWorld } from './familyFixtures';

const WEEK = 7 * MINUTES_PER_DAY;

function schoolWorld(startMinute = 7 * 60) {
  const fw = familyWorld({ startMinute });
  const hh = fw.w.state.activeHouseholdId;
  const kid = addMember(fw, hh, 'Kit', { lifeStage: 'child' }, { x: 8, z: 8 });
  setNeeds(fw.w.state, kid.id, 90);
  setNeeds(fw.w.state, fw.w.mira, 90);
  setNeeds(fw.w.state, fw.w.theo, 90);
  return { fw, kid: kid.id, state: fw.w.state, hh };
}

describe('school days', () => {
  it('are weekdays, except one holiday week after every four school weeks', () => {
    expect(SCHOOLS.map((s) => s.id)).toEqual(['elementary', 'high']);
    const { fw, state, kid } = schoolWorld();
    const p = state.people[kid]!;
    const on = (day: number) => schoolDayOn(fw.content, p, day) !== null;
    expect([0, 1, 2, 3, 4].map(on)).toEqual([true, true, true, true, true]);
    expect([5, 6].map(on)).toEqual([false, false]); // weekend
    expect(on(7 * 3 + 4)).toBe(true); // Friday of week 4
    expect([28, 29, 30, 31, 32, 33, 34].map(on)).toEqual(Array(7).fill(false)); // the holiday week
    expect(on(35)).toBe(true);
    expect([0, 4, 5].map(schoolHoliday)).toEqual([false, false, false]);
    expect(schoolHoliday(28)).toBe(true);
    const w = schoolDayOn(fw.content, p, 0)!;
    expect([w.start, w.end]).toEqual([atDayMinute(0, 8 * 60), atDayMinute(0, 14 * 60)]);
  });

  it('send teens to the high school (to 15:00) and nobody else to school', () => {
    const { fw, state, hh } = schoolWorld();
    const teen = addMember(fw, hh, 'Tess', { lifeStage: 'teen' });
    expect(teen.school?.schoolId).toBe('high');
    expect(schoolDayOn(fw.content, teen, 0)!.end).toBe(atDayMinute(0, 15 * 60));
    expect(state.people[fw.w.mira]!.school ?? null).toBeNull();
    const baby = addMember(fw, hh, 'Bea', { lifeStage: 'baby' });
    expect(baby.school ?? null).toBeNull();
    expect(schoolDayOn(fw.content, baby, 0)).toBeNull();
  });
});

describe('attendance', () => {
  it('the pupil leaves ahead of the bell, is away at school and comes home; the day counts once', () => {
    const { fw, kid, state } = schoolWorld();
    const pupil = () => state.people[kid]!;
    runUntil(fw.h, () => pupil().queue[0]?.interactionId === 'goToSchool', 4 * 60);
    expect(state.clock.minutes).toBeGreaterThanOrEqual(atDayMinute(0, 7 * 60 + 15)); // 45 minutes before the bell
    expect(state.clock.minutes).toBeLessThan(atDayMinute(0, 7 * 60 + 20));
    runUntil(fw.h, () => pupil().location.kind === 'offlot', 4 * 60);
    expect(pupil().location).toMatchObject({ kind: 'offlot', place: 'school', until: atDayMinute(0, 14 * 60) });
    expect(fw.h.sim.whereIs(kid)?.text).toBe('At school');
    expect(fw.h.log.filter((e) => e.type === 'school' && e.what === 'left')).toHaveLength(1);
    runUntil(fw.h, () => state.clock.minutes >= atDayMinute(0, 14 * 60 + 1), 4 * 60 * 8);
    expect(pupil().location.kind).toBe('lot');
    expect(pupil().school).toMatchObject({ attended: 1, missed: 0 });
    expect(pupil().school!.performance).toBeGreaterThan(0);
    expect(isProcessed(state, `school:${kid}:0`)).toBe(true);
    expect(isProcessed(state, `schoolatt:${kid}:0`)).toBe(true);
    const perf = pupil().school!.performance;
    runTicks(fw.h, 4 * 60);
    expect(pupil().school).toMatchObject({ attended: 1, missed: 0 });
    expect(pupil().school!.performance).toBe(perf);
    expect(fw.h.log.filter((e) => e.type === 'school' && e.what === 'returned')).toHaveLength(1);
  });

  it('a pupil who has not left by 09:30 has missed the day, once, with a penalty and a warning', () => {
    const { fw, kid, state } = schoolWorld(9 * 60 + 31);
    runTicks(fw.h, 4);
    const s = state.people[kid]!.school!;
    expect(s.missed).toBe(1);
    expect(s.attended).toBe(0);
    expect(s.performance).toBeLessThan(0);
    expect(state.people[kid]!.moodlets.some((m) => m.id === 'missedSchool')).toBe(true);
    expect(state.feed.filter((f) => f.kind === 'warning' && /missed school/.test(f.text))).toHaveLength(1);
    runTicks(fw.h, 40);
    expect(state.people[kid]!.school!.missed).toBe(1);
  });

  it('nobody goes to school at the weekend or in a holiday week', () => {
    const { fw, kid, state } = schoolWorld(5 * MINUTES_PER_DAY + 7 * 60);
    runTicks(fw.h, 4 * 120);
    expect(state.people[kid]!.location.kind).toBe('lot');
    expect(state.people[kid]!.school).toMatchObject({ attended: 0, missed: 0 });
    const hol = schoolWorld(28 * MINUTES_PER_DAY + 7 * 60);
    runTicks(hol.fw.h, 4 * 120);
    expect(hol.state.people[hol.kid]!.school).toMatchObject({ attended: 0, missed: 0 });
  });

  it('lets the household keep playing while the pupil is away: the pupil sleeps in time for school', () => {
    const { fw, kid, state } = schoolWorld(6 * 60);
    expect(state.people[kid]!.school).toBeTruthy();
    runTicks(fw.h, 4 * 60 * 3);
    expect(state.people[kid]!.school!.missed).toBe(0);
  });
});

describe('homework', () => {
  const afterSchool = () => {
    const sw = schoolWorld(7 * 60);
    runUntil(sw.fw.h, () => sw.state.clock.minutes >= atDayMinute(0, 14 * 60 + 1), 4 * 60 * 9);
    return sw;
  };

  it('is due once the school day was attended, and not before', () => {
    const sw = schoolWorld(7 * 60);
    const ctx = pureCtx(sw.fw.h);
    const p = sw.state.people[sw.kid]!;
    expect(homeworkDueDay(sw.state, sw.fw.content, p, ctx.now)).toBeNull();
    expect(homeworkProblem(ctx, p)).toBe('Homework comes after school.');
    const { fw, kid, state } = afterSchool();
    expect(homeworkDueDay(state, fw.content, state.people[kid]!, state.clock.minutes)).toBe(0);
    expect(homeworkProblem(pureCtx(fw.h), state.people[kid]!)).toBeNull();
  });

  it('the pay-off (performance and moodlet) is once only per school day, with extra for a helper', () => {
    const { fw, kid, state } = afterSchool();
    const ctx = pureCtx(fw.h);
    const p = state.people[kid]!;
    const before = p.school!.performance;
    expect(completeHomework(ctx, p, true)).toBe(true);
    expect(p.school!.performance).toBeCloseTo(before + 7, 5);
    expect(p.school!.homeworkDay).toBe(0);
    expect(p.moodlets.filter((m) => m.id === 'homeworkDone')).toHaveLength(1);
    expect(completeHomework(ctx, p, false)).toBe(false); // nothing is due any more
    expect(p.school!.performance).toBeCloseTo(before + 7, 5);
    expect(homeworkProblem(ctx, p)).toBe('No homework right now.');
    // a stale save that forgot homeworkDay cannot pay twice
    p.school!.homeworkDay = -1;
    expect(completeHomework(ctx, p, false)).toBe(true);
    expect(p.school!.performance).toBeCloseTo(before + 7, 5);
  });

  it('is done at a desk by the pupil (Do Homework) and counted once', () => {
    const { fw, kid, state } = afterSchool();
    setNeeds(state, kid, 90);
    const r = fw.h.sim.doHomework(kid);
    expect(r.ok).toBe(true);
    const before = state.people[kid]!.school!.performance;
    runUntil(fw.h, () => state.people[kid]!.school!.homeworkDay === 0, 4 * 120);
    expect(state.people[kid]!.school!.performance).toBeCloseTo(before + 5, 5);
    expect(fw.h.log.filter((e) => e.type === 'school' && e.what === 'homework')).toHaveLength(1);
    expect(fw.h.sim.doHomework(kid).ok).toBe(false);
  });

  it('missed homework costs performance once when the next school day begins', () => {
    const { fw, kid, state } = afterSchool();
    const before = state.people[kid]!.school!.performance;
    runUntil(fw.h, () => state.clock.minutes >= atDayMinute(1, 7 * 60 + 30), 4 * 60 * 20);
    expect(isProcessed(state, `homeworkmiss:${kid}:0`)).toBe(true);
    expect(state.people[kid]!.school!.performance).toBeLessThan(before);
    const after = state.people[kid]!.school!.performance;
    runTicks(fw.h, 40);
    expect(state.people[kid]!.school!.performance).toBeGreaterThanOrEqual(after - 3); // only the new day's own effects
  });
});

describe('report cards', () => {
  it('give a grade letter and a moodlet once a week', () => {
    expect([80, 45, 10, -10, -80].map(gradeLetter)).toEqual(['A', 'B', 'C', 'D', 'F']);
    const { fw, kid, state } = schoolWorld(7 * 60);
    const p = state.people[kid]!;
    runUntil(fw.h, () => state.clock.minutes >= atDayMinute(0, 14 * 60 + 1), 4 * 60 * 9);
    p.school!.performance = 65;
    const ctx = pureCtx(fw.h);
    ctx.now = atDayMinute(7, 0);
    reportCards(ctx, 6); // not a Monday
    expect(p.school!.lastGrade).toBeUndefined();
    reportCards(ctx, 7);
    expect(p.school).toMatchObject({ lastGrade: 'A', reportWeek: 0 });
    expect(p.moodlets.some((m) => m.id === 'goodReport')).toBe(true);
    expect(state.feed.filter((f) => f.kind === 'family' && /report card/.test(f.text))).toHaveLength(1);
    reportCards(ctx, 7);
    expect(state.feed.filter((f) => /report card/.test(f.text))).toHaveLength(1);
    expect(p.memories.filter((m) => m.kind === 'report')).toHaveLength(1);
    expect(isProcessed(state, `report:${kid}:0`)).toBe(true);
    // a week without school (a holiday) has no report card
    p.school!.lastGrade = undefined;
    ctx.now = atDayMinute(35, 0);
    reportCards(ctx, 35);
    expect(p.school!.lastGrade).toBeUndefined();
  });

  it('arrive through the daily rollover', () => {
    const { fw, kid, state } = schoolWorld(7 * 60);
    state.people[kid]!.school!.performance = 0;
    // a quiet week: mark Monday attended and run to the next Monday morning
    state.processed[`school:${kid}:0`] = 0;
    runUntil(fw.h, () => state.clock.minutes >= WEEK + 5, 4 * 60 * 24 * 7 + 100);
    expect(state.people[kid]!.school!.lastGrade).toBeDefined();
  });

  it('shows the pupil their school info', () => {
    const { fw, kid, state } = schoolWorld(7 * 60);
    const info = schoolInfo(state, fw.content, state.people[kid]!)!;
    expect(info).toMatchObject({ schoolName: 'Willowbrook Elementary', status: 'upcoming', homeworkDue: false, days: 'Mon to Fri' });
    expect(info.hours).toBe('8:00 AM to 2:00 PM');
    expect(schoolInfo(state, fw.content, state.people[fw.w.mira]!)).toBeNull();
    // a pupil who is still at home long after the bell has missed the day, even before the next tick says so
    state.clock.minutes = atDayMinute(1, 10 * 60 + 40);
    expect(schoolInfo(state, fw.content, state.people[kid]!)).toMatchObject({ status: 'missed' });
    expect(schoolInfo(state, fw.content, state.people[kid]!)!.statusText).toMatch(/^Missed school today\./);
  });
});

describe('school in town', () => {
  it('children of other households follow the light schedule: at school in school hours, counted once, never walking', () => {
    const fw = familyWorld({ startMinute: 7 * 60 });
    const s = fw.w.state;
    const nh = s.people[fw.w.neighbour!]!.householdId;
    const npcKid = addMember(fw, nh, 'Nia', { lifeStage: 'child' });
    const baby = addMember(fw, nh, 'Bo', { lifeStage: 'baby' });
    expect(npcKid.isNpc).toBe(true);
    expect(plannedPlace(s, fw.content, npcKid, atDayMinute(0, 10 * 60))).toEqual({ kind: 'school' });
    expect(plannedPlace(s, fw.content, npcKid, atDayMinute(0, 15 * 60))).not.toEqual({ kind: 'school' });
    expect(plannedPlace(s, fw.content, npcKid, atDayMinute(5, 10 * 60))).not.toEqual({ kind: 'school' });
    expect(plannedPlace(s, fw.content, baby, atDayMinute(0, 10 * 60))).toEqual({ kind: 'home' });
    runUntil(fw.h, () => s.clock.minutes >= atDayMinute(0, 10 * 60), 4 * 60 * 4);
    expect(s.people[npcKid.id]!.location).toMatchObject({ kind: 'offlot', place: 'school' });
    runUntil(fw.h, () => s.clock.minutes >= atDayMinute(0, 14 * 60 + 30), 4 * 60 * 5);
    expect(s.people[npcKid.id]!.location).not.toMatchObject({ place: 'school' });
    expect(s.people[npcKid.id]!.school).toMatchObject({ attended: 1 });
    const ctx = pureCtx(fw.h);
    lightSchool(ctx, (p) => p.isNpc);
    expect(s.people[npcKid.id]!.school).toMatchObject({ attended: 1 });
  });
});
