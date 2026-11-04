// Milestone 11, task C: screenshots of a resident using the camera tripod, the stocked garden pond and the
// telescope, plus the Skills panel showing Photography, Fishing and Research in portrait, landscape and desktop.
//
//   npm run build && npm run visual:m11:skills-c
//
// The script re-executes itself under flock /tmp/hearthside-browser.lock, serves ./dist on its own port and
// writes PNGs plus a JSON log to dev/ds-tasks/m11/shots/.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const LOCK = '/tmp/hearthside-browser.lock';
if (!process.env.HEARTHSIDE_SKILLS_C_SHOTS_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_SKILLS_C_SHOTS_LOCKED: '1' },
  });
  process.exit(r.status ?? 1);
}
const PORT = 5194;
const DIST = join(root, 'dist');
const SHOTS = join(here, 'shots');
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

/** Waits for a couple of real frames and a pause, so the software renderer has painted the last change. */
const settle = async (page, ms = 600) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 250)))));
};

/** Centres the camera on the person and zooms in so they and the object they use fill the frame. */
async function framePerson(page, personId) {
  await page.evaluate((id) => window.hearthside.game.view.focusPerson(id), personId);
  await page.waitForTimeout(900);
  for (const factor of [1.6, 1.3]) {
    const anchor = await page.evaluate((id) => window.hearthside.game.view.anchorOf({ kind: 'person', personId: id }), personId);
    if (anchor) await page.evaluate(({ f, x, y }) => window.hearthside.game.view.zoomAt(f, x, y), { f: factor, x: anchor.x, y: anchor.y });
    await page.waitForTimeout(350);
  }
  await page.evaluate((id) => window.hearthside.game.view.focusPerson(id), personId);
  await page.waitForTimeout(900);
  await settle(page);
}

/** Buys and places the three practice objects, and returns the resident and object ids. */
function setup() {
  const g = window.hearthside.game;
  const st = window.hearthside.debug.state();
  st.households[st.activeHouseholdId].funds = 100_000_000;
  st.settings.visitors = false;
  st.settings.autoPayBills = true;
  const person = st.people[st.households[st.activeHouseholdId].memberIds[0]];
  if (person.career) g.quitCareer(person.id);
  g.setMode('buy');
  const all = [];
  const lot = st.lots[st.activeLotId];
  for (let i = 0; i < lot.width * lot.depth; i++) all.push({ x: i % lot.width, z: Math.floor(i / lot.width) });
  const place = (defId, spots) => {
    for (const t of spots ?? all) {
      const before = new Set(Object.keys(lot.objects));
      const s = g.startPlacement(defId);
      if (!s.ok) throw new Error(`${defId} cannot be placed: ${s.reason}`);
      window.hearthside.core.placementTile(t.x, t.z);
      if (g.placement()?.ok && g.confirmPlacement().ok) {
        const placed = Object.values(lot.objects).find((o) => o.defId === defId && !before.has(o.id));
        if (!placed) throw new Error(`${defId} was placed but is missing from the lot`);
        return placed.id;
      }
      g.cancelPlacement();
    }
    throw new Error(`no free spot for ${defId}`);
  };
  // Keep all three practices in the open back yard, near the pond, so walls never hide the person.
  const yard = [
    { x: 20, z: 18 }, { x: 19, z: 18 }, { x: 18, z: 18 }, { x: 17, z: 18 },
    { x: 20, z: 17 }, { x: 19, z: 17 }, { x: 18, z: 17 }, { x: 20, z: 16 }, { x: 19, z: 16 },
  ];
  const placeAny = (defId, spots) => {
    try { return place(defId, spots); } catch { return place(defId); }
  };
  const pond = place('garden-pond-fishing', [
    { x: 20, z: 20 }, { x: 18, z: 20 }, { x: 20, z: 18 }, { x: 16, z: 20 }, { x: 20, z: 16 },
  ]);
  const camera = placeAny('camera-tripod', yard);
  const telescope = placeAny('telescope', yard);
  g.setMode('live');
  g.select(person.id);
  g.view.focusPerson(person.id);
  return { personId: person.id, name: person.firstName, camera, telescope, pond };
}

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

      const gameStarted = await page.evaluate(async () => {
        const g = window.hearthside.game;
        const r = await g.startNewGame('guided', g.premadeHouseholds()[0]);
        g.setSpeed(0);
        return r;
      });
      if (!gameStarted.ok) throw new Error(`startNewGame failed: ${gameStarted.reason}`);
      await page.waitForTimeout(400);

      const started = await page.evaluate(async (setupSrc) => {
        // eslint-disable-next-line no-eval
        const run = (0, eval)(`(${setupSrc})`);
        return run();
      }, setup.toString()).catch((e) => { throw new Error(`setup failed: ${e.message}`); });
      const { personId, camera, telescope, pond } = started;
      void camera; void telescope; void pond;
      await page.waitForTimeout(400);

      // Queue one practice action through the real menu option list and step until the person is performing it.
      const begin = async (interactionId, pick) => page.evaluate(({ interactionId, pick }) => {
        const g = window.hearthside.game;
        const st = window.hearthside.debug.state();
        const personId = st.households[st.activeHouseholdId].memberIds[0];
        // Dinner chores can fill the short queue; drop them so the player's choice always fits.
        for (const a of [...st.people[personId].queue]) if (a.source !== 'player') g.cancel(personId, a.id);
        const opt = g.options(personId, pick).find((o) => o.interactionId === interactionId && o.enabled);
        if (!opt) return { ok: false, reason: `${interactionId} is not offered` };
        if (!g.queue(personId, opt).ok) return { ok: false, reason: `${interactionId} was refused` };
        for (let i = 0; i < 120; i++) {
          const a = st.people[personId].queue[0];
          if (a?.interactionId === interactionId && a.phase === 'perform') {
            g.view.focusPerson(personId);
            return { ok: true };
          }
          window.hearthside.debug.step(6);
        }
        return { ok: false, reason: `${interactionId} never started performing` };
      }, { interactionId, pick });

      const shot = async (name) => {
        await framePerson(page, personId);
        const diag = await page.evaluate((id) => {
          const s = window.hearthside.debug.state();
          const p = s.people[id];
          return {
            location: p.location,
            phase: p.queue[0]?.phase ?? null,
            interactionId: p.queue[0]?.interactionId ?? null,
            level: window.hearthside.game.view.level?.() ?? null,
            anchor: window.hearthside.game.view.anchorOf({ kind: 'person', personId: id }),
          };
        }, personId);
        (log.diagnostics ??= []).push({ viewport: vp.name, shot: name, ...diag });
        const onScreen = !!diag.anchor && diag.anchor.visible && diag.anchor.x > 0 && diag.anchor.x < vp.width && diag.anchor.y > 0 && diag.anchor.y < vp.height;
        check(`${vp.name}: ${name} shows the resident on screen`, onScreen, JSON.stringify(diag.anchor));
        const file = `${vp.name}-${name}.png`;
        await page.screenshot({ path: join(SHOTS, file) });
        log.shots.push(file);
      };

      const cameraPick = { kind: 'object', objectId: started.camera };
      const pondPick = { kind: 'object', objectId: started.pond };
      const telescopePick = { kind: 'object', objectId: started.telescope };
      const shots = [
        ['camera', 'takePhotos', cameraPick],
        ['pond', 'fishPond', pondPick],
        ['telescope', 'researchSky', telescopePick],
      ];
      for (const [name, interactionId, pick] of shots) {
        const r = await begin(interactionId, pick);
        check(`${vp.name}: ${interactionId} plays through the real menu`, r.ok, r.ok ? '' : r.reason);
        await shot(name);
        // Finish the action so the skill is awarded before the next one.
        await page.evaluate(() => {
          const st = window.hearthside.debug.state();
          const personId = st.households[st.activeHouseholdId].memberIds[0];
          for (let i = 0; i < 120 && st.people[personId].queue.length > 0; i++) window.hearthside.debug.step(8);
        });
      }

      // The person panel: Skills tab shows the three practised skills with their level and progress.
      await page.locator(`.member[data-person-id="${personId}"]`).click();
      await page.waitForSelector('.person-panel:not([hidden])', { timeout: 5000 }).catch(() => undefined);
      await page.locator('.person-panel .tab[data-id="skills"]').click();
      await page.waitForTimeout(450);
      const skills = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.person-panel .skill-row')].map((r) => ({
          name: r.querySelector('.skill-name')?.textContent?.trim() ?? '',
          level: r.querySelector('.skill-level')?.textContent?.trim() ?? '',
        }));
        const body = document.querySelector('.person-panel .panel-body');
        return {
          rows,
          overflow: body ? body.scrollWidth > body.clientWidth + 1 : true,
          inViewport: (() => {
            const p = document.querySelector('.person-panel');
            if (!p) return false;
            const r = p.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
          })(),
        };
      });
      const names = skills.rows.map((r) => r.name);
      for (const skill of ['Photography', 'Fishing', 'Research']) {
        check(`${vp.name}: Skills panel lists ${skill}`, names.includes(skill), names.join(', '));
      }
      check(`${vp.name}: every listed skill shows a level`, skills.rows.length > 0 && skills.rows.every((r) => /Level \d+ of 10/.test(r.level)),
        skills.rows.map((r) => `${r.name} ${r.level}`).join('; '));
      check(`${vp.name}: the Skills panel fits without horizontal overflow`, !skills.overflow && skills.inViewport,
        `overflow ${skills.overflow}, in viewport ${skills.inViewport}`);
      await shot('skills');
      check(`${vp.name}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));

      log.viewports.push({ ...vp, personId, name: started.name, skills });
      await context.close();
    }
  } finally {
    await browser?.close().catch(() => undefined);
    server.kill('SIGTERM');
  }
  writeFileSync(join(SHOTS, 'skills-c-log.json'), JSON.stringify(log, null, 2));
  const failed = log.checks.filter((c) => !c.ok);
  console.log(`[shots] ${log.checks.length - failed.length}/${log.checks.length} checks passed, ${log.shots.length} screenshots`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error('[shots] failed:', e); process.exitCode = 1; });
