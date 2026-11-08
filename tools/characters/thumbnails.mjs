// Thumbnails of modular parts (garments and hairstyles) for the creator's lists.
//
//   node tools/characters/thumbnails.mjs [--url http://localhost:5173] [--out <dir>] [--part id,id] [--size 256]
//                                        [--write-manifest] [--timeout 120]
//
// Starts the Vite dev server (or reuses `--url`), opens dev/wardrobe.html in its single-cell mode
// (?thumb=<partId>&body=<bodyId>&shot=...) with headless Chromium, screenshots the transparent canvas and writes
// <out>/<partId>.webp (default public/assets/characters/modular/thumbs/). Garments are framed 'upper' (bottoms, shoes and one-pieces 'full'), hairstyles, facial hair, hats, eyewear and earrings 'face' (gathered hair and bags seen from behind). The
// body is the manifest's default frame 'a' body if the part fits it, else the first body it fits. `--write-manifest` stores
// each part's `thumbnail` (path relative to the modular asset root, e.g. "thumbs/short_crop.webp") in manifest.json.
//
// Adapted from CharacterStudio (https://github.com/M3-org/CharacterStudio), src/library/thumbnailsGenerator.js, commit 293182b.
//
// MIT License
//
// Copyright (c) 2022 Atlas Foundation
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
// What changed: the original runs inside the React app, poses a VRM, loops over trait groups with a bone-to-bone frame and
// zips PNGs in the browser. Here the same flow (pose, frame by bones, one image per part id) runs in a headless browser
// against dev/wardrobe.html, and the images are written as WebP files next to the modular assets.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modularRoot = path.join(repo, 'public/assets/characters/modular');
const manifestPath = path.join(modularRoot, 'manifest.json');

const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const outDir = path.resolve(opt('out', path.join(modularRoot, 'thumbs')));
const size = Number(opt('size', '256'));
const timeoutMs = Number(opt('timeout', '120')) * 1000;
const only = opt('part', '')?.split(',').filter(Boolean) ?? [];

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const preferred = manifest.defaults.bodyByFrame.a;
const bodyFor = (part) => (part.files[preferred] ? preferred : manifest.bodies.map((b) => b.id).find((id) => part.files[id]));
const jobs = [
  ...manifest.garments.map((def) => ({ def, list: 'garments', shot: ['hat', 'eyewear', 'earrings'].includes(def.slot) ? 'face'
    : def.slot === 'bottom' || def.slot === 'shoes' || def.slot === 'full' ? 'full' : 'upper',
    yaw: def.slot === 'earrings' ? 0.9 : def.slot === 'bag' ? 2.6 : 0,
    extra: def.category === 'accessory' ? { skin: 'e6c3a5', hair: '20140c' } : undefined })),
  ...manifest.hairstyles.map((def) => ({ def, list: 'hairstyles', shot: 'face', yaw: (def.tags ?? []).includes('gathered') ? 2.4 : 0 })),
  // facial hair and accessories read better on a lighter skin with dark hair (beards and gold on the default tone vanish)
  ...(manifest.facialHair ?? []).map((def) => ({ def, list: 'facialHair', shot: 'face', yaw: 0.35, extra: { skin: 'e6c3a5', hair: '20140c' } })),
].filter((j) => only.length === 0 || only.includes(j.def.id));
if (jobs.length === 0) { console.error('No matching parts.'); process.exit(1); }

let server = null;
let url = opt('url', '');
if (!url) {
  const { createServer } = await import('vite');
  server = await createServer({ root: repo, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  url = server.resolvedUrls.local[0];
}
const sharp = require('sharp');
const { chromium } = require('playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = 0;
try {
  fs.mkdirSync(outDir, { recursive: true });
  for (const { def, list, shot, yaw, extra } of jobs) {
    const body = bodyFor(def);
    if (!body) { console.warn(`${def.id}: fits no body, skipped`); failed++; continue; }
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    try {
      page.on('pageerror', (e) => console.warn(`${def.id}: page error ${e}`));
      const q = new URLSearchParams({ thumb: def.id, body, shot, ...(yaw ? { yaw: String(yaw) } : {}), ...(extra ?? {}) }).toString();
      await page.goto(`${url.replace(/\/$/, '')}/dev/wardrobe.html?${q}`);
      await page.waitForFunction(() => window.wardrobeReady || window.wardrobeError, null, { timeout: timeoutMs });
      const err = await page.evaluate(() => window.wardrobeError);
      if (err) throw new Error(err);
      const png = await page.locator('canvas').first().screenshot({ omitBackground: true });
      const file = path.join(outDir, `${def.id}.webp`);
      await sharp(png).resize(size, size).webp({ quality: 88, alphaQuality: 100 }).toFile(file);
      console.log(`${def.id} (${list}, body ${body}, ${shot}): ${file} ${fs.statSync(file).size} bytes`);
      def.thumbnail = `thumbs/${def.id}.webp`;
    } catch (e) {
      console.warn(`${def.id}: failed: ${e.message}`);
      failed++;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  if (server) await server.close();
}
if (flag('write-manifest')) {
  // jobs hold the manifest's own objects, so the thumbnails set above are in `manifest`; a failed part keeps its old value
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`Wrote thumbnails to ${manifestPath}`);
}
process.exit(failed ? 1 : 0);
