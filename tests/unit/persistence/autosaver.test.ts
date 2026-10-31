import { describe, expect, it } from 'vitest';
import type { WorldState } from '../../../src/core/types';
import { Autosaver } from '../../../src/persistence/autosaver';
import type { AutosaveResult } from '../../../src/persistence/saves';
import { makeWorld } from './fixtures';

/** Manual timers: nothing fires until the test says so. */
function fakeTimers() {
  let nextId = 1;
  const pending = new Map<number, { fn: () => void; ms: number }>();
  return {
    setTimer: (fn: () => void, ms: number) => { const id = nextId++; pending.set(id, { fn, ms }); return id; },
    clearTimer: (h: unknown) => { pending.delete(h as number); },
    count: () => pending.size,
    delays: () => [...pending.values()].map((t) => t.ms),
    fireAll: () => { for (const [id, t] of [...pending]) { pending.delete(id); t.fn(); } },
  };
}

function setup(opts: { busy?: () => boolean; interval?: number } = {}) {
  const timers = fakeTimers();
  const saved: WorldState[] = [];
  const results: AutosaveResult[] = [];
  let release: (() => void) | null = null;
  let hold = false;
  const world = makeWorld();
  const store = {
    autosave: (s: WorldState): Promise<AutosaveResult> => {
      saved.push(JSON.parse(JSON.stringify(s)) as WorldState);
      const result: AutosaveResult = { ok: true, rotatedBackup: false, meta: { slotId: 'autosave', name: 'Autosave', savedAt: '', gameMinutes: s.clock.minutes, householdName: '', funds: 0, schemaVersion: 1, kind: 'autosave', empty: false } };
      if (!hold) return Promise.resolve(result);
      return new Promise((resolve) => { release = () => resolve(result); });
    },
  };
  const autosaver = new Autosaver({
    store, getState: () => world, ...(opts.busy ? { isBusy: opts.busy } : {}), debounceMs: 1000,
    intervalGameMinutes: opts.interval ?? 60, onResult: (r) => results.push(r), setTimer: timers.setTimer, clearTimer: timers.clearTimer,
  });
  return { autosaver, timers, saved, results, world, holdNext: () => { hold = true; }, release: () => { hold = false; release?.(); } };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Autosaver', () => {
  it('debounces: several requests produce one save after the quiet time', async () => {
    const t = setup();
    t.autosaver.requestSoon();
    t.autosaver.requestSoon();
    t.autosaver.requestSoon();
    expect(t.timers.count()).toBe(1);
    expect(t.timers.delays()).toEqual([1000]);
    expect(t.saved).toHaveLength(0);
    t.timers.fireAll();
    await flush();
    expect(t.saved).toHaveLength(1);
    expect(t.results).toHaveLength(1);
  });

  it('waits while the world is busy (a half-finished transaction) and retries', async () => {
    let busy = true;
    const t = setup({ busy: () => busy });
    t.autosaver.requestSoon();
    t.timers.fireAll();
    await flush();
    expect(t.saved).toHaveLength(0);
    expect(t.timers.count()).toBe(1); // retry scheduled
    busy = false;
    t.timers.fireAll();
    await flush();
    expect(t.saved).toHaveLength(1);
  });

  it('saves on the game-time interval, counted from the first tick or reset', async () => {
    const t = setup({ interval: 60 });
    t.autosaver.tick(1000); // starts counting
    t.autosaver.tick(1030);
    expect(t.timers.count()).toBe(0);
    t.autosaver.tick(1061);
    expect(t.timers.count()).toBe(1);
    t.timers.fireAll();
    await flush();
    expect(t.saved).toHaveLength(1);
    expect(t.saved[0]!.clock.minutes).toBe(t.world.clock.minutes);

    // After a load of an earlier moment the interval restarts from there.
    t.autosaver.reset(500);
    t.autosaver.tick(520);
    expect(t.timers.count()).toBe(0);
    t.autosaver.tick(560);
    expect(t.timers.count()).toBe(1);
  });

  it('flush saves immediately and cancels the pending debounced save', async () => {
    const t = setup();
    t.autosaver.requestSoon();
    const r = await t.autosaver.flush();
    expect(r).toMatchObject({ ok: true });
    expect(t.saved).toHaveLength(1);
    expect(t.timers.count()).toBe(0);
  });

  it('saves again afterwards when a request arrives during a running save', async () => {
    const t = setup();
    t.holdNext();
    const first = t.autosaver.flush();
    const second = t.autosaver.flush(); // joins the running save and asks for another
    expect(t.saved).toHaveLength(1);
    t.release();
    await first; await second;
    expect(t.timers.count()).toBe(1);
    t.timers.fireAll();
    await flush();
    expect(t.saved).toHaveLength(2);
  });

  it('does nothing without a game and cancel drops a pending save', async () => {
    const timers = fakeTimers();
    const none = new Autosaver({ store: { autosave: () => Promise.reject(new Error('unused')) }, getState: () => null, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
    expect(await none.flush()).toBeNull();
    const t = setup();
    t.autosaver.requestSoon();
    t.autosaver.cancel();
    expect(t.timers.count()).toBe(0);
  });
});
