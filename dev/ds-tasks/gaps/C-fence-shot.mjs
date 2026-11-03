// Dev-only screenshots for Task C (fence L / rectangle drags). Run from the repo root under the shared browser lock:
//   flock /tmp/hearthside-browser.lock node dev/ds-tasks/gaps/C-fence-shot.mjs
// Builds a preview bundle, fast-starts a world, previews an L, then builds a rectangle loop and places a gate afterwards.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const OUT = join(here, 'shots');
const PORT = 5186;
mkdirSync(OUT, { recursive: true });

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of [join(root, 'node_modules'), '/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try { return require(require.resolve('playwright', { paths: [p] })); } catch { /* next */ }
  }
  throw new Error('playwright is not installed');
}
const { chromium } = loadPlaywright();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A stable bundle: a dev server reloads under other agents' edits, which loses the game mid-run.
const vite = join(root, 'node_modules/vite/bin/vite.js');
const built = spawnSync(process.execPath, [vite, 'build'], { cwd: root, encoding: 'utf8' });
if (built.status !== 0) throw new Error(`vite build failed: ${(built.stderr || built.stdout).slice(-2000)}`);
const server = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
let stderr = '';
server.stderr.on('data', (d) => { stderr += d; });
const url = `http://localhost:${PORT}/`;
for (let i = 0; i < 160; i++) {
  if (server.exitCode !== null) throw new Error(`vite exited: ${stderr.trim()}`);
  try { const r = await fetch(url); if (r.ok) break; } catch { /* starting */ }
  await sleep(250);
}

const opts = {};
if (!existsSync(chromium.executablePath())) {
  const chrome = [process.env.HEARTHSIDE_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && existsSync(p));
  if (chrome) opts.executablePath = chrome;
}
const browser = await chromium.launch(opts);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const log = (...a) => console.log('[fence-shot]', ...a);
const status = async () => (await page.locator('.bb-build-footer .bb-build-status').textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim() ?? '';
const fences = () => page.evaluate(() => Object.keys(window.hearthside.debug.state().lots[window.hearthside.debug.state().activeLotId].fences ?? {}));
const gates = () => page.evaluate(() => Object.values(window.hearthside.debug.state().lots[window.hearthside.debug.state().activeLotId].fences ?? {}).filter((f) => f.defId.startsWith('gate-')).length);

try {
  await page.goto(url);
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 180000 });
  await page.evaluate(async () => {
    const g = window.hearthside.game;
    const hh = g.premadeHouseholds();
    await g.startNewGame('create', hh.find((x) => x.members.length >= 2) ?? hh[0]);
    g.setSpeed(0);
  });
  await page.waitForTimeout(1200);
  log('lot', JSON.stringify(await page.evaluate(() => {
    const st = window.hearthside.debug.state();
    const lot = st.lots[st.activeLotId];
    return { width: lot.width, depth: lot.depth, entry: lot.entry, floors: Object.keys(lot.floors ?? {}) };
  })));
  await page.evaluate(() => window.hearthside.game.setMode('build'));
  await page.waitForSelector('.bb-build-panel:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(600);
  const fenceTab = page.locator('.bb-tool-tabs .tab[data-id="tool-fence"]');
  await fenceTab.evaluate((e) => e.scrollIntoView({ inline: 'nearest', block: 'nearest' }));
  await fenceTab.click({ timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'fence-panel-run.png') });
  log('panel tool', JSON.stringify(await page.evaluate(() => window.hearthside.game.buildTool())));

  // Points in the south yard (the acceptance run uses row z=20 and x=4..9; the house roof is x 5..19, z 5..17).
  const conv = async (x, z) => page.evaluate(([wx, wz]) => {
    const c = document.getElementById('game-canvas').getBoundingClientRect();
    const p = window.hearthside.game.view.worldToScreen(wx, 0, wz);
    return { x: p.x + c.left, y: p.y + c.top };
  }, [x, z]);
  const free = async (p) => page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return { on: !!el && (el.id === 'game-canvas' || el.tagName === 'CANVAS'), top: el ? (el.id || el.className || el.tagName) : null, inside: x > 0 && y > 0 && x < innerWidth && y < innerHeight };
  }, [p.x, p.y]);

  // ---- 1. an L preview: (4,20) -> (9,23) is 5 h edges then 3 v edges
  const la = await conv(4, 20), lb = await conv(9, 23);
  log('L corners free', JSON.stringify([await free(la), await free(lb)]));
  await page.mouse.move(la.x, la.y);
  await page.mouse.down();
  await page.mouse.move(lb.x, lb.y, { steps: 16 });
  await page.waitForTimeout(700);
  log('L preview', await status());
  await page.screenshot({ path: join(OUT, 'fence-l-preview.png') });
  await page.keyboard.press('Escape');
  await page.mouse.up().catch(() => undefined);
  await page.waitForTimeout(400);
  log('fences after cancelling the L', (await fences()).length);

  // ---- 2. a rectangle loop (Shift or the panel toggle); the panel toggle works on touch too
  await page.locator('.bb-tool-section[data-section="fence"] .seg[data-id="rect"]').click({ timeout: 30000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'fence-rectangle-panel.png') });
  log('rectangle tool', JSON.stringify(await page.evaluate(() => window.hearthside.game.buildTool())));
  // south-west yard: no floor tiles inside (the path runs at x=8..12), so the loop does not cut the house off
  const ra = await conv(4, 20), rb = await conv(7, 23);
  log('rect corners free', JSON.stringify([await free(ra), await free(rb)]));
  await page.mouse.move(ra.x, ra.y);
  await page.mouse.down();
  await page.mouse.move(rb.x, rb.y, { steps: 18 });
  await page.waitForTimeout(700);
  log('rectangle preview', await status());
  await page.screenshot({ path: join(OUT, 'fence-rectangle-preview.png') });
  await page.mouse.up();
  await page.waitForTimeout(900);
  const builtFences = await fences();
  log('fences after the loop', builtFences.length, JSON.stringify(builtFences.slice(0, 4)));
  await page.screenshot({ path: join(OUT, 'fence-rectangle-built.png') });

  // ---- 3. a gate on the north side of the loop, placed afterwards
  await page.locator('.bb-tool-section[data-section="fence"] .seg[data-id="gate"]').click({ timeout: 30000 });
  await page.waitForTimeout(300);
  const g = await conv(5.5, 20);
  log('gate point free', JSON.stringify(await free(g)));
  await page.mouse.click(g.x, g.y);
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, 'fence-gate-after.png') });
  log('gates after the click', await gates(), 'fences', (await fences()).length);
} finally {
  await browser.close().catch(() => undefined);
  server.kill();
}
