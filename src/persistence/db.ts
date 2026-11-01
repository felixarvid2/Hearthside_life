// Thin promise wrapper over IndexedDB. Database `hearthside` has three object stores with out-of-line keys:
//   saves      slotId -> { meta, data, checksum }   (one record per slot, written in one transaction)
//   templates  templateId -> template record
//   meta       small key/value entries (e.g. the template id counter)
// Nothing here throws or rejects: every call resolves to a DbResult with a readable message, so storage that is
// missing (private browsing), full or blocked shows up as an error the UI can display.

export const DB_NAME = 'hearthside';
export const DB_VERSION = 1;
export const STORE_NAMES = ['saves', 'templates', 'meta'] as const;
export type StoreName = (typeof STORE_NAMES)[number];

export type DbErrorCode = 'unavailable' | 'blocked' | 'quota' | 'aborted' | 'failed';
export type DbFailure = { ok: false; code: DbErrorCode; error: string };
export type DbResult<T> = { ok: true; value: T } | DbFailure;

export const UNAVAILABLE_MESSAGE =
  'Saving is not available here: this browser does not provide IndexedDB (private browsing can turn it off). '
  + 'You can still export your world to a file.';

export function dbFailure(code: DbErrorCode, error: string): DbFailure { return { ok: false, code, error }; }

/** Maps a DOMException/Error from IndexedDB to a readable message and a coarse code. */
export function describeDbError(e: unknown, action = 'use storage'): DbFailure {
  const name = typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : '';
  const message = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  switch (name) {
    case 'QuotaExceededError':
      return dbFailure('quota', 'There is not enough storage space left. Free some space or export your world to a file, then try again.');
    case 'SecurityError':
    case 'InvalidStateError':
      return dbFailure('unavailable', UNAVAILABLE_MESSAGE);
    case 'VersionError':
      return dbFailure('failed', 'The saved data was written by a newer version of Hearthside Life. Update the game to open it.');
    case 'AbortError':
      return dbFailure('aborted', `The browser cancelled the storage operation (could not ${action}). Try again.`);
    case 'DataCloneError':
      return dbFailure('failed', `The data could not be stored (${message || 'it is not plain data'}).`);
    default:
      return dbFailure('failed', `Could not ${action}${message ? `: ${message}` : '.'}`);
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/** Operations available inside a transaction callback. Awaiting only these keeps the transaction open. */
export interface Tx {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  /** All records with their keys, in key order. */
  entries<T>(store: StoreName): Promise<Array<[string, T]>>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
}

export class HearthDb {
  constructor(private readonly idb: IDBDatabase) {}

  close(): void { this.idb.close(); }

  /**
   * Runs `work` in one transaction. Everything it writes commits together or not at all: if `work` throws, or a
   * request fails, the transaction is aborted and nothing is stored. Resolves after the commit.
   */
  transaction<T>(stores: readonly StoreName[], mode: IDBTransactionMode, work: (tx: Tx) => Promise<T>, action = 'use storage'): Promise<DbResult<T>> {
    return new Promise<DbResult<T>>((resolve) => {
      let tx: IDBTransaction;
      try { tx = this.idb.transaction([...stores], mode); } catch (e) { resolve(describeDbError(e, action)); return; }
      let settled = false;
      const finish = (r: DbResult<T>) => { if (!settled) { settled = true; resolve(r); } };
      const api: Tx = {
        get: <V>(store: StoreName, key: string) => request<V | undefined>(tx.objectStore(store).get(key) as IDBRequest<V | undefined>),
        getAll: <V>(store: StoreName) => request<V[]>(tx.objectStore(store).getAll() as IDBRequest<V[]>),
        entries: <V>(store: StoreName) => new Promise<Array<[string, V]>>((res, rej) => {
          const out: Array<[string, V]> = [];
          const req = tx.objectStore(store).openCursor();
          req.onerror = () => rej(req.error ?? new Error('IndexedDB cursor failed'));
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) { res(out); return; }
            out.push([String(cursor.key), cursor.value as V]);
            cursor.continue();
          };
        }),
        put: async (store, key, value) => { await request(tx.objectStore(store).put(value, key)); },
        delete: async (store, key) => { await request(tx.objectStore(store).delete(key)); },
      };
      let outcome: { value: T } | { error: unknown } | null = null;
      const worked = Promise.resolve()
        .then(() => work(api))
        .then(
          (value) => { outcome = { value }; },
          (error: unknown) => {
            outcome = { error };
            try { tx.abort(); } catch { /* already finished */ }
          },
        );
      tx.oncomplete = () => {
        void worked.then(() => {
          if (outcome && 'value' in outcome) finish({ ok: true, value: outcome.value });
          else finish(describeDbError(outcome && 'error' in outcome ? outcome.error : undefined, action));
        });
      };
      tx.onabort = () => {
        void worked.then(() => {
          // A failure thrown by `work` is more telling than the generic abort error.
          const cause = outcome && 'error' in outcome ? outcome.error : tx.error;
          finish(describeDbError(cause, action));
        });
      };
    });
  }

  async get<T>(store: StoreName, key: string): Promise<DbResult<T | undefined>> {
    return this.transaction([store], 'readonly', (tx) => tx.get<T>(store, key), 'read saved data');
  }

  async getAll<T>(store: StoreName): Promise<DbResult<T[]>> {
    return this.transaction([store], 'readonly', (tx) => tx.getAll<T>(store), 'read saved data');
  }

  async put(store: StoreName, key: string, value: unknown): Promise<DbResult<void>> {
    return this.transaction([store], 'readwrite', (tx) => tx.put(store, key, value), 'write saved data');
  }

  async delete(store: StoreName, key: string): Promise<DbResult<void>> {
    return this.transaction([store], 'readwrite', (tx) => tx.delete(store, key), 'delete saved data');
  }
}

export interface OpenOptions {
  name?: string;
  /** Test hook / explicit control. `undefined` = the browser's `indexedDB`; `null` = pretend it is unavailable. */
  factory?: IDBFactory | null;
}

function factoryOf(opts: OpenOptions): IDBFactory | null {
  if (opts.factory !== undefined) return opts.factory;
  return (globalThis as { indexedDB?: IDBFactory }).indexedDB ?? null;
}

/** Opens (and on first use creates) the database. Never rejects. */
export function openHearthDb(opts: OpenOptions = {}): Promise<DbResult<HearthDb>> {
  const factory = factoryOf(opts);
  if (!factory) return Promise.resolve(dbFailure('unavailable', UNAVAILABLE_MESSAGE));
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try { req = factory.open(opts.name ?? DB_NAME, DB_VERSION); } catch (e) { resolve(describeDbError(e, 'open the save database')); return; }
    req.onupgradeneeded = () => {
      const idb = req.result;
      for (const name of STORE_NAMES) if (!idb.objectStoreNames.contains(name)) idb.createObjectStore(name);
    };
    req.onsuccess = () => {
      const idb = req.result;
      // Another tab upgrading the database must not be blocked by this connection.
      idb.onversionchange = () => idb.close();
      resolve({ ok: true, value: new HearthDb(idb) });
    };
    req.onerror = () => resolve(describeDbError(req.error, 'open the save database'));
    req.onblocked = () => { /* waits until the other connection closes (it listens for versionchange) */ };
  });
}

/** Deletes the whole database (all saves and templates). Used by tests and a future "reset data" option. */
export function deleteHearthDb(name: string = DB_NAME, factory?: IDBFactory | null): Promise<DbResult<void>> {
  const f = factoryOf(factory === undefined ? {} : { factory });
  if (!f) return Promise.resolve(dbFailure('unavailable', UNAVAILABLE_MESSAGE));
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try { req = f.deleteDatabase(name); } catch (e) { resolve(describeDbError(e, 'delete the save database')); return; }
    req.onsuccess = () => resolve({ ok: true, value: undefined });
    req.onerror = () => resolve(describeDbError(req.error, 'delete the save database'));
    req.onblocked = () => resolve(dbFailure('blocked', 'Close other Hearthside Life tabs, then try again.'));
  });
}

/**
 * Asks the browser not to evict this site's storage under pressure (matters most on mobile, where saves can
 * otherwise disappear). Resolves true when storage is persistent; never throws. Export files remain the real backup.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = (globalThis as { navigator?: { storage?: { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean> } } }).navigator?.storage;
    if (!storage?.persist) return false;
    return (await storage.persisted?.()) === true || (await storage.persist()) === true;
  } catch {
    return false;
  }
}
