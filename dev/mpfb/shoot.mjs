#!/usr/bin/env node
// Screenshots of dev/mpfb.html (Meshy female | MPFB female | Meshy male | MPFB male) -> dev/mpfb/shots/.
//   node dev/mpfb/shoot.mjs [--only=full_front,face_1] [--out=DIR] [--q=extra&query]
//   e.g. --q='f=/dev/mpfb/out/work/mpfb_f.min.glb&m=/dev/mpfb/out/work/mpfb_m.min.glb' to look at a build made with --out=dev/mpfb/out/work --no-publish
//   Shot groups: --only=faces (face_0..3), --only=tones (face close-ups at four skin tones), --only=facemorphs (every face morph at -1 / +1, male; facemorphs_f: female)
// Starts its own vite dev server (port 5399) and runs Chromium (SwiftShader) under `flock /tmp/hearthside-browser.lock`.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5399;
const args = process.argv.slice(2);
const opt = (name, def) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };

if (!process.env.MPFB_SHOOT_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...args], { stdio: 'inherit', env: { ...process.env, MPFB_SHOOT_LOCKED: '1' } });
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
mkdirSync(OUT, { recursive: true });

const WIDE = [1600, 640];
const CLOSE = [900, 900];
/** name, viewport, lab.set options */
const SHOTS = [
  ['full_front', WIDE, { view: 'front', clip: 'idle' }],
  ['full_threeq', WIDE, { view: 'threeq', clip: 'idle' }],
  ['face_0', CLOSE, { view: 'face', focus: 0 }], ['face_1', CLOSE, { view: 'face', focus: 1 }],
  ['face_2', CLOSE, { view: 'face', focus: 2 }], ['face_3', CLOSE, { view: 'face', focus: 3 }],
  ['torso_1', CLOSE, { view: 'torso', focus: 1, clip: 'idle' }], ['torso_3', CLOSE, { view: 'torso', focus: 3, clip: 'idle' }],
  ['torso_0', CLOSE, { view: 'torso', focus: 0, clip: 'idle' }], ['torso_2', CLOSE, { view: 'torso', focus: 2, clip: 'idle' }],
  ['torso_3_l', CLOSE, { view: 'torso', focus: 3, clip: 'idle', yaw: 0.9 }], ['torso_3_r', CLOSE, { view: 'torso', focus: 3, clip: 'idle', yaw: -0.9 }],
  ['bind', WIDE, { view: 'front', clip: 'bind' }],
  ['side', WIDE, { view: 'front', clip: 'idle', yaw: Math.PI / 2 }],
  ['walk', WIDE, { view: 'threeq', clip: 'walk' }],
  ['sit', WIDE, { view: 'threeq', clip: 'sitIdle' }],
  ['wave', WIDE, { view: 'front', clip: 'wave' }], ['eat', WIDE, { view: 'threeq', clip: 'eat' }], ['dance', WIDE, { view: 'front', clip: 'dance' }], ['jog', WIDE, { view: 'threeq', clip: 'jog' }],
  ['live', [640, 360], { view: 'live', clip: 'idle' }],
  ['weight_up', WIDE, { view: 'front', clip: 'idle', morph: 'weight', v: 1 }],
  ['weight_down', WIDE, { view: 'front', clip: 'idle', morph: 'weight', v: -1 }],
  ['muscle_up', WIDE, { view: 'front', clip: 'idle', morph: 'muscle', v: 1 }],
  ['bust_up', WIDE, { view: 'threeq', clip: 'idle', morph: 'bust', v: 1 }],
  ['shoulders_belly', WIDE, { view: 'front', clip: 'idle', morph: 'belly', v: 1 }],
  ['hips_wide', WIDE, { view: 'front', clip: 'idle', morph: 'hips', v: 1 }],
];

const FACE_MORPHS = ['face_length', 'face_width', 'face_jaw_width', 'face_chin_length', 'face_chin_prominence', 'face_cheek_fullness', 'face_nose_width', 'face_nose_length',
  'face_eye_size', 'face_eye_spacing', 'face_lip_fullness', 'face_mouth_width', 'face_brow_height', 'face_smile'];
const TONES = [0, 5, 9, 15]; // porcelain, olive, amber, deep ebony
const SMALL = [520, 520];
for (const focus of [1, 3]) {
  for (const t of TONES) SHOTS.push([`tone_${focus}_${t}`, SMALL, { view: 'face', focus, tone: t, eye: t === 0 ? 6 : t === 5 ? 2 : t === 9 ? 1 : 0, wait: 500 }]);
  for (const m of FACE_MORPHS) for (const v of [-1, 1]) SHOTS.push([`fm_${focus}_${m}_${v < 0 ? 'm' : 'p'}`, SMALL, { view: 'face', focus, tone: 3, morphs: { [m]: v }, wait: 350 }]);
}
const GROUPS = { faces: ['face_0', 'face_1', 'face_2', 'face_3'], tones: SHOTS.filter((s) => s[0].startsWith('tone_')).map((s) => s[0]), facemorphs: SHOTS.filter((s) => s[0].startsWith('fm_3_')).map((s) => s[0]), facemorphs_f: SHOTS.filter((s) => s[0].startsWith('fm_1_')).map((s) => s[0]) };

async function waitForServer(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server at ${url} did not start`);
}

const ONLY = opt('only', '').split(',').filter(Boolean).flatMap((n) => GROUPS[n] ?? [n]);
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--config', join(root, 'dev/meshy/vite.lab.config.mjs'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser = null;
try {
  await waitForServer(`http://127.0.0.1:${PORT}/dev/mpfb.html`, 30000);
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 640 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/dev/mpfb.html?clean=1${EXTRA ? `&${EXTRA}` : ''}`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 180000 }).catch(async () => {
    console.log(`[shoot] not ready: ${await page.evaluate(() => document.getElementById('info')?.textContent)} errors=${errors.slice(0, 4).join(' | ')}`);
    throw new Error('page not ready');
  });
  for (const [name, vp, set] of SHOTS) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    const { wait, ...opts } = set;
    await page.evaluate((o) => window.lab.set({ morph: 'weight', v: 0, yaw: null, ...o }), opts);
    await page.waitForTimeout(wait ?? 1500);
    await page.screenshot({ path: join(OUT, `${name}.png`), timeout: 120000 });
    console.log(`[shoot] ${name}${errors.length ? `  console: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  }
} finally {
  await browser?.close();
  server.kill();
}
