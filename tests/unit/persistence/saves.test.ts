import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { WorldState } from '../../../src/core/types';
import { HearthDb, openHearthDb, type DbResult, type StoreName, type Tx } from '../../../src/persistence/db';
import { checksum } from '../../../src/persistence/json';
import { SaveStore } from '../../../src/persistence/saves';
import { SLOT_IDS, type SlotId } from '../../../src/persistence/types';
import { makeContent, makeWorld, newFactory, snapshot, steppingClock } from './fixtures';

const opened: Array<{ close(): void }> = [];
afterEach(() => { while (opened.length) opened.pop()?.close(); });

interface Env { store: SaveStore; factory: IDBFactory; raw: HearthDb }

/** A store on its own isolated database plus a second raw connection for tampering with stored data. */
async function env(): Promise<Env> {
  const factory = newFactory();
  const store = await SaveStore.open('hearthside', { factory, clock: steppingClock(), content: makeContent() });
  const rawOpen = await openHearthDb({ factory });
  if (!rawOpen.ok) throw new Error(rawOpen.error);
  opened.push(store, rawOpen.value);
  return { store, factory, raw: rawOpen.value };
}

describe('SaveStore: slots', () => {
  it('lists all seven slots, empty ones included, in display order', async () => {
    const { store } = await env();
    const list = await store.list();
    expect(list.map((m) => m.slotId)).toEqual(['slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5', 'autosave', 'backup']);
    expect(list.every((m) => m.empty)).toBe(true);
    expect(list.map((m) => m.kind)).toEqual(['manual', 'manual', 'manual', 'manual', 'manual', 'autosave', 'backup']);
    expect(list[0]).toMatchObject({ name: 'Slot 1', savedAt: '', gameMinutes: 0, householdName: '', funds: 0, empty: true });
  });

  it('round trips the world exactly and fills the metadata from the injected clock', async () => {
    const { store } = await env();
    const world = makeWorld();
    const before = snapshot(world);
    const saved = await store.save('slot-2', 'Before the move', world);
    expect(saved).toMatchObject({ ok: true, meta: { slotId: 'slot-2', name: 'Before the move', savedAt: '2030-01-01T12:00:00.000Z', kind: 'manual', empty: false } });

    const loaded = await store.load('slot-2');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state).toEqual(before);
    expect(loaded.state).not.toBe(world);
    expect(loaded.report).toEqual({ missing: [], warnings: [], migratedFrom: null });
    expect(loaded.meta.name).toBe('Before the move');

    const list = await store.list();
    expect(list[1]).toEqual({
      slotId: 'slot-2', name: 'Before the move', savedAt: '2030-01-01T12:00:00.000Z', gameMinutes: 1234.25,
      householdName: 'The Finches', funds: 250000, schemaVersion: 1, kind: 'manual', empty: false,
    });
    expect(list.filter((m) => !m.empty)).toHaveLength(1);
  });

  it('fills all five manual slots independently', async () => {
    const { store } = await env();
    const world = makeWorld();
    for (let i = 1; i <= 5; i++) {
      world.clock.minutes = 1000 + i;
      expect((await store.save(`slot-${i}` as SlotId, `Save ${i}`, world)).ok).toBe(true);
    }
    const list = await store.list();
    expect(list.slice(0, 5).map((m) => [m.name, m.gameMinutes, m.empty])).toEqual([
      ['Save 1', 1001, false], ['Save 2', 1002, false], ['Save 3', 1003, false], ['Save 4', 1004, false], ['Save 5', 1005, false],
    ]);
    expect(list[5]!.empty && list[6]!.empty).toBe(true);
    const third = await store.load('slot-3');
    expect(third.ok && third.state.clock.minutes).toBe(1003);
  });

  it('overwrites a slot and cleans up the name', async () => {
    const { store } = await env();
    const world = makeWorld();
    await store.save('slot-1', 'first', world);
    world.clock.minutes = 2000;
    const r = await store.save('slot-1', '  Second   try \n', world);
    expect(r).toMatchObject({ ok: true, meta: { name: 'Second try' } });
    const loaded = await store.load('slot-1');
    expect(loaded.ok && loaded.state.clock.minutes).toBe(2000);
    expect((await store.save('slot-1', '   ', world))).toMatchObject({ ok: true, meta: { name: 'Slot 1' } });
    expect((await store.save('slot-1', 'x'.repeat(200), world))).toMatchObject({ ok: true, meta: { name: 'x'.repeat(60) } });
  });

  it('captures the state at call time, not at write time', async () => {
    const { store } = await env();
    const world = makeWorld();
    const before = snapshot(world);
    const pending = store.save('slot-1', 'moment', world);
    world.clock.minutes = 99999; // the simulation keeps running while the write is in flight
    world.households[world.activeHouseholdId]!.funds = 1;
    await pending;
    const loaded = await store.load('slot-1');
    expect(loaded.ok && loaded.state).toEqual(before);
  });

  it('removes and renames slots', async () => {
    const { store } = await env();
    const world = makeWorld();
    await store.save('slot-4', 'Keep me', world);
    expect(await store.rename('slot-4', 'Renamed')).toEqual({ ok: true });
    expect((await store.list())[3]).toMatchObject({ name: 'Renamed', empty: false });
    const loaded = await store.load('slot-4');
    expect(loaded.ok && loaded.state).toEqual(world);
    expect(await store.rename('slot-5', 'Nope')).toMatchObject({ ok: false, error: expect.stringContaining('empty') });
    expect(await store.rename('autosave', 'Nope')).toMatchObject({ ok: false });
    expect(await store.remove('slot-4')).toEqual({ ok: true });
    expect((await store.list())[3]!.empty).toBe(true);
    expect(await store.remove('slot-4')).toEqual({ ok: true });
    expect(await store.load('slot-4')).toMatchObject({ ok: false, code: 'empty', error: 'Slot 4 is empty.' });
  });

  it('refuses unknown slots and the automatic slots for manual saves', async () => {
    const { store } = await env();
    const world = makeWorld();
    expect(await store.save('autosave', 'x', world)).toMatchObject({ ok: false, error: expect.stringContaining('not a manual save slot') });
    expect(await store.save('slot-9' as SlotId, 'x', world)).toMatchObject({ ok: false });
    expect(await store.load('slot-9' as SlotId)).toMatchObject({ ok: false, code: 'invalid' });
    expect(await store.remove('slot-9' as SlotId)).toMatchObject({ ok: false });
  });

  it('reports the latest save', async () => {
    const { store } = await env();
    const world = makeWorld();
    expect(await store.latest()).toBeNull();
    await store.save('slot-3', 'older', world);
    await store.save('slot-1', 'newer', world);
    expect((await store.latest())?.slotId).toBe('slot-1');
    await store.autosave(world);
    expect((await store.latest())?.slotId).toBe('autosave');
  });

  it('works on the browser-global indexedDB by default', async () => {
    const store = await SaveStore.open(`default-global-${Math.random()}`, { content: makeContent() });
    opened.push(store);
    expect(store.available).toBe(true);
    expect((await store.save('slot-1', 'global', makeWorld())).ok).toBe(true);
    expect((await store.load('slot-1')).ok).toBe(true);
  });
});

describe('SaveStore: refusing to write a bad state', () => {
  it('does not write a state that is not plain JSON and leaves the previous save untouched', async () => {
    const { store } = await env();
    const world = makeWorld();
    await store.save('slot-1', 'good', world);

    const nan = makeWorld();
    nan.households[nan.activeHouseholdId]!.funds = Number.NaN;
    expect(await store.save('slot-1', 'bad', nan)).toMatchObject({ ok: false, error: expect.stringContaining('funds is NaN') });

    const withMap = makeWorld() as WorldState & { extra?: unknown };
    withMap.extra = new Map();
    expect(await store.save('slot-1', 'bad', withMap)).toMatchObject({ ok: false, error: expect.stringContaining('Map') });

    const loaded = await store.load('slot-1');
    expect(loaded.ok && loaded.state).toEqual(world);
    expect((await store.list())[0]!.name).toBe('good');
  });

  it('does not write a structurally broken state', async () => {
    const { store } = await env();
    await store.save('slot-1', 'good', makeWorld());
    const broken = makeWorld();
    broken.activeLotId = 'lot_ghost';
    const r = await store.save('slot-1', 'bad', broken);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('inconsistent') });
    expect((await store.list())[0]!.name).toBe('good');
    expect((await store.autosave(broken)).ok).toBe(false);
    expect((await store.list())[5]!.empty).toBe(true);
  });
});

describe('SaveStore: autosave and backup', () => {
  it('rotates the previous autosave into the backup', async () => {
    const { store } = await env();
    const a = makeWorld(); a.clock.minutes = 1000;
    const b = makeWorld(); b.clock.minutes = 2000;
    const c = makeWorld(); c.clock.minutes = 3000;

    const first = await store.autosave(a);
    expect(first).toMatchObject({ ok: true, rotatedBackup: false, meta: { slotId: 'autosave', name: 'Autosave', kind: 'autosave' } });
    expect((await store.list())[6]!.empty).toBe(true);

    expect(await store.autosave(b)).toMatchObject({ ok: true, rotatedBackup: true });
    expect(await store.autosave(c)).toMatchObject({ ok: true, rotatedBackup: true });

    const auto = await store.load('autosave');
    const backup = await store.load('backup');
    expect(auto.ok && auto.state.clock.minutes).toBe(3000);
    expect(backup.ok && backup.state.clock.minutes).toBe(2000);
    expect(backup.ok && backup.meta).toMatchObject({ slotId: 'backup', kind: 'backup', name: 'Backup' });
    // The backup keeps the time the copied autosave was written.
    expect((await store.list())[6]!.savedAt).toBe('2030-01-01T12:01:00.000Z');
  });

  it('loads the backup when the autosave is corrupted, with a clear error for the autosave', async () => {
    const { store, raw } = await env();
    const a = makeWorld(); a.clock.minutes = 1000;
    const b = makeWorld(); b.clock.minutes = 2000;
    await store.autosave(a);
    await store.autosave(b);

    const stored = (await raw.get<{ meta: unknown; data: string; checksum: string }>('saves', 'autosave')) as { ok: true; value: { meta: unknown; data: string; checksum: string } };
    await raw.put('saves', 'autosave', { ...stored.value, data: stored.value.data.slice(0, stored.value.data.length >> 1) }); // cut short

    const bad = await store.load('autosave', undefined, { recover: false });
    expect(bad).toMatchObject({ ok: false, code: 'damaged' });
    if (!bad.ok) expect(bad.error).toMatch(/The autosave is damaged.*checksum.*backup slot/);
    expect((await store.list())[5]!.problem).toMatch(/damaged/);

    const good = await store.load('backup');
    expect(good.ok && good.state.clock.minutes).toBe(1000);
  });

  it('does not let a damaged autosave replace the last good backup', async () => {
    const { store, raw } = await env();
    const a = makeWorld(); a.clock.minutes = 1000;
    const b = makeWorld(); b.clock.minutes = 2000;
    const c = makeWorld(); c.clock.minutes = 3000;
    await store.autosave(a);
    await store.autosave(b); // backup = a
    await raw.put('saves', 'autosave', { meta: { name: 'x' }, data: '{ not json', checksum: checksum('{ not json') });

    expect(await store.autosave(c)).toMatchObject({ ok: true, rotatedBackup: false });
    const backup = await store.load('backup');
    const auto = await store.load('autosave');
    expect(backup.ok && backup.state.clock.minutes).toBe(1000);
    expect(auto.ok && auto.state.clock.minutes).toBe(3000);
  });

  it('does not copy a structurally invalid autosave into the backup either', async () => {
    const { store, raw } = await env();
    const a = makeWorld(); a.clock.minutes = 1000;
    await store.autosave(a);
    const invalid = JSON.stringify({ ...makeWorld(), activeLotId: 'lot_ghost' });
    const prev = (await raw.get<{ meta: unknown }>('saves', 'autosave')) as { ok: true; value: { meta: unknown } };
    await raw.put('saves', 'autosave', { meta: prev.value.meta, data: invalid, checksum: checksum(invalid) });
    expect(await store.autosave(makeWorld())).toMatchObject({ ok: true, rotatedBackup: false });
    expect((await store.list())[6]!.empty).toBe(true);
  });

  it('writes the autosave and the backup in one transaction: a failure half way changes nothing', async () => {
    const { store, factory } = await env();
    const a = makeWorld(); a.clock.minutes = 1000;
    const b = makeWorld(); b.clock.minutes = 2000;
    const c = makeWorld(); c.clock.minutes = 3000;
    await store.autosave(a);
    await store.autosave(b); // autosave = b, backup = a

    // The same database through a connection whose autosave write fails after the backup write succeeded.
    const inner = await openHearthDb({ factory });
    if (!inner.ok) throw new Error(inner.error);
    const innerDb = inner.value;
    opened.push(innerDb);
    let failNow = false;
    class FlakyDb extends HearthDb {
      constructor() { super(null as never); }
      override transaction<T>(stores: readonly StoreName[], mode: IDBTransactionMode, work: (tx: Tx) => Promise<T>, action?: string): Promise<DbResult<T>> {
        return innerDb.transaction(stores, mode, (tx) => work({
          ...tx,
          put: async (store, key, value) => {
            if (failNow && key === 'autosave') throw new Error('simulated crash');
            return tx.put(store, key, value);
          },
        }), action);
      }
    }
    const flaky = await SaveStore.open('hearthside', { db: new FlakyDb(), clock: steppingClock(), content: makeContent() });
    failNow = true;
    const failed = await flaky.autosave(c);
    expect(failed).toMatchObject({ ok: false, error: expect.stringContaining('simulated crash') });

    const auto = await store.load('autosave');
    const backup = await store.load('backup');
    expect(auto.ok && auto.state.clock.minutes).toBe(2000);
    expect(backup.ok && backup.state.clock.minutes).toBe(1000); // not overwritten by the half-finished rotation
  });
});

describe('SaveStore: damaged, newer and migrated data', () => {
  async function plant(raw: HearthDb, slot: SlotId, data: unknown, extra: Record<string, unknown> = {}): Promise<void> {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    await raw.put('saves', slot, { meta: { name: 'Planted', savedAt: '2030-01-01T00:00:00.000Z', gameMinutes: 1, householdName: 'H', funds: 5, schemaVersion: 1 }, data: text, checksum: checksum(text), ...extra });
  }

  it('rejects a save from a newer version with a clear message and keeps it stored', async () => {
    const { store, raw } = await env();
    await plant(raw, 'slot-1', { ...makeWorld(), schemaVersion: 2 });
    const r = await store.load('slot-1');
    expect(r).toMatchObject({ ok: false, code: 'newer' });
    if (!r.ok) expect(r.error).toMatch(/newer version of Hearthside Life/);
    expect((await store.list())[0]!.empty).toBe(false);
  });

  it('explains unreadable JSON, a failed checksum and a missing record body', async () => {
    const { store, raw } = await env();
    await plant(raw, 'slot-1', '{ nope');
    await plant(raw, 'slot-2', JSON.stringify(makeWorld()), { checksum: 'wrong' });
    await raw.put('saves', 'slot-3', 'just a string');
    await raw.put('saves', 'slot-4', { meta: { name: 'x' } });
    const errors = await Promise.all((['slot-1', 'slot-2', 'slot-3', 'slot-4'] as SlotId[]).map((s) => store.load(s)));
    expect(errors.map((e) => !e.ok && e.code)).toEqual(['damaged', 'damaged', 'damaged', 'damaged']);
    expect(errors.map((e) => !e.ok && e.error)).toEqual([
      expect.stringContaining('Slot 1 is damaged: its contents are not readable JSON'),
      expect.stringContaining('Slot 2 is damaged: its contents do not match the stored checksum'),
      expect.stringContaining('Slot 3 is damaged: the stored entry is not a save record'),
      expect.stringContaining('Slot 4 is damaged: it holds no world data'),
    ]);
    const list = await store.list();
    expect(list[1]).toMatchObject({ empty: false, problem: expect.stringContaining('checksum') });
    expect(list[2]).toMatchObject({ empty: false, name: 'Slot 3 (damaged)', problem: expect.any(String) });
  });

  it('refuses structurally broken data on load and says what is wrong', async () => {
    const { store, raw } = await env();
    await plant(raw, 'slot-1', { ...makeWorld(), activeHouseholdId: 'hh_ghost' });
    const r = await store.load('slot-1');
    expect(r).toMatchObject({ ok: false, code: 'damaged' });
    if (!r.ok) expect(r.error).toMatch(/Slot 1 is damaged: activeHouseholdId "hh_ghost"/);
  });

  it('keeps unknown content ids in the loaded state and reports them; loading with the content restores them', async () => {
    const { store } = await env();
    const world = makeWorld();
    const lot = world.lots[world.activeLotId]!;
    const sofa = Object.values(lot.objects).find((o) => o.defId === 'sofa-tweed')!;
    sofa.defId = 'sofa-from-a-pack';
    const missingContent = makeContent();
    const fullContent = { ...makeContent(), objects: { ...makeContent().objects, 'sofa-from-a-pack': { id: 'sofa-from-a-pack' } as never } };

    await store.save('slot-1', 'modded', world);
    const without = await store.load('slot-1', missingContent);
    expect(without.ok).toBe(true);
    if (!without.ok) return;
    expect(without.report.missing).toEqual([{ kind: 'object', id: 'sofa-from-a-pack', count: 1, where: [`lots.${world.activeLotId}.objects.${sofa.id}`] }]);
    expect(without.state).toEqual(world); // nothing deleted or replaced
    expect(without.state.lots[world.activeLotId]!.objects[sofa.id]!.defId).toBe('sofa-from-a-pack');

    const withContent = await store.load('slot-1', fullContent);
    expect(withContent.ok && withContent.report.missing).toEqual([]);
  });

  it('keeps unknown ids through a save of a loaded world (reversible)', async () => {
    const { store } = await env();
    const world = makeWorld();
    Object.values(world.lots[world.activeLotId]!.objects)[0]!.defId = 'lost-piece';
    await store.save('slot-1', 'one', world);
    const first = await store.load('slot-1');
    if (!first.ok) throw new Error(first.error);
    await store.save('slot-2', 'two', first.state);
    const second = await store.load('slot-2');
    expect(second.ok && second.state).toEqual(world);
    expect(second.ok && second.report.missing.map((m) => m.id)).toEqual(['lost-piece']);
  });
});

describe('SaveStore: storage unavailable', () => {
  it('returns clear errors instead of throwing', async () => {
    const store = await SaveStore.open('hearthside', { factory: null, content: makeContent() });
    expect(store.available).toBe(false);
    expect(store.unavailableReason).toMatch(/IndexedDB/);
    const world = makeWorld();
    const list = await store.list();
    expect(list.map((m) => m.slotId)).toEqual([...SLOT_IDS]);
    expect(list.every((m) => m.empty && m.problem?.includes('IndexedDB'))).toBe(true);
    expect(await store.save('slot-1', 'x', world)).toMatchObject({ ok: false, error: expect.stringContaining('IndexedDB') });
    expect(await store.autosave(world)).toMatchObject({ ok: false, error: expect.stringContaining('IndexedDB') });
    expect(await store.load('slot-1')).toMatchObject({ ok: false, code: 'unavailable' });
    expect(await store.remove('slot-1')).toMatchObject({ ok: false });
    expect(await store.rename('slot-1', 'x')).toMatchObject({ ok: false });
    expect(await store.latest()).toBeNull();
    store.close();
  });
});

describe('SaveStore: importToSlot', () => {
  it('imports a valid export into a slot', async () => {
    const { store } = await env();
    const { exportWorld } = await import('../../../src/persistence/exportImport');
    const world = makeWorld();
    const r = await store.importToSlot('slot-5', 'Imported', exportWorld(world, '2030-02-02T00:00:00.000Z'));
    expect(r).toMatchObject({ ok: true, meta: { slotId: 'slot-5', name: 'Imported' } });
    const loaded = await store.load('slot-5');
    expect(loaded.ok && loaded.state).toEqual(world);
  });

  it('never touches stored saves when the import fails', async () => {
    const { store } = await env();
    const world = makeWorld();
    await store.save('slot-5', 'Precious', world);
    await store.autosave(world);
    const before = await store.list();

    for (const bad of ['not json at all', '{"format":"other"}', JSON.stringify({ format: 'hearthside-world', schemaVersion: 99, world: {} })]) {
      const r = await store.importToSlot('slot-5', 'Overwrite', bad);
      expect(r.ok).toBe(false);
    }
    expect(await store.list()).toEqual(before);
    const loaded = await store.load('slot-5');
    expect(loaded.ok && loaded.state).toEqual(world);
  });
});
