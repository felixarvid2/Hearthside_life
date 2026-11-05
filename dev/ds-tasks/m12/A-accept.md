Read dev/ds-tasks/m12/common.md first and follow it. Then read the progress files in dev/ds-tasks/m12/ (W, P, F, O)
and dev/ds-tasks/m115/ (D, S, H, B): Milestones 12 (seasons/weather, pools, outdoor life, pool venue) and 11.5
(object animations, screens, hand props, progress pill) are built. Another agent fixes render details in
src/render/objectAnim.ts and src/render/handProps.ts in parallel; do not touch those.

## Task A: acceptance steps and documentation for Milestones 11.5 and 12

1. **Acceptance.** Add two steps to `tests/e2e/acceptance.mjs` (read the existing steps and helpers first; follow the
   same style, run in all three viewports; use `window.hearthside.debug.setWeather` to make weather deterministic):
   - Milestone 11.5: a household member cooks a meal and eats it: the progress pill appears above the head, its fill
     grows over time and shows the completion state; the fridge part is open while openFridge plays and closed after;
     a hand prop exists while carrying/eating (expose read-only debug probes if needed, e.g.
     `window.__t.objectAnimState(objectId)`, `window.__t.handProps(personId)`, `window.__t.screenMode(objectId)`,
     `window.__t.pill(personId)`); a computer used for writing shows the writing screen mode and its text grows.
   - Milestone 12: seasons/weather (HUD chip text, setWeather rain greys out an outdoor activity with a reason, snow
     in winter lets Build a Snowman run), build a small pool with the build tool, a member swims and gets out through
     a ladder (never on a water tile), travel to the pool venue (Quayside Baths) and back.
   Run `npm run e2e:acceptance` per viewport (`--only=portrait`, then landscape, then desktop; desktop takes ~40 min,
   run each separately) and make all steps pass. Existing steps must keep passing; if an older step fails, find out
   whether it is caused by M11.5/M12 changes and fix the cause (not the test), or record it as a known flake only if
   it is listed as one in docs/CONTINUATION.md.
2. **Default test timeout.** Several surface painter/map tests (`tests/unit/surfaces/painters.test.ts`,
   `mapPainters.test.ts`) and `integration/floors` hit the 5 s default under parallel load. Give those tests an
   explicit realistic timeout (like the first painters test already has), not a global change.
3. **Docs.** Update docs/ROADMAP.md (M11.5 and M12 complete, current milestone line, the M12 section), 
   docs/CONTINUATION.md (state, how to test weather/pools/venue/animations, new debug hooks, known flakes),
   docs/CONTENT_STATUS.md (regenerate with `npm run content:check -- --markdown` as the progress files describe),
   docs/TEST_CHECKLIST.md (new manual checks and the acceptance totals per viewport), docs/ARCHITECTURE.md (weather
   and seasons module, pools, objectUse/objectAnim/screens/handProps/progress pill and how they derive visuals from
   running actions), docs/LICENSES.md and docs/ASSET_GUIDE.md only if something new needs it (all assets are
   code-built). Keep the docs' existing style.

Checks per common.md plus `npm run e2e:creator` and the full acceptance in all three viewports. Report the per-viewport
acceptance totals in dev/ds-tasks/m12/A-progress.md.
