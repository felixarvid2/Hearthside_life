# Task A — teen part-time jobs and children in town

## Part 1: teen part-time jobs
- `src/content/types.ts`, `src/content/careers.ts`: `CareerDef.partTime` flag and four teen jobs, three levels each
  (Kettle & Crumb Cafe, Greengage Market, Lakeside Pool, Happy Tails Dog Walking). Every shift is 3-4 hours; weekday
  shifts start at 16:00 or later (high school ends at 15:00), the lifeguard works weekend mornings, and every level pays
  less than an adult entry job.
- `src/content/validate.ts`, `tools/content-report.ts`: part-time jobs are validated at three levels and reported
  separately (4/4 target).
- `src/sim/careers.ts`: `careersForStage` is the single source for job lists (teens see part-time only, grown-ups see
  full careers only, children see none). `joinCareer` rejects full careers for teens, part-time jobs for non-teens and
  any job for children.
- `src/sim/gating.ts`: teens may now use job search (`openCareers`) and `goToWork`; children still cannot. `options.ts`
  only offers `goToWork` when the person has a job.
- `src/sim/aging.ts`: a teen's part-time job ends on the birthday to young adult with the feed line
  "… left the part-time job at …"; an unfinished shift is cancelled without pay.
- `src/ui/hud/personPanel.ts`: the teen tab is "School & job" and shows school status, grade and homework beside the
  part-time job (level, title, schedule, pay, performance, next promotion); the no-job view lists only part-time jobs.
- `src/characters/names.ts`, `src/ui/creator/steps/personality.ts`, `src/game/neighbourhood.ts`: random adults, the
  creator's starting-job list and NPC jobs never pick part-time work.
- `src/content/interactions.ts`: Job Search and phone job text mention teen part-time work.

## Part 2: children in town households
- `src/game/neighbourhood.ts`: the couple home always gets 2-3 children and the single home has a 50% chance of one
  child (so one or two of the four generated homes, about 37.5%). A family with two or more children always covers
  different stages (baby, toddler, child, teen), children are appended after the adults so existing LINKS indices stay
  valid, and they take the family surname. Parent ties (`child`) give each child its household adult(s) as `parentIds`
  (max two); children of the same home also get `sibling` ties. `stageDays` starts at a random point inside the normal
  stage length; `createPerson`/`ensureSchool` create the elementary/high-school record. Little ones get 1-2 traits as
  adopted children do. The generator stays on its own seeded RNG: same seed, same town; different seed, different town.
- No new required save fields: `stageDays`, `parentIds` and `school` remain optional, so older saves load unchanged.

## Tests added / updated
- `tests/unit/integration/teenJobs.test.ts`: teen takes a part-time job; full careers rejected for teens; part-time
  rejected for adults; four jobs / three levels / lower entry pay; every schedule avoids the school window; a real
  Monday shift pays once (`money:pay:<id>:<day>`) beside a full school day, and a save/load keeps the markers; ageing
  to young adult ends the job with the feed line and quitting works.
- `tests/unit/integration/townChildren.test.ts`: family homes have 1-3 children; parent ids valid, grown, in-household
  and sharing the surname; school records and stage clocks sensible; mixed stages; deterministic per seed; romance
  gating (`romanceInterest` false and "Only between adults." for children/teens with adults); seven simulated days run
  with no validation errors.
- `tests/unit/integration/neighbourhood.test.ts`, `tests/unit/sim/gating.test.ts`: expectations updated for children in
  town and for teen job search.

## Checks (final runs)
- `npm run typecheck`: pass.
- `npm test`: 119 files, 1673 tests, all pass.
- `npm run content:check`: 0 errors, 0 warnings; part-time jobs 4 ready / 4 target.
- `npm run build`: pass (only the existing chunk-size warning).

## Screenshots
None: no browser run was needed; the HUD change is covered by typecheck and the production build only.

## Left open
Nothing known. Existing saves keep their old neighbourhoods (children are generated only for new or neighbourhood-less
worlds), as required by the no-regeneration rule.
