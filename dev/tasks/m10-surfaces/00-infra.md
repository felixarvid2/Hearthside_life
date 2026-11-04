# M10 surfaces, phase 1: infrastructure for AI-generated walls and floors

Goal of the whole job: wall finishes 50 -> 360 and floor designs 32 -> 200 (docs/DESIGN_BRIEF.md sections 14 and 15,
allocation per family), using fal.ai **FLUX.2 [dev]** (`fal-ai/flux-2`, $0.012 per megapixel) for the generated sources.
This phase builds only the shared machinery; nine content agents run afterwards, each in its own files.

Read first: docs/ASSET_GUIDE.md "Walls, floors, openings", dev/surfaces-ai/LEDGER.md, dev/surfaces-ai/generate.mjs,
tools/build-surface-maps.mjs, src/render/textures/{mapKit,surfaceMaps,mapPainters,painterKit,painters,surfaceTextures}.ts,
src/content/surfaces2.ts, tests/unit/surfaces/*.

## Hard rules
- The fal.ai key is in /home/user/apis/Fal.ai. Read it only inside scripts at run time. Never print, log, echo or commit it.
  Do not `cat` that file. Send it as `Authorization: Key <key>` to `https://fal.run/<model>` (this works; it was tested).
- Raw outputs go to dev/surfaces-ai/raw/ (gitignored). A cached source is never fetched again.
- Every real call appends a row to dev/surfaces-ai/LEDGER.md (date, id, model, size, cost). Budget for this whole job:
  $15 for fal-ai/flux-2 (the script must refuse to start a call that would pass it, summing the ledger rows).
- Do not run git. Do not touch unrelated systems. SCHEMA_VERSION stays 1.
- The 14 existing maps and all 82 existing designs must keep working and look identical. Their raw sources may be
  missing in this container: the build tool must only process sources whose raw file exists, never delete outputs.

## 1. Generator: `dev/surfaces-ai/generate.mjs`
- Source catalogue as data: `dev/surfaces-ai/sources/<group>.mjs`, each `export default [{ id, kind, prompt, w?, h?, seed? }]`
  where kind is `material` (greyscale detail map), `motif` (one isolated motif, black on white) or `mural` (a wide scene).
  Pre-create empty group files: walls-a.mjs ... walls-f.mjs, floors-a.mjs, floors-b.mjs, floors-c.mjs, pilot.mjs.
  Keep the old MAPS/SHIPPED table for the 14 FLUX.1 sources (record only).
- Model `fal-ai/flux-2` by default (body: prompt, image_size {width,height}, seed, enable_safety_checker false,
  output_format png or jpeg). Per-kind prompt suffix: material = the existing BASE line; motif = "a single isolated motif,
  solid black ink on a pure white background, centred with a wide white margin, flat graphic, crisp clean edges, no
  shading, no texture, no frame, no text"; mural = "wide panoramic mural artwork, soft flat painted style, limited tonal
  range, no text, no frame, no people in the foreground". Default sizes: material and motif 1024x1024, mural 1536x768.
- CLI: `node dev/surfaces-ai/generate.mjs --group walls-a` (all missing in the group), `... id1 id2`, `--dry` (list
  what would be fetched and the cost). Concurrency 4. One retry on HTTP 5xx/429. Writes raw/<id>.<ext> + raw/<id>.json
  (model, seed, prompt, kind, size). Prints only id + ok/failed + running total.

## 2. Build tool: `tools/build-surface-maps.mjs` (`npm run assets:surfaces`)
- Keep the material path exactly as it is for the existing 14 (their option table stays). New material sources default
  to the generic options (std 0.17, flatten 1, drift 0.5) unless the group file gives `build: {...}` overrides.
  Output 512 px greyscale WebP as now, quality chosen so a map is about 40-70 kB.
- Motif path: greyscale -> threshold/levels to a coverage mask (255 = ink) with anti-aliased edges -> crop to the ink
  bounding box -> pad to a square with 4 % margin -> 256 px -> `public/assets/surfaces/motifs/<id>.webp`. Reject (print a
  warning, write nothing) when ink touches the image border on more than 2 % of the border pixels, or covers less than
  3 % or more than 70 % of the area: that means the model did not isolate the motif.
- Mural path: greyscale, gentle flatten, normalised, seamless along x only (offset-and-blend), 1024x512 ->
  `public/assets/surfaces/murals/<id>.webp`.
- The tool also writes `src/render/textures/surfaceMapIds.generated.ts` with three sorted readonly arrays:
  MATERIAL_MAP_IDS (the 14 existing + every built material), MOTIF_IDS, MURAL_IDS. Built from what is in public/, so it
  is correct even when raws are missing. `npm run assets:surfaces -- --group walls-a` builds one group only.

## 3. Runtime loading
- mapKit: MAP_IDS = MATERIAL_MAP_IDS from the generated file (keep the export name). Add MOTIF_IDS / MURAL_IDS exports
  and `designMaps(design)` returns every map, motif and mural id the design's params reference (params `map`, `ground`,
  `motif`, `motif2`, `mural`).
- surfaceMaps: load by kind and path (surfaces/<id>.webp, surfaces/motifs/<id>.webp, surfaces/murals/<id>.webp, mural
  size 1024x512). Loading is on demand: when a painter asks for an id that is not loaded, start loading it and return
  null (the painter draws its flat fallback). When it arrives, the existing repaint path in surfaceTextures must repaint
  every texture and catalog thumbnail that used it (generalise whenSurfaceMapsLoaded to "a map arrived" listeners).
  Thumbnails painted without their map are not cached (existing rule).
- Motif tint: a motif mask becomes a canvas filled with one palette colour, alpha = mask. LRU-cache tinted motifs.
- `preloadSurfaceMaps()` in GameView no longer loads everything: it preloads the maps of designs used on the active lot
  (walls and floors of the current world state) plus the 14 old maps; everything else loads on demand. Keep the
  e2e/acceptance waits working (grep tests/e2e for surface map waits and adapt them).

## 4. New painters: `src/render/textures/motifPainters.ts` (registered in painters.ts)
- `motif-wall`: colours [ground, motif, accent, trim]. Params: motif (enum MOTIF_IDS), motif2 (optional filler motif,
  '' = none), ground (optional material map for a subtle paper/linen/plaster texture under the print, '' = none; use the
  map at low contrast around the ground colour), layout `grid | half-drop | brick | diagonal | scatter | trail`
  (trail = motifs along vertical lines, e.g. trailing vines), cols (motifs across one repeat, integer 1-8), rows (per
  wall height, integer 1-12), size (motif size as a fraction of its cell, 0.2-1.2), rotate (deg), rotJitter (deg),
  mirror (mirror every other motif), scaleJitter (0-0.5), motif2Size, skirt. Must be seamless along the wall run
  (stamps that cross the repeat edge wrap: use painterKit's drawWrapped/wrappedKey) and deterministic (seeded rng).
  Fallback without the motif image: draw a simple soft dot/diamond of the same layout and size, so geometry never
  depends on loading.
- `motif-floor`: same idea for floors, seamless both ways, plus layout `tile` = square tiles with grout (params grout
  width, grout colour role) where each tile shows the motif centred, rotated by 0/90/180/270 by a seeded rule
  (param `spin`: none | quarter | random), for cement/encaustic tiles and patterned carpets.
- `mural-wall`: a mural map stretched over one repeat (repeat = the mural width in metres, e.g. 3.6-6), wall height
  2.8 m, tritone tint (map 0 -> dark, 0.5 -> base, 1 -> light), optional skirting and an optional soft fade near the floor.
- Every painter declares its params with ParamSpec so `checkParams` validates designs, like the existing painters.

## 5. Where content agents write (create these now, empty and wired)
- Designs: `src/content/surfaces3/walls-a.ts` ... `walls-f.ts`, `floors-a.ts`, `floors-b.ts`, `floors-c.ts`, each exporting
  `WALLS_X: SurfaceDesign[]` (or FLOORS_X) built with the same helpers surfaces2.ts uses (export the helpers if they are
  module-private: wall(), floor(), pal(), ramp(), palettes). Wire all of them into the content DB once (content/index.ts or
  surfaces.ts), so an agent only ever edits its own file.
- Painters: `src/render/textures/packs/walls-a.ts` ... `floors-c.ts`, each exporting `PAINTERS_X: PainterDef[]` (empty),
  all registered once in painters.ts. An agent adds family-specific painters only in its own pack file.
- Sources: the dev/surfaces-ai/sources/<group>.mjs files above.

## 6. Review tool
`npm run visual:surfaces -- --group walls-a [--out dir]`: Playwright + dev/surfaces.html (or a small page of its own)
that waits for every map to load and writes contact sheets to `dev/tasks/m10-surfaces/sheets/<group>-<n>.png`: per
design a room-scale swatch (about 360x300 px, walls 2.4 m wide, floors 2 x 2 m) with the design id and name underneath,
plus a strip of its first 8 palettes. Use `--palettes` to show every palette large. Also `--ids a,b,c`. Use the browser
lock the e2e scripts use (/tmp/hearthside-browser.lock) the same way they do; do not wrap in flock.

## 7. Pilot (proves the pipeline end to end)
Add to sources/pilot.mjs and generate with FLUX.2: one motif `motif-peony` (a peony flower head with two leaves), one
motif `motif-rocket` (a cartoon rocket), one mural `mural-misty-pines` (layered misty pine forest hills), one material
`paper-linen` (fine linen-textured wallpaper paper ground, very low contrast). Build them. Add exactly three designs:
- walls-c.ts: `floral-peony-halfdrop` (motif-wall, half-drop peonies, paper-linen ground, 8 palettes, family floral)
- walls-a.ts: `mural-misty-pines` (mural-wall, family mural, 8 tritone palettes or a paletteNote)
- floors-c.ts: `carpet-rocket-kids` (motif-floor, scatter rockets on a carpet ground using map fibre-berber at low
  contrast, family carpet, 6 palettes)
Make contact sheets of the three and look at them; iterate until they look good at room scale.

## 8. Checks and report
Update tests: mapPainters/surfaces tests that compare files with MAP_IDS must use the generated lists; add unit tests for
the new painters (fake canvas: deterministic, seamless edge stamps wrap, fallback without images, params validated) and
for the motif/mural build checks (pure functions). Run `npm run typecheck`, `npm test`, `npm run content:check`,
`npm run build`, `npm run e2e` (it must stay OK). Report in dev/tasks/m10-surfaces/00-progress.md: files changed, how a
content agent adds a design end to end (5-8 lines, exact commands), what the pilot cost, check results, open issues.
