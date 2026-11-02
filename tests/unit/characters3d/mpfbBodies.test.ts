// The MPFB (MakeHuman) bodies, public/assets/characters/mpfb_{f,m}.glb built by tools/build-mpfb-bodies.mts: bound to the game's
// skeleton, inside the triangle budget, with body and face morph targets, a neutral skin, a recolourable iris and lips, and only
// CC0 / CC-BY assets. The format is documented in tools/mpfb/README.md ("GLB format").
import { NodeIO } from '@gltf-transform/core';
import type { Document, Primitive } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = fileURLToPath(new URL('../../../public/assets/characters/', import.meta.url));
const BODIES = [{ sex: 'f', frame: 'b' }, { sex: 'm', frame: 'a' }] as const;
const BODY_MORPHS = ['weight_up', 'weight_down', 'muscle_up', 'muscle_down', 'bust_up', 'bust_down', 'waist_wide', 'hips_wide', 'shoulders_wide', 'belly_round'];
const FACE_MORPHS = ['face_length', 'face_width', 'face_jaw_width', 'face_chin_length', 'face_chin_prominence', 'face_cheek_fullness', 'face_nose_width',
  'face_nose_length', 'face_eye_size', 'face_eye_spacing', 'face_lip_fullness', 'face_mouth_width', 'face_brow_height', 'face_smile'];
const MORPHS = [...BODY_MORPHS, ...FACE_MORPHS];
const PRIMITIVES = ['skin', 'eyes', 'eyebrows', 'eyelashes', 'underwear', 'iris'];

async function read(file: string): Promise<Document> {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  return io.read(`${dir}${file}`);
}

const primByMaterial = (doc: Document): Record<string, Primitive> => {
  const out: Record<string, Primitive> = {};
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) out[p.getMaterial()!.getName().replace(/^mpfb_/, '')] = p;
  return out;
};
const bodyExtras = (doc: Document) => (doc.getRoot().listNodes().find((n) => n.getMesh())!.getExtras() as { mpfbBody: Record<string, any> }).mpfbBody;

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

    it('is small: at most 900 kB', () => {
      expect(statSync(`${dir}mpfb_${b.sex}.glb`).size).toBeLessThanOrEqual(900_000);
    });

    it('has the primitives skin, eyes, eyebrows, eyelashes, underwear and iris, each with a material of its own', async () => {
      const doc = await read(`mpfb_${b.sex}.glb`);
      const prims = doc.getRoot().listMeshes()[0]!.listPrimitives();
      expect(prims.map((p) => p.getMaterial()!.getName().replace(/^mpfb_/, '')).sort()).toEqual(['brows', 'eyes', 'iris', 'lashes', 'skin', 'underwear'].sort());
      expect(Object.keys(primByMaterial(doc)).length).toBe(PRIMITIVES.length);
    });

    it('carries the body and face morph targets on every primitive, named in the mesh extras (body first, then face)', async () => {
      const doc = await read(`mpfb_${b.sex}.glb`);
      const mesh = doc.getRoot().listMeshes()[0]!;
      expect((mesh.getExtras() as { targetNames: string[] }).targetNames).toEqual(MORPHS);
      for (const prim of mesh.listPrimitives()) expect(prim.listTargets().length).toBe(MORPHS.length);
      const x = bodyExtras(doc);
      expect(x.morphs).toEqual(MORPHS);
      expect(x.bodyMorphs).toEqual(BODY_MORPHS);
      expect(x.faceMorphs).toEqual(FACE_MORPHS);
    });

    it('keeps the face morphs on the head (skin deltas above 1.4 m, a few cm at most) and the body morphs moving the body', async () => {
      const doc = await read(`mpfb_${b.sex}.glb`);
      const skin = primByMaterial(doc).skin!;
      const names = (doc.getRoot().listMeshes()[0]!.getExtras() as { targetNames: string[] }).targetNames;
      const pos = skin.getAttribute('POSITION')!;
      const d: number[] = [0, 0, 0], p: number[] = [0, 0, 0];
      for (const name of FACE_MORPHS) {
        const t = skin.listTargets()[names.indexOf(name)]!.getAttribute('POSITION')!;
        let moved = 0, max = 0;
        for (let i = 0; i < t.getCount(); i++) {
          t.getElement(i, d);
          const len = Math.hypot(d[0]!, d[1]!, d[2]!);
          if (len > 1e-5) { pos.getElement(i, p); expect(p[1]).toBeGreaterThan(1.4); moved++; }
          max = Math.max(max, len);
        }
        expect(moved, name).toBeGreaterThan(20);
        expect(max, name).toBeGreaterThan(0.001);
        expect(max, name).toBeLessThan(0.03);
      }
      const w = skin.listTargets()[names.indexOf('weight_up')]!.getAttribute('POSITION')!;
      let max = 0;
      for (let i = 0; i < w.getCount(); i++) { w.getElement(i, d); max = Math.max(max, Math.hypot(d[0]!, d[1]!, d[2]!)); }
      expect(max).toBeGreaterThan(0.01);
    });

    it('has a `_LIPS` weight on the skin (0..1, a few hundred vertices) so the lips can be recoloured', async () => {
      const doc = await read(`mpfb_${b.sex}.glb`);
      const lips = primByMaterial(doc).skin!.getAttribute('_LIPS')!;
      expect(lips.getCount()).toBe(primByMaterial(doc).skin!.getAttribute('POSITION')!.getCount());
      let on = 0;
      const v: number[] = [0];
      for (let i = 0; i < lips.getCount(); i++) { lips.getElement(i, v); expect(v[0]).toBeGreaterThanOrEqual(0); expect(v[0]).toBeLessThanOrEqual(1); if (v[0]! > 0.5) on++; }
      expect(on).toBeGreaterThan(100);
      expect(on).toBeLessThan(600);
      expect(bodyExtras(doc).lips).toMatchObject({ attribute: '_LIPS', primitive: 'skin' });
    });

    it('has an iris primitive of its own with a neutral grey texture, UVs over the whole texture, and a tint', async () => {
      const doc = await read(`mpfb_${b.sex}.glb`);
      const iris = primByMaterial(doc).iris!;
      expect(iris.getIndices()!.getCount() / 3).toBeGreaterThan(20);
      const uv = iris.getAttribute('TEXCOORD_0')!;
      const v: number[] = [0, 0];
      for (let i = 0; i < uv.getCount(); i++) { uv.getElement(i, v); for (const c of v) { expect(c).toBeGreaterThan(0.05); expect(c).toBeLessThan(0.95); } }
      const tex = iris.getMaterial()!.getBaseColorTexture()!;
      const { data } = await sharp(Buffer.from(tex.getImage()!)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let i = 0; i < data.length; i += 3 * 97) { expect(Math.abs(data[i]! - data[i + 1]!)).toBeLessThanOrEqual(2); expect(Math.abs(data[i + 1]! - data[i + 2]!)).toBeLessThanOrEqual(2); }
      expect(bodyExtras(doc).iris).toMatchObject({ primitive: 'iris', material: 'mpfb_iris' });
      expect(bodyExtras(doc).iris.tint).toHaveLength(3);
    });

    it('has a neutral skin texture: no large-scale blotches, so tone / skinMean works from light to dark', async () => {
      const doc = await read(`mpfb_${b.sex}.glb`);
      const tex = primByMaterial(doc).skin!.getMaterial()!.getBaseColorTexture()!;
      const { data, info } = await sharp(Buffer.from(tex.getImage()!)).removeAlpha().resize(32, 32, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
      const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      const mean = [0, 0, 0];
      const n = info.width * info.height;
      for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) mean[c]! += lin(data[i * 3 + c]!) / n;
      // the texture holds the body islands on a background of the same colour: every 1/32 block stays within 20% of the mean (the worst are the eye sockets and ears)
      let worst = 0;
      for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(lin(data[i * 3 + c]!) / mean[c]! - 1));
      expect(worst).toBeLessThan(0.2);
      const sm = bodyExtras(doc).skinMean as number[];
      for (let c = 0; c < 3; c++) expect(sm[c]! / mean[c]!).toBeGreaterThan(0.85), expect(sm[c]! / mean[c]!).toBeLessThan(1.15);
    });

    it('records the licence of every asset, only CC0 or CC-BY; the male trunks are generated (no third-party asset)', async () => {
      const doc = await read(`mpfb_${b.sex}.glb`);
      const lic = bodyExtras(doc).licenses as Record<string, { license: string }>;
      expect(Object.keys(lic).length).toBeGreaterThan(5);
      for (const v of Object.values(lic)) expect(['CC0', 'CC-BY']).toContain(v.license);
      expect(Object.keys(lic).some((k) => k.includes('elvs_swimwear_micro_shorts'))).toBe(false);
      if (b.sex === 'm') expect(Object.keys(lic).some((k) => k.startsWith('trunks'))).toBe(true);
    });
  });
}
