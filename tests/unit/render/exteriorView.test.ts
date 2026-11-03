// Milestone 9 exterior rendering without a GPU: the fence, roof and garden views build their meshes from the lot, hide by level and wall
// mode, and crops look like their growth stage. (Textures need a canvas; without one the views fall back to flat colours.)

import { describe, expect, it } from 'vitest';
import { FENCES, GATES, ROOF_STYLES } from '../../../src/content/exterior';
import type { GardenState, Lot } from '../../../src/core/types';
import { FenceView } from '../../../src/render/fenceView';
import { RoofView } from '../../../src/render/roofView';
import { gardenBlobs } from '../../../src/world/gardenLayout';
import { gardenStage } from '../../../src/world/gardenGrowth';

function lotWith(parts: Partial<Lot>): Lot {
  return { id: 'l', name: 'L', address: '', kind: 'residential', width: 40, depth: 40, landValue: 0, ownerHouseholdId: null, entry: { x: 0, z: 0, level: 0 }, levels: 1, walls: {}, floors: {}, openings: {}, objects: {}, ground: 'grass', ...parts };
}

describe('FenceView', () => {
  it('builds triangles for every fence and gate design, and glass goes in its own mesh', () => {
    for (const d of [...FENCES, ...GATES]) {
      const v = new FenceView();
      v.build(lotWith({ fences: { '0:h:2:2': { id: '0:h:2:2', level: 0, dir: 'h', x: 2, z: 2, defId: d.id, variant: 1 }, '0:v:5:3': { id: '0:v:5:3', level: 0, dir: 'v', x: 5, z: 3, defId: d.id } } }));
      expect(v.triangleCount(), d.id).toBeGreaterThan(40);
      v.dispose();
    }
    const glass = new FenceView();
    glass.build(lotWith({ fences: { '0:h:2:2': { id: '0:h:2:2', level: 0, dir: 'h', x: 2, z: 2, defId: 'glass-panel' } } }));
    let meshes = 0;
    glass.group.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) meshes++; });
    expect(meshes).toBe(2);
  });

  it('a vertical edge stands on its own line and upper levels are lifted and hidden with the floor selector', () => {
    const v = new FenceView();
    v.build(lotWith({ fences: {
      '0:v:7:4': { id: '0:v:7:4', level: 0, dir: 'v', x: 7, z: 4, defId: 'post-rail' },
      '1:h:3:3': { id: '1:h:3:3', level: 1, dir: 'h', x: 3, z: 3, defId: 'glass-frameless' },
    } }));
    const boxes = new Map<number, { min: number[]; max: number[] }>();
    for (const g of v.group.children) {
      const lvl = Number(g.name.replace('fences-', ''));
      const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      g.traverse((o) => {
        const m = o as unknown as { isMesh?: boolean; geometry: { getAttribute(n: string): { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } } };
        if (!m.isMesh) return;
        const p = m.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) for (const [k, val] of [[0, p.getX(i)], [1, p.getY(i)], [2, p.getZ(i)]] as const) { b.min[k] = Math.min(b.min[k]!, val); b.max[k] = Math.max(b.max[k]!, val); }
      });
      boxes.set(lvl, b);
    }
    const g0 = boxes.get(0)!, g1 = boxes.get(1)!;
    expect(g0.min[0]).toBeGreaterThan(6.5); expect(g0.max[0]).toBeLessThan(7.5); // the 'v' edge at x = 7
    expect(g0.min[2]).toBeGreaterThanOrEqual(3.9); expect(g0.max[2]).toBeLessThan(5.2); // along z from 4 to 5
    expect(g1.min[1]).toBeGreaterThanOrEqual(3.0 - 1e-6); // level 1 is drawn at y = 3
    v.setActiveLevel(0);
    expect(v.group.children.find((c) => c.name === 'fences-1')!.visible).toBe(false);
    expect(v.group.children.find((c) => c.name === 'fences-0')!.visible).toBe(true);
    v.setActiveLevel(1);
    expect(v.group.children.find((c) => c.name === 'fences-1')!.visible).toBe(true);
  });
});

describe('RoofView', () => {
  const roofs = (styles: string[]): Lot => lotWith({ roofs: Object.fromEntries(styles.map((s, i) => [`r${i}`, {
    id: `r${i}`, level: i === styles.length - 1 && styles.length > 1 ? 1 : 0, x0: 2 + i * 7, z0: 2, x1: 8 + i * 7, z1: 6, styleId: s, ridge: 'h' as const, pitch: 30, finish: { designId: 'asphalt-shingle', paletteId: 'charcoal' },
  }])) });

  it('builds a group with meshes for every style', () => {
    const v = new RoofView();
    v.build(roofs(ROOF_STYLES.map((s) => s.id).slice(0, 5)));
    expect(v.group.children.length).toBe(5);
    for (const g of v.group.children) expect(g.children.length).toBeGreaterThanOrEqual(2);
    v.dispose();
  });

  it('shows roofs only with the toggle, the walls up (or a roof tool) and the level at or above', () => {
    const v = new RoofView();
    v.build(roofs(['gable', 'hip']));
    // roof r1 is on level 1
    v.setView({ enabled: true, walls: 'cutaway', level: 1, editing: false });
    expect(v.visibleRoofs()).toEqual([]);
    v.setView({ enabled: true, walls: 'up', level: 1, editing: false });
    expect(v.visibleRoofs().sort()).toEqual(['r0', 'r1']);
    v.setView({ enabled: true, walls: 'up', level: 0, editing: false });
    expect(v.visibleRoofs()).toEqual(['r0']);
    v.setView({ enabled: false, walls: 'up', level: 1, editing: false });
    expect(v.visibleRoofs()).toEqual([]);
    v.setView({ enabled: true, walls: 'down', level: 1, editing: false });
    expect(v.visibleRoofs()).toEqual([]);
    v.setView({ enabled: true, walls: 'cutaway', level: 1, editing: true });
    expect(v.visibleRoofs().sort()).toEqual(['r0', 'r1']);
    v.dispose();
  });

  it('sits on top of the walls of its level', () => {
    const v = new RoofView();
    const lot = roofs(['gable']);
    lot.walls['0:h:2:2'] = { id: '0:h:2:2', level: 0, dir: 'h', x: 2, z: 2, height: 3.6, sideA: { designId: 'a', paletteId: 'b' }, sideB: { designId: 'a', paletteId: 'b' } };
    v.build(lot);
    expect(v.group.children[0]!.position.y).toBeCloseTo(3.6);
    expect(v.group.children[0]!.position.x).toBe(2);
    v.dispose();
  });
});

describe('garden crop layout', () => {
  const g = (crop: string, growth: number, need: number, water = 1): GardenState => ({ crop, growth, need, water, weeds: 0, day: 1, harvests: 0 });

  it('has nothing for an empty bed and grows more visible by stage', () => {
    expect(gardenBlobs('garden-vegpatch', 'o1', undefined)).toEqual([]);
    expect(gardenBlobs('garden-vegpatch', 'o1', { ...g('tomato', 0, 5), crop: null })).toEqual([]);
    const seedling = gardenBlobs('garden-vegpatch', 'o1', g('tomato', 1, 5));
    const growing = gardenBlobs('garden-vegpatch', 'o1', g('tomato', 3, 5));
    const ripe = gardenBlobs('garden-vegpatch', 'o1', g('tomato', 5, 5));
    expect([gardenStage(g('tomato', 1, 5)), gardenStage(g('tomato', 3, 5)), gardenStage(g('tomato', 5, 5))]).toEqual([1, 2, 3]);
    expect(seedling.length).toBe(20);
    expect(seedling.every((b) => b.kind === 'leaf')).toBe(true);
    expect(growing.length).toBe(20);
    expect(Math.max(...growing.map((b) => b.rx))).toBeGreaterThan(Math.max(...seedling.map((b) => b.rx)));
    expect(ripe.filter((b) => b.kind === 'fruit').length).toBeGreaterThanOrEqual(40);
  });

  it('stays inside the bed footprint and shows wilting', () => {
    for (const [def, w, d] of [['garden-vegpatch', 2, 2], ['garden-herb-planter', 1, 1], ['garden-fruit-tree', 2, 2]] as const) {
      const crop = def === 'garden-fruit-tree' ? 'apple' : def === 'garden-herb-planter' ? 'basil' : 'carrot';
      for (const growth of [0.5, 2, 6]) for (const b of gardenBlobs(def, 'o2', g(crop, growth, 6))) {
        expect(b.x, def).toBeGreaterThanOrEqual(0); expect(b.x, def).toBeLessThanOrEqual(w);
        expect(b.z, def).toBeGreaterThanOrEqual(0); expect(b.z, def).toBeLessThanOrEqual(d);
      }
    }
    const wet = gardenBlobs('garden-vegpatch', 'o3', g('lettuce', 2, 3, 1));
    const dry = gardenBlobs('garden-vegpatch', 'o3', g('lettuce', 2, 3, 0));
    expect(dry[0]!.color).not.toBe(wet[0]!.color);
    expect(dry[0]!.ry).toBeLessThan(wet[0]!.ry);
  });

  it('pumpkins sprawl (every other spot) and the fruit tree shows fruit only when ripe', () => {
    const pumpkins = gardenBlobs('garden-vegpatch', 'o4', g('pumpkin', 7, 7));
    expect(pumpkins.filter((b) => b.kind === 'leaf').length).toBe(10);
    const tree = (growth: number) => gardenBlobs('garden-fruit-tree', 'o5', g('apple', growth, 6));
    expect(tree(1).every((b) => b.kind === 'bloom')).toBe(true);
    expect(tree(6).every((b) => b.kind === 'fruit')).toBe(true);
    expect(tree(6).length).toBeGreaterThan(tree(1).length);
  });
});
