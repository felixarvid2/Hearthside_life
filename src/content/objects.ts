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
//
// Tags drive the daily-life capabilities (content/capabilities.ts): 'cleanable' objects get dirty with use and offer
// Clean; 'plumbing', 'appliance' and 'electronics' objects wear out, break (quality 1..5 sets how fast) and offer
// Repair, Service and Call a Repairperson; 'sink' / 'dishes' objects are dish-washing stations. New furniture only needs the
// right tags (no interaction list changes) to take part in cleaning and repairs.
//
// L-shaped sofas leave the inside of the L empty: `openCells` lists those rot-0 footprint cells. They do not block walking and
// are the approach tile of the seats around them (only the other cells of the footprint block).
//
// Models come from the Kenney Furniture Kit (public/assets/furniture) or, for designs the kit lacks (easel, piano, treadmill,
// dishwasher, barbecue, crib, ...), from the original low-poly models built by tools/furniture-extra: the same conventions, so
// both are fitted and recoloured identically.

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
  // Milestone 2 additions
  loungeSofaLong: [[0, 0, -0.41], [0.98, 0.46, 0.41]],
  loungeSofaCorner: [[0, 0, -0.98], [0.98, 0.46, 0]],
  loungeChairRelax: [[0, 0, -0.6747], [0.49, 0.63, 0]],
  loungeDesignChair: [[0, 0, -0.41], [0.7296, 0.4, 0]],
  chairCushion: [[0, 0, -0.2], [0.2, 0.46, 0]],
  chairRounded: [[0, 0, -0.2], [0.2, 0.455, 0]],
  benchCushion: [[0, 0, -0.2], [0.4, 0.46, 0]],
  stoolBarSquare: [[0.056, 0, -0.1888], [0.2095, 0.405, -0.0411]],
  tableGlass: [[0, 0, -0.4474], [0.8415, 0.3267, 0]],
  tableCross: [[0, 0, -0.4474], [0.8521, 0.3474, 0]],
  deskCorner: [[0, 0, -0.9745], [0.9745, 0.3844, 0]],
  sideTableDrawers: [[-0.01, 0, -0.21], [0.5245, 0.3844, 0.0123]],
  bookcaseOpenLow: [[0, 0, -0.25], [0.4, 0.4, 0]],
  bookcaseClosed: [[0, 0, -0.25], [0.4, 0.85, 0]],
  cabinetTelevisionDoors: [[0, 0, -0.25], [0.8, 0.31, 0.01]],
  cabinetBed: [[-0.01, 0, -0.205], [0.256, 0.2332, 0.01]],
  kitchenBar: [[0, 0, -0.21], [0.43, 0.42, 0]],
  kitchenStoveElectric: [[0, 0, -0.45], [0.43, 0.45, 0]],
  kitchenFridgeSmall: [[0, 0, -0.2819], [0.43, 0.6002, 0.01]],
  kitchenMicrowave: [[0, 0, -0.22], [0.29, 0.18, 0.01]],
  washer: [[0, 0, -0.35], [0.39, 0.47, 0.04]],
  dryer: [[0, 0, -0.35], [0.39, 0.47, 0.03]],
  toiletSquare: [[0, 0, -0.3872], [0.3036, 0.451, 0]],
  bathroomCabinetDrawer: [[0, 0.0582, -0.45], [0.43, 0.53, -0.13]],
  showerRound: [[0, 0, -0.5618], [0.5618, 1.094, 0]],
  lampRoundTable: [[-0.016, 0, -0.1478], [0.136, 0.3142, 0.0278]],
  lampSquareTable: [[0, 0, -0.12], [0.12, 0.29, 0]],
  lampWall: [[-0.1133, 0, 0], [0.1133, 0.0928, 0.1503]],
  lampSquareCeiling: [[0, 0, -0.12], [0.12, 0.23, 0]],
  ceilingFan: [[-0.1719, -0.1337, -0.2637], [0.2828, 0, 0.2613]],
  rugRounded: [[0, 0, -0.92], [1.57, 0.01, 0]],
  rugSquare: [[0, 0, -0.92], [0.9043, 0.01, 0]],
  plantSmall2: [[-0.0473, 0, -0.0473], [0.0473, 0.14, 0.0473]],
  bear: [[0, 0, -0.2475], [0.3897, 0.45, 0]],
  // Milestone 4 additions (the first 13 are original models built by tools/furniture-extra, the rest unused Kenney models)
  dishwasher: [[0, 0, 0], [0.46, 0.45, 0.4725]],
  easel: [[0.0875, -0.0026, 0.0477], [0.4125, 0.7526, 0.39]],
  piano: [[0.065, 0, 0], [0.935, 0.625, 0.4]],
  treadmill: [[0.0763, 0, 0.09], [0.4238, 0.6, 0.94]],
  weightBench: [[0.01, 0, 0.15], [0.49, 0.635, 0.955]],
  chessTable: [[0.04, 0, 0.04], [0.46, 0.395, 0.46]],
  crib: [[0.035, 0, 0.085], [0.465, 0.5, 0.915]],
  toyChest: [[0.04, 0, 0.13], [0.46, 0.41, 0.37]],
  grill: [[0.06, -0.005, 0.1], [0.49, 0.595, 0.4075]],
  patioSet: [[0.025, 0, 0.025], [0.975, 1.2, 0.975]],
  gardenBed: [[0.03, 0, 0.04], [0.97, 0.405, 0.46]],
  gardenBench: [[0.075, 0, 0.1027], [0.925, 0.495, 0.4]],
  gardenChair: [[0.045, 0, 0.0266], [0.455, 0.5097, 0.4]],
  kitchenCoffeeMachine: [[0, 0, -0.2402], [0.1895, 0.1775, 0]],
  toaster: [[-0.094, 0, -0.05], [0.094, 0.13, 0.05]],
  kitchenBlender: [[0, 0, -0.1091], [0.1358, 0.2275, 0]],
  kitchenFridgeBuiltIn: [[0, 0, -0.45], [0.43, 0.8687, 0]],
  laptop: [[0, 0, -0.2401], [0.264, 0.1618, 0]],
  speakerSmall: [[0, 0, -0.1332], [0.148, 0.298, 0]],
  books: [[0, 0, -0.0945], [0.1504, 0.1039, 0]],
  bathroomSinkSquare: [[0, 0.0568, -0.45], [0.43, 0.6368, -0.15]],
  loungeDesignSofaCorner: [[0, 0, -1.3498], [1.3498, 0.4, 0]],
  loungeSofaOttoman: [[0.47, 0, -0.04], [0.9098, 0.23, 0.41]],
  benchCushionLow: [[-0.01, 0, -0.21], [0.41, 0.2, 0.01]],
  chairModernCushion: [[0, 0, -0.2], [0.2, 0.46, 0]],
  chairModernFrameCushion: [[0, 0, -0.2], [0.2, 0.46, 0]],
  cardboardBoxOpen: [[-0.0797, 0, -0.2125], [0.2922, 0.281, 0]],
  bench: [[0, 0, -0.2], [0.4, 0.47, 0]],
  tableCloth: [[0, 0, -0.4474], [0.8415, 0.3267, 0]],
  plantSmall3: [[-0.049, 0, -0.0424], [0.049, 0.145, 0.0424]],
  rugDoormat: [[0, 0, -0.237], [0.4293, 0.01, 0]],
  kitchenCabinetCornerRound: [[0, 0, -0.45], [0.45, 0.45, 0]],
  coatRack: [[0, 0, -0.1344], [0.448, 0.28, 0]],
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
const METAL_DARK: Swatch[] = [sw('dark-slate', 'Dark Slate', '#4e6363'), ...METAL.slice(1), sw('steel', 'Brushed Steel', '#bdd2d6')];
const FABRIC_BRICK: Swatch[] = [sw('brick', 'Brick Red', '#9b4c49'), ...FABRIC.slice(1)];
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
const darkMetalR = (label = 'Metal') => region('metal', label, ['metalDark'], METAL_DARK);
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
    tags: ['bed', 'double', 'sleep', 'cleanable'], tier: 'standard', price: dollars(950), quality: 3, functional: true,
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
    tags: ['bed', 'single', 'sleep', 'cleanable'], packs: ['everyday-essentials', 'cozy-cottage'], tier: 'budget', price: dollars(320), quality: 2,
    functional: true, footprint: FP12, layer: 'floor', blocksMovement: true,
    slots: [sleep('sleep', bedSingle.at(0.5, 0.56), 0.25 * 1.75, [1, 1])],
    interactions: ['sleep', 'nap'], stats: { energy: 0.85, comfort: 4, environment: 1 },
    finishes: [woodR(), fabricR(['carpet'], 'Bedding')],
  }),
  obj(bedBunk, {
    id: 'bed-bunk-pine', name: 'Two-Story Bunk Bed', category: 'beds', subcategory: 'bunk', rooms: ['bedroom', 'kids'], style: 'cottage',
    description: 'Two pine single beds stacked on one footprint - a space saver for shared rooms. Both bunks are entered from the right.',
    tags: ['bed', 'bunk', 'sleep', 'cleanable'], packs: ['everyday-essentials', 'kids-storybook'], tier: 'budget', price: dollars(540), quality: 2,
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
    tags: ['fridge', 'appliance', 'food', 'cleanable'], tier: 'standard', price: dollars(780), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, fridge, 1)],
    interactions: ['grabSnack', 'cookMeal'], stats: { cooking: 0 }, finishes: [applianceR()],
  }),
  obj(fridgeLarge, {
    id: 'fridge-side-by-side', name: 'Side-by-Side Fridge', category: 'kitchen', subcategory: 'fridge', rooms: ['kitchen'], style: 'modern',
    description: 'A roomy two-door fridge that keeps produce crisp. Meals cooked from it turn out a little better.',
    tags: ['fridge', 'appliance', 'food', 'cleanable'], packs: ['everyday-essentials', 'modern-minimal'], tier: 'premium', price: dollars(1850), quality: 4,
    functional: true, footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, fridgeLarge, 1)],
    interactions: ['grabSnack', 'cookMeal'], stats: { cooking: 1, environment: 1 }, finishes: [applianceR()],
  }),
  obj(stove, {
    id: 'stove-basic', name: 'Basic Gas Range', category: 'kitchen', subcategory: 'stove', rooms: ['kitchen'], style: 'classic',
    description: 'Four burners and an oven. Cooks use it when they make a meal from the fridge.',
    tags: ['stove', 'appliance', 'cooking', 'cleanable'], tier: 'budget', price: dollars(420), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, stove, 1)],
    interactions: [], stats: { cooking: 0 }, finishes: [woodR(['wood'])],
  }),
  obj(counter, {
    id: 'counter-basic', name: 'Base Cabinet Counter', category: 'kitchen', subcategory: 'counter', rooms: ['kitchen'], style: 'classic',
    description: 'A base cabinet with a worktop. Cooked meals are served on free counters.',
    tags: ['counter', 'surface', 'storage', 'cleanable'], tier: 'budget', price: dollars(260), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(WORKTOP),
    finishes: [woodR(['wood', 'woodDark']), counterR()],
  }),
  obj(counterDrawers, {
    id: 'counter-drawers', name: 'Drawer Unit Counter', category: 'kitchen', subcategory: 'counter', rooms: ['kitchen'], style: 'classic',
    description: 'A counter module with three deep drawers for pans and cutlery. Same worktop height as the other modules.',
    tags: ['counter', 'surface', 'storage', 'cleanable'], tier: 'standard', price: dollars(340), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(WORKTOP),
    finishes: [woodR(['wood', 'woodDark']), counterR()],
  }),
  obj(sink, {
    id: 'counter-sink', name: 'Kitchen Sink Counter', category: 'kitchen', subcategory: 'sink', rooms: ['kitchen'], style: 'classic',
    description: 'A counter module with a steel basin and a swan-neck tap. Wash your hands before cooking.',
    tags: ['sink', 'counter', 'surface', 'plumbing', 'cleanable'], tier: 'standard', price: dollars(480), quality: 3, functional: true,
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
    tags: ['table', 'dining', 'surface', 'cleanable'], tier: 'standard', price: dollars(420), quality: 3, functional: true,
    footprint: FP21, layer: 'floor', blocksMovement: true, surfaceHeight: 0.66, stats: { environment: 1 }, finishes: [woodR()],
  }),
  obj(roundTable, {
    id: 'table-dining-round', name: 'Hexagon Pedestal Table', category: 'tables', subcategory: 'dining', rooms: ['dining', 'kitchen'], style: 'mid-century',
    description: 'A six-sided pedestal table with room for chairs on every side. Meals can be served here.',
    tags: ['table', 'dining', 'surface', 'cleanable'], packs: ['everyday-essentials', 'mid-century'], tier: 'premium', price: dollars(780), quality: 4,
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
    interactions: ['playComputerGames', 'practiceProgramming', 'writeArticle', 'writeBook', 'programGig', 'jobSearch'], stats: { fun: 1, skill: 1 }, finishes: [],
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
    tags: ['toilet', 'fixture', 'plumbing', 'cleanable'], tier: 'budget', price: dollars(260), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', toilet.at(0.5, 0.62), 0.248 * 2, [0, 1])],
    interactions: ['useToilet'], stats: { comfort: 2 }, finishes: [],
  }),
  obj(shower, {
    id: 'shower-stall', name: 'Glass Shower Stall', category: 'bathroom', subcategory: 'shower', rooms: ['bathroom'], style: 'modern',
    description: 'A compact corner shower with a glass door. Showers until fully clean (at most 30 minutes).',
    tags: ['shower', 'fixture', 'plumbing', 'cleanable'], tier: 'standard', price: dollars(750), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true,
    slots: [{ id: 'inside', kind: 'use', pos: shower.at(0.5, 0.5), height: r3(0.079 * 1.7), facing: Math.PI, approach: [0, 1], posture: 'standing' }],
    interactions: ['takeShower'], stats: { hygiene: 1 }, finishes: [],
  }),
  obj(bathtub, {
    id: 'bathtub', name: 'Deep Soaking Tub', category: 'bathroom', subcategory: 'bath', rooms: ['bathroom'], style: 'classic',
    description: 'A long enamel bathtub. A relaxing soak cleans more slowly than a shower but lifts the mood.',
    tags: ['bath', 'fixture', 'plumbing', 'cleanable'], tier: 'premium', price: dollars(1400), quality: 4, functional: true,
    footprint: FP21, layer: 'floor', blocksMovement: true,
    slots: [{ id: 'soak', kind: 'use', pos: bathtub.at(0.5, 0.5), height: r3(0.09 * 1.65), facing: Math.PI / 2, approach: [0, 1], posture: 'seated' }],
    interactions: ['takeBath'], stats: { hygiene: 1.1, comfort: 6, environment: 2 }, finishes: [],
  }),
  obj(bathSink, {
    id: 'bathroom-sink', name: 'Pedestal Basin', category: 'bathroom', subcategory: 'sink', rooms: ['bathroom'], style: 'classic',
    description: 'A white pedestal washbasin. Pairs with a mirror above it.',
    tags: ['sink', 'fixture', 'plumbing', 'cleanable'], tier: 'budget', price: dollars(180), quality: 2, functional: true,
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
    interactions: ['readBook', 'readSkillBook'], stats: { skill: 1, fun: 1 }, finishes: [woodR()],
  }),
  obj(bookcaseWide, {
    id: 'bookcase-wide', name: 'Wide Library Bookcase', category: 'storage', subcategory: 'bookcase', rooms: ['study', 'living'], style: 'classic',
    description: 'A two-tile closed-back bookcase with a broad selection: reading here is more rewarding.',
    tags: ['bookcase', 'books', 'storage'], packs: ['everyday-essentials', 'classic-townhouse'], tier: 'premium', price: dollars(640), quality: 4,
    functional: true, footprint: FP21, layer: 'floor', blocksMovement: true,
    slots: [useFront('left', 0.5, bookcaseWide, 1), useFront('right', 1.5, bookcaseWide, 1)],
    interactions: ['readBook', 'readSkillBook'], stats: { skill: 1.2, fun: 1.15, environment: 1 }, finishes: [woodR()],
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


// =============================================================================================
// Milestone 2 additions: more of the Kenney Furniture Kit, one model per design
// =============================================================================================

const CEILING = 2.8; // wall height (M1); ceiling items hang from it

// --- Seating ---------------------------------------------------------------------------------
const sofaChaise = fit('loungeSofaLong', FP22, 2);
const sofaCorner = fit('loungeSofaCorner', FP22, 2);
const recliner = fit('loungeChairRelax', FP11, 1.4);
const designerChair = fit('loungeDesignChair', FP11, 1.35);
const chairCushion = fit('chairCushion', FP11, 2);
const chairRounded = fit('chairRounded', FP11, 2);
const benchCushion = fit('benchCushion', FP11, 2, { back: WALL_GAP });
const stoolSquare = fit('stoolBarSquare', FP11, 2);
const SEATING_2: ObjectDef[] = [
  obj(sofaChaise, {
    id: 'sofa-chaise', name: 'Chaise Lounge Sofa', category: 'seating', subcategory: 'sofa', rooms: ['living'], style: 'classic',
    description: 'A two-seat sofa with a long chaise end to stretch out on. Three people can sit; one can nap.',
    tags: ['sofa', 'seat', 'chaise'], packs: ['everyday-essentials', 'classic-townhouse'], tier: 'premium', price: dollars(1380), quality: 4, functional: true,
    footprint: FP22, layer: 'floor', blocksMovement: true,
    // The model is an L: back row (cells 0,0 and 1,0) plus the chaise (1,1). Cell (0,1) inside the L is empty and walkable, so every
    // seat is entered from it (the middle seat diagonally) and the chaise from the open front.
    openCells: [[0, 1]],
    slots: [
      sit('left', sofaChaise.at(0.25, 0.25), 0.23 * 2, [0, 1]), sit('middle', sofaChaise.at(0.75, 0.25), 0.23 * 2, [0, 1]),
      sit('chaise', sofaChaise.at(0.82, 0.62), 0.23 * 2, [1, 2]),
    ],
    interactions: ['sit', 'nap'], stats: { comfort: 7, energy: 0.8, environment: 2 }, finishes: [fabricR(['carpet']), woodR()],
  }),
  obj(sofaCorner, {
    id: 'sofa-corner', name: 'Corner Sectional', category: 'seating', subcategory: 'sofa', rooms: ['living'], style: 'modern',
    description: 'An L-shaped sectional that turns a corner of the living room into a lounge. Three seats and a deep, comfortable corner.',
    tags: ['sofa', 'seat', 'sectional', 'corner'], packs: ['modern-minimal'], tier: 'premium', price: dollars(1720), quality: 4, functional: true,
    footprint: FP22, layer: 'floor', blocksMovement: true,
    // Backs on the north and east sides, so the open inside of the L (cell 0,1) faces the room and is where everyone steps in from.
    openCells: [[0, 1]],
    slots: [
      sit('left', sofaCorner.at(0.25, 0.25), 0.23 * 2, [0, 1]), sit('corner', sofaCorner.at(0.75, 0.25), 0.23 * 2, [0, 1], -Math.PI / 4),
      sit('right', sofaCorner.at(0.75, 0.75), 0.23 * 2, [0, 1], -Math.PI / 2),
    ],
    interactions: ['sit', 'nap'], stats: { comfort: 8, energy: 0.85, environment: 2 }, finishes: [fabricR(['carpet']), woodR()],
  }),
  obj(recliner, {
    id: 'armchair-recliner', name: 'Reclining Armchair', category: 'seating', subcategory: 'armchair', rooms: ['living', 'bedroom'], style: 'retro',
    description: 'A big padded chair with a footrest that kicks out. The best seat for a long evening in front of the television.',
    tags: ['armchair', 'seat', 'recliner'], packs: ['mid-century'], tier: 'standard', price: dollars(690), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', recliner.at(0.5, 0.4), 0.2 * 1.4, [0, 1])],
    interactions: ['sit', 'nap'], stats: { comfort: 7, energy: 0.75, environment: 1 }, finishes: [fabricR(['carpet']), woodR(), metalR()],
  }),
  obj(designerChair, {
    id: 'armchair-designer', name: 'Designer Tub Chair', category: 'seating', subcategory: 'armchair', rooms: ['living', 'study', 'bedroom'], style: 'modern',
    description: 'A low, deep tub chair on slim legs: sculpted and surprisingly comfortable.',
    tags: ['armchair', 'seat'], packs: ['modern-minimal', 'mid-century'], tier: 'premium', price: dollars(840), quality: 4, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', designerChair.at(0.5, 0.55), 0.2 * 1.35, [0, 1])],
    interactions: ['sit'], stats: { comfort: 7, environment: 2 }, finishes: [fabricR(['carpetBlue']), metalR()],
  }),
  obj(chairCushion, {
    id: 'chair-dining-cushion', name: 'Cushioned Dining Chair', category: 'seating', subcategory: 'chair', rooms: ['dining', 'kitchen'], style: 'cottage',
    description: 'A ladder-back chair with a padded seat pad. Slip it under a table; diners come in from behind.',
    tags: ['chair', 'seat', 'dining'], packs: ['everyday-essentials', 'cozy-cottage'], tier: 'budget', price: dollars(120), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', chairCushion.at(0.5, 0.6), 0.24 * 2, [0, -1])],
    interactions: ['sit'], stats: { comfort: 4 }, finishes: [woodR(), fabricR(['carpet'], 'Seat pad')],
  }),
  obj(chairRounded, {
    id: 'chair-rounded', name: 'Arch-Back Chair', category: 'seating', subcategory: 'chair', rooms: ['dining', 'kitchen', 'bedroom'], style: 'cottage',
    description: 'A plain wooden chair with a rounded back, light enough to carry from room to room.',
    tags: ['chair', 'seat', 'dining'], packs: ['everyday-essentials', 'cozy-cottage'], tier: 'budget', price: dollars(70), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', chairRounded.at(0.5, 0.6), 0.24 * 2, [0, -1])],
    interactions: ['sit'], stats: { comfort: 2 }, finishes: [woodR()],
  }),
  obj(benchCushion, {
    id: 'bench-cushion', name: 'Cushioned Hall Bench', category: 'seating', subcategory: 'bench', rooms: ['living', 'bedroom', 'dining'], style: 'cottage',
    description: 'A small padded bench for the end of a bed, a hallway or a window nook.',
    tags: ['bench', 'seat'], packs: ['cozy-cottage'], tier: 'budget', price: dollars(140), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', benchCushion.at(0.5, 0.55), 0.22 * 2, [0, 1])],
    interactions: ['sit'], stats: { comfort: 3, environment: 1 }, finishes: [woodR(), fabricR(['carpet'], 'Cushion')],
  }),
  obj(stoolSquare, {
    id: 'stool-bar-square', name: 'Square-Seat Bar Stool', category: 'seating', subcategory: 'stool', rooms: ['kitchen', 'dining'], style: 'cottage',
    description: 'A tall wooden stool with a square padded seat, made to tuck under a counter.',
    tags: ['stool', 'seat'], packs: ['cozy-cottage'], tier: 'budget', price: dollars(65), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', stoolSquare.at(0.5, 0.5), 0.405 * 2, [0, -1])],
    interactions: ['sit'], stats: { comfort: 2 }, finishes: [woodR(), fabricR(['carpet'], 'Cushion')],
  }),
];

// --- Tables, desks and storage -----------------------------------------------------------------
const glassDining = fit('tableGlass', FP21, 0.66 / 0.3267);
const trestle = fit('tableCross', FP21, 0.7 / 0.3474);
const cornerDesk = fit('deskCorner', FP22, 2);
const consoleDrawers = fit('sideTableDrawers', FP11, 1.8, { back: WALL_GAP });
const lowBookcase = fit('bookcaseOpenLow', FP11, 2, { back: WALL_GAP });
const tallBookcase = fit('bookcaseClosed', FP11, 2, { back: WALL_GAP });
const mediaDoors = fit('cabinetTelevisionDoors', FP21, 0.6 / 0.31, { back: WALL_GAP });
const bedsideCupboard = fit('cabinetBed', FP11, 2);
const TABLES_STORAGE_2: ObjectDef[] = [
  obj(glassDining, {
    id: 'table-dining-glass', name: 'Glass-Top Dining Table', category: 'tables', subcategory: 'dining', rooms: ['dining', 'kitchen'], style: 'modern',
    description: 'A four-seat table with a clear glass top on a slim steel frame. Meals can be served here.',
    tags: ['table', 'dining', 'surface', 'cleanable'], packs: ['modern-minimal'], tier: 'premium', price: dollars(760), quality: 4, functional: true,
    footprint: FP21, layer: 'floor', blocksMovement: true, surfaceHeight: 0.66, stats: { environment: 2 }, finishes: [metalR()],
  }),
  obj(trestle, {
    id: 'table-trestle', name: 'Trestle Farm Table', category: 'tables', subcategory: 'dining', rooms: ['dining', 'kitchen'], style: 'cottage',
    description: 'A sturdy scrubbed-wood table on crossed trestle legs. Seats four and has seen a lot of dinners.',
    tags: ['table', 'dining', 'surface', 'cleanable'], packs: ['cozy-cottage'], tier: 'standard', price: dollars(540), quality: 3, functional: true,
    footprint: FP21, layer: 'floor', blocksMovement: true, surfaceHeight: 0.7, stats: { environment: 1 }, finishes: [woodR()],
  }),
  obj(cornerDesk, {
    id: 'desk-corner', name: 'Corner Writing Desk', category: 'tables', subcategory: 'desk', rooms: ['study', 'bedroom'], style: 'classic',
    description: 'An L-shaped desk that wraps a corner and gives two work surfaces. Put a computer on it and a chair beside it.',
    tags: ['desk', 'surface', 'corner'], packs: ['classic-townhouse', 'creative-studio'], tier: 'standard', price: dollars(620), quality: 3, functional: true,
    footprint: FP22, layer: 'floor', blocksMovement: true, surfaceHeight: 0.77, stats: { environment: 1 }, finishes: [woodR(), metalR()],
  }),
  obj(consoleDrawers, {
    id: 'console-drawers', name: 'Hall Table with Drawers', category: 'tables', subcategory: 'side', rooms: ['living', 'bedroom', 'study'], style: 'classic',
    description: 'A narrow table with two drawers for keys and letters. A good stand for a lamp.',
    tags: ['table', 'side', 'surface', 'storage'], tier: 'standard', price: dollars(210), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(consoleDrawers.box.y1), finishes: [woodR(), metalR()],
  }),
  obj(lowBookcase, {
    id: 'bookcase-low', name: 'Low Open Bookcase', category: 'storage', subcategory: 'bookcase', rooms: ['study', 'living', 'bedroom', 'kids'], style: 'modern',
    description: 'A waist-high open shelf for paperbacks and plants. Its top is a surface for lamps and small things.',
    tags: ['bookcase', 'books', 'storage', 'surface'], packs: ['everyday-essentials', 'modern-minimal'], tier: 'budget', price: dollars(150), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(lowBookcase.box.y1), slots: [useFront('use', 0.5, lowBookcase, 1)],
    interactions: ['readBook', 'readSkillBook'], stats: { skill: 0.9, fun: 0.9 }, finishes: [woodR()],
  }),
  obj(tallBookcase, {
    id: 'bookcase-tall', name: 'Tall Shelving Unit', category: 'storage', subcategory: 'bookcase', rooms: ['study', 'living', 'bedroom'], style: 'classic',
    description: 'A floor-to-top shelving unit with five levels. Holds a small library and rewards long reading sessions.',
    tags: ['bookcase', 'books', 'storage'], packs: ['everyday-essentials', 'classic-townhouse'], tier: 'standard', price: dollars(340), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, tallBookcase, 1)],
    interactions: ['readBook', 'readSkillBook'], stats: { skill: 1.1, fun: 1.05, environment: 1 }, finishes: [woodR()],
  }),
  obj(mediaDoors, {
    id: 'media-cabinet-doors', name: 'Media Cabinet with Doors', category: 'storage', subcategory: 'media', rooms: ['living', 'bedroom'], style: 'classic',
    description: 'A long, low cabinet with closed doors that hides the cables and clutter. A television stands on top.',
    tags: ['tv-stand', 'surface', 'storage'], packs: ['classic-townhouse'], tier: 'standard', price: dollars(340), quality: 3, functional: true,
    footprint: FP21, layer: 'floor', blocksMovement: true, surfaceHeight: 0.6, finishes: [woodR(), metalR()],
  }),
  obj(bedsideCupboard, {
    id: 'cupboard-bedside', name: 'Bedside Cupboard', category: 'beds', subcategory: 'nightstand', rooms: ['bedroom'], style: 'cottage',
    description: 'A small single-door cupboard to stand beside the bed. Lamps and alarm clocks fit on top.',
    tags: ['nightstand', 'surface', 'storage'], packs: ['cozy-cottage'], tier: 'budget', price: dollars(90), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(bedsideCupboard.box.y1), finishes: [woodR(), metalR()],
  }),
];

// --- Kitchen and laundry -----------------------------------------------------------------------
const barCounter = fit('kitchenBar', FP11, KITCHEN_SCALE, { back: 0.02 });
const stoveElectric = fit('kitchenStoveElectric', FP11, KITCHEN_SCALE, { back: 0.02 });
const fridgeCompact = fit('kitchenFridgeSmall', FP11, KITCHEN_SCALE, { back: WALL_GAP });
const microwave = fit('kitchenMicrowave', FP11, 2);
const washer = fit('washer', FP11, KITCHEN_SCALE, { back: 0.02 });
const dryer = fit('dryer', FP11, KITCHEN_SCALE, { back: 0.02 });
const KITCHEN_2: ObjectDef[] = [
  obj(barCounter, {
    id: 'counter-bar', name: 'Breakfast Bar Counter', category: 'kitchen', subcategory: 'counter', rooms: ['kitchen', 'dining'], style: 'classic',
    description: 'A shallow counter module for a breakfast bar: a worktop at the same height as the other modules, with room for stools on the open side.',
    tags: ['counter', 'surface', 'bar', 'cleanable'], packs: ['everyday-essentials', 'mid-century'], tier: 'budget', price: dollars(190), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(WORKTOP), finishes: [woodR(['wood', 'woodDark']), counterR()],
  }),
  obj(stoveElectric, {
    id: 'stove-electric', name: 'Electric Hob Range', category: 'kitchen', subcategory: 'stove', rooms: ['kitchen'], style: 'modern',
    description: 'Four ceramic hotplates over a fan oven. Cooks use it when they make a meal from the fridge, and a good range lifts the result a little.',
    tags: ['stove', 'appliance', 'cooking', 'cleanable'], packs: ['everyday-essentials', 'modern-minimal'], tier: 'standard', price: dollars(780), quality: 4, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, stoveElectric, 1)],
    interactions: [], stats: { cooking: 1 }, finishes: [woodR(['wood'])],
  }),
  obj(fridgeCompact, {
    id: 'fridge-compact', name: 'Compact Fridge', category: 'kitchen', subcategory: 'fridge', rooms: ['kitchen', 'bedroom', 'study'], style: 'modern',
    description: 'A counter-height fridge for small kitchens and studies. Grab a snack or gather ingredients to cook a meal.',
    tags: ['fridge', 'appliance', 'food', 'cleanable'], tier: 'budget', price: dollars(420), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, fridgeCompact, 1)],
    interactions: ['grabSnack', 'cookMeal'], stats: { cooking: 0 }, finishes: [applianceR()],
  }),
  obj(microwave, {
    id: 'microwave', name: 'Microwave Oven', category: 'kitchen', subcategory: 'appliance', rooms: ['kitchen'], style: 'modern',
    description: 'A countertop microwave with a glass door. Decorative for now; it stands on any counter.',
    tags: ['appliance', 'decor', 'kitchen'], tier: 'budget', price: dollars(110), quality: 2, functional: false,
    footprint: FP11, layer: 'surface', blocksMovement: false, stats: { environment: 1 }, finishes: [metalR(['metalMedium'])],
  }),
  obj(washer, {
    id: 'washing-machine', name: 'Front-Loading Washer', category: 'kitchen', subcategory: 'laundry', rooms: ['kitchen', 'bathroom'], style: 'modern',
    description: 'A front-loading washing machine with a round porthole door. Decorative for now; laundry arrives with housework.',
    tags: ['laundry', 'appliance', 'washer'], tier: 'standard', price: dollars(620), quality: 3, functional: false,
    footprint: FP11, layer: 'floor', blocksMovement: true, stats: { environment: 1 }, finishes: [applianceR(['metalLight'])],
  }),
  obj(dryer, {
    id: 'tumble-dryer', name: 'Tumble Dryer', category: 'kitchen', subcategory: 'laundry', rooms: ['kitchen', 'bathroom'], style: 'modern',
    description: 'A matching tumble dryer with a large door. Decorative for now; laundry arrives with housework.',
    tags: ['laundry', 'appliance', 'dryer'], tier: 'standard', price: dollars(560), quality: 3, functional: false,
    footprint: FP11, layer: 'floor', blocksMovement: true, stats: { environment: 1 }, finishes: [applianceR(['metalLight'])],
  }),
];

// --- Bathroom ---------------------------------------------------------------------------------
const toiletSquare = fit('toiletSquare', FP11, 2);
const vanity = fit('bathroomCabinetDrawer', FP11, 2, { back: WALL_GAP });
const showerRound = fit('showerRound', FP11, 1.7);
const BATHROOM_2: ObjectDef[] = [
  obj(toiletSquare, {
    id: 'toilet-square', name: 'Square-Line Toilet', category: 'bathroom', subcategory: 'toilet', rooms: ['bathroom'], style: 'modern',
    description: 'A squared-off close-coupled toilet with a slim cistern. A little more comfortable than the basic one.',
    tags: ['toilet', 'fixture', 'plumbing', 'cleanable'], packs: ['modern-minimal'], tier: 'standard', price: dollars(340), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', toiletSquare.at(0.5, 0.45), 0.248 * 2, [0, 1])],
    interactions: ['useToilet'], stats: { comfort: 3 }, finishes: [],
  }),
  obj(vanity, {
    id: 'vanity-basin', name: 'Vanity Unit with Basin', category: 'bathroom', subcategory: 'sink', rooms: ['bathroom'], style: 'modern',
    description: 'A washbasin set into a vanity cabinet with two drawers for towels and toiletries. Pairs with a mirror above it.',
    tags: ['sink', 'fixture', 'storage', 'plumbing', 'cleanable'], packs: ['modern-minimal', 'everyday-essentials'], tier: 'standard', price: dollars(420), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, vanity, 1)],
    interactions: ['washHands'], stats: { hygiene: 1, environment: 1 }, finishes: [woodR()],
  }),
  obj(showerRound, {
    id: 'shower-round', name: 'Quadrant Shower', category: 'bathroom', subcategory: 'shower', rooms: ['bathroom'], style: 'modern',
    description: 'A curved corner shower enclosure with a glass screen and a deep tray. Showers until fully clean (at most 30 minutes).',
    tags: ['shower', 'fixture', 'plumbing', 'cleanable'], packs: ['modern-minimal'], tier: 'premium', price: dollars(980), quality: 4, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true,
    slots: [{ id: 'inside', kind: 'use', pos: showerRound.at(0.45, 0.55), height: r3(0.079 * 1.7), facing: Math.PI, approach: [0, 1], posture: 'standing' }],
    interactions: ['takeShower'], stats: { hygiene: 1.1, environment: 1 }, finishes: [],
  }),
];

// --- Lighting ---------------------------------------------------------------------------------
// Every model with a 'lamp' material glows at night (ObjectsView adds a warm point light near the camera).
const tableLampRound = fit('lampRoundTable', FP11, 1.6);
const tableLampSquare = fit('lampSquareTable', FP11, 1.8);
const wallLamp = fit('lampWall', FP11, 2, { back: WALL_GAP, lift: 1.7 });
const ceilingLight = fit('lampSquareCeiling', FP11, 2, { lift: CEILING - 0.23 * 2 });
const ceilingFan = fit('ceilingFan', FP11, 1.8, { lift: CEILING - 0.1337 * 1.8 });
const LIGHTING_2: ObjectDef[] = [
  obj(tableLampRound, {
    id: 'lamp-table-round', name: 'Round Table Lamp', category: 'lighting', subcategory: 'table-lamp', rooms: ['living', 'bedroom', 'study'], style: 'classic',
    description: 'A table lamp with a tapered shade that gives off a soft yellow glow at night. Stands on a table, nightstand or shelf.',
    tags: ['lamp', 'light', 'decor'], packs: ['everyday-essentials', 'cozy-cottage'], tier: 'budget', price: dollars(45), quality: 2, functional: false,
    footprint: FP11, layer: 'surface', blocksMovement: false, stats: { environment: 1 }, finishes: [metalR()],
  }),
  obj(tableLampSquare, {
    id: 'lamp-table-square', name: 'Square Table Lamp', category: 'lighting', subcategory: 'table-lamp', rooms: ['living', 'bedroom', 'study'], style: 'modern',
    description: 'A boxy-shaded table lamp that glows from every side at night. Stands on a table, nightstand or shelf.',
    tags: ['lamp', 'light', 'decor'], packs: ['modern-minimal', 'mid-century'], tier: 'budget', price: dollars(60), quality: 2, functional: false,
    footprint: FP11, layer: 'surface', blocksMovement: false, stats: { environment: 1 }, finishes: [metalR()],
  }),
  obj(wallLamp, {
    id: 'lamp-wall', name: 'Wall Sconce', category: 'lighting', subcategory: 'wall-lamp', rooms: ['living', 'bedroom', 'bathroom', 'study'], style: 'classic',
    description: 'A curved wall sconce that washes the wall with warm light at night. Hangs on any free stretch of wall.',
    tags: ['lamp', 'light', 'decor', 'wall'], packs: ['classic-townhouse', 'art-deco'], tier: 'budget', price: dollars(75), quality: 3, functional: false,
    footprint: FP11, layer: 'wall', needsWall: true, blocksMovement: false, stats: { environment: 2 }, finishes: [metalR()],
  }),
  obj(ceilingLight, {
    id: 'light-ceiling-square', name: 'Square Ceiling Light', category: 'lighting', subcategory: 'ceiling-light', rooms: ['living', 'bedroom', 'kitchen', 'bathroom', 'study'], style: 'modern',
    description: 'A flush square ceiling fitting that lights the whole room at night.',
    tags: ['lamp', 'light', 'ceiling', 'decor'], packs: ['everyday-essentials', 'modern-minimal'], tier: 'budget', price: dollars(55), quality: 2, functional: false,
    footprint: FP11, layer: 'ceiling', blocksMovement: false, stats: { environment: 1 }, finishes: [metalR()],
  }),
  obj(ceilingFan, {
    id: 'ceiling-fan', name: 'Ceiling Fan', category: 'lighting', subcategory: 'ceiling-light', rooms: ['living', 'bedroom', 'kitchen', 'study'], style: 'cottage',
    description: 'Three wooden blades and a lamp: a ceiling fan with a light in the middle. Decorative; people stay cool anyway.',
    tags: ['lamp', 'light', 'ceiling', 'fan', 'decor'], packs: ['coastal-home', 'cozy-cottage'], tier: 'standard', price: dollars(240), quality: 3, functional: false,
    footprint: FP11, layer: 'ceiling', blocksMovement: false, stats: { environment: 2 }, finishes: [woodR()],
  }),
];

// --- Decor ------------------------------------------------------------------------------------
const rugRounded = fit('rugRounded', { w: 3, d: 2 }, 1.9);
const rugSquare = fit('rugSquare', FP22, 2);
const cactus = fit('plantSmall2', FP11, 2);
const bearTrophy = fit('bear', FP11, 1.6, { back: WALL_GAP, lift: 1.5 });
const DECOR_2: ObjectDef[] = [
  obj(rugRounded, {
    id: 'rug-rounded', name: 'Racetrack Rug', category: 'decor', subcategory: 'rug', rooms: ['living', 'bedroom', 'dining'], style: 'modern',
    description: 'A large oval rug with a border ring. Decorative; people walk over it.',
    tags: ['rug', 'decor'], packs: ['modern-minimal', 'mid-century'], tier: 'standard', price: dollars(260), quality: 3, functional: false,
    footprint: { w: 3, d: 2 }, layer: 'rug', blocksMovement: false, stats: { environment: 2 },
    finishes: [region('rug', 'Rug', ['carpet', 'carpetDarker'], FABRIC)],
  }),
  obj(rugSquare, {
    id: 'rug-square', name: 'Square Bordered Rug', category: 'decor', subcategory: 'rug', rooms: ['living', 'bedroom', 'kids', 'study'], style: 'classic',
    description: 'A square rug with a double border, sized to sit under a coffee table or a desk chair. Decorative.',
    tags: ['rug', 'decor'], packs: ['everyday-essentials', 'classic-townhouse'], tier: 'budget', price: dollars(140), quality: 2, functional: false,
    footprint: FP22, layer: 'rug', blocksMovement: false, stats: { environment: 2 },
    finishes: [region('rug', 'Rug', ['carpet', 'carpetDarker'], FABRIC)],
  }),
  obj(cactus, {
    id: 'plant-cactus', name: 'Potted Cactus', category: 'decor', subcategory: 'plant', rooms: ['living', 'kitchen', 'bathroom', 'study', 'bedroom'], style: 'botanical',
    description: 'A little cactus in a wooden pot for sills, desks and shelves. Hardly needs watering, but can be.',
    tags: ['plant', 'decor', 'garden'], packs: ['botanical-living', 'creative-studio'], tier: 'budget', price: dollars(20), quality: 2, functional: true,
    footprint: FP11, layer: 'surface', blocksMovement: false,
    interactions: ['waterPlant'], stats: { environment: 1 }, finishes: [woodR()],
  }),
  obj(bearTrophy, {
    id: 'bear-head-trophy', name: 'Bear Head Mount', category: 'decor', subcategory: 'wall-art', rooms: ['living', 'study'], style: 'rustic',
    description: 'A carved wooden bear head on a plaque: a lodge-style piece to hang over a fireplace or a desk. Decorative.',
    tags: ['wall-art', 'decor', 'rustic'], packs: ['cozy-cottage'], tier: 'standard', price: dollars(180), quality: 3, functional: false,
    footprint: FP11, layer: 'wall', needsWall: true, blocksMovement: false, stats: { environment: 2 }, finishes: [woodR()],
  }),
];

// =============================================================================================
// Milestone 4 additions: hobby, kids and outdoor furniture, small kitchen appliances and a dishwasher.
// Thirteen designs use original low-poly models built by tools/furniture-extra (the Kenney kit has no easel, piano,
// treadmill, barbecue, crib, dishwasher, ...); the rest use Kenney models that were not yet used.
// =============================================================================================

// --- Hobby -------------------------------------------------------------------------------------
const easelFit = fit('easel', FP11, 2);
const pianoFit = fit('piano', FP21, 2, { back: WALL_GAP });
const treadmillFit = fit('treadmill', FP12, 2);
const weightBenchFit = fit('weightBench', FP12, 2);
const chessFit = fit('chessTable', FP11, 2);
const HOBBY_OBJECTS: ObjectDef[] = [
  obj(easelFit, {
    id: 'easel-studio', name: 'Studio Easel', category: 'hobby', subcategory: 'art', rooms: ['living', 'study', 'bedroom'], style: 'classic',
    description: 'A folding wooden easel with a half-finished landscape and a tray of paint pots. Paint for fun, and the practice builds Painting.',
    tags: ['easel', 'art', 'creative'], packs: ['creative-studio'], tier: 'budget', price: dollars(140), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, easelFit, 1)],
    interactions: ['paintCanvas', 'paintToSell'], stats: { fun: 1, skill: 1, environment: 1 }, finishes: [woodR(['wood', 'woodDark'])],
  }),
  obj(pianoFit, {
    id: 'piano-upright', name: 'Upright Piano', category: 'hobby', subcategory: 'instrument', rooms: ['living', 'study'], style: 'classic',
    description: 'A full-size upright piano. Play standing, or pull a chair or bench up in front of it and sit down: more fun and quicker progress in Music than a radio.',
    tags: ['piano', 'instrument', 'music', 'creative'], packs: ['creative-studio', 'classic-townhouse'], tier: 'premium', price: dollars(1850), quality: 4, functional: true,
    footprint: FP21, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.98, pianoFit, 1)],
    interactions: ['playPiano', 'busk'], stats: { fun: 1.15, skill: 1.2, environment: 3 }, finishes: [woodR(['wood', 'woodDark'])],
  }),
  obj(treadmillFit, {
    id: 'treadmill', name: 'Folding Treadmill', category: 'hobby', subcategory: 'fitness', rooms: ['living', 'bedroom', 'study'], style: 'modern',
    description: 'A motorised treadmill with a handrail console. Step on from the open end and run: trains Fitness, but costs energy and hygiene.',
    tags: ['exercise', 'treadmill', 'appliance', 'cleanable'], packs: ['everyday-essentials', 'modern-minimal'], tier: 'standard', price: dollars(900), quality: 3,
    functional: true, footprint: FP12, layer: 'floor', blocksMovement: true,
    slots: [{ id: 'run', kind: 'use', pos: treadmillFit.at(0.5, 0.7), height: r3(0.225), facing: Math.PI, approach: [0, 2], posture: 'standing' }],
    interactions: ['workOut'], stats: { fun: 1, skill: 1.1 }, finishes: [darkMetalR('Frame')],
  }),
  obj(weightBenchFit, {
    id: 'weight-bench', name: 'Weight Bench and Barbell', category: 'hobby', subcategory: 'fitness', rooms: ['living', 'bedroom', 'study'], style: 'industrial',
    description: 'A padded bench with a loaded barbell on the rack and a pair of dumbbells. Press from the foot of the bench: a harder workout than a jog.',
    tags: ['exercise', 'weights', 'cleanable'], packs: ['industrial-loft'], tier: 'budget', price: dollars(380), quality: 3, functional: true,
    footprint: FP12, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, weightBenchFit, 2)],
    interactions: ['liftWeights'], stats: { skill: 1.15 }, finishes: [region('pad', 'Pad', ['carpetDarker'], FABRIC_BRICK), darkMetalR('Frame')],
  }),
  obj(chessFit, {
    id: 'table-chess', name: 'Chessboard Table', category: 'hobby', subcategory: 'games', rooms: ['living', 'study', 'dining'], style: 'classic',
    description: 'A small square table with an inlaid chessboard and a game in progress. Sit at a chair facing it (or stand) and play: trains Logic.',
    tags: ['table', 'game', 'chess'], packs: ['classic-townhouse'], tier: 'standard', price: dollars(260), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, chessFit, 1)],
    interactions: ['playChess'], stats: { fun: 1, skill: 1, environment: 1 }, finishes: [woodR()],
  }),
];

// --- Kids --------------------------------------------------------------------------------------
const cribFit = fit('crib', FP12, 2);
const toyChestFit = fit('toyChest', FP11, 2, { back: WALL_GAP });
const playBoxFit = fit('cardboardBoxOpen', FP11, 2);
const KIDS_OBJECTS: ObjectDef[] = [
  obj(cribFit, {
    id: 'crib-wood', name: 'Wooden Crib', category: 'kids', subcategory: 'crib', rooms: ['kids', 'bedroom'], style: 'cottage',
    description: 'A slatted crib with a mattress, blanket and pillow, sized for the littlest sleepers. Sleep or nap; it is entered from the side.',
    tags: ['bed', 'crib', 'sleep', 'cleanable'], packs: ['kids-storybook', 'cozy-cottage'], tier: 'standard', price: dollars(360), quality: 3, functional: true,
    footprint: FP12, layer: 'floor', blocksMovement: true,
    slots: [sleep('sleep', cribFit.at(0.5, 0.5), 0.46, [1, 1])],
    interactions: ['sleep', 'nap'], stats: { energy: 0.7, comfort: 3, environment: 1 }, finishes: [woodR(['wood', 'woodDark']), fabricR(['carpetBlue'], 'Blanket')],
  }),
  obj(toyChestFit, {
    id: 'toy-chest', name: 'Painted Toy Chest', category: 'kids', subcategory: 'toys', rooms: ['kids', 'bedroom', 'living'], style: 'cottage',
    description: 'A wooden chest overflowing with blocks and a drum. Dig in and play for a while: great fun and a mood lift.',
    tags: ['toys', 'storage', 'play'], packs: ['kids-storybook'], tier: 'budget', price: dollars(140), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, toyChestFit, 1)],
    interactions: ['playWithToys'], stats: { fun: 1.1, environment: 1 }, finishes: [woodR(['wood', 'woodDark']), fabricR(['carpetBlue'], 'Trim')],
  }),
  obj(playBoxFit, {
    id: 'play-box', name: 'Cardboard Play Box', category: 'kids', subcategory: 'toys', rooms: ['kids', 'bedroom', 'living'], style: 'playful',
    description: 'A big open cardboard box that is a spaceship, a castle or a boat, depending on the day. Cheap, and still great fun.',
    tags: ['toys', 'play', 'box'], packs: ['kids-storybook'], tier: 'budget', price: dollars(20), quality: 1, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, playBoxFit, 1)],
    interactions: ['playWithToys'], stats: { fun: 0.9 }, finishes: [woodR(['wood', 'woodDark'])],
  }),
];

// --- Outdoor -----------------------------------------------------------------------------------
const gardenBenchFit = fit('gardenBench', FP21, 2);
const gardenChairFit = fit('gardenChair', FP11, 2);
const slatChairFit = fit('bench', FP11, 2);
const patioFit = fit('patioSet', FP22, 2);
const grillFit = fit('grill', FP11, 2);
const gardenBedFit = fit('gardenBed', FP21, 2);
const doormatFit = fit('rugDoormat', FP11, 2);
const OUTDOOR_OBJECTS: ObjectDef[] = [
  obj(gardenBenchFit, {
    id: 'bench-garden', name: 'Slatted Garden Bench', category: 'outdoor', subcategory: 'bench', rooms: ['outdoor'], style: 'cottage',
    description: 'A two-seat bench of weathered wooden slats with arms and a slanted back: for the patio, the path or the end of the garden.',
    tags: ['bench', 'seat', 'outdoor'], packs: ['garden-patio'], tier: 'standard', price: dollars(260), quality: 3, functional: true,
    footprint: FP21, layer: 'floor', blocksMovement: true,
    slots: [sit('left', gardenBenchFit.at(0.27, 0.6), 0.55, [0, 1]), sit('right', gardenBenchFit.at(0.73, 0.6), 0.55, [1, 1])],
    interactions: ['sit'], stats: { comfort: 4, environment: 2 }, finishes: [woodR(['wood', 'woodDark'])],
  }),
  obj(gardenChairFit, {
    id: 'chair-adirondack', name: 'Adirondack Chair', category: 'outdoor', subcategory: 'chair', rooms: ['outdoor'], style: 'coastal',
    description: 'A wide, reclined chair of painted slats with broad arms. Sink in with a view of the garden.',
    tags: ['chair', 'seat', 'outdoor'], packs: ['garden-patio', 'coastal-home'], tier: 'standard', price: dollars(150), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', gardenChairFit.at(0.5, 0.6), 0.4, [0, 1])],
    interactions: ['sit'], stats: { comfort: 5, environment: 1 }, finishes: [woodR(['wood', 'woodDark'])],
  }),
  obj(slatChairFit, {
    id: 'chair-slatted', name: 'Slatted Patio Chair', category: 'outdoor', subcategory: 'chair', rooms: ['outdoor', 'dining'], style: 'cottage',
    description: 'A plain wooden patio chair with a high slatted back. Light enough to move around the garden table.',
    tags: ['chair', 'seat', 'dining', 'outdoor'], packs: ['garden-patio'], tier: 'budget', price: dollars(80), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', slatChairFit.at(0.5, 0.6), 0.22 * 2, [0, -1])],
    interactions: ['sit'], stats: { comfort: 3 }, finishes: [woodR()],
  }),
  obj(patioFit, {
    id: 'table-patio', name: 'Patio Table with Parasol', category: 'outdoor', subcategory: 'table', rooms: ['outdoor', 'dining'], style: 'coastal',
    description: 'A round garden table with a striped parasol through the middle. Meals can be served here; seat people on chairs around it.',
    tags: ['table', 'dining', 'surface', 'outdoor', 'cleanable'], packs: ['garden-patio', 'coastal-home'], tier: 'standard', price: dollars(540), quality: 3, functional: true,
    footprint: FP22, layer: 'floor', blocksMovement: true, surfaceHeight: 0.76, stats: { environment: 3 },
    finishes: [region('canopy', 'Parasol', ['carpet'], FABRIC), woodR(['wood', 'woodDark'])],
  }),
  obj(grillFit, {
    id: 'grill-kettle', name: 'Kettle Barbecue', category: 'outdoor', subcategory: 'grill', rooms: ['outdoor'], style: 'classic',
    description: 'A charcoal kettle grill on legs with a wooden side shelf. Grill a plateful outdoors for $6: the quickest hot meal outside the kitchen.',
    tags: ['grill', 'cooking', 'outdoor', 'cleanable'], packs: ['garden-patio'], tier: 'standard', price: dollars(320), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, grillFit, 1)],
    interactions: ['grillFood'], stats: { cooking: 0 }, finishes: [darkMetalR('Kettle'), woodR()],
  }),
  obj(gardenBedFit, {
    id: 'planter-raised', name: 'Raised Garden Bed', category: 'outdoor', subcategory: 'planter', rooms: ['outdoor'], style: 'botanical',
    description: 'A long timber planter with rows of leafy greens and a few flowers. Water it to train Gardening.',
    tags: ['plant', 'garden', 'decor', 'outdoor'], packs: ['garden-patio', 'botanical-living'], tier: 'standard', price: dollars(180), quality: 3, functional: true,
    footprint: FP21, layer: 'floor', blocksMovement: true, interactions: ['waterPlant'], stats: { environment: 3 }, finishes: [woodR(['wood', 'woodDark'])],
  }),
  obj(doormatFit, {
    id: 'rug-doormat', name: 'Coir Doormat', category: 'outdoor', subcategory: 'mat', rooms: ['outdoor', 'living'], style: 'cottage',
    description: 'A woven doormat to stop the garden coming indoors. Decorative; people walk over it.',
    tags: ['rug', 'decor', 'outdoor'], packs: ['garden-patio', 'cozy-cottage'], tier: 'budget', price: dollars(25), quality: 2, functional: false,
    footprint: FP11, layer: 'rug', blocksMovement: false, stats: { environment: 1 }, finishes: [region('mat', 'Mat', ['wood'], WOOD)],
  }),
];

// --- Kitchen, appliances and electronics -----------------------------------------------------
const dishwasherFit = fit('dishwasher', FP11, 2, { back: 0.02 });
const fridgeBuiltIn = fit('kitchenFridgeBuiltIn', FP11, 2, { back: WALL_GAP });
const cornerRound = fit('kitchenCabinetCornerRound', FP11, KITCHEN_SCALE, { back: 0.02 });
const coffeeMachine = fit('kitchenCoffeeMachine', FP11, 2);
const toasterFit = fit('toaster', FP11, 2);
const blenderFit = fit('kitchenBlender', FP11, 2);
const laptopFit = fit('laptop', FP11, 1.5);
const shelfSpeaker = fit('speakerSmall', FP11, 1.5);
const bookStack = fit('books', FP11, 2);
const KITCHEN_3: ObjectDef[] = [
  obj(dishwasherFit, {
    id: 'dishwasher', name: 'Built-In Dishwasher', category: 'kitchen', subcategory: 'dishwasher', rooms: ['kitchen'], style: 'modern',
    description: 'A front-loading dishwasher at counter height. Dirty plates are carried here and washed in half the time of a sink. Items can stand on its worktop.',
    tags: ['dishwasher', 'dishes', 'appliance', 'plumbing', 'cleanable', 'surface'], packs: ['everyday-essentials', 'modern-minimal'], tier: 'standard', price: dollars(640), quality: 3,
    functional: true, footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(0.9), slots: [useFront('use', 0.5, dishwasherFit, 1)],
    interactions: [], stats: { hygiene: 1 }, finishes: [applianceR(['metalLight']), counterR()],
  }),
  obj(fridgeBuiltIn, {
    id: 'fridge-built-in', name: 'Built-In Fridge Cabinet', category: 'kitchen', subcategory: 'fridge', rooms: ['kitchen'], style: 'classic',
    description: 'A fridge-freezer hidden behind a wooden cabinet door. Grab a snack or gather ingredients to cook a meal.',
    tags: ['fridge', 'appliance', 'food', 'cleanable'], packs: ['classic-townhouse', 'cozy-cottage'], tier: 'standard', price: dollars(960), quality: 4, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, fridgeBuiltIn, 1)],
    interactions: ['grabSnack', 'cookMeal'], stats: { cooking: 0.5, environment: 1 }, finishes: [woodR(['wood', 'woodDark'])],
  }),
  obj(cornerRound, {
    id: 'counter-corner-round', name: 'Rounded Corner Counter', category: 'kitchen', subcategory: 'counter', rooms: ['kitchen'], style: 'classic',
    description: 'A base cabinet with a rounded front that softens the corner of an L-shaped kitchen. Same worktop height as the other modules.',
    tags: ['counter', 'surface', 'storage', 'corner', 'cleanable'], packs: ['everyday-essentials'], tier: 'budget', price: dollars(240), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(WORKTOP), finishes: [woodR(['wood']), counterR()],
  }),
  obj(coffeeMachine, {
    id: 'coffee-machine', name: 'Espresso Coffee Machine', category: 'kitchen', subcategory: 'appliance', rooms: ['kitchen', 'dining', 'study'], style: 'modern',
    description: 'A countertop coffee machine. Brew a cup for $2: a quick +12 energy and a little cheer. Stands on any counter.',
    tags: ['appliance', 'coffee', 'cleanable'], packs: ['everyday-essentials'], tier: 'standard', price: dollars(180), quality: 3, functional: true,
    footprint: FP11, layer: 'surface', blocksMovement: false, slots: [useFront('use', 0.5, null, 1)],
    interactions: ['makeCoffee'], stats: { environment: 1 }, finishes: [region('body', 'Body', ['metalMedium'], METAL_MEDIUM)],
  }),
  obj(toasterFit, {
    id: 'toaster', name: 'Two-Slice Toaster', category: 'kitchen', subcategory: 'appliance', rooms: ['kitchen'], style: 'classic',
    description: 'A chrome two-slice toaster. Pop a slice in for $1 and get a quick +15 hunger. Stands on any counter.',
    tags: ['appliance', 'toaster'], packs: ['everyday-essentials'], tier: 'budget', price: dollars(40), quality: 2, functional: true,
    footprint: FP11, layer: 'surface', blocksMovement: false, slots: [useFront('use', 0.5, null, 1)],
    interactions: ['makeToast'], stats: {}, finishes: [region('body', 'Body', ['metal'], METAL)],
  }),
  obj(blenderFit, {
    id: 'blender', name: 'Smoothie Blender', category: 'kitchen', subcategory: 'appliance', rooms: ['kitchen'], style: 'modern',
    description: 'A tall blender with a glass jug. Whizz up a smoothie for $3: +20 hunger and a little energy. Stands on any counter.',
    tags: ['appliance', 'blender'], packs: ['everyday-essentials', 'modern-minimal'], tier: 'budget', price: dollars(70), quality: 2, functional: true,
    footprint: FP11, layer: 'surface', blocksMovement: false, slots: [useFront('use', 0.5, null, 1)],
    interactions: ['blendSmoothie'], stats: {}, finishes: [region('body', 'Body', ['metalMedium'], METAL_MEDIUM)],
  }),
];

const ELECTRONICS_3: ObjectDef[] = [
  obj(laptopFit, {
    id: 'laptop', name: 'Laptop Computer', category: 'electronics', subcategory: 'computer', rooms: ['study', 'living', 'bedroom'], style: 'modern',
    description: 'A slim laptop for games and programming practice that works on any table, desk or counter. Users take a chair in front of it.',
    tags: ['computer', 'electronics', 'laptop'], packs: ['modern-minimal', 'creative-studio'], tier: 'standard', price: dollars(750), quality: 3, functional: true,
    footprint: FP11, layer: 'surface', blocksMovement: false, slots: [useFront('use', 0.5, null, 1)],
    interactions: ['playComputerGames', 'practiceProgramming'], stats: { fun: 0.9, skill: 0.9 }, finishes: [darkMetalR('Case')],
  }),
  obj(shelfSpeaker, {
    id: 'speaker-shelf', name: 'Bookshelf Speaker', category: 'electronics', subcategory: 'audio', rooms: ['living', 'study', 'bedroom'], style: 'classic',
    description: 'A compact wooden speaker for a shelf or desk. Stand nearby and listen: a better sound than a radio, in half the space of a tower speaker.',
    tags: ['speaker', 'music', 'electronics'], packs: ['everyday-essentials', 'creative-studio'], tier: 'standard', price: dollars(240), quality: 3, functional: true,
    footprint: FP11, layer: 'surface', blocksMovement: false,
    interactions: ['listenToMusic'], stats: { fun: 1.1, skill: 1.05 }, finishes: [woodR()],
  }),
  obj(bookStack, {
    id: 'books-stack', name: 'Stack of Paperbacks', category: 'decor', subcategory: 'books', rooms: ['living', 'study', 'bedroom'], style: 'classic',
    description: 'A neat pile of well-thumbed paperbacks for a coffee table or nightstand. Take one and read it in a nearby seat.',
    tags: ['books', 'decor'], packs: ['everyday-essentials'], tier: 'budget', price: dollars(30), quality: 2, functional: true,
    footprint: FP11, layer: 'surface', blocksMovement: false, slots: [useFront('use', 0.5, null, 1)],
    interactions: ['readBook'], stats: { fun: 0.8, skill: 0.8, environment: 1 }, finishes: [],
  }),
];

// --- Seating, tables, bathroom and decor -------------------------------------------------------
const sofaDesignCorner = fit('loungeDesignSofaCorner', FP22, 1.45);
const ottomanFit = fit('loungeSofaOttoman', FP11, 2);
const lowBenchFit = fit('benchCushionLow', FP11, 2);
const chairModern = fit('chairModernCushion', FP11, 2);
const chairFrame = fit('chairModernFrameCushion', FP11, 2);
const clothTable = fit('tableCloth', FP21, 0.66 / 0.3267);
const squareBasin = fit('bathroomSinkSquare', FP11, 1.7, { back: WALL_GAP });
const smallPlant = fit('plantSmall3', FP11, 2);
const wallCoatRack = fit('coatRack', FP11, 2, { back: WALL_GAP, lift: 1.5 });
const HOME_3: ObjectDef[] = [
  obj(sofaDesignCorner, {
    id: 'sofa-corner-designer', name: 'Designer Corner Sofa', category: 'seating', subcategory: 'sofa', rooms: ['living'], style: 'modern',
    description: 'A slim L-shaped sofa on steel legs with deep blue cushions. Three seats facing the open inside of the L.',
    tags: ['sofa', 'seat', 'sectional', 'corner'], packs: ['modern-minimal', 'mid-century'], tier: 'luxury', price: dollars(2350), quality: 5, functional: true,
    footprint: FP22, layer: 'floor', blocksMovement: true, openCells: [[0, 1]],
    slots: [
      sit('left', sofaDesignCorner.at(0.25, 0.19), 0.23 * 1.45, [0, 1]), sit('corner', sofaDesignCorner.at(0.82, 0.19), 0.23 * 1.45, [0, 1], -Math.PI / 4),
      sit('right', sofaDesignCorner.at(0.82, 0.68), 0.23 * 1.45, [0, 1], -Math.PI / 2),
    ],
    interactions: ['sit', 'nap'], stats: { comfort: 9, energy: 0.9, environment: 3 }, finishes: [fabricR(['carpetBlue']), metalR(['metal'])],
  }),
  obj(ottomanFit, {
    id: 'ottoman-cushion', name: 'Cushioned Ottoman', category: 'seating', subcategory: 'stool', rooms: ['living', 'bedroom', 'kids'], style: 'classic',
    description: 'A big square footstool with a padded top on short legs: extra seating when friends come over, or a place to put your feet up.',
    tags: ['ottoman', 'seat'], packs: ['everyday-essentials', 'kids-storybook'], tier: 'budget', price: dollars(110), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', ottomanFit.at(0.5, 0.5), 0.23 * 2, [0, 1])],
    interactions: ['sit'], stats: { comfort: 3 }, finishes: [fabricR(['carpet'], 'Cushion'), woodR()],
  }),
  obj(lowBenchFit, {
    id: 'bench-low-cushion', name: 'Low Cushioned Bench', category: 'seating', subcategory: 'bench', rooms: ['living', 'kids', 'bedroom'], style: 'mid-century',
    description: 'A low bench with a thick cushion on tapered legs: for the foot of a bed, a play corner or a window nook.',
    tags: ['bench', 'seat'], packs: ['mid-century', 'kids-storybook'], tier: 'budget', price: dollars(130), quality: 2, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', lowBenchFit.at(0.5, 0.55), 0.19 * 2, [0, 1])],
    interactions: ['sit'], stats: { comfort: 3, environment: 1 }, finishes: [fabricR(['carpet'], 'Cushion'), woodR()],
  }),
  obj(chairModern, {
    id: 'chair-modern-cushion', name: 'Modern Cushion Chair', category: 'seating', subcategory: 'chair', rooms: ['dining', 'kitchen', 'study'], style: 'modern',
    description: 'A white-framed dining chair with a blue seat pad. Slip it under a table; diners come in from behind.',
    tags: ['chair', 'seat', 'dining'], packs: ['modern-minimal'], tier: 'standard', price: dollars(130), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', chairModern.at(0.5, 0.6), 0.23 * 2, [0, -1])],
    interactions: ['sit'], stats: { comfort: 4 }, finishes: [fabricR(['carpetBlue'], 'Seat pad'), metalR(['metal'])],
  }),
  obj(chairFrame, {
    id: 'chair-modern-frame', name: 'Cantilever Frame Chair', category: 'seating', subcategory: 'chair', rooms: ['dining', 'kitchen', 'study'], style: 'modern',
    description: 'A sculptural frame chair on a single curved leg with a padded seat. Slip it under a table; diners come in from behind.',
    tags: ['chair', 'seat', 'dining'], packs: ['modern-minimal', 'mid-century'], tier: 'standard', price: dollars(150), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [sit('seat', chairFrame.at(0.5, 0.6), 0.23 * 2, [0, -1])],
    interactions: ['sit'], stats: { comfort: 4, environment: 1 }, finishes: [fabricR(['carpetBlue'], 'Seat pad'), metalR(['metal'])],
  }),
  obj(clothTable, {
    id: 'table-dining-cloth', name: 'Runner-Cloth Dining Table', category: 'tables', subcategory: 'dining', rooms: ['dining', 'kitchen'], style: 'cottage',
    description: 'A four-seat table with a bright woven runner down the middle. Meals can be served here, and diners sit at chairs pushed up to it.',
    tags: ['table', 'dining', 'surface', 'cleanable'], packs: ['cozy-cottage'], tier: 'standard', price: dollars(460), quality: 3, functional: true,
    footprint: FP21, layer: 'floor', blocksMovement: true, surfaceHeight: 0.66, stats: { environment: 2 }, finishes: [woodR(), fabricR(['carpet'], 'Runner')],
  }),
  obj(squareBasin, {
    id: 'bathroom-sink-square', name: 'Square Wall Basin', category: 'bathroom', subcategory: 'sink', rooms: ['bathroom'], style: 'modern',
    description: 'A squared-off ceramic washbasin with a deep bowl. Wash your hands, or carry dirty dishes here when there is no kitchen sink.',
    tags: ['sink', 'fixture', 'plumbing', 'cleanable'], packs: ['modern-minimal'], tier: 'standard', price: dollars(240), quality: 3, functional: true,
    footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, squareBasin, 1)],
    interactions: ['washHands'], stats: { hygiene: 1, environment: 1 }, finishes: [],
  }),
  obj(smallPlant, {
    id: 'plant-fern-pot', name: 'Potted Fern', category: 'decor', subcategory: 'plant', rooms: ['living', 'kitchen', 'bathroom', 'study', 'bedroom', 'outdoor'], style: 'botanical',
    description: 'A little green fern in a wooden pot for sills, shelves and tables. Give it a drink now and then.',
    tags: ['plant', 'decor', 'garden'], packs: ['botanical-living'], tier: 'budget', price: dollars(18), quality: 2, functional: true,
    footprint: FP11, layer: 'surface', blocksMovement: false, interactions: ['waterPlant'], stats: { environment: 1 }, finishes: [woodR()],
  }),
  obj(wallCoatRack, {
    id: 'coat-rack-wall', name: 'Wall Coat Rack', category: 'storage', subcategory: 'coat-rack', rooms: ['living', 'bedroom'], style: 'cottage',
    description: 'A wooden board with brass hooks and a little shelf, for the hallway wall. Decorative.',
    tags: ['coat-rack', 'decor', 'wall'], packs: ['cozy-cottage', 'everyday-essentials'], tier: 'budget', price: dollars(55), quality: 2, functional: false,
    footprint: FP11, layer: 'wall', needsWall: true, blocksMovement: false, stats: { environment: 1 }, finishes: [woodR(), metalR(['metalMedium'])],
  }),
];

/** Every buy-mode object definition (ready and in development). */
export const OBJECTS: ObjectDef[] = [
  ...BEDS, ...BEDROOM, ...KITCHEN, ...SEATING_AND_TABLES, ...ELECTRONICS, ...BATHROOM, ...STUDY, ...DECOR,
  ...SEATING_2, ...TABLES_STORAGE_2, ...KITCHEN_2, ...BATHROOM_2, ...LIGHTING_2, ...DECOR_2,
  ...HOBBY_OBJECTS, ...KIDS_OBJECTS, ...OUTDOOR_OBJECTS, ...KITCHEN_3, ...ELECTRONICS_3, ...HOME_3,
];

