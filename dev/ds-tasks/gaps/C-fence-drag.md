# Task C: the Fence tool builds only one straight run per drag

Progress file: `dev/ds-tasks/gaps/C-progress.md`.

Background: Milestone 9 exteriors. The Fence build tool lives in `src/ui/build/exteriorTools.ts` (with `exteriorHints.ts`, `exteriorThumbs.ts`), plans/commands in `src/building/exteriorPlans.ts` and `src/building/exteriorCommands.ts`, edge logic in `src/world/fences.ts` and `src/world/fencePieces.ts`. Read the "Exterior" section of `docs/ARCHITECTURE.md`. Compare with how the Wall tool handles drags in `src/ui/build/structureTools.ts`.

Today one drag gives one straight run along a single row or column. Make fence drawing as convenient as walls:
1. **L-shaped drags**: a drag whose end is off the start's row and column builds two runs (along x first, then along z, or follow the drag's dominant direction first), previewed together with one total length and price, confirmed once, charged once (one `transact`), and undone/redone as one step.
2. **Rectangle mode**: holding Shift on desktop, or a "Rectangle" toggle in the Fence tool panel (needed for touch), draws the four sides of the dragged rectangle as one fence loop. A gate placed afterwards still works. The safety rules (a fence that would seal a person in or cut part of the house off is refused with "Add a gate.") apply to the whole set; the refusal names the problem as today.
3. Existing behaviour stays: a straight drag still makes one run; existing gates and identical fences on the path are kept; edges with walls are skipped as today.
4. Touch: on phones the drag preview waits for Confirm, as it does now. The preview text shows the total metres and cost (for example "Build 14 m of picket fence · Cost $168").
5. Unit tests in `tests/unit/building/exteriorTools.test.ts` / `exterior.test.ts`: L-drag makes both runs and one transaction; rectangle makes a closed loop; undo restores the money exactly and removes all pieces; refusal when the loop would enclose a person without a gate; a straight drag is unchanged.
