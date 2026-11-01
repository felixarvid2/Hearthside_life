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
  'grain-barn': { std: 0.17 },
  'stone-marble': { std: 0.2 },
  'stone-slate': { src: 'floor-slate', std: 0.2 },
  'fibre-berber': { src: 'floor-berber', std: 0.2, flatten: 0.9 },
  'fibre-sisal': { std: 0.17 },
  'concrete-aggregate': { std: 0.2 },
  'gravel': { src: 'floor-gravel', std: 0.2 },
  'lawn': { src: 'floor-grass', std: 0.17, flatten: 0.9 },
  // walls
  'plaster-rough': { src: 'wall-roughcast', crop: 0.8, std: 0.1, flatten: 1 },
  'grasscloth': { src: 'wall-grasscloth', std: 0.14 },
  'rubble-stone': { src: 'wall-rubble', std: 0.2 },
  'slate-ledge': { src: 'wall-slate', std: 0.2 },
  'concrete-board': { src: 'wall-concrete', crop: 0.72, std: 0.15, flatten: 1 },
  'marble-veined': { src: 'wall-marble', std: 0.2 },
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

function mean(a) { let s = 0; for (const v of a) s += v; return s / a.length; }
function stdev(a, m) { let s = 0; for (const v of a) s += (v - m) * (v - m); return Math.sqrt(s / a.length); }

/** Offset-and-blend: edges come from the half-shifted copy, so opposite edges are neighbours. */
function makeSeamless(lum, axes = 'xy', band = 0.38) {
  const m = mean(lum);
  const out = new Float32Array(lum.length);
  const ramp = (i) => smooth(Math.min(i, N - 1 - i) / (band * N));
  const shiftY = axes.includes('y') ? N / 2 : 0;
  for (let y = 0; y < N; y++) {
    const wy = shiftY ? ramp(y) : 1;
    for (let x = 0; x < N; x++) {
      const w = ramp(x) * wy;
      const a = lum[y * N + x];
      const b = lum[((y + shiftY) % N) * N + ((x + N / 2) % N)];
      // variance-preserving mix of two uncorrelated pictures
      out[y * N + x] = m + (w * (a - m) + (1 - w) * (b - m)) / Math.sqrt(w * w + (1 - w) * (1 - w));
    }
  }
  return out;
}

async function build(id) {
  const o = MAPS[id];
  const src = path.join(RAW, `${o.src ?? id}.jpg`);
  if (!fs.existsSync(src)) { console.error('missing raw', src); return; }
  let lum = await loadGrey(src, o);
  const flatten = o.flatten ?? 0.8;
  if (flatten > 0) {
    const bl = await blurred(lum, 60);
    const m = mean(lum);
    lum = lum.map((v, i) => v - flatten * (bl[i] - m));
  }
  if (o.seamless !== false) lum = makeSeamless(lum, o.seamless === 'x' ? 'x' : 'xy');
  const m = mean(lum), sd = stdev(lum, m) || 1;
  const std = o.std ?? 0.17;
  const out = new Uint8Array(lum.length);
  for (let i = 0; i < lum.length; i++) out[i] = Math.round(Math.min(1, Math.max(0, 0.5 + ((lum[i] - m) / sd) * std)) * 255);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${id}.webp`);
  await sharp(Buffer.from(out), { raw: { width: N, height: N, channels: 1 } }).webp({ quality: 82, effort: 5 }).toFile(file);
  console.log(id, `${(fs.statSync(file).size / 1024).toFixed(1)} kB`);
}

const only = process.argv.slice(2);
for (const id of Object.keys(MAPS)) if (!only.length || only.includes(id)) await build(id);
