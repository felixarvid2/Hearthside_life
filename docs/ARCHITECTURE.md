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
| `src/world/`, `src/building/` | world | lots, walls, rooms, navigation, placement, starter lots, build/buy commands, neighbourhood lot records and lazy layouts (`neighbourhood.ts`, `lotBuilders.ts`), venue and home layouts (`venues.ts`, `homes.ts`) |
| `src/sim/` | sim | people, needs, moods, actions, reservations, autonomy, social, relationships, careers, skills, aspirations, economy and bills, visitors, lot travel, the light schedule of other households, household switching and moving (`places.ts`, `townlife.ts`, `lotTravel.ts`, `households.ts`, `neighbourhoodView.ts`) |
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
- Milestone 13 added move, resize and duplicate for whole rectangular rooms (next section). Not done yet: wall height change on existing walls, diagonal walls.

### Venue and home layouts (Milestone 7)

Pure code (no three, no DOM), tested in `tests/unit/world/venueLayouts.test.ts` (layouts) and `tests/unit/integration/venueActivities.test.ts` (activities).

- `src/world/venues.ts`: `buildVenueLot(state, content, lotId, venueType)` for `'park' | 'cafe' | 'gym' | 'library' | 'arts' | 'market'` and
  `buildResidentialLot(state, content, lotId, variant)` (re-exported from `homes.ts`; six homes, variants wrap, `RESIDENTIAL_VARIANTS` lists name,
  bedrooms, beds and how many people they sleep). Both fill an EMPTY lot (throws otherwise) with the starter house's own helpers (`housekit.ts`
  `buildHouse`, `validatePlacement` for every furnishing) and then throw if `lotProblems()` finds anything. Lot sizes: park, arts centre, market
  32 x 32; cafe, gym, library and all homes 24 x 24; entry in the middle of the south edge. A plan is written for that size and centred on a bigger
  lot; a smaller lot is refused; another entry tile works (decor on the entry is dropped, the path starts at the real entry). Park and arts centre
  set `lot.ground = 'grass'`; the park's playground fence is a 1.1 m wall with a gate gap. Builders are deterministic and never draw from `state.rng`.
- `src/world/lotCheck.ts`: `lotProblems(state, content, lotId): string[]` (empty = usable): every door tile and slot approach reachable from the
  entry, every slot usable (never through a wall), interactive slotless objects have a free side, every placement re-validates, wall-hung objects
  keep their wall, and no free tile is sealed off (nobody can be trapped). `lotAscii()` prints a map for debugging layouts.
- `src/world/planKit.ts`: shorthand for plans (`F`, `line`, `openings`, `area`, `outline`), `shiftPlan`, `planOffset`, `applyTints` (per-venue recolours of
  chairs, sofas, awnings; a list of swatches is dealt out in order).
- Venue furniture (original models, `tools/furniture-extra`, `npm run assets` or `node tools/build-extra-furniture.mjs`): `tree-park`, `shrub-round`,
  `fountain-park`, `playground-slide`, `swing-set`, `service-counter` (coffee, pastry, sandwich), `produce-stand` (fruit, groceries), `vending-machine`,
  `study-notes` (study, journal on a desk) and `locker-bank`.
- Venue activities (`content/interactions.ts`, `VENUE`): purchases use the interaction `cost` (one `transact` with occurrence `cost:<actionId>`, charged when
  the action starts); `buyGroceries` gives the `stockedPantry` moodlet, which makes the buyer's own groceries 40% cheaper for three days
  (`sim/cooking.ts` `recipeCost`). `InteractionDef.venues` restricts where an interaction is offered ('home' = any residential lot, else a venue
  type): `goForJog` is for the park, `havePicnic` for the park and homes, `playComputerGames` for homes, `danceSolo` not in the library. Nobody
  sleeps or naps on a public venue (`sim/context.ts` `venueRestriction`, used by menus, checks and autonomy). In a library loud socials (funny, mean)
  are 25% less likely to be accepted (`sim/social.ts`).
- `dev/venues.html` (`npx vite`, open `/dev/venues.html?lot=cafe&view=iso`) renders any lot from above or from the four dollhouse angles with the
  game's own views; `flock /tmp/hearthside-browser.lock node dev/venues-shots.mjs <outDir> [lots] [views]` takes the screenshots.

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
  `setCharacterStyle(assets, style)`. Styles: `mpfb` (the default, "Natural" in Settings: MakeHuman bodies
  `mpfb_f/m.glb`, see below), `detailed` (scanned Meshy bodies `meshy_a/b.glb`, skin recoloured through a
  mask: `meshyBody.ts`, `meshyAtlas.ts`, `meshyBake.ts`, `meshyFit.ts`, `headMap.ts`, `createMeshySkinMaterial`) and `classic`
  (procedural skin). A style that cannot load falls back mpfb -> detailed -> classic. `assets.frames` is the active set;
  `CharacterView.refreshStyle()` rebuilds a person after a switch.
- MPFB style (`mpfbBody.ts`, `createMpfb*Material` in `materials.ts`; GLB contract in `tools/mpfb/README.md`): the GLB is
  meshopt-compressed (the decoder is imported on first use) and has five or six primitives on the shared skeleton (skin, underwear,
  eyes, iris, brows, lashes). The skin primitive is the body: `buildBodyTemplate` runs on it like on a Meshy body, so garments,
  hair (AI and procedural) and accessories build on it, with the `HeadMap` from `extras.mpfbBody.head`. The other primitives are
  shared geometry with their own per-person materials (5-6 draw calls per person, no extra textures per person; the skin tone,
  iris, brow and lash colours and the lips are uniforms). Morphs: the GLB's targets are used by name. `ShapeContext.source`
  (`BodyMorphSource`, bodyShape.ts) makes every generator (garments, hair, accessories) carry the same targets: each vertex takes the
  deltas of the nearest skin vertices of the same body part (`MorphField`), so clothing follows every slider exactly. The creator's
  signed sliders map to up/down target pairs (`MPFB_SLIDERS`, `mpfbInfluences`); face sliders to the signed `face_*` morphs
  (`MPFB_FACE_SLIDERS`); the sliders without a target (arms, legs, neck, male chest, cheekbones, nose bridge, ear size, eye tilt and
  height, brow angle) keep the displacement fields of `bodyShape.ts` / `headShape.ts`. Underwear is hidden per half under garments
  (`createMpfbUnderwearMaterial`). Seated placement uses `POSTURE_ANCHORS.seated.mpfb`. On these bodies outer layers hang at least as loosely as the layers
  under them (`OUTER_DRAPE_MIN` in clothing.ts), because their deeper waist lets a loose top or dress show through a tailored jacket.
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
- **Integrity and recovery (M13).** Every record is `{ meta, data, checksum }` (FNV-1a over the JSON text plus its length) and a
  save is verified (JSON round trip, structure) before it is written, in one transaction. Before a slot (manual or autosave) is
  overwritten, its current record is pushed onto `<slot>#1`..`<slot>#3` (`BACKUPS_PER_SLOT`, `backupKey`) - only when it is itself intact
  (checksum, JSON, migration, structure) and differs from the newest backup, so a damaged or failing save never displaces the last good
  copies. The chain keys are not listed as slots; `remove(slot)` deletes them. `load(slot, content?, { recover? })`
  falls back to the newest good copy when the slot is damaged (`#1`..`#3`, then `backup` for the autosave) and returns
  `recovered: { from, savedAt, message }`; GameCore puts the message first in `loadFrom().report`, which the load dialog and Continue
  show. Storage errors become readable messages (`describeDbError`: quota, unavailable, blocked, aborted); a failed write changes
  nothing. Tests: `tests/unit/persistence/recovery.test.ts`, `tests/unit/integration/recovery.test.ts`.
- **Error boundary (M13).** `src/game/crashGuard.ts` (`CrashGuard`, pure): `Game.step` runs the simulation and the render through
  `guard.run`. A thrown fault is recorded, the simulation halts (no repeated half ticks) and `ui/screens/crash.ts` shows the recovery
  dialog once: Keep playing (`resume`; the same fault within 5 s shows it again as repeated), Reload last autosave
  (`loadFrom('autosave')`, with the fallback above) and Export diagnostic file (`buildDiagnostic`: errors with stacks, browser,
  viewport, mode, speed and the exported world). `window` errors and unhandled rejections feed the same guard (ResizeObserver noise
  is ignored). `hearthside.debug.crash(msg)` raises a test fault.
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

**Careers**: thirteen 10-level tracks - culinary, journalism, software, medicine, music, business, landscaping,
education, visual arts, science, athletics, design and architecture, and hospitality - each with its own schedule,
wage curve and promotion requirements (see below). **Skills**: 19 defined and all `ready`; activities, work and
freelance jobs train them. Milestone 11 adds baking, wellness, creativity, photography, fishing and research
(see "Progression and social scope").

## Simulation flow per tick

1. Advance clock by `TICK_MINUTES`.
2. Process due `state.schedule` entries in time order (each occurrence once).
3. Careers: start commutes for shifts starting within 60 min (autonomy or player `goToWork`), mark missed
   shifts, return people whose shift ended, pay once per completed/partial shift. At most one on-the-job
   decision per shift is offered (answered in the Career tab, defaults to its first option at shift end).
3b. Bills: issue this week's household bill, apply a late fee once past the due date, cut utilities off once
   past the grace period, and repair a stale power flag.
3c. Every 15 minutes, the light world (Milestone 7): pay finished shifts and weekly bills of everybody outside the played
   household; every 30 minutes also move them between home, work and the venues by their daily plan.
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

### Guidance and accessibility (Milestone 13)

- `ui/hud/hintState.ts` (pure): the 11 hints (id, short text, how-to steps), `enqueue` / `pickNext` / `markSeen`. `ui/hud/hints.ts`
  is the card: situations come from `api.onChange` (mode, selection, camera/floors), events (queue, social, bills, careers, map)
  and `sh.hint(id)` calls (person-panel tabs, ledger/bills, map, game menu, creator). It waits while a dialog is open. State
  lives in `GameSettings.hints` (switch) and `GameSettings.seenHints` (ids), stored with the other device settings.
- `screens/help.ts` builds the Help modal from the same catalogue plus the touch and keyboard control tables.
- `GameSettings.textScale` runs 0.9 to 1.5 (`TEXT_SCALE_MIN/MAX`), `highContrast` toggles `html.high-contrast` (token overrides in
  `styles/a11y.css`), `reducedMotion` also follows `prefers-reduced-motion` and adds `.reduced-motion` (kills transitions and animations).
- `kit/focus.ts`: `trapTab`, `currentOpener` / `restoreFocus` (modals and panels return focus to the opener; panels take
  focus when opened from the keyboard) and `rovingGroup` (one Tab stop and arrow keys for tabs, radio groups and swatches).
  World keys (pan, turn, zoom, delete, rotate) do nothing when focus was put on a control with the keyboard (`input.ts`).
- `hud/objectPicker.ts` is the keyboard and screen-reader route to world objects (also reachable from the Queue tab).
- Contrast: tokens in `styles/base.css` are checked against WCAG AA by `tests/unit/ui/contrast.test.ts`; `meter()` adds the words
  Low / Critical and `aria-valuetext`.

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
- Dates and parties may be held at a public venue (social gaps pass, below).

**Weddings (social gaps pass)** (`content/events.ts` `wedding`, `sim/events.ts performCeremony`). A wedding is a planned event with `EventDef.wedding`:
the first guest is the host's fiance(e) (a bond `engaged`, romance 50+ both ways, trust 30+; they may live in the household), up to eight more
guests are invited. `HomeEvent.partnerId`, `ceremonyAt` (start + 30 minutes), `stage` ('ceremony' then 'celebration') and `ceremony`
('done' or 'missed') record it; a `eventStage` schedule entry runs the ceremony once (`wedding:<id>:ceremony`). At the ceremony, when the couple
are together on the lot and still engaged, the bond becomes `spouse` with the outcome of the "Get Married" social (relationship gains, Just
Married moodlet, permanent `married` memories; guests get a `party` memory) and the `ceremony` goal completes; otherwise the vows are
"missed" (a warning in the feed, a lower score) and the celebration still runs. Catering, goals, rating and rewards are the normal event flow.
"Get Married" in the social menu stays as the quick, guest-free path; the planner (phone -> Plan an Event) pre-selects the fiance(e).
`ensureEventEnds` repairs a lost stage entry.

**Events at a venue (social gaps pass)** (`sim/events.ts`, `PlanEventRequest.lotId`). Types with `EventDef.venueOk` (date, dinner party, celebration,
wedding) can be held at a public venue. `canPlanEvent` checks the venue is open for the whole event (`venueSlotProblem`, hours and a notice of
travel time + 10 minutes). The invitation sends no `visitArrive`; instead an `eventTravel` entry at `HomeEvent.departAt` (start - travel - 5)
makes the household set off (`startTrip` with `allowHosting`, retried every 10 minutes until the start) and puts the guests at the venue
(off-lot `visiting`, or on the lot if it is active); `gatherAtVenue` marks guests who are there as arrived (also called from `activateLot`).
`startEvent` calls the event off when the host did not get there. At the end the guests go home (`visitLeave` on the lot, or straight home
off-lot) and a second `eventTravel` ('home') sends the household back. Venue guests are left alone by the light schedule from `departAt`
(`atVenueEvent`). The planner has a "Where?" select (At home / each venue) and only offers start times that fit the opening hours.

**Gifts (social gaps pass)** (`content/gifts.ts`, `sim/gifts.ts`). Eleven gift kinds with a price, the preferences they appeal to, trait fit and the
life stages they suit. "Give a Gift..." in the social menu raises `ui.request` 'giveGift' (`GameCore.queue` intercepts the social without a
chosen gift); the picker (`ui/hud/giftPicker.ts`) lists `api.giftChoices(giver, recipient)` (price, affordability, and a hint of how it would
land once familiarity is 30+) and `api.giveGift` queues the social with `data.gift`. When the social is accepted `resolveSocial` charges the
price (`gift:<actor>:<target>:<minute>`), builds the outcome from the recipient's reaction (`giftReaction`: likes +1 each, dislikes -1 each,
trait fit; loved / liked / fine / disliked scale friendship, trust and, for partners, romance; price is irrelevant) and creates a
`WorldItem` of kind `gift` (`recipeId` = gift id, `ownerPersonId`, `giftFromId`, `ownerHouseholdId`) on a free table of the recipient's home
(else by the front door); at most 8 parcels per lot, put away after 14 days. The renderer draws a wrapped box in the gift's colour.

**Group chat (social gaps pass)** (`groupChat` social, `sim/social.ts groupCircle / resolveGroupChat`). Offered when at least one more person who
the speaker has met is free within six tiles. The circle (at most four more) joins as listeners; one acceptance roll for the speaker and the
person addressed; every ordered pair changes (the speaker's pairs fully, the rest by 0.6), everybody gains social/fun and the moodlet, and
running events count it as one `chat` and every pair toward `mingle` (`noteGroup`). The autonomy weight is 0.7.

**Saves**: all new fields are optional (`Relationship.label`, `Relationship.romanceBlocked`, `Memory.resolved`, `WorldState.homeEvents`,
`ScheduledEvent.kind` `eventStart`/`eventEnd`). `persistence/schema.ts fillSocialDefaults` drops unknown labels and malformed events;
the schema version stays 1.

## Careers and economy (Milestone 6)

Pure code (no three, no DOM), tested in `tests/unit/sim/{careers,freelance,economy,aspirations}.test.ts`,
`tests/unit/persistence/economy.test.ts` and the headless playtest `tests/unit/integration/economy.test.ts`.
The acceptance run drives the career tab, a bill payment and a freelance sale through the real UI (step 8).

**Content**: thirteen 10-level careers - culinary, journalism, software, medicine, music, business, landscaping,
education, visual arts, science, athletics, design and architecture, and hospitality - each with a title, hourly
wage, weekly work days, start/end time, promotion requirements (performance, skill levels, days worked, sometimes
a friendly colleague outside the household) and perks. Nineteen ready skills cover them; every career's skills are
trained by at least one in-game activity or freelance job. Thirteen aspirations include `successful-career`
(reach a career level) and `fortune-builder` (household funds), plus the M6 objective kinds `careerLevel`,
`ownObjects` with `bought: true` and `homeValue`. Seventeen `CareerEventDef`s (`src/content/careerEvents.ts`) are
small on-the-job decisions with a performance change, optional pay (positive or negative) and an optional skill
or moodlet effect.

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

## Progression and social scope (Milestone 11)

Pure code (no three, no DOM), tested in `tests/unit/sim/{careers-m11,m11-skills-b,skillsC-m11,m11-aspirations}.test.ts`,
`tests/unit/content/m11-traits.test.ts` and the headless runs in `tests/unit/integration/{careersM11,m11-skills,skillsC-m11,m11-progression}.test.ts`.
The visual checks drive the real UI (`dev/ds-tasks/m11/shots-*.mjs`). Content minimums for M11: 12 careers,
16 skills, 40 traits, 12 aspirations and 40 social interactions; the tree has 13 careers (130 levels), 19 ready
skills, 40 traits, 13 aspirations (39 stages) and 45 socials.

**Careers**. Six more 10-level tracks use the same `level()` helper and data-driven `careersForStage()` as the M6
seven, so the career panel, job search, creator starting jobs and NPC assignment pick them up without UI changes:
`education` (Playground Assistant -> Superintendent of Schools, weekdays, school holidays off), `visualArts`
(Studio Assistant -> Renowned Artist, Tuesday-Saturday at first), `science` (Lab Assistant -> Nobel Laureate,
weekdays), `athletics` (Gym Attendant -> Olympic Champion, early 06:00 starts), `design` (Drafting Assistant ->
Celebrated Architect, studio weekdays then site days) and `hospitality` (Front Desk Assistant -> Hospitality
Magnate, evenings and weekends). Each trains two or three skills, requires a friendship (25-30) mid-ladder and
asks for the newer skills from level 4-5, so the first rungs stay reachable with practised skills. `careerEvents`
grew from 5 to 17 (two per new track); every option changes performance and some pay, add a moodlet or train a
skill. Shift pay remains `pay:<personId>:<day>` through `transact`; career decisions stay
`careerevent:<personId>:<day>` / `careereventpay:<personId>:<day>`.

**Baking** (`src/sim/baking.ts`, recipes in `src/content/recipes.ts`)
- Activities: `bakeTreat` (Bake a Treat, 30 min, 55 xp/h) at any stove or the new `bread-oven`; `sellBakes`
  (Sell a Box of Bakes, 45 min) is freelance work gated at Baking 5. Five recipes unlock at levels 1/2/3/5/7
  (rustic loaf, berry muffins, buttermilk scones, celebration cake, apple pie) and are served as portions on a
  free counter or table like a cooked meal. A batch also trains Creativity at 35% (`secondarySkill`).
- Object: `bread-oven` ($620, kitchen, 1x1, quality 4, baking stat 2), modelled in `tools/furniture-extra`.
- Effects (`content/skillEffects.ts`): bake quality `0.4 + 0.05 x level`, mishap chance
  `max(0, 0.2 - 0.025 x level)`, bake time `1 - 0.025 x level` (floor 0.78). A dirty oven bakes worse and burns
  more often; the Baking level and the oven's baking stat both raise quality.
- Payouts: ingredients are charged once at `bake:<actionId>`; the sale pays once through
  `transact` with `freelance:<personId>:<actionId>` (base 2600 cents, times the Baking and Creativity curves).

**Wellness**
- Activities: `meditate` (self, any home lot, 30 min, 45 xp/h, Calm moodlet), `doYoga` (mat, 40 min, 60 xp/h) and
  `stretch` (mat, 15 min, 40 xp/h).
- Object: `yoga-mat` ($60, rug layer, 1x2; people walk over it when it is not in use).
- Effects: energy and fun decay `1%` slower per level (`wellnessDecay`), and bad moodlets weigh `3%` less per
  level (`wellnessStress`), capped at level 10. No payout.

**Creativity**
- Activity: `sketchIdeas` in the `sketchbook` (45 min, 55 xp/h; Inspired moodlet). Painting, music, writing,
  busking and baking train Creativity at 35% through the existing `secondarySkill` path.
- Object: `sketchbook` ($70, surface layer, placed on a desk or table).
- Effects: creative activities give `3%` more fun per level (`creativityFun`), creative freelance work pays `4%`
  more per level (`creativityPay`). Creative sales include `paintToSell`, `writeArticle`, `writeBook`, `busk` and
  `sellBakes`; all pay once with `freelance:<personId>:<actionId>`.

**Photography**
- Activities: `takePhotos` at the `camera-tripod` (60 min, 55 xp/h), `photoWalk` at the park, market, arts centre
  or cafe from level 3 (50 min, 55 xp/h), and `sellPhotos` (75 min, freelance) from level 2.
- Object: `camera-tripod` ($320, hobby, 1x1, interaction anchor `shoot`).
- Effects: `photoSaleMult` is x1.25 from level 5 (gallery-grade prints) and x1.5 from level 8.
- Payout: `freelance:<personId>:<actionId>` (base 2400 cents; better Photography and Creativity pay more).

**Fishing** (`src/content/fishing.ts`)
- Activities: `fishPond` (45 min, 55 xp/h) at the `garden-pond-fishing`; `fishVenue` at Lakeside Park from level 2
  (60 min, 60 xp/h); `sellCatch` on a fish item (10 min).
- Object: `garden-pond-fishing` ($650, outdoor, 2x2, front `fish` anchor), modelled as an irregular stone-rimmed
  pond with reeds, lily pads and a flower in `tools/furniture-extra`.
- Effects: six species (roach, perch, bream, brown trout, northern pike, golden carp) unlock at levels 1/1/2/3/5/8;
  a trip lands one fish at levels 1-2, up to two at 3, usually two or three at 5 and three at 9, with a rare fish
  costing one portion. Empty-trip chance falls from 20% to 8% at level 5 and 0 at level 8; the species roll leans
  rarer with level. Portion value gains 5% per level and a further 15% at level 8 (`fishPortionValue`). The catch
  is deterministic from `hashString('fish:<person>:<action>')`, and a fish item can be eaten like a meal portion.
- Payout: `fishsell:<itemId>` pays each caught item once at its value.

**Research**
- Activities: `researchOnline` at a computer (60 min, 55 xp/h), `researchSky` at the `telescope` (60 min, 60 xp/h,
  Inspired moodlet) and `writePaper` at a computer from level 5 (120 min, freelance).
- Object: `telescope` ($480, hobby, 1x1, interaction anchor `observe`).
- Effects: Logic and Programming study gains `2%` per level (`researchStudy`), Science career performance gains
  `0.4` per level (`researchScience`), and published papers (level 8) pay x1.2 (`researchPaperMult`).
- Payout: `freelance:<personId>:<actionId>` (base 4200 cents).

**Traits** (`src/content/traits.ts`). 40 traits in six categories (social 10, tidiness 5, energy 6, creativity 7,
leisure 5, lifestyle 7). Every trait uses at least one existing effect kind (`needDecay`, `autonomyBias`,
`skillRate`, `socialReceive`, `workPerformance`, `enjoys`); `effectText` is generated from the data, so the picker
cannot advertise an effect the simulation does not apply. Conflicts are symmetric (`traitsConflict()` is the one
check used by the picker, `setTraits` and random drafts); the picker shows the category, the count and the first
effect line, and explains a disabled opposite. Random drafts cover all 40.

**Aspirations** (`src/content/aspirations.ts`). 13 aspirations with three stages each (39 stages): the M6 eight
plus `family-ties`, `hopeless-romantic`, `true-artist`, `music-star` and `tech-pioneer`. All objectives reuse
existing types (`skill`, `interactionCount`, `friends`, `ownObjects`, `homeValue`, `bond`) and rewards use the
`milestoneReached` / `dreamFulfilled` moodlets. Stage pay is once-only via
`aspiration:<personId>:<aspirationId>:<stage>`. Aspirations are adult-only and enforced at every entry point
(creator `setAspiration`/`memberIssues`, `setLifeStage`, random drafts in `characters/names.ts` and
`sim/people.ts`, which strips one from an imported child draft).

**Saves**: M11 adds no save fields. Fish use the existing item path (`WorldItemKind` gains `'fish'`, schema default
only), baked batches reuse meal portions, and every payment uses a ledger occurrence id; `SCHEMA_VERSION` stays 1.

## Neighbourhood (Milestone 7)

Pure code (no three, no DOM), tested in `tests/unit/world/neighbourhood.test.ts`, `tests/unit/sim/townlife.test.ts`,
`tests/unit/persistence/neighbourhood.test.ts` and the headless playtests `tests/unit/integration/{neighbourhood,travel,venues}.test.ts`.
The API for the interface (map, travel, switching) is documented at the top of `src/game/api.ts`.

**One active lot.** Only the active lot (`state.activeLotId`) is simulated in detail: only people on it have `location.kind === 'lot'`,
walk, queue actions and are ticked by `runPerson`. Every other lot is plain data in `state.lots` and every other person has an off-lot
location (`home`, `work`, `visiting` a lot, or `transit`). A lot's state *is* the world state, so leaving a lot "saves" it and entering it
"loads" it with nothing to copy: a round trip leaves both lots byte-identical (the only things that change are the people on them).

**Lot records** (`world/neighbourhood.ts LOT_SPECS`, `createNeighbourhoodLots`): a new world has 15 lots: the player's home and the house next
door (built at once, as before) plus thirteen generated records with `built: false` - seven public venues (`park` Lakeside Park 32x32, `cafe`
Kettle & Crumb, `gym` Foundry Fitness, `library` Pagebridge Library, `arts` Lantern Hall 32x32, `market` Greengage Market 32x32, `pool` Quayside
Baths 32x32), four homes of
named NPC households (two rented, two owned) and two empty homes (Marigold Flat for rent, Hazelbank House for sale). Optional `Lot` fields:
`built`, `variant`, `blurb`, `map` {x,y} (0..100, for the map UI), `rent` (weekly; a lot with `rent` and no owner is a rental), `price`.
`VENUES` holds opening hours and the capacity of each venue type; `travelMinutes` is 20-40 minutes by map distance.

**Lazy layouts** (`world/lotBuilders.ts`): a generated lot is laid out exactly once, by `ensureLotBuilt`, the first time somebody travels there
(`startTrip`) or the household switches to it. It calls `buildVenueLot` / `buildResidentialLot` from `world/venues.ts` (STUB_BUILDERS / `setLotBuilders`
replace them in tests); a builder that throws leaves the lot untouched and the trip is refused with a readable reason. The result is ordinary lot
data that is saved with the world. Builders must be deterministic and never draw from the world rng.

**NPC households** (`game/neighbourhood.ts generateNeighbourhood`, called by `createNewWorld`): four named households of one or two adults with
shared or different surnames, seeded names, three traits, aspiration, likes, appearance and wardrobe from `randomPersonDraft`, at least one job per
household, ties between members, relationships between the households (friends, acquaintances, a rivalry) and starting funds as a `start` ledger
entry, so every household ledger adds up to its funds. They live off-lot at home. Names come from a generator seeded by the world seed and the world
rng is put back afterwards, so generating the neighbourhood does not change the world's random future. `state.neighbourhood` records that it happened;
`ensureNeighbourhood` (run by `GameCore.replaceState`, i.e. on every load and import) generates the same neighbourhood around an old save
(household, lot and next-door neighbours untouched) and does nothing when the marker exists. A person's job, traits, looks and relationships are
never regenerated; lot changes only move people between locations. `fillNeighbourhoodDefaults` (persistence) repairs malformed optional fields and
mends, never drops, a damaged marker.

**Trips** (`sim/lotTravel.ts`): `travel(personIds, lotId)` ("Go to <venue>", "Visit <household>") and `goHome`. `travelProblem` checks: the people
belong to the played household, are not at work/at school/already travelling, no other trip is under way, the household is not hosting a planned
event (ambient visits do not count), and a venue is open when they would arrive. Each traveller on the lot walks to the lot entry (`travelTo`
action) and is "in transit" (`location.transit`, `lotId` = destination, `until` = arrival); people left at home go at once. One `travelArrive` entry
(occurrence `travel:<first traveller>:<minute>`) is scheduled 20-40 minutes later. Travel costs nothing. At arrival `activateLot` makes the destination
the active lot: everybody on the old lot who is not travelling goes off-lot (household members: at home; townies: where the plan has them, a venue's
patrons stay "at the venue"), the light schedule is brought up to date, people already there (residents at home, patrons at a venue) are placed on
indoor/open tiles, and the travellers appear at the lot entry. Events: `lot.activated`, `travel`. Household members left behind are "at home" off-lot
and follow the light schedule; `goHome` brings them back. A person in transit without a trip (a damaged save) is sent home by the hourly
`reconcileStrays`, which also takes anybody stray off non-active lots.

**Work from any lot**: `updateCareers` queues `goToWork` wherever the person is; `startShift` remembers the lot they left from in `location.lotId`.
When the shift ends (`returnHome`) the worker returns to the household's current lot, or home if they set out from home while the household was
elsewhere (also for people left at home, who leave for work from there without walking). Pay and counting use the same occurrences as ever
(`shift:<id>:<day>`, `pay:<id>:<day>`).

**The light schedule** (`sim/townlife.ts`): for everybody outside the played household, `plannedPlace(state, content, person, now)` is a pure function of
job, traits, likes and the clock: at work during a shift (20 minutes early), at home from 22:30 to 07:00, and in free time each 90-minute slot either
home or at one of the open venues (weights from traits such as athletic/bookish/music-lover and likes; at most `VENUES[type].capacity` people per
venue, the rest stay home). Every 30 minutes `syncPresence` moves people to where the plan says: off-lot by just changing `location` (so "who is at the
park" is always readable from the state and survives saving), on the active lot by walking in from the entry or out through `leaveLot`. Guests,
people in a conversation or an event are left alone (`engagement`); somebody about to be visited may only leave a venue for home. Every 15 minutes:
`lightCareers` pays a finished shift once (`pay:<person>:<day>`, marks `shift:<person>:<day>`), `lightBills` pays the weekly bill of each household not
played once (`bill:<hh>:<week>` marks the week, charge `billpay:npc:<hh>:<week>`), only when the household can afford it (no debt, no fee, no cut-off, no
Bill record) and pays any bill left open from when it was played; `lightSocial` lets townies at the same inactive venue slowly get to know each other
(friendship capped at 35). Needs of people off-lot at home or visiting drift to comfortable values (`decayNeeds`); relationship decay (M5) is global.
No pathfinding happens off the active lot.

**Venues on the active lot**: patrons are not "visitors" (`isVisitor` is false on a venue): they may use anything the venue offers, with their own
household's money; chores are not done by townies; venue electronics do not depend on anybody's power bill. The played household's own autonomy
setting governs its members on every lot (as guests or patrons they wait for orders when it is off). The menu of a person away from their home offers
"Invite X to My Home" (`inviteHome`): X says yes when they know you (`INVITE_MIN_FAMILIARITY` 8) and like you (`INVITE_MIN_FRIENDSHIP` 10, trust not
negative) - a visible rule, no dice - heads off, and a `visitArrive` (data.lotId = your home) is scheduled about an hour later; `arrive` waits (up to
4 hours) until the household is home, so the visit never lands on a venue. The phone lists the people next door and everybody the caller has met; the
townspeople are strangers until the first hello.

**Household switching** (`sim/households.ts`): `switchPreview(householdId)` returns `consequences[]` (who you will play, that the previous
household is simulated lightly - plan, jobs paid once, bills paid automatically from its own funds - that each household keeps its own money and
history, that nothing is rerolled) or the reason it cannot be done (a trip under way, a planned event, no home, no adult). `switchHousehold` makes the
previous household NPC (`isPlayable` false, members `isNpc`, off-lot at home, orders dropped), the new one playable (exactly one household is ever
`isPlayable`), calls its members who are out in town home (shifts that are running stay running and keep their worked minutes), and activates its home
lot. Occurrence ids are shared with the played flow, so nothing is paid twice by switching; every ledger stays `sum(entries) === funds`.

**Moving house**: `movePreview(lotId)` / `moveHousehold(lotId)` move the played household into an empty home that is for rent (first week paid up
front, the rent replaces the property tax in the weekly bill: `BillBreakdown.rent`) or for sale (the asking price). An owned home that is left sells
for 80 % of its value (`SALE_RATE`; the furniture stays) and becomes available again; a rental is handed back. Money moves through `transact` with
`move:<household>:<n>:cost|sale` occurrences. Members who are out travel to the new home like any trip.

**Community events (social gaps pass)** (`content/communityEvents.ts`, `sim/community.ts`). Seven weekly happenings (book club, quiz night, open mic, makers'
market, dance night, Sunday picnic, family splash) on a weekday and start time inside the venue's opening hours (checked by the content
validator). The calendar is a pure function of the clock (`communityEventsBetween`), so nothing is stored but once-only marks:
the daily rollover announces each event in the feed (`commann:<key>`); every 15 minutes a household member on the venue lot while it runs is
marked as attending (`commatt:<key>:<person>`) and after `attendMinutes` gets fun/social, the Party Glow moodlet and a memory once
(`commdone`), and meets the townspeople there (`commmeet`, familiarity and friendship). The townspeople turn out: a slot that overlaps an event
raises their chance to go out and the event venue's weight, and its capacity grows by four (`plannedPlace`, `plansAt`). `NeighbourhoodInfo.events`
lists the next week; the map shows "What's on this week" and, in a venue's sheet, "On at this venue".

**Town life (social gaps pass)** (`sim/townChange.ts`, setting `townLife`, default on). From the daily rollover, with the world generator: once a day
one adult outside the played household who is at home with no shift pending may be hired, switch career (back to level 1) or quit (never the
last earner of a household); once a week (Thursday) one NPC household of the generated town (not the next-door neighbours, nobody on the
active lot, at work or travelling) may move to an empty home it can afford with a cushion: rent deposit or price through `transact`
(`townmove:<household>:<day>:cost|sale`), an owned old home is sold at 80 % and listed again, members' home locations follow. The player sees
it in the feed only for people they know.

**Furniture when moving (social gaps pass)** (`sim/households.ts MoveOptions`). `movePreview(lotId, { furniture })` and `moveHousehold(lotId, { furniture })`:
'leave' (default, as before: the pieces stay and are part of the sale), 'take' (the household's movable pieces go into `Household.inventory`,
supports cleared, and the house sells without them), 'sell' (each piece at its sale value, one `:furniture` transaction). Stairs and planted beds always
stay. The map's move dialog has the three choices and re-reads the preview when the choice changes.

**Phone map and usable (social gaps pass)**. The phone's Neighbourhood Map (`phoneMap`, behaviour `openMap`) raises `ui.request` 'map'. `LotInfo.usable` is true
for a lot that has not been laid out yet (every layout has things to do) and for a built venue with objects (`lotUsable`).

**Saves**: every M7 field is optional in schema 1 (`Lot.built/variant/blurb/map/rent/price`, `PersonLocation.transit`, `ScheduledEvent.kind
'travelArrive'`, `WorldState.neighbourhood`). Old saves load unchanged and are completed on load.

**Interface** (`ui/hud/neighbourhoodModel.ts` pure, tested in `tests/unit/ui/neighbourhoodModel.test.ts`; `neighbourhoodPanel.ts`, `awayCard.ts`,
`styles/neighbourhood.css`): the HUD Map button (top bar in landscape, bottom bar in portrait; live mode only) opens a modal with the street as pins
positioned from `LotInfo.map` (or a list of the same lots; the choice is per opening), the trip under way, and a detail sheet of the chosen lot (beside
the map on wide screens, over it on narrow ones). The sheet shows the marks (active lot, home), open/closed and hours, tenure and rent/price, travel
minutes, who is there, and the actions: "Go here" with a toggle per household member (the selected person ticked; members at work, at school or in transit
are disabled with the reason), "Go home" for the home lot (the header button sends everybody who is out), "Move here" for empty homes (movePreview lines
and cost in a confirmation), "Play this household" for NPC homes (switchPreview consequences in a confirmation). A disabled action shows
`travelProblem()` / the preview's reason under it. While a trip is under way a chip in the HUD (bottom left, above the bar) names the destination and the
arrival time and opens the map; it reads `activeTrip` from the world, so it needs no extra call. Tapping a household member who is not on the lot selects
them without moving the camera and opens a small card ("At Lakeside Park", "Go to ...", "Details"); the strip badge icon follows the kind of place. The
map redraws on UiChange 'lot', 'neighbourhood', 'state' and 'selection' only when the data changed. The mock game (`ui/dev/mockGame.ts`) schedules a
`travelArrive` entry, so the chip and the map work on `dev/ui.html`. Acceptance step 9 drives all of it in the three viewports.

**Not done / remaining** (see also docs/CONTINUATION.md): venue activities that charge
money are the venue content's job (`InteractionDef.cost` is charged to the actor's household; there is no market stock or cafe menu system);
renting out the player's home, tenants and landlords are not modelled;
travel has no taxi fee; only one trip at a time; group travel always switches the active lot (a split household cannot be watched on two lots).


## Floors (Milestone 9, M9-core)

Levels 0-2 on every lot; `LEVEL_HEIGHT` is 3.0 m and level L is drawn at y = L x 3. Walls are 2.8 m, so the 0.2 m between a wall top and the next
level is the slab. `Lot.levels` only counts the floors in use (`world/levels.ts syncLevels`, called by every build command); `hasLevel` accepts 0-2.

**Rules** (`world/levels.ts levelProblems`, enforced by `structure.ts validateDiff`, `plans.ts planFloorPaint` and `placement.ts`; a build may not add a problem):
a floor tile on level L >= 1 needs a standard-height wall of level L-1 on one of its edges, or a floored tile inside an enclosed room of level L-1 below it;
a tile with no room below is a balcony and must lie within 2 tiles (Chebyshev) of such a tile; a wall of level L >= 1 needs floor on one side; furniture
needs floor under its footprint; no floor in a stairwell; a tall (3.6 m) wall may not stand under an upper floor. A balcony edge without a fence or wall is
only a warning (`balconyWarnings`, `BuildPlan.warnings`, `BuildPreview.warnings`). Nobody is left standing on a floor that is erased.

**Stairs**: an `ObjectDef` with `stair: { length, kind }` (content/types.ts). Straight: footprint w x length, rising toward the back (-z at rot 0), `foot`
tile in front of the front row, `head` tile on level + 1 behind the back row, one link per column. Spiral: 2 x 2, front-left to back-right (length 3) or
back-left (length 4). `world/levels.ts stairGeometry/stairLinks` give the links; placing a stair cuts the floor above its footprint (`buyObject`,
`moveObject`, `placeFromInventory` record and restore the cut tiles); floors painted later skip the stairwell. A stair cannot be sold, stored or moved while
someone is on it or would be left without a way to the entry (`structure.ts stairChangeReason`). Models are built at runtime: asset ids `proc:...`
(`render/stairModel.ts`, `registerProceduralModel` for more designs), recoloured by the finish regions `wood` and `rail` of the object.

**Navigation**: grids per level (`navgrid.ts`: above the ground only floored tiles are walkable; fences are walls, gates are doors), one graph across
levels in `world/levelNav.ts`. `NavProvider.findPath(lotId, level, from, goals)` takes goals on other levels (`Tile.level`) and returns nodes that carry
`level` (and `rise`, metres above that level's floor, on stair cells) whenever the path leaves `level`; a path that stays on one level is exactly as before.
Slots of objects above the ground carry `level` and an approach tile with `level`.

**Walking** (`sim/stairs.ts`, `sim/movement.ts`): route waypoints may carry `level` and `rise`; height eases toward the next waypoint, the stride costs
1.6 x (`STAIR_SLOWDOWN`), `location.level` flips at the top (going down: at the first stair cell) and `location.rise` is set only on the stair. People do
not stop on a stair (`settleOnStairs` finishes an interrupted crossing); when the floor under someone is taken away they end up on the floor below
(`unstick`). On lots with a staircase `sim/context.ts lotObjects` offers the furniture of every floor to autonomy.

**lotCheck** checks every level: doors, slots, sealed pockets, with the staircases as the way up (`structure.ts levelReach`), plus `levelProblems`.

**Rendering and camera**: `LotView` builds floors, walls and openings per level into groups at y = level x 3 (upper slabs are 0.2 m thick with a ceiling
underneath); levels above the active one are hidden, cutaway applies to the active level only. `GameView.setActiveLevel` also drives objects, people
(`PeopleView.setActiveLevel`, heights from `location.level + rise`), the build grid and `CameraRig.setLevelHeight` (the ground plane for panning and picking).
Picks report the active level. The API: `view.level() / setLevel() / levels()`; the HUD selector is `ui/hud/levelSelector.ts`; Build has a Stairs tab
(`ui/build/stairTools.ts`, build tools `stairs` and `eraseStairs`). Following or selecting a person on another floor switches the floor.

**Saves**: nothing new is required (schema 1); `PersonLocation.rise`, `ActionInstance.route[].level/rise` are optional and `fillFloorsDefaults` keeps
`lot.levels` equal to the floors in use. **Starter content**: Hazelbank House (for sale) has a loft above its whole ground floor, reached by a straight stair.

## Family and life stages (Milestone 8, M8-sim)

Files: `core/lifeStages.ts` (stage order, lengths, predicates), `sim/aging.ts`, `family.ts`, `familyView.ts`, `school.ts`, `care.ts`, `adoption.ts`, `split.ts`, `socialEffects.ts`, `gating.ts`; content `school.ts`, `family.ts`; UI `ui/hud/personPanel.ts` (Family tab, School tab), `familyDialogs.ts`, `familyModel.ts`, `ui/screens/settings.ts` (aging).

- **Aging.** `SimSettings.aging` is off, long (2.5 x), normal (baby 3, toddler 5, child 10, teen 10, young adult 14, adult 20, elder 14 game days) or custom (`agingDays`, 1..120). `Person.stageDays` advances in the daily rollover (`dailyAging`). A birthday (`ageUp`) is once only per person and stage (`birthday:<pid>:<stage>`): event `birthday`, a memory, the Birthday moodlet, a `family` feed entry (toast), and `migrateStage` (school record, job dropped for children and teens, wardrobe, three traits + aspiration for a new young adult, posture). The "Age up now" birthday (`ageUpNow` at a cake, `careBirthday` for little ones) is the same code with a one-per-day cooldown (`cooldowns['@birthday']`). Elders stay elders unless `elderEndOfLife`: then `passAway` removes them cleanly (`removePerson`), except the last member of the household you run or the last grown-up of children.
- **Family graph.** `Person.parentIds` (at most two) is the only stored fact; `sim/family.ts` derives children, siblings (shared parent or a sibling bond), grandparents, aunts and uncles, nieces and nephews and cousins, and `linkParent`/`setFamilyTie` keep `Bond.familyAtoB` in step. `applyHouseholdTies` sets `parentIds` from creator ties. The Family tab draws `ui/creator/familyTree.ts` from `treeModel`.
- **School.** `school:<pid>:<day>` follows the careers pattern (commute lead, `goToSchool` -> off-lot place 'school' -> home). Weekdays 08:00-14:00 (elementary, children) and 08:00-15:00 (high, teens); week 5 of every 5 is a holiday. Not leaving by 09:30 is a missed day. `SchoolState.performance` (-100..100): attendance +3, homework +5 (+2 helped), missed day -5, missed homework -3, low mood at the start -1.5. Homework is once per school day (`homework:<pid>:<day>`) at any desk, table or computer (tag capability `doHomework`); weekly report cards `report:<pid>:<week>`. Other households use `townlife.lightSchool` (no walking).
- **Carrying and the sitter (social gaps pass).** `Person.carriedBy` is set by the care behaviour while a caregiver holds a baby and cleared when the
  baby is put down (`settleDependents` drops a stale mark); the renderer cradles the baby in that person's arms from it (no proximity guess). The
  emergency sitter also serves babies and toddlers of households the player is not playing while they are on the lot being simulated (a visit),
  charging that household only what it has; off the lot the neglect timer is dropped (their family looks after them, needs drift to comfortable).
- **Town children for old saves (social gaps pass).** `ensureTownChildren` (game/neighbourhood.ts, run by `GameCore.replaceState` after
  `ensureNeighbourhood`) gives the family-type town homes their children once (`NeighbourhoodState.townChildren`), from a generator seeded by the
  world seed; existing ids, jobs and relationships stay, the new people take fresh ids and the world rng is put back.
- **Jogging (social gaps pass).** Go for a Jog (`jogLoop`, `sim/jog.ts`) runs laps of the park track: a stage per corner (`parkTrack(lot)`) walked at
  `JOG_PACE` with the jog gait (`ActionInstance.data.moveAnim` / `pace` in `routeTick`); needs and Fitness xp are applied per leg for the minutes run;
  it ends at the first corner after 40 minutes or when the energy is gone. A park without the plan jogs in place.
- **Care.** Babies lie in cribs or bassinets (`settleBaby`), never act and are carried by a caregiver during Feed, Change Diaper, Cuddle and Play. Toddlers act within the interactions that list `toddler` in `ages`. `careWishes` lets caregivers notice needs by themselves. A need at zero for 3 hours calls the emergency sitter (`sitter:<pid>:<day>:<n>`, $25 through `transact`, debt allowed).
- **Gating.** `InteractionDef.ages` (absent = default by behaviour, `sim/gating.ts`), `SocialDef.requires.actorStages/targetStages`; checked by `requestReason`, `socialRequirementReason`, the menus and `candidatesFor`.
- **Adoption / moving.** `adopt` (`adopt:<hh>:<n>`) and `splitHousehold` (`split:<hh>:<n>:out|in|cost`) charge through `transact`; "Ask to move in" (`moveInNpc`) joins an NPC and their dependents to your household.
- **Saves.** Schema stays 1. `fillFamilyDefaults` (persistence/schema.ts) repairs the optional fields; old saves load with aging off.

## Exterior: roofs, fences, terrain, garden, staircase designs (Milestone 9, M9-ext)

Files: `content/exterior.ts` (fence and gate designs, roof styles and finishes, terrain paints, crops, the four gardening interactions; exposed as `ContentDB.exterior`),
`content/exteriorObjects.ts` (16 garden objects and 12 staircases as ObjectDefs; model bounds in the generated `content/exteriorModels.ts`),
`world/{fences,fencePieces,roofs,terrain,gardenGrowth,gardenLayout}.ts` (pure rules and geometry), `building/exterior{Plans,Commands}.ts`, `sim/garden.ts`,
`render/{exteriorView,fenceView,roofView,terrainView,gardenView,exteriorTextures}.ts`, `ui/build/exterior{Tools,Thumbs,Hints}.ts`, models in `tools/exterior/`
(`node tools/build-exterior.mjs` writes the GLBs, thumbnails, manifest entries flagged `exterior` and `content/exteriorModels.ts`).

- **Fences and gates** (`Lot.fences`, keyed by `edgeKey`, any level). A design is a list of square rods in the edge frame (`fencePieces`); 24 fences, 12 gates (`gate-` ids,
  `isGateDef`), colour variants by index. Nav reads `fenceEdgeState` ('wall' blocks, 'gate' passes like a door). A run keeps identical fences and every gate on its way, swaps
  other designs (new price charged, old refunded). A drag builds one straight run, both legs of an L (dominant direction first), or with Shift (desktop) / the panel's Rectangle
  toggle the four sides of a rectangle loop; the whole path is one request, one plan, one transact and one undo step, so the safety check applies to the complete set. Safety: no wall on
  the edge, floor beside it upstairs, nobody shut in (`strandedPerson`) and no floored tile cut off the lot entry (a gate is a passage). `FenceView` merges everything per level into one
  vertex-coloured mesh (glass separate and translucent).
- **Roofs** (`Lot.roofs`, a rectangle on a level). `buildRoofMesh(style, w, d, ridge, pitch)` returns slope, gable, trim and glass triangles (12 styles: gable, hip, flat, shed,
  mansard, gambrel, pyramid, dutch-gable, saltbox, butterfly, clerestory, a-frame), eaves 0.45 m, gables closed by triangles in the colour of the wall below. 11 finishes with
  34 colour palettes (`Roof.finish = { designId: finish, paletteId }`), procedural textures. Price = area x (style + finish) per m2. `autoRoofRects` covers every enclosed room that
  has no floor above it; the auto roof replaces roofs it overlaps. A roof needs support (floor or walls), no floor above, no overlap. Drawn only when roofs are on, the walls are
  up (or a roof tool is open) and the active level is at or above the roof's level (`RoofView.visibleFor`); the HUD Roof button and `view.setRoofsVisible` toggle them.
- **Terrain** (`Lot.terrain`, tile key -> paint id on level 0, open ground only). 12 paints; the lot's own ground (`lot.ground`) is the default and painting it back removes the
  entry. `TerrainView` draws one atlas-textured quad layer, `EnvironmentView` draws `lot.ground` dirt and paving.
- **Build tools.** `BuildTool` kinds `fence`, `eraseFence`, `roof`, `eraseRoof`, `terrain` resolve to an `ExteriorRequest` (`game/core/build.ts`), previewed with `planExterior`
  and applied as `exteriorCommand` (one transact, undo/redo, `lot.changed` what 'fences' | 'roofs' | 'terrain'). The Build panel has Roof, Fence and Garden tabs.
- **Garden.** `PlacedObject.garden` (crop, growth, need, water, weeds, day, harvests) on the vegetable patch, orchard tree and herb planter. `advanceGardens` runs from the daily rollover
  (deterministic: a watered bed grows a day per day, a dry one a third, a weedy one half; nothing dies). Plant ($3 seeds), Water, Weed and Harvest are the 'garden' behaviour in
  `sim/garden.ts`; a harvest sells the produce for 75 % of its market value, once (`harvest:<object>:<count>`). `GardenView` draws the crops by growth stage.
- **Staircases.** 8 straight (1 or 2 wide, 3 or 4 long) and 4 spiral designs, `ObjectDef.stair`, category 'stairs', models rising toward -z with one tread per walked cell
  (`tools/exterior/stairs.mjs`).
- **Saves.** Schema 1; `fillExteriorDefaults` drops malformed records, `checkExterior` / `checkGarden` validate the rest.

## Seasons and weather (Milestone 12, tasks W and O)

Files: `core/season.ts` (season maths and settings defaults), `sim/weather.ts` (planning, the interaction gate,
outdoors, `snowLies`, moodlets, HUD and forecast text), `render/lighting.ts`, `environment.ts`, `terrainView.ts` and
`weatherView.ts` (seasonal light, grass, trees, terrain and capped rain/snow), `content/interactions.ts` (weather
rules and the outdoor activities), `content/preferences.ts`, `moodlets.ts` and `traits.ts` (weather preferences,
moodlets and biases), `ui/hud/hud.ts` (the clock chip) and `ui/screens/settings.ts` (Seasons, Weather, season length,
Weather effects). Pure code except the render and UI files; tested in `tests/unit/core/season.test.ts`,
`tests/unit/sim/weather.test.ts`, `tests/unit/sim/outdoor.test.ts` and the headless runs
`tests/unit/integration/{outdoor-playtest,weather}.test.ts`.

**Seasons.** `seasonForDay(day)` (and `seasonFor(minutes)`) is `floor(day / seasonDays) mod 4` with day 0 = spring and
`seasonDays` 7 by default (3 and 14 in Settings); `SimSettings.seasons: false` always reads as spring, which the
weather table treats as never-snow. `dayWithinSeason` is 1-based for the HUD ("Autumn, day 1"). Seasons switch at
midnight of the absolute day, so a season change is just another daily rollover.

**Weather plan.** `ensureWeather` (called every tick from the simulation) stores `WorldState.weather`:
`{ current, today: [morning, afternoon], tomorrow: [...], day, since, snowCover? }`. Each half-day (00:00-11:59 and
12:00-23:59) is picked deterministically from `hash32(seed, day, half, season)`, never from the world RNG, using
per-season weights (winter is the only season with snow). A stored plan for the same day is kept, so a reload never
rerolls weather; a new day re-plans. `current` is `today[half]`; `since` is the game minute the half began.
`snowCover` is set while it snows in winter, kept after the snow stops, and dropped when the season leaves winter or
seasons/weather are off. `weather: false` makes every half-day clear and `weatherHudLabel` reads "Weather off".

**Gates.** `InteractionDef.weather` and `SocialDef.weather` accept `{ not?, only?, seasons? }`; `weatherGateReason`
turns them into a reason ("It is raining.", "Only available in winter."). Task O extended the same rule with
`outdoor`, `sheltered`, `night`, `day`, `snowCover` and `rainedRecently`, composed by `outdoorGateReason` (night is
21:00-05:59; snow lies when `weather.snowCover` is set and the season is still winter; rain counts as recent through
the first three hours of a rainy afternoon). `requestReason` adds the reason after the age gate, so an option stays
listed but greyed, and `candidatesFor` / `socialCandidate` filter the same way, so autonomy never starts a blocked
interaction. `nearestOutdoorTile` (the walk-outside precondition) computes the room map, room index and roofs once
per call - the per-tile version was quadratic and made autonomy expensive.

**Outdoor life (task O).** `buildSnowman`, `makeSnowAngel`, `flyKite`, `rakeLeaves`, `jumpInPuddles` (children and
teens), `stargaze`, `watchRain` (under a roof), `sunbathe` and the extended `havePicnic`, plus the `snowballFight` and
`sharePicnic` socials. The gate table is in `dev/ds-tasks/m12/O-progress.md`. The snowman is an ordinary
`PlacedObject` with an additive `snowman` state (`madeAt`, `warmDays`, `lastWarmDay`), removed by an hourly check
when winter ends or after three snow-free winter days; the kite, sun lounger and picnic blanket are procedural
`proc:` models in `render/outdoorModels.ts`.

**Rendering.** `Lighting.update(hour, weather, season)` tints sky, sun, hemisphere, background and exposure; the
environment rebuilds seasonal grass, trees and shrubs plus snow cover when `snowLies`; `TerrainView.setSeason` tints
the painted ground; `WeatherView` is one capped `THREE.Points` mesh (1500 desktop / 600 touch) of rain streaks or
snowflakes that follows the camera and is hidden for clear/cloudy, with Weather effects off, or with reduced motion
(the light tint stays). Interior cutaways keep the existing lighting.

**UI and saves.** The HUD `.clock-sky` shows "Season, day N - Weather" in its text, title and aria-label, refreshed on
a 250 ms timer (skipped while the page is hidden or off the game route); the feed has a two-day forecast line; the
settings screen has Seasons, Weather, season length and Weather effects. All new fields are optional additions to
schema 1: `WorldState.weather`, `SimSettings.seasons/seasonDays/weather` and `GameSettings.weatherEffects`;
`fillWeatherDefaults` repairs malformed plans and drops them without rerolling a valid one.

**Milestone 13 additions.** Shade counts as shelter (`ObjectDef.shelter`, `shadedAt`, `isSheltered`; see "Furnishings that work").
Rain melts snow: `WeatherState.melt` (optional) collects the minutes of rain that fall on a settled `snowCover` (`meltSnowCover`, called
once per tick after `ensureWeather`); at `RAIN_MELT_MINUTES` (180, one rainy half-day) the cover is gone and does not come back that
day; snowfall resets the counter, a midnight re-plan keeps it, and a rainy day counts as two warm days for a snowman. The forecast
(`forecastDays`, `forecastLines`, `FORECAST_DAYS` = 5) is pure: today and tomorrow are the stored plan, later days come from the same
`planFor(seed, day, half, season)` the daily re-plan uses, so a day's forecast never changes and equals what the plan stores when the
day arrives; the feed panel lists the five days ("Today", "Tomorrow", then weekday names). Tests: `tests/unit/sim/weather-m13.test.ts`.

**Debug.** `window.hearthside.debug.setWeather(kind)` pins the current day's stored plan (current, today, tomorrow,
day/since) and keeps settled `snowCover`, so acceptance steps are independent of the world seed; `ensureWeather`
keeps a same-day plan, so it lasts until midnight.

## Pools (Milestone 12, tasks P and F)

Files: `core/types.ts` (`Pool`, `PoolLadder`, `Lot.pools`), `content/exterior.ts` (`PoolStyleDef`; three styles:
azure mosaic, lagoon tile, terracotta tile), `building/poolPlans.ts` (pure plan, preview, ladder and diff rules),
`building/poolCommands.ts` (undoable `buildPool`, `removePool`, `movePoolLadder`, `addPoolLadder`,
`removePoolLadder`), `world/pools.ts` (tile queries), `world/navgrid.ts` (water blocked), `sim/pool.ts` (the swim
lifecycle), `render/poolView.ts` (basin, coping, shader water, ladder) and the Pool tab in the Build panel. Tested in
`tests/unit/building/poolPlans.test.ts`, `world/poolNav.test.ts`, `sim/poolLifecycle.test.ts`,
`integration/poolPlaytest.test.ts` and the `swim-probe` regression test; the visual check is
`dev/ds-tasks/m12/p-shots.mjs`.

**Shape and build rules.** A pool is a level-0 rectangle in tile bounds (`x0..x1`, `z0..z1` inclusive), min 2 x 3 /
3 x 2 and max 12 x 12, inside the lot and clear of walls, openings, level-0 objects (any layer), stairs, floors
above and other pools. The deck around it must stay reachable: after blocking the water, the tiles next to its
ladders must still connect to the lot entry and no previously reachable tile may be cut off. At least one short side
needs a reachable deck tile; the auto ladder goes on the middle tile of the shorter side (ties: north, then west),
and explicit ladder commands must use an edge tile with deck access and keep at least one ladder. Cost is
`pricePerTile x tiles`, with a full same-day refund and the normal resale rate later, all through `transact` and one
undo step per command (`lot.changed` what `pools`).

**Navigation.** `buildNavGrid` blocks level-0 water with occupant id `pool:<id>`; deck tiles stay walkable and ladders
are scripted links, not nav edges, so nobody ever paths across water. `validatePlacement` refuses objects whose
footprints overlap water, and `lotCheck` flags a pool whose ladders have no reachable deck.

**Swimming.** `swimInPool` and `relaxInPool` are `tile` options on water (plus `getOutOfPool` while a pool action
runs); `sim/pool.ts` scripts the stages `toDeck -> enter -> swim -> exit` in `data.stage`: route to the ladder deck,
switch to the `swim` outfit (remembering the previous one), step onto the ladder, swim a deterministic boustrophedon
path inset one tile from the walls (or float at one point), then climb out to the deck and restore the outfit.
Movement in water is procedural and clamped to the rect; `ActionInstance.target` stays a tile. `getOutOfPool` and a
cancel request use the new `cancelGraceful` hook: the action moves into `exit`, ignores further cancels and always
ends on the ladder deck (`backX/backZ` point at the deck, so even `failNow` cannot leave a swimmer in the water). An
outdoor pool refuses swimming while it snows ("It is snowing."); a roofed pool stays open. Autonomy adds pool
candidates with the fun utility. Everyone has a `swim` outfit through `defaultWardrobe`, so no new garments.

**Toddlers (Milestone 13).** Toddlers cannot swim: the water menu shows `swimInPool` greyed with "too little to swim. Toddlers can paddle
at the pool edge with a grown-up watching." Instead `paddleAtEdge` (tile interaction, toddlers only, behavior `paddle` in `sim/pool.ts`)
puts the toddler on the dry deck tile beside the water (`poolBesideTile`, `nearestPoolEdgeTile`); it needs an awake teen or older within
`SUPERVISION_RADIUS` (8 tiles) on the same level when it starts, and the action ends the moment nobody watches. The toddler never enters
the water. Tests: `tests/unit/sim/toddlerPool.test.ts`. The yoga mat stays a rug (walkable): people walk over it and use it from its
use slot, so it is not a blockage by design.

**Rendering.** The basin is a recessed floor with inner walls and a coping ring in the style colours; water is one
plane per pool with a small texture-free `ShaderMaterial` (two scrolling ripples and a caustic pattern, transparent,
no depth write) updated by elapsed time only; the ladder is two rails with rungs. `EnvironmentView` cuts the ground
hole and `TerrainView` skips water tiles. Swimmers (`swim`/`float`) put the root on the water plane
(`WATER_Y = 0.015`) plus 0.04 m rather than sinking by standing height: the shared clips already lie the body flat,
so the head stays just above the surface and the body just under the transparent water (task F; the `swim-probe`
test guards this).

**Quayside Baths (task O).** `VenueType` gains `pool` (open 06:00-21:00, capacity 4) and a thirteenth `LOT_SPEC`
adds the venue to new worlds (15 lots in total; existing saves keep their lot list). `poolPlan()` builds a 22 x 20
hall with a 6 x 10 pool (x 7..12, z 8..17) and ladders on both short sides, a changing room and shower room, a lobby
with benches and a vending machine and an outdoor sun deck with loungers. The pool is written straight into
`lot.pools` before the lot checks, so it passes the same reachability validation as every other venue.

## Action feedback: moving parts, hand props, screens and the progress pill (Milestone 11.5)

All four systems are render-side and derive everything from the running action (`objectUses(state)` and
`person.queue[0]` / `person.anim`); no save fields were added. Files: `render/objectAssets.ts` (keeps door/lid
pivots), `render/objectAnim.ts` (moving parts and effects), `render/handProps.ts` (props on the rig),
`content/screens.ts` + `render/screenPrograms.ts` + `render/screensView.ts` (screen pictures),
`render/actionProgress.ts` + `render/progressPills.ts` (the pill), `render/objectUse.ts` (the shared action -> object
map), plus hooks in `objectsView.ts`, `peopleView.ts` and `gameView.ts`. Tests:
`tests/unit/render/{objectAnim,objectUse,handProps,actionProgress,screenPrograms}.test.ts`,
`tests/unit/content/screens.test.ts`, `tests/unit/ui/progressPill.test.ts` and `tests/unit/sim/actions.test.ts`.

**`objectUses`.** Maps object id -> the running `ObjectUse` (`action`, `anim`, `progress`, `phase`, plus additive
`actionId`, `queuedAt`, `objectId`, `role: 'target' | 'station'`). Stations come from `cookMeal`'s `data.stoveObj`
and `washDishes`' `data.washObj`, so the stove and sink animate while the cook or washer uses them.

**Moving parts (task D).** The GLB loader normally merges by material; `PART_NODES` keeps the named door/lid nodes as
`part:<name>` pivot groups (hinge at the node origin, original rotation/scale preserved). `objectAnim.ts` has 21
descriptors (fridges, stoves, bread oven, wardrobe, both toilets, showers, bath, four sinks, dishwasher, microwave,
washer, dryer) with node pivots or overlay panels for assets without a door node, interiors and cheap effects (hob
rings, pot, steam sprites, shower streaks and haze, bath water, tap stream, drum/light pulses). `activeParts` maps
descriptor + uses + anim to the parts that should be open; `opennessAt` / `seedMotion` / `stepMotion` are pure
smoothstep tweens in game minutes (0.4 min = 0.4 s at 1x), seeded from `anim.since` so loading mid-action shows the
door already open; reduced motion snaps. Effects advance with the game-clock delta (capped at 3x), so pausing freezes
them. Interiors are shallow code-built recesses, visible only while a door is open.

**Hand props (task H).** `propsFor(person, action, anim, clock, items)` is pure: snacks (sandwich/apple/yoghurt,
4 bite steps), cooking ingredients, the carried plate, the seated plate + right-hand fork, books, phone, mug, glass,
can, watering can, sponge, spray, mop, cloth, wrench, rod, spatula and paintbrush. Props appear only from a
hand-reach threshold (60% of `openFridge`/`pickUp`) or at perform, and vanish in `apply`/terminal phases. `HandProps`
parents small shared-geometry groups to `hand_r` / `hand_l` (placed plates to the character root in front of the
seat), re-parents after a rig rebuild, scales with the life stage, and hides off-lot/other-level people. Props are
kept level in the body frame so a plate does not tumble with the wrist.

**Screens (task S).** Four furniture definitions have measured glass (`computer-desktop`, `laptop`, `tv-flatscreen`,
`tv-vintage`); a quad is a child of the object group a few millimetres in front of the glass (`content/screens.ts`
holds the measured rectangles). `screensView.ts` maps the interaction to a mode: `document` (write*/homework/study/
sketch), `code` (programming), `game` (games/chess), `web` (phone, job search, adoption, research, planning, bills,
repair calls), `tv` (news/nature/cartoon/cooking/sport) and `desktop` as the fallback. Progress is
`elapsed / duration`; the seed is the action id and the picture is deterministic, so text grows monotonically with
the action. Four pooled 256x160 canvases are redrawn at most 4x/s (2x/s low quality, 1x/s reduced motion); off
screens share one dark-glass texture. Entries persist in mode `off` after an action ends.

**Progress pill (task B).** `actionProgress(state, person, content)` is pure and returns `{ fraction, icon, label,
done, status, walking, phase, actionId } | null`: nothing for queued/validate/reserve or off-lot; `route` shows the
completed share with a walking style so an action is visible from the start; `apply` and a successful `cleanup`
count as done; fixed durations use `elapsed / duration`, `untilFull` uses `data.startNeed`..100 (recorded by the sim
when perform begins) or `elapsed / maxMinutes` for older actions; chains (`cookMeal`, `eatMeal`, `read*`,
`washDishes`, pool stages) weight each stage's planned minutes and replace the current stage with its live duration;
a social listener uses `elapsed / SocialDef.minutes`. `ProgressPills` samples at 10 Hz only for on-screen people,
clamps the fraction per action id, writes at most 10 times a second, shows a green check for 700 ms on completion
(or grey at the stop point when cancelled/failed), and follows the `actionProgress: 'household' | 'all' | 'off'`
setting (default Household). The pill is the first child of the existing `.wo-p` column, so it stacks above the name
tag/thought bubble and never blocks the world.

## Room operations: move, resize, duplicate (Milestone 13)

Files: `building/roomOps.ts` (pure plan and diff), `building/roomCommands.ts` (undoable `roomCommand`, factories `moveRoom`,
`resizeRoom`, `duplicateRoom`), `game/core/build.ts` (`roomEdit` tool -> `RoomOp`, preview, apply), `ui/build/roomEditTools.ts`
(controls), `ui/build/buildSession.ts` (`startRoomEdit`, `adjustRoomEdit`). Tests: `tests/unit/building/roomOps.test.ts`,
`tests/unit/ui/buildSession.test.ts` ("room edit"), acceptance step 15.

- **Scope.** An enclosed, rectangular room (`rectangularRoomAt`: its tiles fill their bounding rectangle). L-shaped and
  other rooms are refused with a reason. Works on every level; the structure rules of upper floors come from `validateDiff`.
- **Plan.** `planRoomOp(state, content, lotId, householdId, op) -> RoomOpPlan` (`ok, reasons, cost, charge, refund, from, to, counts,
  diff: RoomDiff, highlight, measure`). `RoomDiff` is a `BuildDiff` (walls, openings, floors) plus `moves` (furniture), `adds`
  (copied furniture, ids `pending:obj:n`) and `items` (food on moved furniture). Nothing mutates state or allocates ids.
- **Move** shifts walls, doors and windows in them, floor, furniture and the food on it by (dx, dz); the net cost is 0 (the walls keep
  their paid prices). A wall shared with the next room stays where it is (the neighbour keeps it) and the moved room gets a new wall on
  that side; doors in shared walls stay with them. **Resize** moves one side by `delta` tiles: new walls and floor are priced like
  building, removed ones refunded like demolition; doors and windows on the moving side move with it, those on removed stubs are
  refunded. **Duplicate** copies the shell at today's prices (walls, floor, openings); `copyObjects` buys the furniture again, with
  surface items attached to their copied support. The copy may not overlap the original.
- **Validation.** Destination on the lot and outside every other indoor room; no wall through the new interior; people in the room or
  its destination block a move, people in a removed strip block a shrink (nobody is pushed); furniture in a removed strip blocks a
  shrink ("Clear the X out of the strip first"); the structural part runs through `validateDiff` (walls through furniture, wall items
  losing their wall, doors without walls, walled-in people, unreachable furniture, upper-floor support) with the moving furniture
  taken out first; every moved or copied object is then placed again through `validatePlacement` in the new structure (collisions,
  wall items on solid wall, access), supports before the items on them.
- **Command.** One transaction like every build command: apply = plan, one `transact` for the net cost, real ids, write the diff,
  `lot.changed` (what `all`); a rejected apply changes nothing (not even `nextId`); revert restores the captured records and reverses the
  money that moved; reapply re-checks `roomDiffMatches` and the structure rules and re-charges the captured amount.
- **UI.** With no tool, tapping a room selects it; the Paint tab then shows Move, Resize, Copy and Demolish (44 px buttons). Move and
  Copy show an arrow pad (one tile per press, touch or mouse), Resize a side selector with Smaller and Bigger, Copy a "copy the
  furniture too" switch. The footer shows the live preview (measure, walls, cost or Free, or the reason) and Apply; Esc or Cancel
  clears. A mouse click only re-aims the preview (a room edit never applies without Apply); hover previews are off for this tool.

## Furnishings that work (Milestone 13)

Files: `content/interactionsFurnishings.ts` (the interactions), `content/furnishingUse.ts` (patches older designs, the handmade pot),
`sim/furnishings.ts` (pot, fish in the fridge, the object test of the two-player games), `objectsM10/decor-hobby.ts` and
`tools/furniture-extra/m10/decor-hobby.mjs` (five new designs), `render/objectAnim.ts` (door timing), `characters/stagePose.ts`
(recline, curl). Tests: `tests/unit/integration/furnishings-m13.test.ts`.

- **Games.** New designs `pool-table-classic`, `dartboard-cabinet`, `foosball-table`, `table-tennis-table` (interactions `playPool`,
  `throwDarts`, `playFoosball`, `playTableTennis`: fun, a moodlet, table tennis also trains Fitness). With two people: socials
  `playPoolTogether`, `playDartsTogether`, `playFoosballTogether`, `playTableTennisTogether` carry `requires.objectTag` (the actor's lot
  and level needs a working object with that tag); the pair chat as usual, there is no walk to the table.
- **Pottery.** `pottery-wheel`: `throwPottery` (Creativity xp, fun) places a Handmade Pot (`pot-handmade`, status dev, `proc:pot` mesh) on a
  free tile near the potter; its recorded price is `potValue(creativity level)` and it was "bought yesterday", so Build mode sells it
  for 80 % of that. `sellPottery` pays a freelance fee once through `transact`.
- **Instruments.** `drum-kit-display`, `harp-concert`, `cello-stand` gained a use slot and `playDrums`, `playHarp`, `playCello`
  (behavior `computer`: sit at a chair in front when there is one; Music xp, Creativity as secondary skill, fun).
- **Recliners.** `reclineBack` (seated, +12 energy per hour): `peopleView` calls `PersonView.setRecline` while the action performs and
  `CharacterView` leans the spine back (`RECLINE_LEAN`, a negative stoop) while seated. The modular view shows the plain seated pose.
  **Sofa bed** `sofa-bed-convertible` has a `sleep` slot along its length (sleep, nap, sit). Storage beds already offered Sleep.
- **Microwave, laundry.** `microwaveMeal` (6 min, $4, +35 hunger, behavior `snack`) and `doLaundry` (40 min, +14 hygiene on completion,
  `freshLaundry` moodlet, a little Handiness). The microwave and the washers and dryers are now `functional`: they wear out and can be
  repaired like any appliance. Door and drum are driven by the running action: the microwave door is open the first and last
  `MICROWAVE_DOOR_MINUTES` (1), the washer door or lid the first and last `LAUNDRY_DOOR_MINUTES` (3), the drum and light turn throughout.
- **Fish in the fridge.** `WorldItem.stored` (optional). The item interaction `storeFish` (walk to the fish, pick it up, walk to a
  fridge, put it in) sets `stored`, moves it to the fridge and multiplies the remaining shelf life by `FRIDGE_SPOIL_FACTOR` (3). Stored
  items are not drawn, not eaten (`eatMeal` and `availableMeals` refuse them) and not sold. The recipe `pan-fried-fish`
  (`RecipeDef.ingredient: 'fish'`, $4 of butter and lemon) is never chosen automatically; the fridge menu offers "Cook the Catch" when a
  stored fish exists, `cookMeal` takes the oldest stored fish when cooking starts and serves one portion per fish portion.
- **Shade.** `ObjectDef.shelter` (tiles around the footprint): `parasol-standing`, `table-patio`, `garden-arbour` have 1.
  `sim/weather.ts` `shadedAt` / `isSheltered`: a person in the shade counts as sheltered (the rain and snow moodlets, the `sheltered`
  gate). Shade does not make a tile indoors (`outdoorsAt` is unchanged).

## Babies and walking (Milestone 13)

- **Curled pose.** A lying baby that nobody holds draws its knees up and folds its forearms (`CURL_BONES`, `applyCurl`, eased in and out
  by `CharacterView`); a held baby keeps the carrier's cradle pose.
- **Walk cycle speed.** `peopleView` measures each person's ground speed (tiles per real second, smoothed) and passes
  `speed / WALK_TILES_PER_MINUTE` to `PersonView.setWalkRate`; `Animator.setWalkRate` multiplies the locomotion clips' speed by it (on top of
  the stage's cadence). At normal game speed nothing changes; at Fast and Very fast the legs no longer skate, and a slow route no longer
  runs the clip at full speed.
