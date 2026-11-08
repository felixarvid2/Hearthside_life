// Milestone 13: shade counts as shelter, rain melts snow cover, snowmen melt faster in rain, and the five-day forecast
// is deterministic and consistent with the stored plan.

import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, START_MINUTE, TICK_MINUTES } from '../../../src/core/clock';
import { OBJECTS } from '../../../src/content/objects';
import type { ContentDB, ObjectDef } from '../../../src/content/types';
import type { PlacedObject } from '../../../src/core/types';
import { newId } from '../../../src/core/ids';
import { fillWeatherDefaults } from '../../../src/persistence/schema';
import {
  FORECAST_DAYS, RAIN_MELT_MINUTES, WEATHER_NAMES, ensureWeather, forecastDays, forecastLine, forecastLines, isSheltered, meltSnowCover, planHalfDay, planWeather, shadedAt, updateWeatherMoods,
} from '../../../src/sim/weather';
import { updateSnowmen } from '../../../src/sim/snowman';
import { buildWorld, fixtureContent, harness, lotLocation, pureCtx } from './fixtures';

/** A minimal object definition (the fixture's own helper is private). */
function obj(id: string, o: Partial<ObjectDef> & { footprint: { w: number; d: number } }): ObjectDef {
  return {
    id, name: id, description: id, category: 'decor', rooms: [], style: 'test', tags: [], packs: [], tier: 'standard', price: 100, quality: 3,
    functional: false, model: { asset: id, scale: 2, offset: [0, 0, 0], yaw: 0 }, layer: 'floor', blocksMovement: true, height: 1, slots: [],
    interactions: [], stats: {}, finishes: [], status: 'ready', ...o,
  };
}

const at = (day: number, minute: number) => day * MINUTES_PER_DAY + minute;

function umbrellaContent(): ContentDB {
  const c = fixtureContent();
  const parasol: ObjectDef = { ...obj('parasol-test', { footprint: { w: 1, d: 1 } }), shelter: 1 };
  c.objects[parasol.id] = parasol;
  for (const [id, value] of [['cosyRain', 5], ['caughtInRain', -4], ['gloomyDay', -5]] as const) c.moodlets[id] = { id, name: id, description: '', icon: 'sun', value, minutes: 60 };
  return c;
}

function placeParasol(w: ReturnType<typeof buildWorld>['state'], x: number, z: number): PlacedObject {
  const lot = w.lots[w.activeLotId]!;
  const o: PlacedObject = {
    id: newId(w, 'obj'), defId: 'parasol-test', level: 0, x, z, rot: 0, finishes: {}, purchasePrice: 1, boughtAt: 0,
    ownerHouseholdId: null, condition: { dirt: 0, broken: false },
  };
  lot.objects[o.id] = o;
  return o;
}

describe('shade as shelter', () => {
  it('real umbrellas and the patio set carry a shelter radius; plain furniture has none', () => {
    const shaded = OBJECTS.filter((o) => o.shelter !== undefined).map((o) => o.id).sort();
    expect(shaded).toEqual(expect.arrayContaining(['parasol-standing', 'table-patio']));
    expect(OBJECTS.find((o) => o.id === 'sofa-tweed')?.shelter).toBeUndefined();
  });

  it('tiles within the radius of the object are shaded, farther ones are not, and a broken one gives no shade', () => {
    const { state: w } = buildWorld({ seed: 1 });
    const c = umbrellaContent();
    const lot = w.lots[w.activeLotId]!;
    const o = placeParasol(w, 6, 6);
    expect(shadedAt(w, c, lot.id, 0, 6.5, 6.5)).toBe(true);
    expect(shadedAt(w, c, lot.id, 0, 7.5, 5.5)).toBe(true); // one tile out
    expect(shadedAt(w, c, lot.id, 0, 8.5, 6.5)).toBe(false);
    expect(shadedAt(w, c, lot.id, 1, 6.5, 6.5)).toBe(false); // another level
    o.condition.broken = true;
    expect(shadedAt(w, c, lot.id, 0, 6.5, 6.5)).toBe(false);
  });

  it('a person under the umbrella is sheltered and gets the cosy-rain mood instead of being caught in the rain', () => {
    const { state: w, lot, mira, theo } = buildWorld({ seed: 1 });
    const c = umbrellaContent();
    const h = harness(w, c);
    w.people[mira]!.location = lotLocation(lot, 8, 8);
    w.people[theo]!.location = lotLocation(lot, 8, 8);
    const pole = placeParasol(w, 20, 20); // far away: nobody is under it yet
    w.clock.minutes = at(0, 10 * 60);
    w.weather = { current: 'rain', today: ['rain', 'rain'], tomorrow: ['clear', 'clear'], day: 0, since: 0 };
    const ctx = pureCtx(h);
    expect(isSheltered(ctx, w.people[mira]!)).toBe(false);
    pole.x = 8; pole.z = 8;
    expect(isSheltered(ctx, w.people[mira]!)).toBe(true);
    w.people[theo]!.location = lotLocation(lot, 12, 8); // two tiles from the 1x1 pole at (8,8): outside the radius of 1
    expect(isSheltered(ctx, w.people[theo]!)).toBe(false);
    updateWeatherMoods(ctx);
    expect(w.people[mira]!.moodlets.some((m) => m.id === 'caughtInRain')).toBe(false);
    expect(w.people[theo]!.moodlets.some((m) => m.id === 'caughtInRain')).toBe(true);
  });
});

describe('rain melts the snow cover', () => {
  it('three hours of rain wash the cover away, snow resets the count', () => {
    const { state: w } = buildWorld({ seed: 5 });
    const ctx = { state: w };
    w.clock.minutes = at(22, START_MINUTE);
    w.weather = { current: 'rain', today: ['rain', 'rain'], tomorrow: ['clear', 'clear'], day: 22, since: at(22, 0), snowCover: true };
    let melted = false;
    let minutes = 0;
    while (!melted && minutes < 400) { melted = meltSnowCover(ctx, TICK_MINUTES); minutes += TICK_MINUTES; }
    expect(melted).toBe(true);
    expect(minutes).toBeCloseTo(RAIN_MELT_MINUTES, 0);
    expect(w.weather.snowCover).toBeUndefined();
    expect(w.weather.melt).toBeUndefined();

    // clear weather does not melt it; snowfall clears the counter
    w.weather = { current: 'clear', today: ['clear', 'clear'], tomorrow: ['clear', 'clear'], day: 22, since: at(22, 0), snowCover: true, melt: 100 };
    expect(meltSnowCover(ctx, 60)).toBe(false);
    expect(w.weather.melt).toBe(100);
    const h = harness(w, fixtureContent());
    w.weather.current = 'snow';
    w.weather.today = ['snow', 'snow'];
    ensureWeather(pureCtx(h));
    expect(w.weather.melt).toBeUndefined();
  });

  it('the melt counter survives the midnight re-plan and a save repair, and the cover stays gone after melting', () => {
    let seed = 1;
    while (planHalfDay(seed, 23, 0, 'winter') === 'snow') seed++;
    const { state: w } = buildWorld({ seed });
    const h = harness(w, fixtureContent());
    w.clock.minutes = at(22, 23 * 60 + 59);
    w.weather = { current: 'rain', today: ['rain', 'rain'], tomorrow: ['cloudy', 'cloudy'], day: 22, since: at(22, 720), snowCover: true, melt: 90 };
    w.clock.minutes = at(23, 5);
    const next = ensureWeather(pureCtx(h));
    expect(next.snowCover).toBe(true);
    expect(next.melt).toBe(90);
    const raw = JSON.parse(JSON.stringify({ settings: w.settings, weather: next })) as Record<string, unknown>;
    fillWeatherDefaults(raw);
    expect((raw.weather as { melt?: number }).melt).toBe(90);
    // afternoon rain after a snowy morning does not bring the cover back once it melted
    w.clock.minutes = at(24, 13 * 60);
    w.weather = { current: 'rain', today: ['snow', 'rain'], tomorrow: ['clear', 'clear'], day: 24, since: at(24, 720) };
    expect(ensureWeather(pureCtx(h)).snowCover).toBeUndefined();
  });

  it('a rainy day counts as two warm days for a snowman', () => {
    const { state: w } = buildWorld({ seed: 5 });
    const c = fixtureContent();
    const lot = w.lots[w.activeLotId]!;
    const man = { ...obj('snowman', { footprint: { w: 1, d: 1 } }) };
    c.objects.snowman = man;
    const o: PlacedObject = {
      id: newId(w, 'obj'), defId: 'snowman', level: 0, x: 3, z: 3, rot: 0, finishes: {}, purchasePrice: 1, boughtAt: 0, ownerHouseholdId: null,
      condition: { dirt: 0, broken: false }, snowman: { madeAt: 0, warmDays: 0 },
    };
    lot.objects[o.id] = o;
    w.clock.minutes = at(21, 12 * 60); // winter
    w.weather = { current: 'rain', today: ['rain', 'rain'], tomorrow: ['clear', 'clear'], day: 21, since: at(21, 0) };
    const h = harness(w, c);
    updateSnowmen(pureCtx(h));
    expect(o.snowman!.warmDays).toBe(2);
    w.clock.minutes = at(22, 12 * 60);
    w.weather = { current: 'clear', today: ['clear', 'clear'], tomorrow: ['clear', 'clear'], day: 22, since: at(22, 0) };
    updateSnowmen(pureCtx(h));
    expect(lot.objects[o.id]).toBeUndefined(); // 2 + 1 = three warm days
  });
});

describe('five-day forecast', () => {
  it('lists today first, matches the stored plan for today and tomorrow, and plans later days deterministically', () => {
    const { state: w } = buildWorld({ seed: 77 });
    const h = harness(w, fixtureContent());
    w.clock.minutes = at(10, START_MINUTE);
    ensureWeather(pureCtx(h));
    const f = forecastDays(w);
    expect(f).toHaveLength(FORECAST_DAYS);
    expect(f.map((d) => d.day)).toEqual([10, 11, 12, 13, 14]);
    expect(f[0]!.halves).toEqual(w.weather!.today);
    expect(f[1]!.halves).toEqual(w.weather!.tomorrow);
    expect(f[0]!.label).toBe('Today');
    expect(f[1]!.label).toBe('Tomorrow');
    for (const d of f.slice(2)) expect(d.halves).toEqual(planWeather(77, d.day, d.season, true));
    expect(forecastDays(w)).toEqual(f); // pure
    expect(forecastLines(w)).toHaveLength(FORECAST_DAYS);
    // the old two-day text names the same weather for tomorrow
    expect(forecastLine(w)).toContain(WEATHER_NAMES[f[1]!.halves[0]]);
  });

  it('what is forecast for day N is what the daily plan stores when day N arrives', () => {
    const { state: w } = buildWorld({ seed: 31 });
    const h = harness(w, fixtureContent());
    w.clock.minutes = at(3, START_MINUTE);
    ensureWeather(pureCtx(h));
    const four = forecastDays(w)[4]!; // day 7 is index 4 from day 3
    expect(four.day).toBe(7);
    w.clock.minutes = at(7, START_MINUTE);
    const w7 = ensureWeather(pureCtx(h));
    expect(w7.today).toEqual(four.halves);
  });

  it('is all clear with weather off', () => {
    const { state: w } = buildWorld({ seed: 77 });
    w.settings.weather = false;
    for (const d of forecastDays(w)) expect(d.halves).toEqual(['clear', 'clear']);
    expect(forecastLines(w)).toEqual(['Weather is turned off: every day is clear.']);
  });
});
