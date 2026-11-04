Read dev/ds-tasks/m115/common.md first and follow it.

## Task D: moving parts and "in use" states on furniture and appliances

Furniture is loaded from GLB files (`src/render/objectAssets.ts`, manifest `public/assets/manifest.json`, fitting in
`src/content/objects.ts`, per-object groups in `ObjectsView.addEntry`/`sync` in `src/render/objectsView.ts`). No code
looks up sub-nodes today.

1. **Find the parts.** Write a small node script (under `dev/ds-tasks/m115/`) that lists the node/mesh tree and bounds
   of the GLBs below. Where a door/lid is a separate node, pivot that node. Where it is not, use an *overlay part*: a
   code-built panel matching the front face (same material/colour, flush, so the closed object looks unchanged); when it
   opens it swings on its hinge and reveals a code-built interior (dark box, shelves, a few food boxes/bottles, cool emissive light in the fridge; racks and an
   orange emissive glow in the oven). Put all of this in a new module `src/render/objectAnim.ts` (part descriptors per
   defId or per asset name: hinge axis, pivot, open angle, open/close timing) with a pure "target openness for this
   object at this time" function that you unit-test.
2. **Drive it from use.** Use `objectUses(state)` (`src/render/objectUse.ts`) and the person's anim:
   - Fridge (`kitchenFridge` and any other fridge defs): door opens while the person plays `openFridge` (cookMeal stage
     0, grabSnack, any other fridge interaction), stays open while they reach in, and closes when the anim ends.
     Opening and closing each take about 0.4 s real time at 1x (clock minutes plus frame interpolation).
   - Stove/oven: burner rings glow (emissive orange ring meshes on the hob) and a pan/pot sits on the hob while `cook`
     runs; a little steam (one shared small Points/sprite set, capped, off with reducedMotion) rises; the oven door
     opens briefly at the start of cooking for baking recipes if the recipe data says it is baked, otherwise not.
   - Microwave, dishwasher (washDishes if it targets one), washing machine if any: door opens at start/end, interior
     light/drum rotation while running.
   - Wardrobe/dresser (`bookcaseClosedDoors` and other wardrobe defs used by changeOutfit/editOutfits): doors open
     while changing outfit.
   - Shower (takeShower): a cheap falling-water effect (a few stretched transparent quads or a small Points set,
     animated UV) plus a faint steam haze; off when not in use. Bath (takeBath): water surface appears in the tub.
   - Sink/washHands/washDishes: a thin water stream from the tap.
   - Toilet (useToilet): lid up while used, down after.
   - Bed: covers stay; nothing needed unless trivial.
   - TV and computer screens are task S (do not draw screens). Lamps keep their night logic.
   List every interaction and object you animate in your progress file with the trigger it uses.
3. **Rendering rules.** Animate in `ObjectsView.animate` (or a sibling called from it) with dt, only for objects on
   the visible lot; parts tween with an ease and snap when reducedMotion. Do not rebuild object groups (the `sync`
   signature must not change when a door opens). Cutaway/wall-hiding and picking (raycasts on objects) must keep
   working: overlay parts must be pickable as part of the object or excluded from picking consistently.
4. **Tests.** Unit tests for the part descriptors (every animated def has a valid descriptor) and the openness
   function (closed before, opening, open, closing, closed after; mid-action load; reduced motion snaps; 3x speed).
5. **Screenshots** in all three viewports: fridge closed vs open with a person at it, stove cooking (glow + pan +
   steam), wardrobe open, shower running.

Do not do hand props (task H), screens (task S) or the progress pill (task B). Progress file:
dev/ds-tasks/m115/D-progress.md.
