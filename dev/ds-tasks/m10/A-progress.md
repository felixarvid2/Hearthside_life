# M10 acceptance step 7 (and step 2 check): cause and fix

State: 2026-11-04, branch `ccr-333d8ff5-slv7qa` (M10 surfaces work in progress in `src/content/surfaces3/`,
`src/render/textures/packs/` and `dev/surfaces-ai/`; untouched by this task).

## Symptom

`npm run e2e:acceptance -- --only=portrait` failed step 7:

- "painting the new wall changes only the side facing the camera": pick returned the west wall and a finish was
  selected, but the lot state still had `plain-paint` on both sides.
- "second side: the west wall is under the tap point": the point returned by `pointFor(T, 'wall', westWall)` at the
  turned camera picked a different wall (e.g. `0:h:9:1`).
- landscape: same "second side"/"other side" pair plus "2 neighbour: visible to tap" `point null`.

## Findings

Two independent causes, both in code the bigger catalog only exposed by changing frame timing and panel height:

1. **Camera turn accumulation bug (`src/render/cameraRig.ts`, real game bug).**
   `rotate(dir)` computed the new target from `this.yaw`, the *animated* angle. A second "Turn right" that arrived
   while the first 0.42 s turn was still animating restarted from the mid-turn angle, so two quick taps produced
   about 90°+ instead of 180° and left the camera off the 45° grid for good (measured 137.8° instead of 225°, then
   317.8° instead of 405°). The test's "turn the view half way round" therefore did not turn half way round, and the
   west wall was seen from the wrong side/occluded by another wall. Frame cost changed by the larger catalog is what
   made the second tap land mid-turn often enough to show up.
   Fix: accumulate from the pending turn's destination (`this.turn ? this.turn.to : this.yaw`), animate from the
   current angle to that accumulated target. Added two unit tests in `tests/unit/render/cameraRig.test.ts`
   (two quick turns = 180°, quick opposite taps cancel).

2. **Pan gestures swallowed by the HUD (`tests/e2e/acceptance.mjs`, helper bug).**
   `pointFor()` panned the camera with a drag that started at `freeCentre - delta/2`. In portrait the camera HUD
   cluster sits over the middle of the free strip (it covers the point where the west wall projects after the
   panel's reveal/zoom). When the drag started on the cluster, the canvas never received `pointerdown`, the camera
   did not move, and `pointFor` returned the same covered point after all eight attempts. `paintSide()` then tapped
   that point twice; both taps landed on HUD buttons and no paint was applied. Instrumented runs showed the point
   constant at `{x:247.6,y:284.6, free:false}` with the rig target unchanged, while the covering element was
   `tool-btn hud-tool centre-btn`.
   Fix in the helper (not a loosened check): the drag start is now chosen from candidate points and verified with
   `document.elementFromPoint(...).id === 'game-canvas'` (fallback: the free centre itself, which `freeCentre()`
   sampled as free), and the drag end is clamped to the viewport. The test still asserts the wall is under the tap
   point and that the finish changed; no check was weakened or skipped.

The on-demand detail maps were not the cause: the failing paint never reached the game (the `paintApply` command was
not run), so map loading could not have dropped it. No change was needed in `surfaceTextures`/`surfaceMaps`.

## Files changed

- `src/render/cameraRig.ts` - `rotate()` accumulates the pending turn.
- `tests/unit/render/cameraRig.test.ts` - two rotate tests.
- `tests/e2e/acceptance.mjs` - `pointFor()` starts its camera pan on verified canvas.

## Runs

| Run | Result |
|---|---|
| portrait step 7, before fix (instrumented) | reproduced both failure modes: pick `0:h:9:1` on the turned camera (wrong yaw), and `p.free:false` under the HUD centre button (pan swallowed) |
| portrait step 7, after rotate fix only | 2 runs: first passed; second failed both paints -> led to cause 2 |
| portrait step 7, after both fixes | 37/37 passed, 2 runs |
| landscape step 7, after both fixes | 37/37 passed |
| `npm run typecheck` | clean |
| `npx vitest run` | 140 files, 1855 tests passed |
| full `npm run e2e:acceptance -- --only=portrait` | 312/315; all step 7 checks pass, step 2 neighbour checks pass. The 3 failures are outside this task: 2 "roommate (own shift) was paid" (Sage/athletics did not autonomously attend the 06:00-10:00 shift on day 0, so no wage entry) and 2 "the finished article was sold" (freelance `writeArticle` failed with "Can't reach the desktop computer", then other reachability failures). Neither touches surfaces or the camera; both look pre-existing/autonomy-and-path flakes. |
| full `npm run e2e:acceptance -- --only=landscape` | **313/313 passed**. Step 2 neighbour checks pass (`free for social after 167 ticks`, tap point picks `per_30`), both step 7 paint-side checks pass, no page/console errors. |

## Step 2 neighbour check

`--only=landscape --steps=2 --fast-start` passes the neighbour checks in every run here ("free for social after
ticks 21/45", tap point picks the person). The fast-start household has no career, so that shortcut run fails the
unrelated "Go to Work" checks; those are an artifact of `prematureHouseholds()[first 2-member]` and not part of this
task's step-7 failure.

The reported "neighbour: visible to tap -> point null" means `view.personPosition()` returned null, i.e. the NPC was
no longer on the lot at tap time: the test waits up to 120 game minutes for a free social option, while a first visit
only lasts 120-180 game minutes (VISIT_MIN/MAX_MINUTES), so a long wait can outlive the visit. No surface-catalog link
was found. In the full landscape acceptance run the wait took 167 ticks (about 42 game minutes) and every neighbour
check passed, so this remains a timing flake rather than a catalog regression; deliberately not loosened.

## TokenEconomizer / commit

`bash tools/te-save.sh` needs approval in this sandbox and was not run; the supervising session commits, so run it
before the last commit (CLAUDE.md).
