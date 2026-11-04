# Task W - seasons and weather: progress

## Design (written before coding)

### Save shape
All new persisted fields are optional additions to schema 1, so there is no save-version bump or migration:

- `WorldState.weather?: WeatherState` with the current kind, the two half-day slots planned for today and tomorrow,
  the day the plan belongs to, the game minute the current half-day began, and `snowCover` for settled snow.
- `SimSettings.seasons?: boolean`, `seasonDays?: 3 | 7 | 14`, `weather?: boolean` (absent = on/7/on).
- `GameSettings.weatherEffects: boolean` (device/localStorage, render-only, absent = on), alongside reduced motion.

`fillWeatherDefaults` in `src/persistence/schema.ts` only repairs malformed values (unknown kinds, bad array shapes,
bad settings) and drops them; a valid plan survives a save/load untouched, so loading never rerolls weather.

### Season maths (`src/core/season.ts`)
Pure: `seasonForDay`, `seasonFor`, `dayWithinSeason` (1-based), `nextSeasonChange`, plus reading the settings with
defaults (on, 7 days, options 3/7/14). Season index = floor(day / seasonDays) mod 4, day 0 = spring. Seasons off always
reads as spring (summer-like: the weather table never produces snow).

### Weather planning (`src/sim/weather.ts`)
Two half-days per day (00:00-11:59, 12:00-23:59). A small integer hash of `seed`, absolute day, half and season (never
the world RNG) picks from a per-season weight table: spring/summer/autumn mostly clear/cloudy with light rain, winter
cloudy with snow, snow only in winter. `ensureWeather` writes/refreshes `state.weather`, keeps an existing plan for the
same day, updates `current` at a half-day boundary, sets `snowCover` when snow falls in winter and clears it outside
winter. It also handles `weather: false` (all clear) and `seasons: false` (spring). The first tick after load uses the
stored plan; no replay of past days is needed.

Outdoors: a person is outdoors when their tile's room (`computeRooms`) is open to the lot border and no roof (at their
level) covers the tile. No cache: called at most once per person per 15 game minutes.

### Moodlets, preferences, traits
- New preference group `weather`: `weather:rain`, `weather:snow`, `weather:sun`, `weather:cold`.
- `TraitDef.effects.weatherBias?: Record<WeatherKind, number>`; a few existing traits get modest leanings (cheerful,
  green-thumb, daydreamer, outdoorsy, homebody, relaxed). `describeTraitEffects` prints them.
- New moodlets: Lovely Weather, Gloomy Day, Cosy Rain, Snow Day!, Caught in the Rain, Chilly.
- `updateWeatherMoods` runs every 15 game minutes: one weather moodlet at most per person, scaled by weather sentiment
  (likes/dislikes and trait biases), with a per-condition cooldown (60 game minutes) and removal when the condition
  changes or expires. Winter outfit check = a 'winter'/'coat' tagged garment in the current outfit.

### Gating
`InteractionDef.weather?: { not?, only?, seasons? }` plus `weatherGateReason` in `src/sim/weather.ts`.
`requestReason` (`options.ts`) adds the reason after the age gate, so options stay listed but greyed ("It is raining.").
`candidatesFor` (`autonomy.ts`) filters candidates at the end, so autonomy never picks a blocked interaction; this also
covers chores, self interactions and objects. Applied to existing garden beds (plant/weed/harvest not in snow, watering
not in rain/snow), the grill, picnic, cloud watching, playground slide/swing and fishing (rain is fine, snow is not).

### Rendering
`Lighting.update(hour, weather, season)` keeps the existing keyframes then tints/limits sky, sun, hemisphere, background
and exposure (cloudy grey/dim, rain darker, snow bright/cool). `EnvironmentView.build(lot, season, snowy)` rebuilds
grass texture, trees and shrubs per season and adds snow cover/goal caps after snow; `TerrainView.setSeason` tints the
painted terrain material; `GardenView` stays as is. A single capped `THREE.Points` mesh (`WeatherView`, 1500 desktop /
600 touch) follows the camera for rain streaks or snowflakes and is hidden for clear/cloudy, when weatherEffects is off,
or when reduced motion is set. Every material is cheap and transparent without depth writes; interior cutaways keep the
existing lighting so rooms stay readable.

### UI and tests
HUD clock gets a season + weather icon/label with a title/aria-label ("Autumn, day 3 - Rain"); compact portrait shows the
icons and keeps the label for the title/accessibility. The feed panel gets a forecast line for today/tomorrow. Settings
gets Seasons/Weather/season length next to visitors and Weather effects next to Display. Tests: season maths, planning
determinism/distribution, persistence, moodlet cooldown/rules, gating reasons and a 28-day headless playtest.

## Progress
- [x] Design written.
- [x] core types + season helpers (`src/core/season.ts`, optional save fields, no schema bump)
- [x] weather planning + mood + gating (`src/sim/weather.ts`, options/autonomy hooks, simulation tick + `refreshWeather`)
- [x] content preferences/traits/moodlets + interaction annotations
- [x] rendering (lighting tint, seasonal grass/terrain/trees/shrubs, snow cover, capped rain/snow particles)
- [x] UI (HUD clock chip, feed forecast, settings in Display and Household life)
- [x] tests (season maths, planning/determinism/distribution, persistence, moodlets/cooldown, gating, 28-day playtest)
- [x] checks (see results below) and visual screenshots (`shoot-w.mjs`)

## Decisions / notes
- No schema bump: every new world field is optional and absent means the default.
- Weather plans are stored, not replayed: a reload keeps today's/tomorrow's forecast and the current half-day.
- Particle count is chosen from touch capability, not quality, so low-end phones always stay capped; reduced motion and
  the weatherEffects setting hide the mesh entirely while the light tint remains.

## Check results

Checked at the end of the task (2026-11-04) on a machine shared with the other Milestone 12 agents, so the heavy
checks were run more than once and the slower runs are called out below.

- `npm run typecheck` - pass, 0 errors. Earlier in the session it failed only in the parallel pool agent's files
  (`src/building/poolPlans.ts`, `src/sim/pool.ts`, `src/render/gameView.ts`, `src/persistence/schema.ts`); those were
  fixed by that agent before the final run, which is clean.
- `npm test` (vitest, 148 files / 1911 tests) - 1907 passed, 4 failed:
  - `tests/unit/integration/travel.test.ts` "the household's own autonomy setting rules on every lot: with it off,
    guests and patrons wait for orders": expected `[]`, got `['introduce']`. Pre-existing and unrelated to weather (it
    also fails without these changes); left untouched.
  - three `tests/unit/surfaces/painters.test.ts` cases hit the suite's 5 s default timeout while the full 148-file run
    was competing with the other agents' work (`tests` time 641 s). Run alone they pass 17/17 in 26 s, so this is load,
    not a regression.
- `npm run content:check` - 0 errors, 0 warnings.
- `npm run build` - OK (built repeatedly by the visual script; only the pre-existing chunk-size and dynamic-import
  warnings).
- `npm run e2e` - OK in desktop 1280x720, portrait 390x844 and landscape 844x390 (exit 0; screenshots in
  `tests/e2e/out/screenshots`; night luminance/contrast in the usual range).
- Visual check `npm run visual:m12:weather` (`dev/ds-tasks/m12/shoot-w.mjs`, self-locks
  `/tmp/hearthside-browser.lock`) - 29/29 checks passed across the three viewports; screenshots in
  `dev/ds-tasks/m12/shots/W/` (`winter-snow-*`, `forecast-*`, `autumn-rain-*`, `spring-clear-*`,
  `winter-snow-interior-*`, `settings-*`). It checks the clock chip text/title/aria-label
  ("Winter, day 1 - Snow", "Autumn, day 3 - Rain", "Spring, day 2 - Clear"), both icons, the feed forecast line, the
  four settings (present, enabled, and on desktop they write the world/device setting) and that no page errors occur.
  The settings list is long, so the script scrolls the season controls into view before the screenshot (they are
  below the fold in portrait and landscape). The HUD chip refreshes on its 250 ms timer, so the script waits for the
  expected label before reading or screenshotting; the first runs raced that timer and read the previous sky.
- API key scan of the working tree before hand-off - no matches (filenames only; `/home/user/apis` was never read).
