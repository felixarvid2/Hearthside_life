// Milestone 10 surface designs, group 'walls-a'. Written by the content agent of this group only; wired into the
// catalog once in ./index.ts. Helpers: ./kit.ts. Sources: dev/surfaces-ai/sources/walls-a.mjs (pilot sources are in pilot.mjs).
// 24 paint, plaster and subtle textures; 17 luxury fabrics, metallics and damask; 19 murals and feature walls (with the pilot).

import type { SurfaceDesign } from '../types';
import { TRIM, DUO, duoP, pal, ramp, shd, wall, make, type DesignInput, type Tuple } from './kit';

// tritone: map 0 -> dark, 0.5 -> base, 1 -> light; roles: base, light, dark, trim
const tritone = make((base) => [base!, shd(base!, 0.62), shd(base!, -0.7), TRIM]);

// ---------------------------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------------------------

/** Everyday paint colours: light, mid, dark and accent. */
const SOFT: Tuple[] = [
  ['chalk', 'Chalk', '#ece7dc'], ['cream', 'Buttermilk', '#e6dcc4'], ['greige', 'Greige', '#bdb4a5'], ['sage', 'Sage', '#9aa890'],
  ['duck-egg', 'Duck Egg', '#b5cdc8'], ['dusk-blue', 'Dusk Blue', '#6b7e93'], ['blush', 'Clay Pink', '#dfb5a8'], ['terracotta', 'Terracotta', '#bb6a4a'],
  ['mustard', 'Mustard', '#cfa046'], ['forest', 'Forest', '#3f5a48'], ['navy', 'Ink Navy', '#2f3d5a'], ['charcoal', 'Charcoal', '#45454a'],
];
/** roles: base, glaze (darker), highlight (lighter), trim */
const glazeP = make((c) => [c!, shd(c!, -0.22), shd(c!, 0.28), TRIM]);
/** roles: matt, satin, shadow, trim */
const sheenP = make((c) => [c!, shd(c!, 0.2), shd(c!, -0.35), TRIM]);

const WASH: Tuple[] = [
  ['dusk-peach', 'Dusk Peach', '#c4714d', '#f1dcc8'], ['sage-mist', 'Sage Mist', '#7f9a86', '#e3eadb'], ['ink-sky', 'Ink to Sky', '#2f3d5a', '#9fb2c8'],
  ['cream-blush', 'Cream to Blush', '#f4e8de', '#d9a09a'], ['ochre-white', 'Ochre to White', '#c9993f', '#f3ead2'], ['plum-lilac', 'Plum to Lilac', '#5a3f5e', '#c9b6cf'],
  ['teal-aqua', 'Teal to Aqua', '#2f7f80', '#cfe5e1'], ['charcoal-fog', 'Charcoal to Fog', '#3a3b3f', '#aeb0b2'],
];
/** roles: wall, block, accent, trim */
const BLOCK: Tuple[] = [
  ['cream-terracotta', 'Cream and Terracotta', '#efe8d8', '#bb6a4a', '#e0a37f'], ['white-sage', 'White and Sage', '#f1eee6', '#8fa68a', '#c3d0bb'],
  ['blush-navy', 'Blush and Navy', '#f0dcd4', '#2f3d5a', '#6f84a8'], ['greige-forest', 'Greige and Forest', '#b9b0a3', '#3f5a48', '#7f9a86'],
  ['mustard-cream', 'Mustard and Cream', '#cfa046', '#efe8d8', '#f5e0a8'], ['duck-charcoal', 'Duck Egg and Charcoal', '#d3e2de', '#45454a', '#8b9094'],
  ['navy-blush', 'Navy and Blush', '#2a3550', '#e0b5a8', '#f0d6cc'], ['forest-cream', 'Forest and Cream', '#2f4a3c', '#e9e1cf', '#c9b88a'],
];
const blockP = (list: Tuple[]) => list.map(([id, name, ...c]) => pal(id, name, ...c, TRIM));
const washP = (list: Tuple[]) => list.map(([id, name, a, b]) => pal(id, name, a!, b!, TRIM));

const METALS: Tuple[] = [
  ['gold', 'Gold', '#c9a24e'], ['champagne', 'Champagne', '#d8c9a4'], ['silver', 'Silver', '#b9bcc2'], ['brass', 'Antique Brass', '#a8863f'],
  ['bronze', 'Bronze', '#8a6038'], ['copper', 'Copper', '#b87049'], ['rose-gold', 'Rose Gold', '#c9958a'], ['pewter', 'Pewter', '#7c8085'],
  ['gunmetal', 'Gunmetal', '#3d4146'], ['black-chrome', 'Black Chrome', '#232427'],
];
const JEWEL: Tuple[] = [
  ['emerald', 'Emerald', '#1f5a4a'], ['navy', 'Navy', '#25324f'], ['oxblood', 'Oxblood', '#6a1f24'], ['plum', 'Plum', '#5a2f55'],
  ['teal', 'Teal', '#2e7a77'], ['mustard', 'Mustard', '#c99a3a'], ['blush', 'Blush', '#e1a9a4'], ['charcoal', 'Charcoal', '#3a3b3f'],
  ['ivory', 'Ivory', '#eee6d4'], ['greige', 'Greige', '#b3aa9b'],
];
const HIDE: Tuple[] = [
  ['ivory-hide', 'Ivory', '#e6dcc6'], ['oat-hide', 'Oat', '#cdbb9a'], ['camel', 'Camel', '#b58a5a'], ['cognac', 'Cognac', '#9a5a32'],
  ['tobacco', 'Tobacco', '#6b4a30'], ['black-hide', 'Black', '#26262a'], ['forest-hide', 'Forest', '#2f4a3c'], ['navy-hide', 'Navy', '#25324f'],
  ['blush-hide', 'Blush', '#dcaa9f'], ['grey-hide', 'Dove Grey', '#8f9094'],
];
/** Tone-on-tone and metallic-on-dark pairs: ground, motif. */
const TONAL: Tuple[] = [
  ['ivory-pearl', 'Ivory Pearl', '#efe9da', '#cfc4aa'], ['champagne-tone', 'Champagne', '#e4d6b8', '#bda676'], ['silver-grey', 'Silver Grey', '#cfd0d0', '#9ea1a6'],
  ['sage-tone', 'Sage', '#b4bfa8', '#8a9a7c'], ['duck-tone', 'Duck Egg', '#c2d6d2', '#8fb0aa'], ['blush-tone', 'Blush', '#ecd2cc', '#d0a39b'],
  ['navy-gold', 'Navy and Gold', '#26324f', '#c9a85a'], ['oxblood-gold', 'Oxblood and Gold', '#5a1f24', '#c9a85a'],
  ['coral-tone', 'Coral', '#d9704f', '#f0b89c'], ['black-gold', 'Black and Gold', '#1f1f22', '#b8954a'], ['emerald-gold', 'Emerald and Gold', '#1f4f40', '#d3b261'],
];
const toneP = make((g, m) => [g!, m!, shd(m!, 0.35), shd(g!, 0.7)]);

/** Mural tones: fixed ids and names so every mural offers the same eight moods. */
const MURAL_TONES: Tuple[] = [
  ['soft-sage', 'Soft Sage', '#7d8f78'], ['fjord', 'Fjord Blue', '#6f8aa0'], ['dawn-grey', 'Dawn Grey', '#9a9c9c'], ['dusk-plum', 'Dusk Plum', '#8a6a86'],
  ['amber', 'Amber Haze', '#c79a52'], ['midnight', 'Midnight', '#2f3d4a'], ['pale-linen', 'Pale Linen', '#e4dfd0'], ['teal-fog', 'Teal Fog', '#3f8a8a'],
];

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

type Rest = Pick<DesignInput, 'tags' | 'packs'> & { name: string; description: string; price: number; repeat: number; palettes: DesignInput['palettes'] };
const mapWall = (id: string, family: string, map: string, extra: Record<string, number | string | boolean>, r: Rest): SurfaceDesign =>
  wall({ id, family, painter: 'map-wall', params: { map, tiles: 2, skirt: 0.1, ...extra }, ...r });
const mural = (id: string, name: string, description: string, tags: string[], packs: string[], price: number): SurfaceDesign =>
  wall({
    id, name, description, family: 'mural', tags: ['mural', 'feature-wall', ...tags], packs, price,
    painter: 'mural-wall', params: { mural: id, fade: 0.3, fadeHeight: 0.4, skirt: 0.1 }, repeat: 5.6,
    palettes: tritone(MURAL_TONES),
  });

// ---------------------------------------------------------------------------------------------
// Designs
// ---------------------------------------------------------------------------------------------

const PAINT: SurfaceDesign[] = [
  wall({
    id: 'paint-ombre-wash', name: 'Ombre Colour Wash',
    description: 'One colour melting into another from floor to ceiling, brushed on so softly that no line shows anywhere.',
    family: 'paint', tags: ['paint', 'ombre', 'gradient', 'soft', 'modern', 'bedroom', 'nursery', 'living'],
    packs: ['modern-minimal', 'creative-studio'], price: 12,
    painter: 'wash-gradient', params: { curve: 1.2, grain: 0.5, skirt: 0.1 }, repeat: 2.4, palettes: washP(WASH),
  }),
  wall({
    id: 'paint-half-block', name: 'Half and Half',
    description: 'A taped, crisp horizontal split a little above hip height: bold colour below, calm wall above.',
    family: 'paint', tags: ['paint', 'colour-block', 'two-tone', 'modern', 'hall', 'kitchen', 'bedroom'],
    packs: ['modern-minimal', 'mid-century'], price: 9,
    painter: 'block-paint', params: { style: 'half', level: 1.1, skirt: 0.1 }, repeat: 2.4, palettes: blockP(BLOCK),
  }),
  wall({
    id: 'paint-tape-band', name: 'Painted Hip Band',
    description: 'A single stripe of strong colour, one hand-span deep, running round the room at counter height.',
    family: 'paint', tags: ['paint', 'colour-block', 'band', 'stripe', 'retro', 'kitchen', 'hall', 'kids'],
    packs: ['mid-century', 'kids-storybook'], price: 8,
    painter: 'block-paint', params: { style: 'band', level: 0.95, size: 0.3, skirt: 0.1 }, repeat: 2.4, palettes: blockP(BLOCK),
  }),
  wall({
    id: 'paint-arches', name: 'Painted Arches',
    description: 'Tall rounded arches painted straight onto the wall, each with a smaller arch inside it. A soft, sculptural way to colour a wall.',
    family: 'paint', tags: ['paint', 'arches', 'colour-block', 'boho', 'modern', 'bedroom', 'living', 'feature-wall'],
    packs: ['modern-minimal', 'creative-studio'], price: 16,
    painter: 'block-paint', params: { style: 'arch', level: 1.6, size: 0.35, count: 3, inner: true, skirt: 0.1 }, repeat: 3.6, palettes: blockP(BLOCK),
  }),
  wall({
    id: 'paint-sun-disc', name: 'Painted Sun Discs',
    description: 'Large painted circles rising on the wall like suns, each with a lighter heart. Playful, graphic and easy to live with.',
    family: 'paint', tags: ['paint', 'circles', 'colour-block', 'mid-century', 'modern', 'living', 'bedroom', 'kids'],
    packs: ['mid-century', 'kids-storybook'], price: 14,
    painter: 'block-paint', params: { style: 'disc', level: 1.5, size: 0.5, count: 2, inner: true, skirt: 0.1 }, repeat: 3.2, palettes: blockP(BLOCK),
  }),
  wall({
    id: 'paint-peaks', name: 'Painted Peaks',
    description: 'A range of hard-edged mountain peaks painted along the lower wall in two layers of colour, like a mural in two strokes.',
    family: 'paint', tags: ['paint', 'mountains', 'colour-block', 'scandi', 'nursery', 'bedroom', 'kids'],
    packs: ['modern-minimal', 'kids-storybook'], price: 13,
    painter: 'block-paint', params: { style: 'peaks', level: 1.0, size: 0.5, count: 3, skirt: 0.1 }, repeat: 3.6, palettes: blockP(BLOCK),
  }),
  wall({
    id: 'paint-strie', name: 'Strie Dragged Glaze',
    description: 'Fine vertical streaks dragged through a wet glaze: the classic English strie finish, with a soft linen-like grain.',
    family: 'paint', tags: ['paint', 'strie', 'glaze', 'traditional', 'decorative', 'dining', 'study', 'hall'],
    packs: ['classic-townhouse', 'cozy-cottage'], price: 15,
    painter: 'glaze-set', params: { style: 'strie', scale: 1, strength: 0.9, skirt: 0.1 }, repeat: 1.6, palettes: glazeP(SOFT),
  }),
  wall({
    id: 'paint-sponged', name: 'Sponged Glaze',
    description: 'Glaze dabbed on with a natural sponge, leaving soft overlapping blots in two tones over the base coat.',
    family: 'paint', tags: ['paint', 'sponged', 'glaze', 'faux-finish', 'retro', 'bathroom', 'hall', 'bedroom'],
    packs: ['cozy-cottage', 'everyday-essentials'], price: 11,
    painter: 'glaze-set', params: { style: 'sponge', scale: 1, strength: 0.9, skirt: 0.1 }, repeat: 1.2, palettes: glazeP(SOFT),
  }),
  wall({
    id: 'paint-rag-rolled', name: 'Rag-Rolled Glaze',
    description: 'A twisted cloth rolled through wet glaze leaves long, folded, cloudy marks: busy up close, calm from across the room.',
    family: 'paint', tags: ['paint', 'rag-rolled', 'glaze', 'faux-finish', 'traditional', 'dining', 'living', 'hall'],
    packs: ['classic-townhouse', 'cozy-cottage'], price: 12,
    painter: 'glaze-set', params: { style: 'rag', scale: 1, strength: 0.9, skirt: 0.1 }, repeat: 1.6, palettes: glazeP(SOFT),
  }),
  wall({
    id: 'paint-stippled', name: 'Stippled Eggshell',
    description: 'A fine pounce of tiny dots in two shades over the base coat. Almost smooth, with a gentle life-like shimmer.',
    family: 'paint', tags: ['paint', 'stippled', 'eggshell', 'subtle', 'faux-finish', 'bedroom', 'living', 'hall'],
    packs: ['everyday-essentials', 'modern-minimal'], price: 7,
    painter: 'glaze-set', params: { style: 'stipple', scale: 1, strength: 0.9, skirt: 0.1 }, repeat: 1.0, palettes: glazeP(SOFT),
  }),
  wall({
    id: 'paint-swirl-render', name: 'Fan-Swirl Render',
    description: 'Overlapping half-circle sweeps in staggered rows, raised in the plaster. The old-fashioned textured ceiling finish, on the wall.',
    family: 'paint', tags: ['plaster', 'swirl', 'fan', 'textured', 'retro', 'hall', 'bedroom', 'kitchen'],
    packs: ['everyday-essentials', 'cozy-cottage'], price: 9,
    painter: 'swirl-render', params: { size: 0.22, relief: 1, skirt: 0.1 }, repeat: 1.6, palettes: ramp(SOFT),
  }),
  wall({
    id: 'paint-sheen-stripe', name: 'Matt and Satin Stripe',
    description: 'Tone-on-tone stripes in a single paint colour: flat matt bands alternate with satin ones that catch the light.',
    family: 'paint', tags: ['paint', 'stripe', 'tone-on-tone', 'satin', 'subtle', 'living', 'bedroom', 'dining'],
    packs: ['classic-townhouse', 'modern-minimal'], price: 13,
    painter: 'sheen-stripe', params: { width: 0.12, contrast: 1.3, skirt: 0.1 }, repeat: 1.2, palettes: sheenP(SOFT),
  }),
  mapWall('plaster-venetian', 'paint', 'plaster-venetian', { tiles: 1 }, {
    name: 'Venetian Plaster', description: 'Burnished plaster laid in thin cloudy coats and polished to a soft marble-like depth.',
    tags: ['plaster', 'venetian', 'polished', 'luxury', 'elegant', 'living', 'dining', 'hall'], packs: ['classic-townhouse', 'art-deco'],
    price: 34, repeat: 2.8, palettes: ramp(SOFT),
  }),
  mapWall('plaster-tadelakt', 'paint', 'plaster-tadelakt', { tiles: 1 }, {
    name: 'Tadelakt Lime', description: 'Moroccan lime plaster rubbed smooth with a stone: watery tonal clouds and the odd hairline crackle.',
    tags: ['plaster', 'tadelakt', 'lime', 'moroccan', 'spa', 'bathroom', 'bedroom', 'living'], packs: ['coastal-home', 'modern-minimal'],
    price: 30, repeat: 2.8, palettes: ramp(SOFT),
  }),
  mapWall('plaster-microcement', 'paint', 'plaster-microcement', { tiles: 1 }, {
    name: 'Microcement Skin', description: 'A thin, seamless cement skin with faint trowel marks and tiny pinholes. Modern, quiet and joint-free.',
    tags: ['microcement', 'cement', 'seamless', 'modern', 'minimal', 'bathroom', 'kitchen', 'living'], packs: ['modern-minimal', 'industrial-loft'],
    price: 26, repeat: 2.8, palettes: ramp(SOFT),
  }),
  mapWall('plaster-clay', 'paint', 'plaster-clay', { tiles: 2 }, {
    name: 'Earthen Clay Plaster', description: 'Hand-smoothed clay plaster with flecks of straw and sand. Soft, matt and warm to look at.',
    tags: ['plaster', 'clay', 'earthen', 'natural', 'organic', 'bedroom', 'living', 'study'], packs: ['cozy-cottage', 'botanical-living'],
    price: 18, repeat: 1.6, palettes: ramp(SOFT),
  }),
  mapWall('plaster-stucco', 'paint', 'plaster-stucco', { tiles: 1 }, {
    name: 'Lime Stucco', description: 'Weathered Mediterranean stucco with swirling trowel marks, little pits and hairline cracks.',
    tags: ['plaster', 'stucco', 'mediterranean', 'rustic', 'weathered', 'hall', 'dining', 'living'], packs: ['coastal-home', 'cozy-cottage'],
    price: 15, repeat: 2.0, palettes: ramp(SOFT),
  }),
  mapWall('plaster-sand', 'paint', 'plaster-sand', { tiles: 2 }, {
    name: 'Sand-Float Render', description: 'Fine, even sandpaper grain from a float-finished render. Understated texture for people who like walls to be walls.',
    tags: ['plaster', 'render', 'sand', 'subtle', 'textured', 'hall', 'bedroom', 'living'], packs: ['everyday-essentials', 'modern-minimal'],
    price: 8, repeat: 1.0, palettes: ramp(SOFT),
  }),
  mapWall('plaster-raked', 'paint', 'plaster-raked', { tiles: 2 }, {
    name: 'Raked Plaster', description: 'Fine horizontal grooves combed through fresh plaster, catching light and shadow like a slow ripple.',
    tags: ['plaster', 'raked', 'grooved', 'horizontal', 'textured', 'living', 'hall', 'study'], packs: ['modern-minimal', 'industrial-loft'],
    price: 19, repeat: 1.4, palettes: ramp(SOFT),
  }),
  mapWall('plaster-travertine', 'paint', 'plaster-travertine', { tiles: 1 }, {
    name: 'Travertine Plaster', description: 'Plaster worked to look like honed travertine: soft horizontal strata with shallow pits and fissures.',
    tags: ['plaster', 'travertine', 'stone-effect', 'warm', 'spa', 'bathroom', 'living', 'hall'], packs: ['modern-minimal', 'coastal-home'],
    price: 24, repeat: 2.4, palettes: ramp(SOFT),
  }),
  wall({
    id: 'plaster-scored-ashlar', name: 'Scored Render Blocks',
    description: 'Smooth sand render scored into large ashlar blocks in running bond. A stately front-of-house look, indoors.',
    family: 'paint', tags: ['plaster', 'render', 'scored', 'blocks', 'classic', 'hall', 'dining', 'feature-wall'],
    packs: ['classic-townhouse', 'coastal-home'], price: 21,
    painter: 'scored-render', params: { map: 'plaster-sand', tiles: 2, block: 0.7, course: 0.35, groove: 0.006, skirt: 0.1 }, repeat: 2.1,
    palettes: ramp(SOFT),
  }),
  mapWall('paint-cork', 'paint', 'wall-cork', { tiles: 2 }, {
    name: 'Cork Wallcovering', description: 'Natural cork granules pressed into a speckled sheet: warm, quiet and a little bit pinboard.',
    tags: ['cork', 'natural', 'textured', 'acoustic', 'study', 'office', 'bedroom', 'kids'], packs: ['creative-studio', 'mid-century'],
    price: 22, repeat: 1.4, palettes: ramp(SOFT),
  }),
  mapWall('paint-linen-weave', 'paint', 'wall-linen', { tiles: 2, roll: 0.9 }, {
    name: 'Woven Linen Covering', description: 'A coarse plain-weave linen wallcovering with honest slubs, hung in drops with a fine seam between.',
    tags: ['linen', 'woven', 'fabric', 'natural', 'textured', 'bedroom', 'living', 'study'], packs: ['cozy-cottage', 'modern-minimal'],
    price: 22, repeat: 1.8, palettes: ramp(SOFT),
  }),
  mapWall('paint-wool-felt', 'paint', 'wall-felt', { tiles: 2, roll: 1.0 }, {
    name: 'Wool Felt Panels', description: 'Dense pressed wool felt in soft hanging sheets. It muffles sound and makes a room feel instantly snug.',
    tags: ['felt', 'wool', 'acoustic', 'soft', 'textured', 'bedroom', 'study', 'lounge'], packs: ['modern-minimal', 'creative-studio'],
    price: 27, repeat: 2.0, palettes: ramp(SOFT),
  }),
];

const LUXURY: SurfaceDesign[] = [
  wall({
    id: 'lux-damask-medallion', name: 'Baroque Medallion Damask',
    description: 'Tall symmetrical medallions of acanthus scrolls around a lotus, half-dropped with tiny flourishes between. Grand, tone on tone or gilded.',
    family: 'luxury', tags: ['damask', 'baroque', 'medallion', 'tone-on-tone', 'luxury', 'dining', 'living', 'hall'],
    packs: ['classic-townhouse', 'art-deco'], price: 26,
    painter: 'motif-wall', params: { motif: 'motif-damask-medallion', motif2: 'motif-flourish', ground: 'paper-linen', layout: 'half-drop', cols: 2, rows: 4, size: 0.95, motif2Size: 0.3, skirt: 0.1 },
    repeat: 1.2, palettes: toneP(TONAL),
  }),
  wall({
    id: 'lux-acanthus-scroll', name: 'Acanthus Scroll Brocade',
    description: 'Curling acanthus leaf scrolls in a brick layout, each mirrored from the last. A classical brocade with a regular, calm rhythm.',
    family: 'luxury', tags: ['brocade', 'acanthus', 'classical', 'scroll', 'luxury', 'dining', 'study', 'bedroom'],
    packs: ['classic-townhouse'], price: 24,
    painter: 'motif-wall', params: { motif: 'motif-acanthus', ground: 'paper-linen', layout: 'brick', cols: 2, rows: 5, size: 0.9, mirror: true, skirt: 0.1 },
    repeat: 1.2, palettes: toneP(TONAL),
  }),
  wall({
    id: 'lux-pomegranate-brocade', name: 'Pomegranate Brocade',
    description: 'The Renaissance pomegranate in a half-drop repeat with small flourishes in the gaps, woven in the manner of a cut-velvet hanging.',
    family: 'luxury', tags: ['brocade', 'pomegranate', 'renaissance', 'velvet-effect', 'luxury', 'dining', 'library', 'hall'],
    packs: ['classic-townhouse'], price: 29,
    painter: 'motif-wall', params: { motif: 'motif-pomegranate', motif2: 'motif-flourish', ground: 'paper-linen', layout: 'half-drop', cols: 2, rows: 4, size: 0.9, motif2Size: 0.28, skirt: 0.1 },
    repeat: 1.2, palettes: toneP(TONAL),
  }),
  wall({
    id: 'lux-flourish-diamonds', name: 'Flourish and Acanthus Diamonds',
    description: 'Filigree flourishes and small acanthus leaves alternate on a diagonal grid, a refined all-over damask with a quiet sparkle.',
    family: 'luxury', tags: ['damask', 'filigree', 'diagonal', 'small-scale', 'luxury', 'bedroom', 'dining', 'hall'],
    packs: ['classic-townhouse', 'art-deco'], price: 22,
    painter: 'motif-wall', params: { motif: 'motif-flourish', motif2: 'motif-acanthus', ground: 'paper-linen', layout: 'diagonal', cols: 4, rows: 8, size: 0.8, motif2Size: 0.75, skirt: 0.1 },
    repeat: 1.2, palettes: toneP(TONAL),
  }),
  wall({
    id: 'lux-crane-silk', name: 'Crane Silk',
    description: 'Cranes among pine boughs scattered across a raw-silk ground, in the quiet manner of a Japanese screen.',
    family: 'luxury', tags: ['silk', 'crane', 'asian', 'scattered', 'luxury', 'bedroom', 'living', 'feature-wall'],
    packs: ['classic-townhouse', 'botanical-living'], price: 36,
    painter: 'motif-wall', params: { motif: 'motif-crane', ground: 'wall-linen', groundContrast: 0.6, layout: 'half-drop', cols: 2, rows: 3, size: 0.95, mirror: true, skirt: 0.1 },
    repeat: 1.6, palettes: toneP(TONAL),
  }),
  mapWall('lux-velvet-crush', 'luxury', 'fabric-velvet', { tiles: 1, shade: 0.3 }, {
    name: 'Crushed Velvet', description: 'Deep-pile velvet pressed in soft irregular waves that catch the light and fall into shadow.',
    tags: ['velvet', 'fabric', 'crushed', 'luxury', 'glamour', 'bedroom', 'lounge', 'feature-wall'], packs: ['art-deco', 'classic-townhouse'],
    price: 42, repeat: 2.4, palettes: ramp(JEWEL),
  }),
  mapWall('lux-silk-moire', 'luxury', 'fabric-moire', { tiles: 1, roll: 0.6 }, {
    name: 'Silk Moire', description: 'Watermarked taffeta whose wavy ripples shift in the light, hung in narrow silk drops.',
    tags: ['silk', 'moire', 'taffeta', 'watermark', 'luxury', 'bedroom', 'dining', 'study'], packs: ['classic-townhouse', 'art-deco'],
    price: 39, repeat: 2.4, palettes: ramp(JEWEL),
  }),
  mapWall('lux-leather-pebbled', 'luxury', 'leather-pebbled', { tiles: 2 }, {
    name: 'Pebbled Leather', description: 'Pebble-grain leather stretched wall to wall, with the small creases of the hide left in.',
    tags: ['leather', 'pebbled', 'luxury', 'study', 'library', 'lounge', 'masculine', 'feature-wall'], packs: ['classic-townhouse', 'industrial-loft'],
    price: 44, repeat: 1.2, palettes: ramp(HIDE),
  }),
  mapWall('lux-gilt-leaf', 'luxury', 'metal-leaf', { tiles: 1 }, {
    name: 'Gilded Metal Leaf', description: 'Hand-laid sheets of metal leaf, crackled and overlapping, with patches of tarnish that give them away as real.',
    tags: ['gilded', 'metal-leaf', 'metallic', 'luxury', 'glamour', 'dining', 'hall', 'feature-wall'], packs: ['art-deco', 'classic-townhouse'],
    price: 58, repeat: 2.4, palettes: ramp(METALS),
  }),
  mapWall('lux-brushed-metal', 'luxury', 'metal-brushed', { tiles: 1 }, {
    name: 'Brushed Metal', description: 'Fine horizontal brushing on sheet metal, cool and precise, with a long streak of sheen.',
    tags: ['metal', 'brushed', 'metallic', 'sleek', 'modern', 'kitchen', 'bathroom', 'living'], packs: ['modern-minimal', 'industrial-loft'],
    price: 33, repeat: 2.4, palettes: ramp(METALS),
  }),
  mapWall('lux-hammered-metal', 'luxury', 'metal-hammered', { tiles: 1 }, {
    name: 'Hammered Metal', description: 'Hand-planished metal covered in shallow dimples, each one throwing back a tiny point of light.',
    tags: ['metal', 'hammered', 'metallic', 'artisan', 'craft', 'dining', 'feature-wall', 'bar'], packs: ['art-deco', 'industrial-loft'],
    price: 40, repeat: 2.0, palettes: ramp(METALS),
  }),
  mapWall('lux-boucle', 'luxury', 'fabric-boucle', { tiles: 2 }, {
    name: 'Boucle Wall', description: 'Nubby looped wool boucle upholstered onto the wall: tactile, cosy and very now.',
    tags: ['boucle', 'wool', 'fabric', 'textured', 'cosy', 'bedroom', 'lounge', 'feature-wall'], packs: ['modern-minimal', 'mid-century'],
    price: 35, repeat: 1.3, palettes: ramp(HIDE),
  }),
  mapWall('lux-dupioni', 'luxury', 'silk-dupioni', { tiles: 1, roll: 0.68 }, {
    name: 'Dupioni Silk', description: 'Raw silk with the irregular slubs of dupioni, shimmering faintly across each hand-hung drop.',
    tags: ['silk', 'dupioni', 'fabric', 'shimmer', 'luxury', 'bedroom', 'dining', 'study'], packs: ['classic-townhouse', 'art-deco'],
    price: 37, repeat: 2.04, palettes: ramp(JEWEL),
  }),
  wall({
    id: 'lux-channel-velvet', name: 'Channel-Quilted Velvet',
    description: 'Deep vertical velvet channels, plump between stitched seams. Like a very large headboard.',
    family: 'luxury', tags: ['velvet', 'channel', 'quilted', 'padded', 'luxury', 'bedroom', 'lounge', 'feature-wall'],
    packs: ['art-deco', 'classic-townhouse'], price: 48,
    painter: 'quilted-set', params: { map: 'fabric-velvet', tiles: 1, style: 'channel', pitch: 0.2, skirt: 0.1 }, repeat: 2.0, palettes: ramp(JEWEL),
  }),
  wall({
    id: 'lux-padded-leather', name: 'Piped Leather Panels',
    description: 'Padded leather rectangles with piped edges and a brass button at the heart of each, as in a gentleman\'s club.',
    family: 'luxury', tags: ['leather', 'padded', 'panels', 'piped', 'luxury', 'study', 'library', 'lounge'],
    packs: ['classic-townhouse', 'industrial-loft'], price: 62,
    painter: 'quilted-set', params: { map: 'leather-pebbled', tiles: 2, style: 'panel', pitch: 0.4, height: 0.5, button: true, skirt: 0.1 }, repeat: 1.2,
    palettes: ramp(HIDE),
  }),
  wall({
    id: 'lux-antique-mirror', name: 'Antiqued Mirror Tiles',
    description: 'Bevelled mirror squares with diagonal streaks of reflection and the dark foxing of old silvering at the edges.',
    family: 'luxury', tags: ['mirror', 'glass', 'antiqued', 'foxed', 'glamour', 'dining', 'bathroom', 'hall'],
    packs: ['art-deco', 'classic-townhouse'], price: 54,
    painter: 'mirror-panels', params: { tile: 0.4, foxing: 0.6, skirt: 0.1 }, repeat: 1.6,
    // roles: glass, reflection, foxing, joint
    palettes: ([
      ['clear-glass', 'Clear Glass', '#c4cbd0', '#4a4f55', '#8a8f94'], ['antique-silver', 'Antique Silver', '#a9aeb0', '#3d4043', '#6f7376'],
      ['smoke-glass', 'Smoked Glass', '#6f7479', '#1f2124', '#3a3d40'], ['bronze-glass', 'Bronze Glass', '#a58b6c', '#3a2c20', '#6b5640'],
      ['gold-glass', 'Gold Glass', '#d0b46c', '#6a4f20', '#9a7c3c'], ['rose-glass', 'Rose Glass', '#d6aea6', '#6b4a46', '#a07872'],
      ['blue-glass', 'Blue Glass', '#9fb5c4', '#2f4252', '#6c8193'], ['black-glass', 'Black Glass', '#3b3e42', '#0f1012', '#232528'],
    ] as Tuple[]).map(([id, name, g, fox, joint]) => pal(id, name, g!, '#ffffff', fox!, joint!)),
  }),
  wall({
    id: 'lux-gilt-lattice', name: 'Gilt Lattice Lacquer',
    description: 'A diamond lattice of fine gilt double lines with a rosette at every crossing, over a deep lacquered ground.',
    family: 'luxury', tags: ['gilt', 'lattice', 'lacquer', 'trellis', 'luxury', 'dining', 'bedroom', 'feature-wall'],
    packs: ['art-deco', 'classic-townhouse'], price: 52,
    painter: 'gilt-lattice', params: { pitch: 0.25, rosette: 0.02, skirt: 0.1 }, repeat: 1.5,
    // roles: ground, gilt, gleam, trim
    palettes: ([
      ['black-gold-lacquer', 'Black and Gold', '#1f1f22', '#c9a24e'], ['oxblood-gold-lacquer', 'Oxblood and Gold', '#5a1f24', '#c9a24e'],
      ['navy-gold-lacquer', 'Navy and Gold', '#25324f', '#c9a24e'], ['emerald-gold-lacquer', 'Emerald and Gold', '#1f4f40', '#c9a24e'],
      ['ivory-gold-lacquer', 'Ivory and Gold', '#efe8d6', '#b8954a'], ['teal-silver-lacquer', 'Teal and Silver', '#2e6e6e', '#c4c8ce'],
      ['plum-rose-lacquer', 'Plum and Rose Gold', '#4a2a48', '#c9958a'], ['charcoal-silver-lacquer', 'Charcoal and Silver', '#3a3b3f', '#b9bcc2'], ['taupe-champagne-lacquer', 'Taupe and Champagne', '#8a8076', '#e0cfa4'],
    ] as Tuple[]).map(([id, name, g, gilt]) => pal(id, name, g!, gilt!, shd(gilt!, 0.45), TRIM)),
  }),
];

const MURALS: SurfaceDesign[] = [
  mural('mural-dunes', 'Desert Dunes', 'Sweeping sand dunes under a low sun, rippled by the wind and painted in long, calm curves.',
    ['desert', 'dunes', 'landscape', 'warm', 'bedroom', 'living'], ['modern-minimal', 'garden-patio'], 26),
  mural('mural-waves', 'Great Waves', 'Curling woodblock-style waves with foam fingers and a small mountain on the horizon.',
    ['ocean', 'waves', 'japanese', 'woodblock', 'coastal', 'living', 'bathroom'], ['coastal-home', 'creative-studio'], 32),
  mural('mural-alps', 'Alpine Peaks', 'A range of snow-capped peaks above a dark pine foreground. Crisp air in a bedroom.',
    ['mountains', 'alps', 'snow', 'landscape', 'cabin', 'bedroom', 'living'], ['cozy-cottage', 'botanical-living'], 30),
  mural('mural-birch', 'Birch Forest', 'Slender pale trunks with dark bark marks receding into soft light between the trees.',
    ['forest', 'birch', 'trees', 'woodland', 'scandi', 'bedroom', 'living', 'study'], ['botanical-living', 'cozy-cottage'], 28),
  mural('mural-bamboo', 'Bamboo Grove', 'Tall bamboo stalks in several layers of mist, painted in the manner of a brush-and-ink scroll.',
    ['bamboo', 'ink', 'asian', 'zen', 'spa', 'bathroom', 'bedroom', 'living'], ['botanical-living', 'modern-minimal'], 29),
  mural('mural-koi', 'Koi Pond', 'Koi circling among lily pads and ripples, seen from above the water.',
    ['koi', 'pond', 'fish', 'water', 'asian', 'bathroom', 'living', 'dining'], ['botanical-living', 'garden-patio'], 27),
  mural('mural-skyline', 'City Skyline', 'Layered towers at dusk with tiny lit windows and a bridge in the distance.',
    ['city', 'skyline', 'urban', 'dusk', 'loft', 'study', 'bedroom', 'living'], ['industrial-loft', 'mid-century'], 31),
  mural('mural-reeds', 'Lake and Reeds', 'Tall reeds and cattails in the foreground, geese crossing a still lake and low hills behind.',
    ['lake', 'reeds', 'geese', 'wetland', 'calm', 'bedroom', 'living', 'study'], ['cozy-cottage', 'garden-patio'], 27),
  mural('mural-jungle', 'Deep Jungle', 'Huge monstera and banana leaves, ferns and hanging vines crowd in layers of green.',
    ['jungle', 'tropical', 'leaves', 'botanical', 'bold', 'living', 'bathroom', 'bedroom'], ['botanical-living', 'creative-studio'], 33),
  mural('mural-savanna', 'Savanna Sunset', 'Flat-topped acacias, a far-off herd of giraffes and a big low sun over the plain.',
    ['savanna', 'safari', 'acacia', 'africa', 'sunset', 'kids', 'bedroom', 'living'], ['kids-storybook', 'garden-patio'], 29),
  mural('mural-clouds', 'Cloud Garden', 'Billowing cumulus clouds in soft layers, as if the ceiling had been lifted off.',
    ['clouds', 'sky', 'dreamy', 'soft', 'nursery', 'bedroom', 'kids'], ['kids-storybook', 'modern-minimal'], 22),
  mural('mural-stars', 'Starry Night', 'A star-filled sky with a swirling milky way above a thin line of dark hills.',
    ['stars', 'night', 'sky', 'milky-way', 'space', 'bedroom', 'nursery', 'kids'], ['kids-storybook', 'creative-studio'], 28),
  mural('mural-worldmap', 'Antique World Map', 'An old engraved map of the world with compass roses, sea monsters and sailing ships.',
    ['map', 'world', 'antique', 'travel', 'nautical', 'study', 'library', 'hall'], ['classic-townhouse', 'creative-studio'], 35),
  mural('mural-meadow', 'Wildflower Meadow', 'Tall grasses, daisies and poppies swaying in an open meadow under a wide sky.',
    ['meadow', 'wildflowers', 'grass', 'summer', 'cottage', 'kitchen', 'bedroom', 'living'], ['cozy-cottage', 'garden-patio'], 27),
  mural('mural-harbor', 'Fishing Harbour', 'Sailboats and masts crowd a quiet quay lined with little houses, gulls wheeling overhead.',
    ['harbour', 'sailboats', 'coastal', 'nautical', 'village', 'hall', 'living', 'bathroom'], ['coastal-home', 'cozy-cottage'], 30),
  wall({
    id: 'mural-feature-moon', name: 'Feature Moon',
    description: 'One enormous sleepy crescent moon with a few small stars, hung on the wall like a painting. Centre it behind the bed.',
    family: 'mural', tags: ['mural', 'feature-wall', 'moon', 'night', 'celestial', 'bedroom', 'nursery', 'living'],
    packs: ['modern-minimal', 'kids-storybook'], price: 24,
    painter: 'motif-wall', params: { motif: 'motif-moon', ground: 'paper-linen', layout: 'grid', cols: 1, rows: 1, size: 0.6, skirt: 0.1 }, repeat: 2.8,
    palettes: duoP(DUO),
  }),
  wall({
    id: 'mural-feature-oak', name: 'Feature Oak',
    description: 'A single great bare oak with spreading branches and roots, painted as tall as the wall will allow.',
    family: 'mural', tags: ['mural', 'feature-wall', 'tree', 'oak', 'woodland', 'bedroom', 'living', 'kids'],
    packs: ['botanical-living', 'cozy-cottage'], price: 27,
    painter: 'motif-wall', params: { motif: 'motif-tree', ground: 'paper-linen', layout: 'grid', cols: 1, rows: 1, size: 1.0, skirt: 0.1 }, repeat: 2.8,
    palettes: duoP(DUO),
  }),
  wall({
    id: 'mural-feature-rainbows', name: 'Boho Rainbows',
    description: 'Concentric rainbow arches stepped across the wall in a half-drop, soft as a hand-painted nursery.',
    family: 'mural', tags: ['mural', 'feature-wall', 'rainbow', 'boho', 'arches', 'nursery', 'kids', 'bedroom'],
    packs: ['kids-storybook', 'modern-minimal'], price: 21,
    painter: 'motif-wall', params: { motif: 'motif-rainbow', ground: 'paper-linen', layout: 'brick', cols: 2, rows: 3, size: 0.8, skirt: 0.1 }, repeat: 2.0,
    palettes: duoP(DUO),
  }),
];

export const WALLS_A: SurfaceDesign[] = [
  ...PAINT,
  ...LUXURY,
  // the pilot mural stays first among the murals
  wall({
    id: 'mural-misty-pines', name: 'Misty Pine Valley',
    description: 'A wide mural of layered pine ridges rising out of valley fog, painted soft and quiet. One panorama fills the whole wall run.',
    family: 'mural', tags: ['mural', 'forest', 'pine', 'mist', 'landscape', 'feature-wall', 'bedroom', 'living'],
    packs: ['cozy-cottage', 'botanical-living'], price: 28,
    painter: 'mural-wall', params: { mural: 'mural-misty-pines', fade: 0.3, fadeHeight: 0.4, skirt: 0.1 }, repeat: 5.6,
    palettes: tritone([
      ['moss-mist', 'Moss Mist', '#7d8f78'], ['fjord-blue', 'Fjord Blue', '#6f8aa0'], ['dawn-grey', 'Dawn Grey', '#9a9c9c'],
      ['dusk-plum', 'Dusk Plum', '#8a6a86'], ['amber-haze', 'Amber Haze', '#c79a52'], ['midnight-pines', 'Midnight Pines', '#2f3d4a'],
      ['pale-sage', 'Pale Sage', '#c3cdbd'], ['teal-fog', 'Teal Fog', '#3f8a8a'],
    ] as Tuple[]),
  }),
  ...MURALS,
];
