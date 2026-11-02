#!/usr/bin/env node
// Turns the PNG screenshots of dev/mpfb/shoot.mjs into the few JPGs that are kept in the repository (dev/mpfb/shots/*.jpg).
import sharp from 'sharp';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'shots');
const png = (n) => join(dir, `${n}.png`);
const jpg = (img, name) => img.jpeg({ quality: 82, mozjpeg: true }).toFile(join(dir, name));

// 1. front view, idle: Meshy female | MPFB female | Meshy male | MPFB male
await jpg(sharp(png('full_front')).extract({ left: 280, top: 80, width: 1040, height: 520 }), 'compare_front.jpg');
// 2. three-quarter view
await jpg(sharp(png('full_threeq')).extract({ left: 280, top: 80, width: 1040, height: 520 }), 'compare_threeq.jpg');
// 3. faces: Meshy F, MPFB F, Meshy M, MPFB M
const faces = await Promise.all([0, 1, 2, 3].map((i) => sharp(png(`face_${i}`)).extract({ left: 100, top: 60, width: 700, height: 760 }).resize(450).toBuffer()));
await jpg(sharp({ create: { width: 1800, height: 492, channels: 3, background: '#efe7da' } }).composite(faces.map((input, i) => ({ input, left: i * 450, top: 0 }))), 'faces.jpg');
// 4. motion and morphs: walk, sit, dance, weight slider at +1 (x3), belly slider
const rows = ['walk', 'dance', 'weight_up', 'sit'];
const strips = await Promise.all(rows.map((n) => sharp(png(n)).extract({ left: 280, top: 90, width: 1040, height: 480 }).resize(800).toBuffer()));
await jpg(sharp({ create: { width: 800, height: 372 * rows.length, channels: 3, background: '#efe7da' } }).composite(strips.map((input, i) => ({ input, left: 0, top: i * 372 }))), 'motion_morph.jpg');
