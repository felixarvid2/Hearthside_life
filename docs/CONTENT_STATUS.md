# Hearthside Life - Content status

Generated with `npm run content:check -- --markdown` (tools/content-report.ts). Counts are **distinct designs**; palettes, swatches and colours are variants and never counted as designs. Entries with status `dev` are not selectable in the game and are not counted toward targets.

Milestone 1 minimums (12 wall finishes, 8 floors, 15 furniture designs, 8 hairstyles, 12 garments) are met, as are the Milestone 2 content minimums (48 wall finishes, 32 floors, 60 furniture designs, plus at least 6 doors and 8 windows), the Milestone 3 character minimums (24 hairstyles, 48 garments, 12 accessories, 20 traits), the Milestone 4 furniture minimum (100 distinct furniture designs), the Milestone 5 social minimum (24 social interactions), the Milestone 6 career minimum (6 careers with 10 levels each, 10 ready skills and 6 aspirations) and the Milestone 11 minimums (12 careers with 10 levels each, 16 skills, 40 traits, 12 aspirations and 40 social interactions). The tree now has 13 careers (130 levels), 19 ready skills, 40 traits, 13 aspirations (39 stages) and 47 social interactions. Milestone 8 adds six family furniture models (bassinet, changing table, high chair, potty chair, toddler bed, birthday cake); Milestone 9 adds 13 staircases (9 straight, 4 spiral), 12 roof styles with 11 finishes, 24 fence designs, 12 gates, 12 terrain paints, 17 garden objects and 10 crops (see "Milestone 9 exterior"); Milestone 11 adds six skill objects (bread oven, yoga mat, sketchbook, camera tripod, telescope, stocked garden pond). After M8, teens have 4 part-time jobs with 3 levels each. Milestone 12 adds nine weather-bound outdoor activities and two socials (Build a Snowman, Make a Snow Angel, Fly a Kite, Rake Leaves, Jump in Puddles, Stargaze, Watch the Rain, Sunbathe and the extended picnic; Snowball Fight and Share a Picnic), their objects (kite, sun lounger, picnic blanket, the dev-only snowman), three pool styles (azure mosaic, lagoon tile, terracotta tile) and the Quayside Baths pool venue.

Milestone 7 adds ten venue furnishings (park tree, shrub, fountain, playground slide and swing set, service counter, produce stall, vending machine, study set, locker bank) and fourteen venue activities; the neighbourhood lots they furnish are listed in docs/ARCHITECTURE.md. Full-project targets are delivered in Milestone 10. Milestone 10 furniture: 573 designs meeting every category target, all own Kenney-style models built by code in `tools/furniture-extra`. Milestone 13 adds five working designs (pool table, dartboard cabinet, foosball table, table tennis table, pottery wheel; 578 in total), the dev-only handmade pot, 14 furnishing interactions (games, pottery, instruments, recliner, microwave, laundry, putting a fish in the fridge), toddler paddling, the pan-fried fish recipe and four two-player game socials (51 socials).


### Buy-mode furniture (distinct designs)

| | ready | dev | variants | M1 min | M2 min | M3 min | M4 min | M6 min | M11 min | full target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| seating | 64 | 0 | 1163 | - | - | - | - | - | - | 64 |
| beds | 40 | 0 | 1163 | - | - | - | - | - | - | 40 |
| tables | 48 | 0 | 635 | - | - | - | - | - | - | 48 |
| storage | 48 | 0 | 623 | - | - | - | - | - | - | 48 |
| kitchen | 56 | 0 | 635 | - | - | - | - | - | - | 56 |
| bathroom | 36 | 0 | 322 | - | - | - | - | - | - | 36 |
| lighting | 64 | 0 | 1025 | - | - | - | - | - | - | 64 |
| electronics | 28 | 0 | 242 | - | - | - | - | - | - | 28 |
| hobby | 41 | 0 | 504 | - | - | - | - | - | - | 36 |
| decor | 64 | 2 | 748 | - | - | - | - | - | - | 64 |
| outdoor | 40 | 0 | 452 | - | - | - | - | - | - | 40 |
| kids | 36 | 0 | 932 | - | - | - | - | - | - | 36 |
| stairs | 13 | 0 | 202 | - | - | - | - | - | - | 12 |
| TOTAL furniture | 578 | 2 | 8646 | 15 | 60 | - | 100 | - | - | 560 |

variants = finish swatches summed over all regions of ready objects; 158 ready designs are decorative, 564 offer at least 6 swatches in a region; distinct models used: 578.

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
| activities | 122 | 0 | - | - | - | - | - | - | - | 40 |
| social interactions | 51 | 0 | 0 also activities | - | - | - | - | - | 40 | 40 |
| traits | 40 | 0 | - | - | - | 20 | - | - | 40 | 40 |
| aspirations | 13 | 0 | 39 stages | - | - | - | - | 6 | 12 | 12 |
| skills | 19 | 0 | - | - | - | - | - | 10 | 16 | 16 |
| careers (10 levels) | 13 | 0 | 130 levels | 1 | - | - | - | 6 | 12 | 12 |
| part-time jobs (3 levels) | 4 | 0 | 12 levels | - | - | - | - | - | - | 4 |
| recipes | 12 | 0 | - | - | - | - | - | - | - | - |
| moodlets | 124 | 0 | - | - | - | - | - | - | - | - |
| packs | 12 | 0 | - | - | - | - | - | - | - | 12 |
| preferences | 38 | 0 | 6 groups | - | - | - | - | - | - | - |

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
