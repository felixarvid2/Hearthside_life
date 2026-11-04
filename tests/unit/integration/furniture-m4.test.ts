// Milestone 4 furniture in the real game: every new functional object is bought and placed through GameCore (real placement
// rules, real navigation) and a person uses each of its interactions; the dishwasher takes the dirty dishes; the chores
// that come with tags (cleaning, repairs) are offered; and the L-shaped sofas can be sat on from every seat.

import { describe, expect, it } from 'vitest';
import { capabilityInteractions, isDishStation } from '../../../src/content/capabilities';
import { newId } from '../../../src/core/ids';
import type { Id, Rot, WorldItem } from '../../../src/core/types';
import type { GameCore } from '../../../src/game/GameCore';
import { OBJECTS } from '../../../src/content/objects';
import { LotNav } from '../../../src/world/nav';
import { coreWithoutSaves, db, members } from './harness';

/** Ids of the designs added for Milestone 4. */
const M4 = [
  'easel-studio', 'piano-upright', 'treadmill', 'weight-bench', 'table-chess', 'crib-wood', 'toy-chest', 'play-box', 'bench-garden', 'chair-adirondack',
  'chair-slatted', 'table-patio', 'grill-kettle', 'planter-raised', 'rug-doormat', 'dishwasher', 'fridge-built-in', 'counter-corner-round', 'coffee-machine',
  'toaster', 'blender', 'laptop', 'speaker-shelf', 'books-stack', 'sofa-corner-designer', 'ottoman-cushion', 'bench-low-cushion', 'chair-modern-cushion',
  'chair-modern-frame', 'table-dining-cloth', 'bathroom-sink-square', 'plant-fern-pot', 'coat-rack-wall',
];

function newGame(seed = 21): GameCore {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', core.premadeHouseholds()[0]!, seed)).toEqual({ ok: true });
  const s = core.state()!;
  s.households[s.activeHouseholdId]!.funds = 100_000_000;
  s.settings.autonomy = false;
  s.settings.visitors = false;
  for (const p of members(s)) p.career = null; // nobody leaves for a shift in the middle of a test
  core.setMode('buy');
  return core;
}

/** Buys and places an object at the first free tile where the real placement rules accept it. */
function buy(core: GameCore, defId: string, at?: { x: number; z: number }, rot: Rot = 0): Id {
  const lot = core.state()!.lots[core.state()!.activeLotId]!;
  const spots = at ? [at] : Array.from({ length: lot.width * lot.depth }, (_, i) => ({ x: i % lot.width, z: Math.floor(i / lot.width) }));
  for (const t of spots) {
    expect(core.startPlacement(defId).ok).toBe(true);
    for (let r = 0; r < rot; r++) core.rotatePlacement();
    core.placementTile(t.x, t.z);
    if (core.placement()?.ok) {
      const r = core.confirmPlacement();
      expect(r.ok, `${defId}: ${JSON.stringify(r)}`).toBe(true);
      return r.objectId!;
    }
    core.cancelPlacement();
  }
  throw new Error(`no free spot for ${defId}`);
}

function use(core: GameCore, personId: Id, objectId: Id, interactionId: string): { result: string; reason?: string } {
  const opt = core.options(personId, { kind: 'object', objectId }).find((o) => o.interactionId === interactionId);
  if (!opt) throw new Error(`${interactionId} is not offered by ${objectId}`);
  if (!opt.enabled) return { result: 'disabled', reason: opt.reason ?? '' };
  let out: { result: string; reason?: string } | null = null;
  const off = core.events.on('action.finished', (e) => { if (e.personId === personId && e.interactionId === interactionId) out = { result: e.result, ...(e.reason ? { reason: e.reason } : {}) }; });
  const q = core.queue(personId, opt);
  if (!q.ok) { off(); return { result: 'refused', reason: String((q as { reason?: string }).reason) }; }
  for (let i = 0; i < 4000 && !out; i++) core.advanceTicks(1);
  off();
  return out ?? { result: 'timeout' };
}

describe('Milestone 4 furniture catalog', () => {
  it('adds at least 22 new distinct designs, 100 or more in total, with every hobby, kids and outdoor category filled', () => {
    const ready = OBJECTS.filter((o) => o.status === 'ready');
    expect(ready.length).toBeGreaterThanOrEqual(100);
    expect(M4.length).toBeGreaterThanOrEqual(22);
    for (const id of M4) expect(db.objects[id]?.status, id).toBe('ready');
    for (const cat of ['hobby', 'kids', 'outdoor'] as const) expect(ready.filter((o) => o.category === cat).length, cat).toBeGreaterThanOrEqual(3);
    expect(new Set(ready.map((o) => o.model.asset)).size).toBe(ready.length);
  });

  it('new functional designs use only interactions that exist, and the new hobby interactions train skills', () => {
    for (const id of M4) for (const i of db.objects[id]!.interactions) expect(db.interactions[i]?.status, `${id}/${i}`).toBe('ready');
    const skillOf = (id: string) => db.interactions[id]!.skill?.id;
    expect(skillOf('paintCanvas')).toBe('painting');
    expect(skillOf('playPiano')).toBe('music');
    expect(skillOf('playChess')).toBe('logic');
    for (const id of ['workOut', 'liftWeights']) expect(skillOf(id)).toBe('fitness');
    expect(db.skills.painting!.status).toBe('ready');
    for (const id of ['paintCanvas', 'playPiano', 'workOut', 'liftWeights', 'playChess', 'playWithToys', 'grillFood', 'makeCoffee', 'makeToast', 'blendSmoothie']) {
      const def = db.interactions[id]!;
      expect(def.autonomy.enabled, id).toBe(true);
      expect(Object.keys(def.autonomy.ads).length, id).toBeGreaterThan(0);
      expect(def.autonomy.tags.length, id).toBeGreaterThan(0);
      if (def.moodletOnComplete) expect(db.moodlets[def.moodletOnComplete], id).toBeDefined();
    }
  });

  it('new objects take part in cleaning and repairs through their tags alone', () => {
    const dw = db.objects.dishwasher!;
    expect(isDishStation(dw)).toBe(true);
    expect(capabilityInteractions(dw)).toEqual(['cleanObject', 'repairObject', 'serviceObject', 'callRepairperson']);
    expect(isDishStation(db.objects['bathroom-sink-square']!)).toBe(true);
    for (const id of ['treadmill', 'grill-kettle', 'crib-wood', 'toaster', 'blender', 'laptop']) {
      expect(capabilityInteractions(db.objects[id]!).length, id).toBeGreaterThan(0);
    }
    expect(capabilityInteractions(db.objects['rug-doormat']!)).toEqual([]);
  });

  it('keeps aspiration tags on the plants, rugs and books', () => {
    for (const id of ['planter-raised', 'plant-fern-pot']) expect(db.objects[id]!.tags, id).toContain('plant');
    expect(db.objects['rug-doormat']!.tags).toContain('rug');
    expect(db.objects['books-stack']!.tags).toContain('books');
  });
});

describe('a person can use every new functional object', { timeout: 60_000 }, () => {
  const functional = M4.filter((id) => db.objects[id]!.functional);
  // cooking at a fridge needs a stove and groceries; chores are tested in the housework tests
  const skip = new Set(['cookMeal']);

  it('buys, places and uses each object (and fails nowhere)', () => {
    const core = newGame();
    const s = core.state()!;
    const [mira] = members(s);
    const lot = s.lots[s.activeLotId]!;
    const failures: string[] = [];
    const used: string[] = [];
    for (const id of functional) {
      const def = db.objects[id]!;
      let objectId: Id;
      if (def.layer === 'surface') { const t = lot.objects[buy(core, 'table-dining-oak')]!; objectId = buy(core, id, { x: t.x, z: t.z }); } else objectId = buy(core, id);
      for (const iid of def.interactions.filter((i) => !skip.has(i))) {
        const p = s.people[mira!.id]!;
        for (const n of Object.keys(p.needs) as Array<keyof typeof p.needs>) p.needs[n] = 55;
        // Milestone 11 hobby unlocks: paper writing and print sales are gated by their skill level.
        if (iid === 'writePaper') p.skills.research = { level: 5, xp: 0 };
        if (iid === 'sellPhotos') p.skills.photography = { level: 2, xp: 0 };
        const idef = db.interactions[iid]!;
        const xpBefore = idef.skill ? (p.skills[idef.skill.id]?.xp ?? 0) : 0;
        const needsBefore = { ...p.needs };
        const r = use(core, mira!.id, objectId, iid);
        if (r.result !== 'done') { failures.push(`${id}/${iid}: ${r.result} ${r.reason ?? ''}`); continue; }
        used.push(`${id}/${iid}`);
        if (idef.skill) expect(p.skills[idef.skill.id]?.xp ?? 0, `${id}/${iid} trains ${idef.skill.id}`).toBeGreaterThan(xpBefore);
        for (const [need, v] of Object.entries(idef.needsOnComplete)) {
          if (v > 0) expect(p.needs[need as keyof typeof p.needs], `${id}/${iid} ${need}`).toBeGreaterThan(needsBefore[need as keyof typeof needsBefore]);
        }
      }
    }
    expect(failures).toEqual([]);
    // every interaction the new hobby, kids, outdoor and small-appliance objects offer was exercised
    for (const iid of ['paintCanvas', 'playPiano', 'workOut', 'liftWeights', 'playChess', 'playWithToys', 'grillFood', 'makeCoffee', 'makeToast', 'blendSmoothie', 'sit', 'sleep', 'nap']) {
      expect(used.some((u) => u.endsWith(`/${iid}`)), iid).toBe(true);
    }
  });

  it('the dishwasher washes dirty dishes (and only it is left to do so)', () => {
    const core = newGame(5);
    const s = core.state()!;
    const [mira] = members(s);
    const lot = s.lots[s.activeLotId]!;
    for (const o of Object.values(lot.objects)) if (isDishStation(db.objects[o.defId]!)) o.condition.broken = true; // the sinks
    const dw = lot.objects[buy(core, 'dishwasher')]!;
    const item: WorldItem = {
      id: newId(s, 'itm'), kind: 'dishes', lotId: lot.id, position: { x: dw.x + 0.5, z: dw.z + 2.5, level: 0 }, recipeId: 'pasta', portions: 3, quality: 1,
      createdAt: s.clock.minutes, spoilsAt: s.clock.minutes + 1e9, ownerHouseholdId: s.activeHouseholdId,
    };
    s.items[item.id] = item;
    const opt = core.options(mira!.id, { kind: 'item', itemId: item.id }).find((o) => o.interactionId === 'washDishes')!;
    expect(opt, 'washDishes is offered for dirty dishes').toBeDefined();
    expect(opt.enabled, opt.reason).toBe(true);
    expect(core.queue(mira!.id, opt).ok).toBe(true);
    const washedAt: string[] = [];
    core.events.on('action.finished', (e) => { if (e.interactionId === 'washDishes') washedAt.push(e.result); });
    for (let i = 0; i < 1200 && washedAt.length === 0; i++) core.advanceTicks(1);
    expect(washedAt).toEqual(['done']);
    expect(s.items[item.id]).toBeUndefined();
    expect(dw.condition.dirt).toBeGreaterThan(0); // it was used
  });
});

describe('L-shaped sofas: every seat can be reached and used', { timeout: 60_000 }, () => {
  const SOFAS = ['sofa-chaise', 'sofa-corner', 'sofa-corner-designer'];

  it('navigation: all slots usable at every rotation, approach reachable from the lot entry', () => {
    for (const id of SOFAS) {
      const def = db.objects[id]!;
      expect(def.openCells, id).toEqual([[0, 1]]);
      for (const rot of [0, 1, 2, 3] as Rot[]) {
        const core = newGame(3);
        const s = core.state()!;
        const lot = s.lots[s.activeLotId]!;
        // the sofa goes wherever the real rules accept it at this rotation, in the open yard rather than a corner of the house
        const o = lot.objects[buy(core, id, undefined, rot)]!;
        const nav = new LotNav(() => s, db);
        const slots = nav.slotsOf(lot.id, o.id);
        expect(slots.map((x) => x.slotId).sort(), `${id} rot ${rot}`).toEqual(def.slots.map((x) => x.id).sort());
        for (const sl of slots) {
          const path = nav.findPath(lot.id, 0, { x: lot.entry.x, z: lot.entry.z }, [sl.approach]);
          expect(path, `${id}/${sl.slotId} rot ${rot} approach ${JSON.stringify(sl.approach)}`).not.toBeNull();
        }
      }
    }
  });

  it('people really sit on all three seats of each sofa at the same time', () => {
    for (const id of SOFAS) {
      const core = coreWithoutSaves();
      const p = core.premadeHouseholds();
      const draft = { name: 'Four', members: [...p[1]!.members, ...p[2]!.members], ties: [] as typeof p[0]['ties'] };
      expect(core.startNewGame('create', draft, 9)).toEqual({ ok: true });
      const s = core.state()!;
      s.households[s.activeHouseholdId]!.funds = 100_000_000;
      s.settings.autonomy = false;
      s.settings.visitors = false;
      const people = members(s);
      for (const m of people) m.career = null;
      core.setMode('buy');
      const sofa = buy(core, id);
      const failed: string[] = [];
      core.events.on('action.finished', (e) => { if (e.result === 'failed') failed.push(`${e.interactionId}: ${e.reason}`); });
      const three = people.slice(0, 3);
      for (const m of three) expect(core.queue(m.id, core.options(m.id, { kind: 'object', objectId: sofa }).find((o) => o.interactionId === 'sit')!).ok, id).toBe(true);
      const performing = (m: (typeof three)[number]) => m.queue[0]?.phase === 'perform' && m.location.kind === 'lot' && m.location.posture === 'seated';
      for (let i = 0; i < 1200 && !three.every(performing); i++) core.advanceTicks(1);
      const seated = three.filter((m) => m.location.kind === 'lot' && m.location.posture === 'seated');
      expect(seated.length, `${id}: ${failed.join('; ')}`).toBe(3);
      const spots = new Set(seated.map((m) => (m.location.kind === 'lot' ? `${m.location.x.toFixed(2)},${m.location.z.toFixed(2)}` : '')));
      expect(spots.size, id).toBe(3);
    }
  });
});
