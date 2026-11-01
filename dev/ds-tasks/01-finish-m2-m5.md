You are working in the repository at the current directory: Hearthside Life, a single-player life sim in Vite + TypeScript + three.js.

Read `docs/CONTINUATION.md` first. It is the handover note. Then read `docs/ROADMAP.md` and `docs/ARCHITECTURE.md`. The goal is to
finish Milestones 2-5 and verify them. All systems and content exist; what remains is in "Next steps, in order" in
`docs/CONTINUATION.md`.

Do these, in order:

1. Run `npm run typecheck` and `npm test`. Fix anything red.
2. Build-mode UI (Milestone 2): check `src/ui/build/*`, `src/render/lotView.ts` and the Game build preview against the API at the
   top of `src/game/api.ts`. Make sure a player can:
   - draw walls and rooms;
   - erase walls;
   - place doors and windows;
   - lay floors;
   - see cost and reasons;
   - confirm or cancel on touch;
   - undo and redo.
   Finish anything missing. Keep it simple and robust.
3. Run the browser checks:
   - `npm run build`
   - `npm run e2e`
   - `npm run e2e:creator`
   - `npm run e2e:acceptance -- --only=portrait`, then the same for `landscape` and `desktop`. Each takes 10-30 minutes; use a
     long timeout.

   Never wrap `tests/e2e/*.mjs` in `flock` (they lock `/tmp/hearthside-browser.lock` themselves). For your own Playwright
   scripts, use `flock /tmp/hearthside-browser.lock node script.mjs`.

   For each failure, decide whether the game or the test is wrong. Fix the game unless the test is genuinely wrong.
   Known open issue: in the creator, after "Load household template" the confirm button tap timed out. Investigate it.
4. Look at the screenshots the runs write (`tests/e2e/out/...`). Check:
   - Build mode;
   - dirty and broken object overlays;
   - the event goal card in landscape;
   - the social menu.
   Fix clear visual bugs.
5. Update the docs:
   - `docs/CONTENT_STATUS.md` (run `npm run content:check -- --markdown`);
   - `docs/CONTINUATION.md`: rewrite the status table and next steps to the verified state;
   - `docs/TEST_CHECKLIST.md`: device log row with the acceptance results.

Rules:
- Do NOT run git commit, git push or any git command that changes history. The supervising session commits your work.
- Do NOT read or print anything in `/home/user/apis`, and do not print environment variables.
- Do not spend money on external APIs. fal.ai and Meshy are off-limits for this task.
- Keep `npm run typecheck` and `npm test` green after each change.
- Work in small verified steps.
- Write a progress log to `dev/ds-tasks/01-progress.md`: a short bullet per finished step with its check results. Keep it
  updated, so the supervisor can follow along.
- When everything is done, or you are blocked, finish with a short final report: what passed, what you changed, and what is
  left.
