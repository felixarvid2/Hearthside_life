// Milestone 13: planned events at a public venue on the real content. The household and the guest travel together, the
// event runs on the venue lot, and everyone ends up at home again, with money and ledgers exact.

import { describe, expect, it, vi } from 'vitest';
import { premadeHouseholds } from '../../../src/characters/creator';
import { atDayMinute, dayIndex } from '../../../src/core/clock';
import { pairKey } from '../../../src/core/ids';
import type { Id, WorldState } from '../../../src/core/types';
import type { GameCore } from '../../../src/game/GameCore';
import { coreWithoutSaves, db } from './harness';

vi.setConfig({ testTimeout: 90_000 });

const premades = premadeHouseholds(db);

function quiet(seed = 42): GameCore {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', premades[0]!, seed)).toEqual({ ok: true });
  const s = core.state()!;
  s.settings.visitors = false;
  s.schedule = s.schedule.filter((e) => e.kind !== 'visitArrive');
  for (const id of s.households[s.activeHouseholdId]!.memberIds) if (s.people[id]!.career) core.quitCareer(id);
  return core;
}
const now = (c: GameCore) => c.state()!.clock.minutes;
function runTo(c: GameCore, minute: number): void { if (minute > now(c)) c.advanceTicks(Math.ceil((minute - now(c)) / 0.25)); }
const venue = (s: WorldState, type: string) => Object.values(s.lots).find((l) => l.venueType === type)!;

/** A date-ready pair: the first adult of the household and a grown-up townie who is not at work. */
function pair(c: GameCore): { host: Id; guest: Id } {
  const s = c.state()!;
  const hh = s.households[s.activeHouseholdId]!;
  const host = hh.memberIds.map((id) => s.people[id]!).find((p) => p.lifeStage === 'adult' || p.lifeStage === 'youngAdult')!;
  const guest = Object.values(s.people).find((p) => p.householdId !== hh.id && (p.lifeStage === 'adult' || p.lifeStage === 'youngAdult'))!;
  for (const p of [host, guest]) { p.romance = { interestedIn: ['any'], open: true }; p.career = null; }
  for (const [a, b] of [[host.id, guest.id], [guest.id, host.id]] as const) {
    const r = (s.relationships[`${a}>${b}`] ??= { from: a, to: b, familiarity: 0, friendship: 0, trust: 0, romance: 0, lastInteractionAt: null, recent: {} });
    Object.assign(r, { familiarity: 60, friendship: 55, trust: 30, romance: 40 });
  }
  delete s.bonds[pairKey(host.id, guest.id)];
  return { host: host.id, guest: guest.id };
}

describe('a date at a venue', () => {
  it('checks the venue, its hours and the notice for the trip', () => {
    const c = quiet();
    const { host, guest } = pair(c);
    const s = c.state()!;
    const cafe = venue(s, 'cafe');
    const day = dayIndex(now(c)) + 1;
    const at = atDayMinute(day, 15 * 60);
    expect(c.eventProblem({ type: 'date', hostId: host, guestIds: [guest], startAt: at, lotId: cafe.id })).toBeNull();
    expect(c.eventProblem({ type: 'date', hostId: host, guestIds: [guest], startAt: atDayMinute(day, 20 * 60), lotId: cafe.id })).toMatch(/not open for all of it/);
    const other = Object.values(s.lots).find((l) => l.kind === 'residential' && l.id !== s.households[s.activeHouseholdId]!.homeLotId)!;
    expect(c.eventProblem({ type: 'date', hostId: host, guestIds: [guest], startAt: at, lotId: other.id })).toMatch(/home or at a public venue/);
    expect(c.eventProblem({ type: 'date', hostId: host, guestIds: [guest], startAt: now(c) + 40, lotId: cafe.id })).toMatch(/notice/);
  });

  it('travels together, runs on the venue lot, and everybody is home afterwards', () => {
    const c = quiet();
    const { host, guest } = pair(c);
    const s = c.state()!;
    const home = s.households[s.activeHouseholdId]!.homeLotId!;
    const cafe = venue(s, 'cafe');
    const funds = s.households[s.activeHouseholdId]!.funds;
    const at = atDayMinute(dayIndex(now(c)) + 1, 15 * 60);
    const r = c.planEvent({ type: 'date', hostId: host, guestIds: [guest], startAt: at, lotId: cafe.id });
    expect(r.ok).toBe(true);
    const ev = s.homeEvents![0]!;
    expect(ev.lotId).toBe(cafe.id);
    expect(ev.departAt).toBeLessThan(at);
    expect(s.schedule.some((e) => e.kind === 'visitArrive')).toBe(false);
    expect(s.feed.some((f) => f.text.includes(`at ${cafe.name}`))).toBe(true);

    runTo(c, ev.departAt! + 1);
    expect(s.people[host]!.location.kind === 'offlot' || s.people[host]!.location.kind === 'lot').toBe(true);
    runTo(c, at + 5);
    expect(s.activeLotId).toBe(cafe.id);
    expect(ev.status).toBe('running');
    expect(s.people[host]!.location).toMatchObject({ kind: 'lot', lotId: cafe.id });
    expect(s.people[guest]!.location).toMatchObject({ kind: 'lot', lotId: cafe.id });
    expect(ev.arrivedIds).toContain(guest);

    runTo(c, ev.endAt + 5);
    expect(ev.status).toBe('done');
    expect(ev.score).toBeGreaterThanOrEqual(0);
    runTo(c, ev.endAt + 120);
    expect(s.activeLotId).toBe(home);
    expect(s.people[host]!.location).toMatchObject({ kind: 'lot', lotId: home });
    expect(s.people[guest]!.location.kind).toBe('offlot');
    // food is only charged when it was served; the ledger stays exact either way
    const hh = s.households[s.activeHouseholdId]!;
    expect(funds).toBeGreaterThan(0);
    expect(hh.ledger.reduce((sum, l) => sum + l.amount, 0)).toBe(hh.funds);
    expect(Object.values(s.people).filter((p) => p.location.kind === 'lot').every((p) => p.location.kind === 'lot' && p.location.lotId === home)).toBe(true);
  });

  it('calling it off after the guest set out sends the guest home', () => {
    const c = quiet();
    const { host, guest } = pair(c);
    const s = c.state()!;
    const park = venue(s, 'park');
    const at = atDayMinute(dayIndex(now(c)) + 1, 12 * 60);
    expect(c.planEvent({ type: 'date', hostId: host, guestIds: [guest], startAt: at, lotId: park.id }).ok).toBe(true);
    const ev = s.homeEvents![0]!;
    runTo(c, ev.departAt! + 2);
    expect(c.cancelEvent(ev.id).ok).toBe(true);
    expect(s.people[guest]!.location).not.toMatchObject({ lotId: park.id, place: 'visiting' });
    expect(s.schedule.filter((e) => e.kind === 'eventTravel')).toHaveLength(0);
  });

  it('a wedding can be held at the arts centre', () => {
    const c = quiet();
    const { host, guest } = pair(c);
    const s = c.state()!;
    const lot = venue(s, 'arts');
    s.bonds[pairKey(host, guest)] = { a: host < guest ? host : guest, b: host < guest ? guest : host, status: 'engaged', familyAtoB: 'none', since: 0 };
    for (const [a, b] of [[host, guest], [guest, host]]) Object.assign(s.relationships[`${a}>${b}`]!, { romance: 70, trust: 60 });
    const at = atDayMinute(dayIndex(now(c)) + 1, 12 * 60);
    expect(c.planEvent({ type: 'wedding', hostId: host, guestIds: [guest], startAt: at, lotId: lot.id }).ok).toBe(true);
    const ev = s.homeEvents![0]!;
    runTo(c, ev.ceremonyAt! + 5);
    expect(ev.ceremony).toBe('done');
    expect(s.bonds[pairKey(host, guest)]!.status).toBe('spouse');
    expect(s.activeLotId).toBe(lot.id);
  });
});
