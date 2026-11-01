import { describe, expect, it } from 'vitest';
import { computeRooms, roomAt, roomIndex } from '../../../src/world/rooms';
import { addOpening, addRectWalls, addWallRun } from '../../../src/world/walls';
import { fixtureContent, testWorld } from './fixtures';

const F = { designId: 'plain-paint', paletteId: 'plain-paint-p0' };
const FF = { a: F, b: F };

describe('computeRooms', () => {
  it('an empty lot is one outdoor room without wall sides', () => {
    const { lot } = testWorld();
    const rooms = computeRooms(lot, 0);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.outdoor).toBe(true);
    expect(rooms[0]!.tiles).toHaveLength(24 * 24);
    expect(rooms[0]!.sides).toEqual([]);
  });

  it('a wall splits an enclosed area into two rooms; the yard stays outdoor', () => {
    const { lot } = testWorld();
    addRectWalls(lot, 0, 4, 4, 10, 8, FF); // tiles x 4..9, z 4..7
    addWallRun(lot, 0, { x: 7, z: 4 }, { x: 7, z: 8 }, FF); // splits at x = 7
    const rooms = computeRooms(lot, 0);
    expect(rooms).toHaveLength(3);
    const west = roomAt(rooms, 5, 5)!;
    const east = roomAt(rooms, 8, 5)!;
    const yard = roomAt(rooms, 0, 0)!;
    expect(west).not.toBe(east);
    expect(west.outdoor).toBe(false);
    expect(east.outdoor).toBe(false);
    expect(yard.outdoor).toBe(true);
    expect(west.tiles).toHaveLength(3 * 4);
    expect(east.tiles).toHaveLength(3 * 4);
    // the shared wall is listed once per room, with the side facing that room
    expect(west.sides).toContainEqual({ wallId: '0:v:7:5', side: 'a' });
    expect(east.sides).toContainEqual({ wallId: '0:v:7:5', side: 'b' });
    expect(west.sides.some((s) => s.wallId === '0:v:7:5' && s.side === 'b')).toBe(false);
    // the outer wall's outside faces the yard
    expect(yard.sides).toContainEqual({ wallId: '0:h:5:4', side: 'a' });
    expect(west.sides).toContainEqual({ wallId: '0:h:5:4', side: 'b' });
    // 3 x 4 room: 3 + 3 + 4 + 4 sides
    expect(west.sides).toHaveLength(14);
  });

  it('a door does not merge rooms, and a window does not either', () => {
    const content = fixtureContent();
    const { state, lot } = testWorld();
    addRectWalls(lot, 0, 4, 4, 10, 8, FF);
    addWallRun(lot, 0, { x: 7, z: 4 }, { x: 7, z: 8 }, FF);
    addOpening(state, lot, content.openings['door-panel']!, '0:v:7:5');
    addOpening(state, lot, content.openings['door-glazed']!, '0:h:5:8');
    addOpening(state, lot, content.openings['window-sash']!, '0:v:7:6');
    const rooms = computeRooms(lot, 0);
    expect(rooms).toHaveLength(3);
    expect(roomAt(rooms, 5, 5)).not.toBe(roomAt(rooms, 8, 5));
    expect(roomAt(rooms, 5, 5)!.outdoor).toBe(false);
  });

  it('a gap in the wall merges the areas into one room', () => {
    const { lot } = testWorld();
    addRectWalls(lot, 0, 4, 4, 10, 8, FF);
    addWallRun(lot, 0, { x: 7, z: 4 }, { x: 7, z: 7 }, FF); // stops one tile short
    const rooms = computeRooms(lot, 0);
    expect(rooms).toHaveLength(2);
    expect(roomAt(rooms, 5, 5)).toBe(roomAt(rooms, 8, 5));
  });

  it('a room walled along the lot boundary is indoor; ids follow row-major first tiles', () => {
    const { lot } = testWorld();
    addRectWalls(lot, 0, 0, 0, 3, 3, FF);
    const rooms = computeRooms(lot, 0);
    expect(rooms).toHaveLength(2);
    expect(rooms[0]!.tiles[0]).toEqual({ x: 0, z: 0 });
    expect(rooms[0]!.outdoor).toBe(false);
    expect(rooms[1]!.outdoor).toBe(true);
    const idx = roomIndex(rooms, lot.width, lot.depth);
    expect(idx[0]).toBe(0);
    expect(idx[5]).toBe(1);
  });
});
