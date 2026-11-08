// Milestone 13: toddlers cannot swim (a clear reason is shown) but may paddle at the dry deck beside the water while a
// grown-up is awake and close by. The water itself stays off limits.

import { describe, expect, it } from 'vitest';
import { POOL_INTERACTIONS } from '../../../src/content/poolInteractions';
import type { ContentDB } from '../../../src/content/types';
import type { Pool } from '../../../src/core/types';
import { nearestPoolEdgeTile, poolBesideTile, poolContains, poolsOf } from '../../../src/world/pools';
import { optionsFor } from '../../../src/sim/options';
import { buildWorld, fixtureContent, harness, lotLocation, pureCtx, runTicks, runUntil, setNeeds } from './fixtures';

const RECT = { x0: 6, z0: 6, x1: 9, z1: 7 };

function world(theoStage: 'toddler' | 'adult' = 'adult') {
  const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
  setNeeds(w.state, w.mira, 70);
  setNeeds(w.state, w.theo, 70);
  const pool: Pool = { id: 'pool_t', level: 0, ...RECT, styleId: 'azure-mosaic', ladders: [{ x: RECT.x0, z: RECT.z0, side: 'w' }] };
  w.lot.pools = { pool_t: pool };
  const content: ContentDB = fixtureContent();
  for (const def of POOL_INTERACTIONS) content.interactions[def.id] = def;
  content.moodlets.puddleSplash = { id: 'puddleSplash', name: 'Puddle Splash', description: '', icon: 'fun', value: 9, minutes: 120 };
  w.state.people[w.mira]!.lifeStage = 'toddler';
  w.state.people[w.theo]!.lifeStage = theoStage;
  return { ...w, pool, content, h: harness(w.state, content) };
}

const edge = { x: 7, z: 5 }; // the deck tile north of the water

describe('toddlers and the pool', () => {
  it('knows the dry deck beside the water', () => {
    const w = world();
    expect(poolBesideTile(w.lot, 0, edge.x, edge.z)).toBeTruthy();
    expect(poolBesideTile(w.lot, 0, 7, 6)).toBeUndefined(); // water
    expect(poolBesideTile(w.lot, 0, 2, 2)).toBeUndefined(); // far away
    expect(nearestPoolEdgeTile(w.lot, poolsOf(w.lot)[0]!, 7, 6)).toEqual({ x: 7, z: 5 });
    expect(poolContains(w.pool, 7, 5)).toBe(false);
  });

  it('explains why a toddler cannot swim and offers paddling at the nearest edge instead', () => {
    const w = world();
    const ctx = pureCtx(w.h);
    const opts = optionsFor(ctx, w.state.people[w.mira]!, { kind: 'tile', x: 7, z: 6, level: 0 });
    const swim = opts.find((o) => o.interactionId === 'swimInPool')!;
    expect(swim.enabled).toBe(false);
    expect(swim.reason).toMatch(/too little to swim.*paddle/i);
    const paddle = opts.find((o) => o.interactionId === 'paddleAtEdge')!;
    expect(paddle.enabled, paddle.reason).toBe(true);
    expect(paddle.target).toMatchObject({ kind: 'tile', x: 7, z: 5 });
    // nobody older sees the paddle entry
    const adultOpts = optionsFor(ctx, w.state.people[w.theo]!, { kind: 'tile', x: 7, z: 6, level: 0 });
    expect(adultOpts.some((o) => o.interactionId === 'paddleAtEdge')).toBe(false);
  });

  it('needs a grown-up close by, and only on the deck right beside the water', () => {
    const w = world('toddler'); // nobody old enough to watch
    const t = { kind: 'tile' as const, x: edge.x, z: edge.z, level: 0 };
    const none = w.h.sim.queue(w.mira, { interactionId: 'paddleAtEdge', target: t });
    expect(none.ok).toBe(false);
    expect(!none.ok && none.reason).toMatch(/grown-up/);
    w.state.people[w.theo]!.lifeStage = 'adult';
    const far = w.h.sim.queue(w.mira, { interactionId: 'paddleAtEdge', target: { kind: 'tile', x: 2, z: 2, level: 0 } });
    expect(far.ok).toBe(false);
    expect(!far.ok && far.reason).toMatch(/right beside the water/);
  });

  it('paddles on the deck, never in the water, and stops when the grown-up leaves', () => {
    const w = world();
    const r = w.h.sim.queue(w.mira, { interactionId: 'paddleAtEdge', target: { kind: 'tile', x: edge.x, z: edge.z, level: 0 } });
    expect(r.ok).toBe(true);
    const fun0 = w.state.people[w.mira]!.needs.fun;
    runTicks(w.h, 4 * 40);
    const loc = w.state.people[w.mira]!.location;
    if (loc.kind !== 'lot') throw new Error('off lot');
    expect(poolContains(w.pool, Math.floor(loc.x), Math.floor(loc.z))).toBe(false);
    expect(Math.floor(loc.x) === edge.x && Math.floor(loc.z) === edge.z).toBe(true);
    expect(w.state.people[w.mira]!.needs.fun).toBeGreaterThan(fun0);
    // the watcher walks away: the paddle stops at once
    w.state.people[w.theo]!.location = lotLocation(w.lot, 1, 14);
    runUntil(w.h, () => w.state.people[w.mira]!.queue.length === 0, 4 * 10);
    expect(w.state.people[w.mira]!.queue.length).toBe(0);
  });
});
