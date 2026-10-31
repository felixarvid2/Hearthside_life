// Autosave scheduling: debounced saves after confirmed edits and a periodic save by game time.
// It decides WHEN to autosave; SaveStore.autosave does the writing (and the backup rotation). The state is
// serialized synchronously inside autosave(), so the save always captures one consistent moment.

import type { GameMinutes, WorldState } from '../core/types';
import type { AutosaveResult } from './saves';

export interface AutosaverOptions {
  store: { autosave(state: WorldState): Promise<AutosaveResult> };
  /** The live world, or null when no game is running. */
  getState: () => WorldState | null;
  /** True while an operation is half done (e.g. a build transaction); the autosave waits and retries. */
  isBusy?: () => boolean;
  /** Quiet time after the last request before saving. Default 1500 ms. */
  debounceMs?: number;
  /** Game minutes between periodic autosaves. Default 60. */
  intervalGameMinutes?: number;
  onResult?: (result: AutosaveResult) => void;
  /** Timer functions, injectable for tests. Default: setTimeout / clearTimeout. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export class Autosaver {
  private timer: unknown = null;
  private inFlight: Promise<AutosaveResult | null> | null = null;
  private again = false;
  private lastMinutes: GameMinutes | null = null;
  private readonly debounceMs: number;
  private readonly interval: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly o: AutosaverOptions) {
    this.debounceMs = o.debounceMs ?? 1500;
    this.interval = o.intervalGameMinutes ?? 60;
    this.setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** Call after a confirmed edit (building, buying, ...). Several calls in quick succession save once. */
  requestSoon(): void {
    this.cancel();
    this.timer = this.setTimer(() => { this.timer = null; void this.flush(); }, this.debounceMs);
  }

  /** Call from the game loop with the current game time; saves when the interval has passed. */
  tick(gameMinutes: GameMinutes): void {
    if (this.lastMinutes === null || gameMinutes < this.lastMinutes) { this.lastMinutes = gameMinutes; return; }
    if (gameMinutes - this.lastMinutes >= this.interval && this.timer === null) this.requestSoon();
  }

  /** Call after a new game or a load so the periodic interval counts from there. */
  reset(gameMinutes: GameMinutes | null = null): void {
    this.cancel();
    this.lastMinutes = gameMinutes;
  }

  /** Saves now (e.g. when the page is hidden). Resolves to null when there is nothing to save or the world is busy. */
  async flush(): Promise<AutosaveResult | null> {
    this.cancel();
    if (this.inFlight) { this.again = true; return this.inFlight; }
    const state = this.o.getState();
    if (!state) return null;
    if (this.o.isBusy?.()) { this.requestSoon(); return null; }
    this.lastMinutes = state.clock.minutes;
    const run = this.o.store.autosave(state).then((r) => {
      this.inFlight = null;
      this.o.onResult?.(r);
      if (this.again) { this.again = false; this.requestSoon(); }
      return r;
    });
    this.inFlight = run;
    return run;
  }

  /** Drops a pending debounced save (a save already running finishes). */
  cancel(): void {
    if (this.timer !== null) { this.clearTimer(this.timer); this.timer = null; }
  }
}
