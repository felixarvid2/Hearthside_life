#!/usr/bin/env node
// Garment gallery of the character lab (dev/characters.html): every garment on both frames, front and three-quarter,
// framed for its layer, plus contact sheets. Used to judge clothing on the scanned bodies.
//   node dev/meshy/shootGarments.mjs [--tag=NAME] [--style=detailed|classic] [--ids=a,b,c] [--plan=gallery|live|bare]
// Output: dev/meshy/shots/garments/<tag>/ (single shots + sheet_*.png). Takes /tmp/hearthside-browser.lock itself.
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
const sharp = require(require.resolve('sharp', { paths: [join(root, 'node_modules')] }));

const STYLE = opt('style', 'detailed');
const TAG = opt('tag', 'current');
const PLAN = opt('plan', 'gallery');
const OUT = resolve(here, 'shots', 'garments', TAG);
mkdirSync(OUT, { recursive: true });

const TOPS = ['tee-crew', 'tee-long', 'tank-top', 'shirt-button', 'polo-shirt', 'sweater-knit', 'pajama-top', 'jacket-zip'];
const BOTTOMS = ['jeans-straight', 'trousers-tailored', 'shorts-casual', 'joggers', 'skirt-aline', 'pajama-pants', 'swim-trunks'];
const FULLS = ['sundress', 'dress-shirt', 'overalls', 'swimsuit', 'nightgown'];
const SHOES = ['sneakers', 'boots-ankle', 'loafers', 'slippers', 'sandals-slide'];
const ALL = [...TOPS, ...BOTTOMS, ...FULLS, ...SHOES];
const ids = opt('ids', '') ? opt('ids', '').split(',') : ALL;
const layerOf = (id) => (TOPS.includes(id) ? 'top' : BOTTOMS.includes(id) ? 'bottom' : FULLS.includes(id) ? 'full' : 'shoe');
const outfitOf = (id) => {
  switch (layerOf(id)) {
    case 'top': return id === 'jacket-zip' ? ['tee-crew', id, 'jeans-straight', 'sneakers'] : [id, 'jeans-straight', 'sneakers'];
    case 'bottom': return ['tee-crew', id, 'sneakers'];
    case 'full': return id === 'overalls' ? [id, 'boots-ankle'] : [id, 'sandals-slide'];
    default: return ['tee-crew', 'jeans-straight', id];
  }
};
// [yaw, pitch, dist, ty] per layer: tops close on the torso, bottoms on the hips and legs, full outfits head to toe, shoes on the feet
const FRAMING = { top: [2.3, 1.28], bottom: [3.0, 0.7], full: [4.3, 0.92], shoe: [1.7, 0.14] };
const VIEWS = [['front', 0.0], ['three', 0.7]];

function waitForServer(url, ms) {
  return (async () => {
    const end = Date.now() + ms;
    while (Date.now() < end) { try { const r = await fetch(url); if (r.ok) return; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 250)); }
    throw new Error(`server at ${url} did not start`);
  })();
}

const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--config', join(here, 'vite.lab.config.mjs'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser = null;
try {
  await waitForServer(`http://127.0.0.1:${PORT}/dev/characters.html`, 30000);
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const W = 420, H = 560;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/dev/characters.html?n=2&style=${STYLE}&shadows=0`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 240000 });
  await page.addStyleTag({ content: '#bar,#info{display:none!important}' });
  const shoot = async (file) => { try { await page.screenshot({ path: file, timeout: 120000 }); } catch { await page.waitForTimeout(2000); await page.screenshot({ path: file, timeout: 120000 }); } };
  const files = {};
  if (PLAN === 'gallery') {
    for (const id of ids) {
      for (const f of ['a', 'b']) {
        const person = f === 'a' ? 0 : 1;
        const [dist, ty] = FRAMING[layerOf(id)];
        for (const [vn, yaw] of VIEWS) {
          await page.evaluate(([p, o, y, d, t]) => {
            const lab = window.lab;
            lab.only([p]); lab.place(p, 0, 0, 0);
            lab.set(p, { outfit: o, hair: 'none', skin: '#e8c39d' });
            lab.playOne(p, 'idle'); lab.step(0.05, 4);
            lab.orthoCam(false);
            lab.cam(y, 0.08, d, 0, t, 0, 30);
          }, [person, outfitOf(id), yaw, dist, ty]);
          await page.waitForTimeout(120);
          const name = `${id}_${f}_${vn}.png`;
          await shoot(join(OUT, name));
          (files[id] ??= []).push(join(OUT, name));
        }
      }
      console.log(`[garments] ${id}${errors.length ? `  ERRORS: ${errors.slice(0, 2).join(' | ')}` : ''}`);
    }
    // contact sheets: one row per garment, four tiles (a front, a three, b front, b three)
    const per = 4;
    for (let s = 0; s * per < ids.length; s++) {
      const chunk = ids.slice(s * per, s * per + per);
      const comps = [];
      for (let r = 0; r < chunk.length; r++) {
        const row = files[chunk[r]];
        // order: a front, a three, b front, b three
        const order = [row[0], row[1], row[2], row[3]];
        for (let c = 0; c < 4; c++) comps.push({ input: order[c], left: c * W, top: r * H });
      }
      await sharp({ create: { width: W * 4, height: H * chunk.length, channels: 3, background: '#fff' } }).composite(comps).png().toFile(join(OUT, `sheet_${String(s).padStart(2, '0')}_${chunk[0]}.png`));
    }
  } else if (PLAN === 'live') {
    // game distance: ortho 2.6 m tall at DPR 2, walk / sit / sleep / eat for both frames
    await ctx.close();
    const ctx2 = await browser.newContext({ viewport: { width: 320, height: 240 }, deviceScaleFactor: 2 });
    const pg = await ctx2.newPage();
    await pg.goto(`http://127.0.0.1:${PORT}/dev/characters.html?n=2&style=${STYLE}&shadows=0`);
    await pg.waitForFunction(() => window.ready === true, null, { timeout: 240000 });
    await pg.addStyleTag({ content: '#bar,#info{display:none!important}' });
    const outfits = (opt('outfits', '') || 'tee-crew,jeans-straight,sneakers;sundress,sandals-slide;sweater-knit,skirt-aline,boots-ankle;swim-trunks,sandals-slide;nightgown,slippers').split(';').map((x) => x.split(','));
    const tiles = [];
    for (const [k, o] of outfits.entries()) for (const f of ['a', 'b']) for (const [anim, posture, n] of [['walk', undefined, 8], ['sitIdle', 'seated', 6], ['sleep', 'lying', 4], ['eat', undefined, 10]]) {
      const person = f === 'a' ? 0 : 1;
      await pg.evaluate(([p, oo, a, po, nn]) => {
        const lab = window.lab; lab.only([p]); lab.place(p, 0, 0, 0);
        lab.set(p, { outfit: oo, hair: 'crop-side-part' });
        lab.playOne(p, a, po); lab.step(0.05, 2); lab.step(0.05, nn);
        lab.orthoCam(true, 2.6); lab.cam(0.0, 0.64, 12, 0, 0.9, 0, 30);
      }, [person, o, anim, posture, n]);
      await pg.waitForTimeout(150);
      const file = join(OUT, `live_${k}_${f}_${anim}.png`);
      await pg.screenshot({ path: file });
      tiles.push(file);
    }
    const w = 640, h = 480;
    const cols = 4;
    const rows = Math.ceil(tiles.length / cols);
    await sharp({ create: { width: w * cols, height: h * rows, channels: 3, background: '#fff' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * w, top: Math.floor(i / cols) * h }))).png().toFile(join(OUT, 'sheet_live.png'));
    await ctx2.close();
  }
  if (errors.length) console.log('page errors:', errors.slice(0, 5));
} finally {
  await browser?.close();
  server.kill();
}
