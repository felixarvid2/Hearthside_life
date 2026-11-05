// Game: implements GameAPI (src/game/api.ts) by composing GameCore (pure state, simulation, tools, saves)
// with GameView (three.js rendering, camera, picking, previews, portraits). Screen-space methods go through
// the view's picking; everything that changes the world goes through GameCore. Also owns the main loop,
// player settings (localStorage), sound, thumbnails, portraits and the main-menu backdrop.

import { loadCharacterAssets, stageBodyAvailable } from '../characters/assets';
import { NEIGHBOR_HOUSEHOLD, setStageBodyAvailability } from '../characters/creator';
import { outfitFor } from '../characters/outfits';
import type { ContentDB, OpeningDef } from '../content/types';
import type { Speed } from '../core/clock';
import type { HouseholdDraft, PersonDraft } from '../core/drafts';
import type { EventBus } from '../core/events';
import { rotatedSize } from '../core/geometry';
import type { Tile } from '../core/nav';
import type { Cents, FinishRef, Id, SimSettings, StartMode, Wardrobe, WorldState } from '../core/types';
import { DEFAULT_PPM } from '../render/cameraRig';
import { GameView } from '../render/gameView';
import { portraitKey } from '../render/portraits';
import { hasWebGL2 } from '../render/renderer';
import { surfaceThumbnail } from '../render/textures/surfaceTextures';
import { resolveSlots } from '../world/slots';
import { DEFAULT_WALL_HEIGHT } from '../world/walls';
import type {
  BuildApplyResult, BuildPreview, BuildTarget, BuildTool, CreatorPreviewOptions, CutawayMode, DevStats, GameAPI, GameMode, GameSettings,
  AdoptionPreview, AdoptionSpec, FamilyInfo, MenuOption, MovePreview, NeighbourhoodInfo, SplitPreview, SplitTarget, PaintPreview, PaintTool, PersonPlace, PickResult, PlacementState, PlanEventRequest, Result, RoomInfo,
  SaveSlotInfo, SoundId, SwitchPreview, UiChange,
} from './api';
import { GameAudio } from './audio';
import type { GameCore } from './GameCore';
import { createNewWorld } from './newWorld';
import { applyDocumentSettings, loadSettings, mergeSettings, saveSettings } from './settings';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement | null;
  /** Base URL of the runtime assets (default './assets/'). */
  assetBase?: string;
}

type WorldMode = 'live' | 'buy' | 'build';
const isWorldMode = (m: GameMode): m is WorldMode => m === 'live' || m === 'buy' || m === 'build';

export class Game implements GameAPI {
  readonly content: ContentDB;
  readonly events: EventBus;
  readonly view: GameAPI['view'];
  readonly creator: GameAPI['creator'];
  readonly thumbnails: GameAPI['thumbnails'];
  /** The renderer half (exposed for tests and developer tools). */
  readonly gameView: GameView;
  private readonly listeners = new Set<(what: UiChange) => void>();
  private settingsValue: GameSettings;
  private readonly audio: GameAudio;
  private readonly assetBase: string;
  private demo: WorldState | null = null;
  private creatorReturn: GameMode = 'menu';
  private lastPreview: PaintPreview | null = null;
  private loaded = false;
  private raf = 0;
  private lastTime = 0;
  private fps = 60;
  private frameMs = 16;
  private framedWorld: WorldState | null = null;
  private running = false;
  private readonly portraitPending = new Set<string>();
  private readonly cleanups: Array<() => void> = [];

  constructor(readonly core: GameCore, opts: GameOptions) {
    this.content = core.content;
    this.events = core.events;
    // The creator offers the life stages whose bodies exist (Milestone 8).
    setStageBodyAvailability(stageBodyAvailable);
    this.assetBase = opts.assetBase ?? './assets/';
    this.settingsValue = loadSettings();
    applyDocumentSettings(this.settingsValue);
    this.audio = new GameAudio(this.assetBase, this.settingsValue);
    const s = this.settingsValue;
    this.gameView = new GameView(opts.canvas, this.content, opts.overlay, { quality: s.quality, shadows: s.shadows, reducedMotion: s.reducedMotion, weatherEffects: s.weatherEffects, actionProgress: s.actionProgress }, this.assetBase);
    this.gameView.onCamera = () => this.emit('camera');
    this.view = this.makeViewApi();
    this.creator = this.makeCreatorApi();
    this.thumbnails = {
      furniture: (defId) => {
        const def = this.content.objects[defId];
        return def ? this.gameView.objectAssets.thumbUrl(def.model.asset) : '';
      },
      surface: (kind, designId, paletteId) => {
        const d = kind === 'wall' ? this.content.wallDesigns[designId] : this.content.floorDesigns[designId];
        if (!d) return '';
        try { return surfaceThumbnail(d, paletteId, 96); } catch { return ''; }
      },
      opening: (defId) => this.gameView.openingThumbs.request(defId),
    };
    this.gameView.openingThumbs.onReady = () => this.emit('thumbnails');
    this.gameView.onSurfaceMaps = () => this.emit('thumbnails');
    this.cleanups.push(core.onChange((w) => this.onCoreChange(w)));
    this.cleanups.push(core.events.onAny((e) => {
      const v = this.gameView;
      const live = v.displayed !== null && v.displayed === core.state();
      switch (e.type) {
        case 'state.replaced':
          if (isWorldMode(core.mode())) this.showCoreWorld(true);
          this.portraitPending.clear();
          break;
        case 'lot.activated':
          // another lot is in detail now: show it and frame it
          if (isWorldMode(core.mode())) { this.framedWorld = null; this.roomHighlight = null; this.showCoreWorld(false); }
          break;
        case 'lot.changed': if (live) { v.lotChanged(e.what); if (this.roomHighlight) this.drawRoomHighlight(); } break;
        case 'item.changed': if (live) v.itemsChanged(); break;
        case 'object.changed': if (live) v.objectConditionChanged(); break;
        case 'person.changed':
          if (live && (e.what === 'appearance' || e.what === 'outfit' || e.what === 'all')) v.personChanged(e.personId);
          if (e.what === 'appearance' || e.what === 'all') this.emit('portraits');
          break;
        case 'social': if (live) v.say(e.actorId, e.line); break;
        default: break;
      }
    }));
    const onVis = () => {
      if (document.hidden) { void this.core.autosave().catch(() => undefined); }
      else { this.core.resetAccumulator(); this.lastTime = performance.now(); }
    };
    document.addEventListener('visibilitychange', onVis);
    const onHide = () => { void this.core.autosave().catch(() => undefined); };
    window.addEventListener('pagehide', onHide);
    this.cleanups.push(() => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', onHide); });
    this.start();
  }

  static webgl2Available(): boolean { return hasWebGL2(); }

  // ---------------------------------------------------------------------------------------------
  // Loading and the main loop
  // ---------------------------------------------------------------------------------------------

  /** Loads models and character assets. Progress 0..1. */
  async load(onProgress?: (p: number, label: string) => void): Promise<void> {
    const v = this.gameView;
    onProgress?.(0.02, 'Reading the catalogue');
    await v.objectAssets.loadManifest();
    const assets = new Set<string>();
    for (const d of Object.values(this.content.objects)) if (d.status === 'ready') assets.add(d.model.asset);
    let furn = 0, chars = 0;
    const report = () => onProgress?.(0.05 + 0.9 * (furn * 0.5 + chars * 0.5), 'Furnishing the house');
    const [characterAssets] = await Promise.all([
      loadCharacterAssets(this.assetBase, this.settingsValue.characterStyle).then((a) => { chars = 1; report(); return a; }),
      v.objectAssets.preload(assets, (d, t) => { furn = d / t; report(); }),
    ]);
    v.setCharacterAssets(characterAssets);
    this.loaded = true;
    onProgress?.(1, 'Ready');
  }

  get isLoaded(): boolean { return this.loaded; }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      if (document.hidden) { this.lastTime = now; return; }
      const dt = Math.max(0, Math.min(0.25, (now - this.lastTime) / 1000));
      this.lastTime = now;
      this.step(dt);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** One frame: simulation (fixed ticks), then rendering with interpolation. Exposed for tests. */
  step(dt: number): void {
    const t0 = performance.now();
    let alpha = 1;
    try {
      const r = this.core.update(dt);
      alpha = r.alpha;
      if (r.ticks > 0) this.gameView.onTicks();
    } catch (e) {
      console.error('[game] simulation error', e);
    }
    try {
      this.gameView.render(this.core.mode(), dt, alpha);
    } catch (e) {
      console.error('[game] render error', e);
    }
    const ms = performance.now() - t0;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.1;
    this.frameMs += (ms - this.frameMs) * 0.1;
  }

  /** Runs simulation ticks right now (tests, developer tools) and lets the view follow. */
  advanceTicks(n: number): void {
    this.core.advanceTicks(n);
    this.gameView.onTicks();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.running = false;
    for (const fn of this.cleanups.splice(0)) fn();
    this.audio.dispose();
    this.gameView.dispose();
  }

  // ---------------------------------------------------------------------------------------------
  // Change notifications
  // ---------------------------------------------------------------------------------------------

  onChange(fn: (what: UiChange) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit(what: UiChange): void { for (const fn of [...this.listeners]) fn(what); }

  private onCoreChange(what: UiChange): void {
    const v = this.gameView;
    switch (what) {
      case 'mode': this.onModeChanged(); break;
      case 'selection': {
        v.setSelected(this.core.selected());
        const so = this.core.mode() === 'buy' ? this.core.selectedObject() : null;
        v.setObjectHighlight(so);
        // a newly selected object that is small or off-screen: bring it into view
        if (so !== this.revealedObject) { this.revealedObject = so; if (so) v.reveal({ kind: 'object', objectId: so }); }
        break;
      }
      case 'placement': {
        const p = this.core.placement();
        v.setPlacement(p);
        // a new placement (not a ghost nudge): bring the ghost into view
        const key = p ? `${p.source}|${p.defId}|${p.objectId}|${p.inventoryIndex}` : '';
        if (key !== this.placementKey) { this.placementKey = key; if (p) v.reveal(p); }
        break;
      }
      case 'paint': this.refreshPaintPreview(); break;
      case 'build': this.refreshBuildPreview(); break;
      default: break;
    }
    this.emit(what);
  }

  private placementKey = '';
  private revealedObject: Id | null = null;

  private onModeChanged(): void {
    const m = this.core.mode();
    const v = this.gameView;
    if (m !== 'creator') v.creatorScene?.hide();
    if (m === 'menu') {
      v.setWorld(this.demoWorld());
      v.setCutaway('cutaway');
      v.setOrbit(true);
      v.rig.setYawStep(0);
      v.frameLot(true);
    } else if (isWorldMode(m)) {
      v.setOrbit(false);
      this.showCoreWorld(false);
    }
    v.setObjectHighlight(m === 'buy' ? this.core.selectedObject() : null);
    if (m !== 'buy') v.setPlacement(null);
    if (m !== 'build') { this.lastPreview = null; v.setPaintPreview(null, null, true); this.roomHighlight = null; }
    v.setBuildGrid(m === 'build');
  }

  /** Shows the core's world; frames the house when the world is new to the view. */
  private showCoreWorld(force: boolean): void {
    const v = this.gameView;
    const st = this.core.state();
    v.setWorld(st, force);
    v.setSelected(this.core.selected());
    if (st && this.framedWorld !== st) {
      this.framedWorld = st;
      v.rig.setYawStep(0);
      v.frameLot(true);
      // close on the selected person (else on whoever of the household is home), not on the whole lot
      const members = st.households[st.activeHouseholdId]?.memberIds ?? [];
      const sel = this.core.selected();
      const p = [sel, ...members].map((id) => (id ? v.personPosition(id) : null)).find((q) => q !== null && q !== undefined);
      if (p) v.rig.glideTo(p.x, p.z, DEFAULT_PPM, 0);
    }
  }

  private refreshPaintPreview(): void {
    const tool = this.core.paintTool();
    const h = this.core.paintPreviewTarget();
    const finish = tool && tool.kind !== 'eyedropper' ? tool.finish : null;
    this.gameView.setPaintPreview(h, finish, this.lastPreview?.ok ?? true);
  }

  /** Draws the build tool's preview (ghost walls, tiles, openings, conflicts) for the current highlight. */
  private refreshBuildPreview(): void {
    const hl = this.core.buildHighlight();
    const tool = this.core.buildTool();
    const lot = this.core.state()?.lots[this.core.state()?.activeLotId ?? ''];
    const openings: Array<{ def: OpeningDef; flip: boolean }> = [];
    if (tool?.kind === 'opening') {
      const def = this.content.openings[tool.defId];
      if (def) openings.push({ def, flip: !!tool.flip });
    } else if (tool?.kind === 'moveOpening' && tool.openingId) {
      const o = lot?.openings[tool.openingId];
      const def = o ? this.content.openings[o.defId] : undefined;
      if (o && def) openings.push({ def, flip: tool.flip ?? o.flip });
    } else if (tool?.kind === 'room') {
      for (const d of tool.doors ?? []) { const def = this.content.openings[d.defId]; if (def) openings.push({ def, flip: false }); }
    }
    this.gameView.setBuildPreview(hl?.highlight ?? null, hl?.ok ?? true, {
      wallHeight: (tool?.kind === 'wall' || tool?.kind === 'room') && tool.spec?.height ? tool.spec.height : DEFAULT_WALL_HEIGHT,
      tileMode: tool?.kind === 'eraseFloor' || tool?.kind === 'deleteRoom' || tool?.kind === 'eraseStairs' ? 'remove' : 'add',
      openings,
    });
  }

  private roomHighlight: { uid: string; style: 'hover' | 'selected' } | null = null;

  private drawRoomHighlight(): void {
    const h = this.roomHighlight;
    const room = h ? this.core.rooms(this.gameView.getActiveLevel()).find((r) => r.uid === h.uid) : undefined;
    this.gameView.setRoomOutline(room && h ? { outlines: room.outlines, tiles: room.tiles } : null, h?.style ?? 'hover');
  }

  /** A throwaway furnished starter house for the main-menu backdrop (never saved). */
  private demoWorld(): WorldState | null {
    if (this.demo) return this.demo;
    try {
      const household = [...this.core.premadeHouseholds()].sort((a, b) => b.members.length - a.members.length)[0];
      if (!household) return null;
      const w = createNewWorld(this.content, { seed: 20261031, mode: 'guided', household, neighbor: NEIGHBOR_HOUSEHOLD(this.content) });
      w.clock.minutes = 16 * 60 + 40; // warm late afternoon
      const lot = w.lots[w.activeLotId]!;
      const members = w.households[w.activeHouseholdId]?.memberIds ?? [];
      const spots: Array<{ defId: string; slot: number; anim: string; posture: 'seated' | 'standing' }> = [
        { defId: 'sofa-tweed', slot: 0, anim: 'sitIdle', posture: 'seated' },
        { defId: 'chair-dining-oak', slot: 0, anim: 'sitTalk', posture: 'seated' },
        { defId: 'armchair-lounge', slot: 0, anim: 'sitIdle', posture: 'seated' },
      ];
      members.forEach((id, i) => {
        const p = w.people[id];
        const spot = spots[i];
        if (!p || !spot) return;
        const obj = Object.values(lot.objects).find((o) => o.defId === spot.defId);
        const def = obj ? this.content.objects[obj.defId] : undefined;
        const s = obj && def ? resolveSlots(lot, obj, def)[spot.slot] : undefined;
        if (!s) return;
        p.location = { kind: 'lot', lotId: lot.id, level: 0, x: s.x, z: s.z, facing: s.facing, posture: spot.posture };
        p.anim = { id: spot.anim, since: 0, loop: true };
      });
      this.demo = w;
    } catch (e) {
      console.warn('[game] menu backdrop unavailable', e);
      this.demo = null;
    }
    return this.demo;
  }

  // ---------------------------------------------------------------------------------------------
  // State and flow
  // ---------------------------------------------------------------------------------------------

  state(): WorldState | null { return this.core.state(); }
  mode(): GameMode { return this.core.mode(); }

  showMenu(): void {
    if (this.core.mode() === 'menu') { this.onModeChanged(); return; }
    this.core.setMode('menu');
  }

  startNewGame(mode: StartMode, draft: HouseholdDraft): Promise<Result> {
    try {
      return Promise.resolve(this.core.startNewGame(mode, draft));
    } catch (e) {
      return Promise.resolve({ ok: false, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  premadeHouseholds(): HouseholdDraft[] { return this.core.premadeHouseholds(); }

  // ---- creator preview ----

  private makeCreatorApi(): GameAPI['creator'] {
    return {
      show: (person: PersonDraft, opts: CreatorPreviewOptions) => {
        const scene = this.gameView.creatorScene;
        if (this.core.mode() !== 'creator') {
          const m = this.core.mode();
          this.creatorReturn = m === 'creator' || m === 'boot' ? 'menu' : m;
          this.core.setMode('creator');
          scene?.setView('front');
        }
        try { scene?.show(person, opts); } catch (e) { console.warn('[game] creator preview failed', e); }
        this.emit('creator');
      },
      setView: (view) => { this.gameView.creatorScene?.setView(view); this.emit('creator'); },
      rotate: (d) => this.gameView.creatorScene?.rotate(d),
      zoom: (f) => this.gameView.creatorScene?.zoom(f),
      hide: () => {
        this.gameView.creatorScene?.hide();
        if (this.core.mode() !== 'creator') return;
        let back = this.creatorReturn;
        if (isWorldMode(back) && !this.core.state()) back = 'menu';
        this.core.setMode(back);
        this.emit('creator');
      },
      portrait: (person: PersonDraft) => {
        const pr = this.gameView.portraitRenderer;
        if (!pr) return Promise.resolve('');
        return pr.request(person.appearance, outfitFor(person, 'everyday'), person.lifeStage);
      },
    };
  }

  // ---- saves ----

  listSaves(): Promise<SaveSlotInfo[]> { return this.core.listSaves(); }
  latestSave(): Promise<SaveSlotInfo | null> { return this.core.latestSave(); }
  saveTo(slotId: string, name: string): Promise<Result> { return this.core.saveTo(slotId, name); }
  loadFrom(slotId: string): Promise<Result & { report?: string[] }> { return this.core.loadFrom(slotId); }
  deleteSave(slotId: string): Promise<Result> { return this.core.deleteSave(slotId); }
  exportWorld(): string | null { return this.core.exportWorld(); }
  importWorld(json: string): Promise<Result & { report?: string[] }> { return this.core.importWorld(json); }

  // ---- time ----

  speed(): Speed { return this.core.speed(); }
  setSpeed(s: Speed): void { this.core.setSpeed(s); }
  togglePause(): void { this.core.togglePause(); }

  // ---- live mode ----

  selected(): Id | null { return this.core.selected(); }
  select(personId: Id | null): void {
    this.core.select(personId);
    // Milestone 9: selecting somebody on another floor brings that floor into view
    const level = personId ? this.gameView.personLevel(personId) : null;
    if (level !== null && level !== this.gameView.getActiveLevel() && this.core.mode() === 'live') this.setLevel(level);
  }
  options(personId: Id, pick: PickResult): MenuOption[] { return this.core.options(personId, pick); }
  queue(personId: Id, option: MenuOption): Result { return this.core.queue(personId, option); }
  goTo(personId: Id, tile: Tile): Result { return this.core.goTo(personId, tile); }
  cancel(personId: Id, actionId: Id): void { this.core.cancel(personId, actionId); }
  reorder(personId: Id, actionId: Id, toIndex: number): void { this.core.reorder(personId, actionId, toIndex); }
  mood(personId: Id): { value: number; label: string; reasons: string[] } { return this.core.mood(personId); }
  updateWardrobe(personId: Id, wardrobe: Wardrobe): Result { return this.core.updateWardrobe(personId, wardrobe); }
  eventProblem(req: PlanEventRequest): string | null { return this.core.eventProblem(req); }
  planEvent(req: PlanEventRequest): Result & { eventId?: Id } { return this.core.planEvent(req); }
  cancelEvent(eventId: Id): Result { return this.core.cancelEvent(eventId); }

  // ---- careers and household economy (Milestone 6) ----

  payBill(personId: Id, billId: Id): Result & { amount?: number } { return this.core.payBill(personId, billId); }
  setAutoPayBills(personId: Id, on: boolean): Result { return this.core.setAutoPayBills(personId, on); }
  joinCareer(personId: Id, careerId: string): Result { return this.core.joinCareer(personId, careerId); }
  quitCareer(personId: Id): Result { return this.core.quitCareer(personId); }
  setCareerEffort(personId: Id, effort: 'slack' | 'normal' | 'hard'): Result { return this.core.setCareerEffort(personId, effort); }
  resolveCareerEvent(personId: Id, optionId: string): Result { return this.core.resolveCareerEvent(personId, optionId); }

  // ---- neighbourhood and other households (Milestone 7) ----

  neighbourhood(): NeighbourhoodInfo | null { return this.core.neighbourhood(); }
  whereIs(personId: Id): PersonPlace | null { return this.core.whereIs(personId); }
  travelProblem(personIds: Id[], lotId: Id): string | null { return this.core.travelProblem(personIds, lotId); }
  travel(personIds: Id[], lotId: Id): Result & { minutes?: number; arrivesAt?: number } { return this.core.travel(personIds, lotId); }
  goHome(personIds?: Id[]): Result & { minutes?: number; arrivesAt?: number } { return this.core.goHome(personIds); }
  inviteHome(hostId: Id, guestId: Id): Result { return this.core.inviteHome(hostId, guestId); }
  switchPreview(householdId: Id): SwitchPreview | null { return this.core.switchPreview(householdId); }
  switchHousehold(householdId: Id): Result { return this.core.switchHousehold(householdId); }
  movePreview(lotId: Id): MovePreview | null { return this.core.movePreview(lotId); }
  moveHousehold(lotId: Id): Result { return this.core.moveHousehold(lotId); }

  // ---- family and life stages (Milestone 8) ----

  family(personId: Id): FamilyInfo | null { return this.core.family(personId); }
  ageUpNow(personId: Id): Result { return this.core.ageUpNow(personId); }
  doHomework(personId: Id): Result { return this.core.doHomework(personId); }
  adoptPreview(adopterId: Id, spec: AdoptionSpec): AdoptionPreview | null { return this.core.adoptPreview(adopterId, spec); }
  adopt(adopterId: Id, spec: AdoptionSpec): Result & { personId?: Id } { return this.core.adopt(adopterId, spec); }
  splitPreview(personIds: Id[], target: SplitTarget): SplitPreview | null { return this.core.splitPreview(personIds, target); }
  splitHousehold(personIds: Id[], target: SplitTarget): Result & { householdId?: Id } { return this.core.splitHousehold(personIds, target); }

  setMode(m: 'live' | 'buy' | 'build'): void { this.core.setMode(m); }

  // ---- buy ----

  startPlacement(defId: string): Result { return this.onFloor(this.core.startPlacement(defId)); }
  startMove(objectId: Id): Result { return this.onFloor(this.core.startMove(objectId)); }
  startPlaceFromInventory(index: number): Result { return this.onFloor(this.core.startPlaceFromInventory(index)); }

  /** Milestone 9: a new placement starts on the floor being viewed. */
  private onFloor(r: Result): Result {
    if (r.ok) this.core.setPlacementLevel(this.gameView.getActiveLevel());
    return r;
  }
  placement(): PlacementState | null { return this.core.placement(); }

  placementAt(screenX: number, screenY: number): void {
    const p = this.core.placement();
    if (!p) return;
    const tile = this.gameView.tileAt(screenX, screenY);
    if (!tile) return;
    this.core.setPlacementLevel(this.gameView.getActiveLevel());
    const def = this.content.objects[p.defId];
    const size = def ? rotatedSize(def.footprint, p.rot) : { w: 1, d: 1 };
    this.core.placementTile(tile.x - Math.floor((size.w - 1) / 2), tile.z - Math.floor((size.d - 1) / 2));
  }

  rotatePlacement(dir?: 1 | -1): void { this.core.rotatePlacement(dir); }
  confirmPlacement(): Result & { objectId?: Id } { return this.core.confirmPlacement(); }
  cancelPlacement(): void { this.core.cancelPlacement(); }
  sell(objectId: Id): Result { return this.core.sell(objectId); }
  saleValue(objectId: Id): Cents { return this.core.saleValue(objectId); }
  store(objectId: Id): Result { return this.core.store(objectId); }
  setObjectFinish(objectId: Id, regionId: string, swatchId: string): Result { return this.core.setObjectFinish(objectId, regionId, swatchId); }
  selectObject(objectId: Id | null): void { this.core.selectObject(objectId); }
  selectedObject(): Id | null { return this.core.selectedObject(); }

  // ---- build ----

  setPaintTool(tool: PaintTool | null): void { this.lastPreview = null; this.core.setPaintTool(tool); }
  paintTool(): PaintTool | null { return this.core.paintTool(); }

  paintPreview(pick: PickResult | null): PaintPreview | null {
    const r = this.core.paintPreview(pick);
    const changed = (r?.ok ?? true) !== (this.lastPreview?.ok ?? true);
    this.lastPreview = r;
    if (changed) this.refreshPaintPreview();
    return r;
  }

  /** The most recent paintPreview result (the build panel shows its cost and reason). */
  lastPaintPreview(): PaintPreview | null { return this.lastPreview; }

  paintApply(pick: PickResult): Result { const r = this.core.paintApply(pick); if (r.ok) this.lastPreview = null; return r; }
  eyedrop(pick: PickResult): FinishRef | null { return this.core.eyedrop(pick); }
  recentFinishes(kind: 'wall' | 'floor'): FinishRef[] { return this.core.recentFinishes(kind); }
  undo(): string | null { return this.core.undo(); }
  redo(): string | null { return this.core.redo(); }
  canUndo(): boolean { return this.core.canUndo(); }
  canRedo(): boolean { return this.core.canRedo(); }

  // ---- build mode (structure) ----

  setBuildTool(tool: BuildTool | null): void { this.core.setBuildTool(tool); }
  buildTool(): BuildTool | null { return this.core.buildTool(); }
  buildPreview(target: BuildTarget | null): BuildPreview | null { return this.core.buildPreview(target); }
  buildApply(target: BuildTarget): Result & Partial<BuildApplyResult> { return this.core.buildApply(target); }
  buildCancel(): void { this.core.buildCancel(); }
  buildHighlight(): ReturnType<GameAPI['buildHighlight']> { return this.core.buildHighlight(); }
  rooms(level?: number): RoomInfo[] { return this.core.rooms(level); }
  roomAt(tile: Tile, level?: number): RoomInfo | null { return this.core.roomAt(tile, level); }
  openingAt(wallId: string): ReturnType<GameAPI['openingAt']> { return this.core.openingAt(wallId); }
  highlightRoom(uid: string | null, style: 'hover' | 'selected' = 'hover'): void {
    const next = uid && this.core.mode() === 'build' ? { uid, style } : null;
    if (next?.uid === this.roomHighlight?.uid && next?.style === this.roomHighlight?.style) return;
    this.roomHighlight = next;
    this.drawRoomHighlight();
  }

  // ---- camera and view ----

  /** Milestone 9: switches the floor being viewed and worked on (Build, Buy and Live). */
  private setLevel(level: number): void {
    const v = this.gameView;
    const from = v.getActiveLevel();
    v.setActiveLevel(level);
    if (v.getActiveLevel() === from) return;
    this.core.setPlacementLevel(v.getActiveLevel());
    this.emit('camera');
  }

  private makeViewApi(): GameAPI['view'] {
    const v = () => this.gameView;
    return {
      pick: (x, y, opts) => v().pick(x, y, this.core.mode(), opts?.cycle === true),
      groundPoint: (x, y) => v().groundPointAt(x, y),
      pan: (dx, dy) => { v().rig.pan(dx, dy); this.emit('camera'); },
      zoomAt: (f, x, y) => { v().rig.zoomAt(f, x, y); this.emit('camera'); },
      rotate: (dir) => { v().rig.rotate(dir === -1 ? -1 : 1); this.emit('camera'); },
      cutaway: () => v().getCutaway(),
      setCutaway: (m: CutawayMode) => {
        if (m !== 'up' && m !== 'cutaway' && m !== 'down') return;
        v().setCutaway(m);
        this.emit('camera');
      },
      roofsVisible: () => v().getRoofsVisible(),
      setRoofsVisible: (on: boolean) => { v().setRoofsVisible(on); this.emit('camera'); },
      setRoofEdit: (on: boolean) => { v().setRoofEdit(on); this.emit('camera'); },
      focusPerson: (id) => {
        const p = v().personPosition(id);
        const level = v().personLevel(id);
        if (level !== null) this.setLevel(level);
        if (p) v().focusOn(p.x, p.z, true);
        this.emit('camera');
      },
      level: () => v().getActiveLevel(),
      setLevel: (level) => this.setLevel(level),
      levels: () => ({ count: v().levelCount(), max: 3 }),
      worldToScreen: (x, y, z) => v().worldToScreen(x, y, z),
      reveal: (pick) => v().reveal(pick),
      anchorOf: (pick) => v().anchorOf(pick),
      setInsets: (i) => v().setInsets(i),
    };
  }

  // ---- portraits ----

  portrait(personId: Id): string | null {
    const p = this.core.state()?.people[personId];
    const pr = this.gameView.portraitRenderer;
    if (!p || !pr) return null;
    const outfit = outfitFor(p, 'everyday');
    const key = portraitKey(p.appearance, outfit, p.lifeStage);
    const hit = pr.cached(key);
    if (hit) return hit;
    if (!this.portraitPending.has(key)) {
      this.portraitPending.add(key);
      void pr.request(p.appearance, outfit, p.lifeStage).then((url) => {
        this.portraitPending.delete(key);
        if (url) this.emit('portraits');
      });
    }
    return null;
  }

  // ---- settings, sound, diagnostics ----

  settings(): GameSettings { return { ...this.settingsValue }; }

  setSettings(patch: Partial<GameSettings>): void {
    const next = mergeSettings(this.settingsValue, patch);
    if (JSON.stringify(next) === JSON.stringify(this.settingsValue)) return;
    const prev = this.settingsValue;
    this.settingsValue = next;
    saveSettings(next);
    applyDocumentSettings(next);
    this.audio.setSettings(next);
    this.gameView.applyOptions({ quality: next.quality, shadows: next.shadows, reducedMotion: next.reducedMotion, weatherEffects: next.weatherEffects, actionProgress: next.actionProgress });
    if (next.characterStyle !== prev.characterStyle) void this.gameView.setCharacterStyle(next.characterStyle).then(() => this.emit('portraits'), (e) => console.error('[game] character style', e));
    this.emit('settings');
  }

  setSimSettings(patch: Partial<SimSettings>): void { this.core.setSimSettings(patch); }

  sound(id: SoundId): void {
    try { this.audio.unlock(); this.audio.play(id); } catch { /* audio is optional */ }
  }

  devStats(): DevStats {
    const r = this.gameView.stats();
    const c = this.core.devStats();
    return {
      fps: Math.round(this.fps * 10) / 10,
      frameMs: Math.round(this.frameMs * 100) / 100,
      drawCalls: r.drawCalls,
      triangles: r.triangles,
      geometries: r.geometries,
      textures: r.textures,
      loadedAssets: this.gameView.objectAssets.loadedCount + (this.gameView.characterAssets ? 4 : 0),
      agents: c.agents,
      routeRequests: c.routeRequests,
      simTickMs: c.simTickMs,
      ticksPerFrame: c.ticksPerFrame,
    };
  }
}

