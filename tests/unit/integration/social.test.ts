// Headless playtest of Milestone 5 through GameCore with the real content, world, simulation and persistence: a
// household befriends the neighbour, courts a single newcomer and goes on a date at home, then throws a dinner party
// for three guests. Everything is driven the way the interface drives it (menu options, queue, planEvent). The whole
// story is played twice, once straight through and once with the world saved, reloaded and replaced in the middle of the
// date and of the party, and both must end in exactly the same state: deterministic, and safe across save and load.
// Run `npx vitest run tests/unit/integration/social.test.ts --reporter=default --silent=false` for the story.

import { describe, expect, it } from 'vitest';
import { atDayMinute, dayIndex, formatClock } from '../../../src/core/clock';
import { pairKey, relKey } from '../../../src/core/ids';
import { cloneState } from '../../../src/core/state';
import type { Id, Person, WorldState } from '../../../src/core/types';
import type { GameCore } from '../../../src/game/GameCore';
import { createPerson } from '../../../src/sim/people';
import { addHousehold } from '../../../src/core/state';
import { coreWithoutSaves, db } from './harness';
import type { PersonDraft } from '../../../src/core/drafts';

const log = (...a: unknown[]) => { if (process.env.SOCIAL_LOG) console.log(...a); };

interface Story {
  core: GameCore;
  maren: Id;
  harriet: Id;
  kofi: Id;
  quinn: Id;
  notes: string[];
}

const now = (c: GameCore) => c.state()!.clock.minutes;
const tick = (c: GameCore, n: number) => c.advanceTicks(n);
/** Runs up to `maxTicks` ticks, stopping as soon as `pred` holds; returns whether it did. */
function until(c: GameCore, pred: () => boolean, maxTicks = 4 * 60 * 24): boolean {
  for (let i = 0; i < maxTicks; i++) { if (pred()) return true; tick(c, 1); }
  return pred();
}
const onLot = (c: GameCore, id: Id) => c.state()!.people[id]!.location.kind === 'lot';
const idle = (c: GameCore, id: Id) => c.state()!.people[id]!.queue.length === 0;
const rel = (c: GameCore, a: Id, b: Id) => c.state()!.relationships[relKey(a, b)];
const bondOf = (c: GameCore, a: Id, b: Id) => c.state()!.bonds[pairKey(a, b)]?.status;

/** Plays a menu entry (as the interface does) and waits for it to finish; returns the answer (null: not possible now). */
function say(c: GameCore, from: Id, to: Id, socialId: string): boolean | null {
  until(c, () => onLot(c, from) && idle(c, from) && onLot(c, to), 4 * 20);
  const opt = c.options(from, { kind: 'person', personId: to }).find((o) => o.interactionId === socialId && o.enabled);
  if (!opt || !c.queue(from, opt).ok) return null;
  let answer: boolean | null = null;
  const off = c.events.on('social', (e) => { if (e.actorId === from && e.targetId === to && e.socialId === socialId) answer = e.accepted; });
  until(c, () => answer !== null || idle(c, from), 4 * 90);
  off();
  until(c, () => idle(c, from) && idle(c, to), 4 * 30);
  return answer;
}

/** Phone entry from the self menu. */
function phone(c: GameCore, from: Id, interactionId: string, personId: Id): boolean {
  until(c, () => onLot(c, from) && idle(c, from), 4 * 60 * 24); // she may be at work
  // the person's own menu: picking yourself gives the self options (phone, outfit...)
  const opt = c.options(from, { kind: 'person', personId: from }).filter((o) => o.interactionId === interactionId).find((o) => o.enabled && o.token && JSON.stringify(o.token).includes(personId));
  if (!opt || !c.queue(from, opt).ok) return false;
  until(c, () => idle(c, from), 4 * 40);
  return true;
}

/** Invites the person over (if needed) and waits until they are on the lot and free. */
function haveOver(c: GameCore, me: Id, other: Id, maxHours = 30): boolean {
  if (!onLot(c, other)) {
    const pending = c.state()!.schedule.some((e) => e.kind === 'visitArrive' && e.personId === other);
    if (!pending && !phone(c, me, 'phoneInvite', other)) { until(c, () => onLot(c, other), 4 * 60 * 6); }
  }
  return until(c, () => onLot(c, other) && idle(c, other), 4 * 60 * maxHours);
}

const FRIENDLY = ['chat', 'askAboutDay', 'tellJoke', 'discussInterests', 'compliment', 'shareNews', 'tease'];
const WARM = ['complimentAppearance', 'flirt', 'holdHands', 'chat', 'compliment', 'tellJoke'];

/** Chats with a visitor, with breaks, until the friendship is strong enough, then asks to be friends. */
function befriend(c: GameCore, me: Id, other: Id, notes: string[]): void {
  for (let day = 0; day < 8 && bondOf(c, me, other) !== 'friend'; day++) {
    if (!haveOver(c, me, other)) continue;
    if (!onLot(c, other)) continue;
    for (let i = 0; i < 14 && onLot(c, other) && bondOf(c, me, other) !== 'friend'; i++) {
      const r = rel(c, me, other);
      if ((r?.familiarity ?? 0) < 10) { say(c, me, other, 'introduce'); continue; }
      if ((r?.friendship ?? 0) >= 30 && (r?.familiarity ?? 0) >= 25) {
        const ok = say(c, me, other, 'becomeFriends');
        notes.push(`${formatClock(now(c))}: asked ${c.state()!.people[other]!.firstName} to be friends: ${ok}`);
      } else say(c, me, other, FRIENDLY[i % FRIENDLY.length]!);
      tick(c, 4 * 20); // a pause lets the repeat penalty wear off
    }
    // let the visitor go home
    until(c, () => !onLot(c, other), 4 * 60 * 6);
  }
}

/** Gets to know someone better and warms up to them until the romance is strong enough to ask them out. */
function court(c: GameCore, me: Id, other: Id, notes: string[]): void {
  for (let day = 0; day < 10; day++) {
    const r = rel(c, me, other);
    if ((r?.romance ?? 0) >= 25 && (r?.friendship ?? 0) >= 30 && (rel(c, other, me)?.romance ?? 0) >= 12) return;
    if (!haveOver(c, me, other)) continue;
    for (let i = 0; i < 16 && onLot(c, other); i++) {
      const cur = rel(c, me, other);
      if ((cur?.familiarity ?? 0) < 10) { say(c, me, other, 'introduce'); continue; }
      const pool = (cur?.friendship ?? 0) < 25 ? FRIENDLY : WARM;
      say(c, me, other, pool[i % pool.length]!);
      tick(c, 4 * 20);
      const back = rel(c, other, me);
      if ((cur?.romance ?? 0) >= 25 && (cur?.friendship ?? 0) >= 30 && (back?.romance ?? 0) >= 12) { notes.push(`${formatClock(now(c))}: courting done`); return; }
    }
    until(c, () => !onLot(c, other), 4 * 60 * 6);
  }
}

/** A single, open newcomer on the street (the premade neighbours are a married couple). */
function addQuinn(c: GameCore): Id {
  const st = c.state()!;
  const template = c.premadeHouseholds()[2]!.members[1]!; // Rafael: a different, complete adult draft
  const draft: PersonDraft = { ...JSON.parse(JSON.stringify(template)) as PersonDraft, firstName: 'Quinn', lastName: 'Vale', traits: ['romantic', 'outgoing', 'cheerful'], romance: { interestedIn: ['any'], open: true } };
  const hh = addHousehold(st, 'Vale', 600000, null, false);
  return createPerson(st, db, draft, hh.id, { kind: 'offlot', place: 'home', since: st.clock.minutes, until: null }).id;
}

/** Saves, reloads and replaces the world, as loading a save does. */
function reload(c: GameCore): void { c.replaceState(cloneState(c.state()!)); }

function play(reloadInside: boolean): Story {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', core.premadeHouseholds()[0]!, 21)).toEqual({ ok: true });
  const st = core.state()!;
  const maren = st.households[st.activeHouseholdId]!.memberIds[0]!;
  const neighbours = Object.values(st.people).filter((p) => p.isNpc).map((p) => p.id);
  const harriet = neighbours.find((id) => st.people[id]!.firstName === 'Harriet')!;
  const kofi = neighbours.find((id) => st.people[id]!.firstName === 'Kofi')!;
  const quinn = addQuinn(core);
  const story: Story = { core, maren, harriet, kofi, quinn, notes: [] };
  const { notes } = story;
  // Keep the household's money and mood out of the way: the story is about people.
  const hh = st.households[st.activeHouseholdId]!;
  hh.funds = 900000;

  // Day 0, 17:00: the neighbour comes to welcome the new household.
  expect(until(core, () => onLot(core, harriet), 4 * 60 * 12)).toBe(true);
  expect(core.state()!.homeEvents![0]).toMatchObject({ type: 'welcomeWagon', status: 'running', guestIds: [harriet] });
  log('welcome wagon at', formatClock(now(core)));
  befriend(core, maren, harriet, notes);
  expect(bondOf(core, maren, harriet)).toBe('friend');
  expect(rel(core, maren, harriet)!.label).toBe('friend');
  expect(core.state()!.homeEvents!.some((e) => e.type === 'welcomeWagon' && e.status === 'done' && e.rating !== undefined)).toBe(true);
  expect(core.state()!.people[maren]!.memories.some((m) => m.kind === 'becameFriends' && m.withId === harriet)).toBe(true);

  // Quinn moves in nearby: get to know each other, warm up, then ask for a date at home.
  court(core, maren, quinn, notes);
  expect(rel(core, maren, quinn)!.romance).toBeGreaterThanOrEqual(25);
  expect(until(core, () => !onLot(core, quinn), 4 * 60 * 8)).toBe(true);
  const eventsBefore = core.state()!.homeEvents!.length;
  const startAt = atDayMinute(dayIndex(now(core)) + 1, 19 * 60);
  const date = core.planEvent({ type: 'date', hostId: maren, guestIds: [quinn], startAt });
  expect(date.ok, JSON.stringify(date)).toBe(true);
  const dateEvt = () => core.state()!.homeEvents!.find((e) => e.id === (date as { eventId: Id }).eventId)!;
  expect(core.state()!.homeEvents!.length).toBe(eventsBefore + 1);
  expect(dateEvt().status).toBe('invited');
  until(core, () => dateEvt().status === 'running', 4 * 60 * 40);
  expect(onLot(core, quinn)).toBe(true);
  expect(dateEvt().catered).toBeGreaterThan(0);
  if (reloadInside) reload(core);
  // on the date: talk, a romantic moment, then dinner is eaten through autonomy
  for (const id of ['chat', 'complimentAppearance', 'holdHands', 'flirt', 'tellJoke']) { if (dateEvt().status === 'running') say(core, maren, quinn, id); }
  until(core, () => dateEvt().status === 'done', 4 * 60 * 5);
  expect(dateEvt()).toMatchObject({ status: 'done' });
  expect(dateEvt().rating).toBeDefined();
  notes.push(`date: ${dateEvt().rating} (${dateEvt().score}) goals ${dateEvt().goals.map((g) => `${g.kind} ${g.progress}/${g.target}`).join(', ')}`);
  until(core, () => !onLot(core, quinn), 4 * 60 * 3);
  expect(onLot(core, quinn)).toBe(false);
  const dateMemories = core.state()!.people[maren]!.memories.filter((m) => m.withId === quinn && ['firstDate', 'greatDate', 'badDate'].includes(m.kind));
  expect(dateMemories.length).toBeLessThanOrEqual(1);
  expect(core.state()!.processed[`eventdone:${dateEvt().id}`]).toBeDefined();

  // A dinner party for three guests: Harriet, Kofi (meet him first) and Quinn.
  expect(haveOver(core, maren, kofi)).toBe(true);
  if ((rel(core, maren, kofi)?.familiarity ?? 0) < 10) say(core, maren, kofi, 'introduce');
  say(core, maren, kofi, 'chat');
  until(core, () => !onLot(core, kofi), 4 * 60 * 8);
  for (const g of [harriet, kofi, quinn]) expect(rel(core, maren, g)!.familiarity, `knows ${g}`).toBeGreaterThan(0);
  const partyAt = atDayMinute(dayIndex(now(core)) + 1, 19 * 60);
  const party = core.planEvent({ type: 'dinnerParty', hostId: maren, guestIds: [harriet, kofi, quinn], startAt: partyAt });
  expect(party.ok, JSON.stringify(party)).toBe(true);
  const partyEvt = () => core.state()!.homeEvents!.find((e) => e.id === (party as { eventId: Id }).eventId)!;
  until(core, () => partyEvt().status === 'running', 4 * 60 * 40);
  until(core, () => now(core) >= partyEvt().startAt + 45, 4 * 60);
  expect(partyEvt().arrivedIds.slice().sort()).toEqual([harriet, kofi, quinn].sort());
  for (const g of [harriet, kofi, quinn]) expect(onLot(core, g)).toBe(true);
  if (reloadInside) reload(core);
  until(core, () => partyEvt().status === 'done', 4 * 60 * 6);
  expect(partyEvt().status).toBe('done');
  notes.push(`party: ${partyEvt().rating} (${partyEvt().score}) goals ${partyEvt().goals.map((g) => `${g.kind} ${g.progress}/${g.target}`).join(', ')}`);
  until(core, () => [harriet, kofi, quinn].every((g) => !onLot(core, g)), 4 * 60 * 3);
  for (const g of [harriet, kofi, quinn]) expect(onLot(core, g)).toBe(false);
  expect(core.state()!.processed[`eventdone:${partyEvt().id}`]).toBeDefined();
  expect(core.state()!.people[maren]!.memories.some((m) => m.kind === 'party')).toBe(partyEvt().rating !== 'poor' && partyEvt().rating !== 'fair');
  // the food was paid for exactly once
  const ledger = core.state()!.households[core.state()!.activeHouseholdId]!.ledger;
  for (const e of [dateEvt(), partyEvt()]) expect(ledger.filter((l) => l.occurrence === `event:${e.id}:food`)).toHaveLength(1);
  return story;
}

function summary(s: Story): string {
  const st = s.core.state()!;
  const who = (id: Id) => st.people[id]!.firstName;
  return [...s.notes, ...[s.harriet, s.kofi, s.quinn].map((g) => {
    const r = rel(s.core, s.maren, g)!;
    return `${who(g)}: familiarity ${Math.round(r.familiarity)}, friendship ${Math.round(r.friendship)}, trust ${Math.round(r.trust)}, romance ${Math.round(r.romance)}, label ${r.label}, bond ${bondOf(s.core, s.maren, g) ?? '-'}`;
  })].join('\n');
}

describe('Milestone 5 playtest: friends, a date at home and a dinner party', () => {
  let a: Story;
  it('plays the whole story', () => {
    a = play(false);
    log(summary(a));
    const st = a.core.state() as WorldState;
    // memories exist for the milestones, are bounded, and relationships stayed in range
    const maren: Person = st.people[a.maren]!;
    expect(maren.memories.length).toBeLessThanOrEqual(64);
    for (const r of Object.values(st.relationships)) {
      for (const v of [r.friendship, r.trust, r.romance]) expect(v >= -100 && v <= 100).toBe(true);
      expect(r.familiarity >= 0 && r.familiarity <= 100).toBe(true);
    }
    expect(st.homeEvents!.filter((e) => e.status === 'done').length).toBeGreaterThanOrEqual(3);
    expect(st.homeEvents!.every((e) => e.status !== 'invited' && e.status !== 'running')).toBe(true);
  }, 120_000);

  it('is deterministic and identical when the world is saved and reloaded in the middle of the date and of the party', () => {
    const b = play(true);
    expect(JSON.stringify(b.core.state())).toBe(JSON.stringify(a.core.state()));
  }, 120_000);
});
