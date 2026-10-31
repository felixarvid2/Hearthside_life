// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md.
//
// Buy-mode object catalog. Every entry maps a Kenney Furniture Kit model (public/assets/manifest.json
// "furniture" key) onto the tile grid:
//
// - Local object space at rot 0: origin at the footprint's min corner, +x along the width (w tiles), +z along
//   the depth (d tiles), the object's FRONT faces +z (beds: headboard at -z, foot toward +z; seats face +z;
//   appliances, TVs and shelves open toward +z). See src/core/geometry.ts.
// - Model transform inside that local space (three.js order, T * R * S):
//     model.scale.setScalar(scale); model.rotation.y = yaw; model.position.set(...offset)
//   `fit()` derives scale/offset from the measured manifest bounds (MODEL_BOUNDS below) so the scaled model
//   is centred in its footprint in x, rests with its bottom on y = 0 (wall items: at their mounting height)
//   and is centred in z - except wall-hugging pieces (fridges, shelves, wardrobes, sinks, stands), whose back
//   sits WALL_GAP from the rear edge so they touch the wall face (walls are 0.12 m thick, centred on edges).
// - Slots are in rot-0 local metres. Sit/sleep anchors sit at the seat/mattress centre with the height of the
//   seat/mattress top after scaling. Approach tiles lie outside the blocking footprint: in front of armchairs,
//   sofas and toilets; BEHIND dining chairs, desk chairs and bar stools (they are pushed under a table, desk or
//   counter whose tile is in front of them); beside beds (left half from -x, right half from +x); standing
//   use-slots one tile in front of the object.
// - Finish regions recolour named source materials. When a region lists several materials the first one takes
//   the swatch colour and the others keep their original shade relative to it (e.g. wood + woodDark).
//   Swatch colours are sRGB hex; Kenney baseColorFactor values are authored as sRGB (that is how the catalog
//   thumbnails look), so swatches[0] of every region reproduces the original model colour.

import type { FinishRegion, ObjectDef, ObjectSlot, ObjectStats, Swatch } from './types';
import { dollars } from '../core/money';

type Vec3 = [number, number, number];

/** Wall faces sit 0.06 m inside a tile (half the 0.12 m wall thickness). */
export const WALL_GAP = 0.06;

/** Measured bounds (manifest min/max, before scaling) of every model this catalog uses. A unit test checks
 *  these against public/assets/manifest.json. */
export const MODEL_BOUNDS: Record<string, [min: Vec3, max: Vec3]> = {
  bedDouble: [[0, 0, -1.125], [0.956, 0.375, 0]],
  bedSingle: [[0.385, 0, -1.125], [0.956, 0.375, 0]],
  bedBunk: [[0, 0, -1.095], [0.571, 0.85, 0]],
  kitchenFridge: [[0, 0, -0.2819], [0.43, 0.92, 0.01]],
  kitchenFridgeLarge: [[0, 0, -0.3419], [0.52, 0.92, 0.0636]],
  kitchenStove: [[0, 0, -0.45], [0.43, 0.45, 0]],
  kitchenCabinet: [[0, 0, -0.45], [0.43, 0.45, 0]],
  kitchenCabinetDrawer: [[0, 0, -0.45], [0.43, 0.45, 0]],
  kitchenSink: [[0, 0, -0.45], [0.43, 0.49, 0]],
  table: [[0, 0, -0.4474], [0.8415, 0.3267, 0]],
  tableRound: [[0, -0.27, -0.8], [0.6928, 0.0967, 0]],
  chair: [[0, 0, -0.2], [0.2, 0.47, 0]],
  chairDesk: [[0, 0, -0.3143], [0.335, 0.6076, 0]],
  stoolBar: [[0, 0, -0.2299], [0.2654, 0.435, 0]],
  loungeSofa: [[0, 0, -0.41], [0.98, 0.46, 0]],
  loungeDesignSofa: [[0, 0, -0.41], [1.12, 0.4, 0]],
  loungeChair: [[0, 0, -0.41], [0.49, 0.46, 0]],
  tableCoffeeSquare: [[-0.461, 0, -0.3], [-0.061, 0.23, 0.1]],
  tableCoffeeGlass: [[-0.461, 0, -0.3], [0.2, 0.23, 0.1]],
  sideTable: [[-0.01, 0, -0.21], [0.5245, 0.3844, 0.01]],
  cabinetTelevision: [[0, 0, -0.25], [0.8, 0.31, 0]],
  televisionModern: [[-0.3424, 0, -0.0642], [0.3424, 0.4548, 0.0642]],
  televisionVintage: [[0, 0, -0.27], [0.41, 0.27, 0]],
  toilet: [[0, 0, 0], [0.3126, 0.451, 0.4772]],
  shower: [[-0.5618, 0, -0.5618], [0, 1.094, 0.02]],
  bathtub: [[0, 0, -0.56], [1.19, 0.42, 0]],
  bathroomSink: [[0, -0.4, -0.29], [0.34, 0.16, 0]],
  bathroomMirror: [[0, 0, -0.0488], [0.3013, 0.4346, 0.0956]],
  bookcaseOpen: [[0, 0, -0.25], [0.4, 0.88, 0]],
  bookcaseClosedWide: [[0, 0, -0.25], [0.8, 0.79, 0]],
  bookcaseClosedDoors: [[0, 0, -0.25], [0.4, 0.85, 0]],
  desk: [[-0.01, 0, -0.38], [0.7245, 0.3844, 0.0123]],
  computerScreen: [[0, 0, -0.104], [0.3927, 0.2943, 0]],
  cabinetBedDrawerTable: [[-0.01, 0, -0.205], [0.256, 0.2632, 0.0123]],
  lampRoundFloor: [[-0.016, 0, -0.1478], [0.136, 0.86, 0.0278]],
  lampSquareFloor: [[0, 0, -0.12], [0.12, 0.86, 0]],
  pottedPlant: [[-0.106, 0, -0.1207], [0.106, 0.654, 0.1207]],
  plantSmall1: [[-0.0473, 0, -0.0473], [0.0473, 0.14, 0.0473]],
  rugRectangle: [[0, 0, -0.92], [1.57, 0.01, 0]],
  rugRound: [[0, 0, -0.92], [0.92, 0.01, 0]],
  radio: [[0, 0, -0.0975], [0.315, 0.2282, 0]],
  speaker: [[0, 0, -0.148], [0.148, 0.6364, 0]],
  trashcan: [[-0.1038, 0, -0.1116], [0.1038, 0.4279, 0.1225]],
  coatRackStanding: [[-0.1364, 0, -0.1364], [0.1364, 0.77, 0.1364]],
};

/** Axis-aligned bounds in rot-0 local space. */
export interface LocalBox { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Bounds of a model after the def's scale, yaw and offset (rot-0 local space). Pure math on MODEL_BOUNDS. */
export function fittedBounds(model: ObjectDef['model'], bounds = MODEL_BOUNDS[model.asset]): LocalBox | null {
  if (!bounds) return null;
  const [mn, mx] = bounds;
  const c = Math.cos(model.yaw), s = Math.sin(model.yaw);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const x of [mn[0], mx[0]]) for (const z of [mn[2], mx[2]]) {
    // three.js rotation about +y: x' = x cos + z sin, z' = -x sin + z cos
    const rx = (x * c + z * s) * model.scale, rz = (-x * s + z * c) * model.scale;
    x0 = Math.min(x0, rx); x1 = Math.max(x1, rx); z0 = Math.min(z0, rz); z1 = Math.max(z1, rz);
  }
  const [ox, oy, oz] = model.offset;
  return { x0: x0 + ox, x1: x1 + ox, y0: mn[1] * model.scale + oy, y1: mx[1] * model.scale + oy, z0: z0 + oz, z1: z1 + oz };
}

interface Fit {
  model: ObjectDef['model'];
  box: LocalBox;
  /** Height of the fitted model's top above the floor. */
  height: number;
  /** Local point at fractions of the fitted box (fx along +x, fz from back 0 to front 1). */
  at(fx: number, fz: number): [number, number];
}

/**
 * Fits a manifest model into a footprint. `yaw` is in quarter turns; `back` puts the model's back face at that
 * local z (wall-hugging objects) instead of centring it; `lift` raises the bottom (wall-mounted items).
 */
function fit(asset: string, fp: { w: number; d: number }, scale: number, o: { yaw?: 0 | 1 | 2 | 3; back?: number; lift?: number } = {}): Fit {
  const b = MODEL_BOUNDS[asset];
  if (!b) throw new Error(`objects: no MODEL_BOUNDS for ${asset}`);
  const yaw = ((o.yaw ?? 0) * Math.PI) / 2;
  const raw = fittedBounds({ asset, scale, yaw, offset: [0, 0, 0] }, b)!;
  const ox = fp.w / 2 - (raw.x0 + raw.x1) / 2;
  const depth = raw.z1 - raw.z0;
  const oz = (o.back !== undefined ? o.back + depth / 2 : fp.d / 2) - (raw.z0 + raw.z1) / 2;
  const oy = (o.lift ?? 0) - raw.y0;
  const model = { asset, scale: r4(scale), yaw: r4(yaw), offset: [r4(ox), r4(oy), r4(oz)] as Vec3 };
  const box = fittedBounds(model, b)!;
  return {
    model, box, height: r3(box.y1),
    at: (fx, fz) => [r3(box.x0 + fx * (box.x1 - box.x0)), r3(box.z0 + fz * (box.z1 - box.z0))],
  };
}

// ---------------------------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------------------------

const sit = (id: string, pos: [number, number], height: number, approach: [number, number], facing = 0): ObjectSlot =>
  ({ id, kind: 'sit', pos, height: r3(height), facing, approach, posture: 'seated' });

const sleep = (id: string, pos: [number, number], height: number, approach: [number, number]): ObjectSlot =>
  ({ id, kind: 'sleep', pos, height: r3(height), facing: 0, approach, posture: 'lying' });

/** Standing use-slot in front of an object: the person faces the object (-z) from just in front of it. */
function useFront(id: string, x: number, f: Fit | null, d: number): ObjectSlot {
  const front = f ? f.box.z1 : d;
  return {
    id, kind: 'use', pos: [r3(x), r3(Math.min(front + 0.4, d + 0.25))], height: 0, facing: Math.PI,
    approach: [Math.floor(x), d], posture: 'standing',
  };
}

// ---------------------------------------------------------------------------------------------
// Finishes (sRGB swatches; swatches[0] reproduces the original model colour)
// ---------------------------------------------------------------------------------------------

const sw = (id: string, name: string, color: string): Swatch => ({ id, name, color });

const WOOD: Swatch[] = [
  sw('honey-oak', 'Honey Oak', '#e59a64'), sw('natural-ash', 'Natural Ash', '#e8cba2'),
  sw('walnut', 'Walnut', '#8a5a3c'), sw('cherry', 'Cherry', '#a8553a'), sw('ebony', 'Ebony', '#3d302b'),
  sw('whitewash', 'Whitewash', '#ece6dc'), sw('sage-paint', 'Sage Paint', '#9db59a'), sw('navy-paint', 'Navy Paint', '#34496b'),
];
const FABRIC: Swatch[] = [
  sw('coral', 'Coral', '#f05e57'), sw('oat-tweed', 'Oat Tweed', '#cdbb9c'), sw('sage', 'Sage', '#8fa98b'),
  sw('navy', 'Navy', '#3f5a86'), sw('charcoal', 'Charcoal', '#4b4b50'), sw('mustard', 'Mustard', '#d4a33b'),
  sw('blush', 'Blush', '#e6a9a0'), sw('teal', 'Teal', '#2f8f83'),
];
const FABRIC_BLUE: Swatch[] = [sw('cornflower', 'Cornflower', '#5b84dd'), ...FABRIC];
const METAL: Swatch[] = [
  sw('steel', 'Brushed Steel', '#bdd2d6'), sw('matte-black', 'Matte Black', '#2e3034'), sw('brass', 'Brass', '#c6a45a'),
  sw('copper', 'Copper', '#b87350'), sw('white-enamel', 'White Enamel', '#f0eeea'), sw('graphite', 'Graphite', '#5c6168'),
];
const METAL_MEDIUM: Swatch[] = [sw('slate', 'Slate Grey', '#5e7777'), ...METAL.slice(1), sw('steel', 'Brushed Steel', '#bdd2d6')];
const APPLIANCE: Swatch[] = [
  sw('white', 'Gloss White', '#effaf4'), sw('stainless', 'Stainless', '#c9d0d4'), sw('black', 'Black', '#2c2e31'),
  sw('mint', 'Retro Mint', '#a8d5c2'), sw('tomato', 'Tomato Red', '#c9433c'), sw('butter', 'Butter Yellow', '#ecd57a'),
];
const COUNTERTOP: Swatch[] = [
  sw('pale-laminate', 'Pale Laminate', '#bdd2d6'), sw('marble', 'White Marble', '#ece9e4'), sw('granite', 'Dark Granite', '#3a3a3d'),
  sw('butcher-block', 'Butcher Block', '#c98b55'), sw('concrete', 'Concrete', '#a7a39b'), sw('terrazzo', 'Terrazzo Pink', '#e2c2b6'),
];

const region = (id: string, label: string, materials: string[], swatches: Swatch[]): FinishRegion => ({ id, label, materials, swatches });
const woodR = (materials = ['wood']) => region('wood', 'Wood', materials, WOOD);
const fabricR = (materials = ['carpet'], label = 'Upholstery') => region('fabric', label, materials, materials[0] === 'carpetBlue' ? FABRIC_BLUE : FABRIC);
const metalR = (materials = ['metal']) => region('metal', 'Metal', materials, materials[0] === 'metalMedium' ? METAL_MEDIUM : METAL);
const applianceR = (materials = ['metalLight']) => region('body', 'Appliance Finish', materials, APPLIANCE);
const counterR = () => region('countertop', 'Countertop', ['metal'], COUNTERTOP);

// ---------------------------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------------------------

type Base = Omit<ObjectDef, 'model' | 'height' | 'status' | 'packs' | 'stats' | 'finishes' | 'slots' | 'interactions'> &
  Partial<Pick<ObjectDef, 'status' | 'packs' | 'stats' | 'finishes' | 'slots' | 'interactions'>>;

function obj(f: Fit, d: Base): ObjectDef {
  const stats: ObjectStats = {};
  return { packs: ['everyday-essentials'], slots: [], interactions: [], stats, finishes: [], status: 'ready', ...d, model: f.model, height: f.height };
}

const FP11 = { w: 1, d: 1 }, FP21 = { w: 2, d: 1 }, FP12 = { w: 1, d: 2 }, FP22 = { w: 2, d: 2 };

// --- Beds ------------------------------------------------------------------------------------
const bedDouble = fit('bedDouble', FP22, 1.75);
const bedSingle = fit('bedSingle', FP12, 1.75);
const bedBunk = fit('bedBunk', FP12, 1.75);
const BEDS: ObjectDef[] = [
  obj(bedDouble, {
    id: 'bed-double-oak', name: 'Hearthwood Double Bed', category: 'beds', subcategory: 'double', rooms: ['bedroom'], style: 'classic',
    description: 'A sturdy oak double bed with a low headboard and a quilted coverlet. Sleeps two, one on each side.',
    tags: ['bed', 'double', 'sleep'], tier: 'standard', price: dollars(950), quality: 3, functional: true,
    footprint: FP22, layer: 'floor', blocksMovement: true,
    slots: [
      sleep('left', bedDouble.at(0.27, 0.56), 0.25 * 1.75, [-1, 1]),
      sleep('right', bedDouble.at(0.73, 0.56), 0.25 * 1.75, [2, 1]),
    ],
    interactions: ['sleep', 'nap'], stats: { energy: 1, comfort: 6, environment: 2 },
    finishes: [woodR(), fabricR(['carpet'], 'Bedding')],
  }),
  obj(bedSingle, {
    id: 'bed-single-pine', name: 'Pinecrest Single Bed', category: 'beds', subcategory: 'single', rooms: ['bedroom', 'kids'], style: 'cottage',
    description: 'A simple pine single bed. Cheap and cheerful, but its thin mattress restores energy a little more slowly.',
    tags: ['bed', 'single', 'sleep'], packs: ['everyday-essentials', 'cozy-cottage'], tier: 'budget', price: dollars(320), quality: 2,
    functional: true, footprint: FP12, layer: 'floor', blocksMovement: true,
    slots: [sleep('sleep', bedSingle.at(0.5, 0.56), 0.25 * 1.75, [1, 1])],
    interactions: ['sleep', 'nap'], stats: { energy: 0.85, comfort: 4, environment: 1 },
    finishes: [woodR(), fabricR(['carpet'], 'Bedding')],
  }),
  obj(bedBunk, {
    id: 'bed-bunk-pine', name: 'Two-Story Bunk Bed', category: 'beds', subcategory: 'bunk', rooms: ['bedroom', 'kids'], style: 'cottage',
    description: 'Two pine single beds stacked on one footprint - a space saver for shared rooms. Both bunks are entered from the right.',
    tags: ['bed', 'bunk', 'sleep'], packs: ['everyday-essentials', 'kids-storybook'], tier: 'budget', price: dollars(540), quality: 2,
    functional: true, footprint: FP12, layer: 'floor', blocksMovement: true,
    slots: [
      sleep('lower', bedBunk.at(0.5, 0.55), 0.23 * 1.75, [1, 1]),
      sleep('upper', bedBunk.at(0.5, 0.55), 0.77 * 1.75, [1, 1]),
    ],
    interactions: ['sleep', 'nap'], stats: { energy: 0.85, comfort: 4, environment: 1 },
    finishes: [woodR(), fabricR(['carpet'], 'Bedding')],
  }),
];

// --- Bedroom storage -------------------------------------------------------------------------
const nightstand = fit('cabinetBedDrawerTable', FP11, 2);
const wardrobe = fit('bookcaseClosedDoors', FP11, 2, { back: WALL_GAP });
const BEDROOM: ObjectDef[] = [
  obj(nightstand, {
    id: 'nightstand-oak', name: 'Oak Nightstand', category: 'beds', subcategory: 'nightstand', rooms: ['bedroom'], style: 'classic',
    description: 'A bedside table with a drawer and an open shelf. Lamps, radios and plants fit on top.',
    tags: ['nightstand', 'surface', 'storage'], tier: 'budget', price: dollars(110), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(nightstand.box.y1), finishes: [woodR()],
  }),
  obj(wardrobe, {
    id: 'wardrobe-tall', name: 'Tall Wardrobe', category: 'storage', subcategory: 'wardrobe', rooms: ['bedroom'], style: 'classic',
    description: 'A tall two-door wardrobe. Change into another outfit or plan new ones here.',
    tags: ['wardrobe', 'storage', 'clothes'], tier: 'standard', price: dollars(480), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, wardrobe, 1)],
    interactions: ['changeOutfit', 'editOutfits'], finishes: [woodR(), metalR(['metal'])],
  }),
];

// --- Kitchen ---------------------------------------------------------------------------------
// Kitchen modules share one scale so counters, sink, stove and fridge line up (worktop at 0.9 m).
const KITCHEN_SCALE = 2.14;
const fridge = fit('kitchenFridge', FP11, KITCHEN_SCALE, { back: WALL_GAP });
const fridgeLarge = fit('kitchenFridgeLarge', FP11, 1.9, { back: WALL_GAP });
const stove = fit('kitchenStove', FP11, KITCHEN_SCALE, { back: 0.02 });
const counter = fit('kitchenCabinet', FP11, KITCHEN_SCALE, { back: 0.02 });
const counterDrawers = fit('kitchenCabinetDrawer', FP11, KITCHEN_SCALE, { back: 0.02 });
const sink = fit('kitchenSink', FP11, KITCHEN_SCALE, { back: 0.02 });
const WORKTOP = 0.42 * KITCHEN_SCALE; // 0.9 m
const KITCHEN: ObjectDef[] = [
  obj(fridge, {
    id: 'fridge-standard', name: 'Everyday Fridge', category: 'kitchen', subcategory: 'fridge', rooms: ['kitchen'], style: 'modern',
    description: 'A reliable fridge-freezer. Grab a quick snack or gather ingredients to cook a meal.',
    tags: ['fridge', 'appliance', 'food'], tier: 'standard', price: dollars(780), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, fridge, 1)],
    interactions: ['grabSnack', 'cookMeal'], stats: { cooking: 0 }, finishes: [applianceR()],
  }),
  obj(fridgeLarge, {
    id: 'fridge-side-by-side', name: 'Side-by-Side Fridge', category: 'kitchen', subcategory: 'fridge', rooms: ['kitchen'], style: 'modern',
    description: 'A roomy two-door fridge that keeps produce crisp. Meals cooked from it turn out a little better.',
    tags: ['fridge', 'appliance', 'food'], packs: ['everyday-essentials', 'modern-minimal'], tier: 'premium', price: dollars(1850), quality: 4,
    functional: true, footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, fridgeLarge, 1)],
    interactions: ['grabSnack', 'cookMeal'], stats: { cooking: 1, environment: 1 }, finishes: [applianceR()],
  }),
  obj(stove, {
    id: 'stove-basic', name: 'Basic Gas Range', category: 'kitchen', subcategory: 'stove', rooms: ['kitchen'], style: 'classic',
    description: 'Four burners and an oven. Cooks use it when they make a meal from the fridge.',
    tags: ['stove', 'appliance', 'cooking'], tier: 'budget', price: dollars(420), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, stove, 1)],
    interactions: [], stats: { cooking: 0 }, finishes: [woodR(['wood'])],
  }),
  obj(counter, {
    id: 'counter-basic', name: 'Base Cabinet Counter', category: 'kitchen', subcategory: 'counter', rooms: ['kitchen'], style: 'classic',
    description: 'A base cabinet with a worktop. Cooked meals are served on free counters.',
    tags: ['counter', 'surface', 'storage'], tier: 'budget', price: dollars(260), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(WORKTOP),
    finishes: [woodR(['wood', 'woodDark']), counterR()],
  }),
  obj(counterDrawers, {
    id: 'counter-drawers', name: 'Drawer Unit Counter', category: 'kitchen', subcategory: 'counter', rooms: ['kitchen'], style: 'classic',
    description: 'A counter module with three deep drawers for pans and cutlery. Same worktop height as the other modules.',
    tags: ['counter', 'surface', 'storage'], tier: 'standard', price: dollars(340), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(WORKTOP),
    finishes: [woodR(['wood', 'woodDark']), counterR()],
  }),
  obj(sink, {
    id: 'counter-sink', name: 'Kitchen Sink Counter', category: 'kitchen', subcategory: 'sink', rooms: ['kitchen'], style: 'classic',
    description: 'A counter module with a steel basin and a swan-neck tap. Wash your hands before cooking.',
    tags: ['sink', 'counter', 'surface'], tier: 'standard', price: dollars(480), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(WORKTOP), slots: [useFront('use', 0.5, sink, 1)],
    interactions: ['washHands'], stats: { hygiene: 1 }, finishes: [woodR(['wood', 'woodDark'])],
  }),
];

// --- Tables and seating ----------------------------------------------------------------------
const diningTable = fit('table', FP21, 0.66 / 0.3267);
const roundTable = fit('tableRound', FP22, 2);
const diningChair = fit('chair', FP11, 2);
const deskChair = fit('chairDesk', FP11, 2);
const barStool = fit('stoolBar', FP11, 2);
const sofa = fit('loungeSofa', FP21, 2);
const sofaModern = fit('loungeDesignSofa', FP21, 1.75);
const armchair = fit('loungeChair', FP11, 2);
const coffeeTable = fit('tableCoffeeSquare', FP11, 2);
const coffeeGlass = fit('tableCoffeeGlass', FP21, 2);
const sideTable = fit('sideTable', FP11, 1.8, { back: WALL_GAP });
const desk = fit('desk', FP21, 0.76 / 0.3844);
const SEATING_AND_TABLES: ObjectDef[] = [
  obj(diningTable, {
    id: 'table-dining-oak', name: 'Oak Dining Table', category: 'tables', subcategory: 'dining', rooms: ['dining', 'kitchen'], style: 'classic',
    description: 'A four-seat oak table. Meals can be served here, and diners sit at chairs pushed up to it.',
    tags: ['table', 'dining', 'surface'], tier: 'standard', price: dollars(420), quality: 3, functional: true,
    footprint: FP21, layer: 'floor', blocksMovement: true, surfaceHeight: 0.66, stats: { environment: 1 }, finishes: [woodR()],
  }),
  obj(roundTable, {
    id: 'table-dining-round', name: 'Hexagon Pedestal Table', category: 'tables', subcategory: 'dining', rooms: ['dining', 'kitchen'], style: 'mid-century',
    description: 'A six-sided pedestal table with room for chairs on every side. Meals can be served here.',
    tags: ['table', 'dining', 'surface'], packs: ['everyday-essentials', 'mid-century'], tier: 'premium', price: dollars(780), quality: 4,
    functional: true, footprint: FP22, layer: 'floor', blocksMovement: true, surfaceHeight: r3(roundTable.box.y1),
    stats: { environment: 2 }, finishes: [woodR()],
  }),
  obj(diningChair, {
    id: 'chair-dining-oak', name: 'Oak Dining Chair', category: 'seating', subcategory: 'chair', rooms: ['dining', 'kitchen'], style: 'classic',
    description: 'A ladder-back dining chair. Push it up to a table; diners slip in from behind.',
    tags: ['chair', 'seat', 'dining'], tier: 'budget', price: dollars(95), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', diningChair.at(0.5, 0.6), 0.24 * 2, [0, -1])],
    interactions: ['sit'], stats: { comfort: 3 }, finishes: [woodR()],
  }),
  obj(deskChair, {
    id: 'chair-desk', name: 'Swivel Desk Chair', category: 'seating', subcategory: 'office', rooms: ['study', 'bedroom'], style: 'modern',
    description: 'A padded swivel chair with armrests for long sessions at the desk.',
    tags: ['chair', 'seat', 'desk'], tier: 'standard', price: dollars(210), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', deskChair.at(0.5, 0.55), 0.233 * 2, [0, -1])],
    interactions: ['sit'], stats: { comfort: 5 }, finishes: [fabricR(['carpet']), metalR(['metalMedium'])],
  }),
  obj(barStool, {
    id: 'stool-bar', name: 'Cushioned Bar Stool', category: 'seating', subcategory: 'stool', rooms: ['kitchen', 'dining'], style: 'modern',
    description: 'A tall stool with a round cushion, made to tuck under a kitchen counter.',
    tags: ['stool', 'seat'], tier: 'budget', price: dollars(75), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', barStool.at(0.5, 0.5), 0.435 * 2, [0, -1])],
    interactions: ['sit'], stats: { comfort: 2 }, finishes: [woodR(), fabricR(['carpet'], 'Cushion')],
  }),
  obj(sofa, {
    id: 'sofa-tweed', name: 'Tweed Two-Seat Sofa', category: 'seating', subcategory: 'sofa', rooms: ['living'], style: 'classic',
    description: 'A deep two-seat sofa in soft tweed. Two people can sit, or one can stretch out for a nap.',
    tags: ['sofa', 'seat'], tier: 'standard', price: dollars(890), quality: 3, functional: true,
    footprint: FP21, layer: 'floor', blocksMovement: true,
    slots: [sit('left', sofa.at(0.28, 0.6), 0.23 * 2, [0, 1]), sit('right', sofa.at(0.72, 0.6), 0.23 * 2, [1, 1])],
    interactions: ['sit', 'nap'], stats: { comfort: 6, energy: 0.7 }, finishes: [fabricR(['carpet']), woodR()],
  }),
  obj(sofaModern, {
    id: 'sofa-modern', name: 'Low-Line Modern Sofa', category: 'seating', subcategory: 'sofa', rooms: ['living'], style: 'modern',
    description: 'A low, wide sofa on slim steel legs with plush seat cushions - the most comfortable seat in the catalog.',
    tags: ['sofa', 'seat'], packs: ['modern-minimal'], tier: 'premium', price: dollars(1650), quality: 4, functional: true,
    footprint: FP21, layer: 'floor', blocksMovement: true,
    slots: [sit('left', sofaModern.at(0.28, 0.6), 0.23 * 1.75, [0, 1]), sit('right', sofaModern.at(0.72, 0.6), 0.23 * 1.75, [1, 1])],
    interactions: ['sit', 'nap'], stats: { comfort: 8, energy: 0.85, environment: 2 }, finishes: [fabricR(['carpetBlue']), metalR()],
  }),
  obj(armchair, {
    id: 'armchair-lounge', name: 'Lounge Armchair', category: 'seating', subcategory: 'armchair', rooms: ['living', 'bedroom'], style: 'classic',
    description: 'A boxy, cushioned armchair that matches the tweed sofa.',
    tags: ['armchair', 'seat'], tier: 'standard', price: dollars(520), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', armchair.at(0.5, 0.6), 0.23 * 2, [0, 1])],
    interactions: ['sit'], stats: { comfort: 6 }, finishes: [fabricR(['carpet']), woodR()],
  }),
  obj(coffeeTable, {
    id: 'table-coffee', name: 'Square Coffee Table', category: 'tables', subcategory: 'coffee', rooms: ['living'], style: 'classic',
    description: 'A low square table with a lower shelf for magazines.',
    tags: ['table', 'coffee', 'surface'], tier: 'budget', price: dollars(140), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(coffeeTable.box.y1), finishes: [woodR()],
  }),
  obj(coffeeGlass, {
    id: 'table-coffee-glass', name: 'Glass Coffee Table', category: 'tables', subcategory: 'coffee', rooms: ['living'], style: 'modern',
    description: 'A long steel-framed coffee table with a glass top and a glass undershelf.',
    tags: ['table', 'coffee', 'surface'], packs: ['modern-minimal'], tier: 'premium', price: dollars(460), quality: 4, functional: true,
    footprint: FP21, layer: 'floor', blocksMovement: true, surfaceHeight: r3(coffeeGlass.box.y1), stats: { environment: 2 },
    finishes: [metalR()],
  }),
  obj(sideTable, {
    id: 'side-table', name: 'Slim Console Table', category: 'tables', subcategory: 'side', rooms: ['living', 'bedroom', 'study'], style: 'classic',
    description: 'A narrow console for hallways and behind sofas. A good stand for lamps and plants.',
    tags: ['table', 'side', 'surface'], tier: 'budget', price: dollars(120), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(sideTable.box.y1), finishes: [woodR()],
  }),
  obj(desk, {
    id: 'desk-oak', name: 'Oak Writing Desk', category: 'tables', subcategory: 'desk', rooms: ['study', 'bedroom'], style: 'classic',
    description: 'A two-tile desk with a drawer. Put a computer on it and a desk chair in front.',
    tags: ['desk', 'surface'], tier: 'standard', price: dollars(380), quality: 3, functional: true,
    footprint: FP21, layer: 'floor', blocksMovement: true, surfaceHeight: 0.76, finishes: [woodR(), metalR()],
  }),
];

// --- Living room electronics -----------------------------------------------------------------
const tvStand = fit('cabinetTelevision', FP21, 0.6 / 0.31, { back: WALL_GAP });
const tvFlat = fit('televisionModern', FP11, 1.4);
const tvVintage = fit('televisionVintage', FP11, 2);
const computer = fit('computerScreen', FP11, 2);
const radio = fit('radio', FP11, 2);
const speaker = fit('speaker', FP11, 2);
const ELECTRONICS: ObjectDef[] = [
  obj(tvStand, {
    id: 'tv-stand-low', name: 'Low Media Console', category: 'storage', subcategory: 'media', rooms: ['living', 'bedroom'], style: 'classic',
    description: 'A long, low console with open shelves - the right height for a television.',
    tags: ['tv-stand', 'surface', 'storage'], tier: 'standard', price: dollars(260), quality: 3, functional: true,
    footprint: FP21, layer: 'floor', blocksMovement: true, surfaceHeight: 0.6, finishes: [woodR()],
  }),
  obj(tvFlat, {
    id: 'tv-flatscreen', name: 'Flatscreen TV', category: 'electronics', subcategory: 'tv', rooms: ['living', 'bedroom'], style: 'modern',
    description: 'A slim widescreen television on a pedestal foot. Place it on a stand; viewers use a seat facing it within 5 m.',
    tags: ['tv', 'electronics'], tier: 'standard', price: dollars(650), quality: 3, functional: true,
    footprint: FP11, layer: 'surface', blocksMovement: false, slots: [useFront('view', 0.5, null, 1)],
    interactions: ['watchTv'], stats: { fun: 1 }, finishes: [metalR(['metalDark'])],
  }),
  obj(tvVintage, {
    id: 'tv-vintage', name: 'Wood-Cabinet TV', category: 'electronics', subcategory: 'tv', rooms: ['living', 'bedroom'], style: 'retro',
    description: 'A chunky tube television in a wooden cabinet. Charming, but the small screen is less entertaining.',
    tags: ['tv', 'electronics'], packs: ['mid-century'], tier: 'budget', price: dollars(180), quality: 2, functional: true,
    footprint: FP11, layer: 'surface', blocksMovement: false, slots: [useFront('view', 0.5, null, 1)],
    interactions: ['watchTv'], stats: { fun: 0.8 }, finishes: [woodR()],
  }),
  obj(computer, {
    id: 'computer-desktop', name: 'Desktop Computer', category: 'electronics', subcategory: 'computer', rooms: ['study', 'bedroom'], style: 'modern',
    description: 'A widescreen desktop computer for games and programming practice. Sits on a desk; users take the chair in front.',
    tags: ['computer', 'electronics'], tier: 'standard', price: dollars(900), quality: 3, functional: true,
    footprint: FP11, layer: 'surface', blocksMovement: false, slots: [useFront('use', 0.5, null, 1)],
    interactions: ['playComputerGames', 'practiceProgramming'], stats: { fun: 1, skill: 1 }, finishes: [],
  }),
  obj(radio, {
    id: 'radio-retro', name: 'Retro Radio', category: 'electronics', subcategory: 'audio', rooms: ['living', 'kitchen', 'bedroom'], style: 'retro',
    description: 'A wooden tabletop radio with a speaker grille and two dials. Stand nearby and listen.',
    tags: ['radio', 'music', 'electronics'], packs: ['everyday-essentials', 'mid-century'], tier: 'budget', price: dollars(90), quality: 2,
    functional: true, footprint: FP11, layer: 'surface', blocksMovement: false,
    interactions: ['listenToMusic'], stats: { fun: 0.9 }, finishes: [woodR()],
  }),
  obj(speaker, {
    id: 'speaker-tower', name: 'Tower Speaker', category: 'electronics', subcategory: 'audio', rooms: ['living', 'study'], style: 'modern',
    description: 'A floor-standing hi-fi speaker. Music sounds richer: more fun and a sharper musical ear than a radio.',
    tags: ['speaker', 'music', 'electronics'], packs: ['everyday-essentials', 'creative-studio'], tier: 'premium', price: dollars(680), quality: 4,
    functional: true, footprint: FP11, layer: 'floor', blocksMovement: true,
    interactions: ['listenToMusic'], stats: { fun: 1.3, skill: 1.2 }, finishes: [woodR()],
  }),
];

// --- Bathroom --------------------------------------------------------------------------------
const toilet = fit('toilet', FP11, 2);
const shower = fit('shower', FP11, 1.7);
const bathtub = fit('bathtub', FP21, 1.65, { back: WALL_GAP });
const bathSink = fit('bathroomSink', FP11, 1.7, { back: WALL_GAP });
const mirror = fit('bathroomMirror', FP11, 2, { back: WALL_GAP, lift: 1.05 });
const BATHROOM: ObjectDef[] = [
  obj(toilet, {
    id: 'toilet-basic', name: 'Basic Toilet', category: 'bathroom', subcategory: 'toilet', rooms: ['bathroom'], style: 'classic',
    description: 'A standard close-coupled toilet.',
    tags: ['toilet', 'fixture'], tier: 'budget', price: dollars(260), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', toilet.at(0.5, 0.62), 0.248 * 2, [0, 1])],
    interactions: ['useToilet'], stats: { comfort: 2 }, finishes: [],
  }),
  obj(shower, {
    id: 'shower-stall', name: 'Glass Shower Stall', category: 'bathroom', subcategory: 'shower', rooms: ['bathroom'], style: 'modern',
    description: 'A compact corner shower with a glass door. Showers until fully clean (at most 30 minutes).',
    tags: ['shower', 'fixture'], tier: 'standard', price: dollars(750), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true,
    slots: [{ id: 'inside', kind: 'use', pos: shower.at(0.5, 0.5), height: r3(0.079 * 1.7), facing: Math.PI, approach: [0, 1], posture: 'standing' }],
    interactions: ['takeShower'], stats: { hygiene: 1 }, finishes: [],
  }),
  obj(bathtub, {
    id: 'bathtub', name: 'Deep Soaking Tub', category: 'bathroom', subcategory: 'bath', rooms: ['bathroom'], style: 'classic',
    description: 'A long enamel bathtub. A relaxing soak cleans more slowly than a shower but lifts the mood.',
    tags: ['bath', 'fixture'], tier: 'premium', price: dollars(1400), quality: 4, functional: true,
    footprint: FP21, layer: 'floor', blocksMovement: true,
    slots: [{ id: 'soak', kind: 'use', pos: bathtub.at(0.5, 0.5), height: r3(0.09 * 1.65), facing: Math.PI / 2, approach: [0, 1], posture: 'seated' }],
    interactions: ['takeBath'], stats: { hygiene: 1.1, comfort: 6, environment: 2 }, finishes: [],
  }),
  obj(bathSink, {
    id: 'bathroom-sink', name: 'Pedestal Basin', category: 'bathroom', subcategory: 'sink', rooms: ['bathroom'], style: 'classic',
    description: 'A white pedestal washbasin. Pairs with a mirror above it.',
    tags: ['sink', 'fixture'], tier: 'budget', price: dollars(180), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, bathSink, 1)],
    interactions: ['washHands'], stats: { hygiene: 1 }, finishes: [],
  }),
  obj(mirror, {
    id: 'bathroom-mirror', name: 'Shelf Mirror', category: 'bathroom', subcategory: 'mirror', rooms: ['bathroom', 'bedroom'], style: 'classic',
    description: 'A framed wall mirror with a small glass shelf. Practise speeches in front of it to build charisma.',
    tags: ['mirror', 'wall'], tier: 'budget', price: dollars(120), quality: 2, functional: true,
    footprint: FP11, layer: 'wall', needsWall: true, blocksMovement: false, slots: [useFront('use', 0.5, null, 1)], // stand a step out: a basin usually sits below
    interactions: ['practiceSpeech'], stats: { skill: 1, environment: 1 }, finishes: [woodR()],
  }),
];

// --- Study and hobby -------------------------------------------------------------------------
const bookcase = fit('bookcaseOpen', FP11, 2, { back: WALL_GAP });
const bookcaseWide = fit('bookcaseClosedWide', FP21, 2, { back: WALL_GAP });
const STUDY: ObjectDef[] = [
  obj(bookcase, {
    id: 'bookcase-open', name: 'Open Bookcase', category: 'storage', subcategory: 'bookcase', rooms: ['study', 'living', 'bedroom'], style: 'classic',
    description: 'A tall open-backed bookcase. Take a book and read it in a nearby seat to train logic.',
    tags: ['bookcase', 'books', 'storage'], tier: 'budget', price: dollars(230), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, bookcase, 1)],
    interactions: ['readBook'], stats: { skill: 1, fun: 1 }, finishes: [woodR()],
  }),
  obj(bookcaseWide, {
    id: 'bookcase-wide', name: 'Wide Library Bookcase', category: 'storage', subcategory: 'bookcase', rooms: ['study', 'living'], style: 'classic',
    description: 'A two-tile closed-back bookcase with a broad selection: reading here is more rewarding.',
    tags: ['bookcase', 'books', 'storage'], packs: ['everyday-essentials', 'classic-townhouse'], tier: 'premium', price: dollars(640), quality: 4,
    functional: true, footprint: FP21, layer: 'floor', blocksMovement: true,
    slots: [useFront('left', 0.5, bookcaseWide, 1), useFront('right', 1.5, bookcaseWide, 1)],
    interactions: ['readBook'], stats: { skill: 1.2, fun: 1.15, environment: 1 }, finishes: [woodR()],
  }),
];

// --- Lighting and decor ----------------------------------------------------------------------
const lampRound = fit('lampRoundFloor', FP11, 2);
const lampSquare = fit('lampSquareFloor', FP11, 2);
const plant = fit('pottedPlant', FP11, 2);
const plantSmall = fit('plantSmall1', FP11, 2);
const rugRect = fit('rugRectangle', { w: 3, d: 2 }, 1.9);
const rugRound = fit('rugRound', FP22, 2);
const trash = fit('trashcan', FP11, 2);
const coatRack = fit('coatRackStanding', FP11, 2);
const DECOR: ObjectDef[] = [
  obj(lampRound, {
    id: 'lamp-floor-round', name: 'Drum Floor Lamp', category: 'lighting', subcategory: 'floor-lamp', rooms: ['living', 'bedroom', 'study'], style: 'classic',
    description: 'A slender floor lamp with a drum shade. Decorative.',
    tags: ['lamp', 'light', 'decor'], tier: 'budget', price: dollars(85), quality: 2, functional: false,
    footprint: FP11, layer: 'floor', blocksMovement: true, stats: { environment: 1 }, finishes: [metalR()],
  }),
  obj(lampSquare, {
    id: 'lamp-floor-square', name: 'Column Floor Lamp', category: 'lighting', subcategory: 'floor-lamp', rooms: ['living', 'bedroom'], style: 'modern',
    description: 'A tall paper-column lamp that glows from top to bottom. Decorative.',
    tags: ['lamp', 'light', 'decor'], packs: ['modern-minimal'], tier: 'standard', price: dollars(160), quality: 3, functional: false,
    footprint: FP11, layer: 'floor', blocksMovement: true, stats: { environment: 2 }, finishes: [metalR()],
  }),
  obj(plant, {
    id: 'plant-potted', name: 'Snake Plant', category: 'decor', subcategory: 'plant', rooms: ['living', 'bedroom', 'study', 'kitchen'], style: 'botanical',
    description: 'A tall, spiky houseplant in a wooden planter. Water it now and then to train gardening.',
    tags: ['plant', 'decor', 'garden'], packs: ['everyday-essentials', 'botanical-living'], tier: 'budget', price: dollars(60), quality: 2,
    functional: true, footprint: FP11, layer: 'floor', blocksMovement: true,
    interactions: ['waterPlant'], stats: { environment: 2 }, finishes: [woodR(['wood', 'woodDark'])],
  }),
  obj(plantSmall, {
    id: 'plant-small', name: 'Tabletop Succulent', category: 'decor', subcategory: 'plant', rooms: ['living', 'kitchen', 'bathroom', 'study'], style: 'botanical',
    description: 'A tiny succulent in a wooden pot for counters, desks and shelves. Can be watered.',
    tags: ['plant', 'decor', 'garden'], packs: ['botanical-living'], tier: 'budget', price: dollars(25), quality: 2, functional: true,
    footprint: FP11, layer: 'surface', blocksMovement: false,
    interactions: ['waterPlant'], stats: { environment: 1 }, finishes: [woodR()],
  }),
  obj(rugRect, {
    id: 'rug-rectangle', name: 'Bordered Area Rug', category: 'decor', subcategory: 'rug', rooms: ['living', 'bedroom', 'dining'], style: 'classic',
    description: 'A large rectangular rug with a woven border. Decorative; people walk over it.',
    tags: ['rug', 'decor'], tier: 'standard', price: dollars(240), quality: 3, functional: false,
    footprint: { w: 3, d: 2 }, layer: 'rug', blocksMovement: false, stats: { environment: 2 },
    finishes: [region('rug', 'Rug', ['carpet', 'carpetDarker'], FABRIC)],
  }),
  obj(rugRound, {
    id: 'rug-round', name: 'Round Ring Rug', category: 'decor', subcategory: 'rug', rooms: ['living', 'bedroom', 'kids'], style: 'modern',
    description: 'A circular rug with an inner ring pattern. Decorative; people walk over it.',
    tags: ['rug', 'decor'], packs: ['everyday-essentials', 'modern-minimal'], tier: 'standard', price: dollars(180), quality: 3, functional: false,
    footprint: FP22, layer: 'rug', blocksMovement: false, stats: { environment: 2 },
    finishes: [region('rug', 'Rug', ['carpet', 'carpetDarker'], FABRIC)],
  }),
  obj(trash, {
    id: 'trash-can', name: 'Pedal Bin', category: 'kitchen', subcategory: 'bin', rooms: ['kitchen', 'bathroom', 'study'], style: 'modern',
    description: 'A steel pedal bin. Decorative for now; emptying bins arrives with housework.',
    tags: ['bin', 'decor'], tier: 'budget', price: dollars(30), quality: 1, functional: false,
    footprint: FP11, layer: 'floor', blocksMovement: true, finishes: [metalR()],
  }),
  obj(coatRack, {
    id: 'coat-rack-standing', name: 'Standing Coat Rack', category: 'storage', subcategory: 'coat-rack', rooms: ['living', 'bedroom'], style: 'cottage',
    description: 'A turned-wood coat stand for the entryway. Decorative.',
    tags: ['coat-rack', 'decor'], packs: ['cozy-cottage'], tier: 'budget', price: dollars(70), quality: 2, functional: false,
    footprint: FP11, layer: 'floor', blocksMovement: true, stats: { environment: 1 }, finishes: [woodR()],
  }),
];

/** Every buy-mode object definition (ready and in development). */
export const OBJECTS: ObjectDef[] = [...BEDS, ...BEDROOM, ...KITCHEN, ...SEATING_AND_TABLES, ...ELECTRONICS, ...BATHROOM, ...STUDY, ...DECOR];
