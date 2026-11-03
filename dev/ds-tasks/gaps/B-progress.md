# Task B: kids' clothes, elder wrinkles

Done. Kids' garments now scale their fit offsets with the stage body; elders get a subtle procedural wrinkle map; both are
visible in the new screenshots.

## Files changed
- `src/characters/clothing.ts` - scaled the absolute fit offsets by `bodyScale(t)` (`t.lm.headY / 1.55`, capped at 1: adult 1,
  teen about 0.9, child 0.7, toddler 0.5). `buildGarment` scales layer thickness, hem rim, neckline half-width and strap width;
  `torsoPiece` (tuck, fold and puff amplitude), `legPieces` (ease, cuff and flare - flare now scales with the square of the body
  size), `sleevePieces` (ease, balloon, bell, puff), `skirtPiece` (clearance, pleats, hem drop and bell flare squared) and
  `collarPiece` (collar height/roll, sag, points, hood pouch) all use it. Every factor is 1 on the adult bodies, so adult
  garments are bit-for-bit unchanged.
- `src/characters/materials.ts` - `wrinkleIntensity(p)` (face-local forehead lines, glabella, crow's feet, under-eye lines,
  nasolabial folds), `bakeWrinkleTexture()` which rasterizes that pattern into the head's own UV layout (512x512 R8 DataTexture,
  only head triangles), and `wrinkleMapForStage('elder', geometry)`, which builds the map once and returns the shared texture for
  every elder and null for every other stage. The MPFB skin shader samples it (`HAS_WRINKLES`, own program cache key) and
  multiplies the albedo by `1 - 0.15 * map`. Multiplicative, so it works on all 16 skin tones; only the eldest gets the define.
- `src/characters/CharacterView.ts` - passes `wrinkleMapForStage(this.stage, this.frame.skinGeometry)` to
  `createMpfbSkinMaterial`.
- `tests/unit/characters3d/stageBodies.test.ts` - new tests: stage bodyScale ordering, tee stand-off closer on toddlers/children
  and proportional to body size, reduced A-line skirt flare, wrinkle pattern on forehead/crow's feet but not the back of the head,
  one elder map shared, null for adult/teen, uniform wiring.
- `dev/mpfb/shootStages.mjs` - new `--plan=closeups` (elder faces front/three-quarter and six dressed kid shots).
  `dev/mpfb/composeStages.mjs` - writes `elder_wrinkles.jpg` and `kids_clothes.jpg`. `package.json` - added
  `visual:stages` / `visual:stages:compose` so the scripts can be run like the others.

## How it works

Garments were authored in metres for the adult bodies; `bodyScale` already existed for necklines and is exactly 1 for
adults. Scaling every additive offset by it (and flared radii by its square, because the flare is an offset over a drop) keeps
the garment proportionally the same on a child instead of wrapping a 0.93 m toddler in an adult-sized shell. Wrinkles are one
small texture built from the head geometry's own UVs and face coordinates, so they survive sliders and face morphs without
per-frame cost.

Measured tee stand-off from the nearest skin vertex (torso band): toddler 17.2 mm (was about 25), child 27.0 (was 31-33),
teen 33.9 (was 36-43), adult f 41.2 (unchanged).

## Screenshots (dev/mpfb/shots)

- `stages_lineup.jpg` - all seven stages; adult silhouettes unchanged, kids' tops/trousers now sit on the body and the toddler
  sundress and child skirt hang like scaled-down adult skirts rather than tents.
- `elder_wrinkles.jpg` - two front faces and a three-quarter face. Forehead lines, crow's feet, under-eye and nasolabial lines
  are clearly visible at head-and-shoulders range without reading as dirt or paint; the darker and lighter tones both show them.
- `kids_clothes.jpg` - dressed toddler/child/teen boys (top) and girls (bottom). Sleeves and hems are close, the toddler dress
  no longer flares wide, and the teen clothes look adult-like.

## Checks

- `npm run typecheck` - clean
- `npm test` - 119 files, 1673 tests, all pass (an initial run had two unrelated teen-job failures from the concurrent
  Task A changes; they passed on the final run)
- `npm run content:check` - 0 errors, 0 warnings
- `npm run build` - passes (only the existing chunk-size warning)

## Open items

- Did not run e2e/acceptance (not required here; the garment and shader changes are covered by the unit tests and screenshots).
- Wrinkle strength is a single shader constant (0.15), easy to lower on a phone screen; no normal map, so the lines do not catch the light.
- `dev/ds-tasks/gaps/uvhead.png` and `uvprobe.mjs` are UV-investigation leftovers, not used by the final code.
