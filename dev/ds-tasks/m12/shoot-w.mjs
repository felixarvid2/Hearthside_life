// Task W (Milestone 12) visual check: the season + weather HUD chip, the forecast line in the feed, the seasonal
// rendering (snow, rain, clear) and the four new settings, in portrait 390x844, landscape 844x390 and desktop
// 1280x720. Self-locks /tmp/hearthside-browser.lock and builds its own copy of the game.
//
//   flock /tmp/hearthside-browser.lock node dev/ds-tasks/m12/shoot-w.mjs
//
// Screenshots go to dev/ds-tasks/m12/shots/W/.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5197;
const DIST = join(root, 'tests/e2e/out/dist-m12w');
const OUT = join(here, 'shots/W');
mkdirSync(OUT, { recursive: true });

if (!process.env.HEARTHSIDE_M12W_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url)], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_M12W_LOCKED: '1' },
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
const note = (name, ok, evidence = '') => { log.push({ name, ok, evidence }); console.log(`[m12-w] ${ok ? 'ok  ' : 'FAIL'} ${name}${evidence ? ` — ${evidence}` : ''}`); };

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

async function startGame(page) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
  const started = await page.evaluate(async () => {
    const g = window.hearthside.game;
    const hhs = g.premadeHouseholds();
    const r = await g.startNewGame('guided', hhs.find((h) => h.members.length >= 2) ?? hhs[0]);
    g.setSpeed(0);
    return r;
  });
  if (!started.ok) throw new Error(`startNewGame failed: ${started.reason}`);
  await page.waitForTimeout(500);
  await page.evaluate(() => { document.querySelectorAll('.toast, .toasts > *').forEach((t) => t.remove()); window.hearthside.debug.step(20); });
  await frames(page, 6);
}

const frames = (page, n, dt = 1 / 30) => page.evaluate(([n2, dt2]) => { for (let i = 0; i < n2; i++) window.hearthside.debug.frame(dt2); }, [n, dt]);

/** Puts the world on a chosen season day and weather, then lets the HUD and the renderer catch up. */
async function setSky(page, season, weather, dayInSeason) {
  await page.evaluate(([s, w, d]) => {
    const h = window.hearthside, g = h.game, st = g.state();
    const seasonIndex = { spring: 0, summer: 1, autumn: 2, winter: 3 }[s];
    st.settings.seasons = true;
    st.settings.weather = true;
    st.settings.seasonDays = 7;
    const day = seasonIndex * 7 + (d - 1);
    st.clock.minutes = day * 1440 + 9 * 60;
    st.weather = { current: w, today: [w, w], tomorrow: [w, w], day, since: day * 1440 };
    h.debug.step(2);
    h.view.frameLot(true);
  }, [season, weather, dayInSeason]);
  await frames(page, 5);
  // The clock/HUD refreshes on a 250 ms timer by design, so wait for the chip to catch up before reading or
  // screenshotting; otherwise the check races the refresh and reads the previous sky.
  const label = `${season[0].toUpperCase()}${season.slice(1)}, day ${dayInSeason} - ${weather[0].toUpperCase()}${weather.slice(1)}`;
  await page.waitForFunction((want) => document.querySelector('.clock-sky')?.getAttribute('title') === want, label, { timeout: 30000, polling: 250 });
}

async function hudState(page) {
  return page.evaluate(() => {
    const sky = document.querySelector('.clock-sky');
    const seasonIcon = document.querySelector('.clock-season-icon');
    const weatherIcon = document.querySelector('.clock-weather-icon');
    return {
      exists: !!sky,
      text: sky?.textContent?.trim() ?? '',
      title: sky?.getAttribute('title') ?? '',
      aria: sky?.getAttribute('aria-label') ?? '',
      clockAria: document.querySelector('.clock')?.getAttribute('aria-label') ?? '',
      seasonIcon: !!seasonIcon?.querySelector('svg'),
      weatherIcon: !!weatherIcon?.querySelector('svg'),
      visible: !!sky && sky.getBoundingClientRect().width > 0,
    };
  });
}

async function openFeed(page, mobile) {
  const btn = page.locator('[aria-label^="Event feed"]').first();
  if (mobile) await btn.tap(); else await btn.click();
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const line = document.querySelector('.feed-forecast');
    return { text: line?.textContent?.trim() ?? '', hidden: !!line && (line.hidden || line.getBoundingClientRect().height === 0) };
  });
}

async function openSettings(page, mobile) {
  const click = async (loc) => { if (mobile) await loc.tap(); else await loc.click(); };
  await click(page.getByRole('button', { name: 'Menu', exact: true }).first());
  await page.waitForTimeout(500);
  await click(page.getByRole('button', { name: /^Settings/ }).first());
  await page.waitForSelector('.settings-modal', { timeout: 30000 });
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.settings-modal .switch-label')].map((e) => e.textContent?.trim() ?? '');
    const sw = (label) => document.querySelector(`.settings-modal button[role="switch"][aria-label="${label}"]`);
    const seg = [...document.querySelectorAll('.settings-modal .segmented, .settings-modal [role="group"]')].map((e) => e.textContent ?? '').join(' | ');
    const im = (label) => {
      const b = sw(label);
      return b ? { on: b.getAttribute('aria-checked'), disabled: b.disabled } : null;
    };
    const box = (label) => {
      const b = sw(label);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
    };
    return {
      labels,
      seasons: im('Seasons'), weather: im('Weather'), effects: im('Weather effects'),
      boxes: { seasons: box('Seasons'), weather: box('Weather'), effects: box('Weather effects') },
      seasonDays: /3 days/.test(seg) && /7 days/.test(seg) && /14 days/.test(seg),
    };
  });
  // The settings list is long: bring the season controls into view for the screenshot (they sit below the fold in
  // portrait and landscape).
  await page.evaluate(() => document.querySelector('.settings-modal button[role="switch"][aria-label="Seasons"]')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(250);
  return state;
}

async function main() {
  console.log('[m12-w] building', DIST);
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
      await context.addInitScript(() => { try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, musicVolume: 0 })); } catch { /* ignore */ } });
      const page = await context.newPage();
      page.setDefaultTimeout(120_000); // software rendering can be slow under load; screenshots alone can take 30 s
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await startGame(page);

      // Winter snow: chip, icons, title and the snow-covered render.
      await setSky(page, 'winter', 'snow', 1);
      let hud = await hudState(page);
      note(`${vp.id}: the clock shows the season and weather`, hud.visible && /Winter, day 1 - Snow/.test(`${hud.text} ${hud.title} ${hud.aria}`), `${hud.text} | title=${hud.title}`);
      note(`${vp.id}: season and weather icons are drawn`, hud.seasonIcon && hud.weatherIcon);
      note(`${vp.id}: the clock aria-label carries the sky`, /Winter, day 1 - Snow/.test(hud.clockAria), hud.clockAria);
      await page.screenshot({ path: join(OUT, `winter-snow-${vp.id}.png`) });

      const feed = await openFeed(page, vp.mobile);
      note(`${vp.id}: the feed shows a forecast for today and tomorrow`, !feed.hidden && /Forecast: today Snow then Snow · tomorrow Snow then Snow\./.test(feed.text), feed.text);
      await page.screenshot({ path: join(OUT, `forecast-${vp.id}.png`) });
      await openFeed(page, vp.mobile); // close again

      // Autumn rain.
      await setSky(page, 'autumn', 'rain', 3);
      hud = await hudState(page);
      note(`${vp.id}: autumn rain reads in the clock`, /Autumn, day 3 - Rain/.test(`${hud.text} ${hud.title}`), hud.text);
      await page.screenshot({ path: join(OUT, `autumn-rain-${vp.id}.png`) });

      // Spring clear.
      await setSky(page, 'spring', 'clear', 2);
      hud = await hudState(page);
      note(`${vp.id}: spring clear reads in the clock`, /Spring, day 2 - Clear/.test(`${hud.text} ${hud.title}`), hud.text);
      await page.screenshot({ path: join(OUT, `spring-clear-${vp.id}.png`) });

      // The interior must stay readable in the snow.
      if (vp.id !== 'landscape') {
        await setSky(page, 'winter', 'snow', 1);
        // Frame the whole lot with the cutaway on: the interior rooms, furniture and people must stay readable under
        // the snow light (a close glide would just fill the screen with one wall).
        await page.evaluate(() => { const h = window.hearthside; h.game.view.setCutaway('cutaway'); h.view.frameLot(true); });
        await frames(page, 10);
        await page.screenshot({ path: join(OUT, `winter-snow-interior-${vp.id}.png`) });
        await page.evaluate(() => { window.hearthside.game.view.setCutaway('up'); window.hearthside.view.frameLot(true); });
        await frames(page, 5);
      }

      // Settings: the three season/weather controls and the render-only effects toggle.
      const s = await openSettings(page, vp.mobile);
      note(`${vp.id}: settings list the season and weather controls`, s.seasons && s.weather && s.effects && s.seasonDays,
        `labels=${JSON.stringify(s.labels)} seasons=${JSON.stringify(s.seasons)}@${JSON.stringify(s.boxes.seasons)} weather=${JSON.stringify(s.weather)}@${JSON.stringify(s.boxes.weather)} effects=${JSON.stringify(s.effects)}@${JSON.stringify(s.boxes.effects)} seasonDays=${s.seasonDays}`);
      note(`${vp.id}: they are enabled with a game running`, !!s.seasons && !s.seasons.disabled && !!s.weather && !s.weather.disabled && !!s.effects && !s.effects.disabled);
      await page.screenshot({ path: join(OUT, `settings-${vp.id}.png`) });
      if (vp.id === 'desktop') {
        // toggling Weather off writes the world setting and the chip says so
        await page.locator('.settings-modal button[role="switch"][aria-label="Weather"]').click();
        await page.waitForTimeout(500);
        const off = await page.evaluate(() => window.hearthside.game.state()?.settings.weather);
        note('desktop: the Weather toggle writes the world setting', off === false, String(off));
        await page.locator('.settings-modal button[role="switch"][aria-label="Weather"]').click();
        await page.waitForTimeout(300);
        await page.locator('.settings-modal button[role="switch"][aria-label="Weather effects"]').click();
        await page.waitForTimeout(300);
        const fx = await page.evaluate(() => window.hearthside.game.settings().weatherEffects);
        note('desktop: the Weather effects toggle writes the device setting', fx === false, String(fx));
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      note(`${vp.id}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' / '));
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGTERM');
    writeFileSync(join(OUT, 'shots.json'), JSON.stringify(log, null, 2));
  }

  const failed = log.filter((l) => !l.ok);
  console.log(`[m12-w] ${log.length - failed.length}/${log.length} checks passed; screenshots in dev/ds-tasks/m12/shots/W/`);
  if (failed.length) process.exitCode = 1;
}

await main();
