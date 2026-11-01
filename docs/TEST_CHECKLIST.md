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
| `npm run e2e:acceptance` | Brief section 26 acceptance scenario driven through the real interface (creator, live mode, buy, build, save/reload/load, device rotation, M6 career panel / bill payment / freelance sale) in 390x844 and 844x390 touch and 1280x720 desktop; screenshots and `report.json` in `tests/e2e/out/acceptance/` (about 10 minutes per touch viewport and up to 30 on desktop under SwiftShader; `--only=portrait` runs one) |

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
