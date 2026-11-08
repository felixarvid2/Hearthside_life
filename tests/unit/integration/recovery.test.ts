// Milestone 13: the error boundary (CrashGuard) around the simulation, the diagnostic file, and recovery through GameCore.
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { CrashGuard, DIAGNOSTIC_FORMAT, buildDiagnostic, isBenignError, type CrashInfo } from '../../../src/game/crashGuard';
import { GameCore } from '../../../src/game/GameCore';
import { db, freshStore } from './harness';

function guardWithLog() {
  const shown: CrashInfo[] = [];
  let t = 0;
  const guard = new CrashGuard({ onCrash: (i) => shown.push(i), now: () => t });
  return { guard, shown, at: (ms: number) => { t = ms; } };
}

describe('CrashGuard', () => {
  it('reports a thrown exception once, halts the loop and swallows repeats while the dialog is open', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { guard, shown } = guardWithLog();
    expect(guard.run('simulation', () => { throw new Error('tick exploded'); })).toBeUndefined();
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ repeated: false, latest: { where: 'simulation', message: 'tick exploded', count: 1 } });
    expect(guard.halted).toBe(true);
    guard.run('simulation', () => { throw new Error('tick exploded'); });
    guard.run('render', () => { throw new Error('draw'); });
    expect(shown).toHaveLength(1);
    expect(guard.totalErrors).toBe(3);
    expect(guard.recent.map((r) => [r.where, r.count])).toEqual([['simulation', 2], ['render', 1]]);
  });

  it('keep playing resumes; the same fault right after shows the dialog again as repeated', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { guard, shown, at } = guardWithLog();
    const boom = () => { throw new Error('same'); };
    at(1000); guard.run('simulation', boom);
    at(1500); guard.resume();
    expect(guard.halted).toBe(false);
    expect(guard.run('simulation', () => 7)).toBe(7);
    at(2000); guard.run('simulation', boom);
    expect(shown).toHaveLength(2);
    expect(shown[1]!.repeated).toBe(true);
    at(60_000); guard.resume(); at(120_000); guard.run('simulation', boom);
    expect(shown[2]!.repeated).toBe(false); // long after the last resume
  });

  it('ignores browser noise and reports strings and odd values', () => {
    const { guard, shown } = guardWithLog();
    guard.report('ui', new Error('ResizeObserver loop completed with undelivered notifications.'));
    guard.report('ui', 'Script error.');
    expect(shown).toHaveLength(0);
    expect(isBenignError('')).toBe(true);
    guard.report('promise', { reason: 'odd' });
    expect(shown[0]!.latest.message).toBe('{"reason":"odd"}');
  });

  it('an exception in a real simulation tick is caught and the world stays usable', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const core = new GameCore({ content: db, saves: null, now: () => '2026-10-31T12:00:00.000Z' });
    core.startNewGame('guided', core.premadeHouseholds()[0]!, 3);
    const { guard, shown } = guardWithLog();
    const sim = (core as unknown as { sim: { tick(): void } }).sim;
    const real = sim.tick.bind(sim);
    let boom = true;
    sim.tick = () => { if (boom) throw new Error('simulated tick failure'); real(); };
    // what Game.step does each frame
    const frame = () => { if (!guard.halted) guard.run('simulation', () => core.update(1)); };
    frame(); frame(); frame();
    expect(shown).toHaveLength(1);
    expect(guard.halted).toBe(true);
    const before = core.state()!.clock.minutes;
    boom = false;
    guard.resume();
    frame();
    expect(core.state()!.clock.minutes).toBeGreaterThan(before);
    expect(guard.halted).toBe(false);
  });
});

describe('diagnostic file', () => {
  it('holds the errors, the environment and the world, and survives a missing world', () => {
    const { guard } = guardWithLog();
    guard.report('simulation', new Error('x'));
    const ctx = { generatedAt: '2026-11-08T10:00:00.000Z', userAgent: 'UA', viewport: '390x844', mode: 'live', speed: 2, gameMinutes: 1500 };
    const full = JSON.parse(buildDiagnostic(guard.recent, { ...ctx, worldJson: '{"clock":{"minutes":1500}}' }));
    expect(full).toMatchObject({ format: DIAGNOSTIC_FORMAT, game: { mode: 'live', speed: 2, gameMinutes: 1500 }, world: { clock: { minutes: 1500 } } });
    expect(full.errors[0]).toMatchObject({ where: 'simulation', message: 'x', count: 1 });
    expect(JSON.parse(buildDiagnostic(guard.recent, { ...ctx, worldJson: null })).world).toBeNull();
    expect(JSON.parse(buildDiagnostic(guard.recent, { ...ctx, worldJson: 'not json' })).world).toBeNull();
  });
});

describe('reload the last autosave', () => {
  it('GameCore.loadFrom restores the autosave, and a damaged one says it used a backup', async () => {
    const store = await freshStore();
    const core = new GameCore({ content: db, saves: store });
    core.startNewGame('guided', core.premadeHouseholds()[0]!, 3);
    core.advanceTicks(100);
    await core.autosave();
    const minutesA = core.state()!.clock.minutes;
    core.advanceTicks(300);
    await core.autosave();
    core.advanceTicks(50); // progress that the fault would lose
    expect((await core.loadFrom('autosave')).ok).toBe(true);
    expect(core.state()!.clock.minutes).toBeGreaterThan(minutesA);
    expect(core.state()!.clock.minutes).toBeLessThan(minutesA + 400);

    // damage the autosave: the load recovers from the history and reports it
    const dbh = (store as unknown as { db: { get(s: string, k: string): Promise<{ ok: true; value: Record<string, unknown> }>; put(s: string, k: string, v: unknown): Promise<unknown> } }).db;
    const cur = (await dbh.get('saves', 'autosave')).value;
    await dbh.put('saves', 'autosave', { ...cur, data: '{broken' });
    const r = await core.loadFrom('autosave');
    expect(r.ok).toBe(true);
    expect(r.ok && r.report?.[0]).toMatch(/was damaged.*backup.*loaded instead/);
    expect(core.state()!.clock.minutes).toBe(minutesA);
  });
});
