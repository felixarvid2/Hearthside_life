// Milestone 10 furniture pipeline: in-game screenshots of the exemplar designs with moving parts and a screen.
//   node dev/ds-tasks/m10f/shoot-exemplars.mjs [--only=fridge,chest,laptop,oven,...] [--no-build] [--defs=fridge-retro-tall,chest-of-drawers,laptop-thin]
// Builds the game into tests/e2e/out/m10f-dist, serves it, starts the guided household, swaps objects of the starter house
// for the new designs (same footprints), runs the real interaction on each and writes PNGs plus a JSON log to
// tests/e2e/out/m10f-shots/ (git-ignored). Keys (all by default): fridge chest laptop oven microwave dishwasher sink toilet
// shower bath washer washertop wardrobe tv. Each has a closed shot, an in-use shot and a partState / effect check.
// Which defId goes where is the SWAPS table below. Decorative designs with no interaction of their own (microwave, washers,
// the dishwasher, which the sim only uses as a washDishes station) are driven by FORCING a use: a running action is re-pointed
// at the object and the game clock is advanced by hand (see forceUse); the renderer cannot tell the difference.
// It is also the recipe for looking at any animated design: swap its defId into an object of the starter house, queue its
// interaction, step to the perform phase, aim the camera, screenshot. NOTE the open/close tween runs on the GAME clock
// (0.4 min = 2 ticks), which only moves when the sim steps: after the view has seen a use start, step tick by tick
// (stepUntil) instead of waiting in real time. Only one browser runs at a time on this machine: the script re-runs itself
// under the shared browser lock (do not wrap it in flock yourself).

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
const ONLY = new Set(opt('only', 'fridge,chest,laptop,oven,microwave,dishwasher,sink,toilet,shower,bath,washer,washertop,wardrobe,tv').split(','));
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

/** Camera aimed at a point of an object (local rot-0 metres) from a yaw in degrees relative to the object's front (0 = straight at the front). */
async function aim(page, objectId, { local, yawDeg, ppm }) {
  await page.evaluate(({ objectId, local, yawDeg, ppm }) => {
    const h = window.hearthside;
    const root = h.view.objects.rootOf(objectId);
    const v = root.position.clone().set(local[0], local[1], local[2]);
    root.localToWorld(v);
    h.view.pendingReveal = null;
    const r = h.view.rig;
    r.setYawStep(0);
    r.yaw = root.rotation.y + (yawDeg * Math.PI) / 180;
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

/**
 * Puts the first household member on the interaction and steps until its perform phase (or `phase` / `stage`).
 * The person is sent to the object by the real sim: this is the real interaction, walking included.
 */
async function startInteraction(page, objectId, interactionId, { phase = 'perform', stage = null, maxTicks = 900 } = {}) {
  return page.evaluate(([id, wanted, phase, stage, maxTicks]) => {
    const h = window.hearthside, g = h.game, st = g.state();
    const hh = st.households[st.activeHouseholdId];
    const pid = hh.memberIds[0];
    for (const a of [...st.people[pid].queue]) g.cancel(pid, a.id);
    st.people[pid].needs.hygiene = Math.min(st.people[pid].needs.hygiene, 30); // washHands earlier in the run would leave takeShower/takeBath disabled (hygiene full)
    h.debug.step(1);
    g.setMode('live');
    const opts = g.options(pid, { kind: 'object', objectId: id });
    const opt = opts.find((o) => o.interactionId === wanted && o.enabled);
    if (!opt) return { ok: false, reason: `no enabled ${wanted} (${opts.map((o) => `${o.interactionId}:${o.enabled}${o.enabled ? "" : ":" + (o.reason ?? o.disabledReason ?? "")}`).join(', ')})` };
    const q = g.queue(pid, opt);
    if (!q.ok) return { ok: false, reason: q.reason };
    for (let i = 0; i < maxTicks; i++) {
      h.debug.step(1);
      const head = st.people[pid].queue[0];
      if (head?.interactionId === wanted && head.phase === phase && (stage === null || head.data?.stage === stage)) return { ok: true, elapsed: head.elapsed, duration: head.duration, anim: st.people[pid].anim.id };
      if (!head || head.interactionId !== wanted) return { ok: false, reason: `action ended early (anim ${st.people[pid].anim.id})` };
    }
    return { ok: false, reason: `never reached ${phase}${stage === null ? '' : ` stage ${stage}`}` };
  }, [objectId, interactionId, phase, stage, maxTicks]);
}

/**
 * Decorative designs have no interaction of their own, so the sim never uses them. Starts a real action on `baseId`
 * (any object the person can use), then re-points that running action at `objectId` and gives it the wanted interaction id,
 * stage, phase and elapsed time. The renderer reads only that (objectUses), so the part animates as it would in play. Nothing
 * steps the sim while forced: tick advances the game clock and the action's elapsed time by hand.
 */
async function forceUse(page, baseId, objectId, interactionId, { stage = null, duration = 10, phase = 'perform' } = {}) {
  const r = await startInteraction(page, baseId, 'changeOutfit');
  if (!r.ok) return r;
  await page.evaluate(([objectId, interactionId, stage, duration, phase]) => {
    const st = window.hearthside.debug.state();
    const pid = st.households[st.activeHouseholdId].memberIds[0];
    const a = st.people[pid].queue[0];
    window.__forced = { a, orig: { target: a.target, interactionId: a.interactionId, data: a.data, elapsed: a.elapsed, duration: a.duration, phase: a.phase } };
    a.target = { kind: 'object', objectId };
    a.interactionId = interactionId;
    a.data = { ...a.data, stage };
    a.elapsed = 0.25;
    a.duration = duration;
    a.phase = phase;
  }, [objectId, interactionId, stage, duration, phase]);
  return { ok: true, elapsed: 0.25 };
}

async function unforce(page) {
  await page.evaluate(() => {
    const f = window.__forced;
    if (!f) return;
    Object.assign(f.a, f.orig);
    window.__forced = null;
  });
}

/** One tick: the sim steps for a real action; for a forced one the clock and the action's elapsed time move by hand. */
async function tick(page) {
  await page.evaluate(() => {
    const h = window.hearthside;
    if (window.__forced) { h.debug.state().clock.minutes += 0.25; window.__forced.a.elapsed += 0.25; h.debug.frame(1 / 30); } else h.debug.step(1);
  });
}

async function clearActions(page) {
  await unforce(page);
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

/** Running effects (hob rings and pot, steam, shower streaks, bath water, tap stream): visible children of anim-effects. */
async function effectState(page, objectId) {
  return page.evaluate((id) => {
    const g = window.hearthside.view.objects.rootOf(id);
    const fx = g.getObjectByName('anim-effects');
    if (!fx) return { group: false, visible: 0, total: 0 };
    const kids = fx.children;
    return { group: fx.visible, visible: kids.filter((k) => k.visible).length, total: kids.length, rings: kids.filter((k) => k.visible && k.geometry?.type === 'TorusGeometry').length };
  }, objectId);
}

const part = (parts, name) => parts.find((p) => p.name === `part:anim:${name}`);
const turnOf = (parts, name) => part(parts, name)?.turn ?? -1;

/** Ticks one at a time (the open/close tween runs on the game clock) until `pred({parts, fx})` holds, or `max` ticks. */
async function stepUntil(page, objectId, pred, max = 14) {
  let parts = [], fx = null;
  for (let i = 0; i <= max; i++) {
    await settle(page, 120);
    parts = await partState(page, objectId);
    fx = await effectState(page, objectId);
    if (pred({ parts, fx })) return { ok: true, ticks: i, parts, fx };
    await tick(page);
  }
  return { ok: false, ticks: max, parts, fx };
}
const brief = (r) => `${r.ticks} ticks; parts ${JSON.stringify(r.parts.map((p) => [p.name.slice(10), p.visible ? 1 : 0, p.turn, p.pos[2]]))}; fx ${JSON.stringify(r.fx)}`;

/** True when the hinged `name` has turned at least 85% of its descriptor angle. */
const turned = (parts, name, angle) => turnOf(parts, name) >= 0.85 * Math.abs(angle);

// Which design is swapped into which starter object (all 1x1 footprints), and where to look.
const SWAPS = {
  oven: { from: 'stove-basic', def: 'range-steel-gas' },
  dishwasher: { from: 'obj_y', def: 'dishwasher-steel-pro' },
  sink: { from: 'counter-sink', def: 'sink-single-bowl' },
  toilet: { from: 'toilet-basic', def: 'toilet-round-blue' },
  shower: { from: 'shower-stall', def: 'shower-walk-in' },
  wardrobe: { from: 'obj_1q', def: 'wardrobe-panelled-oak' },
  tv: { from: 'tv-flatscreen', def: 'tv-curved-wide' },
  washer: { from: 'obj_19', def: 'washer-front-steel', rot: 2 },
  washertop: { from: 'obj_1u', def: 'washer-top-load', rot: 2 },
};

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

    // Swap starter objects (same 1x1 footprints) for the designs under test; add a microwave on a counter and a bath.
    const [fridgeDef, chestDef, laptopDef] = DEFS;
    const setup = await page.evaluate(([fridgeDef, chestDef, laptopDef, SWAPS]) => {
      const st = window.hearthside.debug.state();
      st.settings.autonomy = false;
      const lot = st.lots[st.activeLotId];
      const objs = Object.values(lot.objects);
      const find = (defId) => objs.find((o) => o.defId === defId);
      const fridge = find('fridge-standard'), wardrobe = find('wardrobe-tall'), computer = find('computer-desktop');
      if (!fridge || !wardrobe || !computer) throw new Error('starter house lacks the fridge, wardrobe or computer');
      fridge.defId = fridgeDef; wardrobe.defId = chestDef; computer.defId = laptopDef;
      const ids = { fridge: fridge.id, chest: wardrobe.id, laptop: computer.id };
      for (const [key, sw] of Object.entries(SWAPS)) {
        const o = lot.objects[sw.from] ?? find(sw.from);
        if (!o) throw new Error(`starter house lacks ${sw.from}`);
        o.defId = sw.def;
        if (sw.rot !== undefined) o.rot = sw.rot;
        ids[key] = o.id;
      }
      const add = (id, defId, x, z, rot, extra = {}) => { lot.objects[id] = { id, defId, level: 0, x, z, rot, finishes: {}, purchasePrice: 0, boughtAt: -960, ownerHouseholdId: fridge.ownerHouseholdId, condition: { dirt: 0, broken: false }, ...extra }; return id; };
      ids.microwave = add('obj_m10_mw', 'microwave-steel', 18, 10, 0, { supportId: 'obj_13' });
      ids.bath = add('obj_m10_bath', 'bath-budget-acrylic', 12, 16, 0);
      const others = st.households[st.activeHouseholdId].memberIds.slice(1);
      for (const id of others) st.people[id].location = { kind: 'lot', lotId: st.activeLotId, x: 8.5, z: 18, level: 0, facing: 0, posture: 'standing' };
      return ids;
    }, [fridgeDef, chestDef, laptopDef, SWAPS]);
    await page.evaluate(() => window.hearthside.view.lotChanged('objects'));
    await page.evaluate(() => window.hearthside.game.view.setCutaway('down'));
    await page.waitForTimeout(3500); // the new GLBs load on demand
    await page.evaluate(() => window.hearthside.debug.step(1));
    await page.evaluate(() => { const st = window.hearthside.debug.state(); window.hearthside.view.setWorld(st, true); });
    await page.waitForTimeout(1500);
    for (const [key, id] of Object.entries(setup)) {
      if (!ONLY.has(key)) continue;
      const found = await page.evaluate((i) => !!window.hearthside.view.objects.rootOf(i), id);
      check(`${key} object is in the scene`, found, id);
    }

    // Fridge: cookMeal's fridge stage opens the door.
    if (ONLY.has('fridge')) {
      const A = { local: [0.5, 0.9, 0.6], ppm: 170 };
      await aim(page, setup.fridge, { ...A, yawDeg: 25 });
      await shot(page, 'fridge-closed');
      const closed = await partState(page, setup.fridge);
      check('closed fridge: door at rest, interior hidden', closed.some((p) => p.name === 'part:anim:door' && p.turn < 0.01) && closed.some((p) => p.name === 'part:anim:interior' && !p.visible), JSON.stringify(closed));
      const q = await startInteraction(page, setup.fridge, 'cookMeal');
      check('cookMeal reaches the fridge stage', q.ok, q.reason ?? `elapsed ${q.elapsed}`);
      if (q.ok) {
        const r = await stepUntil(page, setup.fridge, ({ parts }) => turned(parts, 'door', 1.75) && part(parts, 'interior')?.visible === true);
        check('open fridge: door settled open (>= 85% of its angle), interior visible', r.ok, brief(r));
        await aim(page, setup.fridge, { ...A, yawDeg: 38 });
        await shot(page, 'fridge-open');
        await aim(page, setup.fridge, { ...A, yawDeg: -35 });
        await shot(page, 'fridge-open-b');
      }
      await clearActions(page);
    }

    // Chest of drawers: openWhileUsed on changeOutfit (the drawers slide 0.3 m in fitted space = 0.15 m in the model's half scale).
    if (ONLY.has('chest')) {
      const A = { local: [0.5, 0.45, 0.6], yawDeg: 60, ppm: 190 }; // the person stands in front and a bookcase is beside the chest: look from the side
      await aim(page, setup.chest, A);
      const rest = await partState(page, setup.chest);
      await shot(page, 'chest-closed');
      const q = await startInteraction(page, setup.chest, 'changeOutfit');
      check('changeOutfit reaches the chest', q.ok, q.reason ?? `elapsed ${q.elapsed}`);
      if (q.ok) {
        const slid = (parts) => ['drawer1', 'drawer2'].every((n) => part(parts, n) && part(parts, n).pos[2] - part(rest, n).pos[2] >= 0.85 * 0.15);
        const r = await stepUntil(page, setup.chest, ({ parts }) => slid(parts));
        check('chest: both top drawers slid out (>= 85% of 0.3 m)', r.ok, brief(r));
        await shot(page, 'chest-open');
      }
      await clearActions(page);
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

    /** A closed shot with a check, then `drive` puts the object in use, `until` is the in-use condition, then an in-use shot. */
    async function runCase(key, { A, B = A, closedOk, drive, until, what, extra }) {
      if (!ONLY.has(key)) return;
      const id = setup[key];
      await aim(page, id, A);
      await shot(page, `${key}-closed`);
      const c0 = { parts: await partState(page, id), fx: await effectState(page, id) };
      check(`${key}: closed state (${what.closed})`, closedOk(c0), JSON.stringify(c0));
      const q = await drive(id);
      check(`${key}: ${what.drive}`, q.ok, q.reason ?? `elapsed ${q.elapsed}`);
      if (q.ok) {
        await settle(page, 250); // the view must see the use start before the game clock moves on
        const r = await stepUntil(page, id, until);
        check(`${key}: ${what.open}`, r.ok, brief(r));
        await aim(page, id, B);
        await shot(page, `${key}-${what.shot ?? 'in-use'}`);
        if (extra) await extra(id);
      }
      await clearActions(page);
    }
    const cls = (names) => ({ parts }) => names.every((n) => !part(parts, n) || part(parts, n).turn < 0.01);
    const none = ({ fx }) => !fx.group || fx.visible === 0;

    await runCase('oven', {
      A: { local: [0.5, 0.5, 0.6], yawDeg: 30, ppm: 230 }, B: { local: [0.5, 0.5, 0.6], yawDeg: 60, ppm: 230 },
      closedOk: (s) => cls(['oven'])(s) && none(s) && part(s.parts, 'interior')?.visible === false,
      what: { closed: 'oven door shut, no hob glow', drive: 'bakeTreat reaches the oven', open: 'bake: oven door dropped open, interior visible' },
      drive: (id) => startInteraction(page, id, 'bakeTreat'),
      until: ({ parts }) => turned(parts, 'oven', 1.35) && part(parts, 'interior')?.visible === true,
      extra: async (id) => {
        await clearActions(page);
        const q = await startInteraction(page, setup.fridge, 'cookMeal', { stage: 1 });
        check('oven: cookMeal reaches the stove stage', q.ok, q.reason ?? `elapsed ${q.elapsed}`);
        if (q.ok) {
          await settle(page, 250);
          const r = await stepUntil(page, id, ({ fx }) => fx.group && (fx.rings ?? 0) >= 2, 8);
          check('oven: hob rings and pot visible while cooking', r.ok, brief(r));
          await aim(page, id, { local: [0.5, 0.9, 0.5], yawDeg: 35, ppm: 260 });
          await shot(page, 'oven-hob');
        }
      },
    });

    await runCase('microwave', {
      A: { local: [0.5, 0.15, 0.5], yawDeg: 25, ppm: 480 },
      closedOk: cls(['door']),
      what: { closed: 'door shut', drive: 'a use is forced onto the microwave (no interaction of its own)', open: 'door open, interior visible' },
      drive: (id) => forceUse(page, setup.chest, id, 'heatFood'),
      until: ({ parts }) => turned(parts, 'door', 1.9) && part(parts, 'interior')?.visible === true,
    });

    await runCase('dishwasher', {
      A: { local: [0.5, 0.5, 0.6], yawDeg: 30, ppm: 230 },
      closedOk: cls(['door']),
      what: { closed: 'door shut', drive: 'a washDishes station stage is forced onto the dishwasher', open: 'fold-down door open at the start of the run' },
      drive: (id) => forceUse(page, setup.chest, id, 'washDishes', { stage: 1, duration: 20 }),
      until: ({ parts }) => turned(parts, 'door', 1.4) && part(parts, 'interior')?.visible === true,
    });

    await runCase('sink', {
      A: { local: [0.5, 0.9, 0.4], yawDeg: 25, ppm: 300 }, B: { local: [0.5, 0.9, 0.4], yawDeg: 60, ppm: 300 },
      closedOk: none,
      what: { closed: 'no tap stream', drive: 'washHands reaches the sink', open: 'tap stream visible' },
      drive: (id) => startInteraction(page, id, 'washHands'),
      until: ({ fx }) => fx.group && fx.visible >= 1,
    });

    await runCase('toilet', {
      A: { local: [0.5, 0.45, 0.5], yawDeg: 35, ppm: 320 }, B: { local: [0.5, 0.45, 0.5], yawDeg: 75, ppm: 320 },
      closedOk: cls(['lid']),
      what: { closed: 'lid down', drive: 'useToilet reaches the toilet', open: 'lid raised' },
      drive: (id) => startInteraction(page, id, 'useToilet'),
      until: ({ parts }) => turned(parts, 'lid', 1.7),
    });

    await runCase('shower', {
      A: { local: [0.5, 0.9, 0.5], yawDeg: 35, ppm: 170 }, B: { local: [0.5, 0.9, 0.5], yawDeg: 55, ppm: 190 },
      closedOk: (s) => cls(['door'])(s) && none(s),
      what: { closed: 'door shut, no water', drive: 'takeShower reaches its perform phase', open: 'glass door swung open as the person steps in' },
      drive: (id) => startInteraction(page, id, 'takeShower'),
      // in play: the door stands open for the first SHOWER_DOOR_MINUTES of the shower (src/render/objectAnim.ts), then shuts
      until: ({ parts }) => turned(parts, 'door', 1.4),
      extra: async (id) => {
        const r = await stepUntil(page, id, ({ parts, fx }) => cls(['door'])({ parts }) && fx.group && fx.visible >= 5, 14);
        check('shower: door shut again while the water runs', r.ok, brief(r));
        await aim(page, id, { local: [0.5, 0.9, 0.5], yawDeg: 35, ppm: 170 });
        await shot(page, 'shower-water');
      },
    });

    await runCase('bath', {
      A: { local: [1.0, 0.35, 0.5], yawDeg: 30, ppm: 170 },
      closedOk: none,
      what: { closed: 'no water', drive: 'takeBath reaches the tub', open: 'water surface visible (the bath has no hinged parts)' },
      drive: (id) => startInteraction(page, id, 'takeBath'),
      until: ({ fx }) => fx.group && fx.visible >= 1,
    });

    await runCase('washer', {
      A: { local: [0.5, 0.5, 0.6], yawDeg: 30, ppm: 280 },
      closedOk: cls(['door']),
      what: { closed: 'door shut', drive: 'a use is forced onto the washer (no interaction of its own)', open: 'round door open, interior visible' },
      drive: (id) => forceUse(page, setup.chest, id, 'doLaundry'),
      until: ({ parts }) => turned(parts, 'door', 1.9) && part(parts, 'interior')?.visible === true,
    });

    await runCase('washertop', {
      A: { local: [0.5, 0.6, 0.5], yawDeg: 30, ppm: 280 },
      closedOk: cls(['lid']),
      what: { closed: 'lid down', drive: 'a use is forced onto the top-loader', open: 'lid raised, interior visible' },
      drive: (id) => forceUse(page, setup.chest, id, 'doLaundry'),
      until: ({ parts }) => turned(parts, 'lid', 1.3) && part(parts, 'interior')?.visible === true,
    });

    await runCase('wardrobe', {
      A: { local: [0.5, 1.0, 0.6], yawDeg: 25, ppm: 120 },
      closedOk: cls(['doorL', 'doorR']),
      what: { closed: 'both doors shut', drive: 'changeOutfit reaches the wardrobe', open: 'both doors swung open, interior visible' },
      drive: (id) => startInteraction(page, id, 'changeOutfit'),
      until: ({ parts }) => turned(parts, 'doorL', 1.75) && turned(parts, 'doorR', 1.75) && part(parts, 'interior')?.visible === true,
    });

    if (ONLY.has('tv')) {
      const id = setup.tv, A = { local: [0.5, 0.3, 0.5], yawDeg: 15, ppm: 320 };
      const quadOf = () => page.evaluate((i) => {
        const m = window.hearthside.view.objects.rootOf(i).getObjectByName(`screen:${i}`);
        return m ? { visible: m.visible, scale: [m.scale.x, m.scale.y].map((v) => +v.toFixed(3)) } : null;
      }, id);
      await aim(page, id, A);
      await shot(page, 'tv-off');
      const q = await startInteraction(page, id, 'watchTv');
      check('tv: watchTv reaches the television', q.ok, q.reason ?? `elapsed ${q.elapsed}`);
      if (q.ok) {
        await page.evaluate(() => window.hearthside.debug.step(3));
        await settle(page, 900);
        await aim(page, id, A);
        const quad = await quadOf();
        check('tv: a screen quad was derived and is lit while watching', !!quad && quad.visible, JSON.stringify(quad));
        await shot(page, 'tv-in-use');
      }
      await clearActions(page);
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
