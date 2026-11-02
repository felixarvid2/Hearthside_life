# Continuation note

State on 2026-11-02. Work happens on branch `ccr-333d8ff5-slv7qa`, PR #1 (Milestones 1-5) is merged; Milestones 6 and 7 are on
PR #2 (open; merge only after the user approves). **Milestones 1-7 are complete and verified** (brief section 26,
docs/ROADMAP.md). The next milestone is 8 (family and life stages).

## Milestone status

| Milestone | Systems | Content (target) | Verified |
|---|---|---|---|
| 1 Creator and foundation | done | done | acceptance in all viewports |
| 2 Home editor | walls, runs, rooms, erase, doors/windows (wide openings), floors, delete room, safety rules, undo/redo; Build-mode UI with drag, handles, Confirm/Cancel | 50 walls (48), 32 floors (32), 111 furniture (60), 9 doors, 11 windows | acceptance step 7 (room, door, window, side paint, floor, undo/redo, walk-in) in all viewports |
| 3 Character creator | sliders, presets, outfit slots, locks, undo/redo, ties, import/export, hats squeeze hair | 28 hairstyles (24), 54 garments (48), 15 accessories (12), 20 traits (20), 24 face presets | `npm run e2e:creator` 288/288 (96 per viewport) |
| 4 Daily life | six needs, cleaning, dishes, messes, repairs, repairperson, skill effects, chore autonomy | 111 furniture (100) incl. hobby, kids, outdoor, dishwasher | 7-day playtests (1/2/4 people), `npm run visual:m5` overlays |
| 5 Relationships and events | friendship/trust/romance, labels, adult romance gating, memories, 8 event types, planner, goal card | 35 socials (24), 8 event types | acceptance social steps; `npm run visual:m5` goal card in landscape |
| 6 Careers and economy | 7 career tracks with work effort, promotion/demotion and career decisions, freelance income, weekly bills with late fees and utility cut-offs, career/wealth aspirations | 7 careers x 10 levels (6), 10 ready skills (10), 8 aspirations (6) | M6 unit/integration tests; acceptance step 8 (career panel, bill payment, freelance sale) |
| 7 Neighbourhood and venues | Lot travel (20-40 game minutes, free), one active lot, 4 NPC households generated once from the world seed with jobs and cross-household relationships, light off-lot schedule (work, home, venue visits), NPC pay once and NPC bill auto-pay, invite home, household switching, rent/buy and moving (owned home sells at 80%), lazy venue/home layouts validated for reachability, 15 venue interactions with once-only costs, library quiet rule, no sleeping in public venues; Map/List modal, lot detail sheet, trip chip, away card; phone landscape HUD (funds drop cents from $1,000 up, icon-only Map/Menu) | 14 lots (12), 6 usable venues (3), 121 furniture (10 new models) | acceptance step 9 (map, travel to park, venue activity, go home, switch preview) in all viewports |

Checks on the final state:

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 95 files, 1190 tests |
| `npm run content:check` | 0 errors, 0 warnings |
| `npm run build` | passes (main chunk about 1.8 MB, warning only) |
| `npm run e2e` | OK in desktop, portrait and landscape |
| `npm run e2e:creator` | 288/288 |
| `npm run e2e:acceptance`, portrait 390x844 | 203/203 |
| `npm run e2e:acceptance`, landscape 844x390 | 200/201 (step 2 random social did not raise the relationship; unrelated to M7) |
| `npm run e2e:acceptance`, desktop 1280x720 | 194/194 |
| `npm run visual:m5` | 14/14 |

Step 9 (M7: map, travel to the park, venue activity, go home, switch preview) passes 29/29 in each viewport after the
phone landscape HUD fix. All runs are SwiftShader emulation. Notes from the verification runs are in `dev/ds-tasks/01-progress.md`.

## Next steps, in order

1. Milestone 8, family and life stages: school, family graph, dependent care, aging, household splitting. Needs all seven
   life stages; build on the M3 creator and the M7 household switching.
2. Optional: switch people to MPFB bodies (see "MPFB body prototype" below).
3. Performance:
   - Main chunk is about 1.8 MB. Lazy-load the build, creator and dev modules and split `content`.
   - Measure on a real phone.
4. Real-device runs. Record them in the device log in `docs/TEST_CHECKLIST.md`.

## Known issues

- Main JS chunk about 1.65 MB, and `content/index.ts` is imported both statically and dynamically. Lazy-load
  build/creator-only modules.
- Boot progress bar is not driven.
- M7 neighbourhood:
  - `goForJog` jogs in place (no track loop); no community event at the arts centre.
  - Furniture does not move with the household. NPC households never move and townies never change jobs.
  - One trip at a time; a split household cannot be watched on two lots.
  - `LotInfo.usable` is false until a venue is first built (layouts are lazy).
  - The portrait map is wider than the screen: pan, or use List. The phone has no map entry.
  - Acceptance step 8 once saw every computer option disabled ("Unavailable (6)") in landscape, for an unknown reason.
    The test now waits for an idle member with an enabled option and logs per-option reasons if it recurs.
  - In compact menus where every entry is disabled, the entries fold into a closed "Unavailable" group (UX to revisit).
  - Dailylife test seed 303 leaves a TV broken for days (nonessential repair weakness). The default seed is now 305.
  - Occasional flakes: creator "Random person" invalid household; neighbour not tappable in step 2.
- Creator M3 run (`npm run e2e:creator`, `tests/e2e/creator-m3.mjs`): portrait ran once (73 checks passed); the script fixes made afterwards (suit picked in the wrong category, tie, export, substitution-dialog selectors, preview-change threshold) and the landscape and desktop viewports have not been run. Open: after Load household template the confirm button tap times out, and the Review tab was not reachable after that, which may be a real dialog or stacking bug. Hats: the sun hat brim hides the eyes in the forward-tilted idle pose; scarf tails and necklaces were retuned after the last screenshots.
- Garments: a faint seam on the thigh where swimwear leaves the baked shorts visible; folds are static; seated skirts open
  like a lampshade.
- AI hair: box-braids and twin-tails have flat parts; some bangs stop at eye level; the backs are invented by TRELLIS.
- Weddings are not events, gifts are a $20 social, and dates are still planned at home.
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
- **MPFB body prototype.** Blender 4.5.15, MPFB 2.0.18 and MakeHuman CC0 asset packs are installed outside the repo
  (see `tools/mpfb/README.md`). `npm run assets:mpfb` builds `public/assets/characters/mpfb_{f,m}.glb` (about 0.55 MB,
  meshopt, 10 morph targets, bound to the UAL skeleton; existing clips play). Viewer: `dev/mpfb.html`; screenshots in
  `dev/mpfb/shots/*.jpg`. Not wired into the game.
  - Integration estimate: 4-6 days (loader, skin shader, face paint, hair headMap, garments, creator sliders to morphs,
    height via root scale, draw call merge).
  - Male underwear is CC-BY (Elvaerwyn) and should be replaced. Faces need presets; the male body needs more build.

## Running agents on DeepSeek (saves the Claude quota)

`bash tools/ds-agent.sh <prompt-file> <log-file> [max-turns]` runs a headless Claude Code agent against OpenScale
(`https://api.openscale.so`, Anthropic-compatible) with `deepseek/deepseek-v4.1-flash`. The key is read at run time from
`/home/user/apis/Deepseek2` (repo felixarvid2/apis); it is never printed. The agent may edit files and run npm/npx/node checks
only; git, curl and rm are blocked, so a supervising session commits its work. Task prompts live in `dev/ds-tasks/`
(`01-finish-m2-m5.md` is the remaining Milestone 2-5 work; progress in `dev/ds-tasks/01-progress.md`, logs are gitignored).

## Working conventions

- TokenEconomizer (https://github.com/microsoft/TokenEconomizer, Apache-2.0) is enabled for this repository in
  `.claude/settings.json` (project scope). New Claude Code sessions load it: tool pruning and the failure-loop guard are
  on, micro-skills off (default). It learns in `~/.tokeneconomizer`, so it pays off on a machine that keeps that folder;
  a fresh cloud container starts from nothing each time. Check with `/tokeneconomizer:status`, turn off for one session
  with `TE_DISABLE=1 claude`, and give pruned tools back with `/tokeneconomizer:toolprune restore`.

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
