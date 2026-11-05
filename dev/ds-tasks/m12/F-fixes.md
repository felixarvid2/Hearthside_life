Read dev/ds-tasks/m12/common.md first and follow it. Also read dev/ds-tasks/m12/W-progress.md and P-progress.md
(what the weather and pool agents built). Four other agents (dev/ds-tasks/m115/) are working in parallel on
render-side animations; do not touch their files (src/render/objectAnim.ts, screensView.ts, handProps.ts,
actionProgress.ts, progress pill, src/content/screens.ts) and keep edits to shared files small.

## Task F: three Milestone 12 fixes

1. **Swimmers are invisible.** In dev/ds-tasks/m12/shots/P/pool-swim-*.png only the name tag shows over the water; the
   person is not visible at all. Find why (sunk too deep in `src/render/peopleView.ts`, hidden by the water mesh
   depth/transparency/render order in `src/render/poolView.ts`, the cutaway, or the person drawn below the basin) and
   fix it so the head, shoulders and arms are clearly above the surface and the submerged body is faintly visible
   through the water. Re-shoot with `npm run visual:m12:pools` (flock as in common.md) and check the swimmer region.
2. **Regression: tests/unit/integration/travel.test.ts** "the household's own autonomy setting rules on every lot: with
   it off, guests and patrons wait for orders" fails (expected [] got ['introduce']). It passes on main. An unchanged
   copy of main is at /tmp/claude-0/-home-user/2ec7b1aa-454b-50e7-8c1b-3408dd96ca0a/scratchpad/main-ref (node_modules linked; you may run `npx vitest run tests/unit/integration/travel.test.ts`
   there and read its sources to compare; do not edit it). Root-cause it (which M12 change makes a household member
   start 'introduce' with autonomy off: weather moodlets, pool autonomy candidates, the candidate filter in
   `src/sim/autonomy.ts`, `src/sim/actions.ts` changes, visitors...). Fix the cause, not the test. If the cause is a
   real older bug that M12 only exposed (e.g. a member is pulled into a social by an NPC although autonomy is off),
   fix that bug and add a focused unit test; explain it in the progress file.
3. **Acceptance step 11 is refused by rain.** `npm run e2e:acceptance` portrait and landscape step 11 "Water the Bed
   fills the bed" fails with "It is raining." because weather is now on by default. The rule (no watering in rain) is
   right; the test must be deterministic. Make the acceptance scenario force clear weather for the steps that are not
   about weather (a debug/test hook that sets the stored current weather and today's plan, or seeding the scenario
   with a seed/day that is clear, documented in tests/e2e/acceptance.mjs), without turning weather off for the whole
   game. Run only the affected viewport steps if the script supports it, else the full portrait run.

Checks: typecheck, the travel test and all pool and weather suites, `npx vitest run` (all), content:check, build,
e2e. Progress file: dev/ds-tasks/m12/F-progress.md.
