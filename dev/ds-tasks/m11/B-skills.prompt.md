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
# Task B: skills Baking, Wellness, Creativity

Progress file: `dev/ds-tasks/m11/B-progress.md`.

`src/content/skills.ts` defines 16 adult skills; six are status 'dev' because they have no practice activity. Make **baking, wellness and creativity** 'ready' (task C does photography, fishing and research at the same time; both of you edit interactions.ts, objects.ts, skills.ts and skillEffects.ts - keep your edits to separate, small hunks and re-read before each edit).

Brief section 11: each skill needs ten levels, real practice activities, visible progression, and a few useful unlocks or quality improvements. Shared activities may train related skills at different rates.

- Baking: bake at the oven of a stove (new interactions on the existing stoves, and a new countertop "stand mixer" or "bread oven" object if it helps); baked goods are a food the household can eat (a portion object like meals) with quality from skill; unlock recipes by level (bread, muffins, cake, pie...) in `recipes.ts`; at a high level sell baked goods (freelance-style, paid once via transact with an occurrence id).
- Wellness: a yoga mat object and a meditation interaction (anywhere at home or on the mat), plus a "stretch" on the mat; effects: slower energy/fun decay or a calm moodlet, less stress from bad moodlets at higher levels.
- Creativity: trained secondarily by painting, music, writing and baking at a lower rate (use the existing skill-xp path, no duplicate progress bars), plus its own activity ("sketch ideas" in a sketchbook at a desk or table); effects: creative activities give more fun and freelance creative work pays more per level.
- Every unlock listed in the skill's `unlocks` must be real (implemented and tested).
- New objects: models in `tools/furniture-extra/models.mjs`, thumbnails, footprint, anchors and buy-catalogue entries.
- Animations: reuse existing postures/anims.
- Tests for xp, unlocks and effects; a simulated week where a person practises each skill.
- Screenshots (own script under flock) of a person using the new objects and the skills panel, saved to `dev/ds-tasks/m11/shots/`.
