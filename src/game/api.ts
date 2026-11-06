// GameAPI - the only surface the HTML interface talks to. Implemented by src/game/Game.ts, which combines
// GameCore (pure: state, simulation, navigation, commands, saves, tool logic) with GameView (three.js:
// rendering, camera, picking, previews, portraits). The UI never imports three, sim internals or the DOM
// of the renderer; it reads state through state() and selectors, and changes it only through these methods.
//
// ---------------------------------------------------------------------------------------------------------
// Build mode construction API (walls, rooms, doors, windows, floors). Mirrors the paint tool pattern:
//
//   setBuildTool(tool)      choose what the pointer does (null = none). Only in Build mode.
//   buildPreview(target)    pure: validates the tool at the target and returns cost, counts, measurement,
//                           reasons and the highlight; never changes the world or money. null clears it.
//   buildApply(target)      runs the same operation as one atomic, undoable command (undo()/redo() in this API).
//                           A failed apply changes nothing, money included.
//   buildCancel()           clears the preview and highlight (Esc once); setBuildTool(null) ends the tool.
//   buildHighlight()        what the renderer draws for the current preview (see BuildHighlight).
//   rooms()                 enclosed rooms with stable uids and outline loops; roomAt(tile); openingAt(wallId).
//   highlightRoom(uid)      outlines and tints a room in the world (hover or selection); null clears it.
//   view.groundPoint(x, y)  screen point -> lot coordinates, to feed BuildTarget.
//
// Coordinates: BuildPoint is in tile units, lot space (x east, z south; (0,0) is the lot's north-west corner).
// Fractions are allowed and the core snaps them per tool: wall runs and rooms to grid VERTICES (round),
// single walls to the nearest EDGE, floors to the TILE (floor). Wall runs are straightened to the dominant
// axis. Edge keys are `level:dir:x:z` (core/ids.ts edgeKey); 'h' edge (x, z) runs (x,z)-(x+1,z), 'v' edge
// (x, z) runs (x,z)-(x,z+1).
//
// Drag tools (wall run, room, rect erase, rect floor): call buildPreview({ from, to }) while dragging and
// buildApply({ from, to }) on release. Click tools (segment, opening, floor tile, room fill, delete room) use
// { from } only; openings may pass { wallId } from a view.pick wall result instead.
//
// Rules the core enforces (reasons come back in BuildPreview.reasons, first one is the main one):
//  - walls cannot run through furniture, within reach of a person, or wall a person in / seal furniture off
//    from the lot entry (use the room tool's `doors` to build a sealed room and its door in one step);
//  - doors/windows need a wall on every spanned edge, no other opening, a wall high enough, no wall joining the
//    middle of a wide opening, nothing hung on the edge, and doors a clear tile on both sides;
//  - deleting a wall deletes the door/window in it (refunded) in the same command; deleting a wall that holds
//    a wall-mounted object, or the last way out for someone, is refused;
//  - walls that already exist are kept as they are (finishes too) and are not charged again.
// Money: BuildPreview.cost is the net charge (negative = money back); 0 charge in the sandbox. See
// building/buildPlans.ts for the price list (wall segment = structure + two side finishes, floor = design price
// per tile, openings = definition price, demolition returns the paid price the same day, 80 % later).
// Doors and windows spanning several tiles (OpeningDef.width > 1) are stored as one Opening with `span`.
// The renderer should draw an opening over world/walls.ts openingEdgeKeys(opening) starting at its wallId edge.
// ---------------------------------------------------------------------------------------------------------
// Neighbourhood API (Milestone 7: lots, travel, other households). Optional members, like the event planner and the
// economy: the standalone dev pages of other screens may omit them. All of it is plain data, never three.js objects.
//
//   neighbourhood()             every lot (kind, venue type, name, address, blurb, map position, household, tenure, rent or
//                               price, opening hours, who is there, travel minutes and why the household cannot go),
//                               every household (members, funds, where they are) and the trip under way. Read-only.
//   whereIs(personId)           where a person is in words, for HUD badges: "At home", "At work", "At Lakeside Park",
//                               "On the way to Lantern Hall" (PersonPlace.text), plus kind / lotId / arrival minute.
//   travelProblem(ids, lotId)   why these household members cannot set out for the lot now (closed, at work, a trip is
//                               under way, hosting an event...), or null. Changes nothing.
//   travel(ids, lotId)          'Go to <venue>' / 'Visit <household>': the people walk to the lot entry and set off; they
//                               arrive 20-40 game minutes later (`minutes`, `arrivesAt`), at the entry of the destination. It costs
//                               nothing. Household members who stay behind go off-lot ("At home") and follow the light
//                               schedule. The active lot switches when the group arrives (events 'travel' and 'lot.activated').
//   goHome(ids?)                'Go home': everyone who is out (or `ids`) returns to the household's home lot.
//   inviteHome(hostId, guestId) in person: ask somebody you have met to come to your home (a visit in about an hour).
//                               The same entry is offered in the context menu of the person ("Invite X to My Home").
//   switchPreview(householdId)  what switching the household you play would do, in sentences (consequences[]), or why not.
//   switchHousehold(householdId) play another household; the previous one carries on lightly (jobs, bills, daily plan).
//   movePreview(lotId) / moveHousehold(lotId)
//                               move the household into an empty home that is for rent (first week up front) or for sale;
//                               an owned home that is left is sold for 80 % of its value. Members who are out travel there.
//
// Rules the simulation follows (docs/ARCHITECTURE.md "Neighbourhood"):
//  - only the active lot is simulated in detail; everybody else is placed by timestamps: at home, at work or at a venue;
//  - a person's job, relationships, traits and looks are generated once and never rerolled when a lot loads;
//  - each household's funds and ledger stay separate; wages and bills use the same occurrence ids as the active household;
//  - events: 'lot.activated' (the renderer shows the new lot), 'travel' (departed / arrived), 'household.switched',
//    'household.moved'; UiChange 'lot' and 'neighbourhood' tell the UI to re-read neighbourhood().
// ---------------------------------------------------------------------------------------------------------

import type { ContentDB } from '../content/types';
import type { Speed } from '../core/clock';
import type { HouseholdDraft, PersonDraft } from '../core/drafts';
import type { EventBus } from '../core/events';
import type { AnimId } from '../core/anim';
import type { Tile } from '../core/nav';
import type { Cents, FinishRef, HomeEventType, Id, OutfitCategory, Rot, SimSettings, StartMode, Wardrobe, WorldState } from '../core/types';
import type { BuildCounts, BuildHighlight, BuildMeasure, WallSpec } from '../building/buildPlans';
import type { RoomDelta, Vertex } from '../world/roomTracker';
import type { MovePreview, SwitchPreview } from '../sim/households';
import type { NeighbourhoodInfo } from '../sim/neighbourhoodView';
import type { PersonPlace } from '../sim/places';
import type { AdoptionPreview, AdoptionSpec } from '../sim/adoption';
import type { FamilyInfo } from '../sim/familyView';
import type { SplitPreview, SplitTarget } from '../sim/split';

export type { BuildCounts, BuildHighlight, BuildMeasure, WallSpec } from '../building/buildPlans';
export { WALL_HEIGHT_PRESETS } from '../building/buildPlans';
export type { RoomDelta, Vertex } from '../world/roomTracker';
export type { HouseholdBrief, MovePreview, SwitchPreview } from '../sim/households';
export type { HouseholdInfo, LotInfo, LotPerson, NeighbourhoodInfo, Tenure, TripInfo } from '../sim/neighbourhoodView';
export type { PersonPlace, PlaceKind } from '../sim/places';
export type { AdoptionPreview, AdoptionSpec, AdoptStage } from '../sim/adoption';
export type { FamilyInfo, RelativeInfo } from '../sim/familyView';
export type { SplitPreview, SplitTarget } from '../sim/split';
export type { SchoolInfo } from '../sim/school';

export type GameMode = 'boot' | 'menu' | 'creator' | 'live' | 'buy' | 'build';
export type CutawayMode = 'up' | 'cutaway' | 'down';
export type Result = { ok: true } | { ok: false; reason: string };

/** What is under a screen point. Walls report the side facing the camera. */
export type PickResult =
  | { kind: 'person'; personId: Id }
  | { kind: 'object'; objectId: Id }
  | { kind: 'item'; itemId: Id }
  | { kind: 'wall'; wallId: string; side: 'a' | 'b'; tile: Tile; level: number }
  | { kind: 'floor'; tile: Tile; level: number }
  | { kind: 'none' };

/** One context-menu entry (mirrors sim InteractionOption). */
export interface MenuOption {
  interactionId: string;
  label: string;
  icon: string;
  group: 'object' | 'social' | 'self' | 'move';
  enabled: boolean;
  reason?: string;
  /** Sub-group: socials 'friendly' | 'romantic' | 'mean' | 'special' (most relevant first, unavailable last), phone entries 'phone'. */
  section?: string;
  /** Short odds text for socials ("Good odds"); absent for romantic options. */
  hint?: string;
  /** Opaque payload passed back to queue(). */
  token: unknown;
}

/** A request to plan a home event. */
export interface PlanEventRequest {
  type: HomeEventType;
  hostId: Id;
  guestIds: Id[];
  startAt: number;
}

export interface PlacementState {
  source: 'buy' | 'move' | 'inventory';
  defId: string;
  objectId: Id | null;
  inventoryIndex: number | null;
  x: number;
  z: number;
  level: number;
  rot: Rot;
  ok: boolean;
  reasons: string[];
  /** Money that confirming would charge (negative = refund, e.g. never for moves). */
  cost: Cents;
}

export type PaintTool =
  | { kind: 'wall'; finish: FinishRef; scope: 'side' | 'room' }
  | { kind: 'floor'; finish: FinishRef; scope: 'tile' | 'room' }
  | { kind: 'eyedropper'; target: 'wall' | 'floor' };

/** `unchanged`: the pick already has the chosen finish (not an error; `reason` says so for display). */
export interface PaintPreview { ok: boolean; reason?: string; unchanged?: true; cost: Cents; count: number }

/** A point on the lot in tile units (fractions allowed; the tool snaps). */
export interface BuildPoint { x: number; z: number }

/** A door or window built together with the room tool, centred on one side of the room. */
export interface RoomDoorSpec {
  defId: string;
  /** Side of the room: north (-z), east (+x), south (+z), west (-x). */
  side: 'n' | 'e' | 's' | 'w';
  /** Tiles to shift from the middle of that side (default 0). */
  offset?: number;
}

/**
 * What the pointer does in Build mode (structure tools; finishes are the PaintTool).
 * - wall: shape 'segment' (one edge) or 'run' (drag between vertices). `spec` sets finishes and height.
 * - room: rectangular room between two corners; `floor` fills the inside, `doors` adds doors/windows.
 * - eraseWall: demolish one segment, along a run, or everything inside a dragged rectangle.
 * - opening: place the door/window `defId` on the wall under the pointer (`flip` swings it the other way).
 * - moveOpening: move the opening `openingId` (pick it with openingAt) to the wall under the pointer.
 * - eraseOpening: remove the door/window under the pointer (the wall stays).
 * - floor / eraseFloor: tile, dragged rectangle, or the whole room under the pointer.
 * - deleteRoom: remove the room under the pointer (outer walls, their openings and the floor).
 */
export type BuildTool =
  | { kind: 'wall'; shape: 'segment' | 'run'; spec?: WallSpec }
  | { kind: 'room'; spec?: WallSpec; floor?: FinishRef | null; doors?: RoomDoorSpec[] }
  | { kind: 'eraseWall'; shape: 'segment' | 'run' | 'rect' }
  | { kind: 'opening'; defId: string; flip?: boolean }
  | { kind: 'moveOpening'; openingId: Id | null; flip?: boolean }
  | { kind: 'eraseOpening' }
  | { kind: 'floor'; finish: FinishRef; shape: 'tile' | 'rect' | 'room' }
  | { kind: 'eraseFloor'; shape: 'tile' | 'rect' | 'room' }
  | { kind: 'deleteRoom' }
  // Milestone 9: staircases. `stairs` places the ObjectDef `defId` (a stair) on the active level at the tapped tile, turned `rot` quarter
  // turns (a rise toward the back of the object); `eraseStairs` sells the staircase under the pointer (from either floor it joins).
  | { kind: 'stairs'; defId: string; rot?: number }
  | { kind: 'eraseStairs' }
  // Milestone 9 exterior (building/exteriorPlans.ts). `fence` is a drag: one run, an L, or (shape 'rect', or Shift while dragging)
  // the four sides of a rectangle as a loop; a gate design is placed on the tapped edge.
  // `roof` is a dragged rectangle ('rect') or the whole house at once ('auto'); `terrain` paints one tile or a dragged rectangle.
  | { kind: 'fence'; defId: string; variant?: number; shape?: 'run' | 'rect' }
  | { kind: 'eraseFence' }
  | { kind: 'roof'; shape: 'rect' | 'auto'; spec: RoofToolSpec }
  | { kind: 'eraseRoof' }
  | { kind: 'terrain'; paintId: string; shape: 'tile' | 'rect' }
  // Milestone 12: swimming pools (building/poolPlans.ts). `pool` drags a rectangle like the room tool; `erasePool`
  // removes the pool under the pointer; `poolLadder` moves the ladder the panel picked (`from`) or adds/removes one
  // on the tapped edge tile.
  | { kind: 'pool'; styleId: string }
  | { kind: 'erasePool' }
  | { kind: 'poolLadder'; mode: 'move' | 'add' | 'remove'; poolId?: Id | null; from?: BuildPoint | null };

/** Style, pitch, ridge direction (null = along the long side) and finish of the roof tool. */
export interface RoofToolSpec { styleId: string; pitch?: number; ridge?: 'h' | 'v' | null; finish: FinishRef }

/** Where the tool acts: `from` (press) and `to` (current drag point), or the wall under the pointer for openings. */
export interface BuildTarget {
  from: BuildPoint;
  to?: BuildPoint | null;
  /** Edge key of the wall under the pointer (view.pick 'wall' result); overrides `from` for opening tools. */
  wallId?: string;
  /** Floor level (default 0). */
  level?: number;
  /** Drag a fence as a rectangle loop instead of a run or an L (Shift on desktop; the panel's Rectangle toggle sets the tool shape). */
  rect?: boolean;
}

/**
 * Result of previewing a build operation. `ok` false carries reasons; `unchanged` means it would change nothing
 * (already built, nothing to erase), which is not an error to show in red.
 */
export interface BuildPreview {
  ok: boolean;
  /** Main reason when not ok. */
  reason?: string;
  reasons: string[];
  unchanged?: true;
  /** Short action text such as "Build 6 m of wall" (also the undo label). */
  label: string;
  /** Net money now: charge - refund (negative = money back). */
  cost: Cents;
  charge: Cents;
  refund: Cents;
  counts: BuildCounts;
  measure: BuildMeasure;
  /** Indoor room counts before/after, e.g. before 1, after 2 = the wall splits a room. */
  rooms: { before: number; after: number };
  highlight: BuildHighlight | null;
  /** Milestone 9: things worth knowing that do not block the build (a balcony without a railing). */
  warnings?: string[];
}

/** An enclosed (or outdoor) region of the lot. `uid` survives edits that leave the room unchanged. */
export interface RoomInfo {
  uid: string;
  level: number;
  /** Tiles in row-major order. */
  tiles: Tile[];
  /** Square metres (one per tile). */
  area: number;
  /** True for the region open to the lot border (the yard). */
  outdoor: boolean;
  /** Closed vertex loops around the room (outer boundary first, holes after) for highlighting. */
  outlines: Vertex[][];
}

export interface BuildApplyResult {
  cost: Cents;
  label: string;
  counts: BuildCounts;
  /** Rooms created/removed/kept by the change (uids as in rooms()). */
  rooms: RoomDelta;
  /** Id of the opening placed or moved, when the tool was an opening tool. */
  openingId?: Id;
}

export interface GameSettings {
  masterVolume: number; // 0..1
  soundVolume: number;
  musicVolume: number;
  reducedMotion: boolean;
  textScale: number; // 0.9..1.3
  quality: 'low' | 'high';
  /** 'mpfb': the natural MakeHuman bodies (default); 'detailed': scanned Meshy bodies; 'classic': the procedural bodies (fallback, lighter); 'quaternius': modular GLB-part adults on top of the classic bodies (preview). */
  characterStyle: 'mpfb' | 'detailed' | 'classic' | 'quaternius';
  shadows: boolean;
  /** Milestone 12: rain/snow particles (render-only; the weather light tint stays when this is off). */
  weatherEffects: boolean;
  /** Milestone 11.5: progress pills above the head for the active household (default), everyone, or nobody. */
  actionProgress: 'household' | 'all' | 'off';
  showStats: boolean;
  tutorial: boolean;
}

export type SoundId =
  | 'click' | 'tap' | 'open' | 'close' | 'confirm' | 'error' | 'place' | 'sell' | 'paint' | 'select' | 'toggle'
  | 'money' | 'notify' | 'promotion' | 'levelUp' | 'social' | 'newDay';

export interface SaveSlotInfo {
  slotId: string;
  name: string;
  savedAt: string;
  gameMinutes: number;
  householdName: string;
  funds: Cents;
  kind: 'manual' | 'autosave' | 'backup';
  empty: boolean;
}

export interface DevStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  loadedAssets: number;
  agents: number;
  routeRequests: number;
  simTickMs: number;
  ticksPerFrame: number;
}

/** What changed in UI-relevant game state (not world events, which come through `events`). */
export type UiChange =
  | 'mode' | 'selection' | 'speed' | 'placement' | 'paint' | 'build' | 'undo' | 'camera' | 'settings' | 'state' | 'portraits' | 'thumbnails' | 'creator'
  /** The active lot changed (travel arrived, household switched or moved): the world view shows another lot. */
  | 'lot'
  /** Something the neighbourhood map shows changed: a trip started or ended, a household switched or moved. */
  | 'neighbourhood';

export interface CreatorPreviewOptions {
  /** Outfit category shown in the preview. */
  category: OutfitCategory;
  anim: AnimId;
}

export interface GameAPI {
  readonly content: ContentDB;
  /** World events from the simulation and commands (src/core/events.ts). */
  readonly events: EventBus;
  /** UI-relevant changes (mode, selection, speed, placement...). Returns an unsubscribe function. */
  onChange(fn: (what: UiChange) => void): () => void;

  /** Current world, or null on the main menu before a game is loaded. Treat as read-only. */
  state(): WorldState | null;
  mode(): GameMode;

  // ---- flow ----
  /** Main menu with the live starter-house backdrop. */
  showMenu(): void;
  /** Creates people from the draft (or a premade household for guided start) and moves them in. */
  startNewGame(mode: StartMode, draft: HouseholdDraft): Promise<Result>;
  /** Premade households and the neighbour, for guided start and the creator's presets. */
  premadeHouseholds(): HouseholdDraft[];

  // ---- creator preview (the UI owns the CreatorSession; the game only renders) ----
  creator: {
    /** Enters creator mode (renderer shows the preview scene) or updates the shown person. */
    show(person: PersonDraft, opts: CreatorPreviewOptions): void;
    setView(view: 'front' | 'side' | 'back' | 'face'): void;
    rotate(deltaRadians: number): void;
    zoom(factor: number): void;
    hide(): void;
    /** Small data-URL portrait of a draft (for member strips). */
    portrait(person: PersonDraft): Promise<string>;
  };

  // ---- saves ----
  listSaves(): Promise<SaveSlotInfo[]>;
  latestSave(): Promise<SaveSlotInfo | null>;
  saveTo(slotId: string, name: string): Promise<Result>;
  loadFrom(slotId: string): Promise<Result & { report?: string[] }>;
  deleteSave(slotId: string): Promise<Result>;
  /** JSON of the current world for download; null when no game is running. */
  exportWorld(): string | null;
  importWorld(json: string): Promise<Result & { report?: string[] }>;

  // ---- time ----
  speed(): Speed;
  setSpeed(s: Speed): void;
  togglePause(): void;

  // ---- live mode ----
  selected(): Id | null;
  select(personId: Id | null): void;
  /** Context-menu entries for what was picked, for the given person. */
  options(personId: Id, pick: PickResult): MenuOption[];
  queue(personId: Id, option: MenuOption): Result;
  /** Walk to a tile ("Go here"). */
  goTo(personId: Id, tile: Tile): Result;
  cancel(personId: Id, actionId: Id): void;
  reorder(personId: Id, actionId: Id, toIndex: number): void;
  mood(personId: Id): { value: number; label: string; reasons: string[] };
  /** Replaces a household member's wardrobe (wardrobe editor). */
  updateWardrobe(personId: Id, wardrobe: Wardrobe): Result;

  // ---- social events (Milestone 5; sim/events.ts) ----
  // The planner lists known people and event types from state()/content (content.events). `startAt` is an absolute
  // game minute (at least the type's notice from now, at most three days ahead). A date asks for the guest's consent.
  // The game implements these; the standalone dev mocks of other screens (buy, creator) may omit them.
  /** Why this event cannot be planned like this, or null when it can (nothing changes). */
  eventProblem?(req: PlanEventRequest): string | null;
  /** Plans the event and sends the invitations. */
  planEvent?(req: PlanEventRequest): Result & { eventId?: Id };
  /** Calls off a planned event that has not started. */
  cancelEvent?(eventId: Id): Result;

  // ---- careers and household economy (Milestone 6) ----
  // Optional like the event planner: standalone dev mocks of other screens may omit them. Money always moves
  // through the simulation's transact with an occurrence id.
  /** Pays one bill of the person's household; returns the amount paid. */
  payBill?(personId: Id, billId: Id): Result & { amount?: Cents };
  /** Turns automatic bill payment on or off for the person's household. */
  setAutoPayBills?(personId: Id, on: boolean): Result;
  /** Takes a job (level 1) for a household member. */
  joinCareer?(personId: Id, careerId: string): Result;
  /** Quits the member's current job (a shift in progress is cancelled without pay). */
  quitCareer?(personId: Id): Result;
  /** 'slack' | 'normal' | 'hard': affects performance and energy. */
  setCareerEffort?(personId: Id, effort: 'slack' | 'normal' | 'hard'): Result;
  /** Answers the current shift's on-the-job decision. */
  resolveCareerEvent?(personId: Id, optionId: string): Result;

  // ---- neighbourhood and other households (Milestone 7; see the Neighbourhood API notes at the top) ----
  neighbourhood?(): NeighbourhoodInfo | null;
  whereIs?(personId: Id): PersonPlace | null;
  travelProblem?(personIds: Id[], lotId: Id): string | null;
  /** `minutes` of travel; the group arrives at `arrivesAt` (absolute game minute). */
  travel?(personIds: Id[], lotId: Id): Result & { minutes?: number; arrivesAt?: number };
  goHome?(personIds?: Id[]): Result & { minutes?: number; arrivesAt?: number };
  inviteHome?(hostId: Id, guestId: Id): Result;
  switchPreview?(householdId: Id): SwitchPreview | null;
  switchHousehold?(householdId: Id): Result;
  movePreview?(lotId: Id): MovePreview | null;
  moveHousehold?(lotId: Id): Result;

  // ---- family and life stages (Milestone 8; sim/aging.ts, school.ts, care.ts, adoption.ts, split.ts) ----
  // Optional like the other newer sections. Everything is plain data.
  //   family(personId)        stage, days to the next birthday (null when aging is off), relatives, school and what the
  //                           household can do (age up with a birthday cake, adopt). Read-only.
  //   ageUpNow(personId)      queues the birthday at a birthday cake on the lot ("Age up now"); a caregiver celebrates with a baby.
  //   doHomework(personId)    sends a child or teen to the nearest desk, table or computer when homework is due.
  //   adoptPreview / adopt    adopt a baby, toddler, child or teen (stage, sex, name); the fee is charged once (`adopt:<hh>:<n>`).
  //   splitPreview / splitHousehold(personIds, target)
  //                           members move out to a vacant home (rent or buy) or in with another household; funds are shared by
  //                           headcount; the result names the new household, which `switchHousehold` can then play.
  family?(personId: Id): FamilyInfo | null;
  ageUpNow?(personId: Id): Result;
  doHomework?(personId: Id): Result;
  adoptPreview?(adopterId: Id, spec: AdoptionSpec): AdoptionPreview | null;
  adopt?(adopterId: Id, spec: AdoptionSpec): Result & { personId?: Id };
  splitPreview?(personIds: Id[], target: SplitTarget): SplitPreview | null;
  splitHousehold?(personIds: Id[], target: SplitTarget): Result & { householdId?: Id };

  // ---- modes ----
  /** Build and Buy pause the simulation; returning to live restores the previous speed. */
  setMode(m: 'live' | 'buy' | 'build'): void;

  // ---- buy mode ----
  startPlacement(defId: string): Result;
  startMove(objectId: Id): Result;
  startPlaceFromInventory(index: number): Result;
  placement(): PlacementState | null;
  /** Moves the preview to the tile under a screen point (pointer move or tap). */
  placementAt(screenX: number, screenY: number): void;
  rotatePlacement(dir?: 1 | -1): void;
  confirmPlacement(): Result;
  cancelPlacement(): void;
  sell(objectId: Id): Result;
  saleValue(objectId: Id): Cents;
  store(objectId: Id): Result;
  setObjectFinish(objectId: Id, regionId: string, swatchId: string): Result;
  /** Objects selected in buy mode (highlighted in the world). */
  selectObject(objectId: Id | null): void;
  selectedObject(): Id | null;

  // ---- build mode (finishes) ----
  setPaintTool(tool: PaintTool | null): void;
  paintTool(): PaintTool | null;
  /** Shows the in-world preview for a hovered/tapped target; null clears it. */
  paintPreview(pick: PickResult | null): PaintPreview | null;
  paintApply(pick: PickResult): Result;
  /** Reads the finish under the pick (eyedropper). */
  eyedrop(pick: PickResult): FinishRef | null;
  recentFinishes(kind: 'wall' | 'floor'): FinishRef[];
  undo(): string | null;
  redo(): string | null;
  canUndo(): boolean;
  canRedo(): boolean;

  // ---- build mode (structure: walls, rooms, doors, windows, floors) ----
  // See the Build mode construction API notes at the top of this file. Only valid in Build mode.
  setBuildTool(tool: BuildTool | null): void;
  buildTool(): BuildTool | null;
  /** Validates and prices the tool at the target; null (or no tool) clears the preview and highlight. */
  buildPreview(target: BuildTarget | null): BuildPreview | null;
  /** Runs the tool at the target as one undoable command. Nothing changes when it fails. */
  buildApply(target: BuildTarget): Result & Partial<BuildApplyResult>;
  /** Clears the preview and highlight but keeps the tool. */
  buildCancel(): void;
  /** What the renderer should draw for the current preview (null when none). */
  buildHighlight(): { highlight: BuildHighlight; ok: boolean } | null;
  /** Rooms of the active lot level (stable uids, outlines). */
  rooms(level?: number): RoomInfo[];
  /** The room containing a tile, if any. */
  roomAt(tile: Tile, level?: number): RoomInfo | null;
  /** The door or window on a wall edge (including edges only spanned by a wide opening), or null. */
  openingAt(wallId: string): { openingId: Id; defId: string; kind: 'door' | 'window'; wallId: string; span: number; flip: boolean } | null;
  /** Outlines and tints a room of the active level (hover is light, selected stronger); null clears it. Build mode only. */
  highlightRoom(uid: string | null, style?: 'hover' | 'selected'): void;

  // ---- camera and view ----
  // All screen coordinates are canvas-relative CSS pixels. pan(dx, dy) receives the pointer movement and the
  // content follows the finger (keyboard "pan right" sends a negative dx). zoomAt(factor > 1) zooms in around
  // the given point. mood().value ranges about -100..100; reasons carry signed numbers, e.g. "Lonely (-12)".
  view: {
    /** `cycle`: a repeated tap at the same spot steps through people standing together (taps only, not hover). */
    pick(screenX: number, screenY: number, opts?: { cycle?: boolean }): PickResult;
    /** Ground-plane point under a screen point in lot tile units (not snapped), for BuildTarget; null off the ground. */
    groundPoint(screenX: number, screenY: number): { x: number; z: number } | null;
    pan(dxPixels: number, dyPixels: number): void;
    zoomAt(factor: number, screenX: number, screenY: number): void;
    rotate(dir: 1 | -1): void;
    cutaway(): CutawayMode;
    setCutaway(mode: CutawayMode): void;
    /** Milestone 9: roofs shown or hidden (the camera bar's Roof toggle). Roofs only draw with the walls up or while a roof tool is open. Optional so mocks stay valid. */
    roofsVisible?(): boolean;
    setRoofsVisible?(on: boolean): void;
    /** A roof tool is open: roofs show whatever the wall mode is. */
    setRoofEdit?(on: boolean): void;
    focusPerson(personId: Id): void;
    /**
     * Milestone 9 (optional: the dev mocks omit them). The floor being viewed and worked on (0-2): floors above it are hidden,
     * the cutaway, picking, build tools, placement and the camera plane follow it. `levels().count` is the number of floors in
     * use; Build mode may also open the next, empty one (up to `max`). Following or selecting a person on another floor switches it.
     */
    level?(): number;
    setLevel?(level: number): void;
    levels?(): { count: number; max: number };
    /** Eases the camera to a picked person, object or item if it is off-screen, hidden behind panels or small. */
    reveal(pick: PickResult): void;
    /** Screen position (CSS px, relative to the canvas) of a world point. */
    worldToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean };
    /** Anchor above a person's head or on top of an object, for menus. */
    anchorOf(pick: PickResult): { x: number; y: number; visible: boolean } | null;
    /** Screen area covered by UI panels, so the camera keeps the focus visible. */
    setInsets(insets: { left: number; right: number; top: number; bottom: number }): void;
  };

  /** Cached data-URL portrait of a person; null until rendered (then onChange('portraits')). */
  portrait(personId: Id): string | null;
  thumbnails: {
    furniture(defId: string): string;
    surface(kind: 'wall' | 'floor', designId: string, paletteId: string): string;
    /** Door or window picture; '' until rendered (the game then reports onChange('thumbnails')). */
    opening(defId: string): string;
  };

  // ---- settings, sound, diagnostics ----
  settings(): GameSettings;
  setSettings(patch: Partial<GameSettings>): void;
  /** World simulation settings stored in the save (autonomy, visitors, ...). No-op without a game. */
  setSimSettings(patch: Partial<SimSettings>): void;
  sound(id: SoundId): void;
  devStats(): DevStats;
}
