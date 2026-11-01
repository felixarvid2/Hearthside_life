# Hearthside Life - Interface specification (Milestone 1)

Brief references: sections 6.1, 16, 20, 22 (overlay), 23 (save UI), 26 (Milestone 1 acceptance).

## Look and feel

- Warm, calm, readable. Cream paper panels (`#fbf6ee`) with soft shadows and 14-18 px radii, a deep
  ink text colour (`#2f2a26`), one warm accent (terracotta `#d9774b`) and one cool accent (teal `#2f8f83`).
  Dark mode is not required for M1, but colours are defined as CSS custom properties on `:root`.
- Font: system UI stack (`system-ui, -apple-system, Segoe UI, Roboto, sans-serif`); base 16 px; a text-scale
  setting multiplies the root font size (90-130 %). No text below 12 px at 100 %.
- Icons: inline SVG drawn for this game (simple rounded line icons) or Unicode-free labelled buttons. Every
  unfamiliar icon has a visible label or `aria-label` plus a tooltip on desktop; essential actions also have text.
- Primary touch targets at least 44 x 44 CSS px. No hover-only controls. Focus outlines visible for keyboard use.
- Need bars and placement feedback never rely on colour alone (icons, patterns, text such as "Blocked: wall").

## Layout rules

- The canvas fills the visual viewport. Use `100dvh`, `env(safe-area-inset-*)` padding, and listen to
  `visualViewport` resize. After any resize or orientation change the renderer updates its buffer, the
  orthographic frustum, picking and overlay anchors from the canvas's actual `getBoundingClientRect()`.
- Orientation is never locked and never "please rotate". Every feature works in portrait and landscape.
- **Portrait** (aspect < 1): compact top bar; household strip under it; contextual panels as bottom sheets
  with three heights (peek ~88 px, half ~45 %, full ~85 %) and a drag handle plus explicit expand/collapse
  buttons. **Landscape**: top bar; bottom HUD bar; panels dock as a side panel (right, ~360 px, max 40 % width).
- A selected person or the object being placed stays visible: when a sheet/panel opens, the camera offsets so
  the focus sits in the remaining visible area.
- Touches that start on UI never reach the world: only `pointerdown` on the canvas starts world input.

## Screens

1. **Boot**: progress while assets load; if WebGL2 is unavailable, a compatibility screen explaining the
   requirement (and that saves are safe) instead of a blank page.
2. **Main menu** over a slowly rotating live view of the starter house: Continue (latest save, when one exists),
   New Game, Load Game, Settings. New Game opens the start-mode chooser:
   - **Guided Start** - a premade household in the furnished house, a manageable balance and a short tutorial.
   - **Create a Household** - the character creator, then move into the starter house.
   - **Build Sandbox** - unlimited building funds (clearly labelled) with a premade or created household.
3. **Character creator** (7 steps: Identity, Face & Body, Hair, Clothing, Personality, Household, Review).
   - Live animated 3D preview with rotate left/right buttons, zoom +/-, and view buttons Front / Side / Back /
     Face. Drag on the preview rotates (shortcut only). Portrait: preview on top (~42 % height), editing sheet
     below (expandable). Landscape: preview left, editing panel right.
   - Step tabs (scrollable chips) with Back / Next; free navigation keeps edits. Member strip with portraits:
     add (random or blank), duplicate, remove, reorder; max 8 (M1 creates adults).
   - Toolbar: Undo, Redo, Randomize this step, Randomize all, lock toggles per category (identity, face, body,
     hair, clothing, personality), reset category, presets (face/body), copy/paste appearance.
   - Controls are sliders with -/+ step buttons and numeric value, swatch grids with a custom colour input,
     segmented buttons and cards - never precision dragging on the face.
   - Identity: first/last name, pronouns (she/her, he/him, they/them, custom), voice preset + pitch,
     walk style, romantic interest, short bio.
   - Face & Body: frame A/B, body presets, body sliders, skin tones + custom, face presets, grouped face
     sliders, eye colour, brow style/colour, freckles, blush, lip tint/colour.
   - Hair: style cards, colour swatches + custom, highlight, facial hair.
   - Clothing: outfit category tabs (Everyday, Formal, Work, Athletic, Sleepwear, Swimwear); several outfits
     per category; per layer (Top, Bottom, Full outfit, Outerwear, Shoes) a garment picker, colour, pattern,
     pattern colour; conflicts resolved automatically with a note ("A full outfit replaces top and bottom").
   - Personality: exactly three traits (conflicts disabled with the reason), aspiration with its stages,
     likes/dislikes chips, starting job (Culinary or none).
   - Household: household name, ties between members (parent/child, sibling, partner/spouse, roommate,
     none) with validation messages, a simple family tree, starting funds.
   - Review: summary per member, every validation issue with a "Fix" link to the step, Move In button.
   - Confirming creates real people with those choices (no premade replacement).
4. **Live mode HUD**
   - Top bar: day and time, speed buttons (Pause, Normal, Fast, Very fast), household funds (tap -> ledger),
     menu button.
   - Household strip: portrait per member (rendered by the renderer), mood ring, tap to select, away badge
     (at work with return time).
   - Person panel (sheet/side panel): name and mood with reasons; tabs Needs (six bars with icons and
     labels), Queue (current action with progress, queued actions with cancel X; reorder with up/down),
     Relationships (people known with friendship/romance bars and status), Career (job, level, schedule,
     performance, today's shift and expected pay, promotion requirements), Skills, Aspiration (stages,
     objectives with progress, reward), Traits.
   - Tap a person/object -> contextual interaction menu near the target (anchored with worldToScreen, kept
     on-screen), entries grouped, disabled entries show the reason. Tap ground -> walk there ("Go here").
   - Event feed: concise toasts (auto-hide) and a feed panel with the recent history.
   - Mode switcher: Live / Buy / Build. Camera buttons: rotate left/right, zoom in/out, walls (up / cutaway /
     down), centre on selected person.
   - Thought bubbles and speech icons over people; selected person ring; plumb-free original marker
     (a soft glowing ring under the feet).
5. **Buy mode** (simulation paused, clearly indicated)
   - Catalog: category tabs, filters (room, price tier, functional/decorative), search, favourites and recently
     used; paginated or virtualised grid with thumbnail, name and price; detail card with description,
     dimensions, quality, gameplay stats, finish swatches and "Decorative" label where relevant.
   - Placement: preview ghost (green valid / red with a text reason), Rotate, Confirm, Cancel buttons; tap a
     tile to move the ghost; desktop: ghost follows the cursor, click confirms, R rotates, Esc cancels.
     Cost shown before confirming; unaffordable is disabled with the reason.
   - Tap a placed object: Move, Rotate, Sell (shows the refund), Store in inventory, finish swatches.
   - Inventory tab: stored objects, place from inventory. Undo / Redo buttons.
6. **Build mode** (M1 finishes, M2 construction)
   - Tool tabs: **Paint** (finishes), **Walls**, **Room**, **Doors**, **Windows**, **Erase**. The grid is drawn over the lot while
     building. With no tool chosen, hovering (mouse) or tapping a room outlines it and offers "Demolish room".
   - Wall finishes: design grid (thumbnails), palette swatches, scope (one wall side / whole room), live
     in-world preview on hover/tap before committing, eyedropper, recently used.
   - Floors: design grid, palettes, scope (one tile / area by dragging a rectangle / whole room), eyedropper.
   - Walls: a run (drag) or one piece (tap), height presets, plain paint or the chosen finish on both sides.
   - Room: drag a rectangle; options for the floor (the chosen one or none), a door and a window with their side.
   - Doors / Windows: catalog with pictures, names and prices (width in tiles for wide ones); actions Place, Move, Turn around, Remove.
   - Erase: wall piece, wall run, walls in an area, door or window, floor tile, floor area, floor of a room, delete a room.
   - Preview: ghost walls (translucent), demolition hatched, blocked things hatched with a red marker (never colour alone), tiles tinted,
     a ghost door/window in its wall. The footer states the action, measurement, counts, money (cost, "money back") or the first reason.
   - **Touch**: a tap or a one-finger drag only sets the preview; large round handles resize the shape; **Confirm** applies it, **Cancel**
     clears it ("Done" when nothing is pending). Two fingers pan and zoom. The preview survives rotating the device and pointer cancel.
     **Desktop**: hover previews click tools and a click applies; a drag applies on release; Esc cancels (then ends the tool); R turns an
     opening around; Enter confirms; right-drag pans.
   - Walls up/down/cutaway control stays available. Undo / Redo. The simulation stays paused.
7. **Game menu**: Save (5 named slots + autosave/backup display, overwrite confirmation), Load, Export world
   (download JSON), Import world (file picker; errors shown clearly, current save untouched), Settings,
   Quit to main menu. The backup export is easy to find ("Download a backup of this world").
8. **Settings**: master/sound/music volume, reduced camera motion, text size, graphics quality (low/high,
   shadows), autonomy on/off and level, neighbour visits on/off, performance overlay. Saved in localStorage.
9. **Wardrobe** (from the `editOutfits` interaction): the creator's clothing step for one existing person;
   Save applies the edited wardrobe through the game API.
10. **Tutorial** (Guided Start): a small dismissible checklist card: select your person, eat something, sleep or
   nap, check needs, go to work or join a career, meet the neighbour, buy and move an object, change a wall
   finish, save the game. Steps tick off from real events.
11. **Developer overlay** (`?debug` or the setting): FPS, frame time, draw calls, triangles, geometries,
   textures, loaded assets, active agents, route requests, simulation tick time.

## Input state machine (world canvas)

States: `idle`, `pressing` (pointer down, < 8 px movement, < 500 ms), `panning`, `pinching`, `placing`
(Buy placement), `painting` (Build; with a structure tool that drags out a shape, `drawing`). Rules:
- A press that moves >= 8 px becomes a pan and never issues a tap/walk command.
- Two pointers -> pinch zoom (and optional two-finger rotate snapped to 90 degrees).
- `pointercancel`, `lostpointercapture` and `blur` reset to idle without side effects.
- Wheel zooms around the cursor; right-drag or middle-drag pans on desktop.
- Keys: WASD/arrows pan, Q/E rotate, +/- zoom, Space pause/resume, 1/2/3 speeds, Esc cancel/close,
  Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) undo/redo, R rotate placement, Delete sells the selected object in Buy mode.

## Audio

`public/assets/audio/*.ogg` (Kenney CC0): click, tap, open, close, confirm, error, place, sell, paint, select,
toggle, money, notify, promotion, levelUp, social, newDay. Sound volume applies to these; music volume applies to
an optional gentle generative ambient track (WebAudio, original) that can be switched off. All essential
information is also shown visually.
