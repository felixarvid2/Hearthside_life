// Generated-source catalogue for group 'walls-a' (see dev/surfaces-ai/generate.mjs).
// Entries: { id, kind: 'material' | 'motif' | 'mural', prompt, w?, h?, seed?, build? }
// Pilot sources (mural-misty-pines) are in pilot.mjs.
const ONE = 'one continuous surface, no joints, no seams, no tiles, no grid, no panels';
const tone = 'black and white tonal painting';
export default [
  // --- plaster, paint and subtle textures (materials) ---
  { id: 'plaster-venetian', kind: 'material', prompt: `polished Venetian plaster wall close up, soft cloudy layered trowel sweeps in overlapping directions, glossy marbled depth, ${ONE}` },
  { id: 'plaster-tadelakt', kind: 'material', prompt: `tadelakt lime plaster, smooth burnished surface with soft watery cloudy tonal variation and a few hairline crazing cracks, ${ONE}` },
  { id: 'plaster-microcement', kind: 'material', prompt: `microcement wall, smooth cement skin with faint trowel marks, subtle cloudy mottling and tiny pinholes, ${ONE}` },
  { id: 'plaster-clay', kind: 'material', prompt: `earthen clay plaster wall with fine straw fibres and sand grains, soft hand-smoothed matte surface, uneven, ${ONE}`, build: { std: 0.2 } },
  { id: 'plaster-stucco', kind: 'material', prompt: `Mediterranean lime stucco, lightly pitted weathered render with soft swirling trowel marks and hairline cracks, ${ONE}` },
  { id: 'plaster-sand', kind: 'material', prompt: `fine sand-float render, evenly grainy sandpaper-like texture of tiny uniform grains, no trowel marks, ${ONE}`, build: { std: 0.2 } },
  { id: 'plaster-raked', kind: 'material', prompt: `raked plaster surface with fine parallel horizontal grooves combed through the plaster, evenly spaced, subtle relief, ${ONE}` },
  { id: 'plaster-travertine', kind: 'material', prompt: `travertine-effect plaster, soft horizontal sedimentary bands with small pits and shallow fissures, warm stone look, ${ONE}` },
  { id: 'wall-cork', kind: 'material', prompt: `natural cork wall covering close up, dense granules of cork in varied sizes, speckled, ${ONE}`, build: { std: 0.24 } },
  { id: 'wall-linen', kind: 'material', prompt: `coarse woven linen fabric wallcovering, visible slubs in warp and weft, plain weave, even, ${ONE}` },
  { id: 'wall-felt', kind: 'material', prompt: `thick wool felt, dense matted fibres, soft fuzzy surface with tiny fibre flecks, very uniform, ${ONE}`, build: { std: 0.2 } },
  // --- luxury fabrics and metals (materials) ---
  { id: 'fabric-velvet', kind: 'material', prompt: `crushed velvet fabric close up, soft pile with irregular light-catching crush marks and gentle flowing sheen, ${ONE}` },
  { id: 'fabric-moire', kind: 'material', prompt: `silk moire taffeta, watermarked wavy interference pattern in the fabric, rippled sheen bands, ${ONE}` },
  { id: 'leather-pebbled', kind: 'material', prompt: `pebble-grain leather close up, fine pebbled texture with tiny creases, ${ONE}`, build: { std: 0.22 } },
  { id: 'metal-leaf', kind: 'material', prompt: `gold leaf gilded surface, crackled overlapping leaf sheets with irregular patches of light and dark and tarnish flecks, ${ONE}` },
  { id: 'metal-brushed', kind: 'material', prompt: `brushed metal sheet, fine parallel horizontal brushing lines, anisotropic sheen, ${ONE}` },
  { id: 'metal-hammered', kind: 'material', prompt: `hand-hammered metal surface, overlapping shallow dimples from a planishing hammer, evenly distributed, ${ONE}`, build: { std: 0.26 } },
  { id: 'fabric-boucle', kind: 'material', prompt: `boucle fabric close up, looping curly wool yarn, dense nubby texture, ${ONE}`, build: { std: 0.22 } },
  { id: 'silk-dupioni', kind: 'material', prompt: `raw silk dupioni fabric, irregular horizontal slubs and nubs in the weft, fine shimmering weave, ${ONE}` },
  // --- luxury motifs ---
  { id: 'motif-damask-medallion', kind: 'motif', prompt: 'an ornate baroque damask medallion, perfectly symmetrical about a vertical axis, scrolling acanthus leaves around a central lotus flower, tall oval silhouette, filled solid shapes with fine cut-out veins' },
  { id: 'motif-acanthus', kind: 'motif', prompt: 'a classical acanthus leaf scroll ornament, flowing curled leaves, symmetrical about a vertical axis, solid bold shapes' },
  { id: 'motif-pomegranate', kind: 'motif', prompt: 'a pomegranate fruit with a crown, leaves and a small split-open fruit, ornate Renaissance brocade style, symmetrical, solid shapes with white cut-out seeds' },
  { id: 'motif-flourish', kind: 'motif', prompt: 'a bold ornamental fleuron: a symmetric four-petal filigree flower with curling scroll arms and a solid diamond centre, thick solid black shapes filling most of the frame' },
  { id: 'motif-crane', kind: 'motif', prompt: 'a crane bird standing in an elegant pose beside a pine branch, Japanese silk screen style, bold silhouette with white cut-out feather lines' },
  // --- feature motifs ---
  { id: 'motif-moon', kind: 'motif', prompt: 'a large full moon disc with a few crater shapes cut out in white, simple and bold, perfectly round' },
  { id: 'motif-tree', kind: 'motif', prompt: 'a large bare oak tree with spreading branches and visible roots, bold silhouette, full height of the frame' },
  { id: 'motif-rainbow', kind: 'motif', prompt: 'a boho rainbow of five concentric arches with clean white gaps between the arches, flat graphic, symmetrical' },
  // --- murals ---
  { id: 'mural-dunes', kind: 'mural', prompt: `rolling desert sand dunes in sweeping curves with a low sun and rippled sand, calm and warm, ${tone}` },
  { id: 'mural-waves', kind: 'mural', prompt: `Japanese woodblock style great ocean waves with curling foam fingers and a small distant mountain, ${tone}` },
  { id: 'mural-alps', kind: 'mural', prompt: `snow-capped alpine mountain range with sharp peaks, glaciers and a dark pine foreground, ${tone}` },
  { id: 'mural-birch', kind: 'mural', prompt: `a birch forest, slender pale trunks with dark bark marks receding into soft light, ${tone}` },
  { id: 'mural-bamboo', kind: 'mural', prompt: `a bamboo grove, tall segmented stalks with feathery leaves in several depth layers and soft mist, ink painting style, ${tone}` },
  { id: 'mural-koi', kind: 'mural', prompt: `top view of a pond with koi fish swimming in curves among lily pads and a few ripples, ${tone}` },
  { id: 'mural-skyline', kind: 'mural', prompt: `a city skyline at dusk, layered skyscraper silhouettes of varied heights with tiny lit windows, a bridge in the distance, ${tone}` },
  { id: 'mural-reeds', kind: 'mural', prompt: `a calm lake with tall reeds and cattails in the foreground, flying geese and low hills behind, ${tone}` },
  { id: 'mural-jungle', kind: 'mural', prompt: `dense tropical jungle with huge monstera and banana leaves, ferns and hanging vines in layered depth, ${tone}` },
  { id: 'mural-savanna', kind: 'mural', prompt: `African savanna with flat-topped acacia trees, a distant herd of giraffes and a big low sun, ${tone}` },
  { id: 'mural-clouds', kind: 'mural', prompt: `a soft dreamy sky full of billowing cumulus clouds in layers, ${tone}` },
  { id: 'mural-stars', kind: 'mural', prompt: `a night sky full of stars with a swirling milky way band above a thin line of dark hills, ${tone}` },
  { id: 'mural-worldmap', kind: 'mural', prompt: `an antique world map in the style of an old engraving with continents, compass roses, sea monsters and sailing ships, ${tone}` },
  { id: 'mural-meadow', kind: 'mural', prompt: `a wildflower meadow with tall grasses, daisies and poppies swaying, distant tree line and open sky, ${tone}` },
  { id: 'mural-harbor', kind: 'mural', prompt: `a quiet fishing harbor with sailboats, masts, small houses along the quay and gulls, ${tone}` },
];
