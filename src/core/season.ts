// Milestone 12: seasons derived from the clock. Pure helpers with no state and no RNG: day 0 is the first day of
// spring, and every `seasonDays` days the season advances. Seasons can be turned off in the world settings, which
// reads as a perpetual summer-like spring (no snow).
//
// The weather planner (sim/weather.ts) uses `seasonFor` and the same day length so the season boundaries and the
// half-day plans always agree.

import { MINUTES_PER_DAY, dayIndex } from './clock';
import type { GameMinutes, Season, SimSettings } from './types';

export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_DAYS_OPTIONS = [3, 7, 14] as const;
export const DEFAULT_SEASON_DAYS = 7;

export const SEASON_NAMES: Record<Season, string> = {
  spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter',
};

type SeasonSettings = Pick<SimSettings, 'seasons' | 'seasonDays'>;

/** Seasons are on unless the world settings say otherwise. */
export function seasonsOn(s?: Partial<SeasonSettings> | null): boolean {
  return s?.seasons !== false;
}

/** Game days per season: one of the offered lengths, else the default. */
export function seasonDays(s?: Partial<SeasonSettings> | null): number {
  const v = s?.seasonDays;
  return v === 3 || v === 7 || v === 14 ? v : DEFAULT_SEASON_DAYS;
}

/** Season of an absolute game day (day 0 = spring). Seasons off = spring. */
export function seasonForDay(day: number, days: number = DEFAULT_SEASON_DAYS, enabled = true): Season {
  if (!enabled) return 'spring';
  const d = Math.max(0, Math.floor(day));
  const span = days === 3 || days === 7 || days === 14 ? days : DEFAULT_SEASON_DAYS;
  return SEASONS[Math.floor(d / span) % SEASONS.length]!;
}

/** Season at a game minute (the clock's day boundary starts a new season). */
export function seasonFor(minutes: GameMinutes, s?: Partial<SeasonSettings> | null): Season {
  return seasonForDay(dayIndex(minutes), seasonDays(s), seasonsOn(s));
}

/** 1-based day within the current season ("Autumn, day 3"). */
export function dayWithinSeason(minutes: GameMinutes, s?: Partial<SeasonSettings> | null): number {
  return (dayIndex(minutes) % seasonDays(s)) + 1;
}

/** The first minute of the next season and that season, or null when seasons are off. */
export function nextSeasonChange(minutes: GameMinutes, s?: Partial<SeasonSettings> | null): { at: GameMinutes; season: Season } | null {
  if (!seasonsOn(s)) return null;
  const span = seasonDays(s);
  const day = dayIndex(minutes);
  const current = seasonForDay(day, span, true);
  const index = SEASONS.indexOf(current);
  return { at: (day - (day % span) + span) * MINUTES_PER_DAY, season: SEASONS[(index + 1) % SEASONS.length]! };
}

/** Whether the season is the current one (used by interaction weather rules). */
export function isSnowSeason(season: Season): boolean { return season === 'winter'; }
