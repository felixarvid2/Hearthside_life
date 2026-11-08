// OWNER: surfaces agent (walls, floors, openings). See docs/ARCHITECTURE.md.
//
// Construction surface catalog: wall finishes, floors, doors and windows. Pure data plus small helpers
// (no three.js, no DOM). Each design names a procedural painter (src/render/textures/painters.ts) and its
// params; distinct designs differ in pattern layout or structure, palettes are curated colour variants.
//
// Palette colours follow the painter's role order (documented per design below). colors[0] is always the
// colour that dominates the surface from a distance (ground, tile, brick, upper wall...), which is what
// paletteTone() classifies for catalog colour filters.
//
// Prices: walls per wall side (one tile wide), floors per floor tile, in cents.

import type { FinishRef } from '../core/types';
import type { OpeningDef, Palette, PriceTier, SurfaceDesign } from './types';
import { OPENINGS_3 } from './openingsM10';
import { FLOOR_DESIGNS_2, OPENINGS_2, WALL_DESIGNS_2 } from './surfaces2';
import { FLOOR_DESIGNS_3, WALL_DESIGNS_3 } from './surfaces3';

/** Brief section 14 wall families (id, display name, full-catalog target). */
export const WALL_FAMILIES: ReadonlyArray<{ id: string; name: string; target: number }> = [
  { id: 'paint', name: 'Plain paint, plaster and subtle textures', target: 28 },
  { id: 'stripes', name: 'Stripes, checks and gingham', target: 24 },
  { id: 'geometric', name: 'Geometric and contemporary', target: 32 },
  { id: 'floral', name: 'Floral', target: 32 },
  { id: 'botanical', name: 'Botanical and nature', target: 24 },
  { id: 'vintage-deco', name: 'Vintage and Art Deco', target: 24 },
  { id: 'playful', name: "Children's and playful", target: 24 },
  { id: 'wood-panel', name: 'Wood panels, wainscoting and beadboard', target: 24 },
  { id: 'tile', name: 'Ceramic, mosaic and decorative tiles', target: 36 },
  { id: 'brick-stone', name: 'Brick and stone', target: 32 },
  { id: 'concrete', name: 'Concrete, industrial and weathered', target: 20 },
  { id: 'luxury', name: 'Luxury fabrics, metallics and damask', target: 20 },
  { id: 'mural', name: 'Murals and feature walls', target: 20 },
  { id: 'themed', name: 'Themed, rustic, coastal and eclectic', target: 20 },
];

/** Brief section 15 floor families (id, display name, full-catalog target). */
export const FLOOR_FAMILIES: ReadonlyArray<{ id: string; name: string; target: number }> = [
  { id: 'wood-planks', name: 'Wooden planks and boards', target: 40 },
  { id: 'parquet', name: 'Parquet and decorative wood', target: 24 },
  { id: 'laminate-vinyl', name: 'Laminate and vinyl', target: 20 },
  { id: 'tile', name: 'Ceramic, porcelain and mosaic tiles', target: 32 },
  { id: 'stone', name: 'Stone, marble and terrazzo', target: 24 },
  { id: 'carpet', name: 'Carpets and textile floors', target: 24 },
  { id: 'concrete', name: 'Concrete and industrial', target: 12 },
  { id: 'exterior', name: 'Exterior paving, decking, gravel and paths', target: 24 },
];

const pal = (id: string, name: string, ...colors: string[]): Palette => ({ id, name, colors });
const dollars = (d: number) => Math.round(d * 100);

type DesignInput = Omit<SurfaceDesign, 'surface' | 'status'> & { status?: SurfaceDesign['status'] };
const wall = (d: DesignInput): SurfaceDesign => ({ ...d, surface: 'wall', status: d.status ?? 'ready' });
const floor = (d: DesignInput): SurfaceDesign => ({ ...d, surface: 'floor', status: d.status ?? 'ready' });

// ---------------------------------------------------------------------------------------------
// Wall designs
// ---------------------------------------------------------------------------------------------

const WALL_DESIGNS_1: SurfaceDesign[] = [
  wall({
    id: 'plain-paint', name: 'Matt Emulsion',
    description: 'Smooth matt paint with a faint roller texture over a moulded skirting board. Goes with everything.',
    family: 'paint', tags: ['paint', 'plain', 'matt', 'any-room', 'living', 'bedroom', 'kitchen', 'hall'],
    packs: ['everyday-essentials', 'modern-minimal'], tier: 'budget', price: dollars(4),
    painter: 'plain-paint', params: { skirt: 0.1, texture: 0.45 }, repeat: 1.0,
    // roles: wall, trim
    palettes: [
      pal('warm-linen', 'Warm Linen', '#e8dcc8', '#f7f2e8'),
      pal('chalk-white', 'Chalk White', '#f2efe8', '#fbfaf6'),
      pal('greige', 'Greige', '#b8afa2', '#f3efe7'),
      pal('sage', 'Sage', '#a7b49b', '#f4f1e8'),
      pal('duck-egg', 'Duck Egg', '#c4d6d3', '#f6f4ee'),
      pal('butter', 'Butter Yellow', '#f0dc9a', '#fbf7ea'),
      pal('terracotta', 'Terracotta', '#c4714d', '#f2e9df'),
      pal('slate-blue', 'Slate Blue', '#5d6f86', '#eeece6'),
      pal('forest', 'Forest Green', '#2f4a3c', '#e8e4d8'),
      pal('charcoal', 'Charcoal', '#34363a', '#e5e2dc'),
    ],
  }),
  wall({
    id: 'stripes-regency', name: 'Regency Stripe',
    description: 'Broad satin stripes edged with fine pinstripes. Formal, tall and calm.',
    family: 'stripes', tags: ['stripes', 'classic', 'formal', 'living', 'dining', 'bedroom', 'hall'],
    packs: ['classic-townhouse'], tier: 'standard', price: dollars(9),
    painter: 'regency-stripes', params: { stripe: 0.09, pin: 0.006, gap: 0.009, centrePin: true, sheen: true }, repeat: 0.36,
    // roles: ground, stripe, pinstripe, trim
    palettes: [
      pal('cream-sage', 'Cream and Sage', '#f1ead8', '#b9c4a4', '#7d8c66', '#fbf8f1'),
      pal('ivory-gold', 'Ivory and Gold', '#f4ecd6', '#e2cc8f', '#b08d3c', '#fbf8ef'),
      pal('blush-rose', 'Blush Rose', '#f3dcd4', '#e3aea0', '#b46e5f', '#fcf7f4'),
      pal('duck-blue', 'Duck-Egg Blue', '#d6e2e4', '#8fb0b8', '#4f7680', '#f7f8f6'),
      pal('greige-taupe', 'Greige and Taupe', '#c4baab', '#a89c8a', '#6f6556', '#f4f0e8'),
      pal('regency-red', 'Regency Red', '#b8433a', '#8f2d28', '#e0c070', '#f2ebe0'),
      pal('mustard', 'Mustard', '#c99a3a', '#e4c27a', '#7a5a22', '#f5efe0'),
      pal('navy-gold', 'Navy and Gold', '#26324a', '#34425f', '#c9a85a', '#e9e4d8'),
      pal('charcoal-silver', 'Charcoal and Silver', '#3a3b3f', '#4a4c51', '#a9adb3', '#e6e4df'),
    ],
  }),
  wall({
    id: 'gingham-check', name: 'Farmhouse Gingham',
    description: 'A woven gingham check with half-tone bands and a fine twill, like a kitchen tablecloth.',
    family: 'themed', tags: ['check', 'gingham', 'rustic', 'farmhouse', 'cottage', 'kitchen', 'kids', 'playful'],
    packs: ['cozy-cottage', 'kids-storybook'], tier: 'standard', price: dollars(8),
    painter: 'gingham', params: { check: 0.045, weave: 0.6 }, repeat: 0.36,
    // roles: check, ground, trim
    palettes: [
      pal('cherry-red', 'Cherry Red', '#b8322f', '#f7f3ec', '#fbf9f4'),
      pal('cornflower', 'Cornflower Blue', '#5b7fb8', '#f6f4ef', '#fbfaf6'),
      pal('sage-green', 'Sage Green', '#8fa682', '#f5f3ec', '#fbfaf5'),
      pal('pale-blue', 'Pale Blue', '#bcd3e6', '#fbfbf8', '#ffffff'),
      pal('butter-yellow', 'Butter Yellow', '#e9c95a', '#fbf8ef', '#fdfbf4'),
      pal('oatmeal', 'Oatmeal', '#c2b49b', '#f6f1e7', '#fbf8f2'),
      pal('blush-pink', 'Blush Pink', '#e7b7b4', '#fbf6f3', '#fdfaf8'),
      pal('navy', 'Navy', '#2b3a5c', '#f2efe8', '#f7f5f0'),
      pal('black-white', 'Black and White', '#2a2a2a', '#f4f2ee', '#f8f7f4'),
    ],
  }),
  wall({
    id: 'floral-sprig', name: 'Meadow Sprig',
    description: 'Small hand-drawn flower sprigs with leaves and a bud, scattered in a gentle half-drop.',
    family: 'floral', tags: ['floral', 'flowers', 'cottage', 'romantic', 'bedroom', 'bathroom', 'small-print'],
    packs: ['cozy-cottage'], tier: 'standard', price: dollars(9),
    painter: 'floral-sprig', params: { spacing: 0.17, size: 0.065, petals: 5, scatter: 0.3 }, repeat: 0.68,
    // roles: ground, petal, leaf, centre, trim
    palettes: [
      pal('cream-rose', 'Cream and Rose', '#f5efe3', '#d98b8b', '#7f9a6a', '#e8c15a', '#fbf8f2'),
      pal('duck-egg-coral', 'Duck Egg and Coral', '#cfe0dc', '#e48a6d', '#5f8a72', '#f1d27a', '#f7f6f1'),
      pal('ivory-lilac', 'Ivory and Lilac', '#f2eee8', '#a593c2', '#8aa07a', '#f0d488', '#fbfaf6'),
      pal('buttercup', 'Buttercup', '#f3e3a6', '#fbf8ef', '#6f8f5c', '#d99a2b', '#fbf6e6'),
      pal('sage-white', 'Sage and White', '#a9b79c', '#f6f2e8', '#5e7253', '#e3c46a', '#f4f2ea'),
      pal('terracotta', 'Terracotta', '#c27a5a', '#f3e2c9', '#6b7a52', '#f1c66a', '#f3ebe1'),
      pal('greige-mustard', 'Greige and Mustard', '#bfb5a6', '#d8a53a', '#6e7b5b', '#8a5a2a', '#f3efe7'),
      pal('navy-ditsy', 'Navy Ditsy', '#283652', '#f2e6d6', '#7f9a78', '#e5b85c', '#e9e5dc'),
      pal('charcoal-blossom', 'Charcoal Blossom', '#3a3537', '#e7a3a9', '#8aa583', '#f0d080', '#e6e2dc'),
    ],
  }),
  wall({
    id: 'diamond-trellis', name: 'Diamond Trellis',
    description: 'A double-ruled lattice of tall diamonds with small quatrefoil rosettes at every crossing.',
    family: 'geometric', tags: ['geometric', 'trellis', 'lattice', 'classic', 'dining', 'hall', 'living'],
    packs: ['classic-townhouse', 'mid-century'], tier: 'standard', price: dollars(11),
    painter: 'diamond-trellis', params: { cell: 0.2, aspect: 1.4, line: 0.005, double: true, dots: true }, repeat: 0.6,
    // roles: ground, line, node, trim
    palettes: [
      pal('white-sage', 'White and Sage', '#f3f1ea', '#9db08f', '#c7a65b', '#fbfaf6'),
      pal('linen-taupe', 'Linen and Taupe', '#e9e1d2', '#a8977c', '#7a6a52', '#f7f3ec'),
      pal('mint', 'Mint', '#cfe3d6', '#6e9a84', '#e2b04d', '#f6f8f4'),
      pal('greige-white', 'Greige and White', '#b9b1a5', '#f5f2ec', '#8d8476', '#f3efe8'),
      pal('dove-grey', 'Dove Grey', '#a7a9a8', '#f1f0ed', '#6c6f73', '#efeeeb'),
      pal('coral', 'Coral', '#e07a5f', '#f7efe4', '#8a3f2c', '#f7f0e8'),
      pal('blue-ivory', 'Blue and Ivory', '#3d6390', '#efe9dc', '#d8b25a', '#f2efe8'),
      pal('forest-cream', 'Forest and Cream', '#2c4a3e', '#e6dcc5', '#c9a24f', '#ebe6da'),
      pal('charcoal-brass', 'Charcoal and Brass', '#2f3134', '#b8975a', '#d9c08a', '#e5e2dc'),
    ],
  }),
  wall({
    id: 'botanical-leaves', name: 'Garden Branches',
    description: 'Leafy branches in two greens over a soft shadow layer, like a pressed-plant print.',
    family: 'botanical', tags: ['botanical', 'leaves', 'nature', 'green', 'living', 'bedroom', 'feature-wall'],
    packs: ['botanical-living'], tier: 'premium', price: dollars(14),
    painter: 'botanical-sprays', params: { leaf: 0.1, density: 1, shadows: true }, repeat: 0.8,
    // roles: ground, leafA, leafB, vein, trim
    palettes: [
      pal('white-fern', 'White Fern', '#f4f3ee', '#7fa070', '#4f7a55', '#dfe8d2', '#fbfaf6'),
      pal('blush-palm', 'Blush and Palm', '#f2d8cc', '#9fb48c', '#6f8e6a', '#e6efd6', '#fbf5f2'),
      pal('linen-eucalyptus', 'Linen Eucalyptus', '#e6dfd2', '#9bb3a8', '#6f8f86', '#f4f1ea', '#f6f3ed'),
      pal('sage-silhouette', 'Sage Silhouette', '#a8b5a0', '#e9ede3', '#879a80', '#ffffff', '#f2f1ea'),
      pal('stone-grey', 'Stone Grey', '#9e9d98', '#62705f', '#4a5848', '#c8ccc0', '#eeede9'),
      pal('terracotta-olive', 'Terracotta and Olive', '#c87f5f', '#6f7e4f', '#4f5e3a', '#e9d6b8', '#f3ebe1'),
      pal('mustard', 'Mustard Grove', '#d9a641', '#4f6b47', '#2f4d33', '#f2dfa7', '#f6efe0'),
      pal('tropical-night', 'Tropical Night', '#1f2e2a', '#4e8a5f', '#2f6447', '#a8d1a0', '#e6e3db'),
      pal('navy-gold', 'Navy and Gold', '#22304a', '#c7a35a', '#8f7240', '#f1deb0', '#e8e4da'),
    ],
  }),
  wall({
    id: 'deco-fans', name: 'Deco Fan',
    description: 'Overlapping rows of rayed fans with gilded outlines, in the spirit of 1920s interiors.',
    family: 'vintage-deco', tags: ['art-deco', 'vintage', 'fan', 'scallop', 'glamour', 'dining', 'bathroom', 'feature-wall'],
    packs: ['art-deco'], tier: 'premium', price: dollars(18),
    painter: 'deco-fans', params: { radius: 0.11, rays: 9, rings: 2 }, repeat: 0.66,
    // roles: ground, fan, line, trim
    palettes: [
      pal('ivory-gold', 'Ivory and Gold', '#f3ecdc', '#e6d6b0', '#b8954a', '#fbf7ee'),
      pal('blush-copper', 'Blush and Copper', '#efd5c8', '#e3b9a5', '#b07050', '#fbf4f0'),
      pal('sage-pewter', 'Sage and Pewter', '#a9b39f', '#c2cab8', '#6f7869', '#f2f2ec'),
      pal('dove-silver', 'Dove and Silver', '#b3b2ae', '#cfceca', '#7d7f84', '#f0efec'),
      pal('teal-brass', 'Teal and Brass', '#2b7470', '#3b8a84', '#d4b16a', '#ece8dd'),
      pal('coral-cream', 'Coral and Cream', '#e58c6e', '#f0b49c', '#fbefe2', '#f8f1ea'),
      pal('black-gold', 'Black and Gold', '#1e1e22', '#2c2c33', '#c9a24e', '#e9e2d2'),
      pal('emerald-gold', 'Emerald and Gold', '#1f4d3d', '#2a6150', '#c9a85a', '#e7e3d6'),
      pal('navy-silver', 'Navy and Silver', '#1f2a44', '#2c3a5a', '#b9bcc4', '#e6e5e1'),
    ],
  }),
  wall({
    id: 'beadboard-wainscot', name: 'Beadboard Wainscot',
    description: 'Painted tongue-and-groove beadboard to dado height under a cap rail, with painted wall above.',
    family: 'wood-panel', tags: ['wainscoting', 'beadboard', 'panelling', 'cottage', 'coastal', 'kitchen', 'bathroom', 'hall'],
    packs: ['cozy-cottage', 'coastal-home'], tier: 'premium', price: dollars(22),
    painter: 'beadboard', params: { skirt: 0.13, panel: 0.95, board: 0.1, rail: 0.045 }, repeat: 0.6,
    // roles: upper wall, panel, groove, rail and skirting
    palettes: [
      pal('white-on-white', 'White on White', '#f3f0e8', '#faf8f2', '#d4cdbd', '#ffffff'),
      pal('duck-egg-white', 'Duck Egg over White', '#cddfdc', '#f7f6f0', '#d2d0c6', '#ffffff'),
      pal('white-navy', 'White over Navy', '#f2efe7', '#2f3d5a', '#1d2740', '#2f3d5a'),
      pal('blush-sage', 'Blush over Sage', '#ecd2c8', '#a9b59b', '#7f8c72', '#a9b59b'),
      pal('sage-cream', 'Sage over Cream', '#b5c0a4', '#f4f0e4', '#cfc6b1', '#f8f5ec'),
      pal('greige-charcoal', 'Greige over Charcoal', '#bdb3a4', '#3b3d40', '#26282a', '#3b3d40'),
      pal('terracotta-cream', 'Terracotta over Cream', '#c97b58', '#f3eadb', '#d2c3a6', '#f7f0e3'),
      pal('mustard-grey', 'Mustard over Grey', '#d4a23f', '#6f7377', '#4d5054', '#6f7377'),
      pal('forest-oak', 'Forest over Oak', '#2f4a3c', '#b88a5a', '#7a5634', '#a67a4d'),
    ],
  }),
  wall({
    id: 'subway-tile', name: 'Subway Tile',
    description: 'Glazed, bevelled 15 x 7.5 cm tiles in running bond, laid from the floor to the ceiling.',
    family: 'tile', tags: ['tile', 'ceramic', 'glazed', 'kitchen', 'bathroom', 'washable', 'classic'],
    packs: ['everyday-essentials', 'industrial-loft'], tier: 'premium', price: dollars(16),
    painter: 'subway-tile', params: { tileW: 0.15, tileH: 0.075, grout: 0.003, bond: 'running', bevel: 0.6, variation: 0.35 }, repeat: 0.6,
    // roles: tile, grout
    palettes: [
      pal('gloss-white', 'Gloss White', '#f4f4f0', '#d8d6d0'),
      pal('white-charcoal', 'White, Charcoal Grout', '#f1ede4', '#4a4a4a'),
      pal('blush', 'Blush', '#e9c4bb', '#f6efe9'),
      pal('sage', 'Sage', '#a9b8a0', '#e9e6dc'),
      pal('greige', 'Greige', '#c3bbb0', '#9a9288'),
      pal('butter-yellow', 'Butter Yellow', '#ecd27c', '#f5f1e6'),
      pal('terracotta', 'Terracotta Glaze', '#c47452', '#e8dccb'),
      pal('emerald', 'Emerald', '#2a7056', '#d8d4c8'),
      pal('cobalt', 'Cobalt', '#2f4f8f', '#d9dbdc'),
      pal('black-gloss', 'Black Gloss', '#262729', '#8a8a88'),
    ],
  }),
  wall({
    id: 'brick-classic', name: 'Classic Brick',
    description: 'Real-scale 21.5 x 6.5 cm bricks in running bond with recessed mortar and natural colour variation.',
    family: 'brick-stone', tags: ['brick', 'masonry', 'exterior', 'industrial', 'loft', 'kitchen', 'feature-wall'],
    packs: ['industrial-loft', 'classic-townhouse'], tier: 'premium', price: dollars(20),
    painter: 'brick', params: { brickW: 0.215, brickH: 0.065, joint: 0.01, bond: 'running', variation: 0.6 }, repeat: 0.9,
    // roles: brick, mortar, brick alternate, brick dark
    palettes: [
      pal('classic-red', 'Classic Red', '#9e4b33', '#cdc3b2', '#b5603f', '#6f3424'),
      pal('red-dark-mortar', 'Red, Dark Mortar', '#a5523a', '#4c4844', '#8f4330', '#6a3122'),
      pal('sandstone-buff', 'Sandstone Buff', '#c9a676', '#e6dcc8', '#d8b98a', '#a7845a'),
      pal('terracotta-pink', 'Terracotta Pink', '#c98a74', '#e3d8cb', '#d69b84', '#a8695a'),
      pal('london-stock', 'London Stock', '#a8987c', '#d6cfc0', '#c0ab85', '#7d6c55'),
      pal('grey-engineering', 'Grey Engineering', '#6c6a6a', '#b8b4ac', '#7c7774', '#555252'),
      pal('painted-sage', 'Painted Sage', '#9daa90', '#c9cdbf', '#a7b39a', '#8a977e'),
      pal('whitewashed', 'Whitewashed', '#e9e4da', '#f3f0ea', '#ddd6c9', '#c9c0b1'),
      pal('smoked-charcoal', 'Smoked Charcoal', '#4a3f3a', '#8d8378', '#5a4c44', '#342c28'),
      pal('painted-black', 'Painted Black', '#2f2f31', '#3c3c3e', '#38383a', '#232325'),
    ],
  }),
  wall({
    id: 'limewash-plaster', name: 'Limewash Plaster',
    description: 'Mineral limewash over plaster: soft clouded tones crossed by broad brush sweeps.',
    family: 'concrete', tags: ['plaster', 'limewash', 'textured', 'mediterranean', 'minimal', 'living', 'bedroom', 'feature-wall'],
    packs: ['modern-minimal', 'coastal-home'], tier: 'standard', price: dollars(12),
    painter: 'limewash', params: { cloud: 0.6, scale: 0.45, brush: 0.6 }, repeat: 1.4,
    // roles: base, light, dark
    palettes: [
      pal('chalk', 'Chalk', '#ece7dd', '#f8f5ef', '#d6cebf'),
      pal('oat', 'Oat', '#d9ccb6', '#e8dfcf', '#bfae94'),
      pal('stone-grey', 'Stone Grey', '#b3ada3', '#cbc6bd', '#948e84'),
      pal('sage', 'Sage', '#9eab92', '#b6c1aa', '#84927a'),
      pal('dusk-blue', 'Dusk Blue', '#6e7f93', '#8a9aac', '#56677b'),
      pal('clay-pink', 'Clay Pink', '#d4a28f', '#e5bcab', '#b8836f'),
      pal('terracotta', 'Terracotta', '#b8684a', '#cc8466', '#96503a'),
      pal('ochre', 'Ochre', '#c9a050', '#dcb86e', '#a9823a'),
      pal('charcoal', 'Charcoal', '#4a4a48', '#5f5f5c', '#363634'),
    ],
  }),
  wall({
    id: 'damask-classic', name: 'Grand Damask',
    description: 'Tone-on-tone symmetric medallions with scrolls and acanthus leaves on a woven-look ground.',
    family: 'luxury', tags: ['damask', 'luxury', 'ornate', 'traditional', 'dining', 'bedroom', 'living', 'feature-wall'],
    packs: ['classic-townhouse', 'art-deco'], tier: 'luxury', price: dollars(28),
    painter: 'damask', params: { motif: 0.48, fillers: true }, repeat: 0.76,
    // roles: ground, motif, sheen, trim
    palettes: [
      pal('ivory-tone', 'Ivory Tone-on-Tone', '#f1ead9', '#e0d2b4', '#fbf7ec', '#fbf8f0'),
      pal('champagne-gold', 'Champagne Gold', '#e9dcc0', '#c9ad74', '#f6eacb', '#f8f3e6'),
      pal('blush-rose', 'Blush Rose', '#e8c3b8', '#d9a597', '#f6e3dc', '#faf2ef'),
      pal('silver-grey', 'Silver Grey', '#b9b9b6', '#d2d2cf', '#ecebe8', '#f1f0ed'),
      pal('sage-cream', 'Sage and Cream', '#a9b49a', '#c3ccb3', '#eef0e4', '#f2f2ea'),
      pal('teal-gold', 'Teal and Gold', '#2e7a77', '#3d918d', '#d6b56d', '#ebe7dc'),
      pal('mustard', 'Mustard', '#c99a3a', '#b3862c', '#ead08a', '#f5efe0'),
      pal('oxblood-gold', 'Oxblood and Gold', '#6a1f24', '#8a3238', '#c9a35a', '#e9e2d6'),
      pal('midnight-silver', 'Midnight Silver', '#1e2433', '#2d3549', '#9aa2b4', '#e4e3e0'),
      pal('emerald-gold', 'Emerald and Gold', '#1e4a3c', '#2b6150', '#c8a65c', '#e7e3d6'),
    ],
  }),
];

/** Every wall finish: the Milestone 1 set here, then Milestone 2 (surfaces2.ts) and Milestone 10 (surfaces3/). */
export const WALL_DESIGNS: SurfaceDesign[] = [...WALL_DESIGNS_1, ...WALL_DESIGNS_2, ...WALL_DESIGNS_3];

// ---------------------------------------------------------------------------------------------
// Floor designs
// ---------------------------------------------------------------------------------------------

const FLOOR_DESIGNS_1: SurfaceDesign[] = [
  floor({
    id: 'oak-planks', name: 'Oak Planks',
    description: '18 cm solid boards of random length with flat-sawn grain, the odd knot and fine joints.',
    family: 'wood-planks', tags: ['wood', 'planks', 'oak', 'warm', 'living', 'bedroom', 'hall', 'dining'],
    packs: ['everyday-essentials', 'cozy-cottage'], tier: 'standard', price: dollars(12),
    painter: 'planks', params: { plank: 0.18, minLen: 0.7, maxLen: 1.6, grain: 0.6, knots: 0.3, variation: 0.5 }, repeat: 1.8,
    // roles: base, light, dark, seam
    palettes: [
      pal('natural-oak', 'Natural Oak', '#c49a6c', '#d8b48a', '#a57a4f', '#6b4a2e'),
      pal('honey-oak', 'Honey Oak', '#c98f4f', '#dda66a', '#a8703a', '#6a4220'),
      pal('whitewashed-oak', 'Whitewashed Oak', '#e2d6c3', '#efe6d8', '#cbbca5', '#9a8b75'),
      pal('grey-ash', 'Grey Ash', '#a9a296', '#bdb7ab', '#8e877b', '#5f5a52'),
      pal('cherry', 'Cherry', '#9a5034', '#b0623f', '#7c3d26', '#4a2416'),
      pal('smoked-oak', 'Smoked Oak', '#7a5a40', '#8f6e52', '#5c4230', '#3a2a1e'),
      pal('walnut', 'Walnut', '#5e4030', '#75523e', '#452e22', '#2a1c14'),
    ],
  }),
  floor({
    id: 'herringbone-parquet', name: 'Herringbone Parquet',
    description: '7 x 35 cm wood blocks laid at 45 degrees in a classic herringbone.',
    family: 'parquet', tags: ['wood', 'parquet', 'herringbone', 'classic', 'living', 'dining', 'hall'],
    packs: ['classic-townhouse', 'mid-century'], tier: 'premium', price: dollars(22),
    painter: 'herringbone', params: { ratio: 5, columns: 3, grain: 0.55, knots: 0.2, variation: 0.55 }, repeat: 1.5,
    // roles: base, light, dark, seam
    palettes: [
      pal('classic-oak', 'Classic Oak', '#b98b5c', '#d0a679', '#9a6e44', '#5e4128'),
      pal('golden-oak', 'Golden Oak', '#c99a5a', '#ddb377', '#a87a40', '#694622'),
      pal('bleached', 'Bleached', '#ddd0bb', '#ebe1d0', '#c8b89f', '#9a8a72'),
      pal('grey-washed', 'Grey Washed', '#a39d92', '#b8b2a8', '#8a847a', '#5c5850'),
      pal('two-tone', 'Two-Tone Oak', '#b48a60', '#e0c49d', '#7b5638', '#4f3622'),
      pal('walnut-mix', 'Walnut Mix', '#6e4c36', '#8a6247', '#533826', '#2e1e14'),
      pal('espresso', 'Espresso', '#4e3a2c', '#614a39', '#3a2a20', '#22180f'),
    ],
  }),
  floor({
    id: 'checker-tile', name: 'Checker Tile',
    description: 'Glazed 33 cm square tiles in a two-colour checkerboard with fine grout lines.',
    family: 'tile', tags: ['tile', 'checker', 'retro', 'kitchen', 'bathroom', 'laundry', 'washable'],
    packs: ['everyday-essentials', 'mid-century'], tier: 'standard', price: dollars(9),
    painter: 'checker', params: { tile: 0.33, grout: 0.003, diagonal: false, variation: 0.3 }, repeat: 1.32,
    // roles: tile A, tile B, grout
    palettes: [
      pal('black-white', 'Black and White', '#f2f0ea', '#222326', '#b8b5ad'),
      pal('cream-terracotta', 'Cream and Terracotta', '#efe6d4', '#b9654a', '#d8cfbf'),
      pal('navy-white', 'Navy and White', '#f3f1ec', '#26344f', '#c9c6bf'),
      pal('mustard-white', 'Mustard and White', '#f4efe4', '#d4a23a', '#d8d2c6'),
      pal('grey-white', 'Grey and White', '#ecebe7', '#9a9b9c', '#c4c3bf'),
      pal('sage-cream', 'Sage and Cream', '#a8b59a', '#f1ece0', '#d2cdbf'),
      pal('pink-mint', 'Pink and Mint', '#f0c9c0', '#bfdccf', '#fbf8f4'),
      pal('red-black', 'Red and Black', '#b13a32', '#1f1f21', '#8a8580'),
    ],
  }),
  floor({
    id: 'hex-mosaic', name: 'Hex Mosaic',
    description: 'Small 6 cm glazed hexagons with little rosette flowers, a classic bathroom floor.',
    family: 'tile', tags: ['tile', 'mosaic', 'hexagon', 'vintage', 'bathroom', 'kitchen', 'washable'],
    packs: ['classic-townhouse', 'everyday-essentials'], tier: 'premium', price: dollars(14),
    painter: 'hex-mosaic', params: { size: 0.03, grout: 0.0022, pattern: 'rosette', variation: 0.4 }, repeat: 1.44,
    // roles: field, accent (ring), grout, centre
    palettes: [
      pal('classic-black', 'Classic Black Flower', '#f2f1ec', '#26272a', '#cfccc4', '#b8433a'),
      pal('blue-white', 'Blue and White', '#f3f4f2', '#3c64a0', '#d2d4d2', '#8fb4dc'),
      pal('terracotta', 'Terracotta Flower', '#f0e7d8', '#b8664a', '#d9cfc0', '#e2b04d'),
      pal('celadon', 'Celadon', '#cfe0d6', '#5f8f7a', '#eef0ea', '#f3f1e6'),
      pal('blush', 'Blush', '#ebcfc7', '#c98378', '#f6eee9', '#8aa58a'),
      pal('sage-cream', 'Sage and Cream', '#a7b39b', '#eeeadf', '#8e9a83', '#d9b45a'),
      pal('charcoal', 'Charcoal and Brass', '#3a3b3e', '#d8d4ca', '#222325', '#c9a24e'),
    ],
  }),
  floor({
    id: 'carpet-plush', name: 'Plush Carpet',
    description: 'Soft cut-pile carpet with dense fibre flecks and faint vacuum lanes. Warm underfoot.',
    family: 'carpet', tags: ['carpet', 'soft', 'cosy', 'bedroom', 'living', 'kids', 'budget'],
    packs: ['everyday-essentials', 'cozy-cottage'], tier: 'budget', price: dollars(6),
    painter: 'carpet', params: { pile: 0.6, lanes: 0.4, laneWidth: 0.33, weave: 'cut' }, repeat: 1.0,
    // roles: base, light, dark
    palettes: [
      pal('oatmeal', 'Oatmeal', '#cbbba0', '#ddd0b8', '#ad9d83'),
      pal('cream', 'Cream', '#e8e0cf', '#f3ede1', '#cfc4ae'),
      pal('dove-grey', 'Dove Grey', '#a9a7a3', '#bebcb8', '#8c8a86'),
      pal('sage', 'Sage', '#93a088', '#a9b59e', '#7a8770'),
      pal('blush', 'Blush', '#dcb8ae', '#e9cbc2', '#c09a90'),
      pal('terracotta', 'Terracotta', '#b0674c', '#c27b60', '#8f503a'),
      pal('navy', 'Navy', '#2f3b57', '#3f4c6a', '#222b42'),
      pal('charcoal', 'Charcoal', '#4a4a4d', '#5e5e62', '#38383a'),
    ],
  }),
  floor({
    id: 'terrazzo-venetian', name: 'Venetian Terrazzo',
    description: 'Polished terrazzo with angular marble chips of mixed sizes set in a smooth cement ground.',
    family: 'stone', tags: ['terrazzo', 'stone', 'speckled', 'mid-century', 'kitchen', 'bathroom', 'hall', 'luxury'],
    packs: ['mid-century', 'modern-minimal'], tier: 'luxury', price: dollars(26),
    painter: 'terrazzo', params: { chip: 0.016, density: 0.55, polish: 0.5 }, repeat: 1.2,
    // roles: ground, chip A, chip B, chip C
    palettes: [
      pal('venetian-white', 'Venetian White', '#ece8e0', '#8a8780', '#c7a37c', '#3a3a3a'),
      pal('blush-confetti', 'Blush Confetti', '#f0dcd4', '#d77a6a', '#6f9a8a', '#e6b84f'),
      pal('grey-classic', 'Grey Classic', '#a8a6a1', '#e4e1da', '#5f5d59', '#c19a6b'),
      pal('sage-stone', 'Sage Stone', '#b3bba6', '#f1eee6', '#6e7a63', '#3c4438'),
      pal('terracotta-chip', 'Terracotta Chip', '#c98e6f', '#f3e6d6', '#8a4a33', '#3f3a36'),
      pal('charcoal-speckle', 'Charcoal Speckle', '#3e3f42', '#e9e6df', '#9a9893', '#c9a46a'),
      pal('navy', 'Navy Terrazzo', '#2d3850', '#e8e3d8', '#c9a25a', '#7c8aa8'),
    ],
  }),
  floor({
    id: 'concrete-polished', name: 'Polished Concrete',
    description: 'Power-trowelled concrete with soft clouding, swirl marks and saw-cut joints every 1.2 m.',
    family: 'concrete', tags: ['concrete', 'industrial', 'loft', 'minimal', 'kitchen', 'living', 'garage'],
    packs: ['industrial-loft', 'modern-minimal'], tier: 'standard', price: dollars(8),
    painter: 'concrete', params: { slab: 1.2, cloud: 0.5, aggregate: 0.35, joints: true }, repeat: 2.4,
    // roles: base, light, dark, joint
    palettes: [
      pal('natural-grey', 'Natural Grey', '#9e9c97', '#b4b2ad', '#85837e', '#5c5a56'),
      pal('white-pigment', 'White Pigment', '#d8d6d0', '#e6e4df', '#c2c0ba', '#8f8d88'),
      pal('warm-greige', 'Warm Greige', '#b2a898', '#c4bbad', '#998f80', '#6a6358'),
      pal('sand', 'Sand', '#c2b49a', '#d2c6af', '#a89a80', '#7a6e58'),
      pal('blue-grey', 'Blue Grey', '#7d8790', '#919ba3', '#68727b', '#454c52'),
      pal('terracotta-tint', 'Terracotta Tint', '#a87a62', '#ba8e76', '#8f644e', '#5e4033'),
      pal('charcoal', 'Charcoal', '#4c4d50', '#5d5e61', '#3c3d40', '#26272a'),
    ],
  }),
  floor({
    id: 'stone-pavers', name: 'Stone Pavers',
    description: 'Riven stone flags in random coursed rows with sanded joints and a little moss. For paths and patios.',
    family: 'exterior', tags: ['stone', 'paving', 'exterior', 'patio', 'path', 'garden', 'porch'],
    packs: ['garden-patio'], tier: 'standard', price: dollars(10),
    painter: 'pavers', params: { module: 0.2, joint: 0.012, texture: 0.6, moss: 0.25 }, repeat: 2.4,
    // roles: stone A, stone B, stone C, joint
    palettes: [
      pal('york-buff', 'York Buff', '#b8a88c', '#a8987c', '#c8b99e', '#5e5a4e'),
      pal('limestone', 'Limestone', '#ddd5c4', '#cfc6b3', '#e8e1d2', '#9d9584'),
      pal('sandstone', 'Sandstone', '#d3b98e', '#c4a77a', '#dfc8a2', '#8a7a5c'),
      pal('granite-grey', 'Granite Grey', '#9a9894', '#8a8884', '#aaa8a4', '#5e5c58'),
      pal('bluestone', 'Bluestone', '#6f7a80', '#5f6a70', '#808b90', '#3f4548'),
      pal('terracotta-clay', 'Terracotta Clay', '#b56d4f', '#a65f43', '#c47c5c', '#6b4a3a'),
      pal('slate', 'Slate', '#4a4f52', '#3f4447', '#575c60', '#2a2d2f'),
    ],
  }),
];

/** Every floor design: the Milestone 1 set here, then Milestone 2 (surfaces2.ts) and Milestone 10 (surfaces3/). */
export const FLOOR_DESIGNS: SurfaceDesign[] = [...FLOOR_DESIGNS_1, ...FLOOR_DESIGNS_2, ...FLOOR_DESIGNS_3];

// ---------------------------------------------------------------------------------------------
// Doors and windows
// ---------------------------------------------------------------------------------------------
//
// Style keys read by src/render/openingMeshes.ts:
//   all:     holeWidth (m, wall hole width inside the tile), frame (m, jamb lining face width),
//            casing (m, architrave width; holeWidth / 2 + casing stays within half a tile),
//            frameColor, hardware (metal colour)
//   doors:   leaf 'panel' | 'glazed' | 'plank' | 'flush' | 'fullglass' | 'dutch' | 'louvre', leafColor,
//            panelRows (panel/glazed lower part), litesX/litesY (glazed upper part or full glass),
//            handle 'knob' | 'lever'
//   windows: window 'sash' | 'casement' | 'fixed' | 'slider', litesX/litesY (per sash or casement),
//            transom (casement: fixed top light), single (casement: one sash), member (m, member width),
//            glass 'clear' | 'frosted'

const opening = (d: Omit<OpeningDef, 'status'>): OpeningDef => ({ ...d, status: 'ready' });

const OPENINGS_1: OpeningDef[] = [
  opening({
    id: 'door-panel', kind: 'door', name: 'Four-Panel Door',
    description: 'A painted interior door with four raised panels and a brass knob.',
    tags: ['door', 'interior', 'panelled', 'classic', 'painted'], packs: ['everyday-essentials'],
    tier: 'budget', price: dollars(180), width: 1, height: 2.1, sill: 0,
    style: {
      holeWidth: 0.86, frame: 0.05, casing: 0.06, frameColor: '#f1ede4', hardware: '#b8955a',
      leaf: 'panel', leafColor: '#f1ede4', panelRows: 2, handle: 'knob',
    },
  }),
  opening({
    id: 'door-glazed', kind: 'door', name: 'Glazed Front Door',
    description: 'A deep green front door with six glass lights above two panels and a brass lever.',
    tags: ['door', 'front', 'exterior', 'glazed', 'classic'], packs: ['classic-townhouse'],
    tier: 'standard', price: dollars(420), width: 1, height: 2.1, sill: 0,
    style: {
      holeWidth: 0.86, frame: 0.055, casing: 0.065, frameColor: '#f3f0e8', hardware: '#c29d5c',
      leaf: 'glazed', leafColor: '#2f4a3c', litesX: 2, litesY: 3, panelRows: 1, handle: 'lever',
    },
  }),
  opening({
    id: 'door-plank', kind: 'door', name: 'Ledged Cottage Door',
    description: 'Oiled oak boards on ledges and a brace, with black iron hardware.',
    tags: ['door', 'rustic', 'cottage', 'wood', 'interior', 'exterior'], packs: ['cozy-cottage'],
    tier: 'budget', price: dollars(140), width: 1, height: 2.1, sill: 0,
    style: {
      holeWidth: 0.84, frame: 0.05, casing: 0.06, frameColor: '#8a6440', hardware: '#262626',
      leaf: 'plank', leafColor: '#9a6a40', handle: 'lever',
    },
  }),
  opening({
    id: 'window-sash', kind: 'window', name: 'Sash Window',
    description: 'A painted timber sash window: two sliding sashes of four panes each.',
    tags: ['window', 'sash', 'classic', 'painted'], packs: ['everyday-essentials', 'classic-townhouse'],
    tier: 'standard', price: dollars(260), width: 1, height: 1.2, sill: 0.9,
    style: {
      holeWidth: 0.78, frame: 0.05, casing: 0.07, frameColor: '#f3f0e8', hardware: '#b8955a',
      window: 'sash', litesX: 2, litesY: 2, glass: 'clear',
    },
  }),
  opening({
    id: 'window-wide', kind: 'window', name: 'Wide Casement Window',
    description: 'Two side-hung casements under a fixed top light, filling most of the wall tile.',
    tags: ['window', 'casement', 'wide', 'bright', 'modern'], packs: ['everyday-essentials', 'modern-minimal'],
    tier: 'standard', price: dollars(340), width: 1, height: 1.2, sill: 0.9,
    style: {
      holeWidth: 0.88, frame: 0.045, casing: 0.055, frameColor: '#f3f2ee', hardware: '#9a9ea3',
      window: 'casement', litesX: 1, litesY: 1, transom: true, glass: 'clear',
    },
  }),
  opening({
    id: 'window-high', kind: 'window', name: 'Frosted High Window',
    description: 'A short fixed window set high for privacy, with frosted glass. Good for bathrooms.',
    tags: ['window', 'frosted', 'privacy', 'bathroom', 'small'], packs: ['everyday-essentials'],
    tier: 'budget', price: dollars(150), width: 1, height: 0.55, sill: 1.55,
    style: {
      holeWidth: 0.72, frame: 0.045, casing: 0.06, frameColor: '#f3f2ee', hardware: '#9a9ea3',
      window: 'fixed', litesX: 1, litesY: 1, glass: 'frosted',
    },
  }),
];

/** Every door and window: the Milestone 1 set here, then Milestone 2 (surfaces2.ts) and Milestone 10 (surfaces3/). */
export const OPENINGS: OpeningDef[] = [...OPENINGS_1, ...OPENINGS_2, ...OPENINGS_3];

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** The palette with `paletteId`, or the design default (palettes[0]) when it does not exist. */
export function findPalette(design: SurfaceDesign, paletteId: string): Palette {
  const p = design.palettes.find((x) => x.id === paletteId) ?? design.palettes[0];
  if (!p) throw new Error(`Surface design '${design.id}' has no palettes`);
  return p;
}

/** The default finish of a design (its first palette). */
export function defaultFinish(design: SurfaceDesign): FinishRef {
  return { designId: design.id, paletteId: findPalette(design, '').id };
}

/** Tier implied by a price, used to keep tiers and prices consistent. */
export function tierForPrice(surface: 'wall' | 'floor', price: number): PriceTier {
  const d = price / 100;
  if (surface === 'wall') return d < 6 ? 'budget' : d <= 12 ? 'standard' : d < 25 ? 'premium' : 'luxury';
  return d < 7 ? 'budget' : d <= 12 ? 'standard' : d < 25 ? 'premium' : 'luxury';
}

export type PaletteTone = 'light' | 'dark' | 'neutral' | 'accent';

/** CIE L* (0..100) and RGB chroma (0..1) of a '#rrggbb' colour. */
export function colorMetrics(hex: string): { lightness: number; chroma: number } {
  const n = parseInt(hex.slice(1, 7), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const lin = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const y = 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
  const lightness = y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
  return { lightness, chroma: Math.max(...rgb) - Math.min(...rgb) };
}

/**
 * Catalog colour filter for a palette, from its dominant colour (colors[0]): dark (L* < 40), accent
 * (saturated), light (L* >= 80) or neutral.
 */
export function paletteTone(p: Palette): PaletteTone {
  const c = p.colors[0];
  if (!c) return 'neutral';
  const { lightness, chroma } = colorMetrics(c);
  if (lightness < 40) return 'dark';
  if (chroma >= 0.25) return 'accent';
  if (lightness >= 80) return 'light';
  return 'neutral';
}
