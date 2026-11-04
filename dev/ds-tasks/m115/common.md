# Milestone 11.5 - Animations and activity feedback - shared rules for every agent

Goal of the milestone: everyday actions must *look* like what they are. Appliance and furniture parts move (the fridge
door opens, the oven glows, the wardrobe opens), people hold and use the things they handle (food taken out of the
fridge and eaten, a plate, a book, a phone), screens show what the person is doing on them (text appearing while
writing, code while programming, a game while gaming, a programme on the TV), and every running action shows a small
progress pill above the person's head that fills and turns green as the action nears completion.

Repository: Hearthside Life (Three.js/TypeScript/Vite life sim). Read docs/CONTINUATION.md and docs/ARCHITECTURE.md
first. Module boundaries: `src/core` (types, clock, rng), `src/sim` (pure simulation, no three/DOM), `src/content`
(data), `src/world` (lots, nav), `src/characters` (skeleton, clips), `src/render` (three), `src/ui` (DOM),
`src/persistence` (saves).

- git, curl and rm are blocked; a supervisor commits. Never print or read files in /home/user/apis.
- Other agents work in parallel in the same tree (another milestone works on pools and weather). Keep edits to shared
  files (`src/render/gameView.ts`, `src/render/objectsView.ts`, `src/render/peopleView.ts`, `src/core/types.ts`,
  `src/content/interactions.ts`, `src/game/settings.ts`, the options screen) small and additive, and re-read a file
  right before every edit. Prefer a new module of your own plus a one- or two-line hook in the shared file.
- This milestone is **render-side**. Derive "what is happening" from state that already exists: the running action
  (`person.queue[0]`: interactionId, phase, target, elapsed, duration, data.stage) and `person.anim` (id, since).
  A shared helper already exists: `src/render/objectUse.ts` (`objectUses(state)` = objectId -> who uses it, with
  interaction, phase, anim, stage, progress; `runningAction(person)`). Use it and extend it additively if needed.
  Only touch `src/sim` when a fact you need is not in state (e.g. which snack was taken); then add an optional
  `action.data` field, keep it deterministic and add a unit test. No save-version change.
- Interpolate visuals from the game clock (`state.clock`) plus the render frame time, so animations pause with the
  game, speed up at 2x/3x without breaking, and look right right after a load (state may begin mid-action).
- Phone-cheap: share geometries/materials/textures, cap counts, no per-frame allocations, no new lights per object
  (emissive materials instead), canvas textures small and updated a few times per second at most, only for objects
  on the visible lot/level. Honour `settings.reducedMotion` (snap to the end pose instead of tweening, no particles)
  and `quality: 'low'`.
- Everything must work and be legible in portrait 390x844, landscape 844x390 and desktop 1280x720.
- Original assets only (code-built geometry, procedural/canvas textures). No downloads.
- Tests: unit tests in `tests/unit/...` for every pure helper (state -> visual state mapping, timings, progress
  maths). Rendering code that needs WebGL is checked with screenshots instead.
- Checks before you finish: `npm run typecheck`, `npx vitest run` (all; while working run only your own tests to save
  CPU - four agents share four cores), `npm run content:check`, `npm run build`, `npm run e2e`. Do not wrap
  tests/e2e/*.mjs in flock.
- Visual check: write a Playwright script `dev/ds-tasks/m115/shoot-<task>.mjs` (see `dev/ds-tasks/m12/shoot-w.mjs`,
  `dev/venues-shots.mjs` and `tests/e2e/run-e2e.mjs` for starting the game, seeding state and using
  `window.hearthside` / `window.__t`). Start the action you are showing, advance the clock to the interesting moment,
  move the camera close, and save screenshots under `dev/ds-tasks/m115/shots/<task>/` in all three viewports. Run it
  with `flock /tmp/hearthside-browser.lock node dev/ds-tasks/m115/shoot-<task>.mjs`. Look at the images if you can
  view images; otherwise check pixel statistics of the relevant region (e.g. the screen rectangle changes between two
  shots, the fridge front region differs open vs closed).
- Write your design (before coding), progress, decisions and check results to `dev/ds-tasks/m115/<task>-progress.md`.
