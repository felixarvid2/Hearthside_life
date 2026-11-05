// Milestone 12 pool navigation: water is never walkable, the deck around a pool stays reachable from the street,
// ladders only link a deck tile to water (they are not nav edges), and the whole pool rim can be walked.

import { describe, expect, it } from 'vitest';
import { buildPool } from '../../../src/building/poolCommands';
import { UndoStack, type CommandContext } from '../../../src/core/commands';
import { EventBus } from '../../../src/core/events';
import { levelSeeds } from '../../../src/world/levels';
import { buildNavGrid, canStepGrid, findPathGrid, isFree, occupantAt, reachableMask } from '../../../src/world/navgrid';
import { ladderDeckTile, ladderWaterTile, poolContains, poolsOf, poolTiles } from '../../../src/world/pools';
import { fixtureContent, testWorld } from './fixtures';

const RECT = { x0: 6, z0: 6, x1: 9, z1: 7 };

function poolWorld() {
  const content = fixtureContent();
  const w = testWorld();
  const events = new EventBus();
  const ctx: CommandContext = { state: w.state, content, events };
  const r = new UndoStack().run(ctx, buildPool(w.lot.id, w.hh.id, RECT, 'azure-mosaic'));
  expect(r.ok).toBe(true);
  const pool = poolsOf(w.lot)[0]!;
  const grid = buildNavGrid(w.lot, content, 0);
  const entry = levelSeeds(w.lot, content, 0)[0]!;
  const mask = reachableMask(grid, entry);
  return { ...w, content, pool, grid, entry, mask };
}

describe('pool navigation', () => {
  it('blocks every water tile and leaves the deck free', () => {
    const { pool, grid } = poolWorld();
    const tiles = poolTiles(pool);
    expect(tiles).toHaveLength(8);
    for (const t of tiles) {
      expect(isFree(grid, t.x, t.z), `${t.x},${t.z}`).toBe(false);
      expect(occupantAt(grid, t.x, t.z)).toBe(`pool:${pool.id}`);
    }
    for (let x = RECT.x0 - 1; x <= RECT.x1 + 1; x++) {
      for (let z = RECT.z0 - 1; z <= RECT.z1 + 1; z++) {
        if (poolContains(pool, x, z)) continue;
        expect(isFree(grid, x, z), `${x},${z}`).toBe(true);
      }
    }
  });

  it('keeps the deck around the pool reachable from the lot entry', () => {
    const { grid, pool, mask, entry } = poolWorld();
    expect(mask[entry.z * grid.width + entry.x]).toBe(1);
    for (let x = RECT.x0 - 1; x <= RECT.x1 + 1; x++) {
      for (let z = RECT.z0 - 1; z <= RECT.z1 + 1; z++) {
        if (poolContains(pool, x, z)) continue;
        expect(mask[z * grid.width + x], `deck ${x},${z}`).toBe(1);
      }
    }
    for (const t of poolTiles(pool)) expect(mask[t.z * grid.width + t.x]).toBe(0);
  });

  it('cannot walk into the water and cannot path to a water tile', () => {
    const { grid, pool, entry } = poolWorld();
    for (const t of poolTiles(pool)) {
      for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        const from = { x: t.x + dx, z: t.z + dz };
        if (from.x < 0 || from.z < 0 || from.x >= grid.width || from.z >= grid.depth) continue;
        if (poolContains(pool, from.x, from.z)) continue;
        expect(canStepGrid(grid, from, t), `${from.x},${from.z} -> ${t.x},${t.z}`).toBe(false);
      }
    }
    expect(findPathGrid(grid, entry, [{ x: pool.x0, z: pool.z0 }])).toBeNull();
    expect(findPathGrid(grid, entry, poolTiles(pool))).toBeNull();
  });

  it('routes from the entry to the far side of the pool without crossing water', () => {
    const { grid, pool, entry } = poolWorld();
    const goal = { x: 7, z: 4 };
    const path = findPathGrid(grid, entry, [goal]);
    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual(goal);
    for (const t of path!) expect(poolContains(pool, t.x, t.z)).toBe(false);
  });

  it('links each ladder to a free, reachable deck tile and a water tile', () => {
    const { grid, pool, mask } = poolWorld();
    expect(pool.ladders.length).toBeGreaterThan(0);
    for (const ladder of pool.ladders) {
      const deck = ladderDeckTile(ladder);
      const water = ladderWaterTile(ladder);
      expect(isFree(grid, deck.x, deck.z), `deck ${deck.x},${deck.z}`).toBe(true);
      expect(mask[deck.z * grid.width + deck.x]).toBe(1);
      expect(poolContains(pool, water.x, water.z)).toBe(true);
      expect(isFree(grid, water.x, water.z)).toBe(false);
    }
  });
});
