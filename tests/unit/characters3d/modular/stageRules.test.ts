// Which catalog parts each life stage may wear, the derived looks of every stage, and the stage-aware resolveLook.
import { describe, expect, it } from 'vitest';
import type { Appearance, LifeStage } from '../../../../src/core/types';
import { facialHairFor, findGarment, garmentsFor, hairFor } from '../../../../src/characters/modular/manifest';
import { deriveModularLook, lookFor, resolveLook } from '../../../../src/characters/modular/look';
import { partAllowedForStage } from '../../../../src/characters/modular/stageRules';
import { ACCESSORY_SLOTS, MODULAR_SLOTS } from '../../../../src/characters/modular/types';
import { look, realManifest } from './helpers';

const m = realManifest();
const STAGES: LifeStage[] = ['baby', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'];
const app = (frame: 'a' | 'b'): Appearance => ({ frame, skin: '#c68642', hair: { color: '#442211' }, face: { eyeColor: '#336699' } } as unknown as Appearance);

describe('stage part rules', () => {
  it('give facial hair to young adults and older only', () => {
    for (const stage of STAGES) {
      const n = facialHairFor(m, 'ubc_male', stage).length;
      if (stage === 'youngAdult' || stage === 'adult' || stage === 'elder') expect(n).toBe(m.facialHair!.length);
      else expect(n, stage).toBe(0);
    }
  });

  it('keep babies free of accessories and shoes, and children to age-appropriate kinds', () => {
    for (const slot of ACCESSORY_SLOTS) expect(garmentsFor(m, 'ubc_male', slot, 'baby'), `baby ${slot}`).toEqual([]);
    expect(garmentsFor(m, 'ubc_male', 'shoes', 'baby')).toEqual([]);
    const toddlerAcc = ACCESSORY_SLOTS.flatMap((s) => garmentsFor(m, 'ubc_male', s, 'toddler').map((g) => g.id));
    expect(toddlerAcc.length).toBeGreaterThan(0);
    for (const id of toddlerAcc) expect(['beanie', 'sun_hat', 'bucket_hat', 'cap_baseball', 'headband', 'scarf']).toContain(id);
    const childIds = MODULAR_SLOTS.flatMap((s) => garmentsFor(m, 'ubc_female', s, 'child').map((g) => g.id));
    for (const bad of ['tube_top', 'cocktail_dress', 'hot_pants', 'pearls', 'earrings_hoop', 'sunglasses_aviator']) expect(childIds).not.toContain(bad);
    for (const ok of ['tshirt_crew', 'trousers_straight', 'sneakers_low', 'backpack', 'beanie']) expect(childIds).toContain(ok);
  });

  it('leave a grown-up the whole catalog', () => {
    for (const stage of ['youngAdult', 'adult', 'elder'] as const) {
      expect(garmentsFor(m, 'ubc_male', undefined, stage).length).toBe(garmentsFor(m, 'ubc_male').length);
      expect(hairFor(m, 'ubc_female', stage).length).toBe(hairFor(m, 'ubc_female').length);
    }
  });

  it('offer every young stage a top, a bottom, a one-piece and hair to choose from', () => {
    for (const stage of ['baby', 'toddler', 'child', 'teen'] as const) {
      for (const body of ['ubc_male', 'ubc_female']) {
        expect(garmentsFor(m, body, 'top', stage).length, `${stage} top`).toBeGreaterThan(2);
        expect(garmentsFor(m, body, 'bottom', stage).length, `${stage} bottom`).toBeGreaterThan(2);
        expect(garmentsFor(m, body, 'full', stage).length, `${stage} full`).toBeGreaterThan(0);
        expect(hairFor(m, body, stage).length, `${stage} hair`).toBeGreaterThan(3);
      }
    }
  });

  it('every unknown id is allowed for a grown-up and refused facial hair for a child', () => {
    expect(partAllowedForStage('garment', 'whatever', 'adult')).toBe(true);
    expect(partAllowedForStage('facial', 'stubble', 'teen')).toBe(false);
    expect(partAllowedForStage('facial', 'stubble', undefined)).toBe(true);
  });
});

describe('derived looks of every stage', () => {
  it('are complete, drawable without changes, and small and simple for babies and toddlers', () => {
    for (const stage of STAGES) {
      for (const frame of ['a', 'b'] as const) {
        const l = deriveModularLook(app(frame), m, undefined, stage);
        const res = resolveLook(l, m, stage);
        expect(res.issues, `${stage} ${frame}`).toEqual([]);
        expect(res.look).toEqual(l);
        const o = l.outfits.everyday!;
        expect(!!o.full || (!!o.top && !!o.bottom), `${stage} ${frame} covered`).toBe(true);
        expect(l.hairId, `${stage} hair`).not.toBeNull();
        expect(l.facialHairId).toBeNull();
        // the look the game draws for a person without a stored one
        expect(lookFor(app(frame), m, undefined, stage)).toEqual(l);
      }
    }
    expect(deriveModularLook(app('a'), m, undefined, 'baby').outfits.everyday).toEqual({ top: 'tshirt_crew', bottom: 'trousers_straight' });
    const toddler = deriveModularLook(app('b'), m, undefined, 'toddler').outfits.everyday!;
    expect(toddler.top).toBe('tshirt_crew');
    expect(toddler.bottom).toBe('shorts_mid');
    // grown-ups keep the manifest defaults
    expect(deriveModularLook(app('a'), m).outfits.everyday).toEqual({ top: 'tshirt_crew', bottom: 'trousers_straight' });
  });

  it('use the colours of the classic appearance', () => {
    const l = deriveModularLook(app('b'), m, undefined, 'child');
    expect(l.colors.skin).toBe('#c68642');
    expect(l.colors.hair).toBe('#442211');
    expect(l.colors.eyes).toBe('#336699');
  });
});

describe('resolveLook with a life stage', () => {
  it('takes facial hair, accessories and adult cuts off a child and keeps the child dressed', () => {
    const l = look({ bodyId: 'ubc_female', hairId: 'mullet', facialHairId: 'stubble', outfits: { everyday: { top: 'tube_top', bottom: 'hot_pants', shoes: 'court_shoes', neck: 'pearls', hat: 'beanie' } } });
    const { look: out, issues } = resolveLook(l, m, 'child');
    expect(out.facialHairId).toBeNull();
    expect(out.hairId).not.toBe('mullet');
    expect(findGarment(m, out.outfits.everyday!.top!)).toBeDefined();
    expect(out.outfits.everyday).toMatchObject({ top: expect.any(String), bottom: expect.any(String), hat: 'beanie' });
    expect(out.outfits.everyday!.neck).toBeUndefined();
    expect(out.outfits.everyday!.shoes).toBeUndefined();
    expect(issues.length).toBeGreaterThan(3);
    // the same look on an adult is unchanged
    expect(resolveLook(l, m, 'adult').look.facialHairId).toBe('stubble');
    expect(resolveLook(l, m).look.outfits.everyday!.top).toBe('tube_top');
  });

  it('dresses a baby in the plain baby set when its look names anything else', () => {
    const l = look({ outfits: { everyday: { top: 'blazer_missing', full: 'gown' } } });
    const { look: out } = resolveLook(l, m, 'baby');
    expect(out.outfits.everyday).toEqual({ top: 'tshirt_crew', bottom: 'trousers_straight' });
  });
});
