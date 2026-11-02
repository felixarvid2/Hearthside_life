#!/usr/bin/env node
// PROTOTYPE (not used by the game): MakeHuman bodies made with MPFB (MakeHuman plugin for Blender), bound to the game's
// 65-joint UAL skeleton, as an alternative to the Meshy bodies (tools/build-meshy-bodies.mts).
//
//   npm run assets:mpfb                 (node --experimental-strip-types tools/build-mpfb-bodies.mts [--only=f|m] [--skip-blender] [--out=dir])
//
// 1. the joints of body_a.glb / body_b.glb are written to <out>/ual_{a,b}.json (m = frame a, f = frame b)
// 2. Blender (headless, MPFB installed, see tools/mpfb/README.md) runs tools/mpfb/build_body.py: human, rig weights, assets, morph
//    deltas and the retarget onto the UAL joints -> <out>/mpfb_{f,m}.json + .bin
// 3. this script simplifies the skin and underwear (meshoptimizer, the head locked), downsizes the textures and writes
//    <out>/mpfb_{f,m}.glb (floats) and .min.glb (meshopt-compressed, copied to public/assets/characters/mpfb_{f,m}.glb) on the
//    body GLB's skeleton (so the game's animation clips apply), plus a size report.
//
// Environment: BLENDER (default /opt/blender/blender), BLENDER_USER_RESOURCES (default /opt/mpfb/res; MPFB lives there).

import { NodeIO } from '@gltf-transform/core';
import type { Primitive } from '@gltf-transform/core';
import { EXTTextureWebP, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const only = arg('only');
const OUT = resolve(ROOT, arg('out') ?? 'dev/mpfb/out');
const BLENDER = process.env.BLENDER ?? '/opt/blender/blender';
const BODIES = [
  { sex: 'f', frame: 'b' },
  { sex: 'm', frame: 'a' },
] as const;

/** Triangle budget per primitive after simplification (the whole body stays under 15k). */
const TARGET = { skin: Number(process.env.MPFB_SKIN_TRIS ?? 10800), underwear: Number(process.env.MPFB_UNDERWEAR_TRIS ?? 2600) } as Record<string, number>;
const SKIN_PX = 1024;
const SMALL_PX = 256;

interface Acc { offset: number; count: number; components: number }
interface Prim { name: string; vertices: number; triangles: number; position: Acc; normal: Acc; uv: Acc; index: Acc; joints: Acc; weights: Acc; morphs: Record<string, Acc> }
interface Manifest { sex: string; ual: string[]; primitives: Prim[]; morphs: string[]; textures: Record<string, string>; licenses: Record<string, Record<string, string>>; style: unknown }

mkdirSync(OUT, { recursive: true });

// ---- 1. skeleton facts for Blender ----
const io = new NodeIO().registerExtensions([EXTTextureWebP, EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
for (const b of BODIES) {
  if (only && only !== b.sex) continue;
  const joints = (await io.read(`${ROOT}/public/assets/characters/body_${b.frame}.glb`)).getRoot().listSkins()[0]!.listJoints();
  writeFileSync(`${OUT}/ual_${b.frame}.json`, JSON.stringify(joints.map((j) => ({ name: j.getName(), parent: joints.includes(j.getParentNode() as never) ? j.getParentNode()!.getName() : null, pos: j.getWorldTranslation() }))));
}

// ---- 2. Blender ----
if (!process.argv.includes('--skip-blender')) {
  for (const b of BODIES) {
    if (only && only !== b.sex) continue;
    console.log(`[mpfb_${b.sex}] blender...`);
    execFileSync('nice', ['-n', '10', BLENDER, '-b', '--factory-startup', '-P', `${ROOT}/tools/mpfb/build_body.py`, '--', '--sex', b.sex, '--ual', `${OUT}/ual_${b.frame}.json`, '--out', OUT], {
      stdio: ['ignore', 'inherit', 'inherit'], env: { BLENDER_USER_RESOURCES: '/opt/mpfb/res', ...process.env, MPFB_OUT: OUT },
    });
  }
}

const headMod = (await runnerImport(`${ROOT}/src/characters/headMap.ts`)).module as Record<string, any>;
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

// ---- 3. GLB ----
const f32 = (buf: Buffer, a: Acc) => new Float32Array(buf.buffer.slice(buf.byteOffset + a.offset, buf.byteOffset + a.offset + a.count * a.components * 4));
const u32 = (buf: Buffer, a: Acc) => new Uint32Array(buf.buffer.slice(buf.byteOffset + a.offset, buf.byteOffset + a.offset + a.count * 4));
const u16 = (buf: Buffer, a: Acc) => new Uint16Array(buf.buffer.slice(buf.byteOffset + a.offset, buf.byteOffset + a.offset + a.count * a.components * 2));

interface Geo { pos: Float32Array; nrm: Float32Array; uv: Float32Array; jnt: Uint16Array; wgt: Float32Array; index: Uint32Array; morphs: Record<string, Float32Array> }

/** Simplifies a primitive's triangles (vertex subset kept, so normals, skin and morph deltas stay attached) and compacts the vertices. */
function simplify(g: Geo, targetTris: number, lockHead: boolean, joints: string[]): Geo {
  if (g.index.length / 3 <= targetTris) return g;
  const n = g.pos.length / 3;
  const lock = new Uint8Array(n);
  if (lockHead) for (let i = 0; i < n; i++) if ((g.pos[i * 3 + 1] as number) > 1.5 && Math.abs(g.pos[i * 3] as number) < 0.12) lock[i] = 1;
  // regions of the skin weights as vertex attributes: the simplifier then avoids merging across their borders (armpit webbing, the legs at the crotch)
  const regionOf = (j: string) => {
    const side = j.endsWith('_l') ? 'l' : j.endsWith('_r') ? 'r' : '';
    if (/^(clavicle|upperarm|lowerarm)/.test(j)) return `arm${side}`;
    if (/^(hand|thumb|index|middle|ring|pinky)/.test(j)) return `hand${side}`;
    if (/^(thigh|calf)/.test(j)) return `leg${side}`;
    if (/^(foot|ball)/.test(j)) return `foot${side}`;
    return j === 'Head' || j === 'neck_01' ? 'head' : 'torso';
  };
  const names = [...new Set(joints.map(regionOf))];
  const regionIndex = joints.map((j) => names.indexOf(regionOf(j)));
  const STRIDE = 5 + names.length;
  const attrs = new Float32Array(n * STRIDE);
  for (let i = 0; i < n; i++) {
    attrs.set([g.nrm[i * 3]!, g.nrm[i * 3 + 1]!, g.nrm[i * 3 + 2]!, g.uv[i * 2]!, g.uv[i * 2 + 1]!], i * STRIDE);
    for (let k = 0; k < 4; k++) attrs[i * STRIDE + 5 + regionIndex[g.jnt[i * 4 + k]!]!]! += g.wgt[i * 4 + k]!;
  }
  const [simp, err] = MeshoptSimplifier.simplifyWithAttributes(g.index, g.pos, 3, attrs, STRIDE, [0.02, 0.02, 0.02, 1, 1, ...names.map(() => 1.0)], lock, targetTris * 3, 0.05, ['LockBorder']);
  const keep = new Map<number, number>();
  const order: number[] = [];
  const index = new Uint32Array(simp.length);
  for (let i = 0; i < simp.length; i++) {
    let v = keep.get(simp[i]!);
    if (v === undefined) { v = order.length; order.push(simp[i]!); keep.set(simp[i]!, v); }
    index[i] = v;
  }
  const pick = (a: Float32Array | Uint16Array, k: number) => { const out = new (a.constructor as typeof Float32Array)(order.length * k); order.forEach((o, i) => { for (let d = 0; d < k; d++) out[i * k + d] = a[o * k + d]!; }); return out; };
  const morphs: Record<string, Float32Array> = {};
  for (const [m, d] of Object.entries(g.morphs)) morphs[m] = pick(d, 3) as Float32Array;
  console.log(`  simplified ${g.index.length / 3} -> ${index.length / 3} tris (error ${err.toFixed(4)}, ${lockHead ? 'head locked' : 'no lock'})`);
  return { pos: pick(g.pos, 3) as Float32Array, nrm: pick(g.nrm, 3) as Float32Array, uv: pick(g.uv, 2) as Float32Array, jnt: pick(g.jnt, 4) as unknown as Uint16Array, wgt: pick(g.wgt, 4) as Float32Array, index, morphs };
}

const png = (file: string) => sharp(file, { limitInputPixels: false });

async function build(b: (typeof BODIES)[number]): Promise<void> {
  const t0 = Date.now();
  const mf = JSON.parse(readFileSync(`${OUT}/mpfb_${b.sex}.json`, 'utf8')) as Manifest;
  const buf = readFileSync(`${OUT}/mpfb_${b.sex}.bin`);
  const doc = await io.read(`${ROOT}/public/assets/characters/body_${b.frame}.glb`);
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0]!;
  const node = root.listNodes().find((n) => n.getMesh())!;
  const oldMesh = node.getMesh()!;
  const jointNames = root.listSkins()[0]!.listJoints().map((j) => j.getName());
  if (jointNames.join() !== mf.ual.join()) throw new Error('joint order of the body GLB differs from the one Blender used');

  const acc = (type: 'VEC2' | 'VEC3' | 'VEC4' | 'SCALAR', array: Float32Array | Uint16Array | Uint32Array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const mesh = doc.createMesh(`mpfb_${b.sex}`);
  const geos: Record<string, Geo> = {};
  const stats: Record<string, number> = {};
  for (const p of mf.primitives) {
    let g: Geo = {
      pos: f32(buf, p.position), nrm: f32(buf, p.normal), uv: f32(buf, p.uv), jnt: u16(buf, p.joints), wgt: f32(buf, p.weights), index: u32(buf, p.index),
      morphs: Object.fromEntries(Object.entries(p.morphs).map(([m, a]) => [m, f32(buf, a)])),
    };
    console.log(`[mpfb_${b.sex}] ${p.name}: ${p.vertices} vertices, ${p.triangles} tris`);
    if (TARGET[p.name]) g = simplify(g, TARGET[p.name]!, p.name === 'skin', mf.ual);
    geos[p.name] = g;
    stats[p.name] = g.index.length / 3;
  }

  // materials: textures downsized from the MakeHuman 2-4k originals (WebP), skin tone left as painted (the game recolours it)
  // skin: mean colour over the texels the body covers, and the painted scalp repainted in the colour around it
  const { data: rgb, info } = await png(mf.textures.skin!).resize(SKIN_PX, SKIN_PX).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const masks = readFileSync(`${OUT}/mpfb_${b.sex}.uvmask.bin`);
  const N = SKIN_PX * SKIN_PX;
  const cover = masks.subarray(0, N), scalp = masks.subarray(N, 2 * N);
  const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const srgb = (c: number) => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
  const mean = [0, 0, 0];
  let nMean = 0;
  for (let i = 0; i < N; i++) if (cover[i] && !scalp[i]) { for (let c = 0; c < 3; c++) mean[c]! += lin(rgb[i * 3 + c]!); nMean++; }
  const skinMean = mean.map((v) => +(v / nMean).toFixed(4));
  // the repaint colour: mean of the covered, non-scalp texels within 14 px of the scalp
  const near = new Uint8Array(N);
  for (let y = 0; y < SKIN_PX; y++) for (let x = 0; x < SKIN_PX; x++) {
    if (!scalp[y * SKIN_PX + x]) continue;
    for (let dy = -14; dy <= 14; dy += 2) for (let dx = -14; dx <= 14; dx += 2) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < SKIN_PX && xx >= 0 && xx < SKIN_PX) near[yy * SKIN_PX + xx] = 1; }
  }
  const ring = [0, 0, 0];
  let nRing = 0;
  for (let i = 0; i < N; i++) if (near[i] && cover[i] && !scalp[i]) { for (let c = 0; c < 3; c++) ring[c]! += lin(rgb[i * 3 + c]!); nRing++; }
  const ringRgb = ring.map((v) => srgb(v / nRing));
  // soft mask: scalp, blurred; texels keep a share of their own detail
  const soft = await sharp(Buffer.from(scalp), { raw: { width: SKIN_PX, height: SKIN_PX, channels: 1 } }).blur(5).raw().toBuffer();
  for (let i = 0; i < N; i++) {
    const m = Math.min(1, (soft[i]! / 255) * 1.6);
    if (m <= 0) continue;
    for (let c = 0; c < 3; c++) {
      const o = rgb[i * 3 + c]!;
      rgb[i * 3 + c] = Math.round(o * (1 - m) + (o * 0.18 + ringRgb[c]! * 0.82) * m);
    }
  }
  console.log(`  skin mean ${JSON.stringify(skinMean)}, scalp repaint ${ringRgb}`);
  const skinTex = await sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } }).webp({ quality: 88, effort: 6 }).toBuffer();
  const eyeTex = await png(mf.textures.eyes!).resize(SMALL_PX, SMALL_PX).webp({ quality: 90 }).toBuffer();
  const browTex = await png(mf.textures.eyebrows!).resize(SMALL_PX, SMALL_PX).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
  const lashTex = await png(mf.textures.eyelashes!).resize(SMALL_PX, SMALL_PX).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
  const mat = (name: string, rough: number) => doc.createMaterial(name).setRoughnessFactor(rough).setMetallicFactor(0);
  const tex = (name: string, img: Buffer) => doc.createTexture(name).setImage(img).setMimeType('image/webp');
  const materials: Record<string, ReturnType<typeof mat>> = {
    skin: mat('mpfb_skin', 0.62).setBaseColorTexture(tex('skin', skinTex)),
    eyes: mat('mpfb_eyes', 0.15).setBaseColorTexture(tex('eyes', eyeTex)),
    eyebrows: mat('mpfb_brows', 0.8).setBaseColorTexture(tex('brows', browTex)).setAlphaMode('BLEND').setDoubleSided(true),
    eyelashes: mat('mpfb_lashes', 0.8).setBaseColorTexture(tex('lashes', lashTex)).setAlphaMode('BLEND').setDoubleSided(true),
    underwear: mat('mpfb_underwear', 0.85).setBaseColorFactor([0.8, 0.78, 0.76, 1]),
  };

  for (const p of mf.primitives) {
    const g = geos[p.name]!;
    const prim: Primitive = doc.createPrimitive().setMaterial(materials[p.name]!)
      .setAttribute('POSITION', acc('VEC3', g.pos)).setAttribute('NORMAL', acc('VEC3', g.nrm)).setAttribute('TEXCOORD_0', acc('VEC2', g.uv))
      .setAttribute('JOINTS_0', acc('VEC4', g.jnt)).setAttribute('WEIGHTS_0', acc('VEC4', g.wgt)).setIndices(acc('SCALAR', g.index));
    for (const m of mf.morphs) prim.addTarget(doc.createPrimitiveTarget(m).setAttribute('POSITION', acc('VEC3', g.morphs[m]!)));
    mesh.addPrimitive(prim);
  }
  mesh.setExtras({ targetNames: mf.morphs });
  mesh.setWeights(mf.morphs.map(() => 0));
  node.setMesh(mesh);
  oldMesh.dispose();

  // head data for the hair fit (same call as the Meshy build): eye line, brow line, crown, radius table of the real head
  const sk = geos.skin!;
  const meanY = (g: Geo) => { let s = 0; for (let i = 0; i < g.pos.length / 3; i++) s += g.pos[i * 3 + 1]!; return s / (g.pos.length / 3); };
  const eyeY = meanY(geos.eyes!), browY = meanY(geos.eyebrows!);
  let crownY = 0;
  for (let i = 0; i < sk.pos.length / 3; i++) if (Math.abs(sk.pos[i * 3]!) < 0.13) crownY = Math.max(crownY, sk.pos[i * 3 + 1]!);
  const head = headMod.meshyHeadInfo(sk.pos, sk.index, eyeY, browY, crownY);
  head.table.r = head.table.r.map((v: number) => +v.toFixed(4));
  node.setExtras({ mpfbBody: { version: 1, sex: b.sex, frame: b.frame, morphs: mf.morphs, skinMean, eyeY: +eyeY.toFixed(4), browY: +browY.toFixed(4), crownY: +crownY.toFixed(4), head, licenses: mf.licenses } });
  await doc.transform(prune());

  const file = `${OUT}/mpfb_${b.sex}.glb`;
  await io.write(file, doc);
  const sizes: Record<string, number> = { float: statSync(file).size };

  // size variants for the report: without morphs, and meshopt-compressed (needs the MeshoptDecoder in the loader)
  const noMorph = await io.readBinary(await io.writeBinary(doc));
  for (const m of noMorph.getRoot().listMeshes()) for (const p of m.listPrimitives()) for (const t of p.listTargets()) { p.removeTarget(t); t.dispose(); }
  await noMorph.transform(prune());
  sizes.noMorphs = (await io.writeBinary(noMorph)).byteLength;
  // meshopt compression with the filter method: the decoder returns plain float attributes (no KHR_mesh_quantization, whose
  // normalised positions would need a scaled skeleton root and so break the shared skeleton)
  const packed = await io.readBinary(await io.writeBinary(doc));
  await packed.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
  packed.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const packedBytes = await io.writeBinary(packed);
  sizes.meshopt = packedBytes.byteLength;
  writeFileSync(`${OUT}/mpfb_${b.sex}.min.glb`, packedBytes);
  // the compressed GLB is the one the viewer (dev/mpfb.html) loads
  copyFileSync(`${OUT}/mpfb_${b.sex}.min.glb`, `${ROOT}/public/assets/characters/mpfb_${b.sex}.glb`);
  const total = Object.values(stats).reduce((s, v) => s + v, 0);
  console.log(`[mpfb_${b.sex}] wrote ${file.replace(`${ROOT}/`, '')}: ${(sizes.float! / 1024).toFixed(0)} kB with ${mf.morphs.length} morphs, ${(sizes.noMorphs! / 1024).toFixed(0)} kB without, ${(sizes.meshopt! / 1024).toFixed(0)} kB meshopt; triangles ${JSON.stringify(stats)} = ${total}; ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  writeFileSync(`${OUT}/mpfb_${b.sex}.report.json`, JSON.stringify({ sizes, triangles: stats, total, licenses: mf.licenses, morphs: mf.morphs }, null, 1));
}

for (const b of BODIES) if (!only || only === b.sex) await build(b);
