// Milestone 10 surface designs, group 'walls-c'. Written by the content agent of this group only; wired into the
// catalog once in ./index.ts. Helpers: ./kit.ts. Sources: dev/surfaces-ai/sources/walls-c.mjs (pilot sources are in pilot.mjs).

import type { SurfaceDesign } from '../types';
import { shd, wall, make, type Tuple } from './kit';

// roles: ground, motif, accent (filler motif, unused here), trim
const motifP = make((g, m) => [g!, m!, shd(m!, 0.4), shd(g!, 0.72)]);

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
];
