# Continuation note

State on 2026-11-05. Work happens on branch `ccr-333d8ff5-slv7qa`. PRs #1-#5 (Milestones 1-9, MPFB bodies and the post-M9
gaps) are merged. Milestone 11 is on PR #6 (merged once all checks pass; standing approval in CLAUDE.md). **Milestones 1-9, 11, 11.5
and 12 are complete and verified** (brief section 26, docs/ROADMAP.md). **Milestone 10 is the only one still open: the surface
catalog is complete** (360 wall finishes, 200 floor designs); 560 furnishings and the full creator catalog remain. The next work is
the rest of Milestone 10, then Milestone 13 (release preparation).

## Milestone status

| Milestone | Systems | Content (target) | Verified |
|---|---|---|---|
| 1 Creator and foundation | done | done | acceptance in all viewports |
| 2 Home editor | walls, runs, rooms, erase, doors/windows (wide openings), floors, delete room, safety rules, undo/redo; Build-mode UI with drag, handles, Confirm/Cancel | 50 walls (48), 32 floors (32), 111 furniture (60), 9 doors, 11 windows | acceptance step 7 (room, door, window, side paint, floor, undo/redo, walk-in) in all viewports |
| 3 Character creator | sliders, presets, outfit slots, locks, undo/redo, ties, import/export, hats squeeze hair | 28 hairstyles (24), 54 garments (48), 15 accessories (12), 20 traits (20), 24 face presets | `npm run e2e:creator` 288/288 (96 per viewport) |
| 4 Daily life | six needs, cleaning, dishes, messes, repairs, repairperson, skill effects, chore autonomy | 111 furniture (100) incl. hobby, kids, outdoor, dishwasher | 7-day playtests (1/2/4 people), `npm run visual:m5` overlays |
| 5 Relationships and events | friendship/trust/romance, labels, adult romance gating, memories, 8 event types, planner, goal card | 35 socials (24), 8 event types | acceptance social steps; `npm run visual:m5` goal card in landscape |
| 6 Careers and economy | 13 career tracks (after M11) with work effort, promotion/demotion and career decisions, freelance income, weekly bills with late fees and utility cut-offs, career/wealth aspirations | 13 careers x 10 levels (6), 19 ready skills (10), 13 aspirations (6) | M6 unit/integration tests; acceptance step 8 (career panel, bill payment, freelance sale) |
| 7 Neighbourhood and venues | Lot travel (20-40 game minutes, free), one active lot, 4 NPC households generated once from the world seed with jobs and cross-household relationships, light off-lot schedule (work, home, venue visits), NPC pay once and NPC bill auto-pay, invite home, household switching, rent/buy and moving (owned home sells at 80%), lazy venue/home layouts validated for reachability, 15 venue interactions with once-only costs, library quiet rule, no sleeping in public venues; Map/List modal, lot detail sheet, trip chip, away card; phone landscape HUD (funds drop cents from $1,000 up, icon-only Map/Menu) | 14 lots (12), 6 usable venues (3), 121 furniture (10 new models) | acceptance step 9 (map, travel to park, venue activity, go home, switch preview) in all viewports |
| 8 Family and life stages (PR #4) | seven life stages (baby to elder) with per-stage MPFB bodies, lazy-loaded; aging off / long / normal / custom, optional elder end of life; birthdays; school with performance, homework and report cards; babysitter; adoption; moving out (household split); age-gated interactions and family socials; family view and dialogs; 6 family furniture models | 7 life stages | acceptance step 10 (`stepFamily`) in all viewports; `npm run e2e:acceptance` |
| 9 Multiple floors and exteriors (PR #4) | levels 0-2 (3 m apart, walls 2.8 m); upper floors need support, balconies up to 2 tiles out; stairs as objects with stairwell cut and undo; multi-level path search; HUD level selector; two-storey Hazelbank loft; 12 roof styles and 11 finishes, Roof camera toggle, auto roof; 24 fence designs (123 variants) and 12 gates (64 variants); 12 terrain paints; 16 garden objects and 10 crops (plant, water, weed, harvest at 75 % of value) | 3 floors, 12 roof styles, 24 fences, 12 gates, 12 staircases (catalogue has 9 straight and 4 spiral) | acceptance step 11 (`stepFloors`, `stepExterior`) in all viewports; `--steps=12` runs the exterior part alone |
| 10 Complete catalogs | surfaces done: AI-sourced and code-painted wall and floor designs, palette tinting, on-demand maps (pipeline below) | 360 walls (360), 200 floors (200), 560 furnishings (open), full creator catalog (open) | surfaces complete; furnishings and creator catalog still open |
| 11 Complete progression and social scope (own PR) | 13 careers (130 levels) with 17 on-the-job events; six ready skills with practice activities and effects (baking, wellness, creativity, photography, fishing, research); six new objects (bread oven, yoga mat, sketchbook, camera tripod, telescope, stocked garden pond); 40 traits in six categories; 13 three-stage, adult-only aspirations; 45 social interactions; once-only payouts through `transact` | 13 careers (12), 19 skills (16), 40 traits (40), 13 aspirations (12), 45 socials (40) | typecheck, 1746 tests, content check, build, `e2e:creator`; visual checks 25/25 careers, 45/45 skills, 39/39 photography/fishing/research, 19/19 traits |
| 11.5 Animations and activity feedback (own PR) | moving parts and effects driven by the running action (21 descriptors: fridge/oven doors, hob rings and steam, wardrobe, toilet lid, shower/bath, taps, dishwasher); hand props on the rig (snacks, ingredients, plate and fork, books, phone, mug, tools); computer and TV screens (word processor, code, game, browser, TV); a stage-weighted progress pill above the head with Household/All/Off; all render-side, no save fields | no new content; the screen pictures are deterministic generators | acceptance step 13 (`--steps=13`) in all three viewports; `visual:m115:d` 24/24, `visual:m115:h` 27/27, `visual:m115:screens` 57/57, `visual:m115:b` 41/41 |
| 12 Environment and venues (own PR) | seasons (3/7/14 days) and a two-half-day weather plan stored in the save (clear/cloudy/rain/snow, snow only in winter); seasonal lighting, grass, trees, terrain and snow cover; capped rain/snow particles with a Weather effects setting; weather moodlets, preferences and trait biases; weather/season/outdoor/day/night gates that grey out options and filter autonomy; nine outdoor activities and two socials; pools (build tool, ladders, blocked water, swimming, graceful Get Out); the seventh venue, Quayside Baths (6 x 10 pool, changing rooms, sun deck) | 7 venues (6), 108 activities (40), 47 socials (40), 3 pool styles | acceptance step 14 (`--steps=14`) in all three viewports; `visual:m12:{weather,outdoor,pools}` 29/29, 60/60, 33-36/36 |

## How to check Milestones 11.5 and 12

Acceptance steps 13 and 14 run in every viewport (step 13 is M11.5, step 14 is M12); run them alone with
`npm run e2e:acceptance -- --only=portrait --steps=13,14 --fast-start` (portrait or landscape; the desktop viewport
takes about 40 minutes for the full run).

- **Animations and feedback (step 13).** Pause the game, select a household member and queue Cook a Meal at the fridge.
  Step 11 can leave the household upstairs, so the step first picks a member who is already on the kitchen floor, or
  walks the chosen one down (Cook a Meal's check only accepts a stove on the actor's own level; the option itself is
  offered from any floor).
  During the 2-minute reach-in the fridge door is open (the probe reports `openness` above 0.5 once one sim tick has
  advanced the game clock: at speed 0 frames alone do not move it) and an ingredients prop is in the right hand; at the
  stove the door closes, the hob rings/pot/steam appear and the prop becomes a spatula; the served plate is carried, the
  eater holds a fork with the plate placed on the table and the pill shows "Eat complete" at 100 %; writing at the
  computer shows the document screen with progress that grows, then the screen turns off. The acceptance script injects
  `window.__t` with read-only probes: `objectAnimState(objectId)` (parts, target, openness, interiorVisible),
  `handProps(personId)` (right/left/carried/placed), `screenMode(objectId)` (mode, progress, title) and
  `pill(personId)` (label, value, done, cancelled, fill width, box); `person(id, y)` gives screen coordinates and
  `pick(x, y)` the pick under a point.
- **Weather and seasons (step 14, part 1).** Use `window.hearthside.debug.setWeather(kind)` (`clear`, `cloudy`, `rain`,
  `snow`) after moving the clock to an absolute day (`state.clock.minutes = day * 1440 + 600`; day 0 is spring, day 14
  autumn 1, day 21 winter 1 with 7-day seasons) and step one tick. It pins the current day's plan and keeps settled
  `snowCover`; `ensureWeather` keeps a same-day plan, so it lasts until midnight. Check the HUD `.clock-sky` text, title
  and aria-label ("Autumn, day 1 - Rain") - it refreshes on a 250 ms timer, so poll it rather than read it once - and that
  Rake Leaves is greyed with "It is raining." in rain and enabled in clear weather. In winter snow, Build a Snowman is
  offered (the self menu is reached with a person pick: `game.options(m, { kind: 'person', personId: m })`) and leaves a
  `snowman` object; the snow stays on the ground when the weather clears.
- **Pools (step 14, part 2).** Build mode -> Build panel -> Pool tab -> a style card -> drag a 2 x 3 rectangle ->
  Confirm. The preview shows the size and price; the pool keeps a ladder on a short side and charges the posted price.
  Pick a water tile: Swim in the Pool / Relax in the Pool, and Get Out while swimming. The member changes into the swim
  outfit, the `swim` anim plays with the body at the surface, and Get Out always ends on the ladder's deck tile (the
  acceptance script records every tile visited and asserts none is water).
- **Quayside Baths (step 14, part 3).** Open the map: the venue "Quayside Baths" (lot `lot_3a` in a new world) has
  Go here. Travel, check the pool is 6 x 10 with two ladders, then Go home. Existing saves keep their lot list (the
  venue only exists in worlds created after M12).
- **Full scenarios.** `npm run visual:m115:d|h|screens|b` for the M11.5 screenshots and `npm run visual:m12:weather|outdoor|pools`
  for M12; each self-locks the browser lock. The visual scripts and the acceptance steps pause the game and drive it
  through `debug.step`/`debug.frame`, so `state()` is deterministic between steps.

New debug hooks in `src/main.ts`: `setWeather(kind)` (above), plus the existing `step(n)`, `frame(dt)`, `state()`,
`run(name, ...args)` and `stats()`. `window.__t` is injected only by `tests/e2e/acceptance.mjs`.

Checks on the final state:

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 96 files, 1229 tests |
| `npm run content:check` | 0 errors, 0 warnings |
| `npm run build` | passes (main chunk about 1.8 MB, warning only) |
| `npm run e2e` | OK in desktop, portrait and landscape |
| `npm run e2e:creator` | 288/288 |
| `npm run e2e:acceptance`, portrait 390x844 | 203/203 |
| `npm run e2e:acceptance`, landscape 844x390 | 202/202 |
| `npm run e2e:acceptance`, desktop 1280x720 | 194/194 |
| `npm run visual:m5` | 14/14 |

Checks on the M8 and M9 state (PR #4):

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 117 files, 1655 tests |
| `npm run content:check` | 0 errors, 0 warnings |
| `npm run build` | ok |
| `npm run e2e` | OK |
| `npm run e2e:creator` | 288/288 |
| `npm run e2e:acceptance`, portrait 390x844 | 315/0 |
| `npm run e2e:acceptance`, landscape 844x390 | 313/0 |
| `npm run e2e:acceptance`, desktop 1280x720 | 302/0 |

Checks on the M11 state (own PR):

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 129 files, 1746 tests |
| `npm run content:check` | 0 errors, 0 warnings; 13 careers / 130 levels, 19 ready skills, 40 traits, 13 aspirations (39 stages), 45 socials |
| `npm run build` | passes (main chunk about 2.27 MB, warning only) |
| `npm run e2e` | OK |
| `npm run e2e:creator` | 288/288 in portrait, landscape and desktop |
| `npm run e2e:acceptance` | 315/315 portrait, 313/313 landscape, 302/302 desktop |
| `npm run visual:m11:careers` | 25/25 |
| `npm run visual:m11:skills` | 45/45 (baking, wellness, creativity; yoga mat, bread oven, sketchbook) |
| `npm run visual:m11:skills-c` | 39/39 (photography, fishing, research; camera, pond, telescope) |
| `npm run visual:m11:traits` | 19/19 (40 traits, 13 aspirations, conflict explanation) |

The M11 numbers above were rerun on the final tree after task E (2026-11-03): typecheck clean, 129 files / 1746 tests, content
0/0, build passes with the existing 2.27 MB main-chunk warning.
Acceptance step 10 is `stepFamily` (M8); step 11 is `stepFloors`, then `stepExterior` (M9). `--steps=12` runs the exterior part alone.
Fixed late in M9: stairs did not show their mesh after a lot change. The cause was a stale pending promise in `render/objectAssets.ts`
together with a purge in `setLot`. Runtime models are no longer purged, and acceptance checks `view.objects.hasModel(id)`.

Earlier checks rerun after the MPFB switch (MPFB is the default style). Step 9 (M7: map, travel to the park, venue activity, go home, switch preview) passes 29/29 in each viewport after the
phone landscape HUD fix. All runs are SwiftShader emulation. Notes from the verification runs are in `dev/ds-tasks/01-progress.md`.

## Next steps, in order

1. Merge PR #6 (Milestone 11) if it is still open, then this PR (Milestones 11.5 and 12); standing approval: merge every PR
   once all checks pass.
2. Milestone 10, complete catalogs: surfaces are done (360 walls, 200 floors). The remaining targets are 560 furnishings and the
   full creator catalog (ROADMAP). Current counts are in `docs/CONTENT_STATUS.md`.
3. Milestone 13, release preparation: guidance, balance, accessibility, recovery and measured mobile performance (ROADMAP).
4. Polish of the M8, M9, M11, M11.5 and M12 gaps (listed under "Known issues").
5. People: brow styles, the garment hem flare on the female body, real-device performance.
6. Performance:
   - Main chunk is about 2.3 MB. Lazy-load the build, creator and dev modules and split `content`.
   - Measure on a real phone.
7. Real-device runs. Record them in the device log in `docs/TEST_CHECKLIST.md`.

## Known issues

- M8 family and life stages:
  - Town children are only generated for new worlds; older saves keep their childless town households.
  - The sitter only serves the household you play.
  - The move-out dialog scrolls in phone landscape.
  - Babies have no curled pose. Elder wrinkles are one procedural map shared by all elders (albedo and bump only, no geometry).
  - Feet slide a little when walking.
  - The sim does not mark carrying explicitly (`peopleView` uses a heuristic).
- M9 floors and exteriors:
  - Only straight stairs are tested in acceptance. The spiral and length-4 stairs are in the catalogue but less tested.
  - The camera bar now has 7 buttons and was not measured on phones narrower than 390 px.
  - Roofs only draw at or below the active level, and only with the Roof toggle on.
- M11 progression and social:
  - The new career ladders ask for photography, wellness, creativity or research only from level 4-5, so a new hire can climb
    the first rungs with practised skills. This is deliberate; every new career still trains all its listed skills per shift.
  - The six new objects have no breakage or plumbing behaviour (they are hobby/outdoor objects, not appliances); the bread
    oven is cleanable like a stove.
  - Fishing and photo walks at venues depend on the venue interaction lists; the park is the only fishing venue.
  - The yoga mat is a rug: it can be placed under furniture and people walk over it, so it is not a blockage.
  - The fish item uses the normal meal portion path (spoilage and eating); it is not yet a fridge-storable raw ingredient.
  - No M11 acceptance step was added; the milestone is covered by the unit/integration suites and the four visual scripts.
- M11.5 animations and feedback:
  - The moving parts and hand props are render-side derivations: they need the action to be running and the object/person
    visible on the active lot and level. Off-lot or hidden people keep no props (by design), and a paused game freezes
    doors and effects.
  - The screen pictures are illustrative (a deterministic word processor, editor, game, browser and TV), not real content;
    progress comes from `elapsed / duration`.
  - The progress pill is DOM inside the world overlay; its 10 Hz sampler only updates people on screen, and the completion
    state lasts 700 ms (a screenshot needs to freeze `performance.now()`).
- M12 seasons, weather, pools and venue:
  - Weather is planned two days ahead only; there is no forecast beyond tomorrow. Shade from umbrellas and awnings does not
    count as shelter (`outdoorsAt` only looks at rooms and roofs).
  - Pools are ground level only; the water is not swimmable for toddlers (children and older), and an outdoor pool is
    closed while it snows (a roofed pool stays open).
  - Winter snow cover persists until the season turns or three snow-free winter days melt the snowman; rain does not melt it.
  - The Quayside Baths lot exists only in worlds created after M12; old saves keep their 14 lots.
  - Rain/snow particles are capped at 1500 desktop / 600 touch and hidden by reduced motion or Weather effects off.
- Flakes in acceptance:
  - Step 2 "neighbour visible to tap".
  - Step 7 wall-paint side checks, seen in portrait.
  - Step 8 "computer: tap point picks the intended thing" hit wall `0:h:13:4` once in landscape and once in desktop; `tapAndOpenMenu` now turns the camera and looks again when a wall hides an object (desktop passed 302/0 after that).
  - Step 11 "Water the Bed" could be refused by rain; the garden section now calls `forceClearWeather(T)` (task F).
  - Steps 13 and 14 read the HUD chip by polling (its 250 ms timer can lag), advance one sim tick before reading the
    fridge door's openness (at speed 0 frames do not move the game clock), and fetch the self menu with a person pick
    (`{ kind: 'person', personId: m }`; `PickResult` has no `'self'`). The carried plate is read at the first stage-2
    tick of Cook a Meal, before the served item takes over in the world.
  - Desktop acceptance takes about 35-40 minutes.
- Main JS chunk about 1.65 MB, and `content/index.ts` is imported both statically and dynamically. Lazy-load
  build/creator-only modules.
- Boot progress bar is not driven.
- M7 neighbourhood:
  - `goForJog` jogs in place (no track loop); no community event at the arts centre.
  - Furniture does not move with the household. NPC households never move and townies never change jobs.
  - One trip at a time; a split household cannot be watched on two lots.
  - `LotInfo.usable` is false until a venue is first built (layouts are lazy).
  - The portrait map is wider than the screen: pan, or use List. The phone has no map entry.
  - Acceptance step 8 once saw every computer option disabled ("Unavailable (6)") in landscape, for an unknown reason.
    The test now waits for an idle member with an enabled option and logs per-option reasons if it recurs.
  - In compact menus where every entry is disabled, the entries fold into a closed "Unavailable" group (UX to revisit).
  - Dailylife test seed 303 leaves a TV broken for days (nonessential repair weakness). The default seed is now 305.
  - Occasional flakes: creator "Random person" invalid household; neighbour not tappable in step 2.
- Creator M3 run (`npm run e2e:creator`, `tests/e2e/creator-m3.mjs`): portrait ran once (73 checks passed); the script fixes made afterwards (suit picked in the wrong category, tie, export, substitution-dialog selectors, preview-change threshold) and the landscape and desktop viewports have not been run. Open: after Load household template the confirm button tap times out, and the Review tab was not reachable after that, which may be a real dialog or stacking bug. Hats: the sun hat brim hides the eyes in the forward-tilted idle pose; scarf tails and necklaces were retuned after the last screenshots.
- Garments: a faint seam on the thigh where swimwear leaves the baked shorts visible; folds are static; seated skirts open
  like a lampshade.
- AI hair: box-braids and twin-tails have flat parts; some bangs stop at eye level; the backs are invented by TRELLIS.
- Weddings are not events, gifts are a $20 social, and dates are still planned at home.
- Room move, resize and duplicate are not implemented. Delete room is.
- Only SwiftShader emulation so far; record real devices in the TEST_CHECKLIST device log.

## Assets and AI generation

- **People.** Three character styles (Settings > Display, `GameSettings.characterStyle`): `mpfb` ("Natural", the default), `detailed`
  (Meshy bodies: `dev/meshy/`, `npm run assets:meshy` builds `public/assets/characters/meshy_{a,b}.glb`) and `classic` (procedural).
  Saved settings from before the version stamp are moved once from `detailed` to `mpfb` (`migrateSettings`; a saved `classic` stays).
  Meshy credits left: 42.
- **fal.ai.** The key is in the user's repo `felixarvid2/apis`, file `Fal.ai`, cloned to `/home/user/apis`. Read it at run
  time; never print or commit it. Use `queue.fal.run` or `fal.run`, never `api.fal.ai`, where a proxy overrides auth.
  - Budget: $10 total, about $1.25 spent. Ledgers: `dev/hair-ai/LEDGER.md` and `dev/surfaces-ai/LEDGER.md`.
  - Allowed models: FLUX schnell/dev and TRELLIS. Do not use Hunyuan3D: its licence excludes the EU.
- **AI hair.** `npm run hair:ai` (`tools/build-ai-hair.mts`, `tools/hair-ai/`). Raw generations are cached in
  `dev/hair-ai/raw/` (gitignored, so a fresh clone has to regenerate them, which costs money).
- **AI surface maps.** `npm run assets:surfaces -- --group <group>` builds them from `dev/surfaces-ai/raw/` (gitignored).
  Sources are data in `dev/surfaces-ai/sources/<group>.mjs`; `node dev/surfaces-ai/generate.mjs --group <group>` fetches
  missing ones (budget cap and ledger in `dev/surfaces-ai/LEDGER.md`).
- **Adding or fixing a surface design.** Content lives in `src/content/surfaces3/<group>.ts` and per-group painters in
  `src/render/textures/packs/<group>.ts`; the shared painters are `motif-wall`, `motif-floor` and `mural-wall`. Add a source
  to `dev/surfaces-ai/sources/<group>.mjs` (kind material, motif or mural), generate it, run
  `npm run assets:surfaces -- --group <group>` (rebuilds the maps and `src/render/textures/surfaceMapIds.generated.ts`), then
  check with `npm run visual:surfaces -- --group <group> [--ids a,b] [--palettes]` and `npm run content:check`. Palettes tint
  the sources, so a design works with every palette; maps load on demand (only the 14 base maps and the active lot's maps are
  preloaded).
- **Licences.** Check the Meshy, FLUX and TRELLIS output terms before distribution (see `public/assets/LICENSES.md`).
- **MPFB bodies.** Blender 4.5.15, MPFB 2.0.18 and MakeHuman CC0 asset packs are installed outside the repo (see
  `tools/mpfb/README.md`, which also defines the GLB format). `npm run assets:mpfb` builds `public/assets/characters/mpfb_{f,m}.glb`
  (meshopt, 24 morph targets: 10 body, 14 signed face; skin, underwear, eyes, iris, brows, lashes on the UAL skeleton). They are the
  game's default people since the MPFB integration: `src/characters/mpfbBody.ts` (pure: slider -> morph maps, tone maths,
  `MorphField`, assembly), `assets.ts` (loader, meshopt decoder imported on first use), `createMpfb*Material` in `materials.ts`,
  `CharacterView` (extra meshes, underwear flags). See ARCHITECTURE.md "characters". Viewer: `dev/mpfb.html`; lab shots of the
  integration: `node dev/mpfb/shootLab.mjs --plan=bodies|faces|faceeach|outfits|hats|leaks` (`dev/characters.html?style=mpfb`).
  - Garments, hair and accessories carry the body's own morph targets by nearest-skin-vertex transfer (per body part), so they follow
    every slider; sliders without a target (arms, legs, neck, male chest, cheekbones, nose bridge, ear size, eye tilt/height, brow
    angle) use the old displacement fields. `MPFB_SLIDERS` gains are lower than the GLB's `sliderGain` (a full creator slider moves the
    surface 3-4 cm like the other styles; the GLB gain of 3 / 2 for weight / muscle is for the viewer's full macro).
  - Not supported on the MPFB bodies: the eight brow styles (one brow mesh), the height slider (none exists).

## Running agents on DeepSeek (saves the Claude quota)

`bash tools/ds-agent.sh <prompt-file> <log-file> [max-turns]` runs a headless Claude Code agent against OpenScale
(`https://api.openscale.so`, Anthropic-compatible) with `deepseek/deepseek-v4.1-flash`. The key is read at run time from
`/home/user/apis/Deepseek2` (repo felixarvid2/apis); it is never printed. The agent may edit files and run npm/npx/node checks
only; git, curl and rm are blocked, so a supervising session commits its work. Task prompts live in `dev/ds-tasks/`
(`01-finish-m2-m5.md` is the remaining Milestone 2-5 work; progress in `dev/ds-tasks/01-progress.md`, logs are gitignored).

## Working conventions

- TokenEconomizer (https://github.com/microsoft/TokenEconomizer, Apache-2.0) is enabled for this repository in
  `.claude/settings.json` (project scope). New Claude Code sessions load it: tool pruning and the failure-loop guard are
  on, micro-skills off (default). `.claude/settings.json` sets `TOKENECONOMIZER_HOME=.tokeneconomizer`, so what it
  learns lives in the repository and survives fresh cloud containers (start sessions in the repository root; the path is
  relative). **Before the last commit of every session, run `bash tools/te-save.sh`** and commit `.tokeneconomizer/`
  with the rest: it folds the sessions the plugin recorded, including the running one, which a cloud container would
  otherwise lose. Check with `/tokeneconomizer:status`, turn off for one session with `TE_DISABLE=1 claude`, and give
  pruned tools back with `/tokeneconomizer:toolprune restore`.

- Browser runs share `/tmp/hearthside-browser.lock`. Wrap custom Playwright scripts in `flock /tmp/hearthside-browser.lock ...`,
  but never wrap `tests/e2e/acceptance.mjs` or `run-e2e.mjs`, which take the lock themselves (a nested lock deadlocks).
- Before every commit, scan for the fal key:
  `grep -rlF --exclude-dir=node_modules --exclude-dir=.git "<secret part>" .` must print nothing.

## Commands

| Command | Notes |
|---|---|
| `npm install` | |
| `npm run typecheck` | |
| `npm test` | |
| `npm run build` | |
| `npm run content:check` | |
| `npm run e2e` | |
| `npm run e2e:acceptance -- --only=portrait\|landscape\|desktop` | |
| `npm run e2e:creator` | |
| `npm run assets` | needs `../test/assets` |
| `npm run assets:meshy` | |
| `npm run assets:surfaces -- --group <g>` | builds the committed maps and `surfaceMapIds.generated.ts` |
| `npm run hair:ai -- images\|models\|build\|sheet\|content` | |
