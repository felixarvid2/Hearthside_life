// Residential layouts for the neighbourhood (Milestone 7): six small furnished homes on 24 x 24 lots with the entry in the
// middle of the south edge. Each is a declarative HousePlan (./housekit.ts) with its own plan, finishes and furniture, and every
// one has a bed for each person who is meant to live there, a kitchen, a bathroom and a living area. Plans are validated by
// validatePlacement while they are built, and by lotProblems() afterwards.
//
//   0 Bluebell Cottage   partners: double bed, bathtub, kitchen nook with a table for two, TV room, flower boxes
//   1 Sorrel Lodge       one resident: log-cabin studio with a reading chair, bookcases, a desk and a kitchen line
//   2 Kestrel House      two housemates: a single bedroom each, shared bath, open kitchen-dining and living room
//   3 Heron Row 4        two siblings: narrow terrace house, two single bedrooms, bath, kitchen, living-dining room
//   4 Marigold Flat      modern open-plan flat for one or two: double bed, shower, kitchen bar, lounge
//   5 Hazelbank House    family house: master bedroom, bunk-bed room, single room with a desk, bath, big kitchen, garden play area
//
// Variants wrap around (variant 6 is variant 0), so any number can be asked for.

import type { ContentDB } from '../content/types';
import type { Id, WorldState } from '../core/types';
import { buildHouse, type HousePlan } from './housekit';
import { finish } from './lotCheck';
import { requireLot } from './lots';
import { F, P, T, applyTints, area, line, openings, outline, planOffset, shiftPlan, withoutDecorOnEntry, type Furn, type Tint } from './planKit';

/** What each variant offers (the neighbourhood generator picks a home for a household by size). */
export interface ResidentialVariant {
  name: string;
  /** Number of beds, and how many people they sleep (a double bed sleeps two). */
  beds: number;
  sleeps: number;
  bedrooms: number;
}

export const RESIDENTIAL_VARIANTS: readonly ResidentialVariant[] = [
  { name: 'Bluebell Cottage', beds: 1, sleeps: 2, bedrooms: 1 },
  { name: 'Sorrel Lodge', beds: 1, sleeps: 1, bedrooms: 1 },
  { name: 'Kestrel House', beds: 2, sleeps: 2, bedrooms: 2 },
  { name: 'Heron Row 4', beds: 2, sleeps: 2, bedrooms: 2 },
  { name: 'Marigold Flat', beds: 1, sleeps: 2, bedrooms: 1 },
  { name: 'Hazelbank House', beds: 4, sleeps: 6, bedrooms: 4 },
];

/** Door and window shorthands shared by the plans. */
const front = (x: number, z: number, defId = 'door-glazed') => ({ dir: 'h' as const, x, z, defId, flip: true });
const inner = (dir: 'h' | 'v', x: number, z: number) => ({ dir, x, z, defId: 'door-panel', flip: true });

// ---------------------------------------------------------------------------------------------
// 0 Bluebell Cottage (x 6..17, z 7..16)
// ---------------------------------------------------------------------------------------------

function cottage(): HousePlan {
  const furniture: Furn[] = [
    // bedroom
    F('bed-double-oak', 7, 7), F('nightstand-oak', 6, 7), F('nightstand-oak', 9, 7), F('wardrobe-tall', 10, 11, 2), F('rug-rectangle', 7, 9), F('lamp-floor-round', 6, 11),
    // bathroom
    F('bathtub', 11, 7), F('toilet-basic', 13, 7), F('bathroom-sink', 11, 9, 1), F('trash-can', 13, 9),
    // kitchen corner and table for two
    F('fridge-standard', 14, 7), F('counter-sink', 15, 7), F('stove-basic', 16, 7), F('counter-basic', 17, 7),
    F('table-dining-oak', 15, 10), ...line('chair-dining-oak', 15, 9, 2, 1, 0), ...line('chair-dining-oak', 15, 11, 2, 1, 0, 2),
    // living room
    F('tv-stand-low', 6, 13, 1), F('tv-flatscreen', 6, 13, 1), F('radio-retro', 6, 14, 1), F('table-coffee', 8, 14), F('sofa-tweed', 10, 13, 3),
    F('armchair-lounge', 12, 15, 3), F('rug-rounded', 7, 14), F('bookcase-open', 6, 16), F('lamp-floor-round', 17, 12), F('plant-potted', 17, 16), F('plant-potted', 11, 16),
    // garden
    F('planter-raised', 7, 17), F('planter-raised', 14, 17), F('plant-potted', 11, 17), F('plant-potted', 13, 17), F('bench-garden', 15, 19), F('rug-doormat', 12, 17),
    F('shrub-round', 5, 18), F('shrub-round', 18, 18), F('tree-park', 3, 19), F('tree-park', 19, 20), F('lamp-floor-square', 10, 19),
  ];
  return {
    walls: [
      ...outline(6, 7, 18, 17),
      [{ x: 11, z: 7 }, { x: 11, z: 12 }], [{ x: 6, z: 12 }, { x: 11, z: 12 }], // bedroom
      [{ x: 14, z: 7 }, { x: 14, z: 11 }], [{ x: 11, z: 11 }, { x: 14, z: 11 }], // bathroom
    ],
    openings: [
      front(12, 17), inner('h', 8, 12), inner('h', 12, 11),
      ...openings('window-cottage', 'h', 7, 17, 2), ...openings('window-cottage', 'h', 15, 17, 2),
      ...openings('window-cottage', 'v', 6, 13, 2), ...openings('window-cottage', 'v', 18, 13, 2), ...openings('window-cottage', 'v', 18, 9, 1),
      ...openings('window-cottage', 'v', 6, 9, 1), ...openings('window-high', 'h', 12, 7, 1),
    ],
    rooms: [
      { name: 'bedroom', probe: { x: 8, z: 10 }, wall: P('stripes-regency', 3), floor: P('carpet-plush', 4) },
      { name: 'bathroom', probe: { x: 12, z: 9 }, wall: P('subway-tile', 3), floor: P('hex-mosaic', 3) },
      { name: 'living room', probe: { x: 9, z: 15 }, wall: P('floral-sprig', 1), floor: P('oak-planks', 2) },
    ],
    exterior: P('limewash-plaster', 0),
    floorAreas: [
      area(14, 7, 17, 11, P('checker-tile', 5)), // kitchen corner
      area(5, 18, 18, 18, P('stone-pavers', 1)),
    ],
    path: { to: { x: 12, z: 18 }, finish: P('stone-pavers', 1) },
    furniture,
  };
}

// ---------------------------------------------------------------------------------------------
// 1 Sorrel Lodge (x 7..16, z 8..15)
// ---------------------------------------------------------------------------------------------

function lodge(): HousePlan {
  const furniture: Furn[] = [
    // bathroom
    F('toilet-basic', 7, 8), F('shower-stall', 9, 8), F('bathroom-sink', 8, 10, 2),
    // kitchen line
    F('fridge-compact', 11, 8), F('counter-basic', 12, 8), F('stove-electric', 13, 8), F('counter-sink', 14, 8), F('counter-basic', 15, 8), F('toaster', 12, 8),
    // sleeping corner
    F('bed-single-pine', 16, 8), F('cupboard-bedside', 15, 9), F('wardrobe-tall', 16, 11, 3),
    // dining and reading
    F('table-dining-oak', 12, 11), ...line('chair-dining-oak', 12, 12, 2, 1, 0, 2), F('bookcase-tall', 7, 12, 1), F('bookcase-tall', 7, 13, 1),
    F('armchair-recliner', 15, 13, 3), F('lamp-floor-round', 16, 14),
    // living
    F('sofa-tweed', 9, 12), F('table-coffee', 10, 14), F('tv-stand-low', 9, 15, 2), F('tv-flatscreen', 9, 15, 2),
    F('desk-oak', 12, 14), F('computer-desktop', 12, 14), F('chair-desk', 13, 15, 2),
    // porch and yard
    F('bench-garden', 14, 17), F('plant-potted', 10, 16), F('plant-potted', 14, 16), F('planter-raised', 7, 17), F('rug-doormat', 12, 16), F('tree-park', 17, 17), F('tree-park', 4, 19),
    F('shrub-round', 6, 17), F('lamp-floor-square', 10, 18),
  ];
  return {
    walls: [
      ...outline(7, 8, 17, 16),
      [{ x: 10, z: 8 }, { x: 10, z: 11 }], [{ x: 7, z: 11 }, { x: 10, z: 11 }], // bathroom
    ],
    openings: [
      front(12, 16, 'door-plank'), inner('v', 10, 9),
      ...openings('window-cottage', 'h', 8, 16, 2), ...openings('window-cottage', 'h', 14, 16, 2),
      ...openings('window-cottage', 'v', 7, 12, 2), ...openings('window-cottage', 'v', 17, 12, 2), ...openings('window-high', 'h', 8, 8, 1), ...openings('window-cottage', 'h', 12, 8, 2),
    ],
    rooms: [
      { name: 'lodge', probe: { x: 12, z: 12 }, wall: P('log-cabin', 1), floor: P('oak-planks', 5) },
      { name: 'bathroom', probe: { x: 8, z: 9 }, wall: P('tile-penny', 5), floor: P('hex-mosaic', 5) },
    ],
    exterior: P('log-cabin', 2),
    floorAreas: [area(11, 8, 15, 9, P('quarry-tile', 5)), area(6, 17, 17, 17, P('timber-decking', 0))],
    path: { to: { x: 12, z: 17 }, finish: P('stone-pavers', 3) },
    furniture,
  };
}

// ---------------------------------------------------------------------------------------------
// 2 Kestrel House (x 5..18, z 7..16): two bedrooms and a bath along the back, open kitchen-dining and living room in front
// ---------------------------------------------------------------------------------------------

function kestrel(): HousePlan {
  const furniture: Furn[] = [
    // bedroom A (west)
    F('bed-single-pine', 5, 7), F('nightstand-oak', 6, 7), F('wardrobe-tall', 9, 10, 2), F('desk-oak', 8, 7), F('chair-desk', 8, 8, 2), F('laptop', 8, 7), F('lamp-floor-round', 5, 10),
    // bedroom B (east)
    F('bed-single-pine', 18, 7), F('nightstand-oak', 17, 7), F('wardrobe-tall', 14, 10, 2), F('desk-oak', 15, 7), F('chair-desk', 15, 8, 2), F('computer-desktop', 15, 7), F('lamp-floor-round', 18, 10),
    // bathroom
    F('toilet-basic', 10, 7), F('bathroom-sink', 12, 7), F('shower-stall', 13, 7), F('trash-can', 10, 10),
    // kitchen along the west wall
    F('fridge-standard', 5, 12, 1), F('counter-basic', 5, 13, 1), F('counter-sink', 5, 14, 1), F('stove-basic', 5, 15, 1), F('counter-basic', 5, 16, 1),
    // dining
    F('table-dining-oak', 8, 14), ...line('chair-dining-oak', 8, 13, 2, 1, 0), ...line('chair-dining-oak', 8, 15, 2, 1, 0, 2), F('plant-potted', 10, 12),
    // living room
    F('tv-stand-low', 18, 13, 3), F('tv-flatscreen', 18, 13, 3), F('sofa-modern', 15, 13, 1), F('rug-rectangle', 16, 13, 1), F('armchair-lounge', 14, 16, 0), F('bookcase-open', 10, 16),
    F('lamp-floor-square', 18, 16), F('plant-potted', 11, 16),
    // yard
    F('plant-potted', 7, 17), F('plant-potted', 17, 17), F('bench-garden', 14, 18), F('rug-doormat', 12, 17), F('tree-park', 3, 18), F('tree-park', 19, 19), F('shrub-round', 5, 18),
    F('trash-can', 9, 18), F('lamp-floor-square', 10, 19),
  ];
  return {
    walls: [
      ...outline(5, 7, 19, 17),
      [{ x: 5, z: 11 }, { x: 19, z: 11 }], [{ x: 10, z: 7 }, { x: 10, z: 11 }], [{ x: 14, z: 7 }, { x: 14, z: 11 }],
    ],
    openings: [
      front(12, 17), inner('h', 7, 11), inner('h', 12, 11), inner('h', 16, 11),
      ...openings('window-sash', 'h', 6, 17, 2), ...openings('window-wide', 'h', 14, 17, 2), ...openings('window-sash', 'h', 8, 17, 1),
      ...openings('window-sash', 'v', 5, 13, 1), ...openings('window-sash', 'v', 19, 15, 1), ...openings('window-sash', 'v', 5, 8, 1), ...openings('window-sash', 'v', 19, 8, 1),
      ...openings('window-high', 'h', 11, 7, 2),
    ],
    rooms: [
      { name: 'bedroom A', probe: { x: 7, z: 9 }, wall: P('plain-paint', 4), floor: P('carpet-plush', 3) },
      { name: 'bathroom', probe: { x: 12, z: 9 }, wall: P('subway-tile', 8), floor: P('checker-tile', 4) },
      { name: 'bedroom B', probe: { x: 16, z: 9 }, wall: P('plain-paint', 5), floor: P('carpet-plush', 7) },
      { name: 'living', probe: { x: 12, z: 14 }, wall: P('plain-paint', 2), floor: P('oak-planks', 3) },
    ],
    exterior: P('brick-classic', 5),
    featureWalls: Array.from({ length: 5 }, (_, i) => ({ dir: 'v' as const, x: 19, z: 12 + i, side: 'a' as const, finish: P('stripes-breton', 7) })),
    floorAreas: [area(5, 12, 10, 16, P('checker-tile', 4))],
    path: { to: { x: 12, z: 18 }, finish: P('stone-pavers', 3) },
    furniture,
  };
}

// ---------------------------------------------------------------------------------------------
// 3 Heron Row 4 (x 8..16, z 5..18): a narrow terrace house, bedrooms at the back, living-dining room in front
// ---------------------------------------------------------------------------------------------

function terrace(): HousePlan {
  const furniture: Furn[] = [
    // bedroom A
    F('bed-single-pine', 8, 5), F('cupboard-bedside', 9, 5), F('wardrobe-tall', 11, 6, 3), F('desk-oak', 9, 9), F('chair-desk', 9, 8), F('computer-desktop', 9, 9),
    // bedroom B
    F('bed-single-pine', 16, 5), F('cupboard-bedside', 15, 5), F('wardrobe-tall', 13, 5, 1), F('bookcase-open', 13, 8, 1), F('lamp-floor-round', 15, 10), F('rug-square', 14, 7),
    // kitchen
    F('fridge-standard', 8, 13, 2), F('counter-sink', 9, 13, 2), F('stove-basic', 10, 13, 2), F('counter-basic', 11, 13, 2), F('trash-can', 11, 11),
    // bathroom
    F('bathtub', 14, 11), F('toilet-basic', 16, 11), F('bathroom-sink', 13, 11),
    // living and dining
    F('tv-stand-low', 8, 15, 1), F('tv-flatscreen', 8, 15, 1), F('rug-rectangle', 9, 15), F('sofa-tweed', 11, 15, 3), F('side-table', 12, 15), F('bookcase-tall', 8, 18, 0), F('lamp-floor-round', 11, 18),
    F('table-dining-oak', 14, 15), ...line('chair-dining-oak', 14, 14, 2, 1, 0), ...line('chair-dining-oak', 14, 16, 2, 1, 0, 2), F('plant-potted', 16, 18), F('plant-potted', 13, 18),
    // front
    F('planter-raised', 9, 19), F('bench-garden', 13, 20), F('rug-doormat', 12, 19), F('shrub-round', 8, 21), F('shrub-round', 16, 21), F('lamp-floor-square', 10, 21),
  ];
  return {
    walls: [
      ...outline(8, 5, 17, 19),
      [{ x: 8, z: 11 }, { x: 17, z: 11 }], [{ x: 12, z: 5 }, { x: 12, z: 11 }], // bedrooms
      [{ x: 13, z: 11 }, { x: 13, z: 14 }], // bathroom
      [{ x: 8, z: 14 }, { x: 17, z: 14 }], // kitchen | living
    ],
    openings: [
      front(12, 19), inner('h', 10, 11), inner('h', 12, 11), inner('v', 13, 12), inner('h', 12, 14),
      ...openings('window-georgian', 'h', 9, 19, 2), ...openings('window-georgian', 'h', 14, 19, 2),
      ...openings('window-georgian', 'v', 8, 16, 2), ...openings('window-georgian', 'v', 17, 16, 2), ...openings('window-sash', 'v', 8, 8, 1), ...openings('window-sash', 'v', 17, 8, 1),
      ...openings('window-sash', 'h', 9, 5, 1), ...openings('window-sash', 'h', 15, 5, 1), ...openings('window-high', 'v', 17, 12, 1),
    ],
    rooms: [
      { name: 'bedroom A', probe: { x: 10, z: 8 }, wall: P('plain-paint', 7), floor: P('oak-planks', 4) },
      { name: 'bedroom B', probe: { x: 14, z: 8 }, wall: P('panel-shaker', 1), floor: P('oak-planks', 0) },
      { name: 'kitchen', probe: { x: 10, z: 12 }, wall: P('subway-tile', 5), floor: P('checker-tile', 2) },
      { name: 'bathroom', probe: { x: 15, z: 12 }, wall: P('subway-tile', 9), floor: P('hex-mosaic', 6) },
      { name: 'living room', probe: { x: 12, z: 16 }, wall: P('damask-classic', 1), floor: P('herringbone-parquet', 2) },
    ],
    exterior: P('brick-classic', 2),
    floorAreas: [area(8, 20, 16, 20, P('brick-paving', 1))],
    path: { to: { x: 12, z: 20 }, finish: P('brick-paving', 1) },
    furniture,
  };
}

// ---------------------------------------------------------------------------------------------
// 4 Marigold Flat (x 6..16, z 8..16): modern open plan with a bedroom and a bath in the corners
// ---------------------------------------------------------------------------------------------

function flat(): HousePlan {
  const furniture: Furn[] = [
    // bedroom
    F('bed-double-oak', 7, 8), F('nightstand-oak', 6, 8), F('nightstand-oak', 9, 8), F('wardrobe-tall', 10, 12, 2), F('lamp-floor-square', 6, 12),
    // bathroom
    F('toilet-square', 14, 8), F('shower-round', 16, 8), F('vanity-basin', 15, 10, 2), F('trash-can', 14, 10),
    // kitchen with breakfast bar
    F('fridge-built-in', 11, 8), F('counter-sink', 12, 8), F('stove-electric', 13, 8), F('dishwasher', 12, 10), F('counter-bar', 12, 12), F('counter-bar', 13, 12),
    ...line('stool-bar-square', 12, 13, 2, 1, 0, 2),
    // lounge
    F('sofa-modern', 9, 14, 1), F('table-coffee-glass', 11, 14, 1), F('tv-stand-low', 15, 14, 3), F('tv-flatscreen', 15, 14, 3), F('armchair-designer', 13, 15, 3),
    F('rug-rounded', 10, 14), F('plant-fern-pot', 13, 12), F('lamp-floor-round', 16, 13),
    // balcony and yard
    F('planter-raised', 7, 17), F('chair-adirondack', 13, 17), F('plant-potted', 9, 17), F('rug-doormat', 11, 17), F('shrub-round', 5, 17), F('shrub-round', 17, 17),
    F('tree-park', 3, 18), F('tree-park', 18, 19), F('lamp-floor-square', 9, 18),
  ];
  return {
    walls: [
      ...outline(6, 8, 17, 17),
      [{ x: 11, z: 8 }, { x: 11, z: 12 }], [{ x: 6, z: 12 }, { x: 11, z: 12 }], // bedroom
      [{ x: 14, z: 8 }, { x: 14, z: 11 }], [{ x: 14, z: 11 }, { x: 17, z: 11 }], // bathroom
    ],
    openings: [
      front(11, 17, 'door-modern-glass'), inner('h', 8, 12), inner('v', 14, 9),
      ...openings('window-picture', 'h', 7, 17, 3), ...openings('window-picture', 'h', 14, 17, 2),
      ...openings('window-slider', 'v', 6, 14, 2), ...openings('window-tall', 'v', 17, 13, 3), ...openings('window-clerestory', 'h', 7, 8, 3), ...openings('window-clerestory', 'h', 15, 8, 2),
    ],
    rooms: [
      { name: 'bedroom', probe: { x: 8, z: 10 }, wall: P('plain-paint', 2), floor: P('berber-loop-carpet', 2) },
      { name: 'bathroom', probe: { x: 15, z: 9 }, wall: P('tile-zellige', 0), floor: P('porcelain-large', 5) },
      { name: 'living', probe: { x: 12, z: 14 }, wall: P('plain-paint', 1), floor: P('concrete-polished', 1) },
    ],
    exterior: P('concrete-board-formed', 4),
    featureWalls: Array.from({ length: 5 }, (_, i) => ({ dir: 'h' as const, x: 11 + i, z: 8, side: 'b' as const, finish: P('subway-tile', 9) })),
    floorAreas: [area(11, 8, 13, 12, P('porcelain-large', 4))],
    path: { to: { x: 11, z: 18 }, finish: P('stone-pavers', 1) },
    furniture,
  };
}

// ---------------------------------------------------------------------------------------------
// 5 Hazelbank House (x 4..19, z 6..17): four rooms along the back, kitchen-dining west and living room east, play yard beside it
// ---------------------------------------------------------------------------------------------

function familyHouse(): HousePlan {
  const furniture: Furn[] = [
    // bedroom A (single bed, desk)
    F('bed-single-pine', 4, 6), F('nightstand-oak', 5, 6), F('wardrobe-tall', 7, 7, 3), F('desk-oak', 5, 9), F('chair-desk', 5, 8), F('laptop', 5, 9),
    // bathroom
    F('toilet-basic', 8, 6), F('bathtub', 9, 9, 0), F('bathroom-sink', 10, 6),
    // bedroom B (bunk bed, toys)
    F('bed-bunk-pine', 11, 6), F('wardrobe-tall', 14, 7, 3), F('toy-chest', 12, 10, 2), F('play-box', 14, 10, 2), F('rug-round', 12, 8), F('lamp-floor-round', 14, 6),
    // master bedroom
    F('bed-double-oak', 16, 6), F('nightstand-oak', 15, 6), F('nightstand-oak', 18, 6), F('crib-wood', 19, 6), F('wardrobe-tall', 19, 9, 3), F('rug-rectangle', 16, 8, 0), F('lamp-floor-round', 15, 10),
    // kitchen and dining
    F('fridge-side-by-side', 4, 12, 1), F('counter-basic', 4, 13, 1), F('counter-sink', 4, 14, 1), F('dishwasher', 4, 15, 1), F('stove-basic', 4, 16, 1),
    F('counter-bar', 7, 12), F('counter-bar', 8, 12), F('table-dining-oak', 7, 15), ...line('chair-dining-oak', 7, 14, 2, 1, 0), ...line('chair-dining-oak', 7, 16, 2, 1, 0, 2), F('trash-can', 10, 12),
    // living room
    F('tv-stand-low', 19, 13, 3), F('tv-flatscreen', 19, 13, 3), F('sofa-corner', 14, 13, 0), F('table-coffee', 16, 14), F('armchair-lounge', 12, 16, 0), F('bookcase-tall', 13, 12),
    F('rug-rectangle', 15, 16), F('lamp-floor-round', 19, 16), F('plant-potted', 11, 12),
    // porch and garden
    F('plant-potted', 10, 17), F('plant-potted', 14, 17), F('rug-doormat', 12, 18), F('bench-garden', 16, 18), F('grill-kettle', 5, 19), F('table-patio', 6, 20), ...line('chair-slatted', 6, 19, 2, 1, 0),
    F('swing-set', 21, 8), F('playground-slide', 21, 12), F('planter-raised', 21, 16), F('tree-park', 21, 19), F('tree-park', 1, 8), F('shrub-round', 3, 18), F('shrub-round', 20, 18),
    F('lamp-floor-square', 10, 20),
  ];
  return {
    walls: [
      ...outline(4, 6, 20, 18),
      [{ x: 4, z: 11 }, { x: 20, z: 11 }], [{ x: 8, z: 6 }, { x: 8, z: 11 }], [{ x: 11, z: 6 }, { x: 11, z: 11 }], [{ x: 15, z: 6 }, { x: 15, z: 11 }],
    ],
    openings: [
      front(12, 18), inner('h', 6, 11), inner('h', 9, 11), inner('h', 13, 11), inner('h', 17, 11),
      ...openings('window-sash', 'h', 5, 18, 3), ...openings('window-wide', 'h', 14, 18, 2), ...openings('window-sash', 'h', 18, 18, 1), ...openings('window-sash', 'h', 9, 18, 1),
      ...openings('window-sash', 'v', 4, 8, 1), ...openings('window-sash', 'v', 4, 13, 1), ...openings('window-sash', 'v', 20, 8, 1), ...openings('window-wide', 'v', 20, 14, 2),
      ...openings('window-high', 'h', 9, 6, 1), ...openings('window-sash', 'h', 12, 6, 1), ...openings('window-sash', 'h', 17, 6, 1), ...openings('window-sash', 'h', 6, 6, 1),
    ],
    rooms: [
      { name: 'bedroom A', probe: { x: 6, z: 8 }, wall: P('plain-paint', 3), floor: P('carpet-plush', 3) },
      { name: 'bathroom', probe: { x: 9, z: 8 }, wall: P('subway-tile', 3), floor: P('hex-mosaic', 1) },
      { name: 'kids room', probe: { x: 13, z: 8 }, wall: P('playful-clouds', 0), floor: P('carpet-plush', 5) },
      { name: 'master bedroom', probe: { x: 17, z: 8 }, wall: P('plain-paint', 4), floor: P('oak-planks', 1) },
      { name: 'kitchen and living', probe: { x: 12, z: 14 }, wall: P('beadboard-wainscot', 4), floor: P('oak-planks', 0) },
    ],
    exterior: P('panel-shiplap', 1),
    floorAreas: [
      area(4, 12, 9, 16, P('checker-tile', 5)), area(4, 19, 9, 22, P('timber-decking', 1)), area(20, 6, 23, 22, P('pea-gravel', 1)),
    ],
    path: { to: { x: 12, z: 19 }, finish: P('stone-pavers', 1) },
    furniture,
  };
}

const PLANS: ReadonlyArray<() => HousePlan> = [cottage, lodge, kestrel, terrace, flat, familyHouse];

/** Soft furnishings per home, so no two homes share the same coral sofa. */
const TINTS: ReadonlyArray<readonly Tint[]> = [
  [T('bed-double-oak', 'fabric', 'sage'), T('sofa-tweed', 'fabric', 'blush'), T('armchair-lounge', 'fabric', 'teal'), T('rug-rectangle', 'rug', 'sage'), T('rug-rounded', 'rug', 'blush'), T('chair-dining-oak', 'wood', 'whitewash'), T('table-dining-oak', 'wood', 'whitewash')],
  [T('bed-single-pine', 'fabric', 'navy'), T('sofa-tweed', 'fabric', 'mustard'), T('armchair-recliner', 'fabric', 'charcoal'), T('chair-desk', 'fabric', 'sage'), T('chair-dining-oak', 'wood', 'walnut'), T('table-dining-oak', 'wood', 'walnut')],
  [T('bed-single-pine', 'fabric', ['navy', 'teal']), T('sofa-modern', 'fabric', 'charcoal'), T('armchair-lounge', 'fabric', 'mustard'), T('chair-desk', 'fabric', ['teal', 'navy']), T('rug-rectangle', 'rug', 'charcoal'), T('chair-dining-oak', 'wood', 'natural-ash'), T('table-dining-oak', 'wood', 'natural-ash')],
  [T('bed-single-pine', 'fabric', ['sage', 'blush']), T('sofa-tweed', 'fabric', 'teal'), T('rug-rectangle', 'rug', 'mustard'), T('rug-square', 'rug', 'oat-tweed'), T('chair-desk', 'fabric', 'mustard')],
  [T('bed-double-oak', 'fabric', 'charcoal'), T('sofa-modern', 'fabric', 'oat-tweed'), T('armchair-designer', 'fabric', 'mustard'), T('rug-rounded', 'rug', 'charcoal'), T('chair-adirondack', 'wood', 'sage-paint')],
  [T('bed-double-oak', 'fabric', 'navy'), T('bed-single-pine', 'fabric', 'teal'), T('bed-bunk-pine', 'fabric', 'mustard'), T('crib-wood', 'fabric', 'blush'), T('sofa-corner', 'fabric', 'navy'), T('armchair-lounge', 'fabric', 'sage'), T('rug-rectangle', 'rug', ['sage', 'navy']), T('rug-round', 'rug', 'coral'), T('chair-desk', 'fabric', 'teal'), T('chair-dining-oak', 'wood', 'whitewash')],
];

/**
 * Builds and furnishes one of the neighbourhood's small homes on an empty 24 x 24 lot (at least 24 x 24; centred on bigger
 * ones): walls, doors, windows, wall and floor finishes, a paved path to the front door and furniture. `variant` picks the plan
 * (RESIDENTIAL_VARIANTS lists them; larger numbers wrap around). Throws on a lot that is not empty, too small or if any placement
 * is invalid or the finished home fails lotProblems().
 */
export function buildResidentialLot(state: WorldState, content: ContentDB, lotId: Id, variant: number): void {
  const lot = requireLot(state, lotId);
  const index = ((Math.trunc(variant) % PLANS.length) + PLANS.length) % PLANS.length;
  const label = `buildResidentialLot(${index})`;
  const { dx, dz } = planOffset(lot, 24, label);
  const placed = buildHouse(state, content, lot, withoutDecorOnEntry(content, lot, shiftPlan(PLANS[index]!(), dx, dz)), label);
  applyTints(content, placed, TINTS[index]!, label);
  finish(state, content, lot, label);
}
