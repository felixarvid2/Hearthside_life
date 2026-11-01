// Character presets (appearance) and household templates, stored locally in the `templates` store and
// shareable as versioned JSON files (brief sections 6.8 and 23).
//
// File layout: { format: 'hearthside-template', schemaVersion, kind, name, exportedAt, packs: [], data }.
// Importing never rejects a template just because content is missing: unknown ids are reported in `missing`
// and stay in the data, so the template works again once the content (pack) is available.

import type { ContentDB } from '../content/types';
import type { HouseholdDraft } from '../core/drafts';
import type { Appearance } from '../core/types';
import { DB_NAME, HearthDb, UNAVAILABLE_MESSAGE, dbFailure, openHearthDb, type DbResult, type Tx } from './db';
import { serializeChecked } from './json';
import { MissingCollector, collectAppearanceRefs, collectDraftRefs } from './references';
import { runMigrations, type MigrationRegistry } from './schema';
import { checkAppearance, checkHouseholdDraft, has, isRecord, isStr } from './shape';
import { systemClock, type Clock, type MissingRef } from './types';

export type TemplateKind = 'appearance' | 'household';
export const TEMPLATE_KINDS: readonly TemplateKind[] = ['appearance', 'household'];

export interface TemplateData { appearance: Appearance; household: HouseholdDraft }

export interface TemplateRecord<K extends TemplateKind = TemplateKind> {
  id: string;
  kind: K;
  name: string;
  /** ISO timestamp from the injected clock. */
  savedAt: string;
  data: TemplateData[K];
}
export type AnyTemplate = { [K in TemplateKind]: TemplateRecord<K> }[TemplateKind];

export const TEMPLATE_FORMAT = 'hearthside-template';
/** Version of the template file format and of the draft data inside it. */
export const TEMPLATE_SCHEMA_VERSION = 1;
export const TEMPLATE_MIGRATIONS: MigrationRegistry = { 1: (raw) => raw };

export interface TemplateExportFile {
  format: typeof TEMPLATE_FORMAT;
  schemaVersion: number;
  kind: TemplateKind;
  name: string;
  exportedAt: string;
  packs: string[];
  data: Appearance | HouseholdDraft;
}

const NAME_LIMIT = 60;
const isKind = (x: unknown): x is TemplateKind => x === 'appearance' || x === 'household';

function cleanName(name: string, kind: TemplateKind): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, NAME_LIMIT) || (kind === 'appearance' ? 'Untitled look' : 'Untitled household');
}

/** Shape problems of template data; empty when valid. */
export function validateTemplateData(kind: TemplateKind, data: unknown): string[] {
  const problems: string[] = [];
  if (kind === 'appearance') checkAppearance(data, 'appearance', problems);
  else checkHouseholdDraft(data, 'household', problems);
  return problems;
}

/** Content ids in a template that the given content does not define. */
export function templateMissing(kind: TemplateKind, data: TemplateData[TemplateKind], content: ContentDB): MissingRef[] {
  const c = new MissingCollector();
  if (kind === 'appearance') collectAppearanceRefs(c, content, data as Appearance, 'appearance');
  else (data as HouseholdDraft).members.forEach((m, i) => collectDraftRefs(c, content, m, `household.members[${i}]`));
  return c.result();
}

/** Versioned JSON for sharing one template. `exportedAt` is an ISO timestamp from the caller's clock. */
export function exportTemplate(t: Pick<AnyTemplate, 'kind' | 'name' | 'data'>, exportedAt: string, packs: string[] = []): string {
  const file: TemplateExportFile = { format: TEMPLATE_FORMAT, schemaVersion: TEMPLATE_SCHEMA_VERSION, kind: t.kind, name: t.name, exportedAt, packs, data: t.data };
  return JSON.stringify(file);
}

export type TemplateImportResult =
  | { ok: true; kind: TemplateKind; name: string; data: Appearance | HouseholdDraft; missing: MissingRef[]; warnings: string[] }
  | { ok: false; errors: string[] };

/** Parses and checks a template file without storing anything. */
export function importTemplate(json: string, content: ContentDB): TemplateImportResult {
  const fail = (...errors: string[]): TemplateImportResult => ({ ok: false, errors });
  let raw: unknown;
  try { raw = JSON.parse(json); } catch (e) {
    return fail(`This file is not valid JSON, so it cannot be a Hearthside Life template (${e instanceof Error ? e.message : 'parse error'}).`);
  }
  if (!isRecord(raw)) return fail('This file is JSON, but not a Hearthside Life template (expected an object).');
  if (raw.format !== TEMPLATE_FORMAT) {
    return fail(raw.format === undefined
      ? 'This file is not a Hearthside Life template (it has no "format" marker).'
      : `This file is not a Hearthside Life template (format "${String(raw.format)}", expected "${TEMPLATE_FORMAT}").`);
  }
  const m = runMigrations(raw, raw.schemaVersion, 'template', TEMPLATE_MIGRATIONS, TEMPLATE_SCHEMA_VERSION, 1);
  if (!m.ok) return fail(m.error);
  const t = m.data;
  if (!isKind(t.kind)) return fail(`This template has an unknown kind "${String(t.kind)}" (expected appearance or household).`);
  const problems = validateTemplateData(t.kind, t.data);
  if (problems.length > 0) return fail('The template data is damaged and was not imported:', ...problems);
  const data = t.data as Appearance | HouseholdDraft;
  const warnings: string[] = [];
  if (Array.isArray(t.packs)) {
    for (const pack of t.packs) {
      if (isStr(pack) && !has(content.packs, pack)) warnings.push(`This template needs the content pack "${pack}", which is not installed. Its content is listed as missing.`);
    }
  }
  return { ok: true, kind: t.kind, name: cleanName(isStr(t.name) ? t.name : '', t.kind), data, missing: templateMissing(t.kind, data, content), warnings };
}

export interface TemplateStoreOptions {
  clock?: Clock;
  db?: HearthDb;
  factory?: IDBFactory | null;
}

export type TemplateSaveResult<K extends TemplateKind = TemplateKind> = { ok: true; template: TemplateRecord<K> } | { ok: false; error: string };
export type TemplateOpResult = { ok: true } | { ok: false; error: string };
export type TemplateStoreImportResult =
  | { ok: true; template: AnyTemplate; missing: MissingRef[]; warnings: string[] }
  | { ok: false; errors: string[] };

/** Stored templates are plain records; anything that does not look like one is ignored by list(). */
function asTemplate(raw: unknown): AnyTemplate | null {
  if (!isRecord(raw) || !isStr(raw.id) || !isKind(raw.kind) || !isStr(raw.name) || !isStr(raw.savedAt) || !isRecord(raw.data)) return null;
  return raw as unknown as AnyTemplate;
}

export class TemplateStore {
  private constructor(private readonly db: HearthDb | null, readonly unavailableReason: string | null, private readonly opts: TemplateStoreOptions) {}

  /** Opens the database. Never rejects: when storage is unavailable every call reports a clear error. */
  static async open(dbName: string = DB_NAME, opts: TemplateStoreOptions = {}): Promise<TemplateStore> {
    if (opts.db) return new TemplateStore(opts.db, null, opts);
    const r = await openHearthDb({ name: dbName, factory: opts.factory });
    return r.ok ? new TemplateStore(r.value, null, opts) : new TemplateStore(null, r.error, opts);
  }

  get available(): boolean { return this.db !== null; }
  close(): void { this.db?.close(); }

  private run<T>(mode: IDBTransactionMode, work: (tx: Tx) => Promise<T>, action: string): Promise<DbResult<T>> {
    if (!this.db) return Promise.resolve(dbFailure('unavailable', this.unavailableReason ?? UNAVAILABLE_MESSAGE));
    return this.db.transaction(['templates', 'meta'], mode, work, action);
  }

  /**
   * Stores a template. Without `id` a new template is created; with the id of an existing one it is replaced
   * (keeping the id). The data is checked first so a broken draft is rejected with a clear message.
   */
  async save<K extends TemplateKind>(kind: K, name: string, data: TemplateData[K], id?: string): Promise<TemplateSaveResult<K>> {
    if (!isKind(kind)) return { ok: false, error: `Unknown template kind "${String(kind)}".` };
    const problems = validateTemplateData(kind, data);
    if (problems.length > 0) return { ok: false, error: `Not saved: ${problems[0] ?? 'the data is invalid'}${problems.length > 1 ? ` (and ${problems.length - 1} more problems)` : ''}.` };
    const ser = serializeChecked(data);
    if (!ser.ok) return { ok: false, error: `Not saved. ${ser.error}` };
    const savedAt = (this.opts.clock ?? systemClock)().toISOString();
    const clean = cleanName(name, kind);
    const w = await this.run('readwrite', async (tx) => {
      let tid = id;
      if (tid === undefined) {
        const seq = (await tx.get<number>('meta', 'templateSeq')) ?? 0;
        tid = `tpl_${(seq + 1).toString(36)}`;
        await tx.put('meta', 'templateSeq', seq + 1);
      }
      // A fresh copy: later changes to the caller's object cannot reach the stored template or the returned record.
      const record = { id: tid, kind, name: clean, savedAt, data: JSON.parse(ser.json) as TemplateData[K] } satisfies TemplateRecord<K>;
      await tx.put('templates', tid, record);
      return record;
    }, 'save the template');
    return w.ok ? { ok: true, template: w.value } : { ok: false, error: `Not saved. ${w.error}` };
  }

  /** Templates of one kind (or all), sorted by name. */
  async list(kind?: TemplateKind): Promise<AnyTemplate[]> {
    const r = await this.run('readonly', (tx) => tx.getAll<unknown>('templates'), 'read the templates');
    if (!r.ok) return [];
    const out: AnyTemplate[] = [];
    for (const raw of r.value) {
      const t = asTemplate(raw);
      if (t && (kind === undefined || t.kind === kind)) out.push(t);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.savedAt.localeCompare(b.savedAt));
  }

  async get(id: string): Promise<AnyTemplate | null> {
    const r = await this.run('readonly', (tx) => tx.get<unknown>('templates', id), 'read the template');
    return r.ok ? asTemplate(r.value) : null;
  }

  async remove(id: string): Promise<TemplateOpResult> {
    const r = await this.run('readwrite', (tx) => tx.delete('templates', id), 'delete the template');
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  async rename(id: string, name: string): Promise<TemplateOpResult> {
    const r = await this.run('readwrite', async (tx) => {
      const t = asTemplate(await tx.get<unknown>('templates', id));
      if (!t) return false;
      await tx.put('templates', id, { ...t, name: cleanName(name, t.kind) });
      return true;
    }, 'rename the template');
    if (!r.ok) return { ok: false, error: r.error };
    return r.value ? { ok: true } : { ok: false, error: 'That template no longer exists.' };
  }

  /** Versioned JSON of a stored template. */
  async exportTemplate(id: string, exportedAt: string): Promise<{ ok: true; json: string } | { ok: false; error: string }> {
    const t = await this.get(id);
    return t ? { ok: true, json: exportTemplate(t, exportedAt) } : { ok: false, error: 'That template no longer exists.' };
  }

  /** Checks a template file and stores it as a new template. Missing content is reported; nothing is removed. */
  async importTemplate(json: string, content: ContentDB): Promise<TemplateStoreImportResult> {
    const imp = importTemplate(json, content);
    if (!imp.ok) return imp;
    const saved = imp.kind === 'appearance'
      ? await this.save('appearance', imp.name, imp.data as Appearance)
      : await this.save('household', imp.name, imp.data as HouseholdDraft);
    if (!saved.ok) return { ok: false, errors: [saved.error] };
    return { ok: true, template: saved.template, missing: imp.missing, warnings: imp.warnings };
  }
}
