// Milestone 10 surface designs, group 'walls-f': brick and stone (28) and concrete, industrial and weathered (17).
// Written by the content agent of this group only; wired into the catalog once in ./index.ts. Helpers: ./kit.ts.
// Sources: dev/surfaces-ai/sources/walls-f.mjs; painters bond-brick, stone-set, plate-wall, seam-metal, tread-wall,
// breeze-block and peeled-plaster live in src/render/textures/packs/walls-f.ts.
//
// Material palettes are [base, light, dark, joint]: the colours tint the AI material map (0 -> dark, 0.5 -> base,
// 1 -> light), the joint colour is the mortar, grout or reveal drawn by the painter.

import type { Palette, SurfaceDesign } from '../types';
import { pal, shd, wall } from './kit';

type Swatch = [id: string, name: string, base: string, joint?: string];
/** Palette factory for the masonry painters; the joint defaults to a darker shade of the base. */
const tinted = (list: Swatch[], jointShade = -0.55): Palette[] =>
  list.map(([id, name, c, j]) => pal(id, name, c, shd(c, 0.26), shd(c, -0.34), j ?? shd(c, jointShade)));

const BRICK_A: Swatch[] = [
  ['red-brick', 'Red Brick', '#9e4b33', '#cdc3b2'], ['umber', 'Umber', '#6b4a3a', '#a89d8c'], ['buff-yellow', 'Buff Yellow', '#c9a676', '#e6dcc8'],
  ['cream-brick', 'Cream Brick', '#e6dcc8', '#bfb6a4'], ['london-grey', 'London Grey', '#8a8886', '#c4c0b8'], ['charcoal-brick', 'Charcoal', '#3a3938', '#6a6662'],
  ['whitewash', 'Whitewash', '#ece8df', '#d6d0c2'], ['terracotta', 'Terracotta', '#c4714d', '#d8cdb8'], ['blue-engineering', 'Blue Engineering', '#506a82', '#9aa3ab'],
  ['sage-painted', 'Sage Painted', '#8f9c86', '#c9cdbf'],
];
const BRICK_B: Swatch[] = [
  ['old-red', 'Old Red', '#a65a3d', '#6a6560'], ['chocolate', 'Chocolate', '#4e3329', '#8d8378'], ['honey', 'Honey', '#d1a85f', '#efe6d2'],
  ['chalk', 'Chalk', '#ddd5c4', '#a9a08f'], ['pewter', 'Pewter', '#7b7a7d', '#b4b0a8'], ['ink', 'Ink', '#2d2e31', '#4c4c50'],
  ['pearl', 'Pearl', '#efebe3', '#cfc8b8'], ['rust-brick', 'Rust', '#b05a35', '#cbbfa9'], ['slate-blue', 'Slate Blue', '#5b7088', '#a7aeb3'],
  ['olive', 'Olive', '#8a8f6a', '#cfd0bd'],
];
const STONE_A: Swatch[] = [
  ['sandstone', 'Sandstone', '#c9a676', '#e6dcc8'], ['limestone', 'Limestone', '#d8d0bc', '#9d9584'], ['granite', 'Granite Grey', '#8f8d8a', '#4e4c4a'],
  ['bluestone', 'Bluestone', '#6f7a80', '#3f4548'], ['basalt', 'Basalt', '#3f4144', '#1e1f21'], ['whitewashed-stone', 'Whitewashed', '#e6e1d6', '#bdb5a4'],
  ['rose-stone', 'Rose Stone', '#c98f7e', '#7a5a50'], ['honey-stone', 'Honey Stone', '#c4994d', '#8a7448'], ['moss-stone', 'Moss Grey', '#7d8672', '#4f5548'],
  ['charcoal-stone', 'Charcoal', '#34363a', '#16171a'],
];
const STONE_B: Swatch[] = [
  ['cotswold', 'Cotswold', '#cdb283', '#a89574'], ['pale-lime', 'Pale Lime', '#e0d9c8', '#b5ad9a'], ['pewter-stone', 'Pewter', '#85878a', '#5a5c5f'],
  ['storm-blue', 'Storm Blue', '#65737f', '#34393d'], ['coal', 'Coal', '#2f3134', '#0f1011'], ['chalk-stone', 'Chalk', '#ebe7dd', '#c9c2b2'],
  ['sunset-stone', 'Sunset', '#c9805f', '#6f4a3a'], ['amber-stone', 'Amber', '#c58f3d', '#7c6334'], ['lichen', 'Lichen', '#8d9578', '#59604a'],
  ['smoke-stone', 'Smoke', '#4a4a4e', '#222326'],
];
const CONCRETE: Swatch[] = [
  ['natural-concrete', 'Natural Grey', '#a3a29d'], ['pale-cement', 'Pale Cement', '#d3d1ca'], ['warm-greige', 'Warm Greige', '#b2a898'], ['sand-concrete', 'Sand', '#c2b49a'],
  ['blue-grey', 'Blue Grey', '#7d8790'], ['green-wash', 'Green Wash', '#8f9a88'], ['terracotta-wash', 'Terracotta Wash', '#b8643f'], ['teal-stain', 'Teal Stain', '#3f8a86'],
  ['charcoal-concrete', 'Charcoal', '#4c4d50'], ['graphite', 'Graphite', '#2f3033'],
];
const RUST: Swatch[] = [
  ['red-oxide', 'Red Oxide', '#a0522d'], ['burnt-sienna', 'Burnt Sienna', '#8c4a2a'], ['pale-rust', 'Pale Rust', '#d6c0a8'], ['dust-grey', 'Dust Grey', '#8a8078'],
  ['dark-iron', 'Dark Iron', '#4a2f20'], ['orange-rust', 'Orange Rust', '#c0662c'], ['painted-teal', 'Painted Teal', '#3f7f80'], ['bone-white', 'Bone White', '#e6dfd2'],
  ['black-iron', 'Black Iron', '#2b2724'], ['sage-flake', 'Sage Flake', '#8d9a84'],
];
const STEEL: Swatch[] = [
  ['raw-steel', 'Raw Steel', '#9aa0a6'], ['polished-steel', 'Polished', '#d8dbde'], ['gunmetal', 'Gunmetal', '#2f3338'], ['cobalt-steel', 'Cobalt', '#3f6fa8'],
  ['bronze-steel', 'Bronze', '#8a6a48'], ['champagne', 'Champagne', '#c9b99a'], ['signal-red', 'Signal Red', '#b5382c'], ['graphite-steel', 'Graphite', '#55595e'],
  ['pale-zinc', 'Pale Zinc', '#cfd3d4'], ['ocean-steel', 'Ocean', '#4a7a8c'],
];
/** Moves the palette with this id to the front, so it is the default (the design is shown with it first). */
const lead = (list: Swatch[], id: string): Swatch[] => [...list.filter((s) => s[0] === id), ...list.filter((s) => s[0] !== id)];
const BRICK_PACKS = ['industrial-loft', 'classic-townhouse'];

const brick = (d: {
  id: string; name: string; description: string; tags: string[]; price: number; repeat: number; palettes?: Swatch[]; packs?: string[];
  params: Record<string, number | string | boolean>;
}): SurfaceDesign => wall({
  id: d.id, name: d.name, description: d.description, family: 'brick-stone', tags: ['brick', 'masonry', ...d.tags],
  packs: d.packs ?? BRICK_PACKS, price: d.price, painter: 'bond-brick', params: { skirt: 0, ...d.params }, repeat: d.repeat,
  // roles: base, light, dark, mortar
  palettes: tinted(d.palettes ?? BRICK_A, -0.4),
});

const stone = (d: {
  id: string; name: string; description: string; tags: string[]; price: number; repeat: number; palettes?: Swatch[]; packs?: string[];
  params: Record<string, number | string | boolean>;
}): SurfaceDesign => wall({
  id: d.id, name: d.name, description: d.description, family: 'brick-stone', tags: ['stone', 'masonry', ...d.tags],
  packs: d.packs ?? ['classic-townhouse', 'cozy-cottage'], price: d.price, painter: 'stone-set', params: { skirt: 0, ...d.params }, repeat: d.repeat,
  // roles: base, light, dark, joint
  palettes: tinted(d.palettes ?? STONE_A),
});

const conc = (d: {
  id: string; name: string; description: string; tags: string[]; price: number; repeat: number; palettes: Swatch[]; packs?: string[];
  painter: string; params: Record<string, number | string | boolean>;
}): SurfaceDesign => wall({
  id: d.id, name: d.name, description: d.description, family: 'concrete', tags: d.tags,
  packs: d.packs ?? ['industrial-loft', 'modern-minimal'], price: d.price, painter: d.painter, params: { skirt: 0, ...d.params }, repeat: d.repeat,
  // roles: base, light, dark, joint
  palettes: tinted(d.palettes),
});

export const WALLS_F: SurfaceDesign[] = [
  // --- brick (14) -------------------------------------------------------------------------------------------
  brick({
    id: 'brick-english-bond', name: 'English Bond',
    description: 'Courses of stretchers alternate with courses of headers, the strong, formal bond of Victorian railway arches and town halls.',
    tags: ['english-bond', 'victorian', 'formal', 'hall', 'study', 'exterior'], price: 14, repeat: 1.8,
    params: { map: 'brick-face-fired', bond: 'english', variation: 0.7 },
  }),
  brick({
    id: 'brick-flemish-bond', name: 'Flemish Bond',
    description: 'Stretcher and header side by side in every course, the headers picked out in darker burnt ends. A Georgian garden wall.',
    tags: ['flemish-bond', 'georgian', 'garden', 'dining', 'living', 'traditional'], price: 24, repeat: 2.0, palettes: BRICK_B,
    params: { map: 'brick-face-handmade', bond: 'flemish', variation: 0.9, mapScale: 0.55 },
  }),
  brick({
    id: 'brick-stack-bond', name: 'Stack Bond Brick',
    description: 'Bricks set dead straight, joint over joint, in a calm modern grid with a fine, even mortar line.',
    tags: ['stack-bond', 'modern', 'grid', 'minimal', 'kitchen', 'living'], price: 9, repeat: 1.8, palettes: BRICK_B,
    params: { map: 'brick-face-fired', bond: 'stack', variation: 0.35, joint: 0.008, rake: 0.2 },
  }),
  brick({
    id: 'brick-herringbone', name: 'Herringbone Brick',
    description: 'Square-cut brick slips laid in a zigzag herringbone, the rich pattern of a Parisian courtyard turned up the wall.',
    tags: ['herringbone', 'pattern', 'parisian', 'feature-wall', 'hall', 'kitchen'], price: 34, repeat: 1.8,
    params: { map: 'brick-face-handmade', bond: 'herring', variation: 0.8 },
  }),
  brick({
    id: 'brick-basket-weave', name: 'Basket Weave Brick',
    description: 'Pairs of bricks laid alternately flat and upright in a chequerboard of little woven squares.',
    tags: ['basket-weave', 'pattern', 'cottage', 'feature-wall', 'kitchen', 'garden'], price: 30, repeat: 1.8, palettes: BRICK_B,
    params: { map: 'brick-face-fired', bond: 'basket', variation: 0.65 },
  }),
  brick({
    id: 'brick-soldier-courses', name: 'Soldier Course Brick',
    description: 'Running bond banded with a course of bricks standing on end every seventh row, as on a Victorian terrace.',
    tags: ['soldier-course', 'banded', 'victorian', 'terrace', 'hall', 'exterior'], price: 26, repeat: 1.8,
    params: { map: 'brick-face-handmade', bond: 'soldier-band', variation: 0.7 },
  }),
  brick({
    id: 'brick-header-bond', name: 'Header Bond Brick',
    description: 'Only the short ends show, in tight half-brick staggers: the dense, rhythmic face of a curved garden wall.',
    tags: ['header-bond', 'dense', 'garden', 'rhythmic', 'hall', 'study'], price: 11, repeat: 1.8, palettes: BRICK_B,
    params: { map: 'brick-face-fired', bond: 'header', variation: 0.75, joint: 0.011 },
  }),
  brick({
    id: 'brick-diaper-diamonds', name: 'Diaper Diamonds',
    description: 'Tudor diaper work: dark burnt headers form a lattice of diamonds across ordinary running bond.',
    tags: ['diaper', 'tudor', 'diamond', 'historic', 'feature-wall', 'study', 'dining'], price: 38, repeat: 1.8,
    params: { map: 'brick-face-fired', bond: 'diaper', variation: 0.5 },
  }),
  brick({
    id: 'brick-tumbled-rustic', name: 'Tumbled Rustic Brick',
    description: 'Hand-laid tumbled bricks of uneven length with wandering joints and knocked corners, like a barn that has seen a few winters.',
    tags: ['tumbled', 'rustic', 'farmhouse', 'cottage', 'kitchen', 'living'], price: 28, repeat: 2.0, packs: ['cozy-cottage', 'industrial-loft'],
    params: { map: 'brick-face-handmade', bond: 'tumbled', joint: 0.016, wobble: 1, chip: 0.35, variation: 1.0, mapScale: 0.55 },
  }),
  brick({
    id: 'brick-roman-raked', name: 'Raked Roman Brick',
    description: 'Long, slim Roman bricks with deeply raked bed joints that throw a crisp shadow line course after course.',
    tags: ['roman-brick', 'raked-joints', 'linear', 'modern', 'living', 'bedroom'], price: 32, repeat: 1.9, palettes: BRICK_B, packs: ['modern-minimal', 'mid-century'],
    params: { map: 'brick-face-fired', bond: 'running', brickW: 0.3, brickH: 0.04, rake: 1, variation: 0.45, joint: 0.011 },
  }),
  brick({
    id: 'brick-old-spalled', name: 'Weathered Spalled Brick',
    description: 'Centuries-old brick with soft, flaking faces, wide lime joints and pale salt bloom.',
    tags: ['spalled', 'weathered', 'aged', 'historic', 'loft', 'living', 'bedroom'], price: 12, repeat: 1.8, packs: ['industrial-loft', 'cozy-cottage'],
    params: { map: 'brick-face-spalled', bond: 'running', joint: 0.014, chip: 0.5, variation: 1.1, rake: 0.6 },
  }),
  brick({
    id: 'brick-glazed-gloss', name: 'Glazed Gloss Brick',
    description: 'Large glazed stretchers in a tight running bond: glossy, crazed, and as easy to wipe as a tiled bathhouse.',
    tags: ['glazed', 'glossy', 'bathroom', 'kitchen', 'retro', 'deli'], price: 36, repeat: 1.8, palettes: BRICK_B, packs: ['mid-century', 'everyday-essentials'],
    params: { map: 'brick-face-glazed', bond: 'running', brickW: 0.3, brickH: 0.1, joint: 0.006, gloss: 1, variation: 0.3, rake: 0.2 },
  }),
  brick({
    id: 'brick-sailor-courses', name: 'Sailor Brick',
    description: 'Every brick standing on its end in running bond, a tall slim rhythm that makes a low room feel higher.',
    tags: ['sailor-course', 'vertical', 'rhythmic', 'hall', 'bedroom', 'entry'], price: 29, repeat: 1.8,
    params: { map: 'brick-face-fired', bond: 'sailor', variation: 0.6 },
  }),
  brick({
    id: 'brick-third-lap', name: 'Third-Lap Brick',
    description: 'Each course steps a third of a brick across, so the joints climb the wall in soft diagonal runs.',
    tags: ['third-bond', 'diagonal', 'rhythm', 'kitchen', 'dining', 'study'], price: 5, repeat: 1.8, palettes: BRICK_B,
    params: { map: 'brick-face-handmade', bond: 'thirds', variation: 0.8 },
  }),
  // --- stone (14) -------------------------------------------------------------------------------------------
  stone({
    id: 'stone-coursed-rubble', name: 'Coursed Rubble',
    description: 'Hand-cut sandstone laid in rough courses, each stone slightly off square with a lime joint to match.',
    tags: ['coursed-rubble', 'rustic', 'cottage', 'feature-wall', 'living', 'kitchen'], price: 32, repeat: 2.4,
    params: { map: 'stone-sandstone', layout: 'coursed', size: 0.24, joint: 0.014, rough: 0.5, relief: 0.006 },
  }),
  stone({
    id: 'stone-banded-blocks', name: 'Banded Limestone',
    description: 'Tall and short courses of fine limestone alternating in a classic rhythm, with crisp, narrow joints.',
    tags: ['limestone', 'banded', 'classical', 'formal', 'hall', 'dining'], price: 44, repeat: 2.4, palettes: STONE_B, packs: ['classic-townhouse', 'art-deco'],
    params: { map: 'stone-limestone', layout: 'banded', size: 0.28, joint: 0.008, relief: 0.01, variation: 0.55 },
  }),
  stone({
    id: 'stone-ledger-strips', name: 'Stacked Ledger Slate',
    description: 'Thin, long strips of cleft slate stacked tight in staggered ledges. Dramatic stone cladding for a fireplace or feature wall.',
    tags: ['ledgerstone', 'slate', 'stacked', 'modern', 'feature-wall', 'living', 'bathroom'], price: 48, repeat: 2.0, palettes: lead(STONE_B, 'smoke-stone'), packs: ['modern-minimal', 'industrial-loft'],
    params: { map: 'stone-cleft-slate', layout: 'ledger', size: 0.075, joint: 0.004, relief: 0.004, mapScale: 0.5 },
  }),
  stone({
    id: 'stone-dry-stack', name: 'Dry-Stacked Fieldstone',
    description: 'Flat stones balanced without mortar, dark gaps between the uneven tops like a Cumbrian field wall.',
    tags: ['dry-stone', 'fieldstone', 'rustic', 'farmhouse', 'garden', 'feature-wall'], price: 40, repeat: 2.0, packs: ['cozy-cottage', 'garden-patio'],
    params: { map: 'stone-rockface', layout: 'dry', size: 0.14, joint: 0.012, rough: 0.7, relief: 0.007 },
  }),
  stone({
    id: 'stone-herringbone-slips', name: 'Herringbone Stone Slips',
    description: 'Travertine slips set in a tight herringbone, warm and fine-grained, like a hammam wall.',
    tags: ['herringbone', 'travertine', 'pattern', 'spa', 'bathroom', 'living'], price: 52, repeat: 2.0, palettes: STONE_B, packs: ['modern-minimal', 'coastal-home'],
    params: { map: 'stone-travertine-wall', layout: 'herring', size: 0.2, joint: 0.004, relief: 0.003, variation: 0.5 },
  }),
  stone({
    id: 'stone-flagstone-crazy', name: 'Crazy-Paved Flagstone',
    description: 'Irregular flags of every shape fitted together with broad mortar joints. An old-world feature wall or garden room.',
    tags: ['flagstone', 'crazy-paving', 'irregular', 'rustic', 'garden', 'feature-wall'], price: 36, repeat: 2.4, palettes: STONE_B, packs: ['garden-patio', 'cozy-cottage'],
    params: { map: 'stone-fieldstone', layout: 'flag', size: 0.38, joint: 0.014, relief: 0.008 },
  }),
  stone({
    id: 'stone-polygonal-fit', name: 'Polygonal Fit Granite',
    description: 'Big many-sided granite blocks fitted so tight the joints are hairlines, in the manner of ancient hill-fort walls.',
    tags: ['polygonal', 'granite', 'megalithic', 'dramatic', 'hall', 'feature-wall'], price: 56, repeat: 2.4, packs: ['classic-townhouse', 'modern-minimal'],
    params: { map: 'stone-granite', layout: 'cyclo', size: 0.5, joint: 0.004, relief: 0.012, variation: 0.55 },
  }),
  stone({
    id: 'stone-river-cobble', name: 'River Cobble Wall',
    description: 'Rounded river cobbles set in generous mortar, each one smoothed by water and a little different from its neighbours.',
    tags: ['cobble', 'river-stone', 'rounded', 'rustic', 'cottage', 'fireplace'], price: 42, repeat: 2.0, packs: ['cozy-cottage', 'garden-patio'],
    params: { map: 'stone-fieldstone', layout: 'cobble', size: 0.2, joint: 0.02, rough: 0.5, relief: 0.006 },
  }),
  stone({
    id: 'stone-knapped-flint', name: 'Knapped Flint',
    description: 'Small black flints split to show their glassy faces and chalk rinds, set in pale mortar. The garden wall of the Sussex downs.',
    tags: ['flint', 'knapped', 'chalk', 'coastal', 'garden', 'feature-wall'], price: 46, repeat: 1.6, palettes: lead(STONE_B, 'coal'), packs: ['coastal-home', 'classic-townhouse'],
    params: { map: 'stone-flint', layout: 'flint', size: 0.11, joint: 0.01, rough: 0.4, relief: 0.004, variation: 1 },
  }),
  stone({
    id: 'stone-basalt-columns', name: 'Basalt Columns',
    description: 'Six-sided basalt columns packed edge to edge, like the Giant\'s Causeway turned onto a wall.',
    tags: ['basalt', 'hexagon', 'columnar', 'dramatic', 'modern', 'feature-wall'], price: 58, repeat: 1.7, palettes: lead(STONE_A, 'basalt'), packs: ['modern-minimal', 'industrial-loft'],
    params: { map: 'stone-basalt', layout: 'hex', size: 0.14, joint: 0.006, relief: 0.006, variation: 0.8 },
  }),
  stone({
    id: 'stone-bookmatch-marble', name: 'Book-Matched Marble',
    description: 'Tall slabs of veined marble opened like a book, each pair mirrored so the veins flow into a symmetrical butterfly.',
    tags: ['marble', 'book-matched', 'veined', 'luxury', 'bathroom', 'living', 'feature-wall'], price: 88, repeat: 2.4, palettes: lead(STONE_B, 'chalk-stone'), packs: ['art-deco', 'classic-townhouse'],
    params: { map: 'marble-veined', layout: 'slabs', size: 0.6, joint: 0.003, relief: 0.002, mapScale: 1.2, variation: 0.5 },
  }),
  stone({
    id: 'stone-splitface-panels', name: 'Split-Face Panels',
    description: 'Wide rectangular panels of rough, rock-faced stone in running courses with tight modern joints.',
    tags: ['split-face', 'panels', 'rugged', 'modern', 'exterior', 'entry'], price: 54, repeat: 2.4, packs: ['modern-minimal', 'industrial-loft'],
    params: { map: 'stone-rockface', layout: 'panels', size: 0.3, joint: 0.006, relief: 0.01, variation: 0.5 },
  }),
  stone({
    id: 'stone-slate-diamonds', name: 'Slate Diamond Hung',
    description: 'Square slate tiles hung on the diagonal in a lattice of diamonds, a Welsh roof idea brought indoors.',
    tags: ['slate', 'diamond', 'diagonal', 'hung', 'bathroom', 'feature-wall'], price: 50, repeat: 1.76, palettes: lead(STONE_B, 'storm-blue'), packs: ['modern-minimal', 'cozy-cottage'],
    params: { map: 'stone-cleft-slate', layout: 'diamond', size: 0.22, joint: 0.006, relief: 0.004, variation: 0.7 },
  }),
  stone({
    id: 'stone-slate-scales', name: 'Fish-Scale Slate',
    description: 'Round-tailed slate shingles overlapping in rows, each casting a soft shadow onto the one below.',
    tags: ['slate', 'fish-scale', 'shingle', 'overlapping', 'coastal', 'entry', 'feature-wall'], price: 46, repeat: 1.8, palettes: lead(STONE_A, 'bluestone'), packs: ['coastal-home', 'cozy-cottage'],
    params: { map: 'stone-cleft-slate', layout: 'scales', size: 0.18, joint: 0.004, relief: 0.003, variation: 0.8 },
  }),
  // --- concrete, industrial and weathered (17) ---------------------------------------------------------------------
  conc({
    id: 'concrete-cast-smooth', name: 'Cast Concrete',
    description: 'Smooth cast-in-place concrete with soft clouding and the odd bug hole. Quiet, honest and endlessly useful.',
    tags: ['concrete', 'cast', 'smooth', 'minimal', 'brutalist', 'living', 'loft'], price: 14, repeat: 2.4, palettes: CONCRETE,
    painter: 'map-wall', params: { map: 'concrete-cast-smooth', tiles: 1 },
  }),
  conc({
    id: 'concrete-tie-panels', name: 'Precast Tie-Hole Panels',
    description: 'Large precast concrete panels with reveal joints and the round tie holes of the formwork left open.',
    tags: ['concrete', 'precast', 'tie-holes', 'panels', 'brutalist', 'loft', 'studio'], price: 22, repeat: 2.4, palettes: CONCRETE,
    painter: 'plate-wall', params: { map: 'concrete-precast', plateW: 1.2, plateH: 0.6, reveal: 0.008, fixing: 'tie', variation: 0.35 },
  }),
  conc({
    id: 'concrete-tall-panels', name: 'Floor-to-Ceiling Slabs',
    description: 'Tall precast slabs that run the whole height of the room, divided by dark vertical shadow gaps.',
    tags: ['concrete', 'slabs', 'tall', 'vertical', 'modern', 'gallery', 'hall'], price: 28, repeat: 2.4, palettes: CONCRETE, packs: ['modern-minimal', 'industrial-loft'],
    painter: 'plate-wall', params: { map: 'concrete-precast', plateW: 0.6, plateH: 2.8, reveal: 0.014, fixing: 'none', variation: 0.45 },
  }),
  conc({
    id: 'concrete-cmu-block', name: 'Cinder Block',
    description: 'Grey concrete masonry blocks in running bond with plain mortar: the workshop, garage and basement classic.',
    tags: ['cinder-block', 'cmu', 'garage', 'workshop', 'basement', 'industrial', 'utility'], price: 9, repeat: 2.4, palettes: CONCRETE, packs: ['industrial-loft', 'everyday-essentials'],
    painter: 'bond-brick', params: { map: 'concrete-block-face', bond: 'running', brickW: 0.4, brickH: 0.2, joint: 0.01, variation: 0.35, rake: 0.5, chip: 0.05, mapScale: 0.8 },
  }),
  conc({
    id: 'concrete-breeze-circles', name: 'Breeze Block Circles',
    description: 'Pierced concrete screen blocks with round cut-outs, the sun-dappled mid-century garden wall.',
    tags: ['breeze-block', 'screen', 'pierced', 'mid-century', 'retro', 'garden', 'patio'], price: 26, repeat: 1.6, palettes: CONCRETE, packs: ['mid-century', 'garden-patio'],
    painter: 'breeze-block', params: { map: 'concrete-precast', pattern: 'circle', block: 0.2, joint: 0.008 },
  }),
  conc({
    id: 'concrete-breeze-diamond', name: 'Breeze Block Diamonds',
    description: 'Square screen blocks with diamond openings, a sharp geometric lattice with a dark void behind it.',
    tags: ['breeze-block', 'screen', 'diamond', 'geometric', 'retro', 'patio', 'feature-wall'], price: 26, repeat: 1.6, palettes: CONCRETE, packs: ['mid-century', 'garden-patio'],
    painter: 'breeze-block', params: { map: 'concrete-precast', pattern: 'diamond', block: 0.2, joint: 0.008 },
  }),
  conc({
    id: 'concrete-rain-stained', name: 'Rain-Streaked Concrete',
    description: 'Concrete weathered by decades of rain: long vertical streaks, water stains and dark patches of damp.',
    tags: ['concrete', 'weathered', 'stained', 'streaks', 'urban', 'loft', 'living'], price: 16, repeat: 2.4, palettes: CONCRETE,
    painter: 'map-wall', params: { map: 'concrete-stained', tiles: 1 },
  }),
  conc({
    id: 'plaster-peeled-brick', name: 'Peeled Plaster over Brick',
    description: 'A rendered wall that has lost patches of its plaster, with old brick showing through ragged, crumbling-edged holes.',
    tags: ['peeled', 'plaster', 'brick', 'distressed', 'shabby', 'loft', 'cafe'], price: 30, repeat: 3.0, palettes: [
      ['chalk-plaster', 'Chalk Plaster', '#e6dfd2', '#9e4b33'], ['cream-plaster', 'Cream Plaster', '#d9ceb4', '#8a4a38'], ['grey-plaster', 'Grey Plaster', '#9a9893', '#a8553a'],
      ['dark-plaster', 'Dark Plaster', '#4a4743', '#9e4b33'], ['ochre-plaster', 'Ochre Plaster', '#d4a147', '#8d3f2d'], ['coral-plaster', 'Coral Plaster', '#d9735f', '#7a3a2c'],
      ['sage-plaster', 'Sage Plaster', '#9aa98f', '#a65a3d'], ['blue-plaster', 'Blue Plaster', '#6f8aa0', '#9e4b33'], ['blush-plaster', 'Blush Plaster', '#e3c3b8', '#8f4636'],
      ['ink-plaster', 'Ink Plaster', '#2b2e3a', '#a65a3d'],
    ],
    painter: 'peeled-plaster', params: { map: 'stucco-crumbling', brickMap: 'brick-face-spalled', patches: 5, size: 0.7, mapScale: 3.0 },
  }),
  conc({
    id: 'stucco-crumbling', name: 'Crumbling Stucco',
    description: 'Old stucco falling away in patches to the rough layer beneath, cracked and sun-bleached.',
    tags: ['stucco', 'crumbling', 'distressed', 'mediterranean', 'weathered', 'cafe', 'bedroom'], price: 18, repeat: 2.4, palettes: CONCRETE,
    packs: ['coastal-home', 'industrial-loft'], painter: 'map-wall', params: { map: 'stucco-crumbling', tiles: 1 },
  }),
  conc({
    id: 'paint-peeling', name: 'Flaking Paint',
    description: 'Layers of old paint cracking and curling off a wall, showing the bare surface in ragged islands.',
    tags: ['peeling-paint', 'flaking', 'distressed', 'shabby', 'urban', 'loft', 'studio'], price: 17, repeat: 1.8, palettes: [
      ['flaked-white', 'Flaked White', '#e4e0d6'], ['flaked-grey', 'Flaked Grey', '#a5a29c'], ['flaked-green', 'Flaked Green', '#7f9a82'], ['flaked-teal', 'Flaked Teal', '#3f8a86'],
      ['flaked-blue', 'Flaked Blue', '#5d7fa6'], ['flaked-red', 'Flaked Red', '#b5483a'], ['flaked-yellow', 'Flaked Yellow', '#d5a843'], ['flaked-charcoal', 'Flaked Charcoal', '#3a3b3e'],
      ['flaked-cream', 'Flaked Cream', '#dccfb0'], ['flaked-black', 'Flaked Black', '#26272a'],
    ],
    painter: 'map-wall', params: { map: 'paint-peeling', tiles: 1 },
  }),
  conc({
    id: 'rust-iron-sheet', name: 'Rusted Iron Sheet',
    description: 'Heavily corroded iron plate, orange and brown mottling with pitted, flaking patches.',
    tags: ['rust', 'iron', 'corroded', 'industrial', 'weathered', 'workshop', 'loft'], price: 20, repeat: 2.4, palettes: RUST,
    painter: 'map-wall', params: { map: 'rust-iron', tiles: 1 },
  }),
  conc({
    id: 'corten-bolted-panels', name: 'Corten Bolted Panels',
    description: 'Weathering-steel plates in a regular grid with a bolt at every corner and a rich, even rust patina.',
    tags: ['corten', 'weathering-steel', 'bolted', 'panels', 'modern', 'feature-wall', 'living'], price: 42, repeat: 2.4, palettes: RUST, packs: ['modern-minimal', 'industrial-loft'],
    painter: 'plate-wall', params: { map: 'rust-corten', plateW: 1.2, plateH: 0.6, reveal: 0.01, fixing: 'bolt', variation: 0.6 },
  }),
  conc({
    id: 'riveted-steel-plates', name: 'Riveted Steel Plates',
    description: 'Overlapping steel plates in staggered rows, riveted along every edge like a ship\'s hull or an old gasometer.',
    tags: ['riveted', 'steel', 'plates', 'industrial', 'steampunk', 'workshop', 'loft'], price: 38, repeat: 2.7, palettes: STEEL,
    painter: 'plate-wall', params: { map: 'zinc-galvanised', plateW: 0.9, plateH: 0.45, reveal: 0.004, fixing: 'rivet', stagger: 0.5, lap: 0.8, variation: 0.6 },
  }),
  conc({
    id: 'brushed-steel-panels', name: 'Brushed Steel Panels',
    description: 'Tall sheets of fine-brushed steel with fixing screws along the edges. Cool, clean and hard-wearing.',
    tags: ['brushed-steel', 'stainless', 'panels', 'kitchen', 'modern', 'commercial', 'utility'], price: 46, repeat: 2.4, palettes: STEEL,
    painter: 'plate-wall', params: { map: 'steel-brushed', plateW: 0.6, plateH: 1.2, reveal: 0.006, fixing: 'screw', variation: 0.25, mapScale: 0.6 },
  }),
  conc({
    id: 'zinc-standing-seam', name: 'Zinc Standing Seam',
    description: 'Vertical zinc pans closed by raised seams, each sheet a slightly different spangle of grey.',
    tags: ['zinc', 'standing-seam', 'metal', 'cladding', 'modern', 'exterior', 'kitchen'], price: 35, repeat: 1.6, palettes: STEEL, packs: ['modern-minimal', 'industrial-loft'],
    painter: 'seam-metal', params: { map: 'zinc-galvanised', pan: 0.4, seam: 0.022 },
  }),
  conc({
    id: 'copper-verdigris', name: 'Verdigris Copper',
    description: 'Old copper sheet gone green: patches of verdigris bloom over brown metal.',
    tags: ['copper', 'verdigris', 'patina', 'oxidised', 'weathered', 'feature-wall', 'bathroom'], price: 40, repeat: 2.4, palettes: [
      ['verdigris', 'Verdigris', '#5fa08a'], ['bright-copper', 'Bright Copper', '#b8734a'], ['aged-copper', 'Aged Copper', '#7a5a46'], ['pale-patina', 'Pale Patina', '#c4d6cb'],
      ['dark-bronze', 'Dark Bronze', '#3a2e27'], ['sea-green', 'Sea Green', '#4f8f7a'], ['grey-green', 'Grey Green', '#8d9e94'], ['brass', 'Brass', '#b69645'],
      ['pink-copper', 'Pink Copper', '#d79a7d'], ['mint-patina', 'Mint Patina', '#a9d1bd'],
    ],
    painter: 'map-wall', params: { map: 'patina-copper', tiles: 1 },
  }),
  conc({
    id: 'diamond-plate-wall', name: 'Diamond Plate Cladding',
    description: 'Bright tread plate with raised lozenges, screwed up the wall in sheets. The garage and food-truck finish.',
    tags: ['diamond-plate', 'tread-plate', 'steel', 'garage', 'industrial', 'workshop', 'utility'], price: 44, repeat: 2.4, palettes: STEEL, packs: ['industrial-loft', 'everyday-essentials'],
    painter: 'tread-wall', params: { map: 'steel-brushed', pitch: 0.04, sheetW: 1.2, sheetH: 1.4 },
  }),
];
