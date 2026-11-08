#!/usr/bin/env node
// The life-stage bodies in the real game (dev server, SwiftShader): a household whose members are set to other life stages, standing in a
// row, then a woman holding a baby, a baby on the floor, and the same in the classic style (the adult rig scaled to the stage).
//   node dev/mpfb/shootGame.mjs [--out=DIR] [--style=mpfb|classic]
// Runs under `flock /tmp/hearthside-browser.lock` (do not wrap it in another flock). Writes PNGs to dev/mpfb/shots/raw/game_*.png.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5396;
const args = process.argv.slice(2);
const opt = (name, def) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };

if (!process.env.MPFB_LAB_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...args], { stdio: 'inherit', env: { ...process.env, MPFB_LAB_LOCKED: '1' } });
  process.exit(r.status ?? 1);
}

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of [join(root, 'node_modules'), '/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try { return require(require.resolve('playwright', { paths: [p] })); } catch { /* next */ }
  }
  throw new Error('playwright is not installed');
}

const OUT = resolve(opt('out', join(here, 'shots', 'raw')));
const STYLE = opt('style', 'mpfb');
mkdirSync(OUT, { recursive: true });

async function waitForServer(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server at ${url} did not start`);
}

const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser = null;
try {
  await waitForServer(`http://127.0.0.1:${PORT}/`, 40000);
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.addInitScript((style) => { try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, hints: false, musicVolume: 0, characterStyle: style })); } catch { /* ignore */ } }, STYLE);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 180000 });
  await page.waitForTimeout(800);
  const frames = (n, dt = 1 / 30) => page.evaluate(([n2, dt2]) => { for (let i = 0; i < n2; i++) window.hearthside.debug.frame(dt2); }, [n, dt]);
  const started = await page.evaluate(async () => {
    const g = window.hearthside.game;
    const hhs = g.premadeHouseholds();
    const hh = [...hhs].sort((a, b) => b.members.length - a.members.length)[0];
    const r = await g.startNewGame('guided', hh);
    g.setSpeed(0);
    return { ok: r.ok, members: hh.members.length };
  });
  console.log('[game] started', JSON.stringify(started));
  await page.waitForTimeout(600);
  await page.evaluate(() => { document.querySelectorAll('.toast, .toasts > *').forEach((t) => t.remove()); window.hearthside.debug.step(10); });
  await frames(6);

  // the household members, placed in a row on the floor around the first one, each at another life stage
  const placed = await page.evaluate((stages) => {
    const h = window.hearthside, st = h.game.state();
    const hh = st.households[st.activeHouseholdId];
    const ids = hh.memberIds.filter((id) => st.people[id].location.kind === 'lot');
    const first = st.people[ids[0]].location;
    const out = [];
    ids.forEach((id, k) => {
      const p = st.people[id];
      p.lifeStage = stages[k % stages.length];
      p.queue = [];
      p.location = { ...p.location, x: first.x + (k - 1) * 0.95, z: first.z, facing: 0, posture: 'standing' };
      p.anim = { id: 'idle', since: st.clock.minutes, loop: true };
      h.view.personChanged(id);
      out.push({ id, stage: p.lifeStage, x: p.location.x, z: p.location.z });
    });
    h.view.people.snap(st);
    return out;
  }, ['adult', 'child', 'elder', 'teen', 'toddler', 'adult']);
  console.log('[game] people', JSON.stringify(placed.map((p) => p.stage)));
  await page.waitForTimeout(1500); // the stage bodies download and rebuild the views
  const view = async (name, x, z, ppm, yaw = 0) => {
    await page.evaluate(([cx, cz, p, y]) => { const h = window.hearthside; h.view.rig.setYawStep(y); h.game.view.setCutaway('cutaway'); h.view.rig.glideTo(cx, cz, p, 0, 0.05); }, [x, z, ppm, yaw]);
    await frames(24);
    await page.screenshot({ timeout: 180000, path: join(OUT, `game_${STYLE === 'mpfb' ? '' : `${STYLE}_`}${name}.png`) });
    console.log(`[game] ${name}`);
  };
  const mid = placed.length ? { x: placed[0].x + (placed.length - 3) * 0.475, z: placed[0].z } : { x: 0, z: 0 };
  await view('family', mid.x, mid.z, 230);
  await view('family_side', mid.x, mid.z, 230, 1);

  // a baby on the floor next to somebody holding another baby (explicit hold)
  if (placed.length >= 2) {
    await page.evaluate((ids) => {
      const h = window.hearthside, st = h.game.state();
      const [carrier, baby, other] = ids;
      st.people[baby].lifeStage = 'baby'; if (other) st.people[other].lifeStage = 'baby';
      st.people[carrier].lifeStage = 'adult';
      for (const id of [baby, other]) if (id) h.view.personChanged(id);
      h.view.personChanged(carrier);
      h.view.people.setHeld(baby, carrier);
      st.people[baby].location = { ...st.people[baby].location, x: st.people[carrier].location.x, z: st.people[carrier].location.z + 0.3 };
      if (other) st.people[other].location = { ...st.people[other].location, x: st.people[carrier].location.x + 1.1, z: st.people[carrier].location.z + 0.4 };
      h.view.people.snap(st);
    }, placed.slice(0, 3).map((p) => p.id));
    await frames(10);
    await page.waitForTimeout(1200);
    await view('held', placed[0].x + 0.5, placed[0].z, 360);
  }
  if (errors.length) console.log(`[game] ${errors.length} console errors, first: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
} finally {
  await browser?.close();
  server.kill();
}
