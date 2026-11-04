You are working in the repository at the current directory: Hearthside Life, a Three.js/TypeScript/Vite life sim.
Read docs/CONTINUATION.md, dev/tasks/m10-surfaces/00-infra.md and dev/tasks/m10-surfaces/common.md first.
git, curl and rm are blocked; a supervisor commits. Do NOT call fal.ai or run dev/surfaces-ai/generate.mjs (no budget
for new images); fix designs with painter code, painter params and the maps that already exist
(src/render/textures/surfaceMapIds.generated.ts lists them).

## Task: fix the surface designs a visual review flagged

1. `tile-hopscotch` (floor, group floors-b: src/content/surfaces3/floors-b.ts, painter in
   src/render/textures/packs/floors-b.ts) is broken: it reads as plaid with grey bars. It must look like the classic
   "hopscotch"/pinwheel tile: large square tiles with a small square tile at one corner of each, in a pinwheel
   offset (each row shifted by the small tile's width), with thin grout lines around every tile. Draw it as geometry:
   tiles as filled rects, grout as gaps, small tiles in the second palette colour.
2. Wood plank floors `plank-oak-scraped`, `plank-elm-wild`, `plank-acacia-lively` (group floors-a) look cartoonish /
   squiggly. Make the grain read as real wood: use an existing photographic grain map (for example grain-walnut,
   grain-ash, grain-cherry, grain-pine-knotty, grain-reclaimed or the floors-a grain maps) at a scale and contrast close to
   the good plank designs in the same file, and drop or tone down procedural squiggle lines. Keep each design distinct
   from the others (a test forbids two designs with the same painter and params).
3. If time allows, these weaker ones reported by the group agents (each line: group, issue):
   floors-b: 45 degree lattices are stretched about 3 % (fix the repeat so the diagonal cell is square);
   walls-f: fish-scale slate has an artefact row at the bottom of the tile (the repeat must wrap cleanly);
   walls-d: the memphis triangle motif-wall design reads as a blob (raise its motif scale or pick a cleaner layout).

Keep the palette rules (src/content/surfaces.ts paletteTone; walls need light/dark/neutral/accent, floors >= 3 tones)
and the counts (walls 360, floors 200; ids stay the same).

Review: `npm run visual:surfaces -- --group floors-b --ids tile-hopscotch --palettes` writes contact sheets to
dev/tasks/m10-surfaces/sheets/. Look at the PNG with the Read tool if you can see images; if not, verify with pixel
statistics (node script reading the PNG, e.g. dev/ds-tasks/pixels.mjs) and describe what the numbers show.
Checks when done: `npm run typecheck`, `npx vitest run tests/unit/surfaces`, `npm run content:check`.
Write progress (what changed per design, check results, which sheets you rendered) to dev/ds-tasks/m10/B-progress.md.
Do not touch tests/e2e/ or game code outside src/content/surfaces3/ and src/render/textures/ (another agent works there).
