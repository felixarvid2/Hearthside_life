# Hearthside Life

An original single-player life simulation for the browser, built with Three.js 0.186, TypeScript (strict) and Vite 7.

## Status

Milestone 1 of 13, "Creator and playable foundation". See [docs/ROADMAP.md](docs/ROADMAP.md) for the milestone plan and [docs/CONTINUATION.md](docs/CONTINUATION.md) for the current state and next steps.

Milestone 1 minimums are met: 12 wall finishes, 8 floor designs, 15 furniture designs, 8 hairstyles and 12 garments. The Milestone 2 content minimums are met as well (48 wall finishes, 32 floor designs, 60 furniture designs, 6 doors and 8 windows). The Milestone 3 creator minimums are met too (28 hairstyles, 54 garments, 15 accessories, 20 traits, 24 face presets). Full-project content targets are scheduled for Milestone 10. Current counts are in [docs/CONTENT_STATUS.md](docs/CONTENT_STATUS.md).

## What you can do now

- Start in one of three modes: Guided Start, Create a Household, or Build Sandbox.
- Use the character creator, which has 7 steps:
  - face, body and hair;
  - clothing, including patterns;
  - personality: 3 traits, an aspiration and likes;
  - household ties;
  - presets, undo/redo, locks and randomize.
- Play in live mode:
  - six needs: hunger, energy, hygiene, bladder, fun and social;
  - an action queue, with cancel;
  - autonomy;
  - cooking meals and sleeping;
  - socialising, with 35 social interactions in four menu groups (friendly, romantic, mean, special);
  - friendship and trust as separate bars with relationship labels, adult romance with consent and exclusivity, memories that change behaviour;
  - visitors who stay, eat and leave politely, and events with goals: dates at home, dinner and house parties, celebrations, welcome visits.
- Work one off-lot career, Culinary (10 levels), paid once per shift.
- Track skills and aspirations.
- Use buy mode with 44 furniture designs: move, rotate, sell and store items; choose finishes; undo/redo.
- Use build mode to paint 12 wall designs per side and 8 floor designs, each with palettes.
- Keep 5 save slots, with autosave and backup, and export/import saves as JSON.
- Use the interface in portrait, landscape and desktop layouts.

## Running it

Requires Node.js and npm.

```sh
npm install
npm run dev       # Vite development server
npm run build     # type check, then production build into dist/
npm run preview   # serve the production build locally
```

## Controls

### Touch

- Tap a person to select them.
- Tap an object to open its menu.
- Tap the floor to walk there.
- Drag to pan; pinch to zoom.
- Use the camera buttons to turn the view.

### Desktop

- Click to select, and use menus as with touch.
- Drag or right-drag to pan; use the mouse wheel to zoom.
- Keyboard:

| Key | Action |
|---|---|
| W A S D or arrow keys | Pan |
| Q / E | Turn the camera |
| + / - | Zoom |
| Space | Pause or resume |
| 1, 2, 3 | Game speed |
| Esc | Cancel |
| R | Rotate the object being placed |
| Delete (or Backspace) | Sell |
| Ctrl+Z / Ctrl+Y (Cmd on macOS) | Undo / redo |

Shortcuts are ignored while a text field has focus, and the camera keys (arrows, letters) leave a control alone when it was
reached with Tab (a slider, a tab bar), so keyboard users can operate panels without moving the camera.

### Keyboard only

Everything outside the 3D world is reachable with Tab, Shift+Tab, Enter and Space: menus, the creator, panels and dialogs.
Arrow keys, Home and End move between tabs, radio groups and swatches. Esc closes the hint, then panels and dialogs, and
focus returns to the control that opened them; dialogs keep Tab inside. To use an object without pointing at it, open the
person panel, choose the **Queue** tab and press **Choose an object** (or **Name's actions** for the person's own menu).

## Help, hints and accessibility

- **Help** (main menu and in-game Menu): a short how-to for each topic and the controls for touch and keyboard.
- **Hints:** a small card the first time you reach a situation (creating a household, moving in, needs, the queue, Buy, Build,
  jobs and money, relationships, the map, floors, saving). One at a time, never over a dialog. **Got it** or Esc marks it seen,
  **Skip hints** turns them off. Settings > Help has the **Hints** switch and **Reset hints**. What you have seen is kept with
  the other device settings (`hearthside.settings.v1`, per browser profile).
- **Settings > Accessibility:** UI scale 90 to 150 %, High contrast, Reduce motion (on by default when the device asks for it).
- Need bars say "Low" or "Critical" in words as well as stripes and colour; moods have an icon, a word and a border style.
- Icon-only buttons have accessible names, tabs/menus/dialogs have roles, and notifications and the feed use a polite live
  region. Touch targets are at least 44 px (checked by `npm run e2e:a11y`); text contrast meets WCAG AA (unit-tested in
  `tests/unit/ui/contrast.test.ts`).

## Saving

Saves are stored in IndexedDB in the browser. There are 5 named slots, plus an autosave and a last-known-good backup.

Browsers on phones can clear site storage, which removes saves. Use **Export** in the game menu to keep a copy of a save as JSON, and **Import** to restore it.

## Checks

```sh
npm run typecheck      # tsc --noEmit
npm test               # unit tests (Vitest)
npm run content:check  # validates content definitions (tools/content-report.ts)
npm run e2e            # end-to-end tests
npm run e2e:a11y       # keyboard-only flows, accessible names, tap targets, scale/contrast, hints (Milestone 13)
```

## Project layout

- `src/core`: shared core code
- `src/content`: content definitions (designs, traits, activities, and so on)
- `src/world`: the lot and world state
- `src/building`: walls, floors, doors, windows and placement
- `src/sim`: needs, autonomy, the action queue and simulation time
- `src/characters`: characters, faces, hair, clothing and personality
- `src/persistence`: saves, slots, autosave, backup and import/export
- `src/render`: Three.js rendering
- `src/game`: game loop and modes
- `src/ui`: interface and input (`src/ui/input/keys.ts` holds the keyboard map)
- `tools`: build and check scripts, including `build-assets.mjs`, `build-meshy-bodies.mts` (`npm run assets:meshy`) and `content-report.ts`
- `dev/`: development pages for isolated checks:
  - `characters.html`
  - `objects.html`
  - `surfaces.html`
  - `ui.html`
  - `creator.html`
  - `buildbuy.html`
  - `meshy.html`: lab comparing the procedural body with the raw Meshy fit (`dev/meshy/`)
  - `venues.html`: the generated venue and home lots from above or from the four dollhouse angles (`?lot=cafe&view=iso`); `dev/venues-shots.mjs` takes screenshots into `dev/venues-shots/` (JPEG)

## Documentation

- [docs/DESIGN_BRIEF.md](docs/DESIGN_BRIEF.md): game design goals
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): code structure and systems
- [docs/UI_SPEC.md](docs/UI_SPEC.md): interface and input behaviour
- [docs/ROADMAP.md](docs/ROADMAP.md): milestones
- [docs/CONTENT_STATUS.md](docs/CONTENT_STATUS.md): content counts and validation
- [docs/ASSET_GUIDE.md](docs/ASSET_GUIDE.md): asset pipeline and guidelines
- [docs/TEST_CHECKLIST.md](docs/TEST_CHECKLIST.md): manual test checklist
- [docs/CONTINUATION.md](docs/CONTINUATION.md): current state and handover notes

## Assets and licenses

- Character animations and classic bodies: Quaternius Universal Animation Library (CC0).
- Detailed character bodies: generated with Meshy (see `public/assets/LICENSES.md` for the terms).
- Furniture models and UI sounds: Kenney Furniture Kit and Kenney UI sounds (CC0).
- Seamless detail maps for some walls and floors (`public/assets/surfaces/`): generated with fal.ai FLUX.1 [dev], tinted with each palette at run time (terms in `public/assets/LICENSES.md`).
- Everything else (wall and floor layouts, doors, windows, faces, hair and clothing) is generated by the project's code.

See [public/assets/LICENSES.md](public/assets/LICENSES.md) for details.

To rebuild the generated assets, run `node tools/build-assets.mjs` (or `npm run assets`). This requires the `felixarvid2/test` asset library checked out at `../test/assets`.
