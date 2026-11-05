Read dev/ds-tasks/m115/common.md first and follow it.

## Task S: screens show what the person is doing

1. **Screen placement.** Furniture is GLB (`src/render/objectAssets.ts`, `src/content/objects.ts`). Find which defs
   have a screen: desktop computer (`computer` asset), laptops if any, TVs (`tvFlat` and any other TV/monitor defs),
   game consoles/arcades if any. Measure each model's screen rectangle (write a small node script under
   `dev/ds-tasks/m115/` that reads the GLB bounds/nodes/materials) and record it in a table in a new data module
   `src/content/screens.ts`: defId -> local centre, size, facing, slight offset in front of the glass. A content test
   checks every def that `computer`/`watchTv`/`playComputerGames` etc. can target has a screen entry.
2. **Screen content.** New module `src/render/screensView.ts`: for each screen object on the visible lot, a quad with
   a small canvas texture (e.g. 256x160, pooled, max ~4 live canvases; others show a cheap static "on"/"off"
   texture). Off = dark glossy; in use = content chosen by the running interaction (use `objectUses(state)` from
   `src/render/objectUse.ts`), with progress taken from `elapsed/duration` so it advances with the game clock:
   - writeArticle / writeBook / writeJournal / writePaper / freelance writing: a word-processor page whose lines are
     typed out over the action (characters appear, blinking cursor, page fills and scrolls; deterministic pseudo
     text seeded by action id, e.g. lorem-like syllables, not real text).
   - practiceProgramming / programming / programGig: code editor with coloured syntax lines being typed, a terminal
     pane printing "build ok" / test dots now and then.
   - playComputerGames: a simple animated game (platformer squares or a little racing track) with a score counter.
   - browsing / social / job search / bills or any other computer use: a web page layout with cards scrolling.
   - watchTv: programme pictures that change every few seconds (news with ticker, nature landscape, cartoon blobs,
     cooking show, sport field), channel chosen deterministically from the action; TVs that are on with nobody
     watching stay off. A soft emissive glow on the screen (no new light).
   - Map every computer/TV interaction id that exists in `src/content/interactions.ts` (grep `computer`, `watchTv`,
     `phone` anims) to one of these modes; unknown -> generic desktop. List the mapping in your progress file and test
     it (pure function interactionId -> screen mode).
   Redraw a canvas at most ~4 times per second per screen, only while it is in use and its lot/level is visible; with
   reducedMotion redraw once per second without scrolling animation. Respect cutaway (if the object is hidden, the
   screen is hidden).
3. **Hook** into `src/render/gameView.ts` with a minimal addition (create, sync on lot change, update each frame,
   dispose). Do not edit `objectsView.ts` beyond exposing what you need to find an object's world transform (if there
   is no accessor, add a small read-only one).
4. **Tests.** Unit tests for the interaction -> mode mapping, the deterministic typed-text progress (same action and
   progress -> same visible text; more progress -> more characters), the screens table, and pooling limits.
5. **Screenshots** in all three viewports, camera close to the screen: writing at 20% and 80% (text visibly longer),
   programming, gaming, TV on with someone watching, TV/computer off.

Do not do furniture moving parts (task D), hand props (task H) or the progress pill (task B). Progress file:
dev/ds-tasks/m115/S-progress.md.
