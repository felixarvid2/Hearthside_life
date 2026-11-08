import { describe, expect, it } from 'vitest';
import { relKey } from '../../../src/core/ids';
import type { GameEvent } from '../../../src/core/events';
import { groupCircle, socialRequirementReason } from '../../../src/sim/social';
import { noteGroup, planEvent } from '../../../src/sim/events';
import { head, runTicks, runUntil } from './fixtures';
import { lotLocation, pureCtx, setBoth, setNeeds, socialWorld } from './socialFixtures';

type SocialEvent = Extract<GameEvent, { type: 'social' }>;

/** Mira, Theo and Ada standing close together, all knowing each other. */
function trio(seed = 7) {
  const sw = socialWorld({ seed });
  const { w, h } = sw;
  const ada = w.neighbour!;
  w.state.people[ada]!.location = lotLocation(w.lot, 7, 9);
  for (const id of [w.mira, w.theo, ada]) setNeeds(w.state, id, 90);
  setBoth(w.state, w.mira, ada, { familiarity: 40, friendship: 30 });
  setBoth(w.state, w.theo, ada, { familiarity: 40, friendship: 30 });
  setBoth(w.state, w.mira, w.theo, { familiarity: 40, friendship: 30 });
  h.content.socials.groupChat!.acceptance = 5;
  return { ...sw, ada };
}

describe('group chat', () => {
  it('needs a third person nearby who is free', () => {
    const { w, h, ada } = trio();
    const ctx = pureCtx(h);
    const mira = w.state.people[w.mira]!, adaP = w.state.people[ada]!, theo = w.state.people[w.theo]!;
    const def = h.content.socials.groupChat!;
    expect(groupCircle(ctx, mira, adaP).map((p) => p.id)).toEqual([w.theo]);
    expect(socialRequirementReason(ctx, mira, adaP, def)).toBeNull();
    // too far away, or not met, or busy
    theo.location = lotLocation(w.lot, 1, 1);
    expect(groupCircle(ctx, mira, adaP)).toEqual([]);
    expect(socialRequirementReason(ctx, mira, adaP, def)).toBe('Needs at least three people together.');
    theo.location = lotLocation(w.lot, 9, 8);
    setBoth(w.state, w.mira, w.theo, { familiarity: 0 });
    expect(groupCircle(ctx, mira, adaP)).toEqual([]);
  });

  it('is offered in the social menu once three people stand together', () => {
    const { w, h, ada } = trio();
    const opts = h.sim.options(w.mira, { kind: 'person', personId: ada });
    const g = opts.find((o) => o.interactionId === 'groupChat')!;
    expect(g.enabled).toBe(true);
    w.state.people[w.theo]!.location = lotLocation(w.lot, 1, 1);
    expect(h.sim.options(w.mira, { kind: 'person', personId: ada }).find((o) => o.interactionId === 'groupChat')!.enabled).toBe(false);
  });

  it('pulls the circle in and changes every pair, not only the speaker\'s', () => {
    const { w, h, ada } = trio();
    const before = (a: string, b: string) => w.state.relationships[relKey(a, b)]!.friendship;
    const pairs: Array<[string, string]> = [[w.mira, ada], [ada, w.mira], [w.theo, ada], [ada, w.theo], [w.mira, w.theo], [w.theo, w.mira]];
    const start = pairs.map(([a, b]) => before(a, b));
    const needs = (id: string) => w.state.people[id]!.needs.social;
    for (const id of [w.mira, w.theo, ada]) w.state.people[id]!.needs.social = 40;
    expect(h.sim.queue(w.mira, { interactionId: 'groupChat', target: { kind: 'person', personId: ada } }).ok).toBe(true);
    runUntil(h, () => head(h, w.theo)?.data.role === 'listen', 4 * 60);
    expect(head(h, ada)!.data.role).toBe('listen');
    const n = () => h.log.filter((e): e is SocialEvent => e.type === 'social' && e.socialId === 'groupChat').length;
    runUntil(h, () => n() > 0, 4 * 60);
    runTicks(h, 2);
    const ev = h.log.filter((e): e is SocialEvent => e.type === 'social' && e.socialId === 'groupChat')[0]!;
    expect(ev.accepted).toBe(true);
    expect(ev.line).toMatch(/3 people/);
    pairs.forEach(([a, b], i) => expect(before(a, b), `${a}>${b}`).toBeGreaterThan(start[i]!));
    // the speaker's pairs gain more than the side pair
    const gain = (a: string, b: string) => before(a, b) - start[pairs.findIndex(([x, y]) => x === a && y === b)]!;
    expect(gain(w.mira, ada)).toBeGreaterThan(gain(w.theo, ada));
    for (const id of [w.mira, w.theo, ada]) expect(needs(id)).toBeGreaterThan(40);
    // everybody is released, nothing stays reserved
    expect(head(h, w.theo)).toBeUndefined();
    expect(head(h, ada)).toBeUndefined();
    expect(h.sim.reservations()).toEqual([]);
    expect(w.state.feed.some((f) => /3 people/.test(f.text))).toBe(true);
  });

  it('counts as one chat and every pair mingling for a running event', () => {
    const { w, h, ada } = trio();
    setBoth(w.state, w.mira, ada, { familiarity: 60, friendship: 50 });
    const r = planEvent(pureCtx(h), { type: 'celebration', hostId: w.mira, guestIds: [ada] }, { skipConsent: true });
    expect(r.ok).toBe(true);
    const ev = w.state.homeEvents![0]!;
    ev.status = 'running';
    ev.arrivedIds = [ada];
    noteGroup(pureCtx(h), [w.state.people[w.mira]!, w.state.people[w.theo]!, w.state.people[ada]!], true);
    expect(ev.goals.find((g) => g.kind === 'chat')!.progress).toBe(1);
    expect(ev.pairs).toHaveLength(3);
    noteGroup(pureCtx(h), [w.state.people[w.mira]!, w.state.people[w.theo]!, w.state.people[ada]!], false);
    expect(ev.goals.find((g) => g.kind === 'chat')!.progress).toBe(1);
  });
});
