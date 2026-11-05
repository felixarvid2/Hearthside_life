# Task C: Cook a Meal across floors

State: done. All checks below pass; no browser test was run (another agent held the browser), as instructed. The
supervisor commits this worktree.

## Cause

`cookMeal`'s availability (`cookBehavior.check`) already used `stovesOn`, which walks `lotObjects(...)`, i.e. the
levels the staircase connects - so a downstairs stove was listed as reachable and the option was offered from an
upper floor. Execution, however, planned its routes through `pickUsePoint`, which passed the goal tile to
`planRoute` **without a level**. `NavProvider.findPath(lotId, level, from, goals)` treats a goal with an absent
`level` as lying on the person's own floor, so from upstairs:

- the fridge/stove/counter on the ground floor was "unreachable" (`Can't reach the everyday fridge.` - the
  acceptance-run cancellation), and
- worse, a ground-floor object could resolve onto the tile directly above it, making the action "succeed" on the
  wrong floor (a probe with the annex above the kitchen did exactly that before the fix).

Availability and execution disagreed because the check looked across floors while routing did not.

## Changes

- `src/sim/steps.ts:91-98` - `candidateLevel(c)`: the absolute floor of a use point (slot `level`/`approach.level`,
  or tile `level`; absent = 0). `pickUsePoint` now ranks by it and passes it explicitly to `planRoute`
  (`src/sim/steps.ts:191-199`), and takes `preferLevel` so a candidate on the person's own floor wins over a closer
  one in plan view (`:168`). This is the root fix and benefits every action that routes to a use point.
- `src/sim/cooking.ts:67-84` - `stovesOn` is documented as the single reachability predicate and returns the
  usable stoves on the person's floor first, then the nearest on other connected floors (stable id tie-break). It
  still lists broken stoves only when asked, so `check` keeps its `'The stove is broken.'` / `'Needs a stove.'`
  distinction (`src/sim/cooking.ts:185`). Availability, autonomy and the chain all go through this one function.
- `src/sim/cooking.ts:195-200` - `cookBehavior.reserve` collects use points from all `stovesOn` results and picks
  one from the cook's own position with `preferLevel: loc.level` (not from the fridge, which would let a nearby
  downstairs stove win by accident).
- `src/sim/cooking.ts:257` - the serving-counter search also gets `preferLevel: loc.level` so a cook at a
  downstairs stove serves onto a counter on that floor.
- `src/sim/cooking.ts:320` and `src/sim/housework.ts:98` - floor-item use points (a meal on the floor, dishes)
  carry `item.position.level`, so eating/cleaning routes to the item's actual floor instead of assuming the
  person's.

No state fields were added; the sim stays deterministic (no new randomness).

## Tests

`tests/unit/integration/cook-floors.test.ts` (new): starter home with a second storey over the kitchen end and a
staircase, fridge and stove left downstairs.

1. `cooks from an upper floor and eats` - member placed upstairs; the option is enabled; queueing succeeds and the
   first tick reserves the downstairs stove (`data.stoveObj`); the chain completes, a meal exists at `level 0`,
   the cook ends on level 0 and then eats it.
2. `does not offer cookMeal when there is no stove on any floor` - stove sold; the entry is still listed but
   `enabled === false` with a `/needs a stove/i` reason; `core.queue` refuses with the same reason; no cookMeal
   action is left and no meal is produced.
3. `prefers a stove on the cook's own floor` - a second stove placed upstairs; the reserved stove is the upstairs
   one, although the downstairs stove is reachable.

`tests/unit/integration/floors.test.ts` - the two walks in the walk-upstairs test and the two in the
staircase-sale test now await the `goHere` itself (`walk()` helper) instead of `person.queue.length === 0`. This is
a consequence of the fix, not a change of intent: autonomy runs in the same tick a walk finishes and, with
cross-floor cooking now working, a member upstairs may queue `cookMeal` and walk down; the old loops then waited
for that cook and the walker was no longer upstairs (the sale check passed for the wrong reason). The helper stops
at the walk's own end and cancels the follow-up, so the tests assert what they mean - the walk ended on level 1
with nobody left on the stairs.

## Checks

- `npm run typecheck` - clean.
- `npx vitest run` - 161 files, 2077 tests passed.
- `npm run content:check` - 0 errors, 0 warnings.
- `npm run build` - built (only the existing large-chunk warning).
- Browser work (`npm run e2e`, acceptance, visual scripts) deliberately not run here.
