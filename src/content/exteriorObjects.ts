// Milestone 9 exterior objects: sixteen garden objects (outdoor category) and twelve staircases (category 'stairs'). The models are
// original low-poly GLBs built by tools/exterior (node tools/build-exterior.mjs), authored in metres inside their footprints, so the
// fit is simply scale 2 (GLB units are half metres) with no offset; EXTERIOR_BOUNDS (generated) holds the measured bounds.
//
// Gardening: the vegetable patch, fruit tree and herb planter grow crops (content/exterior.ts CROPS, sim/garden.ts); everything with
// a plant offers the existing Water Plant interaction. Staircases carry ObjectDef.stair (world/levels.ts has the walking rules): a
// straight stair rises toward -z, one tread per tile; a spiral fills 2 x 2 with a quarter per walked cell.

import { dollars } from '../core/money';
import { EXTERIOR_BOUNDS } from './exteriorModels';
import type { FinishRegion, ObjectDef, ObjectSlot, PriceTier, StairSpec, Swatch } from './types';

type Vec3 = [number, number, number];

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The model transform of an exterior asset: GLB units are half metres, so scale 2 and no offset (`lift` raises wall mountings). */
function fitExterior(asset: string, lift = 0): { model: ObjectDef['model']; height: number } {
  const b = EXTERIOR_BOUNDS[asset];
  if (!b) throw new Error(`exteriorObjects: no bounds for ${asset} (run node tools/build-exterior.mjs)`);
  return { model: { asset, scale: 2, yaw: 0, offset: [0, lift, 0] as Vec3 }, height: r3(b[1][1] * 2 + lift) };
}

const sw = (id: string, name: string, color: string): Swatch => ({ id, name, color });
const region = (id: string, label: string, materials: string[], swatches: Swatch[]): FinishRegion => ({ id, label, materials, swatches });

const WOOD: Swatch[] = [
  sw('honey-oak', 'Honey Oak', '#e59a64'), sw('natural-ash', 'Natural Ash', '#e8cba2'), sw('walnut', 'Walnut', '#8a5a3c'),
  sw('cherry', 'Cherry', '#a8553a'), sw('ebony', 'Ebony', '#3d302b'), sw('whitewash', 'Whitewash', '#ece6dc'),
  sw('sage-paint', 'Sage Paint', '#9db59a'), sw('navy-paint', 'Navy Paint', '#34496b'),
];
const WOOD_DARK: Swatch[] = [
  sw('dark-oak', 'Dark Oak', '#ad744c'), sw('walnut', 'Walnut', '#6f4830'), sw('ebony', 'Ebony', '#30261f'), sw('teak', 'Teak', '#b98450'),
  sw('grey-oak', 'Grey Oak', '#8c867b'), sw('white', 'White Paint', '#e4ddcf'), sw('sage', 'Sage Paint', '#7f997c'),
];
const STONE: Swatch[] = [
  sw('granite', 'Granite', '#a8a399'), sw('sandstone', 'Sandstone', '#cdb892'), sw('slate', 'Slate', '#6c7378'), sw('limestone', 'Limestone', '#d9d3c3'),
  sw('fieldstone', 'Fieldstone', '#b3a08a'), sw('marble', 'White Marble', '#ece9e4'),
];
const STONE_DARK: Swatch[] = [
  sw('graphite', 'Graphite', '#707070'), sw('basalt', 'Basalt', '#4b4d52'), sw('umber', 'Umber', '#8a7a67'), sw('slate', 'Slate', '#59626a'),
  sw('moss', 'Mossy', '#76806a'), sw('sand', 'Sand', '#b8a98b'),
];
const METAL: Swatch[] = [
  sw('steel', 'Brushed Steel', '#bdd2d6'), sw('matte-black', 'Matte Black', '#2e3034'), sw('brass', 'Brass', '#c6a45a'),
  sw('copper', 'Copper', '#b87350'), sw('white-enamel', 'White Enamel', '#f0eeea'), sw('graphite', 'Graphite', '#5c6168'),
];
const METAL_DARK: Swatch[] = [
  sw('dark-slate', 'Dark Slate', '#4e6363'), sw('matte-black', 'Matte Black', '#2e3034'), sw('bronze', 'Bronze', '#7b5e38'),
  sw('forest', 'Forest Green', '#2f5a45'), sw('oxide', 'Oxide Red', '#7a3b30'), sw('steel', 'Brushed Steel', '#bdd2d6'),
];
const BLOOMS: Swatch[] = [
  sw('coral', 'Coral', '#f05e57'), sw('poppy', 'Poppy Red', '#d6322e'), sw('sunset', 'Sunset Orange', '#f08a3c'), sw('sunny', 'Sunny', '#f2c84a'),
  sw('violet', 'Violet', '#8e5fc2'), sw('blush', 'Blush', '#e6a9a0'), sw('cornflower', 'Cornflower', '#5b84dd'),
];
const PAINT: Swatch[] = [
  sw('white', 'Gloss White', '#f4f1ea'), sw('cream', 'Cream', '#e8dcc0'), sw('sage', 'Sage', '#9db59a'), sw('sky', 'Sky', '#8fb4d6'),
  sw('charcoal', 'Charcoal', '#4a4a50'), sw('blush', 'Blush', '#e6a9a0'),
];
const TERRACOTTA: Swatch[] = [
  sw('terracotta', 'Terracotta', '#c2663f'), sw('clay', 'Clay', '#a0623f'), sw('sand', 'Sand', '#d6b98a'), sw('white', 'Whitewash', '#ece6dc'),
  sw('slate', 'Slate Blue', '#5d6f86'), sw('moss', 'Moss Glaze', '#6f8a63'),
];
const STRAW: Swatch[] = [
  sw('golden', 'Golden Straw', '#dcbd5c'), sw('pale', 'Pale Straw', '#e8d79a'), sw('weathered', 'Weathered', '#a8946a'), sw('green', 'Hay Green', '#9aa860'),
  sw('rust', 'Rust', '#b87a45'), sw('grey', 'Grey', '#9c9588'),
];

type Base = Omit<ObjectDef, 'model' | 'height' | 'status' | 'packs' | 'stats' | 'finishes' | 'slots' | 'interactions' | 'category' | 'rooms' | 'blocksMovement' | 'layer' | 'functional' | 'tier'> &
  Partial<Pick<ObjectDef, 'status' | 'packs' | 'stats' | 'finishes' | 'slots' | 'interactions' | 'rooms' | 'blocksMovement' | 'layer' | 'functional' | 'category'>> & { tier?: PriceTier };

const tierOf = (price: number): PriceTier => (price < dollars(150) ? 'budget' : price < dollars(600) ? 'standard' : price < dollars(1500) ? 'premium' : 'luxury');

function garden(asset: string, d: Base, lift = 0): ObjectDef {
  const f = fitExterior(asset, lift);
  return {
    category: 'outdoor', rooms: ['outdoor'], packs: ['garden-patio', 'botanical-living'], layer: 'floor', blocksMovement: true, functional: false,
    slots: [], interactions: [], stats: {}, finishes: [], status: 'ready', tier: tierOf(d.price), ...d, model: f.model, height: f.height,
  };
}

const FP11 = { w: 1, d: 1 }, FP21 = { w: 2, d: 1 }, FP22 = { w: 2, d: 2 };
const WATER = ['waterPlant'];
const CROP = ['gardenPlant', 'gardenWater', 'gardenWeed', 'gardenHarvest'];

/** The garden objects. */
export const GARDEN_OBJECTS: ObjectDef[] = [
  garden('gardenFlowerbed', {
    id: 'garden-flowerbed', name: 'Cottage Flower Bed', subcategory: 'flowers', style: 'cottage',
    description: 'A timber-framed bed brimming with mixed blooms. Water it to train Gardening; it brightens any lawn.',
    tags: ['plant', 'flowers', 'garden', 'decor', 'outdoor'], price: dollars(160), quality: 3, functional: true,
    footprint: FP21, interactions: WATER, stats: { environment: 4 }, finishes: [region('wood', 'Frame', ['wood', 'woodDark'], WOOD), region('blooms', 'Blooms', ['carpet'], BLOOMS)],
  }),
  garden('gardenFlowerbedRound', {
    id: 'garden-flowerbed-round', name: 'Round Flower Bed', subcategory: 'flowers', style: 'classic',
    description: 'A stone-ringed island of flowers, a neat focal point for a path junction or a lawn.',
    tags: ['plant', 'flowers', 'garden', 'decor', 'outdoor'], price: dollars(110), quality: 3, functional: true,
    footprint: FP11, interactions: WATER, stats: { environment: 3 }, finishes: [region('stone', 'Stone ring', ['stone'], STONE), region('blooms', 'Blooms', ['carpet'], BLOOMS)],
  }),
  garden('gardenHedge', {
    id: 'garden-hedge', name: 'Clipped Hedge', subcategory: 'hedge', style: 'classic',
    description: 'A block of neatly clipped hedge. Line them up for a living wall, or use one as a tidy corner.',
    tags: ['plant', 'hedge', 'garden', 'decor', 'outdoor'], price: dollars(60), quality: 2,
    footprint: FP11, stats: { environment: 2 }, finishes: [],
  }),
  garden('gardenTopiary', {
    id: 'garden-topiary', name: 'Topiary Ball', subcategory: 'topiary', style: 'classic',
    description: 'A clipped boxwood ball on a stem in a terracotta pot. Formal gardens love a pair.',
    tags: ['plant', 'topiary', 'garden', 'decor', 'outdoor'], price: dollars(95), quality: 3, functional: true,
    footprint: FP11, interactions: WATER, stats: { environment: 3 }, finishes: [region('pot', 'Pot', ['terracotta'], TERRACOTTA)],
  }),
  garden('gardenVegpatch', {
    id: 'garden-vegpatch', name: 'Vegetable Patch', subcategory: 'kitchen-garden', style: 'cottage',
    description: 'A raised timber bed for growing tomatoes, carrots, lettuce, pumpkins and strawberries. Plant, water, weed and harvest: the crop is ripe in 3 to 7 game days.',
    tags: ['plant', 'garden', 'vegetable', 'crop', 'outdoor'], price: dollars(240), quality: 3, functional: true,
    footprint: FP22, interactions: CROP, stats: { environment: 2 }, finishes: [region('wood', 'Frame', ['wood', 'woodDark'], WOOD)],
  }),
  garden('gardenFruitTree', {
    id: 'garden-fruit-tree', name: 'Orchard Tree', subcategory: 'fruit-tree', style: 'botanical',
    description: 'A young fruit tree that bears apples or lemons. Water it, and pick the fruit when it ripens, again and again.',
    tags: ['tree', 'plant', 'garden', 'fruit', 'crop', 'outdoor'], price: dollars(380), quality: 3, functional: true,
    footprint: FP22, interactions: CROP, stats: { environment: 5 }, finishes: [region('bark', 'Bark', ['woodDark'], WOOD_DARK), region('ring', 'Tree ring', ['stone'], STONE)],
  }),
  garden('gardenHerbPlanter', {
    id: 'garden-herb-planter', name: 'Herb Planter', subcategory: 'kitchen-garden', style: 'cottage',
    description: 'A little timber box for basil, mint and rosemary. The herbs grow back after every harvest.',
    tags: ['plant', 'garden', 'herb', 'crop', 'outdoor'], price: dollars(75), quality: 2, functional: true,
    footprint: FP11, interactions: CROP, stats: { environment: 1 }, finishes: [region('wood', 'Wood', ['wood', 'woodDark'], WOOD)],
  }),
  garden('gardenPond', {
    id: 'garden-pond', name: 'Garden Pond', subcategory: 'water', style: 'botanical',
    description: 'A rim of stones around still water with lily pads, reeds and a flowering lily: instant calm.',
    tags: ['pond', 'water', 'plant', 'decor', 'outdoor', 'garden'], price: dollars(520), quality: 4,
    footprint: FP22, stats: { environment: 6 }, finishes: [region('stone', 'Stones', ['stone'], STONE), region('rock', 'Rock', ['stoneDark'], STONE_DARK)],
  }),
  garden('gardenBirdbath', {
    id: 'garden-birdbath', name: 'Stone Bird Bath', subcategory: 'water', style: 'classic',
    description: 'A pedestal bowl where small birds drink and splash. Peaceful to look at.',
    tags: ['water', 'decor', 'outdoor', 'garden'], price: dollars(130), quality: 3,
    footprint: FP11, stats: { environment: 3 }, finishes: [region('stone', 'Stone', ['stone'], STONE)],
  }),
  garden('gardenTrellis', {
    id: 'garden-trellis', name: 'Rose Trellis', subcategory: 'climber', style: 'cottage',
    description: 'A freestanding timber trellis wreathed in climbing roses. Water it to train Gardening.',
    tags: ['plant', 'flowers', 'trellis', 'garden', 'decor', 'outdoor'], price: dollars(150), quality: 3, functional: true,
    footprint: FP11, interactions: WATER, stats: { environment: 4 }, finishes: [region('wood', 'Timber', ['wood', 'woodDark'], WOOD), region('pot', 'Pot', ['terracotta'], TERRACOTTA)],
  }),
  garden('gardenHangingBasket', {
    id: 'garden-hanging-basket', name: 'Hanging Basket', subcategory: 'flowers', style: 'cottage',
    description: 'A basket of trailing flowers on an iron bracket. Hangs on an outside wall.',
    tags: ['plant', 'flowers', 'garden', 'decor', 'outdoor'], price: dollars(45), quality: 2, functional: true,
    footprint: FP11, layer: 'wall', blocksMovement: false, interactions: WATER, stats: { environment: 2 },
    finishes: [region('bracket', 'Bracket', ['metalDark'], METAL_DARK), region('pot', 'Basket', ['terracotta'], TERRACOTTA)],
    needsWall: true,
  }, 1.6),
  garden('gardenCompost', {
    id: 'garden-compost', name: 'Compost Bin', subcategory: 'utility', style: 'rustic',
    description: 'A slatted timber bin where kitchen scraps turn into black gold.',
    tags: ['garden', 'decor', 'outdoor', 'compost'], price: dollars(70), quality: 2,
    footprint: FP11, stats: { environment: 0 }, finishes: [region('wood', 'Slats', ['wood', 'woodDark'], WOOD)],
  }),
  garden('gardenScarecrow', {
    id: 'garden-scarecrow', name: 'Scarecrow', subcategory: 'statue', style: 'rustic',
    description: 'A straw-stuffed scarecrow in a blue shirt and a floppy hat, guarding the vegetables.',
    tags: ['garden', 'decor', 'outdoor', 'whimsy'], price: dollars(85), quality: 2,
    footprint: FP11, stats: { environment: 2 }, finishes: [region('shirt', 'Shirt', ['carpetBlue'], BLOOMS), region('straw', 'Straw', ['straw'], STRAW)],
  }),
  garden('gardenLantern', {
    id: 'garden-lantern', name: 'Path Lantern', subcategory: 'lighting', style: 'classic', category: 'outdoor',
    description: 'A cast-iron lantern post that lights the garden path at night.',
    tags: ['lamp', 'light', 'decor', 'outdoor', 'garden'], price: dollars(120), quality: 3,
    footprint: FP11, stats: { environment: 3 }, finishes: [region('iron', 'Iron', ['metalDark'], METAL_DARK)],
  }),
  garden('gardenGnome', {
    id: 'garden-gnome', name: 'Garden Gnome', subcategory: 'statue', style: 'playful',
    description: 'A grinning gnome with a pointy red hat and a tiny watering can. Local legend says he rearranges himself at night.',
    tags: ['garden', 'decor', 'outdoor', 'whimsy'], price: dollars(40), quality: 2,
    footprint: FP11, stats: { environment: 1 }, finishes: [region('coat', 'Coat', ['carpetBlue'], BLOOMS), region('plinth', 'Plinth', ['stone'], STONE)],
  }),
  garden('gardenArbour', {
    id: 'garden-arbour', name: 'Garden Arbour with Bench', subcategory: 'structure', style: 'cottage',
    description: 'A timber arbour wreathed in climbing plants, with a bench for two to sit under the leaves.',
    tags: ['bench', 'seat', 'plant', 'garden', 'structure', 'outdoor'], price: dollars(680), quality: 4, functional: true,
    footprint: FP21,
    slots: ([
      { id: 'seat-a', kind: 'sit', pos: [0.8, 0.5], height: 0.5, facing: 0, approach: [0, 1], posture: 'seated' },
      { id: 'seat-b', kind: 'sit', pos: [1.2, 0.5], height: 0.5, facing: 0, approach: [1, 1], posture: 'seated' },
    ] satisfies ObjectSlot[]),
    interactions: ['sit'], stats: { comfort: 4, environment: 5 }, finishes: [region('wood', 'Timber', ['wood', 'woodDark'], WOOD)],
  }),
];

// ---------------------------------------------------------------------------------------------
// Staircases
// ---------------------------------------------------------------------------------------------

function stair(asset: string, spec: StairSpec, d: Base & { footprint: { w: number; d: number } }): ObjectDef {
  const f = fitExterior(asset);
  const { footprint } = d;
  return {
    category: 'stairs', rooms: ['living', 'bedroom', 'kitchen', 'outdoor'], packs: ['everyday-essentials'], layer: 'floor', blocksMovement: true, functional: false,
    slots: [], interactions: [], stats: { environment: 1 }, finishes: [], status: 'ready', tier: tierOf(d.price), ...d, footprint, stair: spec, model: f.model, height: f.height,
  };
}

/** The twelve staircase designs: eight straight and four spiral. */
export const STAIR_OBJECTS: ObjectDef[] = [
  stair('stairOakOpen', { length: 3, kind: 'straight' }, {
    id: 'stair-oak-open', name: 'Open-Riser Oak Stair', subcategory: 'straight', style: 'classic', footprint: { w: 1, d: 3 },
    description: 'Oak treads on dark stringers with spindle balusters and a heavy handrail.', tags: ['stairs', 'wood', 'spindle'], packs: ['classic-townhouse', 'cozy-cottage'],
    price: dollars(780), quality: 3, finishes: [region('wood', 'Treads and spindles', ['wood'], WOOD), region('frame', 'Stringers and rail', ['woodDark'], WOOD_DARK)],
  }),
  stair('stairOakClosed', { length: 4, kind: 'straight' }, {
    id: 'stair-oak-closed', name: 'Painted-Riser Stair', subcategory: 'straight', style: 'classic', footprint: { w: 1, d: 4 },
    description: 'Oak treads over white closed risers with white spindles: a long, gentle family staircase.', tags: ['stairs', 'wood', 'spindle'], packs: ['classic-townhouse', 'cozy-cottage'],
    price: dollars(920), quality: 3, finishes: [region('wood', 'Treads and rail', ['wood'], WOOD), region('paint', 'Painted parts', ['carpetWhite'], PAINT)],
  }),
  stair('stairWhitePainted', { length: 3, kind: 'straight' }, {
    id: 'stair-white-painted', name: 'Whitewashed Stair', subcategory: 'straight', style: 'coastal', footprint: { w: 1, d: 3 },
    description: 'Painted steps and a slim steel balustrade: bright, simple and good for small hallways.', tags: ['stairs', 'painted'], packs: ['coastal-home', 'everyday-essentials'],
    price: dollars(620), quality: 2, finishes: [region('paint', 'Paint', ['carpetWhite'], PAINT), region('metal', 'Rail', ['metal'], METAL), region('wood', 'Handrail', ['wood'], WOOD)],
  }),
  stair('stairFloating', { length: 4, kind: 'straight' }, {
    id: 'stair-floating', name: 'Floating Stair', subcategory: 'straight', style: 'modern', footprint: { w: 1, d: 4 },
    description: 'Thick oak treads cantilevered from a single steel spine, with a glass balustrade.', tags: ['stairs', 'glass', 'steel'], packs: ['modern-minimal'],
    price: dollars(1850), quality: 4, finishes: [region('wood', 'Treads', ['wood'], WOOD), region('steel', 'Spine', ['metalDark'], METAL_DARK), region('rail', 'Handrail', ['metal'], METAL)],
  }),
  stair('stairIndustrial', { length: 3, kind: 'straight' }, {
    id: 'stair-industrial', name: 'Steel Mesh Stair', subcategory: 'straight', style: 'industrial', footprint: { w: 1, d: 3 },
    description: 'A fabricated steel stair with open treads and pipe rails. Loud under work boots.', tags: ['stairs', 'steel', 'industrial'], packs: ['industrial-loft'],
    price: dollars(540), quality: 3, finishes: [region('treads', 'Treads', ['metalDark'], METAL_DARK), region('steel', 'Frame and rails', ['metal'], METAL)],
  }),
  stair('stairStone', { length: 3, kind: 'straight' }, {
    id: 'stair-stone', name: 'Stone Stair', subcategory: 'straight', style: 'classic', footprint: { w: 1, d: 3 },
    description: 'Solid blocks of stone with low parapet walls, at home in a courtyard or a cellar-to-garden entry.', tags: ['stairs', 'stone'], packs: ['classic-townhouse', 'garden-patio'],
    price: dollars(1150), quality: 4, finishes: [region('stone', 'Stone', ['stone'], STONE), region('cap', 'Coping', ['stoneDark'], STONE_DARK)],
  }),
  stair('stairGrand', { length: 4, kind: 'straight' }, {
    id: 'stair-grand', name: 'Grand Double-Width Stair', subcategory: 'straight', style: 'classic', footprint: { w: 2, d: 4 },
    description: 'A two-tile-wide staircase in rich wood with dark risers and a turned balustrade on both sides. Room for two to pass.', tags: ['stairs', 'wood', 'spindle', 'wide'], packs: ['classic-townhouse'],
    price: dollars(2400), quality: 5, finishes: [region('wood', 'Treads and spindles', ['wood'], WOOD), region('dark', 'Risers and rails', ['woodDark'], WOOD_DARK)],
  }),
  stair('stairCabin', { length: 3, kind: 'straight' }, {
    id: 'stair-cabin', name: 'Log Cabin Stair', subcategory: 'straight', style: 'rustic', footprint: { w: 1, d: 3 },
    description: 'Log-and-plank steps between rough stringers, with a rope rail.', tags: ['stairs', 'wood', 'rustic'], packs: ['cozy-cottage'],
    price: dollars(430), quality: 2, finishes: [region('wood', 'Logs and planks', ['wood'], WOOD), region('frame', 'Stringers and posts', ['woodDark'], WOOD_DARK), region('rope', 'Rope', ['straw'], STRAW)],
  }),
  stair('stairSpiralIron', { length: 3, kind: 'spiral' }, {
    id: 'stair-spiral-iron', name: 'Iron Spiral Stair', subcategory: 'spiral', style: 'classic', footprint: { w: 2, d: 2 },
    description: 'A cast-iron spiral around a central pole: three quarters up, and the smallest footprint of any stair.', tags: ['stairs', 'iron', 'spiral'], packs: ['industrial-loft', 'classic-townhouse'],
    price: dollars(680), quality: 3, finishes: [region('iron', 'Iron', ['metalDark'], METAL_DARK), region('rail', 'Handrail', ['wood'], WOOD)],
  }),
  stair('stairSpiralWood', { length: 4, kind: 'spiral' }, {
    id: 'stair-spiral-wood', name: 'Oak Spiral Stair', subcategory: 'spiral', style: 'cottage', footprint: { w: 2, d: 2 },
    description: 'Wedge-shaped oak steps winding around a turned pole, with a full turn of handrail.', tags: ['stairs', 'wood', 'spiral'], packs: ['cozy-cottage'],
    price: dollars(1280), quality: 4, finishes: [region('wood', 'Steps and handrail', ['wood'], WOOD), region('pole', 'Pole and balusters', ['woodDark'], WOOD_DARK)],
  }),
  stair('stairSpiralGlass', { length: 4, kind: 'spiral' }, {
    id: 'stair-spiral-glass', name: 'Glass Spiral Stair', subcategory: 'spiral', style: 'modern', footprint: { w: 2, d: 2 },
    description: 'Steel pole, oak steps and a curved glass balustrade for an airy, modern turn.', tags: ['stairs', 'glass', 'spiral', 'steel'], packs: ['modern-minimal'],
    price: dollars(2150), quality: 5, finishes: [region('wood', 'Steps', ['wood'], WOOD), region('steel', 'Steel', ['metal'], METAL)],
  }),
  stair('stairSpiralStone', { length: 3, kind: 'spiral' }, {
    id: 'stair-spiral-stone', name: 'Stone Spiral Stair', subcategory: 'spiral', style: 'classic', footprint: { w: 2, d: 2 },
    description: 'Cut stone steps around a stone newel with an iron handrail, a tower stair in miniature.', tags: ['stairs', 'stone', 'spiral'], packs: ['classic-townhouse', 'garden-patio'],
    price: dollars(1560), quality: 4, finishes: [region('stone', 'Steps', ['stone'], STONE), region('newel', 'Newel', ['stoneDark'], STONE_DARK), region('rail', 'Handrail', ['metalDark'], METAL_DARK)],
  }),
];

/** Every exterior ObjectDef (the registry in content/index.ts adds them to the catalogue). */
export const EXTERIOR_OBJECTS: ObjectDef[] = [...GARDEN_OBJECTS, ...STAIR_OBJECTS];
