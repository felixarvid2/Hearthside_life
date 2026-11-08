// GameCore: the pure half of the game (no three.js, no DOM, no localStorage; runs in Node tests). It owns the
// authoritative WorldState, the simulation, navigation, the build/buy undo stack, saves and autosave, and the
// tool logic of Buy and Build mode with TILE inputs. Game.ts combines it with GameView (rendering, camera,
// picking) to implement GameAPI (src/game/api.ts); screen coordinates never reach this class.
//
// Rules kept here:
// - Money only changes through commands and transact(); previews (placement, paint) only read the state.
// - Buy and Build pause the simulation; returning to live restores the speed. Leaving Buy cancels the
//   placement, leaving Build clears the paint tool and its preview, leaving the edit modes clears undo/redo.
// - Autosave: every 5 real minutes in live mode and 3 s after a confirmed build/buy command, never while a
//   placement or paint preview is active (persistence Autosaver with timers driven by update()).

import { saleValue as saleValueOf, supportBlockReason } from '../building/plans';
import { sellObject, setObjectFinish as setObjectFinishCommand, storeObject } from '../building/commands';
import { migrateModularLook } from '../characters/modular/look';
import type { ModularLook } from '../characters/modular/types';
import { premadeHouseholds as buildPremades, NEIGHBOR_HOUSEHOLD, validateHousehold, validateWardrobe } from '../characters/creator';
import type { ContentDB } from '../content/types';
import { TickAccumulator, type Speed } from '../core/clock';
import { UndoStack, type CommandContext, type UndoableCommand } from '../core/commands';
import type { HouseholdDraft } from '../core/drafts';
import { EventBus } from '../core/events';
import type { Tile } from '../core/nav';
import { createEmptyWorld } from '../core/state';
import { MAX_STAGE_DAYS, MIN_STAGE_DAYS, STAGE_ORDER } from '../core/lifeStages';
import type { FinishRef, Household, Id, LifeStage, Lot, SimSettings, StartMode, Wardrobe, WorldState } from '../core/types';
import { describeReport, exportWorld as exportWorldJson, importWorld as importWorldJson, type SaveStore } from '../persistence/index';
import { isManualSlot, isSlotId } from '../persistence/types';
import type { AdoptionPreview, AdoptionSpec } from '../sim/adoption';
import type { FamilyInfo } from '../sim/familyView';
import type { GiftChoice } from '../sim/gifts';
import type { MoveOptions, MovePreview, SwitchPreview } from '../sim/households';
import type { SplitPreview, SplitTarget } from '../sim/split';
import type { NeighbourhoodInfo } from '../sim/neighbourhoodView';
import type { PersonPlace } from '../sim/places';
import { Simulation } from '../sim/simulation';
import { LotNav } from '../world/nav';
import type {
  BuildApplyResult, BuildPreview, BuildTarget, BuildTool, DevStats, GameMode, MenuOption, PaintPreview, PaintTool, PickResult,
  PlacementState, PlanEventRequest, Result, RoomInfo, SaveSlotInfo, UiChange,
} from './api';
import { AutosavePolicy } from './core/autosave';
import { BuildTools } from './core/build';
import { readToken, targetForPick, toMenuOption } from './core/menu';
import { evaluatePaint, finishAt, paintCommand, paintTargetFor, sameFinish, type PaintHighlight } from './core/paint';
import { evaluatePlacement, isUnchangedMove, placementCommand } from './core/placement';
import { emptySlots, NO_STORAGE, toSlotInfo } from './core/saves';
import { createNewWorld } from './newWorld';
import { ensureNeighbourhood, ensureTownChildren } from './neighbourhood';

export type { PaintHighlight } from './core/paint';

export interface GameCoreOptions {
  content: ContentDB;
  /** Open save store (SaveStore.open(...)); null when the game runs without storage. */
  saves: SaveStore | null;
  /** ISO time for exports (default: the system clock). */
  now?: () => string;
  /** Real milliseconds after a confirmed build/buy command before the autosave (default 3000). */
  autosaveDelayMs?: number;
  /** Real minutes of live mode between periodic autosaves (default 5). */
  autosaveEveryMinutes?: number;
}

const OK: Result = { ok: true };
const fail = (reason: string): Result => ({ ok: false, reason });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** Speed stored in a loaded world; worlds saved before speed was stored (or with a bad value) load paused. */
const loadedSpeed = (s: WorldState): Speed => { const v = s.settings.speed; return v === 1 || v === 2 || v === 3 ? v : 0; };
const isEditMode = (m: GameMode) => m === 'buy' || m === 'build';
const RECENT_LIMIT = 8;
const START_MODES: readonly StartMode[] = ['guided', 'create', 'sandbox'];

interface EditContext { state: WorldState; lot: Lot; hh: Household }

export class GameCore {
  readonly content: ContentDB;
  readonly events = new EventBus();

  private world: WorldState | null = null;
  private readonly placeholder: WorldState = createEmptyWorld(0, 'guided');
  private readonly nav: LotNav;
  private readonly sim: Simulation;
  private readonly saves: SaveStore | null;
  private readonly now: () => string;
  private readonly undoStack = new UndoStack();
  private readonly accumulator = new TickAccumulator();
  private readonly autosaves: AutosavePolicy;
  private readonly listeners = new Set<(what: UiChange) => void>();
  private readonly buildTools: BuildTools;

  private currentMode: GameMode = 'boot';
  private spd: Speed = 1;
  private lastRunning: Speed = 1;
  private lastTicks = 0;
  private sel: Id | null = null;
  private selObj: Id | null = null;
  private place: PlacementState | null = null;
  private lastTile: Tile | null = null;
  private tool: PaintTool | null = null;
  private highlight: PaintHighlight | null = null;
  private readonly scopes: { wall: 'side' | 'room'; floor: 'tile' | 'room' } = { wall: 'side', floor: 'tile' };
  private readonly recent: { wall: FinishRef[]; floor: FinishRef[] } = { wall: [], floor: [] };

  constructor(o: GameCoreOptions) {
    this.content = o.content;
    this.saves = o.saves;
    this.now = o.now ?? (() => new Date().toISOString());
    const getState = () => this.world ?? this.placeholder;
    this.nav = new LotNav(getState, o.content, this.events);
    this.sim = new Simulation({ getState, content: o.content, nav: this.nav, events: this.events });
    this.buildTools = new BuildTools({
      content: o.content,
      events: this.events,
      world: () => this.world,
      run: (cmd) => { const w = this.world; return w ? this.runCommand(w, cmd) : fail('No game is running.'); },
      blocked: () => (this.world ? (this.currentMode === 'build' ? null : 'Open Build mode first.') : 'No game is running.'),
      changed: () => { this.notify('build'); },
    });
    this.events.on('lot.activated', () => {
      // The people the player controls are where the lot is now; keep a selected person who is on it.
      const w = this.world;
      const members = w?.households[w.activeHouseholdId]?.memberIds ?? [];
      const onLot = members.find((id) => w?.people[id]?.location.kind === 'lot');
      const selOnLot = this.sel !== null && w?.people[this.sel]?.location.kind === 'lot';
      if (!selOnLot && onLot && onLot !== this.sel) { this.sel = onLot; this.notify('selection'); }
      this.notify('lot');
      this.notify('neighbourhood');
      this.notify('state');
      this.autosaves.request();
    });
    for (const type of ['travel', 'household.switched', 'household.moved', 'family'] as const) {
      this.events.on(type, () => { this.notify('neighbourhood'); this.notify('state'); });
    }
    for (const type of ['birthday', 'school', 'care'] as const) this.events.on(type, () => { this.notify('state'); });
    // A person who passed away (or left) while selected: select somebody else from the household.
    this.events.on('person.removed', (e) => {
      if (this.sel !== e.personId) return;
      const w = this.world;
      const members = w?.households[w.activeHouseholdId]?.memberIds ?? [];
      this.sel = members.find((id) => id !== e.personId && w?.people[id]?.location.kind === 'lot') ?? members.find((id) => id !== e.personId) ?? null;
      this.notify('selection');
    });
    this.autosaves = new AutosavePolicy({
      saves: o.saves,
      getState: () => this.world,
      isBusy: () => this.place !== null || this.highlight !== null || this.buildTools.active(),
      delayMs: o.autosaveDelayMs ?? 3000,
      everySeconds: (o.autosaveEveryMinutes ?? 5) * 60,
      onError: (text) => this.events.emit({ type: 'notify', kind: 'warning', text }),
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Change notifications, state, modes
  // ---------------------------------------------------------------------------------------------

  onChange(fn: (what: UiChange) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private notify(what: UiChange): void { for (const fn of [...this.listeners]) fn(what); }

  /** Current world, or null before a game is started or loaded. Treat as read-only. */
  state(): WorldState | null { return this.world; }

  mode(): GameMode { return this.currentMode; }

  /**
   * Switches mode. live/buy/build need a world. Buy and Build pause the simulation (speed() reads 0) and
   * returning to live restores the previous speed. Leaving Buy cancels the placement and the object
   * selection; leaving Build clears the paint tool and preview; leaving the edit modes clears undo/redo.
   */
  setMode(m: GameMode): void {
    const prev = this.currentMode;
    if (m === prev) return;
    if ((m === 'live' || isEditMode(m)) && !this.world) return;
    if (prev === 'buy') {
      this.cancelPlacement();
      if (this.selObj !== null) { this.selObj = null; this.notify('selection'); }
    }
    if (prev === 'build') { this.clearPaint(); this.buildTools.clear(); }
    if (isEditMode(prev) && !isEditMode(m) && (this.undoStack.canUndo() || this.undoStack.canRedo())) {
      this.undoStack.clear();
      this.notify('undo');
    }
    this.currentMode = m;
    if (m === 'live') this.accumulator.reset();
    if (isEditMode(prev) !== isEditMode(m) && this.spd !== 0) this.notify('speed');
    this.notify('mode');
  }

  /** Premade households for Guided Start ([0]) and the creator's presets (the neighbours are not included). */
  premadeHouseholds(): HouseholdDraft[] { return buildPremades(this.content); }

  /**
   * Starts a new game: validates the draft, builds the world (starter home, neighbours, funds, first visit)
   * and enters live mode at normal speed with the first member selected.
   */
  startNewGame(mode: StartMode, draft: HouseholdDraft, seed?: number): Result {
    if (!START_MODES.includes(mode)) return fail('Unknown start mode.');
    if (!draft || !Array.isArray(draft.members) || draft.members.length === 0) return fail('The household has no members.');
    const issues = validateHousehold(draft, this.content);
    if (issues.length > 0) return fail(issues[0]!);
    let state: WorldState;
    try {
      state = createNewWorld(this.content, {
        seed: seed ?? Math.floor(Math.random() * 0x7fffffff), mode, household: draft, neighbor: NEIGHBOR_HOUSEHOLD(this.content),
      });
    } catch (e) {
      return fail(`The new world could not be created: ${e instanceof Error ? e.message : String(e)}`);
    }
    this.enterWorld(state);
    return OK;
  }

  /**
   * Replaces the world (new game, load, import): rebuilds the simulation runtime and navigation, clears undo,
   * previews and selections, and emits state.replaced. The mode is unchanged.
   */
  replaceState(state: WorldState): void {
    // Saves from before Milestone 7 have no neighbourhood: generate it (deterministically, once) around what exists.
    ensureNeighbourhood(state, this.content);
    // Saves from before the town had children: the households that should have some get them now (ids of everyone else stay).
    ensureTownChildren(state, this.content);
    this.world = state;
    this.place = null;
    this.tool = null;
    this.highlight = null;
    this.buildTools.reset();
    this.selObj = null;
    this.undoStack.clear();
    this.accumulator.reset();
    this.nav.invalidateAll();
    this.events.emit({ type: 'state.replaced' });
    this.sim.rebuild();
    this.autosaves.reset(state.clock.minutes);
    const members = state.households[state.activeHouseholdId]?.memberIds ?? [];
    if (this.sel === null || !members.includes(this.sel)) this.sel = members[0] ?? null;
    for (const w of ['state', 'selection', 'placement', 'paint', 'build', 'undo'] as const) this.notify(w);
  }

  /** `speed`: where the clock starts (a new game runs at Normal; a loaded or imported world resumes `loadedSpeed`). */
  private enterWorld(state: WorldState, speed: Speed = 1): void {
    this.sel = null;
    this.replaceState(state);
    this.spd = speed;
    this.lastRunning = speed === 0 ? 1 : speed;
    state.settings.speed = speed;
    this.setMode('live');
    this.notify('speed');
  }

  // ---------------------------------------------------------------------------------------------
  // Saves
  // ---------------------------------------------------------------------------------------------

  async listSaves(): Promise<SaveSlotInfo[]> {
    if (!this.saves) return emptySlots();
    return (await this.saves.list()).map(toSlotInfo);
  }

  async latestSave(): Promise<SaveSlotInfo | null> {
    if (!this.saves) return null;
    const m = await this.saves.latest();
    return m ? toSlotInfo(m) : null;
  }

  async saveTo(slotId: string, name: string): Promise<Result> {
    if (!this.world) return fail('No game is running.');
    if (!this.saves) return fail(NO_STORAGE);
    if (!isManualSlot(slotId)) return fail(`"${slotId}" is not a save slot you can write to. Use slot-1 to slot-5.`);
    const r = await this.saves.save(slotId, name, this.world);
    return r.ok ? OK : fail(r.error);
  }

  async loadFrom(slotId: string): Promise<Result & { report?: string[] }> {
    if (!this.saves) return fail(NO_STORAGE);
    if (!isSlotId(slotId)) return fail(`"${slotId}" is not a save slot.`);
    const r = await this.saves.load(slotId, this.content);
    if (!r.ok) return fail(r.error);
    this.enterWorld(r.state, loadedSpeed(r.state));
    const report = describeReport(r.report);
    return report.length > 0 ? { ok: true, report } : OK;
  }

  async deleteSave(slotId: string): Promise<Result> {
    if (!this.saves) return fail(NO_STORAGE);
    if (!isSlotId(slotId)) return fail(`"${slotId}" is not a save slot.`);
    const r = await this.saves.remove(slotId);
    return r.ok ? OK : fail(r.error);
  }

  /** JSON of the current world for download; null when no game is running. */
  exportWorld(): string | null { return this.world ? exportWorldJson(this.world, this.now()) : null; }

  /** Imports an exported world and plays it (stored saves are not touched). */
  async importWorld(json: string): Promise<Result & { report?: string[] }> {
    const r = importWorldJson(json, this.content);
    if (!r.ok) {
      const [first, second] = r.errors;
      const reason = first && second && first.endsWith(':') ? `${first} ${second}` : first ?? 'The file could not be imported.';
      return { ok: false, reason, report: r.errors };
    }
    this.enterWorld(r.state, loadedSpeed(r.state));
    const report = describeReport(r.report);
    return report.length > 0 ? { ok: true, report } : OK;
  }

  /** Autosaves now unless a preview is active (then it retries shortly). Resolves when the write finished. */
  async autosave(): Promise<void> { await this.autosaves.flush(); }

  /** Resolves when the autosave currently being written (if any) has finished. */
  async autosaveIdle(): Promise<void> { await this.autosaves.idle(); }

  // ---------------------------------------------------------------------------------------------
  // Time
  // ---------------------------------------------------------------------------------------------

  /** Live speed; 0 while Buy or Build pause the simulation. */
  speed(): Speed { return isEditMode(this.currentMode) ? 0 : this.spd; }

  /** Sets the live speed (in Buy/Build it applies when returning to live). */
  setSpeed(s: Speed): void {
    if (![0, 1, 2, 3].includes(s) || s === this.spd) return;
    if (s !== 0) this.lastRunning = s;
    this.spd = s;
    if (this.world) this.world.settings.speed = s; // saved with the world
    this.notify('speed');
  }

  togglePause(): void { this.setSpeed(this.spd === 0 ? this.lastRunning : 0); }

  /**
   * Advances real time: runs due timers (autosave debounce), and in live mode the fixed simulation ticks for
   * the elapsed time at the current speed (capped per frame). No ticks in menu/creator/buy/build or paused.
   */
  update(realSeconds: number): { ticks: number; alpha: number } {
    const dt = Number.isFinite(realSeconds) && realSeconds > 0 ? realSeconds : 0;
    const live = this.world !== null && this.currentMode === 'live';
    this.autosaves.advance(dt, live);
    if (!live) { this.lastTicks = 0; return { ticks: 0, alpha: 1 }; }
    const r = this.accumulator.advance(dt, this.spd);
    for (let i = 0; i < r.ticks; i++) this.sim.tick();
    this.lastTicks = r.ticks;
    return r;
  }

  /** Drops leftover real time (call when the page becomes visible again). */
  resetAccumulator(): void { this.accumulator.reset(); }

  /** Runs simulation ticks directly, regardless of mode and speed (tests, developer tools). */
  advanceTicks(n: number): void {
    if (!this.world) return;
    for (let i = 0; i < n; i++) this.sim.tick();
  }

  // ---------------------------------------------------------------------------------------------
  // Live mode
  // ---------------------------------------------------------------------------------------------

  selected(): Id | null { return this.sel; }

  /** Selects a member of the active household (others are ignored) or nobody. */
  select(personId: Id | null): void {
    if (personId !== null) {
      const hh = this.world?.households[this.world.activeHouseholdId];
      if (!hh || !hh.memberIds.includes(personId)) return;
    }
    if (personId === this.sel) return;
    this.sel = personId;
    this.notify('selection');
  }

  /** Context-menu entries for what was picked, for the given person. */
  options(personId: Id, pick: PickResult): MenuOption[] {
    const state = this.world;
    if (!state || !state.people[personId]) return [];
    const target = targetForPick(pick, state.lots[state.activeLotId]);
    return target ? this.sim.options(personId, target).map(toMenuOption) : [];
  }

  queue(personId: Id, option: MenuOption): Result {
    if (!this.world) return fail('No game is running.');
    const t = readToken(option?.token, option?.interactionId);
    if (!t) return fail('That choice is no longer available.');
    // "Give a Gift..." opens the picker; the chosen gift comes back through giveGift().
    if (t.interactionId === 'giveGift' && t.data?.gift === undefined && t.target.kind === 'person') {
      this.events.emit({ type: 'ui.request', what: 'giveGift', personId, targetId: t.target.personId });
      return OK;
    }
    const r = this.sim.queue(personId, { ...t, source: 'player' });
    return r.ok ? OK : fail(r.reason);
  }

  giftChoices(giverId: Id, recipientId: Id): GiftChoice[] { return this.world ? this.sim.giftChoices(giverId, recipientId) : []; }

  /** Queues giving the chosen gift: the giver walks over and offers it; it is paid for if accepted. */
  giveGift(giverId: Id, recipientId: Id, giftId: string): Result {
    if (!this.world) return fail('No game is running.');
    const r = this.sim.queue(giverId, { interactionId: 'giveGift', target: { kind: 'person', personId: recipientId }, data: { gift: giftId }, source: 'player' });
    return r.ok ? OK : fail(r.reason);
  }

  /** Walk to a tile ("Go here"); a tile without a level is on the person's current level (Milestone 9: stairs are used on the way). */
  goTo(personId: Id, tile: Tile): Result {
    const p = this.world?.people[personId];
    if (!p) return fail('Unknown person.');
    const level = tile.level ?? (p.location.kind === 'lot' ? p.location.level : 0);
    const r = this.sim.queue(personId, { interactionId: 'goHere', target: { kind: 'tile', x: Math.floor(tile.x), z: Math.floor(tile.z), level }, source: 'player' });
    return r.ok ? OK : fail(r.reason);
  }

  cancel(personId: Id, actionId: Id): void { if (this.world) this.sim.cancel(personId, actionId); }
  reorder(personId: Id, actionId: Id, toIndex: number): void { if (this.world) this.sim.reorder(personId, actionId, toIndex); }
  mood(personId: Id): { value: number; label: string; reasons: string[] } { return this.sim.mood(personId); }

  /** Replaces a household member's wardrobe after checking it with the creator's outfit rules. */
  updateWardrobe(personId: Id, wardrobe: Wardrobe, modular?: ModularLook | null): Result {
    const state = this.world;
    const p = state?.people[personId];
    if (!state || !p) return fail('Unknown person.');
    if (!state.households[p.householdId]?.isPlayable) return fail(`${p.firstName} chooses their own clothes.`);
    if (!wardrobe || typeof wardrobe !== 'object') return fail('That wardrobe is not valid.');
    const issues = validateWardrobe(wardrobe, this.content);
    if (issues.length > 0) return fail(issues[0]!);
    let look: ModularLook | null | undefined;
    if (modular !== undefined) {
      look = modular === null ? null : migrateModularLook(modular);
      if (look === null && modular !== null) return fail('That modular look is not valid.');
    }
    p.outfits = clone(wardrobe);
    if (look === null) delete p.appearance.modular;
    else if (look) p.appearance.modular = clone(look);
    this.events.emit({ type: 'person.changed', personId, what: look === undefined ? 'outfit' : 'appearance' });
    this.notify('state');
    this.autosaves.request();
    return OK;
  }

  // ---------------------------------------------------------------------------------------------
  // Social events
  // ---------------------------------------------------------------------------------------------

  eventProblem(req: PlanEventRequest): string | null {
    if (!this.world) return 'No game is running.';
    return this.sim.eventProblem(req);
  }

  planEvent(req: PlanEventRequest): Result & { eventId?: Id } {
    const state = this.world;
    if (!state) return fail('No game is running.');
    if (state.people[req.hostId]?.householdId !== state.activeHouseholdId) return fail('Only your own household can host.');
    const r = this.sim.planEvent(req);
    if (!r.ok) return fail(r.reason);
    this.notify('state');
    this.autosaves.request();
    return { ok: true, eventId: r.eventId };
  }

  cancelEvent(eventId: Id): Result {
    if (!this.world) return fail('No game is running.');
    const r = this.sim.cancelEvent(eventId);
    if (!r.ok) return fail(r.reason ?? 'Could not cancel.');
    this.notify('state');
    this.autosaves.request();
    return OK;
  }

  // ---------------------------------------------------------------------------------------------
  // Careers and household economy (Milestone 6)
  // ---------------------------------------------------------------------------------------------

  private afterEconomy(r: { ok: boolean; reason?: string }): Result {
    if (!r.ok) return fail(r.reason ?? 'That could not be done.');
    this.notify('state');
    this.autosaves.request();
    return OK;
  }

  payBill(personId: Id, billId: Id): Result & { amount?: number } {
    if (!this.world) return fail('No game is running.');
    const r = this.sim.payBill(personId, billId);
    if (!r.ok) return fail(r.reason ?? 'The bill could not be paid.');
    this.notify('state');
    this.autosaves.request();
    return { ok: true, amount: r.amount };
  }

  setAutoPayBills(personId: Id, on: boolean): Result {
    if (!this.world) return fail('No game is running.');
    const r = this.sim.setAutoPay(personId, on);
    if (!r.ok) return fail(r.reason ?? 'That could not be changed.');
    this.notify('state');
    this.notify('settings');
    this.autosaves.request();
    return OK;
  }

  joinCareer(personId: Id, careerId: string): Result {
    if (!this.world) return fail('No game is running.');
    return this.afterEconomy(this.sim.joinCareer(personId, careerId));
  }

  quitCareer(personId: Id): Result {
    if (!this.world) return fail('No game is running.');
    return this.afterEconomy(this.sim.quitCareer(personId));
  }

  setCareerEffort(personId: Id, effort: 'slack' | 'normal' | 'hard'): Result {
    if (!this.world) return fail('No game is running.');
    const r = this.sim.setCareerEffort(personId, effort);
    if (!r.ok) return fail(r.reason ?? 'That could not be changed.');
    this.notify('state');
    this.autosaves.request();
    return OK;
  }

  resolveCareerEvent(personId: Id, optionId: string): Result {
    if (!this.world) return fail('No game is running.');
    return this.afterEconomy(this.sim.resolveCareerEvent(personId, optionId));
  }

  // ---------------------------------------------------------------------------------------------
  // Neighbourhood and other households (Milestone 7)
  // ---------------------------------------------------------------------------------------------

  /** Trips and household changes need the live world (Buy and Build pause the clock and own the lot). */
  private liveOnly(): string | null {
    if (!this.world) return 'No game is running.';
    if (this.currentMode !== 'live') return 'Return to the live view first.';
    return null;
  }

  neighbourhood(): NeighbourhoodInfo | null { return this.world ? this.sim.neighbourhood() : null; }

  whereIs(personId: Id): PersonPlace | null { return this.world ? this.sim.whereIs(personId) : null; }

  travelProblem(personIds: Id[], lotId: Id): string | null {
    if (!this.world) return 'No game is running.';
    return this.sim.travelProblem(personIds, lotId);
  }

  travel(personIds: Id[], lotId: Id): Result & { minutes?: number; arrivesAt?: number } {
    const blocked = this.liveOnly();
    if (blocked) return fail(blocked);
    const r = this.sim.travel(personIds, lotId);
    if (!r.ok) return fail(r.reason);
    this.notify('neighbourhood');
    this.notify('state');
    this.autosaves.request();
    return { ok: true, minutes: r.minutes, arrivesAt: r.arriveAt };
  }

  goHome(personIds?: Id[]): Result & { minutes?: number; arrivesAt?: number } {
    const blocked = this.liveOnly();
    if (blocked) return fail(blocked);
    const r = this.sim.travelHome(personIds);
    if (!r.ok) return fail(r.reason);
    this.notify('neighbourhood');
    this.notify('state');
    this.autosaves.request();
    return { ok: true, minutes: r.minutes, arrivesAt: r.arriveAt };
  }

  /** In person: `hostId` asks `guestId` (on the same lot, away from the host's home) to come over. */
  inviteHome(hostId: Id, guestId: Id): Result {
    const blocked = this.liveOnly();
    if (blocked) return fail(blocked);
    const r = this.sim.queue(hostId, { interactionId: 'inviteHome', target: { kind: 'person', personId: guestId }, source: 'player' });
    return r.ok ? OK : fail(r.reason);
  }

  switchPreview(householdId: Id): SwitchPreview | null { return this.world ? this.sim.switchPreview(householdId) : null; }

  switchHousehold(householdId: Id): Result {
    const blocked = this.liveOnly();
    if (blocked) return fail(blocked);
    const r = this.sim.switchHousehold(householdId);
    if (!r.ok) return fail(r.reason ?? 'Could not switch households.');
    const w = this.world!;
    const first = w.households[w.activeHouseholdId]?.memberIds.find((id) => w.people[id]?.location.kind === 'lot') ?? w.households[w.activeHouseholdId]?.memberIds[0] ?? null;
    this.sel = first;
    this.undoStack.clear();
    this.notify('selection');
    this.notify('lot');
    this.notify('neighbourhood');
    this.notify('state');
    this.autosaves.request();
    return OK;
  }

  movePreview(lotId: Id, opts?: MoveOptions): MovePreview | null { return this.world ? this.sim.movePreview(lotId, opts) : null; }

  moveHousehold(lotId: Id, opts?: MoveOptions): Result {
    const blocked = this.liveOnly();
    if (blocked) return fail(blocked);
    const r = this.sim.moveHousehold(lotId, opts);
    if (!r.ok) return fail(r.reason ?? 'Could not move.');
    this.notify('neighbourhood');
    this.notify('state');
    this.autosaves.request();
    return OK;
  }

  // ---------------------------------------------------------------------------------------------
  // Family and life stages (Milestone 8)
  // ---------------------------------------------------------------------------------------------

  family(personId: Id): FamilyInfo | null { return this.world ? this.sim.family(personId) : null; }

  private afterFamily(): void {
    this.notify('state');
    this.notify('neighbourhood');
    this.autosaves.request();
  }

  /** "Age up now": the birthday at a birthday cake on the lot (a caregiver celebrates with a baby or toddler). */
  ageUpNow(personId: Id): Result {
    const blocked = this.liveOnly();
    if (blocked) return fail(blocked);
    const r = this.sim.ageUpNow(personId);
    if (!r.ok) return fail(r.reason);
    this.notify('state');
    return OK;
  }

  /** Sends a pupil to do the homework that is due. */
  doHomework(personId: Id): Result {
    const blocked = this.liveOnly();
    if (blocked) return fail(blocked);
    const r = this.sim.doHomework(personId);
    if (!r.ok) return fail(r.reason);
    this.notify('state');
    return OK;
  }

  adoptPreview(adopterId: Id, spec: AdoptionSpec): AdoptionPreview | null { return this.world ? this.sim.adoptionPreview(adopterId, spec) : null; }

  adopt(adopterId: Id, spec: AdoptionSpec): Result & { personId?: Id } {
    if (!this.world) return fail('No game is running.');
    const r = this.sim.adopt(adopterId, spec);
    if (!r.ok) return fail(r.reason);
    this.afterFamily();
    return { ok: true, personId: r.personId };
  }

  splitPreview(personIds: Id[], target: SplitTarget): SplitPreview | null { return this.world ? this.sim.splitPreview(personIds, target) : null; }

  splitHousehold(personIds: Id[], target: SplitTarget): Result & { householdId?: Id } {
    const blocked = this.liveOnly();
    if (blocked) return fail(blocked);
    const r = this.sim.splitHousehold(personIds, target);
    if (!r.ok) return fail(r.reason);
    const w = this.world!;
    if (this.sel !== null && !w.households[w.activeHouseholdId]?.memberIds.includes(this.sel)) {
      this.sel = w.households[w.activeHouseholdId]?.memberIds.find((id) => w.people[id]?.location.kind === 'lot') ?? w.households[w.activeHouseholdId]?.memberIds[0] ?? null;
      this.notify('selection');
    }
    this.afterFamily();
    return { ok: true, householdId: r.householdId };
  }

  // ---------------------------------------------------------------------------------------------
  // Construction plumbing
  // ---------------------------------------------------------------------------------------------

  private editContext(mode: 'buy' | 'build'): EditContext | string {
    const state = this.world;
    if (!state) return 'No game is running.';
    if (this.currentMode !== mode) return mode === 'buy' ? 'Open Buy mode first.' : 'Open Build mode first.';
    const lot = state.lots[state.activeLotId];
    const hh = state.households[state.activeHouseholdId];
    if (!lot || !hh) return 'No home lot is loaded.';
    return { state, lot, hh };
  }

  private commandContext(state: WorldState): CommandContext { return { state, content: this.content, events: this.events }; }

  /** Runs a construction command through the undo stack (commands emit lot.changed; nav and sim follow it). */
  private runCommand(state: WorldState, cmd: UndoableCommand | null): Result {
    if (!cmd) return fail('Nothing to do.');
    const r = this.undoStack.run(this.commandContext(state), cmd);
    if (!r.ok) return r;
    this.afterConstruction();
    return OK;
  }

  private afterConstruction(): void {
    const state = this.world;
    if (state && this.selObj !== null && !state.lots[state.activeLotId]?.objects[this.selObj]) {
      this.selObj = null;
      this.notify('selection');
    }
    this.notify('undo');
    this.notify('state');
    this.autosaves.request();
  }

  undo(): string | null {
    const state = this.world;
    if (!state || !this.undoStack.canUndo()) return null;
    this.cancelPlacement();
    this.buildTools.cancel();
    const label = this.undoStack.undo(this.commandContext(state));
    if (label !== null) this.afterConstruction();
    return label;
  }

  redo(): string | null {
    const state = this.world;
    if (!state || !this.undoStack.canRedo()) return null;
    this.cancelPlacement();
    this.buildTools.cancel();
    const label = this.undoStack.peekRedo();
    const r = this.undoStack.redo(this.commandContext(state));
    if (!r) return null;
    if (!r.ok) {
      this.events.emit({ type: 'notify', kind: 'warning', text: `Can't redo: ${r.reason}` });
      this.notify('undo');
      return null;
    }
    this.afterConstruction();
    return label;
  }

  canUndo(): boolean { return this.undoStack.canUndo(); }
  canRedo(): boolean { return this.undoStack.canRedo(); }

  // ---------------------------------------------------------------------------------------------
  // Buy mode (tile input)
  // ---------------------------------------------------------------------------------------------

  private startTile(lot: Lot): Tile {
    const t = this.lastTile;
    if (t && t.x >= 0 && t.z >= 0 && t.x < lot.width && t.z < lot.depth) return { ...t };
    return { x: Math.floor(lot.width / 2), z: Math.floor(lot.depth / 2) };
  }

  private setPlacement(p: PlacementState): void {
    const c = this.world;
    if (!c) return;
    this.place = { ...p, ...evaluatePlacement(c, this.content, c.activeLotId, c.activeHouseholdId, p) };
    this.notify('placement');
  }

  /** Starts placing a new catalog object (nothing is charged until confirmPlacement). */
  startPlacement(defId: string): Result {
    const c = this.editContext('buy');
    if (typeof c === 'string') return fail(c);
    const def = this.content.objects[defId];
    if (!def || def.status !== 'ready') return fail('That item is not available.');
    const t = this.startTile(c.lot);
    this.setPlacement({ source: 'buy', defId, objectId: null, inventoryIndex: null, x: t.x, z: t.z, level: 0, rot: 0, ok: false, reasons: [], cost: 0 });
    return OK;
  }

  /** Starts moving a placed object (from where it stands). */
  startMove(objectId: Id): Result {
    const c = this.editContext('buy');
    if (typeof c === 'string') return fail(c);
    const obj = c.lot.objects[objectId];
    if (!obj) return fail('That object is no longer here.');
    const blocked = supportBlockReason(c.state, this.content, c.lot, objectId);
    if (blocked) return fail(blocked);
    this.setPlacement({ source: 'move', defId: obj.defId, objectId, inventoryIndex: null, x: obj.x, z: obj.z, level: obj.level, rot: obj.rot, ok: false, reasons: [], cost: 0 });
    return OK;
  }

  /** Starts placing an object from the household inventory. */
  startPlaceFromInventory(index: number): Result {
    const c = this.editContext('buy');
    if (typeof c === 'string') return fail(c);
    const entry = c.hh.inventory[index];
    if (!entry) return fail('Nothing is stored in that slot.');
    const t = this.startTile(c.lot);
    this.setPlacement({ source: 'inventory', defId: entry.object.defId, objectId: entry.object.id, inventoryIndex: index, x: t.x, z: t.z, level: 0, rot: entry.object.rot, ok: false, reasons: [], cost: 0 });
    return OK;
  }

  placement(): PlacementState | null { return this.place; }

  /** Milestone 9: the placement ghost follows the floor being worked on. */
  setPlacementLevel(level: number): void {
    if (this.place && this.place.level !== level) this.setPlacement({ ...this.place, level });
  }

  /** Moves the placement preview to a tile (footprint origin = minimum corner after rotation). */
  placementTile(x: number, z: number): void {
    const p = this.place;
    if (!p || !Number.isFinite(x) || !Number.isFinite(z)) return;
    const tx = Math.floor(x), tz = Math.floor(z);
    this.lastTile = { x: tx, z: tz };
    if (tx === p.x && tz === p.z) return;
    this.setPlacement({ ...p, x: tx, z: tz });
  }

  rotatePlacement(dir: 1 | -1 = 1): void {
    const p = this.place;
    if (!p) return;
    this.setPlacement({ ...p, rot: ((((p.rot + (dir === -1 ? -1 : 1)) % 4) + 4) % 4) as PlacementState['rot'] });
  }

  /**
   * Confirms the placement through the undo stack (buy charges the price; moves and inventory placements are
   * free). Putting a moved object back where it was simply ends the move. Returns the placed object's id.
   */
  confirmPlacement(): Result & { objectId?: Id } {
    const c = this.editContext('buy');
    const p = this.place;
    if (!p) return fail('Nothing to place.');
    if (typeof c === 'string') return fail(c);
    if (isUnchangedMove(c.state, c.lot.id, p)) { this.cancelPlacement(); return { ok: true, objectId: p.objectId! }; }
    this.setPlacement(p);
    const cur = this.place!;
    if (!cur.ok) return fail(cur.reasons[0] ?? 'It cannot go there.');
    const before = new Set(Object.keys(c.lot.objects));
    const r = this.runCommand(c.state, placementCommand(c.lot.id, c.hh.id, cur));
    if (!r.ok) return r;
    const objectId = cur.source === 'buy' ? Object.keys(c.lot.objects).find((id) => !before.has(id)) : cur.objectId ?? undefined;
    this.place = null;
    this.notify('placement');
    this.autosaves.previewEnded();
    return objectId ? { ok: true, objectId } : OK;
  }

  cancelPlacement(): void {
    if (!this.place) return;
    this.place = null;
    this.notify('placement');
    this.autosaves.previewEnded();
  }

  /** Sells an object for its sale value (undoable). */
  sell(objectId: Id): Result {
    const c = this.editContext('buy');
    if (typeof c === 'string') return fail(c);
    if (this.place?.objectId === objectId) this.cancelPlacement();
    return this.runCommand(c.state, sellObject(c.lot.id, c.hh.id, objectId));
  }

  /** What selling the object returns now (0 for unknown objects). */
  saleValue(objectId: Id): number {
    const state = this.world;
    const obj = state?.lots[state.activeLotId]?.objects[objectId];
    return state && obj ? saleValueOf(state, obj) : 0;
  }

  /** Moves an object into the household inventory (undoable, free). */
  store(objectId: Id): Result {
    const c = this.editContext('buy');
    if (typeof c === 'string') return fail(c);
    if (this.place?.objectId === objectId) this.cancelPlacement();
    return this.runCommand(c.state, storeObject(c.lot.id, c.hh.id, objectId));
  }

  /** Changes one finish region of an object (undoable, free in M1). */
  setObjectFinish(objectId: Id, regionId: string, swatchId: string): Result {
    const c = this.editContext('buy');
    if (typeof c === 'string') return fail(c);
    return this.runCommand(c.state, setObjectFinishCommand(c.lot.id, c.hh.id, objectId, regionId, swatchId));
  }

  selectObject(objectId: Id | null): void {
    if (objectId !== null) {
      const state = this.world;
      if (!state?.lots[state.activeLotId]?.objects[objectId]) return;
    }
    if (objectId === this.selObj) return;
    this.selObj = objectId;
    this.notify('selection');
  }

  selectedObject(): Id | null { return this.selObj; }

  // ---------------------------------------------------------------------------------------------
  // Build mode (finishes)
  // ---------------------------------------------------------------------------------------------

  setPaintTool(tool: PaintTool | null): void {
    this.tool = tool ? clone(tool) : null;
    if (tool?.kind === 'wall') this.scopes.wall = tool.scope;
    else if (tool?.kind === 'floor') this.scopes.floor = tool.scope;
    this.setHighlight(null);
    this.notify('paint');
  }

  paintTool(): PaintTool | null { return this.tool; }

  private setHighlight(h: PaintHighlight | null): void {
    if (JSON.stringify(h) === JSON.stringify(this.highlight)) return;
    this.highlight = h;
    this.notify('paint');
    if (h === null) this.autosaves.previewEnded();
  }

  private clearPaint(): void {
    const had = this.tool !== null || this.highlight !== null;
    this.tool = null;
    this.setHighlight(null);
    if (had) this.notify('paint');
  }

  /** Preview (cost, count, validity) for painting the pick with the current tool; null clears the preview. */
  paintPreview(pick: PickResult | null): PaintPreview | null {
    const c = this.editContext('build');
    const tool = this.tool;
    if (!pick || !tool || tool.kind === 'eyedropper' || typeof c === 'string') { this.setHighlight(null); return null; }
    const ev = evaluatePaint(c.state, this.content, c.lot.id, c.hh.id, tool, pick);
    this.setHighlight(ev.highlight);
    return ev.preview;
  }

  /** Wall sides or floor tiles the current paint preview covers (for the renderer to highlight). */
  paintPreviewTarget(): PaintHighlight | null { return this.highlight; }

  /** Paints the pick with the current tool (undoable; the eyedropper tool picks instead). */
  paintApply(pick: PickResult): Result {
    const c = this.editContext('build');
    if (typeof c === 'string') return fail(c);
    const tool = this.tool;
    if (!tool) return fail('Choose a finish first.');
    if (tool.kind === 'eyedropper') return this.eyedrop(pick) ? OK : fail('There is no finish to pick there.');
    const target = paintTargetFor(c.lot, tool, pick);
    if (typeof target === 'string') return fail(target);
    const r = this.runCommand(c.state, paintCommand(c.lot.id, c.hh.id, target, tool.finish));
    if (!r.ok) return r;
    const list = this.recent[tool.kind];
    this.recent[tool.kind] = [clone(tool.finish), ...list.filter((f) => !sameFinish(f, tool.finish))].slice(0, RECENT_LIMIT);
    this.setHighlight(null);
    this.notify('paint');
    return OK;
  }

  /**
   * Reads the finish under the pick and switches the tool to paint with it (keeping the last scope used for
   * that kind). With the eyedropper tool, its target decides whether walls or floors are read.
   */
  eyedrop(pick: PickResult): FinishRef | null {
    const state = this.world;
    const lot = state?.lots[state.activeLotId];
    if (!lot) return null;
    const want = this.tool?.kind === 'eyedropper' ? this.tool.target : null;
    const f = finishAt(lot, pick, want);
    if (!f) return null;
    this.tool = f.kind === 'wall'
      ? { kind: 'wall', finish: clone(f.finish), scope: this.scopes.wall }
      : { kind: 'floor', finish: clone(f.finish), scope: this.scopes.floor };
    this.setHighlight(null);
    this.notify('paint');
    return clone(f.finish);
  }

  /** Last 8 finishes painted with, most recent first. */
  recentFinishes(kind: 'wall' | 'floor'): FinishRef[] { return this.recent[kind].map((f) => ({ ...f })); }

  // ---------------------------------------------------------------------------------------------
  // Build mode (structure: walls, rooms, doors, windows, floors). See the notes at the top of api.ts.
  // ---------------------------------------------------------------------------------------------

  setBuildTool(tool: BuildTool | null): void { this.buildTools.setTool(tool); }
  buildTool(): BuildTool | null { return this.buildTools.tool(); }

  /** Pure preview of the tool at the target (cost, counts, measurement, reasons, highlight). null clears it. */
  buildPreview(target: BuildTarget | null): BuildPreview | null { return this.buildTools.preview(target); }

  /** Runs the tool at the target as one undoable command; a failure changes nothing. */
  buildApply(target: BuildTarget): Result & Partial<BuildApplyResult> {
    if (this.currentMode !== 'build') return fail('Open Build mode first.');
    return this.buildTools.apply(target);
  }

  buildCancel(): void { this.buildTools.cancel(); }
  buildHighlight(): ReturnType<BuildTools['highlight']> { return this.buildTools.highlight(); }
  rooms(level = 0): RoomInfo[] { return this.buildTools.rooms(level); }
  roomAt(tile: Tile, level = 0): RoomInfo | null { return this.buildTools.roomAt(tile, level); }
  openingAt(wallId: string): ReturnType<BuildTools['openingAt']> { return this.buildTools.openingAt(wallId); }

  // ---------------------------------------------------------------------------------------------
  // Settings and diagnostics
  // ---------------------------------------------------------------------------------------------

  /** World simulation settings stored in the save. Unlimited funds can only change in a sandbox world. */
  setSimSettings(patch: Partial<SimSettings>): void {
    const state = this.world;
    if (!state || !patch) return;
    const s = state.settings;
    let changed = false;
    const set = <K extends keyof SimSettings>(k: K, v: SimSettings[K]) => { if (s[k] !== v) { s[k] = v; changed = true; } };
    if (typeof patch.autonomy === 'boolean') set('autonomy', patch.autonomy);
    if (patch.autonomyLevel === 0 || patch.autonomyLevel === 1 || patch.autonomyLevel === 2) set('autonomyLevel', patch.autonomyLevel);
    if (typeof patch.visitors === 'boolean') set('visitors', patch.visitors);
    if (patch.aging === 'off' || patch.aging === 'long' || patch.aging === 'normal' || patch.aging === 'custom') set('aging', patch.aging);
    if (typeof patch.elderEndOfLife === 'boolean') set('elderEndOfLife', patch.elderEndOfLife);
    if (patch.agingDays && typeof patch.agingDays === 'object') {
      const days: Partial<Record<LifeStage, number>> = { ...(s.agingDays ?? {}) };
      for (const stage of STAGE_ORDER) {
        const v = patch.agingDays[stage];
        if (typeof v === 'number' && Number.isFinite(v)) days[stage] = Math.max(MIN_STAGE_DAYS, Math.min(MAX_STAGE_DAYS, Math.round(v)));
      }
      if (JSON.stringify(days) !== JSON.stringify(s.agingDays ?? {})) { s.agingDays = days; changed = true; }
    }
    if (typeof patch.unlimitedFunds === 'boolean' && state.startMode === 'sandbox') set('unlimitedFunds', patch.unlimitedFunds);
    if (typeof patch.autoPayBills === 'boolean') set('autoPayBills', patch.autoPayBills);
    // Milestone 12: seasons and weather live in the save; a change re-plans the stored half-days immediately.
    if (typeof patch.seasons === 'boolean') set('seasons', patch.seasons);
    if (patch.seasonDays === 3 || patch.seasonDays === 7 || patch.seasonDays === 14) set('seasonDays', patch.seasonDays);
    if (typeof patch.weather === 'boolean') set('weather', patch.weather);
    if (typeof patch.townLife === 'boolean') set('townLife', patch.townLife);
    if (changed) {
      if (patch.seasons !== undefined || patch.seasonDays !== undefined || patch.weather !== undefined) this.sim.refreshWeather();
      this.notify('state');
      this.notify('settings');
    }
  }

  devStats(): Pick<DevStats, 'agents' | 'routeRequests' | 'simTickMs' | 'ticksPerFrame'> {
    const s = this.sim.stats();
    return { agents: this.world ? s.agents : 0, routeRequests: s.routeRequests, simTickMs: s.tickMs, ticksPerFrame: this.lastTicks };
  }
}
