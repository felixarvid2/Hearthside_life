// Mock GameAPI for the UI dev page (dev/ui.html). Fake but plausible: a household of two with changing needs,
// an action queue, relationships, a culinary career, feed entries, context-menu options, a fake placement and
// paint flow, in-memory saves, and a 2D top-down canvas "renderer" with a camera, picking and insets so the
// world input and anchored menus can be exercised. Never used by the real game.

import { BuildTools } from '../../game/core/build';
import type {
  BuildApplyResult, BuildPreview, BuildTarget, BuildTool, RoomInfo,
  CutawayMode, DevStats, GameAPI, GameMode, GameSettings, MenuOption, PaintPreview, PaintTool, PickResult,
  PlacementState, PlanEventRequest, Result, SaveSlotInfo, SoundId, UiChange,
} from '../../game/api';
import { socialSection } from '../../content/capabilities';
import type { ContentDB } from '../../content/types';
import { EventBus } from '../../core/events';
import { MINUTES_PER_DAY, SPEED_MINUTES_PER_SECOND, START_MINUTE, formatClock, minuteOfDay, type Speed } from '../../core/clock';
import type { HouseholdDraft, PersonDraft } from '../../core/drafts';
import { edgeKey, newId, pairKey, relKey, tileKey } from '../../core/ids';
import { addFeed, addHousehold, createEmptyWorld, householdMembers, markProcessed, transact } from '../../core/state';
import type { Tile } from '../../core/nav';
import type {
  ActionInstance, Appearance, CareerState, Cents, FinishRef, HomeEvent, Id, Lot, NeedId, Needs, Person, PersonLocation, Pronouns,
  Rot, SimSettings, StartMode, Wardrobe, WorldState,
} from '../../core/types';
import { NEED_IDS } from '../../core/types';
import { Rng, seedRng } from '../../core/rng';
import type { MovePreview, NeighbourhoodInfo, PersonPlace, SwitchPreview } from '../../game/api';
import { movePreview as simMovePreview, switchPreview as simSwitchPreview } from '../../sim/households';
import { travelProblem as simTravelProblem } from '../../sim/lotTravel';
import { neighbourhoodInfo } from '../../sim/neighbourhoodView';
import { placeOf } from '../../sim/places';
import { Reservations } from '../../sim/reservations';
import type { SimCtx } from '../../sim/context';
import { createNeighbourhoodLots, travelMinutes } from '../../world/neighbourhood';

export interface MockOptions {
  content: ContentDB;
  canvas: HTMLCanvasElement;
  /** Initial mode after boot ('boot' stays on the loading screen). */
  start: 'boot' | 'menu' | 'live' | 'buy' | 'build';
  bootMs?: number;
  speed?: Speed;
  /** startNewGame fails (to test the error message). */
  failStart?: boolean;
  /** Start without any saves (Continue hidden). */
  noSaves?: boolean;
  /** World start mode when jumping straight into a game. */
  startMode?: StartMode;
}

const SHE: Pronouns = { subject: 'she', object: 'her', possessive: 'her' };
const HE: Pronouns = { subject: 'he', object: 'him', possessive: 'his' };
const THEY: Pronouns = { subject: 'they', object: 'them', possessive: 'their' };

const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8, soundVolume: 0.8, musicVolume: 0.5, reducedMotion: false, textScale: 1, quality: 'high', characterStyle: 'mpfb', shadows: true,
  weatherEffects: true, actionProgress: 'household', showStats: false, tutorial: true,
};

function appearance(skin: string, hair: string): Appearance {
  return {
    frame: 'a', skin, body: {}, bodyPresetId: null,
    face: { presetId: null, params: {}, eyeColor: '#5a4632', browStyle: 'soft', browColor: hair, freckles: 0, blush: 0.1, lipTint: 0.2, lipColor: '#b0645a' },
    hair: { styleId: 'short-crop', color: hair, highlight: null, facialHairId: null },
  };
}

function wardrobe(): Wardrobe {
  return {
    outfits: { everyday: [{ id: 'out_a', name: 'Everyday', layers: {}, accessories: [] }], formal: [], work: [], athletic: [], sleep: [], swim: [] },
    current: { category: 'everyday', index: 0 },
  };
}

function draft(first: string, last: string, pronouns: Pronouns, skin: string, hair: string, traits: string[], aspirationId: string | null, careerId: string | null): PersonDraft {
  return {
    firstName: first, lastName: last, pronouns, lifeStage: 'adult', bio: '', voice: { preset: 'warm', pitch: 0 }, walkStyle: 'relaxed',
    romance: { interestedIn: ['any'], open: true }, appearance: appearance(skin, hair), outfits: wardrobe(), traits, likes: [], dislikes: [],
    aspirationId, careerId,
  };
}

const PREMADES: HouseholdDraft[] = [
  { name: 'Hart', members: [
    draft('Ada', 'Hart', SHE, '#c99a74', '#3b2a20', ['cheerful', 'foodie', 'energetic'], 'homeChef', 'culinary'),
    draft('Theo', 'Hart', HE, '#8d5e3c', '#1e1a17', ['bookworm', 'neat', 'romantic'], 'socialButterfly', null),
  ], ties: [{ a: 0, b: 1, tie: 'spouse' }] },
  { name: 'Okafor-Lind', members: [
    draft('Noor', 'Okafor-Lind', THEY, '#6b4430', '#2a1d14', ['bookworm', 'cheerful', 'neat'], 'socialButterfly', null),
  ], ties: [] },
];

const pastel = (s: string) => {
  let hsh = 0;
  for (const c of s) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${hsh % 360} 45% 62%)`;
};
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function portraitSvg(p: Person): string {
  const hair = p.appearance.hair.color, skin = p.appearance.skin;
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${pastel(p.firstName)}"/><circle cx="32" cy="70" r="26" fill="#f4efe6"/><circle cx="32" cy="30" r="15" fill="${skin}"/><path d="M16 28c0-12 8-17 16-17s16 5 16 17c-4-6-10-8-16-8s-12 2-16 8z" fill="${hair}"/></svg>`);
}

interface UndoEntry { label: string; before: string; after: string }

type Cam = { tx: number; tz: number; scale: number; rot: Rot };

export class MockGame implements GameAPI {
  readonly content: ContentDB;
  readonly events = new EventBus();
  /** Build mode structure tools (walls, rooms, doors, windows, floors) running the real pure planner on the mock world. */
  private readonly buildTools: BuildTools;
  readonly soundLog: SoundId[] = [];
  /** Calls the UI made, for tests: [method, args]. */
  readonly calls: Array<[string, unknown[]]> = [];

  private listeners = new Set<(w: UiChange) => void>();
  private world: WorldState | null = null;
  private backdrop: WorldState;
  private m: GameMode = 'boot';
  private spd: Speed = 1;
  private prevSpeed: Speed = 1;
  private sel: Id | null = null;
  private selObj: Id | null = null;
  private place: PlacementState | null = null;
  private tool: PaintTool | null = null;
  private preview: { pick: PickResult; ok: boolean } | null = null;
  private recent: { wall: FinishRef[]; floor: FinishRef[] } = { wall: [], floor: [] };
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private cut: CutawayMode = 'cutaway';
  private cam: Cam = { tx: 12, tz: 12, scale: 26, rot: 0 };
  private insets = { left: 0, right: 0, top: 0, bottom: 0 };
  private cfg: GameSettings;
  private saves = new Map<string, { info: SaveSlotInfo; json: string }>();
  private portraitsReady = false;
  private lastFrame = 0;
  private raf = 0;
  private nextEventAt = START_MINUTE + 20;
  private stats: DevStats = { fps: 60, frameMs: 16.6, drawCalls: 140, triangles: 182000, geometries: 96, textures: 44, loadedAssets: 61, agents: 3, routeRequests: 0, simTickMs: 0.4, ticksPerFrame: 1 };

  constructor(private o: MockOptions) {
    this.content = o.content;
    this.buildTools = new BuildTools({
    content: this.content,
    events: this.events,
    world: () => this.world,
    run: (cmd) => {
      const w = this.world;
      if (!w) return { ok: false, reason: 'No game is running.' };
      const before = this.snapshot();
      const r = cmd.apply({ state: w, content: this.content, events: this.events });
      if (!r.ok) return r;
      this.undoStack.push({ label: cmd.label, before, after: this.snapshot() });
      if (this.undoStack.length > 50) this.undoStack.shift();
      this.redoStack = [];
      this.emit('undo');
      return r;
    },
    blocked: () => (!this.world ? 'No game is running.' : this.m === 'build' ? null : 'Open Build mode first.'),
    changed: () => this.emit('build'),
  });
    this.cfg = { ...DEFAULT_SETTINGS };
    try {
      const raw = localStorage.getItem('hearthside.mock.settings');
      if (raw) this.cfg = { ...this.cfg, ...(JSON.parse(raw) as Partial<GameSettings>) };
    } catch { /* storage unavailable */ }
    this.backdrop = this.buildWorld('guided', PREMADES[0]!, true);
    if (!o.noSaves) this.seedSaves();
    if (o.speed !== undefined) this.spd = o.speed;
    const target = o.start;
    if (target !== 'boot') {
      setTimeout(() => {
        if (target === 'menu') this.setModeInternal('menu');
        else {
          this.world = this.buildWorld(o.startMode ?? 'guided', PREMADES[0]!, true);
          this.events.emit({ type: 'state.replaced' });
          this.setModeInternal('live');
          if (target !== 'live') this.setMode(target);
          this.emit('state');
        }
      }, o.bootMs ?? 400);
    }
    setTimeout(() => { this.portraitsReady = true; this.emit('portraits'); }, 1200);
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void { cancelAnimationFrame(this.raf); }

  // ---------------------------------------------------------------------------------------------
  // GameAPI: core
  // ---------------------------------------------------------------------------------------------

  onChange(fn: (what: UiChange) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(w: UiChange): void { for (const fn of [...this.listeners]) fn(w); }
  private log(name: string, ...args: unknown[]): void { this.calls.push([name, args]); if (this.calls.length > 400) this.calls.shift(); }

  state(): WorldState | null { return this.world; }
  mode(): GameMode { return this.m; }

  showMenu(): void {
    this.log('showMenu');
    this.world = null;
    this.sel = null;
    this.place = null;
    this.tool = null;
    this.setModeInternal('menu');
    this.emit('state');
  }

  async startNewGame(mode: StartMode, d: HouseholdDraft): Promise<Result> {
    this.log('startNewGame', mode, d.name);
    await wait(500);
    if (this.o.failStart) return { ok: false, reason: 'The starter house could not be prepared. Please try again.' };
    if (!d.members.length) return { ok: false, reason: 'The household has no members.' };
    this.world = this.buildWorld(mode, d, false);
    this.sel = this.world.households[this.world.activeHouseholdId]?.memberIds[0] ?? null;
    this.undoStack = []; this.redoStack = [];
    this.spd = 1;
    this.events.emit({ type: 'state.replaced' });
    this.setModeInternal('live');
    this.emit('state');
    this.emit('selection');
    this.emit('speed');
    return { ok: true };
  }

  premadeHouseholds(): HouseholdDraft[] { return JSON.parse(JSON.stringify(PREMADES)) as HouseholdDraft[]; }

  creator = {
    show: () => { if (this.m !== 'creator') this.setModeInternal('creator'); },
    setView: () => undefined,
    rotate: () => undefined,
    zoom: () => undefined,
    hide: () => { if (this.m === 'creator') this.setModeInternal(this.world ? 'live' : 'menu'); },
    portrait: async (p: PersonDraft) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${pastel(p.firstName)}"/></svg>`),
  };

  // ---------------------------------------------------------------------------------------------
  // Saves
  // ---------------------------------------------------------------------------------------------

  private seedSaves(): void {
    const w = this.buildWorld('guided', PREMADES[0]!, true);
    w.clock.minutes = 2 * MINUTES_PER_DAY + 19 * 60 + 30;
    const json = JSON.stringify(w);
    const mk = (slotId: string, name: string, kind: SaveSlotInfo['kind'], hoursAgo: number): void => {
      this.saves.set(slotId, { json, info: { slotId, name, savedAt: new Date(Date.now() - hoursAgo * 3600e3).toISOString(), gameMinutes: w.clock.minutes, householdName: 'Hart', funds: 1825000, kind, empty: false } });
    };
    mk('slot-1', 'Before the dinner party', 'manual', 26);
    mk('autosave', 'Autosave', 'autosave', 0.4);
    mk('backup', 'Backup', 'backup', 3);
  }

  async listSaves(): Promise<SaveSlotInfo[]> {
    await wait(120);
    const ids = ['slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5', 'autosave', 'backup'];
    return ids.map((slotId) => this.saves.get(slotId)?.info ?? {
      slotId, name: '', savedAt: '', gameMinutes: 0, householdName: '', funds: 0, empty: true,
      kind: slotId === 'autosave' ? 'autosave' : slotId === 'backup' ? 'backup' : 'manual',
    });
  }

  async latestSave(): Promise<SaveSlotInfo | null> {
    await wait(60);
    const all = [...this.saves.values()].map((s) => s.info).filter((i) => !i.empty);
    all.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    return all[0] ?? null;
  }

  async saveTo(slotId: string, name: string): Promise<Result> {
    this.log('saveTo', slotId, name);
    await wait(250);
    if (!this.world) return { ok: false, reason: 'No game is running.' };
    const hh = this.world.households[this.world.activeHouseholdId];
    this.saves.set(slotId, { json: JSON.stringify(this.world), info: { slotId, name, savedAt: new Date().toISOString(), gameMinutes: this.world.clock.minutes, householdName: hh?.name ?? '', funds: hh?.funds ?? 0, kind: 'manual', empty: false } });
    return { ok: true };
  }

  async loadFrom(slotId: string): Promise<Result & { report?: string[] }> {
    this.log('loadFrom', slotId);
    await wait(350);
    const s = this.saves.get(slotId);
    if (!s) return { ok: false, reason: 'That save slot is empty.' };
    this.world = JSON.parse(s.json) as WorldState;
    this.sel = this.world.households[this.world.activeHouseholdId]?.memberIds[0] ?? null;
    this.place = null; this.tool = null; this.undoStack = []; this.redoStack = [];
    this.events.emit({ type: 'state.replaced' });
    this.setModeInternal('live');
    this.emit('state'); this.emit('selection');
    return slotId === 'backup' ? { ok: true, report: ['1 object referenced a missing design and was replaced by a placeholder (refund kept).'] } : { ok: true };
  }

  async deleteSave(slotId: string): Promise<Result> { await wait(80); this.saves.delete(slotId); return { ok: true }; }

  exportWorld(): string | null { return this.world ? JSON.stringify(this.world) : null; }

  async importWorld(json: string): Promise<Result & { report?: string[] }> {
    await wait(300);
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { return { ok: false, reason: 'The file is not valid JSON.', report: ['Unexpected token at the start of the file.'] }; }
    const w = parsed as Partial<WorldState> | null;
    if (!w || typeof w !== 'object' || typeof w.schemaVersion !== 'number' || !w.households || !w.people) {
      return { ok: false, reason: 'This file is not a Hearthside Life world.', report: ['Missing schemaVersion, households or people.'] };
    }
    this.world = w as WorldState;
    this.sel = this.world.households[this.world.activeHouseholdId]?.memberIds[0] ?? null;
    this.events.emit({ type: 'state.replaced' });
    this.setModeInternal('live');
    this.emit('state'); this.emit('selection');
    return { ok: true, report: ['World imported. 0 missing references.'] };
  }

  // ---------------------------------------------------------------------------------------------
  // Time
  // ---------------------------------------------------------------------------------------------

  speed(): Speed { return this.spd; }
  setSpeed(s: Speed): void {
    this.log('setSpeed', s);
    if (this.m === 'buy' || this.m === 'build') { this.prevSpeed = s; return; }
    if (s !== this.spd) { if (s !== 0) this.prevSpeed = s; this.spd = s; this.emit('speed'); }
  }
  togglePause(): void { this.setSpeed(this.spd === 0 ? (this.prevSpeed || 1) : 0); }

  // ---------------------------------------------------------------------------------------------
  // Live mode
  // ---------------------------------------------------------------------------------------------

  selected(): Id | null { return this.sel; }
  select(personId: Id | null): void {
    this.log('select', personId);
    if (personId === this.sel) return;
    this.sel = personId;
    this.emit('selection');
  }

  options(personId: Id, pick: PickResult): MenuOption[] {
    const w = this.world;
    const me = w?.people[personId];
    if (!w || !me) return [];
    const opt = (interactionId: string, group: MenuOption['group'], enabled = true, reason?: string, data?: Record<string, string>): MenuOption => {
      const def = this.content.interactions[interactionId] ?? this.content.socials[interactionId];
      return { interactionId, label: def?.name ?? interactionId, icon: def?.icon ?? 'info', group, enabled, ...(reason ? { reason } : {}), token: { pick, data } };
    };
    if (pick.kind === 'person') {
      if (pick.personId === personId) {
        const visiting = Object.values(w.people).some((p) => p.isNpc && p.location.kind === 'lot');
        const shift = me.career ? this.content.careers[me.career.careerId]?.levels[me.career.level - 1] : undefined;
        const minute = minuteOfDay(w.clock.minutes);
        return [
          opt('danceSolo', 'self'), opt('jogInPlace', 'self', me.needs.energy > 15, 'Too tired to exercise.'),
          { ...opt('phoneChat', 'self', true, undefined, { personId: 'neighbour' }), section: 'phone' },
          { ...opt('phoneInvite', 'self', !visiting, 'June is already here.'), section: 'phone' },
          { ...opt('planEvent', 'self'), label: 'Plan an Event...', section: 'phone' },
          opt('goToWork', 'self', !!shift && minute >= shift.start - 120 && minute < shift.end, me.career ? `Work starts at ${formatClock(shift?.start ?? 540)}.` : 'Needs a job first.'),
        ];
      }
      const other = w.people[pick.personId];
      const rel = w.relationships[relKey(personId, pick.personId)];
      if (!other) return [];
      if (other.location.kind !== 'lot') return [];
      const fam = rel?.familiarity ?? 0, fr = rel?.friendship ?? 0, tr = rel?.trust ?? 0, ro = rel?.romance ?? 0;
      // Plausible stand-in for the simulation's rules: every social of the content, with the same kind of reasons.
      const list = Object.values(this.content.socials).filter((d) => d.status === 'ready').map((d): MenuOption => {
        const r = d.requires;
        let reason: string | undefined;
        if (r.minFamiliarity !== undefined && fam < r.minFamiliarity) reason = fam <= 0 ? 'Needs an introduction first.' : `Needs to know ${other.firstName} better.`;
        else if (r.maxFamiliarity !== undefined && fam > r.maxFamiliarity) reason = 'Already introduced.';
        else if (r.minFriendship !== undefined && fr < r.minFriendship) reason = 'Needs a closer friendship first.';
        else if (r.minTrust !== undefined && tr < r.minTrust) reason = `${other.firstName} doesn't trust ${me.firstName} enough yet.`;
        else if (r.minRomance !== undefined && ro < r.minRomance) reason = 'Needs more romantic interest first.';
        else if (r.status && !(other.householdId === me.householdId)) reason = `Needs to be ${r.status[0]} first.`;
        else if (r.memory) reason = 'Nothing to make up for.';
        else if (r.romantic && other.householdId !== me.householdId && d.id !== 'flirt') reason = `${other.firstName} is with someone else.`;
        const section = socialSection(d);
        const o = opt(d.id, 'social', reason === undefined, reason);
        return { ...o, section, ...(reason === undefined && section !== 'romantic' && !d.unilateral ? { hint: d.acceptance >= 0.7 ? 'Good odds' : d.acceptance >= 0.5 ? 'Fair odds' : 'Long shot' } : {}) };
      });
      const order = ['friendly', 'romantic', 'mean', 'special'];
      return list.sort((a, b) => order.indexOf(a.section ?? '') - order.indexOf(b.section ?? '') || Number(b.enabled) - Number(a.enabled));
    }
    if (pick.kind === 'object') {
      const lot = w.lots[w.activeLotId];
      const o = lot?.objects[pick.objectId];
      const def = o ? this.content.objects[o.defId] : undefined;
      if (!def) return [];
      return def.interactions.map((id) => {
        if (id === 'sleep') return opt(id, 'object', me.needs.energy < 90, `${me.firstName} is not tired enough.`);
        if (id === 'cookMeal') return opt(id, 'object', (w.households[me.householdId]?.funds ?? 0) >= 1500, 'Groceries cost $15: not enough funds.');
        return opt(id, 'object');
      });
    }
    if (pick.kind === 'item') return [opt('eatMeal', 'object', me.needs.hunger < 95, `${me.firstName} is not hungry.`)];
    if (pick.kind === 'floor') return [opt('goHere', 'move')];
    return [];
  }

  queue(personId: Id, option: MenuOption): Result {
    this.log('queue', personId, option.interactionId);
    const w = this.world;
    const p = w?.people[personId];
    if (!w || !p) return { ok: false, reason: 'Unknown person.' };
    if (!option.enabled) return { ok: false, reason: option.reason ?? 'Not available.' };
    if (p.location.kind !== 'lot') return { ok: false, reason: `${p.firstName} is not home.` };
    if (option.interactionId === 'editOutfits') {
      setTimeout(() => this.events.emit({ type: 'ui.request', what: 'editOutfits', personId }), 50);
      return { ok: true };
    }
    if (option.interactionId === 'planEvent') {
      setTimeout(() => this.events.emit({ type: 'ui.request', what: 'planEvent', personId }), 50);
      return { ok: true };
    }
    if (p.queue.length >= 8) return { ok: false, reason: 'The queue is full (8 actions).' };
    const tok = option.token as { pick: PickResult };
    const target: ActionInstance['target'] = tok.pick.kind === 'person' ? (tok.pick.personId === personId ? { kind: 'self' } : { kind: 'person', personId: tok.pick.personId })
      : tok.pick.kind === 'object' ? { kind: 'object', objectId: tok.pick.objectId, slotId: null }
      : tok.pick.kind === 'item' ? { kind: 'item', itemId: tok.pick.itemId }
      : tok.pick.kind === 'floor' ? { kind: 'tile', x: tok.pick.tile.x, z: tok.pick.tile.z, level: tok.pick.level } : { kind: 'self' };
    const def = this.content.interactions[option.interactionId];
    const minutes = def?.duration.kind === 'fixed' ? def.duration.minutes : this.content.socials[option.interactionId]?.minutes ?? 20;
    this.enqueue(w, p, option.interactionId, target, minutes, 'player');
    return { ok: true };
  }

  goTo(personId: Id, tile: Tile): Result {
    this.log('goTo', personId, tile);
    const w = this.world;
    const p = w?.people[personId];
    if (!w || !p) return { ok: false, reason: 'Unknown person.' };
    if (p.location.kind !== 'lot') return { ok: false, reason: `${p.firstName} is not home.` };
    const lot = w.lots[w.activeLotId];
    if (lot && (tile.x < 0 || tile.z < 0 || tile.x >= lot.width || tile.z >= lot.depth)) return { ok: false, reason: 'That spot is outside the lot.' };
    this.enqueue(w, p, 'goHere', { kind: 'tile', x: tile.x, z: tile.z, level: 0 }, 2, 'player');
    return { ok: true };
  }

  cancel(personId: Id, actionId: Id): void {
    this.log('cancel', personId, actionId);
    const p = this.world?.people[personId];
    if (!p) return;
    const i = p.queue.findIndex((a) => a.id === actionId);
    if (i < 0) return;
    const [a] = p.queue.splice(i, 1);
    if (a) this.events.emit({ type: 'action.finished', personId, actionId, interactionId: a.interactionId, result: 'cancelled' });
    if (i === 0) this.startHead(p);
    this.events.emit({ type: 'person.changed', personId, what: 'queue' });
  }

  reorder(personId: Id, actionId: Id, toIndex: number): void {
    this.log('reorder', personId, actionId, toIndex);
    const p = this.world?.people[personId];
    if (!p) return;
    const i = p.queue.findIndex((a) => a.id === actionId);
    if (i <= 0 || toIndex <= 0 || toIndex >= p.queue.length) return; // the running action stays first
    const [a] = p.queue.splice(i, 1);
    if (a) p.queue.splice(toIndex, 0, a);
    this.events.emit({ type: 'person.changed', personId, what: 'queue' });
  }

  mood(personId: Id): { value: number; label: string; reasons: string[] } {
    const p = this.world?.people[personId];
    if (!p) return { value: 0, label: 'Fine', reasons: [] };
    const reasons: string[] = [];
    let value = 0;
    for (const md of p.moodlets) {
      const def = this.content.moodlets[md.id];
      value += md.value;
      reasons.push(`${def?.name ?? md.id} (${md.value > 0 ? '+' : ''}${md.value})`);
    }
    for (const n of NEED_IDS) {
      const v = p.needs[n];
      if (v < 30) { const pen = v < 15 ? -25 : -12; value += pen; reasons.push(`${needWord(n)} (${pen})`); }
    }
    const avg = NEED_IDS.reduce((s, n) => s + p.needs[n], 0) / NEED_IDS.length;
    value += Math.round((avg - 55) / 2);
    value = Math.max(-100, Math.min(100, value));
    const label = value >= 40 ? 'Happy' : value >= 10 ? 'Fine' : value >= -20 ? 'Uneasy' : 'Miserable';
    return { value, label, reasons };
  }

  updateWardrobe(personId: Id, wd: Wardrobe): Result {
    const p = this.world?.people[personId];
    if (!p) return { ok: false, reason: 'Unknown person.' };
    p.outfits = wd;
    return { ok: true };
  }

  // ---------------------------------------------------------------------------------------------
  // Modes, buy, build
  // ---------------------------------------------------------------------------------------------

  setMode(next: 'live' | 'buy' | 'build'): void {
    this.log('setMode', next);
    if (!this.world || next === this.m) return;
    const wasLive = this.m === 'live';
    if (next !== 'live') {
      if (wasLive) { this.prevSpeed = this.spd || this.prevSpeed; this.spd = 0; this.emit('speed'); }
    } else {
      this.spd = this.prevSpeed || 1;
      this.emit('speed');
    }
    if (this.place) { this.place = null; this.emit('placement'); }
    if (next !== 'build' && this.tool) { this.tool = null; this.preview = null; this.emit('paint'); }
    if (next !== 'build') this.buildTools.clear();
    if (next !== 'buy' && this.selObj) { this.selObj = null; }
    this.setModeInternal(next);
  }

  private setModeInternal(m: GameMode): void { if (this.m !== m) { this.m = m; this.emit('mode'); } }

  startPlacement(defId: string): Result {
    const def = this.content.objects[defId];
    if (!def || !this.world) return { ok: false, reason: 'Unknown object.' };
    this.place = { source: 'buy', defId, objectId: null, inventoryIndex: null, x: Math.floor(this.cam.tx), z: Math.floor(this.cam.tz), level: 0, rot: 0, ok: true, reasons: [], cost: def.price };
    this.validatePlacement();
    this.emit('placement');
    return { ok: true };
  }

  startMove(objectId: Id): Result {
    const o = this.lot()?.objects[objectId];
    if (!o) return { ok: false, reason: 'Unknown object.' };
    this.place = { source: 'move', defId: o.defId, objectId, inventoryIndex: null, x: o.x, z: o.z, level: o.level, rot: o.rot, ok: true, reasons: [], cost: 0 };
    this.validatePlacement();
    this.emit('placement');
    return { ok: true };
  }

  startPlaceFromInventory(index: number): Result {
    const hh = this.household();
    const e = hh?.inventory[index];
    if (!e) return { ok: false, reason: 'Nothing stored there.' };
    this.place = { source: 'inventory', defId: e.object.defId, objectId: e.object.id, inventoryIndex: index, x: Math.floor(this.cam.tx), z: Math.floor(this.cam.tz), level: 0, rot: 0, ok: true, reasons: [], cost: 0 };
    this.validatePlacement();
    this.emit('placement');
    return { ok: true };
  }

  placement(): PlacementState | null { return this.place; }

  placementAt(sx: number, sy: number): void {
    this.log('placementAt', sx, sy);
    if (!this.place) return;
    const wpt = this.screenToWorld(sx, sy);
    const x = Math.floor(wpt.x), z = Math.floor(wpt.z);
    if (x === this.place.x && z === this.place.z) return;
    this.place = { ...this.place, x, z };
    this.validatePlacement();
    this.emit('placement');
  }

  rotatePlacement(dir: 1 | -1 = 1): void {
    if (!this.place) return;
    this.place = { ...this.place, rot: (((this.place.rot + dir) % 4 + 4) % 4) as Rot };
    this.validatePlacement();
    this.emit('placement');
  }

  confirmPlacement(): Result {
    this.log('confirmPlacement');
    const pl = this.place, w = this.world, lot = this.lot(), hh = this.household();
    if (!pl || !w || !lot || !hh) return { ok: false, reason: 'Nothing to place.' };
    if (!pl.ok) return { ok: false, reason: pl.reasons[0] ?? 'Cannot place here.' };
    const def = this.content.objects[pl.defId];
    this.recordUndo(pl.source === 'buy' ? `Buy ${def?.name ?? pl.defId}` : `Move ${def?.name ?? pl.defId}`, () => {
      if (pl.source === 'buy') {
        const r = transact(w, this.events, hh.id, -pl.cost, 'purchase', `Bought ${def?.name ?? pl.defId}`);
        if (!r.ok) return false;
        const id = newId(w, 'obj');
        lot.objects[id] = { id, defId: pl.defId, level: 0, x: pl.x, z: pl.z, rot: pl.rot, finishes: {}, purchasePrice: pl.cost, boughtAt: w.clock.minutes, ownerHouseholdId: hh.id, condition: { dirt: 0, broken: false } };
      } else if (pl.source === 'move' && pl.objectId) {
        const o = lot.objects[pl.objectId];
        if (o) { o.x = pl.x; o.z = pl.z; o.rot = pl.rot; }
      } else if (pl.source === 'inventory' && pl.inventoryIndex !== null) {
        const [e] = hh.inventory.splice(pl.inventoryIndex, 1);
        if (e) lot.objects[e.object.id] = { ...e.object, x: pl.x, z: pl.z, rot: pl.rot };
      }
      return true;
    });
    this.place = null;
    this.events.emit({ type: 'lot.changed', lotId: lot.id, what: 'objects' });
    this.emit('placement');
    this.emit('undo');
    return { ok: true };
  }

  cancelPlacement(): void { if (this.place) { this.place = null; this.emit('placement'); } }

  sell(objectId: Id): Result {
    const w = this.world, lot = this.lot(), hh = this.household();
    const o = lot?.objects[objectId];
    if (!w || !lot || !hh || !o) return { ok: false, reason: 'Unknown object.' };
    const value = this.saleValue(objectId);
    const name = this.content.objects[o.defId]?.name ?? o.defId;
    this.recordUndo(`Sell ${name}`, () => {
      delete lot.objects[objectId];
      transact(w, this.events, hh.id, value, 'sale', `Sold ${name}`);
      return true;
    });
    if (this.selObj === objectId) this.selObj = null;
    this.events.emit({ type: 'lot.changed', lotId: lot.id, what: 'objects' });
    this.emit('undo');
    return { ok: true };
  }

  saleValue(objectId: Id): Cents {
    const o = this.lot()?.objects[objectId];
    return o ? Math.round(o.purchasePrice * 0.8) : 0;
  }

  store(objectId: Id): Result {
    const w = this.world, lot = this.lot(), hh = this.household();
    const o = lot?.objects[objectId];
    if (!w || !lot || !hh || !o) return { ok: false, reason: 'Unknown object.' };
    delete lot.objects[objectId];
    hh.inventory.push({ object: o, storedAt: w.clock.minutes });
    this.events.emit({ type: 'lot.changed', lotId: lot.id, what: 'objects' });
    return { ok: true };
  }

  setObjectFinish(objectId: Id, regionId: string, swatchId: string): Result {
    const o = this.lot()?.objects[objectId];
    if (!o) return { ok: false, reason: 'Unknown object.' };
    o.finishes[regionId] = swatchId;
    return { ok: true };
  }

  selectObject(objectId: Id | null): void { this.log('selectObject', objectId); this.selObj = objectId; this.emit('selection'); }
  selectedObject(): Id | null { return this.selObj; }

  setPaintTool(tool: PaintTool | null): void { this.log('setPaintTool', tool); this.tool = tool; this.preview = null; this.emit('paint'); }
  paintTool(): PaintTool | null { return this.tool; }

  paintPreview(pick: PickResult | null): PaintPreview | null {
    this.log('paintPreview', pick?.kind ?? null);
    if (!pick || !this.tool || this.tool.kind === 'eyedropper') { this.preview = null; return null; }
    const want = this.tool.kind === 'wall' ? 'wall' : 'floor';
    if (pick.kind !== want) { this.preview = { pick, ok: false }; return { ok: false, reason: want === 'wall' ? 'Point at a wall.' : 'Point at a floor tile.', cost: 0, count: 0 }; }
    const design = want === 'wall' ? this.content.wallDesigns[this.tool.finish.designId] : this.content.floorDesigns[this.tool.finish.designId];
    const count = this.tool.scope === 'room' ? (want === 'wall' ? 14 : 48) : 1;
    const cost = (design?.price ?? 300) * count;
    const funds = this.household()?.funds ?? 0;
    const ok = funds >= cost || !!this.world?.settings.unlimitedFunds;
    this.preview = { pick, ok };
    return ok ? { ok, cost, count } : { ok, reason: 'Not enough funds.', cost, count };
  }

  paintApply(pick: PickResult): Result {
    this.log('paintApply', pick.kind);
    const w = this.world, lot = this.lot(), hh = this.household(), tool = this.tool;
    if (!w || !lot || !hh || !tool || tool.kind === 'eyedropper') return { ok: false, reason: 'No paint tool.' };
    const pv = this.paintPreview(pick);
    if (!pv?.ok) return { ok: false, reason: pv?.reason ?? 'Nothing to paint.' };
    this.recordUndo(tool.kind === 'wall' ? 'Paint wall' : 'Change floor', () => {
      if (tool.kind === 'wall' && pick.kind === 'wall') {
        const wall = lot.walls[pick.wallId];
        if (wall) { if (pick.side === 'a') wall.sideA = tool.finish; else wall.sideB = tool.finish; }
      } else if (tool.kind === 'floor' && pick.kind === 'floor') {
        lot.floors[tileKey(0, pick.tile.x, pick.tile.z)] = tool.finish;
      }
      transact(w, this.events, hh.id, -pv.cost, 'build', tool.kind === 'wall' ? 'Wall finish' : 'Floor finish');
      return true;
    });
    const list = this.recent[tool.kind];
    this.recent[tool.kind] = [tool.finish, ...list.filter((f) => f.designId !== tool.finish.designId || f.paletteId !== tool.finish.paletteId)].slice(0, 8);
    this.events.emit({ type: 'lot.changed', lotId: lot.id, what: tool.kind === 'wall' ? 'walls' : 'floors' });
    this.emit('undo');
    return { ok: true };
  }

  eyedrop(pick: PickResult): FinishRef | null {
    this.log('eyedrop', pick.kind);
    const lot = this.lot();
    if (!lot) return null;
    if (pick.kind === 'wall') { const wall = lot.walls[pick.wallId]; return wall ? (pick.side === 'a' ? wall.sideA : wall.sideB) : null; }
    if (pick.kind === 'floor') return lot.floors[tileKey(0, pick.tile.x, pick.tile.z)] ?? null;
    return null;
  }

  recentFinishes(kind: 'wall' | 'floor'): FinishRef[] { return this.recent[kind]; }

  // ---- build mode (structure) ----
  setBuildTool(tool: BuildTool | null): void { this.log('setBuildTool', tool); this.buildTools.setTool(tool); }
  buildTool(): BuildTool | null { return this.buildTools.tool(); }
  buildPreview(target: BuildTarget | null): BuildPreview | null { return this.buildTools.preview(target); }
  buildApply(target: BuildTarget): Result & Partial<BuildApplyResult> { this.log('buildApply', target); return this.buildTools.apply(target); }
  buildCancel(): void { this.buildTools.cancel(); }
  buildHighlight(): ReturnType<GameAPI['buildHighlight']> { return this.buildTools.highlight(); }
  rooms(level?: number): RoomInfo[] { return this.buildTools.rooms(level); }
  roomAt(tile: Tile, level?: number): RoomInfo | null { return this.buildTools.roomAt(tile, level); }
  openingAt(wallId: string): ReturnType<GameAPI['openingAt']> { return this.buildTools.openingAt(wallId); }
  highlightRoom(): void { /* the mock draws nothing */ }

  undo(): string | null {
    const e = this.undoStack.pop();
    if (!e || !this.world) return null;
    this.restore(e.before);
    this.redoStack.push(e);
    this.emit('undo');
    return e.label;
  }

  redo(): string | null {
    const e = this.redoStack.pop();
    if (!e || !this.world) return null;
    this.restore(e.after);
    this.undoStack.push(e);
    this.emit('undo');
    return e.label;
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  // ---------------------------------------------------------------------------------------------
  // Camera and view (2D top-down mock renderer)
  // ---------------------------------------------------------------------------------------------

  view = {
    pick: (sx: number, sy: number): PickResult => this.pickAt(sx, sy),
    groundPoint: (sx: number, sy: number): { x: number; z: number } | null => { const p = this.screenToWorld(sx, sy); return { x: p.x, z: p.z }; },
    pan: (dx: number, dy: number): void => {
      this.log('pan', dx, dy);
      const r = this.unrotate(dx, dy);
      this.cam.tx -= r.x / this.cam.scale;
      this.cam.tz -= r.z / this.cam.scale;
      this.emit('camera');
    },
    zoomAt: (factor: number, sx: number, sy: number): void => {
      this.log('zoomAt', factor, sx, sy);
      const before = this.screenToWorld(sx, sy);
      this.cam.scale = Math.max(10, Math.min(110, this.cam.scale * factor));
      const after = this.screenToWorld(sx, sy);
      this.cam.tx += before.x - after.x;
      this.cam.tz += before.z - after.z;
      this.emit('camera');
    },
    rotate: (dir: 1 | -1): void => { this.log('rotate', dir); this.cam.rot = (((this.cam.rot + dir) % 4 + 4) % 4) as Rot; this.emit('camera'); },
    cutaway: (): CutawayMode => this.cut,
    setCutaway: (mode: CutawayMode): void => { this.log('setCutaway', mode); this.cut = mode; this.emit('camera'); },
    reveal: (): void => {},
    focusPerson: (personId: Id): void => {
      this.log('focusPerson', personId);
      const loc = this.world?.people[personId]?.location;
      if (loc?.kind === 'lot') { this.cam.tx = loc.x; this.cam.tz = loc.z; this.emit('camera'); }
    },
    worldToScreen: (x: number, _y: number, z: number) => this.worldToScreenXZ(x, z),
    anchorOf: (pick: PickResult) => {
      const w = this.world, lot = this.lot();
      if (!w || !lot) return null;
      if (pick.kind === 'person') {
        const loc = w.people[pick.personId]?.location;
        if (loc?.kind !== 'lot') return null;
        const s = this.worldToScreenXZ(loc.x, loc.z);
        return { x: s.x, y: s.y - this.cam.scale * 0.7, visible: s.visible };
      }
      if (pick.kind === 'object') {
        const o = lot.objects[pick.objectId];
        const def = o ? this.content.objects[o.defId] : undefined;
        if (!o || !def) return null;
        const { w: fw, d: fd } = this.footprint(def.footprint, o.rot);
        const s = this.worldToScreenXZ(o.x + fw / 2, o.z + fd / 2);
        return { x: s.x, y: s.y - this.cam.scale * 0.5, visible: s.visible };
      }
      if (pick.kind === 'item') {
        const it = w.items[pick.itemId];
        return it ? this.worldToScreenXZ(it.position.x, it.position.z) : null;
      }
      if (pick.kind === 'floor' || pick.kind === 'wall') return this.worldToScreenXZ(pick.tile.x + 0.5, pick.tile.z + 0.5);
      return null;
    },
    setInsets: (i: { left: number; right: number; top: number; bottom: number }): void => { this.log('setInsets', i); this.insets = { ...i }; },
  };

  portrait(personId: Id): string | null {
    if (!this.portraitsReady) return null;
    const p = this.world?.people[personId];
    if (!p || p.isNpc) return null; // the neighbour never gets one: exercises the initials fallback
    return portraitSvg(p);
  }

  thumbnails = {
    furniture: (defId: string) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="8" y="16" width="48" height="36" rx="6" fill="${pastel(defId)}"/></svg>`),
    surface: (kind: 'wall' | 'floor', designId: string, paletteId: string) => {
      const d = kind === 'wall' ? this.content.wallDesigns[designId] : this.content.floorDesigns[designId];
      const c = d?.palettes.find((p) => p.id === paletteId)?.colors ?? ['#ccc'];
      return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${c[0]}"/><rect width="32" height="32" fill="${c[1] ?? c[0]}"/></svg>`);
    },
    opening: (defId: string) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#efe3d0"/><rect x="18" y="8" width="28" height="50" rx="3" fill="${pastel(defId)}"/></svg>`),
  };

  // ---------------------------------------------------------------------------------------------
  // Settings, sound, diagnostics
  // ---------------------------------------------------------------------------------------------

  settings(): GameSettings { return this.cfg; }
  setSettings(patch: Partial<GameSettings>): void {
    this.log('setSettings', patch);
    this.cfg = { ...this.cfg, ...patch };
    try { localStorage.setItem('hearthside.mock.settings', JSON.stringify(this.cfg)); } catch { /* ignore */ }
    this.emit('settings');
  }
  // ---------------------------------------------------------------------------------------------
  // Neighbourhood (Milestone 7): the pure read/preview functions run for real on the mock world; travel and household
  // changes are simplified (the mock has no simulation clock for schedules): trips take a couple of real seconds.
  // ---------------------------------------------------------------------------------------------

  private simCtx(): SimCtx | null {
    const w = this.world;
    if (!w) return null;
    const nav = { findPath: () => [], isWalkable: () => true, canStep: () => true, slotsOf: () => [], standTilesNear: () => [], invalidate: () => undefined, stats: () => ({ routeRequests: 0, lastRouteMs: 0 }) };
    return { state: w, content: this.content, nav, events: this.events, rng: new Rng(w.rng), res: new Reservations(), now: w.clock.minutes, counters: { routeRequests: 0 } };
  }

  neighbourhood(): NeighbourhoodInfo | null { const c = this.simCtx(); return c ? neighbourhoodInfo(c) : null; }

  whereIs(personId: Id): PersonPlace | null {
    const p = this.world?.people[personId];
    return this.world && p ? placeOf(this.world, p) : null;
  }

  travelProblem(personIds: Id[], lotId: Id): string | null {
    const c = this.simCtx();
    return c ? simTravelProblem(c, personIds, lotId) : 'No game is running.';
  }

  travel(personIds: Id[], lotId: Id): Result & { minutes?: number; arrivesAt?: number } {
    this.log('travel', { personIds, lotId });
    const c = this.simCtx(), w = this.world;
    if (!c || !w) return { ok: false, reason: 'No game is running.' };
    const problem = simTravelProblem(c, personIds, lotId);
    if (problem) return { ok: false, reason: problem };
    const from = w.lots[w.activeLotId]!, to = w.lots[lotId]!;
    const minutes = travelMinutes(from, to);
    const arrivesAt = w.clock.minutes + minutes;
    for (const id of personIds) {
      const p = w.people[id];
      if (p) p.location = { kind: 'offlot', place: 'errand', lotId, since: w.clock.minutes, until: arrivesAt, transit: true };
    }
    const occurrence = `travel:${personIds[0]}:${Math.round(w.clock.minutes)}`;
    w.schedule.push({ occurrence, at: arrivesAt, kind: 'travelArrive', data: { lotId, personIds: personIds.join(','), fromLotId: w.activeLotId } });
    this.events.emit({ type: 'travel', what: 'departed', personIds, lotId });
    this.emit('neighbourhood');
    this.emit('state');
    // The mock clock may be paused: the trip also ends a couple of real seconds after it began.
    setTimeout(() => {
      const ev = w.schedule.find((e) => e.occurrence === occurrence);
      if (ev && this.world === w) { w.schedule.splice(w.schedule.indexOf(ev), 1); this.finishTrip(w, ev); }
    }, 2500);
    return { ok: true, minutes, arrivesAt };
  }

  /** A trip came due: the travellers arrive and the destination becomes the active lot. */
  private finishTrip(w: WorldState, ev: { occurrence: string; data?: Record<string, string | number | boolean | null> }): void {
    markProcessed(w, ev.occurrence);
    const lotId = String(ev.data?.lotId ?? '');
    const personIds = String(ev.data?.personIds ?? '').split(',').filter(Boolean);
    const to = w.lots[lotId];
    if (!to) return;
    const fromId = w.activeLotId;
    for (const p of Object.values(w.people)) {
      if (p.location.kind === 'lot' && !personIds.includes(p.id)) p.location = { kind: 'offlot', place: 'home', lotId: w.households[p.householdId]?.homeLotId ?? undefined, since: w.clock.minutes, until: null };
    }
    w.activeLotId = lotId;
    personIds.forEach((id, i) => {
      const p = w.people[id];
      if (p) p.location = { kind: 'lot', lotId, level: 0, x: to.entry.x + 0.5 + i, z: to.entry.z + 0.5, facing: Math.PI, posture: 'standing' };
    });
    addFeed(w, this.events, 'info', `${personIds.map((id) => w.people[id]?.firstName).join(' and ')} arrived at ${to.name}.`, personIds[0]);
    this.events.emit({ type: 'lot.activated', lotId, fromLotId: fromId });
    this.events.emit({ type: 'travel', what: 'arrived', personIds, lotId });
    this.emit('lot');
    this.emit('neighbourhood');
    this.emit('state');
  }

  goHome(personIds?: Id[]): Result & { minutes?: number; arrivesAt?: number } {
    const w = this.world;
    const hh = w ? w.households[w.activeHouseholdId] : undefined;
    if (!w || !hh?.homeLotId) return { ok: false, reason: 'There is no home to go to.' };
    const ids = personIds ?? hh.memberIds.filter((id) => { const loc = w.people[id]?.location; return loc?.kind === 'lot' && loc.lotId !== hh.homeLotId; });
    if (ids.length === 0) return { ok: false, reason: 'Everybody is already home.' };
    return this.travel(ids, hh.homeLotId);
  }

  inviteHome(hostId: Id, guestId: Id): Result {
    this.log('inviteHome', { hostId, guestId });
    const w = this.world;
    const guest = w?.people[guestId];
    if (!w || !guest) return { ok: false, reason: 'Unknown person.' };
    addFeed(w, this.events, 'social', `${guest.firstName} will come over in about an hour.`, hostId);
    return { ok: true };
  }

  switchPreview(householdId: Id): SwitchPreview | null { const c = this.simCtx(); return c ? simSwitchPreview(c, householdId) : null; }

  switchHousehold(householdId: Id): Result {
    this.log('switchHousehold', householdId);
    const c = this.simCtx(), w = this.world;
    if (!c || !w) return { ok: false, reason: 'No game is running.' };
    const preview = simSwitchPreview(c, householdId);
    if (!preview.ok) return { ok: false, reason: preview.reason ?? 'Not possible.' };
    const old = w.households[w.activeHouseholdId]!, next = w.households[householdId]!;
    for (const id of old.memberIds) { const p = w.people[id]; if (p) { p.isNpc = true; p.location = { kind: 'offlot', place: 'home', lotId: old.homeLotId ?? undefined, since: w.clock.minutes, until: null }; } }
    old.isPlayable = false;
    next.isPlayable = true;
    w.activeHouseholdId = next.id;
    const fromId = w.activeLotId;
    w.activeLotId = next.homeLotId!;
    next.memberIds.forEach((id, i) => {
      const p = w.people[id];
      const lot = w.lots[next.homeLotId!]!;
      if (p) { p.isNpc = false; p.location = { kind: 'lot', lotId: lot.id, level: 0, x: lot.entry.x + 0.5 + i, z: lot.entry.z + 0.5, facing: Math.PI, posture: 'standing' }; }
    });
    this.sel = next.memberIds[0] ?? null;
    addFeed(w, this.events, 'info', `You are now playing the ${next.name} household.`);
    this.events.emit({ type: 'household.switched', fromId: old.id, toId: next.id });
    this.events.emit({ type: 'lot.activated', lotId: w.activeLotId, fromLotId: fromId });
    this.emit('selection');
    this.emit('lot');
    this.emit('neighbourhood');
    this.emit('state');
    return { ok: true };
  }

  movePreview(lotId: Id): MovePreview | null { const c = this.simCtx(); return c ? simMovePreview(c, lotId) : null; }

  moveHousehold(lotId: Id): Result {
    this.log('moveHousehold', lotId);
    const c = this.simCtx(), w = this.world;
    if (!c || !w) return { ok: false, reason: 'No game is running.' };
    const pv = simMovePreview(c, lotId);
    if (!pv.ok) return { ok: false, reason: pv.reason ?? 'Not possible.' };
    const hh = w.households[w.activeHouseholdId]!;
    transact(w, this.events, hh.id, -pv.cost, 'bill', 'Moving in');
    hh.homeLotId = lotId;
    addFeed(w, this.events, 'info', `The ${hh.name} household moved to ${w.lots[lotId]!.name}.`);
    this.events.emit({ type: 'household.moved', householdId: hh.id, fromLotId: null, toLotId: lotId });
    this.emit('neighbourhood');
    this.emit('state');
    return { ok: true };
  }

  eventProblem(req: PlanEventRequest): string | null {
    const w = this.world;
    const def = this.content.events?.[req.type];
    if (!w || !def) return 'That kind of gathering is not available.';
    if ((w.homeEvents ?? []).some((e) => e.status === 'invited' || e.status === 'running')) return 'Another gathering is already planned.';
    if (req.guestIds.length < def.minGuests) return def.minGuests === 1 ? 'Choose a guest.' : `Invite at least ${def.minGuests} guests.`;
    if (req.guestIds.length > def.maxGuests) return `At most ${def.maxGuests} guests.`;
    return null;
  }

  planEvent(req: PlanEventRequest): Result & { eventId?: Id } {
    this.log('planEvent', req);
    const w = this.world, def = this.content.events?.[req.type];
    const problem = this.eventProblem(req);
    if (!w || !def) return { ok: false, reason: 'No game is running.' };
    if (problem) return { ok: false, reason: problem };
    const ev: HomeEvent = {
      id: newId(w, 'evt'), type: req.type, title: def.name, status: 'invited', hostId: req.hostId, householdId: w.activeHouseholdId, lotId: w.activeLotId,
      guestIds: [...req.guestIds], arrivedIds: [], createdAt: w.clock.minutes, startAt: req.startAt, endAt: req.startAt + def.minutes,
      goals: def.goals.map((g) => ({ kind: g.kind, text: g.text, weight: g.weight, target: Math.max(g.target, Math.round((g.perGuest ?? 0) * req.guestIds.length)), progress: 0, done: false })),
      pairs: [], ate: [],
    };
    (w.homeEvents ??= []).push(ev);
    addFeed(w, this.events, 'social', `Invitations sent for the ${def.name.toLowerCase()}.`);
    this.events.emit({ type: 'homeEvent', eventId: ev.id, what: 'planned' });
    this.emit('state');
    return { ok: true, eventId: ev.id };
  }

  cancelEvent(eventId: Id): Result {
    const ev = this.world?.homeEvents?.find((e) => e.id === eventId);
    if (!ev || ev.status !== 'invited') return { ok: false, reason: 'It has already started.' };
    ev.status = 'cancelled';
    this.events.emit({ type: 'homeEvent', eventId, what: 'cancelled' });
    this.emit('state');
    return { ok: true };
  }

  setSimSettings(patch: Partial<SimSettings>): void {
    this.log('setSimSettings', patch);
    if (!this.world) return;
    this.world.settings = { ...this.world.settings, ...patch };
    this.emit('state');
  }
  sound(id: SoundId): void { this.soundLog.push(id); if (this.soundLog.length > 200) this.soundLog.shift(); }
  devStats(): DevStats { return { ...this.stats }; }

  // ---------------------------------------------------------------------------------------------
  // World building
  // ---------------------------------------------------------------------------------------------

  private buildWorld(mode: StartMode, d: HouseholdDraft, demo: boolean): WorldState {
    const w = createEmptyWorld(1234, mode);
    const lot: Lot = {
      id: newId(w, 'lot'), name: 'Hearthside Cottage', address: '12 Willow Lane', kind: 'residential', width: 24, depth: 24,
      landValue: 1500000, ownerHouseholdId: null, entry: { x: 12, z: 23, level: 0 }, levels: 1, walls: {}, floors: {}, openings: {}, objects: {}, ground: 'grass',
    };
    w.lots[lot.id] = lot;
    w.activeLotId = lot.id;
    const wallFinish: FinishRef = { designId: 'plain-paint', paletteId: 'p1' };
    const floorFinish: FinishRef = { designId: 'oak-planks', paletteId: 'p1' };
    for (let x = 6; x < 18; x++) for (const z of [6, 16]) lot.walls[edgeKey(0, 'h', x, z)] = { id: edgeKey(0, 'h', x, z), level: 0, dir: 'h', x, z, height: 2.8, sideA: wallFinish, sideB: wallFinish };
    for (let z = 6; z < 16; z++) for (const x of [6, 18, 12]) {
      if (x === 12 && (z === 9 || z === 13)) continue; // doorways
      lot.walls[edgeKey(0, 'v', x, z)] = { id: edgeKey(0, 'v', x, z), level: 0, dir: 'v', x, z, height: 2.8, sideA: wallFinish, sideB: wallFinish };
    }
    for (let x = 6; x < 18; x++) for (let z = 6; z < 16; z++) lot.floors[tileKey(0, x, z)] = x >= 12 ? { designId: 'checker-tile', paletteId: 'p1' } : floorFinish;
    const hh = addHousehold(w, d.name, mode === 'sandbox' ? 2000000 : 1825000, lot.id, true);
    lot.ownerHouseholdId = hh.id;
    w.activeHouseholdId = hh.id;
    transact(w, null, hh.id, 0, 'start', 'Starting funds');
    const place = (defId: string, x: number, z: number, rot: Rot = 0) => {
      if (!this.content.objects[defId]) return;
      const id = newId(w, 'obj');
      lot.objects[id] = { id, defId, level: 0, x, z, rot, finishes: {}, purchasePrice: this.content.objects[defId]?.price ?? 0, boughtAt: 0, ownerHouseholdId: hh.id, condition: { dirt: 0, broken: false } };
      return id;
    };
    place('bed-double-oak', 7, 7);
    place('wardrobe-tall', 10, 7);
    place('bookcase-open', 7, 14);
    place('sofa-tweed', 8, 11);
    place('tv-flatscreen', 8, 9);
    const fridge = place('fridge-standard', 13, 7);
    place('stove-basic', 14, 7);
    const table = place('table-dining-oak', 15, 11);
    place('plant-potted', 17, 15);
    place('toilet-basic', 16, 7);
    place('shower-stall', 17, 7);

    const members: Person[] = d.members.map((m, i) => this.personFromDraft(w, m, hh.id, { kind: 'lot', lotId: lot.id, level: 0, x: 9.5 + i * 4, z: 12.5, facing: 0, posture: 'standing' }));
    for (const p of members) hh.memberIds.push(p.id);
    for (const t of d.ties) {
      const a = members[t.a], b = members[t.b];
      if (!a || !b) continue;
      const key = pairKey(a.id, b.id);
      w.bonds[key] = { a: a.id < b.id ? a.id : b.id, b: a.id < b.id ? b.id : a.id, status: t.tie === 'spouse' ? 'spouse' : 'friend', familyAtoB: a.id < b.id ? t.tie : t.tie === 'parent' ? 'child' : t.tie === 'child' ? 'parent' : t.tie, since: 0 };
      this.setRel(w, a.id, b.id, 80, 72, t.tie === 'spouse' ? 65 : 0);
      this.setRel(w, b.id, a.id, 80, 68, t.tie === 'spouse' ? 70 : 0);
    }
    // neighbour household
    const nh = addHousehold(w, 'Whitlock', 900000, null, false);
    const june = this.personFromDraft(w, draft('June', 'Whitlock', SHE, '#e2b99a', '#a3622b', ['cheerful', 'romantic', 'neat'], null, null), nh.id, { kind: 'offlot', place: 'home', since: 0, until: null });
    june.isNpc = true;
    nh.memberIds.push(june.id);
    // The neighbourhood: twelve more lot records (empty here), June's house on the map, a rental and a house for sale.
    const lots = createNeighbourhoodLots(w, new Rng(seedRng(7)), 'Willow Lane');
    lot.map = { x: 40, y: 84 };
    const juneHome = w.lots[lots.byKey.res1!]!;
    juneHome.name = 'Whitlock Cottage';
    delete juneHome.rent;
    juneHome.ownerHouseholdId = nh.id;
    nh.homeLotId = juneHome.id;
    june.location = { kind: 'offlot', place: 'home', lotId: juneHome.id, since: 0, until: null };
    w.neighbourhood = { version: 1, street: 'Willow Lane', npcHouseholdIds: [], nextDoorHouseholdId: nh.id };
    const ada = members[0], theo = members[1];
    if (ada) {
      this.setRel(w, ada.id, june.id, 30, 18, 0);
      this.setRel(w, june.id, ada.id, 30, 22, 0);
      w.bonds[pairKey(ada.id, june.id)] = { a: ada.id < june.id ? ada.id : june.id, b: ada.id < june.id ? june.id : ada.id, status: 'acquaintance', familyAtoB: 'none', since: 0 };
    }
    if (demo && ada) {
      // Relationship detail for the People tab: a quarrel with June (still unsettled) and a milestone.
      const now = w.clock.minutes;
      ada.memories.push(
        { id: newId(w, 'mem'), at: now - 600, kind: 'met', withId: june.id, text: 'Ada and June introduced themselves.', importance: 1, count: 1 },
        { id: newId(w, 'mem'), at: now - 90, kind: 'argument', withId: june.id, text: 'Ada and June had a heated argument.', importance: 2, count: 2 },
        { id: newId(w, 'mem'), at: now - 1200, kind: 'movedIn', text: 'Moved into Willow Lane.', importance: 3, count: 1 });
      const jr = w.relationships[relKey(ada.id, june.id)];
      if (jr) { jr.friendship = 34; jr.trust = 12; jr.romance = 8; jr.label = 'friend'; }
      const def = this.content.events?.dinnerParty;
      if (def && theo) {
        (w.homeEvents ??= []).push({
          id: newId(w, 'evt'), type: 'dinnerParty', title: def.name, status: 'running', hostId: ada.id, householdId: hh.id, lotId: lot.id,
          guestIds: [june.id], arrivedIds: [june.id], createdAt: now - 60, startAt: now - 30, endAt: now + 120,
          goals: def.goals.map((g, i) => ({ kind: g.kind, text: g.text, weight: g.weight, target: Math.max(g.target, Math.round((g.perGuest ?? 0) * 3)), progress: i === 0 ? 2 : i === 1 ? 1 : 0, done: false })),
          pairs: [], ate: [], catered: 3600,
        });
      }
      ada.needs = { hunger: 34, energy: 72, hygiene: 58, bladder: 81, fun: 46, social: 18 };
      ada.moodlets = [{ id: 'wellRested', value: 15, until: START_MINUTE + 240 }];
      ada.skills = { cooking: { level: 2, xp: 180 }, charisma: { level: 1, xp: 40 }, logic: { level: 1, xp: 10 } };
      if (ada.career) ada.career = { ...ada.career, level: 2, performance: 35, daysWorked: 6 };
      if (ada.aspiration) ada.aspiration.progress = { cook3: 1 };
      if (fridge) {
        const a = this.enqueue(w, ada, 'cookMeal', { kind: 'object', objectId: fridge, slotId: null }, 45, 'player');
        a.elapsed = 18;
      }
      this.enqueue(w, ada, 'watchTv', { kind: 'self' }, 60, 'autonomy');
      this.enqueue(w, ada, 'phoneChat', { kind: 'self' }, 20, 'player');
    }
    if (demo && theo) {
      theo.needs = { hunger: 66, energy: 41, hygiene: 77, bladder: 52, fun: 63, social: 55 };
      theo.location = { kind: 'offlot', place: 'errand', since: START_MINUTE - 60, until: START_MINUTE + 90 };
      theo.skills = { logic: { level: 3, xp: 300 }, gardening: { level: 1, xp: 30 } };
      w.schedule.push({ occurrence: `return:${theo.id}:0`, at: START_MINUTE + 90, kind: 'custom', personId: theo.id });
    }
    if (table) {
      const id = newId(w, 'itm');
      w.items[id] = { id, kind: 'meal', lotId: lot.id, position: { x: 15.5, z: 11.5, level: 0, onObjectId: table }, recipeId: 'pancakes', portions: 3, quality: 0.8, createdAt: START_MINUTE, spoilsAt: START_MINUTE + 600, ownerHouseholdId: hh.id };
    }
    addFeed(w, null, 'info', `Welcome to Willow Lane, ${d.name} household!`);
    if (demo) {
      addFeed(w, null, 'money', 'Received $120 from the street fair raffle.', ada?.id);
      addFeed(w, null, 'social', 'Ada Hart and June Whitlock had a friendly chat.', ada?.id);
      addFeed(w, null, 'need', 'Ada Hart is getting lonely.', ada?.id);
    }
    return w;
  }

  private personFromDraft(w: WorldState, d: PersonDraft, householdId: Id, location: PersonLocation): Person {
    const career: CareerState | null = d.careerId && this.content.careers[d.careerId]
      ? { careerId: d.careerId, level: 1, performance: 10, joinedAt: 0, daysWorked: 0, shift: { occurrence: 'shift:x:0', status: 'upcoming', workedMinutes: 0, lateMinutes: 0 } }
      : null;
    const p: Person = {
      id: newId(w, 'per'), householdId, firstName: d.firstName, lastName: d.lastName, pronouns: d.pronouns, lifeStage: d.lifeStage, bio: d.bio,
      voice: d.voice, walkStyle: d.walkStyle, romance: d.romance, appearance: d.appearance, outfits: d.outfits, traits: d.traits.slice(0, 3),
      likes: d.likes, dislikes: d.dislikes,
      aspiration: d.aspirationId ? { aspirationId: d.aspirationId, stage: 0, progress: {}, completedStages: 0, rewards: [] } : null,
      needs: { hunger: 80, energy: 80, hygiene: 80, bladder: 80, fun: 70, social: 60 }, moodlets: [], skills: {}, career, location, queue: [],
      memories: [], cooldowns: {}, anim: { id: 'idle', since: 0, loop: true }, thought: null, createdAt: w.clock.minutes, isNpc: false,
    };
    if (career) career.shift = { occurrence: `shift:${p.id}:0`, status: 'upcoming', workedMinutes: 0, lateMinutes: 0 };
    w.people[p.id] = p;
    return p;
  }

  private setRel(w: WorldState, from: Id, to: Id, familiarity: number, friendship: number, romance: number): void {
    w.relationships[relKey(from, to)] = { from, to, familiarity, friendship, trust: friendship / 2, romance, lastInteractionAt: null, recent: {} };
  }

  private enqueue(w: WorldState, p: Person, interactionId: string, target: ActionInstance['target'], minutes: number, source: ActionInstance['source']): ActionInstance {
    const a: ActionInstance = {
      id: newId(w, 'act'), interactionId, actorId: p.id, source, target, phase: 'queued', phaseSince: w.clock.minutes, route: [], elapsed: 0,
      duration: minutes, replans: 0, failureReason: null, data: {}, cancelRequested: false, queuedAt: w.clock.minutes,
    };
    p.queue.push(a);
    if (p.queue.length === 1) this.startHead(p, w);
    this.events.emit({ type: 'person.changed', personId: p.id, what: 'queue' });
    return a;
  }

  private startHead(p: Person, world?: WorldState): void {
    const a = p.queue[0];
    const w = world ?? this.world;
    if (!a || !w) return;
    a.phase = a.interactionId === 'goHere' ? 'route' : 'perform';
    a.phaseSince = w.clock.minutes;
    this.events.emit({ type: 'action.started', personId: p.id, actionId: a.id, interactionId: a.interactionId });
  }

  private validatePlacement(): void {
    const pl = this.place, lot = this.lot();
    if (!pl || !lot) return;
    const def = this.content.objects[pl.defId];
    const fp = this.footprint(def?.footprint ?? { w: 1, d: 1 }, pl.rot);
    const reasons: string[] = [];
    if (pl.x < 0 || pl.z < 0 || pl.x + fp.w > lot.width || pl.z + fp.d > lot.depth) reasons.push('Outside the lot.');
    for (const o of Object.values(lot.objects)) {
      if (o.id === pl.objectId) continue;
      const od = this.content.objects[o.defId];
      const ofp = this.footprint(od?.footprint ?? { w: 1, d: 1 }, o.rot);
      if (pl.x < o.x + ofp.w && pl.x + fp.w > o.x && pl.z < o.z + ofp.d && pl.z + fp.d > o.z) { reasons.push(`Blocked: ${od?.name ?? 'an object'} is in the way.`); break; }
    }
    const hh = this.household();
    if (pl.source === 'buy' && hh && hh.funds < pl.cost && !this.world?.settings.unlimitedFunds) reasons.push('Not enough funds.');
    pl.ok = reasons.length === 0;
    pl.reasons = reasons;
  }

  private recordUndo(label: string, fn: () => boolean): void {
    const before = this.snapshot();
    if (!fn()) return;
    this.undoStack.push({ label, before, after: this.snapshot() });
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  private snapshot(): string { const lot = this.lot(), hh = this.household(); return JSON.stringify({ lot, funds: hh?.funds, inv: hh?.inventory }); }
  private restore(json: string): void {
    const w = this.world;
    if (!w) return;
    const s = JSON.parse(json) as { lot: Lot; funds: number; inv: [] };
    w.lots[s.lot.id] = s.lot;
    const hh = this.household();
    if (hh) { hh.funds = s.funds; hh.inventory = s.inv; }
    this.events.emit({ type: 'lot.changed', lotId: s.lot.id, what: 'all' });
  }

  private lot(): Lot | undefined { return this.world ? this.world.lots[this.world.activeLotId] : undefined; }
  private household() { return this.world ? this.world.households[this.world.activeHouseholdId] : undefined; }
  private footprint(f: { w: number; d: number }, rot: Rot) { return rot % 2 === 0 ? { w: f.w, d: f.d } : { w: f.d, d: f.w }; }

  // ---------------------------------------------------------------------------------------------
  // Simulation (very rough) and drawing
  // ---------------------------------------------------------------------------------------------

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.lastFrame ? Math.min(0.25, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    if (dt > 0) {
      this.stats.fps = Math.round(0.9 * this.stats.fps + 0.1 * (1 / dt));
      this.stats.frameMs = Math.round((0.9 * this.stats.frameMs + 0.1 * dt * 1000) * 10) / 10;
    }
    const w = this.m === 'menu' ? this.backdrop : this.world;
    if (w && this.world === w && (this.m === 'live') && this.spd > 0) this.simulate(w, dt * SPEED_MINUTES_PER_SECOND[this.spd]);
    this.draw(w);
  };

  private simulate(w: WorldState, minutes: number): void {
    if (minutes <= 0) return;
    const before = w.clock.minutes;
    w.clock.minutes += minutes;
    w.clock.ticks += Math.round(minutes * 4);
    const hh = w.households[w.activeHouseholdId];
    for (const p of householdMembers(w, w.activeHouseholdId)) {
      const rate = p.location.kind === 'lot' ? 1 : 0.4;
      const decay: Needs = { hunger: 0.09, energy: 0.06, hygiene: 0.05, bladder: 0.12, fun: 0.07, social: 0.05 };
      for (const n of NEED_IDS) p.needs[n] = Math.max(0, Math.min(100, p.needs[n] - decay[n] * rate * minutes));
      const head = p.queue[0];
      if (head && p.location.kind === 'lot') {
        if (head.phase === 'route' && w.clock.minutes - head.phaseSince > 1) { head.phase = 'perform'; head.phaseSince = w.clock.minutes; }
        if (head.phase === 'perform') {
          head.elapsed += minutes;
          const def = this.content.interactions[head.interactionId];
          for (const [n, v] of Object.entries(def?.needsPerHour ?? {}) as Array<[NeedId, number]>) p.needs[n] = Math.max(0, Math.min(100, p.needs[n] + (v * minutes) / 60));
          if (head.target.kind === 'tile' && p.location.kind === 'lot') { p.location.x = head.target.x + 0.5; p.location.z = head.target.z + 0.5; }
          if (head.duration !== null && head.elapsed >= head.duration) {
            p.queue.shift();
            if (head.interactionId === 'phoneChat') p.needs.social = Math.min(100, p.needs.social + 30);
            this.events.emit({ type: 'action.finished', personId: p.id, actionId: head.id, interactionId: head.interactionId, result: 'done' });
            if (head.interactionId === 'cookMeal') addFeed(w, this.events, 'info', `${p.firstName} cooked a tasty meal.`, p.id);
            this.startHead(p);
          }
        }
      }
    }
    // scheduled returns and a career day
    for (const ev of [...w.schedule]) {
      if (ev.at > w.clock.minutes) continue;
      w.schedule.splice(w.schedule.indexOf(ev), 1);
      if (ev.kind === 'travelArrive') { this.finishTrip(w, ev); continue; }
      const p = ev.personId ? w.people[ev.personId] : undefined;
      if (!p || !hh) continue;
      p.location = { kind: 'lot', lotId: w.activeLotId, level: 0, x: 12.5, z: 22.5, facing: Math.PI, posture: 'standing' };
      if (ev.kind === 'returnFromWork' && p.career) {
        const lvl = this.content.careers[p.career.careerId]?.levels[p.career.level - 1];
        const pay = lvl ? Math.round(lvl.hourlyWage * ((lvl.end - lvl.start) / 60)) : 10000;
        transact(w, this.events, hh.id, pay, 'wage', `${p.firstName}'s pay`);
        if (p.career.shift) p.career.shift.status = 'done';
        this.events.emit({ type: 'career', personId: p.id, what: 'returned', amount: pay });
        addFeed(w, this.events, 'career', `${p.firstName} came home from work and earned $${(pay / 100).toFixed(0)}.`, p.id);
      } else {
        addFeed(w, this.events, 'info', `${p.firstName} is back home.`, p.id);
      }
      this.events.emit({ type: 'person.changed', personId: p.id, what: 'location' });
    }
    for (const p of householdMembers(w, w.activeHouseholdId)) {
      const lvl = p.career ? this.content.careers[p.career.careerId]?.levels[p.career.level - 1] : undefined;
      if (!p.career || !lvl || p.location.kind !== 'lot' || p.career.shift?.status !== 'upcoming') continue;
      const leaveAt = Math.floor(w.clock.minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY + lvl.start - 15;
      if (before < leaveAt && w.clock.minutes >= leaveAt) {
        p.queue = [];
        const until = leaveAt + 15 + (lvl.end - lvl.start);
        p.location = { kind: 'offlot', place: 'work', since: w.clock.minutes, until };
        p.career.shift.status = 'atWork';
        w.schedule.push({ occurrence: `ret:${p.id}:${until}`, at: until, kind: 'returnFromWork', personId: p.id });
        this.events.emit({ type: 'career', personId: p.id, what: 'leftForWork' });
        addFeed(w, this.events, 'career', `${p.firstName} left for work at the bistro.`, p.id);
        this.events.emit({ type: 'person.changed', personId: p.id, what: 'location' });
      }
    }
    if (w.clock.minutes >= this.nextEventAt) {
      this.nextEventAt = w.clock.minutes + 90;
      const ada = householdMembers(w, w.activeHouseholdId)[0];
      const june = Object.values(w.people).find((p) => p.isNpc);
      if (ada && june && ada.location.kind === 'lot') {
        this.events.emit({ type: 'social', actorId: ada.id, targetId: june.id, socialId: 'chat', accepted: true, line: `${ada.firstName} and ${june.firstName} swapped garden tips.` });
        addFeed(w, this.events, 'social', `${ada.firstName} and ${june.firstName} swapped garden tips.`, ada.id);
        const rel = w.relationships[relKey(ada.id, june.id)];
        if (rel) rel.friendship = Math.min(100, rel.friendship + 4);
      }
    }
    if (Math.floor(before / MINUTES_PER_DAY) !== Math.floor(w.clock.minutes / MINUTES_PER_DAY)) {
      this.events.emit({ type: 'notify', text: 'A new day begins.', kind: 'info' });
    }
    this.events.emit({ type: 'tick', minutes: w.clock.minutes });
  }

  // projection ---------------------------------------------------------------------------------

  private canvasSize(): { w: number; h: number } {
    const r = this.o.canvas.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }
  private center(): { x: number; y: number } {
    const { w, h } = this.canvasSize();
    const i = this.insets;
    return { x: i.left + (w - i.left - i.right) / 2, y: i.top + (h - i.top - i.bottom) / 2 };
  }
  private rotate(x: number, z: number): { x: number; z: number } {
    switch (this.cam.rot) {
      case 1: return { x: -z, z: x };
      case 2: return { x: -x, z: -z };
      case 3: return { x: z, z: -x };
      default: return { x, z };
    }
  }
  private unrotate(x: number, z: number): { x: number; z: number } {
    switch (this.cam.rot) {
      case 1: return { x: z, z: -x };
      case 2: return { x: -x, z: -z };
      case 3: return { x: -z, z: x };
      default: return { x, z };
    }
  }
  private worldToScreenXZ(x: number, z: number): { x: number; y: number; visible: boolean } {
    const c = this.center();
    const r = this.rotate(x - this.cam.tx, z - this.cam.tz);
    const sx = c.x + r.x * this.cam.scale, sy = c.y + r.z * this.cam.scale;
    const { w, h } = this.canvasSize();
    return { x: sx, y: sy, visible: sx >= 0 && sy >= 0 && sx <= w && sy <= h };
  }
  private screenToWorld(sx: number, sy: number): { x: number; z: number } {
    const c = this.center();
    const r = this.unrotate((sx - c.x) / this.cam.scale, (sy - c.y) / this.cam.scale);
    return { x: r.x + this.cam.tx, z: r.z + this.cam.tz };
  }

  private pickAt(sx: number, sy: number): PickResult {
    const w = this.world, lot = this.lot();
    if (!w || !lot) return { kind: 'none' };
    const pt = this.screenToWorld(sx, sy);
    for (const p of Object.values(w.people)) {
      if (p.location.kind !== 'lot') continue;
      if (Math.hypot(p.location.x - pt.x, p.location.z - pt.z) < 0.5) return { kind: 'person', personId: p.id };
    }
    for (const it of Object.values(w.items)) if (Math.hypot(it.position.x - pt.x, it.position.z - pt.z) < 0.3) return { kind: 'item', itemId: it.id };
    for (const o of Object.values(lot.objects)) {
      const def = this.content.objects[o.defId];
      const fp = this.footprint(def?.footprint ?? { w: 1, d: 1 }, o.rot);
      if (pt.x >= o.x && pt.x < o.x + fp.w && pt.z >= o.z && pt.z < o.z + fp.d) return { kind: 'object', objectId: o.id };
    }
    const tx = Math.floor(pt.x), tz = Math.floor(pt.z);
    if (tx < 0 || tz < 0 || tx >= lot.width || tz >= lot.depth) return { kind: 'none' };
    const fx = pt.x - tx, fz = pt.z - tz;
    const near = 0.15;
    const tryWall = (dir: 'h' | 'v', x: number, z: number, side: 'a' | 'b'): PickResult | null => {
      const id = edgeKey(0, dir, x, z);
      return lot.walls[id] ? { kind: 'wall', wallId: id, side, tile: { x: tx, z: tz }, level: 0 } : null;
    };
    const wall = (fz < near && tryWall('h', tx, tz, 'b')) || (fz > 1 - near && tryWall('h', tx, tz + 1, 'a'))
      || (fx < near && tryWall('v', tx, tz, 'b')) || (fx > 1 - near && tryWall('v', tx + 1, tz, 'a'));
    if (wall) return wall;
    return { kind: 'floor', tile: { x: tx, z: tz }, level: 0 };
  }

  private draw(w: WorldState | null): void {
    const cv = this.o.canvas;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const { w: cw, h: ch } = this.canvasSize();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#9db88a';
    ctx.fillRect(0, 0, cw, ch);
    const lot = w ? w.lots[w.activeLotId] : undefined;
    if (!w || !lot) return;
    const s = this.cam.scale;
    const quad = (x: number, z: number, wd: number, dp: number) => {
      const a = this.worldToScreenXZ(x, z), b = this.worldToScreenXZ(x + wd, z + dp);
      return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    };
    // lot
    const lr = quad(0, 0, lot.width, lot.depth);
    ctx.fillStyle = '#a9c596'; ctx.fillRect(lr.x, lr.y, lr.w, lr.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
    for (let i = 0; i <= lot.width; i++) { const a = this.worldToScreenXZ(i, 0), b = this.worldToScreenXZ(i, lot.depth); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    for (let i = 0; i <= lot.depth; i++) { const a = this.worldToScreenXZ(0, i), b = this.worldToScreenXZ(lot.width, i); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    // floors
    for (const [key, f] of Object.entries(lot.floors)) {
      const [, xs, zs] = key.split(':');
      const r = quad(Number(xs), Number(zs), 1, 1);
      const d = this.content.floorDesigns[f.designId];
      const cols = d?.palettes.find((p) => p.id === f.paletteId)?.colors ?? ['#d8c8b0'];
      ctx.fillStyle = (Number(xs) + Number(zs)) % 2 && cols[1] ? cols[1] : cols[0] ?? '#d8c8b0';
      ctx.fillRect(r.x, r.y, r.w + 0.5, r.h + 0.5);
    }
    // objects
    ctx.font = `600 ${Math.max(9, Math.min(13, s * 0.36))}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const o of Object.values(lot.objects)) {
      const def = this.content.objects[o.defId];
      const fp = this.footprint(def?.footprint ?? { w: 1, d: 1 }, o.rot);
      const r = quad(o.x + 0.06, o.z + 0.06, fp.w - 0.12, fp.d - 0.12);
      ctx.fillStyle = o.id === this.selObj ? '#f3c9a6' : '#efe6d8';
      ctx.strokeStyle = o.id === this.selObj ? '#d9774b' : '#7d6a58';
      ctx.lineWidth = o.id === this.selObj ? 3 : 1.5;
      ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 4); ctx.fill(); ctx.stroke();
      if (s > 18) { ctx.fillStyle = '#4b4038'; ctx.fillText((def?.name ?? o.defId).split(' ').slice(-1)[0] ?? '', r.x + r.w / 2, r.y + r.h / 2); }
    }
    for (const it of Object.values(w.items)) {
      const p = this.worldToScreenXZ(it.position.x, it.position.z);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#c98f6a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // walls
    if (this.cut !== 'down') {
      for (const wall of Object.values(lot.walls)) {
        const a = this.worldToScreenXZ(wall.x, wall.z);
        const b = wall.dir === 'h' ? this.worldToScreenXZ(wall.x + 1, wall.z) : this.worldToScreenXZ(wall.x, wall.z + 1);
        const d = this.content.wallDesigns[wall.sideB.designId];
        ctx.strokeStyle = d?.palettes.find((p) => p.id === wall.sideB.paletteId)?.colors[0] ?? '#e8dccb';
        ctx.lineWidth = this.cut === 'up' ? Math.max(4, s * 0.22) : Math.max(3, s * 0.14);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(60,40,20,0.45)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    // paint preview
    if (this.preview) {
      const pk = this.preview.pick;
      if (pk.kind === 'floor' || pk.kind === 'wall') {
        const r = quad(pk.tile.x, pk.tile.z, 1, 1);
        ctx.fillStyle = this.preview.ok ? 'rgba(47,143,131,0.35)' : 'rgba(200,71,61,0.35)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    }
    // people
    for (const p of Object.values(w.people)) {
      if (p.location.kind !== 'lot') continue;
      const c = this.worldToScreenXZ(p.location.x, p.location.z);
      if (p.id === this.sel) {
        ctx.strokeStyle = 'rgba(255,230,150,0.95)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(c.x, c.y + s * 0.12, s * 0.42, s * 0.24, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = p.isNpc ? '#7f8fa6' : pastel(p.firstName);
      ctx.strokeStyle = '#3b3029'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, s * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(p.firstName.charAt(0), c.x, c.y);
    }
    // placement ghost
    if (this.place) {
      const def = this.content.objects[this.place.defId];
      const fp = this.footprint(def?.footprint ?? { w: 1, d: 1 }, this.place.rot);
      const r = quad(this.place.x, this.place.z, fp.w, fp.d);
      ctx.fillStyle = this.place.ok ? 'rgba(77,154,91,0.45)' : 'rgba(200,71,61,0.45)';
      ctx.strokeStyle = this.place.ok ? '#2e6b3a' : '#8e2c25';
      ctx.setLineDash(this.place.ok ? [] : [5, 4]); ctx.lineWidth = 2;
      ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]);
    }
    // visible-area guide (insets reported by the UI)
    const i = this.insets;
    ctx.strokeStyle = 'rgba(47,111,209,0.5)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1;
    ctx.strokeRect(i.left + 2, i.top + 2, cw - i.left - i.right - 4, ch - i.top - i.bottom - 4);
    ctx.setLineDash([]);
  }
}

function needWord(n: NeedId): string {
  return ({ hunger: 'Hungry', energy: 'Tired', hygiene: 'Grimy', bladder: 'Needs the bathroom', fun: 'Bored', social: 'Lonely' } as Record<NeedId, string>)[n];
}

function wait(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
