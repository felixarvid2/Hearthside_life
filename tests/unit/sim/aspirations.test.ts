import { describe, expect, it } from 'vitest';
import { objectiveProgress } from '../../../src/sim/aspirations';
import { ensureRel } from '../../../src/sim/relationships';
import { buildWorld, harness, lotLocation, runUntil, setNeeds } from './fixtures';

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
});
