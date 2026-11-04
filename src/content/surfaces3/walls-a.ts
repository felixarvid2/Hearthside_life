// Milestone 10 surface designs, group 'walls-a'. Written by the content agent of this group only; wired into the
// catalog once in ./index.ts. Helpers: ./kit.ts. Sources: dev/surfaces-ai/sources/walls-a.mjs (pilot sources are in pilot.mjs).

import type { SurfaceDesign } from '../types';
import { TRIM, shd, wall, make, type Tuple } from './kit';

// tritone: map 0 -> dark, 0.5 -> base, 1 -> light; roles: base, light, dark, trim
const tritone = make((base) => [base!, shd(base!, 0.62), shd(base!, -0.7), TRIM]);

export const WALLS_A: SurfaceDesign[] = [
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
];
