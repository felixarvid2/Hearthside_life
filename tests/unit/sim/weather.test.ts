// Milestone 12: weather planning, the stored forecast, the outdoor test and the interaction gate. Weather is planned
// from a hash of (seed, day, half, season) and never from the world RNG, so it is deterministic and a reload keeps it.

import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, START_MINUTE } from '../../../src/core/clock';
import { edgeKey } from '../../../src/core/ids';
import type { Lot, WorldState } from '../../../src/core/types';
import { candidatesFor } from '../../../src/sim/autonomy';
import {
  HALF_DAY_MINUTES, WEATHER_KINDS, WEATHER_NAMES, currentSeason, currentWeather, ensureWeather, forecastLine, hasWinterOutfit, isOutdoors,
  planHalfDay, planWeather, updateWeatherMoods, weatherGateReason, weatherSentiment, weightsFor,
} from '../../../src/sim/weather';
import { buildWorld, fixtureContent, harness, lotLocation, place, pureCtx } from './fixtures';
import type { ContentDB } from '../../../src/content/types';

function setWeather(w: WorldState, current: 'clear' | 'cloudy' | 'rain' | 'snow', day = 0): void {
  w.weather = { current, today: [current, current], tomorrow: ['clear', 'clear'], day, since: day * MINUTES_PER_DAY };
}

function at(day: number, minute: number): number { return day * MINUTES_PER_DAY + minute; }

/** Seals the four tiles of the lot's north-west corner into a real indoor room (the fixture house is open to the border). */
function indoorRoom(lot: Lot): void {
  const edges = [
    ['h', 0, 0], ['h', 1, 0], ['h', 0, 2], ['h', 1, 2],
    ['v', 0, 0], ['v', 0, 1], ['v', 2, 0], ['v', 2, 1],
  ] as const;
  for (const [dir, x, z] of edges) {
    const id = edgeKey(0, dir, x, z);
    lot.walls[id] = { id, level: 0, dir, x, z, height: 2.8, sideA: { designId: 'plain-paint', paletteId: 'p0' }, sideB: { designId: 'plain-paint', paletteId: 'p0' } };
  }
}

/** Fixture content plus the real weather moodlets and a winter coat, which the fixture does not need otherwise. */
function weatherContent(): ContentDB {
  const c = fixtureContent();
  const defs: Array<[string, number, number]> = [
    ['lovelyWeather', 6, 90], ['gloomyDay', -5, 120], ['cosyRain', 5, 120],
    ['snowDay', 10, 180], ['caughtInRain', -4, 60], ['chilly', -6, 90],
  ];
  for (const [id, value, minutes] of defs) c.moodlets[id] = { id, name: id, description: '', icon: 'sun', value, minutes };
  c.garments['coat-winter'] = {
    id: 'coat-winter', name: 'Winter coat', description: '', layer: 'outer', categories: ['everyday'], tags: ['coat'],
    patterns: ['solid'], defaultColor: '#333333', build: {}, status: 'ready',
  };
  c.traits['gloomy'] = {
    id: 'gloomy', name: 'Gloomy', description: '', icon: 'cloud', category: 'social', conflicts: [],
    effects: { weatherBias: { cloudy: 0.7, clear: 0.9 } }, effectText: [], status: 'ready',
  };
  return c;
}

describe('weather planning', () => {
  it('is deterministic for the same seed, day, half and season', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      for (const day of [0, 1, 7, 42, 500]) {
        const first = planWeather(1234, day, season);
        expect(planWeather(1234, day, season)).toEqual(first);
        expect(planHalfDay(1234, day, 0, season)).toBe(first[0]);
        expect(planHalfDay(1234, day, 1, season)).toBe(first[1]);
      }
    }
    // different seeds and days actually produce different plans somewhere
    const seen = new Set<string>();
    for (let seed = 1; seed <= 5; seed++) for (let day = 0; day < 10; day++) seen.add(planWeather(seed, day, 'autumn').join('/'));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('never plans snow outside winter, and rain is possible in every season', () => {
    const rainy = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      for (let day = 0; day < 60; day++) {
        for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
          const plan = planWeather(seed, day, season);
          if (season !== 'winter') expect(plan).not.toContain('snow');
          if (plan.includes('rain')) rainy.add(season);
        }
      }
    }
    expect([...rainy].sort()).toEqual(['autumn', 'spring', 'summer', 'winter']);
  });

  it('follows the seasonal chances: summer clearest, autumn rainiest, winter has snow', () => {
    const count = (season: 'spring' | 'summer' | 'autumn' | 'winter') => {
      const out = { clear: 0, cloudy: 0, rain: 0, snow: 0, total: 0 };
      for (let i = 0; i < 1000; i++) {
        // one world seed, consecutive days: this is what a real game walks through
        for (const kind of planWeather(101, i, season)) { out[kind]++; out.total++; }
      }
      return out;
    };
    const spring = count('spring'), summer = count('summer'), autumn = count('autumn'), winter = count('winter');
    expect(summer.clear / summer.total).toBeGreaterThan(0.5);
    expect(autumn.rain / autumn.total).toBeGreaterThan(0.3);
    expect(autumn.rain / autumn.total).toBeGreaterThan(summer.rain / summer.total + 0.10);
    expect(summer.clear / summer.total).toBeGreaterThan(autumn.clear / autumn.total);
    expect(spring.snow).toBe(0);
    expect(summer.snow).toBe(0);
    expect(autumn.snow).toBe(0);
    expect(winter.snow / winter.total).toBeGreaterThan(0.15);
    expect(winter.clear / winter.total).toBeLessThan(summer.clear / summer.total);
    // the weights are copies: a caller cannot mutate the table
    const w = weightsFor('summer');
    w.rain = 99;
    expect(weightsFor('summer').rain).toBeLessThan(1);
    expect(WEATHER_KINDS).toEqual(['clear', 'cloudy', 'rain', 'snow']);
  });

  it('turning weather off means every half-day is clear', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      for (let day = 0; day < 30; day++) expect(planWeather(7, day, season, false)).toEqual(['clear', 'clear']);
    }
  });
});

describe('stored weather and reloads', () => {
  it('plans the current day and tomorrow once and keeps them', () => {
    const { state: w } = buildWorld({ seed: 42 });
    const h = harness(w, weatherContent());
    const ctx = pureCtx(h);
    const weather = ensureWeather(ctx);
    expect(weather.day).toBe(0);
    expect(weather.today).toEqual(planWeather(42, 0, 'spring', true));
    expect(weather.tomorrow).toEqual(planWeather(42, 1, 'spring', true));
    expect(weather.current).toBe(weather.today[0]);
    expect(weather.since).toBe(0);
    expect(currentWeather(w)).toBe(weather.current);
    // calling again at the same minute changes nothing
    const again = ensureWeather(ctx);
    expect(again).toEqual(weather);
  });

  it('keeps the stored plan across a reload and rolls it over at midnight', () => {
    const { state: w } = buildWorld({ seed: 9 });
    const h = harness(w, weatherContent());
    const first = ensureWeather(pureCtx(h));
    const saved = JSON.parse(JSON.stringify(first)) as typeof first;
    // a reload: the plan is read back from the save at the same minute
    w.weather = saved;
    expect(ensureWeather(pureCtx(h))).toEqual(saved);
    const plannedTomorrow = [...saved.tomorrow] as [typeof saved.current, typeof saved.current];
    // next day: yesterday's tomorrow becomes today, and a new tomorrow is planned
    w.clock.minutes = at(1, START_MINUTE);
    const next = ensureWeather(pureCtx(h));
    expect(next.day).toBe(1);
    expect(next.today).toEqual(plannedTomorrow);
    expect(next.tomorrow).toEqual(planWeather(9, 2, 'spring', true));
    // and at noon the second half of the day takes over
    w.clock.minutes = at(1, HALF_DAY_MINUTES);
    const afternoon = ensureWeather(pureCtx(h));
    expect(afternoon.current).toBe(afternoon.today[1]);
    expect(afternoon.since).toBe(at(1, HALF_DAY_MINUTES));
  });

  it('re-plans malformed or forced data and honours the settings', () => {
    const { state: w } = buildWorld({ seed: 3 });
    const h = harness(w, weatherContent());
    ensureWeather(pureCtx(h));
    w.weather!.today = ['rain'] as unknown as ['rain', 'rain'];
    const repaired = ensureWeather(pureCtx(h));
    expect(repaired.today).toEqual(planWeather(3, 0, 'spring', true));
    const forced = ensureWeather(pureCtx(h), true);
    expect(forced.today).toEqual(planWeather(3, 0, 'spring', true));
    // weather off: clear everywhere, whatever was stored
    w.settings.weather = false;
    w.weather!.current = 'snow';
    const off = ensureWeather(pureCtx(h), true);
    expect(off.current).toBe('clear');
    expect(off.today).toEqual(['clear', 'clear']);
    expect(off.tomorrow).toEqual(['clear', 'clear']);
    expect(currentWeather(w)).toBe('clear');
    // …and back on plans again
    w.settings.weather = true;
    expect(ensureWeather(pureCtx(h), true).current).not.toBe('snow');
  });

  it('settles snow cover in winter and drops it outside winter or with seasons off', () => {
    const { state: w } = buildWorld({ seed: 5 });
    const h = harness(w, weatherContent());
    w.clock.minutes = at(21, START_MINUTE); // winter, default 7-day seasons
    expect(currentSeason(w)).toBe('winter');
    w.weather = { current: 'snow', today: ['snow', 'clear'], tomorrow: ['clear', 'clear'], day: 21, since: at(21, 0) };
    const snow = ensureWeather(pureCtx(h));
    expect(snow.snowCover).toBe(true);
    // once it has snowed, the cover stays for the rest of the winter
    w.clock.minutes = at(22, START_MINUTE);
    w.weather = { current: 'clear', today: ['clear', 'clear'], tomorrow: ['clear', 'clear'], day: 22, since: at(22, 0), snowCover: true };
    expect(ensureWeather(pureCtx(h)).snowCover).toBe(true);
    // spring never keeps snow
    w.clock.minutes = at(28, START_MINUTE);
    w.weather = { current: 'clear', today: ['clear', 'clear'], tomorrow: ['clear', 'clear'], day: 28, since: at(28, 0), snowCover: true };
    expect(ensureWeather(pureCtx(h)).snowCover).toBeUndefined();
    // turning seasons off turns the snow away too
    w.clock.minutes = at(21, START_MINUTE);
    w.weather = { current: 'snow', today: ['snow', 'snow'], tomorrow: ['clear', 'clear'], day: 21, since: at(21, 0), snowCover: true };
    w.settings.seasons = false;
    expect(ensureWeather(pureCtx(h)).snowCover).toBeUndefined();
  });

  it('builds the HUD and forecast text', () => {
    const { state: w } = buildWorld({ seed: 8 });
    const h = harness(w, weatherContent());
    expect(forecastLine(w)).toMatch(/not planned yet/);
    const weather = ensureWeather(pureCtx(h));
    const n = (kind: keyof typeof WEATHER_NAMES) => WEATHER_NAMES[kind];
    expect(forecastLine(w)).toBe(
      `Forecast: today ${n(weather.today[0])} then ${n(weather.today[1])} · tomorrow ${n(weather.tomorrow[0])} then ${n(weather.tomorrow[1])}.`,
    );
    w.settings.weather = false;
    expect(forecastLine(w)).toMatch(/turned off/);
  });
});

describe('outdoors and interaction gate', () => {
  it('knows the open air from an indoor room', () => {
    const { state: w, lot, mira, theo } = buildWorld({ seed: 1 });
    const h = harness(w, weatherContent());
    const ctx = pureCtx(h);
    const miraP = w.people[mira]!;
    expect(isOutdoors(ctx, miraP)).toBe(true); // (8,8), south of the house
    expect(isOutdoors(ctx, w.people[theo]!)).toBe(true);
    indoorRoom(lot);
    miraP.location = lotLocation(lot, 0, 0); // a sealed room
    expect(isOutdoors(ctx, miraP)).toBe(false);
    miraP.location = lotLocation(lot, 2, 2); // the open yard beyond it
    expect(isOutdoors(ctx, miraP)).toBe(true);
    miraP.location = { kind: 'offlot', place: 'work', since: 0, until: null };
    expect(isOutdoors(ctx, miraP)).toBe(false);
  });

  it('reads the winter outfit from the worn outfit', () => {
    const { state: w, mira } = buildWorld({ seed: 1 });
    const c = weatherContent();
    const p = w.people[mira]!;
    expect(hasWinterOutfit(p, c)).toBe(false);
    p.outfits.outfits.everyday![0]!.layers.outer = { garmentId: 'coat-winter', color: '#333333', pattern: 'solid', patternColor: '#ffffff' };
    expect(hasWinterOutfit(p, c)).toBe(true);
  });

  it('gives a reason for every kind of blocked rule', () => {
    expect(weatherGateReason(undefined, 'rain', 'spring')).toBeNull();
    expect(weatherGateReason({ not: ['rain'] }, 'rain', 'spring')).toBe('It is raining.');
    expect(weatherGateReason({ not: ['snow'] }, 'snow', 'winter')).toBe('It is snowing.');
    expect(weatherGateReason({ not: ['cloudy'] }, 'cloudy', 'autumn')).toBe('It is cloudy today.');
    expect(weatherGateReason({ not: ['rain'] }, 'clear', 'summer')).toBeNull();
    expect(weatherGateReason({ only: ['rain'] }, 'clear', 'summer')).toBe('Not possible in clear weather.');
    expect(weatherGateReason({ only: ['rain', 'snow'] }, 'rain', 'winter')).toBeNull();
    expect(weatherGateReason({ seasons: ['winter'] }, 'clear', 'summer')).toBe('Only available in winter.');
    expect(weatherGateReason({ seasons: ['spring', 'autumn'] }, 'clear', 'summer')).toBe('Only available in spring or autumn.');
    expect(weatherGateReason({ seasons: ['spring', 'summer', 'autumn'] }, 'rain', 'autumn')).toBeNull();
  });

  it('greys out an outdoor interaction in rain instead of hiding it, and autonomy skips it', () => {
    const { state: w, lot, mira } = buildWorld({ seed: 1, autonomy: true, visitors: false });
    const c = weatherContent();
    c.objects['sun-lounger'] = { ...c.objects['chair-dining-oak']!, id: 'sun-lounger', interactions: ['sunbathe'] };
    c.interactions.sunbathe = {
      ...c.interactions.sit!, id: 'sunbathe', name: 'Sunbathe', icon: 'sun',
      weather: { not: ['rain', 'snow'] }, autonomy: { enabled: true, ads: { fun: 100 }, tags: ['outdoor'] },
    };
    const h = harness(w, c);
    const lounger = place(w, lot, 'sun-lounger', 8, 10);
    const p = w.people[mira]!;
    for (const k of Object.keys(p.needs) as Array<keyof typeof p.needs>) p.needs[k] = 70;
    p.needs.fun = 5;
    const target = { kind: 'object' as const, objectId: lounger.id, slotId: null };

    setWeather(w, 'rain');
    const rainOption = h.sim.options(mira, target).find((o) => o.interactionId === 'sunbathe');
    expect(rainOption, 'the option is still offered').toBeDefined();
    expect(rainOption!.enabled).toBe(false);
    expect(rainOption!.reason).toBe('It is raining.');
    expect(candidatesFor(pureCtx(h), p).some((x) => x.req.interactionId === 'sunbathe')).toBe(false);

    setWeather(w, 'clear');
    const clearOption = h.sim.options(mira, target).find((o) => o.interactionId === 'sunbathe');
    expect(clearOption!.enabled).toBe(true);
    expect(candidatesFor(pureCtx(h), p).some((x) => x.req.interactionId === 'sunbathe')).toBe(true);

    setWeather(w, 'snow');
    expect(h.sim.options(mira, target).find((o) => o.interactionId === 'sunbathe')!.reason).toBe('It is snowing.');
  });
});

describe('weather moodlets', () => {
  it('scales sentiment from likes, dislikes and trait leanings, clamped', () => {
    const { state: w, mira } = buildWorld({ seed: 1 });
    const c = weatherContent();
    const p = w.people[mira]!;
    expect(weatherSentiment(p, c, 'rain')).toBe(1);
    p.likes = ['weather:rain'];
    expect(weatherSentiment(p, c, 'rain')).toBeCloseTo(1.6);
    p.likes = [];
    p.dislikes = ['weather:sun'];
    expect(weatherSentiment(p, c, 'clear')).toBeCloseTo(0.5);
    p.dislikes = ['weather:cold'];
    expect(weatherSentiment(p, c, 'snow')).toBeCloseTo(0.4);
    p.dislikes = [];
    p.traits = ['gloomy'];
    expect(weatherSentiment(p, c, 'cloudy')).toBeCloseTo(0.7);
    p.likes = ['weather:rain'];
    p.traits = [];
    for (const t of ['cheerful', 'lazy', 'foodie']) p.traits.push(t);
    // fixture traits have no weather bias, so nothing changes
    expect(weatherSentiment(p, c, 'rain')).toBeCloseTo(1.6);
  });

  it('gives caught in the rain outdoors and a cosy mood indoors, once, with a cooldown', () => {
    const { state: w, lot, mira, theo } = buildWorld({ seed: 1 });
    const c = weatherContent();
    const h = harness(w, c);
    indoorRoom(lot);
    const outdoors = w.people[mira]!;
    const indoors = w.people[theo]!;
    indoors.location = lotLocation(lot, 0, 0);
    setWeather(w, 'rain');
    w.clock.minutes = at(0, START_MINUTE);
    updateWeatherMoods(pureCtx(h));
    const caught = outdoors.moodlets.find((m) => m.id === 'caughtInRain');
    expect(caught?.value).toBe(-4);
    expect(indoors.moodlets.map((m) => m.id)).toEqual(['cosyRain']);
    expect(indoors.moodlets[0]!.value).toBe(5);
    // calling again in the same check does not stack
    expect(outdoors.moodlets.filter((m) => m.id === 'caughtInRain')).toHaveLength(1);
    updateWeatherMoods(pureCtx(h));
    expect(outdoors.moodlets.filter((m) => m.id === 'caughtInRain')).toHaveLength(1);
    // fifteen minutes later the cooldown still holds…
    const until = caught!.until ?? 0;
    w.clock.minutes = at(0, START_MINUTE + 15);
    updateWeatherMoods(pureCtx(h));
    expect(outdoors.moodlets.find((m) => m.id === 'caughtInRain')!.until).toBe(until);
    // …and after an hour it may refresh
    w.clock.minutes = at(0, START_MINUTE + 60);
    updateWeatherMoods(pureCtx(h));
    expect(outdoors.moodlets.find((m) => m.id === 'caughtInRain')!.until).toBeGreaterThan(until);
    expect(outdoors.moodlets.filter((m) => m.id === 'caughtInRain')).toHaveLength(1);
  });

  it('replaces the weather moodlet when the weather changes and clears stale ones', () => {
    const { state: w, lot, mira, theo } = buildWorld({ seed: 1 });
    const c = weatherContent();
    const h = harness(w, c);
    const p = w.people[mira]!;
    const other = w.people[theo]!;
    setWeather(w, 'rain');
    w.clock.minutes = at(0, START_MINUTE);
    updateWeatherMoods(pureCtx(h));
    expect(p.moodlets).toHaveLength(1);
    // the sun comes out: the rain moodlet goes, one lovely weather moodlet arrives
    setWeather(w, 'clear');
    w.clock.minutes = at(0, START_MINUTE + 15);
    updateWeatherMoods(pureCtx(h));
    expect(p.moodlets.map((m) => m.id)).toEqual(['lovelyWeather']);
    expect(p.moodlets[0]!.value).toBe(6);
    // at night there is no lovely weather; the stale moodlet is removed without a replacement
    w.clock.minutes = at(0, 21 * 60);
    setWeather(w, 'clear');
    updateWeatherMoods(pureCtx(h));
    expect(p.moodlets.some((m) => m.id === 'lovelyWeather')).toBe(false);
    // the cloudy sky with a gloomy trait gives gloomy day; other (neutral) people get nothing
    p.traits = ['gloomy'];
    other.traits = [];
    other.moodlets = [];
    setWeather(w, 'cloudy');
    w.clock.minutes = at(1, START_MINUTE + 15);
    updateWeatherMoods(pureCtx(h));
    expect(p.moodlets.map((m) => m.id)).toEqual(['gloomyDay']);
    expect(other.moodlets).toHaveLength(0);

    // make sure the lot and position really are outdoors for the first person (used above)
    expect(isOutdoors(pureCtx(h), p)).toBe(true);
    expect(lot.id).toBe(w.activeLotId);
  });

  it('snow day with a coat, chilly without one outdoors, and no moodlet for snow lovers', () => {
    const { state: w, lot, mira, theo } = buildWorld({ seed: 1 });
    const c = weatherContent();
    const h = harness(w, c);
    indoorRoom(lot);
    const cold = w.people[mira]!;
    const dressed = w.people[theo]!;
    dressed.outfits.outfits.everyday![0]!.layers.outer = { garmentId: 'coat-winter', color: '#333333', pattern: 'solid', patternColor: '#ffffff' };
    w.clock.minutes = at(21, START_MINUTE); // winter
    setWeather(w, 'snow', 21);
    updateWeatherMoods(pureCtx(h));
    expect(cold.moodlets.map((m) => m.id)).toEqual(['chilly']);
    expect(cold.moodlets[0]!.value).toBe(-6);
    expect(dressed.moodlets.map((m) => m.id)).toEqual(['snowDay']);
    expect(dressed.moodlets[0]!.value).toBe(10);
    // a snow lover outdoors without a coat still gets the chill: the coat is what matters outdoors
    cold.likes = ['weather:snow'];
    cold.moodlets = [];
    w.clock.minutes = at(21, START_MINUTE + 60);
    updateWeatherMoods(pureCtx(h));
    expect(cold.moodlets.map((m) => m.id)).toEqual(['chilly']);
    // …and indoors the snow lover is happy
    cold.location = lotLocation(lot, 0, 0);
    cold.moodlets = [];
    w.clock.minutes = at(21, START_MINUTE + 75);
    updateWeatherMoods(pureCtx(h));
    expect(cold.moodlets.map((m) => m.id)).toEqual(['snowDay']);
    expect(cold.moodlets[0]!.value).toBeGreaterThan(10);
  });
});
