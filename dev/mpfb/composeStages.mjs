#!/usr/bin/env node
// Turns the raw PNGs of dev/mpfb/shootStages.mjs (dev/mpfb/shots/raw, gitignored) into the small JPGs kept in dev/mpfb/shots/:
//   stages_lineup.jpg      every stage, women and men, dressed and undressed (front)
//   stages_profile.jpg     the same undressed from the side (proportions, the elder's stoop) and from behind, dressed
//   stages_each_{f,m}.jpg  one person per stage, dressed and undressed
//   stages_faces.jpg       heads of every stage, women and men
//   stages_sitting.jpg     every stage on an adult chair (front three-quarter and side), women and men
//   stages_walking.jpg     the walk cycle at every stage
//   stages_held_crib.jpg   a baby held by a woman, a man and a teen; a baby in a crib; a child and an elder in bed
//   node dev/mpfb/shootStages.mjs && node dev/mpfb/composeStages.mjs
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const raw = (n) => join(here, 'shots', 'raw', `${n}.png`);
const BG = '#efe7da';
const have = (names) => names.every((n) => existsSync(raw(n)));
const jpg = (img, name, quality = 78) => img.jpeg({ quality, mozjpeg: true }).toFile(join(here, 'shots', name));

/** Rows of images stacked (each cropped to `crop` and scaled to `width`). */
async function stack(names, crop, width, out, quality) {
  if (!have(names)) { console.log(`skip ${out}: missing ${names.filter((n) => !existsSync(raw(n))).join(', ')}`); return; }
  const cells = await Promise.all(names.map((n) => sharp(raw(n)).extract(crop).resize(width).toBuffer()));
  const h = (await sharp(cells[0]).metadata()).height;
  await jpg(sharp({ create: { width, height: h * cells.length, channels: 3, background: BG } }).composite(cells.map((input, i) => ({ input, left: 0, top: i * h }))), out, quality);
  console.log(`wrote ${out}`);
}

/** A grid of cells (cols x rows) scaled to `cell` px wide. */
async function grid(names, cols, crop, cell, out, quality) {
  if (!have(names)) { console.log(`skip ${out}: missing ${names.filter((n) => !existsSync(raw(n))).join(', ')}`); return; }
  const cells = await Promise.all(names.map((n) => sharp(raw(n)).extract(crop).resize(cell).toBuffer()));
  const h = (await sharp(cells[0]).metadata()).height;
  const rows = Math.ceil(names.length / cols);
  await jpg(sharp({ create: { width: cols * cell, height: rows * h, channels: 3, background: BG } }).composite(cells.map((input, i) => ({ input, left: (i % cols) * cell, top: Math.floor(i / cols) * h }))), out, quality);
  console.log(`wrote ${out}`);
}

const LINE = { left: 0, top: 110, width: 1500, height: 450 };
await stack(['lineup_b_dressed', 'lineup_b_undressed', 'lineup_a_dressed', 'lineup_a_undressed'], LINE, 1000, 'stages_lineup.jpg');
await stack(['lineup_b_undressed_side', 'lineup_a_undressed_side', 'lineup_b_back', 'lineup_a_back'], LINE, 1000, 'stages_profile.jpg');
const STAGES = ['baby', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'];
for (const f of ['f', 'm']) {
  const fr = f === 'f' ? 'b' : 'a';
  await grid([...STAGES.map((s) => `single_${fr}_${s}_dressed`), ...STAGES.map((s) => `single_${fr}_${s}_undressed`)], 7, { left: 30, top: 20, width: 300, height: 480 }, 150, `stages_each_${f}.jpg`, 76);
}
await stack(['faces_b', 'faces_a'], { left: 0, top: 0, width: 1500, height: 360 }, 1000, 'stages_faces.jpg', 80);
await stack(['sit_b', 'sit_b_side', 'sit_a', 'sit_a_side'], LINE, 1000, 'stages_sitting.jpg');
await stack(['walk_b', 'walk_b_side', 'walk_a', 'walk_a_side'], LINE, 1000, 'stages_walking.jpg');
await grid(['held_f_front', 'held_f_side', 'held_m_walk', 'held_teen_front', 'crib_baby', 'crib_baby_dressed', 'bed_child', 'bed_elder'], 4, { left: 0, top: 0, width: 640, height: 700 }, 300, 'stages_held_crib.jpg', 76);
