import { describe, expect, it } from 'vitest';
import {
  CreatorSession, MAX_HOUSEHOLD_MEMBERS, premadeHouseholds, randomPersonDraft, UNDO_LIMIT,
} from '../../../src/characters/creator';
import { Rng, seedRng } from '../../../src/core/rng';
import type { HouseholdDraft } from '../../../src/core/drafts';
import { emptyContent, fixtureContent } from './fixtures';

const content = fixtureContent();
const newSession = (seed = 1, draft?: HouseholdDraft) =>
  new CreatorSession(content, { rng: new Rng(seedRng(seed)), ...(draft ? { draft } : {}) });

describe('CreatorSession basics', () => {
  it('starts with one random valid adult and the household named after them', () => {
    const s = newSession();
    expect(s.members).toHaveLength(1);
    expect(s.current.lifeStage).toBe('adult');
    expect(s.draft.name).toBe(s.current.lastName);
    expect(s.validate().ok).toBe(true);
  });

  it('navigates steps freely without losing edits', () => {
    const s = newSession();
    s.setFirstName('Odile');
    s.setStep('review');
    expect(s.step).toBe('review');
    s.prevStep();
    expect(s.step).toBe('household');
    s.setStep('identity');
    expect(s.current.firstName).toBe('Odile');
    expect(s.nextStep()).toBe('faceBody');
  });

  it('notifies listeners and bumps the version', () => {
    const s = newSession();
    let calls = 0;
    const off = s.onChange(() => { calls++; });
    const v = s.version;
    s.setBio('Hello');
    s.setStep('hair');
    expect(calls).toBe(2);
    expect(s.version).toBe(v + 2);
    off();
    s.setBio('Bye');
    expect(calls).toBe(2);
  });

  it('does not record no-op edits', () => {
    const s = newSession();
    s.setFirstName(s.current.firstName);
    expect(s.canUndo()).toBe(false);
  });
});

describe('undo / redo', () => {
  it('undoes and redoes across different edits with labels', () => {
    const s = newSession();
    const first = s.current.firstName;
    s.setFirstName('Ada');
    s.endEdit();
    s.setHairColor('#123456');
    s.setFrame(s.current.appearance.frame === 'a' ? 'b' : 'a');
    expect(s.undoLabel()).toBe('Body frame');
    expect(s.undo()).toBe('Body frame');
    expect(s.undo()).toBe('Hair colour');
    expect(s.current.appearance.hair.color).not.toBe('#123456');
    expect(s.redoLabel()).toBe('Hair colour');
    expect(s.redo()).toBe('Hair colour');
    expect(s.current.appearance.hair.color).toBe('#123456');
    s.undo(); s.undo();
    expect(s.current.firstName).toBe(first);
    expect(s.undo()).toBeNull();
    s.redo();
    expect(s.current.firstName).toBe('Ada');
  });

  it('merges consecutive edits of one field (typing, slider drags) until endEdit', () => {
    const s = newSession();
    for (const v of [0.1, 0.2, 0.3, 0.4]) s.setBodyParam('build', v);
    s.setFirstName('A'); s.setFirstName('Ad'); s.setFirstName('Ada');
    expect(s.undo()).toBe('First name');
    expect(s.undo()).toBe('build');
    expect(s.canUndo()).toBe(false);
    s.redo();
    expect(s.current.appearance.body.build).toBe(0.4);
    s.setBodyParam('build', 0.5); s.endEdit(); s.setBodyParam('build', 0.6);
    expect(s.undo()).toBe('build');
    expect(s.current.appearance.body.build).toBe(0.5);
  });

  it('a new edit clears the redo stack', () => {
    const s = newSession();
    s.setBio('one'); s.endEdit(); s.setBio('two');
    s.undo();
    expect(s.canRedo()).toBe(true);
    s.setVoicePitch(0.5);
    expect(s.canRedo()).toBe(false);
  });

  it('is bounded and restores the selected member', () => {
    const s = new CreatorSession(content, { rng: new Rng(seedRng(2)), undoLimit: 5 });
    for (let i = 0; i < 9; i++) { s.setBio(`bio ${i}`); s.endEdit(); }
    let n = 0;
    while (s.undo()) n++;
    expect(n).toBe(5);
    expect(UNDO_LIMIT).toBeGreaterThanOrEqual(50);
    const t = newSession(3);
    t.addMember();
    expect(t.currentIndex).toBe(1);
    t.setFirstName('Second');
    t.selectMember(0);
    t.undo();
    expect(t.currentIndex).toBe(1);
    t.undo();
    expect(t.members).toHaveLength(1);
    expect(t.currentIndex).toBe(0);
  });
});

describe('locks and randomize', () => {
  it('randomizeAll preserves locked categories', () => {
    const s = newSession(5);
    s.setHairStyle('box-braids');
    s.setHairColor('#8c3a1e');
    s.setFirstName('Locked');
    s.setLocked('hair', true);
    s.setLocked('identity', true);
    const before = JSON.parse(JSON.stringify(s.current));
    for (let i = 0; i < 10; i++) s.randomizeAll();
    expect(s.current.appearance.hair).toEqual(before.appearance.hair);
    expect(s.current.firstName).toBe('Locked');
    expect(s.current.pronouns).toEqual(before.pronouns);
    expect(s.current.voice).toEqual(before.voice);
    expect(s.current.appearance.face).not.toEqual(before.appearance.face);
    expect(s.lockedCategories()).toEqual(['identity', 'hair']);
  });

  it('refuses to randomize a locked category and respects step locks', () => {
    const s = newSession(6);
    s.toggleLock('clothing');
    expect(s.randomize('clothing')).toEqual({ ok: false, reason: 'Clothing is locked.' });
    expect(s.randomizeOutfit('everyday', 0).ok).toBe(false);
    s.setLocked('face', true);
    const body = JSON.stringify(s.current.appearance.body), face = JSON.stringify(s.current.appearance.face);
    let changedBody = false;
    for (let i = 0; i < 5; i++) { s.randomizeStep('faceBody'); changedBody ||= JSON.stringify(s.current.appearance.body) !== body; }
    expect(changedBody).toBe(true);
    expect(JSON.stringify(s.current.appearance.face)).toBe(face);
    s.setLocked('body', true);
    expect(s.randomizeStep('faceBody').ok).toBe(false);
    for (const c of ['identity', 'hair', 'personality'] as const) s.setLocked(c, true);
    expect(s.randomizeAll()).toEqual({ ok: false, reason: 'Every category is locked.' });
  });

  it('randomize is one undo step and keeps the shared surname', () => {
    const s = newSession(7);
    s.addMember();
    const surname = s.members[0]!.lastName;
    expect(s.current.lastName).toBe(surname);
    const before = JSON.stringify(s.current);
    s.randomize('identity');
    expect(s.current.lastName).toBe(surname);
    expect(s.undoLabel()).toBe('Randomize identity');
    s.undo();
    expect(JSON.stringify(s.current)).toBe(before);
  });

  it('resetCategory restores defaults for one category', () => {
    const s = newSession(8);
    const name = s.current.firstName;
    s.resetCategory('personality');
    expect(s.current.traits).toEqual([]);
    expect(s.current.aspirationId).toBeNull();
    s.resetCategory('identity');
    expect(s.current.firstName).toBe(name);
    expect(s.current.bio).toBe('');
    s.resetCategory('body');
    expect(Object.values(s.current.appearance.body).every((v) => v === 0)).toBe(true);
  });
});

describe('presets and copy/paste', () => {
  it('applies face presets with clamping and unknown controls dropped', () => {
    const s = newSession();
    expect(s.applyFacePreset('wide').ok).toBe(true);
    const f = s.current.appearance.face;
    expect(f.presetId).toBe('wide');
    expect(f.params.jaw).toBe(1); // 2 clamped
    expect(f.params.mouth).toBe(0.5);
    expect(f.params.eyes).toBe(0);
    expect(f.params.unknownThing).toBeUndefined();
    expect(s.applyFacePreset('nope').ok).toBe(false);
  });

  it('applies body presets including the frame; changing frame clears a mismatched preset', () => {
    const s = newSession();
    s.applyBodyPreset('b-curvy');
    expect(s.current.appearance.frame).toBe('b');
    expect(s.current.appearance.body).toEqual({ build: 0.3, shoulders: 0, waist: -0.2, hips: 0.8 });
    expect(s.current.appearance.bodyPresetId).toBe('b-curvy');
    s.setFrame('a');
    expect(s.current.appearance.bodyPresetId).toBeNull();
    expect(s.current.appearance.body.hips).toBe(0.8);
  });

  it('copies and pastes appearance between members', () => {
    const s = newSession(9);
    s.addMember();
    expect(s.canPasteAppearance()).toBe(false);
    s.copyAppearance(0);
    s.pasteAppearance();
    expect(s.current.appearance).toEqual(s.members[0]!.appearance);
    expect(s.current.outfits).not.toEqual(s.members[0]!.outfits);
    s.pasteAppearance({ outfits: true });
    expect(s.current.outfits).toEqual(s.members[0]!.outfits);
    expect(s.current.firstName).not.toBe(s.members[0]!.firstName);
  });
});

describe('clamping and setters', () => {
  it('clamps numeric values to their ranges', () => {
    const s = newSession();
    s.setBodyParam('hips', -5); expect(s.current.appearance.body.hips).toBe(-0.8);
    s.setFaceParam('cheeks', 3); expect(s.current.appearance.face.params.cheeks).toBe(0.5);
    s.setVoicePitch(9); expect(s.current.voice.pitch).toBe(1);
    s.setFreckles(-1); expect(s.current.appearance.face.freckles).toBe(0);
    s.setBlush(2); expect(s.current.appearance.face.blush).toBe(1);
    s.setLipTint(0.123456); expect(s.current.appearance.face.lipTint).toBe(0.123);
    expect(s.setBodyParam('tail', 0.5).ok).toBe(false);
    expect(s.setVoicePitch(Number.NaN).ok).toBe(false);
  });

  it('validates colours, ids and text input', () => {
    const s = newSession();
    expect(s.setSkin('#ABC').ok).toBe(true);
    expect(s.current.appearance.skin).toBe('#aabbcc');
    expect(s.setEyeColor('blue').ok).toBe(false);
    expect(s.setHairStyle('mohawk-9000').ok).toBe(false);
    expect(s.setFacialHair('beard-full').ok).toBe(true);
    expect(s.setFacialHair(null).ok).toBe(true);
    expect(s.setHairHighlight(null).ok).toBe(true);
    expect(s.setBrowStyle('arched').ok).toBe(true);
    expect(s.setVoicePreset('robot').ok).toBe(false);
    expect(s.setWalkStyle('moonwalk').ok).toBe(false);
    s.setFirstName('A very very very long first name indeed');
    expect(s.current.firstName.length).toBe(24);
    s.setLastName('Tab\tName');
    expect(s.current.lastName).toBe('TabName');
  });

  it('handles pronoun presets and custom pronouns', () => {
    const s = newSession();
    s.setPronouns('they');
    expect(s.current.pronouns).toEqual({ subject: 'they', object: 'them', possessive: 'their' });
    s.setPronouns({ subject: 'xe', object: 'xem', possessive: 'xyr' });
    expect(s.current.pronouns.subject).toBe('xe');
    s.setPronouns({ subject: '', object: 'xem', possessive: 'xyr' });
    expect(s.validate().issues.some((i) => i.message === 'Fill in all three pronouns.')).toBe(true);
  });

  it('normalises romance interest', () => {
    const s = newSession();
    s.setRomanceInterest(['a', 'b']);
    expect(s.current.romance.interestedIn).toEqual(['any']);
    s.setRomanceInterest(['b', 'b']);
    expect(s.current.romance.interestedIn).toEqual(['b']);
    s.setRomanceInterest([]);
    expect(s.current.romance.interestedIn).toEqual([]);
    s.setRomanceOpen(false);
    expect(s.current.romance.open).toBe(false);
  });

  it('keeps the household name in step with the first surname until renamed', () => {
    const s = newSession();
    s.setLastName('Quill');
    expect(s.draft.name).toBe('Quill');
    s.setHouseholdName('The Quill Flat');
    s.setLastName('Feather');
    expect(s.draft.name).toBe('The Quill Flat');
  });
});

describe('clothing edits', () => {
  it('sets garments with automatic conflict resolution and notes', () => {
    const s = newSession(4);
    const r = s.setGarment('everyday', 0, 'full', 'dress');
    expect(r.ok).toBe(true);
    const layers = s.current.outfits.outfits.everyday[0]!.layers;
    expect(layers.full?.garmentId).toBe('dress');
    expect(layers.top).toBeUndefined();
    expect(layers.bottom).toBeUndefined();
    const r2 = s.setGarment('everyday', 0, 'top', 'tee');
    expect(r2).toEqual({ ok: true, note: 'A top or bottom replaces the full outfit.' });
    expect(s.setGarment('everyday', 0, 'top', 'blazer').ok).toBe(false); // wrong layer
    expect(s.setGarment('formal', 0, 'top', 'pj-top').ok).toBe(false); // wrong category
    expect(s.setGarment('everyday', 5, 'top', 'tee').ok).toBe(false); // no such outfit
  });

  it('edits colours, patterns and accessories per layer', () => {
    const s = newSession(4);
    s.setGarment('everyday', 0, 'top', 'tee');
    s.setGarment('everyday', 0, 'bottom', 'jeans');
    expect(s.setGarmentColor('everyday', 0, 'top', '#FF0000').ok).toBe(true);
    expect(s.setGarmentPattern('everyday', 0, 'top', 'stripes').ok).toBe(true);
    expect(s.setGarmentPattern('everyday', 0, 'top', 'plaid').ok).toBe(false);
    expect(s.setGarmentPatternColor('everyday', 0, 'top', '#00ff00').ok).toBe(true);
    const top = s.current.outfits.outfits.everyday[0]!.layers.top!;
    expect(top).toMatchObject({ garmentId: 'tee', color: '#ff0000', pattern: 'stripes', patternColor: '#00ff00' });
    s.setGarment('everyday', 0, 'top', 'shirt'); // keeps colour and the allowed pattern
    expect(s.current.outfits.outfits.everyday[0]!.layers.top).toMatchObject({ garmentId: 'shirt', color: '#ff0000', pattern: 'stripes' });
    s.addAccessory('everyday', 0, 'cap');
    const r = s.addAccessory('everyday', 0, 'beanie', '#112233');
    expect(r.ok && r.note).toMatch(/Only one hat/);
    s.setAccessoryColor('everyday', 0, 'beanie', '#445566');
    expect(s.current.outfits.outfits.everyday[0]!.accessories.find((a) => a.accessoryId === 'beanie')?.color).toBe('#445566');
    s.removeAccessory('everyday', 0, 'beanie');
    expect(s.current.outfits.outfits.everyday[0]!.accessories.some((a) => a.accessoryId === 'beanie')).toBe(false);
  });

  it('manages several outfits per category and the worn outfit', () => {
    const s = newSession(4);
    s.addOutfit('formal');
    s.addOutfit('formal', { copyOf: 0 });
    const list = s.current.outfits.outfits.formal;
    expect(list).toHaveLength(3);
    expect(new Set(list.map((o) => o.id)).size).toBe(3);
    expect(list[2]!.layers).toEqual(list[0]!.layers);
    s.setWornOutfit('formal', 2);
    s.removeOutfit('formal', 1);
    expect(s.current.outfits.current).toEqual({ category: 'formal', index: 1 });
    expect(s.renameOutfit('formal', 0, 'Gala').ok).toBe(true);
    expect(s.renameOutfit('formal', 0, '   ').ok).toBe(false);
    s.removeOutfit('formal', 0);
    expect(s.removeOutfit('formal', 0).ok).toBe(false); // last one stays
    expect(s.garmentOptions('swim', 'full').map((g) => g.id)).toEqual(['swimsuit']);
  });
});

describe('personality', () => {
  it('enforces three non-conflicting traits with reasons', () => {
    const s = newSession(10);
    s.resetCategory('personality');
    expect(s.toggleTrait('neat').ok).toBe(true);
    expect(s.toggleTrait('messy')).toEqual({ ok: false, reason: 'Messy and Neat are opposites.' });
    s.toggleTrait('foodie');
    s.toggleTrait('creative');
    expect(s.toggleTrait('bookish').ok).toBe(false);
    const opts = s.traitOptions();
    expect(opts.find((o) => o.def.id === 'messy')).toMatchObject({ enabled: false, reason: 'Opposite of Neat.' });
    expect(opts.find((o) => o.def.id === 'bookish')).toMatchObject({ enabled: false });
    expect(opts.some((o) => o.def.id === 'unfinished')).toBe(false); // dev traits hidden
    s.toggleTrait('neat');
    expect(s.current.traits).toEqual(['foodie', 'creative']);
    expect(s.setTraits(['outgoing', 'reserved', 'foodie']).ok).toBe(false);
    expect(s.setTraits(['outgoing', 'neat', 'foodie']).ok).toBe(true);
  });

  it('sets aspiration, career and likes/dislikes', () => {
    const s = newSession(10);
    expect(s.setAspiration('secret').ok).toBe(false); // dev
    expect(s.setAspiration('bookworm').ok).toBe(true);
    expect(s.setCareer('culinary').ok).toBe(true);
    expect(s.setCareer(null).ok).toBe(true);
    s.resetCategory('personality');
    s.toggleLike('music:jazz');
    s.toggleDislike('music:jazz');
    expect(s.current.likes).toEqual([]);
    expect(s.current.dislikes).toEqual(['music:jazz']);
    expect(s.toggleLike('music:polka').ok).toBe(false);
  });
});

describe('members', () => {
  it('adds up to eight members and refuses more', () => {
    const s = newSession(12);
    for (let i = 1; i < MAX_HOUSEHOLD_MEMBERS; i++) expect(s.addMember().ok).toBe(true);
    expect(s.members).toHaveLength(8);
    expect(s.addMember().ok).toBe(false);
    expect(s.duplicateMember(0).ok).toBe(false);
    expect(new Set(s.members.map((m) => m.firstName)).size).toBe(8);
    expect(s.members.every((m) => m.lifeStage === 'adult')).toBe(true);
  });

  it('adds blank members with the household surname and refuses to remove the last one', () => {
    const s = newSession(13);
    s.addMember({ blank: true });
    expect(s.current.firstName).toBe('');
    expect(s.current.lastName).toBe(s.members[0]!.lastName);
    s.removeMember(1);
    expect(s.removeMember(0).ok).toBe(false);
  });

  it('reorders members and remaps ties and selection', () => {
    const s = newSession(14);
    s.addMember(); s.addMember();
    const names = s.members.map((m) => m.firstName);
    expect(s.setTie(0, 1, 'spouse').ok).toBe(true);
    expect(s.setTie(2, 0, 'parent').ok).toBe(true); // member 0 is member 2's parent
    s.selectMember(2);
    s.moveMember(2, 0);
    expect(s.members.map((m) => m.firstName)).toEqual([names[2], names[0], names[1]]);
    expect(s.currentIndex).toBe(0);
    expect(s.tie(1, 2)).toBe('spouse');
    expect(s.tie(0, 1)).toBe('parent');
    expect(s.tie(1, 0)).toBe('child');
    s.moveMember(0, 2);
    expect(s.members.map((m) => m.firstName)).toEqual(names);
    expect(s.tie(2, 0)).toBe('parent');
  });

  it('removes and duplicates members with tie reindexing', () => {
    const s = newSession(15);
    s.addMember(); s.addMember();
    s.setTie(1, 2, 'sibling');
    s.duplicateMember(0);
    expect(s.members).toHaveLength(4);
    expect(s.currentIndex).toBe(1);
    expect(s.members[1]!.appearance).toEqual(s.members[0]!.appearance);
    expect(s.members[1]!.firstName).not.toBe(s.members[0]!.firstName);
    expect(s.tie(2, 3)).toBe('sibling');
    s.removeMember(2);
    expect(s.draft.ties).toEqual([]);
  });

  it('refuses contradictory ties', () => {
    const s = newSession(16);
    s.addMember(); s.addMember();
    expect(s.setTie(0, 0, 'sibling').ok).toBe(false);
    expect(s.setTie(0, 1, 'spouse').ok).toBe(true);
    expect(s.setTie(0, 2, 'spouse').ok).toBe(false); // second spouse
    expect(s.setTie(1, 2, 'parent').ok).toBe(true); // 2 is 1's parent
    expect(s.setTie(2, 1, 'parent').ok).toBe(true); // replaces the pair: 1 is 2's parent now
    expect(s.tie(1, 2)).toBe('child');
    const grand = s.setTie(0, 2, 'parent'); // 2 would be 0's parent, making 0's spouse 0's grandparent
    expect(grand.ok).toBe(false);
    expect(!grand.ok && grand.reason).toMatch(/cannot be spouses when one is the other's ancestor/);
    expect(s.setTie(0, 1, 'none').ok).toBe(true);
    expect(s.setTie(0, 2, 'parent').ok).toBe(true); // now fine: 1 -> 2 -> 0
    const cycle = s.setTie(1, 0, 'parent'); // 0 as 1's parent closes the loop 1 -> 2 -> 0 -> 1
    expect(cycle.ok).toBe(false);
    expect(!cycle.ok && cycle.reason).toMatch(/own ancestor/);
    expect(s.tie(0, 1)).toBe('none');
  });

  it('sets partner ties symmetrically and keeps one partner or spouse per person', () => {
    const s = newSession(21);
    s.addMember(); s.addMember();
    expect(s.setTie(1, 0, 'partner').ok).toBe(true);
    expect(s.tie(0, 1)).toBe('partner');
    const second = s.setTie(0, 2, 'partner');
    expect(!second.ok && second.reason).toMatch(/can only have one partner or spouse/);
    expect(s.setTie(2, 1, 'spouse').ok).toBe(false);
    expect(s.setTie(0, 1, 'spouse').ok).toBe(true); // upgrading the pair replaces partner with spouse
    expect(s.tie(1, 0)).toBe('spouse');
    expect(s.draft.ties).toHaveLength(1);
    s.moveMember(0, 2);
    expect(s.tie(2, 0)).toBe('spouse');
  });

  it('validation lists issues per member and household', () => {
    const s = newSession(17);
    s.addMember({ blank: true });
    s.setHouseholdName('');
    const v = s.validate();
    expect(v.ok).toBe(false);
    expect(v.household.map((i) => i.message)).toContain('Household name is required.');
    expect(v.members[0]).toEqual([]);
    expect(v.members[1]!.map((i) => i.step)).toEqual(expect.arrayContaining(['identity', 'personality']));
    expect(s.finalDraft().name).toBe(s.members[0]!.lastName);
  });
});

describe('templates through the session', () => {
  it('exports and imports a member appearance', () => {
    const s = newSession(18);
    s.addMember();
    const json = s.exportMemberAppearance(0)!;
    const r = s.importMemberAppearance(json);
    expect(r).toEqual({ ok: true, substitutions: [] });
    expect(s.current.appearance).toEqual(s.members[0]!.appearance);
    expect(s.current.outfits).toEqual(s.members[0]!.outfits);
    expect(s.undoLabel()).toBe('Load appearance preset');
    expect(s.importMemberAppearance('{nope').ok).toBe(false);
  });
});

describe('robustness', () => {
  it('edits a premade household draft and works with empty content', () => {
    const s = newSession(19, premadeHouseholds(content)[1]);
    expect(s.members).toHaveLength(2);
    expect(s.tie(0, 1)).toBe('roommate');
    const e = new CreatorSession(emptyContent(), { rng: new Rng(seedRng(1)) });
    expect(e.current.appearance.hair.styleId).toBe('');
    expect(e.randomizeAll().ok).toBe(true);
    expect(e.addMember().ok).toBe(true);
    expect(e.validate().ok).toBe(true);
  });

  it('does not share state with the draft it was given', () => {
    const p = randomPersonDraft(new Rng(seedRng(20)), content);
    const draft: HouseholdDraft = { name: 'X', members: [p], ties: [] };
    const s = newSession(20, draft);
    s.setFirstName('Changed');
    expect(p.firstName).not.toBe('Changed');
  });
});
