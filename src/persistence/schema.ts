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
  return { ok: true, state: r.data as unknown as WorldState, fromVersion: r.fromVersion, toVersion: r.toVersion, migrated: r.migrated };
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
