// Error boundary for the game loop and the interface. An unexpected exception is recorded and handed to `onCrash`
// once (the recovery dialog); while that dialog is open the simulation is halted so a half-finished tick cannot be
// repeated sixty times a second. "Keep playing" resumes; the same fault coming back within a few seconds shows the
// dialog again. Pure logic (no DOM) so it is tested in Node.

export type CrashWhere = 'simulation' | 'render' | 'ui' | 'promise';

export interface CrashRecord {
  where: CrashWhere;
  message: string;
  stack: string;
  /** Wall-clock milliseconds (injected clock). */
  at: number;
  /** How many times this exact fault was seen (same where + message). */
  count: number;
}

export interface CrashInfo {
  latest: CrashRecord;
  /** True when this fault already came back after "keep playing". */
  repeated: boolean;
}

export interface CrashGuardOptions {
  onCrash: (info: CrashInfo) => void;
  now?: () => number;
  /** A fault seen again within this many ms of the last resume counts as repeated. Default 5000. */
  repeatWindowMs?: number;
  /** Records kept for the diagnostic file. Default 20. */
  keep?: number;
}

/** Browser noise that is not a game fault. */
export function isBenignError(message: string): boolean {
  return /ResizeObserver loop/i.test(message) || message === 'Script error.' || message === '';
}

export class CrashGuard {
  private readonly now: () => number;
  private readonly repeatWindow: number;
  private readonly keep: number;
  private records: CrashRecord[] = [];
  private _halted = false;
  private resumedAt = Number.NEGATIVE_INFINITY;
  private total = 0;

  constructor(private readonly o: CrashGuardOptions) {
    this.now = o.now ?? (() => Date.now());
    this.repeatWindow = o.repeatWindowMs ?? 5000;
    this.keep = o.keep ?? 20;
  }

  /** True while the recovery dialog is open: the loop must not advance the simulation. */
  get halted(): boolean { return this._halted; }
  /** Every fault seen so far (including ones swallowed while halted). */
  get totalErrors(): number { return this.total; }
  /** Most recent distinct faults, oldest first. */
  get recent(): readonly CrashRecord[] { return this.records; }

  /** Records a fault. Shows the dialog unless it is already showing or the message is browser noise. */
  report(where: CrashWhere, error: unknown): void {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : safeString(error);
    if (isBenignError(message)) return;
    const stack = error instanceof Error && error.stack ? error.stack : '';
    this.total++;
    let rec = this.records.find((r) => r.where === where && r.message === message);
    if (rec) { rec.count++; rec.at = this.now(); rec.stack = stack || rec.stack; } else {
      rec = { where, message, stack, at: this.now(), count: 1 };
      this.records.push(rec);
      if (this.records.length > this.keep) this.records.shift();
    }
    if (this._halted) return;
    this._halted = true;
    const repeated = rec.count > 1 && this.now() - this.resumedAt <= this.repeatWindow;
    try { this.o.onCrash({ latest: rec, repeated }); } catch (e) { console.error('[crash] could not show the recovery dialog', e); }
  }

  /** Runs `fn`; a thrown exception is reported and swallowed (returns undefined). */
  run<T>(where: CrashWhere, fn: () => T): T | undefined {
    try { return fn(); } catch (e) { if (!this._halted) console.error(`[game] ${where} error`, e); this.report(where, e); return undefined; }
  }

  /** "Keep playing": the loop runs again. */
  resume(): void {
    this._halted = false;
    this.resumedAt = this.now();
  }
}

function safeString(x: unknown): string {
  try { return typeof x === 'object' && x !== null ? JSON.stringify(x) : String(x); } catch { return 'unknown error'; }
}

// ---------------------------------------------------------------------------------------------
// Diagnostic file
// ---------------------------------------------------------------------------------------------

export const DIAGNOSTIC_FORMAT = 'hearthside-diagnostic';

export interface DiagnosticContext {
  generatedAt: string;
  userAgent: string;
  viewport: string;
  mode: string;
  speed: number;
  gameMinutes: number | null;
  /** The world as exported JSON text, or null when there is none or it could not be produced. */
  worldJson: string | null;
  note?: string;
}

/** The text of the diagnostic file: errors plus enough context to reproduce, and the world when available. */
export function buildDiagnostic(errors: readonly CrashRecord[], ctx: DiagnosticContext): string {
  let world: unknown = null;
  if (ctx.worldJson) { try { world = JSON.parse(ctx.worldJson); } catch { world = null; } }
  return JSON.stringify({
    format: DIAGNOSTIC_FORMAT,
    version: 1,
    generatedAt: ctx.generatedAt,
    environment: { userAgent: ctx.userAgent, viewport: ctx.viewport },
    game: { mode: ctx.mode, speed: ctx.speed, gameMinutes: ctx.gameMinutes },
    errors: errors.map((e) => ({ where: e.where, message: e.message, count: e.count, at: new Date(e.at).toISOString(), stack: e.stack })),
    note: ctx.note ?? null,
    world,
  }, null, 1);
}
