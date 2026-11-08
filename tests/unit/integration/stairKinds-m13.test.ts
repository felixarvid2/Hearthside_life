// Milestone 13: the spiral and length-4 staircases (the catalogue has 9 straight and 4 spiral) are used in a real house, not
// only the basic straight one: placed from the Stairs tool, walked up and down through goHere on level 1, with the stairwell
// cut into the floor above. The browser acceptance (step 15) covers the same in the real page.

import { describe, expect, it } from 'vitest';
import type { FinishRef } from '../../../src/core/types';
import type { GameCore } from '../../../src/game/GameCore';
import { coreWithoutSaves, db, members } from './harness';

const OAK: FinishRef = { designId: 'oak-planks', paletteId: db.floorDesigns['oak-planks']!.palettes[0]!.id };

/** The starter home with a second storey room over its kitchen end (as in cook-floors). */
function house(seed = 21): GameCore {
  const core = coreWithoutSaves();
  expect(core.startNewGame('sandbox', core.premadeHouseholds()[0]!, seed)).toEqual({ ok: true });
  core.setMode('build');
  core.setBuildTool({ kind: 'room', floor: OAK, doors: [{ defId: 'door-panel', side: 's' }] });
  expect(core.buildApply({ from: { x: 11, z: 10 }, to: { x: 19, z: 17 }, level: 1 }), 'upper room').toMatchObject({ ok: true });
  return core;
}

interface Walk { done: boolean; maxRise: number; levels: Set<number>; failure: string | null }

/** Queues Go here and runs until the person stands on the target (or the action ends first). */
function walkTo(core: GameCore, id: string, level: number, x: number, z: number, ticks = 4 * 300): Walk {
  const p = core.state()!.people[id]!;
  const opt = core.options(id, { kind: 'floor', tile: { x, z }, level }).find((o) => o.interactionId === 'goHere' && o.enabled);
  if (!opt) return { done: false, maxRise: 0, levels: new Set(), failure: 'Go here is not offered' };
  const r = core.queue(id, opt);
  if (!r.ok) return { done: false, maxRise: 0, levels: new Set(), failure: r.reason };
  let failure: string | null = null;
  const off = core.events.onAny((e) => { if (e.type === 'action.finished' && e.interactionId === 'goHere' && e.result !== 'done') failure = e.reason ?? e.result; });
  let maxRise = 0;
  const levels = new Set<number>();
  try {
    for (let i = 0; i < ticks; i++) {
      core.advanceTicks(1);
      const l = p.location;
      if (l.kind === 'lot') {
        maxRise = Math.max(maxRise, l.rise ?? 0);
        levels.add(l.level);
        if (l.level === level && !l.rise && Math.floor(l.x) === x && Math.floor(l.z) === z) return { done: true, maxRise, levels, failure };
      }
      if (failure) break;
    }
  } finally { off(); }
  return { done: false, maxRise, levels, failure };
}

describe('every kind of staircase carries people between floors', () => {
  it.each([
    ['stair-straight-basic', 'straight, 3 tiles'],
    ['stair-grand', 'straight, 4 tiles, two wide'],
    ['stair-spiral-iron', 'spiral, 3 tiles'],
    ['stair-spiral-wood', 'spiral, 4 tiles'],
    ['stair-spiral-glass', 'spiral, 4 tiles'],
  ])('%s (%s): placed, a stairwell is cut, walked up and down', (defId) => {
    const core = house();
    const def = db.objects[defId]!;
    expect(def.stair, defId).toBeTruthy();
    const s = core.state()!;
    const lot = s.lots[s.activeLotId]!;
    const person = members(s)[0]!;
    const home = person.location.kind === 'lot' ? { ...person.location } : null;
    expect(home).toBeTruthy();
    let result: { at: string; up: Walk; down: Walk; stairId: string } | null = null;
    const tried: string[] = [];
    search:
    for (let rot = 0; rot < 4; rot++) {
      for (let z = 10; z <= 17; z++) {
        for (let x = 11; x <= 19; x++) {
          core.setMode('build');
          core.setBuildTool({ kind: 'stairs', defId, rot });
          if (!core.buildApply({ from: { x: x + 0.5, z: z + 0.5 }, level: 0 }).ok) continue;
          core.setMode('live');
          const stair = Object.values(lot.objects).find((o) => o.defId === defId)!;
          person.location = { ...home! };
          person.queue = [];
          const size = stair.rot % 2 === 0 ? def.footprint : { w: def.footprint.d, d: def.footprint.w };
          const holes: string[] = [];
          for (let dz = 0; dz < size.d; dz++) for (let dx = 0; dx < size.w; dx++) if (!lot.floors[`1:${stair.x + dx}:${stair.z + dz}`]) holes.push(`${stair.x + dx},${stair.z + dz}`);
          expect(holes.length, 'the stairwell is open above the staircase').toBeGreaterThan(0);
          const targets = [...Array(8).keys()].flatMap((i) => [...Array(7).keys()].map((j) => ({ x: 11 + i, z: 10 + j })))
            .filter((t) => lot.floors[`1:${t.x}:${t.z}`] && !holes.includes(`${t.x},${t.z}`))
            .sort((a, b) => Math.hypot(b.x - stair.x, b.z - stair.z) - Math.hypot(a.x - stair.x, a.z - stair.z));
          const upTile = targets[0]!;
          const up = walkTo(core, person.id, 1, upTile.x, upTile.z);
          if (up.done) {
            const down = walkTo(core, person.id, 0, Math.floor(home!.x), Math.floor(home!.z));
            result = { at: `${x},${z} rot ${rot}`, up, down, stairId: stair.id };
            break search;
          }
          tried.push(`${x},${z}/${rot}: ${up.failure ?? 'stopped'}`);
          // take it out again and try the next place
          core.setMode('buy');
          core.sell(stair.id);
          core.setMode('live');
        }
      }
    }
    expect(result, `${defId} could not be used anywhere; tried ${tried.slice(0, 6).join(' | ')}`).toBeTruthy();
    expect(result!.up.maxRise, 'climbed the full height').toBeGreaterThan(2);
    expect([...result!.up.levels].sort()).toEqual([0, 1]);
    expect(result!.down.done, `${defId} down from ${result!.at}`).toBe(true);
  }, 120_000);
});
