# Milestone 11, task B: Baking, Wellness, Creativity

Status: complete. All three skills are `status: 'ready'`, ten levels each, with real practice
activities, effects that grow with level, and unlocks that are implemented and tested.

## What plays
- **Baking** (`src/sim/baking.ts`): `Bake a Treat` on any stove (`stove-basic`, `stove-electric`)
  and on the new countertop **Bread Oven**. Five recipes (rustic loaf, berry muffins, buttermilk
  scones, celebration cake, apple pie) unlock at Baking 1/2/3/5/7; ingredients are charged once at
  `bake:<actionId>`, the batch is served as portions on a free counter/table like a cooked meal.
  Quality comes from the Baking level and the oven's baking stat; a dirty oven bakes worse and
  burns more often. At level 5 `Sell a Box of Bakes` becomes available (freelance, paid once via
  `transact` with `freelance:<person>:<action>`, fee grows with Baking and Creativity).
- **Wellness**: `Meditate` anywhere at home (self interaction, Calm moodlet) plus `Do Yoga` and
  `Stretch` on the new **Yoga Mat** (rug; people walk over it). Level 5+: energy and fun decay up
  to 10% slower and bad moodlets weigh up to 30% less (`wellnessDecay`, `wellnessStress`).
- **Creativity**: `Sketch Ideas` in the new **Sketchbook** (on a desk/table; fun + Creativity).
  Painting, music, writing, busking and baking train Creativity at 35% through the existing
  `secondarySkill` path in `grantXp` - one xp store, one progress bar. The skill text documents
  creative activities +3% fun per level (level 5) and creative freelance work +4% pay per level
  (level 8); both run off the same formulas.

## Content and assets
- `src/content/skills.ts` (ready + unlocks), `interactions.ts` (6 new interactions,
  `secondarySkill` on the existing creative actions), `objects.ts` (bread-oven, yoga-mat,
  sketchbook with models, footprints and `useFront` anchors), `recipes.ts` (5 recipes + food tags),
  `moodlets.ts` (proudBake, calm, inspired), `skillEffects.ts` (formulas + text values),
  `types.ts`/`validate.ts` (recipe `skill`, secondary skill, self interactions).
- Models authored in `tools/furniture-extra/models.mjs` (`yogaMat`, `sketchbook`, `breadOven`),
  built to `public/assets/furniture/*.glb` + thumbnails, registered in `manifest.json` and
  `LICENSES.md`; buyable in Build mode from the kitchen/hobby catalogues.
- Sim hooks: `behaviors.ts` (bake + freelance fee/occurrence), `actions.ts` (secondary xp),
  `steps.ts` (creativity fun), `needs.ts` (wellness decay), `mood.ts` (wellness stress).

## Tests
- `tests/unit/sim/m11-skills-b.test.ts`: counts/levels, recipes, menus, unlock texts match the
  formulas, Creativity secondary xp and pay, payouts once, baking ingredients/mishaps, meditation
  and yoga, decay/stress/fun effects, and a simulated week per skill (each reaches level 2).
- `tests/unit/integration/m11-skills.test.ts`: three real game days in the starter home, queueing
  baking, yoga and sketching through the same `options()` path the UI uses.

## Checks (all run on the final tree)
- `npm run typecheck` - clean.
- `npm test` - 129 files, 1746/1746 tests pass.
- `npm run content:check` - 0 errors, 0 warnings; 19 ready skills, 0 dev.
- `npm run build` - tsc + vite build pass.

## Screenshots
`dev/ds-tasks/m11/shots-skills-b.mjs` (self-flocks `/tmp/hearthside-browser.lock`, serves
`dist` on port 5194) takes portrait/landscape/desktop shots of a person using the yoga mat,
bread oven and sketchbook, and the person panel on the Skills tab with Baking, Wellness and
Creativity. Output in `dev/ds-tasks/m11/shots/{portrait,landscape,desktop}-{yoga-mat,bread-oven,sketchbook,skills-panel}.png`,
log in `shots/skills-b-log.json`.

## Notes for the merge
- `PlacedObject.condition` became required during the milestone; my integration test and shot script set it. I raised the five baking recipes' `hunger` to 45-52 for the content balance test.
- No new save fields were needed (batches reuse meal/portion items, fees use ledger occurrences),
  so `SCHEMA_VERSION` and persistence stay untouched.
- Task A careers and task D traits/aspirations reference `baking`, `wellness` and `creativity` by
  id; no task-B files were needed for those.
