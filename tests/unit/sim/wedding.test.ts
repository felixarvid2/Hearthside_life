import { describe, expect, it } from 'vitest';
import { pairKey } from '../../../src/core/ids';
import { cancelEvent, canPlanEvent, endEvent, ensureEventEnds, performCeremony, planEvent, startEvent } from '../../../src/sim/events';
import { runUntil } from './fixtures';
import { bond, harness, pureCtx, setBoth, setNeeds, socialWorld } from './socialFixtures';
import type { SocialWorld } from './socialFixtures';
import { fillSocialDefaults } from '../../../src/persistence/schema';
import { cloneState } from '../../../src/core/state';

/** Mira engaged to Ada (the neighbour), both deeply in love. */
function weddingWorld(seed = 11): SocialWorld & { ada: string } {
  const sw = socialWorld({ seed });
  const ada = sw.w.neighbour!;
  setBoth(sw.w.state, sw.w.mira, ada, { familiarity: 80, friendship: 70, trust: 60, romance: 70 });
  bond(sw.w.state, sw.w.mira, ada, 'engaged');
  for (const id of [sw.w.mira, sw.w.theo, ada]) setNeeds(sw.w.state, id, 85);
  return { ...sw, ada };
}
const theEvent = (sw: SocialWorld) => sw.w.state.homeEvents![0]!;
const runTo = (sw: SocialWorld, minute: number) => runUntil(sw.h, () => sw.h.holder.state.clock.minutes >= minute, 6 * 60 * 40);
const bondOf = (sw: SocialWorld, a: string, b: string) => sw.w.state.bonds[pairKey(a, b)]?.status;

describe('planning a wedding', () => {
  it('needs the first guest to be an engaged partner', () => {
    const sw = weddingWorld();
    const { w, h, ada } = sw;
    const mira = w.state.people[w.mira]!;
    expect(canPlanEvent(pureCtx(h), mira, [ada], 'wedding')).toBeNull();
    bond(w.state, w.mira, ada, 'partner');
    expect(canPlanEvent(pureCtx(h), mira, [ada], 'wedding')).toMatch(/must be engaged first/);
    bond(w.state, w.mira, ada, 'spouse');
    expect(canPlanEvent(pureCtx(h), mira, [ada], 'wedding')).toMatch(/already married/);
    bond(w.state, w.mira, ada, 'engaged');
    setBoth(w.state, w.mira, ada, { romance: 30 });
    expect(canPlanEvent(pureCtx(h), mira, [ada], 'wedding')).toMatch(/isn't quite ready/);
  });

  it('allows a fiance(e) who lives in the household and more guests, and needs notice and money', () => {
    const sw = weddingWorld();
    const { w, h } = sw;
    const mira = w.state.people[w.mira]!;
    setBoth(w.state, w.mira, w.theo, { familiarity: 80, friendship: 70, trust: 60, romance: 70 });
    bond(w.state, w.mira, w.theo, 'engaged');
    expect(canPlanEvent(pureCtx(h), mira, [w.theo], 'wedding')).toBeNull();
    expect(canPlanEvent(pureCtx(h), mira, [w.theo, sw.ada], 'wedding')).toBeNull();
    expect(canPlanEvent(pureCtx(h), mira, [sw.ada, w.theo], 'wedding')).toMatch(/lives here/); // only the first guest may live here
    expect(canPlanEvent(pureCtx(h), mira, [w.theo], 'wedding', w.state.clock.minutes + 60)).toMatch(/notice/);
    w.state.households[w.state.activeHouseholdId]!.funds = 500;
    expect(canPlanEvent(pureCtx(h), mira, [w.theo], 'wedding')).toMatch(/Not enough money/);
  });

  it('records two stages, a ceremony entry and the partner; cancelling removes them all', () => {
    const sw = weddingWorld();
    const { w, h, ada } = sw;
    expect(planEvent(pureCtx(h), { type: 'wedding', hostId: w.mira, guestIds: [ada] }).ok).toBe(true);
    const ev = theEvent(sw);
    expect(ev).toMatchObject({ type: 'wedding', status: 'invited', partnerId: ada });
    expect(ev.ceremonyAt).toBe(ev.startAt + 30);
    expect(ev.endAt - ev.startAt).toBe(240);
    expect(w.state.schedule.map((e) => e.kind).sort()).toEqual(['eventEnd', 'eventStage', 'eventStart', 'visitArrive']);
    expect(cancelEvent(pureCtx(h), ev.id).ok).toBe(true);
    expect(w.state.schedule).toEqual([]);
    expect(bondOf(sw, w.mira, ada)).toBe('engaged');
  });
});

describe('the wedding day', () => {
  it('marries the couple at the ceremony (once), then celebrates and pays out at the end', () => {
    const sw = weddingWorld();
    const { w, h, ada } = sw;
    planEvent(pureCtx(h), { type: 'wedding', hostId: w.mira, guestIds: [ada] });
    const ev = theEvent(sw);
    runTo(sw, ev.startAt + 2);
    expect(ev).toMatchObject({ status: 'running', stage: 'ceremony' });
    expect(bondOf(sw, w.mira, ada)).toBe('engaged');
    runTo(sw, ev.ceremonyAt! + 2);
    expect(ev.stage).toBe('celebration');
    expect(ev.ceremony).toBe('done');
    expect(bondOf(sw, w.mira, ada)).toBe('spouse');
    expect(ev.goals.find((g) => g.kind === 'ceremony')!.done).toBe(true);
    const mira = w.state.people[w.mira]!, adaP = w.state.people[ada]!;
    expect(mira.memories.some((m) => m.kind === 'married' && m.withId === ada)).toBe(true);
    expect(adaP.memories.some((m) => m.kind === 'married')).toBe(true);
    expect(mira.moodlets.some((m) => m.id === 'newlywed')).toBe(true);
    expect(w.state.relationships[`${w.mira}>${ada}`]!.label).toBe('spouse');
    expect(w.state.feed.some((f) => /said their vows/.test(f.text))).toBe(true);
    // doing it again changes nothing
    const memories = mira.memories.length;
    performCeremony(pureCtx(h), ev.id);
    expect(mira.memories.length).toBe(memories);
    runTo(sw, ev.endAt + 40);
    expect(ev.status).toBe('done');
    expect(ev.score).toBeGreaterThan(0);
    expect(w.state.homeEvents![0]!.catered).toBe(1800 * 3);
  });

  it('postpones the vows when the couple are not together, and the party goes on', () => {
    const sw = weddingWorld();
    const { w, h, ada } = sw;
    planEvent(pureCtx(h), { type: 'wedding', hostId: w.mira, guestIds: [ada] });
    const ev = theEvent(sw);
    runTo(sw, ev.startAt + 2);
    w.state.people[ada]!.location = { kind: 'offlot', place: 'home', since: 0, until: null };
    runTo(sw, ev.ceremonyAt! + 2);
    expect(ev.ceremony).toBe('missed');
    expect(ev.stage).toBe('celebration');
    expect(bondOf(sw, w.mira, ada)).toBe('engaged');
    expect(w.state.feed.some((f) => /vows had to wait/.test(f.text))).toBe(true);
  });

  it('does not marry a couple who broke up before the ceremony', () => {
    const sw = weddingWorld();
    const { w, h, ada } = sw;
    planEvent(pureCtx(h), { type: 'wedding', hostId: w.mira, guestIds: [ada] });
    const ev = theEvent(sw);
    runTo(sw, ev.startAt + 2);
    bond(w.state, w.mira, ada, 'exPartner');
    runTo(sw, ev.ceremonyAt! + 2);
    expect(ev.ceremony).toBe('missed');
    expect(bondOf(sw, w.mira, ada)).toBe('exPartner');
  });

  it('a household fiance(e) stays on the lot and is married; a lost stage entry is repaired', () => {
    const sw = weddingWorld();
    const { w, h } = sw;
    setBoth(w.state, w.mira, w.theo, { familiarity: 80, friendship: 70, trust: 60, romance: 70 });
    bond(w.state, w.mira, w.theo, 'engaged');
    planEvent(pureCtx(h), { type: 'wedding', hostId: w.mira, guestIds: [w.theo] });
    const ev = theEvent(sw);
    expect(w.state.schedule.some((e) => e.kind === 'visitLeave')).toBe(false);
    runTo(sw, ev.startAt + 2);
    w.state.schedule = w.state.schedule.filter((e) => e.kind !== 'eventStage');
    runTo(sw, ev.ceremonyAt! + 8);
    ensureEventEnds(pureCtx(h));
    expect(bondOf(sw, w.mira, w.theo)).toBe('spouse');
    expect(ev.ceremony).toBe('done');
  });

  it('survives save and load', () => {
    const sw = weddingWorld();
    const { w, h, ada } = sw;
    planEvent(pureCtx(h), { type: 'wedding', hostId: w.mira, guestIds: [ada] });
    runTo(sw, theEvent(sw).ceremonyAt! + 2);
    const copy = cloneState(w.state);
    expect(copy.homeEvents![0]).toMatchObject({ type: 'wedding', ceremony: 'done', partnerId: ada });
    const h2 = harness(copy, h.content);
    const ev2 = copy.homeEvents![0]!;
    startEvent(pureCtx(h2), ev2.id); // not invited any more: nothing happens
    endEvent(pureCtx(h2), ev2.id);
    expect(ev2.status).toBe('done');
    const raw = JSON.parse(JSON.stringify(copy)) as Record<string, unknown>;
    fillSocialDefaults(raw);
    expect((raw.homeEvents as Array<Record<string, unknown>>)[0]).toMatchObject({ type: 'wedding', ceremony: 'done', partnerId: ada });
    expect(((raw.homeEvents as Array<{ goals: Array<{ kind: string }> }>)[0]!.goals).some((g) => g.kind === 'ceremony')).toBe(true);
  });
});
