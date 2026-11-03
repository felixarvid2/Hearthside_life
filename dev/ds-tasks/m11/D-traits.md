# Task D: 40 traits and 12 aspirations

Progress file: `dev/ds-tasks/m11/D-progress.md`.

Brief section 6.7: at least 40 traits across social behaviour, organisation and cleanliness, activity and energy, creativity and curiosity, food and leisure, ambition and lifestyle; every trait has at least one implemented effect; conflicting traits are validated and explained. At least 12 aspirations covering family, friendship, romance, knowledge, cooking, art, music, fitness, technology, wealth, career achievement and home design; each with stages, explicit objectives, progress tracking and a reward.

- Traits: `src/content/traits.ts` has 20. Add 20 more (spread over the six categories), each with effects from the existing effect kinds (needDecay, autonomyBias, socialReceive, skillRate, workPerformance, enjoys). Add a new effect kind only if it is needed and fully implemented and tested. Add conflicts where they make sense (symmetric). Traits may use the skill ids baking, photography, wellness, fishing, research and creativity (tasks B and C make them ready now).
- The creator's trait picker (`src/ui/creator/steps/personality.ts`) must handle 40 traits well in portrait 390x844, landscape 844x390 and desktop: grouped by category, readable, scrollable, conflicts explained. Check `tests/e2e/creator-m3.mjs` still passes (`npm run e2e:creator`, do not wrap it in flock, do not edit it); random people (`src/characters/names.ts`) draw from all 40.
- Aspirations: `src/content/aspirations.ts` has 8 (home chef, social butterfly, bookworm, career climber, successful career, fortune builder, fitness devotee, dream home). Add at least **family, romance, art, music and technology** (13 in total), each with three or more stages, objectives of existing objective types (add a type only if needed and fully implemented), progress tracking and a reward like the existing ones. Life-stage rules: aspirations are for adults.
- `tools/content-report.ts`: add an M11 column for traits, aspirations, careers, skills and socials (targets 40, 12, 12, 16, 40). Only you edit this file.
- Tests: trait count and categories, every trait has an effect, conflicts symmetric and explained, each new aspiration completes in a simulated run and pays its reward once.
- Screenshots (own script under flock) of the trait picker in all three viewports and the aspirations panel, saved to `dev/ds-tasks/m11/shots/`.
