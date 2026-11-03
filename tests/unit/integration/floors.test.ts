// Milestone 9: floors through GameCore on the real content: build a room, a staircase and an upper room with the build tools, walk a
// household member upstairs (slowly, smoothly, never stopping on the stairs), undo with somebody upstairs, and save and load it.

import { describe, expect, it } from 'vitest';
import type { BuildTool } from '../../../src/game/api';
import type { FinishRef } from '../../../src/core/types';
import { tileKey } from '../../../src/core/ids';
import type { GameCore } from '../../../src/game/GameCore';
import { atDayMinute } from '../../../src/core/clock';
import { levelProblems } from '../../../src/world/levels';
import { lotProblems } from '../../../src/world/lotCheck';
import { coreWithoutSaves, db, freshStore, members, Recorder } from './harness';

const OAK: FinishRef = { designId: 'oak-planks', paletteId: db.floorDesigns['oak-planks']!.palettes[0]!.id };
const STAIR = 'stair-straight-basic';

/** A sandbox game with an annex (8 x 4 m, door on the south side) north of the starter house, a staircase in it and a room above. */
function twoStorey(seed = 21): GameCore {
  const core = coreWithoutSaves();
  expect(core.startNewGame('sandbox', core.premadeHouseholds()[0]!, seed)).toEqual({ ok: true });
  core.setMode('build');
  const room = (tool: BuildTool, from: { x: number; z: number }, to: { x: number; z: number }, level: number) => {
    core.setBuildTool(tool);
    const r = core.buildApply({ from, to, level });
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
  };
  room({ kind: 'room', floor: OAK, doors: [{ defId: 'door-panel', side: 's' }] }, { x: 7, z: 0 }, { x: 15, z: 4 }, 0);
  // the flight lies along x (turned a quarter): foot on the east end at (11, 1), top on the west at (7, 1) upstairs
  core.setBuildTool({ kind: 'stairs', defId: STAIR, rot: 1 });
  const placed = core.buildApply({ from: { x: 9.5, z: 1.5 }, level: 0 });
  expect(placed, JSON.stringify(placed)).toMatchObject({ ok: true });
  room({ kind: 'room', floor: OAK }, { x: 7, z: 0 }, { x: 15, z: 4 }, 1);
  return core;
}

describe('floors through GameCore', () => {
  it('builds a staircase and an upper room with the build tools; the lot is consistent', () => {
    const core = twoStorey();
    const s = core.state()!;
    const lot = s.lots[s.activeLotId]!;
    expect(lot.levels).toBe(2);
    const stair = Object.values(lot.objects).find((o) => o.defId === STAIR)!;
    expect(stair).toMatchObject({ level: 0, x: 8, z: 1, rot: 1 });
    // the stairwell is open, the rest of the room above has floor
    for (const x of [8, 9, 10]) expect(lot.floors[tileKey(1, x, 1)]).toBeUndefined();
    expect(lot.floors[tileKey(1, 7, 1)]).toBeDefined();
    expect(levelProblems(lot, db)).toEqual([]);
    expect(lotProblems(s, db, lot.id)).toEqual([]);
    // rooms of the upper level are tracked separately
    expect(core.rooms(1).some((r) => !r.outdoor && r.level === 1)).toBe(true);
  });

  it('refuses what has no support, with a reason, and changes nothing', () => {
    const core = twoStorey();
    core.setBuildTool({ kind: 'floor', finish: OAK, shape: 'tile' });
    const pv = core.buildPreview({ from: { x: 20.5, z: 20.5 }, level: 1 })!;
    expect(pv.ok).toBe(false);
    expect(pv.reason).toMatch(/balcony|needs a wall/i);
    const before = JSON.stringify(core.state());
    expect(core.buildApply({ from: { x: 20.5, z: 20.5 }, level: 1 }).ok).toBe(false);
    expect(JSON.stringify(core.state())).toBe(before);
  });

  it('a household member walks upstairs: slower on the stairs, smoothly, ending on level 1', () => {
    const core = twoStorey();
    const s = core.state()!;
    core.setMode('live');
    const person = members(s)[0]!;
    expect(person.location.kind === 'lot' && person.location.level).toBe(0);
    // first into the annex, then up
    expect(core.goTo(person.id, { x: 12, z: 2 })).toEqual({ ok: true });
    for (let i = 0; i < 4000 && person.queue.length > 0; i++) core.advanceTicks(1);
    expect(person.queue).toHaveLength(0);
    expect(core.goTo(person.id, { x: 13, z: 2, level: 1 })).toEqual({ ok: true });
    let maxRise = 0;
    let riseTicks = 0;
    let stepsOnStairs: number[] = [];
    let last = -1;
    for (let i = 0; i < 4000 && person.queue.length > 0; i++) {
      core.advanceTicks(1);
      const loc = person.location;
      if (loc.kind !== 'lot') continue;
      const rise = (loc.rise ?? 0) + loc.level * 3;
      if (loc.rise) { riseTicks++; maxRise = Math.max(maxRise, loc.rise); }
      if (last >= 0 && loc.rise) stepsOnStairs.push(Math.abs(rise - last));
      last = loc.rise ? rise : -1;
    }
    stepsOnStairs = stepsOnStairs.filter((d) => d > 0);
    expect(person.queue).toHaveLength(0);
    const loc = person.location;
    expect(loc.kind === 'lot' && loc.level).toBe(1);
    expect(loc.kind === 'lot' && loc.rise).toBeUndefined();
    expect(loc.kind === 'lot' && Math.floor(loc.x) === 13 && Math.floor(loc.z) === 2).toBe(true);
    // they were on the stairs for several ticks, rose to more than 2 m, and never jumped more than half a metre in one tick
    expect(riseTicks).toBeGreaterThan(3);
    expect(maxRise).toBeGreaterThan(2);
    expect(Math.max(...stepsOnStairs)).toBeLessThan(0.5);
    // and back down
    expect(core.goTo(person.id, { x: 12, z: 2, level: 0 })).toEqual({ ok: true });
    for (let i = 0; i < 4000 && person.queue.length > 0; i++) core.advanceTicks(1);
    const down = person.location;
    expect(down.kind === 'lot' && down.level).toBe(0);
    expect(down.kind === 'lot' && down.rise).toBeUndefined();
  });

  it('undoing the upper room with somebody upstairs brings them down instead of leaving them in the air', () => {
    const core = twoStorey();
    const s = core.state()!;
    const person = members(s)[0]!;
    // somebody is up there when the room is taken back (they got there while the player was away from Build mode)
    person.location = { kind: 'lot', lotId: s.activeLotId, level: 1, x: 12.5, z: 2.5, facing: 0, posture: 'standing' };
    expect(core.undo()).toMatch(/room/i);
    core.advanceTicks(2);
    const loc = person.location;
    expect(loc.kind === 'lot' && loc.level).toBe(0);
    expect(loc.kind === 'lot' && loc.rise).toBeUndefined();
    // redo puts the room back (the staircase is still there)
    expect(core.redo()).toMatch(/room/i);
    expect(s.lots[s.activeLotId]!.levels).toBe(2);
  });

  it('a floor with somebody standing on it cannot be erased', () => {
    const core = twoStorey();
    const s = core.state()!;
    const person = members(s)[0]!;
    person.location = { kind: 'lot', lotId: s.activeLotId, level: 1, x: 12.5, z: 2.5, facing: 0, posture: 'standing' };
    core.setBuildTool({ kind: 'eraseFloor', shape: 'tile' });
    const pv = core.buildPreview({ from: { x: 12.5, z: 2.5 }, level: 1 })!;
    expect(pv.ok).toBe(false);
    expect(pv.reason).toMatch(/standing on that floor/i);
  });

  it('a staircase with somebody on it, or a lone person upstairs, cannot be sold', () => {
    const core = twoStorey();
    const s = core.state()!;
    core.setMode('live');
    const person = members(s)[0]!;
    expect(core.goTo(person.id, { x: 12, z: 2 })).toEqual({ ok: true });
    for (let i = 0; i < 4000 && person.queue.length > 0; i++) core.advanceTicks(1);
    expect(core.goTo(person.id, { x: 13, z: 2, level: 1 })).toEqual({ ok: true });
    for (let i = 0; i < 4000 && person.queue.length > 0; i++) core.advanceTicks(1);
    core.setMode('build');
    core.setBuildTool({ kind: 'eraseStairs' });
    const pv = core.buildPreview({ from: { x: 9.5, z: 1.5 }, level: 1 })!;
    expect(pv.ok).toBe(false);
    expect(pv.reason).toMatch(/stuck on another floor|stairs/i);
  });

  it('survives a save and load', async () => {
    const core = twoStorey();
    const s = core.state()!;
    const lotId = s.activeLotId;
    const store = await freshStore();
    const saved = await store.save('slot-1', 'floors', s);
    expect(saved.ok).toBe(true);
    const loaded = await store.load('slot-1');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const lot = loaded.state.lots[lotId]!;
    expect(lot.levels).toBe(2);
    expect(Object.keys(lot.floors).filter((k) => k.startsWith('1:'))).toHaveLength(Object.keys(s.lots[lotId]!.floors).filter((k) => k.startsWith('1:')).length);
    expect(Object.values(lot.objects).some((o) => o.defId === STAIR)).toBe(true);
  });

  it('a household lives in the two-storey house for three days: stairs used, nobody stuck, no route failures', () => {
    const core = coreWithoutSaves();
    expect(core.startNewGame('guided', core.premadeHouseholds()[0]!, 42)).toEqual({ ok: true });
    const s = core.state()!;
    s.settings.visitors = false;
    s.schedule = s.schedule.filter((e) => e.kind !== 'visitArrive');
    for (const p of members(s)) if (p.career) core.quitCareer(p.id);
    const house = Object.values(s.lots).find((l) => l.name === 'Hazelbank House')!;
    expect(house.levels).toBe(1); // lots are built on first use
    const hh = s.households[s.activeHouseholdId]!;
    hh.funds = 5_000_000;
    expect(core.movePreview(house.id)).toMatchObject({ ok: true });
    expect(core.moveHousehold(house.id)).toMatchObject({ ok: true });
    for (let i = 0; i < 90 * 4 && core.neighbourhood()!.trip !== null; i++) core.advanceTicks(1);
    expect(core.state()!.activeLotId).toBe(house.id);
    expect(house.levels).toBe(2);
    const rec = new Recorder(core);
    const seenLevels = new Set<number>();
    let maxRise = 0;
    const end = atDayMinute(3, 8 * 60);
    for (let i = 0; i < 20000 && core.state()!.clock.minutes < end; i++) {
      core.advanceTicks(1);
      for (const p of members(s)) {
        const loc = p.location;
        if (loc.kind === 'lot') { seenLevels.add(loc.level); maxRise = Math.max(maxRise, loc.rise ?? 0); }
      }
    }
    for (const p of members(s)) {
      const still = rec.longestStill.get(p.id);
      expect(still?.ticks ?? 0, `${p.firstName} stood still: ${still?.what}`).toBeLessThan(3 * 60 * 4);
      expect(rec.failureRuns.get(p.id) ?? 0, `${p.firstName} repeated route failures`).toBeLessThanOrEqual(2);
    }
    // nobody ends the run in the air or half way up a stair
    for (const p of members(s)) {
      const loc = p.location;
      if (loc.kind === 'lot') expect(loc.rise, `${p.firstName} stopped on the stairs`).toBeUndefined();
    }
    expect(seenLevels.has(1) || maxRise > 0).toBe(true); // somebody went upstairs (the loft has a desk, a sofa and a playroom)
    rec.dispose();
  });
});
