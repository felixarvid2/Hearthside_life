// LotView cuts a hole in every wall edge a wide door or window spans, including the post between two edges.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { edgeKey } from '../../../src/core/ids';
import type { Opening } from '../../../src/core/types';
import { LotView } from '../../../src/render/lotView';
import { addWallRun } from '../../../src/world/walls';
import { fixtureContent, testWorld } from '../world/fixtures';

const finish = { designId: 'plain-paint', paletteId: 'warm-white' };

function setup(span: number, kind: 'door' | 'window') {
  const content = fixtureContent();
  const base = content.openings[kind === 'door' ? 'door-panel' : 'window-wide']!;
  content.openings['wide'] = { ...base, id: 'wide', width: span };
  const { state, lot } = testWorld();
  addWallRun(lot, 0, { x: 2, z: 5 }, { x: 9, z: 5 }, { a: finish, b: finish });
  const o: Opening = { id: 'o1', defId: 'wide', wallId: edgeKey(0, 'h', 4, 5), flip: false, purchasePrice: 0, ...(span > 1 ? { span } : {}) };
  lot.openings[o.id] = o;
  const view = new LotView(content, 'low');
  view.setCutaway('up', new THREE.Vector3(1, 0, 1));
  view.build(lot);
  void state;
  return { view, content };
}

/** Number of wall surfaces a horizontal ray along z crosses at (x, y) over the wall at z = 5. */
function hits(view: LotView, x: number, y: number): number {
  const rc = new THREE.Raycaster(new THREE.Vector3(x, y, 0), new THREE.Vector3(0, 0, 1));
  const meshes: THREE.Object3D[] = [];
  // children: floors, walls, openings, preview; only the wall meshes count (doors and windows have their own)
  view.group.children[1]!.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o); });
  for (const m of meshes) for (const mat of [(m as THREE.Mesh).material].flat()) mat.side = THREE.DoubleSide; // count back faces too
  return rc.intersectObjects(meshes, false).filter((h) => h.point.z > 4.5 && h.point.z < 5.5).length;
}

describe('LotView: wide openings', () => {
  // textures need a canvas (no DOM here): LotView falls back to plain materials and warns
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  it('a two-tile door is open across both edges and through the post between them', () => {
    const { view } = setup(2, 'door');
    // the opening starts at edge x = 4: tiles 4 and 5; the post sits at the vertex x = 5
    for (const x of [4.3, 4.7, 5.0, 5.3, 5.7]) expect(hits(view, x, 1.0), `x = ${x}`).toBe(0);
    // above the door head and beside it the wall is still there
    expect(hits(view, 5.0, 2.5)).toBeGreaterThan(0);
    expect(hits(view, 3.5, 1.0)).toBeGreaterThan(0);
    expect(hits(view, 6.5, 1.0)).toBeGreaterThan(0);
  });

  it('a three-tile window keeps its sill and head across every edge', () => {
    const { view } = setup(3, 'window');
    for (const x of [4.5, 5.0, 5.5, 6.0, 6.5]) {
      expect(hits(view, x, 1.5), `x = ${x}, glass height`).toBe(0);
      expect(hits(view, x, 0.3), `x = ${x}, under the sill`).toBeGreaterThan(0);
    }
    expect(hits(view, 7.5, 1.5)).toBeGreaterThan(0);
  });

  it('a one-tile door still cuts one edge only', () => {
    const { view } = setup(1, 'door');
    expect(hits(view, 4.5, 1.0)).toBe(0);
    expect(hits(view, 5.5, 1.0)).toBeGreaterThan(0);
  });
});
