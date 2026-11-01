import { describe, expect, it } from 'vitest';
import { LABEL_RULES, relationshipLabel } from '../../../src/core/relations';
import { relKey } from '../../../src/core/ids';
import type { RelLabel } from '../../../src/core/types';
import { applyRelDelta, decayRelationships, ensureRel, labelOf, setBondStatus, syncBonds } from '../../../src/sim/relationships';
import { socialRequirementReason, socialAcceptance } from '../../../src/sim/social';
import { bond, pureCtx, setBoth, socialWorld } from './socialFixtures';

type V = { familiarity: number; friendship: number; trust: number; romance: number };
const v = (o: Partial<V> = {}): V => ({ familiarity: 30, friendship: 0, trust: 0, romance: 0, ...o });
/** Steps through a sequence of values, carrying the previous label (as the game does), and returns the labels. */
const walk = (steps: Array<Partial<V>>, interested = false): RelLabel[] => {
  const out: RelLabel[] = [];
  let prev: RelLabel | undefined;
  for (const s of steps) { prev = relationshipLabel(v(s), undefined, prev, interested); out.push(prev); }
  return out;
};

describe('relationship labels', () => {
  it('derives friend, close friend and best friend from friendship AND trust', () => {
    expect(relationshipLabel(v({ familiarity: 0 }), undefined, undefined, false)).toBe('stranger');
    expect(relationshipLabel(v(), undefined, undefined, false)).toBe('acquaintance');
    expect(relationshipLabel(v({ friendship: 35 }), undefined, undefined, false)).toBe('friend');
    // lots of friendship without trust stays a friend: the axes are separate
    expect(relationshipLabel(v({ friendship: 90, trust: 0 }), undefined, undefined, false)).toBe('friend');
    expect(relationshipLabel(v({ friendship: 65, trust: 35 }), undefined, undefined, false)).toBe('closeFriend');
    expect(relationshipLabel(v({ friendship: 85, trust: 65 }), undefined, undefined, false)).toBe('bestFriend');
    expect(relationshipLabel(v({ friendship: 10, trust: 90 }), undefined, undefined, false)).toBe('acquaintance');
  });

  it('uses hysteresis: a label is entered higher than it is kept', () => {
    const f = LABEL_RULES.friend;
    // hover around the friend threshold: 29, 31, 29, 25, 21, 19
    const labels = walk([{ friendship: f.enter.friendship - 1 }, { friendship: f.enter.friendship + 1 }, { friendship: f.enter.friendship - 1 }, { friendship: 25 }, { friendship: f.stay.friendship + 1 }, { friendship: f.stay.friendship - 1 }]);
    expect(labels).toEqual(['acquaintance', 'friend', 'friend', 'friend', 'friend', 'acquaintance']);
    // close friend: keeps the label while friendship >= 50 and trust >= 15
    expect(walk([{ friendship: 62, trust: 32 }, { friendship: 52, trust: 20 }, { friendship: 52, trust: 14 }, { friendship: 62, trust: 20 }])).toEqual(['closeFriend', 'closeFriend', 'friend', 'friend']);
    // best friend
    expect(walk([{ friendship: 82, trust: 62 }, { friendship: 72, trust: 50 }, { friendship: 68, trust: 50 }])).toEqual(['bestFriend', 'bestFriend', 'closeFriend']);
  });

  it('derives rival and enemy from friendship, with hysteresis, ahead of any friendly label', () => {
    expect(walk([{ friendship: -29 }, { friendship: -31 }, { friendship: -25 }, { friendship: -19 }, { friendship: -62 }, { friendship: -55 }, { friendship: -49 }])).toEqual(
      ['acquaintance', 'rival', 'rival', 'acquaintance', 'enemy', 'enemy', 'rival']);
    // a lot of trust does not save a hostile relationship
    expect(relationshipLabel(v({ friendship: -40, trust: 80 }), undefined, undefined, false)).toBe('rival');
  });

  it('shows a crush only for an interested adult with real romance, and keeps it a little longer', () => {
    expect(walk([{ romance: 30 }, { romance: 36 }, { romance: 30 }, { romance: 24 }], true)).toEqual(['acquaintance', 'crush', 'crush', 'acquaintance']);
    expect(walk([{ romance: 80 }], false)).toEqual(['acquaintance']);
  });

  it('lets a commitment decide: partner, engaged, spouse and ex-partner come from the shared bond', () => {
    for (const s of ['partner', 'engaged', 'spouse', 'exPartner'] as const) expect(relationshipLabel(v({ friendship: -50 }), s, 'enemy', true)).toBe(s);
    expect(relationshipLabel(v({ friendship: 50 }), 'friend', undefined, false)).toBe('friend');
  });

  it('is stored on the relationship and updated by every change and every status change', () => {
    const { w, h } = socialWorld();
    const ada = w.neighbour!;
    const ctx = pureCtx(h);
    applyRelDelta(w.state, w.mira, ada, { familiarity: 20, friendship: 35 }, ctx.now);
    expect(w.state.relationships[relKey(w.mira, ada)]!.label).toBe('friend');
    expect(labelOf(w.state, ada, w.mira)).toBe('stranger');
    setBondStatus(w.state, null, w.mira, ada, 'partner', ctx.now);
    expect(w.state.relationships[relKey(w.mira, ada)]!.label).toBe('partner');
    expect(w.state.relationships[relKey(ada, w.mira)]!.label).toBe('partner');
  });
});

describe('friendship and trust gate different things', () => {
  it('trust gates deep conversations, secrets and favours; friendship alone is not enough', () => {
    const { w, h } = socialWorld();
    const ada = w.neighbour!;
    setBoth(w.state, w.mira, ada, { familiarity: 60, friendship: 70, trust: 0 });
    bond(w.state, w.mira, ada, 'friend');
    const ctx = pureCtx(h);
    const mira = w.state.people[w.mira]!, adaP = w.state.people[ada]!;
    const reason = (id: string) => socialRequirementReason(ctx, mira, adaP, h.content.socials[id]!);
    expect(reason('deepConversation')).toMatch(/doesn't trust/);
    expect(reason('shareSecret')).toMatch(/doesn't trust/);
    expect(reason('askFavor')).toMatch(/doesn't trust/);
    expect(reason('becomeCloseFriends')).toMatch(/doesn't trust/);
    ensureRel(w.state, w.mira, ada).trust = 12;
    expect(reason('deepConversation')).toBeNull();
    expect(reason('shareSecret')).toMatch(/doesn't trust/);
    ensureRel(w.state, w.mira, ada).trust = 40;
    expect(reason('shareSecret')).toBeNull();
    expect(reason('askFavor')).toBeNull();
  });

  it('insults and betrayal lower trust strongly; secrets raise it', () => {
    const { content } = socialWorld().h;
    const s = content.socials;
    expect(s.insult!.success.target.trust!).toBeLessThanOrEqual(-15);
    expect(s.insult!.failure.target.trust!).toBeLessThanOrEqual(-5);
    expect(s.argue!.success.target.trust!).toBeLessThanOrEqual(-6);
    expect(s.betraySecret!.success.target.trust!).toBeLessThanOrEqual(-40);
    expect(s.betraySecret!.failure.target.trust!).toBeLessThanOrEqual(-25);
    expect(s.betraySecret!.success.memory?.importance).toBe(3);
    expect(s.shareSecret!.success.target.trust!).toBeGreaterThanOrEqual(8);
  });

  it('acceptance depends on trust more for deep talks than for jokes', () => {
    const { w, h } = socialWorld();
    const ada = w.neighbour!;
    setBoth(w.state, w.mira, ada, { familiarity: 60, friendship: 50, trust: 50 });
    const ctx = pureCtx(h);
    const mira = w.state.people[w.mira]!, adaP = w.state.people[ada]!;
    const deepHigh = socialAcceptance(ctx, mira, adaP, h.content.socials.deepConversation!);
    const jokeHigh = socialAcceptance(ctx, mira, adaP, h.content.socials.tellJoke!);
    setBoth(w.state, w.mira, ada, { trust: -50 });
    const deepLow = socialAcceptance(ctx, mira, adaP, h.content.socials.deepConversation!);
    const jokeLow = socialAcceptance(ctx, mira, adaP, h.content.socials.tellJoke!);
    expect(deepHigh - deepLow).toBeGreaterThan(jokeHigh - jokeLow);
  });
});

describe('decay without contact', () => {
  const DAY = 1440;
  it('fades slowly after a grace period and never below the floor of the bond', () => {
    const { w } = socialWorld();
    const ada = w.neighbour!;
    setBoth(w.state, w.mira, ada, { familiarity: 60, friendship: 50, trust: 30, romance: 0 });
    bond(w.state, w.mira, ada, 'friend');
    for (const r of Object.values(w.state.relationships)) if (r.from === w.mira || r.to === w.mira) r.lastInteractionAt = 0;
    const rel = () => w.state.relationships[relKey(w.mira, ada)]!;
    decayRelationships(w.state, 2 * DAY);
    expect(rel().friendship).toBe(50); // inside the grace period
    decayRelationships(w.state, 4 * DAY);
    expect(rel().friendship).toBe(49);
    expect(rel().trust).toBe(29.5);
    for (let d = 5; d <= 200; d++) decayRelationships(w.state, d * DAY);
    expect(rel().friendship).toBe(22); // floor of a friend bond
    expect(rel().trust).toBe(8);
    expect(rel().label).toBe('friend');
    expect(rel().familiarity).toBe(60); // people do not forget each other
  });

  it('is neutral for housemates, fades romance to a partner floor and softens resentment', () => {
    const { w } = socialWorld();
    const ada = w.neighbour!;
    // housemates never decay
    setBoth(w.state, w.mira, w.theo, { friendship: 60 });
    for (const r of Object.values(w.state.relationships)) r.lastInteractionAt = 0;
    decayRelationships(w.state, 30 * DAY);
    expect(w.state.relationships[relKey(w.mira, w.theo)]!.friendship).toBe(60);
    // a partner keeps romance 30 at least; resentment fades toward zero but not past it
    setBoth(w.state, w.mira, ada, { familiarity: 60, friendship: -40, trust: -30, romance: 80 });
    bond(w.state, w.mira, ada, 'partner');
    for (const r of Object.values(w.state.relationships)) r.lastInteractionAt = 0;
    for (let d = 4; d <= 200; d++) decayRelationships(w.state, d * DAY);
    const rel = w.state.relationships[relKey(w.mira, ada)]!;
    expect(rel.romance).toBe(30);
    expect(rel.friendship).toBe(0);
    expect(rel.trust).toBe(0);
  });

  it('a recent interaction resets the clock', () => {
    const { w } = socialWorld();
    const ada = w.neighbour!;
    setBoth(w.state, w.mira, ada, { familiarity: 60, friendship: 50 });
    const rel = ensureRel(w.state, w.mira, ada);
    rel.lastInteractionAt = 9 * DAY;
    decayRelationships(w.state, 10 * DAY);
    expect(rel.friendship).toBe(50);
  });
});

describe('bond upkeep', () => {
  it('friends who drifted apart become acquaintances; enemies become rivals; cooled rivals relax', () => {
    const { w, h } = socialWorld();
    const ada = w.neighbour!;
    setBoth(w.state, w.mira, ada, { familiarity: 60, friendship: 12, trust: 0 });
    bond(w.state, w.mira, ada, 'friend');
    syncBonds(w.state, h.events, 0);
    expect(w.state.bonds[[w.mira, ada].sort().join('|')]!.status).toBe('acquaintance');
    setBoth(w.state, w.mira, ada, { friendship: -40 });
    bond(w.state, w.mira, ada, 'friend');
    syncBonds(w.state, h.events, 0);
    expect(Object.values(w.state.bonds).find((b) => b.a === [w.mira, ada].sort()[0] && b.b === [w.mira, ada].sort()[1])!.status).toBe('rival');
    setBoth(w.state, w.mira, ada, { friendship: 0 });
    syncBonds(w.state, h.events, 0);
    expect(Object.values(w.state.bonds).find((b) => b.a === [w.mira, ada].sort()[0] && b.b === [w.mira, ada].sort()[1])!.status).toBe('acquaintance');
  });

  it('leaves housemates and commitments alone', () => {
    const { w, h } = socialWorld();
    setBoth(w.state, w.mira, w.theo, { friendship: 5 });
    bond(w.state, w.mira, w.theo, 'friend');
    const ada = w.neighbour!;
    setBoth(w.state, w.mira, ada, { familiarity: 60, friendship: -50 });
    bond(w.state, w.mira, ada, 'partner');
    syncBonds(w.state, h.events, 0);
    expect(w.state.bonds[[w.mira, w.theo].sort().join('|')]!.status).toBe('friend');
    expect(w.state.bonds[[w.mira, ada].sort().join('|')]!.status).toBe('partner');
  });
});

describe('decay never makes resentment worse', () => {
  it('rivals soften toward zero instead of sinking further', () => {
    const { w } = socialWorld();
    const ada = w.neighbour!;
    setBoth(w.state, w.mira, ada, { familiarity: 60, friendship: -45, trust: -20 });
    bond(w.state, w.mira, ada, 'rival');
    for (const r of Object.values(w.state.relationships)) r.lastInteractionAt = 0;
    decayRelationships(w.state, 4 * 1440);
    const rel = w.state.relationships[relKey(w.mira, ada)]!;
    expect(rel.friendship).toBe(-44.25);
    expect(rel.trust).toBe(-19.25);
  });
});
