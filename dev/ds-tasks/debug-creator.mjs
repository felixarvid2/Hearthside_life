// Temporary layout diagnostic for the creator in compact landscape (844x390). Prints the boxes and computed styles of
// the creator root, preview and panel so the "content paints over the preview" state can be identified. Not a test.

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const DIST = join(root, 'tests/e2e/out/dist-creator');
const PORT = 5193;
const OUT = join(root, 'tests/e2e/out/debug-creator');
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [join(root, 'node_modules')] }));

function launchOptions() {
  if (!existsSync(chromium.executablePath())) {
    const chrome = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p));
    if (chrome) return { executablePath: chrome };
  }
  return {};
}

const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) break; } catch { /* wait */ } await sleep(250); }
  const browser = await chromium.launch({ ...launchOptions(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.addInitScript(() => { try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, musicVolume: 0 })); } catch { /* ignore */ } });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
  await page.getByRole('button', { name: /New Game/ }).first().tap();
  await page.getByText('Create a Household').first().tap();
  await page.waitForSelector('.cr-panel', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const desc = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return {
        tag: el.tagName, cls: String(el.className).slice(0, 100), hidden: el.hidden,
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        bg: cs.backgroundColor, position: cs.position, display: cs.display, overflow: cs.overflow,
        transform: cs.transform, z: cs.zIndex,
        scroll: [el.scrollLeft, el.scrollTop, el.scrollWidth, el.scrollHeight, el.clientWidth, el.clientHeight],
        offset: [el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight],
      };
    };
    const body = document.body, cr = document.querySelector('.cr');
    const panel = document.querySelector('.cr-panel');
    const pbody = document.querySelector('.cr-body');
    const pv = document.querySelector('.cr-pv');
    const sec = document.querySelector('.cr-body .cr-sec');
    const chain = [];
    for (let el = pbody; el && el !== body; el = el.parentElement) chain.push(desc(el));
    return { bodyClasses: [...body.classList], viewport: [innerWidth, innerHeight], cr: desc(cr), panel: desc(panel), pbody: desc(pbody), pv: desc(pv), sec: desc(sec), chain };
  });
  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: join(OUT, 'landscape-creator.png') });
  // Which element is on top where the copied-over content appears? If the content belongs to the panel, its rects must
  // sit inside the panel box; if it is painted elsewhere, hiding the panel removes it.
  const hits = await page.evaluate(() => {
    const at = (x, y) => document.elementsFromPoint(x, y).slice(0, 4).map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`);
    return { p30_120: at(30, 120), p250_120: at(250, 120), p500_300: at(500, 300), p700_100: at(700, 100), p250_60: at(250, 60) };
  });
  console.log('elementsFromPoint', JSON.stringify(hits, null, 2));
  await page.evaluate(() => { const p = document.querySelector('.cr-panel'); if (p) p.style.display = 'none'; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'landscape-no-panel.png') });
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx2.addInitScript(() => { try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, musicVolume: 0 })); } catch { /* ignore */ } });
  const page2 = await ctx2.newPage();
  await page2.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page2.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
  await page2.getByRole('button', { name: /New Game/ }).first().click();
  await page2.getByText('Create a Household').first().click();
  await page2.waitForSelector('.cr-panel', { timeout: 30000 });
  await page2.waitForTimeout(2500);
  const info2 = await page2.evaluate(() => {
    const pick = (s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], bg: cs.backgroundColor, position: cs.position, overflow: cs.overflow, scroll: [el.scrollLeft, el.scrollTop, el.scrollWidth, el.scrollHeight, el.clientWidth, el.clientHeight] }; };
    return { panel: pick('.cr-panel'), body: pick('.cr-body'), pv: pick('.cr-pv'), sec: pick('.cr-body .cr-sec') };
  });
  console.log('desktop', JSON.stringify(info2, null, 2));
  await browser.close();
} finally {
  server.kill('SIGTERM');
}
