// Shared plumbing for the Milestone 13 browser scripts (tests/e2e/perf.mjs and tests/e2e/release.mjs): the browser
// lock, the production build, the preview server with its owner token, Playwright and a SwiftShader Chromium.
//
// Only one browser runs at a time on this machine: `withBrowserLock` re-runs the calling script under
// `flock /tmp/hearthside-browser.lock` (other sessions share the lock, so a run may wait). Never wrap these scripts in
// flock yourself.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const LOCK = '/tmp/hearthside-browser.lock';
export const PORT = 5190;
export const DIST = join(root, 'tests/e2e/out/dist');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function parseArgs(argv = process.argv.slice(2)) {
  const flag = (name) => argv.includes(`--${name}`);
  const opt = (name, def) => { const a = argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };
  return { argv, flag, opt };
}

/** Re-runs `scriptUrl` under the shared browser lock (once) and exits with its status. Call first thing. */
export function withBrowserLock(scriptUrl, argv) {
  if (process.env.HEARTHSIDE_E2E_LOCKED) return;
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(scriptUrl), ...argv], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_E2E_LOCKED: '1' },
  });
  process.exit(r.status ?? 1);
}

const require = createRequire(import.meta.url);
export function loadPlaywright() {
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

/** Waits for our own preview server; the owner token rules out another app that already holds the port. */
async function waitForServer(url, ms, server, owner) {
  let stderr = '';
  server?.stderr?.on('data', (d) => { stderr += d; });
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (server && server.exitCode !== null) throw new Error(`preview server for ${url} exited (${server.exitCode}): ${stderr.trim()}`);
    try {
      const r = await fetch(`${url}__e2e-owner.txt`);
      if (r.ok) {
        if ((await r.text()).trim() !== owner) throw new Error(`port ${PORT} is held by another server, not this run's build`);
        return;
      }
    } catch (e) { if (!/fetch failed|ENOTFOUND|ECONNREFUSED/.test(String(e))) throw e; }
    await sleep(250);
  }
  throw new Error(`server at ${url} did not start`);
}

/**
 * Builds (unless `noBuild` and a build exists), serves the build and launches Chromium with SwiftShader.
 * Returns { browser, url, close() }. `extraArgs` are added to the Chromium command line.
 */
export async function startBrowser({ noBuild = false, log = console.log, extraArgs = [] } = {}) {
  if (!noBuild || !existsSync(join(DIST, 'index.html'))) {
    log('building...');
    const b = spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', DIST, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
    if (b.status !== 0) throw new Error('vite build failed');
  }
  const owner = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(join(DIST, '__e2e-owner.txt'), owner);
  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const url = `http://127.0.0.1:${PORT}/`;
  let browser = null;
  try {
    await waitForServer(url, 20000, server, owner);
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({
      ...launchOptions(chromium),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', ...extraArgs],
    });
  } catch (e) {
    server.kill('SIGTERM');
    throw e;
  }
  return {
    browser, url,
    async close() { await browser?.close().catch(() => undefined); server.kill('SIGTERM'); },
  };
}

/** The three viewports used by the browser scripts. */
export const VIEWPORTS = {
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
};

/** A phone-like user agent for the emulated touch viewports (Chrome on Android). */
export const PHONE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

/** Settings written to localStorage before the page loads (tutorial off, no music; `extra` overrides). */
export function settingsInit(extra = {}) {
  const s = JSON.stringify({ tutorial: false, musicVolume: 0, ...extra });
  return `try { localStorage.setItem('hearthside.settings.v1', ${JSON.stringify(s)}); } catch (e) {}`;
}
