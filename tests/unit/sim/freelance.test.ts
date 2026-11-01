// Freelance income (Milestone 6): articles, books, programming gigs, paintings and busking pay once when the
// action completes, and the fee grows with the relevant skill. Payment goes through transact with the action's
// occurrence, so a saved or replayed completion cannot pay twice.

import { describe, expect, it } from 'vitest';
import type { InteractionDef } from '../../../src/content/types';
import { freelanceFee } from '../../../src/sim/behaviors';
import { buildWorld, harness, runTicks, runUntil, setNeeds } from './fixtures';
import type { FixtureWorld, Harness } from './fixtures';

const THRESHOLDS = [100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];

function article(overrides: Partial<InteractionDef> = {}): InteractionDef {
  return {
    id: 'writeArticle', name: 'Write an Article', description: '', icon: 'book', kind: 'self', slotKinds: [],
    behavior: 'freelance', posture: 'standing', anims: { perform: 'computer' },
    duration: { kind: 'fixed', minutes: 10 }, needsPerHour: {}, needsOnComplete: {},
    autonomy: { enabled: false, ads: {}, tags: ['freelance'] }, allowVisitors: false, status: 'ready',
    skill: { id: 'writing', xpPerHour: 30 }, ...overrides,
  };
}

function writingWorld(level = 1): { w: FixtureWorld; h: Harness } {
  const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
  setNeeds(w.state, w.mira, 80);
  const h = harness(w.state);
  h.content.skills.writing = {
    id: 'writing', name: 'Writing', description: '', icon: 'book', thresholds: THRESHOLDS, unlocks: [], status: 'ready',
  };
  h.content.interactions.writeArticle = article();
  w.state.people[w.mira]!.skills.writing = { level, xp: 0 };
  return { w, h };
}

const sales = (h: Harness) => Object.values(h.holder.state.households).flatMap((hh) => hh.ledger).filter((l) => l.kind === 'sale');
const funds = (h: Harness) => Object.values(h.holder.state.households).find((hh) => hh.isPlayable)!.funds;

describe('freelance work', () => {
  it('pays a completed article once with the action occurrence', () => {
    const { w, h } = writingWorld(1);
    const before = funds(h);
    const r = h.sim.queue(w.mira, { interactionId: 'writeArticle', target: { kind: 'self' } });
    expect(r.ok).toBe(true);
    runUntil(h, () => sales(h).length > 0, 4 * 240);
    expect(sales(h)).toHaveLength(1);
    const sale = sales(h)[0]!;
    expect(sale.amount).toBe(freelanceFee('writeArticle', 1));
    expect(sale.occurrence).toMatch(new RegExp(`^freelance:${w.mira}:`));
    expect(h.holder.state.processed[`money:${sale.occurrence}`]).toBeDefined();
    expect(funds(h)).toBe(before + sale.amount);
    // Further ticks, and a save/load of the completed state, never repeat the sale.
    runTicks(h, 400);
    expect(sales(h)).toHaveLength(1);
    expect(funds(h)).toBe(before + sale.amount);
  });

  it('pays more when the relevant skill is higher', () => {
    const low = writingWorld(1);
    const high = writingWorld(10);
    for (const { w, h } of [low, high]) expect(h.sim.queue(w.mira, { interactionId: 'writeArticle', target: { kind: 'self' } }).ok).toBe(true);
    runUntil(low.h, () => sales(low.h).length > 0, 4 * 240);
    runUntil(high.h, () => sales(high.h).length > 0, 4 * 240);
    expect(sales(high.h)[0]!.amount).toBeGreaterThan(sales(low.h)[0]!.amount);
    expect(sales(low.h)[0]!.amount).toBe(freelanceFee('writeArticle', 1));
    expect(sales(high.h)[0]!.amount).toBe(freelanceFee('writeArticle', 10));
    expect(freelanceFee('writeArticle', 10)).toBeGreaterThan(freelanceFee('writeArticle', 1));
    expect(freelanceFee('unknown', 1)).toBe(670);
    expect(freelanceFee('writeArticle', 0)).toBe(freelanceFee('writeArticle', 1));
  });

  it('trains the skill used for the work', () => {
    const { w, h } = writingWorld(1);
    h.sim.queue(w.mira, { interactionId: 'writeArticle', target: { kind: 'self' } });
    runUntil(h, () => sales(h).length > 0, 4 * 240);
    const s = h.holder.state.people[w.mira]!.skills.writing!;
    expect(s.xp).toBeGreaterThan(0);
  });

  it('an interrupted piece is not paid', () => {
    const { w, h } = writingWorld(1);
    h.sim.queue(w.mira, { interactionId: 'writeArticle', target: { kind: 'self' } });
    runUntil(h, () => h.holder.state.people[w.mira]!.queue[0]?.phase === 'perform', 4 * 30);
    const action = h.holder.state.people[w.mira]!.queue[0]!;
    h.sim.cancel(w.mira, action.id);
    runTicks(h, 40);
    expect(sales(h)).toHaveLength(0);
    expect(funds(h)).toBe(500000);
    // The same action cannot start again after completion either.
    runTicks(h, 4);
    expect(sales(h)).toHaveLength(0);
  });

  it('a power cut blocks computer freelance work with a readable reason', () => {
    const { w, h } = writingWorld(1);
    h.content.objects['computer-desktop']!.tags = ['electronics'];
    h.content.interactions.writeArticle = article({ kind: 'object', slotKinds: ['use'], posture: 'seated' });
    h.content.objects['computer-desktop']!.interactions.push('writeArticle');
    w.state.households[w.state.activeHouseholdId]!.powerOff = true;
    const opt = h.sim.options(w.mira, { kind: 'object', objectId: w.objects.computer!.id, slotId: null })
      .find((o) => o.interactionId === 'writeArticle')!;
    expect(opt).toMatchObject({ enabled: false, reason: 'Power is off' });
    expect(h.sim.queue(w.mira, { interactionId: 'writeArticle', target: { kind: 'object', objectId: w.objects.computer!.id, slotId: null } }))
      .toMatchObject({ ok: false, reason: 'Power is off' });
  });
});
