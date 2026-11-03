// A staircase object is drawn from its runtime mesh (no manifest model): ObjectsView builds the real model once the asset cache has made it,
// recolours it with the object's finishes, shows it on its own floor and the one above, and hides it when the view is on a lower floor.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { content } from '../../../src/content';
import { makePlacedObject } from '../../../src/world/objects';
import { ObjectAssets } from '../../../src/render/objectAssets';
import { ObjectsView } from '../../../src/render/objectsView';
import { createEmptyWorld } from '../../../src/core/state';
import { createLot } from '../../../src/world/lots';

const db = content();

async function setup(level = 0) {
  const state = createEmptyWorld(3, 'create');
  const lot = createLot(state, { name: 'T', address: '1', width: 24, depth: 24, kind: 'residential', landValue: 1, entry: { x: 12, z: 23, level: 0 } });
  const def = db.objects['stair-straight-basic']!;
  const obj = makePlacedObject(state, def, { x: 8, z: 8, rot: 0, level }, { finishes: { wood: 'walnut', rail: 'black' }, ownerHouseholdId: null });
  lot.objects[obj.id] = obj;
  const assets = new ObjectAssets('./assets/');
  const view = new ObjectsView(db, assets, 0);
  view.groundAt = (_x, _z, l = 0) => (l > 0 ? l * 3 : 0); // GameView.groundAt: upper floors at their level's height
  view.sync(lot);
  await assets.preload(['proc:stair-straight-1x3']);
  await new Promise((r) => setTimeout(r, 0));
  view.sync(lot); // (the real view re-syncs when its preload resolves)
  return { view, obj, assets };
}

describe('staircase objects in ObjectsView', () => {
  it('draws the runtime mesh, coloured by the chosen swatches', async () => {
    const { view, obj, assets } = await setup();
    expect(assets.isLoaded('proc:stair-straight-1x3')).toBe(true);
    const box = view.boxOf(obj.id)!;
    expect(box.max.y - box.min.y).toBeGreaterThan(2.9);
    const root = view.group.children.find((c) => c.name === `obj:${obj.id}`) as THREE.Group;
    expect(root).toBeDefined();
    const colours = new Set<number>();
    root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) colours.add((m.material as THREE.MeshStandardMaterial).color.getHex()); });
    expect(colours.size).toBe(2); // wood and rail
    const walnut = new THREE.Color('#8a5a3c').getHex();
    const wood = [...colours].map((c) => new THREE.Color(c).getHex());
    expect(wood.some((c) => Math.abs(new THREE.Color(c).r - new THREE.Color(walnut).r) < 0.2)).toBe(true);
    expect(root.visible).toBe(true);
  });

  it('is shown from the floor above too, hidden from a floor below, and picked from both', async () => {
    const { view, obj } = await setup(1);
    const root = () => view.group.children.find((c) => c.name === `obj:${obj.id}`) as THREE.Group;
    expect(root().position.y).toBe(3);
    view.setActiveLevel(0);
    expect(root().visible).toBe(false);
    view.setActiveLevel(1);
    expect(root().visible).toBe(true);
    view.setActiveLevel(2);
    expect(root().visible).toBe(true);
    const ray = new THREE.Ray(new THREE.Vector3(8.5, 20, 9.5), new THREE.Vector3(0, -1, 0));
    expect(view.pick(ray, false, new THREE.Vector3())?.id).toBe(obj.id); // picked from the floor it arrives on
    view.setActiveLevel(1);
    expect(view.pick(ray, false, new THREE.Vector3())?.id).toBe(obj.id);
  });
});

describe('staircase models after a purge', () => {
  it('a runtime model purged by a lot change is built again on the next load', async () => {
    const assets = new ObjectAssets('./assets/');
    expect(await assets.load('proc:stair-straight-1x3')).not.toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(assets.purgeUnused()).toBe(1);
    expect(assets.isLoaded('proc:stair-straight-1x3')).toBe(false);
    expect(await assets.load('proc:stair-straight-1x3')).not.toBeNull();
    expect(assets.isLoaded('proc:stair-straight-1x3')).toBe(true);
  });
});

describe('staircase placement in the world', () => {
  it('a stair turned a quarter fills its rotated footprint and rises toward the head', async () => {
    const state = createEmptyWorld(3, 'create');
    const lot = createLot(state, { name: 'T', address: '1', width: 24, depth: 24, kind: 'residential', landValue: 1, entry: { x: 12, z: 23, level: 0 } });
    const def = db.objects['stair-straight-basic']!;
    const obj = makePlacedObject(state, def, { x: 8, z: 1, rot: 1, level: 0 }, { ownerHouseholdId: null });
    lot.objects[obj.id] = obj;
    const assets = new ObjectAssets('./assets/');
    const view = new ObjectsView(db, assets, 0);
    view.sync(lot);
    await assets.preload(['proc:stair-straight-1x3']);
    view.sync(lot);
    const root = view.group.children.find((c) => c.name === `obj:${obj.id}`)!;
    root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(root);
    // footprint x 8..11, z 1..2 (rotated 1 x 3); the foot is the east end (+x), the head the west end
    expect(b.min.x).toBeGreaterThanOrEqual(7.99);
    expect(b.max.x).toBeLessThanOrEqual(11.01);
    expect(b.min.z).toBeGreaterThanOrEqual(0.99);
    expect(b.max.z).toBeLessThanOrEqual(2.01);
    expect(b.max.y).toBeGreaterThan(2.9);
    // the highest step is at the west (head) end, the lowest at the east (foot) end
    let high = -Infinity, low = -Infinity;
    const v = new THREE.Vector3();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        if (v.x < 9) high = Math.max(high, v.y); else if (v.x > 10) low = Math.max(low, v.y);
      }
    });
    expect(high).toBeGreaterThan(low + 1.5);
  });
});
