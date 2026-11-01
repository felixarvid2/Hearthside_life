// GameCore's autosave policy on top of the persistence Autosaver (which decides nothing about game modes):
// - every 5 real minutes of live mode (counted from update(), not game minutes, so fast speeds do not save
//   more often);
// - 3 s (debounced) after a confirmed build/buy command, restarted when a placement or paint preview ends;
// - never while a preview is active (Autosaver's isBusy makes it retry).
// Timers run on ManualTimers advanced by update(), so the policy is reproducible in Node tests.

import type { GameMinutes, WorldState } from '../../core/types';
import { Autosaver, type SaveStore } from '../../persistence/index';
import { ManualTimers } from './timers';

export interface AutosavePolicyOptions {
  saves: SaveStore | null;
  getState: () => WorldState | null;
  /** True while a placement or paint preview is active. */
  isBusy: () => boolean;
  /** Debounce after a confirmed command, in real milliseconds. */
  delayMs: number;
  /** Real seconds of live mode between periodic saves. */
  everySeconds: number;
  onError: (message: string) => void;
}

export class AutosavePolicy {
  private readonly timers = new ManualTimers();
  private readonly autosaver: Autosaver | null;
  private running: Promise<unknown> = Promise.resolve();
  /** A save was requested and has not been written yet. */
  private pending = false;
  private liveSeconds = 0;
  private lastPeriodic = 0;

  constructor(private readonly o: AutosavePolicyOptions) {
    const saves = o.saves;
    this.autosaver = saves && saves.available ? new Autosaver({
      store: {
        autosave: (state) => {
          this.pending = false;
          const run = saves.autosave(state);
          this.running = run;
          return run;
        },
      },
      getState: o.getState,
      isBusy: o.isBusy,
      debounceMs: o.delayMs,
      // Periodic saves are driven by real live-mode time below; Autosaver.tick (game minutes) is not used.
      intervalGameMinutes: Number.POSITIVE_INFINITY,
      setTimer: this.timers.set,
      clearTimer: this.timers.clear,
      onResult: (r) => { if (!r.ok) o.onError(r.error); },
    }) : null;
  }

  /** Real time passed (every frame, any mode); `live` counts toward the periodic save. */
  advance(realSeconds: number, live: boolean): void {
    this.timers.advance(realSeconds * 1000);
    if (!live || !this.autosaver) return;
    this.liveSeconds += realSeconds;
    if (this.liveSeconds - this.lastPeriodic >= this.o.everySeconds) {
      this.lastPeriodic = this.liveSeconds;
      this.request();
    }
  }

  /** Saves after the debounce delay (e.g. after a confirmed build/buy command). */
  request(): void {
    if (!this.autosaver) return;
    this.pending = true;
    this.autosaver.requestSoon();
  }

  /** A preview just ended: a pending save waits its full delay from now. */
  previewEnded(): void {
    if (this.pending && !this.o.isBusy()) this.autosaver?.requestSoon();
  }

  /** After a new game, load or import: nothing pending, the periodic interval counts from now. */
  reset(gameMinutes: GameMinutes): void {
    this.autosaver?.reset(gameMinutes);
    this.pending = false;
    this.lastPeriodic = this.liveSeconds;
  }

  /** Saves now unless a preview is active (then it retries after the delay); resolves when written. */
  async flush(): Promise<void> {
    if (!this.autosaver) return;
    await this.autosaver.flush();
    await this.running;
  }

  /** Resolves when the save being written (if any) has finished. */
  async idle(): Promise<void> { await this.running; }
}
