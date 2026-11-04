// Generated-source catalogue for group 'floors-a' (see dev/surfaces-ai/generate.mjs).
// Entries: { id, kind: 'material' | 'motif' | 'mural', prompt, w?, h?, seed?, build? }
// Wood species grains: one continuous surface of wood, grain horizontal; boards, joints and bevels are painted by
// the painters in src/render/textures/packs/floors-a.ts.
const wood = (what) => `close up of ${what}, one continuous surface of wood, grain lines running horizontally, no joints, no seams, no boards, no planks, no edges`;
export default [
  { id: 'grain-walnut', kind: 'material', prompt: wood('dark American walnut wood, rich chocolate brown, flowing wavy grain with fine pores and soft figure') },
  { id: 'grain-maple', kind: 'material', prompt: wood('pale hard maple wood, very fine tight straight grain with faint ray flecks, creamy and calm') },
  { id: 'grain-ash', kind: 'material', prompt: wood('ash wood, bold open cathedral grain with coarse visible pores, pale cream and light brown') },
  { id: 'grain-cherry', kind: 'material', prompt: wood('American cherry wood, smooth warm reddish brown, fine grain with small mineral streaks and gum flecks') },
  { id: 'grain-pine', kind: 'material', prompt: wood('knotty pine wood with many small round knots and visible growth rings') },
  { id: 'grain-teak', kind: 'material', prompt: wood('teak wood, straight golden brown grain with oily dark streaks and fine pores') },
  { id: 'grain-bamboo', kind: 'material', prompt: wood('strand woven bamboo, dense fibrous dark and light streaks, faint nodes') },
  { id: 'grain-hickory', kind: 'material', prompt: wood('hickory wood, dramatic high contrast dark and light streaks, bold grain') },
  { id: 'grain-heartpine', kind: 'material', prompt: wood('reclaimed antique heart pine, tight dense grain, old saw marks, tiny nail holes, rich patina') },
  { id: 'grain-limed', kind: 'material', prompt: wood('limed white oak, pale grey wood with white lime filling the open pores, low contrast, dry brushed look') },
  { id: 'grain-oak-rift', kind: 'material', prompt: wood('rift sawn white oak, perfectly straight tight parallel linear grain, no cathedral figure, tiny medullary ray flecks'), build: { rotate: 90 } },
  { id: 'grain-oak-brushed', kind: 'material', prompt: wood('wire brushed oak, deeply textured open grain with raised grain relief, rustic') },
  { id: 'grain-oak-scraped', kind: 'material', prompt: wood('hand scraped oak, undulating scraped hollows and tool marks across the wood surface with grain') },
  { id: 'grain-elm', kind: 'material', prompt: wood('wild elm wood, interlocking twisting irregular grain with dark swirls and cloudy figure') },
  { id: 'grain-acacia', kind: 'material', prompt: wood('acacia wood, variegated streaks of light and dark brown, wavy lively grain') },
  { id: 'grain-zebrano', kind: 'material', prompt: wood('zebrawood, bold high contrast parallel dark stripes on a pale background') },
  { id: 'grain-rosewood', kind: 'material', prompt: wood('dark rosewood, dramatic swirling black veins on deep brown') },
  { id: 'grain-mahogany', kind: 'material', prompt: wood('mahogany wood with ribbon stripe figure, shimmering alternating straight bands of light and dark') },
  { id: 'grain-fir', kind: 'material', prompt: wood('douglas fir, tight growth rings with pronounced dark latewood lines and flat sawn cathedral pattern') },
  { id: 'grain-cedar', kind: 'material', prompt: wood('red cedar wood, straight fine grain with occasional tiny knots and dark streaks') },
  { id: 'grain-wormy', kind: 'material', prompt: wood('wormy chestnut wood, rustic with many small worm holes and dark flecks, lively grain') },
  { id: 'grain-spalted', kind: 'material', prompt: wood('spalted maple wood, thin black zone lines wandering through pale wood, artistic') },
  { id: 'grain-driftwood', kind: 'material', prompt: wood('sun bleached silvery grey driftwood, smooth worn surface with fine raised grain, no cracks') },
  { id: 'grain-charred', kind: 'material', prompt: wood('charred shou sugi ban cedar, black alligator skin cracked charcoal surface with grain showing through') },
  { id: 'grain-oak-knotty', kind: 'material', prompt: wood('rustic character grade oak, large knots, small cracks and strong varied grain') },
  { id: 'grain-roughsawn', kind: 'material', prompt: wood('rough sawn timber with visible saw blade marks across the surface and coarse grain') },
  { id: 'grain-olive', kind: 'material', prompt: wood('olive wood, dramatic swirling dark brown figure on light honey wood') },
  { id: 'grain-birch', kind: 'material', prompt: wood('Scandinavian birch wood, pale yellow, subtle fine grain with tiny dark flecks') },
  { id: 'grain-ebony', kind: 'material', prompt: wood('ebonised oak, nearly black wood with faint lighter grain lines showing through') },
  { id: 'grain-beech', kind: 'material', prompt: wood('steamed beech wood, uniform pale pinkish brown with tiny short dark flecks and fine grain') },
  // laminate, vinyl, cork and rubber prints
  { id: 'print-cork', kind: 'material', prompt: 'close up of natural cork flooring, small granules of cork bark pressed together, speckled warm texture, one continuous surface, no joints' },
  { id: 'print-terrazzo', kind: 'material', prompt: 'close up of terrazzo, many small and medium irregular chips of marble in light and dark grey tones on a mid grey cement ground, evenly distributed, one continuous surface' },
  { id: 'print-travertine', kind: 'material', prompt: 'close up of travertine stone, horizontal fissures and small pits, soft warm beige, a single continuous surface, no tile joints, no grid' },
  { id: 'print-screed', kind: 'material', prompt: 'close up of smooth polished cement screed, soft cloudy mottling with faint trowel marks, subtle, one continuous surface, no joints, no cracks' },
  { id: 'print-woven', kind: 'material', prompt: 'close up of woven vinyl flooring, flat interlaced ribbons in a fine basket weave, regular, top view' },
  { id: 'print-rubber', kind: 'material', prompt: 'close up of rubber flooring with tiny evenly scattered speckled flecks of granulate on a plain ground, matte, one continuous surface' },
];
