// Generated houses for Milestone 1: the furnished starter home and the smaller neighbour house.
// Both are built from declarative plans (./housekit.ts) on an empty lot of at least 24 x 24 tiles whose
// entry is on the south edge; every furniture placement is validated and an invalid one throws.
//
// Starter home (house tiles x 5..18, z 5..16; north is up, the front door faces the street to the south):
//
//   z\x   5    6    7    8    9  | 10   11   12 | 13   14   15   16   17   18
//    5   NS  [BED BED]  NS  LMP | TL    .   SH |  .  [DESK+PC]  .  [BED  NS
//    6    .  [BED BED]   .   .  | SK+M  .    . |  .   CH    .    .  BED]  .
//    7    .   rug rug  rug   .  |  .    D    . |  .   rug  rug  rug   .    .
//    8    .   rug rug  rug   D  |  D    D    D |  D   rug  rug  rug   .    .
//    9   WR    .    .    .   .  |  D    .   PL |  .    .    .   WR   BK  LMP
//        -- main bedroom ---------- bath / hall --- second bedroom ------------
//   10   BK    .    .    .   .    D  | TR  FR   CO   ST   CO   SI   CO   CO
//   11    .   rug  rug   .   .    .  |  .   .    .    .    .    .    .    .
//   12  [TV   rug  rug   .  SOFA  D  |  D   .    .    .    .    .    .    .
//   13   RA]  rug  CT    .  SOFA] .  |  .   .    .   CH   CH    .    .    .
//   14    .    .    .    .   .    .  |  .   .    .  [TABLE  ]    .    .    .
//   15  LMP   AC    .    .   .    .  |  .   .    .   CH   CH    .    .    .
//   16    .    .    .    D   .   PL  |  .   .    .    .    .    .    .   PL
//        ------- living room -----------  kitchen with dining area -----------
//   17           PL  porch PL               (path south to the lot entry)
//
// D = door tiles kept clear, NS nightstand, WR wardrobe, BK bookcase, TL toilet, SH shower, SK sink with the
// mirror above it, CH chairs, CT coffee table, RA radio on the TV stand, AC armchair, PL plants,
// TR trash can, FR fridge, CO counters, ST stove, SI counter sink.

import type { ContentDB } from '../content/types';
import type { Id, WorldState } from '../core/types';
import { buildHouse, type HousePlan } from './housekit';
import { requireLot } from './lots';

const P = (design: string, palette = 0) => ({ design, palette });

/** The Milestone 1 starter home: living room, kitchen with dining area, bathroom, two bedrooms and a hall. */
export const STARTER_PLAN: HousePlan = {
  walls: [
    // exterior outline
    [{ x: 5, z: 5 }, { x: 19, z: 5 }],
    [{ x: 5, z: 17 }, { x: 19, z: 17 }],
    [{ x: 5, z: 5 }, { x: 5, z: 17 }],
    [{ x: 19, z: 5 }, { x: 19, z: 17 }],
    // bedroom wing / day rooms
    [{ x: 5, z: 10 }, { x: 19, z: 10 }],
    [{ x: 10, z: 5 }, { x: 10, z: 10 }],
    [{ x: 13, z: 5 }, { x: 13, z: 10 }],
    [{ x: 10, z: 8 }, { x: 13, z: 8 }],
    // living room / kitchen
    [{ x: 11, z: 10 }, { x: 11, z: 17 }],
  ],
  openings: [
    { dir: 'h', x: 8, z: 17, defId: 'door-glazed', flip: true }, // front door, swings in
    { dir: 'h', x: 10, z: 10, defId: 'door-panel' }, // hall -> living room
    { dir: 'v', x: 10, z: 8, defId: 'door-panel', flip: true }, // hall -> main bedroom
    { dir: 'v', x: 13, z: 8, defId: 'door-panel' }, // hall -> second bedroom
    { dir: 'h', x: 11, z: 8, defId: 'door-panel', flip: true }, // hall -> bathroom
    { dir: 'v', x: 11, z: 12, defId: 'door-panel' }, // living room -> kitchen
    // windows on exterior walls
    { dir: 'h', x: 6, z: 17, defId: 'window-wide' },
    { dir: 'h', x: 10, z: 17, defId: 'window-sash' },
    { dir: 'v', x: 5, z: 11, defId: 'window-sash' },
    { dir: 'v', x: 5, z: 15, defId: 'window-wide' },
    { dir: 'h', x: 14, z: 17, defId: 'window-wide' },
    { dir: 'h', x: 15, z: 17, defId: 'window-wide' },
    { dir: 'v', x: 19, z: 11, defId: 'window-sash' },
    { dir: 'v', x: 19, z: 14, defId: 'window-sash' },
    { dir: 'v', x: 5, z: 7, defId: 'window-sash' },
    { dir: 'h', x: 9, z: 5, defId: 'window-sash' },
    { dir: 'h', x: 11, z: 5, defId: 'window-sash' },
    { dir: 'h', x: 16, z: 5, defId: 'window-sash' },
    { dir: 'v', x: 19, z: 8, defId: 'window-sash' },
  ],
  rooms: [
    { name: 'living room', probe: { x: 7, z: 13 }, wall: P('plain-paint', 1), floor: P('oak-planks') },
    { name: 'kitchen', probe: { x: 14, z: 12 }, wall: P('subway-tile'), floor: P('checker-tile') },
    { name: 'bathroom', probe: { x: 11, z: 6 }, wall: P('subway-tile', 1), floor: P('hex-mosaic') },
    { name: 'main bedroom', probe: { x: 7, z: 8 }, wall: P('plain-paint', 2), floor: P('oak-planks', 1) },
    { name: 'second bedroom', probe: { x: 15, z: 8 }, wall: P('plain-paint', 3), floor: P('carpet-plush') },
    { name: 'hall', probe: { x: 11, z: 9 }, wall: P('plain-paint'), floor: P('oak-planks') },
  ],
  exterior: P('brick-classic'),
  // feature wall: the main bedroom's headboard wall
  featureWalls: [5, 6, 7, 8, 9].map((x) => ({ dir: 'h' as const, x, z: 5, side: 'b' as const, finish: P('stripes-regency') })),
  floorAreas: [{ x0: 7, z0: 17, x1: 9, z1: 18, finish: P('stone-pavers') }],
  path: { to: { x: 8, z: 19 }, finish: P('stone-pavers') },
  furniture: [
    // living room
    { defId: 'rug-rectangle', x: 6, z: 11, rot: 1 },
    { defId: 'tv-stand-low', x: 5, z: 12, rot: 1 },
    { defId: 'tv-flatscreen', x: 5, z: 12, rot: 1 },
    { defId: 'radio-retro', x: 5, z: 13, rot: 1 },
    { defId: 'sofa-tweed', x: 9, z: 12, rot: 3 },
    { defId: 'table-coffee', x: 7, z: 13, rot: 0 },
    { defId: 'armchair-lounge', x: 6, z: 15, rot: 2 },
    { defId: 'lamp-floor-round', x: 5, z: 15, rot: 0 },
    { defId: 'bookcase-open', x: 5, z: 10, rot: 0 },
    { defId: 'plant-potted', x: 10, z: 16, rot: 2 },
    // kitchen with dining area
    { defId: 'trash-can', x: 11, z: 10, rot: 0 },
    { defId: 'fridge-standard', x: 12, z: 10, rot: 0 },
    { defId: 'counter-basic', x: 13, z: 10, rot: 0 },
    { defId: 'stove-basic', x: 14, z: 10, rot: 0 },
    { defId: 'counter-basic', x: 15, z: 10, rot: 0 },
    { defId: 'counter-sink', x: 16, z: 10, rot: 0 },
    { defId: 'counter-basic', x: 17, z: 10, rot: 0 },
    { defId: 'counter-basic', x: 18, z: 10, rot: 0 },
    { defId: 'table-dining-oak', x: 14, z: 14, rot: 0 },
    { defId: 'chair-dining-oak', x: 14, z: 13, rot: 0 },
    { defId: 'chair-dining-oak', x: 15, z: 13, rot: 0 },
    { defId: 'chair-dining-oak', x: 14, z: 15, rot: 2 },
    { defId: 'chair-dining-oak', x: 15, z: 15, rot: 2 },
    { defId: 'plant-potted', x: 18, z: 16, rot: 2 },
    // hall
    { defId: 'plant-potted', x: 12, z: 9, rot: 3 },
    // bathroom
    { defId: 'toilet-basic', x: 10, z: 5, rot: 1 },
    { defId: 'shower-stall', x: 12, z: 5, rot: 0 },
    { defId: 'bathroom-sink', x: 10, z: 6, rot: 1 },
    { defId: 'bathroom-mirror', x: 10, z: 6, rot: 1 },
    // main bedroom
    { defId: 'bed-double-oak', x: 6, z: 5, rot: 0 },
    { defId: 'nightstand-oak', x: 5, z: 5, rot: 0 },
    { defId: 'nightstand-oak', x: 8, z: 5, rot: 0 },
    { defId: 'lamp-floor-round', x: 9, z: 5, rot: 0 },
    { defId: 'wardrobe-tall', x: 5, z: 9, rot: 1 },
    { defId: 'rug-rectangle', x: 6, z: 7, rot: 0 },
    // second bedroom (study corner)
    { defId: 'desk-oak', x: 14, z: 5, rot: 0 },
    { defId: 'chair-desk', x: 14, z: 6, rot: 2 },
    { defId: 'computer-desktop', x: 14, z: 5, rot: 0 },
    { defId: 'bed-single-pine', x: 17, z: 5, rot: 0 },
    { defId: 'nightstand-oak', x: 18, z: 5, rot: 0 },
    { defId: 'wardrobe-tall', x: 16, z: 9, rot: 2 },
    { defId: 'bookcase-open', x: 17, z: 9, rot: 2 },
    { defId: 'lamp-floor-round', x: 18, z: 9, rot: 0 },
    { defId: 'rug-rectangle', x: 14, z: 7, rot: 0 },
    // porch
    { defId: 'plant-potted', x: 7, z: 17, rot: 0 },
    { defId: 'plant-potted', x: 9, z: 17, rot: 0 },
  ],
};

// Neighbour house (house tiles x 7..16, z 8..15): bedroom and bathroom on the west side, an open-plan
// living room with a kitchen strip along the north wall and a small dining table.
//
//   z\x   7    8    9   10 | 11   12   13   14   15   16
//    8    .  [BED BED]  NS | BK   FR   CO   ST   SI   CO
//    9    .  [BED BED]   . |  .    .    .    .    .    .
//   10    .    .    .    D |  D    .   CH    .    .    .
//   11   WR    .    .    . |  .    .  [TABLE  ]    .    .
//   12   TL    .   SK+M  . |  .    .    .   CH    .    .
//   13    .    .    .    D |  D [SOFA  rug  rug  rug  TV
//   14    .    .    .    . |  .  SOFA] rug  rug  rug  RA]
//   15   SH    .    .    . | PL    .    .    D    .   LMP

/** The neighbour's smaller house. */
export const NEIGHBOR_PLAN: HousePlan = {
  walls: [
    [{ x: 7, z: 8 }, { x: 17, z: 8 }],
    [{ x: 7, z: 16 }, { x: 17, z: 16 }],
    [{ x: 7, z: 8 }, { x: 7, z: 16 }],
    [{ x: 17, z: 8 }, { x: 17, z: 16 }],
    [{ x: 11, z: 8 }, { x: 11, z: 16 }],
    [{ x: 7, z: 12 }, { x: 11, z: 12 }],
  ],
  openings: [
    { dir: 'h', x: 14, z: 16, defId: 'door-glazed', flip: true },
    { dir: 'v', x: 11, z: 10, defId: 'door-panel', flip: true },
    { dir: 'v', x: 11, z: 13, defId: 'door-panel', flip: true },
    { dir: 'v', x: 7, z: 10, defId: 'window-sash' },
    { dir: 'v', x: 7, z: 14, defId: 'window-sash' },
    { dir: 'h', x: 15, z: 8, defId: 'window-sash' },
    { dir: 'h', x: 12, z: 16, defId: 'window-wide' },
    { dir: 'h', x: 16, z: 16, defId: 'window-sash' },
    { dir: 'v', x: 17, z: 10, defId: 'window-sash' },
  ],
  rooms: [
    { name: 'bedroom', probe: { x: 8, z: 10 }, wall: P('plain-paint', 4), floor: P('carpet-plush', 1) },
    { name: 'bathroom', probe: { x: 8, z: 13 }, wall: P('subway-tile', 2), floor: P('hex-mosaic', 1) },
    { name: 'living room', probe: { x: 13, z: 13 }, wall: P('plain-paint', 5), floor: P('oak-planks', 2) },
  ],
  exterior: P('brick-classic', 1),
  floorAreas: [
    { x0: 11, z0: 8, x1: 16, z1: 9, finish: P('checker-tile', 1) },
    { x0: 13, z0: 16, x1: 15, z1: 17, finish: P('stone-pavers') },
  ],
  path: { to: { x: 14, z: 18 }, finish: P('stone-pavers') },
  furniture: [
    { defId: 'bed-double-oak', x: 8, z: 8, rot: 0 },
    { defId: 'nightstand-oak', x: 10, z: 8, rot: 0 },
    { defId: 'wardrobe-tall', x: 7, z: 11, rot: 1 },
    { defId: 'toilet-basic', x: 7, z: 12, rot: 1 },
    { defId: 'bathroom-sink', x: 9, z: 12, rot: 0 },
    { defId: 'bathroom-mirror', x: 9, z: 12, rot: 0 },
    { defId: 'shower-stall', x: 7, z: 15, rot: 1 },
    { defId: 'bookcase-open', x: 11, z: 8, rot: 0 },
    { defId: 'fridge-standard', x: 12, z: 8, rot: 0 },
    { defId: 'counter-basic', x: 13, z: 8, rot: 0 },
    { defId: 'stove-basic', x: 14, z: 8, rot: 0 },
    { defId: 'counter-sink', x: 15, z: 8, rot: 0 },
    { defId: 'counter-basic', x: 16, z: 8, rot: 0 },
    { defId: 'table-dining-oak', x: 13, z: 11, rot: 0 },
    { defId: 'chair-dining-oak', x: 13, z: 10, rot: 0 },
    { defId: 'chair-dining-oak', x: 14, z: 12, rot: 2 },
    { defId: 'rug-rectangle', x: 13, z: 13, rot: 0 },
    { defId: 'tv-stand-low', x: 16, z: 13, rot: 3 },
    { defId: 'tv-flatscreen', x: 16, z: 13, rot: 3 },
    { defId: 'radio-retro', x: 16, z: 14, rot: 3 },
    { defId: 'sofa-tweed', x: 12, z: 13, rot: 1 },
    { defId: 'plant-potted', x: 11, z: 15, rot: 2 },
    { defId: 'lamp-floor-round', x: 16, z: 15, rot: 0 },
  ],
};

function checkLot(state: WorldState, lotId: Id, label: string) {
  const lot = requireLot(state, lotId);
  if (lot.width < 24 || lot.depth < 24) throw new Error(`${label}: lot ${lotId} must be at least 24 x 24 tiles`);
  if (lot.entry.level !== 0) throw new Error(`${label}: the lot entry must be on the ground floor`);
  return lot;
}

/**
 * Builds and furnishes the Milestone 1 starter home on an empty lot (at least 24 x 24, entry on the south
 * edge): walls, doors, windows, wall and floor finishes, a paved path to the front door and furniture
 * from the shared M1 object ids. Throws when content is missing or any placement is invalid.
 */
export function furnishStarterHouse(state: WorldState, content: ContentDB, lotId: Id): void {
  const lot = checkLot(state, lotId, 'furnishStarterHouse');
  buildHouse(state, content, lot, STARTER_PLAN, 'furnishStarterHouse');
}

/** Builds and furnishes the smaller neighbour house on an empty lot (same requirements as the starter). */
export function furnishNeighborHouse(state: WorldState, content: ContentDB, lotId: Id): void {
  const lot = checkLot(state, lotId, 'furnishNeighborHouse');
  buildHouse(state, content, lot, NEIGHBOR_PLAN, 'furnishNeighborHouse');
}
