Read dev/ds-tasks/m12/common.md first and follow it. Read dev/ds-tasks/m12/W-progress.md, P-progress.md and
F-progress.md (what the weather, pool and fix agents built). Four other agents (dev/ds-tasks/m115/) work in parallel on
render-side animations (src/render/objectAnim.ts, screensView.ts, handProps.ts, actionProgress.ts, the progress pill,
src/content/screens.ts); do not touch those files, and keep edits to shared files small and additive.

## Task O: outdoor life and a public swimming pool venue

1. **Weather- and season-bound outdoor activities.** Add at least eight new outdoor interactions that use the
   `InteractionDef.weather` gate (`{ not?, only?, seasons? }`, see src/content/types.ts and src/sim/weather.ts), each
   with a clear purpose (needs, skill xp, moodlet, social) and full lifecycle (route, prepare, perform, cleanup,
   cancel), offered greyed with a reason when the weather/season rules them out:
   - Build a Snowman (winter, only after snow has fallen / while snow lies; leaves a snowman object or decal on the
     lot that melts when the season turns or after a few warm days), Snowball Fight (social, 2+ people, winter),
     Make Snow Angel (winter).
   - Have a Picnic (spring/summer, not in rain; on a picnic blanket or at park tables; uses a meal or snack, social
     with others), Fly a Kite (spring/autumn, cloudy or clear, needs open lawn), Rake Leaves (autumn; a cleaning-like
     chore that gives a moodlet "Crisp Autumn Air"), Jump in Puddles (child/teen, during or just after rain),
     Stargaze (clear nights, any season; logic or creative-like skill if one fits), Watch the Rain (indoors at a
     window or under a roof, during rain, gives "Cosy Rain"), Sunbathe (summer, clear, on a lounger or towel).
   Add the objects they need to the Buy catalogue where needed (snowman is created, not bought; picnic blanket,
   sun lounger, kite as a prop are code-built or reuse existing models; keep the count small and original) and make
   sure `npm run content:check` and the content counts in docs/CONTENT_STATUS.md stay correct (the generator updates
   it). Make autonomy use them sensibly (weather-gated candidates already filtered in src/sim/autonomy.ts).
   Life-stage gating where it matters.
2. **Public swimming pool venue.** A seventh public venue type 'pool' (`VenueType` in src/world/lotBuilders.ts,
   layout in src/world/venues.ts, neighbourhood lot record and map position in src/world/neighbourhood.ts or wherever
   venues are listed, venue blurb/icon in the UI). Layout: an indoor hall (walls, roof, windows) with a 6x10 lap pool
   (with ladders, built with the pool data/commands from task P), changing room area, benches, a vending machine or
   snack bar, showers, and an outdoor area with sun loungers. Venue activities: swim laps (fitness), relax in the pool,
   sunbathe outside in summer, use the showers. NPC patrons visit it like other venues (see src/sim/townlife.ts and
   the venue patron logic). The venue must pass the lot reachability check. Existing saves: the new lot is added
   only for new worlds unless the neighbourhood has a free lot record that can become it safely; document the
   decision (no save-version change unless unavoidable; task W owns the version, coordinate by reading
   src/persistence).
3. **Tests.** Unit tests for every new gate (offered in the right weather/season, greyed reason otherwise),
   snowman lifecycle (made, persists through save/load, melts), picnic/snowball socials, the venue layout (reachable,
   pool has ladders, required objects present) and a headless playtest: a household travels to the pool venue,
   swims, showers and comes home; a 28-day world run with weather on where each new activity is chosen by autonomy
   at least once in a fitting weather/season and never in an unfitting one.
4. **Screenshots** with a script `dev/ds-tasks/m12/shoot-o.mjs` in all three viewports: a snowman being built in
   winter, a picnic, a kite in the air, the pool venue interior with swimmers and the venue on the neighbourhood map.
   Use `window.hearthside.debug.setWeather(kind)` (added by task F) to force weather.

Progress file: dev/ds-tasks/m12/O-progress.md.
