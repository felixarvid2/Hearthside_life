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

