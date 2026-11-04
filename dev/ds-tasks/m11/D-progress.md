# Task D — 40 traits and 12 aspirations

## Files changed
- `src/content/traits.ts` — 20 new traits (40 total; social 10, tidiness 5, energy 6, creativity 7, leisure 5,
  lifestyle 7). Every trait uses at least one existing effect kind; `effectText` is still generated from the data.
  New symmetric opposites: charismatic/awkward, gossipy/discreet, organised/carefree, energetic/lazy (plus
  outgoing/homebody, athletic/lazy, daydreamer/practical on existing traits).
- `src/content/aspirations.ts` — 5 new three-stage aspirations (family, romance, art, music, technology), 13 total.
  All objectives are existing types (`skill`, `interactionCount`, `friends`, `ownObjects`, `homeValue`, `bond`);
  rewards use the existing `milestoneReached` / `dreamFulfilled` moodlets and the once-only occurrence ids.
- `src/ui/creator/steps/personality.ts` — trait groups show their category and count, cards show the first effect
  line (full effect list in the tooltip), disabled opposites stay clickable and explain the conflict in the status
  line; aspirations are disabled with a hint for children and teens.
- `src/characters/creator.ts` — `setLifeStage` clears an aspiration on non-adult stages, `setAspiration` refuses
  non-adults and `memberIssues` reports "Only adults can have an aspiration."
- `src/characters/names.ts` — random drafts and `randomizePersonality` only assign an aspiration to adults.
- `src/sim/people.ts` — a draft imported with a child's aspiration starts without one (defensive, save-tolerant).
- `tools/content-report.ts` — M11 milestone column (plain text and Markdown) for traits, aspirations, careers,
  skills and socials, with the M11 targets; existing values now read 40 / 13 / 13 / 19 / 45.
- `tests/unit/content/m11-traits.test.ts` — 6 tests: counts/categories, implemented effects, symmetric and
  explained conflicts, random draws covering all 40, helper integration (including M11 skills), valid keys.
- `tests/unit/sim/m11-aspirations.test.ts` — 4 tests: stage/objective/reward shape, progress, every stage of every
  new aspiration completes and pays each occurrence exactly once, adults only.
- `tests/unit/integration/m11-progression.test.ts` — 2 simulated days in the real starter house with four new
  personalities: people eat, sleep in beds, keep finite needs and never stall; aspiration views stay readable.
- `tests/unit/characters/life-stages.test.ts` — fixture clears the adult-only aspiration when patching a child stage.
- `dev/ds-tasks/m11/shoot-d.mjs` — self-locking Playwright script: builds its own dist, screenshots the trait
  picker (top and scrolled) and aspiration stages in portrait/landscape/desktop, checks counts and the
  conflict explanation.

## How it works
Traits remain pure data. The picker consumes `effectText` from the registry, so a trait can never advertise an
effect the simulation does not apply. Conflicts are symmetric in data and `traitsConflict()` is the single check
used by the picker, `setTraits` and random generation. Aspirations advance through `checkAspiration`, which pays
each stage through `transact()` with the occurrence `aspiration:<personId>:<aspirationId>:<stage>`; re-checking
the same stage cannot pay twice. Adult-only is enforced at every entry point (creator, random drafts, world
creation) rather than only hidden in the UI.

## Checks (2026-11-03, after the last edits and after tasks B/C fixed their content)
- `npm run typecheck` — pass.
- `npm test` — 1746/1746 pass in 129 files (new tests included). Two earlier failures in tasks B/C's content
  (`content.test.ts` recipe hunger, `dailylife.test.ts` `eatMeal.itemKinds`) were fixed by their owners.
- `npm run content:check` — 0 errors, 0 warnings; M11 column reads 40/13/13/19/45 against 40/12/12/16/40.
- `npm run build` — pass (main-chunk size warning only).
- `npm run e2e:creator` — 288 passed, 0 failed (portrait 390x844, landscape 844x390, desktop 1280x720).
  The picker still gives the blank household member a name, three traits and an aspiration in every viewport.
- `npm run visual:m11:traits` — 19/19 checks: 40 cards, six categories with counts, 40 effect metas,
  scrollable panel in every viewport, three-stage aspiration view, conflict explanation, no page errors.

## Screenshots (dev/ds-tasks/m11/shots/)
- `traits-portrait.png`, `traits-landscape.png`, `traits-desktop.png` (+ `-scrolled` variants, 6 PNGs).
- `aspirations-portrait.png`, `aspirations-landscape.png`, `aspirations-desktop.png` (+ `-stages` variants,
  6 PNGs).
- `conflict-explained-desktop.png` — Outgoing selected; Reserved and Homebody disabled with the reason
  "Opposite of Outgoing."
- `shots.json` — the script's 19 checks and geometry evidence.

## Open items
- None for this task. Concurrent tasks A/B/C changed shared content while this ran; after their final
  edits the full suite, typecheck, content check and build were all re-run clean.
