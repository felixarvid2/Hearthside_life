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
