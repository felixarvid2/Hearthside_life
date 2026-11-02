// Milestone 9: fences and gates on grid edges (Lot.fences). The M9 exterior work fills in the content and build rules;
// navigation (world/navgrid.ts) only relies on fenceEdgeState.
import { edgeKey } from '../core/ids';
import type { EdgeDir, Lot } from '../core/types';

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
