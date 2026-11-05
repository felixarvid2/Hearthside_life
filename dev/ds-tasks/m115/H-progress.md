# Task H — things in hands, and the food flow from fridge to mouth (Milestone 11.5)

## Design (written before coding)

**Goal.** Small procedural props follow the hands of the shared Quaternius rig: snacks, ingredients, plates, forks,
books, phones, mugs, tools. The rules are derived from the live action (`person.queue[0]`) and animation, with no save
changes.

### Modules

- `src/render/handProps.ts`
  - **Pure rules** (no three, no DOM, unit-testable):
    - `propsFor(person, action, anim, clock, items) -> { right?: PropSpec; left?: PropSpec; placed?: PropSpec }`.
      `action` is `runningAction(person)` (or `person.queue[0]`), `anim` is `person.anim`; only the fields that
      matter are read, so tests can pass plain objects.
    - `mealPortion(action, person)`: `1 - elapsed/duration` clamped 0..1 for fixed-duration `eat`; for an
      `untilFull` action without a duration, hunger fill (`needs.hunger / 100`) clamped, so the portion is
      monotonic on the way up to full.
    - `biteFraction(progress, bites)`: stepwise snack shrink (4 bites), while `mealPortion` is continuous.
    - `snackFor(action)`: `action.data.snack` when a future sim supplies one, else a deterministic pick from the
      action id (sandwich / apple / yoghurt + spoon).
    - `foodColor(recipeId)`: the same palette as the meal items in `objectsView.ts`, so a carried plate matches the
      served one.
  - **Render side** (`HandProps` class): shared low-poly geometries and materials are built once at module level
    (never per person); per kind the group is assembled from a cached template and only the portion/colour is
    adjusted. The group is parented to `hand_r` / `hand_l` of the person's `CharacterView` rig (and re-parented when
    `buildRig` is rebuilt). Grip offsets/rotations live in one data table in hand-local metres at adult scale, and
    all offsets are multiplied by the person's stage scale; geometry is scaled by the same factor. `placed` props
    (plate on the table while seated) are parented to the character root in front of the seat instead.
    `update(result, scale, visible)` applies/creates/removes props only when the spec key changes, hides everything
    when the person is not visible (off lot/other level), and `dispose()` frees the per-person groups (geometry and
    materials are shared and are not disposed).
- `src/characters/CharacterView.ts`: one additive accessor `bone(name)` returning the current rig bone (the bones
  map already exists privately). Nothing else changes.
- `src/render/peopleView.ts`: `Entry.props: HandProps | null`; created in `create`, updated in `update` after
  `e.view.update(dt)` for visible entries, cleared when hidden, disposed in `remove`. Overlays are untouched.
- `src/render/objectsView.ts`: the served meal's food dome uses the shared `mealPortion`/`foodColor` (a two-line
  additive change; task D edits the same file, so it is re-read immediately before editing). The live shrinking
  portion is the hand/placed prop, because `eatMeal` deletes the served item when a portion is taken.

### Prop mapping (every mapping)

| Trigger | Prop | Hand |
| --- | --- | --- |
| `grabSnack` prepare `openFridge` ≥ 60 % | snack chosen from the action id: `sandwich`, `apple`, `yoghurt` + `spoon` | right (spoon left for yoghurt) |
| `grabSnack` perform `eat` | same snack, portion in 4 bite steps, gone at the end | as above |
| `cookMeal` stage 0 `openFridge` ≥ 60 % | food pack / vegetables | right |
| `cookMeal` stage 0→1 route | food pack / vegetables carried | right |
| `cookMeal` stage 1 perform `cook` | spatula (pan is drawn by task D) | right |
| `cookMeal` stage 2 route + `pickUp` until the item exists | plate with the recipe's food | right |
| `eatMeal` from `data.itemTaken` + stage 0 `pickUp` | plate with the recipe's food | right |
| `eatMeal` stage 0→1 route | plate while walking to the seat | right |
| `eatMeal` stage 1 seated `eat` | plate placed on the surface in front, fork to the mouth | plate placed, fork right |
| `eatMeal` stage 1 standing `eat` | plate held, fork to the mouth | plate left, fork right |
| `read`, `readBook`, `readSkillBook`, `studyHard` | open book | left |
| `phone` anim and `phone*` interactions / `callRepairperson` | phone with a lit screen | right |
| `makeCoffee`, `buyCoffee` | mug | right |
| `blendSmoothie` | glass | right |
| `buyVendingDrink` | can | right |
| `waterPlant` / `water` anim | watering can | right |
| `washDishes` | sponge | right |
| `cleanObject` | spray bottle | right |
| `mopFloor` | mop | right |
| `tidyUp` | cloth | right |
| `repairObject`, `serviceObject` / `kneelFix` anim | wrench | right |
| `fishPond`, `fishVenue` | fishing rod | right |
| `grillFood`, `makeToast`, `bakeTreat` | spatula | right |
| `paintCanvas`, `paintToSell` | paintbrush | right |
| no brushing-teeth interaction exists | — | — |

Props only appear at a hand-reach threshold (60 % of `openFridge`/`pickUp`) or at the start of the perform phase,
never on `queued`/`route` before the corresponding stage, and never on `cancelled`/`failed`/`done` phases.

### Timings

- `grabSnack`: the sim skips the zero-length `openFridge` prepare in one tick, so the realistic fridge reach is
  `cookMeal` stage 0. The snack still uses the same 60 % rule; the perform `eat` portion shrinks and vanishes at the
  end. `biteFraction` gives the visible bite steps.
- `cookMeal`: stage 0 ingredients at 60 % of the fridge reach → carried through the route to the stove → spatula
  during `cook` → plate at the counter until `data.itemId` is set, when the world item takes over.
- `eatMeal`: `mealPortion` shrinks continuously through the fixed 25-minute `eat`; seated plates are placed in front
  (the character root has no table height, so the placed plate sits at a fixed counter/table height scaled by the
  person); the fork is always in the right hand. Dirty dishes appear from the sim's `apply`, so the prop is gone by
  the time they exist.
- Cancellation: any terminal phase (or no action) produces no props; mid-action load (`anim.since`) only matters
  for progress, so a reloaded action shows the correct state.

### Tests

`tests/unit/render/handProps.test.ts`: snack timing/step shrink/gone/cancel/mid-action, cookMeal three stages and
carry, eatMeal plate timing, seated vs standing, portion shrink, plate gone at the end, mappings table (book, phone,
mug, watering can, sponge, wrench, rod), deterministic snack, `mealPortion` fixed/untilFull/clamps,
`biteFraction`, `foodColor`.

### Screenshots

`dev/ds-tasks/m115/shoot-h.mjs` (npm script `visual:m115:h`), screenshots under `dev/ds-tasks/m115/shots/H/`:
fridge reach, snack mid-eat, carrying a plate, seated eating at 20 % and 80 %, reading a book, on the phone — in
portrait 390×844, landscape 844×390 and desktop 1280×720 with the camera close.

## Progress log

### Implementation (done)

- `src/render/handProps.ts` — pure rules and `HandProps` as designed. Final `HandProps.update(result, env)` takes
  `env = { scale, tableY, forward }`: `scale` is the life-stage factor for a body the character model owns (1 when
  the rig root is already scaled), `tableY` is the table height in root-relative metres and `forward` the distance
  of a placed plate ahead of the pelvis.
- `src/characters/CharacterView.ts` — `bone(name)` accessor.
- `src/render/peopleView.ts` — `Entry.props`, created with the character view, updated after the root transform,
  hidden for off-lot/other-level/held-baby entries, disposed with the entry. Overlays untouched.
- `src/render/objectsView.ts` — served meal food now uses the shared `foodColor(recipeId)` and
  `mealDomeScale(portions)` from `handProps.ts` (same palette as the carried plate, one source of truth).
- No simulation or save changes.

### Decisions

- **Upright props.** Plates, mugs, glasses, cans, watering cans, ingredients, the phone and the book are kept level
  in the body's frame instead of inheriting every wrist rotation (otherwise a plate tumbles with the hand).
  Orientation is `parentWorldQuat⁻¹ · rootWorldQuat · gripRot`, so it also survives the seated overlay.
- **Snack choice without sim changes.** `data.snack` wins when present; otherwise a stable hash of the action id
  picks sandwich/apple/yoghurt. No RNG and no save schema change.
- **Smooth progress between ticks.** The sim ticks every 0.25 min; the pure rules interpolate perform progress from
  `clock - anim.since` (floored by `action.elapsed`), so the snack bites and the plate portion move every frame.
- **Served item vs carried plate.** During `cookMeal` stage 2 the plate stays in hand until `data.itemId` exists in
  `state.items`; on a save where the id is set but the item is gone, the cook still carries a plate.
- **`eatMeal` standing fallback.** If no chair at a table is free the sim performs standing; the plate is then held
  in the left hand and the fork in the right. Seated, the plate is placed on the surface in front and only the fork
  is in the hand. The prop is gone in `apply`, when the sim creates the dirty dishes.
- **No props in prepare/route for everyday actions.** A book/phone/tool only appears once the person is performing
  (or applying) the interaction, never while walking to the object.
- **Shared resources.** Geometries, standard materials and phone-screen glow materials are created once at module
  level; each person builds small groups and `dispose()` only detaches them. No new lights, no per-frame allocations
  beyond the small result objects.
- **Reduced motion / low quality.** Nothing animates beyond the portion scale, and the props are low-poly (≤ 8
  meshes each); the `quality: 'low'` path is unaffected.
- **Not done (owned elsewhere):** furniture moving parts (task D), screens (task S), the progress pill (task B).

### Tests

`tests/unit/render/handProps.test.ts` — 24 tests, all passing:

- no props without an action and in every non-active phase;
- snack determinism / `data.snack`; four bite steps; smooth mid-tick progress; mid-action load; cancelled snack;
  yoghurt + spoon;
- cook stage 0 threshold (50 % nothing, 70 % ingredients), carry, spatula, stage-2 plate dropped when the item
  exists (and kept when a save recorded only the id);
- eatMeal pickup threshold, route plate, seated placed plate + right fork at 80 %/20 %, standing plate-left +
  fork-right, apply cleanup, until-full hunger portion;
- every everyday mapping (book, phone, mug, glass, can, watering can, sponge, spray, mop, cloth, wrench, rod,
  spatula, brush) and no prop during prepare/route or for the unmapped `liftWeights`;
- `mealPortion`, `biteFraction`, `actionFraction`, `foodColor`, `mealDomeScale`;
- `HandProps` attachment to a hand bone, reattach/update in place, portion update, removal, placed plate position
  and stage scaling.

### Visual check

`dev/ds-tasks/m115/shoot-h.mjs` (script `npm run visual:m115:h`) builds to `tests/e2e/out/dist-m115h`, previews on
port 5197, takes `/tmp/hearthside-browser.lock` itself, starts a guided household with autonomy and visitors off,
pauses the clock and stages each shot from the live action.

Round 1 (default camera): all prop checks passed except the phone (no callable contact at that hour), and the seated
plate was hidden behind the chair back from the default south-east camera; the fridge/snack props were also too
small in frame. Round 2 fixes the framing (close zoom, yaw chosen behind the person's shoulder) and gives the phone
a callable off-lot contact for the screenshot. The tall portrait viewport uses a gentler zoom (95 px/m) than the
wide ones (140 px/m) so the whole figure stays in frame.

Final run: **27/27 checks passed**, no page errors in any viewport. Screenshots (all three viewports):

- `fridge-reach-*.png` — the cook at the fridge with the ingredients bag (carrot, greens) in the right hand at 75 % of
  the reach.
- `snack-eat-*.png` — half a sandwich in the right hand.
- `carry-plate-*.png` — a full plate carried in the right hand, mid-walk.
- `eat-20-*.png` — seated at the dining table; plate placed on the table with the fork in the right hand; food at
  80 % remaining.
- `eat-80-*.png` — same seat, food at 20 % remaining; the food mound's height scale drops from 0.84 to 0.36, visibly
  smaller.
- `reading-*.png` — an open book (brown covers, cream pages) in the left hand while reading.
- `phone-*.png` — the phone with its lit screen in the right hand during a phone call.
- `shots.json` — the check log (prop names found in the scene and the food-mound scales).

The visual staging is deterministic per shot: the clock is paused and the action's `elapsed` is set explicitly
(except the two `debug.step` runs that build the meal and walk to the seat).

### Checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npx vitest run tests/unit/render/handProps.test.ts` | 24 passed |
| `npx vitest run` (whole suite) | 2 017 passed, 2 failed; `tests/unit/surfaces/painters.test.ts` passes when re-run alone (CPU timeout under load), `tests/unit/integration/travel.test.ts` fails on its own too — unrelated to task H (no sim files touched) |
| `npm run content:check` | 0 errors, 0 warnings |
| `npm run build` | passed (17 s, after the other agents' unused imports were resolved in their files) |
| `npm run e2e` | **passed** — all three viewports (desktop, portrait, landscape), `[e2e] OK`, no page/console errors, no blank canvases; screenshots in `tests/e2e/out/screenshots` |
| `npm run visual:m115:h` | 27/27, screenshots above |

The two failing unit tests are not touched by task H: `travel.test.ts` fails the same way on an untouched tree branch
(`introduce` queued with household autonomy off) and `painters.test.ts` is a 5 s timeout that passes alone. The build
first surfaced TS6133/TS6192 errors in `src/sim/autonomy.ts` and `src/sim/simulation.ts` from another agent's
in-flight work; those were fixed in their files and the build then passed without changes here.

Temporary development files left because `rm` is blocked: `dev/ds-tasks/m115/bones-probe.txt` (the GLB bone probe
moved out of `tests/unit`), `inspect-bones.mjs`, `__probe.mjs`. They are dev-only and not imported by the game.

### Handover

- `bash tools/te-save.sh` could not be executed here: shell-script execution in this session returns
  "This command requires approval" (the script is also not marked executable). **The supervisor should run
  `bash tools/te-save.sh` before the last commit and include `.tokeneconomizer/` in it**, per `CLAUDE.md`.
- `git` is blocked in this session, so nothing was committed. All files for task H are in the working tree.
