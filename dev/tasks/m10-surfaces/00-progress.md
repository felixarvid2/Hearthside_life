# M10 surfaces, phase 1: progress

State: infrastructure done and checked. Nine content agents can now work, each in its own files.

## Files changed

New
- `dev/surfaces-ai/sources/{walls-a..f,floors-a..c,pilot}.mjs` (source catalogue as data; only `pilot.mjs` has entries)
- `dev/surfaces-sheet.{html,ts,mjs}` (review tool, `npm run visual:surfaces`)
- `tools/surface-checks.mjs` + `.d.mts` (pure motif/mural build checks)
- `src/render/textures/motifPainters.ts` (`motif-wall`, `motif-floor`, `mural-wall`)
- `src/render/textures/surfaceMapIds.generated.ts` (written by the build tool)
- `src/render/textures/packs/{walls-a..f,floors-a..c}.ts` (empty `PAINTERS_*`)
- `src/content/surfaces3/{kit,index,walls-a..f,floors-a..c}.ts` (`kit.ts` re-exports the builders of surfaces2)
- images: `public/assets/surfaces/motifs/motif-{peony,rocket}.webp`, `murals/mural-misty-pines.webp`, `paper-linen.webp`
- tests: `tests/unit/surfaces/motifPainters.test.ts`, `buildChecks.test.ts`

Changed
- `dev/surfaces-ai/generate.mjs` (FLUX.2, kinds, groups, budget guard; old MAPS/SHIPPED kept as record), `LEDGER.md`
- `tools/build-surface-maps.mjs` (motif and mural paths, group builds, id lists; 14-map option table unchanged)
- `src/render/textures/{mapKit,surfaceMaps,painters}`: `MAP_IDS` is the generated material list,
  `MOTIF_IDS`, `MURAL_IDS`, `BASE_MAP_IDS`, `designMaps()` (map, ground, motif, motif2, mural), `mapKindOf()`;
  `surfaceMaps` loads by kind on demand, `onSurfaceMapArrived()`, motif tint LRU (160), mural tint LRU (8)
- `src/render/gameView.ts`: preloads the 14 base maps, then the images of the active lot's designs; debounced
  `onSurfaceMaps` on every arrival (thumbnails repaint)
- `src/content/surfaces.ts` (adds `surfaces3`), `surfaces2.ts` (helpers exported), `package.json` (`visual:surfaces`)
- tests `mapPainters.test.ts` and `surfaces.test.ts` (generated lists, repeat up to 6 m for `mural-wall`, image params)
- `docs/ASSET_GUIDE.md`

## Adding a design end to end (content agent of group `walls-c`, for example)
1. Add sources to `dev/surfaces-ai/sources/walls-c.mjs`: `{ id: 'motif-lily', kind: 'motif', prompt: '...' }` (also `mural`,
   `material`; optional `w`, `h`, `seed`, material `build: { std, flatten, drift }`).
2. `node dev/surfaces-ai/generate.mjs --group walls-c --dry`, then without `--dry` (cached ids are skipped; ledger and budget guard).
3. `npm run assets:surfaces -- --group walls-c` (a rejected motif prints a WARNING and writes nothing; reword the prompt and
   delete its raw file to regenerate). This rewrites `surfaceMapIds.generated.ts`.
4. Add the design to `src/content/surfaces3/walls-c.ts` with `wall({...})` or `floor({...})` from `./kit`
   (painter `motif-wall`, `motif-floor`, `mural-wall`, `map-wall`, ...; image params `motif`, `motif2`, `ground`, `mural`, `map`).
   A new painter goes only in `src/render/textures/packs/walls-c.ts`.
5. `npm run visual:surfaces -- --group walls-c` (add `--palettes` for every palette large, `--ids a,b`), look at
   `dev/tasks/m10-surfaces/sheets/walls-c-<n>.png`, iterate.
6. `npm run typecheck && npm test && npm run content:check`.

## Pilot
Sources generated with `fal-ai/flux-2` (4 calls, once each, no retries): motif-peony, motif-rocket, mural-misty-pines, paper-linen.
Cost $0.0520 of the $15 budget (see LEDGER.md). Designs: `floral-peony-halfdrop` (walls-c), `mural-misty-pines` (walls-a),
`carpet-rocket-kids` (floors-c). Contact sheets: `dev/tasks/m10-surfaces/sheets/{walls-c,walls-a,floors-c}-1.png`.
Tuned while looking at them: the first motif build was garbled (sharp returns three channels after resize), scatter jitter
reduced so rockets stop overlapping, peony size and rows, linen contrast (`build: { std: 0.08 }`, keeps it near 69 kB).

## Checks
| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 131 files, 1768 tests pass |
| `npm run content:check` | 0 errors, 0 warnings |
| `npm run build` | passes (chunk size warning as before) |
| `npm run e2e` | OK |
| the 14 original `.webp` maps | rebuilt from raw, byte-identical (md5) |

## Open issues
- `blurred()` / `blurWrapped()` in the build tool read sharp's three-channel blur output as one channel; this distorts the flatten
  and drift fields. The 14 original maps were built that way and keep it (`legacyBlur`); new materials use the corrected path.
- Wall designs that name a `ground` map are repainted when it arrives, like any map; the first paint of an unloaded motif is a
  dot/diamond layout (by design).
- FLUX.2 painted murals can carry a signature in the bottom corner: the mural build trims 4 % off the bottom (`build.cropBottom`).
- Offset-and-blend makes a mural seamless by cross-fading the outer 12 % at each edge (`build.band`): the joint shows a soft ghost
  of the mural centre. Fine for foggy hills, check busier scenes on the sheets.
- Acceptance (`e2e:acceptance`) and `e2e:creator` were not rerun; only `npm run e2e` as the task asked.
- `dev/surfaces.html` still preloads only the material maps; motif and mural designs there paint flat and repaint on arrival.
