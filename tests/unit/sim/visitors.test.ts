import { describe, expect, it } from 'vitest';
import { atDayMinute } from '../../../src/core/clock';
import { cloneState } from '../../../src/core/state';
import { dailyDropIn } from '../../../src/sim/visitors';
import { buildWorld, harness, pureCtx, runTicks, runUntil } from './fixtures';

describe('visitors', () => {
  it('the first neighbour visits at 17:00 on day 0, introduces themself, uses only visitor activities and leaves', () => {
    const w = buildWorld({ visitors: true, autonomy: true });
    const ada = w.neighbour!;
    const h = harness(w.state);
    runTicks(h, 1);
    expect(h.holder.state.schedule.find((e) => e.occurrence === `visit:${ada}:0`)).toMatchObject({ kind: 'visitArrive', at: atDayMinute(0, 17 * 60) });
    runUntil(h, () => h.holder.state.people[ada]!.location.kind === 'lot', 4 * 60 * 10);
    expect(h.holder.state.clock.minutes).toBe(atDayMinute(0, 17 * 60));
    expect(h.holder.state.people[ada]!.location).toMatchObject({ kind: 'lot', lotId: w.lot.id, x: 8.5 });
    expect((h.holder.state.people[ada]!.location as { z: number }).z).toBeGreaterThan(10.9); // entry tile (8, 11)
    expect(h.holder.state.people[ada]!.queue[0]).toMatchObject({ interactionId: 'introduce', source: 'schedule' });
    const leave = h.holder.state.schedule.find((e) => e.kind === 'visitLeave' && e.personId === ada)!;
    expect(leave.at - h.holder.state.clock.minutes).toBeGreaterThanOrEqual(120);
    expect(leave.at - h.holder.state.clock.minutes).toBeLessThanOrEqual(180);
    runUntil(h, () => h.holder.state.people[ada]!.location.kind === 'offlot', 4 * 60 * 4);
    expect(h.holder.state.people[ada]!.location).toMatchObject({ kind: 'offlot', place: 'home' });
    const intro = h.log.find((e) => e.type === 'social' && e.actorId === ada && e.socialId === 'introduce');
    expect(intro).toBeDefined();
    const used = new Set(h.log.filter((e) => e.type === 'action.started' && e.personId === ada).map((e) => (e as { interactionId: string }).interactionId));
    for (const id of used) expect(['introduce', 'chat', 'tellJoke', 'deepTalk', 'becomeFriends', 'sit', 'watchTv', 'goHere', 'leaveLot']).toContain(id);
    const feed = h.holder.state.feed.map((f) => f.text);
    expect(feed).toContain('Ada dropped by.');
    expect(feed).toContain('Ada went home.');
    expect(h.sim.reservations().filter((r) => r.includes(ada))).toEqual([]);
  });

  it('does not schedule the first visit when visitors are off', () => {
    const w = buildWorld({ visitors: false });
    const h = harness(w.state);
    runTicks(h, 4 * 60 * 10);
    expect(h.holder.state.schedule).toEqual([]);
    expect(h.holder.state.people[w.neighbour!]!.location.kind).toBe('offlot');
  });

  it('phoneInvite schedules a visit in 60 minutes; the guest is not invited twice', () => {
    const w = buildWorld({ visitors: false, autonomy: false });
    const ada = w.neighbour!;
    const h = harness(w.state);
    const opt = h.sim.options(w.mira, { kind: 'self' }).find((o) => o.interactionId === 'phoneInvite')!;
    expect(opt).toMatchObject({ enabled: true, label: 'Invite Ada Over', data: { personId: ada } });
    expect(h.sim.queue(w.mira, { interactionId: 'phoneInvite', target: { kind: 'self' }, data: { personId: ada } }).ok).toBe(true);
    runUntil(h, () => h.holder.state.schedule.some((e) => e.kind === 'visitArrive'), 4 * 10);
    const ev = h.holder.state.schedule.find((e) => e.kind === 'visitArrive')!;
    expect(ev.at - h.holder.state.clock.minutes).toBe(60);
    expect(ev.occurrence.startsWith(`invite:${ada}:`)).toBe(true);
    runTicks(h, 2);
    const again = h.sim.options(w.mira, { kind: 'self' }).find((o) => o.interactionId === 'phoneInvite')!;
    expect(again).toMatchObject({ enabled: false, reason: 'Ada is already on the way.' });
    // arrival is processed once, even across a save/load right before it
    runUntil(h, () => h.holder.state.clock.minutes >= ev.at - 1, 4 * 70);
    const h2 = harness(cloneState(h.holder.state), h.content);
    runUntil(h2, () => h2.holder.state.people[ada]!.location.kind === 'lot', 10);
    expect(h2.holder.state.processed[ev.occurrence]).toBeDefined();
    expect(h2.holder.state.feed.filter((f) => f.text === 'Ada came over.')).toHaveLength(1);
  });

  it('random drop-ins happen at most once every two days', () => {
    const w = buildWorld({ visitors: true });
    const h = harness(w.state);
    const ctx = pureCtx(h);
    const days: number[] = [];
    for (let d = 1; d <= 40; d++) {
      const before = ctx.state.schedule.length;
      dailyDropIn(ctx, d);
      if (ctx.state.schedule.length > before) {
        days.push(d);
        // the guest goes home again before the next day
        ctx.state.schedule = [];
      }
    }
    expect(days.length).toBeGreaterThan(3);
    for (let i = 1; i < days.length; i++) expect(days[i]! - days[i - 1]!).toBeGreaterThanOrEqual(2);
  });
});
