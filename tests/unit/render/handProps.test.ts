import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CharacterView } from '../../../src/characters/CharacterView';
import {
  HandProps, actionFraction, biteFraction, foodColor, mealDomeScale, mealPortion, propScale, propsFor, snackFor,
  type HandEnv, type PropAction, type PropAnim, type PropPerson,
} from '../../../src/render/handProps';

const person = (posture = 'standing', hunger = 60): PropPerson => ({ location: { kind: 'lot', posture }, needs: { hunger } });

function act(over: Partial<PropAction> & { interactionId: string }): PropAction {
  return { id: 'act_h1', phase: 'perform', elapsed: 0, duration: null, data: {}, ...over };
}

const done = (action: PropAction, anim: PropAnim | null = null, clock = action.elapsed, p = person()): ReturnType<typeof propsFor> =>
  propsFor(p, action, anim, clock, []);

describe('propsFor — no action / not in the hands', () => {
  it('holds nothing without an action or in a non-active phase', () => {
    expect(propsFor(person(), null, null, 0)).toEqual({});
    for (const phase of ['queued', 'validate', 'reserve', 'cleanup', 'done', 'failed', 'cancelled']) {
      expect(done(act({ interactionId: 'readBook', phase }))).toEqual({});
    }
  });
});

describe('propsFor — grabSnack', () => {
  it('picks a snack from the action id deterministically, or from data.snack', () => {
    const a = act({ interactionId: 'grabSnack', duration: 5 });
    const first = done(a).right?.kind;
    expect(first).toBe(snackFor(a));
    expect(done(a).right?.kind).toBe(first);
    expect(snackFor(act({ interactionId: 'grabSnack', data: { snack: 'yoghurt' } }))).toBe('yoghurt');
  });

  it('starts full when eating starts and shrinks in four bites, gone at the end', () => {
    const a = act({ interactionId: 'grabSnack', duration: 5, data: { snack: 'sandwich' } });
    expect(done({ ...a, elapsed: 0 }).right).toMatchObject({ kind: 'sandwich', portion: 1 });
    expect(done({ ...a, elapsed: 1.25 }).right?.portion).toBe(0.75);
    expect(done({ ...a, elapsed: 2.5 }).right?.portion).toBe(0.5);
    expect(done({ ...a, elapsed: 3.75 }).right?.portion).toBe(0.25);
    expect(done({ ...a, elapsed: 5 })).toEqual({});
  });

  it('uses the animation start so a bite lands between ticks, and survives a mid-action load', () => {
    const a = act({ interactionId: 'grabSnack', duration: 5, elapsed: 0, data: { snack: 'apple' } });
    expect(done(a, { id: 'eat', since: 0 }, 1.25).right?.portion).toBe(0.75);
    // loaded mid-eat: elapsed already carries the progress
    expect(done({ ...a, elapsed: 2.5 }, { id: 'eat', since: 100 }, 100.1).right?.portion).toBe(0.5);
  });

  it('puts a yoghurt in one hand and a spoon in the other', () => {
    const r = done(act({ interactionId: 'grabSnack', duration: 5, data: { snack: 'yoghurt' } }));
    expect(r.right).toMatchObject({ kind: 'yoghurt' });
    expect(r.left).toMatchObject({ kind: 'spoon' });
  });

  it('shows nothing when the snack action is cancelled', () => {
    const a = act({ interactionId: 'grabSnack', duration: 5, phase: 'cleanup', elapsed: 2, data: { snack: 'apple' } });
    expect(done(a)).toEqual({});
  });
});

describe('propsFor — cookMeal', () => {
  it('takes the ingredients out of the fridge at 60 % of the reach, not before', () => {
    const base = act({ interactionId: 'cookMeal', duration: 2, data: { stage: 0, recipeId: 'pasta' } });
    expect(done({ ...base, elapsed: 1.0 })).toEqual({});
    expect(done({ ...base, elapsed: 1.2 }).right).toMatchObject({ kind: 'ingredients', upright: true });
  });

  it('carries the ingredients to the stove and holds a spatula while cooking', () => {
    const carry = act({ interactionId: 'cookMeal', phase: 'route', data: { stage: 1, recipeId: 'pasta' } });
    expect(done(carry).right).toMatchObject({ kind: 'ingredients' });
    const cook = act({ interactionId: 'cookMeal', duration: 20, data: { stage: 1, recipeId: 'pasta' } });
    expect(done(cook).right).toMatchObject({ kind: 'spatula' });
  });

  it('carries a full plate to the counter and drops it when the meal item exists', () => {
    const carry = act({ interactionId: 'cookMeal', phase: 'route', data: { stage: 2, recipeId: 'pasta' } });
    expect(done(carry).carried).toMatchObject({ kind: 'plate', portion: 1, foodColor: foodColor('pasta') });
    const placed = act({ interactionId: 'cookMeal', duration: 1, data: { stage: 2, recipeId: 'pasta', itemId: 'itm_1' } });
    expect(propsFor(person(), placed, null, 0, { itm_1: { id: 'itm_1' } })).toEqual({});
    // a save that already recorded the item id but not the item keeps the plate carried
    expect(propsFor(person(), placed, null, 0, {})).toMatchObject({ carried: { kind: 'plate' } });
  });
});

describe('propsFor — eatMeal', () => {
  const pickup = (over: Partial<PropAction> = {}): PropAction => act({
    interactionId: 'eatMeal', duration: 1, data: { stage: 0, itemTaken: true, recipeId: 'stew' }, ...over,
  });

  it('takes the plate at the end of the pickup, after the item was taken', () => {
    expect(done(act({ interactionId: 'eatMeal', duration: 1, data: { stage: 0 } }))).toEqual({});
    expect(done(pickup({ elapsed: 0.3 }))).toEqual({});
    expect(done(pickup({ elapsed: 0.7 })).carried).toMatchObject({ kind: 'plate', foodColor: foodColor('stew') });
  });

  it('carries the plate to the seat', () => {
    const route = act({ interactionId: 'eatMeal', phase: 'route', data: { stage: 1, itemTaken: true, recipeId: 'stew' } });
    expect(done(route).carried).toMatchObject({ kind: 'plate' });
  });

  it('seated: puts the plate in front and eats with a fork, shrinking with elapsed/duration', () => {
    const a = act({ interactionId: 'eatMeal', duration: 25, elapsed: 5, data: { stage: 1, itemTaken: true, recipeId: 'stew' } });
    const r = done(a, { id: 'eat', since: 0 }, 5, person('seated'));
    expect(r.placed).toMatchObject({ kind: 'plate', portion: 0.8, foodColor: foodColor('stew') });
    expect(r.right).toMatchObject({ kind: 'fork' });
    expect(r.left).toBeUndefined();
    expect(done({ ...a, elapsed: 20 }, { id: 'eat', since: 0 }, 20, person('seated')).placed?.portion).toBeCloseTo(0.2);
  });

  it('standing: carries the plate in front of the body and eats with a fork', () => {
    const a = act({ interactionId: 'eatMeal', duration: 25, elapsed: 5, data: { stage: 1, itemTaken: true, recipeId: 'stew' } });
    const r = done(a, { id: 'eat', since: 0 }, 5, person('standing'));
    expect(r.carried).toMatchObject({ kind: 'plate', portion: 0.8 });
    expect(r.right).toMatchObject({ kind: 'fork' });
    expect(r.left).toBeUndefined();
    expect(r.placed).toBeUndefined();
  });

  it('puts the empty plate away when the dirty dishes are created', () => {
    const a = act({ interactionId: 'eatMeal', phase: 'apply', duration: 25, elapsed: 25, data: { stage: 1, itemTaken: true, recipeId: 'stew' } });
    expect(done(a, { id: 'eat', since: 0 }, 25, person('seated'))).toEqual({});
  });

  it('fills the portion share from hunger for an until-full meal', () => {
    const a = act({ interactionId: 'eatMeal', duration: null, elapsed: 4, data: { stage: 1, itemTaken: true, recipeId: 'stew' } });
    expect(done(a, { id: 'eat', since: 4 }, 4, person('seated', 40)).placed?.portion).toBe(0.4);
  });
});

describe('propsFor — everyday props', () => {
  const one = (interactionId: string, anim: string): ReturnType<typeof propsFor> =>
    done(act({ interactionId }), { id: anim, since: 0 }, 0);
  const side = (r: ReturnType<typeof propsFor>): string | undefined => r.right?.kind ?? r.left?.kind;

  it('holds an open book for reads and a lit phone for phone actions', () => {
    expect(one('readBook', 'read').left).toMatchObject({ kind: 'book' });
    expect(one('readSkillBook', 'read').left).toMatchObject({ kind: 'book' });
    expect(one('studyHard', 'read').left).toMatchObject({ kind: 'book' });
    expect(one('phoneChat', 'phone').right).toMatchObject({ kind: 'phone', upright: true });
    expect(one('callRepairperson', 'phone').right).toMatchObject({ kind: 'phone' });
  });

  it('maps drinks, watering, cleaning, repairs, fishing and cooking tools', () => {
    expect(side(one('makeCoffee', 'cook'))).toBe('mug');
    expect(side(one('buyCoffee', 'interact'))).toBe('mug');
    expect(side(one('blendSmoothie', 'cook'))).toBe('glass');
    expect(side(one('buyVendingDrink', 'interact'))).toBe('can');
    expect(side(one('waterPlant', 'water'))).toBe('wateringCan');
    expect(side(one('washDishes', 'clean'))).toBe('sponge');
    expect(side(one('cleanObject', 'clean'))).toBe('sprayBottle');
    expect(side(one('mopFloor', 'clean'))).toBe('mop');
    expect(side(one('tidyUp', 'clean'))).toBe('cloth');
    expect(side(one('repairObject', 'kneelFix'))).toBe('wrench');
    expect(side(one('serviceObject', 'kneelFix'))).toBe('wrench');
    expect(side(one('fishPond', 'interact'))).toBe('rod');
    expect(side(one('fishVenue', 'interact'))).toBe('rod');
    expect(side(one('grillFood', 'cook'))).toBe('spatula');
    expect(side(one('bakeTreat', 'cook'))).toBe('spatula');
    expect(side(one('paintCanvas', 'cook'))).toBe('brush');
    expect(side(one('paintToSell', 'cook'))).toBe('brush');
  });

  it('does not show a prop while walking to or picking up the object', () => {
    expect(done(act({ interactionId: 'readBook', phase: 'prepare', duration: 1, elapsed: 0.9 }))).toEqual({});
    expect(done(act({ interactionId: 'readBook', phase: 'route' }))).toEqual({});
    // an unmapped clean-animation action (lifting weights) leaves the hands free
    expect(done(act({ interactionId: 'liftWeights' }), { id: 'clean' })).toEqual({});
  });
});

describe('portion helpers', () => {
  it('splits a fixed meal by elapsed/duration and clamps', () => {
    const a = act({ interactionId: 'eatMeal', duration: 25 });
    expect(mealPortion(a, person(), 0)).toBe(1);
    expect(mealPortion(a, person(), 5)).toBe(0.8);
    expect(mealPortion(a, person(), 25)).toBe(0);
    expect(mealPortion(a, person(), 99)).toBe(0);
    expect(mealPortion({ ...a, duration: null }, person('standing', 40), 4)).toBe(0.4);
  });

  it('bites the snack in steps', () => {
    expect(biteFraction(0)).toBe(1);
    expect(biteFraction(0.24)).toBe(1);
    expect(biteFraction(0.25)).toBe(0.75);
    expect(biteFraction(0.5)).toBe(0.5);
    expect(biteFraction(0.75)).toBe(0.25);
    expect(biteFraction(0.99)).toBe(0.25);
    expect(biteFraction(1)).toBe(0);
    expect(biteFraction(0.5, 2)).toBe(0.5);
  });

  it('smooths perform progress with the animation start', () => {
    const a = act({ interactionId: 'eatMeal', duration: 25, elapsed: 0 });
    expect(actionFraction(a, { id: 'eat', since: 0 }, 5)).toBe(0.2);
    expect(actionFraction(a, null, 5)).toBe(0);
    expect(actionFraction({ ...a, phase: 'route', duration: null }, { id: 'walk', since: 0 }, 5)).toBe(0);
    expect(actionFraction({ ...a, elapsed: 20 }, { id: 'eat', since: 0 }, 5)).toBe(0.8);
  });

  it('uses one palette for served and carried meals', () => {
    expect(foodColor('stew')).toBe(foodColor('stew'));
    expect([0xd9a441, 0xc8553d, 0x8fae4a, 0xe0c07a, 0xb5653a, 0xf0d9a0]).toContain(foodColor('pasta'));
    expect(mealDomeScale(0)).toBeCloseTo(0.55);
    expect(mealDomeScale(1)).toBeCloseTo(0.65);
    expect(mealDomeScale(9)).toBeCloseTo(0.95);
  });
});

describe('HandProps — attachment and disposal', () => {
  function fakeView(): { view: CharacterView; root: THREE.Group; bone: THREE.Bone } {
    const root = new THREE.Group();
    const bone = new THREE.Bone();
    bone.name = 'hand_r';
    root.add(bone);
    const view = { root, bone: (): THREE.Bone => bone } as unknown as CharacterView;
    return { view, root, bone };
  }
  const env: HandEnv = { scale: 1, tableY: 0.7, forward: 0.5 };

  it('attaches to the hand bone, updates in place and removes when the hands are empty', () => {
    const { view, bone } = fakeView();
    const props = new HandProps(view);
    props.update({ right: { kind: 'fork' } }, env);
    expect(bone.children).toHaveLength(1);
    const group = bone.children[0]!;
    expect(group.name).toBe('hand-prop-fork');

    props.update({ right: { kind: 'fork' } }, env);
    expect(bone.children[0]).toBe(group);

    props.update({ right: { kind: 'plate', portion: 1, foodColor: 0xd9a441, upright: true } }, env);
    expect(bone.children[0]!.name).toBe('hand-prop-plate');
    const food = (bone.children[0]!.children[1] as THREE.Object3D);
    const tall = food.scale.y;
    props.update({ right: { kind: 'plate', portion: 0.25, foodColor: 0xd9a441, upright: true } }, env);
    expect(food.scale.y).toBeLessThan(tall);

    props.update({}, env);
    expect(bone.children).toHaveLength(0);
    props.dispose();
  });

  it('places a plate in front of a seated eater and scales it for a stage body', () => {
    const { view, root, bone } = fakeView();
    const props = new HandProps(view);
    props.update({ placed: { kind: 'plate', portion: 0.8, foodColor: 0xc8553d } }, env);
    const placed = root.children.find((c) => c.name === 'hand-prop-plate');
    expect(placed).toBeTruthy();
    expect(placed!.position.y).toBeCloseTo(0.7);
    expect(placed!.position.z).toBeCloseTo(0.5);

    props.update({ right: { kind: 'fork' } }, { ...env, scale: 0.75 });
    const fork = bone.children.find((c) => c.name === 'hand-prop-fork');
    expect(fork!.scale.x).toBeCloseTo(0.75 * propScale('fork'));
    props.dispose();
  });

  it('carries the plate level in front of the body, not at a hand by the hip, and enlarges props to read', () => {
    const { view, root } = fakeView();
    const props = new HandProps(view);
    props.update({ carried: { kind: 'plate', portion: 1, foodColor: 0xd9a441, upright: true } }, env);
    const carried = root.children.find((c) => c.name === 'hand-prop-plate');
    expect(carried).toBeTruthy();
    // Root-local: CharacterView faces +z, so the plate sits out in front at waist/chest height and stays level.
    expect(carried!.position.x).toBeCloseTo(0);
    expect(carried!.position.y).toBeCloseTo(1.03);
    expect(carried!.position.z).toBeCloseTo(0.36);
    expect(carried!.rotation.x).toBeCloseTo(0);
    expect(carried!.rotation.z).toBeCloseTo(0);
    // Drawn larger than life so it reads at the default camera distance.
    expect(carried!.scale.x).toBeCloseTo(propScale('plate'));
    expect(propScale('plate')).toBeGreaterThanOrEqual(1.4);
    expect(propScale('fork')).toBeGreaterThanOrEqual(1.4);
    expect(propScale('fork')).toBeLessThanOrEqual(1.8);

    props.update({ placed: { kind: 'plate', portion: 1 } }, env);
    expect(root.children.some((c) => c.name === 'hand-prop-plate')).toBe(true);
    expect(root.children.filter((c) => c.name === 'hand-prop-plate')).toHaveLength(1);
    props.dispose();
  });
});
