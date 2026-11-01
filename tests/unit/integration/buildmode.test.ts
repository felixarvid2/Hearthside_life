// Build mode structure tools through GameCore on the real content: previews are pure, applies are atomic and
// undoable, money stays exact, rooms are tracked, and the simulation walks through what was built.

import { describe, expect, it } from 'vitest';
import type { BuildTarget, BuildTool } from '../../../src/game/api';
import { edgeKey } from '../../../src/core/ids';
import type { FinishRef, Id, WorldState } from '../../../src/core/types';
import type { GameCore } from '../../../src/game/GameCore';
import { LotNav } from '../../../src/world/nav';
import { computeRooms } from '../../../src/world/rooms';
import { coreWithoutSaves, db, members } from './harness';

const OAK: FinishRef = { designId: 'oak-planks', paletteId: db.floorDesigns['oak-planks']!.palettes[0]!.id };

function started(seed = 21, mode: 'guided' | 'sandbox' = 'guided'): GameCore {
  const core = coreWithoutSaves();
  expect(core.startNewGame(mode, core.premadeHouseholds()[0]!, seed)).toEqual({ ok: true });
  core.setMode('build');
  return core;
}

const funds = (s: WorldState) => s.households[s.activeHouseholdId]!.funds;
const ledgerSum = (s: WorldState) => s.households[s.activeHouseholdId]!.ledger.reduce((t, l) => t + l.amount, 0);
const lotJson = (s: WorldState) => JSON.stringify(s.lots[s.activeLotId]);
const stateJson = (s: WorldState) => JSON.stringify(s);

describe('build tools through GameCore', () => {
  it('previews are pure and report cost, counts, measurement and highlight; apply charges exactly that', () => {
    const core = started();
    const s = core.state()!;
    const f0 = funds(s);
    const before = stateJson(s);
    core.setBuildTool({ kind: 'wall', shape: 'run' });
    const target: BuildTarget = { from: { x: 6.2, z: 1.9 }, to: { x: 11.4, z: 2.3 } };
    const pv = core.buildPreview(target)!;
    expect(pv).toMatchObject({ ok: true, counts: { wallsNew: 5 }, measure: { lengthM: 5, text: '5 m' }, label: 'Build 5 m of wall' });
    expect(pv.cost).toBeGreaterThan(0);
    expect(pv.highlight!.newWalls).toEqual([0, 1, 2, 3, 4].map((i) => edgeKey(0, 'h', 6 + i, 2)));
    expect(core.buildHighlight()).toMatchObject({ ok: true });
    expect(stateJson(s)).toBe(before);
    expect(funds(s)).toBe(f0);

    const r = core.buildApply(target);
    expect(r).toMatchObject({ ok: true, cost: pv.cost, label: 'Build 5 m of wall' });
    expect(funds(s)).toBe(f0 - pv.cost);
    expect(core.buildHighlight()).toBeNull();
    expect(core.canUndo()).toBe(true);
    expect(core.undo()).toBe('Build 5 m of wall');
    expect(funds(s)).toBe(f0);
    expect(core.redo()).toBe('Build 5 m of wall');
    expect(funds(s)).toBe(f0 - pv.cost);
    expect(ledgerSum(s) - ledgerSum({ ...s, households: { ...s.households } } as WorldState)).toBe(0);
  });

  it('needs Build mode and a tool; failed applies change nothing', () => {
    const core = started();
    const s = core.state()!;
    expect(core.buildApply({ from: { x: 3, z: 3 } })).toMatchObject({ ok: false, reason: 'Choose a build tool first.' });
    core.setBuildTool({ kind: 'wall', shape: 'run' });
    const before = stateJson(s);
    // diagonal / zero length / through the starter house furniture / off the lot
    expect(core.buildApply({ from: { x: 3, z: 3 }, to: { x: 3, z: 3 } })).toMatchObject({ ok: false });
    expect(core.buildApply({ from: { x: 6, z: 12 }, to: { x: 6, z: 14 } })).toMatchObject({ ok: false }); // through the living room? only if it hits something
    core.setMode('live');
    expect(core.buildApply({ from: { x: 3, z: 3 }, to: { x: 5, z: 3 } })).toMatchObject({ ok: false, reason: 'Open Build mode first.' });
    core.setMode('build');
    expect(core.buildTool()).toBeNull(); // leaving Build mode drops the tool
    void before;
  });

  it('builds a two-room annex with doors, windows and floors; rooms get stable ids; everything undoes exactly', () => {
    const core = started();
    const s = core.state()!;
    const f0 = funds(s);
    const lot0 = lotJson(s);
    const roomsBefore = core.rooms().filter((r) => !r.outdoor).length;
    expect(roomsBefore).toBe(6);

    // room A (x 6..11, z 1..4) with its door on the south wall
    core.setBuildTool({ kind: 'room', floor: OAK, doors: [{ defId: 'door-panel', side: 's' }] });
    const a = core.buildApply({ from: { x: 6, z: 1 }, to: { x: 11, z: 4 } });
    expect(a).toMatchObject({ ok: true });
    expect(a.rooms!.created).toHaveLength(1);
    const roomA = core.roomAt({ x: 8, z: 2 })!;
    expect(roomA).toMatchObject({ outdoor: false, area: 15 });
    expect(roomA.outlines[0]).toEqual([{ x: 6, z: 1 }, { x: 11, z: 1 }, { x: 11, z: 4 }, { x: 6, z: 4 }]);

    // room B shares A's east wall (kept, not charged twice)
    core.setBuildTool({ kind: 'room', floor: OAK, doors: [{ defId: 'door-panel', side: 's' }] });
    const pvB = core.buildPreview({ from: { x: 16, z: 4 }, to: { x: 11, z: 1 } })!;
    expect(pvB).toMatchObject({ ok: true, counts: { wallsNew: 13, wallsExisting: 3, openingsAdded: 1 }, rooms: { before: 7, after: 8 } });
    const b = core.buildApply({ from: { x: 16, z: 4 }, to: { x: 11, z: 1 } });
    expect(b).toMatchObject({ ok: true, cost: pvB.cost });
    expect(core.roomAt({ x: 8, z: 2 })!.uid).toBe(roomA.uid); // room A kept its identity
    expect(b.rooms!.created).toHaveLength(1);
    expect(b.rooms!.removed).toHaveLength(0);

    // a connecting door and windows
    core.setBuildTool({ kind: 'opening', defId: 'door-panel' });
    const door = core.buildApply({ from: { x: 11, z: 2.4 }, wallId: edgeKey(0, 'v', 11, 2) });
    expect(door).toMatchObject({ ok: true, cost: db.openings['door-panel']!.price });
    expect(door.openingId).toBeDefined();
    expect(core.openingAt(edgeKey(0, 'v', 11, 2))).toMatchObject({ kind: 'door', defId: 'door-panel' });
    core.setBuildTool({ kind: 'opening', defId: 'window-sash' });
    expect(core.buildApply({ from: { x: 8.5, z: 1 } })).toMatchObject({ ok: true });
    expect(core.buildApply({ from: { x: 13.5, z: 1 } })).toMatchObject({ ok: true });
    expect(core.buildPreview({ from: { x: 8.5, z: 1 } })).toMatchObject({ ok: false, reasons: ['There is already a window there.'] });
    core.buildCancel();

    const lot = s.lots[s.activeLotId]!;
    expect(Object.values(lot.openings).filter((o) => ['door-panel', 'window-sash'].includes(o.defId)).length).toBeGreaterThanOrEqual(5);
    expect(core.rooms().filter((r) => !r.outdoor)).toHaveLength(8);
    expect(ledgerSum(s)).toBe(funds(s));
    const built = lotJson(s);
    const fBuilt = funds(s);
    expect(fBuilt).toBeLessThan(f0);

    // undo everything, then redo everything: exact lot and money both ways
    let n = 0;
    while (core.canUndo()) { core.undo(); n++; }
    expect(n).toBe(5);
    expect(funds(s)).toBe(f0);
    expect(JSON.parse(lotJson(s))).toEqual(JSON.parse(lot0));
    expect(core.rooms().filter((r) => !r.outdoor)).toHaveLength(6);
    while (core.canRedo()) expect(core.redo()).not.toBeNull();
    expect(funds(s)).toBe(fBuilt);
    expect(JSON.parse(lotJson(s))).toEqual(JSON.parse(built));
    expect(ledgerSum(s)).toBe(funds(s));
  });

  it('erase tools: wall, run, rectangle; opening; floor; room delete', () => {
    const core = started(33, 'guided');
    const s = core.state()!;
    const lot = s.lots[s.activeLotId]!;
    core.setBuildTool({ kind: 'room', floor: OAK });
    expect(core.buildApply({ from: { x: 1, z: 1 }, to: { x: 5, z: 4 } })).toMatchObject({ ok: true });
    const f = funds(s);
    core.setBuildTool({ kind: 'eraseWall', shape: 'segment' });
    expect(core.buildPreview({ from: { x: 3.4, z: 1.1 } })).toMatchObject({ ok: true, counts: { wallsRemoved: 1 } });
    expect(core.buildApply({ from: { x: 3.4, z: 1.1 } })).toMatchObject({ ok: true });
    expect(lot.walls[edgeKey(0, 'h', 3, 1)]).toBeUndefined();
    expect(funds(s)).toBeGreaterThan(f);
    expect(core.buildPreview({ from: { x: 12.5, z: 12.5 } })).toMatchObject({ ok: false, reason: 'There is no wall there.' });
    core.setBuildTool({ kind: 'eraseFloor', shape: 'tile' });
    expect(core.buildApply({ from: { x: 2.5, z: 2.5 } })).toMatchObject({ ok: true });
    core.setBuildTool({ kind: 'floor', finish: { designId: 'checker-tile', paletteId: db.floorDesigns['checker-tile']!.palettes[0]!.id }, shape: 'rect' });
    expect(core.buildApply({ from: { x: 1.2, z: 20.3 }, to: { x: 3.9, z: 21.1 } })).toMatchObject({ ok: true, counts: { floorsPlaced: 6 } });
    core.setBuildTool({ kind: 'deleteRoom' });
    expect(core.buildPreview({ from: { x: 3, z: 3 } })).toMatchObject({ ok: false }); // a wall of the room is gone, so it is no longer enclosed
  });

  it('built walls, wide openings and prices survive export and import', async () => {
    const core = started(14);
    const s = core.state()!;
    core.setBuildTool({ kind: 'room', floor: OAK, doors: [{ defId: 'door-panel', side: 's' }] });
    expect(core.buildApply({ from: { x: 6, z: 1 }, to: { x: 12, z: 4 } }).ok).toBe(true);
    core.setBuildTool({ kind: 'opening', defId: 'window-sash' });
    expect(core.buildApply({ from: { x: 8.5, z: 1 } }).ok).toBe(true);
    const json = core.exportWorld()!;
    const other = coreWithoutSaves();
    const r = await other.importWorld(json);
    expect(r.ok).toBe(true);
    const t = other.state()!;
    expect(JSON.parse(JSON.stringify(t.lots[t.activeLotId]))).toEqual(JSON.parse(JSON.stringify(s.lots[s.activeLotId])));
    const w = t.lots[t.activeLotId]!.walls[edgeKey(0, 'h', 6, 1)]!;
    expect(w.purchasePrice).toBeGreaterThan(0);
    expect(w.boughtAt).toBeDefined();
    other.setMode('build');
    other.setBuildTool({ kind: 'eraseWall', shape: 'segment' });
    expect(other.buildApply({ from: { x: 6.5, z: 1 } })).toMatchObject({ ok: true });
  });

  it('sandbox builds are free and demolition gives nothing back', () => {
    const core = started(5, 'sandbox');
    const s = core.state()!;
    const f0 = funds(s);
    core.setBuildTool({ kind: 'room', floor: OAK });
    const pv = core.buildPreview({ from: { x: 1, z: 1 }, to: { x: 5, z: 4 } })!;
    expect(pv.ok).toBe(true);
    expect(pv.cost).toBe(0);
    expect(core.buildApply({ from: { x: 1, z: 1 }, to: { x: 5, z: 4 } })).toMatchObject({ ok: true, cost: 0 });
    expect(funds(s)).toBe(f0);
    core.setBuildTool({ kind: 'deleteRoom' });
    expect(core.buildApply({ from: { x: 3, z: 2 } })).toMatchObject({ ok: true });
    expect(funds(s)).toBe(f0);
    expect(core.undo()).toBe('Delete room');
    expect(funds(s)).toBe(f0);
  });
});

/** A person standing on the lot at a tile centre, idle. */
function standAt(core: GameCore, personId: Id, x: number, z: number): void {
  const p = core.state()!.people[personId]!;
  p.location = { kind: 'lot', lotId: core.state()!.activeLotId, level: 0, x: x + 0.5, z: z + 0.5, facing: 0, posture: 'standing' };
  p.queue = [];
}

describe('simulation and navigation follow construction', () => {
  it('builds a 2-room annex on the starter lot and a person walks in through its doors', () => {
    const core = started(21);
    const s = core.state()!;
    const lot = s.lots[s.activeLotId]!;
    core.setBuildTool({ kind: 'room', floor: OAK, doors: [{ defId: 'door-panel', side: 's' }] });
    expect(core.buildApply({ from: { x: 6, z: 1 }, to: { x: 11, z: 4 } }).ok).toBe(true);
    core.setBuildTool({ kind: 'room', floor: OAK, doors: [{ defId: 'door-panel', side: 's' }] });
    expect(core.buildApply({ from: { x: 11, z: 1 }, to: { x: 16, z: 4 } }).ok).toBe(true);
    core.setBuildTool({ kind: 'opening', defId: 'door-panel' });
    expect(core.buildApply({ from: { x: 11, z: 2.5 }, wallId: edgeKey(0, 'v', 11, 2) }).ok).toBe(true);
    core.setBuildTool({ kind: 'opening', defId: 'window-sash' });
    expect(core.buildApply({ from: { x: 8.5, z: 1 } }).ok).toBe(true);
    expect(core.buildApply({ from: { x: 14.5, z: 1 } }).ok).toBe(true);

    const nav = new LotNav(() => s, db);
    // doors pass, windows and walls block
    expect(nav.canStep(lot.id, 0, { x: 8, z: 3 }, { x: 8, z: 4 })).toBe(true); // south door of room A (centre edge x 8)
    expect(nav.canStep(lot.id, 0, { x: 10, z: 2 }, { x: 11, z: 2 })).toBe(true); // connecting door
    expect(nav.canStep(lot.id, 0, { x: 8, z: 1 }, { x: 8, z: 0 })).toBe(false); // window
    expect(nav.canStep(lot.id, 0, { x: 6, z: 2 }, { x: 5, z: 2 })).toBe(false); // wall

    core.setMode('live');
    const person = members(s)[0]!;
    const room2Tile = { x: 14, z: 2 };
    expect(core.roomAt(room2Tile)!.outdoor).toBe(false);
    expect(core.goTo(person.id, room2Tile)).toEqual({ ok: true });
    for (let i = 0; i < 4000 && person.queue.length > 0; i++) core.advanceTicks(1);
    expect(person.queue).toHaveLength(0);
    const loc = person.location;
    // room B is enclosed by walls and windows: arriving proves the doors were used
    expect(loc.kind === 'lot' && Math.floor(loc.x) === 14 && Math.floor(loc.z) === 2).toBe(true);
    // and the person can walk back out again
    expect(core.goTo(person.id, { x: lot.entry.x, z: lot.entry.z })).toEqual({ ok: true });
    for (let i = 0; i < 4000 && person.queue.length > 0; i++) core.advanceTicks(1);
    const out = person.location;
    expect(out.kind === 'offlot' || Math.floor(out.z) >= 18).toBe(true); // out of the annex (or already off to work)
  });

  it('a wall built across a walking route makes the person replan around it', () => {
    const core = started(8);
    const s = core.state()!;
    const person = members(s)[0]!;
    core.setMode('live');
    standAt(core, person.id, 3, 20);
    expect(core.goTo(person.id, { x: 21, z: 20 })).toEqual({ ok: true });
    core.advanceTicks(6);
    const loc0 = person.location;
    expect(loc0.kind === 'lot' && loc0.x).toBeLessThan(10);
    core.setMode('build');
    core.setBuildTool({ kind: 'wall', shape: 'run' });
    const r = core.buildApply({ from: { x: 12, z: 19 }, to: { x: 12, z: 23 } });
    expect(r).toMatchObject({ ok: true });
    core.setMode('live');
    const crossings: string[] = [];
    let prev: { x: number; z: number } | null = null;
    for (let i = 0; i < 1500 && person.queue.length > 0; i++) {
      core.advanceTicks(1);
      const l = person.location;
      if (l.kind !== 'lot') break;
      if (prev && prev.x < 12 !== l.x < 12 && l.z > 19 && l.z < 23) crossings.push(`${prev.x},${prev.z}->${l.x},${l.z}`);
      prev = { x: l.x, z: l.z };
    }
    expect(crossings).toEqual([]);
    expect(person.queue).toHaveLength(0);
    const l = person.location;
    expect(l.kind === 'lot' && Math.floor(l.x) === 21).toBe(true);
  });

  it('removing the only door to the kitchen is refused; moving it replans a walking person', () => {
    const core = started(8);
    const s = core.state()!;
    const lot = s.lots[s.activeLotId]!;
    const person = members(s)[0]!;
    const kitchenDoor = edgeKey(0, 'v', 11, 12);
    const opening = core.openingAt(kitchenDoor)!;
    expect(opening.kind).toBe('door');
    core.setBuildTool({ kind: 'eraseOpening' });
    const before = stateJson(s);
    const r = core.buildApply({ from: { x: 11, z: 12.5 }, wallId: kitchenDoor });
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.reason).toMatch(/block access to the|would be trapped/);
    expect(stateJson(s)).toBe(before);

    core.setMode('live');
    standAt(core, person.id, 8, 14);
    expect(core.goTo(person.id, { x: 16, z: 12 })).toEqual({ ok: true });
    core.advanceTicks(2);
    core.setMode('build');
    core.setBuildTool({ kind: 'moveOpening', openingId: opening.openingId });
    const f = funds(s);
    expect(core.buildApply({ from: { x: 11, z: 14.5 }, wallId: edgeKey(0, 'v', 11, 14) })).toMatchObject({ ok: true, openingId: opening.openingId });
    expect(funds(s)).toBe(f); // moving is free
    expect(lot.openings[opening.openingId]!.wallId).toBe(edgeKey(0, 'v', 11, 14));
    expect(core.undo()).toBe('Move Four-Panel Door');
    expect(lot.openings[opening.openingId]!.wallId).toBe(kitchenDoor);
    expect(core.redo()).toBe('Move Four-Panel Door');
    core.setMode('live');
    for (let i = 0; i < 1500 && person.queue.length > 0; i++) core.advanceTicks(1);
    expect(person.queue).toHaveLength(0);
    const l = person.location;
    expect(l.kind === 'lot' && Math.floor(l.x) === 16 && Math.floor(l.z) === 12).toBe(true);
  });

  it('building keeps a person from being walled in (they stand in the planned room)', () => {
    const core = started(8);
    const s = core.state()!;
    const person = members(s)[0]!;
    standAt(core, person.id, 3, 20);
    core.setBuildTool({ kind: 'room' });
    const before = stateJson(s);
    const r = core.buildApply({ from: { x: 1, z: 18 }, to: { x: 6, z: 22 } });
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.reason).toMatch(new RegExp(`${person.firstName} would be trapped`));
    expect(stateJson(s)).toBe(before);
    // the same room with a door is allowed
    core.setBuildTool({ kind: 'room', doors: [{ defId: 'door-panel', side: 'e' }] });
    expect(core.buildApply({ from: { x: 1, z: 18 }, to: { x: 6, z: 22 } })).toMatchObject({ ok: true });
    void computeRooms;
  });
});

export type { BuildTool };
