// Save slots on top of IndexedDB: five manual slots, a rolling autosave and a last-known-good backup.
//
// Every save is verified before it is written (the state must survive a JSON round trip unchanged and pass the
// structure checks) and written as one record { meta, data, checksum } in one transaction, so a failed save never
// damages the previous one. `data` is the world as a JSON string; the checksum exposes truncated or altered data.
// Loading never modifies storage: migrate -> validate -> report, or a clear error.

import type { ContentDB } from '../content/types';
import type { WorldState } from '../core/types';
import { DB_NAME, HearthDb, UNAVAILABLE_MESSAGE, dbFailure, openHearthDb, type DbResult, type Tx } from './db';
import { importWorld } from './exportImport';
import { checksum, serializeChecked } from './json';
import { migrate, validateWorld, validateWorldStructure } from './schema';
import { isRecord } from './shape';
import {
  SLOT_IDS, defaultSlotName, emptyMeta, isManualSlot, isSlotId, slotKind, systemClock,
  type Clock, type SaveMeta, type SlotId, type WorldReport,
} from './types';

/** What is stored under a slot key. */
interface StoredSave { meta: SaveMeta; data: string; checksum: string }

export interface SaveStoreOptions {
  /** Source of `savedAt`. Default: the system clock. */
  clock?: Clock;
  /** Reuse an open connection instead of opening `dbName`. */
  db?: HearthDb;
  /** IndexedDB factory (tests); `null` simulates unavailable storage. Default: the browser's `indexedDB`. */
  factory?: IDBFactory | null;
  /** Content used to check references on load. Default: the game's registry, imported on first use. */
  content?: ContentDB | (() => ContentDB);
}

export type SaveResult = { ok: true; meta: SaveMeta } | { ok: false; error: string };
export type AutosaveResult = { ok: true; meta: SaveMeta; rotatedBackup: boolean } | { ok: false; error: string };
export type OpResult = { ok: true } | { ok: false; error: string };
export type LoadErrorCode = 'unavailable' | 'empty' | 'damaged' | 'invalid' | 'newer' | 'tooOld' | 'failed';
export type LoadResult =
  | { ok: true; state: WorldState; report: WorldReport; meta: SaveMeta }
  | { ok: false; error: string; code: LoadErrorCode };
export type ImportToSlotResult =
  | { ok: true; meta: SaveMeta; report: WorldReport }
  | { ok: false; error: string; errors: string[] };

const NAME_LIMIT = 60;

function cleanName(name: string, slotId: SlotId): string {
  const n = name.replace(/\s+/g, ' ').trim().slice(0, NAME_LIMIT);
  return n || defaultSlotName(slotId);
}

function slotLabel(slotId: SlotId): string {
  return slotId === 'autosave' ? 'The autosave' : slotId === 'backup' ? 'The backup' : `Slot ${slotId.slice(5)}`;
}

function metaFor(slotId: SlotId, name: string, state: WorldState, savedAt: string): SaveMeta {
  const hh = state.households[state.activeHouseholdId];
  return {
    slotId, name, savedAt, gameMinutes: state.clock.minutes, householdName: hh?.name ?? '', funds: hh?.funds ?? 0,
    schemaVersion: state.schemaVersion, kind: slotKind(slotId), empty: false,
  };
}

/** Reads a stored record's metadata, tolerating damage. */
function readMeta(slotId: SlotId, raw: unknown): SaveMeta {
  const damaged = (): SaveMeta => ({ ...emptyMeta(slotId, 'This entry is damaged and cannot be listed.'), empty: false, name: `${defaultSlotName(slotId)} (damaged)` });
  if (!isRecord(raw) || !isRecord(raw.meta)) return damaged();
  const m = raw.meta;
  if (typeof m.name !== 'string' || typeof m.savedAt !== 'string' || typeof m.gameMinutes !== 'number'
    || typeof m.householdName !== 'string' || typeof m.funds !== 'number' || typeof m.schemaVersion !== 'number') return damaged();
  const meta: SaveMeta = {
    slotId, name: m.name, savedAt: m.savedAt, gameMinutes: m.gameMinutes, householdName: m.householdName, funds: m.funds,
    schemaVersion: m.schemaVersion, kind: slotKind(slotId), empty: false,
  };
  if (typeof raw.data === 'string' && typeof raw.checksum === 'string' && checksum(raw.data) !== raw.checksum) {
    meta.problem = 'The saved data is damaged (it does not match its checksum).';
  }
  return meta;
}

type Decoded =
  | { ok: true; world: WorldState; migratedFrom: number | null; meta: SaveMeta }
  | { ok: false; code: LoadErrorCode; error: string };

/** Record -> parsed and migrated world (not yet validated against content). */
function decodeStored(slotId: SlotId, raw: unknown): Decoded {
  const damaged = (why: string): Decoded => ({ ok: false, code: 'damaged', error: why });
  if (!isRecord(raw) || !isRecord(raw.meta)) return damaged('the stored entry is not a save record');
  let parsed: unknown;
  if (typeof raw.data === 'string') {
    if (typeof raw.checksum === 'string' && checksum(raw.data) !== raw.checksum) return damaged('its contents do not match the stored checksum (the data was cut short or altered)');
    try { parsed = JSON.parse(raw.data); } catch { return damaged('its contents are not readable JSON'); }
  } else if (isRecord(raw.data)) {
    parsed = raw.data;
  } else {
    return damaged('it holds no world data');
  }
  const m = migrate(parsed);
  if (!m.ok) {
    const code: LoadErrorCode = m.code === 'invalid' ? 'damaged' : m.code === 'failed' ? 'failed' : m.code;
    return { ok: false, code, error: m.error };
  }
  return { ok: true, world: m.state, migratedFrom: m.migrated ? m.fromVersion : null, meta: readMeta(slotId, raw) };
}

function summarize(errors: readonly string[]): string {
  const first = errors[0] ?? 'unknown problem';
  return errors.length > 1 ? `${first} (and ${errors.length - 1} more problems)` : first;
}

export class SaveStore {
  private constructor(
    private readonly db: HearthDb | null,
    /** Why storage cannot be used, or null when it works. */
    readonly unavailableReason: string | null,
    private readonly opts: SaveStoreOptions,
  ) {}

  /** Opens the database. Never rejects: when storage is unavailable the store reports clear errors instead. */
  static async open(dbName: string = DB_NAME, opts: SaveStoreOptions = {}): Promise<SaveStore> {
    if (opts.db) return new SaveStore(opts.db, null, opts);
    const r = await openHearthDb({ name: dbName, factory: opts.factory });
    return r.ok ? new SaveStore(r.value, null, opts) : new SaveStore(null, r.error, opts);
  }

  get available(): boolean { return this.db !== null; }
  close(): void { this.db?.close(); }

  private get now(): string { return (this.opts.clock ?? systemClock)().toISOString(); }

  private async contentDb(explicit?: ContentDB): Promise<ContentDB> {
    if (explicit) return explicit;
    const c = this.opts.content;
    if (c) return typeof c === 'function' ? c() : c;
    return (await import('../content/index')).content();
  }

  private run<T>(mode: IDBTransactionMode, work: (tx: Tx) => Promise<T>, action: string): Promise<DbResult<T>> {
    if (!this.db) return Promise.resolve(dbFailure('unavailable', this.unavailableReason ?? UNAVAILABLE_MESSAGE));
    return this.db.transaction(['saves'], mode, work, action);
  }

  /** All seven slots in display order (slot-1..slot-5, autosave, backup). Empty slots are included. */
  async list(): Promise<SaveMeta[]> {
    const r = await this.run('readonly', (tx) => tx.entries<unknown>('saves'), 'read the saves');
    if (!r.ok) return SLOT_IDS.map((id) => emptyMeta(id, r.error));
    const byKey = new Map(r.value);
    return SLOT_IDS.map((id) => (byKey.has(id) ? readMeta(id, byKey.get(id)) : emptyMeta(id)));
  }

  /** The most recently saved non-empty slot, or null. */
  async latest(): Promise<SaveMeta | null> {
    let best: SaveMeta | null = null;
    for (const m of await this.list()) {
      if (m.empty || m.problem) continue;
      if (!best || m.savedAt > best.savedAt) best = m;
    }
    return best;
  }

  /** Serializes synchronously (later changes to `state` cannot leak in) and verifies the state before anything is written. */
  private prepare(slotId: SlotId, name: string, state: WorldState): { ok: true; record: StoredSave } | { ok: false; error: string } {
    const ser = serializeChecked(state);
    if (!ser.ok) return { ok: false, error: `Not saved. ${ser.error}` };
    const { errors } = validateWorldStructure(state);
    if (errors.length > 0) {
      return { ok: false, error: `Not saved: the game state is inconsistent (${summarize(errors)}). The previous save in this slot is untouched.` };
    }
    return { ok: true, record: { meta: metaFor(slotId, cleanName(name, slotId), state, this.now), data: ser.json, checksum: checksum(ser.json) } };
  }

  /** Writes the world to a manual slot (slot-1..slot-5), replacing what was there. */
  async save(slotId: SlotId, name: string, state: WorldState): Promise<SaveResult> {
    if (!isManualSlot(slotId)) return { ok: false, error: `"${String(slotId)}" is not a manual save slot. Use slot-1 to slot-5; the autosave has its own call.` };
    const p = this.prepare(slotId, name, state);
    if (!p.ok) return p;
    const w = await this.run('readwrite', (tx) => tx.put('saves', slotId, p.record), 'save the game');
    return w.ok ? { ok: true, meta: p.record.meta } : { ok: false, error: `Not saved. ${w.error}` };
  }

  /**
   * Writes the autosave. In the same transaction the previous autosave is copied to `backup` - but only when it is
   * intact and valid, so a damaged autosave never replaces the last known good backup.
   */
  async autosave(state: WorldState): Promise<AutosaveResult> {
    const p = this.prepare('autosave', defaultSlotName('autosave'), state);
    if (!p.ok) return p;
    const w = await this.run('readwrite', async (tx) => {
      const prev = await tx.get<unknown>('saves', 'autosave');
      let rotated = false;
      if (prev !== undefined) {
        const d = decodeStored('autosave', prev);
        if (d.ok && validateWorldStructure(d.world).errors.length === 0 && isRecord(prev)) {
          const data = typeof prev.data === 'string' ? prev.data : JSON.stringify(d.world);
          const backup: StoredSave = { meta: { ...d.meta, slotId: 'backup', kind: 'backup', name: defaultSlotName('backup'), empty: false }, data, checksum: checksum(data) };
          delete backup.meta.problem;
          await tx.put('saves', 'backup', backup);
          rotated = true;
        }
      }
      await tx.put('saves', 'autosave', p.record);
      return rotated;
    }, 'autosave');
    return w.ok ? { ok: true, meta: p.record.meta, rotatedBackup: w.value } : { ok: false, error: `Autosave failed. ${w.error}` };
  }

  /**
   * Loads a slot: parse -> migrate -> validate. Nothing in storage changes, even when the data was migrated.
   * Unknown content ids are listed in `report.missing` and stay in the state.
   */
  async load(slotId: SlotId, content?: ContentDB): Promise<LoadResult> {
    if (!isSlotId(slotId)) return { ok: false, code: 'invalid', error: `"${String(slotId)}" is not a save slot.` };
    const label = slotLabel(slotId);
    const r = await this.run('readonly', (tx) => tx.get<unknown>('saves', slotId), 'read the save');
    if (!r.ok) return { ok: false, code: r.code === 'unavailable' ? 'unavailable' : 'failed', error: r.error };
    if (r.value === undefined) return { ok: false, code: 'empty', error: `${label} is empty.` };
    const hint = slotId === 'autosave' ? ' The backup slot may still hold the previous autosave.' : '';
    const d = decodeStored(slotId, r.value);
    if (!d.ok) {
      const lead = d.code === 'damaged' ? `${label} is damaged: ` : `${label}: `;
      return { ok: false, code: d.code, error: `${lead}${d.error}${d.code === 'damaged' ? `.${hint}` : ''}` };
    }
    const v = validateWorld(d.world, await this.contentDb(content));
    if (v.errors.length > 0) {
      return { ok: false, code: 'damaged', error: `${label} is damaged: ${summarize(v.errors)}.${hint}` };
    }
    return { ok: true, state: d.world, meta: d.meta, report: { missing: v.missing, warnings: v.warnings, migratedFrom: d.migratedFrom } };
  }

  /** Deletes a slot (any of the seven). Removing an empty slot succeeds. */
  async remove(slotId: SlotId): Promise<OpResult> {
    if (!isSlotId(slotId)) return { ok: false, error: `"${String(slotId)}" is not a save slot.` };
    const r = await this.run('readwrite', (tx) => tx.delete('saves', slotId), 'delete the save');
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  /** Renames a manual slot without touching its data. */
  async rename(slotId: SlotId, name: string): Promise<OpResult> {
    if (!isManualSlot(slotId)) return { ok: false, error: 'Only the five numbered slots can be renamed.' };
    const r = await this.run('readwrite', async (tx) => {
      const rec = await tx.get<unknown>('saves', slotId);
      if (rec === undefined || !isRecord(rec)) return 'empty' as const;
      const meta = { ...readMeta(slotId, rec), name: cleanName(name, slotId) };
      delete meta.problem;
      await tx.put('saves', slotId, { ...rec, meta });
      return 'done' as const;
    }, 'rename the save');
    if (!r.ok) return { ok: false, error: r.error };
    return r.value === 'done' ? { ok: true } : { ok: false, error: `${slotLabel(slotId)} is empty, so there is nothing to rename.` };
  }

  /**
   * Imports an exported world file into a manual slot. The file is fully checked first; when anything is wrong the
   * stored saves are not touched.
   */
  async importToSlot(slotId: SlotId, name: string, json: string, content?: ContentDB): Promise<ImportToSlotResult> {
    const imp = importWorld(json, await this.contentDb(content));
    if (!imp.ok) return { ok: false, error: imp.errors.join(' '), errors: imp.errors };
    const saved = await this.save(slotId, name, imp.state);
    return saved.ok ? { ok: true, meta: saved.meta, report: imp.report } : { ok: false, error: saved.error, errors: [saved.error] };
  }
}
