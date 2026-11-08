// Versioned schema: migrations from older save versions and validation of a loaded world.
//
// Migrations are a registry keyed by the version they PRODUCE: `migrations[n]` turns data of schema n-1 into
// schema n. The engine runs them in order, stamps `schemaVersion` after each step, works on a copy (a failed
// migration never alters its input), and refuses data from a newer build instead of guessing.
// v1 is the first released schema, so its entry is the identity.

import type { ContentDB } from '../content/types';
import type { WorldState } from '../core/types';
import { SCHEMA_VERSION } from '../core/types';
import {
  MissingCollector, collectHouseholdRefs, collectItemRefs, collectLotRefs, collectPersonRefs,
} from './references';
import { isRecord } from './shape';
import { validateStructure } from './structure';
import type { MissingRef } from './types';

/** Upgrades raw data of the previous schema version to the next one. May mutate and return its argument. */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
export type MigrationRegistry = Record<number, Migration>;

/** The game's migrations. Add `[n]` here when SCHEMA_VERSION becomes n. */
export const MIGRATIONS: MigrationRegistry = {
  1: (raw) => raw,
};

/**
 * Defaults for fields added to schema 1 after release (Milestone 4 daily-life systems): an object's `condition`
 * gained optional `wear`, `brokenAt` and `fails`, and world items gained the kinds 'dishes' and 'mess'. Old saves
 * lack them and the game reads absent as 0, so nothing has to change in the data; this only repairs values that
 * would confuse the simulation (a missing or out-of-range `condition`, an unknown item kind). It touches the data
 * only when something needs fixing, and is applied to every loaded world, whatever its version.
 */
export function fillDailyLifeDefaults(raw: Record<string, unknown>): void {
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (isRecord(raw.lots)) {
    for (const lot of Object.values(raw.lots)) {
      if (!isRecord(lot) || !isRecord(lot.objects)) continue;
      for (const o of Object.values(lot.objects)) {
        if (!isRecord(o)) continue;
        if (!isRecord(o.condition)) { o.condition = { dirt: 0, broken: false }; continue; }
        const c = o.condition;
        if (!num(c.dirt) || c.dirt < 0 || c.dirt > 1) c.dirt = num(c.dirt) ? Math.min(1, Math.max(0, c.dirt)) : 0;
        if (typeof c.broken !== 'boolean') c.broken = false;
        if (c.wear !== undefined && !(num(c.wear) && c.wear >= 0 && c.wear <= 1)) c.wear = num(c.wear) ? Math.min(1, Math.max(0, c.wear)) : undefined;
        if (c.wear === undefined) delete c.wear;
        if (c.brokenAt !== undefined && !num(c.brokenAt)) delete c.brokenAt;
        if (c.fails !== undefined && !(num(c.fails) && c.fails >= 0)) delete c.fails;
      }
    }
  }
  if (isRecord(raw.items)) {
    for (const item of Object.values(raw.items)) {
      if (isRecord(item) && item.kind !== 'meal' && item.kind !== 'fish' && item.kind !== 'dishes' && item.kind !== 'mess') item.kind = 'meal';
    }
  }
}

const REL_LABELS = ['stranger', 'acquaintance', 'friend', 'closeFriend', 'bestFriend', 'rival', 'enemy', 'crush', 'partner', 'engaged', 'spouse', 'exPartner'];
const EVENT_TYPES = ['date', 'dinnerParty', 'houseParty', 'celebration', 'wedding', 'visit', 'welcomeWagon', 'dropIn', 'reconciliation'];
const EVENT_STATUSES = ['invited', 'running', 'done', 'cancelled'];
const GOAL_KINDS = ['chat', 'eat', 'romantic', 'laugh', 'mingle', 'reconcile', 'ceremony'];

/**
 * Defaults for fields added to schema 1 by Milestone 5 (relationships and events): a relationship may carry a derived
 * `label` and `romanceBlocked`, a memory may be `resolved`, and the world may hold `homeEvents`. Old saves have none of
 * them and the game reads absent as "not set" (labels are recomputed on the next change), so nothing has to be added;
 * this only repairs values that would confuse the simulation: unknown labels are dropped, malformed or unreadable
 * events are removed, and counters are made whole numbers. It touches the data only when something needs fixing, and
 * is applied to every loaded world, whatever its version.
 */
export function fillSocialDefaults(raw: Record<string, unknown>): void {
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
  if (isRecord(raw.relationships)) {
    for (const rel of Object.values(raw.relationships)) {
      if (!isRecord(rel)) continue;
      if (rel.label !== undefined && !(typeof rel.label === 'string' && REL_LABELS.includes(rel.label))) delete rel.label;
      if (rel.romanceBlocked !== undefined && typeof rel.romanceBlocked !== 'boolean') delete rel.romanceBlocked;
    }
  }
  if (isRecord(raw.people)) {
    for (const p of Object.values(raw.people)) {
      if (!isRecord(p) || !Array.isArray(p.memories)) continue;
      for (const m of p.memories) {
        if (isRecord(m) && m.resolved !== undefined && typeof m.resolved !== 'boolean') delete m.resolved;
      }
    }
  }
  if (raw.homeEvents === undefined) return;
  if (!Array.isArray(raw.homeEvents)) { delete raw.homeEvents; return; }
  raw.homeEvents = raw.homeEvents.filter((e): e is Record<string, unknown> => {
    if (!isRecord(e)) return false;
    if (!str(e.id) || !str(e.hostId) || !str(e.householdId) || !str(e.lotId) || !str(e.title)) return false;
    if (!EVENT_TYPES.includes(String(e.type)) || !EVENT_STATUSES.includes(String(e.status))) return false;
    if (!num(e.startAt) || !num(e.endAt) || !num(e.createdAt)) return false;
    for (const key of ['guestIds', 'arrivedIds', 'pairs', 'ate'] as const) {
      const list = e[key];
      e[key] = Array.isArray(list) ? list.filter(str) : [];
    }
    e.goals = (Array.isArray(e.goals) ? e.goals : []).filter((g): g is Record<string, unknown> =>
      isRecord(g) && GOAL_KINDS.includes(String(g.kind)) && str(g.text) && num(g.target) && num(g.progress) && num(g.weight) && typeof g.done === 'boolean');
    return true;
  });
}

const BILL_STATUSES = ['due', 'overdue', 'paid', 'cutoff'];
const WORK_EFFORTS = ['slack', 'normal', 'hard'];

/**
 * Defaults for fields added to schema 1 by Milestone 6 (careers and economy): a career may carry `effort` and a
 * pending event, a household may have its utilities cut off, settings may auto-pay bills, and the world holds
 * weekly bills. Old saves have none of them and readers treat absent as the default; this only repairs values
 * that would confuse the simulation (bad effort or event data, malformed bills, non-boolean flags).
 */
export function fillEconomyDefaults(raw: Record<string, unknown>): void {
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
  if (isRecord(raw.settings) && raw.settings.autoPayBills !== undefined && typeof raw.settings.autoPayBills !== 'boolean') {
    delete raw.settings.autoPayBills;
  }
  if (isRecord(raw.households)) {
    for (const hh of Object.values(raw.households)) {
      if (isRecord(hh) && hh.powerOff !== undefined && typeof hh.powerOff !== 'boolean') delete hh.powerOff;
    }
  }
  if (isRecord(raw.people)) {
    for (const p of Object.values(raw.people)) {
      if (!isRecord(p) || !isRecord(p.career)) continue;
      const c = p.career;
      if (c.effort !== undefined && !(typeof c.effort === 'string' && WORK_EFFORTS.includes(c.effort))) delete c.effort;
      if (c.pendingEvent !== undefined && c.pendingEvent !== null) {
        const e = c.pendingEvent;
        if (!isRecord(e) || !str(e.eventId) || !num(e.day)) delete c.pendingEvent;
        else if (e.chosen !== undefined && !str(e.chosen)) delete e.chosen;
      }
    }
  }
  if (raw.bills === undefined) return;
  if (!Array.isArray(raw.bills)) { delete raw.bills; return; }
  raw.bills = raw.bills.filter((b): b is Record<string, unknown> => {
    if (!isRecord(b)) return false;
    if (!str(b.id) || !str(b.householdId)) return false;
    if (!num(b.week) || !num(b.amount) || !num(b.base) || !num(b.lateFee)) return false;
    if (!num(b.issuedAt) || !num(b.dueAt) || !num(b.graceEndsAt)) return false;
    if (!BILL_STATUSES.includes(String(b.status))) return false;
    if (b.paidAt !== undefined && !num(b.paidAt)) delete b.paidAt;
    if (b.cutOffAt !== undefined && !num(b.cutOffAt)) delete b.cutOffAt;
    return b.amount >= 0 && b.base >= 0 && b.lateFee >= 0;
  });
}

/**
 * Defaults for fields added to schema 1 by Milestone 7 (neighbourhood and venues): lots may carry `built`, `variant`,
 * `blurb`, `map`, `rent` and `price`, an off-lot location may be `transit`, and the world may hold the `neighbourhood`
 * marker. Old saves have none of them: absent `built` means the lot is built, and a world without the marker gets its
 * neighbourhood generated when it is loaded (game/neighbourhood.ts ensureNeighbourhood), with the existing household and
 * lots kept. This only repairs values that would confuse the simulation; a damaged marker is mended, never dropped,
 * because dropping it would generate the neighbourhood a second time.
 */
export function fillNeighbourhoodDefaults(raw: Record<string, unknown>): void {
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const whole = (v: unknown): v is number => num(v) && Number.isInteger(v) && v >= 0;
  if (isRecord(raw.lots)) {
    for (const lot of Object.values(raw.lots)) {
      if (!isRecord(lot)) continue;
      if (lot.built !== undefined && typeof lot.built !== 'boolean') delete lot.built;
      if (lot.variant !== undefined && !whole(lot.variant)) delete lot.variant;
      if (lot.blurb !== undefined && typeof lot.blurb !== 'string') delete lot.blurb;
      if (lot.map !== undefined && !(isRecord(lot.map) && num(lot.map.x) && num(lot.map.y))) delete lot.map;
      if (lot.rent !== undefined && !whole(lot.rent)) delete lot.rent;
      if (lot.price !== undefined && !whole(lot.price)) delete lot.price;
    }
  }
  if (isRecord(raw.people)) {
    for (const p of Object.values(raw.people)) {
      if (!isRecord(p) || !isRecord(p.location)) continue;
      if (p.location.transit !== undefined && typeof p.location.transit !== 'boolean') delete p.location.transit;
    }
  }
  if (raw.neighbourhood === undefined) return;
  const households = isRecord(raw.households) ? raw.households : {};
  const m = isRecord(raw.neighbourhood) ? raw.neighbourhood : {};
  const ids = Array.isArray(m.npcHouseholdIds) ? m.npcHouseholdIds.filter((id): id is string => typeof id === 'string' && isRecord(households[id])) : [];
  const fixed: Record<string, unknown> = {
    version: 1, street: typeof m.street === 'string' && m.street ? m.street : 'Main Street', npcHouseholdIds: ids,
  };
  if (typeof m.nextDoorHouseholdId === 'string' && isRecord(households[m.nextDoorHouseholdId])) fixed.nextDoorHouseholdId = m.nextDoorHouseholdId;
  if (whole(m.moves)) fixed.moves = m.moves;
  raw.neighbourhood = fixed;
}

// ---------------------------------------------------------------------------------------------
// Milestone 8 (family and life stages): fill defaults
// ---------------------------------------------------------------------------------------------

const AGING_MODES = ['off', 'long', 'normal', 'custom'];
const LIFE_STAGE_KEYS = ['baby', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'];
const NEED_KEYS = ['hunger', 'energy', 'hygiene', 'bladder', 'fun', 'social'];

/**
 * Defaults for fields added to schema 1 by Milestone 8: `settings.aging` may be 'custom' with `agingDays` and `elderEndOfLife`;
 * a person may carry `stageDays`, `parentIds`, `school` and `careSince`. Old saves have none of them and readers treat
 * absent as the default (aging off, stage days 0, no parents, no school). This repairs what would confuse the simulation:
 * an unknown aging mode becomes 'off', custom stage lengths are whole days in 1..120, parent ids point at existing people
 * (at most two, never themselves), a damaged school record is mended or dropped. Applied to every loaded world.
 */
export function fillFamilyDefaults(raw: Record<string, unknown>): void {
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const whole = (v: unknown): v is number => num(v) && Number.isInteger(v) && v >= 0;
  if (isRecord(raw.settings)) {
    const st = raw.settings;
    if (!AGING_MODES.includes(String(st.aging))) st.aging = 'off';
    if (st.agingDays !== undefined) {
      if (!isRecord(st.agingDays)) delete st.agingDays;
      else {
        const days = st.agingDays;
        for (const k of Object.keys(days)) {
          const v = days[k];
          if (!LIFE_STAGE_KEYS.includes(k) || !num(v)) delete days[k];
          else days[k] = Math.max(1, Math.min(120, Math.round(v)));
        }
      }
    }
    if (st.elderEndOfLife !== undefined && typeof st.elderEndOfLife !== 'boolean') delete st.elderEndOfLife;
  }
  if (!isRecord(raw.people)) return;
  const people = raw.people;
  for (const [id, p] of Object.entries(people)) {
    if (!isRecord(p)) continue;
    if (p.stageDays !== undefined) { if (num(p.stageDays) && p.stageDays >= 0) p.stageDays = Math.floor(p.stageDays); else delete p.stageDays; }
    if (p.parentIds !== undefined) {
      const ids = Array.isArray(p.parentIds) ? [...new Set(p.parentIds.filter((x): x is string => typeof x === 'string' && x !== id && isRecord(people[x])))].slice(0, 2) : [];
      if (ids.length > 0) p.parentIds = ids; else delete p.parentIds;
    }
    if (p.school !== undefined && p.school !== null) {
      const s = p.school;
      if (!isRecord(s) || typeof s.schoolId !== 'string' || !s.schoolId) delete p.school;
      else {
        s.performance = num(s.performance) ? Math.max(-100, Math.min(100, s.performance)) : 0;
        if (!num(s.homeworkDay)) s.homeworkDay = -1;
        if (!whole(s.attended)) s.attended = 0;
        if (!whole(s.missed)) s.missed = 0;
        if (s.lastGrade !== undefined && typeof s.lastGrade !== 'string') delete s.lastGrade;
        if (s.reportWeek !== undefined && !whole(s.reportWeek)) delete s.reportWeek;
      }
    }
    if (p.careSince !== undefined) {
      if (!isRecord(p.careSince)) delete p.careSince;
      else {
        const cs = p.careSince;
        for (const k of Object.keys(cs)) if (!NEED_KEYS.includes(k) || !num(cs[k])) delete cs[k];
        if (Object.keys(cs).length === 0) delete p.careSince;
      }
    }
  }
}

// ===== Milestone 9 exterior (fences, roofs, terrain paint, garden beds): fill and repair ===================================
/**
 * Defaults for fields added to schema 1 by the Milestone 9 exterior work: a lot may carry `fences` (keyed by edge key), `roofs` (keyed by
 * id) and `terrain` (tile key -> paint id), and an object may carry `garden` (crop bed state). Old saves have none of them and the game
 * reads absent as "nothing", so no data is added; this drops records that would confuse the renderer or the simulation (a fence
 * without an edge, a roof without a rectangle, a paint that is not text, a garden state with bad numbers). Applied to every loaded world.
 */
export function fillExteriorDefaults(raw: Record<string, unknown>): void {
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const int = (v: unknown): v is number => num(v) && Number.isInteger(v);
  if (!isRecord(raw.lots)) return;
  for (const lot of Object.values(raw.lots)) {
    if (!isRecord(lot)) continue;
    if (lot.fences !== undefined) {
      if (!isRecord(lot.fences)) delete lot.fences;
      else {
        for (const [key, f] of Object.entries(lot.fences)) {
          if (!isRecord(f) || typeof f.defId !== 'string' || !int(f.level) || !int(f.x) || !int(f.z) || (f.dir !== 'h' && f.dir !== 'v')) { delete lot.fences[key]; continue; }
          f.id = key;
          if (f.variant !== undefined && !int(f.variant)) delete f.variant;
          if (f.purchasePrice !== undefined && !int(f.purchasePrice)) delete f.purchasePrice;
          if (f.boughtAt !== undefined && !num(f.boughtAt)) delete f.boughtAt;
        }
      }
    }
    if (lot.roofs !== undefined) {
      if (!isRecord(lot.roofs)) delete lot.roofs;
      else {
        for (const [id, r] of Object.entries(lot.roofs)) {
          const rect = isRecord(r) && [r.level, r.x0, r.z0, r.x1, r.z1].every(int) && (r.x1 as number) > (r.x0 as number) && (r.z1 as number) > (r.z0 as number);
          if (!isRecord(r) || !rect || typeof r.styleId !== 'string' || !isRecord(r.finish) || typeof r.finish.designId !== 'string' || typeof r.finish.paletteId !== 'string') { delete lot.roofs[id]; continue; }
          r.id = id;
          if (r.ridge !== 'h' && r.ridge !== 'v') r.ridge = 'h';
          if (!num(r.pitch)) r.pitch = 30;
          if (r.purchasePrice !== undefined && !int(r.purchasePrice)) delete r.purchasePrice;
          if (r.boughtAt !== undefined && !num(r.boughtAt)) delete r.boughtAt;
        }
      }
    }
    if (lot.terrain !== undefined) {
      if (!isRecord(lot.terrain)) delete lot.terrain;
      else for (const [key, v] of Object.entries(lot.terrain)) if (typeof v !== 'string' || !/^\d+:\d+:\d+$/.test(key)) delete lot.terrain[key];
    }
    if (isRecord(lot.objects)) {
      for (const o of Object.values(lot.objects)) {
        if (!isRecord(o) || o.garden === undefined) continue;
        const g = o.garden;
        const ok = isRecord(g) && (g.crop === null || typeof g.crop === 'string') && [g.growth, g.need, g.water, g.weeds, g.day, g.harvests].every(num);
        if (!ok) delete o.garden;
      }
    }
  }
}
// ===== Milestone 12: pools (optional lot field): fill and repair ====================================================
/**
 * `lot.pools` is optional (absent = no pool). This drops pools that would confuse the simulation or the renderer: a
 * missing rectangle, a pool without a style, or a pool whose ladders are all off its edge. Valid pools are untouched.
 */
export function fillPoolDefaults(raw: Record<string, unknown>): void {
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const int = (v: unknown): v is number => num(v) && Number.isInteger(v);
  const sides = new Set(['n', 's', 'e', 'w']);
  if (!isRecord(raw.lots)) return;
  for (const lot of Object.values(raw.lots)) {
    if (!isRecord(lot) || lot.pools === undefined) continue;
    if (!isRecord(lot.pools)) { delete lot.pools; continue; }
    for (const [id, pool] of Object.entries(lot.pools)) {
      const rect = isRecord(pool) && int(pool.x0) && int(pool.z0) && int(pool.x1) && int(pool.z1)
        && (pool.x1 as number) >= (pool.x0 as number) && (pool.z1 as number) >= (pool.z0 as number);
      if (!rect || !isRecord(pool) || typeof pool.styleId !== 'string') { delete lot.pools[id]; continue; }
      pool.id = id;
      pool.level = 0;
      if (!Array.isArray(pool.ladders)) { delete lot.pools[id]; continue; }
      const x0 = pool.x0 as number, x1 = pool.x1 as number, z0 = pool.z0 as number, z1 = pool.z1 as number;
      const seen = new Set<string>();
      const ladders = (pool.ladders as unknown[]).filter((l) => {
        if (!isRecord(l) || !int(l.x) || !int(l.z) || !sides.has(l.side as string)) return false;
        const x = l.x as number, z = l.z as number;
        if (x < x0 || x > x1 || z < z0 || z > z1) return false;
        if (x !== x0 && x !== x1 && z !== z0 && z !== z1) return false;
        const key = `${x},${z}`;
        if (seen.has(key)) return false;
        seen.add(key);
        l.side = z === z0 ? 'n' : z === z1 ? 's' : x === x0 ? 'w' : 'e';
        return true;
      });
      pool.ladders = ladders;
      if (ladders.length === 0) delete lot.pools[id];
      else {
        if (pool.purchasePrice !== undefined && !int(pool.purchasePrice)) delete pool.purchasePrice;
        if (pool.boughtAt !== undefined && !num(pool.boughtAt)) delete pool.boughtAt;
      }
    }
    if (Object.keys(lot.pools).length === 0) delete lot.pools;
  }
}
// ===== end Milestone 12 pools =======================================================================================

// ===== Milestone 12: seasons and weather (optional schema 1 fields): fill and repair ==================================
const WEATHER_KINDS = ['clear', 'cloudy', 'rain', 'snow'];
const SEASON_DAY_OPTIONS = [3, 7, 14];

/**
 * Defaults for fields added to schema 1 by Milestone 12. `settings.seasons`, `settings.seasonDays` and
 * `settings.weather` are optional (absent = on / 7 / on), and `weather` holds the current kind plus today's and
 * tomorrow's half-day forecast. Old saves have none of it and the simulation plans on the first tick. This only
 * repairs values that would confuse the sim or the renderer (unknown kinds, bad array shapes, bad day numbers),
 * so a valid stored forecast survives a save/load untouched.
 */
export function fillWeatherDefaults(raw: Record<string, unknown>): void {
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const isPlan = (p: unknown): boolean => Array.isArray(p) && p.length === 2 && p.every((k) => typeof k === 'string' && WEATHER_KINDS.includes(k));
  if (isRecord(raw.settings)) {
    const s = raw.settings;
    if (s.seasons !== undefined && typeof s.seasons !== 'boolean') delete s.seasons;
    if (s.weather !== undefined && typeof s.weather !== 'boolean') delete s.weather;
    if (s.seasonDays !== undefined && !(typeof s.seasonDays === 'number' && SEASON_DAY_OPTIONS.includes(s.seasonDays))) delete s.seasonDays;
  }
  if (raw.weather === undefined) return;
  const w = raw.weather;
  const ok = isRecord(w) && typeof w.current === 'string' && WEATHER_KINDS.includes(w.current) &&
    isPlan(w.today) && isPlan(w.tomorrow) && num(w.day) && Number.isInteger(w.day) && num(w.since) &&
    (w.snowCover === undefined || typeof w.snowCover === 'boolean');
  if (!ok) { delete raw.weather; return; }
  w.day = Math.max(0, Math.floor(w.day as number));
  w.since = Math.max(0, Math.floor(w.since as number));
  if (w.snowCover !== true) delete w.snowCover;
}
// ===== end Milestone 12 seasons and weather ==========================================================================

/** Oldest schema version this build can still upgrade. */
export const OLDEST_SUPPORTED_VERSION = 1;

export type MigrateErrorCode = 'invalid' | 'newer' | 'tooOld' | 'failed';
export type MigrateResult =
  | { ok: true; state: WorldState; fromVersion: number; toVersion: number; migrated: boolean }
  | { ok: false; code: MigrateErrorCode; error: string };

export interface MigrateOptions {
  migrations?: MigrationRegistry;
  /** Version to upgrade to. Default SCHEMA_VERSION. */
  currentVersion?: number;
  /** Oldest version the registry can upgrade. Default OLDEST_SUPPORTED_VERSION. */
  oldestVersion?: number;
}

export type VersionedResult =
  | { ok: true; data: Record<string, unknown>; fromVersion: number; toVersion: number; migrated: boolean }
  | { ok: false; code: MigrateErrorCode; error: string };

/** Generic version stepping, shared by worlds and templates. `what` names the data in messages. */
export function runMigrations(
  raw: unknown, version: unknown, what: string,
  registry: MigrationRegistry, currentVersion: number, oldestVersion: number,
): VersionedResult {
  if (!isRecord(raw)) return { ok: false, code: 'invalid', error: `This is not a ${what} (expected an object).` };
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return { ok: false, code: 'invalid', error: `This ${what} has no valid schemaVersion, so it cannot be opened safely.` };
  }
  if (version > currentVersion) {
    return {
      ok: false, code: 'newer',
      error: `This ${what} was made by a newer version of Hearthside Life (schema ${version}; this version understands up to ${currentVersion}). Update the game to open it.`,
    };
  }
  if (version < oldestVersion) {
    return { ok: false, code: 'tooOld', error: `This ${what} uses schema ${version}, which is too old to upgrade (oldest supported: ${oldestVersion}).` };
  }
  if (version === currentVersion) return { ok: true, data: raw, fromVersion: version, toVersion: currentVersion, migrated: false };
  let data: Record<string, unknown>;
  try { data = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>; } catch {
    return { ok: false, code: 'invalid', error: `This ${what} contains data that cannot be read.` };
  }
  for (let v = version + 1; v <= currentVersion; v++) {
    const step = registry[v];
    if (!step) return { ok: false, code: 'failed', error: `No migration from schema ${v - 1} to ${v} is available, so this ${what} cannot be upgraded.` };
    try {
      const next = step(data);
      if (!isRecord(next)) return { ok: false, code: 'failed', error: `Upgrading this ${what} from schema ${v - 1} to ${v} did not produce valid data.` };
      data = next;
      data.schemaVersion = v;
    } catch (e) {
      return { ok: false, code: 'failed', error: `Upgrading this ${what} from schema ${v - 1} to ${v} failed: ${e instanceof Error ? e.message : 'unknown error'}.` };
    }
  }
  return { ok: true, data, fromVersion: version, toVersion: currentVersion, migrated: version !== currentVersion };
}

/**
 * Upgrades raw saved data (already parsed from JSON) to the current schema. The result is NOT validated:
 * call validateWorld on `state` next.
 */
export function migrate(raw: unknown, opts: MigrateOptions = {}): MigrateResult {
  const version = isRecord(raw) ? raw.schemaVersion : undefined;
  const r = runMigrations(
    raw, version, 'saved world', opts.migrations ?? MIGRATIONS,
    opts.currentVersion ?? SCHEMA_VERSION, opts.oldestVersion ?? OLDEST_SUPPORTED_VERSION,
  );
  if (!r.ok) return r;
  fillDailyLifeDefaults(r.data);
  fillSocialDefaults(r.data);
  fillEconomyDefaults(r.data);
  fillNeighbourhoodDefaults(r.data);
  fillFloorsDefaults(r.data);
  fillExteriorDefaults(r.data); // Milestone 9 exterior (M9-ext block above)
  fillWeatherDefaults(r.data); // Milestone 12 seasons and weather (optional fields)
  fillPoolDefaults(r.data); // Milestone 12 pools (optional lot field)
  return { ok: true, state: r.data as unknown as WorldState, fromVersion: r.fromVersion, toVersion: r.toVersion, migrated: r.migrated };
}

// ---- Milestone 9: floors (M9-core) ----

/**
 * Milestone 9 adds levels 0-2. Old saves only use level 0, so there is nothing to convert: this repairs what would confuse the
 * floors code. `lot.levels` is kept at the number of floors in use (at least 1, at most 3) and a person's `rise` (height on a
 * staircase) must be a finite number or is dropped.
 */
export function fillFloorsDefaults(raw: Record<string, unknown>): void {
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (isRecord(raw.lots)) {
    for (const lot of Object.values(raw.lots)) {
      if (!isRecord(lot)) continue;
      let top = 0;
      const bump = (l: unknown) => { if (num(l) && l > top) top = l; };
      if (isRecord(lot.floors)) for (const k of Object.keys(lot.floors)) bump(Number(k.split(':')[0]));
      if (isRecord(lot.walls)) for (const w of Object.values(lot.walls)) if (isRecord(w)) bump(w.level);
      if (isRecord(lot.objects)) for (const o of Object.values(lot.objects)) if (isRecord(o)) bump(o.level);
      const used = Math.min(3, Math.max(1, Math.floor(top) + 1));
      if (!num(lot.levels) || !Number.isInteger(lot.levels) || lot.levels < used || lot.levels > 3) lot.levels = used;
    }
  }
  if (isRecord(raw.people)) {
    for (const p of Object.values(raw.people)) {
      if (!isRecord(p) || !isRecord(p.location) || p.location.kind !== 'lot') continue;
      if (p.location.rise !== undefined && !num(p.location.rise)) delete p.location.rise;
    }
  }
}

export interface ValidationResult {
  /** Fatal structure problems: the world cannot be used. Empty when the world is fine. */
  errors: string[];
  /** Oddities the game can live with. */
  warnings: string[];
  /** Content ids the data refers to that the given content does not define. Reported, never removed. */
  missing: MissingRef[];
}

/** Structure checks only (no content needed): used before writing a save and when judging an older autosave. */
export function validateWorldStructure(state: unknown): { errors: string[]; warnings: string[] } {
  return validateStructure(state);
}

/**
 * Checks a world's structure and its references into `content`. Structure problems are errors; unknown content
 * ids are listed in `missing` and left in the data so loading again with the content restores them.
 * When there are errors the reference scan is skipped (the data cannot be walked safely).
 */
export function validateWorld(state: WorldState, content: ContentDB): ValidationResult {
  const { errors, warnings } = validateStructure(state);
  if (errors.length > 0) return { errors, warnings, missing: [] };
  const c = new MissingCollector();
  for (const [id, lot] of Object.entries(state.lots)) collectLotRefs(c, content, lot, `lots.${id}`);
  for (const [id, hh] of Object.entries(state.households)) collectHouseholdRefs(c, content, hh, `households.${id}`);
  for (const [id, p] of Object.entries(state.people)) collectPersonRefs(c, content, p, `people.${id}`);
  for (const [id, item] of Object.entries(state.items)) collectItemRefs(c, content, item, `items.${id}`);
  return { errors, warnings, missing: c.result() };
}
