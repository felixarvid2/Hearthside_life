// Pure planning for Build mode construction: walls (segment, run, rectangular room), demolition, doors and
// windows (place, move, remove), floor erase and room delete. A plan validates the whole operation
// (world/structure.ts validateDiff), prices it and lists exactly what changes (BuildDiff), the measurements
// and the highlight the renderer shows. Nothing here mutates state or allocates ids, so previews can run on
// every pointer move and an invalid or cancelled preview can never spend money.
//
// Money (integer cents, brief section 12 and 17):
// - A new wall segment costs structurePrice(height) plus the design price of each side's finish (so a default
//   plain-paint wall is $20 + 2 x $4 at the standard 2.8 m). Segments that already exist are kept as they are
//   (finishes included) and cost nothing. Floors cost the floor design's price per tile that changes. Doors
//   and windows cost the opening definition's price. The sandbox (settings.unlimitedFunds) charges nothing and
//   records 0 as the paid price, so demolishing what it built returns nothing.
// - Demolition returns the paid price on the game day it was built, otherwise 80 % (the sell rules of
//   building/plans.ts). Walls and floors that came with the lot carry no price: they return 80 % of the
//   current structure/design price (nothing in the sandbox). Openings return their purchase price the same way.
// - cost = charge - refund; a plan that both builds and demolishes (room delete never does) nets them.
//
// Wall heights: presets WALL_HEIGHT_PRESETS (half wall, standard, tall). Doors and windows need the wall to be at
// least sill + height high, so a half wall takes neither.
//
// Decisions (documented for the UI):
// - Deleting a wall deletes the door or window in it as part of the same command and refunds it. A wide opening
//   goes with any one of the edges it spans (the other edges keep their walls).
// - Existing wall segments inside a new run are skipped (free, finishes preserved); a run that adds nothing is
//   refused as "already built".
// - People are never pushed: a wall near someone, or one that walls them in, is refused with their name.

import type { ContentDB, OpeningDef } from '../content/types';
import { MINUTES_PER_DAY } from '../core/clock';
import { footprintTiles } from '../core/geometry';
import { edgeKey, parseEdgeKey, tileKey } from '../core/ids';
import { dollars } from '../core/money';
import type { Cents, EdgeDir, FinishRef, Id, Lot, Opening, Wall, WorldState } from '../core/types';
import { hasLevel, inLot } from '../world/lots';
import { computeRooms, roomAt } from '../world/rooms';
import {
  validateDiff, virtualLot, type BuildConflict, type BuildDiff, type FloorDelta, type OpeningDelta, type WallDelta,
} from '../world/structure';
import { DEFAULT_WALL_HEIGHT, edgeInLot, openingEdgeKeys, tileOnSide } from '../world/walls';
import { chargeFor, editAccess, RESALE_RATE, saleValue } from './plans';

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

export interface WallHeightPreset { id: 'half' | 'standard' | 'tall'; label: string; height: number }

/** Wall height presets in metres. Doors need 2.1 m and windows sill + height, so the half wall holds neither. */
export const WALL_HEIGHT_PRESETS: readonly WallHeightPreset[] = [
  { id: 'half', label: 'Half wall', height: 1.2 },
  { id: 'standard', label: 'Standard', height: DEFAULT_WALL_HEIGHT },
  { id: 'tall', label: 'Tall', height: 3.6 },
];

/** Price of one metre of bare wall structure at the standard height. */
export const WALL_SEGMENT_PRICE: Cents = dollars(20);

/** Design used for new wall sides when a request names none (M1 shared id; palettes[0] is the default). */
export const DEFAULT_WALL_DESIGN_ID = 'plain-paint';

const NOT_ENOUGH = 'Not enough household funds.';
/** Marks records that came with the lot (no boughtAt): always "bought before today". */
const LONG_AGO = -MINUTES_PER_DAY;

export function isValidWallHeight(h: number): boolean { return Number.isFinite(h) && h >= 0.9 && h <= 4; }

/** Structure price of one wall segment (without finishes), scaled by height. */
export function structurePrice(height: number): Cents { return Math.round(WALL_SEGMENT_PRICE * height / DEFAULT_WALL_HEIGHT); }

// ---------------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------------

/** A grid edge: 'h' edge (x, z) runs from (x, z) to (x + 1, z); 'v' edge (x, z) from (x, z) to (x, z + 1). */
export interface EdgeRef { dir: EdgeDir; x: number; z: number }
/** A grid vertex. */
export interface Point { x: number; z: number }
export interface Rect { x0: number; z0: number; x1: number; z1: number }

export interface WallSpec {
  /** Finish of side 'a' / 'b' for NEW segments (default: the default wall design, first palette). */
  finishA?: FinishRef;
  finishB?: FinishRef;
  /** Height in metres (default 2.8; see WALL_HEIGHT_PRESETS). */
  height?: number;
}

/** A door or window built together with new walls (so a sealed room and its door are one atomic edit). */
export interface OpeningSpec { defId: string; wallId: string; flip?: boolean }

export type BuildShape = 'segment' | 'run' | 'rect';

export type BuildRequest =
  | {
    kind: 'walls'; level: number; shape: BuildShape; edges: EdgeRef[]; rect?: Rect;
    spec?: WallSpec; /** Floor fill for the rectangular room tool. */ floor?: { tiles: Point[]; finish: FinishRef };
    openings?: OpeningSpec[];
  }
  | { kind: 'eraseWalls'; level: number; shape: BuildShape; edges: EdgeRef[]; rect?: Rect }
  | { kind: 'placeOpening'; defId: string; wallId: string; flip?: boolean }
  | { kind: 'moveOpening'; openingId: Id; wallId: string; flip?: boolean }
  | { kind: 'eraseOpening'; openingId: Id }
  | { kind: 'eraseFloor'; level: number; tiles: Point[]; /** Erase the whole room containing this tile instead of `tiles`. */ room?: Point }
  | { kind: 'deleteRoom'; level: number; tile: Point };

export type Built = { ok: true; request: BuildRequest } | { ok: false; reason: string };
const bad = (reason: string): Built => ({ ok: false, reason });

/** The run's far end projected onto the dominant axis, so a drag always yields a straight wall. */
export function straightenRun(from: Point, to: Point): Point {
  return Math.abs(to.x - from.x) >= Math.abs(to.z - from.z) ? { x: to.x, z: from.z } : { x: from.x, z: to.z };
}

/** Edges of a straight run between two grid vertices (axis-aligned), or null when it is diagonal or empty. */
export function runEdges(from: Point, to: Point): EdgeRef[] | null {
  if (![from.x, from.z, to.x, to.z].every(Number.isInteger)) return null;
  const out: EdgeRef[] = [];
  if (from.z === to.z && from.x !== to.x) {
    for (let x = Math.min(from.x, to.x); x < Math.max(from.x, to.x); x++) out.push({ dir: 'h', x, z: from.z });
  } else if (from.x === to.x && from.z !== to.z) {
    for (let z = Math.min(from.z, to.z); z < Math.max(from.z, to.z); z++) out.push({ dir: 'v', x: from.x, z });
  } else return null;
  return out;
}

export function normalizeRect(a: Point, b: Point): Rect {
  return { x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) };
}

/** Perimeter edges of the rectangle (vertex rect, x1 > x0 and z1 > z0), clockwise from the north-west corner. */
export function rectPerimeter(r: Rect): EdgeRef[] {
  const out: EdgeRef[] = [];
  for (let x = r.x0; x < r.x1; x++) out.push({ dir: 'h', x, z: r.z0 });
  for (let z = r.z0; z < r.z1; z++) out.push({ dir: 'v', x: r.x1, z });
  for (let x = r.x1 - 1; x >= r.x0; x--) out.push({ dir: 'h', x, z: r.z1 });
  for (let z = r.z1 - 1; z >= r.z0; z--) out.push({ dir: 'v', x: r.x0, z });
  return out;
}

/** Tiles inside a vertex rectangle (x0 <= x < x1, z0 <= z < z1). */
export function rectTiles(r: Rect): Point[] {
  const out: Point[] = [];
  for (let z = r.z0; z < r.z1; z++) for (let x = r.x0; x < r.x1; x++) out.push({ x, z });
  return out;
}

/** Tiles of an inclusive tile rectangle between two tiles. */
export function tileRectTiles(a: Point, b: Point): Point[] {
  return rectTiles({ x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x) + 1, z1: Math.max(a.z, b.z) + 1 });
}

/** One wall segment on an edge. */
export function wallSegmentRequest(level: number, edge: EdgeRef, spec?: WallSpec, openings?: OpeningSpec[]): BuildRequest {
  return { kind: 'walls', level, shape: 'segment', edges: [{ ...edge }], ...(spec ? { spec } : {}), ...(openings ? { openings } : {}) };
}

/** A continuous straight run between two grid vertices (axis-aligned). */
export function wallRunRequest(level: number, from: Point, to: Point, spec?: WallSpec, openings?: OpeningSpec[]): Built {
  const edges = runEdges(from, to);
  if (!edges) return bad(from.x === to.x && from.z === to.z ? 'Drag to set the wall length.' : 'Walls run in straight lines.');
  return { ok: true, request: { kind: 'walls', level, shape: 'run', edges, ...(spec ? { spec } : {}), ...(openings ? { openings } : {}) } };
}

/** The rectangular room tool: perimeter walls between two corner vertices, optional floor fill of the inside. */
export function wallRectRequest(
  level: number, a: Point, b: Point, o: { spec?: WallSpec; floor?: FinishRef | null; openings?: OpeningSpec[] } = {},
): Built {
  const r = normalizeRect(a, b);
  if (![r.x0, r.z0, r.x1, r.z1].every(Number.isInteger)) return bad('Rooms snap to the grid.');
  if (r.x1 === r.x0 || r.z1 === r.z0) return bad('Drag a corner to size the room.');
  return {
    ok: true,
    request: {
      kind: 'walls', level, shape: 'rect', edges: rectPerimeter(r), rect: r,
      ...(o.spec ? { spec: o.spec } : {}),
      ...(o.floor ? { floor: { tiles: rectTiles(r), finish: o.floor } } : {}),
      ...(o.openings ? { openings: o.openings } : {}),
    },
  };
}

/** Demolish one segment. */
export function eraseSegmentRequest(level: number, edge: EdgeRef): BuildRequest {
  return { kind: 'eraseWalls', level, shape: 'segment', edges: [{ ...edge }] };
}

/** Demolish the walls along a straight run. */
export function eraseRunRequest(level: number, from: Point, to: Point): Built {
  const edges = runEdges(from, to);
  return edges ? { ok: true, request: { kind: 'eraseWalls', level, shape: 'run', edges } } : bad('Drag along a straight line.');
}

/** Demolish every wall lying completely inside the vertex rectangle (its outline included). */
export function eraseRectRequest(level: number, a: Point, b: Point): Built {
  const r = normalizeRect(a, b);
  if (![r.x0, r.z0, r.x1, r.z1].every(Number.isInteger)) return bad('Select whole tiles.');
  if (r.x1 === r.x0 && r.z1 === r.z0) return bad('Drag to select an area.');
  const edges: EdgeRef[] = [];
  for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x < r.x1; x++) edges.push({ dir: 'h', x, z });
  for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z < r.z1; z++) edges.push({ dir: 'v', x, z });
  return { ok: true, request: { kind: 'eraseWalls', level, shape: 'rect', edges, rect: r } };
}

// ---------------------------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------------------------

export interface BuildCounts {
  /** Wall segments that would be created / kept as they are (already built) / demolished. */
  wallsNew: number;
  wallsExisting: number;
  wallsRemoved: number;
  openingsAdded: number;
  openingsMoved: number;
  openingsRemoved: number;
  floorsPlaced: number;
  floorsErased: number;
}

export interface BuildMeasure {
  /** Length of the wall run / total perimeter in metres (0 when not applicable). */
  lengthM: number;
  widthM?: number;
  depthM?: number;
  areaM2?: number;
  /** Ready-to-show text such as "6 m", "6 x 4 m (24 m2)". */
  text: string;
}

export interface BuildHighlight {
  level: number;
  /** Edge keys of walls that would be created (red when the plan is invalid). */
  newWalls: string[];
  /** Edge keys the request covers that already hold a wall (kept, free). */
  existingWalls: string[];
  /** Edge keys of walls that would be demolished. */
  removedWalls: string[];
  /** Edge keys covered by openings that would appear / move to / disappear. */
  openingEdges: string[];
  removedOpeningEdges: string[];
  /** Floor tiles that would be placed or erased. */
  tiles: Point[];
  /** What blocks the operation. */
  blocked: BuildConflict[];
}

export interface BuildPlan {
  ok: boolean;
  /** Player-facing reasons, most important first (empty when ok). */
  reasons: string[];
  /** True when the request would change nothing (already built, nothing to erase); reasons then explain it. */
  noop: boolean;
  /** Short description ("Build 6 m of wall"); also the undo label. */
  label: string;
  /** Net money now: charge - refund (negative = money back). 0 charge in the sandbox. */
  cost: Cents;
  charge: Cents;
  refund: Cents;
  counts: BuildCounts;
  measure: BuildMeasure;
  highlight: BuildHighlight;
  /** Indoor (enclosed) room counts before and after, so the UI can say "creates 1 room". */
  rooms: { before: number; after: number };
  /** The exact change; opening ids of new openings are placeholders ('pending:n') until a command applies it. */
  diff: BuildDiff;
}

export const PENDING_PREFIX = 'pending:';

const emptyCounts = (): BuildCounts => ({ wallsNew: 0, wallsExisting: 0, wallsRemoved: 0, openingsAdded: 0, openingsMoved: 0, openingsRemoved: 0, floorsPlaced: 0, floorsErased: 0 });
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const keyOf = (e: EdgeRef, level: number) => edgeKey(level, e.dir, e.x, e.z);

function failPlan(level: number, reasons: string[], label = 'Build', extra: Partial<BuildPlan> = {}): BuildPlan {
  return {
    ok: false, reasons, noop: false, label, cost: 0, charge: 0, refund: 0, counts: emptyCounts(), measure: { lengthM: 0, text: '' },
    highlight: { level, newWalls: [], existingWalls: [], removedWalls: [], openingEdges: [], removedOpeningEdges: [], tiles: [], blocked: [] },
    rooms: { before: 0, after: 0 }, diff: { level, walls: [], openings: [], floors: [] }, ...extra,
  };
}

function indoorRooms(lot: Lot, level: number): number { return computeRooms(lot, level).filter((r) => !r.outdoor).length; }

/** Default finish for new wall sides: the default design's first palette (falls back to any ready design). */
export function defaultWallFinish(content: ContentDB): FinishRef | null {
  const d = content.wallDesigns[DEFAULT_WALL_DESIGN_ID] ?? Object.values(content.wallDesigns).find((x) => x.status === 'ready' && x.palettes.length > 0);
  const p = d?.palettes[0];
  return d && p ? { designId: d.id, paletteId: p.id } : null;
}

function finishCheck(content: ContentDB, kind: 'wall' | 'floor', f: FinishRef): { price: Cents } | string {
  const d = (kind === 'wall' ? content.wallDesigns : content.floorDesigns)[f.designId];
  if (!d) return `Unknown ${kind} design.`;
  if (!d.palettes.some((p) => p.id === f.paletteId)) return `${d.name} has no such colour palette.`;
  return { price: d.price };
}

/** Refund for demolishing a wall (see the module comment). */
export function wallRefund(state: WorldState, wall: Wall): Cents {
  if (wall.purchasePrice !== undefined) return saleValue(state, { boughtAt: wall.boughtAt ?? LONG_AGO, purchasePrice: wall.purchasePrice });
  return state.settings.unlimitedFunds ? 0 : Math.round(structurePrice(wall.height) * RESALE_RATE);
}

/** Refund for removing an opening. */
export function openingRefund(state: WorldState, o: Opening): Cents {
  return saleValue(state, { boughtAt: o.boughtAt ?? LONG_AGO, purchasePrice: o.purchasePrice });
}

/** Refund for erasing one floor tile with this finish. */
export function floorRefund(state: WorldState, content: ContentDB, f: FinishRef): Cents {
  if (state.settings.unlimitedFunds) return 0;
  const d = content.floorDesigns[f.designId];
  return d ? Math.round(d.price * RESALE_RATE) : 0;
}

function measureOf(req: BuildRequest, edgeCount: number): BuildMeasure {
  if (req.kind === 'walls' || req.kind === 'eraseWalls') {
    if (req.shape === 'rect' && req.rect) {
      const w = req.rect.x1 - req.rect.x0, d = req.rect.z1 - req.rect.z0;
      if (req.kind === 'walls') return { lengthM: 2 * (w + d), widthM: w, depthM: d, areaM2: w * d, text: `${w} x ${d} m (${w * d} m2)` };
      return { lengthM: edgeCount, widthM: w, depthM: d, areaM2: w * d, text: `${w} x ${d} m` };
    }
    return { lengthM: edgeCount, text: `${edgeCount} m` };
  }
  if (req.kind === 'eraseFloor') return { lengthM: 0, areaM2: req.tiles.length, text: `${req.tiles.length} m2` };
  return { lengthM: 0, text: '' };
}

/** Everything a plan computes before validation. */
interface Draft {
  label: string;
  diff: BuildDiff;
  charge: Cents;
  refund: Cents;
  counts: BuildCounts;
  measure: BuildMeasure;
  highlight: BuildHighlight;
  /** Reasons found while planning; the diff is not validated when there are any. */
  reasons: string[];
  /** Reason shown when the diff turns out empty. */
  emptyReason: string;
}

function newDraft(level: number, label: string, emptyReason: string, measure: BuildMeasure): Draft {
  return {
    label, charge: 0, refund: 0, counts: emptyCounts(), measure, reasons: [], emptyReason,
    diff: { level, walls: [], openings: [], floors: [] },
    highlight: { level, newWalls: [], existingWalls: [], removedWalls: [], openingEdges: [], removedOpeningEdges: [], tiles: [], blocked: [] },
  };
}

function openingFor(content: ContentDB, state: WorldState, spec: OpeningSpec, id: string): { opening: Opening; def: OpeningDef; paid: Cents } | string {
  const def = content.openings[spec.defId];
  if (!def) return `Unknown opening "${spec.defId}".`;
  try { parseEdgeKey(spec.wallId); } catch { return 'That wall is not valid.'; }
  const span = Math.max(1, Math.round(def.width));
  const paid = chargeFor(state, def.price);
  return {
    def, paid,
    opening: {
      id, defId: def.id, wallId: spec.wallId, flip: spec.flip ?? false, purchasePrice: paid, boughtAt: state.clock.minutes,
      ...(span > 1 ? { span } : {}),
    },
  };
}

function planWalls(state: WorldState, content: ContentDB, lot: Lot, req: Extract<BuildRequest, { kind: 'walls' }>): Draft {
  const level = req.level;
  const label = req.shape === 'rect' ? 'Build room' : req.shape === 'segment' ? 'Build wall' : 'Build walls';
  const d = newDraft(level, label, 'There is already a wall there.', measureOf(req, req.edges.length));
  if (!hasLevel(lot, level)) { d.reasons.push('That floor does not exist.'); return d; }

  const spec = req.spec ?? {};
  const fa = spec.finishA ?? defaultWallFinish(content);
  const fb = spec.finishB ?? spec.finishA ?? defaultWallFinish(content);
  if (!fa || !fb) { d.reasons.push('There is no wall design to build with.'); return d; }
  const ca = finishCheck(content, 'wall', fa), cb = finishCheck(content, 'wall', fb);
  if (typeof ca === 'string') { d.reasons.push(ca); return d; }
  if (typeof cb === 'string') { d.reasons.push(cb); return d; }
  const height = spec.height ?? DEFAULT_WALL_HEIGHT;
  if (!isValidWallHeight(height)) { d.reasons.push('That wall height is not available.'); return d; }
  const unit = structurePrice(height) + ca.price + cb.price;

  const seen = new Set<string>();
  for (const e of req.edges) {
    if (!Number.isInteger(e.x) || !Number.isInteger(e.z) || !edgeInLot(lot, e.dir, e.x, e.z)) {
      d.reasons.push('Walls have to stay on the lot.');
      d.highlight.blocked.push({ kind: 'edge', key: keyOf(e, level), reason: 'Off the lot.' });
      continue;
    }
    const key = keyOf(e, level);
    if (seen.has(key)) continue;
    seen.add(key);
    if (lot.walls[key]) { d.counts.wallsExisting++; d.highlight.existingWalls.push(key); continue; }
    const paid = chargeFor(state, unit);
    const wall: Wall = {
      id: key, level, dir: e.dir, x: e.x, z: e.z, height,
      sideA: { designId: fa.designId, paletteId: fa.paletteId }, sideB: { designId: fb.designId, paletteId: fb.paletteId },
      purchasePrice: paid, boughtAt: state.clock.minutes,
    };
    d.diff.walls.push({ key, before: null, after: wall });
    d.highlight.newWalls.push(key);
    d.counts.wallsNew++;
    d.charge += paid;
  }

  if (req.floor) {
    const fc = finishCheck(content, 'floor', req.floor.finish);
    if (typeof fc === 'string') { d.reasons.push(fc); return d; }
    const done = new Set<string>();
    for (const t of req.floor.tiles) {
      const key = tileKey(level, t.x, t.z);
      if (done.has(key)) continue;
      done.add(key);
      if (!inLot(lot, t.x, t.z)) { d.reasons.push('Floors have to stay on the lot.'); continue; }
      const before = lot.floors[key];
      if (before && before.designId === req.floor.finish.designId && before.paletteId === req.floor.finish.paletteId) continue;
      d.diff.floors.push({ key, before: before ? copy(before) : null, after: { designId: req.floor.finish.designId, paletteId: req.floor.finish.paletteId } });
      d.highlight.tiles.push({ x: t.x, z: t.z });
      d.counts.floorsPlaced++;
      d.charge += chargeFor(state, fc.price);
    }
  }

  let pendingN = 0;
  for (const spec2 of req.openings ?? []) {
    const r = openingFor(content, state, spec2, `${PENDING_PREFIX}${pendingN++}`);
    if (typeof r === 'string') { d.reasons.push(r); continue; }
    d.diff.openings.push({ id: r.opening.id, before: null, after: r.opening });
    d.highlight.openingEdges.push(...openingEdgeKeys(r.opening));
    d.counts.openingsAdded++;
    d.charge += r.paid;
  }
  if (d.counts.wallsNew > 0 || d.diff.floors.length > 0) {
    d.label = req.shape === 'rect' ? `Build room (${d.measure.text})` : `Build ${d.counts.wallsNew} m of wall`;
  }
  return d;
}

function openingsIn(lot: Lot, keys: Set<string>): Opening[] {
  return Object.values(lot.openings).filter((o) => openingEdgeKeys(o).some((k) => keys.has(k))).sort((a, b) => (a.id < b.id ? -1 : 1));
}

function removeWallsInto(state: WorldState, lot: Lot, d: Draft, keys: string[]): void {
  const set = new Set(keys);
  for (const k of keys) {
    const w = lot.walls[k];
    if (!w) continue;
    d.diff.walls.push({ key: k, before: copy(w), after: null });
    d.highlight.removedWalls.push(k);
    d.counts.wallsRemoved++;
    d.refund += wallRefund(state, w);
  }
  for (const o of openingsIn(lot, set)) {
    d.diff.openings.push({ id: o.id, before: copy(o), after: null });
    d.highlight.removedOpeningEdges.push(...openingEdgeKeys(o));
    d.counts.openingsRemoved++;
    d.refund += openingRefund(state, o);
  }
}

function planEraseWalls(state: WorldState, lot: Lot, req: Extract<BuildRequest, { kind: 'eraseWalls' }>): Draft {
  const level = req.level;
  const d = newDraft(level, 'Demolish walls', 'There is no wall there.', { lengthM: 0, text: '' });
  if (!hasLevel(lot, level)) { d.reasons.push('That floor does not exist.'); return d; }
  const keys = [...new Set(req.edges.map((e) => keyOf(e, level)))].filter((k) => lot.walls[k]);
  d.measure = measureOf(req, keys.length);
  removeWallsInto(state, lot, d, keys);
  if (keys.length > 0) d.label = keys.length === 1 ? 'Demolish wall' : `Demolish ${keys.length} walls`;
  return d;
}

function planOpeningPlace(state: WorldState, content: ContentDB, req: Extract<BuildRequest, { kind: 'placeOpening' }>): Draft {
  const level = (() => { try { return parseEdgeKey(req.wallId).level; } catch { return 0; } })();
  const d = newDraft(level, 'Place opening', 'Nothing to place.', { lengthM: 0, text: '' });
  const r = openingFor(content, state, { defId: req.defId, wallId: req.wallId, flip: req.flip ?? false }, `${PENDING_PREFIX}0`);
  if (typeof r === 'string') { d.reasons.push(r); return d; }
  d.label = `Place ${r.def.name}`;
  d.diff.openings.push({ id: r.opening.id, before: null, after: r.opening });
  d.highlight.openingEdges.push(...openingEdgeKeys(r.opening));
  d.counts.openingsAdded = 1;
  d.charge = r.paid;
  d.measure = { lengthM: r.opening.span ?? 1, text: `${r.opening.span ?? 1} m` };
  return d;
}

function planOpeningMove(content: ContentDB, lot: Lot, req: Extract<BuildRequest, { kind: 'moveOpening' }>): Draft {
  const o = lot.openings[req.openingId];
  const level = (() => { try { return parseEdgeKey(req.wallId).level; } catch { return 0; } })();
  const d = newDraft(level, 'Move opening', 'It is already there.', { lengthM: 0, text: '' });
  if (!o) { d.reasons.push('That door or window is no longer here.'); return d; }
  const def = content.openings[o.defId];
  d.label = `Move ${def?.name ?? 'opening'}`;
  const flip = req.flip ?? o.flip;
  if (o.wallId === req.wallId && o.flip === flip) return d;
  const after: Opening = { ...copy(o), wallId: req.wallId, flip };
  d.diff.openings.push({ id: o.id, before: copy(o), after });
  d.highlight.openingEdges.push(...openingEdgeKeys(after));
  d.highlight.removedOpeningEdges.push(...openingEdgeKeys(o));
  d.counts.openingsMoved = 1;
  return d;
}

function planOpeningErase(state: WorldState, content: ContentDB, lot: Lot, req: Extract<BuildRequest, { kind: 'eraseOpening' }>): Draft {
  const o = lot.openings[req.openingId];
  const level = o ? parseEdgeKey(o.wallId).level : 0;
  const d = newDraft(level, 'Remove opening', 'There is no door or window there.', { lengthM: 0, text: '' });
  if (!o) return d;
  d.label = `Remove ${content.openings[o.defId]?.name ?? 'opening'}`;
  d.diff.openings.push({ id: o.id, before: copy(o), after: null });
  d.highlight.removedOpeningEdges.push(...openingEdgeKeys(o));
  d.counts.openingsRemoved = 1;
  d.refund = openingRefund(state, o);
  return d;
}

function planEraseFloor(state: WorldState, content: ContentDB, lot: Lot, req: Extract<BuildRequest, { kind: 'eraseFloor' }>): Draft {
  const level = req.level;
  const d = newDraft(level, 'Erase floor', 'There is no floor there.', measureOf(req, 0));
  if (!hasLevel(lot, level)) { d.reasons.push('That floor does not exist.'); return d; }
  let tiles: Point[] = req.tiles;
  if (req.room) {
    if (!inLot(lot, req.room.x, req.room.z)) { d.reasons.push('That spot is not on the lot.'); return d; }
    const room = roomAt(computeRooms(lot, level), req.room.x, req.room.z);
    if (!room || room.outdoor) { d.reasons.push('Room erase only works inside a room.'); return d; }
    tiles = room.tiles;
  }
  const done = new Set<string>();
  for (const t of tiles) {
    if (!Number.isInteger(t.x) || !Number.isInteger(t.z) || !inLot(lot, t.x, t.z)) { d.reasons.push('Some of those tiles are not on the lot.'); return d; }
    const key = tileKey(level, t.x, t.z);
    if (done.has(key)) continue;
    done.add(key);
    const before = lot.floors[key];
    if (!before) continue;
    d.diff.floors.push({ key, before: copy(before), after: null });
    d.highlight.tiles.push({ x: t.x, z: t.z });
    d.counts.floorsErased++;
    d.refund += floorRefund(state, content, before);
  }
  d.measure = { lengthM: 0, areaM2: d.counts.floorsErased, text: `${d.counts.floorsErased} m2` };
  if (d.counts.floorsErased > 0) d.label = d.counts.floorsErased === 1 ? 'Erase floor tile' : `Erase ${d.counts.floorsErased} floor tiles`;
  return d;
}

function planDeleteRoom(state: WorldState, content: ContentDB, lot: Lot, req: Extract<BuildRequest, { kind: 'deleteRoom' }>): Draft {
  const level = req.level;
  const d = newDraft(level, 'Delete room', 'Choose an enclosed room.', { lengthM: 0, text: '' });
  if (!hasLevel(lot, level) || !inLot(lot, req.tile.x, req.tile.z)) { d.reasons.push('That spot is not on the lot.'); return d; }
  const rooms = computeRooms(lot, level);
  const room = roomAt(rooms, req.tile.x, req.tile.z);
  if (!room || room.outdoor) { d.reasons.push('Choose an enclosed room.'); return d; }
  const inRoom = new Set(room.tiles.map((t) => `${t.x},${t.z}`));
  const other = new Map<string, boolean>(); // tile -> belongs to another indoor room
  for (const r of rooms) if (r !== room && !r.outdoor) for (const t of r.tiles) other.set(`${t.x},${t.z}`, true);
  // objects standing in the room stay behind in the yard, so the player has to deal with them first
  const objs = Object.values(lot.objects).filter((o) => o.level === level);
  for (const o of objs) {
    const def = content.objects[o.defId];
    const covered = def ? footprintTiles(o.x, o.z, def.footprint, o.rot) : [{ x: o.x, z: o.z }];
    if (covered.some((t) => inRoom.has(`${t.x},${t.z}`))) {
      d.reasons.push(`Clear the ${def?.name ?? 'furniture'} out of the room first.`);
      d.highlight.blocked.push({ kind: 'object', objectId: o.id, reason: 'In the room.' });
      return d;
    }
  }
  // the room's own boundary: walls whose other side is not another indoor room
  const keys: string[] = [];
  for (const s of room.sides) {
    const w = lot.walls[s.wallId];
    if (!w) continue;
    const otherTile = tileOnSide(w, s.side === 'a' ? 'b' : 'a');
    if (other.get(`${otherTile.x},${otherTile.z}`)) continue;
    keys.push(s.wallId);
  }
  removeWallsInto(state, lot, d, [...new Set(keys)]);
  for (const t of room.tiles) {
    const key = tileKey(level, t.x, t.z);
    const before = lot.floors[key];
    if (!before) continue;
    d.diff.floors.push({ key, before: copy(before), after: null });
    d.highlight.tiles.push({ x: t.x, z: t.z });
    d.counts.floorsErased++;
    d.refund += floorRefund(state, content, before);
  }
  d.measure = { lengthM: d.counts.wallsRemoved, areaM2: room.tiles.length, text: `${room.tiles.length} m2` };
  d.label = 'Delete room';
  return d;
}

/** Plans a build operation for a household: validity, reasons, cost, counts, measurement, highlight and the exact diff. Pure. */
export function planBuild(state: WorldState, content: ContentDB, lotId: Id, householdId: Id, req: BuildRequest): BuildPlan {
  const level = req.kind === 'walls' || req.kind === 'eraseWalls' || req.kind === 'eraseFloor' || req.kind === 'deleteRoom' ? req.level : 0;
  const access = editAccess(state, lotId, householdId);
  if ('reason' in access) return failPlan(level, [access.reason]);
  const { lot, hh } = access;

  let d: Draft;
  switch (req.kind) {
    case 'walls': d = planWalls(state, content, lot, req); break;
    case 'eraseWalls': d = planEraseWalls(state, lot, req); break;
    case 'placeOpening': d = planOpeningPlace(state, content, req); break;
    case 'moveOpening': d = planOpeningMove(content, lot, req); break;
    case 'eraseOpening': d = planOpeningErase(state, content, lot, req); break;
    case 'eraseFloor': d = planEraseFloor(state, content, lot, req); break;
    case 'deleteRoom': d = planDeleteRoom(state, content, lot, req); break;
  }

  const base = (reasons: string[], noop: boolean, conflicts: BuildConflict[] = []): BuildPlan => {
    const cost = d.charge - d.refund;
    return {
      ok: reasons.length === 0, reasons, noop, label: d.label, cost, charge: d.charge, refund: d.refund, counts: d.counts, measure: d.measure,
      highlight: { ...d.highlight, blocked: [...d.highlight.blocked, ...conflicts] }, rooms: { before: 0, after: 0 }, diff: d.diff,
    };
  };
  if (d.reasons.length > 0) return base([...new Set(d.reasons)], false);
  if (d.diff.walls.length === 0 && d.diff.openings.length === 0 && d.diff.floors.length === 0) return base([d.emptyReason], true);

  const check = validateDiff(state, content, lot, d.diff);
  const reasons = [...check.reasons];
  const cost = d.charge - d.refund;
  if (reasons.length === 0 && cost > hh.funds) reasons.push(NOT_ENOUGH);
  const plan = base(reasons, false, check.conflicts);
  if (d.diff.walls.length > 0) {
    plan.rooms = { before: indoorRooms(lot, level), after: indoorRooms(virtualLot(lot, d.diff), level) };
  } else {
    const n = indoorRooms(lot, level);
    plan.rooms = { before: n, after: n };
  }
  return plan;
}

export type { BuildConflict, BuildDiff, FloorDelta, OpeningDelta, WallDelta };
