// Save compatibility of the Milestone 8 family fields: aging settings (custom, agingDays, elderEndOfLife) and a person's
// stageDays, parentIds, school and careSince. All are optional additions to schema 1: old saves load with the defaults (aging
// off, stage days 0, no parents, no school) and malformed values are repaired instead of breaking the save.

import { describe, expect, it } from 'vitest';
import type { WorldState } from '../../../src/core/types';
import { fillFamilyDefaults, migrate, validateWorld } from '../../../src/persistence/schema';
import { makeContent, makeWorld, snapshot } from './fixtures';

const people = (w: WorldState) => Object.values(w.people);

describe('family fields in saves', () => {
  it('an old save without them loads unchanged, valid, with aging off', () => {
    const world = makeWorld();
    expect(world.settings.aging).toBe('off');
    const raw = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    const before = snapshot(raw as unknown as WorldState);
    const r = migrate(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toEqual(before);
    expect(people(r.state).every((p) => p.stageDays === undefined && p.parentIds === undefined && p.school === undefined)).toBe(true);
    expect(validateWorld(r.state, makeContent()).errors).toEqual([]);
  });

  it('new fields survive a JSON round trip, migrate untouched and validate', () => {
    const world = makeWorld();
    world.settings.aging = 'custom';
    world.settings.agingDays = { baby: 2, elder: 30 };
    world.settings.elderEndOfLife = true;
    const [a, b] = people(world);
    a!.stageDays = 7;
    a!.parentIds = [b!.id];
    a!.school = { schoolId: 'elementary', performance: 12, homeworkDay: 3, attended: 9, missed: 1, lastGrade: 'B', reportWeek: 0 };
    a!.careSince = { hunger: 100 };
    const copy = JSON.parse(JSON.stringify(world)) as WorldState;
    const r = migrate(copy);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toEqual(world);
    expect(r.migrated).toBe(false);
    expect(validateWorld(r.state, makeContent()).errors).toEqual([]);
    // and again through JSON: nothing is lost
    expect(JSON.parse(JSON.stringify(r.state))).toEqual(JSON.parse(JSON.stringify(world)));
  });

  it('repairs a damaged aging mode, custom days, stage days, parents, school and care records', () => {
    const world = makeWorld();
    const raw = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    const settings = raw.settings as Record<string, unknown>;
    settings.aging = 'fast';
    settings.agingDays = { baby: 0, toddler: 999, child: 'x', cat: 3, teen: 4.6 };
    settings.elderEndOfLife = 'yes';
    const list = Object.values(raw.people as Record<string, Record<string, unknown>>);
    const [a, b] = list;
    const aid = a!.id as string;
    a!.stageDays = -3;
    b!.stageDays = 4.9;
    a!.parentIds = [aid, 'per_missing', b!.id, b!.id, 7];
    b!.parentIds = 'nope';
    a!.school = { schoolId: 'elementary', performance: 400, homeworkDay: 'x', attended: -2, missed: 1.5, lastGrade: 5, reportWeek: -1 };
    b!.school = { performance: 1 };
    a!.careSince = { hunger: 5, bladder: 'x', mood: 3 };
    b!.careSince = 'x';
    fillFamilyDefaults(raw);
    expect(settings).toMatchObject({ aging: 'off', agingDays: { baby: 1, toddler: 120, teen: 5 } });
    expect(settings.elderEndOfLife).toBeUndefined();
    expect(a!.stageDays).toBeUndefined();
    expect(b!.stageDays).toBe(4);
    expect(a!.parentIds).toEqual([b!.id]);
    expect(b!.parentIds).toBeUndefined();
    expect(a!.school).toEqual({ schoolId: 'elementary', performance: 100, homeworkDay: -1, attended: 0, missed: 0 });
    expect(b!.school).toBeUndefined();
    expect(a!.careSince).toEqual({ hunger: 5 });
    expect(b!.careSince).toBeUndefined();
    const r = migrate(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(validateWorld(r.state, makeContent()).errors).toEqual([]);
  });

  it('accepts the custom aging mode in the structure check', () => {
    const world = makeWorld();
    world.settings.aging = 'custom';
    expect(validateWorld(world, makeContent()).errors).toEqual([]);
    (world.settings as unknown as { aging: string }).aging = 'sometimes';
    expect(validateWorld(world, makeContent()).errors.some((e) => /aging/.test(e))).toBe(true);
  });
});

describe('social gaps pass optional fields', () => {
  it('keeps a good carriedBy and townChildren marker, drops bad ones, and an old save without them is untouched', () => {
    const raw = { people: { a: { id: 'a', carriedBy: 'b' }, b: { id: 'b' }, c: { id: 'c', carriedBy: 'zzz' }, d: { id: 'd', carriedBy: 'd' }, e: { id: 'e', carriedBy: 7 } }, settings: {} } as unknown as Record<string, unknown>;
    fillFamilyDefaults(raw);
    const p = raw.people as Record<string, { carriedBy?: unknown }>;
    expect(p.a!.carriedBy).toBe('b');
    expect('carriedBy' in p.b!).toBe(false);
    for (const k of ['c', 'd', 'e']) expect(k + ('carriedBy' in p[k]!)).toBe(`${k}false`);
  });

  it('the neighbourhood marker keeps townChildren and the settings keep townLife only when they are booleans', () => {
    const w = makeWorld() as unknown as Record<string, unknown>;
    w.neighbourhood = { version: 1, street: 'Lane', npcHouseholdIds: [], townChildren: true };
    (w.settings as Record<string, unknown>).townLife = 'yes';
    const r = migrate(JSON.parse(JSON.stringify(w)));
    if (!r.ok) throw new Error('migrate failed');
    expect(r.state.neighbourhood?.townChildren).toBe(true);
    expect(r.state.settings.townLife).toBeUndefined();
    (w.settings as Record<string, unknown>).townLife = false;
    const r2 = migrate(JSON.parse(JSON.stringify(w)));
    if (!r2.ok) throw new Error('migrate failed');
    expect(r2.state.settings.townLife).toBe(false);
  });
});
