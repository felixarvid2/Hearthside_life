// Milestone 11: forty traits across the six brief categories, each with an implemented effect, with
// symmetric, explained opposites. Random people draw from the whole set.

import { describe, expect, it } from 'vitest';
import { content } from '../../../src/content/index';
import { TRAITS, describeTraitEffects } from '../../../src/content/traits';
import type { TraitCategory } from '../../../src/content/types';
import type { Person } from '../../../src/core/types';
import { randomPersonDraft, traitsConflict } from '../../../src/characters/names';
import { Rng, seedRng } from '../../../src/core/rng';
import { biasFor } from '../../../src/sim/autonomy';
import type { SimCtx } from '../../../src/sim/context';
import { traitDecayMult } from '../../../src/sim/needs';
import { traitSkillMult } from '../../../src/sim/skills';

const db = content();
const CATEGORIES: readonly TraitCategory[] = ['social', 'tidiness', 'energy', 'creativity', 'leisure', 'lifestyle'];
const EFFECT_KINDS = ['needDecay', 'autonomyBias', 'skillRate', 'socialReceive', 'workPerformance', 'enjoys'] as const;

describe('M11 traits', () => {
  it('has at least forty traits spread over all six categories', () => {
    expect(TRAITS.length).toBeGreaterThanOrEqual(40);
    expect(Object.values(db.traits).filter((t) => t.status === 'ready').length).toBeGreaterThanOrEqual(40);
    for (const cat of CATEGORIES) {
      expect(TRAITS.filter((t) => t.category === cat).length, cat).toBeGreaterThanOrEqual(2);
    }
    expect(new Set(TRAITS.map((t) => t.id)).size).toBe(TRAITS.length);
    for (const t of TRAITS) {
      expect(t.status).toBe('ready');
      expect(t.name.trim()).not.toBe('');
      expect(t.description.trim()).not.toBe('');
      expect(t.icon.trim()).not.toBe('');
    }
  });

  it('gives every trait at least one implemented effect and readable effect text', () => {
    for (const t of TRAITS) {
      const kinds = EFFECT_KINDS.filter((k) => {
        const v = t.effects[k];
        return v !== undefined && (typeof v === 'number' || Object.keys(v as object).length > 0);
      });
      expect(kinds.length, t.id).toBeGreaterThan(0);
      expect(t.effectText.length, t.id).toBeGreaterThan(0);
      expect(t.effectText.every((line) => line.trim().length > 0), t.id).toBe(true);
      // The UI text is generated from the data, so it can never promise an unimplemented effect.
      expect(t.effectText, t.id).toEqual(describeTraitEffects(t.effects));
    }
  });

  it('declares every opposite symmetrically and explains it', () => {
    for (const t of TRAITS) {
      for (const other of t.conflicts) {
        const def = db.traits[other];
        expect(def, `${t.id} conflicts with unknown ${other}`).toBeDefined();
        expect(def!.conflicts, `${other} -> ${t.id}`).toContain(t.id);
        expect(traitsConflict(db, t.id, other)).toBe(true);
        expect(traitsConflict(db, other, t.id)).toBe(true);
        // Both sides are real readied traits with a description, so the creator can explain the clash.
        expect(def!.status).toBe('ready');
        expect(def!.description.trim().length).toBeGreaterThan(0);
      }
    }
    // The meaningful opposites of the new set: a few spot checks keep a rename from silently dropping a pair.
    expect(traitsConflict(db, 'charismatic', 'awkward')).toBe(true);
    expect(traitsConflict(db, 'gossip', 'discreet')).toBe(true);
    expect(traitsConflict(db, 'organised', 'carefree')).toBe(true);
    expect(traitsConflict(db, 'energetic', 'lazy')).toBe(true);
    expect(traitsConflict(db, 'athletic', 'lazy')).toBe(true);
    expect(traitsConflict(db, 'daydreamer', 'practical')).toBe(true);
    expect(traitsConflict(db, 'homebody', 'outgoing')).toBe(true);
  });

  it('lets random people draw from all forty traits', () => {
    const rng = new Rng(seedRng(91123));
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const draft = randomPersonDraft(rng, db, { careerChance: 0.5 });
      for (const id of draft.traits) seen.add(id);
      // Random people still respect the conflict rules.
      for (let a = 0; a < draft.traits.length; a++) {
        for (let b = a + 1; b < draft.traits.length; b++) {
          expect(traitsConflict(db, draft.traits[a]!, draft.traits[b]!)).toBe(false);
        }
      }
    }
    expect(seen.size).toBe(TRAITS.length);
  });

  it('feeds the new traits through the simulation helpers', () => {
    const person = (traits: string[]) => ({ traits, likes: [], dislikes: [] } as unknown as Person);
    // needDecay
    expect(traitDecayMult({ content: db }, person(['energetic']), 'energy')).toBeLessThan(1);
    expect(traitDecayMult({ content: db }, person(['lazy']), 'energy')).toBeGreaterThan(1);
    // skillRate, including the skills of Milestones 11's skill tasks
    expect(traitSkillMult(db, person(['sweet-tooth']), 'baking')).toBeGreaterThan(1);
    expect(traitSkillMult(db, person(['artistic']), 'photography')).toBeGreaterThan(1);
    expect(traitSkillMult(db, person(['curious']), 'research')).toBeGreaterThan(1);
    expect(traitSkillMult(db, person(['carefree']), 'wellness')).toBeGreaterThan(1);
    expect(traitSkillMult(db, person(['outdoorsy']), 'fishing')).toBeGreaterThan(1);
    expect(traitSkillMult(db, person(['artistic']), 'creativity')).toBeGreaterThan(1);
    // autonomyBias, by interaction id, tag and the special 'social' key
    const ctx = { content: db } as SimCtx;
    expect(biasFor(ctx, person(['artistic']), 'paintCanvas', ['painting'])).toBeGreaterThan(1);
    expect(biasFor(ctx, person(['outdoorsy']), 'goForJog', ['outdoor'])).toBeGreaterThan(1);
    expect(biasFor(ctx, person(['green-thumb']), 'waterPlant', ['gardening'])).toBeGreaterThan(1);
    expect(biasFor(ctx, person(['lazy']), 'jogInPlace', ['active'])).toBeLessThan(1);
    expect(biasFor(ctx, person(['charismatic']), 'chat', ['social'])).toBeGreaterThan(1);
  });

  it('uses only skills, tags and socials that exist', () => {
    const tags = new Set<string>();
    for (const i of Object.values(db.interactions)) for (const t of i.autonomy.tags) tags.add(t);
    for (const t of TRAITS) {
      for (const id of Object.keys(t.effects.skillRate ?? {})) expect(db.skills[id], `${t.id} skill ${id}`).toBeDefined();
      for (const key of Object.keys(t.effects.autonomyBias ?? {})) {
        expect(db.interactions[key] || db.socials[key] || tags.has(key) || key === 'social', `${t.id} bias ${key}`).toBeTruthy();
      }
      for (const key of Object.keys(t.effects.enjoys ?? {})) expect(tags.has(key), `${t.id} enjoys ${key}`).toBe(true);
    }
  });
});
