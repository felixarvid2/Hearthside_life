import { describe, expect, it } from 'vitest';
import { computeInsets, placeAbove, sameInsets } from '../../../src/ui/hud/insets';
import { applySignal, emptyProgress, isComplete, parseProgress, TUTORIAL_STEPS, type TutorialSignal } from '../../../src/ui/hud/tutorialSteps';
import { coalesce, eventToToast, feedToToast, type NotifyContext, type ToastCandidate } from '../../../src/ui/hud/notify';
import {
  exportFileName, formatDays, humanize, moodTone, objectiveProgress, relationshipRows, relativeTime, shiftPay, skillProgress, slug,
} from '../../../src/ui/hud/format';
import { mockContent } from '../../../src/ui/dev/mockContent';
import { addHousehold, createEmptyWorld } from '../../../src/core/state';
import type { Person, WorldState } from '../../../src/core/types';

const db = mockContent();

function person(w: WorldState, id: string, householdId: string, first: string): Person {
  const p = {
    id, householdId, firstName: first, lastName: 'Test', skills: {}, career: null, needs: { hunger: 50, energy: 50, hygiene: 50, bladder: 50, fun: 50, social: 50 },
  } as unknown as Person;
  w.people[id] = p;
  return p;
}

describe('insets', () => {
  const canvas = { left: 0, top: 0, right: 400, bottom: 800 };
  it('wide covers count against top/bottom, narrow ones against the sides', () => {
    const ins = computeInsets(canvas, [
      { left: 6, top: 6, right: 394, bottom: 58 }, // top bar
      { left: 6, top: 730, right: 394, bottom: 794 }, // bottom bar
      { left: 6, top: 400, right: 394, bottom: 726 }, // bottom sheet
    ]);
    expect(ins).toEqual({ left: 0, right: 0, top: 58, bottom: 400 });
    const land = computeInsets({ left: 0, top: 0, right: 844, bottom: 390 }, [{ left: 480, top: 64, right: 834, bottom: 310 }]);
    expect(land).toEqual({ left: 0, right: 364, top: 0, bottom: 0 });
  });
  it('clips covers to the canvas and ignores empty ones', () => {
    expect(computeInsets(canvas, [{ left: -50, top: 780, right: 450, bottom: 900 }, { left: 10, top: 10, right: 10, bottom: 50 }])).toEqual({ left: 0, right: 0, top: 0, bottom: 20 });
  });
  it('sameInsets tolerates sub-pixel changes', () => {
    expect(sameInsets({ left: 0, right: 0, top: 10, bottom: 0 }, { left: 0, right: 0, top: 10.4, bottom: 0 })).toBe(true);
    expect(sameInsets({ left: 0, right: 0, top: 10, bottom: 0 }, { left: 0, right: 0, top: 12, bottom: 0 })).toBe(false);
  });
  it('placeAbove keeps menus inside the area and flips below when needed', () => {
    const area = { left: 8, top: 60, right: 382, bottom: 700 };
    expect(placeAbove({ x: 200, y: 400 }, { w: 200, h: 100 }, area)).toEqual({ left: 100, top: 288, below: false });
    expect(placeAbove({ x: 10, y: 400 }, { w: 200, h: 100 }, area).left).toBe(8);
    expect(placeAbove({ x: 390, y: 400 }, { w: 200, h: 100 }, area).left).toBe(182);
    expect(placeAbove({ x: 200, y: 100 }, { w: 200, h: 100 }, area)).toMatchObject({ top: 112, below: true });
    const tall = placeAbove({ x: 200, y: 100 }, { w: 200, h: 700 }, area);
    expect(tall.top).toBe(60);
  });
});

describe('tutorial progress', () => {
  it('ticks steps from real signals and stays immutable', () => {
    let p = emptyProgress();
    const before = p;
    const steps: TutorialSignal[] = [
      { type: 'selected' },
      { type: 'action', phase: 'finished', interactionId: 'grabSnack', result: 'done' },
      { type: 'action', phase: 'started', interactionId: 'nap' },
      { type: 'needsChecked' },
      { type: 'career', what: 'leftForWork' },
      { type: 'social', withOutsider: true },
      { type: 'placed', source: 'buy' },
      { type: 'placed', source: 'move' },
      { type: 'painted', kind: 'wall' },
      { type: 'saved' },
    ];
    for (const s of steps) p = applySignal(p, s);
    expect(before.done).toEqual([]);
    expect(isComplete(p)).toBe(true);
    expect(p.done).toHaveLength(TUTORIAL_STEPS.length);
  });
  it('ignores signals that do not complete a step', () => {
    const p = emptyProgress();
    expect(applySignal(p, { type: 'action', phase: 'finished', interactionId: 'eatMeal', result: 'cancelled' })).toBe(p);
    expect(applySignal(p, { type: 'social', withOutsider: false })).toBe(p);
    expect(applySignal(p, { type: 'painted', kind: 'floor' })).toBe(p);
    expect(applySignal(p, { type: 'career', what: 'returned' })).toBe(p);
    const once = applySignal(p, { type: 'selected' });
    expect(applySignal(once, { type: 'selected' })).toBe(once);
  });
  it('recognises eating and sleeping by behavior as well as id', () => {
    expect(applySignal(emptyProgress(), { type: 'action', phase: 'finished', interactionId: 'eatLeftovers', behavior: 'eatMeal', result: 'done' }).done).toEqual(['eat']);
    expect(applySignal(emptyProgress(), { type: 'action', phase: 'started', interactionId: 'snooze', behavior: 'rest' }).done).toEqual(['sleep']);
  });
  it('buy and move needs both halves', () => {
    const a = applySignal(emptyProgress(), { type: 'placed', source: 'move' });
    expect(a.done).toEqual([]);
    expect(a.moved).toBe(true);
    expect(applySignal(a, { type: 'placed', source: 'buy' }).done).toEqual(['buyMove']);
  });
  it('parses stored progress defensively', () => {
    expect(parseProgress(null)).toEqual(emptyProgress());
    expect(parseProgress('not json')).toEqual(emptyProgress());
    expect(parseProgress(JSON.stringify({ done: ['eat', 'bogus', 3], dismissed: true })).done).toEqual(['eat']);
  });
});

describe('notify rules', () => {
  const w = createEmptyWorld(1, 'guided');
  const hh = addHousehold(w, 'Hart', 1000, null, true);
  w.activeHouseholdId = hh.id;
  person(w, 'p1', hh.id, 'Ada');
  person(w, 'p9', 'other', 'June');
  const ctx: NotifyContext = { state: w, content: db, household: new Set(['p1']), editing: false };

  it('maps feed entries with sounds and skips build entries while editing', () => {
    const t = feedToToast({ id: 'f1', at: 0, kind: 'money', text: 'Got paid', personId: 'p1' }, ctx);
    expect(t).toMatchObject({ kind: 'success', sound: 'money', source: 'feed' });
    expect(feedToToast({ id: 'f2', at: 0, kind: 'build', text: 'Bought a sofa' }, { ...ctx, editing: true })).toBeNull();
  });
  it('maps events for the household only', () => {
    expect(eventToToast({ type: 'skill.level', personId: 'p1', skillId: 'cooking', level: 3 }, ctx)?.text).toBe('Ada reached Cooking level 3.');
    expect(eventToToast({ type: 'skill.level', personId: 'p9', skillId: 'cooking', level: 3 }, ctx)).toBeNull();
    expect(eventToToast({ type: 'career', personId: 'p1', what: 'promoted' }, ctx)?.sound).toBe('promotion');
    expect(eventToToast({ type: 'money', householdId: hh.id, amount: -500, balance: 0, label: 'Sofa' }, ctx)).toBeNull();
    expect(eventToToast({ type: 'money', householdId: hh.id, amount: 1200, balance: 0, label: 'Gift' }, ctx)?.text).toBe('+$12 Gift');
    expect(eventToToast({ type: 'social', actorId: 'p9', targetId: 'p1', socialId: 'chat', accepted: false, line: 'June brushed Ada off.' }, ctx)?.kind).toBe('warning');
    expect(eventToToast({ type: 'tick', minutes: 5 }, ctx)).toBeNull();
  });
  it('drops event toasts that a feed entry covers, dedupes, caps and picks the top sound', () => {
    const mk = (o: Partial<ToastCandidate>): ToastCandidate => ({ text: 'x', kind: 'info', sound: null, source: 'event', category: 'info', priority: 1, ...o });
    const out = coalesce([
      mk({ text: 'Ada was promoted to Line Cook!', category: 'career', personId: 'p1', sound: 'promotion', priority: 6, keys: ['promot'] }),
      mk({ text: 'Ada got a promotion at the bistro.', category: 'career', personId: 'p1', source: 'feed', sound: 'notify', priority: 4 }),
      mk({ text: 'Ada reached Cooking level 3.', category: 'skill', personId: 'p1', keys: ['cooking', 'level'], priority: 4, sound: 'levelUp' }),
      mk({ text: 'Same text', priority: 2 }),
      mk({ text: 'same text ', priority: 2 }),
      mk({ text: 'A new day begins.', category: 'notify', priority: 2 }),
    ], 3);
    expect(out.toasts.map((t) => t.text)).toEqual(['Ada got a promotion at the bistro.', 'Ada reached Cooking level 3.', 'Same text']);
    expect(out.sound).toBe('notify');
    expect(out.dropped).toBe(1);
  });
});

describe('format helpers', () => {
  it('humanizes ids and formats days', () => {
    expect(humanize('grabSnack')).toBe('Grab snack');
    expect(humanize('go-here')).toBe('Go here');
    expect(formatDays([0, 1, 2, 3, 4])).toBe('Mon-Fri');
    expect(formatDays([1, 2, 5])).toBe('Tue, Wed, Sat');
    expect(formatDays([5, 6, 0])).toBe('Mon, Sat, Sun');
    expect(formatDays([])).toBe('No set days');
  });
  it('computes pay, mood tone and skill progress', () => {
    expect(shiftPay({ start: 540, end: 1020, hourlyWage: 1500 })).toBe(12000);
    expect(shiftPay({ start: 22 * 60, end: 6 * 60, hourlyWage: 1000 })).toBe(8000);
    expect(moodTone(60)).toBe('great');
    expect(moodTone(10)).toBe('good');
    expect(moodTone(-10)).toBe('low');
    expect(moodTone(-60)).toBe('bad');
    const th = [100, 250, 450];
    expect(skillProgress(th, 1, 50)).toBeCloseTo(0.5);
    expect(skillProgress(th, 2, 175)).toBeCloseTo(0.5);
    expect(skillProgress(th, 4, 999)).toBe(1);
  });
  it('lists relationships with status and family tie from the viewer side', () => {
    const w = createEmptyWorld(1, 'guided');
    person(w, 'per_a', 'h1', 'Ada');
    person(w, 'per_b', 'h1', 'Theo');
    person(w, 'per_c', 'h2', 'June');
    w.relationships['per_b>per_a'] = { from: 'per_b', to: 'per_a', familiarity: 50, friendship: 60, trust: 0, romance: 40, lastInteractionAt: null, recent: {} };
    w.relationships['per_b>per_c'] = { from: 'per_b', to: 'per_c', familiarity: 10, friendship: 80, trust: 0, romance: 0, lastInteractionAt: null, recent: {} };
    w.bonds['per_a|per_b'] = { a: 'per_a', b: 'per_b', status: 'spouse', familyAtoB: 'parent', since: 0 };
    const rows = relationshipRows(w, 'per_b');
    expect(rows.map((r) => r.name)).toEqual(['Ada Test', 'June Test']); // household first
    expect(rows[0]).toMatchObject({ status: 'Spouse', family: 'Child', sameHousehold: true });
    expect(rows[1]).toMatchObject({ status: 'Acquaintance', family: '' });
  });
  it('objective progress for counts, skills and money', () => {
    const w = createEmptyWorld(1, 'guided');
    const hh = addHousehold(w, 'H', 150000, null, true);
    const p = person(w, 'per_a', hh.id, 'Ada');
    p.skills = { cooking: { level: 3, xp: 0 } };
    expect(objectiveProgress(w, db, p, { id: 'c', text: 'Cook', type: 'interactionCount', match: 'cookMeal', count: 3 }, { c: 2 })).toMatchObject({ display: '2 / 3', done: false });
    expect(objectiveProgress(w, db, p, { id: 's', text: 'Skill', type: 'skill', skillId: 'cooking', level: 2 }, {})).toMatchObject({ display: '2 / 2', done: true });
    expect(objectiveProgress(w, db, p, { id: 'f', text: 'Funds', type: 'funds', amount: 300000 }, {}).display).toBe('$1,500 / $3,000');
  });
  it('relative times, slugs and export names', () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    expect(relativeTime('2026-10-31T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2026-10-31T11:55:00Z', now)).toBe('5 minutes ago');
    expect(relativeTime('2026-10-31T09:00:00Z', now)).toBe('3 hours ago');
    expect(relativeTime('2026-10-29T12:00:00Z', now)).toBe('2 days ago');
    expect(relativeTime('garbage', now)).toBe('');
    expect(slug("The Hart's Café")).toBe('the-hart-s-cafe');
    expect(exportFileName('Hart', 2 * 1440 + 600)).toBe('hearthside-hart-day-3.json');
  });
});
