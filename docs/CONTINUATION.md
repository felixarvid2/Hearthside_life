# Continuation note

State on 2026-10-31: Milestone 1 is about half done. Work paused because the usage limit was reached
(resets 20:30 UTC). Nothing renders in the browser yet: `src/main.ts` is still empty.

## Done and verified (typecheck clean, 465/467 tests pass)

- Core contracts (`src/core`), asset pipeline (`tools/build-assets.mjs`), UI kit (`src/ui/kit`).
- Content: 44 furniture designs, 25 interactions, 20 socials, 20 traits, 6 aspirations, 16 skills
  (7 trainable), culinary career (10 levels). `npm run content:check`: 0 errors.
- World and building: rooms, A* navigation, placement, starter and neighbour houses, undoable build/buy
  (reviewed; all 7 review findings fixed).
- Simulation: needs, actions with reservations, autonomy, socials, careers, visitors (reviewed; findings
  below are NOT fixed yet).
- Creator model (`src/characters/creator.ts`, `names.ts`, `outfits.ts`), persistence (`src/persistence`).
- GameCore + `createNewWorld` + headless playtests (`tests/unit/integration`): 3 game days run without
  failures, wages paid once, Milestone 1 acceptance scenario passes headless.

## Interrupted (work in progress, committed as-is)

Resume these agents' work; they stopped mid-task:

- **3D characters** (`src/characters/*` except creator/names/outfits, `src/content/character.ts`,
  `dev/characters.*`): was starting the hair generator.
- **Surfaces** (`src/content/surfaces.ts`, `src/render/textures`, `src/render/openingMeshes.ts`,
  `dev/surfaces.*`): almost done, final browser check left.
- **UI shell** (`src/ui/app.ts`, `screens`, `hud`, `input*`, `dev/ui.*`): writing test scripts.
- **Buy/Build panels** (`src/ui/buy`, `src/ui/build`, `dev/buildbuy.*`): final screenshot review.
- **Creator UI** (`src/ui/creator`, `dev/creator.*`): writing its functional test script.

Agent briefs are in the session scratchpad (`prompts/`); the same content is reflected in
`docs/ARCHITECTURE.md` and `docs/UI_SPEC.md`.

## Next steps, in order

1. Finish the five interrupted parts above.
2. Fix the sim review findings:
   - two people can sit on the same desk chair via computer/TV seat fallback (`src/sim/behaviors.ts`);
   - sleep has no day/night rhythm (`src/sim/autonomy.ts` sleepTimeFactor, untilFull ends at 99.9);
   - a single person stays at social 0 (`phoneFriend` needs friendship >= 10) - test in
     `tests/unit/integration/bugs.test.ts`;
   - `rebuild()` ends actions at load time and breaks batch determinism (`src/sim/simulation.ts`);
   - minor: cooked meal lost on cancel in stage 2, conversations keep cancelling activities, phoneChat has
     no dampening, cookMeal reason quotes the wrong price, aspiration counting conventions, weak tests.
3. `leaveLot` is reported as a missing reference in load reports (second test in `bugs.test.ts`): add a
   content `leaveLot` interaction or let persistence accept the sim's built-in ids.
4. Build the renderer and `Game.ts` (`src/render`, `src/game/Game.ts`, `src/main.ts`) per the GameView
   brief: camera, walls with cutaway, floors, furniture, people, picking, previews, creator preview,
   portraits, Playwright screenshots in portrait/landscape/desktop.
5. Browser acceptance run (brief section 26), review, docs (README, CONTENT_STATUS), merge.

## Commands that work

`npm install`, `npm run typecheck`, `npm test`, `npm run content:check`, `node tools/build-assets.mjs`
(needs the asset library from felixarvid2/test at `../test/assets`). `npm run build` will only produce a
working page after step 4.
