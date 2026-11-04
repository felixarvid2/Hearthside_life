// Milestone 10 surface designs, group 'floors-c': carpets and textiles, concrete and industrial, exterior paving,
// decking, gravel and paths. Written by the content agent of this group only; wired into the catalog once in ./index.ts.
// Helpers: ./kit.ts. Sources: dev/surfaces-ai/sources/floors-c.mjs (the pilot sources are in pilot.mjs). Painters of
// this group: src/render/textures/packs/floors-c.ts (paver-bond, carpet-pattern, crazy-paving, stepping-stones, fan-setts,
// grass-pavers, raked-garden, grating, rubber-floor); the rest are shared (map-floor, map-boards, motif-floor).

import type { SurfaceDesign } from '../types';
import { shd, floor, make, plain, type Tuple } from './kit';

// roles: base, light, dark, grout/joint (the map tint is [base, light, dark])
const fibre = make((c) => [c!, shd(c!, 0.22), shd(c!, -0.32), shd(c!, -0.5)]);
// tuples [id, name, colour, joint]: units in a bond over a joint colour
const bond = make((c, j) => [c!, shd(c!, 0.2), shd(c!, -0.28), j ?? shd(c!, -0.5)]);
// roles: ground, motif, accent (filler motif, unused here), grout (unused outside the tile layout)
const printP = make((g, m) => [g!, m!, shd(m!, 0.4), shd(g!, -0.3)]);

const CARPETS: Tuple[] = [
  ['oatmeal', 'Oatmeal', '#cbbba0'], ['cream', 'Cream', '#e8e0cf'], ['dove-grey', 'Dove Grey', '#a9a7a3'], ['sage', 'Sage', '#93a088'],
  ['blush', 'Blush', '#dcb8ae'], ['terracotta', 'Terracotta', '#b0674c'], ['teal', 'Teal', '#4a8a86'], ['navy', 'Navy', '#2f3b57'],
  ['charcoal', 'Charcoal', '#4a4a4d'],
];
const JEWELS: Tuple[] = [
  ['emerald', 'Emerald', '#2f6b52'], ['sapphire', 'Sapphire', '#2d4f86'], ['ruby', 'Ruby', '#8e2f3c'], ['amethyst', 'Amethyst', '#6a4a86'],
  ['gold', 'Antique Gold', '#c3a050'], ['ivory', 'Ivory', '#ece6d6'], ['pewter', 'Pewter', '#8d8f94'], ['onyx', 'Onyx', '#2b2b30'],
];
const NATURALS: Tuple[] = [
  ['natural', 'Natural', '#c4a876'], ['bleached', 'Bleached', '#dcd0b4'], ['grey-wash', 'Grey Wash', '#a8a498'], ['chocolate', 'Chocolate', '#6f523a'],
  ['sage-wash', 'Sage Wash', '#98a68a'], ['indigo', 'Indigo', '#3f4d6e'], ['honey', 'Honey', '#b8903f'],
];
const CONCRETES: Tuple[] = [
  ['natural-grey', 'Natural Grey', '#9e9c97'], ['white-pigment', 'White Pigment', '#d8d6d0'], ['warm-greige', 'Warm Greige', '#b2a898'],
  ['sand', 'Sand', '#c2b49a'], ['blue-grey', 'Blue Grey', '#7d8790'], ['terracotta-tint', 'Terracotta Tint', '#a87a62'], ['charcoal', 'Charcoal', '#4c4d50'],
];
const BRICKS: Tuple[] = [
  ['red', 'Brindle Red', '#a5523a', '#b8aa94'], ['buff', 'Buff', '#cdb68c', '#a89a80'], ['charcoal', 'Charcoal', '#4a4c50', '#8a8680'],
  ['orange', 'Terracotta Orange', '#c47a4a', '#b0a28a'], ['grey', 'Stone Grey', '#9a9894', '#7a7874'], ['brown', 'Chocolate Brown', '#6a4538', '#9a8e7e'],
  ['cream', 'Cream', '#e0d4b8', '#b8aa94'],
];
const SLABS: Tuple[] = [
  ['york', 'York Buff', '#b8a88c', '#6e6a5c'], ['limestone', 'Limestone', '#ddd5c4', '#a39b8a'], ['sandstone', 'Sandstone', '#d3b98e', '#8a7a5c'],
  ['granite', 'Granite Grey', '#9a9894', '#5e5c58'], ['bluestone', 'Bluestone', '#6f7a80', '#3f4548'], ['terracotta', 'Terracotta Clay', '#b56d4f', '#6b4a3a'],
  ['slate', 'Slate', '#4a4f52', '#2a2d2f'], ['white', 'Bright White', '#ebe8e0', '#b6b2a8'],
];
const DECKS: Tuple[] = [
  ['cedar', 'Cedar', '#b0764a', '#3a2a1e'], ['silver', 'Weathered Silver', '#a39b8c', '#3c3a36'], ['teak', 'Teak', '#a8774a', '#3a2a1e'],
  ['grey-stain', 'Grey Stain', '#8a8d8e', '#2e3032'], ['walnut', 'Dark Walnut', '#5a4030', '#201812'], ['pine', 'Pressure-Treated Pine', '#b0a064', '#3e3a22'],
  ['ipe', 'Ipe', '#7a4a32', '#241812'], ['whitewash', 'Whitewashed', '#d8d0c0', '#6a645a'],
];
const GRAVELS: Tuple[] = [
  ['grey', 'Mixed Grey', '#8f9094'], ['golden', 'Golden', '#b89a66'], ['white', 'White', '#cfcdc4'], ['slate', 'Blue Slate', '#6a7682'],
  ['pink', 'Pink Granite', '#b08a80'], ['black', 'Black Basalt', '#46484b'], ['sand', 'Sand', '#d3c29a'],
];

export const FLOORS_C: SurfaceDesign[] = [
  // --- carpets and textile floors ---------------------------------------------------------------------------------
  floor({
    id: 'carpet-rocket-kids', name: 'Rocket Play Carpet',
    description: 'A looped kids carpet with little cartoon rockets scattered at playful angles across the pile.',
    family: 'carpet', tags: ['carpet', 'kids', 'rocket', 'space', 'playful', 'nursery', 'bedroom', 'playroom'],
    packs: ['kids-storybook'], price: 11,
    painter: 'motif-floor',
    params: { motif: 'motif-rocket', ground: 'fibre-berber', groundScale: 0.5, groundContrast: 0.5, layout: 'scatter', cols: 4, rows: 4, size: 0.7, rotate: 20, rotJitter: 40, scaleJitter: 0.2 },
    repeat: 2,
    palettes: printP([
      ['navy-cream', 'Navy and Cream', '#27355a', '#efe6d0'], ['sky-white', 'Sky and White', '#9cc3df', '#f6f4ee'],
      ['mint-coral', 'Mint and Coral', '#b7dccb', '#e4806a'], ['sun-navy', 'Sunshine and Navy', '#e8c35a', '#2a3550'],
      ['charcoal-orange', 'Charcoal and Orange', '#3b3e44', '#ee9441'], ['blush-white', 'Blush and White', '#eec6c4', '#fbf8f2'],
    ] as Tuple[]),
  }),
  floor({
    id: 'carpet-shag', name: 'Shag Pile',
    description: 'Deep, tousled shag pile in long yarns. Very soft underfoot and a little retro.',
    family: 'carpet', tags: ['carpet', 'shag', 'deep-pile', 'retro', 'cosy', 'bedroom', 'living', 'nursery'],
    packs: ['mid-century', 'cozy-cottage'], price: 14,
    painter: 'map-floor', params: { map: 'pile-shag', tiles: 1, cell: 0 }, repeat: 1.2,
    palettes: fibre(CARPETS),
  }),
  floor({
    id: 'carpet-saxony', name: 'Saxony Cut Pile',
    description: 'Dense, even cut pile whose twisted yarn ends give a fine, velvety speckle. The classic bedroom carpet.',
    family: 'carpet', tags: ['carpet', 'saxony', 'cut-pile', 'twist', 'soft', 'bedroom', 'living', 'stairs'],
    packs: ['everyday-essentials', 'classic-townhouse'], price: 10,
    painter: 'map-floor', params: { map: 'pile-saxony', tiles: 2, cell: 0 }, repeat: 1.0,
    palettes: fibre(CARPETS),
  }),
  floor({
    id: 'carpet-frieze', name: 'Frieze Twist',
    description: 'Short curly yarns tangled in every direction, hiding footprints and wear. A hard-working family carpet.',
    family: 'carpet', tags: ['carpet', 'frieze', 'twist', 'textured', 'family', 'living', 'hall', 'kids'],
    packs: ['everyday-essentials', 'cozy-cottage'], price: 12,
    painter: 'map-floor', params: { map: 'pile-frieze', tiles: 2, cell: 0 }, repeat: 1.0,
    palettes: fibre(CARPETS),
  }),
  floor({
    id: 'carpet-velvet', name: 'Velvet Plush',
    description: 'A very short, dense plush that shows light and dark sweeps like velvet. Deep jewel colours for formal rooms.',
    family: 'carpet', tags: ['carpet', 'velvet', 'plush', 'luxury', 'formal', 'bedroom', 'living', 'dressing-room'],
    packs: ['classic-townhouse', 'art-deco'], price: 26,
    painter: 'map-floor', params: { map: 'pile-velvet', tiles: 2, cell: 0 }, repeat: 1.2,
    palettes: fibre([...JEWELS, ['cream', 'Cream', '#e8e0cf']] as Tuple[]),
  }),
  floor({
    id: 'carpet-boucle', name: 'Wool Bouclé',
    description: 'Nubby looped wool in tight knots, like a bouclé armchair laid across the floor. Warm, sculptural and quiet.',
    family: 'carpet', tags: ['carpet', 'boucle', 'wool', 'looped', 'textured', 'modern', 'bedroom', 'living'],
    packs: ['modern-minimal', 'mid-century'], price: 18,
    painter: 'map-floor', params: { map: 'wool-boucle', tiles: 1, cell: 0 }, repeat: 1.2,
    palettes: fibre(CARPETS),
  }),
  floor({
    id: 'carpet-tweed', name: 'Herringbone Tweed',
    description: 'A flat-woven wool carpet in a fine twill herringbone with flecked yarns. Smart, tailored and hard-wearing.',
    family: 'carpet', tags: ['carpet', 'tweed', 'herringbone', 'flatweave', 'wool', 'study', 'hall', 'stairs', 'living'],
    packs: ['classic-townhouse', 'cozy-cottage'], price: 16,
    painter: 'map-floor', params: { map: 'wool-tweed', tiles: 2, cell: 0 }, repeat: 1.0,
    palettes: fibre(CARPETS),
  }),
  floor({
    id: 'carpet-jute', name: 'Chunky Jute',
    description: 'Thick braided jute fibre in a bold herringbone weave. Earthy, natural and good-looking at the edges.',
    family: 'carpet', tags: ['carpet', 'jute', 'natural', 'woven', 'braided', 'coastal', 'living', 'hall', 'bedroom'],
    packs: ['coastal-home', 'botanical-living'], price: 13,
    painter: 'map-floor', params: { map: 'weave-jute', tiles: 1, cell: 0 }, repeat: 1.0,
    palettes: fibre(NATURALS),
  }),
  floor({
    id: 'carpet-seagrass', name: 'Seagrass Matting',
    description: 'Flat twisted seagrass in a tight checkerboard weave. Smooth underfoot, stain-resistant and very natural.',
    family: 'carpet', tags: ['carpet', 'seagrass', 'natural', 'woven', 'matting', 'coastal', 'hall', 'living', 'conservatory'],
    packs: ['coastal-home', 'botanical-living'], price: 12,
    painter: 'map-floor', params: { map: 'weave-seagrass', tiles: 1, cell: 0 }, repeat: 1.0,
    palettes: fibre(NATURALS),
  }),
  floor({
    id: 'carpet-coir', name: 'Coir Matting',
    description: 'Coarse coconut-fibre matting in a diamond twill. Cheap, tough and unmistakably rustic.',
    family: 'carpet', tags: ['carpet', 'coir', 'matting', 'natural', 'rustic', 'budget', 'hall', 'porch', 'utility'],
    packs: ['everyday-essentials', 'cozy-cottage'], price: 6,
    painter: 'map-floor', params: { map: 'weave-coir', tiles: 1, cell: 0 }, repeat: 1.0,
    palettes: fibre([['coir-brown', 'Coir Brown', '#8a6a48'], ['coir-natural', 'Natural', '#b09468'], ['coir-grey', 'Grey', '#8c8780'], ['coir-charcoal', 'Charcoal', '#4a4640'],
      ['coir-russet', 'Russet', '#8e5a3a'], ['coir-ivory', 'Ivory', '#d8ccb0']] as Tuple[]),
  }),
  floor({
    id: 'carpet-tiles-modular', name: 'Modular Carpet Tiles',
    description: 'Half-metre loop-pile carpet tiles laid square, each with its own slight tone. Practical for studies and offices.',
    family: 'carpet', tags: ['carpet', 'tiles', 'modular', 'loop-pile', 'office', 'study', 'playroom', 'basement'],
    packs: ['modern-minimal', 'industrial-loft'], price: 9,
    painter: 'paver-bond', params: { map: 'pile-loop-fine', bond: 'stack', unitW: 0.5, unitH: 0.5, joint: 0.002, mapScale: 0.5, variation: 0.7, bevel: 0.15, round: 0 }, repeat: 2.0,
    palettes: bond(CARPETS.map(([id, n, c]) => [id!, n!, c!, shd(c!, -0.4)] as Tuple)),
  }),
  floor({
    id: 'carpet-tiles-plank', name: 'Carpet Plank Tiles',
    description: 'Long felted carpet planks laid in a brick pattern, so the floor reads like wood but feels like carpet.',
    family: 'carpet', tags: ['carpet', 'planks', 'tiles', 'felt', 'modern', 'office', 'study', 'living'],
    packs: ['modern-minimal', 'mid-century'], price: 12,
    painter: 'paver-bond', params: { map: 'felt-needle', bond: 'running', unitW: 1.0, unitH: 0.25, joint: 0.002, mapScale: 0.5, variation: 0.8, bevel: 0.15, round: 0 }, repeat: 2.0,
    palettes: bond(CARPETS.map(([id, n, c]) => [id!, n!, c!, shd(c!, -0.4)] as Tuple)),
  }),
  floor({
    id: 'carpet-stripe', name: 'Broadloom Stripe',
    description: 'A woven broadloom with a wide band and fine pin lines running the length of the room. Smart in hallways and on stairs.',
    family: 'carpet', tags: ['carpet', 'stripe', 'woven', 'broadloom', 'classic', 'hall', 'stairs', 'bedroom', 'living'],
    packs: ['classic-townhouse', 'cozy-cottage'], price: 15,
    painter: 'carpet-pattern', params: { style: 'stripe', size: 0.5, pile: 'pile-saxony', pileAlpha: 0.25 }, repeat: 2.0,
    // roles: ground, band, pin line, accent
    palettes: make((g, b) => [g!, b!, shd(b!, 0.35), shd(g!, -0.2)])([
      ['cream-navy', 'Cream and Navy', '#e6dcc4', '#2f3b57'], ['oat-sage', 'Oat and Sage', '#cbbba0', '#7a8a6c'], ['grey-claret', 'Grey and Claret', '#a9a7a3', '#7a2f3c'],
      ['navy-gold', 'Navy and Gold', '#2f3b57', '#c3a050'], ['blush-teal', 'Blush and Teal', '#dcb8ae', '#3f7f7c'], ['charcoal-cream', 'Charcoal and Cream', '#4a4a4d', '#e8e0cf'],
      ['forest-tan', 'Forest and Tan', '#2f4a3c', '#c8ad82'],
    ] as Tuple[]),
  }),
  floor({
    id: 'carpet-houndstooth', name: 'Houndstooth Wool',
    description: 'Classic broken-check houndstooth woven into a wool carpet. Sharp, tailored and best in small doses.',
    family: 'carpet', tags: ['carpet', 'houndstooth', 'check', 'woven', 'wool', 'classic', 'study', 'hall', 'dressing-room'],
    packs: ['classic-townhouse', 'art-deco'], price: 19,
    painter: 'carpet-pattern', params: { style: 'houndstooth', size: 0.25, pile: 'wool-tweed', pileAlpha: 0.2 }, repeat: 2.0,
    // roles: light thread, dark thread, unused, overcheck
    palettes: make((l, d) => [l!, d!, shd(d!, 0.3), shd(l!, -0.3)])([
      ['cream-black', 'Cream and Black', '#ece6d6', '#26272a'], ['navy-ivory', 'Navy and Ivory', '#2d3a5a', '#e8e2d2'], ['brown-oat', 'Brown and Oat', '#5a4030', '#d8c9a8'],
      ['grey-white', 'Grey and White', '#8e9094', '#e6e4de'], ['green-cream', 'Green and Cream', '#2f5a42', '#e6dfc8'], ['red-cream', 'Red and Cream', '#9a2f36', '#ece3d0'],
    ] as Tuple[]),
  }),
  floor({
    id: 'carpet-tartan', name: 'Tartan Plaid',
    description: 'A woven tartan sett with a faint twill, crossing bands of colour over a deep ground. Lodge and library warmth.',
    family: 'carpet', tags: ['carpet', 'tartan', 'plaid', 'check', 'lodge', 'cabin', 'study', 'living', 'bedroom'],
    packs: ['cozy-cottage', 'classic-townhouse'], price: 17,
    painter: 'carpet-pattern', params: { style: 'tartan', size: 0.7, pile: 'wool-tweed', pileAlpha: 0.2 }, repeat: 2.1,
    // roles: ground, band A, band B, fine line
    palettes: plain([
      ['royal', 'Royal', '#27365c', '#2f6b52', '#8e2f3c', '#e8d9a0'], ['hunter', 'Hunter', '#2f4a3c', '#27365c', '#7a2f3c', '#e0cf8e'], ['claret', 'Claret', '#6a2a34', '#27365c', '#2f4a3c', '#e0cf8e'],
      ['grey-check', 'Dress Grey', '#6a6c70', '#2b2b30', '#c8c4b8', '#8e2f3c'], ['cream-rose', 'Cream and Rose', '#e8e0cf', '#b86a72', '#6c8a76', '#4a4a4d'], ['navy-mustard', 'Navy and Mustard', '#2f3b57', '#c3a050', '#6c8a76', '#e8e0cf'],
    ] as Tuple[]),
  }),
  floor({
    id: 'carpet-trellis', name: 'Diamond Trellis',
    description: 'A lattice of crossing diagonals with a dot at every crossing and a tiny flower inside each diamond. Hallways and landings.',
    family: 'carpet', tags: ['carpet', 'trellis', 'lattice', 'diamond', 'geometric', 'woven', 'hall', 'stairs', 'bedroom'],
    packs: ['classic-townhouse', 'art-deco'], price: 16,
    painter: 'carpet-pattern', params: { style: 'trellis', size: 0.3, pile: 'pile-saxony', pileAlpha: 0.22 }, repeat: 2.1,
    // roles: ground, lattice, crossing dots, flowers
    palettes: make((g, l) => [g!, l!, shd(l!, -0.2), shd(l!, 0.4)])([
      ['cream-sage', 'Cream and Sage', '#e6dcc4', '#8a9a7c'], ['navy-gold', 'Navy and Gold', '#2f3b57', '#c3a050'], ['claret-cream', 'Claret and Cream', '#6a2a34', '#e0d2b4'],
      ['grey-blush', 'Grey and Blush', '#a9a7a3', '#dcb8ae'], ['teal-ivory', 'Teal and Ivory', '#3f7f7c', '#e8e2d2'], ['charcoal-silver', 'Charcoal and Silver', '#3a3a3e', '#a9adb4'],
    ] as Tuple[]),
  }),
  floor({
    id: 'carpet-stars', name: 'Starry Nursery Carpet',
    description: 'Plump little stars scattered over a soft looped pile, like a night sky for crawling babies.',
    family: 'carpet', tags: ['carpet', 'stars', 'night-sky', 'kids', 'nursery', 'playful', 'bedroom', 'playroom'],
    packs: ['kids-storybook'], price: 12,
    painter: 'motif-floor',
    params: { motif: 'motif-star', ground: 'pile-loop-fine', groundScale: 0.5, groundContrast: 0.5, layout: 'scatter', cols: 5, rows: 5, size: 0.55, rotate: 0, rotJitter: 30, scaleJitter: 0.25 },
    repeat: 2,
    palettes: printP([
      ['navy-gold', 'Navy and Gold', '#27355a', '#e8c35a'], ['cream-sky', 'Cream and Sky', '#efe6d0', '#8bb6d6'], ['mint-white', 'Mint and White', '#b7dccb', '#f6f4ee'],
      ['blush-cream', 'Blush and Cream', '#eec6c4', '#fbf4e4'], ['charcoal-yellow', 'Charcoal and Yellow', '#3b3e44', '#f0cf5c'], ['lilac-white', 'Lilac and White', '#c3b4d8', '#f8f5fa'],
    ] as Tuple[]),
  }),
  floor({
    id: 'carpet-medallion', name: 'Medallion Carpet',
    description: 'Large oriental medallions in a woven wool, laid in a regular grid. Formal, rich and unashamedly traditional.',
    family: 'carpet', tags: ['carpet', 'oriental', 'medallion', 'persian', 'traditional', 'wool', 'living', 'study', 'dining'],
    packs: ['classic-townhouse'], price: 29,
    painter: 'motif-floor',
    params: { motif: 'motif-medallion', ground: 'wool-tweed', groundScale: 0.6, groundContrast: 0.5, layout: 'grid', cols: 2, rows: 2, size: 0.82, rotate: 0 },
    repeat: 2.4,
    palettes: printP([
      ['red-ivory', 'Madder Red and Ivory', '#8e2f3c', '#e8dcc0'], ['navy-gold', 'Navy and Gold', '#27365c', '#d3b261'], ['ivory-navy', 'Ivory and Navy', '#e8e0cf', '#2f3b57'],
      ['forest-cream', 'Forest and Cream', '#2f4a3c', '#e4dcc6'], ['rust-sand', 'Rust and Sand', '#9a5a38', '#e0cfa8'], ['charcoal-rose', 'Charcoal and Rose', '#3a3a3e', '#c98090'],
    ] as Tuple[]),
  }),
  floor({
    id: 'carpet-paisley', name: 'Paisley Carpet',
    description: 'Curling paisley teardrops dropped half a step in each column. Boho, layered and full of movement.',
    family: 'carpet', tags: ['carpet', 'paisley', 'boteh', 'boho', 'eclectic', 'living', 'bedroom', 'hall'],
    packs: ['botanical-living', 'creative-studio'], price: 21,
    painter: 'motif-floor',
    params: { motif: 'motif-paisley', ground: 'wool-boucle', groundScale: 0.6, groundContrast: 0.4, layout: 'half-drop', cols: 4, rows: 4, size: 0.8, rotate: 30, mirror: true },
    repeat: 2.4,
    palettes: printP([
      ['navy-cream', 'Navy and Cream', '#2f3b57', '#e8e0cf'], ['teal-mustard', 'Teal and Mustard', '#2f7f80', '#d9a641'], ['plum-blush', 'Plum and Blush', '#5a3550', '#e0b8b0'],
      ['cream-terracotta', 'Cream and Terracotta', '#e8e0cf', '#b0674c'], ['forest-gold', 'Forest and Gold', '#2f4a3c', '#d3b261'], ['charcoal-coral', 'Charcoal and Coral', '#33363b', '#e4806a'],
    ] as Tuple[]),
  }),
  floor({
    id: 'carpet-paw-prints', name: 'Paw Print Carpet',
    description: 'Muddy-looking paw prints padding across a hard-wearing loop pile in alternate rows. For pet people and playrooms.',
    family: 'carpet', tags: ['carpet', 'paw-prints', 'pets', 'dog', 'playful', 'kids', 'playroom', 'hall', 'bedroom'],
    packs: ['kids-storybook', 'everyday-essentials'], price: 11,
    painter: 'motif-floor',
    params: { motif: 'motif-paw', ground: 'pile-loop-fine', groundScale: 0.5, groundContrast: 0.5, layout: 'brick', cols: 4, rows: 4, size: 0.5, rotate: 25, rotJitter: 15, mirror: true },
    repeat: 2,
    palettes: printP([
      ['oat-brown', 'Oat and Brown', '#d3c5ae', '#6f523a'], ['grey-charcoal', 'Grey and Charcoal', '#a9a7a3', '#46464a'], ['cream-sage', 'Cream and Sage', '#e8e0cf', '#8a9a7c'],
      ['navy-sky', 'Navy and Sky', '#2f3b57', '#8bb6d6'], ['sage-cream', 'Sage and Cream', '#93a088', '#efe6d0'], ['blush-rose', 'Blush and Rose', '#eec6c4', '#c98085'],
    ] as Tuple[]),
  }),
  floor({
    id: 'carpet-kilim', name: 'Kilim Diamond Carpet',
    description: 'Flat-woven kilim squares, each with a stepped diamond, edged with a fine line. Bright, geometric and handmade-looking.',
    family: 'carpet', tags: ['carpet', 'kilim', 'flatweave', 'geometric', 'diamond', 'boho', 'living', 'hall', 'bedroom'],
    packs: ['botanical-living', 'creative-studio'], price: 24,
    painter: 'motif-floor',
    params: { motif: 'motif-kilim', ground: 'wool-tweed', groundScale: 0.6, groundContrast: 0.5, layout: 'tile', cols: 4, size: 0.84, grout: 0.004, groutColor: 'accent', spin: 'none' },
    repeat: 2.4,
    palettes: printP([
      ['sand-rust', 'Sand and Rust', '#e0d2b4', '#a8553a'], ['ivory-indigo', 'Ivory and Indigo', '#ece6d6', '#35476b'], ['rust-cream', 'Rust and Cream', '#a8553a', '#ece0c4'],
      ['teal-sand', 'Teal and Sand', '#2f7f80', '#e0d2b4'], ['charcoal-ochre', 'Charcoal and Ochre', '#3a3a3e', '#d3a040'], ['sage-ivory', 'Sage and Ivory', '#93a088', '#ece6d6'],
    ] as Tuple[]),
  }),

  // --- concrete and industrial ----------------------------------------------------------------------------------
  floor({
    id: 'concrete-power-float', name: 'Power-Floated Concrete',
    description: 'A burnished power-floated slab with soft trowel swirls and cloudy tone. The factory floor, brought indoors.',
    family: 'concrete', tags: ['concrete', 'power-float', 'burnished', 'industrial', 'loft', 'kitchen', 'living', 'garage'],
    packs: ['industrial-loft', 'modern-minimal'], price: 9,
    painter: 'map-floor', params: { map: 'concrete-trowel', tiles: 1, cell: 0 }, repeat: 2.0,
    palettes: fibre(CONCRETES),
  }),
  floor({
    id: 'concrete-saw-cut', name: 'Saw-Cut Concrete Slabs',
    description: 'Ground concrete slabs separated by neat saw cuts, each bay a slightly different tone. Sleek and architectural.',
    family: 'concrete', tags: ['concrete', 'slabs', 'saw-cut', 'ground', 'modern', 'minimal', 'living', 'kitchen', 'studio'],
    packs: ['modern-minimal', 'industrial-loft'], price: 11,
    painter: 'map-floor', params: { map: 'concrete-smooth', cell: 1.0, scale: 1.4, grout: 0.005, variation: 0.35, bevel: 0.1 }, repeat: 2.0,
    palettes: fibre(CONCRETES),
  }),
  floor({
    id: 'concrete-broomed', name: 'Broomed Concrete',
    description: 'Concrete dragged with a stiff broom while it set, leaving fine parallel scratches for grip. Garages, ramps and steps.',
    family: 'concrete', tags: ['concrete', 'broomed', 'non-slip', 'utility', 'garage', 'patio', 'path', 'workshop', 'budget'],
    packs: ['industrial-loft', 'garden-patio'], price: 6,
    painter: 'map-floor', params: { map: 'concrete-broom', tiles: 2, cell: 0 }, repeat: 2.0,
    palettes: fibre(CONCRETES),
  }),
  floor({
    id: 'concrete-acid-stain', name: 'Acid-Stained Concrete',
    description: 'Concrete etched and stained so the colour pools in clouds and fine veins, like marbled leather. Each room looks different.',
    family: 'concrete', tags: ['concrete', 'acid-stained', 'mottled', 'marbled', 'luxury', 'living', 'studio', 'retail'],
    packs: ['industrial-loft', 'mid-century'], price: 22,
    painter: 'map-floor', params: { map: 'concrete-stain', tiles: 1, cell: 0 }, repeat: 2.0,
    palettes: fibre([
      ['rust', 'Rust', '#9a5a38'], ['amber', 'Amber', '#b8863f'], ['teal', 'Verdigris', '#4f7f78'], ['cola', 'Cola', '#5a3e2c'],
      ['slate-blue', 'Slate Blue', '#586c80'], ['sage', 'Sage', '#8a9a7a'], ['graphite', 'Graphite', '#4c4d50'], ['bone', 'Bone', '#cfc6b2'],
    ] as Tuple[]),
  }),
  floor({
    id: 'industrial-epoxy-flake', name: 'Epoxy Flake Floor',
    description: 'A glossy epoxy coating with scattered coloured flakes broadcast into it. Showroom-clean garage and workshop flooring.',
    family: 'concrete', tags: ['epoxy', 'flake', 'garage', 'workshop', 'utility', 'industrial', 'basement', 'laundry'],
    packs: ['industrial-loft', 'everyday-essentials'], price: 15,
    painter: 'map-floor', params: { map: 'epoxy-flake', tiles: 2, cell: 0 }, repeat: 1.6,
    palettes: fibre([
      ['granite-grey', 'Granite Grey', '#8c8d90'], ['tan-blend', 'Tan Blend', '#b4a17e'], ['slate-blue', 'Slate Blue', '#667789'], ['charcoal', 'Charcoal', '#46474b'],
      ['cream-flake', 'Cream', '#d6ccb4'], ['safety-red', 'Safety Red', '#9a4038'], ['forest', 'Forest', '#4f6a58'],
    ] as Tuple[]),
  }),
  floor({
    id: 'industrial-grating', name: 'Steel Bar Grating',
    description: 'Open steel bar grating with twisted cross rods over a dark void, for walkways, mezzanines and boiler rooms.',
    family: 'concrete', tags: ['steel', 'grating', 'mesh', 'walkway', 'mezzanine', 'industrial', 'loft', 'workshop'],
    packs: ['industrial-loft'], price: 28,
    painter: 'grating', params: { pitch: 0.045, cross: 0.1, wear: 0.4 }, repeat: 1.0,
    // roles: steel, light, dark, void
    palettes: make((c, v) => [c!, shd(c!, 0.35), shd(c!, -0.4), v!])([
      ['galvanised', 'Galvanised', '#aab0b4', '#2a2d32'], ['mild-steel', 'Mild Steel', '#7e8388', '#24272a'], ['black-steel', 'Black Painted', '#3c3d40', '#18181a'],
      ['safety-yellow', 'Safety Yellow', '#c8a830', '#16161a'], ['machine-green', 'Machine Green', '#4f6a5a', '#101614'], ['blue-steel', 'Navy Painted', '#3a4a64', '#0e1218'],
      ['stainless', 'Stainless', '#c3c7ca', '#1e2024'],
    ] as Tuple[]),
  }),
  floor({
    id: 'industrial-rubber-studs', name: 'Studded Rubber Tiles',
    description: 'Metre-scale rubber tiles moulded with round studs in staggered rows. Grippy, quiet and easy to wipe.',
    family: 'concrete', tags: ['rubber', 'studs', 'studded', 'non-slip', 'gym', 'workshop', 'garage', 'utility', 'playroom'],
    packs: ['industrial-loft', 'everyday-essentials'], price: 16,
    painter: 'rubber-floor', params: { style: 'studs', tile: 0.6, pitch: 0.028, joint: 0.003 }, repeat: 1.8,
    // roles: rubber, light, dark, joint
    palettes: make((c) => [c!, shd(c!, 0.3), shd(c!, -0.4), shd(c!, -0.55)])([
      ['black', 'Black', '#44454a'], ['grey', 'Grey', '#85878c'], ['red', 'Brick Red', '#a04840'], ['green', 'Racing Green', '#4c7058'],
      ['blue', 'Blue', '#46629a'], ['tan', 'Tan', '#a89270'], ['yellow', 'Yellow', '#c0a030'],
    ] as Tuple[]),
  }),
  floor({
    id: 'industrial-rubber-ribs', name: 'Ribbed Rubber Matting',
    description: 'Rubber flooring with fine parallel ribs under every tile. Calm, practical and forgiving on the feet.',
    family: 'concrete', tags: ['rubber', 'ribbed', 'matting', 'gym', 'utility', 'garage', 'workshop', 'basement', 'playroom'],
    packs: ['industrial-loft', 'everyday-essentials'], price: 14,
    painter: 'rubber-floor', params: { style: 'ribs', tile: 0.6, pitch: 0.024, joint: 0.003 }, repeat: 1.8,
    palettes: make((c) => [c!, shd(c!, 0.3), shd(c!, -0.4), shd(c!, -0.55)])([
      ['black', 'Black', '#44454a'], ['grey', 'Grey', '#85878c'], ['sand', 'Sand', '#b4a488'], ['green', 'Racing Green', '#4c7058'],
      ['blue', 'Blue', '#46629a'], ['terracotta', 'Terracotta', '#a05a40'], ['white', 'Light Grey', '#c4c6c8'],
    ] as Tuple[]),
  }),
  floor({
    id: 'industrial-steel-plates', name: 'Riveted Steel Plates',
    description: 'Brushed steel floor plates bolted edge to edge, with a rivet in every corner. Ship, foundry and loft-kitchen character.',
    family: 'concrete', tags: ['steel', 'plates', 'riveted', 'brushed', 'industrial', 'loft', 'workshop', 'kitchen', 'luxury'],
    packs: ['industrial-loft'], price: 34,
    painter: 'paver-bond', params: { map: 'steel-brushed', bond: 'stack', unitW: 0.6, unitH: 0.6, joint: 0.004, mapScale: 0.6, variation: 0.5, bevel: 0.6, round: 0, rivets: true }, repeat: 1.8,
    palettes: bond([
      ['bare-steel', 'Bare Steel', '#8d9296', '#26292c'], ['dark-steel', 'Gunmetal', '#5a5e63', '#16181a'], ['galvanised', 'Galvanised', '#c3c7ca', '#4a4e52'],
      ['black', 'Black Painted', '#2c2d30', '#0a0a0c'], ['green', 'Machine Green', '#4f6a5a', '#16201a'], ['navy', 'Navy Painted', '#3a4a64', '#10161e'],
      ['bronze', 'Bronze', '#8a6a44', '#2a1e12'],
    ] as Tuple[]),
  }),

  // --- exterior paving, decking, gravel and paths -----------------------------------------------------------------
  floor({
    id: 'ext-brick-herringbone', name: 'Herringbone Brick Paving',
    description: 'Clay paving bricks locked in a herringbone, the pattern that holds a drive or terrace together under load.',
    family: 'exterior', tags: ['brick', 'paving', 'herringbone', 'exterior', 'patio', 'drive', 'path', 'courtyard'],
    packs: ['garden-patio', 'classic-townhouse'], price: 22,
    painter: 'paver-bond', params: { map: 'brick-clay', bond: 'herringbone', unitH: 0.1, joint: 0.006, mapScale: 0.4, variation: 0.7, bevel: 0.5, round: 0.04 }, repeat: 1.6,
    palettes: bond(BRICKS),
  }),
  floor({
    id: 'ext-brick-basketweave', name: 'Basketweave Brick Paving',
    description: 'Pairs of bricks laid in alternating squares like a woven basket. Old-fashioned, neat and perfect for garden paths.',
    family: 'exterior', tags: ['brick', 'paving', 'basketweave', 'traditional', 'exterior', 'patio', 'path', 'garden'],
    packs: ['garden-patio', 'cozy-cottage'], price: 19,
    painter: 'paver-bond', params: { map: 'brick-clay', bond: 'basket', unitW: 0.2, per: 2, joint: 0.006, mapScale: 0.4, variation: 0.7, bevel: 0.5, round: 0.04 }, repeat: 1.6,
    palettes: bond(BRICKS),
  }),
  floor({
    id: 'ext-pinwheel-pavers', name: 'Pinwheel Block Paving',
    description: 'Four concrete blocks turning round a small square, repeated across the patio. A tidy, modern take on block paving.',
    family: 'exterior', tags: ['pavers', 'pinwheel', 'concrete', 'block-paving', 'exterior', 'patio', 'drive', 'path'],
    packs: ['garden-patio', 'modern-minimal'], price: 13,
    painter: 'paver-bond', params: { map: 'paver-concrete', bond: 'pinwheel', unitW: 0.2, joint: 0.005, mapScale: 0.5, variation: 0.6, bevel: 0.45, round: 0.03 }, repeat: 1.8,
    palettes: bond([
      ['charcoal', 'Charcoal', '#4c4d50', '#2a2b2e'], ['natural', 'Natural Grey', '#9a9894', '#6a6864'], ['buff', 'Buff', '#cdb68c', '#8a7e66'], ['brindle', 'Brindle', '#8a5a48', '#5a4036'],
      ['silver', 'Silver', '#b8b8b4', '#7c7c78'], ['red', 'Red', '#a5523a', '#6e4030'], ['bluestone', 'Blue Black', '#3a4048', '#1e2226'],
    ] as Tuple[]),
  }),
  floor({
    id: 'ext-flagstone-ashlar', name: 'Random Ashlar Flagstones',
    description: 'Rough sandstone flags in random coursed rows, laid with generous joints. A generous terrace of natural stone.',
    family: 'exterior', tags: ['flagstone', 'sandstone', 'ashlar', 'random', 'paving', 'exterior', 'terrace', 'patio'],
    packs: ['garden-patio', 'classic-townhouse'], price: 27,
    painter: 'paver-bond', params: { map: 'stone-sandstone', bond: 'ashlar', unitH: 0.2, joint: 0.012, mapScale: 0.8, variation: 0.8, bevel: 0.6, round: 0.06 }, repeat: 2.4,
    palettes: bond(SLABS),
  }),
  floor({
    id: 'ext-crazy-paving', name: 'Crazy Paving',
    description: 'Angular broken slabs fitted together like a jigsaw, with mortar joints. The cottage garden path.',
    family: 'exterior', tags: ['crazy-paving', 'broken-slabs', 'irregular', 'cottage', 'exterior', 'path', 'garden', 'patio'],
    packs: ['garden-patio', 'cozy-cottage'], price: 16,
    painter: 'crazy-paving', params: { map: 'stone-slate', cells: 7, jitter: 0.85, joint: 0.014, mapScale: 0.7, variation: 0.7 }, repeat: 2.4,
    // roles: stone A, stone B, stone C, joint
    palettes: make((c, j) => [c!, shd(c!, 0.12), shd(c!, -0.12), j!])([
      ['slate-grey', 'Slate Grey', '#6a7076', '#b4ac9c'], ['rustic', 'Rustic Brown', '#8a7a64', '#c4b89c'], ['green-slate', 'Welsh Green', '#6a7a6c', '#b8b4a0'],
      ['purple', 'Heather', '#74687a', '#b8b0a0'], ['york', 'York Buff', '#b8a88c', '#8a8070'], ['rust', 'Rust Quartzite', '#9a6a4c', '#b8a890'],
      ['charcoal', 'Charcoal', '#4a4f52', '#8a8880'],
    ] as Tuple[]),
  }),
  floor({
    id: 'ext-stepping-gravel', name: 'Slab Stepping Stones',
    description: 'Square stone slabs set in staggered steps across a bed of gravel. Easy to walk, easy on the eye.',
    family: 'exterior', tags: ['stepping-stones', 'slabs', 'gravel', 'path', 'garden', 'zen', 'modern', 'exterior', 'courtyard'],
    packs: ['garden-patio', 'modern-minimal'], price: 15,
    painter: 'stepping-stones', params: { ground: 'gravel', groundScale: 1.2, map: 'stone-sandstone', shape: 'square', cols: 4, size: 0.62, jitter: 0.08 }, repeat: 2.4,
    // roles: ground, ground light, ground dark, stone, stone light, stone dark
    palettes: make((g, st) => [g!, shd(g!, 0.22), shd(g!, -0.32), st!, shd(st!, 0.2), shd(st!, -0.28)])([
      ['grey-gravel-sandstone', 'Grey Gravel, Sandstone', '#8f9094', '#cdb690'], ['golden-grey', 'Golden Gravel, Grey Slabs', '#b89a66', '#8f9094'], ['white-slate', 'White Gravel, Slate', '#cfcdc4', '#4a4f52'],
      ['slate-limestone', 'Slate Chips, Limestone', '#6a7682', '#ddd5c4'], ['black-white', 'Black Basalt, White Slabs', '#46484b', '#ebe8e0'], ['pink-granite', 'Pink Gravel, Granite', '#b08a80', '#7a7874'],
    ] as Tuple[]),
  }),
  floor({
    id: 'ext-stepping-lawn', name: 'Round Stepping Stones',
    description: 'Round stone discs scattered in staggered steps through the lawn, each a little different in size and tone.',
    family: 'exterior', tags: ['stepping-stones', 'round', 'lawn', 'path', 'garden', 'cottage', 'exterior', 'yard'],
    packs: ['garden-patio', 'botanical-living'], price: 9,
    painter: 'stepping-stones', params: { ground: 'lawn', groundScale: 1.2, map: 'granite-sett', shape: 'round', cols: 5, size: 0.7, jitter: 0.14 }, repeat: 2.4,
    palettes: make((g, st) => [g!, shd(g!, 0.22), shd(g!, -0.32), st!, shd(st!, 0.2), shd(st!, -0.28)])([
      ['summer-grey', 'Summer Lawn, Grey', '#5f8f3f', '#9a9894'], ['spring-sand', 'Spring Lawn, Sandstone', '#7fae4f', '#cdb690'], ['meadow-slate', 'Meadow, Slate', '#8a9a4a', '#5f6a70'],
      ['straw-limestone', 'Dry Straw, Limestone', '#b8a460', '#ddd5c4'], ['moss-granite', 'Shaded Moss, Granite', '#2f5a30', '#8f8d8a'], ['frost-charcoal', 'Frosted Lawn, Charcoal', '#d3dccb', '#4c4d50'],
    ] as Tuple[]),
  }),
  floor({
    id: 'ext-deck-tiles', name: 'Interlocking Deck Tiles',
    description: 'Square slatted deck tiles clicked together, the slats turning a quarter from tile to tile. Instant balcony decking.',
    family: 'exterior', tags: ['decking', 'deck-tiles', 'slatted', 'interlocking', 'balcony', 'terrace', 'exterior', 'patio'],
    packs: ['garden-patio', 'modern-minimal'], price: 13,
    painter: 'paver-bond', params: { map: 'wood-deck', bond: 'basket', unitW: 0.3, per: 5, joint: 0.004, mapScale: 0.5, grainAlong: true, variation: 0.6, bevel: 0.5, round: 0.03 }, repeat: 1.8,
    palettes: bond(DECKS),
  }),
  floor({
    id: 'ext-deck-basketweave', name: 'Basketweave Decking',
    description: 'Groups of three boards laid in alternating squares, a designer pattern that breaks up a large deck.',
    family: 'exterior', tags: ['decking', 'basketweave', 'timber', 'pattern', 'terrace', 'exterior', 'garden', 'patio'],
    packs: ['garden-patio', 'coastal-home'], price: 23,
    painter: 'paver-bond', params: { map: 'wood-deck', bond: 'basket', unitW: 0.45, per: 3, joint: 0.006, mapScale: 0.6, grainAlong: true, variation: 0.6, bevel: 0.5, round: 0.02 }, repeat: 1.8,
    palettes: bond(DECKS),
  }),
  floor({
    id: 'ext-deck-composite', name: 'Composite Decking',
    description: 'Embossed composite boards in long staggered lengths, with a regular printed grain that never splinters or fades.',
    family: 'exterior', tags: ['decking', 'composite', 'low-maintenance', 'terrace', 'balcony', 'exterior', 'patio', 'poolside'],
    packs: ['garden-patio', 'modern-minimal'], price: 21,
    painter: 'map-boards', params: { map: 'composite-grain', bands: 3, board: 0.18, minLen: 1.0, maxLen: 2.0, gap: 0.008, variation: 0.35 }, repeat: 1.8,
    palettes: bond([
      ['driftwood', 'Driftwood', '#9c958a', '#1e1c1a'], ['teak', 'Teak', '#a2764c', '#241a12'], ['charcoal', 'Charcoal', '#4a4c50', '#101012'], ['sand', 'Sand', '#c4b496', '#3a3226'],
      ['walnut', 'Walnut', '#6a4a36', '#1a120c'], ['slate-grey', 'Slate Grey', '#7a7e82', '#18191b'], ['redwood', 'Redwood', '#8e5a42', '#20140e'],
    ] as Tuple[]),
  }),
  floor({
    id: 'ext-sleeper-path', name: 'Railway Sleeper Path',
    description: 'Heavy timber sleepers laid end to end in a brick pattern with gravel in the joints. Chunky, weathered and garden-ready.',
    family: 'exterior', tags: ['sleepers', 'timber', 'railway', 'path', 'rustic', 'garden', 'exterior', 'patio'],
    packs: ['garden-patio', 'cozy-cottage'], price: 18,
    painter: 'paver-bond', params: { map: 'wood-sleeper', bond: 'running', unitW: 0.8, unitH: 0.2, joint: 0.012, mapScale: 0.8, variation: 0.8, bevel: 0.35, round: 0.02 }, repeat: 1.6,
    palettes: bond([
      ['oak-brown', 'Oak Brown', '#7a6048', '#6a6862'], ['silver-grey', 'Silvered Oak', '#8c8478', '#7a7870'], ['charcoal', 'Charred', '#3c3834', '#58564f'], ['honey', 'Honey Oak', '#a47e50', '#8c8a80'],
      ['green-treated', 'Green Treated', '#6a7458', '#76746c'], ['walnut', 'Walnut Stain', '#5a4232', '#50504c'],
    ] as Tuple[]),
  }),
  floor({
    id: 'ext-bark-path', name: 'Bark Chip Path',
    description: 'Loose pine bark chips raked over the beds and paths. Soft underfoot, and it smells of the woods.',
    family: 'exterior', tags: ['bark', 'mulch', 'chips', 'path', 'garden', 'woodland', 'playground', 'exterior', 'outdoor'],
    packs: ['garden-patio', 'botanical-living'], price: 5,
    painter: 'map-floor', params: { map: 'bark-chips', tiles: 2, cell: 0 }, repeat: 1.2,
    palettes: fibre([
      ['bark-brown', 'Pine Bark', '#7a5238'], ['bark-dark', 'Dark Mulch', '#3c2c22'], ['bark-red', 'Red Cedar', '#8e4e38'], ['bark-golden', 'Golden', '#b08a52'],
      ['bark-grey', 'Weathered Grey', '#8c8478'], ['bark-black', 'Black Dyed', '#2c2826'],
    ] as Tuple[]),
  }),
  floor({
    id: 'ext-crushed-slate', name: 'Crushed Slate Chippings',
    description: 'Flat angular slate shards that lock together into a crisp, colourful path. Crunchy, tidy and low maintenance.',
    family: 'exterior', tags: ['slate', 'chippings', 'crushed', 'gravel', 'path', 'drive', 'garden', 'exterior', 'courtyard'],
    packs: ['garden-patio', 'modern-minimal'], price: 9,
    painter: 'map-floor', params: { map: 'slate-chips', tiles: 2, cell: 0 }, repeat: 1.2,
    palettes: fibre([
      ['plum', 'Plum Slate', '#6a5a68'], ['blue-grey', 'Blue Grey', '#586670'], ['green', 'Welsh Green', '#5f7266'], ['charcoal', 'Charcoal', '#46484c'],
      ['rustic', 'Rustic Red', '#a0523c'], ['silver', 'Silver Grey', '#9a9d9e'], ['bone', 'Pale Quartz', '#dad6ca'],
    ] as Tuple[]),
  }),
  floor({
    id: 'ext-river-pebbles', name: 'River Pebbles',
    description: 'Large smooth river stones packed tight. Beautiful around a pond or a modern entrance, rough to walk on.',
    family: 'exterior', tags: ['pebbles', 'river-stones', 'cobbles', 'border', 'garden', 'zen', 'pond', 'exterior', 'outdoor'],
    packs: ['garden-patio', 'coastal-home'], price: 14,
    painter: 'map-floor', params: { map: 'pebbles-river', tiles: 1, cell: 0 }, repeat: 1.6,
    palettes: fibre([...GRAVELS, ['ivory', 'Ivory', '#e0d8c4']] as Tuple[]),
  }),
  floor({
    id: 'ext-resin-bound', name: 'Resin Bound Gravel',
    description: 'Fine stones bound flush in clear resin: one smooth, permeable surface with no loose chippings. Drives and modern paths.',
    family: 'exterior', tags: ['resin', 'bound-gravel', 'permeable', 'smooth', 'drive', 'path', 'modern', 'exterior', 'patio'],
    packs: ['garden-patio', 'modern-minimal'], price: 30,
    painter: 'map-floor', params: { map: 'resin-gravel', tiles: 2, cell: 0 }, repeat: 1.6,
    palettes: fibre(GRAVELS),
  }),
  floor({
    id: 'ext-grass-pavers', name: 'Grass Block Paving',
    description: 'Concrete grass blocks with round-cornered holes of turf. A drive that looks like a lawn and drains like one too.',
    family: 'exterior', tags: ['grass-pavers', 'grasscrete', 'permeable', 'drive', 'parking', 'eco', 'garden', 'exterior'],
    packs: ['garden-patio', 'botanical-living'], price: 17,
    painter: 'grass-pavers', params: { map: 'paver-concrete', grass: 'lawn', blockW: 0.6, blockH: 0.4, holesX: 3, holesY: 2, joint: 0.006 }, repeat: 2.4,
    // roles: concrete, light, dark, grass, grass light, grass dark
    palettes: make((c, g) => [c!, shd(c!, 0.2), shd(c!, -0.28), g!, shd(g!, 0.22), shd(g!, -0.32)])([
      ['grey-summer', 'Grey and Summer Green', '#9a9894', '#5f8f3f'], ['pale-spring', 'Pale and Spring Green', '#cfcdc4', '#7fae4f'], ['charcoal-meadow', 'Charcoal and Meadow', '#5c5e62', '#8a9a4a'],
      ['buff-straw', 'Buff and Dry Straw', '#cdb68c', '#b8a460'], ['grey-moss', 'Grey and Moss', '#8a8884', '#2f5a30'], ['sand-winter', 'Sand and Frost', '#c2b49a', '#d3dccb'],
    ] as Tuple[]),
  }),
  floor({
    id: 'ext-fan-setts', name: 'Fan Pattern Setts',
    description: 'Small granite setts laid in overlapping arcs, each row scalloping over the last. The finest pattern for a courtyard.',
    family: 'exterior', tags: ['setts', 'fan-pattern', 'cobbles', 'granite', 'arcs', 'courtyard', 'exterior', 'path', 'drive'],
    packs: ['classic-townhouse', 'garden-patio'], price: 38,
    painter: 'fan-setts', params: { map: 'granite-sett', fans: 4, sett: 0.055, joint: 0.005, variation: 0.7 }, repeat: 1.6,
    // roles: stone A, stone B, stone C, joint
    palettes: plain([
      ['grey', 'Grey Granite', '#8f8d8a', '#a3a09c', '#7a7874', '#a8a090'], ['pink', 'Pink Granite', '#b08a80', '#c4a096', '#9a7a70', '#b8aa98'], ['blue', 'Blue Setts', '#6f7a80', '#808b90', '#5f6a70', '#9a9a92'],
      ['buff', 'Buff Sandstone', '#c0a880', '#d2bc98', '#a8906a', '#b8aa90'], ['basalt', 'Basalt', '#4a4c50', '#5e6064', '#3a3c40', '#7a7870'], ['mixed', 'Mixed Stone', '#9a9a94', '#b09878', '#7f8a90', '#aaa28e'],
    ] as Tuple[]),
  }),
  floor({
    id: 'ext-raked-gravel', name: 'Raked Zen Gravel',
    description: 'Fine gravel combed into parallel waves that ripple round two boulders. Quiet, ordered and designed to be looked at.',
    family: 'exterior', tags: ['gravel', 'raked', 'zen', 'japanese', 'courtyard', 'meditation', 'garden', 'exterior', 'minimal'],
    packs: ['garden-patio', 'modern-minimal'], price: 20,
    painter: 'raked-garden', params: { ground: 'gravel', groundScale: 1.2, spacing: 0.05, waves: 2, amplitude: 0.05, boulders: 2 }, repeat: 2.4,
    // roles: ground, light, dark, boulder, boulder light, boulder dark
    palettes: make((g, st) => [g!, shd(g!, 0.22), shd(g!, -0.32), st!, shd(st!, 0.25), shd(st!, -0.3)])([
      ['white-grey', 'White Gravel, Grey Stone', '#cfcdc4', '#6a6c70'], ['grey-charcoal', 'Grey Gravel, Charcoal Stone', '#8f9094', '#46484c'], ['sand-brown', 'Sand, Brown Stone', '#d3c29a', '#7a6454'],
      ['golden-slate', 'Golden Gravel, Slate Stone', '#b89a66', '#586670'], ['black-white', 'Black Gravel, White Stone', '#46484b', '#dcdad2'], ['slate-moss', 'Blue Slate, Mossy Stone', '#6a7682', '#6a7a58'],
    ] as Tuple[]),
  }),
];
