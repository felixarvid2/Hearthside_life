#!/usr/bin/env node
// Review tool: sheets of every door and window in the game's own renderer (npm run visual:openings).
//
//   npm run visual:openings [-- --kind door|window] [--ids a,b] [--out dir]
//
// Starts a vite dev server, opens dev/openings-sheet.html in headless Chromium and writes PNG sheets to
// dev/shots/doors-windows/ (doors: closed and fully open side by side, three per row; windows: five per row).
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

const kinds = (opt('kind', '') ? [opt('kind', '')] : ['door', 'window']);
const ids = (opt('ids', '') || '').split(',').filter(Boolean);
const OUT = resolve(opt('out', join(root, 'dev', 'shots', 'doors-windows')));
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
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5192, strictPort: false } });
await server.listen();
const addr = server.httpServer.address();
const url = `http://127.0.0.1:${addr.port}/dev/openings-sheet.html`;

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ ...launchOptions(chromium), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', (e) => { console.error('page error:', e.message); code = 1; });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error(`[page ${m.type()}]`, m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.openingSheets, null, { timeout: 120000 });
  for (const kind of kinds) {
    const res = await page.evaluate((o) => window.openingSheets.render(o), { kind, ids });
    for (const p of res.problems) { console.error('problem:', p); code = 1; }
    res.sheets.forEach((data, i) => {
      const file = join(OUT, `${kind}s-${i + 1}.png`);
      writeFileSync(file, Buffer.from(data.replace(/^data:image\/png;base64,/, ''), 'base64'));
      console.log('wrote', file);
    });
    console.log(`${res.ids.length} ${kind}s`);
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(code);
