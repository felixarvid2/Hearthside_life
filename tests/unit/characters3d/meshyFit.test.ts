// Feasibility experiment (dev/meshy*): the Meshy base body fitted onto the mannequin skeleton.
import { NodeIO } from '@gltf-transform/core';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fitMeshy } from '../../../dev/meshyFit';
import { loadRawBody } from './loadRaw';

const glb = fileURLToPath(new URL('../../../dev/meshy/base_male_test.glb', import.meta.url));

describe.skipIf(!existsSync(glb))('meshy fit', () => {
  it('normalises the mesh into bind space and gives every vertex valid weights', async () => {
    const doc = await new NodeIO().read(glb);
    const prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    const src = {
      positions: new Float32Array(prim.getAttribute('POSITION')!.getArray()!),
      normals: new Float32Array(prim.getAttribute('NORMAL')!.getArray()!),
      index: prim.getIndices()!.getArray()!,
    };
    const raw = await loadRawBody('a');
    const r = fitMeshy(src, raw, { height: 1.78 });
    if (process.env.MESHY_VERBOSE) process.stderr.write(JSON.stringify(r.report) + "\n");
    const P = r.positions;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < P.length / 3; i++) { minY = Math.min(minY, P[i * 3 + 1]!); maxY = Math.max(maxY, P[i * 3 + 1]!); }
    expect(minY).toBeCloseTo(0, 3);
    expect(maxY).toBeCloseTo(1.78, 3);
    expect(r.report.facingFlipped).toBe(false);
    for (let i = 0; i < P.length / 3; i++) {
      const s = r.weights[i * 4]! + r.weights[i * 4 + 1]! + r.weights[i * 4 + 2]! + r.weights[i * 4 + 3]!;
      expect(Math.abs(s - 1)).toBeLessThan(1e-3);
      for (let k = 0; k < 4; k++) expect(r.joints[i * 4 + k]!).toBeLessThan(raw.boneNames.length);
    }
    // a left-leg vertex never takes right-side bones
    const rightBones = new Set(raw.boneNames.map((n, i) => (n.endsWith('_r') ? i : -1)).filter((i) => i >= 0));
    let leaks = 0;
    for (let i = 0; i < P.length / 3; i++) {
      if (P[i * 3]! > 0.06 && P[i * 3 + 1]! < 0.8) for (let k = 0; k < 4; k++) if (r.weights[i * 4 + k]! > 0.05 && rightBones.has(r.joints[i * 4 + k]!)) leaks++;
    }
    expect(leaks).toBe(0);
  });
});
