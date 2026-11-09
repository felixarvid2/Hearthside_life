import { describe, expect, it } from 'vitest';
import { otherPeople, placeChoices, roomKind } from '../../../src/ui/hud/pickerModel';

describe('roomKind', () => {
  it('names a room from what stands in it', () => {
    expect(roomKind(['beds', 'wardrobe'])).toBe('Bedroom');
    expect(roomKind(['toilet', 'sink'])).toBe('Bathroom');
    expect(roomKind(['stove', 'fridge', 'dining'])).toBe('Kitchen');
    expect(roomKind(['sofa', 'tv'])).toBe('Living room');
    expect(roomKind(['desk', 'computer'])).toBe('Study');
    expect(roomKind(['dining'])).toBe('Dining room');
    expect(roomKind([])).toBe('Room');
  });
});

const grid = (x0: number, z0: number, w: number, d: number) => Array.from({ length: w * d }, (_, i) => ({ x: x0 + (i % w), z: z0 + Math.floor(i / w) }));

describe('placeChoices', () => {
  const entry = { x: 5, z: 9, level: 0 };
  it('numbers rooms that share a name, lists the yard and front door, and starts at the middle', () => {
    const out = placeChoices([
      { uid: 'r1', level: 0, outdoor: false, tiles: grid(0, 0, 3, 3), categories: ['beds'] },
      { uid: 'r2', level: 0, outdoor: false, tiles: grid(4, 0, 3, 3), categories: ['single'] },
      { uid: 'r3', level: 1, outdoor: false, tiles: grid(0, 0, 2, 2), categories: ['toilet'] },
      { uid: 'yard', level: 0, outdoor: true, tiles: grid(0, 4, 4, 4), categories: [] },
    ], entry, new Set());
    expect(out.map((p) => p.name)).toEqual(['Bedroom 1', 'Bedroom 2', 'Bathroom', 'Front door', 'Yard']);
    expect(out[0]!.tiles[0]).toEqual({ x: 1, z: 1 });
    expect(out[2]!.level).toBe(1);
    expect(out[3]!.tiles).toEqual([{ x: 5, z: 9 }]);
  });
  it('skips tiles under objects and drops rooms with no free tile', () => {
    const out = placeChoices([
      { uid: 'a', level: 0, outdoor: false, tiles: grid(0, 0, 3, 3), categories: ['sofa'] },
      { uid: 'b', level: 0, outdoor: false, tiles: grid(5, 5, 1, 1), categories: [] },
    ], entry, new Set(['0:1,1', '0:5,5']));
    expect(out.map((p) => p.name)).toEqual(['Living room', 'Front door']);
    expect(out[0]!.tiles.some((t) => t.x === 1 && t.z === 1)).toBe(false);
  });
});

describe('otherPeople', () => {
  const p = (id: string, firstName: string, householdId: string, lotId: string | null) => ({
    id, firstName, lastName: 'T', householdId, lifeStage: 'adult', location: lotId ? { kind: 'lot', lotId } : { kind: 'offlot' },
  });
  it('lists people on the lot except the chooser, household first', () => {
    const people = { a: p('a', 'Ann', 'h1', 'L'), b: p('b', 'Zed', 'h1', 'L'), c: p('c', 'Bo', 'h2', 'L'), d: p('d', 'Far', 'h2', null), e: p('e', 'Elsewhere', 'h2', 'M') };
    expect(otherPeople(people, 'a', 'L', 'h1', (s) => s).map((r) => r.id)).toEqual(['b', 'c']);
  });
});
