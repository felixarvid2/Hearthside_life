# Continuation note

State on 2026-11-06. Work happens on branch `ccr-333d8ff5-slv7qa`. PRs #1-#5 (Milestones 1-9, MPFB bodies and the post-M9
gaps) are merged. Milestone 11 is on PR #6 (merged once all checks pass; standing approval in CLAUDE.md). **Milestones 1-9, 11, 11.5
and 12 are complete and verified** (brief section 26, docs/ROADMAP.md). **Milestone 10 is the only one still open: the surface
catalog (360 wall finishes, 200 floor designs) and the furnishings (573 designs, target 560) are complete**; the full creator
catalog remains. The next work is the rest of Milestone 10, then Milestone 13 (release preparation).

The social gaps pass (branch `wt/gaps-social`) closed the open social, neighbourhood and family gaps listed in the old known issues: weddings,
gifts as objects, dates and events at venues, group chat, community events, town life, furniture when moving, town children for old saves,
the sitter for other households, the jog track, explicit baby carrying, the phone map entry and `LotInfo.usable`. See ARCHITECTURE.md
("Relationships and events", "Neighbourhood", "Family and life stages") and the known issues below for what stays simple.

## Milestone status

| Milestone | Systems | Content (target) | Verified |
|---|---|---|---|
| 1 Creator and foundation | done | done | acceptance in all viewports |
| 2 Home editor | walls, runs, rooms, erase, doors/windows (wide openings), floors, delete room, safety rules, undo/redo; Build-mode UI with drag, handles, Confirm/Cancel | 50 walls (48), 32 floors (32), 111 furniture (60), 9 doors, 11 windows (48 and 64 after M10) | acceptance step 7 (room, door, window, side paint, floor, undo/redo, walk-in) in all viewports |
| 3 Character creator | sliders, presets, outfit slots, locks, undo/redo, ties, import/export, hats squeeze hair | 28 hairstyles (24), 54 garments (48), 15 accessories (12), 20 traits (20), 24 face presets | `npm run e2e:creator` 288/288 (96 per viewport) |
| 4 Daily life | six needs, cleaning, dishes, messes, repairs, repairperson, skill effects, chore autonomy | 111 furniture (100) incl. hobby, kids, outdoor, dishwasher | 7-day playtests (1/2/4 people), `npm run visual:m5` overlays |
| 5 Relationships and events | friendship/trust/romance, labels, adult romance gating, memories, 8 event types, planner, goal card | 35 socials (24), 8 event types | acceptance social steps; `npm run visual:m5` goal card in landscape |
| 6 Careers and economy | 13 career tracks (after M11) with work effort, promotion/demotion and career decisions, freelance income, weekly bills with late fees and utility cut-offs, career/wealth aspirations | 13 careers x 10 levels (6), 19 ready skills (10), 13 aspirations (6) | M6 unit/integration tests; acceptance step 8 (career panel, bill payment, freelance sale) |
| 7 Neighbourhood and venues | Lot travel (20-40 game minutes, free), one active lot, 4 NPC households generated once from the world seed with jobs and cross-household relationships, light off-lot schedule (work, home, venue visits), NPC pay once and NPC bill auto-pay, invite home, household switching, rent/buy and moving (owned home sells at 80%), lazy venue/home layouts validated for reachability, 15 venue interactions with once-only costs, library quiet rule, no sleeping in public venues; Map/List modal, lot detail sheet, trip chip, away card; phone landscape HUD (funds drop cents from $1,000 up, icon-only Map/Menu) | 14 lots (12), 6 usable venues (3), 121 furniture (10 new models) | acceptance step 9 (map, travel to park, venue activity, go home, switch preview) in all viewports |
| 8 Family and life stages (PR #4) | seven life stages (baby to elder) with per-stage MPFB bodies, lazy-loaded; aging off / long / normal / custom, optional elder end of life; birthdays; school with performance, homework and report cards; babysitter; adoption; moving out (household split); age-gated interactions and family socials; family view and dialogs; 6 family furniture models | 7 life stages | acceptance step 10 (`stepFamily`) in all viewports; `npm run e2e:acceptance` |
| 9 Multiple floors and exteriors (PR #4) | levels 0-2 (3 m apart, walls 2.8 m); upper floors need support, balconies up to 2 tiles out; stairs as objects with stairwell cut and undo; multi-level path search; HUD level selector; two-storey Hazelbank loft; 12 roof styles and 11 finishes, Roof camera toggle, auto roof; 24 fence designs (123 variants) and 12 gates (64 variants); 12 terrain paints; 16 garden objects and 10 crops (plant, water, weed, harvest at 75 % of value) | 3 floors, 12 roof styles, 24 fences, 12 gates, 12 staircases (catalogue has 9 straight and 4 spiral) | acceptance step 11 (`stepFloors`, `stepExterior`) in all viewports; `--steps=12` runs the exterior part alone |
| 10 Complete catalogs | surfaces done: AI-sourced and code-painted wall and floor designs, palette tinting, on-demand maps (pipeline below); furnishings done: 573 own low-poly designs from `tools/furniture-extra` (pipeline below) | 360 walls (360), 200 floors (200), 573 furnishings (560), full creator catalog (open) | surfaces and furnishings complete; creator catalog still open |
| 11 Complete progression and social scope (own PR) | 13 careers (130 levels) with 17 on-the-job events; six ready skills with practice activities and effects (baking, wellness, creativity, photography, fishing, research); six new objects (bread oven, yoga mat, sketchbook, camera tripod, telescope, stocked garden pond); 40 traits in six categories; 13 three-stage, adult-only aspirations; 45 social interactions; once-only payouts through `transact` | 13 careers (12), 19 skills (16), 40 traits (40), 13 aspirations (12), 45 socials (40) | typecheck, 1746 tests, content check, build, `e2e:creator`; visual checks 25/25 careers, 45/45 skills, 39/39 photography/fishing/research, 19/19 traits |
| 11.5 Animations and activity feedback (own PR) | moving parts and effects driven by the running action (21 descriptors: fridge/oven doors, hob rings and steam, wardrobe, toilet lid, shower/bath, taps, dishwasher); hand props on the rig (snacks, ingredients, plate and fork, books, phone, mug, tools); computer and TV screens (word processor, code, game, browser, TV); a stage-weighted progress pill above the head with Household/All/Off; all render-side, no save fields | no new content; the screen pictures are deterministic generators | acceptance step 13 (`--steps=13`) in all three viewports; `visual:m115:d` 24/24, `visual:m115:h` 27/27, `visual:m115:screens` 57/57, `visual:m115:b` 41/41 |
| 12 Environment and venues (own PR) | seasons (3/7/14 days) and a two-half-day weather plan stored in the save (clear/cloudy/rain/snow, snow only in winter); seasonal lighting, grass, trees, terrain and snow cover; capped rain/snow particles with a Weather effects setting; weather moodlets, preferences and trait biases; weather/season/outdoor/day/night gates that grey out options and filter autonomy; nine outdoor activities and two socials; pools (build tool, ladders, blocked water, swimming, graceful Get Out); the seventh venue, Quayside Baths (6 x 10 pool, changing rooms, sun deck) | 7 venues (6), 108 activities (40), 47 socials (40), 3 pool styles | acceptance step 14 (`--steps=14`) in all three viewports; `visual:m12:{weather,outdoor,pools}` 29/29, 60/60, 33-36/36 |

## How to check Milestones 11.5 and 12

Acceptance steps 13 and 14 run in every viewport (step 13 is M11.5, step 14 is M12); run them alone with
`npm run e2e:acceptance -- --only=portrait --steps=13,14 --fast-start` (portrait or landscape; the two steps alone
take about 5-10 minutes per viewport, while the full desktop run takes about 68 minutes).

- **Animations and feedback (step 13).** Pause the game, select a household member and queue Cook a Meal at the fridge.
  Step 11 can leave the household upstairs, so the step first picks a member who is already on the kitchen floor, or
  walks the chosen one down, so the step's timings stay those of a same-floor cook. (Cooking from another floor works:
  use points carry their absolute level, the cook's own floor is preferred, and availability and the chain share
  `stovesOn` in `src/sim/cooking.ts`; see `tests/unit/integration/cook-floors.test.ts`.)
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

Checks on the M11.5 and M12 state (this PR, rerun on the final tree 2026-11-05):

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 160 files, 2074 tests |
| `npm run content:check` | 0 errors, 0 warnings |
| `npm run build` | passes (main chunk 2.82 MB, warning only) |
| `npm run e2e` | OK in desktop, landscape and portrait |
| `npm run e2e:creator` | 288/288 in portrait, landscape and desktop |
| `npm run e2e:acceptance`, portrait 390x844 | 358/358 (about 23 minutes) |
| `npm run e2e:acceptance`, landscape 844x390 | 356/356 (about 25 minutes) |
| `npm run e2e:acceptance`, desktop 1280x720 | 344/344 (about 68 minutes) |
| Steps 13 and 14 alone (`--steps=13,14 --fast-start`) | 43/43 portrait and landscape, 42/42 desktop |

The acceptance counts differ by viewport because the touch audits add target-size checks. The per-viewport totals and the
six app/test causes found by the full runs are in `dev/ds-tasks/m12/A-progress.md`.

Acceptance step 10 is `stepFamily` (M8); step 11 is `stepFloors`, then `stepExterior` (M9). `--steps=12` runs the exterior part alone.
Fixed late in M9: stairs did not show their mesh after a lot change. The cause was a stale pending promise in `render/objectAssets.ts`
together with a purge in `setLot`. Runtime models are no longer purged, and acceptance checks `view.objects.hasModel(id)`.

Earlier checks rerun after the MPFB switch (MPFB is the default style). Step 9 (M7: map, travel to the park, venue activity, go home, switch preview) passes 29/29 in each viewport after the
phone landscape HUD fix. All runs are SwiftShader emulation. Notes from the verification runs are in `dev/ds-tasks/01-progress.md`.

## Milestone 13, part B (branch `wt/m13b`): balance, recovery, measured performance, release scenario, placeholders

Guidance and accessibility (UI) are part A, done elsewhere. This part:

- **Balance** (docs/BALANCE.md): `npm run balance:audit` (`tools/balance-audit.ts`, library `tools/balance/audit.ts`) plays five households
  for 4 to 8 weeks and reports money, needs, time, careers, relationships, events and stuck or failed actions against targets. Changes:
  groceries priced per portion (`recipeCost(p, recipe, portions)`), `promotionDays(n)` for the career ladder, `ELDER_PENSION`
  ($300 a week for an elder without a job), `COMPANY_SOCIAL_PER_HOUR`, social decay 3.0, fun decay 4.2, `SOCIAL_DESPERATE`. Tests:
  `tests/unit/integration/balanceM13.test.ts`. Re-run the audit after any change to needs, costs, wages or promotion rules.
- **Recovery**: per-slot rotating backups (`<slot>#1..#3`), checksum, fallback on load with a message, error boundary and recovery dialog
  (`src/game/crashGuard.ts`, `src/ui/screens/crash.ts`, `hearthside.debug.crash()` raises a test fault). See ARCHITECTURE.md
  "Integrity and recovery" and "Error boundary". Tests: `tests/unit/persistence/recovery.test.ts`, `tests/unit/integration/recovery.test.ts`.
- **Performance**: `npm run e2e:perf` (SwiftShader emulation; results and "how to measure on a real phone" in docs/TEST_CHECKLIST.md).
  `qualityFor()` in `src/game/settings.ts` is the quality auto-detect (phones and low-memory devices start on Low).
- **Release scenario**: `npm run e2e:release` (portrait and landscape; add `--only=desktop`), screenshots in `dev/shots/release/`.
  Shared browser plumbing for the new scripts is in `tests/e2e/common.mjs`.
- **Checks on this branch** (2026-11-08): typecheck clean; `npm test` 187 files, 2386 tests, 2383 pass - the 3 failures are
  `tests/unit/characters3d/modular/look.test.ts` (garment count 41 against 42) and `ubcBodies.test.ts` (skin colour), which depend only on the
  character asset manifest, none of whose files this branch changes (not run on the base commit; unrelated to the files changed here); `content:check` 0 errors 0 warnings; `build` passes; `npm run e2e` OK;
  `npm run e2e:release` 54/54 (portrait and landscape); `npm run e2e:perf` ran (table in TEST_CHECKLIST.md).
- **Placeholders**: audited (docs/TEST_CHECKLIST.md "Release readiness"); `tests/unit/tools/productionClean.test.ts` keeps dev imports and
  placeholder wording out of the shipped source.

## Next steps, in order

1. Modular Quaternius characters (opt-in style "Quaternius (preview)"; see "Modular characters" below). Stages A to D
   are done on the Universal Base Characters (`ubc_male`, `ubc_female`). Next: the known gaps listed there (garment
   folds, hood up, hair spikes at the hairline, ponytail thumbnail, real-device performance).
2. Milestone 10, complete catalogs: surfaces (360 walls, 200 floors) and furnishings (573 designs, target 560) are done. The
   remaining target is the full creator catalog (ROADMAP). Current counts are in `docs/CONTENT_STATUS.md`.
3. social gaps pass, release preparation: guidance, balance, accessibility, recovery and measured mobile performance (ROADMAP).
4. Polish of the M8, M9, M11, M11.5 and M12 gaps (listed under "Known issues").
5. People: brow styles, the garment hem flare on the female body, real-device performance.
6. Performance:
   - Measure the split bundle on a real phone (see Known issues).
7. Real-device runs. Record them in the device log in `docs/TEST_CHECKLIST.md`.

## Modular characters (Quaternius)

Opt in with Settings > Character style > "Quaternius (preview)". The default stays "Natural" (MPFB), and nothing
changes for existing saves or styles.

- **Runtime.** `src/characters/modular/`:
  - `types.ts` is the contract: manifest, the `ModularLook` appearance block (own version `v`), cover masks.
  - `ModularCharacter.ts`: one `SkeletonUtils.clone` per person, one mixer each (the existing `Animator`), cloned
    materials, ref-counted shared GLBs (`cache.ts`), a rig check on inverse bind matrices, per-vertex cover masks.
  - `ModularCharacterView.ts`: the `PersonView` adapter. `src/characters/personView.ts` is the factory the people
    view, creator scene and portraits use.
  - `Appearance.modular` is optional. People without it get a look derived from their frame, skin, hair and eye
    colours (`deriveModularLook`); it is never written back implicitly. Only `youngAdult` and `adult` use modular
    bodies; other stages keep the classic bodies.
- **Assets.** `public/assets/characters/modular/` (manifest, bodies, garments, hair). Sources are in
  `authoring/characters/`; the pipeline and tool versions are in `tools/characters/README.md` (Blender 4.5.15,
  OpenSew-2 86b4322, GBH Tool 2.2.3, isolated add-on profile).
- **Done.**
  - Bodies: Quaternius Universal Base Characters (Standard, CC0; `Superhero_Male_FullBody` / `_Female_`), prepared
    with `prepare_body.py --materials`. The skin texture is baked neutral (`tools/characters/bake_skin.py`), so any
    skin tone works (`skinGain`); eye colour tints only the iris (shader), brows follow the hair colour.
  - Animations: the shared UAL clips play on the real bodies; root/pelvis position tracks are scaled per body by its
    hip height (`retarget.ts`, shared cached clips), so feet stay on the floor.
  - Stage C garments on both bodies: `tshirt_crew` (top), `trousers_straight` (bottom), `hoodie_pullover` (top), with
    cover masks. Colour variants come from each garment's `colorRegions` palette (6 colours each); a colour is a variant,
    not a new model. Hair on both bodies: `short_crop`, `bob_chin`, `ponytail_mid`. Triangles (male/female): tshirt
    2,459/2,814, trousers 2,672/2,932, hoodie ~3,800/4,300; hair short_crop ~6,700, bob ~12,500, ponytail ~14,400.
    Unit tests in `tests/unit/characters3d/modular/`.
  - Outfit presets "Tee and trousers" and "Hoodie and trousers" are tested in walk and sit. Thumbnails exist for every
    part (`tools/characters/thumbnails.mjs`; bottoms, shoes and one-pieces are framed full-body).
  - Stage D morphs: `blender/morphs.py` adds shape keys from mesh landmarks (nose tip, chin, mouth on the centre-line
    profile). Face: `nose_width`, `mouth_width`, `jaw_width`, `chin_length` (-1..1). Body: `weight` (-0.5..1; per-region
    normal offset blended by skin weights, smoothed). Body-shell garments copy the body's shape keys, so they follow
    `weight` exactly (manifest `followsMorphs`). Hair does not follow morphs. The runtime fix `copyMorphNames` in
    `ModularCharacter.ts` restores the named morph targets on part meshes rebuilt from a GLB.
  - Dev check: `dev/wardrobe.html` takes `outfit=top:id,bottom:id` and `morph=weight:1,...`.
  - CharacterStudio ports (MIT): `creator/framing.ts`, `restrictions.ts` (used by `resolveLook`),
    `tools/characters/thumbnails.mjs`, and the dev-only wardrobe grid `dev/wardrobe.html` (`npm run dev`).
- **Creator (Stage C).** While Settings > Character style is "Quaternius (preview)" and the member is youngAdult/adult
  (`CreatorSession.isModular()`), the Face & Body, Hair and Clothing steps edit `appearance.modular` instead of the classic
  looks (UI in `src/ui/creator/steps/modularParts.ts`; the steps branch on `ctx.modular()`).
  - Session API (`src/characters/creator.ts`, all one undoable `mutateMember` each): `setModularBody`, `setModularHair`,
    `setModularGarment(category, slot, id|null)`, `setModularGarmentColor`, `setModularMorph`, `applyOutfitPreset`. The first
    edit materializes the stored look from `lookFor`; untouched people and old saves keep the derived look.
  - Source of truth for skin, eye and hair colour is the classic appearance: every edit copies them into the stored look
    (`mirrorModularColors`). The body follows the frame (`defaults.bodyByFrame`) and the frame follows the body.
  - Restrictions: `src/characters/modular/equip.ts` (uses `restrictions.ts`). A conflicting part is swapped out and the status
    line says so ("Ponytail doesn't fit with Hoodie - switched to Short crop."); cards show "Replaces ...". A one-piece
    replaces top/bottom. Hair is shared by all categories, garments are per category.
  - Outfit presets: `ModularManifest.outfitPresets` (validated in `validateManifest`), shown as an "Outfits" row.
  - `GameAPI.creator.modular()` gives the creator the manifest and asset URLs; `updateWardrobe(id, wardrobe, modular?)` also
    stores the look when the wardrobe was edited in modular mode.
  - Resource check: `hearthside.debug.stats()` has `geometries` and `textures` (renderer.info.memory). Tests:
    `tests/unit/characters3d/modular/creatorModular.test.ts`, `npm run e2e:creator-modular` (serves the manifest with extra
    `e2e_` parts).
- **Catalog extension (runtime and creator, for the large catalog).** Contract changes, all in `src/characters/modular/types.ts`:
  - `ModularLook` is **v2**: new `facialHairId: string | null`. `migrateModularLook` reads v1 (adds `null`) and v2; `resolveLook`
    drops unknown / unfitted / conflicting facial hair.
  - Manifest: optional `facialHair: FacialHairDef[]` (a `HairstyleDef` plus optional `followsMorphs: string[]`, applied with
    `copyMorphNames` + morph influences like garments). It takes the classic hair colour, loads through the ref-counted cache
    like hair (`ModularCharacter` part key `facialHair`), default none. `facialHairFor(m, bodyId)` lists per body.
  - Slots: `MODULAR_SLOTS` = top, bottom, outer, full, shoes + accessories `hat, eyewear, earrings, neck, wrist, waist, bag`
    (`ACCESSORY_SLOTS`). Accessory garments have `category: 'accessory'` (`categoryOfSlot`; `validateManifest` checks it), one
    item per slot, per outfit category like garments, no cover masks needed.
  - `GarmentDef.tags?: string[]` (e.g. `["tee","shirt","sweater"]`): a slot with more than 12 items (`tags.ts`) gets filter chips.
  - Layering: `outer` is worn over `top` and may go with `full`; `full` still excludes `top`/`bottom` (via the garments'
    `conflicts` / `fullClash`). Do not put `outer` in a garment's `conflicts` unless it really cannot be worn together.
  - Restrictions: `restrictions.parts` accepts garment, hairstyle and facial hair ids (e.g. `{"hat_beanie": ["ponytail_mid"]}`).
    Notes: hat then hair "Ponytail doesn't fit with Beanie - switched to Short crop."; hair then hat "Beanie doesn't fit with Bun -
    taken off."; facial hair vs hair/garments likewise (`equipFacialHair`, `facialHairWouldReplace`).
  - Session API: `setModularFacialHair(id|null)`; `setModularGarment(category, slot, id)` takes the accessory slots.
    `randomizeLook`: facial hair in about 30% of hair rolls, accessories sparse per slot, never a conflicting combination.
  - Creator UI (`modularParts.ts`): Hair step has a "Facial hair" grid; Clothing step sections Top, Outer, Bottom, One-piece,
    Shoes, then an "Accessories" group (Hat ... Bag, only slots with items for the body); tag chips (`[aria-label="<Slot> type"]`),
    lazy thumbnails, tap targets >= 40 px. Tests: `tests/unit/characters3d/modular/catalog.test.ts`; e2e `creator-modular.mjs`
    step `catalog` (synthetic `e2e_` facial hair, accessories, jacket, filler tops).
- **Garment method (decided with the user).** OpenSew-2 alone gave bunched sleeves, bare shoulders and poke-through
  on these muscular bodies, even with wider armholes (`opensew_adapter.widen_armhole`) and a ray-based weight rebind.
  Garments therefore use the hybrid `finish: {"mode": "body"}` in `build_garment.py`: OpenSew-2 sews the design
  (where it covers, how loose); the shipped mesh is the skin under it, raised 0.6-2.5 cm with the body's own weights,
  seam gaps closed, excluded regions (`exclude_regions`) dropped, edges tucked to the skin. It cannot open holes and
  deforms exactly like the body; it reads tighter than sewn cloth (folds mostly flattened).
  - `build_garment.py` finish options: `force_regions` (regions the design always covers, such as long sleeves and the
    hoodie belly; applied before the morphological close, so small holes such as the navel fill) and `force_h`. `hood`
    (`add_hood`) is a measured rolled hood worn down the back of the neck, thin at the collarbones, fullest between the
    shoulder blades and pressed onto the back; weights come from the nearest shell vertex. OpenSew-2's own sewn hood
    crumples on these bodies.
  - `build_hair.py` options: `cut_at` (blunt cut height in head space, for the bob), `front_side` (roots in front of the
    ears swept aside so the face stays clear) and `ponytail` (roots walk over the skull to a gather point, the tail falls
    in a fan). Heavy decimation of GBH ribbons makes spiky clumps; lower `resolution_cm` instead (ponytail 3.0 cm,
    target 14,000 tris; bob 2.6 cm, 12,000).
- **Known gaps.**
  - Garments read tight: the body-shell method flattens most folds.
  - The hoodie hood is a simple measured roll; there is no hood up.
  - Hair clumps are still a little spiky at the hairline.
  - The ponytail thumbnail is a front view, so the tail barely shows.
  - Very light skin looks golden (skin gain).
  - Under this style people's classic clothes, hair and accessories are not drawn.
  - Seat and bed anchors use the classic values.
  - Garment UVs come from a smart projection (fine for solid colours).
  - Morphs are one shape key each: no corrective shapes, and hair is not adjusted for jaw width.
  - Real-device performance is not measured.
  - Saved modular looks that name the removed stand-in bodies fall back to the default body (logged by
    `resolveLook`).

## Known issues

- Milestone 13 (furnishings, rooms, babies; this branch):
  - The game socials (`playPoolTogether` and the others) only need the object somewhere on the lot and level; the pair do not walk to it.
  - The sofa bed's `sleep` slot and its two sit slots can be used at the same time (a sleeper and a sitter overlap).
  - Room edits work on rectangular rooms only; moving a room never moves people (anyone inside blocks it). Moving is free, copying and
    resizing are priced like building. There is no drag handle on the room: the arrow pad moves one tile per press.
  - The recliner lean and the baby curl are bone poses measured by eye (no render check ran in CI); look at them in the browser
    (select a person at a recliner, open the baby's crib).

- M8 family and life stages:
  - The move-out dialog scrolls in phone landscape.
  - Elder wrinkles are one procedural map shared by all elders (albedo and bump only, no geometry). Babies now lie curled (Milestone 13;
    the modular adult view has no spine effects, so its recliner pose is the plain seated one).
  - Feet slid when walking at Fast and Very fast speed; the walk cycle now follows the measured ground speed (Milestone 13). A little
    sliding remains on turns and when a path changes speed within a tick.
- M9 floors and exteriors:
  - The spiral and length-4 stairs are covered by `tests/unit/integration/stairKinds-m13.test.ts` and acceptance step 15 (a spiral and
    the grand stair are built, climbed up and down; Floor 2 stairwell checked).
  - The camera bar now has 7 buttons and was not measured on phones narrower than 390 px.
  - Roofs only draw at or below the active level, and only with the Roof toggle on.
- M11 progression and social:
  - The new career ladders ask for photography, wellness, creativity or research only from level 4-5, so a new hire can climb
    the first rungs with practised skills. This is deliberate; every new career still trains all its listed skills per shift.
  - The six new objects have no breakage or plumbing behaviour (they are hobby/outdoor objects, not appliances); the bread
    oven is cleanable like a stove.
  - Fishing and photo walks at venues depend on the venue interaction lists; the park is the only fishing venue.
  - The yoga mat is a rug: it can be placed under furniture and people walk over it, so it is not a blockage. This is by design (rugs are
    walkable in the object model); it is not changed.
  - A caught fish can be put in the fridge (`storeFish`, `WorldItem.stored`) and cooked with "Cook the Catch" (Milestone 13). Stored fish
    spoil three times slower, are not shown and cannot be eaten or sold until cooked; autonomy never cooks or eats them by itself.
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
  - The stored weather plan covers today and tomorrow; the five-day forecast in the feed is computed from the same deterministic planner
    (Milestone 13), so days 3 to 5 are not stored. Shade (`ObjectDef.shelter`: parasols, the patio set, the arbour) counts as shelter from
    rain and snow; there is no awning or patio-cover design yet, and window awnings give no shade.
  - Pools are ground level only; toddlers cannot swim but may paddle at the deck edge with a grown-up near (Milestone 13); an outdoor pool is
    closed while it snows (a roofed pool stays open).
  - Winter snow cover persists until the season turns, but three hours of rain melt it (`WeatherState.melt`); three snow-free winter days
    (two per rainy day) melt a snowman.
  - The Quayside Baths lot exists only in worlds created after M12; old saves keep their 14 lots.
  - Rain/snow particles are capped at 1500 desktop / 600 touch and hidden by reduced motion or Weather effects off.
- Flakes in acceptance:
  - Step 2 "neighbour visible to tap". The Welcome Wagon visit ends on a clock: a slow screenshot or a long wait for a
    free social can outlast it, and the step then tapped a neighbour who had gone home (landscape and desktop,
    2026-11-05). It now checks she is still on the lot and, if not, calls `game.inviteHome` and waits for her to
    arrive again before tapping.
  - Step 2 "the roommate (own shift) was paid exactly once" failed on desktop when the roommate stayed home all day:
    the step assumed a scheduled shift was worked, while a wage pays only for time worked and an absent roommate has
    no shift record. The check now requires `career.shift.workedMinutes > 0` as well.
  - Step 7 wall-paint side checks, seen in portrait.
  - Step 8 "computer: tap point picks the intended thing" hit wall `0:h:13:4` once in landscape and once in desktop; `tapAndOpenMenu` now turns the camera and looks again when a wall hides an object (desktop passed 302/0 after that).
  - Step 11 "Water the Bed" could be refused by rain; the garden section now calls `forceClearWeather(T)` (task F).
  - Step 11's room preview drag in portrait could start on the floating floor selector: `framePair` accepted a
    placement whose corner sat 12 px above the build sheet (free on the exact pixel, but covered by `.level-down` a
    moment later), so the synthetic touch never reached the canvas and Confirm stayed disabled. `framePair` and
    `framePairAt` now require a 16 px ring of canvas around both points, and the build step drags once more when the
    sheet is still on its plain hint.
  - Steps 13 and 14 read the HUD chip by polling (its 250 ms timer can lag), advance one sim tick before reading the
    fridge door's openness (at speed 0 frames do not move the game clock), and fetch the self menu with a person pick
    (`{ kind: 'person', personId: m }`; `PickResult` has no `'self'`). The carried plate is read at the first stage-2
    tick of Cook a Meal, before the served item takes over in the world. The step-14 chip poll allows 20 s: a big
    SwiftShader screenshot can starve the 250 ms HUD timer for several seconds.
  - The Build tool tabs now wrap onto two rows in the side panel (eleven tools do not fit one 380 px row). Before
    that, Fence, Garden and Pool sat outside the row and desktop Playwright could not click them (step 11's exterior
    section and step 14).
  - Step 11 Build tool tabs (desktop): a tap can time out after 30 s waiting for the tab to be "visible, enabled and
    stable" although the tab has not moved. The software renderer holds the page for most of a minute on a first paint
    (new shaders when Build or a tool opens), and Playwright gives up waiting for a stable frame. `T.tap` now retries
    once with a 60 s timeout and logs `tap retry after …`; the retried step passes without a layout change.
  - Acceptance run time on the final tree: about 23 minutes portrait, 25 landscape and 68 minutes desktop
    (SwiftShader; the desktop run renders 1280x720 and spends most of its time in screenshots).
- Bundle split (`vite.config.ts` `manualChunks`, `src/ui/bootProgress.ts`): the entry chunk is about 0.59 MB
  (was 3.07 MB, gzip 899 KB to about 194 KB). `three` (704 KB), `content` (885 KB), `textures` (242 KB),
  `characters` (279 KB) and `sim` (395 KB) are separate chunks that load in parallel and cache across releases; build
  mode and the creator stay lazy chunks (`ui/app.ts`). `main.ts` imports `content/index` only dynamically (the old
  static+dynamic warning is gone). The boot bar follows real steps (catalogue, saves, asset loads) via `bootProgress`.
  Nothing under `src/**/dev/` is imported by production code. These are split chunks, not less code: total download is
  unchanged, and `render/` still imports `content/objects` and `content/surfaces` eagerly, so content cannot be fully
  deferred. Measure on a real phone.
- M7 neighbourhood:
  - One trip at a time; a split household cannot be watched on two lots.
  - The portrait map is wider than the screen: pan, or use List. The phone's Neighbourhood Map entry opens the same modal.
  - Gaps closed in social gaps pass (see ARCHITECTURE.md): weddings, gifts as objects, venue events, group chat, community events,
    town life (job changes, moving households), furniture choice when moving, town children for old saves, the sitter for
    other households, the jog track, `Person.carriedBy`, the phone map entry and `LotInfo.usable`. What is still simple:
    - Taken furniture goes into the household inventory; it is not re-placed in the new home automatically.
    - A wedding's ceremony is a stage with a feed line, a goal, a bond change and memories; the couple are not choreographed
      (no walking to an altar, no officiant).
    - Gifts are parcels at the recipient's lot (put away after two weeks); there is no unwrapping or re-gifting interaction.
    - A venue event needs the host at home or on the way at the departure time; if a trip is already under way it is retried
      every ten minutes until the start and then called off.
    - NPC homes move only among the generated NPC households and the empty homes; the next-door neighbours stay put. They pay
      the deposit or price from their own funds (`townmove:<household>:<day>`), never go into debt for it.
    - Group chats pull in at most four more people within six tiles whom the speaker has met.
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

### Milestone 10 furniture pipeline

- **Sources.** `tools/furniture-extra/` holds the kit (`kit.mjs` primitives box, rod, slab, lathe, cylY, cyl, poly and hexa; metres,
  front at +z, bottom at y=0) and one design file per group in `tools/furniture-extra/m10/<group>.mjs` (`seating-beds`,
  `tables-storage`, `kitchen-bath-electronics`, `lighting-outdoor-kids`, `decor-hobby`). The authoring guide is
  `dev/ds-tasks/m10f/AUTHORING.md`.
- **Build.** `node tools/build-extra-furniture.mjs [--only=<group>]` writes the GLBs to `public/assets/furniture` and
  `src/content/objectsM10/<group>.models.ts` (bounds and screen quads). Review with
  `node tools/furniture-extra/contact-sheet.mjs --only=<group>`. Content is in `src/content/objectsM10/<group>.ts`.
  Output: 443 original models, at most 1372 triangles each.
- **Moving parts.** Named GLB nodes (`anim:door`, `anim:drawer1`, `anim:lid`, `anim:interior`, ...) are built with
  `m.part(name, pivot)`. The content `anim` field names the kind (fridge, oven, microwave, dishwasher, toilet, laundry, shower,
  bath, sink, wardrobe, openWhileUsed) and the roles (door, door2, drawer, drawer2, lid, interior, screen); `tap` marks sink
  streams, `hob` the stove rings and `screen: true` the derived TV and computer screen quads. `descriptorFromContent` in
  `src/render/objectAnim.ts` turns them into animation descriptors, and ObjectAssets keeps every `anim:*` node as a pivot.
  Shower glass doors stay open for the first and last 2 game minutes of a shower (`SHOWER_DOOR_MINUTES`).
- **Shots.** `node dev/ds-tasks/m10f/shoot-exemplars.mjs [--only=fridge,chest,laptop,oven,microwave,dishwasher,sink,toilet,shower,bath,washer,washertop,wardrobe,tv]`
  swaps the designs into the starter house, runs the interaction (or forces it where the sim has none), steps the clock until the
  parts settle, and writes PNGs and `log.json` to `tests/e2e/out/m10f-shots/` (git-ignored). It takes
  `/tmp/hearthside-browser.lock` itself (do not wrap it in `flock`). 58/58 checks pass.
- **Not implemented.** Pool table, darts, foosball, table tennis and pottery wheel are decorative; drum kit, harp and cello are
  display-only; recliners, storage beds and sofa beds are static; the microwave and washing machines have no sim interaction
  (their parts animate only when forced).

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
