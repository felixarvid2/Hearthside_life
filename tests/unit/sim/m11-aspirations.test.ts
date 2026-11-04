// Milestone 11: the five new aspirations (family, romance, art, music, technology) have three stages,
// objectives of existing types, and each stage pays its reward exactly once in a simulated run.

import { describe, expect, it } from 'vitest';
import { blankPersonDraft, memberIssues } from '../../../src/characters/creator';
import type { AspirationObjective } from '../../../src/content/types';
import { checkAspiration, objectiveProgress } from '../../../src/sim/aspirations';
import { ensureRel, setBondStatus } from '../../../src/sim/relationships';
import { makePlacedObject } from '../../../src/world/objects';
import { harness, pureCtx } from '../sim/fixtures';
import { coreWithoutSaves, db, members } from '../integration/harness';

const NEW_ASPIRATIONS = ['family-ties', 'hopeless-romantic', 'true-artist', 'music-star', 'tech-pioneer'] as const;

function game() {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', core.premadeHouseholds()[0]!, 5).ok).toBe(true);
  const state = core.state()!;
  const person = members(state)[0]!;
  const h = harness(state, db);
  return { core, state, person, ctx: pureCtx(h) };
}

/** Satisfies one objective directly (a simulated run in miniature), without playing through the UI. */
function satisfy(state: ReturnType<typeof game>['state'], person: ReturnType<typeof game>['person'], o: AspirationObjective): void {
  switch (o.type) {
    case 'skill':
      person.skills[o.skillId] = { level: o.level, xp: db.skills[o.skillId]!.thresholds[o.level - 2] ?? 0 };
      break;
    case 'interactionCount':
      person.aspiration!.progress[o.id] = o.count;
      break;
    case 'friends': {
      const others = Object.values(state.people).filter((p) => p.id !== person.id).slice(0, o.count);
      expect(others, `enough people for ${o.id}`).toHaveLength(o.count);
      for (const other of others) {
        ensureRel(state, person.id, other.id).friendship = o.minFriendship;
        ensureRel(state, other.id, person.id).friendship = o.minFriendship;
      }
      break;
    }
    case 'bond': {
      const other = Object.values(state.people).find((p) => p.id !== person.id)!;
      setBondStatus(state, null, person.id, other.id, o.status, state.clock.minutes);
      break;
    }
    case 'homeValue':
      // Land value alone is enough for the objective; placed objects only add to it.
      state.lots[state.activeLotId]!.landValue = o.amount;
      break;
    case 'funds':
      state.households[person.householdId]!.funds = o.amount;
      break;
    case 'careerLevel':
      person.career = { careerId: Object.keys(db.careers)[0]!, level: o.level, performance: 0, joinedAt: 0, daysWorked: 0, shift: null };
      break;
    case 'ownObjects': {
      const def = Object.values(db.objects).find((d) => d.status === 'ready' && d.tags.includes(o.tag))!;
      const lot = state.lots[state.activeLotId]!;
      for (let i = 0; i < o.count; i++) {
        const placed = makePlacedObject(state, def, { x: 1 + i, z: 1, rot: 0, level: 0 }, { ownerHouseholdId: person.householdId });
        lot.objects[placed.id] = placed;
      }
      break;
    }
  }
}

describe('M11 aspirations', () => {
  it('the five new aspirations have at least three stages of existing objective types and a reward each', () => {
    for (const id of NEW_ASPIRATIONS) {
      const def = db.aspirations[id];
      expect(def, id).toBeDefined();
      expect(def!.status).toBe('ready');
      expect(def!.stages.length, id).toBeGreaterThanOrEqual(3);
      for (const stage of def!.stages) {
        expect(stage.objectives.length, `${id}/${stage.name}`).toBeGreaterThan(0);
        expect(stage.reward.money, `${id}/${stage.name}`).toBeGreaterThan(0);
        expect(stage.reward.text.trim().length).toBeGreaterThan(0);
        for (const o of stage.objectives) expect(['skill', 'interactionCount', 'friends', 'funds', 'careerLevel', 'ownObjects', 'homeValue', 'bond']).toContain(o.type);
      }
    }
  });

  it('reports progress for the new objectives', () => {
    const { state, person, ctx } = game();
    person.aspiration = { aspirationId: 'true-artist', stage: 0, progress: {}, completedStages: 0, rewards: [] };
    const first = db.aspirations['true-artist']!.stages[0]!;
    for (const o of first.objectives) {
      expect(objectiveProgress(state, ctx.content, person, o).done, o.id).toBe(false);
      satisfy(state, person, o);
      expect(objectiveProgress(state, ctx.content, person, o).done, o.id).toBe(true);
    }
  });

  it('completes every stage of each new aspiration and pays each reward exactly once', () => {
    const ids = [...NEW_ASPIRATIONS];
    for (const id of ids) {
      const { state, person, ctx } = game();
      const hh = state.households[person.householdId]!;
      const def = db.aspirations[id]!;
      person.aspiration = { aspirationId: id, stage: 0, progress: {}, completedStages: 0, rewards: [] };
      for (let i = 0; i < def.stages.length; i++) {
        for (const o of def.stages[i]!.objectives) satisfy(state, person, o);
        checkAspiration(ctx, person);
        expect(person.aspiration!.stage, `${id} stage ${i}`).toBe(i + 1);
        expect(person.aspiration!.completedStages).toBe(i + 1);
        const occurrence = `aspiration:${person.id}:${id}:${i}`;
        const paid = hh.ledger.filter((l) => l.occurrence === occurrence);
        expect(paid, `${id} stage ${i} reward`).toHaveLength(1);
        expect(paid[0]!.amount).toBe(def.stages[i]!.reward.money);
        expect(state.processed[`money:${occurrence}`]).toBeDefined();
        // Re-checking the same state must not pay again (once-only occurrence).
        checkAspiration(ctx, person);
        expect(hh.ledger.filter((l) => l.occurrence === occurrence)).toHaveLength(1);
      }
      expect(person.aspiration!.stage).toBe(def.stages.length);
      expect(person.aspiration!.rewards.filter((r) => r.startsWith(`aspiration:${person.id}:${id}:`))).toHaveLength(def.stages.length);
    }
  });

  it('only adults may take an aspiration', () => {
    const draft = blankPersonDraft(db, { firstName: 'Kit', lastName: 'Reed' });
    draft.traits = ['cheerful', 'curious', 'outdoorsy'];
    draft.aspirationId = 'family-ties';
    const personality = () => memberIssues(draft, 0, db).filter((i) => i.step === 'personality').map((i) => i.message);
    draft.lifeStage = 'child';
    expect(personality()).toContain('Only adults can have an aspiration.');
    draft.lifeStage = 'adult';
    expect(personality()).not.toContain('Only adults can have an aspiration.');
  });
});
