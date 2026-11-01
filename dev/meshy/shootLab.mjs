#!/usr/bin/env node
// Screenshots of the character lab (dev/characters.html) in either character style -> --out=DIR (default dev/meshy/shots/lab).
//   node dev/meshy/shootLab.mjs [--style=detailed|classic] [--plan=basic|creator|close|live|all] [--out=DIR] [--bench]
// Starts a vite dev server on port 5392 and runs Chromium (SwiftShader) under `flock /tmp/hearthside-browser.lock`
// (only one browser at a time on this machine). Do not wrap this script in another flock.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5392;
const args = process.argv.slice(2);
const opt = (name, def) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };

if (!process.env.LAB_SHOOT_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...args], { stdio: 'inherit', env: { ...process.env, LAB_SHOOT_LOCKED: '1' } });
  process.exit(r.status ?? 1);
}

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of [join(root, 'node_modules'), '/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try { return require(require.resolve('playwright', { paths: [p] })); } catch { /* next */ }
  }
  throw new Error('playwright is not installed');
}

const STYLE = opt('style', 'detailed');
const OUT = resolve(opt('out', join(here, 'shots', 'lab')));
const PLAN = opt('plan', 'basic');
mkdirSync(OUT, { recursive: true });

// ---- scenarios -------------------------------------------------------------------------------------------------
// person indices of the lab: even = frame a (male), odd = frame b (female)
const SKINS = ['#f6e1d3', '#e8c39d', '#c68f60', '#95603b', '#4a2c1e'];
const TEE = ['tee-crew', 'jeans-straight', 'sneakers'];
const LIVE = { vp: [320, 240], dpr: 2 };
const CLOSE = { vp: [800, 800], dpr: 1 };
const FULL = { vp: [700, 900], dpr: 1 };
/** shot(name, base, {person, set, anim, posture, steps, cam: [yaw, pitch, dist, ty, fov], ortho: height}) */
const shots = [];
const shot = (name, base, o) => shots.push({ name, ...base, ...o });
const solo = (frame) => (frame === 'a' ? 0 : 1);
const front = (dist, ty, fov = 30) => [0, 0.05, dist, ty, fov];

if (['basic', 'all'].includes(PLAN)) {
  for (const f of ['a', 'b']) {
    shot(`${f}_full_front`, FULL, { person: solo(f), set: { outfit: TEE, hair: f === 'a' ? 'crop-side-part' : 'bob-chin' }, cam: front(5.2, 0.9) });
    shot(`${f}_full_three`, FULL, { person: solo(f), cam: [0.7, 0.1, 5.2, 0.9, 30] });
    shot(`${f}_full_back`, FULL, { person: solo(f), cam: [Math.PI, 0.1, 5.2, 0.9, 30] });
    shot(`${f}_bare_front`, FULL, { person: solo(f), set: { outfit: [] }, cam: front(5.2, 0.9) });
    shot(`${f}_bare_back`, FULL, { person: solo(f), cam: [Math.PI, 0.1, 5.2, 0.9, 30] });
  }
}
if (['close', 'all'].includes(PLAN)) {
  for (const f of ['a', 'b']) {
    shot(`${f}_face_front`, CLOSE, { person: solo(f), set: { outfit: TEE, hair: 'none' }, cam: front(1.1, 1.62, 28) });
    shot(`${f}_face_three`, CLOSE, { person: solo(f), cam: [0.7, 0.05, 1.1, 1.62, 28] });
    shot(`${f}_face_side`, CLOSE, { person: solo(f), cam: [1.57, 0.05, 1.1, 1.62, 28] });
    shot(`${f}_face_hair`, CLOSE, { person: solo(f), set: { outfit: TEE, hair: f === 'a' ? 'crop-side-part' : 'long-straight' }, cam: [0.5, 0.05, 1.3, 1.6, 28] });
    shot(`${f}_feet`, CLOSE, { person: solo(f), set: { outfit: [], hair: 'none' }, cam: [0.4, 0.25, 1.6, 0.1, 30] });
    shot(`${f}_hands`, CLOSE, { person: solo(f), cam: [0, 0.2, 1.8, 0.85, 30] });
  }
}
if (['creator', 'all'].includes(PLAN)) {
  const OUTFITS = [['tee-crew', 'jeans-straight', 'sneakers'], ['sundress', 'sandals-slide'], ['tank-top', 'shorts-casual', 'sneakers'], ['pajama-top', 'pajama-pants', 'slippers'], ['swimsuit'], ['swim-trunks', 'sandals-slide'], ['sweater-knit', 'skirt-aline', 'boots-ankle'], ['overalls', 'boots-ankle'], ['dress-shirt', 'trousers-tailored', 'loafers'], ['nightgown', 'slippers'], ['tee-long', 'joggers', 'sneakers', 'jacket-zip'], ['polo-shirt', 'shorts-casual', 'loafers']];
  OUTFITS.forEach((o, k) => {
    for (const f of ['a', 'b']) shot(`${f}_outfit${String(k).padStart(2, '0')}_${o[0]}`, FULL, { person: solo(f), set: { outfit: o, hair: k % 2 ? 'ponytail-high' : 'crop-side-part', skin: SKINS[k % SKINS.length] }, cam: k % 2 ? [0.5, 0.1, 5.2, 0.9, 30] : front(5.2, 0.9) });
  });
  SKINS.forEach((s, k) => { for (const f of ['a', 'b']) shot(`${f}_skin${k}`, CLOSE, { person: solo(f), set: { skin: s, outfit: TEE, hair: 'crop-side-part', eyeColor: ['#4f7fb0', '#5e3b1f', '#4c7a4b', '#7a6a50', '#3b3b3b'][k] }, cam: [0.3, 0.05, 1.7, 1.45, 28] }); });
  const HAIRS = ['crop-side-part', 'curly-top', 'bob-chin', 'long-straight', 'ponytail-high', 'afro-coily', 'bun-top', 'braids-twin'];
  HAIRS.forEach((h, k) => { for (const f of ['a', 'b']) shot(`${f}_hair${k}_${h}`, CLOSE, { person: solo(f), set: { hair: h, outfit: TEE, skin: SKINS[1], hairColor: ['#3d2a1f', '#1c1713', '#a26a3b', '#d9b26a'][k % 4], facial: f === 'a' && k % 3 === 1 ? 'stubble' : null }, cam: [0.55, 0.08, 1.9, 1.5, 28] }); });
  const SL = { build: 1, muscle: 1, shoulders: 1, chest: 1, waist: -1, belly: 1, hips: 1, arms: 1, legs: 1, neck: 1 };
  for (const [name, v] of [['plus', 1], ['minus', -1]]) for (const f of ['a', 'b']) {
    const body = Object.fromEntries(Object.keys(SL).map((id) => [id, v]));
    shot(`${f}_body_${name}`, FULL, { person: solo(f), set: { body, outfit: TEE, hair: 'crop-side-part' }, cam: front(5.2, 0.9) });
    shot(`${f}_body_${name}_bare`, FULL, { person: solo(f), set: { body, outfit: [] }, cam: front(5.2, 0.9) });
  }
  for (const f of ['a', 'b']) shot(`${f}_face_sliders`, CLOSE, { person: solo(f), set: { body: {}, face: { faceLength: 1, faceWidth: 1, jawWidth: 1, chin: 1, cheeks: 1, noseWidth: 1, noseLength: 1, lipFullness: 1 }, freckles: 0.9, blush: 0.9, outfit: TEE, hair: 'none', facial: null }, cam: front(1.1, 1.62, 28) });
}
if (['hairside', 'all'].includes(PLAN)) {
  for (const h of ['ponytail-high', 'long-straight', 'braids-twin', 'bob-chin']) for (const f of ['a', 'b']) shot(`${f}_side_${h}`, { vp: [600, 700], dpr: 1 }, { person: solo(f), set: { hair: h, outfit: TEE, hairColor: '#7a4a2a' }, cam: [1.57, 0.08, 3.2, 1.25, 28] });
}
if (['hair', 'hairlive'].includes(PLAN)) {
  // every hairstyle on both frames: close views (front / three-quarter / side / back) or game distance (walk, sit)
  const ids = (opt('hairs', '') || 'buzz,crop-side-part,curly-top,bob-chin,waves-shoulder,long-straight,ponytail-high,bun-top,afro-coily,braids-twin').split(',');
  const COLORS = ['#6b4528', '#2b221e', '#c8a064', '#7c3a22', '#3d2a1f'];
  const closeVp = { vp: [420, 520], dpr: 1 };
  ids.forEach((h, k) => {
    for (const f of ['a', 'b']) {
      const set = { hair: h, outfit: TEE, hairColor: COLORS[k % COLORS.length], facial: null };
      if (PLAN === 'hair') {
        for (const [v, yaw] of [['front', 0], ['three', 0.7], ['side', 1.57], ['back', Math.PI]]) shot(`${f}_h_${h}_${v}`, closeVp, { person: solo(f), set, cam: [yaw, 0.08, 1.55, 1.58, 28] });
        shot(`${f}_h_${h}_drape`, closeVp, { person: solo(f), set, cam: [Math.PI - 0.6, 0.1, 2.3, 1.4, 28] });
      } else {
        shot(`${f}_hl_${h}_walk`, LIVE, { person: solo(f), set, anim: 'walk', steps: [0.05, 8], ortho: 2.6 });
        shot(`${f}_hl_${h}_sit`, LIVE, { person: solo(f), set, anim: 'sitIdle', posture: 'seated', steps: [0.05, 6], ortho: 2.6 });
      }
    }
  });
}
const BENCH = PLAN === 'bench';
const MEASURE = PLAN === 'measure';
if (['live', 'all'].includes(PLAN)) {
  for (const f of ['a', 'b']) for (const [anim, posture, n] of [['idle', undefined, 6], ['walk', undefined, 8], ['sitIdle', 'seated', 6], ['sleep', 'lying', 4], ['eat', undefined, 10]]) {
    shot(`${f}_live_${anim}`, LIVE, { person: solo(f), set: { outfit: TEE, hair: f === 'a' ? 'crop-side-part' : 'bob-chin', body: {} }, anim, posture, steps: [0.05, n], ortho: 2.6 });
  }
  shot('a_live_idle_k2', { vp: [640, 480], dpr: 2 }, { person: 0, anim: 'idle', steps: [0.05, 4], ortho: 2.6 });
}

// ---- run -------------------------------------------------------------------------------------------------------
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

const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--config', join(here, 'vite.lab.config.mjs'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser = null;
try {
  await waitForServer(`http://127.0.0.1:${PORT}/dev/characters.html`, 30000);
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  scope: {
  if (BENCH || MEASURE) {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 240 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/dev/characters.html?n=14&style=${STYLE}&shadows=0`);
    await page.waitForFunction(() => window.ready === true, null, { timeout: 240000 });
    if (BENCH) {
      for (const n of [1, 2, 8, 14]) console.log(`[bench] ${STYLE} x${n}: ${JSON.stringify(await page.evaluate((nn) => window.lab.bench(nn, 16), n))}`);
    } else {
      for (const i of [0, 1]) for (const [anim, posture] of [['idle'], ['sitIdle', 'seated'], ['sleep', 'lying']]) {
        const r = await page.evaluate(([ii, a, p]) => { window.lab.place(ii, 0, 0, 0); window.lab.playOne(ii, a, p); window.lab.step(0.05, 60); return window.lab.measure(ii); }, [i, anim, posture]);
        console.log(`[measure] ${STYLE} person ${i} ${anim}: ${JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +v.toFixed(3)])))}`);
      }
    }
    await ctx.close();
    break scope;
  }
  const groups = new Map();
  for (const s of shots) { const k = `${s.vp[0]}x${s.vp[1]}@${s.dpr}`; (groups.get(k) ?? groups.set(k, []).get(k)).push(s); }
  for (const list of groups.values()) {
    const { vp, dpr } = list[0];
    const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${PORT}/dev/characters.html?n=14&style=${STYLE}&shadows=0`);
    await page.waitForFunction(() => window.ready === true, null, { timeout: 240000 });
    await page.addStyleTag({ content: '#bar,#info{display:none!important}' });
    for (const s of list) {
      await page.evaluate(([sh]) => {
        const lab = window.lab;
        lab.only([sh.person]);
        lab.place(sh.person, 0, 0, 0);
        if (sh.set) lab.set(sh.person, sh.set);
        lab.playOne(sh.person, sh.anim ?? 'idle', sh.posture);
        lab.step(0.05, 2);
        if (sh.steps) lab.step(sh.steps[0], sh.steps[1]);
        if (sh.ortho) lab.orthoCam(true, sh.ortho); else lab.orthoCam(false);
        const c = sh.cam ?? [0, 0.05, 5.2, 0.9, 30];
        lab.cam(c[0], c[1], sh.ortho ? 12 : c[2], 0, sh.ortho ? 0.9 : c[3], 0, c[4]);
      }, [s]);
      await page.waitForTimeout(350);
      const file = join(OUT, `${STYLE}_${s.name}.png`);
      try { await page.screenshot({ path: file, timeout: 120000 }); } catch { await page.waitForTimeout(2000); await page.screenshot({ path: file, timeout: 120000 }); }
      console.log(`[lab] ${STYLE}_${s.name}${errors.length ? `  ERRORS: ${errors.slice(0, 2).join(' | ')}` : ''}`);
    }
    await ctx.close();
  }
  }
} finally {
  await browser?.close();
  server.kill();
}
