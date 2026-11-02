// Lazy lot layouts (Milestone 7). Neighbourhood lots are created as empty records with `built: false`; the first time
// somebody travels there, ensureLotBuilt() asks a builder to lay the lot out (walls, floors, furniture) exactly once.
// The result is ordinary lot data in the world state, so it is saved, loaded and never rebuilt. A builder must be
// deterministic and must not draw from the world rng.
//
// The venue and residential layouts are written in src/world/venues.ts (buildVenueLot, buildResidentialLot; homes in
// src/world/homes.ts). This module is the only place that knows about it, so tests and tools can replace the builders with
// setLotBuilders() (STUB_BUILDERS gives light lots: empty venues and the Milestone 1 houses).

import type { ContentDB } from '../content/types';
import type { Id, WorldState } from '../core/types';
import { requireLot } from './lots';
import { furnishNeighborHouse, furnishStarterHouse } from './starter';
import { buildResidentialLot, buildVenueLot } from './venues';

export type VenueType = 'park' | 'cafe' | 'gym' | 'library' | 'arts' | 'market';

export interface LotBuilders {
  /** Lays out a public venue of the given type on an empty lot. */
  venue(state: WorldState, content: ContentDB, lotId: Id, venueType: VenueType): void;
  /** Lays out and furnishes a home on an empty lot; `variant` picks the plan. */
  residential(state: WorldState, content: ContentDB, lotId: Id, variant: number): void;
}

/**
 * Light builders: venues stay empty lots (open ground, nothing to use) and homes reuse the two Milestone 1 house plans.
 * For tests and tools that do not need the real layouts.
 */
export const STUB_BUILDERS: LotBuilders = {
  venue: () => undefined,
  residential(state, content, lotId, variant) {
    if (variant % 2 === 0) furnishNeighborHouse(state, content, lotId);
    else furnishStarterHouse(state, content, lotId);
  },
};

/** The game's layouts (world/venues.ts, world/homes.ts). */
export const DEFAULT_BUILDERS: LotBuilders = { venue: buildVenueLot, residential: buildResidentialLot };

let current: LotBuilders = DEFAULT_BUILDERS;

/** Replaces the builders (partially or fully); `null` restores the defaults. Returns the previous set. */
export function setLotBuilders(next: Partial<LotBuilders> | null): LotBuilders {
  const prev = current;
  current = next === null ? DEFAULT_BUILDERS : next.venue && next.residential ? (next as LotBuilders) : { ...current, ...next };
  return prev;
}

export function lotBuilders(): LotBuilders { return current; }

export function isLotBuilt(state: WorldState, lotId: Id): boolean {
  return state.lots[lotId]?.built !== false;
}

export type BuildLotResult = { ok: true; built: boolean } | { ok: false; reason: string };

/**
 * Builds the lot's layout when it has none yet. Returns `built: true` when this call did the work. A builder that
 * throws leaves the lot as it was (empty) and returns a readable reason; nothing is half applied because the lot is
 * restored from a snapshot.
 */
export function ensureLotBuilt(state: WorldState, content: ContentDB, lotId: Id): BuildLotResult {
  const lot = requireLot(state, lotId);
  if (lot.built !== false) return { ok: true, built: false };
  const snapshot = JSON.stringify({ lot, nextId: state.nextId });
  try {
    if (lot.kind === 'venue') current.venue(state, content, lotId, (lot.venueType ?? 'park') as VenueType);
    else current.residential(state, content, lotId, lot.variant ?? 0);
  } catch (e) {
    const saved = JSON.parse(snapshot) as { lot: typeof lot; nextId: number };
    state.lots[lotId] = saved.lot;
    state.nextId = saved.nextId;
    return { ok: false, reason: `${lot.name} could not be prepared (${e instanceof Error ? e.message : 'unknown error'}).` };
  }
  state.lots[lotId]!.built = true;
  return { ok: true, built: true };
}
