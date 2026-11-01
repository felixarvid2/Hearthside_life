// Dream Home counts only furniture the household bought after move-in: the pre-owned starter furnishings
// must not satisfy the early stages (they used to pay +$250 and +$750 at 10:00 on day 1).

import { describe, expect, it } from 'vitest';
import type { AspirationObjective } from '../../../src/content/types';
import { dollars } from '../../../src/core/money';
import { objectiveProgress } from '../../../src/sim/aspirations';
import { makePlacedObject } from '../../../src/world/objects';
import { coreWithoutSaves, db, members } from './harness';

const dream = db.aspirations['dream-home']!;
const owns = (stage: number) => dream.stages[stage]!.objectives.filter((o): o is Extract<AspirationObjective, { type: 'ownObjects' }> => o.type === 'ownObjects');

function dreamHomeGame() {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', core.premadeHouseholds()[0]!, 5).ok).toBe(true);
  const s = core.state()!;
  const mira = members(s)[0]!;
  mira.aspiration = { aspirationId: 'dream-home', stage: 0, progress: {}, completedStages: 0, rewards: [] };
  return { core, s, person: mira };
}

describe('Dream Home ignores the starter furniture', () => {
  it('the starter home would satisfy the early stages if it counted, but the objectives do not count it', () => {
    const { s, person } = dreamHomeGame();
    const lot = s.lots[s.activeLotId]!;
    for (const o of [...owns(0), ...owns(1)]) {
      const raw = Object.values(lot.objects).filter((x) => db.objects[x.defId]?.tags.includes(o.tag)).length;
      expect(raw, `starter ${o.tag}`).toBeGreaterThanOrEqual(o.count); // the premise of the bug
      expect(objectiveProgress(s, db, person, o), o.id).toMatchObject({ current: 0, done: false });
    }
  });

  it('no reward is paid at 10:00 on day 1, but bought pieces count and pay once', () => {
    const { core, s, person } = dreamHomeGame();
    const hh = s.households[s.activeHouseholdId]!;
    const rewards = () => hh.ledger.filter((l) => l.kind === 'reward');
    core.advanceTicks(4 * 4 * 60); // 4 ticks per game minute: 08:00 -> 12:00, past the 10:00 check
    expect(person.aspiration).toMatchObject({ stage: 0, completedStages: 0 });
    expect(rewards()).toHaveLength(0);

    const lot = s.lots[s.activeLotId]!;
    for (let i = 0; i < 5; i++) {
      const o = makePlacedObject(s, db.objects['plant-potted']!, { x: 1 + i, z: 1, rot: 0, level: 0 }, { ownerHouseholdId: hh.id });
      lot.objects[o.id] = o;
    }
    const decor5 = owns(0)[0]!;
    expect(objectiveProgress(s, db, person, decor5)).toMatchObject({ current: 5, done: true });
    core.advanceTicks(4 * 61); // past the next hourly check
    expect(person.aspiration).toMatchObject({ stage: 1, completedStages: 1 });
    expect(rewards().map((r) => r.amount)).toEqual([dollars(250)]);
  });
});
