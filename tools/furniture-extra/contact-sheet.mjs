#!/usr/bin/env node
// Review sheet of generated furniture models: each model rendered from the front-right (the catalog thumbnail view) and the
// front-left, with its name and triangle count, tiled into one PNG. Renders straight from the builders (no GLB needed).
// Usage: node tools/furniture-extra/contact-sheet.mjs --only=<group> [--names=a,b] [--out=file.png] [--cols=4] [--px=220]
//   --only=<group>   base | seating-beds | tables-storage | kitchen-bath-electronics | lighting-outdoor-kids | decor-hobby
//   --names=a,b      just these models (of the group, or of all models without --only)
//   --out            default tests/e2e/out/furniture-sheets/<group|names>.png (git-ignored)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildModels } from './models.mjs';
import { renderThumb } from './thumb.mjs';

const arg = (name, def) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def;
const only = arg('only');
const names = arg('names')?.split(',').filter(Boolean);
if (!only && !names) { console.error('usage: contact-sheet.mjs --only=<group> | --names=a,b [--out=file.png] [--cols=4] [--px=220]'); process.exit(1); }
const cols = Number(arg('cols', 4));
const px = Number(arg('px', 220));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.resolve(arg('out', path.join(root, 'tests', 'e2e', 'out', 'furniture-sheets', `${only ?? names.join('-').slice(0, 40)}.png`)));

const all = buildModels(only);
const picked = names ? names.map((n) => { if (!all[n]) throw new Error(`no model '${n}'${only ? ` in group ${only}` : ''}`); return [n, all[n]]; }) : Object.entries(all);
if (!picked.length) { console.error(`group '${only}' has no models yet`); process.exit(1); }

const CELL_W = px * 2 + 24, CELL_H = Math.round(px * 1.15) + 34;
const tiles = [];
for (const [i, [name, model]] of picked.entries()) {
  const tris = model.scaledTriangles();
  const views = [];
  for (const az of [-Math.PI / 4, Math.PI / 4]) {
    const png = await renderThumb(tris, { az, px });
    views.push(await sharp(png).resize({ width: px, height: Math.round(px * 1.15), fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer());
  }
  const label = `${name}  ${model.triangleCount()} tris${model.parts.size ? `  parts: ${model.partNames().join(' ')}` : ''}`.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="24"><text x="6" y="17" font-family="sans-serif" font-size="13" fill="#2f2a26">${label}</text></svg>`);
  const x = (i % cols) * CELL_W, y = Math.floor(i / cols) * CELL_H;
  tiles.push({ input: views[0], left: x + 4, top: y + 26 }, { input: views[1], left: x + 4 + px + 8, top: y + 26 }, { input: svg, left: x, top: y });
}
const rows = Math.ceil(picked.length / cols);
fs.mkdirSync(path.dirname(out), { recursive: true });
await sharp({ create: { width: cols * CELL_W, height: rows * CELL_H, channels: 4, background: '#efe7d8' } }).composite(tiles).png().toFile(out);
console.log(`contact sheet: ${picked.length} models -> ${out}`);
