import { describe, expect, it } from 'vitest';
import { hourOfDay } from '../../../src/core/clock';
import { relKey } from '../../../src/core/ids';
import { ensureRel } from '../../../src/sim/relationships';
import { buildWorld, finished, fixtureContent, harness, head, lotLocation, runTicks, runUntil, setNeeds } from './fixtures';

describe('day/night rhythm', () => {
  it('residents sleep through the night and rarely during the day', () => {
    const w = buildWorld({ visitors: false, neighbour: false });
    const h = harness(w.state);
    const asleep: Record<string, { night: number; nightTotal: number; day: number; dayTotal: number }> = {};
    for (const id of [w.mira, w.theo]) asleep[id] = { night: 0, nightTotal: 0, day: 0, dayTotal: 0 };
    for (let i = 0; i < 4 * 60 * 24 * 3; i++) {
      h.sim.tick();
      const hr = hourOfDay(h.holder.state.clock.minutes);
      for (const id of [w.mira, w.theo]) {
        const sleeping = head(h, id)?.interactionId === 'sleep' && head(h, id)?.phase === 'perform';
        const s = asleep[id]!;
        if (hr >= 23 || hr < 5) { s.nightTotal++; if (sleeping) s.night++; }
        if (hr >= 9 && hr < 19) { s.dayTotal++; if (sleeping) s.day++; }
      }
    }
    for (const id of [w.mira, w.theo]) {
      const s = asleep[id]!;
      expect(s.night / s.nightTotal, `${id} asleep at night`).toBeGreaterThan(0.8);
      expect(s.day / s.dayTotal, `${id} asleep in the day`).toBeLessThan(0.1);
    }
  });

  it('night sleep lasts until the morning wake time rather than stopping at full energy', () => {
    const w = buildWorld({ visitors: false, neighbour: false, autonomy: false });
    const h = harness(w.state);
    h.holder.state.clock.minutes = 22 * 60;
    setNeeds(h.holder.state, w.mira, 100);
    h.holder.state.people[w.mira]!.needs.energy = 60;
    h.sim.queue(w.mira, { interactionId: 'sleep', target: { kind: 'object', objectId: w.objects.bed!.id, slotId: null } });
    runUntil(h, () => head(h, w.mira)?.phase === 'perform');
    const wakeAt = head(h, w.mira)!.data.wakeAt as number;
    expect(hourOfDay(wakeAt)).toBeGreaterThanOrEqual(6);
    expect(hourOfDay(wakeAt)).toBeLessThan(7);
    runUntil(h, () => finished(h, w.mira, 'sleep').length > 0, 4 * 60 * 10);
    expect(h.holder.state.clock.minutes).toBeGreaterThanOrEqual(wakeAt);
    expect(h.holder.state.clock.minutes).toBeLessThanOrEqual(wakeAt + 1.25); // plus getting up
  });
});

describe('social balance', () => {
  it('autonomous chats do not keep cancelling activities of people who are not lonely', () => {
    const w = buildWorld({ visitors: false, neighbour: false });
    setNeeds(w.state, w.mira, 70);
    setNeeds(w.state, w.theo, 70);
    const h = harness(w.state);
    runTicks(h, 4 * 60 * 12);
    const cancelledBySocial = h.log.filter((e) => e.type === 'action.finished' && e.result === 'cancelled');
    expect(cancelledBySocial).toEqual([]);
  });

  it('a lonely person phones a known neighbour even after a short acquaintance', () => {
    const w = buildWorld({ visitors: false });
    const ada = w.neighbour!;
    w.state.people[w.theo]!.location = { kind: 'offlot', place: 'errand', since: 0, until: null };
    for (const [a, b] of [[w.mira, ada], [ada, w.mira]] as const) { const r = ensureRel(w.state, a, b); r.familiarity = 17; r.friendship = 7; }
    setNeeds(w.state, w.mira, 80);
    w.state.people[w.mira]!.needs.social = 12;
    const h = harness(w.state);
    runUntil(h, () => finished(h, w.mira).some((e) => (e.interactionId === 'phoneChat' || e.interactionId === 'phoneInvite') && e.result === 'done'), 4 * 60 * 3);
    const called = finished(h, w.mira, 'phoneChat').some((e) => e.result === 'done');
    if (called) expect(h.holder.state.people[w.mira]!.needs.social).toBeGreaterThan(12);
    else expect(h.holder.state.schedule.some((e) => e.kind === 'visitArrive' && e.personId === ada)).toBe(true);
  });

  it('phone calls raise friendship with diminishing returns', () => {
    const w = buildWorld({ visitors: false, autonomy: false });
    const ada = w.neighbour!;
    for (const [a, b] of [[w.mira, ada], [ada, w.mira]] as const) { const r = ensureRel(w.state, a, b); r.familiarity = 17; r.friendship = 7; }
    const h = harness(w.state);
    const gains: number[] = [];
    for (let i = 0; i < 40; i++) {
      const before = h.holder.state.relationships[relKey(w.mira, ada)]!.friendship;
      expect(h.sim.queue(w.mira, { interactionId: 'phoneChat', target: { kind: 'self' }, data: { personId: ada } }).ok).toBe(true);
      runUntil(h, () => !head(h, w.mira), 4 * 60);
      gains.push(h.holder.state.relationships[relKey(w.mira, ada)]!.friendship - before);
    }
    expect(gains[1]!).toBeLessThan(gains[0]!);
    expect(gains[39]!).toBeLessThan(gains[0]! / 4);
    expect(h.holder.state.relationships[relKey(w.mira, ada)]!.friendship).toBeLessThanOrEqual(50);
  });

  it('a content-defined leaveLot interaction stays out of menus and autonomy', () => {
    const content = fixtureContent();
    content.interactions.leaveLot = { ...content.interactions.goToWork!, id: 'leaveLot', name: 'Go Home', behavior: 'leaveLot', allowVisitors: true, autonomy: { enabled: true, ads: { social: 50 }, tags: [] } };
    const w = buildWorld({ visitors: false });
    w.state.people[w.neighbour!]!.location = lotLocation(w.lot, 7, 9);
    const h = harness(w.state, content);
    expect(h.sim.options(w.mira, { kind: 'self' }).some((o) => o.interactionId === 'leaveLot')).toBe(false);
    runTicks(h, 4 * 60);
    expect(h.log.some((e) => e.type === 'action.started' && e.interactionId === 'leaveLot')).toBe(false);
  });
});
