// Milestone 12 swimming lifecycle: route to a ladder, change into swimwear, climb in, swim laps or float, climb out at
// a ladder and change back. Cancelling (or Get Out) mid-swim always exits through a ladder; nobody is ever left on a
// water tile. Children and up may swim, babies/toddlers may not, outdoor pools close in the snow.

import { describe, expect, it } from 'vitest';
import { dayIndex } from '../../../src/core/clock';
import type { GameEvent } from '../../../src/core/events';
import { POOL_INTERACTIONS } from '../../../src/content/poolInteractions';
import type { ContentDB } from '../../../src/content/types';
import type { LifeStage, Outfit, Pool, WorldState } from '../../../src/core/types';
import { poolCenter, poolContains, poolsOf } from '../../../src/world/pools';
import { buildWorld, fixtureContent, harness, head, runTicks, runUntil, setNeeds } from './fixtures';
import type { Harness } from './fixtures';

const POOL_ID = 'pool_test';
const RECT = { x0: 6, z0: 6, x1: 9, z1: 7 };

function poolContent(): ContentDB {
  const c = fixtureContent();
  for (const def of POOL_INTERACTIONS) c.interactions[def.id] = def;
  c.moodlets.peaceful = { id: 'peaceful', name: 'Peaceful', description: '', icon: 'sparkle', value: 5, minutes: 120 };
  return c;
}

function swimOutfit(): Outfit {
  return { id: 'out_swim', name: 'Swim', layers: {}, accessories: [] };
}

interface PoolWorld {
  h: Harness;
  content: ContentDB;
  state: WorldState;
  pool: Pool;
  lotId: string;
  mira: string;
  theo: string;
}

/** The quiet fixture house with an outdoor 4 x 2 pool and a swim outfit for Mira. */
function poolWorld(o: { miraStage?: LifeStage; theoStage?: LifeStage } = {}): PoolWorld {
  const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
  setNeeds(w.state, w.mira, 70);
  setNeeds(w.state, w.theo, 70);
  const pool: Pool = {
    id: POOL_ID, level: 0, ...RECT, styleId: 'azure-mosaic',
    ladders: [{ x: RECT.x0, z: RECT.z0, side: 'w' }],
  };
  w.lot.pools = { [POOL_ID]: pool };
  w.state.people[w.mira]!.outfits.outfits.swim = [swimOutfit()];
  w.state.people[w.mira]!.lifeStage = o.miraStage ?? 'adult';
  w.state.people[w.theo]!.lifeStage = o.theoStage ?? 'adult';
  const content = poolContent();
  const h = harness(w.state, content);
  return { h, content, state: w.state, pool, lotId: w.lot.id, mira: w.mira, theo: w.theo };
}

function startSwim(w: PoolWorld, id = w.mira, interactionId = 'swimInPool'): string {
  const c = poolCenter(w.pool);
  const r = w.h.sim.queue(id, { interactionId, target: { kind: 'tile', x: c.x, z: c.z, level: 0 }, data: { poolId: POOL_ID } });
  if (!r.ok) throw new Error(r.reason);
  return r.actionId;
}

function locOf(w: PoolWorld, id = w.mira) {
  const loc = w.state.people[id]!.location;
  if (loc.kind !== 'lot') throw new Error('not on the lot');
  return loc;
}

function inWater(w: PoolWorld, id = w.mira): boolean {
  const loc = locOf(w, id);
  return poolContains(w.pool, Math.floor(loc.x), Math.floor(loc.z));
}

function finished(w: PoolWorld, id = w.mira): Array<Extract<GameEvent, { type: 'action.finished' }>> {
  return w.h.log.filter((e): e is Extract<GameEvent, { type: 'action.finished' }> => e.type === 'action.finished' && e.personId === id);
}

describe('swimming lifecycle', () => {
  it('swims laps, then climbs out at the ladder and restores the outfit', () => {
    const w = poolWorld();
    const p = w.state.people[w.mira]!;
    expect(p.outfits.current.category).toBe('everyday');
    startSwim(w);
    runUntil(w.h, () => head(w.h, w.mira)?.phase === 'perform' && head(w.h, w.mira)?.data.stage === 'swim', 600);

    // In the water, in swimwear, swimming
    expect(inWater(w)).toBe(true);
    expect(p.anim.id).toBe('swim');
    expect(p.outfits.current.category).toBe('swim');
    const funBefore = p.needs.fun;
    const hygieneBefore = p.needs.hygiene;
    runTicks(w.h, 40);
    expect(p.needs.fun).toBeGreaterThan(funBefore);
    expect(p.needs.hygiene).toBeGreaterThanOrEqual(hygieneBefore);

    // Get Out asks the running swim to climb out gracefully.
    const r = w.h.sim.queue(w.mira, { interactionId: 'getOutOfPool', target: { kind: 'self' } });
    expect(r.ok).toBe(true);
    runUntil(w.h, () => head(w.h, w.mira) === undefined, 120);

    expect(inWater(w)).toBe(false);
    expect(poolContains(w.pool, Math.floor(locOf(w).x), Math.floor(locOf(w).z))).toBe(false);
    expect(locOf(w).posture).toBe('standing');
    expect(p.outfits.current.category).toBe('everyday');
    expect(p.anim.id).toBe('idle');
    const end = finished(w).at(-1)!;
    expect(end.interactionId).toBe('swimInPool');
    expect(end.result).toBe('cancelled');
    expect(p.needs.fun).toBeGreaterThan(funBefore);
  });

  it('completes a full swim and gives fun and Fitness xp', () => {
    const w = poolWorld();
    const p = w.state.people[w.mira]!;
    const funBefore = p.needs.fun;
    startSwim(w);
    runUntil(w.h, () => head(w.h, w.mira) === undefined, 900);
    const end = finished(w).at(-1)!;
    expect(end.interactionId).toBe('swimInPool');
    expect(end.result).toBe('done');
    expect(inWater(w)).toBe(false);
    expect(p.outfits.current.category).toBe('everyday');
    expect(p.needs.fun).toBeGreaterThan(funBefore);
    expect(p.skills.fitness?.xp ?? 0).toBeGreaterThan(0);
  });

  it('cancels mid-swim safely: the person always climbs out through a ladder', () => {
    const w = poolWorld();
    const id = startSwim(w);
    runUntil(w.h, () => head(w.h, w.mira)?.phase === 'perform' && head(w.h, w.mira)?.data.stage === 'swim', 600);
    runTicks(w.h, 40);
    expect(inWater(w)).toBe(true);
    w.h.sim.cancel(w.mira, id);
    runUntil(w.h, () => head(w.h, w.mira) === undefined, 120);
    expect(finished(w).at(-1)!.result).toBe('cancelled');
    expect(inWater(w)).toBe(false);
    expect(locOf(w).posture).toBe('standing');
    expect(w.state.people[w.mira]!.outfits.current.category).toBe('everyday');
  });

  it('cancelling before entering never leaves anyone in the water', () => {
    const w = poolWorld();
    const id = startSwim(w);
    runTicks(w.h, 2);
    w.h.sim.cancel(w.mira, id);
    runUntil(w.h, () => head(w.h, w.mira) === undefined, 60);
    expect(finished(w).at(-1)!.result).toBe('cancelled');
    expect(inWater(w)).toBe(false);
    expect(w.state.people[w.mira]!.location.kind).toBe('lot');
  });

  it('relaxing in the pool floats in place and ends on the deck', () => {
    const w = poolWorld();
    startSwim(w, w.mira, 'relaxInPool');
    runUntil(w.h, () => head(w.h, w.mira)?.phase === 'perform' && head(w.h, w.mira)?.data.stage === 'swim', 600);
    const loc = locOf(w);
    const x = loc.x, z = loc.z;
    runTicks(w.h, 20);
    expect(locOf(w).x).toBeCloseTo(x, 5);
    expect(locOf(w).z).toBeCloseTo(z, 5);
    expect(w.state.people[w.mira]!.anim.id).toBe('float');
    w.h.sim.queue(w.mira, { interactionId: 'getOutOfPool', target: { kind: 'self' } });
    runUntil(w.h, () => head(w.h, w.mira) === undefined, 120);
    expect(inWater(w)).toBe(false);
  });

  it('gates by life stage: children swim, toddlers and babies do not', () => {
    const w = poolWorld({ theoStage: 'child' });
    const c = poolCenter(w.pool);
    const child = w.h.sim.queue(w.theo, { interactionId: 'swimInPool', target: { kind: 'tile', x: c.x, z: c.z, level: 0 } });
    expect(child.ok).toBe(true);
    w.h.sim.cancel(w.theo, (child as { actionId: string }).actionId);

    for (const stage of ['toddler', 'baby'] as const) {
      w.state.people[w.theo]!.lifeStage = stage;
      const r = w.h.sim.queue(w.theo, { interactionId: 'swimInPool', target: { kind: 'tile', x: c.x, z: c.z, level: 0 } });
      expect(r.ok).toBe(false);
      expect(!r.ok && r.reason).toMatch(/too little|needs looking after/);
    }
  });

  it('keeps outdoor pools closed in the snow but a roofed pool stays open', () => {
    const w = poolWorld();
    const now = w.state.clock.minutes;
    w.state.weather = { current: 'snow', today: ['snow', 'snow'], tomorrow: ['snow', 'snow'], day: dayIndex(now), since: 0, snowCover: true };
    const c = poolCenter(w.pool);
    const refused = w.h.sim.queue(w.mira, { interactionId: 'swimInPool', target: { kind: 'tile', x: c.x, z: c.z, level: 0 }, data: { poolId: POOL_ID } });
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toBe('It is snowing.');
    expect(inWater(w)).toBe(false);

    // A roof over the pool makes it indoors, so swimming is on again even in the snow.
    w.h.holder.state.lots[w.lotId]!.roofs = {
      roof_1: {
        id: 'roof_1', level: 0, x0: RECT.x0, z0: RECT.z0, x1: RECT.x1 + 1, z1: RECT.z1 + 1,
        styleId: 'flat', ridge: 'h', pitch: 0, finish: { designId: 'plain-paint', paletteId: 'plain-paint-p0' },
      },
    };
    expect(w.h.sim.queue(w.mira, { interactionId: 'swimInPool', target: { kind: 'tile', x: c.x, z: c.z, level: 0 }, data: { poolId: POOL_ID } }).ok).toBe(true);
    w.h.sim.cancel(w.mira, head(w.h, w.mira)!.id);
    runTicks(w.h, 1);
    expect(inWater(w)).toBe(false);
  });

  it('leaves nobody on a water tile after every kind of ending', () => {
    for (const mode of ['done', 'getOut', 'cancel'] as const) {
      const w = poolWorld();
      const id = startSwim(w);
      runUntil(w.h, () => head(w.h, w.mira)?.phase === 'perform', 600);
      if (mode === 'done') runUntil(w.h, () => head(w.h, w.mira) === undefined, 900);
      else if (mode === 'getOut') {
        w.h.sim.queue(w.mira, { interactionId: 'getOutOfPool', target: { kind: 'self' } });
        runUntil(w.h, () => head(w.h, w.mira) === undefined, 120);
      } else {
        w.h.sim.cancel(w.mira, id);
        runUntil(w.h, () => head(w.h, w.mira) === undefined, 120);
      }
      for (const p of Object.values(w.state.people)) {
        if (p.location.kind !== 'lot' || p.location.lotId !== w.lotId) continue;
        expect(poolContains(w.pool, Math.floor(p.location.x), Math.floor(p.location.z)), `${mode}: ${p.firstName}`).toBe(false);
      }
      expect(poolsOf(w.h.holder.state.lots[w.lotId]!)).toHaveLength(1);
    }
  });
});
