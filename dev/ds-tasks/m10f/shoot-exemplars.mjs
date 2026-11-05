// Milestone 10 furniture pipeline: in-game screenshots of the exemplar designs with moving parts and a screen.
//   node dev/ds-tasks/m10f/shoot-exemplars.mjs [--only=fridge,chest,laptop] [--no-build] [--defs=fridge-retro-tall,chest-of-drawers,laptop-thin]
// Builds the game into tests/e2e/out/m10f-dist, serves it, starts the guided household, swaps three objects of the starter
// house for the new designs (same footprints), runs the real interaction on each (grab a snack, change outfit, practise
// programming) and writes PNGs plus a JSON log to tests/e2e/out/m10f-shots/ (git-ignored). It is also the recipe for looking at
// any animated design: swap its defId into an object of the starter house, queue its interaction, step to the perform phase,
// aim the camera, screenshot. Only one browser runs at a time on this machine: the script re-runs itself under the shared
// browser lock (do not wrap it in flock yourself).

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const LOCK = '/tmp/hearthside-browser.lock';
if (!process.env.HEARTHSIDE_M10F_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_M10F_LOCKED: '1' },
  });
  process.exit(r.status ?? 1);
}
const args = process.argv.slice(2);
const opt = (name, def) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def;
const ONLY = new Set(opt('only', 'fridge,chest,laptop').split(','));
const DEFS = opt('defs', 'fridge-retro-tall,chest-of-drawers,laptop-thin').split(',');
const PORT = 5197;
const DIST = join(root, 'tests/e2e/out/m10f-dist');
const OUT = join(root, 'tests/e2e/out/m10f-shots');
mkdirSync(OUT, { recursive: true });

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

const log = { checks: [], shots: [] };
const check = (name, ok, evidence) => {
  log.checks.push({ name, ok, evidence });
  console.log(`[m10f] ${ok ? 'ok  ' : 'FAIL'} ${name}${evidence ? ` - ${evidence}` : ''}`);
};

async function waitForServer(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server at ${url} did not start`);
}

async function settle(page, ms = 600) {
  await page.waitForTimeout(ms);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 250)))));
}

/** Camera aimed at a point of an object (local rot-0 metres) from a yaw in degrees (0 = looking at the +z front). */
async function aim(page, objectId, { local, yawDeg, ppm }) {
  await page.evaluate(({ objectId, local, yawDeg, ppm }) => {
    const h = window.hearthside;
    const root = h.view.objects.rootOf(objectId);
    const v = root.position.clone().set(local[0], local[1], local[2]);
    root.localToWorld(v);
    h.view.pendingReveal = null;
    const r = h.view.rig;
    r.setYawStep(0);
    r.yaw = (yawDeg * Math.PI) / 180;
    r.turn = null;
    r.glide = null;
    r.target.set(v.x, v.y, v.z);
    r.setZoom(ppm);
    r.update(0);
  }, { objectId, local, yawDeg, ppm });
  await settle(page, 500);
}

async function shot(page, name) {
  await page.evaluate(() => { for (let i = 0; i < 8; i++) window.hearthside.debug.frame(1 / 30); });
  await page.waitForTimeout(300);
  const file = `${name}.png`;
  await page.screenshot({ path: join(OUT, file) });
  log.shots.push(file);
}

/** Puts the first free household member on the interaction and steps until its perform phase. */
async function startInteraction(page, objectId, interactionId) {
  return page.evaluate(([id, wanted]) => {
    const h = window.hearthside, g = h.game, st = g.state();
    const hh = st.households[st.activeHouseholdId];
    const pid = hh.memberIds[0];
    for (const a of [...st.people[pid].queue]) g.cancel(pid, a.id);
    h.debug.step(1);
    g.setMode('live');
    const opts = g.options(pid, { kind: 'object', objectId: id });
    const opt = opts.find((o) => o.interactionId === wanted && o.enabled);
    if (!opt) return { ok: false, reason: `no enabled ${wanted} (${opts.map((o) => `${o.interactionId}:${o.enabled}`).join(', ')})` };
    const q = g.queue(pid, opt);
    if (!q.ok) return { ok: false, reason: q.reason };
    for (let i = 0; i < 600; i++) {
      h.debug.step(1);
      const head = st.people[pid].queue[0];
      if (head?.interactionId === wanted && head.phase === 'perform') return { ok: true, elapsed: head.elapsed, duration: head.duration, anim: st.people[pid].anim.id };
      if (!head || head.interactionId !== wanted) return { ok: false, reason: `action ended early (anim ${st.people[pid].anim.id})` };
    }
    return { ok: false, reason: 'never reached perform' };
  }, [objectId, interactionId]);
}

async function clearActions(page) {
  await page.evaluate(() => {
    const h = window.hearthside, g = h.game, st = g.state();
    for (const pid of Object.keys(st.people)) for (const a of [...(st.people[pid]?.queue ?? [])]) g.cancel(pid, a.id);
    for (let i = 0; i < 20; i++) h.debug.step(1);
  });
}

/** Scene-graph facts about an object's moving parts, so a shot can be judged from numbers too. */
async function partState(page, objectId) {
  return page.evaluate((id) => {
    const g = window.hearthside.view.objects.rootOf(id);
    g.updateMatrixWorld(true);
    const parts = [];
    g.traverse((o) => {
      if (!o.name.startsWith('part:anim:')) return;
      const q = o.quaternion;
      parts.push({ name: o.name, visible: o.visible, turn: +(2 * Math.acos(Math.min(1, Math.abs(q.w)))).toFixed(3), pos: [o.position.x, o.position.y, o.position.z].map((v) => +v.toFixed(3)) });
    });
    return parts;
  }, objectId);
}

async function main() {
  if (!args.includes('--no-build') || !existsSync(join(DIST, 'index.html'))) {
    console.log('[m10f] building', DIST);
    const b = spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', DIST, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
    if (b.status !== 0) throw new Error('vite build failed');
  }
  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser = null;
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`, 30000);
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({ ...launchOptions(chromium), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => { try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, musicVolume: 0, autoSave: false })); } catch { /* ignore */ } });
    const page = await context.newPage();
    page.setDefaultTimeout(120_000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
    const started = await page.evaluate(async () => {
      const g = window.hearthside.game;
      const r = await g.startNewGame('guided', g.premadeHouseholds()[0]);
      g.setSpeed(0);
      return r;
    });
    if (!started.ok) throw new Error(`startNewGame failed: ${started.reason}`);
    await page.waitForTimeout(500);

    // Swap three starter objects (same 1x1 footprints) for the designs under test.
    const [fridgeDef, chestDef, laptopDef] = DEFS;
    const setup = await page.evaluate(([fridgeDef, chestDef, laptopDef]) => {
      const st = window.hearthside.debug.state();
      st.settings.autonomy = false;
      const lot = st.lots[st.activeLotId];
      const find = (defId) => Object.values(lot.objects).find((o) => o.defId === defId);
      const fridge = find('fridge-standard'), wardrobe = find('wardrobe-tall'), computer = find('computer-desktop');
      if (!fridge || !wardrobe || !computer) throw new Error('starter house lacks the fridge, wardrobe or computer');
      fridge.defId = fridgeDef; wardrobe.defId = chestDef; computer.defId = laptopDef;
      const others = st.households[st.activeHouseholdId].memberIds.slice(1);
      for (const id of others) st.people[id].location = { kind: 'lot', lotId: st.activeLotId, x: 8.5, z: 18, level: 0, facing: 0, posture: 'standing' };
      return { fridge: fridge.id, chest: wardrobe.id, laptop: computer.id };
    }, [fridgeDef, chestDef, laptopDef]);
    await page.evaluate(() => window.hearthside.view.lotChanged('objects'));
    await page.evaluate(() => window.hearthside.game.view.setCutaway('down'));
    await page.waitForTimeout(2500); // the new GLBs load on demand
    await page.evaluate(() => window.hearthside.debug.step(1));
    await page.evaluate(() => { const st = window.hearthside.debug.state(); window.hearthside.view.setWorld(st, true); });
    await page.waitForTimeout(1500);
    for (const [key, id] of Object.entries(setup)) {
      const found = await page.evaluate((i) => !!window.hearthside.view.objects.rootOf(i), id);
      check(`${key} object is in the scene`, found, id);
    }

    if (ONLY.has('fridge')) {
      await aim(page, setup.fridge, { local: [0.5, 0.9, 0.6], yawDeg: 25, ppm: 170 });
      await shot(page, 'fridge-closed');
      const closed = await partState(page, setup.fridge);
      check('closed fridge: door at rest, interior hidden', closed.some((p) => p.name === 'part:anim:door' && p.turn < 0.01) && closed.some((p) => p.name === 'part:anim:interior' && !p.visible), JSON.stringify(closed));
      const q = await startInteraction(page, setup.fridge, 'cookMeal');
      check('cookMeal reaches the fridge stage', q.ok, q.reason ?? `elapsed ${q.elapsed}`);
      if (q.ok) {
        await page.evaluate(() => window.hearthside.debug.step(1));
        await settle(page, 350);
        await page.evaluate(() => window.hearthside.debug.step(1));
        await settle(page, 400);
        await aim(page, setup.fridge, { local: [0.5, 0.9, 0.6], yawDeg: 38, ppm: 170 });
        const open = await partState(page, setup.fridge);
        check('open fridge: door turned, interior visible', open.some((p) => p.name === 'part:anim:door' && p.turn > 1.2) && open.some((p) => p.name === 'part:anim:interior' && p.visible), JSON.stringify(open));
        await shot(page, 'fridge-open');
        await aim(page, setup.fridge, { local: [0.5, 0.9, 0.6], yawDeg: 325, ppm: 170 });
        await shot(page, 'fridge-open-b');
      }
      await clearActions(page);
    }

    if (ONLY.has('chest')) {
      const q = await startInteraction(page, setup.chest, 'changeOutfit');
      check('changeOutfit reaches the chest', q.ok, q.reason ?? `elapsed ${q.elapsed}`);
      if (q.ok) {
        await page.evaluate(() => window.hearthside.debug.step(2));
        await settle(page, 500);
        await aim(page, setup.chest, { local: [0.5, 0.45, 0.6], yawDeg: 30, ppm: 190 });
        const parts = await partState(page, setup.chest);
        check('chest: both top drawers slid out', parts.filter((p) => p.name.startsWith('part:anim:drawer') && p.pos[2] > 0.3).length === 2, JSON.stringify(parts));
        await shot(page, 'chest-open');
      }
      await clearActions(page);
      await settle(page, 600);
      await aim(page, setup.chest, { local: [0.5, 0.45, 0.6], yawDeg: 30, ppm: 190 });
      await shot(page, 'chest-closed');
    }

    if (ONLY.has('laptop')) {
      const q = await startInteraction(page, setup.laptop, 'practiceProgramming');
      check('practiceProgramming reaches the laptop', q.ok, q.reason ?? `elapsed ${q.elapsed}`);
      if (q.ok) {
        await page.evaluate(() => window.hearthside.debug.step(3));
        await settle(page, 900);
        await aim(page, setup.laptop, { local: [0.5, 0.15, 0.5], yawDeg: 10, ppm: 420 });
        const quad = await page.evaluate((id) => {
          const g = window.hearthside.view.objects.rootOf(id);
          const m = g.getObjectByName(`screen:${id}`);
          return m ? { visible: m.visible, scale: [m.scale.x, m.scale.y].map((v) => +v.toFixed(3)), pos: [m.position.x, m.position.y, m.position.z].map((v) => +v.toFixed(3)) } : null;
        }, setup.laptop);
        check('laptop: a screen quad was derived and attached', !!quad && quad.visible, JSON.stringify(quad));
        await shot(page, 'laptop-in-use');
      }
      await clearActions(page);
      await settle(page, 600);
      await aim(page, setup.laptop, { local: [0.5, 0.15, 0.5], yawDeg: 10, ppm: 420 });
      await shot(page, 'laptop-off');
    }

    check('no page or console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
    writeFileSync(join(OUT, 'log.json'), JSON.stringify(log, null, 1));
    await context.close();
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
  const failed = log.checks.filter((c) => !c.ok);
  console.log(`[m10f] ${log.checks.length - failed.length}/${log.checks.length} checks ok; shots in ${OUT}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
