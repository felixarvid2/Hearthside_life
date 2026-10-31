import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../../../src/core/types';
import { WORLD_FORMAT, exportWorld, importWorld } from '../../../src/persistence/exportImport';
import { makeContent, makeWorld, snapshot } from './fixtures';

const AT = '2031-05-06T07:08:09.000Z';

describe('exportWorld', () => {
  it('writes the header and the world', () => {
    const world = makeWorld();
    const file = JSON.parse(exportWorld(world, AT)) as Record<string, unknown>;
    expect(file).toMatchObject({ format: 'hearthside-world', schemaVersion: SCHEMA_VERSION, exportedAt: AT, packs: [] });
    expect(file.world).toEqual(world);
    expect(WORLD_FORMAT).toBe('hearthside-world');
  });

  it('does not read the clock: the timestamp comes from the caller', () => {
    const world = makeWorld();
    expect(exportWorld(world, AT)).toBe(exportWorld(world, AT));
    expect(exportWorld(world, 'x', ['pack-a'])).toContain('"packs":["pack-a"]');
  });
});

describe('importWorld', () => {
  it('round trips a world exactly', () => {
    const world = makeWorld();
    const before = snapshot(world);
    const r = importWorld(exportWorld(world, AT), makeContent());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state).toEqual(before);
      expect(r.report).toEqual({ missing: [], warnings: [], migratedFrom: null });
      expect(r.exportedAt).toBe(AT);
    }
  });

  function errorsFor(text: string): string[] {
    const r = importWorld(text, makeContent());
    if (r.ok) throw new Error('expected the import to fail');
    return r.errors;
  }

  it('rejects text that is not JSON', () => {
    expect(errorsFor('hello there')).toEqual([expect.stringMatching(/not valid JSON/)]);
    expect(errorsFor('')).toEqual([expect.stringMatching(/not valid JSON/)]);
    expect(errorsFor('{"format":')).toEqual([expect.stringMatching(/not valid JSON/)]);
  });

  it('rejects JSON that is not a world export', () => {
    expect(errorsFor('[1,2]')).toEqual([expect.stringContaining('not a Hearthside Life world export')]);
    expect(errorsFor('null')).toEqual([expect.stringContaining('not a Hearthside Life world export')]);
    expect(errorsFor('{}')).toEqual([expect.stringContaining('no "format" marker')]);
    expect(errorsFor('{"format":"hearthside-template"}')).toEqual([expect.stringContaining('format "hearthside-template", expected "hearthside-world"')]);
  });

  it('rejects an export from a newer version before touching the world', () => {
    const file = { format: 'hearthside-world', schemaVersion: SCHEMA_VERSION + 1, exportedAt: AT, packs: [], world: { anything: true } };
    expect(errorsFor(JSON.stringify(file))).toEqual([expect.stringMatching(/newer version of Hearthside Life.*Update the game/)]);
  });

  it('rejects missing or inconsistent versions and missing world data', () => {
    const base = { format: 'hearthside-world', exportedAt: AT, packs: [] };
    expect(errorsFor(JSON.stringify({ ...base, world: makeWorld() }))).toEqual([expect.stringContaining('no valid schemaVersion')]);
    expect(errorsFor(JSON.stringify({ ...base, schemaVersion: 1 }))).toEqual([expect.stringContaining('no world data')]);
    expect(errorsFor(JSON.stringify({ ...base, schemaVersion: 1, world: { ...makeWorld(), schemaVersion: 0 } }))).toEqual([expect.stringContaining('inconsistent')]);
  });

  it('rejects a damaged world and lists what is wrong', () => {
    const world = makeWorld();
    world.activeHouseholdId = 'hh_ghost';
    const errors = errorsFor(exportWorld(world, AT));
    expect(errors[0]).toMatch(/damaged and was not imported/);
    expect(errors).toContainEqual(expect.stringContaining('activeHouseholdId "hh_ghost"'));
  });

  it('reports unknown content and uninstalled packs but keeps the data', () => {
    const world = makeWorld();
    const lot = world.lots[world.activeLotId]!;
    const firstObject = Object.values(lot.objects)[0]!;
    firstObject.defId = 'sofa-from-a-pack';
    const before = snapshot(world);
    const r = importWorld(exportWorld(world, AT, ['cozy-cottage']), makeContent());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toEqual(before);
    expect(r.report.missing).toEqual([expect.objectContaining({ kind: 'object', id: 'sofa-from-a-pack' })]);
    expect(r.report.warnings).toEqual([expect.stringContaining('content pack "cozy-cottage"')]);
  });

  it('accepts a pack that is installed', () => {
    const r = importWorld(exportWorld(makeWorld(), AT, ['base']), makeContent());
    expect(r.ok && r.report.warnings).toEqual([]);
  });

  it('survives hostile keys without polluting prototypes', () => {
    const text = exportWorld(makeWorld(), AT).replace('"feed":[', '"__proto__":{"polluted":true},"feed":[');
    const r = importWorld(text, makeContent());
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
