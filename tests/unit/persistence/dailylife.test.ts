// Save compatibility of the daily-life fields: object condition (dirt, wear, broken) and the item kinds 'dishes' and
// 'mess' are optional additions to schema 1, so saves made before them load unchanged and bad values are repaired.

import { describe, expect, it } from 'vitest';
import { newId } from '../../../src/core/ids';
import type { PlacedObject, WorldState } from '../../../src/core/types';
import { SCHEMA_VERSION } from '../../../src/core/types';
import { describeReport } from '../../../src/persistence/references';
import { fillDailyLifeDefaults, migrate, validateWorld } from '../../../src/persistence/schema';
import { makeContent, makeWorld, snapshot } from './fixtures';

const objects = (w: WorldState): PlacedObject[] => Object.values(w.lots[w.activeLotId]!.objects);

describe('daily-life fields in saves', () => {
  it('a save without the new fields loads unchanged and valid', () => {
    const world = makeWorld();
    expect(objects(world).every((o) => o.condition.wear === undefined)).toBe(true);
    const before = snapshot(world);
    const r = migrate(world);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toEqual(before);
    expect(r.migrated).toBe(false);
    const v = validateWorld(r.state, makeContent());
    expect(v.errors).toEqual([]);
  });

  it('new fields survive JSON, and dishes and messes load without missing references', () => {
    const world = makeWorld();
    const lotId = world.activeLotId;
    const [o] = objects(world);
    o!.condition = { dirt: 0.7, broken: true, wear: 0.4, brokenAt: 1000, fails: 2 };
    const dishes = newId(world, 'itm'), puddle = newId(world, 'itm');
    world.items[dishes] = { id: dishes, kind: 'dishes', lotId, position: { x: 6, z: 9, level: 0 }, recipeId: 'pasta', portions: 3, quality: 1, createdAt: 700, spoilsAt: 9e5, ownerHouseholdId: null };
    world.items[puddle] = { id: puddle, kind: 'mess', lotId, position: { x: 7.5, z: 9.5, level: 0 }, recipeId: 'puddle', portions: 1, quality: 0.5, createdAt: 700, spoilsAt: 9e5, ownerHouseholdId: null };
    const copy = JSON.parse(JSON.stringify(world)) as WorldState;
    const r = migrate(copy);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toEqual(world);
    const v = validateWorld(r.state, makeContent());
    expect(v.errors).toEqual([]);
    // 'puddle' is not a recipe: only meals and dishes are checked against the recipes
    expect(v.missing.filter((m) => m.kind === 'recipe')).toEqual([]);
    expect(describeReport({ missing: v.missing, warnings: v.warnings, migratedFrom: null }).join(' ')).not.toMatch(/puddle/);
  });

  it('repairs a missing or out-of-range condition and unknown item kinds', () => {
    const world = makeWorld();
    const raw = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    const lot = (raw.lots as Record<string, { objects: Record<string, Record<string, unknown>> }>)[world.activeLotId]!;
    const ids = Object.keys(lot.objects);
    delete lot.objects[ids[0]!]!.condition;
    lot.objects[ids[1]!]!.condition = { dirt: 7, broken: 'yes', wear: -3, brokenAt: 'x', fails: -1 };
    lot.objects[ids[2]!]!.condition = { dirt: 0.5, broken: false, wear: 0.25, fails: 3 };
    const itemId = Object.keys(raw.items as object)[0]!;
    (raw.items as Record<string, Record<string, unknown>>)[itemId]!.kind = 'banana';
    const r = migrate(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const o = r.state.lots[world.activeLotId]!.objects;
    expect(o[ids[0]!]!.condition).toEqual({ dirt: 0, broken: false });
    expect(o[ids[1]!]!.condition).toEqual({ dirt: 1, broken: false, wear: 0 });
    expect(o[ids[2]!]!.condition).toEqual({ dirt: 0.5, broken: false, wear: 0.25, fails: 3 });
    expect(r.state.items[itemId]!.kind).toBe('meal');
    expect(validateWorld(r.state, makeContent()).errors).toEqual([]);
  });

  it('is idempotent and leaves the schema version alone', () => {
    expect(SCHEMA_VERSION).toBe(1);
    const raw = JSON.parse(JSON.stringify(makeWorld())) as Record<string, unknown>;
    fillDailyLifeDefaults(raw);
    const once = JSON.stringify(raw);
    fillDailyLifeDefaults(raw);
    expect(JSON.stringify(raw)).toBe(once);
    fillDailyLifeDefaults({});
    fillDailyLifeDefaults({ lots: { a: 5 }, items: { b: null } });
  });
});
