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
# Task C: skills Photography, Fishing, Research

Progress file: `dev/ds-tasks/m11/C-progress.md`.

`src/content/skills.ts` defines 16 adult skills; six are status 'dev' because they have no practice activity. Make **photography, fishing and research** 'ready' (task B does baking, wellness and creativity at the same time; both of you edit interactions.ts, objects.ts, skills.ts and skillEffects.ts - keep your edits to separate, small hunks and re-read before each edit).

Brief section 11: each skill needs ten levels, real practice activities, visible progression, and a few useful unlocks or quality improvements. The brief also lists freelance photography.

- Photography: a camera object (on a shelf or tripod) for "Take photos" at home, and "Take photos" at outdoor venues (Lakeside Park etc., see `src/world/neighbourhood.ts` and the venue interactions); freelance photo sales paid once via transact with an occurrence id, better pay per level; an unlock that lets a person hang their own photo (or a quality improvement).
- Fishing: fish at Lakeside Park (a venue activity) and at a new garden pond object on the home lot; catches are seeded and resolved once; fish can be eaten (a food portion like meals) or sold; higher levels catch more and better fish.
- Research: "Research online" at the computer and a new microscope or telescope object; effects such as a small boost to skill xp of logic/programming studies, Science career performance (task A adds the Science career; just reference it), and an unlock to write a paid research paper (freelance, paid once).
- Every unlock listed in the skill's `unlocks` must be real (implemented and tested).
- New objects: models in `tools/furniture-extra/models.mjs`, thumbnails, footprint, anchors and buy-catalogue entries.
- Animations: reuse existing postures/anims.
- Tests for xp, unlocks, effects, payouts once only (including after save/load); a simulated week where a person practises each skill.
- Screenshots (own script under flock) of a person using the new objects and of the skills panel, saved to `dev/ds-tasks/m11/shots/`.
