// Throwaway: do placed stairs render? Loads the two-storey Hazelbank loft house (moveHousehold) and takes desktop close-ups of
// the staircase from Floor 1 (cutaway, walls up), from Floor 2 (looking down the stairwell) and with a person mid-climb.
// Takes /tmp/hearthside-browser.lock by re-running itself under flock, like tests/e2e/acceptance.mjs. Builds into its own
// folder, so it never touches tests/e2e/out/dist. Output: shots/*.jpg and report.json next to this file.
//
//   node dev/ds-tasks/stairs-check/stairs-check.mjs

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5197;
const DIST = process.env.STAIRS_DIST || '/tmp/claude-0/stairs-check-dist';
const SHOTS = join(here, 'shots');

if (!process.env.HEARTHSIDE_E2E_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_E2E_LOCKED: '1' },
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
const T0 = Date.now();
const log = (...a) => console.log(`[stairs +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);

async function main() {
  log('lock held; building into', DIST);
  mkdirSync(DIST, { recursive: true });
  const b = spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', DIST, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
  if (b.status !== 0) throw new Error('vite build failed');
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser = null;
  const report = { shots: [], diag: {}, errors: [] };
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* wait */ } await sleep(250); }
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({
      ...launchOptions(chromium),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', (e) => report.errors.push(`pageerror ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`console ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
    await page.waitForTimeout(1000);

    const frames = (n = 4, dt = 1 / 30) => page.evaluate(([n2, dt2]) => { for (let i = 0; i < n2; i++) window.hearthside.debug.frame(dt2); }, [n, dt]);
    const shot = async (name, clip) => {
      await frames(6);
      await page.screenshot({ path: join(SHOTS, `${name}.jpg`), type: 'jpeg', quality: 72, ...(clip ? { clip } : {}) });
      report.shots.push(name);
      log('shot', name);
    };

    // ---- a new game, then move into Hazelbank House (the for-sale home with the loft and the straight stair)
    const setup = await page.evaluate(async () => {
      const g = window.hearthside.game;
      const hh = g.premadeHouseholds();
      await g.startNewGame('create', hh.find((x) => x.members.length >= 2) ?? hh[0]);
      g.setSpeed(0);
      const n = g.neighbourhood();
      const lot = n.lots.find((l) => /Hazelbank/.test(l.name));
      const out = { lot: lot ? { id: lot.id, name: lot.name, tenure: lot.tenure, price: lot.price, rent: lot.rent } : null };
      if (lot) { out.preview = g.movePreview(lot.id); out.move = g.moveHousehold(lot.id); }
      return out;
    });
    log('setup', JSON.stringify(setup).slice(0, 600));
    report.setup = setup;
    // the household travels 20-40 game minutes; the active lot switches on arrival
    const arrived = await page.evaluate(() => {
      const d = window.hearthside.debug;
      const want = window.hearthside.game.neighbourhood().lots.find((l) => /Hazelbank/.test(l.name)).id;
      for (let i = 0; i < 400; i++) { d.step(30); if (d.state().activeLotId === want) return i; }
      return -1;
    });
    log('arrival after chunks of 30 ticks:', arrived);
    await page.waitForTimeout(1500);
    await frames(20);

    const info = await page.evaluate(() => {
      const st = window.hearthside.debug.state();
      const lot = st.lots[st.activeLotId];
      const stairs = Object.values(lot.objects).filter((o) => window.hearthside.game.content.objects[o.defId]?.stair);
      const hhid = st.activeHouseholdId;
      return { lot: lot.name, levels: lot.levels, stairs, members: st.households[hhid].memberIds.map((id) => ({ id, name: st.people[id].firstName, loc: st.people[id].location })) };
    });
    report.info = info;
    log('active lot', info.lot, 'levels', info.levels, 'stairs', JSON.stringify(info.stairs));
    if (!info.stairs.length) throw new Error('no stair on the active lot');
    const stair = info.stairs[0];
    const cx = stair.x + 0.5, cz = stair.z + 1.5; // 1 x 3 stair at rot 0

    // diagnostics: is the stair group in the scene, visible, and where is its box
    const diag = (label) => page.evaluate(([id, label2]) => {
      const v = window.hearthside.view;
      const g = v.objects.group.getObjectByName(`obj:${id}`);
      if (!g) return { label: label2, found: false };
      let visible = true; for (let o = g; o; o = o.parent) if (!o.visible) { visible = false; break; }
      let meshes = 0, tris = 0; const mats = new Set();
      g.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(`${m.name}:#${m.color?.getHexString?.()}`)); } });
      const b = v.objects.boxOf(id);
      const sp = (x, y, z) => v.worldToScreen(x, y, z);
      return { label: label2, found: true, visible, meshes, tris: Math.round(tris), mats: [...mats], level: window.hearthside.game.view.level?.(), box: b && { min: b.min.toArray().map((n) => +n.toFixed(2)), max: b.max.toArray().map((n) => +n.toFixed(2)) },
        foot: sp(b ? (b.min.x + b.max.x) / 2 : 0, 0, b ? b.max.z - 0.2 : 0), head: sp(b ? (b.min.x + b.max.x) / 2 : 0, 3, b ? b.min.z + 0.2 : 0) };
    }, [stair.id, label]);

    const aim = (x, z, ppm, y = 0) => page.evaluate(([x2, z2, p, y2]) => { window.hearthside.view.rig.glideTo(x2, z2, p, 0, y2); }, [x, z, ppm, y]);
    const setLevel = async (lvl) => { await page.evaluate((l) => window.hearthside.game.view.setLevel?.(l), lvl); await frames(8); };
    const setWalls = async (m) => { await page.evaluate((mm) => window.hearthside.game.view.setCutaway(mm), m); await frames(6); };
    const roofs = async (on) => { await page.evaluate((o) => window.hearthside.game.view.setRoofsVisible?.(o), on); await frames(4); };
    const rotateTo = async (k) => { // rig.k is the yaw step; rotate until it matches
      for (let i = 0; i < 4; i++) { const cur = await page.evaluate(() => window.hearthside.view.rig.k); if (((cur % 4) + 4) % 4 === k) break; await page.evaluate(() => window.hearthside.game.view.rotate(1)); await page.waitForTimeout(900); await frames(30); }
    };
    await page.evaluate(() => window.hearthside.game.setMode('live'));
    await frames(10);
    await roofs(false);

    // ---- 1 Floor 1, walls cutaway
    await setLevel(0);
    await setWalls('cutaway');
    await aim(cx, cz, 120);
    await frames(20);
    report.diag.floor1Cutaway = await diag('floor1 cutaway');
    await shot('01-floor1-cutaway');
    // ---- 2 Floor 1, walls up
    await setWalls('up');
    await frames(20);
    report.diag.floor1Up = await diag('floor1 walls up');
    await shot('02-floor1-walls-up');
    // ---- 3 Floor 2, looking down the stairwell (cutaway and walls up)
    await setLevel(1);
    await setWalls('cutaway');
    await aim(cx, cz, 120, 0);
    await frames(20);
    report.diag.floor2Cutaway = await diag('floor2 cutaway');
    await shot('03-floor2-stairwell-cutaway');
    await setWalls('up');
    await frames(20);
    report.diag.floor2Up = await diag('floor2 walls up');
    await shot('04-floor2-stairwell-walls-up');
    // from the other side too (yaw step 2), cutaway
    await setWalls('cutaway');
    await rotateTo(2);
    await aim(cx, cz, 120, 0);
    await frames(20);
    await shot('05-floor2-stairwell-cutaway-rot2');
    await rotateTo(0);

    // ---- 4 a person mid-climb: send a member to a tile of the loft (level 1) and sample the climb
    const walker = info.members.find((m) => m.loc.kind === 'lot')?.id ?? null;
    report.walker = walker;
    if (walker) {
      await setLevel(0);
      await setWalls('cutaway');
      const goal = { x: stair.x + 1, z: stair.z - 1, level: 1 };
      const r = await page.evaluate(([id, g]) => window.hearthside.game.goTo(id, g), [walker, goal]);
      log('goTo', JSON.stringify(r));
      report.goTo = r;
      const samples = [];
      let shotClimb = 0;
      for (let i = 0; i < 900 && shotClimb < 3; i++) {
        const s = await page.evaluate((id) => { window.hearthside.debug.step(3); const l = window.hearthside.debug.state().people[id].location; return l.kind === 'lot' ? { x: l.x, z: l.z, level: l.level, rise: l.rise ?? 0 } : l; }, walker);
        if (i % 10 === 0) samples.push(s);
        const want = shotClimb === 0 ? 0.6 : shotClimb === 1 ? 1.5 : 2.4;
        if (s.rise >= want) {
          const p = await page.evaluate((id) => window.hearthside.view.personPosition?.(id), walker);
          await aim(s.x, s.z, 140, 0);
          await frames(6);
          const pv = await page.evaluate((id) => { const v = window.hearthside.view; const st = window.hearthside.debug.state().people[id].location; const sc = v.worldToScreen(st.x, st.level * 3 + (st.rise ?? 0) + 0.9, st.z); const vis = typeof v.people?.isVisible === 'function' ? v.people.isVisible(id) : null; return { sc, vis }; }, walker);
          report.diag[`climb${shotClimb}`] = { loc: s, personPos: p, ...pv, stair: await diag(`climb ${shotClimb}`) };
          await shot(`06-climb-${shotClimb}-floor1-view`);
          if (shotClimb === 1) { await setLevel(1); await aim(s.x, s.z, 140, 0); await frames(6); await shot('07-climb-1-floor2-view'); await setLevel(0); }
          shotClimb++;
        }
        if (s.level === 1 && !s.rise) break;
      }
      report.climbSamples = samples;
      report.maxRise = Math.max(...samples.map((s) => s.rise ?? 0));
      log('climb samples', JSON.stringify(samples.map((s) => `${s.level}/${(s.rise ?? 0).toFixed(1)}`)).slice(0, 400));
      // after arrival: the person on the loft, camera on Floor 2
      await setLevel(1);
      await aim(cx, cz, 120, 0);
      await shot('08-floor2-after-climb');
    }
    await context.close();
  } finally {
    writeFileSync(join(here, 'report.json'), JSON.stringify(report, null, 2));
    await browser?.close().catch(() => undefined);
    server.kill('SIGTERM');
  }
  log('done; errors:', report.errors.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
