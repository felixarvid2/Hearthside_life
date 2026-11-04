# Task B — progress pill above the head (Milestone 11.5)

## Design (written before coding)

**Goal.** Every running action of a person on the active lot/level shows a small DOM pill above the head that fills
with the action's progress, turns green near the end and briefly shows a check on completion. It must derive
everything from existing state; no new save fields.

### Modules

- `src/render/actionProgress.ts` — pure (no three, no DOM). `actionProgress(state, person, content?)` returns
  `{ fraction, icon, label, done, status, walking, phase, actionId } | null`.
  - `queued/validate/reserve` (and no queue / off-lot) → `null`.
  - `route` → visible at the start of the stage (0 for the first stage, the completed share for a later stage),
    `walking: true`. The pill is a small "walking" hint rather than hidden, so an action is visible from the moment
    it starts.
  - `prepare`/`perform`/`apply`/`cleanup` count. `apply` and a successful `cleanup` give `done: true`.
  - fixed duration: `elapsed / duration`. `untilFull`: the driving need (the untilFull need, else the largest
    positive `needsPerHour`) from `data.startNeed` (recorded once by the sim when perform begins) to 100. Older
    saves / actions started before the update fall back to `elapsed / maxMinutes`, which is still monotonic.
  - chains: `cookMeal` uses `[2, recipeMinutes · cookingTime, 1]`, `eatMeal` `[1, 25]`, `read*` `[1, 45]`,
    `washDishes` `[1, 6]`, pools `enter/swim/exit` with the def's swim minutes. The current stage's weight is
    replaced by the exact live `duration` once known. Overall fraction is the completed stage share plus the
    current stage's share. Unknown chains fall back to the current stage's own fraction; the view clamp keeps it
    monotonic.
  - socials: actor fixed duration; the passive listener (`data.role === 'listen'`, `duration === null`) uses
    `elapsed / SocialDef.minutes`.
  - status: `cancelled` when `cancelRequested` or `data.result === 'cancelled'`, `failed` likewise, `done` on
    apply/successful cleanup.
- `src/render/progressPills.ts` — DOM + pure colour/state helpers (`fillColor`, `pillVisual`,
  `monotonicFraction`). `ProgressPills` owns per-person pill elements (registered by `PeopleView`), samples the
  action at 10 Hz, clamps the fraction per action id, writes the DOM at most 10 times a second, and keeps a
  completion/cancel state for 700 ms. The pill is the first child of the existing `.wo-p` column, so it stacks
  above the thought bubble/name tag and moves with the same transform. Its own `.wo-pill` block is the container;
  it lives inside `#world-overlay` (through `.wo-p`), has `pointer-events: none` and never blocks the world.
- Setting `actionProgress: 'household' | 'all' | 'off'` in `GameSettings` (default `household`), the options
  screen (Display section), `ViewOptions` and `GameView`/`PeopleView`. `household` = members of
  `state.activeHouseholdId` only.

### Look

44 × 10 px on phones (≤ 600 px wide or ≤ 500 px tall), 56 × 12 px otherwise. Dark translucent capsule with a
1 px light outline and a soft shadow, interaction icon at the left, a track that fills left to right. Fill colour
is interpolated from warm amber (`hsl(34 76% 52%)`, the `--low` family) to green; at ≥ 85 % it is the theme
`--good` green. On completion the whole pill goes green with a check mark for ~0.7 s. Cancelled/failed actions go
grey and fade out. Reduced motion disables transitions and the fade animation.

Chains/pools already in state: `cookMeal` (stages 0-2), `eatMeal`, `readBook`/`readSkillBook` (stage 0 pickup),
`washDishes`, and `swimInPool`/`relaxInPool` (`toDeck/enter/swim/exit`). Sim change (allowed by common.md because
the start value is not in state): `ActionInstance.data.startNeed` + `data.startNeedId` recorded when perform
begins, with a unit test in `tests/unit/sim/actions.test.ts`.

### Tests

- `tests/unit/render/actionProgress.test.ts`: fixed, untilFull (startNeed + fallback), cookMeal stages, pool
  stages, social actor/listener, cancel/fail, walking, done, mid-action load, monotonic clamp, colours/states.
- `tests/unit/sim/actions.test.ts`: `startNeed` recorded at perform for an untilFull interaction.
- `tests/unit/ui/progressPill.test.ts`: a small DOM stub (jsdom is not a dependency of the repository and installing
  one was not available in this session) drives the real `progressPills` DOM code: pill renders, fill width/colour
  and aria update, the check on completion, the grey cancel state, the 10 Hz/clamp behaviour and scope/off-screen.

### Screenshots

`dev/ds-tasks/m115/shoot-b.mjs`, screenshots in `dev/ds-tasks/m115/shots/B/`, all three viewports: cooking at
30 %, cooking at 90 % (green), two people in different actions, the completion check (the action is held in a
successful apply while paused so the check is stable for the screenshot), and the setting in the options screen.
The script waits for each pill write and then disables the fill transition before capturing: SwiftShader at
1280×720 renders too slowly for the 200 ms colour transition to have run when the DOM is read.
Every screenshot is also checked against the saved PNG (the fill colour inside the pill's rect, and the white tick
for completion), and the camera is placed with a fixed `rig.glideTo(x, z, ppm)` rather than `focusOn(closeUp)`:
the guided game starts at a very high zoom, which `focusOn` keeps, and at that level the camera clips into the
kitchen counter and the actor disappears behind it while the pill still projects above the countertop.

## Progress log

### Implemented

- `src/render/actionProgress.ts` — pure progress maths (fixed, untilFull with start value, known chains, pools,
  socials, status, walking).
- `src/render/progressPills.ts` — pill DOM, `fillColor`/`pillVisual`/`monotonicFraction`, `ProgressPills`
  controller (10 Hz sample/write, per-action clamp, 700 ms completion/cancel state, scope, reduced-motion CSS).
- `src/sim/actions.ts` — records `data.startNeedId`/`data.startNeed` when an untilFull perform begins (the only sim
  touch; no save-version change, nullable, older actions fall back to elapsed/maxMinutes).
- `src/render/peopleView.ts`, `src/render/gameView.ts`, `src/game/Game.ts`, `src/game/api.ts`,
  `src/game/settings.ts`, `src/ui/screens/settings.ts` and the three dev mocks — setting, scope plumbing and the
  options control. Pills are the first child of the existing `.wo-p` column, so they reuse the thought-bubble
  projection and stack above the name/thought bubble.
- Tests: `tests/unit/render/actionProgress.test.ts`, `tests/unit/ui/progressPill.test.ts`,
  `tests/unit/sim/actions.test.ts` (startNeed), `tests/unit/ui/settings.test.ts` (default/validation).

### Decisions

- **Walking** (`route`) shows the pill at the completed share (0 for the first stage) with `is-walking` (dimmed
  track) rather than hiding it: an action is visible from the moment it is queued, and multi-stage chains keep the
  share already earned. `queued/validate/reserve` show nothing.
- **untilFull** needs a start value that is not in the save. Recorded deterministically in `action.data` at perform
  begin (`startNeedId`, `startNeed`); if absent (older mid-action save) progress falls back to `elapsed/maxMinutes`,
  which is still monotonic but approximate. No new schema version.
- **Chains** use each stage's planned minutes as its share; once the current stage is performing, its live
  `duration` replaces the planned value (recipes/skill effects are exact). Pools use the string stages
  `toDeck/enter/swim/exit`; numeric stages cover cookMeal, eatMeal, read*, washDishes. Unknown chains fall back to
  the current stage's own fraction.
- **Monotonic clamp lives in the view** (`ProgressPills`, keyed by action id), never in the sim. A new action resets
  the clamp to its own fraction, so progress starts again from the action's real value.
- **Completion/cancel** stay on screen for 700 ms: green with a check, or grey at the fraction where it stopped then
  fade. Done comes from `apply` or a successful `cleanup`; a vanished action falls back to the last sampled
  status/fraction. Reduced motion removes both transitions.
- **Scope** default `household` (the active household only); `all` includes everyone on the visible lot/level,
  `off` hides pills entirely. Only on-screen people are sampled/updated.
- **Colour** is an eased amber→green blend (t^1.8) so the first half still reads warm rather than lime; at ≥ 85 %
  it is the theme `--good` green. Phones get 44×10 px, wider screens 56×12 px.

### Checks (this session)

- `npm run typecheck` — pass.
- `npm run build` — pass (tsc + vite).
- `npm run content:check` — 0 errors, 0 warnings.
- Task B unit tests (`actionProgress`, `progressPill`, `actions`, `settings`) — 59/59 pass.
- `npx vitest run` (whole suite) — 2011/2019 pass; the 8 failures are outside task B: five surface-painter timeouts
  under the parallel run, two heavy simulation timeouts (`floors`, `m11-skills`) while the browser checks were also
  running, and one travel autonomy assertion (`introduce` while autonomy is off). To be re-run once the browser run
  has finished and the other agents' WIP settles.
- Visual checks: `npm run visual:m115:b` — **29/29 checks passed** in portrait 390x844, landscape 844x390 and
  desktop 1280x720 (screenshots in `dev/ds-tasks/m115/shots/B/`, log in `shots.json`):
  - cooking at ~30%: amber `rgb(218,182,37)`, 30% wide, 44x10 (phones) or 56x12 (desktop), not done;
  - cooking at ~90%: green `rgb(77,154,91)`, 90% wide;
  - completion: 100% green pill with the check, label "Cook a Meal complete";
  - two people: two pills with different labels at the same time (Water Plant + Bake a Treat);
  - Settings shows the three scopes with Household selected; on desktop choosing Off writes the setting and hides
    the pills, choosing Household restores it; no page errors in any viewport.
  - Screenshot reliability: the script verifies the saved PNG really contains the pill pixels (fill colour and the
    white check) and retries after closing any panel/menu that covers the overlay. The 700 ms completion state is
    held by freezing the pill controller's `performance.now()` while the slow SwiftShader screenshot is taken; the
    two actions are framed together with `focusOn` on their midpoint rather than the whole lot.
- `npm run e2e` — pass (exit 0, all portrait/landscape/desktop stages; screenshots in `tests/e2e/out/screenshots`).
  It ran late in the session because the shared browser lock was held by other agents' visual runs.
- Screenshot pixel audit: the first desktop-only rerun passed 14/15 checks. The failing check was the *white tick*,
  not the pill: scanning the saved PNGs at the DOM-reported rect found the amber fill exactly where expected
  (`rgb(218,182,37)` at the 30 % fill) and the green fill at 90 %/done, but the completion tick peaked at
  `rgb(154,170,152)` — the shared 1.9/24 icon stroke is ~0.6 px at an 8 px check and never rasterises to white.
  Fixed in `progressPills.ts`: the check is 10 px (8 px on phones) with a heavier `stroke-width` (4.5 / 5), so the
  tick has a white core at 1×. Rasterising the same SVG at the pill's size confirms it: the old 8 px / 1.9 stroke
  produces 0 white pixels (max channel 170, matching the screenshot's 154–170); the new 10 px / 4.5 and 8 px / 5
  ticks produce 12 and 10 white pixels. The whole three-viewport set is regenerated and pixel-verified afterwards.
- Diagnostic helpers kept next to the script (untracked working files; `rm` was blocked this session):
  `dev/ds-tasks/m115/b-crop.test.ts`, `b-check-scan.test.ts`, `b-tick-render.test.ts` and `b-crop-vitest.config.ts`
  (`npx vitest run --config dev/ds-tasks/m115/b-crop-vitest.config.ts`). They crop/scan the saved PNGs and rasterise
  the tick; they are not part of the test suite.
