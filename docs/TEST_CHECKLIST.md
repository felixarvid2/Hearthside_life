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
| `npm run e2e:acceptance` | Brief section 26 acceptance scenario driven through the real interface (creator, live mode, buy, build, save/reload/load, device rotation) in 390x844 and 844x390 touch and 1280x720 desktop; screenshots and `report.json` in `tests/e2e/out/acceptance/` (takes about 15 minutes under SwiftShader) |

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
| - | Chromium headless (SwiftShader) emulation 1280x720, 390x844, 844x390 | both | see CONTINUATION.md |
