// One authoritative clock. The simulation advances in fixed ticks of TICK_MINUTES game minutes; the
// renderer interpolates between ticks. Speed multipliers change how many ticks run per real second,
// never the tick length, so outcomes are identical across frame rates and speeds.

import type { GameMinutes } from './types';

export const TICK_MINUTES = 0.25; // 15 game seconds per tick
export const MINUTES_PER_DAY = 1440;
export const START_MINUTE = 8 * 60; // worlds start 08:00 on day 0 (Monday)

export type Speed = 0 | 1 | 2 | 3;
/** Game minutes per real second for each speed. Normal = 1 game minute per real second. */
export const SPEED_MINUTES_PER_SECOND: Record<Speed, number> = { 0: 0, 1: 1, 2: 4, 3: 15 };
export const SPEED_LABELS: Record<Speed, string> = { 0: 'Pause', 1: 'Normal', 2: 'Fast', 3: 'Very fast' };
/** Upper bound of ticks processed per rendered frame (catch-up cap). */
export const MAX_TICKS_PER_FRAME = 80;

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export function dayIndex(m: GameMinutes): number { return Math.floor(m / MINUTES_PER_DAY); }
/** 0 = Monday ... 6 = Sunday */
export function weekday(m: GameMinutes): number { return dayIndex(m) % 7; }
export function minuteOfDay(m: GameMinutes): number { return m - dayIndex(m) * MINUTES_PER_DAY; }
export function hourOfDay(m: GameMinutes): number { return minuteOfDay(m) / 60; }
export function atDayMinute(day: number, minuteOfDayValue: number): GameMinutes { return day * MINUTES_PER_DAY + minuteOfDayValue; }

export function formatClock(m: GameMinutes): string {
  const mod = Math.floor(minuteOfDay(m));
  const h = Math.floor(mod / 60), min = mod % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(min).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function formatDay(m: GameMinutes): string {
  return `${DAY_NAMES[weekday(m)]}, day ${dayIndex(m) + 1}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60), r = Math.round(minutes % 60);
  return r ? `${h} h ${r} min` : `${h} h`;
}

/**
 * Converts real elapsed time into a whole number of ticks. The accumulator holds leftover real
 * seconds; it is reset on resume so a hidden tab never produces a burst of catch-up work.
 */
export class TickAccumulator {
  private acc = 0;
  reset(): void { this.acc = 0; }
  /** Returns ticks to run this frame (capped) and the interpolation alpha for rendering. */
  advance(realSeconds: number, speed: Speed): { ticks: number; alpha: number } {
    const rate = SPEED_MINUTES_PER_SECOND[speed];
    if (rate === 0) return { ticks: 0, alpha: 1 };
    this.acc += Math.min(realSeconds, 0.25) * rate;
    let ticks = Math.floor(this.acc / TICK_MINUTES);
    if (ticks > MAX_TICKS_PER_FRAME) { ticks = MAX_TICKS_PER_FRAME; this.acc = 0; }
    else this.acc -= ticks * TICK_MINUTES;
    return { ticks, alpha: Math.min(1, this.acc / TICK_MINUTES) };
  }
}
