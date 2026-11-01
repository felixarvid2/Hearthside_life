// A fitted Meshy mesh as a RawBody (the mannequin's skeleton facts + the Meshy surface and transferred skin), so the
// body template, garment and hair generators can be pointed at the Meshy body. Pure module.

import type { RawBody } from '../src/characters/rig';
import type { FitResult } from './meshyFit';

export function meshyRawBody(mannequin: RawBody, fit: FitResult): RawBody {
  const n = fit.positions.length / 3;
  const weights = new Float32Array(fit.weights);
  for (let i = 0; i < n; i++) {
    const s = (weights[i * 4] as number) + (weights[i * 4 + 1] as number) + (weights[i * 4 + 2] as number) + (weights[i * 4 + 3] as number) || 1;
    for (let k = 0; k < 4; k++) weights[i * 4 + k] = (weights[i * 4 + k] as number) / s;
  }
  return { ...mannequin, positions: fit.positions, joints: fit.joints, weights, index: fit.index };
}
