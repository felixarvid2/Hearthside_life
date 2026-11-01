You are working in the repository at the current directory: Hearthside Life, a single-player life sim in Vite + TypeScript +
three.js. Milestones 1-5 are complete and merged.

Your task is **Milestone 6 "Careers and economy"**: career ladders, freelance income, bills and aspirations. Minimum usable
content is **6 careers with 10 levels each, 10 skills and 6 aspirations**.

Read these first:
- `docs/CONTINUATION.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/DESIGN_BRIEF.md` sections 6.7 (personality and aspirations), 11 (careers, school and skills), 12 (economy,
  ownership and long-term goals), 25 (testing) and 26 (milestones)

Existing pieces to build on:
- Career content and logic: `src/content/careers.ts` (1 career, culinary, 10 levels) and `src/sim/careers.ts`.
- Skills: `src/content/skills.ts` and `skillEffects.ts`. There are 16 skills, and several are already trainable.
- Aspirations: `src/content/aspirations.ts` and `src/sim/aspirations.ts`.
- Money: all money goes through `transact()` in `src/core/state.ts`. Occurrences are applied once via `state.processed` (wages
  use `pay:<person>:<day>`).
- Daily-life costs (groceries, repairperson) come from Milestone 4.

Build:
1. **Careers.** Add at least 5 careers, for 6 or more in total, each with 10 levels. Each level has:
   - a title;
   - pay;
   - work days and hours;
   - promotion requirements (skills, performance, days worked, sometimes a relationship);
   - perks.

   Make the careers distinct, for example writing/journalism, tech/programming, medicine, arts/music, business, athletics or
   gardening. Use skills that exist.

   Add work performance driven by mood, needs and skill on arrival. Add:
   - a "work hard / normal / slack off" choice;
   - promotions and demotions;
   - quitting and joining a career from the phone or a computer;
   - daily career events (a small choice with an outcome);
   - a career panel in the person UI (level, performance bar, next requirements, schedule, pay).
2. **Freelance income.** Money from skilled activities at home:
   - sell paintings from the easel;
   - write and sell articles or books on a computer;
   - freelance programming gigs;
   - music busking or composing royalties.

   Every sale is paid once through `transact()` with an occurrence id. Quality depends on skill.
3. **Bills.** Weekly bills: rent or property tax by home value, plus utilities scaled by the number of electronics and
   appliances. They come with a due date and a reminder in the feed. They are paid from the phone or the mailbox, or
   automatically if the setting is on. Unpaid bills get a late fee, and after a grace period utilities cut off: electronics
   and appliances unusable, with the reason "Power is off". Paying restores them. Exact once-only accounting, safe across
   save/load.
4. **Aspirations.** Reach at least 6 aspirations with stages and rewards. Several exist already; check them and add career and
   wealth ones (for example "Successful Career" and "Fortune Builder"). Rewards are applied once. Fix the known issue that
   Bookworm counts starter bookcases: use the `bought` rule the Dream Home aspiration uses.
5. **Skills.** At least 10 usable skills with practical effects; most exist, so verify them. Make sure each career's skills
   can actually be trained by in-game activities.
6. **Save compatibility.** All new fields are optional with defaults in `src/persistence/schema.ts`.
7. **UI.** Everything above must work in portrait 390x844, landscape 844x390 and desktop 1280x720: career panel, bills,
   freelance options in object menus, join/quit career dialogs.

Tests:
- Unit tests for:
  - pay, promotion and demotion rules;
  - performance;
  - bills, late fees, cut-off and restore;
  - freelance once-only payments;
  - aspiration stage rewards paid once;
  - save/load of all new state.
- A headless integration playtest (`tests/unit/integration`): 2-4 people over 14 game days with jobs, freelancing and
  bills. Nobody stuck, money exact (ledger sum equals funds change), at least one promotion, bills paid, and the result is
  deterministic with a fixed seed.
- Extend `tests/e2e/acceptance.mjs` with a short Milestone 6 step through the real UI: open the career panel, pay a bill,
  sell a freelance item.

Checks:
- `npm run typecheck`
- `npm test`
- `npm run content:check`
- `npm run build`
- `npm run e2e:acceptance -- --only=portrait`, then the same for `landscape` and `desktop`. These take 10-30 minutes each. Run
  them in the background, write the output to `dev/ds-tasks/logs/`, and poll the log with `tail`. Never wrap
  `tests/e2e/*.mjs` in `flock`: they take `/tmp/hearthside-browser.lock` themselves.

Finally:
- Regenerate `docs/CONTENT_STATUS.md` (`npm run content:check -- --markdown`; add an "M6 min" column in
  `tools/content-report.ts`).
- Update the Milestone 6 parts of `docs/CONTINUATION.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md` and the device log in
  `docs/TEST_CHECKLIST.md`.

Rules:
- Do NOT run git commands that change anything (commit, push, checkout, reset). The supervising session commits your work.
- Do NOT read or print anything in `/home/user/apis`, and do not print environment variables.
- Do not use paid external APIs.
- Keep `npm run typecheck` and `npm test` green after each step. Work in small verified steps.
- Keep a progress log in `dev/ds-tasks/03-progress.md`, with a short bullet per finished step and its check results. If you
  are interrupted, the next run continues from it.
- Finish with a short final report: what was built, the test results per viewport, and what is left.
