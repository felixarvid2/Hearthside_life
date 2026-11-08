// Milestone 13: rotating backups per slot, fallback to the newest good backup, quota errors, failing saves.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { HearthDb, dbFailure, openHearthDb, type DbResult, type StoreName, type Tx } from '../../../src/persistence/db';
import { checksum } from '../../../src/persistence/json';
import { BACKUPS_PER_SLOT, SaveStore, backupKey } from '../../../src/persistence/saves';
import { makeContent, makeWorld, newFactory, steppingClock } from './fixtures';

const opened: Array<{ close(): void }> = [];
afterEach(() => { while (opened.length) opened.pop()?.close(); });

async function env() {
  const factory = newFactory();
  const store = await SaveStore.open('hearthside', { factory, clock: steppingClock(), content: makeContent() });
  const rawOpen = await openHearthDb({ factory });
  if (!rawOpen.ok) throw new Error(rawOpen.error);
  opened.push(store, rawOpen.value);
  return { store, factory, raw: rawOpen.value };
}
type Rec = { meta: unknown; data: string; checksum: string };
async function rec(raw: HearthDb, key: string): Promise<Rec | undefined> {
  const r = await raw.get<Rec>('saves', key);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
const minutes = (n: number) => { const w = makeWorld(); w.clock.minutes = n; return w; };
const minutesOf = async (store: SaveStore, slot: Parameters<SaveStore['load']>[0], recover = true) => {
  const r = await store.load(slot, undefined, { recover });
  return r.ok ? r.state.clock.minutes : r;
};

describe('rotating backups', () => {
  it('keeps the last three good saves of a manual slot, newest first', async () => {
    const { store, raw } = await env();
    for (const m of [100, 200, 300, 400, 500]) expect((await store.save('slot-1', 'x', minutes(m))).ok).toBe(true);
    expect(BACKUPS_PER_SLOT).toBe(3);
    const got: number[] = [];
    for (let n = 1; n <= 4; n++) {
      const r = await rec(raw, backupKey('slot-1', n));
      got.push(r ? (JSON.parse(r.data) as { clock: { minutes: number } }).clock.minutes : -1);
    }
    expect(got).toEqual([400, 300, 200, -1]);
    expect(await minutesOf(store, 'slot-1')).toBe(500);
  });

  it('keeps backups per slot independent and hides them from the slot list', async () => {
    const { store } = await env();
    await store.save('slot-1', 'a', minutes(1)); await store.save('slot-1', 'a', minutes(2));
    await store.save('slot-2', 'b', minutes(10));
    const list = await store.list();
    expect(list.map((m) => m.slotId)).toEqual(['slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5', 'autosave', 'backup']);
    expect(list[1]!.gameMinutes).toBe(10);
  });

  it('does not fill the chain with identical copies', async () => {
    const { store, raw } = await env();
    const w = minutes(5);
    for (let i = 0; i < 4; i++) await store.save('slot-3', 'same', w);
    // steppingClock changes savedAt only in meta, but the data (and checksum) is identical
    expect(await rec(raw, backupKey('slot-3', 2))).toBeUndefined();
  });

  it('keeps autosave history too and deleting a slot removes its backups', async () => {
    const { store, raw } = await env();
    for (const m of [1, 2, 3, 4]) await store.autosave(minutes(m));
    expect(await rec(raw, backupKey('autosave', 3))).toBeDefined();
    await store.save('slot-4', 'x', minutes(1)); await store.save('slot-4', 'x', minutes(2));
    expect(await rec(raw, backupKey('slot-4', 1))).toBeDefined();
    expect((await store.remove('slot-4')).ok).toBe(true);
    expect(await rec(raw, backupKey('slot-4', 1))).toBeUndefined();
  });
});

describe('recovery on load', () => {
  async function twoSaves() {
    const e = await env();
    await e.store.save('slot-1', 'Home', minutes(100));
    await e.store.save('slot-1', 'Home', minutes(200)); // slot = 200, #1 = 100
    return e;
  }

  it('corrupted JSON: loads the newest good backup and says so', async () => {
    const { store, raw } = await twoSaves();
    const cur = (await rec(raw, 'slot-1'))!;
    const bad = '{ "schemaVersion": 1, oops';
    await raw.put('saves', 'slot-1', { ...cur, data: bad, checksum: checksum(bad) });
    const r = await store.load('slot-1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.clock.minutes).toBe(100);
    expect(r.recovered).toMatchObject({ from: 'slot-1#1' });
    expect(r.recovered!.message).toMatch(/Slot 1 was damaged.*backup.*loaded instead/);
    expect(r.meta.slotId).toBe('slot-1');
  });

  it('wrong checksum (cut-short data): falls back', async () => {
    const { store, raw } = await twoSaves();
    const cur = (await rec(raw, 'slot-1'))!;
    await raw.put('saves', 'slot-1', { ...cur, data: cur.data.slice(0, 40) });
    const r = await store.load('slot-1');
    expect(r.ok && r.state.clock.minutes).toBe(100);
    expect(r.ok && r.recovered?.from).toBe('slot-1#1');
  });

  it('missing fields: valid JSON without the world pieces falls back', async () => {
    const { store, raw } = await twoSaves();
    const cur = (await rec(raw, 'slot-1'))!;
    const stripped = JSON.stringify({ ...JSON.parse(cur.data), lots: undefined, households: undefined });
    await raw.put('saves', 'slot-1', { ...cur, data: stripped, checksum: checksum(stripped) });
    const r = await store.load('slot-1');
    expect(r.ok && r.state.clock.minutes).toBe(100);
  });

  it('skips a damaged first backup and uses the next good one', async () => {
    const { store, raw } = await twoSaves();
    await store.save('slot-1', 'Home', minutes(300)); // slot 300, #1 200, #2 100
    const cur = (await rec(raw, 'slot-1'))!;
    const b1 = (await rec(raw, backupKey('slot-1', 1)))!;
    await raw.put('saves', 'slot-1', { ...cur, data: 'garbage' });
    await raw.put('saves', backupKey('slot-1', 1), { ...b1, data: 'garbage' });
    const r = await store.load('slot-1');
    expect(r.ok && r.state.clock.minutes).toBe(100);
    expect(r.ok && r.recovered?.from).toBe('slot-1#2');
  });

  it('a damaged autosave falls back to its history, and reports an error when nothing good is left', async () => {
    const { store, raw } = await env();
    await store.autosave(minutes(10)); await store.autosave(minutes(20));
    const cur = (await rec(raw, 'autosave'))!;
    await raw.put('saves', 'autosave', { ...cur, data: 'x' });
    expect(await minutesOf(store, 'autosave')).toBe(10);
    // damage every copy
    for (const k of ['autosave#1', 'backup']) { const r = await rec(raw, k); if (r) await raw.put('saves', k, { ...r, data: 'x' }); }
    const none = await store.load('autosave');
    expect(none).toMatchObject({ ok: false, code: 'damaged' });
  });

  it('does not touch storage when recovering, and an intact slot is not flagged', async () => {
    const { store, raw } = await twoSaves();
    const ok = await store.load('slot-1');
    expect(ok.ok && ok.recovered).toBeUndefined();
    const cur = (await rec(raw, 'slot-1'))!;
    await raw.put('saves', 'slot-1', { ...cur, data: 'x' });
    await store.load('slot-1');
    expect((await rec(raw, 'slot-1'))!.data).toBe('x');
    expect(await minutesOf(store, 'slot-1', false)).toMatchObject({ ok: false });
  });

  it('a newer-version save is not "recovered" over', async () => {
    const { store, raw } = await twoSaves();
    const cur = (await rec(raw, 'slot-1'))!;
    const newer = JSON.stringify({ ...JSON.parse(cur.data), schemaVersion: 999 });
    await raw.put('saves', 'slot-1', { ...cur, data: newer, checksum: checksum(newer) });
    expect(await store.load('slot-1')).toMatchObject({ ok: false, code: 'newer' });
  });
});

describe('failing saves never displace the last good copies', () => {
  it('a state that fails verification writes nothing, backups included', async () => {
    const { store, raw } = await env();
    await store.save('slot-1', 'x', minutes(1)); await store.save('slot-1', 'x', minutes(2));
    const bad = makeWorld(); (bad.clock as { minutes: number }).minutes = Number.NaN;
    expect((await store.save('slot-1', 'x', bad)).ok).toBe(false);
    expect(await minutesOf(store, 'slot-1')).toBe(2);
    expect(JSON.parse((await rec(raw, backupKey('slot-1', 1)))!.data).clock.minutes).toBe(1);
  });

  it('a damaged current record is not pushed into the chain by the next save', async () => {
    const { store, raw } = await env();
    await store.save('slot-1', 'x', minutes(1)); await store.save('slot-1', 'x', minutes(2));
    const cur = (await rec(raw, 'slot-1'))!;
    await raw.put('saves', 'slot-1', { ...cur, data: 'broken' });
    await store.save('slot-1', 'x', minutes(3));
    expect(JSON.parse((await rec(raw, backupKey('slot-1', 1)))!.data).clock.minutes).toBe(1); // still the last good one
  });

  it('quota exceeded: a clear message, nothing half-written, previous save intact', async () => {
    const { store, factory } = await env();
    await store.save('slot-1', 'x', minutes(1));
    const inner = await openHearthDb({ factory });
    if (!inner.ok) throw new Error(inner.error);
    opened.push(inner.value);
    const innerDb = inner.value;
    let full = true;
    class FullDb extends HearthDb {
      constructor() { super(null as never); }
      override transaction<T>(stores: readonly StoreName[], mode: IDBTransactionMode, work: (tx: Tx) => Promise<T>, action?: string): Promise<DbResult<T>> {
        return innerDb.transaction(stores, mode, (tx) => work({
          ...tx,
          put: async (store, key, value) => {
            if (full && mode === 'readwrite') throw Object.assign(new Error('disk full'), { name: 'QuotaExceededError' });
            return tx.put(store, key, value);
          },
        }), action);
      }
    }
    const tight = await SaveStore.open('hearthside', { db: new FullDb(), clock: steppingClock(), content: makeContent() });
    const manual = await tight.save('slot-1', 'x', minutes(2));
    expect(manual).toMatchObject({ ok: false, error: expect.stringMatching(/Not saved\. There is not enough storage space/) });
    const auto = await tight.autosave(minutes(3));
    expect(auto).toMatchObject({ ok: false, error: expect.stringMatching(/Autosave failed\. There is not enough storage space/) });
    expect(await minutesOf(store, 'slot-1')).toBe(1);
    full = false;
    expect((await tight.save('slot-1', 'x', minutes(4))).ok).toBe(true); // works again once space is back
    expect(dbFailure('quota', 'x').code).toBe('quota');
  });
});
