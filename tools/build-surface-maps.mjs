#!/usr/bin/env node
// Turns the raw AI-generated surface sources (dev/surfaces-ai/raw/, fetched by dev/surfaces-ai/generate.mjs)
// into the images the renderer reads (src/render/textures/surfaceMaps.ts):
//
//   material  public/assets/surfaces/<id>.webp          512 px greyscale detail map the palette tints
//   motif     public/assets/surfaces/motifs/<id>.webp   256 px coverage mask (255 = ink) of one isolated motif
//   mural     public/assets/surfaces/murals/<id>.webp   1024 x 512 greyscale scene, seamless along x
//
// Material, per map: grey -> optional rotation and centre crop -> 512 px -> illumination flatten (the generator
// bakes in soft vignettes) -> seamless via offset-and-blend (variance preserving) -> normalise to mean 0.5 and a chosen
// standard deviation, so that 0.5 maps to the palette base colour, 0 to its dark and 1 to its light colour.
// The 14 original maps keep the option table MAPS below; new materials use GENERIC_MATERIAL unless their source
// entry gives `build: {...}`.
// Motif: soft threshold to a coverage mask -> must be isolated (see surface-checks.mjs) -> crop to the ink box,
// pad to a square with a 4 % margin -> 256 px.
// Mural: grey -> flatten lightly -> normalise -> seamless along x -> 1024 x 512.
//
// Only sources whose raw file exists are processed, and nothing in public/ is ever deleted. Afterwards
// src/render/textures/surfaceMapIds.generated.ts is rewritten from what is in public/, so it is right even when
// raw files are missing.
//
// Usage: node tools/build-surface-maps.mjs [id ...] [--group walls-a]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { GROUPS, rawFile } from '../dev/surfaces-ai/generate.mjs';
import {
  GENERIC_MATERIAL, MOTIF_PX, MURAL_H, MURAL_W, coverageMask, inkBox, motifCheck, squareMotif,
} from './surface-checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'assets', 'surfaces');
const OUT_MOTIFS = path.join(OUT, 'motifs');
const OUT_MURALS = path.join(OUT, 'murals');
const IDS_FILE = path.join(ROOT, 'src', 'render', 'textures', 'surfaceMapIds.generated.ts');
const N = 512;

/** id -> processing options of the 14 original maps. `src` defaults to the id (a raw/<src>.jpg file). */
export const MAPS = {
  // floors
  // three whole boards (raw rows 201..826 run seam to seam), so the vertical period is three boards; blended along x only
  'grain-oak': { rows: [201, 826], cols: [0, 625], seamless: 'x', std: 0.15 },
  'grain-barn': { std: 0.17, flatten: 1, drift: 1, driftSigma: 70 },
  'stone-marble': { std: 0.2, drift: 0.5 },
  'stone-slate': { src: 'floor-slate', std: 0.2, drift: 0.3 },
  'fibre-berber': { src: 'floor-berber', std: 0.2, flatten: 0.9, drift: 1, driftSigma: 70 },
  'fibre-sisal': { std: 0.17 },
  'concrete-aggregate': { std: 0.2 },
  'gravel': { src: 'floor-gravel', std: 0.2 },
  'lawn': { src: 'floor-grass', std: 0.17, flatten: 1, drift: 1, driftSigma: 70 },
  // walls
  'plaster-rough': { src: 'wall-roughcast', crop: 0.8, std: 0.1, flatten: 1 },
  'grasscloth': { src: 'wall-grasscloth', std: 0.14 },
  'rubble-stone': { src: 'wall-rubble', std: 0.2, drift: 0.3 },
  'slate-ledge': { src: 'wall-slate', std: 0.2, drift: 0.3 },
  'concrete-board': { src: 'wall-concrete', crop: 0.72, std: 0.15, flatten: 1 },
};

function smooth(t) { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); }

async function loadGrey(file, o) {
  let img = sharp(file).greyscale();
  const meta = await img.metadata();
  let w = meta.width, h = meta.height;
  if (o.rotate) { const buf = await img.rotate(o.rotate).toBuffer(); img = sharp(buf); }
  if (o.rows && o.cols) {
    const buf = await img.extract({ left: o.cols[0], top: o.rows[0], width: o.cols[1] - o.cols[0], height: o.rows[1] - o.rows[0] }).toBuffer();
    img = sharp(buf);
  } else if (o.crop && o.crop < 1) {
    const side = Math.round(Math.min(w, h) * o.crop);
    const off = Math.round((Math.min(w, h) - side) / 2);
    const buf = await img.extract({ left: off, top: off, width: side, height: side }).toBuffer();
    img = sharp(buf);
  }
  const { data } = await img.resize(N, N, { kernel: 'lanczos3', fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  return Float32Array.from(data, (v) => v / 255);
}

// sharp returns THREE identical channels from blur() of a raw one-channel image. The 14 original maps were built
// reading that buffer as if it had one channel (a distorted illumination field, but their look is fixed now), so they
// keep it (`legacy`); everything new takes the first channel only.
async function blurred(lum, sigma, W = N, H = N, legacy = false) {
  const buf = Buffer.from(Uint8Array.from(lum, (v) => Math.round(Math.min(1, Math.max(0, v)) * 255)));
  let img = sharp(buf, { raw: { width: W, height: H, channels: 1 } }).blur(sigma);
  if (!legacy) img = img.extractChannel(0);
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  return Float32Array.from(data, (v) => v / 255);
}

/** Gaussian blur that wraps around the edges (the map is a repeating tile): blur a 3 x 3 tiling, keep the middle. */
async function blurWrapped(lum, sigma, legacy = false) {
  const W = N * 3;
  const big = new Uint8Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) big[y * W + x] = Math.round(Math.min(1, Math.max(0, lum[(y % N) * N + (x % N)])) * 255);
  let img = sharp(Buffer.from(big), { raw: { width: W, height: W, channels: 1 } }).blur(sigma);
  if (!legacy) img = img.extractChannel(0);
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[y * N + x] = data[(y + N) * W + (x + N)] / 255;
  return out;
}

function mean(a) { let s = 0; for (const v of a) s += v; return s / a.length; }
function stdev(a, m) { let s = 0; for (const v of a) s += (v - m) * (v - m); return Math.sqrt(s / a.length); }

/**
 * Offset-and-blend, one axis at a time (a product mask would show the shifted copy's own seam where it meets
 * the border): the edges come from the half-shifted copy, so opposite edges become neighbours. The mix is
 * variance preserving, so the blended band keeps the contrast of the rest (`linear` = a plain cross-fade, for
 * scenes whose structure is correlated across the shift). Works on a W x H image (default N x N).
 */
function makeSeamless(lum, axes = 'xy', band = 0.38, W = N, H = N, linear = false) {
  const pass = (src, axis) => {
    const size = axis === 'x' ? W : H;
    const ramp = (i) => smooth(Math.min(i, size - 1 - i) / (band * size));
    const m = mean(src);
    const out = new Float32Array(src.length);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const w = ramp(axis === 'x' ? x : y);
        const a = src[y * W + x];
        const b = axis === 'x' ? src[y * W + ((x + W / 2) % W)] : src[((y + H / 2) % H) * W + x];
        out[y * W + x] = linear ? w * a + (1 - w) * b : m + (w * (a - m) + (1 - w) * (b - m)) / Math.sqrt(w * w + (1 - w) * (1 - w));
      }
    }
    return out;
  };
  let out = lum;
  if (axes.includes('x')) out = pass(out, 'x');
  if (axes.includes('y')) out = pass(out, 'y');
  return out;
}

const dbg = (tag, lum) => {
  if (!process.env.SURF_DEBUG) return;
  const rows = [250, 254, 255, 256, 257, 258, 262].map((y) => { let t = 0; for (let x = 0; x < N; x++) t += lum[y * N + x]; return (t / N).toFixed(3); });
  console.log(tag, rows.join(' '));
};

const kb = (file) => `${(fs.statSync(file).size / 1024).toFixed(1)} kB`;

/** WebP quality for new maps: the highest of the steps that keeps the file at or below `maxBytes`. */
async function encodeWithin(raw, W, H, channels, file, steps, maxBytes) {
  let buf = null;
  for (const quality of steps) {
    buf = await sharp(raw, { raw: { width: W, height: H, channels } }).webp({ quality, effort: 6 }).toBuffer();
    if (buf.length <= maxBytes) break;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

async function buildMaterial(id, o, srcFile, fixedQuality) {
  let lum = await loadGrey(srcFile, o);
  dbg('raw', lum);
  const flatten = o.flatten ?? 0.8;
  if (flatten > 0) {
    const bl = await blurred(lum, 60, N, N, o.legacyBlur);
    const m = mean(lum);
    lum = lum.map((v, i) => v - flatten * (bl[i] - m));
  }
  dbg('flat', lum);
  if (o.seamless !== false) lum = makeSeamless(lum, o.seamless === 'x' ? 'x' : 'xy');
  dbg('seam', lum);
  // the blend leaves slow brightness drift between its quadrants: remove it with a wrap-around high-pass
  const drift = o.drift ?? 0.8;
  if (drift > 0 && o.seamless !== false) {
    const bl = await blurWrapped(lum, o.driftSigma ?? 48, o.legacyBlur);
    const m0 = mean(lum);
    lum = lum.map((v, i) => v - drift * (bl[i] - m0));
  }
  const m = mean(lum), sd = stdev(lum, m) || 1;
  const std = o.std ?? 0.17;
  const out = new Uint8Array(lum.length);
  for (let i = 0; i < lum.length; i++) out[i] = Math.round(Math.min(1, Math.max(0, 0.5 + ((lum[i] - m) / sd) * std)) * 255);
  const file = path.join(OUT, `${id}.webp`);
  if (fixedQuality) {
    fs.mkdirSync(OUT, { recursive: true });
    await sharp(Buffer.from(out), { raw: { width: N, height: N, channels: 1 } }).webp({ quality: fixedQuality, effort: 6 }).toFile(file);
  } else {
    // about 40-70 kB per map
    await encodeWithin(Buffer.from(out), N, N, 1, file, [82, 76, 70, 64, 58, 52, 46, 40], 70 * 1024);
  }
  console.log(`material ${id}`, kb(file));
}

async function buildMotif(id, srcFile) {
  const { data, info } = await sharp(srcFile).greyscale().raw().toBuffer({ resolveWithObject: true });
  const mask = coverageMask(data);
  const check = motifCheck(mask, info.width, info.height);
  if (!check.ok) { console.warn(`WARNING motif ${id} rejected: ${check.reason}`); return; }
  const box = inkBox(mask, info.width, info.height);
  if (!box) { console.warn(`WARNING motif ${id} rejected: no ink`); return; }
  const { side, data: sq } = squareMotif(mask, info.width, box);
  const file = path.join(OUT_MOTIFS, `${id}.webp`);
  fs.mkdirSync(OUT_MOTIFS, { recursive: true });
  const png = await sharp(Buffer.from(sq), { raw: { width: side, height: side, channels: 1 } })
    .resize(MOTIF_PX, MOTIF_PX, { kernel: 'lanczos3', fit: 'fill' }).extractChannel(0).raw().toBuffer();
  await sharp(png, { raw: { width: MOTIF_PX, height: MOTIF_PX, channels: 1 } }).webp({ quality: 92, effort: 6 }).toFile(file);
  console.log(`motif ${id}`, kb(file), `ink ${(check.coverage * 100).toFixed(1)} %`);
}

async function buildMural(id, o, srcFile) {
  const meta = await sharp(srcFile).metadata();
  // painted scenes often carry a small signature in the bottom corner: trim a strip off the bottom by default
  const cropBottom = o.cropBottom ?? 0.04;
  const height = Math.round(meta.height * (1 - cropBottom));
  const { data } = await sharp(srcFile).greyscale()
    .extract({ left: 0, top: 0, width: meta.width, height })
    .resize(MURAL_W, MURAL_H, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let lum = Float32Array.from(data, (v) => v / 255);
  const flatten = o.flatten ?? 0.25;
  if (flatten > 0) {
    const bl = await blurred(lum, 80, MURAL_W, MURAL_H);
    const m = mean(lum);
    lum = lum.map((v, i) => v - flatten * (bl[i] - m));
  }
  lum = makeSeamless(lum, 'x', o.band ?? 0.12, MURAL_W, MURAL_H, true);
  // normalise: the 1st..99th percentile span fills 0.04..0.96, so the tritone tint uses its whole range
  const sorted = Float32Array.from(lum).sort();
  const lo = sorted[Math.floor(sorted.length * 0.01)], hi = sorted[Math.floor(sorted.length * 0.99)];
  const span = Math.max(1e-3, hi - lo);
  const out = new Uint8Array(lum.length);
  for (let i = 0; i < lum.length; i++) out[i] = Math.round(Math.min(1, Math.max(0, 0.04 + ((lum[i] - lo) / span) * 0.92)) * 255);
  const file = path.join(OUT_MURALS, `${id}.webp`);
  await encodeWithin(Buffer.from(out), MURAL_W, MURAL_H, 1, file, [80, 72, 64, 56, 48], 110 * 1024);
  console.log(`mural ${id}`, kb(file));
}

/** Every source: the 14 original maps, then the group files' entries (an id in MAPS keeps its table entry). */
async function sources(groups) {
  const list = [];
  for (const [id, o] of Object.entries(MAPS)) list.push({ id, kind: 'material', opts: { ...o, legacyBlur: true }, fixed: 78, file: rawFile(o.src ?? id), group: 'base' });
  for (const g of groups) {
    const mod = await import(pathToFileURL(path.join(ROOT, 'dev', 'surfaces-ai', 'sources', `${g}.mjs`)).href);
    for (const s of mod.default) {
      if (MAPS[s.id]) continue;
      list.push({ id: s.id, kind: s.kind, opts: { ...GENERIC_MATERIAL, ...(s.build ?? {}) }, fixed: 0, file: rawFile(s.id), group: g });
    }
  }
  return list;
}

const listIds = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort() : []);

/** Rewrites the id lists from what is in public/ (so they are right even when raw sources are missing). */
export function writeIds() {
  const q = (a) => `[\n${a.map((x) => `  '${x}',`).join('\n')}\n]`;
  const text = `// GENERATED by tools/build-surface-maps.mjs (npm run assets:surfaces) from public/assets/surfaces. Do not edit.
// Material detail maps, motif masks and murals that exist as image files.

export const MATERIAL_MAP_IDS = ${q(listIds(OUT))} as const;
export const MOTIF_IDS: readonly string[] = ${q(listIds(OUT_MOTIFS))};
export const MURAL_IDS: readonly string[] = ${q(listIds(OUT_MURALS))};
`;
  fs.writeFileSync(IDS_FILE, text);
  console.log('wrote', path.relative(ROOT, IDS_FILE));
}

async function main() {
  const args = process.argv.slice(2);
  const gi = args.indexOf('--group');
  const group = gi >= 0 ? args[gi + 1] : null;
  const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--group');
  const all = await sources(group ? [group] : GROUPS);
  // `--group g` builds that group alone (the 14 original maps are only built when named)
  const todo = all.filter((s) => (group ? s.group === group : true) && (!only.length || only.includes(s.id)));
  for (const s of todo) {
    if (!s.file) { if (only.length || group) console.error('missing raw for', s.id); continue; }
    if (s.kind === 'motif') await buildMotif(s.id, s.file);
    else if (s.kind === 'mural') await buildMural(s.id, s.opts, s.file);
    else await buildMaterial(s.id, s.opts, s.file, s.fixed);
  }
  writeIds();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
