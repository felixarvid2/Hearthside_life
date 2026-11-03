// Milestone 9: floors. Support and balcony rules, stairs and the floor holes they cut, navigation across levels, lotCheck on
// every level, build undo/redo on level 1, the walk up a staircase and the save round trip. Real content throughout.

import { describe, expect, it } from 'vitest';
import { buildCommand, eraseFloorTiles, eraseWallSegment, placeRoom, placeWallRun } from '../../../src/building/buildCommands';
import { buyObject, sellObject } from '../../../src/building/commands';
import { planBuild } from '../../../src/building/buildPlans';
import { content } from '../../../src/content';
import { UndoStack, type CommandContext } from '../../../src/core/commands';
import { EventBus } from '../../../src/core/events';
import { edgeKey, tileKey } from '../../../src/core/ids';
import { addHousehold, createEmptyWorld } from '../../../src/core/state';
import type { FinishRef, Lot } from '../../../src/core/types';
import { migrate, validateWorld } from '../../../src/persistence/schema';
import {
  balconyWarnings, hasUpperContent, LEVEL_HEIGHT, levelProblems, levelsInUse, levelY, lotStairs, stairHoles, stairLinks, stairGeometry,
} from '../../../src/world/levels';
import { createLot } from '../../../src/world/lots';
import { LotNav } from '../../../src/world/nav';
import { buildResidentialLot, lotProblems } from '../../../src/world/venues';
import { validatePlacement } from '../../../src/world/placement';
import { lotObjects } from '../../../src/sim/context';
import { connectedLevels } from '../../../src/world/levels';

const db = content();
const OAK: FinishRef = { designId: 'oak-planks', paletteId: db.floorDesigns['oak-planks']!.palettes[0]!.id };
const STAIR = 'stair-straight-basic';

function setup(funds = 5_000_000) {
  const state = createEmptyWorld(11, 'create');
  const lot = createLot(state, { name: 'T', address: '1 Test Lane', width: 24, depth: 24, kind: 'residential', landValue: 1_000_000, entry: { x: 12, z: 23, level: 0 } });
  const hh = addHousehold(state, 'Testers', funds, lot.id, true);
  lot.ownerHouseholdId = hh.id;
  state.activeHouseholdId = hh.id;
  state.activeLotId = lot.id;
  const events = new EventBus();
  const ctx: CommandContext = { state, content: db, events };
  const stack = new UndoStack();
  const run = (cmd: Parameters<UndoStack['run']>[1]) => stack.run(ctx, cmd);
  return { state, lot, hh, events, ctx, stack, run, nav: new LotNav(() => state, db, events) };
}
type Env = ReturnType<typeof setup>;

/** An 8 x 8 room with a floor on the ground floor: walls on the vertices 4..12 (tiles 4..11). */
function groundRoom(e: Env): void {
  expect(e.run(placeRoom(e.lot.id, e.hh.id, 0, { x: 4, z: 4 }, { x: 12, z: 12 }, { floor: OAK }))).toEqual({ ok: true });
}

/** JSON with sorted keys, so records restored by undo compare equal whatever their insertion order. */
function sorted(x: unknown): unknown {
  return Array.isArray(x) ? x.map(sorted) : x && typeof x === 'object'
    ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, y]) => [k, sorted(y)])) : x;
}
const json = (v: unknown) => JSON.stringify(sorted(v));
const same = (a: string, b: string) => expect(a === b).toBe(true);

describe('levels: constants and helpers', () => {
  it('a level is 3 m high; levels in use follow the content', () => {
    const e = setup();
    expect(LEVEL_HEIGHT).toBe(3);
    expect(levelY(2)).toBe(6);
    expect(levelsInUse(e.lot)).toBe(1);
    expect(hasUpperContent(e.lot)).toBe(false);
    groundRoom(e);
    expect(levelsInUse(e.lot)).toBe(1);
    expect(e.lot.levels).toBe(1);
  });
});

describe('support rules for upper floors', () => {
  it('a floor in the air is refused, a floor over a floored room is allowed', () => {
    const e = setup();
    groundRoom(e);
    const air = e.run(buildCommand(e.lot.id, e.hh.id, { kind: 'walls', level: 1, shape: 'rect', edges: [], rect: { x0: 15, z0: 15, x1: 17, z1: 17 }, floor: { tiles: [{ x: 15, z: 15 }], finish: OAK } }));
    expect(air.ok).toBe(false);
    const up = e.run(placeRoom(e.lot.id, e.hh.id, 1, { x: 4, z: 4 }, { x: 12, z: 12 }, { floor: OAK }));
    expect(up).toEqual({ ok: true });
    expect(e.lot.levels).toBe(2);
    expect(Object.keys(e.lot.floors).filter((k) => k.startsWith('1:')).length).toBe(64);
    expect(levelProblems(e.lot, db)).toEqual([]); // (no staircase yet, so lotProblems would say the floor cannot be reached)
  });

  it('a wall of level 1 needs floor on one side', () => {
    const e = setup();
    groundRoom(e);
    const r = e.run(placeWallRun(e.lot.id, e.hh.id, 1, { x: 4, z: 4 }, { x: 8, z: 4 }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/floor/i);
    // with the floor first it works
    expect(e.run(buildCommand(e.lot.id, e.hh.id, { kind: 'eraseFloor', level: 1, tiles: [] }))).toMatchObject({ ok: false });
  });

  it('what holds an upper floor up cannot be taken away', () => {
    const e = setup();
    groundRoom(e);
    expect(e.run(placeRoom(e.lot.id, e.hh.id, 1, { x: 4, z: 4 }, { x: 12, z: 12 }, { floor: OAK })).ok).toBe(true);
    const lot0 = json(e.lot);
    // a gap in the outer wall opens the room below: the floor above would hang in the air
    const wall = e.run(eraseWallSegment(e.lot.id, e.hh.id, 0, { dir: 'h', x: 6, z: 4 }));
    expect(wall.ok).toBe(false);
    expect(wall.ok === false && wall.reason).toMatch(/wall or a floored room|balcony/i);
    const tiles = Array.from({ length: 64 }, (_, i) => ({ x: 4 + (i % 8), z: 4 + Math.floor(i / 8) }));
    const floor = e.run(eraseFloorTiles(e.lot.id, e.hh.id, 0, tiles));
    expect(floor.ok).toBe(false);
    expect(floor.ok === false && floor.reason).toMatch(/wall or a floored room|balcony/i);
    same(json(e.lot), lot0);
    // an inner wall is not carrying anything: it can go
    expect(e.run(placeWallRun(e.lot.id, e.hh.id, 0, { x: 8, z: 4 }, { x: 8, z: 12 })).ok).toBe(true);
    expect(e.run(eraseWallSegment(e.lot.id, e.hh.id, 0, { dir: 'v', x: 8, z: 6 })).ok).toBe(true);
  });

  it('only standard-height walls carry an upper floor', () => {
    const e = setup();
    // a tall room: floor on level 1 over it is refused
    expect(e.run(placeRoom(e.lot.id, e.hh.id, 0, { x: 4, z: 4 }, { x: 12, z: 12 }, { spec: { height: 3.6 } })).ok).toBe(true);
    const up = e.run(placeRoom(e.lot.id, e.hh.id, 1, { x: 4, z: 4 }, { x: 12, z: 12 }, { floor: OAK }));
    expect(up.ok).toBe(false);
    // a floor first, then a tall wall under it: refused
    const f = setup();
    groundRoom(f);
    expect(f.run(placeRoom(f.lot.id, f.hh.id, 1, { x: 4, z: 4 }, { x: 12, z: 12 }, { floor: OAK })).ok).toBe(true);
    const tall = f.run(placeWallRun(f.lot.id, f.hh.id, 0, { x: 8, z: 4 }, { x: 8, z: 12 }, { height: 3.6 }));
    expect(tall.ok).toBe(false);
    expect(tall.ok === false && tall.reason).toMatch(/standard height/i);
  });

  it('a balcony may reach 2 tiles out from a room, no further, and warns about its railing', () => {
    const e = setup();
    groundRoom(e);
    expect(e.run(placeRoom(e.lot.id, e.hh.id, 1, { x: 4, z: 4 }, { x: 12, z: 12 }, { floor: OAK })).ok).toBe(true);
    // two tiles out on the east side (x 12 and 13, the room ends at 11): within reach
    const two = buildCommand(e.lot.id, e.hh.id, { kind: 'walls', level: 1, shape: 'run', edges: [], floor: { tiles: [{ x: 12, z: 6 }, { x: 13, z: 6 }], finish: OAK } });
    expect(e.run(two).ok).toBe(true);
    const plan = planBuild(e.state, db, e.lot.id, e.hh.id, { kind: 'walls', level: 1, shape: 'run', edges: [], floor: { tiles: [{ x: 14, z: 6 }], finish: OAK } });
    expect(plan.ok).toBe(false);
    expect(plan.reasons.join(' ')).toMatch(/balcony can reach only 2/i);
    // the railings: every open edge of the balcony tiles is reported until a fence or wall stands on it
    const missing = balconyWarnings(e.lot, db);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((w) => w.level === 1)).toBe(true);
    for (const w of missing) {
      e.lot.fences ??= {};
      const [, dir, x, z] = w.edge.split(':');
      e.lot.fences[w.edge] = { id: w.edge, level: 1, dir: dir as 'h' | 'v', x: Number(x), z: Number(z), defId: 'rail-test' };
    }
    expect(balconyWarnings(e.lot, db)).toEqual([]);
  });

  it('the new balcony edges show up as a warning in the plan, not as a block', () => {
    const e = setup();
    groundRoom(e);
    expect(e.run(placeRoom(e.lot.id, e.hh.id, 1, { x: 4, z: 4 }, { x: 12, z: 12 }, { floor: OAK })).ok).toBe(true);
    const plan = planBuild(e.state, db, e.lot.id, e.hh.id, { kind: 'walls', level: 1, shape: 'run', edges: [], floor: { tiles: [{ x: 12, z: 6 }], finish: OAK } });
    expect(plan.ok).toBe(true);
    expect(plan.warnings?.join(' ')).toMatch(/no railing/i);
  });
});

describe('stairs', () => {
  it('a stair has a foot, a head and a stairwell on the level above', () => {
    const e = setup();
    const def = db.objects[STAIR]!;
    expect(def.stair).toEqual({ length: 3, kind: 'straight' });
    // rot 0: foot in front (south), the flight rises to the north
    const obj = { id: 's', defId: STAIR, level: 0, x: 8, z: 8, rot: 0 as const } as Lot['objects'][string];
    const g = stairGeometry(obj, def)!;
    expect(g.footprint.map((t) => `${t.x},${t.z}`)).toEqual(['8,8', '8,9', '8,10']);
    expect(g.links).toHaveLength(1);
    expect(g.links[0]!.foot).toMatchObject({ x: 8, z: 11, level: 0 });
    expect(g.links[0]!.head).toMatchObject({ x: 8, z: 7, level: 1 });
    // turned east (rot 1): the foot faces east and the head is on the west side
    const east = stairGeometry({ ...obj, rot: 1 }, def)!;
    expect(east.links[0]!.foot.x).toBeGreaterThan(east.links[0]!.head.x);
    void e;
  });

  it('every staircase design, at every rotation, is a connected walk from its foot to its head', () => {
    const stairs = Object.values(db.objects).filter((d) => d.stair);
    expect(stairs.length).toBeGreaterThanOrEqual(1);
    for (const def of stairs) {
      for (const rot of [0, 1, 2, 3] as const) {
        const g = stairGeometry({ id: 's', defId: def.id, level: 0, x: 10, z: 10, rot } as Lot['objects'][string], def)!;
        const inside = new Set(g.footprint.map((t) => `${t.x},${t.z}`));
        expect(g.links.length, `${def.id} links`).toBe(def.stair!.kind === 'straight' ? def.footprint.w : 1);
        for (const l of g.links) {
          const name = `${def.id} rot ${rot}`;
          expect(inside.has(`${l.foot.x},${l.foot.z}`), `${name}: foot outside`).toBe(false);
          expect(inside.has(`${l.head.x},${l.head.z}`), `${name}: head outside`).toBe(false);
          const adj = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === 1;
          expect(adj(l.foot, l.cells[0]!), `${name}: foot next to the first step`).toBe(true);
          expect(adj(l.cells[l.cells.length - 1]!, l.head), `${name}: head next to the last step`).toBe(true);
          for (let i = 1; i < l.cells.length; i++) expect(adj(l.cells[i - 1]!, l.cells[i]!), `${name}: step ${i}`).toBe(true);
          expect(l.cells.length, `${name}: walks ${def.stair!.length} steps`).toBe(def.stair!.length);
          expect(l.cells.every((c) => inside.has(`${c.x},${c.z}`))).toBe(true);
          expect(l.head.level).toBe(1);
        }
      }
    }
  });

  it('placing a stair cuts the stairwell out of the floor above; undo and redo restore it exactly', () => {
    const e = setup();
    groundRoom(e);
    expect(e.run(placeRoom(e.lot.id, e.hh.id, 1, { x: 4, z: 4 }, { x: 12, z: 12 }, { floor: OAK })).ok).toBe(true);
    const before = json({ floors: e.lot.floors, funds: e.hh.funds });
    const buy = buyObject(e.lot.id, e.hh.id, { defId: STAIR, x: 6, z: 6, rot: 0, level: 0 });
    expect(e.run(buy)).toEqual({ ok: true });
    for (const z of [6, 7, 8]) expect(e.lot.floors[tileKey(1, 6, z)]).toBeUndefined();
    expect(e.lot.floors[tileKey(1, 6, 5)]).toBeDefined();
    expect(stairHoles(e.lot, db, 1).size).toBe(3);
    expect(levelProblems(e.lot, db)).toEqual([]);
    expect(e.stack.undo(e.ctx)).toBeTruthy();
    same(json({ floors: e.lot.floors, funds: e.hh.funds }), before);
    expect(e.stack.redo(e.ctx)).toBeTruthy();
    expect(e.lot.floors[tileKey(1, 6, 7)]).toBeUndefined();
    expect(lotStairs(e.lot, db)).toHaveLength(1);
  });

  it('the stairwell stays open: floors painted over it are skipped or refused', () => {
    const e = setup();
    groundRoom(e);
    expect(e.run(buyObject(e.lot.id, e.hh.id, { defId: STAIR, x: 6, z: 6, rot: 0, level: 0 })).ok).toBe(true);
    // a room on level 1 over the room below: floor everywhere but the stairwell
    expect(e.run(placeRoom(e.lot.id, e.hh.id, 1, { x: 4, z: 4 }, { x: 12, z: 12 }, { floor: OAK })).ok).toBe(true);
    expect(Object.keys(e.lot.floors).filter((k) => k.startsWith('1:')).length).toBe(61);
    expect(e.lot.floors[tileKey(1, 6, 7)]).toBeUndefined();
    expect(levelProblems(e.lot, db)).toEqual([]);
  });

  it('refuses stairs with no floor above, a wall in the foot and furniture in the stairwell', () => {
    const e = setup();
    groundRoom(e);
    // level 2 has no level above it
    expect(validatePlacement(e.state, db, e.lot.id, { defId: STAIR, x: 6, z: 7, rot: 0, level: 2 }).reasons.join(' ')).toMatch(/no floor above|needs floor/i);
    // a wall across the foot (the flight x 6, z 6..8 starts at (6, 9): the wall on z = 9 stands between)
    expect(e.run(placeWallRun(e.lot.id, e.hh.id, 0, { x: 5, z: 9 }, { x: 8, z: 9 })).ok).toBe(true);
    const foot = validatePlacement(e.state, db, e.lot.id, { defId: STAIR, x: 6, z: 6, rot: 0, level: 0 });
    expect(foot.ok).toBe(false);
    expect(foot.reasons.join(' ')).toMatch(/foot of the stairs/i);
  });

  it('upstairs furniture in the stairwell has to move before the stairs go in', () => {
    const e = setup();
    groundRoom(e);
    expect(e.run(placeRoom(e.lot.id, e.hh.id, 1, { x: 4, z: 4 }, { x: 12, z: 12 }, { floor: OAK })).ok).toBe(true);
    expect(e.run(buyObject(e.lot.id, e.hh.id, { defId: 'table-coffee', x: 6, z: 7, rot: 0, level: 1 })).ok).toBe(true);
    const v = validatePlacement(e.state, db, e.lot.id, { defId: STAIR, x: 6, z: 6, rot: 0, level: 0 });
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/floor above first/i);
  });

  it('furniture upstairs needs floor under it', () => {
    const e = setup();
    groundRoom(e);
    const v = validatePlacement(e.state, db, e.lot.id, { defId: 'table-coffee', x: 6, z: 6, rot: 0, level: 1 });
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/needs floor under it/i);
  });

  it('a staircase can be sold and the sale undone', () => {
    const e = setup();
    groundRoom(e);
    expect(e.run(buyObject(e.lot.id, e.hh.id, { defId: STAIR, x: 6, z: 6, rot: 0, level: 0 })).ok).toBe(true);
    const id = Object.values(e.lot.objects).find((o) => o.defId === STAIR)!.id;
    expect(e.run(sellObject(e.lot.id, e.hh.id, id)).ok).toBe(true);
    expect(Object.values(e.lot.objects).some((o) => o.defId === STAIR)).toBe(false);
    expect(e.stack.undo(e.ctx)).toBeTruthy();
    expect(e.lot.objects[id]).toBeDefined();
  });
});

describe('navigation across levels', () => {
  /** Ground room + level-1 room + stair at (6,7) rising north; head tile (6,6) upstairs. */
  function twoStorey(): Env {
    const e = setup();
    groundRoom(e);
    expect(e.run(buyObject(e.lot.id, e.hh.id, { defId: STAIR, x: 6, z: 6, rot: 0, level: 0 })).ok).toBe(true);
    expect(e.run(placeRoom(e.lot.id, e.hh.id, 1, { x: 4, z: 4 }, { x: 12, z: 12 }, { floor: OAK })).ok).toBe(true);
    return e;
  }

  it('upper tiles are only walkable where there is floor, and never in the stairwell', () => {
    const e = twoStorey();
    expect(e.nav.isWalkable(e.lot.id, 1, 5, 5)).toBe(true);
    expect(e.nav.isWalkable(e.lot.id, 1, 6, 7)).toBe(false); // stairwell
    expect(e.nav.isWalkable(e.lot.id, 1, 14, 14)).toBe(false); // no floor
    expect(e.nav.isWalkable(e.lot.id, 0, 14, 14)).toBe(true); // the yard
  });

  it('one graph: a path from the yard to a tile upstairs climbs the stair and carries levels and rises', () => {
    const e = twoStorey();
    // the door: the room has no door yet, so open the foot side with a gap in the wall
    expect(e.run(buildCommand(e.lot.id, e.hh.id, { kind: 'placeOpening', defId: 'door-panel', wallId: edgeKey(0, 'h', 8, 12) })).ok).toBe(true);
    const path = e.nav.findPath(e.lot.id, 0, { x: 12, z: 23 }, [{ x: 8, z: 5, level: 1 }]);
    expect(path).not.toBeNull();
    const nodes = path!;
    expect(nodes.every((t) => t.level !== undefined)).toBe(true);
    expect(nodes[nodes.length - 1]).toMatchObject({ x: 8, z: 5, level: 1 });
    const stairNodes = nodes.filter((t) => t.rise);
    expect(stairNodes.length).toBe(3);
    expect(stairNodes.map((t) => t.rise)).toEqual([0.5, 1.5, 2.5]);
    expect(stairNodes.every((t) => t.level === 0)).toBe(true);
    // the first tile upstairs is the head of the stair
    const firstUp = nodes.find((t) => t.level === 1)!;
    expect(firstUp).toMatchObject({ x: 6, z: 5 });
    // and back down again
    const down = e.nav.findPath(e.lot.id, 1, { x: 8, z: 5 }, [{ x: 12, z: 23, level: 0 }]);
    expect(down).not.toBeNull();
    expect(down!.find((t) => t.rise)?.level).toBe(0);
    expect(down![down!.length - 1]).toMatchObject({ x: 12, z: 23, level: 0 });
  });

  it('paths that stay on one level are exactly the old kind (no level fields)', () => {
    const e = twoStorey();
    const flat = e.nav.findPath(e.lot.id, 0, { x: 12, z: 23 }, [{ x: 12, z: 18 }]);
    expect(flat).not.toBeNull();
    expect(flat!.every((t) => t.level === undefined && t.rise === undefined)).toBe(true);
    const upstairs = e.nav.findPath(e.lot.id, 1, { x: 8, z: 5 }, [{ x: 10, z: 5 }]);
    expect(upstairs!.every((t) => t.level === undefined)).toBe(true);
  });

  it('without a staircase an upper tile is unreachable', () => {
    const e = setup();
    groundRoom(e);
    expect(e.run(placeRoom(e.lot.id, e.hh.id, 1, { x: 4, z: 4 }, { x: 12, z: 12 }, { floor: OAK })).ok).toBe(true);
    expect(e.nav.findPath(e.lot.id, 0, { x: 12, z: 23 }, [{ x: 8, z: 5, level: 1 }])).toBeNull();
  });

  it('slots of upstairs furniture carry their level, so people route to the right floor', () => {
    const e = twoStorey();
    expect(e.run(buyObject(e.lot.id, e.hh.id, { defId: 'bed-single-pine', x: 9, z: 6, rot: 0, level: 1 })).ok).toBe(true);
    const bed = Object.values(e.lot.objects).find((o) => o.defId === 'bed-single-pine')!;
    const slots = e.nav.slotsOf(e.lot.id, bed.id);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.level === 1 && s.approach.level === 1)).toBe(true);
  });

  it('stair links come from the stair objects only', () => {
    const e = twoStorey();
    expect(stairLinks(e.lot, db)).toHaveLength(1);
  });
});

describe('simulation sees the furniture of every connected floor', () => {
  it('upstairs furniture is offered to people downstairs only while a staircase with floor at both ends joins the floors', () => {
    const e = setup();
    groundRoom(e);
    expect(e.run(buyObject(e.lot.id, e.hh.id, { defId: STAIR, x: 6, z: 6, rot: 0, level: 0 })).ok).toBe(true);
    expect(e.run(placeRoom(e.lot.id, e.hh.id, 1, { x: 4, z: 4 }, { x: 12, z: 12 }, { floor: OAK })).ok).toBe(true);
    expect(e.run(buyObject(e.lot.id, e.hh.id, { defId: 'bed-single-pine', x: 9, z: 6, rot: 0, level: 1 })).ok).toBe(true);
    expect(e.run(buyObject(e.lot.id, e.hh.id, { defId: 'table-coffee', x: 9, z: 9, rot: 0, level: 0 })).ok).toBe(true);
    const ctx = { state: e.state, content: db };
    const names = (level: number) => lotObjects(ctx, e.lot.id, level).map((r) => r.def.id).sort();
    expect(connectedLevels(e.lot, db, 0)).toEqual(new Set([0, 1]));
    expect(names(0)).toContain('bed-single-pine');
    expect(names(1)).toContain('table-coffee');
    // a lot without a staircase keeps the old rule: only the floor the person is on
    const plain = setup();
    groundRoom(plain);
    expect(plain.run(buyObject(plain.lot.id, plain.hh.id, { defId: 'table-coffee', x: 9, z: 9, rot: 0, level: 0 })).ok).toBe(true);
    expect(lotObjects({ state: plain.state, content: db }, plain.lot.id, 1)).toEqual([]);
    // the head of the stair loses its floor: the floors are no longer connected
    delete e.lot.floors[tileKey(1, 6, 5)];
    expect(connectedLevels(e.lot, db, 0)).toEqual(new Set([0]));
    expect(names(0)).not.toContain('bed-single-pine');
  });

  it('placing stairs with no floor at the top is allowed, with a warning', () => {
    const e = setup();
    groundRoom(e);
    const v = validatePlacement(e.state, db, e.lot.id, { defId: STAIR, x: 6, z: 6, rot: 0, level: 0 });
    expect(v.ok).toBe(true);
    expect(v.warnings.join(' ')).toMatch(/needs a floor above/i);
  });
});

describe('lotCheck on every level', () => {
  it('the neighbourhood house with a loft is usable on both floors', () => {
    const state = createEmptyWorld(7, 'create');
    const lot = createLot(state, { name: 'h', address: '3', width: 24, depth: 24, kind: 'residential', landValue: 1, entry: { x: 12, z: 23, level: 0 } });
    buildResidentialLot(state, db, lot.id, 5);
    expect(lot.levels).toBe(2);
    expect(Object.keys(lot.floors).some((k) => k.startsWith('1:'))).toBe(true);
    expect(lotProblems(state, db, lot.id)).toEqual([]);
    // the loft is reached through the stair: take it away and the upper floor is reported
    const stair = Object.values(lot.objects).find((o) => o.defId === STAIR)!;
    delete lot.objects[stair.id];
    const problems = lotProblems(state, db, lot.id);
    expect(problems.some((p) => /floor 2/i.test(p))).toBe(true);
  });

  it('upper-floor problems are named: unsupported floors, bare walls, furniture without floor', () => {
    const state = createEmptyWorld(7, 'create');
    const lot = createLot(state, { name: 'h', address: '3', width: 24, depth: 24, kind: 'residential', landValue: 1, entry: { x: 12, z: 23, level: 0 } });
    lot.floors[tileKey(1, 15, 15)] = { ...OAK };
    lot.walls[edgeKey(1, 'h', 3, 3)] = { id: edgeKey(1, 'h', 3, 3), level: 1, dir: 'h', x: 3, z: 3, height: 2.8, sideA: { designId: 'plain-paint', paletteId: 'x' }, sideB: { designId: 'plain-paint', paletteId: 'x' } };
    const text = levelProblems(lot, db).map((p) => p.text).join(' | ');
    expect(text).toMatch(/balcony can reach|needs a wall or a floored room/);
    expect(text).toMatch(/upper wall needs floor/i);
  });
});

describe('undo and redo on level 1', () => {
  it('a room on level 1 builds, undoes and redoes with exact money and lot state', () => {
    const e = setup();
    groundRoom(e);
    const lot0 = json(e.lot);
    const funds0 = e.hh.funds;
    expect(e.run(placeRoom(e.lot.id, e.hh.id, 1, { x: 4, z: 4 }, { x: 8, z: 8 }, { floor: OAK }))).toEqual({ ok: true });
    const lot1 = json(e.lot);
    const funds1 = e.hh.funds;
    expect(funds1).toBeLessThan(funds0);
    expect(e.lot.levels).toBe(2);
    expect(e.stack.undo(e.ctx)).toBeTruthy();
    same(json(e.lot), lot0);
    expect(e.hh.funds).toBe(funds0);
    expect(e.lot.levels).toBe(1);
    expect(e.stack.redo(e.ctx)).toBeTruthy();
    same(json(e.lot), lot1);
    expect(e.hh.funds).toBe(funds1);
    expect(e.lot.levels).toBe(2);
  });
});

describe('save round trip', () => {
  it('a two-storey lot and a person on a staircase survive migrate and validation', () => {
    const state = createEmptyWorld(7, 'create');
    const lot = createLot(state, { name: 'h', address: '3', width: 24, depth: 24, kind: 'residential', landValue: 1, entry: { x: 12, z: 23, level: 0 } });
    buildResidentialLot(state, db, lot.id, 5);
    const hh = addHousehold(state, 'Fam', 100000, lot.id, true);
    lot.ownerHouseholdId = hh.id;
    state.activeHouseholdId = hh.id;
    state.activeLotId = lot.id;
    const raw = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    const r = migrate(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const back = r.state.lots[lot.id]!;
    expect(back.levels).toBe(2);
    same(json(back.floors), json(lot.floors));
    same(json(back.walls), json(lot.walls));
    same(json(back.objects), json(lot.objects));
    const v = validateWorld(r.state, db);
    expect(v.errors).toEqual([]);
  });

  it('an old save (one level) keeps loading, a bad level count is repaired', () => {
    const state = createEmptyWorld(7, 'create');
    const lot = createLot(state, { name: 'h', address: '3', width: 24, depth: 24, kind: 'residential', landValue: 1, entry: { x: 12, z: 23, level: 0 } });
    const raw = JSON.parse(JSON.stringify(state)) as { lots: Record<string, { levels: number; floors: Record<string, unknown> }> };
    raw.lots[lot.id]!.levels = 9;
    raw.lots[lot.id]!.floors['1:3:3'] = { designId: 'oak-planks', paletteId: 'oak-planks-p0' };
    const r = migrate(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.lots[lot.id]!.levels).toBe(2);
  });
});
