// Open footprint cells (the inside of an L-shaped sofa): not blocking, still reserved for placement, rotated with the object.

import { describe, expect, it } from 'vitest';
import { blockingTiles, footprintTiles, rotateCell } from '../../../src/core/geometry';
import type { Rot } from '../../../src/core/types';
import { buildNavGrid, isFree } from '../../../src/world/navgrid';
import { validatePlacement } from '../../../src/world/placement';
import { fixtureContent, putObject, testWorld } from './fixtures';

const content = fixtureContent();
content.objects['sofa-l'] = {
  ...content.objects['bed-double-oak']!, id: 'sofa-l', name: 'L sofa', footprint: { w: 2, d: 2 }, openCells: [[0, 1]],
  slots: [{ id: 'corner', kind: 'sit', pos: [1.5, 0.5], height: 0.46, facing: 0, approach: [0, 1], posture: 'seated' }], interactions: [],
};
const def = content.objects['sofa-l']!;

describe('openCells', () => {
  it('blockingTiles leaves out the open cell at every rotation', () => {
    for (const rot of [0, 1, 2, 3] as Rot[]) {
      const all = footprintTiles(5, 5, def.footprint, rot);
      const blocking = blockingTiles(5, 5, def, rot);
      expect(all).toHaveLength(4);
      expect(blocking).toHaveLength(3);
      const c = rotateCell(0, 1, def.footprint, rot);
      const open = all.filter((t) => !blocking.some((b) => b.x === t.x && b.z === t.z));
      expect(open).toEqual([{ x: 5 + c.x, z: 5 + c.z }]);
    }
    expect(blockingTiles(5, 5, { footprint: { w: 2, d: 2 } }, 0)).toHaveLength(4);
  });

  it('the navigation grid keeps the open cell walkable and the other cells blocked', () => {
    const w = testWorld();
    putObject(w.state, content, w.lot, 'sofa-l', 6, 6);
    const g = buildNavGrid(w.lot, content, 0);
    expect(isFree(g, 6, 7)).toBe(true); // the inside of the L
    for (const [x, z] of [[6, 6], [7, 6], [7, 7]] as const) expect(isFree(g, x, z), `${x},${z}`).toBe(false);
  });

  it('placement still reserves the open cell for the sofa and accepts a seat approached from it', () => {
    const w = testWorld();
    putObject(w.state, content, w.lot, 'sofa-l', 6, 6);
    const check = (defId: string, x: number, z: number) => validatePlacement(w.state, content, w.lot.id, { defId, x, z, rot: 0, level: 0 });
    expect(check('armchair-lounge', 6, 7).ok).toBe(false); // the cell stays part of the sofa
    const r = validatePlacement(w.state, content, w.lot.id, { defId: 'sofa-l', x: 10, z: 10, rot: 1, level: 0 });
    expect(r.ok, r.reasons.join(', ')).toBe(true);
    expect(r.warnings).toEqual([]);
  });
});
