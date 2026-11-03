// Copies the exterior screenshots of an acceptance run (tests/e2e/out/acceptance/<viewport>/NN-m9ext-*.png) as small JPGs to
// dev/exterior/shots/<viewport>-<name>.jpg, and composes one contact strip per viewport.
//   node dev/exterior/collect.mjs [acceptance-out-dir]
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [join(root, 'node_modules')] }));
const src = resolve(process.argv[2] ?? join(root, 'tests/e2e/out/acceptance'));
const dst = join(root, 'dev/exterior/shots');
mkdirSync(dst, { recursive: true });
for (const vp of ['portrait', 'landscape', 'desktop']) {
  const dir = join(src, vp);
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir).filter((f) => /m9ext-.*\.png$/.test(f)).sort();
  const tiles = [];
  for (const f of files) {
    const name = f.replace(/^\d+-/, '').replace(/\.png$/, '');
    const maxW = vp === 'portrait' ? 330 : 640;
    const buf = await sharp(join(dir, f)).resize({ width: maxW }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
    await sharp(buf).toFile(join(dst, `${vp}-${name}.jpg`));
    tiles.push({ name, buf });
  }
  if (!tiles.length) continue;
  // a strip of every shot of this viewport (two rows)
  const metas = await Promise.all(tiles.map((t) => sharp(t.buf).metadata()));
  const cols = vp === 'portrait' ? 5 : 3;
  const cw = Math.max(...metas.map((m) => m.width)), ch = Math.max(...metas.map((m) => m.height));
  const rows = Math.ceil(tiles.length / cols);
  const comps = tiles.map((t, i) => ({ input: t.buf, left: (i % cols) * (cw + 6) + 3, top: Math.floor(i / cols) * (ch + 6) + 3 }));
  await sharp({ create: { width: cols * (cw + 6) + 3, height: rows * (ch + 6) + 3, channels: 3, background: '#d8d0c2' } }).composite(comps).jpeg({ quality: 76, mozjpeg: true }).toFile(join(dst, `${vp}-strip.jpg`));
  console.log(`${vp}: ${tiles.length} shots`);
}
