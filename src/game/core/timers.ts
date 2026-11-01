// Manual timers driven by GameCore.update(realSeconds) instead of the browser's setTimeout, so debounced work
// (the autosave after a build command) runs in the game loop's real time and is reproducible in Node tests.

export class ManualTimers {
  private nowMs = 0;
  private seq = 0;
  private readonly due = new Map<number, { at: number; fn: () => void }>();

  /** setTimeout replacement: runs `fn` once `ms` of advanced time has passed. Returns a handle for clear(). */
  readonly set = (fn: () => void, ms: number): unknown => {
    const id = ++this.seq;
    this.due.set(id, { at: this.nowMs + Math.max(0, ms), fn });
    return id;
  };

  /** clearTimeout replacement. */
  readonly clear = (handle: unknown): void => { this.due.delete(handle as number); };

  /** Advances time and runs every timer that became due, in due order (timers set by a callback run when due). */
  advance(ms: number): void {
    if (ms > 0) this.nowMs += ms;
    for (let guard = 0; guard < 1000; guard++) {
      let nextId = -1, nextAt = Infinity;
      for (const [id, t] of this.due) if (t.at <= this.nowMs && t.at < nextAt) { nextAt = t.at; nextId = id; }
      if (nextId < 0) return;
      const t = this.due.get(nextId)!;
      this.due.delete(nextId);
      t.fn();
    }
  }

  /** Number of pending timers (tests, developer overlay). */
  pending(): number { return this.due.size; }

  clearAll(): void { this.due.clear(); }
}
