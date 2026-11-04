// Milestone 10 surface designs, group 'walls-c' (floral 28 + the pilot peony, botanical and nature 21). Written by the
// content agent of this group only; wired into the catalog once in ./index.ts. Helpers: ./kit.ts. Sources:
// dev/surfaces-ai/sources/walls-c.mjs (pilot sources are in pilot.mjs). Every design is a motif-wall print: the layout,
// scale, density, ground and motif pairing are what tell the designs apart; the palette banks below only recolour them.

import type { SurfaceDesign } from '../types';
import { pal, shd, wall, make, type Tuple } from './kit';

// roles: ground, motif, accent (second motif), trim
const motifP = make((g, m) => [g!, m!, shd(m!, 0.4), shd(g!, 0.72)]);
const twoP = (list: Tuple[]) => list.map(([id, name, g, m, a]) => pal(id, name, g!, m!, a!, shd(g!, 0.72)));

// ground, motif, accent: warm and soft florals, then cool and dark florals, then greens, then earth tones
const WARM: Tuple[] = [
  ['cream-rose', 'Cream and Rose', '#f1e8d8', '#c9707b', '#6f8f5c'], ['ivory-navy', 'Ivory and Navy', '#f2eee4', '#34456a', '#c9707b'],
  ['blush-plum', 'Blush and Plum', '#f1dcd5', '#7d3a5a', '#6f8f5c'], ['duck-teal', 'Duck Egg and Teal', '#d3e2de', '#2f7f80', '#e8b4a5'],
  ['sage-forest', 'Sage and Forest', '#b3c0a3', '#2f4a3c', '#f1e8d8'], ['mustard-charcoal', 'Mustard and Charcoal', '#d9a641', '#33363b', '#f6ead0'],
  ['charcoal-coral', 'Charcoal and Coral', '#33363b', '#e4806a', '#8fb083'], ['midnight-blush', 'Midnight and Blush', '#1f2a44', '#e3b5b0', '#c9a35a'],
  ['greige-terracotta', 'Greige and Terracotta', '#b9b0a3', '#c4714d', '#3f5a40'],
];
const COOL: Tuple[] = [
  ['white-indigo', 'White and Indigo', '#f4f2ec', '#2f4272', '#8fa9b9'], ['mist-lavender', 'Mist and Lavender', '#e3e2ea', '#7b6aa6', '#4f6b47'],
  ['lilac-aubergine', 'Lilac and Aubergine', '#cdbfd6', '#5d3f6e', '#f2eef4'], ['cornflower-cream', 'Cornflower and Cream', '#6f8fd1', '#f4f0e6', '#2f4272'],
  ['stone-rust', 'Stone and Rust', '#d6d0c4', '#a4522f', '#4a5848'], ['oat-denim', 'Oat and Denim', '#e6dcc8', '#3f5f8a', '#d98b9a'],
  ['ink-gold', 'Ink and Gold', '#1f2833', '#d3b261', '#e3b5b0'], ['bottle-rose', 'Bottle and Rose', '#233a30', '#e49aa5', '#f1e8d8'],
  ['berry-cream', 'Berry and Cream', '#6e2c48', '#f1e1cf', '#e8c15a'],
];
const LEAF: Tuple[] = [
  ['white-fern', 'White and Fern', '#f1ede2', '#4f7a55', '#c9a44a'], ['linen-sage', 'Linen and Sage', '#e6dfd2', '#6f8f6a', '#8a6a4a'],
  ['mist-green', 'Mist and Green', '#d3e0de', '#3f6a60', '#e8c15a'], ['stone-olive', 'Stone and Olive', '#9e9d98', '#4a5848', '#e9ede3'],
  ['terracotta-leaf', 'Terracotta and Leaf', '#c87f5f', '#3f5535', '#f1dcc0'], ['ochre-forest', 'Ochre and Forest', '#d3a03c', '#27472f', '#f4e6b4'],
  ['forest-mint', 'Forest and Mint', '#233a30', '#8fc79a', '#e8c15a'], ['ink-teal', 'Ink and Teal', '#1f2833', '#5a9a86', '#e3b5b0'],
  ['blush-moss', 'Blush and Moss', '#f0d6cc', '#5f7a4a', '#b5566a'],
];
const EARTH: Tuple[] = [
  ['bone-bark', 'Bone and Bark', '#efe8da', '#5a4a3c', '#a4522f'], ['oat-moss', 'Oat and Moss', '#e1d8c2', '#5d6e43', '#c4714d'],
  ['sand-umber', 'Sand and Umber', '#cdbf9f', '#6a4a30', '#f1e8d8'], ['clay-cream', 'Clay and Cream', '#b86f50', '#f1e6d2', '#3f5535'],
  ['fog-charcoal', 'Fog and Charcoal', '#cfd2cf', '#3a3f42', '#8fa388'], ['pine-straw', 'Pine and Straw', '#2d4638', '#d9c58a', '#c4714d'],
  ['dusk-blue', 'Dusk and Sky', '#2b3a55', '#a9bfd0', '#d9a641'], ['mustard-bark', 'Mustard and Bark', '#d9a641', '#4a3a2c', '#f6ead0'],
  ['night-sage', 'Night and Sage', '#232a2e', '#9fb48c', '#d98b9a'],
];

const H = 2.8;
const id = (m: string) => (m === 'peony' ? 'motif-peony' : `motif-c-${m}`);
interface Spec {
  id: string; name: string; description: string; family: 'floral' | 'botanical'; tags: string[]; packs: string[]; price: number;
  motif: string; motif2?: string; layout: string; repeat: number; cols: number; cell: number; size: number;
  bank: Tuple[]; ground?: boolean; contrast?: number; extra?: Record<string, string | number | boolean>;
}

/** One motif-wall design; cell is the wanted cell height in metres (rows fit the 2.8 m wall, at most 12). */
function design(s: Spec): SurfaceDesign {
  const rows = Math.min(12, Math.max(1, Math.round(H / s.cell)));
  const params: Record<string, string | number | boolean> = {
    motif: id(s.motif), layout: s.layout, cols: s.cols, rows, size: s.size, skirt: 0.1, ...s.extra,
  };
  if (s.motif2) params.motif2 = id(s.motif2);
  if (s.ground !== false) Object.assign(params, { ground: 'paper-linen', groundScale: 0.6, groundContrast: s.contrast ?? 0.5 });
  return wall({
    id: s.id, name: s.name, description: s.description, family: s.family, tags: s.tags, packs: s.packs, price: s.price,
    painter: 'motif-wall', params, repeat: s.repeat,
    palettes: s.motif2 ? twoP(s.bank) : motifP(s.bank),
  });
}

const FL = (s: Omit<Spec, 'family' | 'bank'> & { bank?: Tuple[] }) => design({ family: 'floral', bank: WARM, ...s });
const BO = (s: Omit<Spec, 'family' | 'bank'> & { bank?: Tuple[] }) => design({ family: 'botanical', bank: LEAF, ...s });

export const WALLS_C: SurfaceDesign[] = [
  wall({
    id: 'floral-peony-halfdrop', name: 'Peony Half-Drop',
    description: 'Bold peony heads with leaves in a half-drop repeat over a fine linen-textured paper, like a printed cottage wallpaper.',
    family: 'floral', tags: ['floral', 'peony', 'half-drop', 'wallpaper', 'romantic', 'bedroom', 'living', 'hall'],
    packs: ['cozy-cottage', 'botanical-living'], price: 14,
    painter: 'motif-wall',
    params: { motif: 'motif-peony', ground: 'paper-linen', groundScale: 0.6, groundContrast: 0.6, layout: 'half-drop', cols: 4, rows: 6, size: 0.9, rotJitter: 6, skirt: 0.1 },
    repeat: 1.2,
    palettes: motifP([
      ['cream-rose', 'Cream and Rose', '#f1e8d8', '#c9707b'], ['ivory-navy', 'Ivory and Navy', '#f2eee4', '#34456a'],
      ['blush-plum', 'Blush and Plum', '#f1dcd5', '#7d3a5a'], ['duck-teal', 'Duck Egg and Teal', '#d3e2de', '#2f7f80'],
      ['sage-forest', 'Sage and Forest', '#b3c0a3', '#2f4a3c'], ['mustard-charcoal', 'Mustard and Charcoal', '#d9a641', '#33363b'],
      ['charcoal-coral', 'Charcoal and Coral', '#33363b', '#e4806a'], ['midnight-blush', 'Midnight and Blush', '#1f2a44', '#e3b5b0'],
    ] as Tuple[]),
  }),

  // --- floral ------------------------------------------------------------------------------------
  FL({ id: 'floral-rose-grande', name: 'Cabbage Rose Grande', description: 'Oversized cabbage roses with their leaves, dropped half a bloom down in every second column: a generous statement for a bedroom wall.',
    tags: ['floral', 'rose', 'large-print', 'half-drop', 'romantic', 'bedroom', 'living'], packs: ['cozy-cottage', 'classic-townhouse'], price: 18,
    motif: 'rose', layout: 'half-drop', repeat: 1.4, cols: 2, cell: 0.7, size: 0.95, extra: { rotJitter: 8 } }),
  FL({ id: 'floral-tulip-rows', name: 'Tulip Rows', description: 'Single tulips on slim stems in neat upright rows, every other one mirrored, like a spring garden bed.',
    tags: ['floral', 'tulip', 'grid', 'spring', 'kitchen', 'bedroom', 'nursery'], packs: ['cozy-cottage', 'everyday-essentials'], price: 8,
    motif: 'tulip', layout: 'grid', repeat: 1.2, cols: 5, cell: 0.35, size: 0.9, bank: COOL, extra: { mirror: true } }),
  FL({ id: 'floral-daisy-meadow', name: 'Daisy Meadow', description: 'Small daisies tossed at random angles and sizes, as if they had been scattered across the wall by the wind.',
    tags: ['floral', 'daisy', 'scatter', 'ditsy', 'cheerful', 'kitchen', 'nursery', 'bedroom'], packs: ['cozy-cottage', 'kids-storybook'], price: 6,
    motif: 'daisy', layout: 'scatter', repeat: 1.2, cols: 5, cell: 0.25, size: 0.7, extra: { rotJitter: 180, scaleJitter: 0.3 } }),
  FL({ id: 'floral-poppy-field', name: 'Poppy Field', description: 'Wide poppies on short stems with wildflower sprigs between them, scattered loosely like a summer verge.',
    tags: ['floral', 'poppy', 'wildflower', 'scatter', 'two-motif', 'living', 'hall'], packs: ['cozy-cottage', 'garden-patio'], price: 12,
    motif: 'poppy', motif2: 'wildsprig', layout: 'scatter', repeat: 1.2, cols: 3, cell: 0.4, size: 0.7, extra: { motif2Size: 0.4, rotJitter: 30, scaleJitter: 0.2 } }),
  FL({ id: 'floral-lily-trail', name: 'Lily Trail', description: 'Open lilies climbing the wall in gently swaying columns, each tilting with the curve of the line.',
    tags: ['floral', 'lily', 'trail', 'elegant', 'bedroom', 'hall', 'bathroom'], packs: ['classic-townhouse', 'botanical-living'], price: 14,
    motif: 'lily', layout: 'trail', repeat: 1.2, cols: 3, cell: 0.4, size: 0.95, bank: COOL }),
  FL({ id: 'floral-lavender-stripe', name: 'Lavender Stripes', description: 'Tall lavender sprigs standing in even columns with plenty of air between them, a calm French-country stripe.',
    tags: ['floral', 'lavender', 'grid', 'stripe', 'provence', 'bedroom', 'bathroom'], packs: ['cozy-cottage', 'botanical-living'], price: 9,
    motif: 'lavender', layout: 'grid', repeat: 1.0, cols: 4, cell: 0.4, size: 1.1, bank: COOL, extra: { mirror: true } }),
  FL({ id: 'floral-sunflower-brick', name: 'Sunflower Brick', description: 'Sunflower heads laid out in offset rows like brickwork, jolly and a little retro.',
    tags: ['floral', 'sunflower', 'brick', 'retro', 'kitchen', 'dining'], packs: ['mid-century', 'cozy-cottage'], price: 10,
    motif: 'sunflower', layout: 'brick', repeat: 1.2, cols: 3, cell: 0.4, size: 0.85, extra: { rotJitter: 15 } }),
  FL({ id: 'floral-hydrangea-grand', name: 'Hydrangea Cloud', description: 'Big round hydrangea heads in a wide half-drop, soft as cottage-garden clouds.',
    tags: ['floral', 'hydrangea', 'large-print', 'half-drop', 'cottage', 'living', 'bedroom'], packs: ['cozy-cottage', 'classic-townhouse'], price: 17,
    motif: 'hydrangea', layout: 'half-drop', repeat: 1.6, cols: 2, cell: 0.8, size: 0.95, bank: COOL, extra: { rotJitter: 10 } }),
  FL({ id: 'floral-iris-nouveau', name: 'Iris Nouveau', description: 'Upright irises with sword leaves in a stately mirrored grid, Art Nouveau in spirit.',
    tags: ['floral', 'iris', 'grid', 'art-nouveau', 'formal', 'hall', 'dining'], packs: ['classic-townhouse', 'art-deco'], price: 15,
    motif: 'iris', layout: 'grid', repeat: 1.2, cols: 3, cell: 0.55, size: 1.0, bank: COOL, ground: false, extra: { mirror: true } }),
  FL({ id: 'floral-anemone-check', name: 'Anemone Check', description: 'Anemones and fine wildflower sprigs alternate on a checkerboard, a quiet two-motif print.',
    tags: ['floral', 'anemone', 'checker', 'two-motif', 'bedroom', 'dining'], packs: ['cozy-cottage', 'classic-townhouse'], price: 12,
    motif: 'anemone', motif2: 'wildsprig', layout: 'diagonal', repeat: 1.2, cols: 4, cell: 0.3, size: 0.9, bank: COOL, extra: { motif2Size: 0.8 } }),
  FL({ id: 'floral-wildsprig-toss', name: 'Wild Sprig Toss', description: 'A small-scale toss of mixed wildflower sprigs at every angle, a dense little print that works anywhere.',
    tags: ['floral', 'wildflower', 'ditsy', 'scatter', 'small-print', 'hall', 'bathroom', 'nursery'], packs: ['cozy-cottage', 'everyday-essentials'], price: 6,
    motif: 'wildsprig', layout: 'scatter', repeat: 1.0, cols: 4, cell: 0.25, size: 0.65, extra: { rotJitter: 180, scaleJitter: 0.25 } }),
  FL({ id: 'floral-cornflower-ditsy', name: 'Cornflower Ditsy', description: 'Tiny cornflowers in offset rows, the little blue print of a country kitchen.',
    tags: ['floral', 'cornflower', 'ditsy', 'brick', 'small-print', 'kitchen', 'bathroom'], packs: ['cozy-cottage', 'everyday-essentials'], price: 5,
    motif: 'cornflower', layout: 'brick', repeat: 1.2, cols: 5, cell: 0.24, size: 0.55, bank: COOL, extra: { rotJitter: 20 } }),
  FL({ id: 'floral-dahlia-statement', name: 'Dahlia Statement', description: 'Huge layered dahlias, one to a drop, for a wall that is mostly flower.',
    tags: ['floral', 'dahlia', 'oversized', 'half-drop', 'feature-wall', 'living', 'dining'], packs: ['classic-townhouse', 'mid-century'], price: 22,
    motif: 'dahlia', layout: 'half-drop', repeat: 1.6, cols: 2, cell: 0.8, size: 1.0, bank: COOL, extra: { rotJitter: 180 } }),
  FL({ id: 'floral-magnolia-bough', name: 'Magnolia Bough', description: 'Magnolia boughs with a single big blossom each, set on a diagonal sway across the wall.',
    tags: ['floral', 'magnolia', 'trail', 'elegant', 'living', 'bedroom'], packs: ['classic-townhouse', 'botanical-living'], price: 16,
    motif: 'magnolia', layout: 'trail', repeat: 1.4, cols: 2, cell: 0.6, size: 1.0, extra: { rotate: 20 } }),
  FL({ id: 'floral-orchid-cascade', name: 'Orchid Cascade', description: 'Arching orchid stems with open blossoms and buds, mirrored down the wall in long-leaning lines.',
    tags: ['floral', 'orchid', 'trail', 'exotic', 'spa', 'bathroom', 'bedroom'], packs: ['botanical-living', 'modern-minimal'], price: 20,
    motif: 'orchid', layout: 'trail', repeat: 1.2, cols: 3, cell: 0.45, size: 1.0, bank: COOL, ground: false, extra: { mirror: true } }),
  FL({ id: 'floral-lotus-brick', name: 'Lotus Brick', description: 'Calm lotus blossoms in offset rows with generous spacing, a serene repeat for a bath or a bedroom.',
    tags: ['floral', 'lotus', 'brick', 'serene', 'zen', 'bathroom', 'bedroom'], packs: ['botanical-living', 'modern-minimal'], price: 13,
    motif: 'lotus', layout: 'brick', repeat: 1.2, cols: 3, cell: 0.4, size: 0.8 }),
  FL({ id: 'floral-kiku-check', name: 'Kiku Checker', description: 'Chrysanthemums and camellias swap places on a checkerboard, a formal two-flower print in the Japanese manner.',
    tags: ['floral', 'chrysanthemum', 'camellia', 'checker', 'oriental', 'two-motif', 'dining', 'hall'], packs: ['classic-townhouse', 'botanical-living'], price: 16,
    motif: 'chrysanthemum', motif2: 'camellia', layout: 'diagonal', repeat: 1.2, cols: 4, cell: 0.3, size: 0.85, bank: COOL, extra: { motif2Size: 0.85 } }),
  FL({ id: 'floral-camellia-scatter', name: 'Camellia Scatter', description: 'Glossy camellias with their leaves, scattered at random in a medium repeat.',
    tags: ['floral', 'camellia', 'scatter', 'living', 'hall', 'bedroom'], packs: ['classic-townhouse', 'cozy-cottage'], price: 13,
    motif: 'camellia', layout: 'scatter', repeat: 1.2, cols: 3, cell: 0.4, size: 0.62, extra: { rotJitter: 40, scaleJitter: 0.2 } }),
  FL({ id: 'floral-foxglove-cottage', name: 'Foxglove Cottage', description: 'Tall foxglove spires in a wide grid with small daisies in the gaps: the back border of an English garden.',
    tags: ['floral', 'foxglove', 'grid', 'two-motif', 'cottage', 'hall', 'living'], packs: ['cozy-cottage', 'garden-patio'], price: 12,
    motif: 'foxglove', motif2: 'daisy', layout: 'grid', repeat: 1.2, cols: 3, cell: 0.5, size: 1.05, extra: { motif2Size: 0.3 } }),
  FL({ id: 'floral-pansy-posies', name: 'Pansy Posies', description: 'Little pansy faces in a close half-drop, sweet and old-fashioned.',
    tags: ['floral', 'pansy', 'half-drop', 'small-print', 'nursery', 'bedroom', 'hall'], packs: ['cozy-cottage', 'kids-storybook'], price: 7,
    motif: 'pansy', layout: 'half-drop', repeat: 1.2, cols: 6, cell: 0.3, size: 0.8, extra: { rotJitter: 12 } }),
  FL({ id: 'floral-wisteria-drift', name: 'Wisteria Drift', description: 'Hanging wisteria clusters drifting down the wall in swaying lines, with a soft faded look.',
    tags: ['floral', 'wisteria', 'trail', 'romantic', 'hanging', 'bedroom', 'hall'], packs: ['botanical-living', 'cozy-cottage'], price: 15,
    motif: 'wisteria', layout: 'trail', repeat: 1.2, cols: 4, cell: 0.4, size: 1.0, bank: COOL, extra: { rotJitter: 6 } }),
  FL({ id: 'floral-ranunculus-brick', name: 'Ranunculus Brick', description: 'Ruffled ranunculus blooms in offset rows, a lush mid-scale print with plenty of petals.',
    tags: ['floral', 'ranunculus', 'brick', 'lush', 'bedroom', 'living'], packs: ['classic-townhouse', 'cozy-cottage'], price: 12,
    motif: 'ranunculus', layout: 'brick', repeat: 1.2, cols: 4, cell: 0.3, size: 0.9, extra: { rotJitter: 180 } }),
  FL({ id: 'floral-calico-ditsy', name: 'Calico Ditsy', description: 'Tiny five-petal flowers in a tight grid with a few wildflower sprigs between, a classic calico print.',
    tags: ['floral', 'calico', 'ditsy', 'grid', 'small-print', 'kitchen', 'nursery', 'bathroom'], packs: ['cozy-cottage', 'everyday-essentials'], price: 5,
    motif: 'ditsy', motif2: 'wildsprig', layout: 'grid', repeat: 1.0, cols: 4, cell: 0.25, size: 0.45, extra: { motif2Size: 0.3, rotJitter: 10 } }),
  FL({ id: 'floral-bouquet-hung', name: 'Hung Bouquets', description: 'Ribbon-tied bouquets hanging in a regular grid, a traditional print for a dining room or hall.',
    tags: ['floral', 'bouquet', 'grid', 'traditional', 'dining', 'hall', 'bedroom'], packs: ['classic-townhouse', 'cozy-cottage'], price: 14,
    motif: 'bouquet', layout: 'grid', repeat: 1.2, cols: 3, cell: 0.55, size: 0.9, bank: COOL, extra: { rotJitter: 3 } }),
  FL({ id: 'floral-wreath-medallion', name: 'Wreath Medallions', description: 'Round flower wreaths with a small ditsy bloom floating between them, in a calm formal repeat.',
    tags: ['floral', 'wreath', 'medallion', 'two-motif', 'formal', 'dining', 'hall'], packs: ['classic-townhouse', 'cozy-cottage'], price: 16,
    motif: 'wreath', motif2: 'ditsy', layout: 'grid', repeat: 1.2, cols: 3, cell: 0.45, size: 0.85, extra: { motif2Size: 0.3 } }),
  FL({ id: 'floral-blossom-twigs', name: 'Blossom Twigs', description: 'Slender flowering twigs at loose angles, an airy scatter in the spirit of a spring orchard.',
    tags: ['floral', 'blossom', 'twig', 'scatter', 'airy', 'bedroom', 'living'], packs: ['botanical-living', 'modern-minimal'], price: 11,
    motif: 'blossomtwig', layout: 'scatter', repeat: 1.2, cols: 3, cell: 0.45, size: 1.0, extra: { rotJitter: 60, scaleJitter: 0.2 } }),
  FL({ id: 'floral-peony-rose-check', name: 'Peony and Rose Check', description: 'Peonies and cabbage roses take turns on a checkerboard, a lush two-bloom cottage print.',
    tags: ['floral', 'peony', 'rose', 'checker', 'two-motif', 'bedroom', 'living'], packs: ['cozy-cottage', 'classic-townhouse'], price: 15,
    motif: 'peony', motif2: 'rose', layout: 'diagonal', repeat: 1.2, cols: 4, cell: 0.3, size: 0.72, extra: { motif2Size: 0.72, rotJitter: 10 } }),
  FL({ id: 'floral-butterfly-garden', name: 'Butterfly Garden', description: 'Roses scattered in a loose print with small butterflies fluttering between them.',
    tags: ['floral', 'rose', 'butterfly', 'scatter', 'two-motif', 'nursery', 'bedroom'], packs: ['cozy-cottage', 'kids-storybook'], price: 13,
    motif: 'rose', motif2: 'butterfly', layout: 'scatter', repeat: 1.2, cols: 3, cell: 0.4, size: 0.6, extra: { motif2Size: 0.35, rotJitter: 40 } }),

  // --- botanical and nature ---------------------------------------------------------------------
  BO({ id: 'botanical-fern-halfdrop', name: 'Fern Fronds', description: 'Arching fern fronds in a generous half-drop, a lush woodland floor on the wall.',
    tags: ['botanical', 'fern', 'half-drop', 'woodland', 'green', 'living', 'bedroom', 'hall'], packs: ['botanical-living', 'garden-patio'], price: 12,
    motif: 'fern', layout: 'half-drop', repeat: 1.2, cols: 2, cell: 0.6, size: 1.0, extra: { rotJitter: 20 } }),
  BO({ id: 'botanical-ginkgo-scatter', name: 'Ginkgo Fall', description: 'Fan-shaped ginkgo leaves drifting at random angles, like an autumn path.',
    tags: ['botanical', 'ginkgo', 'scatter', 'leaves', 'autumn', 'living', 'hall'], packs: ['botanical-living', 'modern-minimal'], price: 11,
    motif: 'ginkgo', layout: 'scatter', repeat: 1.2, cols: 4, cell: 0.3, size: 0.8, bank: EARTH, extra: { rotJitter: 180, scaleJitter: 0.25 } }),
  BO({ id: 'botanical-eucalyptus-trail', name: 'Eucalyptus Trail', description: 'Eucalyptus stems with round leaves, swaying in long vertical lines.',
    tags: ['botanical', 'eucalyptus', 'trail', 'calm', 'bedroom', 'bathroom'], packs: ['botanical-living', 'modern-minimal'], price: 10,
    motif: 'eucalyptus', layout: 'trail', repeat: 1.2, cols: 4, cell: 0.4, size: 1.0 }),
  BO({ id: 'botanical-oak-brick', name: 'Oak Leaf Brick', description: 'Lobed oak leaves in offset rows, tilted every which way, a sturdy woodland print.',
    tags: ['botanical', 'oak', 'brick', 'leaves', 'woodland', 'study', 'hall'], packs: ['classic-townhouse', 'botanical-living'], price: 9,
    motif: 'oakleaf', layout: 'brick', repeat: 1.2, cols: 4, cell: 0.3, size: 0.85, bank: EARTH, extra: { rotJitter: 40 } }),
  BO({ id: 'botanical-maple-grid', name: 'Maple Grid', description: 'Five-lobed maple leaves in an orderly mirrored grid, crisp and graphic.',
    tags: ['botanical', 'maple', 'grid', 'leaves', 'graphic', 'kitchen', 'hall'], packs: ['mid-century', 'modern-minimal'], price: 8,
    motif: 'maple', layout: 'grid', repeat: 1.2, cols: 5, cell: 0.3, size: 0.8, bank: EARTH, extra: { mirror: true } }),
  BO({ id: 'botanical-olive-grove', name: 'Olive Grove', description: 'Olive branches with narrow leaves and fruit, trailing in long swaying lines, a Mediterranean calm.',
    tags: ['botanical', 'olive', 'trail', 'mediterranean', 'kitchen', 'dining'], packs: ['coastal-home', 'botanical-living'], price: 12,
    motif: 'olive', layout: 'trail', repeat: 1.4, cols: 3, cell: 0.5, size: 1.0, extra: { rotate: 15 } }),
  BO({ id: 'botanical-banana-grand', name: 'Banana Leaf Grand', description: 'Huge banana leaves with torn edges, one per drop, for an instant tropical feature wall.',
    tags: ['botanical', 'banana', 'tropical', 'oversized', 'feature-wall', 'living', 'bathroom'], packs: ['botanical-living', 'coastal-home'], price: 19,
    motif: 'banana', layout: 'half-drop', repeat: 1.8, cols: 2, cell: 0.9, size: 1.05, ground: false, extra: { rotJitter: 15 } }),
  BO({ id: 'botanical-fig-halfdrop', name: 'Fig Leaves', description: 'Deeply lobed fig leaves in a half-drop with mirrored neighbours, a classic Mediterranean print.',
    tags: ['botanical', 'fig', 'half-drop', 'leaves', 'mediterranean', 'living', 'dining'], packs: ['botanical-living', 'classic-townhouse'], price: 13,
    motif: 'fig', layout: 'half-drop', repeat: 1.2, cols: 4, cell: 0.35, size: 0.9, extra: { mirror: true, rotJitter: 12 } }),
  BO({ id: 'botanical-bamboo-grove', name: 'Bamboo Grove', description: 'Slim bamboo stalks in tall, close columns, a quiet vertical rhythm.',
    tags: ['botanical', 'bamboo', 'grid', 'zen', 'vertical', 'bathroom', 'bedroom', 'study'], packs: ['botanical-living', 'modern-minimal'], price: 11,
    motif: 'bamboo', layout: 'grid', repeat: 1.2, cols: 5, cell: 0.4, size: 1.2, ground: false, extra: { mirror: true } }),
  BO({ id: 'botanical-ivy-vine', name: 'Ivy Vine', description: 'Trailing ivy vines climbing in lightly swaying lines up the wall.',
    tags: ['botanical', 'ivy', 'trail', 'vine', 'climbing', 'hall', 'study'], packs: ['classic-townhouse', 'garden-patio'], price: 10,
    motif: 'ivy', layout: 'trail', repeat: 1.2, cols: 3, cell: 0.35, size: 0.95, extra: { rotJitter: 8 } }),
  BO({ id: 'botanical-thistle-brick', name: 'Thistle Brick', description: 'Spiky thistles in offset rows, Highland-lodge style with a hint of heraldry.',
    tags: ['botanical', 'thistle', 'brick', 'highland', 'lodge', 'study', 'hall'], packs: ['classic-townhouse', 'cozy-cottage'], price: 11,
    motif: 'thistle', layout: 'brick', repeat: 1.2, cols: 4, cell: 0.35, size: 0.85, bank: EARTH, extra: { mirror: true } }),
  BO({ id: 'botanical-wheat-field', name: 'Wheat Field', description: 'Bundles of wheat ears standing in a neat mirrored grid, a harvest print for the kitchen.',
    tags: ['botanical', 'wheat', 'grid', 'harvest', 'farmhouse', 'kitchen', 'dining'], packs: ['cozy-cottage', 'everyday-essentials'], price: 8,
    motif: 'wheat', layout: 'grid', repeat: 1.2, cols: 4, cell: 0.4, size: 1.0, bank: EARTH, extra: { mirror: true } }),
  BO({ id: 'botanical-dandelion-drift', name: 'Dandelion Drift', description: 'Dandelion clocks scattered in a loose print, with the lightness of seeds on the wind.',
    tags: ['botanical', 'dandelion', 'scatter', 'airy', 'nursery', 'bedroom', 'living'], packs: ['botanical-living', 'kids-storybook'], price: 8,
    motif: 'dandelion', layout: 'scatter', repeat: 1.2, cols: 4, cell: 0.3, size: 0.75, extra: { rotJitter: 25, scaleJitter: 0.3 } }),
  BO({ id: 'botanical-mushroom-forest', name: 'Mushroom Forest', description: 'Toadstools and ferns alternate on a checkerboard, a storybook woodland floor.',
    tags: ['botanical', 'mushroom', 'fern', 'checker', 'two-motif', 'woodland', 'nursery', 'study'], packs: ['kids-storybook', 'botanical-living'], price: 10,
    motif: 'mushroom', motif2: 'fern', layout: 'diagonal', repeat: 1.2, cols: 4, cell: 0.3, size: 0.8, bank: EARTH, extra: { motif2Size: 0.85, rotJitter: 10 } }),
  BO({ id: 'botanical-songbird-bough', name: 'Songbird Bough', description: 'Small songbirds perched between eucalyptus stems in a half-drop, an aviary print.',
    tags: ['botanical', 'bird', 'songbird', 'eucalyptus', 'half-drop', 'two-motif', 'bedroom', 'living'], packs: ['botanical-living', 'cozy-cottage'], price: 15,
    motif: 'songbird', motif2: 'eucalyptus', layout: 'half-drop', repeat: 1.2, cols: 2, cell: 0.6, size: 0.65, extra: { motif2Size: 0.8, mirror: true } }),
  BO({ id: 'botanical-heron-marsh', name: 'Heron Marsh', description: 'Herons standing among bamboo-like reeds, repeated in a wide grid for a still, misty marsh.',
    tags: ['botanical', 'heron', 'bird', 'reeds', 'grid', 'two-motif', 'zen', 'bathroom', 'living'], packs: ['coastal-home', 'botanical-living'], price: 18,
    motif: 'heron', motif2: 'bamboo', layout: 'grid', repeat: 1.4, cols: 2, cell: 0.7, size: 0.95, bank: EARTH, extra: { motif2Size: 0.8 } }),
  BO({ id: 'botanical-butterfly-meadow', name: 'Butterfly Meadow', description: 'Butterflies in flight over scattered daisies, light and cheerful.',
    tags: ['botanical', 'butterfly', 'daisy', 'scatter', 'two-motif', 'nursery', 'bedroom'], packs: ['kids-storybook', 'cozy-cottage'], price: 9,
    motif: 'butterfly', motif2: 'daisy', layout: 'scatter', repeat: 1.2, cols: 4, cell: 0.3, size: 0.65, extra: { motif2Size: 0.5, rotJitter: 50 } }),
  BO({ id: 'botanical-dragonfly-pond', name: 'Dragonfly Pond', description: 'Dragonflies skimming between lotus blooms in a diagonal repeat, a still-pond print.',
    tags: ['botanical', 'dragonfly', 'lotus', 'checker', 'two-motif', 'zen', 'bathroom', 'bedroom'], packs: ['botanical-living', 'coastal-home'], price: 14,
    motif: 'dragonfly', motif2: 'lotus', layout: 'diagonal', repeat: 1.2, cols: 4, cell: 0.3, size: 0.95, bank: EARTH, extra: { motif2Size: 0.8, rotJitter: 20 } }),
  BO({ id: 'botanical-owl-woodland', name: 'Woodland Owls', description: 'Owls and oak leaves alternate on a checkerboard, a snug woodland print.',
    tags: ['botanical', 'owl', 'oak', 'checker', 'two-motif', 'woodland', 'nursery', 'study'], packs: ['kids-storybook', 'cozy-cottage'], price: 12,
    motif: 'owl', motif2: 'oakleaf', layout: 'diagonal', repeat: 1.2, cols: 4, cell: 0.3, size: 0.8, bank: EARTH, extra: { motif2Size: 0.75, rotJitter: 15 } }),
  BO({ id: 'botanical-birch-forest', name: 'Birch Forest', description: 'Slim birch trees in tall columns, mirrored and slightly leaning, a quiet northern forest.',
    tags: ['botanical', 'birch', 'tree', 'forest', 'grid', 'nordic', 'bedroom', 'living', 'study'], packs: ['botanical-living', 'modern-minimal'], price: 13,
    motif: 'birch', layout: 'grid', repeat: 1.4, cols: 4, cell: 0.6, size: 1.2, bank: EARTH, ground: false, extra: { mirror: true, rotJitter: 3 } }),
  BO({ id: 'botanical-pine-ridge', name: 'Pine Ridge', description: 'Rows of conical pines in offset ranks, a graphic forest for a lodge or a boy\'s room.',
    tags: ['botanical', 'pine', 'tree', 'brick', 'forest', 'lodge', 'nursery', 'study'], packs: ['cozy-cottage', 'kids-storybook'], price: 10,
    motif: 'pinetree', layout: 'brick', repeat: 1.2, cols: 4, cell: 0.4, size: 0.95, bank: EARTH, extra: { scaleJitter: 0.15 } }),
];
