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
