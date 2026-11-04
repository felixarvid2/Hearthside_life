// Task B (Milestone 11.5) visual check: the progress pill above the head while cooking at ~30% and ~90% (green),
// two people doing different actions at once, the completion check, and the "Action progress" setting in Settings,
// in portrait 390x844, landscape 844x390 and desktop 1280x720. Screenshots go to dev/ds-tasks/m115/shots/B/.
//
//   node dev/ds-tasks/m115/shoot-b.mjs
//
// The script takes /tmp/hearthside-browser.lock itself, so do not wrap it in flock. It builds its own copy of the
// game and starts a guided household with autonomy off, so the seeded actions are the only ones running. The game
// clock is paused (speed 0); ticks are advanced explicitly with debug.step.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const PORT = 5196;
const DIST = join(root, 'tests/e2e/out/dist-m115b');
const OUT = join(here, 'shots/B');

// One Chromium at a time across visual scripts. Re-exec under flock once; HEARTHSIDE_M115B_LOCKED marks the child.
if (!process.env.HEARTHSIDE_M115B_LOCKED) {
  const locked = spawnSync('flock', ['/tmp/hearthside-browser.lock', process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_M115B_LOCKED: '1' },
  });
  process.exit(locked.status ?? 1);
}
mkdirSync(OUT, { recursive: true });

// Chromium's close can occasionally hang in this container; never keep the shared browser lock forever.
const watchdog = setTimeout(() => { console.error('[m115-b] watchdog: exiting'); process.exit(0); }, 25 * 60 * 1000);
watchdog.unref();

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
const note = (name, ok, evidence = '') => { log.push({ name, ok, evidence }); console.log(`[m115-b] ${ok ? 'ok  ' : 'FAIL'} ${name}${evidence ? ` — ${evidence}` : ''}`); };

const ALL_VIEWPORTS = [
  { id: 'portrait', width: 390, height: 844, mobile: true },
  { id: 'landscape', width: 844, height: 390, mobile: true },
  { id: 'desktop', width: 1280, height: 720, mobile: false },
];
// `--only=desktop` (etc.) re-captures one viewport without redoing the others.
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const VIEWPORTS = ALL_VIEWPORTS.filter((v) => !only || v.id === only);
if (VIEWPORTS.length === 0) throw new Error(`--only must be one of ${ALL_VIEWPORTS.map((v) => v.id).join(', ')}`);

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
    return r;
  });
  if (!started.ok) throw new Error(`startNewGame failed: ${started.reason}`);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.querySelectorAll('.toast, .toasts > *').forEach((t) => t.remove());
    const g = window.hearthside.game;
    g.setMode('live');
    g.setSimSettings({ autonomy: false, visitors: false });
    window.hearthside.debug.step(20);
  });
  await frames(page, 6);
}

/**
 * Glides to a world point at a fixed moderate zoom. The guided game starts very close to the selected person (well
 * over 200 px/m) and `view.focusOn(x, z, true)` keeps the current zoom, which pushes the camera into the kitchen
 * counter — the person ends up clipped by it while the pill still projects above the countertop. A fixed zoom keeps
 * the actor in frame.
 */
async function frameAt(page, x, z, ppm) {
  await page.evaluate(([px, pz, pp]) => window.hearthside.view.rig.glideTo(px, pz, pp, 0.25, 0.9), [x, z, ppm]);
  await page.waitForTimeout(500);
}

/** Queues Cook a Meal on the fridge for a member who is home and advances to the cooking stage. */
async function startCooking(page, camPpm) {
  const r = await page.evaluate(() => {
    const h = window.hearthside, g = h.game, st = g.state();
    const hh = st.households[st.activeHouseholdId];
    const onLot = (id) => st.people[id]?.location.kind === 'lot';
    const lot = st.lots[st.activeLotId];
    const fridge = Object.values(lot.objects).find((o) => /fridge/.test(o.defId));
    if (!fridge) return { ok: false, reason: 'no fridge' };
    const members = hh.memberIds.filter(onLot);
    for (const id of members) for (const a of [...st.people[id].queue]) g.cancel(id, a.id);
    h.debug.step(2);
    for (const id of members) for (const a of [...st.people[id].queue]) g.cancel(id, a.id);
    let cookId = null, opt = null;
    for (const id of members) {
      const o = g.options(id, { kind: 'object', objectId: fridge.id }).find((x) => x.enabled && x.interactionId === 'cookMeal');
      if (o) { cookId = id; opt = o; break; }
    }
    if (!cookId || !opt) return { ok: false, reason: `no cook option for ${members.join(', ')}` };
    const q = g.queue(cookId, opt);
    if (!q.ok) return { ok: false, reason: q.reason };
    for (let i = 0; i < 600; i++) {
      h.debug.step(1);
      const a = st.people[cookId].queue[0];
      if (!a) return { ok: false, reason: 'cook action ended while starting' };
      if (a.phase === 'perform' && a.data.stage === 1) {
        const p = st.people[cookId];
        const loc = p.location;
        return {
          ok: true, id: cookId, name: `${p.firstName} ${p.lastName}`, duration: a.duration,
          recipeId: a.data.recipeId ?? null, x: loc.kind === 'lot' ? loc.x : 0, z: loc.kind === 'lot' ? loc.z : 0,
        };
      }
    }
    return { ok: false, reason: 'never reached the cooking stage' };
  });
  if (r.ok) {
    // Frame the cook at a fixed zoom and let the glide settle (the sim is paused).
    await frameAt(page, r.x, r.z, camPpm);
    await page.waitForTimeout(600);
  }
  await frames(page, 8);
  return r;
}

/** Sets the cook's perform progress to `fraction` of the whole chain (stages 0-2). */
async function setCookFraction(page, id, fraction) {
  return page.evaluate(([personId, f]) => {
    const st = window.hearthside.debug.state();
    const a = st.people[personId]?.queue[0];
    if (!a || a.phase !== 'perform') return null;
    // The chain plan is [2, duration, 1] minutes; base 2 minutes is already complete at stage 1.
    const total = (a.duration ?? 0) + 3;
    a.elapsed = Math.max(0, Math.min(a.duration ?? 0, f * total - 2));
    return { elapsed: a.elapsed, duration: a.duration };
  }, [id, fraction]);
}

/** Completion check: hold the action in a successful apply so the green pill stays for the screenshot. */
async function showCompletion(page, id) {
  return page.evaluate((personId) => {
    const st = window.hearthside.debug.state();
    const a = st.people[personId]?.queue[0];
    if (!a) return null;
    a.phase = 'apply';
    a.data.result = 'done';
    a.elapsed = a.duration ?? a.elapsed;
    return { phase: a.phase, duration: a.duration };
  }, id);
}

/**
 * Waits until the visible pill has written `pct`, then disables its CSS transition and forces a style flush.
 * SwiftShader at 1280x720 renders slowly enough that a 200 ms colour transition may not have run when the DOM is
 * read/screenshotted; the pill itself (target width/colour) is already at its final state after the write.
 */
async function settleAllPills(page) {
  await page.evaluate(() => {
    for (const fill of document.querySelectorAll('#world-overlay .wo-pill-fill')) {
      fill.style.transition = 'none';
      fill.getBoundingClientRect();
    }
  });
  await frames(page, 2);
}

async function settlePill(page, pct) {
  await page.waitForFunction((p) => {
    const pill = document.querySelector('#world-overlay .wo-pill:not([hidden])');
    return pill?.getAttribute('aria-valuenow') === String(p);
  }, pct, { timeout: 8000 }).catch(() => {});
  await settleAllPills(page);
}

async function pillState(page) {
  return page.evaluate(() => {
    const pills = [...document.querySelectorAll('#world-overlay .wo-pill')]
      .filter((e) => !e.hidden && e.getBoundingClientRect().width > 0)
      .map((e) => {
        const fill = e.querySelector('.wo-pill-fill');
        const r = e.getBoundingClientRect();
        return {
          label: e.getAttribute('aria-label') ?? '', now: e.getAttribute('aria-valuenow') ?? '',
          width: fill?.style.width ?? '', colour: fill ? getComputedStyle(fill).backgroundColor : '',
          done: e.classList.contains('is-done'), cancelled: e.classList.contains('is-cancelled'),
          walking: e.classList.contains('is-walking'),
          x: Math.round(r.x + r.width / 2), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        };
      });
    return { pills, count: pills.length };
  });
}

/**
 * Closes panels/menus that may cover the world overlay. The person panel and the pause menu slide over the overlay
 * with a scrim; at speed 0 closing the pause menu does not resume the game.
 */
async function clearOverlays(page) {
  const before = await page.evaluate(() => ({
    menu: !!document.querySelector('.game-menu'),
    backdrop: !!document.querySelector('.modal-backdrop'),
    panel: !!document.querySelector('.panel'),
  }));
  if (before.menu || before.backdrop || before.panel) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  return before;
}

/** Two real animation frames so the compositor has painted the latest overlay state. */
async function repaint(page) {
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(null)))));
  await page.waitForTimeout(120);
}

/** Counts fill-coloured (and check-white) pixels inside a pill's rect in a saved screenshot. */
async function pillPixels(file, pill, done = false) {
  const meta = await sharp(file).metadata();
  const left = Math.max(0, Math.round(pill.x - pill.w / 2) - 6);
  const top = Math.max(0, Math.round(pill.y) - 6);
  const width = Math.min(meta.width - left, pill.w + 12);
  const height = Math.min(meta.height - top, pill.h + 12);
  const { data, info } = await sharp(file).extract({ left, top, width, height }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const target = (pill.colour.match(/\d+/g) ?? []).map(Number);
  let fill = 0, whiteRight = 0, maxCheck = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (target.length >= 3 && Math.abs(r - target[0]) <= 26 && Math.abs(g - target[1]) <= 26 && Math.abs(b - target[2]) <= 26) fill++;
      if (done && x > info.width * 0.55) {
        if (r > 215 && g > 215 && b > 215) whiteRight++;
        maxCheck = Math.max(maxCheck, Math.min(r, g, b));
      }
    }
  }
  return { fill, whiteRight, maxCheck, box: { left, top, width, height } };
}

/**
 * Takes a screenshot and checks the saved PNG really contains the pill fill (SwiftShader can capture the overlay
 * mid-layout). Retries after closing any panel/menu and repainting.
 */
async function capture(page, file, { count = 1, done = false, minFill = 12 } = {}) {
  const path = join(OUT, file);
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const cleared = await clearOverlays(page);
    await repaint(page);
    const state = await pillState(page);
    const pills = state.pills.slice(0, count);
    await page.screenshot({ path, animations: 'disabled' });
    const checks = [];
    for (let i = 0; i < pills.length; i++) checks.push(await pillPixels(path, pills[i], done && i === 0));
    const ok = pills.length >= count && checks.every((c) => c.fill >= minFill) && (!done || (checks[0]?.whiteRight ?? 0) >= 2);
    console.log(`[m115-b] shot ${file}${attempt > 1 ? ` attempt ${attempt}` : ''}: pills=${state.count} fills=${checks.map((c) => c.fill).join(',')} check=${checks[0]?.whiteRight ?? 0}${done ? ` maxCheck=${checks[0]?.maxCheck ?? 0}` : ''}${cleared.menu ? ' (closed menu)' : ''}`);
    if (ok) return { pills, checks };
    last = { pills, checks };
  }
  return { ...last, failed: true };
}

/**
 * Keeps the pill's 700 ms completion state alive while a 1280x720 SwiftShader screenshot is taken. The controller
 * reads performance.now(); freezing it after the done state has been sampled makes the ending timer stand still.
 */
async function installClock(page) {
  await page.evaluate(() => {
    const real = performance.now.bind(performance);
    let frozen = real(), on = false;
    Object.defineProperty(performance, 'now', { configurable: true, value: () => (on ? frozen : real()) });
    window.__m115bClock = {
      freeze() { frozen = real(); on = true; },
      tick(ms) { frozen += ms; },
      release() { on = false; },
    };
  });
}

/** Freezes the clock, nudges it past the 100 ms sample throttle, and waits for the done pill to be written. */
async function holdDone(page) {
  await page.evaluate(() => { window.__m115bClock.freeze(); window.__m115bClock.tick(1300); });
  await repaint(page);
  await page.waitForFunction(() => {
    const pill = document.querySelector('#world-overlay .wo-pill:not([hidden])');
    return pill?.classList.contains('is-done') === true;
  }, null, { timeout: 8000 }).catch(() => {});
  await repaint(page);
}

/** Queues two different object actions for two different people and advances until both are performing. */
async function twoActions(page, camPpm) {
  const r = await page.evaluate(() => {
    const h = window.hearthside, g = h.game, st = g.state();
    const hh = st.households[st.activeHouseholdId];
    const onLot = (id) => st.people[id]?.location.kind === 'lot';
    const members = hh.memberIds.filter((id) => onLot(id) && st.people[id].location.posture !== 'lying');
    const lot = st.lots[st.activeLotId];
    const objects = Object.values(lot.objects);
    for (const id of members) for (const a of [...st.people[id].queue]) g.cancel(id, a.id);
    h.debug.step(2);
    for (const id of members) for (const a of [...st.people[id].queue]) g.cancel(id, a.id);

    const candidates = [];
    for (const id of members) {
      const loc = st.people[id].location;
      for (const o of objects) {
        const d = Math.hypot((loc.x ?? 0) - o.x, (loc.z ?? 0) - o.z);
        const opts = g.options(id, { kind: 'object', objectId: o.id })
          .filter((x) => x.enabled && x.group === 'object' && x.interactionId !== 'goHere');
        for (const opt of opts) candidates.push({ person: id, objectId: o.id, x: o.x, z: o.z, d, opt });
      }
    }
    candidates.sort((a, b) => a.d - b.d);
    const tries = [];
    for (const a of candidates) {
      for (const b of candidates) {
        if (a.person === b.person || a.objectId === b.objectId || a.opt.interactionId === b.opt.interactionId) continue;
        const dist = Math.hypot(a.x - b.x, a.z - b.z);
        if (dist > 14) continue;
        tries.push([a, b, dist]);
      }
    }
    // Closest pairs first: the camera can frame both pills together.
    tries.sort((x, y) => x[2] - y[2]);
    tries.length = Math.min(12, tries.length);
    for (const [a, b] of tries) {
      const qa = g.queue(a.person, a.opt);
      const qb = g.queue(b.person, b.opt);
      if (!qa.ok || !qb.ok) {
        for (const id of [a.person, b.person]) for (const act of [...st.people[id].queue]) g.cancel(id, act.id);
        h.debug.step(2);
        continue;
      }
      for (let i = 0; i < 360; i++) {
        h.debug.step(1);
        const ha = st.people[a.person].queue[0];
        const hb = st.people[b.person].queue[0];
        if (!ha || !hb) break;
        if (ha.phase === 'perform' && hb.phase === 'perform') {
          return {
            ok: true,
            a: { person: a.person, name: st.people[a.person].firstName, action: ha.interactionId, x: a.x, z: a.z },
            b: { person: b.person, name: st.people[b.person].firstName, action: hb.interactionId, x: b.x, z: b.z },
            midX: (a.x + b.x) / 2, midZ: (a.z + b.z) / 2, dist,
            ticks: i,
          };
        }
        // One action can end before the other starts (a short sit); retry with the next pair.
        if (ha.phase === 'cleanup' || hb.phase === 'cleanup') break;
      }
      for (const id of [a.person, b.person]) for (const act of [...st.people[id].queue]) g.cancel(id, act.id);
      h.debug.step(2);
    }
    return { ok: false, reason: `no pair started (${tries.length} tried)` };
  });
  if (r.ok) {
    // Centre both actors at the closest zoom that keeps the pair on screen, so both pills are readable together.
    const fit = Math.min(camPpm, page.viewportSize().width / (r.dist + 5));
    await frameAt(page, r.midX, r.midZ, Math.max(20, Math.round(fit)));
    await page.waitForTimeout(600);
  }
  await frames(page, 6);
  return r;
}

async function openSettings(page, mobile) {
  const click = async (loc) => { if (mobile) await loc.tap(); else await loc.click(); };
  await click(page.getByRole('button', { name: 'Menu', exact: true }).first());
  await page.waitForTimeout(500);
  await click(page.getByRole('button', { name: /^Settings/ }).first());
  await page.waitForSelector('.settings-modal', { timeout: 30000 });
  // Let the sheet finish its slide-in before scrolling, and centre the whole field (label + control), not just the
  // segmented control, so the row is readable in the narrow viewport.
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const seg = document.querySelector('.settings-modal .segmented[aria-label="Action progress"]');
    (seg?.closest('.field') ?? seg)?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => {
    const seg = document.querySelector('.settings-modal .segmented[aria-label="Action progress"]');
    const r = seg?.getBoundingClientRect();
    const selected = seg?.querySelector('.seg.is-selected')?.getAttribute('data-id') ?? null;
    const labels = [...(seg?.querySelectorAll('.seg') ?? [])].map((b) => ({ id: b.getAttribute('data-id'), text: b.textContent?.trim() ?? '' }));
    return { exists: !!seg, selected, labels, box: r ? { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) } : null };
  });
  return state;
}

async function main() {
  console.log('[m115-b] building', DIST);
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
      page.setDefaultTimeout(120_000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await startGame(page);
      await installClock(page);

      // Fixed zoom: 46 px/m leaves a 1.7 m actor ~78 px tall on phones, 78 px/m ~133 px on desktop, and keeps the
      // camera outside the kitchen furniture.
      const camPpm = vp.mobile ? 46 : 78;
      const cook = await startCooking(page, camPpm);
      note(`${vp.id}: cooking starts and reaches the cooking stage`, cook.ok, cook.ok ? `${cook.name} recipe=${cook.recipeId} duration=${cook.duration}` : cook.reason);
      if (!cook.ok) { await context.close(); continue; }

      // ~30% of the whole cook chain.
      const at30 = await setCookFraction(page, cook.id, 0.3);
      await settlePill(page, 30);
      let pills = await pillState(page);
      const p30 = pills.pills[0];
      const rgb30 = (p30?.colour.match(/\d+/g) ?? []).map(Number);
      note(`${vp.id}: cooking at ~30% shows a partially filled amber pill`,
        !!p30 && /%/i.test(p30.label) && parseFloat(p30.width) >= 24 && parseFloat(p30.width) <= 36 &&
          !p30.done && rgb30.length >= 3 && rgb30[0] > rgb30[1],
        JSON.stringify({ set: at30, pill: p30 }));
      if (p30) note(`${vp.id}: the pill sits above the head and is phone-sized`, p30.h >= 9 && p30.h <= 14 && p30.w >= 40 && p30.w <= 60, `w=${p30.w} h=${p30.h} at ${p30.x},${p30.y}`);
      const shot30 = await capture(page, `cook-30-${vp.id}.png`, { minFill: 8 });
      note(`${vp.id}: the 30% screenshot shows the amber fill`, !shot30.failed, `fill=${shot30.checks?.[0]?.fill ?? 0}`);

      // ~90%: green.
      const at90 = await setCookFraction(page, cook.id, 0.9);
      await settlePill(page, 90);
      pills = await pillState(page);
      const p90 = pills.pills[0];
      const green = p90 ? p90.colour.replace(/\s/g, '') : '';
      note(`${vp.id}: cooking at ~90% is green`,
        !!p90 && parseFloat(p90.width) >= 85 && !p90.done && green === 'rgb(77,154,91)',
        JSON.stringify({ set: at90, pill: p90 }));
      const shot90 = await capture(page, `cook-90-${vp.id}.png`, { minFill: 30 });
      note(`${vp.id}: the 90% screenshot shows the green fill`, !shot90.failed, `fill=${shot90.checks?.[0]?.fill ?? 0}`);

      // Completion: green with the check. Freeze the controller clock so the 700 ms ending cannot expire before
      // the (slow under SwiftShader) screenshot is captured.
      await showCompletion(page, cook.id);
      await settlePill(page, 100);
      await holdDone(page);
      pills = await pillState(page);
      const pd = pills.pills[0];
      note(`${vp.id}: completion shows the check and the full green pill`,
        !!pd && pd.done && pd.width === '100%' && /complete/i.test(pd.label), JSON.stringify({ pill: pd }));
      const doneShot = await capture(page, `done-check-${vp.id}.png`, { done: true, minFill: 40 });
      note(`${vp.id}: the completion screenshot shows the green pill and the check`, !doneShot.failed, `fill=${doneShot.checks?.[0]?.fill ?? 0} check=${doneShot.checks?.[0]?.whiteRight ?? 0}`);
      await page.evaluate(() => window.__m115bClock.release());
      // Revert the held action so the pair setup starts from a clean queue.
      await page.evaluate(() => {
        const st = window.hearthside.debug.state();
        for (const p of Object.values(st.people)) for (const a of [...p.queue]) window.hearthside.game.cancel(p.id, a.id);
      });
      await page.evaluate(() => window.hearthside.debug.step(3));

      // Two different actions at the same time.
      const pair = await twoActions(page, camPpm);
      note(`${vp.id}: two people show two different action pills at once`, pair.ok,
        pair.ok ? `${pair.a.name}:${pair.a.action} + ${pair.b.name}:${pair.b.action} (${pair.ticks} ticks)` : pair.reason);
      await settleAllPills(page);
      pills = await pillState(page);
      note(`${vp.id}: both pills are visible with different labels`, pills.count >= 2 && new Set(pills.pills.map((p) => p.label)).size >= 2,
        JSON.stringify(pills.pills));
      const pairShot = await capture(page, `two-actions-${vp.id}.png`, { count: 2, minFill: 4 });
      note(`${vp.id}: the pair screenshot shows both pill fills`, !pairShot.failed, `fills=${pairShot.checks?.map((c) => c.fill).join(',') ?? ''}`);

      // The setting in the options screen.
      const setting = await openSettings(page, vp.mobile);
      note(`${vp.id}: Settings offers the three action-progress scopes`, setting.exists && setting.selected === 'household' &&
        ['household', 'all', 'off'].every((id) => setting.labels.some((l) => l.id === id)),
        JSON.stringify(setting));
      await page.screenshot({ path: join(OUT, `settings-${vp.id}.png`) });
      if (vp.id === 'desktop') {
        const seg = page.locator('.settings-modal .segmented[aria-label="Action progress"] .seg[data-id="off"]');
        await seg.click();
        await page.waitForTimeout(400);
        const off = await page.evaluate(() => ({
          setting: window.hearthside.game.settings().actionProgress,
          visible: [...document.querySelectorAll('#world-overlay .wo-pill')].filter((e) => !e.hidden).length,
        }));
        note('desktop: choosing Off writes the setting and hides the pills', off.setting === 'off' && off.visible === 0, JSON.stringify(off));
        await page.locator('.settings-modal .segmented[aria-label="Action progress"] .seg[data-id="household"]').click();
        await page.waitForTimeout(300);
        const back = await page.evaluate(() => window.hearthside.game.settings().actionProgress);
        note('desktop: choosing Household restores the setting', back === 'household', String(back));
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      note(`${vp.id}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' / '));
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGTERM');
    // A `--only=<viewport>` rerun keeps the entries of the viewports it did not run.
    const ran = new Set(VIEWPORTS.map((v) => v.id));
    let kept = [];
    try {
      kept = JSON.parse(readFileSync(join(OUT, 'shots.json'), 'utf8'))
        .filter((l) => !ran.has(String(l.name).split(':')[0]));
    } catch { /* first run */ }
    writeFileSync(join(OUT, 'shots.json'), JSON.stringify([...kept, ...log], null, 2));
  }

  const failed = log.filter((l) => !l.ok);
  console.log(`[m115-b] ${log.length - failed.length}/${log.length} checks passed; screenshots in dev/ds-tasks/m115/shots/B/`);
  if (failed.length) process.exitCode = 1;
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
// Explicit exit: a hung Chromium close must not keep the shared browser lock after the checks are done.
process.exit(process.exitCode ?? 0);
