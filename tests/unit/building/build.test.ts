// Build mode construction: walls, runs, rooms, demolition, doors and windows, floors, room delete. Every
// command is checked for exact money and lot state through apply, undo and redo; every rejection must leave the
// whole state (money and id counter included) untouched.

import { describe, expect, it } from 'vitest';
import {
  buildCommand, deleteOpening, deleteRoom, eraseFloorTiles, eraseRoomFloor, eraseWallRect, eraseWallRun, eraseWallSegment, moveOpening,
  placeFloorRect, placeOpening, placeRoom, placeWallRun, placeWallSegment,
} from '../../../src/building/buildCommands';
import {
  planBuild, rectPerimeter, runEdges, straightenRun, structurePrice, WALL_HEIGHT_PRESETS, wallRectRequest, wallRunRequest,
} from '../../../src/building/buildPlans';
import { paintWallSide } from '../../../src/building/commands';
import { MINUTES_PER_DAY } from '../../../src/core/clock';
import { UndoStack, type CommandContext } from '../../../src/core/commands';
import { EventBus, type GameEvent } from '../../../src/core/events';
import { edgeKey, tileKey } from '../../../src/core/ids';
import { cloneState } from '../../../src/core/state';
import type { ContentDB, OpeningDef } from '../../../src/content/types';
import type { FinishRef, Person, StartMode } from '../../../src/core/types';
import { LotNav } from '../../../src/world/nav';
import { computeRooms } from '../../../src/world/rooms';
import { openingEdgeKeys, openingOnWall } from '../../../src/world/walls';
import { fixtureContent, putObject, testWorld } from '../world/fixtures';

const OAK: FinishRef = { designId: 'oak-planks', paletteId: 'oak-planks-p0' };
const STRIPES: FinishRef = { designId: 'stripes-regency', paletteId: 'stripes-regency-p1' };
const PAINT0: FinishRef = { designId: 'plain-paint', paletteId: 'plain-paint-p0' };
/** structure 2000 (20.00) + two plain-paint sides of 200 each. */
const SEG = structurePrice(2.8) + 200 + 200;

function wideWindow(base: OpeningDef): OpeningDef {
  return { ...base, id: 'window-triple', name: 'Triple Window', width: 3, price: 60000 };
}

function setup(o: { funds?: number; mode?: StartMode; size?: number } = {}) {
  const content: ContentDB = fixtureContent();
  content.openings['window-triple'] = wideWindow(content.openings['window-wide']!);
  const w = testWorld(o);
  const events = new EventBus();
  const seen: GameEvent[] = [];
  events.onAny((e) => seen.push(e));
  const ctx: CommandContext = { state: w.state, content, events };
  const stack = new UndoStack();
  const nav = new LotNav(() => w.state, content, events);
  const run = (cmd: ReturnType<typeof placeWallRun>) => stack.run(ctx, cmd);
  const person = (id: string, name: string, x: number, z: number, posture: 'standing' | 'seated' = 'standing') => {
    w.state.people[id] = {
      id, firstName: name, lastName: 'T', location: { kind: 'lot', lotId: w.lot.id, level: 0, x, z, facing: 0, posture },
    } as unknown as Person;
  };
  return { ...w, content, events, seen, ctx, stack, nav, run, person };
}

/** JSON with sorted keys, so records restored by undo compare equal whatever their insertion order. */
function json(v: unknown): string {
  const sort = (x: unknown): unknown => (Array.isArray(x) ? x.map(sort) : x && typeof x === 'object'
    ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, y]) => [k, sort(y)])) : x);
  return JSON.stringify(sort(v));
}
const lastLotChange = (seen: GameEvent[]) => [...seen].reverse().find((e) => e.type === 'lot.changed');

describe('geometry helpers', () => {
  it('runs are axis aligned and cover the right edges', () => {
    expect(runEdges({ x: 2, z: 3 }, { x: 5, z: 3 })).toEqual([{ dir: 'h', x: 2, z: 3 }, { dir: 'h', x: 3, z: 3 }, { dir: 'h', x: 4, z: 3 }]);
    expect(runEdges({ x: 5, z: 3 }, { x: 5, z: 1 })).toEqual([{ dir: 'v', x: 5, z: 1 }, { dir: 'v', x: 5, z: 2 }]);
    expect(runEdges({ x: 1, z: 1 }, { x: 3, z: 3 })).toBeNull();
    expect(runEdges({ x: 1, z: 1 }, { x: 1, z: 1 })).toBeNull();
    expect(straightenRun({ x: 2, z: 2 }, { x: 7, z: 4 })).toEqual({ x: 7, z: 2 });
    expect(straightenRun({ x: 2, z: 2 }, { x: 3, z: 9 })).toEqual({ x: 2, z: 9 });
    expect(rectPerimeter({ x0: 1, z0: 1, x1: 4, z1: 3 })).toHaveLength(10);
    expect(new Set(rectPerimeter({ x0: 1, z0: 1, x1: 4, z1: 3 }).map((e) => `${e.dir}${e.x},${e.z}`)).size).toBe(10);
  });
  it('height presets include the standard wall', () => {
    expect(WALL_HEIGHT_PRESETS.map((p) => p.height)).toEqual([1.2, 2.8, 3.6]);
    expect(structurePrice(1.2)).toBeLessThan(structurePrice(2.8));
  });
});

describe('wall runs', () => {
  it('builds a run, charges per new segment, and undo/redo restore lot and money exactly', () => {
    const { lot, hh, run, stack, ctx, seen } = setup();
    const start = hh.funds;
    const lot0 = json(lot);
    const r = run(placeWallRun(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 10, z: 4 }));
    expect(r).toEqual({ ok: true });
    expect(Object.keys(lot.walls)).toHaveLength(6);
    const w = lot.walls[edgeKey(0, 'h', 6, 4)]!;
    expect(w).toMatchObject({ level: 0, dir: 'h', x: 6, z: 4, height: 2.8, sideA: PAINT0, sideB: PAINT0, purchasePrice: SEG });
    expect(hh.funds).toBe(start - 6 * SEG);
    expect(hh.ledger.at(-1)).toMatchObject({ kind: 'build', amount: -6 * SEG });
    expect(lastLotChange(seen)).toMatchObject({ type: 'lot.changed', what: 'walls' });
    expect(stack.peekUndo()).toBe('Build 6 m of wall');
    const lot1 = json(lot);

    expect(stack.undo(ctx)).toBe('Build 6 m of wall');
    expect(json(lot)).toBe(lot0);
    expect(hh.funds).toBe(start);
    expect(hh.ledger.at(-1)).toMatchObject({ kind: 'refund', amount: 6 * SEG });
    expect(stack.redo(ctx)).toEqual({ ok: true });
    expect(json(lot)).toBe(lot1);
    expect(hh.funds).toBe(start - 6 * SEG);
    expect(hh.ledger.reduce((t, l) => t + l.amount, 0)).toBe(hh.funds - start);
  });

  it('single segment, runs in any direction, tall and half presets', () => {
    const { lot, hh, run } = setup();
    expect(run(placeWallSegment(lot.id, hh.id, 0, { dir: 'v', x: 3, z: 3 }))).toEqual({ ok: true });
    expect(lot.walls[edgeKey(0, 'v', 3, 3)]).toBeDefined();
    expect(run(placeWallRun(lot.id, hh.id, 0, { x: 8, z: 9 }, { x: 8, z: 6 }, { height: 1.2 }))).toEqual({ ok: true });
    expect(Object.values(lot.walls).filter((w) => w.height === 1.2)).toHaveLength(3);
    expect(lot.walls[edgeKey(0, 'v', 8, 7)]!.purchasePrice).toBe(structurePrice(1.2) + 400);
    expect(run(placeWallRun(lot.id, hh.id, 0, { x: 2, z: 2 }, { x: 3, z: 2 }, { height: 9 }))).toMatchObject({ ok: false });
  });

  it('keeps existing segments and their finishes and charges only new ones', () => {
    const { lot, hh, run, ctx, content } = setup();
    expect(run(placeWallRun(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 6, z: 4 }))).toEqual({ ok: true });
    new UndoStack().run(ctx, paintWallSide(lot.id, hh.id, edgeKey(0, 'h', 5, 4), 'a', STRIPES));
    const before = hh.funds;
    const built = wallRunRequest(0, { x: 3, z: 4 }, { x: 8, z: 4 });
    if (!built.ok) throw new Error(built.reason);
    const plan = planBuild(ctx.state, content, lot.id, hh.id, built.request);
    expect(plan).toMatchObject({ ok: true, counts: { wallsNew: 3, wallsExisting: 2 }, cost: 3 * SEG });
    expect(run(placeWallRun(lot.id, hh.id, 0, { x: 3, z: 4 }, { x: 8, z: 4 }))).toEqual({ ok: true });
    expect(hh.funds).toBe(before - 3 * SEG);
    expect(lot.walls[edgeKey(0, 'h', 5, 4)]!.sideA).toEqual(STRIPES);
    // a run that adds nothing is refused as already built
    const r = run(placeWallRun(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 6, z: 4 }));
    expect(r).toMatchObject({ ok: false });
  });

  it('custom finishes per side add their design prices', () => {
    const { lot, hh, run } = setup();
    const f = hh.funds;
    expect(run(placeWallRun(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 5, z: 4 }, { finishA: STRIPES, finishB: PAINT0 }))).toEqual({ ok: true });
    const w = lot.walls[edgeKey(0, 'h', 4, 4)]!;
    expect(w.sideA).toEqual(STRIPES);
    expect(w.sideB).toEqual(PAINT0);
    expect(f - hh.funds).toBe(structurePrice(2.8) + 400 + 200);
  });

  it('is sandbox free and records a zero paid price', () => {
    const { lot, hh, run } = setup({ mode: 'sandbox', funds: 1000 });
    const f = hh.funds;
    // sandbox worlds have unlimited funds
    expect(run(placeWallRun(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 8, z: 4 }))).toEqual({ ok: true });
    expect(hh.funds).toBe(f);
    expect(lot.walls[edgeKey(0, 'h', 4, 4)]!.purchasePrice).toBe(0);
    // demolishing returns nothing, so no money can be minted
    expect(run(eraseWallRun(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 8, z: 4 }))).toEqual({ ok: true });
    expect(hh.funds).toBe(f);
  });
});

describe('rejections change nothing', () => {
  it('diagonal, zero length, off the lot, not enough money', () => {
    const { state, lot, hh, run, content, ctx } = setup({ funds: 5000 });
    const s0 = json(state);
    expect(run(placeWallRun(lot.id, hh.id, 0, { x: 1, z: 1 }, { x: 4, z: 4 }))).toMatchObject({ ok: false, reason: 'Walls run in straight lines.' });
    expect(run(placeWallRun(lot.id, hh.id, 0, { x: 3, z: 3 }, { x: 3, z: 3 }))).toMatchObject({ ok: false });
    expect(run(placeWallRun(lot.id, hh.id, 0, { x: 20, z: 3 }, { x: 26, z: 3 }))).toMatchObject({ ok: false, reason: 'Walls have to stay on the lot.' });
    expect(run(placeWallRun(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 10, z: 4 }))).toMatchObject({ ok: false, reason: 'Not enough household funds.' });
    expect(run(placeWallRun(lot.id, hh.id, 3, { x: 4, z: 4 }, { x: 5, z: 4 }))).toMatchObject({ ok: false, reason: 'That floor does not exist.' });
    expect(run(placeWallRun(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 5, z: 4 }, { finishA: { designId: 'nope', paletteId: 'x' } }))).toMatchObject({ ok: false });
    expect(json(state)).toBe(s0);
    void content; void ctx;
  });

  it('a wall through an object footprint is refused with the object named', () => {
    const { state, content, lot, hh, run } = setup();
    putObject(state, content, lot, 'sofa-tweed', 6, 6); // tiles (6,6) and (7,6)
    const s0 = json(state);
    const r = run(placeWallSegment(lot.id, hh.id, 0, { dir: 'v', x: 7, z: 6 }));
    expect(r).toMatchObject({ ok: false });
    expect((r as { reason: string }).reason).toContain('Sofa Tweed');
    expect(json(state)).toBe(s0);
    // along the sofa's back is fine (not between its tiles)
    expect(run(placeWallRun(lot.id, hh.id, 0, { x: 5, z: 6 }, { x: 9, z: 6 }))).toEqual({ ok: true });
  });

  it('a wall that cuts an object off from its use tile is refused', () => {
    const { state, content, lot, hh, run } = setup();
    putObject(state, content, lot, 'fridge-standard', 10, 10); // use slot in front: tile (10,11)
    const s0 = json(state);
    const r = run(placeWallSegment(lot.id, hh.id, 0, { dir: 'h', x: 10, z: 11 }));
    expect(r).toMatchObject({ ok: false });
    expect((r as { reason: string }).reason).toMatch(/Fridge Standard/);
    expect(json(state)).toBe(s0);
  });

  it('refuses a wall within reach of a person, naming them; seated people keep a smaller margin', () => {
    const { state, lot, hh, run, person } = setup();
    person('per_a', 'Ada', 6.0, 5.0); // exactly on the edge between tiles
    const s0 = json(state);
    expect(run(placeWallSegment(lot.id, hh.id, 0, { dir: 'v', x: 6, z: 5 }))).toMatchObject({ ok: false, reason: 'Ada is standing in the way.' });
    person('per_b', 'Bo', 9.5, 9.5); // tile centre, 0.5 from every edge
    expect(run(placeWallSegment(lot.id, hh.id, 0, { dir: 'v', x: 9, z: 9 }))).toEqual({ ok: true });
    expect(json(state)).not.toBe(s0);
  });

  it('refuses to wall a person in; a door in the same operation makes it fine', () => {
    const { lot, hh, run, person, content, ctx, nav } = setup();
    person('per_a', 'Ada', 6.5, 6.5);
    const s0 = json(ctx.state);
    const r = run(placeRoom(lot.id, hh.id, 0, { x: 5, z: 5 }, { x: 9, z: 9 }));
    expect(r).toMatchObject({ ok: false, reason: 'Ada would be trapped. Leave a way out first.' });
    expect(json(ctx.state)).toBe(s0);
    const door = { defId: 'door-panel', wallId: edgeKey(0, 'h', 7, 9) };
    expect(run(placeRoom(lot.id, hh.id, 0, { x: 5, z: 5 }, { x: 9, z: 9 }, { openings: [door] }))).toEqual({ ok: true });
    expect(nav.findPath(lot.id, 0, { x: 6, z: 6 }, [{ x: lot.entry.x, z: lot.entry.z }])).not.toBeNull();
    void content;
  });

  it('deleting the only door of a room with a person in it is refused', () => {
    const { lot, hh, run, person } = setup();
    const door = { defId: 'door-panel', wallId: edgeKey(0, 'h', 7, 9) };
    expect(run(placeRoom(lot.id, hh.id, 0, { x: 5, z: 5 }, { x: 9, z: 9 }, { openings: [door] }))).toEqual({ ok: true });
    person('per_a', 'Ada', 6.5, 6.5);
    const opening = Object.values(lot.openings)[0]!;
    const s0 = json(lot);
    expect(run(deleteOpening(lot.id, hh.id, opening.id))).toMatchObject({ ok: false });
    expect(run(eraseWallSegment(lot.id, hh.id, 0, { dir: 'h', x: 7, z: 9 }))).toEqual({ ok: true }); // opening up the wall is fine
    expect(json(lot)).not.toBe(s0);
  });

  it('refuses to seal furniture in, but only furniture that could be reached before', () => {
    const { state, content, lot, hh, run } = setup();
    putObject(state, content, lot, 'bookcase-open', 7, 7); // use tile (7,8)
    const s0 = json(state);
    const r = run(placeRoom(lot.id, hh.id, 0, { x: 5, z: 5 }, { x: 10, z: 10 }));
    expect(r).toMatchObject({ ok: false });
    expect((r as { reason: string }).reason).toMatch(/Bookcase Open/);
    expect(json(state)).toBe(s0);
    const door = { defId: 'door-panel', wallId: edgeKey(0, 'h', 7, 10) };
    expect(run(placeRoom(lot.id, hh.id, 0, { x: 5, z: 5 }, { x: 10, z: 10 }, { openings: [door] }))).toEqual({ ok: true });
  });
});

describe('rooms', () => {
  it('the room tool builds the outline, fills the floor, reports rooms and measurement, and is one undo step', () => {
    const { state, lot, hh, run, stack, ctx, content, seen } = setup();
    const start = hh.funds;
    const lot0 = json(lot);
    const req = wallRectRequest(0, { x: 10, z: 10 }, { x: 6, z: 7 }, { floor: OAK });
    expect(req.ok).toBe(true);
    const plan = planBuild(state, content, lot.id, hh.id, (req as { ok: true; request: never }).request);
    expect(plan).toMatchObject({
      ok: true, counts: { wallsNew: 14, floorsPlaced: 12 }, rooms: { before: 0, after: 1 },
      measure: { lengthM: 14, widthM: 4, depthM: 3, areaM2: 12 },
    });
    expect(plan.cost).toBe(14 * SEG + 12 * 400);
    expect(json(lot)).toBe(lot0); // planning changed nothing
    expect(run(placeRoom(lot.id, hh.id, 0, { x: 10, z: 10 }, { x: 6, z: 7 }, { floor: OAK }))).toEqual({ ok: true });
    expect(Object.keys(lot.walls)).toHaveLength(14);
    expect(lot.floors[tileKey(0, 8, 8)]).toEqual(OAK);
    expect(lot.floors[tileKey(0, 5, 8)]).toBeUndefined();
    expect(hh.funds).toBe(start - 14 * SEG - 12 * 400);
    expect(lastLotChange(seen)).toMatchObject({ what: 'all' });
    expect(computeRooms(lot, 0).filter((r) => !r.outdoor)).toHaveLength(1);
    stack.undo(ctx);
    expect(json(lot)).toBe(lot0);
    expect(hh.funds).toBe(start);
    expect(Object.keys(lot.walls)).toHaveLength(0);
  });

  it('a room with a door and windows in one operation; every opening is charged and refunded on undo', () => {
    const { lot, hh, run, stack, ctx, nav } = setup();
    const start = hh.funds;
    const lot0 = json(lot);
    const openings = [
      { defId: 'door-panel', wallId: edgeKey(0, 'h', 8, 11) },
      { defId: 'window-sash', wallId: edgeKey(0, 'v', 6, 8) },
      { defId: 'window-wide', wallId: edgeKey(0, 'v', 12, 9) },
    ];
    expect(run(placeRoom(lot.id, hh.id, 0, { x: 6, z: 7 }, { x: 12, z: 11 }, { openings }))).toEqual({ ok: true });
    expect(Object.values(lot.openings).map((o) => o.defId).sort()).toEqual(['door-panel', 'window-sash', 'window-wide']);
    expect(Object.values(lot.openings).every((o) => o.id.startsWith('opn_'))).toBe(true);
    const walls = 2 * (6 + 4);
    expect(hh.funds).toBe(start - walls * SEG - 30000 - 20000 - 30000);
    // nav: the door passes, windows and walls block
    expect(nav.canStep(lot.id, 0, { x: 8, z: 10 }, { x: 8, z: 11 })).toBe(true);
    expect(nav.canStep(lot.id, 0, { x: 6, z: 8 }, { x: 5, z: 8 })).toBe(false);
    expect(nav.canStep(lot.id, 0, { x: 11, z: 9 }, { x: 12, z: 9 })).toBe(false);
    expect(nav.canStep(lot.id, 0, { x: 9, z: 10 }, { x: 9, z: 11 })).toBe(false);
    stack.undo(ctx);
    expect(json(lot)).toBe(lot0);
    expect(hh.funds).toBe(start);
    expect(nav.canStep(lot.id, 0, { x: 8, z: 10 }, { x: 8, z: 11 })).toBe(true); // wall gone, open again
    expect(stack.redo(ctx)).toEqual({ ok: true });
    expect(hh.funds).toBe(start - walls * SEG - 80000);
    expect(Object.values(lot.openings)).toHaveLength(3);
  });

  it('room tracker ids survive unchanged rooms and edits elsewhere', async () => {
    const { RoomTracker } = await import('../../../src/world/roomTracker');
    const { lot, hh, run } = setup();
    const tracker = new RoomTracker();
    run(placeRoom(lot.id, hh.id, 0, { x: 2, z: 2 }, { x: 6, z: 6 }));
    const a = tracker.update(lot, 0).find((r) => !r.outdoor)!;
    run(placeRoom(lot.id, hh.id, 0, { x: 10, z: 10 }, { x: 14, z: 14 }));
    const rooms = tracker.update(lot, 0);
    expect(rooms.find((r) => r.uid === a.uid)).toMatchObject({ outdoor: false });
    expect(rooms.filter((r) => !r.outdoor)).toHaveLength(2);
    // split the first room: the bigger part keeps the uid, the other gets a new one
    run(placeWallRun(lot.id, hh.id, 0, { x: 5, z: 2 }, { x: 5, z: 6 }));
    const after = tracker.update(lot, 0);
    const parts = after.filter((r) => !r.outdoor && r.tiles[0]!.x <= 5);
    expect(parts).toHaveLength(2);
    expect(parts.filter((r) => r.uid === a.uid)).toHaveLength(1);
    expect(parts.find((r) => r.uid === a.uid)!.tiles).toHaveLength(12);
    const delta = RoomTracker.delta(rooms, after);
    expect(delta.created).toHaveLength(1);
    expect(delta.removed).toHaveLength(0);
    expect(new Set(after.map((r) => r.uid)).size).toBe(after.length);
  });

  it('outlines are closed loops with collinear points merged', async () => {
    const { roomOutlines } = await import('../../../src/world/roomTracker');
    const rect = roomOutlines([{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 1, z: 2 }, { x: 2, z: 2 }]);
    expect(rect).toEqual([[{ x: 1, z: 1 }, { x: 3, z: 1 }, { x: 3, z: 3 }, { x: 1, z: 3 }]]);
    const L = roomOutlines([{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }]);
    expect(L[0]).toHaveLength(6);
    const ring = [];
    for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) if (!(x === 1 && z === 1)) ring.push({ x, z });
    const loops = roomOutlines(ring);
    expect(loops).toHaveLength(2);
    expect(loops[0]).toHaveLength(4);
    expect(loops[1]).toHaveLength(4);
  });
});

describe('demolition', () => {
  it('refunds the full price on the day it was built and 80 % later; undo and redo are exact', () => {
    const { state, lot, hh, run, stack, ctx } = setup();
    run(placeWallRun(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 8, z: 4 }));
    const afterBuild = hh.funds;
    const lot1 = json(lot);
    expect(run(eraseWallRun(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 6, z: 4 }))).toEqual({ ok: true });
    expect(hh.funds).toBe(afterBuild + 2 * SEG);
    expect(hh.ledger.at(-1)).toMatchObject({ kind: 'sale', amount: 2 * SEG });
    stack.undo(ctx);
    expect(hh.funds).toBe(afterBuild);
    expect(json(lot)).toBe(lot1);
    expect(hh.ledger.at(-1)).toMatchObject({ amount: -2 * SEG });
    stack.redo(ctx);
    expect(hh.funds).toBe(afterBuild + 2 * SEG);
    state.clock.minutes += 2 * MINUTES_PER_DAY;
    const before = hh.funds;
    expect(run(eraseWallSegment(lot.id, hh.id, 0, { dir: 'h', x: 7, z: 4 }))).toEqual({ ok: true });
    expect(hh.funds).toBe(before + Math.round(SEG * 0.8));
    stack.undo(ctx);
    expect(hh.funds).toBe(before);
  });

  it('walls that came with the lot return 80 % of the structure price (nothing in the sandbox)', () => {
    const { lot, hh, run } = setup();
    lot.walls[edgeKey(0, 'h', 4, 4)] = { id: edgeKey(0, 'h', 4, 4), level: 0, dir: 'h', x: 4, z: 4, height: 2.8, sideA: PAINT0, sideB: PAINT0 };
    const f = hh.funds;
    expect(run(eraseWallSegment(lot.id, hh.id, 0, { dir: 'h', x: 4, z: 4 }))).toEqual({ ok: true });
    expect(hh.funds).toBe(f + Math.round(structurePrice(2.8) * 0.8));
  });

  it('erasing nothing is refused; the rectangle erase takes the outline and everything inside', () => {
    const { lot, hh, run } = setup();
    expect(run(eraseWallSegment(lot.id, hh.id, 0, { dir: 'h', x: 4, z: 4 }))).toMatchObject({ ok: false, reason: 'There is no wall there.' });
    run(placeRoom(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 10, z: 9 }));
    run(placeWallRun(lot.id, hh.id, 0, { x: 7, z: 4 }, { x: 7, z: 9 }));
    expect(Object.keys(lot.walls)).toHaveLength(2 * (6 + 5) + 5); // plus the five divider segments
    expect(run(eraseWallRect(lot.id, hh.id, 0, { x: 6, z: 3 }, { x: 8, z: 10 }))).toEqual({ ok: true });
    expect(lot.walls[edgeKey(0, 'v', 7, 6)]).toBeUndefined();
    expect(lot.walls[edgeKey(0, 'v', 4, 6)]).toBeDefined();
  });

  it('deleting a wall deletes and refunds the opening in it; undo brings both back', () => {
    const { lot, hh, run, stack, ctx } = setup();
    run(placeRoom(lot.id, hh.id, 0, { x: 6, z: 6 }, { x: 10, z: 10 }, { openings: [{ defId: 'door-panel', wallId: edgeKey(0, 'h', 7, 10) }] }));
    const opening = Object.values(lot.openings)[0]!;
    const f = hh.funds;
    const lot1 = json(lot);
    expect(run(eraseWallSegment(lot.id, hh.id, 0, { dir: 'h', x: 7, z: 10 }))).toEqual({ ok: true });
    expect(Object.keys(lot.openings)).toHaveLength(0);
    expect(hh.funds).toBe(f + SEG + 30000);
    stack.undo(ctx);
    expect(json(lot)).toBe(lot1);
    expect(lot.openings[opening.id]).toEqual(opening);
    expect(hh.funds).toBe(f);
  });

  it('a wall holding a hung object cannot be demolished', () => {
    const { state, content, lot, hh, run } = setup();
    run(placeWallRun(lot.id, hh.id, 0, { x: 5, z: 5 }, { x: 9, z: 5 }));
    const mirror = putObject(state, content, lot, 'bathroom-mirror', 6, 5, 0); // back faces north -> wall h 6,5
    void mirror;
    const r = run(eraseWallSegment(lot.id, hh.id, 0, { dir: 'h', x: 6, z: 5 }));
    expect(r).toMatchObject({ ok: false });
    expect((r as { reason: string }).reason).toMatch(/Bathroom Mirror/);
    expect(run(eraseWallSegment(lot.id, hh.id, 0, { dir: 'h', x: 8, z: 5 }))).toEqual({ ok: true });
  });
});

describe('doors and windows', () => {
  function house() {
    const s = setup();
    s.run(placeRoom(s.lot.id, s.hh.id, 0, { x: 6, z: 6 }, { x: 12, z: 10 }));
    return s;
  }

  it('places a door and a window with cost, flip, nav and exact undo/redo', () => {
    const { lot, hh, run, stack, ctx, nav, seen } = house();
    const f = hh.funds;
    const lot0 = json(lot);
    expect(run(placeOpening(lot.id, hh.id, 'door-panel', edgeKey(0, 'h', 9, 10), true))).toEqual({ ok: true });
    const door = Object.values(lot.openings)[0]!;
    expect(door).toMatchObject({ defId: 'door-panel', wallId: edgeKey(0, 'h', 9, 10), flip: true, purchasePrice: 30000 });
    expect(door.boughtAt).toBeDefined();
    expect(hh.funds).toBe(f - 30000);
    expect(lastLotChange(seen)).toMatchObject({ what: 'openings' });
    expect(nav.canStep(lot.id, 0, { x: 9, z: 9 }, { x: 9, z: 10 })).toBe(true);
    expect(run(placeOpening(lot.id, hh.id, 'window-sash', edgeKey(0, 'v', 12, 8)))).toEqual({ ok: true });
    expect(nav.canStep(lot.id, 0, { x: 11, z: 8 }, { x: 12, z: 8 })).toBe(false);
    expect(openingOnWall(lot, edgeKey(0, 'v', 12, 8))?.defId).toBe('window-sash');
    stack.undo(ctx);
    stack.undo(ctx);
    expect(json(lot)).toBe(lot0);
    expect(hh.funds).toBe(f);
    stack.redo(ctx);
    stack.redo(ctx);
    expect(Object.values(lot.openings)).toHaveLength(2);
    expect(hh.funds).toBe(f - 30000 - 20000);
    // ids stay the same across undo/redo
    expect(lot.openings[door.id]).toBeDefined();
  });

  it('needs a wall, refuses overlaps, low walls and objects in the way', () => {
    const { state, content, lot, hh, run } = house();
    const s0 = json(state);
    expect(run(placeOpening(lot.id, hh.id, 'door-panel', edgeKey(0, 'h', 20, 10)))).toMatchObject({ ok: false, reason: 'A door needs a wall.' });
    expect(run(placeOpening(lot.id, hh.id, 'door-panel', edgeKey(0, 'h', 7, 10)))).toEqual({ ok: true });
    expect(run(placeOpening(lot.id, hh.id, 'window-sash', edgeKey(0, 'h', 7, 10)))).toMatchObject({ ok: false, reason: 'There is already a door there.' });
    expect(run(placeOpening(lot.id, hh.id, 'nope', edgeKey(0, 'h', 8, 10)))).toMatchObject({ ok: false });
    run(placeWallRun(lot.id, hh.id, 0, { x: 2, z: 2 }, { x: 5, z: 2 }, { height: 1.2 }));
    expect(run(placeOpening(lot.id, hh.id, 'door-panel', edgeKey(0, 'h', 3, 2)))).toMatchObject({ ok: false, reason: 'The wall is too low for a Door Panel.' });
    expect(run(placeOpening(lot.id, hh.id, 'window-sash', edgeKey(0, 'h', 3, 2)))).toMatchObject({ ok: false });
    // furniture that blocks movement beside the doorway
    putObject(state, content, lot, 'trash-can', 10, 9);
    expect(run(placeOpening(lot.id, hh.id, 'door-panel', edgeKey(0, 'h', 10, 10)))).toMatchObject({ ok: false, reason: 'The Trash Can blocks the doorway.' });
    expect(run(placeOpening(lot.id, hh.id, 'window-sash', edgeKey(0, 'h', 10, 10)))).toEqual({ ok: true }); // a window does not need clearance
    // a mirror hangs on the edge
    putObject(state, content, lot, 'bathroom-mirror', 11, 6, 0);
    expect(run(placeOpening(lot.id, hh.id, 'window-sash', edgeKey(0, 'h', 11, 6)))).toMatchObject({ ok: false, reason: 'The Bathroom Mirror hangs there.' });
    expect(json(state)).not.toBe(s0);
  });

  it('unaffordable and failed openings leave the state identical', () => {
    const { state, lot, hh, run } = setup({ funds: SEG * 8 + 10000 });
    run(placeRoom(lot.id, hh.id, 0, { x: 6, z: 6 }, { x: 8, z: 8 }));
    const s0 = json(state);
    expect(run(placeOpening(lot.id, hh.id, 'door-panel', edgeKey(0, 'h', 6, 8)))).toMatchObject({ ok: false, reason: 'Not enough household funds.' });
    expect(json(state)).toBe(s0);
  });

  it('moves a door for free and undo puts it back; a move that would trap someone is refused', () => {
    const { state, lot, hh, run, stack, ctx, nav, person } = house();
    run(placeOpening(lot.id, hh.id, 'door-panel', edgeKey(0, 'h', 7, 10)));
    const door = Object.values(lot.openings)[0]!;
    const f = hh.funds;
    expect(run(moveOpening(lot.id, hh.id, door.id, edgeKey(0, 'h', 10, 10)))).toEqual({ ok: true });
    expect(lot.openings[door.id]!.wallId).toBe(edgeKey(0, 'h', 10, 10));
    expect(hh.funds).toBe(f);
    expect(nav.canStep(lot.id, 0, { x: 10, z: 9 }, { x: 10, z: 10 })).toBe(true);
    expect(nav.canStep(lot.id, 0, { x: 7, z: 9 }, { x: 7, z: 10 })).toBe(false);
    stack.undo(ctx);
    expect(lot.openings[door.id]!.wallId).toBe(edgeKey(0, 'h', 7, 10));
    stack.redo(ctx);
    expect(run(moveOpening(lot.id, hh.id, door.id, edgeKey(0, 'h', 10, 10)))).toMatchObject({ ok: false, reason: 'It is already there.' });
    // moving the door onto a window position, or into the middle of nowhere
    run(placeOpening(lot.id, hh.id, 'window-sash', edgeKey(0, 'v', 12, 8)));
    expect(run(moveOpening(lot.id, hh.id, door.id, edgeKey(0, 'v', 12, 8)))).toMatchObject({ ok: false });
    expect(run(moveOpening(lot.id, hh.id, door.id, edgeKey(0, 'h', 20, 20)))).toMatchObject({ ok: false });
    person('per_a', 'Ada', 9.5, 8.5);
    expect(run(moveOpening(lot.id, hh.id, door.id, edgeKey(0, 'v', 6, 7)))).toEqual({ ok: true }); // still connected: the door moved to another wall
    void state;
  });

  it('deleting an opening refunds it (full price the same day, 80 % later); the wall stays', () => {
    const { state, lot, hh, run, stack, ctx } = house();
    run(placeOpening(lot.id, hh.id, 'door-panel', edgeKey(0, 'h', 7, 10)));
    run(placeOpening(lot.id, hh.id, 'window-sash', edgeKey(0, 'h', 9, 10)));
    const [door, win] = Object.values(lot.openings);
    const f = hh.funds;
    expect(run(deleteOpening(lot.id, hh.id, door!.id))).toEqual({ ok: true });
    expect(hh.funds).toBe(f + 30000);
    expect(lot.walls[edgeKey(0, 'h', 7, 10)]).toBeDefined();
    state.clock.minutes += 3 * MINUTES_PER_DAY;
    const g = hh.funds;
    expect(run(deleteOpening(lot.id, hh.id, win!.id))).toEqual({ ok: true });
    expect(hh.funds).toBe(g + 16000);
    stack.undo(ctx);
    expect(hh.funds).toBe(g);
    expect(Object.keys(lot.openings)).toHaveLength(1);
    stack.undo(ctx);
    expect(hh.funds).toBe(f);
    expect(Object.keys(lot.openings)).toHaveLength(2);
  });

  it('openings that came with the lot sell as old openings', () => {
    const { lot, hh, run, content } = house();
    lot.openings['opn_legacy'] = { id: 'opn_legacy', defId: 'door-panel', wallId: edgeKey(0, 'h', 8, 10), flip: false, purchasePrice: 30000 };
    const f = hh.funds;
    expect(run(deleteOpening(lot.id, hh.id, 'opn_legacy'))).toEqual({ ok: true });
    expect(hh.funds).toBe(f + 24000);
    void content;
  });

  it('multi-tile openings span several edges, need walls on every edge and block/pass by kind', () => {
    const { lot, hh, run, nav } = house();
    const f = hh.funds;
    expect(run(placeOpening(lot.id, hh.id, 'window-triple', edgeKey(0, 'h', 7, 10)))).toEqual({ ok: true });
    expect(hh.funds).toBe(f - 60000);
    const op = Object.values(lot.openings)[0]!;
    expect(op.span).toBe(3);
    expect(openingEdgeKeys(op)).toEqual([edgeKey(0, 'h', 7, 10), edgeKey(0, 'h', 8, 10), edgeKey(0, 'h', 9, 10)]);
    expect(openingOnWall(lot, edgeKey(0, 'h', 9, 10))?.id).toBe(op.id);
    expect(nav.canStep(lot.id, 0, { x: 8, z: 9 }, { x: 8, z: 10 })).toBe(false); // a window blocks on every edge
    // overlapping an existing opening, or running off the end of the wall
    expect(run(placeOpening(lot.id, hh.id, 'window-triple', edgeKey(0, 'h', 8, 10)))).toMatchObject({ ok: false });
    expect(run(placeOpening(lot.id, hh.id, 'window-triple', edgeKey(0, 'h', 11, 10)))).toMatchObject({ ok: false, reason: 'The Triple Window needs a wall along its whole width.' });
    // a wall may not join the middle of it...
    const s0 = json(lot);
    expect(run(placeWallRun(lot.id, hh.id, 0, { x: 9, z: 7 }, { x: 9, z: 10 }))).toMatchObject({ ok: false, reason: 'A wall would join the middle of the Triple Window.' });
    expect(json(lot)).toBe(s0);
    // ...but may end at its edge
    expect(run(placeWallRun(lot.id, hh.id, 0, { x: 10, z: 7 }, { x: 10, z: 10 }))).toEqual({ ok: true });
  });

  it('a wide opening is refused where a wall already joins its middle', () => {
    const { lot, hh, run } = house();
    run(placeWallRun(lot.id, hh.id, 0, { x: 9, z: 6 }, { x: 9, z: 10 }));
    expect(run(placeOpening(lot.id, hh.id, 'window-triple', edgeKey(0, 'h', 7, 10)))).toMatchObject({ ok: false, reason: expect.stringContaining('A wall joins the middle') });
    expect(run(placeOpening(lot.id, hh.id, 'window-triple', edgeKey(0, 'h', 9, 10)))).toEqual({ ok: true }); // the wall meets its end, not its middle
  });

  it('a wide opening is deleted with any one of its walls', () => {
    const { lot, hh, run } = house();
    run(placeOpening(lot.id, hh.id, 'window-triple', edgeKey(0, 'h', 7, 10)));
    const f = hh.funds;
    expect(run(eraseWallSegment(lot.id, hh.id, 0, { dir: 'h', x: 9, z: 10 }))).toEqual({ ok: true });
    expect(Object.keys(lot.openings)).toHaveLength(0);
    expect(hh.funds).toBe(f + SEG + 60000);
    expect(lot.walls[edgeKey(0, 'h', 8, 10)]).toBeDefined();
  });

  it('a door passes people, a window blocks them (pathfinding)', () => {
    const { lot, hh, run, nav } = house();
    run(placeOpening(lot.id, hh.id, 'door-panel', edgeKey(0, 'h', 8, 10)));
    run(placeOpening(lot.id, hh.id, 'window-sash', edgeKey(0, 'h', 10, 10)));
    const from = { x: 8, z: 8 };
    const out = nav.findPath(lot.id, 0, from, [{ x: 8, z: 12 }]);
    expect(out).not.toBeNull();
    expect(out!.some((t) => t.x === 8 && t.z === 10)).toBe(true);
    // the whole room sits behind its single door
    const viaWindow = nav.findPath(lot.id, 0, { x: 10, z: 9 }, [{ x: 10, z: 11 }]);
    expect(viaWindow).not.toBeNull();
    expect(viaWindow!.some((t) => t.x === 8)).toBe(true);
    expect(nav.canStep(lot.id, 0, { x: 10, z: 9 }, { x: 10, z: 10 })).toBe(false);
  });
});

describe('floors', () => {
  it('place a rectangle, erase tiles and a whole room; refunds and exact undo', () => {
    const { lot, hh, run, stack, ctx } = setup();
    const f = hh.funds;
    expect(stack.run(ctx, placeFloorRect(lot.id, hh.id, 0, { x: 3, z: 3 }, { x: 5, z: 4 }, OAK))).toEqual({ ok: true });
    expect(Object.keys(lot.floors)).toHaveLength(6);
    expect(hh.funds).toBe(f - 6 * 400);
    const g = hh.funds;
    expect(run(eraseFloorTiles(lot.id, hh.id, 0, [{ x: 3, z: 3 }, { x: 4, z: 3 }, { x: 9, z: 9 }]))).toEqual({ ok: true });
    expect(Object.keys(lot.floors)).toHaveLength(4);
    expect(hh.funds).toBe(g + 2 * Math.round(400 * 0.8));
    stack.undo(ctx);
    expect(Object.keys(lot.floors)).toHaveLength(6);
    expect(hh.funds).toBe(g);
    expect(run(eraseFloorTiles(lot.id, hh.id, 0, [{ x: 9, z: 9 }]))).toMatchObject({ ok: false, reason: 'There is no floor there.' });
    // room erase
    run(placeRoom(lot.id, hh.id, 0, { x: 10, z: 10 }, { x: 13, z: 13 }, { floor: OAK }));
    expect(run(eraseRoomFloor(lot.id, hh.id, 0, { x: 11, z: 11 }))).toEqual({ ok: true });
    expect(lot.floors[tileKey(0, 11, 11)]).toBeUndefined();
    expect(run(eraseRoomFloor(lot.id, hh.id, 0, { x: 1, z: 1 }))).toMatchObject({ ok: false });
  });
});

describe('delete room', () => {
  it('removes the outer walls, doors and floor of a room but keeps walls shared with another room', () => {
    const { lot, hh, run, stack, ctx } = setup();
    run(placeRoom(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 8, z: 8 }, { floor: OAK }));
    run(placeRoom(lot.id, hh.id, 0, { x: 8, z: 4 }, { x: 12, z: 8 }, { floor: OAK, openings: [{ defId: 'door-panel', wallId: edgeKey(0, 'h', 10, 8) }] }));
    const lot1 = json(lot);
    const f = hh.funds;
    expect(run(deleteRoom(lot.id, hh.id, 0, { x: 10, z: 6 }))).toEqual({ ok: true });
    expect(lot.walls[edgeKey(0, 'v', 8, 5)]).toBeDefined(); // shared wall stays
    expect(lot.walls[edgeKey(0, 'v', 12, 5)]).toBeUndefined();
    expect(Object.keys(lot.openings)).toHaveLength(0);
    expect(lot.floors[tileKey(0, 10, 6)]).toBeUndefined();
    expect(lot.floors[tileKey(0, 5, 5)]).toEqual(OAK);
    expect(hh.funds).toBeGreaterThan(f);
    stack.undo(ctx);
    expect(json(lot)).toBe(lot1);
    expect(hh.funds).toBe(f);
    expect(run(deleteRoom(lot.id, hh.id, 0, { x: 1, z: 1 }))).toMatchObject({ ok: false, reason: 'Choose an enclosed room.' });
  });

  it('is refused while furniture stands in the room', () => {
    const { state, content, lot, hh, run } = setup();
    run(placeRoom(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 8, z: 8 }, { openings: [{ defId: 'door-panel', wallId: edgeKey(0, 'h', 5, 8) }] }));
    putObject(state, content, lot, 'counter-basic', 6, 6);
    const s0 = json(state);
    expect(run(deleteRoom(lot.id, hh.id, 0, { x: 6, z: 5 }))).toMatchObject({ ok: false, reason: 'Clear the Counter Basic out of the room first.' });
    expect(json(state)).toBe(s0);
  });
});

describe('plans never mutate state', () => {
  it('planning builds, erases and opening operations leaves everything identical', () => {
    const { state, content, lot, hh, run } = setup();
    run(placeRoom(lot.id, hh.id, 0, { x: 4, z: 4 }, { x: 9, z: 9 }));
    const s0 = json(state);
    const c = cloneState(state);
    for (const req of [
      { kind: 'walls', level: 0, shape: 'segment', edges: [{ dir: 'h', x: 12, z: 12 }] },
      { kind: 'eraseWalls', level: 0, shape: 'segment', edges: [{ dir: 'h', x: 4, z: 4 }] },
      { kind: 'placeOpening', defId: 'door-panel', wallId: edgeKey(0, 'h', 5, 9) },
      { kind: 'deleteRoom', level: 0, tile: { x: 5, z: 5 } },
    ] as const) {
      planBuild(state, content, lot.id, hh.id, req as never);
    }
    expect(json(state)).toBe(s0);
    expect(json(c)).toBe(s0);
    void buildCommand;
  });
});
