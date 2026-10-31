import { describe, expect, it } from 'vitest';
import { EventBus } from '../../../src/core/events';
import { tileKey } from '../../../src/core/ids';
import type { Tile } from '../../../src/core/nav';
import { LotNav } from '../../../src/world/nav';
import { addOpening, addRectWalls, addWallRun, setWall } from '../../../src/world/walls';
import { fixtureContent, putObject, testWorld } from './fixtures';

const F = { designId: 'plain-paint', paletteId: 'plain-paint-p0' };
const FF = { a: F, b: F };

function setup() {
  const content = fixtureContent();
  const w = testWorld();
  const nav = new LotNav(() => w.state, content);
  return { ...w, content, nav };
}

/** Every consecutive pair in the route must be a legal step. */
function assertLegal(nav: LotNav, lotId: string, from: Tile, path: Tile[]) {
  let prev = from;
  for (const t of path) {
    expect(nav.canStep(lotId, 0, prev, t), `step (${prev.x},${prev.z}) -> (${t.x},${t.z})`).toBe(true);
    prev = t;
  }
}

describe('LotNav paths', () => {
  it('finds straight and diagonal routes on an open lot', () => {
    const { lot, nav } = setup();
    expect(nav.findPath(lot.id, 0, { x: 2, z: 2 }, [{ x: 5, z: 2 }])).toEqual([{ x: 3, z: 2 }, { x: 4, z: 2 }, { x: 5, z: 2 }]);
    const diag = nav.findPath(lot.id, 0, { x: 2, z: 2 }, [{ x: 5, z: 5 }]);
    expect(diag).toEqual([{ x: 3, z: 3 }, { x: 4, z: 4 }, { x: 5, z: 5 }]);
    expect(nav.findPath(lot.id, 0, { x: 2, z: 2 }, [{ x: 2, z: 2 }])).toEqual([]);
  });

  it('walls block edges; the route goes around', () => {
    const { lot, nav } = setup();
    setWall(lot, 0, 'v', 6, 5, FF);
    expect(nav.canStep(lot.id, 0, { x: 5, z: 5 }, { x: 6, z: 5 })).toBe(false);
    expect(nav.canStep(lot.id, 0, { x: 6, z: 5 }, { x: 5, z: 5 })).toBe(false);
    const path = nav.findPath(lot.id, 0, { x: 5, z: 5 }, [{ x: 6, z: 5 }])!;
    expect(path.length).toBeGreaterThan(1);
    assertLegal(nav, lot.id, { x: 5, z: 5 }, path);
  });

  it('a full wall line makes the far side unreachable; a door lets people through; a window does not', () => {
    const { state, lot, content, nav } = setup();
    addWallRun(lot, 0, { x: 10, z: 0 }, { x: 10, z: 24 }, FF);
    expect(nav.findPath(lot.id, 0, { x: 5, z: 5 }, [{ x: 15, z: 5 }])).toBeNull();

    addOpening(state, lot, content.openings['window-wide']!, '0:v:10:8');
    nav.invalidate(lot.id);
    expect(nav.findPath(lot.id, 0, { x: 5, z: 5 }, [{ x: 15, z: 5 }])).toBeNull();
    expect(nav.canStep(lot.id, 0, { x: 9, z: 8 }, { x: 10, z: 8 })).toBe(false);

    addOpening(state, lot, content.openings['door-panel']!, '0:v:10:12');
    nav.invalidate(lot.id);
    expect(nav.canStep(lot.id, 0, { x: 9, z: 12 }, { x: 10, z: 12 })).toBe(true);
    const path = nav.findPath(lot.id, 0, { x: 5, z: 5 }, [{ x: 15, z: 5 }])!;
    expect(path).not.toBeNull();
    expect(path).toContainEqual({ x: 9, z: 12 });
    expect(path).toContainEqual({ x: 10, z: 12 });
    assertLegal(nav, lot.id, { x: 5, z: 5 }, path);
  });

  it('never cuts a wall corner or a door frame diagonally', () => {
    const { state, lot, content, nav } = setup();
    setWall(lot, 0, 'v', 6, 5, FF); // stub between (5,5) and (6,5)
    expect(nav.canStep(lot.id, 0, { x: 5, z: 5 }, { x: 6, z: 4 })).toBe(false);
    expect(nav.canStep(lot.id, 0, { x: 5, z: 4 }, { x: 6, z: 5 })).toBe(false);
    expect(nav.canStep(lot.id, 0, { x: 5, z: 5 }, { x: 6, z: 6 })).toBe(false);
    expect(nav.canStep(lot.id, 0, { x: 5, z: 3 }, { x: 6, z: 4 })).toBe(true);
    const path = nav.findPath(lot.id, 0, { x: 5, z: 5 }, [{ x: 6, z: 4 }])!;
    expect(path).toEqual([{ x: 5, z: 4 }, { x: 6, z: 4 }]);
    // door frame: a door edge is passable orthogonally only
    setWall(lot, 0, 'v', 12, 5, FF);
    addOpening(state, lot, content.openings['door-panel']!, '0:v:12:5');
    nav.invalidate(lot.id);
    expect(nav.canStep(lot.id, 0, { x: 11, z: 5 }, { x: 12, z: 5 })).toBe(true);
    expect(nav.canStep(lot.id, 0, { x: 11, z: 5 }, { x: 12, z: 6 })).toBe(false);
    expect(nav.canStep(lot.id, 0, { x: 11, z: 4 }, { x: 12, z: 5 })).toBe(false);
  });

  it('blocking furniture blocks tiles and diagonals beside it; rugs and wall decor do not', () => {
    const { state, lot, content, nav } = setup();
    putObject(state, content, lot, 'fridge-standard', 6, 5);
    putObject(state, content, lot, 'rug-rectangle', 2, 10);
    expect(nav.isWalkable(lot.id, 0, 6, 5)).toBe(false);
    expect(nav.isWalkable(lot.id, 0, 3, 11)).toBe(true);
    expect(nav.canStep(lot.id, 0, { x: 5, z: 5 }, { x: 6, z: 5 })).toBe(false);
    expect(nav.canStep(lot.id, 0, { x: 5, z: 5 }, { x: 6, z: 6 })).toBe(false); // would cut the fridge's corner
    expect(nav.canStep(lot.id, 0, { x: 5, z: 4 }, { x: 6, z: 6 })).toBe(false); // not adjacent
    expect(nav.canStep(lot.id, 0, { x: 7, z: 4 }, { x: 6, z: 5 })).toBe(false); // onto the fridge
    expect(nav.canStep(lot.id, 0, { x: 5, z: 6 }, { x: 6, z: 7 })).toBe(true);
    expect(nav.findPath(lot.id, 0, { x: 5, z: 5 }, [{ x: 6, z: 5 }])).toBeNull();
    const around = nav.findPath(lot.id, 0, { x: 5, z: 5 }, [{ x: 7, z: 5 }])!;
    expect(around).not.toContainEqual({ x: 6, z: 5 });
    assertLegal(nav, lot.id, { x: 5, z: 5 }, around);
  });

  it('returns null for an enclosed goal and when every goal is blocked', () => {
    const { state, lot, content, nav } = setup();
    addRectWalls(lot, 0, 15, 15, 18, 18, FF);
    expect(nav.findPath(lot.id, 0, { x: 2, z: 2 }, [{ x: 16, z: 16 }])).toBeNull();
    putObject(state, content, lot, 'trash-can', 3, 3);
    nav.invalidate(lot.id);
    expect(nav.findPath(lot.id, 0, { x: 2, z: 2 }, [{ x: 3, z: 3 }])).toBeNull();
    expect(nav.findPath(lot.id, 0, { x: 2, z: 2 }, [{ x: 3, z: 3 }, { x: 4, z: 4 }])).not.toBeNull();
    expect(nav.findPath(lot.id, 0, { x: 2, z: 2 }, [{ x: 99, z: 3 }])).toBeNull();
    expect(nav.findPath('lot_missing', 0, { x: 2, z: 2 }, [{ x: 3, z: 2 }])).toBeNull();
  });

  it('people can leave a blocked start tile (getting up from a chair)', () => {
    const { state, lot, content, nav } = setup();
    putObject(state, content, lot, 'chair-dining-oak', 5, 5);
    const path = nav.findPath(lot.id, 0, { x: 5, z: 5 }, [{ x: 8, z: 5 }]);
    expect(path).toEqual([{ x: 6, z: 5 }, { x: 7, z: 5 }, { x: 8, z: 5 }]);
  });

  it('is deterministic and respects temporary blocked tiles', () => {
    const { lot, nav } = setup();
    const a = nav.findPath(lot.id, 0, { x: 1, z: 1 }, [{ x: 9, z: 4 }]);
    const b = nav.findPath(lot.id, 0, { x: 1, z: 1 }, [{ x: 9, z: 4 }]);
    expect(a).toEqual(b);
    addWallRun(lot, 0, { x: 5, z: 0 }, { x: 5, z: 4 }, FF);
    addWallRun(lot, 0, { x: 5, z: 5 }, { x: 5, z: 24 }, FF); // gap at z = 4
    nav.invalidate(lot.id);
    const through = nav.findPath(lot.id, 0, { x: 2, z: 4 }, [{ x: 8, z: 4 }])!;
    expect(through).toContainEqual({ x: 5, z: 4 });
    expect(nav.findPath(lot.id, 0, { x: 2, z: 4 }, [{ x: 8, z: 4 }], { blocked: new Set([tileKey(0, 5, 4)]) })).toBeNull();
    expect(nav.findPath(lot.id, 0, { x: 2, z: 4 }, [{ x: 8, z: 4 }], { blocked: new Set(['5,4']) })).toBeNull();
    expect(nav.stats().routeRequests).toBeGreaterThan(0);
  });

  it('caches grids until invalidate, rebuilds on lot replacement and on lot.changed events', () => {
    const content = fixtureContent();
    const w = testWorld();
    const events = new EventBus();
    const nav = new LotNav(() => w.state, content, events);
    expect(nav.isWalkable(w.lot.id, 0, 4, 4)).toBe(true);
    putObject(w.state, content, w.lot, 'trash-can', 4, 4);
    expect(nav.isWalkable(w.lot.id, 0, 4, 4)).toBe(true); // stale until invalidated
    events.emit({ type: 'lot.changed', lotId: w.lot.id, what: 'objects' });
    expect(nav.isWalkable(w.lot.id, 0, 4, 4)).toBe(false);
    w.state.lots[w.lot.id] = JSON.parse(JSON.stringify(w.lot));
    const copy = w.state.lots[w.lot.id]!;
    for (const id of Object.keys(copy.objects)) delete copy.objects[id];
    expect(nav.isWalkable(w.lot.id, 0, 4, 4)).toBe(true); // new lot record -> rebuilt
    expect(nav.isWalkable(w.lot.id, 1, 4, 4)).toBe(false); // level does not exist
  });
});

describe('LotNav slots and stand tiles', () => {
  it('stand tiles are walkable neighbours, front first, never across a wall', () => {
    const { state, lot, content, nav } = setup();
    setWall(lot, 0, 'h', 6, 5, FF); // north of (6,5)
    const fridge = putObject(state, content, lot, 'fridge-standard', 6, 5, 0);
    const tiles = nav.standTilesNear(lot.id, fridge.id);
    expect(tiles[0]).toEqual({ x: 6, z: 6 });
    expect(tiles).toContainEqual({ x: 5, z: 5 });
    expect(tiles).toContainEqual({ x: 7, z: 5 });
    expect(tiles).not.toContainEqual({ x: 6, z: 4 });
    expect(nav.standTilesNear(lot.id, 'obj_missing')).toEqual([]);
  });

  it('slotsOf resolves rotated slots and uses a side approach for a chair pushed up to a table', () => {
    const { state, lot, content, nav } = setup();
    putObject(state, content, lot, 'table-dining-oak', 10, 10, 0);
    const chair = putObject(state, content, lot, 'chair-dining-oak', 10, 9, 0); // north of the table, facing it
    const [slot] = nav.slotsOf(lot.id, chair.id);
    expect(slot).toBeDefined();
    expect(slot!.kind).toBe('sit');
    expect(slot!.x).toBeCloseTo(10.5);
    expect(slot!.z).toBeCloseTo(9.5);
    expect(slot!.facing).toBeCloseTo(0);
    expect(nav.isWalkable(lot.id, 0, slot!.approach.x, slot!.approach.z)).toBe(true);
    expect(slot!.approach).not.toEqual({ x: 10, z: 10 });
    expect(Math.abs(slot!.approach.x - 10) + Math.abs(slot!.approach.z - 9)).toBe(1);
    expect(nav.slotsOf(lot.id, 'obj_missing')).toEqual([]);
  });

  it('slotsOf returns only usable slots (no lying down through a wall)', () => {
    const { state, lot, content, nav } = setup();
    setWall(lot, 0, 'v', 10, 10, FF);
    setWall(lot, 0, 'v', 10, 11, FF);
    putObject(state, content, lot, 'trash-can', 10, 12);
    const bed = putObject(state, content, lot, 'bed-double-oak', 10, 10, 0);
    const slots = nav.slotsOf(lot.id, bed.id);
    expect(slots.map((s) => s.slotId)).toEqual(['right']);
    expect(slots[0]!.approach).toEqual({ x: 12, z: 11 });
  });
});
