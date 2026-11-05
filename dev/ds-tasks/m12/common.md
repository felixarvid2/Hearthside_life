# Milestone 12 - shared rules for every agent

Repository: Hearthside Life (Three.js/TypeScript/Vite life sim). Read docs/CONTINUATION.md, docs/ARCHITECTURE.md and
docs/DESIGN_BRIEF.md sections 17-19 and 26 (Milestone 12 row) before changing anything. Follow the existing module
boundaries: `src/core` (types, clock, rng), `src/sim` (pure simulation, no three/DOM), `src/content` (data),
`src/world` (lots, nav), `src/render` (three), `src/ui` (DOM), `src/persistence` (saves).

- git, curl and rm are blocked; a supervisor commits. Never print or read files in /home/user/apis.
- Other agents work in parallel. Keep edits to shared files (`src/core/types.ts`, `src/content/index.ts`,
  `src/content/interactions.ts`, `src/content/moodlets.ts`, persistence) small and additive; re-read a file right
  before editing it. New state fields must be optional (absent in older saves = default behaviour) so no save migration
  is needed, unless your task says you own the save version.
- Simulation must stay deterministic: use the world RNG (`src/core/rng.ts`) seeded from state, never Math.random in sim.
- Everything must work in portrait 390x844, landscape 844x390 and desktop 1280x720, and on a phone GPU: keep effects
  cheap (instanced or a single Points/LineSegments mesh, capped counts), and honour the setting that turns them off.
- Original assets only (code-built geometry, procedural textures). No downloads.
- Tests: add unit tests in `tests/unit/...` next to the existing ones and headless playtests in
  `tests/unit/integration/` when behaviour spans systems.
- Checks before you finish: `npm run typecheck`, `npx vitest run` (all), `npm run content:check`, `npm run build`,
  `npm run e2e` (desktop/portrait/landscape smoke). Do not wrap tests/e2e/*.mjs in flock.
- Visual check: write a small Playwright script under `dev/ds-tasks/m12/` (see `dev/venues-shots.mjs` and
  `tests/e2e/run-e2e.mjs` for how to start the game and use `window.hearthside` / `window.__t`), run it with
  `flock /tmp/hearthside-browser.lock node dev/ds-tasks/m12/<script>.mjs`, and save screenshots under
  `dev/ds-tasks/m12/shots/<task>/`. Look at them if you can view images; otherwise check pixel statistics.
- Write your design (before coding), progress, decisions and check results to `dev/ds-tasks/m12/<task>-progress.md`.
