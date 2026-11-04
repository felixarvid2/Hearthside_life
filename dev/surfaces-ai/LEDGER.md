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
