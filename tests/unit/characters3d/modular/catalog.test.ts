// Catalog extension of the modular characters: facial hair (v2 look, runtime, creator), accessory slots, outer over top,
// hat vs hair feedback and tag filters. Synthetic manifests only: nothing here depends on how big the shipped catalog is.
import { describe, expect, it } from 'vitest';
import { CreatorSession } from '../../../../src/characters/creator';
import { equipFacialHair, equipGarment, equipHair, randomizeLook } from '../../../../src/characters/modular/equip';
import { lookFor, migrateModularLook, resolveLook } from '../../../../src/characters/modular/look';
import { facialHairFor, validateManifest } from '../../../../src/characters/modular/manifest';
import { ModularCharacter } from '../../../../src/characters/modular/ModularCharacter';
import { FILTER_MIN_ITEMS, matchesTag, tagFilters } from '../../../../src/characters/modular/tags';
import { ACCESSORY_SLOTS, MODULAR_LOOK_VERSION, categoryOfSlot } from '../../../../src/characters/modular/types';
import type { FacialHairDef, GarmentDef, HairstyleDef, ModularLook, ModularManifest, ModularSlot } from '../../../../src/characters/modular/types';
import { Rng, seedRng } from '../../../../src/core/rng';
import { fixtureContent } from '../../characters/fixtures';
import { BODY, loadClips, look, realManifest, testCache } from './helpers';

const BOTH = { b_a: 'x.glb', b_b: 'x.glb' };
const garment = (id: string, label: string, slot: ModularSlot, over: Partial<GarmentDef> = {}): GarmentDef => ({
  id, label, category: categoryOfSlot(slot), slot, files: { ...BOTH }, rig: 'r', hides: [], layer: 1, conflicts: [], source: 't', license: 't',
  colorRegions: [{ id: 'main', label: 'Fabric', materials: ['M'], default: '#3f6fa8', palette: ['#3f6fa8', '#c94f4f'] }], ...over,
});
const hair = (id: string, label: string): HairstyleDef => ({ id, label, files: { ...BOTH }, rig: 'r', attachment: 'skinned', colorRegions: [], source: 't', license: 't' });
const beard = (id: string, label: string, over: Partial<FacialHairDef> = {}): FacialHairDef => ({ ...hair(id, label), ...over });

function manifest(): ModularManifest {
  return {
    version: 1,
    rigs: [{ id: 'r', label: 'r', joints: ['root'], bindTolerance: 0.002 }] as unknown as ModularManifest['rigs'],
    bodies: [
      { id: 'b_a', label: 'Broad', rig: 'r', file: 'a.glb', skinMaterials: [], morphs: [{ id: 'jaw', label: 'Jaw', target: 'Jaw', range: [-1, 1], group: 'face' }], height: 1.8, license: 't', source: 't' },
      { id: 'b_b', label: 'Curvy', rig: 'r', file: 'b.glb', skinMaterials: [], morphs: [], height: 1.75, license: 't', source: 't' },
    ],
    garments: [
      garment('tee', 'Tee', 'top'), garment('jeans', 'Jeans', 'bottom'), garment('dress', 'Dress', 'full', { conflicts: ['top', 'bottom'] }),
      garment('jacket', 'Jacket', 'outer'), garment('boots', 'Boots', 'shoes'),
      garment('beanie', 'Beanie', 'hat'), garment('cap', 'Cap', 'hat'), garment('glasses', 'Glasses', 'eyewear'), garment('studs', 'Studs', 'earrings'),
      garment('scarf', 'Scarf', 'neck'), garment('watch', 'Watch', 'wrist'), garment('belt', 'Belt', 'waist'), garment('tote', 'Tote', 'bag'),
    ],
    hairstyles: [hair('short', 'Short crop'), hair('pony', 'Ponytail'), hair('bun', 'Bun')],
    facialHair: [beard('full_beard', 'Full beard', { followsMorphs: ['jaw'] }), beard('moustache', 'Moustache'), beard('b_only', 'Only A', { files: { b_a: 'x.glb' } })],
    restrictions: { parts: { beanie: ['pony', 'bun'], scarf: ['full_beard'], pony: ['moustache'] } },
    defaults: { bodyByFrame: { a: 'b_a', b: 'b_b' }, hairstyle: 'short', outfit: { top: 'tee' }, eyeColor: '#5b4636' },
  };
}
const session = (m: ModularManifest | null = manifest()): CreatorSession => {
  const s = new CreatorSession(fixtureContent(), { rng: new Rng(seedRng(3)) });
  s.setModularManifest(m);
  return s;
};
const stored = (s: CreatorSession): ModularLook => s.current.appearance.modular as ModularLook;
const outfit = (s: CreatorSession) => stored(s).outfits.everyday ?? {};

describe('look v2: facial hair', () => {
  const v1 = { v: 1, bodyId: 'b_a', hairId: 'short', outfits: { everyday: { top: 'tee' } }, colors: { skin: '#c68642', eyes: '#5b4636', hair: '#222222', garments: {} }, morphs: {} };
  it('is version 2', () => { expect(MODULAR_LOOK_VERSION).toBe(2); });
  it('migrates v1 looks (also as JSON text) with no facial hair', () => {
    for (const raw of [v1, JSON.stringify(v1)]) {
      const l = migrateModularLook(raw);
      expect(l).toMatchObject({ v: 2, facialHairId: null, hairId: 'short', outfits: { everyday: { top: 'tee' } } });
    }
  });
  it('keeps and validates facialHairId in v2', () => {
    expect(migrateModularLook({ ...v1, v: 2, facialHairId: 'moustache' })?.facialHairId).toBe('moustache');
    expect(migrateModularLook({ ...v1, v: 2 })?.facialHairId).toBeNull();
    expect(migrateModularLook({ ...v1, v: 2, facialHairId: 5 })).toBeNull();
    expect(migrateModularLook({ ...v1, v: 3 })).toBeNull();
  });
  it('a v1 look stored on a person reads as v2 and the first edit writes v2', () => {
    const s = session();
    s.current.appearance.modular = v1 as never;
    expect(lookFor(s.current.appearance, manifest()).facialHairId).toBeNull();
    s.setModularFacialHair('moustache');
    expect(stored(s).v).toBe(2);
  });
  it('derived looks have no facial hair', () => { expect(session().modularLook()!.facialHairId).toBeNull(); });
  it('resolveLook drops unknown, unfitted and conflicting facial hair', () => {
    const m = manifest();
    expect(resolveLook(look({ bodyId: 'b_b', facialHairId: 'b_only' }), m).look.facialHairId).toBeNull();
    expect(resolveLook(look({ bodyId: 'b_a', facialHairId: 'nope' }), m).look.facialHairId).toBeNull();
    expect(resolveLook(look({ bodyId: 'b_a', facialHairId: 'moustache', hairId: 'pony' }), m).look.facialHairId).toBeNull();
    expect(resolveLook(look({ bodyId: 'b_a', facialHairId: 'full_beard', outfits: { work: { neck: 'scarf' } } }), m).look.facialHairId).toBeNull();
    expect(resolveLook(look({ bodyId: 'b_a', facialHairId: 'moustache', hairId: 'short' }), m)).toMatchObject({ look: { facialHairId: 'moustache' }, issues: [] });
    // an old object without the field resolves too
    expect(resolveLook({ ...look({ bodyId: 'b_a' }), facialHairId: undefined } as never, m).look.facialHairId).toBeNull();
  });
  it('manifest: lists per body, validates ids, rigs and part restrictions', () => {
    const m = manifest();
    expect(facialHairFor(m, 'b_a').map((f) => f.id)).toEqual(['full_beard', 'moustache', 'b_only']);
    expect(facialHairFor(m, 'b_b').map((f) => f.id)).toEqual(['full_beard', 'moustache']);
    expect(validateManifest(m)).toEqual([]);
    m.facialHair!.push(beard('moustache', 'Dup', { rig: 'zzz' }));
    const issues = validateManifest(m).join('\n');
    expect(issues).toContain("Duplicate facial hair id 'moustache'");
    expect(issues).toContain("Facial hair 'moustache' uses unknown rig 'zzz'");
    const m2 = manifest();
    m2.garments.push(garment('bad', 'Bad', 'hat', { category: 'top' }));
    expect(validateManifest(m2).join('\n')).toContain("Garment 'bad' in slot 'hat' must have category 'accessory'");
  });
});

describe('creator: facial hair setters', () => {
  it('sets, replaces and clears facial hair; every step is undoable', () => {
    const s = session();
    const before = JSON.stringify(s.current.appearance);
    expect(s.setModularFacialHair('moustache')).toMatchObject({ ok: true });
    expect(stored(s).facialHairId).toBe('moustache');
    s.setModularFacialHair('full_beard');
    expect(stored(s).facialHairId).toBe('full_beard');
    s.setModularFacialHair(null);
    expect(stored(s).facialHairId).toBeNull();
    while (s.canUndo()) s.undo();
    expect(JSON.stringify(s.current.appearance)).toBe(before);
    while (s.canRedo()) s.redo();
    expect(stored(s).facialHairId).toBeNull();
    s.undo();
    expect(stored(s).facialHairId).toBe('full_beard');
  });
  it('refuses unknown ids, parts not fitted to the body, and the classic style', () => {
    const s = session();
    expect(s.setModularFacialHair('nope')).toMatchObject({ ok: false });
    s.setModularBody('b_b');
    expect(s.setModularFacialHair('b_only')).toMatchObject({ ok: false });
    expect(stored(s).facialHairId).toBeNull();
    expect(session(null).setModularFacialHair('moustache')).toMatchObject({ ok: false });
  });
  it('switching to a body that lacks the facial hair takes it off and says so', () => {
    const s = session();
    s.setFrame('a');
    s.setModularFacialHair('b_only');
    const r = s.setModularBody('b_b');
    expect(stored(s).facialHairId).toBeNull();
    expect('note' in r && r.note).toContain('Only A');
  });
  it('a hairstyle that excludes the facial hair takes it off; facial hair that excludes the hairstyle switches the hair', () => {
    const s = session();
    s.setModularFacialHair('moustache');
    const r = s.setModularHair('pony');
    expect(stored(s)).toMatchObject({ hairId: 'pony', facialHairId: null });
    expect(r.ok && r.note).toBe("Moustache doesn't fit with Ponytail - taken off.");
    const r2 = s.setModularFacialHair('moustache');
    expect(stored(s)).toMatchObject({ hairId: 'short', facialHairId: 'moustache' });
    expect(r2.ok && r2.note).toBe("Ponytail doesn't fit with Moustache - switched to Short crop.");
  });
  it('a garment that excludes the facial hair takes it off with a note, and facial hair takes off such a garment', () => {
    const s = session();
    s.setModularFacialHair('full_beard');
    const r = s.setModularGarment('everyday', 'neck', 'scarf');
    expect(stored(s).facialHairId).toBeNull();
    expect(outfit(s).neck).toBe('scarf');
    expect(r.ok && r.note).toBe("Full beard doesn't fit with Scarf - taken off.");
    const r2 = s.setModularFacialHair('full_beard');
    expect(outfit(s).neck).toBeUndefined();
    expect(r2.ok && r2.note).toBe("Scarf doesn't fit with Full beard - taken off.");
  });
  it('the facial hair is shared by all categories (a work scarf blocks it too)', () => {
    const s = session();
    s.setModularGarment('work', 'neck', 'scarf');
    s.setModularFacialHair('full_beard');
    expect(stored(s).outfits.work?.neck).toBeUndefined();
  });
  it('resetting the hair category removes facial hair; randomize keeps the combination valid', () => {
    const s = session();
    s.setModularFacialHair('moustache');
    s.resetCategory('hair');
    expect(stored(s).facialHairId).toBeNull();
    const m = manifest();
    let some = 0, none = 0;
    for (let i = 0; i < 80; i++) {
      const l = look({ bodyId: i % 2 ? 'b_a' : 'b_b' });
      randomizeLook(m, l, new Rng(seedRng(i)), { hair: true, clothing: true });
      expect(resolveLook(l, m).issues).toEqual([]);
      if (l.facialHairId) some++; else none++;
    }
    expect(some).toBeGreaterThan(0);
    expect(none).toBeGreaterThan(some);
  });
});

describe('accessory slots', () => {
  it('MODULAR_SLOTS lists the accessories and categories map to them', () => {
    expect([...ACCESSORY_SLOTS]).toEqual(['hat', 'eyewear', 'earrings', 'neck', 'wrist', 'waist', 'bag']);
    expect(categoryOfSlot('hat')).toBe('accessory');
    expect(categoryOfSlot('outer')).toBe('outer');
  });
  it('one item per slot, any combination of slots, per category', () => {
    const s = session();
    for (const [slot, id] of [['hat', 'cap'], ['eyewear', 'glasses'], ['earrings', 'studs'], ['neck', 'scarf'], ['wrist', 'watch'], ['waist', 'belt'], ['bag', 'tote']] as const) {
      expect(s.setModularGarment('everyday', slot, id)).toMatchObject({ ok: true });
    }
    expect(outfit(s)).toMatchObject({ hat: 'cap', eyewear: 'glasses', earrings: 'studs', neck: 'scarf', wrist: 'watch', waist: 'belt', bag: 'tote' });
    s.setModularGarment('everyday', 'hat', 'beanie');
    expect(outfit(s).hat).toBe('beanie');
    expect(Object.values(outfit(s))).not.toContain('cap');
    s.setModularGarment('work', 'wrist', 'watch');
    expect(stored(s).outfits.work).toMatchObject({ wrist: 'watch' });
    s.setModularGarment('everyday', 'bag', null);
    expect(outfit(s).bag).toBeUndefined();
    expect(s.setModularGarment('everyday', 'bag', 'cap')).toMatchObject({ ok: false });
    expect(validateManifest(manifest())).toEqual([]);
  });
  it('clothing and accessories survive resolveLook', () => {
    const m = manifest();
    const l = look({ bodyId: 'b_a', outfits: { everyday: { top: 'tee', bottom: 'jeans', shoes: 'boots', hat: 'cap', eyewear: 'glasses', bag: 'tote' } } });
    expect(resolveLook(l, m)).toMatchObject({ issues: [], look: { outfits: l.outfits } });
    const bad = look({ bodyId: 'b_a', outfits: { everyday: { hat: 'glasses' } } });
    expect(resolveLook(bad, m).look.outfits.everyday).toEqual({});
  });
  it('random clothing keeps accessories sparse', () => {
    const m = manifest();
    let total = 0, outfits = 0;
    for (let i = 0; i < 100; i++) {
      const l = look({ bodyId: 'b_a' });
      randomizeLook(m, l, new Rng(seedRng(100 + i)), { clothing: true });
      const o = l.outfits.everyday ?? {};
      total += ACCESSORY_SLOTS.filter((a) => o[a]).length;
      outfits++;
      expect(resolveLook(l, m).issues).toEqual([]);
    }
    expect(total / outfits).toBeLessThan(1.5);
    expect(total).toBeGreaterThan(0);
  });
});

describe('layering: outer over top', () => {
  it('an outer garment goes over a top, a one-piece may take an outer, a one-piece still replaces top and bottom', () => {
    const s = session();
    s.setModularGarment('everyday', 'top', 'tee');
    s.setModularGarment('everyday', 'bottom', 'jeans');
    const r = s.setModularGarment('everyday', 'outer', 'jacket');
    expect(outfit(s)).toMatchObject({ top: 'tee', outer: 'jacket', bottom: 'jeans' });
    expect(r.ok && r.note).toBeFalsy();
    s.setModularGarment('everyday', 'full', 'dress');
    expect(outfit(s)).toEqual({ full: 'dress', outer: 'jacket' });
    s.setModularGarment('everyday', 'top', 'tee');
    expect(outfit(s)).toEqual({ top: 'tee', outer: 'jacket' });
  });
  it('resolveLook and equipGarment agree on outer + top and outer + full', () => {
    const m = manifest();
    for (const base of [{ top: 'tee' }, { full: 'dress' }, { top: 'tee', bottom: 'jeans' }] as const) {
      const l = look({ bodyId: 'b_a', outfits: { everyday: { ...base, outer: 'jacket' } } });
      expect(resolveLook(l, m)).toMatchObject({ issues: [], look: { outfits: { everyday: { ...base, outer: 'jacket' } } } });
    }
    const l = look({ bodyId: 'b_a', outfits: { everyday: { top: 'tee' } } });
    expect(equipGarment(m, l, 'everyday', 'jacket')).toEqual([]);
    expect(l.outfits.everyday).toEqual({ top: 'tee', outer: 'jacket' });
  });
});

describe('hat vs hair feedback', () => {
  it('a hat that excludes the hairstyle switches the hair', () => {
    const s = session();
    s.setModularHair('pony');
    const r = s.setModularGarment('everyday', 'hat', 'beanie');
    expect(stored(s)).toMatchObject({ hairId: 'short' });
    expect(outfit(s).hat).toBe('beanie');
    expect(r.ok && r.note).toBe("Ponytail doesn't fit with Beanie - switched to Short crop.");
    s.undo();
    expect(stored(s).hairId).toBe('pony');
    expect(outfit(s).hat).toBeUndefined();
  });
  it('a hairstyle that excludes the worn hat takes the hat off and says so', () => {
    const s = session();
    s.setModularGarment('everyday', 'hat', 'beanie');
    s.setModularGarment('work', 'hat', 'beanie');
    const r = s.setModularHair('bun');
    expect(stored(s).hairId).toBe('bun');
    expect(outfit(s).hat).toBeUndefined();
    expect(stored(s).outfits.work?.hat).toBeUndefined();
    expect(r.ok && r.note).toBe("Beanie doesn't fit with Bun - taken off.");
  });
  it('a different hat is fine with the hair; equip helpers report the same notes', () => {
    const m = manifest();
    const l = look({ bodyId: 'b_a', hairId: 'pony' });
    expect(equipGarment(m, l, 'everyday', 'cap')).toEqual([]);
    expect(equipGarment(m, l, 'everyday', 'beanie')).toEqual(["Ponytail doesn't fit with Beanie - switched to Short crop."]);
    expect(equipHair(m, l, 'bun')).toEqual(["Beanie doesn't fit with Bun - taken off."]);
    expect(equipFacialHair(m, l, 'moustache')).toEqual([]);
  });
});

describe('tag filters', () => {
  const many = (n: number, tags: (i: number) => string[] | undefined): GarmentDef[] => Array.from({ length: n }, (_, i) => garment(`t${i}`, `T${i}`, 'top', tags(i) ? { tags: tags(i)! } : {}));
  it('only long lists get chips, made of the distinct tags in first-seen order', () => {
    const tags = ['tee', 'shirt', 'sweater'];
    expect(tagFilters(many(FILTER_MIN_ITEMS, (i) => [tags[i % 3]!]))).toEqual([]);
    expect(tagFilters(many(FILTER_MIN_ITEMS + 1, (i) => [tags[i % 3]!, ...(i === 5 ? ['tank'] : [])]))).toEqual(['tee', 'shirt', 'sweater', 'tank']);
    expect(tagFilters(many(30, () => undefined))).toEqual([]);
  });
  it('matchesTag: empty = all, otherwise the garment must carry the tag', () => {
    const g = garment('a', 'A', 'top', { tags: ['tee', 'sport'] });
    expect(matchesTag(g, '')).toBe(true);
    expect(matchesTag(g, 'sport')).toBe(true);
    expect(matchesTag(g, 'shirt')).toBe(false);
    expect(matchesTag(garment('b', 'B', 'top'), 'tee')).toBe(false);
  });
});

describe('runtime: facial hair is a ref-counted part', () => {
  it('loads, recolours with the hair colour, follows morphs, unloads and does not leak', async () => {
    const clips = await loadClips();
    const m = realManifest();
    const base = m.hairstyles.find((h) => h.files[BODY])!;
    m.facialHair = [{ ...base, id: 'fh_test', label: 'Test beard', followsMorphs: ['nose_width'], colorRegions: [] }];
    const cache = testCache();
    const c = new ModularCharacter(cache, m, clips);
    await c.apply(look());
    const refs0 = cache.stats().refs;
    await c.apply(look({ facialHairId: 'fh_test', colors: { skin: '#c68642', eyes: '#5b4636', hair: '#ff8800', garments: {} } }));
    expect(c.equipped().facialHairId).toBe('fh_test');
    expect(c.issues).toEqual([]);
    const part = c.root.getObjectByName('part:fh_test') as import('three').Group;
    expect(part).toBeTruthy();
    const mat = (part.children[0] as import('three').Mesh).material as import('three').MeshStandardMaterial;
    expect(mat.color.getHexString()).toBe('ff8800');
    // hair and facial hair share one GLB here: two references to it
    await c.apply(look({ hairId: base.id, facialHairId: 'fh_test' }));
    await c.apply(look({ hairId: base.id }));
    expect(c.equipped()).toMatchObject({ hairId: base.id, facialHairId: null });
    expect(c.root.getObjectByName('part:fh_test')).toBeUndefined();
    await c.apply(look());
    expect(cache.stats().refs).toBe(refs0);
    // an unknown id is dropped by resolveLook
    await c.apply(look({ facialHairId: 'nope' }));
    expect(c.equipped().facialHairId).toBeNull();
    expect(c.issues.some((i) => i.includes("Unknown facial hair 'nope'"))).toBe(true);
    c.dispose();
    expect(cache.stats()).toMatchObject({ entries: 0, refs: 0 });
  });
});
