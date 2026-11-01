import { describe, expect, it } from 'vitest';
import { atDayMinute } from '../../../src/core/clock';
import { cloneState } from '../../../src/core/state';
import { careerInfo } from '../../../src/sim/careers';
import { buildWorld, harness, head, runTicks, runUntil, setNeeds } from './fixtures';
import type { FixtureWorld, Harness } from './fixtures';

function workday(): { w: FixtureWorld; h: Harness } {
  const w = buildWorld({ career: true, autonomy: false, visitors: false, neighbour: false });
  setNeeds(w.state, w.mira, 80);
  setNeeds(w.state, w.theo, 80);
  return { w, h: harness(w.state) };
}

const wages = (h: Harness) => Object.values(h.holder.state.households).flatMap((x) => x.ledger).filter((l) => l.kind === 'wage');
const careerEvents = (h: Harness, what: string) => h.log.filter((e) => e.type === 'career' && e.what === what);
const until = (h: Harness, minute: number) => runUntil(h, () => h.holder.state.clock.minutes >= minute, 4 * 60 * 30);

describe('careers', () => {
  it('commutes 45 minutes early, works off-lot, returns at the entry and is paid once', () => {
    const { w, h } = workday();
    until(h, atDayMinute(0, 8 * 60 + 15));
    expect(head(h, w.mira)).toMatchObject({ interactionId: 'goToWork', source: 'schedule' });
    runUntil(h, () => h.holder.state.people[w.mira]!.location.kind === 'offlot', 4 * 30);
    const mira = () => h.holder.state.people[w.mira]!;
    expect(mira().location).toMatchObject({ kind: 'offlot', place: 'work', until: atDayMinute(0, 17 * 60) });
    expect(mira().career!.shift).toMatchObject({ occurrence: `shift:${w.mira}:0`, status: 'atWork', lateMinutes: 0 });
    expect(mira().queue).toEqual([]);
    expect(careerEvents(h, 'leftForWork')).toHaveLength(1);
    until(h, atDayMinute(0, 17 * 60));
    // back at the lot entry (8, 11); the walk in already took its first step this tick
    expect(mira().location).toMatchObject({ kind: 'lot', x: 8.5 });
    expect((mira().location as { z: number }).z).toBeGreaterThan(10.9);
    expect(mira().career!.shift!.status).toBe('done');
    expect(mira().career!.daysWorked).toBe(1);
    expect(wages(h)).toHaveLength(1);
    expect(wages(h)[0]).toMatchObject({ amount: 8 * 1500, occurrence: `pay:${w.mira}:0` });
    expect(careerEvents(h, 'returned')).toHaveLength(1);
    expect(head(h, w.mira)?.interactionId).toBe('goHere'); // walks in from the entry
    until(h, atDayMinute(0, 20 * 60));
    expect(wages(h)).toHaveLength(1);
    expect(mira().career!.performance).toBeGreaterThan(0);
  });

  it('pays once even with a save/load mid-shift and a stale shift state', () => {
    const { w, h } = workday();
    until(h, atDayMinute(0, 12 * 60));
    const h2 = harness(cloneState(h.holder.state), h.content);
    until(h, atDayMinute(0, 18 * 60));
    until(h2, atDayMinute(0, 18 * 60));
    expect(JSON.stringify(h2.holder.state)).toBe(JSON.stringify(h.holder.state));
    expect(wages(h2)).toHaveLength(1);
    // A stale save that still says "at work" after the shift was paid cannot pay again.
    const stale = cloneState(h2.holder.state);
    stale.people[w.mira]!.career!.shift!.status = 'atWork';
    stale.people[w.mira]!.location = { kind: 'offlot', place: 'work', since: 0, until: null };
    const h3 = harness(stale, h.content);
    const funds = Object.values(stale.households).find((x) => x.isPlayable)!.funds;
    runTicks(h3, 8);
    expect(Object.values(h3.holder.state.households).find((x) => x.isPlayable)!.funds).toBe(funds);
    expect(wages(h3)).toHaveLength(1);
  });

  it('a cancelled commute leads to a missed shift with a performance penalty and no pay', () => {
    const { w, h } = workday();
    until(h, atDayMinute(0, 8 * 60 + 15));
    h.sim.cancel(w.mira, head(h, w.mira)!.id);
    until(h, atDayMinute(0, 13 * 60) + 1);
    const cs = h.holder.state.people[w.mira]!.career!;
    expect(cs.shift!.status).toBe('missed');
    expect(cs.performance).toBe(-15);
    expect(careerEvents(h, 'missed')).toHaveLength(1);
    expect(h.holder.state.processed[`shift:${w.mira}:0`]).toBeDefined();
    until(h, atDayMinute(0, 18 * 60));
    expect(wages(h)).toHaveLength(0);
    expect(h.holder.state.people[w.mira]!.location.kind).toBe('lot');
  });

  it('a late start is a partial shift paid for the minutes worked', () => {
    const { w, h } = workday();
    until(h, atDayMinute(0, 8 * 60 + 15));
    h.sim.cancel(w.mira, head(h, w.mira)!.id);
    until(h, atDayMinute(0, 10 * 60));
    expect(h.sim.queue(w.mira, { interactionId: 'goToWork', target: { kind: 'self' } }).ok).toBe(true);
    runUntil(h, () => h.holder.state.people[w.mira]!.location.kind === 'offlot', 4 * 30);
    const late = h.holder.state.people[w.mira]!.career!.shift!.lateMinutes;
    expect(late).toBeGreaterThan(60);
    expect(careerEvents(h, 'late')).toHaveLength(1);
    until(h, atDayMinute(0, 17 * 60) + 1);
    expect(wages(h)[0]!.amount).toBe(Math.round((1500 * (8 * 60 - late)) / 60));
  });

  it('offers goToWork with the next shift as the reason on days off', () => {
    const { w, h } = workday();
    h.holder.state.clock.minutes = atDayMinute(5, 10 * 60);
    const opt = h.sim.options(w.mira, { kind: 'self' }).find((o) => o.interactionId === 'goToWork')!;
    expect(opt).toMatchObject({ enabled: false, reason: 'Next shift: Monday 9:00 AM.' });
    const info = careerInfo(h.holder.state, h.content, h.holder.state.people[w.mira]!)!;
    expect(info.expectedPay).toBe(8 * 1500);
    expect(info.next!.occurrence).toBe(`shift:${w.mira}:7`);
  });

  it('promotes when performance and skills meet the level requirements', () => {
    const { w, h } = workday();
    const mira = h.holder.state.people[w.mira]!;
    mira.career!.performance = 29;
    mira.skills.cooking = { level: 2, xp: 120 };
    until(h, atDayMinute(0, 17 * 60) + 1);
    expect(h.holder.state.people[w.mira]!.career!.level).toBe(2);
    expect(careerEvents(h, 'promoted')).toHaveLength(1);
    expect(h.holder.state.people[w.mira]!.memories.some((m) => m.kind === 'promotion')).toBe(true);
  });

  it('promotion also needs the level\'s days worked in the career', () => {
    const { w, h } = workday();
    h.content.careers.culinary!.levels[0]!.promotion = { performance: 0, skills: {}, days: 2 };
    const mira = h.holder.state.people[w.mira]!;
    mira.career!.performance = 50;
    until(h, atDayMinute(0, 17 * 60) + 1);
    expect(mira.career!.daysWorked).toBe(1);
    expect(mira.career!.level).toBe(1);
    expect(careerEvents(h, 'promoted')).toHaveLength(0);
    until(h, atDayMinute(1, 17 * 60) + 1);
    expect(mira.career!.daysWorked).toBe(2);
    expect(mira.career!.level).toBe(2);
    expect(careerEvents(h, 'promoted')).toHaveLength(1);
  });

  it('promotion also needs a friendship outside the household when the level asks for one', () => {
    const { w, h } = workday();
    h.content.careers.culinary!.levels[0]!.promotion = { performance: 0, skills: {}, relationship: { minFriendship: 20, label: 'A friendly colleague' } };
    const mira = h.holder.state.people[w.mira]!;
    mira.career!.performance = 10;
    until(h, atDayMinute(0, 17 * 60) + 1);
    expect(h.holder.state.people[w.mira]!.career!.level).toBe(1);
    expect(careerEvents(h, 'promoted')).toHaveLength(0);
  });

  it('a person near the bottom of the ladder is demoted after a bad shift', () => {
    const { w, h } = workday();
    const mira = h.holder.state.people[w.mira]!;
    mira.career!.level = 2;
    mira.career!.performance = -100;
    until(h, atDayMinute(0, 17 * 60) + 1);
    expect(h.holder.state.people[w.mira]!.career!.level).toBe(1);
    expect(careerEvents(h, 'demoted')).toHaveLength(1);
  });
});

describe('career choices', () => {
  it('joining a career starts at level 1; quitting cancels the next shift and pays nothing', () => {
    const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
    setNeeds(w.state, w.mira, 80);
    const h = harness(w.state);
    expect(h.sim.joinCareer(w.mira, 'culinary')).toEqual({ ok: true });
    const mira = () => h.holder.state.people[w.mira]!;
    expect(mira().career).toMatchObject({ careerId: 'culinary', level: 1, performance: 0, effort: 'normal', daysWorked: 0 });
    expect(careerEvents(h, 'joined')).toHaveLength(1);
    expect(h.sim.joinCareer(w.mira, 'culinary')).toMatchObject({ ok: false });
    h.sim.setCareerEffort(w.mira, 'hard');
    expect(mira().career!.effort).toBe('hard');
    expect(h.sim.quitCareer(w.mira)).toEqual({ ok: true });
    expect(mira().career).toBeNull();
    expect(careerEvents(h, 'quit')).toHaveLength(1);
    until(h, atDayMinute(0, 18 * 60));
    expect(wages(h)).toHaveLength(0);
    expect(mira().career).toBeNull();
  });

  it('quitting mid-shift returns the person home and stops a later payment', () => {
    const { w, h } = workday();
    runUntil(h, () => h.holder.state.people[w.mira]!.location.kind === 'offlot', 4 * 60);
    expect(h.holder.state.people[w.mira]!.location.kind).toBe('offlot');
    expect(h.sim.quitCareer(w.mira)).toEqual({ ok: true });
    expect(h.holder.state.people[w.mira]!.career).toBeNull();
    expect(h.holder.state.people[w.mira]!.location.kind).toBe('lot');
    until(h, atDayMinute(0, 18 * 60));
    expect(wages(h)).toHaveLength(0);
  });

  it('working hard builds more performance than slacking off', () => {
    const run = (effort: 'slack' | 'hard') => {
      const { w, h } = workday();
      h.sim.setCareerEffort(w.mira, effort);
      until(h, atDayMinute(0, 17 * 60) + 1);
      return h.holder.state.people[w.mira]!;
    };
    const slack = run('slack');
    const hard = run('hard');
    expect(hard.career!.performance).toBeGreaterThan(slack.career!.performance);
    expect(hard.needs.energy).toBeLessThan(slack.needs.energy);
  });

  it('an on-the-job decision can be answered once and pays its bonus once', () => {
    const { w, h } = workday();
    h.content.careerEvents = {
      'test-bonus': {
        id: 'test-bonus', title: 'Extra order', text: 'A table asks for a special dish.',
        options: [
          { id: 'cook', label: 'Cook it', description: '', performance: 5, pay: 2500, result: 'cooked a special order.', moodlet: 'goodTunes' },
          { id: 'refuse', label: 'Refuse', description: '', performance: -5, result: 'turned the table away.' },
        ],
      },
    };
    until(h, atDayMinute(0, 9 * 60));
    const mira = () => h.holder.state.people[w.mira]!;
    mira().career!.pendingEvent = { eventId: 'test-bonus', day: 0 };
    const before = mira().career!.performance;
    const funds = Object.values(h.holder.state.households).find((x) => x.isPlayable)!.funds;
    expect(h.sim.resolveCareerEvent(w.mira, 'cook')).toEqual({ ok: true });
    expect(mira().career!.performance).toBe(before + 5);
    expect(Object.values(h.holder.state.households).find((x) => x.isPlayable)!.funds).toBe(funds + 2500);
    expect(h.sim.resolveCareerEvent(w.mira, 'cook')).toMatchObject({ ok: false });
    expect(Object.values(h.holder.state.households).find((x) => x.isPlayable)!.funds).toBe(funds + 2500);
    // Losing the "chosen" marker (an edited or older save) cannot pay the same decision twice either.
    mira().career!.pendingEvent!.chosen = undefined;
    expect(h.sim.resolveCareerEvent(w.mira, 'cook')).toEqual({ ok: true });
    expect(mira().career!.performance).toBe(before + 5);
    expect(Object.values(h.holder.state.households).find((x) => x.isPlayable)!.funds).toBe(funds + 2500);
  });

  it('an unanswered decision resolves to its first option at the end of the shift', () => {
    const { w, h } = workday();
    h.content.careerEvents = {
      'test-bonus': {
        id: 'test-bonus', title: 'Extra order', text: 'A table asks for a special dish.',
        options: [{ id: 'cook', label: 'Cook it', description: '', performance: 5, pay: 2500, result: 'cooked a special order.' }],
      },
    };
    until(h, atDayMinute(0, 9 * 60));
    h.holder.state.people[w.mira]!.career!.pendingEvent = { eventId: 'test-bonus', day: 0 };
    until(h, atDayMinute(0, 18 * 60));
    expect(h.holder.state.people[w.mira]!.career!.pendingEvent).toBeNull();
    expect(h.holder.state.people[w.mira]!.career!.performance).toBeGreaterThan(0);
    expect(Object.values(h.holder.state.households).find((x) => x.isPlayable)!.ledger.filter((l) => l.kind === 'career')).toHaveLength(1);
  });
});
