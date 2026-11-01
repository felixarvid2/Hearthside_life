import { describe, expect, it } from 'vitest';
import { atDayMinute } from '../../../src/core/clock';
import { relKey } from '../../../src/core/ids';
import { cloneState } from '../../../src/core/state';
import type { HomeEvent } from '../../../src/core/types';
import {
  activeEvents, canPlanEvent, cancelEvent, dailyReconciliation, defaultStart, endEvent, noteEat, noteSocial, planEvent, runEventEntry, startEvent,
} from '../../../src/sim/events';
import { runUntil } from './fixtures';
import { addPerson, harness, lotLocation, pureCtx, setBoth, setNeeds, socialContent, socialWorld } from './socialFixtures';
import type { SocialWorld } from './socialFixtures';

const MIRA_HOME = (sw: SocialWorld) => sw.w.state.households[sw.w.state.activeHouseholdId]!;

/** Mira's date-ready relationship with Ada (the neighbour), Ada at home off-lot. */
function dateWorld(seed = 42): SocialWorld & { ada: string } {
  const sw = socialWorld({ seed });
  const ada = sw.w.neighbour!;
  setBoth(sw.w.state, sw.w.mira, ada, { familiarity: 60, friendship: 50, trust: 30, romance: 40 });
  setNeeds(sw.w.state, sw.w.mira, 80);
  setNeeds(sw.w.state, sw.w.theo, 80);
  setNeeds(sw.w.state, ada, 90);
  return { ...sw, ada };
}

const theEvent = (sw: SocialWorld): HomeEvent => sw.w.state.homeEvents![0]!;
const runTo = (sw: SocialWorld, minute: number) => runUntil(sw.h, () => sw.h.holder.state.clock.minutes >= minute, 4 * 60 * 40);

describe('planning an event', () => {
  it('records the invitation, the arrival, the start and the end; nothing is paid before the start', () => {
    const sw = dateWorld();
    const { w, h, ada } = sw;
    const funds = MIRA_HOME(sw).funds;
    const r = planEvent(pureCtx(h), { type: 'date', hostId: w.mira, guestIds: [ada] }, { skipConsent: true });
    expect(r.ok).toBe(true);
    const ev = theEvent(sw);
    expect(ev).toMatchObject({ type: 'date', status: 'invited', hostId: w.mira, guestIds: [ada], arrivedIds: [] });
    expect(ev.startAt).toBe(atDayMinute(0, 19 * 60));
    expect(ev.endAt - ev.startAt).toBe(150);
    expect(ev.goals.map((g) => g.kind)).toEqual(['chat', 'eat', 'romantic']);
    const sched = w.state.schedule.map((e) => `${e.kind}:${e.occurrence.split(':')[0]}`).sort();
    expect(sched).toEqual(['eventEnd:eventend', 'eventStart:eventstart', 'visitArrive:evarrive']);
    const arrive = w.state.schedule.find((e) => e.kind === 'visitArrive')!;
    expect(arrive.at).toBeLessThan(ev.startAt);
    expect(arrive.at).toBeGreaterThanOrEqual(ev.startAt - 10);
    expect(arrive.data).toMatchObject({ eventId: ev.id, invitedBy: w.mira });
    expect(MIRA_HOME(sw).funds).toBe(funds);
    expect(w.state.feed.some((f) => f.text.includes('planned a date'))).toBe(true);
    // only one gathering at a time, and the state stays plain JSON
    expect(canPlanEvent(pureCtx(h), w.state.people[w.mira]!, [ada], 'date')).toBe('Another gathering is already planned.');
    expect(JSON.parse(JSON.stringify(w.state.homeEvents))).toEqual(w.state.homeEvents);
  });

  it('checks the host, the guests, the notice and the money', () => {
    const sw = dateWorld();
    const { w, h, ada } = sw;
    const ctx = () => pureCtx(h);
    const mira = w.state.people[w.mira]!;
    expect(canPlanEvent(ctx(), mira, [], 'dinnerParty')).toBe('Invite at least 2 guests.');
    expect(canPlanEvent(ctx(), mira, [ada], 'dinnerParty')).toBe('Invite at least 2 guests.');
    expect(canPlanEvent(ctx(), mira, [w.theo], 'houseParty')).toBe('Invite at least 3 guests.');
    expect(canPlanEvent(ctx(), mira, [w.theo, ada], 'dinnerParty')).toBe('Theo lives here.');
    expect(canPlanEvent(ctx(), mira, [ada], 'date', w.state.clock.minutes + 10)).toMatch(/notice/);
    expect(canPlanEvent(ctx(), mira, [ada], 'date', w.state.clock.minutes + 5 * 1440)).toMatch(/at most 3 days/i);
    expect(canPlanEvent(ctx(), mira, [ada], 'date')).toBeNull();
    MIRA_HOME(sw).funds = 1000;
    expect(canPlanEvent(ctx(), mira, [ada], 'date')).toMatch(/Not enough money for food/);
    MIRA_HOME(sw).funds = 500000;
    w.state.people[ada]!.location = { kind: 'offlot', place: 'work', since: 0, until: null };
    expect(canPlanEvent(ctx(), mira, [ada], 'date')).toBe("Ada isn't home right now.");
    w.state.people[ada]!.location = { kind: 'offlot', place: 'home', since: 0, until: null };
    setBoth(w.state, w.mira, ada, { familiarity: 0 });
    expect(canPlanEvent(ctx(), mira, [ada], 'date')).toBe("Hasn't met Ada yet.");
    // children cannot host
    mira.lifeStage = 'teen';
    expect(canPlanEvent(ctx(), mira, [ada], 'date')).toBe('Only adults can plan gatherings.');
  });

  it('picks the evening, or tomorrow evening when it is late', () => {
    const lead = { leadMinutes: 60 };
    expect(defaultStart(atDayMinute(0, 8 * 60), lead)).toBe(atDayMinute(0, 19 * 60));
    expect(defaultStart(atDayMinute(0, 18 * 60 + 30), lead)).toBe(atDayMinute(0, 19 * 60 + 30));
    expect(defaultStart(atDayMinute(0, 21 * 60 + 30), lead)).toBe(atDayMinute(1, 19 * 60));
  });

  it('can be called off before it starts: invitations are withdrawn and nothing else happens', () => {
    const sw = dateWorld();
    const { w, h, ada } = sw;
    planEvent(pureCtx(h), { type: 'date', hostId: w.mira, guestIds: [ada] }, { skipConsent: true });
    const id = theEvent(sw).id;
    const friendship = w.state.relationships[relKey(ada, w.mira)]!.friendship;
    expect(cancelEvent(pureCtx(h), id)).toEqual({ ok: true });
    expect(theEvent(sw).status).toBe('cancelled');
    expect(w.state.schedule).toEqual([]);
    expect(w.state.relationships[relKey(ada, w.mira)]!.friendship).toBeLessThan(friendship);
    expect(activeEvents(w.state)).toEqual([]);
    expect(cancelEvent(pureCtx(h), id).ok).toBe(false);
    runTo(sw, atDayMinute(0, 21 * 60));
    expect(w.state.people[ada]!.location.kind).toBe('offlot');
    expect(MIRA_HOME(sw).ledger.some((l) => l.kind === 'groceries')).toBe(false);
  });
});

describe('running an event', () => {
  it('guests arrive, the food is set out and paid once, goals are counted, and the guest goes home politely', () => {
    const sw = dateWorld(5);
    const { w, h, ada } = sw;
    const funds = MIRA_HOME(sw).funds;
    planEvent(pureCtx(h), { type: 'date', hostId: w.mira, guestIds: [ada] }, { skipConsent: true });
    const ev = theEvent(sw);
    runTo(sw, ev.startAt - 1);
    expect(w.state.people[ada]!.location.kind).toBe('lot'); // arrived a few minutes early
    expect(ev.arrivedIds).toEqual([ada]);
    expect(ev.status).toBe('invited');
    runTo(sw, ev.startAt + 1);
    expect(ev.status).toBe('running');
    expect(ev.catered).toBe(1400 * 3);
    expect(MIRA_HOME(sw).funds).toBe(funds - 4200);
    const meal = Object.values(w.state.items).find((i) => i.kind === 'meal' && i.ownerHouseholdId === null)!;
    expect(meal).toMatchObject({ lotId: w.lot.id, portions: 3 });
    expect(meal.position.onObjectId).toBe(w.objects.table!.id);
    expect(MIRA_HOME(sw).ledger.filter((l) => l.occurrence === `event:${ev.id}:food`)).toHaveLength(1);
    // running it again changes nothing
    startEvent(pureCtx(h), ev.id);
    expect(MIRA_HOME(sw).funds).toBe(funds - 4200);
    runTo(sw, ev.endAt + 30);
    expect(ev.status).toBe('done');
    expect(w.state.people[ada]!.location.kind).toBe('offlot');
    expect(w.state.feed.some((f) => f.text === 'Ada went home.')).toBe(true);
  });

  it('counts goals from socials and meals: talking with the guest, jokes, romance, mingling and eating', () => {
    const sw = dateWorld();
    const { w, h, ada } = sw;
    planEvent(pureCtx(h), { type: 'date', hostId: w.mira, guestIds: [ada] }, { skipConsent: true });
    const ev = theEvent(sw);
    runTo(sw, ev.startAt + 1);
    const ctx = pureCtx(h);
    const mira = w.state.people[w.mira]!, theo = w.state.people[w.theo]!, adaP = w.state.people[ada]!;
    const s = h.content.socials;
    const goal = (kind: string) => ev.goals.find((g) => g.kind === kind)!;
    noteSocial(ctx, mira, adaP, s.chat!, false); // refused: not counted
    expect(goal('chat').progress).toBe(0);
    noteSocial(ctx, mira, theo, s.chat!, true); // the household talking among themselves is not the event
    expect(goal('chat').progress).toBe(0);
    noteSocial(ctx, mira, adaP, s.waveGoodbye!, true); // goodbyes do not count
    expect(goal('chat').progress).toBe(0);
    noteSocial(ctx, mira, adaP, s.chat!, true);
    noteSocial(ctx, adaP, mira, s.tellJoke!, true);
    expect(goal('chat').progress).toBe(2);
    expect(goal('chat').done).toBe(true);
    expect(goal('romantic').progress).toBe(0);
    noteSocial(ctx, mira, adaP, s.holdHands!, true);
    expect(goal('romantic')).toMatchObject({ progress: 1, done: true });
    noteEat(ctx, mira);
    noteEat(ctx, mira); // the same person eating twice counts once
    expect(goal('eat').progress).toBe(1);
    noteEat(ctx, adaP);
    expect(goal('eat').done).toBe(true);
    expect(ev.goals.every((g) => g.done)).toBe(true);
  });

  it('scores, rates and pays once: relationships, needs, moodlets and memories', () => {
    const sw = dateWorld();
    const { w, h, ada } = sw;
    planEvent(pureCtx(h), { type: 'date', hostId: w.mira, guestIds: [ada] }, { skipConsent: true });
    const ev = theEvent(sw);
    runTo(sw, ev.startAt + 1);
    const ctx = pureCtx(h);
    const mira = w.state.people[w.mira]!, adaP = w.state.people[ada]!;
    noteSocial(ctx, mira, adaP, h.content.socials.chat!, true);
    noteSocial(ctx, mira, adaP, h.content.socials.deepConversation!, true);
    noteSocial(ctx, mira, adaP, h.content.socials.kiss!, true);
    noteEat(ctx, mira);
    noteEat(ctx, adaP);
    const before = { ...w.state.relationships[relKey(ada, w.mira)]! };
    runTo(sw, ev.endAt + 1);
    expect(ev.status).toBe('done');
    expect(ev.score).toBeGreaterThanOrEqual(85);
    expect(ev.rating).toBe('great');
    const after = w.state.relationships[relKey(ada, w.mira)]!;
    expect(after.romance).toBeGreaterThan(before.romance + 10);
    expect(after.friendship).toBeGreaterThan(before.friendship + 4);
    expect(adaP.moodlets.some((m) => m.id === 'greatDateGlow')).toBe(true);
    expect(adaP.memories.some((m) => m.kind === 'firstDate' && m.withId === w.mira && m.importance === 3)).toBe(true);
    expect(mira.memories.some((m) => m.kind === 'firstDate' && m.withId === ada)).toBe(true);
    expect(w.state.processed[`eventdone:${ev.id}`]).toBeDefined();
    // a second end (replay, double entry) pays nothing more
    const snapshot = JSON.stringify([w.state.relationships, w.state.people, MIRA_HOME(sw).funds]);
    endEvent(pureCtx(h), ev.id);
    runEventEntry(pureCtx(h), { occurrence: `eventend:${ev.id}`, at: 0, kind: 'eventEnd', data: { eventId: ev.id } });
    expect(JSON.stringify([w.state.relationships, w.state.people, MIRA_HOME(sw).funds])).toBe(snapshot);
  });

  it('a miserable, silent evening is rated poor and costs a little', () => {
    const sw = dateWorld();
    const { w, h, ada } = sw;
    planEvent(pureCtx(h), { type: 'date', hostId: w.mira, guestIds: [ada] }, { skipConsent: true });
    const ev = theEvent(sw);
    // the guest arrives but nobody talks or eats, and they are in a foul mood
    w.state.people[ada]!.location = lotLocation(w.lot, 7, 9);
    ev.arrivedIds = [ada];
    ev.status = 'running';
    setNeeds(w.state, ada, 0);
    const before = { ...w.state.relationships[relKey(ada, w.mira)]! };
    endEvent(pureCtx(h), ev.id);
    expect(ev.rating).toBe('poor');
    expect(ev.score!).toBeLessThan(30);
    const after = w.state.relationships[relKey(ada, w.mira)]!;
    expect(after.friendship).toBeLessThan(before.friendship);
    expect(after.romance).toBeLessThan(before.romance);
    expect(w.state.people[ada]!.memories.some((m) => m.kind === 'badDate' && m.importance === 2)).toBe(true);
    expect(w.state.people[ada]!.moodlets.some((m) => m.id === 'awkwardDate')).toBe(true);
  });

  it('is identical after a save and load in the middle, and a finished event is never paid again after loading', () => {
    const run = (reloadAt: number | null) => {
      const sw = dateWorld(11);
      const { w, h, ada } = sw;
      planEvent(pureCtx(h), { type: 'date', hostId: w.mira, guestIds: [ada] }, { skipConsent: true });
      const ev = theEvent(sw);
      let cur: SocialWorld = sw;
      const step = (to: number) => runUntil(cur.h, () => cur.h.holder.state.clock.minutes >= to, 4 * 60 * 40);
      if (reloadAt !== null) {
        step(reloadAt);
        const copy = cloneState(cur.h.holder.state);
        cur = { w: { ...cur.w, state: copy }, h: harness(copy, socialContent()) };
      }
      step(ev.endAt + 60);
      return cur;
    };
    const plain = run(null);
    for (const at of [atDayMinute(0, 18 * 60 + 55), atDayMinute(0, 19 * 60 + 40), atDayMinute(0, 21 * 60 + 29)]) {
      const reloaded = run(at);
      expect(JSON.stringify(reloaded.h.holder.state)).toBe(JSON.stringify(plain.h.holder.state));
    }
    // load after the end and keep playing for days: no second reward, no second meal
    const done = cloneState(plain.h.holder.state);
    const h2 = harness(done, socialContent());
    const rel = JSON.stringify(done.relationships[relKey(plain.w.neighbour!, plain.w.mira)]);
    const funds = done.households[done.activeHouseholdId]!.funds;
    runUntil(h2, () => h2.holder.state.clock.minutes >= atDayMinute(1, 12 * 60), 4 * 60 * 40);
    expect(done.households[done.activeHouseholdId]!.ledger.filter((l) => l.occurrence?.startsWith('event:')).length).toBe(1);
    expect(done.households[done.activeHouseholdId]!.funds).toBeLessThanOrEqual(funds);
    expect(done.homeEvents!.filter((e) => e.status === 'done')).toHaveLength(1);
    // (relationships may move with new contact, but the reward moodlet and memory are not duplicated)
    expect(JSON.parse(rel).label).toBeDefined();
    expect(done.people[plain.w.neighbour!]!.memories.filter((m) => m.kind === 'firstDate').length).toBeLessThanOrEqual(1);
  });
});

describe('a party with three guests', () => {
  function partyWorld(seed = 3) {
    const sw = socialWorld({ seed, visitors: false });
    const { w } = sw;
    const nh = w.state.people[w.neighbour!]!.householdId;
    const bea = addPerson(w, nh, 'Bea'), cy = addPerson(w, nh, 'Cy');
    const guests = [w.neighbour!, bea.id, cy.id];
    for (const g of guests) { setBoth(w.state, w.mira, g, { familiarity: 40, friendship: 35, trust: 15 }); setNeeds(w.state, g, 85); }
    setNeeds(w.state, w.mira, 80);
    setNeeds(w.state, w.theo, 80);
    w.state.settings.autonomy = true;
    return { ...sw, guests };
  }

  it('invites all three, serves food for everyone, runs to the end and sends everybody home', () => {
    const sw = partyWorld();
    const { w, h, guests } = sw;
    const r = planEvent(pureCtx(h), { type: 'dinnerParty', hostId: w.mira, guestIds: guests });
    expect(r.ok).toBe(true);
    const ev = theEvent(sw);
    expect(ev.goals.map((g) => `${g.kind}:${g.target}`)).toEqual(['eat:3', 'chat:5', 'mingle:2']);
    runTo(sw, ev.startAt + 30);
    expect(ev.arrivedIds.sort()).toEqual([...guests].sort());
    expect(ev.catered).toBe(1200 * 5);
    expect(Object.values(w.state.items).find((i) => i.kind === 'meal' && i.ownerHouseholdId === null)!.portions).toBeLessThanOrEqual(5);
    runTo(sw, ev.endAt + 40);
    expect(ev.status).toBe('done');
    expect(typeof ev.score).toBe('number');
    for (const g of guests) expect(w.state.people[g]!.location.kind).toBe('offlot');
    expect(w.state.feed.filter((f) => f.text.startsWith('A ') || f.text.startsWith('An ')).length).toBeGreaterThan(0);
    expect(w.state.processed[`eventdone:${ev.id}`]).toBeDefined();
  });

  it('is deterministic: the same seed gives the same party', () => {
    const play = () => {
      const sw = partyWorld(9);
      planEvent(pureCtx(sw.h), { type: 'dinnerParty', hostId: sw.w.mira, guestIds: sw.guests });
      runTo(sw, theEvent(sw).endAt + 60);
      return JSON.stringify(sw.h.holder.state);
    };
    expect(play()).toBe(play());
  });

  it('guests who are busy elsewhere are just missed; the score reflects attendance', () => {
    const sw = partyWorld();
    const { w, h, guests } = sw;
    planEvent(pureCtx(h), { type: 'dinnerParty', hostId: w.mira, guestIds: guests });
    const ev = theEvent(sw);
    for (const g of guests.slice(1)) w.state.people[g]!.location = { kind: 'offlot', place: 'work', since: 0, until: null };
    runTo(sw, ev.endAt + 60);
    expect(ev.arrivedIds).toEqual([guests[0]]);
    expect(ev.score!).toBeLessThanOrEqual(34);
  });
});

describe('visits that just happen', () => {
  it('the first neighbour visit is a welcome event with a goal, scored and paid once when the visitor leaves', () => {
    const w = socialWorld({ visitors: true, autonomy: true }).w;
    const h = harness(w.state, socialContent());
    const ada = w.neighbour!;
    runUntil(h, () => w.state.homeEvents!.length > 0, 4 * 60 * 12);
    const ev = w.state.homeEvents![0]!;
    expect(ev).toMatchObject({ type: 'welcomeWagon', status: 'running', guestIds: [ada], arrivedIds: [ada] });
    expect(ev.goals[0]).toMatchObject({ kind: 'chat', target: 2 });
    runUntil(h, () => ev.status === 'done', 4 * 60 * 6);
    expect(ev.rating).toBeDefined();
    expect(w.state.processed[`eventdone:${ev.id}`]).toBeDefined();
    runUntil(h, () => w.state.people[ada]!.location.kind === 'offlot', 4 * 60 * 2);
    expect(w.state.feed.some((f) => f.text === 'Ada went home.')).toBe(true);
  });

  it('a friend who recently quarrelled with the household comes by to clear the air, at most once a week', () => {
    const sw = socialWorld({ visitors: true });
    const { w, h } = sw;
    const ada = w.neighbour!;
    setBoth(w.state, w.mira, ada, { familiarity: 50, friendship: 5, trust: 5 });
    const ctx = () => pureCtx(h);
    dailyReconciliation(ctx(), 1);
    expect(w.state.schedule.some((e) => e.personId === ada)).toBe(false); // no quarrel, no visit
    w.state.people[ada]!.memories.push({ id: 'mem_q', at: w.state.clock.minutes - 100, kind: 'argument', withId: w.mira, text: 'Fight', importance: 2, count: 1 });
    let scheduledOn = -1;
    for (let d = 1; d <= 14 && scheduledOn < 0; d++) {
      dailyReconciliation(ctx(), d);
      if (w.state.schedule.some((e) => e.personId === ada && e.data?.reconcile === true)) scheduledOn = d;
    }
    expect(scheduledOn).toBeGreaterThan(0);
    const entry = w.state.schedule.find((e) => e.personId === ada)!;
    expect(entry.data).toMatchObject({ reconcile: true, invitedBy: w.mira });
    w.state.schedule = [];
    dailyReconciliation(ctx(), scheduledOn + 1);
    expect(w.state.schedule).toEqual([]); // cooldown
  });
});

describe('guests in the house when a date is asked in person', () => {
  it('a visitor already on the lot is held until the date is over', () => {
    const sw = dateWorld();
    const { w, h, ada } = sw;
    w.state.people[ada]!.location = lotLocation(w.lot, 7, 9);
    w.state.schedule.push({ occurrence: `leave:${ada}:0`, at: w.state.clock.minutes + 60, kind: 'visitLeave', personId: ada });
    expect(planEvent(pureCtx(h), { type: 'date', hostId: w.mira, guestIds: [ada] }, { skipConsent: true }).ok).toBe(true);
    const ev = theEvent(sw);
    expect(ev.arrivedIds).toEqual([ada]);
    const leave = w.state.schedule.filter((e) => e.kind === 'visitLeave' && e.personId === ada);
    expect(leave).toHaveLength(1);
    expect(leave[0]!.at).toBeGreaterThanOrEqual(ev.endAt);
  });
});

describe('the phone', () => {
  it('"Plan an Event" asks the interface to open the planner', () => {
    const { w, h } = socialWorld();
    const r = h.sim.queue(w.mira, { interactionId: 'planEvent', target: { kind: 'self' } });
    expect(r.ok).toBe(true);
    runUntil(h, () => h.log.some((e) => e.type === 'ui.request'), 4 * 10);
    expect(h.log.find((e) => e.type === 'ui.request')).toMatchObject({ what: 'planEvent', personId: w.mira });
    const child = socialWorld();
    child.w.state.people[child.w.mira]!.lifeStage = 'child';
    expect(child.h.sim.queue(child.w.mira, { interactionId: 'planEvent', target: { kind: 'self' } })).toEqual({ ok: false, reason: 'Only adults can plan gatherings.' });
  });

  it('asking somebody on a date by phone is answered like asking in person: a yes plans the date, a no is kind', () => {
    let yes = 0, no = 0;
    for (let seed = 1; seed <= 30 && (yes < 1 || no < 1); seed++) {
      const sw = dateWorld(seed);
      const { w, h, ada } = sw;
      expect(h.sim.queue(w.mira, { interactionId: 'phoneDate', target: { kind: 'self' }, data: { personId: ada } }).ok).toBe(true);
      runUntil(h, () => w.state.people[w.mira]!.queue.length === 0 && h.log.some((e) => e.type === 'social'), 4 * 30);
      const social = h.log.find((e) => e.type === 'social');
      expect(social).toMatchObject({ socialId: 'askOnDate', actorId: w.mira, targetId: ada });
      if ((social as { accepted: boolean }).accepted) {
        yes++;
        expect(w.state.homeEvents).toHaveLength(1);
        expect(theEvent(sw)).toMatchObject({ type: 'date', status: 'invited', guestIds: [ada] });
      } else {
        no++;
        expect(w.state.homeEvents).toEqual([]);
        expect(w.state.relationships[relKey(ada, w.mira)]!.friendship).toBeGreaterThanOrEqual(50);
        expect(w.state.people[w.mira]!.moodlets.some((m) => m.id === 'rebuffed')).toBe(true);
        expect(w.state.people[ada]!.moodlets.some((m) => m.id === 'flustered')).toBe(true);
      }
    }
    expect(yes).toBeGreaterThan(0);
    expect(no).toBeGreaterThan(0);
  });
});
