#!/usr/bin/env node
// Screenshots of dev/meshy.html (procedural character left, Meshy character right) -> dev/meshy/shots/.
//   node dev/meshy/shoot.mjs [--bench] [--only=male,female_live_idle,...] [--out=DIR] [--q=extra&query]
// One page per model (male / female / test, and with generated garments over the Meshy body); scenario files are <model>_<scenario>.png.
// Starts a vite dev server on port 5391 and runs Chromium (SwiftShader) under `flock /tmp/hearthside-browser.lock`
// (only one browser at a time on this machine). Also prints window.lab.stretch() for every scenario with stretch: true.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5391;
const args = process.argv.slice(2);
const opt = (name, def) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };

if (!process.env.MESHY_SHOOT_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...args], { stdio: 'inherit', env: { ...process.env, MESHY_SHOOT_LOCKED: '1' } });
  process.exit(r.status ?? 1);
}

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of [join(root, 'node_modules'), '/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try { return require(require.resolve('playwright', { paths: [p] })); } catch { /* next */ }
  }
  throw new Error('playwright is not installed');
}

const OUT = resolve(opt('out', join(here, 'shots')));
const EXTRA = opt('q', '');
const BENCH = args.includes('--bench');
const ONLY = opt('only', '').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });

const LIVE = { vp: [320, 240], dpr: 2 };
const CLOSE = { vp: [1280, 720], dpr: 1 };
/** Scenario: name, viewport, ops = [lab method, ...args]. Every scenario starts from the standing scene. */
const S = (name, base, ops, extra = {}) => ({ name, ...base, ops: [['scene', 'stand'], ['k', 0], ...ops], ...extra });
const V = (v, over) => ['view', v, over ?? {}];
const SCENARIOS = [
  // game distance (orthographic live camera, 66 px/m), procedural left / Meshy right
  S('live_idle', LIVE, [V('live'), ['play', 'idle'], ['advance', 0.1, 6]]),
  S('live_walk', LIVE, [V('live'), ['play', 'walk'], ['advance', 0.05, 8]], { stretch: true }),
  S('live_sit', LIVE, [V('live'), ['play', 'sitIdle', 'seated'], ['advance', 0.1, 6]], { stretch: true }),
  S('live_lie', LIVE, [V('live'), ['play', 'sleep', 'lying'], ['advance', 0.1, 4]], { stretch: true }),
  S('live_eat', LIVE, [V('live'), ['play', 'eat'], ['advance', 0.05, 10]], { stretch: true }),
  S('live_idle_k2', LIVE, [V('live'), ['k', 2], ['play', 'idle'], ['advance', 0.1, 6]]),
  S('live_max_zoom', LIVE, [V('live', { ppm: 150 }), ['play', 'idle'], ['advance', 0.1, 6]]),
  // close-ups (portrait lighting as in the creator/portraits)
  S('close_front', CLOSE, [V('front'), ['play', 'idle'], ['advance', 0.1, 6]]),
  S('close_threeq', CLOSE, [V('threeq'), ['play', 'idle'], ['advance', 0.1, 6]]),
  // joints in bent poses
  S('joints_shoulders_wave', CLOSE, [V('shoulders'), ['play', 'wave'], ['advance', 0.05, 8]], { stretch: true }),
  S('joints_elbows_eat', CLOSE, [V('elbows'), ['play', 'eat'], ['advance', 0.05, 10]], { stretch: true }),
  S('joints_hips_sit', CLOSE, [V('hips', { yaw: 0.9 }), ['play', 'sitIdle', 'seated'], ['advance', 0.1, 6]], { stretch: true }),
  S('joints_knees_sit', CLOSE, [V('knees', { yaw: 0.9, dist: 2.2 }), ['play', 'sitIdle', 'seated'], ['advance', 0.1, 6]]),
  S('joints_walk_hips_knees', CLOSE, [V('hips', { ty: 0.75, dist: 2.4 }), ['play', 'walk'], ['advance', 0.05, 8]]),
  S('full_bind', CLOSE, [V('full'), ['bind', true], ['advance', 0.1, 2]]),
];
/** Models (see dev/meshy.ts MODELS) and the query each page is opened with. */
const MODEL_PAGES = [
  { prefix: 'male', q: 'model=male' },
  { prefix: 'female', q: 'model=female' },
  { prefix: 'test', q: 'model=test' },
  { prefix: 'male_garments', q: 'model=male&garments=1', only: ['live_idle', 'live_sit', 'live_walk', 'close_front', 'joints_hips_sit'] },
  { prefix: 'female_garments', q: 'model=female&garments=1', only: ['live_idle', 'live_sit', 'live_walk', 'close_front', 'joints_hips_sit'] },
  // procedural hair (src/characters/hair.ts) refitted to the Meshy head
  { prefix: 'male_hair', q: 'model=male&hair=crop-side-part', only: ['live_idle', 'close_front', 'close_threeq'] },
  { prefix: 'male_hair_curly', q: 'model=male&hair=curly-top&hairColor=%233d2a1f', only: ['close_front', 'close_threeq'] },
  { prefix: 'female_hair', q: 'model=female&hair=bob-chin', only: ['live_idle', 'close_front', 'close_threeq'] },
  { prefix: 'female_hair_long', q: 'model=female&hair=long-straight', only: ['close_threeq', 'live_idle'] },
  // mobile budget: decimated meshes / smaller textures (dev/meshy/decimate.mjs writes variants/)
  { prefix: 'male_8k_1024', q: 'model=male&glb=/dev/meshy/variants/base_male_underwear_8k_1024.glb', only: ['live_idle', 'close_front', 'joints_hips_sit'] },
  { prefix: 'male_5k_512', q: 'model=male&glb=/dev/meshy/variants/base_male_underwear_5k_512.glb', only: ['live_idle', 'close_front', 'joints_hips_sit'] },
];

async function waitForServer(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server at ${url} did not start`);
}

const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser = null;
let serverDied = false;
server.on('exit', () => { serverDied = true; });
try {
  await waitForServer(`http://127.0.0.1:${PORT}/dev/meshy.html`, 30000);
  if (serverDied) throw new Error(`vite exited (port ${PORT} busy?)`);
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const mp of MODEL_PAGES) {
    for (const dpr of [2, 1]) {
      const list = SCENARIOS.filter((sc) => sc.dpr === dpr && (!mp.only || mp.only.includes(sc.name)) && (!ONLY.length || ONLY.includes(`${mp.prefix}_${sc.name}`) || ONLY.includes(mp.prefix)));
      if (!list.length) continue;
      const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: dpr });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`http://127.0.0.1:${PORT}/dev/meshy.html?clean=1&freeze=1&${mp.q}${EXTRA ? `&${EXTRA}` : ''}`);
      try {
        await page.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
      } catch (e) {
        console.log(`[shoot] ${mp.prefix}: page not ready. info="${await page.evaluate(() => document.getElementById('info')?.textContent?.slice(0, 600))}" errors=${errors.slice(0, 3).join(' | ')}`);
        await ctx.close();
        continue;
      }
      if (dpr === 2 && !mp.reported) { mp.reported = true; console.log(`[shoot] ${mp.prefix} fit ${JSON.stringify(await page.evaluate(() => { const r = window.lab.report(); return { ...r.fit, head: undefined, skull: undefined }; }))}`); }
      if (dpr === 2 && BENCH && ['male', 'male_8k_1024'].includes(mp.prefix)) {
        await page.setViewportSize({ width: 320, height: 240 });
        await page.evaluate(() => { window.lab.view('live'); window.lab.freeze(false); });
        for (const n of [1, 12, 40]) for (const kind of mp.prefix === 'male' ? ['proc', 'meshy'] : ['meshy']) {
          const r = await page.evaluate(([k, nn]) => window.lab.bench(k, nn, 12), [kind, n]);
          console.log(`[bench] ${mp.prefix} ${kind} x${n}: ${JSON.stringify(r)}`);
        }
        await page.evaluate(() => window.lab.freeze(true));
      }
      for (const sc of list) {
        await page.setViewportSize({ width: sc.vp[0], height: sc.vp[1] });
        for (const [m, ...a] of sc.ops) await page.evaluate(([mm, aa]) => window.lab[mm](...aa), [m, a]);
        await page.waitForTimeout(500);
        const file = join(OUT, `${mp.prefix}_${sc.name}.png`);
        try { await page.screenshot({ path: file, timeout: 120000 }); } catch { await page.waitForTimeout(2000); await page.screenshot({ path: file, timeout: 120000 }); }
        let line = `[shoot] ${mp.prefix}_${sc.name}`;
        if (sc.stretch) {
          const st = await page.evaluate(() => window.lab.stretch());
          line += `  stretch max ${st.max.toFixed(2)} p99 ${st.p99.toFixed(2)} >2x: ${st.over2} >3x: ${st.over3}`;
        }
        if (errors.length) line += `  ERRORS: ${errors.slice(0, 3).join(' | ')}`;
        console.log(line);
      }
      await ctx.close();
    }
  }
} finally {
  await browser?.close();
  server.kill();
}
