# walls-e (M10 surfaces): wood panels and wall tiles

Group walls-e: 19 wood-panel + 32 tile wall designs (51 new). Painters in `src/render/textures/packs/walls-e.ts`, designs in `src/content/surfaces3/walls-e.ts`, sources in `dev/surfaces-ai/sources/walls-e.mjs`, tests `tests/unit/surfaces/m10-walls-e.test.ts`, contact sheets `dev/tasks/m10-surfaces/sheets/walls-e-1..9.png`.

## Painters (all new, all in the pack file)
- `wall-wood-lay` [base, light, dark, trim, upper]: planks, tg-v, tg-h, herringbone, chevron, basket, fluted, bookmatch, bamboo; boards cut from a tinted grain map (rotated per board), `paint` lays flat colour over the grain.
- `wall-panel-frame` [upper, panel, groove, rail]: bead (+ peg rail), frame, raised, flat, georgian, tudor, lattice, cane.
- `wall-tile-lay` [tile, alt, grout, ink, upper]: grid (bonds, vertical), herringbone, chevron, basket, diamond, hex, picket, scales, pebble, triangle, cubes, mixed, octagon, arch; per-tile glaze/stone map tinted per colour, finishes, motifs, ombre, listello band, tiled dado.

## Designs
| id | family | painter | key params |
|---|---|---|---|
| panel-beadboard-tall | wood-panel | wall-panel-frame | style: 'bead', height: 2.8, unit: 0.09, skirt: 0.12 |
| panel-peg-rail | wood-panel | wall-panel-frame | style: 'bead', height: 1.5, unit: 0.1, pegs: true, skirt: 0.12 |
| panel-pine-vgroove | wood-panel | wall-wood-lay | style: 'tg-v', map: 'grain-pine-knotty', grain: 1.3, unit: 0.12, height: 2.8, gap: 0.0035, variation: 0.5, skirt: 0.1 |
| panel-sauna-ash | wood-panel | wall-wood-lay | style: 'tg-h', map: 'grain-ash', grain: 0.9, unit: 0.1, height: 2.8, gap: 0.0025, variation: 0.4, skirt: 0.08 |
| panel-vgroove-painted | wood-panel | wall-wood-lay | style: 'tg-v', map: 'grain-ash', paint: 0.65, grain: 1.2, unit: 0.12, height: 2.8, gap: 0.005, variation: 0.25, skirt: 0.12 |
| panel-reclaimed-barn | wood-panel | wall-wood-lay | style: 'planks', map: 'grain-reclaimed', grain: 1.0, unit: 0.16, varWidth: 0.5, minLen: 0.8, maxLen: 2.2, height: 2.8, gap: 0.004, variation: 0.8, skirt: 0 |
| panel-herringbone-walnut | wood-panel | wall-wood-lay | style: 'herringbone', map: 'grain-walnut', grain: 0.7, unit: 0.07, length: 4, height: 2.8, gap: 0.0025, variation: 0.6, skirt: 0.1 |
| panel-chevron-ash | wood-panel | wall-wood-lay | style: 'chevron', map: 'grain-ash', grain: 0.8, unit: 0.22, height: 2.8, gap: 0.003, variation: 0.55, skirt: 0.1 |
| panel-basketweave-cherry | wood-panel | wall-wood-lay | style: 'basket', map: 'grain-cherry', grain: 0.7, unit: 0.045, length: 3, height: 2.8, gap: 0.0025, variation: 0.55, skirt: 0.1 |
| panel-fluted-teak | wood-panel | wall-wood-lay | style: 'fluted', map: 'grain-teak-fine', grain: 0.9, unit: 0.06, height: 2.8, gap: 0.0015, variation: 0.35, skirt: 0.1 |
| panel-bookmatch-burl | wood-panel | wall-wood-lay | style: 'bookmatch', map: 'grain-burl', grain: 1.2, unit: 0.6, cell: 1.4, height: 2.8, gap: 0.003, variation: 0.5, skirt: 0.1 |
| panel-picture-frame | wood-panel | wall-panel-frame | style: 'frame', height: 1.25, unit: 0.5, cell: 0.8, mould: 0.025, gap: 0.08, skirt: 0.12 |
| panel-flat-reveal | wood-panel | wall-panel-frame | style: 'flat', height: 2.8, unit: 0.6, cell: 1.2, gap: 0.012, skirt: 0.1 |
| panel-georgian-tiers | wood-panel | wall-panel-frame | style: 'georgian', height: 0.95, unit: 0.5, mould: 0.03, gap: 0.07, skirt: 0.14 |
| panel-tudor-timber | wood-panel | wall-panel-frame | style: 'tudor', unit: 0.6, mould: 0.08, skirt: 0.12 |
| panel-lattice-trellis | wood-panel | wall-panel-frame | style: 'lattice', unit: 0.3, cell: 0.55, mould: 0.022, skirt: 0.1 |
| panel-batten-grid | wood-panel | wall-panel-frame | style: 'frame', height: 2.8, unit: 0.35, cell: 0.35, mould: 0.03, gap: 0, skirt: 0.12 |
| panel-cane-webbing | wood-panel | wall-panel-frame | style: 'cane', unit: 0.6, cell: 0.9, mould: 0.04, gap: 0.04, skirt: 0.1 |
| panel-bamboo-poles | wood-panel | wall-wood-lay | style: 'bamboo', unit: 0.055, height: 2.8, gap: 0.003, variation: 0.6, skirt: 0 |
| tile-subway-crackle | tile | wall-tile-lay | layout: 'grid', size: 0.15, aspect: 2, offset: 0.5, map: 'glaze-crackle', glaze: 0.4, grain: 0.45, grout: 0.003, variation: 0.25, finish: 'bevel' |
| tile-metro-handmade | tile | wall-tile-lay | layout: 'grid', size: 0.2, aspect: 2.8, offset: 0.5, map: 'glaze-zellige', glaze: 0.55, grain: 0.5, grout: 0.005, variation: 0.5, wobble: 0.7, finish: 'gloss' |
| tile-vertical-slim | tile | wall-tile-lay | layout: 'grid', size: 0.2, aspect: 0.3, offset: 0.5, vertical: true, map: 'glaze-reactive', glaze: 0.5, grain: 0.5, grout: 0.003, variation: 0.35, finish: 'gloss' |
| tile-stone-thirds | tile | wall-tile-lay | layout: 'grid', size: 0.3, aspect: 3, offset: 0.333, map: 'stone-travertine-wall', glaze: 0.8, grain: 0.6, grout: 0.003, variation: 0.4, finish: 'flat' |
| tile-herringbone-glazed | tile | wall-tile-lay | layout: 'herringbone', size: 0.05, slats: 4, map: 'glaze-zellige', glaze: 0.55, grain: 0.5, grout: 0.002, variation: 0.4, finish: 'gloss' |
| tile-herringbone-marble | tile | wall-tile-lay | layout: 'herringbone', size: 0.06, slats: 4, map: 'stone-marble', glaze: 0.75, grain: 0.7, grout: 0.002, variation: 0.25, finish: 'bevel' |
| tile-chevron-glaze | tile | wall-tile-lay | layout: 'chevron', size: 0.06, aspect: 3, map: 'glaze-reactive', glaze: 0.5, grain: 0.5, grout: 0.002, variation: 0.4, finish: 'gloss' |
| tile-basketweave-stone | tile | wall-tile-lay | layout: 'basket', size: 0.05, slats: 3, map: 'stone-travertine-wall', glaze: 0.8, grain: 0.5, grout: 0.002, variation: 0.45, finish: 'flat' |
| tile-point-diamond | tile | wall-tile-lay | layout: 'diamond', size: 0.16, aspect: 1, map: 'glaze-crackle', glaze: 0.4, grain: 0.45, grout: 0.003, variation: 0.3, finish: 'bevel' |
| tile-lozenge-stripes | tile | wall-tile-lay | layout: 'diamond', size: 0.15, aspect: 1.7, alt: 'rows', map: 'glaze-speckle', glaze: 0.55, grain: 0.5, grout: 0.003, variation: 0.25, finish: 'pillow' |
| tile-honeycomb | tile | wall-tile-lay | layout: 'hex', size: 0.1, map: 'glaze-speckle', glaze: 0.55, grain: 0.5, grout: 0.003, variation: 0.3, finish: 'flat' |
| tile-hex-terrazzo | tile | wall-tile-lay | layout: 'hex', size: 0.2, map: 'stone-terrazzo', glaze: 0.85, grain: 0.6, grout: 0.005, variation: 0.2, finish: 'bevel' |
| tile-picket | tile | wall-tile-lay | layout: 'picket', size: 0.1, aspect: 1.6, map: 'glaze-reactive', glaze: 0.5, grain: 0.5, grout: 0.003, variation: 0.35, finish: 'gloss' |
| tile-fish-scale | tile | wall-tile-lay | layout: 'scales', size: 0.1, map: 'glaze-reactive', glaze: 0.3, grain: 0.5, grout: 0.003, variation: 0.4, finish: 'gloss' |
| tile-scallop-fan | tile | wall-tile-lay | layout: 'scales', size: 0.12, flip: true, map: 'glaze-speckle', glaze: 0.45, grain: 0.5, grout: 0.003, variation: 0.3, finish: 'bevel' |
| tile-river-pebble | tile | wall-tile-lay | layout: 'pebble', size: 0.05, map: 'stone-travertine-wall', glaze: 0.8, grain: 0.3, grout: 0.004, variation: 0.35, finish: 'pillow' |
| tile-triangle-mosaic | tile | wall-tile-lay | layout: 'triangle', size: 0.12, map: 'glaze-zellige', glaze: 0.55, grain: 0.4, grout: 0.003, variation: 0.25, finish: 'bevel' |
| tile-cube-illusion | tile | wall-tile-lay | layout: 'cubes', size: 0.12, map: 'glaze-crackle', glaze: 0.4, grain: 0.4, grout: 0.003, variation: 0.15, finish: 'flat' |
| tile-modular-stone | tile | wall-tile-lay | layout: 'mixed', size: 0.075, map: 'stone-travertine-wall', glaze: 0.8, grain: 0.8, grout: 0.003, variation: 0.5, finish: 'flat' |
| tile-ribbed-bars | tile | wall-tile-lay | layout: 'grid', size: 0.3, aspect: 0.33, offset: 0, vertical: true, map: 'glaze-zellige', glaze: 0.55, grain: 0.5, grout: 0.002, variation: 0.3, finish: 'ribbed' |
| tile-octagon-dot | tile | wall-tile-lay | layout: 'octagon', size: 0.15, map: 'glaze-speckle', glaze: 0.55, grain: 0.5, grout: 0.003, variation: 0.25, finish: 'bevel' |
| tile-mosaic-square | tile | wall-tile-lay | layout: 'grid', size: 0.04, aspect: 1, offset: 0, map: 'glaze-reactive', glaze: 0.5, grain: 0.3, grout: 0.0015, variation: 0.45, finish: 'gloss' |
| tile-mosaic-ombre | tile | wall-tile-lay | layout: 'grid', size: 0.04, aspect: 1, offset: 0, map: 'glaze-reactive', glaze: 0.5, grain: 0.3, grout: 0.0015, variation: 0.1, finish: 'gloss', ombre: 0.9 |
| tile-delft-tulip | tile | wall-tile-lay | layout: 'grid', size: 0.15, aspect: 1, offset: 0, map: 'glaze-crackle', glaze: 0.4, grain: 0.3, grout: 0.003, variation: 0.2, finish: 'bevel', motif: 'motif-tile-tulip', motifRule: 'all', motifSize: 0.82 |
| tile-delft-ships | tile | wall-tile-lay | layout: 'grid', size: 0.15, aspect: 1, offset: 0, map: 'glaze-crackle', glaze: 0.4, grain: 0.3, grout: 0.003, variation: 0.2, finish: 'bevel', motif: 'motif-tile-sailboat', motifRule: 'scatter', altRate: 0.25, motifSize: 0.85 |
| tile-azulejo-rosette | tile | wall-tile-lay | layout: 'grid', size: 0.2, aspect: 1, offset: 0, map: 'glaze-zellige', glaze: 0.45, grain: 0.4, grout: 0.003, variation: 0.2, finish: 'gloss', motif: 'motif-tile-rosette', motifRule: 'all', motifSize: 0.92 |
| tile-lemon-majolica | tile | wall-tile-lay | layout: 'grid', size: 0.15, aspect: 1, offset: 0, map: 'glaze-reactive', glaze: 0.5, grain: 0.4, grout: 0.003, variation: 0.25, finish: 'gloss', motif: 'motif-tile-lemon', motifRule: 'checker', motifSize: 0.82 |
| tile-dado-listello | tile | wall-tile-lay | layout: 'grid', size: 0.15, aspect: 2, offset: 0.5, map: 'glaze-crackle', glaze: 0.4, grain: 0.45, grout: 0.003, variation: 0.25, finish: 'bevel', height: 1.2, band: 0.72, bandH: 0.06 |
| tile-slab-terrazzo | tile | wall-tile-lay | layout: 'grid', size: 0.6, aspect: 2, offset: 0.5, map: 'stone-terrazzo', glaze: 0.85, grain: 1.0, grout: 0.004, variation: 0.25, finish: 'flat' |
| tile-slab-onyx | tile | wall-tile-lay | layout: 'grid', size: 0.6, aspect: 1, offset: 0, map: 'stone-onyx', glaze: 0.85, grain: 0.6, grout: 0.002, variation: 0.15, finish: 'gloss' |
| tile-pillow-square | tile | wall-tile-lay | layout: 'grid', size: 0.1, aspect: 1, offset: 0, map: 'glaze-reactive', glaze: 0.5, grain: 0.4, grout: 0.003, variation: 0.35, finish: 'pillow' |
| tile-arch | tile | wall-tile-lay | layout: 'arch', size: 0.12, aspect: 1.5, map: 'glaze-zellige', glaze: 0.55, grain: 0.5, grout: 0.003, variation: 0.3, finish: 'gloss', bg: 'alt' |

## Generated sources (fal-ai/flux-2)
Materials: grain-walnut, grain-pine-knotty, grain-ash, grain-teak-fine, grain-reclaimed, grain-cherry, grain-burl, glaze-crackle (rebuilt with stronger flatten, the first source showed a bevelled frame), glaze-zellige, glaze-reactive, glaze-speckle, stone-terrazzo, stone-travertine-wall, stone-onyx. Motifs: motif-tile-tulip, -rosette, -lemon, -sailboat. 18 images, about $0.23 (HTTP 429 retries were not billed). `stone-travertine` (an older cached raw with baked joints) was rejected and removed again.

## Checks
- `npm run typecheck`: clean. `npm run content:check`: 0 errors, 0 warnings. `npx vitest run tests/unit/surfaces/m10-walls-e.test.ts`: 6 tests pass.
- `npm test` fails only in other groups' files/timeouts under load (walls-f `ext-fan-setts`, floors/other stripes-cabana tone, plank-rosewood-dark; painters.test and mapPainters.test time out at 5 s while nine agents run).

## Notes / open issues
- Glaze maps are blended at `glaze` strength over the flat tile colour; the crackle source still has a faint bevelled frame (hidden by random per-tile phase and low strength).
- Chevron ash has weak board edges in pale palettes; chevron/herringbone grains follow the plank direction.
- No shared-file change needed.
