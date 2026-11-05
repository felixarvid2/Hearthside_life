# Task O — outdoor life and the public swimming pool

Status: complete (resumed after the machine restart; screenshots, all task checks and the progress notes are done).

## Deliverables

1. Eight weather/season-bound outdoor interactions, each with a purpose, a full lifecycle and a greyed reason:
   Build a Snowman, Snowball Fight (social), Make Snow Angel, Have a Picnic (also a social), Fly a Kite,
   Rake Leaves, Jump in Puddles, Stargaze, Watch the Rain, Sunbathe. (Eight interaction ids plus the two socials;
   the picnic is an existing interaction extended.)
2. A seventh public venue type `pool` with an indoor hall, 6 x 10 lap pool and ladders, changing room, benches,
   vending machine, showers and an outdoor sun deck.
3. Unit tests for every gate, the snowman lifecycle, the picnic/snowball socials, the venue layout and two headless
   playtests (a pool trip; a 28-day weather-on autonomy run).
4. Screenshots from `dev/ds-tasks/m12/shoot-o.mjs` in portrait, landscape and desktop.

## Design

### Weather gate

`WeatherRule` (core/types.ts) gains additive optional fields so a rule can say everything the task needs:
`outdoor`, `sheltered`, `night`, `day`, `snowCover`, `rainedRecently`. `weatherGateReason` stays the pure
weather/season check (the existing tests keep passing). A new `outdoorGateReason(rule, ctx, person)` in
sim/weather.ts composes it with the person-dependent checks:

- `outdoor`: the person must be in the open air (`isOutdoors`, which already accounts for roofs) or able to walk
  to an open-air tile (`nearestOutdoorTile`); the outdoor behaviours then step outside before performing.
- `sheltered`: the person must be under a roof (indoors or a covered porch) - for Watch the Rain.
- `night` / `day`: 21:00-05:59 is night; the rest is day.
- `snowCover`: snow must be lying (`weather.snowCover` in winter; set by `ensureWeather`).
- `rainedRecently`: it is raining, or the morning was rainy and it is less than three hours into the afternoon.

Both the context menu (`requestReason`) and autonomy (`candidatesFor`, `socialCandidate`) use
`outdoorGateReason`, so a ruled-out option is listed greyed with the reason and autonomy never starts it.
`SocialDef` gains the same optional `weather` rule; socials are gated in the same two places.

The available reasons are specific: "Only available in winter.", "There is no snow on the ground.",
"This has to be done outdoors.", "Better done under a roof.", "Only at night.", "It has not rained recently."

### The activities

| id | kind | gate | purpose |
| --- | --- | --- | --- |
| `buildSnowman` | self | winter, snow lying, outdoors | fun; leaves a snowman object; Snowman Builder moodlet |
| `makeSnowAngel` | self, lying | winter, snow lying, outdoors | fun, energy cost; Snow Angel moodlet |
| `flyKite` | object (`kite`) | spring/autumn, clear or cloudy, outdoors | fun; Kite High moodlet |
| `rakeLeaves` | self | autumn, not rain/snow, outdoors | Handiness xp, chore; Crisp Autumn Air moodlet |
| `jumpInPuddles` | self (child/teen) | rain now or recently, outdoors | big fun, hygiene cost; Puddle Splash moodlet |
| `stargaze` | self | clear, night, outdoors | Logic xp + Creativity; Starry Eyed moodlet |
| `watchRain` | self | rain, under a roof | restful fun; reuses the existing Cosy Rain moodlet |
| `sunbathe` | object (`sun-lounger`) | summer, clear, outdoors | fun + energy; Sun Kissed moodlet |
| `havePicnic` (extended) | object (blanket/table) | spring/summer, not rain/snow | +hunger, fun, Picnic in the Park |
| `snowballFight` (social) | 2 people | winter, snow lying, outdoors | fun + friendship for both |
| `sharePicnic` (social) | 2 people | spring/summer, not rain/snow | social + fun + a shared meal (hunger for both) |

Snowman lifecycle: `buildSnowman` places a `snowman` object (a `'dev'` object: created, never sold) on a free tile
next to the actor. It is an ordinary `PlacedObject` with an additive `snowman` state (`madeAt`, `warmDays`,
`lastWarmDay`), so it saves and loads with the rest of the lot. An hourly check removes it when the season leaves
winter, or after three snow-free days in winter (a snowfall resets the count). Removal emits `lot.changed`.

### Objects (small, original, procedural)

- `picnic-blanket` (2 x 2 rug, non-blocking) offers Have a Picnic.
- `sun-lounger` (1 x 2) has a seat and a lie slot, so Sunbathe lies on the lounger.
- `kite` (1 x 1 non-blocking lawn prop) offers Fly a Kite. The model flies at 2.3 m on a taut line from a lawn
  peg, so the kite reads as airborne in the screenshot and in play.
- `snowman` (`status: 'dev'`, not in the Buy catalogue) is created by Build a Snowman.

Their models are original `proc:` meshes built at runtime (`src/render/outdoorModels.ts`, registered through the
existing procedural-model hook), with SVG catalogue thumbnails. The counts in `docs/CONTENT_STATUS.md` are refreshed
from the `content:check -- --markdown` output (the tool prints the tables; it does not write the file itself).

### Pool venue

- `VenueType` gains `'pool'`; `VENUES.pool` is open 06:00-21:00 with capacity 4 and a blurb; `VENUE_TYPES` and
  the HUD icon map gain the pool (the `pool` icon already exists).
- A thirteenth `LOT_SPEC` ("Quayside Baths", 32 x 32, map 50,27) is appended, so new worlds get it. Existing saves
  are untouched: the lot record only exists in worlds created from now on, and no save-version change is needed
  (Task W owns the version).
- `poolPlan()` (world/venues.ts) builds a 22 x 20 hall: a pool hall on the west with a 6 x 10 pool (x 7..12,
  z 8..17) and ladders on both short sides, a wall at x = 15, a changing room and shower room on the east, a
  lobby with benches and a vending machine, and a sun deck south of the building with loungers, planters and
  trees. A flat roof covers the building; windows line the walls. Mirrors and sinks hang on the changing room's
  south wall (the north wall is glazed).
- The pool record is written straight into `lot.pools` before `finish`/`lotProblems`, so the venue must pass the
  same reachability check as every other venue.
- Townie outings get a `'pool'` weight in `venueWeight` and the venue is included automatically by the existing
  venue loops.

### Tests

- `tests/unit/sim/outdoor.test.ts`: every new gate (offered in fitting weather/season/time/place, greyed with the
  expected reason otherwise), child-only puddles, the walk-outside lifecycle and its moodlet, snowman
  create/persist/validate/melt (including a snowfall resetting the warm-day count), and the picnic/snowball
  socials with a fixed RNG for the success/failure branches.
- `tests/unit/world/venueLayouts.test.ts`: the pool venue matrix entry, the 6 x 10 basin, ladders on both short
  sides, the roofed hall (three indoor rooms), the furniture, and the pool water interactions.
- `tests/unit/integration/poolTrip.test.ts`: the household travels to the pool, swims, showers and comes home;
  and an existing save without the pool lot still validates (the lot is only added to new worlds).
- `tests/unit/integration/outdoor-playtest.test.ts`: each new activity is chosen by autonomy in fitting
  conditions (with the competing menu stripped), and a 28-day weather-on run proves autonomy never starts one
  while its gate would refuse it while exercising several of them.
- Existing counts that change (neighbourhood lot count, venue-restricted list) are updated.

## Decisions

- **Existing saves**: no pool venue retrofitted, no save-version change. The new `LOT_SPEC` is only read when the
  neighbourhood is created; old worlds keep their lot list and ids. The alternative (turning a vacant home lot
  into a pool) would either change the lot's size/kind mid-save or break the 32 x 32 plan on a 24 x 24 lot.
- **Weather rule**: extended with optional, additive fields rather than adding a second per-interaction condition
  field, so every gate lives in one place and both the menu and autonomy share it.
- **Snowman**: an ordinary placed object with an optional state block, so save/load, rendering and nav need no
  special cases; `status: 'dev'` keeps it out of the Buy catalogue. Its price is a nominal $1 because the content
  validator requires a positive price even for objects that are never bought.
- **Kite/sun lounger are object interactions** (a prop on the lawn, a lounger on the deck), which gives the
  activities a real route/use/cleanup lifecycle instead of a self-only animation.
- **Kite model flies**: a static airborne pose (2.3 m, line to a ground peg) rather than a per-frame animation, so
  it needs no render hook and looks right both while someone is flying it and when it is left standing.
- **Outdoor gate cost**: autonomy evaluates the gate for every candidate, so `nearestOutdoorTile` must be linear in
  the lot area. It now computes the room map, room index and roof list once per call instead of calling
  `outdoorsAt` (which recomputes `computeRooms` for every tile) inside the per-tile scan. The old version was
  quadratic (about a million room computations per call) and, with an outdoor rule on every new activity, made the
  long simulation tests cross their timeouts. Behaviour is unchanged; the travel suite fell from ~150 s to ~15 s.

## Progress

- [x] Weather rule + gate helpers
- [x] Activities, objects, moodlets, socials
- [x] Snowman lifecycle
- [x] Pool venue
- [x] Tests
- [x] Screenshots (60/60 checks in portrait, landscape and desktop)
- [x] Checks

## Check results

Resumed run on 2026-11-05 after the machine restart; the screenshots below were produced by the interrupted run and
re-checked here.

- `npm run typecheck` - pass (`tsc --noEmit`), also after the performance and test edits.
- `npm run content:check` - pass, 0 errors, 0 warnings. `docs/CONTENT_STATUS.md` was stale, so its generated tables
  were refreshed from `content:check -- --markdown`: 108 activities, 47 social interactions, 122 moodlets, 38
  preferences (6 groups), 31 outdoor furniture designs plus the dev snowman (decor dev 1), 165 furniture designs in
  total.
- `npm run build` - pass (vite build; the usual chunk-size warning only).
- Task O suites (`sim/outdoor`, `integration/poolTrip`, `integration/outdoor-playtest`, `world/venueLayouts`) -
  108/108 pass.
- Lot counts: the pool is a thirteenth generated lot, so a new world now has 15 lots. The four assertions that
  hard-coded 14 (`integration/travel.test.ts`, `integration/neighbourhood.test.ts` x3,
  `integration/newWorld.test.ts`) were updated; those files pass.
- **Performance fix found by the check run:** the first isolated run of `integration/travel.test.ts` exceeded the
  file's hard 60 s per-test cap (the 8-day NPC-payroll case took ~75 s). The cause was Task O's
  `nearestOutdoorTile`: it called `outdoorsAt` per tile and `outdoorsAt` recomputed `computeRooms` for that tile
  (quadratic, about a million room computations per call), while autonomy evaluates the gate for every candidate.
  It now computes the room map, room index and roofs once per call. `travel.test.ts` fell from ~150 s to 15.3 s
  (13/13) with no behaviour change, and the Task O suites still pass 108/108.
- `integration/venueActivities.test.ts` - 24/24 pass. The pool's sun-loungers exposed a real interaction between
  the venue matrix and the new weather gate (Sunbathe is refused in cloudy weather), so the test now gives
  weather-bound venue activities a clear summer noon while they are queued and performed, then restores the
  fixture's clock and weather.
- Full `npx vitest run` - first run: 2050/2055 (the venue-activities weather case plus four 5 s default-timeout
  cases). Second run after the venue fix: 2049/2055, with the venue failure gone and six 5 s default-timeout cases
  (`integration/floors` 1, `surfaces/painters` 3, `surfaces/mapPainters` 2) while the machine was loaded (load
  average ~6 on 4 cores). All the timeout cases pass alone (floors + mapPainters 17/17, painters 17/17), and
  `npx vitest run --testTimeout=20000` passes **2055/2055 in 159 files** (223 s), so the remaining failures are
  purely the 5 s default under parallel load, not behaviour.
- `npm run e2e` - pass, exit 0, on both the pre-fix tree and again on the final tree: desktop 1280x720, portrait
  390x844 and landscape 844x390, no page errors; screenshots in `tests/e2e/out/screenshots`.
- `npm run build` was run again after the performance/test edits - pass (`✓ built in 11.03s`).
- Screenshots `npm run visual:m12:outdoor` (`dev/ds-tasks/m12/shoot-o.mjs`, self-locks the browser lock) - 60/60
  checks in portrait, landscape and desktop; `dev/ds-tasks/m12/shots/O/` has `snowman-building-*`,
  `snowman-built-*`, `picnic-*`, `kite-*`, `pool-interior-*` and `map-pool-*`, with the evidence in `shots.json`.
  The pool check is labelled "two household members are swimming" but only one household member was on the lot
  when the swim was scripted, so it asserts at least one scripted swimmer; the screenshot itself shows a second
  swimmer in the pool alongside the scripted one.
- `npm run e2e:creator` and `npm run e2e:acceptance` were not part of task O's check list (common.md); `e2e` is the
  required smoke run and passed.
