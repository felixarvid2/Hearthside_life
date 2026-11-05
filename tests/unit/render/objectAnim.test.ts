import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { OBJECTS } from '../../../src/content/objects';
import type { ContentDB, ObjectDef } from '../../../src/content/types';
import { ObjectAssets, PART_NODES } from '../../../src/render/objectAssets';
import {
  ANIMATED_DEF_IDS, CLOSED_MOTION, DESCRIPTORS, ObjectAnim, activeParts, allDescriptors, blankParts, descriptorFor, descriptorForDef, ease,
  isBakedRecipe, opennessAt, seedMotion, stepMotion, type OpenMotion,
} from '../../../src/render/objectAnim';
import type { ObjectUse } from '../../../src/render/objectUse';

const TIMING = { openMinutes: 0.4, closeMinutes: 0.4 };

function use(over: Partial<ObjectUse> & { interactionId: string }): ObjectUse {
  return {
    objectId: 'obj', role: 'target', personId: 'p', actionId: 'a', queuedAt: 0, phase: 'perform',
    anim: 'idle', animSince: 10, stage: null, elapsed: 1, duration: 10, data: {},
    ...over,
  };
}

const CONTENT = { recipes: { bread: { skill: 'baking' }, soup: { skill: 'cooking' } } } as unknown as ContentDB;

function defId(id: string) {
  const d = OBJECTS.find((o) => o.id === id);
  if (!d) throw new Error(`no def ${id}`);
  return d;
}

describe('objectAnim: descriptors', () => {
  it('covers every animated def with a descriptor whose asset matches the catalog', () => {
    for (const id of ANIMATED_DEF_IDS) {
      const desc = descriptorFor(id)!;
      expect(desc, id).toBeTruthy();
      expect(desc.asset, id).toBe(defId(id).model.asset);
    }
  });

  it('has a descriptor for every catalog appliance the interactions can drive', () => {
    // Derived from the catalog (not from DESCRIPTORS itself), so a newly added fridge/sink/etc. fails this test until
    // it gets descriptor; this is the "every animated def has a descriptor" guarantee.
    const kinds = new Set(['fridge', 'stove', 'toilet', 'shower', 'bath', 'sink', 'dishwasher', 'laundry']);
    const expected = OBJECTS.filter((d) => kinds.has(d.subcategory ?? '') || d.id === 'microwave');
    expect(expected.length).toBeGreaterThanOrEqual(14);
    for (const d of expected) expect(descriptorFor(d.id), d.id).toBeTruthy();
  });

  it('only pivots nodes that ObjectAssets keeps as separate parts', () => {
    for (const d of DESCRIPTORS) {
      const allowed = PART_NODES[d.asset] ?? [];
      for (const p of d.parts) {
        if (p.kind !== 'node') continue;
        expect(allowed, `${d.defId}: ${p.node}`).toContain(p.node);
        expect(Number.isFinite(p.angle)).toBe(true);
        expect(p.openMinutes).toBeGreaterThan(0);
        expect(p.closeMinutes).toBeGreaterThan(0);
      }
    }
  });

  it('has overlay panels and interior boxes inside the fitted model box', () => {
    for (const d of DESCRIPTORS) {
      for (const p of d.parts) {
        if (p.kind !== 'overlay') continue;
        for (const f of [...p.hinge, ...p.size]) {
          expect(f, d.defId).toBeGreaterThanOrEqual(0);
          expect(f, d.defId).toBeLessThanOrEqual(1);
        }
        expect(p.size[0]).toBeGreaterThan(0);
        expect(p.size[1]).toBeGreaterThan(0);
      }
      if (d.interiorBox) {
        const [x0, y0, z0, x1, y1, z1] = d.interiorBox;
        expect(x0, d.defId).toBeLessThan(x1);
        expect(y0, d.defId).toBeLessThan(y1);
        expect(z0, d.defId).toBeLessThan(z1);
        for (const f of d.interiorBox) expect(f).toBeGreaterThanOrEqual(0);
        // Cavities of closed-body appliances may start at (or just proud of) the fitted front face, so the lit
        // interior is visible in front of the body once the door swings away.
        for (const f of d.interiorBox) expect(f).toBeLessThanOrEqual(1.03);
      }
      if (d.tap) {
        expect(d.tap.top).toBeGreaterThan(d.tap.bottom);
        expect(d.tap.x).toBeGreaterThan(0);
        expect(d.tap.x).toBeLessThan(1);
      }
    }
  });
});

describe('objectAnim: triggers', () => {
  const fridge = descriptorFor('fridge-standard')!;
  const stove = descriptorFor('stove-basic')!;
  const wardrobe = descriptorFor('wardrobe-tall')!;
  const toilet = descriptorFor('toilet-basic')!;
  const shower = descriptorFor('shower-stall')!;
  const sink = descriptorFor('counter-sink')!;
  const dishwasher = descriptorFor('dishwasher')!;
  const side = descriptorFor('fridge-side-by-side')!;

  it('fridge opens while reaching in (openFridge) and closes once the anim ends', () => {
    const opening = activeParts(fridge, [use({ interactionId: 'grabSnack', anim: 'openFridge', animSince: 12 })], CONTENT);
    expect(opening.door).toEqual({ on: true, since: 12 });
    const eating = activeParts(fridge, [use({ interactionId: 'grabSnack', anim: 'eat' })], CONTENT);
    expect(eating.door.on).toBe(false);
  });

  it('fridge stays open for all of cookMeal stage 0 and for both side-by-side leaves', () => {
    const a = activeParts(fridge, [use({ interactionId: 'cookMeal', anim: 'openFridge', stage: 0 })], CONTENT);
    expect(a.door.on).toBe(true);
    const later = activeParts(fridge, [use({ interactionId: 'cookMeal', anim: 'eat', stage: 1 })], CONTENT);
    expect(later.door.on).toBe(false);
    const two = activeParts(side, [use({ interactionId: 'cookMeal', anim: 'openFridge', stage: 0 })], CONTENT);
    expect(two.door.on && two.door2.on).toBe(true);
  });

  it('stove runs rings, pot and steam from the stage-1 station use', () => {
    const a = activeParts(stove, [use({ interactionId: 'cookMeal', stage: 1, anim: 'cook', data: { stoveObj: 's' } })], CONTENT);
    expect(a.burners.on).toBe(true);
    expect(a.pan.on).toBe(true);
    expect(a.steam.on).toBe(true);
    expect(a.ovenDoor.on).toBe(false); // a savoury cook does not open the oven
  });

  it('only opens the oven door briefly at the start of a bake', () => {
    const early = activeParts(stove, [use({ interactionId: 'bakeTreat', anim: 'cook', data: { recipeId: 'bread' }, elapsed: 0.2, stage: null })], CONTENT);
    expect(isBakedRecipe(CONTENT, use({ interactionId: 'bakeTreat', data: { recipeId: 'bread' } }))).toBe(true);
    expect(early.ovenDoor.on).toBe(true);
    expect(early.pan.on).toBe(false);
    const later = activeParts(stove, [use({ interactionId: 'bakeTreat', anim: 'cook', data: { recipeId: 'bread' }, elapsed: 4 })], CONTENT);
    expect(later.ovenDoor.on).toBe(false);
    const soup = activeParts(stove, [use({ interactionId: 'bakeTreat', anim: 'cook', data: { recipeId: 'soup' }, elapsed: 0.2 })], CONTENT);
    expect(soup.ovenDoor.on).toBe(false);
  });

  it('opens both wardrobe doors while changing outfit and the toilet lid while in use', () => {
    const w = activeParts(wardrobe, [use({ interactionId: 'changeOutfit', anim: 'interact' })], CONTENT);
    expect(w.door.on && w.door2.on).toBe(true);
    expect(activeParts(wardrobe, [use({ interactionId: 'editOutfits' })], CONTENT).door.on).toBe(true);
    expect(activeParts(toilet, [use({ interactionId: 'useToilet', anim: 'toilet' })], CONTENT).lid.on).toBe(true);
    expect(activeParts(toilet, [use({ interactionId: 'takeShower' })], CONTENT).lid.on).toBe(false);
  });

  it('runs shower and bath water only while performing', () => {
    expect(activeParts(shower, [use({ interactionId: 'takeShower', anim: 'shower', phase: 'perform' })], CONTENT).shower.on).toBe(true);
    expect(activeParts(shower, [use({ interactionId: 'takeShower', phase: 'prepare' })], CONTENT).shower.on).toBe(false);
    const bath = descriptorFor('bathtub')!;
    expect(activeParts(bath, [use({ interactionId: 'takeBath', anim: 'sitIdle', phase: 'perform' })], CONTENT).bath.on).toBe(true);
  });

  it('runs the tap for washHands and for washDishes stage 1 at the sink', () => {
    expect(activeParts(sink, [use({ interactionId: 'washHands', anim: 'interact' })], CONTENT).tap.on).toBe(true);
    expect(activeParts(sink, [use({ interactionId: 'washDishes', anim: 'clean', stage: 1, role: 'station' })], CONTENT).tap.on).toBe(true);
    expect(activeParts(sink, [use({ interactionId: 'cookMeal', stage: 1 })], CONTENT).tap.on).toBe(false);
  });

  it('opens the dishwasher door at the start and end of its run and keeps the light on', () => {
    const start = activeParts(dishwasher, [use({ interactionId: 'washDishes', stage: 1, elapsed: 0.2, duration: 6 })], CONTENT);
    expect(start.door.on).toBe(true);
    expect(start.light.on).toBe(true);
    const middle = activeParts(dishwasher, [use({ interactionId: 'washDishes', stage: 1, elapsed: 3, duration: 6 })], CONTENT);
    expect(middle.door.on).toBe(false);
    expect(middle.light.on).toBe(true);
    const end = activeParts(dishwasher, [use({ interactionId: 'washDishes', stage: 1, elapsed: 5.8, duration: 6 })], CONTENT);
    expect(end.door.on).toBe(true);
  });

  it('has every flag off without uses', () => {
    expect(activeParts(fridge, [], CONTENT)).toEqual(blankParts());
  });
});

describe('objectAnim: openness', () => {
  const open: OpenMotion = { from: 0, to: 1, since: 10, duration: 0.4, active: true };

  it('is closed before, eased while opening, fully open after', () => {
    expect(opennessAt(CLOSED_MOTION, 10)).toBe(0);
    expect(opennessAt(open, 10)).toBe(0);
    expect(opennessAt(open, 10.2)).toBeCloseTo(ease(0.5), 6);
    expect(opennessAt(open, 10.2)).toBeCloseTo(0.5, 6);
    expect(opennessAt(open, 10.4)).toBe(1);
    expect(opennessAt(open, 99)).toBe(1);
  });

  it('closes over its close time and is closed after', () => {
    const closing: OpenMotion = { from: 1, to: 0, since: 20, duration: 0.4, active: false };
    expect(opennessAt(closing, 20)).toBe(1);
    expect(opennessAt(closing, 20.2)).toBeCloseTo(0.5, 6);
    expect(opennessAt(closing, 20.4)).toBe(0);
  });

  it('does not restart a tween when sampled every frame', () => {
    let m = open;
    for (const now of [10.05, 10.1, 10.15, 10.2]) m = stepMotion(m, true, now, TIMING);
    expect(m.since).toBe(10);
    expect(opennessAt(m, 10.2)).toBeCloseTo(0.5, 6);
  });

  it('reverses smoothly from the current value', () => {
    const half = opennessAt(open, 10.2);
    const closing = stepMotion(open, false, 10.2, TIMING);
    expect(closing.from).toBeCloseTo(half, 6);
    expect(opennessAt(closing, 10.2)).toBeCloseTo(half, 6);
  });

  it('seeds a part that loads in the middle of an action', () => {
    const m = seedMotion(true, 100, 100.2, TIMING);
    expect(opennessAt(m, 100.2)).toBeCloseTo(ease(0.5), 6);
    const done = seedMotion(true, 100, 101, TIMING);
    expect(opennessAt(done, 101)).toBe(1);
    expect(opennessAt(seedMotion(false, 100, 101, TIMING), 101)).toBe(0);
  });

  it('snaps with reduced motion', () => {
    expect(opennessAt(CLOSED_MOTION, 10, true)).toBe(0);
    const m = stepMotion(CLOSED_MOTION, true, 10, TIMING, true);
    expect(opennessAt(m, 10, true)).toBe(1);
    const closed = stepMotion(m, false, 10.1, TIMING, true);
    expect(opennessAt(closed, 10.1, true)).toBe(0);
  });

  it('opens three times faster in real time at 3x speed', () => {
    // 0.15 s real is 0.15 game minutes at 1x and 0.45 at 3x: fully open.
    const at1x = opennessAt(open, 10 + 0.15);
    const at3x = opennessAt(open, 10 + 0.45);
    expect(at1x).toBeCloseTo(ease(0.375), 6);
    expect(at3x).toBe(1);
    // Closing behaves the same way.
    const closing: OpenMotion = { from: 1, to: 0, since: 0, duration: 0.4, active: false };
    expect(opennessAt(closing, 0.3)).toBe(1 - ease(0.75));
    expect(opennessAt(closing, 1.2)).toBe(0);
  });
});

describe('objectAnim: content-declared animation (Milestone 10)', () => {
  const fridge = defId('fridge-retro-tall');
  const chest = defId('chest-of-drawers');

  it('builds a descriptor from ObjectDef.anim, after the table', () => {
    const d = descriptorForDef(fridge)!;
    expect(descriptorFor('fridge-retro-tall')).toBe(d);
    expect(d.kind).toBe('fridge');
    expect(d.asset).toBe('fridgeRetroTall');
    expect(d.parts.map((p) => [p.role, p.kind === 'node' && p.node])).toEqual([['door', 'anim:door'], ['interior', 'anim:interior']]);
    const drawers = descriptorForDef(chest)!;
    expect(drawers.kind).toBe('openWhileUsed');
    expect(drawers.parts.map((p) => p.kind === 'node' && p.slide)).toEqual([[0, 0, 0.3], [0, 0, 0.3]]);
    // the table wins for a def it lists
    const clash: ObjectDef = { ...fridge, id: 'fridge-standard', model: defId('fridge-standard').model };
    expect(descriptorForDef(clash)).toBe(descriptorFor('fridge-standard'));
    expect(allDescriptors().length).toBe(DESCRIPTORS.length + OBJECTS.filter((o) => o.anim && !ANIMATED_DEF_IDS.includes(o.id)).length);
  });

  it('carries tap and hob data from content into the descriptor, and tables-listed defs keep theirs', () => {
    const sinkNew = OBJECTS.find((o) => o.id === 'sink-single-bowl')!;
    const d = descriptorForDef(sinkNew)!;
    expect(d.kind).toBe('sink');
    expect(d.tap).toEqual(sinkNew.anim!.tap);
    expect(activeParts(d, [use({ interactionId: 'washHands' })], CONTENT).tap.on).toBe(true);
    const range = descriptorForDef(OBJECTS.find((o) => o.id === 'range-chef-six')!)!;
    expect(range.hob).toBe(true);
    expect(range.hobLayout!.rings).toHaveLength(6);
    expect(activeParts(range, [use({ interactionId: 'cookMeal', stage: 1, role: 'station' })], CONTENT).burners.on).toBe(true);
    expect(descriptorFor('stove-basic')!.hobLayout).toBeUndefined();
    for (const o of OBJECTS) {
      const t = o.anim?.tap;
      if (t) { expect(t.top, o.id).toBeGreaterThan(t.bottom); expect(t.x, o.id).toBeGreaterThan(0); expect(t.x, o.id).toBeLessThan(1); }
      for (const r of o.anim?.hob?.rings ?? []) for (const v of r) { expect(v, o.id).toBeGreaterThan(0); expect(v, o.id).toBeLessThan(1); }
    }
  });

  it('opens a shower door while the person steps in and out, and a top-loader lid while it is used', () => {
    const shower = descriptorForDef(OBJECTS.find((o) => o.id === 'shower-walk-in')!)!;
    const at = (phase: 'prepare' | 'perform' | 'apply') => activeParts(shower, [use({ interactionId: 'takeShower', phase })], CONTENT);
    expect([at('prepare').door.on, at('perform').door.on, at('apply').door.on]).toEqual([true, false, true]);
    expect([at('prepare').shower.on, at('perform').shower.on]).toEqual([false, true]);
    expect(activeParts(shower, [], CONTENT).door.on).toBe(false);
    const washer = descriptorForDef(OBJECTS.find((o) => o.id === 'washer-top-load')!)!;
    expect(activeParts(washer, [use({ interactionId: 'doLaundry' })], CONTENT).lid.on).toBe(true);
    expect(activeParts(descriptorFor('shower-stall')!, [use({ interactionId: 'takeShower', phase: 'prepare' })], CONTENT).door.on).toBe(true);
  });

  it('opens the retro fridge with the existing openFridge trigger', () => {
    const d = descriptorForDef(fridge)!;
    expect(activeParts(d, [use({ interactionId: 'grabSnack', anim: 'openFridge', animSince: 7 })], CONTENT).door).toEqual({ on: true, since: 7 });
    expect(activeParts(d, [use({ interactionId: 'grabSnack', anim: 'eat' })], CONTENT).door.on).toBe(false);
  });

  it('openWhileUsed opens every door, lid and drawer during the listed interactions only', () => {
    const d = descriptorForDef(chest)!;
    const a = activeParts(d, [use({ interactionId: 'changeOutfit', animSince: 3 })], CONTENT);
    expect([a.drawer.on, a.drawer2.on, a.door.on]).toEqual([true, true, true]);
    expect(a.drawer.since).toBe(3);
    expect(activeParts(d, [use({ interactionId: 'cleanObject' })], CONTENT).drawer.on).toBe(false);
    // without `on`, any interaction opens it
    const any = { ...d, on: undefined };
    expect(activeParts(any, [use({ interactionId: 'whatever' })], CONTENT).drawer2.on).toBe(true);
    expect(activeParts(any, [], CONTENT)).toEqual(blankParts());
  });

  describe('on the real models', () => {
    async function instance(def: ObjectDef) {
      const asset = def.model.asset;
      const buf = readFileSync(`public/assets/furniture/${asset}.glb`);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      const assets = new ObjectAssets('');
      (assets as unknown as { loader: unknown }).loader = {
        loadAsync: () => new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej)),
      };
      assets.manifest = { furniture: { [asset]: { file: `${asset}.glb`, min: [0, 0, 0], max: [1, 1, 1], materials: [] } } };
      await assets.load(asset);
      const model = assets.instance(def, {})!;
      const holder = new THREE.Group();
      holder.add(model);
      return { model, holder };
    }

    it('ObjectAssets keeps every anim:* node as a part:<name> pivot without a PART_NODES entry', async () => {
      expect(PART_NODES.fridgeRetroTall).toBeUndefined();
      const { model } = await instance(fridge);
      const door = model.getObjectByName('part:anim:door')!;
      expect(door).toBeTruthy();
      expect(model.getObjectByName('part:anim:interior')).toBeTruthy();
      // origin at the hinge: x = 0 (left edge), z = the door's mid thickness, in half-scale model units
      expect(door.position.x).toBeCloseTo(0, 5);
      expect(door.position.z).toBeCloseTo((0.7 + 0.025) * 0.5, 4);
      const { model: drawers } = await instance(chest);
      expect(drawers.getObjectByName('part:anim:drawer1')).toBeTruthy();
      expect(drawers.getObjectByName('part:anim:drawer2')).toBeTruthy();
    });

    it('swings the door, shows the interior only while open, and puts the door back', async () => {
      const { model } = await instance(fridge);
      const anim = new ObjectAnim(fridge, model, CONTENT);
      const door = model.getObjectByName('part:anim:door')!;
      const interior = model.getObjectByName('part:anim:interior')!;
      expect(interior.visible).toBe(false);
      anim.update([], 0, 0.016, true);
      expect(interior.visible).toBe(false);
      anim.update([use({ interactionId: 'grabSnack', anim: 'openFridge', animSince: 0 })], 1, 0.016, true);
      const q = door.quaternion;
      expect(2 * Math.acos(Math.abs(q.w))).toBeCloseTo(1.75, 3);
      expect(q.y).toBeLessThan(0); // negative turn about y: the door swings out to +z
      expect(interior.visible).toBe(true);
      anim.update([], 2, 0.016, true);
      expect(door.quaternion.w).toBeCloseTo(1, 6);
      expect(interior.visible).toBe(false);
    });

    it('slides the drawers by the declared distance (fitted metres) while the chest is used', async () => {
      const { model } = await instance(chest);
      const anim = new ObjectAnim(chest, model, CONTENT);
      const d1 = model.getObjectByName('part:anim:drawer1')!;
      const rest = d1.position.clone();
      anim.update([], 0, 0.016, true);
      expect(d1.position.distanceTo(rest)).toBeLessThan(1e-9);
      anim.update([use({ interactionId: 'changeOutfit', animSince: 0 })], 1, 0.016, true);
      // 0.3 m in the fitted space is 0.3 / scale in the model's own units
      expect(d1.position.z - rest.z).toBeCloseTo(0.3 / chest.model.scale, 5);
      expect(d1.position.x - rest.x).toBeCloseTo(0, 9);
      expect(model.getObjectByName('part:anim:drawer2')!.position.z).toBeGreaterThan(rest.z);
      anim.update([], 2, 0.016, true);
      expect(d1.position.distanceTo(rest)).toBeLessThan(1e-9);
    });
  });
});
