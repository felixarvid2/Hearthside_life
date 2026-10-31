import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_TEMPLATE_FORMAT, exportAppearance, exportHouseholdTemplate, HOUSEHOLD_TEMPLATE_FORMAT, importAppearance,
  importHouseholdTemplate, premadeHouseholds, randomPersonDraft, TEMPLATE_VERSION,
} from '../../../src/characters/creator';
import type { HouseholdDraft } from '../../../src/core/drafts';
import { Rng, seedRng } from '../../../src/core/rng';
import { fixtureContent } from './fixtures';

const content = fixtureContent();

describe('appearance presets', () => {
  it('round-trips appearance and outfits exactly', () => {
    const p = randomPersonDraft(new Rng(seedRng(31)), content);
    const json = exportAppearance(p);
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe(APPEARANCE_TEMPLATE_FORMAT);
    expect(parsed.version).toBe(TEMPLATE_VERSION);
    const r = importAppearance(json, content);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.substitutions).toEqual([]);
    expect(r.appearance).toEqual(p.appearance);
    expect(r.outfits).toEqual(p.outfits);
    expect(r.name).toBe(`${p.firstName} ${p.lastName}`);
    const noOutfits = importAppearance(exportAppearance(p, { includeOutfits: false }), content);
    expect(noOutfits.ok && noOutfits.outfits).toBeNull();
  });

  it('substitutes missing assets in the returned data only, listing each substitution', () => {
    const p = randomPersonDraft(new Rng(seedRng(32)), content);
    const t = JSON.parse(exportAppearance(p));
    t.appearance.hair.styleId = 'pack-mohawk';
    t.appearance.hair.facialHairId = 'pack-goatee';
    t.appearance.face.presetId = 'pack-face';
    t.appearance.face.browStyle = 'pack-brow';
    t.appearance.face.params.horn = 0.5;
    t.appearance.face.params.jaw = 4;
    t.appearance.bodyPresetId = 'pack-body';
    t.appearance.skin = 'green-ish';
    t.outfits.outfits.everyday[0].layers = {
      top: { garmentId: 'pack-kimono-top', color: '#aa0000', pattern: 'stripes', patternColor: '#000000' },
      bottom: { garmentId: 'jeans', color: '#112233', pattern: 'pack-paisley', patternColor: '#000000' },
      shoes: { garmentId: 'sneakers', color: '#ffffff', pattern: 'solid', patternColor: '#000000' },
    };
    t.outfits.outfits.everyday[0].accessories = [{ accessoryId: 'pack-tiara', color: '#ffffff' }, { accessoryId: 'watch', color: '#222222' }];
    const frozen = JSON.stringify(t);
    const r = importAppearance(t, content);
    expect(JSON.stringify(t)).toBe(frozen); // input untouched
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.appearance;
    expect(a.hair.styleId).toBe('short-curls'); // default: first ready short style
    expect(a.hair.facialHairId).toBeNull();
    expect(a.face.presetId).toBeNull();
    expect(a.face.browStyle).toBe('straight');
    expect(a.face.params.horn).toBeUndefined();
    expect(a.face.params.jaw).toBe(1);
    expect(a.bodyPresetId).toBeNull();
    expect(a.skin).toMatch(/^#[0-9a-f]{6}$/);
    const ev = r.outfits!.outfits.everyday[0]!;
    expect(ev.layers.top).toMatchObject({ garmentId: 'tee', color: '#aa0000', pattern: 'stripes' }); // tee allows stripes
    expect(ev.layers.bottom).toMatchObject({ garmentId: 'jeans', pattern: 'solid' });
    expect(ev.accessories.map((x) => x.accessoryId)).toEqual(['watch']);
    const subs = r.substitutions.join('\n');
    for (const id of ['pack-mohawk', 'pack-goatee', 'pack-face', 'pack-brow', 'horn', 'jaw', 'pack-body', 'Skin', 'pack-kimono-top', 'pack-paisley', 'pack-tiara']) {
      expect(subs, id).toContain(id);
    }
    expect(subs).toContain('using tee instead');
  });

  it('rejects broken, foreign, future and mismatched files with clear errors', () => {
    expect(importAppearance('{not json', content)).toEqual({ ok: false, error: 'The file is not valid JSON.' });
    expect(importAppearance('{"hello":1}', content)).toEqual({ ok: false, error: 'This file is not a Hearthside Life template.' });
    const future = { format: APPEARANCE_TEMPLATE_FORMAT, version: TEMPLATE_VERSION + 1, appearance: {} };
    expect(importAppearance(future, content)).toEqual({ ok: false, error: 'The template was made with a newer version of Hearthside Life.' });
    expect(importAppearance({ format: APPEARANCE_TEMPLATE_FORMAT, appearance: {} }, content).ok).toBe(false);
    const household = exportHouseholdTemplate(premadeHouseholds(content)[0]!);
    expect(importAppearance(household, content)).toEqual({ ok: false, error: 'This file is a household template, not an appearance preset.' });
  });
});

describe('household templates', () => {
  it('round-trips a household exactly', () => {
    for (const draft of premadeHouseholds(content)) {
      const json = exportHouseholdTemplate(draft);
      expect(JSON.parse(json).format).toBe(HOUSEHOLD_TEMPLATE_FORMAT);
      const r = importHouseholdTemplate(json, content);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.draft).toEqual(draft);
      expect(r.substitutions).toEqual([]);
      expect(r.issues).toEqual([]);
    }
  });

  it('substitutes missing content ids and drops invalid ties', () => {
    const draft: HouseholdDraft = JSON.parse(JSON.stringify(premadeHouseholds(content)[2]));
    const m = draft.members[0]!;
    m.traits = ['neat', 'pack-vampiric', 'creative'];
    m.aspirationId = 'pack-aspiration';
    m.careerId = 'pack-career';
    m.likes = ['music:jazz', 'pack:opera'];
    m.voice.preset = 'pack-voice';
    m.walkStyle = 'pack-strut';
    m.appearance.hair.styleId = 'pack-hair';
    draft.ties.push({ a: 0, b: 7, tie: 'sibling' }, { a: 1, b: 0, tie: 'cousin' as never });
    const r = importHouseholdTemplate(JSON.stringify({ format: HOUSEHOLD_TEMPLATE_FORMAT, version: 1, name: 'x', household: draft }), content);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = r.draft.members[0]!;
    expect(out.traits).toEqual(['neat', 'creative']);
    expect(out.aspirationId).toBeNull();
    expect(out.careerId).toBeNull();
    expect(out.likes).toEqual(['music:jazz']);
    expect(out.voice.preset).toBe('warm');
    expect(out.walkStyle).toBe('easy');
    expect(out.appearance.hair.styleId).toBe('short-curls');
    expect(r.draft.ties).toEqual([{ a: 0, b: 1, tie: 'spouse' }]);
    const subs = r.substitutions.join('\n');
    for (const id of ['pack-vampiric', 'pack-aspiration', 'pack-career', 'pack:opera', 'pack-voice', 'pack-strut', 'pack-hair', '2 relationships']) {
      expect(subs, id).toContain(id);
    }
    expect(subs).toContain('Ines Moreau:');
    // the substituted draft is reported as needing fixes (a third trait, an aspiration) but still loads
    expect(r.issues).toEqual(expect.arrayContaining(['Ines Moreau: Choose exactly 3 traits (2 chosen).', 'Ines Moreau: Choose an aspiration.']));
  });

  it('keeps partner ties through export and import', () => {
    const draft: HouseholdDraft = JSON.parse(JSON.stringify(premadeHouseholds(content)[1]));
    draft.ties = [{ a: 1, b: 0, tie: 'partner' }];
    const r = importHouseholdTemplate(exportHouseholdTemplate(draft), content);
    expect(r.ok && r.draft.ties).toEqual([{ a: 1, b: 0, tie: 'partner' }]);
    expect(r.ok && r.substitutions).toEqual([]);
    expect(r.ok && r.issues).toEqual([]);
  });

  it('fills missing structure with safe defaults and limits members', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ firstName: `N${i}`, lastName: 'Big' }));
    const r = importHouseholdTemplate({ format: HOUSEHOLD_TEMPLATE_FORMAT, version: 1, household: { name: 'Big', members: many, ties: 'x' } }, content);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.members).toHaveLength(8);
    const p = r.draft.members[0]!;
    expect(p.lifeStage).toBe('adult');
    expect(p.appearance.frame).toBe('a');
    expect(Object.keys(p.outfits.outfits.formal)).toHaveLength(1);
    expect(r.substitutions[0]).toBe('Only the first 8 people were kept.');
    expect(r.substitutions).toContain('N0 Big: No outfits were included; plain outfits were added.');
    expect(importHouseholdTemplate({ format: HOUSEHOLD_TEMPLATE_FORMAT, version: 1, household: { members: [] } }, content))
      .toEqual({ ok: false, error: 'The template contains no people.' });
  });
});
