#!/usr/bin/env node
// Builds the in-game Meshy bodies (public/assets/characters/meshy_a.glb, meshy_b.glb) from the generated base meshes in
// dev/meshy/ (base_male_v2.glb for frame a, base_female_underwear.glb for frame b).
//
//   npm run assets:meshy            (node --experimental-strip-types tools/build-meshy-bodies.mts [--only=a|b])
//
// Per body: fit the unrigged T-pose mesh onto the shared 65-joint skeleton (src/characters/meshyFit.ts: orientation,
// height, arm/leg straightening, skin weights transferred from the mannequin) -> classification of the 2048 px texture
// into skin / baked tank top and shorts / iris / brow (src/characters/meshyBake.ts) -> simplification of the welded surface
// to about 10k triangles (meshoptimizer; head vertices locked so the face keeps its full resolution) -> a new atlas of a
// few large planar charts (src/characters/meshyAtlas.ts: the source atlas has hundreds of tiny charts, so a simplified mesh
// cannot keep its UVs) with the colours and classes transferred from the source texture -> 1024 px WebP albedo plus a
// 512 px RGB mask (R skin, G baked clothing, B iris or brow) -> head map data (eye line, brow line, crown and the radius
// table of the real head, src/characters/headMap.ts) -> GLB bound to the body_a/body_b skeleton (the skeleton, skin and
// joint order are taken from the existing body GLB so the animation clips apply).
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

/** Body region of a bone (charts never mix regions): 0 trunk, 1 head, 2/3 arm l/r, 4/5 hand l/r, 6/7 leg l/r, 8/9 foot l/r. */
function regionOf(bone: string): number {
  const side = bone.endsWith('_r') ? 1 : 0;
  if (bone === 'Head') return 1;
  if (/^(upperarm|lowerarm)_/.test(bone)) return 2 + side;
  if (/^(hand|thumb|index|middle|ring|pinky)/.test(bone)) return 4 + side;
  if (/^(thigh|calf)_/.test(bone)) return 6 + side;
  if (/^(foot|ball)_/.test(bone)) return 8 + side;
  return 0;
}

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

async function buildOne(b: (typeof BODIES)[number], mods: { fit: Record<string, any>; bake: Record<string, any>; head: Record<string, any>; atlas: Record<string, any> }): Promise<void> {
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
  // ---- weld (the source atlas duplicates vertices along its chart borders), simplify with the head locked ----
  await MeshoptSimplifier.ready;
  const weldKey = new Map<string, number>();
  const weldOf = new Uint32Array(nAll);
  const wFirst: number[] = [];
  for (let i = 0; i < nAll; i++) {
    const k = `${Math.round((fit.positions[i * 3] as number) * 2e4)},${Math.round((fit.positions[i * 3 + 1] as number) * 2e4)},${Math.round((fit.positions[i * 3 + 2] as number) * 2e4)}`;
    let w = weldKey.get(k);
    if (w === undefined) { w = wFirst.length; wFirst.push(i); weldKey.set(k, w); }
    weldOf[i] = w;
  }
  const nW = wFirst.length;
  const wPos = new Float32Array(nW * 3), wNrm = new Float32Array(nW * 3);
  wFirst.forEach((o, i) => { for (let d = 0; d < 3; d++) { wPos[i * 3 + d] = fit.positions[o * 3 + d] as number; wNrm[i * 3 + d] = fit.normals[o * 3 + d] as number; } });
  const wIdx = new Uint32Array(fit.index.length);
  for (let i = 0; i < wIdx.length; i++) wIdx[i] = weldOf[fit.index[i] as number] as number;
  const lock = new Uint8Array(nW);
  for (let i = 0; i < nW; i++) if ((wPos[i * 3 + 1] as number) > 1.56 && Math.abs(wPos[i * 3] as number) < 0.13) lock[i] = 1;
  const [simp, err] = MeshoptSimplifier.simplifyWithAttributes(wIdx, wPos, 3, wNrm, 3, [0.02, 0.02, 0.02], lock, TARGET_TRIS * 3, 0.05, []);
  const keep = new Map<number, number>();
  const order: number[] = [];
  const sIdx = new Uint32Array(simp.length);
  for (let i = 0; i < simp.length; i++) {
    let v = keep.get(simp[i]!);
    if (v === undefined) { v = order.length; order.push(simp[i]!); keep.set(simp[i]!, v); }
    sIdx[i] = v;
  }
  const nS = order.length;
  const sPos = new Float32Array(nS * 3), sNrm = new Float32Array(nS * 3), sJnt = new Uint16Array(nS * 4), sWgt = new Float32Array(nS * 4), region = new Uint8Array(nS);
  order.forEach((w, i) => {
    const o = wFirst[w] as number;
    for (let d = 0; d < 3; d++) { sPos[i * 3 + d] = fit.positions[o * 3 + d] as number; sNrm[i * 3 + d] = fit.normals[o * 3 + d] as number; }
    let best = 0, bw = -1;
    for (let d = 0; d < 4; d++) { sJnt[i * 4 + d] = fit.joints[o * 4 + d] as number; sWgt[i * 4 + d] = fit.weights[o * 4 + d] as number; if ((fit.weights[o * 4 + d] as number) > bw) { bw = fit.weights[o * 4 + d] as number; best = fit.joints[o * 4 + d] as number; } }
    region[i] = regionOf(raw.boneNames[best] as string);
  });
  console.log(`[${b.id}] simplified to ${sIdx.length / 3} tris, ${nS} welded vertices (error ${err.toFixed(4)})`);

  // ---- new atlas, texture transfer ----
  const atlas = mods.atlas.buildAtlas({ positions: sPos, normals: sNrm, index: sIdx, region }, { size: ALBEDO, pad: 3, density: { 1: 1.7, 4: 1.3, 5: 1.3 }, minChartTris: 14 });
  console.log(`[${b.id}] atlas: ${atlas.charts} charts, ${atlas.index.length / 3} tris, ${atlas.source.length} vertices, ${atlas.texelsPerMetre.toFixed(0)} texels/m`);
  const baked = mods.atlas.bakeAtlas(atlas, { positions: fit.positions, index: fit.index, uv: uvAll, rgb: new Uint8Array(img.data), classes: cls.classes, size: S }, ALBEDO, 4);
  const mask = mods.bake.packMask(baked.classes, baked.covered, ALBEDO, MASK) as Uint8Array;
  const maskRgb = Buffer.alloc(MASK * MASK * 3);
  // channel B carries the iris (below the split height) and the brow (above); the packer keeps them apart as two channels
  for (let k = 0; k < MASK * MASK; k++) { maskRgb[k * 3] = mask[k * 4]!; maskRgb[k * 3 + 1] = mask[k * 4 + 1]!; maskRgb[k * 3 + 2] = Math.min(255, mask[k * 4 + 2]! + mask[k * 4 + 3]!); }
  const maskPng = await sharp(maskRgb, { raw: { width: MASK, height: MASK, channels: 3 } }).png({ compressionLevel: 9, effort: 10 }).toBuffer();
  const albedo = await sharp(Buffer.from(baked.rgb), { raw: { width: ALBEDO, height: ALBEDO, channels: 3 } }).webp({ quality: 88, effort: 6 }).toBuffer();
  const n = atlas.source.length;
  const pos = atlas.positions, nrm = atlas.normals, uv = atlas.uv, index = Uint16Array.from(atlas.index);
  const jnt = new Uint16Array(n * 4), wgt = new Float32Array(n * 4);
  atlas.source.forEach((s, i) => { for (let d = 0; d < 4; d++) { jnt[i * 4 + d] = sJnt[s * 4 + d] as number; wgt[i * 4 + d] = sWgt[s * 4 + d] as number; } });

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
      skinMean: cls.skinMean.map((v: number) => +v.toFixed(4)), clothLum: cls.clothLum.map((v: number) => +v.toFixed(5)),
      splitY: +(eyeY + 0.55 * (browY - eyeY)).toFixed(4), head,
    },
  });
  await bodyDoc.transform(prune());
  const file = `${OUT}/${b.id}.glb`;
  await io.write(file, bodyDoc);
  console.log(`[${b.id}] wrote ${file.replace(`${ROOT}/`, '')}: ${(statSync(file).size / 1024).toFixed(0)} kB (albedo ${(albedo.length / 1024).toFixed(0)} kB WebP ${ALBEDO}px, mask ${(maskPng.length / 1024).toFixed(0)} kB PNG ${MASK}px), ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

const mods = { fit: await load('src/characters/meshyFit.ts'), bake: await load('src/characters/meshyBake.ts'), head: await load('src/characters/headMap.ts'), atlas: await load('src/characters/meshyAtlas.ts') };
for (const b of BODIES) if (!only || only === b.frame) await buildOne(b, mods);
