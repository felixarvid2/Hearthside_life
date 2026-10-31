// Build/Buy commands (core/commands.ts UndoableCommand). Each command validates the whole operation first
// (./plans.ts), changes nothing on failure, captures exact before/after records and moves money only
// through transact(): 'purchase' and 'build' for expenses, 'refund' when a purchase or paint job is undone,
// 'sale' for sales (a negative 'sale' entry when a sale is undone, so the sandbox can never mint money).
// Undo restores the same object ids, finishes, inventory order and balance; redo re-applies the captured
// change at the captured price. Every command emits 'lot.changed'.

import type { CommandContext, CommandResult, UndoableCommand } from '../core/commands';
import type { GameEvent } from '../core/events';
import type { Tile } from '../core/nav';
import { transact } from '../core/state';
import type { Cents, FinishRef, Id, InventoryEntry, PlacedObject } from '../core/types';
import { copyRecord, makePlacedObject } from '../world/objects';
import { validatePlacement } from '../world/placement';
import { setWallSideFinish, wallSideFinish, type WallSide } from '../world/walls';
import {
  ownsObject, planBuy, planFloorPaint, planMove, planPlaceFromInventory, planSell, planStore, planWallPaint, supportBlockReason,
  type BuyRequest, type FloorChange, type FloorTarget, type Pose, type WallChange, type WallTarget,
} from './plans';

type LotWhat = Extract<GameEvent, { type: 'lot.changed' }>['what'];

const fail = (reasons: string[] | string): CommandResult => ({ ok: false, reason: Array.isArray(reasons) ? reasons.join(' ') : reasons });
const OK: CommandResult = { ok: true };

function emit(ctx: CommandContext, lotId: Id, what: LotWhat): void {
  ctx.events.emit({ type: 'lot.changed', lotId, what });
}

/** Charges an expense; returns the amount actually taken (0 in the sandbox or for free items). */
function charge(ctx: CommandContext, householdId: Id, price: Cents, kind: 'purchase' | 'build', label: string): { ok: true; charged: Cents } | { ok: false; reason: string } {
  if (price <= 0) return { ok: true, charged: 0 };
  const hh = ctx.state.households[householdId];
  if (!hh) return { ok: false, reason: 'Unknown household.' };
  const before = hh.funds;
  const r = transact(ctx.state, ctx.events, householdId, -price, kind, label);
  if (!r.ok) return r;
  return { ok: true, charged: before - hh.funds };
}

function refund(ctx: CommandContext, householdId: Id, charged: Cents, label: string): void {
  if (charged > 0) transact(ctx.state, ctx.events, householdId, charged, 'refund', label);
}

function setPose(obj: PlacedObject, pose: Pose & { supportId?: Id }): void {
  obj.x = pose.x; obj.z = pose.z; obj.rot = pose.rot; obj.level = pose.level;
  if (pose.supportId) obj.supportId = pose.supportId; else delete obj.supportId;
}

function poseOf(obj: PlacedObject): Pose & { supportId?: Id } {
  return { x: obj.x, z: obj.z, rot: obj.rot, level: obj.level, ...(obj.supportId ? { supportId: obj.supportId } : {}) };
}

// ---------------------------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------------------------

/** Buys an object and places it (price def.price; free in the sandbox, recorded as purchasePrice 0). Undo refunds exactly and removes it. */
export function buyObject(lotId: Id, householdId: Id, req: BuyRequest): UndoableCommand {
  let record: PlacedObject | null = null;
  let name = req.defId;
  let price = 0;
  let charged = 0;
  return {
    get label() { return `Buy ${name}`; },
    apply(ctx) {
      const plan = planBuy(ctx.state, ctx.content, lotId, householdId, req);
      const lot = ctx.state.lots[lotId];
      if (!plan.ok || !plan.def || !lot) return fail(plan.reasons);
      const def = plan.def;
      name = def.name;
      const paid = charge(ctx, householdId, def.price, 'purchase', `Bought ${def.name}`);
      if (!paid.ok) return paid;
      const obj = makePlacedObject(ctx.state, def,
        { x: req.x, z: req.z, rot: req.rot, level: req.level, ...(plan.supportId ? { supportId: plan.supportId } : {}) },
        // the amount actually paid (0 in the sandbox), so a same-day sale never returns more than was spent
        { finishes: plan.finishes, ownerHouseholdId: householdId, purchasePrice: paid.charged });
      lot.objects[obj.id] = obj;
      record = copyRecord(obj);
      price = def.price;
      charged = paid.charged;
      emit(ctx, lotId, 'objects');
      return OK;
    },
    revert(ctx) {
      const lot = ctx.state.lots[lotId];
      if (!lot || !record) return;
      delete lot.objects[record.id];
      refund(ctx, householdId, charged, `Returned ${name}`);
      charged = 0;
      emit(ctx, lotId, 'objects');
    },
    reapply(ctx) {
      const lot = ctx.state.lots[lotId];
      if (!lot || !record) return fail('Nothing to redo.');
      if (lot.objects[record.id]) return fail('It is already placed.');
      const v = validatePlacement(ctx.state, ctx.content, lotId, { defId: record.defId, x: record.x, z: record.z, rot: record.rot, level: record.level });
      if (!v.ok) return fail(v.reasons);
      const paid = charge(ctx, householdId, price, 'purchase', `Bought ${name}`);
      if (!paid.ok) return paid;
      lot.objects[record.id] = { ...copyRecord(record), purchasePrice: paid.charged };
      charged = paid.charged;
      emit(ctx, lotId, 'objects');
      return OK;
    },
  };
}

/** Moves and/or rotates an object (free). Objects holding surface items cannot move in M1. */
export function moveObject(lotId: Id, objectId: Id, to: Pose): UndoableCommand {
  let before: (Pose & { supportId?: Id }) | null = null;
  let after: (Pose & { supportId?: Id }) | null = null;
  let label = 'Move object';
  return {
    get label() { return label; },
    apply(ctx) {
      const plan = planMove(ctx.state, ctx.content, lotId, objectId, to);
      const obj = ctx.state.lots[lotId]?.objects[objectId];
      if (!plan.ok || !obj) return fail(plan.reasons);
      const name = ctx.content.objects[obj.defId]?.name ?? 'object';
      label = obj.x === to.x && obj.z === to.z && obj.level === to.level ? `Rotate ${name}` : `Move ${name}`;
      before = poseOf(obj);
      after = { x: to.x, z: to.z, rot: to.rot, level: to.level, ...(plan.supportId ? { supportId: plan.supportId } : {}) };
      setPose(obj, after);
      emit(ctx, lotId, 'objects');
      return OK;
    },
    revert(ctx) {
      const obj = ctx.state.lots[lotId]?.objects[objectId];
      if (!obj || !before) return;
      setPose(obj, before);
      emit(ctx, lotId, 'objects');
    },
    reapply(ctx) {
      const lot = ctx.state.lots[lotId];
      const obj = lot?.objects[objectId];
      if (!lot || !obj || !after) return fail('That object is no longer here.');
      const blocked = supportBlockReason(ctx.state, ctx.content, lot, objectId);
      if (blocked) return fail(blocked);
      const v = validatePlacement(ctx.state, ctx.content, lotId, { defId: obj.defId, ...after, ignoreObjectId: objectId });
      if (!v.ok) return fail(v.reasons);
      setPose(obj, after);
      emit(ctx, lotId, 'objects');
      return OK;
    },
  };
}

/** Sells an object for its sale value. Undo restores the same object (id, finishes, owner) and balance. */
export function sellObject(lotId: Id, householdId: Id, objectId: Id): UndoableCommand {
  let record: PlacedObject | null = null;
  let name = 'object';
  let value = 0;
  let credited = 0;
  const sell = (ctx: CommandContext, obj: PlacedObject): void => {
    const lot = ctx.state.lots[lotId];
    if (!lot) return;
    record = copyRecord(obj);
    delete lot.objects[objectId];
    const hh = ctx.state.households[householdId];
    const before = hh?.funds ?? 0;
    if (value > 0) transact(ctx.state, ctx.events, householdId, value, 'sale', `Sold ${name}`);
    credited = (hh?.funds ?? 0) - before;
    emit(ctx, lotId, 'objects');
  };
  return {
    get label() { return `Sell ${name}`; },
    apply(ctx) {
      const plan = planSell(ctx.state, ctx.content, lotId, householdId, objectId);
      const obj = ctx.state.lots[lotId]?.objects[objectId];
      if (!plan.ok || !obj) return fail(plan.reasons);
      name = ctx.content.objects[obj.defId]?.name ?? 'object';
      value = plan.value;
      sell(ctx, obj);
      return OK;
    },
    revert(ctx) {
      const lot = ctx.state.lots[lotId];
      if (!lot || !record) return;
      lot.objects[record.id] = copyRecord(record);
      if (credited !== 0) transact(ctx.state, ctx.events, householdId, -credited, 'sale', `Sale undone: ${name}`, { allowDebt: true });
      credited = 0;
      emit(ctx, lotId, 'objects');
    },
    reapply(ctx) {
      const lot = ctx.state.lots[lotId];
      const obj = lot?.objects[objectId];
      if (!lot || !obj) return fail('That object is no longer here.');
      if (!ownsObject(lot, obj, householdId)) return fail('It does not belong to your household.');
      const blocked = supportBlockReason(ctx.state, ctx.content, lot, objectId);
      if (blocked) return fail(blocked);
      sell(ctx, obj);
      return OK;
    },
  };
}

/** Moves an object into the household inventory (free), keeping its identity, finishes and price. */
export function storeObject(lotId: Id, householdId: Id, objectId: Id): UndoableCommand {
  let record: PlacedObject | null = null;
  let stored: InventoryEntry | null = null;
  let name = 'object';
  const store = (ctx: CommandContext, obj: PlacedObject): CommandResult => {
    const lot = ctx.state.lots[lotId];
    const hh = ctx.state.households[householdId];
    if (!lot || !hh) return fail('Unknown lot or household.');
    record = copyRecord(obj);
    if (!stored) {
      const object = copyRecord(obj);
      delete object.supportId;
      object.ownerHouseholdId = householdId;
      stored = { object, storedAt: ctx.state.clock.minutes };
    }
    delete lot.objects[objectId];
    hh.inventory.push(copyRecord(stored));
    emit(ctx, lotId, 'objects');
    return OK;
  };
  return {
    get label() { return `Store ${name}`; },
    apply(ctx) {
      const plan = planStore(ctx.state, ctx.content, lotId, householdId, objectId);
      const obj = ctx.state.lots[lotId]?.objects[objectId];
      if (!plan.ok || !obj) return fail(plan.reasons);
      name = ctx.content.objects[obj.defId]?.name ?? 'object';
      return store(ctx, obj);
    },
    revert(ctx) {
      const lot = ctx.state.lots[lotId];
      const hh = ctx.state.households[householdId];
      if (!lot || !hh || !record) return;
      const id = record.id;
      const i = hh.inventory.findIndex((e) => e.object.id === id);
      if (i >= 0) hh.inventory.splice(i, 1);
      lot.objects[id] = copyRecord(record);
      emit(ctx, lotId, 'objects');
    },
    reapply(ctx) {
      const lot = ctx.state.lots[lotId];
      const obj = lot?.objects[objectId];
      if (!lot || !obj) return fail('That object is no longer here.');
      if (!ownsObject(lot, obj, householdId)) return fail('It does not belong to your household.');
      const blocked = supportBlockReason(ctx.state, ctx.content, lot, objectId);
      if (blocked) return fail(blocked);
      return store(ctx, obj);
    },
  };
}

/** Places an object from the household inventory (free). Undo puts it back in the same inventory slot. */
export function placeFromInventory(lotId: Id, householdId: Id, index: number, to: Pose): UndoableCommand {
  let entry: InventoryEntry | null = null;
  let placed: PlacedObject | null = null;
  let slot = index;
  let name = 'object';
  return {
    get label() { return `Place ${name}`; },
    apply(ctx) {
      const plan = planPlaceFromInventory(ctx.state, ctx.content, lotId, householdId, index, to);
      const lot = ctx.state.lots[lotId];
      const hh = ctx.state.households[householdId];
      const e = hh?.inventory[index];
      if (!plan.ok || !lot || !hh || !e) return fail(plan.reasons);
      name = ctx.content.objects[e.object.defId]?.name ?? 'object';
      entry = copyRecord(e);
      slot = index;
      const obj = copyRecord(e.object);
      setPose(obj, { x: to.x, z: to.z, rot: to.rot, level: to.level, ...(plan.supportId ? { supportId: plan.supportId } : {}) });
      placed = copyRecord(obj);
      hh.inventory.splice(index, 1);
      lot.objects[obj.id] = obj;
      emit(ctx, lotId, 'objects');
      return OK;
    },
    revert(ctx) {
      const lot = ctx.state.lots[lotId];
      const hh = ctx.state.households[householdId];
      if (!lot || !hh || !entry || !placed) return;
      delete lot.objects[placed.id];
      hh.inventory.splice(Math.min(slot, hh.inventory.length), 0, copyRecord(entry));
      emit(ctx, lotId, 'objects');
    },
    reapply(ctx) {
      const lot = ctx.state.lots[lotId];
      const hh = ctx.state.households[householdId];
      if (!lot || !hh || !entry || !placed) return fail('Nothing to redo.');
      const id = placed.id;
      const i = hh.inventory.findIndex((e) => e.object.id === id);
      if (i < 0 || lot.objects[id]) return fail('That object is no longer in storage.');
      const v = validatePlacement(ctx.state, ctx.content, lotId, { defId: placed.defId, x: placed.x, z: placed.z, rot: placed.rot, level: placed.level });
      if (!v.ok) return fail(v.reasons);
      slot = i;
      hh.inventory.splice(i, 1);
      lot.objects[id] = copyRecord(placed);
      emit(ctx, lotId, 'objects');
      return OK;
    },
  };
}

/** Changes one finish region of an object to another of its swatches (free in M1). */
export function setObjectFinish(lotId: Id, householdId: Id, objectId: Id, regionId: string, swatchId: string): UndoableCommand {
  let before: string | undefined;
  let hadBefore = false;
  return {
    label: 'Change finish',
    apply(ctx) {
      const lot = ctx.state.lots[lotId];
      const obj = lot?.objects[objectId];
      if (!lot || !obj) return fail('That object is no longer here.');
      if (lot.ownerHouseholdId !== null && lot.ownerHouseholdId !== householdId) return fail('You can only change your own home.');
      const region = ctx.content.objects[obj.defId]?.finishes.find((f) => f.id === regionId);
      if (!region) return fail('It has no such finish.');
      if (!region.swatches.some((s) => s.id === swatchId)) return fail('Unknown swatch.');
      if (obj.finishes[regionId] === swatchId) return fail('It already has that finish.');
      hadBefore = regionId in obj.finishes;
      before = obj.finishes[regionId];
      obj.finishes[regionId] = swatchId;
      emit(ctx, lotId, 'objects');
      return OK;
    },
    revert(ctx) {
      const obj = ctx.state.lots[lotId]?.objects[objectId];
      if (!obj) return;
      if (hadBefore && before !== undefined) obj.finishes[regionId] = before; else delete obj.finishes[regionId];
      emit(ctx, lotId, 'objects');
    },
    reapply(ctx) {
      const obj = ctx.state.lots[lotId]?.objects[objectId];
      if (!obj) return fail('That object is no longer here.');
      obj.finishes[regionId] = swatchId;
      emit(ctx, lotId, 'objects');
      return OK;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Wall and floor finishes
// ---------------------------------------------------------------------------------------------

function wallPaint(lotId: Id, householdId: Id, target: WallTarget, finish: FinishRef, label: string): UndoableCommand {
  let changes: WallChange[] = [];
  let price = 0;
  let charged = 0;
  const paint = (ctx: CommandContext): void => {
    const lot = ctx.state.lots[lotId];
    if (!lot) return;
    for (const c of changes) {
      const w = lot.walls[c.wallId];
      if (w) setWallSideFinish(w, c.side, finish);
    }
    emit(ctx, lotId, 'walls');
  };
  return {
    label,
    apply(ctx) {
      const plan = planWallPaint(ctx.state, ctx.content, lotId, householdId, target, finish);
      if (!plan.ok) return fail(plan.reasons);
      const paid = charge(ctx, householdId, plan.price, 'build', label);
      if (!paid.ok) return paid;
      changes = plan.changes;
      price = plan.price;
      charged = paid.charged;
      paint(ctx);
      return OK;
    },
    revert(ctx) {
      const lot = ctx.state.lots[lotId];
      if (!lot) return;
      for (const c of changes) {
        const w = lot.walls[c.wallId];
        if (w) setWallSideFinish(w, c.side, c.before);
      }
      refund(ctx, householdId, charged, `${label} undone`);
      charged = 0;
      emit(ctx, lotId, 'walls');
    },
    reapply(ctx) {
      const lot = ctx.state.lots[lotId];
      if (!lot) return fail('Unknown lot.');
      for (const c of changes) {
        const w = lot.walls[c.wallId];
        const cur = w ? wallSideFinish(w, c.side) : undefined;
        if (!cur || cur.designId !== c.before.designId || cur.paletteId !== c.before.paletteId) return fail('Those walls have changed.');
      }
      const paid = charge(ctx, householdId, price, 'build', label);
      if (!paid.ok) return paid;
      charged = paid.charged;
      paint(ctx);
      return OK;
    },
  };
}

/** Paints one side of one wall (design.price if it changes). */
export function paintWallSide(lotId: Id, householdId: Id, wallId: string, side: WallSide, finish: FinishRef): UndoableCommand {
  return wallPaint(lotId, householdId, { kind: 'side', wallId, side }, finish, 'Paint wall');
}

/** Paints every wall side facing the room that contains the tile (only changed sides are charged). */
export function paintRoomWalls(lotId: Id, householdId: Id, level: number, tile: Tile, finish: FinishRef): UndoableCommand {
  return wallPaint(lotId, householdId, { kind: 'room', level, tile }, finish, 'Paint room walls');
}

function floorPaint(lotId: Id, householdId: Id, target: FloorTarget, finish: FinishRef, label: string): UndoableCommand {
  let changes: FloorChange[] = [];
  let price = 0;
  let charged = 0;
  const paint = (ctx: CommandContext): void => {
    const lot = ctx.state.lots[lotId];
    if (!lot) return;
    for (const c of changes) lot.floors[c.key] = { designId: finish.designId, paletteId: finish.paletteId };
    emit(ctx, lotId, 'floors');
  };
  return {
    label,
    apply(ctx) {
      const plan = planFloorPaint(ctx.state, ctx.content, lotId, householdId, target, finish);
      if (!plan.ok) return fail(plan.reasons);
      const paid = charge(ctx, householdId, plan.price, 'build', label);
      if (!paid.ok) return paid;
      changes = plan.changes;
      price = plan.price;
      charged = paid.charged;
      paint(ctx);
      return OK;
    },
    revert(ctx) {
      const lot = ctx.state.lots[lotId];
      if (!lot) return;
      for (const c of changes) {
        if (c.before) lot.floors[c.key] = { ...c.before }; else delete lot.floors[c.key];
      }
      refund(ctx, householdId, charged, `${label} undone`);
      charged = 0;
      emit(ctx, lotId, 'floors');
    },
    reapply(ctx) {
      const lot = ctx.state.lots[lotId];
      if (!lot) return fail('Unknown lot.');
      for (const c of changes) {
        const cur = lot.floors[c.key];
        const same = c.before ? !!cur && cur.designId === c.before.designId && cur.paletteId === c.before.paletteId : !cur;
        if (!same) return fail('Those tiles have changed.');
      }
      const paid = charge(ctx, householdId, price, 'build', label);
      if (!paid.ok) return paid;
      charged = paid.charged;
      paint(ctx);
      return OK;
    },
  };
}

/** Paints floor tiles (design.price per tile that changes). Invalid tiles reject the whole operation. */
export function paintFloorTiles(lotId: Id, householdId: Id, level: number, tiles: Tile[], finish: FinishRef): UndoableCommand {
  return floorPaint(lotId, householdId, { kind: 'tiles', level, tiles: tiles.map((t) => ({ x: t.x, z: t.z })) }, finish, 'Paint floor');
}

/** Paints every floor tile of the room containing the tile (indoor rooms only). */
export function paintRoomFloor(lotId: Id, householdId: Id, level: number, tile: Tile, finish: FinishRef): UndoableCommand {
  return floorPaint(lotId, householdId, { kind: 'room', level, tile }, finish, 'Paint room floor');
}
