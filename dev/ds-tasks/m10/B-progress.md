# B - Fix the flagged Milestone 10 surface designs

All fixes use the existing photographic maps and painter parameters only; no fal.ai calls, no
`dev/surfaces-ai/generate.mjs`, no new images. Ids, design counts (360 walls / 200 floors) and palettes are unchanged.

## 1. `tile-hopscotch` (floors-b) - rebuilt as a real hopscotch/pinwheel

- `src/render/textures/packs/floors-b.ts`, `cellFor()` `case 'hopscotch'` (line 123): the cell is now the classic
  unit of a large square `a`, a small square `b` at one corner and the two slim bars (`b x a` and `a x b`) that fill
  the rest of the `(a + b)` square. The bars and the large square share the large-tile slot, so the eye reads squares,
  not stripes. Alternate rows mirror the unit, so every row is shifted by the small tile's width `b` and the pins
  pinwheel through the field. The cell spans two rows, `(a + b) x 2(a + b)`; grout is still the gap between filled
  rects (`grout` param).
- `src/content/surfaces3/floors-b.ts`: `tile-hopscotch` (line 276) keeps `layout: 'hopscotch', tileW: 0.2,
  tileH: 0.1, checker: true` and `repeat: 1.2`, which is exactly 4 x 2 cells (S = 0.3, 2S = 0.6) so the repeat closes.
  The small square takes the alt tone via `checker` (the painter's `small = checker ? 1 : 2`), i.e. the second
  palette colour. `stone-limestone-pinwheel` keeps the accent tone for its small dark squares (it has no `checker`),
  and its repeat changed 1.35 -> 1.8 (exact multiple of 2S = 0.9) so the two-row cell is no longer squeezed.
- Painter param doc for `checker` updated to mention the hopscotch small corner square.

Result (sheet `floors-b-palettes-1.png`): large squares with a small contrasting square at the corner, staggered by
the small tile's width, thin grout around every piece - the plaid bars are gone.

## 2. Squiggly plank floors (floors-a) - switched to photographic grain maps

The squiggle came from the maps, not the painter, so the three designs now use straight-grain maps at scales close to
the good plank designs in the same file (`plank-heartpine-antique`, `plank-driftwood-coast` use 0.7-0.9):

- `plank-oak-scraped` (`src/content/surfaces3/floors-a.ts:93`): `grain-oak-scraped` -> `grain-oak-brushed`,
  `{ board: 0.15, minLen: 0.8, maxLen: 1.8, bevel: 'pillow', scale: 0.7 }` (the pillowed hand-scraped edge stays).
- `plank-elm-wild` (`:96`): `grain-elm` -> `grain-ash`, `{ board: 0.2, minLen: 0.9, maxLen: 2.0, scale: 0.9 }`;
  long boards with calm grain and the odd wave, no drawn squiggles.
- `plank-acacia-lively` (`:99`): `grain-acacia` -> `grain-walnut`, `{ board: 0.14, minLen: 0.84, maxLen: 0.84,
  bond: 'half', scale: 0.7 }`.
- `parquet-brick-blocks` (`:220`): `grain-heartpine` -> `grain-elm` (brick-bond, `{ block: 0.2, board: 0.075,
  gap: 0.003, scale: 0.5, variation: 0.55 }`). `grain-elm` must stay used (the "every shipped map is used" tests),
  and on short reclaimed blocks the elm swirl reads as figured reclaimed wood; the description was updated to match.
  `grain-oak-scraped` and `grain-acacia` stay in use via `lvp-scraped-wide` and `parquet-basket-coarse`, so all maps
  remained used.

Each design keeps distinct painter params (the distinct-design test passes). Result (sheets
`floors-a-palettes-1..3.png`): straight/softly figured boards in all palettes, grain at the same visual scale as the
good plank designs instead of drawn curls.

## 3. Optional fixes

- **floors-b 45 degree lattices** (`src/content/surfaces3/floors-b.ts`): the rotated lattice's repeat was a hair off
  an exact multiple of the period, so the diagonal cells were ~2-3 % anisotropic. `tile-chevron-porcelain` repeat
  1.27 -> 1.6971 (4 x 0.3 sqrt2 = 15 x 0.08 sqrt2); `tile-herringbone-diagonal`, `tile-diagonal-set`,
  `stone-marble-checker`, `stone-limestone-cabochon`, `stone-granite-diagonal` and `stone-sandstone-herringbone`
  repeat 1.27 -> 1.2728 (3 x 0.3 sqrt2 = 18 x 0.1 sqrt2). Visual check in `tmp/final-lattice/ids-1.png` and
  `ids-2.png`: diamonds/chevrons are square and the 45 degree grout runs are at 45 degrees.
- **walls-f fish-scale** (`src/render/textures/packs/walls-f.ts:485`): the lowest row was placed a quarter cell
  *below* the floor line, so the visible wall ended in a flat cut-off row. It now starts with `bottom = s.h - r *
  step`, i.e. the rounded tails land exactly on the floor line and the rows above wrap normally; no artefact row at
  the bottom (sheet `walls-f-palettes-1.png`).
- **walls-d memphis** (`src/content/surfaces3/walls-d.ts:195`): `vintage-memphis` motif layout 3 x 6 at size 0.7
  (tiny dense blobs) -> 2 x 4 at size 1.0, `rotJitter: 30`, `motif2Size: 0.55`. The squiggles and confetti triangles
  now read individually as bold Memphis print instead of a texture of blobs (sheet `walls-d-palettes-1.png`).

## Checks

- `npm run typecheck`: clean.
- `npm run content:check`: 0 errors, 0 warnings; 360 wall finishes / 3382 palettes and 200 floor designs / 1523
  palettes (counts and palette rules unchanged).
- `npx vitest run tests/unit/surfaces`: all 156 tests pass (`--maxWorkers=1`, 16 files). The default parallel run on
  this machine intermittently trips vitest's 5 s default timeout on the two heavyweight paint loops
  (`mapPainters.test.ts > draw tinted map images...`: ~2.5 s alone but ~5.7 s under 16-file parallel load;
  `painters.test.ts > are deterministic`: ~4.0 s alone). Both pass standalone and in the single-worker full run;
  no test files were changed.

## Sheets rendered

In `dev/tasks/m10-surfaces/sheets/` (canonical review location):

- `floors-b-palettes-1.png`, `floors-b-palettes-2.png` (`tile-hopscotch`, `stone-limestone-pinwheel`)
- `floors-a-palettes-1.png` .. `floors-a-palettes-3.png` (`plank-oak-scraped`, `plank-elm-wild`,
  `plank-acacia-lively`)
- `walls-f-palettes-1.png` (`stone-slate-scales`)
- `walls-d-palettes-1.png` (`vintage-memphis`)

Scratch sheets (not for review): `dev/ds-tasks/m10/tmp/final-lattice/ids-1.png`, `ids-2.png`; earlier iteration
renders remain under `dev/ds-tasks/m10/tmp/` (`rm` is blocked in this environment, so they were not cleaned up).
