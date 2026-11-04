# walls-a progress (M10 surfaces, phase 2)

State: done. 60 designs in `src/content/surfaces3/walls-a.ts` (24 paint, 17 luxury, 19 mural incl. the pilot `mural-misty-pines`).

## Designs (id: layout / material, sources)
Paint, plaster and subtle textures (family `paint`, 24)
- paint-ombre-wash (wash-gradient), paint-half-block / paint-tape-band / paint-arches / paint-sun-disc / paint-peaks (block-paint styles half, band, arch, disc, peaks)
- paint-strie / paint-sponged / paint-rag-rolled / paint-stippled (glaze-set styles), paint-swirl-render (swirl-render), paint-sheen-stripe (sheen-stripe)
- plaster-venetian, plaster-tadelakt, plaster-microcement, plaster-clay, plaster-stucco, plaster-sand, plaster-raked, plaster-travertine (map-wall, one AI material map each)
- plaster-scored-ashlar (scored-render over plaster-sand), paint-cork (wall-cork), paint-linen-weave (wall-linen, roll seams), paint-wool-felt (wall-felt, roll seams)

Luxury fabrics, metallic, damask (family `luxury`, 17)
- lux-damask-medallion (motif-damask-medallion + motif-flourish, half-drop), lux-acanthus-scroll (motif-acanthus, brick, mirrored), lux-pomegranate-brocade (motif-pomegranate + flourish, half-drop), lux-flourish-diamonds (flourish + acanthus, diagonal), lux-crane-silk (motif-crane on linen ground, half-drop)
- lux-velvet-crush, lux-silk-moire, lux-leather-pebbled, lux-gilt-leaf, lux-brushed-metal, lux-hammered-metal, lux-boucle, lux-dupioni (map-wall, one material each)
- lux-channel-velvet, lux-padded-leather (quilted-set channel / panel), lux-antique-mirror (mirror-panels), lux-gilt-lattice (gilt-lattice)

Murals and feature walls (family `mural`, 19)
- mural-misty-pines (pilot), mural-dunes, -waves, -alps, -birch, -bamboo, -koi, -skyline, -reeds, -jungle, -savanna, -clouds, -stars, -worldmap, -meadow, -harbor (mural-wall, 5.6 m, eight tritone moods each)
- mural-feature-moon, mural-feature-oak (one huge motif), mural-feature-rainbows (motif-wall, brick)

New painters (src/render/textures/packs/walls-a.ts): wash-gradient, block-paint, glaze-set, swirl-render, sheen-stripe, scored-render, quilted-set, mirror-panels, gilt-lattice.

## fal.ai
FLUX.2 [dev] `fal-ai/flux-2`: 44 ledger rows (42 sources plus one rejected motif regenerated; rate-limited 429 calls were not billed), about $0.58.
19 materials, 8 motifs, 15 murals. Rejected: `motif-flourish` (ink 1 %), reprompted once. Contact sheets: `dev/tasks/m10-surfaces/sheets/walls-a-1..10.png`.

Tuning done while looking at the sheets: plaster/metal/velvet/silk maps use one map tile per repeat (`tiles: 1`, repeats 2 to 2.8 m) because two tiles showed the map repeating; build `std` raised for cork, sand, clay, felt, hammered metal, leather and boucle; glaze strengths, swirl relief and satin contrast raised; mirror foxing made smaller and fainter; padded panels lost a plaid-looking shadow band and got an edge shade plus a soft highlight; palettes adjusted so every design has light, dark, neutral and accent tones.

## Checks
| Check | Result |
|---|---|
| `npx vitest run tests/unit/surfaces/m10-walls-a.test.ts` | 8 tests pass |
| `npm run typecheck` | clean |
| `npm run content:check` | 0 errors, 0 warnings |
| `npm test` (once, whole tree) | 18 failures in 9 files, none about walls-a (other groups: rubber-studded, plaster-peeled-brick, stripes-cabana, stone-sandstone-herringbone, fb-glass-cloud; unrelated timeouts under load) |

## Open issues
- Strie, swirl render and the matt/satin stripe are subtle on the lightest palettes by design; they read clearly on mid and dark ones.
- Brushed metal and moire show faint soft banding from the offset-and-blend seamless step (one map tile per repeat hides most of it).
- Mural joints (every 5.6 m) show the usual soft cross-fade ghost; fine for the scenes chosen, most visible on the city skyline and world map.
- No shared-file change needed.
