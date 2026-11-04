// Milestone 2 surface catalog: 38 more wall finishes, 24 more floors, and more doors and windows (merged into
// the catalog by surfaces.ts). Same rules as surfaces.ts: every design names a painter
// (src/render/textures) and its params, distinct designs differ in layout, structure or material, palettes are
// colour variants. Palette colours follow the painter's role order (documented per design); colors[0] dominates
// the surface from a distance, which is what paletteTone() classifies for catalog colour filters.
//
// Detail-map designs (painters map-wall, map-floor, map-boards) use AI-generated greyscale maps
// (public/assets/surfaces, see dev/surfaces-ai/): a palette is [base, light, dark, ...] and tints the map.

import type { OpeningDef, Palette, PriceTier, SurfaceDesign } from './types';

export const pal = (id: string, name: string, ...colors: string[]): Palette => ({ id, name, colors });
export const dollars = (d: number) => Math.round(d * 100);

/** Lightens (t > 0, toward white) or darkens (t < 0, toward black) a '#rrggbb' colour. */
export function shd(hex: string, t: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const to = t >= 0 ? 255 : 0, k = Math.min(1, Math.abs(t));
  const ch = (sh: number) => Math.round(((n >> sh) & 255) + (to - ((n >> sh) & 255)) * k).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

export function tierOf(surface: 'wall' | 'floor', price: number): PriceTier {
  const d = price / 100;
  if (surface === 'wall') return d < 6 ? 'budget' : d <= 12 ? 'standard' : d < 25 ? 'premium' : 'luxury';
  return d < 7 ? 'budget' : d <= 12 ? 'standard' : d < 25 ? 'premium' : 'luxury';
}

export type DesignInput = Omit<SurfaceDesign, 'surface' | 'status' | 'tier' | 'price'> & { price: number };
export const wall = (d: DesignInput): SurfaceDesign => ({ ...d, surface: 'wall', status: 'ready', price: dollars(d.price), tier: tierOf('wall', dollars(d.price)) });
export const floor = (d: DesignInput): SurfaceDesign => ({ ...d, surface: 'floor', status: 'ready', price: dollars(d.price), tier: tierOf('floor', dollars(d.price)) });

/** Palette factory: `roles` derives the full colour list from the tuple's colours. */
export type Tuple = [id: string, name: string, ...c: string[]];
export const make = (roles: (...c: string[]) => string[]) => (list: Tuple[]): Palette[] => list.map(([id, name, ...c]) => pal(id, name, ...roles(...c)));

export const plain = make((...c) => c);
export const TRIM = '#f5f1e8';

// Ground + motif colour pairs shared by the printed patterns. colors[0] = ground.
export const DUO: Tuple[] = [
  ['cream-sage', 'Cream and Sage', '#f1ead8', '#9db08f'],
  ['ivory-navy', 'Ivory and Navy', '#f2eee4', '#34456a'],
  ['blush-rose', 'Blush and Rose', '#f1dcd5', '#cf7f86'],
  ['duck-teal', 'Duck Egg and Teal', '#d3e2de', '#2f7f80'],
  ['greige-terracotta', 'Greige and Terracotta', '#b9b0a3', '#c4714d'],
  ['mustard-grey', 'Mustard and Grey', '#d9a641', '#5f6368'],
  ['forest-gold', 'Forest and Gold', '#2f4a3c', '#d3b261'],
  ['charcoal-coral', 'Charcoal and Coral', '#33363b', '#e4806a'],
  ['midnight-silver', 'Midnight and Silver', '#1f2a44', '#b9bec9'],
];
// roles: ground, motifA, motifB (a lighter tint of the motif), trim
export const duoP = make((g, m) => [g!, m!, shd(m!, 0.4), shd(g!, 0.72)]);
// roles: ground, stripe, accent, trim
export const stripeP = make((g, m) => [g!, m!, shd(m!, -0.3), shd(g!, 0.72)]);
// roles: ground, band, band2, overcheck, trim (buffalo check)
export const checkP = make((g, m) => [g!, m!, shd(m!, 0.35), shd(m!, -0.35), shd(g!, 0.72)]);

// Single-colour ramps for detail maps: [base, light, dark, trim]
export const ramp = make((c) => [c!, shd(c!, 0.24), shd(c!, -0.3), TRIM]);
export const NEUTRAL_RAMP: Tuple[] = [
  ['chalk', 'Chalk', '#e6e0d3'], ['oat', 'Oat', '#d3c5ae'], ['stone-grey', 'Stone Grey', '#a9a59d'], ['sage', 'Sage', '#9aa890'],
  ['dusk-blue', 'Dusk Blue', '#6b7e93'], ['clay-pink', 'Clay Pink', '#cf9c88'], ['terracotta', 'Terracotta', '#bb6a4a'],
  ['ochre', 'Ochre', '#c79a48'], ['charcoal', 'Charcoal', '#45454a'],
];

// ---------------------------------------------------------------------------------------------
// Wall designs
// ---------------------------------------------------------------------------------------------

export const WALL_DESIGNS_2: SurfaceDesign[] = [
  // --- paint, plaster and subtle textures ---------------------------------------------------
  wall({
    id: 'two-tone-dado', name: 'Dado Two-Tone',
    description: 'Two painted colours split at chair height by a moulded dado rail: a darker lower wall, a lighter upper wall.',
    family: 'paint', tags: ['paint', 'two-tone', 'dado', 'classic', 'hall', 'dining', 'living'],
    packs: ['classic-townhouse', 'cozy-cottage'], price: 9,
    painter: 'two-tone', params: { dado: 0.95, rail: 0.045, skirt: 0.1 }, repeat: 1.0,
    // roles: upper wall, lower wall, rail, trim
    palettes: ([
      ['cream-sage', 'Cream over Sage', '#efe8d6', '#8fa68a'], ['white-navy', 'White over Navy', '#f2efe8', '#2f3d5a'],
      ['blush-charcoal', 'Blush over Charcoal', '#f0dcd4', '#4a4a4e'], ['duck-terracotta', 'Duck Egg over Terracotta', '#d3e2de', '#b8684a'],
      ['greige-forest', 'Greige over Forest', '#b9b0a3', '#2f4a3c'], ['mustard-oxblood', 'Mustard over Oxblood', '#d9a641', '#5a2a2c'],
      ['navy-cream', 'Navy over Cream', '#2a3550', '#e9e1cf'], ['forest-cream', 'Forest over Cream', '#2f4a3c', '#e4dcc6'],
    ] as Tuple[]).map(([id, name, up, low]) => pal(id, name, up!, low!, '#f6f2e8', '#f6f2e8')),
  }),
  wall({
    id: 'plaster-roughcast', name: 'Roughcast Plaster',
    description: 'Hand-trowelled roughcast with soft sweeps, grains and tiny pits. Warm and tactile, like an old farmhouse.',
    family: 'paint', tags: ['plaster', 'textured', 'rustic', 'mediterranean', 'cottage', 'living', 'bedroom', 'hall'],
    packs: ['cozy-cottage', 'coastal-home'], price: 11,
    painter: 'map-wall', params: { map: 'plaster-rough', tiles: 2, skirt: 0.1 }, repeat: 1.4,
    // roles: base, light, dark, trim
    palettes: ramp(NEUTRAL_RAMP),
  }),
  wall({
    id: 'grasscloth-weave', name: 'Grasscloth Weave',
    description: 'Natural grasscloth wallpaper hung in rolls, a fine woven fibre texture with a faint seam between the drops.',
    family: 'paint', tags: ['grasscloth', 'natural', 'woven', 'wallpaper', 'textured', 'living', 'bedroom', 'study'],
    packs: ['coastal-home', 'modern-minimal'], price: 16,
    painter: 'map-wall', params: { map: 'grasscloth', tiles: 1, roll: 0.6, skirt: 0.1 }, repeat: 0.6,
    // roles: base, light, dark, trim
    palettes: ramp([
      ['ivory', 'Ivory', '#ece4d0'], ['sand', 'Sand', '#d8c9a8'], ['natural', 'Natural', '#c9b48a'], ['sage', 'Sage Grass', '#9bab8f'],
      ['blush', 'Blush', '#dfb8ad'], ['terracotta', 'Terracotta', '#b86b4a'], ['teal', 'Deep Teal', '#2f7f80'],
      ['indigo', 'Indigo', '#35476b'], ['espresso', 'Espresso', '#4a3a2e'],
    ]),
  }),
  // --- stripes, checks and gingham ------------------------------------------------------------
  wall({
    id: 'stripes-candy', name: 'Candy Stripe',
    description: 'Narrow, even stripes of colour and ground, like a deck chair or a sweet shop awning.',
    family: 'stripes', tags: ['stripes', 'candy', 'fresh', 'playful', 'bedroom', 'kids', 'bathroom', 'kitchen'],
    packs: ['kids-storybook', 'coastal-home'], price: 8,
    painter: 'stripe-set', params: { style: 'candy', width: 0.04, weave: 0.6, skirt: 0.1 }, repeat: 0.32,
    // roles: ground, stripe, accent, trim
    palettes: stripeP(DUO),
  }),
  wall({
    id: 'stripes-ticking', name: 'Ticking Stripe',
    description: 'Fine, slightly irregular mattress-ticking stripes in groups of three on a woven ground. Cottage fabric on the wall.',
    family: 'stripes', tags: ['stripes', 'ticking', 'fabric', 'cottage', 'farmhouse', 'bedroom', 'kitchen', 'hall'],
    packs: ['cozy-cottage'], price: 9,
    painter: 'stripe-set', params: { style: 'ticking', width: 0.05, weave: 0.7, skirt: 0.1 }, repeat: 0.6,
    palettes: stripeP(DUO),
  }),
  wall({
    id: 'stripes-breton', name: 'Breton Bands',
    description: 'Horizontal sailor bands counted up from the floor, woven in two colours with a pale edge line.',
    family: 'stripes', tags: ['stripes', 'horizontal', 'nautical', 'breton', 'coastal', 'bathroom', 'kids', 'bedroom'],
    packs: ['coastal-home', 'kids-storybook'], price: 9,
    painter: 'stripe-set', params: { style: 'breton', width: 0.08, weave: 0.7, skirt: 0.1 }, repeat: 0.6,
    palettes: stripeP(DUO),
  }),
  wall({
    id: 'check-buffalo', name: 'Buffalo Check',
    description: 'Bold two-tone lumberjack check: dark squares where the bands cross, mid tone where they overlap.',
    family: 'stripes', tags: ['check', 'buffalo', 'plaid', 'rustic', 'cabin', 'kitchen', 'living', 'bedroom'],
    packs: ['cozy-cottage', 'industrial-loft'], price: 10,
    painter: 'plaid-set', params: { style: 'buffalo', size: 0.1, weave: 0.6, skirt: 0.1 }, repeat: 0.6,
    // roles: ground, band, band2, overcheck, trim
    palettes: checkP(DUO),
  }),
  wall({
    id: 'plaid-tartan', name: 'Heritage Tartan',
    description: 'A woven tartan sett: broad bands crossing in a soft twill with fine overchecks, as in a Highland lodge.',
    family: 'stripes', tags: ['tartan', 'plaid', 'check', 'traditional', 'woven', 'study', 'living', 'dining'],
    packs: ['classic-townhouse'], price: 14,
    painter: 'plaid-set', params: { style: 'tartan', size: 0.3, weave: 0.7, skirt: 0.1 }, repeat: 0.6,
    // roles: ground, band, band2, overcheck, trim
    palettes: ([
      ['highland-green', 'Highland Green', '#2f4a3c', '#23304f', '#6b2a2c', '#d9c37a'], ['dress-cream', 'Dress Cream', '#e9e0c9', '#7a8f6a', '#b9503f', '#2b2b2b'],
      ['royal-red', 'Royal Red', '#a53a34', '#1f2a44', '#e8dcc0', '#e3c466'], ['heather', 'Heather', '#8d8a99', '#4a4a6a', '#c9a9b0', '#e8e3d4'],
      ['mustard-lodge', 'Mustard Lodge', '#d4a23f', '#5a2a2c', '#2f4a3c', '#f0e6c8'], ['blush-tartan', 'Blush Tartan', '#efd5d0', '#b9707a', '#7a8f9a', '#fbf6ee'],
      ['midnight', 'Midnight', '#1f2a44', '#4a6a5a', '#8a2f34', '#d8c27a'], ['charcoal-grey', 'Charcoal Grey', '#3a3b3f', '#8d9094', '#b9503f', '#e8e3d4'],
    ] as Tuple[]).map(([id, name, ...c]) => pal(id, name, ...c, '#f5f1e8')),
  }),
  // --- geometric ---------------------------------------------------------------------------------
  wall({
    id: 'geo-chevron', name: 'Zigzag Chevron',
    description: 'Mitred zigzag bands stacking up the wall in two tones with ground between: a graphic, modern chevron.',
    family: 'geometric', tags: ['geometric', 'chevron', 'zigzag', 'modern', 'bold', 'living', 'bedroom', 'hall'],
    packs: ['modern-minimal', 'mid-century'], price: 12,
    painter: 'geo-motifs', params: { motif: 'chevron', size: 0.3, skirt: 0.1 }, repeat: 0.6,
    // roles: ground, motifA, motifB, trim
    palettes: duoP(DUO),
  }),
  wall({
    id: 'geo-tumbling', name: 'Tumbling Blocks',
    description: 'Isometric cubes in three tones that seem to tumble across the wall: the quilter\'s illusion.',
    family: 'geometric', tags: ['geometric', 'cubes', 'isometric', 'quilt', 'retro', 'study', 'kids', 'bedroom'],
    packs: ['mid-century', 'kids-storybook'], price: 13,
    painter: 'geo-motifs', params: { motif: 'tumbling', size: 0.3, skirt: 0.1 }, repeat: 0.6,
    palettes: duoP(DUO),
  }),
  wall({
    id: 'geo-scales', name: 'Mermaid Scales',
    description: 'Overlapping rows of scalloped fish scales with ring outlines, in alternating tones. Art Nouveau meets the seaside.',
    family: 'geometric', tags: ['geometric', 'scales', 'scallop', 'fish-scale', 'coastal', 'bathroom', 'feature-wall'],
    packs: ['coastal-home', 'art-deco'], price: 14,
    painter: 'geo-motifs', params: { motif: 'scales', size: 0.2, skirt: 0.1 }, repeat: 0.6,
    palettes: duoP(DUO),
  }),
  wall({
    id: 'geo-quatrefoil', name: 'Quatrefoil Lattice',
    description: 'Four-lobed Moroccan quatrefoils on a square lattice, with a smaller staggered set between them.',
    family: 'geometric', tags: ['geometric', 'quatrefoil', 'lattice', 'moroccan', 'global', 'living', 'dining', 'feature-wall'],
    packs: ['classic-townhouse', 'art-deco'], price: 14,
    painter: 'geo-motifs', params: { motif: 'quatrefoil', size: 0.3, skirt: 0.1 }, repeat: 0.6,
    palettes: duoP(DUO),
  }),
  wall({
    id: 'geo-dots', name: 'Mid-Century Dots',
    description: 'Large half-drop discs with hollow centres and little satellite dots, straight from a 1950s sofa fabric.',
    family: 'geometric', tags: ['geometric', 'dots', 'circles', 'polka', 'mid-century', 'retro', 'kitchen', 'kids'],
    packs: ['mid-century', 'kids-storybook'], price: 11,
    painter: 'geo-motifs', params: { motif: 'dots', size: 0.3, skirt: 0.1 }, repeat: 0.6,
    palettes: duoP(DUO),
  }),
  // --- floral ------------------------------------------------------------------------------------
  wall({
    id: 'floral-bloom', name: 'Grand Bloom Chintz',
    description: 'Oversized layered peonies with leaf clusters in a generous half-drop: a statement chintz for feature walls.',
    family: 'floral', tags: ['floral', 'flowers', 'peony', 'chintz', 'large-print', 'bedroom', 'living', 'feature-wall'],
    packs: ['classic-townhouse', 'cozy-cottage'], price: 18,
    painter: 'bloom-large', params: { spacing: 0.4, skirt: 0.1 }, repeat: 0.8,
    // roles: ground, petal, petalDeep, leaf, centre, trim
    palettes: ([
      ['cabbage-rose', 'Cabbage Rose', '#f2e6d6', '#e49aa5', '#b5566a', '#6f8f5c', '#e8c15a'], ['peony-blue', 'Peony Blue', '#d7e3e6', '#f4f0ea', '#8fa9b9', '#5f8a72', '#e0b34f'],
      ['navy-chintz', 'Navy Chintz', '#27324d', '#e9b4a5', '#c9707a', '#6f9a78', '#f0d27a'], ['terracotta-bloom', 'Terracotta Bloom', '#c1714f', '#f3dcc0', '#e0a56b', '#5d6e43', '#7a3b2a'],
      ['sage-dahlia', 'Sage Dahlia', '#a6b49c', '#f1ebe0', '#d9c9a6', '#4f6b47', '#c9a44a'], ['mustard-bloom', 'Mustard Bloom', '#d9a641', '#f6ead0', '#c9707a', '#4f6b47', '#7a3b2a'],
      ['charcoal-bloom', 'Charcoal Bloom', '#34363a', '#e7a3a9', '#b5566a', '#6f9a78', '#f0d080'], ['blush-bloom', 'Blush Bloom', '#f4e0da', '#d98b9a', '#a94f63', '#7f9a6a', '#e8c15a'],
      ['greige-bloom', 'Greige Bloom', '#b9b0a3', '#f3ece0', '#d8b6a8', '#5f7a55', '#c9a44a'],
    ] as Tuple[]).map(([id, name, ...c]) => pal(id, name, ...c, TRIM)),
  }),
  wall({
    id: 'floral-blossom', name: 'Cherry Blossom Branch',
    description: 'Sweeping cherry branches studded with five-petal blossoms and buds, petals drifting down the wall.',
    family: 'floral', tags: ['floral', 'blossom', 'cherry', 'branch', 'oriental', 'bedroom', 'living', 'feature-wall'],
    packs: ['botanical-living', 'cozy-cottage'], price: 19,
    painter: 'blossom-branch', params: { spacing: 0.7, skirt: 0.1 }, repeat: 1.4,
    // roles: ground, branch, petal, centre, trim
    palettes: ([
      ['rice-paper', 'Rice Paper', '#f1ead6', '#5b4a3c', '#e9a0b0', '#e8c15a'], ['blush-branch', 'Blush Branch', '#f1d9d3', '#6a4a40', '#d9748c', '#f0d27a'],
      ['duck-egg-blossom', 'Duck Egg', '#cfe0dc', '#4a5a56', '#f4cfd6', '#e8c15a'], ['sage-blossom', 'Sage', '#a5b399', '#4a3a30', '#f6e6e8', '#e8c15a'],
      ['terracotta-dusk', 'Terracotta Dusk', '#c27a5a', '#3a2a24', '#f3d9cf', '#f0d27a'], ['midnight-blossom', 'Midnight', '#22304a', '#c9a35a', '#f2b8c6', '#f6e3a0'],
      ['charcoal-blossom', 'Charcoal', '#33363b', '#9a8f80', '#e7a3a9', '#f0d080'], ['gold-leaf', 'Gold Leaf', '#d9a641', '#4a3a2c', '#fbeee0', '#c9507a'],
      ['greige-blossom', 'Greige', '#b9b0a3', '#5a4a40', '#f6dfe3', '#e8c15a'],
    ] as Tuple[]).map(([id, name, ...c]) => pal(id, name, ...c, TRIM)),
  }),
  // --- botanical ---------------------------------------------------------------------------------
  wall({
    id: 'botanical-palm', name: 'Arching Palm',
    description: 'Big palm fronds arching from the lower corner of each drop, in two greens with pale ribs. Instant tropics.',
    family: 'botanical', tags: ['botanical', 'palm', 'tropical', 'leaves', 'green', 'living', 'bathroom', 'feature-wall'],
    packs: ['botanical-living', 'coastal-home'], price: 17,
    painter: 'palm-leaf', params: { leaf: 'palm', spacing: 0.5, skirt: 0.1 }, repeat: 1.0,
    // roles: ground, leafA, leafB, vein, trim
    palettes: ([
      ['white-palm', 'White Palm', '#f1ede2', '#7fa070', '#4f7a55', '#dfe8d2'], ['blush-palm', 'Blush Palm', '#f2d8cc', '#9fb48c', '#6f8e6a', '#e6efd6'],
      ['linen-palm', 'Linen Palm', '#e6dfd2', '#9bb3a8', '#6f8f86', '#f4f1ea'], ['stone-palm', 'Stone Palm', '#9e9d98', '#62705f', '#4a5848', '#c8ccc0'],
      ['terracotta-palm', 'Terracotta Palm', '#c87f5f', '#6f7e4f', '#4f5e3a', '#e9d6b8'], ['mustard-palm', 'Mustard Palm', '#d9a641', '#4f6b47', '#2f4d33', '#f2dfa7'],
      ['jungle-night', 'Jungle Night', '#1f2e2a', '#4e8a5f', '#2f6447', '#a8d1a0'], ['navy-palm', 'Navy Palm', '#22304a', '#6aa08a', '#3f7a64', '#cfe3d3'],
      ['sage-palm', 'Sage Palm', '#a8b5a0', '#e9ede3', '#5e7a58', '#ffffff'],
    ] as Tuple[]).map(([id, name, ...c]) => pal(id, name, ...c, TRIM)),
  }),
  wall({
    id: 'botanical-monstera', name: 'Monstera Leaves',
    description: 'Split-leaf monstera foliage with slits and pale veins, scattered in a loose half-drop.',
    family: 'botanical', tags: ['botanical', 'monstera', 'leaves', 'jungle', 'houseplant', 'living', 'bedroom', 'feature-wall'],
    packs: ['botanical-living', 'modern-minimal'], price: 17,
    painter: 'palm-leaf', params: { leaf: 'monstera', spacing: 0.45, skirt: 0.1 }, repeat: 0.9,
    palettes: ([
      ['cream-monstera', 'Cream Monstera', '#f2eee3', '#6f9a6a', '#44704a', '#d9e6cf'], ['blush-monstera', 'Blush Monstera', '#f0d6cc', '#8fb083', '#5f8a62', '#f1ead8'],
      ['mist-monstera', 'Mist Monstera', '#d3e0de', '#5f8f80', '#3f6a60', '#eef3ee'], ['greige-monstera', 'Greige Monstera', '#b9b0a3', '#5f7a55', '#3f5a40', '#e6e2d4'],
      ['terracotta-monstera', 'Terracotta Monstera', '#c4714d', '#5d7048', '#3f5535', '#f1dcc0'], ['ochre-monstera', 'Ochre Monstera', '#d3a03c', '#3f6a4a', '#27472f', '#f4e6b4'],
      ['forest-monstera', 'Forest Monstera', '#233a30', '#4f8f62', '#357048', '#bfe0b4'], ['ink-monstera', 'Ink Monstera', '#1f2833', '#5a9a86', '#3a7466', '#cfe6dc'],
      ['lilac-monstera', 'Lilac Monstera', '#cdbfd6', '#6f8f6a', '#4a6a4a', '#f2eef4'],
    ] as Tuple[]).map(([id, name, ...c]) => pal(id, name, ...c, TRIM)),
  }),
  // --- vintage and deco -------------------------------------------------------------------------------
  wall({
    id: 'deco-diamonds', name: 'Deco Diamonds',
    description: 'Nested stepped diamonds on a lattice with gilded outlines and studs at the crossings. Jazz-age glamour.',
    family: 'vintage-deco', tags: ['art-deco', 'diamond', 'gold', 'glamour', 'geometric', 'dining', 'living', 'feature-wall'],
    packs: ['art-deco'], price: 24,
    painter: 'deco-diamonds', params: { size: 0.3, skirt: 0.1 }, repeat: 0.6,
    // roles: ground, motif, gold, trim
    palettes: ([
      ['black-gold', 'Black and Gold', '#1e1e22', '#2c2c33', '#c9a24e'], ['ivory-gold', 'Ivory and Gold', '#f3ecdc', '#e6d6b0', '#b8954a'],
      ['emerald-gold', 'Emerald and Gold', '#1f4d3d', '#2a6150', '#c9a85a'], ['navy-silver', 'Navy and Silver', '#1f2a44', '#2c3a5a', '#b9bcc4'],
      ['blush-copper', 'Blush and Copper', '#efd5c8', '#e3b9a5', '#b07050'], ['sage-pewter', 'Sage and Pewter', '#a9b39f', '#c2cab8', '#6f7869'],
      ['teal-brass', 'Teal and Brass', '#2b7470', '#3b8a84', '#d4b16a'], ['coral-champagne', 'Coral and Champagne', '#e58c6e', '#f0b49c', '#f6e4bf'],
      ['dove-silver', 'Dove and Silver', '#b3b2ae', '#cfceca', '#7d7f84'],
    ] as Tuple[]).map(([id, name, ...c]) => pal(id, name, ...c, TRIM)),
  }),
  wall({
    id: 'fleur-trellis', name: 'Fleur-de-Lis Trellis',
    description: 'A fine diamond trellis with a fleur-de-lis at the heart of every diamond, in the manner of a Georgian drawing room.',
    family: 'vintage-deco', tags: ['vintage', 'fleur-de-lis', 'trellis', 'heraldic', 'traditional', 'dining', 'hall', 'study'],
    packs: ['classic-townhouse'], price: 15,
    painter: 'fleur-trellis', params: { size: 0.26, skirt: 0.1 }, repeat: 0.52,
    // roles: ground, motif, line, trim
    palettes: ([
      ['cream-gold', 'Cream and Gold', '#f1ead8', '#c7a65b', '#d9c48a'], ['duck-egg-silver', 'Duck Egg and Silver', '#d3e2de', '#7f9aa0', '#b9c8c8'],
      ['blush-rose', 'Blush and Rose', '#f1dcd5', '#c98a8a', '#e3b6ae'], ['greige-taupe', 'Greige and Taupe', '#b9b0a3', '#7a6a52', '#9c8f7c'],
      ['regency-red', 'Regency Red', '#a8423a', '#e0c070', '#c9876a'], ['mustard-brown', 'Mustard and Brown', '#d3a03c', '#5a3f2a', '#b98a30'],
      ['forest-gold', 'Forest and Gold', '#2f4a3c', '#c9a85a', '#5f7a64'], ['navy-cream', 'Navy and Cream', '#26324a', '#e8dcc0', '#5a6f93'],
      ['charcoal-silver', 'Charcoal and Silver', '#34363b', '#a9adb3', '#6a6d73'],
    ] as Tuple[]).map(([id, name, ...c]) => pal(id, name, ...c, TRIM)),
  }),
  // --- playful ------------------------------------------------------------------------------------------
  wall({
    id: 'playful-stars', name: 'Twinkle Stars',
    description: 'Scattered stars in three sizes with crescent moons and tiny sparkles: a bedtime-story night sky.',
    family: 'playful', tags: ['kids', 'stars', 'moon', 'night-sky', 'playful', 'nursery', 'bedroom'],
    packs: ['kids-storybook'], price: 10,
    painter: 'playful-set', params: { motif: 'stars', spacing: 0.3, skirt: 0.1 }, repeat: 0.6,
    // roles: ground, motifA, motifB, trim
    palettes: ([
      ['night-navy', 'Night Navy', '#26324a', '#f3d77a', '#c9d4e8'], ['cream-gold', 'Cream and Gold', '#f3ecd9', '#e4b84a', '#8fa2c0'],
      ['blush-star', 'Blush Stars', '#f1dcd5', '#e49aa5', '#f6e3a0'], ['duck-egg-star', 'Duck Egg Stars', '#d3e2de', '#f3f0e6', '#e8c15a'],
      ['greige-star', 'Greige Stars', '#b9b0a3', '#f6f1e4', '#e0b34f'], ['sunshine', 'Sunshine', '#e8b84a', '#fbf4e0', '#d9784a'],
      ['teal-star', 'Teal Stars', '#2f7f80', '#f6e8b4', '#d9eeea'], ['plum-night', 'Plum Night', '#3f2f55', '#f0d27a', '#c9b4e6'],
    ] as Tuple[]).map(([id, name, ...c]) => pal(id, name, ...c, TRIM)),
  }),
  wall({
    id: 'playful-clouds', name: 'Cloudy Skies',
    description: 'Fluffy clouds drifting in rows, some with raindrops, on a soft sky ground.',
    family: 'playful', tags: ['kids', 'clouds', 'sky', 'weather', 'playful', 'nursery', 'bedroom'],
    packs: ['kids-storybook'], price: 10,
    painter: 'playful-set', params: { motif: 'clouds', spacing: 0.3, skirt: 0.1 }, repeat: 0.6,
    palettes: ([
      ['sky-blue', 'Sky Blue', '#b9d8ea', '#fbfaf6', '#6fa0c8'], ['duck-egg-cloud', 'Duck Egg', '#d3e2de', '#fbfaf6', '#7fb0a6'],
      ['blush-cloud', 'Blush', '#f1dcd5', '#fbf6f2', '#e49aa5'], ['butter-cloud', 'Butter', '#f3e3a6', '#fbfaf4', '#e0a84a'],
      ['greige-cloud', 'Greige', '#b9b0a3', '#f6f2ea', '#8d8478'], ['coral-cloud', 'Coral', '#e58c6e', '#fbf0e6', '#c9507a'],
      ['storm-cloud', 'Storm', '#5d6f86', '#e9edf0', '#9fb8d0'], ['midnight-cloud', 'Midnight', '#24304a', '#c9d4e8', '#f3d77a'],
    ] as Tuple[]).map(([id, name, ...c]) => pal(id, name, ...c, TRIM)),
  }),
  // --- wood panelling ------------------------------------------------------------------------------
  wall({
    id: 'panel-shaker', name: 'Shaker Wainscot',
    description: 'Painted raised-and-fielded shaker panels to dado height under a flat cap rail, with painted wall above.',
    family: 'wood-panel', tags: ['wainscoting', 'panelling', 'shaker', 'classic', 'hall', 'dining', 'living', 'bedroom'],
    packs: ['classic-townhouse', 'cozy-cottage'], price: 24,
    painter: 'panel-set', params: { style: 'shaker', height: 1.1, unit: 0.42, skirt: 0.12 }, repeat: 0.84,
    // roles: upper wall, panel, groove, rail
    palettes: ([
      ['white-white', 'White on White', '#f3f0e8', '#faf8f2', '#cfc8b8', '#ffffff'], ['sage-cream', 'Sage over Cream', '#b5c0a4', '#f4f0e4', '#cfc6b1', '#f8f5ec'],
      ['navy-white', 'Navy over White', '#2f3d5a', '#f6f3ec', '#b9b4a6', '#ffffff'], ['blush-grey', 'Blush over Grey', '#ecd2c8', '#8f9396', '#5f6366', '#8f9396'],
      ['greige-charcoal', 'Greige over Charcoal', '#bdb3a4', '#3b3d40', '#26282a', '#3b3d40'], ['terracotta-cream', 'Terracotta over Cream', '#c97b58', '#f3eadb', '#d2c3a6', '#f7f0e3'],
      ['mustard-oak', 'Mustard over Oak', '#d4a23f', '#b88a5a', '#7a5634', '#a67a4d'], ['forest-ivory', 'Forest over Ivory', '#2f4a3c', '#efe8d6', '#c4baa0', '#f6f1e4'],
    ] as Tuple[]).map(([id, name, ...c]) => pal(id, name, ...c)),
  }),
  wall({
    id: 'panel-slat', name: 'Timber Slat Wall',
    description: 'Full-height vertical timber slats with shadow gaps over a dark acoustic backing. A modern feature wall.',
    family: 'wood-panel', tags: ['wood', 'slats', 'modern', 'acoustic', 'feature-wall', 'living', 'study', 'hall'],
    packs: ['modern-minimal', 'mid-century'], price: 28,
    painter: 'panel-set', params: { style: 'slat', height: 2.8, unit: 0.06, skirt: 0.0 }, repeat: 0.6,
    // roles: (unused upper = slat colour), slat, backing, trim
    palettes: ([
      ['natural-oak', 'Natural Oak', '#c49a6c', '#2a2a2d'], ['walnut', 'Walnut', '#6b4a34', '#1d1d1f'], ['pale-ash', 'Pale Ash', '#dcc8a4', '#33383b'],
      ['whitewash', 'Whitewash', '#e6dccb', '#3a3d40'], ['black-ash', 'Black Ash', '#2f2d2c', '#161616'], ['cherry', 'Cherry', '#9a5034', '#241e1c'],
      ['honey', 'Honey', '#c98f4f', '#2c3a36'], ['sage-slat', 'Sage Paint', '#9db59a', '#2b2f2c'], ['grey-oak', 'Grey Oak', '#a9a296', '#26292b'],
    ] as Tuple[]).map(([id, name, slat, back]) => pal(id, name, slat!, slat!, back!, shd(slat!, 0.3))),
  }),
  wall({
    id: 'panel-batten', name: 'Board and Batten',
    description: 'Painted full-height boards with narrow raised battens over the joints and a cap rail at the top. Farmhouse and mudroom classic.',
    family: 'wood-panel', tags: ['batten', 'board-and-batten', 'farmhouse', 'cottage', 'painted', 'hall', 'bedroom', 'kitchen'],
    packs: ['cozy-cottage'], price: 18,
    painter: 'panel-set', params: { style: 'batten', height: 2.8, unit: 0.22, skirt: 0.12 }, repeat: 0.66,
    // roles: (unused upper = board colour), board, grain shadow, batten
    palettes: ([
      ['white-batten', 'White', '#f3f0e8', '#d8d2c4', '#fbf9f4'], ['sage-batten', 'Sage', '#a9b59b', '#6f7d62', '#c3ccb5'], ['navy-batten', 'Navy', '#2f3d5a', '#1d2740', '#46557a'],
      ['greige-batten', 'Greige', '#b8afa2', '#8a8174', '#d3cbbd'], ['black-batten', 'Black', '#2a2a2c', '#111112', '#444447'], ['terracotta-batten', 'Terracotta', '#c4714d', '#8a4a30', '#d98c68'],
      ['butter-batten', 'Butter', '#ecd27c', '#b89a3c', '#f5e4a4'], ['duck-batten', 'Duck Egg', '#c4d6d3', '#7f9a98', '#dbe8e5'],
    ] as Tuple[]).map(([id, name, board, shade2, batten]) => pal(id, name, board!, board!, shade2!, batten!)),
  }),
  wall({
    id: 'panel-shiplap', name: 'Painted Shiplap',
    description: 'Horizontal shiplap boards with a crisp nickel gap and a lit upper lip, floor to ceiling. Coastal and clean.',
    family: 'wood-panel', tags: ['shiplap', 'horizontal', 'coastal', 'farmhouse', 'painted', 'bedroom', 'bathroom', 'living'],
    packs: ['coastal-home', 'cozy-cottage'], price: 20,
    painter: 'panel-set', params: { style: 'shiplap', height: 2.8, unit: 0.14, skirt: 0.12 }, repeat: 0.6,
    palettes: ([
      ['white-shiplap', 'White', '#f3f0e8', '#bdb6a6', '#ffffff'], ['sea-glass', 'Sea Glass', '#b7d0c8', '#6f8f88', '#dfece8'], ['navy-shiplap', 'Navy', '#2f3d5a', '#141c2e', '#46557a'],
      ['sand-shiplap', 'Sand', '#d6c7a8', '#9a8a68', '#e8dcc2'], ['grey-shiplap', 'Dove Grey', '#a9acaf', '#6a6d70', '#cbcdcf'], ['sage-shiplap', 'Sage', '#a9b59b', '#6f7d62', '#c3ccb5'],
      ['coral-shiplap', 'Coral', '#e07a5f', '#9a4a36', '#f0a08a'], ['black-shiplap', 'Charcoal', '#34363a', '#141516', '#505358'],
    ] as Tuple[]).map(([id, name, board, shade2, rail]) => pal(id, name, board!, board!, shade2!, rail!)),
  }),
  // --- ceramic and decorative tiles ----------------------------------------------------------------
  wall({
    id: 'tile-zellige', name: 'Zellige Tile',
    description: 'Handmade zellige squares, each a little crooked with pooled, uneven glaze and deep grout lines.',
    family: 'tile', tags: ['tile', 'zellige', 'handmade', 'glazed', 'moroccan', 'kitchen', 'bathroom', 'feature-wall'],
    packs: ['modern-minimal', 'coastal-home'], price: 26,
    painter: 'wall-tile-set', params: { style: 'zellige', size: 0.1, variation: 0.6 }, repeat: 0.6,
    // roles: tile, tile accent, grout
    palettes: plain([
      ['white-zellige', 'Chalk White', '#f1eee6', '#d9d3c4', '#cfc9bb'], ['sea-green', 'Sea Green', '#4f8f86', '#7fb0a6', '#d8d4c8'], ['cobalt-zellige', 'Cobalt', '#2f4f8f', '#5d7fb8', '#d9dbdc'],
      ['terracotta-zellige', 'Terracotta', '#c47452', '#e29a78', '#e8dccb'], ['sage-zellige', 'Sage', '#a9b8a0', '#c9d4c0', '#e0ddd0'], ['blush-zellige', 'Blush', '#e6bcb2', '#f3d6cf', '#f1e8e0'],
      ['mustard-zellige', 'Mustard', '#d6a53e', '#ecc872', '#e8dcc0'], ['indigo-zellige', 'Indigo', '#26324f', '#4a5c86', '#c9cbd0'], ['charcoal-zellige', 'Charcoal', '#34363a', '#5a5d62', '#9a9a96'],
    ]),
  }),
  wall({
    id: 'tile-penny', name: 'Penny Round Tile',
    description: 'Glazed penny-round mosaic tiles in stacked columns, with a scatter of accent tiles. Retro and tactile.',
    family: 'tile', tags: ['tile', 'penny', 'round', 'mosaic', 'retro', 'bathroom', 'kitchen', 'washable'],
    packs: ['mid-century', 'everyday-essentials'], price: 22,
    painter: 'wall-tile-set', params: { style: 'penny', size: 0.06, variation: 0.5 }, repeat: 0.6,
    palettes: plain([
      ['white-penny', 'Gloss White', '#f4f4f0', '#cfe0dc', '#cfcab8'], ['black-penny', 'Black', '#2a2b2e', '#8a8a88', '#9a978d'], ['mint-penny', 'Mint', '#bfdccf', '#f4f4f0', '#e4e2d6'],
      ['pink-penny', 'Pink', '#eec3c0', '#f8e4e0', '#f6efe9'], ['navy-penny', 'Navy', '#2f4a7a', '#e8e4d6', '#d4d6d8'], ['sage-penny', 'Sage', '#a9b8a0', '#e9e6dc', '#d4d2c4'],
      ['terracotta-penny', 'Terracotta', '#c47452', '#e8cfb4', '#e0d4c2'], ['grey-penny', 'Grey', '#a9acaf', '#e6e6e4', '#cfcfcc'],
    ]),
  }),
  wall({
    id: 'tile-arabesque', name: 'Arabesque Lantern Tile',
    description: 'Pointed lantern-shaped tiles in staggered columns, the gaps between them filled with a contrasting second tone.',
    family: 'tile', tags: ['tile', 'arabesque', 'lantern', 'moroccan', 'ogee', 'bathroom', 'kitchen', 'feature-wall'],
    packs: ['art-deco', 'modern-minimal'], price: 29,
    painter: 'wall-tile-set', params: { style: 'arabesque', size: 0.12, variation: 0.5 }, repeat: 0.72,
    palettes: plain([
      ['white-lantern', 'White and Grey', '#f1eee6', '#b9b6ae', '#a9a69c'], ['teal-lantern', 'Teal and Cream', '#2f7f80', '#efe6d0', '#cfd8d2'], ['navy-lantern', 'Navy and White', '#26324f', '#f1eee6', '#b8bcc4'],
      ['blush-lantern', 'Blush and Gold', '#eec3c0', '#d3b261', '#f1e4d8'], ['sage-lantern', 'Sage and Cream', '#a9b8a0', '#f1ead8', '#d6d4c4'], ['terracotta-lantern', 'Terracotta and Sand', '#c47452', '#e6d4b4', '#e8dccb'],
      ['green-lantern', 'Emerald and Brass', '#1f5a46', '#c9a85a', '#cfd2c4'], ['black-lantern', 'Black and Marble', '#2a2b2e', '#e6e3dc', '#8a8a88'],
    ]),
  }),
  // --- brick and stone ---------------------------------------------------------------------------------
  wall({
    id: 'stone-ashlar', name: 'Dressed Ashlar',
    description: 'Coursed dressed stone: blocks of several lengths in courses of different heights, fine joints, worn chamfers.',
    family: 'brick-stone', tags: ['stone', 'ashlar', 'masonry', 'coursed', 'classic', 'hall', 'dining', 'exterior'],
    packs: ['classic-townhouse'], price: 27,
    painter: 'ashlar', params: { course: 0.28, block: 0.6, joint: 0.009, skirt: 0 }, repeat: 1.2,
    // roles: stone A, stone B, stone C, joint
    palettes: ([
      ['sandstone', 'Sandstone', '#c9a676', '#d8bb8e', '#e6dcc8'], ['limestone', 'Limestone', '#d8d0bc', '#c8bfaa', '#9d9584'], ['granite', 'Granite Grey', '#8f8d8a', '#a3a09c', '#4e4c4a'],
      ['bluestone', 'Bluestone', '#6f7a80', '#808b90', '#3f4548'], ['warm-buff', 'Warm Buff', '#b8a88c', '#c8b99e', '#5e5a4e'], ['whitewashed-stone', 'Whitewashed', '#e6e1d6', '#f1ede4', '#bdb5a4'],
      ['rose-stone', 'Rose Stone', '#c98f7e', '#d9a592', '#7a5a50'], ['basalt', 'Basalt', '#3f4144', '#52555a', '#1e1f21'],
    ] as Tuple[]).map(([id, name, a, b, j]) => pal(id, name, a!, b!, shd(a!, 0.12), j!)),
  }),
  wall({
    id: 'stone-rubble', name: 'Rustic Rubble Stone',
    description: 'Irregular fitted stones of many sizes in deep mortar joints. An old cottage or barn wall.',
    family: 'brick-stone', tags: ['stone', 'rubble', 'rustic', 'cottage', 'cabin', 'exterior', 'feature-wall', 'kitchen'],
    packs: ['cozy-cottage', 'industrial-loft'], price: 21,
    painter: 'map-wall', params: { map: 'rubble-stone', tiles: 1, skirt: 0 }, repeat: 1.6,
    // roles: base, light, dark, trim
    palettes: ([
      ['cotswold', 'Cotswold Honey', '#cbb88f'], ['whitewash-stone', 'Limed White', '#e3dccd'], ['granite-rubble', 'Granite', '#9a9892'], ['sandstone-rubble', 'Red Sandstone', '#b0735a'],
      ['slate-rubble', 'Slate Blue', '#6b7a86'], ['moss-rubble', 'Mossy Green', '#8f9a76'], ['charcoal-rubble', 'Charcoal', '#4a4a4d'], ['blush-rubble', 'Rose Granite', '#c9a095'],
    ] as Tuple[]).map(([id, name, c]) => pal(id, name, c!, shd(c!, 0.3), shd(c!, -0.5), TRIM)),
  }),
  wall({
    id: 'slate-ledgestone', name: 'Slate Ledgestone',
    description: 'Stacked thin slate ledges of varied length with cleft, layered faces. Dramatic feature-wall cladding.',
    family: 'brick-stone', tags: ['stone', 'slate', 'ledgestone', 'cladding', 'modern', 'feature-wall', 'living', 'bathroom'],
    packs: ['modern-minimal', 'industrial-loft'], price: 30,
    painter: 'map-wall', params: { map: 'slate-ledge', tiles: 1, skirt: 0 }, repeat: 1.0,
    palettes: ([
      ['slate-grey', 'Slate Grey', '#7a8590'], ['charcoal-slate', 'Charcoal', '#4a4d52'], ['rust-slate', 'Rust', '#9a6a4a'], ['green-slate', 'Green Slate', '#6b7f70'],
      ['silver-slate', 'Silver', '#b4b8ba'], ['golden-slate', 'Golden', '#b89a62'], ['blue-slate', 'Blue Slate', '#4f6a86'], ['ivory-slate', 'Ivory', '#d9d2c0'],
    ] as Tuple[]).map(([id, name, c]) => pal(id, name, c!, shd(c!, 0.28), shd(c!, -0.5), TRIM)),
  }),
  // --- concrete, industrial and weathered -----------------------------------------------------------
  wall({
    id: 'concrete-board-formed', name: 'Board-Formed Concrete',
    description: 'Cast concrete with the grain of the timber formwork imprinted in it, faint pores and pour lines.',
    family: 'concrete', tags: ['concrete', 'board-formed', 'brutalist', 'industrial', 'minimal', 'loft', 'living', 'study'],
    packs: ['industrial-loft', 'modern-minimal'], price: 15,
    painter: 'map-wall', params: { map: 'concrete-board', tiles: 1, skirt: 0 }, repeat: 1.4,
    palettes: ramp([
      ['natural-concrete', 'Natural Grey', '#a3a29d'], ['pale-concrete', 'Pale Cement', '#d3d1ca'], ['warm-concrete', 'Warm Greige', '#b2a898'], ['sand-concrete', 'Sand', '#c2b49a'],
      ['blue-concrete', 'Blue Grey', '#7d8790'], ['sage-concrete', 'Green Wash', '#8f9a88'], ['terracotta-concrete', 'Terracotta Tint', '#a87a62'], ['charcoal-concrete', 'Charcoal', '#4c4d50'],
    ]),
  }),
  wall({
    id: 'corrugated-metal', name: 'Corrugated Metal',
    description: 'Vertical corrugated sheet cladding with lapped seams, rows of rivets and rust streaks running from the fixings.',
    family: 'concrete', tags: ['metal', 'corrugated', 'industrial', 'weathered', 'rust', 'garage', 'kitchen', 'loft'],
    packs: ['industrial-loft'], price: 17,
    painter: 'corrugated', params: { wave: 0.076, rust: 0.5, skirt: 0 }, repeat: 0.76,
    // roles: base, light, dark, rust
    palettes: plain([
      ['galvanised', 'Galvanised', '#aab0b4', '#e2e6e8', '#5f666b', '#9a5a3a'], ['weathered-grey', 'Weathered Grey', '#8f9498', '#c5cacd', '#4a4f53', '#8a4f30'], ['rusted', 'Rusted Iron', '#9a6a4a', '#c9966e', '#4a2f20', '#7a3a1c'],
      ['barn-red', 'Barn Red', '#9a3f36', '#c9695c', '#4a1c18', '#6a2a1c'], ['forest-sheet', 'Forest Green', '#3f5a48', '#6f8f78', '#1c2c22', '#7a4a2a'], ['cream-sheet', 'Cream', '#e0d8c4', '#f6f2e6', '#9a9380', '#a86a40'],
      ['black-sheet', 'Black', '#2c2d30', '#5a5d62', '#101112', '#6a3a22'], ['blue-sheet', 'Marine Blue', '#4f6a86', '#86a0bc', '#243446', '#7a4a2a'],
    ]),
  }),
  // --- luxury -------------------------------------------------------------------------------------------
  wall({
    id: 'tufted-velvet', name: 'Tufted Velvet Panels',
    description: 'Diamond-tufted padded wall: puffed cushions between sewn pleats, a brass button at every crossing.',
    family: 'luxury', tags: ['tufted', 'velvet', 'padded', 'luxury', 'glamour', 'bedroom', 'feature-wall', 'lounge'],
    packs: ['art-deco', 'classic-townhouse'], price: 38,
    painter: 'tufted', params: { pitch: 0.2, skirt: 0.1 }, repeat: 0.8,
    // roles: base, light, dark, button
    palettes: ([
      ['emerald-velvet', 'Emerald', '#1f5a4a', '#c9a85a'], ['navy-velvet', 'Navy', '#25324f', '#c9a85a'], ['oxblood-velvet', 'Oxblood', '#6a1f24', '#c9a85a'],
      ['ivory-leather', 'Ivory Leather', '#eee6d4', '#b8954a'], ['greige-velvet', 'Greige', '#b3aa9b', '#8a7a5a'], ['mustard-velvet', 'Mustard', '#c99a3a', '#6a4a22'],
      ['teal-velvet', 'Teal', '#2e7a77', '#d9c48a'], ['blush-velvet', 'Blush', '#e1a9a4', '#b8954a'], ['charcoal-velvet', 'Charcoal', '#3a3b3f', '#a9adb3'],
    ] as Tuple[]).map(([id, name, c, button]) => pal(id, name, c!, shd(c!, 0.3), shd(c!, -0.42), button!)),
  }),
  wall({
    id: 'marble-veined', name: 'Veined Marble Slabs',
    description: 'Polished marble with bold dark veining, book-matched like a hotel lobby feature wall.',
    family: 'luxury', tags: ['marble', 'stone', 'polished', 'veined', 'luxury', 'bathroom', 'feature-wall', 'hall'],
    packs: ['art-deco', 'modern-minimal'], price: 46,
    painter: 'map-wall', params: { map: 'stone-marble', tiles: 2, skirt: 0.1 }, repeat: 1.2,
    // roles: base, light, dark (the veins), trim
    palettes: ([
      ['carrara', 'Carrara', '#e8e5de', '#fbfaf7', '#6f7075'], ['calacatta-gold', 'Calacatta Gold', '#ece6d8', '#fbf8ef', '#a98c52'], ['nero-marquina', 'Nero Marquina', '#2b2b2e', '#3c3c40', '#e6e3dc'],
      ['emerald-marble', 'Emerald', '#2f5d4e', '#9fc2b4', '#0f2a22'], ['rosa-marble', 'Rosa', '#e6c6bd', '#f8e9e4', '#a8695d'], ['bardiglio', 'Bardiglio Grey', '#9a9da1', '#d3d5d7', '#4a4d52'],
      ['breccia', 'Breccia Terracotta', '#c88a5e', '#e6c6a4', '#6b3f26'], ['blue-marble', 'Azul Blue', '#4f6a86', '#a9bdd0', '#1c2a3a'],
    ] as Tuple[]).map(([id, name, ...c]) => pal(id, name, ...c, '#f5f1e8')),
  }),
  // --- murals and feature walls ----------------------------------------------------------------------------
  wall({
    id: 'mural-hills', name: 'Rolling Hills Mural',
    description: 'A landscape mural: banded sky and sun over four layers of rolling hills, with pines on the nearest ridge.',
    family: 'mural', tags: ['mural', 'landscape', 'hills', 'nature', 'feature-wall', 'bedroom', 'living', 'kids'],
    packs: ['botanical-living', 'kids-storybook'], price: 34,
    painter: 'mural-hills', params: { horizon: 1.5, skirt: 0.1 }, repeat: 3.0,
    paletteNote: 'Art-directed mural: five hand-picked colour schemes (times of day) instead of free recolouring, which would break the sky and haze.',
    // roles: sky, sun, far hills, mid hills, near hills, trim
    palettes: ([
      ['golden-dawn', 'Golden Dawn', '#f3dcc0', '#f6c46a', '#d9a58a', '#a8806a', '#6f5a48'], ['sage-morning', 'Sage Morning', '#d9e4de', '#f4e6b0', '#aac0b0', '#7f9f8a', '#4d6e5c'],
      ['blue-noon', 'Blue Noon', '#b9d8ea', '#fbf4d0', '#8fb0cc', '#5f86a8', '#3a5a78'], ['rose-dusk', 'Rose Dusk', '#d9a0a8', '#f6d27a', '#a8688a', '#704a6e', '#3f2f4a'],
      ['midnight-moon', 'Midnight Moon', '#1f2a44', '#e6e9f2', '#2f3f64', '#243452', '#16213a'],
    ] as Tuple[]).map(([id, name, ...c]) => pal(id, name, ...c, TRIM)),
  }),
  // --- themed -----------------------------------------------------------------------------------------------
  wall({
    id: 'library-shelves', name: 'Library Bookshelves',
    description: 'A trompe-l\'oeil wall of books: rows of cloth-bound spines with gilt bands, leaning volumes and the odd gap.',
    family: 'themed', tags: ['library', 'books', 'trompe-l-oeil', 'study', 'eclectic', 'living', 'feature-wall', 'bedroom'],
    packs: ['classic-townhouse', 'creative-studio'], price: 31,
    painter: 'library', params: { shelf: 0.34, skirt: 0.1 }, repeat: 1.2,
    // roles: back, shelf, book A, book B, book C, trim
    palettes: ([
      ['mahogany', 'Mahogany Library', '#3a2a24', '#6a4630', '#7a2c2c', '#2f4a3c', '#27324d'], ['oak-library', 'Light Oak Library', '#e9dcc0', '#b88a5a', '#a8423a', '#4f6b5a', '#34456a'],
      ['sage-library', 'Sage Library', '#a3b09a', '#7a6a52', '#8a3a34', '#2f4a3c', '#d9b45a'], ['terracotta-library', 'Terracotta Library', '#c4714d', '#5a3f2a', '#f0e2c4', '#2f4a3c', '#27324d'],
      ['navy-library', 'Navy Library', '#26324a', '#b88a5a', '#d9c48a', '#a8423a', '#4f6b5a'], ['ebony-library', 'Ebony Library', '#222224', '#4a3a30', '#b9503f', '#d9b45a', '#3f6a5a'],
      ['blush-library', 'Blush Library', '#f1dcd5', '#c9a58a', '#8a4a5a', '#4f6b5a', '#34456a'], ['mustard-library', 'Mustard Library', '#d9a641', '#5a3f2a', '#2f4a3c', '#7a2c2c', '#27324d'],
    ] as Tuple[]).map(([id, name, ...c]) => pal(id, name, ...c, TRIM)),
  }),
  wall({
    id: 'log-cabin', name: 'Log Cabin Wall',
    description: 'Stacked round logs with shaded curves, knots and pale chinking between. A lodge in a wall.',
    family: 'themed', tags: ['log', 'cabin', 'rustic', 'lodge', 'wood', 'living', 'bedroom', 'feature-wall'],
    packs: ['cozy-cottage'], price: 26,
    painter: 'panel-set', params: { style: 'log', height: 2.8, unit: 0.2, skirt: 0 }, repeat: 1.2,
    // roles: (unused upper = log colour), log, chinking, trim
    palettes: ([
      ['pine-log', 'Pine', '#c79a62', '#d9cdb4'], ['honey-log', 'Honey Cedar', '#c98f4f', '#e6dcc6'], ['walnut-log', 'Walnut', '#6b4a34', '#c2b49a'], ['white-log', 'Whitewashed', '#e6dccb', '#b9b0a0'],
      ['grey-log', 'Driftwood Grey', '#a9a296', '#d6d0c2'], ['dark-log', 'Smoked Oak', '#4a3426', '#9a8a70'], ['red-log', 'Red Cedar', '#a8603f', '#d9c9a8'], ['black-log', 'Charred', '#2f2b28', '#7a6e60'],
    ] as Tuple[]).map(([id, name, log, chink]) => pal(id, name, log!, log!, chink!, shd(log!, 0.2))),
  }),
];

// ---------------------------------------------------------------------------------------------
// Floor designs
// ---------------------------------------------------------------------------------------------

// wood: [base, light, dark, seam]
export const woodP = make((c) => [c!, shd(c!, 0.25), shd(c!, -0.38), shd(c!, -0.62)]);
export const WOODS: Tuple[] = [
  ['natural-oak', 'Natural Oak', '#c49a6c'], ['honey-oak', 'Honey Oak', '#c98f4f'], ['whitewashed-oak', 'Whitewashed Oak', '#e2d6c3'], ['grey-ash', 'Grey Ash', '#a9a296'],
  ['cherry', 'Cherry', '#9a5034'], ['smoked-oak', 'Smoked Oak', '#7a5a40'], ['walnut', 'Walnut', '#5e4030'], ['ebony', 'Ebony', '#3a2d28'],
];
export const WEATHERED: Tuple[] = [
  ['silver-barn', 'Silver Barnwood', '#9a958b'], ['tobacco-barn', 'Tobacco Barnwood', '#8a6a4a'], ['bleached-barn', 'Bleached Barnwood', '#cfc5b0'],
  ['driftwood', 'Driftwood', '#b8aa94'], ['charred-barn', 'Charred Barnwood', '#4a4038'], ['honey-barn', 'Honey Barnwood', '#b98a52'],
];
// carpets and fibres: [base, light, dark, grout(unused)]
export const fibreP = make((c) => [c!, shd(c!, 0.22), shd(c!, -0.32), shd(c!, -0.5)]);

export const FLOOR_DESIGNS_2: SurfaceDesign[] = [
  floor({
    id: 'oak-wide-boards', name: 'Wide Oak Boards',
    description: '20 cm engineered oak boards cut from real grain scans, in staggered lengths with fine bevelled joints.',
    family: 'wood-planks', tags: ['wood', 'planks', 'oak', 'wide', 'warm', 'living', 'bedroom', 'dining', 'hall'],
    packs: ['everyday-essentials', 'modern-minimal'], price: 16,
    painter: 'map-boards', params: { map: 'grain-oak', bands: 3, board: 0.2, minLen: 0.8, maxLen: 1.8, gap: 0.002, variation: 0.5 }, repeat: 1.8,
    palettes: woodP(WOODS),
  }),
  floor({
    id: 'oak-strip', name: 'Narrow Strip Flooring',
    description: '9 cm strip boards of short and medium length laid in random bond: a fine-grained, traditional floor.',
    family: 'wood-planks', tags: ['wood', 'strip', 'oak', 'narrow', 'traditional', 'hall', 'study', 'bedroom', 'dining'],
    packs: ['classic-townhouse', 'cozy-cottage'], price: 18,
    painter: 'map-boards', params: { map: 'grain-oak', bands: 3, board: 0.09, minLen: 0.5, maxLen: 1.2, gap: 0.0015, variation: 0.6 }, repeat: 1.08,
    palettes: woodP(WOODS),
  }),
  floor({
    id: 'barnwood-reclaimed', name: 'Reclaimed Barnwood',
    description: 'Salvaged barn boards of varied width with deep grain, splits, nail holes and worn edges.',
    family: 'wood-planks', tags: ['wood', 'reclaimed', 'barnwood', 'rustic', 'weathered', 'living', 'kitchen', 'hall'],
    packs: ['cozy-cottage', 'industrial-loft'], price: 22,
    painter: 'map-floor', params: { map: 'grain-barn', tiles: 1, cell: 0 }, repeat: 1.6,
    // roles: base, light, dark, grout (unused)
    palettes: fibreP(WEATHERED),
  }),
  floor({
    id: 'parquet-chevron', name: 'Chevron Parquet',
    description: 'Wood boards with mitred 45-degree ends meeting in a continuous zigzag: the Parisian chevron.',
    family: 'parquet', tags: ['wood', 'parquet', 'chevron', 'classic', 'elegant', 'living', 'dining', 'hall'],
    packs: ['classic-townhouse', 'art-deco'], price: 32,
    painter: 'parquet-set', params: { layout: 'chevron', block: 0.5, grain: 0.55, knots: 0.15, variation: 0.55 }, repeat: 1.0,
    palettes: woodP(WOODS),
  }),
  floor({
    id: 'parquet-basketweave', name: 'Basket Weave Parquet',
    description: 'Squares of parallel boards alternately turned a quarter: a woven check in wood.',
    family: 'parquet', tags: ['wood', 'parquet', 'basket-weave', 'vintage', 'check', 'hall', 'dining', 'study'],
    packs: ['classic-townhouse', 'mid-century'], price: 28,
    painter: 'parquet-set', params: { layout: 'basket', block: 0.3, grain: 0.55, knots: 0.1, variation: 0.55 }, repeat: 1.2,
    palettes: woodP(WOODS),
  }),
  floor({
    id: 'parquet-cubes', name: 'Tumbling Cube Parquet',
    description: 'Three-tone rhombus blocks that read as tumbling cubes: a bold mid-century inlay in wood.',
    family: 'parquet', tags: ['wood', 'parquet', 'cubes', 'isometric', 'mid-century', 'retro', 'hall', 'living'],
    packs: ['mid-century', 'art-deco'], price: 30,
    painter: 'parquet-set', params: { layout: 'cubes', block: 0.26, grain: 0.5, knots: 0.1, variation: 0.4 }, repeat: 1.2,
    palettes: woodP(WOODS),
  }),
  floor({
    id: 'vinyl-plank', name: 'Luxury Vinyl Plank',
    description: '14 cm waterproof vinyl planks with a printed wood grain, tight joints and no knots. Hard-wearing and warm underfoot.',
    family: 'laminate-vinyl', tags: ['vinyl', 'plank', 'lvp', 'waterproof', 'budget', 'kitchen', 'bathroom', 'hall', 'living'],
    packs: ['everyday-essentials'], price: 6,
    painter: 'planks', params: { plank: 0.14, minLen: 1.0, maxLen: 2.0, grain: 0.35, knots: 0, variation: 0.35 }, repeat: 1.68,
    palettes: woodP([
      ['vinyl-oak', 'Vinyl Oak', '#c2a47e'], ['vinyl-grey', 'Vinyl Grey', '#a3a099'], ['vinyl-white', 'Vinyl White', '#dcd6ca'], ['vinyl-walnut', 'Vinyl Walnut', '#6e4e3a'],
      ['vinyl-blonde', 'Vinyl Blonde', '#d9c196'], ['vinyl-charcoal', 'Vinyl Charcoal', '#4a4b4d'],
    ]),
  }),
  floor({
    id: 'marbled-linoleum', name: 'Marbled Linoleum',
    description: 'Natural linoleum sheet with swirling bands of two tones through the base colour. Cheap, tough and cheerful.',
    family: 'laminate-vinyl', tags: ['linoleum', 'marbled', 'sheet', 'retro', 'budget', 'kitchen', 'laundry', 'kids'],
    packs: ['everyday-essentials', 'mid-century'], price: 5,
    painter: 'marbled-lino', params: { swirl: 0.6 }, repeat: 1.0,
    // roles: base, light, dark
    palettes: plain([
      ['sage-lino', 'Sage', '#93a088', '#b9c4ae', '#6e7c64'], ['oatmeal-lino', 'Oatmeal', '#cbbba0', '#e6dcc4', '#9c8c70'], ['blue-lino', 'Blue', '#6f8aa8', '#a9c0d6', '#46607e'],
      ['terracotta-lino', 'Terracotta', '#b0674c', '#d99a7a', '#7a4430'], ['grey-lino', 'Grey', '#9a9c9e', '#c6c8c9', '#6a6c6e'], ['mustard-lino', 'Mustard', '#c99a3a', '#e8c878', '#8a6420'],
      ['charcoal-lino', 'Charcoal', '#46484c', '#7a7d82', '#26272a'],
    ]),
  }),
  floor({
    id: 'harlequin-tile', name: 'Harlequin Tile',
    description: 'Glazed square tiles set on the diagonal in two colours: the Victorian harlequin diamond floor.',
    family: 'tile', tags: ['tile', 'harlequin', 'diamond', 'checker', 'victorian', 'hall', 'kitchen', 'bathroom', 'washable'],
    packs: ['classic-townhouse'], price: 18,
    painter: 'checker', params: { tile: 0.3, grout: 0.003, diagonal: true, variation: 0.3 }, repeat: 0.9,
    // roles: tile A, tile B, grout
    palettes: plain([
      ['black-white', 'Black and White', '#f2f0ea', '#222326', '#b8b5ad'], ['terracotta-cream', 'Terracotta and Cream', '#efe6d4', '#b9654a', '#d8cfbf'], ['navy-white', 'Navy and White', '#f3f1ec', '#26344f', '#c9c6bf'],
      ['green-cream', 'Bottle Green and Cream', '#2f5a46', '#efe8d4', '#d2cdbf'], ['red-black', 'Red and Black', '#b13a32', '#1f1f21', '#8a8580'], ['grey-ivory', 'Grey and Ivory', '#8e9092', '#ebe7dc', '#c4c3bf'],
      ['blue-ivory', 'Cobalt and Ivory', '#2f5a98', '#f1ece0', '#cfcabc'],
    ]),
  }),
  floor({
    id: 'encaustic-tile', name: 'Encaustic Cement Tile',
    description: 'Framed medallion tiles with quarter-circle corners and a diamond heart, every second tile turned: Victorian pattern tiling.',
    family: 'tile', tags: ['tile', 'encaustic', 'cement', 'patterned', 'victorian', 'hall', 'kitchen', 'bathroom', 'vintage'],
    packs: ['classic-townhouse', 'art-deco'], price: 34,
    painter: 'encaustic', params: { tile: 0.2, grout: 0.0025 }, repeat: 0.8,
    // roles: ground, accent, accent 2, grout
    palettes: plain([
      ['cream-teal', 'Cream and Teal', '#efe6d0', '#2f7f80', '#c9a24e', '#d9d2c0'], ['cream-terracotta', 'Cream and Terracotta', '#efe6d0', '#b9654a', '#3a3a3c', '#d9d2c0'],
      ['navy-cream', 'Navy and Cream', '#2a3a5c', '#efe6d0', '#c9a24e', '#c4c0b6'], ['green-ivory', 'Green and Ivory', '#2f5a46', '#efe6d0', '#c9795a', '#c8c4b4'],
      ['grey-white', 'Grey and White', '#a9acaf', '#f3f1ec', '#4a4d52', '#d8d6d0'], ['mustard-black', 'Mustard and Black', '#d4a23a', '#2a2a2c', '#efe6d0', '#cfcabc'],
      ['blush-sage', 'Blush and Sage', '#efd4cc', '#8fa68a', '#b9707a', '#e0d8cc'], ['black-gold', 'Black and Gold', '#2a2a2c', '#c9a24e', '#efe6d0', '#8a857a'],
    ]),
  }),
  floor({
    id: 'penny-round-tile', name: 'Penny Round Mosaic',
    description: 'Tiny glazed penny rounds packed in offset rows with a scatter of accent tiles. A classic bathroom floor.',
    family: 'tile', tags: ['tile', 'mosaic', 'penny', 'round', 'retro', 'bathroom', 'kitchen', 'washable'],
    packs: ['mid-century', 'everyday-essentials'], price: 20,
    painter: 'penny-round', params: { size: 0.05, accent: 0.1, variation: 0.4 }, repeat: 0.8,
    // roles: field, accent, grout
    palettes: plain([
      ['white-penny', 'White and Black', '#f2f1ec', '#26272a', '#cfccc4'], ['mint-penny', 'Mint and White', '#bfdccf', '#f4f4f0', '#e4e2d6'], ['pink-penny', 'Pink and Cream', '#eec3c0', '#f4e8d4', '#f4eee6'],
      ['navy-penny', 'Navy and White', '#2f4a7a', '#f1eee6', '#d4d6d8'], ['sage-penny', 'Sage and Brass', '#a9b8a0', '#c9a24e', '#e0ddd0'], ['terracotta-penny', 'Terracotta', '#c47452', '#e8cfb4', '#e0d4c2'],
      ['charcoal-penny', 'Charcoal and Cream', '#3a3b3e', '#e8e1ce', '#8a8a86'],
    ]),
  }),
  floor({
    id: 'porcelain-large', name: 'Large Porcelain Tile',
    description: '60 cm matt porcelain slabs with soft stone veining and slim grout lines. Calm, modern, easy to clean.',
    family: 'tile', tags: ['tile', 'porcelain', 'large-format', 'modern', 'minimal', 'kitchen', 'living', 'bathroom', 'hall'],
    packs: ['modern-minimal'], price: 24,
    painter: 'tile-grid', params: { tileW: 0.6, tileH: 0.6, grout: 0.004, bond: 'stack', finish: 'porcelain', variation: 0.35 }, repeat: 1.2,
    // roles: tile, tile accent, grout
    palettes: plain([
      ['warm-grey', 'Warm Grey', '#b2aca2', '#d0cbc1', '#8f8a80'], ['ivory-porcelain', 'Ivory', '#e6dfd0', '#f3eee2', '#c4bdac'], ['cool-grey', 'Cool Grey', '#9a9fa3', '#c0c4c7', '#6f7377'],
      ['sand-porcelain', 'Sand', '#cbb99a', '#e0d2b6', '#a8987a'], ['charcoal-porcelain', 'Charcoal', '#4a4c50', '#686b70', '#2a2b2e'], ['white-porcelain', 'White', '#eeece6', '#fbfaf7', '#cfcbc0'],
      ['terracotta-porcelain', 'Terracotta', '#b8795a', '#d09a7a', '#8a5a40'],
    ]),
  }),
  floor({
    id: 'quarry-tile', name: 'Terracotta Quarry Tile',
    description: 'Small hand-made quarry tiles, each a little different in colour and edge, in deep grout. Kitchens and porches for centuries.',
    family: 'tile', tags: ['tile', 'quarry', 'terracotta', 'rustic', 'handmade', 'kitchen', 'hall', 'porch', 'cottage'],
    packs: ['cozy-cottage', 'garden-patio'], price: 14,
    painter: 'tile-grid', params: { tileW: 0.15, tileH: 0.15, grout: 0.008, bond: 'stack', finish: 'rustic', variation: 0.7 }, repeat: 0.9,
    palettes: plain([
      ['red-quarry', 'Terracotta Red', '#b0553a', '#c9724e', '#9a8a78'], ['buff-quarry', 'Buff', '#cdb68c', '#dfcba4', '#a89a80'], ['brown-quarry', 'Chocolate', '#7a4a36', '#946048', '#9a8a78'],
      ['black-quarry', 'Black', '#3a3a3c', '#58585c', '#8a8680'], ['blue-quarry', 'Staffordshire Blue', '#4a5a78', '#6a7a98', '#9a9890'], ['cream-quarry', 'Cream', '#e0d4b8', '#efe6cf', '#b8ac94'],
      ['ochre-quarry', 'Ochre', '#c08a3c', '#d9a85a', '#9a8a70'],
    ]),
  }),
  floor({
    id: 'marble-slabs', name: 'Marble Slabs',
    description: 'Polished 60 cm marble slabs, each cut from a different part of the block so the veining never repeats, in fine joints.',
    family: 'stone', tags: ['marble', 'stone', 'polished', 'veined', 'luxury', 'hall', 'bathroom', 'living', 'elegant'],
    packs: ['art-deco', 'classic-townhouse'], price: 52,
    painter: 'map-floor', params: { map: 'stone-marble', cell: 0.6, scale: 1.4, grout: 0.004, variation: 0.35, bevel: 0.3 }, repeat: 1.2,
    // roles: base, light, dark (veins), grout
    palettes: plain([
      ['carrara-floor', 'Carrara', '#e6e3dc', '#fbfaf7', '#6b6c70', '#cfcac0'], ['calacatta-floor', 'Calacatta Gold', '#ece6d8', '#fbf8ef', '#a98c52', '#cfc8b4'],
      ['nero-floor', 'Nero Marquina', '#2b2b2e', '#3c3c40', '#e6e3dc', '#5a5a5e'], ['emerald-floor', 'Verde Emerald', '#2f5d4e', '#9fc2b4', '#0f2a22', '#4a6a5e'],
      ['rosa-floor', 'Rosa Portogallo', '#e6c6bd', '#f8e9e4', '#a8695d', '#d4b4aa'], ['grey-floor', 'Bardiglio Grey', '#9a9da1', '#d3d5d7', '#4a4d52', '#7a7d80'],
      ['travertine-floor', 'Honed Travertine', '#d6c4a4', '#eee2c8', '#9a835a', '#b8a888'],
    ]),
  }),
  floor({
    id: 'slate-flagstones', name: 'Cleft Slate Flags',
    description: 'Irregular cleft slate flagstones with a riven surface and narrow joints. Rugged and cool.',
    family: 'stone', tags: ['stone', 'slate', 'flagstone', 'riven', 'rustic', 'hall', 'kitchen', 'patio', 'garden'],
    packs: ['cozy-cottage', 'garden-patio'], price: 21,
    painter: 'map-floor', params: { map: 'stone-slate', tiles: 1, cell: 0 }, repeat: 1.6,
    palettes: fibreP([
      ['slate-blue-flag', 'Blue Slate', '#5f6b76'], ['charcoal-flag', 'Charcoal', '#46484c'], ['rust-flag', 'Rust', '#8f6a4a'], ['green-flag', 'Welsh Green', '#5f7266'],
      ['buff-flag', 'Buff', '#a89c86'], ['silver-flag', 'Silver Grey', '#9a9d9e'], ['purple-flag', 'Heather', '#6a5f78'],
    ]),
  }),
  floor({
    id: 'berber-loop-carpet', name: 'Berber Loop Carpet',
    description: 'Chunky looped wool pile with flecks of colour: robust, textured and quiet underfoot.',
    family: 'carpet', tags: ['carpet', 'berber', 'loop-pile', 'wool', 'soft', 'bedroom', 'living', 'hall', 'stairs'],
    packs: ['everyday-essentials', 'cozy-cottage'], price: 9,
    painter: 'map-floor', params: { map: 'fibre-berber', tiles: 2, cell: 0 }, repeat: 1.0,
    palettes: fibreP([
      ['berber-oat', 'Oat', '#cbbba0'], ['berber-cream', 'Cream', '#e0d8c4'], ['berber-grey', 'Dove Grey', '#a9a7a3'], ['berber-sage', 'Sage', '#93a088'],
      ['berber-blush', 'Blush', '#d9b4aa'], ['berber-teal', 'Teal', '#4a8a86'], ['berber-navy', 'Navy', '#35425f'], ['berber-charcoal', 'Charcoal', '#4e4e52'],
    ]),
  }),
  floor({
    id: 'sisal-weave-carpet', name: 'Sisal Weave',
    description: 'Natural sisal fibre in a coarse basket weave. Hard-wearing, earthy and a little scratchy.',
    family: 'carpet', tags: ['carpet', 'sisal', 'natural', 'woven', 'fibre', 'coastal', 'living', 'hall', 'study'],
    packs: ['coastal-home', 'cozy-cottage'], price: 12,
    painter: 'map-floor', params: { map: 'fibre-sisal', tiles: 1, cell: 0 }, repeat: 1.0,
    palettes: fibreP([
      ['sisal-natural', 'Natural Sisal', '#c4a876'], ['sisal-bleached', 'Bleached', '#dcd0b4'], ['sisal-grey', 'Grey Wash', '#a8a498'], ['sisal-chocolate', 'Chocolate', '#6f523a'],
      ['sisal-sage', 'Sage', '#98a68a'], ['sisal-navy', 'Indigo', '#3f4d6e'],
    ]),
  }),
  floor({
    id: 'exposed-aggregate', name: 'Exposed Aggregate Concrete',
    description: 'Concrete with the surface washed back to show the pebbles inside it. Gripping, hard-wearing, a favourite for drives and patios.',
    family: 'concrete', tags: ['concrete', 'aggregate', 'pebbles', 'industrial', 'exterior', 'patio', 'garage', 'path'],
    packs: ['industrial-loft', 'garden-patio'], price: 11,
    painter: 'map-floor', params: { map: 'concrete-aggregate', tiles: 2, cell: 0 }, repeat: 1.2,
    palettes: fibreP([
      ['agg-grey', 'Grey', '#9a9a96'], ['agg-light', 'Pale', '#cfcdc4'], ['agg-sand', 'Sand', '#bfb292'], ['agg-brown', 'Brown', '#8a7560'], ['agg-blue', 'Blue Grey', '#7d8790'], ['agg-charcoal', 'Charcoal', '#54565a'],
    ]),
  }),
  floor({
    id: 'steel-tread-plate', name: 'Steel Tread Plate',
    description: 'Riveted steel tread plate with raised diamond lugs, scuffed and worn. Workshops, garages and loft kitchens.',
    family: 'concrete', tags: ['metal', 'steel', 'tread-plate', 'diamond-plate', 'industrial', 'garage', 'workshop', 'loft'],
    packs: ['industrial-loft'], price: 30,
    painter: 'diamond-plate', params: { lug: 0.07, wear: 0.5 }, repeat: 0.84,
    // roles: base, light, dark
    palettes: plain([
      ['bare-steel', 'Bare Steel', '#8d9296', '#d8dcdf', '#464a4e'], ['dark-steel', 'Gunmetal', '#5a5e63', '#9aa0a5', '#26292c'], ['galvanised-plate', 'Galvanised', '#d6dadd', '#f6f8f8', '#8a9094'],
      ['black-plate', 'Black Painted', '#2c2d30', '#5f6368', '#0f1011'], ['green-plate', 'Machine Green', '#4f6a5a', '#90ac9a', '#22302a'], ['rust-plate', 'Rusty', '#a8643a', '#cf9a72', '#4f2c16'],
      ['blue-plate', 'Navy Painted', '#3a4a64', '#7a8ca8', '#161e2c'],
    ]),
  }),
  floor({
    id: 'timber-decking', name: 'Timber Decking',
    description: 'Grooved deck boards with open gaps, butt joints over the joists and a screw at every crossing.',
    family: 'exterior', tags: ['decking', 'timber', 'wood', 'exterior', 'garden', 'patio', 'terrace', 'outdoor'],
    packs: ['garden-patio'], price: 15,
    painter: 'decking', params: { board: 0.14, gap: 0.01, joist: 0.5, grain: 0.6, variation: 0.5 }, repeat: 1.4,
    palettes: woodP([
      ['deck-cedar', 'Cedar', '#b0764a'], ['deck-silver', 'Weathered Silver', '#a39b8c'], ['deck-teak', 'Teak', '#a8774a'], ['deck-grey', 'Grey Stain', '#8a8d8e'],
      ['deck-walnut', 'Dark Walnut', '#5a4030'], ['deck-pine', 'Pressure-Treated Pine', '#b0a064'],
    ]),
  }),
  floor({
    id: 'pea-gravel', name: 'Pea Gravel Path',
    description: 'Loose rounded pea gravel in mixed colours, raked smooth. Crunchy underfoot.',
    family: 'exterior', tags: ['gravel', 'pebbles', 'path', 'drive', 'garden', 'exterior', 'outdoor', 'courtyard'],
    packs: ['garden-patio'], price: 8,
    painter: 'map-floor', params: { map: 'gravel', tiles: 1, cell: 0 }, repeat: 1.2,
    palettes: fibreP([
      ['gravel-mixed', 'Mixed Grey', '#8f9094'], ['gravel-golden', 'Golden', '#b89a66'], ['gravel-white', 'White', '#cfcdc4'], ['gravel-slate', 'Blue Slate', '#6a7682'],
      ['gravel-pink', 'Pink Granite', '#b08a80'], ['gravel-black', 'Black Basalt', '#46484b'],
    ]),
  }),
  floor({
    id: 'granite-cobbles', name: 'Granite Cobbles',
    description: 'Rounded granite setts in offset rows with sandy joints, each with its own tone and pitting.',
    family: 'exterior', tags: ['cobbles', 'setts', 'granite', 'paving', 'street', 'courtyard', 'exterior', 'path', 'drive'],
    packs: ['garden-patio', 'classic-townhouse'], price: 19,
    painter: 'cobbles', params: { size: 0.14, variation: 0.6 }, repeat: 1.0,
    // roles: stone A, stone B, stone C, joint
    palettes: plain([
      ['cobble-grey', 'Grey Granite', '#8f8d8a', '#a3a09c', '#7a7874', '#a8a090'], ['cobble-pink', 'Pink Granite', '#b08a80', '#c4a096', '#9a7a70', '#b8aa98'], ['cobble-blue', 'Blue Setts', '#6f7a80', '#808b90', '#5f6a70', '#9a9a92'],
      ['cobble-buff', 'Buff Sandstone', '#c0a880', '#d2bc98', '#a8906a', '#b8aa90'], ['cobble-dark', 'Basalt', '#4a4c50', '#5e6064', '#3a3c40', '#7a7870'], ['cobble-mixed', 'Mixed Stone', '#9a9a94', '#b09878', '#7f8a90', '#aaa28e'],
    ]),
  }),
  floor({
    id: 'brick-paving', name: 'Brick Paving',
    description: 'Fired clay paving bricks laid in running bond with sanded joints. Warm patios, paths and drives.',
    family: 'exterior', tags: ['brick', 'paving', 'running-bond', 'exterior', 'patio', 'path', 'garden', 'porch'],
    packs: ['garden-patio', 'classic-townhouse'], price: 17,
    painter: 'tile-grid', params: { tileW: 0.215, tileH: 0.1, grout: 0.008, bond: 'running', finish: 'brick', variation: 0.6 }, repeat: 0.86,
    palettes: plain([
      ['paver-red', 'Brindle Red', '#a5523a', '#b86a4e', '#b8aa94'], ['paver-buff', 'Buff', '#cdb68c', '#dfcba4', '#a89a80'], ['paver-charcoal', 'Charcoal', '#4a4c50', '#62656a', '#8a8680'],
      ['paver-orange', 'Terracotta Orange', '#c47a4a', '#d99464', '#b0a28a'], ['paver-grey', 'Stone Grey', '#9a9894', '#b0aeaa', '#7a7874'], ['paver-brown', 'Chocolate Brown', '#6a4538', '#845a4a', '#9a8e7e'],
    ]),
  }),
  floor({
    id: 'lawn-turf', name: 'Lawn Turf',
    description: 'Mown grass, close and even, with the natural variation of living turf.',
    family: 'exterior', tags: ['lawn', 'grass', 'turf', 'green', 'garden', 'exterior', 'outdoor', 'yard'],
    packs: ['garden-patio', 'botanical-living'], price: 4,
    painter: 'map-floor', params: { map: 'lawn', tiles: 2, cell: 0 }, repeat: 1.2,
    palettes: fibreP([
      ['lawn-summer', 'Summer Green', '#5f8f3f'], ['lawn-spring', 'Spring Green', '#7fae4f'], ['lawn-meadow', 'Meadow', '#8a9a4a'], ['lawn-straw', 'Dry Straw', '#b8a460'],
      ['lawn-moss', 'Shaded Moss', '#2f5a30'], ['lawn-winter', 'Frosted Winter', '#d3dccb'],
    ]),
  }),
];

// ---------------------------------------------------------------------------------------------
// Doors and windows (style keys: see src/render/openingMeshes.ts)
// ---------------------------------------------------------------------------------------------

const opening = (d: Omit<OpeningDef, 'status' | 'tier' | 'price'> & { price: number }): OpeningDef => ({
  ...d, status: 'ready', price: dollars(d.price), tier: d.price < 150 ? 'budget' : d.price < 350 ? 'standard' : d.price < 700 ? 'premium' : 'luxury',
});

export const OPENINGS_2: OpeningDef[] = [
  // --- doors ----------------------------------------------------------------------------------------------
  opening({
    id: 'door-flush', kind: 'door', name: 'Flush Slab Door',
    description: 'A plain flush interior door with a slim brushed handle. Minimal and quiet.',
    tags: ['door', 'interior', 'flush', 'modern', 'minimal'], packs: ['modern-minimal', 'everyday-essentials'],
    price: 160, width: 1, height: 2.1, sill: 0,
    style: { holeWidth: 0.84, frame: 0.04, casing: 0.05, frameColor: '#eceae4', hardware: '#9a9ea3', leaf: 'flush', leafColor: '#eceae4', handle: 'lever' },
  }),
  opening({
    id: 'door-closet', kind: 'door', name: 'Narrow Closet Door',
    description: 'A slim three-panel door for cupboards, pantries and powder rooms. Opens a little less than a full door.',
    tags: ['door', 'interior', 'narrow', 'closet', 'pantry', 'panelled'], packs: ['everyday-essentials', 'cozy-cottage'],
    price: 110, width: 1, height: 2.1, sill: 0,
    style: { holeWidth: 0.66, frame: 0.045, casing: 0.06, frameColor: '#f1ede4', hardware: '#b8955a', leaf: 'panel', leafColor: '#f1ede4', panelRows: 3, handle: 'knob' },
  }),
  opening({
    id: 'door-french', kind: 'door', name: 'French Garden Door',
    description: 'A full-height glazed door with a grid of small panes, opening onto the garden. Lets the light right in.',
    tags: ['door', 'french', 'garden', 'glazed', 'patio', 'exterior', 'bright'], packs: ['garden-patio', 'classic-townhouse'],
    price: 520, width: 1, height: 2.1, sill: 0,
    style: { holeWidth: 0.92, frame: 0.05, casing: 0.035, frameColor: '#f3f0e8', hardware: '#c29d5c', leaf: 'fullglass', leafColor: '#f3f0e8', litesX: 3, litesY: 6, handle: 'lever' },
  }),
  opening({
    id: 'door-dutch', kind: 'door', name: 'Stable Door',
    description: 'A plank door cut in two halves on a ledge frame, with a thumb latch. The top can swing while the bottom stays shut.',
    tags: ['door', 'stable', 'dutch', 'rustic', 'cottage', 'exterior', 'plank'], packs: ['cozy-cottage', 'garden-patio'],
    price: 380, width: 1, height: 2.1, sill: 0,
    style: { holeWidth: 0.88, frame: 0.055, casing: 0.05, frameColor: '#3f5a48', hardware: '#262626', leaf: 'dutch', leafColor: '#4f6e58', handle: 'lever' },
  }),
  opening({
    id: 'door-louvre', kind: 'door', name: 'Louvred Door',
    description: 'Angled slats let air through while hiding what is behind: for laundries, airing cupboards and utility rooms.',
    tags: ['door', 'louvre', 'louvered', 'laundry', 'utility', 'vented', 'interior'], packs: ['everyday-essentials', 'coastal-home'],
    price: 170, width: 1, height: 2.1, sill: 0,
    style: { holeWidth: 0.8, frame: 0.045, casing: 0.06, frameColor: '#f1ede4', hardware: '#9a9ea3', leaf: 'louvre', leafColor: '#dfe6e2', handle: 'knob' },
  }),
  opening({
    id: 'door-modern-glass', kind: 'door', name: 'Slim-Frame Glass Door',
    description: 'A floor-to-top glass door in a thin black steel frame with one horizontal bar and a long pull handle.',
    tags: ['door', 'glass', 'steel', 'modern', 'industrial', 'loft', 'office'], packs: ['industrial-loft', 'modern-minimal'],
    price: 640, width: 1, height: 2.1, sill: 0,
    style: { holeWidth: 0.9, frame: 0.04, casing: 0.04, frameColor: '#2b2c2f', hardware: '#2b2c2f', leaf: 'fullglass', leafColor: '#2b2c2f', litesX: 1, litesY: 2, handle: 'lever' },
  }),
  // --- windows ---------------------------------------------------------------------------------------------
  opening({
    id: 'window-picture', kind: 'window', name: 'Picture Window',
    description: 'One big fixed pane with a thin frame, set low to frame the garden. It does not open, but nothing is wider.',
    tags: ['window', 'picture', 'fixed', 'large', 'view', 'modern', 'living'], packs: ['modern-minimal', 'mid-century'],
    price: 420, width: 1, height: 1.5, sill: 0.6,
    style: { holeWidth: 0.94, frame: 0.04, casing: 0.02, frameColor: '#f3f2ee', hardware: '#9a9ea3', window: 'fixed', litesX: 1, litesY: 1, glass: 'clear', member: 0.03 },
  }),
  opening({
    id: 'window-tall', kind: 'window', name: 'Tall Narrow Window',
    description: 'A slim, floor-reaching casement with a fixed top light: a Georgian stair-hall window.',
    tags: ['window', 'tall', 'narrow', 'casement', 'stairs', 'hall', 'classic'], packs: ['classic-townhouse'],
    price: 300, width: 1, height: 1.7, sill: 0.5,
    style: { holeWidth: 0.6, frame: 0.045, casing: 0.07, frameColor: '#f3f0e8', hardware: '#b8955a', window: 'casement', single: true, transom: true, litesX: 1, litesY: 3, glass: 'clear' },
  }),
  opening({
    id: 'window-cottage', kind: 'window', name: 'Leaded Cottage Window',
    description: 'A small fixed window of many little panes in dark timber, set under the eaves. Looks a hundred years old.',
    tags: ['window', 'cottage', 'leaded', 'small-panes', 'rustic', 'dark-frame', 'kitchen'], packs: ['cozy-cottage'],
    price: 230, width: 1, height: 0.9, sill: 1.0,
    style: { holeWidth: 0.74, frame: 0.05, casing: 0.07, frameColor: '#4a3a2e', hardware: '#262626', window: 'fixed', litesX: 4, litesY: 3, glass: 'clear', member: 0.032 },
  }),
  opening({
    id: 'window-slider', kind: 'window', name: 'Sliding Window',
    description: 'Two panes that slide past each other in a slim frame. Easy to open and quick to clean.',
    tags: ['window', 'sliding', 'slider', 'modern', 'bedroom', 'kitchen', 'budget'], packs: ['everyday-essentials', 'mid-century'],
    price: 240, width: 1, height: 1.1, sill: 0.9,
    style: { holeWidth: 0.9, frame: 0.04, casing: 0.04, frameColor: '#e4e5e6', hardware: '#7a7e83', window: 'slider', litesX: 1, litesY: 1, glass: 'clear', member: 0.035 },
  }),
  opening({
    id: 'window-clerestory', kind: 'window', name: 'Clerestory Strip',
    description: 'A long, shallow strip of glass high on the wall: daylight without losing privacy or wall space.',
    tags: ['window', 'clerestory', 'strip', 'high', 'privacy', 'modern', 'bathroom', 'bedroom'], packs: ['modern-minimal', 'mid-century'],
    price: 190, width: 1, height: 0.4, sill: 1.8,
    style: { holeWidth: 0.92, frame: 0.035, casing: 0.03, frameColor: '#3a3b3e', hardware: '#7a7e83', window: 'fixed', litesX: 3, litesY: 1, glass: 'clear', member: 0.025 },
  }),
  opening({
    id: 'window-georgian', kind: 'window', name: 'Georgian Sash Window',
    description: 'A tall six-over-six sash window with slim glazing bars: the proportions of a Georgian terrace.',
    tags: ['window', 'sash', 'georgian', 'tall', 'six-over-six', 'classic', 'living', 'dining'], packs: ['classic-townhouse'],
    price: 440, width: 1, height: 1.5, sill: 0.7,
    style: { holeWidth: 0.82, frame: 0.05, casing: 0.07, frameColor: '#f3f0e8', hardware: '#b8955a', window: 'sash', litesX: 3, litesY: 3, glass: 'clear', member: 0.034 },
  }),
  opening({
    id: 'window-steel-grid', kind: 'window', name: 'Steel Grid Window',
    description: 'A fixed window of thin black steel muntins in a four-by-four grid. Warehouse glass for lofts and studios.',
    tags: ['window', 'steel', 'grid', 'crittall', 'industrial', 'loft', 'studio', 'black-frame'], packs: ['industrial-loft', 'creative-studio'],
    price: 560, width: 1, height: 1.4, sill: 0.8,
    style: { holeWidth: 0.9, frame: 0.035, casing: 0.035, frameColor: '#2b2c2f', hardware: '#2b2c2f', window: 'fixed', litesX: 4, litesY: 4, glass: 'clear', member: 0.022 },
  }),
  opening({
    id: 'window-awning', kind: 'window', name: 'Awning Window',
    description: 'A single top-hinged casement in a wide, low frame: it opens outward and keeps the rain out.',
    tags: ['window', 'awning', 'casement', 'coastal', 'bathroom', 'kitchen', 'ventilation'], packs: ['coastal-home', 'everyday-essentials'],
    price: 270, width: 1, height: 0.9, sill: 1.2,
    style: { holeWidth: 0.86, frame: 0.045, casing: 0.05, frameColor: '#e8efee', hardware: '#9a9ea3', window: 'casement', single: true, litesX: 2, litesY: 1, glass: 'clear', member: 0.035 },
  }),
];
