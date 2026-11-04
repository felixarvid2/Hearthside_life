// Milestone 11.5, task D: screenshots of moving parts and "in use" states.
//   npm run build && node dev/ds-tasks/m115/shoot-d.mjs
// Serves ./dist and writes PNGs plus a JSON log to dev/ds-tasks/m115/shots/D/.
//
// Shots per viewport: fridge closed with a person at it, fridge open while cooking, stove cooking (rings, pot,
// steam), wardrobe open while changing outfit, shower running. Portrait 390x844, landscape 844x390, desktop 1280x720.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const LOCK = '/tmp/hearthside-browser.lock';
// The browser runs share one lock; re-exec under flock so this invocation is enough (never wrap other e2e scripts).
if (!process.env.HEARTHSIDE_D_SHOTS_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_D_SHOTS_LOCKED: '1' },
  });
  process.exit(r.status ?? 1);
}
const PORT = 5196;
const DIST = join(root, 'dist');
const SHOTS = join(here, 'shots', 'D');
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

async function settle(page, ms = 700) {
  await page.waitForTimeout(ms);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 250)))));
}

/** Software rendering can leave stale DOM layers; a hidden/visible flash and a one-pixel resize force a repaint. */
async function forceRepaint(page, width, height) {
  await page.evaluate(() => {
    const panel = document.querySelector('.person-panel');
    if (panel) { panel.style.visibility = 'hidden'; void panel.offsetHeight; panel.style.visibility = ''; }
  });
  await page.setViewportSize({ width, height: height + 1 });
  await page.waitForTimeout(300);
  await page.setViewportSize({ width, height });
  await settle(page, 400);
}

/** Natural view: reveals the object and keeps the current lot zoom, so the person at it stays in frame. */
async function frameObject(page, objectId) {
  await page.evaluate((id) => window.hearthside.game.view.reveal({ kind: 'object', objectId: id }), objectId);
  await page.waitForTimeout(1800);
  const centre = await page.evaluate(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
  await page.evaluate(({ x, y }) => window.hearthside.game.view.zoomAt(0.82, x, y), centre);
  await page.waitForTimeout(900);
  await settle(page);
}

/**
 * Close view: aims the rig at the object's footprint centre from one of the four yaw steps at a fixed zoom.
 * reveal() only fits a box and keeps the current zoom, and the person stands between the camera and the appliance
 * from the front, so the moving part is best framed from a side step and a fixed aim.
 */
async function aimObject(page, objectId, yawStep, ppm, y) {
  await page.evaluate(({ objectId, yawStep, ppm, y }) => {
    const th = window.hearthside;
    const st = th.debug.state();
    const lot = st.lots[st.activeLotId];
    const o = lot.objects[objectId];
    const def = th.core.content.objects[o.defId];
    const swap = ((o.rot ?? 0) % 2) === 1;
    const w = swap ? def.footprint.d : def.footprint.w;
    const d = swap ? def.footprint.w : def.footprint.d;
    const v = th.view;
    v.rig.setYawStep(yawStep);
    v.rig.glideTo(o.x + w / 2, o.z + d / 2, ppm, 0, y);
    v.rig.update(0);
  }, { objectId, yawStep, ppm, y });
  await settle(page, 500);
}

/** Candidate angles for one state; the best one is promoted to the required file name afterwards. */
async function angleCandidates(page, vp, name, objectId, ppm, y) {
  for (let k = 0; k < 4; k++) {
    await aimObject(page, objectId, k, ppm, y);
    await shot(page, vp, `${name}-k${k}`);
  }
}

async function clearQueue(page) {
  for (let i = 0; i < 40; i++) {
    const busy = await page.evaluate(() => {
      const st = window.hearthside.debug.state();
      const p = st.people[st.households[st.activeHouseholdId].memberIds[0]];
      if (p.queue.length) {
        window.hearthside.game.cancel(p.id, p.queue[0].id);
        window.hearthside.debug.step(2);
        return true;
      }
      return false;
    });
    if (!busy) return;
    await page.waitForTimeout(40);
  }
}

/** Advances one tick at a time until the first household member performs `interactionId` at `stage`. */
async function stepUntil(page, interactionId, stage, maxTicks = 160) {
  for (let i = 0; i < maxTicks; i++) {
    const s = await page.evaluate(() => {
      window.hearthside.debug.step(1);
      const st = window.hearthside.debug.state();
      const p = st.people[st.households[st.activeHouseholdId].memberIds[0]];
      const a = p.queue[0];
      return a ? { interactionId: a.interactionId, phase: a.phase, stage: a.data?.stage ?? null, elapsed: a.elapsed } : null;
    });
    if (s && s.interactionId === interactionId && s.phase === 'perform' && (stage === null || s.stage === stage)) return s;
    await page.waitForTimeout(25);
  }
  return null;
}

async function queueOption(page, objectId, interactionId) {
  return page.evaluate(({ objectId, interactionId }) => {
    const g = window.hearthside.game;
    const st = window.hearthside.debug.state();
    const pid = st.households[st.activeHouseholdId].memberIds[0];
    const matches = g.options(pid, { kind: 'object', objectId }).filter((m) => m.interactionId === interactionId);
    const o = matches.find((m) => m.enabled) ?? matches[0];
    if (!o) return { ok: false, reason: 'option missing' };
    if (!o.enabled) return { ok: false, reason: o.reason ?? 'disabled' };
    return g.queue(pid, o);
  }, { objectId, interactionId });
}

async function shot(page, vp, name) {
  await forceRepaint(page, vp.width, vp.height);
  const path = join(SHOTS, `${vp.name}-${name}.png`);
  await page.screenshot({ path });
  log.shots.push(`${vp.name}-${name}.png`);
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
      await page.waitForTimeout(500);

      const started = await page.evaluate(async () => {
        const g = window.hearthside.game;
        const hhs = g.premadeHouseholds();
        const r = await g.startNewGame('guided', hhs[0]);
        g.setSpeed(0);
        return r;
      });
      if (!started.ok) throw new Error(`startNewGame failed: ${started.reason}`);
      await page.waitForTimeout(400);

      const setup = await page.evaluate(() => {
        const st = window.hearthside.debug.state();
        const db = window.hearthside.core.content;
        st.settings.autonomy = false;
        const lot = st.lots[st.activeLotId];
        const person = st.households[st.activeHouseholdId].memberIds.map((id) => st.people[id])[0];
        const find = (defId) => Object.values(lot.objects).find((o) => o.defId === defId);
        const fridge = find('fridge-standard');
        const stove = find('stove-basic');
        const wardrobe = find('wardrobe-tall');
        const shower = find('shower-stall');
        if (!fridge || !stove || !wardrobe || !shower) throw new Error('starter house is missing an appliance');
        // Stand the person at the fridge for the closed shot (no walking, no autonomy).
        person.location = { kind: 'lot', lotId: st.activeLotId, x: fridge.x + 0.5, z: fridge.z + 1.35, level: 0 };
        person.anim = { id: 'idle', since: st.clock.minutes, loop: true };
        return {
          personId: person.id,
          fridgeId: fridge.id, stoveId: stove.id, wardrobeId: wardrobe.id, showerId: shower.id,
          fridgeAt: [fridge.x + 0.5, fridge.z + 1.35],
        };
      });
      await page.evaluate(() => window.hearthside.view.lotChanged('objects'));
      await page.evaluate(() => window.hearthside.game.view.setCutaway('down'));
      await page.evaluate((id) => window.hearthside.game.select(id), setup.personId);
      await page.waitForTimeout(500);

      // 1. Closed fridge, person standing at it.
      await frameObject(page, setup.fridgeId);
      await shot(page, vp, 'fridge-closed');

      // 2. Open fridge during cookMeal stage 0 (reaching in).
      const queued = await queueOption(page, setup.fridgeId, 'cookMeal');
      check(`${vp.name}: cookMeal is queueable at the fridge`, queued.ok, queued.reason ?? 'queued');
      const reaching = await stepUntil(page, 'cookMeal', 0);
      check(`${vp.name}: cookMeal reaches the fridge stage`, !!reaching, reaching ? `stage 0 at ${reaching.elapsed} min` : 'never');
      if (reaching) {
        await page.evaluate(() => window.hearthside.debug.step(3)); // let the 0.4 min door tween finish
        await settle(page);
        await angleCandidates(page, vp, 'fridge-open', setup.fridgeId, 135, 1.0);
      }

      // 3. Stove cooking: same chain, stage 1, with rings, pot and steam.
      const cooking = await stepUntil(page, 'cookMeal', 1);
      check(`${vp.name}: cookMeal reaches the stove stage`, !!cooking, cooking ? `stage 1 at ${cooking.elapsed} min` : 'never');
      if (cooking) {
        await settle(page, 900); // steam rises in real time
        await angleCandidates(page, vp, 'stove-cooking', setup.stoveId, 150, 0.95);
      }

      // 4. Wardrobe open while changing outfit.
      await clearQueue(page);
      const wq = await queueOption(page, setup.wardrobeId, 'changeOutfit');
      check(`${vp.name}: changeOutfit is queueable at the wardrobe`, wq.ok, wq.reason ?? 'queued');
      const changing = await stepUntil(page, 'changeOutfit', null);
      check(`${vp.name}: changeOutfit reaches the wardrobe`, !!changing, changing ? `at ${changing.elapsed} min` : 'never');
      if (changing) {
        await page.evaluate(() => window.hearthside.debug.step(3));
        await settle(page);
        await frameObject(page, setup.wardrobeId);
        await shot(page, vp, 'wardrobe-open');
      }

      // 5. Shower running.
      await clearQueue(page);
      const sq = await queueOption(page, setup.showerId, 'takeShower');
      check(`${vp.name}: takeShower is queueable at the shower`, sq.ok, sq.reason ?? 'queued');
      const showering = await stepUntil(page, 'takeShower', null);
      check(`${vp.name}: takeShower reaches the shower`, !!showering, showering ? `at ${showering.elapsed} min` : 'never');
      if (showering) {
        await settle(page, 1100);
        await angleCandidates(page, vp, 'shower-running', setup.showerId, 130, 1.2);
      }

      check(`${vp.name}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
      log.viewports.push({ ...vp, setup });
      await clearQueue(page);
      await context.close();
    }
  } finally {
    await browser?.close().catch(() => undefined);
    server.kill('SIGTERM');
  }
  writeFileSync(join(SHOTS, 'd-log.json'), JSON.stringify(log, null, 2));
  const failed = log.checks.filter((c) => !c.ok);
  console.log(`[shots] ${log.checks.length - failed.length}/${log.checks.length} checks passed, ${log.shots.length} screenshots`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error('[shots] failed:', e); process.exitCode = 1; });
