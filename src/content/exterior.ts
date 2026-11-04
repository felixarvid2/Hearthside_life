// Milestone 9 exterior content: fence and gate designs, roof styles and finishes, terrain paints, garden crops and
// the gardening interactions. Garden objects and staircases (ObjectDefs) are in exteriorObjects.ts.
//
// - Fences and gates (FenceDef) are edge-based (Lot.fences). A gate is a FenceDef whose id starts with 'gate-'
//   (world/fences.ts isGateDef); everything else blocks movement. `style` names the procedural archetype
//   (world/fencePieces.ts builds the pieces), `variants` are colour sets (Fence.variant is the index).
// - Roof styles (RoofStyleDef) are built procedurally by world/roofs.ts; finishes (RoofFinishDef) are referenced by
//   Roof.finish as { designId: finish id, paletteId: palette id }.
// - Terrain paints (TerrainPaintDef) are stored per level-0 tile in Lot.terrain.
// - Crops (CropDef) drive sim/garden.ts.
// Prices are integer cents. Everything here is pure data.

import { dollars } from '../core/money';
import type { Cents, Hex } from '../core/types';
import type { InteractionDef, PriceTier } from './types';

export interface FenceVariant { id: string; name: string; main: Hex; accent: Hex }

export interface FenceDef {
  id: string;
  name: string;
  description: string;
  kind: 'fence' | 'gate';
  /** Procedural archetype (world/fencePieces.ts). */
  style: string;
  /** Height in metres. */
  height: number;
  /** Price of one edge (one tile length). */
  price: Cents;
  tier: PriceTier;
  /** Also good as a balcony railing on upper floors. */
  railing: boolean;
  tags: string[];
  variants: FenceVariant[];
  status: 'ready' | 'dev';
}

export interface RoofStyleDef {
  id: string;
  name: string;
  description: string;
  /** Default and allowed pitch in degrees (flat styles ignore it). */
  pitch: number;
  pitchMin: number;
  pitchMax: number;
  /** True when the ridge direction matters. */
  directional: boolean;
  /** Price per square metre of plan area, before the finish. */
  pricePerM2: Cents;
  tags: string[];
  status: 'ready' | 'dev';
}

export interface RoofPalette { id: string; name: string; /** main colour, accent colour */ colors: [Hex, Hex] }

export interface RoofFinishDef {
  id: string;
  name: string;
  description: string;
  /** Procedural surface (render/roofView.ts): shingle, shake, tile, flatTile, seam, corrugated, slate, thatch, copper, sedum, membrane. */
  texture: string;
  /** Price per square metre of plan area, added to the style price. */
  pricePerM2: Cents;
  palettes: RoofPalette[];
  tags: string[];
  status: 'ready' | 'dev';
}

export interface TerrainPaintDef {
  id: string;
  name: string;
  description: string;
  /** Base colour and speckle colour. */
  color: Hex;
  color2: Hex;
  /** Procedural pattern: grass, meadow, dirt, flagstone, gravel, sand, mulch, bed, stones, cobble, tilled, lawn. */
  pattern: string;
  /** Price per tile. */
  price: Cents;
  tags: string[];
  status: 'ready' | 'dev';
}

export interface CropDef {
  id: string;
  name: string;
  kind: 'veg' | 'herb' | 'fruit';
  /** Effective growing days from planting (or from the last harvest, `regrow`) until ripe. */
  days: number;
  /** Days from harvest to the next crop for perennials (0 = the plant is spent and must be replanted). */
  regrow: number;
  /** Yield range at gardening level 1 (a better gardener gets more, sim/garden.ts). */
  yield: [number, number];
  /** Value of one piece when sold at the market stall. */
  unitPrice: Cents;
  /** Ripe colour and leaf colour for the overlay. */
  fruit: Hex;
  leaf: Hex;
  /** Object defs that grow it. */
  grownIn: string[];
}

/** Milestone 12: a pool finish (tile colour, coping stone) and its price per water tile. */
export interface PoolStyleDef {
  id: string;
  name: string;
  description: string;
  /** Water tint. */
  water: Hex;
  /** Basin wall/floor tile colour. */
  tile: Hex;
  /** Coping stone colour around the rim. */
  coping: Hex;
  /** Price of one water tile (the coping is included). */
  pricePerTile: Cents;
  tags: string[];
  status: 'ready' | 'dev';
}

export interface ExteriorContent {
  fences: Record<string, FenceDef>;
  roofStyles: Record<string, RoofStyleDef>;
  roofFinishes: Record<string, RoofFinishDef>;
  terrain: Record<string, TerrainPaintDef>;
  crops: Record<string, CropDef>;
  poolStyles: Record<string, PoolStyleDef>;
}

// ---------------------------------------------------------------------------------------------
// Fences and gates
// ---------------------------------------------------------------------------------------------

const v = (id: string, name: string, main: Hex, accent: Hex = main): FenceVariant => ({ id, name, main, accent });

const PAINTED: FenceVariant[] = [
  v('white', 'Whitewash', '#f3efe6', '#d8d0bf'), v('cream', 'Cream', '#e8dcc0', '#c9b995'), v('sage', 'Sage', '#9db59a', '#6f8b6d'),
  v('sky', 'Sky Blue', '#8fb4d6', '#5f86ad'), v('honey', 'Honey Oak', '#c98b55', '#9a6a3d'), v('charcoal', 'Charcoal', '#4a4a50', '#2c2c30'),
];
const TIMBER: FenceVariant[] = [
  v('oak', 'Oak', '#b98a58', '#8a5f38'), v('walnut', 'Walnut', '#7d5438', '#56392a'), v('weathered', 'Weathered', '#a39c8f', '#7c766b'),
  v('cedar', 'Red Cedar', '#b4694a', '#8c4a31'), v('white', 'Whitewash', '#f0ebe0', '#cfc7b6'), v('black', 'Stained Black', '#3a3633', '#26231f'),
];
const IRON: FenceVariant[] = [
  v('black', 'Matte Black', '#2e3034', '#1c1d20'), v('graphite', 'Graphite', '#5c6168', '#3f4348'), v('verdigris', 'Verdigris', '#5f9c8a', '#3f7766'),
  v('white', 'White Enamel', '#f0eeea', '#cfcac2'), v('bronze', 'Bronze', '#8a6a3f', '#5f4528'), v('forest', 'Forest Green', '#2f5a45', '#1f3d2f'),
];
const GLASS: FenceVariant[] = [
  v('clear', 'Clear Glass', '#bcd9df', '#bdd2d6'), v('smoke', 'Smoked Glass', '#7d8e94', '#4d5a5f'), v('green', 'Green Tint', '#9fcfba', '#6fa38b'),
  v('blue', 'Blue Tint', '#9cc0dd', '#6c98bb'),
];
const HEDGE: FenceVariant[] = [
  v('green', 'Boxwood', '#4f8f4a', '#3a6f38'), v('dark', 'Yew', '#2f6a3d', '#214d2c'), v('lime', 'Privet', '#7cb04d', '#5c8b36'),
  v('blue', 'Blue Cypress', '#4b8a86', '#336663'), v('autumn', 'Autumn Beech', '#a8793a', '#835a26'),
];
const BLOOM_HEDGE: FenceVariant[] = [
  v('pink', 'Pink Roses', '#4f8f4a', '#e58fa6'), v('red', 'Red Roses', '#4f8f4a', '#d6453d'), v('white', 'White Jasmine', '#4f8f4a', '#f5f1e6'),
  v('lilac', 'Lilac', '#4f8f4a', '#a98bd0'), v('yellow', 'Forsythia', '#6b9a3a', '#e8c93c'),
];
const STONE: FenceVariant[] = [
  v('grey', 'Granite', '#a7a39b', '#7e7b74'), v('sand', 'Sandstone', '#cdb892', '#a99673'), v('slate', 'Slate', '#6c7378', '#4b5155'),
  v('warm', 'Fieldstone', '#b3a08a', '#8a7a67'),
];
const BRICK: FenceVariant[] = [
  v('red', 'Red Brick', '#a5503f', '#d8d0bf'), v('yellow', 'London Yellow', '#cdb36a', '#d8d0bf'), v('grey', 'Blue Brick', '#6b7480', '#d8d0bf'),
  v('white', 'Whitewashed', '#e9e4d8', '#c9c2b2'),
];
const STUCCO: FenceVariant[] = [
  v('white', 'White Render', '#f0ebe0', '#cfc7b6'), v('terracotta', 'Terracotta', '#d4875e', '#b06a45'), v('ochre', 'Ochre', '#dcb35c', '#b8923d'),
  v('sage', 'Sage Render', '#aab99e', '#869675'), v('pink', 'Dusty Pink', '#e1b3a6', '#c08f82'),
];
const WIRE: FenceVariant[] = [
  v('galv', 'Galvanised', '#aab4b8', '#7d8b91'), v('green', 'Green Coated', '#4d7a58', '#35573e'), v('black', 'Black Coated', '#3a3d41', '#25272a'),
  v('white', 'White Coated', '#e5e5e0', '#bfbfb8'),
];
const BAMBOO: FenceVariant[] = [
  v('green', 'Green Bamboo', '#8fa84a', '#6a7d33'), v('golden', 'Golden Bamboo', '#d3b45a', '#a98a35'), v('black', 'Black Bamboo', '#4a3f35', '#2f2720'),
];
const ROPE: FenceVariant[] = [
  v('natural', 'Natural Rope', '#b98a58', '#d9c08c'), v('navy', 'Navy Rope', '#7d5438', '#3f5a86'), v('white', 'White Rope', '#f0ebe0', '#e8e8e2'),
  v('red', 'Red Rope', '#3a3633', '#c9433c'),
];

const fence = (
  id: string, name: string, style: string, height: number, price: number, tier: PriceTier, description: string,
  variants: FenceVariant[], tags: string[], railing = false,
): FenceDef => ({ id, name, description, kind: 'fence', style, height, price: dollars(price), tier, railing, tags, variants, status: 'ready' });

const gate = (
  id: string, name: string, style: string, height: number, price: number, tier: PriceTier, description: string,
  variants: FenceVariant[], tags: string[],
): FenceDef => ({ id, name, description, kind: 'gate', style, height, price: dollars(price), tier, railing: false, tags: ['gate', ...tags], variants, status: 'ready' });

/** 24 fence designs. */
export const FENCES: FenceDef[] = [
  fence('picket-white', 'Picket Fence', 'picket', 0.95, 12, 'budget', 'The classic flat-topped picket fence for a front garden.', PAINTED, ['picket', 'wood', 'cottage']),
  fence('picket-pointed', 'Pointed Picket Fence', 'picketPointed', 1.05, 14, 'budget', 'Taller pickets with pointed tips: neat, a little more private.', PAINTED, ['picket', 'wood', 'cottage']),
  fence('picket-low', 'Low Border Picket', 'picketLow', 0.5, 7, 'budget', 'A knee-high border fence for flower beds and paths.', PAINTED, ['picket', 'wood', 'border']),
  fence('privacy-board', 'Privacy Fence', 'privacy', 1.85, 26, 'standard', 'Tight vertical boards, 1.85 m high: nobody looks in.', TIMBER, ['board', 'wood', 'privacy']),
  fence('post-rail', 'Post and Rail', 'postRail', 0.95, 9, 'budget', 'Two rails between square posts: keeps the lawn tidy and the view open.', TIMBER, ['rail', 'wood', 'rural'], true),
  fence('ranch-board', 'Ranch Fence', 'ranch', 1.2, 15, 'standard', 'Three wide boards between sturdy posts.', TIMBER, ['rail', 'wood', 'rural']),
  fence('crossbuck', 'Crossbuck Fence', 'crossbuck', 1.05, 18, 'standard', 'Rails with X-braces between the posts, a farmhouse favourite.', TIMBER, ['rail', 'wood', 'rural']),
  fence('lattice-top', 'Lattice-Top Fence', 'latticeTop', 1.75, 30, 'standard', 'A solid board base with a diamond lattice on top for climbers.', TIMBER, ['lattice', 'wood', 'privacy']),
  fence('wrought-spear', 'Spear-Top Iron Fence', 'wroughtSpear', 1.35, 34, 'premium', 'Slim iron bars with spear tips: formal and secure.', IRON, ['iron', 'metal', 'classic'], true),
  fence('wrought-scroll', 'Scrollwork Iron Fence', 'wroughtScroll', 1.2, 42, 'premium', 'Wrought iron panels with scrolled rings.', IRON, ['iron', 'metal', 'classic']),
  fence('glass-panel', 'Framed Glass Fence', 'glassFramed', 1.15, 48, 'premium', 'Glass panels in slim posts: wind shelter without losing the view.', GLASS, ['glass', 'modern'], true),
  fence('glass-frameless', 'Frameless Glass Railing', 'glassFrameless', 1.05, 60, 'luxury', 'Clamped glass with a steel handrail. A balcony favourite.', GLASS, ['glass', 'modern'], true),
  fence('hedge-low', 'Low Hedge', 'hedgeLow', 0.7, 16, 'budget', 'A clipped box hedge for borders.', HEDGE, ['hedge', 'plant', 'border']),
  fence('hedge-tall', 'Tall Hedge', 'hedgeTall', 1.75, 28, 'standard', 'A dense, tall privet hedge: a living privacy wall.', HEDGE, ['hedge', 'plant', 'privacy']),
  fence('hedge-flowering', 'Flowering Hedge', 'hedgeBloom', 1.2, 30, 'standard', 'A hedge studded with blossoms.', BLOOM_HEDGE, ['hedge', 'plant', 'flowers']),
  fence('stone-dry', 'Dry Stone Wall', 'stoneDry', 0.85, 24, 'standard', 'A rough wall of stacked fieldstone.', STONE, ['stone', 'rural', 'wall']),
  fence('brick-low', 'Low Brick Wall', 'brickLow', 0.95, 26, 'standard', 'A capped brick garden wall.', BRICK, ['brick', 'wall', 'classic']),
  fence('stucco-wall', 'Rendered Garden Wall', 'stucco', 1.55, 36, 'premium', 'A smooth rendered wall with a coping stone.', STUCCO, ['wall', 'privacy', 'mediterranean']),
  fence('wattle', 'Woven Wattle Fence', 'wattle', 0.95, 13, 'budget', 'Willow stakes and woven branches: a cottage-garden classic.', TIMBER, ['woven', 'rural', 'cottage']),
  fence('chain-link', 'Chain-Link Fence', 'chain', 1.3, 11, 'budget', 'Wire mesh on slim posts. Cheap and practical.', WIRE, ['wire', 'practical']),
  fence('slat-screen', 'Horizontal Slat Screen', 'slatScreen', 1.6, 32, 'standard', 'Horizontal slats with small gaps: a modern privacy screen.', TIMBER, ['slat', 'wood', 'modern', 'privacy']),
  fence('rope-post', 'Rope and Post', 'ropePost', 0.65, 8, 'budget', 'Short posts joined by swagged rope, for beach and path edges.', ROPE, ['rope', 'coastal', 'border']),
  fence('bamboo', 'Bamboo Fence', 'bamboo', 1.5, 20, 'standard', 'Bamboo poles tied with cord: a calm garden screen.', BAMBOO, ['bamboo', 'plant', 'privacy']),
  fence('balustrade', 'Stone Balustrade', 'balustrade', 1.0, 54, 'premium', 'Turned stone balusters under a smooth handrail: terraces and balconies.', STONE, ['stone', 'classic'], true),
];

/** 12 gate designs. Each fills one grid edge and is passable. */
export const GATES: FenceDef[] = [
  gate('gate-picket', 'Picket Gate', 'picket', 1.0, 30, 'budget', 'A matching gate for the picket fences.', PAINTED, ['picket', 'wood']),
  gate('gate-picket-arch', 'Arched Picket Gate', 'picketArch', 1.55, 55, 'standard', 'A picket gate under a little timber arch.', PAINTED, ['picket', 'wood', 'arch']),
  gate('gate-ranch', 'Ranch Gate', 'ranch', 1.2, 36, 'budget', 'A five-bar style farm gate.', TIMBER, ['rail', 'wood', 'rural']),
  gate('gate-privacy', 'Privacy Gate', 'privacy', 1.85, 48, 'standard', 'A tall boarded gate for the privacy fence.', TIMBER, ['board', 'wood']),
  gate('gate-wrought', 'Iron Gate', 'wroughtSpear', 1.4, 80, 'premium', 'A spear-top iron gate.', IRON, ['iron', 'metal']),
  gate('gate-wrought-arch', 'Arched Iron Gate', 'wroughtArch', 1.8, 140, 'luxury', 'An iron gate under a curved overthrow.', IRON, ['iron', 'metal', 'arch']),
  gate('gate-lattice', 'Lattice Gate', 'lattice', 1.7, 62, 'standard', 'A diamond-lattice gate for climbers.', TIMBER, ['lattice', 'wood']),
  gate('gate-glass', 'Glass Gate', 'glassFramed', 1.15, 110, 'luxury', 'A framed glass gate, clear and modern.', GLASS, ['glass', 'modern']),
  gate('gate-slat', 'Slat Gate', 'slatScreen', 1.6, 58, 'standard', 'A slatted gate that matches the horizontal screen.', TIMBER, ['slat', 'wood', 'modern']),
  gate('gate-stone-arch', 'Stone Archway', 'stoneArch', 2.3, 180, 'luxury', 'Two stone pillars joined by an arch, with a wooden door.', STONE, ['stone', 'arch', 'classic']),
  gate('gate-hedge-arch', 'Hedge Archway', 'hedgeArch', 2.0, 70, 'standard', 'A leafy arch cut through a hedge.', BLOOM_HEDGE, ['hedge', 'plant', 'arch']),
  gate('gate-bamboo', 'Bamboo Gate', 'bamboo', 1.5, 44, 'standard', 'A bamboo gate with a rope latch.', BAMBOO, ['bamboo', 'plant']),
];

// ---------------------------------------------------------------------------------------------
// Roofs
// ---------------------------------------------------------------------------------------------

const style = (
  id: string, name: string, description: string, pitch: number, pitchMin: number, pitchMax: number, directional: boolean, price: number, tags: string[],
): RoofStyleDef => ({ id, name, description, pitch, pitchMin, pitchMax, directional, pricePerM2: dollars(price), tags, status: 'ready' });

/** 12 roof styles. Flat-topped styles ignore the pitch slider. */
export const ROOF_STYLES: RoofStyleDef[] = [
  style('gable', 'Gable', 'Two slopes meeting at a ridge, with triangular gable ends.', 32, 15, 55, true, 12, ['classic']),
  style('hip', 'Hip', 'Four slopes: the eaves run all the way round. Sturdy in storms.', 28, 15, 50, true, 14, ['classic']),
  style('flat', 'Flat', 'A flat deck with a thin edge, modern and good for sunbathing.', 0, 0, 0, false, 9, ['modern']),
  style('shed', 'Shed', 'A single slope, high on one side.', 14, 6, 35, true, 11, ['modern']),
  style('mansard', 'Mansard', 'Steep lower slopes and a shallow top: room for a whole attic.', 68, 55, 75, false, 19, ['french']),
  style('gambrel', 'Gambrel', 'A barn roof: two slopes on each side, steep below and gentle above.', 62, 45, 75, true, 16, ['barn']),
  style('pyramid', 'Pyramid', 'Four equal slopes rising to one point. Best over a square room.', 36, 18, 60, false, 15, ['classic']),
  style('dutch-gable', 'Dutch Gable', 'A hip roof topped with a small gable.', 30, 18, 50, true, 18, ['classic']),
  style('saltbox', 'Saltbox', 'A gable with a long slope on one side and a short one on the other.', 30, 15, 50, true, 13, ['colonial']),
  style('butterfly', 'Butterfly', 'Two slopes tilting inward to a central valley.', 14, 6, 30, true, 15, ['modern']),
  style('clerestory', 'Clerestory', 'A raised central band of windows lets light into the middle of the house.', 12, 5, 25, true, 22, ['modern']),
  style('a-frame', 'A-Frame', 'Steep slopes that come all the way down: a cabin in the woods.', 62, 50, 72, true, 17, ['cabin']),
];

const pal = (id: string, name: string, main: Hex, accent: Hex): RoofPalette => ({ id, name, colors: [main, accent] });

const finish = (
  id: string, name: string, description: string, texture: string, price: number, palettes: RoofPalette[], tags: string[],
): RoofFinishDef => ({ id, name, description, texture, pricePerM2: dollars(price), palettes, tags, status: 'ready' });

/** 11 roof finishes, each with colour palettes. */
export const ROOF_FINISHES: RoofFinishDef[] = [
  finish('asphalt-shingle', 'Asphalt Shingles', 'Overlapping shingles in a range of colours.', 'shingle', 2, [
    pal('charcoal', 'Charcoal', '#4a4d52', '#383b3f'), pal('brown', 'Weathered Brown', '#6f5848', '#54423a'), pal('red', 'Barn Red', '#9a4a42', '#7a3731'),
    pal('green', 'Forest Green', '#4c6b57', '#375043'), pal('blue-grey', 'Blue Grey', '#68798a', '#505f6e'),
  ], ['shingle', 'budget']),
  finish('cedar-shake', 'Cedar Shakes', 'Hand-split cedar, silvering with age.', 'shake', 5, [
    pal('natural', 'Natural Cedar', '#b27c52', '#8d5e3a'), pal('weathered', 'Weathered Silver', '#8b8478', '#6a6459'), pal('dark', 'Dark Stain', '#5e4535', '#43302a'),
  ], ['shake', 'rustic']),
  finish('clay-tile', 'Clay Tiles', 'Curved terracotta barrel tiles.', 'tile', 6, [
    pal('terracotta', 'Terracotta', '#c2663f', '#9f4e2d'), pal('brown', 'Brown Clay', '#8a5a40', '#6a4330'), pal('sand', 'Sand', '#d6b98a', '#b89865'),
  ], ['tile', 'mediterranean']),
  finish('concrete-tile', 'Concrete Tiles', 'Flat interlocking tiles.', 'flatTile', 4, [
    pal('grey', 'Pewter', '#7b7f85', '#5f6368'), pal('slate-blue', 'Slate Blue', '#5d6f86', '#47566b'), pal('charcoal', 'Anthracite', '#3f4247', '#2c2e32'),
  ], ['tile']),
  finish('standing-seam', 'Standing-Seam Metal', 'Sheet metal with raised seams.', 'seam', 7, [
    pal('green', 'Hunter Green', '#3f6b57', '#2d4f40'), pal('grey', 'Zinc Grey', '#8c9499', '#6c757a'), pal('black', 'Matte Black', '#2e3034', '#1c1d20'),
    pal('red', 'Barn Red', '#9a3d38', '#76302c'), pal('white', 'Snow White', '#e8e8e3', '#c4c4bd'),
  ], ['metal', 'modern']),
  finish('corrugated', 'Corrugated Sheet', 'Wavy steel sheet for sheds and barns.', 'corrugated', 3, [
    pal('galv', 'Galvanised', '#a8b0b4', '#838c91'), pal('rust', 'Rust Red', '#a24d38', '#7f3a2b'), pal('blue', 'Painted Blue', '#5c82a8', '#47667f'),
  ], ['metal', 'budget']),
  finish('slate', 'Natural Slate', 'Stacked slate slabs: long-lasting and elegant.', 'slate', 9, [
    pal('grey', 'Welsh Grey', '#59606a', '#434a53'), pal('purple', 'Heather Purple', '#6a5a74', '#514358'), pal('green', 'Westmorland Green', '#5d7367', '#46584e'),
  ], ['slate', 'premium']),
  finish('thatch', 'Thatch', 'Bundled reeds: warm, thick and very cottage.', 'thatch', 8, [
    pal('golden', 'Golden Straw', '#c9a85b', '#a3843f'), pal('weathered', 'Weathered Reed', '#9b8a62', '#776a49'),
  ], ['thatch', 'cottage']),
  finish('copper', 'Copper', 'Sheet copper that ages from bright to verdigris.', 'copper', 14, [
    pal('bright', 'Bright Copper', '#c2704a', '#9c5636'), pal('verdigris', 'Verdigris', '#6aa592', '#4c8070'),
  ], ['metal', 'luxury']),
  finish('green-roof', 'Green Roof', 'A living sedum blanket.', 'sedum', 12, [
    pal('sedum', 'Sedum Mix', '#7a9a52', '#a7b862'), pal('meadow', 'Wildflower', '#8bab5e', '#d8a0b8'),
  ], ['green', 'eco']),
  finish('membrane', 'Flat Membrane', 'Seamless membrane for flat roofs.', 'membrane', 3, [
    pal('white', 'Reflective White', '#e4e2dc', '#c8c5bd'), pal('grey', 'Mid Grey', '#8a8d90', '#6d7073'), pal('black', 'Black', '#35373a', '#232527'),
  ], ['flat', 'budget']),
];

// ---------------------------------------------------------------------------------------------
// Terrain paints
// ---------------------------------------------------------------------------------------------

const paint = (id: string, name: string, description: string, color: Hex, color2: Hex, pattern: string, price: number, tags: string[]): TerrainPaintDef =>
  ({ id, name, description, color, color2, pattern, price: dollars(price), tags, status: 'ready' });

/** 12 terrain paints. `grass`, `dirt` and `paving` match Lot.ground. */
export const TERRAIN_PAINTS: TerrainPaintDef[] = [
  paint('grass', 'Lawn Grass', 'Mown green grass. Painting it back removes other paints.', '#7fa860', '#a8c883', 'grass', 2, ['natural']),
  paint('meadow', 'Wildflower Meadow', 'Long grass with wildflowers.', '#86a964', '#e8c4d8', 'meadow', 5, ['natural', 'flowers']),
  paint('dirt', 'Bare Earth', 'Packed brown earth.', '#8d6b4a', '#6f5238', 'dirt', 2, ['natural']),
  paint('paving', 'Flagstone Paving', 'Square grey paving slabs.', '#bdb6a8', '#9b9488', 'flagstone', 9, ['path', 'hard']),
  paint('gravel', 'Gravel', 'Crunchy pea gravel.', '#b3a995', '#8f8573', 'gravel', 4, ['path']),
  paint('sand', 'Sand', 'Soft pale sand for play areas.', '#e0cf9f', '#c9b57f', 'sand', 4, ['play']),
  paint('mulch', 'Bark Mulch', 'Chipped bark around trees and beds.', '#6e4a34', '#4f3424', 'mulch', 4, ['garden']),
  paint('flowerbed', 'Flowerbed Soil', 'Rich dark soil for planting.', '#4b3426', '#33231a', 'bed', 5, ['garden']),
  paint('stepping-stones', 'Stepping Stones', 'Round stones set in the lawn.', '#7fa860', '#c1bbae', 'stones', 6, ['path', 'garden']),
  paint('cobble', 'Cobblestones', 'Rounded cobbles in a tight pattern.', '#9c968b', '#76706a', 'cobble', 12, ['path', 'hard']),
  paint('tilled', 'Tilled Rows', 'Ploughed rows for a kitchen garden.', '#6a4a32', '#4a3322', 'tilled', 5, ['garden']),
  paint('lawn-stripes', 'Striped Lawn', 'Neatly mown stripes.', '#79a35a', '#8fb86c', 'lawn', 3, ['natural']),
];

// ---------------------------------------------------------------------------------------------
// Crops
// ---------------------------------------------------------------------------------------------

const VEG_BEDS = ['garden-vegpatch'];

// ---------------------------------------------------------------------------------------------
// Pool styles
// ---------------------------------------------------------------------------------------------

const poolStyle = (
  id: string, name: string, description: string, water: Hex, tile: Hex, coping: Hex, price: number, tags: string[],
): PoolStyleDef => ({ id, name, description, water, tile, coping, pricePerTile: dollars(price), tags, status: 'ready' });

/** Three pool finishes: mosaic azure, lagoon green and warm terracotta. */
export const POOL_STYLES: PoolStyleDef[] = [
  poolStyle('azure-mosaic', 'Azure Mosaic', 'Small blue mosaic tiles with pale stone coping: the classic bright pool.', '#46b4d6', '#79cfe2', '#e7e3d7', 22, ['mosaic', 'classic', 'blue']),
  poolStyle('lagoon-tile', 'Lagoon Tiles', 'Deep green-blue tiles and weathered limestone coping.', '#3fa9a0', '#6cc4b4', '#d8d1bf', 26, ['tile', 'natural', 'green']),
  poolStyle('terracotta-tile', 'Terracotta Sun', 'Warm terracotta basin walls with pale sand coping.', '#4bb6c6', '#d08a5a', '#e0c9a4', 30, ['terracotta', 'mediterranean']),
];

export const CROPS: CropDef[] = [
  { id: 'tomato', name: 'Tomatoes', kind: 'veg', days: 5, regrow: 0, yield: [4, 7], unitPrice: dollars(1.2), fruit: '#d6453d', leaf: '#3f8f4a', grownIn: VEG_BEDS },
  { id: 'carrot', name: 'Carrots', kind: 'veg', days: 4, regrow: 0, yield: [5, 8], unitPrice: dollars(0.8), fruit: '#ec8a2e', leaf: '#4f9a4a', grownIn: VEG_BEDS },
  { id: 'lettuce', name: 'Lettuce', kind: 'veg', days: 3, regrow: 0, yield: [3, 5], unitPrice: dollars(1.4), fruit: '#9ccf63', leaf: '#6fb54e', grownIn: VEG_BEDS },
  { id: 'pumpkin', name: 'Pumpkins', kind: 'veg', days: 7, regrow: 0, yield: [2, 3], unitPrice: dollars(5), fruit: '#e3862b', leaf: '#3f7d3f', grownIn: VEG_BEDS },
  { id: 'strawberry', name: 'Strawberries', kind: 'veg', days: 5, regrow: 3, yield: [4, 6], unitPrice: dollars(1.6), fruit: '#d8344a', leaf: '#4c9a4a', grownIn: VEG_BEDS },
  { id: 'basil', name: 'Basil', kind: 'herb', days: 3, regrow: 2, yield: [3, 5], unitPrice: dollars(1.5), fruit: '#4fae4f', leaf: '#4fae4f', grownIn: ['garden-herb-planter'] },
  { id: 'mint', name: 'Mint', kind: 'herb', days: 3, regrow: 2, yield: [3, 5], unitPrice: dollars(1.3), fruit: '#6bc27a', leaf: '#6bc27a', grownIn: ['garden-herb-planter'] },
  { id: 'rosemary', name: 'Rosemary', kind: 'herb', days: 4, regrow: 3, yield: [2, 4], unitPrice: dollars(1.8), fruit: '#5f8f6a', leaf: '#5f8f6a', grownIn: ['garden-herb-planter'] },
  { id: 'apple', name: 'Apples', kind: 'fruit', days: 6, regrow: 5, yield: [5, 9], unitPrice: dollars(1.5), fruit: '#d6453d', leaf: '#4f8f4a', grownIn: ['garden-fruit-tree'] },
  { id: 'lemon', name: 'Lemons', kind: 'fruit', days: 7, regrow: 5, yield: [4, 7], unitPrice: dollars(1.7), fruit: '#f0d44a', leaf: '#4f8f4a', grownIn: ['garden-fruit-tree'] },
];

// ---------------------------------------------------------------------------------------------
// Gardening interactions (behaviour 'garden', implemented by sim/garden.ts)
// ---------------------------------------------------------------------------------------------

const gi = (d: Pick<InteractionDef, 'id' | 'name' | 'description' | 'icon' | 'duration' | 'needsOnComplete' | 'skill'> & Partial<InteractionDef>): InteractionDef => ({
  kind: 'object', slotKinds: [], anims: { perform: 'water' }, posture: 'standing', needsPerHour: {}, behavior: 'garden',
  autonomy: { enabled: false, ads: {}, tags: ['gardening', 'skill'] }, allowVisitors: false, status: 'ready', ...d,
});

/** Plant, water, weed and harvest. Autonomy is limited to the chores a plant needs (watering and weeding). */
export const GARDEN_INTERACTIONS: InteractionDef[] = [
  gi({
    id: 'gardenPlant', name: 'Plant Seeds', description: 'Sow the bed with the next crop. Seeds cost $3. Water it and the crop grows by the day.',
    icon: 'sparkle', duration: { kind: 'fixed', minutes: 20 }, needsOnComplete: { fun: 4 }, skill: { id: 'gardening', xpPerHour: 120 },
    cost: dollars(3), anims: { perform: 'interact' }, weather: { not: ['snow'] },
  }),
  gi({
    id: 'gardenWater', name: 'Water the Bed', description: 'Soak the soil. Watered plants grow at full speed; the water is used up in about two days.',
    icon: 'sparkle', duration: { kind: 'fixed', minutes: 10 }, needsOnComplete: { fun: 3 }, skill: { id: 'gardening', xpPerHour: 140 },
    moodletOnComplete: 'greenThumb', autonomy: { enabled: true, ads: { fun: 3 }, tags: ['gardening', 'skill'] },
    weather: { not: ['rain', 'snow'] },
  }),
  gi({
    id: 'gardenWeed', name: 'Weed the Bed', description: 'Pull the weeds that slow the plants down.',
    icon: 'build', duration: { kind: 'fixed', minutes: 15 }, needsOnComplete: { fun: 2 }, skill: { id: 'gardening', xpPerHour: 140 },
    anims: { perform: 'interact' }, autonomy: { enabled: true, ads: { fun: 2 }, tags: ['gardening', 'skill'] },
    weather: { not: ['snow'] },
  }),
  gi({
    id: 'gardenHarvest', name: 'Harvest', description: 'Pick what is ripe. Part of it goes to the kitchen, the rest is sold at the market stall for cash. Better gardeners get bigger harvests.',
    icon: 'sparkle', duration: { kind: 'fixed', minutes: 15 }, needsOnComplete: { fun: 6 }, skill: { id: 'gardening', xpPerHour: 160 },
    moodletOnComplete: 'greenThumb', anims: { perform: 'interact' },
    autonomy: { enabled: true, ads: { fun: 4 }, tags: ['gardening', 'skill'] }, weather: { not: ['snow'] },
  }),
];

// ---------------------------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------------------------

const byId = <T extends { id: string }>(kind: string, list: readonly T[]): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const item of list) {
    if (out[item.id]) throw new Error(`Duplicate ${kind} id: ${item.id}`);
    out[item.id] = item;
  }
  return out;
};

export const EXTERIOR: ExteriorContent = {
  fences: byId('fence', [...FENCES, ...GATES]),
  roofStyles: byId('roof style', ROOF_STYLES),
  roofFinishes: byId('roof finish', ROOF_FINISHES),
  terrain: byId('terrain paint', TERRAIN_PAINTS),
  crops: byId('crop', CROPS),
  poolStyles: byId('pool style', POOL_STYLES),
};

/** The exterior content of a ContentDB (older fixtures without it use the shared registry). */
export function exteriorOf(db?: { exterior?: Partial<ExteriorContent> } | null): ExteriorContent {
  return db?.exterior ? { ...EXTERIOR, ...db.exterior } : EXTERIOR;
}

/** Pool style by id (unknown ids fall back to the first style so old saves still render). */
export function poolStyleOf(content: ExteriorContent, id: string | undefined): PoolStyleDef {
  return (id ? content.poolStyles[id] : undefined) ?? POOL_STYLES[0]!;
}

/** Variant of a fence def (index wraps into range). */
export function fenceVariant(def: FenceDef, index = 0): FenceVariant {
  return def.variants[((index % def.variants.length) + def.variants.length) % def.variants.length]!;
}
