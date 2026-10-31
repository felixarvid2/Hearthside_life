import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DB_NAME, STORE_NAMES, UNAVAILABLE_MESSAGE, deleteHearthDb, describeDbError, openHearthDb, requestPersistentStorage,
  type HearthDb,
} from '../../../src/persistence/db';
import { newFactory } from './fixtures';

async function open(): Promise<HearthDb> {
  const r = await openHearthDb({ factory: newFactory() });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('HearthDb', () => {
  it('creates the three object stores', async () => {
    const factory = newFactory();
    const r = await openHearthDb({ factory });
    expect(r.ok).toBe(true);
    const names = await factory.databases();
    expect(names.map((d) => d.name)).toEqual([DB_NAME]);
    if (r.ok) {
      for (const store of STORE_NAMES) expect((await r.value.getAll(store)).ok).toBe(true);
      r.value.close();
    }
  });

  it('puts, gets, lists and deletes records', async () => {
    const db = await open();
    expect(await db.put('meta', 'a', { n: 1 })).toEqual({ ok: true, value: undefined });
    expect(await db.get('meta', 'a')).toEqual({ ok: true, value: { n: 1 } });
    expect(await db.get('meta', 'missing')).toEqual({ ok: true, value: undefined });
    await db.put('meta', 'b', 2);
    expect(await db.getAll('meta')).toEqual({ ok: true, value: [{ n: 1 }, 2] });
    expect((await db.transaction(['meta'], 'readonly', (tx) => tx.entries<unknown>('meta'))).ok).toBe(true);
    await db.delete('meta', 'a');
    expect(await db.get('meta', 'a')).toEqual({ ok: true, value: undefined });
    db.close();
  });

  it('commits a multi-store transaction together', async () => {
    const db = await open();
    const r = await db.transaction(['saves', 'meta'], 'readwrite', async (tx) => {
      await tx.put('saves', 'slot-1', { x: 1 });
      await tx.put('meta', 'lastSlot', 'slot-1');
      return 'done';
    });
    expect(r).toEqual({ ok: true, value: 'done' });
    expect(await db.get('saves', 'slot-1')).toEqual({ ok: true, value: { x: 1 } });
    expect(await db.get('meta', 'lastSlot')).toEqual({ ok: true, value: 'slot-1' });
    db.close();
  });

  it('rolls everything back when the work throws half way', async () => {
    const db = await open();
    await db.put('saves', 'slot-1', 'old');
    const r = await db.transaction(['saves', 'meta'], 'readwrite', async (tx) => {
      await tx.put('saves', 'slot-1', 'new');
      await tx.put('meta', 'lastSlot', 'slot-1');
      throw new Error('disk on fire');
    }, 'save the game');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('disk on fire');
    expect(await db.get('saves', 'slot-1')).toEqual({ ok: true, value: 'old' });
    expect(await db.get('meta', 'lastSlot')).toEqual({ ok: true, value: undefined });
    db.close();
  });

  it('reports values that cannot be stored instead of throwing', async () => {
    const db = await open();
    const r = await db.put('meta', 'bad', { fn: () => 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/could not be stored|Could not/);
    db.close();
  });

  it('returns a clear error, never throws, when IndexedDB is unavailable', async () => {
    const r = await openHearthDb({ factory: null });
    expect(r).toEqual({ ok: false, code: 'unavailable', error: UNAVAILABLE_MESSAGE });
    expect((await deleteHearthDb(DB_NAME, null)).ok).toBe(false);
  });

  it('turns an open() that throws (private mode) into an error result', async () => {
    const hostile = { open() { throw new DOMException('denied', 'SecurityError'); } } as unknown as IDBFactory;
    const r = await openHearthDb({ factory: hostile });
    expect(r).toMatchObject({ ok: false, code: 'unavailable' });
  });

  it('reports a closed connection as an error result', async () => {
    const db = await open();
    db.close();
    const r = await db.get('saves', 'slot-1');
    expect(r.ok).toBe(false);
  });

  it('deletes the database', async () => {
    const factory = newFactory();
    const r = await openHearthDb({ factory });
    if (!r.ok) throw new Error(r.error);
    await r.value.put('saves', 'slot-1', 1);
    r.value.close();
    expect((await deleteHearthDb(DB_NAME, factory)).ok).toBe(true);
    const again = await openHearthDb({ factory });
    if (!again.ok) throw new Error(again.error);
    expect(await again.value.get('saves', 'slot-1')).toEqual({ ok: true, value: undefined });
    again.value.close();
  });

  it('maps well-known errors to readable messages', () => {
    expect(describeDbError(new DOMException('full', 'QuotaExceededError'))).toMatchObject({ code: 'quota', error: expect.stringContaining('storage space') });
    expect(describeDbError(new DOMException('x', 'VersionError'))).toMatchObject({ error: expect.stringContaining('newer version') });
    expect(describeDbError(new Error('boom'), 'save the game')).toEqual({ ok: false, code: 'failed', error: 'Could not save the game: boom' });
    expect(describeDbError(undefined).ok).toBe(false);
  });
});

describe('requestPersistentStorage', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('is false without the Storage API and never throws', async () => {
    vi.stubGlobal('navigator', {});
    expect(await requestPersistentStorage()).toBe(false);
    vi.stubGlobal('navigator', { storage: { persist: () => Promise.reject(new Error('denied')) } });
    expect(await requestPersistentStorage()).toBe(false);
  });

  it('asks the browser to persist and reports the answer', async () => {
    let asked = 0;
    vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist: async () => { asked++; return true; } } });
    expect(await requestPersistentStorage()).toBe(true);
    expect(asked).toBe(1);
    vi.stubGlobal('navigator', { storage: { persisted: async () => true, persist: async () => { asked++; return false; } } });
    expect(await requestPersistentStorage()).toBe(true);
    expect(asked).toBe(1);
  });
});
