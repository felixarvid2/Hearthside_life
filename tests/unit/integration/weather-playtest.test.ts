// Milestone 12 headless playtest: four game weeks with seasons and weather on. Every season and every weather kind
// appears, the simulation never throws, and the household's needs stay finite and inside 0..100 while the weather
// moodlets come and go.

import { describe, expect, it } from 'vitest';
import type { ContentDB } from '../../../src/content/types';
import { MINUTES_PER_DAY, TICK_MINUTES } from '../../../src/core/clock';
import { currentSeason, currentWeather, planWeather } from '../../../src/sim/weather';
import { buildWorld, fixtureContent, harness } from '../sim/fixtures';

/** The fixture content plus the six weather moodlets (the fixture only defines the three it needs otherwise). */
function weatherContent(): ContentDB {
  const c = fixtureContent();
  const defs: Array<[string, number, number]> = [
    ['lovelyWeather', 6, 90], ['gloomyDay', -5, 120], ['cosyRain', 5, 120],
    ['snowDay', 10, 180], ['caughtInRain', -4, 60], ['chilly', -6, 90],
  ];
  for (const [id, value, minutes] of defs) c.moodlets[id] = { id, name: id, description: '', icon: 'sun', value, minutes };
  return c;
}

describe('four weeks of weather in a running simulation', { timeout: 180_000 }, () => {
  it('runs 28 days with weather on: every season and every weather kind appears and needs stay sane', () => {
    // find a deterministic seed whose first winter really snows
    let seed = 1;
    for (; seed < 100; seed++) {
      const snows = [21, 22, 23, 24, 25, 26, 27].some((day) => planWeather(seed, day, 'winter').includes('snow'));
      if (snows) break;
    }
    const { state, mira, theo } = buildWorld({ seed, autonomy: true, visitors: false, neighbour: false });
    const h = harness(state, weatherContent());
    const seasons = new Set<string>();
    const kinds = new Set<string>();
    const ticks = Math.round(28 * MINUTES_PER_DAY / TICK_MINUTES); // four ticks per game minute
    for (let i = 0; i < ticks; i++) {
      h.sim.tick();
      if (i % 12 === 0) { // every three game hours
        seasons.add(currentSeason(state));
        kinds.add(currentWeather(state));
      }
    }
    expect([...seasons].sort()).toEqual(['autumn', 'spring', 'summer', 'winter']);
    expect([...kinds].sort()).toEqual(['clear', 'cloudy', 'rain', 'snow']);
    expect(state.clock.minutes).toBeGreaterThanOrEqual(28 * MINUTES_PER_DAY);
    for (const id of [mira, theo]) {
      const p = state.people[id]!;
      for (const [need, value] of Object.entries(p.needs)) {
        expect(Number.isFinite(value), `${need} finite`).toBe(true);
        expect(value, `${need} in range`).toBeGreaterThanOrEqual(0);
        expect(value, `${need} in range`).toBeLessThanOrEqual(100);
      }
      expect(p.moodlets.length).toBeLessThanOrEqual(12);
    }
    expect(state.feed.length).toBeLessThan(1000);
  });
});
