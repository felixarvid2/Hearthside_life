// World export and import as a standalone JSON file (the backup players can keep outside the browser).
//
// File layout: { format: 'hearthside-world', schemaVersion, exportedAt, packs: [], world: WorldState }.
// Importing is a pure function: it never touches stored saves, so a failed import cannot damage anything.

import type { ContentDB } from '../content/types';
import type { WorldState } from '../core/types';
import { SCHEMA_VERSION } from '../core/types';
import { migrate, validateWorld } from './schema';
import { has, isRecord } from './shape';
import type { WorldReport } from './types';

export const WORLD_FORMAT = 'hearthside-world';

export interface WorldExportFile {
  format: typeof WORLD_FORMAT;
  schemaVersion: number;
  /** ISO timestamp supplied by the caller (this module never reads the clock). */
  exportedAt: string;
  /** Content pack ids the world needs. Empty while only the base pack exists. */
  packs: string[];
  world: WorldState;
}

/** The world as a JSON string for download. `exportedAt` is an ISO timestamp from the caller's clock. */
export function exportWorld(state: WorldState, exportedAt: string, packs: string[] = []): string {
  const file: WorldExportFile = { format: WORLD_FORMAT, schemaVersion: state.schemaVersion, exportedAt, packs, world: state };
  return JSON.stringify(file);
}

export type ImportResult =
  | { ok: true; state: WorldState; report: WorldReport; exportedAt: string | null }
  | { ok: false; errors: string[] };

const fail = (...errors: string[]): ImportResult => ({ ok: false, errors });

/**
 * Parses, migrates and validates an exported world. Errors are clear sentences: not JSON, not a Hearthside
 * world, made by a newer version, or structurally broken. Unknown content ids are reported, not removed.
 */
export function importWorld(json: string, content: ContentDB): ImportResult {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch (e) {
    return fail(`This file is not valid JSON, so it cannot be a Hearthside Life world (${e instanceof Error ? e.message : 'parse error'}).`);
  }
  if (!isRecord(raw)) return fail('This file is JSON, but not a Hearthside Life world export (expected an object).');
  if (raw.format !== WORLD_FORMAT) {
    return fail(raw.format === undefined
      ? 'This file is not a Hearthside Life world export (it has no "format" marker).'
      : `This file is not a Hearthside Life world export (format "${String(raw.format)}", expected "${WORLD_FORMAT}").`);
  }
  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion)) {
    return fail('This world export has no valid schemaVersion, so it cannot be opened safely.');
  }
  if (raw.schemaVersion > SCHEMA_VERSION) {
    return fail(`This world was exported by a newer version of Hearthside Life (schema ${raw.schemaVersion}; this version understands up to ${SCHEMA_VERSION}). Update the game to open it.`);
  }
  if (!isRecord(raw.world)) return fail('This world export contains no world data.');
  if (raw.world.schemaVersion !== raw.schemaVersion) {
    return fail(`The export header says schema ${raw.schemaVersion} but the world inside says ${String(raw.world.schemaVersion)}; the file is inconsistent.`);
  }

  const m = migrate(raw.world);
  if (!m.ok) return fail(m.error);
  const v = validateWorld(m.state, content);
  if (v.errors.length > 0) {
    return fail('The world in this file is damaged and was not imported:', ...v.errors);
  }

  const warnings = [...v.warnings];
  if (Array.isArray(raw.packs)) {
    for (const pack of raw.packs) {
      if (typeof pack === 'string' && !has(content.packs, pack)) warnings.push(`The world needs the content pack "${pack}", which is not installed. Its content is listed as missing.`);
    }
  }
  return {
    ok: true,
    state: m.state,
    report: { missing: v.missing, warnings, migratedFrom: m.migrated ? m.fromVersion : null },
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : null,
  };
}
