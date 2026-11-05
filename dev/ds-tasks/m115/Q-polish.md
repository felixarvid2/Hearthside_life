Read dev/ds-tasks/m115/common.md first and follow it, then the progress files D-progress.md, H-progress.md,
S-progress.md and B-progress.md in dev/ds-tasks/m115/ (what was built). Another agent writes the acceptance step and
docs in parallel (tests/e2e/acceptance.mjs, docs/); do not touch those.

## Task Q: review fixes for Milestone 11.5 (a reviewer looked at the screenshots)

1. **The fridge opens on the wrong side.** In dev/ds-tasks/m115/shots/D/desktop-fridge-closed.png and
   desktop-fridge-open.png the camera sees the fridge from behind and a black rectangle (the open cavity) is drawn on
   the fridge's *back*, while the person stands at the front; it is there in the "closed" shot too. In
   desktop-fridge-open-k0.png (camera at the front) the door is closed while the person reaches in. So the overlay
   door/cavity in `src/render/objectAnim.ts` is placed on the wrong face (the model's front is probably -Z or +Z
   opposite to what the descriptor assumes, or the object rotation is applied twice/not at all), and the closed state
   still shows the cavity. Fix it for every rotation (0/90/180/270): the door must sit on the face the person uses
   (the side of the object's interaction slot/approach tile, see the slots in `src/content/objects.ts` /
   `src/world/slots.ts`), the closed state must look exactly like the untouched model, and the open state must show
   the door swung on its hinge with the lit interior facing the person. Add a unit test that, for each rotation,
   the door hinge/cavity is on the same side as the use slot. Check the same for the oven door, wardrobe doors,
   microwave/dishwasher/washer and the toilet lid.
2. **Hand props are too small to read.** In dev/ds-tasks/m115/shots/H/*.png the vegetables, apple, plate, fork and
   phone are a few pixels wide at the default zoom. Scale props up so they read at the default camera distance in
   portrait (roughly 1.4-1.8x, keep proportions believable next to the hand), make sure the fork is visible while
   eating, and the plate is carried in front of the body at waist/chest height with both hands or one hand under it,
   not hanging by the hip.
3. Re-shoot D and H with their scripts (`npm run visual:m115:d` and the H script) in all three viewports and verify
   fridge closed vs open from a camera on the person's side (the shot must have the camera on the front), plus the
   other D states. Promote the best frames.

Checks per common.md. Progress file: dev/ds-tasks/m115/Q-progress.md.
