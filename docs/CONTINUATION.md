# Continuation note

State on 2026-11-01 (handover). Work happens on branch `ccr-333d8ff5-slv7qa`, draft PR #1 (not merged). The active goal is
**finish Milestones 2-5** (brief section 26, docs/ROADMAP.md). Milestone 1 is complete and passed the browser acceptance run in all
three viewports.

## Milestone status

| Milestone | Systems | Content (target) | Browser-verified |
|---|---|---|---|
| 1 Creator and foundation | done | done | yes: acceptance 122-124/124 per viewport |
| 2 Home editor | core done (`src/building/buildPlans.ts`, `buildCommands.ts`, `src/world/structure.ts`, `roomTracker.ts`, `src/game/core/build.ts`); **Build-mode UI in progress** | done: 50 walls (48), 32 floors (32), 111 furniture (60), 9 doors, 11 windows | **no** |
| 3 Character creator | done (hats squeeze hair `src/characters/hatFit.ts`, creator icons `src/ui/creator/garmentIcon.ts`); **final checks in progress** | 28 hairstyles (24), 54 garments (48), 15 accessories (12), 20 traits (20), 24 face presets | partly (`npm run e2e:creator`, `tests/e2e/creator-m3.mjs`) |
| 4 Daily life | done: cleaning, dishes, messes, repairs, repairperson, skill effects, chore autonomy, 7-day playtests | 111 furniture (100) incl. hobby, kids, outdoor, dishwasher | **no** (dirt/broken overlays never seen in a browser) |
| 5 Relationships and events | done: trust/friendship/romance axes, labels, adult romance gating, memories, 8 event types, planner, goal card | 35 socials (24), 8 event types | partly (mock UI page, portrait/landscape) |

What was in progress when this note was written (WIP commits on the branch; check `git log` and `git status`):

- **Build-mode UI** (`src/ui/build/*`, `src/render/lotView.ts`, Game build preview, wide openings in lotView, catalog paging,
  surface thumbnails re-requested after AI maps load, an M2 scenario added to `tests/e2e/acceptance.mjs`).
- **Creator M3 final checks** (`src/characters/*`, `src/ui/creator/*`, `tests/e2e/creator-m3.mjs`). Wardrobe build keys are
  documented in ASSET_GUIDE "Wardrobe".

## Next steps, in order

1. Finish the Build-mode UI if it is incomplete. With a build tool active, a one-finger drag draws walls, rooms, floors and
   erase rectangles. Two fingers pan. Confirm and Cancel buttons show on touch, and corner handles resize a room. Cost,
   measure and reason update live. Use `GameAPI` `setBuildTool` / `buildPreview` / `buildApply` / `buildHighlight` /
   `rooms` / `openingAt` / `view.groundPoint` (documented at the top of `src/game/api.ts`).
2. Run every check and fix failures:
   - `npm run typecheck`
   - `npm test`
   - `npm run content:check`
   - `npm run build`
   - `npm run e2e`
   - `npm run e2e:creator`
   - `npm run e2e:acceptance -- --only=portrait`, then the same for `landscape` and `desktop`. A run takes 10-30 min under
     SwiftShader.
3. Browser-check the parts never seen in a real page:
   - Build mode in all three viewports: build a room, add a door and a window, paint each wall side, undo and redo, and
     have a person walk in.
   - Dirt, broken, puddle and dirty-plate overlays: seed them by setting `obj.condition` and spawning messes through
     `window.hearthside.debug`.
   - The event goal card in landscape 844x390 with the tutorial open.
   - The social menu `<details>` fold on small screens. The acceptance neighbour step uses `.ctx-item` selectors, so check it
     still taps.
   - AI hairstyles on the classic style (shots in `dev/hair-ai/shots/classic/` if that run finished).
4. Update the docs to the verified state:
   - `docs/CONTENT_STATUS.md` (`npm run content:check -- --markdown`)
   - `docs/ROADMAP.md` current milestone
   - this file
   - the PR #1 description
5. The PR merges only after the user approves. This repository is not covered by the standing merge approval in
   felixarvid2/test.

## Known issues

- Main JS chunk about 1.65 MB, and `content/index.ts` is imported both statically and dynamically. Lazy-load
  build/creator-only modules.
- Boot progress bar is not driven.
- Creator M3 run (`npm run e2e:creator`, `tests/e2e/creator-m3.mjs`): portrait ran once (73 checks passed); the script fixes made afterwards (suit picked in the wrong category, tie, export, substitution-dialog selectors, preview-change threshold) and the landscape and desktop viewports have not been run. Open: after Load household template the confirm button tap times out, and the Review tab was not reachable after that, which may be a real dialog or stacking bug. Hats: the sun hat brim hides the eyes in the forward-tilted idle pose; scarf tails and necklaces were retuned after the last screenshots.
- Garments: a faint seam on the thigh where swimwear leaves the baked shorts visible; folds are static; seated skirts open
  like a lampshade.
- AI hair: box-braids and twin-tails have flat parts; some bangs stop at eye level; the backs are invented by TRELLIS.
- Bookworm "own 2 bookcases" may count starter bookcases.
- Weddings are not events, gifts are a $20 social, and dates happen at home until lot travel (Milestone 7).
- Room move, resize and duplicate are not implemented. Delete room is.
- Only SwiftShader emulation so far; record real devices in the TEST_CHECKLIST device log.

## Assets and AI generation

- **People.** People use Meshy-generated base bodies (`dev/meshy/`, `npm run assets:meshy` builds
  `public/assets/characters/meshy_{a,b}.glb`). Settings > Display offers characterStyle detailed or classic. Meshy
  credits left: 42.
- **fal.ai.** The key is in the user's repo `felixarvid2/apis`, file `Fal.ai`, cloned to `/home/user/apis`. Read it at run
  time; never print or commit it. Use `queue.fal.run` or `fal.run`, never `api.fal.ai`, where a proxy overrides auth.
  - Budget: $10 total, about $1.25 spent. Ledgers: `dev/hair-ai/LEDGER.md` and `dev/surfaces-ai/LEDGER.md`.
  - Allowed models: FLUX schnell/dev and TRELLIS. Do not use Hunyuan3D: its licence excludes the EU.
- **AI hair.** `npm run hair:ai` (`tools/build-ai-hair.mts`, `tools/hair-ai/`). Raw generations are cached in
  `dev/hair-ai/raw/` (gitignored, so a fresh clone has to regenerate them, which costs money).
- **AI surface maps.** `npm run assets:surfaces` builds them from `dev/surfaces-ai/raw/` (gitignored).
- **Licences.** Check the Meshy, FLUX and TRELLIS output terms before distribution (see `public/assets/LICENSES.md`).

## Working conventions

- Browser runs share `/tmp/hearthside-browser.lock`. Wrap custom Playwright scripts in `flock /tmp/hearthside-browser.lock ...`,
  but never wrap `tests/e2e/acceptance.mjs` or `run-e2e.mjs`, which take the lock themselves (a nested lock deadlocks).
- Before every commit, scan for the fal key:
  `grep -rlF --exclude-dir=node_modules --exclude-dir=.git "<secret part>" .` must print nothing.

## Commands

| Command | Notes |
|---|---|
| `npm install` | |
| `npm run typecheck` | |
| `npm test` | |
| `npm run build` | |
| `npm run content:check` | |
| `npm run e2e` | |
| `npm run e2e:acceptance -- --only=portrait\|landscape\|desktop` | |
| `npm run e2e:creator` | |
| `npm run assets` | needs `../test/assets` |
| `npm run assets:meshy` | |
| `npm run assets:surfaces` | |
| `npm run hair:ai -- images\|models\|build\|sheet\|content` | |
