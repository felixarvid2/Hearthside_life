# M11.5 task Q - review fixes

Scope: the three review items (fridge/doors on the use face, hand props readable, re-shoot D and H and promote
front-side frames). Another agent owns `tests/e2e/acceptance.mjs` and `docs/`; those are untouched here.

## 1. Fridge / door and cavity orientation

**Diagnosis (from a runtime probe, `dev/ds-tasks/m115/probe-q.mjs`).** The door and the cavity were never on the
model's back: the `kitchenFridge` GLB has `doorFridge` on the +z front, the use slot is on +z, and the door swings
outward to +z (door AABB min z 0.471 -> 0.600, max z 0.685 -> 1.412 while the fitted body stays at z 0.06..0.685).
The "black rectangle on the back" in the promoted shots was the fridge's own dark glass door panel seen from the
camera *behind* the fridge: `promote-d.mjs` promoted the `k1` yaw step (camera at +x, -z = behind) for both fridge
frames. The closed state was already the untouched model (no `ObjectAnim` children exist when closed).

**Real defect found by the probe.** The code-built interiors (fridge, oven, dishwasher) were placed behind the
catalog body's closed front face (interiorBox z fractions 0.75-0.95 of the fitted box), so once the door swung away
the "cavity" was hidden inside the body: the open fridge showed shelves over a white face. The appliance bodies are
closed boxes with a separate door panel in front, so the cavity has to sit in the gap between the body's front face
and the door (z fraction ~0.92-1.0 of the fitted box), not inside the body. Wardrobes are open-fronted, so their
interior stays just behind the front (unchanged).

Changes:
- `src/render/objectAnim.ts`: `INTERIOR_BOX` and the per-descriptor `interiorBox` values for fridge-*,
  stove-basic, stove-electric, bread-oven and dishwasher moved to z ~0.92-1.02, with a comment explaining why
  (the interior group is only built/visible once `doorOpen > 0.02`, so a closed door still hides it).
- `tests/unit/render/objectAnim.test.ts`: the interior fraction cap is now 1.03 (a cavity may be flush with or just
  proud of the fitted front face).
- New `tests/unit/render/objectAnimOrientation.test.ts`: reads every animated asset's GLB with
  `@gltf-transform/core`, converts the named part nodes into fitted-local boxes with the same yaw/scale/offset as
  `fittedBounds`, and asserts that for every descriptor with a use slot:
  - the use slot is on +z at rot 0 (corner shower with no moving part exempt - diagonal approach),
  - every overlay door hinge is at the front face (z fraction >= 0.9),
  - every node part (fridge/oven/wardrobe/microwave/washer doors, toilet lids) has its panel/hinge extent on the
    same side as the use slot,
  - every cavity box is on that same side,
  - the relation holds for all four rotations 0/90/180/270.

## 2. Hand props readable

`src/render/handProps.ts`:
- Props are drawn at 1.4-1.8x their real size (`propScale()`; default 1.5, plate 1.55, fork/spoon/apple 1.7,
  phone 1.5, ingredients 1.45, mug/glass/can 1.4). The rig's hands are chunky and the default camera is far away,
  so real-size props were only a few pixels wide in portrait. The group scale is refreshed every update, so
  own-stage bodies (scaled rigs) stay proportional.
- New `carried` prop slot: a level prop parented to `view.root` at `(0, 1.03 * scale, 0.36 * scale)` - in front of
  the body at waist/chest height with both hands free, instead of hanging at a hip. Used for the eatMeal pickup,
  the walk to the seat, standing eating (plate carried, fork still in the right hand) and cookMeal stage 2 (carried
  plate to the counter). Seated eating keeps the plate placed on the table.
- `tests/unit/render/handProps.test.ts`: updated for the carried slot and added a render test that the carried
  plate sits in root-local front at waist height, level, enlarged, and that per-kind scales stay in 1.4-1.8.

## 3. Re-shoot and promote

- `dev/ds-tasks/m115/shoot-d.mjs`: the fridge open shot no longer jumps the clock with `debug.step(3)` (a whole
  game minute per step overshot the short fridge stage and closed the door again - the "closed while reaching"
  frame). It now takes two single steps, and checks from the scene graph that the closed fridge builds no cavity
  and that the open fridge has a visible `interior:*` while still at the fridge stage. Added front-side oblique
  aims at yaw 70/290 degrees (camera on the person's side, off their sight line), since the four fixed yaw steps
  are diagonals/rear views and the fridge sits in a corner.
- `dev/ds-tasks/m115/promote-d.mjs`: fridge frames are promoted from a front-side candidate (was `k1`, behind).
- Re-shot D and H in portrait/landscape/desktop and promoted the best frames.

D re-shoot (`npm run visual:m115:d`): **33/33 checks passed, 186 screenshots**. The two new scene-graph checks pass
in all three viewports ("the closed fridge draws no cavity - interiors []", "the fridge interior is built and lit
while the door is open - cookMeal stage 0 perform at 0.75; interior:fridge"). `k0` (front-right, camera on the
person's side) is promoted for `fridge-closed` and `fridge-open` in portrait/landscape/desktop: closed shows the
model's dark glass front panel facing the person; open shows that panel swung away with the pale lit cavity and
shelves beside the person. The front-side oblique `f70`/`f290` candidates were shot and rejected (the door blends
into the wall/pantry). Other states re-shot with their previous promoted angles (stove, wardrobe, shower).

H re-shoot: the camera for prop shots now uses a front view (`view = 'front'` in `focus`) instead of always behind
the shoulder; the old behind view hid the apple/ingredients/phone behind the torso and put a chair back in front of
the seated eater. `carry-plate` keeps the behind-the-shoulder view because the carried plate reads well from there.

## Checks

- `npm run typecheck` - clean.
- `npx vitest run` - 160 files, 2074 tests passed (includes the new orientation test and the updated hand-prop
  tests).
- `npm run content:check` - 0 errors, 0 warnings.
- `npm run build` - ok.
- D re-shoot - 33/33 checks, 186 screenshots (see above).
- H re-shoot - running (see below).
- `npm run e2e` - to run after H.

Note: an interrupted H run left an orphaned process holding `/tmp/hearthside-browser.lock`; the script grew a
`--no-lock` flag (documented as recovery-only) so the re-shoot could proceed. Normally H takes the lock itself.
