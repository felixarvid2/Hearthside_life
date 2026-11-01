// OWNER: UI editors agent. DEV ONLY: a fake but plausible GameAPI for the Buy/Build dev page
// (dev/buildbuy.html). It keeps a real WorldState built with src/core helpers, a small furnished house,
// a fake placement flow with validity reasons, selling/storing, paint tools with previews, an eyedropper,
// recent finishes and snapshot-based undo/redo. Screen coordinates come from the dev page's 2D view.

import { BuildTools } from '../../../game/core/build';
import type {
  BuildApplyResult, BuildPreview, BuildTarget, BuildTool, RoomInfo,
  CutawayMode, DevStats, GameAPI, GameMode, GameSettings, PaintPreview, PaintTool, PickResult, PlacementState, Result,
  SaveSlotInfo, SoundId, UiChange,
} from '../../../game/api';
import type { ContentDB, ObjectDef, SurfaceDesign } from '../../../content/types';
import type { FinishRef, Id, Lot, PlacedObject, Rot, Wall, WorldState } from '../../../core/types';
import type { Speed } from '../../../core/clock';
import { dayIndex } from '../../../core/clock';
import { EventBus } from '../../../core/events';
import { edgeKey, newId, parseEdgeKey, tileKey } from '../../../core/ids';
import { footprintTiles, rotatedSize } from '../../../core/geometry';
import { addHousehold, cloneState, createEmptyWorld, transact } from '../../../core/state';
import { dollars } from '../../../core/money';
import { content } from '../../../content';
import { devContent } from './mockContent';
import { furnitureThumb, surfaceThumb } from './mockThumbs';

export interface MockOptions {
  contentMode?: 'auto' | 'mock' | 'real';
  /** Starting funds in dollars. */
  funds?: number;
  sandbox?: boolean;
  mode?: 'buy' | 'build';
}

interface Rect { x0: number; z0: number; x1: number; z1: number }
/** Rooms of the mock house (inclusive tile ranges). */
export const ROOMS: Rect[] = [{ x0: 4, z0: 4, x1: 9, z1: 11 }, { x0: 10, z0: 4, x1: 15, z1: 11 }];
export const LOT_SIZE = 24;

const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8, soundVolume: 0.8, musicVolume: 0.4, reducedMotion: false, textScale: 1, quality: 'high', characterStyle: 'detailed', shadows: true, showStats: false, tutorial: false,
};

type Snapshot = { label: string; before: WorldState; after: WorldState };

export class MockGame {
  readonly content: ContentDB;
  readonly events = new EventBus();
  world: WorldState;
  mode: GameMode;
  placement: PlacementState | null = null;
  selectedObj: Id | null = null;
  tool: PaintTool | null = null;
  cutawayMode: CutawayMode = 'cutaway';
  insets = { left: 0, right: 0, top: 0, bottom: 0 };
  recent: Record<'wall' | 'floor', FinishRef[]> = { wall: [], floor: [] };
  sounds: SoundId[] = [];
  /** Set by the dev page: screen point (CSS px relative to the canvas) -> world point in tiles, or null. */
  screenToWorld: (sx: number, sy: number) => { x: number; z: number } | null = () => null;
  private listeners = new Set<(w: UiChange) => void>();
  private done: Snapshot[] = [];
  private undone: Snapshot[] = [];
  private settingsValue: GameSettings = { ...DEFAULT_SETTINGS };
  private thumbCache = new Map<string, string>();
  readonly api: GameAPI;
  /** Build mode structure tools running the real pure planner on the mock world. */
  private readonly buildTools: BuildTools;

  constructor(opts: MockOptions = {}) {
    this.content = devContent(content(), opts.contentMode ?? 'auto');
    this.mode = opts.mode ?? 'buy';
    this.world = this.buildWorld(opts);
    this.buildTools = new BuildTools({
      content: this.content,
      events: this.events,
      world: () => this.world,
      run: (cmd) => {
        const before = cloneState(this.world);
        const r = cmd.apply({ state: this.world, content: this.content, events: this.events });
        if (!r.ok) return r;
        this.done.push({ label: cmd.label, before, after: cloneState(this.world) });
        this.undone = [];
        this.emit('state', 'undo');
        return r;
      },
      blocked: () => (this.mode === 'build' ? null : 'Open Build mode first.'),
      changed: () => this.emit('build'),
    });
    this.api = this.makeApi();
  }

  // ---------------------------------------------------------------------------------------------
  // World
  // ---------------------------------------------------------------------------------------------

  get lot(): Lot { return this.world.lots[this.world.activeLotId]!; }
  get householdId(): Id { return this.world.activeHouseholdId; }

  private readyDesign(kind: 'wall' | 'floor', preferred: string): FinishRef {
    const reg = kind === 'wall' ? this.content.wallDesigns : this.content.floorDesigns;
    const d = (reg[preferred]?.status === 'ready' ? reg[preferred] : undefined) ?? Object.values(reg).find((x) => x.status === 'ready' && x.palettes.length);
    return { designId: d?.id ?? preferred, paletteId: d?.palettes[0]?.id ?? 'default' };
  }

  private buildWorld(opts: MockOptions): WorldState {
    const s = createEmptyWorld(7, opts.sandbox ? 'sandbox' : 'create');
    const lotId = newId(s, 'lot');
    const lot: Lot = {
      id: lotId, name: 'Hearthside Cottage', address: '12 Willow Lane', kind: 'residential', width: LOT_SIZE, depth: LOT_SIZE,
      landValue: dollars(15000), ownerHouseholdId: null, entry: { x: 9, z: 13, level: 0 }, levels: 1, walls: {}, floors: {},
      openings: {}, objects: {}, ground: 'grass',
    };
    s.lots[lotId] = lot;
    const hh = addHousehold(s, 'Alder', dollars(opts.funds ?? 4200), lotId, true);
    lot.ownerHouseholdId = hh.id;
    s.activeHouseholdId = hh.id;
    s.activeLotId = lotId;

    const inner = this.readyDesign('wall', 'plain-paint');
    const outer = this.readyDesign('wall', 'brick-classic');
    const addWall = (dir: 'h' | 'v', x: number, z: number, sideA: FinishRef, sideB: FinishRef) => {
      const id = edgeKey(0, dir, x, z);
      const w: Wall = { id, level: 0, dir, x, z, height: 2.8, sideA: { ...sideA }, sideB: { ...sideB } };
      lot.walls[id] = w;
    };
    for (let x = 4; x <= 15; x++) { addWall('h', x, 4, outer, inner); addWall('h', x, 12, inner, outer); }
    for (let z = 4; z <= 11; z++) { addWall('v', 4, z, outer, inner); addWall('v', 16, z, inner, outer); if (z !== 7 && z !== 8) addWall('v', 10, z, inner, inner); }
    const floorA = this.readyDesign('floor', 'oak-planks');
    const floorB = this.readyDesign('floor', 'checker-tile');
    ROOMS.forEach((r, i) => { for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) lot.floors[tileKey(0, x, z)] = { ...(i === 0 ? floorA : floorB) }; });

    const place = (defId: string, x: number, z: number, rot: Rot = 0, supportId?: Id): Id | null => {
      const def = this.content.objects[defId];
      if (!def) return null;
      const o: PlacedObject = {
        id: newId(s, 'obj'), defId, level: 0, x, z, rot, finishes: defaultFinishes(def), purchasePrice: def.price, boughtAt: s.clock.minutes - 2 * 1440,
        ownerHouseholdId: hh.id, condition: { dirt: 0, broken: false }, ...(supportId ? { supportId } : {}),
      };
      lot.objects[o.id] = o;
      return o.id;
    };
    place('rug-rectangle', 5, 7);
    place('sofa-tweed', 5, 10);
    place('table-coffee', 6, 8);
    place('armchair-lounge', 8, 9, 3);
    place('bookcase-open', 4, 4);
    const stand = place('tv-stand-low', 6, 4);
    if (stand) place('tv-flatscreen', 6, 4, 0, stand);
    place('plant-potted', 9, 11);
    place('lamp-floor-round', 4, 11);
    place('bed-double-oak', 11, 4);
    place('nightstand-oak', 13, 4);
    place('wardrobe-tall', 15, 4);
    place('desk-oak', 14, 11, 2);
    for (const [defId, at] of [['chair-dining-oak', -60], ['radio-retro', -30]] as const) {
      const def = this.content.objects[defId];
      if (!def) continue;
      hh.inventory.push({
        object: { id: newId(s, 'obj'), defId, level: 0, x: 0, z: 0, rot: 0, finishes: defaultFinishes(def), purchasePrice: def.price, boughtAt: s.clock.minutes - 1440, ownerHouseholdId: hh.id, condition: { dirt: 0, broken: false } },
        storedAt: s.clock.minutes + at,
      });
    }
    return s;
  }

  // ---------------------------------------------------------------------------------------------
  // Change notification and undo
  // ---------------------------------------------------------------------------------------------

  emit(...what: UiChange[]): void { for (const w of what) for (const fn of [...this.listeners]) fn(w); }

  private commit(label: string, fn: () => Result): Result {
    const before = cloneState(this.world);
    const r = fn();
    if (!r.ok) { this.world = before; return r; }
    this.done.push({ label, before, after: cloneState(this.world) });
    this.undone = [];
    this.events.emit({ type: 'lot.changed', lotId: this.world.activeLotId, what: 'all' });
    this.emit('state', 'undo');
    return r;
  }

  // ---------------------------------------------------------------------------------------------
  // Placement
  // ---------------------------------------------------------------------------------------------

  def(defId: string): ObjectDef | undefined { return this.content.objects[defId]; }

  objectAtTile(x: number, z: number, layers: ObjectDef['layer'][], ignore?: Id | null): PlacedObject | null {
    let best: PlacedObject | null = null;
    for (const o of Object.values(this.lot.objects)) {
      if (o.id === ignore) continue;
      const def = this.def(o.defId);
      if (!def || !layers.includes(def.layer)) continue;
      if (footprintTiles(o.x, o.z, def.footprint, o.rot).some((t) => t.x === x && t.z === z)) {
        if (!best || def.layer === 'surface') best = o;
      }
    }
    return best;
  }

  validate(p: Pick<PlacementState, 'defId' | 'x' | 'z' | 'rot' | 'objectId'>): { ok: boolean; reasons: string[]; supportId?: Id } {
    const def = this.def(p.defId);
    if (!def) return { ok: false, reasons: ['This object is missing from the catalog.'] };
    const reasons: string[] = [];
    const tiles = footprintTiles(p.x, p.z, def.footprint, p.rot);
    if (tiles.some((t) => t.x < 0 || t.z < 0 || t.x >= this.lot.width || t.z >= this.lot.depth)) reasons.push('Outside the lot.');
    const layers: ObjectDef['layer'][] = def.layer === 'floor' ? ['floor'] : def.layer === 'surface' ? ['surface'] : def.layer === 'wall' ? ['wall'] : ['rug'];
    const hit = tiles.map((t) => this.objectAtTile(t.x, t.z, layers, p.objectId)).find(Boolean);
    if (hit) reasons.push(`Blocked: overlaps ${this.def(hit.defId)?.name ?? 'another object'}.`);
    for (const t of tiles) {
      if (tiles.some((u) => u.x === t.x + 1 && u.z === t.z) && this.lot.walls[edgeKey(0, 'v', t.x + 1, t.z)]) { reasons.push('Blocked: a wall runs through it.'); break; }
      if (tiles.some((u) => u.x === t.x && u.z === t.z + 1) && this.lot.walls[edgeKey(0, 'h', t.x, t.z + 1)]) { reasons.push('Blocked: a wall runs through it.'); break; }
    }
    if (def.layer === 'wall' || def.needsWall) {
      const s = rotatedSize(def.footprint, p.rot);
      const edges: string[] = [];
      if (p.rot === 0) for (let i = 0; i < s.w; i++) edges.push(edgeKey(0, 'h', p.x + i, p.z));
      if (p.rot === 2) for (let i = 0; i < s.w; i++) edges.push(edgeKey(0, 'h', p.x + i, p.z + s.d));
      if (p.rot === 1) for (let j = 0; j < s.d; j++) edges.push(edgeKey(0, 'v', p.x, p.z + j));
      if (p.rot === 3) for (let j = 0; j < s.d; j++) edges.push(edgeKey(0, 'v', p.x + s.w, p.z + j));
      if (!edges.every((e) => this.lot.walls[e])) reasons.push('Needs a wall behind it: rotate it or move it against a wall.');
    }
    let supportId: Id | undefined;
    if (def.layer === 'surface') {
      const supports = tiles.map((t) => this.objectAtTile(t.x, t.z, ['floor'], p.objectId));
      const sup = supports[0];
      if (!sup || supports.some((x) => x !== sup) || !this.def(sup.defId)?.surfaceHeight) reasons.push('Needs a counter, table, desk or stand underneath.');
      else supportId = sup.id;
    }
    return { ok: reasons.length === 0, reasons, ...(supportId ? { supportId } : {}) };
  }

  private setPlacement(p: PlacementState | null): void {
    if (p) { const v = this.validate(p); p.ok = v.ok; p.reasons = v.reasons; }
    this.placement = p;
    this.emit('placement');
  }

  private centre(defId: string, rot: Rot = 0): { x: number; z: number } {
    const def = this.def(defId);
    const s = def ? rotatedSize(def.footprint, rot) : { w: 1, d: 1 };
    return { x: 8 - Math.floor(s.w / 2), z: 6 - Math.floor(s.d / 2) };
  }

  /** Dev helper: moves the ghost to a tile (as a canvas tap would). */
  placeGhost(x: number, z: number, rot?: Rot): void {
    const p = this.placement;
    if (p) this.setPlacement({ ...p, x, z, rot: rot ?? p.rot });
  }

  /** Dev helper: first placed object with this definition. */
  objectByDef(defId: string): PlacedObject | undefined {
    return Object.values(this.lot.objects).find((o) => o.defId === defId);
  }

  confirm(): Result {
    const p = this.placement;
    if (!p) return { ok: false, reason: 'Nothing is being placed.' };
    const v = this.validate(p);
    if (!v.ok) return { ok: false, reason: v.reasons[0] ?? "Can't place it here." };
    const def = this.def(p.defId)!;
    const r = this.commit(p.source === 'move' ? `Move ${def.name}` : p.source === 'inventory' ? `Place ${def.name}` : `Buy ${def.name}`, () => {
      const lot = this.lot;
      if (p.source === 'move' && p.objectId) {
        const o = lot.objects[p.objectId];
        if (!o) return { ok: false, reason: 'That object is gone.' };
        Object.assign(o, { x: p.x, z: p.z, rot: p.rot });
        if (v.supportId) o.supportId = v.supportId; else delete o.supportId;
        return { ok: true };
      }
      if (p.source === 'inventory' && p.inventoryIndex !== null) {
        const hh = this.world.households[this.householdId]!;
        const entry = hh.inventory[p.inventoryIndex];
        if (!entry) return { ok: false, reason: 'That item is no longer in the inventory.' };
        hh.inventory.splice(p.inventoryIndex, 1);
        const o: PlacedObject = { ...entry.object, x: p.x, z: p.z, rot: p.rot, level: 0 };
        if (v.supportId) o.supportId = v.supportId; else delete o.supportId;
        lot.objects[o.id] = o;
        return { ok: true };
      }
      const pay = transact(this.world, this.events, this.householdId, -def.price, 'purchase', `Bought ${def.name}`);
      if (!pay.ok) return { ok: false, reason: pay.reason };
      const o: PlacedObject = {
        id: newId(this.world, 'obj'), defId: def.id, level: 0, x: p.x, z: p.z, rot: p.rot, finishes: defaultFinishes(def), purchasePrice: def.price,
        boughtAt: this.world.clock.minutes, ownerHouseholdId: this.householdId, condition: { dirt: 0, broken: false }, ...(v.supportId ? { supportId: v.supportId } : {}),
      };
      lot.objects[o.id] = o;
      return { ok: true };
    });
    if (r.ok) { this.placement = null; this.emit('placement'); }
    return r;
  }

  saleValue(objectId: Id): number {
    const o = this.lot.objects[objectId];
    if (!o) return 0;
    return dayIndex(o.boughtAt) === dayIndex(this.world.clock.minutes) ? o.purchasePrice : Math.round(o.purchasePrice * 0.8);
  }

  private carries(objectId: Id): boolean { return Object.values(this.lot.objects).some((o) => o.supportId === objectId); }

  // ---------------------------------------------------------------------------------------------
  // Picking and painting
  // ---------------------------------------------------------------------------------------------

  pickAt(sx: number, sy: number, surfacesOnly: boolean): PickResult {
    const w = this.screenToWorld(sx, sy);
    if (!w) return { kind: 'none' };
    const tx = Math.floor(w.x), tz = Math.floor(w.z);
    if (!surfacesOnly) {
      const o = this.objectAtTile(tx, tz, ['surface']) ?? this.objectAtTile(tx, tz, ['floor', 'wall']) ?? this.objectAtTile(tx, tz, ['rug']);
      if (o) return { kind: 'object', objectId: o.id };
    }
    // nearest wall edge within 0.3 tiles
    let best: { id: string; d: number; side: 'a' | 'b' } | null = null;
    for (const wall of Object.values(this.lot.walls)) {
      let d: number, side: 'a' | 'b';
      if (wall.dir === 'h') { if (w.x < wall.x || w.x > wall.x + 1) continue; d = Math.abs(w.z - wall.z); side = w.z < wall.z ? 'a' : 'b'; }
      else { if (w.z < wall.z || w.z > wall.z + 1) continue; d = Math.abs(w.x - wall.x); side = w.x < wall.x ? 'a' : 'b'; }
      if (d < 0.3 && (!best || d < best.d)) best = { id: wall.id, d, side };
    }
    if (best) return { kind: 'wall', wallId: best.id, side: best.side, tile: { x: tx, z: tz }, level: 0 };
    if (tx < 0 || tz < 0 || tx >= this.lot.width || tz >= this.lot.depth) return { kind: 'none' };
    return { kind: 'floor', tile: { x: tx, z: tz }, level: 0 };
  }

  private roomOf(x: number, z: number): Rect | undefined { return ROOMS.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1); }

  private sideTile(wallId: string, side: 'a' | 'b'): { x: number; z: number } {
    const e = parseEdgeKey(wallId);
    if (e.dir === 'h') return side === 'a' ? { x: e.x, z: e.z - 1 } : { x: e.x, z: e.z };
    return side === 'a' ? { x: e.x - 1, z: e.z } : { x: e.x, z: e.z };
  }

  private roomSides(r: Rect): Array<{ wallId: string; side: 'a' | 'b' }> {
    const out: Array<{ wallId: string; side: 'a' | 'b' }> = [];
    for (const wall of Object.values(this.lot.walls)) {
      for (const side of ['a', 'b'] as const) {
        const t = this.sideTile(wall.id, side);
        if (t.x >= r.x0 && t.x <= r.x1 && t.z >= r.z0 && t.z <= r.z1) out.push({ wallId: wall.id, side });
      }
    }
    return out;
  }

  private design(kind: 'wall' | 'floor', id: string): SurfaceDesign | undefined {
    return (kind === 'wall' ? this.content.wallDesigns : this.content.floorDesigns)[id];
  }

  /** Targets the current tool would change, with cost and validity. */
  private paintPlan(pick: PickResult | null): (PaintPreview & { walls: Array<{ wallId: string; side: 'a' | 'b' }>; tiles: Array<{ x: number; z: number }> }) | null {
    const t = this.tool;
    if (!t || t.kind === 'eyedropper' || !pick) return null;
    const none = { walls: [], tiles: [] };
    const d = this.design(t.kind, t.finish.designId);
    if (!d) return { ok: false, reason: 'That design is missing.', cost: 0, count: 0, ...none };
    const same = (a: FinishRef, b: FinishRef) => a.designId === b.designId && a.paletteId === b.paletteId;
    if (t.kind === 'wall') {
      if (pick.kind !== 'wall') return { ok: false, reason: 'Point at a wall to paint it.', cost: 0, count: 0, ...none };
      let targets = [{ wallId: pick.wallId, side: pick.side }];
      if (t.scope === 'room') {
        const st = this.sideTile(pick.wallId, pick.side);
        const room = this.roomOf(st.x, st.z);
        if (!room) return { ok: false, reason: 'This side faces outdoors: use "One side" for outside walls.', cost: 0, count: 0, ...none };
        targets = this.roomSides(room);
      }
      const walls = targets.filter((x) => { const w = this.lot.walls[x.wallId]; return w && !same(x.side === 'a' ? w.sideA : w.sideB, t.finish); });
      return { ok: true, cost: walls.length * d.price, count: walls.length, walls, tiles: [] };
    }
    if (pick.kind !== 'floor') return { ok: false, reason: 'Point at the floor to paint it.', cost: 0, count: 0, ...none };
    let tiles = [pick.tile];
    if (t.scope === 'room') {
      const room = this.roomOf(pick.tile.x, pick.tile.z);
      if (!room) return { ok: false, reason: 'Outdoors is not a room: paint one tile at a time.', cost: 0, count: 0, ...none };
      tiles = [];
      for (let x = room.x0; x <= room.x1; x++) for (let z = room.z0; z <= room.z1; z++) tiles.push({ x, z });
    }
    tiles = tiles.filter((tl) => { const f = this.lot.floors[tileKey(0, tl.x, tl.z)]; return !f || !same(f, t.finish); });
    return { ok: true, cost: tiles.length * d.price, count: tiles.length, walls: [], tiles };
  }

  paintApply(pick: PickResult): Result {
    const plan = this.paintPlan(pick);
    const t = this.tool;
    if (!plan || !t || t.kind === 'eyedropper') return { ok: false, reason: 'Choose a finish first.' };
    if (!plan.ok) return { ok: false, reason: plan.reason ?? "Can't paint here." };
    if (plan.count === 0) return { ok: false, reason: 'It already has this finish.' };
    const unit = t.kind === 'wall' ? (plan.count === 1 ? 'wall side' : 'wall sides') : (plan.count === 1 ? 'tile' : 'tiles');
    const r = this.commit(`Paint ${plan.count} ${unit}`, () => {
      const pay = transact(this.world, this.events, this.householdId, -plan.cost, 'build', `Painted ${plan.count} ${unit}`);
      if (!pay.ok) return { ok: false, reason: pay.reason };
      for (const x of plan.walls) { const w = this.lot.walls[x.wallId]; if (w) { if (x.side === 'a') w.sideA = { ...t.finish }; else w.sideB = { ...t.finish }; } }
      for (const tl of plan.tiles) this.lot.floors[tileKey(0, tl.x, tl.z)] = { ...t.finish };
      return { ok: true };
    });
    if (r.ok) {
      const list = this.recent[t.kind].filter((f) => f.designId !== t.finish.designId || f.paletteId !== t.finish.paletteId);
      this.recent[t.kind] = [{ ...t.finish }, ...list].slice(0, 10);
      this.emit('paint');
    }
    return r;
  }

  eyedrop(pick: PickResult): FinishRef | null {
    if (pick.kind === 'wall') { const w = this.lot.walls[pick.wallId]; return w ? { ...(pick.side === 'a' ? w.sideA : w.sideB) } : null; }
    if (pick.kind === 'floor') { const f = this.lot.floors[tileKey(0, pick.tile.x, pick.tile.z)]; return f ? { ...f } : null; }
    return null;
  }

  thumb(key: string, make: () => string): string {
    let v = this.thumbCache.get(key);
    if (!v) { v = make(); this.thumbCache.set(key, v); }
    return v;
  }

  // ---------------------------------------------------------------------------------------------
  // GameAPI
  // ---------------------------------------------------------------------------------------------

  private makeApi(): GameAPI {
    const fail = (reason: string): Result => ({ ok: false, reason });
    const notHere = 'Not available on the Buy/Build dev page.';
    const api: GameAPI = {
      content: this.content,
      events: this.events,
      onChange: (fn) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; },
      state: () => this.world,
      mode: () => this.mode,
      showMenu: () => { this.mode = 'menu'; this.emit('mode'); },
      startNewGame: async () => fail(notHere),
      premadeHouseholds: () => [],
      creator: { show: () => {}, setView: () => {}, rotate: () => {}, zoom: () => {}, hide: () => {}, portrait: async () => '' },
      listSaves: async (): Promise<SaveSlotInfo[]> => [],
      latestSave: async () => null,
      saveTo: async () => fail(notHere),
      loadFrom: async () => fail(notHere),
      deleteSave: async () => fail(notHere),
      exportWorld: () => JSON.stringify(this.world),
      importWorld: async () => fail(notHere),
      speed: (): Speed => (this.mode === 'buy' || this.mode === 'build' ? 0 : 1),
      setSpeed: () => { this.emit('speed'); },
      togglePause: () => { this.emit('speed'); },
      selected: () => null,
      select: () => {},
      options: () => [],
      queue: () => fail(notHere),
      goTo: () => fail(notHere),
      cancel: () => {},
      reorder: () => {},
      mood: () => ({ value: 0, label: 'Fine', reasons: [] }),
      updateWardrobe: () => fail(notHere),
      setMode: (m) => {
        if (this.mode === m) return;
        if (this.mode === 'buy' && this.placement) { this.placement = null; this.emit('placement'); }
        if (this.mode === 'buy' && this.selectedObj) { this.selectedObj = null; this.emit('selection'); }
        if (this.mode === 'build') this.buildTools.clear();
        this.mode = m;
        this.emit('mode', 'speed');
      },
      startPlacement: (defId) => {
        const def = this.def(defId);
        if (!def || def.status !== 'ready') return fail('That item is not in the catalog.');
        if (this.mode !== 'buy') return fail('Switch to Buy mode first.');
        const c = this.centre(defId);
        this.selectedObj = null;
        this.emit('selection');
        this.setPlacement({ source: 'buy', defId, objectId: null, inventoryIndex: null, x: c.x, z: c.z, level: 0, rot: 0, ok: true, reasons: [], cost: def.price });
        return { ok: true };
      },
      startMove: (objectId) => {
        const o = this.lot.objects[objectId];
        if (!o) return fail('That object is gone.');
        if (this.carries(objectId)) return fail('Move the items resting on it first.');
        this.selectedObj = null;
        this.emit('selection');
        this.setPlacement({ source: 'move', defId: o.defId, objectId, inventoryIndex: null, x: o.x, z: o.z, level: 0, rot: o.rot, ok: true, reasons: [], cost: 0 });
        return { ok: true };
      },
      startPlaceFromInventory: (index) => {
        const entry = this.world.households[this.householdId]?.inventory[index];
        if (!entry) return fail('That item is no longer in the inventory.');
        const c = this.centre(entry.object.defId);
        this.selectedObj = null;
        this.emit('selection');
        this.setPlacement({ source: 'inventory', defId: entry.object.defId, objectId: null, inventoryIndex: index, x: c.x, z: c.z, level: 0, rot: 0, ok: true, reasons: [], cost: 0 });
        return { ok: true };
      },
      placement: () => this.placement,
      placementAt: (sx, sy) => {
        const p = this.placement;
        const w = this.screenToWorld(sx, sy);
        if (!p || !w) return;
        const def = this.def(p.defId);
        const s = def ? rotatedSize(def.footprint, p.rot) : { w: 1, d: 1 };
        const x = Math.floor(w.x - s.w / 2 + 0.5), z = Math.floor(w.z - s.d / 2 + 0.5);
        if (x === p.x && z === p.z) return;
        this.setPlacement({ ...p, x, z });
      },
      rotatePlacement: (dir = 1) => {
        const p = this.placement;
        if (!p) return;
        this.setPlacement({ ...p, rot: (((p.rot + dir) % 4) + 4) % 4 as Rot });
      },
      confirmPlacement: () => this.confirm(),
      cancelPlacement: () => { if (this.placement) this.setPlacement(null); },
      sell: (objectId) => {
        const o = this.lot.objects[objectId];
        if (!o) return fail('That object is gone.');
        if (this.carries(objectId)) return fail('Sell or move the items resting on it first.');
        const value = this.saleValue(objectId);
        const name = this.def(o.defId)?.name ?? 'object';
        const r = this.commit(`Sell ${name}`, () => {
          delete this.lot.objects[objectId];
          const pay = transact(this.world, this.events, this.householdId, value, 'sale', `Sold ${name}`);
          return pay.ok ? { ok: true } : { ok: false, reason: pay.reason };
        });
        if (r.ok && this.selectedObj === objectId) { this.selectedObj = null; this.emit('selection'); }
        return r;
      },
      saleValue: (objectId) => this.saleValue(objectId),
      store: (objectId) => {
        const o = this.lot.objects[objectId];
        if (!o) return fail('That object is gone.');
        if (this.carries(objectId)) return fail('Store the items resting on it first.');
        const r = this.commit(`Store ${this.def(o.defId)?.name ?? 'object'}`, () => {
          delete this.lot.objects[objectId];
          const copy: PlacedObject = { ...o };
          delete copy.supportId;
          this.world.households[this.householdId]!.inventory.push({ object: copy, storedAt: this.world.clock.minutes });
          return { ok: true };
        });
        if (r.ok && this.selectedObj === objectId) { this.selectedObj = null; this.emit('selection'); }
        return r;
      },
      setObjectFinish: (objectId, regionId, swatchId) => {
        const o = this.lot.objects[objectId];
        const region = o ? this.def(o.defId)?.finishes.find((r) => r.id === regionId) : undefined;
        if (!o || !region || !region.swatches.some((s) => s.id === swatchId)) return fail('That finish is not available.');
        if (o.finishes[regionId] === swatchId) return { ok: true };
        return this.commit(`Change ${region.label.toLowerCase()}`, () => { this.lot.objects[objectId]!.finishes[regionId] = swatchId; return { ok: true }; });
      },
      selectObject: (objectId) => { if (this.selectedObj !== objectId) { this.selectedObj = objectId; this.emit('selection'); } },
      selectedObject: () => this.selectedObj,
      setPaintTool: (tool) => { this.tool = tool ? (JSON.parse(JSON.stringify(tool)) as PaintTool) : null; this.emit('paint'); },
      paintTool: () => this.tool,
      paintPreview: (pick) => { const p = this.paintPlan(pick); return p ? { ok: p.ok, cost: p.cost, count: p.count, ...(p.reason ? { reason: p.reason } : {}) } : null; },
      paintApply: (pick) => this.paintApply(pick),
      eyedrop: (pick) => this.eyedrop(pick),
      recentFinishes: (kind) => this.recent[kind].map((f) => ({ ...f })),
      setBuildTool: (tool: BuildTool | null) => this.buildTools.setTool(tool),
      buildTool: () => this.buildTools.tool(),
      buildPreview: (target: BuildTarget | null): BuildPreview | null => this.buildTools.preview(target),
      buildApply: (target: BuildTarget): Result & Partial<BuildApplyResult> => this.buildTools.apply(target),
      buildCancel: () => this.buildTools.cancel(),
      buildHighlight: () => this.buildTools.highlight(),
      rooms: (level?: number): RoomInfo[] => this.buildTools.rooms(level),
      roomAt: (tile, level) => this.buildTools.roomAt(tile, level),
      openingAt: (wallId) => this.buildTools.openingAt(wallId),
      highlightRoom: () => { /* the mock draws nothing */ },
      undo: () => {
        const s = this.done.pop();
        if (!s) return null;
        this.world = cloneState(s.before);
        this.undone.push(s);
        this.selectedObj = this.selectedObj && this.lot.objects[this.selectedObj] ? this.selectedObj : null;
        this.events.emit({ type: 'lot.changed', lotId: this.world.activeLotId, what: 'all' });
        this.emit('undo', 'state', 'selection');
        return s.label;
      },
      redo: () => {
        const s = this.undone.pop();
        if (!s) return null;
        this.world = cloneState(s.after);
        this.done.push(s);
        this.selectedObj = this.selectedObj && this.lot.objects[this.selectedObj] ? this.selectedObj : null;
        this.events.emit({ type: 'lot.changed', lotId: this.world.activeLotId, what: 'all' });
        this.emit('undo', 'state', 'selection');
        return s.label;
      },
      canUndo: () => this.done.length > 0,
      canRedo: () => this.undone.length > 0,
      view: {
        pick: (sx, sy) => this.pickAt(sx, sy, this.mode === 'build'),
        groundPoint: (sx, sy) => this.screenToWorld(sx, sy),
        pan: () => {},
        zoomAt: () => {},
        rotate: () => { this.emit('camera'); },
        cutaway: () => this.cutawayMode,
        setCutaway: (m) => { this.cutawayMode = m; this.emit('camera'); },
        focusPerson: () => {},
        reveal: () => {},
        worldToScreen: () => ({ x: 0, y: 0, visible: false }),
        anchorOf: () => null,
        setInsets: (i) => { this.insets = { ...i }; this.emit('camera'); },
      },
      portrait: () => null,
      thumbnails: {
        furniture: (defId) => { const d = this.def(defId); return d ? this.thumb(`f:${defId}`, () => furnitureThumb(d)) : ''; },
        surface: (kind, designId, paletteId) => {
          const d = this.design(kind, designId);
          const pal = d?.palettes.find((p) => p.id === paletteId) ?? d?.palettes[0];
          return d && pal ? this.thumb(`s:${kind}:${designId}:${pal.id}`, () => surfaceThumb(d, pal)) : '';
        },
        opening: (defId) => this.thumb(`o:${defId}`, () => `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#efe3d0"/><rect x="18" y="8" width="28" height="50" rx="3" fill="#a77b52"/></svg>')}`),
      },
      settings: () => ({ ...this.settingsValue }),
      setSettings: (patch) => { this.settingsValue = { ...this.settingsValue, ...patch }; this.emit('settings'); },
      setSimSettings: (patch) => { this.world.settings = { ...this.world.settings, ...patch }; this.emit('state'); },
      sound: (id) => { this.sounds.push(id); },
      devStats: (): DevStats => ({ fps: 60, frameMs: 16, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, loadedAssets: 0, agents: 0, routeRequests: 0, simTickMs: 0, ticksPerFrame: 0 }),
    };
    return api;
  }
}

export function defaultFinishes(def: ObjectDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of def.finishes) { const s = r.swatches[0]; if (s) out[r.id] = s.id; }
  return out;
}
