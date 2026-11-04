// Milestone 11 integration: the new traits and aspirations are live content. Play a few in-game days with
// them in the real starter house and check the people keep living normally and the aspiration panel has
// readable stage objectives throughout.

import { describe, expect, it } from 'vitest';
import { atDayMinute } from '../../../src/core/clock';
import { NEED_IDS } from '../../../src/core/types';
import { aspirationView } from '../../../src/sim/aspirations';
import { Recorder, coreWithoutSaves, db, members } from './harness';

const DAYS = 2;

describe('M11 progression in play', () => {
  it('plays two in-game days with forty traits and the new aspirations', () => {
    const core = coreWithoutSaves();
    // The largest premade so two people can carry different new personalities through the same days.
    const home = [...core.premadeHouseholds()].sort((a, b) => b.members.length - a.members.length)[0]!;
    expect(core.startNewGame('guided', home, 5).ok).toBe(true);
    const state = core.state()!;
    const people = members(state);
    expect(people.length).toBeGreaterThanOrEqual(2);

    const setups = [
      { traits: ['green-thumb', 'artistic', 'compassionate'], aspiration: 'true-artist' },
      { traits: ['curious', 'outdoorsy', 'generous'], aspiration: 'tech-pioneer' },
      { traits: ['organised', 'coffee-lover', 'competitive'], aspiration: 'music-star' },
      { traits: ['charismatic', 'sweet-tooth', 'homebody'], aspiration: 'family-ties' },
    ] as const;
    for (const [i, p] of people.entries()) {
      const setup = setups[i % setups.length]!;
      p.traits = [...setup.traits];
      p.aspiration = { aspirationId: setup.aspiration, stage: 0, progress: {}, completedStages: 0, rewards: [] };
    }

    // Every new aspiration is a real, readable goal: stage 0 has objectives and a reward.
    for (const p of people) {
      const view = aspirationView(state, db, p);
      expect(view, p.firstName).not.toBeNull();
      expect(view!.objectives.length, p.firstName).toBeGreaterThan(0);
      expect(view!.reward!.money, p.firstName).toBeGreaterThan(0);
    }

    const rec = new Recorder(core);
    rec.runUntil(atDayMinute(DAYS, 8 * 60));
    rec.dispose();

    for (const p of people) {
      // Traits and aspirations survive a save-free multi-day run.
      expect(p.traits.length, p.firstName).toBe(3);
      expect(p.aspiration, p.firstName).not.toBeNull();
      expect(p.aspiration!.stage, p.firstName).toBeGreaterThanOrEqual(0);
      expect(p.aspiration!.stage, p.firstName).toBeLessThanOrEqual(db.aspirations[p.aspiration!.aspirationId]!.stages.length);
      for (const n of NEED_IDS) expect(Number.isFinite(p.needs[n]), `${p.firstName} ${n}`).toBe(true);
      // The household keeps eating and sleeping with the new personalities in charge.
      const days = rec.days.get(p.id)?.slice(0, DAYS) ?? [];
      expect(days.length, p.firstName).toBeGreaterThanOrEqual(DAYS);
      for (const [d, stats] of days.entries()) {
        expect((stats.done.eatMeal ?? 0) + (stats.done.grabSnack ?? 0), `${p.firstName} ate on day ${d + 1}`).toBeGreaterThan(0);
      }
      expect(days.reduce((s, d) => s + d.bedSleeps, 0), `${p.firstName} slept in a bed`).toBeGreaterThanOrEqual(DAYS - 1);
      // Nobody is stuck for three hours at a time.
      expect(rec.longestStill.get(p.id)?.ticks ?? 0, p.firstName).toBeLessThan(3 * 60 * 4);
    }
  }, 60_000);
});
