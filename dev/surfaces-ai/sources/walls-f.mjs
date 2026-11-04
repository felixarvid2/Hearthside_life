// Generated-source catalogue for group 'walls-f' (see dev/surfaces-ai/generate.mjs).
// Entries: { id, kind, prompt, w?, h?, seed?, build? }
// Brick, stone, concrete and metal faces only: one continuous surface each, never joints (the painters draw bonds,
// joints, panels and rivets and give every brick, stone or panel a random window into the map).
const NOJ = 'one single continuous surface, no joints, no seams, no mortar, no gaps, no edges, no grid, no individual units';
export default [
  // --- brick faces ---
  { id: 'brick-face-fired', kind: 'material', prompt: `close up of the face of a fired clay brick, fine sand-moulded surface with soft mottled colour flashing and tiny pits, ${NOJ}` },
  { id: 'brick-face-handmade', kind: 'material', prompt: `close up of a rough handmade brick face, folded creased clay surface with drag marks, dimples and sand-faced grain, ${NOJ}` },
  { id: 'brick-face-spalled', kind: 'material', prompt: `close up of old weathered brick surface, eroded and pitted, flaking spalled patches and pale salt bloom, ${NOJ}` },
  { id: 'brick-face-glazed', kind: 'material', prompt: `close up of glossy glazed ceramic brick surface with fine crazing hairline cracks and slight uneven glaze pooling, ${NOJ}`, build: { std: 0.11 } },
  // --- stone ---
  { id: 'stone-limestone', kind: 'material', prompt: `close up of fine grained limestone, soft pale stone with faint fossil flecks and tiny pores, ${NOJ}`, build: { std: 0.13 } },
  { id: 'stone-sandstone', kind: 'material', prompt: `close up of sandstone with faint horizontal bedding bands, fine grain and small pits, ${NOJ}`, build: { std: 0.15 } },
  { id: 'stone-granite', kind: 'material', prompt: `close up of matte granite, evenly speckled salt and pepper crystals, ${NOJ}`, build: { std: 0.15 } },
  { id: 'stone-flint', kind: 'material', prompt: `close up of knapped dark flint stone, glassy conchoidal fracture facets with chalky white patches, ${NOJ}`, build: { std: 0.22 } },
  { id: 'stone-fieldstone', kind: 'material', prompt: `close up of weathered natural fieldstone rock face, mottled with lichen patches, soft bumps and hairline cracks, ${NOJ}`, build: { std: 0.18 } },
  { id: 'stone-cleft-slate', kind: 'material', prompt: `close up of cleft riven slate, layered flaking ridges and fine natural fractures, ${NOJ}`, build: { std: 0.17 } },
  { id: 'stone-basalt', kind: 'material', prompt: `close up of dark basalt rock, dense even grain with tiny vesicle pores, ${NOJ}`, build: { std: 0.13 } },
  { id: 'stone-travertine-wall', kind: 'material', prompt: `close up of travertine stone, horizontal fissures and small pits, ${NOJ}`, build: { std: 0.17 } },
  { id: 'marble-veined', kind: 'material', prompt: `close up of polished white marble with bold dramatic dark veins running diagonally, ${NOJ}`, build: { std: 0.22 } },
  { id: 'stone-rockface', kind: 'material', prompt: `close up of rough split-face rock, jagged chiselled ridges and depressions, rugged and deeply textured, ${NOJ}`, build: { std: 0.22 } },
  // --- concrete ---
  { id: 'concrete-cast-smooth', kind: 'material', prompt: `close up of smooth cast concrete with very subtle clouding and a few tiny bug holes, ${NOJ}`, build: { std: 0.1 } },
  { id: 'concrete-precast', kind: 'material', prompt: `close up of precast concrete surface with scattered small air pores and faint trowel marks, ${NOJ}`, build: { std: 0.14 } },
  { id: 'concrete-stained', kind: 'material', prompt: `close up of weathered concrete wall with vertical rain streaks, water stains and dark mould patches, ${NOJ}`, build: { std: 0.2, flatten: 0.6 } },
  { id: 'concrete-block-face', kind: 'material', prompt: `close up of the rough gritty porous face of a concrete masonry cinder block, ${NOJ}`, build: { std: 0.17 } },
  // --- metal and weathering ---
  { id: 'rust-iron', kind: 'material', prompt: `close up of heavily rusted iron sheet, mottled orange brown corrosion, flaking and pitted, ${NOJ}`, build: { std: 0.22 } },
  { id: 'rust-corten', kind: 'material', prompt: `close up of weathering steel with a fine even rust patina and subtle mottling, ${NOJ}`, build: { std: 0.14 } },
  { id: 'patina-copper', kind: 'material', prompt: `close up of oxidised copper with verdigris patina patches, mottled, ${NOJ}`, build: { std: 0.22 } },
  { id: 'steel-brushed', kind: 'material', prompt: `close up of brushed stainless steel with fine horizontal linear grain, ${NOJ}`, build: { std: 0.09 } },
  { id: 'zinc-galvanised', kind: 'material', prompt: `close up of hot dip galvanised steel with crystalline spangle pattern, ${NOJ}`, build: { std: 0.14 } },
  { id: 'paint-peeling', kind: 'material', prompt: `close up of old flaking peeling paint on a wall, cracked paint layers with patches of bare surface showing underneath, high contrast, ${NOJ}`, build: { std: 0.28, flatten: 0.5 } },
  { id: 'stucco-crumbling', kind: 'material', prompt: `close up of crumbling old plaster, patches fallen away exposing the rough surface below, cracks and weathering, ${NOJ}`, build: { std: 0.22, flatten: 0.6 } },
];
