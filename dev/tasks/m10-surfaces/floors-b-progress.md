# floors-b progress (M10 surfaces): ceramic, porcelain, mosaic tiles 25; stone, marble, terrazzo 21

Painter: `tile-lay` in `src/render/textures/packs/floors-b.ts` (twelve layouts: grid with octagon/dot notch and 45 degree turn, running bond, herringbone (0 and 45), chevron, basketweave, hopscotch, hexagon/picket, tumbling blocks, triangles, fish scale, random ashlar, crazy paving; faces are glaze/speckle finishes or a tinted `fb-*` map cut at a random phase per tile). Cement tiles use `motif-floor` (layout tile), poured terrazzo `map-floor`.

## Design table

| id | name | family | painter | key params |
|---|---|---|---|---|
| tile-metro-brick | Metro Brick Bond | tile | tile-lay | layout: 'running', tileW: 0.2, tileH: 0.1, offset: 0.5, grout: 0.003, finish: 'gloss', map: 'fb-glaze-crackle', mapScale: 0.4, mapMix: 0.3, variation: 0.5, bevel: 0.5 |
| tile-slim-stack | Slim Ceramic Stack | tile | tile-lay | layout: 'grid', tileW: 0.1, tileH: 0.3, grout: 0.003, finish: 'gloss', variation: 0.45, bevel: 0.4, mode: 'random', altShare: 0.14, altMix: 0.4 |
| tile-herringbone-gloss | Glazed Herringbone Floor | tile | tile-lay | layout: 'herringbone', tileW: 0.2, tileH: 0.05, grout: 0.003, finish: 'gloss', variation: 0.55, bevel: 0.5 |
| tile-herringbone-diagonal | Diagonal Herringbone Porcelain | tile | tile-lay | layout: 'herringbone', angle: '45', tileW: 0.3, tileH: 0.1, grout: 0.003, finish: 'matt', variation: 0.5, bevel: 0.35 |
| tile-chevron-porcelain | Porcelain Chevron | tile | tile-lay | layout: 'chevron', tileW: 0.3, tileH: 0.08, grout: 0.003, finish: 'matt', variation: 0.5, bevel: 0.35 |
| tile-concrete-plank | Concrete-Look Plank Tile | tile | tile-lay | layout: 'running', offset: 0.333, tileW: 0.6, tileH: 0.2, grout: 0.003, finish: 'matt', map: 'concrete-aggregate', mapScale: 1.2, mapMix: 0.4, variation: 0.6, bevel: 0.25 |
| tile-triangles | Triangle Tile | tile | tile-lay | layout: 'triangles', tileW: 0.15, grout: 0.003, checker: true, finish: 'gloss', variation: 0.3, bevel: 0.5 |
| tile-hex-matt | Matt Hexagon Porcelain | tile | tile-lay | layout: 'hex', tileW: 0.2, tileH: 0.1155, grout: 0.004, finish: 'matt', variation: 0.5, bevel: 0.35, mode: 'random', altShare: 0.16, altMix: 0.5 |
| tile-picket-floor | Picket Floor Tile | tile | tile-lay | layout: 'hex', tileW: 0.08, tileH: 0.2, grout: 0.003, finish: 'handmade', wobble: 0.4, variation: 0.6, bevel: 0.5 |
| tile-octagon-dot-floor | Octagon and Dot Floor | tile | tile-lay | layout: 'grid', tileW: 0.2, tileH: 0.2, notch: 0.2929, grout: 0.003, finish: 'gloss', variation: 0.4, bevel: 0.5 |
| tile-fish-scale-floor | Fish Scale Floor Tile | tile | tile-lay | layout: 'fishscale', tileW: 0.1, grout: 0.003, finish: 'handmade', variation: 0.8, bevel: 0.6 |
| tile-diagonal-set | Diagonal Porcelain Set | tile | tile-lay | layout: 'grid', angle: '45', tileW: 0.3, tileH: 0.3, grout: 0.003, finish: 'matt', variation: 0.5, bevel: 0.35, mode: 'random', altShare: 0.2, altMix: 0.4 |
| cement-moorish-star | Moorish Star Cement Tile | tile | motif-floor | ...CEMENT_PARAMS, motif: 'motif-cement-star', spin: 'quarter' |
| cement-fleur | Fleur Cement Tile | tile | motif-floor | ...CEMENT_PARAMS, motif: 'motif-cement-fleur', spin: 'random', size: 0.98 |
| cement-deco-fan | Deco Fan Cement Tile | tile | motif-floor | ...CEMENT_PARAMS, motif: 'motif-cement-fan', spin: 'quarter', size: 1.04 |
| cement-meander | Meander Border Cement Tile | tile | motif-floor | ...CEMENT_PARAMS, motif: 'motif-cement-meander', spin: 'none', size: 1.0 |
| tile-tomette | Tomette Terracotta Hex | tile | tile-lay | layout: 'hex', tileW: 0.15, tileH: 0.0866, grout: 0.006, finish: 'terracotta', map: 'fb-terracotta', mapScale: 0.5, wobble: 0.6, variation: 0.8, bevel: 0.25 |
| tile-handmade-squares | Handmade Glaze Squares | tile | tile-lay | layout: 'grid', tileW: 0.15, tileH: 0.15, grout: 0.006, finish: 'handmade', map: 'fb-glaze-pooled', mapScale: 0.4, wobble: 1, variation: 0.8, bevel: 0.45, mode: 'random', altShare: 0.3, altMix: 0.5, mapMix: 0.6 |
| mosaic-glass-ombre | Glass Ombre Mosaic | tile | tile-lay | layout: 'running', offset: 0.5, tileW: 0.05, tileH: 0.025, grout: 0.002, finish: 'glass', map: 'fb-glass-cloud', mapScale: 0.3, mapMix: 0.45, mode: 'ombre', variation: 0.5, bevel: 0.6 |
| mosaic-confetti | Confetti Square Mosaic | tile | tile-lay | layout: 'grid', tileW: 0.025, tileH: 0.025, grout: 0.002, finish: 'glass', mode: 'confetti', variation: 0.6, bevel: 0.6 |
| mosaic-pebble | River Pebble Floor Mosaic | tile | tile-lay | layout: 'crazy', tileW: 0.04, tileH: 0.04, jitter: 0.8, grout: 0.004, round: 0.42, finish: 'stone', map: 'fb-granite', mapScale: 0.3, variation: 0.9, bevel: 0.5 |
| tile-tumbling-blocks | Tumbling Blocks Tile | tile | tile-lay | layout: 'cubes', tileW: 0.2, grout: 0.003, finish: 'gloss', variation: 0.15, bevel: 0.5 |
| tile-brick-basketweave | Brick Basketweave Tile | tile | tile-lay | layout: 'basketweave', tileW: 0.18, bars: 3, grout: 0.005, finish: 'terracotta', variation: 0.8, bevel: 0.3 |
| tile-hopscotch | Hopscotch Tile | tile | tile-lay | layout: 'hopscotch', tileW: 0.2, tileH: 0.1, checker: true, grout: 0.003, finish: 'matt', variation: 0.35, bevel: 0.35 |
| mosaic-pinstripe | Pinstripe Mosaic | tile | tile-lay | layout: 'running', offset: 0.5, tileW: 0.08, tileH: 0.04, checker: true, grout: 0.002, finish: 'glass', variation: 0.4, bevel: 0.6 |
| stone-calacatta-grand | Calacatta Grand Slabs | stone | tile-lay | layout: 'grid', tileW: 0.9, tileH: 0.9, grout: 0.003, finish: 'stone', map: 'fb-marble-calacatta', mapScale: 1.8, variation: 0.3, bevel: 0.25 |
| stone-carrara-chevron | Carrara Chevron | stone | tile-lay | layout: 'chevron', tileW: 0.4, tileH: 0.1, grout: 0.002, finish: 'stone', map: 'fb-marble-carrara', mapScale: 1.2, variation: 0.35, bevel: 0.25 |
| stone-marble-checker | Marble Harlequin Checker | stone | tile-lay | layout: 'grid', angle: '45', checker: true, tileW: 0.3, tileH: 0.3, grout: 0.002, finish: 'stone', map: 'fb-marble-carrara', mapScale: 0.9, variation: 0.3, bevel: 0.3 |
| stone-marble-hex | Honed Marble Hexagon | stone | tile-lay | layout: 'hex', tileW: 0.2, tileH: 0.1155, grout: 0.003, finish: 'stone', map: 'fb-marble-carrara', mapScale: 0.8, variation: 0.4, bevel: 0.3 |
| stone-travertine-french | Travertine French Pattern | stone | tile-lay | layout: 'ashlar', tileW: 0.4, tileH: 0.3, rowVar: 0.3, mix: 0.8, grout: 0.004, finish: 'stone', map: 'fb-travertine', mapScale: 1.0, variation: 0.5, bevel: 0.3 |
| stone-limestone-cabochon | Limestone Cabochon | stone | tile-lay | layout: 'grid', angle: '45', tileW: 0.3, tileH: 0.3, notch: 0.22, grout: 0.003, finish: 'stone', map: 'fb-limestone', mapScale: 0.9, variation: 0.4, bevel: 0.25 |
| stone-bluestone-ashlar | Bluestone Ashlar | stone | tile-lay | layout: 'ashlar', tileW: 0.5, tileH: 0.25, rowVar: 0.4, mix: 1, grout: 0.004, finish: 'stone', map: 'fb-basalt', mapScale: 1.0, variation: 0.5, bevel: 0.2 |
| stone-onyx-slabs | Banded Onyx Slabs | stone | tile-lay | layout: 'grid', tileW: 0.6, tileH: 0.6, grout: 0.002, finish: 'stone', map: 'fb-onyx-banded', mapScale: 1.2, variation: 0.3, bevel: 0.3 |
| stone-palladiana | Palladiana Marble | stone | tile-lay | layout: 'crazy', tileW: 0.3, tileH: 0.3, jitter: 0.85, grout: 0.008, finish: 'stone', map: 'fb-marble-breccia', mapScale: 0.7, variation: 0.75, bevel: 0.3 |
| stone-terrazzo-brass | Terrazzo Brass Grid | stone | tile-lay | layout: 'grid', tileW: 0.6, tileH: 0.6, grout: 0.005, finish: 'stone', map: 'fb-terrazzo-large', mapScale: 1.2, variation: 0.3, bevel: 0.1 |
| stone-terrazzo-poured | Poured Terrazzo, Fine | stone | map-floor | map: 'fb-terrazzo-fine', tiles: 3, cell: 0 |
| stone-terrazzo-hex | Terrazzo Hex Floor | stone | tile-lay | layout: 'hex', tileW: 0.2, tileH: 0.1155, grout: 0.003, finish: 'stone', map: 'fb-terrazzo-fine', mapScale: 0.5, variation: 0.4, bevel: 0.35 |
| stone-granite-diagonal | Granite Diagonal | stone | tile-lay | layout: 'grid', angle: '45', tileW: 0.3, tileH: 0.3, grout: 0.003, finish: 'stone', map: 'fb-granite', mapScale: 0.5, variation: 0.5, bevel: 0.25 |
| stone-marble-basketweave | Marble Basketweave Mosaic | stone | tile-lay | layout: 'basketweave', tileW: 0.18, bars: 3, checker: true, grout: 0.002, finish: 'stone', map: 'fb-marble-carrara', mapScale: 0.6, variation: 0.5, bevel: 0.35 |
| stone-basalt-thirds | Basalt Third Bond | stone | tile-lay | layout: 'running', offset: 0.333, tileW: 0.6, tileH: 0.2, grout: 0.003, finish: 'stone', map: 'fb-basalt', mapScale: 1.2, variation: 0.4, bevel: 0.2 |
| stone-quartzite-planks | Quartzite Planks | stone | tile-lay | layout: 'running', offset: 0.5, tileW: 0.9, tileH: 0.225, grout: 0.003, finish: 'stone', map: 'fb-quartzite', mapScale: 1.2, variation: 0.35, bevel: 0.25 |
| stone-limestone-pinwheel | Limestone Pinwheel | stone | tile-lay | layout: 'hopscotch', tileW: 0.3, tileH: 0.15, grout: 0.003, finish: 'stone', map: 'fb-limestone', mapScale: 0.9, variation: 0.4, bevel: 0.25 |
| stone-sandstone-herringbone | Sandstone Diagonal Herringbone | stone | tile-lay | layout: 'herringbone', angle: '45', tileW: 0.3, tileH: 0.1, grout: 0.004, finish: 'stone', map: 'fb-sandstone', mapScale: 0.7, variation: 0.5, bevel: 0.3 |
| stone-tumbling-blocks | Marble Tumbling Blocks | stone | tile-lay | layout: 'cubes', tileW: 0.2, grout: 0.002, finish: 'stone', map: 'fb-marble-carrara', mapScale: 0.8, variation: 0.2, bevel: 0.35 |
| stone-marble-herringbone | Veined Marble Herringbone | stone | tile-lay | layout: 'herringbone', tileW: 0.3, tileH: 0.1, grout: 0.002, finish: 'stone', map: 'fb-marble-nero', mapScale: 1.0, variation: 0.35, bevel: 0.3 |
| stone-travertine-strips | Travertine Strip Floor | stone | tile-lay | layout: 'running', offset: 0.5, tileW: 0.6, tileH: 0.1, grout: 0.003, finish: 'stone', map: 'fb-travertine', mapScale: 1.2, variation: 0.5, bevel: 0.25 |

## fal.ai

21 FLUX.2 [dev] images, each fetched once (no successful retries; HTTP 429 rate limits from the parallel agents were retried by re-running the script and cost nothing): 17 materials (fb-marble-calacatta/carrara/nero/breccia, fb-onyx-banded, fb-travertine, fb-limestone, fb-granite, fb-basalt, fb-sandstone, fb-quartzite, fb-terrazzo-large/fine, fb-glaze-pooled, fb-glaze-crackle, fb-terracotta, fb-glass-cloud) and 4 cement motifs. Cost $0.26 (21 x $0.0126), limit was 45 images.

## Checks

- `npm run typecheck` clean; `npx vitest run tests/unit/surfaces/m10-floors-b.test.ts` 25 tests pass (counts, ids, palettes, tones, params, painting with a fake canvas, exact single coverage of every lattice layout, crazy-paving torus).
- `npm run content:check`: 0 errors, 0 warnings.
- `npm test` (once, with eight other agents running): my file passes; failures were in other groups' designs (ext-*, stripes-cabana, unused walls-e map stone-travertine), 5 s timeouts of the all-designs painter tests under load, and unrelated sim/integration timeouts.

## Notes

- Three ids and three names collided with walls-e designs and were renamed here (`tile-picket-floor`, `tile-octagon-dot-floor`, `tile-fish-scale-floor`, `Glazed Herringbone Floor`, `River Pebble Floor Mosaic`, `Terrazzo Hex Floor`).
- Terrazzo maps are greyscale, so chips differ from the ground by tone only (tritone tint), not by hue.
- Contact sheets: `dev/tasks/m10-surfaces/sheets/floors-b-1..8.png`. Check in the browser: large-format slabs (calacatta, onyx) and the 2 cm mosaics at room scale, and that no repeat seam shows on chevron, herringbone 45 and picket (their lattices are stretched by up to 3 percent to close the repeat).
- No shared-file change needed.
