// Pure planning for the Milestone 9 exterior tools: fences and gates (Lot.fences), roofs (Lot.roofs) and terrain paint (Lot.terrain).
// Like buildPlans.ts a plan validates the whole operation, prices it and lists exactly what changes (ExteriorDiff) plus the
// measurement and highlight the renderer shows. Nothing here mutates state or allocates ids, so previews can run on every
// pointer move and a rejected or cancelled preview can never spend money.
//
// Money (integer cents; the sandbox, settings.unlimitedFunds, charges nothing and records 0 as the paid price):
// - A fence or gate costs its design's price per edge. A run over fences that already exist keeps identical ones (free) and swaps
//   different ones: the new one is charged, the old one refunded.
// - A roof costs its plan area in square metres times (style price + finish price) per m2; the auto roof prices every rectangle.
// - Terrain paint costs the paint's price per tile that changes; painting the lot's own ground back removes the paint for free.
// - Removing something returns the paid price on the game day it was built, otherwise 80 % (saleValue); pieces that came with the lot
//   carry no price: they return 80 % of today's price (nothing in the sandbox).
// - cost = charge - refund (negative = money back).
//
// Safety (docs/ARCHITECTURE.md; brief section 7): a fence never walls a person in and never cuts a floored tile off the lot entry
// (a gate counts as a doorway). Upstairs a fence needs floor beside it. A roof needs floor on its level, and no floor above it;
// roofs of one level may not overlap. Paint only goes on open ground (world/terrain.ts).

import { exteriorOf, fenceVariant } from '../content/exterior';
import type { ContentDB } from '../content/types';
import { MINUTES_PER_DAY } from '../core/clock';
import { edgeKey, tileKey } from '../core/ids';
import type { Cents, EdgeDir, FinishRef, Fence, Id, Lot, Roof, WorldState } from '../core/types';
import { fenceAt, fenceEdge, isGateDef } from '../world/fences';
import { hasLevel, inLot } from '../world/lots';
import { autoRoofRects, hasRoofSupport, longRidge, roofArea, roofsOverlap, type RoofRect } from '../world/roofs';
import { levelReach, strandedPerson } from '../world/structure';
import { indoorTiles, paintBlockReason, storedPaint, terrainAt } from '../world/terrain';
import { edgeInLot, edgeTiles } from '../world/walls';
import { chargeFor, editAccess, RESALE_RATE, saleValue } from './plans';
import type { BuildConflict, EdgeRef, Point } from './buildPlans';
import { normalizeRect, rectPerimeter, runEdges, tileRectTiles } from './buildPlans';

const LONG_AGO = -MINUTES_PER_DAY;
const NOT_ENOUGH = 'Not enough household funds.';
export const PENDING_ROOF = 'pending:roof:';

// ---------------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------------

export interface RoofSpec { styleId: string; pitch?: number; ridge?: EdgeDir; finish: FinishRef }

export type ExteriorRequest =
  /** Fence or gate design along edges (a run, or one edge for a gate). */
  | { kind: 'fence'; level: number; edges: EdgeRef[]; defId: string; variant?: number }
  | { kind: 'eraseFence'; level: number; edges: EdgeRef[] }
  /** A roof over the tile rectangle [x0, x1) x [z0, z1) (vertex coordinates), resting on `level`. */
  | { kind: 'roof'; level: number; rect: RoofRect; spec: RoofSpec }
  /** Covers the rooms of the top level (or `level`) with roofs; roofs it overlaps are replaced. */
  | { kind: 'autoRoof'; level?: number; spec: RoofSpec }
  | { kind: 'eraseRoof'; level?: number; roofId?: Id; tile?: Point }
  | { kind: 'terrain'; tiles: Point[]; paintId: string };

export type ExteriorKind = ExteriorRequest['kind'];

export interface FenceDelta { key: string; before: Fence | null; after: Fence | null }
export interface RoofDelta { id: Id; before: Roof | null; after: Roof | null }
export interface TerrainDelta { key: string; before: string | null; after: string | null }

export interface ExteriorDiff { level: number; fences: FenceDelta[]; roofs: RoofDelta[]; terrain: TerrainDelta[] }

export const emptyExteriorDiff = (level = 0): ExteriorDiff => ({ level, fences: [], roofs: [], terrain: [] });

export function isEmptyExteriorDiff(d: ExteriorDiff): boolean { return d.fences.length === 0 && d.roofs.length === 0 && d.terrain.length === 0; }

/** Writes a diff into the lot (the "after" sides). */
export function applyExteriorDiff(lot: Lot, d: ExteriorDiff): void {
  for (const f of d.fences) {
    if (f.after) (lot.fences ??= {})[f.key] = { ...f.after };
    else if (lot.fences) delete lot.fences[f.key];
  }
  for (const r of d.roofs) {
    if (r.after) (lot.roofs ??= {})[r.id] = { ...r.after, finish: { ...r.after.finish } };
    else if (lot.roofs) delete lot.roofs[r.id];
  }
  for (const t of d.terrain) {
    if (t.after !== null) (lot.terrain ??= {})[t.key] = t.after;
    else if (lot.terrain) delete lot.terrain[t.key];
  }
  if (lot.fences && Object.keys(lot.fences).length === 0) delete lot.fences;
  if (lot.roofs && Object.keys(lot.roofs).length === 0) delete lot.roofs;
  if (lot.terrain && Object.keys(lot.terrain).length === 0) delete lot.terrain;
}

/** Writes the "before" sides back. */
export function revertExteriorDiff(lot: Lot, d: ExteriorDiff): void {
  applyExteriorDiff(lot, {
    level: d.level,
    fences: d.fences.map((f) => ({ key: f.key, before: f.after, after: f.before })),
    roofs: d.roofs.map((r) => ({ id: r.id, before: r.after, after: r.before })),
    terrain: d.terrain.map((t) => ({ key: t.key, before: t.after, after: t.before })),
  });
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** True when the lot still holds exactly the "before" records of the diff (so redo is safe). */
export function exteriorDiffMatchesLot(lot: Lot, d: ExteriorDiff): boolean {
  return d.fences.every((f) => same(lot.fences?.[f.key], f.before))
    && d.roofs.every((r) => same(lot.roofs?.[r.id], r.before))
    && d.terrain.every((t) => (lot.terrain?.[t.key] ?? null) === t.before);
}

/** A copy of the lot with the diff applied (read-only use: shares objects with the original). */
export function virtualExteriorLot(lot: Lot, d: ExteriorDiff): Lot {
  const copy: Lot = { ...lot, fences: { ...(lot.fences ?? {}) }, roofs: { ...(lot.roofs ?? {}) }, terrain: { ...(lot.terrain ?? {}) } };
  applyExteriorDiff(copy, d);
  return copy;
}

// ---------------------------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------------------------

export interface ExteriorHighlight {
  level: number;
  /** Edge keys of fences that would appear (red when the plan is invalid) / that already match / that would go. */
  newEdges: string[];
  existingEdges: string[];
  removedEdges: string[];
  /** Tiles covered by a roof or painted. */
  tiles: Point[];
  /** Roof rectangles that would appear / disappear. */
  newRoofs: RoofRect[];
  removedRoofs: RoofRect[];
  blocked: BuildConflict[];
}

export interface ExteriorCounts { fences: number; gates: number; removed: number; roofs: number; roofsRemoved: number; tiles: number; areaM2: number }

export interface ExteriorPlan {
  ok: boolean;
  reasons: string[];
  noop: boolean;
  label: string;
  /** Net money now (charge - refund). */
  cost: Cents;
  charge: Cents;
  refund: Cents;
  counts: ExteriorCounts;
  measure: { text: string; lengthM: number; areaM2?: number };
  highlight: ExteriorHighlight;
  diff: ExteriorDiff;
}

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const keyOf = (e: EdgeRef, level: number) => edgeKey(level, e.dir, e.x, e.z);
const noCounts = (): ExteriorCounts => ({ fences: 0, gates: 0, removed: 0, roofs: 0, roofsRemoved: 0, tiles: 0, areaM2: 0 });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function failPlan(level: number, reasons: string[], label = 'Build'): ExteriorPlan {
  return {
    ok: false, reasons, noop: false, label, cost: 0, charge: 0, refund: 0, counts: noCounts(), measure: { text: '', lengthM: 0 },
    highlight: { level, newEdges: [], existingEdges: [], removedEdges: [], tiles: [], newRoofs: [], removedRoofs: [], blocked: [] }, diff: emptyExteriorDiff(level),
  };
}

/** Refund for removing a fence or gate (see the module comment). */
export function fenceRefund(state: WorldState, content: ContentDB | undefined, f: Fence): Cents {
  if (f.purchasePrice !== undefined) return saleValue(state, { boughtAt: f.boughtAt ?? LONG_AGO, purchasePrice: f.purchasePrice });
  if (state.settings.unlimitedFunds) return 0;
  const def = exteriorOf(content).fences[f.defId];
  return def ? Math.round(def.price * RESALE_RATE) : 0;
}

/** Refund for removing a roof. */
export function roofRefund(state: WorldState, r: Roof): Cents {
  if (r.purchasePrice !== undefined) return saleValue(state, { boughtAt: r.boughtAt ?? LONG_AGO, purchasePrice: r.purchasePrice });
  return state.settings.unlimitedFunds ? 0 : Math.round(roofPrice(r.styleId, r.finish, r) * RESALE_RATE);
}

/** Price of a roof: plan area times style and finish price per m2. */
export function roofPrice(styleId: string, finish: FinishRef, rect: RoofRect, content?: ContentDB): Cents {
  const ex = exteriorOf(content);
  const style = ex.roofStyles[styleId], fin = ex.roofFinishes[finish.designId];
  if (!style || !fin) return 0;
  return Math.round(roofArea(rect) * (style.pricePerM2 + fin.pricePerM2));
}

/** Default roof spec: the style's default pitch and the first finish. */
export function defaultRoofSpec(styleId = 'gable', content?: ContentDB): RoofSpec {
  const ex = exteriorOf(content);
  const style = ex.roofStyles[styleId] ?? Object.values(ex.roofStyles)[0]!;
  const fin = Object.values(ex.roofFinishes)[0]!;
  return { styleId: style.id, pitch: style.pitch, finish: { designId: fin.id, paletteId: fin.palettes[0]!.id } };
}

interface Draft {
  label: string;
  diff: ExteriorDiff;
  charge: Cents;
  refund: Cents;
  counts: ExteriorCounts;
  measure: ExteriorPlan['measure'];
  highlight: ExteriorHighlight;
  reasons: string[];
  emptyReason: string;
}

function newDraft(level: number, label: string, emptyReason: string): Draft {
  return {
    label, emptyReason, diff: emptyExteriorDiff(level), charge: 0, refund: 0, counts: noCounts(), measure: { text: '', lengthM: 0 }, reasons: [],
    highlight: { level, newEdges: [], existingEdges: [], removedEdges: [], tiles: [], newRoofs: [], removedRoofs: [], blocked: [] },
  };
}

// ---- fences -------------------------------------------------------------------------------

/** Any floor beside the edge on its level (the support rule for upstairs fences and the railing of a balcony). */
function floorBeside(lot: Lot, level: number, e: EdgeRef): boolean {
  return edgeTiles({ dir: e.dir, x: e.x, z: e.z }).some((t) => !!lot.floors[tileKey(level, t.x, t.z)]);
}

function planFence(state: WorldState, content: ContentDB, lot: Lot, req: Extract<ExteriorRequest, { kind: 'fence' }>): Draft {
  const level = req.level;
  const ex = exteriorOf(content);
  const def = ex.fences[req.defId];
  const d = newDraft(level, def?.kind === 'gate' ? 'Place gate' : 'Build fence', 'There is already a fence there.');
  if (!def || def.status !== 'ready') { d.reasons.push('That fence design is not available.'); return d; }
  if (!hasLevel(lot, level)) { d.reasons.push('That floor does not exist.'); return d; }
  const variant = fenceVariant(def, req.variant ?? 0).id;
  const variantIndex = Math.max(0, def.variants.findIndex((v) => v.id === variant));
  const edges = req.edges;
  if (def.kind === 'gate' && edges.length !== 1) { d.reasons.push('A gate fills one edge. Tap the fence edge you want it in.'); return d; }
  const seen = new Set<string>();
  for (const e of edges) {
    if (!Number.isInteger(e.x) || !Number.isInteger(e.z) || !edgeInLot(lot, e.dir, e.x, e.z)) {
      d.reasons.push('Fences have to stay on the lot.');
      d.highlight.blocked.push({ kind: 'edge', key: keyOf(e, level), reason: 'Off the lot.' });
      continue;
    }
    const key = keyOf(e, level);
    if (seen.has(key)) continue;
    seen.add(key);
    if (lot.walls[key]) {
      d.reasons.push('There is a wall there already.');
      d.highlight.blocked.push({ kind: 'edge', key, reason: 'A wall.' });
      continue;
    }
    if (level >= 1 && !floorBeside(lot, level, e)) {
      d.reasons.push('Fences upstairs need floor beside them.');
      d.highlight.blocked.push({ kind: 'edge', key, reason: 'No floor.' });
      continue;
    }
    const before = lot.fences?.[key];
    if (before && before.defId === def.id && (before.variant ?? 0) === variantIndex) { d.highlight.existingEdges.push(key); continue; }
    // a fence run never replaces a gate: it is kept as the doorway of the run
    if (before && def.kind === 'fence' && isGateDef(before.defId)) { d.highlight.existingEdges.push(key); continue; }
    const paid = chargeFor(state, def.price);
    const after: Fence = { id: key, level, dir: e.dir, x: e.x, z: e.z, defId: def.id, variant: variantIndex, purchasePrice: paid, boughtAt: state.clock.minutes };
    d.diff.fences.push({ key, before: before ? copy(before) : null, after });
    d.highlight.newEdges.push(key);
    d.charge += paid;
    if (before) d.refund += fenceRefund(state, content, before);
    if (def.kind === 'gate') d.counts.gates++; else d.counts.fences++;
  }
  // the whole path counts (kept gates and identical fences included), so an L or a loop reports its full length once
  const total = d.highlight.newEdges.length + d.highlight.existingEdges.length;
  d.measure = { lengthM: total, text: def.kind === 'gate' ? def.name : `${total} m of ${def.name.toLowerCase()}` };
  if (total > 0) d.label = def.kind === 'gate' ? `Place ${def.name.toLowerCase()}` : `Build ${total} m of ${def.name.toLowerCase()}`;
  return d;
}

function planEraseFence(state: WorldState, content: ContentDB, lot: Lot, req: Extract<ExteriorRequest, { kind: 'eraseFence' }>): Draft {
  const level = req.level;
  const d = newDraft(level, 'Remove fence', 'There is no fence there.');
  for (const key of new Set(req.edges.map((e) => keyOf(e, level)))) {
    const f = lot.fences?.[key];
    if (!f) continue;
    d.diff.fences.push({ key, before: copy(f), after: null });
    d.highlight.removedEdges.push(key);
    d.refund += fenceRefund(state, content, f);
    d.counts.removed++;
  }
  d.measure = { lengthM: d.counts.removed, text: `${d.counts.removed} m` };
  if (d.counts.removed > 0) d.label = d.counts.removed === 1 ? 'Remove fence' : `Remove ${d.counts.removed} m of fence`;
  return d;
}

// ---- roofs --------------------------------------------------------------------------------

function normalizeRoofSpec(content: ContentDB, spec: RoofSpec, rect?: RoofRect): { spec: Required<RoofSpec> } | string {
  const ex = exteriorOf(content);
  const style = ex.roofStyles[spec.styleId];
  if (!style || style.status !== 'ready') return 'That roof style is not available.';
  const fin = ex.roofFinishes[spec.finish.designId];
  if (!fin || fin.status !== 'ready') return 'That roof finish is not available.';
  if (!fin.palettes.some((p) => p.id === spec.finish.paletteId)) return `${fin.name} has no such colour.`;
  const pitch = Math.max(style.pitchMin, Math.min(style.pitchMax, spec.pitch ?? style.pitch));
  const ridge = spec.ridge ?? (rect ? longRidge(rect.x1 - rect.x0, rect.z1 - rect.z0) : 'h');
  return { spec: { styleId: style.id, pitch, ridge, finish: { designId: fin.id, paletteId: spec.finish.paletteId } } };
}

function roofRectReasons(lot: Lot, level: number, r: RoofRect): string | null {
  if (![r.x0, r.z0, r.x1, r.z1].every(Number.isInteger)) return 'Roofs snap to the grid.';
  if (r.x1 <= r.x0 || r.z1 <= r.z0) return 'Drag a rectangle to size the roof.';
  if (r.x0 < 0 || r.z0 < 0 || r.x1 > lot.width || r.z1 > lot.depth) return 'Roofs have to stay on the lot.';
  if (!hasLevel(lot, level)) return 'That floor does not exist.';
  if (!hasRoofSupport(lot, level, r)) return 'Build walls or a floor under the roof first.';
  // nothing above: a floor on the next level inside the rectangle means the roof belongs higher up
  for (let z = r.z0; z < r.z1; z++) for (let x = r.x0; x < r.x1; x++) if (lot.floors[tileKey(level + 1, x, z)]) return 'There is a floor above: put the roof on the top floor.';
  return null;
}

function addRoof(state: WorldState, content: ContentDB, lot: Lot, d: Draft, level: number, rect: RoofRect, spec: Required<RoofSpec>, n: number, replaceOverlapping: boolean): void {
  const bad = roofRectReasons(lot, level, rect);
  if (bad) { d.reasons.push(bad); return; }
  for (const other of Object.values(lot.roofs ?? {})) {
    if (other.level !== level || !roofsOverlap(rect, other)) continue;
    if (!replaceOverlapping) { d.reasons.push('That roof would overlap another one.'); d.highlight.blocked.push({ kind: 'tile', x: rect.x0, z: rect.z0, reason: 'Overlaps a roof.' }); return; }
    if (d.diff.roofs.some((x) => x.id === other.id)) continue;
    d.diff.roofs.push({ id: other.id, before: copy(other), after: null });
    d.highlight.removedRoofs.push({ x0: other.x0, z0: other.z0, x1: other.x1, z1: other.z1 });
    d.refund += roofRefund(state, other);
    d.counts.roofsRemoved++;
  }
  const price = chargeFor(state, roofPrice(spec.styleId, spec.finish, rect, content));
  const id = `${PENDING_ROOF}${n}`;
  const roof: Roof = {
    id, level, x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: rect.z1, styleId: spec.styleId, ridge: spec.ridge, pitch: spec.pitch,
    finish: { ...spec.finish }, purchasePrice: price, boughtAt: state.clock.minutes,
  };
  d.diff.roofs.push({ id, before: null, after: roof });
  d.highlight.newRoofs.push({ ...rect });
  for (const t of tileRectTiles({ x: rect.x0, z: rect.z0 }, { x: rect.x1 - 1, z: rect.z1 - 1 })) d.highlight.tiles.push(t);
  d.charge += price;
  d.counts.roofs++;
  d.counts.areaM2 += roofArea(rect);
}

function planRoof(state: WorldState, content: ContentDB, lot: Lot, req: Extract<ExteriorRequest, { kind: 'roof' }>): Draft {
  const level = req.level;
  const d = newDraft(level, 'Build roof', 'There is already a roof there.');
  const norm = normalizeRoofSpec(content, req.spec, req.rect);
  if (typeof norm === 'string') { d.reasons.push(norm); return d; }
  addRoof(state, content, lot, d, level, req.rect, norm.spec, 0, false);
  const w = req.rect.x1 - req.rect.x0, dd = req.rect.z1 - req.rect.z0;
  d.measure = { lengthM: 2 * (w + dd), areaM2: w * dd, text: `${w} x ${dd} m (${w * dd} m2)` };
  if (d.counts.roofs > 0) d.label = `Build ${exteriorOf(content).roofStyles[norm.spec.styleId]?.name.toLowerCase() ?? ''} roof (${w} x ${dd} m)`;
  return d;
}

function planAutoRoof(state: WorldState, content: ContentDB, lot: Lot, req: Extract<ExteriorRequest, { kind: 'autoRoof' }>): Draft {
  const rects = autoRoofRects(lot, req.level);
  const d = newDraft(rects.length ? Math.max(...rects.map((r) => r.level)) : req.level ?? 0, 'Build roof', 'There is no room to roof.');
  if (rects.length === 0) { d.reasons.push('Build a room first: the auto roof covers every room that has no floor above it.'); return d; }
  let area = 0;
  rects.forEach((r, i) => {
    const norm = normalizeRoofSpec(content, req.spec, r);
    if (typeof norm === 'string') { if (!d.reasons.includes(norm)) d.reasons.push(norm); return; }
    // directional styles follow the long side of every rectangle unless the spec names a ridge
    addRoof(state, content, lot, d, r.level, { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 }, norm.spec, i, true);
    area += roofArea(r);
  });
  d.measure = { lengthM: 0, areaM2: area, text: `${plural(d.counts.roofs, 'roof', 'roofs')}, ${area} m2` };
  if (d.counts.roofs > 0) d.label = `Auto roof (${plural(d.counts.roofs, 'roof', 'roofs')}, ${area} m2)`;
  return d;
}

function planEraseRoof(state: WorldState, lot: Lot, req: Extract<ExteriorRequest, { kind: 'eraseRoof' }>): Draft {
  const level = req.level ?? 0;
  const d = newDraft(level, 'Remove roof', 'There is no roof there.');
  let roof: Roof | undefined;
  if (req.roofId) roof = lot.roofs?.[req.roofId];
  else if (req.tile) roof = Object.values(lot.roofs ?? {}).filter((r) => (req.level === undefined || r.level === req.level) && req.tile!.x >= r.x0 && req.tile!.x < r.x1 && req.tile!.z >= r.z0 && req.tile!.z < r.z1)
    .sort((a, b) => b.level - a.level || (a.id < b.id ? -1 : 1))[0];
  if (!roof) return d;
  d.diff.level = roof.level;
  d.diff.roofs.push({ id: roof.id, before: copy(roof), after: null });
  d.highlight.removedRoofs.push({ x0: roof.x0, z0: roof.z0, x1: roof.x1, z1: roof.z1 });
  d.refund += roofRefund(state, roof);
  d.counts.roofsRemoved = 1;
  d.label = 'Remove roof';
  d.measure = { lengthM: 0, areaM2: roofArea(roof), text: `${roofArea(roof)} m2` };
  return d;
}

// ---- terrain ------------------------------------------------------------------------------

function planTerrain(state: WorldState, content: ContentDB, lot: Lot, req: Extract<ExteriorRequest, { kind: 'terrain' }>): Draft {
  const ex = exteriorOf(content);
  const paint = ex.terrain[req.paintId];
  const d = newDraft(0, 'Paint ground', 'It already has this paint.');
  if (!paint || paint.status !== 'ready') { d.reasons.push('That ground paint is not available.'); return d; }
  const stored = storedPaint(lot, paint.id);
  const indoor = indoorTiles(lot);
  const done = new Set<string>();
  for (const t of req.tiles) {
    const why = paintBlockReason(lot, t.x, t.z, indoor);
    if (why) { if (!d.reasons.includes(why)) d.reasons.push(why); continue; }
    const key = tileKey(0, t.x, t.z);
    if (done.has(key)) continue;
    done.add(key);
    if (terrainAt(lot, t.x, t.z) === paint.id) continue;
    d.diff.terrain.push({ key, before: lot.terrain?.[key] ?? null, after: stored ?? null });
    d.highlight.tiles.push({ x: t.x, z: t.z });
    d.counts.tiles++;
    if (stored !== undefined) d.charge += chargeFor(state, paint.price);
  }
  // blocked tiles of a mixed drag are skipped when others can be painted; only a drag with nothing paintable reports the reason
  if (d.counts.tiles > 0) d.reasons.length = 0;
  d.measure = { lengthM: 0, areaM2: d.counts.tiles, text: `${d.counts.tiles} m2` };
  if (d.counts.tiles > 0) d.label = d.counts.tiles === 1 ? `Paint ground (${paint.name})` : `Paint ${d.counts.tiles} tiles (${paint.name})`;
  return d;
}

// ---- plan ---------------------------------------------------------------------------------

/** Plans an exterior operation for a household: validity, reasons, cost, counts, measurement, highlight and the exact diff. Pure. */
export function planExterior(state: WorldState, content: ContentDB, lotId: Id, householdId: Id, req: ExteriorRequest): ExteriorPlan {
  const level = 'level' in req && req.level !== undefined ? req.level : 0;
  const access = editAccess(state, lotId, householdId);
  if ('reason' in access) return failPlan(level, [access.reason]);
  const { lot, hh } = access;

  let d: Draft;
  switch (req.kind) {
    case 'fence': d = planFence(state, content, lot, req); break;
    case 'eraseFence': d = planEraseFence(state, content, lot, req); break;
    case 'roof': d = planRoof(state, content, lot, req); break;
    case 'autoRoof': d = planAutoRoof(state, content, lot, req); break;
    case 'eraseRoof': d = planEraseRoof(state, lot, req); break;
    case 'terrain': d = planTerrain(state, content, lot, req); break;
  }
  const base = (reasons: string[], noop: boolean, conflicts: BuildConflict[] = []): ExteriorPlan => ({
    ok: reasons.length === 0, reasons, noop, label: d.label, cost: d.charge - d.refund, charge: d.charge, refund: d.refund, counts: d.counts, measure: d.measure,
    highlight: { ...d.highlight, blocked: [...d.highlight.blocked, ...conflicts] }, diff: d.diff,
  });
  if (d.reasons.length > 0) return base([...new Set(d.reasons)], false);
  if (isEmptyExteriorDiff(d.diff)) return base([d.emptyReason], true);

  const reasons: string[] = [];
  const conflicts: BuildConflict[] = [];
  if (d.diff.fences.length > 0) {
    const virtual = virtualExteriorLot(lot, d.diff);
    const stranded = strandedPerson(state, content, lot, virtual, level + 1);
    if (stranded) {
      reasons.push(`${stranded.firstName} would be shut in. Leave a gate or a gap.`);
      conflicts.push({ kind: 'person', personId: stranded.id, reason: 'Would be shut in.' });
    } else {
      const cut = cutOffTile(lot, virtual, content);
      if (cut) { reasons.push('That fence would cut part of the house off from the street. Add a gate.'); conflicts.push({ kind: 'tile', x: cut.x, z: cut.z, reason: 'Cut off.' }); }
    }
  }
  const cost = d.charge - d.refund;
  if (reasons.length === 0 && cost > hh.funds) reasons.push(NOT_ENOUGH);
  return base(reasons, false, conflicts);
}

/** A floored tile that the lot entry could reach before but not after (a fence ring without a gate). */
function cutOffTile(before: Lot, after: Lot, content: ContentDB): { x: number; z: number; level: number } | null {
  if (!inLot(before, before.entry.x, before.entry.z)) return null;
  const n = Math.max(before.levels, 1);
  const b = levelReach(before, content, n), a = levelReach(after, content, n);
  for (const key of Object.keys(before.floors).sort()) {
    const [lv, x, z] = key.split(':').map(Number) as [number, number, number];
    const gb = b.grids[lv], ga = a.grids[lv];
    if (!gb || !ga) continue;
    const i = z * gb.width + x;
    if (b.masks[lv]![i] === 1 && a.masks[lv]![i] !== 1) return { x, z, level: lv };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Request builders (grid vertices in, requests out)
// ---------------------------------------------------------------------------------------------

export type ExteriorBuilt = { ok: true; request: ExteriorRequest } | { ok: false; reason: string };

/** A fence along a straight run between two grid vertices. */
export function fenceRunRequest(level: number, from: Point, to: Point, defId: string, variant = 0): ExteriorBuilt {
  const edges = runEdges(from, to);
  if (!edges) return { ok: false, reason: from.x === to.x && from.z === to.z ? 'Drag to set the fence length.' : 'Fences run in straight lines.' };
  return { ok: true, request: { kind: 'fence', level, edges, defId, variant } };
}

/**
 * A fence drag between two grid vertices: a straight run on one row or column, or two runs for an L when the end is at
 * least 2 m off both (less is snapped straight), starting with the dominant direction (a long drag first, then the shorter leg). One request, so one preview, one
 * confirmation, one transaction and one undo step.
 */
export function fencePathRequest(level: number, from: Point, to: Point, defId: string, variant = 0): ExteriorBuilt {
  if (![from.x, from.z, to.x, to.z].every(Number.isInteger)) return { ok: false, reason: 'Fences snap to the grid.' };
  if (from.x === to.x && from.z === to.z) return { ok: false, reason: 'Drag to set the fence length.' };
  if (from.x === to.x || from.z === to.z) return fenceRunRequest(level, from, to, defId, variant);
  // a leg shorter than 2 m is drag wobble, not an L: snap it straight as before
  const dx = Math.abs(to.x - from.x), dz = Math.abs(to.z - from.z);
  if (Math.min(dx, dz) < 2) return fenceRunRequest(level, from, dx >= dz ? { x: to.x, z: from.z } : { x: from.x, z: to.z }, defId, variant);
  const corner = Math.abs(to.x - from.x) >= Math.abs(to.z - from.z) ? { x: to.x, z: from.z } : { x: from.x, z: to.z };
  const first = runEdges(from, corner), second = runEdges(corner, to);
  if (!first || !second) return { ok: false, reason: 'Fences run in straight lines.' };
  return { ok: true, request: { kind: 'fence', level, edges: [...first, ...second], defId, variant } };
}

/** The four sides of the rectangle between two grid vertices as one closed fence loop (a degenerate drag is a straight run). */
export function fenceRectRequest(level: number, a: Point, b: Point, defId: string, variant = 0): ExteriorBuilt {
  if (![a.x, a.z, b.x, b.z].every(Number.isInteger)) return { ok: false, reason: 'Fences snap to the grid.' };
  const r = normalizeRect(a, b);
  if (r.x1 === r.x0 && r.z1 === r.z0) return { ok: false, reason: 'Drag to size the fence loop.' };
  if (r.x1 === r.x0 || r.z1 === r.z0) return fenceRunRequest(level, a, b, defId, variant);
  return { ok: true, request: { kind: 'fence', level, edges: rectPerimeter(r), defId, variant } };
}

/** A gate on one edge (it replaces a fence there, or stands on its own). */
export function gateRequest(level: number, edge: EdgeRef, defId: string, variant = 0): ExteriorRequest {
  return { kind: 'fence', level, edges: [{ ...edge }], defId, variant };
}

/** The tile rectangle [x0, x1) x [z0, z1) between two grid vertices. */
export function roofRectRequest(level: number, a: Point, b: Point, spec: RoofSpec): ExteriorBuilt {
  const r = { x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) };
  if (![r.x0, r.z0, r.x1, r.z1].every(Number.isInteger)) return { ok: false, reason: 'Roofs snap to the grid.' };
  if (r.x1 === r.x0 || r.z1 === r.z0) return { ok: false, reason: 'Drag a corner to size the roof.' };
  return { ok: true, request: { kind: 'roof', level, rect: r, spec } };
}

/** The edge holding a fence nearest to a point on the lot (within about half a tile), or null. */
export function nearestFenceEdge(lot: Lot, level: number, p: { x: number; z: number }): EdgeRef | null {
  let best: EdgeRef | null = null;
  let bestD = Infinity;
  for (const f of Object.values(lot.fences ?? {})) {
    if (f.level !== level) continue;
    const bx = f.dir === 'h' ? f.x + 1 : f.x, bz = f.dir === 'h' ? f.z : f.z + 1;
    const dx = bx - f.x, dz = bz - f.z;
    const t = Math.max(0, Math.min(1, ((p.x - f.x) * dx + (p.z - f.z) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(p.x - (f.x + t * dx), p.z - (f.z + t * dz));
    if (d < bestD - 1e-9) { bestD = d; best = { dir: f.dir, x: f.x, z: f.z }; }
  }
  return best && bestD <= 0.6 ? best : null;
}

/** The fence design an edge holds, if any (for the gate tool). */
export function fenceDefAt(lot: Lot, level: number, e: EdgeRef): string | null { return fenceAt(lot, level, e.dir, e.x, e.z)?.defId ?? null; }

export { fenceEdge };
