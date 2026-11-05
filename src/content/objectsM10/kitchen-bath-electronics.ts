// Milestone 10 designs, group "kitchen-bath-electronics". Models: tools/furniture-extra/m10/kitchen-bath-electronics.mjs
// (build: node tools/build-extra-furniture.mjs --only=kitchen-bath-electronics). Guide: dev/ds-tasks/m10f/AUTHORING.md.
// Edit only this group's files.

import type { ObjectDef } from '../types';
import type { ObjectKit } from '../objects';

export default function build(k: ObjectKit): ObjectDef[] {
  const { fit, obj, useFront, applianceR, metalR, darkMetalR, FP11, WALL_GAP, MODEL_BOUNDS, dollars } = k;

  // Retro tall fridge: same use as the other fridges (grab a snack, cook a meal), so the door follows `openFridge`.
  const fridgeRetro = fit('fridgeRetroTall', FP11, 2, { back: WALL_GAP });
  // Thin laptop on any surface; its picture rectangle comes from the model's anim:screen part (`screen: true`).
  const laptopSlim = fit('laptopThin', FP11, 2);


  // ---- shared palettes and regions of the new designs -------------------------------------------------------------------
  const { sw, region, APPLIANCE, METAL, METAL_MEDIUM, FP21, FP22, sit, woodR, fabricR, counterR } = k;
  const STEEL = [sw('steel', 'Brushed Steel', '#bdd2d6'), ...APPLIANCE.filter((x) => x.id !== 'stainless')];
  const steelR = (label = 'Appliance Finish', mats = ['metal']) => region('body', label, mats, STEEL);
  const whiteR = (label = 'Ceramic') => region('ceramic', label, ['carpetWhite'], [sw('white', 'Gloss White', '#f8ffff'), ...APPLIANCE.slice(1)]);
  const blueR = (label: string, mats = ['carpetBlue']) => fabricR(mats, label);
  const trimR = (mats = ['metal'], label = 'Trim') => region('trim', label, mats, mats[0] === 'metalMedium' ? METAL_MEDIUM : METAL);
  const wood2 = () => woodR(['wood', 'woodDark']);
  const hingeAngle = (h: 'L' | 'R', a = 1.75) => (h === 'L' ? -a : a);

  type Anim = NonNullable<ObjectDef['anim']>;
  const fridgeAnim = (parts: Anim['parts'], interior = true): Anim => ({ kind: 'fridge', parts: interior ? [...parts, { node: 'anim:interior', role: 'interior' }] : parts });
  const door = (n: 'door' | 'door2', h: 'L' | 'R', a = 1.75): Anim['parts'][number] => ({ node: `anim:${n}`, role: n, axis: 'y', angle: hingeAngle(h, a) });
  const drawer = (z: number): Anim['parts'][number] => ({ node: 'anim:drawer', role: 'drawer', slide: [0, 0, z] });
  // Metres as written in the model file (full size) to fractions of the fitted box (the units of anim.tap and anim.hob): the
  // GLB is built at half scale (MODEL_BOUNDS are half-scale), and the fit then only scales and shifts it.
  const frac = (model: string, v: number, axis: 0 | 1 | 2) => {
    const [mn, mx] = MODEL_BOUNDS[model]!;
    return Math.round(((v / 2 - mn[axis]) / (mx[axis] - mn[axis])) * 1000) / 1000;
  };
  /** Hob rings (a grid of `cols` x `rows`, as fractions of the W x D top) and the surface height `y` in model metres. */
  const hobOf = (model: string, o: { W: number; D: number; cols: number[]; rows: number[]; y: number; size?: number }): NonNullable<Anim['hob']> => ({
    rings: o.rows.flatMap((rz) => o.cols.map((cx): [number, number] => [frac(model, cx * o.W, 0), frac(model, rz * o.D, 2)])),
    y: frac(model, o.y, 1), ...(o.size ? { ringSize: o.size } : {}),
  });
  /** Tap stream at model-space (x, z) from the spout height `top` down to the bowl at `bottom` (metres). */
  const tapOf = (model: string, x: number, z: number, top: number, bottom: number): NonNullable<Anim['tap']> =>
    ({ x: frac(model, x, 0), z: frac(model, z, 2), top: frac(model, top, 1), bottom: frac(model, bottom, 1) });
  const sinkAnim = (tap: Anim['tap']): Anim => ({ kind: 'sink', parts: [], tap });
  const ovenAnim = (n = 1, hob?: Anim['hob']): Anim => ({
    kind: 'oven',
    parts: [
      { node: 'anim:oven', role: 'oven', axis: 'x', angle: 1.35, openMinutes: 0.5, closeMinutes: 0.5 },
      ...(n > 1 ? [{ node: 'anim:oven2', role: 'oven' as const, axis: 'x' as const, angle: 1.35, openMinutes: 0.5, closeMinutes: 0.5 }] : []),
      { node: 'anim:interior', role: 'interior' },
    ],
    ...(hob ? { hob } : {}),
  });
  const ROOM_K: ObjectDef['rooms'] = ['kitchen'];
  const FR_TAGS = ['fridge', 'appliance', 'food', 'cleanable'];

  // ---- kitchen: fridges --------------------------------------------------------------------------------------------------
  const fridgeDef = (model: string, o: { id: string; name: string; desc: string; style: string; tier: ObjectDef['tier']; price: number; q: number; packs?: string[]; rooms?: ObjectDef['rooms']; cook?: boolean; surface?: number; stats?: ObjectDef['stats']; fin: ObjectDef['finishes']; anim: Anim; sub?: string }) => {
    const f = fit(model, FP11, 2, { back: WALL_GAP });
    return obj(f, {
      id: o.id, name: o.name, category: 'kitchen', subcategory: 'fridge', rooms: o.rooms ?? ROOM_K, style: o.style, description: o.desc,
      tags: FR_TAGS, packs: o.packs ?? ['everyday-essentials'], tier: o.tier, price: dollars(o.price), quality: o.q, functional: true,
      footprint: FP11, layer: 'floor', blocksMovement: true, ...(o.surface ? { surfaceHeight: o.surface } : {}), slots: [useFront('use', 0.5, f, 1)],
      interactions: o.cook === false ? ['grabSnack'] : ['grabSnack', 'cookMeal'], stats: o.stats ?? { cooking: 0 }, finishes: o.fin, anim: o.anim,
    });
  };
  const KITCHEN_FRIDGES = [
    fridgeDef('fridgeTopFreezer', { id: 'fridge-top-freezer', name: 'Top-Freezer Fridge', desc: 'A classic fridge with a freezer on top. Honest, roomy and cheap to run: grab a snack or gather ingredients.', style: 'classic', tier: 'budget', price: 520, q: 2, fin: [applianceR(), metalR(['metal'])], anim: fridgeAnim([door('door', 'R')]) }),
    fridgeDef('fridgeTwinDoor', { id: 'fridge-twin-door', name: 'Twin-Door Steel Fridge', desc: 'A wide steel fridge-freezer with two tall doors and an ice dispenser. Meals cooked from it come out a little better.', style: 'modern', tier: 'premium', price: 1780, q: 4, packs: ['everyday-essentials', 'modern-minimal'], stats: { cooking: 1, environment: 1 }, fin: [steelR()], anim: fridgeAnim([door('door', 'L'), door('door2', 'R')]) }),
    fridgeDef('fridgeFrenchDoor', { id: 'fridge-french-door', name: 'French-Door Fridge', desc: 'Two upper doors open onto a wide fridge, with a pull-out freezer drawer below. A cook\'s favourite.', style: 'modern', tier: 'luxury', price: 2400, q: 5, packs: ['modern-minimal', 'art-deco'], stats: { cooking: 1.5, environment: 1 }, fin: [metalR(['metalMedium']), trimR(['metal'], 'Handles')], anim: fridgeAnim([door('door', 'L'), door('door2', 'R'), drawer(0.32)]) }),
    fridgeDef('fridgeMini', { id: 'fridge-mini-cube', name: 'Mini Cube Fridge', desc: 'A bright little cube for a dorm, a den or a studio. Holds a snack and a few ingredients.', style: 'modern', tier: 'budget', price: 190, q: 1, rooms: ['kitchen', 'bedroom', 'study', 'living'], packs: ['everyday-essentials', 'creative-studio'], fin: [blueR('Body'), metalR(['metal'])], anim: fridgeAnim([door('door', 'L')]) }),
    fridgeDef('fridgeCommercial', { id: 'fridge-glass-door', name: 'Glass-Door Display Fridge', desc: 'A steel catering fridge with a glass door and a lit sign. Everything is on show, and it keeps a lot.', style: 'industrial', tier: 'premium', price: 1500, q: 4, packs: ['industrial-loft'], rooms: ['kitchen', 'dining'], stats: { cooking: 0.5, environment: 1 }, fin: [steelR(), darkMetalR('Frame')], anim: fridgeAnim([door('door', 'R')], false) }),
    fridgeDef('fridgeBottomFreezer', { id: 'fridge-bottom-freezer', name: 'Slate Bottom-Freezer Fridge', desc: 'A slate-grey fridge with the freezer drawer at the bottom, so the fresh food is at eye level.', style: 'modern', tier: 'standard', price: 940, q: 3, packs: ['everyday-essentials', 'modern-minimal'], stats: { cooking: 0.5 }, fin: [metalR(['metalDark']), trimR(['metal'], 'Handles')], anim: fridgeAnim([door('door', 'L'), drawer(0.3)]) }),
    fridgeDef('fridgeUnderCounter', { id: 'fridge-under-counter', name: 'Under-Counter Fridge', desc: 'A fridge with its own worktop, the same height as the kitchen units. Items can stand on top.', style: 'modern', tier: 'standard', price: 560, q: 3, surface: 0.9, packs: ['everyday-essentials'], fin: [applianceR(), metalR(['metal'])], anim: fridgeAnim([door('door', 'L')]) }),
    fridgeDef('wineCooler', { id: 'wine-cooler', name: 'Wine Cooler', desc: 'A glass-fronted cooler with wooden racks for a dozen bottles. A snack-sized selection, mostly for show.', style: 'classic', tier: 'premium', price: 880, q: 4, cook: false, rooms: ['kitchen', 'dining', 'living'], packs: ['classic-townhouse', 'art-deco'], stats: { environment: 2 }, fin: [metalR(['metalDark']), woodR(['wood'])], anim: fridgeAnim([door('door', 'R')], false) }),
  ];

  // ---- kitchen: ranges, ovens, microwaves, hood --------------------------------------------------------------------------
  const STOVE_TAGS = ['stove', 'appliance', 'cooking', 'baking', 'cleanable'];
  const stoveDef = (model: string, o: { id: string; name: string; desc: string; style: string; tier: ObjectDef['tier']; price: number; q: number; fp?: { w: number; d: number }; packs?: string[]; stats?: ObjectDef['stats']; fin: ObjectDef['finishes']; ovens?: number; back?: number; hob: NonNullable<Anim['hob']> }) => {
    const fp = o.fp ?? FP11, f = fit(model, fp, 2, { back: o.back ?? 0.02 });
    return obj(f, {
      id: o.id, name: o.name, category: 'kitchen', subcategory: 'stove', rooms: ROOM_K, style: o.style, description: o.desc, tags: STOVE_TAGS,
      packs: o.packs ?? ['everyday-essentials'], tier: o.tier, price: dollars(o.price), quality: o.q, functional: true, footprint: fp, layer: 'floor',
      blocksMovement: true, slots: [useFront('use', fp.w / 2, f, fp.d)], interactions: ['bakeTreat', 'sellBakes'], stats: o.stats ?? { cooking: 0, baking: 0 },
      finishes: o.fin, anim: ovenAnim(o.ovens ?? 1, o.hob),
    });
  };
  const KITCHEN_COOKING = [
    stoveDef('rangeSteelGas', { id: 'range-steel-gas', name: 'Steel Gas Range', desc: 'A stainless gas range with four burners on cast grates and a roomy oven. The oven door drops open when something goes in to bake.', style: 'modern', tier: 'standard', price: 840, q: 3, stats: { cooking: 0.5, baking: 0.5 }, hob: hobOf('rangeSteelGas', { W: 0.9, D: 0.72, cols: [0.25, 0.75], rows: [0.3, 0.72], y: 0.935 }), fin: [steelR(), darkMetalR('Hob and trim')] }),
    stoveDef('rangeInduction', { id: 'range-induction', name: 'Glass Induction Range', desc: 'A black induction hob over a fan oven: fast, clean and easy to wipe. A good range lifts the result a little.', style: 'modern', tier: 'premium', price: 1350, q: 4, packs: ['modern-minimal'], stats: { cooking: 1, baking: 1, environment: 1 }, hob: hobOf('rangeInduction', { W: 0.9, D: 0.68, cols: [0.27, 0.73], rows: [0.3, 0.7], y: 0.9, size: 0.17 }), fin: [darkMetalR('Body'), trimR(['metalMedium'], 'Control strip')] }),
    stoveDef('rangeCottage', { id: 'range-cottage-cooker', name: 'Cottage Range Cooker', desc: 'A heavy enamel range cooker with two ovens, hotplate lids and a towel rail. Slow, warm and loved by bakers.', style: 'cottage', tier: 'luxury', price: 2100, q: 5, fp: FP21, packs: ['cozy-cottage', 'classic-townhouse'], stats: { cooking: 0.5, baking: 2, environment: 2 }, hob: hobOf('rangeCottage', { W: 1.4, D: 0.76, cols: [0.27, 0.73], rows: [0.5], y: 0.985, size: 0.2 }), fin: [darkMetalR('Enamel'), trimR(['metal'])], ovens: 2 }),
    stoveDef('rangeChef', { id: 'range-chef-six', name: "Chef's Six-Burner Range", desc: 'Six burners and two ovens in a steel body with red knobs. Built for cooking for a crowd.', style: 'industrial', tier: 'luxury', price: 2250, q: 5, fp: FP21, packs: ['industrial-loft'], stats: { cooking: 2, baking: 1 }, hob: hobOf('rangeChef', { W: 1.5, D: 0.78, cols: [0.15, 0.5, 0.85], rows: [0.3, 0.7], y: 0.965, size: 0.14 }), fin: [steelR(), darkMetalR('Hob and trim'), fabricR(['carpet'], 'Knobs')], ovens: 2 }),
    stoveDef('stoveCompact', { id: 'stove-compact', name: 'Studio Two-Plate Stove', desc: 'A small cooker with two hotplates and a mini oven. Fits any studio and does the job.', style: 'modern', tier: 'budget', price: 260, q: 1, stats: { cooking: -0.2, baking: -0.2 }, hob: hobOf('stoveCompact', { W: 0.6, D: 0.6, cols: [0.28, 0.72], rows: [0.5], y: 0.895, size: 0.14 }), fin: [applianceR(), metalR(['metalMedium'])] }),
    stoveDef('rangeRetro', { id: 'range-retro-enamel', name: 'Retro Enamel Range', desc: 'A 1950s-style range with a clock backsplash, chrome trim and chunky red knobs.', style: 'retro', tier: 'premium', price: 1250, q: 4, packs: ['mid-century'], stats: { cooking: 0.5, baking: 0.5, environment: 1 }, hob: hobOf('rangeRetro', { W: 0.8, D: 0.66, cols: [0.28, 0.72], rows: [0.32, 0.7], y: 0.915 }), fin: [applianceR(), metalR(['metal']), fabricR(['carpet'], 'Knobs')] }),
  ];
  const wallOvenFit = fit('wallOven', FP11, 2, { back: WALL_GAP });
  const WALL_OVEN = obj(wallOvenFit, {
    id: 'wall-oven-tower', name: 'Tall Wall-Oven Tower', category: 'kitchen', subcategory: 'stove', rooms: ROOM_K, style: 'modern',
    description: 'A built-in oven tower with a storage drawer below and a warming drawer above. Bakes beautifully.',
    tags: STOVE_TAGS, packs: ['modern-minimal'], tier: 'premium', price: dollars(1450), quality: 4, functional: true, footprint: FP11, layer: 'floor',
    blocksMovement: true, slots: [useFront('use', 0.5, wallOvenFit, 1)], interactions: ['bakeTreat', 'sellBakes'], stats: { cooking: 0.5, baking: 1.5 },
    finishes: [darkMetalR('Body'), trimR(['metal'], 'Door')], anim: ovenAnim(1),
  });
  const microDef = (model: string, o: { id: string; name: string; desc: string; style: string; tier: ObjectDef['tier']; price: number; q: number; packs?: string[]; fin: ObjectDef['finishes'] }) => {
    const f = fit(model, FP11, 2);
    return obj(f, {
      id: o.id, name: o.name, category: 'kitchen', subcategory: 'appliance', rooms: ROOM_K, style: o.style, description: o.desc, tags: ['appliance', 'decor', 'kitchen'],
      packs: o.packs ?? ['everyday-essentials'], tier: o.tier, price: dollars(o.price), quality: o.q, functional: false, footprint: FP11, layer: 'surface', blocksMovement: false,
      slots: [useFront('use', 0.5, null, 1)], stats: { environment: 1 }, finishes: o.fin,
      anim: { kind: 'microwave', parts: [{ node: 'anim:door', role: 'door', axis: 'y', angle: -1.9 }, { node: 'anim:interior', role: 'interior' }] },
    });
  };
  const MICROWAVES = [
    microDef('microwaveSteel', { id: 'microwave-steel', name: 'Steel Microwave', desc: 'A brushed-steel countertop microwave with a dark glass door. Decorative for now; it stands on any counter.', style: 'modern', tier: 'standard', price: 170, q: 3, fin: [steelR('Body'), darkMetalR('Panel')] }),
    microDef('microwaveRetro', { id: 'microwave-retro', name: 'Retro Wood-Panel Microwave', desc: 'A cream microwave with wood-grain side panels and one big dial. Decorative for now; it stands on any counter.', style: 'retro', tier: 'budget', price: 120, q: 2, packs: ['mid-century'], fin: [applianceR(), woodR(['wood']), fabricR(['carpet'], 'Dial')] }),
  ];
  const hoodFit = fit('rangeHood', FP11, 2, { back: WALL_GAP, lift: 1.55 });
  const HOOD = obj(hoodFit, {
    id: 'range-hood-chimney', name: 'Chimney Range Hood', category: 'kitchen', subcategory: 'appliance', rooms: ROOM_K, style: 'modern',
    description: 'A steel chimney hood that hangs over the cooker. Purely decorative.', tags: ['appliance', 'decor', 'kitchen', 'wall'], tier: 'standard', price: dollars(380), quality: 3,
    functional: false, footprint: FP11, layer: 'wall', needsWall: true, blocksMovement: false, stats: { environment: 1 }, finishes: [steelR('Steel')],
  });

  // ---- kitchen: dishwashers, sinks, counters, island, pantry -----------------------------------------------------------------
  const dwDef = (model: string, o: { id: string; name: string; desc: string; style: string; tier: ObjectDef['tier']; price: number; q: number; packs?: string[]; fin: ObjectDef['finishes'] }) => {
    const f = fit(model, FP11, 2, { back: 0.02 });
    return obj(f, {
      id: o.id, name: o.name, category: 'kitchen', subcategory: 'dishwasher', rooms: ROOM_K, style: o.style, description: o.desc,
      tags: ['dishwasher', 'dishes', 'appliance', 'plumbing', 'cleanable', 'surface'], packs: o.packs ?? ['everyday-essentials'], tier: o.tier, price: dollars(o.price), quality: o.q,
      functional: true, footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: 0.9, slots: [useFront('use', 0.5, f, 1)], interactions: [], stats: { hygiene: 1 },
      finishes: o.fin, anim: { kind: 'dishwasher', parts: [{ node: 'anim:door', role: 'door', axis: 'x', angle: 1.4 }, { node: 'anim:interior', role: 'interior' }] },
    });
  };
  const DISHWASHERS = [
    dwDef('dishwasherPanel', { id: 'dishwasher-panel-front', name: 'Panel-Front Dishwasher', desc: 'A dishwasher hidden behind a matching wooden door. Dirty plates are washed in half the time of a sink. Items can stand on its worktop.', style: 'classic', tier: 'standard', price: 720, q: 3, packs: ['classic-townhouse', 'cozy-cottage'], fin: [wood2(), counterR()] }),
    dwDef('dishwasherSteel', { id: 'dishwasher-steel-pro', name: 'Steel Pro Dishwasher', desc: 'A heavy steel dishwasher with a bar handle and a quiet motor. Items can stand on its worktop.', style: 'industrial', tier: 'premium', price: 1120, q: 4, packs: ['industrial-loft', 'modern-minimal'], fin: [steelR('Steel')] }),
  ];
  const SINK_TAGS = ['sink', 'counter', 'surface', 'plumbing', 'cleanable'];
  const sinkDef = (model: string, o: { id: string; name: string; desc: string; style: string; tier: ObjectDef['tier']; price: number; q: number; fp?: { w: number; d: number }; packs?: string[]; tap: Anim['tap']; fin: ObjectDef['finishes'] }) => {
    const fp = o.fp ?? FP11, f = fit(model, fp, 2, { back: 0.02 });
    return obj(f, {
      id: o.id, name: o.name, category: 'kitchen', subcategory: 'sink', rooms: ROOM_K, style: o.style, description: o.desc, tags: SINK_TAGS, packs: o.packs ?? ['everyday-essentials'],
      tier: o.tier, price: dollars(o.price), quality: o.q, functional: true, footprint: fp, layer: 'floor', blocksMovement: true, surfaceHeight: 0.9,
      slots: [useFront('use', fp.w / 2, f, fp.d)], interactions: ['washHands'], stats: { hygiene: 1 }, finishes: o.fin, anim: sinkAnim(o.tap),
    });
  };
  const SINKS = [
    sinkDef('sinkSingleBowl', { id: 'sink-single-bowl', name: 'Single-Bowl Sink Unit', desc: 'A steel worktop with one deep bowl and a swan-neck tap over a shaker cabinet. Wash your hands, or the dishes.', style: 'classic', tier: 'standard', price: 520, q: 3, tap: tapOf('sinkSingleBowl', 0.45, 0.25, 1.1, 0.74), fin: [wood2(), counterR()] }),
    sinkDef('sinkDoubleBowl', { id: 'sink-double-bowl', name: 'Double-Bowl Sink Unit', desc: 'Two bowls and a ribbed drainer on a two-tile cabinet with four doors. Plenty of room for a washing-up.', style: 'classic', tier: 'premium', price: 880, q: 4, fp: FP21, tap: tapOf('sinkDoubleBowl', 0.76, 0.25, 1.1, 0.74), fin: [wood2(), counterR()] }),
    sinkDef('sinkFarmhouse', { id: 'sink-farmhouse', name: 'Farmhouse Apron Sink', desc: 'A deep white ceramic apron-front sink set into a timber cabinet. Wash your hands, or the dishes.', style: 'cottage', tier: 'premium', price: 940, q: 4, packs: ['cozy-cottage', 'botanical-living'], tap: tapOf('sinkFarmhouse', 0.45, 0.34, 1.1, 0.65), fin: [wood2(), whiteR('Ceramic'), metalR(['metal'])] }),
  ];
  const counterDef = (model: string, o: { id: string; name: string; desc: string; sub?: string; style: string; tier: ObjectDef['tier']; price: number; q: number; fp?: { w: number; d: number }; packs?: string[]; tags?: string[]; sh?: number; fin: ObjectDef['finishes']; rooms?: ObjectDef['rooms']; back?: number }) => {
    const fp = o.fp ?? FP11, f = fit(model, fp, 2, { back: o.back ?? 0.02 });
    return obj(f, {
      id: o.id, name: o.name, category: 'kitchen', subcategory: o.sub ?? 'counter', rooms: o.rooms ?? ROOM_K, style: o.style, description: o.desc,
      tags: o.tags ?? ['counter', 'surface', 'storage', 'cleanable'], packs: o.packs ?? ['everyday-essentials'], tier: o.tier, price: dollars(o.price), quality: o.q, functional: true,
      footprint: fp, layer: 'floor', blocksMovement: true, surfaceHeight: o.sh ?? 0.9, finishes: o.fin,
    });
  };
  const COUNTERS = [
    counterDef('counterShaker', { id: 'counter-shaker', name: 'Shaker Cabinet Counter', desc: 'A base cabinet with framed shaker doors and a worktop at the standard height. Cooked meals are served on free counters.', style: 'cottage', tier: 'standard', price: 330, q: 3, packs: ['cozy-cottage', 'everyday-essentials'], fin: [wood2(), counterR()] }),
    counterDef('counterCornerL', { id: 'counter-corner-blind', name: 'Blind Corner Counter', desc: 'A corner cabinet with an angled door that turns an L-shaped kitchen. Same worktop height as the other units.', style: 'modern', tier: 'budget', price: 280, q: 2, tags: ['counter', 'surface', 'storage', 'corner', 'cleanable'], back: 0, fin: [wood2(), counterR()] }),
    counterDef('counterButcherBlock', { id: 'counter-butcher-block', name: 'Butcher-Block Prep Table', desc: 'An open prep table with a thick wooden top and basket shelves below. Serve meals here or chop on it.', style: 'cottage', tier: 'standard', price: 420, q: 3, packs: ['cozy-cottage', 'botanical-living'], fin: [wood2(), metalR(['metal'])] }),
  ];
  const wallCabFit = fit('wallCabinetShaker', FP11, 2, { back: WALL_GAP, lift: 1.45 });
  const WALL_CABINET = obj(wallCabFit, {
    id: 'wall-cabinet-shaker', name: 'Shaker Wall Cabinet', category: 'kitchen', subcategory: 'storage', rooms: ROOM_K, style: 'cottage',
    description: 'A two-door wall cabinet that hangs above the worktops. Decorative.', tags: ['storage', 'wall', 'decor'], packs: ['cozy-cottage'], tier: 'budget', price: dollars(170), quality: 2,
    functional: false, footprint: FP11, layer: 'wall', needsWall: true, blocksMovement: false, stats: { environment: 1 }, finishes: [wood2(), metalR(['metal'])],
  });
  const islandFit = fit('kitchenIsland', FP21, 2, { back: 0.01 });
  const ISLAND = obj(islandFit, {
    id: 'kitchen-island', name: 'Kitchen Island', category: 'kitchen', subcategory: 'counter', rooms: ['kitchen', 'dining'], style: 'modern',
    description: 'A two-tile island with drawers, cupboards and a breakfast overhang at the front. Serve meals here.', tags: ['counter', 'surface', 'storage', 'bar', 'cleanable'], packs: ['modern-minimal', 'everyday-essentials'],
    tier: 'premium', price: dollars(1150), quality: 4, functional: true, footprint: FP21, layer: 'floor', blocksMovement: true, surfaceHeight: 0.92, finishes: [wood2(), counterR()],
  });
  const pantryFit = fit('pantryTall', FP11, 2, { back: WALL_GAP });
  const PANTRY = obj(pantryFit, {
    id: 'pantry-tall', name: 'Tall Larder Pantry', category: 'kitchen', subcategory: 'storage', rooms: ROOM_K, style: 'classic',
    description: 'A tall two-door larder with shelves of tins, jars and bread. Open it to grab a snack.', tags: ['pantry', 'storage', 'food', 'cleanable'], packs: ['everyday-essentials', 'cozy-cottage'],
    tier: 'standard', price: dollars(450), quality: 3, functional: true, footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, pantryFit, 1)],
    interactions: ['grabSnack'], stats: { environment: 1 }, finishes: [wood2(), metalR(['metal'])],
    anim: fridgeAnim([door('door', 'L', 1.9), door('door2', 'R', 1.9)]),
  });
  const countertop = (model: string, o: { id: string; name: string; desc: string; style: string; tier: ObjectDef['tier']; price: number; q: number; ix?: string; stats?: ObjectDef['stats']; tags: string[]; fin: ObjectDef['finishes']; packs?: string[]; rooms?: ObjectDef['rooms'] }) => {
    const f = fit(model, FP11, 2);
    return obj(f, {
      id: o.id, name: o.name, category: 'kitchen', subcategory: 'appliance', rooms: o.rooms ?? ROOM_K, style: o.style, description: o.desc, tags: o.tags, packs: o.packs ?? ['everyday-essentials'],
      tier: o.tier, price: dollars(o.price), quality: o.q, functional: !!o.ix, footprint: FP11, layer: 'surface', blocksMovement: false,
      slots: o.ix ? [useFront('use', 0.5, null, 1)] : [], interactions: o.ix ? [o.ix] : [], stats: o.stats ?? {}, finishes: o.fin,
    });
  };
  const KITCHEN_SMALL = [
    countertop('toasterFourSlice', { id: 'toaster-four-slice', name: 'Four-Slice Toaster', desc: 'A chrome four-slice toaster for the whole family. Pop a slice in for $1 and get a quick +15 hunger.', style: 'retro', tier: 'standard', price: 85, q: 3, ix: 'makeToast', tags: ['appliance', 'toaster'], packs: ['mid-century', 'everyday-essentials'], fin: [metalR(['metal'])] }),
    countertop('coffeeMakerDrip', { id: 'coffee-maker-drip', name: 'Drip Coffee Maker', desc: 'A glass-jug filter coffee maker. Brew a cup for $2: a quick +12 energy and a little cheer.', style: 'classic', tier: 'budget', price: 90, q: 2, ix: 'makeCoffee', tags: ['appliance', 'coffee', 'cleanable'], stats: { environment: 1 }, fin: [darkMetalR('Body')] }),
    countertop('kettleElectric', { id: 'kettle-electric', name: 'Electric Kettle', desc: 'A white electric kettle on its power base. Decorative for now; it stands on any counter.', style: 'modern', tier: 'budget', price: 45, q: 2, tags: ['appliance', 'decor', 'kitchen'], stats: { environment: 1 }, fin: [applianceR(['metalLight'])] }),
  ];
  const spiceFit = fit('spiceRack', FP11, 2, { back: WALL_GAP, lift: 1.3 });
  const SPICE_RACK = obj(spiceFit, {
    id: 'spice-rack-wall', name: 'Wall Spice Rack', category: 'kitchen', subcategory: 'storage', rooms: ROOM_K, style: 'cottage', description: 'A two-shelf rack of spice jars for the kitchen wall. Decorative.',
    tags: ['storage', 'wall', 'decor'], packs: ['cozy-cottage'], tier: 'budget', price: dollars(55), quality: 2, functional: false, footprint: FP11, layer: 'wall', needsWall: true,
    blocksMovement: false, stats: { environment: 1 }, finishes: [wood2()],
  });

  // ---- bathroom: toilets and bidet ----------------------------------------------------------------------------------------
  const lidAnim: Anim = { kind: 'toilet', parts: [{ node: 'anim:lid', role: 'lid', axis: 'x', angle: -1.7 }] };
  const toiletDef = (model: string, o: { id: string; name: string; desc: string; style: string; tier: ObjectDef['tier']; price: number; q: number; comfort: number; packs?: string[]; fin: ObjectDef['finishes']; seat?: number }) => {
    const f = fit(model, FP11, 2, { back: WALL_GAP });
    return obj(f, {
      id: o.id, name: o.name, category: 'bathroom', subcategory: 'toilet', rooms: ['bathroom'], style: o.style, description: o.desc, tags: ['toilet', 'fixture', 'plumbing', 'cleanable'],
      packs: o.packs ?? ['everyday-essentials'], tier: o.tier, price: dollars(o.price), quality: o.q, functional: true, footprint: FP11, layer: 'floor', blocksMovement: true,
      slots: [sit('seat', f.at(0.5, 0.62), o.seat ?? 0.43, [0, 1])], interactions: ['useToilet'], stats: { comfort: o.comfort }, finishes: o.fin, anim: lidAnim,
    });
  };
  const TOILETS = [
    toiletDef('toiletBudget', { id: 'toilet-budget', name: 'Budget Toilet', desc: 'A plain close-coupled toilet with a tall boxy cistern. Does the job.', style: 'classic', tier: 'budget', price: 140, q: 1, comfort: 1, fin: [whiteR()] }),
    toiletDef('toiletRound', { id: 'toilet-round-blue', name: 'Round Toilet, Blue Seat', desc: 'A rounded toilet with a drum cistern, dual flush and a cheerful coloured seat.', style: 'modern', tier: 'standard', price: 330, q: 3, comfort: 3, packs: ['everyday-essentials', 'kids-storybook'], fin: [whiteR(), blueR('Seat')] }),
    toiletDef('toiletHighCistern', { id: 'toilet-high-cistern', name: 'High-Cistern Toilet', desc: 'A Victorian toilet with an iron cistern on the wall, a pull chain and a wooden seat.', style: 'classic', tier: 'premium', price: 780, q: 4, comfort: 2, seat: 0.43, packs: ['classic-townhouse', 'cozy-cottage'], fin: [whiteR(), woodR(['wood']), darkMetalR('Cistern')] }),
    toiletDef('toiletWallHung', { id: 'toilet-wall-hung', name: 'Wall-Hung Toilet', desc: 'A floating bowl with the cistern hidden in the wall. Sleek and easy to clean around.', style: 'modern', tier: 'premium', price: 720, q: 4, comfort: 3, seat: 0.4, packs: ['modern-minimal'], fin: [whiteR(), metalR(['metalLight'])] }),
  ];
  const bidetFit = fit('bidet', FP11, 2, { back: WALL_GAP });
  const BIDET = obj(bidetFit, {
    id: 'bidet', name: 'Bidet', category: 'bathroom', subcategory: 'sink', rooms: ['bathroom'], style: 'classic', description: 'A ceramic bidet with a mixer tap. A quick freshen-up: wash your hands here.',
    tags: ['bidet', 'fixture', 'plumbing', 'cleanable'], packs: ['classic-townhouse'], tier: 'standard', price: dollars(380), quality: 3, functional: true, footprint: FP11, layer: 'floor',
    blocksMovement: true, slots: [useFront('use', 0.5, bidetFit, 1)], interactions: ['washHands'], stats: { hygiene: 1.2 }, finishes: [whiteR()],
    anim: sinkAnim(tapOf('bidet', 0.21, 0.16, 0.5, 0.41)),
  });

  // ---- bathroom: basins and vanities ---------------------------------------------------------------------------------------
  const basinDef = (model: string, o: { id: string; name: string; desc: string; style: string; tier: ObjectDef['tier']; price: number; q: number; fp?: { w: number; d: number }; packs?: string[]; tags?: string[]; tap: Anim['tap']; fin: ObjectDef['finishes'] }) => {
    const fp = o.fp ?? FP11, f = fit(model, fp, 2, { back: WALL_GAP });
    return obj(f, {
      id: o.id, name: o.name, category: 'bathroom', subcategory: 'sink', rooms: ['bathroom'], style: o.style, description: o.desc, tags: o.tags ?? ['sink', 'fixture', 'plumbing', 'cleanable'],
      packs: o.packs ?? ['everyday-essentials'], tier: o.tier, price: dollars(o.price), quality: o.q, functional: true, footprint: fp, layer: 'floor', blocksMovement: true,
      slots: [useFront('use', fp.w / 2, f, fp.d)], interactions: ['washHands'], stats: { hygiene: 1, environment: 1 }, finishes: o.fin, anim: sinkAnim(o.tap),
    });
  };
  const STORE_SINK = ['sink', 'fixture', 'storage', 'plumbing', 'cleanable'];
  const BASINS = [
    basinDef('basinPedestalRound', { id: 'basin-pedestal-round', name: 'Round Pedestal Basin', desc: 'A round washbasin on a slim column. Pairs with a mirror above it.', style: 'classic', tier: 'budget', price: 150, q: 2, tap: tapOf('basinPedestalRound', 0.3, 0.18, 0.99, 0.86), fin: [whiteR(), metalR(['metalLight'])] }),
    basinDef('vanityDouble', { id: 'vanity-double', name: 'Double Vanity Unit', desc: 'Two basins on a two-tile cabinet with four doors, for a busy morning. Pairs with mirrors above.', style: 'modern', tier: 'premium', price: 1050, q: 4, fp: FP21, tags: STORE_SINK, packs: ['modern-minimal'], tap: tapOf('vanityDouble', 0.37, 0.17, 0.99, 0.69), fin: [wood2(), whiteR()] }),
    basinDef('vanityVessel', { id: 'vanity-vessel', name: 'Vessel Basin Vanity', desc: 'A bowl sitting on a wooden vanity with a tall tap and two drawers.', style: 'modern', tier: 'standard', price: 520, q: 3, tags: STORE_SINK, packs: ['modern-minimal', 'botanical-living'], tap: tapOf('vanityVessel', 0.4, 0.2, 1.2, 0.99), fin: [wood2(), whiteR(), metalR(['metalLight'])] }),
    basinDef('basinConsole', { id: 'basin-console', name: 'Chrome-Leg Console Basin', desc: 'A wide ceramic basin on chrome legs with a towel rail at the front.', style: 'art-deco', tier: 'standard', price: 440, q: 3, packs: ['art-deco', 'classic-townhouse'], tap: tapOf('basinConsole', 0.4, 0.2, 0.97, 0.83), fin: [whiteR(), metalR(['metal'])] }),
    basinDef('vanityCompact', { id: 'vanity-compact-blue', name: 'Compact Vanity', desc: 'A narrow blue cabinet with a moulded basin top. Fits the smallest bathroom.', style: 'modern', tier: 'budget', price: 210, q: 2, tags: STORE_SINK, packs: ['everyday-essentials', 'coastal-home'], tap: tapOf('vanityCompact', 0.3, 0.17, 0.97, 0.85), fin: [blueR('Cabinet'), whiteR()] }),
  ];

  // ---- bathroom: showers and baths ----------------------------------------------------------------------------------------
  // The glass door swings open while the person steps in and out (render/objectAnim.ts); the water runs behind the closed door.
  const showerDef = (model: string, o: { id: string; name: string; desc: string; style: string; tier: ObjectDef['tier']; price: number; q: number; angle: number; h: number; packs?: string[]; fin: ObjectDef['finishes']; stats?: ObjectDef['stats'] }) => {
    const f = fit(model, FP11, 2, { back: 0 });
    return obj(f, {
      id: o.id, name: o.name, category: 'bathroom', subcategory: 'shower', rooms: ['bathroom'], style: o.style, description: o.desc, tags: ['shower', 'fixture', 'plumbing', 'cleanable'],
      packs: o.packs ?? ['everyday-essentials'], tier: o.tier, price: dollars(o.price), quality: o.q, functional: true, footprint: FP11, layer: 'floor', blocksMovement: true,
      slots: [{ id: 'inside', kind: 'use', pos: f.at(0.5, 0.65), height: o.h, facing: Math.PI, approach: [0, 1], posture: 'standing' }],
      interactions: ['takeShower'], stats: o.stats ?? { hygiene: 1 }, finishes: o.fin,
      anim: { kind: 'shower', parts: [{ node: 'anim:door', role: 'door', axis: 'y', angle: o.angle }] },
    });
  };
  const SHOWERS = [
    showerDef('showerWalkIn', { id: 'shower-walk-in', name: 'Walk-In Rain Shower', desc: 'Glass panels, a ceiling rain head and a hinged door. Showers until fully clean (at most 30 minutes).', style: 'modern', tier: 'premium', price: 1150, q: 4, angle: 1.4, h: 0.07, packs: ['modern-minimal'], stats: { hygiene: 1.1, environment: 1 }, fin: [whiteR('Tiles and tray'), metalR(['metal'])] }),
    showerDef('showerCornerSquare', { id: 'shower-corner-square', name: 'Square Corner Shower', desc: 'A squared corner enclosure with a white tray, a wall head and a hinged door. Showers until fully clean (at most 30 minutes).', style: 'modern', tier: 'standard', price: 680, q: 3, angle: -1.4, h: 0.12, fin: [whiteR('Tray'), applianceR(['metalLight'])] }),
    showerDef('showerCabin', { id: 'shower-cabin', name: 'Full Shower Cabin', desc: 'A closed cabin with a roof, a mirror strip, a fold-down seat and a rain head. Showers until fully clean (at most 30 minutes).', style: 'modern', tier: 'luxury', price: 1600, q: 5, angle: -1.4, h: 0.14, packs: ['modern-minimal'], stats: { hygiene: 1.2, comfort: 1, environment: 1 }, fin: [applianceR(['metalLight']), darkMetalR('Tray')] }),
  ];
  const bathDef = (model: string, o: { id: string; name: string; desc: string; style: string; tier: ObjectDef['tier']; price: number; q: number; fp?: { w: number; d: number }; soak?: number; packs?: string[]; fin: ObjectDef['finishes']; stats: ObjectDef['stats'] }) => {
    const fp = o.fp ?? FP21, f = fit(model, fp, 2, { back: WALL_GAP });
    return obj(f, {
      id: o.id, name: o.name, category: 'bathroom', subcategory: 'bath', rooms: ['bathroom'], style: o.style, description: o.desc, tags: ['bath', 'fixture', 'plumbing', 'cleanable'],
      packs: o.packs ?? ['everyday-essentials'], tier: o.tier, price: dollars(o.price), quality: o.q, functional: true, footprint: fp, layer: 'floor', blocksMovement: true,
      slots: [{ id: 'soak', kind: 'use', pos: f.at(0.5, 0.62), height: o.soak ?? 0.2, facing: Math.PI / 2, approach: [0, fp.d], posture: 'seated' }],
      // the glass screen over the rim is a splash screen, not a door: it stays where it is (a 'bath' anim needs no parts)
      interactions: ['takeBath'], stats: o.stats, finishes: o.fin, anim: { kind: 'bath', parts: [] },
    });
  };
  const BATHS = [
    bathDef('bathClawfoot', { id: 'bath-clawfoot', name: 'Clawfoot Bathtub', desc: 'A deep enamel tub on claw feet with a tall riser tap and a splash screen. A long soak lifts the mood.', style: 'classic', tier: 'luxury', price: 2200, q: 5, packs: ['classic-townhouse', 'cozy-cottage'], stats: { hygiene: 1.1, comfort: 7, environment: 3 }, fin: [whiteR(), metalR(['metal'])] }),
    bathDef('bathModern', { id: 'bath-modern-freestanding', name: 'Freestanding Modern Bath', desc: 'A slim-rimmed tub with a sloped backrest and a floor-standing filler. A relaxing soak cleans slowly but lifts the mood.', style: 'modern', tier: 'premium', price: 1750, q: 4, packs: ['modern-minimal'], stats: { hygiene: 1.1, comfort: 6, environment: 2 }, fin: [whiteR(), metalR(['metal'])] }),
    bathDef('bathBudget', { id: 'bath-budget-acrylic', name: 'Budget Acrylic Bath', desc: 'A plain white acrylic tub with a shower plate and a screen. Cheap, and it holds the water.', style: 'modern', tier: 'budget', price: 420, q: 2, soak: 0.19, stats: { hygiene: 1, comfort: 4, environment: 1 }, fin: [whiteR()] }),
    bathDef('bathShowerCombo', { id: 'bath-shower-combo', name: 'Shower-Bath Combo', desc: 'A tub with a tiled wall, a shower head and a long glass screen: a soak or a quick shower in one space.', style: 'modern', tier: 'standard', price: 900, q: 3, soak: 0.2, stats: { hygiene: 1.1, comfort: 5, environment: 1 }, fin: [whiteR(), metalR(['metal'])] }),
    bathDef('bathCornerSpa', { id: 'bath-corner-spa', name: 'Sunken Spa Bath', desc: 'A square tub sunk into a wooden deck with a mixer and a corner step seat. Two tiles of pure indulgence.', style: 'modern', tier: 'luxury', price: 3000, q: 5, fp: FP22, soak: 0.3, packs: ['botanical-living', 'modern-minimal'], stats: { hygiene: 1.2, comfort: 9, environment: 4 }, fin: [woodR(['wood']), whiteR(), metalR(['metal'])] }),
  ];

  // ---- bathroom: mirrors, rails, shelves, basket, laundry ------------------------------------------------------------------------
  const mirrorDef = (model: string, o: { id: string; name: string; desc: string; style: string; tier: ObjectDef['tier']; price: number; q: number; parts: Anim['parts']; fin: ObjectDef['finishes'] }) => {
    const f = fit(model, FP11, 2, { back: WALL_GAP, lift: 1.05 });
    return obj(f, {
      id: o.id, name: o.name, category: 'bathroom', subcategory: 'mirror', rooms: ['bathroom', 'bedroom'], style: o.style, description: o.desc, tags: ['mirror', 'wall', 'storage'],
      packs: ['everyday-essentials'], tier: o.tier, price: dollars(o.price), quality: o.q, functional: true, footprint: FP11, layer: 'wall', needsWall: true, blocksMovement: false,
      slots: [useFront('use', 0.5, null, 1)], interactions: ['practiceSpeech'], stats: { skill: 1, environment: 1 }, finishes: o.fin,
      anim: { kind: 'openWhileUsed', on: ['practiceSpeech'], parts: [...o.parts, { node: 'anim:interior', role: 'interior' }] },
    });
  };
  const MIRRORS = [
    mirrorDef('mirrorCabinetWide', { id: 'mirror-cabinet-wide', name: 'Wide Mirror Cabinet', desc: 'A wide cabinet with a mirrored door and shelves of toiletries behind. Practise speeches in front of it to build charisma.', style: 'classic', tier: 'standard', price: 320, q: 3, parts: [door('door', 'L', 1.9)], fin: [wood2()] }),
    mirrorDef('mirrorCabinetSlim', { id: 'mirror-cabinet-slim', name: 'Slim Mirror Cabinet', desc: 'A narrow white cabinet with one mirrored door and three shelves. Practise speeches in front of it to build charisma.', style: 'modern', tier: 'budget', price: 190, q: 2, parts: [door('door', 'R', 1.9)], fin: [applianceR(['metalLight'])] }),
  ];
  const wallBath = (model: string, o: { id: string; name: string; desc: string; sub: string; lift: number; style: string; price: number; fin: ObjectDef['finishes']; packs?: string[] }) => {
    const f = fit(model, FP11, 2, { back: WALL_GAP, lift: o.lift });
    return obj(f, {
      id: o.id, name: o.name, category: 'bathroom', subcategory: o.sub, rooms: ['bathroom'], style: o.style, description: o.desc, tags: ['storage', 'wall', 'decor'], packs: o.packs ?? ['everyday-essentials'],
      tier: 'budget', price: dollars(o.price), quality: 2, functional: false, footprint: FP11, layer: 'wall', needsWall: true, blocksMovement: false, stats: { environment: 1 }, finishes: o.fin,
    });
  };
  const BATH_WALL = [
    wallBath('towelRail', { id: 'towel-rail-heated', name: 'Heated Towel Rail', desc: 'A chrome ladder rail with towels warming on it. Decorative.', sub: 'storage', lift: 0.7, style: 'modern', price: 130, fin: [metalR(['metal']), blueR('Towels')] }),
    wallBath('bathShelf', { id: 'bathroom-shelf-towels', name: 'Bathroom Shelf', desc: 'A two-tier white shelf with towel rolls, soap and a little plant. Decorative.', sub: 'storage', lift: 1.0, style: 'modern', price: 70, fin: [applianceR(['metalLight'])] }),
  ];
  const basketFit = fit('laundryBasket', FP11, 2);
  const BASKET = obj(basketFit, {
    id: 'laundry-basket', name: 'Wicker Laundry Basket', category: 'bathroom', subcategory: 'storage', rooms: ['bathroom', 'bedroom'], style: 'cottage', description: 'A wicker basket piled with washing. Decorative.',
    tags: ['laundry', 'decor'], packs: ['cozy-cottage'], tier: 'budget', price: dollars(35), quality: 2, functional: false, footprint: FP11, layer: 'floor', blocksMovement: true, stats: { environment: 1 }, finishes: [wood2()],
  });
  const laundryDef = (model: string, o: { id: string; name: string; desc: string; style: string; tier: ObjectDef['tier']; price: number; q: number; tag: string; anim: Anim; packs?: string[]; fin: ObjectDef['finishes'] }) => {
    const f = fit(model, FP11, 2, { back: WALL_GAP });
    return obj(f, {
      id: o.id, name: o.name, category: 'bathroom', subcategory: 'laundry', rooms: ['bathroom', 'kitchen'], style: o.style, description: o.desc, tags: ['laundry', 'appliance', o.tag],
      packs: o.packs ?? ['everyday-essentials'], tier: o.tier, price: dollars(o.price), quality: o.q, functional: false, footprint: FP11, layer: 'floor', blocksMovement: true,
      slots: [useFront('use', 0.5, f, 1)], stats: { environment: 1 }, finishes: o.fin, anim: o.anim,
    });
  };
  const doorM = (n: 'door' | 'door2' = 'door'): Anim['parts'][number] => ({ node: `anim:${n}`, role: 'door', axis: 'y', angle: -1.9 });
  const LAUNDRY = [
    laundryDef('washerFrontSteel', { id: 'washer-front-steel', name: 'Steel Front-Load Washer', desc: 'A steel washing machine with a chrome porthole door. Decorative for now; laundry arrives with housework.', style: 'modern', tier: 'premium', price: 880, q: 4, tag: 'washer', anim: { kind: 'laundry', parts: [doorM(), { node: 'anim:interior', role: 'interior' }] }, fin: [steelR()] }),
    laundryDef('washerTopLoad', { id: 'washer-top-load', name: 'Top-Loading Washer', desc: 'A no-nonsense top-loader with a glass-windowed lid. Decorative for now; laundry arrives with housework.', style: 'classic', tier: 'budget', price: 380, q: 2, tag: 'washer', anim: { kind: 'laundry', parts: [{ node: 'anim:lid', role: 'lid', axis: 'x', angle: -1.3 }, { node: 'anim:interior', role: 'interior' }] }, fin: [applianceR()] }),
    laundryDef('dryerVented', { id: 'dryer-vented-black', name: 'Vented Tumble Dryer', desc: 'A big-drum dryer with a black door and a lint filter on top. Decorative for now; laundry arrives with housework.', style: 'modern', tier: 'standard', price: 540, q: 3, tag: 'dryer', anim: { kind: 'laundry', parts: [doorM(), { node: 'anim:interior', role: 'interior' }] }, fin: [applianceR(), metalR(['metalMedium'])] }),
    laundryDef('washerDryerStack', { id: 'washer-dryer-stack', name: 'Washer-Dryer Stack', desc: 'A dryer stacked on a washer: two machines on one tile. Decorative for now; laundry arrives with housework.', style: 'modern', tier: 'premium', price: 1250, q: 4, tag: 'washer', packs: ['modern-minimal'], anim: { kind: 'laundry', parts: [doorM('door'), doorM('door2'), { node: 'anim:interior', role: 'interior' }] }, fin: [applianceR()] }),
  ];

  // ---- electronics -------------------------------------------------------------------------------------------------------
  const TV_ROOMS: ObjectDef['rooms'] = ['living', 'bedroom'];
  const tvDef = (model: string, o: { id: string; name: string; desc: string; sub?: string; style: string; tier: ObjectDef['tier']; price: number; q: number; fun: number; wall?: number; fp?: { w: number; d: number }; floor?: boolean; packs?: string[]; fin: ObjectDef['finishes']; rooms?: ObjectDef['rooms']; ix?: string[]; tags?: string[] }) => {
    const fp = o.fp ?? FP11, f = o.wall !== undefined ? fit(model, fp, 2, { back: WALL_GAP, lift: o.wall }) : fit(model, fp, 2);
    return obj(f, {
      id: o.id, name: o.name, category: 'electronics', subcategory: o.sub ?? 'tv', rooms: o.rooms ?? TV_ROOMS, style: o.style, description: o.desc, tags: o.tags ?? ['tv', 'electronics'],
      packs: o.packs ?? ['everyday-essentials'], tier: o.tier, price: dollars(o.price), quality: o.q, functional: true, footprint: fp,
      layer: o.wall !== undefined ? 'wall' : o.floor ? 'floor' : 'surface', ...(o.wall !== undefined ? { needsWall: true } : {}), blocksMovement: !!o.floor,
      slots: [useFront('view', fp.w / 2, o.floor ? f : null, fp.d)], interactions: o.ix ?? ['watchTv'], stats: { fun: o.fun }, finishes: o.fin, screen: true,
    });
  };
  const TVS = [
    tvDef('tvPortable', { id: 'tv-portable-rabbit', name: 'Portable TV with Aerial', desc: 'A small set with rabbit-ear aerials for a kitchen counter or a bedside. The little screen is only mildly entertaining.', style: 'retro', tier: 'budget', price: 90, q: 1, fun: 0.7, rooms: ['living', 'bedroom', 'kitchen'], packs: ['mid-century', 'everyday-essentials'], fin: [darkMetalR('Case')] }),
    tvDef('tvWallSlim', { id: 'tv-wall-mounted', name: 'Wall-Mounted Slim TV', desc: 'An ultra-thin television hung on the wall on a flat bracket. Viewers use a seat facing it within 5 m.', style: 'modern', tier: 'premium', price: 1100, q: 4, fun: 1.2, wall: 1.0, packs: ['modern-minimal'], fin: [darkMetalR('Case')] }),
    tvDef('tvCurved', { id: 'tv-curved-wide', name: 'Curved Widescreen TV', desc: 'A wide curved television on a flat foot. A big picture makes an evening in more fun.', style: 'modern', tier: 'luxury', price: 1700, q: 5, fun: 1.4, packs: ['modern-minimal'], fin: [darkMetalR('Case'), applianceR(['metalLight'])] }),
    tvDef('tvCrtBox', { id: 'tv-crt-woodgrain', name: 'Old CRT Television', desc: 'A heavy tube set with woodgrain knobs. Charming, but the screen is small and fuzzy.', style: 'retro', tier: 'budget', price: 70, q: 1, fun: 0.75, packs: ['mid-century'], fin: [metalR(['metalMedium']), woodR(['wood'])] }),
    tvDef('projectorScreen', { id: 'projector-screen', name: 'Drop-Down Projector Screen', desc: 'A roll-down cinema screen for the living-room wall. Viewers use a seat facing it within 5 m.', style: 'modern', tier: 'standard', price: 420, q: 3, fun: 1.1, wall: 1.1, rooms: ['living', 'bedroom'], packs: ['modern-minimal', 'creative-studio'], fin: [darkMetalR('Case')] }),
    tvDef('consoleSet', { id: 'game-console-set', name: 'Game Console Set', desc: 'A television on a low unit with a game console and two controllers. Watch TV or play games on it.', sub: 'tv', style: 'modern', tier: 'standard', price: 760, q: 3, fun: 1.3, fp: FP11, floor: true, ix: ['watchTv', 'playComputerGames'], tags: ['tv', 'electronics', 'gaming'], packs: ['everyday-essentials', 'kids-storybook'], fin: [wood2()] }),
    tvDef('homeCinema', { id: 'home-cinema', name: 'Home Cinema Unit', desc: 'A big screen with a soundbar and two speakers on a two-tile media unit. The best seat in the house is anywhere facing it.', style: 'modern', tier: 'luxury', price: 2600, q: 5, fun: 1.6, fp: FP21, floor: true, packs: ['modern-minimal'], fin: [wood2()] }),
  ];
  const computerDef = (model: string, o: { id: string; name: string; desc: string; style: string; tier: ObjectDef['tier']; price: number; q: number; fun: number; skill: number; tags?: string[]; ix?: string[]; packs?: string[]; fin: ObjectDef['finishes']; rooms?: ObjectDef['rooms'] }) => {
    const f = fit(model, FP11, 2);
    return obj(f, {
      id: o.id, name: o.name, category: 'electronics', subcategory: 'computer', rooms: o.rooms ?? ['study', 'bedroom'], style: o.style, description: o.desc, tags: o.tags ?? ['computer', 'electronics'],
      packs: o.packs ?? ['everyday-essentials'], tier: o.tier, price: dollars(o.price), quality: o.q, functional: true, footprint: FP11, layer: 'surface', blocksMovement: false,
      slots: [useFront('use', 0.5, null, 1)], interactions: o.ix ?? ['playComputerGames', 'practiceProgramming', 'writeArticle', 'writeBook', 'programGig', 'jobSearch', 'adoptOnline', 'researchOnline', 'writePaper'],
      stats: { fun: o.fun, skill: o.skill }, finishes: o.fin, screen: true,
    });
  };
  const LAPTOP_IX = ['playComputerGames', 'practiceProgramming', 'adoptOnline', 'researchOnline', 'writePaper'];
  const COMPUTERS = [
    computerDef('pcGaming', { id: 'pc-gaming-tower', name: 'Gaming PC', desc: 'A glowing tower with a side window, a big monitor and a red keyboard. Games run beautifully.', style: 'modern', tier: 'luxury', price: 1750, q: 5, fun: 1.5, skill: 1.1, packs: ['creative-studio'], fin: [darkMetalR('Case')] }),
    computerDef('pcAllInOne', { id: 'pc-all-in-one', name: 'All-in-One Computer', desc: 'A thin all-in-one machine with the whole computer behind the screen. Tidy and quick.', style: 'modern', tier: 'premium', price: 1350, q: 4, fun: 1.1, skill: 1.1, packs: ['modern-minimal', 'creative-studio'], fin: [applianceR(['metalLight']), metalR(['metal'])] }),
    computerDef('pcRetroBeige', { id: 'pc-retro-beige', name: 'Beige Desktop PC', desc: 'A flat beige case with a chunky tube monitor and a floppy slot. Slow, but full of nostalgia.', style: 'retro', tier: 'budget', price: 260, q: 1, fun: 0.8, skill: 0.8, packs: ['mid-century'], fin: [whiteR('Case'), metalR(['metal'])] }),
    computerDef('laptopGaming', { id: 'laptop-gaming', name: 'Gaming Laptop', desc: 'A thick black laptop with a red-backlit keyboard and cooling vents. Works on any table, desk or counter.', style: 'modern', tier: 'premium', price: 1500, q: 4, fun: 1.3, skill: 1.0, tags: ['computer', 'electronics', 'laptop'], ix: LAPTOP_IX, rooms: ['study', 'living', 'bedroom'], fin: [darkMetalR('Case'), fabricR(['carpet'], 'Key glow')] }),
    computerDef('laptopRetro', { id: 'laptop-retro-cream', name: 'Cream Retro Laptop', desc: 'A chunky cream laptop with a wide bezel and a carry handle. Charming and a little slow.', style: 'retro', tier: 'budget', price: 330, q: 2, fun: 0.8, skill: 0.8, tags: ['computer', 'electronics', 'laptop'], ix: LAPTOP_IX, rooms: ['study', 'living', 'bedroom'], packs: ['mid-century'], fin: [whiteR('Case')] }),
    computerDef('tabletStand', { id: 'tablet-on-stand', name: 'Tablet on a Stand', desc: 'A tablet propped on a metal stand for browsing, writing and casual games. Works on any surface.', style: 'modern', tier: 'standard', price: 520, q: 3, fun: 0.9, skill: 0.8, tags: ['computer', 'electronics', 'tablet'], ix: ['playComputerGames', 'adoptOnline', 'researchOnline', 'writePaper'], rooms: ['study', 'living', 'bedroom', 'kitchen'], fin: [darkMetalR('Case'), trimR(['metal'], 'Stand')] }),
    computerDef('pcUltrawide', { id: 'pc-ultrawide-workstation', name: 'Ultrawide Workstation', desc: 'A long ultrawide monitor, a slim tower and a quiet keyboard. Made for programming and writing.', style: 'industrial', tier: 'luxury', price: 1900, q: 5, fun: 1.0, skill: 1.4, packs: ['industrial-loft', 'creative-studio'], fin: [darkMetalR('Case')] }),
  ];
  const arcadeFit = fit('arcadeCabinet', FP11, 2);
  const ARCADE = obj(arcadeFit, {
    id: 'arcade-cabinet', name: 'Arcade Cabinet', category: 'electronics', subcategory: 'computer', rooms: ['living', 'study', 'kids'], style: 'retro', description: 'A stand-up arcade machine with a joystick, buttons and a glowing marquee. Play computer games standing up.',
    tags: ['computer', 'electronics', 'arcade'], packs: ['mid-century', 'kids-storybook'], tier: 'luxury', price: dollars(2300), quality: 4, functional: true, footprint: FP11, layer: 'floor', blocksMovement: true,
    slots: [useFront('use', 0.5, arcadeFit, 1)], interactions: ['playComputerGames'], stats: { fun: 1.6 }, finishes: [fabricR(['carpetBlue'], 'Cabinet art')], screen: true,
  });
  const audioDef = (model: string, o: { id: string; name: string; desc: string; style: string; tier: ObjectDef['tier']; price: number; q: number; fun: number; skill: number; tags: string[]; fin: ObjectDef['finishes']; packs?: string[]; anim?: Anim; fp?: { w: number; d: number }; rooms?: ObjectDef['rooms']; wall?: number }) => {
    const fp = o.fp ?? FP11, f = fit(model, fp, 2);
    return obj(f, {
      id: o.id, name: o.name, category: 'electronics', subcategory: 'audio', rooms: o.rooms ?? ['living', 'study', 'bedroom'], style: o.style, description: o.desc, tags: o.tags,
      packs: o.packs ?? ['everyday-essentials'], tier: o.tier, price: dollars(o.price), quality: o.q, functional: true, footprint: fp, layer: 'surface', blocksMovement: false,
      slots: o.anim ? [useFront('use', fp.w / 2, null, fp.d)] : [], interactions: ['listenToMusic'], stats: { fun: o.fun, skill: o.skill }, finishes: o.fin, ...(o.anim ? { anim: o.anim } : {}),
    });
  };
  const AUDIO = [
    audioDef('hifiStack', { id: 'hifi-stack', name: 'Hi-Fi Stack', desc: 'An amplifier, CD player and tuner stacked under a wooden lid. Music sounds richer: more fun and a sharper ear.', style: 'classic', tier: 'premium', price: 900, q: 4, fun: 1.3, skill: 1.2, tags: ['stereo', 'music', 'electronics'], packs: ['classic-townhouse', 'creative-studio'], fin: [woodR(['wood']), darkMetalR('Faceplates')] }),
    audioDef('recordPlayer', { id: 'record-player', name: 'Record Player', desc: 'A wooden turntable with a glass dust cover that lifts while a record plays. Warm sound and a good musical ear.', style: 'retro', tier: 'standard', price: 420, q: 3, fun: 1.2, skill: 1.15, tags: ['record-player', 'music', 'electronics'], packs: ['mid-century', 'creative-studio'], fin: [woodR(['wood'])], anim: { kind: 'openWhileUsed', on: ['listenToMusic'], parts: [{ node: 'anim:lid', role: 'lid', axis: 'x', angle: -1.5 }] } }),
    audioDef('boombox', { id: 'boombox', name: 'Boombox', desc: 'A big cassette boombox with a carry handle and an aerial. Loud, cheerful and good for kitchens and gardens.', style: 'retro', tier: 'budget', price: 110, q: 2, fun: 1.0, skill: 0.95, tags: ['radio', 'music', 'electronics'], rooms: ['living', 'kitchen', 'bedroom', 'kids'], packs: ['mid-century', 'kids-storybook'], fin: [metalR(['metalMedium'])] }),
    audioDef('soundbar', { id: 'soundbar', name: 'Soundbar', desc: 'A slim speaker bar that sits under a television. Clean sound without the clutter.', style: 'modern', tier: 'standard', price: 320, q: 3, fun: 1.1, skill: 1.05, tags: ['speaker', 'music', 'electronics'], packs: ['modern-minimal'], fin: [darkMetalR('Case')] }),
    audioDef('speakerSatellites', { id: 'speaker-satellite-pair', name: 'Satellite Speaker Pair', desc: 'Two speakers on slim stands with a cable between them. Stand nearby and listen: a wide, clear sound.', style: 'modern', tier: 'premium', price: 620, q: 4, fun: 1.25, skill: 1.15, tags: ['speaker', 'music', 'electronics'], packs: ['modern-minimal', 'creative-studio'], fin: [darkMetalR('Case')] }),
  ];

  return [
    obj(fridgeRetro, {
      id: 'fridge-retro-tall', name: 'Retro Tall Fridge', category: 'kitchen', subcategory: 'fridge', rooms: ['kitchen'], style: 'retro',
      description: 'A rounded, chrome-handled fridge-freezer with glass shelves and crisper drawers. Swing the door open to grab a snack or gather ingredients.',
      tags: ['fridge', 'appliance', 'food', 'cleanable'], packs: ['mid-century'], tier: 'premium', price: dollars(1450), quality: 4, functional: true,
      footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, fridgeRetro, 1)],
      interactions: ['grabSnack', 'cookMeal'], stats: { cooking: 1, environment: 1 }, finishes: [applianceR(), metalR(['metal'])],
      anim: {
        kind: 'fridge',
        parts: [
          { node: 'anim:door', role: 'door', axis: 'y', angle: -1.75 },
          { node: 'anim:interior', role: 'interior' },
        ],
      },
    }),
    obj(laptopSlim, {
      id: 'laptop-thin', name: 'Slim Laptop', category: 'electronics', subcategory: 'computer', rooms: ['study', 'living', 'bedroom'], style: 'modern',
      description: 'A paper-thin laptop with a bright screen. Works on any table, desk or counter; users take a chair in front of it.',
      tags: ['computer', 'electronics', 'laptop'], packs: ['modern-minimal', 'creative-studio'], tier: 'luxury', price: dollars(1300), quality: 4, functional: true,
      footprint: FP11, layer: 'surface', blocksMovement: false, slots: [useFront('use', 0.5, null, 1)],
      interactions: ['playComputerGames', 'practiceProgramming', 'adoptOnline', 'researchOnline', 'writePaper'], stats: { fun: 1, skill: 1.1 },
      finishes: [darkMetalR('Case')], screen: true,
    }),
    ...KITCHEN_FRIDGES, ...KITCHEN_COOKING, WALL_OVEN, ...MICROWAVES, HOOD, ...DISHWASHERS, ...SINKS, ...COUNTERS, WALL_CABINET, ISLAND, PANTRY, ...KITCHEN_SMALL, SPICE_RACK,
    ...TOILETS, BIDET, ...BASINS, ...SHOWERS, ...BATHS, ...MIRRORS, ...BATH_WALL, BASKET, ...LAUNDRY,
    ...TVS, ...COMPUTERS, ARCADE, ...AUDIO,
  ];
}
