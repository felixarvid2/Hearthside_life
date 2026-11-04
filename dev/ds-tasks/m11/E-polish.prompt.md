You are working in the repository at the current directory: Hearthside Life, a single-player life sim in Vite + TypeScript (strict) + three.js 0.186. Milestones 1-9 and the post-M9 gap fixes are complete and merged. You are building Milestone 11 "Complete progression and social scope" (docs/ROADMAP.md, docs/DESIGN_BRIEF.md sections 6.7, 11 and 12) after four other agents finished their parts.

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
# Task E: pond model and M11 docs

Progress file: `dev/ds-tasks/m11/E-progress.md`. Tasks A-D are finished (read their reports in `dev/ds-tasks/m11/{A,B,C,D}-progress.md`). You are the only agent now.

1. The garden pond (`fishingPond` in `tools/furniture-extra/models.mjs`, object id in `src/content/objects.ts`) reads as a pale grey concrete disc with a green blob (see `public/assets/furniture/thumbs/fishingPond.png` and `dev/ds-tasks/m11/shots/desktop-pond.png`). Make it read clearly as a small garden pond: an irregular (not perfect circle) rim of rounded stones of varied size and grey/brown tones, a slightly sunken surface of clear deep blue-green water (darker towards the middle, use the kit's material names so it lights well; a glossy look if the material system allows), two or three lily pads (one with a small flower), and a clump of reeds/cattails at one edge. Keep the footprint, anchors and scale. Rebuild with `node tools/build-extra-furniture.mjs`, look at the thumbnail with Read, iterate until it reads as a pond. Then re-shoot the pond with `node dev/ds-tasks/m11/shoot-skills-c.mjs` (it takes the browser lock itself; do not wrap it in flock) and check `dev/ds-tasks/m11/shots/*-pond.png`.
2. The yoga-mat shots (`dev/ds-tasks/m11/shots/*-yoga-mat.png`) show the person behind a wall corner and the mat is not visible. Fix the framing in `dev/ds-tasks/m11/shots-skills-b.mjs` (place the mat in open floor inside the house and centre the camera on it, cutaway walls on) and re-shoot; check the person stands/poses on the mat.
3. Docs (keep the existing style, English, concise):
   - `docs/ARCHITECTURE.md`: sections for the new careers, the six newly ready skills (baking, wellness, creativity, photography, fishing, research: activities, objects, effects, payout occurrence ids), the 40 traits and 13 aspirations (adult-only aspirations).
   - `docs/ROADMAP.md`: Milestone 11 complete (on its PR); next is Milestone 10 or 12; update the "Unfinished systems" list entries 6 and others that say "seven careers" etc.
   - `docs/CONTINUATION.md`: state, checks and known gaps for M11 (anything open from the A-D reports).
   - `docs/CONTENT_STATUS.md`: regenerate the tables from `npm run content:check` (it prints Markdown; copy the matching tables) and update the intro sentence with the M11 minimums.
   - `docs/ASSET_GUIDE.md`: list the new original furniture models (bread oven, yoga mat, sketchbook, camera tripod, telescope, garden pond).
   - Fix remaining "seven careers"/"7 careers" mentions in docs and UI text.
