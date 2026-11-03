// Milestone 9 rendering that runs without a GPU: LotView draws every level at its height and hides levels above the active one, picks
// walls on the active level only, the camera works on the active floor's plane, and the staircase meshes fit their footprint.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { content } from '../../../src/content';
import { edgeKey, tileKey } from '../../../src/core/ids';
import { CameraRig } from '../../../src/render/cameraRig';
import { LotView, UPPER_SLAB_DEPTH } from '../../../src/render/lotView';
import { proceduralModel, registerProceduralModel } from '../../../src/render/stairModel';
import { addRectWalls } from '../../../src/world/walls';
import { testWorld } from '../world/fixtures';

const finish = { designId: 'plain-paint', paletteId: 'warm-white' };
const floor = { designId: 'oak-planks', paletteId: 'oak' };

function twoFloors() {
  const { lot } = testWorld();
  addRectWalls(lot, 0, 4, 4, 10, 10, { a: finish, b: finish });
  addRectWalls(lot, 1, 4, 4, 10, 10, { a: finish, b: finish });
  for (let z = 4; z < 10; z++) for (let x = 4; x < 10; x++) { lot.floors[tileKey(0, x, z)] = floor; lot.floors[tileKey(1, x, z)] = floor; }
  lot.levels = 2;
  const view = new LotView(content_fixture(), 'low');
  view.setCutaway('up', new THREE.Vector3(1, 0, 1));
  view.build(lot);
  return { lot, view };
}
function content_fixture() {
  return { ...content(), wallDesigns: {}, floorDesigns: {} } as ReturnType<typeof content>;
}

/** Every level group under the floor / wall / opening groups of a LotView. */
function levelGroups(view: LotView): THREE.Group[] {
  const out: THREE.Group[] = [];
  view.group.traverse((o) => { if (o.userData.level !== undefined && (o as THREE.Group).isGroup) out.push(o as THREE.Group); });
  return out;
}

describe('LotView on two floors', () => {
  it('draws each level in a group at level x 3 m', () => {
    const { view } = twoFloors();
    const groups = levelGroups(view);
    expect(groups.length).toBeGreaterThanOrEqual(4); // floors and walls, two levels each
    for (const g of groups) expect(g.position.y).toBe((g.userData.level as number) * 3);
    expect(UPPER_SLAB_DEPTH).toBeCloseTo(0.2, 6);
  });

  it('hides the levels above the active one and shows them again', () => {
    const { view } = twoFloors();
    view.setActiveLevel(0);
    expect(levelGroups(view).filter((g) => g.userData.level === 1).every((g) => !g.visible)).toBe(true);
    expect(levelGroups(view).filter((g) => g.userData.level === 0).every((g) => g.visible)).toBe(true);
    view.setActiveLevel(1);
    expect(levelGroups(view).every((g) => g.visible)).toBe(true);
    expect(view.getActiveLevel()).toBe(1);
  });

  it('cutaway lowers the walls of the active level only', () => {
    const { lot, view } = twoFloors();
    view.setCutaway('down', new THREE.Vector3(1, 0, 1));
    view.setActiveLevel(1);
    const up = Object.values(lot.walls).find((w) => w.level === 1)!;
    const ground = Object.values(lot.walls).find((w) => w.level === 0)!;
    expect(view.isLowered(up.id)).toBe(true);
    expect(view.isLowered(ground.id)).toBe(false);
  });

  it('picks walls of the active level, at the right height', () => {
    const { view } = twoFloors();
    // a ray straight down onto the north wall at x 6.5, z 4: level 0's wall top is at 2.8 m, level 1's at 5.8 m
    const ray = new THREE.Ray(new THREE.Vector3(6.5, 20, 4), new THREE.Vector3(0, -1, 0));
    view.setActiveLevel(1);
    const hit = view.pickWall(ray);
    expect(hit?.wallId).toBe(edgeKey(1, 'h', 6, 4));
    expect(hit!.point.y).toBeGreaterThan(5.7);
    view.setActiveLevel(0);
    expect(view.pickWall(ray)?.wallId).toBe(edgeKey(0, 'h', 6, 4));
    expect(view.wallBox(edgeKey(1, 'h', 6, 4))!.min.y).toBe(3);
  });
});

describe('CameraRig levels', () => {
  it('moves the ground plane with the floor', () => {
    const r = new CameraRig();
    r.reducedMotion = true;
    r.setSize(390, 844);
    r.setLevelHeight(3);
    r.update(0);
    expect(r.target.y).toBe(3);
    expect(r.levelHeight).toBe(3);
    // glides aim at a height above the current floor
    r.glideTo(10, 10, undefined, 0, 0.8);
    expect(r.target.y).toBeCloseTo(3.8, 6);
    r.setLevelHeight(0);
    expect(r.target.y).toBe(0);
  });

  it('glides between floors when motion is allowed', () => {
    const r = new CameraRig();
    r.setSize(390, 844);
    r.setLevelHeight(3);
    r.update(0.1);
    expect(r.target.y).toBeGreaterThan(0);
    expect(r.target.y).toBeLessThan(3);
    r.update(1);
    expect(r.target.y).toBeCloseTo(3, 6);
  });
});

describe('staircase models', () => {
  it('a straight flight is as high as a level and stays inside its footprint', () => {
    const g = proceduralModel('proc:stair-straight-1x3')!;
    expect(g).not.toBeNull();
    const b = new THREE.Box3().setFromObject(g);
    expect(b.min.y).toBeCloseTo(0, 3);
    expect(b.max.y).toBeGreaterThanOrEqual(3);
    expect(b.min.x).toBeGreaterThanOrEqual(-0.01);
    expect(b.max.x).toBeLessThanOrEqual(1.01);
    expect(b.min.z).toBeGreaterThanOrEqual(-0.01);
    expect(b.max.z).toBeLessThanOrEqual(3.01);
    const names = new Set<string>();
    g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) names.add((m.material as THREE.Material).name); });
    expect([...names].sort()).toEqual(['rail', 'wood']);
  });

  it('a spiral fits 2 x 2; unknown ids have no model; designs can be registered', () => {
    const b = new THREE.Box3().setFromObject(proceduralModel('proc:stair-spiral-4')!);
    expect(b.max.x).toBeLessThanOrEqual(2.01);
    expect(b.max.z).toBeLessThanOrEqual(2.01);
    expect(proceduralModel('proc:nothing')).toBeNull();
    registerProceduralModel('proc:test-design', () => new THREE.Group());
    expect(proceduralModel('proc:test-design')).not.toBeNull();
  });
});
