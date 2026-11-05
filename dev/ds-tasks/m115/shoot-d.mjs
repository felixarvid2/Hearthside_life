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
/** `--only=fridge,stove` re-shoots just those states (quick iteration); default is the full set. */
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length) ?? '';
const ONLY_SET = new Set(ONLY.split(',').filter(Boolean));
const wants = (state) => ONLY_SET.size === 0 || ONLY_SET.has(state);
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

const log = { checks: [], shots: [], viewports: [], aims: [], diag: [] };
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

/**
 * Where the rig is and where the target and the person actually project, so framing can be checked from the
 * JSON log instead of by eye. `rig.project` returns canvas CSS px; the canvas fills the page in these shots.
 */
async function logAim(page, vp, label, objectId) {
  const info = await page.evaluate((id) => {
    const th = window.hearthside;
    const st = th.debug.state();
    const lot = st.lots[st.activeLotId];
    const o = lot.objects[id];
    const def = th.core.content.objects[o.defId];
    const rig = th.view.rig;
    const at = (x, y, z) => {
      const p = rig.project(x, y, z, { x: 0, y: 0, visible: false });
      return { x: Math.round(p.x), y: Math.round(p.y) };
    };
    const p = st.people[st.households[st.activeHouseholdId].memberIds[0]].location;
    const cx = o.x + def.footprint.w / 2, cz = o.z + def.footprint.d / 2;
    return {
      target: [Number(rig.target.x.toFixed(2)), Number(rig.target.z.toFixed(2))],
      ppm: Math.round(rig.ppm), yawDeg: Math.round((rig.yaw * 180) / Math.PI),
      insets: { ...rig.insets }, canvas: [rig.width, rig.height],
      obj: [o.x, o.z], objScreen: at(cx, 0.5, cz), objTopScreen: at(cx, def.height ?? 1, cz),
      person: p?.kind === 'lot' ? [Number(p.x.toFixed(2)), Number(p.z.toFixed(2))] : null,
      personScreen: p?.kind === 'lot' ? at(p.x, 0.5, p.z) : null,
    };
  }, objectId);
  log.aims.push({ viewport: vp.name, label, ...info });
}

/**
 * Scene-graph check for one object: does its ObjectAnim exist, are the hob rings switched on, and where do they
 * project on screen? Answers "is the effect running and is it in frame" from numbers instead of a guess.
 */
async function sceneDiag(page, vp, objectId, label) {
  const info = await page.evaluate((id) => {
    const th = window.hearthside;
    const st = th.debug.state();
    const p = st.people[st.households[st.activeHouseholdId].memberIds[0]];
    const a = p.queue[0];
    const rig = th.view.rig;
    const g = th.view.scene.getObjectByName(`obj:${id}`);
    const world = (o) => ({ x: o.matrixWorld.elements[12], y: o.matrixWorld.elements[13], z: o.matrixWorld.elements[14] });
    const screen = (v) => {
      const q = rig.project(v.x, v.y, v.z, { x: 0, y: 0, visible: false });
      return [Math.round(q.x), Math.round(q.y)];
    };
    const r3 = (v) => [v.x, v.y, v.z].map((n) => Math.round(n * 100) / 100);
    if (!g) return { found: false, action: a ? { interactionId: a.interactionId, stage: a.data?.stage, stoveObj: a.data?.stoveObj } : null };
    g.updateMatrixWorld(true);
    const fx = g.getObjectByName('anim-effects') ?? null;
    const items = [];
    fx?.traverse((o) => {
      if (!o.isMesh && !o.isSprite) return;
      const geo = o.geometry?.type ?? 'sprite';
      if (geo !== 'TorusGeometry' && geo !== 'RingGeometry' && geo !== 'CylinderGeometry' && !o.isSprite) return;
      const w = world(o);
      items.push({ geo, isSprite: o.isSprite === true, visible: o.visible, world: r3(w), screen: screen(w), parentVisible: o.parent?.visible ?? null });
    });
    return {
      found: true, effects: !!fx, effectsVisible: fx?.visible ?? null,
      group: screen(world(g)), objects: items.slice(0, 20),
      ringMat: items.length && fx?.children.find((c) => c.isMesh) ? (() => {
        const m = fx.children.find((c) => c.isMesh);
        return { visible: m.visible, emissiveIntensity: m.material?.emissiveIntensity, color: m.material?.emissive?.getHexString?.() };
      })() : null,
      action: a ? { interactionId: a.interactionId, phase: a.phase, stage: a.data?.stage, stoveObj: a.data?.stoveObj } : null,
      person: p.location.kind === 'lot' ? { at: [Math.round(p.location.x * 100) / 100, Math.round(p.location.z * 100) / 100], screen: screen({ x: p.location.x, y: 0.9, z: p.location.z }) } : null,
    };
  }, objectId);
  log.diag.push({ viewport: vp.name, label, ...info });
  console.log(`[shots] diag ${vp.name} ${label}: ${JSON.stringify(info)}`);
  return info;
}

/** Candidate angles for one state at a close and a wide zoom; the best one is promoted to the required name later. */
async function angleCandidates(page, vp, name, objectId, ppm, ppmWide, y) {
  for (let k = 0; k < 4; k++) {
    await aimObject(page, objectId, k, ppm, y);
    await shot(page, vp, `${name}-k${k}`);
    await logAim(page, vp, `${name}-k${k}`, objectId);
  }
  for (let k = 0; k < 4; k++) {
    await aimObject(page, objectId, k, ppmWide, y);
    await shot(page, vp, `${name}-w${k}`);
    await logAim(page, vp, `${name}-w${k}`, objectId);
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
        person.location = {
          kind: 'lot', lotId: st.activeLotId, x: fridge.x + 0.5, z: fridge.z + 1.35, level: 0,
          facing: Math.PI, posture: 'standing',
        };
        person.anim = { id: 'idle', since: st.clock.minutes, loop: true };
        // The other household members keep their spawn spots (the kitchen) and would stand in the wide shots;
        // park them on the porch instead.
        const others = st.households[st.activeHouseholdId].memberIds.filter((id) => id !== person.id);
        for (const id of others) {
          st.people[id].location = { kind: 'lot', lotId: st.activeLotId, x: 8.5, z: 18, level: 0, facing: 0, posture: 'standing' };
        }
        return {
          personId: person.id, others,
          fridgeId: fridge.id, stoveId: stove.id, wardrobeId: wardrobe.id, showerId: shower.id,
          fridgeAt: [fridge.x + 0.5, fridge.z + 1.35],
        };
      });
      await page.evaluate(() => window.hearthside.view.lotChanged('objects'));
      await page.evaluate(() => window.hearthside.game.view.setCutaway('down'));
      await page.evaluate((id) => window.hearthside.game.select(id), setup.personId);
      // The people view only follows `location` on a tick (it interpolates between tick positions) and then draws
      // the previous tick's spot at alpha 0, so the teleport above is invisible until it runs. A forced setWorld
      // re-syncs and snaps everyone to the state; without it the closed-fridge shot has no person at the fridge.
      await page.evaluate(() => window.hearthside.debug.step(1));
      await page.evaluate(() => { const st = window.hearthside.debug.state(); window.hearthside.view.setWorld(st, true); });
      await page.waitForTimeout(700);

      // 1. Closed fridge, person standing at it. Natural framing plus aimed candidates (the natural reveal keeps
      //    the lot zoom and the pantry/plant can hide the fridge, so the candidates are the dependable evidence).
      if (wants('fridge')) {
        await frameObject(page, setup.fridgeId);
        await shot(page, vp, 'fridge-closed');
        await logAim(page, vp, 'fridge-closed', setup.fridgeId);
        await angleCandidates(page, vp, 'fridge-closed', setup.fridgeId, 135, 85, 1.0);
      }

      // 2-3. cookMeal chain: stage 0 reaches into the fridge, stage 1 cooks at the stove. The chain runs whenever
      //      either state is wanted (the stove stage needs the earlier one), but only the wanted states are shot.
      let reaching = null;
      if (wants('fridge') || wants('stove')) {
        const queued = await queueOption(page, setup.fridgeId, 'cookMeal');
        check(`${vp.name}: cookMeal is queueable at the fridge`, queued.ok, queued.reason ?? 'queued');
        reaching = await stepUntil(page, 'cookMeal', 0);
        check(`${vp.name}: cookMeal reaches the fridge stage`, !!reaching, reaching ? `stage 0 at ${reaching.elapsed} min` : 'never');
        if (reaching && wants('fridge')) {
          await page.evaluate(() => window.hearthside.debug.step(3)); // let the 0.4 min door tween finish
          await settle(page);
          await angleCandidates(page, vp, 'fridge-open', setup.fridgeId, 135, 85, 1.0);
        }
      }
      if (reaching && wants('stove')) {
        const cooking = await stepUntil(page, 'cookMeal', 1);
        check(`${vp.name}: cookMeal reaches the stove stage`, !!cooking, cooking ? `stage 1 at ${cooking.elapsed} min` : 'never');
        if (cooking) {
          await settle(page, 900); // steam rises in real time
          const stoveDiag = await sceneDiag(page, vp, setup.stoveId, 'stove-cooking');
          // Prove from the scene graph that the shot has something to show: four lit hob rings, the pan and steam.
          const fx = stoveDiag.objects ?? [];
          const rings = fx.filter((o) => o.geo === 'TorusGeometry' && o.visible && o.parentVisible !== false);
          const pot = fx.find((o) => o.geo === 'CylinderGeometry' && o.visible && o.parentVisible !== false);
          const steam = fx.filter((o) => o.isSprite && o.visible && o.parentVisible !== false);
          const glow = stoveDiag.ringMat?.emissiveIntensity ?? 0;
          check(`${vp.name}: stove hob, pot and steam are on`, rings.length === 4 && !!pot && steam.length > 0 && glow > 1,
            `${rings.length} rings, pot ${pot ? 'on' : 'off'}, ${steam.length} steam sprites, ring glow ${glow.toFixed(2)}`);
          await angleCandidates(page, vp, 'stove-cooking', setup.stoveId, 150, 100, 0.95);
          // The close aim can put the hob behind the person or a counter; a wide aim keeps the whole run in frame.
          for (let k = 0; k < 4; k++) {
            await aimObject(page, setup.stoveId, k, 65, 0.95);
            await shot(page, vp, `stove-cooking-x${k}`);
            await logAim(page, vp, `stove-cooking-x${k}`, setup.stoveId);
          }
          // Detail angles: the hob is small at gameplay zoom, so one close pass per yaw makes the rings, pan and
          // steam readable in the evidence as well as in the scene-graph diagnostic.
          for (let k = 0; k < 4; k++) {
            await aimObject(page, setup.stoveId, k, 240, 0.95);
            await shot(page, vp, `stove-cooking-d${k}`);
            await logAim(page, vp, `stove-cooking-d${k}`, setup.stoveId);
          }
          await sceneDiag(page, vp, setup.stoveId, 'stove-cooking-wide');
        }
      }

      // 4. Wardrobe open while changing outfit.
      if (wants('wardrobe')) {
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
          await logAim(page, vp, 'wardrobe-open', setup.wardrobeId);
          await angleCandidates(page, vp, 'wardrobe-open', setup.wardrobeId, 150, 95, 1.1);
        }
      }

      // 5. Shower running.
      if (wants('shower')) {
        await clearQueue(page);
        const sq = await queueOption(page, setup.showerId, 'takeShower');
        check(`${vp.name}: takeShower is queueable at the shower`, sq.ok, sq.reason ?? 'queued');
        const showering = await stepUntil(page, 'takeShower', null);
        check(`${vp.name}: takeShower reaches the shower`, !!showering, showering ? `at ${showering.elapsed} min` : 'never');
        if (showering) {
          await settle(page, 1100);
          await angleCandidates(page, vp, 'shower-running', setup.showerId, 130, 85, 1.2);
          // Detail angles: the falling-water streaks are short; a close pass shows them in the evidence images.
          const showerDetail = vp.name === 'landscape' ? 130 : 200;
          for (let k = 0; k < 4; k++) {
            await aimObject(page, setup.showerId, k, showerDetail, 1.2);
            await shot(page, vp, `shower-running-d${k}`);
            await logAim(page, vp, `shower-running-d${k}`, setup.showerId);
          }
        }
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
  writeFileSync(join(SHOTS, ONLY ? `d-log-${ONLY.replace(/,/g, '-')}.json` : 'd-log.json'), JSON.stringify(log, null, 2));
  const failed = log.checks.filter((c) => !c.ok);
  console.log(`[shots] ${log.checks.length - failed.length}/${log.checks.length} checks passed, ${log.shots.length} screenshots`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error('[shots] failed:', e); process.exitCode = 1; });
