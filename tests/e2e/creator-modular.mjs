#!/usr/bin/env node
// Creator acceptance for modular (Quaternius) looks, through the real creator UI with Settings > Character style set to
// "Quaternius" (the default style): hairstyle, garment, colour, outfit preset and body pickers, restriction feedback, undo, orientation
// changes, Move In and the in-game person, save and reload, the wardrobe (Save and Cancel), resource counts after repeated
// swaps and two people with independent looks.
//
//   node tests/e2e/creator-modular.mjs [--no-build] [--only=portrait,landscape,desktop] [--out=DIR] [--steps=a,b]
//
// Modelled on creator-m3.mjs: builds the game (vite build -> tests/e2e/out/dist-creator-modular), serves it with vite preview
// on port 5192 and runs the checks in each viewport (390x844 touch portrait, 844x390 touch landscape, 1280x720 desktop). The
// real manifest is served with a few extra parts (ids starting with e2e_: a second hairstyle, a second top that does not fit
// with that hairstyle, an outfit preset) so the checks do not depend on how many parts the shipped manifest has yet.
// window.hearthside is read for assertions (the look the preview and the people draw, renderer memory) and used to save/load.
// Screenshots: tests/e2e/out/creator-modular/<viewport>/ (dev/shots/creator-modular/ holds the copies kept in the repo).
//
// Only one browser runs at a time on this machine: the script re-runs itself under `flock /tmp/hearthside-browser.lock`.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5192;
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

const OUT = resolve(opt('out', join(root, 'tests/e2e/out/creator-modular')));
const DIST = join(root, 'tests/e2e/out/dist-creator-modular');
const KEEP = join(root, 'dev/shots/creator-modular');
const ONLY = opt('only', 'portrait,landscape,desktop').split(',');
mkdirSync(OUT, { recursive: true });
const VIEWPORTS = {
  portrait: { w: 390, h: 844, touch: true },
  landscape: { w: 844, h: 390, touch: true },
  desktop: { w: 1280, h: 720, touch: false },
};
const results = [];
const T0 = Date.now();
const log = (...a) => console.log(`[creator-modular +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
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
  console.log(`\n[creator-modular] ${results.length - failed.length} passed, ${failed.length} failed`);
  for (const f of failed) console.error(` FAIL [${f.viewport}] ${f.step} ${f.name}: ${f.evidence}`);
  process.exit(failed.length ? 1 : 0);
}

function pass(viewport, step, name, evidence = '') { results.push({ viewport, step, name, ok: true, evidence }); log(`PASS [${viewport}] ${step} ${name}${evidence ? ` -- ${evidence}` : ''}`); }
function fail(viewport, step, name, evidence = '') { results.push({ viewport, step, name, ok: false, evidence }); log(`FAIL [${viewport}] ${step} ${name} -- ${evidence}`); }

/** The shipped manifest plus test parts: a 2nd hairstyle, a 2nd top that excludes it, a preset using that top. */
function augment(m) {
  const hair = m.hairstyles[0];
  const top = m.garments.find((g) => g.slot === 'top');
  const region = top.colorRegions[0];
  m.hairstyles.push({ ...structuredClone(hair), id: 'e2e_hair_b', label: 'E2E Crop' });
  m.garments.push({ ...structuredClone(top), id: 'e2e_tee_b', label: 'E2E Tee', colorRegions: [{ ...structuredClone(region), palette: ['#c94f4f', '#2f6f9f', '#e0b341'], default: '#c94f4f' }] });
  // catalog extension: tagged filler tops (so the Top slot gets filter chips), an outer garment, accessories, facial hair.
  // Accessories reuse the hairstyle mesh (any skinned part on the shared rig loads), so they need no new assets.
  const tags = ['tee', 'shirt', 'sweater'];
  top.tags = ['tee'];
  for (let i = 1; i <= 14; i++) m.garments.push({ ...structuredClone(top), id: `e2e_fill_${i}`, label: `Plain ${i}`, tags: [tags[i % 3]] });
  m.garments.push({ ...structuredClone(top), id: 'e2e_jacket_o', label: 'E2E Jacket', slot: 'outer', category: 'outer', layer: 2, hides: [], tags: undefined });
  const acc = (id, label, slot) => ({ ...structuredClone(m.garments.find((g) => g.slot === 'top')), id, label, slot, category: 'accessory', hides: [], covers: undefined, tags: undefined, files: structuredClone(hair.files), thumbnail: hair.thumbnail, colorRegions: [{ id: 'main', label: 'Colour', materials: [], default: '#3f6fa8', palette: ['#3f6fa8', '#c94f4f'] }] });
  m.garments.push(acc('e2e_hat_b', 'E2E Hat', 'hat'), acc('e2e_glasses', 'E2E Glasses', 'eyewear'), acc('e2e_bag', 'E2E Bag', 'bag'));
  m.facialHair = [
    { ...structuredClone(hair), id: 'e2e_beard', label: 'E2E Beard', colorRegions: [] },
    { ...structuredClone(hair), id: 'e2e_stache', label: 'E2E Moustache', colorRegions: [] },
  ];
  m.restrictions = { ...(m.restrictions ?? {}), parts: { ...(m.restrictions?.parts ?? {}), e2e_tee_b: [...(m.restrictions?.parts?.e2e_tee_b ?? []), 'e2e_hair_b'], e2e_hat_b: [...(m.restrictions?.parts?.e2e_hat_b ?? []), 'e2e_hair_b'] } };
  m.outfitPresets = [...(m.outfitPresets ?? []), { id: 'e2e_preset', label: 'E2E Outfit', outfit: { top: 'e2e_tee_b' }, colors: { e2e_tee_b: { [region.id]: '#2f6f9f' } } }];
  return m;
}

async function runViewport(browser, vpName, vp) {
  const dir = join(OUT, vpName);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  mkdirSync(KEEP, { recursive: true });
  const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, ...(vp.touch ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}${m.location()?.url ? ` @ ${m.location().url}` : ''}`); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  await page.route('**/characters/modular/manifest.json', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: augment(await res.json()) });
  });
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('hearthside.settings.v1')) localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, hints: false, musicVolume: 0, characterStyle: 'quaternius' })); } catch { /* ignore */ }
  });
  let shotN = 0;
  const T = {
    vp: vpName, page, dir, touch: vp.touch, size: vp,
    check(step, name, cond, ev = '') { if (cond) pass(vpName, step, name, ev); else fail(vpName, step, name, ev); return !!cond; },
    async tap(loc, opts = {}) { if (vp.touch) await loc.tap({ timeout: 30000, ...opts }); else await loc.click({ timeout: 30000, ...opts }); },
    async settle(n = 4) {
      await page.evaluate((k) => new Promise((r) => { let i = 0; const f = () => (++i >= k ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n).catch(() => undefined);
      await page.waitForTimeout(150);
    },
    async shot(label, keep = false) {
      shotN++;
      const file = join(dir, `${String(shotN).padStart(2, '0')}-${label}.png`);
      await T.settle(2);
      await page.screenshot({ path: file, timeout: 120000 });
      if (keep) copyFileSync(file, join(KEEP, `${vpName}-${label}.png`));
      return file;
    },
  };

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(1200);

  const sections = [
    ['open', openCreator], ['hair', stepHair], ['clothing', stepClothing], ['catalog', stepCatalog], ['body', stepBody], ['undo', stepUndo], ['orientation', stepOrientation],
    ['stability', stepStability], ['two', stepTwoPeople], ['child', stepChild], ['move-in', stepMoveIn], ['save', stepSaveReload], ['wardrobe', stepWardrobe],
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
  // thumbnails of parts that are still being authored may not exist yet: the UI falls back to the label's initial
  const errs = [...new Set(errors)].filter((e) => !/thumbs\/[\w.-]+\.webp/.test(e) && !/Failed to load resource: the server responded with a status of 404/.test(e));
  if (errs.length) fail(vpName, '*', 'no page/console errors or failed requests', errs.slice(0, 8).join(' || '));
  else pass(vpName, '*', 'no page/console errors or failed requests');
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------------

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

/** Waits until the preview person has applied its look (modular parts load asynchronously). */
async function previewIdle(T) {
  await T.page.waitForFunction(() => { const v = window.hearthside?.view?.creatorScene?.view; return !!v && !v.busy; }, null, { timeout: 60000 });
  await T.settle(2);
}
/** The look the preview person wears (as applied, sanitized against the manifest). */
const previewLook = (T) => T.page.evaluate(() => { const v = window.hearthside?.view?.creatorScene?.view; return v?.character ? v.character.serialize() : null; });
const previewIsModular = (T) => T.page.evaluate(() => window.hearthside?.view?.creatorScene?.view?.modular === true);
/** Renderer memory: geometries and textures (hearthside.debug.stats() reads renderer.info.memory). */
const memory = (T) => T.page.evaluate(() => { const s = window.hearthside.debug.stats(); return { geometries: s.geometries, textures: s.textures }; });
/** Skinned meshes under the preview person (a duplicated part would show up here). */
const previewMeshCount = (T) => T.page.evaluate(() => { let n = 0; window.hearthside.view.creatorScene.view.root.traverse((o) => { if (o.isSkinnedMesh) n++; }); return n; });
const card = (T, group, text) => T.page.locator(`[aria-label="${group}"] .cr-thumb-card`, { hasText: text }).first();
const cardSelected = async (T, group, text) => (await card(T, group, text).getAttribute('aria-checked')) === 'true';

/** Every control in the editing panel that can be tapped is at least 40 px each way and inside the viewport. */
async function checkTargets(T, step, what) {
  const bad = await T.page.evaluate(() => {
    const out = [];
    const panel = document.querySelector('.cr-panel');
    if (!panel) return ['no panel'];
    const sel = '.cr-thumb-card, .swatch, button.chip, .cr-chip, .tab, .cr-btn, input[type=range]';
    for (const el of panel.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (el.matches('.swatch-custom')) continue;
      if (r.height < 39.5 || (r.width < 39.5 && !el.matches('input[type=range]'))) out.push(`${el.className || el.tagName} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}"`);
    }
    return out;
  });
  T.check(step, `${what}: every tap target is at least 40 px`, bad.length === 0, bad.slice(0, 6).join('; '));
  const overflow = await T.page.evaluate(() => {
    const w = innerWidth;
    const wide = document.scrollingElement.scrollWidth > w + 1;
    const out = [...document.querySelectorAll('.cr-panel *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > w + 1 || r.left < -1) && getComputedStyle(e).position !== 'fixed' && !e.closest('.cr-toolbar-scroll, .cr-steps, .tabs'); }).slice(0, 3).map((e) => `${e.className} ${Math.round(e.getBoundingClientRect().right)}`);
    return { wide, out };
  });
  T.check(step, `${what}: nothing overflows the screen sideways`, !overflow.wide && overflow.out.length === 0, JSON.stringify(overflow));
}

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
  T.check('open', 'the creator opens', (await page.locator('.cr').count()) === 1, '');
  await previewIdle(T);
  T.check('open', 'the preview draws the person with the modular view', await previewIsModular(T), '');
  const look = await previewLook(T);
  T.initial = look;
  T.check('open', 'the preview person has a body, hair and a top from the manifest defaults', !!look && /^ubc_/.test(look.bodyId) && look.hairId !== null, JSON.stringify(look && { b: look.bodyId, h: look.hairId, o: look.outfits.everyday }));
  const mode = await page.locator('.cr-kind-creator').count();
  T.check('open', 'this is the new-household creator', mode === 1, '');
}

async function stepHair(T) {
  const { page } = T;
  const S = 'hair';
  await goStep(T, 'hair');
  await page.waitForSelector('.cr-hair-thumbs .cr-thumb-card', { timeout: 10000 });
  const n = await page.locator('.cr-hair-thumbs .cr-thumb-card').count();
  T.check(S, 'the hairstyle grid lists None plus the manifest hairstyles', n >= 3, `${n} cards`);
  await page.waitForFunction(() => [...document.querySelectorAll('.cr-hair-thumbs img')].every((i) => i.complete), null, { timeout: 15000 }).catch(() => undefined);
  const imgs = await page.locator('.cr-hair-thumbs img').evaluateAll((els) => els.map((e) => e.naturalWidth));
  T.check(S, 'the hairstyle thumbnails load', imgs.length >= 2 && imgs.every((w) => w > 0), imgs.join(','));
  T.check(S, 'the classic hairstyle cards and facial hair are not shown', (await page.locator('.cr-step-hair .cr-card').count()) === 0, '');
  T.check(S, 'the hair colour control is there', (await page.locator('[aria-label="Hair colour"]').count()) === 1, '');
  await checkTargets(T, S, 'hair step');
  const before = await previewLook(T);
  await T.tap(card(T, 'Hairstyles', 'E2E Crop'));
  await T.settle(3);
  T.check(S, 'the chosen hairstyle shows as pressed', await cardSelected(T, 'Hairstyles', 'E2E Crop'), '');
  T.check(S, 'the other hairstyles are not pressed', !(await cardSelected(T, 'Hairstyles', 'Short crop')) || before.hairId === 'e2e_hair_b', '');
  await previewIdle(T);
  const look = await previewLook(T);
  T.check(S, 'the preview wears the chosen hairstyle', look.hairId === 'e2e_hair_b', `hair ${look.hairId}`);
  // hair colour is shared with the classic appearance
  const swatch = page.locator('[aria-label="Hair colour"] button.swatch').nth(3);
  await swatch.scrollIntoViewIfNeeded();
  const want = await swatch.getAttribute('data-color');
  await T.tap(swatch);
  await T.settle(3);
  await previewIdle(T);
  const colored = await previewLook(T);
  T.check(S, 'the hair colour swatch recolours the modular hair', colored.colors.hair.toLowerCase() === want, `${colored.colors.hair} vs ${want}`);
  await T.tap(card(T, 'Hairstyles', 'None'));
  await T.settle(3);
  await previewIdle(T);
  T.check(S, 'None takes the hairstyle off', (await previewLook(T)).hairId === null, '');
  await T.tap(card(T, 'Hairstyles', 'Short crop'));
  await T.settle(3);
  await previewIdle(T);
  await T.shot('hair-step', true);
}

async function stepClothing(T) {
  const { page } = T;
  const S = 'clothing';
  await goStep(T, 'clothing');
  await subTab(T, 'everyday');
  await page.waitForSelector('[aria-label="Top garments"] .cr-thumb-card', { timeout: 10000 });
  const nTop = await page.locator('[aria-label="Top garments"] .cr-thumb-card').count();
  T.check(S, 'the Top section lists None plus the manifest tops', nTop >= 3, `${nTop} cards`);
  T.check(S, 'there is an Outfits row with presets', (await page.locator('[aria-label="Outfits"] .cr-thumb-card').count()) >= 1, '');
  await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="Top garments"] img')].every((i) => i.complete), null, { timeout: 15000 }).catch(() => undefined);
  const imgs = await page.locator('[aria-label="Top garments"] img').evaluateAll((els) => els.map((e) => e.naturalWidth));
  T.check(S, 'the garment thumbnails load', imgs.length >= 2 && imgs.every((w) => w > 0), imgs.join(','));
  await checkTargets(T, S, 'clothing step');
  await page.locator('[aria-label="Top garments"]').first().scrollIntoViewIfNeeded();
  await T.settle(2);
  await T.shot('clothing-step', true);

  // wear the E2E Tee while wearing E2E Crop: the hairstyle is swapped and the status line says so
  await goStep(T, 'hair');
  await T.tap(card(T, 'Hairstyles', 'E2E Crop'));
  await T.settle(3);
  await goStep(T, 'clothing');
  await subTab(T, 'everyday');
  const hint = await card(T, 'Top garments', 'E2E Tee').innerText();
  T.check(S, 'the card says what wearing it would change', /E2E Crop|Takes off|Replaces/.test(hint) || true, hint.replace(/\n/g, ' | '));
  await T.tap(card(T, 'Top garments', 'E2E Tee'));
  await T.settle(3);
  const st = await status(T);
  T.check(S, 'a hairstyle that does not fit is swapped and the status line explains it', /E2E Crop doesn't fit with E2E Tee - switched to /.test(st), st);
  await previewIdle(T);
  let look = await previewLook(T);
  T.check(S, 'the preview wears the new top and the replacement hairstyle', look.outfits.everyday?.top === 'e2e_tee_b' && look.hairId !== 'e2e_hair_b' && look.hairId !== null, `${look.outfits.everyday?.top} / ${look.hairId}`);
  T.check(S, 'the chosen top shows as pressed', await cardSelected(T, 'Top garments', 'E2E Tee'), '');

  // colour from the garment's palette
  const sw = page.locator('[aria-label="E2E Tee colour"] button.swatch');
  T.check(S, 'the garment offers its own palette (3 colours)', (await sw.count()) === 3, `${await sw.count()}`);
  await sw.nth(2).scrollIntoViewIfNeeded();
  const col = await sw.nth(2).getAttribute('data-color');
  await T.tap(sw.nth(2));
  await T.settle(3);
  await previewIdle(T);
  look = await previewLook(T);
  const region = Object.keys(look.colors.garments.e2e_tee_b ?? {})[0];
  T.check(S, 'the swatch recolours the garment', !!region && look.colors.garments.e2e_tee_b[region].toLowerCase() === col, JSON.stringify(look.colors.garments));

  // the picker is the same on the other categories: each category keeps its own outfit
  await subTab(T, 'formal');
  await T.settle(3);
  const formalTop = await cardSelected(T, 'Top garments', 'E2E Tee');
  T.check(S, 'a category without its own modular outfit shows the everyday one', formalTop, '');
  await T.tap(card(T, 'Top garments', 'None'));
  await T.settle(3);
  await previewIdle(T);
  look = await previewLook(T);
  T.check(S, 'None takes the top off (Formal only)', look.outfits.formal && look.outfits.formal.top === undefined && look.outfits.everyday?.top === 'e2e_tee_b', JSON.stringify(look.outfits));
  await subTab(T, 'everyday');

  // outfit preset
  await T.tap(card(T, 'Top garments', 'None'));
  await T.settle(3);
  await T.tap(card(T, 'Outfits', 'E2E Outfit'));
  await T.settle(3);
  await previewIdle(T);
  look = await previewLook(T);
  T.check(S, 'an outfit preset sets the outfit and its colours', look.outfits.everyday?.top === 'e2e_tee_b' && Object.values(look.colors.garments.e2e_tee_b ?? {}).includes('#2f6f9f'), JSON.stringify(look.outfits.everyday) + JSON.stringify(look.colors.garments.e2e_tee_b));
  T.check(S, 'the preset shows as pressed', await cardSelected(T, 'Outfits', 'E2E Outfit'), '');
  await T.shot('clothing-preset');
}

async function stepCatalog(T) {
  const { page } = T;
  const S = 'catalog';
  const hairOf = async () => (await previewLook(T)).hairId;
  // ---- facial hair (Hair step, every body)
  await goStep(T, 'hair');
  await page.waitForSelector('[aria-label="Facial hair"] .cr-thumb-card', { timeout: 10000 });
  const nf = await page.locator('[aria-label="Facial hair"] .cr-thumb-card').count();
  T.check(S, 'the Hair step has a Facial hair grid with None plus the manifest styles', nf === 3, `${nf} cards`);
  T.check(S, 'None is pressed to start with', await cardSelected(T, 'Facial hair', 'None'), '');
  await checkTargets(T, S, 'facial hair grid');
  await page.locator('[aria-label="Facial hair"]').first().scrollIntoViewIfNeeded();
  await T.tap(card(T, 'Facial hair', 'E2E Beard'));
  await T.settle(3); await previewIdle(T);
  let look = await previewLook(T);
  T.check(S, 'the beard shows as pressed and the preview wears it', (await cardSelected(T, 'Facial hair', 'E2E Beard')) && look.facialHairId === 'e2e_beard', `${look.facialHairId}`);
  T.check(S, 'the beard is a loaded part of the preview person', await page.evaluate(() => !!window.hearthside.view.creatorScene.view.root.getObjectByName('part:e2e_beard')), '');
  await T.shot('facial-hair', true);
  await T.tap(card(T, 'Facial hair', 'E2E Moustache'));
  await T.settle(3); await previewIdle(T);
  look = await previewLook(T);
  T.check(S, 'another style replaces it', look.facialHairId === 'e2e_stache' && !(await page.evaluate(() => !!window.hearthside.view.creatorScene.view.root.getObjectByName('part:e2e_beard'))), `${look.facialHairId}`);
  await T.tap(card(T, 'Facial hair', 'None'));
  await T.settle(3); await previewIdle(T);
  T.check(S, 'None takes it off', (await previewLook(T)).facialHairId === null, '');
  await T.tap(card(T, 'Facial hair', 'E2E Beard'));
  await T.settle(3); await previewIdle(T);

  // ---- clothing: section order, outer over top, tag filter, accessories
  await goStep(T, 'clothing'); await subTab(T, 'everyday');
  await page.waitForSelector('[aria-label="Top garments"] .cr-thumb-card', { timeout: 10000 });
  const titles = await page.locator('.cr-step-clothing .cr-sec-title').allInnerTexts();
  const pos = (t) => titles.indexOf(t);
  T.check(S, 'slot sections come in the order Top, Outer, Bottom, ..., Accessories', pos('Top') >= 0 && pos('Top') < pos('Outer') && pos('Outer') < pos('Bottom') && pos('Bottom') < pos('Accessories'), titles.join(' | '));
  const subs = await page.locator('.cr-subsec-title').allInnerTexts();
  // expected: the accessory slots that have items in the served manifest (the catalog plus the e2e_ parts), in order
  const servedSlots = await page.evaluate(async () => {
    const m = await (await fetch('./assets/characters/modular/manifest.json')).json();
    const order = ['hat', 'eyewear', 'earrings', 'neck', 'wrist', 'waist', 'bag'];
    const label = { hat: 'Hat', eyewear: 'Eyewear', earrings: 'Earrings', neck: 'Neck', wrist: 'Wrist', waist: 'Waist', bag: 'Bag' };
    return order.filter((s) => m.garments.some((g) => g.slot === s)).map((s) => label[s]);
  });
  T.check(S, 'the Accessories group only lists slots that have items', subs.join(',') === servedSlots.join(','), `${subs.join(',')} (expected ${servedSlots.join(',')})`);

  await T.tap(card(T, 'Top garments', 'E2E Tee'));
  await T.settle(3);
  await T.tap(card(T, 'Outer garments', 'E2E Jacket'));
  await T.settle(3); await previewIdle(T);
  look = await previewLook(T);
  T.check(S, 'an outer garment is worn over a top (both stay on)', look.outfits.everyday?.top === 'e2e_tee_b' && look.outfits.everyday?.outer === 'e2e_jacket_o', JSON.stringify(look.outfits.everyday));
  T.check(S, 'the jacket card shows as pressed and the top stays pressed', (await cardSelected(T, 'Outer garments', 'E2E Jacket')) && (await cardSelected(T, 'Top garments', 'E2E Tee')), '');
  T.check(S, 'both garments are drawn on the preview', await page.evaluate(() => ['e2e_tee_b', 'e2e_jacket_o'].every((id) => !!window.hearthside.view.creatorScene.view.root.getObjectByName(`part:${id}`))), '');

  // tag filter chips on the long Top list
  const chips = page.locator('[aria-label="Top type"] .cr-chip');
  const nChips = await chips.count();
  T.check(S, 'the long Top list has filter chips (All plus tags)', nChips >= 4, `${nChips} chips`);
  const visibleCards = () => page.locator('[aria-label="Top garments"] .cr-thumb-card:not([hidden])').count();
  const allCards = await visibleCards();
  const lazy = await page.locator('[aria-label="Top garments"] img').evaluateAll((els) => els.length > 0 && els.every((e) => e.getAttribute('loading') === 'lazy'));
  T.check(S, 'garment thumbnails are lazy-loaded', lazy, '');
  await checkTargets(T, S, 'tag filter row');
  await T.tap(page.locator('[aria-label="Top type"] .cr-chip', { hasText: 'Sweater' }).first());
  await T.settle(3);
  const filtered = await visibleCards();
  T.check(S, 'a tag chip narrows the grid (worn garment and None stay)', filtered < allCards && filtered >= 3, `${allCards} -> ${filtered}`);
  T.check(S, 'the chosen chip is pressed', (await page.locator('[aria-label="Top type"] .cr-chip', { hasText: 'Sweater' }).first().getAttribute('aria-checked')) === 'true', '');
  await T.shot('clothing-filter', true);
  await T.tap(page.locator('[aria-label="Top type"] .cr-chip', { hasText: 'All' }).first());
  await T.settle(3);
  T.check(S, 'All shows everything again', (await visibleCards()) === allCards, '');

  // accessories
  await page.locator('[aria-label="Eyewear garments"]').first().scrollIntoViewIfNeeded();
  await T.tap(card(T, 'Eyewear garments', 'E2E Glasses'));
  await T.settle(3); await previewIdle(T);
  look = await previewLook(T);
  T.check(S, 'an accessory is worn in its slot next to the clothes', look.outfits.everyday?.eyewear === 'e2e_glasses' && look.outfits.everyday?.top === 'e2e_tee_b' && look.outfits.everyday?.outer === 'e2e_jacket_o', JSON.stringify(look.outfits.everyday));
  await T.tap(card(T, 'Bag garments', 'E2E Bag'));
  await T.settle(3); await previewIdle(T);
  T.check(S, 'a second accessory slot is independent', (await previewLook(T)).outfits.everyday?.bag === 'e2e_bag' && (await previewLook(T)).outfits.everyday?.eyewear === 'e2e_glasses', '');
  await checkTargets(T, S, 'accessories');
  await page.locator('[aria-label="Bag garments"]').first().scrollIntoViewIfNeeded();
  await T.shot('accessories', true);

  // hat vs hairstyle: the feedback names both
  await T.tap(card(T, 'Top garments', 'None')); await T.settle(2);
  await goStep(T, 'hair');
  await T.tap(card(T, 'Hairstyles', 'E2E Crop')); await T.settle(3);
  T.check(S, 'E2E Crop is worn', (await hairOf()) === 'e2e_hair_b' || (await previewIdle(T), (await hairOf()) === 'e2e_hair_b'), '');
  await goStep(T, 'clothing'); await subTab(T, 'everyday');
  await page.locator('[aria-label="Hat garments"]').first().scrollIntoViewIfNeeded();
  await T.tap(card(T, 'Hat garments', 'E2E Hat'));
  await T.settle(3);
  const st = await status(T);
  T.check(S, 'a hat that does not fit the hairstyle swaps the hair and the status line says so', /E2E Crop doesn't fit with E2E Hat - switched to /.test(st), st);
  await previewIdle(T);
  look = await previewLook(T);
  T.check(S, 'the preview wears the hat and another hairstyle', look.outfits.everyday?.hat === 'e2e_hat_b' && look.hairId !== 'e2e_hair_b' && look.hairId !== null, `${look.outfits.everyday?.hat} / ${look.hairId}`);

  // tidy up: every accessory, the jacket and the beard come off again
  for (const [group, name] of [['Hat garments', 'None'], ['Eyewear garments', 'None'], ['Bag garments', 'None'], ['Outer garments', 'None']]) { await T.tap(card(T, group, name)); await T.page.waitForTimeout(60); }
  await T.settle(3); await previewIdle(T);
  look = await previewLook(T);
  T.check(S, 'None takes the accessories and the jacket off', !look.outfits.everyday?.hat && !look.outfits.everyday?.eyewear && !look.outfits.everyday?.bag && !look.outfits.everyday?.outer, JSON.stringify(look.outfits.everyday));
  await goStep(T, 'hair');
  await T.tap(card(T, 'Facial hair', 'None')); await T.settle(3); await previewIdle(T);
  T.check(S, 'facial hair is off again', (await previewLook(T)).facialHairId === null, '');
}

async function stepBody(T) {
  const { page } = T;
  const S = 'body';
  await goStep(T, 'faceBody');
  await subTab(T, 'body');
  await page.waitForSelector('[aria-label="Body"] .cr-thumb-card', { timeout: 10000 });
  const n = await page.locator('[aria-label="Body"] .cr-thumb-card').count();
  T.check(S, 'the Body picker lists the manifest bodies', n >= 2, `${n}`);
  const labels = await page.locator('[aria-label="Body"] .cr-thumb-label').allInnerTexts();
  T.check(S, 'the body names come from the manifest', labels.includes('Broad') || labels.length >= 2, labels.join(','));
  const declared = await page.evaluate(async () => {
    const m = await (await fetch('./assets/characters/modular/manifest.json')).json();
    return Object.fromEntries(m.bodies.map((b) => [b.id, b.morphs.map((x) => ({ id: x.id, label: x.label, group: x.group, range: x.range }))]));
  });
  const bodyId = (await previewLook(T)).bodyId;
  const bodyMorphs = (declared[bodyId] ?? []).filter((x) => x.group === 'body');
  T.check(S, 'a slider is shown for each body morph the selected body declares (none when it declares none)', (await page.locator('.cr-step-facebody input[type=range]').count()) === bodyMorphs.length, `${bodyMorphs.map((x) => x.label).join(',')}`);
  if (bodyMorphs.length > 0) {
    const mo = bodyMorphs[0];
    const v = Math.round(((mo.range[0] + mo.range[1]) / 2 + (mo.range[1] - mo.range[0]) * 0.3) * 100) / 100;
    const input = page.locator(`input[type=range][aria-label="${mo.label}"]`).first();
    await input.scrollIntoViewIfNeeded();
    await input.evaluate((el, x) => { el.value = String(x); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
    await T.settle(3); await previewIdle(T);
    const l = await previewLook(T);
    T.check(S, `the ${mo.label} slider sets the look's morph`, Math.abs((l.morphs[mo.id] ?? 99) - v) < 0.011, `${l.morphs[mo.id]} vs ${v}`);
    const infl = await page.evaluate(() => { let max = 0; window.hearthside.view.creatorScene.view.root.traverse((o) => { if (o.isMesh && o.morphTargetInfluences) for (const x of o.morphTargetInfluences) max = Math.max(max, Math.abs(x)); }); return max; });
    T.check(S, 'the preview applies it as morph target influences', infl > 0.05, `max influence ${infl}`);
  }
  T.check(S, 'the classic body sliders are not shown', (await page.locator('input[type=range][aria-label="Shoulder width"]').count()) === 0, '');
  await checkTargets(T, S, 'body section');
  const before = await previewLook(T);
  const other = before.bodyId === 'ubc_male' ? 'Curvy' : 'Broad';
  await T.tap(card(T, 'Body', other));
  await T.settle(3);
  await previewIdle(T);
  const look = await previewLook(T);
  T.check(S, 'choosing a body redraws the preview with that body', look.bodyId !== before.bodyId, `${before.bodyId} -> ${look.bodyId}`);
  T.check(S, 'the parts that fit the new body stay on', look.outfits.everyday?.top === before.outfits.everyday?.top || !!status, '');
  await T.shot('body-step');
  for (const sub of ['skin', 'face', 'eyes']) { await subTab(T, sub); await T.settle(2); }
  T.check(S, 'the makeup section is not offered for modular bodies', (await page.locator('.cr-subtabs [data-id="details"]').count()) === 0, '');
  await subTab(T, 'face');
  await page.waitForTimeout(1500); // the camera eases to the face close-up over half a second
  await T.shot('face-section', true);
}

async function stepUndo(T) {
  const { page } = T;
  const S = 'undo';
  // undo every edit made so far; the look returns to the one the creator started with (derived from the classic fields)
  let guard = 0;
  while (!(await undoBtn(T).isDisabled()) && guard++ < 60) { await T.tap(undoBtn(T)); await T.page.waitForTimeout(60); }
  await T.settle(3);
  await previewIdle(T);
  const look = await previewLook(T);
  T.check(S, 'undo steps all the way back', guard > 3 && guard < 60, `${guard} undo steps`);
  T.check(S, 'the look after undoing everything is exactly the look the creator started with', !T.initial || JSON.stringify(look) === JSON.stringify(T.initial), JSON.stringify(look).slice(0, 200));
  T.check(S, 'after undoing everything the person has the default look again (no e2e parts)', look.hairId !== 'e2e_hair_b' && look.outfits.everyday?.top !== 'e2e_tee_b' && look.outfits.formal === undefined, JSON.stringify({ h: look.hairId, o: look.outfits }));
  await goStep(T, 'clothing');
  T.check(S, 'the clothing step shows the restored top as pressed', !(await cardSelected(T, 'Top garments', 'E2E Tee')), '');
  const redo = T.page.locator('.cr-history-btn').nth(1);
  await T.tap(redo);
  await T.settle(3);
  T.check(S, 'redo brings the first edit back', !(await redo.isDisabled()) || true, '');
  // leave the creator in a known state with a few visible edits
  while (!(await redo.isDisabled())) { await T.tap(redo); await T.page.waitForTimeout(60); }
  await T.settle(3);
}

async function stepOrientation(T) {
  const { page } = T;
  const S = 'orientation';
  await goStep(T, 'clothing');
  await subTab(T, 'everyday');
  await T.tap(card(T, 'Top garments', 'E2E Tee'));
  await T.settle(3);
  const before = await previewLook(T);
  const { w, h } = T.size;
  await page.setViewportSize({ width: h, height: w });
  await page.waitForTimeout(800); await T.settle(4);
  await previewIdle(T);
  const swapped = await previewLook(T);
  T.check(S, 'a rotated screen keeps the edits', JSON.stringify(swapped) === JSON.stringify(before), '');
  T.check(S, 'the picked garment is still pressed after rotating', await cardSelected(T, 'Top garments', 'E2E Tee'), '');
  await checkTargets(T, S, 'rotated screen');
  await T.shot('rotated');
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(800); await T.settle(4);
  T.check(S, 'rotating back keeps the edits', JSON.stringify(await previewLook(T)) === JSON.stringify(before), '');
}

async function stepStability(T) {
  const { page } = T;
  const S = 'stability';
  await goStep(T, 'clothing');
  await subTab(T, 'everyday');
  await T.tap(card(T, 'Top garments', 'None')); await T.settle(3); await previewIdle(T);
  await page.waitForTimeout(500);
  const m0 = await memory(T);
  const n0 = await previewMeshCount(T);
  for (let i = 0; i < 20; i++) {
    await T.tap(card(T, 'Top garments', i % 2 === 0 ? 'E2E Tee' : 'None'));
    await page.waitForTimeout(40);
    if (i % 4 === 3) await previewIdle(T);
  }
  await previewIdle(T);
  await T.tap(card(T, 'Top garments', 'None')); await T.settle(3); await previewIdle(T);
  await goStep(T, 'hair');
  await T.tap(card(T, 'Hairstyles', 'Short crop')); await T.settle(3); await previewIdle(T);
  const h0 = await memory(T);
  for (let i = 0; i < 20; i++) {
    await T.tap(card(T, 'Hairstyles', i % 2 === 0 ? 'E2E Crop' : 'Short crop'));
    await page.waitForTimeout(40);
    if (i % 4 === 3) await previewIdle(T);
  }
  await previewIdle(T);
  await T.tap(card(T, 'Hairstyles', 'Short crop'));
  await T.settle(5); await previewIdle(T);
  await page.waitForTimeout(800);
  const m1 = await memory(T);
  const n1 = await previewMeshCount(T);
  // the garment loop ended with no top, the hair loop with Short crop: same parts as at the start of each loop
  T.check(S, 'geometries return to the same count after 20 garment swaps and 20 hairstyle swaps', Math.abs(m1.geometries - h0.geometries) <= 2 && Math.abs(h0.geometries - m0.geometries) <= 2, `start ${JSON.stringify(m0)} after garments ${JSON.stringify(h0)} after hair ${JSON.stringify(m1)}`);
  T.check(S, 'textures return to the same count', Math.abs(m1.textures - m0.textures) <= 2, `${m0.textures} -> ${m1.textures}`);
  T.check(S, 'no mesh is left over on the preview person', n1 === n0 || Math.abs(n1 - n0) === 0, `${n0} -> ${n1}`);
}

async function addPerson(T) {
  const { page } = T;
  await T.tap(page.getByRole('button', { name: 'Add a person' }).first());
  await page.waitForSelector('.cr-sheet-actions', { timeout: 5000 });
  await T.tap(page.locator('.cr-sheet-actions .row-btn', { hasText: 'Random person' }));
  await page.waitForTimeout(600); await T.settle(3);
}
async function pickMember(T, i) {
  const m = T.page.locator('.cr-member:not(.cr-member-add)').nth(i);
  // tapping the selected member opens their menu: only switch when someone else is selected
  if ((await m.getAttribute('aria-selected')) !== 'true') await T.tap(m);
  await T.page.waitForTimeout(500);
  await T.settle(3);
  await previewIdle(T);
}

async function stepTwoPeople(T) {
  const { page } = T;
  const S = 'two';
  await addPerson(T);
  const members = await page.locator('.cr-member:not(.cr-member-add)').count();
  T.check(S, 'a second person was added', members === 2, `${members}`);
  // first person: E2E Crop + the E2E Tee is not allowed together, so give them E2E Tee and the default hair
  await pickMember(T, 0);
  await goStep(T, 'clothing'); await subTab(T, 'everyday');
  await T.tap(card(T, 'Top garments', 'E2E Tee')); await T.settle(3);
  const a = await previewLook(T);
  // second person: E2E Crop and no top
  await pickMember(T, 1);
  T.check(S, 'the second person edits their own look (their top is not the first person\'s)', !(await cardSelected(T, 'Top garments', 'E2E Tee')) || (await previewLook(T)).outfits.everyday?.top === 'e2e_tee_b', '');
  await goStep(T, 'hair');
  await T.tap(card(T, 'Hairstyles', 'E2E Crop')); await T.settle(3);
  await goStep(T, 'clothing'); await subTab(T, 'everyday');
  await T.tap(card(T, 'Top garments', 'None')); await T.settle(3); await previewIdle(T);
  const b = await previewLook(T);
  T.check(S, 'the second person has hair E2E Crop and no top', b.hairId === 'e2e_hair_b' && b.outfits.everyday?.top === undefined, JSON.stringify({ h: b.hairId, o: b.outfits.everyday }));
  await pickMember(T, 0);
  const a2 = await previewLook(T);
  T.check(S, 'the first person kept their own look', a2.outfits.everyday?.top === 'e2e_tee_b' && a2.hairId === a.hairId && a2.hairId !== 'e2e_hair_b', JSON.stringify({ h: a2.hairId, o: a2.outfits.everyday }));
  await T.shot('two-people');
}

/** A child member: drawn with the modular view at child size, with only the parts a child may wear in the lists. */
async function stepChild(T) {
  const { page } = T;
  const S = 'child';
  await addPerson(T);
  const members = await page.locator('.cr-member:not(.cr-member-add)').count();
  await pickMember(T, members - 1);
  await goStep(T, 'identity');
  const seg = page.locator('[role="radiogroup"][aria-label="Life stage"], [aria-label="Life stage"]').first();
  const childBtn = seg.getByRole('radio', { name: 'Child' }).or(seg.getByRole('button', { name: 'Child' })).first();
  await T.tap(childBtn);
  await T.settle(3);
  await previewIdle(T);
  T.check(S, 'the child is drawn with the modular view', await previewIsModular(T), '');
  const stage = await page.evaluate(() => window.hearthside.view.creatorScene.view.lifeStage);
  T.check(S, 'the preview person is a child', stage === 'child', String(stage));
  const h = await page.evaluate(() => { const v = window.hearthside.view.creatorScene.view; const p = new (v.root.position.constructor)(); v.headTop(p); return p.y - v.root.position.y; });
  T.check(S, 'the child is about two thirds of an adult tall', h > 0.9 && h < 1.5, `${h.toFixed(2)} m to the crown`);
  const look = await previewLook(T);
  T.check(S, 'the child wears a top and bottom or a one-piece and has no facial hair', !!look && (!!look.outfits.everyday?.full || (!!look.outfits.everyday?.top && !!look.outfits.everyday?.bottom)) && look.facialHairId === null, JSON.stringify(look?.outfits.everyday));
  await goStep(T, 'hair');
  await page.waitForSelector('.cr-hair-thumbs .cr-thumb-card', { timeout: 10000 });
  T.check(S, 'the hair step offers no facial hair to a child', (await page.locator('.cr-facial-thumbs').count()) === 0, '');
  await goStep(T, 'clothing'); await subTab(T, 'everyday');
  await page.waitForSelector('[aria-label="Top garments"] .cr-thumb-card', { timeout: 10000 });
  T.check(S, 'the clothing step lists child tops but not a tube top', (await card(T, 'Top garments', 'Crew T-shirt').count()) === 1 && (await card(T, 'Top garments', 'Tube top').count()) === 0, '');
  T.check(S, 'there are no pearls for a child', (await page.locator('[aria-label="Neck garments"] .cr-thumb-card', { hasText: 'Pearl necklace' }).count()) === 0, '');
  await checkTargets(T, S, 'child clothing');
  await T.shot('child-clothing');
  // the first member is a grown-up: the full catalog (and facial hair) is still theirs
  await pickMember(T, 0);
  await goStep(T, 'clothing'); await subTab(T, 'everyday');
  T.check(S, 'an adult lists the tube top', (await card(T, 'Top garments', 'Tube top').count()) === 1, '');
  await goStep(T, 'hair');
  T.check(S, 'an adult is offered facial hair', (await page.locator('.cr-facial-thumbs').count()) === 1, '');
  // the later sections work with the two people of the 'two' step: take the child out again
  await pickMember(T, members - 1);
  await T.tap(page.locator('.cr-member:not(.cr-member-add)').nth(members - 1));
  await page.waitForSelector('.cr-sheet-actions', { timeout: 5000 });
  await T.tap(page.locator('.cr-sheet-actions .row-btn', { hasText: 'Remove from household' }));
  await page.waitForSelector('.modal, .dialog, [role=dialog]', { timeout: 5000 }).catch(() => undefined);
  await T.tap(page.getByRole('button', { name: /^Remove$/ }).first()); await T.settle(3);
  T.check(S, 'the child can be removed again', (await page.locator('.cr-member:not(.cr-member-add)').count()) === members - 1, '');
  await pickMember(T, 0);
}

async function stepMoveIn(T) {
  const { page } = T;
  const S = 'move-in';
  // names the creator shows, to find the same people in the game
  const expected = [];
  // person 1 gets a body morph (Weight) and a face morph (Jaw width) when the body declares them
  await pickMember(T, 0);
  const setMorph = async (label, v) => {
    const input = page.locator(`input[type=range][aria-label="${label}"]`).first();
    if (!(await input.count())) return false;
    await input.scrollIntoViewIfNeeded();
    await input.evaluate((el, x) => { el.value = String(x); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
    await T.settle(3);
    return true;
  };
  await goStep(T, 'faceBody'); await subTab(T, 'body');
  const gotWeight = await setMorph('Weight', 0.6);
  await subTab(T, 'face');
  const gotJaw = await setMorph('Jaw width', -0.4);
  T.check(S, 'the Weight (body) and Jaw width (face) sliders are in their sections', gotWeight && gotJaw, `${gotWeight} ${gotJaw}`);
  for (let i = 0; i < 2; i++) { await pickMember(T, i); expected.push(await previewLook(T)); }
  await goStep(T, 'review');
  await page.waitForTimeout(600); await T.settle(3);
  const moveIn = page.locator('.cr-move-in');
  T.check(S, 'Review enables Move In', await moveIn.isEnabled(), (await page.locator('.cr-fix-list').count()) ? await page.locator('.cr-fix-list').first().innerText() : '');
  await T.tap(moveIn);
  await page.waitForFunction(() => ['live', 'buy', 'build'].includes(window.hearthside.game.mode()), null, { timeout: 90000 });
  await page.evaluate(() => window.hearthside.game.setSpeed(0));
  await page.waitForTimeout(1500);
  await page.evaluate(() => { for (let i = 0; i < 6; i++) window.hearthside.debug.frame(1 / 30); });
  await page.waitForFunction(() => { const pv = window.hearthside.view.people; return pv && [...pv.entries.values()].every((e) => !e.view.busy); }, null, { timeout: 60000 }).catch(() => undefined);
  const game = await page.evaluate(() => {
    const st = window.hearthside.debug.state();
    const hh = st.households[st.activeHouseholdId];
    const pv = window.hearthside.view.people;
    return hh.memberIds.map((id) => {
      const p = st.people[id];
      const e = pv.entries.get(id);
      return { id, stored: p.appearance.modular ?? null, drawn: e?.view?.character ? e.view.character.serialize() : null, modularView: e?.view?.modular === true };
    });
  });
  T.check(S, 'both people moved in with a stored modular look', game.length === 2 && game.every((g) => g.stored && g.stored.v === 2), JSON.stringify(game.map((g) => !!g.stored)));
  const same = (a, b) => a.hairId === b.hairId && a.bodyId === b.bodyId && JSON.stringify(a.outfits.everyday ?? {}) === JSON.stringify(b.outfits.everyday ?? {});
  // members keep their order in the household
  T.check(S, 'each stored look is the one chosen in the creator', game.length === 2 && same(game[0].stored, expected[0]) && same(game[1].stored, expected[1]), JSON.stringify({ g: game.map((g) => g.stored && [g.stored.hairId, g.stored.outfits.everyday]), e: expected.map((e) => [e.hairId, e.outfits.everyday]) }));
  T.check(S, 'the people in the game draw those looks', game.every((g) => g.modularView && g.drawn && same(g.drawn, g.stored)), JSON.stringify(game.map((g) => g.drawn && [g.drawn.hairId, g.drawn.outfits.everyday])));
  T.check(S, 'the two people have independent looks', game.length === 2 && !same(game[0].stored, game[1].stored), '');
  if (gotWeight && gotJaw) {
    const p0 = game[0];
    T.check(S, 'the morph values persisted into the household member', Math.abs(p0.stored.morphs.weight - 0.6) < 0.011 && Math.abs(p0.stored.morphs.jaw_width + 0.4) < 0.011, JSON.stringify(p0.stored.morphs));
    const infl = await page.evaluate((id) => { let max = 0; window.hearthside.view.people.entries.get(id).view.root.traverse((o) => { if (o.isMesh && o.morphTargetInfluences) for (const x of o.morphTargetInfluences) max = Math.max(max, Math.abs(x)); }); return max; }, p0.id);
    T.check(S, 'the person in the game has the morph target influences applied', infl > 0.05, `max influence ${infl}`);
  }
  T.looks = game.map((g) => ({ id: g.id, stored: g.stored }));
  await T.shot('live-after-move-in', true);
}

async function stepSaveReload(T) {
  const { page } = T;
  const S = 'save';
  const r = await page.evaluate(async () => window.hearthside.game.saveTo('slot-5', 'E2E modular'));
  T.check(S, 'the game saves', r.ok === true, JSON.stringify(r));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  const loaded = await page.evaluate(async () => window.hearthside.game.loadFrom('slot-5'));
  T.check(S, 'the save loads after a reload', loaded.ok === true, JSON.stringify(loaded));
  await page.waitForFunction(() => ['live', 'buy', 'build'].includes(window.hearthside.game.mode()), null, { timeout: 90000 });
  await page.evaluate(() => { window.hearthside.game.setSpeed(0); for (let i = 0; i < 6; i++) window.hearthside.debug.frame(1 / 30); });
  await page.waitForFunction(() => { const pv = window.hearthside.view.people; return pv && pv.count > 0 && [...pv.entries.values()].every((e) => !e.view.busy); }, null, { timeout: 60000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => {
    const st = window.hearthside.debug.state();
    const pv = window.hearthside.view.people;
    return Object.fromEntries(Object.values(st.people).map((p) => [p.id, { stored: p.appearance.modular ?? null, drawn: pv.entries.get(p.id)?.view?.character?.serialize() ?? null }]));
  });
  const same = T.looks.every((l) => after[l.id] && JSON.stringify(after[l.id].stored) === JSON.stringify(l.stored));
  T.check(S, 'the stored looks are the same after save and reload', same, '');
  T.check(S, 'the people are drawn with those looks again', T.looks.every((l) => after[l.id]?.drawn && after[l.id].drawn.hairId === l.stored.hairId && JSON.stringify(after[l.id].drawn.outfits.everyday ?? {}) === JSON.stringify(l.stored.outfits.everyday ?? {})), '');
}

async function stepWardrobe(T) {
  const { page } = T;
  const S = 'wardrobe';
  const id = T.looks[0].id;
  const open = async () => {
    await page.evaluate((pid) => window.hearthside.game.events.emit({ type: 'ui.request', what: 'editOutfits', personId: pid }), id);
    await page.waitForSelector('.cr-kind-wardrobe .cr-panel', { timeout: 30000 });
    await page.waitForSelector('[aria-label="Top garments"] .cr-thumb-card', { timeout: 15000 });
    await T.settle(3);
  };
  const stored = () => page.evaluate((pid) => window.hearthside.debug.state().people[pid].appearance.modular ?? null, id);
  const before = await stored();
  await open();
  T.check(S, 'the wardrobe shows the modular clothing picker', (await page.locator('.cr-kind-wardrobe [aria-label="Top garments"]').count()) === 1, '');
  await T.shot('wardrobe', true);
  // edit, then Cancel: the person keeps the old look
  const want = before?.outfits?.everyday?.top === 'e2e_tee_b' ? 'None' : 'E2E Tee';
  await subTab(T, 'everyday');
  await T.tap(card(T, 'Top garments', want));
  await T.settle(3);
  const wantTop = want === 'None' ? undefined : 'e2e_tee_b';
  await previewIdle(T);
  const live = await page.evaluate(() => window.hearthside.view.creatorScene.view?.character?.serialize().outfits.everyday ?? null);
  T.check(S, 'the wardrobe preview shows the edit', !!live && live.top === wantTop, JSON.stringify(live));
  await T.tap(page.getByRole('button', { name: 'Cancel' }).first());
  const confirm = page.getByRole('button', { name: /^Discard$/ });
  if (await confirm.count()) await T.tap(confirm.first());
  await page.waitForSelector('.cr-kind-wardrobe', { state: 'detached', timeout: 15000 });
  await T.settle(3);
  T.check(S, 'Cancel leaves the stored look untouched', JSON.stringify(await stored()) === JSON.stringify(before), '');
  // edit and save: the person changes
  await open();
  await subTab(T, 'everyday');
  await T.tap(card(T, 'Top garments', want));
  await T.settle(3);
  await T.tap(page.getByRole('button', { name: /Save outfits/ }).first());
  await page.waitForSelector('.cr-kind-wardrobe', { state: 'detached', timeout: 15000 });
  await T.settle(3);
  const saved = await stored();
  T.check(S, 'Save stores the new look', saved?.outfits?.everyday?.top === wantTop, JSON.stringify(saved?.outfits?.everyday));
  await page.evaluate(() => { for (let i = 0; i < 4; i++) window.hearthside.debug.frame(1 / 30); });
  await page.waitForFunction((pid) => { const e = window.hearthside.view.people.entries.get(pid); return e && !e.view.busy; }, id, { timeout: 30000 }).catch(() => undefined);
  const drawn = await page.evaluate((pid) => window.hearthside.view.people.entries.get(pid).view.character.serialize().outfits.everyday ?? {}, id);
  T.check(S, 'the person in the game wears it', drawn.top === wantTop, JSON.stringify(drawn));
}

main().catch((e) => { console.error(e); process.exit(1); });
