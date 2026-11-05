Read dev/ds-tasks/m115/common.md first and follow it.

## Task H: things in hands, and the food flow from fridge to mouth

People use a shared Quaternius rig (`src/characters/animation.ts`: `ANIM_CLIPS`, `SEATED_CLIPS`, `LYING_CLIPS`;
`src/characters/stagePose.ts`, `posture.ts`), rendered in `src/render/peopleView.ts`. There are no hand-held props
today (only carrying a baby). The sim names animations via `setAnim` (`src/sim/context.ts`) from interaction `anims`
(`src/content/interactions.ts`) and stage code (`src/sim/cooking.ts`: stage 0 fridge `openFridge`, stage 1 stove
`cook`, stage 2 serve `pickUp`; `eatMeal` = `pickUp` then `eat`; `grabSnack` = `openFridge` then `eat`).

1. **Hand attachment.** New module `src/render/handProps.ts`: find the right and left hand bones of the rig, attach a
   prop group to a hand bone with a per-prop grip offset/rotation (data table), one prop per hand at most, shared
   geometries/materials (code-built, low-poly). The prop follows the skeleton, so it moves with the clips (e.g. the
   `Consume` overlay brings the food to the mouth). Works for all life stages that can do the action (scale with the
   person) and with seated overlays.
2. **Prop rules.** A pure function `propsFor(person, action, anim, clock, items)` -> { right?: PropSpec; left?: PropSpec }
   (unit-tested) decides what is held:
   - grabSnack: during `openFridge` the snack appears in the hand at ~60% of the reach (it was taken out of the
     fridge); then `eat`: the snack (sandwich, apple, yoghurt cup with spoon - pick deterministically from the action
     id, or record `data.snack` in the sim if you prefer, optional field) is eaten - it shrinks in bites over the
     action and is gone at the end.
   - cookMeal: stage 0 the person takes ingredients out (a small food pack/vegetables in hand at ~60% of the fridge
     reach), carries them to the stove (hand prop while walking), at the stove holds a spatula/wooden spoon during
     `cook` (the pan itself is drawn on the hob by task D - do not draw a pan), stage 2 serve: holds a plate with the
     meal while carrying it, and the plate disappears from the hand at the moment the meal item appears on the
     counter/table.
   - eatMeal: `pickUp` -> the plate (with the meal colour/shape of that recipe, from the served meal item) is in the
     hand while walking to the seat; seated or standing `eat`: the plate is put down on the table/counter in front of
     the person (or held in the left hand if standing with no surface) and a fork is in the right hand going to the
     mouth with the `Consume` overlay; the food portion on the plate shrinks with `elapsed/duration` (or with the
     hunger fill for untilFull) and the plate is empty at the end, which then matches the dirty-dish item that
     already exists. Served meal items and plates are drawn procedurally in `src/render/objectsView.ts`
     (around lines 50-57); you own the meal-item drawing there: make the food portion scale with how much is eaten
     (add an optional `data`/item field such as `eaten` 0..1 in the sim only if the renderer cannot derive it from the
     eating action) - keep the edit small, task D also edits objectsView.ts.
   - Other everyday props: `read`/readBook/readSkillBook -> open book; `phone` anim and phone* interactions -> phone
     with a lit screen; drinks if any drink interaction exists (coffee/juice/water) -> mug/glass; `water` -> watering
     can; `clean` -> sponge/spray bottle; `kneelFix` -> wrench; brushing teeth if it exists -> toothbrush; fishing ->
     a rod if not already drawn. List every mapping in your progress file.
   Props appear/disappear only at sensible moments (never pop while the hand is far from where it was taken), are
   removed when the action is cancelled, and are never shown on people off the visible lot.
3. **Hook** into `src/render/peopleView.ts` with minimal additions (create/update/dispose per person view). Do not
   change the overhead overlays there (task B adds the progress pill).
4. **Tests.** Unit tests for `propsFor` across the stages above (timings, bite shrink, cancellation, mid-action load,
   standing vs seated eating) and for the meal-portion function.
5. **Screenshots** in all three viewports, camera close: taking food out of the open fridge, eating a snack mid-way,
   carrying a plate, eating seated at a table at 20% and 80% (portion visibly smaller), reading a book, on the phone.

Do not do furniture moving parts (task D), screens (task S) or the progress pill (task B). Progress file:
dev/ds-tasks/m115/H-progress.md.
