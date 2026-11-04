// Milestone 10 surface designs, group 'walls-d'. Written by the content agent of this group only; wired into the
// catalog once in ./index.ts. Helpers: ./kit.ts. Sources: dev/surfaces-ai/sources/walls-d.mjs.
//
// Vintage and Art Deco 21, children's and playful 22, themed / rustic / coastal / eclectic 17. Printed designs use
// motif-wall with an AI-generated motif (public/assets/surfaces/motifs); the geometric ones use the painters in
// render/textures/packs/walls-d.ts (deco-geo, play-geo, quilt-set).

import type { SurfaceDesign } from '../types';
import { make, shd, wall, type Tuple } from './kit';

// roles: ground, motif, accent (a lighter tint of the motif, used by the filler motif), trim
const duo = make((g, m) => [g!, m!, shd(m!, 0.4), shd(g!, 0.72)]);
// roles: ground, primary, secondary, trim
const trio = make((g, p, q) => [g!, p!, q!, shd(g!, 0.72)]);

const DECO: Tuple[] = [
  ['black-gold', 'Black and Gold', '#1d1d20', '#c9a24d', '#e6d29a'], ['ivory-gold', 'Ivory and Gold', '#efe6d2', '#b8923d', '#6a5a3a'],
  ['emerald-brass', 'Emerald and Brass', '#1f4a3d', '#d3b261', '#e8dcae'], ['navy-silver', 'Navy and Silver', '#1f2a44', '#b9bec9', '#7f8aa3'],
  ['blush-bronze', 'Blush and Bronze', '#ecd5cb', '#a8683f', '#7a4a38'], ['teal-champagne', 'Teal and Champagne', '#2f7f80', '#d6b25e', '#f0e2b4'],
  ['burgundy-champagne', 'Burgundy and Champagne', '#5a1f2c', '#e0c9a0', '#b98a55'], ['greige-ink', 'Greige and Ink', '#b9b0a3', '#2b2b2e', '#6a665f'],
  ['plum-rose-gold', 'Plum and Rose Gold', '#4a2a4a', '#d9a38f', '#efd3c4'],
];
const RETRO3: Tuple[] = [
  ['sunset', 'Sunset', '#f0e6c8', '#d9622b', '#e1a93a'], ['avocado', 'Avocado', '#efe6cf', '#7d8a3e', '#d9a641'],
  ['lagoon', 'Lagoon', '#f3efe4', '#2f7f80', '#8cc3c0'], ['berry-night', 'Berry Night', '#3a2a3a', '#c9506a', '#e8a84a'],
  ['cocoa', 'Cocoa', '#4a362a', '#c9792f', '#e8c26a'], ['blush-pop', 'Blush Pop', '#f1dcd5', '#cf7f86', '#7d3a5a'],
  ['denim-gold', 'Denim and Gold', '#2f4468', '#e1a93a', '#e87f5a'], ['greige-moss', 'Greige and Moss', '#b9b0a3', '#5f6f4a', '#c4714d'],
  ['tangerine-navy', 'Tangerine and Navy', '#e8894a', '#2f4a6a', '#f3e6cc'],
];
const RETRO: Tuple[] = [
  ['mustard-teal', 'Mustard and Teal', '#d9a641', '#2f6f78'], ['avocado-cream', 'Avocado and Cream', '#7d8a3e', '#f0e6c8'],
  ['cream-orange', 'Cream and Orange', '#f0e6c8', '#d9622b'], ['turquoise-white', 'Turquoise and White', '#4fb0b0', '#f6f1e6'],
  ['brown-cream', 'Brown and Cream', '#5a3f2c', '#e8d4a8'], ['pink-teal', 'Pink and Teal', '#eab6b6', '#2f7f80'],
  ['charcoal-mustard', 'Charcoal and Mustard', '#33363b', '#e1a93a'], ['sky-rust', 'Sky and Rust', '#b7d3e0', '#b5532f'],
  ['grey-lemon', 'Grey and Lemon', '#9b9fa5', '#f2d36b'],
];
const KIDS: Tuple[] = [
  ['white-sky', 'Soft White and Sky', '#f6f1e6', '#7fb3d5'], ['butter-coral', 'Butter and Coral', '#f7e6a8', '#e87f6a'],
  ['mint-navy', 'Mint and Navy', '#cfe8dc', '#2f4a6a'], ['blush-grey', 'Blush and Grey', '#f3d9d6', '#7d7f86'],
  ['lilac-plum', 'Lilac and Plum', '#d9cfe6', '#6a4a8a'], ['sky-white', 'Sky and White', '#bcd9ea', '#f6f1e6'],
  ['sage-cream', 'Sage and Cream', '#a9c0a0', '#f4ecd8'], ['navy-sun', 'Navy and Sunshine', '#24385c', '#f2c14e'],
  ['peach-teal', 'Peach and Teal', '#f5cdb0', '#2f7f80'], ['grey-coral', 'Grey and Coral', '#8f949c', '#f08a74'],
];
const COAST: Tuple[] = [
  ['sand-navy', 'Sand and Navy', '#eadfc8', '#27406b'], ['white-sky', 'White and Sea Blue', '#f3f1ea', '#5d8fb5'],
  ['seafoam-navy', 'Seafoam and Navy', '#c9e3dc', '#2b4a6a'], ['driftwood-white', 'Driftwood and White', '#a69c8e', '#f3f1ea'],
  ['cream-coral', 'Cream and Coral', '#f1e8d8', '#e07a5f'], ['navy-sand', 'Navy and Sand', '#1f3355', '#e6d8b5'],
  ['sage-white', 'Sage and White', '#a9bfae', '#f3f1ea'], ['slate-sand', 'Slate and Sand', '#6f7f8c', '#eadfc8'],
  ['lagoon-white', 'Lagoon and White', '#3fa9b0', '#f4f1ea'],
];
const RUSTIC: Tuple[] = [
  ['oat-forest', 'Oat and Forest', '#e4d8c0', '#3f5a45'], ['cream-barn', 'Cream and Barn Red', '#efe6d2', '#9a3d32'],
  ['flour-navy', 'Flour and Navy', '#f0ebe0', '#2f3d5a'], ['sage-charcoal', 'Sage and Charcoal', '#b3c0a3', '#33363b'],
  ['tan-brown', 'Tan and Walnut', '#c9b48a', '#5a3f2c'], ['charcoal-cream', 'Charcoal and Cream', '#33363b', '#e6dcc4'],
  ['forest-tan', 'Forest and Tan', '#2f4a3c', '#d8c49a'], ['barn-cream', 'Barn Red and Cream', '#8a2f2c', '#efe3cc'],
  ['mustard-forest', 'Mustard and Forest', '#d9a641', '#2f4a3c'],
];
const BOLD: Tuple[] = [
  ['cream-plum', 'Cream and Plum', '#efe3d0', '#5a2f4f'], ['mustard-ink', 'Mustard and Ink', '#d6a23a', '#2b2f44'],
  ['teal-gold', 'Teal and Gold', '#1f6f78', '#e2b75a'], ['rust-cream', 'Rust and Cream', '#b5532f', '#f3e6cc'],
  ['ink-blush', 'Ink and Blush', '#26283a', '#e8b4b8'], ['olive-cream', 'Olive and Cream', '#7a7b3f', '#f1e8d0'],
  ['blush-terracotta', 'Blush and Terracotta', '#efd1c5', '#b5532f'], ['forest-saffron', 'Forest and Saffron', '#2f4a3c', '#e8a84a'],
  ['stone-black', 'Stone and Black', '#bdb7aa', '#2b2b2e'],
];

type Params = Record<string, number | string | boolean>;
interface Spec {
  id: string; name: string; description: string; family: string; tags: string[]; packs: string[]; price: number;
  painter?: string; params: Params; repeat: number; palettes: ReturnType<typeof duo>;
}
const mk = (s: Spec): SurfaceDesign => wall({ ...s, painter: s.painter ?? 'motif-wall' });
/** A printed wall on a paper-linen ground. */
const print = (motif: string, layout: string, cols: number, rows: number, size: number, extra: Params = {}): Params => ({
  motif, ground: 'paper-linen', groundScale: 0.6, groundContrast: 0.5, layout, cols, rows, size, skirt: 0.1, ...extra,
});

const VD = 'vintage-deco', PL = 'playful', TH = 'themed';

export const WALLS_D: SurfaceDesign[] = [
  // ------------------------------------------------------------------------------------------- vintage and Art Deco
  mk({
    id: 'vintage-sunray-columns', name: 'Sunray Columns',
    description: 'Tall columns of golden rays rising from a half sun at the skirting, divided by fine rules. A cinema-foyer wall.',
    family: VD, tags: ['art-deco', 'sunray', 'sunburst', 'glamour', 'geometric', 'dining', 'hall', 'feature-wall'], packs: ['art-deco', 'classic-townhouse'], price: 22,
    painter: 'deco-geo', params: { style: 'sunray', size: 0.6, detail: 12, skirt: 0.1 }, repeat: 1.2, palettes: trio(DECO),
  }),
  mk({
    id: 'vintage-skyline-towers', name: 'Skyline Towers',
    description: 'Stepped setback skyscrapers with pin-striped sides, stacked in a brick layout like a 1930s city poster.',
    family: VD, tags: ['art-deco', 'skyscraper', 'skyline', 'geometric', 'gatsby', 'living', 'study', 'feature-wall'], packs: ['art-deco'], price: 20,
    painter: 'deco-geo', params: { style: 'skyline', size: 0.4, skirt: 0.1 }, repeat: 1.2, palettes: trio(DECO),
  }),
  mk({
    id: 'vintage-ziggurat', name: 'Ziggurat Steps',
    description: 'Concentric stepped diamonds in alternating metallic tones with small stepped jewels between them: Mayan revival, Deco style.',
    family: VD, tags: ['art-deco', 'ziggurat', 'stepped', 'diamond', 'geometric', 'hall', 'dining', 'bathroom'], packs: ['art-deco'], price: 19,
    painter: 'deco-geo', params: { style: 'ziggurat', size: 0.4, skirt: 0.1 }, repeat: 1.2, palettes: trio(DECO),
  }),
  mk({
    id: 'vintage-gatsby-arches', name: 'Gatsby Arches',
    description: 'Nested round-topped arches in five bands, each row overlapping the last. Like the arcade of a grand hotel.',
    family: VD, tags: ['art-deco', 'arches', 'arcade', 'gatsby', 'glamour', 'living', 'dining', 'bedroom'], packs: ['art-deco', 'classic-townhouse'], price: 18,
    painter: 'deco-geo', params: { style: 'arches', size: 0.4, skirt: 0.1 }, repeat: 1.2, palettes: trio(DECO),
  }),
  mk({
    id: 'vintage-pearl-lattice', name: 'Pearl Lattice',
    description: 'Double-lined diagonal lattice with a pearl at every crossing and a little diamond in each cell. Light, formal and very 1920s.',
    family: VD, tags: ['art-deco', 'lattice', 'trellis', 'pearl', 'formal', 'dining', 'bedroom', 'hall'], packs: ['art-deco', 'classic-townhouse'], price: 15,
    painter: 'deco-geo', params: { style: 'lattice', size: 0.3, skirt: 0.1 }, repeat: 0.6, palettes: trio(DECO),
  }),
  mk({
    id: 'vintage-retro-arcs', name: 'Retro Rainbow Arcs',
    description: 'Overlapping stacks of five-band half circles in sunny seventies tones. Warm, soft and a little groovy.',
    family: VD, tags: ['retro', 'seventies', 'arcs', 'rainbow', 'scallop', 'living', 'kitchen', 'bedroom'], packs: ['mid-century'], price: 13,
    painter: 'deco-geo', params: { style: 'arcs', size: 0.4, skirt: 0.1 }, repeat: 1.2, palettes: trio(RETRO3),
  }),
  mk({
    id: 'vintage-deco-pilasters', name: 'Deco Pilasters',
    description: 'Tall panels with notched corners, a double inset line, a central jewel and fine fluting. Hand-painted wall panelling without the joinery.',
    family: VD, tags: ['art-deco', 'panels', 'pilaster', 'fluted', 'formal', 'dining', 'hall', 'living'], packs: ['art-deco', 'classic-townhouse'], price: 26,
    painter: 'deco-geo', params: { style: 'pilaster', size: 0.6, skirt: 0.12 }, repeat: 1.2, palettes: trio(DECO),
  }),
  mk({
    id: 'vintage-deco-lotus', name: 'Deco Lotus',
    description: 'Stylised Egyptian-revival lotus blossoms in a half-drop on fine linen paper, the flower of the 1920s tomb craze.',
    family: VD, tags: ['art-deco', 'lotus', 'egyptian', 'floral', 'wallpaper', 'bedroom', 'bathroom', 'dining'], packs: ['art-deco'], price: 17,
    params: print('motif-deco-lotus', 'half-drop', 4, 9, 0.8), repeat: 1.2, palettes: duo(DECO),
  }),
  mk({
    id: 'vintage-peacock-feathers', name: 'Peacock Feathers',
    description: 'Slender peacock feathers with their large eyes, hung in a half-drop. Gatsby glamour for a bedroom or a dining room.',
    family: VD, tags: ['art-deco', 'peacock', 'feather', 'glamour', 'bird', 'bedroom', 'dining', 'feature-wall'], packs: ['art-deco', 'classic-townhouse'], price: 21,
    params: print('motif-deco-peacock', 'half-drop', 4, 7, 1.1, { rotJitter: 4 }), repeat: 1.2, palettes: duo(DECO),
  }),
  mk({
    id: 'vintage-deco-cranes', name: 'Deco Cranes',
    description: 'Streamlined cranes standing on one leg, mirrored row by row. A 1920s lacquer-screen print.',
    family: VD, tags: ['art-deco', 'crane', 'heron', 'bird', 'streamlined', 'living', 'bedroom', 'hall'], packs: ['art-deco'], price: 20,
    params: print('motif-deco-crane', 'brick', 3, 7, 0.9, { mirror: true }), repeat: 1.2, palettes: duo(DECO),
  }),
  mk({
    id: 'vintage-deco-shells', name: 'Deco Shells',
    description: 'Ribbed scallop shells in a brick layout, an Art Deco favourite for cocktail bars and bathrooms.',
    family: VD, tags: ['art-deco', 'shell', 'scallop', 'glamour', 'bathroom', 'dining', 'bedroom'], packs: ['art-deco', 'coastal-home'], price: 16,
    params: print('motif-deco-shell', 'brick', 4, 9, 0.8), repeat: 1.2, palettes: duo(DECO),
  }),
  mk({
    id: 'vintage-atomic-starburst', name: 'Atomic Starburst',
    description: 'Scattered starbursts with ball-tipped rays at all angles: the atomic age on your wall, straight out of 1955.',
    family: VD, tags: ['retro', 'mid-century', 'atomic', 'starburst', 'fifties', 'living', 'kitchen', 'study'], packs: ['mid-century'], price: 12,
    params: print('motif-atomic', 'scatter', 3, 6, 0.85, { rotJitter: 40, scaleJitter: 0.3 }), repeat: 1.2, palettes: duo(RETRO),
  }),
  mk({
    id: 'vintage-toile', name: 'Pastoral Toile',
    description: 'Engraved country scenes of a cottage, a great tree and a lamb in oval vignettes, hung in a half-drop. Toile de Jouy, the classic.',
    family: VD, tags: ['toile', 'pastoral', 'traditional', 'cottage', 'scene', 'bedroom', 'dining', 'hall'], packs: ['cozy-cottage', 'classic-townhouse'], price: 24,
    params: print('motif-toile', 'half-drop', 2, 4, 0.92, { groundContrast: 0.6 }), repeat: 1.2, palettes: duo(DUO_TOILE()),
  }),
  mk({
    id: 'vintage-acanthus', name: 'Acanthus Scroll',
    description: 'Symmetrical acanthus-leaf medallions in alternating rows: Victorian ornament made for a formal parlour.',
    family: VD, tags: ['victorian', 'acanthus', 'medallion', 'ornate', 'classic', 'dining', 'living', 'hall'], packs: ['classic-townhouse'], price: 18,
    params: print('motif-acanthus', 'brick', 3, 6, 0.85, { mirror: true }), repeat: 1.2, palettes: duo(DUO_TOILE()),
  }),
  mk({
    id: 'vintage-tea-time', name: 'Tea Time',
    description: 'Fifties teapots and steaming teacups in a checker rhythm: cheerful kitchenware for a breakfast corner.',
    family: VD, tags: ['retro', 'teapot', 'teacup', 'kitchenware', 'fifties', 'kitchen', 'dining', 'cottage'], packs: ['cozy-cottage', 'mid-century'], price: 10,
    params: print('motif-teapot', 'grid', 3, 7, 0.8, { motif2: 'motif-teacup', motif2Size: 0.55 }), repeat: 1.2, palettes: duo(RETRO),
  }),
  mk({
    id: 'vintage-chinoiserie', name: 'Chinoiserie Branch',
    description: 'A long-tailed bird on a blossoming bough, drawn with the delicacy of an eighteenth-century export paper.',
    family: VD, tags: ['chinoiserie', 'bird', 'branch', 'blossom', 'traditional', 'bedroom', 'dining', 'feature-wall'], packs: ['classic-townhouse'], price: 27,
    params: print('motif-chinoiserie', 'half-drop', 2, 4, 1.05, { groundContrast: 0.6 }), repeat: 1.2, palettes: duo(DUO_TOILE()),
  }),
  mk({
    id: 'vintage-nouveau-lily', name: 'Nouveau Lily',
    description: 'Lilies on long whiplash stems that curve sideways, the flowing line of 1900 Art Nouveau.',
    family: VD, tags: ['art-nouveau', 'lily', 'floral', 'whiplash', 'organic', 'bedroom', 'living', 'study'], packs: ['classic-townhouse', 'botanical-living'], price: 19,
    params: print('motif-nouveau', 'half-drop', 4, 7, 1.1, { mirror: true, rotJitter: 5 }), repeat: 1.2, palettes: duo(DUO_TOILE()),
  }),
  mk({
    id: 'vintage-gatsby-plumes', name: 'Gatsby Plumes',
    description: 'Curling ostrich plumes mirrored in a brick layout, soft and theatrical, like a flapper\'s headdress.',
    family: VD, tags: ['art-deco', 'feather', 'plume', 'flapper', 'glamour', 'bedroom', 'dressing', 'living'], packs: ['art-deco'], price: 23,
    params: print('motif-plume', 'brick', 4, 8, 1.0, { mirror: true }), repeat: 1.2, palettes: duo(DECO),
  }),
  mk({
    id: 'vintage-boomerang', name: 'Boomerang Modern',
    description: 'Fifties boomerang shapes tumbling across the wall with tiny atomic stars between them, from a 1950s diner or a coffee-table top.',
    family: VD, tags: ['retro', 'mid-century', 'boomerang', 'atomic', 'fifties', 'kitchen', 'living', 'kids'], packs: ['mid-century'], price: 11,
    params: print('motif-boomerang', 'scatter', 3, 6, 0.8, { rotJitter: 180, motif2: 'motif-atomic', motif2Size: 0.5 }), repeat: 1.2, palettes: duo(RETRO),
  }),
  mk({
    id: 'vintage-memphis', name: 'Memphis Squiggle',
    description: 'Thick squiggles and confetti triangles scattered at odd angles: loud, playful 1980s Memphis design.',
    family: VD, tags: ['retro', 'memphis', 'eighties', 'squiggle', 'pop', 'bold', 'study', 'kids', 'creative'], packs: ['creative-studio', 'mid-century'], price: 12,
    params: print('motif-memphis-squiggle', 'scatter', 3, 6, 0.7, { rotJitter: 40, motif2: 'motif-memphis-triangle', motif2Size: 0.7 }), repeat: 1.2, palettes: duo(RETRO),
  }),
  mk({
    id: 'vintage-deco-fountain', name: 'Deco Fountain',
    description: 'A stepped fountain with four arcs of water, repeated in a brick layout. Symmetrical and a little grand.',
    family: VD, tags: ['art-deco', 'fountain', 'stepped', 'geometric', 'formal', 'hall', 'dining', 'bathroom'], packs: ['art-deco'], price: 17,
    params: print('motif-deco-fountain', 'brick', 2, 5, 0.9), repeat: 1.2, palettes: duo(DECO),
  }),

  // ------------------------------------------------------------------------------------------- children's and playful
  mk({
    id: 'playful-dino-parade', name: 'Dino Parade',
    description: 'Friendly stegosaurus and tyrannosaurus take turns marching along the wall. For small palaeontologists.',
    family: PL, tags: ['kids', 'dinosaur', 'animals', 'playful', 'nursery', 'bedroom', 'playroom'], packs: ['kids-storybook'], price: 8,
    params: print('motif-dino-stego', 'diagonal', 4, 8, 0.95, { motif2: 'motif-dino-trex', motif2Size: 0.95 }), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-safari-friends', name: 'Safari Friends',
    description: 'A baby elephant and a spotted giraffe, side by side in a staggered row. Soft, sweet and not too loud.',
    family: PL, tags: ['kids', 'safari', 'elephant', 'giraffe', 'animals', 'nursery', 'bedroom'], packs: ['kids-storybook'], price: 9,
    params: print('motif-elephant', 'diagonal', 4, 8, 0.95, { motif2: 'motif-giraffe', motif2Size: 0.95 }), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-teddies', name: 'Teddy Bears',
    description: 'Little bow-tied teddies sitting in a half-drop, slightly tilted as if they had been dropped on the wall by a toddler.',
    family: PL, tags: ['kids', 'teddy', 'bear', 'toys', 'nursery', 'bedroom', 'cute'], packs: ['kids-storybook'], price: 8,
    params: print('motif-teddy', 'half-drop', 4, 7, 0.8, { rotJitter: 8 }), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-bunny-meadow', name: 'Bunny Meadow',
    description: 'Long-eared bunnies sitting and facing both ways, scattered loosely across the wall.',
    family: PL, tags: ['kids', 'bunny', 'rabbit', 'animals', 'nursery', 'bedroom', 'easter'], packs: ['kids-storybook', 'cozy-cottage'], price: 8,
    params: print('motif-bunny', 'scatter', 4, 8, 0.8, { mirror: true, scaleJitter: 0.15 }), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-rubber-ducks', name: 'Rubber Ducks',
    description: 'Bath-time ducks bobbing in a half-drop, each tipped at its own angle. Wipe-clean cheerful for a bathroom.',
    family: PL, tags: ['kids', 'duck', 'bath', 'toys', 'playful', 'bathroom', 'nursery'], packs: ['kids-storybook', 'coastal-home'], price: 7,
    params: print('motif-duck', 'half-drop', 4, 7, 0.8, { rotJitter: 12 }), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-whale-pod', name: 'Whale Pod',
    description: 'Cartoon whales spouting in a mirrored brick layout, swimming left and right row by row.',
    family: PL, tags: ['kids', 'whale', 'ocean', 'animals', 'nursery', 'bathroom', 'bedroom'], packs: ['kids-storybook', 'coastal-home'], price: 8,
    params: print('motif-whale', 'brick', 3, 8, 0.85, { mirror: true }), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-space-explorers', name: 'Space Explorers',
    description: 'Rockets zooming between ringed planets at all angles. A bedroom wall for astronauts in training.',
    family: PL, tags: ['kids', 'space', 'rocket', 'planet', 'adventure', 'bedroom', 'playroom'], packs: ['kids-storybook'], price: 9,
    params: print('motif-rocket', 'scatter', 4, 7, 0.8, { rotJitter: 20, motif2: 'motif-planet', motif2Size: 0.75 }), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-choo-choo', name: 'Choo-Choo Trains',
    description: 'Little steam engines puffing along in rows, one behind the other. Wallpaper for a train-track playroom.',
    family: PL, tags: ['kids', 'train', 'steam', 'transport', 'toys', 'playroom', 'bedroom'], packs: ['kids-storybook'], price: 8,
    params: print('motif-train', 'brick', 3, 7, 0.85), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-toy-cars', name: 'Toy Cars',
    description: 'Round little cars driving left and right in alternate rows. Beep beep.',
    family: PL, tags: ['kids', 'car', 'transport', 'toys', 'playful', 'playroom', 'bedroom'], packs: ['kids-storybook'], price: 7,
    params: print('motif-car', 'brick', 3, 7, 0.8, { mirror: true }), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-balloon-ride', name: 'Balloon Ride',
    description: 'Striped hot air balloons drifting up the wall in swaying columns.',
    family: PL, tags: ['kids', 'hot-air-balloon', 'sky', 'adventure', 'travel', 'nursery', 'bedroom'], packs: ['kids-storybook'], price: 9,
    params: print('motif-hotair', 'trail', 3, 5, 0.85), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-night-owls', name: 'Night Owls',
    description: 'Wide-eyed owls on their branches in a half-drop, a sleepy classic for nurseries.',
    family: PL, tags: ['kids', 'owl', 'bird', 'woodland', 'nursery', 'bedroom', 'cute'], packs: ['kids-storybook', 'cozy-cottage'], price: 8,
    params: print('motif-owl', 'half-drop', 4, 7, 0.8), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-woodland-friends', name: 'Woodland Friends',
    description: 'A fox and spotted toadstools in an alternating pattern, a storybook forest floor.',
    family: PL, tags: ['kids', 'fox', 'mushroom', 'woodland', 'storybook', 'nursery', 'bedroom'], packs: ['kids-storybook', 'cozy-cottage'], price: 9,
    params: print('motif-fox', 'grid', 3, 6, 0.8, { motif2: 'motif-mushroom', motif2Size: 0.45 }), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-toy-blocks', name: 'Toy Blocks',
    description: 'Wooden building blocks tumbled across the wall, each with a star and a circle on its faces.',
    family: PL, tags: ['kids', 'blocks', 'toys', 'building', 'playful', 'playroom', 'nursery'], packs: ['kids-storybook'], price: 7,
    params: print('motif-block', 'scatter', 4, 8, 0.65, { rotJitter: 30, scaleJitter: 0.15 }), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-paper-boats', name: 'Paper Boats',
    description: 'Folded paper boats riding little waves in neat rows. Quiet and simple for a first bedroom.',
    family: PL, tags: ['kids', 'boats', 'origami', 'sea', 'nursery', 'bedroom', 'calm'], packs: ['kids-storybook', 'coastal-home'], price: 8,
    params: print('motif-paperboat', 'brick', 4, 9, 0.8), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-unicorn-dreams', name: 'Unicorn Dreams',
    description: 'Prancing unicorns and little rainbows in a staggered print, pure make-believe.',
    family: PL, tags: ['kids', 'unicorn', 'rainbow', 'fantasy', 'magical', 'bedroom', 'nursery'], packs: ['kids-storybook'], price: 10,
    params: print('motif-unicorn', 'diagonal', 4, 8, 0.95, { motif2: 'motif-rainbow', motif2Size: 0.8 }), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-bunting', name: 'Party Bunting',
    description: 'Swags of triangle flags strung across the wall in rows, in four candy colours.',
    family: PL, tags: ['kids', 'bunting', 'party', 'flags', 'celebration', 'bedroom', 'playroom', 'nursery'], packs: ['kids-storybook'], price: 8,
    painter: 'play-geo', params: { style: 'bunting', size: 0.6, rows: 5, skirt: 0.1 }, repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-confetti', name: 'Confetti Sprinkles',
    description: 'Dots, capsules, rings and tiny triangles scattered like party confetti on a quiet ground.',
    family: PL, tags: ['kids', 'confetti', 'sprinkles', 'party', 'dots', 'bedroom', 'playroom', 'kitchen'], packs: ['kids-storybook', 'creative-studio'], price: 6,
    painter: 'play-geo', params: { style: 'confetti', size: 0.3, density: 1.6, skirt: 0.1 }, repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-party-balloons', name: 'Party Balloons',
    description: 'Bunches of three balloons on curling strings, floating loose across the wall.',
    family: PL, tags: ['kids', 'balloons', 'party', 'celebration', 'playful', 'bedroom', 'playroom'], packs: ['kids-storybook'], price: 8,
    params: print('motif-balloons', 'scatter', 4, 6, 0.9, { rotJitter: 15 }), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-puppy-paws', name: 'Puppy Paws',
    description: 'Muddy paw prints pattering across the wall in every direction.',
    family: PL, tags: ['kids', 'paw', 'dog', 'pet', 'playful', 'hall', 'bedroom', 'laundry'], packs: ['kids-storybook', 'cozy-cottage'], price: 7,
    params: print('motif-paw', 'scatter', 5, 10, 0.6, { rotJitter: 35, scaleJitter: 0.15 }), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-friendly-monsters', name: 'Friendly Monsters',
    description: 'Shaggy, horned, toothy and completely harmless monsters in a loose half-drop, no two quite alike. Not a bit scary.',
    family: PL, tags: ['kids', 'monsters', 'funny', 'creatures', 'playful', 'playroom', 'bedroom'], packs: ['kids-storybook', 'creative-studio'], price: 9,
    params: print('motif-monster', 'half-drop', 4, 7, 0.85, { rotJitter: 6, scaleJitter: 0.1 }), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-fairy-castles', name: 'Fairy Castles',
    description: 'Little castles with pointed towers and flags, set in a brick pattern like a storybook skyline.',
    family: PL, tags: ['kids', 'castle', 'fairy-tale', 'fantasy', 'storybook', 'bedroom', 'nursery'], packs: ['kids-storybook'], price: 9,
    params: print('motif-castle', 'brick', 3, 6, 0.85), repeat: 1.2, palettes: duo(KIDS),
  }),
  mk({
    id: 'playful-moo-meadow', name: 'Moo Meadow',
    description: 'Patchwork cows facing left and right in a half-drop. A cheerful farm wall for a kitchen or a nursery.',
    family: PL, tags: ['kids', 'cow', 'farm', 'animals', 'country', 'nursery', 'kitchen', 'bedroom'], packs: ['kids-storybook', 'cozy-cottage'], price: 8,
    params: print('motif-cow', 'half-drop', 4, 7, 0.85, { mirror: true }), repeat: 1.2, palettes: duo(KIDS),
  }),

  // ------------------------------------------------------------------------------------------- themed, rustic, coastal, eclectic
  mk({
    id: 'themed-anchors', name: 'Anchors Aweigh',
    description: 'Rope-wound anchors in a half-drop on pale linen paper, the classic nautical print.',
    family: TH, tags: ['nautical', 'anchor', 'coastal', 'sailor', 'bathroom', 'bedroom', 'hall'], packs: ['coastal-home'], price: 11,
    params: print('motif-anchor', 'half-drop', 4, 7, 0.8), repeat: 1.2, palettes: duo(COAST),
  }),
  mk({
    id: 'themed-seashells', name: 'Seashell Collection',
    description: 'Conch shells and starfish in a staggered brick layout, as if laid out on a beachcomber\'s table.',
    family: TH, tags: ['coastal', 'shell', 'starfish', 'beach', 'seaside', 'bathroom', 'bedroom', 'living'], packs: ['coastal-home'], price: 12,
    params: print('motif-conch', 'grid', 3, 7, 0.8, { rotJitter: 20, motif2: 'motif-starfish', motif2Size: 0.5 }), repeat: 1.2, palettes: duo(COAST),
  }),
  mk({
    id: 'themed-regatta', name: 'Regatta',
    description: 'Sailboats on little waves, mirrored row by row as if racing in both directions.',
    family: TH, tags: ['nautical', 'sailboat', 'regatta', 'coastal', 'summer', 'bathroom', 'bedroom', 'study'], packs: ['coastal-home'], price: 12,
    params: print('motif-sailboat', 'brick', 3, 7, 0.85, { mirror: true }), repeat: 1.2, palettes: duo(COAST),
  }),
  mk({
    id: 'themed-lighthouse', name: 'Lighthouse Coast',
    description: 'Banded lighthouses with beaming lanterns, in a brick layout. A lakehouse or seaside cottage staple.',
    family: TH, tags: ['nautical', 'lighthouse', 'coastal', 'cottage', 'seaside', 'hall', 'bedroom', 'living'], packs: ['coastal-home', 'cozy-cottage'], price: 13,
    params: print('motif-lighthouse', 'brick', 3, 5, 0.9), repeat: 1.2, palettes: duo(COAST),
  }),
  mk({
    id: 'themed-fish-school', name: 'School of Fish',
    description: 'Fish swimming in alternating directions through a half-drop, a lively wall for a bathroom.',
    family: TH, tags: ['coastal', 'fish', 'sea', 'ocean', 'swimming', 'bathroom', 'kitchen', 'bedroom'], packs: ['coastal-home'], price: 10,
    params: print('motif-fish', 'half-drop', 4, 9, 0.8, { mirror: true, rotJitter: 8 }), repeat: 1.2, palettes: duo(COAST),
  }),
  mk({
    id: 'themed-coral-reef', name: 'Coral Reef',
    description: 'Branching coral with little fish darting between, scattered like a reef seen from a glass-bottom boat.',
    family: TH, tags: ['coastal', 'coral', 'reef', 'ocean', 'tropical', 'bathroom', 'bedroom', 'living'], packs: ['coastal-home'], price: 14,
    params: print('motif-coral', 'scatter', 4, 8, 0.7, { rotJitter: 20, scaleJitter: 0.2, motif2: 'motif-fish', motif2Size: 0.4 }), repeat: 1.2, palettes: duo(COAST),
  }),
  mk({
    id: 'themed-lodge-pines', name: 'Lodge Pines',
    description: 'Tall pines drifting up the wall in swaying rows: a mountain lodge in wallpaper form.',
    family: TH, tags: ['rustic', 'pine', 'lodge', 'cabin', 'forest', 'living', 'bedroom', 'hall'], packs: ['cozy-cottage'], price: 13,
    params: print('motif-pine', 'trail', 4, 5, 1.1), repeat: 1.2, palettes: duo(RUSTIC),
  }),
  mk({
    id: 'themed-antler-lodge', name: 'Antler Lodge',
    description: 'Mounted antlers on a skull plate, mirrored in a brick layout. Hunting-lodge character for a den or study.',
    family: TH, tags: ['rustic', 'antlers', 'lodge', 'cabin', 'hunting', 'study', 'living', 'bedroom'], packs: ['cozy-cottage'], price: 15,
    params: print('motif-antlers', 'brick', 3, 7, 0.85), repeat: 1.2, palettes: duo(RUSTIC),
  }),
  mk({
    id: 'themed-farmhouse-wheat', name: 'Farmhouse Wheat',
    description: 'Tied sheaves of wheat standing in trailing rows, for a farmhouse kitchen or dining room.',
    family: TH, tags: ['rustic', 'wheat', 'farmhouse', 'harvest', 'country', 'kitchen', 'dining', 'hall'], packs: ['cozy-cottage'], price: 12,
    params: print('motif-wheat', 'trail', 4, 4, 1.2, { rotJitter: 8 }), repeat: 1.2, palettes: duo(RUSTIC),
  }),
  mk({
    id: 'themed-country-rooster', name: 'Country Rooster',
    description: 'Proud folk-art roosters facing both ways in alternating rows. The country kitchen\'s oldest friend.',
    family: TH, tags: ['rustic', 'rooster', 'farmhouse', 'country', 'folk', 'kitchen', 'dining', 'cottage'], packs: ['cozy-cottage'], price: 11,
    params: print('motif-rooster', 'brick', 3, 6, 0.85, { mirror: true }), repeat: 1.2, palettes: duo(RUSTIC),
  }),
  mk({
    id: 'themed-barn-quilt', name: 'Barn Quilt',
    description: 'Painted Ohio-star quilt blocks on a grid, every other block in swapped colours and framed by thin sashing.',
    family: TH, tags: ['rustic', 'quilt', 'barn', 'americana', 'farmhouse', 'kitchen', 'living', 'bedroom'], packs: ['cozy-cottage'], price: 15,
    painter: 'quilt-set', params: { size: 0.4, sashing: 0.006, skirt: 0.1 }, repeat: 1.2, palettes: trio(QUILT()),
  }),
  mk({
    id: 'themed-leopard', name: 'Leopard Rosettes',
    description: 'Broken-ring rosettes in all sizes and angles, packed like the coat of a big cat. Eclectic, glamorous and bold.',
    family: TH, tags: ['eclectic', 'animal-print', 'leopard', 'bold', 'glamour', 'dressing', 'bedroom', 'study'], packs: ['creative-studio'], price: 18,
    params: print('motif-leopard', 'half-drop', 6, 10, 0.8, { rotJitter: 180, scaleJitter: 0.3 }), repeat: 1.2, palettes: duo(BOLD),
  }),
  mk({
    id: 'themed-vase-still-life', name: 'Vase Still Life',
    description: 'Twin-handled vases with flowers in a brick layout: a gallery-wall mood hung as one print.',
    family: TH, tags: ['eclectic', 'vase', 'still-life', 'art', 'floral', 'living', 'dining', 'study'], packs: ['creative-studio', 'mid-century'], price: 16,
    params: print('motif-vase', 'brick', 3, 6, 0.85), repeat: 1.2, palettes: duo(BOLD),
  }),
  mk({
    id: 'themed-celestial', name: 'Celestial Boho',
    description: 'Serene faces on suns and crescent moons in an alternating pattern, the bohemian sky.',
    family: TH, tags: ['eclectic', 'celestial', 'sun', 'moon', 'boho', 'bedroom', 'living', 'creative'], packs: ['creative-studio'], price: 14,
    params: print('motif-sun', 'diagonal', 4, 8, 0.95, { motif2: 'motif-moon', motif2Size: 0.95 }), repeat: 1.2, palettes: duo(BOLD),
  }),
  mk({
    id: 'themed-desert-cactus', name: 'Desert Cactus',
    description: 'Saguaros with a few small suns, tipped this way and that. Southwest ranch character.',
    family: TH, tags: ['rustic', 'cactus', 'desert', 'southwest', 'western', 'kitchen', 'living', 'bedroom'], packs: ['cozy-cottage', 'garden-patio'], price: 12,
    params: print('motif-cactus', 'scatter', 4, 7, 0.85, { rotJitter: 10, mirror: true, motif2: 'motif-sun', motif2Size: 0.4 }), repeat: 1.2, palettes: duo(RUSTIC),
  }),
  mk({
    id: 'themed-pineapple', name: 'Pineapple Parade',
    description: 'Pineapples with their spiky crowns marching in a half-drop, a welcome-home motif with a tropical twist.',
    family: TH, tags: ['eclectic', 'pineapple', 'tropical', 'fruit', 'welcome', 'kitchen', 'dining', 'hall'], packs: ['coastal-home', 'creative-studio'], price: 12,
    params: print('motif-pineapple', 'half-drop', 4, 7, 0.8), repeat: 1.2, palettes: duo(BOLD),
  }),
  mk({
    id: 'themed-pirate-ships', name: 'Pirate Ships',
    description: 'Three-masted galleons under full sail, mirrored in a brick layout. An adventure wall for the high seas.',
    family: TH, tags: ['nautical', 'pirate', 'ship', 'adventure', 'kids', 'bedroom', 'playroom', 'study'], packs: ['kids-storybook', 'coastal-home'], price: 13,
    params: print('motif-pirateship', 'brick', 3, 6, 0.95, { mirror: true }), repeat: 1.2, palettes: duo(COAST),
  }),
];

// Traditional pairs (vintage prints): ground, ink
function DUO_TOILE(): Tuple[] {
  return [
    ['cream-indigo', 'Cream and Indigo', '#f1ead8', '#34456a'], ['cream-red', 'Cream and Red', '#f1ead8', '#9a3d32'],
    ['cream-sage', 'Cream and Sage', '#f1ead8', '#6f8b6a'], ['blush-plum', 'Blush and Plum', '#f1dcd5', '#6a3a5a'],
    ['duck-teal', 'Duck Egg and Teal', '#d3e2de', '#2f6f78'], ['stone-black', 'Stone and Black', '#c9c2b4', '#2b2b2e'],
    ['indigo-cream', 'Indigo and Cream', '#2f3d5a', '#efe6d0'], ['forest-cream', 'Forest and Cream', '#2f4a3c', '#ece0c4'],
    ['mustard-brown', 'Mustard and Brown', '#d6a23a', '#4a3426'],
  ];
}
function QUILT(): Tuple[] {
  return [
    ['barn-red', 'Barn Red', '#efe6d2', '#9a3d32', '#2f3d5a'], ['harvest', 'Harvest', '#efe3cc', '#c9792f', '#5f7048'],
    ['navy-cream', 'Navy and Cream', '#f0ebe0', '#2f3d5a', '#b8523a'], ['sage', 'Sage Quilt', '#d8dfcf', '#6f8b6a', '#8a5a44'],
    ['denim', 'Denim', '#9aa6b5', '#2f4468', '#d9a641'], ['charcoal', 'Charcoal', '#4a4b50', '#e8dfc8', '#b8523a'],
    ['mustard', 'Mustard', '#d9a641', '#2f3d5a', '#efe6d2'], ['blush', 'Blush', '#f1dcd5', '#b9707a', '#6a7f6a'],
    ['forest', 'Forest', '#2f4a3c', '#e8dcc0', '#c9792f'],
  ];
}
