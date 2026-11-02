// The MPFB (MakeHuman) body prototype, public/assets/characters/mpfb_{f,m}.glb built by tools/build-mpfb-bodies.mts: bound to the
// game's skeleton, inside the triangle budget, with morph targets and only CC0 / CC-BY assets. Not used by the game.
import { NodeIO } from '@gltf-transform/core';
import type { Document } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = fileURLToPath(new URL('../../../public/assets/characters/', import.meta.url));
const BODIES = [{ sex: 'f', frame: 'b' }, { sex: 'm', frame: 'a' }] as const;
const MORPHS = ['weight_up', 'weight_down', 'muscle_up', 'muscle_down', 'bust_up', 'bust_down', 'waist_wide', 'hips_wide', 'shoulders_wide', 'belly_round'];

async function read(file: string): Promise<Document> {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  return io.read(`${dir}${file}`);
}

for (const b of BODIES) {
  describe.skipIf(!existsSync(`${dir}mpfb_${b.sex}.glb`))(`mpfb_${b.sex}.glb`, () => {
    it('uses the joints of the game skeleton in the same order, so the shared clips apply', async () => {
      const doc = await read(`mpfb_${b.sex}.glb`);
      const body = await read(`body_${b.frame}.glb`);
      const names = (d: Document) => d.getRoot().listSkins()[0]!.listJoints().map((j) => j.getName());
      expect(names(doc)).toEqual(names(body));
      for (const [i, j] of doc.getRoot().listSkins()[0]!.listJoints().entries()) {
        const w = j.getWorldTranslation(), ref = body.getRoot().listSkins()[0]!.listJoints()[i]!.getWorldTranslation();
        for (let k = 0; k < 3; k++) expect(w[k]).toBeCloseTo(ref[k]!, 5);
      }
    });

    it('stays within 15k triangles, stands on the floor at about 1.8 m and has normalised skin weights', async () => {
      const doc = await read(`mpfb_${b.sex}.glb`);
      let tris = 0, minY = Infinity, maxY = -Infinity;
      for (const prim of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
        tris += prim.getIndices()!.getCount() / 3;
        const pos = prim.getAttribute('POSITION')!, wts = prim.getAttribute('WEIGHTS_0')!;
        const v: number[] = [0, 0, 0], w: number[] = [0, 0, 0, 0];
        for (let i = 0; i < pos.getCount(); i++) {
          pos.getElement(i, v);
          minY = Math.min(minY, v[1]!); maxY = Math.max(maxY, v[1]!);
          wts.getElement(i, w);
          expect(w[0]! + w[1]! + w[2]! + w[3]!).toBeCloseTo(1, 2);
        }
      }
      expect(tris).toBeLessThanOrEqual(15000);
      expect(minY).toBeGreaterThan(-0.02);
      expect(minY).toBeLessThan(0.03);
      expect(maxY).toBeGreaterThan(1.7);
      expect(maxY).toBeLessThan(1.85);
    });

    it('carries the creator morph targets on every primitive, named in the mesh extras', async () => {
      const doc = await read(`mpfb_${b.sex}.glb`);
      const mesh = doc.getRoot().listMeshes()[0]!;
      expect((mesh.getExtras() as { targetNames: string[] }).targetNames).toEqual(MORPHS);
      for (const prim of mesh.listPrimitives()) expect(prim.listTargets().length).toBe(MORPHS.length);
    });

    it('records the licence of every asset, only CC0 or CC-BY', async () => {
      const doc = await read(`mpfb_${b.sex}.glb`);
      const node = doc.getRoot().listNodes().find((n) => n.getMesh())!;
      const lic = (node.getExtras() as { mpfbBody: { licenses: Record<string, { license: string }> } }).mpfbBody.licenses;
      expect(Object.keys(lic).length).toBeGreaterThan(5);
      for (const v of Object.values(lic)) expect(['CC0', 'CC-BY']).toContain(v.license);
    });
  });
}
