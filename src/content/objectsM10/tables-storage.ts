// Milestone 10 designs, group "tables-storage". Models: tools/furniture-extra/m10/tables-storage.mjs
// (build: node tools/build-extra-furniture.mjs --only=tables-storage). Guide: dev/ds-tasks/m10f/AUTHORING.md.
// Edit only this group's files.

import type { ObjectDef } from '../types';
import type { ObjectKit } from '../objects';

type Fit = ReturnType<ObjectKit['fit']>;
type Def = Parameters<ObjectKit['obj']>[1];
/** What a table or storage entry still has to say; the rest (floor, blocking, footprint) is filled in below. */
type Spec = Omit<Def, 'category' | 'footprint' | 'layer' | 'blocksMovement' | 'functional' | 'surfaceHeight'> & { functional?: boolean; surfaceHeight?: number };

export default function build(k: ObjectKit): ObjectDef[] {
  const { fit, obj, useFront, woodR, metalR, applianceR, region, sw, COUNTERTOP, r3, FP11, FP21, FP22, WALL_GAP, dollars } = k;
  const FP31 = { w: 3, d: 1 };
  type FP = { w: number; d: number };

  /** A table, desk or console: blocks walking, its top takes surface items (surfaceHeight = the model top unless given). */
  const table = (f: Fit, fp: FP, o: Spec): ObjectDef =>
    obj(f, { category: 'tables', footprint: fp, layer: 'floor', blocksMovement: true, functional: true, surfaceHeight: r3(f.box.y1), ...o });
  /** A storage piece standing on the floor (functional unless it says otherwise). */
  const store = (f: Fit, fp: FP, o: Spec): ObjectDef =>
    obj(f, { category: 'storage', footprint: fp, layer: 'floor', blocksMovement: true, functional: true, ...o });

  const MARBLE_TOP = region('top', 'Marble Top', ['carpetWhite'], [sw('carrara', 'Carrara White', '#f8ffff'), ...COUNTERTOP.slice(1)]);
  const wood2 = woodR(['wood', 'woodDark']);
  /** Dark steel frame (its own region id, so it can sit beside a metalR region). */
  const frameR = (label = 'Frame') => region('frame', label, ['metalDark'], k.METAL_DARK);

  const chest = fit('chestOfDrawers', FP11, 2, { back: WALL_GAP });

  const defs: ObjectDef[] = [
    // Both top drawers slide out while someone changes outfit (anim kind 'openWhileUsed').
    obj(chest, {
      id: 'chest-of-drawers', name: 'Four-Drawer Chest', category: 'storage', subcategory: 'dresser', rooms: ['bedroom'], style: 'classic',
      description: 'A waist-high chest with four drawers and a broad top for lamps and photos. Change into another outfit or plan new ones here.',
      tags: ['dresser', 'storage', 'clothes', 'surface'], tier: 'standard', price: dollars(390), quality: 3, functional: true,
      footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(chest.box.y1), slots: [useFront('use', 0.5, chest, 1)],
      interactions: ['changeOutfit', 'editOutfits'], finishes: [woodR(['wood', 'woodDark']), metalR(['metal'])],
      anim: {
        kind: 'openWhileUsed', on: ['changeOutfit', 'editOutfits'],
        parts: [
          { node: 'anim:drawer1', role: 'drawer', slide: [0, 0, 0.3] },
          { node: 'anim:drawer2', role: 'drawer2', slide: [0, 0, 0.3] },
        ],
      },
    }),
  ];

  // --- Dining tables ---------------------------------------------------------------------------
  const diningRound = fit('diningRoundPedestal', FP22, 2);
  const diningSquare = fit('diningSquareModern', FP22, 2);
  const diningPlank = fit('diningPlankFarm', FP21, 2);
  const diningExt = fit('diningExtendable', FP31, 2);
  const diningMid = fit('diningMidCentury', FP21, 2);
  const diningPipe = fit('diningIndustrialPipe', FP21, 2);
  const diningBistro = fit('diningBistro', FP11, 2);
  const diningLeaf = fit('diningDropLeaf', FP21, 2);
  const diningMarble = fit('diningMarbleLuxury', FP21, 2);
  const diningPicnic = fit('diningPicnic', FP22, 2);
  const DINING = ['table', 'dining', 'surface', 'cleanable'];
  defs.push(
    table(diningRound, FP22, {
      id: 'table-dining-round-pedestal', name: 'Round Pedestal Table', subcategory: 'dining', rooms: ['dining', 'kitchen'], style: 'classic',
      description: 'A round oak table on a single turned column, with room for chairs all the way round. Meals can be served here.',
      tags: DINING, packs: ['everyday-essentials', 'classic-townhouse'], tier: 'standard', price: dollars(520), quality: 3, stats: { environment: 1 },
      finishes: [wood2],
    }),
    table(diningSquare, FP22, {
      id: 'table-dining-square-modern', name: 'Square Modern Dining Table', subcategory: 'dining', rooms: ['dining', 'kitchen'], style: 'modern',
      description: 'A square table with a pale inlaid top on slim steel legs: every seat gets the same view. Meals can be served here.',
      tags: DINING, packs: ['modern-minimal'], tier: 'standard', price: dollars(680), quality: 3, stats: { environment: 2 },
      finishes: [wood2, metalR(['metal'])],
    }),
    table(diningPlank, FP21, {
      id: 'table-dining-plank-farm', name: 'Plank Farmhouse Table', subcategory: 'dining', rooms: ['dining', 'kitchen'], style: 'rustic',
      description: 'Three thick planks on stout legs with a low stretcher. Rough, sturdy and happiest with a crowd around it.',
      tags: DINING, packs: ['cozy-cottage'], tier: 'budget', price: dollars(360), quality: 2, stats: { environment: 1 },
      finishes: [wood2],
    }),
    table(diningExt, FP31, {
      id: 'table-dining-extendable', name: 'Extendable Dining Table', subcategory: 'dining', rooms: ['dining'], style: 'classic',
      description: 'A three-tile table with its leaves in, on twin pedestals. Room for a long dinner party.',
      tags: DINING, packs: ['classic-townhouse'], tier: 'premium', price: dollars(1050), quality: 4, stats: { environment: 2 },
      finishes: [wood2],
    }),
    table(diningMid, FP21, {
      id: 'table-dining-mid-century', name: 'Mid-Century Dining Table', subcategory: 'dining', rooms: ['dining', 'kitchen'], style: 'mid-century',
      description: 'A slim teak-look top on splayed, tapered legs. Light on its feet and heavy on charm.',
      tags: DINING, packs: ['mid-century'], tier: 'premium', price: dollars(640), quality: 4, stats: { environment: 2 },
      finishes: [wood2],
    }),
    table(diningPipe, FP21, {
      id: 'table-dining-pipe', name: 'Pipe-Frame Dining Table', subcategory: 'dining', rooms: ['dining', 'kitchen'], style: 'industrial',
      description: 'Reclaimed planks bolted to a black pipe frame. Takes a hot pan without complaint.',
      tags: DINING, packs: ['industrial-loft'], tier: 'standard', price: dollars(470), quality: 3, stats: { environment: 1 },
      finishes: [woodR(['wood']), frameR('Pipe Frame')],
    }),
    table(diningBistro, FP11, {
      id: 'table-bistro-round', name: 'Round Bistro Table', subcategory: 'dining', rooms: ['dining', 'kitchen'], style: 'cottage',
      description: 'A small round table on an iron foot: breakfast for two in a corner of the kitchen.',
      tags: DINING, packs: ['cozy-cottage'], tier: 'budget', price: dollars(115), quality: 2,
      finishes: [woodR(['wood']), frameR('Iron')],
    }),
    table(diningLeaf, FP21, {
      id: 'table-dining-drop-leaf', name: 'Gate-Leg Drop-Leaf Table', subcategory: 'dining', rooms: ['dining', 'kitchen'], style: 'cottage',
      description: 'A narrow table with both leaves raised on gate legs. Perfect for a small dining nook.',
      tags: DINING, packs: ['cozy-cottage'], tier: 'budget', price: dollars(340), quality: 2, stats: { environment: 1 },
      finishes: [wood2, metalR(['metal'])],
    }),
    table(diningMarble, FP21, {
      id: 'table-dining-marble', name: 'Marble Banquet Table', subcategory: 'dining', rooms: ['dining'], style: 'luxury',
      description: 'A thick marble slab with a brass edge on two panel supports. The centrepiece of a formal dining room.',
      tags: DINING, packs: ['art-deco'], tier: 'luxury', price: dollars(1680), quality: 5, stats: { environment: 4 },
      finishes: [MARBLE_TOP, woodR(['woodDark']), metalR(['metal'])],
    }),
    table(diningPicnic, FP22, {
      id: 'table-picnic-indoor', name: 'Indoor Picnic Table', subcategory: 'dining', rooms: ['dining', 'kitchen', 'kids'], style: 'rustic',
      description: 'A plank table with two attached benches. Cosy for a family breakfast and no chairs to push in.',
      tags: DINING, packs: ['garden-patio', 'cozy-cottage'], tier: 'budget', price: dollars(390), quality: 2, stats: { environment: 1 },
      finishes: [wood2],
    }),
  );

  // --- Coffee, side and console tables -------------------------------------------------------------
  const coffeeRound = fit('coffeeRoundMidCentury', FP11, 2);
  const coffeeTrunk = fit('coffeeTrunk', FP21, 2);
  const coffeeNest = fit('coffeeNesting', FP11, 2);
  const coffeeCart = fit('coffeeCartIndustrial', FP21, 2);
  const coffeeMarble = fit('coffeeMarbleDrum', FP11, 2);
  const sideDrum = fit('sideDrum', FP11, 2);
  const sideTwoTier = fit('sideEndTwoTier', FP11, 2);
  const consoleBrass = fit('consoleBrass', FP21, 2, { back: WALL_GAP });
  const consolePipe = fit('consoleIndustrial', FP21, 2, { back: WALL_GAP });
  const sideC = fit('sideCTable', FP11, 2);
  const sidePhone = fit('sideTelephone', FP11, 2, { back: WALL_GAP });
  const COFFEE = ['table', 'coffee', 'surface'];
  const SIDE = ['table', 'side', 'surface'];
  defs.push(
    table(coffeeRound, FP11, {
      id: 'table-coffee-round-mid-century', name: 'Round Teak Coffee Table', subcategory: 'coffee', rooms: ['living'], style: 'mid-century',
      description: 'A wide round top on four splayed legs. Sits low and looks like it came with the house in 1962.',
      tags: COFFEE, packs: ['mid-century'], tier: 'standard', price: dollars(240), quality: 3, finishes: [wood2],
    }),
    table(coffeeTrunk, FP21, {
      id: 'table-coffee-trunk', name: 'Strapped Trunk Coffee Table', subcategory: 'coffee', rooms: ['living'], style: 'rustic',
      description: 'An old travelling trunk with iron straps, repurposed as a coffee table.',
      tags: [...COFFEE, 'storage'], packs: ['cozy-cottage'], tier: 'standard', price: dollars(280), quality: 3, stats: { environment: 1 },
      finishes: [wood2, frameR('Straps')],
    }),
    table(coffeeNest, FP11, {
      id: 'table-coffee-nesting', name: 'Nesting Coffee Tables', subcategory: 'coffee', rooms: ['living'], style: 'modern',
      description: 'Two small tables, one slid half under the other. A cheap way to get two surfaces out of one tile.',
      tags: COFFEE, packs: ['modern-minimal'], tier: 'budget', price: dollars(165), quality: 2,
      finishes: [woodR(['wood']), metalR(['metal']), region('lower', 'Lower Table', ['carpetBlue'], k.FABRIC_BLUE)],
    }),
    table(coffeeCart, FP21, {
      id: 'table-coffee-cart', name: 'Casters Coffee Cart', subcategory: 'coffee', rooms: ['living'], style: 'industrial',
      description: 'A steel cart on casters with a plank top and a low shelf. Roll it wherever the party is.',
      tags: COFFEE, packs: ['industrial-loft'], tier: 'standard', price: dollars(290), quality: 3,
      finishes: [woodR(['wood']), frameR('Frame')],
    }),
    table(coffeeMarble, FP11, {
      id: 'table-coffee-marble-drum', name: 'Gilded Marble Drum Table', subcategory: 'coffee', rooms: ['living'], style: 'luxury',
      description: 'A white marble disc resting on a polished brass drum. Pure show-off.',
      tags: COFFEE, packs: ['art-deco'], tier: 'luxury', price: dollars(1520), quality: 5, stats: { environment: 3 },
      finishes: [MARBLE_TOP, metalR(['metal'])],
    }),
    table(sideDrum, FP11, {
      id: 'table-side-barrel', name: 'Barrel Side Table', subcategory: 'side', rooms: ['living', 'bedroom'], style: 'rustic',
      description: 'A small wooden barrel with iron bands: a sturdy stand for a mug or a lamp.',
      tags: SIDE, packs: ['cozy-cottage'], tier: 'budget', price: dollars(75), quality: 2,
      finishes: [wood2, frameR('Bands')],
    }),
    table(sideTwoTier, FP11, {
      id: 'table-side-two-tier', name: 'Two-Tier End Table', subcategory: 'side', rooms: ['living', 'bedroom'], style: 'cottage',
      description: 'A square end table with a shelf for magazines underneath.',
      tags: SIDE, packs: ['cozy-cottage'], tier: 'budget', price: dollars(90), quality: 2,
      finishes: [wood2, region('mag', 'Magazines', ['carpetBlue'], k.FABRIC_BLUE)],
    }),
    table(consoleBrass, FP21, {
      id: 'console-brass-glass', name: 'Brass and Glass Console', subcategory: 'side', rooms: ['living', 'dining', 'study'], style: 'luxury',
      description: 'A long, narrow console on slim brass legs with a glass shelf. Dresses up any hallway.',
      tags: [...SIDE, 'console'], packs: ['art-deco', 'modern-minimal'], tier: 'premium', price: dollars(560), quality: 4, stats: { environment: 2 },
      finishes: [woodR(['wood']), metalR(['metal'])],
    }),
    table(consolePipe, FP21, {
      id: 'console-pipe-shelf', name: 'Pipe-Frame Sofa Console', subcategory: 'side', rooms: ['living', 'study'], style: 'industrial',
      description: 'A tall console with two plank shelves in a black frame, made to stand behind a sofa.',
      tags: [...SIDE, 'console', 'storage'], packs: ['industrial-loft'], tier: 'standard', price: dollars(230), quality: 3,
      finishes: [woodR(['wood']), frameR('Frame'), region('boxes', 'Storage Boxes', ['carpetBlue'], k.FABRIC_BLUE)],
    }),
    table(sideC, FP11, {
      id: 'table-side-c-shape', name: 'C-Shaped Sofa Table', subcategory: 'side', rooms: ['living', 'bedroom'], style: 'modern',
      description: 'A single post on a flat steel base that carries its top over the arm of a sofa or bed.',
      tags: SIDE, packs: ['modern-minimal'], tier: 'budget', price: dollars(100), quality: 2,
      finishes: [woodR(['wood']), frameR('Base')],
    }),
    table(sidePhone, FP11, {
      id: 'table-side-telephone', name: 'Telephone Table', subcategory: 'side', rooms: ['living', 'bedroom', 'study'], style: 'cottage',
      description: 'A slender hall table with a drawer for the address book and a shelf for the phone book.',
      tags: [...SIDE, 'storage'], packs: ['cozy-cottage', 'classic-townhouse'], tier: 'budget', price: dollars(135), quality: 2,
      finishes: [wood2],
    }),
  );

  // --- Desks -----------------------------------------------------------------------------------
  const deskSecretary = fit('deskSecretary', FP11, 2, { back: WALL_GAP });
  const deskStanding = fit('deskStanding', FP21, 2);
  const deskExecutive = fit('deskExecutive', FP21, 2, { back: WALL_GAP });
  const deskSchool = fit('deskSchool', FP11, 2);
  const deskVanity = fit('deskVanity', FP11, 2, { back: WALL_GAP });
  const deskDrafting = fit('deskDrafting', FP21, 2);
  const deskStudent = fit('deskStudent', FP11, 2, { back: WALL_GAP });
  const deskIndustrial = fit('deskIndustrial', FP21, 2);
  const deskGaming = fit('deskGaming', FP21, 2);
  const deskRolltop = fit('deskRolltop', FP21, 2, { back: WALL_GAP });
  const DESK = ['desk', 'surface'];
  defs.push(
    table(deskSecretary, FP11, {
      id: 'desk-secretary', name: 'Secretary Desk', subcategory: 'desk', rooms: ['study', 'bedroom', 'living'], style: 'classic',
      description: 'A compact writing desk with a drawer and a hutch of pigeonholes for letters. Put a computer or a laptop on it.',
      tags: DESK, packs: ['classic-townhouse'], tier: 'premium', price: dollars(760), quality: 4, surfaceHeight: 0.74, stats: { environment: 2 },
      finishes: [wood2, metalR(['metal'])],
    }),
    table(deskStanding, FP21, {
      id: 'desk-standing', name: 'Standing Desk', subcategory: 'desk', rooms: ['study', 'bedroom'], style: 'modern',
      description: 'A wide top at standing height on two steel columns. Keeps the blood moving during long work sessions.',
      tags: [...DESK, 'standing'], packs: ['modern-minimal', 'creative-studio'], tier: 'standard', price: dollars(560), quality: 4, stats: { environment: 1 },
      finishes: [woodR(['wood']), frameR('Frame')],
    }),
    table(deskExecutive, FP21, {
      id: 'desk-executive', name: 'Executive Desk', subcategory: 'desk', rooms: ['study'], style: 'luxury',
      description: 'A broad leather-inlaid desk with two drawer pedestals. For people who sign things.',
      tags: DESK, packs: ['classic-townhouse'], tier: 'luxury', price: dollars(1720), quality: 5, surfaceHeight: 0.772, stats: { environment: 4 },
      finishes: [wood2, region('leather', 'Leather Inlay', ['carpetDarker'], k.FABRIC_BRICK), metalR(['metal'])],
    }),
    table(deskSchool, FP11, {
      id: 'desk-school', name: 'School Desk and Chair', subcategory: 'desk', rooms: ['study', 'kids'], style: 'budget',
      description: 'A one-seat classroom desk with a book rack, joined to its own chair. Good for homework.',
      tags: [...DESK, 'homework'], packs: ['kids-storybook'], tier: 'budget', price: dollars(95), quality: 2, surfaceHeight: 0.75,
      finishes: [wood2, metalR(['metal'])],
    }),
    table(deskVanity, FP11, {
      id: 'desk-vanity-mirror', name: 'Dressing Table with Mirror', subcategory: 'desk', rooms: ['bedroom'], style: 'classic',
      description: 'A vanity with drawers on both sides and a framed mirror. Room for a jewellery tray and a bottle or two.',
      tags: [...DESK, 'vanity', 'storage'], packs: ['classic-townhouse'], tier: 'standard', price: dollars(520), quality: 3, surfaceHeight: 0.76, stats: { environment: 2 },
      finishes: [wood2, metalR(['metal'])],
    }),
    table(deskDrafting, FP21, {
      id: 'desk-drafting', name: 'Architect\'s Drafting Table', subcategory: 'desk', rooms: ['study'], style: 'industrial',
      description: 'A tall work top on a steel frame with a tilted drawing board at the back. A designer\'s dream.',
      tags: [...DESK, 'drafting'], packs: ['creative-studio', 'industrial-loft'], tier: 'standard', price: dollars(430), quality: 3, surfaceHeight: 0.92,
      finishes: [wood2, metalR(['metalMedium'])],
    }),
    table(deskStudent, FP11, {
      id: 'desk-student-compact', name: 'Compact Student Desk', subcategory: 'desk', rooms: ['study', 'bedroom', 'kids'], style: 'budget',
      description: 'A slim one-drawer desk between two board sides. Small, plain and cheap.',
      tags: [...DESK, 'homework'], tier: 'budget', price: dollars(65), quality: 1, finishes: [wood2],
    }),
    table(deskIndustrial, FP21, {
      id: 'desk-workshop-steel', name: 'Steel Workshop Desk', subcategory: 'desk', rooms: ['study'], style: 'industrial',
      description: 'A plank top over a steel drawer unit and an open frame. Built to survive an office.',
      tags: DESK, packs: ['industrial-loft'], tier: 'standard', price: dollars(350), quality: 3,
      finishes: [woodR(['wood']), frameR('Frame'), metalR(['metalMedium'])],
    }),
    table(deskGaming, FP21, {
      id: 'desk-gaming', name: 'Gaming Desk', subcategory: 'desk', rooms: ['study', 'bedroom'], style: 'modern',
      description: 'A black desk on A-frame legs with a glowing blue strip under the front edge and a mouse mat.',
      tags: DESK, packs: ['modern-minimal'], tier: 'standard', price: dollars(470), quality: 3, stats: { environment: 1 },
      finishes: [frameR('Desk Finish'), metalR(['metalMedium'])],
    }),
    table(deskRolltop, FP21, {
      id: 'desk-rolltop', name: 'Roll-Top Bureau', subcategory: 'desk', rooms: ['study', 'living'], style: 'classic',
      description: 'A grand old bureau with the tambour rolled back over a nest of pigeonholes and six drawers.',
      tags: [...DESK, 'storage'], packs: ['classic-townhouse'], tier: 'premium', price: dollars(1180), quality: 4, surfaceHeight: 0.76, stats: { environment: 3 },
      finishes: [wood2, metalR(['metal'])],
    }),
  );

  // --- Bedside, bar and special tables ------------------------------------------------------------
  const bedsideMid = fit('bedsideMidCentury', FP11, 2);
  const bedsideCrate = fit('bedsideCrate', FP11, 2);
  const barTable = fit('barTableHigh', FP11, 2);
  const cardTable = fit('cardTable', FP11, 2);
  const island = fit('islandTable', FP21, 2);
  const workbench = fit('workbench', FP21, 2, { back: WALL_GAP });
  defs.push(
    table(bedsideMid, FP11, {
      id: 'bedside-mid-century', name: 'Mid-Century Bedside Table', subcategory: 'bedside', rooms: ['bedroom'], style: 'mid-century',
      description: 'A two-drawer bedside table on splayed legs. Lamps and alarm clocks fit on top.',
      tags: ['nightstand', 'table', 'surface', 'storage'], packs: ['mid-century'], tier: 'standard', price: dollars(190), quality: 3, finishes: [wood2, metalR(['metal'])],
    }),
    table(bedsideCrate, FP11, {
      id: 'bedside-crate-stack', name: 'Crate Bedside Table', subcategory: 'bedside', rooms: ['bedroom', 'kids'], style: 'rustic',
      description: 'Two slatted crates stacked into a bedside table. As cheap as furniture gets.',
      tags: ['nightstand', 'table', 'surface', 'storage'], tier: 'budget', price: dollars(45), quality: 1,
      finishes: [wood2, region('cloth', 'Cloth', ['carpetBlue'], k.FABRIC_BLUE)],
    }),
    table(barTable, FP11, {
      id: 'table-bar-high', name: 'High Bar Table', subcategory: 'bar', rooms: ['kitchen', 'dining', 'living'], style: 'modern',
      description: 'A tall round table on a slim column with a brass foot rail. Stand at it with a drink, or pull up a stool.',
      tags: ['table', 'bar', 'surface', 'cleanable'], packs: ['modern-minimal', 'industrial-loft'], tier: 'standard', price: dollars(215), quality: 3,
      finishes: [woodR(['wood']), frameR('Column'), region('rail', 'Foot Rail', ['metal'], k.METAL)],
    }),
    table(cardTable, FP11, {
      id: 'table-card-felt', name: 'Folding Card Table', subcategory: 'games', rooms: ['living', 'dining', 'study'], style: 'classic',
      description: 'A square green-felt table with cup wells in the corners. Four players and a deck of cards.',
      tags: ['table', 'games', 'surface'], packs: ['classic-townhouse'], tier: 'standard', price: dollars(235), quality: 3,
      finishes: [wood2],
    }),
    table(island, FP21, {
      id: 'table-kitchen-island', name: 'Butcher-Block Island', subcategory: 'kitchen', rooms: ['kitchen', 'dining'], style: 'cottage',
      description: 'A freestanding island with a butcher-block top, a three-door cabinet and a towel rail. Meals can be served on it.',
      tags: ['table', 'island', 'surface', 'storage', 'cleanable'], packs: ['cozy-cottage'], tier: 'standard', price: dollars(620), quality: 3, stats: { environment: 1 },
      finishes: [wood2, metalR(['metal'])],
    }),
    table(workbench, FP21, {
      id: 'table-workbench', name: 'Pegboard Workbench', subcategory: 'workbench', rooms: ['study', 'outdoor'], style: 'rustic',
      description: 'A thick-topped bench with a vise, a lower shelf and a pegboard wall of tools.',
      tags: ['table', 'workbench', 'surface', 'storage'], packs: ['industrial-loft', 'creative-studio'], tier: 'standard', price: dollars(330), quality: 3, surfaceHeight: 0.9,
      finishes: [wood2, frameR('Vise')],
    }),
  );

  // --- Wardrobes and armoires ----------------------------------------------------------------------
  const WARDROBE = ['wardrobe', 'storage', 'clothes'];
  const OUTFIT = ['changeOutfit', 'editOutfits'];
  /** Both doors swing out to +z (left hinge turns negative, right hinge positive) and show the rail and clothes. */
  const wardrobeAnim = {
    kind: 'wardrobe' as const,
    parts: [
      { node: 'anim:doorL', role: 'door' as const, axis: 'y' as const, angle: -1.75 },
      { node: 'anim:doorR', role: 'door2' as const, axis: 'y' as const, angle: 1.75 },
      { node: 'anim:interior', role: 'interior' as const },
    ],
  };
  const wardrobeClassic = fit('wardrobeClassic', FP11, 2, { back: WALL_GAP });
  const wardrobePine = fit('wardrobePine', FP11, 2, { back: WALL_GAP });
  const wardrobeTriple = fit('wardrobeTriple', FP21, 2, { back: WALL_GAP });
  const wardrobeSliding = fit('wardrobeSliding', FP21, 2, { back: WALL_GAP });
  const armoire = fit('armoireCarved', FP11, 2, { back: WALL_GAP });
  const clothesRail = fit('clothesRail', FP21, 2, { back: WALL_GAP });
  defs.push(
    store(wardrobeClassic, FP11, {
      id: 'wardrobe-panelled-oak', name: 'Panelled Oak Wardrobe', subcategory: 'wardrobe', rooms: ['bedroom'], style: 'classic',
      description: 'A tall two-door wardrobe with raised panels and a crown moulding. Change into another outfit or plan new ones here.',
      tags: WARDROBE, packs: ['classic-townhouse'], tier: 'premium', price: dollars(780), quality: 4, slots: [useFront('use', 0.5, wardrobeClassic, 1)],
      interactions: OUTFIT, stats: { environment: 1 }, finishes: [wood2, metalR(['metal'])], anim: wardrobeAnim,
    }),
    store(wardrobePine, FP11, {
      id: 'wardrobe-pine-drawer', name: 'Pine Wardrobe with Drawer', subcategory: 'wardrobe', rooms: ['bedroom', 'kids'], style: 'cottage',
      description: 'A plain pine wardrobe with a drawer in the base and round wooden knobs. Cheap, cheerful and roomier than it looks.',
      tags: WARDROBE, packs: ['cozy-cottage'], tier: 'budget', price: dollars(280), quality: 2, slots: [useFront('use', 0.5, wardrobePine, 1)],
      interactions: OUTFIT, finishes: [wood2], anim: wardrobeAnim,
    }),
    store(wardrobeTriple, FP21, {
      id: 'wardrobe-triple-mirror', name: 'Triple Mirrored Wardrobe', subcategory: 'wardrobe', rooms: ['bedroom'], style: 'modern',
      description: 'A wide white wardrobe: two hinged doors in the middle between fixed mirror panels. Lots of rail space.',
      tags: WARDROBE, packs: ['modern-minimal'], tier: 'premium', price: dollars(1150), quality: 4, slots: [useFront('use', 1, wardrobeTriple, 1)],
      interactions: OUTFIT, stats: { environment: 2 }, finishes: [applianceR(['metalLight']), woodR(['wood'])], anim: wardrobeAnim,
    }),
    store(wardrobeSliding, FP21, {
      id: 'wardrobe-sliding-door', name: 'Sliding-Door Wardrobe', subcategory: 'wardrobe', rooms: ['bedroom'], style: 'modern',
      description: 'Four overlapping sliding panels on a steel track: no door swing to worry about. Change outfit or plan new ones here.',
      tags: WARDROBE, packs: ['modern-minimal'], tier: 'standard', price: dollars(760), quality: 3, slots: [useFront('use', 1, wardrobeSliding, 1)],
      interactions: OUTFIT, finishes: [wood2],
    }),
    store(armoire, FP11, {
      id: 'armoire-carved', name: 'Carved Armoire', subcategory: 'wardrobe', rooms: ['bedroom'], style: 'luxury',
      description: 'A towering armoire on ball feet with an arched crown, carved door panels and brass pulls.',
      tags: WARDROBE, packs: ['classic-townhouse', 'art-deco'], tier: 'luxury', price: dollars(1640), quality: 5, slots: [useFront('use', 0.5, armoire, 1)],
      interactions: OUTFIT, stats: { environment: 3 }, finishes: [wood2, metalR(['metal'])], anim: wardrobeAnim,
    }),
    store(clothesRail, FP21, {
      id: 'clothes-rail-steel', name: 'Open Clothes Rail', subcategory: 'wardrobe', rooms: ['bedroom'], style: 'industrial',
      description: 'A steel rail on A-frame ends with a shelf for shoes. No doors, no fuss: everything you own is on show.',
      tags: WARDROBE, packs: ['industrial-loft'], tier: 'budget', price: dollars(140), quality: 2, slots: [useFront('use', 1, clothesRail, 1)],
      interactions: OUTFIT, finishes: [frameR('Frame'), woodR(['wood']), metalR(['metal'])],
    }),
  );

  // --- Dressers and chests ------------------------------------------------------------------------
  const drawerAnim = (roles: Array<'drawer' | 'drawer2'>) => ({
    kind: 'openWhileUsed' as const, on: OUTFIT,
    parts: roles.map((role, i) => ({ node: `anim:drawer${i + 1}`, role, slide: [0, 0, 0.3] as [number, number, number] })),
  });
  const lidAnim = {
    kind: 'openWhileUsed' as const, on: OUTFIT,
    parts: [
      { node: 'anim:lid', role: 'lid' as const, axis: 'x' as const, angle: -1.9 },
      { node: 'anim:interior', role: 'interior' as const },
    ],
  };
  const DRESSER = ['dresser', 'storage', 'clothes', 'surface'];
  const dresserSix = fit('dresserSixDrawer', FP21, 2, { back: WALL_GAP });
  const dresserTall = fit('dresserTallboy', FP11, 2, { back: WALL_GAP });
  const dresserMid = fit('dresserMidCentury', FP21, 2, { back: WALL_GAP });
  const dresserCandy = fit('dresserCandy', FP11, 2, { back: WALL_GAP });
  const dresserMirror = fit('dresserMirror', FP21, 2, { back: WALL_GAP });
  const chestBlanket = fit('chestBlanket', FP11, 2, { back: WALL_GAP });
  const trunk = fit('trunkSteamer', FP11, 2, { back: WALL_GAP });
  const chestCedar = fit('chestCedar', FP11, 2, { back: WALL_GAP });
  defs.push(
    store(dresserSix, FP21, {
      id: 'dresser-six-drawer', name: 'Six-Drawer Dresser', subcategory: 'dresser', rooms: ['bedroom'], style: 'classic',
      description: 'A broad dresser with two columns of three drawers and a wide top. Change outfit or plan new ones here.',
      tags: DRESSER, tier: 'standard', price: dollars(520), quality: 3, surfaceHeight: r3(dresserSix.box.y1), slots: [useFront('use', 1, dresserSix, 1)],
      interactions: OUTFIT, finishes: [wood2, metalR(['metal'])], anim: drawerAnim(['drawer', 'drawer', 'drawer2', 'drawer2']),
    }),
    store(dresserTall, FP11, {
      id: 'dresser-tallboy', name: 'Tallboy Chest', subcategory: 'dresser', rooms: ['bedroom'], style: 'cottage',
      description: 'Five narrow drawers stacked up a tall, slim case. Fits where a wide dresser will not.',
      tags: DRESSER, packs: ['cozy-cottage'], tier: 'standard', price: dollars(360), quality: 3, surfaceHeight: r3(dresserTall.box.y1), slots: [useFront('use', 0.5, dresserTall, 1)],
      interactions: OUTFIT, finishes: [wood2, metalR(['metal'])], anim: drawerAnim(['drawer', 'drawer2', 'drawer']),
    }),
    store(dresserMid, FP21, {
      id: 'dresser-mid-century', name: 'Mid-Century Dresser', subcategory: 'dresser', rooms: ['bedroom', 'living'], style: 'mid-century',
      description: 'A long, low teak dresser on tapered legs, with a bank of drawers at each end around a panelled centre.',
      tags: DRESSER, packs: ['mid-century'], tier: 'premium', price: dollars(820), quality: 4, surfaceHeight: r3(dresserMid.box.y1), slots: [useFront('use', 1, dresserMid, 1)],
      interactions: OUTFIT, stats: { environment: 2 }, finishes: [wood2, metalR(['metal'])], anim: drawerAnim(['drawer', 'drawer', 'drawer2', 'drawer2']),
    }),
    store(dresserCandy, FP11, {
      id: 'dresser-kids-candy', name: 'Candy-Colour Kids\' Dresser', subcategory: 'dresser', rooms: ['kids', 'bedroom'], style: 'playful',
      description: 'Three bright drawers with round red knobs, sized for small hands and small clothes.',
      tags: DRESSER, packs: ['kids-storybook'], tier: 'budget', price: dollars(210), quality: 2, surfaceHeight: r3(dresserCandy.box.y1), slots: [useFront('use', 0.5, dresserCandy, 1)],
      interactions: OUTFIT, finishes: [woodR(['wood', 'woodDark']), region('drawers', 'Drawer Fronts', ['carpetBlue'], k.FABRIC_BLUE), region('knobs', 'Knobs', ['carpet'], k.FABRIC)],
      anim: drawerAnim(['drawer', 'drawer2']),
    }),
    store(dresserMirror, FP21, {
      id: 'dresser-mirror-vanity', name: 'Dresser with Mirror', subcategory: 'dresser', rooms: ['bedroom'], style: 'luxury',
      description: 'Four wide drawers under a tall framed mirror, with room on top for perfume and a jewellery tray.',
      tags: DRESSER, packs: ['classic-townhouse', 'art-deco'], tier: 'luxury', price: dollars(1490), quality: 5, surfaceHeight: 0.85, slots: [useFront('use', 1, dresserMirror, 1)],
      interactions: OUTFIT, stats: { environment: 3 }, finishes: [wood2, metalR(['metal'])], anim: drawerAnim(['drawer', 'drawer2']),
    }),
    store(chestBlanket, FP11, {
      id: 'chest-blanket', name: 'Blanket Chest', subcategory: 'chest', rooms: ['bedroom', 'living'], style: 'cottage',
      description: 'A low wooden chest with a hinged lid, for blankets and spare linen. Doubles as a place to keep outfits.',
      tags: ['chest', 'storage', 'clothes', 'surface'], packs: ['cozy-cottage'], tier: 'budget', price: dollars(180), quality: 2, surfaceHeight: r3(chestBlanket.box.y1), slots: [useFront('use', 0.5, chestBlanket, 1)],
      interactions: OUTFIT, finishes: [wood2, frameR('Straps')], anim: lidAnim,
    }),
    store(trunk, FP11, {
      id: 'trunk-steamer', name: 'Steamer Trunk', subcategory: 'chest', rooms: ['bedroom', 'living'], style: 'classic',
      description: 'A ribbed travelling trunk with a stepped lid, brass corners and carry handles. Packed and ready for anywhere.',
      tags: ['chest', 'storage', 'clothes', 'surface'], packs: ['classic-townhouse'], tier: 'standard', price: dollars(320), quality: 3, surfaceHeight: 0.46, slots: [useFront('use', 0.5, trunk, 1)],
      interactions: OUTFIT, stats: { environment: 1 }, finishes: [wood2, metalR(['metal'])], anim: lidAnim,
    }),
    store(chestCedar, FP11, {
      id: 'chest-cedar-hope', name: 'Cedar Hope Chest', subcategory: 'chest', rooms: ['bedroom'], style: 'rustic',
      description: 'A cedar chest on bun feet with a carved front panel. It smells of sweaters and good intentions.',
      tags: ['chest', 'storage', 'clothes', 'surface'], packs: ['cozy-cottage'], tier: 'standard', price: dollars(260), quality: 3, surfaceHeight: r3(chestCedar.box.y1), slots: [useFront('use', 0.5, chestCedar, 1)],
      interactions: OUTFIT, finishes: [wood2, metalR(['metal'])], anim: lidAnim,
    }),
  );

  // --- Bookcases and shelving -----------------------------------------------------------------------
  const BOOKS = ['bookcase', 'books', 'storage'];
  const READ = ['readBook', 'readSkillBook'];
  const bookcaseCube = fit('bookcaseCube', FP11, 2, { back: WALL_GAP });
  const bookcaseLadder = fit('bookcaseLadder', FP11, 2, { back: WALL_GAP });
  const bookcaseGlass = fit('bookcaseGlass', FP11, 2, { back: WALL_GAP });
  const bookcaseLow = fit('bookcaseLowWide', FP21, 2, { back: WALL_GAP });
  const bookcasePipe = fit('bookcaseIndustrial', FP21, 2, { back: WALL_GAP });
  const bookcaseMid = fit('bookcaseMidCentury', FP11, 2, { back: WALL_GAP });
  defs.push(
    store(bookcaseCube, FP11, {
      id: 'bookcase-cube-shelves', name: 'Cube Shelving Unit', subcategory: 'bookcase', rooms: ['study', 'living', 'bedroom', 'kids'], style: 'modern',
      description: 'A three-by-three grid of open cubes for books and baskets. The top is a surface for lamps.',
      tags: [...BOOKS, 'surface'], packs: ['modern-minimal'], tier: 'budget', price: dollars(160), quality: 2, surfaceHeight: r3(bookcaseCube.box.y1), slots: [useFront('use', 0.5, bookcaseCube, 1)],
      interactions: READ, stats: { skill: 0.9, fun: 0.9 }, finishes: [wood2, region('baskets', 'Baskets', ['carpetBlue'], k.FABRIC_BLUE)],
    }),
    store(bookcaseLadder, FP11, {
      id: 'bookcase-ladder', name: 'Ladder Shelf', subcategory: 'bookcase', rooms: ['study', 'living', 'bedroom'], style: 'rustic',
      description: 'A leaning ladder frame with five shelves that get shallower towards the top. Light, airy and half the price of a bookcase.',
      tags: BOOKS, packs: ['cozy-cottage'], tier: 'budget', price: dollars(120), quality: 2, slots: [useFront('use', 0.5, bookcaseLadder, 1)],
      interactions: READ, stats: { skill: 0.9, fun: 0.9 }, finishes: [wood2],
    }),
    store(bookcaseGlass, FP11, {
      id: 'bookcase-glazed-library', name: 'Glazed Library Bookcase', subcategory: 'bookcase', rooms: ['study', 'living'], style: 'classic',
      description: 'A tall mahogany-look bookcase behind two glass doors. The doors swing open when you pick out a book.',
      tags: BOOKS, packs: ['classic-townhouse'], tier: 'premium', price: dollars(690), quality: 4, slots: [useFront('use', 0.5, bookcaseGlass, 1)],
      interactions: READ, stats: { skill: 1.15, fun: 1.1, environment: 2 }, finishes: [wood2, metalR(['metal'])],
      anim: {
        kind: 'openWhileUsed', on: READ,
        parts: [
          { node: 'anim:doorL', role: 'door', axis: 'y', angle: -1.75 },
          { node: 'anim:doorR', role: 'door2', axis: 'y', angle: 1.75 },
        ],
      },
    }),
    store(bookcaseLow, FP21, {
      id: 'bookcase-low-wide', name: 'Low Wide Bookcase', subcategory: 'bookcase', rooms: ['study', 'living', 'kids'], style: 'modern',
      description: 'A long waist-high bookcase with six cubbies. Plenty of room on top for plants and photographs.',
      tags: [...BOOKS, 'surface'], packs: ['modern-minimal'], tier: 'budget', price: dollars(210), quality: 2, surfaceHeight: r3(bookcaseLow.box.y1),
      slots: [useFront('left', 0.5, bookcaseLow, 1), useFront('right', 1.5, bookcaseLow, 1)],
      interactions: READ, stats: { skill: 0.9, fun: 0.95 }, finishes: [wood2],
    }),
    store(bookcasePipe, FP21, {
      id: 'bookcase-pipe-plank', name: 'Pipe and Plank Bookcase', subcategory: 'bookcase', rooms: ['study', 'living'], style: 'industrial',
      description: 'Five thick planks between black steel posts. Heavy enough to hold a whole library.',
      tags: BOOKS, packs: ['industrial-loft'], tier: 'standard', price: dollars(330), quality: 3,
      slots: [useFront('left', 0.5, bookcasePipe, 1), useFront('right', 1.5, bookcasePipe, 1)],
      interactions: READ, stats: { skill: 1.05, fun: 1 }, finishes: [woodR(['wood']), frameR('Frame')],
    }),
    store(bookcaseMid, FP11, {
      id: 'bookcase-mid-century', name: 'Teak Mid-Century Bookcase', subcategory: 'bookcase', rooms: ['study', 'living'], style: 'mid-century',
      description: 'Staggered open shelves in warm teak on four tapered legs. A little ornament and a lot of books.',
      tags: BOOKS, packs: ['mid-century'], tier: 'standard', price: dollars(380), quality: 3, slots: [useFront('use', 0.5, bookcaseMid, 1)],
      interactions: READ, stats: { skill: 1.05, fun: 1.05, environment: 1 }, finishes: [wood2],
    }),
  );

  // --- Cabinets, sideboards and media units ----------------------------------------------------------
  const displayCabinet = fit('displayCabinet', FP11, 2, { back: WALL_GAP });
  const hutch = fit('chinaHutch', FP21, 2, { back: WALL_GAP });
  const sideboardMid = fit('sideboardMidCentury', FP21, 2, { back: WALL_GAP });
  const sideboardRustic = fit('sideboardRustic', FP21, 2, { back: WALL_GAP });
  const credenza = fit('credenzaModern', FP21, 2, { back: WALL_GAP });
  const mediaModern = fit('mediaCabinetModern', FP21, 2, { back: WALL_GAP });
  const mediaPipe = fit('mediaConsoleIndustrial', FP21, 2, { back: WALL_GAP });
  defs.push(
    store(displayCabinet, FP11, {
      id: 'cabinet-display-glass', name: 'Glass Display Cabinet', subcategory: 'cabinet', rooms: ['living', 'dining'], style: 'classic',
      description: 'A glass vitrine with three shelves of porcelain. Decorative.',
      tags: ['cabinet', 'storage', 'decor'], packs: ['classic-townhouse'], tier: 'premium', price: dollars(590), quality: 4, functional: false, stats: { environment: 2 },
      finishes: [wood2],
    }),
    store(hutch, FP21, {
      id: 'cabinet-china-hutch', name: 'China Hutch', subcategory: 'cabinet', rooms: ['dining', 'kitchen', 'living'], style: 'cottage',
      description: 'A farmhouse dresser: shut doors below, a glass-fronted hutch of plates and jugs above. Decorative.',
      tags: ['cabinet', 'storage', 'decor'], packs: ['cozy-cottage', 'classic-townhouse'], tier: 'premium', price: dollars(980), quality: 4, functional: false, stats: { environment: 3 },
      finishes: [wood2],
    }),
    store(sideboardMid, FP21, {
      id: 'sideboard-mid-century', name: 'Mid-Century Sideboard', subcategory: 'sideboard', rooms: ['dining', 'living'], style: 'mid-century',
      description: 'A long teak sideboard on tapered legs with a central bank of drawers. A fine stand for a lamp or a record player.',
      tags: ['sideboard', 'storage', 'surface'], packs: ['mid-century'], tier: 'premium', price: dollars(760), quality: 4, surfaceHeight: r3(sideboardMid.box.y1), stats: { environment: 2 },
      finishes: [wood2, metalR(['metal'])],
    }),
    store(sideboardRustic, FP21, {
      id: 'sideboard-rustic-plank', name: 'Plank-Door Sideboard', subcategory: 'sideboard', rooms: ['dining', 'kitchen', 'living'], style: 'rustic',
      description: 'Heavy plank doors with crossed bracing and iron pulls. Looks as if it has stood in the same barn for a century.',
      tags: ['sideboard', 'storage', 'surface'], packs: ['cozy-cottage'], tier: 'standard', price: dollars(480), quality: 3, surfaceHeight: r3(sideboardRustic.box.y1), stats: { environment: 1 },
      finishes: [wood2, frameR('Pulls')],
    }),
    store(credenza, FP21, {
      id: 'credenza-modern-lacquer', name: 'Lacquer Credenza', subcategory: 'sideboard', rooms: ['dining', 'living', 'study'], style: 'modern',
      description: 'A low white credenza with four flat push-to-open doors and a wooden top.',
      tags: ['sideboard', 'storage', 'surface'], packs: ['modern-minimal'], tier: 'standard', price: dollars(590), quality: 3, surfaceHeight: r3(credenza.box.y1), stats: { environment: 1 },
      finishes: [applianceR(['metalLight']), woodR(['wood']), frameR('Base')],
    }),
    store(mediaModern, FP21, {
      id: 'media-cabinet-open-cubbies', name: 'Cubby Media Cabinet', subcategory: 'media', rooms: ['living', 'bedroom'], style: 'modern',
      description: 'A low media unit with open cubbies for consoles and closed doors for the clutter. A television stands on top.',
      tags: ['tv-stand', 'surface', 'storage'], packs: ['modern-minimal'], tier: 'standard', price: dollars(330), quality: 3, surfaceHeight: r3(mediaModern.box.y1),
      finishes: [wood2, metalR(['metal'])],
    }),
    store(mediaPipe, FP21, {
      id: 'media-console-steel-glass', name: 'Steel and Glass Media Console', subcategory: 'media', rooms: ['living', 'bedroom'], style: 'industrial',
      description: 'A wood-topped steel frame with glass doors and two shelves. A television stands on top.',
      tags: ['tv-stand', 'surface', 'storage'], packs: ['industrial-loft'], tier: 'standard', price: dollars(300), quality: 3, surfaceHeight: r3(mediaPipe.box.y1),
      finishes: [woodR(['wood']), frameR('Frame')],
    }),
  );

  // --- Filing, entryway, wall and tall household storage ------------------------------------------------
  const filing = fit('filingCabinet', FP11, 2, { back: WALL_GAP });
  const filingLat = fit('filingLateral', FP21, 2, { back: WALL_GAP });
  const shoeRack = fit('shoeRack', FP11, 2, { back: WALL_GAP });
  const shoeCab = fit('shoeCabinet', FP11, 2, { back: WALL_GAP });
  const hallTree = fit('hallTree', FP11, 2, { back: WALL_GAP });
  const hatStand = fit('hatStand', FP11, 2);
  const wallShelf = fit('wallShelfFloating', FP11, 2, { back: WALL_GAP, lift: 1.3 });
  const wallBracket = fit('wallShelfBracket', FP11, 2, { back: WALL_GAP, lift: 1.1 });
  const linen = fit('linenCupboard', FP11, 2, { back: WALL_GAP });
  const larder = fit('larderCupboard', FP11, 2, { back: WALL_GAP });
  defs.push(
    store(filing, FP11, {
      id: 'filing-cabinet-four', name: 'Four-Drawer Filing Cabinet', subcategory: 'filing', rooms: ['study'], style: 'budget',
      description: 'A grey steel cabinet for paperwork nobody wants to look at. Decorative.',
      tags: ['filing', 'storage', 'decor'], tier: 'budget', price: dollars(120), quality: 2, functional: false,
      finishes: [region('body', 'Cabinet', ['metalMedium'], k.METAL_MEDIUM), metalR(['metalLight'])],
    }),
    store(filingLat, FP21, {
      id: 'filing-lateral-wood-top', name: 'Lateral Filing Cabinet', subcategory: 'filing', rooms: ['study'], style: 'modern',
      description: 'A wide two-drawer steel file with a wooden top that doubles as a shelf for a printer or a plant.',
      tags: ['filing', 'storage', 'surface'], packs: ['modern-minimal'], tier: 'standard', price: dollars(240), quality: 3, surfaceHeight: r3(filingLat.box.y1),
      finishes: [woodR(['wood']), region('body', 'Cabinet', ['metalMedium'], k.METAL_MEDIUM)],
    }),
    store(shoeRack, FP11, {
      id: 'shoe-rack-slatted', name: 'Slatted Shoe Rack', subcategory: 'entryway', rooms: ['living', 'bedroom'], style: 'budget',
      description: 'Three slatted tiers for muddy boots and good shoes. The top takes keys and a bowl.',
      tags: ['shoe-rack', 'storage', 'surface'], tier: 'budget', price: dollars(55), quality: 1, surfaceHeight: 0.6,
      finishes: [wood2],
    }),
    store(shoeCab, FP11, {
      id: 'shoe-cabinet-tip-out', name: 'Tip-Out Shoe Cabinet', subcategory: 'entryway', rooms: ['living', 'bedroom'], style: 'modern',
      description: 'A slim white cabinet with three tip-out drawers that hides a whole family\'s shoes. Decorative.',
      tags: ['shoe-rack', 'storage', 'decor'], packs: ['modern-minimal'], tier: 'standard', price: dollars(160), quality: 3, functional: false,
      finishes: [applianceR(['metalLight']), woodR(['wood'])],
    }),
    store(hallTree, FP11, {
      id: 'hall-tree-bench', name: 'Hall Tree with Bench', subcategory: 'coat-rack', rooms: ['living', 'bedroom'], style: 'cottage',
      description: 'A storage bench with a mirror and a row of coat hooks above: the entryway in one piece. Decorative.',
      tags: ['coat-rack', 'storage', 'decor'], packs: ['cozy-cottage'], tier: 'premium', price: dollars(480), quality: 4, functional: false, stats: { environment: 2 },
      finishes: [wood2, region('seat', 'Seat Pad', ['carpetBlue'], k.FABRIC_BLUE)],
    }),
    store(hatStand, FP11, {
      id: 'hat-stand-brass', name: 'Brass Hat and Coat Stand', subcategory: 'coat-rack', rooms: ['living', 'bedroom'], style: 'classic',
      description: 'A slim brass pole with four hooks and an umbrella ring. Decorative.',
      tags: ['coat-rack', 'decor'], packs: ['classic-townhouse'], tier: 'standard', price: dollars(135), quality: 3, functional: false, stats: { environment: 1 },
      finishes: [metalR(['metal']), frameR('Base')],
    }),
    obj(wallShelf, {
      id: 'wall-shelf-floating-pair', name: 'Floating Wall Shelves', category: 'storage', subcategory: 'wall-shelf', rooms: ['living', 'bedroom', 'study', 'kitchen'], style: 'modern',
      description: 'Two plank shelves on one backing rail, hung on any free stretch of wall. Decorative.',
      tags: ['shelf', 'storage', 'decor', 'wall'], packs: ['modern-minimal'], tier: 'budget', price: dollars(70), quality: 2, functional: false,
      footprint: FP11, layer: 'wall', needsWall: true, blocksMovement: false, stats: { environment: 1 }, finishes: [wood2],
    }),
    obj(wallBracket, {
      id: 'wall-shelf-bracket', name: 'Bracket Shelf', category: 'storage', subcategory: 'wall-shelf', rooms: ['living', 'bedroom', 'study', 'kitchen', 'bathroom'], style: 'industrial',
      description: 'One thick plank on two steel brackets, with a potted plant and a couple of books. Decorative.',
      tags: ['shelf', 'storage', 'decor', 'wall'], packs: ['industrial-loft'], tier: 'budget', price: dollars(55), quality: 2, functional: false,
      footprint: FP11, layer: 'wall', needsWall: true, blocksMovement: false, stats: { environment: 1 }, finishes: [woodR(['wood']), frameR('Brackets')],
    }),
    store(linen, FP11, {
      id: 'cupboard-linen', name: 'Linen Cupboard', subcategory: 'cabinet', rooms: ['bathroom', 'bedroom'], style: 'cottage',
      description: 'A tall painted cupboard with an open shelf of folded towels above two shut doors. Decorative.',
      tags: ['cabinet', 'storage', 'decor'], packs: ['cozy-cottage', 'coastal-home'], tier: 'standard', price: dollars(290), quality: 3, functional: false, stats: { environment: 1 },
      finishes: [wood2, region('towels', 'Towels', ['carpetBlue'], k.FABRIC_BLUE)],
    }),
    store(larder, FP11, {
      id: 'cabinet-larder', name: 'Larder Cupboard', subcategory: 'cabinet', rooms: ['kitchen', 'dining'], style: 'cottage',
      description: 'A tall kitchen cupboard with glazed top doors, a deep drawer and plank doors below. Decorative.',
      tags: ['cabinet', 'storage', 'decor'], packs: ['cozy-cottage'], tier: 'standard', price: dollars(340), quality: 3, functional: false, stats: { environment: 1 },
      finishes: [wood2, metalR(['metal'])],
    }),
  );

  return defs;
}
