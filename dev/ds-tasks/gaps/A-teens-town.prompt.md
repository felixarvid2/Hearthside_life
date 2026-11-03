You are working in the repository at the current directory: Hearthside Life, a single-player life sim in Vite + TypeScript (strict) + three.js 0.186. Milestones 1-9 are complete and merged.

Read first: `docs/CONTINUATION.md` (state, conventions, known gaps) and the parts of `docs/ARCHITECTURE.md` relevant to your task.

Rules (all binding):
- Other agents work in the same tree at the same time on other tasks. Edit only the files your task needs; keep edits to shared files (core/types.ts, game/api.ts, game/Game.ts, persistence/*) small and additive. Never reformat or rewrite code you are not changing.
- World state is pure data. Money only via `transact()` with a once-only occurrence id (`isProcessed`/`markProcessed`). `SCHEMA_VERSION` stays 1: new save fields must be optional, with fill defaults in `src/persistence/schema.ts` and checks in `src/persistence/structure.ts`.
- Do not edit `tests/e2e/acceptance.mjs` or `tests/e2e/creator-m3.mjs`.
- Browser runs share `/tmp/hearthside-browser.lock`. Wrap your own Playwright/screenshot scripts in `flock /tmp/hearthside-browser.lock node <script>`; never wrap `tests/e2e/*.mjs` (they take the lock themselves).
- You cannot run git, curl or rm. Do not try.
- Never read or print anything under `/home/user/apis/`.
- Original content only; UI text in English.
- When done, run: `npm run typecheck`, `npm test`, `npm run content:check`, `npm run build`. All must pass. Fix anything you broke.
- Finish with a short report written to your progress file (named in your task): what you changed (files), how it works, the check results, screenshots taken, and anything left open. Keep it under 60 lines.

# Task A: teen part-time jobs, and children in town households

Progress file: `dev/ds-tasks/gaps/A-progress.md`.

## 1. Part-time jobs for teens
Today teens (life stage `teen`) cannot get a job; careers are adult-only. Add part-time jobs for teens.
- Look at `src/content/careers.ts`, `src/sim/careers.ts`, the Job Search interaction, the career panel in the HUD, and `src/sim/school.ts` (teens attend school on weekdays).
- Add at least 4 part-time jobs (for example: café helper, shelf stocker at the grocery, lifeguard at the park, dog walker / paper round). Each has 3 levels (title, hourly pay lower than adult entry jobs, simple promotion: days worked + performance, one skill for level 3).
- Shifts never overlap school hours: weekday afternoon/evening (after school ends) and/or weekend shifts, about 3-4 hours.
- Teens can find them through Job Search (only part-time jobs are offered to teens; adults do not see them unless you think adults may also take them - keep it simple: teen-only). A teen can hold one part-time job and still go to school. Quitting works as for careers.
- Pay goes through the same wage path as careers, with a once-only occurrence id (follow the existing `pay:<person>:<day>` pattern; make sure a teen's school day and shift never double-pay or collide).
- When a teen ages up to young adult, the part-time job ends with a feed message ("... left the part-time job at ...") or is kept - choose ending it, with a feed line, so they can pick a real career.
- The career panel shows a part-time job sensibly (level, title, shift times, next promotion).
- Unit tests: a teen can take a part-time job; shifts avoid school; pay is once per shift; aging to young adult ends it; an adult is not offered teen jobs; save/load round trip.

## 2. Children in town (NPC) households
Today the generated town households are adults only. Give some of them children.
- Look at how the neighbourhood / NPC households are generated (search `src/world` and `src/sim` for the town household generation, Milestone 7) and at `src/core/lifeStages.ts` and `src/sim/family.ts` (parentIds, life stages).
- About a third to a half of the family-type town households get 1-3 children with mixed stages (baby, toddler, child, teen), with `parentIds` pointing at the household's adults, sensible ages (`stageDays`), surnames matching the family, and school state for children/teens as `src/sim/school.ts` expects.
- Generation must stay deterministic for a given seed (use the existing seeded RNG; never `Math.random`).
- Town children must not break anything that assumes NPCs are adults: venue visits, visitors, dates/romance (romance must stay impossible with or between children/teens and adults), work, autonomy. Check the gating in `src/sim/gating.ts` and `InteractionDef.ages`.
- Existing saves must still load (no new required fields).
- Unit tests: a generated town has some households with children; parentIds valid; deterministic for a seed; romance gating holds for town kids; a simulated week with town children runs without errors (use the existing integration-test style in `tests/unit/integration/`).
