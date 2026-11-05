import { describe, expect, it } from 'vitest';
import { OBJECTS } from '../../../src/content/objects';
import type { ContentDB } from '../../../src/content/types';
import { PART_NODES } from '../../../src/render/objectAssets';
import {
  ANIMATED_DEF_IDS, CLOSED_MOTION, DESCRIPTORS, activeParts, blankParts, descriptorFor, ease, isBakedRecipe,
  opennessAt, seedMotion, stepMotion, type OpenMotion,
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
