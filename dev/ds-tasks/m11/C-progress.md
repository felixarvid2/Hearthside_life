# M11 task C — Photography, Fishing and Research (progress)

## Files changed
- `src/content/skills.ts` — photography, fishing and research are `ready`, with ten-level unlock lists that
  name the real effects (`photoBonus10`, `researchStudy10`, `researchScience10`, `researchPaper10`).
- `src/content/fishing.ts` (new) — six species (roach → golden carp) with level requirements and values,
  `fishForLevel`, `resolveCatch` (empty chances, 1–3 fish by level, rare fish one fewer) and
  `fishPortionValue` (5% per level, +15% from level 8).
- `src/content/skillEffects.ts` — `photoSaleMult` (×1.25 at 5, ×1.5 at 8), `researchStudy` (2%/level xp for
  Logic and Programming), `researchScience` (0.4/level Science performance), `researchPaperMult` (×1.2 at 8),
  plus their effect texts.
- `src/content/interactions.ts` — `takePhotos`, `sellPhotos`, `photoWalk`, `fishPond`, `fishVenue`,
  `sellCatch`, `researchOnline`, `researchSky`, `writePaper`; `eatMeal` also accepts `fish` items.
- `src/content/objects.ts` — camera tripod ($320), telescope ($480, scale 1.5) and stocked garden pond
  ($650, 2×2), with measured `MODEL_BOUNDS`, `fit`/`useFront` anchors and interactive-slot data; computer and
  laptop offer `researchOnline` and `writePaper`.
- `tools/furniture-extra/models.mjs` — `cameraTripod`, `telescope`, `fishingPond`; rebuilt GLBs, thumbnails,
  `public/assets/manifest.json` and `LICENSES.md`.
- `src/sim/behaviors.ts` — `photo`, `fish` and `sellCatch` behaviors; freelance photo sales (Photography 2,
  ×photoSaleMult) and papers (Research 5, ×researchPaperMult); catch seeded from
  `hashString('fish:<person>:<action>')`; fish item created at the angler's tile with normal meal spoilage.
  Payout occurrences: `freelance:<person>:<action>` and `fishsell:<itemId>`.
- Small additive edits: `src/sim/skills.ts` (research study bonus), `src/sim/careers.ts` (Science shift
  performance), `src/sim/cooking.ts` (fish hunger/spoilage/serving), `src/sim/steps.ts` (fish portion
  capacity), `src/core/types.ts` (`WorldItemKind` + `'fish'`), `src/persistence/schema.ts` (save default),
  `src/ui/hud/contextMenu.ts` (fish item title).
- Tests: `tests/unit/sim/skillsC-m11.test.ts` (15) + `skillsCFixtures.ts`, `tests/unit/integration/skillsC-m11.test.ts`
  (one seven-day GameCore run); `dailylife.test.ts` now expects `eatMeal` kinds `['meal','fish']`; unlock levels
  preset in `furniture-m4.test.ts` / `venueActivities.test.ts`.
- `package.json` — `assets:extra` and `visual:m11:skills-c` scripts; `dev/ds-tasks/m11/shoot-skills-c.mjs`.

## How it works
Photography trains at the home tripod (55 xp/h) and on level-3 photo walks at park/market/arts/cafe. At level 2
the camera offers a 75-minute freelance print sale; fees rise every level and gain ×1.25 at 5 and ×1.5 at 8.
Fishing trains at the garden pond (55 xp/h) and, from level 2, at the park (60 xp/h). The behaviour resolves
the catch deterministically once per action, creates a `fish` item with portions, and either `eatMeal` (hunger
like a meal) or `sellCatch` pays once per item using the Fishing level at the sale. Research trains online at a
computer (55 xp/h) and at the telescope (60 xp/h × 1.1); levels give Logic/Programming study xp, Science career
performance, and at 5 the paid paper (120 min, ×1.2 from Research 8). All money goes through `transact()` with
a once-only occurrence id, so replaying a saved action or sale cannot pay twice.

## Checks (2026-11-03, after the last edits)
- `npm run typecheck` — passes.
- `npm run content:check` — 0 errors, 0 warnings; 19 ready skills (M11 target 16).
- `npm run build` — passes (only the existing 2.27 MB main-chunk warning).
- `npm test` — 1746/1746 pass (129 files), including task C's 16 tests and the updated
  `dailylife.test.ts`. (An earlier run had two failures from other agents' in-flight content; both cleared.)
- `npm run visual:m11:skills-c` — 39/39 checks passed, 12 screenshots (each world shot records the resident's
  on-screen anchor, visible and centred, plus the active floor); no page errors in any viewport.

## Screenshots (`dev/ds-tasks/m11/shots/`, run 2026-11-03 21:04–21:06)
- `portrait|landscape|desktop-camera.png`, `-pond.png`, `-telescope.png` — the resident visibly performing each
  practice at the tripod, pond and telescope; `...-skills.png` — the Skills panel with all three rows;
  `skills-c-log.json` — 39 checks (menu reachability, resident on screen, skill rows/levels, no overflow, no
  page errors, per-shot location/floor/anchor diagnostics).

## Open
- The supervising session must run `bash tools/te-save.sh`, scan for API keys, commit `.tokeneconomizer/`
  with the rest, and merge only after user approval (this agent cannot run git).
