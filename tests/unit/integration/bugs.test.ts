// Bugs found in other modules while integrating. These tests FAIL on purpose until the owning module is fixed
// (see the GameCore integration report, "Bugs found in other modules"). Do not mark them as expected failures:
// they turn green when the bug is fixed.

import { describe, expect, it } from 'vitest';
import { atDayMinute } from '../../../src/core/clock';
import { describeReport, validateWorld } from '../../../src/persistence/index';
import { neighbours } from '../../../src/sim/index';
import { Recorder, TICKS_PER_DAY, coreWithoutSaves, db, members } from './harness';

describe('BUG(sim): a single person has no autonomous social outlet after the first visit', () => {
  // src/sim/autonomy.ts phoneFriend() only offers phoneChat with someone whose friendship is >= 10. The first
  // neighbour visit (introduce + a chat) leaves friendship at about 7, and random drop-ins come at most every
  // second day with a 50 % chance, so the Guided Start single sits at social 0 for one to two game days.
  it('the Guided Start single keeps social above 15 for most of three days at full autonomy', () => {
    const core = coreWithoutSaves();
    core.startNewGame('guided', core.premadeHouseholds()[0]!, 101);
    const rec = new Recorder(core);
    rec.run(3 * TICKS_PER_DAY);
    const p = members(core.state()!)[0]!;
    const days = rec.days.get(p.id)!.slice(0, 3);
    const low = days.reduce((s, d) => s + d.lowTicks.social, 0);
    const onLot = days.reduce((s, d) => s + d.onLotTicks, 0);
    expect(low / onLot, `social below 15 for ${low} of ${onLot} on-lot ticks`).toBeLessThan(0.1);
  }, 60_000);
});

describe('BUG(content/persistence): saving while a visitor leaves reports a missing "leaveLot" action', () => {
  // The simulation queues its built-in interaction 'leaveLot' (src/sim/context.ts BUILTIN_INTERACTIONS) for
  // departing visitors. Content does not define it, and src/persistence/references.ts reports queue entries that
  // are neither an InteractionDef nor a SocialDef, so a save made during the ~2 minutes of a departure loads with
  // 'Missing action "leaveLot"' in the load report shown to the player.
  it('a world saved during the neighbour\'s departure has no missing references', () => {
    const core = coreWithoutSaves();
    core.startNewGame('guided', core.premadeHouseholds()[0]!, 101);
    const s = core.state()!;
    const visitor = neighbours(s)[0]!;
    let found = false;
    while (!found && s.clock.minutes < atDayMinute(1, 0)) {
      core.advanceTicks(1);
      found = visitor.queue.some((a) => a.interactionId === 'leaveLot');
    }
    expect(found, 'the visitor started leaving').toBe(true);
    const v = validateWorld(JSON.parse(JSON.stringify(s)), db);
    expect(v.errors).toEqual([]);
    expect(describeReport({ missing: v.missing, warnings: v.warnings, migratedFrom: null })).toEqual([]);
  });
});
