// Persistence module: IndexedDB saves, slots, autosave and backup, migrations, validation, import/export, templates.
// Simulation-side: no DOM, no three.js (IndexedDB is the only browser API used).

export * from './types';
export { DB_NAME, DB_VERSION, HearthDb, deleteHearthDb, openHearthDb, requestPersistentStorage, type DbResult, type DbErrorCode } from './db';
export { SaveStore, type SaveStoreOptions, type SaveResult, type AutosaveResult, type LoadResult, type LoadErrorCode, type OpResult, type ImportToSlotResult } from './saves';
export { Autosaver, type AutosaverOptions } from './autosaver';
export {
  MIGRATIONS, OLDEST_SUPPORTED_VERSION, migrate, validateWorld, validateWorldStructure,
  type Migration, type MigrationRegistry, type MigrateOptions, type MigrateResult, type ValidationResult,
} from './schema';
export { describeMissing, describeReport } from './references';
export { WORLD_FORMAT, exportWorld, importWorld, type ImportResult, type WorldExportFile } from './exportImport';
export {
  TEMPLATE_FORMAT, TEMPLATE_SCHEMA_VERSION, TemplateStore, exportTemplate, importTemplate, validateTemplateData,
  type AnyTemplate, type TemplateData, type TemplateImportResult, type TemplateKind, type TemplateRecord, type TemplateStoreOptions,
} from './templates';
