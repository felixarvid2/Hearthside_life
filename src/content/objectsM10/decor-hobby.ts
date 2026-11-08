// Milestone 10 designs, group "decor-hobby". Models: tools/furniture-extra/m10/decor-hobby.mjs
// (build: node tools/build-extra-furniture.mjs --only=decor-hobby). Guide: dev/ds-tasks/m10f/AUTHORING.md.
// Edit only this group's files.
//
// Decor: rugs, plants (all can be watered), vases, sculpture, clocks, mirrors, pictures, fireplaces and tabletop pieces.
// Hobby: functional pieces copy the existing object of the same job (piano -> playPiano/busk, easel -> paintCanvas/paintToSell,
// treadmill -> workOut, weight bench -> liftWeights, chess table -> playChess, telescope -> researchSky, yoga mat -> doYoga/stretch,
// bookcase -> readBook/readSkillBook, plant -> waterPlant). Instruments without a skill interaction (drums, harp, cello) are display pieces.

import type { ObjectDef } from '../types';
import type { ObjectKit } from '../objects';

export default function build(k: ObjectKit): ObjectDef[] {
  const { fit, obj, sit, sw, region, useFront, woodR, metalR, applianceR, darkMetalR, r3, FP11, FP21, FP12, FP22, WALL_GAP, dollars } = k;
  const { WOOD, FABRIC, FABRIC_BLUE, FABRIC_BRICK, METAL, METAL_MEDIUM, METAL_DARK } = k;

  // --- palettes and regions --------------------------------------------------------------------
  const CREAM = [
    sw('cream', 'Cream', '#f8ffff'), sw('oat', 'Oat', '#e4d8c3'), sw('dove', 'Dove Grey', '#b9bcc2'), sw('sand', 'Sand', '#d9c29a'),
    sw('blush', 'Blush', '#f0cfc9'), sw('sage', 'Sage', '#b5c8b0'), sw('charcoal', 'Charcoal', '#4b4b50'),
  ];
  const DARKWOOD = [sw('dark-oak', 'Dark Oak', '#ad744c'), ...WOOD.slice(1)];
  const FUR = [
    sw('hide-brown', 'Hide Brown', '#a5754c'), sw('black', 'Black', '#2e2a28'), sw('grey', 'Grey', '#8a8782'),
    sw('tan', 'Tan', '#c9a27a'), sw('espresso', 'Espresso', '#4a3427'), sw('rust', 'Rust', '#b45a3a'),
  ];
  const fab = (id: string, label: string, mats: string[]) =>
    region(id, label, mats, mats[0] === 'carpet' ? FABRIC : mats[0] === 'carpetBlue' ? FABRIC_BLUE : mats[0] === 'carpetDarker' ? FABRIC_BRICK : CREAM);
  const wood2 = () => woodR(['wood', 'woodDark']);
  const darkWood = (label = 'Wood') => region('wood', label, ['woodDark'], DARKWOOD);
  const metal = () => metalR(['metal']);
  const steelFrame = (label = 'Frame') => darkMetalR(label);

  const floor = { layer: 'floor' as const, blocksMovement: true };
  const surf = { layer: 'surface' as const, blocksMovement: false };
  const rugL = { layer: 'rug' as const, blocksMovement: false };
  const wallL = { layer: 'wall' as const, needsWall: true, blocksMovement: false };
  const PLANT = ['plant', 'decor', 'garden'];
  const rugFp = (w: number, d: number) => ({ w, d });

  // --- fits ------------------------------------------------------------------------------------
  const f = (name: string, fp: { w: number; d: number }, o: { back?: number; lift?: number } = {}) => fit(name, fp, 2, o);

  const rugRunner = f('rugRunner', rugFp(3, 1)), rugBraided = f('rugBraidedOval', rugFp(3, 2)), rugHex = f('rugHexGeo', FP22);
  const rugPersian = f('rugPersian', rugFp(3, 2)), rugShag = f('rugShag', FP22), rugKilim = f('rugKilim', rugFp(3, 2));
  const rugCow = f('rugCowhide', FP22), rugChecker = f('rugChecker', FP22), rugSun = f('rugSunburst', FP22), doormat = f('rugDoormatCoir', FP11);

  const fig = f('plantFiddleFig', FP11), monstera = f('plantMonstera', FP11), palm = f('plantPalmAreca', FP11), bonsai = f('plantBonsai', FP11);
  const cactusTall = f('plantCactusTall', FP11), cactusTrio = f('plantCactusTrio', FP11), fernStand = f('plantFernStand', FP11);
  const succTray = f('plantSucculentTray', FP11), orchid = f('plantOrchid', FP11), olive = f('plantOliveTree', FP11);
  const terrarium = f('terrarium', FP11), herbBox = f('plantHerbBox', FP11);

  const vaseTall = f('vaseFloorTall', FP11), vaseRound = f('vaseRound', FP11), vaseFlowers = f('vaseFlowers', FP11);
  const sculptAbs = f('sculptureAbstract', FP11), sculptBust = f('sculptureBust', FP11);
  const grandfather = f('clockGrandfather', FP11, { back: WALL_GAP }), clockRound = f('clockWallRound', FP11, { back: WALL_GAP, lift: 1.9 });
  const cuckoo = f('clockCuckoo', FP11, { back: WALL_GAP, lift: 1.6 });
  const cheval = f('mirrorCheval', FP11), mirrorRound = f('mirrorWallRound', FP11, { back: WALL_GAP, lift: 1.2 });
  const sunburst = f('mirrorSunburst', FP11, { back: WALL_GAP, lift: 1.15 });
  const picLand = f('pictureLandscape', FP11, { back: WALL_GAP, lift: 1.4 }), picGallery = f('pictureGallery', FP21, { back: WALL_GAP, lift: 1.2 });
  const picPortrait = f('picturePortrait', FP11, { back: WALL_GAP, lift: 1.3 });
  const globeFloor = f('globeFloor', FP11), globeDesk = f('globeDesk', FP11);
  const aquarium = f('aquarium', FP21, { back: WALL_GAP }), screen = f('screenDivider', FP21);
  const fireBrick = f('fireplaceBrick', FP21, { back: WALL_GAP }), fireStove = f('fireplaceStove', FP11, { back: WALL_GAP });
  const candles = f('candles', FP11), candelabra = f('candelabraThreeArm', FP11), bowlFruit = f('bowlFruit', FP11), bowlDuo = f('bowlCeramicDuo', FP11);
  const bookends = f('bookends', FP11), trophy = f('trophyCup', FP11), umbrella = f('umbrellaStand', FP11), magRack = f('magazineRack', FP11);
  const pouf = f('poufCushions', FP11), basket = f('basketThrow', FP11), chime = f('windChime', FP11, { back: WALL_GAP, lift: 1.3 });

  const grand = f('pianoGrand', FP22, { back: WALL_GAP }), cottagePiano = f('pianoCottage', FP21, { back: WALL_GAP });
  const kbDigital = f('keyboardDigital', FP21), kbStage = f('keyboardStage', FP21), harpsi = f('harpsichord', FP12, { back: WALL_GAP });
  const organ = f('organParlour', FP21, { back: WALL_GAP }), drums = f('drumKit', FP22), harp = f('harpConcert', FP11), cello = f('celloStand', FP11);
  const easelTop = f('easelTabletop', FP11), easelGal = f('easelGallery', FP11), easelFr = f('easelFrench', FP11);
  const craft = f('craftTable', FP21), sewing = f('sewingTable', FP11);
  const bike = f('exerciseBike', FP11), rower = f('rowingMachine', FP12), bag = f('punchingBag', FP11), rack = f('squatRack', FP12);
  const elliptical = f('ellipticalTrainer', FP12), yogaRound = f('yogaMatRound', FP11);
  const chessMarble = f('chessTableMarble', FP11), gameTable = f('boardGameTable', FP21), telescope = f('telescopeBrass', FP11);
  const workbench = f('workbenchWoodworking', FP21, { back: WALL_GAP }), nook = f('readingNookShelf', FP21, { back: WALL_GAP }), potting = f('pottingBench', FP21, { back: WALL_GAP });

  const FP32 = { w: 3, d: 2 };
  const poolT = f('poolTable', FP32), dartB = f('dartBoard', FP11, { back: WALL_GAP, lift: 1.4 }), foos = f('foosballTable', FP21);
  const ttTable = f('tableTennisTable', FP32), wheel = f('potteryWheel', FP11);
  const game = (tags: string[]) => ({ tags: [...tags, 'game', 'fun'], functional: true as const });

  const music = (extra: { stats: ObjectDef['stats'] }) => ({
    tags: ['piano', 'instrument', 'music', 'creative'], interactions: ['playPiano', 'busk'], functional: true, ...extra,
  });
  const centreX = (fi: ReturnType<typeof f>) => fi.at(0.5, 0)[0];

  return [
    // ===== Decor: rugs =========================================================================
    obj(rugRunner, {
      id: 'rug-runner-striped', name: 'Striped Hall Runner', category: 'decor', subcategory: 'rug', rooms: ['living', 'dining', 'kitchen'], style: 'classic',
      description: 'A long narrow runner with cream stripes and fringed ends, made for hallways and the length of a kitchen. Decorative; people walk over it.',
      tags: ['rug', 'decor', 'runner'], packs: ['classic-townhouse'], tier: 'budget', price: dollars(120), quality: 2, functional: false,
      footprint: rugFp(3, 1), ...rugL, stats: { environment: 2 }, finishes: [fab('rug', 'Rug', ['carpet', 'carpetDarker'])],
    }),
    obj(rugBraided, {
      id: 'rug-braided-oval', name: 'Braided Oval Rug', category: 'decor', subcategory: 'rug', rooms: ['living', 'bedroom', 'kitchen'], style: 'cottage',
      description: 'A chunky oval rug of concentric braided rings in warm colours. A farmhouse classic. Decorative; people walk over it.',
      tags: ['rug', 'decor'], packs: ['cozy-cottage'], tier: 'budget', price: dollars(170), quality: 2, functional: false,
      footprint: rugFp(3, 2), ...rugL, stats: { environment: 2 }, finishes: [fab('rug', 'Rug', ['carpet', 'carpetDarker'])],
    }),
    obj(rugHex, {
      id: 'rug-hexagon-geometric', name: 'Hexagon Geometric Rug', category: 'decor', subcategory: 'rug', rooms: ['living', 'bedroom', 'study'], style: 'modern',
      description: 'A six-sided rug of nested hexagons in a bold two-tone palette. Decorative; people walk over it.',
      tags: ['rug', 'decor'], packs: ['modern-minimal'], tier: 'standard', price: dollars(210), quality: 3, functional: false,
      footprint: FP22, ...rugL, stats: { environment: 2 }, finishes: [fab('rug', 'Rug', ['carpet', 'carpetDarker'])],
    }),
    obj(rugPersian, {
      id: 'rug-persian-medallion', name: 'Medallion Heirloom Rug', category: 'decor', subcategory: 'rug', rooms: ['living', 'dining', 'bedroom', 'study'], style: 'luxury',
      description: 'A deep-pile heirloom rug with a nested diamond medallion, corner motifs and a knotted fringe. Decorative; people walk over it.',
      tags: ['rug', 'decor'], packs: ['classic-townhouse', 'art-deco'], tier: 'luxury', price: dollars(1650), quality: 5, functional: false,
      footprint: rugFp(3, 2), ...rugL, stats: { environment: 4 },
      finishes: [fab('rug', 'Rug', ['carpet', 'carpetDarker']), fab('medallion', 'Medallion', ['carpetBlue'])],
    }),
    obj(rugShag, {
      id: 'rug-shag-cream', name: 'Cloud Shag Rug', category: 'decor', subcategory: 'rug', rooms: ['living', 'bedroom', 'kids'], style: 'budget',
      description: 'A square rug with a thick, soft pile and a coloured ring in the middle: cheap, cosy and good for bare feet. Decorative.',
      tags: ['rug', 'decor'], packs: ['everyday-essentials'], tier: 'budget', price: dollars(80), quality: 2, functional: false,
      footprint: FP22, ...rugL, stats: { environment: 1 }, finishes: [fab('pile', 'Pile', ['carpetWhite']), fab('ring', 'Ring', ['carpet'])],
    }),
    obj(rugKilim, {
      id: 'rug-kilim-striped', name: 'Kilim Stripe Rug', category: 'decor', subcategory: 'rug', rooms: ['living', 'bedroom', 'study'], style: 'mid-century',
      description: 'A flat-woven rug of broad coloured bands with fine cross stripes and fringed ends. Decorative; people walk over it.',
      tags: ['rug', 'decor'], packs: ['mid-century'], tier: 'standard', price: dollars(280), quality: 3, functional: false,
      footprint: rugFp(3, 2), ...rugL, stats: { environment: 2 }, finishes: [fab('rug', 'Rug', ['carpet', 'carpetDarker']), fab('bands', 'Bands', ['carpetBlue'])],
    }),
    obj(rugCow, {
      id: 'rug-cowhide-patch', name: 'Patchwork Cowhide Rug', category: 'decor', subcategory: 'rug', rooms: ['living', 'study', 'bedroom'], style: 'rustic',
      description: 'A natural-shaped hide rug with dark patches: a lodge look for the foot of a sofa. Decorative; people walk over it.',
      tags: ['rug', 'decor', 'rustic'], packs: ['cozy-cottage'], tier: 'standard', price: dollars(340), quality: 3, functional: false,
      footprint: FP22, ...rugL, stats: { environment: 2 }, finishes: [fab('hide', 'Hide', ['carpetWhite']), region('patches', 'Patches', ['fur'], FUR)],
    }),
    obj(rugChecker, {
      id: 'rug-checkerboard', name: 'Checkerboard Kitchen Rug', category: 'decor', subcategory: 'rug', rooms: ['kitchen', 'dining', 'kids'], style: 'cottage',
      description: 'A square cotton rug in a six-by-six chequer with a solid border. Cheerful under a table. Decorative; people walk over it.',
      tags: ['rug', 'decor'], packs: ['everyday-essentials', 'cozy-cottage'], tier: 'budget', price: dollars(95), quality: 2, functional: false,
      footprint: FP22, ...rugL, stats: { environment: 1 }, finishes: [fab('rug', 'Rug', ['carpet', 'carpetDarker']), fab('squares', 'Pale squares', ['carpetWhite'])],
    }),
    obj(rugSun, {
      id: 'rug-sunburst-deco', name: 'Sunburst Deco Rug', category: 'decor', subcategory: 'rug', rooms: ['living', 'bedroom', 'dining'], style: 'luxury',
      description: 'A round rug with alternating rays radiating from a jewel-toned centre: an Art Deco statement piece. Decorative; people walk over it.',
      tags: ['rug', 'decor'], packs: ['art-deco'], tier: 'premium', price: dollars(620), quality: 4, functional: false,
      footprint: FP22, ...rugL, stats: { environment: 3 }, finishes: [fab('rug', 'Rug', ['carpet', 'carpetDarker']), fab('rays', 'Rays', ['carpetBlue'])],
    }),
    obj(doormat, {
      id: 'doormat-coir', name: 'Coir Doormat', category: 'decor', subcategory: 'rug', rooms: ['living', 'kitchen', 'outdoor'], style: 'rustic',
      description: 'A stiff coir mat with a ridged border, for scraping boots at the door. Decorative; people walk over it.',
      tags: ['rug', 'decor', 'doormat'], packs: ['everyday-essentials', 'garden-patio'], tier: 'budget', price: dollars(18), quality: 1, functional: false,
      footprint: FP11, ...rugL, stats: { environment: 1 }, finishes: [wood2()],
    }),

    // ===== Decor: plants =======================================================================
    obj(fig, {
      id: 'plant-fiddle-fig', name: 'Fiddle-Leaf Fig', category: 'decor', subcategory: 'plant', rooms: ['living', 'bedroom', 'study', 'dining'], style: 'botanical',
      description: 'A slim tree with big violin-shaped leaves in a wooden planter. Give it a drink now and then.',
      tags: PLANT, packs: ['botanical-living', 'modern-minimal'], tier: 'standard', price: dollars(140), quality: 3, functional: true,
      footprint: FP11, ...floor, interactions: ['waterPlant'], stats: { environment: 3 }, finishes: [wood2()],
    }),
    obj(monstera, {
      id: 'plant-monstera', name: 'Monstera', category: 'decor', subcategory: 'plant', rooms: ['living', 'bedroom', 'study'], style: 'botanical',
      description: 'A spreading floor plant with huge glossy leaves on long stems. Water it to train gardening.',
      tags: PLANT, packs: ['botanical-living'], tier: 'standard', price: dollars(110), quality: 3, functional: true,
      footprint: FP11, ...floor, interactions: ['waterPlant'], stats: { environment: 3 }, finishes: [wood2()],
    }),
    obj(palm, {
      id: 'plant-areca-palm', name: 'Areca Palm', category: 'decor', subcategory: 'plant', rooms: ['living', 'bedroom', 'dining', 'study'], style: 'botanical',
      description: 'A feathery palm with arching fronds, tall enough to fill a corner. Water it now and then.',
      tags: PLANT, packs: ['botanical-living', 'coastal-home'], tier: 'standard', price: dollars(160), quality: 3, functional: true,
      footprint: FP11, ...floor, interactions: ['waterPlant'], stats: { environment: 3 }, finishes: [wood2()],
    }),
    obj(bonsai, {
      id: 'plant-bonsai-tray', name: 'Bonsai on a Tray', category: 'decor', subcategory: 'plant', rooms: ['living', 'study', 'dining'], style: 'luxury',
      description: 'A trained miniature tree in a shallow pot on a wooden tray. A patient hobbyist\'s centrepiece; it still needs watering.',
      tags: PLANT, packs: ['botanical-living'], tier: 'premium', price: dollars(260), quality: 4, functional: true,
      footprint: FP11, ...surf, interactions: ['waterPlant'], stats: { environment: 2 }, finishes: [wood2()],
    }),
    obj(cactusTall, {
      id: 'plant-cactus-tall', name: 'Tall Column Cactus', category: 'decor', subcategory: 'plant', rooms: ['living', 'bedroom', 'study', 'outdoor'], style: 'rustic',
      description: 'A waist-high cactus with two arms in a clay pot. Hardly needs watering, but can be.',
      tags: PLANT, packs: ['botanical-living', 'garden-patio'], tier: 'budget', price: dollars(90), quality: 2, functional: true,
      footprint: FP11, ...floor, interactions: ['waterPlant'], stats: { environment: 2 }, finishes: [wood2()],
    }),
    obj(cactusTrio, {
      id: 'plant-cactus-trio', name: 'Cactus Trio Tray', category: 'decor', subcategory: 'plant', rooms: ['living', 'kitchen', 'study', 'bedroom'], style: 'budget',
      description: 'Three little cacti in a wooden tray, a cheap way to green up a sill or shelf. Can be watered.',
      tags: PLANT, packs: ['botanical-living', 'everyday-essentials'], tier: 'budget', price: dollars(35), quality: 2, functional: true,
      footprint: FP11, ...surf, interactions: ['waterPlant'], stats: { environment: 1 }, finishes: [wood2()],
    }),
    obj(fernStand, {
      id: 'plant-fern-stand', name: 'Fern on a Tripod Stand', category: 'decor', subcategory: 'plant', rooms: ['living', 'bedroom', 'bathroom', 'study'], style: 'mid-century',
      description: 'A shaggy fern in a pot on a three-legged wooden stand. Keeps the floor free and the leaves high. Water it now and then.',
      tags: PLANT, packs: ['botanical-living', 'mid-century'], tier: 'standard', price: dollars(120), quality: 3, functional: true,
      footprint: FP11, ...floor, interactions: ['waterPlant'], stats: { environment: 3 }, finishes: [wood2()],
    }),
    obj(succTray, {
      id: 'plant-succulent-tray', name: 'Succulent Garden Tray', category: 'decor', subcategory: 'plant', rooms: ['living', 'kitchen', 'bathroom', 'study'], style: 'modern',
      description: 'A shallow wooden tray planted with five rosette succulents. Water sparingly.',
      tags: PLANT, packs: ['botanical-living', 'modern-minimal'], tier: 'budget', price: dollars(45), quality: 2, functional: true,
      footprint: FP11, ...surf, interactions: ['waterPlant'], stats: { environment: 1 }, finishes: [wood2()],
    }),
    obj(orchid, {
      id: 'plant-orchid', name: 'White Orchid', category: 'decor', subcategory: 'plant', rooms: ['living', 'bedroom', 'bathroom', 'dining'], style: 'luxury',
      description: 'A phalaenopsis orchid with a spray of white blooms in a small pot. Elegant on a table or windowsill; water it gently.',
      tags: PLANT, packs: ['botanical-living'], tier: 'standard', price: dollars(70), quality: 3, functional: true,
      footprint: FP11, ...surf, interactions: ['waterPlant'], stats: { environment: 2 }, finishes: [wood2()],
    }),
    obj(olive, {
      id: 'plant-olive-tree', name: 'Potted Olive Tree', category: 'decor', subcategory: 'plant', rooms: ['living', 'dining', 'outdoor', 'kitchen'], style: 'coastal',
      description: 'A small olive tree with a twisted trunk in a square wooden planter. Water it to train gardening.',
      tags: PLANT, packs: ['coastal-home', 'garden-patio'], tier: 'premium', price: dollars(320), quality: 4, functional: true,
      footprint: FP11, ...floor, interactions: ['waterPlant'], stats: { environment: 4 }, finishes: [wood2()],
    }),
    obj(terrarium, {
      id: 'terrarium-glass', name: 'Glass Terrarium', category: 'decor', subcategory: 'plant', rooms: ['living', 'study', 'bedroom', 'kids'], style: 'industrial',
      description: 'A steel-framed glass box with soil, a rock and a few ferns, open at the front. A tiny landscape for a desk or shelf; mist it now and then.',
      tags: PLANT, packs: ['botanical-living', 'industrial-loft'], tier: 'standard', price: dollars(85), quality: 3, functional: true,
      footprint: FP11, ...surf, interactions: ['waterPlant'], stats: { environment: 2 }, finishes: [steelFrame('Frame')],
    }),
    obj(herbBox, {
      id: 'plant-herb-crate', name: 'Herb Crate', category: 'decor', subcategory: 'plant', rooms: ['kitchen', 'dining', 'outdoor'], style: 'cottage',
      description: 'Three tin pots of kitchen herbs in a wooden crate. Water them and they smell wonderful.',
      tags: PLANT, packs: ['cozy-cottage', 'garden-patio'], tier: 'budget', price: dollars(40), quality: 2, functional: true,
      footprint: FP11, ...surf, interactions: ['waterPlant'], stats: { environment: 2 }, finishes: [wood2(), steelFrame('Pots')],
    }),

    // ===== Decor: vases, sculpture, clocks, mirrors, pictures, globes ==========================
    obj(vaseTall, {
      id: 'vase-floor-tall', name: 'Tall Floor Vase', category: 'decor', subcategory: 'vase', rooms: ['living', 'dining', 'bedroom'], style: 'modern',
      description: 'A knee-to-hip-high ceramic vase with a painted band and a few dry branches. Decorative.',
      tags: ['vase', 'decor'], packs: ['modern-minimal'], tier: 'standard', price: dollars(130), quality: 3, functional: false,
      footprint: FP11, ...floor, stats: { environment: 2 }, finishes: [fab('ceramic', 'Ceramic', ['carpetWhite']), fab('band', 'Band', ['carpetBlue'])],
    }),
    obj(vaseRound, {
      id: 'vase-round-blue', name: 'Round Glazed Vase', category: 'decor', subcategory: 'vase', rooms: ['living', 'dining', 'bedroom', 'study'], style: 'mid-century',
      description: 'A fat glazed vase with a cream stripe, for shelves and sideboards. Decorative.',
      tags: ['vase', 'decor'], packs: ['mid-century'], tier: 'budget', price: dollars(40), quality: 2, functional: false,
      footprint: FP11, ...surf, stats: { environment: 1 }, finishes: [fab('glaze', 'Glaze', ['carpetBlue']), fab('foot', 'Stripe', ['carpetWhite'])],
    }),
    obj(vaseFlowers, {
      id: 'vase-flower-bouquet', name: 'Flower Bouquet', category: 'decor', subcategory: 'vase', rooms: ['living', 'dining', 'kitchen', 'bedroom'], style: 'cottage',
      description: 'A white vase of red, blue and cream blooms. Brightens a table. Decorative.',
      tags: ['vase', 'flowers', 'decor'], packs: ['cozy-cottage', 'botanical-living'], tier: 'budget', price: dollars(30), quality: 2, functional: false,
      footprint: FP11, ...surf, stats: { environment: 2 }, finishes: [fab('vase', 'Vase', ['carpetWhite']), fab('blooms', 'Blooms', ['carpet', 'carpetBlue'])],
    }),
    obj(sculptAbs, {
      id: 'sculpture-abstract-steel', name: 'Abstract Steel Sculpture', category: 'decor', subcategory: 'sculpture', rooms: ['living', 'study', 'dining'], style: 'modern',
      description: 'A twisting steel form on a white plinth: a gallery piece for the corner of a room. Decorative.',
      tags: ['sculpture', 'decor', 'art'], packs: ['modern-minimal', 'creative-studio'], tier: 'premium', price: dollars(780), quality: 4, functional: false,
      footprint: FP11, ...floor, stats: { environment: 4 }, finishes: [metal(), fab('plinth', 'Plinth', ['carpetWhite'])],
    }),
    obj(sculptBust, {
      id: 'sculpture-marble-bust', name: 'Marble Bust', category: 'decor', subcategory: 'sculpture', rooms: ['living', 'study', 'dining'], style: 'luxury',
      description: 'A classical marble bust on a dark wooden column. A touch of the museum for a hall or library. Decorative.',
      tags: ['sculpture', 'decor', 'art'], packs: ['classic-townhouse', 'art-deco'], tier: 'luxury', price: dollars(1450), quality: 5, functional: false,
      footprint: FP11, ...floor, stats: { environment: 5 }, finishes: [fab('marble', 'Marble', ['carpetWhite']), wood2()],
    }),
    obj(grandfather, {
      id: 'clock-grandfather', name: 'Grandfather Clock', category: 'decor', subcategory: 'clock', rooms: ['living', 'dining', 'study'], style: 'classic',
      description: 'A tall case clock with a glass door, a swinging pendulum and a round painted dial. Decorative; it keeps perfect time anyway.',
      tags: ['clock', 'decor'], packs: ['classic-townhouse'], tier: 'premium', price: dollars(1280), quality: 4, functional: false,
      footprint: FP11, ...floor, stats: { environment: 4 }, finishes: [wood2(), metal()],
    }),
    obj(clockRound, {
      id: 'clock-wall-round', name: 'Round Wall Clock', category: 'decor', subcategory: 'clock', rooms: ['living', 'kitchen', 'study', 'bedroom'], style: 'modern',
      description: 'A plain white-faced wall clock with a dark rim and twelve block marks. Decorative.',
      tags: ['clock', 'decor', 'wall'], packs: ['everyday-essentials', 'modern-minimal'], tier: 'budget', price: dollars(40), quality: 2, functional: false,
      footprint: FP11, ...wallL, stats: { environment: 1 }, finishes: [steelFrame('Rim'), fab('dial', 'Dial', ['carpetWhite'])],
    }),
    obj(cuckoo, {
      id: 'clock-cuckoo', name: 'Cuckoo Clock', category: 'decor', subcategory: 'clock', rooms: ['living', 'kitchen', 'dining'], style: 'rustic',
      description: 'A carved chalet-style clock with a little bird door and two pine-cone weights on chains. Decorative.',
      tags: ['clock', 'decor', 'wall', 'rustic'], packs: ['cozy-cottage'], tier: 'standard', price: dollars(210), quality: 3, functional: false,
      footprint: FP11, ...wallL, stats: { environment: 2 }, finishes: [wood2()],
    }),
    obj(cheval, {
      id: 'mirror-cheval', name: 'Cheval Mirror', category: 'decor', subcategory: 'mirror', rooms: ['bedroom', 'living'], style: 'classic',
      description: 'A full-length mirror on a free-standing wooden frame with carved finials. Decorative.',
      tags: ['mirror', 'decor'], packs: ['classic-townhouse'], tier: 'standard', price: dollars(260), quality: 3, functional: false,
      footprint: FP11, ...floor, stats: { environment: 2 }, finishes: [wood2()],
    }),
    obj(mirrorRound, {
      id: 'mirror-wall-round', name: 'Round Wall Mirror', category: 'decor', subcategory: 'mirror', rooms: ['living', 'bathroom', 'bedroom', 'dining'], style: 'modern',
      description: 'A large round mirror in a slim metal rim. Makes a room feel bigger. Decorative.',
      tags: ['mirror', 'decor', 'wall'], packs: ['modern-minimal', 'everyday-essentials'], tier: 'standard', price: dollars(150), quality: 3, functional: false,
      footprint: FP11, ...wallL, stats: { environment: 2 }, finishes: [metal()],
    }),
    obj(sunburst, {
      id: 'mirror-sunburst', name: 'Sunburst Mirror', category: 'decor', subcategory: 'mirror', rooms: ['living', 'dining', 'bedroom'], style: 'luxury',
      description: 'A small round mirror ringed by sixteen long and short metal rays, like a sun. Decorative.',
      tags: ['mirror', 'decor', 'wall'], packs: ['art-deco', 'mid-century'], tier: 'premium', price: dollars(420), quality: 4, functional: false,
      footprint: FP11, ...wallL, stats: { environment: 3 }, finishes: [metal()],
    }),
    obj(picLand, {
      id: 'picture-landscape', name: 'Landscape Painting', category: 'decor', subcategory: 'wall-art', rooms: ['living', 'dining', 'bedroom', 'study'], style: 'classic',
      description: 'A framed landscape with a blue sky, green fields and a red sun over grey hills. Decorative.',
      tags: ['wall-art', 'picture', 'decor', 'wall'], packs: ['everyday-essentials', 'classic-townhouse'], tier: 'budget', price: dollars(90), quality: 2, functional: false,
      footprint: FP11, ...wallL, stats: { environment: 2 }, finishes: [wood2()],
    }),
    obj(picGallery, {
      id: 'picture-gallery-trio', name: 'Gallery Wall Trio', category: 'decor', subcategory: 'wall-art', rooms: ['living', 'dining', 'bedroom', 'study'], style: 'modern',
      description: 'Three mismatched frames hung at different heights as one arrangement: a portrait, a colour-block square and a landscape. Decorative.',
      tags: ['wall-art', 'picture', 'decor', 'wall'], packs: ['modern-minimal', 'creative-studio'], tier: 'standard', price: dollars(240), quality: 3, functional: false,
      footprint: FP21, ...wallL, stats: { environment: 3 }, finishes: [wood2()],
    }),
    obj(picPortrait, {
      id: 'picture-portrait-gilt', name: 'Gilt-Framed Portrait', category: 'decor', subcategory: 'wall-art', rooms: ['living', 'dining', 'study'], style: 'luxury',
      description: 'An old portrait of a stern relative in a double metal frame. Decorative.',
      tags: ['wall-art', 'picture', 'decor', 'wall'], packs: ['classic-townhouse', 'art-deco'], tier: 'premium', price: dollars(520), quality: 4, functional: false,
      footprint: FP11, ...wallL, stats: { environment: 3 }, finishes: [metal()],
    }),
    obj(globeFloor, {
      id: 'globe-floor-tripod', name: 'Floor Globe', category: 'decor', subcategory: 'globe', rooms: ['study', 'living'], style: 'mid-century',
      description: 'A large globe on a three-legged wooden stand with a metal meridian arc. Spin it and plan a trip. Decorative.',
      tags: ['globe', 'decor'], packs: ['mid-century', 'classic-townhouse'], tier: 'standard', price: dollars(320), quality: 3, functional: false,
      footprint: FP11, ...floor, stats: { environment: 2 }, finishes: [wood2(), metal(), fab('oceans', 'Oceans', ['carpetBlue'])],
    }),
    obj(globeDesk, {
      id: 'globe-desk-brass', name: 'Desk Globe', category: 'decor', subcategory: 'globe', rooms: ['study', 'living', 'bedroom', 'kids'], style: 'classic',
      description: 'A small globe on a round wooden base with a brass arc. Fits on a desk or shelf. Decorative.',
      tags: ['globe', 'decor'], packs: ['classic-townhouse', 'kids-storybook'], tier: 'budget', price: dollars(75), quality: 2, functional: false,
      footprint: FP11, ...surf, stats: { environment: 1 }, finishes: [darkWood('Base'), metal(), fab('oceans', 'Oceans', ['carpetBlue'])],
    }),
    obj(aquarium, {
      id: 'aquarium-cabinet', name: 'Aquarium on a Cabinet', category: 'decor', subcategory: 'aquarium', rooms: ['living', 'study', 'dining', 'kids'], style: 'modern',
      description: 'A long glass tank with gravel, plants, rocks and a few fish, standing on a wooden cabinet with a light hood. Restful to look at. Decorative.',
      tags: ['aquarium', 'decor', 'water'], packs: ['coastal-home', 'modern-minimal'], tier: 'premium', price: dollars(980), quality: 4, functional: false,
      footprint: FP21, ...floor, stats: { environment: 4 }, finishes: [wood2(), steelFrame('Tank frame and hood')],
    }),
    obj(screen, {
      id: 'screen-room-divider', name: 'Folding Room Divider', category: 'decor', subcategory: 'divider', rooms: ['living', 'bedroom', 'study'], style: 'classic',
      description: 'A three-panel folding screen with cloth panels and a coloured band. Splits a room, hides a corner, blocks the way. Decorative.',
      tags: ['divider', 'screen', 'decor'], packs: ['classic-townhouse'], tier: 'standard', price: dollars(230), quality: 3, functional: false,
      footprint: FP21, ...floor, stats: { environment: 2 }, finishes: [darkWood('Frame'), fab('cloth', 'Cloth', ['carpetWhite']), fab('band', 'Band', ['carpet', 'carpetBlue'])],
    }),
    obj(fireBrick, {
      id: 'fireplace-brick-mantel', name: 'Brick Fireplace', category: 'decor', subcategory: 'fireplace', rooms: ['living', 'dining', 'study'], style: 'rustic',
      description: 'A brick hearth with a wooden mantel, a tall chimney breast and a log fire painted on the grate. Decorative; it gives no warmth.',
      tags: ['fireplace', 'decor', 'rustic'], packs: ['cozy-cottage', 'classic-townhouse'], tier: 'premium', price: dollars(1350), quality: 4, functional: false,
      footprint: FP21, ...floor, stats: { environment: 5 }, finishes: [fab('brick', 'Brick', ['carpetDarker']), wood2(), metalR(['metalMedium'])],
    }),
    obj(fireStove, {
      id: 'fireplace-wood-stove', name: 'Cast-Iron Wood Stove', category: 'decor', subcategory: 'fireplace', rooms: ['living', 'study', 'kitchen'], style: 'industrial',
      description: 'A black iron stove on short legs with a glass door and a flue pipe to the ceiling. Decorative; it gives no warmth.',
      tags: ['fireplace', 'stove', 'decor'], packs: ['industrial-loft', 'cozy-cottage'], tier: 'standard', price: dollars(640), quality: 3, functional: false,
      footprint: FP11, ...floor, stats: { environment: 3 }, finishes: [steelFrame('Body'), region('trim', 'Trim', ['metalMedium'], METAL_MEDIUM)],
    }),
    obj(candles, {
      id: 'candles-pillar-trio', name: 'Pillar Candle Trio', category: 'decor', subcategory: 'candle', rooms: ['living', 'dining', 'bedroom', 'bathroom'], style: 'budget',
      description: 'Three cream pillar candles of different heights on a small metal tray. Decorative.',
      tags: ['candle', 'decor'], packs: ['everyday-essentials'], tier: 'budget', price: dollars(22), quality: 2, functional: false,
      footprint: FP11, ...surf, stats: { environment: 1 }, finishes: [fab('wax', 'Wax', ['carpetWhite']), metal()],
    }),
    obj(candelabra, {
      id: 'candelabra-three-arm', name: 'Three-Arm Candelabra', category: 'decor', subcategory: 'candle', rooms: ['living', 'dining'], style: 'luxury',
      description: 'A slender metal candelabra with three tapers. Dinner by candlelight. Decorative.',
      tags: ['candle', 'decor'], packs: ['classic-townhouse', 'art-deco'], tier: 'standard', price: dollars(120), quality: 3, functional: false,
      footprint: FP11, ...surf, stats: { environment: 2 }, finishes: [metal(), fab('wax', 'Wax', ['carpetWhite'])],
    }),
    obj(bowlFruit, {
      id: 'bowl-fruit-wooden', name: 'Fruit Bowl', category: 'decor', subcategory: 'bowl', rooms: ['kitchen', 'dining', 'living'], style: 'cottage',
      description: 'A turned wooden bowl heaped with apples and pears. Decorative; it is only for show.',
      tags: ['bowl', 'decor'], packs: ['cozy-cottage', 'everyday-essentials'], tier: 'budget', price: dollars(35), quality: 2, functional: false,
      footprint: FP11, ...surf, stats: { environment: 1 }, finishes: [woodR(['wood']), fab('apples', 'Apples', ['carpet'])],
    }),
    obj(bowlDuo, {
      id: 'bowl-ceramic-duo', name: 'Nesting Ceramic Bowls', category: 'decor', subcategory: 'bowl', rooms: ['kitchen', 'dining', 'living'], style: 'modern',
      description: 'A wide blue bowl with a smaller white bowl nested inside it. Decorative.',
      tags: ['bowl', 'decor'], packs: ['modern-minimal'], tier: 'budget', price: dollars(45), quality: 2, functional: false,
      footprint: FP11, ...surf, stats: { environment: 1 }, finishes: [fab('outer', 'Outer bowl', ['carpetBlue']), fab('inner', 'Inner bowl', ['carpetWhite'])],
    }),
    obj(bookends, {
      id: 'bookends-books', name: 'Bookends with Books', category: 'decor', subcategory: 'books', rooms: ['study', 'living', 'bedroom'], style: 'industrial',
      description: 'A pair of black steel bookends propping up a row of colourful books. Decorative.',
      tags: ['books', 'decor'], packs: ['industrial-loft', 'creative-studio'], tier: 'budget', price: dollars(38), quality: 2, functional: false,
      footprint: FP11, ...surf, stats: { environment: 1 }, finishes: [steelFrame('Bookends'), fab('books', 'Books', ['carpet', 'carpetBlue', 'carpetDarker'])],
    }),
    obj(trophy, {
      id: 'trophy-cup-gold', name: 'Winner\'s Trophy Cup', category: 'decor', subcategory: 'trophy', rooms: ['living', 'study', 'kids'], style: 'luxury',
      description: 'A two-handled cup on a wooden plinth with a name plate. Proof that you came first. Decorative.',
      tags: ['trophy', 'decor'], packs: ['classic-townhouse'], tier: 'standard', price: dollars(95), quality: 3, functional: false,
      footprint: FP11, ...surf, stats: { environment: 1 }, finishes: [metal(), wood2()],
    }),
    obj(umbrella, {
      id: 'umbrella-stand', name: 'Umbrella Stand', category: 'decor', subcategory: 'stand', rooms: ['living', 'kitchen'], style: 'industrial',
      description: 'A black steel pail with three furled umbrellas, kept by the door. Decorative.',
      tags: ['stand', 'decor'], packs: ['everyday-essentials', 'industrial-loft'], tier: 'budget', price: dollars(55), quality: 2, functional: false,
      footprint: FP11, ...floor, stats: { environment: 1 }, finishes: [steelFrame('Stand'), fab('umbrellas', 'Umbrellas', ['carpetBlue', 'carpet', 'carpetDarker'])],
    }),
    obj(magRack, {
      id: 'magazine-rack', name: 'Magazine Rack', category: 'decor', subcategory: 'stand', rooms: ['living', 'bathroom', 'study'], style: 'mid-century',
      description: 'A low wooden rack with two pockets for magazines and a divider. Decorative.',
      tags: ['stand', 'decor', 'magazines'], packs: ['mid-century'], tier: 'budget', price: dollars(48), quality: 2, functional: false,
      footprint: FP11, ...floor, stats: { environment: 1 }, finishes: [wood2(), fab('magazines', 'Magazines', ['carpet', 'carpetBlue'])],
    }),
    obj(pouf, {
      id: 'cushion-floor-stack', name: 'Floor Cushion Stack', category: 'decor', subcategory: 'cushion', rooms: ['living', 'bedroom', 'kids'], style: 'budget',
      description: 'Three big square cushions stacked and turned. Cheap colour for a reading corner. Decorative; just for show.',
      tags: ['cushion', 'decor'], packs: ['everyday-essentials', 'kids-storybook'], tier: 'budget', price: dollars(60), quality: 2, functional: false,
      footprint: FP11, ...floor, stats: { environment: 1 }, finishes: [fab('base', 'Cushions', ['carpetBlue', 'carpet', 'carpetDarker']), fab('top', 'Top cushion', ['carpetWhite'])],
    }),
    obj(basket, {
      id: 'basket-throw-blanket', name: 'Throw Blanket Basket', category: 'decor', subcategory: 'basket', rooms: ['living', 'bedroom'], style: 'cottage',
      description: 'A woven basket with a knitted throw folded in and trailing over the rim. Decorative.',
      tags: ['basket', 'decor'], packs: ['cozy-cottage'], tier: 'budget', price: dollars(65), quality: 2, functional: false,
      footprint: FP11, ...floor, stats: { environment: 1 }, finishes: [wood2(), fab('throw', 'Throw', ['carpet', 'carpetDarker'])],
    }),
    obj(chime, {
      id: 'wind-chime-wall', name: 'Wind Chime', category: 'decor', subcategory: 'wall-art', rooms: ['outdoor', 'living', 'kitchen'], style: 'coastal',
      description: 'Six metal tubes and a wooden sail hang from a bracket on the wall. Decorative.',
      tags: ['chime', 'decor', 'wall'], packs: ['coastal-home', 'garden-patio'], tier: 'budget', price: dollars(30), quality: 2, functional: false,
      footprint: FP11, ...wallL, stats: { environment: 1 }, finishes: [wood2(), metal()],
    }),

    // ===== Hobby: instruments ==================================================================
    obj(grand, {
      id: 'piano-grand', name: 'Concert Grand Piano', category: 'hobby', subcategory: 'instrument', rooms: ['living', 'study'], style: 'luxury',
      description: 'A black-lacquer grand with a closed lid and a music desk. Play standing, or pull a chair or bench up and sit: the best sound and the quickest progress in Music.',
      packs: ['classic-townhouse', 'art-deco', 'creative-studio'], tier: 'luxury', price: dollars(4800), quality: 5,
      footprint: FP22, ...floor, slots: [useFront('use', centreX(grand), grand, 2)],
      ...music({ stats: { fun: 1.3, skill: 1.35, environment: 5 } }), finishes: [wood2()],
    }),
    obj(cottagePiano, {
      id: 'piano-cottage', name: 'Cottage Upright Piano', category: 'hobby', subcategory: 'instrument', rooms: ['living', 'study'], style: 'cottage',
      description: 'A small upright with a fretwork gallery, silk panel and two candle brackets. Play standing, or sit at it on a chair: a little better than a radio.',
      packs: ['cozy-cottage', 'creative-studio'], tier: 'standard', price: dollars(1150), quality: 3,
      footprint: FP21, ...floor, slots: [useFront('use', centreX(cottagePiano), cottagePiano, 1)],
      ...music({ stats: { fun: 1.1, skill: 1.1, environment: 2 } }), finishes: [wood2(), fab('silk', 'Silk panel', ['carpetDarker'])],
    }),
    obj(kbDigital, {
      id: 'keyboard-digital', name: 'Digital Keyboard', category: 'hobby', subcategory: 'instrument', rooms: ['living', 'study', 'bedroom', 'kids'], style: 'modern',
      description: 'A 61-key keyboard on a folding X-stand with a sustain pedal. Cheap, quiet and always in tune: play standing, or pull up a chair.',
      packs: ['everyday-essentials', 'modern-minimal'], tier: 'budget', price: dollars(340), quality: 2,
      footprint: FP21, ...floor, slots: [useFront('use', centreX(kbDigital), kbDigital, 1)],
      ...music({ stats: { fun: 1, skill: 1, environment: 1 } }), finishes: [steelFrame('Body'), region('stand', 'Stand', ['metal'], METAL)],
    }),
    obj(kbStage, {
      id: 'keyboard-stage-rig', name: 'Two-Tier Synth Rig', category: 'hobby', subcategory: 'instrument', rooms: ['living', 'study', 'bedroom'], style: 'industrial',
      description: 'Two synthesizers on a steel A-frame with a sustain pedal: for the player who wants every sound. Play standing, or sit at a chair.',
      packs: ['industrial-loft', 'creative-studio'], tier: 'standard', price: dollars(820), quality: 3,
      footprint: FP21, ...floor, slots: [useFront('use', centreX(kbStage), kbStage, 1)],
      ...music({ stats: { fun: 1.15, skill: 1.2, environment: 2 } }),
      finishes: [steelFrame('Frame'), fab('upper', 'Upper case', ['carpetBlue']), fab('lower', 'Lower case', ['carpetDarker'])],
    }),
    obj(harpsi, {
      id: 'harpsichord-painted', name: 'Painted Harpsichord', category: 'hobby', subcategory: 'instrument', rooms: ['living', 'study'], style: 'classic',
      description: 'A baroque harpsichord with a tapering case on turned legs and a painted blue lid. Play standing, or sit at it: a refined route to Music.',
      packs: ['classic-townhouse'], tier: 'premium', price: dollars(2300), quality: 4,
      footprint: FP12, ...floor, slots: [useFront('use', centreX(harpsi), harpsi, 2)],
      ...music({ stats: { fun: 1.1, skill: 1.25, environment: 4 } }), finishes: [wood2(), fab('lid', 'Painted lid', ['carpetBlue'])],
    }),
    obj(organ, {
      id: 'organ-parlour-reed', name: 'Parlour Reed Organ', category: 'hobby', subcategory: 'instrument', rooms: ['living', 'study'], style: 'rustic',
      description: 'A pump organ with two rows of stops and a rack of pipes on top. Play standing, or sit at it: hymns, rags and a lot of character.',
      packs: ['cozy-cottage', 'classic-townhouse'], tier: 'premium', price: dollars(1850), quality: 4,
      footprint: FP21, ...floor, slots: [useFront('use', centreX(organ), organ, 1)],
      ...music({ stats: { fun: 1.1, skill: 1.2, environment: 3 } }), finishes: [wood2(), metal()],
    }),
    obj(drums, {
      id: 'drum-kit-display', name: 'Drum Kit', category: 'hobby', subcategory: 'instrument', rooms: ['living', 'study', 'bedroom'], style: 'industrial',
      description: 'A five-piece kit with a hi-hat, crash, ride and a padded throne. A display piece in this version: nobody plays it yet.',
      tags: ['instrument', 'music', 'decor'], packs: ['creative-studio', 'industrial-loft'], tier: 'standard', price: dollars(780), quality: 3, functional: false,
      footprint: FP22, ...floor, stats: { environment: 2 }, finishes: [fab('shells', 'Shells', ['carpet']), metal(), region('stands', 'Stands', ['metalDark'], METAL_DARK)],
    }),
    obj(harp, {
      id: 'harp-concert', name: 'Concert Harp', category: 'hobby', subcategory: 'instrument', rooms: ['living', 'study'], style: 'luxury',
      description: 'A full-size pedal harp with a carved column and a row of strings. A display piece in this version: nobody plays it yet.',
      tags: ['instrument', 'music', 'decor'], packs: ['classic-townhouse', 'art-deco'], tier: 'luxury', price: dollars(2650), quality: 5, functional: false,
      footprint: FP11, ...floor, stats: { environment: 4 }, finishes: [wood2()],
    }),
    obj(cello, {
      id: 'cello-stand', name: 'Cello on a Stand', category: 'hobby', subcategory: 'instrument', rooms: ['living', 'study', 'bedroom'], style: 'classic',
      description: 'A cello standing on a steel rest, its bow leaning beside it. A display piece in this version: nobody plays it yet.',
      tags: ['instrument', 'music', 'decor'], packs: ['classic-townhouse', 'creative-studio'], tier: 'standard', price: dollars(560), quality: 3, functional: false,
      footprint: FP11, ...floor, stats: { environment: 2 }, finishes: [wood2(), steelFrame('Stand')],
    }),

    // ===== Hobby: games and pottery (Milestone 13) ===============================================
    obj(poolT, {
      id: 'pool-table-classic', name: 'Pool Table', category: 'hobby', subcategory: 'games', rooms: ['living', 'study', 'dining'], style: 'classic',
      description: 'A full-size pool table with green cloth, wooden cushions, six pockets and a racked set. Play alone, or challenge someone from the social menu.',
      ...game(['pool-table', 'table']), packs: ['classic-townhouse', 'industrial-loft'], tier: 'premium', price: dollars(1850), quality: 4,
      footprint: FP32, ...floor, slots: [useFront('use', 1.5, poolT, 2)], interactions: ['playPool'], stats: { fun: 1.15, environment: 3 },
      finishes: [wood2()],
    }),
    obj(dartB, {
      id: 'dartboard-cabinet', name: 'Dartboard Cabinet', category: 'hobby', subcategory: 'games', rooms: ['living', 'study', 'kids'], style: 'rustic',
      description: 'A bristle dartboard in a wooden cabinet with three darts stuck in it. Stand back and aim; hang it on a wall with a clear tile in front.',
      ...game(['dartboard', 'wall']), packs: ['cozy-cottage', 'industrial-loft'], tier: 'budget', price: dollars(95), quality: 2,
      footprint: FP11, layer: 'wall' as const, needsWall: true, blocksMovement: false, slots: [useFront('use', 0.5, null, 1)], interactions: ['throwDarts'], stats: { fun: 1, environment: 1 },
      finishes: [woodR(['wood'])],
    }),
    obj(foos, {
      id: 'foosball-table', name: 'Foosball Table', category: 'hobby', subcategory: 'games', rooms: ['living', 'kids', 'study'], style: 'playful',
      description: 'A wooden table football with four rods of red and blue players. Spin, slam and shout; a two-player favourite.',
      ...game(['foosball', 'table']), packs: ['everyday-essentials', 'kids-storybook'], tier: 'standard', price: dollars(420), quality: 3,
      footprint: FP21, ...floor, slots: [useFront('use', centreX(foos), foos, 1)], interactions: ['playFoosball'], stats: { fun: 1.1, environment: 2 },
      finishes: [darkWood('Cabinet')],
    }),
    obj(ttTable, {
      id: 'table-tennis-table', name: 'Table Tennis Table', category: 'hobby', subcategory: 'games', rooms: ['living', 'kids', 'study', 'outdoor'], style: 'modern',
      description: 'A regulation blue table on folding steel legs with a net, two bats and a ball. A rally is good exercise and better with two.',
      ...game(['table-tennis', 'table', 'active']), packs: ['everyday-essentials', 'modern-minimal'], tier: 'standard', price: dollars(520), quality: 3,
      footprint: FP32, ...floor, slots: [useFront('use', 1.5, ttTable, 2)], interactions: ['playTableTennis'], stats: { fun: 1.1, environment: 1 },
      finishes: [region('top', 'Top', ['carpetBlue'], FABRIC_BLUE), steelFrame('Legs')],
    }),
    obj(wheel, {
      id: 'pottery-wheel', name: 'Pottery Wheel', category: 'hobby', subcategory: 'art', rooms: ['study', 'living', 'bedroom', 'outdoor'], style: 'rustic',
      description: 'A kick wheel with a splash pan, a cone of clay and a bucket of water. Throw a pot: it trains Creativity and leaves a handmade pot to place or sell.',
      tags: ['pottery', 'wheel', 'creative'], functional: true, packs: ['creative-studio', 'cozy-cottage'], tier: 'standard', price: dollars(480), quality: 3,
      footprint: FP11, ...floor, slots: [useFront('use', 0.5, wheel, 1)], interactions: ['throwPottery', 'sellPottery'], stats: { fun: 1, skill: 1.1, environment: 1 },
      finishes: [wood2(), steelFrame('Frame')],
    }),

    // ===== Hobby: art and craft ================================================================
    obj(easelTop, {
      id: 'easel-tabletop', name: 'Tabletop Easel', category: 'hobby', subcategory: 'art', rooms: ['study', 'bedroom', 'living', 'kids'], style: 'budget',
      description: 'A small A-frame easel with a canvas and two paint pots, made to stand on a desk or table. Paint for fun and train Painting.',
      tags: ['easel', 'art', 'creative'], packs: ['creative-studio', 'everyday-essentials'], tier: 'budget', price: dollars(60), quality: 2, functional: true,
      footprint: FP11, ...surf, slots: [useFront('use', 0.5, null, 1)],
      interactions: ['paintCanvas', 'paintToSell'], stats: { fun: 1, skill: 1, environment: 1 }, finishes: [wood2()],
    }),
    obj(easelGal, {
      id: 'easel-gallery-mast', name: 'Gallery Crank Easel', category: 'hobby', subcategory: 'art', rooms: ['living', 'study', 'bedroom'], style: 'classic',
      description: 'A tall H-frame easel with a crank mast, a deep paint tray and a large canvas. Room for big ideas: more fun and quicker progress in Painting.',
      tags: ['easel', 'art', 'creative'], packs: ['creative-studio'], tier: 'standard', price: dollars(320), quality: 4, functional: true,
      footprint: FP11, ...floor, slots: [useFront('use', 0.5, easelGal, 1)],
      interactions: ['paintCanvas', 'paintToSell'], stats: { fun: 1.1, skill: 1.2, environment: 2 }, finishes: [wood2()],
    }),
    obj(easelFr, {
      id: 'easel-french-box', name: 'French Box Easel', category: 'hobby', subcategory: 'art', rooms: ['living', 'study', 'bedroom', 'outdoor'], style: 'rustic',
      description: 'A folding sketch-box easel on three legs with a paint drawer and a raised lid for the canvas. Paint anywhere, and train Painting.',
      tags: ['easel', 'art', 'creative'], packs: ['creative-studio', 'cozy-cottage'], tier: 'standard', price: dollars(240), quality: 3, functional: true,
      footprint: FP11, ...floor, slots: [useFront('use', 0.5, easelFr, 1)],
      interactions: ['paintCanvas', 'paintToSell'], stats: { fun: 1, skill: 1.1, environment: 1 }, finishes: [wood2()],
    }),
    obj(craft, {
      id: 'craft-table-long', name: 'Long Craft Table', category: 'hobby', subcategory: 'art', rooms: ['study', 'living', 'bedroom', 'kids'], style: 'cottage',
      description: 'A long wooden table with a cutting mat, paper stacks and jars of brushes. Sketch ideas here to build Creativity.',
      tags: ['table', 'art', 'creative', 'stationery', 'surface'], packs: ['creative-studio', 'cozy-cottage'], tier: 'standard', price: dollars(360), quality: 3, functional: true,
      footprint: FP21, ...floor, surfaceHeight: 0.79, slots: [useFront('use', centreX(craft), craft, 1)],
      interactions: ['sketchIdeas'], stats: { skill: 1, fun: 1, environment: 1 }, finishes: [wood2()],
    }),
    obj(sewing, {
      id: 'sewing-treadle-table', name: 'Treadle Sewing Table', category: 'hobby', subcategory: 'art', rooms: ['study', 'bedroom', 'living'], style: 'rustic',
      description: 'A cast-iron treadle table with a sewing machine and a patch of cloth on the bed. Sketch patterns and plan stitches to build Creativity.',
      tags: ['sewing', 'art', 'creative', 'stationery'], packs: ['cozy-cottage', 'creative-studio'], tier: 'standard', price: dollars(420), quality: 3, functional: true,
      footprint: FP11, ...floor, slots: [useFront('use', 0.5, sewing, 1)],
      interactions: ['sketchIdeas'], stats: { skill: 1, fun: 1, environment: 1 }, finishes: [steelFrame('Frame'), applianceR(['metalLight']), woodR(['wood'])],
    }),

    // ===== Hobby: fitness ======================================================================
    obj(bike, {
      id: 'exercise-bike', name: 'Exercise Bike', category: 'hobby', subcategory: 'fitness', rooms: ['living', 'bedroom', 'study'], style: 'modern',
      description: 'A stationary bike with a weighted flywheel and a small console. Pedal from the saddle end: trains Fitness, but costs energy and hygiene.',
      tags: ['exercise', 'bike', 'appliance', 'cleanable'], packs: ['everyday-essentials', 'modern-minimal'], tier: 'standard', price: dollars(520), quality: 3, functional: true,
      footprint: FP11, ...floor, slots: [useFront('use', 0.5, bike, 1)],
      interactions: ['workOut'], stats: { fun: 1, skill: 1.05 }, finishes: [steelFrame('Frame'), fab('saddle', 'Saddle', ['carpetDarker'])],
    }),
    obj(rower, {
      id: 'rowing-machine', name: 'Rowing Machine', category: 'hobby', subcategory: 'fitness', rooms: ['living', 'bedroom', 'study'], style: 'industrial',
      description: 'A long rail, a sliding seat and a flywheel at the far end. A full-body workout that trains Fitness; it costs energy and hygiene.',
      tags: ['exercise', 'rower', 'appliance', 'cleanable'], packs: ['industrial-loft', 'modern-minimal'], tier: 'standard', price: dollars(740), quality: 3, functional: true,
      footprint: FP12, ...floor, slots: [useFront('use', 0.5, rower, 2)],
      interactions: ['workOut'], stats: { fun: 0.8, skill: 1.15 }, finishes: [steelFrame('Frame'), fab('seat', 'Seat', ['carpetDarker'])],
    }),
    obj(bag, {
      id: 'punching-bag-stand', name: 'Punching Bag Stand', category: 'hobby', subcategory: 'fitness', rooms: ['living', 'bedroom', 'study'], style: 'industrial',
      description: 'A heavy bag on a weighted steel stand. Hit it from the front: a hard workout that trains Fitness and costs energy and hygiene.',
      tags: ['exercise', 'boxing', 'cleanable'], packs: ['industrial-loft'], tier: 'standard', price: dollars(430), quality: 3, functional: true,
      footprint: FP11, ...floor, slots: [useFront('use', 0.5, bag, 1)],
      interactions: ['workOut'], stats: { fun: 1, skill: 1.1 }, finishes: [steelFrame('Stand'), fab('bag', 'Bag', ['carpet'])],
    }),
    obj(rack, {
      id: 'squat-rack-barbell', name: 'Power Rack with Barbell', category: 'hobby', subcategory: 'fitness', rooms: ['living', 'bedroom', 'study'], style: 'industrial',
      description: 'A four-post steel rack on a rubber mat with a loaded barbell and a pull-up bar. Lift from the front: the hardest workout in the catalog.',
      tags: ['exercise', 'weights', 'cleanable'], packs: ['industrial-loft'], tier: 'premium', price: dollars(980), quality: 4, functional: true,
      footprint: FP12, ...floor, slots: [useFront('use', 0.5, rack, 2)],
      interactions: ['liftWeights'], stats: { skill: 1.25 }, finishes: [steelFrame('Frame'), fab('mat', 'Floor mat', ['carpetDarker'])],
    }),
    obj(elliptical, {
      id: 'elliptical-trainer', name: 'Elliptical Trainer', category: 'hobby', subcategory: 'fitness', rooms: ['living', 'bedroom', 'study'], style: 'modern',
      description: 'A gliding cross trainer with moving handles and a console. Gentle on the knees: trains Fitness, with a little less cost to energy.',
      tags: ['exercise', 'elliptical', 'appliance', 'cleanable'], packs: ['modern-minimal'], tier: 'premium', price: dollars(1100), quality: 4, functional: true,
      footprint: FP12, ...floor, slots: [useFront('use', 0.5, elliptical, 2)],
      interactions: ['workOut'], stats: { fun: 1.1, skill: 1.1 }, finishes: [steelFrame('Frame'), fab('pedals', 'Pedals', ['carpetDarker'])],
    }),
    obj(yogaRound, {
      id: 'yoga-mat-round', name: 'Round Yoga Mat', category: 'hobby', subcategory: 'wellness', rooms: ['living', 'bedroom', 'study'], style: 'modern',
      description: 'A round padded mat with a cream ring. Do yoga or stretch to build Wellness; people walk over it when it is not in use.',
      tags: ['yoga', 'mat', 'wellness', 'exercise', 'rug'], packs: ['modern-minimal', 'coastal-home'], tier: 'budget', price: dollars(75), quality: 2, functional: true,
      footprint: FP11, ...rugL,
      slots: [{ id: 'use', kind: 'use', pos: [0.5, 0.5], height: 0, facing: Math.PI, approach: [0, 0], posture: 'standing' }],
      interactions: ['doYoga', 'stretch'], stats: { fun: 0.5, skill: 1.1, environment: 1 }, finishes: [fab('mat', 'Mat', ['carpetBlue']), fab('ring', 'Ring', ['carpetWhite'])],
    }),

    // ===== Hobby: games, science, workshop, reading, gardening ================================
    obj(chessMarble, {
      id: 'table-chess-marble', name: 'Marble Chess Table', category: 'hobby', subcategory: 'games', rooms: ['living', 'study', 'dining'], style: 'luxury',
      description: 'An octagonal marble table on a carved pedestal with a game in progress. Sit at a chair facing it (or stand) and play: trains Logic.',
      tags: ['table', 'game', 'chess'], packs: ['classic-townhouse', 'art-deco'], tier: 'premium', price: dollars(620), quality: 4, functional: true,
      footprint: FP11, ...floor, slots: [useFront('use', 0.5, chessMarble, 1)],
      interactions: ['playChess'], stats: { fun: 1.1, skill: 1.15, environment: 3 }, finishes: [wood2(), fab('marble', 'Marble top', ['carpetWhite'])],
    }),
    obj(gameTable, {
      id: 'table-games-long', name: 'Long Games Table', category: 'hobby', subcategory: 'games', rooms: ['living', 'study', 'dining', 'kids'], style: 'cottage',
      description: 'A long wooden table with a checker board, a felt card field and a drawer for pieces. Sit at a chair facing it (or stand) and play: trains Logic.',
      tags: ['table', 'game', 'chess', 'cards'], packs: ['cozy-cottage', 'everyday-essentials'], tier: 'standard', price: dollars(380), quality: 3, functional: true,
      footprint: FP21, ...floor, slots: [useFront('use', centreX(gameTable), gameTable, 1)],
      interactions: ['playChess'], stats: { fun: 1.05, skill: 1, environment: 1 }, finishes: [wood2()],
    }),
    obj(telescope, {
      id: 'telescope-brass', name: 'Brass Observatory Telescope', category: 'hobby', subcategory: 'science', rooms: ['study', 'bedroom', 'living', 'outdoor'], style: 'luxury',
      description: 'A long brass-banded refractor with a finder scope and a counterweight on a wooden tripod. Study the night sky to build Research, a little better than a small scope.',
      tags: ['telescope', 'research', 'science', 'hobby'], packs: ['classic-townhouse', 'creative-studio'], tier: 'luxury', price: dollars(1480), quality: 5, functional: true,
      footprint: FP11, ...floor, slots: [useFront('observe', 0.5, telescope, 1)],
      interactions: ['researchSky'], stats: { fun: 1.2, skill: 1.25, environment: 2 }, finishes: [woodR(['wood']), metal()],
    }),
    obj(workbench, {
      id: 'workbench-woodworking', name: 'Woodworking Bench', category: 'hobby', subcategory: 'workshop', rooms: ['study', 'living', 'outdoor'], style: 'industrial',
      description: 'A heavy bench with a vice, a shelf of jars and a tool wall hung with saws and chisels. A surface for projects and tools.',
      tags: ['workbench', 'surface', 'storage', 'hobby'], packs: ['industrial-loft', 'cozy-cottage'], tier: 'standard', price: dollars(520), quality: 3, functional: true,
      footprint: FP21, ...floor, surfaceHeight: 0.93, stats: { environment: 1 }, finishes: [wood2(), steelFrame('Vice')],
    }),
    obj(nook, {
      id: 'bookshelf-reading-nook', name: 'Reading Nook Bookcases', category: 'hobby', subcategory: 'study', rooms: ['study', 'living', 'bedroom'], style: 'cottage',
      description: 'Two full-height bookcases frame a window seat with cushions. Read from the shelves or curl up on the seat: a cosy way to train.',
      tags: ['bookcase', 'books', 'storage', 'seat'], packs: ['cozy-cottage', 'classic-townhouse'], tier: 'premium', price: dollars(980), quality: 4, functional: true,
      footprint: FP21, ...floor,
      slots: [useFront('left', nook.at(0.14, 0)[0], nook, 1), useFront('right', nook.at(0.86, 0)[0], nook, 1), sit('seat', nook.at(0.5, 0.45), 0.5, [1, 1])],
      interactions: ['readBook', 'readSkillBook', 'sit'], stats: { skill: 1.2, fun: 1.15, comfort: 4, environment: 3 }, finishes: [wood2(), fab('cushions', 'Cushions', ['carpet'])],
    }),
    obj(potting, {
      id: 'potting-bench', name: 'Gardener\'s Potting Bench', category: 'hobby', subcategory: 'gardening', rooms: ['outdoor', 'kitchen', 'living'], style: 'cottage',
      description: 'A slatted bench with a high shelf of seedlings, a soil trough, a watering can and a bag of compost. Water the plants here to train gardening.',
      tags: ['plant', 'garden', 'workbench', 'surface'], packs: ['garden-patio', 'cozy-cottage', 'botanical-living'], tier: 'standard', price: dollars(340), quality: 3, functional: true,
      footprint: FP21, ...floor, surfaceHeight: r3(0.94), interactions: ['waterPlant'], stats: { environment: 3 }, finishes: [wood2(), metal()],
    }),
  ];
}
