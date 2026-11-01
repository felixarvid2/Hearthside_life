// GameAPI - the only surface the HTML interface talks to. Implemented by src/game/Game.ts, which combines
// GameCore (pure: state, simulation, navigation, commands, saves, tool logic) with GameView (three.js:
// rendering, camera, picking, previews, portraits). The UI never imports three, sim internals or the DOM
// of the renderer; it reads state through state() and selectors, and changes it only through these methods.

import type { ContentDB } from '../content/types';
import type { Speed } from '../core/clock';
import type { HouseholdDraft, PersonDraft } from '../core/drafts';
import type { EventBus } from '../core/events';
import type { AnimId } from '../core/anim';
import type { Tile } from '../core/nav';
import type { Cents, FinishRef, Id, OutfitCategory, Rot, SimSettings, StartMode, Wardrobe, WorldState } from '../core/types';

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
  /** Opaque payload passed back to queue(). */
  token: unknown;
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

export interface GameSettings {
  masterVolume: number; // 0..1
  soundVolume: number;
  musicVolume: number;
  reducedMotion: boolean;
  textScale: number; // 0.9..1.3
  quality: 'low' | 'high';
  shadows: boolean;
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
  | 'mode' | 'selection' | 'speed' | 'placement' | 'paint' | 'undo' | 'camera' | 'settings' | 'state' | 'portraits' | 'creator';

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

  // ---- camera and view ----
  // All screen coordinates are canvas-relative CSS pixels. pan(dx, dy) receives the pointer movement and the
  // content follows the finger (keyboard "pan right" sends a negative dx). zoomAt(factor > 1) zooms in around
  // the given point. mood().value ranges about -100..100; reasons carry signed numbers, e.g. "Lonely (-12)".
  view: {
    pick(screenX: number, screenY: number): PickResult;
    pan(dxPixels: number, dyPixels: number): void;
    zoomAt(factor: number, screenX: number, screenY: number): void;
    rotate(dir: 1 | -1): void;
    cutaway(): CutawayMode;
    setCutaway(mode: CutawayMode): void;
    focusPerson(personId: Id): void;
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
  };

  // ---- settings, sound, diagnostics ----
  settings(): GameSettings;
  setSettings(patch: Partial<GameSettings>): void;
  /** World simulation settings stored in the save (autonomy, visitors, ...). No-op without a game. */
  setSimSettings(patch: Partial<SimSettings>): void;
  sound(id: SoundId): void;
  devStats(): DevStats;
}
