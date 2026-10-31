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
  conversion so footprints, slots and models rotate together.
- Facing angle: 0 looks toward +z, PI/2 toward +x (`facingDir`). A model facing +z gets `rotation.y = facing`.
- Characters: feet at y = 0, height about 1.8 m, facing +z at rotation 0.
- Third-party furniture models (Kenney Furniture Kit) are roughly half scale: typical uniform scale 2.0
  (beds about 1.75). `public/assets/manifest.json` lists measured bounds (`min`, `max` before scaling) and
  material names for every model.

## Module map and ownership

| Path | Owner | Contents |
|---|---|---|
| `src/core/` | main session | types, ids, rng, clock, money, geometry, events, commands, state helpers, nav contract, drafts, anim ids |
| `src/content/types.ts`, `src/content/index.ts` | main session | definition types and the registry aggregator |
| `src/content/{objects,interactions,socials,traits,aspirations,skills,careers,moodlets,recipes,packs,preferences}.ts`, `src/content/validate.ts`, `tools/content-report.ts` | content | gameplay data and validation |
| `src/content/surfaces.ts`, `src/render/textures/` | surfaces | wall and floor designs, door/window defs, procedural painters, texture cache, thumbnails |
| `src/world/`, `src/building/` | world | lots, walls, rooms, navigation, placement, starter lots, build/buy commands |
| `src/sim/` | sim | people, needs, moods, actions, reservations, autonomy, social, relationships, careers, skills, aspirations, visitors |
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
- Visitors: neighbours visit through `state.schedule` (`visitArrive`/`visitLeave`), arriving at `lot.entry`.

### characters (`src/characters`)
- `assets.ts`: `loadCharacterAssets(baseUrl = './assets/'): Promise<CharacterAssets>` (bodies + clips).
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
| `phoneInvite` | `invite` | self; data.personId = neighbour; schedules a visit in 60 min |
| `phoneChat` | `phoneChat` | self; data.personId; social +, small friendship gain |

**Surfaces** (surfaces agent): wall designs `plain-paint`, `subway-tile`, `stripes-regency`, `brick-classic`
and floor designs `oak-planks`, `checker-tile`, `carpet-plush`, `hex-mosaic`, `stone-pavers` must exist
(with `palettes[0]` as the default). Openings `door-panel` (door), `door-glazed` (door), `window-sash`,
`window-wide` (windows), all 1 tile wide.

**Careers**: `culinary` with 10 levels (M1's off-lot career). **Skills**: all 16 defined; M1 activities train
cooking, logic, programming, charisma, fitness, gardening, music.

## Simulation flow per tick

1. Advance clock by `TICK_MINUTES`.
2. Process due `state.schedule` entries in time order (each occurrence once).
3. Careers: start commutes for shifts starting within 60 min (autonomy or player `goToWork`), mark missed
   shifts, return people whose shift ended, pay once per completed/partial shift.
4. Needs decay for everyone (traits, posture, object quality); off-lot people decay at a reduced rate.
5. Run each on-lot person's current action through its phases:
   validate -> reserve -> route -> prepare -> perform -> apply -> cleanup.
   Cancellation or failure in any phase runs that phase's cleanup and always releases reservations.
6. Autonomy for idle people (staggered, cooldowns, hysteresis), visitors' simple autonomy.
7. Moodlets expire; aspiration objectives update on events.

## Rendering and UI (summary; detailed when written)

- Single WebGL2 canvas, orthographic camera with 90-degree rotation steps, pan and zoom; walls up / down /
  cutaway. Character creator reuses the renderer with a preview scene.
- HTML/CSS panels over the canvas; portrait uses a top bar, household strip and bottom sheets; landscape uses
  a bottom HUD and side panels. Touch targets >= 44 px.
