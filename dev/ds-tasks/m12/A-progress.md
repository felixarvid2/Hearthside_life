# Task A: acceptance steps and documentation for Milestones 11.5 and 12

State: in progress (acceptance runs per viewport under way). Step 13 now picks a member who is on the kitchen floor
after step 11, or walks the chosen one down first: Cook a Meal's check only accepts a stove on the actor's own level,
while the option is offered from any floor, so in the full run the action was cancelled on its first tick upstairs.

Three causes found by the full runs and fixed in the app/script:

- **Portrait room preview drag.** Step 11 occasionally failed with Confirm disabled ("Draw or tap something first."):
  `framePair` accepted a camera placement whose corner was 12 px above the build sheet. That point is canvas on the
  exact pixel but the floating floor selector (`.level-select`, 44 px tall) covers it a moment later, so the synthetic
  touch pressed a HUD button and no pointer event reached the canvas. `framePair` and `framePairAt` now accept only
  placements with a 16 px ring of canvas around both points, and the portrait build step drags once more when the
  sheet is still on its plain hint.

- **Build tool tabs.** Eleven tool tabs in one 380 px row meant Fence, Garden and Pool sat outside the panel, and the
  last tabs could not be clicked (desktop step 11's exterior section failed on Fence, step 14 on Pool, even after
  scrolling the strip).
  `src/ui/build/build.css` now wraps `.bb-tool-tabs` onto two rows, so every tool is on screen and reachable.
- **HUD chip poll.** The 250 ms HUD timer can be starved for several seconds by a big SwiftShader screenshot, so the
  first step-14 chip check could read a stale label; `waitSky` now polls for up to 20 s instead of 6 s.

After the fix, desktop step 14 passes end to end (weather, snowman, Build/Pool tab, pool built and paid for, swim,
Get Out on the deck, Quayside Baths and back) in a targeted `--steps=14 --fast-start` run.

## What was added to `tests/e2e/acceptance.mjs`

- **Step 13, Milestone 11.5** (`stepAnimations`): one household member cooks a meal and eats it. The step reads only
  the allowed probes: `window.__t.objectAnimState` (fridge door open while the reach-in plays, closed again at the
  stove), `window.__t.handProps` (ingredients bag, spatula, carried plate, plate on the table and fork in hand, all
  put away at the end), `window.__t.pill` (appears above the head, fill grows, "Eat complete" state) and
  `window.__t.screenMode` (writing screen on with growing text, off when the piece is finished). The door read happens
  one sim tick after the first frame of the stage, because the tween is seeded from the game clock and at speed 0
  render frames do not advance it.
- **Step 14, Milestone 12** (`stepWorldM12`): `window.hearthside.debug.setWeather` pins rain and clear weather for
  deterministic checks. The step checks the HUD chip (season, day and weather), an outdoor activity greyed with
  "It is raining." and enabled again in clear weather, winter snow with a snowman built and the snow still on the
  ground after clearing, the Build Pool tab with its three styles, a small pool built and paid for with a ladder left
  in place, a member swimming and getting out through the ladder without touching a water tile, and travel to and
  from the Quayside Baths venue.
- The self menu is reached with a person pick (`{ kind: 'person', personId }`), since `PickResult` has no `'self'`.
  The HUD chip is polled (it refreshes on a 250 ms timer and skips while the page is hidden or off the game route).

## Default test timeouts

Explicit, realistic timeouts instead of a global change:

- `tests/unit/surfaces/painters.test.ts`: 30 s for the determinism, layout and thumbnail cases.
- `tests/unit/surfaces/mapPainters.test.ts`: 30 s for both slow cases.
- `tests/unit/integration/floors.test.ts`: 20 s for the support cases and 60 s for the long save/reload case.

## Acceptance totals

| Viewport | Steps 13, 14 (targeted `--steps=13,14 --fast-start`) | Full run (steps 1-14) |
|---|---|---|
| portrait 390x844 | 43/43 | 358/358 (rerun on the final tree, 26 min) |
| landscape 844x390 | 43/43 | running |
| desktop 1280x720 | running | running |

## Other checks

| Check | Result |
|---|---|
| `npm run typecheck` | pass (on the tree with the parallel M11.5 review fixes; re-run before the final commit) |
| `npm test` | pass: 160 files / 2074 tests |
| `npm run content:check` | pass: 0 errors, 0 warnings |
| `npm run build` | pass (12.25 s) |
| `npm run e2e` | pending |
| `npm run e2e:creator` | pending |

## Files changed

- `tests/e2e/acceptance.mjs`
- `src/ui/build/build.css` (tool tabs wrap onto two rows)
- `tests/unit/surfaces/painters.test.ts`, `tests/unit/surfaces/mapPainters.test.ts`,
  `tests/unit/integration/floors.test.ts`
- `src/main.ts` (debug `setWeather` keeps snow that has already settled)
- `docs/ROADMAP.md`, `docs/CONTINUATION.md`, `docs/CONTENT_STATUS.md`, `docs/TEST_CHECKLIST.md`,
  `docs/ARCHITECTURE.md`
