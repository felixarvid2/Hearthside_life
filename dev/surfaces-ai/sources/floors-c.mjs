// Generated-source catalogue for group 'floors-c' (see dev/surfaces-ai/generate.mjs).
// Entries: { id, kind: 'material' | 'motif' | 'mural', prompt, w?, h?, seed?, build? }
// Materials are one continuous surface (joints, boards and bonds are drawn by the painters in packs/floors-c.ts).
const ONE = 'one continuous surface seen from directly above, no joints, no seams, no tiles, no grid, no boards';
export default [
  // --- carpets and textiles -------------------------------------------------------------
  { id: 'pile-shag', kind: 'material', prompt: `close up of long shag pile carpet, thick tangled yarn strands lying in all directions, deep soft pile, ${ONE}`, build: { std: 0.24 } },
  { id: 'pile-saxony', kind: 'material', prompt: `close up of cut pile saxony carpet, dense upright tufts of twisted yarn ends forming a fine speckled velvety surface, ${ONE}` },
  { id: 'pile-frieze', kind: 'material', prompt: `close up of frieze twist carpet, short curly kinked yarn strands tangled in random directions, ${ONE}` },
  { id: 'pile-velvet', kind: 'material', prompt: `close up of dense velvet plush carpet, very short smooth pile with soft brushed light and dark sweeps, almost uniform, ${ONE}`, build: { std: 0.1 } },
  { id: 'wool-boucle', kind: 'material', prompt: `close up of wool boucle textile, small looped curly yarn knots, nubby and irregular, ${ONE}`, build: { std: 0.24 } },
  { id: 'wool-tweed', kind: 'material', prompt: `close up of flatwoven wool tweed carpet, fine twill herringbone weave with flecked yarns, ${ONE}` },
  { id: 'weave-jute', kind: 'material', prompt: `close up of natural jute rug, chunky braided herringbone weave of thick fibre ropes, ${ONE}` },
  { id: 'weave-seagrass', kind: 'material', prompt: `close up of seagrass matting, flat twisted grass strands woven in a tight checkerboard weave, ${ONE}` },
  { id: 'weave-coir', kind: 'material', prompt: `close up of coir coconut fibre matting, coarse hairy brown fibre, tightly woven in a diamond twill, ${ONE}` },
  { id: 'pile-loop-fine', kind: 'material', prompt: `close up of commercial fine loop pile carpet, tiny even rows of tight small loops, hard wearing office carpet, ${ONE}` },
  { id: 'felt-needle', kind: 'material', prompt: `close up of needle punch felt carpet, dense matted short fibres with a fine random fleck, flat and uniform, ${ONE}`, build: { std: 0.1 } },
  { id: 'motif-star', kind: 'motif', prompt: 'a chubby five pointed star with rounded corners, simple bold silhouette' },
  { id: 'motif-medallion', kind: 'motif', prompt: 'an ornate oriental carpet medallion, symmetrical lobed diamond with scrolling arabesque details and small cut-out circles, bold silhouette' },
  { id: 'motif-paisley', kind: 'motif', prompt: 'a single paisley boteh teardrop with a curled tip, decorated with cut-out dots and curved lines, bold silhouette' },
  { id: 'motif-paw', kind: 'motif', prompt: 'a dog paw print, one large pad and four toe pads, bold silhouette' },
  { id: 'motif-kilim', kind: 'motif', prompt: 'a kilim rug diamond motif, stepped geometric diamond with hooked corners and a small diamond inside, stepped pixel edges, bold silhouette' },
  // --- concrete and industrial ----------------------------------------------------------
  { id: 'concrete-trowel', kind: 'material', prompt: `close up of power trowelled concrete floor, soft burnished swirl marks and subtle cloudy tonal variation, a few hairline pores, ${ONE}`, build: { std: 0.1, flatten: 1 } },
  { id: 'concrete-smooth', kind: 'material', prompt: `close up of smooth ground concrete slab, fine sand-like grain, tiny pores and soft mottled clouds, ${ONE}`, build: { std: 0.12, flatten: 1 } },
  { id: 'concrete-broom', kind: 'material', prompt: `close up of broom finished concrete, fine parallel scratch lines running horizontally across rough cement, ${ONE}`, build: { std: 0.13 } },
  { id: 'concrete-stain', kind: 'material', prompt: `close up of acid stained concrete floor, mottled cloudy marbled variations with tiny branching veins, ${ONE}`, build: { std: 0.18, flatten: 0.4 } },
  { id: 'epoxy-flake', kind: 'material', prompt: `close up of epoxy flake garage floor coating, many small flat irregular chips of different tones scattered densely on a smooth glossy ground, ${ONE}`, build: { std: 0.3 } },
  { id: 'steel-brushed', kind: 'material', prompt: `close up of brushed steel plate, fine parallel brushing scratches running horizontally, subtle scuffs, ${ONE}`, build: { std: 0.1 } },
  // --- exterior ------------------------------------------------------------------------
  { id: 'brick-clay', kind: 'material', prompt: `close up of fired clay paving brick surface, fine sandy grain, tiny pits and soft kiln mottling, ${ONE}`, build: { std: 0.14 } },
  { id: 'paver-concrete', kind: 'material', prompt: `close up of concrete block paver surface, fine aggregate speckle, tiny air holes, matte and slightly rough, ${ONE}`, build: { std: 0.13 } },
  { id: 'stone-sandstone', kind: 'material', prompt: `close up of rough sandstone paving, riven surface with faint sedimentary banding and fine grain, ${ONE}`, build: { std: 0.17 } },
  { id: 'wood-deck', kind: 'material', prompt: `close up of weathered hardwood decking boards texture, long straight grain lines running horizontally, small checks and cracks, ${ONE}`, build: { std: 0.15 } },
  { id: 'composite-grain', kind: 'material', prompt: `close up of embossed composite decking surface, repeating faux wood grain streaks running horizontally, even and regular, ${ONE}`, build: { std: 0.1 } },
  { id: 'wood-sleeper', kind: 'material', prompt: `close up of old railway sleeper timber, deep rough grain, splits and weathered checks running horizontally, ${ONE}`, build: { std: 0.18 } },
  { id: 'bark-chips', kind: 'material', prompt: `top view of garden bark mulch chips, many curved pieces of pine bark of different sizes lying loosely and overlapping, ${ONE}`, build: { std: 0.2 } },
  { id: 'slate-chips', kind: 'material', prompt: `top view of crushed slate chippings, many flat angular slate shards of different sizes lying loosely, ${ONE}`, build: { std: 0.2 } },
  { id: 'pebbles-river', kind: 'material', prompt: `top view of large smooth river pebbles tightly packed, rounded oval stones of 3 to 6 cm, ${ONE}`, build: { std: 0.2 } },
  { id: 'resin-gravel', kind: 'material', prompt: `top view of resin bound gravel surface, tiny rounded stones glued flush into a smooth even layer, fine speckle, ${ONE}`, build: { std: 0.14 } },
  { id: 'granite-sett', kind: 'material', prompt: `close up of rough cut granite sett surface, coarse crystalline speckle with tiny chisel marks, ${ONE}`, build: { std: 0.16 } },
];
