import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type WorldState } from '../../../src/core/types';
import { describeMissing, describeReport } from '../../../src/persistence/references';
import {
  MIGRATIONS, migrate, runMigrations, validateWorld, validateWorldStructure, type MigrationRegistry,
} from '../../../src/persistence/schema';
import { makeContent, makeWorld, snapshot } from './fixtures';

describe('migrate', () => {
  it('is the identity for the current schema (v1)', () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS[1]).toBeTypeOf('function');
    const world = makeWorld();
    const r = migrate(world);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state).toEqual(world);
      expect(r).toMatchObject({ fromVersion: 1, toVersion: 1, migrated: false });
    }
  });

  it('upgrades through the registry, stamping each version (fake v0 -> v1)', () => {
    const world = makeWorld();
    // A pretend v0 save stored the funds as plain `money` on the household.
    const v0: Record<string, unknown> = JSON.parse(JSON.stringify(world));
    v0.schemaVersion = 0;
    const hh = (v0.households as Record<string, Record<string, unknown>>)[world.activeHouseholdId]!;
    hh.money = hh.funds;
    delete hh.funds;
    const registry: MigrationRegistry = {
      1: (raw) => {
        for (const h of Object.values(raw.households as Record<string, Record<string, unknown>>)) { h.funds = h.money; delete h.money; }
        return raw;
      },
    };
    const r = migrate(v0, { migrations: registry, currentVersion: 1, oldestVersion: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r).toMatchObject({ fromVersion: 0, toVersion: 1, migrated: true });
      expect(r.state).toEqual(world);
      expect(validateWorldStructure(r.state).errors).toEqual([]);
    }
  });

  it('runs several steps in order and does not modify its input', () => {
    const order: number[] = [];
    const registry: MigrationRegistry = {
      1: (raw) => { order.push(1); raw.step1 = true; return raw; },
      2: (raw) => { order.push(2); raw.step2 = raw.step1 === true; return raw; },
      3: (raw) => { order.push(3); return { ...raw, step3: true }; },
    };
    const input = { schemaVersion: 0, keep: 'me' };
    const r = migrate(input, { migrations: registry, currentVersion: 3, oldestVersion: 0 });
    expect(order).toEqual([1, 2, 3]);
    expect(r.ok && r.state).toMatchObject({ schemaVersion: 3, keep: 'me', step1: true, step2: true, step3: true });
    expect(input).toEqual({ schemaVersion: 0, keep: 'me' });
  });

  it('rejects data from a newer version with a clear message', () => {
    const r = migrate({ ...makeWorld(), schemaVersion: SCHEMA_VERSION + 1 });
    expect(r).toMatchObject({ ok: false, code: 'newer' });
    if (!r.ok) expect(r.error).toMatch(/newer version of Hearthside Life.*Update the game/);
  });

  it('rejects data that is too old, has no version, or is not an object', () => {
    expect(migrate({ ...makeWorld(), schemaVersion: 0 })).toMatchObject({ ok: false, code: 'tooOld' });
    expect(migrate({})).toMatchObject({ ok: false, code: 'invalid' });
    expect(migrate({ schemaVersion: '1' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(migrate({ schemaVersion: 1.5 })).toMatchObject({ ok: false, code: 'invalid' });
    expect(migrate(null)).toMatchObject({ ok: false, code: 'invalid' });
    expect(migrate([1, 2])).toMatchObject({ ok: false, code: 'invalid' });
    expect(migrate('text')).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('reports a missing or throwing migration instead of throwing', () => {
    const gap = migrate({ schemaVersion: 0 }, { migrations: { 2: (r) => r }, currentVersion: 2, oldestVersion: 0 });
    expect(gap).toMatchObject({ ok: false, code: 'failed', error: expect.stringContaining('No migration from schema 0 to 1') });
    const boom = migrate({ schemaVersion: 0 }, { migrations: { 1: () => { throw new Error('bad data'); } }, currentVersion: 1, oldestVersion: 0 });
    expect(boom).toMatchObject({ ok: false, code: 'failed', error: expect.stringContaining('bad data') });
    const junk = runMigrations({ schemaVersion: 0 }, 0, 'thing', { 1: () => null as unknown as Record<string, unknown> }, 1, 0);
    expect(junk).toMatchObject({ ok: false, code: 'failed' });
  });
});

describe('validateWorld: structure', () => {
  it('accepts the fixture world without errors, warnings or missing references', () => {
    const r = validateWorld(makeWorld(), makeContent());
    expect(r).toEqual({ errors: [], warnings: [], missing: [] });
  });

  function errorsOf(mutate: (w: WorldState) => void): string[] {
    const w = makeWorld();
    mutate(w);
    return validateWorld(w, makeContent()).errors;
  }

  it('flags fatal structure problems with readable paths', () => {
    expect(errorsOf((w) => { w.activeHouseholdId = 'hh_nope'; })).toEqual([expect.stringContaining('activeHouseholdId "hh_nope" is not a household')]);
    expect(errorsOf((w) => { w.activeLotId = 'lot_nope'; })).toEqual([expect.stringContaining('activeLotId')]);
    expect(errorsOf((w) => { w.schemaVersion = 7; })).toEqual([expect.stringContaining('migrate the data first')]);
    expect(errorsOf((w) => { w.rng = [1, 2, 3] as unknown as WorldState['rng']; })).toEqual([expect.stringContaining('rng must be four numbers')]);
    expect(errorsOf((w) => { w.startMode = 'bogus' as WorldState['startMode']; })).toEqual([expect.stringContaining('startMode')]);
    expect(errorsOf((w) => { (w as unknown as Record<string, unknown>).people = []; })).toEqual([expect.stringContaining('people must be an object')]);
  });

  it('flags dangling references between people, households and lots', () => {
    const w = makeWorld();
    const hh = w.households[w.activeHouseholdId]!;
    const personId = hh.memberIds[0]!;
    expect(errorsOf((x) => { x.households[x.activeHouseholdId]!.memberIds.push('per_ghost'); })).toEqual([expect.stringContaining('refers to a person who does not exist')]);
    expect(errorsOf((x) => { x.people[personId]!.householdId = 'hh_ghost'; })).toEqual([expect.stringContaining(`people.${personId}.householdId`)]);
    expect(errorsOf((x) => { x.people[personId]!.location = { kind: 'lot', lotId: 'lot_ghost', level: 0, x: 0, z: 0, facing: 0, posture: 'standing' }; })).toEqual([expect.stringContaining('lot that does not exist')]);
    expect(errorsOf((x) => { x.households[x.activeHouseholdId]!.homeLotId = 'lot_ghost'; })).toEqual([expect.stringContaining('homeLotId')]);
  });

  it('flags broken lots: wall identity, openings in missing walls, bad rotation, missing support', () => {
    const w = makeWorld();
    const lot = w.lots[w.activeLotId]!;
    const wallId = Object.keys(lot.walls)[0]!;
    const openingId = Object.keys(lot.openings)[0]!;
    const objectId = Object.keys(lot.objects)[0]!;
    expect(errorsOf((x) => { x.lots[x.activeLotId]!.walls[wallId]!.x = 99; })).toEqual([expect.stringContaining('does not match its id')]);
    expect(errorsOf((x) => { x.lots[x.activeLotId]!.walls[wallId]!.id = 'other'; })).toEqual([expect.stringContaining('must equal its key')]);
    expect(errorsOf((x) => { x.lots[x.activeLotId]!.openings[openingId]!.wallId = '0:h:50:50'; })).toEqual([expect.stringContaining('wall that does not exist')]);
    expect(errorsOf((x) => { (x.lots[x.activeLotId]!.objects[objectId]! as { rot: number }).rot = 7; })).toEqual([expect.stringContaining('rot must be 0, 1, 2 or 3')]);
    expect(errorsOf((x) => { x.lots[x.activeLotId]!.objects[objectId]!.supportId = 'obj_ghost'; })).toEqual([expect.stringContaining('rests on an object that does not exist')]);
  });

  it('flags a malformed appearance or wardrobe', () => {
    const w = makeWorld();
    const personId = w.households[w.activeHouseholdId]!.memberIds[0]!;
    expect(errorsOf((x) => { (x.people[personId]!.appearance as unknown as { frame: string }).frame = 'z'; })).toEqual([expect.stringContaining(`people.${personId}.appearance.frame`)]);
    expect(errorsOf((x) => { x.people[personId]!.outfits.current.index = 5; })).toEqual([expect.stringContaining('only has 1')]);
    expect(errorsOf((x) => { x.people[personId]!.needs.hunger = Number.NaN; })).toEqual([expect.stringContaining('needs.hunger')]);
  });

  it('reports oddities as warnings, not errors', () => {
    const w = makeWorld();
    const [a, b] = w.households[w.activeHouseholdId]!.memberIds as [string, string];
    delete w.people[b];
    w.households[w.activeHouseholdId]!.memberIds = [a];
    w.nextId = 2;
    const r = validateWorld(w, makeContent());
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((x) => x.includes('refers to a person who does not exist'))).toBe(true);
    expect(r.warnings.some((x) => x.includes('nextId'))).toBe(true);
  });

  it('never throws on garbage and caps the number of listed problems', () => {
    for (const junk of [null, undefined, 5, 'x', [], {}]) {
      expect(() => validateWorldStructure(junk)).not.toThrow();
      expect(validateWorldStructure(junk).errors.length).toBeGreaterThan(0);
    }
    const w = makeWorld();
    const lot = w.lots[w.activeLotId]!;
    for (let i = 0; i < 200; i++) lot.floors[`0:${i}:0`] = { designId: 1 as unknown as string, paletteId: 2 as unknown as string };
    const errors = validateWorldStructure(w).errors;
    expect(errors.length).toBeLessThanOrEqual(61);
    expect(errors[errors.length - 1]).toMatch(/More problems/);
  });
});

describe('validateWorld: content references', () => {
  it('reports every kind of missing reference and leaves the data untouched', () => {
    const world = makeWorld();
    const lot = world.lots[world.activeLotId]!;
    const hh = world.households[world.activeHouseholdId]!;
    const robin = world.people[hh.memberIds[0]!]!;
    const wallId = Object.keys(lot.walls)[0]!;
    const objectId = Object.keys(lot.objects)[0]!;

    lot.objects[objectId]!.defId = 'sofa-retro-9000';
    hh.inventory[0]!.object.defId = 'lamp-vanished';
    lot.openings[Object.keys(lot.openings)[0]!]!.defId = 'door-vanished';
    lot.walls[wallId]!.sideA = { designId: 'marble-wall', paletteId: 'white' };
    lot.walls[wallId]!.sideB = { designId: 'brick-classic', paletteId: 'neon' };
    lot.floors[Object.keys(lot.floors)[0]!] = { designId: 'lava-floor', paletteId: 'red' };
    lot.floors[Object.keys(lot.floors)[1]!] = { designId: 'oak-planks', paletteId: 'ghost' };
    robin.traits = ['neat', 'telepathic'];
    robin.aspiration = { aspirationId: 'wizard', stage: 0, progress: {}, completedStages: 0, rewards: [] };
    robin.career!.careerId = 'astronaut';
    robin.appearance.hair.styleId = 'mohawk-xl';
    robin.appearance.bodyPresetId = 'body-ghost';
    robin.appearance.face.presetId = 'face-ghost';
    robin.outfits.outfits.everyday[0]!.layers.top!.garmentId = 'cape-of-doom';
    robin.outfits.outfits.everyday[0]!.layers.top!.pattern = 'paisley';
    robin.outfits.outfits.everyday[0]!.accessories[0]!.accessoryId = 'monocle';
    robin.queue[0]!.interactionId = 'teleport';
    robin.skills.juggling = { level: 1, xp: 0 };
    robin.moodlets[0]!.id = 'ecstatic';
    world.items[Object.keys(world.items)[0]!]!.recipeId = 'soufflé';
    const before = snapshot(world);

    const r = validateWorld(world, makeContent());
    expect(r.errors).toEqual([]);
    const found = r.missing.map((m) => `${m.kind}:${m.id}`).sort();
    expect(found).toEqual([
      'accessory:monocle', 'aspiration:wizard', 'bodyPreset:body-ghost', 'career:astronaut', 'facePreset:face-ghost',
      'floorDesign:lava-floor', 'floorPalette:oak-planks/ghost', 'garment:cape-of-doom', 'hair:mohawk-xl',
      'interaction:teleport', 'moodlet:ecstatic', 'object:lamp-vanished', 'object:sofa-retro-9000', 'opening:door-vanished',
      'pattern:paisley', 'recipe:soufflé', 'skill:juggling', 'trait:telepathic', 'wallDesign:marble-wall', 'wallPalette:brick-classic/neon',
    ].sort());
    // Reported, never deleted: the state is exactly as it was.
    expect(world).toEqual(before);
  });

  it('counts repeated uses and keeps a few example locations', () => {
    const world = makeWorld();
    const lot = world.lots[world.activeLotId]!;
    for (const o of Object.values(lot.objects)) o.defId = 'gone';
    const r = validateWorld(world, makeContent());
    const gone = r.missing.find((m) => m.id === 'gone')!;
    expect(gone.kind).toBe('object');
    expect(gone.count).toBe(3);
    expect(gone.where[0]).toMatch(/^lots\.lot_\w+\.objects\.obj_\w+$/);
    expect(describeMissing([gone])).toEqual([expect.stringContaining('Missing object "gone" (used 3 times, e.g. lots.')]);
  });

  it('describes a report as readable lines', () => {
    const lines = describeReport({
      migratedFrom: 0,
      missing: [{ kind: 'trait', id: 'telepathic', count: 1, where: ['people.per_1.traits[1]'] }],
      warnings: ['something odd'],
    });
    expect(lines).toEqual([
      'Upgraded from an older save format (schema 0).',
      'Missing trait "telepathic" (used once, e.g. people.per_1.traits[1])',
      'something odd',
    ]);
    expect(describeReport({ migratedFrom: null, missing: [], warnings: [] })).toEqual([]);
  });

  it('accepts interactions that are social actions and the solid pattern', () => {
    const world = makeWorld();
    const robin = world.people[world.households[world.activeHouseholdId]!.memberIds[0]!]!;
    robin.queue[0]!.interactionId = 'chat'; // a SocialDef id in the fixture content
    expect(validateWorld(world, makeContent()).missing).toEqual([]);
  });

  it('does not treat inherited object keys as defined content', () => {
    const world = makeWorld();
    world.lots[world.activeLotId]!.objects[Object.keys(world.lots[world.activeLotId]!.objects)[0]!]!.defId = 'constructor';
    expect(validateWorld(world, makeContent()).missing).toEqual([expect.objectContaining({ kind: 'object', id: 'constructor' })]);
  });

  it('skips the reference scan when the structure is broken', () => {
    const world = makeWorld();
    world.activeLotId = 'nope';
    const r = validateWorld(world, makeContent());
    expect(r.errors.length).toBe(1);
    expect(r.missing).toEqual([]);
  });
});
