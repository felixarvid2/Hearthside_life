// Milestone 12: seasons and weather simulation. The weather is planned per half-day from the world seed and the
// absolute day (never from the world RNG, so rendering and loading do not change it), stored in WorldState.weather and
// reused across a save/load. This module also owns the weather gate for interactions, the outdoors test and the
// weather moodlets; everything here is pure simulation (no three.js, no DOM).

import type { ContentDB } from '../content/types';
import { DAY_NAMES, MINUTES_PER_DAY, dayIndex, hourOfDay, minuteOfDay } from '../core/clock';
import type { Tile } from '../core/nav';
import { SEASON_NAMES, seasonDays, seasonFor, seasonForDay, seasonsOn } from '../core/season';
import type {
  Person, Season, WeatherKind, WeatherRule, WeatherState, WorldState,
} from '../core/types';
import { computeRooms, roomIndex } from '../world/rooms';
import type { SimCtx } from './context';
import { lotLoc } from './context';
import { addMoodlet } from './mood';

export const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'cloudy', 'rain', 'snow'];
export const WEATHER_NAMES: Record<WeatherKind, string> = {
  clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', snow: 'Snow',
};
/** Each day is planned in two halves: morning (00:00-11:59) and afternoon/evening (12:00-23:59). */
export const HALF_DAY_MINUTES = MINUTES_PER_DAY / 2;

export interface WeatherWeights { clear: number; cloudy: number; rain: number; snow: number }

/** Chance weights per half-day. Rain is possible in every season; snow only in winter. */
const SEASON_WEIGHTS: Record<Season, WeatherWeights> = {
  spring: { clear: 0.42, cloudy: 0.28, rain: 0.30, snow: 0 },
  summer: { clear: 0.60, cloudy: 0.24, rain: 0.16, snow: 0 },
  autumn: { clear: 0.32, cloudy: 0.30, rain: 0.38, snow: 0 },
  winter: { clear: 0.22, cloudy: 0.30, rain: 0.24, snow: 0.24 },
};

/** Deterministic 32-bit mix of four integers (independent of the world RNG). */
function hash32(a: number, b: number, c: number, d: number): number {
  let h = 0x811c9dc5 ^ (a | 0);
  h = Math.imul(h ^ (b | 0), 0x01000193);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  h = Math.imul(h ^ (c | 0), 0x27d4eb2f);
  h ^= h >>> 16;
  h = Math.imul(h ^ (d | 0), 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

/** 0..1 from four integers. */
function unit(a: number, b: number, c: number, d: number): number {
  return hash32(a, b, c, d) / 4294967296;
}

/** Chance weights of a season (snow is never offered outside winter). */
export function weightsFor(season: Season): WeatherWeights { return { ...SEASON_WEIGHTS[season] }; }

/** The weather plan of one half-day, deterministic for seed/day/half/season. */
export function planHalfDay(seed: number, day: number, half: 0 | 1, season: Season, weatherOn = true): WeatherKind {
  if (!weatherOn) return 'clear';
  const w = SEASON_WEIGHTS[season] ?? SEASON_WEIGHTS.spring;
  const total = w.clear + w.cloudy + w.rain + w.snow;
  if (total <= 0) return 'clear';
  let roll = unit(seed, day, half, SEASONS_INDEX[season]) * total;
  for (const kind of WEATHER_KINDS) {
    if (kind === 'snow' && season !== 'winter') continue;
    roll -= w[kind];
    if (roll < 0) return kind;
  }
  return 'clear';
}

const SEASONS_INDEX: Record<Season, number> = { spring: 0, summer: 1, autumn: 2, winter: 3 };

/** The two half-day plans for a day (honours the weather setting). */
export function planWeather(seed: number, day: number, season: Season, weatherOn = true): [WeatherKind, WeatherKind] {
  return [planHalfDay(seed, day, 0, season, weatherOn), planHalfDay(seed, day, 1, season, weatherOn)];
}

function planFor(state: Pick<WorldState, 'seed' | 'settings'>, day: number): [WeatherKind, WeatherKind] {
  const enabled = state.settings.weather !== false;
  const season = seasonForDay(day, seasonDays(state.settings), seasonsOn(state.settings));
  return planWeather(state.seed, day, season, enabled);
}

function validPlan(p: unknown): p is [WeatherKind, WeatherKind] {
  return Array.isArray(p) && p.length === 2 && p.every((k) => WEATHER_KINDS.includes(k as WeatherKind));
}

/** The season at a game minute under this world's settings. */
export function currentSeason(state: Pick<WorldState, 'clock' | 'settings'>): Season {
  return seasonFor(state.clock.minutes, state.settings);
}

/** The effective current weather (clear when the weather setting is off or nothing has been planned yet). */
export function currentWeather(state: Pick<WorldState, 'settings' | 'weather'>): WeatherKind {
  if (state.settings.weather === false) return 'clear';
  return state.weather?.current ?? 'clear';
}

/**
 * Makes sure the stored weather exists and matches the clock. The stored today/tomorrow plan is kept for the same
 * day (a reload never rerolls it); a new day, a malformed plan or `force` (a settings change) re-plans. Returns the
 * state's weather object.
 */
export function ensureWeather(ctx: Pick<SimCtx, 'state' | 'now'>, force = false): WeatherState {
  const state = ctx.state;
  const day = dayIndex(ctx.now);
  const enabled = state.settings.weather !== false;
  const season = seasonFor(ctx.now, state.settings);
  const half: 0 | 1 = minuteOfDay(ctx.now) < HALF_DAY_MINUTES ? 0 : 1;
  const since = day * MINUTES_PER_DAY + half * HALF_DAY_MINUTES;
  const today = planFor(state, day);
  const tomorrow = planFor(state, day + 1);
  let w = state.weather;
  if (force || !w || !validPlan(w.today) || !validPlan(w.tomorrow) || w.day !== day || !WEATHER_KINDS.includes(w.current)) {
    const snowCover = !!w?.snowCover && seasonsOn(state.settings) && season === 'winter';
    const melt = snowCover ? w?.melt : undefined;
    w = state.weather = {
      current: enabled ? today[half] : 'clear',
      today: enabled ? today : ['clear', 'clear'],
      tomorrow: enabled ? tomorrow : ['clear', 'clear'],
      day,
      since,
      ...(snowCover ? { snowCover: true } : {}),
      ...(melt ? { melt } : {}),
    };
  } else {
    w.current = enabled ? w.today[half] : 'clear';
    if (!enabled) { w.today = ['clear', 'clear']; w.tomorrow = ['clear', 'clear']; }
    if (w.current === 'snow' || (w.today[0] === 'snow' && half === 1 && w.current !== 'rain')) w.snowCover = true;
    if (!seasonsOn(state.settings) || season !== 'winter') delete w.snowCover;
    w.since = since;
  }
  if (!enabled || !seasonsOn(state.settings) || season !== 'winter') delete w.snowCover;
  if (enabled && season === 'winter' && w.current === 'snow') w.snowCover = true;
  if (!w.snowCover || w.current === 'snow') delete w.melt;
  return w;
}

/** Game minutes of rain that wash away a settled snow cover (rain melts snow much faster than mild dry weather). */
export const RAIN_MELT_MINUTES = 180;

/**
 * Milestone 13: rain on a settled snow cover melts it. Called once per tick after ensureWeather: while it rains the stored
 * `melt` counter grows by the tick, and at RAIN_MELT_MINUTES (three hours of rain, so one rainy half-day) the cover is gone.
 * Snow resets the counter. Returns true on the tick the cover melts.
 */
export function meltSnowCover(ctx: Pick<SimCtx, 'state'>, minutes: number): boolean {
  const w = ctx.state.weather;
  if (!w || !w.snowCover || w.current !== 'rain') return false;
  w.melt = (w.melt ?? 0) + minutes;
  if (w.melt < RAIN_MELT_MINUTES) return false;
  delete w.snowCover;
  delete w.melt;
  return true;
}

// ---------------------------------------------------------------------------------------------
// Interaction gate and outdoors
// ---------------------------------------------------------------------------------------------

/** Why the current weather/season blocks an interaction with this rule, or null. */
export function weatherGateReason(rule: WeatherRule | undefined, weather: WeatherKind, season: Season): string | null {
  if (!rule) return null;
  if (rule.not?.includes(weather)) {
    if (weather === 'rain') return 'It is raining.';
    if (weather === 'snow') return 'It is snowing.';
    return `It is ${WEATHER_NAMES[weather].toLowerCase()} today.`;
  }
  if (rule.only && !rule.only.includes(weather)) {
    return `Not possible in ${WEATHER_NAMES[weather].toLowerCase()} weather.`;
  }
  if (rule.seasons && !rule.seasons.includes(season)) {
    const names = rule.seasons.map((s) => SEASON_NAMES[s].toLowerCase());
    return names.length === 1 ? `Only available in ${names[0]}.` : `Only available in ${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}.`;
  }
  return null;
}

/** Milestone 12, task O: night runs 21:00-05:59; everything else is day. */
export function isNight(now: number): boolean {
  const h = hourOfDay(now);
  return h >= 21 || h < 6;
}

/** Snow is lying on the ground: it has settled this winter and the season has not turned. */
export function snowLies(state: Pick<WorldState, 'clock' | 'settings' | 'weather'>, now: number): boolean {
  if (state.settings.weather === false) return false;
  if (!state.weather?.snowCover) return false;
  return seasonFor(now, state.settings) === 'winter';
}

/**
 * It is raining now, or a rainy morning has left puddles less than three hours into the afternoon. (Rain from the
 * previous day has drained away by morning.) Task O: Jump in Puddles uses this.
 */
export function rainedRecently(state: Pick<WorldState, 'settings' | 'weather'>, now: number): boolean {
  if (currentWeather(state) === 'rain') return true;
  const w = state.weather;
  if (!w || dayIndex(now) !== w.day) return false;
  const mod = minuteOfDay(now);
  return w.today[0] === 'rain' && mod >= HALF_DAY_MINUTES && mod < HALF_DAY_MINUTES + 180;
}

/**
 * The full Milestone 12 gate for an interaction or social rule: weather, season and the person-dependent conditions
 * of task O (outside/under a roof, day/night, snow on the ground, puddles). Returns a readable reason, or null.
 */
export function outdoorGateReason(
  rule: WeatherRule | undefined, ctx: Pick<SimCtx, 'state' | 'now' | 'nav'>, p: Person,
): string | null {
  const base = weatherGateReason(rule, currentWeather(ctx.state), currentSeason(ctx.state));
  if (base || !rule) return base;
  if (rule.outdoor === true && !isOutdoors(ctx, p) && !nearestOutdoorTile(ctx, p)) return 'This has to be done outdoors.';
  if (rule.sheltered === true && !isSheltered(ctx as Pick<SimCtx, 'state' | 'content'>, p)) return 'Better done under a roof.';
  if (rule.night === true && !isNight(ctx.now)) return 'Only at night.';
  if (rule.day === true && isNight(ctx.now)) return 'Only during the day.';
  if (rule.snowCover === true && !snowLies(ctx.state, ctx.now)) return 'There is no snow on the ground.';
  if (rule.rainedRecently === true && !rainedRecently(ctx.state, ctx.now)) return 'It has not rained recently.';
  return null;
}

/** Whether a tile is in the open air: its room is open to the lot border and no roof covers it. */
export function outdoorsAt(
  state: Pick<WorldState, 'lots'>, lotId: string, level: number, x: number, z: number,
): boolean {
  const lot = state.lots[lotId];
  if (!lot) return false;
  x = Math.floor(x); z = Math.floor(z);
  if (x < 0 || z < 0 || x >= lot.width || z >= lot.depth) return false;
  const rooms = computeRooms(lot, level);
  const idx = roomIndex(rooms, lot.width, lot.depth)[z * lot.width + x] ?? -1;
  const room = rooms[idx];
  if (!room || !room.outdoor) return false;
  for (const r of Object.values(lot.roofs ?? {})) {
    if (r.level === level && x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) return false;
  }
  return true;
}

/**
 * Milestone 13: whether a tile is covered from rain and snow by shade: an umbrella, awning or patio cover (an object with
 * `ObjectDef.shelter`) within its radius of the footprint, on the same level. A roof is handled by outdoorsAt; shade
 * shelters the tile without making it "indoors" (rooms, sun and night rules are unchanged).
 */
export function shadedAt(
  state: Pick<WorldState, 'lots'>, content: Pick<ContentDB, 'objects'>, lotId: string, level: number, x: number, z: number,
): boolean {
  const lot = state.lots[lotId];
  if (!lot) return false;
  for (const o of Object.values(lot.objects)) {
    if (o.level !== level) continue;
    const def = content?.objects?.[o.defId];
    const r = def?.shelter;
    if (!def || !r || o.condition.broken) continue;
    const w = o.rot % 2 === 0 ? def.footprint.w : def.footprint.d, d = o.rot % 2 === 0 ? def.footprint.d : def.footprint.w;
    if (x >= o.x - r && x < o.x + w + r && z >= o.z - r && z < o.z + d + r) return true;
  }
  return false;
}

/** The person is out of the rain: under a roof or indoors, or standing in the shade of an umbrella, awning or patio cover. */
export function isSheltered(ctx: Pick<SimCtx, 'state' | 'content'>, p: Person): boolean {
  const loc = lotLoc(p);
  if (!loc) return false;
  return !outdoorsAt(ctx.state, loc.lotId, loc.level, loc.x, loc.z) || shadedAt(ctx.state, ctx.content, loc.lotId, loc.level, loc.x, loc.z);
}

/** Whether the person is in the open air (see outdoorsAt). */
export function isOutdoors(ctx: Pick<SimCtx, 'state'>, p: Person): boolean {
  const loc = lotLoc(p);
  if (!loc) return false;
  return outdoorsAt(ctx.state, loc.lotId, loc.level, loc.x, loc.z);
}

/**
 * A walkable outdoor tile the person can walk to on this lot (the nearest by straight-line distance), or null.
 * Used by the outdoor activities to step outside before they begin.
 */
export function nearestOutdoorTile(ctx: Pick<SimCtx, 'state' | 'nav'>, p: Person): Tile | null {
  const loc = lotLoc(p);
  if (!loc) return null;
  const lot = ctx.state.lots[loc.lotId];
  if (!lot) return null;
  const from = { x: Math.floor(loc.x), z: Math.floor(loc.z), level: loc.level };
  // Compute the room map and the roofs for this level once: outdoorsAt() does both per call, which made the
  // per-tile scan quadratic (O(width * depth) room computations) and dominated long simulations. (Task O.)
  const rooms = computeRooms(lot, loc.level);
  const index = roomIndex(rooms, lot.width, lot.depth);
  const roofs = Object.values(lot.roofs ?? {}).filter((r) => r.level === loc.level);
  const open = (x: number, z: number): boolean => {
    const room = rooms[index[z * lot.width + x] ?? -1];
    if (!room || !room.outdoor) return false;
    for (const r of roofs) if (x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) return false;
    return true;
  };
  let best: { x: number; z: number; level: number } | null = null;
  let bestD = Infinity;
  for (let z = 0; z < lot.depth; z++) {
    for (let x = 0; x < lot.width; x++) {
      if (!open(x, z)) continue;
      if (!ctx.nav.isWalkable(lot.id, loc.level, x, z)) continue;
      if (x === from.x && z === from.z) return { x, z, level: loc.level };
      const d = (x - from.x) ** 2 + (z - from.z) ** 2;
      if (d < bestD) { bestD = d; best = { x, z, level: loc.level }; }
    }
  }
  if (!best) return null;
  return ctx.nav.findPath(lot.id, loc.level, from, [best]) ? best : null;
}

/** A 'winter' or 'coat' tagged garment in the outfit currently worn. */
export function hasWinterOutfit(p: Person, content: Pick<ContentDB, 'garments'>): boolean {
  const out = p.outfits.outfits[p.outfits.current.category]?.[p.outfits.current.index];
  if (!out) return false;
  return Object.values(out.layers).some((layer) => {
    if (!layer) return false;
    const garment = content.garments[layer.garmentId];
    return !!garment && (garment.tags.includes('winter') || garment.tags.includes('coat'));
  });
}

// ---------------------------------------------------------------------------------------------
// Moodlets
// ---------------------------------------------------------------------------------------------

export const WEATHER_MOODLET_IDS: ReadonlySet<string> = new Set([
  'lovelyWeather', 'gloomyDay', 'cosyRain', 'snowDay', 'caughtInRain', 'chilly',
]);

/** Cooldown (game minutes) per weather condition, so the same moodlet is not refreshed every 15-minute check. */
const MOOD_COOLDOWN = 60;
const MOOD_CHECK_MINUTES = 15;

/** 0.25..2: how much this person enjoys a weather kind (likes/dislikes and trait leanings). */
export function weatherSentiment(p: Person, content: Pick<ContentDB, 'traits'>, kind: WeatherKind): number {
  let s = 1;
  const like = (id: string) => p.likes.includes(id);
  const dislike = (id: string) => p.dislikes.includes(id);
  if (kind === 'clear') {
    if (like('weather:sun')) s += 0.6;
    if (dislike('weather:sun')) s -= 0.5;
  } else if (kind === 'rain') {
    if (like('weather:rain')) s += 0.6;
    if (dislike('weather:rain')) s -= 0.5;
  } else if (kind === 'snow') {
    if (like('weather:snow')) s += 0.6;
    if (dislike('weather:snow')) s -= 0.5;
    if (like('weather:cold')) s += 0.2;
    if (dislike('weather:cold')) s -= 0.6;
  }
  for (const t of p.traits) {
    const bias = content.traits[t]?.effects.weatherBias?.[kind];
    if (bias !== undefined) s *= bias;
  }
  return Math.max(0.25, Math.min(2, s));
}

function desiredWeatherMoodlet(
  weather: WeatherKind, outdoors: boolean, daytime: boolean, sentiment: number, winterOutfit: boolean,
): { id: string; positive: boolean } | null {
  switch (weather) {
    case 'clear':
      return daytime && sentiment >= 0.85 ? { id: 'lovelyWeather', positive: true } : null;
    case 'cloudy':
      return sentiment < 0.9 ? { id: 'gloomyDay', positive: false } : null;
    case 'rain':
      if (outdoors) return sentiment >= 1.25 ? null : { id: 'caughtInRain', positive: false };
      return sentiment >= 0.9 ? { id: 'cosyRain', positive: true } : { id: 'gloomyDay', positive: false };
    case 'snow':
      if (outdoors && !winterOutfit) return { id: 'chilly', positive: false };
      return sentiment >= 0.85 ? { id: 'snowDay', positive: true } : { id: 'gloomyDay', positive: false };
  }
}

function scaledMoodValue(base: number, positive: boolean, sentiment: number): number {
  return Math.round(base * (positive ? sentiment : Math.min(2.2, Math.max(0.4, 2 - sentiment))));
}

/**
 * Applies one weather moodlet per person (at most every 15 game minutes) with a 60-minute per-condition cooldown.
 * Stale weather moodlets are removed when the condition changes.
 */
export function updateWeatherMoods(ctx: Pick<SimCtx, 'state' | 'now' | 'content'>): void {
  if (minuteOfDay(ctx.now) % MOOD_CHECK_MINUTES !== 0) return;
  const state = ctx.state;
  const weather = currentWeather(state);
  const hour = hourOfDay(ctx.now);
  const daytime = hour >= 7 && hour < 20;
  for (const p of Object.values(state.people)) {
    if (!lotLoc(p)) continue;
    const sentiment = weatherSentiment(p, ctx.content, weather);
    const desired = desiredWeatherMoodlet(weather, !isSheltered(ctx, p), daytime, sentiment, hasWinterOutfit(p, ctx.content));
    // A condition change replaces the old weather moodlet immediately.
    if (p.moodlets.some((m) => WEATHER_MOODLET_IDS.has(m.id) && m.id !== desired?.id)) {
      p.moodlets = p.moodlets.filter((m) => !WEATHER_MOODLET_IDS.has(m.id) || m.id === desired?.id);
    }
    if (!desired) continue;
    const def = ctx.content.moodlets[desired.id];
    if (!def) continue;
    const key = `weather:${weather}:${desired.id}`;
    if ((p.cooldowns[key] ?? -Infinity) > ctx.now) continue;
    addMoodlet(ctx.content, p, desired.id, ctx.now, 'weather');
    const added = p.moodlets.find((m) => m.id === desired.id);
    if (added) added.value = scaledMoodValue(def.value, desired.positive, sentiment);
    p.cooldowns[key] = ctx.now + MOOD_COOLDOWN;
  }
}

/** "Autumn, day 3 - Rain" for the HUD, or a clear-sky label when weather is off. */
export function weatherHudLabel(state: Pick<WorldState, 'clock' | 'settings' | 'weather'>): string {
  if (state.settings.weather === false) return 'Weather off';
  return `${WEATHER_NAMES[currentWeather(state)]}`;
}

/** How many days the forecast shows, today included. */
export const FORECAST_DAYS = 5;

export interface ForecastDay {
  /** Absolute game day. */
  day: number;
  /** 'Today', 'Tomorrow' or the weekday name. */
  label: string;
  halves: [WeatherKind, WeatherKind];
  season: Season;
}

/**
 * The next `days` days of weather (today first). Today and tomorrow are the stored plan; later days are planned from the
 * same deterministic function the daily re-plan uses (seed, day, half, season), so the forecast for a day never changes
 * and always matches what the plan stores when that day arrives (except for a pinned debug plan).
 */
export function forecastDays(state: Pick<WorldState, 'seed' | 'settings' | 'weather' | 'clock'>, days = FORECAST_DAYS): ForecastDay[] {
  const today = dayIndex(state.clock.minutes);
  const enabled = state.settings.weather !== false;
  const out: ForecastDay[] = [];
  for (let i = 0; i < days; i++) {
    const day = today + i;
    const stored = state.weather && state.weather.day === today ? (i === 0 ? state.weather.today : i === 1 ? state.weather.tomorrow : null) : null;
    const halves: [WeatherKind, WeatherKind] = !enabled ? ['clear', 'clear'] : stored && validPlan(stored) ? stored : planFor(state, day);
    out.push({
      day, halves, season: seasonForDay(day, seasonDays(state.settings), seasonsOn(state.settings)),
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY_NAMES[day % 7]!,
    });
  }
  return out;
}

/** One line per forecast day: "Wednesday: Rain then Clear". */
export function forecastLines(state: Pick<WorldState, 'seed' | 'settings' | 'weather' | 'clock'>, days = FORECAST_DAYS): string[] {
  if (state.settings.weather === false) return ['Weather is turned off: every day is clear.'];
  return forecastDays(state, days).map((d) => `${d.label}: ${d.halves[0] === d.halves[1] ? WEATHER_NAMES[d.halves[0]] : `${WEATHER_NAMES[d.halves[0]]} then ${WEATHER_NAMES[d.halves[1]]}`}`);
}

/** "Forecast: today Rain then Cloudy · tomorrow Clear then Clear." for the info panel. */
export function forecastLine(state: Pick<WorldState, 'settings' | 'weather'>): string {
  if (state.settings.weather === false) return 'Weather is turned off: every day is clear.';
  const w = state.weather;
  if (!w) return 'Forecast: not planned yet.';
  const pair = (p: [WeatherKind, WeatherKind]) => `${WEATHER_NAMES[p[0]]} then ${WEATHER_NAMES[p[1]]}`;
  return `Forecast: today ${pair(w.today)} · tomorrow ${pair(w.tomorrow)}.`;
}
