You are working in the repository at the current directory: Hearthside Life, a single-player life sim in Vite + TypeScript (strict) + three.js 0.186. Milestones 1-9 and the post-M9 gap fixes are complete and merged. You are building Milestone 11 "Complete progression and social scope" (docs/ROADMAP.md, docs/DESIGN_BRIEF.md sections 6.7, 11 and 12) together with three other agents.

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
- The four M11 tasks: A careers, B skills (baking, wellness, creativity), C skills (photography, fishing, research), D traits and aspirations. Stay in your lane; if you need something another task owns, reference it by id and note it in your report instead of building it.
- New objects need models: build them in code in `tools/furniture-extra/models.mjs` (see docs/ASSET_GUIDE.md "Furniture") and rebuild with `node tools/build-extra-furniture.mjs`. Each new object needs a thumbnail, a measured footprint and interaction anchors like the existing ones.
- Every new piece of content must be playable through the real UI in portrait, landscape and desktop (no dead entries), and must pass `npm run content:check` with status 'ready'.
- Add unit tests for every new system and an integration test that plays a few in-game days with the new content.
# Task A: twelve career tracks

Progress file: `dev/ds-tasks/m11/A-progress.md`.

There are 7 full careers today (`src/content/careers.ts`: culinary, journalism, software, medicine, music, business, landscaping) plus four teen part-time jobs (`partTime`). The brief (section 11) wants twelve tracks with ten levels each. Add these six so every brief track exists: **Education, Visual Arts, Science, Athletics, Design and Architecture, Hospitality** (13 full careers in total).

For each new career:
- Ten levels: title, pay, work days, shift start/end, promotion requirements (performance, skills, days, and a relationship requirement where it fits), like the existing ladders. Pay and hours in line with the existing careers; vary work days (for example Hospitality evenings and weekends, Education weekdays only, Athletics early mornings).
- Main skills per the brief table: Education (charisma, logic), Visual Arts (painting, photography, creativity), Science (logic, programming, research), Athletics (fitness, wellness), Design and Architecture (creativity, handiness), Hospitality (cooking, charisma). Photography, wellness, creativity and research are being made 'ready' by tasks B and C right now; reference them by id. If the validator rejects a promotion on a 'dev' skill while they are not yet ready, put that requirement on the higher levels only and say so in your report.
- Career events (`src/content/careerEvents.ts`): at least two per new career, in the style of the existing ones.
- Work performance rules and optional level rewards as the existing careers have them.
- The career panel, job search (computer / phone), the creator's starting-job list and NPC job assignment (`src/game/neighbourhood.ts`, `src/characters/names.ts`) pick the new careers up; check they render well in portrait (390x844), landscape (844x390) and desktop with 13 careers (scrolling, no overflow). Take screenshots of the job list in all three with your own Playwright script under flock and save them to `dev/ds-tasks/m11/shots/`.
- Update the career aspirations if they list careers explicitly.
- Tests: ladders complete and monotonic in pay; every promotion skill exists; a person can join each new career, work a shift, get paid once and be promoted in a simulated run.
