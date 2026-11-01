#!/usr/bin/env node
// Builds the in-game Meshy bodies (public/assets/characters/meshy_a.glb, meshy_b.glb) from the generated base meshes in
// dev/meshy/ (base_male_v2.glb for frame a, base_female_underwear.glb for frame b).
//
//   npm run assets:meshy            (node --experimental-strip-types tools/build-meshy-bodies.mts [--only=a|b])
//
// Per body: fit the unrigged T-pose mesh onto the shared 65-joint skeleton (src/characters/meshyFit.ts: orientation,
// height, arm/leg straightening, skin weights transferred from the mannequin) -> attribute-aware simplification to about
// 10k triangles (meshoptimizer simplifyWithAttributes with the UVs as attributes, head vertices locked so the face keeps
// its full resolution) -> 1024 px WebP albedo plus a 512 px RGB mask (R skin, G baked tank top / shorts, B iris or brow)
// from a colour/position classification of the 2048 px texture (src/characters/meshyBake.ts) -> head map data (eye line,
// brow line, crown and the radius table of the real head, src/characters/headMap.ts) -> GLB bound to the body_a/body_b
// skeleton (the skeleton, skin and joint order are taken from the existing body GLB so the animation clips apply).
// Morph targets (body sliders, face sculpt) are not stored: they are evaluated at load from the same displacement
// fields the garments use (src/characters/meshyBody.ts), which keeps clothing and body exactly in step.
//
// The generated inputs stay in dev/meshy/; the outputs are committed so a fresh clone runs without this step.

import { NodeIO } from '@gltf-transform/core';
import type { Document } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = `${ROOT}/public/assets/characters`;
const BODIES = [
  { id: 'meshy_a', frame: 'a', src: 'dev/meshy/base_male_v2.glb' },
  { id: 'meshy_b', frame: 'b', src: 'dev/meshy/base_female_underwear.glb' },
] as const;

/** Triangles kept (head included), albedo size and mask size. */
const TARGET_TRIS = 10000;
const ALBEDO = 1024;
const MASK = 512;
const HEAD_MIN_Y = 1.58;
const HEIGHT = 1.8;

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

type Vec3 = [number, number, number];
interface RawBody { frame: 'a' | 'b'; positions: Float32Array; joints: Uint16Array; weights: Float32Array; index: Uint32Array; boneNames: string[]; bonePos: Vec3[]; boneParent: number[] }

const load = async (rel: string) => (await runnerImport(`${ROOT}/${rel}`)).module as Record<string, any>;

/** The mannequin GLB as the generators' RawBody (positions, skin, bind skeleton facts). */
function rawFromDoc(doc: Document, frame: 'a' | 'b'): RawBody {
  const r = doc.getRoot();
  const joints = r.listSkins()[0]!.listJoints();
  const prim = r.listMeshes()[0]!.listPrimitives()[0]!;
  const W = prim.getAttribute('WEIGHTS_0')!.getArray()!;
  const weights = new Float32Array(W.length);
  for (let i = 0; i < W.length; i += 4) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += W[i + k] as number;
    for (let k = 0; k < 4; k++) weights[i + k] = (W[i + k] as number) / (s || 1);
  }
  return {
    frame, positions: new Float32Array(prim.getAttribute('POSITION')!.getArray()!), joints: new Uint16Array(prim.getAttribute('JOINTS_0')!.getArray()!), weights,
    index: new Uint32Array(prim.getIndices()!.getArray()!), boneNames: joints.map((j) => j.getName()),
    bonePos: joints.map((j) => { const m = j.getWorldMatrix(); return [m[12], m[13], m[14]] as Vec3; }),
    boneParent: joints.map((j) => { const p = j.getParentNode(); return p ? joints.indexOf(p as never) : -1; }),
  };
}

async function buildOne(b: (typeof BODIES)[number], mods: { fit: Record<string, any>; bake: Record<string, any>; head: Record<string, any> }): Promise<void> {
  const t0 = Date.now();
  const io = new NodeIO().registerExtensions([EXTTextureWebP]);
  const srcDoc = await io.read(`${ROOT}/${b.src}`);
  const sp = srcDoc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
  const bodyDoc = await io.read(`${OUT}/body_${b.frame}.glb`);
  const raw = rawFromDoc(bodyDoc, b.frame);

  // ---- fit onto the skeleton ----
  const fit = mods.fit.fitMeshy({
    positions: new Float32Array(sp.getAttribute('POSITION')!.getArray()!), normals: new Float32Array(sp.getAttribute('NORMAL')!.getArray()!), index: sp.getIndices()!.getArray()!,
  }, raw, { height: HEIGHT });
  const uvAll = new Float32Array(sp.getAttribute('TEXCOORD_0')!.getArray()!);
  const nAll = fit.positions.length / 3;
  console.log(`[${b.id}] fit ${fit.report.ms} ms, ${fit.report.tris} tris, ${nAll} vertices`);

  // ---- texture analysis on the full-resolution mesh (the UV layout is shared with the simplified one) ----
  const img = await sharp(Buffer.from(srcDoc.getRoot().listTextures()[0]!.getImage()!)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const S = img.info.width;
  const map = mods.bake.rasterizeUv(uvAll, fit.index, fit.positions, S);
  const cls = mods.bake.classifyTexels(new Uint8Array(img.data), map, { headMinY: HEAD_MIN_Y });
  if (cls.eyes.length < 2) throw new Error(`${b.id}: found ${cls.eyes.length} eyes in the texture`);
  const mean = (a: Array<{ y: number }>) => a.reduce((s, e) => s + e.y, 0) / a.length;
  const eyeY = mean(cls.eyes), browY = cls.brows.length ? mean(cls.brows) : eyeY + 0.024;
  console.log(`[${b.id}] eyes ${cls.eyes.length} at y ${eyeY.toFixed(3)}, brows ${cls.brows.length} at y ${browY.toFixed(3)}, texels ${JSON.stringify(cls.counts)}`);
  const covered = new Uint8Array(S * S);
  for (let k = 0; k < S * S; k++) covered[k] = (map.tri[k] as number) >= 0 ? 1 : 0;
  const mask = mods.bake.packMask(cls.classes, covered, S, MASK) as Uint8Array;
  const maskRgb = Buffer.alloc(MASK * MASK * 3);
  // channel B carries the iris (below the split height) and the brow (above); the packer keeps them apart as two channels
  for (let k = 0; k < MASK * MASK; k++) { maskRgb[k * 3] = mask[k * 4]!; maskRgb[k * 3 + 1] = mask[k * 4 + 1]!; maskRgb[k * 3 + 2] = Math.min(255, mask[k * 4 + 2]! + mask[k * 4 + 3]!); }
  const maskPng = await sharp(maskRgb, { raw: { width: MASK, height: MASK, channels: 3 } }).png({ compressionLevel: 9, effort: 10 }).toBuffer();
  const albedo = await sharp(Buffer.from(srcDoc.getRoot().listTextures()[0]!.getImage()!)).resize(ALBEDO, ALBEDO, { kernel: 'lanczos3' }).webp({ quality: 88, effort: 6 }).toBuffer();

  // ---- attribute-aware simplification, head locked ----
  await MeshoptSimplifier.ready;
  const lock = new Uint8Array(nAll);
  for (let i = 0; i < nAll; i++) if ((fit.positions[i * 3 + 1] as number) > 1.56 && Math.abs(fit.positions[i * 3] as number) < 0.13) lock[i] = 1;
  const [simp, err] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(fit.index), fit.positions, 3, uvAll, 2, [1, 1], lock, TARGET_TRIS * 3, 0.05, []);
  const remap = new Map<number, number>();
  const order: number[] = [];
  const index = new Uint16Array(simp.length);
  for (let i = 0; i < simp.length; i++) {
    let v = remap.get(simp[i]!);
    if (v === undefined) { v = order.length; order.push(simp[i]!); remap.set(simp[i]!, v); }
    index[i] = v;
  }
  const n = order.length;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), jnt = new Uint16Array(n * 4), wgt = new Float32Array(n * 4);
  order.forEach((o, i) => {
    for (let d = 0; d < 3; d++) { pos[i * 3 + d] = fit.positions[o * 3 + d] as number; nrm[i * 3 + d] = fit.normals[o * 3 + d] as number; }
    for (let d = 0; d < 2; d++) uv[i * 2 + d] = uvAll[o * 2 + d] as number;
    for (let d = 0; d < 4; d++) { jnt[i * 4 + d] = fit.joints[o * 4 + d] as number; wgt[i * 4 + d] = fit.weights[o * 4 + d] as number; }
  });
  console.log(`[${b.id}] simplified to ${index.length / 3} tris, ${n} vertices (error ${err.toFixed(4)})`);

  // ---- head map data from the final mesh ----
  let crownY = 0;
  for (let i = 0; i < n; i++) if (Math.abs(pos[i * 3] as number) < 0.13) crownY = Math.max(crownY, pos[i * 3 + 1] as number);
  const head = mods.head.meshyHeadInfo(pos, index, eyeY, browY, crownY);
  head.table.r = head.table.r.map((v: number) => +v.toFixed(4));

  // ---- write the GLB: the body GLB's skeleton and skin with the Meshy mesh ----
  const root = bodyDoc.getRoot();
  const buffer = root.listBuffers()[0]!;
  const prim = root.listMeshes()[0]!.listPrimitives()[0]!;
  for (const sem of prim.listSemantics()) prim.setAttribute(sem, null);
  const acc = (type: 'VEC2' | 'VEC3' | 'VEC4' | 'SCALAR', array: Float32Array | Uint16Array, normalized = false) => bodyDoc.createAccessor().setType(type).setArray(array).setBuffer(buffer).setNormalized(normalized);
  prim.setAttribute('POSITION', acc('VEC3', pos));
  prim.setAttribute('NORMAL', acc('VEC3', nrm));
  prim.setAttribute('TEXCOORD_0', acc('VEC2', uv));
  prim.setAttribute('JOINTS_0', acc('VEC4', jnt));
  prim.setAttribute('WEIGHTS_0', acc('VEC4', wgt));
  prim.setIndices(acc('SCALAR', index));
  const mat = root.listMaterials()[0]!;
  mat.setName('MeshyBody').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.7).setMetallicFactor(0);
  mat.setBaseColorTexture(bodyDoc.createTexture('albedo').setImage(albedo).setMimeType('image/webp'));
  // the mask rides in the occlusion slot (R skin, G baked clothing, B iris / brow); the runtime moves it into the skin shader
  mat.setOcclusionTexture(bodyDoc.createTexture('mask').setImage(maskPng).setMimeType('image/png'));
  const node = root.listNodes().find((nd) => nd.getMesh())!;
  node.setExtras({
    meshyBody: {
      version: 1, frame: b.frame,
      skinMean: cls.skinMean.map((v: number) => +v.toFixed(4)), clothMean: cls.clothMean.map((v: number) => +v.toFixed(4)),
      splitY: +(eyeY + 0.55 * (browY - eyeY)).toFixed(4), head,
    },
  });
  await bodyDoc.transform(prune());
  const file = `${OUT}/${b.id}.glb`;
  await io.write(file, bodyDoc);
  console.log(`[${b.id}] wrote ${file.replace(`${ROOT}/`, '')}: ${(statSync(file).size / 1024).toFixed(0)} kB (albedo ${(albedo.length / 1024).toFixed(0)} kB WebP ${ALBEDO}px, mask ${(maskPng.length / 1024).toFixed(0)} kB PNG ${MASK}px), ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

const mods = { fit: await load('src/characters/meshyFit.ts'), bake: await load('src/characters/meshyBake.ts'), head: await load('src/characters/headMap.ts') };
for (const b of BODIES) if (!only || only === b.frame) await buildOne(b, mods);
