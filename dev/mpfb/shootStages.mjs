#!/usr/bin/env node
// Screenshots of the life-stage bodies in the character lab (dev/characters.html?style=mpfb, window.lab.scene) -> raw PNGs in
// dev/mpfb/shots/raw (gitignored); node dev/mpfb/composeStages.mjs turns them into the small JPGs that are kept in dev/mpfb/shots.
//   node dev/mpfb/shootStages.mjs [--plan=lineup|faces|sit|walk|held|measure|all] [--out=DIR]
// Starts a vite dev server on port 5394 and runs Chromium (SwiftShader) under `flock /tmp/hearthside-browser.lock`
// (one browser at a time on this machine). Do not wrap this script in another flock.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5394;
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
const PLAN = opt('plan', 'all');
const ONLY = opt('only', '');
// the character style of the lab: mpfb (the stage bodies) or classic / detailed (the adult rig scaled to the stage's height)
const STYLE = opt('style', 'mpfb');
mkdirSync(OUT, { recursive: true });

const STAGES = ['baby', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'];
const HEIGHT = { baby: 0.68, toddler: 0.93, child: 1.28, teen: 1.63, youngAdult: 1.8, adult: 1.8, elder: 1.71 };
// everyday clothes by stage and sex (frame a = male, b = female)
const CLOTHES = {
  a: { baby: [], toddler: ['tee-crew', 'shorts-casual', 'sneakers'], child: ['tee-crew', 'shorts-casual', 'sneakers'], teen: ['hoodie', 'jeans-straight', 'sneakers'],
    youngAdult: ['tee-crew', 'jeans-straight', 'sneakers'], adult: ['shirt-button', 'trousers-tailored', 'loafers'], elder: ['sweater-knit', 'trousers-tailored', 'loafers'] },
  b: { baby: [], toddler: ['sundress', 'sandals-slide'], child: ['tee-crew', 'skirt-aline', 'sneakers'], teen: ['hoodie', 'leggings', 'sneakers'],
    youngAdult: ['tee-crew', 'jeans-straight', 'sneakers'], adult: ['blouse', 'pencil-skirt', 'pumps'], elder: ['cardigan', 'wide-leg-trousers', 'ballet-flats'] },
};
const SKINS = ['#f6e1d3', '#e8c39d', '#c68f60', '#95603b', '#4a2c1e'];
const row = (frame, o = {}) => STAGES.map((stage, k) => ({ stage, frame, x: (k - 3) * 1.15, outfit: o.dressed === false ? [] : CLOTHES[frame][stage], look: k + (frame === 'b' ? 7 : 0), skin: SKINS[(k + (frame === 'b' ? 2 : 0)) % 5], upright: stage === 'baby', ...o.each?.(stage, k) }));

const shots = [];
const shot = (name, vp, specs, cam, extra = {}) => shots.push({ name, vp, specs, cam, ...extra });
// cam: [yaw, pitch, distance, targetY, fov, targetX]
const WIDE = [0, 0.04, 6.4, 0.9, 30, 0];
const ALL = PLAN === 'all';

if (ALL || PLAN === 'lineup') {
  for (const frame of ['a', 'b']) {
    shot(`lineup_${frame}_dressed`, [1500, 560], row(frame), WIDE);
    shot(`lineup_${frame}_undressed`, [1500, 560], row(frame, { dressed: false }), WIDE);
    shot(`lineup_${frame}_undressed_side`, [1500, 560], row(frame, { dressed: false, each: () => ({ yaw: Math.PI / 2 }) }), WIDE);
    shot(`lineup_${frame}_back`, [1500, 560], row(frame, { each: () => ({ yaw: Math.PI }) }), [0, 0.04, 6.4, 0.9, 30, 0]);
  }
}
if (ALL || PLAN === 'faces') {
  for (const frame of ['a', 'b']) {
    shot(`faces_${frame}`, [1500, 360], row(frame, { each: () => ({ alignHead: 1.65 }) }).map((s, k) => ({ ...s, x: (k - 3) * 0.55 })), [0, 0.0, 2.9, 1.52, 24, 0], { faces: true });
  }
}
if (ALL || PLAN === 'sit') {
  for (const frame of ['a', 'b']) {
    // babies do not sit on chairs: the lineup shows them on the floor, upright
    const specs = row(frame, { each: (stage) => (stage === 'baby' ? { posture: 'standing', upright: true } : { posture: 'seated', anim: 'sitIdle', seat: 0.45, yaw: 0.5 }) });
    shot(`sit_${frame}`, [1500, 560], specs, [0.35, 0.1, 6.4, 0.7, 30, 0]);
    shot(`sit_${frame}_side`, [1500, 560], specs.map((s) => ({ ...s, yaw: Math.PI / 2 })), [0, 0.04, 6.4, 0.7, 30, 0]);
  }
}
if (ALL || PLAN === 'walk') {
  for (const frame of ['a', 'b']) {
    shot(`walk_${frame}`, [1500, 560], row(frame, { each: (stage, k) => ({ anim: stage === 'baby' ? 'idle' : 'walk', yaw: 0.6, steps: 2 + k * 0.3 }) }), [0.25, 0.08, 6.4, 0.9, 30, 0]);
    shot(`walk_${frame}_side`, [1500, 560], row(frame, { each: (stage, k) => ({ anim: stage === 'baby' ? 'idle' : 'walk', yaw: Math.PI / 2, steps: 1.2 + k * 0.4 }) }), [0, 0.04, 6.4, 0.9, 30, 0]);
  }
}
if (ALL || PLAN === 'held') {
  const held = (carrierFrame, carrierStage, babyFrame = 'b') => [
    { stage: carrierStage, frame: carrierFrame, x: 0, outfit: CLOTHES[carrierFrame][carrierStage], look: 3, anim: 'idle' },
    { stage: 'baby', frame: babyFrame, x: 0, outfit: [], look: 5, heldBy: 0, posture: 'lying', anim: 'idle' },
  ];
  for (const [name, specs] of [['held_f', held('b', 'adult')], ['held_m', held('a', 'adult')], ['held_teen', held('b', 'teen')]]) {
    shot(`${name}_front`, [640, 700], specs.map((s) => ({ ...s, yaw: 0.3 })), [0, 0.05, 4.2, 1.0, 30, 0]);
    shot(`${name}_side`, [640, 700], specs.map((s) => ({ ...s, yaw: Math.PI / 2 })), [0, 0.05, 4.2, 1.0, 30, 0]);
    shot(`${name}_walk`, [640, 700], specs.map((s, k) => ({ ...s, yaw: 0.5, anim: k === 0 ? 'walk' : 'idle', steps: 2.3 })), [0.2, 0.15, 4.2, 1.0, 30, 0]);
  }
  shot('crib_baby', [640, 700], [{ stage: 'baby', frame: 'b', x: 0, outfit: [], look: 5, posture: 'lying', seat: 0.45, yaw: 0.0, anim: 'sleep' }], [0.7, 0.75, 3.0, 0.6, 30, 0]);
  shot('crib_baby_top', [640, 700], [{ stage: 'baby', frame: 'a', x: 0, outfit: [], look: 2, posture: 'lying', seat: 0.45, yaw: 0.0, anim: 'sleep' }], [0.0, 1.2, 3.0, 0.6, 30, 0]);
  shot('crib_baby_dressed', [640, 700], [{ stage: 'baby', frame: 'b', x: 0, outfit: ['pajama-top', 'pajama-pants'], look: 5, posture: 'lying', seat: 0.45, yaw: 0.0, anim: 'sleep' }], [0.7, 0.75, 3.0, 0.6, 30, 0]);
  shot('bed_child', [640, 700], [{ stage: 'child', frame: 'a', x: 0, outfit: ['pajama-top', 'pajama-pants'], look: 3, posture: 'lying', seat: 0.5, yaw: 0.0, anim: 'sleep' }], [0.7, 0.5, 4.6, 0.7, 30, 0]);
  shot('bed_elder', [640, 700], [{ stage: 'elder', frame: 'b', x: 0, outfit: ['nightgown'], look: 3, posture: 'lying', seat: 0.5, yaw: 0.0, anim: 'sleep' }], [0.7, 0.5, 4.6, 0.7, 30, 0]);
}
if (ALL || PLAN === 'single') {
  // one person per shot (every stage and sex, dressed and undressed): the camera frames the person's height
  for (const frame of ['a', 'b']) for (const stage of STAGES) for (const dressed of [true, false]) {
    const h = stage === 'baby' ? 0.5 : HEIGHT[stage];
    const spec = { stage, frame, x: 0, outfit: dressed ? CLOTHES[frame][stage] : [], look: STAGES.indexOf(stage) + (frame === 'b' ? 7 : 0), skin: SKINS[(STAGES.indexOf(stage) + (frame === 'b' ? 2 : 0)) % 5], upright: stage === 'baby' };
    shot(`single_${frame}_${stage}_${dressed ? 'dressed' : 'undressed'}`, [360, 520], [spec], [0.5, 0.05, h * 2.5, h * 0.5, 30, 0]);
  }
}
if (PLAN === 'measure') {
  // seated and lying anchors of every stage body (written to dev/mpfb/out/stage-anchors.json)
}

function waitForServer(url, ms) {
  return (async () => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try { const r = await fetch(url); if (r.ok) return; } catch { /* not yet */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`server at ${url} did not start`);
  })();
}

const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--config', join(root, 'dev/meshy/vite.lab.config.mjs'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser = null;
try {
  await waitForServer(`http://127.0.0.1:${PORT}/dev/characters.html`, 30000);
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  if (PLAN === 'measure') {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${PORT}/dev/characters.html?n=2&style=mpfb&shadows=0`);
    await page.waitForFunction(() => window.ready === true, null, { timeout: 240000 });
    await page.evaluate((st) => window.lab.preload(st), STAGES);
    const result = await page.evaluate(async ({ stages }) => {
      const lab = window.lab;
      const out = { seated: {}, lying: {} };
      for (const stage of stages) for (const frame of stage === 'baby' ? ['b'] : ['a', 'b']) {
        const m = {};
        for (const [label, anim, posture] of [['seated', 'sitIdle', 'seated'], ['lying', 'sleep', 'lying']]) {
          lab.scene([{ stage, frame, x: 0, outfit: [], anim, posture: 'standing', upright: false }]);
          lab.playOne(0, anim, posture);
          lab.step(0.05, 30);
          m[label] = lab.measure(0, lab.pelvisRatio(0));
        }
        const r = (v) => Math.round(v * 1000) / 1000;
        (out.seated[stage] ??= {})[frame] = { seatHeight: r(m.seated.seatY), seatZ: r(m.seated.seatZ) };
        const l = m.lying;
        const lying = { backY: r(l.seatY), centerZ: r((l.maxZ + l.minZ) / 2), length: r(l.maxZ - l.minZ) };
        if (!out.lying[stage] || frame === 'b') out.lying[stage] = lying;
      }
      return out;
    }, { stages: STAGES.filter((s) => s !== 'youngAdult') });
    writeFileSync(join(root, 'dev/mpfb/out/stage-anchors.json'), JSON.stringify(result, null, 1));
    console.log(JSON.stringify(result, null, 1));
    await ctx.close();
  }
  const groups = new Map();
  for (const s of shots) { const k = `${s.vp[0]}x${s.vp[1]}`; (groups.get(k) ?? groups.set(k, []).get(k)).push(s); }
  for (const list of groups.values()) {
    const { vp } = list[0];
    const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${PORT}/dev/characters.html?n=${Math.max(2, ...list.map((x) => x.specs.length))}&style=${STYLE}&shadows=1`);
    await page.waitForFunction(() => window.ready === true, null, { timeout: 240000 });
    await page.addStyleTag({ content: '#bar,#info{display:none!important}' });
    await page.evaluate((st) => window.lab.preload(st), STAGES);
    for (const s of list) {
      if (ONLY && !s.name.includes(ONLY)) continue;
      await page.evaluate(([sh]) => {
        const lab = window.lab;
        lab.scene(sh.specs);
        sh.specs.forEach((sp, k) => { if (sp.steps) lab.stepOne?.(k, sp.steps); });
        lab.step(0.05, 2);
        lab.orthoCam(false);
        const c = sh.cam;
        lab.cam(c[0], c[1], c[2], c[5] ?? 0, c[3], 0, c[4]);
      }, [s]);
      await page.waitForTimeout(250);
      const file = join(OUT, `${STYLE === 'mpfb' ? '' : `${STYLE}_`}${s.name}.png`);
      try { await page.screenshot({ path: file, timeout: 120000 }); } catch { await page.waitForTimeout(2000); await page.screenshot({ path: file, timeout: 120000 }); }
      console.log(`[stages] ${s.name}`);
    }
    await ctx.close();
  }
  if (errors.length) console.log(`[stages] ${errors.length} console errors, first: ${errors.slice(0, 3).join(' | ')}`);
} finally {
  await browser?.close();
  server.kill();
}
