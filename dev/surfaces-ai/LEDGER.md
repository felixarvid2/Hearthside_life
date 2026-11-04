# fal.ai spend ledger - surface textures

Budget: $2.00 maximum. Allowed models: fal-ai/flux/schnell (~$0.003/img), fal-ai/flux/dev (~$0.025/img).
Raw outputs are cached in `dev/surfaces-ai/raw/` (gitignored) and never fetched twice; `generate.mjs` appends a row per real call.
Cost per call is the listed per-image price (1 MP or less); the account is not queried.

| date | source | model | size | cost | result |
|---|---|---|---|---|---|
| 2026-11-01 | connectivity probe (not kept) | fal-ai/flux/schnell | 512x512 | $0.003 | connectivity check |
| 2026-11-01 | floor-wood-wide | fal-ai/flux/dev | 1024x1024 | $0.025 | superseded by grain-oak (the source had board joints baked in) |
| 2026-11-01 | floor-wood-reclaimed | fal-ai/flux/dev | 1024x1024 | $0.025 | superseded by grain-barn |
| 2026-11-01 | floor-wood-lvp | fal-ai/flux/dev | 1024x1024 | $0.025 | unused (swirly cathedral grain) |
| 2026-11-01 | floor-marble | fal-ai/flux/dev | 1024x1024 | $0.025 | superseded by stone-marble (tile grid baked in) |
| 2026-11-01 | floor-slate | fal-ai/flux/dev | 1024x1024 | $0.025 | shipped as stone-slate |
| 2026-11-01 | floor-travertine | fal-ai/flux/dev | 1024x1024 | $0.025 | unused (blotchy, tile blocks baked in) |
| 2026-11-01 | floor-berber | fal-ai/flux/dev | 1024x1024 | $0.025 | shipped as fibre-berber |
| 2026-11-01 | floor-sisal | fal-ai/flux/dev | 1024x1024 | $0.025 | superseded by fibre-sisal (flat) |
| 2026-11-01 | floor-aggregate | fal-ai/flux/dev | 1024x1024 | $0.025 | superseded by concrete-aggregate (vertical dashes) |
| 2026-11-01 | floor-gravel | fal-ai/flux/dev | 1024x1024 | $0.025 | shipped as gravel |
| 2026-11-01 | floor-grass | fal-ai/flux/dev | 1024x1024 | $0.025 | shipped as lawn |
| 2026-11-01 | wall-roughcast | fal-ai/flux/dev | 1024x1024 | $0.025 | shipped as plaster-rough |
| 2026-11-01 | wall-grasscloth | fal-ai/flux/dev | 1024x1024 | $0.025 | shipped as grasscloth |
| 2026-11-01 | wall-rubble | fal-ai/flux/dev | 1024x1024 | $0.025 | shipped as rubble-stone |
| 2026-11-01 | wall-slate | fal-ai/flux/dev | 1024x1024 | $0.025 | shipped as slate-ledge |
| 2026-11-01 | wall-boardformed | fal-ai/flux/dev | 1024x1024 | $0.025 | superseded by wall-concrete (panels with joints) |
| 2026-11-01 | wall-marble | fal-ai/flux/dev | 1024x1024 | $0.025 | unused (cracked look; the wall marble uses stone-marble) |
| 2026-11-01 | grain-oak | fal-ai/flux/dev | 1024x1024 | $0.025 | shipped |
| 2026-11-01 | grain-barn | fal-ai/flux/dev | 1024x1024 | $0.025 | shipped |
| 2026-11-01 | grain-fine | fal-ai/flux/dev | 1024x1024 | $0.025 | unused (flat gradient) |
| 2026-11-01 | stone-marble | fal-ai/flux/dev | 1024x1024 | $0.025 | shipped (floor slabs and wall marble) |
| 2026-11-01 | stone-travertine | fal-ai/flux/dev | 1024x1024 | $0.025 | unused (blotchy) |
| 2026-11-01 | fibre-sisal | fal-ai/flux/dev | 1024x1024 | $0.025 | shipped |
| 2026-11-01 | concrete-aggregate | fal-ai/flux/dev | 1024x1024 | $0.025 | shipped |
| 2026-11-01 | wall-concrete | fal-ai/flux/dev | 1024x1024 | $0.025 | shipped as concrete-board |

**Total: 26 calls, $0.628 of the $2.00 budget** (1 schnell probe at $0.003 and 25 flux/dev images at $0.025). No retries beyond the second round.

## Pipeline

1. `node dev/surfaces-ai/generate.mjs [id ...]` reads the key from `/home/user/apis/Fal.ai` at run time (never printed, never committed), calls `fal-ai/flux/dev` at 1024 x 1024, and caches `raw/<id>.jpg` plus `raw/<id>.json` (prompt and seed). A cached file is never fetched again.
2. `npm run assets:surfaces` (`tools/build-surface-maps.mjs`) turns raw sources into `public/assets/surfaces/<id>.webp`: greyscale, optional crop/rotation, 512 px, illumination flatten, seamless by variance-preserving offset-and-blend, wrap-around high-pass against slow drift, normalised to mean 0.5. About 0.9 MB for the 14 maps.
3. At run time the painters tint each map with the palette (0 -> dark, 0.5 -> base, 1 -> light).


## M10 surfaces: fal-ai/flux-2 (FLUX.2 [dev], $0.012 per megapixel)

Budget for the whole job: $15.00 on `fal-ai/flux-2`. `generate.mjs` sums these rows and refuses a call that would pass it.
Rows are appended by the script (keep this table the last thing in the file). Source catalogue: `sources/<group>.mjs`.

| date | source | model | size | cost | result |
|---|---|---|---|---|---|
| 2026-11-04 | paper-linen | fal-ai/flux-2 | 1024x1024 | $0.0126 | pilot material |
| 2026-11-04 | motif-peony | fal-ai/flux-2 | 1024x1024 | $0.0126 | pilot motif |
| 2026-11-04 | mural-misty-pines | fal-ai/flux-2 | 1536x768 | $0.0142 | pilot mural |
| 2026-11-04 | motif-rocket | fal-ai/flux-2 | 1024x1024 | $0.0126 | pilot motif |
| 2026-11-04 | motif-c-poppy | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-rose | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-daisy | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-tulip | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | paper-handmade | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-b material |
| 2026-11-04 | weave-flannel | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-b material |
| 2026-11-04 | weave-linen | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-b material |
| 2026-11-04 | weave-canvas | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-b material |
| 2026-11-04 | grain-teak-fine | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e material |
| 2026-11-04 | grain-pine-knotty | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e material |
| 2026-11-04 | motif-c-lily | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | grain-cherry | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e material |
| 2026-11-04 | grain-reclaimed | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e material |
| 2026-11-04 | motif-c-lavender | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | weave-shantung | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-b material |
| 2026-11-04 | motif-brush-arch | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-b motif |
| 2026-11-04 | motif-brush-ring | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-b motif |
| 2026-11-04 | motif-brush-squiggle | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-b motif |
| 2026-11-04 | motif-c-sunflower | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | grain-burl | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e material |
| 2026-11-04 | motif-c-anemone | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | glaze-reactive | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e material |
| 2026-11-04 | motif-c-wildsprig | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | glaze-speckle | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e material |
| 2026-11-04 | glaze-zellige | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e material |
| 2026-11-04 | motif-crescent | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-b motif |
| 2026-11-04 | motif-c-cornflower | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-pebble | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-b motif |
| 2026-11-04 | stone-terrazzo | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e material |
| 2026-11-04 | motif-c-dahlia | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | stone-onyx | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e material |
| 2026-11-04 | motif-c-magnolia | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-orchid | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-tile-tulip | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e motif |
| 2026-11-04 | motif-tile-rosette | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e motif |
| 2026-11-04 | motif-c-lotus | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | plaster-microcement | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | plaster-venetian | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | plaster-tadelakt | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | plaster-clay | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | motif-tile-lemon | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e motif |
| 2026-11-04 | motif-c-camellia | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-chrysanthemum | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-tile-sailboat | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e motif |
| 2026-11-04 | motif-c-foxglove | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-pansy | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | plaster-stucco | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | motif-memphis-squiggle | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | plaster-raked | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | motif-plume | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | plaster-travertine | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | plaster-sand | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | brick-face-handmade | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | motif-dino-stego | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | brick-face-fired | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | motif-c-wisteria | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-banana | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-olive | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-whale | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-bunny | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | wall-linen | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | wall-cork | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | motif-duck | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | wall-felt | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | concrete-cast-smooth | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | motif-planet | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | pile-shag | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | pile-saxony | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | pile-velvet | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | pile-frieze | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | motif-train | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-car | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-tree | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a motif |
| 2026-11-04 | motif-rainbow | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a motif |
| 2026-11-04 | grain-mahogany | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | grain-oak-knotty | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | motif-balloons | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | mural-clouds | fal-ai/flux-2 | 1536x768 | $0.0142 | walls-a mural |
| 2026-11-04 | grain-ash | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e material |
| 2026-11-04 | glaze-crackle | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e material |
| 2026-11-04 | motif-conch | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | grain-walnut | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-e material |
| 2026-11-04 | stone-travertine-wall | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | motif-starfish | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-c-iris | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-antlers | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-c-wreath | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-fern | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | grain-bamboo | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | motif-c-butterfly | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | wool-boucle | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | weave-jute | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | motif-c-dragonfly | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-owl | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-birch | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | brick-face-spalled | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | brick-face-glazed | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | stone-sandstone | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | stone-limestone | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | motif-c-pinetree | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-deco-crane | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-deco-lotus | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-boomerang | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | stone-granite | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | motif-atomic | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | stone-flint | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | stone-fieldstone | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | grain-maple | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | stone-cleft-slate | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | wool-tweed | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | motif-toile | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | grain-limed | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | motif-teapot | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | stone-basalt | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | motif-teacup | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-acanthus | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | concrete-stained | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | grain-wormy | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | mural-jungle | fal-ai/flux-2 | 1536x768 | $0.0142 | walls-a mural |
| 2026-11-04 | concrete-block-face | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | grain-charred | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | motif-chinoiserie | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-nouveau | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-memphis-triangle | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | steel-brushed | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | motif-deco-fountain | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | weave-seagrass | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | motif-c-hydrangea | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | print-cork | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | stucco-crumbling | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | motif-elephant | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | print-rubber | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | motif-dino-trex | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | print-screed | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | motif-c-bamboo | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-teddy | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-c-mushroom | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-dandelion | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-wheat | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-giraffe | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-owl | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-hotair | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-c-songbird | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | weave-coir | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | pile-loop-fine | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | felt-needle | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | motif-c-heron | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-paperboat | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-block | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-unicorn | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-paw | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-monster | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-castle | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | fb-marble-calacatta | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | fb-marble-nero | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | fb-marble-carrara | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | motif-cow | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | fb-marble-breccia | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | motif-star | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c motif |
| 2026-11-04 | motif-medallion | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c motif |
| 2026-11-04 | motif-anchor | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-sailboat | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-lighthouse | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | fb-onyx-banded | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | grain-acacia | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | grain-zebrano | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | motif-fish | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | marble-veined | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | fb-granite | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | stone-rockface | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | motif-coral | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | grain-olive | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | motif-wheat | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | grain-beech | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | fb-glaze-crackle | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | print-terrazzo | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | zinc-galvanised | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | paint-peeling | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | motif-moon | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a motif |
| 2026-11-04 | mural-dunes | fal-ai/flux-2 | 1536x768 | $0.0142 | walls-a mural |
| 2026-11-04 | motif-pineapple | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-pirateship | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-moon | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | mural-skyline | fal-ai/flux-2 | 1536x768 | $0.0142 | walls-a mural |
| 2026-11-04 | motif-cactus | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | mural-koi | fal-ai/flux-2 | 1536x768 | $0.0142 | walls-a mural |
| 2026-11-04 | mural-reeds | fal-ai/flux-2 | 1536x768 | $0.0142 | walls-a mural |
| 2026-11-04 | mural-savanna | fal-ai/flux-2 | 1536x768 | $0.0142 | walls-a mural |
| 2026-11-04 | motif-c-blossomtwig | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-ditsy | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-ranunculus | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-bouquet | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | mural-worldmap | fal-ai/flux-2 | 1536x768 | $0.0142 | walls-a mural |
| 2026-11-04 | mural-stars | fal-ai/flux-2 | 1536x768 | $0.0142 | walls-a mural |
| 2026-11-04 | fb-basalt | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | fb-travertine | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | mural-harbor | fal-ai/flux-2 | 1536x768 | $0.0142 | walls-a mural |
| 2026-11-04 | motif-c-eucalyptus | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-ginkgo | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | mural-meadow | fal-ai/flux-2 | 1536x768 | $0.0142 | walls-a mural |
| 2026-11-04 | motif-c-oakleaf | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-maple | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | grain-hickory | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | grain-pine | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | motif-cement-star | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b motif |
| 2026-11-04 | motif-cement-fleur | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b motif |
| 2026-11-04 | rust-iron | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | motif-c-fig | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | motif-c-ivy | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | patina-copper | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | concrete-precast | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | rust-corten | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-f material |
| 2026-11-04 | grain-cedar | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | motif-deco-shell | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-deco-peacock | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | grain-spalted | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | motif-paisley | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c motif |
| 2026-11-04 | motif-kilim | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c motif |
| 2026-11-04 | grain-driftwood | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | concrete-trowel | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | grain-roughsawn | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | motif-pine | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-leopard | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | grain-birch | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | grain-ebony | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | motif-sun | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-vase | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | print-travertine | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | print-woven | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | concrete-stain | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | concrete-broom | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | motif-brush-bar | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-b motif |
| 2026-11-04 | motif-sunburst | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-b motif |
| 2026-11-04 | concrete-smooth | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | leather-pebbled | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | fabric-velvet | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | metal-leaf | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | motif-rooster | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | motif-mushroom | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | brick-clay | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | fabric-moire | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | paver-concrete | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | epoxy-flake | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | motif-fox | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-d motif |
| 2026-11-04 | metal-brushed | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | metal-hammered | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | motif-c-thistle | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | fabric-boucle | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | silk-dupioni | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a material |
| 2026-11-04 | motif-pomegranate | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a motif |
| 2026-11-04 | motif-damask-medallion | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a motif |
| 2026-11-04 | motif-flourish | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a motif |
| 2026-11-04 | wood-sleeper | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | wood-deck | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | motif-crane | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a motif |
| 2026-11-04 | composite-grain | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | mural-alps | fal-ai/flux-2 | 1536x768 | $0.0142 | walls-a mural |
| 2026-11-04 | mural-birch | fal-ai/flux-2 | 1536x768 | $0.0142 | walls-a mural |
| 2026-11-04 | mural-waves | fal-ai/flux-2 | 1536x768 | $0.0142 | walls-a mural |
| 2026-11-04 | mural-bamboo | fal-ai/flux-2 | 1536x768 | $0.0142 | walls-a mural |
| 2026-11-04 | grain-teak | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | grain-oak-rift | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | grain-heartpine | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | grain-oak-brushed | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | bark-chips | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | pebbles-river | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | slate-chips | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | grain-oak-scraped | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | grain-elm | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | grain-rosewood | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | grain-fir | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-a material |
| 2026-11-04 | granite-sett | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | resin-gravel | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-c material |
| 2026-11-04 | motif-c-wildsprig | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
| 2026-11-04 | fb-sandstone | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | fb-limestone | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | fb-quartzite | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | fb-terrazzo-large | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | fb-terrazzo-fine | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | fb-glass-cloud | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | fb-glaze-pooled | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | fb-terracotta | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b material |
| 2026-11-04 | motif-cement-fan | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b motif |
| 2026-11-04 | motif-cement-meander | fal-ai/flux-2 | 1024x1024 | $0.0126 | floors-b motif |
| 2026-11-04 | motif-flourish | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-a motif |
| 2026-11-04 | motif-c-wildsprig | fal-ai/flux-2 | 1024x1024 | $0.0126 | walls-c motif |
