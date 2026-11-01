// Undoable Build mode commands for walls, rooms, doors, windows, floors and room delete (core/commands.ts).
//
// Every command is one atomic transaction built on a BuildPlan (./buildPlans.ts):
// - apply: plan against the current state; any reason rejects the whole operation and nothing changes (not the
//   lot, not the money, not the id counter). Otherwise the net cost is taken (or the refund paid) with one
//   transact(), then new openings get their ids and the exact diff is written, then 'lot.changed' is emitted
//   (what: 'walls' | 'openings' | 'floors', or 'all' when several kinds change) so navigation is rebuilt and the
//   simulation cancels or replans actions that used the changed place (Simulation.onLotChanged).
// - revert: writes the captured "before" records back and reverses the money that actually moved (charged
//   money is refunded, credited money is taken back with a negative 'sale' entry that may go into debt, so the
//   sandbox cannot create money).
// - reapply: the lot must still match the captured "before" records and pass the rules again; the captured net
//   cost is charged again (redo never re-prices).
//
// Factories take grid vertices for runs and rectangles ("Built" requests report a reason instead of throwing).

import type { CommandContext, CommandResult, UndoableCommand } from '../core/commands';
import type { GameEvent } from '../core/events';
import { newId } from '../core/ids';
import { transact } from '../core/state';
import type { Cents, FinishRef, Id, Lot } from '../core/types';
import {
  applyDiff, diffMatchesLot, revertDiff, validateDiff, type BuildDiff,
} from '../world/structure';
import {
  eraseRectRequest, eraseRunRequest, eraseSegmentRequest, PENDING_PREFIX, planBuild, wallRectRequest, wallRunRequest,
  tileRectTiles, wallSegmentRequest, type BuildPlan, type BuildRequest, type Built, type EdgeRef, type OpeningSpec, type Point, type WallSpec,
} from './buildPlans';
import { emit, paintFloorTiles, paintRoomFloor } from './commands';

type LotWhat = Extract<GameEvent, { type: 'lot.changed' }>['what'];

const fail = (reason: string): CommandResult => ({ ok: false, reason });
const OK: CommandResult = { ok: true };

export interface BuildCommand extends UndoableCommand {
  /** The plan the command applied (null before the first successful apply). */
  readonly plan: BuildPlan | null;
}

function whatChanged(diff: BuildDiff): LotWhat {
  const kinds = (diff.walls.length ? 1 : 0) + (diff.openings.length ? 1 : 0) + (diff.floors.length ? 1 : 0);
  if (kinds > 1) return 'all';
  return diff.walls.length ? 'walls' : diff.openings.length ? 'openings' : 'floors';
}

function lotOf(ctx: CommandContext, lotId: Id): Lot | undefined { return ctx.state.lots[lotId]; }

/** The generic atomic build command; the factories below only create requests. */
export function buildCommand(lotId: Id, householdId: Id, req: BuildRequest): BuildCommand {
  let planned: BuildPlan | null = null;
  let diff: BuildDiff | null = null;
  let net: Cents = 0;
  let charged: Cents = 0;
  let credited: Cents = 0;
  let label = 'Build';

  /** Moves the net cost; returns false (and moves nothing) when the household cannot pay. */
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
      const plan = planBuild(ctx.state, ctx.content, lotId, householdId, req);
      const lot = lotOf(ctx, lotId);
      if (!plan.ok || !lot) return fail(plan.reasons.join(' ') || 'That cannot be built.');
      label = plan.label;
      net = plan.cost;
      if (!settle(ctx, net, plan.label)) return fail('Not enough household funds.');
      // from here on nothing can fail
      const d: BuildDiff = JSON.parse(JSON.stringify(plan.diff)) as BuildDiff;
      for (const o of d.openings) {
        if (o.after && o.id.startsWith(PENDING_PREFIX)) {
          const id = newId(ctx.state, 'opn');
          o.after = { ...o.after, id };
          o.id = id;
        }
      }
      diff = d;
      planned = { ...plan, diff: d };
      applyDiff(lot, d);
      emit(ctx, lotId, whatChanged(d));
      return OK;
    },
    revert(ctx) {
      const lot = lotOf(ctx, lotId);
      if (!lot || !diff) return;
      revertDiff(lot, diff);
      if (charged > 0) transact(ctx.state, ctx.events, householdId, charged, 'refund', `${label} undone`);
      if (credited > 0) transact(ctx.state, ctx.events, householdId, -credited, 'sale', `${label} undone`, { allowDebt: true });
      charged = 0; credited = 0;
      emit(ctx, lotId, whatChanged(diff));
    },
    reapply(ctx) {
      const lot = lotOf(ctx, lotId);
      if (!lot || !diff) return fail('Nothing to redo.');
      if (!diffMatchesLot(lot, diff)) return fail('The lot has changed since.');
      const check = validateDiff(ctx.state, ctx.content, lot, diff);
      if (check.reasons.length > 0) return fail(check.reasons.join(' '));
      if (!settle(ctx, net, label)) return fail('Not enough household funds.');
      applyDiff(lot, diff);
      emit(ctx, lotId, whatChanged(diff));
      return OK;
    },
  };
}

/** A command that rejects with the reason a request could not even be formed (e.g. a diagonal wall). */
function rejected(reason: string): BuildCommand {
  return { label: 'Build', plan: null, apply: () => fail(reason), revert: () => undefined, reapply: () => fail(reason) };
}

function fromBuilt(lotId: Id, householdId: Id, built: Built): BuildCommand {
  return built.ok ? buildCommand(lotId, householdId, built.request) : rejected(built.reason);
}

// ---------------------------------------------------------------------------------------------
// Walls and rooms
// ---------------------------------------------------------------------------------------------

/** Builds one wall segment on a grid edge. */
export function placeWallSegment(lotId: Id, householdId: Id, level: number, edge: EdgeRef, spec?: WallSpec, openings?: OpeningSpec[]): BuildCommand {
  return buildCommand(lotId, householdId, wallSegmentRequest(level, edge, spec, openings));
}

/** Builds a continuous straight wall run between two grid vertices; segments that exist are kept and not charged. */
export function placeWallRun(lotId: Id, householdId: Id, level: number, from: Point, to: Point, spec?: WallSpec, openings?: OpeningSpec[]): BuildCommand {
  return fromBuilt(lotId, householdId, wallRunRequest(level, from, to, spec, openings));
}

/** The rectangular room tool: perimeter walls between two corner vertices, optional floor fill of the inside, optional doors/windows. */
export function placeRoom(
  lotId: Id, householdId: Id, level: number, a: Point, b: Point, o: { spec?: WallSpec; floor?: FinishRef | null; openings?: OpeningSpec[] } = {},
): BuildCommand {
  return fromBuilt(lotId, householdId, wallRectRequest(level, a, b, o));
}

/** Demolishes one wall segment (and the door or window in it), with refund. */
export function eraseWallSegment(lotId: Id, householdId: Id, level: number, edge: EdgeRef): BuildCommand {
  return buildCommand(lotId, householdId, eraseSegmentRequest(level, edge));
}

/** Demolishes the walls along a straight run. */
export function eraseWallRun(lotId: Id, householdId: Id, level: number, from: Point, to: Point): BuildCommand {
  return fromBuilt(lotId, householdId, eraseRunRequest(level, from, to));
}

/** Demolishes every wall lying completely inside a vertex rectangle. */
export function eraseWallRect(lotId: Id, householdId: Id, level: number, a: Point, b: Point): BuildCommand {
  return fromBuilt(lotId, householdId, eraseRectRequest(level, a, b));
}

// ---------------------------------------------------------------------------------------------
// Openings
// ---------------------------------------------------------------------------------------------

/** Buys a door or window and puts it in the wall; `wallId` is the first edge (smallest x/z) of its span. */
export function placeOpening(lotId: Id, householdId: Id, defId: string, wallId: string, flip = false): BuildCommand {
  return buildCommand(lotId, householdId, { kind: 'placeOpening', defId, wallId, flip });
}

/** Moves (and optionally flips) a door or window to another wall position (free). */
export function moveOpening(lotId: Id, householdId: Id, openingId: Id, wallId: string, flip?: boolean): BuildCommand {
  return buildCommand(lotId, householdId, { kind: 'moveOpening', openingId, wallId, ...(flip !== undefined ? { flip } : {}) });
}

/** Removes a door or window (the wall stays) with refund. */
export function deleteOpening(lotId: Id, householdId: Id, openingId: Id): BuildCommand {
  return buildCommand(lotId, householdId, { kind: 'eraseOpening', openingId });
}

// ---------------------------------------------------------------------------------------------
// Floors and rooms
// ---------------------------------------------------------------------------------------------

/** Lays floor on tiles (design price per tile that changes; reuses the paint command). */
export function placeFloorTiles(lotId: Id, householdId: Id, level: number, tiles: Point[], finish: FinishRef): UndoableCommand {
  return paintFloorTiles(lotId, householdId, level, tiles, finish);
}

/** Lays floor on an inclusive tile rectangle between two tiles. */
export function placeFloorRect(lotId: Id, householdId: Id, level: number, a: Point, b: Point, finish: FinishRef): UndoableCommand {
  return paintFloorTiles(lotId, householdId, level, tileRectTiles(a, b), finish);
}

/** Fills the floor of the room containing the tile. */
export function fillRoomFloor(lotId: Id, householdId: Id, level: number, tile: Point, finish: FinishRef): UndoableCommand {
  return paintRoomFloor(lotId, householdId, level, tile, finish);
}

/** Erases the floor finish on tiles (80 % of the design price back; bare ground remains). */
export function eraseFloorTiles(lotId: Id, householdId: Id, level: number, tiles: Point[]): BuildCommand {
  return buildCommand(lotId, householdId, { kind: 'eraseFloor', level, tiles: tiles.map((t) => ({ x: t.x, z: t.z })) });
}

/** Erases the floor of the whole room containing the tile. */
export function eraseRoomFloor(lotId: Id, householdId: Id, level: number, tile: Point): BuildCommand {
  return buildCommand(lotId, householdId, { kind: 'eraseFloor', level, tiles: [], room: { x: tile.x, z: tile.z } });
}

/**
 * Deletes a room: its floor and every wall that faces the outdoors (with their doors and windows). Walls shared
 * with another indoor room stay. Refused while furniture stands in the room.
 */
export function deleteRoom(lotId: Id, householdId: Id, level: number, tile: Point): BuildCommand {
  return buildCommand(lotId, householdId, { kind: 'deleteRoom', level, tile: { x: tile.x, z: tile.z } });
}
