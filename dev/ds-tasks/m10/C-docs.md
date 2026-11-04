You are working in the repository at the current directory: Hearthside Life. Read docs/CONTINUATION.md first.
git, curl and rm are blocked; a supervisor commits. Only edit the files named below. Keep each file's existing style
(plain, factual English, short lines like the surrounding text). Do not invent numbers: use only the facts below.

## Task: document the Milestone 10 surface catalog

Facts:
- Wall finishes: 50 -> 360 designs (3382 palettes). Floors: 32 -> 200 designs (1523 palettes). Brief allocation met:
  walls paint 28, stripes 24, geometric 32, floral 32, botanical 24, vintage-deco 24, playful 24, wood-panel 24, tile 36,
  brick-stone 32, concrete 20, luxury 20, mural 20, themed 20; floors wood-planks 40, parquet 24, laminate-vinyl 20,
  tile 32, stone 24, carpet 24, concrete 12, exterior 24.
- 278 wall and 156 floor designs use AI-generated sources (tinted greyscale detail maps, motifs or murals); 82 walls and
  44 floors are painted entirely by code. Palettes tint the sources, so every palette works.
- Sources: 153 greyscale material maps (512 px WebP), 131 motifs (256 px), 16 murals (1024x512, seamless along x),
  about 13 MB in public/assets/surfaces/. Generated with fal.ai FLUX.2 [dev] (`fal-ai/flux-2`) on 2026-11-04:
  290 images, $3.69 (ledger dev/surfaces-ai/LEDGER.md, total over all surface work 316 calls, $4.31).
  Why FLUX.2 [dev]: best of the probed models at continuous materials without baked-in joints and at isolated motifs
  (FLUX.1 [dev] baked in grids, Qwen-Image ignored isolation, Recraft gave perspective/product shots), half the price
  of FLUX.1 [dev], and fal lists it for commercial use.
- Pipeline: dev/surfaces-ai/generate.mjs (sources per group in dev/surfaces-ai/sources/<group>.mjs, budget cap,
  ledger), `npm run assets:surfaces -- --group <g>` (tools/build-surface-maps.mjs) builds the maps and
  src/render/textures/surfaceMapIds.generated.ts; maps load on demand (only the 14 base maps plus the active lot's maps
  are preloaded). Shared painters motif-wall, motif-floor, mural-wall; per-group painters in
  src/render/textures/packs/<group>.ts and content in src/content/surfaces3/<group>.ts.
  Review sheets: `npm run visual:surfaces -- --group <g> [--ids a,b] [--palettes]`.
- Milestone 10 status: the surface part is done; 560 furnishings and the creator catalog targets are still open.

Edits:
1. docs/CONTENT_STATUS.md: the construction surfaces table already shows the targets 360/200; set the current counts
   and update the "Walls and floors" bullet (line ~98) with the facts above.
2. docs/ASSET_GUIDE.md (~line 200-245): the surface source section and the licence table row: add FLUX.2 [dev] outputs.
3. public/assets/LICENSES.md: add the FLUX.2 [dev] surface sources (same form as the existing FLUX.1 [dev] entry;
   note: check fal.ai and FLUX.2 [dev] output terms before distribution, as the existing entry does).
4. docs/ROADMAP.md and docs/CONTINUATION.md: Milestone 10 surfaces done (what, counts, pipeline commands), furnishings
   and creator catalog still open; add a short "how to add or fix a surface design" note to CONTINUATION.
5. docs/TEST_CHECKLIST.md: add a Milestone 10 surfaces row in the existing format with the checks typecheck, test,
   content:check, build, e2e, e2e:creator, acceptance portrait/landscape/desktop and the result text "RESULTS-PENDING"
   (the supervisor fills it in).
Write a short list of what you changed to dev/ds-tasks/m10/C-progress.md.
