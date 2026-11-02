#!/usr/bin/env node
// Screenshots of the character lab (dev/characters.html) on the MPFB bodies for named scenarios -> --out=DIR.
//   node dev/mpfb/shootLab.mjs [--plan=bodies|faces|outfits|hats|all] [--style=mpfb] [--out=DIR]
// Starts a vite dev server on port 5393 and runs Chromium (SwiftShader) under `flock /tmp/hearthside-browser.lock`
// (only one browser at a time on this machine). Do not wrap this script in another flock.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5393;
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

const STYLE = opt('style', 'mpfb');
const OUT = resolve(opt('out', join(here, 'game-shots', 'lab')));
const PLAN = opt('plan', 'all');
mkdirSync(OUT, { recursive: true });

// person indices of the lab: even = frame a (male), odd = frame b (female)
const SKINS = ['#f6e1d3', '#e8c39d', '#c68f60', '#95603b', '#4a2c1e'];
const TEE = ['tee-crew', 'jeans-straight', 'sneakers'];
const FULL = { vp: [700, 900] };
const CLOSE = { vp: [800, 800] };
const shots = [];
const shot = (name, base, o) => shots.push({ name, ...base, ...o });
const cam = { full: [0, 0.05, 5.2, 0.9, 30], three: [0.6, 0.1, 5.2, 0.9, 30], face: [0, 0.02, 1.5, 1.62, 24], faceThree: [0.55, 0.02, 1.5, 1.62, 24], torso: [0.4, 0.05, 2.8, 1.25, 28] };

if (['bodies', 'all'].includes(PLAN)) {
  for (const f of ['a', 'b']) {
    const p = f === 'a' ? 0 : 1;
    for (const [n, body] of [['build-1', { build: -1 }], ['build+1', { build: 1 }], ['muscle+1', { muscle: 1, shoulders: 0.6 }], ['waist-hips', { waist: -0.8, hips: 0.8, belly: 0.8 }], ['chest+1', { chest: 1 }], ['limbs', { arms: 1, legs: 1, neck: 1 }]]) {
      shot(`${f}_body_${n}`, FULL, { person: p, set: { frame: f, body, outfit: [] }, cam: cam.full });
      shot(`${f}_body_${n}_dressed`, FULL, { person: p, set: { frame: f, body, outfit: ['tee-crew', 'jeans-straight', 'sneakers'] }, cam: cam.three });
    }
  }
}
if (['faces', 'all'].includes(PLAN)) {
  for (const f of ['a', 'b']) {
    const p = f === 'a' ? 0 : 1;
    SKINS.forEach((skin, i) => shot(`${f}_face_tone${i}`, CLOSE, { person: p, set: { frame: f, skin, eyeColor: ['#5e3b1f', '#3d6fa8', '#4f7d4a', '#8a8f94', '#2a1a10'][i], hair: 'bob-chin', hairColor: ['#2b1d12', '#c9a050', '#7a3b1e', '#d8d3c8', '#111111'][i], freckles: i === 1 ? 0.8 : 0, blush: i === 2 ? 0.7 : 0.2, outfit: TEE }, cam: cam.face }));
    shot(`${f}_face_sliders`, CLOSE, { person: p, set: { frame: f, face: { faceWidth: 0.8, jawWidth: 0.6, chin: -0.6, noseLength: 0.7, noseWidth: 0.6, eyeSize: 0.8, eyeSpacing: 0.5, browHeight: 0.6, mouthWidth: 0.7, lipFullness: 0.8, earSize: 0.8, cheekbones: 0.5 }, outfit: TEE }, cam: cam.faceThree });
    shot(`${f}_face_sliders_neg`, CLOSE, { person: p, set: { frame: f, face: { faceWidth: -0.8, jawWidth: -0.6, chin: 0.6, noseLength: -0.7, noseWidth: -0.6, eyeSize: -0.8, eyeSpacing: -0.5, browHeight: -0.6, mouthWidth: -0.7, lipFullness: -0.8, earSize: -0.8, cheekbones: -0.5 }, outfit: TEE }, cam: cam.faceThree });
    shot(`${f}_face_lips`, CLOSE, { person: p, set: { frame: f, outfit: TEE, facial: f === 'a' ? 'stubble' : null }, cam: cam.face });
  }
}
if (['faceeach', 'all'].includes(PLAN)) {
  const ids = ['faceLength', 'faceWidth', 'jawWidth', 'chin', 'cheeks', 'cheekbones', 'noseWidth', 'noseLength', 'noseBridge', 'lipFullness', 'mouthWidth', 'earSize', 'eyeSize', 'eyeSpacing', 'eyeTilt', 'eyeHeight', 'browHeight', 'browTilt'];
  for (const id of ids) for (const sign of [1, -1]) shot(`b_each_${id}${sign > 0 ? '+' : '-'}`, { vp: [500, 500] }, { person: 1, set: { frame: 'b', face: { [id]: sign }, outfit: TEE, hair: 'buzz' }, cam: cam.faceThree });
}
if (PLAN === 'layers') {
  for (const f of ['a', 'b']) for (const [n, o] of [['wrapdress_denim', ['wrap-dress', 'ballet-flats', 'denim-jacket']], ['hoodie_denim', ['hoodie', 'jeans-straight', 'sneakers', 'denim-jacket']], ['tee_blazer', ['tee-crew', 'trousers-tailored', 'loafers', 'blazer']], ['dress_trench', ['sundress', 'ballet-flats', 'trench-coat']]]) {
    shot(`${f}_layers_${n}`, FULL, { person: f === 'a' ? 0 : 1, set: { frame: f, outfit: o }, cam: cam.full });
    shot(`${f}_layers_${n}_three`, FULL, { person: f === 'a' ? 0 : 1, set: { frame: f, outfit: o }, cam: cam.three });
  }
}
if (['outfits', 'all'].includes(PLAN)) {
  const outs = [['sundress', 'sandals-slide'], ['blouse', 'pencil-skirt', 'pumps', 'blazer'], ['hoodie', 'chinos', 'running-shoes'], ['swimsuit'], ['swim-trunks', 'sandals-slide'], ['suit', 'loafers'], ['tank-top', 'shorts-casual', 'sneakers'], ['crop-top', 'bike-shorts', 'running-shoes'], ['maxi-dress', 'ballet-flats', 'cardigan'], ['turtleneck', 'wide-leg-trousers', 'ballet-flats', 'trench-coat'], ['nightgown', 'slippers'], ['jumpsuit', 'pumps']];
  for (const f of ['a', 'b']) {
    const p = f === 'a' ? 0 : 1;
    outs.forEach((o, i) => shot(`${f}_outfit_${i}_${o[0]}`, FULL, { person: p, set: { frame: f, outfit: o }, cam: i % 2 ? cam.three : cam.full }));
    shot(`${f}_outfit_top_only`, FULL, { person: p, set: { frame: f, outfit: ['tee-crew'] }, cam: cam.full });
    shot(`${f}_outfit_bottom_only`, FULL, { person: p, set: { frame: f, outfit: ['jeans-straight'] }, cam: cam.full });
    shot(`${f}_torso_dressed_chest`, CLOSE, { person: p, set: { frame: f, outfit: ['tee-crew', 'jeans-straight'], body: { chest: 0.8, shoulders: 0.8, build: 0.5 } }, cam: cam.torso });
  }
}
if (['hats', 'all'].includes(PLAN)) {
  const hats = ['beanie', 'cap', 'sunhat', 'headband', 'scarf', 'necklace-pearls'];
  const hairs = ['bob-chin', 'crop-side-part', 'afro-coily', 'long-straight', 'ponytail-high', 'bun-top'];
  for (const f of ['a', 'b']) {
    const p = f === 'a' ? 0 : 1;
    hairs.forEach((h, i) => shot(`${f}_hair_${h}`, CLOSE, { person: p, set: { frame: f, hair: h, hairColor: ['#5b3824', '#c9a050', '#111111', '#7a3b1e', '#8a2a1a', '#d8d3c8'][i], outfit: TEE }, cam: i % 2 ? cam.faceThree : cam.face }));
    hats.forEach((h) => shot(`${f}_hat_${h}`, CLOSE, { person: p, set: { frame: f, hair: 'bob-chin', outfit: TEE, accessories: [h] }, cam: cam.faceThree }));
  }
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
  if (PLAN === 'leaks') {
    // rebuilding people and switching the style back and forth must not grow the GPU resources held
    const ctx = await browser.newContext({ viewport: { width: 500, height: 500 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${PORT}/dev/characters.html?n=6&style=mpfb&shadows=0`);
    await page.waitForFunction(() => window.ready === true, null, { timeout: 240000 });
    const mem = async (label) => { await page.evaluate(() => window.lab.step(0.05, 2)); await page.waitForTimeout(300); const m = await page.evaluate(() => window.lab.memory()); console.log(`[leaks] ${label}: ${JSON.stringify(m)}`); return m; };
    const m0 = await mem('after load');
    for (let k = 0; k < 12; k++) await page.evaluate((k) => { for (let i = 0; i < 6; i++) window.lab.swapFrame(i); }, k);
    const m1 = await mem('after 72 rebuilds');
    for (const st of ['detailed', 'mpfb', 'classic', 'mpfb']) { const r = await page.evaluate((s) => window.lab.style(s), st); await mem(`style ${st} -> ${r}`); }
    for (let k = 0; k < 6; k++) await page.evaluate(() => { for (let i = 0; i < 6; i++) window.lab.swapFrame(i); });
    const m2 = await mem('after switching and rebuilding');
    console.log(`[leaks] geometries ${m0.geometries} -> ${m1.geometries} -> ${m2.geometries}; textures ${m0.textures} -> ${m1.textures} -> ${m2.textures}; errors ${errors.length}${errors.length ? ' ' + errors.slice(0, 2).join(' | ') : ''}`);
    await ctx.close();
    process.exitCode = 0;
  }
  const groups = new Map();
  for (const s of shots) { const k = `${s.vp[0]}x${s.vp[1]}`; (groups.get(k) ?? groups.set(k, []).get(k)).push(s); }
  for (const list of groups.values()) {
    const { vp } = list[0];
    const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${PORT}/dev/characters.html?n=4&style=${STYLE}&shadows=0`);
    await page.waitForFunction(() => window.ready === true, null, { timeout: 240000 });
    await page.addStyleTag({ content: '#bar,#info{display:none!important}' });
    for (const s of list) {
      await page.evaluate(([sh]) => {
        const lab = window.lab;
        lab.only([sh.person]);
        lab.place(sh.person, 0, 0, 0);
        lab.set(sh.person, sh.set);
        lab.playOne(sh.person, 'idle');
        lab.step(0.05, 6);
        lab.orthoCam(false);
        const c = sh.cam;
        lab.cam(c[0], c[1], c[2], 0, c[3], 0, c[4]);
      }, [s]);
      await page.waitForTimeout(300);
      const file = join(OUT, `${s.name}.png`);
      try { await page.screenshot({ path: file, timeout: 120000 }); } catch { await page.waitForTimeout(2000); await page.screenshot({ path: file, timeout: 120000 }); }
      console.log(`[lab] ${s.name}${errors.length ? `  ERRORS: ${errors.slice(0, 2).join(' | ')}` : ''}`);
    }
    await ctx.close();
  }
} finally {
  await browser?.close();
  server.kill();
}
