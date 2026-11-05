# Hearthside Life - Test checklist

Run the relevant checks after each milestone; do not repeat unrelated tests just to grow a report.

## Automated

| Command | What it covers |
|---|---|
| `npm run typecheck` | TypeScript strict across src, tests and configs |
| `npm test` | Vitest unit and headless integration tests (no browser) |
| `npm run build` | Typecheck + production Vite build |
| `npm run content:check` | Registry validation and distinct-design counts (CONTENT_STATUS numbers) |
| `npm run e2e` | Playwright (Chromium, SwiftShader) smoke and acceptance run with screenshots in desktop, portrait and landscape |
| `npm run e2e:creator` | Milestone 3 creator acceptance through the real creator UI in 390x844 and 844x390 touch and 1280x720 desktop: live face and body sliders (preview must change), body and face presets, outfit slots with the new garments and thumbnails, hats / scarf / necklace / watch / bracelet, randomize with locks, undo/redo, household ties, appearance and household import/export (including substitutions), Move In and a comparison with the game; screenshots and `report.json` in `tests/e2e/out/creator-m3/` |
| `npm run e2e:acceptance` | Brief section 26 acceptance scenario driven through the real interface (creator, live mode, buy, build, save/reload/load, device rotation, M6 career panel / bill payment / freelance sale, M11.5 moving parts, hand props, screens and the progress pill, M12 seasons/weather, a built pool, swimming and the Quayside Baths venue) in 390x844 and 844x390 touch and 1280x720 desktop; screenshots and `report.json` in `tests/e2e/out/acceptance/` (about 23-25 minutes per touch viewport and about 70 on desktop under SwiftShader; `--only=portrait` runs one, `--steps=13,14` just the new milestones) |

Key automated areas (brief section 25):

- **Simulation and money**: identical state regardless of tick batching; shifts, pay and visits applied once per
  occurrence (also across save/load); reservations released on cancel in every action phase; cooking charges
  once; undo/redo/sell/cancelled previews never duplicate money.
- **Navigation and building**: walls block, doors pass, windows block, no diagonal corner cutting, furniture
  footprints and access slots, rotation of footprints/slots in all four directions, wall sides keep their own
  finishes, invalid multi-tile operations leave the world unchanged.
- **Character creator**: undo/redo, randomize with locks, presets, outfit rules, tie validation, trait
  conflicts, template import/export with missing-asset substitution.
- **Persistence**: five slots, autosave plus backup rotation, corrupted save recovery, invalid/newer imports
  rejected, missing content references reported (never deleted).
- **Relationships and events (M5)**: label thresholds and hysteresis, trust gates, bounded decay, romance gating (never with
  non-interested, non-open, under-age or related people; exclusivity; mood; privacy; upset partner), gentle rejections, jealousy
  after witnessed flirting, memory bounds and timed effects, event lifecycle (plan, invite, start, goals, end) with the reward applied once
  across save/load, save defaults for the new optional fields, and a headless playtest (befriend the neighbour, a date at home, a
  dinner party for three) that must end identically with and without a reload in the middle.
- **Careers and economy (M6)**: shift pay once per occurrence, lateness and missed shifts, performance from mood/skills/effort,
  promotion (including the friendship requirement) and demotion, joining and quitting (mid-shift quit cancels pay), career
  decisions resolved once, freelance fees scaling with skill and paid once (also after save/load and interrupted work), weekly
  bills with property tax and utilities, late fee and cut-off after the grace period, power blocking electronics with a
  readable reason, payment restoring power exactly once, auto-pay, malformed economy fields repaired on load, aspiration stage
  rewards paid once, Bookworm ignoring starter bookcases, and a 14-day headless playtest with two roommates (jobs, a freelance
  sale, every bill paid, at least one promotion, ledger sum equals funds, deterministic with a fixed seed).
- **Headless playtests**: several game days with autonomy (nobody stuck, needs maintained, meals cooked, work
  paid once, the neighbour visits), and the Milestone 1 acceptance scenario without rendering.

## Manual scenarios (short and repeatable)

Run on a desktop browser and on a phone (or emulation, reported separately) in **portrait and landscape**.

1. **Creator to move-in**: New Game -> Create a Household. Set a name, a hairstyle and colour, an outfit with a
   pattern, a body preset, three traits and an aspiration. Add a roommate (Randomize all with the hair lock on:
   hair stays). Move In. Reload the page and load the save: every choice is unchanged.
2. **Needs and routing**: select a person, Cook a Meal at the fridge, then cancel the queued Eat; queue Sleep in the
   bedroom (walks through the doorway, not through walls). Watch needs bars change.
3. **Work and money**: let the shift start (fast speed): the person leaves at the front, returns after the shift,
   a single wage appears in the ledger. Buy a bed, undo (money back), redo, reload: balance identical.
4. **Finishes**: Build mode -> paint one side of an interior wall, then the other side with a different design;
   paint a room floor; undo one; reload: both sides keep their own finish.
5. **Neighbour**: at 5 PM on day 1 the neighbour arrives; chat, tell a joke; the relationship and a memory appear
   in the Relationships tab; invite them again with the phone.
6. **Outfits and animations**: open the wardrobe, change the everyday outfit; sleep (sleepwear), sit, walk, eat.
7. **Rotation during edits**: rotate the device (or resize the window) while in the creator and while a
   furniture placement preview is open: the edit/preview stays, panels re-layout, taps still hit the right tile.
8. **Recovery**: Import an invalid file: a clear error and the current game continues. Export a backup.

## Device log

Record real devices separately from emulation:

| Date | Device / browser | Orientation(s) | Result |
|---|---|---|---|
| 2026-11-01 | Chromium headless (SwiftShader) emulation 1280x720, 390x844, 844x390 | both | M1-M5: acceptance 160/160 portrait, 160/160 landscape, 151/151 desktop; creator 288/288; e2e OK; visual:m5 14/14 |
| 2026-11-01 | Chromium headless (SwiftShader) emulation 1280x720, 390x844, 844x390 | both | M1-M6: acceptance 175/175 portrait, 175/175 landscape, 164/164 desktop |
| 2026-11-02 | Chromium headless (SwiftShader) emulation 1280x720, 390x844, 844x390 | both | M1-M7: acceptance 203/203 portrait, 200/201 landscape (step 2 random social did not raise the relationship; unrelated to M7), 194/194 desktop; step 9 29/29 in each viewport; typecheck clean, npm test 95 files / 1190 tests, content:check 0 errors 0 warnings, build passes |
| 2026-11-03 | Chromium headless (SwiftShader) emulation 1280x720, 390x844, 844x390 | both | Post-M9 gaps (teen part-time jobs, town children, kids' clothes, elder wrinkles, L/rectangle fences): acceptance 315/315 portrait, 313/313 landscape, 300/300 desktop; creator 288/288; e2e OK; typecheck clean, npm test 120 files / 1676 tests, content:check 0 errors 0 warnings, build passes |
| 2026-11-03 | Chromium headless (SwiftShader) emulation 1280x720, 390x844, 844x390 | both | M11 (13 careers, 19 ready skills, 40 traits, 13 aspirations, 45 socials): acceptance 315/315 portrait, 313/313 landscape, 302/302 desktop; creator 288/288; e2e OK; typecheck clean, npm test 129 files / 1746 tests, content:check 0 errors 0 warnings, build passes |
| 2026-11-04 | Chromium headless (SwiftShader) emulation 1280x720, 390x844, 844x390 | both | M10 surfaces (360 wall finishes, 200 floor designs): typecheck, test, content:check, build, e2e, e2e:creator, acceptance portrait/landscape/desktop - all pass (acceptance portrait 315/315, landscape 313/313, desktop 302/302) |

## Manual browser checks, Milestone 5 (emulation only; no named device)

Portrait 390x844, landscape 844x390 and desktop 1280x720: tap another person to open the social menu (sections Friendly / Romantic /
Mean / Special; unavailable entries fold under "Unavailable (n)" on small screens and still show their reasons); People tab shows the
label, friendship, trust and romance bars, running memory effects and an expandable memory list with dates; phone -> Plan an Event
(type, guests, time, live reason when it cannot be done, Send invitations); the event card on the HUD shows the countdown, goals and
the result, and cancels a planned event.

## Manual browser checks, Milestone 6 (emulation only; no named device)

Portrait 390x844, landscape 844x390 and desktop 1280x720:

- Person panel -> Career: an employed person shows the career name, level and title, a performance bar, the requirements for the next
  level (met and unmet), the weekly schedule and pay, and the Work hard / Normal / Slack off control; the stored effort changes. An
  unemployed person sees the career list with Take job; taking one adds the job, and Quit asks for confirmation.
- A pending on-the-job decision appears in the Career tab and its choice changes performance (and possibly pay) once.
- Funds button -> Bills and payments (or phone -> Bills and Payments / mailbox): weekly bill with amount, due date and breakdown;
  Pay deducts exactly the bill amount and marks it paid; Auto-pay toggles and pays the next bill on arrival. Letting a bill pass its
  due date adds one late fee, and the grace period cuts the power: electronics and appliances show "Power is off"; paying restores
  them.
- Freelance: at the computer, Write an Article / Write a Book / Take a Programming Gig complete and pay once (feed line "sold"); at
  the easel, Sell a Painting; at the piano, Busk. Higher skill pays more.
- Aspirations: Bookworm after buying (not starting with) two bookcases; stage rewards appear once in the ledger.

## Manual browser checks, Milestone 8 (emulation only; no named device)

Portrait 390x844, landscape 844x390 and desktop 1280x720:

- Life stages: a household with a baby, a toddler, a child, a teen, a young adult and an elder shows each person at their own
  size and body. A baby lies in a crib or is carried; an elder stoops; portraits show the life stage.
- Aging (Settings > aging): off never ages anyone; long, normal and custom (custom shows per-stage days) age a child to a teen on
  schedule. Elder end of life, when on, removes an elder cleanly; the last grown-up of a household with children is kept.
- Birthdays: the birthday shows once per person and stage (event, memory, Birthday moodlet, a family feed entry). "Age up now"
  at a cake works once per day.
- School: a child or teen leaves at 08:00 and comes back at 14:00 (teens 15:00); no school in the holiday week. Not leaving by 09:30
  is a missed day. The School tab shows performance and the weekly report card; homework can be done at a desk, table or computer
  once per school day.
- Babysitter: a need at zero for three hours calls the sitter once ($25, debt allowed).
- Adoption: at the computer, adopt a child; the child joins the household and appears in the Family tab.
- Moving out: the split dialog moves an adult out with a cost; the new household keeps its own funds and can be switched to.
- Age-gated interactions: a toddler sees only the interactions that list toddlers; social menus hide or disable entries the
  age rules do not allow, with a reason.
- Family view: the Family tab shows parents, children, siblings and grandparents, and the family dialogs open from it.

## Manual browser checks, Milestone 9 (emulation only; no named device)

Portrait 390x844, landscape 844x390 and desktop 1280x720:

- Floors: Build mode builds a floor on level 1 only over a wall of level 0 or a floored room; a floor with no support is refused with
  a reason. A balcony more than 2 tiles from supported floor is refused.
- Balcony railing: a balcony edge without a fence or wall shows a warning, and the build still goes ahead.
- Stairs: the Build panel's Stairs tab places a straight stair; the floor above gets a stairwell, and undo restores the floor. Erase
  stairs removes it. People walk up and down and do not stop on the stair. A spiral stair is placed and walked the same way.
- Level selector: the HUD selector switches floors; the people, objects and walls of the chosen floor are shown and the upper
  floors are hidden. Following a person on another floor switches the floor. Hazelbank loft is reachable by the stair.
- Roofs: Roof tool places a roof over a rectangle on a level with a style and a finish; the price per m2 changes with style and
  finish. The Roof toggle shows and hides roofs. Auto roof covers enclosed rooms with no floor above.
- Fences and gates: a fence run places one design per drag; a fence that would seal someone in or cut off part of the house is
  refused with "Add a gate". A gate lets people through.
- Terrain: paint the lot ground with one of the 12 paints; painting back to the lot's own ground removes the paint.
- Garden: plant seeds in the vegetable patch, water, weed, and harvest after growth; the harvest sells at 75 % of the market value
  once.
- Camera bar: the 7 buttons fit and can be tapped at 390 px. Phones narrower than 390 px were not measured.

## Manual browser checks, Milestone 11.5 (emulation only; no named device)

Portrait 390x844, landscape 844x390 and desktop 1280x720:

- Moving parts: queue Cook a Meal; the fridge door swings open during the reach-in, the lit interior is visible and
  the door closes when the cook moves to the stove; the stove shows four lit hob rings, the pan and steam; a bake
  opens the oven door. Change Outfit opens both wardrobe doors. The toilet lid lifts; the shower runs water; a sink
  tap runs while washing hands; the dishwasher door opens at the start and end and its light stays on while running.
- Hand props: an ingredients bag at the fridge, a spatula at the stove, a carried plate on the way to the counter; a
  seated eater has a plate on the table and a fork in the right hand (standing: the plate is held in front); a snack
  shrinks in bite steps; books, a lit phone, a mug and a watering can appear only while the action runs. All props
  are put away when the action ends or is cancelled.
- Screens: a computer shows a word processor with text that grows while writing, a code editor for programming and a
  platformer for games; a TV shows a news/nature/cartoon/cooking/sport picture while watched. Both are dark when off.
- Progress pill: the pill above the head fills while a multi-stage action (cook, eat, read, wash dishes, swim) runs
  and shows the stage-weighted share; it turns green with a check for about 0.7 s on completion and grey when
  cancelled. Display options: Household / Everyone / Off.
- Reduced motion and low quality: the pill has no transition, props still attach, screen pictures freeze, doors snap
  open and closed, and steam and haze are hidden.

## Manual browser checks, Milestone 12 (emulation only; no named device)

Portrait 390x844, landscape 844x390 and desktop 1280x720:

- Seasons and weather: the HUD chip reads "Season, day N - Weather" (text, title and aria-label); the feed shows the
  two-day forecast; Settings has Seasons, Weather, season length (3/7/14) and Weather effects. Clear, cloudy, rain
  and snow change the light, the grass and trees and the particles; rain and snow stop with Weather effects off and
  the light tint stays.
- Gates: in rain an outdoor option (Rake Leaves, the grill, watering a bed) is greyed with "It is raining."; in
  winter snow Build a Snowman and Make a Snow Angel are offered and leave a snowman that melts when winter ends;
  stargazing only at night, sunbathing only in summer clear weather, puddles only after rain.
- Pools in Build: the Pool tab lists the three styles with prices; a drag shows the size and cost; a pool that would
  cut off the deck is refused with a reason. Confirm builds it, charges the posted price and keeps at least one
  ladder; Move ladder / Add ladder / Remove ladder obey the deck rules; undo returns the money.
- Swimming: on the water, Swim in the Pool and Relax in the Pool are offered; the member changes into swimwear,
  climbs in from the ladder and swims (head above water). Get Out is offered while swimming and always puts them on
  a deck tile, never in the water; cancelling does the same.
- Quayside Baths: the map lists the pool venue; Go here travels there; the hall has the 6 x 10 pool with two
  ladders, changing rooms, showers and a sun deck. Go home brings the household back and the lot is unchanged.

## Acceptance totals

`npm run e2e:acceptance` covers steps 1-14 (step 13 is Milestone 11.5, step 14 is Milestone 12). Each viewport
checks every step; the totals below count the individual `T.check` assertions and the final page/console-error check.

| Viewport | M11.5 + M12 steps (13, 14) | Full run (steps 1-14) |
|---|---|---|
| portrait 390x844 | 43/43 | 358/358 |
| landscape 844x390 | 43/43 | 356/356 |
| desktop 1280x720 | 42/42 | 344/344 |

The milestone-by-milestone totals are in the device log below; step numbers are listed next to each milestone in
CONTINUATION.md.
