// Browser-free preview of the exterior geometry: rasterises roofs, fences and gates with the furniture thumbnail renderer
// (tools/furniture-extra/thumb.mjs) into dev/exterior/shots/node-roofs.jpg and node-fences.jpg. A quick check of winding and shape.
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import { COLORS } from '../../tools/furniture-extra/kit.mjs';
import { renderThumb } from '../../tools/furniture-extra/thumb.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [join(root, 'node_modules')] }));
const { module: roofs } = await runnerImport(join(root, 'src/world/roofs.ts'), { root, logLevel: 'error' });
const { module: pieces } = await runnerImport(join(root, 'src/world/fencePieces.ts'), { root, logLevel: 'error' });
const { module: ext } = await runnerImport(join(root, 'src/content/exterior.ts'), { root, logLevel: 'error' });
Object.assign(COLORS, { rSlope: [0.45, 0.5, 0.56], rGable: [0.92, 0.87, 0.78], rTrim: [0.3, 0.3, 0.33], rGlass: [0.7, 0.83, 0.87], rWall: [0.9, 0.85, 0.75], rGround: [0.6, 0.75, 0.47] });

const tri = (mat, a, b, c, n) => ({ mat, p: [a, b, c], n: [n, n, n] });
function meshTris(data, dy = 0) {
  const out = [];
  const add = (part, mat) => { for (let i = 0; i < part.pos.length; i += 9) out.push(tri(mat, [0, 3, 6].map((k) => [part.pos[i + k], part.pos[i + k + 1] + dy, part.pos[i + k + 2]]).flat().length ? [part.pos[i], part.pos[i + 1] + dy, part.pos[i + 2]] : null, [part.pos[i + 3], part.pos[i + 4] + dy, part.pos[i + 5]], [part.pos[i + 6], part.pos[i + 7] + dy, part.pos[i + 8]], [part.nor[i], part.nor[i + 1], part.nor[i + 2]])); };
  add(data.parts.slope, 'rSlope'); add(data.parts.gable, 'rGable'); add(data.parts.trim, 'rTrim'); add(data.parts.glass, 'rGlass');
  return out;
}
function box(x0, y0, z0, x1, y1, z1, mat) {
  const q = (a, b, c, d, n) => [tri(mat, a, b, c, n), tri(mat, a, c, d, n)];
  return [
    ...q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]), ...q([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0]),
    ...q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]), ...q([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]),
    ...q([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]),
  ];
}
// fix: meshTris helper above is clumsy; rebuild it plainly
function plain(data, dy = 0) {
  const out = [];
  const add = (part, mat) => {
    for (let i = 0; i < part.pos.length; i += 9) {
      const p = (k) => [part.pos[i + k], part.pos[i + k + 1] + dy, part.pos[i + k + 2]];
      out.push({ mat, p: [p(0), p(3), p(6)], n: [[part.nor[i], part.nor[i + 1], part.nor[i + 2]], [part.nor[i], part.nor[i + 1], part.nor[i + 2]], [part.nor[i], part.nor[i + 1], part.nor[i + 2]]] });
    }
  };
  add(data.parts.slope, 'rSlope'); add(data.parts.gable, 'rGable'); add(data.parts.trim, 'rTrim'); add(data.parts.glass, 'rGlass');
  return out;
}
void meshTris;

const cell = 220;
const styles = ext.ROOF_STYLES;
const tiles = [];
for (const s of styles) {
  const w = s.id === 'pyramid' ? 5 : 6, d = s.id === 'pyramid' ? 5 : 4;
  const tris = [...box(0, 0, 0, w, 2.8, d, 'rWall'), ...plain(roofs.buildRoofMesh(s.id, w, d, 'h', s.pitch), 2.8)].map((t) => ({ ...t, p: t.p.map((q) => q.map((v) => v * 0.5)) }));
  tiles.push(await sharp(await renderThumb(tris, { px: cell })).resize(cell, cell, { fit: 'contain', background: '#ddd6c6' }).flatten({ background: '#ddd6c6' }).png().toBuffer());
}
const cols = 4;
const comps = tiles.map((b, i) => ({ input: b, left: (i % cols) * cell, top: Math.floor(i / cols) * cell }));
await sharp({ create: { width: cols * cell, height: Math.ceil(tiles.length / cols) * cell, channels: 3, background: '#ddd6c6' } }).composite(comps).jpeg({ quality: 82 }).toFile(join(root, 'dev/exterior/shots/node-roofs.jpg'));

// fences: rods as boxes
const ftiles = [];
for (const d of [...ext.FENCES, ...ext.GATES]) {
  const tris = [];
  for (const [mx] of [[0], [1]]) {
    for (const r of pieces.fencePieces(d, { endPost: mx === 1 || d.kind === 'gate', variant: 0 })) {
      if (d.kind === 'gate' && mx === 1) continue;
      const A = [r.a[0] + mx, r.a[1], r.a[2]], B = [r.b[0] + mx, r.b[1], r.b[2]];
      // axis-aligned approximation: a box from the rod's end points with half the cross-section around them
      const x0 = Math.min(A[0], B[0]) - r.w / 2, x1 = Math.max(A[0], B[0]) + r.w / 2;
      const y0 = Math.min(A[1], B[1]) - r.t / 2, y1 = Math.max(A[1], B[1]) + r.t / 2;
      const z0 = Math.min(A[2], B[2]) - r.w / 2, z1 = Math.max(A[2], B[2]) + r.w / 2;
      const horizontal = Math.abs(A[1] - B[1]) < 1e-6 && Math.abs(A[0] - B[0]) > 1e-6;
      const mat = r.part === 'glass' ? 'rGlass' : r.part === 'accent' || r.part === 'bloom' ? 'rTrim' : r.part === 'foliage' ? 'rSlope' : 'rGable';
      if (horizontal) tris.push(...box(Math.min(A[0], B[0]), A[1] - r.t / 2, A[2] - r.w / 2, Math.max(A[0], B[0]), A[1] + r.t / 2, A[2] + r.w / 2, mat));
      else tris.push(...box(x0 + (r.w - r.t) * 0 , y0, z0, x1, y1, z1, mat));
    }
  }
  ftiles.push(await sharp(await renderThumb(tris.map((t) => ({ ...t, p: t.p.map((q) => q.map((v) => v * 0.5)) })), { px: 200 })).resize(200, 200, { fit: 'contain', background: '#ddd6c6' }).flatten({ background: '#ddd6c6' }).png().toBuffer());
}
const fcols = 6;
await sharp({ create: { width: fcols * 200, height: Math.ceil(ftiles.length / fcols) * 200, channels: 3, background: '#ddd6c6' } })
  .composite(ftiles.map((b, i) => ({ input: b, left: (i % fcols) * 200, top: Math.floor(i / fcols) * 200 }))).jpeg({ quality: 82 }).toFile(join(root, 'dev/exterior/shots/node-fences.jpg'));
console.log('ok', tiles.length, ftiles.length);
