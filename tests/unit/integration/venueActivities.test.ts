// Milestone 7 venue activities in the simulation: a person standing at a venue (a patron, whose home is elsewhere) can use every
// activity the venue offers, headless, through the real content, real navigation and the real simulation. Money is exact (one
// transaction per purchase, with the action's occurrence id), skills train, moodlets arrive and needs change. Autonomy picks
// sensible things at a venue and never spends money it does not have.

import { describe, expect, it } from 'vitest';
import { content } from '../../../src/content/index';
import type { ContentDB } from '../../../src/content/types';
import { EventBus } from '../../../src/core/events';
import { Rng } from '../../../src/core/rng';
import { addHousehold, createEmptyWorld } from '../../../src/core/state';
import type { Id, Lot, Person, PlacedObject, WorldState } from '../../../src/core/types';
import { NEED_IDS } from '../../../src/core/types';
import { DECIDE_KEY } from '../../../src/sim/autonomy';
import type { SimCtx } from '../../../src/sim/context';
import { recipeCost } from '../../../src/sim/cooking';
import { applyHouseholdTies, createPerson } from '../../../src/sim/people';
import { Reservations } from '../../../src/sim/reservations';
import { Simulation } from '../../../src/sim/simulation';
import { socialAcceptance } from '../../../src/sim/social';
import { createLot } from '../../../src/world/lots';
import { LotNav } from '../../../src/world/nav';
import { buildResidentialLot, buildVenueLot, type VenueType } from '../../../src/world/venues';
import { draft } from '../sim/fixtures';

const db: ContentDB = content();
const SIZES: Record<VenueType, number> = { park: 32, cafe: 24, gym: 24, library: 24, arts: 32, market: 32 };
const TYPES = Object.keys(SIZES) as VenueType[];

interface Scenario {
  state: WorldState;
  sim: Simulation;
  venue: Lot;
  home: Lot;
  hhId: Id;
  alex: Person;
  events: EventBus;
  finished: Array<{ personId: Id; actionId: Id; interactionId: string; result: string; reason?: string }>;
}

/** A household living in a house on another lot, standing at the entry of a freshly built venue. Autonomy is held off per person. */
function scenario(type: VenueType, opts: { funds?: number; people?: number } = {}): Scenario {
  const state = createEmptyWorld(11, 'create');
  state.settings.visitors = false;
  state.clock.minutes = 24 * 60 + 12 * 60; // noon on day 2: every venue is open
  const home = createLot(state, { name: 'Home', address: '1 Home Lane', width: 24, depth: 24, kind: 'residential', landValue: 100000, entry: { x: 12, z: 23, level: 0 } });
  buildResidentialLot(state, db, home.id, 0);
  const size = SIZES[type];
  const venue = createLot(state, { name: type, address: '1 Venue Road', width: size, depth: size, kind: 'venue', venueType: type, landValue: 100000, entry: { x: size / 2, z: size - 1, level: 0 } });
  buildVenueLot(state, db, venue.id, type);
  const hh = addHousehold(state, 'Visitors', opts.funds ?? 100_000, home.id, true);
  home.ownerHouseholdId = hh.id;
  state.activeHouseholdId = hh.id;
  state.activeLotId = venue.id;
  const where = (dx: number) => ({ kind: 'lot' as const, lotId: venue.id, level: 0, x: venue.entry.x + 0.5 + dx, z: venue.entry.z + 0.5, facing: Math.PI, posture: 'standing' as const });
  const alex = createPerson(state, db, draft(state, 'Alex'), hh.id, where(0));
  if ((opts.people ?? 1) > 1) {
    const sam = createPerson(state, db, draft(state, 'Sam'), hh.id, where(-1));
    applyHouseholdTies(state, [alex.id, sam.id], [{ a: 0, b: 1, tie: 'roommate' }]);
  }
  for (const p of Object.values(state.people)) p.cooldowns[DECIDE_KEY] = 1e9; // no autonomy until a test asks for it
  const events = new EventBus();
  const nav = new LotNav(() => state, db, events);
  const sim = new Simulation({ getState: () => state, content: db, nav, events });
  const finished: Scenario['finished'] = [];
  events.on('action.finished', (e) => finished.push({ personId: e.personId, actionId: e.actionId, interactionId: e.interactionId, result: e.result, ...(e.reason ? { reason: e.reason } : {}) }));
  return { state, sim, venue, home, hhId: hh.id, alex, events, finished };
}

const funds = (s: Scenario) => s.state.households[s.hhId]!.funds;
const setNeeds = (p: Person, v: number) => { for (const n of NEED_IDS) p.needs[n] = v; };
const spent = (s: Scenario) => s.state.households[s.hhId]!.ledger.filter((l) => l.amount < 0);
const onObject = (id: Id) => ({ kind: 'object' as const, objectId: id, slotId: null });
const firstOf = (lot: Lot, defId: string): PlacedObject => Object.values(lot.objects).find((o) => o.defId === defId)!;

/** Runs ticks until the action finishes (or the budget runs out); returns the finish record. */
function run(s: Scenario, actionId: Id, maxTicks = 6000): Scenario['finished'][number] | undefined {
  for (let i = 0; i < maxTicks; i++) {
    const f = s.finished.find((x) => x.actionId === actionId);
    if (f) return f;
    s.sim.tick();
  }
  return s.finished.find((x) => x.actionId === actionId);
}

describe.each(TYPES)('activities at the %s', (type) => {
  const s = scenario(type);
  const pairs: Array<{ obj: PlacedObject; id: string }> = [];
  const seen = new Set<string>();
  for (const o of Object.values(s.venue.objects)) for (const id of db.objects[o.defId]!.interactions) {
    if (seen.has(`${o.defId}/${id}`)) continue;
    seen.add(`${o.defId}/${id}`);
    pairs.push({ obj: o, id });
  }

  it('offers activities, each backed by a ready interaction', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(6);
    for (const { id } of pairs) expect(db.interactions[id]?.status, id).toBe('ready');
  });

  it('lets a patron perform every interaction an object offers, paying exactly once for purchases', { timeout: 120_000 }, () => {
    let performed = 0;
    for (const { obj, id } of pairs) {
      const def = db.interactions[id]!;
      const label = `${type}: ${obj.defId}/${id}`;
      if (def.behavior === 'cook') continue; // needs a stove, which no venue has
      const p = s.alex;
      s.state.households[s.hhId]!.funds = 100_000;
      setNeeds(p, 40);
      p.moodlets = [];
      const before = { funds: funds(s), needs: { ...p.needs }, skill: def.skill ? { ...(p.skills[def.skill.id] ?? { level: 1, xp: 0 }) } : null, ledger: s.state.households[s.hhId]!.ledger.length };
      const data = id === 'readSkillBook' ? { skillId: 'cooking' } : undefined;
      const q = s.sim.queue(p.id, { interactionId: id, target: onObject(obj.id), ...(data ? { data } : {}) });
      // nobody naps in a public place, and some activities belong to other places (a picnic at the cafe, games on library computers)
      const notHere = def.behavior === 'rest' || def.behavior === 'sleep' || (def.venues !== undefined && !def.venues.includes(type));
      if (notHere) {
        expect(q.ok, label).toBe(false);
        expect(funds(s), label).toBe(before.funds);
        continue;
      }
      expect(q.ok, `${label} ${q.ok ? '' : q.reason}`).toBe(true);
      if (!q.ok) continue;
      const f = run(s, q.actionId);
      expect(f?.result, `${label} ${f?.reason ?? ''}`).toBe('done');
      performed++;
      // money: exactly the price, one ledger entry with the action's occurrence (freelance work pays one sale instead)
      const entries = s.state.households[s.hhId]!.ledger.slice(before.ledger);
      if (def.behavior === 'freelance') {
        expect(entries.filter((l) => l.kind === 'sale'), label).toHaveLength(1);
        expect(entries.filter((l) => l.amount < 0), label).toHaveLength(0);
      } else {
        expect(funds(s), label).toBe(before.funds - (def.cost ?? 0));
        if (def.cost) {
          expect(entries, label).toHaveLength(1);
          expect(entries[0]!.kind, label).toBe('groceries');
          expect(entries[0]!.amount, label).toBe(-def.cost);
          expect(entries[0]!.occurrence, label).toBe(`cost:${q.actionId}`);
          expect(s.state.processed[`money:cost:${q.actionId}`], label).toBeDefined();
        } else {
          expect(entries, label).toHaveLength(0);
        }
      }
      // effects
      if (def.moodletOnComplete) expect(p.moodlets.some((m) => m.id === def.moodletOnComplete), `${label} moodlet`).toBe(true);
      for (const [need, v] of Object.entries(def.needsOnComplete)) if (v! >= 5) expect(p.needs[need as keyof typeof p.needs], `${label} ${need}`).toBeGreaterThan(before.needs[need as keyof typeof p.needs]);
      if (def.skill && id !== 'readSkillBook') {
        const now = p.skills[def.skill.id];
        expect(now && (now.level > before.skill!.level || now.xp > before.skill!.xp), `${label} skill ${def.skill.id}`).toBe(true);
      }
      expect(p.queue, label).toHaveLength(0);
    }
    expect(performed).toBeGreaterThanOrEqual(6);
  });
});

describe('paying at a venue', () => {
  it('charges a coffee exactly once, even after many ticks, and a second order pays again', () => {
    const s = scenario('cafe');
    const counter = firstOf(s.venue, 'service-counter');
    const before = funds(s);
    const q = s.sim.queue(s.alex.id, { interactionId: 'buyCoffee', target: onObject(counter.id) });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(run(s, q.actionId)?.result).toBe('done');
    expect(funds(s)).toBe(before - 400);
    for (let i = 0; i < 400; i++) s.sim.tick();
    expect(funds(s)).toBe(before - 400);
    expect(spent(s)).toHaveLength(1);
    const q2 = s.sim.queue(s.alex.id, { interactionId: 'buyCoffee', target: onObject(counter.id) });
    expect(q2.ok).toBe(true);
    if (q2.ok) expect(run(s, q2.actionId)?.result).toBe('done');
    expect(funds(s)).toBe(before - 800);
    expect(new Set(spent(s).map((l) => l.occurrence)).size).toBe(2);
  });

  it('refuses a purchase the household cannot afford and charges nothing', () => {
    const s = scenario('cafe', { funds: 399 });
    const q = s.sim.queue(s.alex.id, { interactionId: 'buyCoffee', target: onObject(firstOf(s.venue, 'service-counter').id) });
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.reason).toMatch(/Not enough money/);
    expect(funds(s)).toBe(399);
    expect(spent(s)).toHaveLength(0);
  });

  it('a cancelled order that never started costs nothing', () => {
    const s = scenario('cafe');
    const q = s.sim.queue(s.alex.id, { interactionId: 'buyPastry', target: onObject(firstOf(s.venue, 'service-counter').id) });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    for (let i = 0; i < 4; i++) s.sim.tick(); // still walking to the counter
    s.sim.cancel(s.alex.id, q.actionId);
    for (let i = 0; i < 200; i++) s.sim.tick();
    expect(funds(s)).toBe(100_000);
    expect(s.finished.find((f) => f.actionId === q.actionId)?.result).toBe('cancelled');
  });

  it('groceries stock the pantry: the buyer pays $24 once and cooks for 40% less for three days', () => {
    const s = scenario('market');
    const recipe = Object.values(db.recipes).find((r) => r.status === 'ready')!;
    const full = recipeCost(s.alex, recipe);
    const q = s.sim.queue(s.alex.id, { interactionId: 'buyGroceries', target: onObject(firstOf(s.venue, 'produce-stand').id) });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(run(s, q.actionId)?.result).toBe('done');
    expect(funds(s)).toBe(100_000 - 2400);
    expect(recipeCost(s.alex, recipe)).toBe(Math.round(full * 0.6));
    const pantry = s.alex.moodlets.find((m) => m.id === 'stockedPantry')!;
    expect(pantry.until! - s.state.clock.minutes).toBeGreaterThan(2 * 24 * 60);
    s.alex.moodlets = [];
    expect(recipeCost(s.alex, recipe)).toBe(full);
  });
});

describe('who may do what where', () => {
  it('a jog is offered in the park only; picnics are for the park tables and naps are refused in public', () => {
    const park = scenario('park');
    const cafe = scenario('cafe');
    const jog = (s: Scenario) => s.sim.options(s.alex.id, { kind: 'self' }).find((o) => o.interactionId === 'goForJog');
    expect(jog(park)?.enabled).toBe(true);
    expect(jog(cafe)).toBeUndefined();
    expect(cafe.sim.queue(cafe.alex.id, { interactionId: 'goForJog', target: { kind: 'self' } }).ok).toBe(false);
    const ids = (s: Scenario, defId: string) => s.sim.options(s.alex.id, onObject(firstOf(s.venue, defId).id)).map((o) => o.interactionId);
    expect(ids(cafe, 'table-patio')).not.toContain('havePicnic');
    expect(park.sim.options(park.alex.id, onObject(firstOf(park.venue, 'table-patio').id)).find((o) => o.interactionId === 'havePicnic')?.enabled).toBe(true);
    expect(ids(scenario('library'), 'sofa-tweed')).toEqual(['sit']);
    const gym = scenario('gym');
    expect(gym.sim.options(gym.alex.id, onObject(firstOf(gym.venue, 'treadmill').id)).find((o) => o.interactionId === 'workOut')?.enabled).toBe(true);
  });

  it('the jog trains Fitness and ends with the energized moodlet', () => {
    const s = scenario('park');
    setNeeds(s.alex, 60);
    const q = s.sim.queue(s.alex.id, { interactionId: 'goForJog', target: { kind: 'self' } });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(run(s, q.actionId)?.result).toBe('done');
    expect(s.alex.skills.fitness?.xp ?? 0).toBeGreaterThan(30);
    expect(s.alex.moodlets.some((m) => m.id === 'energized')).toBe(true);
    expect(funds(s)).toBe(100_000);
  });

  it('loud jokes are less welcome in the library than in the cafe', () => {
    const lib = scenario('library', { people: 2 });
    const cafe = scenario('cafe', { people: 2 });
    const mk = (s: Scenario): SimCtx => ({
      state: s.state, content: db, nav: new LotNav(() => s.state, db), events: s.events, rng: new Rng(s.state.rng), res: new Reservations(), now: s.state.clock.minutes, counters: { routeRequests: 0 },
    });
    const [a, b] = Object.values(lib.state.people);
    const [c, d] = Object.values(cafe.state.people);
    const joke = db.socials.tellJoke!, chat = db.socials.chat!;
    const quiet = socialAcceptance(mk(lib), a!, b!, joke);
    const loud = socialAcceptance(mk(cafe), c!, d!, joke);
    expect(quiet).toBeLessThan(loud);
    expect(loud - quiet).toBeCloseTo(0.25, 5);
    expect(socialAcceptance(mk(lib), a!, b!, chat)).toBeCloseTo(socialAcceptance(mk(cafe), c!, d!, chat), 5);
  });
});

describe('autonomy at a venue', () => {
  it('a hungry patron with money buys food at the cafe, paying exactly the price', { timeout: 120_000 }, () => {
    const s = scenario('cafe');
    const p = s.alex;
    setNeeds(p, 70);
    p.needs.hunger = 8;
    p.cooldowns[DECIDE_KEY] = s.state.clock.minutes;
    for (let i = 0; i < 6000 && spent(s).length === 0; i++) s.sim.tick();
    const paid = spent(s);
    expect(paid.length).toBeGreaterThanOrEqual(1);
    const prices = new Set(['buyCoffee', 'buyPastry', 'buySandwich', 'grabSnack', 'makeCoffee', 'makeToast', 'blendSmoothie'].map((id) => db.interactions[id]!.cost));
    expect(prices.has(-paid[0]!.amount)).toBe(true);
    expect(100_000 - funds(s)).toBe(-paid.reduce((n, l) => n + l.amount, 0));
    // hours later the patron is no longer starving
    for (let i = 0; i < 4 * 60; i++) s.sim.tick();
    expect(p.needs.hunger).toBeGreaterThan(8);
  });

  it('a patron without money spends nothing and nobody gets stuck, in any venue', { timeout: 120_000 }, () => {
    for (const type of TYPES) {
      const s = scenario(type, { funds: 0 });
      setNeeds(s.alex, 30);
      s.alex.cooldowns[DECIDE_KEY] = s.state.clock.minutes;
      s.state.settings.unlimitedFunds = false;
      for (let i = 0; i < 4 * 60 * 3; i++) s.sim.tick();
      expect(funds(s), type).toBe(0);
      expect(spent(s), type).toHaveLength(0);
      const failures = s.finished.filter((f) => f.result === 'failed' && /reach|route|way|blocked|stuck/i.test(f.reason ?? ''));
      expect(failures, `${type}: ${failures.map((f) => f.reason).join('; ')}`).toHaveLength(0);
      expect(s.finished.filter((f) => f.result === 'done').length, type).toBeGreaterThanOrEqual(1);
    }
  });

  it('patrons use what each venue is for', { timeout: 240_000 }, () => {
    const expectation: Record<VenueType, string[]> = {
      park: ['sit', 'watchClouds', 'playChess', 'playOnSlide', 'swing', 'goForJog', 'havePicnic', 'grillFood', 'waterPlant', 'buyCoffee', 'buyPastry', 'buySandwich'],
      cafe: ['buyCoffee', 'buyPastry', 'buySandwich', 'sit', 'readBook', 'makeCoffee', 'listenToMusic'],
      gym: ['workOut', 'liftWeights', 'takeShower', 'useToilet', 'sit', 'buyVendingDrink', 'buyVendingSnack', 'listenToMusic'],
      library: ['readBook', 'studyHard', 'writeJournal', 'sit', 'practiceProgramming', 'readSkillBook', 'writeArticle', 'buyVendingDrink', 'buyVendingSnack'],
      arts: ['paintCanvas', 'playPiano', 'sit', 'buyVendingDrink', 'buyVendingSnack', 'readBook', 'listenToMusic'],
      market: ['buyProduce', 'buyCoffee', 'buyPastry', 'buySandwich', 'buyVendingSnack', 'grabSnack', 'sit'],
    };
    for (const type of TYPES) {
      const s = scenario(type, { funds: 200_000 });
      const p = s.alex;
      p.cooldowns[DECIDE_KEY] = s.state.clock.minutes;
      const done = new Set<string>();
      s.events.on('action.finished', (e) => { if (e.result === 'done') done.add(e.interactionId); });
      // keep needs moderately low so there is always something worth doing, for a game day and a half
      for (let i = 0; i < 4 * 60 * 36; i++) {
        if (i % 60 === 0) for (const n of NEED_IDS) p.needs[n] = Math.min(p.needs[n], 35);
        s.sim.tick();
      }
      const used = expectation[type].filter((id) => done.has(id));
      expect(used.length, `${type} used ${[...done].join(',')}`).toBeGreaterThanOrEqual(3);
      expect(done.has('nap') || done.has('sleep'), `${type}: nobody sleeps in a public place`).toBe(false);
    }
  });
});
