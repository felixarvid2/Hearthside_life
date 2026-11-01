import { describe, expect, it } from 'vitest';
import { edgeKey } from '../../../src/core/ids';
import {
  addOpening, addRectWalls, addWallRun, doorSwingSide, edgeBetween, edgeInLot, edgeOnSide, edgeTiles, isDoorway,
  isWindowWall, openingOnWall, removeWall, setWall, setWallSideFinish, tileOnSide, wallBetween, wallSideFacing,
} from '../../../src/world/walls';
import { fixtureContent, testWorld } from './fixtures';

const A = { designId: 'plain-paint', paletteId: 'plain-paint-p0' };
const B = { designId: 'brick-classic', paletteId: 'brick-classic-p0' };

describe('wall edge math', () => {
  it('maps tile sides to edges following the h/v edge rules', () => {
    expect(edgeOnSide(0, { x: 3, z: 4 }, 'n').key).toBe(edgeKey(0, 'h', 3, 4));
    expect(edgeOnSide(0, { x: 3, z: 4 }, 's').key).toBe(edgeKey(0, 'h', 3, 5));
    expect(edgeOnSide(0, { x: 3, z: 4 }, 'w').key).toBe(edgeKey(0, 'v', 3, 4));
    expect(edgeOnSide(0, { x: 3, z: 4 }, 'e').key).toBe(edgeKey(0, 'v', 4, 4));
  });

  it('finds the edge between adjacent tiles in either order and rejects non-adjacent pairs', () => {
    expect(edgeBetween(0, { x: 2, z: 2 }, { x: 2, z: 3 })?.key).toBe('0:h:2:3');
    expect(edgeBetween(0, { x: 2, z: 3 }, { x: 2, z: 2 })?.key).toBe('0:h:2:3');
    expect(edgeBetween(0, { x: 2, z: 2 }, { x: 3, z: 2 })?.key).toBe('0:v:3:2');
    expect(edgeBetween(0, { x: 3, z: 2 }, { x: 2, z: 2 })?.key).toBe('0:v:3:2');
    expect(edgeBetween(0, { x: 2, z: 2 }, { x: 3, z: 3 })).toBeNull();
    expect(edgeBetween(0, { x: 2, z: 2 }, { x: 2, z: 2 })).toBeNull();
  });

  it('side a of an h wall faces north, side b faces south; v walls: a west, b east', () => {
    const h = { dir: 'h' as const, x: 5, z: 7 };
    expect(wallSideFacing(h, { x: 5, z: 6 })).toBe('a');
    expect(wallSideFacing(h, { x: 5, z: 7 })).toBe('b');
    expect(wallSideFacing(h, { x: 6, z: 7 })).toBeNull();
    expect(wallSideFacing(h, { x: 5, z: 8 })).toBeNull();
    const v = { dir: 'v' as const, x: 5, z: 7 };
    expect(wallSideFacing(v, { x: 4, z: 7 })).toBe('a');
    expect(wallSideFacing(v, { x: 5, z: 7 })).toBe('b');
    expect(wallSideFacing(v, { x: 5, z: 8 })).toBeNull();
    expect(tileOnSide(h, 'a')).toEqual({ x: 5, z: 6 });
    expect(tileOnSide(v, 'b')).toEqual({ x: 5, z: 7 });
    expect(edgeTiles(v)).toEqual([{ x: 4, z: 7 }, { x: 5, z: 7 }]);
  });

  it('accepts boundary edges and rejects edges off the lot', () => {
    const size = { width: 24, depth: 24 };
    expect(edgeInLot(size, 'h', 0, 24)).toBe(true);
    expect(edgeInLot(size, 'v', 24, 0)).toBe(true);
    expect(edgeInLot(size, 'h', 24, 0)).toBe(false);
    expect(edgeInLot(size, 'v', 0, 24)).toBe(false);
    expect(edgeInLot(size, 'h', -1, 0)).toBe(false);
  });
});

describe('wall records', () => {
  it('creates walls keyed by edge, copies finishes and keeps the two sides independent', () => {
    const { lot } = testWorld();
    const w = setWall(lot, 0, 'h', 3, 4, { a: A, b: A });
    expect(w.id).toBe('0:h:3:4');
    expect(lot.walls[w.id]).toBe(w);
    setWallSideFinish(w, 'b', B);
    expect(w.sideA).toEqual(A);
    expect(w.sideB).toEqual(B);
    expect(w.sideA).not.toBe(A);
    expect(wallBetween(lot, 0, { x: 3, z: 3 }, { x: 3, z: 4 })).toBe(w);
    expect(wallBetween(lot, 0, { x: 3, z: 4 }, { x: 3, z: 5 })).toBeUndefined();
    expect(() => setWall(lot, 0, 'h', 30, 4, { a: A, b: A })).toThrow();
  });

  it('builds runs and rectangles', () => {
    const { lot } = testWorld();
    expect(addWallRun(lot, 0, { x: 2, z: 2 }, { x: 6, z: 2 }, { a: A, b: A }).map((w) => w.id)).toEqual(['0:h:2:2', '0:h:3:2', '0:h:4:2', '0:h:5:2']);
    expect(addWallRun(lot, 0, { x: 6, z: 5 }, { x: 6, z: 2 }, { a: A, b: A }).map((w) => w.id)).toEqual(['0:v:6:4', '0:v:6:3', '0:v:6:2']);
    expect(() => addWallRun(lot, 0, { x: 0, z: 0 }, { x: 2, z: 2 }, { a: A, b: A })).toThrow();
    const { lot: lot2 } = testWorld();
    expect(addRectWalls(lot2, 0, 1, 1, 4, 3, { a: A, b: A })).toHaveLength(2 * 3 + 2 * 2);
  });

  it('openings sit in walls; doors are doorways, windows are not; removing a wall removes its opening', () => {
    const content = fixtureContent();
    const { state, lot } = testWorld();
    const w1 = setWall(lot, 0, 'v', 5, 5, { a: A, b: A });
    const w2 = setWall(lot, 0, 'v', 5, 6, { a: A, b: A });
    const door = addOpening(state, lot, content.openings['door-panel']!, w1.id, true);
    addOpening(state, lot, content.openings['window-sash']!, w2.id);
    expect(openingOnWall(lot, w1.id)).toBe(door);
    expect(isDoorway(lot, content, w1.id)).toBe(true);
    expect(isDoorway(lot, content, w2.id)).toBe(false);
    expect(isWindowWall(lot, content, w2.id)).toBe(true);
    expect(doorSwingSide(door)).toBe('a');
    expect(() => addOpening(state, lot, content.openings['door-panel']!, w1.id)).toThrow();
    expect(() => addOpening(state, lot, content.openings['door-panel']!, '0:v:9:9')).toThrow();
    removeWall(lot, w1.id);
    expect(lot.walls[w1.id]).toBeUndefined();
    expect(lot.openings[door.id]).toBeUndefined();
  });
});
