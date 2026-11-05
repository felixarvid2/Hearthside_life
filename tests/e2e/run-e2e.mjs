#!/usr/bin/env node
// Browser end-to-end check of Hearthside Life (Playwright, headless Chromium with SwiftShader).
//
//   node tests/e2e/run-e2e.mjs [--no-build] [--only=desktop,portrait,landscape] [--out=DIR] [--keep] [--no-lock]
//
// Builds the game (vite build -> tests/e2e/out/dist; screenshots in tests/e2e/out/screenshots, git-ignored), serves it with vite preview on port 5190, then for each viewport
// (1280x720 desktop, 390x844 portrait touch, 844x390 landscape touch) loads the page, starts a guided game
// through window.hearthside, steps the simulation and saves screenshots: main menu, live overview, close-up,
// a seated person, a sleeping person, buy mode with a placement ghost, build mode with a painted wall and a
// paint preview, walls up vs cutaway. Fails on page errors, console errors, failed requests, blank canvases.
//
// Only one browser runs at a time on this machine: the script re-runs itself under
// `flock /tmp/hearthside-browser.lock`. Pass `--no-lock` only to recover from a stale lock left by an orphaned run.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5190;
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };

// `--no-lock` skips the lock only to recover from a stale lock held by an orphaned run (never use it while another
// browser script is actually running).
if (!process.env.HEARTHSIDE_E2E_LOCKED && !args.includes('--no-lock')) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...args], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_E2E_LOCKED: '1' },
  });
  process.exit(r.status ?? 1);
}

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of [join(root, 'node_modules'), '/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try { return require(require.resolve('playwright', { paths: [p] })); } catch { /* next */ }
  }
  throw new Error('playwright is not installed (looked in node_modules and the global module folders).');
}

// Playwright's bundled Chromium is not installed in every sandbox; fall back to a system Chrome when there is one.
function launchOptions(chromium) {
  const opts = {};
  if (!existsSync(chromium.executablePath())) {
    const chrome = [process.env.HEARTHSIDE_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && existsSync(p));
    if (chrome) opts.executablePath = chrome;
  }
  return opts;
}

const OUT = resolve(opt('out', join(root, 'tests/e2e/out/screenshots')));
const DIST = join(root, 'tests/e2e/out/dist');
const ONLY = opt('only', 'desktop,portrait,landscape').split(',');
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};

const failures = [];
const report = { viewports: {} };
const log = (...a) => console.log('[e2e]', ...a);

/** Waits for our own preview server; the owner token rules out another app that already holds the port. */
async function waitForServer(url, ms, server, owner) {
  let stderr = '';
  server?.stderr?.on('data', (d) => { stderr += d; });
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (server && server.exitCode !== null) throw new Error(`preview server for ${url} exited (${server.exitCode}): ${stderr.trim()}`);
    try {
      const r = await fetch(`${url}__e2e-owner.txt`);
      if (r.ok) {
        if ((await r.text()).trim() !== owner) throw new Error(`port ${PORT} is held by another server, not this run's build`);
        return;
      }
    } catch (e) { if (!/fetch failed|ENOTFOUND|ECONNREFUSED/.test(String(e))) throw e; }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server at ${url} did not start`);
}

async function main() {
  if (!flag('no-build') || !existsSync(join(DIST, 'index.html'))) {
    log('building...');
    const b = spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', DIST, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
    if (b.status !== 0) throw new Error('vite build failed');
  }
  const owner = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(join(DIST, '__e2e-owner.txt'), owner);
  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser = null;
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`, 20000, server, owner);
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({
      ...launchOptions(chromium),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
    });
    for (const name of ONLY) {
      const vp = VIEWPORTS[name];
      if (!vp) continue;
      log(`--- ${name} ${vp.viewport.width}x${vp.viewport.height}`);
      await runViewport(browser, name, vp);
    }
  } finally {
    await browser?.close().catch(() => undefined);
    server.kill('SIGTERM');
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ ...report, failures }, null, 2));
  if (failures.length) {
    console.error(`[e2e] FAILED (${failures.length}):\n - ${failures.join('\n - ')}`);
    process.exit(1);
  }
  log('OK. Screenshots in', OUT);
}

async function runViewport(browser, name, vp) {
  const context = await browser.newContext(vp);
  await context.addInitScript(RUN_UNTIL);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}${m.location()?.url ? ` @ ${m.location().url}` : ''}`); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  await page.addInitScript(() => {
    try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, musicVolume: 0 })); } catch { /* ignore */ }
  });
  const shots = [];
  const vpReport = { shots, stats: null };
  report.viewports[name] = vpReport;

  const shot = async (label, opts = {}) => {
    // draw a frame and check the canvas in the same task (preserveDrawingBuffer is off)
    const px = await page.evaluate(() => {
      const h = window.hearthside;
      h.debug.frame(1 / 30);
      const c = document.getElementById('game-canvas');
      const t = document.createElement('canvas');
      t.width = 32; t.height = 18;
      const ctx = t.getContext('2d');
      ctx.drawImage(c, 0, 0, 32, 18);
      const d = ctx.getImageData(0, 0, 32, 18).data;
      let lum = 0, alpha = 0, min = 255, max = 0;
      for (let i = 0; i < d.length; i += 4) {
        const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11);
        lum += l; alpha += d[i + 3]; min = Math.min(min, l); max = Math.max(max, l);
      }
      const n = d.length / 4;
      return { lum: lum / n, alpha: alpha / n, contrast: max - min };
    });
    const file = join(OUT, `${name}-${label}.png`);
    await page.screenshot({ path: file, ...opts });
    shots.push({ label, file, ...px });
    if (px.alpha < 200) failures.push(`${name}/${label}: canvas cleared (alpha ${px.alpha.toFixed(0)})`);
    if (px.lum < 25) failures.push(`${name}/${label}: canvas nearly black (luminance ${px.lum.toFixed(0)})`);
    if (px.contrast < 12) failures.push(`${name}/${label}: canvas looks blank (contrast ${px.contrast.toFixed(0)})`);
    log(`shot ${label}: lum ${px.lum.toFixed(0)} contrast ${px.contrast.toFixed(0)}`);
  };
  const frames = (n, dt = 1 / 30) => page.evaluate(([n2, dt2]) => { for (let i = 0; i < n2; i++) window.hearthside.debug.frame(dt2); }, [n, dt]);

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  await frames(4);
  await shot('01-menu');

  // guided start
  const started = await page.evaluate(async () => {
    const g = window.hearthside.game;
    const hhs = g.premadeHouseholds();
    const r = await g.startNewGame('guided', hhs.find((h) => h.members.length >= 2) ?? hhs[0]);
    g.setSpeed(0);
    return r;
  });
  if (!started.ok) { failures.push(`${name}: startNewGame failed: ${started.reason}`); await context.close(); return; }
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    document.querySelectorAll('.toast, .toasts > *').forEach((t) => t.remove());
    window.hearthside.debug.step(20);
  });
  await frames(6);
  await page.evaluate(() => { const v = window.hearthside.view; v.frameLot(true); });
  await frames(3);
  await shot('02-live-overview');

  // picking: the selected person, an object and a wall under their screen anchors
  const picks = await page.evaluate(() => {
    const h = window.hearthside, g = h.game, st = g.state();
    h.debug.frame(1 / 30);
    const id = g.selected();
    const out = {};
    const head = h.view.personPosition(id);
    if (head) { const s = g.view.worldToScreen(head.x, 1.1, head.z); out.person = g.view.pick(s.x, s.y); }
    const lot = st.lots[st.activeLotId];
    const fridge = Object.values(lot.objects).find((o) => o.defId === 'fridge-standard');
    // A person cooking at the fridge stands between the camera and it at the start of a guided game, so the middle and
    // even the edges can pick them (people win at equal depth by design). Try a few heights and edges, then fall back to
    // any other object that is not behind a person right now: the check is that object picking works.
    const tryObject = (o, ys) => {
      for (const y of ys) {
        const s = g.view.worldToScreen(o.x + 0.5, y, o.z + 0.5);
        for (const [dx, dy] of [[0, 0], [14, 0], [-14, 0], [24, 0], [-24, 0], [0, -18], [14, -18], [-14, -18], [0, -32]]) {
          const q = g.view.pick(s.x + dx, s.y + dy);
          if (q?.kind === 'object' && q.objectId === o.id) return q;
        }
      }
      return null;
    };
    if (fridge) {
      out.fridge = fridge.id;
      out.object = tryObject(fridge, [0.9, 0.55, 1.3]);
      if (!out.object) {
        for (const o of Object.values(lot.objects)) {
          if (o.id === fridge.id) continue;
          const q = tryObject(o, [0.9, 0.55]);
          if (q) { out.object = q; out.objectFallback = o.defId; break; }
        }
      }
    }
    const s2 = g.view.worldToScreen(16.5, 0, 7.5);
    out.floor = g.view.pick(s2.x, s2.y);
    g.view.setCutaway('up');
    h.debug.frame(1 / 30);
    const s3 = g.view.worldToScreen(19, 1.5, 12.5); // east exterior wall, outside face
    out.wall = g.view.pick(s3.x, s3.y);
    g.view.setCutaway('cutaway');
    h.debug.frame(1 / 30);
    out.selected = id;
    return out;
  });
  log('picks', JSON.stringify(picks));
  if (picks.person?.kind !== 'person' || picks.person.personId !== picks.selected) failures.push(`${name}: picking the selected person returned ${JSON.stringify(picks.person)}`);
  if (picks.object?.kind !== 'object' || !picks.object.objectId) failures.push(`${name}: picking an object returned ${JSON.stringify(picks.object)}`);
  if (picks.floor?.kind !== 'floor' || picks.floor.tile.x !== 16 || picks.floor.tile.z !== 7) failures.push(`${name}: picking floor (16,7) returned ${JSON.stringify(picks.floor)}`);
  if (picks.wall?.kind !== 'wall' || picks.wall.side !== 'b') failures.push(`${name}: picking the east wall returned ${JSON.stringify(picks.wall)}`);

  // close-up of people (with a thought bubble and a social line in the overlay)
  await page.evaluate(() => {
    const h = window.hearthside, g = h.game, st = g.state();
    const id = g.selected();
    const other = st.households[st.activeHouseholdId].memberIds.find((m) => m !== id);
    st.people[id].thought = { icon: 'hunger', text: 'Hungry', until: st.clock.minutes + 60 };
    if (other) h.view.say(other, 'Morning! Did you sleep well?');
    const v = h.view;
    const p = v.personPosition(id);
    if (p) v.rig.glideTo(p.x, p.z, 120, 0, 0.8);
  });
  await frames(4);
  await shot('03-closeup');

  // seated person: sit on the sofa (or any seat)
  const sat = await page.evaluate(() => runUntil('sit', 'seated'));
  if (!sat.ok) failures.push(`${name}: could not seat a person: ${sat.reason}`);
  await frames(12);
  await page.evaluate((id) => faceAndZoom(id, 120), sat.personId ?? null);
  await frames(3);
  await shot('04-seated');

  // sleeping person
  const slept = await page.evaluate(() => runUntil('sleep', 'lying'));
  if (!slept.ok) failures.push(`${name}: could not put a person to bed: ${slept.reason}`);
  await frames(30);
  await page.evaluate((id) => faceAndZoom(id, 100), slept.personId ?? null);
  await frames(3);
  await shot('05-sleeping');

  // walls up vs cutaway (overview)
  await page.evaluate(() => { const h = window.hearthside; h.view.rig.setYawStep(0); h.view.frameLot(true); h.game.view.setCutaway('up'); });
  await frames(3);
  await shot('06-walls-up');
  await page.evaluate(() => window.hearthside.view.rig.glideTo(9, 16, 110, 0, 1.2));
  await frames(3);
  await shot('06b-walls-up-front-door');
  await page.evaluate(() => window.hearthside.view.rig.glideTo(13, 10, 110, 0, 1.2));
  await frames(3);
  await shot('06c-walls-up-junction');
  await page.evaluate(() => { window.hearthside.view.frameLot(true); window.hearthside.game.view.setCutaway('cutaway'); window.hearthside.game.view.rotate(1); });
  await frames(20);
  await shot('07-cutaway-rotated');
  await page.evaluate(() => { window.hearthside.game.view.rotate(-1); });
  await frames(20);

  // buy mode with a placement ghost (valid) in the living room
  await page.evaluate(() => {
    const g = window.hearthside.game, v = window.hearthside.view;
    g.setMode('buy');
    g.startPlacement('armchair-lounge');
    v.rig.glideTo(8, 12.5, 70, 0);
  });
  await frames(2);
  await page.evaluate(() => {
    const g = window.hearthside.game;
    const s = g.view.worldToScreen(7.5, 0, 11.5);
    g.placementAt(s.x, s.y);
  });
  await frames(10);
  const pl = await page.evaluate(() => window.hearthside.game.placement());
  log('placement', JSON.stringify(pl && { x: pl.x, z: pl.z, ok: pl.ok, reasons: pl.reasons }));
  await shot('08-buy-ghost');
  const bought = await page.evaluate(() => {
    const g = window.hearthside.game, st = g.state();
    const before = Object.keys(st.lots[st.activeLotId].objects).length;
    const r = g.confirmPlacement();
    for (let i = 0; i < 3; i++) window.hearthside.debug.frame(1 / 30);
    const after = Object.keys(g.state().lots[st.activeLotId].objects).length;
    return { r, before, after };
  });
  if (!bought.r.ok || bought.after !== bought.before + 1) failures.push(`${name}: buying failed ${JSON.stringify(bought)}`);
  await shot('08b-bought');
  await page.evaluate(() => window.hearthside.game.startPlacement('armchair-lounge'));
  // invalid spot (inside the sofa)
  await page.evaluate(() => {
    const g = window.hearthside.game;
    const s = g.view.worldToScreen(9.5, 0, 12.5);
    g.placementAt(s.x, s.y);
  });
  await frames(4);
  await shot('09-buy-ghost-invalid');
  await page.evaluate(() => {
    const g = window.hearthside.game, st = g.state();
    g.cancelPlacement();
    const sofa = Object.values(st.lots[st.activeLotId].objects).find((o) => o.defId === 'sofa-tweed');
    if (sofa) g.selectObject(sofa.id);
  });
  await frames(4);
  await shot('09b-buy-selected');
  await page.evaluate(() => window.hearthside.game.selectObject(null));

  // build mode: paint one wall side and preview another
  const painted = await page.evaluate(() => {
    const g = window.hearthside.game, st = g.state();
    g.setMode('build');
    const lot = st.lots[st.activeLotId];
    const design = g.content.wallDesigns['stripes-regency'] ? 'stripes-regency' : Object.keys(g.content.wallDesigns)[0];
    const palettes = g.content.wallDesigns[design].palettes;
    g.setPaintTool({ kind: 'wall', finish: { designId: design, paletteId: palettes[Math.min(1, palettes.length - 1)].id }, scope: 'room' });
    // living room: the west exterior wall's inside face (v edge x=5, z=13), side b
    const wallId = '0:v:5:13';
    const r = lot.walls[wallId] ? g.paintApply({ kind: 'wall', wallId, side: 'b', tile: { x: 5, z: 13 }, level: 0 }) : { ok: false, reason: 'no wall' };
    // preview a second design on the kitchen walls
    const d2 = g.content.wallDesigns['brick-classic'] ? 'brick-classic' : design;
    g.setPaintTool({ kind: 'wall', finish: { designId: d2, paletteId: g.content.wallDesigns[d2].palettes[0].id }, scope: 'room' });
    const pv = g.paintPreview({ kind: 'floor', tile: { x: 15, z: 7 }, level: 0 });
    window.hearthside.view.rig.glideTo(11, 11, 46, 0);
    return { r, pv };
  });
  if (!painted.r.ok) failures.push(`${name}: paintApply failed: ${painted.r.reason}`);
  await frames(6);
  await shot('10-build-painted');
  await page.evaluate(() => { const g = window.hearthside.game; g.paintPreview(null); g.setMode('live'); });

  // stats on the low preset (overview with everyone)
  const stats = await page.evaluate(async () => {
    const h = window.hearthside, g = h.game;
    const prevQ = g.settings().quality;
    g.setSettings({ quality: 'low' });
    h.view.frameLot(true);
    for (let i = 0; i < 3; i++) h.debug.frame(1 / 30);
    const t0 = performance.now();
    const N = 10;
    for (let i = 0; i < N; i++) h.debug.frame(1 / 30);
    const ms = (performance.now() - t0) / N;
    // let the real requestAnimationFrame loop run for a few seconds (fps as the player would see it here)
    g.setSpeed(1);
    await new Promise((r) => setTimeout(r, 4000));
    g.setSpeed(0);
    const low = { ...g.devStats(), people: h.view.peopleStats(), msPerFrame: ms };
    g.setSettings({ quality: 'high' });
    for (let i = 0; i < 3; i++) h.debug.frame(1 / 30);
    const high = { ...g.devStats(), msPerFrame: 0 };
    g.setSettings({ quality: prevQ });
    return { low, high };
  });
  vpReport.stats = stats;
  log('stats low', JSON.stringify(stats.low));

  // a night view
  await page.evaluate(() => {
    const st = window.hearthside.game.state();
    st.clock.minutes = Math.floor(st.clock.minutes / 1440) * 1440 + 22 * 60;
    window.hearthside.view.frameLot(true);
  });
  await frames(4);
  await shot('11-night');

  // character creator through the real menu flow (renders the creator preview in the same canvas)
  await page.evaluate(() => window.hearthside.game.showMenu());
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /New Game/ }).first().click({ timeout: 15000 });
  await page.getByText('Create a Household').first().click({ timeout: 15000 });
  await page.waitForFunction(() => window.hearthside.game.mode() === 'creator', null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await frames(20);
  await shot('12-creator');
  const portrait = await page.evaluate(async () => {
    const g = window.hearthside.game;
    const d = g.premadeHouseholds()[1].members[0];
    const p = g.creator.portrait(d);
    for (let i = 0; i < 4; i++) window.hearthside.debug.frame(1 / 30);
    const url = await p;
    return url.length;
  });
  if (portrait < 1000) failures.push(`${name}: creator portrait missing (${portrait} chars)`);
  await page.evaluate(() => window.hearthside.game.creator.setView('face'));
  await frames(25);
  await shot('13-creator-face');

  vpReport.errors = errors;
  for (const e of errors) failures.push(`${name}: ${e}`);
  await context.close();
}

// Page helper: queue an interaction on the first usable object and run ticks until the person has the posture.
const RUN_UNTIL = `
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

main().catch((e) => { console.error('[e2e] error', e); process.exit(1); });
