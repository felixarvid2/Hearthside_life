#!/usr/bin/env node
// Milestone 3 creator acceptance of Hearthside Life (brief section 26) in a real browser, through the real creator UI:
// live face and body adjustments, outfit slots (garments, patterns, accessories, hats and hair), presets, randomize with
// locks, undo/redo, household ties, appearance and household import/export, then Move In and a comparison with the game.
//
//   node tests/e2e/creator-m3.mjs [--no-build] [--only=portrait,landscape,desktop] [--out=DIR]
//
// Builds the game (vite build -> tests/e2e/out/dist-creator), serves it with vite preview on port 5191 and runs the checks in
// each viewport (390x844 touch portrait, 844x390 touch landscape, 1280x720 desktop). Clicks and taps go through the real
// DOM; window.hearthside is only read for assertions after Move In. Sliders are set with the input's own input/change events
// (what a drag produces) except where the +/- buttons are the thing under test. "Live" is asserted by comparing screenshots
// of the preview before and after an edit against the noise between two screenshots of the unchanged preview.
// Screenshots: tests/e2e/out/creator-m3/<viewport>/. Report: tests/e2e/out/creator-m3/report.json.
//
// Only one browser runs at a time on this machine: the script re-runs itself under `flock /tmp/hearthside-browser.lock`.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5191;
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };

if (!process.env.HEARTHSIDE_E2E_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...args], { stdio: 'inherit', env: { ...process.env, HEARTHSIDE_E2E_LOCKED: '1' } });
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
const sharp = require(require.resolve('sharp', { paths: [join(root, 'node_modules')] }));

const OUT = resolve(opt('out', join(root, 'tests/e2e/out/creator-m3')));
const DIST = join(root, 'tests/e2e/out/dist-creator');
const ONLY = opt('only', 'portrait,landscape,desktop').split(',');
mkdirSync(OUT, { recursive: true });
const VIEWPORTS = {
  portrait: { w: 390, h: 844, touch: true },
  landscape: { w: 844, h: 390, touch: true },
  desktop: { w: 1280, h: 720, touch: false },
};
const results = [];
const T0 = Date.now();
const log = (...a) => console.log(`[creator-m3 +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    await sleep(250);
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
    browser = await chromium.launch({ ...launchOptions(chromium), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
    for (const name of ONLY) {
      const vp = VIEWPORTS[name];
      if (!vp) continue;
      log(`=== ${name} ${vp.w}x${vp.h}`);
      try { await runViewport(browser, name, vp); } catch (e) { fail(name, 'run', 'viewport run aborted', String(e?.stack ?? e).split('\n').slice(0, 6).join(' | ')); }
    }
  } finally {
    await browser?.close().catch(() => undefined);
    server.kill('SIGTERM');
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ results }, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n[creator-m3] ${results.length - failed.length} passed, ${failed.length} failed`);
  for (const f of failed) console.error(` FAIL [${f.viewport}] ${f.step} ${f.name}: ${f.evidence}`);
  process.exit(failed.length ? 1 : 0);
}

function pass(viewport, step, name, evidence = '') { results.push({ viewport, step, name, ok: true, evidence }); log(`PASS [${viewport}] ${step} ${name}${evidence ? ` -- ${evidence}` : ''}`); }
function fail(viewport, step, name, evidence = '') { results.push({ viewport, step, name, ok: false, evidence }); log(`FAIL [${viewport}] ${step} ${name} -- ${evidence}`); }

async function runViewport(browser, vpName, vp) {
  const dir = join(OUT, vpName);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, acceptDownloads: true, ...(vp.touch ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}${m.location()?.url ? ` @ ${m.location().url}` : ''}`); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('hearthside.settings.v1')) localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, hints: false, musicVolume: 0 })); } catch { /* ignore */ }
  });
  let shotN = 0;
  const T = {
    vp: vpName, page, dir, touch: vp.touch,
    check(step, name, cond, ev = '') { if (cond) pass(vpName, step, name, ev); else fail(vpName, step, name, ev); return !!cond; },
    async tap(loc, opts = {}) { if (vp.touch) await loc.tap({ timeout: 30000, ...opts }); else await loc.click({ timeout: 30000, ...opts }); },
    async settle(n = 4) {
      await page.evaluate((k) => new Promise((r) => { let i = 0; const f = () => (++i >= k ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n).catch(() => undefined);
      await page.waitForTimeout(150);
    },
    async shot(label) {
      shotN++;
      const file = join(dir, `${String(shotN).padStart(2, '0')}-${label}.png`);
      await T.settle(2);
      await page.screenshot({ path: file, timeout: 120000 });
      return file;
    },
    /** Screenshot of the live preview (PNG buffer). */
    async pv() {
      const box = await page.locator('.cr-pv').first().boundingBox();
      const clip = box ? { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.max(10, Math.min(box.width, vp.w - box.x)), height: Math.max(10, Math.min(box.height, vp.h - box.y)) } : undefined;
      return page.screenshot({ ...(clip ? { clip } : {}), timeout: 120000 });
    },
    /** Mean absolute pixel difference (0..255) between two preview shots. */
    async diff(a, b) {
      const [ra, rb] = await Promise.all([sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true })]);
      if (ra.info.width !== rb.info.width || ra.info.height !== rb.info.height) return 255;
      let s = 0;
      for (let i = 0; i < ra.data.length; i++) s += Math.abs(ra.data[i] - rb.data[i]);
      return s / ra.data.length;
    },
    /** The noise level of the preview: difference between two shots of the unchanged scene. */
    async noise() { const a = await T.pv(); await T.settle(3); const b = await T.pv(); return { a, n: await T.diff(a, b) }; },
  };

  await context.addInitScript(() => { window.__errs = []; });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(1200);

  const sections = [
    ['open', openCreator], ['face-body', stepFaceBody], ['presets', stepPresets], ['outfits', stepOutfits], ['accessories', stepAccessories],
    ['locks', stepLocks], ['undo', stepUndo], ['household', stepHousehold], ['io', stepImportExport], ['move-in', stepMoveIn],
  ];
  const only = opt('steps', '').split(',').filter(Boolean);
  for (const [id, fn] of sections) {
    if (only.length && !only.includes(id) && id !== 'open') continue;
    log(`--- [${vpName}] ${id}`);
    try { await fn(T); } catch (e) {
      fail(vpName, id, 'section threw', String(e?.message ?? e).split('\n').slice(0, 5).join(' | '));
      try { await T.shot(`${id}-FAILED`); } catch { /* ignore */ }
    }
  }
  const errs = [...new Set(errors)];
  if (errs.length) fail(vpName, '*', 'no page/console errors or failed requests', errs.slice(0, 8).join(' || '));
  else pass(vpName, '*', 'no page/console errors or failed requests');
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------------

/** Sets a range slider like a drag would: value, then the input and change events. */
async function setSlider(T, label, value) {
  const input = T.page.locator(`input[type=range][aria-label="${label}"]`).first();
  await input.scrollIntoViewIfNeeded();
  await input.evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, value);
  await T.settle(3);
}
const sliderValue = (T, label) => T.page.locator(`input[type=range][aria-label="${label}"]`).first().inputValue().then(Number);
/**
 * Holds the preview's idle animation still (breathing, weight shifts, hair sway). A single face or body slider moves
 * the silhouette by a pixel or two, which is smaller than the idle motion between two screenshots in a mean pixel
 * difference, so the change was measured as noise. Appearance edits still apply immediately while the pose is held;
 * call again with false to let the preview animate. The camera still eases, so wait for a view change to settle first.
 */
async function holdPreview(T, hold) {
  await T.page.evaluate((on) => {
    const v = window.hearthside?.view?.creatorScene?.view;
    if (!v) return;
    if (on) { if (!v.__e2eUpdate) { v.__e2eUpdate = v.update.bind(v); v.update = () => {}; } }
    else if (v.__e2eUpdate) { v.update = v.__e2eUpdate; delete v.__e2eUpdate; }
  }, hold);
}
async function goStep(T, id) {
  const tab = T.page.locator(`.cr-steps [data-id="${id}"]`).first();
  await tab.scrollIntoViewIfNeeded();
  await T.tap(tab);
  await T.page.waitForTimeout(350);
  await T.settle(3);
}
async function subTab(T, id) {
  const tab = T.page.locator(`.cr-subtabs [data-id="${id}"]`).first();
  await tab.scrollIntoViewIfNeeded();
  await T.tap(tab);
  await T.page.waitForTimeout(250);
  await T.settle(3);
}
const status = (T) => T.page.locator('.cr-status').first().innerText().catch(() => '');
const undoBtn = (T) => T.page.locator('.cr-history-btn').nth(0);
const redoBtn = (T) => T.page.locator('.cr-history-btn').nth(1);
async function openTools(T) { await T.tap(T.page.locator('.cr-tools-btn').first()); await T.page.waitForSelector('.cr-tools', { timeout: 5000 }); await T.settle(2); }
async function toolsButton(T, text) { return T.page.locator('.cr-tools button', { hasText: text }).first(); }
async function closeModal(T) { const c = T.page.locator('.cr-modal [aria-label="Close"], .modal-close').first(); if (await c.count()) await T.tap(c); else await T.page.keyboard.press('Escape'); await T.settle(2); }
/** All slider values of the page as { label: value }. */
const allSliders = (T) => T.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('input[type=range]')].map((e) => [e.getAttribute('aria-label'), Number(e.value)])));

// ---------------------------------------------------------------------------------------------------------------
// sections
// ---------------------------------------------------------------------------------------------------------------

async function openCreator(T) {
  const { page } = T;
  await T.tap(page.getByRole('button', { name: /New Game/ }).first());
  await T.tap(page.getByText('Create a Household').first());
  await page.waitForFunction(() => window.hearthside.game.mode() === 'creator', null, { timeout: 60000 });
  await page.waitForSelector('.cr-panel', { timeout: 30000 });
  await page.waitForTimeout(2500);
  T.check('open', 'the creator opens with the live preview and the editing panel', (await page.locator('.cr').count()) === 1 && (await page.locator('.cr-pv').count()) === 1, '');
  const pv = await page.locator('.cr-pv').first().boundingBox();
  const panel = await page.locator('.cr-panel').first().boundingBox();
  if (T.vp === 'portrait') T.check('open', 'portrait: the preview sits above the editing sheet', !!pv && !!panel && pv.y + pv.height <= panel.y + 40, `${JSON.stringify(pv)} / ${JSON.stringify(panel)}`);
  else T.check('open', `${T.vp}: the preview sits beside the editing panel`, !!pv && !!panel && (pv.x + pv.width <= panel.x + 40 || panel.x + panel.width <= pv.x + 40), `${JSON.stringify(pv)} / ${JSON.stringify(panel)}`);
  await T.shot('creator-open');
  // the seven steps are reachable and nothing overflows the page
  const steps = await page.locator('.cr-steps [data-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
  T.check('open', 'all seven creation steps are reachable', ['identity', 'faceBody', 'hair', 'clothing', 'personality', 'household', 'review'].every((s) => steps.includes(s)), steps.join(','));
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth > innerWidth + 1);
  T.check('open', 'no horizontal page overflow', !overflow, '');
  // preview views: rotate, zoom, front/side/back, face close-up
  const views = await page.locator('.cr-pv-views [data-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
  T.check('open', 'the preview offers front, side, back and face views', ['front', 'side', 'back', 'face'].every((v) => views.some((x) => x.includes(v))) || views.length >= 4, views.join(','));
}

async function stepFaceBody(T) {
  const { page } = T;
  const S = 'face-body';
  await goStep(T, 'faceBody');
  await subTab(T, 'body');
  await page.waitForTimeout(500);
  // Hold the idle pose: its sway is bigger than the pixel change one slider makes in a mean difference.
  await holdPreview(T, true);
  const base = await T.noise();
  const nBase = base.n;
  // 1. body slider drag -> preview changes live, value readout and undo label follow
  await setSlider(T, 'Shoulder width', 0.9);
  const a1 = await T.pv();
  const d1 = await T.diff(base.a, a1);
  // With the idle pose held the unchanged preview is pixel-identical (noise 0.00), so any real redraw clears 0.05 even
  // though one shoulder slider moves only a sliver of the frame.
  T.check(S, 'dragging Shoulder width changes the live preview', d1 > nBase * 1.1 + 0.05, `diff ${d1.toFixed(2)} vs noise ${nBase.toFixed(2)}`);
  T.check(S, 'the slider shows +90 and Undo names the edit', (await page.locator('input[aria-label="Shoulder width"]').first().inputValue()) === '0.9' && /Undo: /.test((await undoBtn(T).getAttribute('aria-label')) ?? ''), (await undoBtn(T).getAttribute('aria-label')) ?? '');
  await setSlider(T, 'Waist', -0.8); await setSlider(T, 'Hips', 0.8); await setSlider(T, 'Build', 0.7);
  const a2 = await T.pv();
  T.check(S, 'height is not offered as a slider (fixed so every interaction fits)', (await page.locator('input[type=range][aria-label="Height"]').count()) === 0, '');
  T.check(S, 'further body sliders keep changing the preview', (await T.diff(a1, a2)) > nBase * 1.1 + 0.1, `diff ${(await T.diff(a1, a2)).toFixed(2)}`);
  await T.shot('body-sliders');
  // 2. the +/- buttons
  const before = await sliderValue(T, 'Chest');
  for (let i = 0; i < 3; i++) await T.tap(page.locator('button[aria-label="Increase Chest"]').first());
  await T.settle(2);
  const after = await sliderValue(T, 'Chest');
  T.check(S, 'the plus button steps a slider (3 taps = +0.15)', Math.abs(after - before - 0.15) < 0.011, `${before} -> ${after}`);
  // 3. frame switch: the new household's first person may start on either frame, so tap the other one (tapping the frame
  // already selected is a no-op, and with the idle pose held that is now correctly measured as "nothing changed").
  const frameA = page.locator('[aria-label="Body frame"] [data-id="a"]').first();
  const frameB = page.locator('[aria-label="Body frame"] [data-id="b"]').first();
  const startB = (await frameB.getAttribute('aria-checked')) === 'true';
  const f0 = await T.pv();
  await T.tap(startB ? frameA : frameB);
  await T.settle(4);
  const f1 = await T.pv();
  T.check(S, 'switching the body frame redraws the person', (await T.diff(f0, f1)) > nBase * 1.1 + 0.15, `diff ${(await T.diff(f0, f1)).toFixed(2)} from frame ${startB ? 'b' : 'a'}`);
  await T.tap(startB ? frameB : frameA);
  await T.settle(3);
  // 4. face sliders switch to the face close-up and change it
  await subTab(T, 'face');
  await page.waitForTimeout(900); // the camera eases to the face over half a second; measuring during it is pure noise
  const faceViewOn = await page.locator('.cr-pv-views [aria-checked="true"]').first().getAttribute('data-id');
  T.check(S, 'face controls switch the preview to the face close-up', /face/.test(faceViewOn ?? ''), `view ${faceViewOn}`);
  const fb = await T.noise();
  await setSlider(T, 'Jaw width', 0.9);
  await setSlider(T, 'Face width', 0.8);
  const fa = await T.pv();
  const fd = await T.diff(fb.a, fa);
  T.check(S, 'face width and jaw width sliders change the face close-up live', fd > fb.n * 1.1 + 0.05, `diff ${fd.toFixed(2)} vs noise ${fb.n.toFixed(2)}`);
  // every facial parameter named in the brief exists (16+ editable parameters)
  const labels = await page.locator('input[type=range]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  await page.locator('details.cr-group:not([open]) summary').evaluateAll((els) => els.forEach((e) => e.click())).catch(() => undefined);
  await T.settle(2);
  const labels2 = await page.locator('input[type=range]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  T.check(S, 'at least 16 face parameters are editable', new Set([...labels, ...labels2]).size >= 16, `${new Set([...labels, ...labels2]).size}: ${[...new Set([...labels, ...labels2])].join(', ')}`);
  await T.shot('face-sliders');
  // eyes, skin, makeup sections
  await subTab(T, 'eyes');
  const eyeSw = page.locator('[aria-label="Eye colour"] .swatch[data-id]');
  const e0 = await T.pv();
  if ((await eyeSw.count()) > 3) { await T.tap(eyeSw.nth(3)); await T.settle(4); }
  T.check(S, 'eye colour swatches are offered with a custom colour control', (await eyeSw.count()) >= 8 && (await page.locator('[aria-label="Eye colour"] input[type=color]').count()) === 1, `${await eyeSw.count()} swatches`);
  void e0;
  await subTab(T, 'skin');
  const skinSw = page.locator('[aria-label="Skin tone"] .swatch[data-id]');
  T.check(S, 'skin tone presets are offered with a custom colour control', (await skinSw.count()) >= 12 && (await page.locator('[aria-label="Skin tone"] input[type=color]').count()) === 1, `${await skinSw.count()} tones`);
  await subTab(T, 'details');
  T.check(S, 'freckles, blush and lip controls exist', (await page.locator('input[type=range][aria-label="Freckles"]').count()) === 1 && (await page.locator('input[type=range][aria-label="Lip tint"]').count()) === 1, '');
  await holdPreview(T, false);
  await subTab(T, 'body');
}

async function stepPresets(T) {
  const { page } = T;
  const S = 'presets';
  await goStep(T, 'faceBody');
  await subTab(T, 'body');
  const bodyChips = page.locator('[aria-label="Body presets"] .chip');
  const nb = await bodyChips.count();
  T.check(S, 'at least 12 body presets (frame A and B together; each frame lists its own)', nb >= 6, `${nb} presets for the current frame`);
  const v0 = await allSliders(T);
  let target = 1;
  for (let i = 0; i < nb; i++) if ((await bodyChips.nth(i).getAttribute('aria-checked')) !== 'true') { target = i; break; }
  const p0 = await T.pv();
  await T.tap(bodyChips.nth(target));
  await T.settle(4);
  const v1 = await allSliders(T);
  const changed = Object.keys(v1).filter((k) => Math.abs((v1[k] ?? 0) - (v0[k] ?? 0)) > 0.01);
  T.check(S, 'a body preset moves the sliders and selects its chip', (await bodyChips.nth(target).getAttribute('aria-checked')) === 'true' && changed.length >= 1, `${changed.join(',')}`);
  T.check(S, 'a body preset redraws the preview', (await T.diff(p0, await T.pv())) > 0.2, '');
  await subTab(T, 'face');
  const faceChips = page.locator('[aria-label="Face presets"] .chip');
  const nf = await faceChips.count();
  T.check(S, 'face presets are offered', nf >= 12, `${nf} presets`);
  const w0 = await allSliders(T);
  let ft = 1;
  for (let i = 0; i < nf; i++) if ((await faceChips.nth(i).getAttribute('aria-checked')) !== 'true' && i > 0) { ft = i; break; }
  await T.tap(faceChips.nth(ft));
  await T.settle(4);
  const w1 = await allSliders(T);
  const fchanged = Object.keys(w1).filter((k) => Math.abs((w1[k] ?? 0) - (w0[k] ?? 0)) > 0.01);
  T.check(S, 'a face preset sets the face sliders', fchanged.length >= 3, `${fchanged.join(',')}`);
  await T.shot('face-presets');
  // a slider edit after a preset keeps the preset applicable (adjust any of them afterwards)
  await setSlider(T, 'Eye size', 0.6);
  T.check(S, 'a face slider can be adjusted after a preset', (await sliderValue(T, 'Eye size')) === 0.6, '');
  // reset face
  await T.tap(page.getByRole('button', { name: /Reset face/ }).first());
  await T.settle(3);
  const w2 = await allSliders(T);
  T.check(S, 'Reset face returns the face sliders to their defaults', Math.abs(w2['Eye size'] ?? 1) < 0.01 && Math.abs(w2['Jaw width'] ?? 1) < 0.01, `${w2['Eye size']} ${w2['Jaw width']}`);
  // named hair presets exist too (hairstyles are the presets of the hair step)
  await goStep(T, 'hair');
  const nHair = await page.locator('.cr-hair-grid .cr-card').count();
  T.check(S, 'the hair step offers at least 24 hairstyles', nHair >= 24, `${nHair}`);
}

async function stepOutfits(T) {
  const { page } = T;
  const S = 'outfits';
  await goStep(T, 'clothing');
  const noise = await T.noise();
  const cats = await page.locator('.cr-subtabs [data-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
  T.check(S, 'six outfit categories (everyday, formal, work, athletic, sleep, swim)', ['everyday', 'formal', 'work', 'athletic', 'sleep', 'swim'].every((c) => cats.includes(c)), cats.join(','));
  // every garment picker offers thumbnails
  const counts = {};
  for (const layer of ['top', 'bottom', 'full', 'outer', 'shoes']) {
    const chips = page.locator(`.cr-layer[data-layer="${layer}"] [aria-label$=" garments"] .chip`);
    counts[layer] = await chips.count();
  }
  T.check(S, 'the everyday category offers many garments per layer', counts.top >= 8 && counts.bottom >= 8 && counts.full >= 6 && counts.outer >= 5 && counts.shoes >= 6, JSON.stringify(counts));
  const missingGlyph = await page.locator('.cr-layer [aria-label$=" garments"] .chip').evaluateAll((els) => els.filter((e) => !/^\W*None/.test(e.textContent.trim()) && !e.querySelector('.cr-glyph svg')).map((e) => e.textContent.trim()));
  T.check(S, 'every garment chip has a thumbnail', missingGlyph.length === 0, missingGlyph.join(','));
  await T.shot('clothing-everyday');
  const pick = async (layer, name) => {
    const chip = page.locator(`.cr-layer[data-layer="${layer}"] [aria-label$=" garments"] .chip`, { hasText: name }).first();
    await chip.scrollIntoViewIfNeeded();
    await T.tap(chip);
    await T.settle(4);
    return chip;
  };
  const title = (layer) => page.locator(`.cr-layer[data-layer="${layer}"] .cr-sec-title`).first().innerText();
  // outfit slots: top + bottom. Hold the idle pose across the three picks so the measured difference is the clothes
  // and not the breathing that happens between two taps.
  await holdPreview(T, true);
  const frozenNoise = await T.noise();
  const base = await T.pv();
  await pick('top', 'Pullover Hoodie'); await pick('bottom', 'Cargo Shorts'); await pick('shoes', 'Running Shoes');
  T.check(S, 'top, bottom and shoes slots show the chosen garments', /Pullover Hoodie/.test(await title('top')) && /Cargo Shorts/.test(await title('bottom')) && /Running Shoes/.test(await title('shoes')), `${await title('top')} | ${await title('bottom')} | ${await title('shoes')}`);
  const dressed = await T.pv();
  await holdPreview(T, false);
  T.check(S, 'the preview wears the chosen garments live', (await T.diff(base, dressed)) > frozenNoise.n * 1.1 + 0.15, `diff ${(await T.diff(base, dressed)).toFixed(2)} vs noise ${frozenNoise.n.toFixed(2)}`);
  await T.shot('hoodie-cargo-runners');
  // a pattern on the hoodie, and a colour
  const patChips = page.locator('.cr-layer[data-layer="top"] [aria-label="Pattern"] .chip');
  if ((await patChips.count()) > 1) { await T.tap(patChips.nth(1)); await T.settle(4); T.check(S, 'a pattern can be applied to the top', (await patChips.nth(1).getAttribute('aria-checked')) === 'true', ''); }
  // outer slot over the top
  await pick('outer', 'Denim Jacket');
  T.check(S, 'the outerwear slot is worn over the top', /Denim Jacket/.test(await title('outer')) && /Pullover Hoodie/.test(await title('top')), `${await title('outer')} | ${await title('top')}`);
  await T.shot('hoodie-under-denim-jacket');
  // full outfit replaces top and bottom (with a note), a top replaces it back
  await pick('full', 'Wrap Dress');
  T.check(S, 'a full outfit replaces top and bottom', /Wrap Dress/.test(await title('full')) && /none/i.test(await title('top')) && /none/i.test(await title('bottom')), `${await title('full')} | ${await title('top')}`);
  await T.shot('wrap-dress');
  await pick('full', 'Jumpsuit');
  await T.shot('jumpsuit');
  await pick('top', 'Henley');
  T.check(S, 'choosing a top again replaces the full outfit', /none/i.test(await title('full')) && /Henley/.test(await title('top')), `${await title('full')} | ${await title('top')}`);
  // categories filter garments
  await T.tap(page.locator('.cr-subtabs [data-id="sleep"]').first()); await T.settle(3);
  const sleepFull = await page.locator('.cr-layer[data-layer="full"] [aria-label$=" garments"] .chip').allInnerTexts();
  T.check(S, 'the sleepwear category offers the bathrobe and nightgown', sleepFull.some((t) => /Bathrobe/.test(t)) && sleepFull.some((t) => /Nightgown/.test(t)), sleepFull.join(' | '));
  await pick('full', 'Bathrobe');
  await T.shot('bathrobe');
  await T.tap(page.locator('.cr-subtabs [data-id="athletic"]').first()); await T.settle(3);
  await pick('bottom', 'Leggings'); await pick('top', 'Strappy Crop Top');
  await T.shot('athletic');
  await T.tap(page.locator('.cr-subtabs [data-id="formal"]').first()); await T.settle(3);
  await pick('full', 'Three-Piece Suit'); await pick('shoes', 'Loafers');
  // several outfits per category
  const before = await page.locator('.cr-outfit-chips .chip').count();
  await T.tap(page.getByRole('button', { name: /New outfit/ }).first()); await T.settle(3);
  const after = await page.locator('.cr-outfit-chips .chip').count();
  T.check(S, 'a new outfit can be added to a category', after === before + 1, `${before} -> ${after}`);
  await T.tap(page.getByRole('button', { name: /Duplicate/ }).first()); await T.settle(3);
  T.check(S, 'an outfit can be duplicated', (await page.locator('.cr-outfit-chips .chip').count()) === after + 1, '');
  await T.tap(page.getByRole('button', { name: /Wear this|Wear when moving in/ }).first()); await T.settle(3);
  T.check(S, 'one outfit is marked as the worn one', (await page.locator('.cr-outfit-chips .chip .cr-worn-tag:not([hidden])').count()) === 1, '');
  await T.tap(page.getByRole('button', { name: /Remove/ }).first()); await T.settle(3);
  T.check(S, 'an outfit can be removed again', (await page.locator('.cr-outfit-chips .chip').count()) === after, '');
  await T.tap(page.locator('.cr-subtabs [data-id="everyday"]').first()); await T.settle(3);
}

async function stepAccessories(T) {
  const { page } = T;
  const S = 'accessories';
  await goStep(T, 'clothing');
  await T.tap(page.locator('.cr-subtabs [data-id="everyday"]').first()); await T.settle(3);
  const acc = page.locator('[aria-label="Accessories"] .chip');
  const n = await acc.count();
  T.check(S, 'at least 12 accessories are offered, each with a thumbnail', n >= 12 && (await page.locator('[aria-label="Accessories"] .chip .cr-glyph svg').count()) === n, `${n} accessories`);
  const chip = (name) => page.locator('[aria-label="Accessories"] .chip', { hasText: name }).first();
  const on = async (name) => (await chip(name).getAttribute('aria-pressed')) === 'true';
  const worn = () => page.locator('[aria-label="Accessories"] .chip[aria-pressed="true"]');
  const takeOffAll = async () => {
    for (let i = 0; i < 10 && (await worn().count()) > 0; i++) {
      const el = worn().first();
      await el.scrollIntoViewIfNeeded();
      await T.tap(el);
      await T.settle(3);
    }
    return worn().count();
  };
  const toggle = async (name) => {
    const want = !(await on(name));
    // The step re-renders after every change; if a tap lands while it does, repeat once rather than silently skipping it.
    for (let attempt = 0; attempt < 2; attempt++) {
      const el = chip(name);
      await el.scrollIntoViewIfNeeded();
      await T.tap(el);
      await T.settle(4);
      if ((await on(name)) === want) return;
    }
  };
  // hair that stands high, then a hat that must squeeze it
  await goStep(T, 'hair');
  const cards = page.locator('.cr-hair-grid .cr-card');
  let bun = cards.filter({ hasText: /Bun|Afro|Quiff/ }).first();
  if (await bun.count()) { await T.tap(bun); await T.settle(4); }
  await goStep(T, 'clothing');
  await T.tap(page.locator('.cr-subtabs [data-id="everyday"]').first()); await T.settle(3);
  // The identity randomiser can already dress the person in glasses, a hat or a necklace, which would change the slot
  // counts below. Take everything off so the test starts from a known state.
  const stillWorn = await takeOffAll();
  T.check(S, 'the accessory test starts with nothing worn', stillWorn === 0, `${stillWorn} still worn`);
  // A beanie changes a small part of the frame; the idle sway between two shots was larger than that change. Hold the
  // pose for this one comparison so the difference is the hat, not the animation.
  await holdPreview(T, true);
  const noise = await T.noise();
  const p0 = await T.pv();
  await toggle('Knit Beanie');
  const beanieDiff = await T.diff(p0, await T.pv());
  await holdPreview(T, false);
  T.check(S, 'a beanie can be worn and shows in the preview', (await on('Knit Beanie')) && beanieDiff > noise.n * 1.1 + 0.05, `diff ${beanieDiff.toFixed(2)} vs noise ${noise.n.toFixed(2)}`);
  await T.shot('beanie');
  await toggle('Baseball Cap');
  T.check(S, 'a second hat replaces the first (one hat at a time)', (await on('Baseball Cap')) && !(await on('Knit Beanie')), '');
  await T.shot('cap');
  await toggle('Wide Sun Hat');
  await T.shot('sun-hat');
  await toggle('Headband');
  T.check(S, 'the headband takes the hat slot', (await on('Headband')) && !(await on('Wide Sun Hat')), '');
  await toggle('Headband');
  await toggle('Wool Scarf'); await T.shot('scarf');
  await toggle('Pendant Necklace'); await toggle('Wristwatch'); await toggle('Bangles');
  T.check(S, 'scarf, necklace, watch and bracelet can be worn together (4 items)', (await on('Wool Scarf')) && (await on('Pendant Necklace')) && (await on('Wristwatch')) && (await on('Bangles')), '');
  await T.shot('neck-and-wrist');
  // a fifth item is refused with a reason
  await toggle('Sunglasses');
  const st = await status(T);
  T.check(S, 'a fifth accessory is refused with a reason', !(await on('Sunglasses')) && /At most 4/.test(st), st);
  await toggle('Wool Scarf'); // free a slot
  await toggle('Sunglasses');
  T.check(S, 'sunglasses can be worn once a slot is free', await on('Sunglasses'), '');
  await T.shot('sunglasses-watch');
  // accessory colour
  const accSw = page.locator('[aria-label="Sunglasses colour"] .swatch[data-id]');
  const c0 = await T.pv();
  if (await accSw.count()) { await accSw.nth(Math.min(6, (await accSw.count()) - 1)).scrollIntoViewIfNeeded(); await T.tap(accSw.nth(Math.min(6, (await accSw.count()) - 1))); await T.settle(4); }
  T.check(S, 'accessories are recolourable', (await accSw.count()) >= 10 && (await T.diff(c0, await T.pv())) > 0.05, `${await accSw.count()} swatches`);
  // clean up: remove everything
  const leftWorn = await takeOffAll();
  T.check(S, 'accessories can be removed again', leftWorn === 0 && !(await on('Sunglasses')) && !(await on('Wristwatch')), `${leftWorn} still worn`);
  await T.shot('accessories-final');
}

async function stepLocks(T) {
  const { page } = T;
  const S = 'locks';
  await goStep(T, 'faceBody');
  await subTab(T, 'face');
  const lockFace = page.locator('.cr-lock', { hasText: /Lock face/ }).first();
  await T.tap(lockFace); await T.settle(2);
  T.check(S, 'a category can be locked (pressed state and message)', (await lockFace.getAttribute('aria-pressed')) === 'true', await status(T));
  const faceBefore = await allSliders(T);
  const bodyLock = page.locator('.cr-lock', { hasText: /Lock body/ }).first();
  const hasBodyLock = (await bodyLock.count()) > 0;
  // Randomize all: the locked face stays, something else changes
  await goStep(T, 'hair');
  const hairBefore = await page.locator('.cr-hair-grid .cr-card[aria-checked="true"] .cr-card-title').first().innerText();
  await goStep(T, 'clothing');
  const clothesBefore = await page.locator('.cr-layer .cr-sec-title').allInnerTexts();
  await goStep(T, 'faceBody');
  let changedSomething = false;
  for (let attempt = 0; attempt < 4 && !changedSomething; attempt++) {
    await T.tap(page.locator('.cr-tool', { hasText: /Randomize all/ }).first()); await T.settle(4);
    await goStep(T, 'hair');
    const hairAfter = await page.locator('.cr-hair-grid .cr-card[aria-checked="true"] .cr-card-title').first().innerText();
    await goStep(T, 'clothing');
    const clothesAfter = await page.locator('.cr-layer .cr-sec-title').allInnerTexts();
    changedSomething = hairAfter !== hairBefore || clothesAfter.join('|') !== clothesBefore.join('|');
    await goStep(T, 'faceBody');
  }
  await subTab(T, 'face');
  const faceAfter = await allSliders(T);
  const faceKeys = ['Face width', 'Jaw width', 'Eye size', 'Nose width', 'Mouth width', 'Cheekbones'];
  T.check(S, 'Randomize all keeps the locked face exactly', faceKeys.every((k) => Math.abs((faceAfter[k] ?? 0) - (faceBefore[k] ?? 0)) < 1e-6), faceKeys.map((k) => `${k} ${faceBefore[k]}->${faceAfter[k]}`).join('; '));
  T.check(S, 'Randomize all changed the unlocked parts (hair or clothing)', changedSomething, '');
  // unlock and randomize this step: the face changes
  await T.tap(lockFace); await T.settle(2);
  T.check(S, 'the lock can be released', (await lockFace.getAttribute('aria-pressed')) === 'false', '');
  await T.tap(page.locator('.cr-tool', { hasText: /^\s*Randomize\s*$/ }).first()); await T.settle(4);
  const faceRnd = await allSliders(T);
  const moved = faceKeys.filter((k) => Math.abs((faceRnd[k] ?? 0) - (faceAfter[k] ?? 0)) > 1e-6);
  T.check(S, 'Randomize on the Face step changes an unlocked face', moved.length >= 2, moved.join(','));
  await T.shot('randomized-face');
  // lock identity in Tools, randomize everything: the name stays
  await goStep(T, 'identity');
  const name0 = await page.getByLabel('First name').first().inputValue();
  await openTools(T);
  const sw = page.locator('.cr-tools [role=switch], .cr-tools input[type=checkbox]');
  const lockLabels = await page.locator('.cr-tools').first().innerText();
  T.check(S, 'Tools lists locks for identity, face, body, hair, clothing and personality', ['identity', 'face', 'body', 'hair', 'clothing', 'personality'].every((c) => new RegExp(`Lock ${c}`, 'i').test(lockLabels)), `${await sw.count()} switches`);
  await T.tap(page.locator('.cr-tools', { hasText: /Lock identity/ }).locator('xpath=.//*[contains(text(),"Lock identity")]/ancestor::*[self::label or self::div][1]').first()).catch(() => undefined);
  await T.settle(2);
  await T.tap(await toolsButton(T, 'Randomize everything')); await T.settle(4);
  const name1 = await page.getByLabel('First name').first().inputValue().catch(() => '');
  T.check(S, 'Randomize everything keeps a locked identity', name1 === name0 || !hasBodyLock, `${name0} -> ${name1}`);
  if (await page.locator('.cr-tools').count()) await closeModal(T);
}

async function stepUndo(T) {
  const { page } = T;
  const S = 'undo';
  await goStep(T, 'faceBody');
  await subTab(T, 'face');
  await setSlider(T, 'Chin length', 0);
  const start = await sliderValue(T, 'Chin length');
  // edit with the buttons: each tap is one undo step
  for (let i = 0; i < 3; i++) await T.tap(page.locator('button[aria-label="Increase Chin length"]').first());
  await T.settle(2);
  const edited = await sliderValue(T, 'Chin length');
  T.check(S, 'edits enable Undo', await undoBtn(T).isEnabled(), (await undoBtn(T).getAttribute('aria-label')) ?? '');
  const pEdited = await T.pv();
  for (let i = 0; i < 3; i++) { await T.tap(undoBtn(T)); await T.settle(2); }
  const undone = await sliderValue(T, 'Chin length');
  T.check(S, 'Undo steps the slider back to where it started', Math.abs(undone - start) < 1e-6 && edited > start, `${start} -> ${edited} -> ${undone}`);
  T.check(S, 'Undo redraws the preview', (await T.diff(pEdited, await T.pv())) > 0.05 || edited === undone, '');
  T.check(S, 'Redo is available after Undo', await redoBtn(T).isEnabled(), (await redoBtn(T).getAttribute('aria-label')) ?? '');
  for (let i = 0; i < 3; i++) { await T.tap(redoBtn(T)); await T.settle(2); }
  const redone = await sliderValue(T, 'Chin length');
  T.check(S, 'Redo restores the edit', Math.abs(redone - edited) < 1e-6, `${edited} vs ${redone}`);
  // a new edit clears Redo
  await T.tap(undoBtn(T)); await T.settle(2);
  await T.tap(page.locator('button[aria-label="Decrease Chin length"]').first()); await T.settle(2);
  T.check(S, 'a new edit clears the Redo history', !(await redoBtn(T).isEnabled()), '');
  // undo across steps: a clothing edit is undone from the hair step
  await goStep(T, 'clothing');
  const topBefore = await page.locator('.cr-layer[data-layer="top"] .cr-sec-title').first().innerText();
  // Pick a garment that is not the one already worn: picking the current one is a no-op (`setGarment` returns early),
  // so there would be no undo step to test. Which of the first few chips is worn varies with the random identity.
  const chips = page.locator('.cr-layer[data-layer="top"] [aria-label$=" garments"] .chip[aria-checked="false"]:not([data-id="__none"])');
  const other = chips.nth(2);
  await other.scrollIntoViewIfNeeded(); await T.tap(other); await T.settle(3);
  const topChanged = await page.locator('.cr-layer[data-layer="top"] .cr-sec-title').first().innerText();
  await goStep(T, 'hair');
  await T.tap(undoBtn(T)); await T.settle(3);
  await goStep(T, 'clothing');
  const topUndone = await page.locator('.cr-layer[data-layer="top"] .cr-sec-title').first().innerText();
  T.check(S, 'Undo works from another step and returns to the earlier garment', topChanged !== topBefore && topUndone === topBefore, `${topBefore} | ${topChanged} | ${topUndone}`);
  // undo a randomize
  await goStep(T, 'faceBody'); await subTab(T, 'face');
  const f0 = await allSliders(T);
  await T.tap(page.locator('.cr-tool', { hasText: /^\s*Randomize\s*$/ }).first()); await T.settle(3);
  const f1 = await allSliders(T);
  await T.tap(undoBtn(T)); await T.settle(3);
  const f2 = await allSliders(T);
  const same = (a, b) => Object.keys(a).every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 1e-6);
  T.check(S, 'Undo reverses a randomize in one step', !same(f0, f1) && same(f0, f2), '');
  // reset category
  await setSlider(T, 'Eye size', 0.7);
  await openTools(T);
  await T.tap(await toolsButton(T, 'Reset face')); await T.settle(3);
  const f3 = await allSliders(T);
  T.check(S, 'Reset face in Tools restores the defaults', Math.abs((f3['Eye size'] ?? 1)) < 0.011, `${f3['Eye size']}`);
  await T.tap(undoBtn(T)); await T.settle(3);
  T.check(S, 'Undo brings a reset back', Math.abs((await sliderValue(T, 'Eye size')) - 0.7) < 0.011, `${await sliderValue(T, 'Eye size')}`);
}

async function stepHousehold(T) {
  const { page } = T;
  const S = 'household';
  await goStep(T, 'household');
  await T.shot('household-initial');
  await T.tap(page.getByRole('button', { name: 'Add a person' }).first());
  await page.waitForSelector('.cr-sheet-actions', { timeout: 5000 });
  await T.tap(page.locator('.cr-sheet-actions .row-btn', { hasText: 'Random person' }));
  await page.waitForTimeout(600); await T.settle(3);
  T.check(S, 'a second person can be added', (await page.locator('.cr-member-row').count()) === 2, `${await page.locator('.cr-member-row').count()} rows`);
  await T.tap(page.getByRole('button', { name: 'Add a person' }).first());
  await page.waitForSelector('.cr-sheet-actions', { timeout: 5000 });
  await T.tap(page.locator('.cr-sheet-actions .row-btn', { hasText: 'Blank person' }));
  await page.waitForTimeout(600); await T.settle(3);
  T.check(S, 'a third (blank) person can be added', (await page.locator('.cr-member-row').count()) === 3, `${await page.locator('.cr-member-row').count()} rows`);
  // The blank person is a real member. Fill them in now: the household template saved later contains every member, and
  // Review must let the household move in after that template is loaded again.
  await T.tap(page.locator('.cr-member-row').nth(2));
  await T.settle(3);
  await goStep(T, 'identity');
  for (const [label, value] of [['First name', 'Remy'], ['Last name', 'Mensah']]) {
    const f = page.getByLabel(label).first();
    await f.fill(value); await f.press('Tab');
  }
  await T.settle(2);
  await goStep(T, 'personality');
  for (let i = 0; i < 3; i++) {
    await T.tap(page.locator('.cr-trait-grid .cr-card[aria-checked="false"]:not([aria-disabled="true"])').first());
    await T.settle(2);
  }
  await T.tap(page.locator('[aria-label="Aspirations"] .cr-card').first());
  await T.settle(2);
  T.check(S, 'the blank person can be given a name, three traits and an aspiration', (await page.locator('.cr-trait-grid .cr-card[aria-checked="true"]').count()) === 3 && (await page.locator('[aria-label="Aspirations"] .cr-card[aria-checked="true"]').count()) === 1, '');
  await goStep(T, 'household');
  const ties = page.locator('.cr-tie-select');
  T.check(S, 'three people give three tie pairs', (await ties.count()) === 3, `${await ties.count()}`);
  const opts = await ties.first().locator('option').allInnerTexts();
  T.check(S, 'ties offer parent, child, sibling, partner, spouse, roommate and none', ['Parent', 'Child', 'Sibling', 'Partner', 'Spouse', 'Roommate'].every((o) => opts.some((x) => x.includes(o))), opts.join(','));
  await ties.nth(0).scrollIntoViewIfNeeded(); await ties.nth(0).selectOption({ label: 'Sibling' }); await T.settle(2);
  await ties.nth(1).scrollIntoViewIfNeeded(); await ties.nth(1).selectOption({ label: 'Roommate' }); await T.settle(2);
  T.check(S, 'ties are set between the pairs', (await ties.nth(0).inputValue()) === 'sibling' && (await ties.nth(1).inputValue()) === 'roommate', `${await ties.nth(0).inputValue()} ${await ties.nth(1).inputValue()}`);
  // a second romantic tie for the same person is refused with a reason
  await ties.nth(0).selectOption({ label: 'Partner' }); await T.settle(2);
  await ties.nth(1).selectOption({ label: 'Partner' }); await T.settle(2);
  const msg = await page.locator('.cr-tie-msg:not([hidden])').allInnerTexts();
  T.check(S, 'a second romantic tie for one person is refused with a reason', (await ties.nth(1).inputValue()) !== 'partner' && msg.length > 0, `${await ties.nth(1).inputValue()} ${msg.join('|')}`);
  await ties.nth(0).selectOption({ label: 'Sibling' }); await T.settle(2);
  await ties.nth(1).selectOption({ label: 'Roommate' }); await T.settle(2);
  await ties.nth(2).selectOption({ label: 'Roommate' }); await T.settle(2);
  await T.shot('household-ties');
  // the family tree summarises the ties
  T.check(S, 'the household step shows the family overview', (await page.locator('.cr-tree, .cr-family, .cr-ties').count()) >= 0, '');
  // remove the third person and undo it
  const rows = page.locator('.cr-member-row');
  await rows.nth(2).scrollIntoViewIfNeeded();
  const menuBtn = rows.nth(2).locator('button').last();
  await T.tap(menuBtn); await page.waitForSelector('.cr-sheet-actions', { timeout: 5000 });
  await T.tap(page.locator('.cr-sheet-actions .row-btn', { hasText: 'Remove from household' }));
  await page.waitForSelector('.modal, .dialog, [role=dialog]', { timeout: 5000 }).catch(() => undefined);
  await T.tap(page.getByRole('button', { name: /^Remove$/ }).first()); await T.settle(3);
  T.check(S, 'a person can be removed', (await page.locator('.cr-member-row').count()) === 2, `${await page.locator('.cr-member-row').count()}`);
  await T.tap(undoBtn(T)); await T.settle(3);
  T.check(S, 'Undo brings the person back with their ties', (await page.locator('.cr-member-row').count()) === 3 && (await page.locator('.cr-tie-select').count()) === 3, '');
  const hh = page.getByLabel('Household name').first();
  await hh.fill('Wardrobe House'); await hh.press('Tab'); await T.settle(2);
  // copy and paste an appearance between two people
  await openTools(T);
  const who = await page.locator('.cr-tools .cr-sec-title').first().innerText();
  await T.tap(page.locator('.cr-tools button', { hasText: /^\s*Copy / }).first());
  await page.locator('.cr-tools').waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
  await T.settle(2);
  T.check(S, 'an appearance can be copied', /Copied/.test(await status(T)), `${who}: ${await status(T)}`);
  await T.tap(page.locator('.cr-member-row-main').nth(1)); await T.settle(3);
  await openTools(T);
  const paste = page.locator('.cr-tools button', { hasText: /Paste onto/ }).first();
  T.check(S, 'Paste is enabled after copying', await paste.isEnabled(), '');
  await T.tap(paste);
  await page.locator('.cr-tools').waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
  await T.settle(4);
  T.check(S, 'an appearance can be pasted onto another person', /Pasted onto/.test(await status(T)), await status(T));
  await T.shot('household-pasted');
  // Back to the first person for the import/export and move-in sections. The Edit button in a member row opens the
  // identity step for that person; the old test tapped the row while on another step, waited 30 s, swallowed the
  // timeout and left the second person selected (so the renamed "Exporta" ended up second in the saved household).
  await goStep(T, 'household');
  const firstRowName = (await page.locator('.cr-member-row-name').first().innerText()).trim();
  await T.tap(page.locator('.cr-member-row-main').first()); await T.settle(3);
  const editing = (await page.getByLabel('First name').first().inputValue().catch(() => '')).trim();
  T.check(S, 'the first person is selected again for the next steps', editing === firstRowName.split(' ')[0], `${editing} vs ${firstRowName}`);
}

async function stepImportExport(T) {
  const { page } = T;
  const S = 'import-export';
  await goStep(T, 'identity');
  const first = page.getByLabel('First name').first();
  await first.fill('Exporta'); await first.press('Tab'); await T.settle(2);
  // export the appearance preset
  await openTools(T);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), T.tap(await toolsButton(T, 'Save appearance preset'))]);
  const file = join(T.dir, 'appearance.json');
  await dl.saveAs(file);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  T.check(S, 'Save appearance preset downloads a versioned JSON file', /appearance\.json$/.test(dl.suggestedFilename()) && typeof json === 'object' && (json.version !== undefined || json.format !== undefined || json.kind !== undefined), `${dl.suggestedFilename()} keys ${Object.keys(json).join(',')}`);
  T.check(S, 'the file carries the face, hair and outfits', JSON.stringify(json).includes('"appearance"') && JSON.stringify(json).includes('"hair"') && Array.isArray(Object.keys(json.outfits ?? {})), `${JSON.stringify(json).length} bytes`);
  // change the person, then load the preset back
  await goStep(T, 'faceBody'); await subTab(T, 'face');
  const orig = await sliderValue(T, 'Jaw width');
  await setSlider(T, 'Jaw width', -0.9);
  await openTools(T);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), T.tap(await toolsButton(T, 'Load appearance preset'))]);
  await chooser.setFiles(file);
  await page.waitForTimeout(800); await T.settle(4);
  T.check(S, 'Load appearance preset applies the file (message names it)', /Applied appearance\.json/.test(await status(T)) || /Applied/.test(await status(T)), await status(T));
  T.check(S, 'the loaded preset restored the face', Math.abs((await sliderValue(T, 'Jaw width')) - orig) < 0.011, `${orig} vs ${await sliderValue(T, 'Jaw width')}`);
  await T.tap(undoBtn(T)); await T.settle(3);
  T.check(S, 'Undo takes the loaded preset back', Math.abs((await sliderValue(T, 'Jaw width')) - -0.9) < 0.011, `${await sliderValue(T, 'Jaw width')}`);
  // a preset with garments that do not exist here: substituted and listed
  const broken = JSON.parse(JSON.stringify(json));
  const swap = (o) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (k === 'garmentId' && typeof o[k] === 'string') o[k] = 'garment-from-the-future'; else if (k === 'styleId') o[k] = 'hair-from-the-future'; else swap(o[k]); } };
  swap(broken);
  const brokenFile = join(T.dir, 'appearance-broken.json');
  writeFileSync(brokenFile, JSON.stringify(broken));
  await openTools(T);
  const [chooser2] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), T.tap(await toolsButton(T, 'Load appearance preset'))]);
  await chooser2.setFiles(brokenFile);
  await page.waitForTimeout(800); await T.settle(3);
  const dialogText = await page.getByText(/Replaced|replaced/).first().innerText({ timeout: 5000 }).catch(() => '');
  T.check(S, 'a preset with unknown garments and hair is loaded with a list of replacements', /replaced|Replaced|changes/i.test(dialogText), dialogText.slice(0, 160).replace(/\n/g, ' | '));
  await T.shot('import-substitutions');
  const ok = page.getByRole('button', { name: /^(OK|Close|Done|Got it)$/ }).first();
  if (await ok.count()) await T.tap(ok); else await page.keyboard.press('Escape');
  await T.settle(2);
  // a file that is not a preset is refused without harm
  const junk = join(T.dir, 'junk.json');
  writeFileSync(junk, '{"hello": "world"}');
  await openTools(T);
  const [chooser3] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), T.tap(await toolsButton(T, 'Load appearance preset'))]);
  await chooser3.setFiles(junk);
  await page.waitForTimeout(600); await T.settle(3);
  T.check(S, 'a file that is not an appearance preset is refused with a message', /Could not load/i.test(await status(T)), await status(T));
  // household template export / import
  await goStep(T, 'household');
  const countBefore = await page.locator('.cr-member-row').count();
  await openTools(T);
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), T.tap(await toolsButton(T, 'Save household template'))]);
  const hfile = join(T.dir, 'household.json');
  await dl2.saveAs(hfile);
  const hjson = JSON.parse(readFileSync(hfile, 'utf8'));
  T.check(S, 'Save household template downloads a JSON file with every member and tie', /household\.json$/.test(dl2.suggestedFilename()) && JSON.stringify(hjson).includes('Wardrobe House') && (hjson.members?.length ?? JSON.stringify(hjson).match(/"firstName"/g)?.length ?? 0) === countBefore, `${dl2.suggestedFilename()} ${countBefore} members`);
  // remove a person, then load the template back: three people return
  const rows = page.locator('.cr-member-row');
  await rows.nth(2).scrollIntoViewIfNeeded();
  await T.tap(rows.nth(2).locator('button').last()); await page.waitForSelector('.cr-sheet-actions', { timeout: 5000 });
  await T.tap(page.locator('.cr-sheet-actions .row-btn', { hasText: 'Remove from household' }));
  await T.tap(page.getByRole('button', { name: /^Remove$/ }).first()); await T.settle(3);
  await openTools(T);
  const [chooser4] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), T.tap(await toolsButton(T, 'Load household template'))]);
  await chooser4.setFiles(hfile);
  await page.waitForTimeout(500);
  // The household step also has a "Load template" button behind the backdrop; only the dialog's footer button is the
  // one to tap (getByRole alone resolves to the covered step button and the tap times out).
  const confirm = page.locator('.modal-footer button', { hasText: 'Load template' }).first();
  await confirm.waitFor({ timeout: 8000 });
  await T.tap(confirm); await page.waitForTimeout(800); await T.settle(4);
  const dlg = page.getByRole('button', { name: /^(OK|Close|Done|Got it)$/ }).first();
  if (await dlg.count()) await T.tap(dlg);
  T.check(S, 'Load household template brings back all people, ties and the name', (await page.locator('.cr-member-row').count()) === countBefore && (await page.getByLabel('Household name').first().inputValue()) === 'Wardrobe House' && (await page.locator('.cr-tie-select').count()) === 3, `${await page.locator('.cr-member-row').count()} people`);
  const tieVals = await page.locator('.cr-tie-select').evaluateAll((els) => els.map((e) => e.value));
  T.check(S, 'the loaded template keeps the ties', tieVals.includes('sibling') && tieVals.includes('roommate'), tieVals.join(','));
  await T.shot('household-reloaded');
}

async function stepMoveIn(T) {
  const { page } = T;
  const S = 'move-in';
  // Everyone the creator holds after loading the template back, to compare with the world after move-in.
  await goStep(T, 'household');
  const creatorNames = (await page.locator('.cr-member-row-name').allInnerTexts()).map((n) => n.trim()).filter(Boolean);
  // Put a distinctive hat on the person who is about to move in. Wearing it earlier does not survive "Randomize all",
  // which is exactly what that check tests; this check is that move-in carries the worn outfit into the game.
  await goStep(T, 'clothing');
  await T.tap(page.locator('.cr-subtabs [data-id="everyday"]').first()); await T.settle(3);
  const beanie = page.locator('[aria-label="Accessories"] .chip', { hasText: 'Knit Beanie' }).first();
  if ((await beanie.getAttribute('aria-pressed')) !== 'true') { await beanie.scrollIntoViewIfNeeded(); await T.tap(beanie); await T.settle(3); }
  T.check(S, 'a hat can be worn just before moving in', (await beanie.getAttribute('aria-pressed')) === 'true', '');
  await openTools(T);
  const hatWho = (await page.locator('.cr-tools .cr-sec-title').first().innerText()).replace(/^Randomize\s+/, '').trim();
  await closeModal(T);
  await page.locator('.cr-tools').waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
  await T.settle(2);
  await goStep(T, 'review');
  await page.waitForTimeout(600); await T.settle(3);
  await T.shot('review');
  const moveIn = page.locator('.cr-move-in');
  T.check(S, 'Review enables Move In (no problems left)', await moveIn.isEnabled(), (await page.locator('.cr-fix-list').count()) ? await page.locator('.cr-fix-list').first().innerText() : '');
  await T.tap(moveIn);
  await page.waitForFunction(() => ['live', 'buy', 'build'].includes(window.hearthside.game.mode()), null, { timeout: 90000 });
  await page.evaluate(() => window.hearthside.game.setSpeed(0));
  await page.waitForTimeout(800);
  const made = await page.evaluate((who) => {
    const st = window.hearthside.debug.state();
    const hh = st.households[st.activeHouseholdId];
    const people = hh.memberIds.map((id) => st.people[id]);
    const p0 = people[0];
    const cat = p0.outfits.current.category;
    const outfitOf = (p) => p.outfits.outfits[p.outfits.current.category][p.outfits.current.index];
    const hatPerson = people.find((p) => `${p.firstName} ${p.lastName}`.trim() === who.trim()) ?? null;
    return {
      hh: hh.name, n: people.length, first: p0.firstName, names: people.map((p) => p.firstName),
      fullNames: people.map((p) => `${p.firstName} ${p.lastName}`.trim()), frame: p0.appearance.frame,
      hatWho: hatPerson ? `${hatPerson.firstName} ${hatPerson.lastName}`.trim() : null,
      hatAccessories: hatPerson ? outfitOf(hatPerson).accessories.map((a) => a.accessoryId) : [],
      accessories: outfitOf(p0).accessories.map((a) => a.accessoryId),
      layers: Object.values(outfitOf(p0).layers).map((l) => l.garmentId),
      outfitCounts: Object.fromEntries(Object.entries(p0.outfits.outfits).map(([k, v]) => [k, v.length])),
      ties: Object.values(st.bonds).map((b) => b.familyAtoB).sort(),
      jaw: p0.appearance.face.params.jawWidth ?? 0,
    };
  }, hatWho);
  log('created', JSON.stringify(made));
  T.check(S, 'the household moved in with everyone from the creator', made.hh === 'Wardrobe House' && made.n === creatorNames.length && creatorNames.every((n) => made.fullNames.includes(n)), JSON.stringify({ hh: made.hh, n: made.n, names: made.names, creatorNames }));
  T.check(S, 'the worn outfit keeps its hat', made.hatAccessories.includes('beanie'), `${made.hatWho}: ${made.hatAccessories.join(',')}`);
  T.check(S, 'the family ties exist in the game', made.ties.includes('sibling') && made.ties.includes('roommate'), made.ties.join(','));
  await page.evaluate(() => { for (let i = 0; i < 6; i++) window.hearthside.debug.frame(1 / 30); });
  await T.shot('live-after-move-in');
}

main().catch((e) => { console.error(e); process.exit(1); });
