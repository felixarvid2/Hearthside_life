// The original furniture pipeline (tools/furniture-extra): named sub-parts, the model registry with its group files, the
// triangle budget and the measured screen rectangle. Milestone 10 authoring rules: dev/ds-tasks/m10f/AUTHORING.md.
import { NodeIO } from '@gltf-transform/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPORT_SCALE, Model } from '../../../tools/furniture-extra/kit.mjs';
import { EXTRA_MODELS, MODEL_GROUPS, MODEL_GROUP_OF, buildModels, mergeModelGroups } from '../../../tools/furniture-extra/models.mjs';

/** Hard cap for every original model; a model above it must be listed here by name (none is today). */
const TRIANGLE_BUDGET = 3000;
const OVER_BUDGET_EXEMPT: readonly string[] = [];

const io = new NodeIO();

describe('kit: named parts', () => {
  function sample() {
    const m = new Model('sample');
    m.box('wood', [0, 0, 0], [1, 1, 0.5]);
    const door = m.part('anim:door', [1, 0, 0.5]);
    door.box('woodDark', [0.1, 0.1, 0.5], [0.9, 0.9, 0.55]);
    m.part('anim:interior').box('carpetWhite', [0.1, 0.1, 0.1], [0.9, 0.9, 0.4]);
    return m;
  }

  it('writes the root plus one child node per part, origin at the pivot, vertices relative to it', async () => {
    const doc = await io.readBinary(await sample().toGlb(io));
    const root = doc.getRoot().listScenes()[0]!.listChildren()[0]!;
    expect(root.getName()).toBe('sample');
    expect(root.listChildren().map((n) => n.getName())).toEqual(['anim:door', 'anim:interior']);
    const door = root.listChildren()[0]!;
    expect(door.getTranslation()).toEqual([1 * EXPORT_SCALE, 0, 0.5 * EXPORT_SCALE]);
    const pos = door.getMesh()!.listPrimitives()[0]!.getAttribute('POSITION')!;
    expect(pos.getMin([])).toEqual([(0.1 - 1) * EXPORT_SCALE, 0.1 * EXPORT_SCALE, 0].map((v) => Math.fround(v)));
    // the world position of a part vertex equals the authored model position
    const world = door.getWorldMatrix();
    expect(world[12]! + pos.getMin([])[0]!).toBeCloseTo(0.1 * EXPORT_SCALE, 6);
    expect(root.getMesh()!.listPrimitives()).toHaveLength(1);
  });

  it('counts the triangles of the parts and shares materials between body and parts', async () => {
    const m = sample();
    expect(m.triangleCount()).toBe(36);
    expect(m.scaledTriangles()).toHaveLength(36);
    expect(m.partNames()).toEqual(['anim:door', 'anim:interior']);
    const doc = await io.readBinary(await m.toGlb(io));
    expect(doc.getRoot().listMaterials().map((x) => x.getName()).sort()).toEqual(['carpetWhite', 'wood', 'woodDark']);
  });

  it('returns the same builder for the same name and rejects bad names, moved pivots and nesting', () => {
    const m = new Model('x');
    const a = m.part('anim:door', [0, 0, 0]);
    expect(m.part('anim:door', [0, 0, 0])).toBe(a);
    expect(() => m.part('anim:door', [1, 0, 0])).toThrow(/another pivot/);
    expect(() => m.part('door')).toThrow(/anim:/);
    expect(() => m.part('anim:a b')).toThrow(/anim:/);
    expect(() => a.part('anim:inner')).toThrow(/nest/);
  });

  it('measures the picture rectangle from anim:screen (largest front face, tilt-aware)', () => {
    const m = new Model('s');
    const tilt = Math.PI / 6, up: [number, number, number] = [0, Math.cos(tilt), -Math.sin(tilt)], n = [0, Math.sin(tilt), Math.cos(tilt)];
    m.part('anim:screen').slab('metalDark', [0, 0, 0], [0.4, 0, 0], up.map((v) => v * 0.2) as [number, number, number], n.map((v) => v * 0.004) as [number, number, number]);
    const q = m.screenQuad()!;
    expect(q.width).toBeCloseTo(0.4 * EXPORT_SCALE, 3);
    expect(q.height).toBeCloseTo(0.2 * EXPORT_SCALE, 3);
    expect(q.normal[1]).toBeCloseTo(Math.sin(tilt), 3);
    expect(q.normal[2]).toBeCloseTo(Math.cos(tilt), 3);
    expect(new Model('none').screenQuad()).toBeNull();
  });

  it('exports a model without parts as a single node, as before', async () => {
    const m = new Model('plain');
    m.box('wood', [0, 0, 0], [1, 1, 1]);
    const doc = await io.readBinary(await m.toGlb(io));
    expect(doc.getRoot().listNodes()).toHaveLength(1);
    expect(m.partNames()).toEqual([]);
  });
});

describe('model registry', () => {
  it('collects the base models and every m10 group, each name once', () => {
    expect(Object.keys(MODEL_GROUPS)).toEqual(expect.arrayContaining(['base', 'seating-beds', 'tables-storage', 'kitchen-bath-electronics', 'lighting-outdoor-kids', 'decor-hobby']));
    const total = Object.values(MODEL_GROUPS).reduce((n, g) => n + Object.keys(g).length, 0);
    expect(Object.keys(EXTRA_MODELS)).toHaveLength(total);
    for (const [name, group] of Object.entries(MODEL_GROUP_OF)) expect(MODEL_GROUPS[group], name).toHaveProperty(name);
  });

  it('throws on a model defined in two groups, a bad name or a non-function', () => {
    const make = () => new Model('x');
    expect(() => mergeModelGroups({ a: { chairOne: make }, b: { chairOne: make } })).toThrow(/both 'a' and 'b'/);
    expect(() => mergeModelGroups({ a: { 'chair-one': make } })).toThrow(/camelCase/);
    expect(() => mergeModelGroups({ a: { chairOne: 3 } })).toThrow(/builder/);
    expect(mergeModelGroups({ a: { chairOne: make }, b: { chairTwo: make } }).groupOf).toEqual({ chairOne: 'a', chairTwo: 'b' });
  });

  it('builds a single group and rejects an unknown one', () => {
    expect(Object.keys(buildModels('tables-storage'))).toEqual(Object.keys(MODEL_GROUPS['tables-storage']!));
    expect(() => buildModels('nope')).toThrow(/unknown furniture group/);
  });
});

describe('triangle budget', () => {
  const models = buildModels();

  it(`keeps every original model at ${TRIANGLE_BUDGET} triangles or fewer`, () => {
    const over = Object.entries(models)
      .filter(([name, m]) => m.triangleCount() > TRIANGLE_BUDGET && !OVER_BUDGET_EXEMPT.includes(name))
      .map(([name, m]) => `${name}: ${m.triangleCount()}`);
    expect(over).toEqual([]);
    const max = Math.max(...Object.values(models).map((m) => m.triangleCount()));
    console.info(`furniture triangle budget: max ${max} of ${TRIANGLE_BUDGET} over ${Object.keys(models).length} models`);
  });

  it('only exempts models that exist and really are over budget', () => {
    for (const name of OVER_BUDGET_EXEMPT) expect(models[name]?.triangleCount(), name).toBeGreaterThan(TRIANGLE_BUDGET);
  });

  it('writes parts that match the manifest (animNodes, bounds, screen) for the generated models', () => {
    const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as { furniture: Record<string, { animNodes?: string[]; group?: string; screen?: unknown }> };
    for (const [name, m] of Object.entries(models)) {
      const entry = manifest.furniture[name];
      expect(entry, name).toBeDefined();
      expect(entry!.animNodes ?? [], name).toEqual(m.partNames());
      expect(!!entry!.screen, name).toBe(m.parts.has('anim:screen'));
    }
  });
});
