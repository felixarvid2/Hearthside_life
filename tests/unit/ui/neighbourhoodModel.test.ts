import { describe, expect, it } from 'vitest';
import { premadeHouseholds } from '../../../src/characters/creator';
import type { Id, Person } from '../../../src/core/types';
import type { HouseholdInfo, LotInfo, LotPerson, MovePreview } from '../../../src/game/api';
import {
  awayFromHome, awayIconName, awayInfo, defaultTravellers, hoursLine, joinNames, keepTravellers, lotActions, lotIconName, lotMarks, lotSections, lotStatus,
  mapSummary, memberTravel, moveSummary, peopleLine, pinPosition, tenureText, travelLine, travellers, tripFromState, tripView,
} from '../../../src/ui/hud/neighbourhoodModel';
import { coreWithoutSaves, db } from '../integration/harness';

const lot = (over: Partial<LotInfo> = {}): LotInfo => ({
  id: 'lot_1', name: 'Kettle & Crumb', address: '3 Market Square', kind: 'venue', venueType: 'cafe', label: 'Cafe', blurb: '', map: { x: 28, y: 32 },
  size: { width: 24, depth: 24 }, active: false, isHome: false, built: false, objects: 0, usable: false, open: true, hours: '7:00 AM - 9:00 PM',
  householdId: null, householdName: null, tenure: null, rent: null, price: null, travelMinutes: 25, travelProblem: null, people: [], ...over,
});
const home = (over: Partial<LotInfo> = {}): LotInfo => lot({ kind: 'residential', venueType: null, label: 'Home', hours: null, tenure: 'owned', householdId: 'hh_2', householdName: 'Okafor', ...over });
const who = (name: string, yours = false): LotPerson => ({ personId: name, name: `${name} Test`, householdId: yours ? 'hh_1' : 'hh_2', householdName: '', yours, here: false, status: 'At home' });

describe('lot words and marks', () => {
  it('picks an icon per venue type and a house for homes', () => {
    expect(lotIconName(lot())).toBe('cafe');
    expect(lotIconName(lot({ venueType: 'library' }))).toBe('book');
    expect(lotIconName(lot({ venueType: 'park' }))).toBe('park');
    expect(lotIconName(lot({ venueType: null }))).toBe('pin');
    expect(lotIconName(home())).toBe('home');
  });

  it('gives each kind of lot a short status line', () => {
    expect(lotStatus(lot())).toEqual({ text: 'Open', tone: 'open' });
    expect(lotStatus(lot({ open: false }))).toEqual({ text: 'Closed', tone: 'closed' });
    expect(lotStatus(home({ tenure: 'yours' }))).toEqual({ text: 'Your home', tone: 'yours' });
    expect(lotStatus(home())).toEqual({ text: 'Okafor', tone: 'neutral' });
    expect(lotStatus(home({ tenure: 'for-rent', rent: 12500, householdId: null, householdName: null }))).toEqual({ text: 'For rent $125/wk', tone: 'free' });
    expect(lotStatus(home({ tenure: 'for-sale', price: 2100000, householdId: null, householdName: null }))).toEqual({ text: 'For sale $21,000', tone: 'free' });
  });

  it('writes the tenure sentence of homes and nothing for venues', () => {
    expect(tenureText(lot())).toBeNull();
    expect(tenureText(home({ tenure: 'rented', rent: 9000 }))).toBe('Rented by the Okafor household for $90 a week.');
    expect(tenureText(home({ tenure: 'owned' }))).toBe('Owned by the Okafor household.');
    expect(tenureText(home({ tenure: 'for-rent', rent: 12500, householdName: null }))).toBe('Empty, for rent: $125 a week.');
    expect(tenureText(home({ tenure: 'for-sale', price: 2100000, householdName: null }))).toBe('Empty, for sale: $21,000.');
  });

  it('marks the active lot and the home lot', () => {
    expect(lotMarks(lot())).toEqual([]);
    expect(lotMarks(lot({ active: true, isHome: true })).map((m) => m.text)).toEqual(['You are here', 'Your home']);
    expect(lotMarks(lot({ isHome: true })).map((m) => m.id)).toEqual(['home']);
  });

  it('lists who is there, yours first, and says when nobody is', () => {
    expect(peopleLine([])).toBe('Nobody');
    expect(peopleLine([who('Zed'), who('Mira', true)])).toBe('Mira, Zed');
    expect(peopleLine([who('A'), who('B'), who('C'), who('D')])).toBe('A, B +2');
  });

  it('describes hours and travel time', () => {
    expect(hoursLine(lot())).toBe('Open 7:00 AM - 9:00 PM');
    expect(hoursLine(lot({ open: false }))).toBe('Closed 7:00 AM - 9:00 PM');
    expect(hoursLine(home())).toBeNull();
    expect(travelLine(lot())).toBe('25 min away');
    expect(travelLine(lot({ active: true }))).toBeNull();
    expect(travelLine(lot({ travelMinutes: null }))).toBeNull();
  });
});

describe('map and list', () => {
  it('keeps pins inside the map', () => {
    expect(pinPosition({ map: { x: 50, y: 14 } })).toEqual({ left: 50, top: 14 });
    expect(pinPosition({ map: { x: 0, y: 100 } })).toEqual({ left: 7, top: 93 });
    expect(pinPosition({ map: { x: Number.NaN, y: 20 } }).left).toBe(50);
  });

  it('groups the list: here, places to go, homes (own home first), empty homes', () => {
    const lots = [
      home({ id: 'h2', name: 'Birch', tenure: 'owned' }), home({ id: 'h1', name: 'Alder', tenure: 'yours', isHome: true }),
      home({ id: 'e1', name: 'Marigold Flat', tenure: 'for-rent', rent: 12500 }), lot({ id: 'v2', name: 'Park', venueType: 'park' }),
      lot({ id: 'v1', name: 'Cafe', active: true }),
    ];
    const sections = lotSections(lots);
    expect(sections.map((s) => s.id)).toEqual(['here', 'places', 'homes', 'empty']);
    expect(sections[0]!.lots.map((l) => l.id)).toEqual(['v1']);
    expect(sections[2]!.lots.map((l) => l.id)).toEqual(['h1', 'h2']);
    expect(lotSections(lots.filter((l) => l.kind === 'venue' && !l.active)).map((s) => s.id)).toEqual(['places']);
  });

  it('counts places and usable venues', () => {
    const s = mapSummary([lot({ usable: true }), lot({ open: false, usable: true }), lot({ usable: false }), home(), home()]);
    expect(s).toEqual({ lots: 5, venues: 3, usableVenues: 2, homes: 2, open: 2 });
  });
});

describe('trips', () => {
  it('describes the trip under way', () => {
    const trip = { occurrence: 't', personIds: ['a', 'b'], lotId: 'p', lotName: 'Lakeside Park', arriveAt: 14 * 60 + 20 };
    const v = tripView(trip, 14 * 60 + 2, (id) => id.toUpperCase())!;
    expect(v.title).toBe('On the way to Lakeside Park');
    expect(v.who).toBe('A and B');
    expect(v.minutesLeft).toBe(18);
    expect(v.line).toBe('A and B - arrives 2:20 PM (in 18 min)');
    expect(tripView(null, 0, (id) => id)).toBeNull();
    expect(tripView(trip, 14 * 60 + 30, (id) => id)!.minutesLeft).toBe(0);
  });

  it('joins names', () => {
    expect(joinNames([])).toBe('Nobody');
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('shows the travel mark of the real world: nothing at first, then the trip with its arrival', () => {
    const core = coreWithoutSaves();
    expect(core.startNewGame('guided', premadeHouseholds(db)[0]!, 42)).toEqual({ ok: true });
    const s = core.state()!;
    s.settings.visitors = false;
    expect(tripFromState(s)).toBeNull();
    const ids = [...s.households[s.activeHouseholdId]!.memberIds];
    for (const id of ids) if (s.people[id]!.career) core.quitCareer(id);
    const park = Object.values(s.lots).find((l) => l.venueType === 'park')!;
    const hour = Math.floor(s.clock.minutes % 1440);
    if (hour < 8 * 60 || hour > 18 * 60) core.advanceTicks(Math.ceil((9 * 60 - (hour % 1440) + 1440) % 1440 / 0.25));
    const r = core.travel([ids[0]!], park.id);
    expect(r.ok).toBe(true);
    const trip = tripFromState(core.state()!);
    expect(trip).not.toBeNull();
    expect(trip!.lotId).toBe(park.id);
    expect(trip!.lotName).toBe(park.name);
    expect(trip!.personIds).toEqual([ids[0]]);
    expect(core.neighbourhood()!.trip).toEqual(trip);
  });
});

describe('who can set out', () => {
  const core = coreWithoutSaves();
  core.startNewGame('guided', premadeHouseholds(db)[0]!, 42);
  const s = core.state()!;
  const ids = [...s.households[s.activeHouseholdId]!.memberIds];
  const person = (id: Id): Person => s.people[id]!;

  it('lets people on the lot and at home go, and says why the others cannot', () => {
    const p = person(ids[0]!);
    expect(memberTravel(s, p).canGo).toBe(true);
    const base = { since: 0, until: null };
    expect(memberTravel(s, { ...p, location: { kind: 'offlot', place: 'home', ...base } } as Person)).toEqual({ canGo: true, why: null });
    expect(memberTravel(s, { ...p, location: { kind: 'offlot', place: 'work', ...base } } as Person).why).toBe('is at work');
    expect(memberTravel(s, { ...p, location: { kind: 'offlot', place: 'school', ...base } } as Person).why).toBe('is at school');
    expect(memberTravel(s, { ...p, location: { kind: 'offlot', place: 'errand', lotId: 'x', transit: true, ...base } } as Person).why).toBe('is already on the way');
    expect(memberTravel(s, { ...p, location: { kind: 'offlot', place: 'visiting', ...base } } as Person).canGo).toBe(false);
  });

  it('ticks the selected person first and falls back to the first who can go', () => {
    const list = travellers(s, ids);
    expect(list.map((t) => t.id)).toEqual(ids);
    expect(defaultTravellers(list, ids[1] ?? null)).toEqual([ids[1] ?? ids[0]]);
    expect(defaultTravellers(list, null)).toEqual([ids[0]]);
    expect(defaultTravellers(list, 'nobody')).toEqual([ids[0]]);
    expect(defaultTravellers(list, null, true)).toEqual(ids);
    const blocked = list.map((t, i) => (i === 0 ? { ...t, canGo: false, why: 'is at work' } : t));
    expect(defaultTravellers(blocked, ids[0]!)).toEqual(ids.length > 1 ? [ids[1]] : []);
    expect(defaultTravellers([], null)).toEqual([]);
  });

  it('drops ticked people who can no longer go', () => {
    const list = travellers(s, ids).map((t, i) => (i === 0 ? { ...t, canGo: false, why: 'is at work' } : t));
    expect(keepTravellers(list, ids)).toEqual(ids.slice(1));
  });
});

describe('actions of a lot', () => {
  const okafor: HouseholdInfo = { id: 'hh_2', name: 'Okafor', homeLotId: 'h2', homeLotName: 'Birch', active: false, memberIds: ['p'], memberNames: ['Rin'], funds: 100, where: 'At home', switchable: true };

  it('offers Go here for other places, Go home for your home when away, and nothing for the lot you are on', () => {
    expect(lotActions(lot(), [])).toMatchObject({ here: false, visit: true, goHome: false, move: null, play: null });
    expect(lotActions(lot({ active: true }), [])).toMatchObject({ here: true, visit: false, goHome: false });
    expect(lotActions(home({ isHome: true, tenure: 'yours', householdId: 'hh_1' }), [])).toMatchObject({ visit: false, goHome: true });
    expect(lotActions(home({ isHome: true, active: true, tenure: 'yours' }), [])).toMatchObject({ goHome: false, here: true });
  });

  it('offers Move here for empty homes and Play this household for homes of switchable households', () => {
    expect(lotActions(home({ tenure: 'for-rent', householdId: null }), []).move).toBe('rent');
    expect(lotActions(home({ tenure: 'for-sale', householdId: null }), []).move).toBe('buy');
    expect(lotActions(home({ id: 'h2' }), [okafor]).play).toBe(okafor);
    expect(lotActions(home({ id: 'h2' }), [{ ...okafor, switchable: false }]).play).toBeNull();
    expect(lotActions(home({ id: 'h2' }), [{ ...okafor, active: true }]).play).toBeNull();
    expect(lotActions(home({ tenure: 'yours', householdId: 'hh_2' }), [okafor]).play).toBeNull();
  });

  it('knows when the household is away from home', () => {
    expect(awayFromHome({ activeLotId: 'a', homeLotId: 'b' })).toBe(true);
    expect(awayFromHome({ activeLotId: 'a', homeLotId: 'a' })).toBe(false);
    expect(awayFromHome({ activeLotId: 'a', homeLotId: null })).toBe(false);
  });

  it('writes the move confirmation with what is paid and received', () => {
    const pv: MovePreview = { ok: true, lotId: 'e1', mode: 'rent', cost: 12500, proceeds: 0, lines: ['Rent line.'] };
    expect(moveSummary(pv, 'Marigold Flat')).toEqual({ title: 'Move into Marigold Flat?', confirm: 'Rent and move', lines: ['Rent line.', 'Paid now: $125.'] });
    const buy = moveSummary({ ...pv, mode: 'buy', cost: 2100000, proceeds: 800000 }, 'Hazelbank House');
    expect(buy.title).toBe('Buy Hazelbank House?');
    expect(buy.lines).toEqual(['Rent line.', 'You pay: $21,000.', 'You receive $8,000 for your current home.']);
  });
});

describe('household members off the active lot', () => {
  it('says where somebody is and whether you can go there', () => {
    const core = coreWithoutSaves();
    core.startNewGame('guided', premadeHouseholds(db)[0]!, 42);
    const s = core.state()!;
    const p = s.people[s.households[s.activeHouseholdId]!.memberIds[0]!]!;
    expect(awayInfo(s, p)).toBeNull();
    const park = Object.values(s.lots).find((l) => l.venueType === 'park')!;
    const at = (loc: Person['location']) => awayInfo(s, { ...p, location: loc } as Person)!;
    const parkVisit = at({ kind: 'offlot', place: 'visiting', lotId: park.id, since: 0, until: null });
    expect(parkVisit).toMatchObject({ kind: 'venue', text: `At ${park.name}`, lotId: park.id, lotName: park.name, when: null, canGoTo: true });
    const work = at({ kind: 'offlot', place: 'work', since: 0, until: 17 * 60 });
    expect(work).toMatchObject({ kind: 'work', text: 'At work', lotId: null, canGoTo: false });
    expect(work.when).toBe('Back around 5:00 PM');
    const transit = at({ kind: 'offlot', place: 'errand', lotId: park.id, since: 0, until: 14 * 60 + 20, transit: true });
    expect(transit).toMatchObject({ kind: 'transit', canGoTo: false, when: 'Arrives 2:20 PM' });
    expect(at({ kind: 'offlot', place: 'home', lotId: s.activeLotId, since: 0, until: null }).canGoTo).toBe(false); // already on the active lot
  });

  it('chooses a badge icon per place kind', () => {
    expect(awayIconName('work')).toBe('briefcase');
    expect(awayIconName('school')).toBe('briefcase');
    expect(awayIconName('home')).toBe('home');
    expect(awayIconName('transit')).toBe('car');
    expect(awayIconName('venue')).toBe('pin');
  });
});

describe('community events in the map', () => {
  const ev = (key: string, lotId: string, startAt: number, endAt: number, running = false) =>
    ({ key, defId: key, name: key, description: '', icon: 'star', lotId, lotName: lotId, venueType: 'arts', startAt, endAt, running });
  it('words when an event is on and puts running ones first', async () => {
    const { eventWhen, eventsAt } = await import('../../../src/ui/hud/neighbourhoodModel');
    const day = 1440;
    const now = 3 * day + 18 * 60 + 30;
    expect(eventWhen(ev('a', 'l', 3 * day + 18 * 60, 3 * day + 20 * 60), now)).toBe('Now until 8:00 PM');
    expect(eventWhen(ev('b', 'l', 3 * day + 21 * 60, 3 * day + 22 * 60), now)).toMatch(/^Today /);
    expect(eventWhen(ev('c', 'l', 4 * day + 10 * 60, 4 * day + 11 * 60), now)).toMatch(/^Tomorrow /);
    expect(eventWhen(ev('d', 'l', 6 * day + 10 * 60, 6 * day + 11 * 60), now)).toMatch(/^[A-Z][a-z]{2} /);
    const list = [ev('late', 'x', 5 * day, 5 * day + 60), ev('now', 'x', now - 10, now + 60, true), ev('other', 'y', 4 * day, 4 * day + 60)];
    expect(eventsAt(list, 'x').map((e) => e.key)).toEqual(['now', 'late']);
    expect(eventsAt(list).map((e) => e.key)).toEqual(['now', 'other', 'late']);
  });
});
