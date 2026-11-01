// GameCore: modes and speed, the fixed-step update loop, live-mode menus and orders, wardrobe and settings,
// saves through SaveStore (fake-indexeddb) and import/export.

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { TICK_MINUTES } from '../../../src/core/clock';
import type { UiChange } from '../../../src/game/api';
import { GameCore } from '../../../src/game/GameCore';
import { coreWithoutSaves, db, freshStore, members, objectsByDef } from './harness';

function started(index = 0, mode: 'guided' | 'create' | 'sandbox' = 'guided', seed = 5): GameCore {
  const core = coreWithoutSaves();
  const r = core.startNewGame(mode, core.premadeHouseholds()[index]!, seed);
  expect(r).toEqual({ ok: true });
  return core;
}

describe('modes, speed and the update loop', () => {
  it('starts in boot without a world; live, buy and build need one', () => {
    const core = coreWithoutSaves();
    expect(core.mode()).toBe('boot');
    expect(core.state()).toBeNull();
    core.setMode('live');
    expect(core.mode()).toBe('boot');
    core.setMode('menu');
    expect(core.mode()).toBe('menu');
    expect(core.update(1)).toEqual({ ticks: 0, alpha: 1 });
    expect(core.options('x', { kind: 'none' })).toEqual([]);
    expect(core.exportWorld()).toBeNull();
  });

  it('a new game enters live mode at normal speed with the first member selected', () => {
    const changes: UiChange[] = [];
    const core = coreWithoutSaves();
    core.onChange((w) => changes.push(w));
    expect(core.startNewGame('guided', core.premadeHouseholds()[0]!, 1)).toEqual({ ok: true });
    expect(core.mode()).toBe('live');
    expect(core.speed()).toBe(1);
    expect(core.selected()).toBe(members(core.state()!)[0]!.id);
    expect(changes).toEqual(expect.arrayContaining(['state', 'selection', 'mode', 'speed']));
  });

  it('starts every premade household in every start mode', () => {
    const core = coreWithoutSaves();
    const premades = core.premadeHouseholds();
    expect(premades).toHaveLength(4);
    expect(premades.map((p) => p.name)).not.toContain('Penrose'); // the neighbours are not offered as players
    for (const mode of ['guided', 'create', 'sandbox'] as const) {
      for (const d of premades) {
        expect(core.startNewGame(mode, d, 9), `${mode} ${d.name}`).toEqual({ ok: true });
        expect(members(core.state()!).map((p) => p.firstName)).toEqual(d.members.map((m) => m.firstName));
        core.advanceTicks(8);
      }
    }
  });

  it('rejects invalid drafts with the creator reason', () => {
    const core = coreWithoutSaves();
    const draft = core.premadeHouseholds()[0]!;
    draft.members[0]!.firstName = '';
    const r = core.startNewGame('guided', draft, 1);
    expect(r.ok).toBe(false);
    expect(core.state()).toBeNull();
    expect(core.startNewGame('guided', { name: 'x', members: [], ties: [] }).ok).toBe(false);
  });

  it('runs fixed ticks for real time at each speed; nothing in menu, creator, buy, build or paused', () => {
    const core = started();
    const s = core.state()!;
    const m0 = s.clock.minutes;
    let ticks = 0;
    for (let i = 0; i < 4; i++) ticks += core.update(0.25).ticks; // 1 s at normal speed = 1 game minute
    expect(ticks).toBe(4);
    expect(s.clock.minutes).toBe(m0 + 4 * TICK_MINUTES);
    core.setSpeed(3);
    expect(core.update(0.1).ticks).toBe(6); // 15 game minutes per second
    core.togglePause();
    expect(core.speed()).toBe(0);
    expect(core.update(0.2).ticks).toBe(0);
    core.togglePause();
    expect(core.speed()).toBe(3);
    const before = s.clock.minutes;
    for (const m of ['buy', 'build', 'menu', 'creator'] as const) {
      core.setMode(m);
      expect(core.update(0.25).ticks).toBe(0);
    }
    expect(s.clock.minutes).toBe(before);
    core.setMode('live');
    expect(core.update(0.05).ticks).toBe(3);
  });

  it('buy and build pause the simulation and returning to live restores the speed', () => {
    const core = started();
    core.setSpeed(2);
    core.setMode('buy');
    expect(core.speed()).toBe(0);
    core.setMode('build');
    expect(core.speed()).toBe(0);
    core.setSpeed(3); // chosen while building: applies when returning to live
    expect(core.speed()).toBe(0);
    core.setMode('live');
    expect(core.speed()).toBe(3);
    core.setMode('buy');
    core.setMode('live');
    expect(core.speed()).toBe(3);
  });

  it('caps catch-up work per frame and resets the accumulator on resume', () => {
    const core = started();
    core.setSpeed(3);
    expect(core.update(60).ticks).toBeLessThanOrEqual(80);
    core.update(0.01); // leaves a fraction of a tick
    core.resetAccumulator();
    const r = core.update(0);
    expect(r.ticks).toBe(0);
    expect(core.devStats()).toEqual(expect.objectContaining({ agents: 1, ticksPerFrame: 0 }));
    expect(core.devStats().routeRequests).toBeGreaterThanOrEqual(0);
  });

  it('leaving buy cancels the placement, leaving build clears the paint tool, leaving edit modes clears undo', () => {
    const core = started();
    core.setMode('buy');
    expect(core.startPlacement('plant-potted')).toEqual({ ok: true });
    core.placementTile(2, 2);
    expect(core.confirmPlacement().ok).toBe(true);
    expect(core.canUndo()).toBe(true);
    core.startPlacement('plant-potted');
    core.setMode('build');
    expect(core.placement()).toBeNull();
    expect(core.canUndo()).toBe(true); // buy -> build keeps the edit session
    core.setPaintTool({ kind: 'floor', finish: { designId: 'oak-planks', paletteId: 'walnut' }, scope: 'tile' });
    core.paintPreview({ kind: 'floor', tile: { x: 7, z: 13 }, level: 0 });
    expect(core.paintPreviewTarget()).not.toBeNull();
    core.setMode('live');
    expect(core.paintTool()).toBeNull();
    expect(core.paintPreviewTarget()).toBeNull();
    expect(core.canUndo()).toBe(false);
    expect(core.startPlacement('plant-potted').ok).toBe(false); // only in buy mode
  });
});

describe('live mode', () => {
  it('maps picks to menus: self, objects, floor, other people and meals', () => {
    const core = started(1, 'create');
    const s = core.state()!;
    const [theo, sasha] = members(s);
    const self = core.options(sasha!.id, { kind: 'person', personId: sasha!.id });
    const ids = self.map((o) => o.interactionId);
    expect(ids).toEqual(expect.arrayContaining(['goToWork', 'danceSolo', 'jogInPlace', 'phoneInvite']));
    expect(self.filter((o) => o.interactionId === 'phoneInvite').map((o) => o.label)).toEqual(['Invite Harriet Over', 'Invite Kofi Over']);
    for (const o of self) expect(o.group).toBe('self');
    expect(core.options(theo!.id, { kind: 'person', personId: theo!.id }).some((o) => o.interactionId === 'goToWork')).toBe(false);

    const fridge = objectsByDef(s, 'fridge-standard')[0]!;
    const fo = core.options(theo!.id, { kind: 'object', objectId: fridge });
    expect(fo.map((o) => o.interactionId)).toEqual(expect.arrayContaining(['grabSnack', 'cookMeal']));
    expect(fo[0]!.token).toEqual(expect.objectContaining({ target: { kind: 'object', objectId: fridge, slotId: null } }));

    const floor = core.options(theo!.id, { kind: 'floor', tile: { x: 7, z: 12 }, level: 0 });
    expect(floor).toHaveLength(1);
    expect(floor[0]).toEqual(expect.objectContaining({ interactionId: 'goHere', group: 'move', enabled: true }));

    const social = core.options(theo!.id, { kind: 'person', personId: sasha!.id });
    expect(social.length).toBeGreaterThan(3);
    for (const o of social) expect(o.group).toBe('social');
    expect(core.options(theo!.id, { kind: 'none' })).toEqual([]);

    // Queue the snack from the menu entry; the token carries the exact request.
    const snack = fo.find((o) => o.interactionId === 'grabSnack')!;
    expect(core.queue(theo!.id, snack)).toEqual({ ok: true });
    expect(theo!.queue.some((a) => a.interactionId === 'grabSnack' && a.source === 'player')).toBe(true);
    expect(core.queue(theo!.id, { ...snack, token: { bogus: true } }).ok).toBe(false);
  });

  it('offers eating for a served meal (item picks)', () => {
    const core = started(1, 'create');
    const s = core.state()!;
    const [theo, sasha] = members(s);
    const fridge = objectsByDef(s, 'fridge-standard')[0]!;
    expect(core.queue(theo!.id, core.options(theo!.id, { kind: 'object', objectId: fridge }).find((o) => o.interactionId === 'cookMeal')!).ok).toBe(true);
    // (a beginner may leave a spill on the floor while cooking: pick out the served meal)
    const served = () => Object.values(s.items).find((it) => it.kind === 'meal');
    for (let i = 0; i < 4 * 90 && !served(); i++) core.advanceTicks(1);
    const meal = served()!;
    expect(meal.kind).toBe('meal');
    const menu = core.options(sasha!.id, { kind: 'item', itemId: meal.id });
    expect(menu.map((o) => o.interactionId)).toContain('eatMeal');
    expect(menu[0]!.token).toEqual(expect.objectContaining({ target: { kind: 'item', itemId: meal.id } }));
  });

  it('goTo walks to a tile and refuses blocked tiles; cancel and reorder reach the simulation', () => {
    const core = started();
    const s = core.state()!;
    const p = members(s)[0]!;
    expect(core.goTo(p.id, { x: 3, z: 20 })).toEqual({ ok: true });
    const fridge = s.lots[s.activeLotId]!.objects[objectsByDef(s, 'fridge-standard')[0]!]!;
    expect(core.goTo(p.id, { x: fridge.x, z: fridge.z }).ok).toBe(false);
    expect(core.goTo(p.id, { x: 6, z: 20 })).toEqual({ ok: true });
    const [first, second] = p.queue;
    const results = new Map<string, string>();
    core.events.on('action.finished', (e) => { results.set(e.actionId, e.result); });
    core.reorder(p.id, second!.id, 0);
    core.cancel(p.id, second!.id);
    expect(p.queue.some((a) => a.id === second!.id)).toBe(false);
    expect(results.get(second!.id)).toBe('cancelled');
    for (let i = 0; i < 4 * 60 && !results.has(first!.id); i++) core.advanceTicks(1);
    expect(results.get(first!.id)).toBe('done');
    const loc = p.location;
    expect(loc.kind === 'lot' && Math.floor(loc.x) === 3 && Math.floor(loc.z) === 20).toBe(true);
    expect(core.mood(p.id).label.length).toBeGreaterThan(0);
  });

  it('selects only members of the active household', () => {
    const core = started();
    const s = core.state()!;
    const neighbour = Object.values(s.people).find((p) => p.isNpc)!;
    const me = core.selected();
    core.select(neighbour.id);
    expect(core.selected()).toBe(me);
    core.select(null);
    expect(core.selected()).toBeNull();
    core.select(me);
    expect(core.selected()).toBe(me);
  });

  it('updateWardrobe validates with the outfit rules and replaces the wardrobe', () => {
    const core = started();
    const s = core.state()!;
    const p = members(s)[0]!;
    const events: string[] = [];
    core.events.on('person.changed', (e) => events.push(`${e.personId}:${e.what}`));
    const w = JSON.parse(JSON.stringify(p.outfits)) as typeof p.outfits;
    const top = w.outfits.everyday[0]!.layers.top ?? w.outfits.everyday[0]!.layers.full!;
    top.color = '#123456';
    expect(core.updateWardrobe(p.id, w)).toEqual({ ok: true });
    expect(p.outfits).toEqual(w);
    expect(p.outfits).not.toBe(w);
    expect(events).toContain(`${p.id}:outfit`);
    const broken = JSON.parse(JSON.stringify(w)) as typeof w;
    broken.outfits.everyday = [];
    const r = core.updateWardrobe(p.id, broken);
    expect(r.ok).toBe(false);
    expect(p.outfits).toEqual(w);
    const neighbour = Object.values(s.people).find((x) => x.isNpc)!;
    expect(core.updateWardrobe(neighbour.id, neighbour.outfits).ok).toBe(false);
  });

  it('setSimSettings changes world settings; unlimited funds only in a sandbox', () => {
    const core = started();
    core.setSimSettings({ autonomy: false, autonomyLevel: 2, visitors: false, unlimitedFunds: true });
    expect(core.state()!.settings).toEqual(expect.objectContaining({ autonomy: false, autonomyLevel: 2, visitors: false, unlimitedFunds: false }));
    const sb = started(0, 'sandbox');
    sb.setSimSettings({ unlimitedFunds: false });
    expect(sb.state()!.settings.unlimitedFunds).toBe(false);
  });
});

describe('saves', () => {
  it('without storage: empty listing and clear errors', async () => {
    const core = started();
    const list = await core.listSaves();
    expect(list.map((s) => s.slotId)).toEqual(['slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5', 'autosave', 'backup']);
    expect(list.every((s) => s.empty)).toBe(true);
    expect(await core.latestSave()).toBeNull();
    expect((await core.saveTo('slot-1', 'x')).ok).toBe(false);
    expect((await core.loadFrom('slot-1')).ok).toBe(false);
    await core.autosave();
  });

  it('saves, lists, loads and deletes through SaveStore', async () => {
    const store = await freshStore();
    const core = new GameCore({ content: db, saves: store });
    expect((await core.saveTo('slot-1', 'x')).ok).toBe(false); // no game yet
    core.startNewGame('guided', core.premadeHouseholds()[0]!, 3);
    core.advanceTicks(200);
    expect(await core.saveTo('slot-2', '  My first house  ')).toEqual({ ok: true });
    expect((await core.saveTo('autosave', 'nope')).ok).toBe(false);
    expect((await core.saveTo('slot-9', 'nope')).ok).toBe(false);
    const list = await core.listSaves();
    const slot = list.find((s) => s.slotId === 'slot-2')!;
    const hh = core.state()!.households[core.state()!.activeHouseholdId]!;
    expect(slot).toEqual(expect.objectContaining({ name: 'My first house', empty: false, kind: 'manual', householdName: hh.name, funds: hh.funds, gameMinutes: core.state()!.clock.minutes }));
    expect((await core.latestSave())?.slotId).toBe('slot-2');
    const json = JSON.stringify(core.state());

    const other = new GameCore({ content: db, saves: store });
    expect((await other.loadFrom('slot-1')).ok).toBe(false); // empty
    expect((await other.loadFrom('bogus')).ok).toBe(false);
    const loaded = await other.loadFrom('slot-2');
    expect(loaded).toEqual({ ok: true });
    expect(JSON.stringify(other.state())).toBe(json);
    expect(other.mode()).toBe('live');
    expect(other.selected()).toBe(members(other.state()!)[0]!.id);
    // the loaded world keeps running
    other.advanceTicks(10);
    expect(await other.deleteSave('slot-2')).toEqual({ ok: true });
    expect((await other.listSaves()).find((s) => s.slotId === 'slot-2')!.empty).toBe(true);
    expect((await other.deleteSave('nope')).ok).toBe(false);
  });

  it('loading restores the saved speed: a game saved paused loads paused, older saves without speed load paused', async () => {
    const store = await freshStore();
    const core = new GameCore({ content: db, saves: store });
    core.startNewGame('guided', core.premadeHouseholds()[0]!, 3);
    core.setSpeed(0);
    expect((await core.saveTo('slot-1', 'paused')).ok).toBe(true);
    core.setSpeed(3);
    expect((await core.saveTo('slot-2', 'fast')).ok).toBe(true);
    await core.autosave();

    const other = new GameCore({ content: db, saves: store });
    expect((await other.loadFrom('slot-1')).ok).toBe(true);
    expect(other.speed()).toBe(0);
    expect(other.update(2).ticks).toBe(0);
    other.togglePause(); // resuming goes to Normal, not stuck at paused
    expect(other.speed()).toBe(1);
    expect((await other.loadFrom('slot-2')).ok).toBe(true);
    expect(other.speed()).toBe(3);
    expect((await other.loadFrom('autosave')).ok).toBe(true); // continue loads the autosave
    expect(other.speed()).toBe(3);

    // a world saved before speed was stored
    const legacy = JSON.parse(core.exportWorld()!) as { world?: { settings: { speed?: number } }; settings?: { speed?: number } };
    const settings = (legacy.world ?? legacy).settings!;
    delete settings.speed;
    const imported = coreWithoutSaves();
    expect((await imported.importWorld(JSON.stringify(legacy))).ok).toBe(true);
    expect(imported.speed()).toBe(0);
  });

  it('exports and imports a world; a broken file is refused with a report', async () => {
    const core = started(1, 'create');
    core.advanceTicks(300);
    const json = core.exportWorld()!;
    expect(JSON.parse(json)).toEqual(expect.objectContaining({ format: 'hearthside-world', exportedAt: '2026-10-31T12:00:00.000Z' }));
    const other = coreWithoutSaves();
    const r = await other.importWorld(json);
    expect(r.ok).toBe(true);
    expect(JSON.stringify(other.state())).toBe(JSON.stringify(core.state()));
    const bad = await other.importWorld('{"not":"a world"}');
    expect(bad.ok).toBe(false);
    expect(bad.report?.length).toBeGreaterThan(0);
    expect(JSON.stringify(other.state())).toBe(JSON.stringify(core.state())); // unchanged
  });
});
