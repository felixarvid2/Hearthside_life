// The Meshy base bodies (dev/meshy/, the inputs of tools/build-meshy-bodies.mts) fitted onto the mannequin skeleton, and
// the body template / garment / hair generators pointed at the fitted Meshy mesh.
import { NodeIO } from '@gltf-transform/core';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GARMENTS, HAIR } from '../../../src/content/character';
import { buildGarment } from '../../../src/characters/clothing';
import { buildHair } from '../../../src/characters/hair';
import { buildBodyTemplate } from '../../../src/characters/template';
import { fitMeshy } from '../../../src/characters/meshyFit';
import { meshyRawBody } from '../../../src/characters/meshyRaw';
import { loadRawBody } from './loadRaw';

const dir = fileURLToPath(new URL('../../../dev/meshy/', import.meta.url));
const MODELS: Array<{ file: string; frame: 'a' | 'b' }> = [
  { file: 'base_male_v2.glb', frame: 'a' },
  { file: 'base_female_underwear.glb', frame: 'b' },
];

async function load(file: string) {
  const doc = await new NodeIO().read(`${dir}${file}`);
  const prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
  return {
    positions: new Float32Array(prim.getAttribute('POSITION')!.getArray()!),
    normals: new Float32Array(prim.getAttribute('NORMAL')!.getArray()!),
    index: prim.getIndices()!.getArray()!,
  };
}

for (const m of MODELS) {
  describe.skipIf(!existsSync(`${dir}${m.file}`))(`meshy fit: ${m.file}`, () => {
    it('normalises the mesh into bind space and gives every vertex valid, side-correct weights', async () => {
      const src = await load(m.file);
      const raw = await loadRawBody(m.frame);
      const r = fitMeshy(src, raw, { height: 1.78 });
      const P = r.positions;
      let minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < P.length / 3; i++) { minY = Math.min(minY, P[i * 3 + 1]!); maxY = Math.max(maxY, P[i * 3 + 1]!); }
      expect(minY).toBeCloseTo(0, 2);
      expect(maxY).toBeCloseTo(1.78, 2);
      expect(r.report.facingFlipped).toBe(false);
      // the crotch (top of the leg gap) is found at a believable height and the body axis is on x = 0
      const c = r.report.landmarks;
      expect(c.crotch / r.report.sourceHeight).toBeGreaterThan(0.38);
      expect(c.crotch / r.report.sourceHeight).toBeLessThan(0.55);
      expect(r.report.landmarks.armScale).toBeGreaterThan(0.9);
      expect(r.report.landmarks.armScale).toBeLessThan(1.5);
      for (let i = 0; i < P.length / 3; i++) {
        const s = r.weights[i * 4]! + r.weights[i * 4 + 1]! + r.weights[i * 4 + 2]! + r.weights[i * 4 + 3]!;
        expect(Math.abs(s - 1)).toBeLessThan(1e-3);
        for (let k = 0; k < 4; k++) expect(r.joints[i * 4 + k]!).toBeLessThan(raw.boneNames.length);
      }
      // legs below the crotch never take bones of the other side
      const names = raw.boneNames;
      let leaks = 0;
      for (let i = 0; i < P.length / 3; i++) {
        if (P[i * 3 + 1]! > 0.7) continue;
        const left = P[i * 3]! >= 0;
        for (let k = 0; k < 4; k++) if (r.weights[i * 4 + k]! > 0.02) { const nm = names[r.joints[i * 4 + k]!]!; if (nm.endsWith(left ? '_r' : '_l')) leaks++; }
      }
      expect(leaks).toBe(0);
    }, 120_000);

    it('lets the template, garment and hair generators run on the fitted Meshy body', async () => {
      const src = await load(m.file);
      const raw = await loadRawBody(m.frame);
      const t = buildBodyTemplate(meshyRawBody(raw, fitMeshy(src, raw)));
      for (const g of GARMENTS) expect(buildGarment(t, g).mesh.indices.length, g.id).toBeGreaterThan(0);
      for (const h of HAIR) expect(buildHair(t, h, null).indices.length, h.id).toBeGreaterThan(0);
    }, 120_000);
  });
}
