// Milestone 11.5, task H: small props that follow the hands of the shared rig (snacks, ingredients, plates,
// forks, books, phones, mugs, tools). The rules are pure and derived from the running action and its animation;
// the render half is one group per hand attached to the hand bones, with shared geometries and materials.
//
// Hand-local bind space of the Quaternius rig (measured from the GLB): +Y points from the wrist toward the
// fingers, +Z is the thumb side and +X is roughly model up in the T-pose. Tool-like props are built along +Y so
// they sit in the grip; flat props that should stay level (plate, mug, watering can) use `upright`, which keeps
// their orientation in the body's frame instead of following every wrist turn.

import * as THREE from 'three';
import type { ActionPhase, WorldItem } from '../core/types';
import type { CharacterView } from '../characters/CharacterView';

export type PropKind =
  | 'sandwich' | 'apple' | 'yoghurt' | 'spoon' | 'ingredients' | 'plate' | 'fork'
  | 'book' | 'phone' | 'mug' | 'glass' | 'can' | 'wateringCan' | 'sponge' | 'sprayBottle'
  | 'mop' | 'cloth' | 'wrench' | 'rod' | 'spatula' | 'brush';

export interface PropSpec {
  kind: PropKind;
  /** Remaining food, 1 = full, 0 = empty (plate, snacks). */
  portion?: number;
  /** Food colour of the recipe (plate). */
  foodColor?: number;
  /** Keep the prop level in the body's frame rather than letting the wrist turn it. */
  upright?: boolean;
}

export interface HandPropsResult {
  right?: PropSpec;
  left?: PropSpec;
  /** A prop put down in front of the person (a plate on the table while seated eating). */
  placed?: PropSpec;
}

// ---------------------------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------------------------

/** The parts of a person the rules read (Person is assignable to this). */
export interface PropPerson {
  location?: { kind: string; posture?: string };
  needs?: { hunger?: number };
}

/** The parts of a person's animation the rules read. */
export interface PropAnim { id: string; since?: number }

/** The parts of an action the rules read (ActionInstance is assignable to this). */
export interface PropAction {
  id: string;
  interactionId: string;
  phase: ActionPhase | string;
  elapsed: number;
  duration: number | null;
  data: Record<string, string | number | boolean | null>;
}

type Snack = 'sandwich' | 'apple' | 'yoghurt';
const SNACKS: readonly Snack[] = ['sandwich', 'apple', 'yoghurt'];

const ACTIVE: ReadonlySet<string> = new Set<string>(['prepare', 'perform', 'apply', 'route']);

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** World items either as the state's id map (the render path) or as a list (tests). */
export type PropItems = Readonly<Record<string, Pick<WorldItem, 'id'>>> | readonly Pick<WorldItem, 'id'>[];

function itemExists(items: PropItems, id: string): boolean {
  if (Array.isArray(items)) return (items as readonly Pick<WorldItem, 'id'>[]).some((it) => it.id === id);
  return id in (items as Readonly<Record<string, Pick<WorldItem, 'id'>>>);
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** Recipe colour of the served food, the same palette as the meal items drawn by objectsView. */
const FOOD_PALETTE = [0xd9a441, 0xc8553d, 0x8fae4a, 0xe0c07a, 0xb5653a, 0xf0d9a0] as const;
export function foodColor(recipeId: string): number {
  return FOOD_PALETTE[hash(recipeId) % FOOD_PALETTE.length]!;
}

/** Height scale of the served meal's food dome: more portions, a taller mound (objectsView). */
export function mealDomeScale(portions: number): number {
  return 0.55 + 0.1 * Math.min(4, Math.max(0, portions));
}

/** The snack a grab-a-snack action takes: `data.snack` when the sim supplies one, else a stable pick from the id. */
export function snackFor(action: PropAction): Snack {
  const wanted = action.data.snack;
  if (wanted === 'sandwich' || wanted === 'apple' || wanted === 'yoghurt') return wanted;
  return SNACKS[hash(action.id) % SNACKS.length]!;
}

/** Stepwise snack shrink: four bites, gone at the end. */
export function biteFraction(progress: number, bites = 4): number {
  const p = clamp01(progress);
  if (p >= 1) return 0;
  return 1 - Math.min(bites - 1, Math.floor(p * bites)) / bites;
}

/**
 * How much food is left on the plate: the eaten share for a fixed-duration meal, or the hunger the meal has
 * filled for an until-full one (the serving splits the same way for every bite).
 */
export function mealPortion(action: PropAction, person: PropPerson, elapsed = action.elapsed): number {
  if (action.duration !== null && action.duration > 0) return clamp01(1 - elapsed / action.duration);
  return clamp01((person.needs?.hunger ?? 0) / 100);
}

/** Perform progress 0..1, using the animation start so a plate shrinks smoothly between simulation ticks. */
export function actionFraction(action: PropAction, anim: PropAnim | null, clock: number): number {
  const d = action.duration;
  if (d === null || d <= 0) return 0;
  let elapsed = action.elapsed;
  if (action.phase === 'perform' && anim && typeof anim.since === 'number' && Number.isFinite(anim.since)) {
    elapsed = Math.max(elapsed, Math.min(d, clock - anim.since));
  }
  return clamp01(elapsed / d);
}

function snackProps(action: PropAction, portion: number): HandPropsResult {
  const kind = snackFor(action);
  if (kind === 'yoghurt') {
    return { right: { kind: 'yoghurt', portion }, left: { kind: 'spoon' } };
  }
  return { right: { kind, portion } };
}

function mealPlate(action: PropAction, portion: number): PropSpec {
  const recipe = typeof action.data.recipeId === 'string' ? action.data.recipeId : 'meal';
  return { kind: 'plate', portion, foodColor: foodColor(recipe), upright: true };
}

/** Hand prop for the everyday interactions that hold one small object (null: nothing in the hands). */
function everydayProp(id: string, anim: string): { kind: PropKind; hand: 'right' | 'left'; upright?: boolean } | null {
  const right = (kind: PropKind): { kind: PropKind; hand: 'right'; upright?: boolean } => ({ kind, hand: 'right' });
  if (id === 'readBook' || id === 'readSkillBook' || id === 'studyHard' || anim === 'read') return { kind: 'book', hand: 'left' };
  if (anim === 'phone' || id.startsWith('phone') || id === 'callRepairperson') return { kind: 'phone', hand: 'right', upright: true };
  if (id === 'makeCoffee' || id === 'buyCoffee') return { ...right('mug'), upright: true };
  if (id === 'blendSmoothie') return { ...right('glass'), upright: true };
  if (id === 'buyVendingDrink') return { ...right('can'), upright: true };
  if (id === 'waterPlant' || anim === 'water') return { ...right('wateringCan'), upright: true };
  if (id === 'washDishes') return right('sponge');
  if (id === 'cleanObject') return right('sprayBottle');
  if (id === 'mopFloor') return right('mop');
  if (id === 'tidyUp') return right('cloth');
  if (id === 'repairObject' || id === 'serviceObject' || anim === 'kneelFix') return right('wrench');
  if (id === 'fishPond' || id === 'fishVenue') return right('rod');
  if (id === 'grillFood' || id === 'makeToast' || id === 'bakeTreat') return right('spatula');
  if (id === 'paintCanvas' || id === 'paintToSell') return right('brush');
  return null;
}

/**
 * What a person holds right now, from the running action (`person.queue[0]`), their animation and the clock.
 * Only the stage at hand is considered: walking to a fridge, a cancelled action or an off-lot person gives
 * nothing. Plates for `eatMeal` shrink through the perform phase; the carried plate in `cookMeal` stays full
 * until the served item exists.
 */
export function propsFor(
  person: PropPerson,
  action: PropAction | null,
  anim: PropAnim | null,
  clock: number,
  items: PropItems = [],
): HandPropsResult {
  if (!action || !ACTIVE.has(action.phase)) return {};
  const phase = action.phase;
  const id = action.interactionId;
  const progress = actionFraction(action, anim, clock);
  const stage = typeof action.data.stage === 'number' ? action.data.stage : 0;

  if (id === 'grabSnack') {
    if (phase === 'prepare') return progress >= 0.6 ? snackProps(action, 1) : {};
    if (phase === 'perform') {
      const portion = biteFraction(progress);
      return portion > 0 ? snackProps(action, portion) : {};
    }
    return {};
  }

  if (id === 'cookMeal') {
    if (stage === 0) {
      if (phase === 'route') return {};
      return progress >= 0.6 ? { right: { kind: 'ingredients', upright: true } } : {};
    }
    if (stage === 1) {
      if (phase === 'route') return { right: { kind: 'ingredients', upright: true } };
      return { right: { kind: 'spatula' } };
    }
    // Stage 2: carry the served plate to the counter; the item itself takes over when it appears.
    if (typeof action.data.itemId === 'string' && itemExists(items, action.data.itemId)) return {};
    return phase === 'route' || phase === 'prepare' || phase === 'perform' || phase === 'apply'
      ? { right: mealPlate(action, 1) }
      : {};
  }

  if (id === 'eatMeal') {
    const taken = action.data.itemTaken === true;
    if (stage === 0) {
      if (!taken) return {};
      // The plate comes out of the fridge/counter at the end of the reach, not before the hand is there.
      if (phase === 'perform' && progress < 0.6) return {};
      return { right: mealPlate(action, 1) };
    }
    if (phase === 'apply') return {}; // the dirty plate is the sim's item now
    const portion = mealPortion(action, person, action.phase === 'perform'
      ? Math.max(action.elapsed, Math.min(action.duration ?? action.elapsed, clock - (anim?.since ?? clock)))
      : action.elapsed);
    const seated = person.location?.kind === 'lot' && person.location.posture === 'seated';
    if (phase === 'route' || phase === 'prepare') return { right: mealPlate(action, portion) };
    const plate = mealPlate(action, portion);
    if (seated) return { placed: plate, right: { kind: 'fork' } };
    return { left: { ...plate, upright: true }, right: { kind: 'fork' } };
  }

  // Everything else: a hand prop during the perform phase (and the moment of applying it), never while
  // walking there or during the pickup prepare.
  if (phase !== 'perform' && phase !== 'apply') return {};
  const prop = everydayProp(id, anim?.id ?? '');
  if (!prop) return {};
  const spec: PropSpec = { kind: prop.kind, ...(prop.upright ? { upright: true } : {}) };
  return prop.hand === 'left' ? { left: spec } : { right: spec };
}

// ---------------------------------------------------------------------------------------------
// Shared low-poly prop resources
// ---------------------------------------------------------------------------------------------

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const UNIT_CYL6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const UNIT_SPHERE = new THREE.SphereGeometry(0.5, 12, 8);
const UNIT_DOME = new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const UNIT_CONE = new THREE.ConeGeometry(0.5, 1, 8);
const UNIT_TORUS = new THREE.TorusGeometry(0.5, 0.09, 6, 12);

interface Look { roughness?: number; metalness?: number; emissive?: number; emissiveIntensity?: number; transparent?: boolean; opacity?: number; side?: THREE.Side }
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const basicCache = new Map<number, THREE.MeshBasicMaterial>();

function material(color: number, look: Look = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${look.roughness ?? 0.7}|${look.metalness ?? 0}|${look.emissive ?? 0}|${look.emissiveIntensity ?? 1}|${look.transparent ? look.opacity ?? 1 : 0}|${look.side ?? 0}`;
  let m = materialCache.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    color, roughness: look.roughness ?? 0.7, metalness: look.metalness ?? 0,
    transparent: look.transparent ?? false, opacity: look.opacity ?? 1, side: look.side ?? THREE.FrontSide,
  });
  if (look.emissive !== undefined) { m.emissive.set(look.emissive); m.emissiveIntensity = look.emissiveIntensity ?? 1; }
  materialCache.set(key, m);
  return m;
}

function glow(color: number): THREE.MeshBasicMaterial {
  let m = basicCache.get(color);
  if (!m) { m = new THREE.MeshBasicMaterial({ color }); basicCache.set(color, m); }
  return m;
}

const COL = {
  cream: 0xf7f3ea, bread: 0xd9a75c, crust: 0xb07a3c, filling: 0xa34f3a, cheese: 0xe8c34a,
  apple: 0xc8473d, stem: 0x6b4a2f, leaf: 0x5f8f3f, yoghurt: 0xf2efe8, berry: 0xcf5a73,
  metal: 0xb9c0c6, darkMetal: 0x7c8288, wood: 0x9a6a3f, coffee: 0x4a2f1d,
  book: 0x7a4b3a, pages: 0xefe6d2, phone: 0x2b2b2e, screen: 0x9fd7ff,
  sponge: 0xe8c34a, scrub: 0x4f7f4a, spray: 0x6fa8b8, trigger: 0x333638,
  paper: 0xc9a76a, veg: 0x5f8f3f, carrot: 0xd17a2e, glass: 0xcfe3ea, juice: 0xe0a030,
  rod: 0x6b4a2f, bristle: 0x3c3a36, cloth: 0xf2f0e8,
} as const;

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, scale: [number, number, number], pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(scale[0], scale[1], scale[2]);
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = false;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

interface BuiltProp {
  obj: THREE.Group;
  setPortion?: (portion: number) => void;
}

function buildSnack(kind: 'sandwich' | 'apple' | 'yoghurt'): BuiltProp {
  const g = new THREE.Group();
  const stretch = new THREE.Group();
  g.add(stretch);
  if (kind === 'sandwich') {
    add(stretch, UNIT_BOX, material(COL.bread, { roughness: 0.9 }), [0.09, 0.016, 0.08], [0, 0.05, 0]);
    add(stretch, UNIT_BOX, material(COL.filling, { roughness: 0.85 }), [0.082, 0.009, 0.072], [0, 0.038, 0]);
    add(stretch, UNIT_BOX, material(COL.cheese, { roughness: 0.85 }), [0.06, 0.006, 0.055], [0.008, 0.031, 0]);
    add(stretch, UNIT_BOX, material(COL.bread, { roughness: 0.9 }), [0.09, 0.016, 0.08], [0, 0.019, 0]);
  } else if (kind === 'apple') {
    add(stretch, UNIT_SPHERE, material(COL.apple, { roughness: 0.65 }), [0.085, 0.09, 0.085], [0, 0.045, 0]);
    add(stretch, UNIT_CYL6, material(COL.stem, { roughness: 0.9 }), [0.008, 0.025, 0.008], [0, 0.095, 0]);
    add(stretch, UNIT_SPHERE, material(COL.leaf, { roughness: 0.8 }), [0.03, 0.008, 0.016], [0.018, 0.095, 0], [0, 0, 0.4]);
  } else {
    add(stretch, UNIT_CYL, material(COL.yoghurt, { roughness: 0.6 }), [0.072, 0.075, 0.072], [0, 0.038, 0]);
    add(stretch, UNIT_CYL, material(COL.berry, { roughness: 0.7 }), [0.074, 0.018, 0.074], [0, 0.045, 0]);
    add(stretch, UNIT_CYL, material(COL.yoghurt, { roughness: 0.5 }), [0.06, 0.004, 0.06], [0, 0.078, 0]);
  }
  g.position.y = 0;
  const setPortion = (p: number): void => {
    const s = 0.55 + 0.45 * clamp01(p);
    stretch.scale.setScalar(s);
    stretch.position.y = (1 - s) * 0.025;
  };
  return { obj: g, setPortion };
}

function buildSpoon(): BuiltProp {
  const g = new THREE.Group();
  add(g, UNIT_CYL6, material(COL.metal, { roughness: 0.35, metalness: 0.7 }), [0.012, 0.1, 0.012], [0, 0.05, 0]);
  add(g, UNIT_SPHERE, material(COL.metal, { roughness: 0.35, metalness: 0.7 }), [0.024, 0.03, 0.034], [0, 0.105, 0]);
  return { obj: g };
}

function buildIngredients(): BuiltProp {
  const g = new THREE.Group();
  add(g, UNIT_BOX, material(COL.paper, { roughness: 0.95 }), [0.12, 0.16, 0.085], [0, 0.08, 0]);
  add(g, UNIT_BOX, material(0xb8975c, { roughness: 0.95 }), [0.124, 0.022, 0.09], [0, 0.155, 0]);
  add(g, UNIT_SPHERE, material(COL.veg, { roughness: 0.8 }), [0.05, 0.045, 0.05], [-0.02, 0.185, 0]);
  add(g, UNIT_SPHERE, material(COL.leaf, { roughness: 0.8 }), [0.04, 0.05, 0.04], [0.025, 0.19, 0.01]);
  add(g, UNIT_CONE, material(COL.carrot, { roughness: 0.8 }), [0.028, 0.08, 0.028], [0.005, 0.2, -0.02], [0.2, 0, 0.15]);
  return { obj: g };
}

function buildPlate(food: number): BuiltProp {
  const g = new THREE.Group();
  add(g, UNIT_CYL, material(COL.cream, { roughness: 0.4 }), [0.24, 0.018, 0.24], [0, 0.009, 0]);
  const foodGroup = new THREE.Group();
  g.add(foodGroup);
  add(foodGroup, UNIT_DOME, material(food, { roughness: 0.75 }), [0.155, 0.1, 0.155], [0, 0.017, 0]);
  add(foodGroup, UNIT_SPHERE, material(food, { roughness: 0.75 }), [0.045, 0.028, 0.045], [0.05, 0.03, -0.035]);
  const setPortion = (p: number): void => {
    const v = clamp01(p);
    foodGroup.visible = v > 0.02;
    foodGroup.scale.set(0.55 + 0.45 * v, 0.2 + 0.8 * v, 0.55 + 0.45 * v);
    foodGroup.position.y = 0.017 * (1 - v) * 0.4;
  };
  setPortion(1);
  return { obj: g, setPortion };
}

function buildFork(): BuiltProp {
  const g = new THREE.Group();
  const metal = material(COL.metal, { roughness: 0.35, metalness: 0.75 });
  add(g, UNIT_BOX, metal, [0.014, 0.105, 0.012], [0, 0.055, 0]);
  add(g, UNIT_BOX, metal, [0.032, 0.03, 0.008], [0, 0.12, 0]);
  for (const x of [-0.011, 0, 0.011]) add(g, UNIT_BOX, metal, [0.004, 0.028, 0.006], [x, 0.148, 0]);
  return { obj: g };
}

function buildBook(): BuiltProp {
  const g = new THREE.Group();
  const cover = material(COL.book, { roughness: 0.75 });
  const pages = material(COL.pages, { roughness: 0.9 });
  for (const s of [-1, 1]) {
    add(g, UNIT_BOX, cover, [0.09, 0.012, 0.15], [s * 0.047, 0.006, 0], [0, 0, s * 0.16]);
    add(g, UNIT_BOX, pages, [0.086, 0.012, 0.142], [s * 0.047, 0.018, 0.002], [0, 0, s * 0.16]);
  }
  add(g, UNIT_BOX, cover, [0.012, 0.018, 0.15], [0, 0.012, 0]);
  return { obj: g };
}

function buildPhone(): BuiltProp {
  const g = new THREE.Group();
  add(g, UNIT_BOX, material(COL.phone, { roughness: 0.35, metalness: 0.2 }), [0.078, 0.15, 0.01], [0, 0.075, 0]);
  add(g, UNIT_BOX, glow(COL.screen), [0.066, 0.132, 0.002], [0, 0.075, 0.0065]);
  add(g, UNIT_BOX, material(0xffffff, { roughness: 0.5 }), [0.012, 0.004, 0.003], [0, 0.005, 0.0065]);
  return { obj: g };
}

function buildMug(): BuiltProp {
  const g = new THREE.Group();
  add(g, UNIT_CYL, material(COL.cream, { roughness: 0.45 }), [0.078, 0.09, 0.078], [0, 0.045, 0]);
  add(g, UNIT_CYL, material(COL.coffee, { roughness: 0.5 }), [0.064, 0.006, 0.064], [0, 0.086, 0]);
  add(g, UNIT_TORUS, material(COL.cream, { roughness: 0.45 }), [0.07, 0.07, 0.07], [0.042, 0.05, 0], [0, Math.PI / 2, 0]);
  return { obj: g };
}

function buildGlass(): BuiltProp {
  const g = new THREE.Group();
  add(g, UNIT_CYL, material(COL.glass, { roughness: 0.15, transparent: true, opacity: 0.38 }), [0.066, 0.1, 0.066], [0, 0.05, 0]);
  add(g, UNIT_CYL, material(COL.juice, { roughness: 0.35 }), [0.056, 0.06, 0.056], [0, 0.033, 0]);
  return { obj: g };
}

function buildCan(): BuiltProp {
  const g = new THREE.Group();
  add(g, UNIT_CYL, material(COL.metal, { roughness: 0.3, metalness: 0.8 }), [0.056, 0.09, 0.056], [0, 0.045, 0]);
  add(g, UNIT_CYL, material(0xc8473d, { roughness: 0.5 }), [0.058, 0.05, 0.058], [0, 0.046, 0]);
  return { obj: g };
}

function buildWateringCan(): BuiltProp {
  const g = new THREE.Group();
  const green = material(0x5f8f6a, { roughness: 0.55, metalness: 0.15 });
  add(g, UNIT_CYL, green, [0.14, 0.14, 0.14], [0, 0.07, 0]);
  add(g, UNIT_CYL, green, [0.012, 0.02, 0.012], [0, 0.145, 0]);
  add(g, UNIT_TORUS, green, [0.09, 0.09, 0.09], [0, 0.16, 0], [Math.PI / 2, 0, 0]);
  add(g, UNIT_CYL, green, [0.022, 0.2, 0.022], [0, 0.1, 0.13], [1.05, 0, 0]);
  add(g, UNIT_CONE, green, [0.06, 0.06, 0.06], [0, 0.185, 0.185], [1.05, 0, 0]);
  return { obj: g };
}

function buildSponge(): BuiltProp {
  const g = new THREE.Group();
  add(g, UNIT_BOX, material(COL.sponge, { roughness: 0.95 }), [0.1, 0.035, 0.065], [0, 0.018, 0]);
  add(g, UNIT_BOX, material(COL.scrub, { roughness: 1 }), [0.1, 0.01, 0.065], [0, 0.04, 0]);
  return { obj: g };
}

function buildSpray(): BuiltProp {
  const g = new THREE.Group();
  add(g, UNIT_CYL, material(COL.spray, { roughness: 0.45, transparent: true, opacity: 0.8 }), [0.06, 0.11, 0.06], [0, 0.055, 0]);
  add(g, UNIT_CYL, material(COL.trigger, { roughness: 0.6 }), [0.022, 0.03, 0.022], [0, 0.125, 0]);
  add(g, UNIT_BOX, material(COL.trigger, { roughness: 0.6 }), [0.03, 0.014, 0.045], [0, 0.145, 0.014]);
  add(g, UNIT_CYL, material(COL.darkMetal, { roughness: 0.5 }), [0.012, 0.02, 0.012], [0, 0.15, 0.045], [Math.PI / 2, 0, 0]);
  return { obj: g };
}

function buildMop(): BuiltProp {
  const g = new THREE.Group();
  add(g, UNIT_CYL, material(COL.wood, { roughness: 0.85 }), [0.024, 0.7, 0.024], [0, 0.35, 0]);
  add(g, UNIT_BOX, material(0x9aa0a0, { roughness: 0.8 }), [0.18, 0.03, 0.06], [0, 0.72, 0]);
  add(g, UNIT_BOX, material(0xd8d2c4, { roughness: 1 }), [0.2, 0.07, 0.08], [0, 0.74, 0]);
  return { obj: g };
}

function buildCloth(): BuiltProp {
  const g = new THREE.Group();
  add(g, UNIT_BOX, material(COL.cloth, { roughness: 1, side: THREE.DoubleSide }), [0.12, 0.008, 0.1], [0, 0.01, 0.01], [0, 0.3, 0]);
  return { obj: g };
}

function buildWrench(): BuiltProp {
  const g = new THREE.Group();
  const metal = material(COL.darkMetal, { roughness: 0.4, metalness: 0.8 });
  add(g, UNIT_BOX, metal, [0.02, 0.13, 0.014], [0, 0.065, 0]);
  add(g, UNIT_BOX, metal, [0.05, 0.03, 0.016], [0, 0.14, 0]);
  add(g, UNIT_BOX, metal, [0.014, 0.032, 0.016], [-0.017, 0.158, 0]);
  add(g, UNIT_BOX, metal, [0.014, 0.032, 0.016], [0.017, 0.158, 0]);
  return { obj: g };
}

function buildRod(): BuiltProp {
  const g = new THREE.Group();
  add(g, UNIT_CYL, material(COL.wood, { roughness: 0.8 }), [0.016, 0.18, 0.016], [0, 0.09, 0]);
  add(g, UNIT_CYL, material(0x2f2a26, { roughness: 0.6 }), [0.008, 0.72, 0.008], [0, 0.5, 0.02], [0.12, 0, 0]);
  add(g, UNIT_CYL, material(COL.metal, { roughness: 0.4, metalness: 0.6 }), [0.034, 0.03, 0.034], [0.02, 0.16, 0], [0, 0, Math.PI / 2]);
  return { obj: g };
}

function buildSpatula(): BuiltProp {
  const g = new THREE.Group();
  add(g, UNIT_CYL6, material(COL.wood, { roughness: 0.85 }), [0.018, 0.17, 0.018], [0, 0.085, 0]);
  add(g, UNIT_BOX, material(COL.metal, { roughness: 0.4, metalness: 0.6 }), [0.075, 0.085, 0.008], [0, 0.21, 0]);
  return { obj: g };
}

function buildBrush(): BuiltProp {
  const g = new THREE.Group();
  add(g, UNIT_CYL6, material(COL.wood, { roughness: 0.85 }), [0.014, 0.15, 0.014], [0, 0.075, 0]);
  add(g, UNIT_CYL, material(COL.metal, { roughness: 0.4, metalness: 0.6 }), [0.018, 0.025, 0.018], [0, 0.16, 0]);
  add(g, UNIT_CONE, material(COL.bristle, { roughness: 0.95 }), [0.024, 0.035, 0.024], [0, 0.19, 0]);
  return { obj: g };
}

function buildProp(kind: PropKind, spec: PropSpec): BuiltProp {
  switch (kind) {
    case 'sandwich': case 'apple': case 'yoghurt': {
      const built = buildSnack(kind);
      if (spec.portion !== undefined) built.setPortion?.(spec.portion);
      return built;
    }
    case 'spoon': return buildSpoon();
    case 'ingredients': return buildIngredients();
    case 'plate': return buildPlate(spec.foodColor ?? 0xd9a441);
    case 'fork': return buildFork();
    case 'book': return buildBook();
    case 'phone': return buildPhone();
    case 'mug': return buildMug();
    case 'glass': return buildGlass();
    case 'can': return buildCan();
    case 'wateringCan': return buildWateringCan();
    case 'sponge': return buildSponge();
    case 'sprayBottle': return buildSpray();
    case 'mop': return buildMop();
    case 'cloth': return buildCloth();
    case 'wrench': return buildWrench();
    case 'rod': return buildRod();
    case 'spatula': return buildSpatula();
    case 'brush': return buildBrush();
  }
}

interface Grip {
  pos: [number, number, number];
  rot: [number, number, number];
  upright?: boolean;
}

/** Grip of each prop in the hand (metres at adult scale; hand-local unless `upright`, then body-frame angles). */
const GRIP: Record<PropKind, Grip> = {
  sandwich: { pos: [0, 0.05, 0.01], rot: [0, 0, 0] },
  apple: { pos: [0, 0.045, 0.015], rot: [0, 0, 0] },
  yoghurt: { pos: [0, 0.03, 0.01], rot: [0, 0, 0] },
  spoon: { pos: [0, 0.02, 0], rot: [0, 0, 0] },
  ingredients: { pos: [0, 0.045, 0.01], rot: [0, 0.25, 0], upright: true },
  plate: { pos: [0, 0.05, 0.015], rot: [0, 0, 0], upright: true },
  fork: { pos: [0, 0.022, 0], rot: [0, 0, 0] },
  book: { pos: [0, 0.045, 0], rot: [1.05, 0, -0.1], upright: true },
  phone: { pos: [0, 0.04, 0], rot: [0, -Math.PI / 2, 0], upright: true },
  mug: { pos: [0, 0.03, 0], rot: [0, 0.5, 0], upright: true },
  glass: { pos: [0, 0.03, 0], rot: [0, 0, 0], upright: true },
  can: { pos: [0, 0.03, 0], rot: [0, 0, 0], upright: true },
  wateringCan: { pos: [0, 0.02, 0.02], rot: [0, 0, 0], upright: true },
  sponge: { pos: [0, 0.03, 0], rot: [0, 0, 0] },
  sprayBottle: { pos: [0, 0.02, 0], rot: [0, 0, 0] },
  mop: { pos: [0, 0.01, 0], rot: [Math.PI, 0, 0] },
  cloth: { pos: [0, 0.02, 0], rot: [0, 0, 0] },
  wrench: { pos: [0, 0.02, 0], rot: [0, 0, 0] },
  rod: { pos: [0, 0.02, 0], rot: [0, 0, 0] },
  spatula: { pos: [0, 0.02, 0], rot: [0, 0, 0] },
  brush: { pos: [0, 0.02, 0], rot: [0, 0, 0] },
};

// ---------------------------------------------------------------------------------------------
// Render side
// ---------------------------------------------------------------------------------------------

export interface HandEnv {
  /** Prop and hand-offset scale: 1 for the shared adult rig, stage height / 1.8 for an own stage body. */
  scale: number;
  /** Root-local height of the table/counter in front of a seated person. */
  tableY: number;
  /** Root-local forward distance of that surface. */
  forward: number;
}

interface Slot {
  group: THREE.Group | null;
  built: BuiltProp | null;
  parent: THREE.Object3D | null;
  key: string;
  portion: number;
  rot: [number, number, number];
}

const _qParent = new THREE.Quaternion();
const _qBody = new THREE.Quaternion();
const _qLocal = new THREE.Quaternion();
const _qGrip = new THREE.Quaternion();
const _euler = new THREE.Euler();

function emptySlot(): Slot {
  return { group: null, built: null, parent: null, key: '', portion: -1, rot: [0, 0, 0] };
}

/** One person's hand props: two hand slots and one placed slot, reattached when the rig is rebuilt. */
export class HandProps {
  private readonly slots = new Map<'right' | 'left' | 'placed', Slot>([
    ['right', emptySlot()], ['left', emptySlot()], ['placed', emptySlot()],
  ]);
  private disposed = false;

  constructor(private readonly view: CharacterView) {}

  update(result: HandPropsResult, env: HandEnv): void {
    if (this.disposed) return;
    this.applyHand('right', 'hand_r', result.right, env);
    this.applyHand('left', 'hand_l', result.left, env);
    this.applyPlaced(result.placed, env);
  }

  /** Hides every prop (person not drawn: another level, off the lot, held baby). */
  hide(): void {
    for (const slot of this.slots.values()) if (slot.group) slot.group.visible = false;
  }

  /** Removes all props; shared geometry and materials are kept. */
  dispose(): void {
    this.disposed = true;
    for (const slot of this.slots.values()) this.clear(slot);
  }

  private clear(slot: Slot): void {
    slot.group?.removeFromParent();
    slot.group = null;
    slot.built = null;
    slot.parent = null;
    slot.key = '';
    slot.portion = -1;
  }

  private applyHand(which: 'right' | 'left', boneName: string, spec: PropSpec | undefined, env: HandEnv): void {
    const slot = this.slots.get(which)!;
    if (!spec) { if (slot.group) this.clear(slot); return; }
    const bone = this.view.bone(boneName);
    if (!bone) { if (slot.group) this.clear(slot); return; }
    const grip = GRIP[spec.kind];
    const upright = spec.upright ?? grip.upright ?? false;
    this.prepare(slot, spec, bone, env.scale, upright, grip.rot);
    slot.group!.visible = true;
    // keep level props level in the body's frame, not in the turning wrist
    if (upright) {
      bone.updateWorldMatrix(true, false);
      bone.getWorldQuaternion(_qParent);
      this.view.root.getWorldQuaternion(_qBody);
      _qLocal.copy(_qParent).invert().multiply(_qBody);
      _euler.set(grip.rot[0], grip.rot[1], grip.rot[2]);
      _qGrip.setFromEuler(_euler);
      _qLocal.multiply(_qGrip);
      slot.group!.quaternion.copy(_qLocal);
    } else if (slot.rot[0] !== grip.rot[0] || slot.rot[1] !== grip.rot[1] || slot.rot[2] !== grip.rot[2]) {
      slot.rot = grip.rot;
      slot.group!.rotation.set(grip.rot[0], grip.rot[1], grip.rot[2]);
    }
    slot.group!.position.set(grip.pos[0] * env.scale, grip.pos[1] * env.scale, grip.pos[2] * env.scale);
  }

  private applyPlaced(spec: PropSpec | undefined, env: HandEnv): void {
    const slot = this.slots.get('placed')!;
    if (!spec) { if (slot.group) this.clear(slot); return; }
    this.prepare(slot, spec, this.view.root, env.scale, true, [0, 0, 0]);
    slot.group!.visible = true;
    slot.group!.position.set(0, env.tableY, env.forward);
    slot.group!.rotation.set(0, 0, 0);
  }

  private prepare(slot: Slot, spec: PropSpec, parent: THREE.Object3D, scale: number, upright: boolean, rot: [number, number, number]): void {
    const key = `${spec.kind}|${spec.foodColor ?? ''}|${upright ? 1 : 0}`;
    const reparent = slot.parent !== parent;
    if (slot.group && (slot.key !== key || reparent)) this.clear(slot);
    if (!slot.group) {
      const built = buildProp(spec.kind, spec);
      const group = built.obj;
      group.name = `hand-prop-${spec.kind}`;
      group.scale.setScalar(scale);
      parent.add(group);
      slot.group = group;
      slot.built = built;
      slot.parent = parent;
      slot.key = key;
      slot.portion = spec.portion ?? 1;
      slot.rot = rot;
      if (!upright) group.rotation.set(rot[0], rot[1], rot[2]);
      built.setPortion?.(spec.portion ?? 1);
    } else if (!reparent) {
      const portion = spec.portion ?? 1;
      if (Math.abs(portion - slot.portion) > 0.004) { slot.built?.setPortion?.(portion); slot.portion = portion; }
    }
  }
}
