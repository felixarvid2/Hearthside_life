# walls-f: brick and stone (28), concrete, industrial and weathered (17)

Files: `src/content/surfaces3/walls-f.ts`, `src/render/textures/packs/walls-f.ts`, `dev/surfaces-ai/sources/walls-f.mjs`,
`tests/unit/surfaces/m10-walls-f.test.ts`, sheets `dev/tasks/m10-surfaces/sheets/walls-f-1..8.png`.

## Painters (pack file)
bond-brick (12 bonds, face map window per brick, raked joints, gloss, chips), stone-set (14 layouts, periodic Voronoi,
blobs, herringbone, hex, book-matched slabs, fish scales), plate-wall (tie holes, bolts, rivets, screws, lap, stagger),
seam-metal, tread-wall, breeze-block, peeled-plaster. Every unit samples a random window of the material map.

## Designs (id: painter/layout, map)
Brick (14): english-bond, flemish-bond, stack-bond, herringbone, basket-weave, soldier-courses, header-bond, diaper-diamonds,
tumbled-rustic, roman-raked, old-spalled, glazed-gloss, sailor-courses, third-lap (all bond-brick; maps brick-face-fired,
-handmade, -spalled, -glazed).
Stone (14, stone-set): coursed-rubble (sandstone), banded-blocks (limestone), ledger-strips (cleft slate), dry-stack (rockface),
herringbone-slips (travertine), flagstone-crazy (fieldstone), polygonal-fit (granite), river-cobble (fieldstone), knapped-flint,
basalt-columns, bookmatch-marble (marble-veined), splitface-panels (rockface), slate-diamonds, slate-scales (cleft slate).
Concrete family (17): concrete-cast-smooth, concrete-rain-stained, stucco-crumbling, paint-peeling, rust-iron-sheet,
copper-verdigris (map-wall); concrete-tie-panels, concrete-tall-panels, corten-bolted-panels, riveted-steel-plates,
brushed-steel-panels (plate-wall); concrete-cmu-block (bond-brick); concrete-breeze-circles, -diamond (breeze-block);
plaster-peeled-brick (peeled-plaster); zinc-standing-seam (seam-metal); diamond-plate-wall (tread-wall).
Every design has 10 palettes covering light, dark, neutral and accent; prices from $5 to $88 across all tiers.

## fal.ai
25 FLUX.2 [dev] images (1024x1024, $0.0126 each = $0.315), no regeneration of accepted images. Several first attempts
returned HTTP 429 (rate limit with the other agents) and were simply retried by the script; they were not billed. Sources:
brick-face-{fired,handmade,spalled,glazed}, stone-{limestone,sandstone,granite,flint,fieldstone,cleft-slate,basalt,
travertine-wall,rockface}, marble-veined, concrete-{cast-smooth,precast,stained,block-face}, rust-{iron,corten},
patina-copper, steel-brushed, zinc-galvanised, paint-peeling, stucco-crumbling. All built without rejection.

## Checks
- `npm run typecheck`: clean. `npm run content:check`: 0 errors, 0 warnings.
- `npx vitest run tests/unit/surfaces/m10-walls-f.test.ts`: 8 tests pass (counts, 8+ palettes with four tones, checkParams,
  distinct layouts, price tiers, deterministic painting without images, map-window paths with a stub image, seamless wrap).
- Other groups' tests in the shared suite failed during my runs for reasons in their files (duplicate ids tile-picket,
  tile-fish-scale, tile-octagon-dot; stripes-cabana tones; ext-fan-setts; floor stone-travertine) and timeouts under load.

## Open issues
- The face maps of flint and slate are tinted greyscale: pale-palette versions of flint lose the glassy look.
- Breeze-block voids are simple gradients; fish-scale slate shows a thin artefact row at the very bottom of the repeat.
- No shared-file changes needed. A `peeled-plaster` brick colour is the palette's fourth colour.
