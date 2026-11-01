You are continuing an interrupted task in this repository (Hearthside Life, Vite + TypeScript + three.js). The previous run was
stopped by a time limit.

1. Read `dev/ds-tasks/01-finish-m2-m5.md`. It is the original task and its rules still apply: no git commands, nothing in
   `/home/user/apis`, no paid APIs.
2. Read `dev/ds-tasks/01-progress.md`. It is what has already been done. Do not redo finished steps.
3. Continue from where it stopped. In order:
   1. Finish the creator acceptance (`npm run e2e:creator`) until it is green in all three viewports.
   2. Run `npm run e2e:acceptance -- --only=portrait`, then `--only=landscape`, then `--only=desktop`. Fix failures: the game
      if the game is wrong, the test only if the test is genuinely wrong.
   3. Check the screenshots for Milestone 4 overlays (dirt, broken, dishes), the Milestone 5 social menu, the event goal card
      in landscape, and Build mode.
   4. Update `docs/CONTENT_STATUS.md`, `docs/CONTINUATION.md` (status table and next steps, to the verified state) and the
      device log in `docs/TEST_CHECKLIST.md`.
4. Keep appending short bullets to `dev/ds-tasks/01-progress.md`. Long runs take 10-30 minutes: run them in the background,
   write their output to a log under `dev/ds-tasks/logs/`, and poll the log with `tail`.
5. Finish with a short final report: what passed in which viewport, what you changed, and what is left.
