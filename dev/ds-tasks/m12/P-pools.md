Read dev/ds-tasks/m12/common.md first and follow it.

## Task P: pools (build tool, geometry, swimming, outfits)

Brief: "Pools require actual swim paths or activity areas, safe entry/exit links, suitable outfits, and a clear
interaction lifecycle. A decorative blue rectangle is not a completed pool system." (docs/DESIGN_BRIEF.md section 19).

1. **Data and building.** A pool is a rectangle of tiles on level 0 outdoors (or indoors in a room on level 0), at
   least 2x3 tiles, up to 12x12, not overlapping walls, objects, stairs or other pools, not under an upper floor.
   Add it to the lot state as an optional field and to the build commands in `src/building/` with undo/redo and cost
   (price per tile, refund on delete), following how floors/terrain paint/fences are built. Add a "Pool" tool to the
   Build mode exterior section of the UI (drag a rectangle like the room tool; Confirm/Cancel on touch as the other
   drag tools do) and delete. Two or three pool styles (tile colour, coping stone) as content.
2. **Entry/exit.** Every pool gets a ladder or steps at one or more edge tiles (auto-placed on a short side, the
   player may move it), which are the only links between the deck and the water. Navigation: water tiles are
   blocked for walking; a person enters/leaves only through a ladder link. Make sure the lot reachability validation
   in `src/world` treats a pool correctly (deck around it reachable; the pool does not cut off the house).
3. **Swimming lifecycle.** Interactions on the pool: "Swim" (walk to a ladder, change into a swim outfit if the
   person has one or a default swimsuit otherwise, climb in, swim laps along a path inside the water for the chosen
   time, climb out at the nearest ladder, change back), "Relax in the Pool" (float in place, fun + comfort), and a
   "Get Out" that works at any moment (cancelling an action must always bring the person out through a ladder, never
   leave them standing in water or teleport). Effects: fun, hygiene a little up, energy down; fitness/athletics skill
   xp if that skill exists. Gate by life stage (babies and toddlers cannot swim; children only with... keep it simple:
   child and up can swim) and by weather when the weather gating exists (another agent adds
   `InteractionDef.weather`; if it is in the code when you get there, mark outdoor pools as not in snow).
   Autonomy may choose to swim for fun.
4. **Outfits.** Use the 'swim' outfit category that already exists in `src/content/character.ts`; make sure every
   life stage that can swim has at least one swimwear garment (add a couple of simple original swimwear garments if
   stages are missing, following how garments are defined and built), and the outfit switch shows on the person.
5. **Rendering.** Pool basin (walls, floor, coping), water surface with a cheap animated shader (subtle waves,
   caustic-like pattern, transparent enough to see the floor), ladder model, people drawn partly submerged while
   swimming (a swim pose/animation from the existing animation set; if there is none, a simple procedural stroke on
   the existing skeleton is fine). Keep it cheap on phones.
6. **Tests.** Unit tests for build rules (size, overlap, under floors, undo/redo, refund), nav (water blocked, ladder
   link), interaction lifecycle (swim -> leave through ladder; cancel mid-swim exits safely; nobody ends on a water
   tile after any action), a headless playtest of a household with a pool over 3 days with autonomy. Screenshots of a
   built pool with someone swimming in all three viewports.

Do not do weather/seasons or new venues (other agents). Progress file: dev/ds-tasks/m12/P-progress.md.
