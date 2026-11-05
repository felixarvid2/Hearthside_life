// Task H (Milestone 11.5) visual check: props in the hands. Taking ingredients out of the open fridge, eating a
// snack mid-way, carrying a plate, seated eating at 20% and 80% (the portion shrinks), reading a book and a phone
// call, in portrait 390x844, landscape 844x390 and desktop 1280x720. Screenshots go to dev/ds-tasks/m115/shots/H/.
//
//   node dev/ds-tasks/m115/shoot-h.mjs
//
// The script takes /tmp/hearthside-browser.lock itself, so do not wrap it in flock. It builds its own copy of the
// game and starts a guided household with autonomy off. The game clock is paused (speed 0); the simulation only
// advances through debug.step, so each shot is staged deterministically (perform progress is set directly).

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const PORT = 5197;
const DIST = join(root, 'tests/e2e/out/dist-m115h');
const OUT = join(here, 'shots/H');

// One Chromium at a time across visual scripts. Re-exec under flock once; HEARTHSIDE_M115H_LOCKED marks the child.
// `--no-lock` skips the lock only to recover from a stale lock held by an orphaned run (never use it while another
// browser script is actually running).
if (!process.env.HEARTHSIDE_M115H_LOCKED && !process.argv.includes('--no-lock')) {
  const locked = spawnSync('flock', ['/tmp/hearthside-browser.lock', process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_M115H_LOCKED: '1' },
  });
  process.exit(locked.status ?? 1);
}
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const note = (name, ok, evidence = '') => { log.push({ name, ok, evidence }); console.log(`[m115-h] ${ok ? 'ok  ' : 'FAIL'} ${name}${evidence ? ` — ${evidence}` : ''}`); };

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

const frames = (page, n, dt = 1 / 30) => page.evaluate(([n2, dt2]) => { for (let i = 0; i < n2; i++) window.hearthside.debug.frame(dt2); }, [n, dt]);

/**
 * Glides the camera close over a point and picks the 90-degree yaw step nearest `view` relative to the person's
 * facing, then lets the glide settle.
 * - 'behind' (default): from behind their right shoulder, past the body — shows a carried plate held in front and
 *   whatever the person faces (fridge, table).
 * - 'front': from the side the person faces — shows a prop held in the hands (snack, fork, book, phone) and the
 *   table in front of a seated eater, instead of hiding it behind the torso and chair back.
 */
async function focus(page, x, z, facing = null, ahead = 0, view = 'behind') {
  await page.evaluate(([x2, z2, f, ahead2, mode]) => {
    const view2 = window.hearthside.view;
    const rig = view2.rig;
    const tx = typeof f === 'number' ? x2 + Math.sin(f) * ahead2 : x2;
    const tz = typeof f === 'number' ? z2 + Math.cos(f) * ahead2 : z2;
    if (!rig) { view2.focusOn(tx, tz, true); return; }
    if (typeof f === 'number') {
      const want = f + (mode === 'front' ? 0 : Math.PI * 3 / 4); // in front of the person, or behind their shoulder
      let best = 0, bestD = 9;
      for (let k = 0; k < 4; k++) {
        const yaw = (45 + k * 90) * Math.PI / 180;
        const d = Math.abs(Math.atan2(Math.sin(yaw - want), Math.cos(yaw - want)));
        if (d < bestD) { bestD = d; best = k; }
      }
      rig.setYawStep(best);
    }
    // The tall portrait viewport needs a gentler zoom than the wide ones to keep the whole figure in frame.
    rig.glideTo(tx, tz, window.innerWidth < 500 ? 95 : 140, 0.55, 1.0);
  }, [x, z, facing, ahead, view]);
  await page.waitForTimeout(1200);
  await frames(page, 6);
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
  await page.evaluate(() => {
    document.querySelectorAll('.toast, .toasts > *').forEach((t) => t.remove());
    const g = window.hearthside.game;
    g.setMode('live');
    g.setSimSettings({ autonomy: false, visitors: false });
    window.hearthside.debug.step(20);
  });
  await frames(page, 6);
}

/** Names of the hand-prop groups currently in the scene. */
async function propNames(page) {
  return page.evaluate(() => {
    const out = [];
    window.hearthside.view.scene.traverse((o) => { if (/^hand-prop-/.test(o.name)) out.push(o.name); });
    return [...new Set(out)].sort();
  });
}

/** Height scale of every food mound on a hand/placed plate (smaller = less food). */
async function plateDomes(page) {
  return page.evaluate(() => {
    const out = [];
    window.hearthside.view.scene.traverse((o) => {
      if (o.name !== 'hand-prop-plate') return;
      const food = o.children[1];
      if (food) out.push(Number(food.scale.y.toFixed(3)));
    });
    return out;
  });
}

/** Clears every queued action for the household and settles the people. */
async function clearQueue(page) {
  await page.evaluate(() => {
    const h = window.hearthside, st = h.debug.state();
    for (const p of Object.values(st.people)) for (const a of [...p.queue]) h.game.cancel(p.id, a.id);
    h.debug.step(3);
    for (const p of Object.values(st.people)) for (const a of [...p.queue]) h.game.cancel(p.id, a.id);
    h.debug.step(2);
  });
  await frames(page, 4);
}

/** Stage 0 of a cook meal: the cook reaches into the open fridge. Sets the reach to ~75% and returns the pose. */
async function stageFridgeReach(page) {
  const r = await page.evaluate(() => {
    const h = window.hearthside, g = h.game, st = h.debug.state();
    const hh = st.households[st.activeHouseholdId];
    const lot = st.lots[st.activeLotId];
    const fridge = Object.values(lot.objects).find((o) => /fridge/.test(o.defId));
    if (!fridge) return { ok: false, reason: 'no fridge' };
    const onLot = (id) => st.people[id]?.location.kind === 'lot';
    const members = hh.memberIds.filter(onLot);
    for (const id of members) for (const a of [...st.people[id].queue]) g.cancel(id, a.id);
    h.debug.step(2);
    let id = null, opt = null;
    for (const m of members) {
      const o = g.options(m, { kind: 'object', objectId: fridge.id }).find((x) => x.enabled && x.interactionId === 'cookMeal');
      if (o) { id = m; opt = o; break; }
    }
    if (!id || !opt) return { ok: false, reason: 'no cook option' };
    const q = g.queue(id, opt);
    if (!q.ok) return { ok: false, reason: q.reason };
    for (let i = 0; i < 400; i++) {
      h.debug.step(1);
      const a = st.people[id].queue[0];
      if (!a) return { ok: false, reason: 'cook ended before the fridge stage' };
      if (a.phase === 'perform' && a.data.stage === 0) {
        a.elapsed = Math.min(a.duration ?? 2, 1.5); // 75% of the 2-minute reach
        const p = st.people[id];
        return {
          ok: true, id, name: p.firstName, anim: p.anim.id, elapsed: a.elapsed, duration: a.duration,
          x: p.location.kind === 'lot' ? p.location.x : 0, z: p.location.kind === 'lot' ? p.location.z : 0,
          facing: p.location.kind === 'lot' ? p.location.facing : 0,
        };
      }
    }
    return { ok: false, reason: 'never reached the fridge stage' };
  });
  if (r.ok) await focus(page, r.x, r.z, r.facing, 0, 'front');
  await frames(page, 4);
  return r;
}

/** A snack taken from the fridge, half eaten. */
async function stageSnack(page) {
  const r = await page.evaluate(() => {
    const h = window.hearthside, g = h.game, st = h.debug.state();
    const hh = st.households[st.activeHouseholdId];
    const lot = st.lots[st.activeLotId];
    const fridge = Object.values(lot.objects).find((o) => /fridge/.test(o.defId));
    if (!fridge) return { ok: false, reason: 'no fridge' };
    const onLot = (id) => st.people[id]?.location.kind === 'lot';
    const members = hh.memberIds.filter(onLot);
    for (const id of members) for (const a of [...st.people[id].queue]) g.cancel(id, a.id);
    h.debug.step(2);
    for (const m of members) {
      const opt = g.options(m, { kind: 'object', objectId: fridge.id }).find((x) => x.enabled && x.interactionId === 'grabSnack');
      if (!opt) continue;
      const q = g.queue(m, opt);
      if (!q.ok) return { ok: false, reason: q.reason };
      for (let i = 0; i < 300; i++) {
        h.debug.step(1);
        const a = st.people[m].queue[0];
        if (!a) return { ok: false, reason: 'snack ended before eating' };
        if (a.phase === 'perform') {
          a.elapsed = Math.min(a.duration ?? 5, 2.5); // half of the five-minute snack
          const p = st.people[m];
          return {
            ok: true, id: m, name: p.firstName, anim: p.anim.id, elapsed: a.elapsed, duration: a.duration,
            x: p.location.kind === 'lot' ? p.location.x : 0, z: p.location.kind === 'lot' ? p.location.z : 0,
            facing: p.location.kind === 'lot' ? p.location.facing : 0,
          };
        }
      }
    }
    return { ok: false, reason: 'no snack option' };
  });
  if (r.ok) await focus(page, r.x, r.z, r.facing, 0, 'front');
  await frames(page, 4);
  return r;
}

/**
 * Cooks a meal with the clock paused between ticks and catches the eatMeal action: first the route to the seat
 * (plate in hand), then the seated perform (plate put down, fork in hand).
 */
async function stageCarryPlate(page) {
  const route = await page.evaluate(() => {
    const h = window.hearthside, g = h.game, st = h.debug.state();
    const hh = st.households[st.activeHouseholdId];
    const lot = st.lots[st.activeLotId];
    const fridge = Object.values(lot.objects).find((o) => /fridge/.test(o.defId));
    if (!fridge) return { ok: false, reason: 'no fridge' };
    const onLot = (id) => st.people[id]?.location.kind === 'lot';
    const members = hh.memberIds.filter(onLot);
    for (const id of members) for (const a of [...st.people[id].queue]) g.cancel(id, a.id);
    h.debug.step(2);
    let id = null, opt = null;
    for (const m of members) {
      const o = g.options(m, { kind: 'object', objectId: fridge.id }).find((x) => x.enabled && x.interactionId === 'cookMeal');
      if (o) { id = m; opt = o; break; }
    }
    if (!id || !opt) return { ok: false, reason: 'no cook option' };
    const q = g.queue(id, opt);
    if (!q.ok) return { ok: false, reason: q.reason };
    for (let i = 0; i < 4000; i++) {
      h.debug.step(1);
      const a = st.people[id].queue[0];
      if (!a) return { ok: false, reason: 'the cook chain ended before a meal was served' };
      if (a.interactionId === 'eatMeal' && a.phase === 'route') {
        // One more tick when the route is long enough, so the walk animation has taken over from the pickup.
        if (Array.isArray(a.route) && a.route.length > 1) h.debug.step(1);
        const p = st.people[id];
        return {
          ok: true, id, name: p.firstName, anim: p.anim.id, posture: p.location.posture,
          x: p.location.kind === 'lot' ? p.location.x : 0, z: p.location.kind === 'lot' ? p.location.z : 0,
          facing: p.location.kind === 'lot' ? p.location.facing : 0,
          food: a.data.recipeId ?? null, ticks: i,
        };
      }
    }
    return { ok: false, reason: 'never started eating after cooking' };
  });
  // From the front: the plate is carried in front of the belly, so a camera behind the shoulder hides it behind the
  // torso (and can end up inside the kitchen units). The person walks toward the camera with the plate in view.
  if (route.ok) await focus(page, route.x, route.z, route.facing, 0, 'front');
  await frames(page, 4);
  return route;
}

/** Steps the eatMeal action to the seated perform phase (returns the pose). */
async function stageSeatedEating(page, id) {
  const r = await page.evaluate((personId) => {
    const h = window.hearthside, st = h.debug.state();
    for (let i = 0; i < 600; i++) {
      h.debug.step(1);
      const a = st.people[personId]?.queue[0];
      if (!a) return { ok: false, reason: 'the meal ended while walking to the seat' };
      if (a.interactionId === 'eatMeal' && a.phase === 'perform' && a.data.stage === 1) {
        const p = st.people[personId];
        return {
          ok: true, id: personId, name: p.firstName, anim: p.anim.id, posture: p.location.posture,
          x: p.location.kind === 'lot' ? p.location.x : 0, z: p.location.kind === 'lot' ? p.location.z : 0,
          facing: p.location.kind === 'lot' ? p.location.facing : 0,
          duration: a.duration, recipeId: a.data.recipeId ?? null, itemTaken: a.data.itemTaken === true,
        };
      }
    }
    return { ok: false, reason: 'never sat down to eat' };
  }, id);
  if (r.ok) await focus(page, r.x, r.z, r.facing, 0.18, 'front');
  await frames(page, 4);
  return r;
}

/** Sets the eating progress and returns the plate's food scale. */
async function setEatProgress(page, id, elapsed) {
  const r = await page.evaluate(([personId, e]) => {
    const st = window.hearthside.debug.state();
    const a = st.people[personId]?.queue[0];
    if (!a) return null;
    a.elapsed = Math.min(a.duration ?? e, e);
    return { elapsed: a.elapsed, duration: a.duration, posture: st.people[personId].location.posture, anim: st.people[personId].anim.id };
  }, [id, elapsed]);
  await frames(page, 4);
  return r;
}

/** Reads a book: queue it on the nearest bookcase, advance to the perform phase. */
async function stageReading(page) {
  const r = await page.evaluate(() => {
    const h = window.hearthside, g = h.game, st = h.debug.state();
    const hh = st.households[st.activeHouseholdId];
    const lot = st.lots[st.activeLotId];
    const onLot = (id) => st.people[id]?.location.kind === 'lot';
    const members = hh.memberIds.filter(onLot);
    for (const id of members) for (const a of [...st.people[id].queue]) g.cancel(id, a.id);
    h.debug.step(2);
    for (const m of members) {
      for (const o of Object.values(lot.objects)) {
        const opt = g.options(m, { kind: 'object', objectId: o.id })
          .find((x) => x.enabled && (x.interactionId === 'readBook' || x.interactionId === 'readSkillBook'));
        if (!opt) continue;
        const q = g.queue(m, opt);
        if (!q.ok) continue;
        for (let i = 0; i < 600; i++) {
          h.debug.step(1);
          const a = st.people[m].queue[0];
          if (!a) break;
          if (a.phase === 'perform') {
            a.elapsed = Math.min(a.duration ?? 45, 20);
            const p = st.people[m];
            return {
              ok: true, id: m, name: p.firstName, anim: p.anim.id, interactionId: a.interactionId,
              x: p.location.kind === 'lot' ? p.location.x : 0, z: p.location.kind === 'lot' ? p.location.z : 0,
              facing: p.location.kind === 'lot' ? p.location.facing : 0,
            };
          }
        }
        for (const a of [...st.people[m].queue]) g.cancel(m, a.id);
        h.debug.step(2);
      }
    }
    return { ok: false, reason: 'no reading option' };
  });
  if (r.ok) await focus(page, r.x, r.z, r.facing, 0, 'front');
  await frames(page, 4);
  return r;
}

/** Calls somebody on the phone: queues a phoneChat option, making a neighbour familiar first if need be. */
async function stagePhone(page) {
  const r = await page.evaluate(() => {
    const h = window.hearthside, g = h.game, st = h.debug.state();
    const hh = st.households[st.activeHouseholdId];
    const onLot = (id) => st.people[id]?.location.kind === 'lot';
    const members = hh.memberIds.filter(onLot);
    for (const id of members) for (const a of [...st.people[id].queue]) g.cancel(id, a.id);
    h.debug.step(2);

    const caller = members.find((m) => st.people[m].lifeStage === 'adult') ?? members[0];
    if (!caller) return { ok: false, reason: 'nobody home' };
    const chatOptions = () => g.options(caller, { kind: 'self' }).filter((x) => x.enabled && x.interactionId === 'phoneChat');
    let opts = chatOptions();
    const others = Object.values(st.people).filter((p) => p.id !== caller);
    const atWork = (p) => p.location.kind === 'offlot' && p.location.place === 'work';
    const here = (p) => p.location.kind === 'lot' && p.location.lotId === st.activeLotId;
    let other = others.find((p) => !atWork(p) && !here(p)) ?? others.find((p) => !here(p)) ?? null;
    if (opts.length === 0 && other) {
      // Make the callee callable for the shot: an off-lot acquaintance (neighbours may be at work at this hour).
      if (atWork(other)) other.location = { kind: 'offlot', place: 'home' };
      st.relationships[`${caller}>${other.id}`] = {
        from: caller, to: other.id, familiarity: 25, friendship: 10, trust: 0, romance: 0, lastInteractionAt: null, recent: {},
      };
      opts = chatOptions();
    }
    const opt = opts[0] ?? (other ? {
      interactionId: 'phoneChat', label: `Call ${other.firstName}`, icon: 'phone', group: 'self', enabled: true,
      token: { interactionId: 'phoneChat', target: { kind: 'self' }, data: { personId: other.id } },
    } : null);
    if (!opt) return { ok: false, reason: `no phone contact (people=${others.length})` };
    const q = g.queue(caller, opt);
    if (!q.ok) return { ok: false, reason: q.reason };
    for (let i = 0; i < 400; i++) {
      h.debug.step(1);
      const a = st.people[caller].queue[0];
      if (!a) return { ok: false, reason: 'the call ended too quickly' };
      if (a.phase === 'perform') {
        a.elapsed = Math.min(a.duration ?? 20, 6);
        const p = st.people[caller];
        return {
          ok: true, id: caller, name: p.firstName, anim: p.anim.id, interactionId: a.interactionId,
          x: p.location.kind === 'lot' ? p.location.x : 0, z: p.location.kind === 'lot' ? p.location.z : 0,
          facing: p.location.kind === 'lot' ? p.location.facing : 0,
        };
      }
    }
    return { ok: false, reason: 'never started the call' };
  });
  if (r.ok) await focus(page, r.x, r.z, r.facing, 0, 'front');
  await frames(page, 4);
  return r;
}

async function main() {
  console.log('[m115-h] building', DIST);
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

      // 1. Reaching into the open fridge, ingredients in hand.
      const reach = await stageFridgeReach(page);
      let props = await propNames(page);
      note(`${vp.id}: ingredients appear in the hand during the fridge reach`, reach.ok && props.includes('hand-prop-ingredients'),
        reach.ok ? `${reach.name} ${reach.anim} at ${reach.elapsed}/${reach.duration} — ${props.join(', ')}` : reach.reason);
      await page.screenshot({ path: join(OUT, `fridge-reach-${vp.id}.png`) });
      await clearQueue(page);

      // 2. A snack, half eaten.
      const snack = await stageSnack(page);
      props = await propNames(page);
      const snackProp = props.find((n) => /hand-prop-(sandwich|apple|yoghurt)/.test(n)) ?? '';
      note(`${vp.id}: a snack is in the hand half-way through eating`, snack.ok && snackProp !== '',
        snack.ok ? `${snack.name} ${snack.anim} at ${snack.elapsed}/${snack.duration} — ${props.join(', ')}` : snack.reason);
      await page.screenshot({ path: join(OUT, `snack-eat-${vp.id}.png`) });
      await clearQueue(page);

      // 3. Cooking to a meal, then carrying the plate to the seat.
      const carry = await stageCarryPlate(page);
      props = await propNames(page);
      note(`${vp.id}: a full plate is carried to the seat`, carry.ok && props.includes('hand-prop-plate'),
        carry.ok ? `${carry.name} ${carry.anim} (${carry.posture}) food=${carry.food} — ${props.join(', ')}` : carry.reason);
      await page.screenshot({ path: join(OUT, `carry-plate-${vp.id}.png`) });

      // 4. Seated at the table at 20% and 80%: the plate is put down, the fork is in the hand, the food shrinks.
      const seated = carry.ok ? await stageSeatedEating(page, carry.id) : { ok: false, reason: 'no carry' };
      note(`${vp.id}: eating happens seated at a table`, seated.ok && seated.posture === 'seated' && seated.anim === 'eat',
        seated.ok ? `${seated.name} ${seated.anim} (${seated.posture}) ${seated.duration} min` : seated.reason);

      let dome20 = [];
      let dome80 = [];
      if (seated.ok) {
        const at20 = await setEatProgress(page, carry.id, 5);
        await focus(page, seated.x, seated.z, seated.facing, 0.18, 'front');
        props = await propNames(page);
        dome20 = await plateDomes(page);
        note(`${vp.id}: at 20% the plate is on the table and the fork is in the hand`,
          props.includes('hand-prop-plate') && props.includes('hand-prop-fork'),
          `${JSON.stringify(at20)} — ${props.join(', ')}; food=${JSON.stringify(dome20)}`);
        await page.screenshot({ path: join(OUT, `eat-20-${vp.id}.png`) });

        const at80 = await setEatProgress(page, carry.id, 20);
        await frames(page, 4);
        props = await propNames(page);
        dome80 = await plateDomes(page);
        note(`${vp.id}: at 80% the portion is visibly smaller and the fork is still in hand`,
          dome20.length > 0 && dome80.length > 0 && Math.min(...dome80) < Math.min(...dome20) * 0.5 && props.includes('hand-prop-fork'),
          `${JSON.stringify(at80)}; food ${JSON.stringify(dome20)} -> ${JSON.stringify(dome80)} — ${props.join(', ')}`);
        await page.screenshot({ path: join(OUT, `eat-80-${vp.id}.png`) });
      } else {
        await page.screenshot({ path: join(OUT, `eat-20-${vp.id}.png`) });
        await page.screenshot({ path: join(OUT, `eat-80-${vp.id}.png`) });
      }
      await clearQueue(page);

      // 5. Reading a book.
      const read = await stageReading(page);
      props = await propNames(page);
      note(`${vp.id}: an open book is held while reading`, read.ok && props.includes('hand-prop-book'),
        read.ok ? `${read.name} ${read.anim} ${read.interactionId} — ${props.join(', ')}` : read.reason);
      await page.screenshot({ path: join(OUT, `reading-${vp.id}.png`) });
      await clearQueue(page);

      // 6. On the phone.
      const call = await stagePhone(page);
      props = await propNames(page);
      note(`${vp.id}: a lit phone is held during a call`, call.ok && props.includes('hand-prop-phone'),
        call.ok ? `${call.name} ${call.anim} ${call.interactionId} — ${props.join(', ')}` : call.reason);
      await page.screenshot({ path: join(OUT, `phone-${vp.id}.png`) });

      note(`${vp.id}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' / '));
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGTERM');
    writeFileSync(join(OUT, 'shots.json'), JSON.stringify(log, null, 2));
  }

  const failed = log.filter((l) => !l.ok);
  console.log(`[m115-h] ${log.length - failed.length}/${log.length} checks passed; screenshots in dev/ds-tasks/m115/shots/H/`);
  if (failed.length) process.exitCode = 1;
}

await main();
