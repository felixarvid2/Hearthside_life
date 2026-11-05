// Task O (Milestone 12) visual check: the weather-bound outdoor activities and the public swimming pool, in portrait
// 390x844, landscape 844x390 and desktop 1280x720. Self-locks /tmp/hearthside-browser.lock and builds its own copy of
// the game.
//
//   node dev/ds-tasks/m12/shoot-o.mjs
//
// The script takes /tmp/hearthside-browser.lock itself (like the e2e scripts), so do not wrap it in flock: an outer
// lock would wait on the inner one forever. Screenshots go to dev/ds-tasks/m12/shots/O/.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5199;
const DIST = join(root, 'tests/e2e/out/dist-m12o');
const OUT = join(here, 'shots/O');
mkdirSync(OUT, { recursive: true });

if (!process.env.HEARTHSIDE_M12O_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url)], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_M12O_LOCKED: '1' },
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
const note = (name, ok, evidence = '') => { log.push({ name, ok, evidence }); console.log(`[m12-o] ${ok ? 'ok  ' : 'FAIL'} ${name}${evidence ? ` — ${evidence}` : ''}`); };

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
  // Nobody wanders off between scenes; every action is queued explicitly below.
  await page.evaluate(() => {
    document.querySelectorAll('.toast, .toasts > *').forEach((t) => t.remove());
    const g = window.hearthside.game;
    g.setSimSettings({ autonomyLevel: 0 });
    window.hearthside.debug.step(20);
  });
  await frames(page, 6);
}

/** Puts the world on a chosen season day, pins the weather through the debug hook and lets the HUD catch up. */
async function setSky(page, season, weather, dayInSeason, hour) {
  await page.evaluate(([s, w, d, h]) => {
    const hh = window.hearthside, g = hh.game, st = g.state();
    const seasonIndex = { spring: 0, summer: 1, autumn: 2, winter: 3 }[s];
    st.settings.seasons = true;
    st.settings.weather = true;
    st.settings.seasonDays = 7;
    const day = seasonIndex * 7 + (d - 1);
    st.clock.minutes = day * 1440 + h * 60;
    hh.debug.setWeather(w);
    hh.debug.step(1); // ensureWeather settles snowCover for a winter snowfall
  }, [season, weather, dayInSeason, hour]);
  await frames(page, 4);
}

function activeMembers(page) {
  return page.evaluate(() => {
    const st = window.hearthside.game.state();
    const hh = st.households[st.activeHouseholdId];
    return hh.memberIds.filter((id) => st.people[id]?.location.kind === 'lot');
  });
}

/** Cancels whatever anybody was doing so a queued scene action starts at once. */
async function clearQueues(page) {
  return page.evaluate(() => {
    const h = window.hearthside, g = h.game, st = g.state();
    for (const p of Object.values(st.people)) for (const a of [...p.queue]) g.cancel(p.id, a.id);
    h.debug.step(1);
    for (const p of Object.values(st.people)) for (const a of [...p.queue]) g.cancel(p.id, a.id);
    h.debug.step(1);
    return Object.values(st.people).filter((p) => p.location.kind === 'lot').length;
  });
}

/** Buys and places an outdoor object in the yard; scans the south lawn, then the east lawn, for a free tile. */
async function placeInYard(page, defId) {
  return page.evaluate(([id]) => {
    const h = window.hearthside, g = h.game, core = h.core;
    const st = g.state();
    const lot = st.lots[st.activeLotId];
    const scan = (zFrom, zTo, xFrom, xTo) => {
      for (let z = zFrom; z <= zTo; z++) {
        for (let x = xFrom; x <= xTo; x++) {
          const r = g.startPlacement(id);
          if (!r.ok) return { ok: false, reason: r.reason };
          core.placementTile(x, z);
          const p = g.placement();
          if (p?.ok) {
            const c = g.confirmPlacement();
            g.setMode('live');
            if (c.ok) return { ok: true, x, z, objectId: c.objectId, funds: st.households[st.activeHouseholdId].funds };
            return { ok: false, reason: c.reason };
          }
          g.cancelPlacement();
        }
      }
      return null;
    };
    g.setMode('buy');
    // The guided starter house occupies x 5..19, z 5..17; its front path runs south from the door at (8, 17).
    const pick = scan(Math.max(18, lot.depth - 7), lot.depth - 2, 2, lot.width - 3)
      ?? scan(3, Math.max(3, lot.depth - 3), Math.max(20, 1), lot.width - 2);
    g.setMode('live');
    return pick ?? { ok: false, reason: 'no free yard tile' };
  }, [defId]);
}

async function queueSelf(page, personId, interactionId) {
  return page.evaluate(([pid, iid]) => {
    const g = window.hearthside.game;
    const o = g.options(pid, { kind: 'self' }).find((x) => x.interactionId === iid);
    if (!o) return { ok: false, reason: `${iid} not offered` };
    if (!o.enabled) return { ok: false, reason: o.reason ?? 'disabled' };
    return g.queue(pid, o);
  }, [personId, interactionId]);
}

async function queueObject(page, personId, objectId, interactionId) {
  return page.evaluate(([pid, oid, iid]) => {
    const g = window.hearthside.game;
    const o = g.options(pid, { kind: 'object', objectId: oid }).find((x) => x.interactionId === iid);
    if (!o) return { ok: false, reason: `${iid} not offered` };
    if (!o.enabled) return { ok: false, reason: o.reason ?? 'disabled' };
    return g.queue(pid, o);
  }, [personId, objectId, interactionId]);
}

/** Steps until the person's head action is this interaction in its perform phase. */
async function untilPerform(page, personId, interactionId, max = 240) {
  return page.evaluate(([pid, iid, mx]) => {
    const h = window.hearthside, st = h.game.state();
    for (let i = 0; i < mx; i++) {
      const p = st.people[pid];
      const head = p?.queue[0];
      if (!head) return { ok: false, i, reason: 'queue empty' };
      if (head.interactionId !== iid) return { ok: false, i, reason: `head is ${head.interactionId}` };
      if (head.phase === 'perform') {
        return { ok: true, i, anim: p.anim.id, loc: { ...p.location }, elapsed: head.elapsed, duration: head.duration, moodlets: p.moodlets.map((m) => m.id) };
      }
      h.debug.step(1);
    }
    const p = st.people[pid];
    return { ok: false, reason: `timeout at ${p?.queue[0]?.phase} (${p?.anim.id})`, i: mx };
  }, [personId, interactionId, max]);
}

/** Runs the current action to its end and reports the objects it left behind. */
async function untilFinished(page, personId, max = 240) {
  return page.evaluate(([pid, mx]) => {
    const h = window.hearthside, g = h.game, st = g.state();
    const done = [];
    const off = h.game.core?.events?.onAny?.((e) => { if (e.type === 'action.finished') done.push(e); });
    for (let i = 0; i < mx; i++) {
      if (st.people[pid].queue.length === 0) break;
      h.debug.step(1);
    }
    off?.();
    const lot = st.lots[st.activeLotId];
    return {
      finished: done.map((e) => ({ id: e.interactionId, result: e.result })),
      anim: st.people[pid].anim.id,
      objects: Object.values(lot.objects).filter((o) => o.defId === 'snowman').map((o) => ({ id: o.id, x: o.x, z: o.z, snowman: o.snowman ?? null })),
      needs: { hunger: Math.round(st.people[pid].needs.hunger), fun: Math.round(st.people[pid].needs.fun) },
      moodlets: st.people[pid].moodlets.map((m) => m.id),
    };
  }, [personId, max]);
}

/** Frames a tile at a chosen zoom, snapping rather than gliding so the screenshot is not taken mid-move. */
async function frameScene(page, x, z, ppm) {
  await page.evaluate(([x2, z2, ppm2]) => {
    const h = window.hearthside;
    h.view.setCutaway('cutaway');
    h.view.rig.setYawStep(0);
    h.view.rig.glideTo(x2, z2, ppm2, 0);
    h.debug.frame(1 / 30);
  }, [x, z, ppm]);
  await frames(page, 6);
}

async function screenshot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path });
  const bytes = statSync(path).size;
  return { path, bytes };
}

async function main() {
  console.log('[m12-o] building', DIST);
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
      const ppm = Math.round(Math.min(60, Math.max(26, Math.min(vp.width, vp.height) / 9)));
      await startGame(page);

      // --- the yard props: a picnic blanket and a kite ---------------------------------------
      const blanket = await placeInYard(page, 'picnic-blanket');
      const kite = await placeInYard(page, 'kite');
      note(`${vp.id}: a picnic blanket and a kite can be put out in the yard`, blanket.ok && kite.ok,
        `blanket=${JSON.stringify(blanket)} kite=${JSON.stringify(kite)}`);
      if (!blanket.ok || !kite.ok) { await context.close(); continue; }

      // --- 1. Build a Snowman, mid-build, in the winter snow ---------------------------------
      await setSky(page, 'winter', 'snow', 2, 9);
      await clearQueues(page);
      const ids = await activeMembers(page);
      const builder = ids[0];
      const queued = await queueSelf(page, builder, 'buildSnowman');
      note(`${vp.id}: Build a Snowman is offered in the winter snow`, queued.ok === true, JSON.stringify(queued));
      const building = queued.ok ? await untilPerform(page, builder, 'buildSnowman', 240) : { ok: false, reason: 'not queued' };
      const sky = await page.evaluate(() => {
        const st = window.hearthside.game.state();
        return { weather: st.weather?.current, snowCover: st.weather?.snowCover === true, day: Math.floor(st.clock.minutes / 1440) };
      });
      note(`${vp.id}: the builder reaches the open snow and starts rolling snowballs`,
        building.ok && building.anim === 'exercise' && building.loc.kind === 'lot', JSON.stringify(building));
      note(`${vp.id}: winter snow is lying while the snowman is built`, sky.weather === 'snow' && sky.snowCover, JSON.stringify(sky));
      await frameScene(page, building.loc?.x ?? 12, building.loc?.z ?? 20, ppm);
      const buildShot = await screenshot(page, `snowman-building-${vp.id}.png`);
      note(`${vp.id}: the snowman-building screenshot is not blank`, buildShot.bytes > 20_000, `${buildShot.bytes} bytes`);

      const built = await untilFinished(page, builder, 240);
      note(`${vp.id}: finishing the action leaves a snowman in the garden`,
        built.objects.length === 1 && built.objects[0].snowman !== null, JSON.stringify({ objects: built.objects, finished: built.finished }));
      await frameScene(page, built.objects[0]?.x ?? 12, built.objects[0]?.z ?? 20, ppm);
      const builtShot = await screenshot(page, `snowman-built-${vp.id}.png`);
      note(`${vp.id}: the snowman screenshot is not blank`, builtShot.bytes > 20_000, `${builtShot.bytes} bytes`);

      // --- 2. Have a Picnic on the blanket in spring ----------------------------------------
      await setSky(page, 'spring', 'clear', 2, 11);
      await clearQueues(page);
      const picnicker = (await activeMembers(page))[0];
      const picnicQueued = await queueObject(page, picnicker, blanket.objectId, 'havePicnic');
      const picnic = picnicQueued.ok ? await untilPerform(page, picnicker, 'havePicnic', 180) : { ok: false, reason: picnicQueued.reason };
      note(`${vp.id}: Have a Picnic is offered at the blanket in the spring sun`, picnicQueued.ok === true && picnic.ok === true,
        JSON.stringify({ queue: picnicQueued, perform: picnic }));
      await frameScene(page, picnic.loc?.x ?? blanket.x, picnic.loc?.z ?? blanket.z, ppm);
      const picnicShot = await screenshot(page, `picnic-${vp.id}.png`);
      note(`${vp.id}: the picnic screenshot is not blank`, picnicShot.bytes > 20_000, `${picnicShot.bytes} bytes`);
      const picnicked = await untilFinished(page, picnicker, 120);

      // --- 3. Fly a Kite on a clear spring day ----------------------------------------------
      await clearQueues(page);
      const flyer = (await activeMembers(page))[0];
      const kiteQueued = await queueObject(page, flyer, kite.objectId, 'flyKite');
      const flying = kiteQueued.ok ? await untilPerform(page, flyer, 'flyKite', 180) : { ok: false, reason: kiteQueued.reason };
      note(`${vp.id}: Fly a Kite is offered at the kite in clear spring weather`, kiteQueued.ok === true && flying.ok === true,
        JSON.stringify({ queue: kiteQueued, perform: flying }));
      await frameScene(page, flying.loc?.x ?? kite.x, flying.loc?.z ?? kite.z, ppm);
      const kiteShot = await screenshot(page, `kite-${vp.id}.png`);
      note(`${vp.id}: the kite screenshot is not blank`, kiteShot.bytes > 20_000, `${kiteShot.bytes} bytes`);

      // --- 4. The pool: travel there, swim, and photograph the hall --------------------------
      await clearQueues(page);
      const trip = await page.evaluate(() => {
        const h = window.hearthside, g = h.game, st = g.state();
        const poolLot = Object.values(st.lots).find((l) => l.venueType === 'pool');
        if (!poolLot) return { ok: false, reason: 'no pool lot' };
        const hh = st.households[st.activeHouseholdId];
        const ids = hh.memberIds.filter((id) => st.people[id]?.location.kind === 'lot');
        const r = g.travel(ids, poolLot.id);
        return { ...r, lotId: poolLot.id, name: poolLot.name, built: poolLot.built, ids };
      });
      note(`${vp.id}: the household can travel to Quayside Baths`, trip.ok === true && trip.name === 'Quayside Baths', JSON.stringify(trip));
      const arrived = await page.evaluate(([lotId]) => {
        const h = window.hearthside, g = h.game, st = g.state();
        for (let i = 0; i < 240; i++) {
          if (!g.neighbourhood()?.trip) break;
          h.debug.step(1);
        }
        const lot = st.lots[lotId];
        return {
          here: st.activeLotId === lotId, built: lot?.built === true, trip: g.neighbourhood()?.trip ?? null,
          pools: Object.values(lot?.pools ?? {}).map((p) => ({ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1 })),
          roofs: Object.keys(lot?.roofs ?? {}).length,
          objects: ['locker-bank', 'shower-stall', 'vending-machine', 'sun-lounger'].map((d) => [d, Object.values(lot?.objects ?? {}).filter((o) => o.defId === d).length]),
        };
      }, [trip.lotId]);
      note(`${vp.id}: the venue is built and holds a 6 x 10 pool under a roof`,
        arrived.here && arrived.built && arrived.roofs >= 1 && arrived.pools.length === 1 && arrived.pools[0].x1 - arrived.pools[0].x0 + 1 === 6 && arrived.pools[0].z1 - arrived.pools[0].z0 + 1 === 10,
        JSON.stringify(arrived));
      note(`${vp.id}: the changing room, showers, vending and sun deck are furnished`,
        arrived.objects.every(([, n]) => n > 0), JSON.stringify(arrived.objects));

      const swim = await page.evaluate(([pool, ids]) => {
        const h = window.hearthside, g = h.game, st = g.state();
        const cx = Math.floor((pool.x0 + pool.x1) / 2), cz = Math.floor((pool.z0 + pool.z1) / 2);
        const swimmers = [];
        for (const id of ids.slice(0, 2)) {
          const p = st.people[id];
          p.needs.fun = 25; p.needs.energy = 85; p.needs.hygiene = 60;
          for (const a of [...p.queue]) g.cancel(id, a.id);
          const o = g.options(id, { kind: 'floor', tile: { x: cx, z: cz }, level: 0 }).find((x) => x.interactionId === 'swimInPool' && x.enabled);
          if (!o) continue;
          const q = g.queue(id, o);
          if (q.ok) swimmers.push(id);
        }
        for (let i = 0; i < 400; i++) {
          const inWater = swimmers.filter((id) => {
            const p = st.people[id];
            const head = p.queue[0];
            return head?.interactionId === 'swimInPool' && head?.data?.stage === 'swim';
          });
          if (inWater.length === swimmers.length && swimmers.length > 0) break;
          h.debug.step(1);
        }
        return {
          swimmers: swimmers.map((id) => {
            const p = st.people[id];
            const head = p.queue[0];
            const loc = p.location;
            return {
              name: `${p.firstName} ${p.lastName}`, anim: p.anim.id, stage: head?.data?.stage ?? null, posture: loc.posture,
              inWater: loc.kind === 'lot' && loc.x >= pool.x0 && loc.x <= pool.x1 && loc.z >= pool.z0 && loc.z <= pool.z1,
              outfit: p.outfits.current.category,
            };
          }),
        };
      }, [arrived.pools[0], trip.ids]);
      note(`${vp.id}: two household members are swimming in the lap pool`,
        swim.swimmers.length >= 1 && swim.swimmers.every((s) => s.anim === 'swim' && s.stage === 'swim' && s.inWater && s.outfit === 'swim'),
        JSON.stringify(swim.swimmers));
      const poolCx = (arrived.pools[0].x0 + arrived.pools[0].x1 + 1) / 2, poolCz = (arrived.pools[0].z0 + arrived.pools[0].z1 + 1) / 2;
      await frameScene(page, poolCx, poolCz, Math.round(ppm * 0.7));
      const poolShot = await screenshot(page, `pool-interior-${vp.id}.png`);
      note(`${vp.id}: the pool-interior screenshot is not blank`, poolShot.bytes > 20_000, `${poolShot.bytes} bytes`);

      // --- 5. The neighbourhood map with the pool selected ----------------------------------
      const mapBtn = page.locator('[aria-label="Neighbourhood map"]').first();
      if (vp.mobile) await mapBtn.tap(); else await mapBtn.click();
      await page.waitForSelector('.nbm-pin', { timeout: 30000 });
      await page.waitForTimeout(400);
      const map = await page.evaluate(() => {
        const pins = [...document.querySelectorAll('.nbm-pin')].map((e) => ({ id: e.getAttribute('data-lot-id'), label: e.getAttribute('aria-label') ?? '' }));
        return { pins, pool: pins.find((p) => /Quayside Baths/.test(p.label)) ?? null };
      });
      note(`${vp.id}: the map shows the pool venue`, !!map.pool, `pins=${map.pins.length} pool=${JSON.stringify(map.pool)}`);
      if (map.pool) {
        await page.evaluate((id) => document.querySelector(`.nbm-pin[data-lot-id="${id}"]`)?.click(), map.pool.id);
        await page.waitForTimeout(500);
      }
      const mapShot = await screenshot(page, `map-pool-${vp.id}.png`);
      note(`${vp.id}: the map screenshot is not blank`, mapShot.bytes > 20_000, `${mapShot.bytes} bytes`);
      const sheet = await page.evaluate(() => document.querySelector('.nbm-sheet, .nbm-detail')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200) ?? '');
      note(`${vp.id}: the pool sheet names the venue and the pool`, /Quayside Baths/.test(sheet) && /pool/i.test(sheet), sheet);

      note(`${vp.id}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' / '));
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGTERM');
    writeFileSync(join(OUT, 'shots.json'), JSON.stringify(log, null, 2));
  }

  const failed = log.filter((l) => !l.ok);
  console.log(`[m12-o] ${log.length - failed.length}/${log.length} checks passed; screenshots in dev/ds-tasks/m12/shots/O/`);
  if (failed.length) process.exitCode = 1;
}

await main();
