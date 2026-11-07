import { describe, expect, it } from 'vitest';
import { deriveModularLook, lookFor, migrateModularLook, outfitFor, resolveLook } from '../../../../src/characters/modular/look';
import { garmentsFor, hairFor, findBody, validateManifest } from '../../../../src/characters/modular/manifest';
import type { Appearance } from '../../../../src/core/types';
import type { GarmentDef } from '../../../../src/characters/modular/types';
import { BODY, look, realManifest, shellGarment, testManifest } from './helpers';

const appearance = (frame: 'a' | 'b' = 'a'): Appearance => ({
  frame, skin: '#b07a55', body: {}, bodyPresetId: null,
  face: { presetId: null, params: {}, eyeColor: '#336655', browStyle: 'x', browColor: '#111111', freckles: 0, blush: 0, lipTint: 0, lipColor: '#aa5555' },
  hair: { styleId: 'h', color: '#774411', highlight: null, facialHairId: null },
});

describe('manifest', () => {
  it('the real manifest validates', () => { expect(validateManifest(realManifest())).toEqual([]); });
  it('reports broken manifests', () => {
    const m = testManifest();
    m.garments.push({ ...shellGarment(), id: 'shell_top', files: { nobody: 'x.glb' }, rig: 'zzz', slot: 'hat' as never, hides: ['wing' as never] });
    m.garments[1]!.colorRegions = [...m.garments[0]!.colorRegions, ...m.garments[0]!.colorRegions];
    const issues = validateManifest(m).join('\n');
    for (const s of ['Duplicate garment', "unknown rig 'zzz'", "unknown slot 'hat'", "unknown body region 'wing'", "unknown body 'nobody'", 'duplicate color region']) expect(issues).toContain(s);
  });
  it('looks things up', () => {
    const m = testManifest();
    expect(findBody(m, BODY)?.id).toBe(BODY);
    // testManifest() = the real manifest plus the test-only shell top
    expect(garmentsFor(m, BODY, 'top').map((g) => g.id).sort()).toEqual(['shell_top', 'tshirt_crew']);
    expect(garmentsFor(m, BODY, 'bottom')).toEqual([]);
    expect(garmentsFor(m, 'ubc_female').map((g) => g.id)).not.toContain('shell_top');
    expect(hairFor(m, BODY).map((h) => h.id)).toEqual(['short_crop']);
  });
});

describe('migrateModularLook', () => {
  it('accepts v1 and returns a clean copy', () => {
    const raw = { ...look({ outfits: { everyday: { top: 'a' } } }), extra: 1 };
    const out = migrateModularLook(JSON.parse(JSON.stringify(raw)));
    expect(out).toEqual(look({ outfits: { everyday: { top: 'a' } } }));
    expect(out).not.toHaveProperty('extra');
  });
  it('returns null for anything unparseable', () => {
    for (const bad of [null, 1, 'x', [], {}, { v: 2 }, { ...look(), v: 0 }, { ...look(), bodyId: '' }, { ...look(), colors: { skin: 'red' } }, { ...look(), morphs: { a: 'x' } }, { ...look(), outfits: { everyday: { top: 3 } } }]) {
      expect(migrateModularLook(bad)).toBeNull();
    }
  });
});

describe('deriveModularLook', () => {
  it('uses the manifest defaults and the classic colors', () => {
    const m = testManifest();
    m.defaults.outfit = { top: 'shell_top' };
    const l = deriveModularLook(appearance('b'), m);
    expect(l).toMatchObject({ v: 1, bodyId: 'ubc_female', hairId: m.defaults.hairstyle, morphs: {}, colors: { skin: '#b07a55', hair: '#774411', eyes: '#336655' } });
    expect(l.outfits.everyday).toEqual({}); // shell_top is only fitted to the male body
    expect(deriveModularLook(appearance('a'), m).outfits.everyday).toEqual({ top: 'shell_top' });
  });
  it('lookFor prefers a readable stored look', () => {
    const m = testManifest();
    const a = { ...appearance(), modular: look({ colors: { skin: '#010101', eyes: '#020202', hair: '#030303', garments: {} } }) };
    expect(lookFor(a, m).colors.skin).toBe('#010101');
    expect(lookFor({ ...a, modular: { v: 9 } as never }, m).colors.skin).toBe('#b07a55');
  });
});

describe('resolveLook', () => {
  const second: GarmentDef = { ...shellGarment(), id: 'dress', slot: 'full', category: 'full' };
  const m = () => { const x = testManifest(); x.garments.push(second); return x; };
  it('keeps a valid look untouched', () => {
    const l = look({ outfits: { everyday: { top: 'shell_top' } } });
    expect(resolveLook(l, m())).toEqual({ look: l, issues: [] });
  });
  it('drops unknown and unfitted things', () => {
    const l = look({ bodyId: 'ubc_female', hairId: 'nope', outfits: { everyday: { top: 'shell_top', bottom: 'ghost' } } });
    const r = resolveLook(l, m());
    expect(r.look.outfits.everyday).toEqual({});
    expect(r.look.hairId).toBeNull();
    expect(r.issues.length).toBe(3);
    expect(l.outfits.everyday).toEqual({ top: 'shell_top', bottom: 'ghost' }); // input untouched
  });
  it('replaces an unknown body and drops wrong-slot and conflicting garments', () => {
    const r = resolveLook(look({ bodyId: 'zzz', outfits: { everyday: { top: 'dress', full: 'dress' }, work: { full: 'dress', top: 'shell_top' } } }), m());
    expect(r.look.bodyId).toBe(BODY);
    expect(r.look.outfits.everyday).toEqual({ full: 'dress' });
    expect(r.look.outfits.work).toEqual({ full: 'dress' });
    expect(r.issues.join(' ')).toContain("Unknown body 'zzz'");
  });
  it('outfitFor falls back to everyday', () => {
    const l = look({ outfits: { everyday: { top: 'a' }, formal: { top: 'b' } } });
    expect(outfitFor(l, 'formal')).toEqual({ top: 'b' });
    expect(outfitFor(l, 'swim')).toEqual({ top: 'a' });
    expect(outfitFor(look(), 'swim')).toEqual({});
  });
});
