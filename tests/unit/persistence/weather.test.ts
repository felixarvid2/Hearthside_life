// Milestone 12: the weather and season settings and the stored forecast are optional additions to schema 1. Saves
// without them load unchanged, a valid forecast survives a save/load untouched, and malformed values are repaired
// (dropped) instead of breaking the save. No schema version bump is needed.

import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../../../src/core/types';
import type { WorldState } from '../../../src/core/types';
import { fillWeatherDefaults, migrate, validateWorld } from '../../../src/persistence/schema';
import { validateStructure } from '../../../src/persistence/structure';
import { makeContent, makeWorld } from './fixtures';

function withWeather(): WorldState {
  const w = makeWorld();
  w.settings.seasons = false;
  w.settings.seasonDays = 14;
  w.settings.weather = true;
  w.weather = { current: 'rain', today: ['cloudy', 'rain'], tomorrow: ['clear', 'snow'], day: 3, since: 4320, snowCover: true };
  return w;
}

const rawOf = (w: WorldState) => JSON.parse(JSON.stringify(w)) as Record<string, unknown> & {
  settings: Record<string, unknown>;
  weather?: Record<string, unknown>;
};

describe('weather in saves', () => {
  it('a save without weather loads unchanged and valid', () => {
    const world = makeWorld();
    expect(world.weather).toBeUndefined();
    expect(world.settings.seasons).toBeUndefined();
    expect(world.settings.weather).toBeUndefined();
    const r = migrate(JSON.parse(JSON.stringify(world)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.weather).toBeUndefined();
    expect(r.state.settings.seasons).toBeUndefined();
    expect(r.state.settings.weather).toBeUndefined();
    expect(validateWorld(r.state, makeContent()).errors).toEqual([]);
  });

  it('a valid forecast survives migrate and validation untouched', () => {
    const world = withWeather();
    const r = migrate(JSON.parse(JSON.stringify(world)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.weather).toEqual(world.weather);
    expect(r.state.settings.seasons).toBe(false);
    expect(r.state.settings.seasonDays).toBe(14);
    expect(r.state.settings.weather).toBe(true);
    expect(validateWorld(r.state, makeContent()).errors).toEqual([]);
    expect(validateStructure(JSON.parse(JSON.stringify(world))).errors).toEqual([]);
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('repairs invalid season settings and keeps the valid ones', () => {
    const raw = rawOf(withWeather());
    raw.settings.seasons = 0;
    raw.settings.weather = 'on';
    raw.settings.seasonDays = 5;
    fillWeatherDefaults(raw);
    expect(raw.settings.seasons).toBeUndefined();
    expect(raw.settings.weather).toBeUndefined();
    expect(raw.settings.seasonDays).toBeUndefined();
    raw.settings.seasons = true;
    raw.settings.weather = false;
    raw.settings.seasonDays = 3;
    fillWeatherDefaults(raw);
    expect(raw.settings.seasons).toBe(true);
    expect(raw.settings.weather).toBe(false);
    expect(raw.settings.seasonDays).toBe(3);
  });

  it('drops malformed weather records whole', () => {
    const bad: Array<(w: Record<string, unknown>) => void> = [
      (w) => { w.current = 'fog'; },
      (w) => { w.current = 3; },
      (w) => { w.today = ['rain']; },
      (w) => { w.today = ['rain', 'hail']; },
      (w) => { w.tomorrow = 'rain'; },
      (w) => { w.day = 1.5; },
      (w) => { w.day = '3'; },
      (w) => { w.since = Number.NaN; },
      (w) => { w.snowCover = 'yes'; },
      (w) => { delete w.today; },
    ];
    for (const breakIt of bad) {
      const raw = rawOf(withWeather());
      breakIt(raw.weather!);
      fillWeatherDefaults(raw);
      expect(raw.weather, String(breakIt)).toBeUndefined();
    }
    // the whole field of the wrong type goes too
    expect((() => { const raw = rawOf(withWeather()); raw.weather = 'rain' as unknown as Record<string, unknown>; fillWeatherDefaults(raw); return raw.weather; })()).toBeUndefined();
  });

  it('normalises a valid record: non-negative day and since, only a true snow cover', () => {
    const raw = rawOf(withWeather());
    raw.weather!.day = 3;
    raw.weather!.since = -5;
    fillWeatherDefaults(raw);
    expect(raw.weather!.day).toBe(3);
    expect(raw.weather!.since).toBe(0);
    expect(raw.weather!.snowCover).toBe(true);
    raw.weather!.snowCover = false;
    fillWeatherDefaults(raw);
    expect(raw.weather!.snowCover).toBeUndefined();
  });

  it('round trips through migrate twice without changing', () => {
    const first = migrate(JSON.parse(JSON.stringify(withWeather())));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = migrate(JSON.parse(JSON.stringify(first.state)));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.weather).toEqual(first.state.weather);
    expect(second.state.settings).toEqual(first.state.settings);
  });
});
