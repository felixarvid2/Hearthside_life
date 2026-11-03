#!/usr/bin/env node
// MakeHuman bodies made with MPFB (MakeHuman plugin for Blender), bound to the game's
// 65-joint UAL skeleton (the alternative to the Meshy bodies of tools/build-meshy-bodies.mts).
//
//   npm run assets:mpfb                 (node --experimental-strip-types tools/build-mpfb-bodies.mts [--only=f|m] [--stage=adult,baby,...] [--skip-blender] [--out=dir] [--no-publish])
//
// Besides the adults (mpfb_{f,m}.glb) it builds the life stages: mpfb_baby.glb (one unisex body) and mpfb_{toddler,child,teen,elder}_{f,m}.glb.
// A stage body is the same format (tools/mpfb/README.md "Life stages"), bound to the adult's skeleton with every bone length scaled to
// the stage (the factors come from Blender's manifest): the clips play on it unchanged (rotations), the game scales their root and
// pelvis translation tracks. The youngAdult is the adult body with a younger face (made in the game from the face morphs).
//
// 1. the joints of body_a.glb / body_b.glb are written to <out>/ual_{a,b}.json (m = frame a, f = frame b)
// 2. Blender (headless, MPFB installed, see tools/mpfb/README.md) runs tools/mpfb/build_body.py: human, rig weights, assets, morph
//    deltas and the retarget onto the UAL joints -> <out>/mpfb_{f,m}.json + .bin
// 3. this script simplifies the skin and underwear (meshoptimizer, the head locked), downsizes the textures and writes
//    <out>/mpfb_{f,m}.glb (floats) and .min.glb (meshopt-compressed, copied to public/assets/characters/mpfb_{f,m}.glb unless
//    --no-publish) on the body GLB's skeleton (so the game's animation clips apply), plus a size report. The skin texture is made
//    neutral (flat colour, only fine detail kept), the eyes are split into a white sclera and a grey iris texture. The GLB format
//    (primitives, attributes, morphs, extras) is documented in tools/mpfb/README.md.
//
// Environment: BLENDER (default /opt/blender/blender), BLENDER_USER_RESOURCES (default /opt/mpfb/res; MPFB lives there).

import { NodeIO } from '@gltf-transform/core';
import type { Primitive, Skin } from '@gltf-transform/core';
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
const STAGE_ARG = arg('stage');
const OUT = resolve(ROOT, arg('out') ?? 'dev/mpfb/out');
const BLENDER = process.env.BLENDER ?? '/opt/blender/blender';
type Stage = 'adult' | 'baby' | 'toddler' | 'child' | 'teen' | 'elder';
interface Body { sex: 'f' | 'm'; frame: 'a' | 'b'; stage: Stage; stem: string }
const ADULTS: Body[] = [{ sex: 'f', frame: 'b', stage: 'adult', stem: 'mpfb_f' }, { sex: 'm', frame: 'a', stage: 'adult', stem: 'mpfb_m' }];
const STAGED: Body[] = [
  { sex: 'f', frame: 'b', stage: 'baby', stem: 'mpfb_baby' },
  ...(['toddler', 'child', 'teen', 'elder'] as const).flatMap((stage): Body[] => [
    { sex: 'f', frame: 'b', stage, stem: `mpfb_${stage}_f` }, { sex: 'm', frame: 'a', stage, stem: `mpfb_${stage}_m` }]),
];
const wantStages = STAGE_ARG ? STAGE_ARG.split(',') : ['adult', 'baby', 'toddler', 'child', 'teen', 'elder'];
const BODIES: Body[] = [...ADULTS, ...STAGED].filter((b) => wantStages.includes(b.stage) && (!only || only === b.sex));
/** Fraction of the height above which the skin is the head (kept at full resolution when simplifying). */
const HEAD_FRACTION: Record<Stage, number> = { adult: 0.83, baby: 0.72, toddler: 0.78, child: 0.8, teen: 0.82, elder: 0.83 };
/** Colour of the generated underwear (the game may override it): trunks, briefs for girls, a diaper. */
const UNDERWEAR_COLOUR = { trunks: [0.74, 0.78, 0.84], briefsF: [0.88, 0.72, 0.76], briefsM: [0.62, 0.74, 0.88], diaper: [0.95, 0.95, 0.93] } as const;

/** Triangle budget per primitive after simplification (the whole body stays under 15k). */
const TARGET = { skin: Number(process.env.MPFB_SKIN_TRIS ?? 10800), underwear: Number(process.env.MPFB_UNDERWEAR_TRIS ?? 2600) } as Record<string, number>;
const SKIN_PX = 1024;
const SMALL_PX = 256;

interface Acc { offset: number; count: number; components: number }
interface Prim { name: string; vertices: number; triangles: number; position: Acc; normal: Acc; uv: Acc; index: Acc; joints: Acc; weights: Acc; lips?: Acc; lock?: Acc; morphs: Record<string, Acc> }
interface Manifest { sex: string; stage: Stage; stem: string; height: number; underwear_mode: string | null; joint_scale: Record<string, number>; ual: string[]; primitives: Prim[]; morphs: string[]; face_morphs: string[]; textures: Record<string, string>; licenses: Record<string, Record<string, string>>; style: unknown; iris: { crop_px: number; centres_px: number[][] } }

mkdirSync(OUT, { recursive: true });

// ---- 1. skeleton facts for Blender ----
const io = new NodeIO().registerExtensions([EXTTextureWebP, EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
for (const b of [...ADULTS]) {
  const joints = (await io.read(`${ROOT}/public/assets/characters/body_${b.frame}.glb`)).getRoot().listSkins()[0]!.listJoints();
  writeFileSync(`${OUT}/ual_${b.frame}.json`, JSON.stringify(joints.map((j) => ({ name: j.getName(), parent: joints.includes(j.getParentNode() as never) ? j.getParentNode()!.getName() : null, pos: j.getWorldTranslation() }))));
}

// ---- 2. Blender ----
if (!process.argv.includes('--skip-blender')) {
  for (const b of BODIES) {
    console.log(`[${b.stem}] blender...`);
    execFileSync('nice', ['-n', '10', BLENDER, '-b', '--factory-startup', '-P', `${ROOT}/tools/mpfb/build_body.py`, '--', '--sex', b.sex, '--stage', b.stage, '--ual', `${OUT}/ual_${b.frame}.json`, '--out', OUT], {
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

interface Geo { pos: Float32Array; nrm: Float32Array; uv: Float32Array; jnt: Uint16Array; wgt: Float32Array; index: Uint32Array; morphs: Record<string, Float32Array>; lips?: Float32Array; lock?: Float32Array }

/** Morph deltas of the stage bodies are rounded to 1/8192 m (0.12 mm, far below what shows): the file compresses a good deal smaller. */
function roundDeltas(a: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = Math.round(a[i]! * 8192) / 8192;
  return out;
}

/** Simplifies a primitive's triangles (vertex subset kept, so normals, skin and morph deltas stay attached) and compacts the vertices. */
function simplify(g: Geo, targetTris: number, lockHead: boolean, joints: string[], headY = 1.5): Geo {
  if (g.index.length / 3 <= targetTris) return g;
  const n = g.pos.length / 3;
  const lock = new Uint8Array(n);
  if (lockHead) for (let i = 0; i < n; i++) if ((g.pos[i * 3 + 1] as number) > headY && Math.abs(g.pos[i * 3] as number) < 0.12) lock[i] = 1;
  if (g.lock) for (let i = 0; i < n; i++) if (g.lock[i]! > 0) lock[i] = 1; // the skin under the generated trunks stays as it is (they are cut out of it)
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
  const lips = g.lips ? (pick(g.lips, 1) as Float32Array) : undefined;
  console.log(`  simplified ${g.index.length / 3} -> ${index.length / 3} tris (error ${err.toFixed(4)}, ${lockHead ? 'head locked' : 'no lock'})`);
  return { pos: pick(g.pos, 3) as Float32Array, nrm: pick(g.nrm, 3) as Float32Array, uv: pick(g.uv, 2) as Float32Array, jnt: pick(g.jnt, 4) as unknown as Uint16Array, wgt: pick(g.wgt, 4) as Float32Array, index, morphs, lips };
}

const png = (file: string) => sharp(file, { limitInputPixels: false });


// ---------------------------------------------------------------------------------------------------------------------
// textures
// ---------------------------------------------------------------------------------------------------------------------
const LIN = Float32Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const toSrgb = (c: number) => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.min(1, c) ** (1 / 2.4) - 0.055));

/** Box blur (three passes, about a Gaussian of sigma 0.58 * r * sqrt(3)... close enough) of a one-channel float image. */
function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  let a = Float32Array.from(src);
  let b = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) { // horizontal
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))]!;
      for (let x = 0; x < w; x++) {
        b[y * w + x] = acc / (2 * r + 1);
        acc += a[y * w + Math.min(w - 1, x + r + 1)]! - a[y * w + Math.max(0, x - r)]!;
      }
    }
    for (let x = 0; x < w; x++) { // vertical
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x]!;
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * r + 1);
        acc += b[Math.min(h - 1, y + r + 1) * w + x]! - b[Math.max(0, y - r) * w + x]!;
      }
    }
  }
  return a;
}

/**
 * Skin texture of the MakeHuman skin made neutral: every texel keeps only its ratio to the local average (so pores, nostrils, ears,
 * nails and lips stay) and the large-scale colour, shading and blotches (red hands and knees, pink armpits, the tan of the hair cap
 * on the scalp) are replaced by one flat colour. The scalp keeps a fifth of the detail: it reads bald and clean. The game recolours
 * with `tone * texel / skinMean`, which is then a flat tone with fine detail whatever tone is picked.
 */
async function neutraliseSkin(file: string, cover: Buffer, scalp: Buffer, lips: Buffer): Promise<{ rgb: { data: Buffer; skinMean: number[] }; info: { width: number; height: number } }> {
  const W = SKIN_PX, N = W * W;
  const { data: raw } = await png(file).resize(W, W).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const lin = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) lin[i] = LIN[raw[i]!]!;
  const isCover = new Float32Array(N), isScalp = new Float32Array(N), isBody = new Float32Array(N);
  for (let i = 0; i < N; i++) { isCover[i] = cover[i] ? 1 : 0; isScalp[i] = scalp[i] ? 1 : 0; isBody[i] = cover[i] && !scalp[i] ? 1 : 0; }
  const mean = [0, 0, 0];
  let nMean = 0;
  for (let i = 0; i < N; i++) if (isBody[i]) { for (let c = 0; c < 3; c++) mean[c]! += lin[i * 3 + c]!; nMean++; }
  for (let c = 0; c < 3; c++) mean[c]! /= nMean;
  const R = 20; // local average radius in texels (3 box passes: sigma about 20)
  const denBody = blur(isBody, W, W, R), denScalp = blur(isScalp, W, W, R);
  const ratio = new Float32Array(N * 3).fill(1);
  for (let c = 0; c < 3; c++) {
    const ch = new Float32Array(N);
    for (let i = 0; i < N; i++) ch[i] = lin[i * 3 + c]! * isBody[i]!;
    const numBody = blur(ch, W, W, R);
    for (let i = 0; i < N; i++) ch[i] = lin[i * 3 + c]! * isScalp[i]!;
    const numScalp = blur(ch, W, W, R);
    for (let i = 0; i < N; i++) {
      if (!isCover[i]) continue;
      const low = isScalp[i] ? numScalp[i]! / Math.max(denScalp[i]!, 1e-4) : numBody[i]! / Math.max(denBody[i]!, 1e-4);
      let q = Math.min(2.2, Math.max(0.4, lin[i * 3 + c]! / Math.max(low, 1e-4)));
      q = isScalp[i] ? 1 + 0.2 * (q - 1) : q ** 0.85; // pores a little softer; the scalp nearly flat
      ratio[i * 3 + c] = q;
    }
  }
  // lips: a subtle rose, kept small because the game tints them itself with the `_LIPS` vertex weight
  const lipSoft = blur(Float32Array.from(lips, (v) => (v ? 1 : 0)), W, W, 2);
  const LIP = [1.01, 0.93, 0.95];
  for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) ratio[i * 3 + c]! *= 1 + (LIP[c]! - 1) * Math.min(1, lipSoft[i]! * 2);
  const out = Buffer.alloc(N * 3);
  const skinMean = [0, 0, 0];
  for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) {
    const v = Math.min(1, mean[c]! * ratio[i * 3 + c]!);
    out[i * 3 + c] = toSrgb(v);
    if (isBody[i]) skinMean[c]! += v;
  }
  return { rgb: { data: out, skinMean: skinMean.map((v) => +(v / nMean).toFixed(4)) }, info: { width: W, height: W } };
}

/** Eye texture without the iris (painted over with the sclera colour around it) and lightened: a white-ish eyeball. */
async function scleraTexture(file: string): Promise<Buffer> {
  const W = 1024;
  const { data } = await png(file).removeAlpha().resize(W, W).raw().toBuffer({ resolveWithObject: true });
  const centres = [[724, 305], [301, 719]];
  const out = Buffer.from(data);
  for (const [cx, cy] of centres) {
    const ring = [0, 0, 0];
    let n = 0;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx!, y - cy!);
      if (d > 132 && d < 165) { for (let c = 0; c < 3; c++) ring[c]! += data[(y * W + x) * 3 + c]!; n++; }
    }
    for (let y = Math.max(0, cy! - 160); y < Math.min(W, cy! + 160); y++) for (let x = Math.max(0, cx! - 160); x < Math.min(W, cx! + 160); x++) {
      const d = Math.hypot(x - cx!, y - cy!);
      const m = d < 138 ? 1 : d < 156 ? 1 - (d - 138) / 18 : 0;
      if (m > 0) for (let c = 0; c < 3; c++) out[(y * W + x) * 3 + c] = Math.round(out[(y * W + x) * 3 + c]! * (1 - m) + (ring[c]! / n) * m);
    }
  }
  // lighten: mean luminance of the eyeball discs -> 232, 25% towards grey (the MakeHuman sclera is pinkish)
  let sum = 0, cnt = 0;
  for (const [cx, cy] of centres) for (let y = cy! - 250; y < cy! + 250; y += 3) for (let x = cx! - 250; x < cx! + 250; x += 3) {
    if (x < 0 || y < 0 || x >= W || y >= W || Math.hypot(x - cx!, y - cy!) > 250) continue;
    sum += (out[(y * W + x) * 3]! + out[(y * W + x) * 3 + 1]! + out[(y * W + x) * 3 + 2]!) / 3; cnt++;
  }
  const k = Math.min(1.7, 232 / (sum / cnt));
  for (let i = 0; i < W * W; i++) {
    const g = (out[i * 3]! + out[i * 3 + 1]! + out[i * 3 + 2]!) / 3;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.min(255, Math.round((out[i * 3 + c]! * 0.75 + g * 0.25) * k));
  }
  return sharp(out, { raw: { width: W, height: W, channels: 3 } }).resize(SMALL_PX, SMALL_PX).webp({ quality: 90 }).toBuffer();
}

/**
 * Neutral grey iris: the MakeHuman iris (fibres, pupil, limbal ring) as luminance only, cropped around one eye so the whole square is
 * the iris (the primitive's UVs are remapped to it). `tint` is the colour that gives the original brown back (a baseColorFactor);
 * the game overrides it with the chosen eye colour.
 */
async function irisTexture(file: string, iris: Manifest['iris']): Promise<{ webp: Buffer; tint: number[] }> {
  const C = iris.crop_px, [cx, cy] = iris.centres_px[0]!;
  const { data } = await png(file).removeAlpha().resize(1024, 1024).extract({ left: cx! - C / 2, top: cy! - C / 2, width: C, height: C }).raw().toBuffer({ resolveWithObject: true });
  const lum = new Float32Array(C * C);
  const annulus: number[] = [];
  const meanLin = [0, 0, 0];
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
    const i = y * C + x;
    lum[i] = 0.2126 * LIN[data[i * 3]!]! + 0.7152 * LIN[data[i * 3 + 1]!]! + 0.0722 * LIN[data[i * 3 + 2]!]!;
    const d = Math.hypot(x - C / 2, y - C / 2);
    if (d > 38 && d < 108) { annulus.push(lum[i]!); for (let c = 0; c < 3; c++) meanLin[c]! += LIN[data[i * 3 + c]!]!; }
  }
  annulus.sort((a, b) => a - b);
  const p90 = annulus[Math.floor(annulus.length * 0.9)]!;
  const grey = new Float32Array(C * C);
  let meanGrey = 0;
  for (let i = 0; i < C * C; i++) grey[i] = Math.min(1, (lum[i]! / p90) * 0.9);
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { const d = Math.hypot(x - C / 2, y - C / 2); if (d > 38 && d < 108) meanGrey += grey[y * C + x]!; }
  meanGrey /= annulus.length;
  const out = Buffer.alloc(C * C * 3);
  for (let i = 0; i < C * C; i++) { const v = toSrgb(grey[i]!); out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = v; }
  const tint = meanLin.map((v) => Math.min(1, +(v / annulus.length / meanGrey).toFixed(4)));
  return { webp: await sharp(out, { raw: { width: C, height: C, channels: 3 } }).resize(256, 256).webp({ quality: 90 }).toBuffer(), tint };
}

/** Strip texture of the trunks (u 0.5, v = height over the garment): a darker waistband with a stitch line, a hem line. */
async function trunksTexture(): Promise<Buffer> {
  const H = 128, Wd = 4;
  const out = Buffer.alloc(Wd * H * 3);
  for (let y = 0; y < H; y++) {
    let v = 1;
    if (y < 15) v = 0.6; else if (y < 17) v = 0.9; else if (y >= H - 3) v = 0.88;
    for (let x = 0; x < Wd; x++) out.fill(toSrgb(v), (y * Wd + x) * 3, (y * Wd + x) * 3 + 3);
  }
  return sharp(out, { raw: { width: Wd, height: H, channels: 3 } }).webp({ lossless: true }).toBuffer();
}

/** General 4x4 inverse (column-major, as glTF). */
function invert4(m: ArrayLike<number>): number[] {
  const a = Array.from(m);
  const inv = new Array<number>(16);
  inv[0] = a[5]! * a[10]! * a[15]! - a[5]! * a[11]! * a[14]! - a[9]! * a[6]! * a[15]! + a[9]! * a[7]! * a[14]! + a[13]! * a[6]! * a[11]! - a[13]! * a[7]! * a[10]!;
  inv[4] = -a[4]! * a[10]! * a[15]! + a[4]! * a[11]! * a[14]! + a[8]! * a[6]! * a[15]! - a[8]! * a[7]! * a[14]! - a[12]! * a[6]! * a[11]! + a[12]! * a[7]! * a[10]!;
  inv[8] = a[4]! * a[9]! * a[15]! - a[4]! * a[11]! * a[13]! - a[8]! * a[5]! * a[15]! + a[8]! * a[7]! * a[13]! + a[12]! * a[5]! * a[11]! - a[12]! * a[7]! * a[9]!;
  inv[12] = -a[4]! * a[9]! * a[14]! + a[4]! * a[10]! * a[13]! + a[8]! * a[5]! * a[14]! - a[8]! * a[6]! * a[13]! - a[12]! * a[5]! * a[10]! + a[12]! * a[6]! * a[9]!;
  inv[1] = -a[1]! * a[10]! * a[15]! + a[1]! * a[11]! * a[14]! + a[9]! * a[2]! * a[15]! - a[9]! * a[3]! * a[14]! - a[13]! * a[2]! * a[11]! + a[13]! * a[3]! * a[10]!;
  inv[5] = a[0]! * a[10]! * a[15]! - a[0]! * a[11]! * a[14]! - a[8]! * a[2]! * a[15]! + a[8]! * a[3]! * a[14]! + a[12]! * a[2]! * a[11]! - a[12]! * a[3]! * a[10]!;
  inv[9] = -a[0]! * a[9]! * a[15]! + a[0]! * a[11]! * a[13]! + a[8]! * a[1]! * a[15]! - a[8]! * a[3]! * a[13]! - a[12]! * a[1]! * a[11]! + a[12]! * a[3]! * a[9]!;
  inv[13] = a[0]! * a[9]! * a[14]! - a[0]! * a[10]! * a[13]! - a[8]! * a[1]! * a[14]! + a[8]! * a[2]! * a[13]! + a[12]! * a[1]! * a[10]! - a[12]! * a[2]! * a[9]!;
  inv[2] = a[1]! * a[6]! * a[15]! - a[1]! * a[7]! * a[14]! - a[5]! * a[2]! * a[15]! + a[5]! * a[3]! * a[14]! + a[13]! * a[2]! * a[7]! - a[13]! * a[3]! * a[6]!;
  inv[6] = -a[0]! * a[6]! * a[15]! + a[0]! * a[7]! * a[14]! + a[4]! * a[2]! * a[15]! - a[4]! * a[3]! * a[14]! - a[12]! * a[2]! * a[7]! + a[12]! * a[3]! * a[6]!;
  inv[10] = a[0]! * a[5]! * a[15]! - a[0]! * a[7]! * a[13]! - a[4]! * a[1]! * a[15]! + a[4]! * a[3]! * a[13]! + a[12]! * a[1]! * a[7]! - a[12]! * a[3]! * a[5]!;
  inv[14] = -a[0]! * a[5]! * a[14]! + a[0]! * a[6]! * a[13]! + a[4]! * a[1]! * a[14]! - a[4]! * a[2]! * a[13]! - a[12]! * a[1]! * a[6]! + a[12]! * a[2]! * a[5]!;
  inv[3] = -a[1]! * a[6]! * a[11]! + a[1]! * a[7]! * a[10]! + a[5]! * a[2]! * a[11]! - a[5]! * a[3]! * a[10]! - a[9]! * a[2]! * a[7]! + a[9]! * a[3]! * a[6]!;
  inv[7] = a[0]! * a[6]! * a[11]! - a[0]! * a[7]! * a[10]! - a[4]! * a[2]! * a[11]! + a[4]! * a[3]! * a[10]! + a[8]! * a[2]! * a[7]! - a[8]! * a[3]! * a[6]!;
  inv[11] = -a[0]! * a[5]! * a[11]! + a[0]! * a[7]! * a[9]! + a[4]! * a[1]! * a[11]! - a[4]! * a[3]! * a[9]! - a[8]! * a[1]! * a[7]! + a[8]! * a[3]! * a[5]!;
  inv[15] = a[0]! * a[5]! * a[10]! - a[0]! * a[6]! * a[9]! - a[4]! * a[1]! * a[10]! + a[4]! * a[2]! * a[9]! + a[8]! * a[1]! * a[6]! - a[8]! * a[2]! * a[5]!;
  const det = a[0]! * inv[0]! + a[1]! * inv[4]! + a[2]! * inv[8]! + a[3]! * inv[12]!;
  return inv.map((v) => v / det);
}

/**
 * The stage's skeleton: every joint's local translation is scaled by its factor (directions and rest rotations stay, so a clip's
 * rotation tracks play unchanged), then the skin's inverse bind matrices are recomputed from the world matrices.
 */
function scaleSkeleton(skin: Skin, scale: Record<string, number>): void {
  const joints = skin.listJoints();
  for (const j of joints) {
    const k = scale[j.getName()] ?? 1;
    const t = j.getTranslation();
    j.setTranslation([t[0] * k, t[1] * k, t[2] * k]);
  }
  const ibm = skin.getInverseBindMatrices()!;
  const out = new Float32Array(joints.length * 16);
  joints.forEach((j, i) => out.set(invert4(j.getWorldMatrix()), i * 16));
  ibm.setArray(out);
}

async function build(b: Body): Promise<void> {
  const t0 = Date.now();
  let irisTint: number[] = [1, 1, 1];
  const mf = JSON.parse(readFileSync(`${OUT}/${b.stem}.json`, 'utf8')) as Manifest;
  const buf = readFileSync(`${OUT}/${b.stem}.bin`);
  const doc = await io.read(`${ROOT}/public/assets/characters/body_${b.frame}.glb`);
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0]!;
  const node = root.listNodes().find((n) => n.getMesh())!;
  const oldMesh = node.getMesh()!;
  const jointNames = root.listSkins()[0]!.listJoints().map((j) => j.getName());
  if (jointNames.join() !== mf.ual.join()) throw new Error('joint order of the body GLB differs from the one Blender used');
  if (b.stage !== 'adult') scaleSkeleton(root.listSkins()[0]!, mf.joint_scale);

  const acc = (type: 'VEC2' | 'VEC3' | 'VEC4' | 'SCALAR', array: Float32Array | Uint16Array | Uint32Array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const mesh = doc.createMesh(b.stem);
  const geos: Record<string, Geo> = {};
  const stats: Record<string, number> = {};
  for (const p of mf.primitives) {
    let g: Geo = {
      pos: f32(buf, p.position), nrm: f32(buf, p.normal), uv: f32(buf, p.uv), jnt: u16(buf, p.joints), wgt: f32(buf, p.weights), index: u32(buf, p.index),
      lips: p.lips ? f32(buf, p.lips) : undefined, lock: p.lock ? f32(buf, p.lock) : undefined,
      morphs: Object.fromEntries(Object.entries(p.morphs).map(([m, a]) => [m, b.stage === 'adult' ? f32(buf, a) : roundDeltas(f32(buf, a))])),
    };
    console.log(`[${b.stem}] ${p.name}: ${p.vertices} vertices, ${p.triangles} tris`);
    if (TARGET[p.name]) g = simplify(g, TARGET[p.name]!, p.name === 'skin', mf.ual, b.stage === 'adult' ? 1.5 : mf.height * HEAD_FRACTION[b.stage]);
    geos[p.name] = g;
    stats[p.name] = g.index.length / 3;
  }

  // materials: textures downsized from the MakeHuman 2-4k originals (WebP). The skin is made neutral: one flat colour with only the fine
  // detail of the original left, so the game's tone shader (divide by skinMean, multiply by the tone) gives clean light to dark skins.
  const masks = readFileSync(`${OUT}/${b.stem}.uvmask.bin`);
  const N = SKIN_PX * SKIN_PX;
  const { rgb: skinRgb, info: skinInfo } = await neutraliseSkin(mf.textures.skin!, masks.subarray(0, N), masks.subarray(N, 2 * N), masks.subarray(2 * N, 3 * N));
  const skinTex = await sharp(skinRgb.data, { raw: { width: skinInfo.width, height: skinInfo.height, channels: 3 } }).webp({ quality: 86, effort: 6 }).toBuffer();
  const skinMean = skinRgb.skinMean;
  console.log(`  skin mean ${JSON.stringify(skinMean)} (linear)`);
  const eyeTex = await scleraTexture(mf.textures.eyes!);
  const irisT = await irisTexture(mf.textures.eyes!, mf.iris);
  irisTint = irisT.tint;
  const browTex = await png(mf.textures.eyebrows!).resize(SMALL_PX, SMALL_PX).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
  const lashTex = await png(mf.textures.eyelashes!).resize(SMALL_PX, SMALL_PX).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
  const trunkTex = await trunksTexture();
  const mat = (name: string, rough: number) => doc.createMaterial(name).setRoughnessFactor(rough).setMetallicFactor(0);
  const tex = (name: string, img: Buffer) => doc.createTexture(name).setImage(img).setMimeType('image/webp');
  const materials: Record<string, ReturnType<typeof mat>> = {
    skin: mat('mpfb_skin', 0.62).setBaseColorTexture(tex('skin', skinTex)),
    eyes: mat('mpfb_eyes', 0.15).setBaseColorTexture(tex('eyes', eyeTex)),
    iris: mat('mpfb_iris', 0.15).setBaseColorTexture(tex('iris', irisT.webp)).setBaseColorFactor([...irisT.tint, 1]),
    eyebrows: mat('mpfb_brows', 0.8).setBaseColorTexture(tex('brows', browTex)).setAlphaMode('BLEND').setDoubleSided(true),
    eyelashes: mat('mpfb_lashes', 0.8).setBaseColorTexture(tex('lashes', lashTex)).setAlphaMode('BLEND').setDoubleSided(true),
    underwear: mf.underwear_mode
      ? mat('mpfb_underwear', 0.85).setBaseColorTexture(tex('trunks', trunkTex)).setBaseColorFactor([...(mf.underwear_mode === 'diaper' ? UNDERWEAR_COLOUR.diaper : mf.underwear_mode === 'briefs' ? (b.sex === 'f' ? UNDERWEAR_COLOUR.briefsF : UNDERWEAR_COLOUR.briefsM) : UNDERWEAR_COLOUR.trunks), 1])
      : mat('mpfb_underwear', 0.85).setBaseColorFactor([0.8, 0.78, 0.76, 1]),
  };

  for (const p of mf.primitives) {
    const g = geos[p.name]!;
    const prim: Primitive = doc.createPrimitive().setMaterial(materials[p.name]!)
      .setAttribute('POSITION', acc('VEC3', g.pos)).setAttribute('NORMAL', acc('VEC3', g.nrm)).setAttribute('TEXCOORD_0', acc('VEC2', g.uv))
      .setAttribute('JOINTS_0', acc('VEC4', g.jnt)).setAttribute('WEIGHTS_0', acc('VEC4', g.wgt)).setIndices(acc('SCALAR', g.index));
    if (g.lips) prim.setAttribute('_LIPS', acc('SCALAR', g.lips));
    for (const m of mf.morphs) {
      const a = acc('VEC3', g.morphs[m]!);
      if (mf.face_morphs.includes(m)) a.setSparse(true); // face morphs touch the head only
      prim.addTarget(doc.createPrimitiveTarget(m).setAttribute('POSITION', a));
    }
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
  const bodyMorphs = mf.morphs.filter((m) => !mf.face_morphs.includes(m));
  node.setExtras({ mpfbBody: { version: 1, format: 2, sex: b.sex, frame: b.frame, morphs: mf.morphs, bodyMorphs, faceMorphs: mf.face_morphs,
    morphRange: { body: [0, 1], face: [-1, 1] }, sliderGain: { weight_up: 3, weight_down: 3, muscle_up: 2, muscle_down: 2 },
    iris: { primitive: 'iris', material: 'mpfb_iris', tint: irisTint, texture: 'neutral grey, multiplied by the material colour' },
    lips: { attribute: '_LIPS', primitive: 'skin', range: [0, 1] },
    underwear: { female: 'wolgade_female_panties_01 + wolgade_female_top_01 (CC0)', male: 'generated trunks (CC0), cut out of the skin mesh' },
    skin: 'neutral: flat colour with fine detail only; skinMean is the linear mean of the texture over the body',
    skinMean, eyeY: +eyeY.toFixed(4), browY: +browY.toFixed(4), crownY: +crownY.toFixed(4), head, licenses: mf.licenses } });
  await doc.transform(prune());

  const file = `${OUT}/${b.stem}.glb`;
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
  writeFileSync(`${OUT}/${b.stem}.min.glb`, packedBytes);
  // the compressed GLB is the one the viewer (dev/mpfb.html) loads
  if (!process.argv.includes('--no-publish')) copyFileSync(`${OUT}/${b.stem}.min.glb`, `${ROOT}/public/assets/characters/${b.stem}.glb`);
  const total = Object.values(stats).reduce((s, v) => s + v, 0);
  console.log(`[${b.stem}] wrote ${file.replace(`${ROOT}/`, '')}: ${(sizes.float! / 1024).toFixed(0)} kB with ${mf.morphs.length} morphs, ${(sizes.noMorphs! / 1024).toFixed(0)} kB without, ${(sizes.meshopt! / 1024).toFixed(0)} kB meshopt; triangles ${JSON.stringify(stats)} = ${total}; ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  writeFileSync(`${OUT}/${b.stem}.report.json`, JSON.stringify({ sizes, triangles: stats, total, licenses: mf.licenses, morphs: mf.morphs }, null, 1));
}

for (const b of BODIES) await build(b);
