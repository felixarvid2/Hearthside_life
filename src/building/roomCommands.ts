// Undoable Build mode commands for moving, resizing and duplicating a room (core/commands.ts), on top of the pure plan in
// ./roomOps.ts. Like every build command, a command is one atomic transaction:
// - apply: plan against the current state; any reason rejects the whole operation and nothing changes (not the lot, not the
//   money, not the id counter). Otherwise the net cost is taken (or paid out) with one transact(), pending ids (copies of
//   openings and furniture) become real ids, the diff is written and 'lot.changed' (what: 'all') is emitted so navigation is
//   rebuilt and the simulation replans (Simulation.onLotChanged).
// - revert: writes the captured "before" records back and reverses the money that actually moved.
// - reapply: the lot must still match the captured "before" records and pass the rules again; the captured cost is charged again.

import type { CommandContext, CommandResult, UndoableCommand } from '../core/commands';
import { newId } from '../core/ids';
import { transact } from '../core/state';
import type { Cents, Id, PlacedObject } from '../core/types';
import { PENDING_PREFIX } from './buildPlans';
import { emit } from './commands';
import {
  applyRoomDiff, planRoomOp, revertRoomDiff, roomDiffMatches, type RoomDiff, type RoomOp, type RoomOpPlan, type RoomSide,
} from './roomOps';
import { validateDiff } from '../world/structure';

const fail = (reason: string): CommandResult => ({ ok: false, reason });
const OK: CommandResult = { ok: true };

export interface RoomCommand extends UndoableCommand {
  /** The plan the command applied (null before the first successful apply). */
  readonly plan: RoomOpPlan | null;
}

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Replaces the pending ids of a diff (openings, furniture copies and the supports that name them) by real ones. */
function realiseIds(ctx: CommandContext, d: RoomDiff): void {
  const ids = new Map<Id, Id>();
  for (const o of d.openings) {
    if (o.after && o.id.startsWith(PENDING_PREFIX)) { const id = newId(ctx.state, 'opn'); ids.set(o.id, id); o.id = id; o.after = { ...o.after, id }; }
  }
  for (const a of d.adds) if (a.id.startsWith(PENDING_PREFIX)) ids.set(a.id, newId(ctx.state, 'obj'));
  d.adds = d.adds.map((a): PlacedObject => {
    const out: PlacedObject = { ...a, id: ids.get(a.id) ?? a.id };
    if (a.supportId && ids.has(a.supportId)) out.supportId = ids.get(a.supportId)!;
    return out;
  });
}

/** The generic atomic room command; the factories below only create operations. */
export function roomCommand(lotId: Id, householdId: Id, op: RoomOp): RoomCommand {
  let planned: RoomOpPlan | null = null;
  let diff: RoomDiff | null = null;
  let net: Cents = 0;
  let charged: Cents = 0;
  let credited: Cents = 0;
  let label = 'Room';

  const settle = (ctx: CommandContext, amount: Cents, what: string): boolean => {
    const hh = ctx.state.households[householdId];
    if (!hh) return false;
    charged = 0; credited = 0;
    if (amount === 0) return true;
    const before = hh.funds;
    const r = amount > 0
      ? transact(ctx.state, ctx.events, householdId, -amount, 'build', what)
      : transact(ctx.state, ctx.events, householdId, -amount, 'sale', what);
    if (!r.ok) return false;
    const moved = hh.funds - before;
    if (moved < 0) charged = -moved; else credited = moved;
    return true;
  };

  return {
    get label() { return label; },
    get plan() { return planned; },
    apply(ctx) {
      const plan = planRoomOp(ctx.state, ctx.content, lotId, householdId, op);
      const lot = ctx.state.lots[lotId];
      if (!plan.ok || !lot) return fail(plan.reasons.join(' ') || 'That cannot be done.');
      label = plan.label;
      net = plan.cost;
      if (!settle(ctx, net, plan.label)) return fail('Not enough household funds.');
      const d = copy(plan.diff);
      realiseIds(ctx, d);
      diff = d;
      planned = { ...plan, diff: d };
      applyRoomDiff(ctx.state, lot, d);
      emit(ctx, lotId, 'all');
      return OK;
    },
    revert(ctx) {
      const lot = ctx.state.lots[lotId];
      if (!lot || !diff) return;
      revertRoomDiff(ctx.state, lot, diff);
      if (charged > 0) transact(ctx.state, ctx.events, householdId, charged, 'refund', `${label} undone`);
      if (credited > 0) transact(ctx.state, ctx.events, householdId, -credited, 'sale', `${label} undone`, { allowDebt: true });
      charged = 0; credited = 0;
      emit(ctx, lotId, 'all');
    },
    reapply(ctx) {
      const lot = ctx.state.lots[lotId];
      if (!lot || !diff) return fail('Nothing to redo.');
      if (!roomDiffMatches(ctx.state, lot, diff)) return fail('The lot has changed since.');
      const check = validateDiff(ctx.state, ctx.content, lot, { level: diff.level, walls: diff.walls, openings: diff.openings, floors: diff.floors });
      if (check.reasons.length > 0) return fail(check.reasons.join(' '));
      if (!settle(ctx, net, label)) return fail('Not enough household funds.');
      applyRoomDiff(ctx.state, lot, diff);
      emit(ctx, lotId, 'all');
      return OK;
    },
  };
}

export const moveRoom = (lotId: Id, householdId: Id, level: number, tile: { x: number; z: number }, dx: number, dz: number): RoomCommand =>
  roomCommand(lotId, householdId, { kind: 'moveRoom', level, tile, dx, dz });
export const resizeRoom = (lotId: Id, householdId: Id, level: number, tile: { x: number; z: number }, side: RoomSide, delta: number): RoomCommand =>
  roomCommand(lotId, householdId, { kind: 'resizeRoom', level, tile, side, delta });
export const duplicateRoom = (lotId: Id, householdId: Id, level: number, tile: { x: number; z: number }, dx: number, dz: number, copyObjects = false): RoomCommand =>
  roomCommand(lotId, householdId, { kind: 'duplicateRoom', level, tile, dx, dz, copyObjects });
