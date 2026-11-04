# Hearthside Life - Content status

Generated with `npm run content:check -- --markdown` (tools/content-report.ts). Counts are **distinct designs**; palettes, swatches and colours are variants and never counted as designs. Entries with status `dev` are not selectable in the game and are not counted toward targets.

Milestone 1 minimums (12 wall finishes, 8 floors, 15 furniture designs, 8 hairstyles, 12 garments) are met, as are the Milestone 2 content minimums (48 wall finishes, 32 floors, 60 furniture designs, plus at least 6 doors and 8 windows), the Milestone 3 character minimums (24 hairstyles, 48 garments, 12 accessories, 20 traits), the Milestone 4 furniture minimum (100 distinct furniture designs), the Milestone 5 social minimum (24 social interactions), the Milestone 6 career minimum (6 careers with 10 levels each, 10 ready skills and 6 aspirations) and the Milestone 11 minimums (12 careers with 10 levels each, 16 skills, 40 traits, 12 aspirations and 40 social interactions). The tree now has 13 careers (130 levels), 19 ready skills, 40 traits, 13 aspirations (39 stages) and 45 social interactions. Milestone 8 adds six family furniture models (bassinet, changing table, high chair, potty chair, toddler bed, birthday cake); Milestone 9 adds 13 staircases (9 straight, 4 spiral), 12 roof styles with 11 finishes, 24 fence designs, 12 gates, 12 terrain paints, 16 garden objects and 10 crops (see "Milestone 9 exterior"); Milestone 11 adds six skill objects (bread oven, yoga mat, sketchbook, camera tripod, telescope, stocked garden pond). After M8, teens have 4 part-time jobs with 3 levels each.

Milestone 7 adds ten venue furnishings (park tree, shrub, fountain, playground slide and swing set, service counter, produce stall, vending machine, study set, locker bank) and fourteen venue activities; the neighbourhood lots they furnish are listed in docs/ARCHITECTURE.md. Full-project targets are delivered in Milestone 10.

### Buy-mode furniture (distinct designs)

| | ready | dev | variants | M1 min | M2 min | M3 min | M4 min | M6 min | M11 min | full target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| seating | 19 | 0 | 288 | - | - | - | - | - | - | 64 |
| beds | 6 | 0 | 86 | - | - | - | - | - | - | 40 |
| tables | 11 | 0 | 110 | - | - | - | - | - | - | 48 |
| storage | 10 | 0 | 107 | - | - | - | - | - | - | 48 |
| kitchen | 22 | 0 | 199 | - | - | - | - | - | - | 56 |
| bathroom | 9 | 0 | 16 | - | - | - | - | - | - | 36 |
| lighting | 7 | 0 | 44 | - | - | - | - | - | - | 64 |
| electronics | 7 | 0 | 45 | - | - | - | - | - | - | 28 |
| hobby | 10 | 0 | 87 | - | - | - | - | - | - | 36 |
| decor | 11 | 0 | 81 | - | - | - | - | - | - | 64 |
| outdoor | 28 | 0 | 270 | - | - | - | - | - | - | 40 |
| kids | 9 | 0 | 134 | - | - | - | - | - | - | 36 |
| stairs | 13 | 0 | 202 | - | - | - | - | - | - | 12 |
| TOTAL furniture | 162 | 0 | 1669 | 15 | 60 | - | 100 | - | - | 560 |

variants = finish swatches summed over all regions of ready objects; 43 ready designs are decorative, 151 offer at least 6 swatches in a region; distinct models used: 162.

### Construction surfaces

| | ready | dev | variants | M1 min | M2 min | M3 min | M4 min | M6 min | M11 min | full target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| wall finishes | 360 | 0 | 3382 | 12 | 48 | - | - | - | - | 360 |
| floor designs | 200 | 0 | 1523 | 8 | 32 | - | - | - | - | 200 |
| doors | 9 | 0 | - | - | 6 | - | - | - | - | 48 |
| windows | 11 | 0 | - | - | 8 | - | - | - | - | 64 |

variants = curated palettes of ready designs (a design counts once however many palettes it has).

### Character content

| | ready | dev | variants | M1 min | M2 min | M3 min | M4 min | M6 min | M11 min | full target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hairstyles | 28 | 0 | 18 colours | 8 | - | 24 | - | - | - | 60 |
| facial hair | 5 | 0 | - | - | - | - | - | - | - | 16 |
| garments | 54 | 0 | 154 | 12 | - | 48 | - | - | - | 132 |
| accessories | 15 | 0 | 7 kinds | - | - | 12 | - | - | - | 32 |
| patterns | 7 | 0 | - | - | - | - | - | - | - | - |
| face presets | 24 | 0 | 18 sliders | - | - | - | - | - | - | - |
| body presets | 12 | 0 | 10 sliders | - | - | - | - | - | - | - |
| brow styles | 8 | 0 | - | - | - | - | - | - | - | - |
| voices | 6 | 0 | - | - | - | - | - | - | - | - |
| skin tones | 16 | 0 | - | - | - | - | - | - | - | - |
| eye colours | 12 | 0 | - | - | - | - | - | - | - | - |

garment variants = solid plus allowed patterns per ready garment (colours are free choice).

### Gameplay content

| | ready | dev | variants | M1 min | M2 min | M3 min | M4 min | M6 min | M11 min | full target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| activities | 97 | 0 | - | - | - | - | - | - | - | 40 |
| social interactions | 45 | 0 | 0 also activities | - | - | - | - | - | 40 | 40 |
| traits | 40 | 0 | - | - | - | 20 | - | - | 40 | 40 |
| aspirations | 13 | 0 | 39 stages | - | - | - | - | 6 | 12 | 12 |
| skills | 19 | 0 | - | - | - | - | - | 10 | 16 | 16 |
| careers (10 levels) | 13 | 0 | 130 levels | 1 | - | - | - | 6 | 12 | 12 |
| part-time jobs (3 levels) | 4 | 0 | 12 levels | - | - | - | - | - | - | 4 |
| recipes | 11 | 0 | - | - | - | - | - | - | - | - |
| moodlets | 109 | 0 | - | - | - | - | - | - | - | - |
| packs | 12 | 0 | - | - | - | - | - | - | - | 12 |
| preferences | 34 | 0 | 5 groups | - | - | - | - | - | - | - |

activities exclude moves and menus (behaviors goHere, goToWork, leaveLot, editOutfits); no social is also counted as an activity.

### Milestone 9 exterior

| | ready | dev | variants | M1 min | M2 min | M3 min | M4 min | M6 min | M11 min | full target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| roof styles | 12 | 0 | - | - | - | - | - | - | - | 12 |
| roof finishes | 11 | 0 | 34 | - | - | - | - | - | - | 8 |
| fence designs | 24 | 0 | 123 | - | - | - | - | - | - | 24 |
| gate designs | 12 | 0 | 64 | - | - | - | - | - | - | 12 |
| terrain paints | 12 | 0 | - | - | - | - | - | - | - | 8 |
| garden objects | 17 | 0 | 155 | - | - | - | - | - | - | 12 |
| garden crops | 10 | 0 | 3 kinds | - | - | - | - | - | - | - |
| staircases (straight) | 9 | 0 | - | - | - | - | - | - | - | 8 |
| staircases (spiral) | 4 | 0 | - | - | - | - | - | - | - | 4 |

variants = colour palettes (roof finishes), colour variants (fences and gates), finish swatches (garden objects); garden objects are the outdoor objects with a 'garden-' id; the staircase rows count objects with the `stair` field.

Validation: 0 errors, 0 warnings

## Assets and art status

- Furniture: the Kenney Furniture Kit (CC0) supplies most models; 63 designs use original low-poly models built by `tools/furniture-extra` in the kit's style (including the Milestone 11 bread oven, yoga mat, sketchbook, camera tripod, telescope and stocked garden pond). One distinct model per design. No missing assets.
- Walls and floors: the Milestone 10 surface catalog is complete: 360 wall finishes (3382 palettes) and 200 floor designs (1523 palettes). It meets the brief allocation: walls paint 28, stripes 24, geometric 32, floral 32, botanical 24, vintage-deco 24, playful 24, wood-panel 24, tile 36, brick-stone 32, concrete 20, luxury 20, mural 20, themed 20; floors wood-planks 40, parquet 24, laminate-vinyl 20, tile 32, stone 24, carpet 24, concrete 12, exterior 24. 278 wall and 156 floor designs use AI-generated sources (tinted greyscale detail maps, motifs or murals); 82 walls and 44 floors are painted entirely by the game's code (original). Sources: 153 greyscale material maps (512 px WebP), 131 motifs (256 px) and 16 murals (1024 x 512, seamless along x), about 13 MB in `public/assets/surfaces/`, generated with fal.ai FLUX.2 [dev] (`fal-ai/flux-2`) on 2026-11-04: 290 images, $3.69 (ledger `dev/surfaces-ai/LEDGER.md`; all surface work 316 calls, $4.31). Palettes tint the sources, so every palette works. See `public/assets/LICENSES.md`.
- Doors, windows, faces, hair and clothing are generated by the game's code (original). No temporary placeholder art is shown as finished content.
- Packs are organisational tags; no pack is complete yet.
