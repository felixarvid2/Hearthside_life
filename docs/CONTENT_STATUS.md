# Hearthside Life - Content status

Generated with `npm run content:check -- --markdown` (tools/content-report.ts). Counts are **distinct designs**; palettes, swatches and colours are variants and never counted as designs. Entries with status `dev` are not selectable in the game and are not counted toward targets.

Milestone 1 minimums (12 wall finishes, 8 floors, 15 furniture designs, 8 hairstyles, 12 garments) are met, as are the Milestone 2 content minimums (48 wall finishes, 32 floors, 60 furniture designs, plus at least 6 doors and 8 windows), the Milestone 3 character minimums (24 hairstyles, 48 garments, 12 accessories, 20 traits), the Milestone 4 furniture minimum (100 distinct furniture designs), the Milestone 5 social minimum (24 social interactions) and the Milestone 6 career minimum (6 careers with 10 levels each, 10 ready skills and 6 aspirations). TODO: the tables below are not regenerated for Milestones 8 and 9 (family furniture, 12 staircases in the catalogue as 9 straight and 4 spiral, 24 fence designs, 12 gates, 12 roof styles, 12 terrain paints, 16 garden objects, 10 crops). Run `npm run content:check -- --markdown` and replace the generated tables with its output.

Milestone 7 adds ten venue furnishings (park tree, shrub, fountain, playground slide and swing set, service counter, produce stall, vending machine, study set, locker bank) and fourteen venue activities; the neighbourhood lots they furnish are listed in docs/ARCHITECTURE.md. Full-project targets are delivered in Milestone 10.

### Buy-mode furniture (distinct designs)

| | ready | dev | variants | M1 min | M2 min | M3 min | M4 min | M6 min | full target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| seating | 19 | 0 | 288 | - | - | - | - | - | 64 |
| beds | 5 | 0 | 70 | - | - | - | - | - | 40 |
| tables | 11 | 0 | 110 | - | - | - | - | - | 48 |
| storage | 10 | 0 | 107 | - | - | - | - | - | 48 |
| kitchen | 21 | 0 | 186 | - | - | - | - | - | 56 |
| bathroom | 9 | 0 | 16 | - | - | - | - | - | 36 |
| lighting | 7 | 0 | 44 | - | - | - | - | - | 64 |
| electronics | 7 | 0 | 45 | - | - | - | - | - | 28 |
| hobby | 6 | 0 | 55 | - | - | - | - | - | 36 |
| decor | 10 | 0 | 72 | - | - | - | - | - | 64 |
| outdoor | 11 | 0 | 115 | - | - | - | - | - | 40 |
| kids | 5 | 0 | 74 | - | - | - | - | - | 36 |
| TOTAL furniture | 121 | 0 | 1182 | 15 | 60 | - | 100 | - | 560 |

variants = finish swatches summed over all regions of ready objects; 23 ready designs are decorative, 112 offer at least 6 swatches in a region; distinct models used: 121.

### Construction surfaces

| | ready | dev | variants | M1 min | M2 min | M3 min | M4 min | M6 min | full target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| wall finishes | 50 | 0 | 433 | 12 | 48 | - | - | - | 360 |
| floor designs | 32 | 0 | 224 | 8 | 32 | - | - | - | 200 |
| doors | 9 | 0 | - | - | 6 | - | - | - | 48 |
| windows | 11 | 0 | - | - | 8 | - | - | - | 64 |

variants = curated palettes of ready designs (a design counts once however many palettes it has).

### Character content

| | ready | dev | variants | M1 min | M2 min | M3 min | M4 min | M6 min | full target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hairstyles | 28 | 0 | 18 colours | 8 | - | 24 | - | - | 60 |
| facial hair | 5 | 0 | - | - | - | - | - | - | 16 |
| garments | 54 | 0 | 154 | 12 | - | 48 | - | - | 132 |
| accessories | 15 | 0 | 7 kinds | - | - | 12 | - | - | 32 |
| patterns | 7 | 0 | - | - | - | - | - | - | - |
| face presets | 24 | 0 | 18 sliders | - | - | - | - | - | - |
| body presets | 12 | 0 | 10 sliders | - | - | - | - | - | - |
| brow styles | 8 | 0 | - | - | - | - | - | - | - |
| voices | 6 | 0 | - | - | - | - | - | - | - |
| skin tones | 16 | 0 | - | - | - | - | - | - | - |
| eye colours | 12 | 0 | - | - | - | - | - | - | - |

garment variants = solid plus allowed patterns per ready garment (colours are free choice).

### Gameplay content

| | ready | dev | variants | M1 min | M2 min | M3 min | M4 min | M6 min | full target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| activities | 65 | 0 | - | - | - | - | - | - | 40 |
| social interactions | 35 | 0 | 0 also activities | - | - | - | - | - | 40 |
| traits | 20 | 0 | - | - | - | 20 | - | - | 40 |
| aspirations | 8 | 0 | 24 stages | - | - | - | - | 6 | 12 |
| skills | 10 | 6 | - | - | - | - | - | 10 | 16 |
| careers (10 levels) | 7 | 0 | 70 levels | 1 | - | - | - | 6 | 12 |
| recipes | 6 | 0 | - | - | - | - | - | - | - |
| moodlets | 93 | 0 | - | - | - | - | - | - | - |
| packs | 12 | 0 | - | - | - | - | - | - | 12 |
| preferences | 34 | 0 | 5 groups | - | - | - | - | - | - |

activities exclude moves and menus (behaviors goHere, goToWork, leaveLot, editOutfits); no social is also counted as an activity.

Validation: 0 errors, 0 warnings

## Assets and art status

- Furniture: 98 designs use Kenney Furniture Kit models (CC0) and 23 (dishwasher, easel, piano, treadmill, weight bench, chess table, crib, toy chest, barbecue, patio set, raised bed, garden bench and chair, and for the Milestone 7 venues: tree, shrub, fountain, playground slide, swing set, service counter, produce stall, vending machine, study set, locker bank) use original low-poly models built by `tools/furniture-extra` in the kit's style; one distinct model per design. No missing assets.
- Walls and floors: 44 of the 50 wall finishes and 22 of the 32 floors are painted entirely by the game's code (original); 16 designs (6 walls, 10 floors) are built on tinted AI-generated detail maps (14 maps) (fal.ai FLUX.1 [dev], `public/assets/surfaces/`, about 1 MB, see `dev/surfaces-ai/LEDGER.md` and `public/assets/LICENSES.md`); palettes tint the maps, so every palette still works.
- Doors, windows, faces, hair and clothing are generated by the game's code (original). No temporary placeholder art is shown as finished content.
- Packs are organisational tags; no pack is complete yet.
