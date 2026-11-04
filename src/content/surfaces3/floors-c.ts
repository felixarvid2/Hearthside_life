// Milestone 10 surface designs, group 'floors-c'. Written by the content agent of this group only; wired into the
// catalog once in ./index.ts. Helpers: ./kit.ts. Sources: dev/surfaces-ai/sources/floors-c.mjs (pilot sources are in pilot.mjs).

import type { SurfaceDesign } from '../types';
import { shd, floor, make, type Tuple } from './kit';

// roles: ground, motif, accent (filler motif, unused here), grout (unused outside the tile layout)
const printP = make((g, m) => [g!, m!, shd(m!, 0.4), shd(g!, -0.3)]);

export const FLOORS_C: SurfaceDesign[] = [
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
];
