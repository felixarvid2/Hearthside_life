import { describe, expect, it } from 'vitest';
import type { Rot } from '../../../src/core/types';
import { LotNav } from '../../../src/world/nav';
import { resolveSlots, validatePlacement } from '../../../src/world/placement';
import { addOpening, addWallRun, setWall } from '../../../src/world/walls';
import { fixtureContent, putObject, testWorld } from './fixtures';

const F = { designId: 'plain-paint', paletteId: 'plain-paint-p0' };
const FF = { a: F, b: F };

function setup() {
  const content = fixtureContent();
  const w = testWorld();
  const check = (defId: string, x: number, z: number, rot: Rot = 0, ignoreObjectId?: string) =>
    validatePlacement(w.state, content, w.lot.id, { defId, x, z, rot, level: 0, ...(ignoreObjectId ? { ignoreObjectId } : {}) });
  return { ...w, content, check };
}

describe('validatePlacement basics', () => {
  it('accepts a free spot and returns the footprint', () => {
    const { check } = setup();
    const r = check('desk-oak', 4, 4);
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.tiles).toEqual([{ x: 4, z: 4 }, { x: 5, z: 4 }]);
  });

  it('rejects unknown objects, levels, rotations and fractional positions', () => {
    const { state, content, lot, check } = setup();
    expect(check('no-such-thing', 4, 4).ok).toBe(false);
    expect(validatePlacement(state, content, lot.id, { defId: 'desk-oak', x: 4, z: 4, rot: 0, level: 1 }).ok).toBe(false);
    expect(validatePlacement(state, content, lot.id, { defId: 'desk-oak', x: 4, z: 4, rot: 5 as Rot, level: 0 }).ok).toBe(false);
    expect(check('desk-oak', 4.5, 4).ok).toBe(false);
    expect(validatePlacement(state, content, 'lot_nope', { defId: 'desk-oak', x: 4, z: 4, rot: 0, level: 0 }).ok).toBe(false);
  });

  it('rejects footprints outside the lot', () => {
    const { check } = setup();
    expect(check('bed-double-oak', 23, 10).reasons).toEqual(['It does not fit on the lot.']);
    expect(check('bed-double-oak', 22, 10).ok).toBe(true);
    expect(check('desk-oak', 10, -1).ok).toBe(false);
    expect(check('desk-oak', 23, 10, 1).ok).toBe(true); // rotated 1 x 2
  });

  it('rejects overlaps within a layer but lets furniture stand on rugs', () => {
    const { state, content, lot, check } = setup();
    putObject(state, content, lot, 'fridge-standard', 5, 5);
    putObject(state, content, lot, 'rug-rectangle', 10, 10);
    expect(check('stove-basic', 5, 5).reasons[0]).toMatch(/overlaps the Fridge Standard/);
    expect(check('bed-double-oak', 4, 4).ok).toBe(false);
    expect(check('rug-rectangle', 12, 11).ok).toBe(false);
    expect(check('rug-rectangle', 13, 10).ok).toBe(true);
    expect(check('armchair-lounge', 11, 11).ok).toBe(true);
  });

  it('treats objects with unknown definitions as occupying their origin tile', () => {
    const { state, content, lot, check } = setup();
    const ghost = putObject(state, content, lot, 'trash-can', 8, 8);
    ghost.defId = 'removed-from-content';
    expect(check('fridge-standard', 8, 8).ok).toBe(false);
    expect(check('fridge-standard', 9, 8).ok).toBe(true);
  });

  it('rejects a footprint with a wall running through it', () => {
    const { lot, check } = setup();
    setWall(lot, 0, 'v', 6, 5, FF); // between (5,5) and (6,5)
    expect(check('desk-oak', 5, 5).reasons).toContain('A wall runs through it.');
    expect(check('desk-oak', 6, 5).ok).toBe(true);
    expect(check('desk-oak', 5, 5, 1).ok).toBe(true); // rotated it no longer straddles the wall
    expect(check('rug-rectangle', 4, 4).reasons).toContain('A wall runs through it.');
  });

  it('allows moving an object onto its own tiles with ignoreObjectId', () => {
    const { state, content, lot, check } = setup();
    const desk = putObject(state, content, lot, 'desk-oak', 5, 5);
    expect(check('desk-oak', 6, 5).ok).toBe(false);
    expect(check('desk-oak', 6, 5, 0, desk.id).ok).toBe(true);
    expect(check('desk-oak', 5, 5, 1, desk.id).ok).toBe(true);
  });
});

describe('rotation', () => {
  it('footprints rotate with the min corner as origin', () => {
    const { check } = setup();
    const t = (rot: Rot) => check('desk-oak', 10, 10, rot).tiles;
    expect(t(0)).toEqual([{ x: 10, z: 10 }, { x: 11, z: 10 }]);
    expect(t(1)).toEqual([{ x: 10, z: 10 }, { x: 10, z: 11 }]);
    expect(t(2)).toEqual([{ x: 10, z: 10 }, { x: 11, z: 10 }]);
    expect(t(3)).toEqual([{ x: 10, z: 10 }, { x: 10, z: 11 }]);
    expect(check('rug-rectangle', 10, 10, 1).tiles).toHaveLength(6);
    expect(check('rug-rectangle', 10, 10, 1).tiles.at(-1)).toEqual({ x: 11, z: 12 });
  });

  it('slot anchors, facing and approach tiles rotate together with the footprint', () => {
    const { state, content, lot } = setup();
    const def = content.objects['bed-double-oak']!;
    const expected = [
      { anchor: [10.5, 11.1], facing: 0, approach: { x: 9, z: 11 } }, // rot 0: left side is west
      { anchor: [11.1, 11.5], facing: Math.PI / 2, approach: { x: 11, z: 12 } }, // rot 1: left side is south
      { anchor: [11.5, 10.9], facing: Math.PI, approach: { x: 12, z: 10 } }, // rot 2: left side is east
      { anchor: [10.9, 10.5], facing: (3 * Math.PI) / 2, approach: { x: 10, z: 9 } }, // rot 3: left side is north
    ];
    for (const rot of [0, 1, 2, 3] as Rot[]) {
      const bed = putObject(state, content, lot, 'bed-double-oak', 10, 10, rot);
      const [left, right] = resolveSlots(lot, bed, def);
      const e = expected[rot]!;
      expect(left!.x, `rot ${rot}`).toBeCloseTo(e.anchor[0]!);
      expect(left!.z, `rot ${rot}`).toBeCloseTo(e.anchor[1]!);
      expect(left!.facing, `rot ${rot}`).toBeCloseTo(e.facing);
      expect(left!.approach, `rot ${rot}`).toEqual(e.approach);
      expect(left!.posture).toBe('lying');
      // the two approach tiles are on opposite sides of the 2 x 2 footprint
      const cx = 11, cz = 11;
      expect((left!.approach.x + 0.5 - cx) * (right!.approach.x + 0.5 - cx) + (left!.approach.z + 0.5 - cz) * (right!.approach.z + 0.5 - cz)).toBeLessThan(0);
      delete lot.objects[bed.id];
    }
  });

  it('a chair front-approach rotates to the tile in front of it for every rotation', () => {
    const { state, content, lot } = setup();
    const def = content.objects['chair-dining-oak']!;
    const fronts = [{ x: 5, z: 6 }, { x: 6, z: 5 }, { x: 5, z: 4 }, { x: 4, z: 5 }];
    for (const rot of [0, 1, 2, 3] as Rot[]) {
      const chair = putObject(state, content, lot, 'chair-dining-oak', 5, 5, rot);
      const [seat] = resolveSlots(lot, chair, def);
      expect(seat!.approach).toEqual(fronts[rot]);
      expect(seat!.x).toBeCloseTo(5.5);
      expect(seat!.z).toBeCloseTo(5.5);
      delete lot.objects[chair.id];
    }
  });
});

describe('surface and wall items', () => {
  it('surface items need a supporting object with a surface and report its id', () => {
    const { state, content, lot, check } = setup();
    expect(check('tv-flatscreen', 5, 5).reasons[0]).toMatch(/needs a table, counter/);
    const fridge = putObject(state, content, lot, 'fridge-standard', 8, 8);
    expect(check('tv-flatscreen', 8, 8).ok).toBe(false);
    const stand = putObject(state, content, lot, 'tv-stand-low', 5, 5);
    const r = check('tv-flatscreen', 6, 5);
    expect(r.ok).toBe(true);
    expect(r.supportId).toBe(stand.id);
    putObject(state, content, lot, 'tv-flatscreen', 6, 5, 0, { supportId: stand.id });
    expect(check('radio-retro', 6, 5).ok).toBe(false);
    expect(check('radio-retro', 5, 5).ok).toBe(true);
    expect(fridge.id).toBeTruthy();
  });

  it('wall items need a solid wall behind them, never a door or window', () => {
    const { state, content, lot, check } = setup();
    expect(check('bathroom-mirror', 5, 5).reasons).toContain('It needs a wall behind it.');
    setWall(lot, 0, 'h', 5, 5, FF); // north edge of (5,5)
    expect(check('bathroom-mirror', 5, 5, 0).ok).toBe(true);
    expect(check('bathroom-mirror', 5, 5, 2).ok).toBe(false); // back would be the south edge
    expect(check('bathroom-mirror', 5, 4, 2).ok).toBe(true); // other side of the same wall
    setWall(lot, 0, 'v', 8, 5, FF);
    expect(check('bathroom-mirror', 8, 5, 1).ok).toBe(true); // rot 1 hangs on the west edge
    expect(check('bathroom-mirror', 7, 5, 3).ok).toBe(true); // rot 3 hangs on the east edge
    putObject(state, content, lot, 'bathroom-mirror', 5, 5, 0);
    expect(check('bathroom-mirror', 5, 5, 0).ok).toBe(false);
    setWall(lot, 0, 'h', 10, 5, FF);
    addOpening(state, lot, content.openings['window-sash']!, '0:h:10:5');
    expect(check('bathroom-mirror', 10, 5, 0).reasons).toContain('It cannot hang over a door or window.');
  });

  it('a mirror above a sink is fine and is used from the tile in front of the sink', () => {
    const { state, content, lot, check } = setup();
    setWall(lot, 0, 'h', 5, 5, FF);
    putObject(state, content, lot, 'bathroom-sink', 5, 5, 0);
    expect(check('bathroom-mirror', 5, 5, 0).ok).toBe(true);
    const mirror = putObject(state, content, lot, 'bathroom-mirror', 5, 5, 0);
    const nav = new LotNav(() => state, content);
    expect(nav.slotsOf(lot.id, mirror.id)[0]!.approach).toEqual({ x: 5, z: 6 });
  });
});

describe('access and clearance', () => {
  it('keeps both tiles of a door and the lot entry clear of blocking furniture', () => {
    const { state, content, lot, check } = setup();
    setWall(lot, 0, 'v', 10, 5, FF);
    addOpening(state, lot, content.openings['door-panel']!, '0:v:10:5');
    expect(check('fridge-standard', 9, 5).reasons).toContain('Keep doorways clear.');
    expect(check('fridge-standard', 10, 5, 2).reasons).toContain('Keep doorways clear.');
    expect(check('rug-rectangle', 7, 5).ok).toBe(true); // covers the door tile (9,5) but does not block
    expect(check('trash-can', lot.entry.x, lot.entry.z).reasons).toContain('Keep the lot entry clear.');
  });

  it('never covers a standing or walking person; seated people are on their object', () => {
    const { state, lot, check } = setup();
    state.people['per_x'] = {
      firstName: 'Ada', location: { kind: 'lot', lotId: lot.id, level: 0, x: 5.5, z: 5.5, facing: 0, posture: 'standing' },
    } as unknown as (typeof state.people)[string];
    expect(check('fridge-standard', 5, 5).reasons).toContain('Ada is standing there.');
    expect(check('rug-rectangle', 4, 4).ok).toBe(true);
    (state.people['per_x']!.location as { posture: string }).posture = 'seated';
    expect(check('fridge-standard', 5, 5).ok).toBe(true);
  });

  it('an appliance with every side walled off or blocked is rejected (never used through a wall)', () => {
    const { state, content, lot, check } = setup();
    setWall(lot, 0, 'h', 5, 6, FF); // south edge of (5,5): the fridge front
    putObject(state, content, lot, 'counter-basic', 4, 5);
    putObject(state, content, lot, 'counter-basic', 6, 5);
    setWall(lot, 0, 'h', 5, 5, FF); // behind
    expect(check('fridge-standard', 5, 5).reasons).toContain('There is no free side to use it from.');
    // facing the open room it is fine
    expect(check('fridge-standard', 5, 5, 2).ok).toBe(false); // front (north) is walled too
    setWall(lot, 0, 'h', 12, 12, FF);
    expect(check('fridge-standard', 12, 12, 0).ok).toBe(true);
  });

  it('a chair pushed up to a table and a computer with a desk chair in front are accepted', () => {
    const { state, content, lot, check } = setup();
    putObject(state, content, lot, 'table-dining-oak', 10, 10);
    expect(check('chair-dining-oak', 10, 9, 0).ok).toBe(true);
    expect(check('chair-dining-oak', 11, 11, 2).ok).toBe(true);
    // desk in a corner nook: wall behind, bookcase left, wall right of the desk's second tile
    addWallRun(lot, 0, { x: 3, z: 3 }, { x: 7, z: 3 }, FF);
    putObject(state, content, lot, 'bookcase-open', 3, 3, 0);
    const desk = putObject(state, content, lot, 'desk-oak', 4, 3, 0);
    setWall(lot, 0, 'v', 6, 3, FF);
    putObject(state, content, lot, 'chair-desk', 4, 4, 2);
    const pc = check('computer-desktop', 4, 3, 0);
    expect(pc.ok).toBe(true);
    expect(pc.supportId).toBe(desk.id);
    const computer = putObject(state, content, lot, 'computer-desktop', 4, 3, 0, { supportId: desk.id });
    const nav = new LotNav(() => state, content);
    const [slot] = nav.slotsOf(lot.id, computer.id);
    expect(nav.isWalkable(lot.id, 0, slot!.approach.x, slot!.approach.z)).toBe(true);
  });

  it('rejects placements that cut off part of the lot', () => {
    const { lot, check } = setup();
    addWallRun(lot, 0, { x: 5, z: 0 }, { x: 5, z: 10 }, FF);
    addWallRun(lot, 0, { x: 5, z: 11 }, { x: 5, z: 24 }, FF); // the only gap is at z = 10
    expect(check('trash-can', 5, 10).reasons).toContain('It would cut off part of the lot.');
    expect(check('trash-can', 4, 10).reasons).toContain('It would cut off part of the lot.');
    expect(check('trash-can', 6, 12).ok).toBe(true);
  });

  it('rejects taking the last usable side of another object, and objects nobody can reach', () => {
    const { state, content, lot, check } = setup();
    setWall(lot, 0, 'h', 5, 5, FF);
    putObject(state, content, lot, 'counter-basic', 4, 5);
    putObject(state, content, lot, 'fridge-standard', 5, 5);
    putObject(state, content, lot, 'counter-basic', 6, 5);
    expect(check('trash-can', 5, 6).reasons).toContain('It would block access to the Fridge Standard.');
    expect(check('trash-can', 7, 6).ok).toBe(true);
    // an enclosed area cannot be furnished with usable objects
    addWallRun(lot, 0, { x: 15, z: 15 }, { x: 19, z: 15 }, FF);
    addWallRun(lot, 0, { x: 15, z: 19 }, { x: 19, z: 19 }, FF);
    addWallRun(lot, 0, { x: 15, z: 15 }, { x: 15, z: 19 }, FF);
    addWallRun(lot, 0, { x: 19, z: 15 }, { x: 19, z: 19 }, FF);
    expect(check('fridge-standard', 16, 16).reasons).toContain('It cannot be reached from the lot entry.');
  });

  it('a bed against a wall is entered from its foot end; with that blocked too it only warns', () => {
    const { state, content, lot, check } = setup();
    setWall(lot, 0, 'v', 10, 10, FF);
    setWall(lot, 0, 'v', 10, 11, FF);
    const r = check('bed-double-oak', 10, 10, 0); // left side against the wall
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
    putObject(state, content, lot, 'trash-can', 10, 12); // blocks the foot end of the left half
    const r2 = check('bed-double-oak', 10, 10, 0);
    expect(r2.ok).toBe(true);
    expect(r2.warnings).toEqual(['Some of its sides cannot be used.']);
  });

  it('never mutates state', () => {
    const { state, content, lot, check } = setup();
    putObject(state, content, lot, 'tv-stand-low', 5, 5);
    const before = JSON.stringify(state);
    check('tv-flatscreen', 5, 5);
    check('fridge-standard', 5, 5);
    check('bed-double-oak', 10, 10, 3);
    expect(JSON.stringify(state)).toBe(before);
  });
});
