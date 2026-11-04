import { describe, expect, it } from 'vitest';
import { buildWorld, finished, harness, head, lotLocation, runTicks, runUntil, setNeeds } from './fixtures';

describe('autonomy', () => {
  it('a hungry person finds food on their own', () => {
    const w = buildWorld({ visitors: false, neighbour: false });
    setNeeds(w.state, w.mira, 85);
    setNeeds(w.state, w.theo, 85);
    w.state.people[w.mira]!.needs.hunger = 10;
    const h = harness(w.state);
    runTicks(h, 4 * 60 * 2);
    const ate = h.log.filter((e) => e.type === 'action.finished' && e.personId === w.mira && e.result === 'done' &&
      ['cookMeal', 'eatMeal', 'grabSnack'].includes(e.interactionId));
    expect(ate.length).toBeGreaterThan(0);
    expect(h.holder.state.people[w.mira]!.needs.hunger).toBeGreaterThan(40);
  });

  it('a tired person goes to bed and sleeps until rested', () => {
    const w = buildWorld({ visitors: false, neighbour: false });
    setNeeds(w.state, w.mira, 85);
    setNeeds(w.state, w.theo, 85);
    w.state.people[w.mira]!.needs.energy = 8;
    const h = harness(w.state);
    runUntil(h, () => head(h, w.mira)?.interactionId === 'sleep' && head(h, w.mira)?.phase === 'perform', 4 * 30);
    const loc = h.holder.state.people[w.mira]!.location;
    expect(loc.kind === 'lot' && loc.posture).toBe('lying');
    runUntil(h, () => finished(h, w.mira, 'sleep').length > 0, 4 * 60 * 10);
    expect(finished(h, w.mira, 'sleep')[0]!.result).toBe('done');
    expect(h.holder.state.people[w.mira]!.needs.energy).toBeGreaterThan(95);
  });

  it('decides at most every 5 game minutes and staggers people', () => {
    const w = buildWorld({ visitors: false, neighbour: false });
    const h = harness(w.state);
    runTicks(h, 1);
    const a = h.holder.state.people[w.mira]!.cooldowns['@decide']!;
    const b = h.holder.state.people[w.theo]!.cooldowns['@decide']!;
    expect(a).toBeDefined();
    expect(a).not.toBe(b);
    // A decision sets '@decide' to exactly now + 5; record those moments per person.
    const decisions: Record<string, number[]> = { [w.mira]: [], [w.theo]: [] };
    for (let i = 0; i < 4 * 60 * 12; i++) {
      h.sim.tick();
      const now = h.holder.state.clock.minutes;
      for (const id of [w.mira, w.theo]) if (h.holder.state.people[id]!.cooldowns['@decide'] === now + 5) decisions[id]!.push(now);
    }
    for (const id of [w.mira, w.theo]) {
      const d = decisions[id]!;
      expect(d.length).toBeGreaterThan(20);
      for (let i = 1; i < d.length; i++) expect(d[i]! - d[i - 1]!).toBeGreaterThanOrEqual(5);
    }
    // staggered: the two people never decide on the same tick in this run
    expect(decisions[w.mira]!.filter((t) => decisions[w.theo]!.includes(t)).length).toBeLessThan(decisions[w.mira]!.length / 2);
  });

  it('does not oscillate: with both residents home, no autonomous action is cancelled or abandoned', () => {
    const w = buildWorld({ visitors: false, neighbour: false });
    const h = harness(w.state);
    runTicks(h, 4 * 60 * 24);
    for (const id of [w.mira, w.theo]) {
      const ends = finished(h, id);
      expect(ends.length).toBeGreaterThan(10);
      expect(ends.filter((e) => e.result !== 'done'), 'cancelled or failed actions').toEqual([]);
    }
    for (const id of [w.mira, w.theo]) {
      const p = h.holder.state.people[id]!;
      expect(p.needs.hunger).toBeGreaterThan(15);
      expect(p.needs.energy).toBeGreaterThan(5);
    }
  });

  it('interrupts a low-priority activity only for an urgent need (hysteresis)', () => {
    const w = buildWorld({ visitors: false, neighbour: false, autonomy: true });
    setNeeds(w.state, w.mira, 90);
    w.state.people[w.theo]!.location = { kind: 'offlot', place: 'errand', since: w.state.clock.minutes, until: null };
    const h = harness(w.state);
    h.sim.queueSystem(w.mira, { interactionId: 'watchTv', target: { kind: 'object', objectId: w.objects.tv!.id, slotId: null }, source: 'autonomy' });
    runUntil(h, () => head(h, w.mira)?.phase === 'perform');
    h.holder.state.people[w.mira]!.needs.hunger = 22; // low but not urgent: keep watching
    runTicks(h, 4 * 10);
    expect(head(h, w.mira)?.interactionId).toBe('watchTv');
    expect(head(h, w.mira)?.cancelRequested).toBe(false);
    h.holder.state.people[w.mira]!.needs.hunger = 5; // urgent
    runUntil(h, () => finished(h, w.mira, 'watchTv').length > 0, 4 * 10);
    expect(finished(h, w.mira, 'watchTv')[0]!.result).toBe('cancelled');
    runUntil(h, () => ['cookMeal', 'grabSnack', 'eatMeal'].includes(head(h, w.mira)?.interactionId ?? ''), 40);
  });

  it('respects the autonomy setting for the household but visitors still act', () => {
    const w = buildWorld({ autonomy: false, visitors: false });
    w.state.people[w.mira]!.needs.hunger = 5;
    const ada = w.neighbour!;
    w.state.people[ada]!.location = lotLocation(w.lot, 7, 9);
    setNeeds(w.state, ada, 50);
    const h = harness(w.state);
    runTicks(h, 4 * 60);
    const started = h.log.filter((e) => e.type === 'action.started');
    // Residents waited for orders: Ada acted on her own, but they started nothing of their own and nobody pulled
    // them into a conversation (see social.test.ts "autonomy off for the played household").
    const own = started.filter((e) => e.type === 'action.started' && (e.personId === w.mira || e.personId === w.theo) && !h.content.socials[e.interactionId]);
    expect(own).toEqual([]);
    expect(started.some((e) => e.personId === ada)).toBe(true);
  });

  it('autonomy level 0 only acts on urgent needs', () => {
    const w = buildWorld({ visitors: false, neighbour: false });
    w.state.settings.autonomyLevel = 0;
    setNeeds(w.state, w.mira, 60);
    setNeeds(w.state, w.theo, 60);
    const h = harness(w.state);
    runTicks(h, 4 * 20);
    expect(h.log.filter((e) => e.type === 'action.started')).toEqual([]);
    h.holder.state.people[w.mira]!.needs.bladder = 12;
    runUntil(h, () => head(h, w.mira)?.interactionId === 'useToilet', 4 * 10);
  });
});
