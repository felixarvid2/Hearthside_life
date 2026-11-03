// Shared helpers for the Milestone 9 exterior screenshot and check scripts: a vite dev server, a Playwright page in one of the three
// viewports, a started game, and small wrappers around the game API. Run scripts that use it under `flock /tmp/hearthside-browser.lock`.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);

export const VIEWPORTS = {
  portrait: { w: 390, h: 844, touch: true },
  landscape: { w: 844, h: 390, touch: true },
  desktop: { w: 1280, h: 720, touch: false },
};

export function loadPlaywright() {
  for (const p of [join(root, 'node_modules'), '/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try { return require(require.resolve('playwright', { paths: [p] })); } catch { /* next */ }
  }
  throw new Error('playwright is not installed');
}

export function launchOptions(chromium) {
  const opts = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
  if (!existsSync(chromium.executablePath())) {
    const chrome = [process.env.HEARTHSIDE_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && existsSync(p));
    if (chrome) opts.executablePath = chrome;
  }
  return opts;
}

export const DIST = process.env.EXT_DIST ?? '/tmp/hearthside-ext-dist';

/** Builds the game and the exterior sheet page into DIST (skipped with EXT_NO_BUILD=1 when it exists). */
export function buildDist() {
  if (process.env.EXT_NO_BUILD && existsSync(join(DIST, 'index.html'))) return;
  const r = spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', join(root, 'dev/exterior/vite.config.mjs'), '--logLevel', 'warn'], { cwd: root, stdio: 'inherit', env: { ...process.env, EXT_DIST: DIST } });
  if (r.status !== 0) throw new Error('vite build failed');
}

/** Builds, then serves DIST with `vite preview` on a port. Returns { url, stop }. */
export async function startServer(port = 5193) {
  buildDist();
  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', DIST, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  server.stderr.on('data', (d) => { err += d; });
  const url = `http://127.0.0.1:${port}/`;
  const end = Date.now() + 60000;
  for (;;) {
    if (server.exitCode !== null) throw new Error(`vite preview exited: ${err}`);
    try { const r = await fetch(url); if (r.ok) break; } catch { /* not yet */ }
    if (Date.now() > end) throw new Error('vite preview did not start');
    await new Promise((r) => setTimeout(r, 300));
  }
  return { url, stop: () => server.kill('SIGTERM') };
}

export async function openGame(browser, name, url) {
  const vp = VIEWPORTS[name];
  const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, ...(vp.touch ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.addInitScript(() => { try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, musicVolume: 0 })); } catch { /* ignore */ } });
  await page.goto(url, { waitUntil: 'load' });
  // the dev server may re-optimise dependencies on the first visit and reload the page: wait until the game stays ready
  for (let i = 0; i < 6; i++) {
    await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 180000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    if (await page.evaluate(() => window.hearthside?.ready === true).catch(() => false)) break;
  }
  return { page, context, errors, vp };
}

export async function startGame(page, { sandbox = false } = {}) {
  await page.evaluate(async (sb) => {
    const g = window.hearthside.game;
    const hh = g.premadeHouseholds();
    await g.startNewGame(sb ? 'sandbox' : 'create', hh.find((x) => x.members.length >= 2) ?? hh[0]);
    g.setSpeed(0);
  }, sandbox);
  await frames(page, 4);
}

export const frames = (page, n = 3, dt = 1 / 30) => page.evaluate(([n2, dt2]) => { for (let i = 0; i < n2; i++) window.hearthside.debug.frame(dt2); }, [n, dt]);

export async function shot(page, file) {
  await frames(page, 2);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => undefined);
  await page.screenshot({ path: file, timeout: 120000 });
}
