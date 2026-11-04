# walls-b report (stripes, checks and gingham 18; geometric and contemporary 26)

Files: `src/content/surfaces3/walls-b.ts`, `src/render/textures/packs/walls-b.ts` (painters `stripe-fine`, `check-fine`,
`geo-pro`), `dev/surfaces-ai/sources/walls-b.mjs`, `tests/unit/surfaces/m10-walls-b.test.ts`, sheets `sheets/walls-b-{1..8}.png`.

## Designs
| Family | Count | Ids |
|---|---|---|
| stripes | 18 | stripes-pencil, -cabana, -bayadere, -ombre, -shadow, -brushed, -horizon, -chalk, -candy-cane, -ikat; check-houndstooth, -glen, -windowpane, -tattersall, -harlequin, -checkerboard, -cross-stitch, -madras |
| geometric | 26 | procedural (geo-pro): honeycomb, facets, arches, argyle, ogee, basketweave, octagram, circle-lattice, op-waves, bullseye, terrazzo, memphis, colour-block, halftone, key-meander, bauhaus-tiles, graph-paper, swiss-cross, capsule-stack; motif-wall: rainbow-arches, brush-rings, squiggle-trail, sunburst-halfdrop, crescent-pebbles, pebble-field, brush-bars |

All 44 have 9 palettes (DUO / DUO2 / tone-on-tone ramp), packs, tags, mixed price tiers ($8-$18).

## FLUX.2 sources: 12 images, about $0.15 (plus the failed 429 attempts, which the ledger may also count)
Materials (fabric/paper grounds, reused by many designs): weave-linen, weave-flannel, paper-handmade, weave-canvas,
weave-shantung. Motifs: motif-brush-arch, -brush-ring, -brush-squiggle, -sunburst, -crescent, -pebble, -brush-bar.
No retries needed beyond HTTP 429s from parallel agents. All built without warnings.

## Checks
typecheck: nothing in walls-b files (errors seen only in floors-a / floors-c, other groups). `npx vitest run tests/unit/surfaces/m10-walls-b.test.ts`: 5 pass.
content:check: 0 errors; 2 warnings, both floors-c (unknown pack 'retro-studio'). Other surfaces tests failing only on other groups' designs
(paint-ombre-wash palette tones, plank-rosewood-dark, bark-chips, rubber-studded, wall-wood-lay unused painter) at the time of the run.

## Notes and open issues
- Faint vertical lines at repeat boundaries on paper-handmade grounds (octagram, halftone) in the sheets: the ground map may not be perfectly seamless.
- Ogee reads as chains of onion ovals; accepted. Cross-stitch crosses are small at thumbnail size.
- No shared-file changes needed.
