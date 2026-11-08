// Milestone 13 balance changes (docs/BALANCE.md), on the real content: groceries priced per portion, a slower career
// ladder, the elder pension, company at work, and the determinism of the audit harness itself.

import { describe, expect, it, vi } from 'vitest';
import { premadeHouseholds } from '../../../src/characters/creator';
import { promotionDays } from '../../../src/content/careers';
import { MINUTES_PER_DAY } from '../../../src/core/clock';
import { recipeCost } from '../../../src/sim/cooking';
import { ELDER_PENSION } from '../../../src/sim/economy';
import { COMPANY_SOCIAL_PER_HOUR } from '../../../src/sim/tuning';
import { SCENARIOS, runScenario } from '../../../tools/balance/audit';
import { coreWithoutSaves, db, members } from './harness';

vi.setConfig({ testTimeout: 180_000 });
const premades = premadeHouseholds(db);

describe('groceries are priced per portion', () => {
  it('a single person pays for one plate, a family for four, and the whole dish is the default', () => {
    const core = coreWithoutSaves();
    core.startNewGame('guided', premades[0]!, 3);
    const p = members(core.state()!)[0]!;
    const recipe = db.recipes['spaghetti']!;
    expect(recipe.servings).toBe(4);
    expect(recipeCost(p, recipe)).toBe(recipe.cost);
    expect(recipeCost(p, recipe, 1)).toBe(Math.round(recipe.cost / 4));
    expect(recipeCost(p, recipe, 4)).toBe(recipe.cost);
    expect(recipeCost(p, recipe, 0)).toBeGreaterThan(0);
  });
});

describe('career ladder pace', () => {
  it('needs more days at every level and the first promotion still comes within the first week', () => {
    expect([1, 2, 3, 4, 9].map(promotionDays)).toEqual([4, 8, 14, 20, 68]);
    for (let n = 2; n <= 9; n++) expect(promotionDays(n)).toBeGreaterThan(promotionDays(n - 1));
    for (const c of Object.values(db.careers)) for (const l of c.levels.slice(0, -1)) expect(l.promotion.days).toBe(promotionDays(l.level));
  });
});

describe('elder pension', () => {
  function elderGame() {
    const core = coreWithoutSaves();
    core.startNewGame('guided', premades[0]!, 5);
    const s = core.state()!;
    const id = members(s)[0]!.id;
    core.quitCareer(id);
    s.people[id]!.lifeStage = 'elder';
    s.settings.visitors = false;
    return { core, id };
  }
  it('pays a retired elder once a week and nobody else', () => {
    const { core, id } = elderGame();
    const hh = () => core.state()!.households[core.state()!.activeHouseholdId]!;
    const pensions = () => hh().ledger.filter((l) => l.occurrence?.startsWith('pension:'));
    core.advanceTicks(4 * MINUTES_PER_DAY * 15); // 15 days: weeks 0, 1 and 2 have begun
    expect(pensions().length).toBe(3);
    expect(pensions().every((l) => l.amount === ELDER_PENSION && l.kind === 'wage')).toBe(true);
    expect(new Set(pensions().map((l) => l.occurrence)).size).toBe(3);

    const adult = coreWithoutSaves();
    adult.startNewGame('guided', premades[0]!, 5);
    adult.advanceTicks(4 * MINUTES_PER_DAY * 8);
    const h2 = adult.state()!.households[adult.state()!.activeHouseholdId]!;
    expect(h2.ledger.some((l) => l.occurrence?.startsWith('pension:'))).toBe(false);
    void id;
  });
  it('a working elder gets no pension', () => {
    const core = coreWithoutSaves();
    core.startNewGame('guided', premades[0]!, 5); // Maren has a job
    const s = core.state()!;
    members(s)[0]!.lifeStage = 'elder';
    core.advanceTicks(4 * MINUTES_PER_DAY * 8);
    expect(s.households[s.activeHouseholdId]!.ledger.some((l) => l.occurrence?.startsWith('pension:'))).toBe(false);
  });
});

describe('company at work', () => {
  it('social rises while at work instead of running down', () => {
    expect(COMPANY_SOCIAL_PER_HOUR).toBeGreaterThan(0);
    const core = coreWithoutSaves();
    core.startNewGame('guided', premades[0]!, 5);
    const s = core.state()!;
    const p = members(s)[0]!;
    p.location = { kind: 'offlot', place: 'work', since: s.clock.minutes, until: s.clock.minutes + 600 };
    p.needs.social = 40;
    core.advanceTicks(4 * 60 * 4); // four hours
    expect(p.needs.social).toBeGreaterThan(45);
  });
});

describe('balance audit harness', () => {
  it('is deterministic and reports a week for each household', () => {
    const sc = SCENARIOS.find((x) => x.id === 'single')!;
    const a = runScenario(sc, { weeks: 1, seed: 11, content: db });
    const b = runScenario(sc, { weeks: 1, seed: 11, content: db });
    expect(a.weeks).toHaveLength(1);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.weeks[0]!.money.wages).toBeGreaterThan(0);
    expect(SCENARIOS.map((x) => x.id)).toEqual(['single', 'couple', 'family', 'elder', 'teen']);
  });
});
