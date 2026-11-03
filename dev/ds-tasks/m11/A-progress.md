# M11 task A — six more career tracks (progress)

## Files changed
- `src/content/careers.ts` — added Education, Visual Arts, Science, Athletics, Design and Architecture,
  Hospitality (10 levels each; 13 full tracks now, plus the 4 teen jobs).
- `src/content/careerEvents.ts` — added 12 events (two per new career), total 17; all options have
  performance, some pay/moodlet/skill rewards, every skill id exists.
- `tests/unit/sim/careers-m11.test.ts` — ladder/event unit tests (shared `content()`).
- `tests/unit/integration/careersM11.test.ts` — GameCore runs: join → shift → wage once → promotion for all
  six careers, and a three-day Education run.
- `dev/ds-tasks/m11/shots-careers.mjs` — Playwright screenshot/geometry check (self-locks under
  `/tmp/hearthside-browser.lock`; run `npm run visual:m11:careers`).
- `package.json` — one script line (`visual:m11:careers`).

## How it works
Each career uses the existing `level()` helper, so `promotion.days` follows the level and the top rung is
performance 100 / no skills. Pay rises strictly (13→92 etc.) and hours are in line with the seven older tracks.
Schedules vary: Education weekdays only; Hospitality evenings (start 14:00–16:00) and weekends; Athletics
06:00–07:00 starts; Visual Arts Tue–Sat studio days. Promotion needs skills + days + performance on every level.
One relationship requirement sits mid-ladder in each new career (Education 6, Visual Arts 7, Science 7,
Athletics 7, Design 7, Hospitality 7). The brief's dev skills (photography, wellness, creativity, research)
are only required from level 4/5 up, so a new hire can climb the first rungs with practised skills; every
career still trains all its listed skills on each shift. Careers were already driven by data:
`careersForStage()` feeds the career panel/job search, the creator starting-jobs list (ready, non-part-time)
and NPC assignment, so all four pick the new tracks up with no UI change. Aspirations do not name careers,
so nothing to update there.

## Checks (2026-11-03, final tree)
- `npm run typecheck` — passes.
- `npm run content:check` — 0 errors, 0 warnings; careers 13 ready / 130 levels (M11 target 12),
  skills 19 ready / 0 dev (photography, wellness, creativity and research are all ready now).
- `npm run build` — passes (main chunk 2.27 MB warning only).
- `npm test` — 129 files / 1746 tests pass, including Task A's 25. (Earlier failures from tasks B/C's
  in-flight recipes and fishing content were fixed by those agents before this run.)
- `npm run visual:m11:careers` (real Playwright, 390x844, 844x390, 1280x720) — 25/25 checks: 13 career
  cards in the panel in every viewport, vertical scrolling, no horizontal overflow, panel inside the
  viewport, no page errors; creator shows 14 starting-job cards (No job + 13) and Education can be chosen;
  desktop takes the Education job and the state shows `education`.

## Screenshots (`dev/ds-tasks/m11/shots/`, 10 PNGs)
- `portrait|landscape|desktop-career-list-top.png` and `-bottom.png`
- `portrait|landscape|desktop-creator-starting-jobs.png`
- `desktop-education-taken.png`
- `career-list-log.json` (geometry + check log)

## Open
- All four skills the brief names are `ready` now, but the ladders still ask for photography/wellness/
  creativity/research only from level 4+; that keeps early promotions reachable with practised skills and is
  deliberate, not a leftover.
- Docs still say "seven careers" in places; not part of this task.
