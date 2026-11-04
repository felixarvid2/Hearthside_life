import { describe, expect, it } from 'vitest';
import { cloneState } from '../../../src/core/state';
import type { ActionPhase } from '../../../src/core/types';
import { reservationKeys } from '../../../src/sim/reservations';
import { objectCandidates, pickUsePoint } from '../../../src/sim/steps';
import { buildWorld, finished, harness, head, pureCtx, runTicks, runUntil, setNeeds } from './fixtures';
import type { FixtureWorld, Harness } from './fixtures';

function quietWorld(): FixtureWorld {
  const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
  setNeeds(w.state, w.mira, 60);
  setNeeds(w.state, w.theo, 60);
  return w;
}

function watchTv(h: Harness, w: FixtureWorld): string {
  const r = h.sim.queue(w.mira, { interactionId: 'watchTv', target: { kind: 'object', objectId: w.objects.tv!.id, slotId: null } });
  if (!r.ok) throw new Error(r.reason);
  return r.actionId;
}

function standing(h: Harness, id: string): boolean {
  const loc = h.holder.state.people[id]!.location;
  return loc.kind === 'lot' && loc.posture === 'standing';
}

describe('action lifecycle', () => {
  it('watchTv uses a free sofa seat facing the TV and completes all phases', () => {
    const w = quietWorld();
    const h = harness(w.state);
    const id = watchTv(h, w);
    const phases: ActionPhase[] = [];
    runUntil(h, () => {
      const a = head(h, w.mira);
      if (a && phases[phases.length - 1] !== a.phase) phases.push(a.phase);
      return !a;
    });
    expect(phases).toEqual(['queued', 'route', 'prepare', 'perform', 'cleanup']);
    const done = finished(h, w.mira, 'watchTv');
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ actionId: id, result: 'done' });
    expect(h.sim.reservations()).toEqual([]);
    expect(standing(h, w.mira)).toBe(true);
    // ended on the sofa's approach tile, not inside the sofa
    const loc = h.holder.state.people[w.mira]!.location;
    expect(loc.kind === 'lot' && loc.z).toBe(6.5);
  });

  it('reserves the specific seat slot while in use', () => {
    const w = quietWorld();
    const h = harness(w.state);
    watchTv(h, w);
    runUntil(h, () => head(h, w.mira)?.phase === 'perform');
    const res = h.sim.reservations();
    expect(res).toHaveLength(1);
    expect(res[0]).toMatch(new RegExp(`^slot:${w.objects.sofa!.id}:s[01]=`));
    const loc = h.holder.state.people[w.mira]!.location;
    expect(loc.kind === 'lot' && loc.posture).toBe('seated');
    expect(h.holder.state.people[w.mira]!.anim.id).toBe('watchTv');
  });

  const phases: ActionPhase[] = ['queued', 'validate', 'reserve', 'route', 'prepare', 'perform', 'cleanup'];
  for (const phase of phases) {
    it(`releases reservations when cancelled in phase ${phase}`, () => {
      const w = quietWorld();
      const h = harness(w.state);
      const id = watchTv(h, w);
      if (phase === 'validate' || phase === 'reserve') {
        // Transient phases never persist between ticks; force them to exercise their cancel path.
        head(h, w.mira)!.phase = phase;
      } else if (phase !== 'queued') {
        runUntil(h, () => head(h, w.mira)?.phase === phase);
      }
      h.sim.cancel(w.mira, id);
      runUntil(h, () => h.holder.state.people[w.mira]!.queue.length === 0, 40);
      runTicks(h, 1);
      expect(h.sim.reservations()).toEqual([]);
      expect(standing(h, w.mira)).toBe(true);
      const end = finished(h, w.mira, 'watchTv');
      expect(end).toHaveLength(1);
      expect(end[0]!.result).toBe(phase === 'cleanup' ? 'done' : 'cancelled');
      if (phase === 'perform') expect(h.holder.state.people[w.mira]!.anim.id).toBe('idle');
    });
  }

  it('cancelling while seated plays standUp before ending', () => {
    const w = quietWorld();
    const h = harness(w.state);
    const id = watchTv(h, w);
    runUntil(h, () => head(h, w.mira)?.phase === 'perform');
    runTicks(h, 8);
    h.sim.cancel(w.mira, id);
    runTicks(h, 1);
    expect(head(h, w.mira)?.phase).toBe('cleanup');
    expect(h.holder.state.people[w.mira]!.anim.id).toBe('standUp');
    expect(h.sim.reservations()).toHaveLength(1);
    runTicks(h, 5);
    expect(head(h, w.mira)).toBeUndefined();
    expect(h.sim.reservations()).toEqual([]);
  });

  it('fails cleanly when the object is removed mid-action', () => {
    const w = quietWorld();
    const h = harness(w.state);
    watchTv(h, w);
    runUntil(h, () => head(h, w.mira)?.phase === 'perform');
    delete h.holder.state.lots[w.lot.id]!.objects[w.objects.tv!.id];
    h.sim.onLotChanged(w.lot.id);
    expect(head(h, w.mira)).toBeUndefined();
    const end = finished(h, w.mira, 'watchTv')[0]!;
    expect(end.result).toBe('failed');
    expect(end.reason).toBe('The tv flatscreen was removed.');
    expect(h.sim.reservations()).toEqual([]);
    expect(standing(h, w.mira)).toBe(true);
    runTicks(h, 10);
    expect(head(h, w.mira)).toBeUndefined();
  });

  it('fails cleanly when the seat is removed while walking to it', () => {
    const w = quietWorld();
    const h = harness(w.state);
    watchTv(h, w);
    runTicks(h, 2);
    expect(head(h, w.mira)?.phase).toBe('route');
    delete h.holder.state.lots[w.lot.id]!.objects[w.objects.sofa!.id];
    h.sim.onLotChanged(w.lot.id);
    const end = finished(h, w.mira, 'watchTv')[0]!;
    expect(end.result).toBe('failed');
    expect(end.reason).toBe('The seat is gone.');
    expect(h.sim.reservations()).toEqual([]);
  });

  it('stands up and fails when the seat is moved under a seated person', () => {
    const w = quietWorld();
    const h = harness(w.state);
    watchTv(h, w);
    runUntil(h, () => head(h, w.mira)?.phase === 'perform');
    h.holder.state.lots[w.lot.id]!.objects[w.objects.sofa!.id]!.x = 3;
    h.sim.onLotChanged(w.lot.id);
    expect(finished(h, w.mira, 'watchTv')[0]!.reason).toMatch(/was moved/);
    expect(standing(h, w.mira)).toBe(true);
    expect(h.sim.reservations()).toEqual([]);
  });

  it('replans around a door that was closed while walking', () => {
    const w = quietWorld();
    const h = harness(w.state);
    w.state.people[w.mira]!.needs.energy = 40;
    const r = h.sim.queue(w.mira, { interactionId: 'sleep', target: { kind: 'object', objectId: w.objects.bed!.id, slotId: null } });
    expect(r.ok).toBe(true);
    runTicks(h, 2);
    const lot = h.holder.state.lots[w.lot.id]!;
    const wall = (dir: 'h' | 'v', x: number, z: number) => {
      const id = `0:${dir}:${x}:${z}`;
      lot.walls[id] = { id, level: 0, dir, x, z, height: 2.8, sideA: { designId: 'plain-paint', paletteId: 'p0' }, sideB: { designId: 'plain-paint', paletteId: 'p0' } };
    };
    wall('v', 10, 4); // close the bedroom door: the way round through the bathroom remains
    let maxReplans = 0;
    runUntil(h, () => {
      const a = head(h, w.mira);
      maxReplans = Math.max(maxReplans, a?.replans ?? 0);
      return a?.phase === 'perform';
    }, 400);
    expect(maxReplans).toBeGreaterThanOrEqual(1);
    // now wall it in completely: the next plan finds no way and the action fails with a reason
    h.sim.cancel(w.mira, head(h, w.mira)!.id);
    runUntil(h, () => !head(h, w.mira), 20);
    wall('h', 13, 7);
    const r2 = h.sim.queue(w.mira, { interactionId: 'readBook', target: { kind: 'object', objectId: w.objects.bookcase!.id, slotId: null } });
    expect(r2.ok).toBe(true);
    runUntil(h, () => !head(h, w.mira), 20);
    expect(finished(h, w.mira, 'readBook')[0]).toMatchObject({ result: 'failed', reason: "Can't reach the bookcase open." });
    expect(h.sim.reservations()).toEqual([]);
  });

  it('fails with a readable reason after at most 2 replans when the way stays blocked', () => {
    const w = quietWorld();
    const h = harness(w.state);
    // A navigation provider whose paths go stale: planning succeeds but every step is refused.
    let blockSteps = false;
    const canStep = h.nav.canStep.bind(h.nav);
    h.nav.canStep = (lotId, level, from, to) => !blockSteps && canStep(lotId, level, from, to);
    const findPath = h.nav.findPath.bind(h.nav);
    h.nav.findPath = (...args) => {
      const was = blockSteps;
      blockSteps = false;
      try { return findPath(...args); } finally { blockSteps = was; }
    };
    h.sim.queue(w.mira, { interactionId: 'readBook', target: { kind: 'object', objectId: w.objects.bookcase!.id, slotId: null } });
    runTicks(h, 1);
    blockSteps = true;
    runUntil(h, () => !head(h, w.mira), 200);
    const end = finished(h, w.mira, 'readBook')[0]!;
    expect(end).toMatchObject({ result: 'failed', reason: "Couldn't get to the bookcase open: the way is blocked." });
    expect(h.sim.reservations()).toEqual([]);
    expect(standing(h, w.mira)).toBe(true);
  });

  it('player actions precede autonomous ones and cancel a running autonomous action', () => {
    const w = quietWorld();
    const h = harness(w.state);
    const auto = h.sim.queueSystem(w.mira, { interactionId: 'watchTv', target: { kind: 'object', objectId: w.objects.tv!.id, slotId: null }, source: 'autonomy' });
    expect(auto.ok).toBe(true);
    runUntil(h, () => head(h, w.mira)?.phase === 'perform');
    const r = h.sim.queue(w.mira, { interactionId: 'readBook', target: { kind: 'object', objectId: w.objects.bookcase!.id, slotId: null } });
    expect(r.ok).toBe(true);
    const q = h.holder.state.people[w.mira]!.queue;
    expect(q.map((a) => a.interactionId)).toEqual(['watchTv', 'readBook']);
    expect(q[0]!.cancelRequested).toBe(true);
    runUntil(h, () => head(h, w.mira)?.interactionId === 'readBook');
    expect(finished(h, w.mira, 'watchTv')[0]!.result).toBe('cancelled');
  });

  it('limits the queue to 8 and reorders only queued actions', () => {
    const w = quietWorld();
    const h = harness(w.state);
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      const r = h.sim.queue(w.mira, { interactionId: 'danceSolo', target: { kind: 'self' } });
      expect(r.ok).toBe(true);
      if (r.ok) ids.push(r.actionId);
    }
    const r9 = h.sim.queue(w.mira, { interactionId: 'danceSolo', target: { kind: 'self' } });
    expect(r9).toEqual({ ok: false, reason: 'The queue is full.' });
    runTicks(h, 1);
    h.sim.reorder(w.mira, ids[7]!, 0);
    const q = h.holder.state.people[w.mira]!.queue.map((a) => a.id);
    expect(q[0]).toBe(ids[0]);
    expect(q[1]).toBe(ids[7]);
    h.sim.reorder(w.mira, ids[0]!, 5); // running: ignored
    expect(h.holder.state.people[w.mira]!.queue[0]!.id).toBe(ids[0]);
  });

  it('options list interactions with readable disabled reasons', () => {
    const w = quietWorld();
    const h = harness(w.state);
    w.state.people[w.mira]!.needs.energy = 99;
    const bed = h.sim.options(w.mira, { kind: 'object', objectId: w.objects.bed!.id, slotId: null });
    expect(bed.map((o) => o.interactionId)).toEqual(['sleep', 'nap']);
    expect(bed[0]).toMatchObject({ enabled: false, reason: 'Energy is already full.' });
    expect(bed[1]!.enabled).toBe(true);
    const wardrobe = h.sim.options(w.mira, { kind: 'object', objectId: w.objects.wardrobe!.id, slotId: null });
    expect(wardrobe.find((o) => o.label === 'Change into Everyday')).toMatchObject({ enabled: false, reason: 'Already wearing it.' });
    expect(wardrobe.find((o) => o.label === 'Change into Sleepwear')?.enabled).toBe(true);
    const self = h.sim.options(w.mira, { kind: 'self' });
    expect(self.find((o) => o.interactionId === 'goToWork')).toBeUndefined();
    const tile = h.sim.options(w.mira, { kind: 'tile', x: 6, z: 7, level: 0 });
    expect(tile[0]).toMatchObject({ interactionId: 'goHere', group: 'move', enabled: false, reason: "Can't go there." });
    // an occupied single slot
    h.sim.queue(w.theo, { interactionId: 'useToilet', target: { kind: 'object', objectId: w.objects.toilet!.id, slotId: null } });
    w.state.people[w.theo]!.needs.bladder = 10;
    runTicks(h, 2);
    w.state.people[w.mira]!.needs.bladder = 10;
    const toilet = h.sim.options(w.mira, { kind: 'object', objectId: w.objects.toilet!.id, slotId: null });
    expect(toilet[0]).toMatchObject({ enabled: false, reason: 'Someone is using it.' });
  });

  it('changeOutfit and sleep switch outfit categories; editOutfits asks the UI', () => {
    const w = quietWorld();
    const h = harness(w.state);
    h.sim.queue(w.mira, { interactionId: 'changeOutfit', target: { kind: 'object', objectId: w.objects.wardrobe!.id, slotId: null }, data: { category: 'work' } });
    h.sim.queue(w.mira, { interactionId: 'editOutfits', target: { kind: 'object', objectId: w.objects.wardrobe!.id, slotId: null } });
    runUntil(h, () => !head(h, w.mira), 2000);
    expect(h.holder.state.people[w.mira]!.outfits.current.category).toBe('work');
    expect(h.log.some((e) => e.type === 'ui.request' && e.what === 'editOutfits' && e.personId === w.mira)).toBe(true);
    w.state.people[w.mira]!.needs.energy = 70;
    h.sim.queue(w.mira, { interactionId: 'sleep', target: { kind: 'object', objectId: w.objects.bed!.id, slotId: null } });
    runUntil(h, () => head(h, w.mira)?.phase === 'perform');
    expect(h.holder.state.people[w.mira]!.outfits.current.category).toBe('sleep');
    runUntil(h, () => !head(h, w.mira), 4 * 60 * 10);
    expect(h.holder.state.people[w.mira]!.outfits.current.category).toBe('everyday');
    expect(h.holder.state.people[w.mira]!.needs.energy).toBeGreaterThan(99);
    expect(h.holder.state.people[w.mira]!.moodlets.some((m) => m.id === 'wellRested')).toBe(true);
  });

  it('readBook takes a book and reads at a nearby seat, training logic', () => {
    const w = quietWorld();
    const h = harness(w.state);
    h.sim.queue(w.mira, { interactionId: 'readBook', target: { kind: 'object', objectId: w.objects.bookcase!.id, slotId: null } });
    runUntil(h, () => head(h, w.mira)?.data.stage === 1 && head(h, w.mira)?.phase === 'perform');
    const loc = h.holder.state.people[w.mira]!.location;
    expect(loc.kind === 'lot' && loc.posture).toBe('seated');
    expect(h.sim.reservations().some((r) => r.startsWith('slot:') && !r.includes(w.objects.bookcase!.id))).toBe(true);
    runUntil(h, () => !head(h, w.mira));
    expect(h.holder.state.people[w.mira]!.skills.logic?.xp).toBeCloseTo(30 * 45 / 60, 5);
  });
});

describe('seats shared between objects', () => {
  it('two people never use the same desk chair through the computer and the chair', () => {
    const w = quietWorld();
    const h = harness(w.state);
    const pc = { kind: 'object' as const, objectId: w.objects.computer!.id, slotId: null };
    expect(h.sim.queue(w.theo, { interactionId: 'playComputerGames', target: pc }).ok).toBe(true);
    runUntil(h, () => head(h, w.theo)?.phase === 'perform');
    expect(h.sim.reservations().some((r) => r.startsWith(`slot:${w.objects.deskChair!.id}:seat=`))).toBe(true);
    const opt = h.sim.options(w.mira, pc).find((o) => o.interactionId === 'practiceProgramming')!;
    expect(opt).toMatchObject({ enabled: false, reason: 'Someone is using it.' });
    expect(h.sim.queue(w.mira, { interactionId: 'practiceProgramming', target: pc })).toEqual({ ok: false, reason: 'Someone is using it.' });
    const chair = h.sim.options(w.mira, { kind: 'object', objectId: w.objects.deskChair!.id, slotId: null })[0]!;
    expect(chair).toMatchObject({ interactionId: 'sit', enabled: false, reason: 'Someone is using it.' });
  });

  it('a use slot lying on a seat also holds the seat, and a seated person blocks it', () => {
    const w = quietWorld();
    const h = harness(w.state);
    expect(h.sim.queue(w.theo, { interactionId: 'sit', target: { kind: 'object', objectId: w.objects.deskChair!.id, slotId: null } }).ok).toBe(true);
    runUntil(h, () => head(h, w.theo)?.phase === 'perform');
    const pc = { kind: 'object' as const, objectId: w.objects.computer!.id, slotId: null };
    const opt = h.sim.options(w.mira, pc).find((o) => o.interactionId === 'playComputerGames')!;
    expect(opt).toMatchObject({ enabled: false, reason: 'Someone is using it.' });
    // Reserving the computer's own slot directly (the fallback path) also claims the chair.
    h.sim.cancel(w.theo, head(h, w.theo)!.id);
    runUntil(h, () => !head(h, w.theo), 20);
    const ctx = pureCtx(h);
    const a = { ...head(h, w.mira) ?? {}, id: 'act_t', interactionId: 'playComputerGames', actorId: w.mira, source: 'player' as const, target: pc,
      phase: 'reserve' as const, phaseSince: 0, route: [], elapsed: 0, duration: null, replans: 0, failureReason: null, data: {}, cancelRequested: false, queuedAt: 0 };
    expect(pickUsePoint(ctx, h.holder.state.people[w.mira]!, a, 'use', objectCandidates(ctx, w.lot.id, w.objects.computer!.id, ['use']), { plan: false, what: 'computer' })).toBeNull();
    expect(reservationKeys(a)).toEqual([`slot:${w.objects.computer!.id}:use`, `slot:${w.objects.deskChair!.id}:seat`]);
  });
});

describe('rebuild after load', () => {
  it('resumes running actions with identical reservations', () => {
    const w = quietWorld();
    const h = harness(w.state);
    watchTv(h, w);
    h.sim.queue(w.theo, { interactionId: 'sleep', target: { kind: 'object', objectId: w.objects.bed!.id, slotId: null } });
    w.state.people[w.theo]!.needs.energy = 40;
    runTicks(h, 30);
    const before = h.sim.reservations();
    expect(before.length).toBe(2);
    const h2 = harness(cloneState(h.holder.state), h.content);
    h2.sim.rebuild();
    expect(h2.sim.reservations()).toEqual(before);
    runTicks(h, 400);
    runTicks(h2, 400);
    expect(JSON.stringify(h2.holder.state)).toBe(JSON.stringify(h.holder.state));
  });

  it('cancels cleanly when a reserved object vanished from the loaded state', () => {
    const w = quietWorld();
    const h = harness(w.state);
    watchTv(h, w);
    runUntil(h, () => head(h, w.mira)?.phase === 'perform');
    const saved = cloneState(h.holder.state);
    delete saved.lots[w.lot.id]!.objects[w.objects.sofa!.id];
    const h2 = harness(saved, h.content);
    h2.sim.rebuild();
    // rebuild() itself never ends actions at the pre-tick clock (that would differ from an uninterrupted
    // run); the action fails inside the next tick.
    expect(head(h2, w.mira)).toBeDefined();
    runTicks(h2, 1);
    expect(head(h2, w.mira)?.phase).toBe('cleanup'); // gets up from where the sofa was
    runUntil(h2, () => !head(h2, w.mira), 10);
    expect(finished(h2, w.mira, 'watchTv')[0]).toMatchObject({ result: 'failed', reason: 'The seat is gone.' });
    expect(h2.sim.reservations()).toEqual([]);
    expect(standing(h2, w.mira)).toBe(true);
  });

  it('resolves two loaded actions claiming the same slot: the first keeps it, the second ends', () => {
    const w = quietWorld();
    const h = harness(w.state);
    h.sim.queue(w.mira, { interactionId: 'useToilet', target: { kind: 'object', objectId: w.objects.toilet!.id, slotId: null } });
    w.state.people[w.mira]!.needs.bladder = 5;
    runUntil(h, () => head(h, w.mira)?.phase === 'perform');
    const saved = cloneState(h.holder.state);
    const copy = { ...structuredClone(saved.people[w.mira]!.queue[0]!), id: 'act_dup', actorId: w.theo };
    saved.people[w.theo]!.queue = [copy];
    const h2 = harness(saved, h.content);
    h2.sim.rebuild();
    expect(h2.holder.state.people[w.mira]!.queue).toHaveLength(1);
    expect(h2.holder.state.people[w.theo]!.queue).toHaveLength(0);
    expect(finished(h2, w.theo)[0]).toMatchObject({ result: 'failed', reason: 'Someone else is using it.' });
    expect(h2.sim.reservations()).toHaveLength(1);
  });
});

describe('progress pill data (Milestone 11.5)', () => {
  it('records the start value and id of the driving need when perform begins', () => {
    const w = quietWorld();
    w.state.people[w.mira]!.needs.hygiene = 40;
    const h = harness(w.state);
    h.sim.queue(w.mira, { interactionId: 'takeShower', target: { kind: 'object', objectId: w.objects.shower!.id, slotId: null } });
    runUntil(h, () => head(h, w.mira)?.phase === 'perform');
    const a = head(h, w.mira)!;
    expect(a.data.startNeedId).toBe('hygiene');
    // The value is the need at the start of perform (one tick of rate may already have been applied by the time
    // the test observes the phase), and it does not change as the action runs.
    expect(a.data.startNeed).toBeGreaterThan(39.5);
    expect(a.data.startNeed).toBeLessThanOrEqual(40);
    expect(w.state.people[w.mira]!.needs.hygiene).toBeGreaterThan(a.data.startNeed as number);
    const recorded = a.data.startNeed;
    runTicks(h, 4);
    expect(head(h, w.mira)!.data.startNeed).toBe(recorded);
    expect(head(h, w.mira)!.data.startNeedId).toBe('hygiene');
  });

  it('records a null start for fixed-duration actions', () => {
    const w = quietWorld();
    const h = harness(w.state);
    watchTv(h, w);
    runUntil(h, () => head(h, w.mira)?.phase === 'perform');
    const a = head(h, w.mira)!;
    expect(a.data.startNeedId).toBeNull();
    expect(a.data.startNeed).toBeNull();
  });
});
