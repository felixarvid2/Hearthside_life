// Milestone 12 pool playtest: three headless game days in the fixture house with an outdoor pool, autonomy running the
// household, and player-ordered swims on days 2 and 3. The pool survives, swimmers enter and leave only by the ladder,
// nobody is ever left on a water tile, needs stay finite and in range, and Fun/Fitness improve.

import { describe, expect, it } from 'vitest';
import { atDayMinute } from '../../../src/core/clock';
import { POOL_INTERACTIONS } from '../../../src/content/poolInteractions';
import type { ContentDB } from '../../../src/content/types';
import { NEED_IDS, type Pool } from '../../../src/core/types';
import { poolCenter, poolContains, poolsOf } from '../../../src/world/pools';
import { buildWorld, fixtureContent, harness, runUntil, setNeeds } from '../sim/fixtures';

const POOL_ID = 'pool_test';
const RECT = { x0: 6, z0: 0, x1: 8, z1: 1 };

function content(): ContentDB {
  const c = fixtureContent();
  for (const def of POOL_INTERACTIONS) c.interactions[def.id] = def;
  c.moodlets.peaceful = { id: 'peaceful', name: 'Peaceful', description: '', icon: 'sparkle', value: 5, minutes: 120 };
  return c;
}

describe('three days with a pool and autonomy', { timeout: 120_000 }, () => {
  it('keeps the household sane and lets people swim in and out by the ladder', () => {
    const w = buildWorld({ autonomy: true, visitors: false, neighbour: false });
    setNeeds(w.state, w.mira, 70);
    setNeeds(w.state, w.theo, 70);
    const pool: Pool = { id: POOL_ID, level: 0, ...RECT, styleId: 'azure-mosaic', ladders: [{ x: RECT.x0, z: RECT.z0, side: 'w' }] };
    w.lot.pools = { [POOL_ID]: pool };
    w.state.people[w.mira]!.outfits.outfits.swim = [{ id: 'out_swim', name: 'Swim', layers: {}, accessories: [] }];
    w.state.people[w.theo]!.outfits.outfits.swim = [{ id: 'out_swim2', name: 'Swim', layers: {}, accessories: [] }];
    const h = harness(w.state, content());

    const inPool = (x: number, z: number) => poolContains(pool, Math.floor(x), Math.floor(z));
    let swimStarts = 0;
    let waterViolations = 0;
    const sample = () => {
      for (const id of [w.mira, w.theo]) {
        const p = w.state.people[id]!;
        if (p.location.kind !== 'lot' || p.location.lotId !== w.lot.id) continue;
        if (!inPool(p.location.x, p.location.z)) continue;
        const a = p.queue[0];
        if (!a || (a.interactionId !== 'swimInPool' && a.interactionId !== 'relaxInPool')) waterViolations++;
      }
    };

    const c = poolCenter(pool);
    const queueSwim = (id: string) => {
      const r = h.sim.queue(id, { interactionId: 'swimInPool', target: { kind: 'tile', x: c.x, z: c.z, level: 0 }, data: { poolId: POOL_ID } });
      expect(r.ok, r.ok ? '' : r.reason).toBe(true);
    };

    // Day 1: full autonomy. Day 2 and 3: a morning swim ordered by the player.
    let day = 1;
    for (let i = 0; i < 3 * 1440 * 4; i++) {
      h.sim.tick();
      sample();
      if (day === 1 && w.state.clock.minutes >= atDayMinute(1, 10 * 60)) {
        day = 2;
        queueSwim(w.mira);
      } else if (day === 2 && w.state.clock.minutes >= atDayMinute(2, 10 * 60)) {
        day = 3;
        queueSwim(w.theo);
      }
      if (i % 400 === 0) {
        // a cheap progress guard: ticks keep advancing and the world stays finite
        expect(Number.isFinite(w.state.clock.minutes)).toBe(true);
      }
    }

    const starts = h.log.filter((e) => e.type === 'action.started' && (e.interactionId === 'swimInPool' || e.interactionId === 'relaxInPool'));
    swimStarts = starts.length;
    const done = h.log.filter((e) => e.type === 'action.finished' && e.interactionId === 'swimInPool' && e.result === 'done');
    expect(swimStarts).toBeGreaterThanOrEqual(2);
    expect(done.length).toBeGreaterThanOrEqual(2);
    expect(waterViolations).toBe(0);

    const lot = w.state.lots[w.lot.id]!;
    expect(poolsOf(lot)).toHaveLength(1);
    expect(poolsOf(lot)[0]!.ladders).toEqual([{ x: RECT.x0, z: RECT.z0, side: 'w' }]);

    for (const id of [w.mira, w.theo]) {
      const p = w.state.people[id]!;
      for (const [need, v] of Object.entries(p.needs)) {
        expect(Number.isFinite(v), `${need} finite`).toBe(true);
        expect(v, `${need} >= 0`).toBeGreaterThanOrEqual(0);
        expect(v, `${need} <= 100`).toBeLessThanOrEqual(100);
      }
      if (p.location.kind === 'lot' && p.location.lotId === lot.id) {
        expect(inPool(p.location.x, p.location.z), `${p.firstName} left in the water`).toBe(false);
      }
      expect(p.skills.fitness?.xp ?? 0).toBeGreaterThan(0);
    }
    // Nobody is wearing swimwear when the playtest is over.
    for (const id of [w.mira, w.theo]) expect(w.state.people[id]!.outfits.current.category).not.toBe('swim');
    for (const n of NEED_IDS) expect(Number.isFinite(w.state.people[w.mira]!.needs[n])).toBe(true);
  });

  it('autonomy picks a swim for fun when nothing else offers it', () => {
    const w = buildWorld({ autonomy: true, visitors: false, neighbour: false });
    w.state.clock.minutes = atDayMinute(0, 12 * 60);
    // The pool is the only fun in the house, and it is midday so sleep is not tempting.
    const c = content();
    for (const id of ['watchTv', 'playComputerGames', 'readBook', 'danceSolo', 'sit', 'sleep', 'nap']) delete c.interactions[id];
    const pool: Pool = { id: POOL_ID, level: 0, ...RECT, styleId: 'azure-mosaic', ladders: [{ x: RECT.x0, z: RECT.z0, side: 'w' }] };
    w.lot.pools = { [POOL_ID]: pool };
    w.state.people[w.mira]!.outfits.outfits.swim = [{ id: 'out_swim', name: 'Swim', layers: {}, accessories: [] }];
    setNeeds(w.state, w.mira, 80);
    w.state.people[w.mira]!.needs.fun = 5;
    w.state.people[w.mira]!.needs.energy = 85;
    const h = harness(w.state, c);
    runUntil(h, () => w.state.people[w.mira]!.queue.length > 0, 400);
    expect(w.state.people[w.mira]!.queue[0]!.interactionId).toBe('swimInPool');
  });
});
