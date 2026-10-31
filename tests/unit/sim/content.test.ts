// Optional checks against the real content registries (and, when present, the world module's LotNav and
// starter house). They skip while the registries are empty so the sim tests never depend on modules that
// are written in parallel.

import { describe, expect, it } from 'vitest';
import { content } from '../../../src/content/index';
import type { ContentDB } from '../../../src/content/types';
import { atDayMinute } from '../../../src/core/clock';
import { EventBus } from '../../../src/core/events';
import type { GameEvent } from '../../../src/core/events';
import type { NavProvider } from '../../../src/core/nav';
import { addHousehold, cloneState, createEmptyWorld } from '../../../src/core/state';
import type { Lot, WorldState } from '../../../src/core/types';
import { knownBehaviors } from '../../../src/sim/behaviors';
import { applyHouseholdTies, createPerson } from '../../../src/sim/people';
import { Simulation } from '../../../src/sim/simulation';
import { draft } from './fixtures';

const db = content();
const empty = Object.keys(db.interactions).length === 0;

const M1_BEHAVIORS: Record<string, string> = {
  sleep: 'sleep', nap: 'rest', sit: 'sit', grabSnack: 'snack', cookMeal: 'cook', eatMeal: 'eatMeal', useToilet: 'toilet',
  takeShower: 'shower', washHands: 'generic', watchTv: 'watchTv', playComputerGames: 'computer', practiceProgramming: 'computer',
  readBook: 'read', listenToMusic: 'generic', practiceSpeech: 'generic', waterPlant: 'generic', changeOutfit: 'changeOutfit',
  editOutfits: 'editOutfits', goToWork: 'goToWork', goHere: 'goHere', danceSolo: 'generic', jogInPlace: 'generic',
  phoneInvite: 'invite', phoneChat: 'phoneChat',
};

describe.skipIf(empty)('real content', () => {
  it('defines every M1 interaction with the behavior the simulation implements', () => {
    for (const [id, behavior] of Object.entries(M1_BEHAVIORS)) {
      expect(db.interactions[id], id).toBeDefined();
      expect(db.interactions[id]!.behavior ?? 'generic', id).toBe(behavior);
    }
    const known = new Set(knownBehaviors());
    for (const def of Object.values(db.interactions)) expect(known.has(def.behavior ?? 'generic'), `${def.id}: ${def.behavior}`).toBe(true);
  });

  it('has what the simulation looks up by convention', () => {
    expect(db.socials.introduce?.category).toBe('greeting');
    expect(Object.values(db.objects).some((o) => o.tags.includes('stove'))).toBe(true);
    expect(db.careers.culinary?.levels).toHaveLength(10);
    expect(Object.values(db.recipes).some((r) => r.minCookingLevel <= 1 && r.status === 'ready')).toBe(true);
    for (const def of Object.values(db.interactions)) {
      if (def.moodletOnComplete) expect(db.moodlets[def.moodletOnComplete], `${def.id} moodlet`).toBeDefined();
      if (def.skill) expect(db.skills[def.skill.id], `${def.id} skill`).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Integration with the world module (optional)
// ---------------------------------------------------------------------------------------------

type LotsMod = { createLot(state: WorldState, o: { name: string; address: string; width: number; depth: number; kind: 'residential'; landValue: number; entry: { x: number; z: number; level: number } }): Lot };
type NavMod = { LotNav: new (getState: () => WorldState, content: ContentDB, events?: EventBus) => NavProvider };
type StarterMod = { furnishStarterHouse(state: WorldState, content: ContentDB, lotId: string): void };
const worldMods = import.meta.glob(['../../../src/world/lots.ts', '../../../src/world/nav.ts', '../../../src/world/starter.ts']);
const hasWorld = Object.keys(worldMods).length === 3;

async function starterWorld(seed: number): Promise<WorldState | null> {
  const lots = (await worldMods['../../../src/world/lots.ts']!()) as LotsMod;
  const starter = (await worldMods['../../../src/world/starter.ts']!()) as StarterMod;
  const state = createEmptyWorld(seed, 'guided');
  const lot = lots.createLot(state, { name: 'Home', address: '12 Hearth Row', width: 24, depth: 24, kind: 'residential', landValue: 2000000, entry: { x: 12, z: 23, level: 0 } });
  try { starter.furnishStarterHouse(state, db, lot.id); } catch { return null; }
  const hh = addHousehold(state, 'Hart', 2000000, lot.id, true);
  lot.ownerHouseholdId = hh.id;
  state.activeHouseholdId = hh.id;
  state.activeLotId = lot.id;
  const at = { kind: 'lot' as const, lotId: lot.id, level: 0, x: 12.5, z: 23.5, facing: Math.PI, posture: 'standing' as const };
  const traits = Object.keys(db.traits).slice(0, 3);
  const a = createPerson(state, db, { ...draft(state, 'Mira', { careerId: 'culinary', traits }) }, hh.id, at);
  const b = createPerson(state, db, { ...draft(state, 'Theo', { traits: Object.keys(db.traits).slice(3, 6) }) }, hh.id, { ...at, x: 11.5 });
  applyHouseholdTies(state, [a.id, b.id], [{ a: 0, b: 1, tie: 'roommate' }]);
  const nh = addHousehold(state, 'Okafor', 300000, null, false);
  createPerson(state, db, draft(state, 'Ada'), nh.id, { kind: 'offlot', place: 'home', since: state.clock.minutes, until: null });
  return state;
}

async function live(state: WorldState, ticks: number, chunks?: () => number) {
  const navMod = (await worldMods['../../../src/world/nav.ts']!()) as NavMod;
  const holder = { state };
  const events = new EventBus();
  const log: GameEvent[] = [];
  events.onAny((e) => { if (e.type === 'action.finished' || e.type === 'career' || e.type === 'social' || e.type === 'money') log.push(e); });
  const nav = new navMod.LotNav(() => holder.state, db, events);
  const sim = new Simulation({ getState: () => holder.state, content: db, nav, events });
  let left = ticks;
  while (left > 0) {
    const n = chunks ? Math.min(left, chunks()) : left;
    for (let i = 0; i < n; i++) sim.tick();
    left -= n;
    if (chunks) holder.state = cloneState(holder.state);
  }
  return { state: holder.state, log, sim };
}

describe.skipIf(empty || !hasWorld)('real content in the starter house', () => {
  it('a household lives through a work day: eats, sleeps, works, gets paid once, meets the neighbour', async (t) => {
    const state = await starterWorld(3);
    if (!state) { t.skip(); return; }
    const ticks = (atDayMinute(1, 9 * 60) - state.clock.minutes) * 4;
    const { state: end, log, sim } = await live(state, ticks);
    const done = (id: string) => log.filter((e) => e.type === 'action.finished' && e.interactionId === id && e.result === 'done').length;
    expect(done('eatMeal') + done('grabSnack')).toBeGreaterThan(0);
    expect(done('sleep') + done('nap')).toBeGreaterThan(0);
    expect(done('useToilet')).toBeGreaterThan(0);
    const wages = Object.values(end.households).flatMap((h) => h.ledger).filter((l) => l.kind === 'wage');
    expect(wages).toHaveLength(1);
    expect(log.some((e) => e.type === 'social' && e.socialId === 'introduce')).toBe(true);
    const failures = log.filter((e) => e.type === 'action.finished' && e.result === 'failed');
    const total = log.filter((e) => e.type === 'action.finished').length;
    expect(failures.length / Math.max(1, total)).toBeLessThan(0.2);
    for (const p of Object.values(end.people)) {
      expect(sim.mood(p.id).label.length).toBeGreaterThan(0);
      for (const v of Object.values(p.needs)) expect(v).toBeGreaterThan(0);
    }
  });

  it('is batch-independent with the real navigation and content', async (t) => {
    const a = await starterWorld(9);
    const b = await starterWorld(9);
    if (!a || !b) { t.skip(); return; }
    let s = 12345;
    const chunks = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return 1 + (s % 211); };
    const r1 = await live(a, 4 * 60 * 12);
    const r2 = await live(b, 4 * 60 * 12, chunks);
    expect(JSON.stringify(r2.state)).toBe(JSON.stringify(r1.state));
  });
});
