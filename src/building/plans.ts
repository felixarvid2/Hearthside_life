// Pure planning for build/buy operations: validation, the exact changes and their cost. Commands apply a
// plan; previews show it. Nothing here mutates state.
//
// Money rules (brief section 12, docs/ARCHITECTURE.md): objects cost def.price; paint costs design.price per
// wall side or floor tile that actually changes; the sandbox (settings.unlimitedFunds) charges nothing for
// purchases and building. Selling returns the full price on the game day of purchase, otherwise 80 %.

import type { ContentDB, ObjectDef, SurfaceDesign } from '../content/types';
import { dayIndex } from '../core/clock';
import { tileKey } from '../core/ids';
import type { Tile } from '../core/nav';
import type { Cents, FinishRef, Household, Id, Lot, PlacedObject, Rot, WorldState } from '../core/types';
import { hasLevel, inLot } from '../world/lots';
import { itemsOnObject, resolveFinishes } from '../world/objects';
import { objectTiles, validatePlacement } from '../world/placement';
import { computeRooms, roomAt } from '../world/rooms';
import { tileOnSide, wallSideFinish, type WallSide } from '../world/walls';

/** Result shared by every plan: validity, player-facing reasons, money charged (negative = income), tiles. */
export interface Plan {
  ok: boolean;
  reasons: string[];
  cost: Cents;
  tiles: Tile[];
}

export interface BuyRequest { defId: string; x: number; z: number; rot: Rot; level: number; finishes?: Record<string, string> }
export interface Pose { x: number; z: number; rot: Rot; level: number }

/** Share of the purchase price returned when selling after the day of purchase. */
export const RESALE_RATE = 0.8;

/** What selling the object returns now: full price on the game day it was bought, otherwise 80 %. */
export function saleValue(state: WorldState, obj: Pick<PlacedObject, 'boughtAt' | 'purchasePrice'>): Cents {
  return dayIndex(obj.boughtAt) === dayIndex(state.clock.minutes) ? obj.purchasePrice : Math.round(obj.purchasePrice * RESALE_RATE);
}

/** Amount transact() takes for an expense of `price` (0 in the sandbox). */
export function chargeFor(state: WorldState, price: Cents): Cents {
  return state.settings.unlimitedFunds ? 0 : price;
}

const NOT_ENOUGH = 'Not enough household funds.';

function sameFinish(a: FinishRef | undefined, b: FinishRef): boolean {
  return !!a && a.designId === b.designId && a.paletteId === b.paletteId;
}

/** Lot and household for an edit by a household; edits are allowed on unowned lots and the household's own lot. */
export function editAccess(state: WorldState, lotId: Id, householdId: Id): { lot: Lot; hh: Household } | { reason: string } {
  const lot = state.lots[lotId];
  if (!lot) return { reason: 'Unknown lot.' };
  const hh = state.households[householdId];
  if (!hh) return { reason: 'Unknown household.' };
  if (lot.ownerHouseholdId !== null && lot.ownerHouseholdId !== householdId) return { reason: 'You can only change your own home.' };
  return { lot, hh };
}

/** Reason an object cannot be moved, sold or stored because something rests on it (M1 rule), or null. */
export function supportBlockReason(state: WorldState, content: ContentDB, lot: Lot, objectId: Id): string | null {
  const on = itemsOnObject(state, lot, objectId);
  if (on.objects.length) {
    const names = on.objects.map((o) => content.objects[o.defId]?.name ?? 'item');
    return `Take the ${names.join(', ')} off it first.`;
  }
  if (on.itemIds.length) return 'Clear the food off it first.';
  return null;
}

const failPlan = (reason: string): Plan => ({ ok: false, reasons: [reason], cost: 0, tiles: [] });

// ---------------------------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------------------------

export interface BuyPlan extends Plan {
  def?: ObjectDef;
  price: Cents;
  finishes: Record<string, string>;
  supportId?: Id;
}

export function planBuy(state: WorldState, content: ContentDB, lotId: Id, householdId: Id, req: BuyRequest): BuyPlan {
  const base = { price: 0, finishes: {} };
  const access = editAccess(state, lotId, householdId);
  if ('reason' in access) return { ...failPlan(access.reason), ...base };
  const def = content.objects[req.defId];
  if (!def) return { ...failPlan(`Unknown object "${req.defId}".`), ...base };
  const fin = resolveFinishes(def, req.finishes);
  if (!fin.ok) return { ...failPlan(fin.reason), ...base, def };
  const v = validatePlacement(state, content, lotId, { defId: def.id, x: req.x, z: req.z, rot: req.rot, level: req.level });
  const cost = chargeFor(state, def.price);
  const reasons = [...v.reasons];
  if (cost > access.hh.funds) reasons.push(NOT_ENOUGH);
  return {
    ok: reasons.length === 0, reasons, cost, tiles: v.tiles, def, price: def.price, finishes: fin.finishes,
    ...(v.supportId ? { supportId: v.supportId } : {}),
  };
}

export interface MovePlan extends Plan { supportId?: Id }

export function planMove(state: WorldState, content: ContentDB, lotId: Id, objectId: Id, to: Pose): MovePlan {
  const lot = state.lots[lotId];
  if (!lot) return failPlan('Unknown lot.');
  const obj = lot.objects[objectId];
  if (!obj) return failPlan('That object is no longer here.');
  if (obj.x === to.x && obj.z === to.z && obj.rot === to.rot && obj.level === to.level) return failPlan('It is already there.');
  const blocked = supportBlockReason(state, content, lot, objectId);
  if (blocked) return failPlan(blocked);
  const v = validatePlacement(state, content, lotId, { defId: obj.defId, x: to.x, z: to.z, rot: to.rot, level: to.level, ignoreObjectId: objectId });
  return { ok: v.ok, reasons: v.reasons, cost: 0, tiles: v.tiles, ...(v.supportId ? { supportId: v.supportId } : {}) };
}

export interface SellPlan extends Plan { value: Cents }

/** Selling credits the sale value (cost is negative: money comes in). */
export function planSell(state: WorldState, content: ContentDB, lotId: Id, householdId: Id, objectId: Id): SellPlan {
  const r = planRemoval(state, content, lotId, householdId, objectId);
  if (!r.ok) return { ...r, value: 0 };
  const obj = state.lots[lotId]?.objects[objectId];
  const value = obj ? saleValue(state, obj) : 0;
  return { ...r, cost: -value, value };
}

/** Storing moves the object to the household inventory for free. */
export function planStore(state: WorldState, content: ContentDB, lotId: Id, householdId: Id, objectId: Id): Plan {
  return planRemoval(state, content, lotId, householdId, objectId);
}

function planRemoval(state: WorldState, content: ContentDB, lotId: Id, householdId: Id, objectId: Id): Plan {
  const access = editAccess(state, lotId, householdId);
  if ('reason' in access) return failPlan(access.reason);
  const obj = access.lot.objects[objectId];
  if (!obj) return failPlan('That object is no longer here.');
  const blocked = supportBlockReason(state, content, access.lot, objectId);
  if (blocked) return failPlan(blocked);
  return { ok: true, reasons: [], cost: 0, tiles: objectTiles(obj, content.objects[obj.defId]) };
}

export function planPlaceFromInventory(state: WorldState, content: ContentDB, lotId: Id, householdId: Id, index: number, to: Pose): MovePlan {
  const access = editAccess(state, lotId, householdId);
  if ('reason' in access) return failPlan(access.reason);
  const entry = access.hh.inventory[index];
  if (!entry) return failPlan('Nothing is stored in that slot.');
  if (access.lot.objects[entry.object.id]) return failPlan('That object is already placed.');
  const v = validatePlacement(state, content, lotId, { defId: entry.object.defId, x: to.x, z: to.z, rot: to.rot, level: to.level });
  return { ok: v.ok, reasons: v.reasons, cost: 0, tiles: v.tiles, ...(v.supportId ? { supportId: v.supportId } : {}) };
}

// ---------------------------------------------------------------------------------------------
// Wall and floor finishes
// ---------------------------------------------------------------------------------------------

export type WallTarget = { kind: 'side'; wallId: string; side: WallSide } | { kind: 'room'; level: number; tile: Tile };
export type FloorTarget = { kind: 'tiles'; level: number; tiles: Tile[] } | { kind: 'room'; level: number; tile: Tile };

export interface WallChange { wallId: string; side: WallSide; before: FinishRef }
export interface WallPaintPlan extends Plan { changes: WallChange[]; unitPrice: Cents; price: Cents }

export interface FloorChange { key: string; x: number; z: number; before: FinishRef | null }
export interface FloorPaintPlan extends Plan { changes: FloorChange[]; unitPrice: Cents; price: Cents }

function checkDesign(designs: Record<string, SurfaceDesign>, finish: FinishRef, kind: string): SurfaceDesign | string {
  const design = designs[finish.designId];
  if (!design) return `Unknown ${kind} design.`;
  if (!design.palettes.some((p) => p.id === finish.paletteId)) return `${design.name} has no such colour palette.`;
  return design;
}

export function planWallPaint(state: WorldState, content: ContentDB, lotId: Id, householdId: Id, target: WallTarget, finish: FinishRef): WallPaintPlan {
  const empty = { changes: [], unitPrice: 0, price: 0 };
  const access = editAccess(state, lotId, householdId);
  if ('reason' in access) return { ...failPlan(access.reason), ...empty };
  const design = checkDesign(content.wallDesigns, finish, 'wall');
  if (typeof design === 'string') return { ...failPlan(design), ...empty };
  const { lot } = access;

  let sides: Array<{ wallId: string; side: WallSide }>;
  if (target.kind === 'side') {
    if (!lot.walls[target.wallId]) return { ...failPlan('There is no wall there.'), ...empty };
    if (target.side !== 'a' && target.side !== 'b') return { ...failPlan('Invalid wall side.'), ...empty };
    sides = [{ wallId: target.wallId, side: target.side }];
  } else {
    if (!hasLevel(lot, target.level) || !inLot(lot, target.tile.x, target.tile.z)) return { ...failPlan('That spot is not on the lot.'), ...empty };
    const room = roomAt(computeRooms(lot, target.level), target.tile.x, target.tile.z);
    sides = room ? room.sides : [];
    if (sides.length === 0) return { ...failPlan('No walls face that room.'), ...empty };
  }

  const changes: WallChange[] = [];
  for (const s of sides) {
    const wall = lot.walls[s.wallId];
    if (!wall) continue;
    const before = wallSideFinish(wall, s.side);
    if (!sameFinish(before, finish)) changes.push({ wallId: s.wallId, side: s.side, before: { ...before } });
  }
  if (changes.length === 0) return { ...failPlan('It already has that finish.'), ...empty };
  const price = design.price * changes.length;
  const cost = chargeFor(state, price);
  const reasons = cost > access.hh.funds ? [NOT_ENOUGH] : [];
  const tiles = changes.map((c) => tileOnSide(lot.walls[c.wallId] as NonNullable<Lot['walls'][string]>, c.side)).filter((t) => inLot(lot, t.x, t.z));
  return { ok: reasons.length === 0, reasons, cost, tiles, changes, unitPrice: design.price, price };
}

export function planFloorPaint(state: WorldState, content: ContentDB, lotId: Id, householdId: Id, target: FloorTarget, finish: FinishRef): FloorPaintPlan {
  const empty = { changes: [], unitPrice: 0, price: 0 };
  const access = editAccess(state, lotId, householdId);
  if ('reason' in access) return { ...failPlan(access.reason), ...empty };
  const design = checkDesign(content.floorDesigns, finish, 'floor');
  if (typeof design === 'string') return { ...failPlan(design), ...empty };
  const { lot } = access;
  if (!hasLevel(lot, target.level)) return { ...failPlan('That floor does not exist.'), ...empty };

  let tiles: Tile[];
  if (target.kind === 'tiles') {
    if (target.tiles.length === 0) return { ...failPlan('No tiles selected.'), ...empty };
    if (target.tiles.some((t) => !Number.isInteger(t.x) || !Number.isInteger(t.z) || !inLot(lot, t.x, t.z))) {
      return { ...failPlan('Some of those tiles are not on the lot.'), ...empty };
    }
    tiles = target.tiles;
  } else {
    if (!inLot(lot, target.tile.x, target.tile.z)) return { ...failPlan('That spot is not on the lot.'), ...empty };
    const room = roomAt(computeRooms(lot, target.level), target.tile.x, target.tile.z);
    if (!room || room.outdoor) return { ...failPlan('Room fill only works inside a room.'), ...empty };
    tiles = room.tiles;
  }

  const seen = new Set<string>();
  const changes: FloorChange[] = [];
  for (const t of tiles) {
    const key = tileKey(target.level, t.x, t.z);
    if (seen.has(key)) continue;
    seen.add(key);
    const before = lot.floors[key];
    if (!sameFinish(before, finish)) changes.push({ key, x: t.x, z: t.z, before: before ? { ...before } : null });
  }
  if (changes.length === 0) return { ...failPlan('It already has that floor.'), ...empty };
  const price = design.price * changes.length;
  const cost = chargeFor(state, price);
  const reasons = cost > access.hh.funds ? [NOT_ENOUGH] : [];
  return { ok: reasons.length === 0, reasons, cost, tiles: changes.map((c) => ({ x: c.x, z: c.z })), changes, unitPrice: design.price, price };
}
