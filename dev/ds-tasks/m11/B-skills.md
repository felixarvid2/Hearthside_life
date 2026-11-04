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
