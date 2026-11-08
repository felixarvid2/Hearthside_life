import { describe, expect, it } from 'vitest';
import { blockersOf, conflicts, equipWith } from '../../../../src/characters/modular/restrictions';
import { resolveLook } from '../../../../src/characters/modular/look';
import { validateManifest } from '../../../../src/characters/modular/manifest';
import { categoryOfSlot } from '../../../../src/characters/modular/types';
import type { GarmentDef, ModularManifest } from '../../../../src/characters/modular/types';
import { BODY, look, realManifest, shellGarment } from './helpers';

const garment = (id: string, slot: GarmentDef['slot'], conflictsWith: GarmentDef['slot'][] = []): GarmentDef =>
  shellGarment({ id, slot, category: categoryOfSlot(slot), conflicts: conflictsWith });

function manifest(extra: Partial<ModularManifest> = {}): ModularManifest {
  const m = realManifest();
  m.garments = [garment('tee', 'top'), garment('jeans', 'bottom'), garment('dress', 'full', ['top', 'bottom']), garment('coat', 'outer'), garment('boots', 'shoes'), garment('hood', 'outer')];
  return Object.assign(m, extra);
}

describe('restrictions', () => {
  it("'full' excludes top and bottom through the garments' conflicts, symmetrically", () => {
    const m = manifest();
    expect(conflicts(m, 'dress', 'tee')).toBe(true);
    expect(conflicts(m, 'tee', 'dress')).toBe(true);
    expect(conflicts(m, 'dress', 'jeans')).toBe(true);
    expect(conflicts(m, 'dress', 'coat')).toBe(false);
    expect(blockersOf(m, { top: 'tee', bottom: 'jeans' }, null, 'dress')).toEqual(['tee', 'jeans']);
    const r = equipWith(m, { top: 'tee', bottom: 'jeans', shoes: 'boots' }, null, 'dress');
    expect(r.outfit).toEqual({ full: 'dress', shoes: 'boots' });
    expect(equipWith(m, r.outfit, null, 'tee').outfit).toEqual({ top: 'tee', shoes: 'boots' });
  });

  it('a conflict declared on one side only still works from both', () => {
    const m = manifest();
    m.garments[0] = garment('tee', 'top', ['outer']);
    expect(conflicts(m, 'coat', 'tee')).toBe(true);
    expect(conflicts(m, 'tee', 'coat')).toBe(true);
  });

  it('slot restrictions of the manifest are symmetric', () => {
    const m = manifest({ restrictions: { slots: { shoes: ['bottom'] } } });
    expect(conflicts(m, 'boots', 'jeans')).toBe(true);
    expect(conflicts(m, 'jeans', 'boots')).toBe(true);
    expect(blockersOf(m, { shoes: 'boots' }, null, 'jeans')).toEqual(['boots']);
    expect(blockersOf(m, { bottom: 'jeans' }, null, 'boots')).toEqual(['jeans']);
  });

  it('part restrictions are symmetric and cover hair', () => {
    const m = manifest({ restrictions: { parts: { hood: ['short_crop', 'coat'] } } });
    expect(conflicts(m, 'hood', 'short_crop')).toBe(true);
    expect(conflicts(m, 'short_crop', 'hood')).toBe(true);
    expect(blockersOf(m, { outer: 'hood' }, null, 'short_crop')).toEqual(['hood']);
    expect(blockersOf(m, {}, 'short_crop', 'hood')).toEqual(['short_crop']);
    expect(equipWith(m, { top: 'tee' }, 'short_crop', 'hood')).toEqual({ outfit: { top: 'tee', outer: 'hood' }, hairId: null, facialHairId: null });
    expect(equipWith(m, { outer: 'hood', top: 'tee' }, null, 'short_crop')).toEqual({ outfit: { top: 'tee' }, hairId: 'short_crop', facialHairId: null });
    // 'coat' and 'hood' share a slot: replaced, not a blocker
    expect(blockersOf(m, { outer: 'coat' }, null, 'hood')).toEqual([]);
    expect(equipWith(m, { outer: 'coat' }, null, 'hood').outfit).toEqual({ outer: 'hood' });
  });

  it('does not modify its inputs and ignores unknown ids', () => {
    const m = manifest();
    const outfit = { top: 'tee' };
    equipWith(m, outfit, null, 'dress');
    expect(outfit).toEqual({ top: 'tee' });
    expect(equipWith(m, outfit, 'short_crop', 'nope')).toEqual({ outfit: { top: 'tee' }, hairId: 'short_crop', facialHairId: null });
    expect(blockersOf(m, outfit, null, 'nope')).toEqual([]);
    expect(conflicts(m, 'tee', 'tee')).toBe(false);
  });

  it('resolveLook uses part restrictions against hair and slot restrictions', () => {
    const m = manifest({ restrictions: { parts: { hood: ['short_crop'] }, slots: { shoes: ['bottom'] } } });
    for (const g of m.garments) g.files = { [BODY]: g.files[BODY] ?? 'x.glb' };
    const r = resolveLook(look({ hairId: 'short_crop', outfits: { everyday: { top: 'tee', outer: 'hood', bottom: 'jeans', shoes: 'boots' } } }), m);
    expect(r.look.outfits.everyday).toEqual({ top: 'tee', bottom: 'jeans' });
    expect(r.issues.join('\n')).toContain("hairstyle 'short_crop'");
    expect(r.issues.join('\n')).toContain("'boots' cannot be worn with 'jeans'");
  });

  it('validateManifest flags unknown restriction targets', () => {
    const m = manifest({ restrictions: { slots: { cape: ['top'] } as never, parts: { ghost: ['tee'], tee: ['phantom'] } } });
    const issues = validateManifest(m).join('\n');
    for (const s of ["unknown slot 'cape'", "unknown part 'ghost'", "unknown part 'phantom'"]) expect(issues).toContain(s);
  });
});
