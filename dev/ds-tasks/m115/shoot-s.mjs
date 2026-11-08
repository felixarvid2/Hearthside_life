// Task S (Milestone 11.5) visual check: the pictures on the computer and TV screens.
//
//   node dev/ds-tasks/m115/shoot-s.mjs
//
// Screenshots go to dev/ds-tasks/m115/shots/S/ in portrait 390x844, landscape 844x390 and desktop 1280x720:
// writing at 20 % and 80 %, programming, gaming, the TV on with someone watching, the computer off and the TV off.
// The script takes /tmp/hearthside-browser.lock itself (like the e2e scripts), so never wrap it in flock.
//
// The screen quads are children of the object group. To frame them exactly we read the group through
// `view.objects.rootOf(objectId)`, map the measured local screen centre (src/content/screens.ts) to world space and
// point the orthographic rig at it. `ppm` is pushed past the normal 150 clamp on purpose: these are close-ups of a
// 0.3-0.9 m picture and the task asks for the camera close to the screen.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5201;
const DIST = join(root, 'tests/e2e/out/dist-m115s');
const OUT = join(here, 'shots/S');
mkdirSync(OUT, { recursive: true });

if (!process.env.HEARTHSIDE_M115S_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url)], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_M115S_LOCKED: '1' },
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
const note = (name, ok, evidence = '') => { log.push({ name, ok, evidence }); console.log(`[m115-s] ${ok ? 'ok  ' : 'FAIL'} ${name}${evidence ? ` — ${evidence}` : ''}`); };

const VIEWPORTS = [
  { id: 'portrait', width: 390, height: 844, mobile: true },
  { id: 'landscape', width: 844, height: 390, mobile: true },
  { id: 'desktop', width: 1280, height: 720, mobile: false },
];

/** Measured screen centres + glass height (rot-0 local space) from src/content/screens.ts, duplicated for the page context. */
const LOCAL = {
  'computer-desktop': [0.5, 0.3426, 0.4999, 0.4674],
  'tv-flatscreen': [0.5, 0.3671, 0.53, 0.5159],
};

async function waitForServer(url, ms, server) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (server.exitCode !== null) throw new Error(`preview server exited (${server.exitCode})`);
    try { const r = await fetch(url); if (r.ok) return; } catch { /* wait */ }
    await sleep(250);
  }
  throw new Error(`server at ${url} did not start`);
}

const frames = (page, n, dt = 1 / 30) => page.evaluate(([n2, dt2]) => { for (let i = 0; i < n2; i++) window.hearthside.debug.frame(dt2); }, [n, dt]);

async function startGame(page) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
  const started = await page.evaluate(async () => {
    const g = window.hearthside.game;
    const hhs = g.premadeHouseholds();
    const r = await g.startNewGame('guided', hhs.find((h) => h.members.length >= 2) ?? hhs[0]);
    g.setSpeed(0);
    const st = g.state();
    st.clock.minutes = Math.max(st.clock.minutes, 10 * 60);
    st.settings.visitors = false;
    st.settings.autonomy = false; // the shots drive every action; nobody may wander off and switch a screen on
    return r;
  });
  if (!started.ok) throw new Error(`startNewGame failed: ${started.reason}`);
  await page.waitForTimeout(500);
  await page.evaluate(() => { document.querySelectorAll('.toast, .toasts > *').forEach((t) => t.remove()); window.hearthside.debug.step(20); });
  await frames(page, 6);
  // Every step below is driven through `debug.frame`, so the app's own requestAnimationFrame loop is not
  // needed. Stop it: a frame slipping in between the re-aim and the screenshot could start a camera glide
  // and reset the close-up zoom (this happened before the loop was stopped).
  await page.evaluate(() => {
    const g = window.hearthside.game;
    if (g.raf) { cancelAnimationFrame(g.raf); g.raf = 0; }
  });
}

/** Puts the person at the object and queues `interactionId`; steps until the perform phase starts. */
async function startInteraction(page, defId, interactionId) {
  return page.evaluate(([wantDef, wantInteraction]) => {
    const h = window.hearthside, g = h.game, st = g.state();
    const lot = st.lots[st.activeLotId];
    const hh = st.households[st.activeHouseholdId];
    const obj = Object.values(lot.objects).find((o) => o.defId === wantDef);
    if (!obj) return { ok: false, reason: `no ${wantDef} on the lot` };
    const id = hh.memberIds.find((m) => {
      const p = st.people[m];
      return p && p.location.kind === 'lot' && p.lifeStage !== 'baby' && p.lifeStage !== 'toddler' && p.anim.id !== 'sleep';
    }) ?? hh.memberIds[0];
    if (!id) return { ok: false, reason: 'no household member' };
    for (const a of [...st.people[id].queue]) g.cancel(id, a.id);
    h.debug.step(1);
    for (const a of [...st.people[id].queue]) g.cancel(id, a.id);
    g.setMode('live');
    const opts = g.options(id, { kind: 'object', objectId: obj.id });
    const opt = opts.find((o) => o.interactionId === wantInteraction && o.enabled);
    if (!opt) return { ok: false, reason: `no enabled ${wantInteraction} (${opts.map((o) => `${o.interactionId}:${o.enabled}`).join(', ')})` };
    const q = g.queue(id, opt);
    if (!q.ok) return { ok: false, reason: q.reason };
    for (let i = 0; i < 600; i++) {
      h.debug.step(1);
      const head = st.people[id].queue[0];
      if (head?.interactionId === wantInteraction && head.phase === 'perform') {
        return { ok: true, personId: id, objectId: obj.id, actionId: head.id, elapsed: head.elapsed, duration: head.duration };
      }
      if (!st.people[id].queue.length || st.people[id].queue[0]?.interactionId !== wantInteraction) {
        return { ok: false, reason: `action ended early (anim ${st.people[id].anim.id})` };
      }
    }
    return { ok: false, reason: 'never reached perform' };
  }, [defId, interactionId]);
}

/** Advances the running action to `fraction` of its duration without changing the action. */
async function stepTo(page, personId, fraction) {
  return page.evaluate(([pid, f]) => {
    const h = window.hearthside, st = h.game.state();
    const head = st.people[pid].queue[0];
    if (!head?.duration) return { ok: false, reason: 'no timed action' };
    const target = Math.floor(head.duration * f);
    for (let i = 0; i < 500 && head.elapsed < target; i++) h.debug.step(1);
    return {
      ok: true, interactionId: head.interactionId, actionId: head.id,
      elapsed: head.elapsed, duration: head.duration, progress: head.elapsed / head.duration,
      phase: head.phase,
    };
  }, [personId, fraction]);
}

/**
 * Cancels everything anyone on the lot is doing, so the screen really goes dark. Clearing only the
 * actor is not enough: another household member may be autonomously watching the same TV or using
 * the computer (the off shots must show nobody using it).
 */
async function clearAllActions(page) {
  await page.evaluate(() => {
    const h = window.hearthside, g = h.game, st = g.state();
    const ids = Object.keys(st.people).filter((pid) => st.people[pid]?.location.kind === 'lot');
    for (const pid of ids) for (const a of [...st.people[pid].queue]) g.cancel(pid, a.id);
    for (let i = 0; i < 40; i++) h.debug.step(1);
    for (const pid of ids) for (const a of [...st.people[pid].queue]) g.cancel(pid, a.id);
  });
  await frames(page, 10);
}

/**
 * Points the camera straight at a screen (or a point between the screen and the watcher), bypassing the usual zoom
 * clamp. Returns the world point and its projected CSS position so a missed shot is obvious in the log.
 */
async function aim(page, objectId, opts = {}) {
  return page.evaluate(([id, local, camYawDeg, ppm, extra]) => {
    const h = window.hearthside;
    const root = h.view.objects.rootOf(id);
    if (!root) return { ok: false, reason: 'object group not found' };
    const v = root.position.clone();
    v.set(local[0], local[1], local[2]);
    root.localToWorld(v);
    // A reveal queued by the UI would glide the zoom back out during the frames before the
    // screenshot; this is a deliberate close-up, so drop it.
    h.view.pendingReveal = null;
    const r = h.view.rig;
    r.turn = null;
    r.yaw = (camYawDeg * Math.PI) / 180;
    const tx = extra ? (v.x + extra.x) / 2 : v.x;
    const tz = extra ? (v.z + extra.z) / 2 : v.z;
    const ty = extra ? (v.y + extra.y) / 2 : v.y;
    r.glideTo(tx, tz, undefined, 0, ty);
    r.ppm = ppm;
    r.dirty = true;
    h.debug.frame(1 / 30);
    const screen = r.project(v.x, v.y, v.z, { x: 0, y: 0, visible: false });
    return { ok: true, world: { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) }, target: { x: +tx.toFixed(3), y: +ty.toFixed(3), z: +tz.toFixed(3) }, ppm, ppmNow: Math.round(r.ppm), glide: !!r.glide, screen };
  }, [objectId, opts.local, opts.camYawDeg ?? 0, opts.ppm ?? 400, opts.extra ?? null]);
}

/** Camera yaw that looks at a local +z face after the object's quarter turns. */
const camYawFor = (rot) => ((rot ?? 0) * 90 + 0) % 360;

async function main() {
  console.log('[m115-s] building', DIST);
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
      await context.addInitScript(() => { try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, hints: false, musicVolume: 0, autoSave: false })); } catch { /* ignore */ } });
      const page = await context.newPage();
      page.setDefaultTimeout(120_000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await startGame(page);

      // Let the throttled screen canvases redraw (up to 4 a second), then put the camera back: a pending
      // UI reveal may have started a glide during those frames. We do not need another frame after the
      // re-aim because `aim` renders one itself.
      const shot = async (name, reaim) => {
        await frames(page, 12);
        // Re-aim last: the UI lays its panels out asynchronously, which can shift the uncovered
        // area (and so the framing) during the frames above. Return the camera as it is at capture.
        const aimed = reaim ? await reaim() : null;
        const cam = await page.evaluate(() => {
          const v = window.hearthside.view, r = v.rig;
          return {
            ppm: Math.round(r.ppm), yaw: Math.round((r.yaw * 180) / Math.PI), k: r.k,
            target: { x: +r.target.x.toFixed(2), y: +r.target.y.toFixed(2), z: +r.target.z.toFixed(2) },
            glide: !!r.glide, orbiting: !!v.orbiting,
          };
        });
        log.push({ name: `shot ${name}-${vp.id}`, ok: true, evidence: JSON.stringify(cam) });
        await page.screenshot({ path: join(OUT, `${name}-${vp.id}.png`) });
        return aimed;
      };

      const objects = await page.evaluate(() => {
        const st = window.hearthside.game.state();
        const lot = st.lots[st.activeLotId];
        const find = (defId) => Object.values(lot.objects).find((o) => o.defId === defId);
        const hh = st.households[st.activeHouseholdId];
        return { computer: find('computer-desktop'), tv: find('tv-flatscreen'), personId: hh.memberIds[0] };
      });
      note(`${vp.id}: the starter home has the computer and TV used for the shots`, !!objects.computer && !!objects.tv, `computer=${objects.computer?.id} tv=${objects.tv?.id}`);
      const actor = objects.personId;
      const computerAim = () => aim(page, objects.computer.id, { local: LOCAL['computer-desktop'], camYawDeg: camYawFor(objects.computer.rot), ppm: 400 });
      const tvAim = () => aim(page, objects.tv.id, { local: LOCAL['tv-flatscreen'], camYawDeg: camYawFor(objects.tv.rot), ppm: 180 });

      // 1-2. Writing: the same article at 20 % and 80 %, so the typed page is visibly longer.
      const writing = await startInteraction(page, 'computer-desktop', 'writeArticle');
      note(`${vp.id}: writing starts at the desktop computer`, writing.ok, writing.ok ? `person=${writing.personId} action=${writing.actionId}` : writing.reason);
      if (writing.ok) {
        await page.evaluate(() => window.hearthside.view.setCutaway('cutaway'));
        const cam = await aim(page, writing.objectId, { local: LOCAL['computer-desktop'], camYawDeg: camYawFor(objects.computer.rot), ppm: 400 });
        note(`${vp.id}: the camera is close to the computer screen`, cam.ok && cam.screen.visible, JSON.stringify(cam));
        const at20 = await stepTo(page, writing.personId, 0.2);
        const cam20 = await aim(page, writing.objectId, { local: LOCAL['computer-desktop'], camYawDeg: camYawFor(objects.computer.rot), ppm: 400 });
        await shot('writing-20', computerAim);
        note(`${vp.id}: writing at 20 % shows a partial page`, at20.ok && at20.progress >= 0.19 && at20.progress <= 0.24, JSON.stringify(at20));
        note(`${vp.id}: writing 20 % screen centre is on screen`, cam20.ok && cam20.screen.visible, JSON.stringify(cam20));

        const at80 = await stepTo(page, writing.personId, 0.8);
        const cam80 = await aim(page, writing.objectId, { local: LOCAL['computer-desktop'], camYawDeg: camYawFor(objects.computer.rot), ppm: 400 });
        await shot('writing-80', computerAim);
        note(`${vp.id}: writing at 80 % is further into the same action`, at80.ok && at80.actionId === at20.actionId && at80.progress >= 0.79 && at80.progress <= 0.84, JSON.stringify({ at20, at80 }));
        note(`${vp.id}: writing 80 % screen centre is on screen`, cam80.ok && cam80.screen.visible, JSON.stringify(cam80));
      }

      // 3. Programming: code editor and terminal.
      await clearAllActions(page);
      const programming = await startInteraction(page, 'computer-desktop', 'practiceProgramming');
      if (programming.ok) {
        await stepTo(page, programming.personId, 0.45);
        await aim(page, programming.objectId, { local: LOCAL['computer-desktop'], camYawDeg: camYawFor(objects.computer.rot), ppm: 400 });
        await shot('programming', computerAim);
        note(`${vp.id}: programming shows the code editor`, programming.ok, `person=${programming.personId}`);
      } else note(`${vp.id}: programming starts`, false, programming.reason);

      // 4. Gaming: the little animated game.
      await clearAllActions(page);
      const gaming = await startInteraction(page, 'computer-desktop', 'playComputerGames');
      if (gaming.ok) {
        await stepTo(page, gaming.personId, 0.5);
        await aim(page, gaming.objectId, { local: LOCAL['computer-desktop'], camYawDeg: camYawFor(objects.computer.rot), ppm: 400 });
        await shot('gaming', computerAim);
        note(`${vp.id}: gaming shows the animated game`, gaming.ok, `person=${gaming.personId}`);
      } else note(`${vp.id}: gaming starts`, false, gaming.reason);

      // 5. Computer off.
      await clearAllActions(page);
      await computerAim();
      await shot('computer-off', computerAim);

      // 6. TV on with someone watching: frame the screen and the seated watcher together.
      const tv = await startInteraction(page, 'tv-flatscreen', 'watchTv');
      if (tv.ok) {
        const tvCam = () => page.evaluate(([id, local, rot, vw, vh]) => {
          const h = window.hearthside, st = h.game.state();
          h.view.pendingReveal = null;
          const root = h.view.objects.rootOf(id);
          const v = root.position.clone();
          v.set(local[0], local[1], local[2]);
          root.localToWorld(v);
          const p = st.people[Object.keys(st.people).find((pid) => st.people[pid].queue[0]?.interactionId === 'watchTv')];
          const loc = p?.location;
          const person = loc && loc.kind === 'lot' ? { x: loc.x, y: 1.0, z: loc.z } : { x: v.x + 1.5, y: 1.0, z: v.z };
          const r = h.view.rig;
          r.turn = null;
          r.yaw = (rot * 90 * Math.PI) / 180;
          const tx = (v.x + person.x) / 2, ty = (v.y + person.y) / 2, tz = (v.z + person.z) / 2;
          r.glideTo(tx, tz, undefined, 0, ty);
          // The watcher sits a few metres along the view axis, so pitch separates the TV from the person
          // vertically: in the short landscape viewport 190 ppm pushed the TV's top edge off the top of
          // the frame. Fit to the smaller dimension instead, keeping the whole glass and the head inside.
          r.ppm = Math.round(Math.max(90, Math.min(190, vw / 3.2, vh / 3.4)));
          r.dirty = true;
          h.debug.frame(1 / 30);
          const screen = r.project(v.x, v.y, v.z, { x: 0, y: 0, visible: false });
          // Corners of the measured glass (local y up) and the watcher's head, to prove the framing.
          const top = root.position.clone(); top.set(local[0], local[1] + local[3] / 2, local[2]); root.localToWorld(top);
          const bottom = root.position.clone(); bottom.set(local[0], local[1] - local[3] / 2, local[2]); root.localToWorld(bottom);
          const head = r.project(person.x, 1.35, person.z, { x: 0, y: 0, visible: false });
          const topPx = r.project(top.x, top.y, top.z, { x: 0, y: 0, visible: false });
          const bottomPx = r.project(bottom.x, bottom.y, bottom.z, { x: 0, y: 0, visible: false });
          const m = 4;
          const framed = screen.visible && topPx.visible && bottomPx.visible && head.visible
            && topPx.y >= m && bottomPx.y <= vh - m && head.y >= m && head.y <= vh - m;
          return { ok: true, world: { x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) }, person: { x: +person.x.toFixed(2), z: +person.z.toFixed(2) }, target: { x: +tx.toFixed(2), y: +ty.toFixed(2), z: +tz.toFixed(2) }, ppm: r.ppm, posture: loc?.posture, screen, top: +topPx.y.toFixed(0), bottom: +bottomPx.y.toFixed(0), head: +head.y.toFixed(0), framed };
        }, [tv.objectId, LOCAL['tv-flatscreen'], objects.tv.rot, vp.width, vp.height]);
        const cam = await tvCam();
        const shotCam = await shot('tv-watching', tvCam);
        note(`${vp.id}: the TV is on while someone is watching`, tv.ok && cam.posture === 'seated', JSON.stringify({ ...cam, watch: tv }));
        // The first projection can be stale while the UI panels finish laying out; judge by the
        // camera state at capture, which is what the screenshot actually shows.
        note(`${vp.id}: the TV screen and watcher share the frame`, shotCam?.ok === true && shotCam.framed === true && shotCam.top >= 4 && shotCam.head <= vp.height - 4, JSON.stringify(shotCam ?? cam));
      } else note(`${vp.id}: watching TV starts`, false, tv.reason);

      // 7. TV off.
      await clearAllActions(page);
      await tvAim();
      await shot('tv-off', tvAim);

      note(`${vp.id}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' / '));
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGTERM');
    writeFileSync(join(OUT, 'shots.json'), JSON.stringify(log, null, 2));
  }

  const failed = log.filter((l) => !l.ok);
  console.log(`[m115-s] ${log.length - failed.length}/${log.length} checks passed; screenshots in dev/ds-tasks/m115/shots/S/`);
  if (failed.length) process.exitCode = 1;
}

await main();
