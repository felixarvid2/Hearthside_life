// Undoable commands for the Milestone 9 exterior tools (fences, gates, roofs, terrain paint), built on ExteriorPlan like
// buildCommands.ts: apply plans against the current state and rejects with the plan's reasons (nothing changes then), takes the net
// cost with one transact(), gives new roofs their ids and writes the exact diff, then emits 'lot.changed' (what: 'fences' | 'roofs' |
// 'terrain', or 'all' when several kinds change). revert writes the "before" records back and reverses the money that actually moved
// (charged money is refunded, credited money is taken back with a negative 'sale' entry so the sandbox cannot create money). reapply
// requires the lot to match the captured "before" records and charges the captured net cost again.

import type { CommandContext, CommandResult, UndoableCommand } from '../core/commands';
import type { GameEvent } from '../core/events';
import { newId } from '../core/ids';
import { transact } from '../core/state';
import type { Cents, Id } from '../core/types';
import {
  applyExteriorDiff, exteriorDiffMatchesLot, fenceRunRequest, gateRequest, isEmptyExteriorDiff, planExterior, revertExteriorDiff, roofRectRequest,
  PENDING_ROOF, type ExteriorBuilt, type ExteriorDiff, type ExteriorPlan, type ExteriorRequest, type RoofSpec,
} from './exteriorPlans';
import type { EdgeRef, Point } from './buildPlans';
import { emit } from './commands';

type LotWhat = Extract<GameEvent, { type: 'lot.changed' }>['what'];

const fail = (reason: string): CommandResult => ({ ok: false, reason });
const OK: CommandResult = { ok: true };

export interface ExteriorCommand extends UndoableCommand {
  /** The plan the command applied (null before the first successful apply). */
  readonly plan: ExteriorPlan | null;
}

function whatChanged(d: ExteriorDiff): LotWhat {
  const kinds = (d.fences.length ? 1 : 0) + (d.roofs.length ? 1 : 0) + (d.terrain.length ? 1 : 0);
  if (kinds > 1) return 'all';
  return d.fences.length ? 'fences' : d.roofs.length ? 'roofs' : 'terrain';
}

/** The generic atomic exterior command; the factories below only create requests. */
export function exteriorCommand(lotId: Id, householdId: Id, req: ExteriorRequest): ExteriorCommand {
  let planned: ExteriorPlan | null = null;
  let diff: ExteriorDiff | null = null;
  let net: Cents = 0;
  let charged: Cents = 0;
  let credited: Cents = 0;
  let label = 'Build';

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
      const plan = planExterior(ctx.state, ctx.content, lotId, householdId, req);
      const lot = ctx.state.lots[lotId];
      if (!plan.ok || !lot) return fail(plan.reasons.join(' ') || 'That cannot be built.');
      label = plan.label;
      net = plan.cost;
      if (!settle(ctx, net, plan.label)) return fail('Not enough household funds.');
      // from here on nothing can fail
      const d = JSON.parse(JSON.stringify(plan.diff)) as ExteriorDiff;
      for (const r of d.roofs) {
        if (r.after && r.id.startsWith(PENDING_ROOF)) {
          const id = newId(ctx.state, 'roof');
          r.after = { ...r.after, id };
          r.id = id;
        }
      }
      diff = d;
      planned = { ...plan, diff: d };
      applyExteriorDiff(lot, d);
      emit(ctx, lotId, whatChanged(d));
      return OK;
    },
    revert(ctx) {
      const lot = ctx.state.lots[lotId];
      if (!lot || !diff) return;
      revertExteriorDiff(lot, diff);
      if (charged > 0) transact(ctx.state, ctx.events, householdId, charged, 'refund', `${label} undone`);
      if (credited > 0) transact(ctx.state, ctx.events, householdId, -credited, 'sale', `${label} undone`, { allowDebt: true });
      charged = 0; credited = 0;
      emit(ctx, lotId, whatChanged(diff));
    },
    reapply(ctx) {
      const lot = ctx.state.lots[lotId];
      if (!lot || !diff || isEmptyExteriorDiff(diff)) return fail('Nothing to redo.');
      if (!exteriorDiffMatchesLot(lot, diff)) return fail('The lot has changed since.');
      if (!settle(ctx, net, label)) return fail('Not enough household funds.');
      applyExteriorDiff(lot, diff);
      emit(ctx, lotId, whatChanged(diff));
      return OK;
    },
  };
}

function rejected(reason: string): ExteriorCommand {
  return { label: 'Build', plan: null, apply: () => fail(reason), revert: () => undefined, reapply: () => fail(reason) };
}

function fromBuilt(lotId: Id, householdId: Id, built: ExteriorBuilt): ExteriorCommand {
  return built.ok ? exteriorCommand(lotId, householdId, built.request) : rejected(built.reason);
}

// ---------------------------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------------------------

/** Builds a fence design along a straight run between two grid vertices (identical fences already there are kept and free). */
export function placeFenceRun(lotId: Id, householdId: Id, level: number, from: Point, to: Point, defId: string, variant = 0): ExteriorCommand {
  return fromBuilt(lotId, householdId, fenceRunRequest(level, from, to, defId, variant));
}

/** Puts a gate on one edge, replacing a fence there. */
export function placeGate(lotId: Id, householdId: Id, level: number, edge: EdgeRef, defId: string, variant = 0): ExteriorCommand {
  return exteriorCommand(lotId, householdId, gateRequest(level, edge, defId, variant));
}

/** Removes the fences on edges (with refund). */
export function removeFences(lotId: Id, householdId: Id, level: number, edges: EdgeRef[]): ExteriorCommand {
  return exteriorCommand(lotId, householdId, { kind: 'eraseFence', level, edges: edges.map((e) => ({ ...e })) });
}

/** A roof over the rectangle between two grid vertices. */
export function placeRoof(lotId: Id, householdId: Id, level: number, a: Point, b: Point, spec: RoofSpec): ExteriorCommand {
  return fromBuilt(lotId, householdId, roofRectRequest(level, a, b, spec));
}

/** Roofs over the rooms of the top level (or `level`). */
export function placeAutoRoof(lotId: Id, householdId: Id, spec: RoofSpec, level?: number): ExteriorCommand {
  return exteriorCommand(lotId, householdId, { kind: 'autoRoof', ...(level !== undefined ? { level } : {}), spec });
}

/** Removes the roof with this id, or the roof over a tile. */
export function removeRoof(lotId: Id, householdId: Id, level: number | undefined, target: { roofId?: Id; tile?: Point }): ExteriorCommand {
  return exteriorCommand(lotId, householdId, { kind: 'eraseRoof', ...(level !== undefined ? { level } : {}), ...target });
}

/** Paints ground tiles (level 0, open ground). */
export function paintTerrain(lotId: Id, householdId: Id, tiles: Point[], paintId: string): ExteriorCommand {
  return exteriorCommand(lotId, householdId, { kind: 'terrain', tiles: tiles.map((t) => ({ x: t.x, z: t.z })), paintId });
}

