// Milestone 9: fences and gates on grid edges (Lot.fences). The M9 exterior work fills in the content and build rules;
// navigation (world/navgrid.ts) only relies on fenceEdgeState.
import { edgeKey } from '../core/ids';
import type { EdgeDir, Fence, Lot } from '../core/types';

export type FenceEdgeState = 'open' | 'wall' | 'gate';

/** Gate defs are fence defs whose id starts with 'gate-' (content/exterior.ts). */
export function isGateDef(defId: string): boolean {
  return defId.startsWith('gate-');
}

/** How a fence on this edge affects movement: none = 'open', a fence = 'wall', a gate = 'gate' (passable like a door). */
export function fenceEdgeState(lot: Lot, level: number, dir: EdgeDir, x: number, z: number): FenceEdgeState {
  const f = lot.fences?.[edgeKey(level, dir, x, z)];
  if (!f) return 'open';
  return isGateDef(f.defId) ? 'gate' : 'wall';
}

// ---------------------------------------------------------------------------------------------
// Milestone 9 exterior: helpers for the fence tools and renderer
// ---------------------------------------------------------------------------------------------

/** The fence on an edge, if any. */
export function fenceAt(lot: Lot, level: number, dir: EdgeDir, x: number, z: number): Fence | undefined {
  return lot.fences?.[edgeKey(level, dir, x, z)];
}

/** Fences of a level (all levels when omitted), in key order so renders and tests are stable. */
export function fencesOnLevel(lot: Lot, level?: number): Fence[] {
  const out = Object.values(lot.fences ?? {}).filter((f) => level === undefined || f.level === level);
  return out.sort((a, b) => (edgeKey(a.level, a.dir, a.x, a.z) < edgeKey(b.level, b.dir, b.x, b.z) ? -1 : 1));
}

/**
 * True when a fence continues on the next edge of the same run, so this edge does not need its own far end post.
 * A gate always stands on its own posts (it is drawn with both), and a different design starts a new run.
 */
export function fenceContinues(lot: Lot, f: Fence): boolean {
  const next = fenceAt(lot, f.level, f.dir, f.dir === 'h' ? f.x + 1 : f.x, f.dir === 'v' ? f.z + 1 : f.z);
  return !!next && !isGateDef(f.defId) && !isGateDef(next.defId);
}

/** The edge keys of a fence or gate (always one: a fence occupies exactly one grid edge). */
export function fenceEdge(f: Fence): string { return edgeKey(f.level, f.dir, f.x, f.z); }
