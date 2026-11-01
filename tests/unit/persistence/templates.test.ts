import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Appearance } from '../../../src/core/types';
import type { HouseholdDraft } from '../../../src/core/drafts';
import {
  TEMPLATE_FORMAT, TEMPLATE_SCHEMA_VERSION, TemplateStore, exportTemplate, importTemplate, validateTemplateData,
} from '../../../src/persistence/templates';
import { makeAppearance, makeContent, makeHouseholdDraft, newFactory, steppingClock } from './fixtures';

const AT = '2031-05-06T07:08:09.000Z';
const opened: Array<{ close(): void }> = [];
afterEach(() => { while (opened.length) opened.pop()?.close(); });

async function store(): Promise<TemplateStore> {
  const s = await TemplateStore.open('hearthside', { factory: newFactory(), clock: steppingClock() });
  opened.push(s);
  return s;
}

describe('TemplateStore', () => {
  it('round trips an appearance preset and a household template', async () => {
    const s = await store();
    const look = makeAppearance();
    const family = makeHouseholdDraft();
    const a = await s.save('appearance', 'Weekend look', look);
    const h = await s.save('household', 'The Finches', family);
    expect(a.ok && h.ok).toBe(true);
    if (!a.ok || !h.ok) return;
    expect(a.template).toMatchObject({ id: 'tpl_1', kind: 'appearance', name: 'Weekend look', savedAt: '2030-01-01T12:00:00.000Z' });
    expect(h.template.id).toBe('tpl_2');

    const fetched = await s.get(a.template.id);
    expect(fetched?.data).toEqual(look);
    const all = await s.list();
    expect(all.map((t) => t.name)).toEqual(['The Finches', 'Weekend look']);
    expect((await s.list('appearance')).map((t) => t.name)).toEqual(['Weekend look']);
    expect((await s.list('household'))[0]?.data).toEqual(family);
  });

  it('stores a copy: changing the original afterwards does not change the template', async () => {
    const s = await store();
    const look = makeAppearance();
    const saved = await s.save('appearance', 'Look', look);
    look.hair.styleId = 'changed';
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.template.data.hair.styleId).toBe('short-crop');
    expect((await s.get(saved.template.id))?.data).toMatchObject({ hair: { styleId: 'short-crop' } });
  });

  it('replaces a template when saved again with its id, and renames and removes', async () => {
    const s = await store();
    const first = await s.save('appearance', 'Look', makeAppearance());
    if (!first.ok) throw new Error(first.error);
    const second = await s.save('appearance', 'Look v2', makeAppearance({ hairStyle: 'long-wave' }), first.template.id);
    expect(second.ok && second.template.id).toBe(first.template.id);
    expect(await s.list()).toHaveLength(1);
    expect((await s.get(first.template.id))?.name).toBe('Look v2');

    expect(await s.rename(first.template.id, '  Final   look ')).toEqual({ ok: true });
    expect((await s.get(first.template.id))?.name).toBe('Final look');
    expect(await s.rename('tpl_zzz', 'x')).toMatchObject({ ok: false });

    expect(await s.remove(first.template.id)).toEqual({ ok: true });
    expect(await s.list()).toEqual([]);
    expect(await s.get(first.template.id)).toBeNull();
  });

  it('never reuses an id, even after removal', async () => {
    const s = await store();
    const a = await s.save('appearance', 'A', makeAppearance());
    if (!a.ok) throw new Error(a.error);
    await s.remove(a.template.id);
    const b = await s.save('appearance', 'B', makeAppearance());
    expect(b.ok && b.template.id).toBe('tpl_2');
  });

  it('rejects drafts that do not fit, with a clear message, and stores nothing', async () => {
    const s = await store();
    const badLook = { ...makeAppearance(), frame: 'q' } as unknown as Appearance;
    expect(await s.save('appearance', 'Bad', badLook)).toMatchObject({ ok: false, error: expect.stringContaining('appearance.frame') });
    const family = makeHouseholdDraft();
    family.ties.push({ a: 0, b: 9, tie: 'sibling' });
    expect(await s.save('household', 'Bad', family)).toMatchObject({ ok: false, error: expect.stringContaining('ties[1].b') });
    const empty: HouseholdDraft = { name: 'Empty', members: [], ties: [] };
    expect(await s.save('household', 'Bad', empty)).toMatchObject({ ok: false, error: expect.stringContaining('1 to 8 people') });
    expect(await s.save('portrait' as 'appearance', 'Bad', makeAppearance())).toMatchObject({ ok: false });
    expect(await s.list()).toEqual([]);
  });

  it('reports unavailable storage with a clear error', async () => {
    const s = await TemplateStore.open('hearthside', { factory: null });
    expect(s.available).toBe(false);
    expect(await s.save('appearance', 'x', makeAppearance())).toMatchObject({ ok: false, error: expect.stringContaining('IndexedDB') });
    expect(await s.list()).toEqual([]);
    expect(await s.remove('tpl_1')).toMatchObject({ ok: false });
    expect(await s.exportTemplate('tpl_1', AT)).toMatchObject({ ok: false });
  });

  it('shares the database with the save store without interfering', async () => {
    const factory = newFactory();
    const { SaveStore } = await import('../../../src/persistence/saves');
    const { makeWorld } = await import('./fixtures');
    const saves = await SaveStore.open('hearthside', { factory, content: makeContent() });
    const templates = await TemplateStore.open('hearthside', { factory });
    opened.push(saves, templates);
    await saves.save('slot-1', 'World', makeWorld());
    await templates.save('appearance', 'Look', makeAppearance());
    expect((await saves.list()).filter((m) => !m.empty)).toHaveLength(1);
    expect(await templates.list()).toHaveLength(1);
    expect((await saves.load('slot-1')).ok).toBe(true);
  });
});

describe('template export and import', () => {
  it('exports versioned JSON and imports it back through a store', async () => {
    const s = await store();
    const family = makeHouseholdDraft();
    const saved = await s.save('household', 'The Finches', family);
    if (!saved.ok) throw new Error(saved.error);
    const exported = await s.exportTemplate(saved.template.id, AT);
    if (!exported.ok) throw new Error(exported.error);
    expect(JSON.parse(exported.json)).toMatchObject({
      format: TEMPLATE_FORMAT, schemaVersion: TEMPLATE_SCHEMA_VERSION, kind: 'household', name: 'The Finches', exportedAt: AT, packs: [], data: family,
    });

    const other = await store();
    const imported = await other.importTemplate(exported.json, makeContent());
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.missing).toEqual([]);
    expect(imported.template).toMatchObject({ kind: 'household', name: 'The Finches', data: family });
    expect((await other.list('household'))).toHaveLength(1);
  });

  it('round trips an appearance file without a store', () => {
    const look = makeAppearance();
    const r = importTemplate(exportTemplate({ kind: 'appearance', name: 'Look', data: look }, AT), makeContent());
    expect(r).toEqual({ ok: true, kind: 'appearance', name: 'Look', data: look, missing: [], warnings: [] });
  });

  it('rejects files that are not templates, are newer, or are damaged', () => {
    const c = makeContent();
    const errs = (text: string): string[] => { const r = importTemplate(text, c); return r.ok ? [] : r.errors; };
    expect(errs('nope')).toEqual([expect.stringContaining('not valid JSON')]);
    expect(errs('{"format":"hearthside-world"}')).toEqual([expect.stringContaining('format "hearthside-world", expected "hearthside-template"')]);
    expect(errs('7')).toEqual([expect.stringContaining('not a Hearthside Life template')]);
    const base = { format: TEMPLATE_FORMAT, schemaVersion: 1, kind: 'appearance', name: 'x', exportedAt: AT, packs: [], data: makeAppearance() };
    expect(errs(JSON.stringify({ ...base, schemaVersion: 2 }))).toEqual([expect.stringMatching(/newer version of Hearthside Life.*Update the game/)]);
    expect(errs(JSON.stringify({ ...base, schemaVersion: undefined }))).toEqual([expect.stringContaining('no valid schemaVersion')]);
    expect(errs(JSON.stringify({ ...base, kind: 'furniture' }))).toEqual([expect.stringContaining('unknown kind "furniture"')]);
    const damaged = errs(JSON.stringify({ ...base, data: { ...makeAppearance(), skin: 'blue' } }));
    expect(damaged[0]).toMatch(/damaged and was not imported/);
    expect(damaged).toContainEqual(expect.stringContaining('appearance.skin'));
    expect(errs(JSON.stringify({ ...base, kind: 'household' }))).not.toEqual([]); // an appearance is not a household
  });

  it('keeps templates that use missing content and reports what is missing', async () => {
    const s = await store();
    const family = makeHouseholdDraft();
    family.members[0]!.appearance.hair.styleId = 'pack-only-hair';
    family.members[1]!.traits = ['neat', 'pack-only-trait'];
    family.members[1]!.outfits.outfits.everyday[0]!.layers.top!.garmentId = 'pack-only-shirt';
    const file = exportTemplate({ kind: 'household', name: 'Pack family', data: family }, AT, ['retro-pack']);

    const r = await s.importTemplate(file, makeContent());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.missing.map((m) => `${m.kind}:${m.id}`).sort()).toEqual(['garment:pack-only-shirt', 'hair:pack-only-hair', 'trait:pack-only-trait']);
    expect(r.warnings).toEqual([expect.stringContaining('content pack "retro-pack"')]);
    // The template is stored with the unknown ids still in it, so it works once the pack is available.
    const stored = await s.get(r.template.id);
    expect(stored?.data).toEqual(family);
  });

  it('a failed import stores nothing', async () => {
    const s = await store();
    expect((await s.importTemplate('{{{', makeContent())).ok).toBe(false);
    expect(await s.list()).toEqual([]);
  });

  it('validateTemplateData lists shape problems with paths', () => {
    expect(validateTemplateData('appearance', makeAppearance())).toEqual([]);
    expect(validateTemplateData('household', makeHouseholdDraft())).toEqual([]);
    expect(validateTemplateData('appearance', null)).toEqual(['appearance must be an object']);
    const bad = makeHouseholdDraft();
    (bad.members[0] as unknown as { traits: unknown }).traits = 'neat';
    expect(validateTemplateData('household', bad)).toEqual(['household.members[0].traits must be a list of text']);
  });
});
