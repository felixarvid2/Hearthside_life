// Generated-source catalogue for group 'walls-e' (see dev/surfaces-ai/generate.mjs): wood grains, glazes and stone
// surfaces for panelling and wall tiles, plus a few hand-painted tile motifs. Joints, grout and boards are drawn by
// the painters in src/render/textures/packs/walls-e.ts, so every material is one continuous surface.
const ONE = 'one continuous surface filling the whole frame, no joints, no seams, no boards, no tiles, no grid, no border';
export default [
  // --- wood grains (horizontal grain; the painter rotates them for vertical boards) ------------------------------
  { id: 'grain-walnut', kind: 'material', prompt: `close up of dark walnut wood grain, rich flowing grain lines running horizontally with gentle cathedral figure and soft darker streaks, ${ONE}` },
  { id: 'grain-pine-knotty', kind: 'material', prompt: `close up of knotty pine wood grain, straight horizontal grain lines with several round dark knots of different sizes scattered across, ${ONE}` },
  { id: 'grain-ash', kind: 'material', prompt: `close up of pale ash wood grain, open straight horizontal grain with long cathedral arches and fine pores, ${ONE}` },
  { id: 'grain-teak-fine', kind: 'material', prompt: `close up of fine straight wood veneer grain, very regular parallel thin lines running horizontally, subtle ribbon stripe, no figure, no knots, ${ONE}` },
  { id: 'grain-reclaimed', kind: 'material', prompt: `close up of weathered reclaimed wood, rough sun-bleached surface with deep horizontal grain, cracks, nail holes and worn patches, ${ONE}` },
  { id: 'grain-cherry', kind: 'material', prompt: `close up of cherry wood grain, smooth flowing fine grain lines running horizontally with gentle curly figure, ${ONE}` },
  { id: 'grain-burl', kind: 'material', prompt: `close up of burl wood veneer, swirling tight eyes and whorls of figured grain all over, ${ONE}` },
  // --- glazes and stone for the tiles -----------------------------------------------------------------------------
  { id: 'glaze-crackle', kind: 'material', prompt: `close up of a glossy ceramic glaze with a fine crackle craze of hairline cracks over the whole surface, slight tonal clouding, ${ONE}` },
  { id: 'glaze-zellige', kind: 'material', prompt: `close up of handmade zellige tile glaze, uneven pooled glossy glaze with soft cloudy patches, tiny pits and subtle ripples, ${ONE}` },
  { id: 'glaze-reactive', kind: 'material', prompt: `close up of a reactive ceramic glaze with soft streaks, drips and variegated tonal pooling, glossy studio pottery, ${ONE}` },
  { id: 'glaze-speckle', kind: 'material', prompt: `close up of speckled stoneware glaze, matte ceramic with small dark iron speckles scattered evenly, ${ONE}` },
  { id: 'stone-terrazzo', kind: 'material', prompt: `close up of terrazzo, many small irregular marble chips of different sizes set in pale cement, evenly distributed, ${ONE}` },
  { id: 'stone-travertine', kind: 'material', prompt: `close up of travertine stone, soft horizontal banding with fissures and small pits, ${ONE}` },
  { id: 'stone-travertine-wall', kind: 'material', prompt: `close up of warm beige travertine stone, soft cloudy banding with small pits and short fissures, a single seamless slab of stone with no lines running across it, ${ONE}` },
  { id: 'stone-onyx', kind: 'material', prompt: `close up of polished onyx stone, translucent swirling bands and veins in flowing curves, ${ONE}` },
  // --- hand-painted tile motifs (one subject, symmetrical where the tile calls for it) ----------------------------
  { id: 'motif-tile-tulip', kind: 'motif', prompt: 'a single Delft blue-and-white style tulip with two leaves, hand-painted ceramic tile illustration, bold silhouette with fine cut-out line details' },
  { id: 'motif-tile-rosette', kind: 'motif', prompt: 'a symmetrical eight-petal rosette medallion, Portuguese azulejo style, bold ornament with cut-out detail, perfectly radial' },
  { id: 'motif-tile-lemon', kind: 'motif', prompt: 'a single lemon with two leaves, hand-painted majolica tile illustration, bold silhouette with a few cut-out highlights' },
  { id: 'motif-tile-sailboat', kind: 'motif', prompt: 'a small sailing ship with billowing sails, Delft tile style, bold silhouette with simple cut-out details' },
];
