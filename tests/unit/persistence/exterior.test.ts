// Save compatibility of the Milestone 9 exterior fields: lot fences, roofs and terrain paint, and crop bed state on objects. All are
// optional additions to schema 1: older saves load unchanged, valid data survives a round trip, and malformed values are repaired
// (dropped) by fillExteriorDefaults instead of breaking the save.

import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../../../src/core/types';
import type { Lot, WorldState } from '../../../src/core/types';
import { fillExteriorDefaults, migrate, validateWorld } from '../../../src/persistence/schema';
import { validateStructure } from '../../../src/persistence/structure';
import { makeContent, makeWorld } from './fixtures';

const lotOf = (w: WorldState): Lot => Object.values(w.lots)[0]!;

function withExterior(): WorldState {
  const w = makeWorld();
  const lot = lotOf(w);
  lot.fences = {
    '0:h:3:5': { id: '0:h:3:5', level: 0, dir: 'h', x: 3, z: 5, defId: 'picket-white', variant: 2, purchasePrice: 1200, boughtAt: 480 },
    '0:v:4:5': { id: '0:v:4:5', level: 0, dir: 'v', x: 4, z: 5, defId: 'gate-picket' },
  };
  lot.roofs = {
    roof_a: { id: 'roof_a', level: 0, x0: 2, z0: 2, x1: 8, z1: 6, styleId: 'gable', ridge: 'h', pitch: 32, finish: { designId: 'asphalt-shingle', paletteId: 'charcoal' }, purchasePrice: 9000 },
  };
  lot.terrain = { '0:3:3': 'gravel', '0:4:3': 'mulch' };
  const obj = Object.values(lot.objects)[0]!;
  obj.garden = { crop: 'tomato', growth: 2.5, need: 5, water: 0.5, weeds: 0.1, day: 3, harvests: 1 };
  return w;
}

describe('exterior fields in saves', () => {
  it('a save without them loads unchanged and valid', () => {
    const world = makeWorld();
    expect(lotOf(world).fences).toBeUndefined();
    const raw = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    const r = migrate(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lot = Object.values(r.state.lots)[0]!;
    expect(lot.fences).toBeUndefined();
    expect(lot.roofs).toBeUndefined();
    expect(lot.terrain).toBeUndefined();
    const v = validateWorld(r.state, makeContent());
    expect(v.errors).toEqual([]);
  });

  it('valid exterior data survives migrate and validation untouched', () => {
    const world = withExterior();
    const raw = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    const r = migrate(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.values(r.state.lots)[0]).toEqual(lotOf(world));
    expect(validateWorld(r.state, makeContent()).errors).toEqual([]);
    expect(validateStructure(JSON.parse(JSON.stringify(world))).errors).toEqual([]);
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('repairs malformed records by dropping them', () => {
    const raw = JSON.parse(JSON.stringify(withExterior())) as { lots: Record<string, Record<string, unknown>> };
    const lot = Object.values(raw.lots)[0]! as Record<string, unknown> & { fences: Record<string, unknown>; roofs: Record<string, unknown>; terrain: Record<string, unknown>; objects: Record<string, Record<string, unknown>> };
    lot.fences['0:h:9:9'] = { defId: 12 };
    lot.fences['0:h:8:8'] = { id: 'x', level: 0, dir: 'z', x: 8, z: 8, defId: 'picket-white' };
    lot.roofs.bad = { id: 'bad', level: 0, x0: 5, z0: 5, x1: 5, z1: 9, styleId: 'gable', finish: { designId: 'a', paletteId: 'b' } };
    lot.roofs.worse = 'not a roof';
    lot.terrain['0:5:5'] = 7;
    lot.terrain['nonsense'] = 'gravel';
    const obj = Object.values(lot.objects)[0]!;
    const second = Object.values(lot.objects)[1];
    if (second) second.garden = { crop: 5 };
    fillExteriorDefaults(raw as unknown as Record<string, unknown>);
    expect(Object.keys(lot.fences)).toEqual(['0:h:3:5', '0:v:4:5']);
    expect(Object.keys(lot.roofs)).toEqual(['roof_a']);
    expect(Object.keys(lot.terrain)).toEqual(['0:3:3', '0:4:3']);
    expect(obj.garden).toBeDefined();
    if (second) expect(second.garden).toBeUndefined();
    // a whole field of the wrong type goes
    (lot as Record<string, unknown>).fences = 'x';
    (lot as Record<string, unknown>).roofs = [];
    (lot as Record<string, unknown>).terrain = null;
    fillExteriorDefaults(raw as unknown as Record<string, unknown>);
    expect(lot.fences).toBeUndefined();
    expect(lot.terrain).toBeUndefined();
  });

  it('structure validation names bad exterior data', () => {
    const w = withExterior();
    const bad = JSON.parse(JSON.stringify(w)) as { lots: Record<string, { fences: Record<string, Record<string, unknown>>; roofs: Record<string, Record<string, unknown>> }> };
    const lot = Object.values(bad.lots)[0]!;
    lot.fences['0:h:3:5']!.x = 4; // no longer matches its edge key
    lot.roofs.roof_a!.x1 = 1; // empty rectangle
    const errors = validateStructure(bad).errors;
    expect(errors.some((e) => /fences\.0:h:3:5/.test(e))).toBe(true);
    expect(errors.some((e) => /roofs\.roof_a/.test(e))).toBe(true);
  });
});
