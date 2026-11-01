import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, START_MINUTE } from '../../../src/core/clock';
import { checkAspiration, objectiveProgress } from '../../../src/sim/aspirations';
import { ensureRel } from '../../../src/sim/relationships';
import { buildWorld, harness, lotLocation, pureCtx, runUntil, setNeeds } from './fixtures';

describe('aspiration objectives', () => {
  it('count only accepted socials', () => {
    let accepted = 0, rejected = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const w = buildWorld({ seed, autonomy: false, visitors: false });
      const ada = w.neighbour!;
      w.state.people[ada]!.location = lotLocation(w.lot, 7, 9);
      setNeeds(w.state, ada, 100);
      for (const [a, b] of [[w.mira, ada], [ada, w.mira]] as const) ensureRel(w.state, a, b).familiarity = 30;
      const asp = w.state.people[w.mira]!.aspiration!;
      const h = harness(w.state);
      h.content.aspirations.homeChef!.stages[0]!.objectives = [{ id: 'jokes', text: 'Tell a joke', type: 'interactionCount', match: 'category:funny', count: 5 }];
      h.sim.queue(w.mira, { interactionId: 'tellJoke', target: { kind: 'person', personId: ada } });
      runUntil(h, () => h.log.some((e) => e.type === 'social'), 4 * 60);
      const ok = h.log.find((e) => e.type === 'social')!.type === 'social' && (h.log.find((e) => e.type === 'social') as { accepted: boolean }).accepted;
      if (ok) { accepted++; expect(asp.progress.jokes).toBe(1); } else { rejected++; expect(asp.progress.jokes ?? 0).toBe(0); }
    }
    expect(accepted).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  });

  it('friends need mutual friendship; owned objects respect ownership', () => {
    const w = buildWorld();
    const h = harness(w.state);
    const mira = w.state.people[w.mira]!;
    const friends = { id: 'f', text: 'Friends', type: 'friends' as const, count: 1, minFriendship: 30 };
    ensureRel(w.state, w.mira, w.theo).friendship = 40;
    ensureRel(w.state, w.theo, w.mira).friendship = 10;
    expect(objectiveProgress(w.state, h.content, mira, friends).done).toBe(false);
    ensureRel(w.state, w.theo, w.mira).friendship = 35;
    expect(objectiveProgress(w.state, h.content, mira, friends).done).toBe(true);
    const own = { id: 'o', text: 'Stove', type: 'ownObjects' as const, tag: 'stove', count: 1 };
    expect(objectiveProgress(w.state, h.content, mira, own).done).toBe(true);
    w.objects.stove!.ownerHouseholdId = null;
    expect(objectiveProgress(w.state, h.content, mira, own).done).toBe(false);
  });

  it('bought-only objectives ignore the starter furnishings', () => {
    const w = buildWorld();
    const h = harness(w.state);
    const mira = w.state.people[w.mira]!;
    const books = { id: 'books', text: 'Bookcases', type: 'ownObjects' as const, tag: 'bookcase-open', count: 1, bought: true as const };
    w.objects.bookcase!.boughtAt = START_MINUTE - MINUTES_PER_DAY;
    expect(objectiveProgress(w.state, h.content, mira, books).done).toBe(false);
    w.objects.bookcase!.boughtAt = START_MINUTE + 60;
    expect(objectiveProgress(w.state, h.content, mira, books).done).toBe(true);
    // Without the bought rule the starter bookcase still counts (the Dream Home rule is opt-in).
    const any = { ...books, id: 'any', bought: undefined as true | undefined };
    w.objects.bookcase!.boughtAt = START_MINUTE - MINUTES_PER_DAY;
    expect(objectiveProgress(w.state, h.content, mira, any).done).toBe(true);
  });

  it('pays a stage reward once and advances exactly one stage', () => {
    const w = buildWorld();
    const h = harness(w.state);
    const mira = w.state.people[w.mira]!;
    h.content.aspirations.homeChef!.stages = [
      { name: 'First dishes', objectives: [{ id: 'any-funds', text: 'Have funds', type: 'funds', amount: 0 }], reward: { money: 50000, text: '$500' } },
      { name: 'Second dishes', objectives: [{ id: 'second', text: 'Have funds', type: 'funds', amount: 0 }], reward: { money: 25000, text: '$250' } },
    ];
    const household = w.state.households[mira.householdId]!;
    const before = household.funds;
    checkAspiration(pureCtx(h), mira);
    expect(mira.aspiration).toMatchObject({ stage: 1 });
    expect(household.funds).toBe(before + 50000);
    expect(mira.aspiration!.rewards).toEqual([`aspiration:${w.mira}:homeChef:0`]);
    // Checking again pays the next stage once; the first stage is never paid again.
    checkAspiration(pureCtx(h), mira);
    expect(mira.aspiration).toMatchObject({ stage: 2 });
    expect(household.funds).toBe(before + 75000);
    checkAspiration(pureCtx(h), mira);
    expect(household.funds).toBe(before + 75000);
    // Replaying an old stage (an edited save) cannot pay it a second time.
    mira.aspiration!.stage = 0;
    mira.aspiration!.progress = {};
    checkAspiration(pureCtx(h), mira);
    expect(household.funds).toBe(before + 75000);
    expect(household.ledger.filter((l) => l.kind === 'reward')).toHaveLength(2);
  });
});
