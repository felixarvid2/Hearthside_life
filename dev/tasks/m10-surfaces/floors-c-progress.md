# floors-c progress (M10 surfaces)

48 designs of group floors-c: 21 carpets and textile floors (20 new + the pilot `carpet-rocket-kids`), 9 concrete and industrial, 18 exterior.
Families reach their targets with the older designs: carpet 24, concrete 12, exterior 24.

## Design table

| id | name | painter | key source / layout |
|---|---|---|---|
| carpet-rocket-kids | Rocket Play Carpet | map-floor | pile-shag |
| carpet-saxony | Saxony Cut Pile | map-floor | pile-saxony |
| carpet-frieze | Frieze Twist | map-floor | pile-frieze |
| carpet-velvet | Velvet Plush | map-floor | pile-velvet |
| carpet-boucle | Wool Bouclé | map-floor | wool-boucle |
| carpet-tweed | Herringbone Tweed | map-floor | wool-tweed |
| carpet-jute | Chunky Jute | map-floor | weave-jute |
| carpet-seagrass | Seagrass Matting | map-floor | weave-seagrass |
| carpet-coir | Coir Matting | map-floor | weave-coir |
| carpet-tiles-modular | Modular Carpet Tiles | paver-bond | pile-loop-fine / stack |
| carpet-tiles-plank | Carpet Plank Tiles | paver-bond | felt-needle / running |
| carpet-stripe | Broadloom Stripe | carpet-pattern |  / stripe |
| carpet-houndstooth | Houndstooth Wool | carpet-pattern |  / houndstooth |
| carpet-tartan | Tartan Plaid | carpet-pattern |  / tartan |
| carpet-trellis | Diamond Trellis | carpet-pattern |  / trellis |
| carpet-stars | Starry Nursery Carpet | map-floor | concrete-trowel |
| concrete-saw-cut | Saw-Cut Concrete Slabs | map-floor | concrete-smooth |
| concrete-broomed | Broomed Concrete | map-floor | concrete-broom |
| concrete-acid-stain | Acid-Stained Concrete | map-floor | concrete-stain |
| industrial-epoxy-flake | Epoxy Flake Floor | map-floor | epoxy-flake |
| industrial-grating | Steel Bar Grating | grating |  |
| industrial-rubber-studs | Studded Rubber Tiles | rubber-floor |  / studs |
| industrial-rubber-ribs | Ribbed Rubber Matting | rubber-floor |  / ribs |
| industrial-steel-plates | Riveted Steel Plates | paver-bond | steel-brushed / stack |
| ext-brick-herringbone | Herringbone Brick Paving | paver-bond | brick-clay / herringbone |
| ext-brick-basketweave | Basketweave Brick Paving | paver-bond | brick-clay / basket |
| ext-pinwheel-pavers | Pinwheel Block Paving | paver-bond | paver-concrete / pinwheel |
| ext-flagstone-ashlar | Random Ashlar Flagstones | paver-bond | stone-sandstone / ashlar |
| ext-crazy-paving | Crazy Paving | crazy-paving | stone-slate |
| ext-stepping-gravel | Slab Stepping Stones | stepping-stones | gravel, stone-sandstone / square |
| ext-stepping-lawn | Round Stepping Stones | stepping-stones | lawn, granite-sett / round |
| ext-deck-tiles | Interlocking Deck Tiles | paver-bond | wood-deck / basket |
| ext-deck-basketweave | Basketweave Decking | paver-bond | wood-deck / basket |
| ext-deck-composite | Composite Decking | map-boards | composite-grain |
| ext-sleeper-path | Railway Sleeper Path | paver-bond | wood-sleeper / running |
| ext-bark-path | Bark Chip Path | map-floor | bark-chips |
| ext-crushed-slate | Crushed Slate Chippings | map-floor | slate-chips |
| ext-river-pebbles | River Pebbles | map-floor | pebbles-river |
| ext-resin-bound | Resin Bound Gravel | map-floor | resin-gravel |
| ext-grass-pavers | Grass Block Paving | grass-pavers | paver-concrete |
| ext-fan-setts | Fan Pattern Setts | fan-setts | granite-sett |
| ext-raked-gravel | Raked Zen Gravel | raked-garden | gravel |

## fal.ai

33 FLUX.2 [dev] images (fal-ai/flux-2, 1024x1024), no image was fetched twice: 28 materials and 5 motifs (star, medallion, paisley, paw, kilim). Cost $0.4158 (ledger rows of this group). The first run hit HTTP 429 (shared rate limit, failed calls are not billed), so the rest were fetched in batches of three. Budget cap from the coordinator was 45 images: 33 used, 12 unused. Motifs: all five accepted at first try. `pile-shag`, `wool-boucle` and `epoxy-flake` were rebuilt from the same raw with a higher `build.std` (no new call).

## New painters (src/render/textures/packs/floors-c.ts)

- `paver-bond`: stack, running, ashlar, basket (n units per block), herringbone (axis-aligned 2x1, period 4 modules) and pinwheel bond over an optional material map; used for carpet tiles, paving, deck tiles, sleepers and steel plates.
- `carpet-pattern`: stripe, houndstooth (real 2/2 twill construction), tartan, trellis, with a pile map overlaid.
- `crazy-paving` (seamless jittered Voronoi, joints by shifted bisectors), `stepping-stones`, `fan-setts` (overlapping discs, draw order made seamless across the wrap), `grass-pavers`, `raked-garden`, `grating`, `rubber-floor` (studs, ribs, coins).

## Checks

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npx vitest run tests/unit/surfaces/m10-floors-c.test.ts` | 11 tests pass (counts, params, palettes, bond tiling, Voronoi partition, fake-canvas paint of every design and palette) |
| `npm run content:check` | 0 errors, 0 warnings |
| `npm test` | all my tests pass; remaining failures are other groups' files (duplicate ids `tile-fish-scale`, `tile-octagon-dot`, `tile-picket` between walls-e and floors-b, generated-id test while others add maps, a wall palette-tone test) and 5 s timeouts under machine load (load average 9-18). `mapPainters.test.ts` and `painters.test.ts` pass with `--testTimeout=120000` (29 s). |

## Contact sheets

`dev/tasks/m10-surfaces/sheets/floors-c-1.png` .. `floors-c-8.png`. Two rounds: round 1 showed too-dark rubber floors and grating, stepping stones overlapping, houndstooth overcheck lines reading as seams, kilim tile lines too strong, river pebbles too small, fan setts without a map draw; all fixed.

## Open issues

- Pile carpets (saxony, frieze, shag, bouclé) are subtle against each other at thumbnail size; they differ in pile structure at room scale.
- Rubber studs and ribs are fine detail: visible when zoomed in, calm at 2 m.
- Seamlessness of `paver-bond`, `fan-setts`, `crazy-paving` was verified by construction and unit tests (area and module coverage), and by eye on the sheets; no pixel-level edge comparison.
- No shared-file change needed.
