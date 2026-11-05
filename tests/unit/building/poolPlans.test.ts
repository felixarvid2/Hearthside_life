// Milestone 12 pools: plan rules (size, walls/objects/upper floors, overlap, ladders, people, reachability), prices and
// refunds, and the undoable build/erase/ladder commands.

import { describe, expect, it } from 'vitest';
import {
  addPoolLadder, buildPool, movePoolLadder, poolCommand, removePool, removePoolLadder,
} from '../../../src/building/poolCommands';
import { planPool, poolPrice, type PoolRequest, type PoolRect } from '../../../src/building/poolPlans';
import { UndoStack, type CommandContext } from '../../../src/core/commands';
import { MINUTES_PER_DAY } from '../../../src/core/clock';
import { EventBus, type GameEvent } from '../../../src/core/events';
import { edgeKey, tileKey } from '../../../src/core/ids';
import type { FinishRef, Person } from '../../../src/core/types';
import { ladderDeckTile, poolContains, poolsOf } from '../../../src/world/pools';
import { addRectWalls } from '../../../src/world/walls';
import { fixtureContent, putObject, testWorld } from '../world/fixtures';

const F: FinishRef = { designId: 'plain-paint', paletteId: 'plain-paint-p0' };
const FF = { a: F, b: F };
const STYLE = 'azure-mosaic';
/** A 4 x 2 m pool in open ground; its short sides are west/east. */
const RECT: PoolRect = { x0: 6, z0: 6, x1: 9, z1: 7 };
const OAK: FinishRef = { designId: 'oak-planks', paletteId: 'oak-planks-p0' };

function setup(o: { funds?: number } = {}) {
  const content = fixtureContent();
  const w = testWorld({ funds: o.funds });
  const events = new EventBus();
  const seen: GameEvent[] = [];
  events.onAny((e) => seen.push(e));
  const ctx: CommandContext = { state: w.state, content, events };
  const stack = new UndoStack();
  const run = (cmd: Parameters<UndoStack['run']>[1]) => stack.run(ctx, cmd);
  const plan = (req: PoolRequest) => planPool(w.state, content, w.lot.id, w.hh.id, req);
  const person = (id: string, name: string, x: number, z: number) => {
    w.state.people[id] = { id, firstName: name, lastName: 'T', location: { kind: 'lot', lotId: w.lot.id, level: 0, x, z, facing: 0, posture: 'standing' } } as unknown as Person;
  };
  return { ...w, content, events, seen, ctx, stack, run, plan, person };
}

const poolEvents = (seen: GameEvent[]) => seen.filter((e) => e.type === 'lot.changed' && e.what === 'pools');

describe('pool plan rules', () => {
  it('plans a 4 x 2 pool with an automatic ladder on a short side', () => {
    const { content, plan, lot } = setup();
    const p = plan({ kind: 'pool', rect: RECT, styleId: STYLE });
    expect(p.ok).toBe(true);
    expect(p.reasons).toEqual([]);
    expect(p.charge).toBe(poolPrice(STYLE, RECT, content));
    expect(p.charge).toBe(22 * 100 * 8); // $22 per water tile, 8 tiles
    expect(p.cost).toBe(p.charge);
    expect(p.counts).toEqual({ tiles: 8, ladders: 1, removed: 0, poolsRemoved: 0 });
    expect(p.highlight.tiles).toHaveLength(8);
    expect(p.measure.text).toBe('4 x 2 m (8 m2)');
    const after = p.diff.pools[0]!.after!;
    expect(after.ladders).toHaveLength(1);
    const ladder = after.ladders[0]!;
    // w > d: the short sides are west/east
    expect([after.x0, after.x1]).toContain(ladder.x);
    expect(ladder.z).toBeGreaterThanOrEqual(RECT.z0);
    expect(ladder.z).toBeLessThanOrEqual(RECT.z1);
    const deck = ladderDeckTile(ladder);
    expect(deck.x).toBeGreaterThanOrEqual(0);
    expect(deck.z).toBeGreaterThanOrEqual(0);
    expect(lot.width).toBeGreaterThan(deck.x);
    expect(lot.depth).toBeGreaterThan(deck.z);
  });

  it('enforces the minimum and maximum size and the lot bounds', () => {
    const { plan } = setup();
    expect(plan({ kind: 'pool', rect: { x0: 6, z0: 6, x1: 7, z1: 7 }, styleId: STYLE }).reasons).toEqual(['A pool is at least 2 x 3 m.']);
    expect(plan({ kind: 'pool', rect: { x0: 0, z0: 0, x1: 12, z1: 3 }, styleId: STYLE }).reasons).toEqual(['A pool is at most 12 x 12 m.']);
    expect(plan({ kind: 'pool', rect: { x0: 20, z0: 20, x1: 24, z1: 22 }, styleId: STYLE }).reasons).toEqual(['Pools have to stay on the lot.']);
    expect(plan({ kind: 'pool', rect: { x0: 20, z0: 20, x1: 22, z1: 21 }, styleId: STYLE }).ok).toBe(true);
  });

  it('rejects walls, objects, upper floors and people in the way', () => {
    const { plan, lot, state, content, person } = setup();
    addRectWalls(lot, 0, 6, 5, 10, 8, FF);
    expect(plan({ kind: 'pool', rect: RECT, styleId: STYLE }).reasons).toContain('A wall runs through the pool.');
    for (const k of Object.keys(lot.walls)) delete lot.walls[k];

    putObject(state, content, lot, 'counter-basic', 6, 7);
    expect(plan({ kind: 'pool', rect: RECT, styleId: STYLE }).reasons).toContain('Move the Counter Basic first.');
    for (const id of Object.keys(lot.objects)) delete lot.objects[id];

    lot.floors[tileKey(1, 7, 6)] = { ...OAK };
    expect(plan({ kind: 'pool', rect: RECT, styleId: STYLE }).reasons).toContain('There is a floor above: pools go outside or on the ground floor.');
    delete lot.floors[tileKey(1, 7, 6)];

    person('per_1', 'Ada', 7, 6);
    expect(plan({ kind: 'pool', rect: RECT, styleId: STYLE }).reasons).toContain('Ada is standing there.');
    delete state.people['per_1'];

    expect(plan({ kind: 'pool', rect: RECT, styleId: STYLE }).ok).toBe(true);
  });

  it('rejects a pool that overlaps another pool', () => {
    const { plan, run, lot, hh } = setup();
    expect(run(buildPool(lot.id, hh.id, RECT, STYLE)).ok).toBe(true);
    const p = plan({ kind: 'pool', rect: { x0: 8, z0: 7, x1: 11, z1: 8 }, styleId: STYLE });
    expect(p.ok).toBe(false);
    expect(p.reasons).toContain('It would overlap another pool.');
  });

  it('places the ladder where asked but only on an edge', () => {
    const { plan } = setup();
    const onLongSide = plan({ kind: 'pool', rect: RECT, styleId: STYLE, ladder: { x: 7, z: 6 } });
    expect(onLongSide.ok).toBe(true);
    expect(onLongSide.diff.pools[0]!.after!.ladders[0]).toEqual({ x: 7, z: 6, side: 'n' });

    const offEdge = plan({ kind: 'pool', rect: { x0: 6, z0: 6, x1: 10, z1: 8 }, styleId: STYLE, ladder: { x: 8, z: 7 } });
    expect(offEdge.reasons).toContain('A ladder has to sit on the edge of the pool.');
  });

  it('rejects a pool that would cut part of the lot off from the street', () => {
    const { plan, lot } = setup();
    // A wall across the lot at z = 16 with a single gap at x = 10..13; the pool plugging the gap strands the north.
    const wall = (x: number) => {
      const id = edgeKey(0, 'h', x, 16);
      lot.walls[id] = { id, level: 0, dir: 'h', x, z: 16, height: 2.8, sideA: F, sideB: F };
    };
    for (let x = 0; x <= 9; x++) wall(x);
    for (let x = 14; x <= 23; x++) wall(x);
    const p = plan({ kind: 'pool', rect: { x0: 10, z0: 16, x1: 13, z1: 17 }, styleId: STYLE });
    expect(p.ok).toBe(false);
    expect(p.reasons).toContain('That pool would cut part of the lot off from the street.');
    expect(p.highlight.blocked.some((c) => c.reason === 'Cut off.')).toBe(true);
  });

  it('refuses when the household cannot pay and reports a no-op erase', () => {
    const poor = setup({ funds: 100 });
    expect(poor.plan({ kind: 'pool', rect: RECT, styleId: STYLE }).reasons).toEqual(['Not enough household funds.']);
    const erase = poor.plan({ kind: 'erasePool', tile: { x: 1, z: 1 } });
    expect(erase.ok).toBe(false);
    expect(erase.noop).toBe(true);
  });
});

describe('pool commands', () => {
  it('builds, undoes and redoes a pool with exact money', () => {
    const { lot, hh, state, run, stack, ctx, seen, content } = setup();
    const start = hh.funds;
    const price = poolPrice(STYLE, RECT, content);
    expect(run(buildPool(lot.id, hh.id, RECT, STYLE)).ok).toBe(true);
    expect(hh.funds).toBe(start - price);
    expect(poolsOf(lot)).toHaveLength(1);
    const pool = poolsOf(lot)[0]!;
    expect(pool.id).toMatch(/^pool/);
    expect(pool.purchasePrice).toBe(price);
    expect(pool.boughtAt).toBe(state.clock.minutes);
    expect(poolContains(pool, 6, 6)).toBe(true);
    expect(pool.ladders).toHaveLength(1);
    expect(poolEvents(seen).length).toBeGreaterThan(0);

    expect(stack.undo(ctx)).toBe('Build azure mosaic pool (4 x 2 m)');
    expect(hh.funds).toBe(start);
    expect(poolsOf(lot)).toEqual([]);
    expect(poolEvents(seen).length).toBeGreaterThanOrEqual(2);

    expect(stack.redo(ctx)).toMatchObject({ ok: true });
    expect(hh.funds).toBe(start - price);
    expect(poolsOf(lot)).toHaveLength(1);
  });

  it('refunds in full the same day and 80 % later', () => {
    const { lot, hh, state, run, content } = setup();
    const start = hh.funds;
    const price = poolPrice(STYLE, RECT, content);
    run(buildPool(lot.id, hh.id, RECT, STYLE));
    const pool = poolsOf(lot)[0]!;
    expect(run(removePool(lot.id, hh.id, { poolId: pool.id })).ok).toBe(true);
    expect(hh.funds).toBe(start); // same day: full refund
    expect(poolsOf(lot)).toEqual([]);

    // build again and sell it on the next day
    expect(run(buildPool(lot.id, hh.id, RECT, STYLE)).ok).toBe(true);
    const later = poolsOf(lot)[0]!;
    state.clock.minutes = MINUTES_PER_DAY + 10;
    const before = hh.funds;
    expect(run(removePool(lot.id, hh.id, { tile: { x: 6, z: 6 } })).ok).toBe(true);
    expect(hh.funds - before).toBe(Math.round(price * 0.8));
    expect(later.id).not.toBe(pool.id);
  });

  it('moves, adds and removes ladders without money, all undoable', () => {
    const { lot, hh, run, stack, ctx } = setup();
    run(buildPool(lot.id, hh.id, RECT, STYLE));
    const funds = hh.funds;
    const id = poolsOf(lot)[0]!.id;
    const first = poolsOf(lot)[0]!.ladders[0]!;
    const moveTo = first.side === 'w' ? { x: 9, z: 7 } : { x: 6, z: 7 };

    expect(run(movePoolLadder(lot.id, hh.id, id, { x: first.x, z: first.z }, moveTo)).ok).toBe(true);
    expect(poolsOf(lot)[0]!.ladders[0]).toMatchObject({ x: moveTo.x, z: moveTo.z });
    expect(hh.funds).toBe(funds);
    stack.undo(ctx);
    expect(poolsOf(lot)[0]!.ladders[0]).toEqual(first);

    expect(run(addPoolLadder(lot.id, hh.id, id, moveTo)).ok).toBe(true);
    expect(poolsOf(lot)[0]!.ladders).toHaveLength(2);
    expect(run(removePoolLadder(lot.id, hh.id, id, moveTo)).ok).toBe(true);
    expect(poolsOf(lot)[0]!.ladders).toHaveLength(1);
    expect(stack.undo(ctx)).toBe('Remove ladder');
    expect(poolsOf(lot)[0]!.ladders).toHaveLength(2);

    // the last ladder cannot go
    stack.undo(ctx); // undo the add as well, back to one ladder
    expect(poolsOf(lot)[0]!.ladders).toEqual([first]);
    expect(run(removePoolLadder(lot.id, hh.id, id, { x: first.x, z: first.z })).ok).toBe(false);
  });

  it('rejects invalid commands without touching money or the lot', () => {
    const { lot, hh, run, seen } = setup();
    const before = hh.funds;
    expect(run(poolCommand(lot.id, hh.id, { kind: 'pool', rect: { x0: 6, z0: 6, x1: 7, z1: 7 }, styleId: STYLE }))).toMatchObject({ ok: false });
    expect(run(poolCommand(lot.id, 'hh_missing', { kind: 'pool', rect: RECT, styleId: STYLE }))).toMatchObject({ ok: false });
    expect(hh.funds).toBe(before);
    expect(poolsOf(lot)).toEqual([]);
    expect(poolEvents(seen)).toEqual([]);
  });
});
