Read dev/ds-tasks/m12/common.md first and follow it.

## Task W: seasons and weather (simulation, mood, options, rendering, HUD)

You own the save version for Milestone 12: if you must change persisted state shape in a non-optional way, bump the
save version and add a migration in `src/persistence/` with a test; otherwise keep fields optional.

1. **Seasons.** Spring, summer, autumn, winter, derived from the clock day: a setting `seasonDays` (default 7 game days
   per season; options 3, 7, 14) and a setting `seasons: boolean` (default on; off = always summer-like spring, no
   snow). Pure helpers in `src/core/season.ts` (season for a game minute, day within season, next change) with tests.
2. **Weather.** States clear, cloudy, rain, snow (snow only in winter; light rain possible in all seasons). Plan the
   weather per half-day deterministically from the world seed and the day (table of chances per season, e.g. summer
   mostly clear, autumn more rain, winter cloudy/snow). Store the current weather and the forecast for today and
   tomorrow in state (optional field) so a save/reload keeps it; recompute nothing on load. Setting `weather: boolean`
   (default on; off = always clear; the sim and rendering both honour it) and a separate `weatherEffects: boolean`
   (render-only: rain/snow particles off, simple tint stays) for slow phones.
3. **Effects on people.** Add weather preferences to the preferences/traits system (likes rain, likes snow, likes sun,
   dislikes cold; give a few existing traits a weather leaning where it fits, e.g. a nature-loving or sunny trait) and
   moodlets (e.g. "Lovely Weather", "Gloomy Day", "Cosy Rain", "Snow Day!", "Caught in the Rain" when outdoors in
   rain, "Chilly" outdoors in snow without a winter outfit). Outdoors = not under a roof/room (there is room/roof data
   in `src/world`). Moodlets must have cooldowns and must not stack every tick.
4. **Outdoor availability.** A gating hook in `src/sim/gating.ts` (or next to it) so an interaction can declare
   `weather?: { not?: WeatherKind[]; only?: WeatherKind[]; seasons?: Season[] }` in `InteractionDef`; outdoor
   interactions that make no sense in rain/snow (e.g. gardening, sunbathing if any, outdoor exercise, park picnic if
   present) are offered greyed with a reason ("It is raining") instead of disappearing, and autonomy skips them.
   Apply it to the existing outdoor interactions (garden objects, park, playground, fishing: fishing in rain is fine).
   Another agent adds new outdoor activities later; just provide the mechanism and apply it to what exists.
5. **Rendering.** In `src/render/` (see `environment.ts`, `lighting.ts`, `terrainView.ts`, `gardenView.ts`): sky and
   light tint per weather (cloudy greyer and dimmer, rain darker, snow bright and cool), seasonal colours for lawn,
   terrain grass, trees and shrubs (spring fresh green, summer deep green, autumn orange/brown foliage, winter pale
   with snow cover on the ground and tree tops when it has snowed), rain streaks and snowflakes as one cheap particle
   mesh following the camera (cap ~1500 on desktop, ~600 on touch devices; off when `weatherEffects` is off or
   reduced motion is set). Interior views (cutaway walls) must still read clearly.
6. **UI.** The HUD clock area shows a small season + weather icon (use the existing icon set in `src/ui`) with a
   tooltip/label ("Autumn, day 3 - Rain"), and a forecast line in an existing info panel. Add the three settings
   (Seasons, Weather, Weather effects, season length) to the existing game options screen, next to the aging and
   visitors settings, in all three viewports.
7. **Tests.** Unit tests for season maths, weather planning determinism and distribution, persistence round trip,
   moodlet rules and cooldowns, gating reasons; a headless playtest that runs 28 game days with weather on and checks
   every season and every weather kind appeared, nothing crashes and needs stay sane. Update
   `tests/e2e/run-e2e.mjs` only if a smoke check needs it.

Do not add pools or new outdoor activities (other agents do that). Progress file: dev/ds-tasks/m12/W-progress.md.
