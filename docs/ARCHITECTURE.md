# Hearthside Life - Architecture

Status: Milestone 1 (creator and playable foundation). This document is the contract between modules.
Read `src/core/types.ts`, `src/content/types.ts` and the files in `src/core/` before changing anything.

## Principles

- **One authoritative state** (`WorldState`, `src/core/types.ts`), plain JSON. No Three.js objects, DOM nodes,
  closures, Maps/Sets or promises inside it. `cloneState()` (JSON round trip) must preserve it exactly.
- **Simulation is independent of rendering and UI.** `src/sim`, `src/world`, `src/building`, `src/content`,
  `src/persistence` and `src/core` never import `three` or touch the DOM (IndexedDB in persistence is the only
  browser API allowed there). They are tested with Vitest in Node.
- **Fixed timestep.** One tick = `TICK_MINUTES` (0.25 game minutes). Speed changes the number of ticks per
  real second, never the tick length. Rendering interpolates. See `src/core/clock.ts`.
- **Seeded randomness.** The simulation draws only from `new Rng(state.rng)` (mutates `state.rng` in place).
  UI-only randomness (creator randomize) uses `uiRng()`.
- **Money** is integer cents and changes only through `transact()` (`src/core/state.ts`), which records a
  ledger entry and, with an occurrence id, applies at most once.
- **Occurrences.** Every shift, wage, visit, bill and reward has an occurrence id (e.g. `shift:per_3:12`,
  `pay:per_3:12`, `visit:per_9:4`). Applied occurrences are recorded in `state.processed`, so fast-forward,
  catch-up and load cannot apply them twice.
- **Commands.** Player edits in Build/Buy are `UndoableCommand`s (`src/core/commands.ts`) that validate the
  whole operation before changing anything and capture exact before/after data. Live-mode orders go through
  `Simulation.queue/cancel`.
- **Stable ids** from `newId()` (`src/core/ids.ts`). Walls are identified by their edge key.
- **English** for all game text, identifiers and docs.

## Units and coordinates

- 1 world unit = 1 metre = 1 tile. Lot origin (0,0) is the north-west corner; +x east, +z south, +y up.
- Tile (x, z) covers [x, x+1] x [z, z+1]; its centre is (x+0.5, z+0.5).
- Walls sit on grid edges (`edgeKey(level, dir, x, z)`):
  - `h` edge (x, z): from (x, z) to (x+1, z). Side `a` faces tile (x, z-1) (north), side `b` faces (x, z) (south).
  - `v` edge (x, z): from (x, z) to (x, z+1). Side `a` faces tile (x-1, z) (west), side `b` faces (x, z) (east).
- Wall height 2.8 m in M1. Wall thickness (visual) 0.12 m centred on the edge.
- Objects: footprint origin = min corner tile after rotation. Local space at rot 0 has the object front
  facing +z. `rot` = quarter turns counter-clockwise from above (three.js `rotation.y = rot * PI/2`).
  Use `src/core/geometry.ts` (`rotateLocal`, `rotateFacing`, `rotationOriginShift`, `footprintTiles`) for every
  conversion so footprints, slots and models rotate together. `ObjectDef.openCells` lists rot-0 footprint cells the model
  leaves empty (the inside of an L-shaped sofa): `blockingTiles` (not `footprintTiles`) is what blocks walking, so people step
  through those cells and use them as approach tiles, while nothing else can be placed there.
- Facing angle: 0 looks toward +z, PI/2 toward +x (`facingDir`). A model facing +z gets `rotation.y = facing`.
- Characters: feet at y = 0, height about 1.8 m, facing +z at rotation 0.
- Third-party furniture models (Kenney Furniture Kit) are roughly half scale: typical uniform scale 2.0
  (beds about 1.75). `public/assets/manifest.json` lists measured bounds (`min`, `max` before scaling) and
  material names for every model. Designs the kit lacks (easel, piano, treadmill, dishwasher, grill, crib, ...) are original
  models built by `tools/furniture-extra` in the same style, with the kit's material names and colours, written at half scale
  (scale 2.0), front towards +z, and a software-rendered isometric thumbnail (`npm run assets` or `node tools/build-extra-furniture.mjs`).

## Module map and ownership

| Path | Owner | Contents |
|---|---|---|
| `src/core/` | main session | types, ids, rng, clock, money, geometry, events, commands, state helpers, nav contract, drafts, anim ids |
| `src/content/types.ts`, `src/content/index.ts` | main session | definition types and the registry aggregator |
| `src/content/{objects,interactions,socials,traits,aspirations,skills,careers,careerEvents,moodlets,recipes,packs,preferences}.ts`, `src/content/validate.ts`, `tools/content-report.ts` | content | gameplay data and validation |
| `src/content/surfaces.ts`, `surfaces2.ts`, `src/render/textures/` | surfaces | wall and floor designs, door/window defs, procedural and detail-map painters (`public/assets/surfaces`), texture cache, thumbnails |
| `src/world/`, `src/building/` | world | lots, walls, rooms, navigation, placement, starter lots, build/buy commands |
| `src/sim/` | sim | people, needs, moods, actions, reservations, autonomy, social, relationships, careers, skills, aspirations, economy and bills, visitors |
| `src/characters/`, `src/content/character.ts` | characters | rig assembly, body/face deformation, procedural hair and clothing, animation, creator model |
| `src/persistence/` | persistence | IndexedDB saves, slots, autosave, backup, migrations, import/export, templates |
| `src/render/` (except textures), `src/game/` | render | renderer, camera, lot/object/people views, picking, overlays, game loop and GameAPI |
| `src/ui/` | ui | HTML/CSS interface for every screen, input state machine |

Only the owner edits a module's files. Need a change elsewhere? Describe it in your final report.
Tests live in `tests/unit/<module>/*.test.ts`.

## Module contracts (exports other modules rely on)

### content
- Each registry file exports a typed array (`OBJECTS`, `INTERACTIONS`, ...). `content()` from
  `src/content/index.ts` returns the aggregated `ContentDB`.
- `src/content/validate.ts`: `validateContent(db: ContentDB): { errors: string[]; warnings: string[] }` -
  unique ids, cross references (object interactions exist, trait conflicts exist and are symmetric, career
  skills exist, social/interaction moodlets exist, finish palettes non-empty, slot approach tiles not inside
  the blocking footprint), and that every `status: 'ready'` entry is complete.
- `tools/content-report.ts` prints distinct-design counts per category (ready vs dev) and palette variants,
  used to write `docs/CONTENT_STATUS.md`.

### world (`src/world`)
- `lots.ts`: `createLot(state, opts: { name; address; width; depth; kind; landValue; entry: TilePos; venueType? }): Lot`
- `starter.ts`: `furnishStarterHouse(state, content, lotId): void` - builds the M1 starter house (walls, doors,
  windows, floors, furniture) on an empty 24x24 lot; `furnishNeighborHouse(state, content, lotId): void`.
- `walls.ts`: `wallBetween(lot, level, a: Tile, b: Tile): Wall | undefined` (adjacent tiles),
  `openingOnWall(lot, wallId): Opening | undefined`, `isDoorway(lot, content, wallId): boolean`,
  `wallSideFacing(wall, tile): 'a' | 'b' | null`, `setWall(lot, ...)` helpers.
- `rooms.ts`: `interface Room { id: number; level: number; tiles: Tile[]; outdoor: boolean; sides: Array<{ wallId: string; side: 'a' | 'b' }> }`,
  `computeRooms(lot, level): Room[]` (flood fill bounded by walls; doors and windows do not split rooms' walls
  but doorways connect navigation, not rooms), `roomAt(rooms, x, z): Room | undefined`.
- `placement.ts`: `validatePlacement(state, content, lotId, req: { defId; x; z; rot; level; ignoreObjectId? }): { ok: boolean; reasons: string[]; tiles: Tile[]; supportId?: Id }`
  (bounds, overlaps by layer, walls crossing the footprint, slot approach tiles reachable/not walled off,
  wall-attached needs a wall, surface items need a supporting object with `surfaceHeight`, not on a person,
  not blocking a door's two tiles), `resolveSlots(lot, obj, def): WorldSlot[]`.
- `nav.ts`: `class LotNav implements NavProvider` - `new LotNav(getState: () => WorldState, content)`.
  Grid A* with 8 directions; diagonal steps only when both orthogonal neighbours are free and no wall/corner
  is cut. Walls block edges unless a door opening is on that edge. Blocking furniture blocks tiles. People
  never block tiles (no deadlocks). Lazily rebuilt per lot/level after `invalidate(lotId)`.
- `src/building/commands.ts` - factories returning `UndoableCommand`:
  `buyObject(lotId, householdId, req: { defId; x; z; rot; level; finishes? })`,
  `moveObject(lotId, objectId, to: { x; z; rot; level })`, `sellObject(lotId, householdId, objectId)`,
  `storeObject(lotId, householdId, objectId)`, `placeFromInventory(lotId, householdId, index, to)`,
  `paintWallSide(lotId, householdId, wallId, side, finish: FinishRef)`,
  `paintRoomWalls(lotId, householdId, level, tile: Tile, finish)` (every wall side facing that room),
  `paintFloorTiles(lotId, householdId, level, tiles: Tile[], finish)`, `paintRoomFloor(lotId, householdId, level, tile, finish)`.
  Prices: object `def.price`; paint `design.price` per side/tile actually changed. Sale value: full price
  the same game day as purchase, otherwise 80 %. Moving or selling an object that holds surface items is
  rejected with a reason in M1. All emit `lot.changed`. Also `setObjectFinish(lotId, householdId, objectId,
  regionId, swatchId)`. No-op edits (same finish/position) are rejected so they never enter the undo stack.
  Undoing a sale writes a negative `sale` entry (allowDebt) so the sandbox cannot create money.
  `src/building/plans.ts`: pure validation/cost per operation and `saleValue(state, obj)`.
  `src/building/preview.ts`: `previewBuy/previewMove/previewPlaceFromInventory/previewSell` -> `{ ok, reasons, cost, tiles }`
  and `previewPaint(state, content, lotId, hh, target: wallSide | roomWalls | floorTiles | roomFloor, finish)` with `count`, `sides`.
- Implementation notes: `validatePlacement` also returns `warnings`; `new LotNav(getState, content, events?)`
  invalidates itself on `lot.changed` when given the bus; `findPath` `blocked` keys are `tileKey(level, x, z)`;
  `slotsOf` returns approach tiles adjusted to the current lot (nearest free side of the slot tile when the
  authored approach is blocked; TVs/computers may be used from the chair in front). Set
  `lot.ownerHouseholdId` before `furnishStarterHouse`; starter furnishings count as bought a day earlier.

### Build mode construction (Milestone 2: walls, rooms, doors, windows, floors)

Pure code (no three, no DOM), tested in `tests/unit/building/build*.test.ts` and `tests/unit/integration/buildmode.test.ts`.
The UI talks to it only through the build section of `GameAPI` (documented at the top of `src/game/api.ts`).

- **Data**: `Wall` may carry `purchasePrice` + `boughtAt` (what the player paid; absent on walls that came with the lot);
  `Opening` may carry `span` (edges covered, absent = 1) + `boughtAt`. A wide opening starts at `wallId` (the edge with the smallest
  x/z) and covers `openingEdgeKeys(opening)` along +x ('h') or +z ('v'). `openingOnWall`/`openingsByWall`/nav grids/door clearance all
  use the spanned edges. Optional fields: no save migration needed.
- `src/world/structure.ts`: `BuildDiff` (exact walls/openings/floors before -> after), `virtualLot`, `applyDiff`/`revertDiff`/`diffMatchesLot`,
  and `validateDiff(state, content, lot, diff) -> { reasons, conflicts }`, the construction-safety rules (brief 17): lot bounds, no wall through
  an object footprint, no wall within 0.3 m of a person (0.15 m seated/lying; people are never pushed), no wall that walls a person in or
  seals furniture off from the lot entry, every previously usable object slot stays usable, wall-mounted objects keep their wall,
  openings need walls on every spanned edge, no overlap, enough wall height (sill + height), no wall joining the middle of a wide
  opening, nothing hung on the edges, doors keep both side tiles free of blocking furniture. Removing/moving the last door out of a room
  with people or furniture in it is refused. Parts of the lot that were already cut off are not judged.
- `src/world/roomTracker.ts`: `RoomTracker.update(lot, level) -> TrackedRoom[]` (`Room` + runtime `uid`, matched to the previous result by
  shared tiles, so unchanged rooms keep their uid and the biggest part of a split/resized room keeps it), `RoomTracker.delta(before, after)`,
  `roomOutlines(tiles) -> Vertex[][]` (closed grid-vertex loops, collinear points merged, holes after the outer loop).
- `src/building/buildPlans.ts`: pure planning. `planBuild(state, content, lotId, householdId, req: BuildRequest) -> BuildPlan`
  (`ok, reasons, noop, label, cost, charge, refund, counts, measure, highlight, rooms {before, after}, diff`). Requests: `walls` (segment,
  run or rectangle perimeter, optional `floor` fill and bundled `openings`, so a sealed room and its door are one transaction),
  `eraseWalls` (segment/run/rect), `placeOpening`, `moveOpening`, `eraseOpening`, `eraseFloor` (tiles or a room), `deleteRoom`.
  Builders: `wallSegmentRequest`, `wallRunRequest`, `wallRectRequest`, `eraseSegmentRequest/RunRequest/RectRequest`, `runEdges`,
  `rectPerimeter`, `straightenRun`. Constants `WALL_HEIGHT_PRESETS` (1.2 / 2.8 / 3.6 m), `WALL_SEGMENT_PRICE`, `structurePrice(height)`.
  Prices: wall segment = structure (scaled by height) + design price of each side (existing segments are kept with their finishes and
  cost nothing); floor = design price per changed tile; opening = definition price. Sandbox: 0 charge, 0 recorded price. Demolition
  returns the paid price on the day it was built, else 80 % (`RESALE_RATE`); things that came with the lot return 80 % of today's
  structure/design price (nothing in the sandbox). Deleting a wall deletes (and refunds) the opening in it in the same command.
- `src/building/buildCommands.ts`: `buildCommand(lotId, householdId, req): BuildCommand` (an `UndoableCommand` with `.plan`) and factories
  `placeWallSegment/placeWallRun/placeRoom`, `eraseWallSegment/eraseWallRun/eraseWallRect`, `placeOpening/moveOpening/deleteOpening`,
  `placeFloorTiles/placeFloorRect/fillRoomFloor` (the paint commands), `eraseFloorTiles/eraseRoomFloor`, `deleteRoom`. apply = plan, one
  `transact()` for the net cost, ids for new openings, write the diff, emit `lot.changed` (nav invalidation and `Simulation.onLotChanged`
  follow). A rejected apply changes nothing (not even `nextId`). revert restores the captured records and reverses the money that actually
  moved. reapply re-validates against the lot and re-charges the captured amount.
- `src/game/core/build.ts`: `BuildTools` (tool state, snapping, `resolveBuild`, preview, apply, `rooms()`, `roomAt()`, `openingAt()`), used
  by `GameCore` and by the UI mock APIs (`src/ui/dev/mockGame.ts`, `src/ui/buy/dev/mockApi.ts`), which run the real planner on their mock world.
- **Build mode UI (Milestone 2)**: `src/ui/build/buildSession.ts` (no DOM) turns pointer points into `BuildTarget`s, previews them through
  `buildPreview` and applies through `buildApply`; `buildOverlay.ts` draws the corner/end handles (48 px) and the tip next to the shape;
  `structureTools.ts` holds the Wall / Room / Door / Window / Erase sections and the footer (live text, Confirm, Cancel, Turn around);
  `buildMode.ts` is the panel with the tool tabs (Paint = the M1 finishes). `ui/input.ts` routes taps and drags to the session; the input
  machine has a draw mode (one-finger or left-mouse drag draws, two fingers pan and zoom). Touch: a tap or drag only sets the preview and
  Confirm applies; desktop: click tools apply on click, drag tools on mouse-up (Esc cancels). Rendering: `render/buildView.ts` (grid, ghost
  walls, hatched demolition/conflicts, floor tiles, ghost door/window, room outline), fed by `Game.refreshBuildPreview` from
  `buildHighlight()`; `GameAPI.highlightRoom(uid)` outlines a room; `thumbnails.opening(defId)` renders door/window pictures
  (`render/openingThumbs.ts`, one per frame). `render/lotView.ts` cuts a hole in every edge a wide opening spans (and in the posts between).
- Not done yet: move/resize/duplicate whole rooms (delete room exists), wall height change on existing walls, diagonal walls, upper floors.

### sim (`src/sim`)
- `people.ts`: `createPerson(state, content, draft: PersonDraft, householdId, location: PersonLocation): Person`
  (adds to `state.people` and the household), `applyHouseholdTies(state, memberIds, ties)`.
- `simulation.ts`:
  ```ts
  class Simulation {
    constructor(o: { getState: () => WorldState; content: ContentDB; nav: NavProvider; events: EventBus });
    tick(): void;                                   // one fixed tick
    queue(personId: Id, req: ActionRequest): { ok: true; actionId: Id } | { ok: false; reason: string };
    cancel(personId: Id, actionId: Id): void;       // phase-appropriate cleanup, releases reservations
    reorder(personId: Id, actionId: Id, toIndex: number): void; // queued (not running) actions only
    options(personId: Id, target: ActionInstance['target']): InteractionOption[]; // context menu entries with disabled reasons
    onLotChanged(lotId: Id): void;                  // revalidate actions/reservations after build/buy
    rebuild(): void;                                // after load or state replacement: rebuild runtime caches/reservations
    mood(personId: Id): { value: number; label: string; reasons: string[] };
    stats(): { agents: number; tickMs: number; routeRequests: number };
  }
  type ActionRequest = { interactionId: string; target: ActionInstance['target']; data?: Record<string, string | number | boolean | null>; source?: ActionInstance['source'] };
  type InteractionOption = { interactionId: string; label: string; icon: string; group: 'object' | 'social' | 'self' | 'move'; enabled: boolean; reason?: string; target: ActionInstance['target']; data?: Record<string, string | number | boolean | null> };
  ```
- Visitors: neighbours visit through `state.schedule` (`visitArrive`/`visitLeave`), arriving at `lot.entry`. Every visit is an event
  (see "Relationships and events" below); event guests stay until it ends.

### characters (`src/characters`)
- `assets.ts`: `loadCharacterAssets(baseUrl = './assets/', style = 'detailed'): Promise<CharacterAssets>` (bodies + clips) and
  `setCharacterStyle(assets, style)`. Styles: `detailed` (scanned Meshy bodies `meshy_a/b.glb`, skin recoloured through a
  mask: `meshyBody.ts`, `meshyAtlas.ts`, `meshyBake.ts`, `meshyFit.ts`, `headMap.ts`, `createMeshySkinMaterial`) and `classic`
  (procedural skin). `assets.frames` is the active set; `CharacterView.refreshStyle()` rebuilds a person after a switch.
- `CharacterView.ts`: `new CharacterView(assets, content, appearance, outfit)` with `root: THREE.Group`,
  `setAppearance(a)`, `setOutfit(o)`, `play(anim: AnimId, opts?: { fade?: number })`, `update(dtSeconds)`,
  `headTop(target: THREE.Vector3): THREE.Vector3`, `setSelected(on)`, `dispose()`. Feet at origin, faces +z.
- `creator.ts` (pure): `CreatorSession` (edit a `HouseholdDraft`: steps, undo/redo, locks, randomize
  category/all, presets, copy/paste appearance, validation), `randomPersonDraft(rng, content, opts?)`,
  `defaultWardrobe(content, rng, opts?)`, `premadeHouseholds(content): HouseholdDraft[]`,
  `validateHousehold(draft, content): string[]`.
- `outfits.ts` (pure): `resolveOutfit(outfit, content)`, `currentOutfit(person)`.

### persistence (`src/persistence`, barrel `src/persistence/index.ts`)
- `SaveStore.open(dbName = 'hearthside', { clock?, content? })` never rejects; `available`/`unavailableReason`
  report private-mode storage. `list()` (always 7 entries: `slot-1`..`slot-5`, `autosave`, `backup`),
  `latest()`, `save(slotId, name, state)` (manual slots only), `autosave(state)` (rotates the previous intact
  autosave into `backup` in the same transaction), `load(slotId, content?)` -> `{ ok, state, report, meta }` or
  `{ ok: false, error, code }`, `remove`, `rename`, `importToSlot`.
- `exportWorld(state, exportedAt, packs?)`, `importWorld(json, content)`, `migrate(raw)`,
  `validateWorld(state, content)` -> `{ errors, warnings, missing }`; `describeReport(report)` for the UI.
  Missing content references are reported, never deleted.
- `TemplateStore` (kinds `appearance`, `household`), `exportTemplate`/`importTemplate`.
- `Autosaver({ store, getState, isBusy })`: `requestSoon()` after build/buy commands, `tick(gameMinutes)`,
  `flush()` on page hide, `reset(gameMinutes)` after load/new game. `requestPersistentStorage()` at start-up.

### render + game (`src/render`, `src/game`)
- `GameAPI` (`src/game/api.ts`) is the only thing the UI talks to. Written after the modules above exist.

## Milestone 1 shared ids

These ids are used across modules and must exist with these meanings.

**Objects** (content creates them; world furnishes the starter house with them):

| id | footprint (w x d) | layer | key slots / interactions |
|---|---|---|---|
| `bed-double-oak` | 2 x 2 | floor | 2 sleep slots (left/right half), approach from the sides; sleep, nap |
| `bed-single-pine` | 1 x 2 | floor | 1 sleep slot; sleep, nap |
| `fridge-standard` | 1 x 1 | floor | use slot in front; grabSnack, cookMeal |
| `stove-basic` | 1 x 1 | floor | use slot in front; (used by cookMeal) |
| `counter-basic` | 1 x 1 | floor | surface 0.9 m; meals are served here |
| `counter-sink` | 1 x 1 | floor | surface; washHands |
| `table-dining-oak` | 2 x 1 | floor | surface 0.66 m; meals can be served here |
| `chair-dining-oak` | 1 x 1 | floor | sit slot; sit |
| `sofa-tweed` | 2 x 1 | floor | 2 sit slots; sit, nap |
| `armchair-lounge` | 1 x 1 | floor | sit slot; sit |
| `table-coffee` | 1 x 1 | floor | surface |
| `tv-stand-low` | 2 x 1 | floor | surface 0.6 m |
| `tv-flatscreen` | 1 x 1 | surface | use slot (stand in front); watchTv |
| `toilet-basic` | 1 x 1 | floor | sit slot; useToilet |
| `shower-stall` | 1 x 1 | floor | use slot inside; takeShower |
| `bathroom-sink` | 1 x 1 | floor | use slot in front; washHands |
| `bathroom-mirror` | 1 x 1 | wall | use slot in front; practiceSpeech |
| `bookcase-open` | 1 x 1 | floor | use slot in front; readBook |
| `desk-oak` | 2 x 1 | floor | surface 0.76 m |
| `chair-desk` | 1 x 1 | floor | sit slot; sit |
| `computer-desktop` | 1 x 1 | surface | use slot (sit at the chair in front or stand); playComputerGames, practiceProgramming |
| `wardrobe-tall` | 1 x 1 | floor | use slot in front; changeOutfit, editOutfits |
| `nightstand-oak` | 1 x 1 | floor | surface |
| `lamp-floor-round` | 1 x 1 | floor | decorative |
| `plant-potted` | 1 x 1 | floor | waterPlant |
| `rug-rectangle` | 3 x 2 | rug | decorative, does not block |
| `radio-retro` | 1 x 1 | surface | listenToMusic |
| `trash-can` | 1 x 1 | floor | decorative in M1 |

**Interactions** (content defines data; sim implements `behavior`):

| id | behavior | notes |
|---|---|---|
| `sleep` | `sleep` | lying, until energy full (max 10 h); wears the sleep outfit while in bed |
| `nap` | `rest` | lying, 90 min |
| `sit` | `sit` | seated, 30 min, comfort from object |
| `grabSnack` | `snack` | fridge, 5 min, hunger +25, cost $3 |
| `cookMeal` | `cook` | fridge -> stove -> serves a meal item (servings for the household) on the nearest free surface; cost per recipe; then queues `eatMeal` for the cook |
| `eatMeal` | `eatMeal` | item target; takes a portion; sits at a chair next to a table when one is free, else stands; 25 min |
| `useToilet` | `toilet` | seated, until bladder full |
| `takeShower` | `shower` | until hygiene full (max 30 min) |
| `washHands` | `generic` | 3 min, hygiene +10 |
| `watchTv` | `watchTv` | uses a free seat within 5 m that faces the TV, else stands at the TV slot; fun |
| `playComputerGames` | `computer` | sits at a chair in front of the desk when present; fun |
| `practiceProgramming` | `computer` | programming skill xp; small fun |
| `readBook` | `read` | takes a book: sits at a nearby free seat when present; fun + logic xp |
| `listenToMusic` | `generic` | fun, standing, 30 min |
| `practiceSpeech` | `generic` | charisma xp, at mirror |
| `waterPlant` | `generic` | water anim, 5 min, small fun |
| `changeOutfit` | `changeOutfit` | data.category = outfit category |
| `editOutfits` | `editOutfits` | emits `{ type: 'ui.request', what: 'editOutfits', personId }` |
| `goToWork` | `goToWork` | self; walk to lot entry, go off-lot for the shift |
| `goHere` | `goHere` | tile target; walk there |
| `danceSolo` | `generic` | self; fun |
| `jogInPlace` | `generic` | self; fitness xp, energy cost |
| `paintCanvas` | `generic` | easel; painting xp (+4% fun per level), moodlet inspired |
| `playPiano` | `computer` | piano; sits at a chair facing it within 1.6 m, else stands; music xp |
| `workOut` | `generic` | treadmill (slot on the belt); fitness xp, energy and hygiene cost, `active` |
| `liftWeights` | `generic` | weight bench; fitness xp, bigger energy cost, `active` |
| `playChess` | `computer` | chess table; logic xp |
| `playWithToys` | `generic` | toy chest, play box; fun |
| `grillFood` | `snack` | barbecue; $6, hunger +40, cooking xp |
| `makeCoffee` / `makeToast` / `blendSmoothie` | `snack` | counter appliances; $2 energy +12 / $1 hunger +15 / $3 hunger +20 energy +6 |
| `phoneInvite` | `invite` | self; data.personId = neighbour; schedules a visit in 60 min |
| `phoneChat` | `phoneChat` | self; data.personId; social +, small friendship gain |
| `readSkillBook` | `read` | bookcase; data.skillId (cooking, handiness, gardening, charisma, programming); trains that skill up to level 5 |
| `cleanObject` | `clean` | tag `cleanable`; scrubs dirt to 0; minutes = 6 + 24 x dirt, faster with Handiness |
| `washDishes` | `washDishes` | item (dishes); pick up, carry to a working `sink`/`dishes` object, wash; item removed on completion |
| `mopFloor` | `mop` | item (mess); wipes a puddle, spill or crumbs |
| `tidyUp` | `tidy` | self; takes 0.2 dirt off cleanable things within 5 tiles and sweeps crumbs |
| `repairObject` | `repair` | tags `plumbing`/`appliance`/`electronics`, only when broken; success by Handiness/Logic/Programming, failures can shock or splash |
| `serviceObject` | `service` | same tags; removes wear so the object breaks less often |
| `callRepairperson` | `callRepair` | same tags, only when broken; $85 (less with Charisma) charged once with the visit, fixed 90-150 min later |

**Surfaces** (surfaces agent): wall designs `plain-paint`, `subway-tile`, `stripes-regency`, `brick-classic`
and floor designs `oak-planks`, `checker-tile`, `carpet-plush`, `hex-mosaic`, `stone-pavers` must exist
(with `palettes[0]` as the default). Openings `door-panel` (door), `door-glazed` (door), `window-sash`,
`window-wide` (windows), all 1 tile wide.

**Careers**: seven 10-level tracks - `culinary`, `journalism`, `software`, `medicine`, `music`, `business` and
`landscaping` - each with its own schedule, wage curve and promotion requirements (see below). **Skills**: 16
defined, 10 of them `ready` (cooking, logic, programming, handiness, gardening, painting, music, writing,
charisma, fitness); activities, work and freelance jobs train them.

## Simulation flow per tick

1. Advance clock by `TICK_MINUTES`.
2. Process due `state.schedule` entries in time order (each occurrence once).
3. Careers: start commutes for shifts starting within 60 min (autonomy or player `goToWork`), mark missed
   shifts, return people whose shift ended, pay once per completed/partial shift. At most one on-the-job
   decision per shift is offered (answered in the Career tab, defaults to its first option at shift end).
3b. Bills: issue this week's household bill, apply a late fee once past the due date, cut utilities off once
   past the grace period, and repair a stale power flag.
4. Needs decay for everyone (traits, posture, object quality); off-lot people decay at a reduced rate.
5. Run each on-lot person's current action through its phases:
   validate -> reserve -> route -> prepare -> perform -> apply -> cleanup.
   Cancellation or failure in any phase runs that phase's cleanup and always releases reservations.
6. Autonomy for idle people (staggered, cooldowns, hysteresis), visitors' simple autonomy.
6b. Housekeeping: accidents (empty bladder away from a toilet) and, every 20 minutes, the home moodlets.
7. Moodlets expire; aspiration objectives update on events.

## Rendering and UI (summary; detailed when written)

- Single WebGL2 canvas, orthographic camera with 90-degree rotation steps, pan and zoom; walls up / down /
  cutaway. Character creator reuses the renderer with a preview scene.
- HTML/CSS panels over the canvas; portrait uses a top bar, household strip and bottom sheets; landscape uses
  a bottom HUD and side panels. Touch targets >= 44 px.

## Daily life: dirt, breakage, chores (Milestone 4)

Implemented generically by object **tags** (`src/content/capabilities.ts`): `cleanable` (gets dirty, offers Clean),
`plumbing` / `appliance` / `electronics` (wears, breaks, offers Repair, Service, Call a Repairperson), `sink` / `dishes`
(dish-washing station; `dishes` washes in half the time). A new dishwasher or washing machine only needs the tags.

- State (all optional in saves; absent = 0, repaired by `fillDailyLifeDefaults` in `persistence/schema.ts`, schema stays 1):
  `PlacedObject.condition` = `{ dirt 0..1, broken, wear?, brokenAt?, fails? }`; `WorldItem.kind` = `meal | dishes | mess`
  (dishes: `portions` = plates, one stack per surface; mess: `recipeId` = puddle | spill | crumbs, `quality` = severity).
- `sim/housekeeping.ts`: dirt per use (`tuning.ts DIRT_PER_USE`), wear and a seeded break chance (`state.rng`,
  quality 1..5 x wear x age), dishes and messes, accidents, home moodlets (Dirty Kitchen, Dirty Bathroom, Messy Floors,
  Things Need Fixing, Fresh and Clean Home). Everything is switched on by the content having the `cleanObject` interaction.
- `sim/housework.ts`: the chore behaviors and the repairperson (a scheduled `custom` event, fee charged once through
  `transact` with an occurrence id). Broken objects refuse every interaction with the reason `Broken` except Clean,
  Repair and Call a Repairperson. A failed repair adds `REPAIR_PITY` to the next attempt, so repairs never soft-lock.
- `sim/chores.ts`: autonomy for chores (neat people clean at low dirt, messy ones only when filthy; dishes and messes build
  pressure with time; essential fixtures - last toilet, shower, stove or fridge - are repaired first; a repairperson is called
  after failures when the household can afford it). Chores wait for urgent needs.
- Skill effects: `content/skillEffects.ts` (shared by the sim and the level texts in `content/skills.ts`).
- Rendering: `render/objectsView.ts` draws a grime decal (dirt >= 0.35), stink lines (>= 0.6), a warning marker with
  spark flicker (electronics/appliances) or a puddle (plumbing) on broken objects, plus dirty plates and floor messes.
  `object.changed` events refresh the overlays.

## Relationships and events (Milestone 5)

Pure code (no three, no DOM), tested in `tests/unit/sim/{relationships,romance,memories,events,socialMenu}.test.ts`,
`tests/unit/persistence/social.test.ts`, `tests/unit/ui/social.test.ts` and the headless playtest
`tests/unit/integration/social.test.ts`.

**Relationship model** (`core/relations.ts` pure rules, `sim/relationships.ts` state changes)
- `Relationship` is directed: friendship, trust, romance (-100..100) and familiarity (0..100). Friendship and trust are separate
  axes: trust gates depth (`SocialDef.requires.minTrust`: deep conversation 10, ask for a favour 25, share a secret 30, close friends 25),
  insults, arguments and betrayal cut it hard (Insult -18, Spill Their Secret -45 and a permanent memory).
- `Relationship.label` (`RelLabel`: stranger, acquaintance, friend, close friend, best friend, rival, enemy, crush, partner, engaged,
  spouse, ex-partner) is derived by `relationshipLabel()` from the values and the shared bond, with hysteresis (entered at a higher value
  than kept, `LABEL_RULES`), and refreshed by every `applyRelDelta`, `setBondStatus` and the daily upkeep. Commitments come from
  the bond only; a crush needs an interested adult. The People tab shows the label with the friendship, trust and romance bars.
- Time (once per game day, `Simulation.dailyRollover`): `decayRelationships` fades friendship (1/day), trust (0.5/day) and romance (1/day)
  after `DECAY_GRACE_DAYS` (3) without contact, never below the floor of the bond (`DECAY_FLOOR`: friend 22, close friend 45, partner
  romance 30...), resentment softens toward 0; housemates do not decay; familiarity never does. `syncBonds` demotes friends who drifted
  apart to acquaintances and turns mutual hostility into `rival` (upgrades always need an accepted interaction).

**Socials** (`content/socials.ts`, 35 of them in four menu sections: Friendly 16, Romantic 8, Mean 4, Special 7)
- New fields: `requires.minTrust/maxTrust/exclusive/private/memory`, `section`, `cost`, `unilateral`, `startsEvent`, `outcome.resolves`.
- `socialRequirementReason` (sim/social.ts) holds the rules and the readable reasons. Romantic socials need both people to be adults
  (`isAdult`), `romance.open`, no family tie and the actor's interest (`romanceInterest`); `socialAcceptance` is 0 unless the target
  is interested in the actor too, and the first refusal for lack of interest sets `Relationship.romanceBlocked` so the options stay off
  (no pestering). Context: the target's mood (`ROMANCE_MIN_MOOD`), exclusivity (`commitmentOf`: partner, engaged, spouse), privacy
  (kiss/propose with more than one onlooker), "not in front of an upset partner". Declines are gentle: no friendship or trust loss, a
  small moodlet (`flustered`/`rebuffed`) and a short-lived `rejected` memory.
- Cheating: a partnered person who gets romantic with someone else within sight of their partner costs them trust, friendship and
  romance with that partner (`JEALOUSY_*`), gives the partner a `jealous` moodlet and a `jealousy` memory and lowers the partner's
  liking for the third person (`witnessCheating`).
- Menu: `Simulation.options` returns socials with `section` and an odds `hint`, sorted Friendly / Romantic / Mean / Special, enabled
  before disabled, then by `socialRelevance` (fit x10 + chance x5; an introduction between strangers, a status step that just became
  possible and making up after a quarrel rank first; saying goodbye last). The phone entries (invite, call, plan an event, ask on a
  date) have `section: 'phone'`.

**Memories** (`sim/relationships.ts addMemory`, `core/relations.ts MEMORY_EFFECTS`)
- Bounded: repeats of the same kind and person are merged (`count`, newest text, newest time); at most `MEMORY_PER_PERSON` (8) below
  importance 3 per other person; `MEMORY_LIMIT` (40) in total, oldest importance 1 then 2 go first; a `MEMORY_HARD_LIMIT` (64) that
  spares permanent milestones. `resolved` memories (an apology, a make-up) stay but stop acting.
- Behaviour: for a duration after the last occurrence a memory shifts the remembering person's acceptance of social categories from the
  person it concerns (`memoryModifier`: argument -0.2 for a day, insult -0.25 for two days, betrayal -0.4 for a week, rejected -0.15 for
  12 hours, great date +0.12...). Autonomy avoids small talk after a quarrel and prefers apologising.

**Events** (`content/events.ts` types, `sim/events.ts` system, `state.homeEvents`)
- Types: `date`, `dinnerParty`, `houseParty`, `celebration` (planned from the phone: `planEvent` / `Simulation.planEvent`) and
  `visit`, `welcomeWagon`, `dropIn`, `reconciliation` (start by themselves when the visitor arrives). One gathering per household at a time.
- Lifecycle: `planEvent` validates (`canPlanEvent`: host adult, guests known and reachable, notice, money, romance interest and the
  guest's consent for a date), records a `HomeEvent` (`invited`), schedules the guests' arrivals (`evarrive:<event>:<guest>`) and
  `eventStart` / `eventEnd` entries; `startEvent` sets out catering on a table (money through `transact`, occurrence
  `event:<id>:food`) and goes `running`; guests stay until the end, then leave politely (a goodbye social, then `leaveLot`); `endEvent`
  scores and rates, pays once and marks `processed['eventdone:<id>']`. Every step is behind a status check or a processed occurrence, so
  save/load, fast-forward and replay cannot apply anything twice. `ensureEventEnds` repairs an edited save.
- Goals (`chat`, `eat`, `romantic`, `laugh`, `mingle`, `reconcile`) are counted from resolved socials (`noteSocial`) and meals
  (`noteEat`). Score = attendance x (70 % weighted goal progress + 30 % guests' mood); rating poor / fair / good / great scales
  friendship, trust, romance, needs, moodlets and memories (`EventDef.reward`). A first good date also records `firstDate`.
- Autonomy during an event: participants get `EVENT_SOCIAL_BONUS` for talking, may eat the catering even when not hungry, and a date
  pair prefers romantic socials. Reconciliation: `dailyReconciliation` sends somebody who recently argued with the household to clear
  the air (visible condition: an unsettled argument/insult memory, at most once a week per pair).
- API: `GameAPI.eventProblem/planEvent/cancelEvent` (optional in dev mocks). UI: `ui/hud/eventPlanner.ts` (phone -> Plan an Event, or
  People tab -> Plan an event), `ui/hud/eventTracker.ts` (goal card on the HUD), pure helpers in `ui/hud/socialModel.ts`.
- Dates happen at home (no lot travel before Milestone 7).

**Saves**: all new fields are optional (`Relationship.label`, `Relationship.romanceBlocked`, `Memory.resolved`, `WorldState.homeEvents`,
`ScheduledEvent.kind` `eventStart`/`eventEnd`). `persistence/schema.ts fillSocialDefaults` drops unknown labels and malformed events;
the schema version stays 1.

## Careers and economy (Milestone 6)

Pure code (no three, no DOM), tested in `tests/unit/sim/{careers,freelance,economy,aspirations}.test.ts`,
`tests/unit/persistence/economy.test.ts` and the headless playtest `tests/unit/integration/economy.test.ts`.
The acceptance run drives the career tab, a bill payment and a freelance sale through the real UI (step 8).

**Content**: seven 10-level careers - culinary, journalism, software, medicine, music, business and landscaping -
each with a title, hourly wage, weekly work days, start/end time, promotion requirements (performance, skill
levels, days worked, sometimes a friendly colleague outside the household) and perks. Ten ready skills cover
them; every career's skills are trained by at least one in-game activity or freelance job. Eight aspirations
include `successful-career` (reach a career level) and `fortune-builder` (household funds), plus the M6 objective
kinds `careerLevel`, `ownObjects` with `bought: true` and `homeValue`. Five `CareerEventDef`s
(`src/content/careerEvents.ts`) are small on-the-job decisions with a performance change, optional pay (positive
or negative) and an optional skill or moodlet effect.

**Careers** (`src/sim/careers.ts`, state in `Person.career: CareerState`)
- `CareerState { careerId, level, performance -100..100, joinedAt, daysWorked, shift, effort, pendingEvent }`.
   `Shift` is `{ occurrence, status: upcoming | commuting | atWork | done | missed, workedMinutes, lateMinutes }`.
- A shift occurrence is `shift:<personId>:<day>`; the person autonomously queues `goToWork`
  `COMMUTE_LEAD_MINUTES` (45) before the start while on the lot, and the player may cancel or start it from the
  phone/computer. Reaching the lot entry goes off-lot; a shift counts once it was already open when the person
  joined. Not arriving by the shift's midpoint is a missed shift (`MISSED_SHIFT_PERFORMANCE` -15 plus a moodlet).
- Pay is `hourlyWage x workedMinutes / 60`, paid once at shift end with occurrence `pay:<personId>:<day>`
  through `transact`; lateness shortens the paid time. The shift also trains the career's skills.
- Performance is added at the start of a shift from mood, traits, relevant skill levels, an energy/fun penalty
  and the chosen effort (`hard` +3, `normal` 0, `slack` -4), and again at the end from completion, lateness,
  effort and skill fit. Hard work costs 8 energy, slacking leaves 4 more.
- Promotion is checked after each shift against the current level's `promotion` (performance, skills, days and
  an optional mutual friendship outside the household); on success the person moves up and performance resets
  to 10. Performance at or below `DEMOTION_PERFORMANCE` (-60) demotes one level (not below 1), checked on
  promotion failure and on a missed shift.
- Player commands: `joinCareer` (level 1, effort normal), `quitCareer` (cancels an upcoming/running shift
  without pay and brings an at-work person home), `setCareerEffort`, `resolveCareerEvent`. A pending career
  event is shown in the Career tab; if unanswered it resolves to its first option at the end of the shift.
  Occurrences `careerevent:<personId>:<day>` / `careereventpay:<personId>:<day>` make the outcome once-only.
- `careerInfo()` gives the UI the title, level, performance, next shift, expected pay and lateness; `shiftText()`
  formats the schedule.

**Freelance income** (`src/sim/behaviors.ts`, behavior `freelance`)
- Interactions: `writeArticle`, `writeBook`, `programGig`, `paintToSell`, `busk`, each training its skill.
  Base fees are 1800 / 9000 / 3200 / 2400 / 600 cents; the fee is
  `max(100, round(base x (0.55 + skillLevel x 0.12)))`, so a better skill pays more. At completion the fee is
  paid once through `transact` with occurrence `freelance:<personId>:<actionId>` and a feed line; an interrupted
  action pays nothing and replay/save cannot pay twice.

**Bills** (`src/sim/economy.ts`, `Bill[]` in `WorldState.bills`)
- One bill per playable household per game week (`billWeek`, 7 days from the start), occurrence
  `bill:<householdId>:<week>`. The amount is property tax (0.25 % of land value plus placed objects and
  openings, minimum $45) plus utilities ($22 base + $5 per electronics + $9 per appliance on the home lot).
  Bills are due after 3 days and go overdue with a 10 % late fee (minimum $5) once (`billlate:<id>`); after two
  more days the utilities are cut off (`billcut:<id>`), `Household.powerOff` is set and a feed warning is posted.
  The bill list is capped at 16, dropping paid old bills first.
- Payment is `payBill` -> `transact(..., -amount, 'bill', ..., { occurrence: 'billpay:<billId>' })`, so the
  charge applies at most once across save/load; paying restores power when no cut-off bill remains. Auto-pay
  (`settings.autoPayBills`, toggled in the Bills panel) pays each bill as it is issued and reports a failure in
  the feed. `powerIsOff`/`needsPower` block electronics and appliances with the reason `Power is off`;
  `updateBills` also repairs a stale `powerOff` flag on load.
- API/UI: `GameAPI.bills/payBill/setAutoPayBills`; `ui/hud/billsPanel.ts` (opened from the funds/ledger panel,
  the phone's "Bills and payments", or the mailbox) shows owed total, due dates, late fees, power state,
  auto-pay and Pay buttons. The Career tab of the person panel (`ui/hud/personPanel.ts`) shows the job, level,
  performance bar, next requirements, schedule, pay, effort segmented control, pending decision, join list and
  Quit. The phone/computer offer job search; the phone and mailbox open bills.

**Aspirations**: stage rewards are paid once through `transact` with occurrence
`aspiration:<personId>:<aspirationId>:<stage>`. `ownObjects` objectives may set `bought: true`, which ignores
objects present in the starter house (`boughtAt` before `START_MINUTE`), so Bookworm no longer counts the
starter bookcases.

**Saves**: all M6 fields are optional additions to schema 1 - `Bill` (with `paidAt`/`cutOffAt`), `WorldState.bills`,
`Household.powerOff`, `settings.autoPayBills`, `CareerState.effort`/`pendingEvent`. `fillEconomyDefaults` in
`persistence/schema.ts` drops malformed bills, unknown efforts, bad pending decisions and non-boolean flags;
old saves load unchanged.
