# Meshy character test models

Generated with Meshy (https://www.meshy.ai) on 2026-11-01. `base_male_v2.glb` and `base_female_underwear.glb` are the inputs of `npm run assets:meshy`, which builds the in-game bodies `public/assets/characters/meshy_a.glb` and `meshy_b.glb` (see "In the game" below); the other files are from the feasibility test.

| File | How it was made | Credits |
|---|---|---|
| `base_male_test.glb` | text-to-3D, man in t-shirt and shorts, short hair | 30 |
| `base_male_underwear.glb` | text-to-3D, bald man in boxer briefs | 30 |
| `base_female_underwear.glb` | text-to-image (`base_female_reference.png`) then image-to-3D, bald woman in tank top and bike shorts | 3 + 30 |
| `base_male_v2.glb` | text-to-image (`base_male_v2_reference.png`) then image-to-3D, bald man in tank top and bike shorts, average build, same style as the female body; replaces `base_male_underwear` (too muscular, feet turned out) | 3 + 30 |

All are single textured meshes (~20k triangles, about 3 MB), unrigged, in T-pose. Text-to-3D ignored parts of the
prompt for the female body twice (long hair, fantasy clothing; 40 credits lost); generating a reference image first
and then using image-to-3D gives much better control and is the recommended route.

## In the game

`npm run assets:meshy` (`tools/build-meshy-bodies.mts`) turns `base_male_v2.glb` (frame a) and `base_female_underwear.glb`
(frame b) into `public/assets/characters/meshy_a.glb` and `meshy_b.glb`; `GameSettings.characterStyle` (`detailed` by
default, `classic` = the procedural bodies) chooses which one the game draws. See `docs/ASSET_GUIDE.md` (Characters) for the
pipeline and the runtime. `dev/meshy/shootLab.mjs` takes screenshots, `--plan=bench` frame-cost numbers and
`--plan=measure` posture anchors of `dev/characters.html` in either style.
`dev/meshy/shootGarments.mjs` shoots all 25 garments on both frames (front and three-quarter, contact sheets), shoulder and hem close-ups
(`--dist --ty --pitch --yaws`), `--plan=live` (walk, sit, sleep, eat at game distance), `--noskin=1` and `--outfit=` for debugging; output in
`dev/meshy/shots/garments/<tag>/`.
`--plan=hair` shoots every hairstyle (`--hairs=a,b --frames=a,b --views=front,three,side,back,drape --people=2`) close up and
`--plan=hairlive` at game distance (walk and sit); `shots/hair/before|after|live` hold the hair rework screenshots. `--hairs=ai` (the generated hairstyles of
`public/assets/characters/hair/`, see `dev/hair-ai/`) or `--hairs=all` select the styles; `--style=classic` shoots them on the procedural bodies.

## Feasibility test: Meshy body on the mannequin skeleton (dev/meshy.html)

Question: can an unrigged Meshy mesh be driven by our 65-joint skeleton and the existing clips, and how does it
compare with the procedural character? Answer: yes, with a fully automatic fit (about 1 s, offline-able).

What was built (nothing in `src/` changed):

| File | Purpose |
|---|---|
| `src/characters/meshyFit.ts` | Pure fit: orientation, landmarks, vertical warp onto the mannequin joints, arm and leg straightening, skin-weight transfer (`SkinTransfer`), seam welding, smoothing |
| `src/characters/meshyRaw.ts` | Fitted mesh as a `RawBody`, so `buildBodyTemplate`/`buildGarment`/`buildHair` can be pointed at it |
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

### Results (Chromium + SwiftShader, `dev/meshy/shots/`)

Screenshot names are `<model>_<scenario>.png`: `live_*` = game distance (ortho, 66 px/m, DPR 2, procedural person left, Meshy
right), `close_front|threeq` = portrait framing, `joints_*` = shoulders / elbows / hips / knees in bent poses,
`*_garments_*` = catalogue garments generated on the Meshy body, `*_hair*` = procedural hair on the Meshy head,
`male_8k_1024_*`, `male_5k_512_*` = decimated meshes.

- **Deformation**: clean on the two underwear bases. Shoulders, elbows, hips and knees bend without exploding vertices,
  arm-torso webbing or collapsing knees in idle, walk, jog, sit, lie, eat, wave, dance (edge stretch p99 1.3-1.8x; the
  mannequin's own skin is 1.1-1.35x). Worst places: the shoulder cap seam (3-4x, a few triangles), the crotch when seated
  (5-6x, ~20 edges between the thighs) and hem rims where the generator made a double layer 5 mm thick.
- **Fused clothing is the real cost**: the `base_male_test` tee-and-shorts mesh bridges legs at the shorts crotch, hangs the shirt
  hem on the shorts waist and stands wide-legged; it needs the leg split plus torso/leg stretching of the fit to survive
  (max stretch 8x seated vs 3-6x for the bases) and still shows layer tearing at the waist. Base-layer bodies are much better.
- **Hands are coarse** (fingers rigid on the hand bone) - fine for the shipped clips, which do not animate fingers.
- **Feet** of the male base point outward and keep that in every clip (the foot bone points straight ahead).
- **Look**: the Meshy bodies have far more detail than the procedural body (faces, ears, muscles), but a different style
  (realistic, baked light/shadow in the texture, warmer and more saturated than our flat skin shader) so they need an albedo
  pass (de-light, desaturate) and a decision about face style before mixing with procedural characters.
- **Garments over the Meshy body work mechanically**: `buildBodyTemplate(meshyRaw)` accepts the fitted mesh, all 25 garments
  and 10 hair styles build on it, and `CharacterView` runs unchanged on a `CharacterAssets` whose frame was swapped for the
  Meshy template (`garments=1`). The baked underwear/tank top shows through thin garments (black tank under a white tank),
  because the Meshy mesh has no "coverage push-in" like the skin shader. Needs a coverage mask or a nude base.
- **Hair**: the procedural caps/curls/bob/long hair sit on the Meshy skull after one box fit (x/z scale to the skull width and
  depth on the band 1.60-1.70 m, y scale to the crown). Remaining mismatches: hairline too low over the brow and covers
  the ears, because the hair builder samples the template's parametric head, not the Meshy head surface.

### Numbers

| | Meshy male base | Meshy female base | procedural (tee/trunks/hair) |
|---|---|---|---|
| triangles | 20,131 | 20,697 | ~13.5k (3 draw calls) |
| vertices (welded) | 18,288 (~10k) | 17,243 | - |
| texture | 2048 x 2048 JPEG, 2.4 MB | 2048 x 2048 JPEG, 2.3 MB | procedural |
| GLB | 3.29 MB | 3.10 MB | - |
| GPU texture memory | 22 MB (2048, mips), 5.6 MB (1024), 1.4 MB (512) | same | 0 |

Frame cost in the lab (SwiftShader, so only relative; render + readback per frame, 12-40 characters walking):

| characters | procedural | Meshy 20k tris | Meshy 8k tris |
|---|---|---|---|
| 12 | 441 ms | 484 ms | 278 ms |
| 40 | 1104 ms | 1242 ms | 564 ms |

Per character the 20k mesh costs about the same as today's procedural one (one draw call, more triangles); 8k is ~0.5x.
Animation (CPU) is the same Animator: 0.3-0.5 ms per 12 characters in both cases.

`decimate.mjs` (meshopt simplify + sharp texture resize), male base: 12k tris/1024 px = 633 kB (334 kB with meshopt
compression), 8k/1024 = 512 kB (289 kB), 8k/512 = 424 kB (202 kB), 5k/512 = 329 kB (165 kB) before skin data.
**8k + 1024 px looks fine at game distance and acceptable in close-ups** (some UV tearing on the face at portrait distance);
5k with the naive simplifier is not usable (pointed head, thin legs, noisy texture). Use an attribute-aware simplifier
or Meshy's own target polycount instead of position-only simplification.
Budget guess confirmed: ~8-10k triangles; 1024 px per person is 5.6 MB of GPU memory, so 512 px (1.4 MB) or a shared
atlas is needed if many unique Meshy people are on screen.
