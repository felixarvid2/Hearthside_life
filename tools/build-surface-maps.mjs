#!/usr/bin/env node
// Turns the raw AI-generated surface sources (dev/surfaces-ai/raw/, fetched by dev/surfaces-ai/generate.mjs)
// into the seamless 512 px greyscale detail maps the renderer tints with a palette
// (src/render/textures/surfaceMaps.ts): public/assets/surfaces/<id>.webp.
//
// Per map: grey -> optional rotation and centre crop -> 512 px -> illumination flatten (the generator bakes in
// soft vignettes) -> seamless via offset-and-blend (variance preserving) -> normalise to mean 0.5 and a chosen
// standard deviation, so that 0.5 maps to the palette base colour, 0 to its dark and 1 to its light colour.
//
// Usage: node tools/build-surface-maps.mjs [id ...]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'dev', 'surfaces-ai', 'raw');
const OUT = path.join(ROOT, 'public', 'assets', 'surfaces');
const N = 512;

/** id -> processing options. `src` defaults to the id (a raw/<src>.jpg file). */
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

async function blurred(lum, sigma) {
  const buf = Buffer.from(Uint8Array.from(lum, (v) => Math.round(Math.min(1, Math.max(0, v)) * 255)));
  const { data } = await sharp(buf, { raw: { width: N, height: N, channels: 1 } }).blur(sigma).raw().toBuffer({ resolveWithObject: true });
  return Float32Array.from(data, (v) => v / 255);
}

/** Gaussian blur that wraps around the edges (the map is a repeating tile): blur a 3 x 3 tiling, keep the middle. */
async function blurWrapped(lum, sigma) {
  const W = N * 3;
  const big = new Uint8Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) big[y * W + x] = Math.round(Math.min(1, Math.max(0, lum[(y % N) * N + (x % N)])) * 255);
  const { data } = await sharp(Buffer.from(big), { raw: { width: W, height: W, channels: 1 } }).blur(sigma).raw().toBuffer({ resolveWithObject: true });
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[y * N + x] = data[(y + N) * W + (x + N)] / 255;
  return out;
}

function mean(a) { let s = 0; for (const v of a) s += v; return s / a.length; }
function stdev(a, m) { let s = 0; for (const v of a) s += (v - m) * (v - m); return Math.sqrt(s / a.length); }

/**
 * Offset-and-blend, one axis at a time (a product mask would show the shifted copy's own seam where it meets
 * the border): the edges come from the half-shifted copy, so opposite edges become neighbours. The mix is
 * variance preserving, so the blended band keeps the contrast of the rest.
 */
function makeSeamless(lum, axes = 'xy', band = 0.38) {
  const ramp = (i) => smooth(Math.min(i, N - 1 - i) / (band * N));
  const pass = (src, axis) => {
    const m = mean(src);
    const out = new Float32Array(src.length);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const w = ramp(axis === 'x' ? x : y);
        const a = src[y * N + x];
        const b = axis === 'x' ? src[y * N + ((x + N / 2) % N)] : src[((y + N / 2) % N) * N + x];
        out[y * N + x] = m + (w * (a - m) + (1 - w) * (b - m)) / Math.sqrt(w * w + (1 - w) * (1 - w));
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

async function build(id) {
  const o = MAPS[id];
  const src = path.join(RAW, `${o.src ?? id}.jpg`);
  if (!fs.existsSync(src)) { console.error('missing raw', src); return; }
  let lum = await loadGrey(src, o);
  dbg('raw', lum);
  const flatten = o.flatten ?? 0.8;
  if (flatten > 0) {
    const bl = await blurred(lum, 60);
    const m = mean(lum);
    lum = lum.map((v, i) => v - flatten * (bl[i] - m));
  }
  dbg('flat', lum);
  if (o.seamless !== false) lum = makeSeamless(lum, o.seamless === 'x' ? 'x' : 'xy');
  dbg('seam', lum);
  // the blend leaves slow brightness drift between its quadrants: remove it with a wrap-around high-pass
  const drift = o.drift ?? 0.8;
  if (drift > 0 && o.seamless !== false) {
    const bl = await blurWrapped(lum, o.driftSigma ?? 48);
    const m0 = mean(lum);
    lum = lum.map((v, i) => v - drift * (bl[i] - m0));
  }
  const m = mean(lum), sd = stdev(lum, m) || 1;
  const std = o.std ?? 0.17;
  const out = new Uint8Array(lum.length);
  for (let i = 0; i < lum.length; i++) out[i] = Math.round(Math.min(1, Math.max(0, 0.5 + ((lum[i] - m) / sd) * std)) * 255);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${id}.webp`);
  await sharp(Buffer.from(out), { raw: { width: N, height: N, channels: 1 } }).webp({ quality: 78, effort: 6 }).toFile(file);
  console.log(id, `${(fs.statSync(file).size / 1024).toFixed(1)} kB`);
}

const only = process.argv.slice(2);
for (const id of Object.keys(MAPS)) if (!only.length || only.includes(id)) await build(id);
