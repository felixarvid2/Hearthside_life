// Milestone 11, task C integration: a full simulated week in the starter home with the real content. A resident
// practises Photography, Fishing and Research through the same context-menu path the UI uses, levels up, sells
// prints and catches (paid through the ledger), then writes a research paper once Research unlocks it. The week
// is saved and loaded, and every once-only payout occurrence is replayed to prove nothing pays twice.

import { describe, expect, it } from 'vitest';
import { atDayMinute } from '../../../src/core/clock';
import { transact } from '../../../src/core/state';
import type { Id, WorldItem } from '../../../src/core/types';
import { fishPortionValue, fishSpecies } from '../../../src/content/fishing';
import type { GameCore } from '../../../src/game/GameCore';
import type { PickResult } from '../../../src/game/api';
import { coreWithoutSaves, db, freshStore, members, Recorder } from './harness';

function newWeek(): GameCore {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', core.premadeHouseholds()[0]!, 20261103)).toEqual({ ok: true });
  const state = core.state()!;
  state.households[state.activeHouseholdId]!.funds = 100_000_000;
  state.settings.autonomy = true;
  state.settings.visitors = false; // no visitor wanders in and ties up the camera or pond
  state.settings.autoPayBills = true; // keep the power on: this test is about skills, not household bills
  for (const p of members(state)) p.career = null; // nobody leaves for a shift during the week
  return core;
}

/** Buys and places an object at the first tile the real placement rules accept. */
function buy(core: GameCore, defId: string, candidates?: Array<{ x: number; z: number }>): Id {
  const lot = core.state()!.lots[core.state()!.activeLotId]!;
  const spots = candidates ?? Array.from({ length: lot.width * lot.depth }, (_, i) => ({ x: i % lot.width, z: Math.floor(i / lot.width) }));
  for (const t of spots) {
    expect(core.startPlacement(defId).ok).toBe(true);
    core.placementTile(t.x, t.z);
    if (core.placement()?.ok) {
      const r = core.confirmPlacement();
      expect(r.ok, `${defId} at ${t.x},${t.z}: ${JSON.stringify(r)}`).toBe(true);
      return r.objectId!;
    }
    core.cancelPlacement();
  }
  throw new Error(`no free spot for ${defId}`);
}

const menuOption = (core: GameCore, personId: Id, pick: PickResult, interactionId: string) =>
  core.options(personId, pick).find((o) => o.interactionId === interactionId);

/** Queues an interaction through the real menu option list; null when it is not offered or disabled. */
function queueMenu(core: GameCore, personId: Id, pick: PickResult, interactionId: string): string | null {
  const opt = menuOption(core, personId, pick, interactionId);
  if (!opt?.enabled) return null;
  const before = new Set(core.state()!.people[personId]!.queue.map((a) => a.id));
  const q = core.queue(personId, opt);
  if (!q.ok) return null;
  return core.state()!.people[personId]!.queue.find((a) => !before.has(a.id))?.id ?? null;
}

const fishItems = (core: GameCore): WorldItem[] =>
  Object.values(core.state()!.items).filter((it) => it.kind === 'fish').sort((a, b) => a.createdAt - b.createdAt);

const pickObj = (objectId: Id): PickResult => ({ kind: 'object', objectId });

/** Drops queued autonomous chores so the player's next choice fits (the queue is short and dinner chores fill it). */
function clearAutonomy(core: GameCore, personId: Id): void {
  for (const a of [...core.state()!.people[personId]!.queue]) if (a.source !== 'player') core.cancel(personId, a.id);
}

describe('a simulated week of photography, fishing and research', { timeout: 240_000 }, () => {
  it('levels all three skills, sells prints and catches, writes a paper, and pays every occurrence once across save/load', async () => {
    const core = newWeek();
    const state = core.state()!;
    const hh = state.activeHouseholdId;
    const person = members(state)[0]!;
    const personId = person.id;
    const computer = Object.values(state.lots[state.activeLotId]!.objects).find((o) => o.defId === 'computer-desktop')!;

    core.setMode('buy');
    const camera = buy(core, 'camera-tripod');
    const telescope = buy(core, 'telescope');
    const pond = buy(core, 'garden-pond-fishing', [
      { x: 20, z: 20 }, { x: 18, z: 20 }, { x: 20, z: 18 }, { x: 16, z: 20 }, { x: 20, z: 16 },
    ]);
    core.setMode('live');

    // Every new home interaction is really offered by its object (no dead catalogue entries).
    expect(menuOption(core, personId, pickObj(camera), 'takePhotos')?.enabled).toBe(true);
    expect(menuOption(core, personId, pickObj(camera), 'sellPhotos')).toBeDefined();
    expect(menuOption(core, personId, pickObj(telescope), 'researchSky')?.enabled).toBe(true);
    expect(menuOption(core, personId, pickObj(pond), 'fishPond')?.enabled).toBe(true);
    expect(menuOption(core, personId, pickObj(computer.id), 'researchOnline')?.enabled).toBe(true);
    expect(menuOption(core, personId, pickObj(computer.id), 'writePaper')).toBeDefined();
    expect(menuOption(core, personId, pickObj(camera), 'sellPhotos')!.enabled).toBe(false); // Photography 2 first

    const rec = new Recorder(core);
    // The sale pays the level at completion, which can be one level above the level when the player clicked:
    // the catch that preceded it may still have been finishing. Record the expected fee from the event itself.
    const saleMeta = new Map<string, { species: NonNullable<ReturnType<typeof fishSpecies>>; portions: number; occurrence: string }>();
    const fishSales: Array<{ occurrence: string; expected: number }> = [];
    core.events.on('action.finished', (e) => {
      if (e.personId !== personId || e.interactionId !== 'sellCatch' || e.result !== 'done') return;
      const meta = saleMeta.get(e.actionId);
      if (!meta) return;
      const level = state.people[personId]!.skills.fishing?.level ?? 1;
      fishSales.push({ occurrence: meta.occurrence, expected: fishPortionValue(meta.species, level) * meta.portions });
    });
    let paperAction: string | null = null;

    const sellOne = () => {
      const item = fishItems(core)[0];
      if (!item) return;
      const species = fishSpecies(item.recipeId);
      const actionId = queueMenu(core, personId, { kind: 'item', itemId: item.id }, 'sellCatch');
      if (actionId && species) saleMeta.set(actionId, { species, portions: item.portions, occurrence: `fishsell:${item.id}` });
    };

    const days = 7;
    for (let day = 0; day < days; day++) {
      const slots: Array<{ at: number; run: () => void }> = [
        { at: 8 * 60, run: () => queueMenu(core, personId, pickObj(camera), 'takePhotos') },
        { at: 9 * 60 + 30, run: () => queueMenu(core, personId, pickObj(computer.id), 'researchOnline') },
        { at: 11 * 60, run: () => queueMenu(core, personId, pickObj(pond), 'fishPond') },
        { at: 12 * 60 + 30, run: sellOne },
        { at: 13 * 60 + 30, run: () => queueMenu(core, personId, pickObj(pond), 'fishPond') },
        { at: 14 * 60 + 30, run: () => queueMenu(core, personId, pickObj(telescope), 'researchSky') },
        { at: 16 * 60, run: () => queueMenu(core, personId, pickObj(camera), 'takePhotos') },
        { at: 17 * 60 + 30, run: () => queueMenu(core, personId, pickObj(pond), 'fishPond') },
        { at: 18 * 60 + 30, run: sellOne },
        { at: 19 * 60, run: () => queueMenu(core, personId, pickObj(computer.id), 'researchOnline') },
      ];
      if (day % 2 === 1) slots.push({ at: 20 * 60 + 30, run: () => queueMenu(core, personId, pickObj(camera), 'sellPhotos') });
      slots.sort((a, b) => a.at - b.at);
      for (const slot of slots) {
        rec.runUntil(atDayMinute(day, slot.at));
        if (state.people[personId]!.location.kind !== 'lot') continue;
        clearAutonomy(core, personId);
        slot.run();
      }
    }

    // Let the last evening action finish, then spend Research 5 on a paper.
    rec.runUntil(atDayMinute(7, 7 * 60));
    // Weeks of use wear objects down; repairing is tested elsewhere, so the paper test starts from a working computer.
    const computerObj = state.lots[state.activeLotId]!.objects[computer.id]!;
    computerObj.condition.broken = false;
    computerObj.condition.dirt = 0;
    clearAutonomy(core, personId);
    paperAction = queueMenu(core, personId, pickObj(computer.id), 'writePaper');
    expect(paperAction, 'Research 5 offers Write a Research Paper').toBeTruthy();
    rec.runUntil(atDayMinute(7, 12 * 60));

    const p = state.people[personId]!;
    const done = (id: string) => rec.finished.filter((f) => f.personId === personId && f.interactionId === id && f.result === 'done').length;
    expect(done('takePhotos')).toBeGreaterThanOrEqual(10);
    expect(done('fishPond')).toBeGreaterThanOrEqual(14);
    expect(done('sellCatch')).toBeGreaterThanOrEqual(5);
    expect(done('researchOnline')).toBeGreaterThanOrEqual(10);
    expect(done('researchSky')).toBeGreaterThanOrEqual(5);
    expect(done('sellPhotos')).toBeGreaterThanOrEqual(2);
    expect(done('writePaper')).toBe(1);

    // Visible progression: each skill really reached an unlock level through ordinary practice.
    expect(p.skills.photography?.level ?? 1).toBeGreaterThanOrEqual(5); // gallery bonus + print sales
    expect(p.skills.fishing?.level ?? 1).toBeGreaterThanOrEqual(5); // two or three fish a cast
    expect(p.skills.research?.level ?? 1).toBeGreaterThanOrEqual(5); // paid papers unlocked

    // Every payout is in the ledger once, with the fee growing as the skill grew.
    const ledger = state.households[hh]!.ledger;
    const photoSales = rec.finished.filter((f) => f.personId === personId && f.interactionId === 'sellPhotos' && f.result === 'done');
    const photoFees = photoSales.map((f) => ledger.find((l) => l.occurrence === `freelance:${personId}:${f.actionId}`)!);
    expect(photoFees.every(Boolean)).toBe(true);
    expect(photoFees[1]!.amount).toBeGreaterThan(photoFees[0]!.amount);
    const paperFee = ledger.find((l) => l.occurrence === `freelance:${personId}:${paperAction}`);
    expect(paperFee?.amount).toBeGreaterThan(0);
    expect(fishSales.length).toBeGreaterThanOrEqual(5);
    for (const sale of fishSales) {
      const entry = ledger.find((l) => l.occurrence === sale.occurrence);
      expect(entry, sale.occurrence).toBeDefined();
      expect(entry!.amount).toBe(sale.expected);
    }

    // Save and load: the week survives, and replaying any once-only payout occurrence adds nothing.
    const occurrences = [...photoFees.map((l) => l.occurrence!), paperFee!.occurrence!, ...fishSales.map((s) => s.occurrence)];
    const funds = state.households[hh]!.funds;
    const store = await freshStore();
    expect((await store.save('slot-1', 'M11 C week', state)).ok).toBe(true);
    const loadedRes = await store.load('slot-1', db);
    if (!loadedRes.ok) throw new Error(`load failed: ${loadedRes.error}`);
    const loaded = loadedRes.state;
    expect(loaded.households[hh]!.funds).toBe(funds);
    expect(loaded.people[personId]!.skills.photography?.level).toBe(p.skills.photography?.level);
    expect(loaded.people[personId]!.skills.fishing?.level).toBe(p.skills.fishing?.level);
    expect(loaded.people[personId]!.skills.research?.level).toBe(p.skills.research?.level);
    const fishLeft = Object.values(loaded.items).filter((it) => it.kind === 'fish').length;
    expect(fishLeft).toBe(fishItems(core).length);
    for (const occurrence of occurrences) {
      expect(transact(loaded, null, hh, 999, 'sale', 'replay', { occurrence }).ok).toBe(true);
    }
    expect(loaded.households[hh]!.funds).toBe(funds);
  });
});
