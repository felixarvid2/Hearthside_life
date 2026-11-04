You are working in the repository at the current directory: Hearthside Life, a Three.js/TypeScript/Vite life sim.
Read docs/CONTINUATION.md first (state, checks, conventions). git, curl and rm are blocked; a supervisor commits.

## Task: make acceptance step 7 (and one step-2 check) pass again after the M10 surface catalog grew

The M10 work grew the wall catalog from 50 to 360 designs and floors from 32 to 200 (src/content/surfaces3/*,
painters in src/render/textures/packs/*, maps loaded on demand by src/render/textures/*). Every other check is green
(typecheck, test, content:check, build, e2e, e2e:creator). `npm run e2e:acceptance -- --only=portrait` now fails:

```
FAIL [portrait] 7 painting the new wall changes only the side facing the camera -- {"side":"b","design":"botanical-dandelion-drift","palette":"white-fern"} {"a":{"designId":"plain-paint","paletteId":"warm-linen"},"b":{"designId":"plain-paint","paletteId":"warm-linen"}}
FAIL [portrait] 7 second side: the west wall is under the tap point -- {"kind":"wall","wallId":"0:h:9:1","side":"b","tile":{"x":9,"z":1},"level":0}
FAIL [portrait] 7 the other side of the same wall takes its own finish -- second: null
```
and landscape fails the same two "second side"/"other side" checks (there the first paint worked) plus
`FAIL [landscape] 2 neighbour: visible to tap -- point null not on free canvas`.
These all passed on main before the M10 surface catalog. The test code is tests/e2e/acceptance.mjs around lines
1960-2012 (paintSide, idxOf) and line 732 (pointFor / "visible to tap").

Find the real cause and fix it in the game code (preferred) or, only if the test makes an assumption that the bigger
catalog legitimately broke, in the test. Ideas to check, not conclusions: the paint picker now has hundreds of cards
(idxOf walks every card with page.evaluate: slow? does scrolling the card into view move/cover the canvas or leave the
panel in a state where the tap lands on UI?), on-demand map loading (does the first tap on a design whose detail map is
not loaded yet get dropped or deferred?), frame time after a wall with a motif/map is repainted (does the camera turn
not finish before pointFor runs?). Never loosen a check just to make it pass, never skip a step.

Fast loop: `node tests/e2e/acceptance.mjs --only=portrait --steps=7 --fast-start --out=tests/e2e/out/ds-step7`
(add `--no-build` after the first run if src did not change). Do not wrap tests/e2e/*.mjs in flock; they take
/tmp/hearthside-browser.lock themselves. For the landscape step-2 check use `--only=landscape --steps=2 --fast-start`.
When step 7 passes in portrait and landscape, run `npm run typecheck` and `npx vitest run` and then the full
`npm run e2e:acceptance -- --only=portrait` once.

Write what you found and changed (cause, files, results of each run) to dev/ds-tasks/m10/A-progress.md as you go.
Do not touch src/content/surfaces3/, src/render/textures/packs/ or dev/surfaces-ai/ (another agent works there).
