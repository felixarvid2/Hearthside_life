// Save compatibility of the relationship and event fields (Milestone 5): relationship labels, `romanceBlocked`, settled
// memories and `homeEvents` are optional additions to schema 1. Older saves load unchanged; bad values are repaired.

import { describe, expect, it } from 'vitest';
import type { HomeEvent, WorldState } from '../../../src/core/types';
import { SCHEMA_VERSION } from '../../../src/core/types';
import { fillSocialDefaults, migrate, validateWorld } from '../../../src/persistence/schema';
import { makeContent, makeWorld, snapshot } from './fixtures';

const event = (w: WorldState, over: Partial<HomeEvent> = {}): HomeEvent => {
  const [host, guest] = Object.keys(w.people);
  return {
    id: 'evt_1', type: 'dinnerParty', title: 'Dinner Party', status: 'running', hostId: host!, householdId: w.activeHouseholdId, lotId: w.activeLotId,
    guestIds: [guest!], arrivedIds: [guest!], createdAt: 100, startAt: 200, endAt: 380,
    goals: [{ kind: 'chat', text: 'Chat', target: 3, progress: 1, done: false, weight: 1 }], pairs: [], ate: [], ...over,
  };
};

describe('relationship and event fields in saves', () => {
  it('a save without them loads unchanged and valid', () => {
    const world = makeWorld();
    delete world.homeEvents; // saves made before Milestone 5 have no list at all
    const before = snapshot(world);
    const r = migrate(world);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toEqual(before);
    expect(r.state.homeEvents).toBeUndefined();
    expect(validateWorld(r.state, makeContent()).errors).toEqual([]);
  });

  it('events, labels, blocked romance and settled memories survive JSON and migrate untouched', () => {
    const world = makeWorld();
    const [a, b] = Object.keys(world.people) as [string, string];
    world.homeEvents = [event(world), event(world, { id: 'evt_2', status: 'done', score: 88, rating: 'great', catered: 3600 })];
    world.relationships[`${a}>${b}`] = { from: a, to: b, familiarity: 50, friendship: 60, trust: 40, romance: 10, lastInteractionAt: 100, recent: {}, label: 'closeFriend', romanceBlocked: true };
    world.people[a]!.memories.push({ id: 'mem_z', at: 50, kind: 'argument', withId: b, text: 'Fight', importance: 2, count: 2, resolved: true });
    const copy = JSON.parse(JSON.stringify(world)) as WorldState;
    const r = migrate(copy);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toEqual(world);
    expect(validateWorld(r.state, makeContent()).errors).toEqual([]);
    expect(validateWorld(r.state, makeContent()).warnings.filter((w) => w.includes('homeEvents'))).toEqual([]);
  });

  it('repairs unknown labels, odd flags and malformed events', () => {
    const world = makeWorld();
    const [a, b] = Object.keys(world.people) as [string, string];
    world.relationships[`${a}>${b}`] = { from: a, to: b, familiarity: 1, friendship: 2, trust: 3, romance: 4, lastInteractionAt: null, recent: {} };
    const raw = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    (raw.relationships as Record<string, Record<string, unknown>>)[`${a}>${b}`]!.label = 'bestest';
    (raw.relationships as Record<string, Record<string, unknown>>)[`${a}>${b}`]!.romanceBlocked = 'yes';
    ((raw.people as Record<string, { memories: Array<Record<string, unknown>> }>)[a]!).memories.push({ id: 'mem_q', at: 1, kind: 'other', text: 'x', importance: 1, count: 1, resolved: 'maybe' });
    raw.homeEvents = [
      event(world),
      { id: 'evt_bad', type: 'tea-party', status: 'running' },
      null,
      event(world, { id: 'evt_3', guestIds: ['per_a', 5 as unknown as string], goals: [{ kind: 'chat', text: 'Chat', target: 3, progress: 1, done: false, weight: 1 }, { kind: 'juggle' } as never] }),
    ];
    const r = migrate(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rel = r.state.relationships[`${a}>${b}`]!;
    expect(rel.label).toBeUndefined();
    expect(rel.romanceBlocked).toBeUndefined();
    expect(r.state.people[a]!.memories.find((m) => m.id === 'mem_q')!.resolved).toBeUndefined();
    expect(r.state.homeEvents!.map((e) => e.id)).toEqual(['evt_1', 'evt_3']);
    expect(r.state.homeEvents![1]!.guestIds).toEqual(['per_a']);
    expect(r.state.homeEvents![1]!.goals).toHaveLength(1);
  });

  it('drops a homeEvents value that is not a list and reports events with unknown people', () => {
    const world = makeWorld();
    const raw = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    raw.homeEvents = { not: 'a list' };
    const r = migrate(raw);
    expect(r.ok && r.state.homeEvents).toBeUndefined();
    const w2 = makeWorld();
    w2.homeEvents = [event(w2, { hostId: 'per_ghost', guestIds: ['per_ghost'] })];
    const v = validateWorld(w2, makeContent());
    expect(v.errors).toEqual([]);
    expect(v.warnings.join('\n')).toMatch(/homeEvents\[0\].*host who does not exist/);
  });

  it('is idempotent and leaves the schema version alone', () => {
    expect(SCHEMA_VERSION).toBe(1);
    const world = makeWorld();
    world.homeEvents = [event(world)];
    const raw = JSON.parse(JSON.stringify(world)) as Record<string, unknown>;
    fillSocialDefaults(raw);
    const once = JSON.stringify(raw);
    fillSocialDefaults(raw);
    expect(JSON.stringify(raw)).toBe(once);
    fillSocialDefaults({});
    fillSocialDefaults({ relationships: { a: 5 }, people: { b: null }, homeEvents: [1, 'x'] });
  });
});
