import { describe, expect, it } from 'vitest';
import { MEMORY_EFFECTS } from '../../../src/core/relations';
import { MEMORY_LIMIT } from '../../../src/core/state';
import type { GameEvent } from '../../../src/core/events';
import type { MemoryKind } from '../../../src/core/types';
import { addMemory, hasRecentMemory, memoryModifier, resolveMemories } from '../../../src/sim/relationships';
import { socialAcceptance, socialRequirementReason } from '../../../src/sim/social';
import { MEMORY_HARD_LIMIT, MEMORY_PER_PERSON } from '../../../src/sim/tuning';
import { runTicks, runUntil } from './fixtures';
import type { Harness } from './fixtures';
import { lotLocation, pureCtx, setBoth, setNeeds, socialWorld } from './socialFixtures';

describe('memory storage is bounded', () => {
  it('merges repeated low-importance memories and counts them', () => {
    const { w } = socialWorld();
    const p = w.state.people[w.mira]!;
    const start = p.memories.length;
    for (let i = 0; i < 5; i++) { w.state.clock.minutes += 10; addMemory(w.state, p, { kind: 'joke', importance: 1, withId: w.theo, text: `Laughed ${i}` }); }
    expect(p.memories).toHaveLength(start + 1);
    const m = p.memories[p.memories.length - 1]!;
    expect(m).toMatchObject({ kind: 'joke', count: 5, text: 'Laughed 4' });
    expect(m.at).toBe(w.state.clock.minutes);
    m.resolved = true;
    addMemory(w.state, p, { kind: 'joke', importance: 1, withId: w.theo, text: 'again' });
    expect(m.resolved).toBeUndefined(); // a new occurrence reopens it
  });

  it('keeps at most a few ordinary memories per other person, and never loses milestones to them', () => {
    const { w } = socialWorld();
    const p = w.state.people[w.mira]!;
    addMemory(w.state, p, { kind: 'becamePartners', importance: 3, withId: w.theo, text: 'Partners' });
    const kinds: MemoryKind[] = ['joke', 'met', 'greatChat', 'argument', 'helped', 'gift', 'insult', 'comforted', 'kiss', 'advice', 'visit', 'party'];
    for (const [i, kind] of kinds.entries()) { w.state.clock.minutes += 1; addMemory(w.state, p, { kind, importance: i % 2 ? 2 : 1, withId: w.theo, text: kind }); }
    const withTheo = p.memories.filter((m) => m.withId === w.theo && m.importance < 3);
    expect(withTheo.length).toBeLessThanOrEqual(MEMORY_PER_PERSON);
    expect(p.memories.some((m) => m.kind === 'becamePartners' && m.importance === 3)).toBe(true);
    // the newest survive
    expect(withTheo.some((m) => m.kind === 'party')).toBe(true);
    expect(withTheo.some((m) => m.kind === 'joke')).toBe(false);
  });

  it('stays within the total limit by dropping the oldest minor memories first', () => {
    const { w } = socialWorld();
    const p = w.state.people[w.mira]!;
    addMemory(w.state, p, { kind: 'promotion', importance: 3, text: 'Promoted' });
    for (let i = 0; i < 100; i++) { w.state.clock.minutes += 1; addMemory(w.state, p, { kind: 'other', importance: i % 5 === 0 ? 2 : 1, withId: `per_x${i}`, text: `m${i}` }); }
    expect(p.memories.length).toBeLessThanOrEqual(MEMORY_LIMIT);
    expect(p.memories.some((m) => m.kind === 'promotion')).toBe(true);
    expect(p.memories.some((m) => m.text === 'm99')).toBe(true);
    expect(p.memories.some((m) => m.text === 'm1')).toBe(false);
  });

  it('has a hard cap that still keeps the permanent milestones', () => {
    const { w } = socialWorld();
    const p = w.state.people[w.mira]!;
    addMemory(w.state, p, { kind: 'married', importance: 3, withId: w.theo, text: 'Married' });
    for (let i = 0; i < 200; i++) { w.state.clock.minutes += 1; addMemory(w.state, p, { kind: 'other', importance: 3, withId: `per_y${i}`, text: `big${i}` }); }
    expect(p.memories.length).toBeLessThanOrEqual(MEMORY_HARD_LIMIT);
    expect(p.memories.some((m) => m.kind === 'married')).toBe(true);
    expect(p.memories.some((m) => m.text === 'big199')).toBe(true);
  });
});

describe('memories change behaviour for a while', () => {
  it('an argument makes the other person less receptive for a day, then it wears off', () => {
    const { w, h } = socialWorld();
    const ada = w.neighbour!;
    setBoth(w.state, w.mira, ada, { familiarity: 50, friendship: 20, trust: 10 });
    const adaP = w.state.people[ada]!, mira = w.state.people[w.mira]!;
    const chat = h.content.socials.chat!;
    const base = socialAcceptance(pureCtx(h), mira, adaP, chat);
    addMemory(w.state, adaP, { kind: 'argument', importance: 2, withId: w.mira, text: 'Fight' });
    const during = socialAcceptance(pureCtx(h), mira, adaP, chat);
    expect(base - during).toBeCloseTo(0.2, 5);
    w.state.clock.minutes += MEMORY_EFFECTS.argument!.minutes - 1;
    expect(memoryModifier(adaP, w.mira, 'friendly', w.state.clock.minutes)).toBe(-0.2);
    w.state.clock.minutes += 2;
    expect(memoryModifier(adaP, w.mira, 'friendly', w.state.clock.minutes)).toBe(0);
    expect(socialAcceptance(pureCtx(h), mira, adaP, chat)).toBeCloseTo(base, 5);
  });

  it('support (an apology) is hurt much less than small talk; a great chat helps deep talks', () => {
    const { w } = socialWorld();
    const p = w.state.people[w.mira]!;
    addMemory(w.state, p, { kind: 'argument', importance: 2, withId: w.theo, text: 'Fight' });
    const t = w.state.clock.minutes;
    expect(memoryModifier(p, w.theo, 'friendly', t)).toBe(-0.2);
    expect(memoryModifier(p, w.theo, 'support', t)).toBe(-0.05);
    expect(memoryModifier(p, w.theo, 'mean', t)).toBe(0);
    addMemory(w.state, p, { kind: 'greatChat', importance: 2, withId: w.theo, text: 'Talked' });
    expect(memoryModifier(p, w.theo, 'deep', t)).toBeCloseTo(-0.2 + 0.1, 5);
  });

  it('a betrayal is remembered for a week and never makes things better by itself', () => {
    const { w } = socialWorld();
    const p = w.state.people[w.mira]!;
    addMemory(w.state, p, { kind: 'betrayal', importance: 3, withId: w.theo, text: 'Betrayed' });
    const t = w.state.clock.minutes;
    expect(memoryModifier(p, w.theo, 'friendly', t + 6 * 1440)).toBe(-0.4);
    expect(memoryModifier(p, w.theo, 'friendly', t + 7 * 1440)).toBe(0);
    expect(p.memories.some((m) => m.kind === 'betrayal')).toBe(true); // the memory itself stays
  });

  it('only counts memories about the person asking, and settled ones stop counting', () => {
    const { w } = socialWorld();
    const p = w.state.people[w.mira]!;
    addMemory(w.state, p, { kind: 'insult', importance: 2, withId: w.theo, text: 'Insulted' });
    expect(memoryModifier(p, w.neighbour!, 'friendly', w.state.clock.minutes)).toBe(0);
    expect(hasRecentMemory(p, w.theo, ['insult'], 60, w.state.clock.minutes)).toBe(true);
    expect(resolveMemories(p, w.theo, ['argument', 'insult'])).toBe(1);
    expect(memoryModifier(p, w.theo, 'friendly', w.state.clock.minutes)).toBe(0);
    expect(hasRecentMemory(p, w.theo, ['insult'], 60, w.state.clock.minutes)).toBe(false);
  });
});

describe('making up', () => {
  type SocialEvent = Extract<GameEvent, { type: 'social' }>;
  const socials = (h: Harness) => h.log.filter((e): e is SocialEvent => e.type === 'social');

  it('needs something to make up for, and a successful make-up settles the quarrel on both sides', () => {
    let accepted = 0;
    for (let seed = 1; seed <= 30 && accepted < 2; seed++) {
      const { w, h } = socialWorld({ seed });
      const ada = w.neighbour!;
      w.state.people[ada]!.location = lotLocation(w.lot, 7, 9);
      setNeeds(w.state, ada, 100);
      setNeeds(w.state, w.mira, 80);
      setBoth(w.state, w.mira, ada, { familiarity: 50, friendship: 5, trust: 5 });
      const mira = w.state.people[w.mira]!, adaP = w.state.people[ada]!;
      expect(socialRequirementReason(pureCtx(h), mira, adaP, h.content.socials.makeUp!)).toBe('Nothing to make up for.');
      addMemory(w.state, mira, { kind: 'argument', importance: 2, withId: ada, text: 'Fight' });
      addMemory(w.state, adaP, { kind: 'argument', importance: 2, withId: w.mira, text: 'Fight' });
      expect(socialRequirementReason(pureCtx(h), mira, adaP, h.content.socials.makeUp!)).toBeNull();
      const before = w.state.relationships[`${ada}>${w.mira}`]!;
      const t0 = before.trust;
      h.sim.queue(w.mira, { interactionId: 'makeUp', target: { kind: 'person', personId: ada } });
      runUntil(h, () => socials(h).length > 0, 4 * 60);
      runTicks(h, 1);
      if (!socials(h)[0]!.accepted) continue;
      accepted++;
      expect(adaP.memories.find((m) => m.kind === 'argument')!.resolved).toBe(true);
      expect(mira.memories.find((m) => m.kind === 'argument')!.resolved).toBe(true);
      expect(w.state.relationships[`${ada}>${w.mira}`]!.trust).toBeGreaterThan(t0 + 5);
      expect(adaP.memories.some((m) => m.kind === 'reconciled')).toBe(true);
      expect(memoryModifier(adaP, w.mira, 'friendly', w.state.clock.minutes)).toBeGreaterThanOrEqual(0);
    }
    expect(accepted).toBe(2);
  });
});
