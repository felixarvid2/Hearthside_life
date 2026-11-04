// Milestone 12: seasons are a pure function of the game clock and the season length setting. Day 0 is the first day of
// spring; every `seasonDays` days the season advances and wraps after winter. Turning seasons off reads as spring.

import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../../../src/core/clock';
import {
  DEFAULT_SEASON_DAYS, SEASON_DAYS_OPTIONS, SEASONS, dayWithinSeason, nextSeasonChange, seasonDays, seasonFor, seasonForDay, seasonsOn,
} from '../../../src/core/season';

const at = (day: number, minute = 0) => day * MINUTES_PER_DAY + minute;

describe('season maths', () => {
  it('offers 3, 7 or 14 day seasons and defaults to 7', () => {
    expect([...SEASON_DAYS_OPTIONS]).toEqual([3, 7, 14]);
    expect(DEFAULT_SEASON_DAYS).toBe(7);
    expect(seasonDays(undefined)).toBe(7);
    expect(seasonDays({})).toBe(7);
    expect(seasonDays({ seasonDays: 3 })).toBe(3);
    expect(seasonDays({ seasonDays: 14 })).toBe(14);
    expect(seasonDays({ seasonDays: 5 })).toBe(7);
    expect(seasonsOn(undefined)).toBe(true);
    expect(seasonsOn({ seasons: false })).toBe(false);
  });

  it('day 0 is spring and seasons advance every seven days, wrapping after winter', () => {
    expect(seasonForDay(0)).toBe('spring');
    expect(seasonForDay(6)).toBe('spring');
    expect(seasonForDay(7)).toBe('summer');
    expect(seasonForDay(13)).toBe('summer');
    expect(seasonForDay(14)).toBe('autumn');
    expect(seasonForDay(20)).toBe('autumn');
    expect(seasonForDay(21)).toBe('winter');
    expect(seasonForDay(27)).toBe('winter');
    expect(seasonForDay(28)).toBe('spring');
    expect(seasonForDay(55)).toBe('winter');
    // the last minute of a day still belongs to that day
    expect(seasonFor(at(6, MINUTES_PER_DAY - 1))).toBe('spring');
    expect(seasonFor(at(7))).toBe('summer');
  });

  it('uses the chosen season length and validates it', () => {
    const three = { seasonDays: 3 };
    expect(seasonForDay(2, 3)).toBe('spring');
    expect(seasonForDay(3, 3)).toBe('summer');
    expect(seasonForDay(9, 3)).toBe('winter');
    expect(seasonForDay(12, 3)).toBe('spring');
    expect(seasonFor(at(2, 720), three)).toBe('spring');
    expect(seasonFor(at(3), three)).toBe('summer');
    expect(seasonForDay(13, 14)).toBe('spring');
    expect(seasonForDay(14, 14)).toBe('summer');
    expect(seasonForDay(42, 14)).toBe('winter');
    expect(seasonForDay(56, 14)).toBe('spring');
    // an unknown length falls back to seven days
    expect(seasonForDay(7, 99)).toBe('summer');
  });

  it('day within the season is 1-based and resets on the boundary', () => {
    expect(dayWithinSeason(at(0))).toBe(1);
    expect(dayWithinSeason(at(6, 1439))).toBe(7);
    expect(dayWithinSeason(at(7))).toBe(1);
    expect(dayWithinSeason(at(27))).toBe(7);
    expect(dayWithinSeason(at(28))).toBe(1);
    expect(dayWithinSeason(at(4), { seasonDays: 3 })).toBe(2);
  });

  it('finds the next season change', () => {
    expect(nextSeasonChange(at(0))).toEqual({ at: at(7), season: 'summer' });
    expect(nextSeasonChange(at(3, 600))).toEqual({ at: at(7), season: 'summer' });
    expect(nextSeasonChange(at(20, 1439))).toEqual({ at: at(21), season: 'winter' });
    expect(nextSeasonChange(at(21))).toEqual({ at: at(28), season: 'spring' });
    expect(nextSeasonChange(at(0), { seasonDays: 3 })).toEqual({ at: at(3), season: 'summer' });
    expect(nextSeasonChange(at(10), { seasons: false })).toBeNull();
  });

  it('seasons off is a perpetual spring at any day, with no season changes', () => {
    for (const day of [0, 7, 21, 365, 10_000]) {
      expect(seasonForDay(day, 7, false)).toBe('spring');
      expect(seasonFor(at(day, 900), { seasons: false })).toBe('spring');
    }
    expect(SEASONS).toEqual(['spring', 'summer', 'autumn', 'winter']);
  });
});
