# Meshy character test models

Generated with Meshy (https://www.meshy.ai) on 2026-11-01 for the character feasibility test. Not shipped in the game yet.

| File | How it was made | Credits |
|---|---|---|
| `base_male_test.glb` | text-to-3D, man in t-shirt and shorts, short hair | 30 |
| `base_male_underwear.glb` | text-to-3D, bald man in boxer briefs | 30 |
| `base_female_underwear.glb` | text-to-image (`base_female_reference.png`) then image-to-3D, bald woman in tank top and bike shorts | 3 + 30 |

All are single textured meshes (~20k triangles, about 3 MB), unrigged, in T-pose. Text-to-3D ignored parts of the
prompt for the female body twice (long hair, fantasy clothing; 40 credits lost); generating a reference image first
and then using image-to-3D gives much better control and is the recommended route.

## Feasibility test: Meshy body on the mannequin skeleton (dev/meshy.html)

Question: can an unrigged Meshy mesh be driven by our 65-joint skeleton and the existing clips, and how does it
compare with the procedural character? Answer: yes, with a fully automatic fit (about 1 s, offline-able).

What was built (nothing in `src/` changed):

| File | Purpose |
|---|---|
| `dev/meshyFit.ts` | Pure fit: orientation, landmarks, vertical warp onto the mannequin joints, arm and leg straightening, skin-weight transfer (`SkinTransfer`), seam welding, smoothing |
| `dev/meshyRaw.ts` | Fitted mesh as a `RawBody`, so `buildBodyTemplate`/`buildGarment`/`buildHair` can be pointed at it |
| `dev/meshy.html`, `dev/meshy.ts` | Viewer: procedural character (left) next to the Meshy one (right), same clips, live camera (`CameraRig` defaults: ortho, pitch 37 deg, 66 px/m, the game's `Lighting` at noon) and close-up cameras |
| `dev/meshy/shoot.mjs` | Playwright screenshots into `dev/meshy/shots/` (`--bench` also times frames) |
| `dev/meshy/stretch.mts` | Node-only pose check: edge stretch per clip, with the mannequin's own skin as reference; `softrender.py` draws the dumps without a browser |
| `dev/meshy/templateProbe.mts` | Builds the body template, garments and hair on the Meshy mesh and compares landmarks |
| `dev/meshy/decimate.mjs` | 12k / 8k / 5k triangle variants x 1024 / 512 px texture, plus a meshopt-compressed size |
| `tests/unit/characters3d/meshyFit.test.ts` | Fit and generator checks on the three GLBs |

URL parameters: `model=male|female|test`, `clip`, `view=live|front|threeq|full|shoulders|elbows|hips|knees`,
`garments=1` (generated garments fitted to the Meshy body), `hair=<id>` (procedural hair refitted to the head), `glb=`,
`tex=<px>`, `wire=1`, `bind=1`, fit options (`sigma`, `smooth`, `girth`, `armScale`, `legs=0`, `split=0`).

Fit, in order: (1) facing from the toe direction; (2) the **leg gap** (rows where the middle between the legs is empty)
gives the crotch height and the body axis; (3) the arm centre line gives the arm height; (4) a piecewise vertical warp puts
crotch, arm line and total height (1.8 m) onto the mannequin's joints (head keeps its proportions); (5) arms are
straightened onto the T-pose arm line and lengthened to the mannequin's hand; (6) leg centre lines are moved onto the
leg bones (the male base stands with feet 10 cm wider than the hips); (7) triangles that bridge the two legs below the
crotch are dropped; (8) per-vertex Gaussian transfer from the mannequin with arm / trunk / head / leg-per-side filters
(fingers collapsed onto the hand bone); (9) weights shared across UV seams and smoothed 4 passes.
