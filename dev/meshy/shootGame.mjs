#!/usr/bin/env node
// Screenshots of the real game (production build) with one character style -> dev/meshy/shots/game/<style>-<name>.png:
// live overview with the household portraits in the HUD, a close-up, a seated and a sleeping person, the creator preview.
//   node dev/meshy/shootGame.mjs [--style=detailed|classic] [--out=DIR] [--no-build] [--creator | --creator-only] [--switch]
// Builds into a scratch folder, serves it with vite preview on port 5393 and runs Chromium (SwiftShader) under
// `flock /tmp/hearthside-browser.lock`. Do not wrap this script in another flock.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5393;
const args = process.argv.slice(2);
const opt = (name, def) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };

if (!process.env.GAME_SHOOT_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...args], { stdio: 'inherit', env: { ...process.env, GAME_SHOOT_LOCKED: '1' } });
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
const OUT = resolve(opt('out', join(here, 'shots', 'game')));
const DIST = resolve(opt('dist', join(here, 'shots', 'dist')));
mkdirSync(OUT, { recursive: true });

async function waitForServer(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server at ${url} did not start`);
}

if (!args.includes('--no-build') || !existsSync(join(DIST, 'index.html'))) {
  const b = spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', DIST, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
  if (b.status !== 0) throw new Error('vite build failed');
}
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });

const HELPERS = `
window.faceAndZoom = function (id, ppm) {
  const h = window.hearthside, v = h.view, st = h.game.state();
  const loc = id && st.people[id] ? st.people[id].location : null;
  if (loc && loc.kind === 'lot') {
    const k = ((Math.round((loc.facing - Math.PI / 4) / (Math.PI / 2)) % 4) + 4) % 4;
    v.rig.setYawStep(k);
    h.game.view.setCutaway('cutaway');
  }
  const p = v.personPosition(id);
  if (p) v.rig.glideTo(p.x, p.z, ppm, 0, 0.8);
};
window.runUntil = function (interaction, posture) {
  const h = window.hearthside, g = h.game, st = g.state();
  const hh = st.households[st.activeHouseholdId];
  const lot = st.lots[st.activeLotId];
  for (const personId of hh.memberIds) {
    const p = st.people[personId];
    if (p.location.kind !== 'lot') continue;
    if (p.location.posture === posture) continue;
    const objs = Object.values(lot.objects).filter((o) => (g.content.objects[o.defId]?.interactions ?? []).includes(interaction));
    for (const o of objs) {
      const opts = g.options(personId, { kind: 'object', objectId: o.id });
      const opt = opts.find((x) => x.interactionId === interaction && x.enabled);
      if (!opt) continue;
      const r = g.queue(personId, opt);
      if (!r.ok) continue;
      for (let i = 0; i < 600; i++) {
        h.debug.step(2);
        const loc = g.state().people[personId].location;
        if (loc.kind === 'lot' && loc.posture === posture) { h.debug.step(8); return { ok: true, personId, objectId: o.id }; }
      }
      return { ok: false, reason: 'timed out walking to ' + o.defId, personId };
    }
  }
  return { ok: false, reason: 'no usable object for ' + interaction };
};`;

let browser = null;
try {
  await waitForServer(`http://127.0.0.1:${PORT}/`, 30000);
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(HELPERS);
  await ctx.addInitScript((style) => { try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, musicVolume: 0, characterStyle: style })); } catch { /* ignore */ } }, STYLE);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  const frames = (n, dt = 1 / 30) => page.evaluate(([n2, dt2]) => { for (let i = 0; i < n2; i++) window.hearthside.debug.frame(dt2); }, [n, dt]);
  const shot = async (name, opts = {}) => {
    await frames(1);
    await page.screenshot({ path: join(OUT, `${STYLE}-${name}.png`), timeout: 180000, ...opts });
    console.log(`[game] ${STYLE}-${name}`);
  };
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 240000 });
  await page.waitForTimeout(1200);
  console.log('[game] character style in effect:', await page.evaluate(() => window.hearthside.view.characterAssets?.style));
  if (!args.includes('--creator-only')) {
  const started = await page.evaluate(async () => {
    const g = window.hearthside.game;
    const hhs = g.premadeHouseholds();
    const r = await g.startNewGame('guided', hhs.find((h) => h.members.length >= 2) ?? hhs[0]);
    g.setSpeed(0);
    return r;
  });
  if (!started.ok) throw new Error(`startNewGame failed: ${started.reason}`);
  await page.waitForTimeout(600);
  await page.evaluate(() => { document.querySelectorAll('.toast, .toasts > *').forEach((t) => t.remove()); window.hearthside.debug.step(20); });
  await frames(6);
  await page.evaluate(() => window.hearthside.view.frameLot(true));
  await frames(3);
  await page.waitForTimeout(800); // portraits render one per frame
  await frames(8);
  await shot('overview');
  await page.evaluate(() => {
    const h = window.hearthside, g = h.game;
    const id = g.selected();
    const p = h.view.personPosition(id);
    if (p) h.view.rig.glideTo(p.x, p.z, 120, 0, 0.8);
  });
  await frames(6);
  await shot('closeup');
  await page.evaluate(() => {
    const h = window.hearthside, g = h.game;
    const p = h.view.personPosition(g.selected());
    if (p) h.view.rig.glideTo(p.x, p.z, 170, 0, 0.8);
  });
  await frames(6);
  await shot('closeup-max');
  const sat = await page.evaluate(() => runUntil('sit', 'seated'));
  await frames(12);
  await page.evaluate((id) => faceAndZoom(id, 120), sat.personId ?? null);
  await frames(3);
  await shot('seated');
  const slept = await page.evaluate(() => runUntil('sleep', 'lying'));
  await frames(30);
  await page.evaluate((id) => faceAndZoom(id, 100), slept.personId ?? null);
  await frames(3);
  await shot('sleeping');
  if (args.includes('--switch')) {
    // Settings > Character style at run time: the other bodies load on demand and everyone is rebuilt
    const other = STYLE === 'detailed' ? 'classic' : 'detailed';
    await page.evaluate((st) => window.hearthside.game.setSettings({ characterStyle: st }), other);
    await page.waitForFunction((st) => window.hearthside.view.characterAssets?.style === st, other, { timeout: 60000 });
    await frames(10);
    await page.evaluate(() => window.hearthside.view.frameLot(true));
    await frames(4);
    await page.waitForTimeout(1500);
    await frames(10);
    await shot(`switched-to-${other}`);
    await page.evaluate((st) => window.hearthside.game.setSettings({ characterStyle: st }), STYLE);
    await page.waitForFunction((st) => window.hearthside.view.characterAssets?.style === st, STYLE, { timeout: 60000 });
    await frames(10);
    await shot(`switched-back-to-${STYLE}`);
  }
  }
  if (args.includes('--creator') || args.includes('--creator-only')) {
    // the character creator: identity, face and body, hair, clothing (same taps as tests/e2e/acceptance.mjs)
    if (!args.includes('--creator-only')) {
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 240000 });
      await page.waitForTimeout(800);
    }
    await page.getByRole('button', { name: /New Game/ }).first().click();
    await page.getByText('Create a Household').first().click();
    await page.waitForFunction(() => window.hearthside.game.mode() === 'creator', null, { timeout: 60000 });
    await page.waitForSelector('.cr-panel', { timeout: 30000 });
    await page.waitForTimeout(2500);
    await frames(10);
    await shot('creator-identity');
    const next = async () => { await page.locator('.cr-next').click(); await page.waitForTimeout(500); await frames(4); };
    await next();
    const chips = page.locator('[aria-label="Body presets"] .chip');
    const n = await chips.count();
    if (n > 2) { await chips.nth(n - 1).click(); await frames(6); }
    await shot('creator-body');
    await next();
    const cards = page.locator('.cr-hair-grid .cr-card');
    const nh = await cards.count();
    if (nh > 3) { await cards.nth(nh - 3).click(); await frames(6); }
    await shot('creator-hair');
    await next();
    await page.waitForTimeout(300);
    await frames(6);
    await shot('creator-clothing');
  }
  if (errors.length) console.log(`[game] console problems (${errors.length}):\n  ${[...new Set(errors)].slice(0, 8).join('\n  ')}`);
  await ctx.close();
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
