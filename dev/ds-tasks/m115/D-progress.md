# Task D — moving parts and "in use" states (Milestone 11.5)

## Design (written before coding)

**Goal.** Animate doors, lids and running effects on furniture from the actions already in the simulation. Render-only:
no save fields, no new interaction data. Everything is derived from `objectUses(state)` and the person's anim.

### Part sources (see `dev/ds-tasks/m115/inspect-objects.mjs` output)

| asset | separate movable nodes | notes |
|---|---|---|
| kitchenFridge | `doorFridge` | hinge origin is the node origin; the freezer leaf stays merged (never opened) |
| kitchenFridgeLarge | `doorLeft`, `doorRight` | side-by-side, both halves |
| kitchenFridgeSmall | `doorFridge` | |
| kitchenFridgeBuiltIn | `doorFridge` | wooden doors; freezer leaf merged |
| kitchenStove | `door` | oven door, horizontal hinge |
| kitchenStoveElectric | — | overlay door + code interior |
| breadOven | — | overlay door + code interior |
| bookcaseClosedDoors | `doorLeft`, `doorRight` | wardrobe; body is the case |
| toilet | `cover` | lid, horizontal hinge |
| toiletSquare | `Group` | lid |
| washer / dryer | `washerDoor` / `dryerDoor` | descriptors ready, no running interaction yet |
| kitchenMicrowave | `Group` | descriptor ready, decorative |
| shower, showerRound | glass `doorLeft`/`doorRight` merged | doors stay closed; water effect only, no pivot cost |
| dishwasher | — | overlay door + interior light |
| bathtub, sinks | — | effect-only parts (water, tap stream) |

The GLB loader currently flattens every node into one mesh per material (`mergeByMaterial`), which destroys the pivot
nodes. `objectAssets.ts` gains a small allow-list (`PART_NODES` keyed by asset) and keeps those named nodes as pivot
groups: the rest of the model is merged into the body exactly as before, while each door/lid becomes a group whose
origin is the GLB node origin (the hinge), with its original rotation/scale preserved inside. Instances clone the
template, so the door names survive per placed object. Draw calls only grow for the handful of assets that have doors.

### New module `src/render/objectAnim.ts`

- **Descriptors** (`DESCRIPTORS`, keyed by defId, asset name also recorded):
  - node pivots: node name, axis (asset-root space), signed open angle, open/close times;
  - overlay panels for assets without a door node: hinge point, size and material *as fractions of `fittedBounds`*
    so they work for every def transform; panel is flush with the front face and uses the model's finish material;
  - interior kind (`fridge`, `oven`, `wardrobe`, `dishwasher`);
  - effects implied by kind (burners, pan, steam, shower water, bath water, tap stream, interior light).
- **Pure trigger function** `activeParts(descriptor, uses, content, now)` -> `{ door, secondDoor, lid, ovenDoor,
  burners, pan, steam, shower, bathWater, tap, interiorLight, drum }`.
- **Pure openness function** `opennessAt(openSince, closeSince, now, timing, reducedMotion)`: smoothstep tween from
  timestamp, snap 0/1 when reduced motion. Runtime `Motion` remembers `openSince`/`closeSince`; when a part becomes
  active it starts opening from its current value (and seeds `openSince` from `use.animSince`, so loading in the middle
  of an action shows the door already open). Timings are game minutes (0.4 min = 0.4 s at 1x); GameView converts real
  dt to game minutes with `SPEED_MINUTES_PER_SECOND`, so 3x opens 3x faster in real time.
- **Runtime** `ObjectAnim` built per placed object from def + model: finds `part:<name>` pivots, builds overlays,
  lazily builds interiors/effects on first use, updates them in `ObjectsView.animate` with the game/real dt. Only
  active-lot objects are touched (ObjectsView holds just the active lot). Interiors stand slightly proud of the
  original solid front face so they are revealed when the door swings. `dispose()` frees per-object materials and
  geometries; the entry calls it on removal. Geometry inside interiors is closed only while `openness > 0.02`
  (`group.visible`), so a closed appliance costs no extra draw calls.
- Effects are cheap: four shared-material torus rings, one small pot/handle, ≤ 10 steam sprites/points, 6 stretched
  water quads + one haze sprite for the shower, one plane for bath water, one thin cylinder for a tap stream.
  Steam/haze are hidden with reduced motion; water streams stay but do not scroll.

### Triggers

| object(s) | part/effect | trigger |
|---|---|---|
| fridges (`fridge-standard`, `fridge-side-by-side`, `fridge-compact`, `fridge-built-in`) | door(s) | `grabSnack` while `anim === 'openFridge'`, or `cookMeal` stage 0 |
| stoves (`stove-basic`, `stove-electric`) | burner rings + pot | `cookMeal` stage 1 (stove recorded as `data.stoveObj`) |
| stoves | steam | same, while anim `cook` |
| stoves | oven door | a bake at the stove (`bakeTreat`/recipe `skill === 'baking'`), briefly at the start |
| `bread-oven` | oven door + glow | `bakeTreat` at it (all bake recipes are `skill: 'baking'`) |
| `wardrobe-tall` (`bookcaseClosedDoors`) | both doors | `changeOutfit` / `editOutfits` |
| `toilet-basic`, `toilet-square` | lid up | `useToilet` (prepare/perform/apply; closes in cleanup) |
| `shower-stall`, `shower-round` | falling water + haze | `takeShower` perform |
| `bathtub` | water surface | `takeBath` perform |
| `counter-sink`, `bathroom-sink`, `bathroom-sink-square` | tap stream | `washHands`, or `washDishes` stage 1 when the sink is its station (`data.washObj`) |
| `dishwasher` | overlay door + interior light | `washDishes` stage 1 at it: door open briefly at start/end, light while running |
| `microwave`, `washing-machine`, `tumble-dryer` | door / drum | descriptors ready; these defs have no running interaction yet, so they stay closed |

No hand props (task H), no screens (task S), no progress pill (task B).

### `objectUses` extension

Add `objectId` and `role: 'target' | 'station'` to `ObjectUse`. The map gains an entry for every object involved in a
use: the target object (as today, when it is a placed object) plus `cookMeal`'s `data.stoveObj` and `washDishes`'
`data.washObj` stations. This is additive; the target-keyed entries keep their meaning.

### Decisions taken while implementing

- Openness is a small state machine per part (`OpenMotion { from, to, since, duration, active }`), not a single
  formula: `activeParts` says what should be open now; `seedMotion` turns that into the right pose for a part that
  loads mid-action (from the anim's `since`); `stepMotion` only restarts a tween when the target flips and reverses
  from the current value. Pulses (oven door at a bake start, dishwasher at either end of a run) are driven by
  `elapsed`/`duration`, so they genuinely close again while the action continues.
- Timings are game minutes everywhere (0.4 min = 0.4 s at 1x); the frame loop passes `world.clock.minutes`, so
  pausing freezes a door mid-swing and 2x/3x make it faster in real time without extra code.
- Only nodes that are actually animated stay separate. The freezer leaf, shower glass doors and everything else are
  merged exactly as before; placeholders (loading/missing models) get no `ObjectAnim` at all.
- Interiors are shallow, code-built recesses that sit just proud of the solid model front. The GLB body is one
  merged mesh without a real cavity, so a deeper interior would be hidden by it; the shallow version reads as an
  open cavity once the door is out of the way and costs nothing while closed.

### Files

- `src/render/objectAssets.ts` — preserve door/lid nodes as `part:<name>` pivots.
- `src/render/objectAnim.ts` — descriptors, pure triggers/openness, runtime + effect builders.
- `src/render/objectUse.ts` — additive station entries.
- `src/render/objectsView.ts` — per-entry `ObjectAnim`, update in `animate`, dispose on remove.
- `src/render/gameView.ts` — pass `state`/clock/real dt into `objects.animate` (two-line hook).
- `tests/unit/render/objectAnim.test.ts`, `tests/unit/render/objectUse.test.ts`.

### Tests

- Every animated def has a descriptor; node names are in the asset allow-list; overlay/interior fractions are in 0..1.
- Openness: closed before, opening halfway, fully open, closing, closed after; reduced motion snaps; mid-action load
  (fresh motion seeded from `animSince`); 3x speed closes/opens in a third of the real time.
- Triggers: fridge (grabSnack prepare vs eating; cookMeal stages), stove station via `data.stoveObj`, wash station,
  wardrobe, toilet, shower/bath, sink, dishwasher start/end, baked vs non-baked.
- `objectUses`: station entries, item target (washDishes) resolving to its station.

### Screenshots

`dev/ds-tasks/m115/shoot-d.mjs` -> `dev/ds-tasks/m115/shots/D/` in portrait 390x844, landscape 844x390 and desktop
1280x720: fridge closed vs open with a person, stove cooking (rings + pot + steam), wardrobe open, shower running.

## Progress log

### Implementation (done)

- `objectAssets.ts`: `PART_NODES` allow-list; `mergeByMaterial(scene, keep)` now merges the body in scene-root
  space and each named part in its own node space, emitting `part:<node>` pivots with the node origin, rotation and
  scale in `userData.baseQuaternion` (a plain `[x,y,z,w]` array because `Object3D.clone()` JSON-copies `userData`).
  Falls back to the original hierarchy if anything fails. `makeTemplate` passes the asset name.
- `objectUse.ts`: `ObjectUse` carries `objectId` and `role`; `objectUses` adds `data.stoveObj` / `data.washObj`
  entries as `station` and no longer skips item targets (a washDishes item now resolves to its sink/dishwasher
  station). Target-object entries are unchanged for existing consumers.
- `objectAnim.ts`: 20 descriptors (4 fridges, stove-basic / stove-electric / bread-oven, wardrobe-tall, both
  toilets, two showers, bathtub, three sinks, dishwasher, microwave, washer, dryer), pure `activeParts`,
  `isBakedRecipe`, `opennessAt` / `seedMotion` / `stepMotion`, and the per-object `ObjectAnim` runtime. Interiors
  are lazily built and visible only while a door is open. Effects: four emissive hob rings + pot, six steam
  sprites, shower streaks + haze, bath plane, tap cylinder, drum/light pulses. Steam and haze are hidden with
  reduced motion; all tweens snap under reduced motion.
- `objectsView.ts`: each entry owns an `ObjectAnim`; `animate(dt, reducedMotion, frame)` feeds it
  `objectUses(frame.state).get(id)` and `world.clock.minutes`. Only the active lot is held, so only visible-lot
  objects animate. `dispose()` on removal. `sync` signature unchanged.
- `gameView.ts`: passes `{ state: world, now: world.clock.minutes }` to `objects.animate`.
- Triggers actually implemented (all from `objectUses` + `person.anim`; no save fields):
  - fridge doors: `anim === 'openFridge'` (grabSnack and any reach-in) or `cookMeal` stage 0, including
    `doorLeft`+`doorRight` for the side-by-side; closes when the anim/stage ends.
  - stove/oven: hob rings, pot and steam only for `cookMeal` stage 1 at a hob asset; oven door + orange glow for a
    `skill: 'baking'` recipe during the first `pulseMinutes` (0.8 min) of the bake; savoury cooks never open it.
  - microwave / washer / dryer: door + light (+ drum) while used.
  - dishwasher: door open for 0.8 min at each end of `washDishes` stage 1, interior light while running.
  - wardrobe `doorLeft`/`doorRight`: `changeOutfit` / `editOutfits`.
  - toilet lid: `useToilet`.
  - shower: falling water + haze during `takeShower` perform; bath: water surface during `takeBath` perform.
  - sinks: tap stream for `washHands`, or `washDishes` stage 1 with the sink as station via `data.washObj`.
- Unit tests: `tests/unit/render/objectAnim.test.ts` (19) and `tests/unit/render/objectUse.test.ts` (5) — all pass.
  `npm run typecheck` and `npm run build` pass.
- Screenshot script `shoot-d.mjs` written (self-locking, preview server, three viewports, five shots each).
  First run blocked on the shared browser lock held by another agent; screenshots and visual tuning are pending.
- Checks so far: `npm run typecheck` ok, `npm run build` ok, `npm run content:check` 0 errors/0 warnings,
  `tests/unit/render` 120/120, targeted `objectAnim`/`objectUse` 24/24. A full `npx vitest run` under heavy parallel
  load (screenshot browsers + other agents) reported 12 failures, all 5 s timeouts in unrelated surface/integration
  suites plus one travel-autonomy assertion; re-run when the machine is quiet.

### Screenshot review and tuning (in progress)

The first full run passed all 24 checks (portrait/landscape/desktop; five shots each) and produced readable evidence
for the fridge closed, the wardrobe doors and the shower stall, but two shots needed work:

- `reveal()` only fits a box into the current view and never zooms in, and the person's use slot is between the
  camera and the appliance, so from the front the person covers the open part. The stove was almost entirely out of
  frame and the open fridge cavity was hidden behind the person.
- Effects were too faint: six short shower streaks at 0.32 opacity and 0.32-opacity steam, and the hob rings at
  1.6 emissive intensity read as small dark circles at gameplay zoom.

Changes made:

- `objectAnim.ts` effects: ten shower streaks in two radii, 0.026 m wide, 0.46 opacity, with a stronger haze
  (0.17); steam raised to eight sprites at 0.42 opacity; hob rings slightly larger (0.06 scale) and brighter
  (emissive 2.4), pot 0.11 m radius. Still cheap: 10 quads, 8 sprites, 4 rings, one pot.
- `shoot-d.mjs`: the closed-fridge and wardrobe shots keep the natural reveal view. The open fridge, stove and shower
  shots now drive the rig directly (`GameView.rig.setYawStep` + `glideTo` aimed at the object's footprint centre at
  a fixed zoom) and take all four yaw steps as `-k0..3` candidates; `promote-d.mjs` copies the best candidate to the
  required `<viewport>-<state>.png` name. The candidate idea comes from `probe-d.mjs`, a small four-angle probe kept
  for future camera work.
- `package.json`: `visual:m115:probe` and `visual:m115:promote` scripts next to `visual:m115:d`.
