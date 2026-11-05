// Milestone 7 lot travel on the real content, world, simulation and persistence: a household goes to a venue and back, the
// lots keep their exact state, nobody is lost or duplicated, money does not move, jobs work from any lot, and every
// household (played or not) keeps an exact ledger when the player switches between them.

import { describe, expect, it, vi } from 'vitest';
import { premadeHouseholds } from '../../../src/characters/creator';
import { atDayMinute, formatClock } from '../../../src/core/clock';
import { cloneState } from '../../../src/core/state';
import type { Id, WorldState } from '../../../src/core/types';
import type { GameCore } from '../../../src/game/GameCore';
import { shiftOn } from '../../../src/sim/careers';
import { openBills } from '../../../src/sim/economy';
import { whoIsPlannedAt } from '../../../src/sim/townlife';
import { VENUES } from '../../../src/world/neighbourhood';
import { coreWithoutSaves, db } from './harness';

vi.setConfig({ testTimeout: 60_000 });

const premades = premadeHouseholds(db);

/** A running game with the first visit and the visitors switched off and, unless asked, nobody employed (so trips are not interrupted by shifts). */
function quiet(opts: { seed?: number; household?: number; jobs?: boolean } = {}): GameCore {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', premades[opts.household ?? 0]!, opts.seed ?? 42)).toEqual({ ok: true });
  const s = core.state()!;
  s.settings.visitors = false;
  s.schedule = s.schedule.filter((e) => e.kind !== 'visitArrive');
  if (!opts.jobs) for (const id of members(s)) if (s.people[id]!.career) core.quitCareer(id);
  return core;
}

const members = (s: WorldState): Id[] => [...s.households[s.activeHouseholdId]!.memberIds];
const now = (c: GameCore) => c.state()!.clock.minutes;
const lotNamed = (s: WorldState, name: string) => Object.values(s.lots).find((l) => l.name === name || l.venueType === name)!;
const jsonOf = (s: WorldState, lotId: Id) => JSON.stringify(s.lots[lotId]);
const inTrip = (c: GameCore) => c.neighbourhood()!.trip !== null;

function runMinutes(c: GameCore, minutes: number): void { c.advanceTicks(Math.ceil(minutes / 0.25)); }
function runTo(c: GameCore, minute: number): void { if (minute > now(c)) runMinutes(c, minute - now(c)); }
function runUntil(c: GameCore, pred: () => boolean, maxMinutes = 6 * 60): boolean {
  for (let i = 0; i < maxMinutes * 4; i++) { if (pred()) return true; c.advanceTicks(1); }
  return pred();
}
const arrive = (c: GameCore) => expect(runUntil(c, () => !inTrip(c), 90), 'the trip ends').toBe(true);

/** Every world rule about where people are; call as often as you like. */
function checkWorld(c: GameCore, peopleCount?: number): void {
  const s = c.state()!;
  if (peopleCount !== undefined) expect(Object.keys(s.people)).toHaveLength(peopleCount);
  const seen = new Set<Id>();
  for (const hh of Object.values(s.households)) {
    for (const id of hh.memberIds) {
      expect(s.people[id], `member ${id}`).toBeDefined();
      expect(s.people[id]!.householdId).toBe(hh.id);
      expect(seen.has(id), `${id} is in one household only`).toBe(false);
      seen.add(id);
    }
  }
  expect(seen.size).toBe(Object.keys(s.people).length);
  const trip = s.schedule.find((e) => e.kind === 'travelArrive');
  for (const p of Object.values(s.people)) {
    const loc = p.location;
    if (loc.kind === 'lot') {
      expect(loc.lotId, `${p.firstName} is on the active lot only`).toBe(s.activeLotId);
      expect(s.lots[loc.lotId]).toBeDefined();
    } else {
      expect(p.queue, `${p.firstName} off-lot has no queue`).toHaveLength(0);
      if (loc.transit) expect(trip, `${p.firstName} in transit has a trip`).toBeDefined();
      if (loc.lotId) expect(s.lots[loc.lotId]).toBeDefined();
    }
    expect(p.isNpc).toBe(p.householdId !== s.activeHouseholdId);
  }
  for (const hh of Object.values(s.households)) expect(hh.isPlayable).toBe(hh.id === s.activeHouseholdId);
}

/** Funds equal the sum of the ledger for every household (all start with a 'start' entry). */
function checkLedgers(s: WorldState): void {
  for (const hh of Object.values(s.households)) {
    expect(hh.ledger.reduce((sum, l) => sum + l.amount, 0), `${hh.name} ledger adds up`).toBe(hh.funds);
    expect(hh.funds, `${hh.name} is not in debt`).toBeGreaterThanOrEqual(0);
    const occ = hh.ledger.filter((l) => l.occurrence).map((l) => l.occurrence);
    expect(new Set(occ).size, `${hh.name} pays each occurrence once`).toBe(occ.length);
  }
}

describe('travelling to a venue and back', () => {
  it('takes game time, costs nothing, keeps both lots exactly as they were and loses nobody', () => {
    const core = quiet({ household: 1 }); // two roommates
    const s = core.state()!;
    const ids = members(s);
    expect(ids).toHaveLength(2);
    const homeId = s.activeLotId;
    const park = lotNamed(s, 'Lakeside Park');
    const peopleCount = Object.keys(s.people).length;
    const funds = s.households[s.activeHouseholdId]!.funds;
    const ledgerLength = s.households[s.activeHouseholdId]!.ledger.length;
    const homeJson = jsonOf(s, homeId);
    const lotCount = Object.keys(s.lots).length;
    expect(park.built).toBe(false);

    const r = core.travel(ids, park.id);
    expect(r).toMatchObject({ ok: true });
    expect(r.minutes).toBeGreaterThanOrEqual(20);
    expect(r.minutes).toBeLessThanOrEqual(40);
    expect(r.arrivesAt).toBe(now(core) + r.minutes!);
    expect(core.neighbourhood()!.trip).toMatchObject({ lotId: park.id, personIds: ids });
    // a second trip while one is under way is refused
    expect(core.travel(ids, park.id)).toMatchObject({ ok: false });

    // they walk to the door and are on the way; the lot they left is still the active one
    expect(runUntil(core, () => ids.every((id) => core.state()!.people[id]!.location.kind === 'offlot'), 10)).toBe(true);
    for (const id of ids) {
      expect(core.state()!.people[id]!.location).toMatchObject({ kind: 'offlot', transit: true, lotId: park.id });
      expect(core.whereIs(id)).toMatchObject({ kind: 'transit', text: 'On the way to Lakeside Park', arrivesAt: r.arrivesAt });
    }
    expect(core.state()!.activeLotId).toBe(homeId);
    checkWorld(core, peopleCount);

    arrive(core);
    expect(now(core)).toBeCloseTo(r.arrivesAt!, 0);
    const a = core.state()!;
    expect(a.activeLotId).toBe(park.id);
    // the trip itself was free: nothing was charged between setting off and arriving
    expect(a.households[a.activeHouseholdId]!.funds).toBe(funds);
    expect(a.households[a.activeHouseholdId]!.ledger).toHaveLength(ledgerLength);
    expect(park.built).toBe(true);
    expect(Object.keys(park.objects).length).toBeGreaterThan(10);
    for (const id of ids) {
      const loc = a.people[id]!.location;
      if (loc.kind !== 'lot') throw new Error('not on the lot');
      expect(loc.lotId).toBe(park.id);
      expect(Math.abs(loc.x - (park.entry.x + 0.5)) + Math.abs(loc.z - (park.entry.z + 0.5))).toBeLessThan(4);
      expect(core.whereIs(id)).toMatchObject({ kind: 'venue', lotId: park.id, text: 'At Lakeside Park' });
    }
    expect(jsonOf(a, homeId)).toBe(homeJson); // the left lot is exactly as it was
    checkWorld(core, peopleCount);

    // two hours at the park: the home lot sleeps
    runMinutes(core, 120);
    expect(jsonOf(core.state()!, homeId)).toBe(homeJson);
    checkWorld(core, peopleCount);

    const parkJson = () => jsonOf(core.state()!, park.id);
    const home = core.goHome();
    expect(home).toMatchObject({ ok: true });
    arrive(core);
    const b = core.state()!;
    expect(b.activeLotId).toBe(homeId);
    for (const id of ids) expect(core.whereIs(id)).toMatchObject({ kind: 'home', text: 'At home' });
    expect(jsonOf(b, homeId)).toBe(homeJson); // round trip: the home lot is identical
    const parkAfter = parkJson();
    runMinutes(core, 90);
    expect(parkJson()).toBe(parkAfter); // and the park keeps its state while nobody is there
    expect(Object.keys(b.lots)).toHaveLength(lotCount);
    checkWorld(core, peopleCount);
    checkLedgers(b);

    // a second visit finds the same park: nothing is built again
    const objectIds = Object.keys(park.objects).join();
    expect(core.travel(ids, park.id)).toMatchObject({ ok: true });
    arrive(core);
    expect(Object.keys(core.state()!.lots[park.id]!.objects).join()).toBe(objectIds);
  });

  it('refuses what cannot be done and says why: closed venues, strangers, people at work, one trip at a time', () => {
    const core = quiet({ household: 1 });
    const s = core.state()!;
    const ids = members(s);
    const library = lotNamed(s, 'Pagebridge Library'); // opens at 9:00; it is 8:00
    expect(core.travelProblem(ids, library.id)).toMatch(/closed when you get there \(open 9:00 AM - 8:00 PM\)/);
    expect(core.travel(ids, library.id)).toMatchObject({ ok: false, reason: expect.stringContaining('closed') });
    expect(core.travelProblem([], library.id)).toBe('Choose who goes.');
    expect(core.travelProblem(ids, 'lot_nope')).toBe('There is no such place.');
    const stranger = Object.values(s.people).find((p) => p.householdId !== s.activeHouseholdId)!;
    expect(core.travelProblem([stranger.id], library.id)).toMatch(/doesn't live with you/);
    expect(core.travelProblem(ids, s.activeLotId)).toMatch(/^Already at /);
    // the map lists the reason for every lot
    const info = core.neighbourhood()!;
    expect(info.lots).toHaveLength(15);
    expect(info.lots.find((l) => l.id === library.id)).toMatchObject({ open: false, hours: '9:00 AM - 8:00 PM', travelProblem: expect.stringContaining('closed') });
    expect(info.lots.find((l) => l.id === s.activeLotId)).toMatchObject({ active: true, isHome: true, travelProblem: expect.stringMatching(/^Already at/) });
    // a person at work cannot go
    const sasha = s.people[ids[1]!]!;
    sasha.location = { kind: 'offlot', place: 'work', since: now(core), until: null };
    expect(core.travelProblem([sasha.id], lotNamed(s, 'Lakeside Park').id)).toBe(`${sasha.firstName} is at work.`);
  });

  it('lets one person go while the rest stay home off-lot, and brings them back together', () => {
    const core = quiet({ household: 1 });
    const s = core.state()!;
    const [first, second] = members(s);
    const homeId = s.activeLotId;
    const cafe = lotNamed(s, 'Kettle & Crumb');
    runTo(core, atDayMinute(0, 9 * 60));
    expect(core.travel([first!], cafe.id)).toMatchObject({ ok: true });
    arrive(core);
    const a = core.state()!;
    expect(a.activeLotId).toBe(cafe.id);
    expect(a.people[first!]!.location).toMatchObject({ kind: 'lot', lotId: cafe.id });
    expect(a.people[second!]!.location).toMatchObject({ kind: 'offlot', place: 'home', lotId: homeId });
    expect(core.whereIs(second!)).toMatchObject({ kind: 'home', text: 'At home' });
    checkWorld(core);
    runMinutes(core, 90);
    // the one left behind is looked after by the light schedule: needs stay sane, nothing is stuck
    expect(a.people[second!]!.queue).toHaveLength(0);
    for (const v of Object.values(a.people[second!]!.needs)) expect(v).toBeGreaterThan(20);
    expect(core.goHome()).toMatchObject({ ok: true });
    arrive(core);
    const b = core.state()!;
    expect(b.activeLotId).toBe(homeId);
    for (const id of [first!, second!]) expect(b.people[id]!.location).toMatchObject({ kind: 'lot', lotId: homeId });
    checkWorld(core);
  });
});

describe('autonomy away from home', () => {
  it('the household\'s own autonomy setting rules on every lot: with it off, guests and patrons wait for orders', () => {
    const core = quiet({ household: 1 });
    const s = core.state()!;
    s.settings.autonomy = false;
    const ids = members(s);
    const started: string[] = [];
    core.events.on('action.started', (e) => { if (ids.includes(e.personId)) started.push(e.interactionId); });
    runTo(core, atDayMinute(0, 9 * 60));
    expect(core.travel(ids, lotNamed(s, 'Lakeside Park').id)).toMatchObject({ ok: true });
    started.length = 0;
    arrive(core);
    runMinutes(core, 180);
    expect(started.filter((i) => i !== 'travelTo' && i !== 'goHere')).toEqual([]);
    s.settings.autonomy = true;
    runMinutes(core, 240);
    expect(started.length).toBeGreaterThan(0); // with it on they look after themselves
  });
});

describe('hosting', () => {
  it('keeps the household home while a party is planned, but not for a visitor who just dropped by', () => {
    const core = quiet({ household: 1 });
    const s = core.state()!;
    const ids = members(s);
    const park = lotNamed(s, 'Lakeside Park');
    runTo(core, atDayMinute(0, 9 * 60));
    const event = {
      id: 'evt_test', type: 'dinnerParty' as const, title: 'Dinner Party', status: 'invited' as const, hostId: ids[0]!, householdId: s.activeHouseholdId,
      lotId: s.activeLotId, guestIds: [], arrivedIds: [], createdAt: now(core), startAt: now(core) + 600, endAt: now(core) + 700, goals: [], pairs: [], ate: [],
    };
    s.homeEvents = [event];
    expect(core.travelProblem(ids, park.id)).toBe('Finish or cancel "Dinner Party" first.');
    s.homeEvents = [{ ...event, type: 'dropIn', title: 'Drop-in', status: 'running' }];
    expect(core.travelProblem(ids, park.id)).toBeNull();
  });
});

describe('jobs work from any lot', () => {
  it('goes to work from a venue, is paid once, and comes back to wherever the household is', () => {
    const core = quiet({ household: 1, jobs: true });
    const s = core.state()!;
    const [theo, sasha] = members(s);
    const worker = [theo!, sasha!].map((id) => s.people[id]!).find((p) => p.career)!;
    const other = members(s).find((id) => id !== worker.id)!;
    const homeId = s.activeLotId;
    const park = lotNamed(s, 'Lakeside Park');
    const w = shiftOn(db, worker, 0)!;
    expect(w, 'the worker has a shift on day 0').not.toBeNull();
    expect(w.start).toBeGreaterThan(now(core) + 90); // there is time to get to the park first
    expect(core.travel([worker.id, other], park.id)).toMatchObject({ ok: true });
    arrive(core);
    expect(core.state()!.people[worker.id]!.location).toMatchObject({ kind: 'lot', lotId: park.id });

    // she leaves for work from the park
    expect(runUntil(core, () => core.state()!.people[worker.id]!.location.kind === 'offlot', 5 * 60)).toBe(true);
    expect(core.state()!.people[worker.id]!.location).toMatchObject({ kind: 'offlot', place: 'work', lotId: park.id });
    expect(core.whereIs(worker.id)).toMatchObject({ kind: 'work', text: 'At work' });
    expect(now(core)).toBeGreaterThanOrEqual(w.start - 60);
    expect(now(core)).toBeLessThanOrEqual(w.start + 30);

    // the others go home meanwhile, so the household's current lot is home when the shift ends
    expect(core.goHome([other])).toMatchObject({ ok: true });
    arrive(core);
    expect(core.state()!.activeLotId).toBe(homeId);
    expect(runUntil(core, () => core.state()!.people[worker.id]!.location.kind === 'lot', 12 * 60)).toBe(true);
    const back = core.state()!.people[worker.id]!.location;
    if (back.kind !== 'lot') throw new Error('not back');
    expect(back.lotId).toBe(homeId);
    expect(now(core)).toBeGreaterThanOrEqual(w.end);
    expect(now(core)).toBeLessThanOrEqual(w.end + 30);

    // paid exactly once, with the occurrence id a worker at home would have
    const hh = core.state()!.households[core.state()!.activeHouseholdId]!;
    const pays = hh.ledger.filter((l) => l.occurrence === `pay:${worker.id}:0`);
    expect(pays).toHaveLength(1);
    const late = Math.max(0, w.start - w.start); // she left on time
    expect(pays[0]!.amount).toBe(Math.round((w.level.hourlyWage * (w.end - w.start - late)) / 60));
    expect(core.state()!.processed[`shift:${worker.id}:0`]).toBeDefined();
    checkLedgers(core.state()!);
    checkWorld(core);
  });

  it('a person left behind at home leaves for work from there and comes back home', () => {
    const core = quiet({ household: 1, jobs: true });
    const s = core.state()!;
    const ids = members(s);
    const worker = ids.map((id) => s.people[id]!).find((p) => p.career)!;
    const other = ids.find((id) => id !== worker.id)!;
    const homeId = s.activeLotId;
    const w = shiftOn(db, worker, 0)!;
    // only the other one goes out; the worker stays and is left "at home" when the group arrives at the venue
    expect(core.travel([other], lotNamed(s, 'Kettle & Crumb').id)).toMatchObject({ ok: true });
    // the worker is not on the way out: she is still on the lot until the group arrives, then off-lot at home
    arrive(core);
    expect(core.state()!.people[worker.id]!.location).toMatchObject({ kind: 'offlot', place: 'home', lotId: homeId });
    expect(runUntil(core, () => core.state()!.people[worker.id]!.location.kind === 'offlot' && (core.state()!.people[worker.id]!.location as { place: string }).place === 'work', 5 * 60)).toBe(true);
    expect(core.whereIs(worker.id)!.text).toBe('At work');
    // when the shift is over she is home again (the household is still at the cafe)
    expect(runUntil(core, () => core.whereIs(worker.id)!.text === 'At home' && now(core) > w.end - 1, 12 * 60)).toBe(true);
    expect(core.state()!.people[worker.id]!.location).toMatchObject({ kind: 'offlot', place: 'home', lotId: homeId });
    const hh = core.state()!.households[core.state()!.activeHouseholdId]!;
    expect(hh.ledger.filter((l) => l.occurrence === `pay:${worker.id}:0`)).toHaveLength(1);
    checkWorld(core);
  });
});

describe('the light schedule of everybody else', () => {
  it('pays every finished shift of an NPC exactly once, also across a save and load', () => {
    const run = (reloadAt: number | null) => {
      const core = quiet({ jobs: true });
      for (let step = 0; step < 4 * 4; step++) {
        runMinutes(core, 6 * 60);
        if (reloadAt !== null && step === reloadAt) core.replaceState(cloneState(core.state()!));
      }
      return core.state()!;
    };
    const straight = run(null);
    const reloaded = run(5);
    const workers = Object.values(straight.people).filter((p) => p.isNpc && p.career);
    expect(workers.length).toBeGreaterThanOrEqual(5);
    for (const p of workers) {
      const hh = straight.households[p.householdId]!;
      const paid = hh.ledger.filter((l) => l.occurrence?.startsWith(`pay:${p.id}:`));
      const days = [0, 1, 2, 3].filter((d) => shiftOn(db, p, d) && shiftOn(db, p, d)!.end <= straight.clock.minutes);
      expect(paid.map((l) => l.occurrence), p.firstName).toEqual(days.map((d) => `pay:${p.id}:${d}`));
      for (const d of days) expect(straight.processed[`shift:${p.id}:${d}`], `${p.firstName} shift ${d} counted`).toBeDefined();
      expect(p.career!.daysWorked).toBe(days.length);
    }
    // saving and loading in the middle changes nothing about anybody's money
    for (const id of Object.keys(straight.households)) {
      expect(reloaded.households[id]!.funds, straight.households[id]!.name).toBe(straight.households[id]!.funds);
      expect(reloaded.households[id]!.ledger.map((l) => `${l.occurrence}:${l.amount}`)).toEqual(straight.households[id]!.ledger.map((l) => `${l.occurrence}:${l.amount}`));
    }
    checkLedgers(straight);
    // NPC households pay their weekly bill by themselves, once: three days in, no bill record and no debt
    for (const hh of Object.values(straight.households)) if (!hh.isPlayable) expect(openBills(straight, hh.id)).toHaveLength(0);
  });

  it('places people at venues by the clock, deterministically, within capacity and opening hours', () => {
    const build = () => { const c = quiet({ jobs: true }); return c; };
    const a = build(), b = build();
    const venues = Object.values(a.state()!.lots).filter((l) => l.kind === 'venue');
    const sample = (c: GameCore, lotId: Id, t: number) => whoIsPlannedAt(c.state()!, db, lotId, t);
    let totalPresent = 0;
    const seenAt = new Set<string>();
    for (let t = atDayMinute(0, 0); t < atDayMinute(3, 0); t += 30) {
      for (const v of venues) {
        const ids = sample(a, v.id, t);
        expect(ids).toEqual(sample(b, v.id, t));
        expect(ids.length).toBeLessThanOrEqual(VENUES[v.venueType as keyof typeof VENUES].capacity);
        const mod = t % 1440;
        if (mod < VENUES[v.venueType as keyof typeof VENUES].open || mod >= VENUES[v.venueType as keyof typeof VENUES].close) expect(ids, `${v.name} closed at ${formatClock(t)}`).toEqual([]);
        totalPresent += ids.length;
        for (const id of ids) seenAt.add(`${v.id}:${id}`);
      }
    }
    expect(totalPresent).toBeGreaterThan(40);
    expect(new Set([...seenAt].map((k) => k.split(':')[0])).size).toBeGreaterThanOrEqual(4); // most venues see somebody
    // reloading does not change the answer
    const state = cloneState(a.state()!);
    a.replaceState(state);
    for (const v of venues) expect(sample(a, v.id, atDayMinute(1, 19 * 60))).toEqual(sample(b, v.id, atDayMinute(1, 19 * 60)));

    // and the world follows the plan: right after each half hour the people at an inactive venue are the planned ones
    const c = quiet({ jobs: true });
    for (let step = 0; step < 2 * 48; step++) {
      runTo(c, atDayMinute(0, 8 * 60) + (step + 1) * 30);
      const s = c.state()!;
      for (const v of venues) {
        const present = Object.values(s.people).filter((p) => p.location.kind === 'offlot' && p.location.place === 'visiting' && p.location.lotId === v.id).map((p) => p.id).sort();
        expect(present, `${v.name} at ${formatClock(now(c))}`).toEqual(whoIsPlannedAt(s, db, v.id, now(c)).filter((id) => s.people[id]!.location.kind === 'offlot' && (s.people[id]!.location as { place: string }).place === 'visiting').sort());
      }
    }
  });
});

describe('switching households', () => {
  it('hands control over, explains the rules, and keeps every household ledger exact', () => {
    const core = quiet({ jobs: true });
    const s = core.state()!;
    const original = s.activeHouseholdId;
    const peopleCount = Object.keys(s.people).length;
    const nextDoor = Object.values(s.households).find((h) => h.id === s.neighbourhood!.nextDoorHouseholdId)!;
    const torres = Object.values(s.households).find((h) => h.name === 'Torres') ?? Object.values(s.households).filter((h) => !h.isPlayable)[3]!;

    runTo(core, atDayMinute(1, 8 * 60));
    // the preview says what will happen, or why not
    const preview = core.switchPreview(nextDoor.id)!;
    expect(preview.ok).toBe(true);
    expect(preview.to!.name).toBe(nextDoor.name);
    expect(preview.consequences.length).toBeGreaterThanOrEqual(4);
    expect(preview.consequences.join(' ')).toMatch(/simulated lightly/);
    expect(preview.consequences.join(' ')).toMatch(/own money/);
    expect(core.switchPreview(original)).toMatchObject({ ok: false, reason: expect.stringMatching(/already playing/) });
    expect(core.switchHousehold(original)).toMatchObject({ ok: false });
    expect(core.switchHousehold('hh_nope')).toMatchObject({ ok: false });
    const old = s.households[original]!;
    const oldMembers = [...old.memberIds];
    const fundsOld = old.funds;

    expect(core.switchHousehold(nextDoor.id)).toEqual({ ok: true });
    let st = core.state()!;
    expect(st.activeHouseholdId).toBe(nextDoor.id);
    expect(st.activeLotId).toBe(nextDoor.homeLotId);
    expect(core.selected()).not.toBeNull();
    expect(st.households[nextDoor.id]!.memberIds).toContain(core.selected());
    expect(st.households[nextDoor.id]!.isPlayable).toBe(true);
    for (const id of oldMembers) {
      expect(st.people[id]!.isNpc).toBe(true);
      expect(st.people[id]!.location).toMatchObject({ kind: 'offlot', place: 'home' });
    }
    expect(st.households[original]!.funds).toBe(fundsOld); // nothing moved
    checkWorld(core, peopleCount);

    // the player can take orders from the new household and nobody else
    const mine = st.households[nextDoor.id]!.memberIds.find((id) => st.people[id]!.location.kind === 'lot');
    if (mine) expect(core.goTo(mine, { x: 10, z: 10 })).toBeDefined();
    const dance = core.options(oldMembers[0]!, { kind: 'person', personId: oldMembers[0]! }).find((o) => o.interactionId === 'danceSolo')!;
    expect(core.queue(oldMembers[0]!, dance)).toMatchObject({ ok: false, reason: expect.stringMatching(/decides for themself/) }); // no longer ours

    runTo(core, atDayMinute(3, 8 * 60));
    checkWorld(core, peopleCount);
    expect(core.switchHousehold(torres.id)).toEqual({ ok: true });
    runTo(core, atDayMinute(5, 8 * 60));
    checkWorld(core, peopleCount);
    expect(core.switchHousehold(original)).toEqual({ ok: true });
    runTo(core, atDayMinute(9, 8 * 60));
    st = core.state()!;
    checkWorld(core, peopleCount);
    checkLedgers(st);
    expect(st.activeHouseholdId).toBe(original);

    // every household that was not played for a while paid its bills and was paid for its shifts, once
    for (const h of Object.values(st.households)) {
      const pays = h.ledger.filter((l) => l.kind === 'wage');
      expect(new Set(pays.map((l) => l.occurrence)).size).toBe(pays.length);
      if (h.id !== st.activeHouseholdId) expect(openBills(st, h.id), h.name).toHaveLength(0);
    }
    const left = st.households[nextDoor.id]!;
    expect(left.ledger.some((l) => l.kind === 'bill')).toBe(true);
    // the played household gets its own bills again (a bill record), and the others do not
    expect((st.bills ?? []).some((b) => b.householdId === original)).toBe(true);
  });

  it('refuses while a trip is under way, and moves nobody into limbo', () => {
    const core = quiet({ household: 1 });
    const s = core.state()!;
    const ids = members(s);
    const nextDoor = s.neighbourhood!.nextDoorHouseholdId!;
    runTo(core, atDayMinute(0, 9 * 60));
    expect(core.travel(ids, lotNamed(s, 'Lakeside Park').id)).toMatchObject({ ok: true });
    expect(core.switchHousehold(nextDoor)).toMatchObject({ ok: false, reason: 'Wait until the trip is over.' });
    arrive(core);
    expect(core.switchHousehold(nextDoor)).toEqual({ ok: true });
    // the household that was at the park is home now, as NPCs, and the park is not active
    const st = core.state()!;
    expect(st.activeLotId).toBe(st.households[nextDoor]!.homeLotId);
    for (const id of ids) expect(st.people[id]!.location.kind).toBe('offlot');
    checkWorld(core);
  });
});

describe('moving house', () => {
  it('rents an empty home for a deposit, and the rent replaces the property tax', () => {
    const core = quiet({ household: 1 });
    const s = core.state()!;
    const flat = lotNamed(s, 'Marigold Flat');
    const hh = s.households[s.activeHouseholdId]!;
    const ids = members(s);
    const oldHome = hh.homeLotId!;
    const fundsBefore = hh.funds;
    const preview = core.movePreview(flat.id)!;
    expect(preview).toMatchObject({ ok: true, mode: 'rent', cost: flat.rent!, proceeds: Math.round(preview.proceeds) });
    expect(preview.proceeds).toBeGreaterThan(0); // the starter home was owned
    expect(preview.lines.join(' ')).toMatch(/weekly rent|a week in rent/);
    expect(core.moveHousehold(core.state()!.households[nextDoorId(s)]!.homeLotId!)).toMatchObject({ ok: false, reason: expect.stringMatching(/not empty/) });
    expect(core.moveHousehold(flat.id)).toEqual({ ok: true });
    expect(hh.homeLotId).toBe(flat.id);
    expect(hh.funds).toBe(fundsBefore - flat.rent! + preview.proceeds);
    expect(hh.ledger.filter((l) => l.kind === 'bill' && l.occurrence?.endsWith(':cost'))).toHaveLength(1);
    expect(hh.ledger.filter((l) => l.kind === 'sale')).toHaveLength(1);
    expect(s.lots[oldHome]!.ownerHouseholdId).toBeNull(); // sold: for sale again
    expect(s.lots[oldHome]!.price).toBe(s.lots[oldHome]!.landValue);
    arrive(core);
    expect(core.state()!.activeLotId).toBe(flat.id);
    for (const id of ids) expect(core.state()!.people[id]!.location).toMatchObject({ kind: 'lot', lotId: flat.id });
    // the first bill of the new home: rent instead of property tax
    runUntil(core, () => (core.state()!.bills ?? []).some((b) => b.householdId === hh.id), 24 * 60);
    const bill = core.state()!.bills!.find((b) => b.householdId === hh.id)!;
    expect(bill.base).toBeGreaterThanOrEqual(flat.rent!);
    expect(core.movePreview(flat.id)).toMatchObject({ ok: false, reason: 'You already live here.' });
    checkLedgers(core.state()!);
    checkWorld(core);
  });

  it('buys a house that is for sale when the household can afford it', () => {
    const core = quiet();
    const s = core.state()!;
    const house = lotNamed(s, 'Hazelbank House');
    const hh = s.households[s.activeHouseholdId]!;
    expect(core.movePreview(house.id)).toMatchObject({ ok: true, mode: 'buy' });
    hh.funds = 1000; hh.ledger = [{ id: 'led_x', at: 0, kind: 'start', amount: 1000, label: 'x' }];
    const poor = core.movePreview(house.id)!;
    expect(poor.ok).toBe(true); // selling the starter home pays for it
    hh.funds = 0; hh.ledger = [];
    s.lots[hh.homeLotId!]!.ownerHouseholdId = null; // nothing to sell
    expect(core.movePreview(house.id)).toMatchObject({ ok: false, reason: expect.stringMatching(/Not enough household funds/) });
    expect(core.moveHousehold(house.id)).toMatchObject({ ok: false });
    expect(hh.funds).toBe(0);
  });
});

const nextDoorId = (s: WorldState): Id => s.neighbourhood!.nextDoorHouseholdId!;
