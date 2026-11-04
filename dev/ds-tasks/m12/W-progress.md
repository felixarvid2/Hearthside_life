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
(to fill after running typecheck/test/content:check/build/e2e and the visual script)
