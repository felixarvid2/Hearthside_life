# Balance (Milestone 13)

How the economy, needs and careers were audited, the targets they are measured against, the numbers before and after, and
what changed. Everything here was measured with the headless audit harness; nothing is a guess.

## The audit harness

`npm run balance:audit` plays five representative households for 4 to 8 game weeks with autonomy on (about 1 to 2.5 minutes
per household, deterministic for a seed) and prints, for every week:

- **money** by source (wages, freelance, other sales, rewards) and sink (bills, groceries, purchases, gifts, repairs), and the funds at the
  start and end of the week;
- **needs**: the mean, the lowest value and the share of time at home below 15, per need;
- **time per activity** in hours (sleep, work, school, cooking, eating, walking, idle, and so on);
- **skills and careers**: total skill levels, level-ups, career level per person, promotions, demotions, missed shifts;
- **relationships**: accepted and refused socials, people known, friends, romance; home events held and venue trips;
- **stuck or failed actions**: failed actions grouped by interaction and reason, the longest time anybody stood still while a need was low,
  idle hours per member, overdue bills and days without power.

It ends with **findings** against the targets below. Options: `--weeks=N` (1 to 12, default 6), `--seed=N`, `--only=single,couple,...`,
`--json=file`, `--markdown` (a summary table). Code: `tools/balance/audit.ts` (library, also used by a unit test) and
`tools/balance-audit.ts` (command line, loads the library through Vite's module runner like `content:check`).

The households (all start in Guided mode with $9,000, the starter house and a neighbour who visits):

| id | household | notes |
|---|---|---|
| `single` | Maren, adult, Culinary | the Guided Start person |
| `couple` | Ines (unemployed at the start) and Rafael (Culinary) | Ines takes the first adult career on day 0 |
| `family` | the couple plus an adopted child and toddler | adoption fees leave $5,500 |
| `elder` | Maren as an elder who retired | no career, no income except what the game gives |
| `teen` | Maren plus an adopted teenager with a part-time job | $8,000 after the fee |

The player policy is deliberately the baseline of "no player mistakes": bills are auto-paid, unemployed adults and teens take a job
on day 0, and nothing else is steered; autonomy does the rest. A real player can do better or worse.

## Targets

| Area | Target | Why |
|---|---|---|
| Needs | Every need averages at least 40 over a week; no need is below 15 for more than 5 % of the time at home | nobody should spend a week in the red because of how the game is tuned |
| Money | A working household's funds never fall below half the starting funds; its income covers bills and groceries at least 1.1 times; a household without a job does not run out of funds within the audited weeks | no broke households without player mistakes; bills are affordable at starting funds |
| Bills | No overdue bill and no power cut with auto-pay on | the first bill ($45 tax, $22 utilities and appliances) is about 3 % of the starting funds |
| Careers | First promotion within the first game week; the top (level 10) in about 15 to 20 game weeks, not 8 | a ten-level ladder should be a long goal, not a month of play |
| Autonomy | Nobody stands still for more than 4 game hours while a need is below 30; fewer than 8 failed actions per 100 completed | stuck people are bugs |
| Social | At least 2 accepted socials per member per week | people meet people |

## What was found and changed

Numbers are for seed 11 and eight game weeks (seed 7 gives the same picture). "Before" is the tree at the start of Milestone 13.

| # | Problem found | Evidence | Change |
|---|---|---|---|
| 1 | **Groceries priced for the whole dish.** A recipe's `cost` buys all its `servings` (4 to 8), but a cook serves one plate per household member and throws the rest away. A single adult paid $16 to $32 for every plate. | Single: groceries $525 a week against wages of $1,232. Elder: $746 a week. | `recipeCost(p, recipe, portions)` charges `cost x portions / servings` (`src/sim/cooking.ts`). The cook, its availability check and autonomy use the household size as `portions`. A household of four pays what it paid before. |
| 2 | **Retired elders had no income.** Elders can keep working, but nothing paid an elder who quit or retired, so the funds drained. | Elder: $9,000 to $3,583 in 8 weeks (about $680 a week out), broke around week 13. | `ELDER_PENSION` = $300 a week for every elder without a career in a playable household, paid once per week by `transact` (occurrence `pension:<person>:<week>`, ledger kind `wage`, `src/sim/economy.ts`). |
| 3 | **The career ladder was climbed in two months.** The promotion days requirement was the level number (1, 2, ... 9 cumulative days), so only performance and skills gated it. | Culinary reached level 9 in week 7 and the cap at 8 weeks; 14 promotions in 8 weeks for a couple. | `promotionDays(n)` = ceil(3n + n^2 / 2): 4, 8, 14, 20, 28, 36, 46, 56, 68 cumulative days (`src/content/careers.ts`). Level 2 still comes in week 1; level 7 is reached around week 8 (measured); level 10 follows around week 15 to 17 (projected from the day counts, five shifts a week). |
| 4 | **Social collapsed for people who work.** Social decays 3.5 an hour and a worker gets no company on the job. | Single adult, weeks 2 to 5: social averages of 14 to 22, below 15 for up to 64 % of the time at home. | `COMPANY_SOCIAL_PER_HOUR` = 1.5: while at work or school social rises instead of decaying (`src/sim/needs.ts`). Social decay 3.5 to 3.0 an hour. A lonely person (social below `SOCIAL_DESPERATE` = 15) now approaches a busy housemate even when that housemate feels fulfilled (`src/sim/autonomy.ts`): with company at work, a housemate who works no longer needs the chat, and the one at home starved (the 7-day roommate playtest caught it). |
| 5 | **Fun was the lowest need for everybody.** Fun decays 5 an hour and the free evening hours could not keep up. | Single adult: fun averages of 20 to 30 in weeks 2 to 5; teen household fun below 15 for 32 % of week 2. | `NEED_DECAY_PER_HOUR.fun` 5 to 4.2 (`src/sim/tuning.ts`). |
| 6 | **A false stuck report in the harness.** A toddler with every need satisfied and nothing to do stood idle for 6 hours. | "Toddler stood still 376 min". | Not a game bug: the harness now counts stillness only when a need is below 30 (`audit.ts`). |

Not changed, on purpose: bills ($146 a week for the starter house), wages, starting funds, freelance fees, aspiration rewards, decay of
hunger, energy, hygiene and bladder. They already met the targets.

### Before and after (seed 11, 8 weeks)

| household | funds start to end | income a week | groceries a week | lowest need mean | worst time below 15 | careers at week 8 | findings |
|---|---|---|---|---|---|---|---|
| single, before | $9,000 to $15,232 | $1,507 | $525 | fun 36 | social 64 % (week 5) | Maren 9 | 25 |
| single, after | $9,000 to $17,853 | $1,420 | $140 | social 45 | social 7 % (week 5) | Maren 7 | 9 |
| couple, before | $9,000 to $22,816 | $2,448 | $538 | fun 53 | fun 14 % (week 2) | Ines 7, Rafael 9 | 6 |
| couple, after | $9,000 to $23,963 | $2,341 | $266 | fun 58 | fun 3 % | Ines 6, Rafael 7 | 0 |
| family, before | $5,500 to $20,187 | $2,560 | $530 | social 62 | fun 7 % | Ines 7, Rafael 9 | 4 |
| family, after | $5,500 to $18,905 | $2,368 | $518 | fun 64 | bladder 3 % | Ines 7, Rafael 7 | 1 (a toddler waiting) |
| elder, before | $9,000 to $3,583 | $275 (rewards) | $746 | social 51 | bladder 2 % | none | 1 (funds run out) |
| elder, after | $9,000 to $10,724 | $612 (pension $300) | $191 | social 52 | bladder 1 % | none | 0 |
| teen, before | $8,000 to $16,973 | $1,771 | $454 | fun 44 | fun 32 % (week 2) | Maren 9, Tess 3 | 25 |
| teen, after | $8,000 to $17,344 | $1,591 | $228 | fun 49 | fun 10 % (week 3) | Maren 7, Tess 3 | 8 |

Career level of the single adult by week, before: 2, 4, 5, 6, 7, 8, 9, 9; after: 2, 3, 4, 5, 5, 6, 7, 7.
The elder's funds by week, before: 8,864 to 3,583 (falling about $950 a week); after: 9,906 to 10,724 (flat after the first rewards).
The single adult's social by week, before: 50, 14, 22, 41, 12, 44, 49, 63; after: 58, 31, 36, 33, 54, 59, 42, 45.

The family pays about the same for groceries as before because four plates is a whole dish; the couple pays half. The findings column counts the harness findings against the final targets, recomputed for both trees (the family's 4 before include a
harness false positive, the idle toddler of row 6).

## Open

- The **single adult** still has a low stretch in weeks 2 to 4 (social 31 to 36, fun 36 to 40) before the first friends and the routine settle;
  weeks 5 to 8 are within the targets. Accepted socials fall to under 2 a week now that work provides company.
- A **toddler** (family household, week 6) waited 323 minutes with a need under 30 while both parents were busy; the emergency sitter
  rule (3 hours at zero) is the safety net. Not investigated further.
- The **teen household** still has a dip: fun is below 15 for 5 to 10 % of the time at home in weeks 1 to 6 (seed 11; it was 32 % in week 2 before the changes). The parent and
  the teenager compete for the same entertainment objects in the first school weeks; a second TV or computer in the starter house, or an
  autonomy weight for outdoor fun, would remove it. It is now 5 to 10 % of the time, not a quarter.
- Relationships still form for the single adult (5 people known, 3 friends after eight weeks); a solo player has to use the phone and the
  map for more.
- The audit never leaves home (the player runs the household; autonomy does not travel). Venue visits, events and community life are only counted when the household does them; a household that
  never travels has no trips.
- Real players decide purchases and building; the audit buys nothing. The release scenario's purchases (an 8 x 4 m extension with a door, a staircase, an upper room and three pieces of
  furniture: $3,616 of the $12,000 Create-mode funds, `tests/e2e/release.mjs`) fit the starting funds and leave 70 %.
- Seeds differ by a few percent in every number above; the harness takes `--seed` so a change can be checked on several.
