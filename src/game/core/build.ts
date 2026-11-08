// Build mode structure tools (walls, rooms, doors, windows, floors): maps a BuildTool and a BuildTarget (lot
// coordinates) to a build request, previews it (cost, counts, measurement, reasons, highlight), builds the
// matching undoable command, and tracks rooms with stable uids. Pure: the GameCore and the UI dev mocks both
// use BuildTools; the owner supplies `run` (how a command reaches the world and its undo stack) so previews
// never touch the state.

import { buildCommand, type BuildCommand } from '../../building/buildCommands';
import { roomCommand } from '../../building/roomCommands';
import { planRoomOp, type RoomOp, type RoomOpPlan } from '../../building/roomOps';
import { buyObject, sellObject } from '../../building/commands';
import { exteriorCommand, type ExteriorCommand } from '../../building/exteriorCommands';
import {
  fencePathRequest, fenceRectRequest, gateRequest, nearestFenceEdge, planExterior, roofRectRequest, type ExteriorPlan, type ExteriorRequest,
} from '../../building/exteriorPlans';
import { exteriorOf } from '../../content/exterior';
import { planBuy, planSell, type BuyRequest } from '../../building/plans';
import { addPoolLadder, buildPool, movePoolLadder, removePool, removePoolLadder } from '../../building/poolCommands';
import { planPool, type PoolPlan, type PoolRequest } from '../../building/poolPlans';
import { rotatedSize } from '../../core/geometry';
import {
  eraseRectRequest, eraseRunRequest, eraseSegmentRequest, normalizeRect, planBuild, straightenRun, tileRectTiles, wallRectRequest,
  wallRunRequest, wallSegmentRequest, type BuildPlan, type BuildRequest, type EdgeRef, type OpeningSpec, type Point,
} from '../../building/buildPlans';
import { previewPaint, type PaintTarget } from '../../building/preview';
import type { ContentDB } from '../../content/types';
import type { UndoableCommand } from '../../core/commands';
import type { EventBus } from '../../core/events';
import { edgeKey } from '../../core/ids';
import type { Tile } from '../../core/nav';
import type { FinishRef, Id, Lot, Rot, WorldState } from '../../core/types';
import { hasLevel, inLot } from '../../world/lots';
import { poolContains, poolsOf } from '../../world/pools';
import { RoomTracker, roomOutlines, type RoomDelta, type TrackedRoom } from '../../world/roomTracker';
import { openingEdgeKeys, openingOnWall, openingSpan } from '../../world/walls';
import { paintCommand } from './paint';
import type {
  BuildApplyResult, BuildPoint, BuildPreview, BuildTarget, BuildTool, Result, RoomDoorSpec, RoomInfo,
} from '../api';
import type { BuildHighlight } from '../../building/buildPlans';

const fail = (reason: string): Result => ({ ok: false, reason });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const KINDLESS_COUNTS = { wallsNew: 0, wallsExisting: 0, wallsRemoved: 0, openingsAdded: 0, openingsMoved: 0, openingsRemoved: 0, floorsPlaced: 0, floorsErased: 0 };

// ---------------------------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------------------------

/** Nearest grid vertex to a point, kept on the lot. */
export function snapVertex(lot: Pick<Lot, 'width' | 'depth'>, p: BuildPoint): Point {
  return { x: Math.max(0, Math.min(lot.width, Math.round(p.x))), z: Math.max(0, Math.min(lot.depth, Math.round(p.z))) };
}

/** Tile containing a point. */
export function snapTile(p: BuildPoint): Point { return { x: Math.floor(p.x), z: Math.floor(p.z) }; }

function distToEdge(p: BuildPoint, e: EdgeRef): number {
  const ax = e.x, az = e.z, bx = e.dir === 'h' ? e.x + 1 : e.x, bz = e.dir === 'h' ? e.z : e.z + 1;
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - (ax + t * dx), p.z - (az + t * dz));
}

/**
 * The grid edge nearest to a point. With `existing`, only edges that hold a wall within about half a tile
 * count (null when there is none); otherwise any edge on the lot.
 */
export function nearestEdge(lot: Lot, level: number, p: BuildPoint, existing: boolean): EdgeRef | null {
  const tx = Math.floor(p.x), tz = Math.floor(p.z);
  let best: EdgeRef | null = null;
  let bestD = Infinity;
  const consider = (e: EdgeRef) => {
    const inside = e.dir === 'h' ? e.x >= 0 && e.x < lot.width && e.z >= 0 && e.z <= lot.depth : e.x >= 0 && e.x <= lot.width && e.z >= 0 && e.z < lot.depth;
    if (!inside) return;
    if (existing && !lot.walls[edgeKey(level, e.dir, e.x, e.z)]) return;
    const d = distToEdge(p, e);
    if (d < bestD - 1e-9) { bestD = d; best = e; }
  };
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx, z = tz + dz;
      consider({ dir: 'h', x, z }); consider({ dir: 'h', x, z: z + 1 });
      consider({ dir: 'v', x, z }); consider({ dir: 'v', x: x + 1, z });
    }
  }
  return best && (!existing || bestD <= 0.6) ? best : null;
}

/** Edge shifted `by` edges along its own direction. */
function shiftEdge(e: EdgeRef, by: number): EdgeRef { return e.dir === 'h' ? { dir: 'h', x: e.x + by, z: e.z } : { dir: 'v', x: e.x, z: e.z + by }; }

// ---------------------------------------------------------------------------------------------
// Resolving a tool and a target
// ---------------------------------------------------------------------------------------------

export type Resolved =
  | { ok: false; reason: string }
  | { ok: true; build: BuildRequest; extra?: { openingId?: Id } }
  | { ok: true; paint: { target: PaintTarget; finish: FinishRef } }
  /** Milestone 9: buy a staircase / sell one (object commands, previewed like the rest). */
  | { ok: true; object: { place: BuyRequest } | { remove: Id } }
  /** Milestone 9 exterior: fences, gates, roofs and terrain paint (building/exteriorPlans.ts). */
  | { ok: true; exterior: ExteriorRequest }
  /** Milestone 12: a pool, its removal, or a ladder edit (building/poolPlans.ts). */
  | { ok: true; pool: PoolRequest }
  /** Milestone 13: move, resize or duplicate a room (building/roomOps.ts). */
  | { ok: true; roomOp: RoomOp };

const bad = (reason: string): Resolved => ({ ok: false, reason });

function doorEdge(level: number, r: { x0: number; z0: number; x1: number; z1: number }, d: RoomDoorSpec): OpeningSpec | string {
  const off = Math.trunc(d.offset ?? 0);
  const horizontal = d.side === 'n' || d.side === 's';
  const len = horizontal ? r.x1 - r.x0 : r.z1 - r.z0;
  const i = Math.floor((len - 1) / 2) + off;
  if (i < 0 || i >= len) return 'That door does not fit on the room side.';
  const wallId = horizontal
    ? edgeKey(level, 'h', r.x0 + i, d.side === 'n' ? r.z0 : r.z1)
    : edgeKey(level, 'v', d.side === 'w' ? r.x0 : r.x1, r.z0 + i);
  return { defId: d.defId, wallId };
}

/** Maps a tool and a target to a build request (or a paint target for floor tools), or a reason it does not apply. */
export function resolveBuild(content: ContentDB, lot: Lot, tool: BuildTool, target: BuildTarget): Resolved {
  const level = target.level ?? 0;
  if (!hasLevel(lot, level)) return bad('That floor does not exist.');
  const from = target.from;
  if (!from || !Number.isFinite(from.x) || !Number.isFinite(from.z)) return bad('Point at the lot.');
  const to = target.to && Number.isFinite(target.to.x) && Number.isFinite(target.to.z) ? target.to : null;
  const built = (b: ReturnType<typeof wallRunRequest>): Resolved => (b.ok ? { ok: true, build: b.request } : bad(b.reason));

  switch (tool.kind) {
    case 'wall': {
      if (tool.shape === 'segment') {
        const e = nearestEdge(lot, level, from, false);
        return e ? { ok: true, build: wallSegmentRequest(level, e, tool.spec) } : bad('Point at the lot.');
      }
      const a = snapVertex(lot, from);
      const b = straightenRun(a, snapVertex(lot, to ?? from));
      return built(wallRunRequest(level, a, b, tool.spec));
    }
    case 'room': {
      const a = snapVertex(lot, from);
      const b = snapVertex(lot, to ?? from);
      const r = normalizeRect(a, b);
      const openings: OpeningSpec[] = [];
      for (const d of tool.doors ?? []) {
        if (r.x1 === r.x0 || r.z1 === r.z0) break;
        const spec = doorEdge(level, r, d);
        if (typeof spec === 'string') return bad(spec);
        openings.push(spec);
      }
      return built(wallRectRequest(level, a, b, { ...(tool.spec ? { spec: tool.spec } : {}), ...(tool.floor ? { floor: tool.floor } : {}), ...(openings.length ? { openings } : {}) }));
    }
    case 'eraseWall': {
      if (tool.shape === 'segment') {
        const e = nearestEdge(lot, level, from, true);
        return e ? { ok: true, build: eraseSegmentRequest(level, e) } : bad('There is no wall there.');
      }
      const a = snapVertex(lot, from);
      const b = snapVertex(lot, to ?? from);
      return tool.shape === 'run' ? built(eraseRunRequest(level, a, straightenRun(a, b))) : built(eraseRectRequest(level, a, b));
    }
    case 'opening': {
      const def = content.openings[tool.defId];
      if (!def) return bad('That door or window is not available.');
      const wallId = openingWallId(lot, level, target, Math.max(1, Math.round(def.width)));
      return wallId ? { ok: true, build: { kind: 'placeOpening', defId: tool.defId, wallId, flip: tool.flip ?? false } } : bad('Point at a wall.');
    }
    case 'moveOpening': {
      const o = tool.openingId ? lot.openings[tool.openingId] : undefined;
      if (!tool.openingId || !o) return bad('Pick the door or window to move.');
      const wallId = openingWallId(lot, level, target, openingSpan(o));
      return wallId
        ? { ok: true, build: { kind: 'moveOpening', openingId: o.id, wallId, ...(tool.flip !== undefined ? { flip: tool.flip } : {}) }, extra: { openingId: o.id } }
        : bad('Point at a wall.');
    }
    case 'eraseOpening': {
      let wallId = target.wallId;
      if (!wallId) {
        const e = nearestEdge(lot, level, from, true);
        wallId = e ? edgeKey(level, e.dir, e.x, e.z) : undefined;
      }
      const o = wallId ? openingOnWall(lot, wallId) : undefined;
      return o ? { ok: true, build: { kind: 'eraseOpening', openingId: o.id } } : bad('There is no door or window there.');
    }
    case 'floor': {
      if (tool.shape === 'room') return { ok: true, paint: { target: { kind: 'roomFloor', level, tile: snapTile(from) }, finish: tool.finish } };
      const a = snapTile(from);
      const tiles = tool.shape === 'rect' ? tileRectTiles(a, snapTile(to ?? from)) : [a];
      return { ok: true, paint: { target: { kind: 'floorTiles', level, tiles: tiles.map((t) => ({ x: t.x, z: t.z })) }, finish: tool.finish } };
    }
    case 'eraseFloor': {
      const a = snapTile(from);
      if (tool.shape === 'room') return { ok: true, build: { kind: 'eraseFloor', level, tiles: [], room: a } };
      const tiles = tool.shape === 'rect' ? tileRectTiles(a, snapTile(to ?? from)) : [a];
      return { ok: true, build: { kind: 'eraseFloor', level, tiles } };
    }
    case 'deleteRoom': return { ok: true, build: { kind: 'deleteRoom', level, tile: snapTile(from) } };
    case 'roomEdit': {
      const tile = snapTile(from);
      if (tool.edit === 'resize') return { ok: true, roomOp: { kind: 'resizeRoom', level, tile, side: tool.side ?? 'e', delta: Math.trunc(tool.delta ?? 0) } };
      const dx = Math.trunc(tool.dx ?? 0), dz = Math.trunc(tool.dz ?? 0);
      return { ok: true, roomOp: tool.edit === 'move' ? { kind: 'moveRoom', level, tile, dx, dz } : { kind: 'duplicateRoom', level, tile, dx, dz, copyObjects: tool.copyObjects === true } };
    }
    case 'stairs': {
      const def = content.objects[tool.defId];
      if (!def?.stair) return bad('Choose a staircase first.');
      const rot = ((((Math.trunc(tool.rot ?? 0) % 4) + 4) % 4) as Rot);
      const size = rotatedSize(def.footprint, rot);
      const t = snapTile(from);
      // the pointer is on the middle of the footprint
      return { ok: true, object: { place: { defId: def.id, x: t.x - Math.floor((size.w - 1) / 2), z: t.z - Math.floor((size.d - 1) / 2), rot, level } } };
    }
    case 'fence': {
      const def = exteriorOf(content).fences[tool.defId];
      if (!def) return bad('Choose a fence design first.');
      if (def.kind === 'gate') {
        const e = nearestEdge(lot, level, from, false);
        return e ? { ok: true, exterior: gateRequest(level, e, def.id, tool.variant ?? 0) } : bad('Point at the lot.');
      }
      const a = snapVertex(lot, from);
      const b = snapVertex(lot, to ?? from);
      const rect = tool.shape === 'rect' || target.rect === true;
      const run = rect ? fenceRectRequest(level, a, b, def.id, tool.variant ?? 0) : fencePathRequest(level, a, b, def.id, tool.variant ?? 0);
      return run.ok ? { ok: true, exterior: run.request } : bad(run.reason);
    }
    case 'eraseFence': {
      const e = nearestFenceEdge(lot, level, from);
      return e ? { ok: true, exterior: { kind: 'eraseFence', level, edges: [e] } } : bad('There is no fence there.');
    }
    case 'roof': {
      const spec = { styleId: tool.spec.styleId, finish: tool.spec.finish, ...(tool.spec.pitch !== undefined ? { pitch: tool.spec.pitch } : {}), ...(tool.spec.ridge ? { ridge: tool.spec.ridge } : {}) };
      if (tool.shape === 'auto') return { ok: true, exterior: { kind: 'autoRoof', spec } };
      const r = roofRectRequest(level, snapVertex(lot, from), snapVertex(lot, to ?? from), spec);
      return r.ok ? { ok: true, exterior: r.request } : bad(r.reason);
    }
    case 'eraseRoof': return { ok: true, exterior: { kind: 'eraseRoof', tile: snapTile(from) } };
    case 'terrain': {
      const a = snapTile(from);
      return { ok: true, exterior: { kind: 'terrain', paintId: tool.paintId, tiles: tool.shape === 'rect' ? tileRectTiles(a, snapTile(to ?? from)) : [a] } };
    }
    case 'eraseStairs': {
      const t = snapTile(from);
      const found = stairAt(content, lot, level, t.x, t.z);
      return found ? { ok: true, object: { remove: found } } : bad('Point at a staircase.');
    }
    case 'pool': {
      // Pools live on the ground floor; the drag corners are inclusive water tiles.
      if (level !== 0) return bad('Pools go on the ground floor or outside.');
      const a = snapTile(from), b = snapTile(to ?? from);
      return {
        ok: true,
        pool: { kind: 'pool', rect: { x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) }, styleId: tool.styleId },
      };
    }
    case 'erasePool': {
      if (level !== 0) return bad('There is no pool there.');
      const t = snapTile(from);
      const pool = poolsOf(lot).find((p) => poolContains(p, t.x, t.z));
      return pool ? { ok: true, pool: { kind: 'erasePool', poolId: pool.id } } : bad('Point at a pool.');
    }
    case 'poolLadder': {
      if (level !== 0) return bad('There is no pool there.');
      const t = snapTile(from);
      const pool = tool.poolId ? lot.pools?.[tool.poolId] : poolsOf(lot).find((p) => poolContains(p, t.x, t.z));
      if (!pool) return bad('Point at a pool.');
      if (tool.mode === 'move') {
        const fromTile = tool.from ? snapTile(tool.from) : null;
        if (!fromTile) return bad('Tap the ladder to move.');
        return { ok: true, pool: { kind: 'moveLadder', poolId: pool.id, from: fromTile, to: t } };
      }
      return { ok: true, pool: tool.mode === 'add' ? { kind: 'addLadder', poolId: pool.id, tile: t } : { kind: 'removeLadder', poolId: pool.id, tile: t } };
    }
  }
}

/** The staircase whose footprint covers the tile on `level` (or on the level below, where it opens into this one). */
function stairAt(content: ContentDB, lot: Lot, level: number, x: number, z: number): Id | null {
  for (const o of Object.values(lot.objects).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const def = content.objects[o.defId];
    if (!def?.stair || (o.level !== level && o.level + 1 !== level)) continue;
    const s = rotatedSize(def.footprint, o.rot);
    if (x >= o.x && x < o.x + s.w && z >= o.z && z < o.z + s.d) return o.id;
  }
  return null;
}

/** First edge key for an opening of `span` tiles centred on the wall under the pointer. */
function openingWallId(lot: Lot, level: number, target: BuildTarget, span: number): string | null {
  let e: EdgeRef | null;
  if (target.wallId) {
    const w = lot.walls[target.wallId];
    e = w ? { dir: w.dir, x: w.x, z: w.z } : null;
  } else e = nearestEdge(lot, level, target.from, true);
  if (!e) return null;
  // centre a wide opening on the pointer: the first edge is (span - 1) / 2 edges back along the wall
  const first = shiftEdge(e, -Math.floor((span - 1) / 2));
  return edgeKey(level, first.dir, first.x, first.z);
}

// ---------------------------------------------------------------------------------------------
// BuildTools
// ---------------------------------------------------------------------------------------------

export interface BuildToolsDeps {
  content: ContentDB;
  events: EventBus;
  world: () => WorldState | null;
  /** Runs a command through the owner's undo stack. */
  run: (cmd: UndoableCommand) => Result;
  /** A reason build tools cannot be used right now (not in Build mode...), or null. */
  blocked: () => string | null;
  /** The tool, preview or highlight changed. */
  changed: () => void;
}

/** What previewing resolved to, kept so apply and the renderer agree. */
interface Evaluation { preview: BuildPreview; resolved: Resolved }

export class BuildTools {
  private activeTool: BuildTool | null = null;
  private hl: { highlight: BuildHighlight; ok: boolean } | null = null;
  private readonly tracker = new RoomTracker();
  private roomCache: { key: string; rooms: RoomInfo[] } | null = null;

  constructor(private readonly d: BuildToolsDeps) {
    d.events.on('state.replaced', () => { this.tracker.reset(); this.roomCache = null; });
    d.events.on('lot.changed', (e) => {
      const w = d.world();
      if (w && e.lotId === w.activeLotId) this.refreshRooms();
    });
  }

  /** Drops the tool and preview, keeping room identities (leaving Build mode). */
  clear(): void {
    const had = this.activeTool !== null || this.hl !== null;
    this.activeTool = null;
    this.hl = null;
    if (had) this.d.changed();
  }

  /** Forgets the tool, preview and room identities (new game or load). */
  reset(): void {
    this.activeTool = null;
    this.hl = null;
    this.roomCache = null;
    this.tracker.reset();
  }

  // ---- tool state ----

  setTool(tool: BuildTool | null): void {
    this.activeTool = tool ? clone(tool) : null;
    this.hl = null;
    this.d.changed();
  }

  tool(): BuildTool | null { return this.activeTool; }

  /** True while a preview highlight is shown (autosave waits). */
  active(): boolean { return this.hl !== null; }

  highlight(): { highlight: BuildHighlight; ok: boolean } | null { return this.hl; }

  cancel(): void { this.setHighlight(null); }

  private setHighlight(h: { highlight: BuildHighlight; ok: boolean } | null): void {
    if (JSON.stringify(h) === JSON.stringify(this.hl)) return;
    this.hl = h;
    this.d.changed();
  }

  // ---- preview and apply ----

  private evaluate(target: BuildTarget): Evaluation | string {
    const reason = this.d.blocked();
    if (reason) return reason;
    const state = this.d.world();
    const tool = this.activeTool;
    if (!state || !tool) return 'Choose a build tool first.';
    const lot = state.lots[state.activeLotId];
    const hh = state.households[state.activeHouseholdId];
    if (!lot || !hh) return 'No home lot is loaded.';
    const resolved = resolveBuild(this.d.content, lot, tool, target);
    if (!resolved.ok) {
      return { resolved, preview: this.emptyPreview(resolved.reason) };
    }
    if ('paint' in resolved) {
      const p = previewPaint(state, this.d.content, lot.id, hh.id, resolved.paint.target, resolved.paint.finish);
      const unchanged = !p.ok && p.count === 0 && p.reasons[0] !== undefined && /already/i.test(p.reasons[0]);
      const preview: BuildPreview = {
        ok: p.ok, reasons: unchanged ? ['Already has this floor'] : p.reasons, ...(p.ok ? {} : { reason: unchanged ? 'Already has this floor' : p.reasons[0] ?? 'That cannot be built.' }),
        ...(unchanged ? { unchanged: true as const } : {}),
        label: 'Lay floor', cost: p.cost, charge: Math.max(0, p.cost), refund: 0,
        counts: { ...KINDLESS_COUNTS, floorsPlaced: p.count }, measure: { lengthM: 0, areaM2: p.count, text: `${p.count} m2` },
        rooms: { before: 0, after: 0 },
        highlight: { level: target.level ?? 0, newWalls: [], existingWalls: [], removedWalls: [], openingEdges: [], removedOpeningEdges: [], tiles: p.tiles.map((t) => ({ x: t.x, z: t.z })), blocked: [] },
      };
      return { resolved, preview };
    }
    if ('object' in resolved) return { resolved, preview: this.objectPreview(state, lot, hh.id, resolved.object, target.level ?? 0) };
    if ('exterior' in resolved) return { resolved, preview: this.exteriorPreview(planExterior(state, this.d.content, lot.id, hh.id, resolved.exterior)) };
    if ('pool' in resolved) return { resolved, preview: this.poolPreview(planPool(state, this.d.content, lot.id, hh.id, resolved.pool)) };
    if ('roomOp' in resolved) return { resolved, preview: this.roomPreview(planRoomOp(state, this.d.content, lot.id, hh.id, resolved.roomOp)) };
    const plan = planBuild(state, this.d.content, lot.id, hh.id, resolved.build);
    return { resolved, preview: this.fromPlan(plan) };
  }

  /** Preview of buying or selling a staircase. */
  private objectPreview(state: WorldState, lot: Lot, householdId: Id, o: { place: BuyRequest } | { remove: Id }, level: number): BuildPreview {
    const none = { ...KINDLESS_COUNTS };
    if ('place' in o) {
      const p = planBuy(state, this.d.content, lot.id, householdId, o.place);
      const name = p.def?.name ?? 'staircase';
      return {
        ok: p.ok, ...(p.ok ? {} : { reason: p.reasons[0] ?? 'That cannot be built.' }), reasons: p.reasons, label: `Build ${name}`,
        cost: p.cost, charge: Math.max(0, p.cost), refund: 0, counts: none, measure: { lengthM: 0, text: p.def ? `${p.def.footprint.w} x ${p.def.footprint.d} m` : '' },
        rooms: { before: 0, after: 0 },
        highlight: { level, newWalls: [], existingWalls: [], removedWalls: [], openingEdges: [], removedOpeningEdges: [], tiles: p.tiles.map((t) => ({ x: t.x, z: t.z })), blocked: [] },
        ...(p.warnings && p.warnings.length > 0 ? { warnings: p.warnings } : {}),
      };
    }
    const p = planSell(state, this.d.content, lot.id, householdId, o.remove);
    const obj = lot.objects[o.remove];
    const name = (obj && this.d.content.objects[obj.defId]?.name) ?? 'staircase';
    return {
      ok: p.ok, ...(p.ok ? {} : { reason: p.reasons[0] ?? 'That cannot be removed.' }), reasons: p.reasons, label: `Remove ${name}`,
      cost: p.cost, charge: 0, refund: Math.max(0, -p.cost), counts: none, measure: { lengthM: 0, text: '' }, rooms: { before: 0, after: 0 },
      highlight: { level: obj?.level ?? level, newWalls: [], existingWalls: [], removedWalls: [], openingEdges: [], removedOpeningEdges: [], tiles: p.tiles.map((t) => ({ x: t.x, z: t.z })), blocked: [] },
    };
  }

  /** The undoable command for a resolved pool request (Milestone 12). */
  private poolCommand(lot: Lot, householdId: Id, req: PoolRequest): UndoableCommand {
    switch (req.kind) {
      case 'pool': return buildPool(lot.id, householdId, req.rect, req.styleId, req.ladder);
      case 'erasePool': return removePool(lot.id, householdId, { ...(req.poolId ? { poolId: req.poolId } : {}), ...(req.tile ? { tile: req.tile } : {}) });
      case 'moveLadder': return movePoolLadder(lot.id, householdId, req.poolId, req.from, req.to);
      case 'addLadder': return addPoolLadder(lot.id, householdId, req.poolId, req.tile);
      case 'removeLadder': return removePoolLadder(lot.id, householdId, req.poolId, req.tile);
    }
  }

  /** Preview of a fence, roof or paint plan (Milestone 9): edges and tiles ride in the usual highlight. */
  private exteriorPreview(plan: ExteriorPlan): BuildPreview {
    const h = plan.highlight;
    return {
      ok: plan.ok, ...(plan.ok ? {} : { reason: plan.reasons[0] ?? 'That cannot be built.' }), reasons: plan.reasons,
      ...(plan.noop ? { unchanged: true as const } : {}), label: plan.label, cost: plan.cost, charge: plan.charge, refund: plan.refund,
      counts: { ...KINDLESS_COUNTS }, measure: { lengthM: plan.measure.lengthM, ...(plan.measure.areaM2 !== undefined ? { areaM2: plan.measure.areaM2 } : {}), text: plan.measure.text },
      rooms: { before: 0, after: 0 },
      highlight: {
        level: h.level, newWalls: h.newEdges, existingWalls: h.existingEdges, removedWalls: h.removedEdges, openingEdges: [], removedOpeningEdges: [],
        tiles: h.tiles, blocked: h.blocked,
      },
    };
  }

  /** Preview of a room move, resize or duplicate (Milestone 13): the destination tiles ride in the usual highlight. */
  private roomPreview(plan: RoomOpPlan): BuildPreview {
    return {
      ok: plan.ok, ...(plan.ok ? {} : { reason: plan.reasons[0] ?? 'That cannot be done.' }), reasons: plan.reasons, label: plan.label, cost: plan.cost, charge: plan.charge, refund: plan.refund,
      counts: { ...KINDLESS_COUNTS, wallsNew: plan.diff.walls.filter((w) => w.after && !w.before).length, wallsRemoved: plan.diff.walls.filter((w) => w.before && !w.after).length,
        openingsAdded: plan.diff.openings.filter((o) => o.after && !o.before).length, openingsMoved: plan.diff.openings.filter((o) => o.before && o.after).length,
        openingsRemoved: plan.diff.openings.filter((o) => o.before && !o.after).length, floorsPlaced: plan.diff.floors.filter((f) => f.after).length, floorsErased: plan.diff.floors.filter((f) => !f.after).length },
      measure: { lengthM: 0, text: plan.measure }, rooms: { before: 0, after: 0 },
      highlight: {
        level: plan.highlight.level, newWalls: plan.diff.walls.filter((w) => w.after && !w.before).map((w) => w.key), existingWalls: [],
        removedWalls: plan.diff.walls.filter((w) => w.before && !w.after).map((w) => w.key), openingEdges: [], removedOpeningEdges: [], tiles: plan.highlight.tiles, blocked: plan.highlight.blocked,
      },
    };
  }

  /** Preview of a pool plan (Milestone 12): water tiles ride in the usual highlight. */
  private poolPreview(plan: PoolPlan): BuildPreview {
    const tiles = plan.highlight.tiles.length > 0
      ? plan.highlight.tiles
      : plan.highlight.removedPools.flatMap((r) => {
        const out: Array<{ x: number; z: number }> = [];
        for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) out.push({ x, z });
        return out;
      });
    return {
      ok: plan.ok, ...(plan.ok ? {} : { reason: plan.reasons[0] ?? 'That cannot be built.' }), reasons: plan.reasons,
      ...(plan.noop ? { unchanged: true as const } : {}), label: plan.label, cost: plan.cost, charge: plan.charge, refund: plan.refund,
      counts: { ...KINDLESS_COUNTS }, measure: { lengthM: 0, ...(plan.measure.areaM2 !== undefined ? { areaM2: plan.measure.areaM2 } : {}), text: plan.measure.text },
      rooms: { before: 0, after: 0 },
      highlight: { level: 0, newWalls: [], existingWalls: [], removedWalls: [], openingEdges: [], removedOpeningEdges: [], tiles, blocked: plan.highlight.blocked },
    };
  }

  private emptyPreview(reason: string): BuildPreview {
    return { ok: false, reason, reasons: [reason], label: '', cost: 0, charge: 0, refund: 0, counts: { ...KINDLESS_COUNTS }, measure: { lengthM: 0, text: '' }, rooms: { before: 0, after: 0 }, highlight: null };
  }

  private fromPlan(plan: BuildPlan): BuildPreview {
    return {
      ok: plan.ok, ...(plan.ok ? {} : { reason: plan.reasons[0] ?? 'That cannot be built.' }), reasons: plan.reasons,
      ...(plan.noop ? { unchanged: true as const } : {}), label: plan.label, cost: plan.cost, charge: plan.charge, refund: plan.refund,
      counts: plan.counts, measure: plan.measure, rooms: plan.rooms, highlight: plan.highlight,
      ...(plan.warnings && plan.warnings.length > 0 ? { warnings: plan.warnings } : {}),
    };
  }

  /** Previews the tool at the target; sets the highlight. Never changes the world. */
  preview(target: BuildTarget | null): BuildPreview | null {
    if (!target || !this.activeTool) { this.setHighlight(null); return null; }
    const ev = this.evaluate(target);
    if (typeof ev === 'string') { this.setHighlight(null); return this.emptyPreview(ev); }
    this.setHighlight(ev.preview.highlight ? { highlight: ev.preview.highlight, ok: ev.preview.ok || ev.preview.unchanged === true } : null);
    return ev.preview;
  }

  /** Runs the tool at the target through the owner's undo stack. */
  apply(target: BuildTarget): Result & Partial<BuildApplyResult> {
    const state = this.d.world();
    const ev = this.evaluate(target);
    if (typeof ev === 'string') return fail(ev);
    if (!state) return fail('No game is running.');
    const pv = ev.preview;
    if (!pv.ok) return fail(pv.reason ?? 'That cannot be built.');
    const lot = state.lots[state.activeLotId]!;
    const hh = state.households[state.activeHouseholdId]!;
    const lvl = target.level ?? 0;
    const r = ev.resolved;
    if (!r.ok) return fail(r.reason);
    const before = this.trackedRooms(lot, lvl);
    const cmd: UndoableCommand = 'paint' in r ? paintCommand(lot.id, hh.id, r.paint.target, r.paint.finish)
      : 'object' in r ? ('place' in r.object ? buyObject(lot.id, hh.id, r.object.place) : sellObject(lot.id, hh.id, r.object.remove))
        : 'exterior' in r ? exteriorCommand(lot.id, hh.id, r.exterior)
          : 'pool' in r ? this.poolCommand(lot, hh.id, r.pool)
            : 'roomOp' in r ? roomCommand(lot.id, hh.id, r.roomOp)
              : buildCommand(lot.id, hh.id, r.build);
    const before0 = new Set(Object.keys(lot.openings));
    const res = this.d.run(cmd);
    if (!res.ok) return res;
    this.setHighlight(null);
    const plan = (cmd as BuildCommand | ExteriorCommand).plan;
    const exterior = 'exterior' in r;
    const pool = 'pool' in r || 'roomOp' in r;
    const after = this.tracker.current(lot.id, lvl);
    const placedId = Object.keys(lot.openings).find((id) => !before0.has(id));
    const openingId = placedId ?? ('extra' in r ? r.extra?.openingId : undefined);
    return {
      ok: true, cost: plan ? plan.cost : pv.cost, label: plan ? plan.label : pv.label, counts: plan && !exterior && !pool ? (plan as BuildPlan).counts : pv.counts,
      rooms: RoomTracker.delta(before, after), ...(openingId ? { openingId } : {}),
    };
  }

  // ---- rooms and openings ----

  private refreshRooms(): void {
    const w = this.d.world();
    const lot = w?.lots[w.activeLotId];
    if (!w || !lot) return;
    for (let level = 0; level < lot.levels; level++) this.tracker.update(lot, level);
    this.roomCache = null;
  }

  /** Tracked rooms of a level, computing them the first time (later updates follow 'lot.changed'). */
  private trackedRooms(lot: Lot, level: number): TrackedRoom[] {
    const cur = this.tracker.current(lot.id, level);
    return cur.length > 0 ? cur : this.tracker.update(lot, level);
  }

  rooms(level = 0): RoomInfo[] {
    const w = this.d.world();
    const lot = w?.lots[w.activeLotId];
    if (!w || !lot || !hasLevel(lot, level)) return [];
    const tracked = this.trackedRooms(lot, level);
    const key = `${lot.id}#${level}#${tracked.map((r) => r.uid + r.tiles.length).join(',')}`;
    if (this.roomCache?.key !== key) {
      this.roomCache = { key, rooms: tracked.map((r) => toInfo(r)) };
    }
    return this.roomCache.rooms;
  }

  roomAt(tile: Tile, level = 0): RoomInfo | null {
    const w = this.d.world();
    const lot = w?.lots[w.activeLotId];
    if (!lot || !inLot(lot, tile.x, tile.z)) return null;
    return this.rooms(level).find((r) => r.tiles.some((t) => t.x === tile.x && t.z === tile.z)) ?? null;
  }

  openingAt(wallId: string): { openingId: Id; defId: string; kind: 'door' | 'window'; wallId: string; span: number; flip: boolean } | null {
    const w = this.d.world();
    const lot = w?.lots[w.activeLotId];
    const o = lot ? openingOnWall(lot, wallId) : undefined;
    if (!o) return null;
    const kind = this.d.content.openings[o.defId]?.kind === 'window' ? 'window' : 'door';
    return { openingId: o.id, defId: o.defId, kind, wallId: o.wallId, span: openingEdgeKeys(o).length, flip: o.flip };
  }
}

function toInfo(r: TrackedRoom): RoomInfo {
  return { uid: r.uid, level: r.level, tiles: r.tiles.map((t) => ({ x: t.x, z: t.z })), area: r.tiles.length, outdoor: r.outdoor, outlines: roomOutlines(r.tiles) };
}

export type { RoomDelta };
