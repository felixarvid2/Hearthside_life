import { describe, expect, it } from 'vitest';
import { relKey } from '../../../src/core/ids';
import type { GameEvent } from '../../../src/core/events';
import { socialAcceptance, socialRequirementReason } from '../../../src/sim/social';
import { planEvent } from '../../../src/sim/events';
import { runTicks, runUntil } from './fixtures';
import { addPerson, bond, lotLocation, pureCtx, setBoth, setNeeds, socialWorld } from './socialFixtures';
import type { Harness } from './fixtures';
import type { SocialWorld } from './socialFixtures';

type SocialEvent = Extract<GameEvent, { type: 'social' }>;
const socials = (h: Harness) => h.log.filter((e): e is SocialEvent => e.type === 'social');

function talk(h: Harness, from: string, to: string, socialId: string): SocialEvent {
  const r = h.sim.queue(from, { interactionId: socialId, target: { kind: 'person', personId: to } });
  if (!r.ok) throw new Error(r.reason);
  const n = socials(h).length;
  runUntil(h, () => socials(h).length > n, 4 * 60);
  runTicks(h, 1);
  return socials(h)[n]!;
}

const ROMANTIC = ['flirt', 'complimentAppearance', 'holdHands', 'kiss', 'askOnDate', 'askToBePartners'];

/** Mira and Ada on the lot, warm enough for every romantic option. */
function pair(seed = 42, adaDraft?: Parameters<typeof addPerson>[3]): SocialWorld & { ada: string } {
  const sw = socialWorld({ seed });
  const { w } = sw;
  const ada = adaDraft ? addPerson(w, w.state.people[w.neighbour!]!.householdId, 'Bea', adaDraft).id : w.neighbour!;
  w.state.people[ada]!.location = lotLocation(w.lot, 7, 9);
  setNeeds(w.state, ada, 100);
  setNeeds(w.state, w.mira, 80);
  setNeeds(w.state, w.theo, 80);
  w.state.people[w.theo]!.location = lotLocation(w.lot, 1, 8); // out of sight by default
  setBoth(w.state, w.mira, ada, { familiarity: 80, friendship: 70, trust: 60, romance: 60 });
  return { ...sw, ada };
}

describe('romance respects interest, age and consent', () => {
  it('is never accepted by somebody who is not interested, and the options then stay off', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { w, h, ada } = pair(seed);
      w.state.people[ada]!.romance = { interestedIn: ['b'], open: true }; // Mira has frame 'a'
      const ctx = pureCtx(h);
      const mira = w.state.people[w.mira]!, adaP = w.state.people[ada]!;
      for (const id of ROMANTIC) expect(socialAcceptance(ctx, mira, adaP, h.content.socials[id]!), id).toBe(0);
      const before = w.state.relationships[relKey(ada, w.mira)]!.romance;
      const ev = talk(h, w.mira, ada, 'flirt');
      expect(ev.accepted).toBe(false);
      expect(w.state.relationships[relKey(ada, w.mira)]!.romance).toBeLessThanOrEqual(before);
      expect(w.state.relationships[relKey(w.mira, ada)]!.romanceBlocked).toBe(true);
      for (const id of ROMANTIC) expect(socialRequirementReason(pureCtx(h), mira, adaP, h.content.socials[id]!), id).toMatch(/isn't interested/);
    }
  });

  it('is not offered when the person is not open to romance, and not possible with children or teens', () => {
    const base = pair();
    const mira = base.w.state.people[base.w.mira]!;
    const ada = base.w.state.people[base.ada]!;
    ada.romance = { interestedIn: ['any'], open: false };
    const ctx = pureCtx(base.h);
    expect(socialAcceptance(ctx, mira, ada, base.h.content.socials.flirt!)).toBe(0);
    ada.romance = { interestedIn: [], open: true };
    expect(socialAcceptance(ctx, mira, ada, base.h.content.socials.flirt!)).toBe(0);
    ada.romance = { interestedIn: ['any'], open: true };
    mira.romance = { interestedIn: ['any'], open: false };
    expect(socialRequirementReason(ctx, mira, ada, base.h.content.socials.flirt!)).toBe("Mira isn't looking for romance.");
    mira.romance = { interestedIn: ['any'], open: true };
    for (const stage of ['child', 'teen'] as const) {
      ada.lifeStage = stage;
      for (const id of ROMANTIC) {
        expect(socialRequirementReason(pureCtx(base.h), mira, ada, base.h.content.socials[id]!), `${stage} ${id}`).toBe('Only between adults.');
        expect(socialAcceptance(pureCtx(base.h), mira, ada, base.h.content.socials[id]!), `${stage} ${id}`).toBe(0);
      }
      ada.lifeStage = 'adult';
      mira.lifeStage = stage;
      expect(socialRequirementReason(pureCtx(base.h), mira, ada, base.h.content.socials.flirt!)).toBe('Only between adults.');
      mira.lifeStage = 'adult';
    }
    expect(socialRequirementReason(pureCtx(base.h), mira, ada, base.h.content.socials.flirt!)).toBeNull();
  });

  it('is not possible within the family', () => {
    const { w, h, ada } = pair();
    bond(w.state, w.mira, ada, 'friend');
    const key = [w.mira, ada].sort().join('|');
    w.state.bonds[key]!.familyAtoB = w.state.bonds[key]!.a === w.mira ? 'sibling' : 'sibling';
    expect(socialRequirementReason(pureCtx(h), w.state.people[w.mira]!, w.state.people[ada]!, h.content.socials.kiss!)).toBe('Not with family.');
  });

  it('a date asks for the guest to be interested: a "no" is kind and the option is not repeated', () => {
    const { w, h, ada } = pair();
    w.state.people[ada]!.romance = { interestedIn: ['b'], open: true };
    const r = planEvent(pureCtx(h), { type: 'date', hostId: w.mira, guestIds: [ada] });
    expect(r).toEqual({ ok: false, reason: "Ada kindly says they'd rather stay friends." });
    expect(w.state.relationships[relKey(w.mira, ada)]!.romanceBlocked).toBe(true);
    expect(w.state.homeEvents).toEqual([]);
    const again = planEvent(pureCtx(h), { type: 'date', hostId: w.mira, guestIds: [ada] });
    expect(again.ok).toBe(false);
  });
});

describe('romantic options and their context', () => {
  it('commitments are exclusive: nothing but flirting with somebody else, and nobody else is available', () => {
    const { w, h, ada } = pair();
    bond(w.state, w.mira, w.theo, 'partner');
    setBoth(w.state, w.mira, w.theo, { familiarity: 80, friendship: 60, trust: 60, romance: 60 });
    const mira = w.state.people[w.mira]!, adaP = w.state.people[ada]!;
    const s = h.content.socials;
    expect(socialRequirementReason(pureCtx(h), mira, adaP, s.holdHands!)).toBe('Mira is already with Theo.');
    expect(socialRequirementReason(pureCtx(h), mira, adaP, s.askOnDate!)).toBe('Mira is already with Theo.');
    expect(socialRequirementReason(pureCtx(h), mira, adaP, s.kiss!)).toBe('Mira is already with Theo.');
    expect(socialRequirementReason(pureCtx(h), mira, adaP, s.flirt!)).toBeNull(); // possible, at a cost to trust
    // the other way round: Ada is taken
    const sw = pair();
    bond(sw.w.state, sw.ada, sw.w.theo, 'spouse');
    expect(socialRequirementReason(pureCtx(sw.h), sw.w.state.people[sw.w.mira]!, sw.w.state.people[sw.ada]!, sw.h.content.socials.holdHands!)).toBe('Ada is with Theo.');
  });

  it('a taken person is much harder to flirt with', () => {
    const free = pair();
    const taken = pair();
    for (const sw of [free, taken]) setBoth(sw.w.state, sw.w.mira, sw.ada, { familiarity: 30, friendship: 15, trust: 0, romance: 15 });
    bond(taken.w.state, taken.ada, taken.w.theo, 'partner');
    const a = (sw: ReturnType<typeof pair>) => socialAcceptance(pureCtx(sw.h), sw.w.state.people[sw.w.mira]!, sw.w.state.people[sw.ada]!, sw.h.content.socials.flirt!);
    expect(a(free) - a(taken)).toBeGreaterThanOrEqual(0.25);
  });

  it('not in front of an upset partner; in front of a calm one it costs trust', () => {
    const { w, h, ada } = pair(7);
    bond(w.state, w.mira, w.theo, 'partner');
    setBoth(w.state, w.mira, w.theo, { familiarity: 80, friendship: 60, trust: 60, romance: 60 });
    w.state.people[w.theo]!.location = lotLocation(w.lot, 5, 8); // in sight
    setNeeds(w.state, w.theo, 0);
    expect(socialRequirementReason(pureCtx(h), w.state.people[w.mira]!, w.state.people[ada]!, h.content.socials.flirt!)).toBe('Not in front of Theo, who is upset.');
    setNeeds(w.state, w.theo, 90);
    setNeeds(w.state, w.theo, 90);
    expect(socialRequirementReason(pureCtx(h), w.state.people[w.mira]!, w.state.people[ada]!, h.content.socials.flirt!)).toBeNull();
    const trustBefore = w.state.relationships[relKey(w.theo, w.mira)]!.trust;
    const friendshipToAda = w.state.relationships[relKey(w.theo, ada)]?.friendship ?? 0;
    talk(h, w.mira, ada, 'flirt');
    const rel = w.state.relationships[relKey(w.theo, w.mira)]!;
    expect(rel.trust).toBeLessThanOrEqual(trustBefore - 14);
    expect(w.state.relationships[relKey(w.theo, ada)]!.friendship).toBeLessThan(friendshipToAda);
    expect(w.state.people[w.theo]!.moodlets.some((m) => m.id === 'jealous')).toBe(true);
    expect(w.state.people[w.theo]!.memories.some((m) => m.kind === 'jealousy' && m.withId === w.mira)).toBe(true);
  });

  it('a partner who does not see it loses nothing', () => {
    const { w, h, ada } = pair(7);
    bond(w.state, w.mira, w.theo, 'partner');
    setBoth(w.state, w.mira, w.theo, { familiarity: 80, friendship: 60, trust: 60, romance: 60 });
    w.state.people[w.theo]!.location = { ...lotLocation(w.lot, 0, 0) }; // far corner, more than 8 m away
    const trustBefore = w.state.relationships[relKey(w.theo, w.mira)]!.trust;
    talk(h, w.mira, ada, 'flirt');
    expect(w.state.relationships[relKey(w.theo, w.mira)]!.trust).toBe(trustBefore);
  });

  it('needs the other person in a decent mood', () => {
    const { w, h, ada } = pair();
    setNeeds(w.state, ada, 0);
    expect(socialRequirementReason(pureCtx(h), w.state.people[w.mira]!, w.state.people[ada]!, h.content.socials.flirt!)).toBe("Ada isn't in the mood.");
    setNeeds(w.state, ada, 90);
    expect(socialRequirementReason(pureCtx(h), w.state.people[w.mira]!, w.state.people[ada]!, h.content.socials.flirt!)).toBeNull();
  });

  it('kisses and proposals need privacy', () => {
    const { w, h, ada } = pair();
    const mira = w.state.people[w.mira]!, adaP = w.state.people[ada]!;
    const extra1 = addPerson(w, w.state.people[ada]!.householdId, 'Cy', {}, { x: 8, z: 7 });
    const extra2 = addPerson(w, w.state.people[ada]!.householdId, 'Di', {}, { x: 9, z: 7 });
    w.state.people[w.theo]!.location = lotLocation(w.lot, 9, 9);
    expect(socialRequirementReason(pureCtx(h), mira, adaP, h.content.socials.kiss!)).toBe('Not with people watching.');
    extra1.location = { kind: 'offlot', place: 'home', since: 0, until: null };
    extra2.location = { kind: 'offlot', place: 'home', since: 0, until: null };
    w.state.people[w.theo]!.location = lotLocation(w.lot, 1, 8);
    expect(socialRequirementReason(pureCtx(h), mira, adaP, h.content.socials.kiss!)).toBeNull();
  });

  it('rejections are gentle for every romantic social: no friendship or trust loss, a small moodlet for both', () => {
    const { h } = socialWorld();
    const romantic = Object.values(h.content.socials).filter((d) => d.category === 'romantic');
    expect(romantic.length).toBeGreaterThanOrEqual(8);
    for (const d of romantic) {
      if (d.id === 'marry') continue; // a postponed wedding, not a rejection
      expect(d.failure.actor.friendship ?? 0, d.id).toBeGreaterThanOrEqual(0);
      expect(d.failure.target.friendship ?? 0, d.id).toBeGreaterThanOrEqual(0);
      expect(d.failure.actor.trust ?? 0, d.id).toBeGreaterThanOrEqual(0);
      expect(d.failure.target.trust ?? 0, d.id).toBeGreaterThanOrEqual(0);
      expect(d.failure.actorMoodlet, d.id).toBeTruthy();
      expect(d.failure.targetMoodlet, d.id).toBeTruthy();
      expect(d.requires.romantic, d.id).toBe(true);
    }
  });

  it('a declined advance leaves a memory that makes the next one less likely for a while', () => {
    const { w, h, ada } = pair(3);
    setBoth(w.state, w.mira, ada, { familiarity: 30, friendship: 15, trust: 0, romance: 15 });
    const ctx = pureCtx(h);
    const mira = w.state.people[w.mira]!, adaP = w.state.people[ada]!;
    const base = socialAcceptance(ctx, mira, adaP, h.content.socials.holdHands!);
    adaP.memories.push({ id: 'mem_x', at: w.state.clock.minutes - 60, kind: 'rejected', withId: w.mira, text: 'x', importance: 1, count: 1 });
    const after = socialAcceptance(pureCtx(h), mira, adaP, h.content.socials.holdHands!);
    expect(base - after).toBeCloseTo(0.15, 5);
  });
});

describe('status steps', () => {
  it('partners, engagement, marriage and break-up follow their rules and set the shared bond only when accepted', () => {
    let accepted = 0;
    for (let seed = 1; seed <= 25 && accepted < 1; seed++) {
      const { w, h, ada } = pair(seed);
      setBoth(w.state, w.mira, ada, { familiarity: 90, friendship: 80, trust: 70, romance: 90 });
      const ev = talk(h, w.mira, ada, 'askToBePartners');
      const key = [w.mira, ada].sort().join('|');
      if (!ev.accepted) { expect(w.state.bonds[key]?.status).not.toBe('partner'); continue; }
      accepted++;
      expect(w.state.bonds[key]!.status).toBe('partner');
      expect(w.state.relationships[relKey(w.mira, ada)]!.label).toBe('partner');
      expect(w.state.people[w.mira]!.memories.some((m) => m.kind === 'becamePartners' && m.importance === 3)).toBe(true);
      // now engaged and married are available, and starting something else is not
      const mira = w.state.people[w.mira]!, adaP = w.state.people[ada]!;
      expect(socialRequirementReason(pureCtx(h), mira, adaP, h.content.socials.askToBePartners!)).toBe('Already partners.');
      expect(socialRequirementReason(pureCtx(h), mira, adaP, h.content.socials.propose!)).toBeNull();
      expect(socialRequirementReason(pureCtx(h), mira, adaP, h.content.socials.marry!)).toBe('Needs to be engaged first.');
      // break up is a decision one person can make
      const out = talk(h, w.mira, ada, 'breakUp');
      expect(out.accepted).toBe(true);
      expect(w.state.bonds[key]!.status).toBe('exPartner');
      expect(adaP.moodlets.some((m) => m.id === 'heartbroken')).toBe(true);
      expect(adaP.memories.some((m) => m.kind === 'breakup' && m.importance === 3)).toBe(true);
    }
    expect(accepted).toBe(1);
  });
});
