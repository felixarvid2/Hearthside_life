#!/usr/bin/env node
// Turns the PNG screenshots of dev/mpfb/shoot.mjs into the few JPGs that are kept in the repository (dev/mpfb/shots/*.jpg):
//   node dev/mpfb/shoot.mjs --only=full_front,full_threeq,walk,sit,dance,weight_up,muscle_up,tones,facemorphs
//   node dev/mpfb/compose.mjs
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'shots');
const png = (n) => join(dir, `${n}.png`);
const jpg = (img, name, quality = 80) => img.jpeg({ quality, mozjpeg: true }).toFile(join(dir, name));
const BG = '#efe7da';
const stack = async (cells, width, cellH, name) => jpg(sharp({ create: { width, height: cellH * cells.length, channels: 3, background: BG } }).composite(
  await Promise.all(cells.map(async (input, i) => ({ input: await input, left: 0, top: i * cellH })))), name);

// 1. Meshy | MPFB female | Meshy | MPFB male: front, three-quarter, in the same light
await stack(['full_front', 'full_threeq'].map((n) => sharp(png(n)).extract({ left: 280, top: 90, width: 1040, height: 500 }).toBuffer()), 1040, 500, 'compare.jpg');

// 2. faces at four skin tones (porcelain, olive, amber, deep ebony), woman on top, man below, each with another eye colour
const tones = [1, 3].flatMap((f) => [0, 5, 9, 15].map((t) => `tone_${f}_${t}`));
const cell = 300;
await jpg(sharp({ create: { width: cell * 4, height: cell * 2, channels: 3, background: BG } }).composite(
  await Promise.all(tones.map(async (n, i) => ({ input: await sharp(png(n)).extract({ left: 80, top: 60, width: 360, height: 360 }).resize(cell).toBuffer(), left: (i % 4) * cell, top: Math.floor(i / 4) * cell })))), 'faces_tones.jpg');

// 3. every face morph at -1 | +1 (man): jaw, chin, cheeks, nose, eyes, lips, brows, smile
const MORPHS = ['face_length', 'face_width', 'face_jaw_width', 'face_chin_length', 'face_chin_prominence', 'face_cheek_fullness', 'face_nose_width', 'face_nose_length',
  'face_eye_size', 'face_eye_spacing', 'face_lip_fullness', 'face_mouth_width', 'face_brow_height', 'face_smile'];
const mz = 200, cols = 3, rows = Math.ceil(MORPHS.length / cols);
const label = (t) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${2 * mz}" height="18"><text x="4" y="13" font-family="sans-serif" font-size="12" fill="#3b3125">${t}   (-1 | +1)</text></svg>`);
const mcells = await Promise.all(MORPHS.flatMap((m, i) => [
  { input: label(m), left: (i % cols) * 2 * mz, top: Math.floor(i / cols) * (mz + 18) },
  ...['m', 'p'].map((s, k) => ({ input: sharp(png(`fm_3_${m}_${s}`)).extract({ left: 90, top: 50, width: 360, height: 360 }).resize(mz).toBuffer(), left: (i % cols) * 2 * mz + k * mz, top: Math.floor(i / cols) * (mz + 18) + 18 })),
].map(async (c) => ({ ...c, input: await c.input }))));
await jpg(sharp({ create: { width: cols * 2 * mz, height: rows * (mz + 18), channels: 3, background: BG } }).composite(mcells), 'face_morphs.jpg', 78);

// 4. clips and body sliders: walk, sit, dance, weight slider at +1 (x3), muscle slider at +1 (x2)
const strip = ['walk', 'sit', 'dance', 'weight_up', 'muscle_up'].filter((n) => existsSync(png(n)));
await stack(strip.map((n) => sharp(png(n)).extract({ left: 280, top: 90, width: 1040, height: 480 }).resize(800).toBuffer()), 800, 369, 'motion_morph.jpg');
