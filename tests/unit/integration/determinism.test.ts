// Determinism through GameCore: the same seed and the same commands give byte-identical worlds after a game
// day, however the real time is sliced into frames and even when the world is saved and loaded midway.

import { describe, expect, it } from 'vitest';
import { cloneState } from '../../../src/core/state';
import { GameCore } from '../../../src/game/GameCore';
import { coreWithoutSaves, members, objectsByDef, TICKS_PER_DAY } from './harness';

type Driver = (core: GameCore, ticks: number) => void;

/** Same commands each time: a purchase, a paint job, a few orders, then a game day. */
function play(seed: number, drive: Driver, reload = false): string {
  const core = coreWithoutSaves();
  expect(core.startNewGame('create', core.premadeHouseholds()[1]!, seed)).toEqual({ ok: true });
  const s0 = core.state()!;
  const [theo, sasha] = members(s0);
  core.setMode('buy');
  core.startPlacement('bed-single-pine');
  core.placementTile(2, 2);
  expect(core.confirmPlacement().ok).toBe(true);
  core.setMode('build');
  core.setPaintTool({ kind: 'floor', finish: { designId: 'oak-planks', paletteId: 'walnut' }, scope: 'room' });
  expect(core.paintApply({ kind: 'floor', tile: { x: 7, z: 13 }, level: 0 }).ok).toBe(true);
  core.setMode('live');
  const fridge = objectsByDef(s0, 'fridge-standard')[0]!;
  const cook = core.options(theo!.id, { kind: 'object', objectId: fridge }).find((o) => o.interactionId === 'cookMeal')!;
  expect(core.queue(theo!.id, cook).ok).toBe(true);
  expect(core.goTo(sasha!.id, { x: 3, z: 20 }).ok).toBe(true);
  drive(core, TICKS_PER_DAY / 2);
  if (reload) core.replaceState(cloneState(core.state()!));
  const chat = core.options(sasha!.id, { kind: 'person', personId: theo!.id }).find((o) => o.enabled);
  if (chat) core.queue(sasha!.id, chat);
  drive(core, TICKS_PER_DAY / 2);
  return JSON.stringify(core.state());
}

const direct: Driver = (core, ticks) => core.advanceTicks(ticks);

/** Real-time frames of varying length at very fast speed (each frame runs at most a few ticks). */
const frames: Driver = (core, ticks) => {
  core.setSpeed(3);
  const s = core.state()!;
  const target = s.clock.ticks + ticks;
  let seed = 99;
  while (s.clock.ticks < target) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const left = target - s.clock.ticks;
    if (left < 8) { core.advanceTicks(left); break; }
    core.update(0.004 + (seed % 60) / 1000);
  }
};

describe('determinism', () => {
  it('same seed and same commands give identical JSON after one game day', () => {
    const a = play(31, direct);
    const b = play(31, direct);
    expect(b).toBe(a);
    expect(play(32, direct)).not.toBe(a);
  }, 60_000);

  it('does not depend on frame slicing or on a save/load in the middle', () => {
    const a = play(47, direct);
    expect(play(47, frames)).toBe(a);
    expect(play(47, direct, true)).toBe(a);
  }, 60_000);
});
