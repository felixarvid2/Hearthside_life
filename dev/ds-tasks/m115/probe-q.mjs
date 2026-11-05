// Task Q probe: ground truth for the door/cavity orientation. Starts the guided world, reports the fridge's
// rotation, the use slot vs the cavity/door in object-local space, and takes one screenshot per yaw step in the
// closed and open states. Writes shots/Q/probe.json and probe-*.png.
//   npm run build && npm run visual:m115:qprobe

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const LOCK = '/tmp/hearthside-browser.lock';
if (!process.env.HEARTHSIDE_Q_PROBE_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_Q_PROBE_LOCKED: '1' },
  });
  process.exit(r.status ?? 1);
}
const PORT = 5195;
const DIST = join(root, 'dist');
const SHOTS = join(here, 'shots', 'Q');
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

function aim(page, objectId, yawStep, ppm, y) {
  return page.evaluate(({ objectId, yawStep, ppm, y }) => {
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
}

/** Straight-on view from one cardinal direction (yaw 0 = camera on +z, the object's front). */
function aimYaw(page, objectId, yawDeg, ppm, y) {
  return page.evaluate(({ objectId, yawDeg, ppm, y }) => {
    const th = window.hearthside;
    const st = th.debug.state();
    const lot = st.lots[st.activeLotId];
    const o = lot.objects[objectId];
    const def = th.core.content.objects[o.defId];
    const swap = ((o.rot ?? 0) % 2) === 1;
    const w = swap ? def.footprint.d : def.footprint.w;
    const d = swap ? def.footprint.w : def.footprint.d;
    const rig = th.view.rig;
    rig.setYawStep(0);
    rig.yaw = (yawDeg * Math.PI) / 180;
    rig.glide = null;
    rig.turn = null;
    rig.target.set(o.x + w / 2, y, o.z + d / 2);
    rig.setZoom(ppm);
    rig.update(0);
    return { yawDeg, cam: [rig.camera.position.x, rig.camera.position.y, rig.camera.position.z] };
  }, { objectId, yawDeg, ppm, y });
}

/** Dumps object-local geometry facts: where the person/use slot, the door pivot and the cavity sit. */
function facts(page, objectId) {
  return page.evaluate((id) => {
    const th = window.hearthside;
    const st = th.debug.state();
    const lot = st.lots[st.activeLotId];
    const o = lot.objects[id];
    const def = th.core.content.objects[o.defId];
    const g = th.view.scene.getObjectByName(`obj:${id}`);
    const p = st.people[st.households[st.activeHouseholdId].memberIds[0]];
    const r = (v) => Math.round(v * 1000) / 1000;
    if (!g) return { found: false };
    g.updateMatrixWorld(true);
    const inv = g.matrixWorld.clone().invert();
    const V = g.position.constructor;
    const toLocal = (v) => { const q = v.clone().applyMatrix4(inv); return [r(q.x), r(q.y), r(q.z)]; };
    const objLocal = (obj) => { const v = new V(); obj.getWorldPosition(v); return toLocal(v); };
    const anim = g.getObjectByName('object-anim');
    const model = g.getObjectByName(`model:${def.model.asset}`);
    const door = model?.getObjectByName('part:doorFridge');
    const cavity = anim?.getObjectByName('interior:fridge');
    // World-space bounds expressed in object-group local space, computed from each mesh's geometry bounds so we do
    // not need a Box3 constructor from the page (THREE is not exposed on window).
    const box3 = (obj) => {
      if (!obj) return null;
      obj.updateMatrixWorld(true);
      const pts = [];
      obj.traverse((m) => {
        if (!m.isMesh || !m.geometry) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox;
        for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
          const q = new V(x, y, z).applyMatrix4(m.matrixWorld);
          pts.push(toLocal(q));
        }
      });
      if (!pts.length) return null;
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]), zs = pts.map((q) => q[2]);
      return { min: [r(Math.min(...xs)), r(Math.min(...ys)), r(Math.min(...zs))], max: [r(Math.max(...xs)), r(Math.max(...ys)), r(Math.max(...zs))] };
    };
    const quat = (q) => q ? [r(q.x), r(q.y), r(q.z), r(q.w)] : null;
    const doorPivot = door?.parent;
    return {
      found: true,
      object: { id, defId: o.defId, x: o.x, z: o.z, rot: o.rot },
      model: def.model,
      groupYawDeg: r((g.rotation.y * 180) / Math.PI),
      bodyBox: box3(model),
      doorBox: box3(door),
      doorPivot: doorPivot ? { name: doorPivot.name, pos: [r(doorPivot.position.x), r(doorPivot.position.y), r(doorPivot.position.z)], quat: quat(doorPivot.quaternion), base: doorPivot.userData.baseQuaternion ?? null } : null,
      anim: anim ? {
        name: anim.name,
        children: anim.children.map((c) => ({ name: c.name || c.type, box: box3(c), visible: c.visible })),
        interiorVisible: cavity ? cavity.visible : null,
      } : null,
      clock: st.clock.minutes,
      action: p.queue[0] ? { id: p.queue[0].interactionId, phase: p.queue[0].phase, stage: p.queue[0].data?.stage ?? null, elapsed: p.queue[0].elapsed, target: p.queue[0].target } : null,
      animId: p.anim?.id ?? null,
      door: door ? { name: door.name, local: objLocal(door), visible: door.visible, parentVisible: door.parent?.visible ?? null } : null,
      cavity: cavity ? { local: objLocal(cavity) } : null,
      person: p.location.kind === 'lot' ? { x: p.location.x, z: p.location.z, local: toLocal(new V(p.location.x, 0, p.location.z)) } : null,
    };
  }, objectId);
}

async function shot(page, name) {
  const path = join(SHOTS, `${name}.png`);
  await page.screenshot({ path });
  console.log(`[qprobe] ${name}.png`);
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('run `npm run build` first: dist/ is missing');
  const owner = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(join(DIST, '__e2e-owner.txt'), owner);
  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser = null;
  const log = { facts: null, closed: null, open: null };
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`, 20000, server, owner);
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({ ...launchOptions(chromium), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, musicVolume: 0 })); } catch { /* ignore */ }
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('[qprobe] pageerror:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.log('[qprobe] console:', m.text()); });
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
      if (!fridge) throw new Error('starter house is missing the fridge');
      person.location = { kind: 'lot', lotId: st.activeLotId, x: fridge.x + 0.5, z: fridge.z + 1.35, level: 0, facing: Math.PI, posture: 'standing' };
      person.anim = { id: 'idle', since: st.clock.minutes, loop: true };
      for (const id of st.households[st.activeHouseholdId].memberIds) {
        if (id === person.id) continue;
        st.people[id].location = { kind: 'lot', lotId: st.activeLotId, x: 8.5, z: 18, level: 0, facing: 0, posture: 'standing' };
      }
      return { personId: person.id, fridgeId: fridge.id };
    });
    await page.evaluate(() => window.hearthside.view.lotChanged('objects'));
    await page.evaluate(() => window.hearthside.game.view.setCutaway('down'));
    await page.evaluate((id) => window.hearthside.game.select(id), setup.personId);
    await page.evaluate(() => window.hearthside.debug.step(1));
    await page.evaluate(() => { const st = window.hearthside.debug.state(); window.hearthside.view.setWorld(st, true); });
    await page.waitForTimeout(700);

    log.facts = await facts(page, setup.fridgeId);
    console.log('[qprobe] closed facts', JSON.stringify(log.facts));
    log.closed = [];
    for (let k = 0; k < 4; k++) {
      await aim(page, setup.fridgeId, k, 135, 1.0);
      await settle(page, 450);
      await shot(page, `fridge-closed-k${k}`);
      log.closed.push({ yawDeg: await page.evaluate(() => Math.round((window.hearthside.view.rig.yaw * 180) / Math.PI)) });
    }
    // Straight-on views with the person parked away, to read the faces without a body in the way.
    await page.evaluate((pid) => {
      const st = window.hearthside.debug.state();
      st.people[pid].location = { kind: 'lot', lotId: st.activeLotId, x: 8.5, z: 18, level: 0, facing: 0, posture: 'standing' };
      window.hearthside.view.setWorld(st, true);
    }, setup.personId);
    await page.evaluate(() => window.hearthside.debug.step(1));
    await settle(page, 350);
    log.cardinal = [];
    for (const [name, deg] of [['front', 0], ['right', 90], ['back', 180], ['left', 270]]) {
      const info = await aimYaw(page, setup.fridgeId, deg, 135, 1.0);
      await settle(page, 450);
      await shot(page, `fridge-closed-${name}`);
      log.cardinal.push({ name, ...info });
    }

    const q = await queueOption(page, setup.fridgeId, 'cookMeal');
    if (!q.ok) throw new Error(`cookMeal: ${q.reason}`);
    const f = await stepUntil(page, 'cookMeal', 0);
    if (!f) throw new Error('cookMeal never reached the fridge stage');
    log.open = [];
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.hearthside.debug.step(1));
      await settle(page, 250);
      const s = await facts(page, setup.fridgeId);
      log.open.push(s);
      console.log(`[qprobe] open +${i + 1}`, JSON.stringify({ clock: s.clock, action: s.action, animId: s.animId, anim: s.anim, doorPivot: s.doorPivot, doorBox: s.doorBox }));
    }
    for (const [name, deg] of [['front', 0], ['right', 90], ['back', 180], ['left', 270], ['k0', 45], ['k3', 315]]) {
      if (name.startsWith('k')) {
        await aim(page, setup.fridgeId, Number(name.slice(1)), 135, 1.0);
      } else {
        await aimYaw(page, setup.fridgeId, deg, 135, 1.0);
      }
      await settle(page, 450);
      await shot(page, `fridge-open-${name}`);
    }
    writeFileSync(join(SHOTS, 'probe.json'), JSON.stringify(log, null, 2));
    await context.close();
  } finally {
    await browser?.close().catch(() => undefined);
    server.kill('SIGTERM');
  }
  console.log('[qprobe] done');
}

main().catch((e) => { console.error('[qprobe] failed:', e); process.exitCode = 1; });
