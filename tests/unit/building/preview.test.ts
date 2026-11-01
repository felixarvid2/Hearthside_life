import { describe, expect, it } from 'vitest';
import { previewBuy, previewMove, previewPaint, previewPlaceFromInventory, previewSell } from '../../../src/building/preview';
import type { FinishRef } from '../../../src/core/types';
import { addRectWalls } from '../../../src/world/walls';
import { fixtureContent, putObject, testWorld } from '../world/fixtures';

const PAINT0: FinishRef = { designId: 'plain-paint', paletteId: 'plain-paint-p0' };
const TILE: FinishRef = { designId: 'subway-tile', paletteId: 'subway-tile-p0' };
const OAK: FinishRef = { designId: 'oak-planks', paletteId: 'oak-planks-p0' };

function setup(o: { funds?: number; mode?: 'create' | 'sandbox' } = {}) {
  const content = fixtureContent();
  const w = testWorld(o);
  addRectWalls(w.lot, 0, 4, 4, 7, 7, { a: PAINT0, b: PAINT0 }); // closed 3 x 3 room (no door needed for paint)
  return { ...w, content };
}

describe('previews', () => {
  it('previewBuy reports validity, cost and footprint without changing state', () => {
    const { state, lot, hh, content } = setup();
    const before = JSON.stringify(state);
    expect(previewBuy(state, content, lot.id, hh.id, { defId: 'desk-oak', x: 12, z: 12, rot: 1, level: 0 }))
      .toEqual({ ok: true, reasons: [], cost: 25000, tiles: [{ x: 12, z: 12 }, { x: 12, z: 13 }] });
    const bad = previewBuy(state, content, lot.id, hh.id, { defId: 'desk-oak', x: 23, z: 12, rot: 0, level: 0 });
    expect(bad.ok).toBe(false);
    expect(bad.reasons).toEqual(['It does not fit on the lot.']);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('shows unaffordable purchases and charges nothing in the sandbox', () => {
    const poor = setup({ funds: 500 });
    const p = previewBuy(poor.state, poor.content, poor.lot.id, poor.hh.id, { defId: 'fridge-standard', x: 12, z: 12, rot: 0, level: 0 });
    expect(p.ok).toBe(false);
    expect(p.reasons).toContain('Not enough household funds.');
    expect(p.cost).toBe(80000);
    const sb = setup({ funds: 500, mode: 'sandbox' });
    const s = previewBuy(sb.state, sb.content, sb.lot.id, sb.hh.id, { defId: 'fridge-standard', x: 12, z: 12, rot: 0, level: 0 });
    expect(s).toMatchObject({ ok: true, cost: 0 });
  });

  it('previewMove and previewSell', () => {
    const { state, lot, hh, content } = setup();
    const desk = putObject(state, content, lot, 'desk-oak', 12, 12, 0, { boughtAt: state.clock.minutes });
    putObject(state, content, lot, 'trash-can', 15, 12);
    expect(previewMove(state, content, lot.id, desk.id, { x: 13, z: 12, rot: 0, level: 0 })).toMatchObject({ ok: true, cost: 0 });
    expect(previewMove(state, content, lot.id, desk.id, { x: 14, z: 12, rot: 0, level: 0 }).ok).toBe(false);
    expect(previewSell(state, content, lot.id, hh.id, desk.id)).toMatchObject({ ok: true, cost: -25000, value: 25000 });
    state.clock.minutes += 1440;
    expect(previewSell(state, content, lot.id, hh.id, desk.id).value).toBe(20000);
    expect(previewPlaceFromInventory(state, content, lot.id, hh.id, 0, { x: 1, z: 1, rot: 0, level: 0 }).ok).toBe(false);
  });

  it('previewPaint counts and charges only what would change', () => {
    const { state, lot, hh, content } = setup();
    const before = JSON.stringify(state);
    const room = previewPaint(state, content, lot.id, hh.id, { kind: 'roomWalls', level: 0, tile: { x: 5, z: 5 } }, TILE);
    expect(room).toMatchObject({ ok: true, count: 12, cost: 12 * 500 });
    expect(room.sides).toHaveLength(12);
    expect(room.tiles.every((t) => t.x >= 4 && t.x <= 6 && t.z >= 4 && t.z <= 6)).toBe(true);
    const same = previewPaint(state, content, lot.id, hh.id, { kind: 'wallSide', wallId: '0:h:4:4', side: 'a' }, PAINT0);
    expect(same).toMatchObject({ ok: false, count: 0, cost: 0 });
    lot.floors['0:4:4'] = { ...OAK };
    const floor = previewPaint(state, content, lot.id, hh.id, { kind: 'roomFloor', level: 0, tile: { x: 5, z: 5 } }, OAK);
    expect(floor).toMatchObject({ ok: true, count: 8, cost: 8 * 400 });
    const tiles = previewPaint(state, content, lot.id, hh.id, { kind: 'floorTiles', level: 0, tiles: [{ x: 0, z: 0 }, { x: 4, z: 4 }] }, OAK);
    expect(tiles).toMatchObject({ ok: true, count: 1, cost: 400, tiles: [{ x: 0, z: 0 }] });
    delete lot.floors['0:4:4'];
    expect(JSON.stringify(state)).toBe(before);
  });
});
