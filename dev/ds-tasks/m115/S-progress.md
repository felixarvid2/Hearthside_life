# Task S — screens show what the person is doing

Milestone 11.5, render-side only. Design first, then code, then checks. Files:

- `src/content/screens.ts` — measured screen rectangles and the interaction → mode table (pure data).
- `src/render/screenPrograms.ts` — deterministic picture generators + the canvas slot pool (DOM-free, unit-tested).
- `src/render/screensView.ts` — the quads, pooled 256×160 canvases, throttled drawing, all the pictorial modes.
- `src/render/objectUse.ts` — existing helper; extended with `actionId`/`queuedAt` so the picture can be seeded by the
  running action (the file was already in the tree from the task scaffolding and did not typecheck; fixed its import).
- `src/render/gameView.ts` — create/sync/update/dispose. `src/render/objectsView.ts` — one read-only
  `rootOf(id)` accessor, nothing else.
- Tests: `tests/unit/content/screens.test.ts`, `tests/unit/render/screenPrograms.test.ts`.
- Shots: `dev/ds-tasks/m115/shoot-s.mjs` → `dev/ds-tasks/m115/shots/S/` (self-locks the browser lock).

## Design (before coding)

1. **Measure the glass, not the model.** `dev/ds-tasks/m115/measure-screens.mjs` parses the furniture GLBs (JSON +
   BIN chunks, node TRS, accessor component types u8/u16/u32/f32), collects front-facing triangles per material and
   prints the large front quad. The numbers were then mapped through the same `fit()` maths as
   `content/objects.ts` (scale, yaw, offset) into the definition's rot-0 local space. Only four defs have screens:
   `computer-desktop`, `laptop`, `tv-flatscreen`, `tv-vintage`. No consoles/arcades exist in the content.
2. **Attach to the object group.** A screen quad is a child of the object's group (`ObjectsView.rootOf`), so it
   inherits placement, rotation, floor/level visibility, cutaway and hidden/placement states without a second
   transform pipeline. The quad floats a few millimetres in front of the measured glass along its normal; the laptop
   and desktop panels are tilted, so their `facing` is not plain +z.
3. **Content is derived, never stored.** `objectUses(state, lotId)` already maps object id → running action. The screen
   mode comes from the interaction id, progress from `elapsed / duration`, the seed from the action id, and the
   animation phase from the game clock. No new persisted state, no simulation changes.
4. **Cheap.** Four pooled canvases at most for the screens nearest the camera; any further in-use screen gets a shared
   static "on" picture. Off screens use one shared dark-glass texture. Redraw at most 4×/s (2×/s on low quality, 1×/s
   with reduced motion, which also freezes scrolling/bobbing/blinking). No lights: the glow is an additive quad.
5. **Determinism.** `screenPrograms.ts` is pure: seeded xorshift + lorem-like syllables, so the same action and the
   same progress always type the same words, and more progress always types more characters. Code, game frames, TV
   channel/scene, ticker and web scroll are derived the same way.

## Measured screens (rot-0 local space, metres)

| def | kind | centre | width × height | facing | offset |
| --- | --- | --- | --- | --- | --- |
| `tv-flatscreen` | tv | (0.5, 0.3671, 0.53) | 0.9352 × 0.5159 | (0, 0, 1) | 0.006 |
| `tv-vintage` | tv | (0.3919, 0.27, 0.73) | 0.4658 × 0.2928 | (0, 0, 1) | 0.006 |
| `computer-desktop` | computer | (0.5, 0.3426, 0.4999) | 0.7582 × 0.4674 | unit(0, 0.14, 0.99) | 0.006 |
| `laptop` | computer | (0.5, 0.1313, 0.3879) | 0.3429 × 0.1909 | unit(0, 0.41, 0.91) | 0.004 |

`dev/ds-tasks/m115/measure-screens.mjs` carries the raw quad extents per model in its comments.

## Interaction → picture mode

| mode | interactions |
| --- | --- |
| `document` (word processor, typed page, cursor) | `writeArticle`, `writeBook`, `writeJournal`, `writePaper`, `doHomework`, `studyHard`, `sketchIdeas` |
| `code` (editor + terminal, tests fill in) | `practiceProgramming`, `programGig` |
| `game` (platformer, score/level) | `playComputerGames`, `playChess` |
| `web` (browser cards scrolling) | `jobSearch`, `adoptOnline`, `phoneAdopt`, `researchOnline`, `phoneChat`, `phoneInvite`, `phoneDate`, `phoneBills`, `phoneJobs`, `planEvent`, `callRepairperson` |
| `tv` (news / nature / cartoon / cooking / sport) | `watchTv` |
| `desktop` (generic fallback) | `playPiano`, `busk` (they use the sitting/computer anim but are not screen furniture), and anything unknown |

Phone interactions have no screen quad of their own, but they are in the table so the mapping is complete. A content
test asserts every interaction whose perform animation is `computer`, `watchTv` or `phone` has an explicit entry, and
that every id in the table exists in the content database.

## Checks

- `npx vitest run tests/unit/content/screens.test.ts tests/unit/render/screenPrograms.test.ts` — 31 passed.
- `npm run content:check` — 0 errors, 0 warnings.
- `npx tsc --noEmit` — our files are clean. Remaining errors belong to other agents' in-progress files
  (`src/render/actionProgress.ts`, `tests/unit/tmp-bones.test.ts`); re-run before the final commit.
- Screenshots/check log: see below (filled in after the script run).
