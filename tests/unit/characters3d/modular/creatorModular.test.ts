// The creator session's modular (Quaternius) look API, restriction feedback, outfit presets and old saves. Uses a synthetic
// manifest so the tests do not depend on how many parts the shipped manifest has.
import { describe, expect, it } from 'vitest';
import { CreatorSession, setStageBodyAvailability } from '../../../../src/characters/creator';
import { normalizeAppearance } from '../../../../src/characters/names';
import { applyPreset, equipGarment, equipHair, fallbackHair, hairWouldReplace, randomizeLook, wouldReplace } from '../../../../src/characters/modular/equip';
import { deriveModularLook, lookFor, migrateModularLook, resolveLook } from '../../../../src/characters/modular/look';
import { validateManifest } from '../../../../src/characters/modular/manifest';
import { categoryOfSlot } from '../../../../src/characters/modular/types';
import type { GarmentDef, HairstyleDef, ModularLook, ModularManifest, ModularSlot } from '../../../../src/characters/modular/types';
import { Rng, seedRng } from '../../../../src/core/rng';
import { fixtureContent } from '../../characters/fixtures';
import { realManifest } from './helpers';

const rng = (seed = 1) => new Rng(seedRng(seed));
const BOTH = { b_a: 'x.glb', b_b: 'x.glb' };

const garment = (id: string, label: string, slot: ModularSlot, over: Partial<GarmentDef> = {}): GarmentDef => ({
  id, label, category: categoryOfSlot(slot), slot, files: { ...BOTH }, rig: 'r', hides: [], layer: 1, conflicts: [], source: 't', license: 't',
  colorRegions: [{ id: 'main', label: 'Fabric', materials: ['M'], default: '#3f6fa8', palette: ['#3f6fa8', '#c94f4f', '#f2efe6'] }], ...over,
});
const hair = (id: string, label: string, files: Record<string, string> = { ...BOTH }): HairstyleDef => ({
  id, label, files, rig: 'r', attachment: 'skinned', colorRegions: [], source: 't', license: 't',
});

/** Two bodies (one with a morph), 3 hairstyles, tee/hoodie/trousers/dress/jacket, hoodie vs ponytail, two presets. */
function manifest(): ModularManifest {
  return {
    version: 1,
    rigs: [{ id: 'r', label: 'r', joints: ['root'], bindTolerance: 0.002 }] as unknown as ModularManifest['rigs'],
    bodies: [
      { id: 'b_a', label: 'Broad', rig: 'r', file: 'a.glb', skinMaterials: [], morphs: [{ id: 'bulk', label: 'Bulk', target: 'Bulk', range: [0, 1], group: 'body' }], height: 1.8, license: 't', source: 't' },
      { id: 'b_b', label: 'Curvy', rig: 'r', file: 'b.glb', skinMaterials: [], morphs: [], height: 1.75, license: 't', source: 't' },
    ],
    garments: [
      garment('tee', 'Tee', 'top'),
      garment('hoodie', 'Hoodie', 'top'),
      garment('trousers', 'Trousers', 'bottom'),
      garment('dress', 'Dress', 'full'),
      garment('jacket', 'Jacket', 'outer'),
      garment('a_only', 'Broad tee', 'top', { files: { b_a: 'x.glb' } }),
    ],
    hairstyles: [hair('short', 'Short crop'), hair('pony', 'Ponytail'), hair('bob', 'Bob', { b_a: 'x.glb' })],
    restrictions: { parts: { hoodie: ['pony'] } },
    outfitPresets: [
      { id: 'tee_trousers', label: 'Tee and trousers', outfit: { top: 'tee', bottom: 'trousers' } },
      { id: 'hoodie_trousers', label: 'Hoodie and trousers', outfit: { top: 'hoodie', bottom: 'trousers' }, colors: { hoodie: { main: '#c94f4f' } } },
    ],
    defaults: { bodyByFrame: { a: 'b_a', b: 'b_b' }, hairstyle: 'short', outfit: { top: 'tee' }, eyeColor: '#5b4636' },
  };
}

const session = (m: ModularManifest | null = manifest(), seed = 1): CreatorSession => {
  const s = new CreatorSession(fixtureContent(), { rng: rng(seed) });
  s.setModularManifest(m);
  return s;
};
const stored = (s: CreatorSession): ModularLook | undefined => s.current.appearance.modular;

describe('manifest outfit presets', () => {
  it('the synthetic manifest is valid', () => { expect(validateManifest(manifest())).toEqual([]); });
  it('reports unknown garments, slot mismatches, unknown colours and duplicates', () => {
    const m = manifest();
    m.outfitPresets = [
      { id: 'p1', label: 'A', outfit: { top: 'nope' } },
      { id: 'p2', label: 'B', outfit: { top: 'trousers' } },
      { id: 'p3', label: 'C', outfit: { top: 'tee' }, colors: { ghost: { main: '#ffffff' }, tee: { sleeve: '#ffffff' } } },
      { id: 'p3', label: 'D', outfit: {} },
      { id: 'p4', label: 'E', outfit: { cape: 'tee' } as never },
    ];
    const issues = validateManifest(m).join('\n');
    for (const s of ["unknown garment 'nope'", "puts 'trousers' (a bottom) in the top slot", "colours unknown garment 'ghost'", "unknown region 'sleeve'", "Duplicate outfit preset id 'p3'", "'p3' is empty", "unknown slot 'cape'"]) expect(issues).toContain(s);
  });
  it('a manifest without presets stays valid', () => {
    const m = manifest();
    delete m.outfitPresets;
    expect(validateManifest(m)).toEqual([]);
  });
});

describe('CreatorSession modular setters', () => {
  it('refuses modular edits while the style is off, and edits every life stage while it is on', () => {
    const off = session(null);
    expect(off.isModular()).toBe(false);
    expect(off.setModularHair('pony')).toMatchObject({ ok: false });
    expect(off.modularLook()).toBeNull();
    const s = session();
    setStageBodyAvailability(() => true);
    try { expect(s.setLifeStage('child').ok).toBe(true); } finally { setStageBodyAvailability(null); }
    expect(s.isModular()).toBe(true);
    expect(s.modularLook()).not.toBeNull();
    expect(s.setModularHair('pony').ok).toBe(true);
    expect(stored(s)?.hairId).toBe('pony');
  });

  it('materializes the stored look from the derived one on the first edit', () => {
    const s = session();
    expect(stored(s)).toBeUndefined();
    const derived = s.modularLook()!;
    expect(s.setModularHair('pony').ok).toBe(true);
    const l = stored(s)!;
    expect(l.v).toBe(2);
    expect(l.hairId).toBe('pony');
    expect(l.bodyId).toBe(derived.bodyId);
    expect(l.outfits.everyday).toEqual(derived.outfits.everyday);
  });

  it('sets body, hair, garments and garment colours', () => {
    const s = session();
    s.setFrame('a');
    expect(s.setModularGarment('everyday', 'bottom', 'trousers').ok).toBe(true);
    expect(s.setModularGarmentColor('trousers', 'main', '#C94F4F').ok).toBe(true);
    expect(s.setModularHair('bob').ok).toBe(true);
    const l = stored(s)!;
    expect(l.outfits.everyday).toEqual({ top: 'tee', bottom: 'trousers' });
    expect(l.colors.garments.trousers).toEqual({ main: '#c94f4f' });
    expect(l.hairId).toBe('bob');
    expect(s.setModularGarment('everyday', 'bottom', null).ok).toBe(true);
    expect(stored(s)!.outfits.everyday).toEqual({ top: 'tee' });
  });

  it('rejects unknown ids, wrong slots, bad colours, unknown regions and unfitted garments', () => {
    const s = session();
    s.setModularBody('b_b');
    expect(s.setModularHair('zzz')).toMatchObject({ ok: false });
    expect(s.setModularBody('zzz')).toMatchObject({ ok: false });
    expect(s.setModularGarment('everyday', 'top', 'trousers')).toMatchObject({ ok: false });
    expect(s.setModularGarment('everyday', 'top', 'a_only')).toMatchObject({ ok: false, reason: expect.stringContaining('not available for this body') });
    expect(s.setModularHair('bob')).toMatchObject({ ok: false });
    expect(s.setModularGarmentColor('tee', 'main', 'red')).toMatchObject({ ok: false });
    expect(s.setModularGarmentColor('tee', 'sleeve', '#ffffff')).toMatchObject({ ok: false });
    expect(s.setModularGarmentColor('zzz', 'main', '#ffffff')).toMatchObject({ ok: false });
  });

  it('keeps categories apart: a category without an outfit starts from everyday when edited', () => {
    const s = session();
    s.setModularGarment('formal', 'bottom', 'trousers');
    const l = stored(s)!;
    expect(l.outfits.formal).toEqual({ top: 'tee', bottom: 'trousers' });
    expect(l.outfits.everyday).toEqual({ top: 'tee' });
  });

  it('morph sliders only exist for morphs the body declares, clamp, and merge into one undo step', () => {
    const s = session();
    s.setFrame('a');
    expect(s.setModularMorph('bulk', 5).ok).toBe(true);
    expect(stored(s)!.morphs.bulk).toBe(1);
    expect(s.setModularMorph('bulk', 0.4).ok).toBe(true);
    expect(s.setModularMorph('bulk', 0.5).ok).toBe(true);
    expect(stored(s)!.morphs.bulk).toBe(0.5);
    s.endEdit();
    expect(s.undo()).toBe('Bulk');
    expect(stored(s)).toBeUndefined();
    s.setModularBody('b_b');
    expect(s.setModularMorph('bulk', 0.2)).toMatchObject({ ok: false });
    expect(s.setModularMorph('bulk', Number.NaN)).toMatchObject({ ok: false });
  });

  it('every modular edit is undoable and redoable (Cancel in the wardrobe discards the whole session the same way)', () => {
    const s = session();
    const before = JSON.stringify(s.current.appearance);
    s.setModularHair('pony');
    s.setModularGarment('everyday', 'bottom', 'trousers');
    s.setModularGarmentColor('tee', 'main', '#c94f4f');
    s.setModularBody('b_b');
    s.applyOutfitPreset('hoodie_trousers');
    const after = JSON.stringify(s.current.appearance);
    expect(after).not.toBe(before);
    let n = 0;
    while (s.canUndo()) { s.undo(); n++; }
    expect(n).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(s.current.appearance)).toBe(before);
    while (s.canRedo()) s.redo();
    expect(JSON.stringify(s.current.appearance)).toBe(after);
  });
});

describe('shared colours: the classic appearance is the source of truth', () => {
  it('skin, eye and hair colour changes follow into a stored look, and only then', () => {
    const s = session();
    s.setSkin('#aa7755');
    expect(stored(s)).toBeUndefined();
    s.setModularHair('pony');
    s.setSkin('#aa7755');
    s.setEyeColor('#228855');
    s.setHairColor('#112233');
    expect(stored(s)!.colors).toMatchObject({ skin: '#aa7755', eyes: '#228855', hair: '#112233' });
    s.undo();
    expect(stored(s)!.colors.hair).toBe(s.current.appearance.hair.color);
    expect(stored(s)!.colors.hair).not.toBe('#112233');
  });
  it('a materialized look takes the colours from the appearance, not the other way round', () => {
    const s = session();
    s.setHairColor('#334455');
    s.setModularGarment('everyday', 'bottom', 'trousers');
    expect(stored(s)!.colors.hair).toBe('#334455');
    expect(s.current.appearance.hair.color).toBe('#334455');
  });
});

describe('body and frame stay together', () => {
  it('choosing a body sets the matching frame, and the frame sets the body of a stored look', () => {
    const s = session();
    s.setFrame('a');
    s.setModularBody('b_b');
    expect(s.current.appearance.frame).toBe('b');
    expect(stored(s)!.bodyId).toBe('b_b');
    s.setFrame('a');
    expect(stored(s)!.bodyId).toBe('b_a');
  });
  it('the derived look of an untouched person follows the frame', () => {
    const s = session();
    s.setFrame('b');
    expect(s.modularLook()!.bodyId).toBe('b_b');
    s.setFrame('a');
    expect(s.modularLook()!.bodyId).toBe('b_a');
  });
  it('parts that do not fit the new body are taken off and the note says so', () => {
    const s = session();
    s.setFrame('a');
    s.setModularGarment('everyday', 'top', 'a_only');
    s.setModularHair('bob');
    const r = s.setModularBody('b_b');
    expect(r).toMatchObject({ ok: true });
    expect('note' in r && r.note).toMatch(/Broad tee, Bob aren't available for Curvy - taken off\. Hair switched to Short crop\./);
    const l = stored(s)!;
    expect(l.outfits.everyday?.top).toBeUndefined();
    expect(l.hairId).toBe('short');
  });
  it('morphs are cleared when the body changes', () => {
    const s = session();
    s.setFrame('a');
    s.setModularMorph('bulk', 0.7);
    s.setModularBody('b_b');
    expect(stored(s)!.morphs).toEqual({});
  });
});

describe('restriction feedback', () => {
  it('equipping a garment that does not fit the hairstyle swaps the hair and says why', () => {
    const s = session();
    s.setModularHair('pony');
    const r = s.setModularGarment('everyday', 'top', 'hoodie');
    expect(r).toEqual({ ok: true, note: "Ponytail doesn't fit with Hoodie - switched to Short crop." });
    const l = stored(s)!;
    expect(l.outfits.everyday?.top).toBe('hoodie');
    expect(l.hairId).toBe('short');
  });
  it('choosing a hairstyle that does not fit a worn garment takes the garment off and says why', () => {
    const s = session();
    s.setModularGarment('everyday', 'top', 'hoodie');
    s.setModularGarment('work', 'top', 'hoodie');
    const r = s.setModularHair('pony');
    expect(r).toEqual({ ok: true, note: "Hoodie doesn't fit with Ponytail - taken off." });
    const l = stored(s)!;
    expect(l.hairId).toBe('pony');
    expect(l.outfits.everyday?.top).toBeUndefined();
    expect(l.outfits.work?.top).toBeUndefined();
  });
  it('a one-piece replaces top and bottom, and top or bottom replace a one-piece', () => {
    const s = session();
    s.setModularGarment('everyday', 'bottom', 'trousers');
    const r = s.setModularGarment('everyday', 'full', 'dress');
    expect(r).toMatchObject({ ok: true });
    expect('note' in r && r.note).toBe("Tee doesn't fit with Dress - taken off. Trousers doesn't fit with Dress - taken off.");
    expect(stored(s)!.outfits.everyday).toEqual({ full: 'dress' });
    const r2 = s.setModularGarment('everyday', 'top', 'tee');
    expect('note' in r2 && r2.note).toBe("Dress doesn't fit with Tee - taken off.");
    expect(stored(s)!.outfits.everyday).toEqual({ top: 'tee' });
  });
  it('replacing the garment of a slot is not a conflict', () => {
    const s = session();
    const r = s.setModularGarment('everyday', 'top', 'hoodie');
    expect(r).toEqual({ ok: true });
  });
  it('the hint helpers name what would be replaced', () => {
    const m = manifest();
    const look = deriveModularLook(session().current.appearance, m);
    look.hairId = 'pony';
    expect(wouldReplace(m, look, 'everyday', 'hoodie')).toEqual(['Ponytail']);
    expect(wouldReplace(m, look, 'everyday', 'tee')).toEqual([]);
    look.outfits.everyday = { top: 'hoodie' };
    look.hairId = 'short';
    expect(hairWouldReplace(m, look, 'pony')).toEqual(['Hoodie']);
    expect(hairWouldReplace(m, look, 'short')).toEqual([]);
    look.outfits.everyday = { top: 'tee', bottom: 'trousers' };
    expect(wouldReplace(m, look, 'everyday', 'dress')).toEqual(['Tee', 'Trousers']);
  });
  it('with no fitting hairstyle left the hair is removed', () => {
    const m = manifest();
    m.hairstyles = [hair('pony', 'Ponytail')];
    m.defaults.hairstyle = 'pony';
    const look: ModularLook = { ...deriveModularLook(session(m).current.appearance, m), hairId: 'pony' };
    const notes = equipGarment(m, look, 'everyday', 'hoodie');
    expect(notes).toEqual(["Ponytail doesn't fit with Hoodie - removed."]);
    expect(look.hairId).toBeNull();
    expect(fallbackHair(m, look)).toBeNull();
  });
});

describe('outfit presets', () => {
  it('applies a preset to a category: garments and colours, replacing what was worn', () => {
    const s = session();
    s.setModularGarment('everyday', 'outer', 'jacket');
    expect(s.applyOutfitPreset('hoodie_trousers').ok).toBe(true);
    const l = stored(s)!;
    expect(l.outfits.everyday).toEqual({ top: 'hoodie', bottom: 'trousers' });
    expect(l.colors.garments.hoodie).toEqual({ main: '#c94f4f' });
  });
  it('a preset that does not fit the hairstyle swaps the hair with a note', () => {
    const s = session();
    s.setModularHair('pony');
    const r = s.applyOutfitPreset('hoodie_trousers');
    expect('note' in r && r.note).toBe("Ponytail doesn't fit with Hoodie - switched to Short crop.");
    expect(stored(s)!.hairId).toBe('short');
  });
  it('skips parts that are not fitted to the body', () => {
    const m = manifest();
    m.outfitPresets = [{ id: 'p', label: 'P', outfit: { top: 'a_only', bottom: 'trousers' } }];
    const s = session(m);
    s.setFrame('b');
    s.setModularBody('b_b');
    const r = s.applyOutfitPreset('p');
    expect('note' in r && r.note).toBe("Broad tee isn't available for this body.");
    expect(stored(s)!.outfits.everyday).toEqual({ bottom: 'trousers' });
  });
  it('unknown presets and a missing manifest fail cleanly', () => {
    expect(session().applyOutfitPreset('nope')).toMatchObject({ ok: false });
    expect(session(null).applyOutfitPreset('tee_trousers')).toMatchObject({ ok: false });
    expect(applyPreset(manifest(), deriveModularLook(session().current.appearance, manifest()), 'everyday', 'nope')).toBeNull();
  });
});

describe('randomize and reset produce valid looks', () => {
  const valid = (s: CreatorSession): void => {
    const l = stored(s);
    expect(l).toBeDefined();
    const res = resolveLook(l!, s.modularManifest!);
    expect(res.issues).toEqual([]);
    expect(res.look).toEqual(l);
    expect(migrateModularLook(JSON.parse(JSON.stringify(l)))).toEqual(l);
    expect(l!.colors).toMatchObject({ skin: s.current.appearance.skin, eyes: s.current.appearance.face.eyeColor, hair: s.current.appearance.hair.color });
    expect(l!.bodyId).toBe(s.modularManifest!.defaults.bodyByFrame[s.current.appearance.frame]);
  };
  it('randomize all, 60 seeds: always a look the manifest can draw', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = session(manifest(), seed);
      expect(s.randomizeAll().ok).toBe(true);
      valid(s);
      expect(s.randomize('clothing').ok).toBe(true);
      valid(s);
      expect(s.randomize('hair').ok).toBe(true);
      valid(s);
      expect(s.randomize('body').ok).toBe(true);
      valid(s);
    }
  });
  it('randomizing a category leaves the others as they were', () => {
    const s = session(manifest(), 4);
    s.setModularGarment('everyday', 'bottom', 'trousers');
    const before = stored(s)!;
    s.randomize('hair');
    expect(stored(s)!.outfits).toEqual(before.outfits);
    const hairBefore = stored(s)!.hairId;
    s.randomize('clothing');
    expect(stored(s)!.hairId).toBe(hairBefore);
  });
  it('randomizeLook never throws on an empty catalog', () => {
    const m = manifest();
    m.garments = []; m.hairstyles = []; m.outfitPresets = [];
    m.defaults.outfit = {}; m.defaults.hairstyle = null;
    const look = deriveModularLook(session(m).current.appearance, m);
    expect(() => randomizeLook(m, look, rng(3), { body: true, hair: true, clothing: true })).not.toThrow();
    expect(look.hairId).toBeNull();
  });
  it('locked categories are kept', () => {
    const s = session(manifest(), 9);
    s.setModularHair('pony');
    s.setLocked('hair', true);
    s.randomizeAll();
    expect(stored(s)!.hairId).toBe('pony');
  });
  it('reset puts the category back to what the manifest derives', () => {
    const s = session();
    s.setFrame('a');
    s.setModularHair('pony');
    s.setModularGarment('everyday', 'bottom', 'trousers');
    s.setModularMorph('bulk', 0.6);
    s.resetCategory('hair');
    expect(stored(s)!.hairId).toBe('short');
    expect(stored(s)!.outfits.everyday).toEqual({ top: 'tee', bottom: 'trousers' });
    s.resetCategory('clothing');
    expect(stored(s)!.outfits.everyday).toEqual({ top: 'tee' });
    s.resetCategory('body');
    expect(stored(s)!.morphs).toEqual({});
    expect(stored(s)!.bodyId).toBe('b_a');
  });
  it('reset does nothing to a person who has no stored look', () => {
    const s = session();
    s.resetCategory('hair');
    s.resetCategory('clothing');
    expect(stored(s)).toBeUndefined();
  });
});

describe('old saves and templates', () => {
  it('a person without `modular` keeps the derived look and nothing is written until an edit', () => {
    const s = session();
    const a = s.current.appearance;
    expect(a.modular).toBeUndefined();
    const l = lookFor(a, manifest());
    expect(l.bodyId).toBe(manifest().defaults.bodyByFrame[a.frame]);
    s.setFirstName('Zed');
    s.setSkin('#aa7755');
    expect(s.current.appearance.modular).toBeUndefined();
    expect(JSON.stringify(s.finalDraft())).not.toContain('"modular"');
  });
  it('an unreadable stored look falls back to the derived one and is replaced by the first edit', () => {
    const s = session();
    (s.current.appearance as { modular?: unknown }).modular = { v: 9 };
    const l = s.modularLook()!;
    expect(l.bodyId).toBe(manifest().defaults.bodyByFrame[s.current.appearance.frame]);
    expect(s.setModularHair('pony').ok).toBe(true);
    expect(stored(s)!.v).toBe(2);
  });
  it('a stored look that names things the manifest no longer has is repaired by the next edit', () => {
    const s = session();
    s.setModularHair('pony');
    const l = stored(s)!;
    l.outfits.everyday = { top: 'ghost_top', bottom: 'trousers' };
    l.hairId = 'ghost_hair';
    s.setModularGarmentColor('tee', 'main', '#c94f4f');
    expect(stored(s)!.hairId).toBeNull();
    expect(stored(s)!.outfits.everyday).toEqual({ bottom: 'trousers' });
  });
  it('appearance import keeps a valid modular look and drops a broken one with a note', () => {
    const s = session();
    s.setModularHair('pony');
    const notes: string[] = [];
    const kept = normalizeAppearance(JSON.parse(JSON.stringify(s.current.appearance)), fixtureContent(), (m) => notes.push(m));
    expect(kept.modular).toEqual(stored(s));
    const dropped = normalizeAppearance({ ...JSON.parse(JSON.stringify(s.current.appearance)), modular: { v: 1, bodyId: 5 } }, fixtureContent(), (m) => notes.push(m));
    expect(dropped.modular).toBeUndefined();
    expect(notes.join('|')).toContain('modular look could not be read');
  });
  it('copy and paste appearance carries the modular look; the colours stay in step', () => {
    const s = session();
    s.setModularHair('pony');
    s.copyAppearance();
    s.addMember({ blank: true });
    s.pasteAppearance();
    expect(stored(s)!.hairId).toBe('pony');
    expect(stored(s)!.colors.skin).toBe(s.current.appearance.skin);
  });
  it('equipHair and equipGarment ignore unknown ids', () => {
    const m = manifest();
    const look = deriveModularLook(session().current.appearance, m);
    const before = JSON.stringify(look);
    expect(equipHair(m, look, 'ghost')).toEqual([]);
    expect(equipGarment(m, look, 'everyday', 'ghost')).toEqual([]);
    expect(JSON.stringify(look)).toBe(before);
  });
});

describe('morph sliders of the shipped manifest', () => {
  it('every declared morph can be set, clamps to its range, persists in the final draft and is cleared by a body change', () => {
    const real = realManifest();
    const s = session(real);
    s.setFrame('a');
    const body = real.bodies.find((b) => b.id === real.defaults.bodyByFrame.a)!;
    for (const mo of body.morphs) {
      expect(s.setModularMorph(mo.id, mo.range[1] + 5).ok).toBe(true);
      expect(stored(s)!.morphs[mo.id]).toBe(mo.range[1]);
      expect(s.setModularMorph(mo.id, mo.range[0] - 5).ok).toBe(true);
      expect(stored(s)!.morphs[mo.id]).toBe(mo.range[0]);
      const mid = Math.round(((mo.range[0] + mo.range[1]) / 2 + 0.1) * 100) / 100;
      s.setModularMorph(mo.id, mid);
      s.endEdit();
      expect(s.finalDraft().members[0]!.appearance.modular!.morphs[mo.id]).toBe(mid);
    }
    if (body.morphs.length > 0) {
      s.setModularBody(real.defaults.bodyByFrame.b);
      expect(stored(s)!.morphs).toEqual({});
    }
  });
});
