// Neighbourhood venue layouts (Milestone 7): the six public venues and, in ./homes.ts, the NPC homes. Every layout is a
// declarative HousePlan (./housekit.ts) applied to an empty lot with the same rules as the starter house: every furnishing
// is validated by validatePlacement, so a plan that does not fit throws and nothing half-built is used. The builders are
// deterministic and never touch the world rng.
//
// Lot sizes (world/neighbourhood.ts): park, arts centre and market 32 x 32, cafe, gym, library and every home 24 x 24, with the
// entry in the middle of the south edge. Layouts are written for that size; on a larger lot they are centred, and every
// venue throws on a lot smaller than its plan. A paved path always leads from the real entry to the front door.
//
// After building, lotProblems() re-checks the whole lot (the same rules the build editor uses): every door usable, every
// object slot reachable from the entry, no sealed-off floor, so nobody can be trapped or unable to use a thing.
//
//   cafe:    bar with service counters (coffee, pastries, sandwiches), coffee machine and tables, a lounge corner, restroom, terrace.
//   gym:     treadmills and weight benches on a rubber floor, showers and a restroom behind the hall, vending machines.
//   library: bookshelf walls, study desks with chairs, a computer desk, reading nook, restroom.
//   arts:    studio with easels, music hall with two pianos and rows of chairs, foyer, restroom, front garden.
//   market:  covered hall with a deli counter, cold shelves and a vending machine; produce stalls around a fountain square.
//   park:    lawns, a red jogging track, plaza with fountain, picnic grove, fenced playground, chess corner, benches and trees.

import type { ContentDB } from '../content/types';
import { newId } from '../core/ids';
import type { Id, Lot, Pool, WorldState } from '../core/types';
import { defaultRoofSpec } from '../building/exteriorPlans';
import { buildHouse, finishFor, type HousePlan } from './housekit';
import { finish } from './lotCheck';
import { requireLot } from './lots';
import { F, P, T, applyTints, area, line, openings, outline, planOffset, shiftPlan, withoutDecorOnEntry, type Furn, type Tint } from './planKit';
import { addWallRun } from './walls';
import type { VenueType } from './lotBuilders';

export { buildResidentialLot, RESIDENTIAL_VARIANTS } from './homes';
export { lotAscii, lotProblems } from './lotCheck';
export type { VenueType } from './lotBuilders';

// ---------------------------------------------------------------------------------------------
// Cafe (24 x 24): "Kettle & Crumb"
//
//   z\x  3 .. 6 | 7 8 9 10 | 11 12 13 14 15 16 | 17 .. 20          (building x 3..20, z 4..15; door at (12,16))
//    4   WC: toilet, sink | shelves, lamp | dishwasher, coffee, toaster, sink, blender, radio (back bar) | plants
//    6                      | service counters (12..14) and breakfast bar with stools (15..16)
//    8-10  four-tops (4, 8, 12) | sofa and coffee table (east lounge)
//   12-14  four-tops (4, 8, 12, 16)
//   16-21  timber terrace with two parasol tables, planters and shrubs; paved path to the lot entry
// ---------------------------------------------------------------------------------------------

function cafePlan(): HousePlan {
  const furniture: Furn[] = [
    // restroom
    F('toilet-basic', 3, 4), F('bathroom-sink', 5, 4), F('trash-can', 6, 6),
    // reading shelf and corner
    ...line('bookcase-tall', 8, 4, 3, 1, 0), F('lamp-floor-round', 7, 4), F('plant-potted', 11, 8),
    // back bar (staff side)
    F('dishwasher', 11, 4), F('counter-basic', 12, 4), F('coffee-machine', 12, 4), F('counter-drawers', 13, 4), F('toaster', 13, 4),
    F('counter-sink', 14, 4), F('counter-basic', 15, 4), F('blender', 15, 4), F('counter-basic', 16, 4), F('radio-retro', 16, 4),
    F('plant-potted', 19, 4),
    // customer counter and breakfast bar
    ...line('service-counter', 12, 6, 3, 1, 0), F('counter-bar', 15, 6), F('counter-bar', 16, 6),
    F('stool-bar', 15, 7, 2), F('stool-bar', 16, 7, 2),
    // first row of four-tops: tables at z=9 with chairs on both long sides
    ...[4, 8, 12].flatMap((x) => [
      F('table-dining-oak', x, 9),
      F('chair-dining-oak', x, 8), F('chair-dining-oak', x + 1, 8),
      F('chair-dining-oak', x, 10, 2), F('chair-dining-oak', x + 1, 10, 2),
    ]),
    // second row
    ...[4, 8, 12, 16].flatMap((x) => [
      F('table-dining-oak', x, 13),
      F('chair-dining-oak', x, 12), F('chair-dining-oak', x + 1, 12),
      F('chair-dining-oak', x, 14, 2), F('chair-dining-oak', x + 1, 14, 2),
    ]),
    // east lounge
    F('sofa-modern', 19, 8, 3), F('table-coffee', 17, 8), F('armchair-lounge', 15, 9, 1), F('lamp-floor-round', 20, 11), F('plant-potted', 19, 12),
    // terrace
    F('table-patio', 5, 18), ...line('chair-slatted', 5, 17, 2, 1, 0), ...line('chair-slatted', 5, 20, 2, 1, 0, 2),
    F('table-patio', 16, 18), ...line('chair-slatted', 16, 17, 2, 1, 0), ...line('chair-slatted', 16, 20, 2, 1, 0, 2),
    F('planter-raised', 8, 16), F('planter-raised', 14, 16), F('shrub-round', 3, 17), F('shrub-round', 20, 17),
    F('lamp-floor-square', 10, 17), F('lamp-floor-square', 14, 18), F('rug-doormat', 12, 16),
    F('tree-park', 0, 18), F('tree-park', 22, 18),
  ];
  return {
    walls: [
      ...outline(3, 4, 21, 16),
      [{ x: 7, z: 4 }, { x: 7, z: 7 }], [{ x: 3, z: 7 }, { x: 7, z: 7 }], // restroom
    ],
    openings: [
      { dir: 'h', x: 12, z: 16, defId: 'door-glazed', flip: true }, // front door
      { dir: 'h', x: 4, z: 7, defId: 'door-panel', flip: true }, // restroom
      ...openings('window-picture', 'h', 4, 16, 2), ...openings('window-wide', 'h', 7, 16, 3), ...openings('window-picture', 'h', 15, 16, 2),
      ...openings('window-wide', 'h', 18, 16, 3),
      ...openings('window-sash', 'v', 3, 9, 2), ...openings('window-sash', 'v', 3, 13, 2),
      ...openings('window-picture', 'v', 21, 9, 2), ...openings('window-picture', 'v', 21, 13, 2),
      ...openings('window-clerestory', 'h', 8, 4, 3), ...openings('window-sash', 'h', 18, 4, 2),
      { dir: 'v', x: 3, z: 5, defId: 'window-high' },
    ],
    rooms: [
      { name: 'cafe', probe: { x: 10, z: 11 }, wall: P('beadboard-wainscot', 1), floor: P('checker-tile', 5) },
      { name: 'restroom', probe: { x: 4, z: 5 }, wall: P('subway-tile', 3), floor: P('hex-mosaic', 3) },
    ],
    exterior: P('brick-classic', 0),
    featureWalls: Array.from({ length: 9 }, (_, i) => ({ dir: 'h' as const, x: 12 + i, z: 4, side: 'b' as const, finish: P('tile-zellige', 1) })),
    floorAreas: [
      area(2, 17, 21, 22, P('brick-paving', 1)), // forecourt
      area(11, 4, 20, 5, P('quarry-tile', 1)), // behind the counter
      area(4, 17, 20, 21, P('timber-decking', 0)), // terrace
    ],
    path: { to: { x: 12, z: 17 }, finish: P('stone-pavers', 1) },
    furniture,
  };
}

// ---------------------------------------------------------------------------------------------
// Gym (24 x 24): "Foundry Fitness"
//
//   z\x  3 ........... 14 | 15 .. 20
//    4   treadmills (4..8), weight benches (10, 12, 14)     | showers (16..19), lockers
//    9   rugs, speaker, second row of benches (z 11..12)    | restroom (z 9..12)
//   13   lobby: benches, vending machines, coat rack (L-shaped hall continues east at z 13..15)
// ---------------------------------------------------------------------------------------------

function gymPlan(): HousePlan {
  const furniture: Furn[] = [
    // cardio row
    ...line('treadmill', 4, 4, 5, 1, 0),
    // weights
    ...line('weight-bench', 10, 4, 3, 2, 0), ...line('weight-bench', 4, 11, 3, 2, 0, 2),
    F('rug-rectangle', 10, 8), F('speaker-tower', 14, 9, 3), F('bench-low-cushion', 13, 11, 3), F('plant-potted', 14, 12), F('lamp-floor-square', 3, 9),
    // lobby
    F('bench-cushion', 3, 16, 2), F('bench-cushion', 4, 16, 2), F('coat-rack-standing', 6, 16), F('plant-potted', 8, 16),
    F('vending-machine', 14, 16, 2), F('vending-machine', 15, 16, 2), F('plant-potted', 17, 15), F('trash-can', 19, 16),
    // showers and lockers
    ...line('shower-stall', 16, 4, 4, 1, 0), F('locker-bank', 20, 4), ...line('locker-bank', 20, 6, 3, 0, 1, 3),
    F('bench-low-cushion', 16, 7), F('bench-low-cushion', 17, 7),
    // restroom
    F('toilet-basic', 16, 9), F('toilet-basic', 18, 9), F('bathroom-sink', 20, 9), F('trash-can', 17, 12),
  ];
  return {
    walls: [
      ...outline(3, 4, 21, 17),
      [{ x: 15, z: 4 }, { x: 15, z: 13 }], [{ x: 15, z: 13 }, { x: 21, z: 13 }], [{ x: 15, z: 9 }, { x: 21, z: 9 }],
    ],
    openings: [
      { dir: 'h', x: 12, z: 17, defId: 'door-modern-glass', flip: true },
      { dir: 'v', x: 15, z: 6, defId: 'door-flush', flip: true }, // showers
      { dir: 'v', x: 15, z: 11, defId: 'door-flush', flip: true }, // restroom
      ...openings('window-steel-grid', 'h', 4, 17, 3), ...openings('window-steel-grid', 'h', 8, 17, 3), ...openings('window-steel-grid', 'h', 16, 17, 3),
      ...openings('window-clerestory', 'h', 4, 4, 5), ...openings('window-clerestory', 'h', 10, 4, 5),
      ...openings('window-steel-grid', 'v', 3, 6, 2), ...openings('window-steel-grid', 'v', 3, 12, 2),
      ...openings('window-clerestory', 'v', 21, 5, 3), ...openings('window-high', 'v', 21, 10, 2),
    ],
    rooms: [
      { name: 'training hall', probe: { x: 8, z: 8 }, wall: P('brick-classic', 5), floor: P('concrete-polished', 0) },
      { name: 'showers', probe: { x: 17, z: 6 }, wall: P('subway-tile', 8), floor: P('hex-mosaic', 6) },
      { name: 'restroom', probe: { x: 17, z: 11 }, wall: P('subway-tile', 0), floor: P('penny-round-tile', 0) },
    ],
    exterior: P('corrugated-metal', 1),
    featureWalls: Array.from({ length: 11 }, (_, i) => ({ dir: 'h' as const, x: 4 + i, z: 4, side: 'b' as const, finish: P('brick-classic', 8) })),
    floorAreas: [
      area(2, 18, 21, 22, P('exposed-aggregate', 1)), // forecourt
      area(4, 10, 9, 13, P('marbled-linoleum', 6)), // rubber weights zone
      area(10, 4, 14, 6, P('marbled-linoleum', 6)),
      area(3, 14, 20, 16, P('vinyl-plank', 5)), // lobby
      area(12, 17, 12, 17, P('stone-pavers', 4)),
    ],
    path: { to: { x: 12, z: 18 }, finish: P('stone-pavers', 3) },
    furniture: [...furniture, F('shrub-round', 4, 18), F('shrub-round', 5, 18), F('shrub-round', 19, 18), F('shrub-round', 20, 18), F('lamp-floor-square', 10, 18), F('lamp-floor-square', 14, 18)],
  };
}

// ---------------------------------------------------------------------------------------------
// Library (24 x 24): "Pagebridge Library"
//
//   z\x  3 .. 16 | 17 .. 20
//    4   bookcases along the north wall           | restroom (x 17..20, z 4..7)
//    6   west wall of bookcases, east wall too
//    8   study desks (x 5..6, 8..9 and 15..16, 18..19), chairs at z 9
//   11   second row of desks, chairs at z 12
//   14   reading nook (SW), librarian counter (14..16), computer desk (18..19)
// ---------------------------------------------------------------------------------------------

function libraryPlan(): HousePlan {
  const desks = [5, 8, 14, 17].flatMap((x) => [8, 11].flatMap((z) => [
    F('desk-oak', x, z), F('study-notes', x, z), F('study-notes', x + 1, z),
    F('chair-desk', x, z + 1, 2), F('chair-desk', x + 1, z + 1, 2),
  ]));
  const furniture: Furn[] = [
    // shelves
    ...line('bookcase-tall', 4, 4, 9, 1, 0), F('bookcase-wide', 13, 4), F('bookcase-wide', 15, 4),
    ...line('bookcase-tall', 3, 6, 6, 0, 1, 1), ...line('bookcase-tall', 20, 9, 4, 0, 1, 3),
    // study desks
    ...desks,
    // computer desk
    F('desk-oak', 18, 14), F('computer-desktop', 18, 14), F('laptop', 19, 14), F('chair-desk', 18, 15, 2), F('chair-desk', 19, 15, 2),
    // librarian counter by the door
    F('counter-bar', 14, 14), F('counter-bar', 15, 14), F('counter-bar', 16, 14), F('books-stack', 15, 14),
    // reading nook
    F('table-coffee', 4, 14), F('armchair-lounge', 6, 14, 3), F('sofa-tweed', 4, 16, 2), F('lamp-floor-round', 3, 16), F('lamp-floor-round', 7, 16),
    F('rug-rounded', 4, 14),
    // entrance and restroom
    F('vending-machine', 17, 16, 2), F('bench-cushion', 9, 16, 2), F('bench-cushion', 10, 16, 2), F('plant-potted', 14, 16), F('plant-potted', 3, 13),
    F('toilet-basic', 17, 4), F('bathroom-sink', 20, 4),
    // front garden
    F('shrub-round', 4, 18), F('shrub-round', 5, 18), F('shrub-round', 19, 18), F('shrub-round', 20, 18), F('bench-garden', 7, 19), F('bench-garden', 15, 19),
    F('lamp-floor-square', 10, 18), F('lamp-floor-square', 14, 18), F('tree-park', 1, 18), F('tree-park', 21, 18),
  ];
  return {
    walls: [...outline(3, 4, 21, 17), [{ x: 17, z: 4 }, { x: 17, z: 8 }], [{ x: 17, z: 8 }, { x: 21, z: 8 }]],
    openings: [
      { dir: 'h', x: 12, z: 17, defId: 'door-glazed', flip: true },
      { dir: 'v', x: 17, z: 6, defId: 'door-panel', flip: true },
      ...openings('window-tall', 'h', 4, 17, 3), ...openings('window-tall', 'h', 7, 17, 2), ...openings('window-tall', 'h', 15, 17, 2), ...openings('window-tall', 'h', 18, 17, 2),
      ...openings('window-tall', 'v', 3, 12, 2), ...openings('window-georgian', 'v', 21, 10, 3), ...openings('window-high', 'v', 21, 5, 2),
    ],
    rooms: [
      { name: 'reading room', probe: { x: 12, z: 11 }, wall: P('library-shelves', 1), floor: P('oak-wide-boards', 1) },
      { name: 'restroom', probe: { x: 18, z: 5 }, wall: P('subway-tile', 4), floor: P('hex-mosaic', 5) },
    ],
    exterior: P('stone-ashlar', 1),
    floorAreas: [
      area(2, 18, 21, 22, P('stone-pavers', 1)), // forecourt
      area(3, 13, 8, 16, P('carpet-plush', 6)), // reading nook
      area(9, 16, 10, 16, P('herringbone-parquet', 5)),
    ],
    path: { to: { x: 12, z: 18 }, finish: P('stone-pavers', 1) },
    furniture,
  };
}


// ---------------------------------------------------------------------------------------------
// Arts centre (32 x 32): "Lantern Hall"
//
//   z\x  5 ... 13 | 14 ........ 26                 (building x 5..26, z 8..24; door at (16,25))
//    8   studio: easels under a mural | music hall: stage with two pianos (z 8..11), chairs facing it (z 13, 16)
//   19   ---- doors ---- foyer: lounge, vending machine, benches; restroom in the east corner ----
//   25+  front garden: shrubs, benches, two easels on the lawn, trees, lanterns
// ---------------------------------------------------------------------------------------------

function artsPlan(): HousePlan {
  const furniture: Furn[] = [
    // studio
    ...line('easel-studio', 6, 8, 4, 2, 0), ...line('easel-studio', 7, 14, 2, 3, 0), F('table-trestle', 6, 11), F('books-stack', 6, 11), F('plant-potted', 5, 18),
    F('lamp-floor-square', 13, 8), F('bench-cushion', 12, 17, 2), F('table-coffee', 11, 12), F('plant-potted', 13, 17), F('speaker-shelf', 7, 11),
    // music hall
    F('piano-upright', 16, 8), F('chair-modern-cushion', 17, 9, 2), F('piano-upright', 21, 8), F('chair-modern-cushion', 22, 9, 2),
    F('lamp-floor-round', 15, 8), F('lamp-floor-round', 25, 8), F('plant-potted', 25, 11),
    ...line('chair-dining-cushion', 16, 13, 4, 1, 0, 2), ...line('chair-dining-cushion', 21, 13, 4, 1, 0, 2),
    ...line('chair-dining-cushion', 16, 16, 4, 1, 0, 2), ...line('chair-dining-cushion', 21, 16, 4, 1, 0, 2),
    F('sofa-tweed', 26, 12, 3), F('sofa-tweed', 26, 15, 3), F('rug-rectangle', 16, 11),
    // foyer
    F('vending-machine', 8, 24, 2), F('bench-cushion', 6, 24, 2), F('bench-cushion', 7, 24, 2), F('coat-rack-standing', 11, 23), F('plant-potted', 5, 20),
    F('armchair-lounge', 16, 22, 1), F('table-coffee-glass', 18, 22), F('armchair-lounge', 21, 22, 3), F('sofa-modern', 18, 24, 2),
    F('plant-potted', 13, 20), F('lamp-floor-round', 22, 24), F('rug-rounded', 17, 20),
    // restroom
    F('toilet-basic', 24, 20), F('bathroom-sink', 25, 20), F('toilet-basic', 26, 20), F('trash-can', 26, 24),
    // front garden
    ...[5, 7, 9, 11, 13, 19, 21, 23].map((x) => F('shrub-round', x, 25)), F('shrub-round', 25, 25), F('shrub-round', 26, 25),
    F('bench-garden', 12, 28), F('bench-garden', 19, 28), F('easel-studio', 22, 27), F('easel-studio', 24, 27),
    F('tree-park', 5, 28), F('tree-park', 27, 29), F('tree-park', 2, 22), F('tree-park', 29, 18), F('tree-park', 29, 10), F('tree-park', 2, 12),
    F('lamp-floor-square', 14, 27), F('lamp-floor-square', 18, 27), F('lamp-floor-square', 14, 26), F('lamp-floor-square', 18, 26),
    F('fountain-park', 8, 28), F('planter-raised', 22, 29), F('planter-raised', 24, 29),
  ];
  return {
    walls: [
      ...outline(5, 8, 27, 25),
      [{ x: 14, z: 8 }, { x: 14, z: 19 }], [{ x: 5, z: 19 }, { x: 27, z: 19 }], // studio | music hall, foyer
      [{ x: 23, z: 19 }, { x: 23, z: 25 }], // restroom
    ],
    openings: [
      { dir: 'h', x: 16, z: 25, defId: 'door-modern-glass', flip: true },
      { dir: 'h', x: 9, z: 19, defId: 'door-glazed', flip: true }, // studio
      { dir: 'h', x: 20, z: 19, defId: 'door-glazed', flip: true }, // music hall
      { dir: 'v', x: 23, z: 22, defId: 'door-panel', flip: true }, // restroom
      ...openings('window-tall', 'h', 6, 25, 3), ...openings('window-tall', 'h', 11, 25, 3), ...openings('window-tall', 'h', 18, 25, 3), ...openings('window-tall', 'h', 21, 25, 2),
      ...openings('window-georgian', 'v', 5, 12, 3), ...openings('window-georgian', 'v', 5, 22, 2),
      ...openings('window-clerestory', 'h', 7, 8, 5), ...openings('window-clerestory', 'h', 16, 8, 9),
      ...openings('window-picture', 'v', 27, 11, 2), ...openings('window-picture', 'v', 27, 15, 2),
      ...openings('window-sash', 'v', 27, 21, 2), ...openings('window-high', 'h', 24, 25, 2),
    ],
    rooms: [
      { name: 'studio', probe: { x: 9, z: 12 }, wall: P('plain-paint', 1), floor: P('terrazzo-venetian', 0) },
      { name: 'music hall', probe: { x: 20, z: 14 }, wall: P('two-tone-dado', 6), floor: P('oak-wide-boards', 5) },
      { name: 'foyer', probe: { x: 12, z: 21 }, wall: P('limewash-plaster', 1), floor: P('porcelain-large', 1) },
      { name: 'restroom', probe: { x: 25, z: 22 }, wall: P('subway-tile', 3), floor: P('penny-round-tile', 4) },
    ],
    exterior: P('limewash-plaster', 5),
    featureWalls: Array.from({ length: 9 }, (_, i) => ({ dir: 'h' as const, x: 5 + i, z: 8, side: 'b' as const, finish: P('mural-hills', 2) })),
    floorAreas: [
      area(15, 8, 25, 11, P('parquet-chevron', 6)), // stage
      area(5, 26, 26, 30, P('lawn-turf', 0)), // front lawn
      area(15, 26, 17, 30, P('stone-pavers', 1)), // front path
    ],
    path: { to: { x: 16, z: 26 }, finish: P('stone-pavers', 1) },
    furniture,
  };
}

// ---------------------------------------------------------------------------------------------
// Market (32 x 32): "Greengage Market"
//
//   z\x  6 ........ 25         (covered hall x 6..25, z 5..13; door at (16,14))
//    5   cold cabinets (7..10) | back bar (19..22)
//    7                           deli counter (19..21) with a coffee machine behind
//    9   shelving units | produce tables (20, 23) at z 11
//   15+  cobbled square: six produce stalls facing the central lane, benches, trees, a fountain
// ---------------------------------------------------------------------------------------------

function marketPlan(): HousePlan {
  const furniture: Furn[] = [
    // hall: cold cabinets and shelving
    ...line('fridge-side-by-side', 7, 5, 3, 1, 0), F('fridge-compact', 10, 5),
    ...[7, 10].flatMap((x) => [9, 11].flatMap((z) => [F('media-cabinet-doors', x, z), F('plant-fern-pot', x, z)])),
    F('bookcase-low', 13, 6), F('bookcase-low', 14, 6), F('plant-potted', 13, 9), F('trash-can', 6, 13),
    // deli bar
    F('counter-basic', 19, 5), F('coffee-machine', 19, 5), F('counter-drawers', 20, 5), F('toaster', 20, 5), F('counter-sink', 21, 5), F('counter-basic', 22, 5), F('blender', 22, 5),
    ...line('service-counter', 19, 7, 3, 1, 0),
    // produce tables in the hall, vending machine, seating
    F('produce-stand', 20, 11, 2), F('produce-stand', 23, 11, 2), F('vending-machine', 24, 13, 2), F('bench-cushion', 7, 13, 2), F('bench-cushion', 8, 13, 2),
    F('plant-potted', 25, 7), F('lamp-floor-round', 25, 9),
    // outdoor stalls facing the central lane
    ...[18, 22, 26].map((z) => F('produce-stand', 7, z, 1)), ...[18, 22, 26].map((z) => F('produce-stand', 24, z, 3)),
    // square
    F('fountain-park', 15, 22), F('bench-garden', 12, 19, 1), F('bench-garden', 18, 19, 3), F('bench-garden', 12, 25, 1), F('bench-garden', 18, 25, 3),
    ...[10, 21].flatMap((x) => [16, 28].map((z) => F('shrub-round', x, z))), F('tree-park', 3, 16), F('tree-park', 28, 16), F('tree-park', 3, 24), F('tree-park', 28, 24),
    F('tree-park', 10, 29), F('tree-park', 21, 29), F('planter-raised', 4, 29), F('planter-raised', 26, 29),
    F('lamp-floor-square', 14, 16), F('lamp-floor-square', 18, 16), F('lamp-floor-square', 14, 28), F('lamp-floor-square', 18, 28),
    F('trash-can', 13, 21), F('trash-can', 19, 21), F('rug-doormat', 16, 14),
  ];
  return {
    walls: outline(6, 5, 26, 14),
    openings: [
      { dir: 'h', x: 16, z: 14, defId: 'door-glazed', flip: true },
      ...openings('window-wide', 'h', 8, 14, 3), ...openings('window-wide', 'h', 12, 14, 3), ...openings('window-wide', 'h', 18, 14, 3), ...openings('window-wide', 'h', 22, 14, 3),
      ...openings('window-clerestory', 'h', 7, 5, 4), ...openings('window-clerestory', 'h', 12, 5, 5), ...openings('window-clerestory', 'h', 23, 5, 2),
      ...openings('window-picture', 'v', 6, 8, 3), ...openings('window-picture', 'v', 26, 9, 3),
    ],
    rooms: [{ name: 'market hall', probe: { x: 14, z: 10 }, wall: P('panel-shiplap', 3), floor: P('quarry-tile', 1) }],
    exterior: P('panel-shiplap', 5),
    featureWalls: Array.from({ length: 4 }, (_, i) => ({ dir: 'h' as const, x: 19 + i, z: 5, side: 'b' as const, finish: P('tile-penny', 0) })),
    floorAreas: [
      area(7, 15, 24, 30, P('granite-cobbles', 5)), // the square
      area(15, 15, 16, 30, P('brick-paving', 1)), // central lane
      area(11, 16, 20, 28, P('granite-cobbles', 0)),
    ],
    path: { to: { x: 16, z: 15 }, finish: P('brick-paving', 1) },
    furniture,
  };
}

// ---------------------------------------------------------------------------------------------
// Park (32 x 32): "Lakeside Park" (lawns, a red jogging track, a cobbled plaza with a fountain)
//
//   NW chess corner and trees | north lawn with Adirondack chairs | NE fenced playground (slide, swings, toys)
//   W path ---------------- plaza (x 11..20, z 11..20) with fountain and benches ---------------- E path
//   SW picnic grove: two parasol tables, grills | entry lane (x 15..16) with a kiosk | SE flower garden
// ---------------------------------------------------------------------------------------------

function parkPlan(): HousePlan {
  const furniture: Furn[] = [
    // plaza
    F('fountain-park', 15, 15),
    F('bench-garden', 13, 12), F('bench-garden', 17, 12), F('bench-garden', 13, 19, 2), F('bench-garden', 17, 19, 2),
    F('bench-garden', 12, 14, 1), F('bench-garden', 12, 16, 1), F('bench-garden', 19, 14, 3), F('bench-garden', 19, 16, 3),
    F('shrub-round', 11, 11), F('shrub-round', 20, 11), F('shrub-round', 11, 20), F('shrub-round', 20, 20),
    F('lamp-floor-square', 14, 11), F('lamp-floor-square', 18, 11), F('lamp-floor-square', 14, 20), F('lamp-floor-square', 18, 20),
    F('trash-can', 12, 11), F('trash-can', 19, 20),
    // chess corner (NW)
    F('table-chess', 8, 8), F('chair-slatted', 7, 8, 1), F('chair-slatted', 9, 8, 3), F('table-chess', 8, 11), F('chair-slatted', 7, 11, 1), F('chair-slatted', 9, 11, 3),
    F('bench-garden', 6, 13), F('tree-park', 5, 5), F('tree-park', 9, 5), F('tree-park', 11, 8), F('shrub-round', 6, 9), F('shrub-round', 10, 13),
    // cloud-watching lawn (N)
    F('chair-adirondack', 14, 7), F('chair-adirondack', 16, 7), F('chair-adirondack', 18, 7), F('chair-adirondack', 20, 8), F('chair-adirondack', 22, 5),
    F('bench-garden', 13, 9), F('bench-garden', 18, 9), F('tree-park', 12, 5), F('tree-park', 19, 5), F('planter-raised', 15, 9),
    // playground (NE, fenced)
    F('playground-slide', 22, 7), F('swing-set', 25, 7), F('play-box', 25, 12), F('toy-chest', 26, 12), F('bench-garden', 22, 12), F('shrub-round', 23, 10), F('trash-can', 22, 10),
    // picnic grove (SW)
    F('table-patio', 7, 19), ...line('chair-slatted', 7, 18, 2, 1, 0), ...line('chair-slatted', 7, 21, 2, 1, 0, 2),
    F('table-patio', 7, 24), ...line('chair-slatted', 7, 23, 2, 1, 0), ...line('chair-slatted', 7, 26, 2, 1, 0, 2),
    F('grill-kettle', 11, 22), F('grill-kettle', 11, 25), F('tree-park', 5, 21), F('tree-park', 12, 27), F('tree-park', 5, 25), F('trash-can', 10, 23),
    // flower garden (SE)
    F('planter-raised', 22, 20), F('planter-raised', 22, 22), F('planter-raised', 25, 20), F('planter-raised', 25, 22),
    F('bench-garden', 22, 24), F('bench-garden', 24, 25), F('shrub-round', 21, 23), F('shrub-round', 26, 23), F('shrub-round', 21, 25), F('tree-park', 22, 27),
    // east path
    F('shrub-round', 22, 14), F('shrub-round', 22, 17), F('lamp-floor-square', 24, 14), F('lamp-floor-square', 24, 17),
    // kiosk by the entry lane
    F('service-counter', 13, 24, 1), F('service-counter', 13, 25, 1), F('stool-bar', 12, 24, 1), F('stool-bar', 12, 25, 1),
    F('lamp-floor-square', 14, 27), F('lamp-floor-square', 17, 27), F('trash-can', 17, 25),
    // edge trees outside the track
    ...[5, 10, 15, 20, 25].flatMap((v) => [F('tree-park', 0, v), F('tree-park', 30, v)]),
    ...[8, 13, 18, 23, 28].map((x) => F('tree-park', x, 0)), ...[3, 7, 24, 28].map((x) => F('tree-park', x, 30)),
  ];
  const lane = P('stone-pavers', 1);
  return {
    walls: [],
    openings: [],
    rooms: [],
    exterior: P('brick-classic', 0),
    floorAreas: [
      // jogging track (2 tiles wide, red)
      area(3, 3, 28, 4, P('brick-paving', 0)), area(3, 27, 28, 28, P('brick-paving', 0)), area(3, 5, 4, 26, P('brick-paving', 0)), area(27, 5, 28, 26, P('brick-paving', 0)),
      // plaza and the paths that meet there
      area(11, 11, 20, 20, P('granite-cobbles', 0)),
      area(15, 21, 16, 30, lane), area(15, 5, 16, 10, lane), area(5, 15, 10, 16, lane), area(21, 15, 26, 16, lane),
      // playground ground
      area(22, 6, 26, 13, P('pea-gravel', 1)),
      // picnic and chess terraces
      area(6, 18, 12, 26, P('pea-gravel', 2)), area(6, 7, 10, 12, P('pea-gravel', 2)),
    ],
    path: { to: { x: 16, z: 21 }, finish: lane },
    furniture,
  };
}

/** Low picket fence around the playground (x 21..27, z 6..14) with a gate gap on the south side. */
function fencePlayground(content: ContentDB, lot: Lot, dx: number, dz: number): void {
  const finish = finishFor(content, 'wall', P('panel-slat', 3));
  const both = { a: finish, b: finish };
  const v = (x: number, z0: number, z1: number) => addWallRun(lot, 0, { x: x + dx, z: z0 + dz }, { x: x + dx, z: z1 + dz }, both, 1.1);
  const h = (z: number, x0: number, x1: number) => addWallRun(lot, 0, { x: x0 + dx, z: z + dz }, { x: x1 + dx, z: z + dz }, both, 1.1);
  h(6, 21, 27); v(21, 6, 14); v(27, 6, 14); h(14, 21, 23); h(14, 25, 27); // gate: x 23..24 on the south side
}

// ---------------------------------------------------------------------------------------------
// Swimming pool (32 x 32): "Quayside Baths"
//
//   z\x  6 .. 14 (pool hall) | 16 .. 26 (east wing)
//    6   north deck             | changing room: lockers, benches, mirrors
//    8   pool x 7..12, z 8..17  | changing room continues
//   13                           | ---- wall ---- showers (x 16..19), drying bench
//   18   south deck              | showers continues
//   20                           | ---- wall ----
//   21+  corridor and lobby: benches, vending machine, plants; the front door is at (16,26)
//   27+  outdoor sun deck with loungers, planters and trees; paved lane to the lot entry
// ---------------------------------------------------------------------------------------------

function poolPlan(): HousePlan {
  const furniture: Furn[] = [
    // changing room
    ...line('locker-bank', 17, 6, 4, 1, 0), F('bench-low-cushion', 17, 8), F('bench-low-cushion', 18, 8),
    F('bathroom-mirror', 21, 6), F('bathroom-sink', 21, 7), F('toilet-basic', 24, 6), F('trash-can', 25, 6), F('plant-potted', 25, 8), F('rug-doormat', 15, 9),
    // showers
    ...line('shower-stall', 16, 14, 4, 1, 0), F('bench-low-cushion', 22, 14), F('trash-can', 25, 15), F('plant-fern-pot', 25, 18),
    // lobby: benches, vending, coat rack, plants
    F('bench-cushion', 7, 24, 2), F('bench-cushion', 8, 24, 2), F('vending-machine', 23, 21, 2), F('vending-machine', 24, 21, 2),
    F('coat-rack-standing', 14, 24), F('plant-potted', 6, 21), F('plant-potted', 25, 24), F('trash-can', 20, 25),
    F('lamp-floor-square', 12, 24), F('lamp-floor-square', 18, 24), F('rug-doormat', 16, 26),
    // outdoor sun deck
    F('sun-lounger', 7, 28), F('sun-lounger', 9, 28), F('sun-lounger', 20, 28), F('sun-lounger', 22, 28),
    F('table-patio', 12, 29), F('chair-slatted', 12, 28), F('chair-slatted', 13, 28), F('planter-raised', 6, 27), F('planter-raised', 25, 27),
    F('shrub-round', 5, 29), F('shrub-round', 26, 29), F('tree-park', 2, 28), F('tree-park', 29, 28),
    F('lamp-floor-square', 10, 27), F('lamp-floor-square', 21, 27), F('trash-can', 17, 29),
  ];
  return {
    walls: [
      ...outline(5, 6, 27, 26),
      [{ x: 15, z: 6 }, { x: 15, z: 20 }], // pool hall | east wing
      [{ x: 15, z: 13 }, { x: 27, z: 13 }], // changing room | showers
      [{ x: 15, z: 20 }, { x: 27, z: 20 }], // showers | lobby
    ],
    openings: [
      { dir: 'h', x: 16, z: 26, defId: 'door-modern-glass', flip: true }, // front door into the lobby
      { dir: 'v', x: 15, z: 9, defId: 'door-flush', flip: true }, // changing room
      { dir: 'h', x: 22, z: 20, defId: 'door-flush', flip: true }, // showers from the lobby
      ...openings('window-wide', 'h', 7, 6, 5), ...openings('window-clerestory', 'h', 16, 6, 6), // over the pool and changing room
      ...openings('window-picture', 'v', 5, 10, 2), ...openings('window-picture', 'v', 5, 22, 2),
      ...openings('window-picture', 'v', 27, 9, 2), ...openings('window-high', 'v', 27, 16, 2),
      ...openings('window-tall', 'h', 7, 26, 3), ...openings('window-tall', 'h', 21, 26, 3),
      ...openings('window-clerestory', 'h', 6, 13, 4),
    ],
    rooms: [
      { name: 'pool hall', probe: { x: 10, z: 22 }, wall: P('subway-tile', 1), floor: P('porcelain-large', 4) },
      { name: 'changing room', probe: { x: 20, z: 9 }, wall: P('two-tone-dado', 3), floor: P('hex-mosaic', 0) },
      { name: 'showers', probe: { x: 20, z: 16 }, wall: P('subway-tile', 4), floor: P('penny-round-tile', 0) },
    ],
    exterior: P('brick-classic', 0),
    featureWalls: [
      ...Array.from({ length: 6 }, (_, i) => ({ dir: 'h' as const, x: 7 + i, z: 6, side: 'b' as const, finish: P('tile-zellige', 3) })),
      ...Array.from({ length: 4 }, (_, i) => ({ dir: 'h' as const, x: 16 + i, z: 13, side: 'b' as const, finish: P('tile-zellige', 4) })),
    ],
    floorAreas: [
      area(6, 7, 6, 25, P('stone-pavers', 3)), // west deck strip
      area(13, 7, 14, 25, P('stone-pavers', 2)), // east deck strip
      area(7, 7, 12, 7, P('stone-pavers', 2)), // north deck
      area(7, 18, 12, 25, P('stone-pavers', 3)), // south deck
      area(16, 21, 26, 25, P('porcelain-large', 5)), // lobby
      area(4, 27, 27, 30, P('timber-decking', 0)), // sun deck
      area(15, 27, 16, 30, P('stone-pavers', 1)), // lane to the entry
    ],
    path: { to: { x: 16, z: 27 }, finish: P('stone-pavers', 1) },
    furniture,
  };
}

// ---------------------------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------------------------

/** Validates a plan against the lot and applies it, centred. */
function applyPlan(state: WorldState, content: ContentDB, lot: Lot, plan: HousePlan, size: number, label: string, tints: readonly Tint[] = []): void {
  const { dx, dz } = planOffset(lot, size, label);
  const placed = buildHouse(state, content, lot, withoutDecorOnEntry(content, lot, shiftPlan(plan, dx, dz)), label);
  applyTints(content, placed, tints, label);
}

/** Recolours that suit each venue (swatch ids of the designs' finish regions). */
const TINTS: Record<VenueType, Tint[]> = {
  cafe: [
    T('chair-dining-oak', 'wood', ['sage-paint', 'whitewash']), T('chair-slatted', 'wood', 'whitewash'), T('sofa-modern', 'fabric', 'teal'),
    T('armchair-lounge', 'fabric', 'mustard'), T('stool-bar', 'fabric', 'teal'), T('table-patio', 'canopy', ['coral', 'teal']),
  ],
  gym: [T('weight-bench', 'pad', 'navy'), T('bench-cushion', 'fabric', 'charcoal'), T('bench-low-cushion', 'fabric', 'charcoal'), T('rug-rectangle', 'rug', 'teal')],
  library: [
    T('chair-desk', 'fabric', 'navy'), T('armchair-lounge', 'fabric', 'mustard'), T('sofa-tweed', 'fabric', 'sage'), T('bench-cushion', 'fabric', 'navy'),
    T('desk-oak', 'wood', 'natural-ash'), T('rug-rounded', 'rug', 'oat-tweed'),
  ],
  arts: [
    T('chair-dining-cushion', 'fabric', ['coral', 'mustard', 'teal', 'navy']), T('sofa-tweed', 'fabric', 'teal'), T('armchair-lounge', 'fabric', 'blush'),
    T('sofa-modern', 'fabric', 'mustard'), T('chair-modern-cushion', 'fabric', 'navy'), T('rug-rectangle', 'rug', 'navy'), T('rug-rounded', 'rug', 'blush'),
    T('bench-cushion', 'fabric', 'teal'), T('tree-park', 'blossom', ['blush', 'coral', 'oat-tweed']),
  ],
  market: [T('bench-cushion', 'fabric', 'sage'), T('produce-stand', 'awning', ['coral', 'sage', 'mustard', 'teal']), T('tree-park', 'blossom', ['oat-tweed', 'blush'])],
  park: [
    T('tree-park', 'blossom', ['blush', 'oat-tweed', 'coral', 'mustard']), T('tree-park', 'trunk', ['bark', 'dark-bark', 'birch', 'grey-bark']),
    T('chair-adirondack', 'wood', ['sage-paint', 'navy-paint', 'whitewash']), T('chair-slatted', 'wood', 'whitewash'), T('table-patio', 'canopy', ['coral', 'teal']),
    T('bench-garden', 'wood', ['honey-oak', 'walnut']), T('swing-set', 'seats', 'mustard'),
  ],
  pool: [
    T('bench-cushion', 'fabric', 'teal'), T('bench-low-cushion', 'fabric', 'navy'),
    T('chair-slatted', 'wood', 'whitewash'), T('table-patio', 'canopy', 'teal'),
  ],
};

/**
 * Lays out a public venue on an empty lot: walls, floors, doors, windows and furniture, with the same placement rules as the
 * starter house. The lot must be at least 24 x 24 (park, arts and market 32 x 32). Throws when the lot is not empty or too
 * small or any placement is invalid, and when the finished lot fails lotProblems().
 */
export function buildVenueLot(state: WorldState, content: ContentDB, lotId: Id, venueType: VenueType): void {
  const lot = requireLot(state, lotId);
  const label = `buildVenueLot(${venueType})`;
  switch (venueType) {
    case 'cafe': applyPlan(state, content, lot, cafePlan(), 24, label, TINTS.cafe); break;
    case 'gym': applyPlan(state, content, lot, gymPlan(), 24, label, TINTS.gym); break;
    case 'library': applyPlan(state, content, lot, libraryPlan(), 24, label, TINTS.library); break;
    case 'arts': applyPlan(state, content, lot, artsPlan(), 32, label, TINTS.arts); lot.ground = 'grass'; break;
    case 'market': applyPlan(state, content, lot, marketPlan(), 32, label, TINTS.market); break;
    case 'park': {
      applyPlan(state, content, lot, parkPlan(), 32, label, TINTS.park);
      lot.ground = 'grass';
      const { dx, dz } = planOffset(lot, 32, label);
      fencePlayground(content, lot, dx, dz);
      break;
    }
    case 'pool': {
      applyPlan(state, content, lot, poolPlan(), 32, label, TINTS.pool);
      lot.ground = 'paving';
      const { dx, dz } = planOffset(lot, 32, label);
      // The 6 x 10 lap pool (x 7..12, z 8..17 in the plan) with a ladder on each short side.
      const pool: Pool = {
        id: newId(state, 'pool'), level: 0, x0: 7 + dx, z0: 8 + dz, x1: 12 + dx, z1: 17 + dz,
        styleId: 'azure-mosaic',
        ladders: [{ x: 9 + dx, z: 8 + dz, side: 'n' }, { x: 9 + dx, z: 17 + dz, side: 's' }],
      };
      (lot.pools ??= {})[pool.id] = pool;
      // A flat roof over the whole building: the pool hall, changing room, showers and lobby are all indoors.
      const roofSpec = defaultRoofSpec('flat', content);
      const roof = {
        id: newId(state, 'roof'), level: 0, x0: 5 + dx, z0: 6 + dz, x1: 27 + dx, z1: 26 + dz,
        styleId: roofSpec.styleId, ridge: 'h' as const, pitch: roofSpec.pitch ?? 0, finish: roofSpec.finish,
      };
      (lot.roofs ??= {})[roof.id] = roof;
      break;
    }
    default: throw new Error(`${label}: unknown venue type`);
  }
  finish(state, content, lot, label);
}
