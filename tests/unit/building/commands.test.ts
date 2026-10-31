import { describe, expect, it } from 'vitest';
import {
  buyObject, moveObject, paintFloorTiles, paintRoomFloor, paintRoomWalls, paintWallSide, placeFromInventory, sellObject,
  setObjectFinish, storeObject,
} from '../../../src/building/commands';
import { saleValue } from '../../../src/building/plans';
import { MINUTES_PER_DAY } from '../../../src/core/clock';
import { UndoStack, type CommandContext } from '../../../src/core/commands';
import { EventBus, type GameEvent } from '../../../src/core/events';
import { tileKey } from '../../../src/core/ids';
import { addHousehold, cloneState } from '../../../src/core/state';
import type { FinishRef, StartMode } from '../../../src/core/types';
import { addOpening, addRectWalls, addWallRun } from '../../../src/world/walls';
import { fixtureContent, putObject, testWorld } from '../world/fixtures';

const PAINT0: FinishRef = { designId: 'plain-paint', paletteId: 'plain-paint-p0' };
const PAINT1: FinishRef = { designId: 'plain-paint', paletteId: 'plain-paint-p1' };
const TILE: FinishRef = { designId: 'subway-tile', paletteId: 'subway-tile-p0' };
const STRIPES: FinishRef = { designId: 'stripes-regency', paletteId: 'stripes-regency-p1' };
const OAK: FinishRef = { designId: 'oak-planks', paletteId: 'oak-planks-p0' };
const CHECKER: FinishRef = { designId: 'checker-tile', paletteId: 'checker-tile-p1' };

/** A household on a lot with a two-room house: west room x 4..6, east room x 7..9, z 4..7, door between. */
function setup(o: { funds?: number; mode?: StartMode } = {}) {
  const content = fixtureContent();
  const w = testWorld(o);
  addRectWalls(w.lot, 0, 4, 4, 10, 8, { a: PAINT0, b: PAINT0 });
  addWallRun(w.lot, 0, { x: 7, z: 4 }, { x: 7, z: 8 }, { a: PAINT0, b: PAINT0 });
  addOpening(w.state, w.lot, content.openings['door-panel']!, '0:v:7:5');
  addOpening(w.state, w.lot, content.openings['door-glazed']!, '0:h:5:8');
  const events = new EventBus();
  const seen: GameEvent[] = [];
  events.onAny((e) => seen.push(e));
  const ctx: CommandContext = { state: w.state, content, events };
  const stack = new UndoStack();
  return { ...w, content, events, seen, ctx, stack };
}

const snap = (v: unknown) => JSON.stringify(v);

describe('buy, undo, redo', () => {
  it('charges def.price once, undo refunds exactly and removes the object, redo restores the same object', () => {
    const { state, lot, hh, ctx, stack, seen } = setup();
    const start = hh.funds;
    const r = stack.run(ctx, buyObject(lot.id, hh.id, { defId: 'fridge-standard', x: 14, z: 14, rot: 0, level: 0 }));
    expect(r).toEqual({ ok: true });
    const placed = Object.values(lot.objects);
    expect(placed).toHaveLength(1);
    const obj = placed[0]!;
    expect(obj).toMatchObject({ defId: 'fridge-standard', x: 14, z: 14, rot: 0, purchasePrice: 80000, ownerHouseholdId: hh.id, finishes: { wood: 'oak' } });
    expect(hh.funds).toBe(start - 80000);
    expect(hh.ledger.at(-1)).toMatchObject({ kind: 'purchase', amount: -80000 });
    expect(seen.some((e) => e.type === 'lot.changed' && e.lotId === lot.id && e.what === 'objects')).toBe(true);
    expect(stack.peekUndo()).toBe('Buy Fridge Standard');

    expect(stack.undo(ctx)).toBe('Buy Fridge Standard');
    expect(lot.objects[obj.id]).toBeUndefined();
    expect(hh.funds).toBe(start);
    expect(hh.ledger.at(-1)).toMatchObject({ kind: 'refund', amount: 80000 });

    expect(stack.redo(ctx)).toEqual({ ok: true });
    expect(lot.objects[obj.id]).toEqual(obj);
    expect(hh.funds).toBe(start - 80000);
    stack.undo(ctx);
    expect(hh.funds).toBe(start);
    expect(state.lots[lot.id]!.objects).toEqual({});
  });

  it('applies chosen finishes and rejects unknown ones without any change', () => {
    const { state, lot, hh, ctx } = setup();
    const ok = buyObject(lot.id, hh.id, { defId: 'desk-oak', x: 14, z: 14, rot: 0, level: 0, finishes: { wood: 'walnut' } });
    expect(ok.apply(ctx).ok).toBe(true);
    expect(Object.values(lot.objects)[0]!.finishes).toEqual({ wood: 'walnut' });
    const before = snap(state);
    expect(buyObject(lot.id, hh.id, { defId: 'desk-oak', x: 14, z: 16, rot: 0, level: 0, finishes: { wood: 'gold' } }).apply(ctx).ok).toBe(false);
    expect(buyObject(lot.id, hh.id, { defId: 'desk-oak', x: 14, z: 16, rot: 0, level: 0, finishes: { metal: 'oak' } }).apply(ctx).ok).toBe(false);
    expect(snap(state)).toBe(before);
  });

  it('rejects insufficient funds and invalid placements without any change', () => {
    const { state, lot, hh, ctx, stack } = setup({ funds: 5000 });
    const before = snap(state);
    const r = stack.run(ctx, buyObject(lot.id, hh.id, { defId: 'fridge-standard', x: 14, z: 14, rot: 0, level: 0 }));
    expect(r).toEqual({ ok: false, reason: 'Not enough household funds.' });
    expect(snap(state)).toBe(before);
    expect(stack.canUndo()).toBe(false);
    const r2 = stack.run(ctx, buyObject(lot.id, hh.id, { defId: 'trash-can', x: 5, z: 7, rot: 0, level: 0 })); // front door tile
    expect(r2.ok).toBe(false);
    expect(snap(state)).toBe(before);
  });

  it('rejects buying onto a standing person and editing another household\'s lot', () => {
    const { state, lot, hh, ctx } = setup();
    state.people['per_z'] = { firstName: 'Bo', location: { kind: 'lot', lotId: lot.id, level: 0, x: 14.5, z: 14.5, facing: 0, posture: 'walking' } } as unknown as (typeof state.people)[string];
    const r = buyObject(lot.id, hh.id, { defId: 'fridge-standard', x: 14, z: 14, rot: 0, level: 0 }).apply(ctx);
    expect(r).toEqual({ ok: false, reason: 'Bo is standing there.' });
    const other = addHousehold(state, 'Others', 100000000, null, false);
    const before = snap(state);
    expect(buyObject(lot.id, other.id, { defId: 'fridge-standard', x: 16, z: 16, rot: 0, level: 0 }).apply(ctx).ok).toBe(false);
    expect(paintRoomWalls(lot.id, other.id, 0, { x: 5, z: 5 }, TILE).apply(ctx).ok).toBe(false);
    expect(snap(state)).toBe(before);
  });

  it('sandbox purchases and paint are free; undo/redo stay exact', () => {
    const { lot, hh, ctx, stack } = setup({ mode: 'sandbox' });
    const start = hh.funds;
    expect(stack.run(ctx, buyObject(lot.id, hh.id, { defId: 'bed-double-oak', x: 14, z: 14, rot: 0, level: 0 })).ok).toBe(true);
    expect(stack.run(ctx, paintRoomWalls(lot.id, hh.id, 0, { x: 5, z: 5 }, TILE)).ok).toBe(true);
    expect(hh.funds).toBe(start);
    stack.undo(ctx);
    stack.undo(ctx);
    expect(hh.funds).toBe(start);
    stack.redo(ctx);
    expect(hh.funds).toBe(start);
  });
});

describe('sell and undo sale', () => {
  it('same-day sale returns the full price; undo restores the same object id, finishes and balance', () => {
    const { lot, hh, ctx, stack } = setup();
    const start = hh.funds;
    stack.run(ctx, buyObject(lot.id, hh.id, { defId: 'sofa-tweed', x: 14, z: 14, rot: 1, level: 0, finishes: { wood: 'walnut' } }));
    const sofa = Object.values(lot.objects)[0]!;
    const record = JSON.parse(JSON.stringify(sofa));
    expect(stack.run(ctx, sellObject(lot.id, hh.id, sofa.id)).ok).toBe(true);
    expect(lot.objects[sofa.id]).toBeUndefined();
    expect(hh.funds).toBe(start);
    expect(hh.ledger.at(-1)).toMatchObject({ kind: 'sale', amount: 60000 });
    stack.undo(ctx);
    expect(lot.objects[sofa.id]).toEqual(record);
    expect(hh.funds).toBe(start - 60000);
    stack.redo(ctx);
    expect(lot.objects[sofa.id]).toBeUndefined();
    expect(hh.funds).toBe(start);
  });

  it('later sales return 80 %; undoing the sale debits exactly the credited amount, also in the sandbox', () => {
    for (const mode of ['create', 'sandbox'] as const) {
      const { state, lot, hh, ctx, stack, content } = setup({ mode });
      const bed = putObject(state, content, lot, 'bed-double-oak', 14, 14, 0, { boughtAt: state.clock.minutes, ownerHouseholdId: hh.id });
      state.clock.minutes += MINUTES_PER_DAY;
      expect(saleValue(state, bed)).toBe(72000);
      const start = hh.funds;
      stack.run(ctx, sellObject(lot.id, hh.id, bed.id));
      expect(hh.funds).toBe(start + 72000);
      stack.undo(ctx);
      expect(hh.funds).toBe(start);
      expect(lot.objects[bed.id]).toEqual(bed);
    }
  });

  it('starter furnishings (bought the day before) sell at the depreciated value', () => {
    const { state, lot, hh, ctx, content } = setup();
    const chair = putObject(state, content, lot, 'chair-dining-oak', 14, 14, 0, { boughtAt: state.clock.minutes - MINUTES_PER_DAY });
    const start = hh.funds;
    sellObject(lot.id, hh.id, chair.id).apply(ctx);
    expect(hh.funds).toBe(start + 6400);
  });

  it('keeps changed finishes through sell and undo', () => {
    const { lot, hh, ctx, stack } = setup();
    stack.run(ctx, buyObject(lot.id, hh.id, { defId: 'desk-oak', x: 14, z: 14, rot: 0, level: 0 }));
    const desk = Object.values(lot.objects)[0]!;
    expect(stack.run(ctx, setObjectFinish(lot.id, hh.id, desk.id, 'wood', 'walnut')).ok).toBe(true);
    stack.run(ctx, sellObject(lot.id, hh.id, desk.id));
    stack.undo(ctx);
    expect(lot.objects[desk.id]!.finishes).toEqual({ wood: 'walnut' });
    stack.undo(ctx);
    expect(lot.objects[desk.id]!.finishes).toEqual({ wood: 'oak' });
  });

  it('rejects moving, selling or storing an object that holds surface items or food', () => {
    const { state, lot, hh, ctx, stack, content } = setup();
    stack.run(ctx, buyObject(lot.id, hh.id, { defId: 'tv-stand-low', x: 14, z: 14, rot: 0, level: 0 }));
    const stand = Object.values(lot.objects)[0]!;
    expect(stack.run(ctx, buyObject(lot.id, hh.id, { defId: 'tv-flatscreen', x: 14, z: 14, rot: 0, level: 0 })).ok).toBe(true);
    const tv = Object.values(lot.objects).find((o) => o.defId === 'tv-flatscreen')!;
    expect(tv.supportId).toBe(stand.id);
    const before = snap(state);
    expect(sellObject(lot.id, hh.id, stand.id).apply(ctx)).toEqual({ ok: false, reason: 'Take the Tv Flatscreen off it first.' });
    expect(moveObject(lot.id, stand.id, { x: 16, z: 16, rot: 0, level: 0 }).apply(ctx).ok).toBe(false);
    expect(storeObject(lot.id, hh.id, stand.id).apply(ctx).ok).toBe(false);
    expect(snap(state)).toBe(before);
    // the TV itself can be moved along the stand
    expect(stack.run(ctx, moveObject(lot.id, tv.id, { x: 15, z: 14, rot: 0, level: 0 })).ok).toBe(true);
    stack.undo(ctx);
    // a served meal on a counter blocks selling the counter
    const counter = putObject(state, content, lot, 'counter-basic', 18, 18);
    state.items['itm_1'] = { id: 'itm_1', kind: 'meal', lotId: lot.id, position: { x: 18.5, z: 18.5, level: 0, onObjectId: counter.id }, recipeId: 'r', portions: 2, quality: 1, createdAt: 0, spoilsAt: 999, ownerHouseholdId: hh.id };
    expect(sellObject(lot.id, hh.id, counter.id).apply(ctx)).toEqual({ ok: false, reason: 'Clear the food off it first.' });
  });
});

describe('move, rotate, store, place from inventory', () => {
  it('moves and rotates with exact undo/redo and rejects invalid targets unchanged', () => {
    const { state, lot, hh, ctx, stack } = setup();
    stack.run(ctx, buyObject(lot.id, hh.id, { defId: 'desk-oak', x: 14, z: 14, rot: 0, level: 0 }));
    stack.run(ctx, buyObject(lot.id, hh.id, { defId: 'fridge-standard', x: 18, z: 14, rot: 0, level: 0 }));
    const desk = Object.values(lot.objects).find((o) => o.defId === 'desk-oak')!;
    const funds = hh.funds;
    expect(stack.run(ctx, moveObject(lot.id, desk.id, { x: 15, z: 16, rot: 0, level: 0 })).ok).toBe(true);
    expect(desk).toMatchObject({ x: 15, z: 16, rot: 0 });
    expect(stack.run(ctx, moveObject(lot.id, desk.id, { x: 15, z: 16, rot: 1, level: 0 })).ok).toBe(true);
    expect(stack.peekUndo()).toBe('Rotate Desk Oak');
    expect(desk).toMatchObject({ x: 15, z: 16, rot: 1 });
    expect(hh.funds).toBe(funds);
    stack.undo(ctx);
    expect(desk).toMatchObject({ x: 15, z: 16, rot: 0 });
    stack.undo(ctx);
    expect(desk).toMatchObject({ x: 14, z: 14, rot: 0 });
    stack.redo(ctx);
    expect(desk).toMatchObject({ x: 15, z: 16, rot: 0 });
    const before = snap(state);
    expect(moveObject(lot.id, desk.id, { x: 17, z: 14, rot: 0, level: 0 }).apply(ctx).ok).toBe(false); // onto the fridge
    expect(moveObject(lot.id, desk.id, { x: 23, z: 14, rot: 0, level: 0 }).apply(ctx).ok).toBe(false); // off the lot
    expect(moveObject(lot.id, desk.id, { x: 15, z: 16, rot: 0, level: 0 }).apply(ctx).ok).toBe(false); // no change
    expect(snap(state)).toBe(before);
  });

  it('stores into the inventory and places back with the same identity; undo restores slots exactly', () => {
    const { lot, hh, ctx, stack } = setup();
    stack.run(ctx, buyObject(lot.id, hh.id, { defId: 'armchair-lounge', x: 14, z: 14, rot: 2, level: 0, finishes: { wood: 'walnut' } }));
    stack.run(ctx, buyObject(lot.id, hh.id, { defId: 'trash-can', x: 18, z: 18, rot: 0, level: 0 }));
    const chair = Object.values(lot.objects).find((o) => o.defId === 'armchair-lounge')!;
    const can = Object.values(lot.objects).find((o) => o.defId === 'trash-can')!;
    const funds = hh.funds;
    stack.run(ctx, storeObject(lot.id, hh.id, can.id));
    stack.run(ctx, storeObject(lot.id, hh.id, chair.id));
    expect(hh.inventory.map((e) => e.object.id)).toEqual([can.id, chair.id]);
    expect(lot.objects[chair.id]).toBeUndefined();
    expect(stack.run(ctx, placeFromInventory(lot.id, hh.id, 0, { x: 12, z: 12, rot: 1, level: 0 })).ok).toBe(true);
    expect(lot.objects[can.id]).toMatchObject({ x: 12, z: 12, rot: 1 });
    expect(hh.inventory.map((e) => e.object.id)).toEqual([chair.id]);
    stack.undo(ctx);
    expect(hh.inventory.map((e) => e.object.id)).toEqual([can.id, chair.id]);
    expect(lot.objects[can.id]).toBeUndefined();
    stack.undo(ctx);
    stack.undo(ctx);
    expect(hh.inventory).toEqual([]);
    expect(lot.objects[chair.id]).toMatchObject({ x: 14, z: 14, rot: 2, finishes: { wood: 'walnut' } });
    expect(lot.objects[can.id]).toMatchObject({ x: 18, z: 18 });
    expect(hh.funds).toBe(funds);
    expect(placeFromInventory(lot.id, hh.id, 3, { x: 12, z: 12, rot: 0, level: 0 }).apply(ctx).ok).toBe(false);
  });
});

describe('wall and floor paint', () => {
  it('paints wall side A and B independently; adjacent edits keep the other side', () => {
    const { lot, hh, ctx, stack } = setup();
    const wallId = '0:v:7:6'; // shared wall between the rooms
    const start = hh.funds;
    expect(stack.run(ctx, paintWallSide(lot.id, hh.id, wallId, 'a', TILE)).ok).toBe(true);
    expect(stack.run(ctx, paintWallSide(lot.id, hh.id, wallId, 'b', STRIPES)).ok).toBe(true);
    expect(lot.walls[wallId]!.sideA).toEqual(TILE);
    expect(lot.walls[wallId]!.sideB).toEqual(STRIPES);
    expect(hh.funds).toBe(start - 500 - 400);
    // painting the west room (side a of the shared wall) leaves side b alone
    expect(stack.run(ctx, paintRoomWalls(lot.id, hh.id, 0, { x: 5, z: 5 }, PAINT1)).ok).toBe(true);
    expect(lot.walls[wallId]!.sideA).toEqual(PAINT1);
    expect(lot.walls[wallId]!.sideB).toEqual(STRIPES);
    expect(lot.walls['0:v:7:4']!.sideB).toEqual(PAINT0);
    // and the neighbouring wall segment's sides are untouched on the east
    stack.undo(ctx);
    expect(lot.walls[wallId]!.sideA).toEqual(TILE);
    expect(lot.walls[wallId]!.sideB).toEqual(STRIPES);
    stack.undo(ctx);
    stack.undo(ctx);
    expect(lot.walls[wallId]!.sideA).toEqual(PAINT0);
    expect(lot.walls[wallId]!.sideB).toEqual(PAINT0);
    expect(hh.funds).toBe(start);
    expect(paintWallSide(lot.id, hh.id, wallId, 'a', PAINT0).apply(ctx).ok).toBe(false); // nothing changes
    expect(paintWallSide(lot.id, hh.id, '0:v:20:20', 'a', TILE).apply(ctx).ok).toBe(false);
    expect(paintWallSide(lot.id, hh.id, wallId, 'a', { designId: 'plain-paint', paletteId: 'nope' }).apply(ctx).ok).toBe(false);
    expect(paintWallSide(lot.id, hh.id, wallId, 'a', OAK).apply(ctx).ok).toBe(false); // floor design on a wall
  });

  it('room paint covers every side facing the room and charges only sides that change', () => {
    const { lot, hh, ctx, stack } = setup();
    // west room: x 4..6, z 4..7 -> 3 + 3 + 4 + 4 = 14 sides
    expect(stack.run(ctx, paintWallSide(lot.id, hh.id, '0:h:4:4', 'b', TILE)).ok).toBe(true);
    const start = hh.funds;
    expect(stack.run(ctx, paintRoomWalls(lot.id, hh.id, 0, { x: 6, z: 7 }, TILE)).ok).toBe(true);
    expect(hh.funds).toBe(start - 13 * 500);
    expect(lot.walls['0:h:4:4']!.sideA).toEqual(PAINT0); // outside unchanged
    for (const id of ['0:h:4:4', '0:h:5:4', '0:h:6:4']) expect(lot.walls[id]!.sideB).toEqual(TILE);
    for (const id of ['0:h:4:8', '0:h:5:8', '0:h:6:8']) expect(lot.walls[id]!.sideA).toEqual(TILE);
    for (const z of [4, 5, 6, 7]) {
      expect(lot.walls[`0:v:4:${z}`]!.sideB).toEqual(TILE);
      expect(lot.walls[`0:v:7:${z}`]!.sideA).toEqual(TILE);
      expect(lot.walls[`0:v:7:${z}`]!.sideB).toEqual(PAINT0); // east room untouched
    }
    expect(paintRoomWalls(lot.id, hh.id, 0, { x: 5, z: 5 }, TILE).apply(ctx).ok).toBe(false); // nothing left to change
    // painting the yard repaints the house exterior
    expect(stack.run(ctx, paintRoomWalls(lot.id, hh.id, 0, { x: 0, z: 0 }, { designId: 'brick-classic', paletteId: 'brick-classic-p1' })).ok).toBe(true);
    expect(lot.walls['0:h:4:4']!.sideA.designId).toBe('brick-classic');
    expect(lot.walls['0:h:4:4']!.sideB).toEqual(TILE);
  });

  it('floor paint charges only changed tiles; room fill fills indoor rooms only', () => {
    const { lot, hh, ctx, stack } = setup();
    const start = hh.funds;
    const four = [{ x: 4, z: 4 }, { x: 5, z: 4 }, { x: 4, z: 5 }, { x: 5, z: 5 }];
    expect(stack.run(ctx, paintFloorTiles(lot.id, hh.id, 0, four, OAK)).ok).toBe(true);
    expect(hh.funds).toBe(start - 4 * 400);
    const six = [...four, { x: 6, z: 4 }, { x: 6, z: 5 }, { x: 6, z: 5 }];
    expect(stack.run(ctx, paintFloorTiles(lot.id, hh.id, 0, six, OAK)).ok).toBe(true);
    expect(hh.funds).toBe(start - 6 * 400);
    const mid = hh.funds;
    expect(stack.run(ctx, paintRoomFloor(lot.id, hh.id, 0, { x: 6, z: 7 }, CHECKER)).ok).toBe(true);
    expect(hh.funds).toBe(mid - 12 * 300);
    expect(lot.floors[tileKey(0, 4, 4)]).toEqual(CHECKER);
    expect(lot.floors[tileKey(0, 8, 5)]).toBeUndefined(); // other room
    stack.undo(ctx);
    expect(lot.floors[tileKey(0, 4, 4)]).toEqual(OAK);
    expect(lot.floors[tileKey(0, 6, 7)]).toBeUndefined();
    expect(hh.funds).toBe(mid);
    stack.undo(ctx);
    stack.undo(ctx);
    expect(lot.floors).toEqual({});
    expect(hh.funds).toBe(start);
    expect(paintRoomFloor(lot.id, hh.id, 0, { x: 0, z: 0 }, OAK).apply(ctx).ok).toBe(false); // the yard
  });

  it('an invalid multi-tile operation leaves the state unchanged (deep equal)', () => {
    const { state, lot, hh, ctx } = setup();
    const before = cloneState(state);
    const r = paintFloorTiles(lot.id, hh.id, 0, [{ x: 4, z: 4 }, { x: 5, z: 4 }, { x: 24, z: 4 }], OAK).apply(ctx);
    expect(r).toEqual({ ok: false, reason: 'Some of those tiles are not on the lot.' });
    expect(state).toEqual(before);
    hh.funds = 1000;
    const poor = cloneState(state);
    expect(paintRoomFloor(lot.id, hh.id, 0, { x: 5, z: 5 }, OAK).apply(ctx)).toEqual({ ok: false, reason: 'Not enough household funds.' });
    expect(paintRoomWalls(lot.id, hh.id, 0, { x: 5, z: 5 }, TILE).apply(ctx).ok).toBe(false);
    expect(state).toEqual(poor);
  });

  it('redo refuses when the target changed meanwhile and leaves the state unchanged', () => {
    const { state, lot, hh, ctx } = setup();
    const cmd = paintFloorTiles(lot.id, hh.id, 0, [{ x: 4, z: 4 }], OAK);
    expect(cmd.apply(ctx).ok).toBe(true);
    cmd.revert(ctx);
    lot.floors[tileKey(0, 4, 4)] = { ...CHECKER };
    const before = snap(state);
    expect(cmd.reapply(ctx).ok).toBe(false);
    expect(snap(state)).toBe(before);
  });
});

describe('state integrity', () => {
  it('survives cloneState after a mix of commands and undo of everything restores lots and funds', () => {
    const { state, lot, hh, ctx, stack } = setup();
    const lotBefore = JSON.parse(JSON.stringify(lot));
    const start = hh.funds;
    stack.run(ctx, buyObject(lot.id, hh.id, { defId: 'tv-stand-low', x: 14, z: 14, rot: 0, level: 0 }));
    stack.run(ctx, buyObject(lot.id, hh.id, { defId: 'tv-flatscreen', x: 15, z: 14, rot: 0, level: 0 }));
    stack.run(ctx, buyObject(lot.id, hh.id, { defId: 'sofa-tweed', x: 14, z: 17, rot: 2, level: 0 }));
    const sofa = Object.values(lot.objects).find((o) => o.defId === 'sofa-tweed')!;
    stack.run(ctx, moveObject(lot.id, sofa.id, { x: 14, z: 18, rot: 2, level: 0 }));
    stack.run(ctx, paintRoomWalls(lot.id, hh.id, 0, { x: 8, z: 5 }, STRIPES));
    stack.run(ctx, paintRoomFloor(lot.id, hh.id, 0, { x: 8, z: 5 }, OAK));
    stack.run(ctx, sellObject(lot.id, hh.id, sofa.id));
    stack.run(ctx, storeObject(lot.id, hh.id, Object.values(lot.objects).find((o) => o.defId === 'tv-flatscreen')!.id));
    expect(cloneState(state)).toEqual(state);
    while (stack.canUndo()) stack.undo(ctx);
    expect(lot).toEqual(lotBefore);
    expect(hh.funds).toBe(start);
    expect(hh.inventory).toEqual([]);
    expect(cloneState(state)).toEqual(state);
  });
});
