#!/usr/bin/env node
// Screenshots of dev/meshy.html (procedural character left, Meshy character right) -> dev/meshy/shots/.
//   node dev/meshy/shoot.mjs [--only=name,name] [--out=DIR] [--q=extra&query]
// Starts a vite dev server on port 5191 and runs Chromium (SwiftShader) under `flock /tmp/hearthside-browser.lock`
// (only one browser at a time on this machine). Also prints window.lab.stretch() for every scenario with stretch: true.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5191;
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
const ONLY = opt('only', '').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });

const LIVE = { vp: [640, 400], dpr: 2 };
const CLOSE = { vp: [1280, 720], dpr: 1 };
/** ops: [method, ...args] calls on window.lab before the screenshot. */
const S = (name, base, q, ops, extra = {}) => ({ name, ...base, q: `clean=1&freeze=1&${q}`, ops, ...extra });
const SCENARIOS = [
  // game distance (orthographic live camera, 66 px/m), procedural left / Meshy right
  S('live_idle', LIVE, 'view=live', [['play', 'idle'], ['advance', 0.1, 6]]),
  S('live_walk', LIVE, 'view=live', [['play', 'walk'], ['advance', 0.05, 8]], { stretch: true }),
  S('live_sit', LIVE, 'view=live&scene=sit', [['play', 'sitIdle', 'seated'], ['advance', 0.1, 6]], { stretch: true }),
  S('live_lie', LIVE, 'view=live&scene=lie', [['play', 'sleep', 'lying'], ['advance', 0.1, 4]], { stretch: true }),
  S('live_eat', LIVE, 'view=live', [['play', 'eat'], ['advance', 0.05, 10]], { stretch: true }),
  S('live_idle_k2', LIVE, 'view=live&k=2', [['play', 'idle'], ['advance', 0.1, 6]]),
  S('live_max_zoom', { vp: [640, 400], dpr: 2 }, 'view=live&ppm=150', [['play', 'idle'], ['advance', 0.1, 6]]),
  // close-ups (portrait lighting as in the creator/portraits)
  S('close_front', CLOSE, 'view=front', [['play', 'idle'], ['advance', 0.1, 6]]),
  S('close_threeq', CLOSE, 'view=threeq', [['play', 'idle'], ['advance', 0.1, 6]]),
  // joints in bent poses
  S('joints_shoulders_wave', CLOSE, 'view=shoulders', [['play', 'wave'], ['advance', 0.05, 8]], { stretch: true }),
  S('joints_elbows_eat', CLOSE, 'view=elbows', [['play', 'eat'], ['advance', 0.05, 10]], { stretch: true }),
  S('joints_hips_sit', CLOSE, 'view=hips&scene=sit&yaw=0.9', [['play', 'sitIdle', 'seated'], ['advance', 0.1, 6]], { stretch: true }),
  S('joints_knees_sit', CLOSE, 'view=knees&scene=sit', [['play', 'sitIdle', 'seated'], ['advance', 0.1, 6]]),
  S('joints_walk_hips_knees', CLOSE, 'view=hips', [['play', 'walk'], ['advance', 0.05, 8]]),
  S('full_bind', CLOSE, 'view=full&bind=1', [['advance', 0.1, 2]]),
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
try {
  await waitForServer(`http://127.0.0.1:${PORT}/dev/meshy.html`, 30000);
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const sc of SCENARIOS) {
    if (ONLY.length && !ONLY.includes(sc.name)) continue;
    const ctx = await browser.newContext({ viewport: { width: sc.vp[0], height: sc.vp[1] }, deviceScaleFactor: sc.dpr });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${PORT}/dev/meshy.html?${sc.q}${EXTRA ? `&${EXTRA}` : ''}`);
    await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
    for (const [m, ...a] of sc.ops) await page.evaluate(([mm, aa]) => window.lab[mm](...aa), [m, a]);
    await page.waitForTimeout(400);
    const file = join(OUT, `${sc.name}.png`);
    await page.screenshot({ path: file });
    let line = `[shoot] ${sc.name}`;
    if (sc.stretch) {
      const st = await page.evaluate(() => window.lab.stretch());
      line += `  stretch max ${st.max.toFixed(2)} p99 ${st.p99.toFixed(2)} >2x: ${st.over2} >3x: ${st.over3}  worst ${JSON.stringify(st.worst.slice(0, 3))}`;
    }
    if (errors.length) line += `  ERRORS: ${errors.slice(0, 3).join(' | ')}`;
    console.log(line);
    await ctx.close();
  }
} finally {
  await browser?.close();
  server.kill();
}
