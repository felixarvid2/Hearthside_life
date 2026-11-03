// Draws the exterior contact sheets (dev/exterior.html) and writes them as small JPGs to dev/exterior/shots/:
//   node dev/exterior/sheets.mjs [set,set...]     sets: roofs finishes fences gates garden crops stairs terrain (default: all)
// Run under `flock /tmp/hearthside-browser.lock` (the browser is shared with the other agents).

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPlaywright, launchOptions, startServer, root } from './lib.mjs';

const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [join(root, 'node_modules')] }));
const SETS = { roofs: [1400, 900], finishes: [1400, 880], fences: [1400, 900], gates: [1400, 760], garden: [1300, 900], crops: [1300, 760], stairs: [1300, 1000], terrain: [1100, 760] };
const wanted = (process.argv[2] ?? Object.keys(SETS).join(',')).split(',').filter((s) => SETS[s]);
const out = join(root, 'dev/exterior/shots');
mkdirSync(out, { recursive: true });

const pw = loadPlaywright();
const server = await startServer();
const browser = await pw.chromium.launch(launchOptions(pw.chromium));
const report = [];
try {
  for (const set of wanted) {
    const [w, h] = SETS[set];
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${server.url}dev/exterior.html?set=${set}&w=${w}&h=${h}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__sheet?.ready === true, null, { timeout: 120000 });
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => ({ count: window.__sheet.count, errors: window.__sheet.errors }));
    const png = await page.screenshot({ type: 'png' });
    const file = join(out, `sheet-${set}.jpg`);
    await sharp(png).jpeg({ quality: 82, mozjpeg: true }).toFile(file);
    report.push({ set, ...info, pageErrors: errors.slice(0, 3) });
    await context.close();
  }
} finally { await browser.close(); server.stop(); }
writeFileSync(join(root, 'dev/ds-tasks/logs/m9ext-sheets.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
