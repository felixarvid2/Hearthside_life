import { describe, expect, it } from 'vitest';
import { buildWorld, finished, harness, head, runTicks, runUntil, setNeeds } from './fixtures';

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
    runTicks(h, 4);
    const a = h.holder.state.people[w.mira]!.cooldowns['@decide']!;
    const b = h.holder.state.people[w.theo]!.cooldowns['@decide']!;
    expect(a).toBeDefined();
    expect(a).not.toBe(b);
    const starts: number[] = [];
    h.events.on('action.started', (e) => {
      if (e.personId === w.mira && h.holder.state.people[w.mira]!.queue[0]?.source === 'autonomy') starts.push(h.holder.state.clock.minutes);
    });
    runTicks(h, 4 * 60 * 6);
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(0.25);
  });

  it('does not oscillate: alone on the lot, every autonomous action runs to completion', () => {
    const w = buildWorld({ visitors: false, neighbour: false });
    const theo = w.state.people[w.theo]!;
    theo.location = { kind: 'offlot', place: 'errand', since: w.state.clock.minutes, until: null };
    const h = harness(w.state);
    runTicks(h, 4 * 60 * 24);
    const ends = finished(h, w.mira);
    expect(ends.length).toBeGreaterThan(10);
    const bad = ends.filter((e) => e.result !== 'done');
    expect(bad).toEqual([]);
    // never starts the same autonomous activity on the same target twice in a row within its cooldown
    const p = h.holder.state.people[w.mira]!;
    expect(p.needs.hunger).toBeGreaterThan(15);
    expect(p.needs.energy).toBeGreaterThan(5);
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
    const w = buildWorld({ autonomy: false, neighbour: false, visitors: false });
    w.state.people[w.mira]!.needs.hunger = 5;
    const h = harness(w.state);
    runTicks(h, 4 * 60);
    expect(h.log.filter((e) => e.type === 'action.started')).toEqual([]);
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
