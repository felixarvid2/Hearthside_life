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
# Task D: 40 traits and 12 aspirations

Progress file: `dev/ds-tasks/m11/D-progress.md`.

Brief section 6.7: at least 40 traits across social behaviour, organisation and cleanliness, activity and energy, creativity and curiosity, food and leisure, ambition and lifestyle; every trait has at least one implemented effect; conflicting traits are validated and explained. At least 12 aspirations covering family, friendship, romance, knowledge, cooking, art, music, fitness, technology, wealth, career achievement and home design; each with stages, explicit objectives, progress tracking and a reward.

- Traits: `src/content/traits.ts` has 20. Add 20 more (spread over the six categories), each with effects from the existing effect kinds (needDecay, autonomyBias, socialReceive, skillRate, workPerformance, enjoys). Add a new effect kind only if it is needed and fully implemented and tested. Add conflicts where they make sense (symmetric). Traits may use the skill ids baking, photography, wellness, fishing, research and creativity (tasks B and C make them ready now).
- The creator's trait picker (`src/ui/creator/steps/personality.ts`) must handle 40 traits well in portrait 390x844, landscape 844x390 and desktop: grouped by category, readable, scrollable, conflicts explained. Check `tests/e2e/creator-m3.mjs` still passes (`npm run e2e:creator`, do not wrap it in flock, do not edit it); random people (`src/characters/names.ts`) draw from all 40.
- Aspirations: `src/content/aspirations.ts` has 8 (home chef, social butterfly, bookworm, career climber, successful career, fortune builder, fitness devotee, dream home). Add at least **family, romance, art, music and technology** (13 in total), each with three or more stages, objectives of existing objective types (add a type only if needed and fully implemented), progress tracking and a reward like the existing ones. Life-stage rules: aspirations are for adults.
- `tools/content-report.ts`: add an M11 column for traits, aspirations, careers, skills and socials (targets 40, 12, 12, 16, 40). Only you edit this file.
- Tests: trait count and categories, every trait has an effect, conflicts symmetric and explained, each new aspiration completes in a simulated run and pays its reward once.
- Screenshots (own script under flock) of the trait picker in all three viewports and the aspirations panel, saved to `dev/ds-tasks/m11/shots/`.
