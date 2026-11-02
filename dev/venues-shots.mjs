// Screenshots of the generated venue and home lots through dev/venues.html (software GL, SwiftShader).
//   flock /tmp/hearthside-browser.lock node dev/venues-shots.mjs [out-dir] [lot,lot,...] [view,view,...]
// Starts its own vite dev server on port 5195 and writes <lot>-<view>.jpg into out-dir (default dev/venues-shots).

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(root, 'dev/venues-shots'));
const lots = (process.argv[3] ?? 'cafe,gym,library,arts,market,park,home0,home1,home2,home3,home4,home5').split(',');
const views = (process.argv[4] ?? 'iso,top').split(',');
const PORT = 5195;
mkdirSync(out, { recursive: true });

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of [join(root, 'node_modules'), '/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try { return require(require.resolve('playwright', { paths: [p] })); } catch { /* next */ }
  }
  throw new Error('playwright is not installed');
}

const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stderr.on('data', (d) => { log += d; });
server.stdout.on('data', (d) => { log += d; });
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/dev/venues.html`)).ok) break; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  const { chromium } = loadPlaywright();
  const opts = {};
  if (!existsSync(chromium.executablePath()) && existsSync('/usr/bin/google-chrome')) opts.executablePath = '/usr/bin/google-chrome';
  const browser = await chromium.launch({ ...opts, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
  for (const lot of lots) for (const view of views) {
    await page.goto(`http://127.0.0.1:${PORT}/dev/venues.html?lot=${lot}&view=${view}&shot=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__venues && (window.__venues.ready || window.__venues.error), null, { timeout: 120000 });
    const info = await page.evaluate(() => window.__venues);
    if (info.error) console.log(`[${lot}/${view}] ERROR ${info.error}`);
    await page.waitForTimeout(400);
    const file = join(out, `${lot}-${view}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 82, timeout: 120000 });
    console.log(`${lot}/${view}: ${info.objects} objects, ${info.problems.length} problems -> ${file}`);
  }
  await browser.close();
} finally {
  server.kill();
  if (process.exitCode) console.log(log.slice(-2000));
}
