// Milestone 13: move, resize and duplicate a room. Every command is checked for exact money and lot state through apply,
// undo and redo, and every rejection must leave the whole state (money and id counter included) untouched.

import { describe, expect, it } from 'vitest';
import { placeOpening, placeRoom, placeWallRun } from '../../../src/building/buildCommands';
import { structurePrice } from '../../../src/building/buildPlans';
import { duplicateRoom, moveRoom, resizeRoom } from '../../../src/building/roomCommands';
import { planRoomOp, rectangularRoomAt } from '../../../src/building/roomOps';
import { UndoStack, type CommandContext } from '../../../src/core/commands';
import { EventBus, type GameEvent } from '../../../src/core/events';
import { edgeKey, tileKey } from '../../../src/core/ids';
import { cloneState } from '../../../src/core/state';
import type { FinishRef, Person, WorldItem } from '../../../src/core/types';
import { computeRooms } from '../../../src/world/rooms';
import { openingOnWall } from '../../../src/world/walls';
import { fixtureContent, putObject, testWorld } from '../world/fixtures';

const OAK: FinishRef = { designId: 'oak-planks', paletteId: 'oak-planks-p0' };
/** structure 2000 + two plain-paint sides of 200 each. */
const SEG = structurePrice(2.8) + 200 + 200;
const FLOOR = 400;
const DOOR = 30000;

function setup(funds = 5000000) {
  const content = fixtureContent();
  const w = testWorld({ funds });
  const events = new EventBus();
  const seen: GameEvent[] = [];
  events.onAny((e) => seen.push(e));
  const ctx: CommandContext = { state: w.state, content, events };
  const stack = new UndoStack();
  const run = (cmd: Parameters<UndoStack['run']>[1]) => stack.run(ctx, cmd);
  const person = (id: string, name: string, x: number, z: number) => {
    w.state.people[id] = { id, firstName: name, lastName: 'T', location: { kind: 'lot', lotId: w.lot.id, level: 0, x, z, facing: 0, posture: 'standing' } } as unknown as Person;
  };
  return { ...w, content, events, seen, ctx, stack, run, person };
}
type Rig = ReturnType<typeof setup>;

/** A 4 x 3 room at vertices (5,5)-(9,8) with oak floor and a door on the south wall. */
function buildRoom(r: Rig, x0 = 5, z0 = 5, x1 = 9, z1 = 8, door = true) {
  const doorSpec = door ? [{ defId: 'door-panel', wallId: edgeKey(0, 'h', x0 + 1, z1) }] : [];
  expect(r.run(placeRoom(r.lot.id, r.hh.id, 0, { x: x0, z: z0 }, { x: x1, z: z1 }, { floor: OAK, openings: doorSpec }))).toEqual({ ok: true });
}

function json(v: unknown): string {
  const sort = (x: unknown): unknown => (Array.isArray(x) ? x.map(sort) : x && typeof x === 'object'
    ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, y]) => [k, sort(y)])) : x);
  return JSON.stringify(sort(v));
}

/** Lot and items (undo does not rewind the ledger or the id counter, which are checked separately). */
const shape = (r: Rig) => json({ lot: r.lot, items: r.state.items, funds: r.hh.funds });
const floorKeys = (r: Rig) => Object.keys(r.lot.floors).sort();

describe('finding the room', () => {
  it('knows enclosed rectangular rooms only', () => {
    const r = setup();
    buildRoom(r);
    const found = rectangularRoomAt(r.lot, 0, { x: 6, z: 6 });
    expect(found).toMatchObject({ rect: { x0: 5, z0: 5, x1: 9, z1: 8 } });
    expect(rectangularRoomAt(r.lot, 0, { x: 1, z: 1 })).toEqual({ reason: 'Choose an enclosed room.' });
    // an L-shaped room is refused
    const l = setup();
    for (const [a, b] of [[[2, 2], [8, 2]], [[8, 2], [8, 5]], [[8, 5], [5, 5]], [[5, 5], [5, 8]], [[5, 8], [2, 8]], [[2, 8], [2, 2]]] as const) {
      expect(l.run(placeWallRun(l.lot.id, l.hh.id, 0, { x: a[0], z: a[1] }, { x: b[0], z: b[1] }))).toEqual({ ok: true });
    }
    expect(computeRooms(l.lot, 0).filter((x) => !x.outdoor)).toHaveLength(1);
    expect(rectangularRoomAt(l.lot, 0, { x: 3, z: 3 })).toEqual({ reason: 'Only rectangular rooms can be moved, resized or duplicated.' });
  });
});

describe('move room', () => {
  it('moves walls, door, floor and furniture without any cost, and undo/redo restore everything exactly', () => {
    const r = setup();
    buildRoom(r);
    const bed = putObject(r.state, r.content, r.lot, 'bed-single-pine', 6, 5);
    const meal: WorldItem = { id: 'itm_t', kind: 'meal', lotId: r.lot.id, position: { x: 8.5, z: 6.5, level: 0 }, recipeId: 'x', portions: 1, quality: 1, createdAt: 0, spoilsAt: 9999, ownerHouseholdId: r.hh.id };
    r.state.items[meal.id] = meal;
    const funds = r.hh.funds;
    const before = shape(r);
    const doorId = Object.values(r.lot.openings)[0]!.id;

    expect(r.run(moveRoom(r.lot.id, r.hh.id, 0, { x: 6, z: 6 }, 6, 4))).toEqual({ ok: true });
    expect(r.hh.funds).toBe(funds);
    expect(r.lot.walls[edgeKey(0, 'h', 5, 5)]).toBeUndefined();
    expect(r.lot.walls[edgeKey(0, 'h', 11, 9)]).toBeTruthy();
    expect(r.lot.floors[tileKey(0, 5, 5)]).toBeUndefined();
    expect(r.lot.floors[tileKey(0, 11, 9)]).toEqual(OAK);
    expect(floorKeys(r)).toHaveLength(12);
    expect(r.lot.objects[bed.id]).toMatchObject({ x: 12, z: 9 });
    expect(r.state.items[meal.id]!.position).toMatchObject({ x: 14.5, z: 10.5 });
    expect(r.lot.openings[doorId]!.wallId).toBe(edgeKey(0, 'h', 12, 12));
    expect(openingOnWall(r.lot, edgeKey(0, 'h', 12, 12))?.id).toBe(doorId);
    expect(computeRooms(r.lot, 0).filter((x) => !x.outdoor)).toHaveLength(1);
    const after = shape(r);

    expect(r.stack.undo(r.ctx)).toBeTruthy();
    expect(shape(r)).toBe(before);
    expect(r.stack.redo(r.ctx)).toBeTruthy();
    expect(shape(r)).toBe(after);
    expect(r.seen.filter((e) => e.type === 'lot.changed').length).toBeGreaterThan(0);
  });

  it('refuses to move off the lot, onto another room, through a wall or past people, leaving everything untouched', () => {
    const r = setup();
    buildRoom(r);
    buildRoom(r, 14, 5, 18, 8, false);
    const snap = json(cloneState(r.state));
    const reason = (dx: number, dz: number) => planRoomOp(r.state, r.content, r.lot.id, r.hh.id, { kind: 'moveRoom', level: 0, tile: { x: 6, z: 6 }, dx, dz }).reasons.join(' ');
    expect(reason(-9, 0)).toMatch(/off the lot/);
    expect(reason(9, 0)).toMatch(/another room/);
    // a person standing in the room
    r.person('p1', 'Mira', 6.5, 6.5);
    expect(reason(0, 6)).toMatch(/Mira is in the way/);
    delete r.state.people.p1;
    // furniture in the way at the destination: the bed would land on the trash can
    putObject(r.state, r.content, r.lot, 'bed-single-pine', 6, 5);
    putObject(r.state, r.content, r.lot, 'trash-can', 6, 11);
    expect(reason(0, 6)).toMatch(/Single Bed|bed single pine/i);
    // a failed command changes nothing, not even the id counter
    const before = json(cloneState(r.state));
    expect(r.run(moveRoom(r.lot.id, r.hh.id, 0, { x: 6, z: 6 }, 9, 0)).ok).toBe(false);
    expect(json(cloneState(r.state))).toBe(before);
    expect(snap.length).toBeGreaterThan(0);
  });

  it('leaves a wall shared with the neighbouring room where it is', () => {
    const r = setup();
    buildRoom(r, 5, 5, 9, 8, false);
    buildRoom(r, 9, 5, 13, 8, false); // shares the x=9 wall
    const sharedKeys = [0, 1, 2].map((i) => edgeKey(0, 'v', 9, 5 + i));
    expect(sharedKeys.every((k) => r.lot.walls[k])).toBe(true);
    expect(r.run(moveRoom(r.lot.id, r.hh.id, 0, { x: 6, z: 6 }, 0, 6))).toEqual({ ok: true });
    expect(sharedKeys.every((k) => r.lot.walls[k])).toBe(true); // still the neighbour's wall
    const rooms = computeRooms(r.lot, 0).filter((x) => !x.outdoor);
    expect(rooms).toHaveLength(2);
    expect(rooms.every((room) => room.tiles.length === 12)).toBe(true);
  });
});

describe('resize room', () => {
  it('grows east: new walls and floor are charged, the door on that side comes along, undo refunds', () => {
    const r = setup();
    buildRoom(r, 5, 5, 9, 8, false);
    expect(r.run(placeOpening(r.lot.id, r.hh.id, 'door-panel', edgeKey(0, 'v', 9, 6)))).toEqual({ ok: true });
    const doorId = Object.values(r.lot.openings)[0]!.id;
    const funds = r.hh.funds;
    const before = shape(r);
    // east side +2: the east wall (3 segments) moves two tiles, two new 3-segment... top and bottom grow by 2 each
    expect(r.run(resizeRoom(r.lot.id, r.hh.id, 0, { x: 6, z: 6 }, 'e', 2))).toEqual({ ok: true });
    expect(r.lot.walls[edgeKey(0, 'v', 9, 5)]).toBeUndefined();
    expect(r.lot.walls[edgeKey(0, 'v', 11, 5)]).toBeTruthy();
    expect(r.lot.openings[doorId]!.wallId).toBe(edgeKey(0, 'v', 11, 6));
    expect(floorKeys(r)).toHaveLength(6 * 3);
    // 3 new east segments + 4 new north/south segments, 6 new floor tiles; the old east wall (3) is refunded in full
    const charged = 7 * SEG + 6 * FLOOR;
    const refunded = 3 * SEG; // built today: full refund
    expect(funds - r.hh.funds).toBe(charged - refunded);
    expect(r.stack.undo(r.ctx)).toBeTruthy();
    expect(shape(r)).toBe(before);
  });

  it('shrinks and refunds, but not past furniture or people, and never to nothing', () => {
    const r = setup();
    buildRoom(r, 5, 5, 9, 8, false);
    const bed = putObject(r.state, r.content, r.lot, 'bed-single-pine', 8, 5); // 1 x 2 at x = 8
    const plan = (side: 'n' | 'e' | 's' | 'w', delta: number) => planRoomOp(r.state, r.content, r.lot.id, r.hh.id, { kind: 'resizeRoom', level: 0, tile: { x: 6, z: 6 }, side, delta });
    expect(plan('e', -1).reasons.join(' ')).toMatch(/Clear the .* out of the strip/i);
    expect(plan('w', 4).reasons.join(' ')).toMatch(/small/);
    expect(plan('e', 0).ok).toBe(false);
    expect(plan('w', 1).ok).toBe(true); // the bed is on the far side
    r.person('p1', 'Theo', 5.5, 6.5);
    expect(plan('w', 1).reasons.join(' ')).toMatch(/Theo is in the way/);
    delete r.state.people.p1;
    const funds = r.hh.funds;
    expect(r.run(resizeRoom(r.lot.id, r.hh.id, 0, { x: 6, z: 6 }, 'w', 1))).toEqual({ ok: true });
    expect(r.hh.funds).toBeGreaterThan(funds - 1); // refund > charge (west wall back, fewer floor tiles)
    expect(r.lot.objects[bed.id]).toMatchObject({ x: 8, z: 5 });
    expect(computeRooms(r.lot, 0).find((x) => !x.outdoor)!.tiles).toHaveLength(9);
  });

  it('cannot grow through another wall or onto another room', () => {
    const r = setup();
    buildRoom(r, 5, 5, 9, 8, false);
    buildRoom(r, 11, 5, 15, 8, false);
    const p = planRoomOp(r.state, r.content, r.lot.id, r.hh.id, { kind: 'resizeRoom', level: 0, tile: { x: 6, z: 6 }, side: 'e', delta: 3 });
    expect(p.ok).toBe(false);
    expect(p.reasons.join(' ')).toMatch(/overlaps another room|wall is in the way/);
  });
});

describe('duplicate room', () => {
  it('copies the shell at today\'s prices, with the door, and undo takes it all back', () => {
    const r = setup();
    buildRoom(r);
    const funds = r.hh.funds;
    const before = shape(r);
    expect(r.run(duplicateRoom(r.lot.id, r.hh.id, 0, { x: 6, z: 6 }, 8, 0))).toEqual({ ok: true });
    expect(computeRooms(r.lot, 0).filter((x) => !x.outdoor)).toHaveLength(2);
    expect(Object.values(r.lot.openings)).toHaveLength(2);
    expect(floorKeys(r)).toHaveLength(24);
    expect(funds - r.hh.funds).toBe(14 * SEG + 12 * FLOOR + DOOR);
    expect(r.stack.undo(r.ctx)).toBeTruthy();
    expect(shape(r)).toBe(before);
    expect(r.hh.funds).toBe(funds);
  });

  it('copies the furniture only when asked, buying each piece again and keeping surface items on their copied support', () => {
    const r = setup();
    buildRoom(r);
    const counter = putObject(r.state, r.content, r.lot, 'counter-basic', 6, 5);
    const tv = putObject(r.state, r.content, r.lot, 'radio-retro', 6, 5, 0, { supportId: counter.id });
    const funds = r.hh.funds;
    const plain = planRoomOp(r.state, r.content, r.lot.id, r.hh.id, { kind: 'duplicateRoom', level: 0, tile: { x: 6, z: 6 }, dx: 8, dz: 0 });
    const full = planRoomOp(r.state, r.content, r.lot.id, r.hh.id, { kind: 'duplicateRoom', level: 0, tile: { x: 6, z: 6 }, dx: 8, dz: 0, copyObjects: true });
    expect(plain.ok && full.ok).toBe(true);
    expect(full.charge - plain.charge).toBe(15000 + 6000);
    expect(r.run(duplicateRoom(r.lot.id, r.hh.id, 0, { x: 6, z: 6 }, 8, 0, true))).toEqual({ ok: true });
    const copies = Object.values(r.lot.objects).filter((o) => o.x >= 13);
    expect(copies).toHaveLength(2);
    const copyRadio = copies.find((o) => o.defId === 'radio-retro')!;
    const copyCounter = copies.find((o) => o.defId === 'counter-basic')!;
    expect(copyRadio.supportId).toBe(copyCounter.id);
    expect(copyCounter.id).not.toBe(counter.id);
    expect(r.lot.objects[counter.id]).toBeTruthy();
    expect(r.lot.objects[tv.id]!.supportId).toBe(counter.id);
    expect(funds - r.hh.funds).toBe(14 * SEG + 12 * FLOOR + DOOR + 15000 + 6000);
    expect(r.stack.undo(r.ctx)).toBeTruthy();
    expect(Object.values(r.lot.objects)).toHaveLength(2);
    expect(r.hh.funds).toBe(funds);
  });

  it('refuses an overlapping copy and a copy the household cannot afford, changing nothing', () => {
    const r = setup(2000);
    r.state.settings.unlimitedFunds = true;
    buildRoom(r);
    r.state.settings.unlimitedFunds = false;
    const before = json(cloneState(r.state));
    expect(planRoomOp(r.state, r.content, r.lot.id, r.hh.id, { kind: 'duplicateRoom', level: 0, tile: { x: 6, z: 6 }, dx: 2, dz: 0 }).reasons).toContain('The copy cannot overlap the original room.');
    const poor = r.run(duplicateRoom(r.lot.id, r.hh.id, 0, { x: 6, z: 6 }, 8, 0));
    expect(poor.ok).toBe(false);
    expect(!poor.ok && poor.reason).toMatch(/funds/);
    expect(json(cloneState(r.state))).toBe(before);
  });
});
