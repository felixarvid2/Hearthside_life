// Task D (Milestone 11) screenshots: the trait picker with 40 traits and the aspiration stage panel, in portrait
// (390x844), landscape (844x390) and desktop (1280x720). Self-locks /tmp/hearthside-browser.lock and builds its own
// copy of the game, so it never fights the e2e runs or another task's preview.
//
//   node dev/ds-tasks/m11/shoot-d.mjs
//
// Screenshots go to dev/ds-tasks/m11/shots/.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5196;
const DIST = join(root, 'tests/e2e/out/dist-m11d');
const OUT = join(here, 'shots');
mkdirSync(OUT, { recursive: true });

if (!process.env.HEARTHSIDE_M11D_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url)], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_M11D_LOCKED: '1' },
  });
  process.exit(r.status ?? 1);
}

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of [join(root, 'node_modules'), '/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try { return require(require.resolve('playwright', { paths: [p] })); } catch { /* next */ }
  }
  throw new Error('playwright is not installed');
}
function launchOptions(chromium) {
  const opts = {};
  if (!existsSync(chromium.executablePath())) {
    const chrome = [process.env.HEARTHSIDE_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && existsSync(p));
    if (chrome) opts.executablePath = chrome;
  }
  return opts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const note = (name, ok, evidence = '') => { log.push({ name, ok, evidence }); console.log(`[m11-d] ${ok ? 'ok  ' : 'FAIL'} ${name}${evidence ? ` — ${evidence}` : ''}`); };

const VIEWPORTS = [
  { id: 'portrait', width: 390, height: 844, mobile: true },
  { id: 'landscape', width: 844, height: 390, mobile: true },
  { id: 'desktop', width: 1280, height: 720, mobile: false },
];

async function waitForServer(url, ms, server) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (server.exitCode !== null) throw new Error(`preview server exited (${server.exitCode})`);
    try { const r = await fetch(url); if (r.ok) return; } catch { /* wait */ }
    await sleep(250);
  }
  throw new Error(`server at ${url} did not start`);
}

async function openPersonality(page) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
  const tap = page.viewportSize().width < 500;
  const click = async (loc) => { if (tap) await loc.tap(); else await loc.click(); };
  await click(page.getByRole('button', { name: /New Game/ }).first());
  await click(page.getByText('Create a Household').first());
  await page.waitForSelector('.cr-panel', { timeout: 30000 });
  await page.waitForSelector('[role="tab"][data-id="personality"]', { timeout: 30000 });
  await click(page.locator('[role="tab"][data-id="personality"]'));
  await page.waitForSelector('.cr-step-personality', { timeout: 30000 });
  await page.waitForTimeout(1200); // let the preview settle and the step paint.
}

/** The element that actually scrolls the panel: `.cr-body` normally, the panel itself in short landscape. */
async function scrollBodyTo(page, selector) {
  await page.evaluate((sel) => {
    const target = document.querySelector(sel);
    if (!target) return;
    const scrolls = (el) => el && (getComputedStyle(el).overflowY === 'auto' || getComputedStyle(el).overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2;
    const scroller = [document.querySelector('.cr-body'), document.querySelector('.cr-panel')].find(scrolls);
    if (!scroller) return;
    const t = target.getBoundingClientRect();
    const b = scroller.getBoundingClientRect();
    scroller.scrollTop += t.top - b.top - 8;
  }, selector);
  await page.waitForTimeout(400);
}

async function main() {
  console.log('[m11-d] building', DIST);
  const build = spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', DIST, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
  if (build.status !== 0) throw new Error('vite build failed');

  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser = null;
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`, 30000, server);
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({ ...launchOptions(chromium), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1,
        ...(vp.mobile ? { isMobile: true, hasTouch: true } : {}),
      });
      await context.addInitScript(() => { try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, hints: false, musicVolume: 0 })); } catch { /* ignore */ } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await openPersonality(page);

      // The picker is grouped by category, every trait is a card, and the whole set is reachable by scrolling.
      const dom = await page.evaluate(() => {
        const labels = [...document.querySelectorAll('.cr-trait-group .cr-group-label')].map((e) => e.textContent ?? '');
        const cards = [...document.querySelectorAll('.cr-trait-grid .cr-card')];
        const body = document.querySelector('.cr-body');
        const panel = document.querySelector('.cr-panel');
        const scrolls = (el) => el && (getComputedStyle(el).overflowY === 'auto' || getComputedStyle(el).overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2;
        const scroller = [body, panel].find(scrolls) ?? null;
        return {
          labels,
          cards: cards.length,
          titles: cards.map((c) => c.querySelector('.cr-card-title')?.textContent ?? ''),
          metas: cards.filter((c) => (c.querySelector('.cr-card-meta')?.textContent ?? '').trim().length > 0).length,
          scroll: scroller ? { cls: scroller.className, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight, overflowY: getComputedStyle(scroller).overflowY } : null,
        };
      });
      note(`${vp.id}: all 40 traits are rendered`, dom.cards === 40, `${dom.cards} cards`);
      note(`${vp.id}: grouped into six categories with counts`, dom.labels.length === 6 && dom.labels.every((l) => /\(\d+\)$/.test(l)), dom.labels.join(' | '));
      note(`${vp.id}: every trait card explains its effect`, dom.metas === 40, `${dom.metas} with effect meta`);
      note(`${vp.id}: the panel scrolls`, !!dom.scroll, JSON.stringify(dom.scroll));

      await page.evaluate(() => {
        const scrolls = (el) => el && (getComputedStyle(el).overflowY === 'auto' || getComputedStyle(el).overflowY === 'scroll');
        for (const el of [document.querySelector('.cr-body'), document.querySelector('.cr-panel')]) if (scrolls(el)) el.scrollTop = 0;
      });
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(OUT, `traits-${vp.id}.png`) });
      await scrollBodyTo(page, '.cr-trait-group:nth-of-type(3)');
      await page.screenshot({ path: join(OUT, `traits-${vp.id}-scrolled.png`) });
      await scrollBodyTo(page, '.cr-sec:nth-of-type(2)');
      // Show a new aspiration's stages: pick True Artist unless one is already chosen.
      const artist = page.locator('[aria-label="Aspirations"] .cr-card').filter({ has: page.locator('.cr-card-title', { hasText: /^True Artist$/ }) });
      if ((await artist.getAttribute('aria-checked')) !== 'true') {
        if (vp.mobile) await artist.tap(); else await artist.click();
        await page.waitForTimeout(300);
        await scrollBodyTo(page, '.cr-sec:nth-of-type(2)');
      }
      await page.screenshot({ path: join(OUT, `aspirations-${vp.id}.png`) });
      await scrollBodyTo(page, '.cr-asp-host');
      await page.screenshot({ path: join(OUT, `aspirations-${vp.id}-stages.png`) });
      const stageRows = await page.locator('.cr-asp-stages .cr-asp-stage').count();
      note(`${vp.id}: the chosen aspiration shows its three stages`, stageRows === 3, `${stageRows} stages`);
      note(`${vp.id}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' / '));
      await context.close();
    }

    // Conflict explanation: pick one half of a declared opposite and check the other half is disabled with a reason.
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      await openPersonality(page);
      const card = (title) => page.locator('.cr-trait-grid .cr-card').filter({ has: page.locator('.cr-card-title', { hasText: new RegExp(`^${title}$`) }) });
      await page.getByRole('button', { name: /Reset personality/ }).click();
      await page.waitForTimeout(300);
      const outgoing = card('Outgoing');
      if ((await outgoing.getAttribute('aria-checked')) !== 'true') await outgoing.click();
      await page.waitForTimeout(300);
      const result = await page.evaluate(() => [...document.querySelectorAll('.cr-trait-grid .cr-card')]
        .filter((c) => c.getAttribute('aria-disabled') === 'true')
        .map((c) => ({ title: c.querySelector('.cr-card-title')?.textContent ?? '', reason: c.querySelector('.cr-card-reason')?.textContent ?? '' })));
      const explained = result.filter((r) => /reserved|homebody/i.test(r.title) && r.reason.trim().length > 0);
      note('opposites are disabled and explained', explained.length > 0, explained.map((r) => `${r.title}: ${r.reason}`).join(' | '));
      await scrollBodyTo(page, '.cr-sec:nth-of-type(1)');
      await page.screenshot({ path: join(OUT, 'conflict-explained-desktop.png') });
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGTERM');
    writeFileSync(join(OUT, 'shots.json'), JSON.stringify(log, null, 2));
  }

  const failed = log.filter((l) => !l.ok);
  console.log(`[m11-d] ${log.length - failed.length}/${log.length} checks passed; screenshots in dev/ds-tasks/m11/shots/`);
  if (failed.length) process.exitCode = 1;
}

await main();
