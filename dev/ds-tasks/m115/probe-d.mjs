// Task D camera probe: frames each animated object from all four yaw steps at close zoom while the state is active,
// so the screenshot script can use a viewing angle that shows the moving part instead of the person standing in front.
//   npm run build && node dev/ds-tasks/m115/probe-d.mjs
// Writes dev/ds-tasks/m115/shots/D/probe-<state>-k<0..3>.png and prints the camera state for each shot.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const LOCK = '/tmp/hearthside-browser.lock';
if (!process.env.HEARTHSIDE_D_PROBE_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_D_PROBE_LOCKED: '1' },
  });
  process.exit(r.status ?? 1);
}
const PORT = 5197;
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

async function settle(page, ms = 500) {
  await page.waitForTimeout(ms);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 200)))));
}

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

/**
 * Puts the camera at one of the four yaw steps, aimed at an object's footprint centre at `y` metres, at `ppm`.
 * Uses the rig directly: reveal() only fits the box and never zooms in, which leaves the appliance tiny and the
 * person standing in front of it. Returns the camera state after a frame, for the log.
 */
async function aim(page, objectId, yawStep, ppm, y) {
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
  await settle(page, 450);
  return page.evaluate(() => {
    const th = window.hearthside;
    const st = th.debug.state();
    const p = st.people[st.households[st.activeHouseholdId].memberIds[0]];
    const cv = document.getElementById('game-canvas')?.getBoundingClientRect();
    return {
      ppm: Math.round(th.view.rig.ppm), yawDeg: Math.round((th.view.rig.yaw * 180) / Math.PI),
      target: { x: +th.view.rig.target.x.toFixed(2), y: +th.view.rig.target.y.toFixed(2), z: +th.view.rig.target.z.toFixed(2) },
      person: p.location && p.location.kind === 'lot' ? { x: +p.location.x.toFixed(2), z: +p.location.z.toFixed(2) } : p.location,
      canvas: cv ? { w: Math.round(cv.width), h: Math.round(cv.height) } : null,
    };
  });
}

async function shoot(page, name) {
  const path = join(SHOTS, `${name}.png`);
  await page.screenshot({ path });
  console.log(`[probe] ${name}.png`);
}

async function frameAll(page, label, objectId, ppm, y) {
  for (let k = 0; k < 4; k++) {
    const cam = await aim(page, objectId, k, ppm, y);
    console.log(`[probe] ${label} k=${k}`, JSON.stringify(cam));
    await shoot(page, `probe-${label}-k${k}`);
  }
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
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, musicVolume: 0 })); } catch { /* ignore */ }
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('[probe] pageerror:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.log('[probe] console:', m.text()); });
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
      st.settings.autonomy = false;
      const lot = st.lots[st.activeLotId];
      const person = st.households[st.activeHouseholdId].memberIds.map((id) => st.people[id])[0];
      const find = (defId) => Object.values(lot.objects).find((o) => o.defId === defId);
      const fridge = find('fridge-standard');
      const stove = find('stove-basic');
      const wardrobe = find('wardrobe-tall');
      const shower = find('shower-stall');
      if (!fridge || !stove || !wardrobe || !shower) throw new Error('starter house is missing an appliance');
      person.location = { kind: 'lot', lotId: st.activeLotId, x: fridge.x + 0.5, z: fridge.z + 1.35, level: 0 };
      person.anim = { id: 'idle', since: st.clock.minutes, loop: true };
      return { personId: person.id, fridgeId: fridge.id, stoveId: stove.id, wardrobeId: wardrobe.id, showerId: shower.id };
    });
    await page.evaluate(() => window.hearthside.view.lotChanged('objects'));
    await page.evaluate(() => window.hearthside.game.view.setCutaway('down'));
    await page.evaluate((id) => window.hearthside.game.select(id), setup.personId);
    await page.waitForTimeout(400);

    const q = await queueOption(page, setup.fridgeId, 'cookMeal');
    if (!q.ok) throw new Error(`cookMeal: ${q.reason}`);
    const f = await stepUntil(page, 'cookMeal', 0);
    if (!f) throw new Error('cookMeal never reached the fridge stage');
    await page.evaluate(() => window.hearthside.debug.step(3));
    await settle(page, 700);
    await frameAll(page, 'fridge-open', setup.fridgeId, 150, 1.0);

    const s = await stepUntil(page, 'cookMeal', 1);
    if (!s) throw new Error('cookMeal never reached the stove stage');
    await settle(page, 900);
    await frameAll(page, 'stove-cooking', setup.stoveId, 150, 0.95);

    await clearQueue(page);
    const wq = await queueOption(page, setup.wardrobeId, 'changeOutfit');
    if (!wq.ok) throw new Error(`changeOutfit: ${wq.reason}`);
    const w = await stepUntil(page, 'changeOutfit', null);
    if (!w) throw new Error('changeOutfit never reached the wardrobe');
    await page.evaluate(() => window.hearthside.debug.step(3));
    await settle(page, 500);
    await frameAll(page, 'wardrobe-open', setup.wardrobeId, 150, 1.1);

    await clearQueue(page);
    const sq = await queueOption(page, setup.showerId, 'takeShower');
    if (!sq.ok) throw new Error(`takeShower: ${sq.reason}`);
    const sh = await stepUntil(page, 'takeShower', null);
    if (!sh) throw new Error('takeShower never reached the shower');
    await settle(page, 1000);
    await frameAll(page, 'shower-running', setup.showerId, 150, 1.2);

    await context.close();
  } finally {
    await browser?.close().catch(() => undefined);
    server.kill('SIGTERM');
  }
  console.log('[probe] done');
}

main().catch((e) => { console.error('[probe] failed:', e); process.exitCode = 1; });
