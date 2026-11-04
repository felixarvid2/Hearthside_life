#!/usr/bin/env node
// Review tool: contact sheets of surface designs at room scale (npm run visual:surfaces).
//
//   npm run visual:surfaces -- --group walls-a [--out dir] [--palettes] [--ids a,b,c]
//
// Starts a vite dev server, opens dev/surfaces-sheet.html in headless Chromium, waits for every map, motif and mural
// the designs use, and writes PNGs: dev/tasks/m10-surfaces/sheets/<group>-<n>.png (six designs per sheet: a swatch
// 360 x 300 px with the design id and name, plus a strip of the first 8 palettes). --palettes writes one sheet per
// design with every palette large. --ids picks designs from any group (sheet name `ids-<n>`).
// Like the e2e scripts it takes /tmp/hearthside-browser.lock itself (it re-runs itself under flock): do not wrap it.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const LOCK = '/tmp/hearthside-browser.lock';
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };

if (!process.env.HEARTHSIDE_E2E_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...args], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_E2E_LOCKED: '1' },
  });
  process.exit(r.status ?? 1);
}

const group = opt('group', '');
const ids = (opt('ids', '') || '').split(',').filter(Boolean);
const palettes = args.includes('--palettes');
if (!group && !ids.length) { console.error('usage: npm run visual:surfaces -- --group <walls-a|...|floors-c> [--out dir] [--palettes] [--ids a,b,c]'); process.exit(2); }
const OUT = resolve(opt('out', join(root, 'dev', 'tasks', 'm10-surfaces', 'sheets')));
mkdirSync(OUT, { recursive: true });

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of [join(root, 'node_modules'), '/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try { return require(require.resolve('playwright', { paths: [p] })); } catch { /* next */ }
  }
  throw new Error('playwright is not installed (looked in node_modules and the global module folders).');
}
function launchOptions(chromium) {
  const opts = {};
  if (!existsSync(chromium.executablePath())) {
    const chrome = [process.env.HEARTHSIDE_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && existsSync(p));
    if (chrome) opts.executablePath = chrome;
  }
  return opts;
}

const { createServer } = await import(pathToVite());
function pathToVite() { return require.resolve('vite', { paths: [root] }).replace(/\.cjs$/, '.js'); }
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5191, strictPort: false } });
await server.listen();
const addr = server.httpServer.address();
const url = `http://127.0.0.1:${addr.port}/dev/surfaces-sheet.html`;

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ ...launchOptions(chromium), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', (e) => { console.error('page error:', e.message); code = 1; });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error(`[page ${m.type()}]`, m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.surfaceSheets, null, { timeout: 120000 });
  const res = await page.evaluate((o) => window.surfaceSheets.render(o), { group, ids, palettes });
  for (const p of res.problems) { console.error('problem:', p); code = 1; }
  const stem = group || 'ids';
  res.sheets.forEach((data, i) => {
    const file = join(OUT, `${stem}${palettes ? '-palettes' : ''}-${i + 1}.png`);
    writeFileSync(file, Buffer.from(data.replace(/^data:image\/png;base64,/, ''), 'base64'));
    console.log('wrote', file);
  });
  console.log(`${res.designs.length} designs: ${res.designs.join(', ')}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(code);
