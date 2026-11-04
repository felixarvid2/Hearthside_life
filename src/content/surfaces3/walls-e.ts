// Milestone 10 surface designs, group 'walls-e': 19 wood panels, wainscoting and beadboard designs and 32 ceramic,
// mosaic and decorative wall tiles. Wired into the catalog once in ./index.ts. Helpers: ./kit.ts. Sources:
// dev/surfaces-ai/sources/walls-e.mjs (wood grains, glazes, stone, tile motifs); painters: render/textures/packs/walls-e.ts
// (wall-wood-lay, wall-panel-frame, wall-tile-lay). Palette roles per painter:
//   wall-wood-lay [base, light, dark, trim, upper]   wall-panel-frame [upper, panel, groove, rail]
//   wall-tile-lay [tile, alt, grout, ink, upper]

import type { Palette, SurfaceDesign } from '../types';
import { TRIM, pal, shd, wall } from './kit';

type WoodTuple = [id: string, name: string, base: string, upper?: string];
const woodPal = (list: WoodTuple[]): Palette[] =>
  list.map(([id, name, base, upper]) => pal(id, name, base, shd(base, 0.25), shd(base, -0.38), TRIM, upper ?? shd(base, 0.55)));

// Natural and stained timbers, for designs cut from a grain map. Light, dark, neutral and accent tones all present.
const TIMBERS: WoodTuple[] = [
  ['natural', 'Natural', '#c49a6c', '#e9e1d2'], ['honey', 'Honey', '#c98f4f', '#efe6d4'], ['whitewash', 'Whitewash', '#e6dccb', '#c9d2cc'],
  ['grey-wash', 'Grey Wash', '#a9a296', '#e4e1da'], ['smoked', 'Smoked', '#7a5a40', '#d9cdb8'], ['walnut', 'Walnut', '#5e4030', '#e6dccb'],
  ['ebony', 'Ebony', '#3a2d28', '#d0c8bc'], ['cherry', 'Cherry', '#9a5034', '#ebdfd0'], ['sage-stain', 'Sage Stain', '#9db59a', '#eae6da'],
  ['navy-stain', 'Navy Stain', '#34476a', '#e3dfd4'],
];
// Light-wood version (pine, ash, veneers): never darker than a mid brown so the grain stays visible.
const BLONDES: WoodTuple[] = [
  ['pale-ash', 'Pale Ash', '#dcc8a4', '#e8e2d4'], ['whitewash', 'Whitewash', '#e6dccb', '#c4d0cc'], ['natural', 'Natural', '#c49a6c', '#ece5d6'],
  ['honey', 'Honey', '#c98f4f', '#efe6d4'], ['grey-oak', 'Grey Oak', '#a9a296', '#e4e1da'], ['driftwood', 'Driftwood', '#b8aa94', '#dde4e2'],
  ['smoked', 'Smoked', '#7a5a40', '#d9cdb8'], ['walnut', 'Walnut', '#5e4030', '#e6dccb'], ['black-ash', 'Black Ash', '#2f2d2c', '#d0c8bc'],
  ['sage-wash', 'Sage Wash', '#9db59a', '#eae6da'],
];
const WEATHERED_WOODS: WoodTuple[] = [
  ['silver-barn', 'Silver Barnwood', '#9a958b', '#e4e1da'], ['tobacco-barn', 'Tobacco Barnwood', '#8a6a4a', '#e2d8c4'],
  ['bleached-barn', 'Bleached Barnwood', '#cfc5b0', '#c9d2cc'], ['driftwood', 'Driftwood', '#b8aa94', '#dde4e2'],
  ['charred-barn', 'Charred Barnwood', '#4a4038', '#d6cdbf'], ['honey-barn', 'Honey Barnwood', '#b98a52', '#efe6d4'],
  ['red-barn', 'Red Barn', '#a8483a', '#ebdfd0'], ['teal-barn', 'Teal Barn', '#4f8f86', '#e8e4d8'], ['sage-barn', 'Sage Barn', '#9db59a', '#eae6da'],
];

// Painted panelling in one colour (full-height designs and rails, colors[0] = the colour).
type PaintTuple = [id: string, name: string, c: string];
const PAINTS: PaintTuple[] = [
  ['white', 'Soft White', '#f3f0e8'], ['duck-egg', 'Duck Egg', '#c4d6d3'], ['sage', 'Sage', '#a9b59b'], ['navy', 'Navy', '#2f3d5a'],
  ['greige', 'Greige', '#b8afa2'], ['black', 'Black', '#2a2a2c'], ['terracotta', 'Terracotta', '#c4714d'], ['butter', 'Butter', '#ecd27c'],
  ['dusty-blue', 'Dusty Blue', '#8fa9b9'], ['forest', 'Forest', '#2f4a3c'],
];
const paintPal = (list: PaintTuple[]): Palette[] =>
  list.map(([id, name, c]) => pal(id, name, c, c, shd(c, -0.2), shd(c, 0.35)));

// Painted wainscot under a different wall colour: [id, name, upper wall, panel].
type TwoTuple = [id: string, name: string, upper: string, panel: string];
const TWO_TONES: TwoTuple[] = [
  ['white-white', 'White on White', '#f3f0e8', '#faf8f2'], ['sage-cream', 'Sage over Cream', '#b5c0a4', '#f4f0e4'], ['navy-white', 'Navy over White', '#2f3d5a', '#f6f3ec'],
  ['blush-grey', 'Blush over Grey', '#ecd2c8', '#8f9396'], ['greige-charcoal', 'Greige over Charcoal', '#bdb3a4', '#3b3d40'], ['terracotta-cream', 'Terracotta over Cream', '#c97b58', '#f3eadb'],
  ['mustard-oak', 'Mustard over Oak', '#d4a23f', '#a67a4d'], ['forest-ivory', 'Forest over Ivory', '#2f4a3c', '#efe8d6'], ['duck-navy', 'Duck Egg over Navy', '#cddfdc', '#2f3d5a'],
];
const twoPal = (list: TwoTuple[]): Palette[] =>
  list.map(([id, name, up, panel]) => pal(id, name, up, panel, shd(panel, -0.2), shd(panel, 0.4)));

// Tudor: [id, name, plaster, timber]
const TUDOR: TwoTuple[] = [
  ['cream-oak', 'Cream and Oak', '#eee6d2', '#4a3a2c'], ['white-black', 'White and Black', '#f3f0e8', '#25252a'], ['ochre-brown', 'Ochre and Brown', '#d6b068', '#3e2e22'],
  ['sage-dark', 'Sage and Dark Oak', '#a9b59b', '#3a2f26'], ['rose-oak', 'Rose and Oak', '#e2bfb2', '#523a2c'], ['grey-black', 'Grey and Black', '#a9a9a3', '#26262a'],
  ['terracotta-oak', 'Terracotta and Oak', '#c4714d', '#3e2e22'], ['navy-cream', 'Navy and Cream', '#2f3d5a', '#e9dfc6'], ['duck-brown', 'Duck Egg and Brown', '#c4d6d3', '#4a3a2c'],
];
const tudorPal = (list: TwoTuple[]): Palette[] =>
  list.map(([id, name, plaster, timber]) => pal(id, name, plaster, timber, shd(timber, -0.4), shd(plaster, 0.4)));

// --- tile palettes: [tile, alt, grout, ink, upper] -----------------------------------------------------------------
type TileTuple = [id: string, name: string, tile: string, alt: string, grout: string, ink?: string, upper?: string];
const tilePal = (list: TileTuple[]): Palette[] =>
  list.map(([id, name, tile, alt, grout, ink, upper]) => pal(id, name, tile, alt, grout, ink ?? shd(tile, -0.55), upper ?? shd(tile, 0.62)));

const GLAZES: TileTuple[] = [
  ['gloss-white', 'Gloss White', '#f1eee6', '#d9d3c4', '#cfc9bb'], ['cream', 'Cream', '#eadfc4', '#cfc09a', '#d8cfb8'], ['sage', 'Sage', '#a9b8a0', '#8a9e82', '#d6d4c4'],
  ['sea-green', 'Sea Green', '#4f8f86', '#7fb0a6', '#d8d4c8'], ['cobalt', 'Cobalt', '#2f4f8f', '#5d7fb8', '#d9dbdc'], ['terracotta', 'Terracotta', '#c47452', '#e29a78', '#e8dccb'],
  ['blush', 'Blush', '#e6bcb2', '#f3d6cf', '#f1e8e0'], ['mustard', 'Mustard', '#d6a53e', '#ecc872', '#e8dcc0'], ['charcoal', 'Charcoal', '#34363a', '#5a5d62', '#9a9a96'],
  ['dove', 'Dove Grey', '#a9acaf', '#cfd1d2', '#e0e0dc'],
];
// Two-tone designs: alt is a real contrast colour (diamonds, dots, listello, arch spandrels, ombre tops).
const DUOS: TileTuple[] = [
  ['white-navy', 'White and Navy', '#f1eee6', '#2f3f6a', '#d6d2c6'], ['cream-sage', 'Cream and Sage', '#eadfc4', '#8fa68a', '#d8cfb8'], ['sage-white', 'Sage and White', '#a9b8a0', '#f1eee6', '#d6d4c4'],
  ['teal-cream', 'Teal and Cream', '#2f7f80', '#efe6d0', '#cfd8d2'], ['navy-gold', 'Navy and Gold', '#26324f', '#cfae5c', '#b8bcc4'], ['terracotta-sand', 'Terracotta and Sand', '#c47452', '#e6d4b4', '#e8dccb'],
  ['blush-grey', 'Blush and Grey', '#e6bcb2', '#8f9396', '#f1e8e0'], ['mustard-charcoal', 'Mustard and Charcoal', '#d6a53e', '#3a3b3f', '#e8dcc0'], ['charcoal-white', 'Charcoal and White', '#34363a', '#e6e3dc', '#8a8a88'],
  ['dove-black', 'Dove and Black', '#a9acaf', '#2a2b2e', '#d9d9d6'],
];
// Natural stone: [stone, second stone, joint].
const STONES: TileTuple[] = [
  ['travertine', 'Travertine', '#d8c8a8', '#bfae8a', '#a8987a'], ['sand', 'Sandstone', '#c9b48a', '#a8946a', '#8f7d58'], ['marble-white', 'White Marble', '#ece8e0', '#cfcac0', '#b0aa9e'],
  ['pewter', 'Pewter', '#9a9a96', '#7a7a76', '#62625e'], ['slate', 'Slate', '#4a4d52', '#6a6d72', '#2a2c30'], ['charcoal-stone', 'Charcoal Stone', '#34363a', '#4e5156', '#1c1d20'],
  ['terracotta-stone', 'Terracotta Stone', '#b8704f', '#d08e6c', '#8a5238'], ['sage-stone', 'Sage Stone', '#9aa890', '#b6c2ac', '#74826a'], ['blush-stone', 'Blush Stone', '#d8b8a8', '#e8cfc2', '#b09484'],
  ['bone', 'Bone', '#e6dccb', '#d0c4ae', '#b3a78f'],
];
// Painted-motif tiles: ink is the hand-painted colour.
const DELFT: TileTuple[] = [
  ['delft-blue', 'Delft Blue', '#f3f0e8', '#d9d3c4', '#d6d2c6', '#2b4a8b'], ['manganese', 'Manganese', '#f1ece2', '#d9d3c4', '#d6d2c6', '#5b3f6e'], ['sage-print', 'Sage Print', '#f1eee4', '#d9d3c4', '#d6d2c6', '#4f7a55'],
  ['rust-print', 'Rust Print', '#f0e6d4', '#d9cdb4', '#d8cfb8', '#a8512f'], ['black-print', 'Black Print', '#eeeae0', '#d4cfc2', '#cfcabb', '#26262a'],
  ['cream-navy', 'Cream and Navy', '#e8dcc0', '#cfc09a', '#d8cfb8', '#26324f'], ['navy-cream', 'Navy and Cream', '#26324f', '#3f5282', '#d9dbdc', '#efe8d4'],
  ['mustard-navy', 'Mustard and Navy', '#d6a53e', '#ecc872', '#e8dcc0', '#2f3d5a'], ['terracotta-cream', 'Terracotta and Cream', '#c47452', '#e29a78', '#e8dccb', '#f3eadb'],
  ['charcoal-coral', 'Charcoal and Coral', '#34363a', '#5a5d62', '#9a9a96', '#e4806a'],
];

// Lemon majolica: yellow fruit on white, plus other inks and dark and bright tile grounds.
const LEMONS: TileTuple[] = [
  ['lemon-white', 'Lemon on White', '#f3f0e8', '#d9d3c4', '#d6d2c6', '#e0b52a'], ['lemon-cream', 'Lemon on Cream', '#e8dcc0', '#cfc09a', '#d8cfb8', '#d9a21f'], ['blue-on-white', 'Blue on White', '#f1eee6', '#d9d3c4', '#d6d2c6', '#2b4a8b'],
  ['green-on-sage', 'Green on Sage', '#a9b8a0', '#8a9e82', '#d6d4c4', '#e8e4cc'], ['lemon-navy', 'Lemon on Navy', '#26324f', '#3f5282', '#d9dbdc', '#e8c13a'], ['terracotta-print', 'Terracotta Print', '#f0e6d4', '#d9cdb4', '#d8cfb8', '#a8512f'],
  ['lemon-teal', 'Lemon on Teal', '#2f7f80', '#4f9a9a', '#cfd8d2', '#f0d048'], ['lemon-charcoal', 'Lemon on Charcoal', '#34363a', '#5a5d62', '#9a9a96', '#e8c13a'], ['rose-print', 'Rose Print', '#e6bcb2', '#f3d6cf', '#f1e8e0', '#b5566a'],
  ['lemon-mustard', 'Mustard and Blue', '#d6a53e', '#ecc872', '#e8dcc0', '#2b4a8b'],
];

const PACK_WOOD = { cottage: ['cozy-cottage', 'coastal-home'], classic: ['classic-townhouse', 'cozy-cottage'], modern: ['modern-minimal', 'mid-century'] };

export const WALLS_E: SurfaceDesign[] = [
  // ---------------------------------------------------------------------------------------------------------------
  // wood panels, wainscoting and beadboard
  // ---------------------------------------------------------------------------------------------------------------
  wall({
    id: 'panel-beadboard-tall', name: 'Full-Height Beadboard',
    description: 'Painted tongue-and-groove beadboard from skirting to ceiling, narrow boards with a crisp bead at every joint. Cottage calm, wall to wall.',
    family: 'wood-panel', tags: ['beadboard', 'panelling', 'painted', 'cottage', 'coastal', 'bathroom', 'hall', 'bedroom'],
    packs: PACK_WOOD.cottage, price: 20,
    painter: 'wall-panel-frame', params: { style: 'bead', height: 2.8, unit: 0.09, skirt: 0.12 }, repeat: 0.63,
    // roles: upper (unused), panel, groove, rail
    palettes: paintPal(PAINTS),
  }),
  wall({
    id: 'panel-peg-rail', name: 'Peg Rail Beadboard',
    description: 'Beadboard to shoulder height topped by a shaker shelf with turned pegs for coats and hats, painted wall above. A mudroom classic.',
    family: 'wood-panel', tags: ['beadboard', 'peg-rail', 'shaker', 'mudroom', 'farmhouse', 'hall', 'kitchen', 'entry'],
    packs: ['cozy-cottage', 'classic-townhouse'], price: 26,
    painter: 'wall-panel-frame', params: { style: 'bead', height: 1.5, unit: 0.1, pegs: true, skirt: 0.12 }, repeat: 0.6,
    palettes: twoPal(TWO_TONES),
  }),
  wall({
    id: 'panel-pine-vgroove', name: 'Knotty Pine V-Groove',
    description: 'Vertical knotty pine boards with a shallow V-groove at every edge, full height. Warm cabin walls cut from a real grain scan.',
    family: 'wood-panel', tags: ['wood', 'pine', 'knotty', 'tongue-and-groove', 'cabin', 'rustic', 'study', 'living', 'bedroom'],
    packs: ['cozy-cottage', 'industrial-loft'], price: 24,
    painter: 'wall-wood-lay', params: { style: 'tg-v', map: 'grain-pine-knotty', grain: 1.3, unit: 0.12, height: 2.8, gap: 0.0035, variation: 0.5, skirt: 0.1 }, repeat: 0.72,
    // roles: base, light, dark, trim, upper
    palettes: woodPal(BLONDES),
  }),
  wall({
    id: 'panel-sauna-ash', name: 'Horizontal Ash Cladding',
    description: 'Long, narrow ash boards laid horizontally from floor to ceiling with tight V-joints, the clean look of a Nordic sauna or spa.',
    family: 'wood-panel', tags: ['wood', 'ash', 'horizontal', 'cladding', 'nordic', 'spa', 'bathroom', 'bedroom', 'living'],
    packs: ['modern-minimal', 'coastal-home'], price: 19,
    painter: 'wall-wood-lay', params: { style: 'tg-h', map: 'grain-ash', grain: 0.9, unit: 0.1, height: 2.8, gap: 0.0025, variation: 0.4, skirt: 0.08 }, repeat: 0.9,
    palettes: woodPal(BLONDES),
  }),
  wall({
    id: 'panel-vgroove-painted', name: 'Painted V-Groove',
    description: 'Painted vertical V-groove boards with a hint of grain showing through the coat. Simple, hardwearing and easy on the eye.',
    family: 'wood-panel', tags: ['painted', 'v-groove', 'tongue-and-groove', 'vertical', 'cottage', 'kitchen', 'hall', 'bedroom'],
    packs: ['everyday-essentials', 'cozy-cottage'], price: 11,
    painter: 'wall-wood-lay', params: { style: 'tg-v', map: 'grain-ash', paint: 0.65, grain: 1.2, unit: 0.12, height: 2.8, gap: 0.005, variation: 0.25, skirt: 0.12 }, repeat: 0.72,
    palettes: woodPal([
      ['white', 'Soft White', '#f3f0e8', '#f3f0e8'], ['duck-egg', 'Duck Egg', '#c4d6d3', '#c4d6d3'], ['sage', 'Sage', '#a9b59b', '#a9b59b'], ['navy', 'Navy', '#2f3d5a', '#2f3d5a'],
      ['greige', 'Greige', '#b8afa2', '#b8afa2'], ['black', 'Black', '#2a2a2c', '#2a2a2c'], ['terracotta', 'Terracotta', '#c4714d', '#c4714d'], ['butter', 'Butter', '#ecd27c', '#ecd27c'],
      ['dusty-blue', 'Dusty Blue', '#8fa9b9', '#8fa9b9'],
    ]),
  }),
  wall({
    id: 'panel-reclaimed-barn', name: 'Reclaimed Barn Planks',
    description: 'Weathered planks of every width in random lengths, with cracks, nail holes and sun-bleached grain. Salvaged character for a feature wall.',
    family: 'wood-panel', tags: ['wood', 'reclaimed', 'barnwood', 'rustic', 'weathered', 'feature-wall', 'living', 'study', 'dining'],
    packs: ['industrial-loft', 'cozy-cottage'], price: 22,
    painter: 'wall-wood-lay', params: { style: 'planks', map: 'grain-reclaimed', grain: 1.0, unit: 0.16, varWidth: 0.5, minLen: 0.8, maxLen: 2.2, height: 2.8, gap: 0.004, variation: 0.8, skirt: 0 }, repeat: 1.6,
    palettes: woodPal(WEATHERED_WOODS),
  }),
  wall({
    id: 'panel-herringbone-walnut', name: 'Walnut Herringbone',
    description: 'Slim walnut boards laid in a tight herringbone from floor to ceiling, every chevron mitred by hand. A luxurious feature wall.',
    family: 'wood-panel', tags: ['wood', 'walnut', 'herringbone', 'luxury', 'feature-wall', 'living', 'study', 'dining'],
    packs: ['classic-townhouse', 'art-deco'], price: 34,
    painter: 'wall-wood-lay', params: { style: 'herringbone', map: 'grain-walnut', grain: 0.7, unit: 0.07, length: 4, height: 2.8, gap: 0.0025, variation: 0.6, skirt: 0.1 }, repeat: 0.8,
    palettes: woodPal(TIMBERS),
  }),
  wall({
    id: 'panel-chevron-ash', name: 'Ash Chevron',
    description: 'Wide ash boards cut at forty-five degrees and mitred on the ridge into a bold chevron that climbs the wall.',
    family: 'wood-panel', tags: ['wood', 'ash', 'chevron', 'zigzag', 'modern', 'feature-wall', 'living', 'bedroom', 'hall'],
    packs: ['modern-minimal', 'mid-century'], price: 32,
    painter: 'wall-wood-lay', params: { style: 'chevron', map: 'grain-ash', grain: 0.8, unit: 0.22, height: 2.8, gap: 0.003, variation: 0.55, skirt: 0.1 }, repeat: 0.88,
    palettes: woodPal(BLONDES),
  }),
  wall({
    id: 'panel-basketweave-cherry', name: 'Cherry Basketweave',
    description: 'Square panels of three slim cherry slats, each turned a quarter against its neighbour. A woven pattern in solid timber.',
    family: 'wood-panel', tags: ['wood', 'cherry', 'basketweave', 'slats', 'traditional', 'study', 'dining', 'feature-wall'],
    packs: ['classic-townhouse', 'mid-century'], price: 28,
    painter: 'wall-wood-lay', params: { style: 'basket', map: 'grain-cherry', grain: 0.7, unit: 0.045, length: 3, height: 2.8, gap: 0.0025, variation: 0.55, skirt: 0.1 }, repeat: 0.54,
    palettes: woodPal(TIMBERS),
  }),
  wall({
    id: 'panel-fluted-teak', name: 'Fluted Teak Reeds',
    description: 'Full-height half-round reeds in fine straight teak veneer, lit along one side. Softly sculpted and very mid-century.',
    family: 'wood-panel', tags: ['wood', 'fluted', 'reeded', 'teak', 'mid-century', 'modern', 'feature-wall', 'living', 'hall'],
    packs: ['mid-century', 'modern-minimal'], price: 30,
    painter: 'wall-wood-lay', params: { style: 'fluted', map: 'grain-teak-fine', grain: 0.9, unit: 0.06, height: 2.8, gap: 0.0015, variation: 0.35, skirt: 0.1 }, repeat: 0.6,
    palettes: woodPal(TIMBERS),
  }),
  wall({
    id: 'panel-bookmatch-burl', name: 'Burl Veneer Panels',
    description: 'Book-matched burl veneer in tall mirrored panels, the swirling figure meeting along a fine centre seam. Boardroom luxury.',
    family: 'wood-panel', tags: ['wood', 'burl', 'veneer', 'book-matched', 'luxury', 'study', 'dining', 'feature-wall'],
    packs: ['art-deco', 'classic-townhouse'], price: 45,
    painter: 'wall-wood-lay', params: { style: 'bookmatch', map: 'grain-burl', grain: 1.2, unit: 0.6, cell: 1.4, height: 2.8, gap: 0.003, variation: 0.5, skirt: 0.1 }, repeat: 1.2,
    palettes: woodPal(TIMBERS),
  }),
  wall({
    id: 'panel-picture-frame', name: 'Picture Frame Moulding',
    description: 'Slim applied mouldings forming a row of rectangular frames on a painted dado, finished with a cap rail. Quiet, classic and easy to live with.',
    family: 'wood-panel', tags: ['wainscoting', 'picture-frame', 'moulding', 'classic', 'painted', 'hall', 'dining', 'bedroom'],
    packs: ['classic-townhouse', 'cozy-cottage'], price: 21,
    painter: 'wall-panel-frame', params: { style: 'frame', height: 1.25, unit: 0.5, cell: 0.8, mould: 0.025, gap: 0.08, skirt: 0.12 }, repeat: 1.0,
    palettes: twoPal(TWO_TONES),
  }),
  wall({
    id: 'panel-flat-reveal', name: 'Flat Reveal Panels',
    description: 'Full-height flat panels separated by fine shadow-gap reveals, no mouldings at all. The architect\'s take on wainscot.',
    family: 'wood-panel', tags: ['panelling', 'flat', 'reveal', 'modern', 'minimal', 'painted', 'living', 'hall', 'bedroom'],
    packs: ['modern-minimal', 'mid-century'], price: 27,
    painter: 'wall-panel-frame', params: { style: 'flat', height: 2.8, unit: 0.6, cell: 1.2, gap: 0.012, skirt: 0.1 }, repeat: 1.2,
    palettes: paintPal(PAINTS),
  }),
  wall({
    id: 'panel-georgian-tiers', name: 'Georgian Two-Tier Panelling',
    description: 'Raised-and-fielded panels in two tiers, a lower dado and a tall upper row, parted by a chair rail and crowned with a cornice band.',
    family: 'wood-panel', tags: ['wainscoting', 'georgian', 'raised-panel', 'traditional', 'painted', 'dining', 'hall', 'study'],
    packs: ['classic-townhouse'], price: 38,
    painter: 'wall-panel-frame', params: { style: 'georgian', height: 0.95, unit: 0.5, mould: 0.03, gap: 0.07, skirt: 0.14 }, repeat: 1.0,
    palettes: paintPal(PAINTS),
  }),
  wall({
    id: 'panel-tudor-timber', name: 'Tudor Half-Timbering',
    description: 'Dark oak posts, rails and diagonal braces framing rough plaster bays, the look of a medieval inn.',
    family: 'wood-panel', tags: ['tudor', 'half-timbered', 'plaster', 'oak', 'medieval', 'pub', 'dining', 'living', 'feature-wall'],
    packs: ['cozy-cottage', 'classic-townhouse'], price: 29,
    painter: 'wall-panel-frame', params: { style: 'tudor', unit: 0.6, mould: 0.08, skirt: 0.12 }, repeat: 1.8,
    // roles: plaster, timber, grain shadow, skirting
    palettes: tudorPal(TUDOR),
  }),
  wall({
    id: 'panel-lattice-trellis', name: 'Garden Trellis Lattice',
    description: 'Slim diagonal battens crossing in a diamond lattice over a shadowed backing, a trellis brought indoors.',
    family: 'wood-panel', tags: ['lattice', 'trellis', 'battens', 'diamond', 'garden', 'conservatory', 'dining', 'bathroom'],
    packs: ['garden-patio', 'botanical-living'], price: 21,
    painter: 'wall-panel-frame', params: { style: 'lattice', unit: 0.3, cell: 0.55, mould: 0.022, skirt: 0.1 }, repeat: 0.6,
    // roles: (unused), backing, shadow, batten
    palettes: ([
      ['white-lattice', 'White Lattice', '#f1ede2', '#d6d1c2', '#ffffff'], ['sage-lattice', 'Sage Lattice', '#9db59a', '#5f7a62', '#e4ecdc'], ['navy-lattice', 'Navy Lattice', '#2f3d5a', '#1c2540', '#cdd5e6'],
      ['black-lattice', 'Black Lattice', '#2a2a2c', '#111112', '#d8d4c6'], ['teal-lattice', 'Teal Lattice', '#3f8f86', '#25564f', '#efe9d6'], ['blush-lattice', 'Blush Lattice', '#e6bcb2', '#b98a80', '#fbf1ea'],
      ['terracotta-lattice', 'Terracotta Lattice', '#c4714d', '#7a3f26', '#f3e4cf'], ['butter-lattice', 'Butter Lattice', '#ecd27c', '#b89a3c', '#fff6d6'], ['grey-lattice', 'Grey Lattice', '#a9acaf', '#5f6366', '#f1f1ee'],
    ] as Array<[string, string, string, string, string]>).map(([id, name, back, shadow, batten]) => pal(id, name, back, back, shadow, batten)),
  }),
  wall({
    id: 'panel-batten-grid', name: 'Square Batten Grid',
    description: 'Rows of square frames made from slim battens, a waffle grid that covers the wall evenly and catches the light.',
    family: 'wood-panel', tags: ['battens', 'grid', 'waffle', 'square', 'painted', 'modern', 'hall', 'bedroom', 'living'],
    packs: ['modern-minimal', 'cozy-cottage'], price: 23,
    painter: 'wall-panel-frame', params: { style: 'frame', height: 2.8, unit: 0.35, cell: 0.35, mould: 0.03, gap: 0, skirt: 0.12 }, repeat: 1.05,
    palettes: paintPal(PAINTS),
  }),
  wall({
    id: 'panel-cane-webbing', name: 'Cane Webbing Panels',
    description: 'Natural cane webbing in an octagonal weave, set into slim wooden frames in two rows. Airy, textured and a little retro.',
    family: 'wood-panel', tags: ['cane', 'rattan', 'webbing', 'woven', 'natural', 'boho', 'bedroom', 'living', 'feature-wall'],
    packs: ['coastal-home', 'mid-century'], price: 36,
    painter: 'wall-panel-frame', params: { style: 'cane', unit: 0.6, cell: 0.9, mould: 0.04, gap: 0.04, skirt: 0.1 }, repeat: 1.2,
    // roles: wall behind, cane strands, openings, frame
    palettes: ([
      ['natural-cane', 'Natural Cane', '#d9c08f', '#4a3a2c', '#8a6a44'], ['bleached-cane', 'Bleached Cane', '#e8dcc0', '#6a6258', '#b8a888'], ['dark-cane', 'Dark Cane', '#8a6a44', '#2a2018', '#3a2c20'],
      ['black-frame', 'Black Frame', '#d9c08f', '#2a2a2c', '#2a2a2c'], ['sage-frame', 'Sage Frame', '#e4d8b8', '#4a5a48', '#8fa68a'], ['navy-frame', 'Navy Frame', '#e4d8b8', '#1c2438', '#2f3d5a'],
      ['terracotta-frame', 'Terracotta Frame', '#e8dcc0', '#4a2a1e', '#c4714d'], ['white-frame', 'White Frame', '#d9c08f', '#5a4a3a', '#f3f0e8'], ['honey-cane', 'Honey Cane', '#c98f4f', '#3e2c1c', '#a8733a'],
    ] as Array<[string, string, string, string, string]>).map(([id, name, cane, hole, frame]) => pal(id, name, cane, cane, hole, frame)),
  }),
  wall({
    id: 'panel-bamboo-poles', name: 'Bamboo Pole Wall',
    description: 'Round bamboo poles standing side by side with node rings at their joints, floor to ceiling. A tropical bar or spa wall.',
    family: 'wood-panel', tags: ['bamboo', 'poles', 'tropical', 'natural', 'tiki', 'bathroom', 'living', 'feature-wall'],
    packs: ['garden-patio', 'coastal-home'], price: 27,
    painter: 'wall-wood-lay', params: { style: 'bamboo', unit: 0.055, height: 2.8, gap: 0.003, variation: 0.6, skirt: 0 }, repeat: 0.66,
    palettes: woodPal([
      ['green-bamboo', 'Green Bamboo', '#a3a95a', '#e4e6d0'], ['golden-bamboo', 'Golden Bamboo', '#d3b36a', '#efe6d0'], ['bleached-bamboo', 'Bleached Bamboo', '#e6dcc0', '#c9d2cc'],
      ['smoked-bamboo', 'Smoked Bamboo', '#7a5a40', '#d9cdb8'], ['black-bamboo', 'Black Bamboo', '#2f2d2c', '#d0c8bc'], ['honey-bamboo', 'Honey Bamboo', '#c98f4f', '#efe6d4'],
      ['sage-bamboo', 'Sage Bamboo', '#9db59a', '#eae6da'], ['whitewashed-bamboo', 'Whitewashed Bamboo', '#cfc8b6', '#dfe6e2'], ['teal-bamboo', 'Teal Bamboo', '#4f8f86', '#e8e4d8'],
    ]),
  }),

  // ---------------------------------------------------------------------------------------------------------------
  // ceramic, mosaic and decorative tiles (family tile)
  // ---------------------------------------------------------------------------------------------------------------
  wall({
    id: 'tile-subway-crackle', name: 'Crackle Glaze Subway',
    description: 'Classic running-bond subway tiles with a fine crackle glaze, every tile a little different. A timeless kitchen or bath wall.',
    family: 'tile', tags: ['tile', 'subway', 'crackle', 'glazed', 'classic', 'kitchen', 'bathroom', 'washable'],
    packs: ['everyday-essentials', 'cozy-cottage'], price: 18,
    painter: 'wall-tile-lay', params: { layout: 'grid', size: 0.15, aspect: 2, offset: 0.5, map: 'glaze-crackle', glaze: 0.4, grain: 0.45, grout: 0.003, variation: 0.25, finish: 'bevel' }, repeat: 0.6,
    palettes: tilePal(GLAZES),
  }),
  wall({
    id: 'tile-metro-handmade', name: 'Handmade Metro Tile',
    description: 'Long handmade metro tiles with pooled glaze, uneven edges and wavering joints. Rustic, glossy and full of life.',
    family: 'tile', tags: ['tile', 'metro', 'handmade', 'artisan', 'glazed', 'kitchen', 'bathroom', 'feature-wall'],
    packs: ['cozy-cottage', 'coastal-home'], price: 28,
    painter: 'wall-tile-lay', params: { layout: 'grid', size: 0.2, aspect: 2.8, offset: 0.5, map: 'glaze-zellige', glaze: 0.55, grain: 0.5, grout: 0.005, variation: 0.5, wobble: 0.7, finish: 'gloss' }, repeat: 0.8,
    palettes: tilePal(GLAZES),
  }),
  wall({
    id: 'tile-vertical-slim', name: 'Slim Vertical Stack',
    description: 'Tall, narrow glazed tiles stacked in staggered columns, a modern way to draw the eye up the wall.',
    family: 'tile', tags: ['tile', 'vertical', 'slim', 'glazed', 'modern', 'bathroom', 'kitchen', 'washable'],
    packs: ['modern-minimal', 'mid-century'], price: 24,
    painter: 'wall-tile-lay', params: { layout: 'grid', size: 0.2, aspect: 0.3, offset: 0.5, vertical: true, map: 'glaze-reactive', glaze: 0.5, grain: 0.5, grout: 0.003, variation: 0.35, finish: 'gloss' }, repeat: 0.6,
    palettes: tilePal(GLAZES),
  }),
  wall({
    id: 'tile-stone-thirds', name: 'Stone Thirds',
    description: 'Honed travertine rectangles laid in thirds, each row offset a third of a tile. A calm, natural wall for spa and kitchen.',
    family: 'tile', tags: ['tile', 'stone', 'travertine', 'natural', 'honed', 'spa', 'bathroom', 'kitchen', 'living'],
    packs: ['modern-minimal', 'coastal-home'], price: 31,
    painter: 'wall-tile-lay', params: { layout: 'grid', size: 0.3, aspect: 3, offset: 0.333, map: 'stone-travertine-wall', glaze: 0.8, grain: 0.6, grout: 0.003, variation: 0.4, finish: 'flat' }, repeat: 0.9,
    palettes: tilePal(STONES),
  }),
  wall({
    id: 'tile-herringbone-glazed', name: 'Glazed Herringbone',
    description: 'Slim glossy ceramic bars in a tight herringbone, light dancing along the zigzag. A classic with a bit of drama.',
    family: 'tile', tags: ['tile', 'herringbone', 'glazed', 'glossy', 'classic', 'kitchen', 'bathroom', 'feature-wall'],
    packs: ['classic-townhouse', 'modern-minimal'], price: 30,
    painter: 'wall-tile-lay', params: { layout: 'herringbone', size: 0.05, slats: 4, map: 'glaze-zellige', glaze: 0.55, grain: 0.5, grout: 0.002, variation: 0.4, finish: 'gloss' }, repeat: 0.85,
    palettes: tilePal(GLAZES),
  }),
  wall({
    id: 'tile-herringbone-marble', name: 'Marble Herringbone',
    description: 'Polished marble strips set in a herringbone, the veining running wild from tile to tile. Hotel-bathroom luxury.',
    family: 'tile', tags: ['tile', 'herringbone', 'marble', 'stone', 'luxury', 'bathroom', 'kitchen', 'feature-wall'],
    packs: ['art-deco', 'classic-townhouse'], price: 38,
    painter: 'wall-tile-lay', params: { layout: 'herringbone', size: 0.06, slats: 4, map: 'stone-marble', glaze: 0.75, grain: 0.7, grout: 0.002, variation: 0.25, finish: 'bevel' }, repeat: 0.68,
    palettes: tilePal(STONES),
  }),
  wall({
    id: 'tile-chevron-glaze', name: 'Glazed Chevron Tile',
    description: 'Mitred ceramic strips forming a clean chevron, the ridges meeting in unbroken vertical lines, deep glaze in every tile.',
    family: 'tile', tags: ['tile', 'chevron', 'zigzag', 'glazed', 'modern', 'bathroom', 'kitchen', 'feature-wall'],
    packs: ['modern-minimal', 'art-deco'], price: 34,
    painter: 'wall-tile-lay', params: { layout: 'chevron', size: 0.06, aspect: 3, map: 'glaze-reactive', glaze: 0.5, grain: 0.5, grout: 0.002, variation: 0.4, finish: 'gloss' }, repeat: 0.72,
    palettes: tilePal(GLAZES),
  }),
  wall({
    id: 'tile-basketweave-stone', name: 'Stone Basketweave',
    description: 'Little stone slats laid in basketweave squares, alternately horizontal and vertical, the oldest bathroom pattern there is.',
    family: 'tile', tags: ['tile', 'basketweave', 'stone', 'travertine', 'vintage', 'bathroom', 'kitchen', 'hall'],
    packs: ['classic-townhouse', 'cozy-cottage'], price: 26,
    painter: 'wall-tile-lay', params: { layout: 'basket', size: 0.05, slats: 3, map: 'stone-travertine-wall', glaze: 0.8, grain: 0.5, grout: 0.002, variation: 0.45, finish: 'flat' }, repeat: 0.6,
    palettes: tilePal(STONES),
  }),
  wall({
    id: 'tile-point-diamond', name: 'Diamond on Point',
    description: 'Square tiles turned on point into a field of diamonds, finished in a crackle glaze with softly bevelled edges.',
    family: 'tile', tags: ['tile', 'diamond', 'diagonal', 'crackle', 'glazed', 'bathroom', 'kitchen', 'hall'],
    packs: ['classic-townhouse', 'everyday-essentials'], price: 27,
    painter: 'wall-tile-lay', params: { layout: 'diamond', size: 0.16, aspect: 1, map: 'glaze-crackle', glaze: 0.4, grain: 0.45, grout: 0.003, variation: 0.3, finish: 'bevel' }, repeat: 0.64,
    palettes: tilePal(GLAZES),
  }),
  wall({
    id: 'tile-lozenge-stripes', name: 'Lozenge Two-Tone',
    description: 'Tall lozenge tiles in rows of two alternating colours, a Victorian chequer stretched upward. Speckled, matt and very characterful.',
    family: 'tile', tags: ['tile', 'lozenge', 'diamond', 'two-tone', 'victorian', 'speckled', 'hall', 'bathroom', 'kitchen'],
    packs: ['classic-townhouse', 'art-deco'], price: 29,
    painter: 'wall-tile-lay', params: { layout: 'diamond', size: 0.15, aspect: 1.7, alt: 'rows', map: 'glaze-speckle', glaze: 0.55, grain: 0.5, grout: 0.003, variation: 0.25, finish: 'pillow' }, repeat: 0.6,
    palettes: tilePal(DUOS),
  }),
  wall({
    id: 'tile-honeycomb', name: 'Speckled Honeycomb',
    description: 'Small hexagonal tiles in a matt speckled stoneware glaze, packed like a honeycomb with narrow joints.',
    family: 'tile', tags: ['tile', 'hexagon', 'honeycomb', 'speckled', 'matt', 'bathroom', 'kitchen', 'scandi'],
    packs: ['modern-minimal', 'everyday-essentials'], price: 25,
    painter: 'wall-tile-lay', params: { layout: 'hex', size: 0.1, map: 'glaze-speckle', glaze: 0.55, grain: 0.5, grout: 0.003, variation: 0.3, finish: 'flat' }, repeat: 0.6,
    palettes: tilePal(GLAZES),
  }),
  wall({
    id: 'tile-hex-terrazzo', name: 'Terrazzo Hexagon',
    description: 'Large hexagonal slabs of terrazzo, marble chips scattered in pale cement. Playful, graphic and thoroughly modern.',
    family: 'tile', tags: ['tile', 'hexagon', 'terrazzo', 'speckled', 'modern', 'retro', 'kitchen', 'bathroom', 'living'],
    packs: ['mid-century', 'modern-minimal'], price: 36,
    painter: 'wall-tile-lay', params: { layout: 'hex', size: 0.2, map: 'stone-terrazzo', glaze: 0.85, grain: 0.6, grout: 0.005, variation: 0.2, finish: 'bevel' }, repeat: 0.6,
    palettes: tilePal(STONES),
  }),
  wall({
    id: 'tile-picket', name: 'Picket Tile',
    description: 'Elongated hexagons standing like pickets in a fence, glossy reactive glaze pooling differently in each tile.',
    family: 'tile', tags: ['tile', 'picket', 'elongated-hex', 'glazed', 'modern', 'kitchen', 'bathroom', 'feature-wall'],
    packs: ['modern-minimal', 'coastal-home'], price: 30,
    painter: 'wall-tile-lay', params: { layout: 'picket', size: 0.1, aspect: 1.6, map: 'glaze-reactive', glaze: 0.5, grain: 0.5, grout: 0.003, variation: 0.35, finish: 'gloss' }, repeat: 0.6,
    palettes: tilePal(GLAZES),
  }),
  wall({
    id: 'tile-fish-scale', name: 'Fish Scale Tile',
    description: 'Overlapping fish-scale tiles in rows, arcs facing up, each scale glazed in a slightly different pool of colour.',
    family: 'tile', tags: ['tile', 'fish-scale', 'mermaid', 'scales', 'coastal', 'bathroom', 'kitchen', 'feature-wall'],
    packs: ['coastal-home', 'art-deco'], price: 33,
    painter: 'wall-tile-lay', params: { layout: 'scales', size: 0.1, map: 'glaze-reactive', glaze: 0.5, grain: 0.5, grout: 0.003, variation: 0.4, finish: 'gloss' }, repeat: 0.6,
    palettes: tilePal(GLAZES),
  }),
  wall({
    id: 'tile-scallop-fan', name: 'Scallop Fan Tile',
    description: 'Fan-shaped scallops with their arcs turned down, in a soft matt speckled glaze. Pretty without being fussy.',
    family: 'tile', tags: ['tile', 'scallop', 'fan', 'speckled', 'matt', 'retro', 'bathroom', 'kitchen', 'nursery'],
    packs: ['mid-century', 'coastal-home'], price: 31,
    painter: 'wall-tile-lay', params: { layout: 'scales', size: 0.12, flip: true, map: 'glaze-speckle', glaze: 0.55, grain: 0.5, grout: 0.003, variation: 0.3, finish: 'bevel' }, repeat: 0.72,
    palettes: tilePal(GLAZES),
  }),
  wall({
    id: 'tile-river-pebble', name: 'River Pebble Mosaic',
    description: 'Rounded stone pebbles pressed into a mosaic sheet, tones shifting from pebble to pebble. Spa floors on the wall.',
    family: 'tile', tags: ['tile', 'pebble', 'mosaic', 'stone', 'natural', 'spa', 'bathroom', 'shower'],
    packs: ['coastal-home', 'garden-patio'], price: 35,
    painter: 'wall-tile-lay', params: { layout: 'pebble', size: 0.05, map: 'stone-travertine-wall', glaze: 0.8, grain: 0.3, grout: 0.004, variation: 0.35, finish: 'pillow' }, repeat: 0.6,
    palettes: tilePal(STONES),
  }),
  wall({
    id: 'tile-triangle-mosaic', name: 'Triangle Mosaic',
    description: 'Little triangles of glaze fitted into an isometric mosaic, three tones scattered at random like a shard of stained glass.',
    family: 'tile', tags: ['tile', 'triangle', 'mosaic', 'geometric', 'glazed', 'modern', 'bathroom', 'feature-wall'],
    packs: ['mid-century', 'art-deco'], price: 27,
    painter: 'wall-tile-lay', params: { layout: 'triangle', size: 0.12, map: 'glaze-zellige', glaze: 0.55, grain: 0.4, grout: 0.003, variation: 0.25, finish: 'bevel' }, repeat: 0.6,
    palettes: tilePal(DUOS),
  }),
  wall({
    id: 'tile-cube-illusion', name: 'Tumbling Cube Tile',
    description: 'Rhombus tiles in three tones that read as a field of tumbling cubes, the old quilter\'s trick done in glazed ceramic.',
    family: 'tile', tags: ['tile', 'cubes', 'isometric', 'geometric', 'retro', 'hall', 'bathroom', 'kitchen'],
    packs: ['mid-century', 'classic-townhouse'], price: 32,
    painter: 'wall-tile-lay', params: { layout: 'cubes', size: 0.12, map: 'glaze-crackle', glaze: 0.4, grain: 0.4, grout: 0.003, variation: 0.15, finish: 'flat' }, repeat: 0.6,
    palettes: tilePal(GLAZES),
  }),
  wall({
    id: 'tile-modular-stone', name: 'Modular Stone Pattern',
    description: 'Stone tiles in several sizes laid in a random modular pattern, the way a French stonemason would cover a manor hall.',
    family: 'tile', tags: ['tile', 'modular', 'stone', 'travertine', 'french', 'natural', 'hall', 'kitchen', 'bathroom'],
    packs: ['classic-townhouse', 'cozy-cottage'], price: 34,
    painter: 'wall-tile-lay', params: { layout: 'mixed', size: 0.075, map: 'stone-travertine-wall', glaze: 0.8, grain: 0.8, grout: 0.003, variation: 0.5, finish: 'flat' }, repeat: 1.2,
    palettes: tilePal(STONES),
  }),
  wall({
    id: 'tile-ribbed-bars', name: 'Ribbed Ceramic Bars',
    description: 'Tall glazed bars with a fluted, ribbed face, stacked edge to edge so the light runs in soft stripes up the wall.',
    family: 'tile', tags: ['tile', 'ribbed', 'fluted', 'sculpted', 'glazed', 'modern', 'bathroom', 'kitchen', 'feature-wall'],
    packs: ['modern-minimal', 'mid-century'], price: 28,
    painter: 'wall-tile-lay', params: { layout: 'grid', size: 0.3, aspect: 0.33, offset: 0, vertical: true, map: 'glaze-zellige', glaze: 0.55, grain: 0.5, grout: 0.002, variation: 0.3, finish: 'ribbed' }, repeat: 0.6,
    palettes: tilePal(GLAZES),
  }),
  wall({
    id: 'tile-octagon-dot', name: 'Octagon and Dot',
    description: 'Octagonal tiles with small contrasting diamonds in the gaps, a pattern as old as the Roman bath house.',
    family: 'tile', tags: ['tile', 'octagon', 'dot', 'two-tone', 'classic', 'victorian', 'hall', 'bathroom', 'kitchen'],
    packs: ['classic-townhouse', 'art-deco'], price: 29,
    painter: 'wall-tile-lay', params: { layout: 'octagon', size: 0.15, map: 'glaze-speckle', glaze: 0.55, grain: 0.5, grout: 0.003, variation: 0.25, finish: 'bevel' }, repeat: 0.6,
    palettes: tilePal(DUOS),
  }),
  wall({
    id: 'tile-mosaic-square', name: 'Glass Square Mosaic',
    description: 'Tiny square mosaic tiles in a gloss glaze, each one catching the light a little differently. Fine grout, endless sparkle.',
    family: 'tile', tags: ['tile', 'mosaic', 'square', 'glass', 'glossy', 'bathroom', 'shower', 'kitchen', 'splashback'],
    packs: ['modern-minimal', 'coastal-home'], price: 22,
    painter: 'wall-tile-lay', params: { layout: 'grid', size: 0.04, aspect: 1, offset: 0, map: 'glaze-reactive', glaze: 0.5, grain: 0.3, grout: 0.0015, variation: 0.45, finish: 'gloss' }, repeat: 0.6,
    palettes: tilePal(GLAZES),
  }),
  wall({
    id: 'tile-mosaic-ombre', name: 'Ombre Mosaic',
    description: 'Small square mosaic tiles fading from deep colour at the floor to a pale tint at the top. Like sea glass, only vertical.',
    family: 'tile', tags: ['tile', 'mosaic', 'ombre', 'gradient', 'glass', 'luxury', 'bathroom', 'shower', 'feature-wall'],
    packs: ['coastal-home', 'art-deco'], price: 39,
    painter: 'wall-tile-lay', params: { layout: 'grid', size: 0.04, aspect: 1, offset: 0, map: 'glaze-reactive', glaze: 0.5, grain: 0.3, grout: 0.0015, variation: 0.1, finish: 'gloss', ombre: 0.9 }, repeat: 0.6,
    palettes: tilePal(DUOS),
  }),
  wall({
    id: 'tile-delft-tulip', name: 'Delft Tulip Tiles',
    description: 'Square white crackle tiles each hand-painted with a single tulip, in Delft blue or another old-pottery ink.',
    family: 'tile', tags: ['tile', 'delft', 'tulip', 'hand-painted', 'floral', 'dutch', 'kitchen', 'bathroom', 'cottage'],
    packs: ['cozy-cottage', 'classic-townhouse'], price: 26,
    painter: 'wall-tile-lay', params: { layout: 'grid', size: 0.15, aspect: 1, offset: 0, map: 'glaze-crackle', glaze: 0.4, grain: 0.3, grout: 0.003, variation: 0.2, finish: 'bevel', motif: 'motif-tile-tulip', motifRule: 'all', motifSize: 0.82 }, repeat: 0.6,
    // roles: tile, alt, grout, ink (the painted colour), upper
    palettes: tilePal(DELFT),
  }),
  wall({
    id: 'tile-delft-ships', name: 'Delft Ships Inset',
    description: 'Plain crackle-glazed tiles with a little painted sailing ship set in here and there, as on a Dutch seaport kitchen wall.',
    family: 'tile', tags: ['tile', 'delft', 'ship', 'nautical', 'hand-painted', 'coastal', 'kitchen', 'bathroom'],
    packs: ['coastal-home', 'cozy-cottage'], price: 24,
    painter: 'wall-tile-lay', params: { layout: 'grid', size: 0.15, aspect: 1, offset: 0, map: 'glaze-crackle', glaze: 0.4, grain: 0.3, grout: 0.003, variation: 0.2, finish: 'bevel', motif: 'motif-tile-sailboat', motifRule: 'scatter', altRate: 0.25, motifSize: 0.85 }, repeat: 0.6,
    palettes: tilePal(DELFT),
  }),
  wall({
    id: 'tile-azulejo-rosette', name: 'Azulejo Rosette',
    description: 'Glossy square tiles each painted with a radial rosette, the medallions touching corner to corner into a lace-like lattice. Portuguese in spirit.',
    family: 'tile', tags: ['tile', 'azulejo', 'rosette', 'hand-painted', 'portuguese', 'glossy', 'hall', 'kitchen', 'feature-wall'],
    packs: ['classic-townhouse', 'art-deco'], price: 31,
    painter: 'wall-tile-lay', params: { layout: 'grid', size: 0.2, aspect: 1, offset: 0, map: 'glaze-zellige', glaze: 0.45, grain: 0.4, grout: 0.003, variation: 0.2, finish: 'gloss', motif: 'motif-tile-rosette', motifRule: 'all', motifSize: 0.92 }, repeat: 0.6,
    palettes: tilePal(DELFT),
  }),
  wall({
    id: 'tile-lemon-majolica', name: 'Lemon Majolica',
    description: 'Glossy tiles painted with a single lemon on every other square, plain between, a splash of the Amalfi coast above the cooker.',
    family: 'tile', tags: ['tile', 'majolica', 'lemon', 'hand-painted', 'mediterranean', 'kitchen', 'splashback', 'dining'],
    packs: ['coastal-home', 'cozy-cottage'], price: 27,
    painter: 'wall-tile-lay', params: { layout: 'grid', size: 0.15, aspect: 1, offset: 0, map: 'glaze-reactive', glaze: 0.5, grain: 0.4, grout: 0.003, variation: 0.25, finish: 'gloss', motif: 'motif-tile-lemon', motifRule: 'checker', motifSize: 0.82 }, repeat: 0.6,
    palettes: tilePal(LEMONS),
  }),
  wall({
    id: 'tile-dado-listello', name: 'Tiled Dado with Listello',
    description: 'Crackle subway tiles to dado height, a band of small accent tiles halfway up and a bullnose edge under painted wall.',
    family: 'tile', tags: ['tile', 'dado', 'listello', 'subway', 'border', 'traditional', 'bathroom', 'kitchen', 'hall'],
    packs: ['classic-townhouse', 'cozy-cottage'], price: 33,
    painter: 'wall-tile-lay', params: { layout: 'grid', size: 0.15, aspect: 2, offset: 0.5, map: 'glaze-crackle', glaze: 0.4, grain: 0.45, grout: 0.003, variation: 0.25, finish: 'bevel', height: 1.2, band: 0.72, bandH: 0.06 }, repeat: 0.6,
    // roles: tile, accent band, grout, ink, painted wall above
    palettes: tilePal([
      ['white-navy-band', 'White with Navy Band', '#f1eee6', '#2f3f6a', '#d6d2c6', undefined, '#d9e2e0'], ['cream-sage-band', 'Cream with Sage Band', '#eadfc4', '#8fa68a', '#d8cfb8', undefined, '#e9e4d2'],
      ['sage-white-band', 'Sage with White Band', '#a9b8a0', '#f1eee6', '#d6d4c4', undefined, '#efe8d6'], ['teal-gold-band', 'Teal with Gold Band', '#2f7f80', '#cfae5c', '#cfd8d2', undefined, '#efe6d0'],
      ['navy-cream-band', 'Navy with Cream Band', '#26324f', '#e6dcc0', '#b8bcc4', undefined, '#dfe3ea'], ['terracotta-sand-band', 'Terracotta with Sand Band', '#c47452', '#e6d4b4', '#e8dccb', undefined, '#f1e4d2'],
      ['blush-grey-band', 'Blush with Grey Band', '#e6bcb2', '#8f9396', '#f1e8e0', undefined, '#f5eee8'], ['mustard-charcoal-band', 'Mustard with Charcoal Band', '#d6a53e', '#3a3b3f', '#e8dcc0', undefined, '#efe8d4'],
      ['charcoal-white-band', 'Charcoal with White Band', '#34363a', '#e6e3dc', '#8a8a88', undefined, '#cfcdc6'],
    ]),
  }),
  wall({
    id: 'tile-slab-terrazzo', name: 'Terrazzo Slabs',
    description: 'Large terrazzo slabs in a running bond with hairline joints. Chips of marble and glass in cement, in the grand Italian style.',
    family: 'tile', tags: ['tile', 'terrazzo', 'slab', 'large-format', 'speckled', 'modern', 'kitchen', 'bathroom', 'living'],
    packs: ['mid-century', 'modern-minimal'], price: 40,
    painter: 'wall-tile-lay', params: { layout: 'grid', size: 0.6, aspect: 2, offset: 0.5, map: 'stone-terrazzo', glaze: 0.85, grain: 1.0, grout: 0.004, variation: 0.25, finish: 'flat' }, repeat: 1.2,
    palettes: tilePal(STONES),
  }),
  wall({
    id: 'tile-slab-onyx', name: 'Onyx Panel Tile',
    description: 'Polished square onyx panels with swirling translucent bands, stacked with the finest joint. Pure showpiece.',
    family: 'tile', tags: ['tile', 'onyx', 'slab', 'large-format', 'luxury', 'polished', 'bathroom', 'feature-wall', 'living'],
    packs: ['art-deco', 'classic-townhouse'], price: 55,
    painter: 'wall-tile-lay', params: { layout: 'grid', size: 0.6, aspect: 1, offset: 0, map: 'stone-onyx', glaze: 0.85, grain: 0.6, grout: 0.002, variation: 0.15, finish: 'gloss' }, repeat: 1.2,
    palettes: tilePal(STONES),
  }),
  wall({
    id: 'tile-pillow-square', name: 'Pillow Square Tile',
    description: 'Square glazed tiles with softly domed, pillowy faces and a shadowed edge, stacked in neat columns.',
    family: 'tile', tags: ['tile', 'pillow', 'sculpted', 'dimensional', 'glazed', 'bathroom', 'kitchen', 'feature-wall'],
    packs: ['modern-minimal', 'coastal-home'], price: 25,
    painter: 'wall-tile-lay', params: { layout: 'grid', size: 0.1, aspect: 1, offset: 0, map: 'glaze-reactive', glaze: 0.5, grain: 0.4, grout: 0.003, variation: 0.35, finish: 'pillow' }, repeat: 0.6,
    palettes: tilePal(GLAZES),
  }),
  wall({
    id: 'tile-arch', name: 'Arch Tile',
    description: 'Arch-shaped glazed tiles side by side in rows, a contrasting colour showing in the spandrels between the curves.',
    family: 'tile', tags: ['tile', 'arch', 'curved', 'two-tone', 'glazed', 'modern', 'bathroom', 'kitchen', 'feature-wall'],
    packs: ['modern-minimal', 'art-deco'], price: 34,
    painter: 'wall-tile-lay', params: { layout: 'arch', size: 0.12, aspect: 1.5, map: 'glaze-zellige', glaze: 0.55, grain: 0.5, grout: 0.003, variation: 0.3, finish: 'gloss', bg: 'alt' }, repeat: 0.6,
    palettes: tilePal(DUOS),
  }),
];
