import { describe, expect, it } from 'vitest';
import { content } from '../../../src/content/index';
import { atDayMinute } from '../../../src/core/clock';
import { createEmptyWorld } from '../../../src/core/state';
import type { HomeEvent, Person, WorldState } from '../../../src/core/types';
import type { MenuOption } from '../../../src/game/api';
import { memoryEffects, relationshipRows } from '../../../src/ui/hud/format';
import { fianceOf, guestAvailability, guestCandidates, sectionsOf, startOptions, trackedEvent } from '../../../src/ui/hud/socialModel';

const db = content();

const person = (w: WorldState, id: string, householdId: string, first: string, over: Partial<Person> = {}): Person => {
  const p = {
    id, householdId, firstName: first, lastName: 'Test', lifeStage: 'adult', memories: [], romance: { interestedIn: ['any'], open: true },
    appearance: { frame: 'a' }, location: { kind: 'offlot', place: 'home', since: 0, until: null }, ...over,
  } as unknown as Person;
  w.people[id] = p;
  return p;
};

const opt = (interactionId: string, section: string | undefined, enabled = true): MenuOption =>
  ({ interactionId, label: interactionId, icon: 'social', group: 'social', enabled, ...(section ? { section } : {}), token: {} });

describe('social menu sections', () => {
  it('splits socials into Friendly / Romantic / Mean / Special in that order and keeps the given order inside', () => {
    const list = [opt('a', 'special'), opt('b', 'friendly'), opt('c', 'mean'), opt('d', 'friendly'), opt('e', 'romantic'), opt('f', undefined)];
    const parts = sectionsOf('social', list);
    expect(parts.map((p) => p.label)).toEqual(['Friendly', 'Romantic', 'Mean', 'Special']);
    expect(parts.map((p) => p.items.map((o) => o.interactionId))).toEqual([['b', 'd'], ['e'], ['c'], ['a', 'f']]); // no section: with the last
  });

  it('leaves out empty sections and puts the phone entries after the rest of the self menu', () => {
    const self = (id: string, section?: string): MenuOption => ({ ...opt(id, section), group: 'self' });
    const parts = sectionsOf('self', [self('plan', 'phone'), self('dance'), self('chat', 'phone')]);
    expect(parts.map((p) => p.id)).toEqual(['', 'phone']);
    expect(parts[1]!.items.map((o) => o.interactionId)).toEqual(['plan', 'chat']);
    expect(sectionsOf('object', [{ ...opt('x', undefined), group: 'object' }])).toHaveLength(1);
    expect(sectionsOf('social', [])).toEqual([]);
  });
});

describe('relationship rows', () => {
  it('carry the label, both bars, memories with dates and the effects that are still running', () => {
    const w = createEmptyWorld(1, 'guided');
    w.clock.minutes = atDayMinute(2, 15 * 60);
    const me = person(w, 'per_a', 'h1', 'Ada');
    person(w, 'per_b', 'h2', 'June');
    w.relationships['per_a>per_b'] = { from: 'per_a', to: 'per_b', familiarity: 50, friendship: 65, trust: 40, romance: 0, lastInteractionAt: null, recent: {}, label: 'closeFriend' };
    me.memories.push(
      { id: 'mem_1', at: atDayMinute(2, 9 * 60), kind: 'argument', withId: 'per_b', text: 'A heated argument', importance: 2, count: 3 },
      { id: 'mem_2', at: atDayMinute(1, 10 * 60), kind: 'becameFriends', withId: 'per_b', text: 'Became friends', importance: 3, count: 1 },
      { id: 'mem_3', at: atDayMinute(0, 10 * 60), kind: 'movedIn', text: 'Moved in', importance: 3, count: 1 });
    const [row] = relationshipRows(w, 'per_a');
    expect(row).toMatchObject({ label: 'closeFriend', labelText: 'Close friend', friendship: 65, trust: 40, showRomance: false, moreMemories: 0 });
    expect(row!.memories.map((m) => m.id)).toEqual(['mem_1', 'mem_2']); // newest first, only about June
    expect(row!.memories[0]).toMatchObject({ when: 'Day 3, 9:00 AM', count: 3, importance: 2, resolved: false });
    expect(row!.effects).toEqual(['Less receptive after the argument (18 h left)']);
    me.memories[0]!.resolved = true;
    expect(memoryEffects(me, 'per_b', w.clock.minutes)).toEqual([]);
  });

  it('falls back to a label from the bond when none is stored, and limits the memory list', () => {
    const w = createEmptyWorld(1, 'guided');
    const me = person(w, 'per_a', 'h1', 'Ada');
    person(w, 'per_b', 'h1', 'Theo');
    w.relationships['per_a>per_b'] = { from: 'per_a', to: 'per_b', familiarity: 50, friendship: 50, trust: 0, romance: 50, lastInteractionAt: null, recent: {} };
    w.bonds['per_a|per_b'] = { a: 'per_a', b: 'per_b', status: 'spouse', familyAtoB: 'none', since: 0 };
    for (let i = 0; i < 9; i++) me.memories.push({ id: `m${i}`, at: i, kind: 'joke', withId: 'per_b', text: `t${i}`, importance: 1, count: 1 });
    const [row] = relationshipRows(w, 'per_a');
    expect(row).toMatchObject({ label: 'spouse', labelText: 'Spouse', showRomance: true, moreMemories: 4 });
    expect(row!.memories).toHaveLength(5);
  });
});

describe('event tracker model', () => {
  const ev = (over: Partial<HomeEvent>): HomeEvent => ({
    id: 'evt_1', type: 'dinnerParty', title: 'Dinner Party', status: 'invited', hostId: 'per_a', householdId: 'hh', lotId: 'lot', guestIds: [], arrivedIds: [],
    createdAt: 0, startAt: 100, endAt: 300, goals: [], pairs: [], ate: [], ...over,
  });
  const world = (events: HomeEvent[], now = 50): WorldState => { const w = createEmptyWorld(1, 'guided'); w.activeHouseholdId = 'hh'; w.clock.minutes = now; w.homeEvents = events; return w; };

  it('prefers a running event, then the next planned one, then a fresh result', () => {
    const none = new Set<string>();
    expect(trackedEvent(world([]), none)).toBeUndefined();
    expect(trackedEvent(world([ev({ id: 'a', startAt: 500 }), ev({ id: 'b', startAt: 200 })]), none)!.id).toBe('b');
    expect(trackedEvent(world([ev({ id: 'a', startAt: 500 }), ev({ id: 'r', status: 'running' })]), none)!.id).toBe('r');
    const done = ev({ id: 'd', status: 'done', endAt: 300, rating: 'good', score: 70 });
    expect(trackedEvent(world([done], 320), none)!.id).toBe('d');
    expect(trackedEvent(world([done], 320), new Set(['d']))).toBeUndefined(); // dismissed
    expect(trackedEvent(world([done], 300 + 46), none)).toBeUndefined(); // too old
    expect(trackedEvent(world([ev({ id: 'c', status: 'cancelled' }), ev({ id: 'x', householdId: 'other', status: 'running' })]), none)).toBeUndefined();
  });
});

describe('event planner model', () => {
  it('offers start times that respect the notice and stay within three days', () => {
    const now = atDayMinute(0, 8 * 60);
    const opts = startOptions(now, 60);
    expect(opts[0]).toEqual({ at: atDayMinute(0, 10 * 60), label: 'Today, 10:00 AM' });
    expect(opts.every((o) => o.at >= now + 60 && o.at <= now + 3 * 1440)).toBe(true);
    expect(opts.some((o) => o.label.startsWith('Tomorrow'))).toBe(true);
    expect(startOptions(atDayMinute(0, 20 * 60), 90).every((o) => o.at >= atDayMinute(0, 20 * 60) + 90)).toBe(true);
    expect(startOptions(atDayMinute(0, 8 * 60), 60).length).toBeGreaterThan(10);
  });

  it('lists known people, dates only with people the host could be attracted to, and says who is reachable', () => {
    const w = createEmptyWorld(1, 'guided');
    const host = person(w, 'per_a', 'h1', 'Ada');
    const june = person(w, 'per_b', 'h2', 'June');
    const sam = person(w, 'per_c', 'h2', 'Sam', { appearance: { frame: 'b' } as Person['appearance'], location: { kind: 'offlot', place: 'work', since: 0, until: null } });
    const kid = person(w, 'per_d', 'h2', 'Kit', { lifeStage: 'child' });
    const theo = person(w, 'per_e', 'h1', 'Theo');
    for (const [id, f] of [['per_b', 40], ['per_c', 10], ['per_d', 60], ['per_e', 70]] as const) w.relationships[`per_a>${id}`] = { from: 'per_a', to: id, familiarity: 20, friendship: f, trust: 0, romance: 0, lastInteractionAt: null, recent: {} };
    w.relationships['per_a>per_x'] = { from: 'per_a', to: 'per_x', familiarity: 0, friendship: 90, trust: 0, romance: 0, lastInteractionAt: null, recent: {} };
    expect(guestCandidates(w, host, db.events!.dinnerParty!).map((p) => p.firstName)).toEqual(['Kit', 'June', 'Sam']); // best liked first; housemates and strangers left out
    expect(guestCandidates(w, host, db.events!.date!).map((p) => p.firstName)).toEqual(['Theo', 'June', 'Sam']); // adults only; a partner at home may be asked
    host.romance = { interestedIn: ['b'], open: true };
    expect(guestCandidates(w, host, db.events!.date!).map((p) => p.firstName)).toEqual(['Sam']);
    w.relationships['per_a>per_c']!.romanceBlocked = true;
    expect(guestCandidates(w, host, db.events!.date!)).toEqual([]);
    expect(guestAvailability(june)).toEqual({ ok: true, text: 'At home' });
    expect(guestAvailability(sam)).toEqual({ ok: false, text: 'At work' });
    expect(guestAvailability({ ...kid, location: { kind: 'lot', lotId: 'l', level: 0, x: 1, z: 1, facing: 0, posture: 'standing' } } as Person)).toEqual({ ok: true, text: 'Here already' });
    void theo;
  });

  it('a wedding offers the fiance(e) first, even at home, and nobody else from the household', () => {
    const w = { people: {}, relationships: {}, bonds: {} } as unknown as WorldState;
    const host = person(w, 'per_a', 'h1', 'Mira');
    const theo = person(w, 'per_e', 'h1', 'Theo');
    person(w, 'per_f', 'h1', 'Kid');
    const june = person(w, 'per_c', 'h2', 'June');
    for (const [id, f] of [['per_c', 80], ['per_e', 30], ['per_f', 90]] as const) w.relationships[`per_a>${id}`] = { from: 'per_a', to: id, familiarity: 20, friendship: f, trust: 0, romance: 0, lastInteractionAt: null, recent: {} };
    expect(guestCandidates(w, host, db.events!.wedding!).map((p) => p.firstName)).toEqual(['June']);
    expect(fianceOf(w, host)).toBeUndefined();
    w.bonds['per_a|per_e'] = { a: 'per_a', b: 'per_e', status: 'engaged', familyAtoB: 'none', since: 0 };
    expect(fianceOf(w, host)).toBe(theo);
    expect(guestCandidates(w, host, db.events!.wedding!).map((p) => p.firstName)).toEqual(['Theo', 'June']);
    void june;
  });
});
