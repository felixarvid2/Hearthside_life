// social gaps pass: the phone has a Neighbourhood Map entry, and LotInfo.usable is right before a venue layout is first built.

import { describe, expect, it, vi } from 'vitest';
import { premadeHouseholds } from '../../../src/characters/creator';
import type { GameEvent } from '../../../src/core/events';
import type { GameCore } from '../../../src/game/GameCore';
import { lotUsable } from '../../../src/sim/neighbourhoodView';
import { coreWithoutSaves, db } from './harness';

vi.setConfig({ testTimeout: 60_000 });

function game(): GameCore {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', premadeHouseholds(db)[0]!, 42)).toEqual({ ok: true });
  core.state()!.settings.visitors = false;
  return core;
}

describe('the phone map entry', () => {
  it('is in the Phone section of the self menu, opens the map through a UI request, and is open to teens but not children', () => {
    const core = game();
    const s = core.state()!;
    const id = s.households[s.activeHouseholdId]!.memberIds.find((m) => s.people[m]!.lifeStage === 'adult' || s.people[m]!.lifeStage === 'youngAdult')!;
    const menu = core.options(id, { kind: 'person', personId: id });
    const entry = menu.find((o) => o.interactionId === 'phoneMap')!;
    expect(entry).toMatchObject({ label: 'Neighbourhood Map', section: 'phone', group: 'self', enabled: true });
    const seen: GameEvent[] = [];
    core.events.on('ui.request', (e) => seen.push(e));
    expect(core.queue(id, entry)).toEqual({ ok: true });
    core.advanceTicks(20);
    expect(seen.some((e) => e.type === 'ui.request' && e.what === 'map' && e.personId === id)).toBe(true);
    // stage rules: teens may look at the map, children may not
    const def = db.interactions.phoneMap!;
    const person = s.people[id]!;
    for (const [stage, ok] of [['teen', true], ['child', false], ['elder', true]] as const) {
      person.lifeStage = stage;
      const opts = core.options(id, { kind: 'person', personId: id });
      expect(opts.some((o) => o.interactionId === def.id), stage).toBe(ok);
    }
  });
});

describe('LotInfo.usable', () => {
  it('is true for a venue that has not been laid out yet, and for the same venue afterwards', () => {
    const core = game();
    const before = core.neighbourhood()!;
    const venues = before.lots.filter((l) => l.kind === 'venue');
    expect(venues.length).toBe(7);
    for (const v of venues) {
      expect(v.built, v.name).toBe(false);
      expect(v.usable, `${v.name} before it is built`).toBe(true);
    }
    // build the park by visiting it, then ask again
    const s = core.state()!;
    const park = Object.values(s.lots).find((l) => l.venueType === 'park')!;
    const members = s.households[s.activeHouseholdId]!.memberIds;
    expect(core.travel(members.slice(0, 1), park.id).ok).toBe(true);
    const after = core.neighbourhood()!.lots.find((l) => l.id === park.id)!;
    expect(after.built).toBe(true);
    expect(after.objects).toBeGreaterThan(10);
    expect(after.usable).toBe(true);
  });

  it('a built venue with nothing in it is not usable, and a built home always is', () => {
    expect(lotUsable({ kind: 'venue', built: true, objects: {} })).toBe(false);
    expect(lotUsable({ kind: 'venue', built: undefined, objects: {} })).toBe(false); // absent = built (older saves)
    expect(lotUsable({ kind: 'venue', built: false, objects: {} })).toBe(true);
    expect(lotUsable({ kind: 'residential', built: true, objects: {} })).toBe(true);
    expect(lotUsable({ kind: 'residential', built: false, objects: {} })).toBe(true);
  });
});
