// Temporary: print run-length colour runs of a screenshot row so panel edges can be located exactly. Not a test.
import { createRequire } from 'node:module';
import { join } from 'node:path';

const root = process.cwd();
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [join(root, 'node_modules')] }));

const [, , file, ...rows] = process.argv;
if (!file) {
  console.error('usage: node dev/ds-tasks/pixels.mjs <png> [y ...]');
  process.exit(2);
}
const img = sharp(file);
const meta = await img.metadata();
if (rows[0] === 'dark') {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  for (let y0 = 0; y0 < H; y0 += 10) {
    const runs = [];
    let start = -1;
    for (let x = 0; x < W; x++) {
      let dark = false;
      for (let y = y0; y < Math.min(H, y0 + 10); y++) {
        const i = (y * W + x) * info.channels;
        if (data[i] + data[i + 1] + data[i + 2] < 200) { dark = true; break; }
      }
      if (dark && start < 0) start = x;
      if (!dark && start >= 0 && x - start > 1) { runs.push([start, x - 1]); start = -1; } else if (!dark) start = -1;
    }
    if (start >= 0) runs.push([start, W - 1]);
    if (runs.length) console.log(`y ${y0}-${y0 + 9}: ` + runs.map(([a, b]) => `${a}-${b}`).join(' '));
  }
  process.exit(0);
}
if (rows[0] === 'crop') {
  const [, , , , x, y, w, h, out] = process.argv;
  await sharp(file).extract({ left: +x, top: +y, width: +w, height: +h }).toFile(out);
  console.log(`wrote ${out}`);
  process.exit(0);
}
const ys = rows.length ? rows.map(Number) : [Math.round(meta.height * 0.25), Math.round(meta.height * 0.5), Math.round(meta.height * 0.75)];
console.log(`${file} ${meta.width}x${meta.height}`);
for (const y of ys) {
  const { data } = await sharp(file).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const ch = 4;
  const runs = [];
  let prev = '';
  let start = 0;
  for (let x = 0; x < meta.width; x++) {
    const i = (y * meta.width + x) * ch;
    // quantize to 16 levels so anti-aliasing and texture noise merge into readable runs
    const key = [data[i], data[i + 1], data[i + 2]].map((v) => (v >> 4).toString(16)).join('');
    if (key !== prev) {
      if (prev) runs.push([start, x - 1, prev]);
      prev = key;
      start = x;
    }
  }
  runs.push([start, meta.width - 1, prev]);
  console.log(`y=${y}: ` + runs.map(([a, b, k]) => `${a}-${b}#${k}`).join(' '));
}
