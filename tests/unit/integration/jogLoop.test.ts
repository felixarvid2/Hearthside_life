// social gaps pass: Go for a Jog follows the park's track in a loop (with the jog gait) instead of jogging on the spot.

import { describe, expect, it } from 'vitest';
import { content } from '../../../src/content/index';
import type { ContentDB } from '../../../src/content/types';
import { EventBus } from '../../../src/core/events';
import { addHousehold, createEmptyWorld } from '../../../src/core/state';
import type { Id, WorldState } from '../../../src/core/types';
import { NEED_IDS } from '../../../src/core/types';
import { DECIDE_KEY } from '../../../src/sim/autonomy';
import { applyHouseholdTies, createPerson } from '../../../src/sim/people';
import { Simulation } from '../../../src/sim/simulation';
import { createLot } from '../../../src/world/lots';
import { LotNav } from '../../../src/world/nav';
import { buildResidentialLot, buildVenueLot, parkTrack } from '../../../src/world/venues';
import { draft } from '../sim/fixtures';

const db: ContentDB = content();

function park(size = 32) {
  const state = createEmptyWorld(11, 'create');
  state.settings.visitors = false;
  state.clock.minutes = 24 * 60 + 12 * 60;
  const home = createLot(state, { name: 'Home', address: '1 Home Lane', width: 24, depth: 24, kind: 'residential', landValue: 100000, entry: { x: 12, z: 23, level: 0 } });
  buildResidentialLot(state, db, home.id, 0);
  const venue = createLot(state, { name: 'park', address: '1 Venue Road', width: size, depth: size, kind: 'venue', venueType: 'park', landValue: 100000, entry: { x: size / 2, z: size - 1, level: 0 } });
  buildVenueLot(state, db, venue.id, 'park');
  const hh = addHousehold(state, 'Visitors', 100_000, home.id, true);
  home.ownerHouseholdId = hh.id;
  state.activeHouseholdId = hh.id;
  state.activeLotId = venue.id;
  const alex = createPerson(state, db, draft(state, 'Alex'), hh.id, { kind: 'lot', lotId: venue.id, level: 0, x: venue.entry.x + 0.5, z: venue.entry.z + 0.5, facing: Math.PI, posture: 'standing' });
  applyHouseholdTies(state, [alex.id], []);
  alex.cooldowns[DECIDE_KEY] = 1e9;
  for (const n of NEED_IDS) alex.needs[n] = 80;
  const events = new EventBus();
  const sim = new Simulation({ getState: () => state, content: db, nav: new LotNav(() => state, db, events), events });
  const finished: Array<{ actionId: Id; result: string }> = [];
  events.on('action.finished', (e) => finished.push({ actionId: e.actionId, result: e.result }));
  return { state, sim, venue, alex, finished };
}

describe('the park track', () => {
  it('has four corners that are free to walk on in the real park layout', () => {
    const { venue } = park();
    const track = parkTrack(venue)!;
    expect(track).toHaveLength(4);
    const nav = new LotNav(() => ({ lots: { [venue.id]: venue } }) as unknown as WorldState, db);
    for (const t of track) expect(nav.isWalkable(venue.id, 0, t.x, t.z), `${t.x},${t.z}`).toBe(true);
    expect(parkTrack({ ...venue, venueType: 'cafe' })).toBeNull();
    expect(parkTrack({ ...venue, width: 24 })).toBeNull();
    // a bigger lot centres the plan: the corners move with it
    const big = parkTrack({ ...venue, width: 40, depth: 36 })!;
    expect(big[0]).toEqual({ x: 3 + 4, z: 3 + 2 });
  });
});

describe('Go for a Jog', () => {
  it('runs round the track: visits all four corners in order with the jog gait, then ends with the usual rewards', () => {
    const s = park();
    const q = s.sim.queue(s.alex.id, { interactionId: 'goForJog', target: { kind: 'self' } });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    const track = parkTrack(s.venue)!;
    const visited: number[] = [];
    let minX = 99, maxX = 0, minZ = 99, maxZ = 0, jogTicks = 0, moving = 0, ticks = 0;
    const start = s.state.clock.minutes;
    const energy = s.alex.needs.energy, fun = s.alex.needs.fun;
    for (; ticks < 4000 && !s.finished.some((f) => f.actionId === q.actionId); ticks++) {
      s.sim.tick();
      const loc = s.alex.location;
      if (loc.kind !== 'lot') continue;
      minX = Math.min(minX, loc.x); maxX = Math.max(maxX, loc.x); minZ = Math.min(minZ, loc.z); maxZ = Math.max(maxZ, loc.z);
      if (s.alex.anim.id === 'jog') jogTicks++;
      if (loc.posture === 'walking') moving++;
      track.forEach((t, i) => { if (Math.hypot(loc.x - (t.x + 0.5), loc.z - (t.z + 0.5)) < 0.3 && visited[visited.length - 1] !== i) visited.push(i); });
    }
    expect(s.finished.find((f) => f.actionId === q.actionId)?.result).toBe('done');
    // it covers the loop, not one spot
    expect(maxX - minX).toBeGreaterThan(20);
    expect(maxZ - minZ).toBeGreaterThan(20);
    expect(new Set(visited).size).toBe(4);
    for (let i = 1; i < visited.length; i++) expect(visited[i]).toBe((visited[i - 1]! + 1) % 4);
    expect(jogTicks).toBeGreaterThan(moving * 0.9); // jogging, not walking
    // about the length of a jog, and the same kinds of reward as before
    const minutes = s.state.clock.minutes - start;
    expect(minutes).toBeGreaterThanOrEqual(40);
    expect(minutes).toBeLessThan(75);
    expect(s.alex.needs.energy).toBeLessThan(energy - 2);
    expect(s.alex.needs.fun).toBeGreaterThan(fun);
    expect(s.alex.skills.fitness?.xp ?? 0).toBeGreaterThan(20);
    expect(s.alex.moodlets.some((m) => m.id === 'energized')).toBe(true);
    expect(s.alex.queue).toHaveLength(0);
  });

  it('can be cancelled mid-lap, and a person with no energy left stops at the next corner', () => {
    const s = park();
    const q = s.sim.queue(s.alex.id, { interactionId: 'goForJog', target: { kind: 'self' } });
    if (!q.ok) throw new Error(q.reason);
    for (let i = 0; i < 80; i++) s.sim.tick();
    s.sim.cancel(s.alex.id, q.actionId);
    for (let i = 0; i < 40; i++) s.sim.tick();
    expect(s.finished.find((f) => f.actionId === q.actionId)?.result).toBe('cancelled');
    expect(s.alex.queue).toHaveLength(0);
    const tired = park();
    tired.alex.needs.energy = 12;
    const q2 = tired.sim.queue(tired.alex.id, { interactionId: 'goForJog', target: { kind: 'self' } });
    if (!q2.ok) throw new Error(q2.reason);
    for (let i = 0; i < 3000 && !tired.finished.some((f) => f.actionId === q2.actionId); i++) tired.sim.tick();
    expect(tired.finished.find((f) => f.actionId === q2.actionId)?.result).toBe('done');
    expect(tired.state.clock.minutes - (24 * 60 + 12 * 60)).toBeLessThan(40);
  });

  it('on a park without the track layout the person jogs on the spot as before', () => {
    const s = park();
    s.venue.venueType = 'park';
    s.venue.width = 24; s.venue.depth = 24; // too small for a track: no loop
    const q = s.sim.queue(s.alex.id, { interactionId: 'goForJog', target: { kind: 'self' } });
    if (!q.ok) throw new Error(q.reason);
    const loc0 = { ...(s.alex.location as { x: number; z: number }) };
    for (let i = 0; i < 4000 && !s.finished.some((f) => f.actionId === q.actionId); i++) s.sim.tick();
    expect(s.finished.find((f) => f.actionId === q.actionId)?.result).toBe('done');
    const loc = s.alex.location as { x: number; z: number };
    expect(Math.hypot(loc.x - loc0.x, loc.z - loc0.z)).toBeLessThan(2);
  });
});

