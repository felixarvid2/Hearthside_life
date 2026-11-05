# Task O — outdoor life and the public swimming pool

Status: in progress (resumed after the machine restart; the previous run left no code or progress file behind, so
this run implements the task from the start and records the design here before coding).

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

- `outdoor`: the person must be in the open air (`isOutdoors`, which already accounts for roofs).
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
- `sun-lounger` (1 x 2, sit slot) offers Sunbathe and Sit.
- `kite` (1 x 1 non-blocking lawn prop, the kite on its line) offers Fly a Kite.
- `snowman` (`'dev'`, not in the Buy catalogue) is created by Build a Snowman.

Their models are original `proc:` meshes built at runtime (`src/render/outdoorModels.ts`, registered through the
existing procedural-model hook), with SVG catalogue thumbnails. `content:check` regenerates
`docs/CONTENT_STATUS.md` counts.

### Pool venue

- `VenueType` gains `'pool'`; `VENUES.pool` is open 06:00-21:00 with capacity 4 and a blurb; `VENUE_TYPES` and
  the HUD icon map gain the pool (the `pool` icon already exists).
- A thirteenth `LOT_SPEC` ("Quayside Baths", 32 x 32, map 50,27) is appended, so new worlds get it. Existing saves
  are untouched: the lot record only exists in worlds created from now on, and no save-version change is needed
  (Task W owns the version). A free lot record is not reused because a 24 x 24 vacant home cannot hold the 32 x 32
  plan, and rewriting an existing save's lot list would change ids and household homes.
- `poolPlan()` (world/venues.ts) builds a 22 x 20 hall: a pool hall on the west with a 6 x 10 pool (x 7..12,
  z 8..17) and ladders on both short sides, a wall at x = 15, a changing room and shower room on the east, a
  lobby with benches and a vending machine, and a sun deck south of the building with loungers, planters and
  trees. A flat roof is added to `lot.roofs` over the building; windows line the walls.
- The pool record is written straight into `lot.pools` before `finish`/`lotProblems`, so the venue must pass the
  same reachability check as every other venue.
- Townie outings get a `'pool'` weight in `venueWeight` and the venue is included automatically by the existing
  venue loops.

### Tests

- `tests/unit/sim/outdoor.test.ts`: every new gate (offered in fitting weather/season/time/place, greyed with the
  expected reason otherwise), snowman create/persist/melt, picnic and snowball socials.
- `tests/unit/world/venueLayouts.test.ts`: pool added to the venue matrix and its layout requirements.
- `tests/unit/integration/poolTrip.test.ts`: the household travels to the pool, swims, showers and comes home.
- `tests/unit/integration/outdoor-playtest.test.ts`: 28 days with weather on; each new activity is chosen by
  autonomy at least once in fitting conditions and never in unfitting ones.
- Existing counts that change (neighbourhood lot count, venue-restricted list) are updated.

## Decisions

- **Existing saves**: no pool venue retrofitted, no save-version change. The new `LOT_SPEC` is only read when the
  neighbourhood is created; old worlds keep their lot list and ids. The alternative (turning a vacant home lot
  into a pool) would either change the lot's size/kind mid-save or break the 32 x 32 plan on a 24 x 24 lot.
- **Weather rule**: extended with optional, additive fields rather than adding a second per-interaction condition
  field, so every gate lives in one place and both the menu and autonomy share it.
- **Snowman**: an ordinary placed object with an optional state block, so save/load, rendering and nav need no
  special cases; `status: 'dev'` keeps it out of the Buy catalogue.
- **Kite/sun lounger are object interactions** (a prop on the lawn, a lounger on the deck), which gives the
  activities a real route/use/cleanup lifecycle instead of a self-only animation.

## Progress

- [ ] Weather rule + gate helpers
- [ ] Activities, objects, moodlets, socials
- [ ] Snowman lifecycle
- [ ] Pool venue
- [ ] Tests
- [ ] Screenshots
- [ ] Checks

## Check results

(To be filled in.)
