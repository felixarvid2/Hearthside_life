// Buy and Build through GameCore with tile input: undo/redo money exactness across buy, move, sell and paint;
// previews never change the state; autosave never captures a preview; paint targets, eyedropper and recents.

import { describe, expect, it } from 'vitest';
import { RESALE_RATE } from '../../../src/building/plans';
import { edgeKey, tileKey } from '../../../src/core/ids';
import type { FinishRef, WorldState } from '../../../src/core/types';
import { GameCore } from '../../../src/game/GameCore';
import { LotNav } from '../../../src/world/nav';
import { db, coreWithoutSaves, freshStore, members, objectsByDef } from './harness';

const STRIPES: FinishRef = { designId: 'stripes-regency', paletteId: 'duck-blue' };
const WALNUT: FinishRef = { designId: 'oak-planks', paletteId: 'walnut' };
/** Living room side ('a') of the wall between the living room and the kitchen. */
const LIVING_WALL = edgeKey(0, 'v', 11, 15);
const wallPick = (side: 'a' | 'b' = 'a') => ({ kind: 'wall' as const, wallId: LIVING_WALL, side, tile: side === 'a' ? { x: 10, z: 15 } : { x: 11, z: 15 }, level: 0 });

function guided(core: GameCore = coreWithoutSaves(), seed = 11): GameCore {
  expect(core.startNewGame('guided', core.premadeHouseholds()[0]!, seed)).toEqual({ ok: true });
  return core;
}

const funds = (s: WorldState) => s.households[s.activeHouseholdId]!.funds;
const ledgerSum = (s: WorldState) => s.households[s.activeHouseholdId]!.ledger.reduce((t, l) => t + l.amount, 0);
const lotJson = (s: WorldState) => JSON.stringify(s.lots[s.activeLotId]);

describe('undo and redo are exact for money, objects and finishes', () => {
  it('buy, move, rotate, paint, sell (old and new), then undo everything and redo everything', () => {
    const core = guided();
    const s = core.state()!;
    const lot = s.lots[s.activeLotId]!;
    const f0 = funds(s);
    const lot0 = lotJson(s);
    const bedPrice = db.objects['bed-single-pine']!.price;
    const wallPrice = db.wallDesigns['stripes-regency']!.price;
    const armchairId = objectsByDef(s, 'armchair-lounge')[0]!;
    const armchairValue = Math.round(lot.objects[armchairId]!.purchasePrice * RESALE_RATE);
    const steps: number[] = [f0];
    const check = () => { expect(ledgerSum(s)).toBe(funds(s)); };

    core.setMode('buy');
    expect(core.startPlacement('bed-single-pine')).toEqual({ ok: true });
    core.placementTile(2, 2);
    expect(core.placement()).toEqual(expect.objectContaining({ ok: true, cost: bedPrice, x: 2, z: 2, rot: 0, source: 'buy' }));
    const bought = core.confirmPlacement();
    expect(bought.ok).toBe(true);
    const bedId = bought.objectId!;
    expect(lot.objects[bedId]).toEqual(expect.objectContaining({ defId: 'bed-single-pine', x: 2, z: 2, rot: 0, ownerHouseholdId: s.activeHouseholdId }));
    expect(funds(s)).toBe(f0 - bedPrice);
    steps.push(funds(s)); check();

    expect(core.startMove(bedId)).toEqual({ ok: true });
    expect(core.placement()).toEqual(expect.objectContaining({ ok: true, cost: 0, source: 'move', objectId: bedId }));
    core.placementTile(2, 6);
    core.rotatePlacement(1);
    expect(core.placement()!.ok).toBe(true);
    expect(core.confirmPlacement()).toEqual({ ok: true, objectId: bedId });
    expect(lot.objects[bedId]).toEqual(expect.objectContaining({ x: 2, z: 6, rot: 1 }));
    expect(funds(s)).toBe(steps.at(-1));
    steps.push(funds(s)); check();

    core.setMode('build');
    core.setPaintTool({ kind: 'wall', finish: STRIPES, scope: 'side' });
    expect(core.paintPreview(wallPick())).toEqual({ ok: true, cost: wallPrice, count: 1 });
    expect(core.paintApply(wallPick())).toEqual({ ok: true });
    expect(lot.walls[LIVING_WALL]!.sideA).toEqual(STRIPES);
    expect(lot.walls[LIVING_WALL]!.sideB).not.toEqual(STRIPES); // the other side keeps its finish
    expect(funds(s)).toBe(steps.at(-1)! - wallPrice);
    steps.push(funds(s)); check();

    core.setMode('buy');
    expect(core.saleValue(armchairId)).toBe(armchairValue);
    expect(core.sell(armchairId)).toEqual({ ok: true });
    expect(lot.objects[armchairId]).toBeUndefined();
    expect(funds(s)).toBe(steps.at(-1)! + armchairValue);
    steps.push(funds(s)); check();

    expect(core.saleValue(bedId)).toBe(bedPrice); // same game day: full price back
    expect(core.sell(bedId)).toEqual({ ok: true });
    expect(funds(s)).toBe(steps.at(-1)! + bedPrice);
    steps.push(funds(s)); check();
    const lotAfter = lotJson(s);

    const labels: string[] = [];
    for (let i = steps.length - 2; i >= 0; i--) {
      labels.push(core.undo()!);
      expect(funds(s), `after undo ${labels.at(-1)}`).toBe(steps[i]);
      check();
    }
    const bed = db.objects['bed-single-pine']!.name, armchair = db.objects['armchair-lounge']!.name;
    expect(labels).toEqual([`Sell ${bed}`, `Sell ${armchair}`, 'Paint wall', `Move ${bed}`, `Buy ${bed}`]);
    expect(core.undo()).toBeNull();
    expect(JSON.parse(lotJson(s))).toEqual(JSON.parse(lot0)); // same ids, finishes, positions (key order may differ)
    expect(funds(s)).toBe(f0);

    for (let i = 1; i < steps.length; i++) {
      expect(core.redo()).not.toBeNull();
      expect(funds(s)).toBe(steps[i]);
      check();
    }
    expect(core.redo()).toBeNull();
    expect(JSON.parse(lotJson(s))).toEqual(JSON.parse(lotAfter));

    while (core.undo() !== null) { /* back to the start */ }
    expect(funds(s)).toBe(f0);
    expect(JSON.parse(lotJson(s))).toEqual(JSON.parse(lot0));
    // A new command clears the redo history.
    core.startPlacement('plant-potted');
    core.placementTile(3, 3);
    expect(core.confirmPlacement().ok).toBe(true);
    expect(core.canRedo()).toBe(false);
  });

  it('stores and places from inventory for free, and changes object finishes undoably', () => {
    const core = guided();
    const s = core.state()!;
    const lot = s.lots[s.activeLotId]!;
    const hh = s.households[s.activeHouseholdId]!;
    const f0 = funds(s);
    core.setMode('buy');
    const plant = objectsByDef(s, 'plant-potted')[0]!;
    const original = JSON.stringify(lot.objects[plant]);
    expect(core.store(plant)).toEqual({ ok: true });
    expect(hh.inventory.map((e) => e.object.id)).toEqual([plant]);
    expect(core.startPlaceFromInventory(0)).toEqual({ ok: true });
    core.placementTile(1, 1);
    expect(core.placement()).toEqual(expect.objectContaining({ ok: true, cost: 0, source: 'inventory', objectId: plant }));
    expect(core.confirmPlacement()).toEqual({ ok: true, objectId: plant });
    expect(lot.objects[plant]).toEqual(expect.objectContaining({ x: 1, z: 1 }));
    expect(hh.inventory).toEqual([]);
    const region = db.objects['plant-potted']!.finishes[0]!;
    const swatch = region.swatches.find((x) => x.id !== lot.objects[plant]!.finishes[region.id])!.id;
    expect(core.setObjectFinish(plant, region.id, swatch)).toEqual({ ok: true });
    expect(lot.objects[plant]!.finishes[region.id]).toBe(swatch);
    expect(core.setObjectFinish(plant, region.id, swatch).ok).toBe(false); // no-op is rejected
    core.undo();
    expect(lot.objects[plant]!.finishes[region.id]).not.toBe(swatch);
    expect(core.undo()).toMatch(/^Place/);
    expect(hh.inventory.map((e) => e.object.id)).toEqual([plant]);
    expect(core.undo()).toMatch(/^Store/);
    expect(JSON.stringify(lot.objects[plant])).toBe(original);
    expect(hh.inventory).toEqual([]);
    expect(funds(s)).toBe(f0);
  });

  it('refuses invalid placements and never charges for them', () => {
    const core = guided();
    const s = core.state()!;
    const f0 = funds(s);
    core.setMode('buy');
    core.startPlacement('bed-double-oak');
    core.placementTile(8, 16); // the front doorway
    const p = core.placement()!;
    expect(p.ok).toBe(false);
    expect(p.reasons.length).toBeGreaterThan(0);
    const r = core.confirmPlacement();
    expect(r.ok).toBe(false);
    expect(funds(s)).toBe(f0);
    expect(core.canUndo()).toBe(false);
    expect(core.startPlacement('no-such-thing').ok).toBe(false);
    // moving an object back to where it stands just ends the move
    const sofa = objectsByDef(s, 'sofa-tweed')[0]!;
    core.startMove(sofa);
    expect(core.placement()).toEqual(expect.objectContaining({ ok: true, reasons: [] }));
    expect(core.confirmPlacement()).toEqual({ ok: true, objectId: sofa });
    expect(core.placement()).toBeNull();
    expect(core.canUndo()).toBe(false);
    // the TV stand holds the TV: it cannot be moved until the TV is off it
    expect(core.startMove(objectsByDef(s, 'tv-stand-low')[0]!).ok).toBe(false);
  });
});

describe('build/buy edits and the people using the objects', () => {
  it('moving a sofa someone sits on and selling a bed someone naps in stand them up cleanly', () => {
    const core = coreWithoutSaves();
    core.startNewGame('create', core.premadeHouseholds()[1]!, 5);
    const s = core.state()!;
    const [theo, sasha] = members(s);
    const sofa = objectsByDef(s, 'sofa-tweed')[0]!;
    const bed = objectsByDef(s, 'bed-single-pine')[0]!;
    expect(core.queue(theo!.id, core.options(theo!.id, { kind: 'object', objectId: sofa }).find((o) => o.interactionId === 'sit')!).ok).toBe(true);
    expect(core.queue(sasha!.id, core.options(sasha!.id, { kind: 'object', objectId: bed }).find((o) => o.interactionId === 'nap')!).ok).toBe(true);
    const performing = (id: string) => s.people[id]!.queue[0]?.phase === 'perform';
    for (let i = 0; i < 400 && !(performing(theo!.id) && performing(sasha!.id)); i++) core.advanceTicks(1);
    expect(theo!.location).toEqual(expect.objectContaining({ posture: 'seated' }));
    expect(sasha!.location).toEqual(expect.objectContaining({ posture: 'lying' }));
    const failures: string[] = [];
    core.events.on('action.finished', (e) => { if (e.result === 'failed') failures.push(`${e.interactionId}: ${e.reason}`); });
    core.setMode('buy');
    const lot = s.lots[s.activeLotId]!;
    const so = lot.objects[sofa]!;
    expect(core.startMove(sofa)).toEqual({ ok: true });
    core.placementTile(so.x - 1, so.z);
    expect(core.confirmPlacement().ok).toBe(true);
    expect(core.sell(bed)).toEqual({ ok: true });
    expect(failures).toEqual([expect.stringMatching(/^sit: .*moved/), expect.stringMatching(/^nap: .*removed/)]);
    const nav = new LotNav(() => s, db);
    for (const p of [theo!, sasha!]) {
      const loc = p.location;
      if (loc.kind !== 'lot') throw new Error('left the lot');
      expect(loc.posture).toBe('standing');
      expect(p.queue).toEqual([]);
      expect(nav.isWalkable(lot.id, 0, Math.floor(loc.x), Math.floor(loc.z)), `${p.firstName} on a free tile`).toBe(true);
    }
    core.setMode('live');
    core.advanceTicks(4 * 60);
  });
});

describe('previews never change the state', () => {
  it('placement and paint previews over the whole lot leave the world byte-identical', () => {
    const core = guided();
    const s = core.state()!;
    const before = JSON.stringify(s);
    core.setMode('buy');
    for (const defId of ['bed-double-oak', 'tv-flatscreen', 'rug-rectangle', 'bathroom-mirror']) {
      core.startPlacement(defId);
      for (let x = 0; x < 24; x += 3) for (let z = 0; z < 24; z += 2) { core.placementTile(x, z); core.rotatePlacement(); }
      core.cancelPlacement();
    }
    core.startMove(objectsByDef(s, 'bed-double-oak')[0]!);
    for (let x = 0; x < 24; x += 2) core.placementTile(x, 12);
    core.cancelPlacement();
    core.saleValue(objectsByDef(s, 'sofa-tweed')[0]!);
    core.setMode('build');
    for (const tool of [
      { kind: 'wall' as const, finish: STRIPES, scope: 'side' as const }, { kind: 'wall' as const, finish: STRIPES, scope: 'room' as const },
      { kind: 'floor' as const, finish: WALNUT, scope: 'tile' as const }, { kind: 'floor' as const, finish: WALNUT, scope: 'room' as const },
    ]) {
      core.setPaintTool(tool);
      for (const w of Object.values(s.lots[s.activeLotId]!.walls)) for (const side of ['a', 'b'] as const) core.paintPreview({ kind: 'wall', wallId: w.id, side, tile: { x: w.x, z: w.z }, level: 0 });
      for (let x = 0; x < 24; x += 2) for (let z = 0; z < 24; z += 2) core.paintPreview({ kind: 'floor', tile: { x, z }, level: 0 });
      core.paintPreview(null);
    }
    core.setMode('live');
    expect(JSON.stringify(s)).toBe(before);
  });

  it('paint previews report cost and count, flag no-ops as unchanged (not an error) and give the renderer a highlight', () => {
    const core = guided();
    const s = core.state()!;
    const lot = s.lots[s.activeLotId]!;
    core.setMode('build');
    core.setPaintTool({ kind: 'wall', finish: lot.walls[LIVING_WALL]!.sideA, scope: 'side' });
    expect(core.paintPreview(wallPick())).toEqual({ ok: false, unchanged: true, reason: 'Already has this finish', cost: 0, count: 0 }); // already has it: neutral note, not an error
    expect(core.paintPreviewTarget()).toEqual({ kind: 'wallSides', sides: [{ wallId: LIVING_WALL, side: 'a' }] });
    core.setPaintTool({ kind: 'wall', finish: STRIPES, scope: 'room' });
    const room = core.paintPreview(wallPick())!;
    expect(room.ok).toBe(true);
    expect(room.count).toBeGreaterThan(10);
    expect(room.cost).toBe(room.count * db.wallDesigns['stripes-regency']!.price);
    const hi = core.paintPreviewTarget();
    expect(hi?.kind === 'wallSides' && hi.sides.length).toBe(room.count);
    expect(core.paintPreview({ kind: 'object', objectId: objectsByDef(s, 'sofa-tweed')[0]! })).toEqual(expect.objectContaining({ ok: false, reason: expect.any(String) }));
    expect(core.paintPreviewTarget()).toBeNull();
    core.setPaintTool({ kind: 'floor', finish: WALNUT, scope: 'room' });
    const floor = core.paintPreview({ kind: 'floor', tile: { x: 7, z: 13 }, level: 0 })!;
    expect(floor.ok).toBe(true);
    const fh = core.paintPreviewTarget();
    expect(fh?.kind === 'floorTiles' && fh.tiles.length).toBe(floor.count);
    expect(core.paintPreview({ kind: 'floor', tile: { x: 1, z: 1 }, level: 0 })).toEqual(expect.objectContaining({ ok: false, reason: expect.stringMatching(/room/i) }));
    core.paintPreview(null);
    expect(core.paintPreviewTarget()).toBeNull();
  });

  it('eyedrop picks a finish with the previous scope; recent finishes list the last 8, newest first', () => {
    const core = guided();
    const s = core.state()!;
    const lot = s.lots[s.activeLotId]!;
    core.setMode('build');
    core.setPaintTool({ kind: 'wall', finish: STRIPES, scope: 'room' });
    core.setPaintTool({ kind: 'eyedropper', target: 'wall' });
    expect(core.eyedrop({ kind: 'floor', tile: { x: 7, z: 13 }, level: 0 })).toBeNull(); // the wall eyedropper reads walls
    const picked = core.eyedrop(wallPick('b'));
    expect(picked).toEqual(lot.walls[LIVING_WALL]!.sideB);
    expect(core.paintTool()).toEqual({ kind: 'wall', finish: picked, scope: 'room' });
    core.setPaintTool({ kind: 'eyedropper', target: 'floor' });
    expect(core.eyedrop({ kind: 'floor', tile: { x: 7, z: 13 }, level: 0 })).toEqual(lot.floors[tileKey(0, 7, 13)]);
    expect(core.paintTool()).toEqual(expect.objectContaining({ kind: 'floor', scope: 'tile' }));
    expect(core.eyedrop({ kind: 'floor', tile: { x: 1, z: 1 }, level: 0 })).toBeNull(); // bare grass

    const design = db.wallDesigns['plain-paint']!;
    const used: FinishRef[] = [];
    for (let i = 0; i < 10; i++) {
      const f = { designId: design.id, paletteId: design.palettes[i % design.palettes.length]!.id };
      core.setPaintTool({ kind: 'wall', finish: f, scope: 'side' });
      const side = i % 2 === 0 ? 'a' : 'b';
      if (core.paintApply(wallPick(side)).ok) used.unshift(f);
    }
    const recent = core.recentFinishes('wall');
    expect(recent).toHaveLength(8);
    expect(recent[0]).toEqual(used[0]);
    expect(new Set(recent.map((f) => f.paletteId)).size).toBe(8);
    expect(core.recentFinishes('floor')).toEqual([]);
  });
});

describe('autosave', () => {
  it('saves 3 s after a confirmed command, never while a placement or paint preview is active', async () => {
    const store = await freshStore();
    const core = guided(new GameCore({ content: db, saves: store }));
    const s = core.state()!;
    const autosaved = async () => (await store.list()).find((m) => m.slotId === 'autosave')!;
    core.setMode('buy');
    core.startPlacement('plant-potted');
    core.placementTile(2, 2);
    expect(core.confirmPlacement().ok).toBe(true);
    core.startPlacement('bed-single-pine'); // preview active
    core.placementTile(3, 3);
    for (let i = 0; i < 40; i++) core.update(0.25); // 10 real seconds
    await core.autosaveIdle();
    expect((await autosaved()).empty).toBe(true);
    core.cancelPlacement();
    core.update(2);
    await core.autosaveIdle();
    expect((await autosaved()).empty).toBe(true); // debounce restarted when the preview was busy
    core.update(1.5);
    await core.autosaveIdle();
    const first = await autosaved();
    expect(first.empty).toBe(false);
    const loaded = await store.load('autosave', db);
    expect(loaded.ok && JSON.stringify(loaded.state)).toBe(JSON.stringify(s));

    // Build: the paint preview blocks the autosave until it is cleared.
    core.setMode('build');
    core.setPaintTool({ kind: 'wall', finish: STRIPES, scope: 'side' });
    expect(core.paintApply(wallPick()).ok).toBe(true);
    core.paintPreview({ kind: 'wall', wallId: LIVING_WALL, side: 'b', tile: { x: 11, z: 15 }, level: 0 });
    for (let i = 0; i < 40; i++) core.update(0.25);
    await core.autosaveIdle();
    expect((await autosaved()).savedAt).toBe(first.savedAt);
    core.paintPreview(null);
    for (let i = 0; i < 16; i++) core.update(0.25);
    await core.autosaveIdle();
    const second = await autosaved();
    expect(second.savedAt > first.savedAt).toBe(true);
    const again = await store.load('autosave', db);
    expect(again.ok && again.state.lots[again.state.activeLotId]!.walls[LIVING_WALL]!.sideA).toEqual(STRIPES);
    // the previous autosave rotated into the backup
    expect((await store.list()).find((m) => m.slotId === 'backup')!.empty).toBe(false);
  });

  it('saves every 5 real minutes in live mode, and on demand', async () => {
    const store = await freshStore();
    const saved: number[] = [];
    const write = store.autosave.bind(store);
    store.autosave = (state) => { saved.push(state.clock.minutes); return write(state); };
    const core = guided(new GameCore({ content: db, saves: store }));
    const autosaved = async () => (await store.list()).find((m) => m.slotId === 'autosave')!;
    let seconds = 0;
    while (saved.length === 0 && seconds < 400) { core.update(0.25); seconds += 0.25; }
    expect(seconds).toBeGreaterThanOrEqual(300);
    expect(seconds).toBeLessThanOrEqual(304); // 5 minutes plus the 3 s debounce
    await core.autosaveIdle();
    const a = await autosaved();
    expect(a.empty).toBe(false);
    expect(a.gameMinutes).toBe(saved[0]);
    core.setMode('buy'); // no periodic saves outside live mode
    for (let i = 0; i < 4 * 400; i++) core.update(0.25);
    expect(saved).toHaveLength(1);
    core.setMode('live');
    core.advanceTicks(40);
    await core.autosave();
    expect((await autosaved()).gameMinutes).toBe(core.state()!.clock.minutes);
    expect(members(core.state()!).length).toBe(1);
  });
});
