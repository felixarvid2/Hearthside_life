// Undoable commands for the Milestone 12 pool tool, built on PoolPlan like exteriorCommands.ts: apply plans against the
// current state and rejects with the plan's reasons (nothing changes then), takes the net cost with one transact(), gives a
// new pool its id and writes the exact diff, then emits 'lot.changed' (what: 'pools'). revert writes the "before" records
// back and reverses the money that actually moved; reapply requires the lot to match the captured "before" records and
// charges the captured net cost again.

import type { CommandContext, CommandResult, UndoableCommand } from '../core/commands';
import { newId } from '../core/ids';
import { transact } from '../core/state';
import type { Cents, Id } from '../core/types';
import {
  applyPoolDiff, isEmptyPoolDiff, PENDING_POOL, planPool, poolDiffMatchesLot, revertPoolDiff, type PoolDiff, type PoolPlan, type PoolRequest,
} from './poolPlans';
import { emit } from './commands';

const fail = (reason: string): CommandResult => ({ ok: false, reason });
const OK: CommandResult = { ok: true };

export interface PoolCommand extends UndoableCommand {
  /** The plan the command applied (null before the first successful apply). */
  readonly plan: PoolPlan | null;
}

/** The generic atomic pool command; the factories below only create requests. */
export function poolCommand(lotId: Id, householdId: Id, req: PoolRequest): PoolCommand {
  let planned: PoolPlan | null = null;
  let diff: PoolDiff | null = null;
  let net: Cents = 0;
  let charged: Cents = 0;
  let credited: Cents = 0;
  let label = 'Build pool';

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
      const plan = planPool(ctx.state, ctx.content, lotId, householdId, req);
      const lot = ctx.state.lots[lotId];
      if (!plan.ok || !lot) return fail(plan.reasons.join(' ') || 'That cannot be built.');
      label = plan.label;
      net = plan.cost;
      if (!settle(ctx, net, plan.label)) return fail('Not enough household funds.');
      // from here on nothing can fail
      const d = JSON.parse(JSON.stringify(plan.diff)) as PoolDiff;
      for (const p of d.pools) {
        if (p.after && p.id.startsWith(PENDING_POOL)) {
          const id = newId(ctx.state, 'pool');
          p.after = { ...p.after, id };
          p.id = id;
        }
      }
      diff = d;
      planned = { ...plan, diff: d };
      applyPoolDiff(lot, d);
      emit(ctx, lotId, 'pools');
      return OK;
    },
    revert(ctx) {
      const lot = ctx.state.lots[lotId];
      if (!lot || !diff) return;
      revertPoolDiff(lot, diff);
      if (charged > 0) transact(ctx.state, ctx.events, householdId, charged, 'refund', `${label} undone`);
      if (credited > 0) transact(ctx.state, ctx.events, householdId, -credited, 'sale', `${label} undone`, { allowDebt: true });
      charged = 0; credited = 0;
      emit(ctx, lotId, 'pools');
    },
    reapply(ctx) {
      const lot = ctx.state.lots[lotId];
      if (!lot || !diff || isEmptyPoolDiff(diff)) return fail('Nothing to redo.');
      if (!poolDiffMatchesLot(lot, diff)) return fail('The lot has changed since.');
      if (!settle(ctx, net, label)) return fail('Not enough household funds.');
      applyPoolDiff(lot, diff);
      emit(ctx, lotId, 'pools');
      return OK;
    },
  };
}

/** A pool over an inclusive tile rectangle (auto ladder on a short side unless one is named). */
export function buildPool(lotId: Id, householdId: Id, rect: { x0: number; z0: number; x1: number; z1: number }, styleId: string, ladder?: { x: number; z: number }): PoolCommand {
  return poolCommand(lotId, householdId, { kind: 'pool', rect: { ...rect }, styleId, ...(ladder ? { ladder: { ...ladder } } : {}) });
}

/** Removes the pool with this id, or the pool under a tile. */
export function removePool(lotId: Id, householdId: Id, target: { poolId?: Id; tile?: { x: number; z: number } }): PoolCommand {
  return poolCommand(lotId, householdId, { kind: 'erasePool', ...target });
}

/** Moves a ladder from one edge tile to another. */
export function movePoolLadder(lotId: Id, householdId: Id, poolId: Id, from: { x: number; z: number }, to: { x: number; z: number }): PoolCommand {
  return poolCommand(lotId, householdId, { kind: 'moveLadder', poolId, from: { ...from }, to: { ...to } });
}

/** Adds a ladder on an edge tile. */
export function addPoolLadder(lotId: Id, householdId: Id, poolId: Id, tile: { x: number; z: number }): PoolCommand {
  return poolCommand(lotId, householdId, { kind: 'addLadder', poolId, tile: { ...tile } });
}

/** Removes a ladder (never the last one). */
export function removePoolLadder(lotId: Id, householdId: Id, poolId: Id, tile: { x: number; z: number }): PoolCommand {
  return poolCommand(lotId, householdId, { kind: 'removeLadder', poolId, tile: { ...tile } });
}
