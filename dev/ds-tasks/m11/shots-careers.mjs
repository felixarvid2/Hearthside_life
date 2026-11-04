// Milestone 11, task A: screenshots of the in-game job list with all thirteen full careers, in portrait,
// landscape and desktop. Also checks that the list scrolls with no horizontal overflow and that a new career
// can be taken through the real career panel.
//
//   npm run build && flock /tmp/hearthside-browser.lock node dev/ds-tasks/m11/shots-careers.mjs
//
// Serves ./dist on port 5193 and writes PNGs plus a JSON log to dev/ds-tasks/m11/shots/.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const LOCK = '/tmp/hearthside-browser.lock';
// Browser runs share one lock. Re-exec under flock so the invocation itself is enough.
if (!process.env.HEARTHSIDE_CAREER_SHOTS_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_CAREER_SHOTS_LOCKED: '1' },
  });
  process.exit(r.status ?? 1);
}
const PORT = 5193;
const DIST = join(root, 'dist');
const OUT = here; // dev/ds-tasks/m11/shots is this directory's 'shots' sibling
const SHOTS = join(OUT, 'shots');
mkdirSync(SHOTS, { recursive: true });

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

const log = { checks: [], shots: [], viewports: [] };
const check = (name, ok, evidence) => {
  log.checks.push({ name, ok, evidence });
  console.log(`[shots] ${ok ? 'ok  ' : 'FAIL'} ${name}${evidence ? ` — ${evidence}` : ''}`);
};

async function waitForServer(url, ms, server, owner) {
  let stderr = '';
  server?.stderr?.on('data', (d) => { stderr += d; });
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (server && server.exitCode !== null) throw new Error(`preview server exited (${server.exitCode}): ${stderr.trim()}`);
    try {
      const r = await fetch(`${url}__e2e-owner.txt`);
      if (r.ok) {
        if ((await r.text()).trim() !== owner) throw new Error(`port ${PORT} is held by another server`);
        return;
      }
    } catch (e) { if (!/fetch failed|ENOTFOUND|ECONNREFUSED/.test(String(e))) throw e; }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server at ${url} did not start`);
}

const VIEWPORTS = [
  { name: 'portrait', width: 390, height: 844, isMobile: true },
  { name: 'landscape', width: 844, height: 390, isMobile: true },
  { name: 'desktop', width: 1280, height: 720, isMobile: false },
];

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('run `npm run build` first: dist/ is missing');
  const owner = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(join(DIST, '__e2e-owner.txt'), owner);
  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser = null;
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`, 20000, server, owner);
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({ ...launchOptions(chromium), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.isMobile, hasTouch: vp.isMobile });
      await context.addInitScript(() => {
        try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, musicVolume: 0 })); } catch { /* ignore */ }
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
      await page.waitForTimeout(600);

      const started = await page.evaluate(async () => {
        const g = window.hearthside.game;
        const hhs = g.premadeHouseholds();
        const r = await g.startNewGame('guided', hhs.find((h) => h.members.length >= 2) ?? hhs[0]);
        g.setSpeed(0);
        return r;
      });
      if (!started.ok) throw new Error(`startNewGame failed: ${started.reason}`);
      await page.waitForTimeout(500);

      // Pick a grown-up, quit any existing job and open the career tab.
      const person = await page.evaluate(() => {
        const st = window.hearthside.debug.state();
        const hh = st.households[st.activeHouseholdId];
        const p = hh.memberIds.map((id) => st.people[id]).find((x) => x.lifeStage === 'adult' || x.lifeStage === 'youngAdult');
        if (p?.career) window.hearthside.game.quitCareer(p.id);
        window.hearthside.game.select(p.id);
        return { id: p.id, name: p.firstName, stage: p.lifeStage };
      });
      await page.locator(`.member[data-person-id="${person.id}"]`).click();
      await page.waitForSelector('.person-panel:not([hidden])', { timeout: 5000 }).catch(() => undefined);
      await page.locator('.person-panel .tab[data-id="career"]').click();
      await page.waitForTimeout(450);

      const list = page.locator('.person-panel .career-list');
      const count = await page.locator('.person-panel .career-choice').count();
      const geometry = await page.evaluate(() => {
        const body = document.querySelector('.person-panel .panel-body');
        const list = document.querySelector('.person-panel .career-list');
        if (!body || !list) return null;
        const br = body.getBoundingClientRect();
        const lr = list.getBoundingClientRect();
        return {
          panel: [Math.round(br.left), Math.round(br.top), Math.round(br.width), Math.round(br.height)],
          list: [Math.round(lr.left), Math.round(lr.top), Math.round(lr.width), Math.round(lr.height)],
          scrollHeight: body.scrollHeight, clientHeight: body.clientHeight,
          scrollWidth: body.scrollWidth, clientWidth: body.clientWidth,
          listScrollWidth: list.scrollWidth, listClientWidth: list.clientWidth,
          names: [...document.querySelectorAll('.person-panel .career-choice-name')].map((n) => n.textContent.trim()),
          vw: innerWidth, vh: innerHeight,
        };
      });
      const names = geometry?.names ?? [];
      const expected = ['Athletics', 'Business', 'Culinary', 'Design and Architecture', 'Education', 'Hospitality', 'Journalism',
        'Landscaping', 'Medicine', 'Music', 'Science', 'Software', 'Visual Arts'];
      check(`${vp.name}: the career panel lists all 13 full careers`, count === 13 && expected.every((n) => names.includes(n)), `${count} cards: ${names.join(', ')}`);
      check(`${vp.name}: the list fits the width without horizontal overflow`, !!geometry && geometry.scrollWidth <= geometry.clientWidth + 1 && geometry.listScrollWidth <= geometry.listClientWidth + 1,
        geometry ? `scrollWidth ${geometry.scrollWidth}/${geometry.clientWidth}, list ${geometry.listScrollWidth}/${geometry.listClientWidth}` : 'missing');
      check(`${vp.name}: the list is taller than the panel and scrolls`, !!geometry && geometry.scrollHeight > geometry.clientHeight, geometry ? `${geometry.scrollHeight} > ${geometry.clientHeight}` : 'missing');
      check(`${vp.name}: the list stays inside the viewport`, !!geometry && geometry.list[0] >= 0 && geometry.list[0] + geometry.list[2] <= geometry.vw + 1,
        geometry ? `list x ${geometry.list[0]}..${geometry.list[0] + geometry.list[2]} of ${geometry.vw}` : 'missing');
      check(`${vp.name}: no page errors while opening the career panel`, errors.length === 0, errors.slice(0, 3).join(' | '));

      const shotName = (suffix) => `${vp.name}-${suffix}`;
      await page.screenshot({ path: join(SHOTS, `${shotName('career-list-top')}.png`) });
      log.shots.push(`${shotName('career-list-top')}.png`);
      await list.scrollIntoViewIfNeeded();
      await page.evaluate(() => { const b = document.querySelector('.person-panel .panel-body'); if (b) b.scrollTop = b.scrollHeight; });
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(SHOTS, `${shotName('career-list-bottom')}.png`) });
      log.shots.push(`${shotName('career-list-bottom')}.png`);
      await page.evaluate(() => { const b = document.querySelector('.person-panel .panel-body'); if (b) b.scrollTop = 0; });
      await page.waitForTimeout(150);

      // Take the Education job through the real panel, then check the state.
      if (vp.name === 'desktop') {
        const card = page.locator('.person-panel .career-choice', { hasText: 'Education' }).first();
        const take = card.locator('button', { hasText: 'Take job' });
        await take.click();
        await page.waitForTimeout(350);
        const career = await page.evaluate((id) => window.hearthside.debug.state().people[id].career?.careerId ?? null, person.id);
        check('desktop: Education can be taken from the career panel', career === 'education', `career ${career}`);
        await page.screenshot({ path: join(SHOTS, 'desktop-education-taken.png') });
        log.shots.push('desktop-education-taken.png');
      }
      // ---- Creator starting-job list: the same thirteen careers as radio cards, plus "No job".
      await page.evaluate(() => window.hearthside.game.showMenu());
      await page.waitForSelector('.menu-screen', { timeout: 5000 });
      await page.locator('.menu-screen button', { hasText: 'New Game' }).first().click();
      await page.waitForTimeout(200);
      await page.locator('.menu-screen button', { hasText: 'Create a Household' }).first().click();
      await page.waitForSelector('.cr-steps', { timeout: 30000 });
      await page.locator('.cr-steps .tab[data-id="personality"]').click();
      const jobGrid = page.locator('[aria-label="Starting job"]');
      await jobGrid.waitFor({ timeout: 10000 });
      await page.locator('.cr-sec-title', { hasText: 'Starting job' }).scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      const creator = await page.evaluate(() => {
        const grid = document.querySelector('[aria-label="Starting job"]');
        if (!grid) return null;
        const gr = grid.getBoundingClientRect();
        return {
          cards: grid.querySelectorAll('.cr-card').length,
          names: [...grid.querySelectorAll('.cr-card-title')].map((n) => n.textContent.trim()),
          gridWidth: gr.width, scrollWidth: grid.scrollWidth, clientWidth: grid.clientWidth,
          inViewport: gr.left >= 0 && gr.right <= innerWidth + 1,
        };
      });
      const creatorNames = creator?.names ?? [];
      check(`${vp.name}: the creator starting-job list offers all 13 full careers plus "No job"`, creator?.cards === 14 && expected.every((n) => creatorNames.includes(n)),
        `${creator?.cards ?? 0} cards: ${creatorNames.join(', ')}`);
      check(`${vp.name}: the creator job list wraps without horizontal overflow`, !!creator && creator.scrollWidth <= creator.clientWidth + 1 && creator.inViewport,
        creator ? `grid ${creator.scrollWidth}/${creator.clientWidth}, in viewport ${creator.inViewport}` : 'missing');
      const educCard = jobGrid.locator('.cr-card', { hasText: 'Education' }).first();
      await educCard.click();
      await page.waitForTimeout(200);
      check(`${vp.name}: a new career can be chosen as the starting job`, (await educCard.getAttribute('aria-checked')) === 'true',
        `aria-checked ${await educCard.getAttribute('aria-checked')}`);
      await page.screenshot({ path: join(SHOTS, `${vp.name}-creator-starting-jobs.png`) });
      log.shots.push(`${vp.name}-creator-starting-jobs.png`);

      log.viewports.push({ ...vp, person, geometry, creator });
      await context.close();
    }
  } finally {
    await browser?.close().catch(() => undefined);
    server.kill('SIGTERM');
  }
  writeFileSync(join(SHOTS, 'career-list-log.json'), JSON.stringify(log, null, 2));
  const failed = log.checks.filter((c) => !c.ok);
  console.log(`[shots] ${log.checks.length - failed.length}/${log.checks.length} checks passed, ${log.shots.length} screenshots`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error('[shots] failed:', e); process.exitCode = 1; });
