// Milestone 7 headless story and soak test: a household goes to the park, chats with a townie, invites them home and goes
// home (the townie comes to the door about an hour later); and seven days of trips to every kind of place leave nobody
// stuck, lost or duplicated, with every ledger exact.

import { describe, expect, it, vi } from 'vitest';
import { premadeHouseholds } from '../../../src/characters/creator';
import { atDayMinute, dayIndex, formatClock } from '../../../src/core/clock';
import type { Id, WorldState } from '../../../src/core/types';
import type { GameCore } from '../../../src/game/GameCore';
import { INVITE_MIN_FAMILIARITY, INVITE_MIN_FRIENDSHIP } from '../../../src/sim/travel';
import { whoIsPlannedAt } from '../../../src/sim/townlife';
import { Recorder, coreWithoutSaves, db } from './harness';

vi.setConfig({ testTimeout: 60_000 });

const premades = premadeHouseholds(db);
const now = (c: GameCore) => c.state()!.clock.minutes;
const members = (s: WorldState): Id[] => [...s.households[s.activeHouseholdId]!.memberIds];
const lotByType = (s: WorldState, type: string) => Object.values(s.lots).find((l) => l.venueType === type)!;
const inTrip = (c: GameCore) => c.neighbourhood()!.trip !== null;
const onLot = (c: GameCore, id: Id) => c.state()!.people[id]!.location.kind === 'lot';
const idle = (c: GameCore, id: Id) => c.state()!.people[id]!.queue.length === 0;

function runUntil(c: GameCore, pred: () => boolean, maxMinutes = 6 * 60): boolean {
  for (let i = 0; i < maxMinutes * 4; i++) { if (pred()) return true; c.advanceTicks(1); }
  return pred();
}
function runTo(c: GameCore, minute: number): void { if (minute > now(c)) c.advanceTicks(Math.ceil((minute - now(c)) / 0.25)); }

/** Plays a menu entry as the interface does and waits for it to end; returns whether the other accepted (null: not possible). */
function say(c: GameCore, from: Id, to: Id, interactionId: string): boolean | null {
  runUntil(c, () => onLot(c, from) && idle(c, from) && onLot(c, to) && idle(c, to), 40);
  const opt = c.options(from, { kind: 'person', personId: to }).find((o) => o.interactionId === interactionId && o.enabled);
  if (!opt || !c.queue(from, opt).ok) return null;
  let answer: boolean | null = null;
  const off = c.events.on('social', (e) => { if (e.actorId === from && e.targetId === to && e.socialId === interactionId) answer = e.accepted; });
  runUntil(c, () => answer !== null || idle(c, from), 90);
  off();
  runUntil(c, () => idle(c, from), 30);
  return answer;
}

describe('a day out: the park, a townie, an invitation home', () => {
  it('goes to the park, chats with a townie, invites them home, goes home, and the townie comes to the door', () => {
    const core = coreWithoutSaves();
    expect(core.startNewGame('guided', premades[0]!, 21)).toEqual({ ok: true });
    const s = core.state()!;
    const maren = members(s)[0]!;
    s.settings.visitors = false; // only the invitation brings people over
    s.schedule = s.schedule.filter((e) => e.kind !== 'visitArrive');
    core.quitCareer(maren);
    const homeId = s.activeLotId;
    const park = lotByType(s, 'park');

    // Find a time when somebody is planned at the park for two hours in a row.
    let stay: { at: number; who: Id } | null = null;
    for (let t = atDayMinute(1, 8 * 60); t < atDayMinute(4, 0) && !stay; t += 30) {
      const sets = [0, 30, 60, 90, 120].map((d) => new Set(whoIsPlannedAt(s, db, park.id, t + d)));
      const who = [...sets[0]!].find((id) => sets.every((x) => x.has(id)));
      if (who) stay = { at: t, who };
    }
    expect(stay, 'somebody spends two hours in the park on one of the next days').not.toBeNull();
    const townie = stay!.who;
    const townieName = s.people[townie]!.firstName;
    expect(s.people[maren]!.memories.some((m) => m.withId === townie)).toBe(false);
    expect(s.relationships[`${maren}>${townie}`]).toBeUndefined(); // strangers

    // They arrive in the park at about the time the townie is there (clock set a trip's length before).
    const leaveAt = stay!.at - 15;
    s.clock.minutes = leaveAt;
    s.schedule = s.schedule.filter((e) => e.kind !== 'visitArrive');
    runTo(core, leaveAt + 30 - (leaveAt % 30)); // a boundary passes: the townie is placed
    expect(core.travel([maren], park.id)).toMatchObject({ ok: true });
    expect(runUntil(core, () => !inTrip(core), 90)).toBe(true);
    expect(core.state()!.activeLotId).toBe(park.id);
    expect(onLot(core, townie), `${townieName} is in the park at ${formatClock(now(core))}`).toBe(true);
    expect(core.whereIs(townie)).toMatchObject({ kind: 'venue', text: 'At Lakeside Park' });
    const patrons = core.neighbourhood()!.lots.find((l) => l.id === park.id)!.people;
    expect(patrons.some((p) => p.personId === townie && p.here)).toBe(true);

    // The visit options: the invitation needs a bit of friendship first.
    const isStranger = () => (core.state()!.relationships[`${maren}>${townie}`]?.familiarity ?? 0) < INVITE_MIN_FAMILIARITY;
    const askOpts = () => core.options(maren, { kind: 'person', personId: townie });
    const invite = () => askOpts().find((o) => o.interactionId === 'inviteHome')!;
    expect(invite(), 'the menu offers to invite somebody to your home').toBeDefined();
    expect(invite().enabled).toBe(false);
    expect(invite().reason).toMatch(/Get to know .* a little better/);
    const friendly = ['introduce', 'chat', 'askAboutDay', 'tellJoke', 'compliment', 'shareNews', 'discussInterests', 'tease'];
    for (let i = 0; i < 24 && onLot(core, townie); i++) {
      const rel = core.state()!.relationships[`${townie}>${maren}`];
      if (!isStranger() && (rel?.friendship ?? 0) >= INVITE_MIN_FRIENDSHIP) break;
      const r = say(core, maren, townie, isStranger() ? 'introduce' : friendly[1 + (i % (friendly.length - 1))]!);
      runUntil(core, () => idle(core, maren), 30);
      if (process.env.VENUE_LOG) console.log(formatClock(now(core)), i, r, JSON.stringify(core.state()!.relationships[`${townie}>${maren}`]), onLot(core, townie), JSON.stringify(core.state()!.people[townie]!.location));
      core.advanceTicks(4 * 3);
    }
    expect(onLot(core, townie), 'the townie is still in the park').toBe(true);
    expect(isStranger()).toBe(false);
    expect(core.state()!.relationships[`${townie}>${maren}`]!.friendship).toBeGreaterThanOrEqual(INVITE_MIN_FRIENDSHIP);
    expect(invite().enabled, invite().reason).toBe(true);

    // Invite them home: they say yes (the rule is visible), head off, and a visit is scheduled at our door.
    const sentAt = now(core);
    expect(core.queue(maren, invite()).ok).toBe(true);
    expect(runUntil(core, () => core.state()!.schedule.some((e) => e.kind === 'visitArrive' && e.personId === townie), 30)).toBe(true);
    const visit = core.state()!.schedule.find((e) => e.kind === 'visitArrive' && e.personId === townie)!;
    expect(visit.data).toMatchObject({ invitedBy: maren, lotId: homeId });
    expect(visit.at - sentAt).toBeGreaterThanOrEqual(55);
    expect(runUntil(core, () => !onLot(core, townie), 60)).toBe(true); // they left the park

    // Go home; the townie arrives about an hour after the invitation and the visit is an event.
    expect(runUntil(core, () => idle(core, maren), 20)).toBe(true);
    expect(core.goHome()).toMatchObject({ ok: true });
    expect(runUntil(core, () => !inTrip(core), 90)).toBe(true);
    expect(core.state()!.activeLotId).toBe(homeId);
    expect(runUntil(core, () => onLot(core, townie), 5 * 60)).toBe(true);
    expect(core.state()!.people[townie]!.location).toMatchObject({ kind: 'lot', lotId: homeId });
    expect(now(core)).toBeGreaterThanOrEqual(visit.at);
    expect(core.state()!.homeEvents!.some((e) => e.type === 'visit' && e.guestIds.includes(townie))).toBe(true);
    // ...and goes home again afterwards
    expect(runUntil(core, () => !onLot(core, townie), 6 * 60)).toBe(true);
    expect(core.whereIs(townie)!.kind).not.toBe('lot');
  });

  it('visits a household at night: the residents are home, placed inside, and live their lives', () => {
    const core = coreWithoutSaves();
    core.startNewGame('guided', premades[0]!, 42);
    const s = core.state()!;
    const ids = members(s);
    s.settings.visitors = false;
    s.schedule = s.schedule.filter((e) => e.kind !== 'visitArrive');
    for (const id of ids) core.quitCareer(id);
    const target = s.households[s.neighbourhood!.npcHouseholdIds[0]!]!;
    runTo(core, atDayMinute(1, 22 * 60 + 15));
    const started: Id[] = [];
    core.events.on('action.started', (e) => { if (s.people[e.personId]?.isNpc) started.push(e.personId); });
    expect(core.travel(ids, target.homeLotId!)).toMatchObject({ ok: true });
    expect(runUntil(core, () => !inTrip(core), 90)).toBe(true);
    const st = core.state()!;
    expect(st.activeLotId).toBe(target.homeLotId);
    const lot = st.lots[target.homeLotId!]!;
    expect(lot.built).toBe(true);
    expect(core.neighbourhood()!.lots.find((l) => l.id === lot.id)).toMatchObject({ active: true, householdName: target.name });
    for (const id of target.memberIds) {
      const p = st.people[id]!;
      expect(p.location, `${p.firstName} is home`).toMatchObject({ kind: 'lot', lotId: lot.id });
    }
    runUntil(core, () => false, 60);
    expect(started.some((id) => target.memberIds.includes(id)), 'the residents do things').toBe(true);
    // the player's people are guests: they are visitors on that lot
    expect(core.options(ids[0]!, { kind: 'person', personId: target.memberIds[0]! }).some((o) => o.interactionId === 'inviteHome')).toBe(true);
  });
});

describe('seven days with trips', () => {
  it('leaves nobody stuck, lost or duplicated, and every ledger exact', () => {
    const core = coreWithoutSaves();
    core.startNewGame('guided', premades[1]!, 7); // two roommates with jobs
    const s = core.state()!;
    const ids = members(s);
    const total = Object.keys(s.people).length;
    const rec = new Recorder(core);
    const homeId = s.activeLotId;
    const types = ['park', 'cafe', 'market', 'gym', 'library', 'arts', 'park'];
    const trips: string[] = [];
    let longestTransit = 0;

    const check = () => {
      const w = core.state()!;
      expect(Object.keys(w.people)).toHaveLength(total);
      const trip = w.schedule.find((e) => e.kind === 'travelArrive');
      for (const p of Object.values(w.people)) {
        const loc = p.location;
        if (loc.kind === 'lot') expect(loc.lotId).toBe(w.activeLotId);
        else { expect(p.queue).toHaveLength(0); if (loc.transit) { expect(trip).toBeDefined(); longestTransit = Math.max(longestTransit, now(core) - loc.since); } }
      }
      if (trip) expect(trip.at).toBeGreaterThanOrEqual(now(core) - 1);
    };
    const step = (minutes: number) => { for (let i = 0; i < minutes; i += 15) { core.advanceTicks(60); rec.sample(); check(); } };
    const goOut = (type: string) => {
      const w = core.state()!;
      const lot = lotByType(w, type);
      const who = members(w).filter((id) => onLot(core, id));
      if (who.length === 0) return;
      const r = core.travel(who, lot.id);
      if (r.ok) trips.push(`${formatClock(now(core))} ${lot.name}`);
      else expect(r.reason).toMatch(/closed|at work|already|on the way/i);
    };

    for (let day = 0; day < 7; day++) {
      runTo(core, atDayMinute(day, 9 * 60 + 30));
      goOut(types[day]!);
      step(150);
      expect(runUntil(core, () => !inTrip(core), 90)).toBe(true);
      step(180);
      const w = core.state()!;
      if (w.activeLotId !== homeId) {
        const r = core.goHome();
        if (r.ok) expect(runUntil(core, () => !inTrip(core), 90)).toBe(true);
      }
      step(240);
      expect(runUntil(core, () => !inTrip(core), 90)).toBe(true);
      runTo(core, atDayMinute(day + 1, 6 * 60));
      check();
    }
    expect(trips.length).toBeGreaterThanOrEqual(5);
    expect(longestTransit).toBeLessThanOrEqual(60);
    const end = core.state()!;
    // the household ends the week at home, with its people on the lot or at work, and nothing in transit
    expect(end.activeLotId).toBe(homeId);
    expect(core.neighbourhood()!.trip).toBeNull();
    for (const id of ids) {
      const loc = end.people[id]!.location;
      expect(loc.kind === 'lot' || (loc.kind === 'offlot' && !loc.transit), `${end.people[id]!.firstName} ${JSON.stringify(loc)}`).toBe(true);
    }
    // nobody got wedged at a door: no route failure repeated
    for (const id of ids) expect(rec.failureRuns.get(id) ?? 0, `${end.people[id]!.firstName} route failures`).toBeLessThan(6);
    // money: every ledger adds up, wages were paid once each
    for (const hh of Object.values(end.households)) {
      expect(hh.ledger.reduce((sum, l) => sum + l.amount, 0), hh.name).toBe(hh.funds);
      const occ = hh.ledger.filter((l) => l.occurrence).map((l) => l.occurrence);
      expect(new Set(occ).size).toBe(occ.length);
    }
    const hh = end.households[end.activeHouseholdId]!;
    const wages = hh.ledger.filter((l) => l.kind === 'wage');
    expect(wages.length).toBeGreaterThanOrEqual(3);
    expect(dayIndex(now(core))).toBeGreaterThanOrEqual(7);
  });
});
