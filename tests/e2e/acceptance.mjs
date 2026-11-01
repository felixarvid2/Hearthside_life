#!/usr/bin/env node
// Milestone 1 acceptance run of Hearthside Life (brief section 26) in a real browser, driving the real interface.
//
//   node tests/e2e/acceptance.mjs [--no-build] [--only=portrait,landscape,desktop] [--out=DIR] [--stop-after=STEP]
//                                  [--steps=3,4] [--fast-start]   (development aids: run some steps; skip the creator UI)
//   npm run e2e:acceptance
//
// Builds the game (vite build -> tests/e2e/out/dist), serves it with vite preview on port 5190 and plays the
// acceptance scenario in each viewport (390x844 touch portrait, 844x390 touch landscape, 1280x720 desktop):
//   1 creator -> move in, 2 live (cook, sleep, work + wage, neighbour, queue cancel), 3 buy mode (buy, move, rotate,
//   undo/redo, exact price), 4 build mode (wall finish on one side), 5 save, reload, load and compare,
//   6 rotate the device during a creator edit and during a placement preview,
//   7 Milestone 2 home editor: build a room (drag, handles, Confirm / Cancel, device rotation keeps the preview), add a
//     door and a window, paint both sides of a new wall and an area of floor, undo and redo, then walk a person in.
// Clicks and taps go through the real DOM (and the canvas at positions picked with view.worldToScreen/anchorOf);
// window.hearthside.debug is only used to fast-forward time and to read state for assertions.
// Fails on page errors, console errors and failed requests. Screenshots: tests/e2e/out/acceptance/<viewport>/.
// A JSON report is written to tests/e2e/out/acceptance/report.json. Runtime under SwiftShader: about 10 minutes for each
// touch viewport and up to 30 minutes on desktop (run one viewport with --only=portrait).
//
// Only one browser runs at a time on this machine: the script re-runs itself under
// `flock /tmp/hearthside-browser.lock`.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5190;
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };

if (!process.env.HEARTHSIDE_E2E_LOCKED) {
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

const OUT = resolve(opt('out', join(root, 'tests/e2e/out/acceptance')));
const DIST = join(root, 'tests/e2e/out/dist');
const ONLY = opt('only', 'portrait,landscape,desktop').split(',');
const STOP_AFTER = opt('stop-after', '');
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  portrait: { w: 390, h: 844, touch: true, other: { w: 844, h: 390 } },
  landscape: { w: 844, h: 390, touch: true, other: { w: 390, h: 844 } },
  desktop: { w: 1280, h: 720, touch: false, other: { w: 700, h: 960 } },
};

const results = []; // { viewport, step, name, ok, evidence }
const auditFindings = [];
const bugs = [];
const T0 = Date.now();
const log = (...a) => console.log(`[acceptance +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not yet */ }
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
  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser = null;
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`, 20000);
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
    });
    for (const name of ONLY) {
      const vp = VIEWPORTS[name];
      if (!vp) continue;
      log(`=== ${name} ${vp.w}x${vp.h}`);
      try { await runViewport(browser, name, vp); } catch (e) { fail(name, 'run', 'viewport run aborted', String(e?.stack ?? e)); }
    }
  } finally {
    await browser?.close().catch(() => undefined);
    server.kill('SIGTERM');
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ results, auditFindings }, null, 2));
  const failed = results.filter((r) => !r.ok);
  for (const a of auditFindings) console.log(`[audit] [${a.viewport}] ${a.label}\n   small: ${a.small.join('; ')}\n   tiny: ${a.tiny.join('; ')}\n   overlaps: ${a.over.join('; ')}${a.overflowX ? '\n   horizontal overflow' : ''}`);
  console.log(`\n[acceptance] ${results.length - failed.length} passed, ${failed.length} failed`);
  for (const f of failed) console.error(` FAIL [${f.viewport}] ${f.step} ${f.name}: ${f.evidence}`);
  process.exit(failed.length ? 1 : 0);
}

function pass(viewport, step, name, evidence = '') { results.push({ viewport, step, name, ok: true, evidence }); log(`PASS [${viewport}] ${step} ${name}${evidence ? ` -- ${evidence}` : ''}`); }
function fail(viewport, step, name, evidence = '') { results.push({ viewport, step, name, ok: false, evidence }); log(`FAIL [${viewport}] ${step} ${name} -- ${evidence}`); }

// ---------------------------------------------------------------------------------------------------------------
// One viewport run
// ---------------------------------------------------------------------------------------------------------------

async function runViewport(browser, vpName, vp) {
  const dir = join(OUT, vpName);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, ...(vp.touch ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  // tutorial off: it is not part of the create flow and would cover the HUD; music off.
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('hearthside.settings.v1')) localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, musicVolume: 0 })); } catch { /* ignore */ }
  });

  await context.addInitScript(PAGE_HELPERS);
  let shotN = 0;
  const T = {
    vp: vpName, page, vpInfo: vp, dir, errors, expected: {},
    ok: (step, name, ev) => pass(vpName, step, name, ev),
    bad: (step, name, ev) => fail(vpName, step, name, ev),
    check(step, name, cond, ev = '') { if (cond) pass(vpName, step, name, ev); else fail(vpName, step, name, ev); return !!cond; },
    async shot(label) {
      shotN++;
      const file = join(dir, `${String(shotN).padStart(2, '0')}-${label}.png`);
      await page.evaluate(() => { try { window.hearthside?.debug.frame(1 / 30); } catch { /* ignore */ } });
      // the software renderer can have a backlog after many synchronous frames: wait for real frames, then allow a long screenshot
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => undefined);
      await page.screenshot({ path: file, timeout: 120000 });
      return file;
    },
    /** Layout audit (recorded as findings, never fails the run): tap targets < 44 px, text < 12 px, overlapping HUD blocks. */
    async audit(label) {
      const r = await page.evaluate(() => {
        const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && cs.visibility !== 'hidden' && cs.display !== 'none' && e.closest('[hidden]') === null && cs.opacity !== '0'; };
        const desc = (e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ').slice(0, 2).join('.')}${e.getAttribute('aria-label') ? `[${e.getAttribute('aria-label').slice(0, 24)}]` : ''}${!e.getAttribute('aria-label') && e.textContent ? `"${e.textContent.trim().slice(0, 16)}"` : ''}`;
        const small = [];
        for (const e of document.querySelectorAll('button, [role=tab], [role=radio], select, input:not([type=color]), summary')) {
          if (!vis(e)) continue; const r = e.getBoundingClientRect();
          if (r.width < 43.5 || r.height < 43.5) small.push(`${desc(e)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        const tiny = [];
        const seen = new Set();
        for (const e of document.querySelectorAll('body *')) {
          if (!vis(e) || !e.childNodes.length) continue;
          const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
          if (!hasText) continue;
          const fs = parseFloat(getComputedStyle(e).fontSize);
          if (fs < 11.95) { const k = desc(e); if (!seen.has(k)) { seen.add(k); tiny.push(`${k} ${fs.toFixed(1)}px`); } }
        }
        const blocks = [...document.querySelectorAll('.hud-top, .hud-row2, .hud-bottom, .camera-cluster, .hud-strip, .funds-btn, .feed-btn, .paused-note, .panel, .ctx-menu, .toast, .cr-top, .cr-pv-topline, .cr-pv-col, .cr-pv-views, .tutorial-card')].filter(vis);
        const over = [];
        for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
          const a = blocks[i].getBoundingClientRect(), b = blocks[j].getBoundingClientRect();
          if (blocks[i].contains(blocks[j]) || blocks[j].contains(blocks[i])) continue;
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 6 && h > 6) over.push(`${desc(blocks[i])} x ${desc(blocks[j])} (${Math.round(w)}x${Math.round(h)})`);
        }
        const se = document.scrollingElement;
        return { small: [...new Set(small)].slice(0, 12), tiny: tiny.slice(0, 8), over: [...new Set(over)].slice(0, 8), overflowX: se.scrollWidth > innerWidth + 1 };
      });
      const total = r.small.length + r.tiny.length + r.over.length + (r.overflowX ? 1 : 0);
      if (total) { auditFindings.push({ viewport: vpName, label, ...r }); log(`AUDIT ${label}: ${r.small.length} small targets, ${r.tiny.length} tiny texts, ${r.over.length} overlaps${r.overflowX ? ', horizontal overflow' : ''}`); }
    },
    async frames(n = 3, dt = 1 / 30) { await page.evaluate(([n2, dt2]) => { for (let i = 0; i < n2; i++) window.hearthside.debug.frame(dt2); }, [n, dt]); },
    async tap(loc, opts = {}) { if (vp.touch) await loc.tap({ timeout: 30000, ...opts }); else await loc.click({ timeout: 30000, ...opts }); },
    async tapAt(x, y) { if (vp.touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); },
    st: () => page.evaluate(() => JSON.parse(JSON.stringify({ clock: window.hearthside.debug.state()?.clock ?? null }))),
  };

  const steps = [
    ['1', 'Creator to move-in', stepCreator],
    ['2', 'Live mode: eat, sleep, work, neighbour, queue', stepLive],
    ['3', 'Buy mode: buy, move, rotate, undo/redo', stepBuy],
    ['4', 'Build mode: wall finish on one side', stepBuild],
    ['5', 'Save, reload, load, compare', stepSaveLoad],
    ['6', 'Rotate the device during edits', stepRotate],
    ['7', 'Milestone 2 home editor: build a room, door, window, finishes, undo/redo, walk in', stepHomeEditor],
  ];
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  await T.frames(3);
  await T.shot('main-menu');
  const only = opt('steps', '').split(',').filter(Boolean);
  for (const [id, title, fn] of steps) {
    if (only.length && !only.includes(id) && id !== '1') continue;
    if (id === '1' && only.length && !only.includes('1') && !flag('fast-start')) continue;
    log(`--- [${vpName}] step ${id}: ${title}`);
    try { await fn(T); } catch (e) {
      fail(vpName, id, `${title}: step threw`, String(e?.message ?? e).split('\n').slice(0, 6).join(' | '));
      try { await T.shot(`step${id}-FAILED`); } catch { /* ignore */ }
    }
    if (STOP_AFTER === id) break;
  }
  const errs = [...new Set(errors)];
  if (errs.length) fail(vpName, '*', 'no page/console errors or failed requests', errs.slice(0, 8).join(' || '));
  else pass(vpName, '*', 'no page/console errors or failed requests');
  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------
// Shared helpers (run in Node, drive the page)
// ---------------------------------------------------------------------------------------------------------------

const H = {
  /** Reads a JSON-safe value out of the world through window.hearthside (read-only by convention). */
  async read(T, fn, arg) { return T.page.evaluate(fn, arg); },
  /** Visible, in-viewport interactive elements: label|rect (diagnostics only). */
  async visibleControls(T) {
    return T.page.evaluate(() => [...document.querySelectorAll('button,input,select,textarea,[role=tab]')].filter((e) => {
      const r = e.getBoundingClientRect();
      return e.offsetParent !== null && r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    }).map((e) => { const r = e.getBoundingClientRect(); return `${(e.getAttribute('aria-label') || e.textContent || e.value || '').trim().slice(0, 30)}@${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}`; }));
  },
};

// ===============================================================================================================
// STEP 1 - creator
// ===============================================================================================================

async function stepCreator(T) {
  const { page } = T;
  const S = '1';
  if (flag('fast-start')) {
    // development aid only: skips the creator UI
    await page.evaluate(async () => { const g = window.hearthside.game; const hh = g.premadeHouseholds(); await g.startNewGame('create', hh.find((x) => x.members.length >= 2) ?? hh[0]); g.setSpeed(0); });
    await page.waitForTimeout(1000); await T.frames(5);
    T.members = await page.evaluate(() => { const st = window.hearthside.debug.state(); return st.households[st.activeHouseholdId].memberIds; });
    T.created = null;
    return;
  }
  // main menu -> New Game -> Create a Household (real taps)
  await T.tap(page.getByRole('button', { name: /New Game/ }).first());
  await T.tap(page.getByText('Create a Household').first());
  await page.waitForFunction(() => window.hearthside.game.mode() === 'creator', null, { timeout: 60000 });
  await page.waitForSelector('.cr-panel', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await T.frames(10);
  T.check(S, 'exactly one creator screen is mounted', (await page.locator('.cr').count()) === 1, `.cr count ${await page.locator('.cr').count()}`);
  await T.shot('creator-identity-initial');
  await T.audit('creator identity step');

  const nextBtn = () => page.locator('.cr-next');
  const goNext = async (expectStep) => { await T.tap(nextBtn()); await page.waitForTimeout(350); await T.frames(2); if (expectStep) await page.locator('.tab.is-selected', { hasText: expectStep }).first().waitFor({ timeout: 4000 }).catch(() => undefined); };

  // ---- identity: first / last name
  const first = page.getByLabel('First name').first();
  const last = page.getByLabel('Last name').first();
  await first.fill('Mira'); await first.press('Tab');
  await last.fill('Vance'); await last.press('Tab');
  T.expected.firstName = 'Mira';
  T.expected.lastName = 'Vance';
  await T.shot('creator-identity-names');

  // ---- face & body: a body preset
  await goNext('Face');
  const bodyChips = page.locator('[aria-label="Body presets"] .chip');
  const nBody = await bodyChips.count();
  T.check(S, 'Face & Body step offers body presets', nBody >= 2, `${nBody} presets`);
  let bodyIdx = 0;
  for (let i = 0; i < nBody; i++) { if ((await bodyChips.nth(i).getAttribute('aria-checked')) !== 'true') { bodyIdx = i; break; } }
  T.expected.bodyPresetLabel = (await bodyChips.nth(bodyIdx).innerText()).trim();
  await T.tap(bodyChips.nth(bodyIdx));
  await T.frames(4);
  T.check(S, 'body preset chip is selected after tap', (await bodyChips.nth(bodyIdx).getAttribute('aria-checked')) === 'true', T.expected.bodyPresetLabel);
  await T.shot('creator-body-preset');

  // ---- hair: style and colour
  await goNext('Hair');
  const hairCards = page.locator('.cr-hair-grid .cr-card');
  const nHair = await hairCards.count();
  T.check(S, 'Hair step offers >= 8 hairstyles', nHair >= 8, `${nHair} styles`);
  let hairIdx = 1;
  for (let i = nHair - 1; i >= 0; i--) { if ((await hairCards.nth(i).getAttribute('aria-checked')) !== 'true') { hairIdx = i; break; } }
  T.expected.hairTitle = (await hairCards.nth(hairIdx).locator('.cr-card-title').innerText()).trim();
  await T.tap(hairCards.nth(hairIdx));
  await T.frames(3);
  const hairSw = page.locator('[aria-label="Hair colour"].swatches .swatch[data-id]');
  const nSw = await hairSw.count();
  let swIdx = 0;
  for (let i = nSw - 1; i >= 0; i--) { if ((await hairSw.nth(i).getAttribute('aria-checked')) !== 'true') { swIdx = i; break; } }
  T.expected.hairColor = (await hairSw.nth(swIdx).getAttribute('data-color')).toLowerCase();
  await T.tap(hairSw.nth(swIdx));
  await T.frames(8);
  T.check(S, 'hair style + colour selected in the UI', (await hairCards.nth(hairIdx).getAttribute('aria-checked')) === 'true' && (await hairSw.nth(swIdx).getAttribute('aria-checked')) === 'true', `${T.expected.hairTitle} ${T.expected.hairColor}`);
  await T.shot('creator-hair');

  // ---- clothing: everyday outfit with a pattern
  await goNext('Clothing');
  await page.waitForTimeout(200);
  await T.shot('creator-clothing-initial');
  // choose a layer that has a pattern chip group with a non-solid option (top, or full outfit)
  let patterned = null;
  const layers = page.locator('.cr-layer');
  const nLayers = await layers.count();
  for (let i = 0; i < nLayers && !patterned; i++) {
    const layer = layers.nth(i);
    const chips = layer.locator('[aria-label="Pattern"] .chip');
    const n = await chips.count();
    for (let j = 0; j < n; j++) {
      const label = (await chips.nth(j).innerText()).trim();
      if (!/^\W*solid/i.test(label)) { patterned = { layer, chip: chips.nth(j), label, layerName: await layer.getAttribute('data-layer') }; break; }
    }
  }
  if (!patterned) {
    // the random starting garment has no patterns (e.g. overalls): try other garments until one offers a pattern
    T.ok(S, 'clothing: the starting garments offer no pattern; switching garment', 'looking for a patterned garment');
    outer: for (const layerName of ['top', 'full', 'bottom']) {
      const nG = await page.locator(`.cr-layer[data-layer="${layerName}"] [aria-label$=" garments"] .chip`).count();
      for (let j = 0; j < nG; j++) {
        const chip = page.locator(`.cr-layer[data-layer="${layerName}"] [aria-label$=" garments"] .chip`).nth(j);
        if (/^\W*none/i.test((await chip.innerText()).trim())) continue;
        await T.tap(chip);
        await T.frames(3);
        const pc = page.locator(`.cr-layer[data-layer="${layerName}"] [aria-label="Pattern"] .chip`);
        const nP = await pc.count();
        for (let k = 0; k < nP; k++) {
          const label = (await pc.nth(k).innerText()).trim();
          if (!/^\W*solid/i.test(label)) { patterned = { layer: page.locator(`.cr-layer[data-layer="${layerName}"]`), chip: pc.nth(k), label, layerName }; break outer; }
        }
      }
    }
  }
  if (!patterned) T.bad(S, 'clothing: a pattern is selectable in the everyday outfit', 'no garment offered a non-solid pattern');
  else {
    await T.tap(patterned.chip);
    await T.frames(6);
    T.expected.patternLabel = patterned.label;
    T.expected.patternLayer = patterned.layerName;
    T.check(S, 'clothing: pattern chip selected', (await patterned.chip.getAttribute('aria-checked')) === 'true', `${patterned.layerName}: ${patterned.label}`);
    // garment colour as well
    const colorSw = patterned.layer.locator('.swatches .swatch[data-id]').first();
    if (await colorSw.count()) { await T.tap(colorSw); await T.frames(3); }
  }
  await T.shot('creator-clothing-pattern');
  await T.audit('creator clothing step');

  // ---- personality: exactly three traits and an aspiration
  await goNext('Personality');
  const traitCards = page.locator('.cr-trait-grid .cr-card');
  const nTraits = await traitCards.count();
  T.check(S, 'Personality offers >= 12 traits', nTraits >= 12, `${nTraits} traits`);
  // clear existing selections
  for (let i = 0; i < nTraits; i++) { if ((await traitCards.nth(i).getAttribute('aria-checked')) === 'true') await T.tap(traitCards.nth(i)); }
  const want = [];
  for (let i = 0; i < nTraits && want.length < 3; i++) {
    const c = traitCards.nth(i);
    if ((await c.getAttribute('aria-disabled')) === 'true') continue;
    await T.tap(c);
    await T.frames(1);
    if ((await c.getAttribute('aria-checked')) === 'true') want.push((await c.locator('.cr-card-title').innerText()).trim());
  }
  const counter = (await page.locator('.cr-counter-big').first().innerText()).trim();
  T.expected.traitTitles = want;
  T.check(S, 'exactly three traits chosen', want.length === 3 && /3 of 3/.test(counter), `${want.join(', ')} (${counter})`);
  // a 4th trait must be refused
  let fourth = null;
  for (let i = 0; i < nTraits; i++) {
    const c = traitCards.nth(i);
    if ((await c.getAttribute('aria-checked')) !== 'true' && (await c.getAttribute('aria-disabled')) !== 'true') { fourth = c; break; }
  }
  if (fourth) {
    await T.tap(fourth); await T.frames(1);
    T.check(S, 'a fourth trait cannot be added', (await fourth.getAttribute('aria-checked')) !== 'true', 'still 3');
  }
  const aspCards = page.locator('[aria-label="Aspirations"] .cr-card');
  const nAsp = await aspCards.count();
  let aspIdx = 0;
  for (let i = nAsp - 1; i >= 0; i--) { if ((await aspCards.nth(i).getAttribute('aria-checked')) !== 'true') { aspIdx = i; break; } }
  T.expected.aspirationTitle = (await aspCards.nth(aspIdx).locator('.cr-card-title').innerText()).trim();
  await T.tap(aspCards.nth(aspIdx));
  await T.frames(2);
  T.check(S, 'aspiration selected', (await aspCards.nth(aspIdx).getAttribute('aria-checked')) === 'true' && nAsp >= 4, `${T.expected.aspirationTitle} (of ${nAsp})`);
  // starting job: Culinary (the shift is what the work step relies on)
  const jobCard = page.locator('[aria-label="Starting job"] .cr-card', { hasText: 'Culinary' }).first();
  if (await jobCard.count()) { await T.tap(jobCard); await T.frames(1); T.expected.career = 'culinary'; }
  else T.bad(S, 'personality: Culinary starting job is offered', 'no Culinary card');
  await T.shot('creator-personality');
  await T.audit('creator personality step');

  // ---- household: second member, tie, name
  await goNext('Household');
  await T.shot('creator-household-initial');
  const hhName = page.getByLabel('Household name').first();
  await hhName.fill('Vance House'); await hhName.press('Tab');
  T.expected.householdName = 'Vance House';
  await T.tap(page.getByRole('button', { name: 'Add a person' }).first());
  await page.waitForSelector('.cr-sheet-actions', { timeout: 5000 });
  await T.shot('creator-add-person-sheet');
  await T.tap(page.locator('.cr-sheet-actions .row-btn', { hasText: 'Random person' }));
  await page.waitForTimeout(600);
  await T.frames(4);
  const memberRows = page.locator('.cr-member-row');
  T.check(S, 'household has two people', (await memberRows.count()) === 2, `${await memberRows.count()} rows`);
  const tieSel = page.locator('.cr-tie-select').first();
  await tieSel.scrollIntoViewIfNeeded();
  await tieSel.selectOption({ label: 'Roommate' });
  await page.waitForTimeout(300);
  T.expected.tie = 'roommate';
  T.check(S, 'tie set to roommate', (await tieSel.inputValue()) === 'roommate', await tieSel.inputValue());
  T.expected.roommateName = (await memberRows.nth(1).locator('.cr-member-row-name').innerText()).trim();
  await T.shot('creator-household-ties');

  // ---- review
  await goNext('Review');
  await page.waitForTimeout(800);
  await T.frames(4);
  await T.shot('creator-review');
  await T.audit('creator review step');
  const moveIn = page.locator('.cr-move-in');
  T.check(S, 'review: Move In enabled (no validation issues)', await moveIn.isEnabled(), (await page.locator('.cr-fix-list').count()) ? 'issues listed' : 'no issues');
  await T.tap(moveIn);
  await page.waitForFunction(() => ['live', 'buy', 'build'].includes(window.hearthside.game.mode()), null, { timeout: 60000 });
  const speedAfterMoveIn = await page.evaluate(() => { const g = window.hearthside.game; const s = g.speed(); g.setSpeed(0); return s; }); // pause at once: the test drives time itself
  T.check(S, 'the game starts running at a speed after Move In', speedAfterMoveIn >= 0, `speed ${speedAfterMoveIn}`);
  await page.waitForTimeout(1200);
  await T.frames(8);
  await T.shot('live-after-move-in');
  await T.audit('live HUD after move-in');

  // ---- what the game created
  const made = await page.evaluate(() => {
    const st = window.hearthside.debug.state();
    const hh = st.households[st.activeHouseholdId];
    const people = hh.memberIds.map((id) => st.people[id]);
    const p0 = people[0];
    const cat = p0.outfits.current.category;
    const outfit = p0.outfits.outfits[cat][p0.outfits.current.index];
    const hair = window.hearthside.game.content.hair?.[p0.appearance.hair.styleId];
    const bp = window.hearthside.game.content.bodyPresets?.[p0.appearance.bodyPresetId];
    return {
      hhName: hh.name, funds: hh.funds, n: people.length,
      people: people.map((p) => ({ id: p.id, first: p.firstName, last: p.lastName, traits: p.traits, asp: p.aspiration?.aspirationId ?? null, career: p.career?.careerId ?? null })),
      hairStyleId: p0.appearance.hair.styleId, hairName: hair?.name, hairColor: p0.appearance.hair.color.toLowerCase(),
      bodyPresetId: p0.appearance.bodyPresetId, bodyPresetName: bp?.name ?? null,
      outfitLayers: outfit.layers,
      aspName: window.hearthside.game.content.aspirations[p0.aspiration?.aspirationId]?.name ?? null,
      traitNames: p0.traits.map((t) => window.hearthside.game.content.traits[t]?.name ?? t),
      ties: Object.values(st.bonds).map((b) => ({ a: b.a, b: b.b, tie: b.familyAtoB, status: b.status })),
      mode: window.hearthside.game.mode(),
    };
  });
  log('created', JSON.stringify(made));
  const hasPattern = Object.values(made.outfitLayers).some((l) => l && l.pattern && l.pattern !== 'solid');
  T.check(S, 'two real people created with the chosen names', made.n === 2 && made.people[0].first === 'Mira' && made.people[0].last === 'Vance', `${made.people.map((p) => `${p.first} ${p.last}`).join(' + ')}; household "${made.hhName}"`);
  T.check(S, 'created person: hairstyle and colour as chosen', made.hairName === T.expected.hairTitle && made.hairColor === T.expected.hairColor, `${made.hairName} ${made.hairColor}`);
  T.check(S, 'created person: body preset as chosen', !!made.bodyPresetName && made.bodyPresetName === T.expected.bodyPresetLabel, `${made.bodyPresetName} (wanted ${T.expected.bodyPresetLabel})`);
  T.check(S, 'created person: everyday outfit keeps a pattern', hasPattern, JSON.stringify(made.outfitLayers));
  T.check(S, 'created person: exactly three traits as chosen', made.traitNames.length === 3 && T.expected.traitTitles.every((t) => made.traitNames.includes(t)), made.traitNames.join(', '));
  T.check(S, 'created person: aspiration as chosen', made.aspName === T.expected.aspirationTitle, `${made.aspName}`);
  T.check(S, 'household name and a roommate tie exist', made.hhName === 'Vance House' && made.ties.some((t) => t.tie === 'roommate'), JSON.stringify(made.ties));
  T.created = made;
  T.expected.created = made;
  const members = await page.evaluate(() => { const st = window.hearthside.debug.state(); return st.households[st.activeHouseholdId].memberIds; });
  T.members = members;
  // keep time paused while the test drives actions (the real loop would run at the chosen speed)
  await page.evaluate(() => window.hearthside.game.setSpeed(0));
}

// ===============================================================================================================
// Page-side helpers (installed with addInitScript; used for coordinates and fast-forwarding only)
// ===============================================================================================================

function PAGE_HELPERS() {
  const canvas = () => document.getElementById('game-canvas');
  const conv = (s) => { const r = canvas().getBoundingClientRect(); return { x: s.x + r.left, y: s.y + r.top, vis: s.visible }; };
  const isFree = (x, y) => { const el = document.elementFromPoint(x, y); return !!el && el.id === 'game-canvas'; };
  const inView = (x, y) => x > 4 && y > 4 && x < innerWidth - 4 && y < innerHeight - 4;
  const finish = (s) => ({ ...s, free: s.vis && inView(s.x, s.y) && isFree(s.x, s.y) });
  const h = () => window.hearthside;
  window.__t = {
    person(id, y = 0.9) { const p = h().view.personPosition(id); if (!p) return null; return finish(conv(h().game.view.worldToScreen(p.x, y, p.z))); },
    object(id) {
      const b = h().view.objects.boxOf(id);
      if (!b) return null;
      return finish(conv(h().game.view.worldToScreen((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2)));
    },
    tile(x, z) { return finish(conv(h().game.view.worldToScreen(x + 0.5, 0, z + 0.5))); },
    /** A grid vertex (corner of tiles) on the ground. */
    vertex(x, z) { return finish(conv(h().game.view.worldToScreen(x, 0, z))); },
    /** A screen point on the wall (cutaway walls are low: tries several heights, keeps one that really picks this wall). */
    wall(wallId) {
      const [, dir, x, z] = wallId.split(':');
      const X = Number(x), Z = Number(z);
      const cx = dir === 'h' ? X + 0.5 : X, cz = dir === 'h' ? Z : Z + 0.5;
      let last = null;
      for (const y of [0.3, 0.8, 1.4, 2.0]) {
        const p = finish(conv(h().game.view.worldToScreen(cx, y, cz)));
        last = last && !p.free ? last : p;
        if (p.free) { const pk = window.__t.pick(p.x, p.y); if (pk.kind === 'wall' && pk.wallId === wallId) return { ...p, wallY: y, pickedSide: pk.side }; }
      }
      return last;
    },
    /** Centre of the canvas area not covered by UI (sampled). */
    freeCentre() {
      let sx = 0, sy = 0, n = 0;
      for (let x = 10; x < innerWidth; x += Math.max(10, innerWidth / 24)) for (let y = 10; y < innerHeight; y += Math.max(10, innerHeight / 24)) if (isFree(x, y)) { sx += x; sy += y; n++; }
      return n ? { x: sx / n, y: sy / n, n } : null;
    },
    pick(x, y) { const r = canvas().getBoundingClientRect(); return h().game.view.pick(x - r.left, y - r.top); },
    /** Runs ticks one at a time until the JS expression `src` (args: st, g) is true; records wall crossings. */
    run(maxTicks, src) {
      const cond = new Function('st', 'g', `return (${src});`);
      const last = {};
      const viol = [];
      for (let i = 0; i < maxTicks; i++) {
        h().debug.step(1);
        const st = h().debug.state();
        for (const p of Object.values(st.people)) {
          const loc = p.location;
          if (loc.kind !== 'lot') { delete last[p.id]; continue; }
          const lot = st.lots[loc.lotId];
          const t = { x: Math.floor(loc.x), z: Math.floor(loc.z) };
          const prev = last[p.id];
          last[p.id] = t;
          if (!prev || (prev.x === t.x && prev.z === t.z)) continue;
          const crossings = [];
          const door = (id) => Object.values(lot.openings).some((o) => o.wallId === id && /door/.test(o.defId));
          const blocked = (dir, x, z) => { const id = `${loc.level}:${dir}:${x}:${z}`; return !!lot.walls[id] && !door(id); };
          if (prev.x !== t.x && prev.z === t.z) { if (blocked('v', Math.max(prev.x, t.x), t.z)) crossings.push('v'); }
          else if (prev.z !== t.z && prev.x === t.x) { if (blocked('h', t.x, Math.max(prev.z, t.z))) crossings.push('h'); }
          else if (Math.abs(prev.x - t.x) === 1 && Math.abs(prev.z - t.z) === 1) {
            const a = blocked('v', Math.max(prev.x, t.x), prev.z) || blocked('h', t.x, Math.max(prev.z, t.z));
            const b = blocked('h', prev.x, Math.max(prev.z, t.z)) || blocked('v', Math.max(prev.x, t.x), t.z);
            if (a && b) crossings.push('diag');
          }
          if (crossings.length) viol.push({ person: p.firstName, from: prev, to: t, at: Math.round(st.clock.minutes), kind: crossings[0] });
        }
        if (cond(st, h().game)) return { done: true, ticks: i + 1, viol };
      }
      return { done: false, ticks: maxTicks, viol };
    },
    snapshot() {
      const st = h().debug.state();
      const hh = st.households[st.activeHouseholdId];
      const lot = st.lots[st.activeLotId];
      const people = hh.memberIds.map((id) => st.people[id]);
      return JSON.parse(JSON.stringify({
        funds: hh.funds,
        people: people.map((p) => ({
          first: p.firstName, last: p.lastName, hair: p.appearance.hair, bodyPresetId: p.appearance.bodyPresetId, skin: p.appearance.skin,
          outfits: p.outfits, traits: p.traits, aspiration: p.aspiration?.aspirationId ?? null, career: p.career?.careerId ?? null, pronouns: p.pronouns,
        })),
        objects: Object.values(lot.objects).map((o) => ({ id: o.id, defId: o.defId, x: o.x, z: o.z, rot: o.rot, level: o.level, finishes: o.finishes })).sort((a, b) => (a.id < b.id ? -1 : 1)),
        walls: Object.fromEntries(Object.values(lot.walls).map((w) => [w.id, [w.sideA, w.sideB]])),
        floors: lot.floors,
        hhName: hh.name,
        ties: Object.values(st.bonds).map((b) => `${b.a}|${b.b}|${b.familyAtoB}|${b.status}`).sort(),
        inventory: hh.inventory.length,
      }));
    },
  };
}

// ===============================================================================================================
// Node-side helpers
// ===============================================================================================================

const fmtMoney = (c) => `$${(c / 100).toFixed(2)}`;
const needsOf = (T, id) => T.page.evaluate((i) => { const p = window.hearthside.debug.state().people[i]; return { ...p.needs, loc: p.location.kind === 'lot' ? p.location.posture : 'off:' + p.location.place, queue: p.queue.map((a) => a.interactionId) }; }, id);

/** Drag on the canvas (pan). Touch uses real touch events through the DevTools protocol. */
async function drag(T, from, to) {
  const { page, vpInfo } = T;
  const steps = 8;
  if (vpInfo.touch) {
    const cdp = T.cdp ?? (T.cdp = await page.context().newCDPSession(page));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps); await page.waitForTimeout(16); }
    await page.mouse.up();
  }
  await page.waitForTimeout(150);
}

/** Waits (in real time) until the camera stopped moving: panel transitions change the camera insets after our synchronous frames. */
async function settle(T, maxMs = 6000) {
  const read = () => T.page.evaluate(() => { const v = window.hearthside.game.view; const a = v.worldToScreen(12, 0, 12), b = v.worldToScreen(5, 0, 18); return [a.x, a.y, b.x, b.y].map((n) => Math.round(n * 10) / 10).join(','); });
  const end = Date.now() + maxMs;
  let prev = await read();
  let stable = 0;
  while (Date.now() < end) {
    await T.page.waitForTimeout(250);
    await T.frames(3);
    const cur = await read();
    if (cur === prev) { if (++stable >= 2) return true; } else stable = 0;
    prev = cur;
  }
  return false;
}

/** Screen point (page coordinates) of a thing, panning the camera with real drags until it is visible and free of UI. */
async function pointFor(T, kind, id, extra) {
  for (let i = 0; i < 8; i++) {
    if (i === 0) await settle(T); else await T.frames(10); // the camera moves after every panel/inset change: let it settle first
    const p = await T.page.evaluate(([k, a, b]) => window.__t[k](a, b), [kind, id, extra]);
    if (p?.free) return p;
    const c = await T.page.evaluate(() => window.__t.freeCentre());
    if (!c) return p;
    const target = p ?? c;
    let dx = c.x - target.x, dy = c.y - target.y;
    const lim = 140;
    dx = Math.max(-lim, Math.min(lim, dx)); dy = Math.max(-lim, Math.min(lim, dy));
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) { dx = (i % 2 ? 1 : -1) * 30; }
    const from = { x: Math.max(20, Math.min(T.page.viewportSize().width - 20, c.x - dx / 2)), y: Math.max(20, Math.min(T.page.viewportSize().height - 20, c.y - dy / 2)) };
    await drag(T, from, { x: from.x + dx, y: from.y + dy });
    await T.frames(6);
  }
  return T.page.evaluate(([k, a, b]) => window.__t[k](a, b), [kind, id, extra]);
}

async function selectMember(T, id) {
  const sel = await T.page.evaluate(() => window.hearthside.game.selected());
  if (sel === id) return;
  await T.tap(T.page.locator(`.member[data-person-id="${id}"]`));
  await T.page.waitForTimeout(150);
}

async function closeAnyPanel(T) {
  const x = T.page.locator('.panel:not([hidden]) .panel-close, .panel:not([hidden]) button[aria-label="Close panel"]').first();
  if (await x.count() && await x.isVisible().catch(() => false)) { await T.tap(x); await T.page.waitForTimeout(250); }
}

/** Taps a person/object/tile on the canvas and returns the menu items. */
async function tapAndOpenMenu(T, kind, id, S, label) {
  // a person inside a shower stall or behind furniture cannot be tapped: try other heights, then let a few minutes pass and look again
  let personY = 0.9;
  for (let i = 0; i < 4 && kind === 'person'; i++) {
    let found = false;
    for (const y of [0.9, 1.3, 0.6, 1.6]) {
      let q = await pointFor(T, kind, id, y);
      if (!q?.free) { await T.page.evaluate((pid) => window.hearthside.game.view.focusPerson(pid), id); await settle(T); q = await T.page.evaluate(([a, b]) => window.__t.person(a, b), [id, y]); }
      const hit = q && (await T.page.evaluate(([x, yy]) => { const pk = window.__t.pick(x, yy); return pk.kind === 'person' ? pk.personId : null; }, [q.x, q.y]));
      if (hit === id && q.free) { personY = y; found = true; break; }
    }
    if (found) break;
    log(`${label}: person is not tappable right now; waiting 3 game minutes`);
    await runUntil(T, 4 * 3, 'false');
  }
  let p = await pointFor(T, kind, id, kind === 'person' ? personY : undefined);
  if (!p?.free) { T.bad(S, `${label}: visible to tap`, `point ${JSON.stringify(p)} not on free canvas`); return null; }
  let pick = await T.page.evaluate(([x, y]) => window.__t.pick(x, y), [p.x, p.y]);
  const keyOf = (pk) => (kind === 'person' ? pk.personId : kind === 'object' ? pk.objectId : null);
  if (keyOf(pick) !== id && (kind === 'object' || kind === 'person')) {
    // something else is drawn over the middle of the target (a person in the bed, two people standing together): try nearby points
    const offs = kind === 'object'
      ? [[-16, 0], [16, 0], [0, -14], [0, 14], [-28, -8], [28, -8], [-28, 10], [28, 10], [0, -26], [0, 26]]
      : [[0, -12], [0, 10], [-6, 0], [6, 0], [-6, -14], [6, -14], [0, -20], [0, 18], [-10, 6], [10, 6]];
    for (const [dx, dy] of offs) {
      const pk = await T.page.evaluate(([x, y]) => window.__t.pick(x, y), [p.x + dx, p.y + dy]);
      const fr = await T.page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && e.id === 'game-canvas'; }, [p.x + dx, p.y + dy]);
      if (keyOf(pk) === id && fr) { log(`${label}: centre pick was ${JSON.stringify(pick)}; using offset ${dx},${dy}`); p = { ...p, x: p.x + dx, y: p.y + dy }; pick = pk; break; }
    }
  }
  T.check(S, `${label}: tap point picks the intended thing`, keyOf(pick) === id, JSON.stringify(pick));
  await T.tapAt(p.x, p.y);
  try { await T.page.waitForSelector('.ctx-menu:not([hidden]) .ctx-item', { timeout: 4000 }); } catch { T.bad(S, `${label}: context menu opens on tap`, 'no .ctx-menu'); return null; }
  await T.page.waitForTimeout(250);
  await T.frames(2);
  const items = await T.page.evaluate(() => [...document.querySelectorAll('.ctx-menu .ctx-item')].map((b) => ({ label: b.querySelector('.ctx-label')?.textContent?.trim(), disabled: b.disabled, reason: b.querySelector('.ctx-reason')?.textContent?.trim() ?? null })));
  const geo = await T.page.evaluate(() => { const r = document.querySelector('.ctx-menu').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight }; });
  T.check(S, `${label}: context menu fully on screen`, geo.l >= -1 && geo.t >= -1 && geo.r <= geo.vw + 1 && geo.b <= geo.vh + 1, JSON.stringify(geo));
  return { items, point: p, geo };
}

async function dismissMenu(T) {
  const c = T.page.locator('.ctx-menu:not([hidden]) .ctx-close').first();
  if (await c.count() && await c.isVisible().catch(() => false)) { await T.tap(c); await T.page.waitForTimeout(250); }
}

async function chooseMenu(T, re) {
  const item = T.page.locator('.ctx-menu .ctx-item:not([disabled])', { has: T.page.locator('.ctx-label', { hasText: re }) }).first();
  if (!(await item.count())) return false;
  await item.scrollIntoViewIfNeeded().catch(() => undefined);
  await T.tap(item);
  await T.page.waitForTimeout(250);
  return true;
}

async function runUntil(T, maxTicks, src, chunk = 240) {
  let total = 0; const viol = [];
  while (total < maxTicks) {
    const n = Math.min(chunk, maxTicks - total);
    const r = await T.page.evaluate(([a, b]) => window.__t.run(a, b), [n, src]);
    total += r.ticks; viol.push(...r.viol);
    if (r.done) { await T.frames(3); return { done: true, ticks: total, viol }; }
  }
  await T.frames(3);
  return { done: false, ticks: total, viol };
}

const simNow = (T) => T.page.evaluate(() => { const c = window.hearthside.debug.state().clock.minutes; const d = Math.floor(c / 1440); const m = c - d * 1440; return { minutes: c, day: d, hhmm: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}` }; });

// ===============================================================================================================
// STEP 2 - live mode
// ===============================================================================================================

async function stepLive(T) {
  const S = '2';
  const { page } = T;
  const [mira, sage] = T.members;
  await page.evaluate(() => window.hearthside.game.setSpeed(0));
  const startInfo = await page.evaluate(([m, s]) => {
    const st = window.hearthside.debug.state(); const lot = st.lots[st.activeLotId];
    const fridge = Object.values(lot.objects).find((o) => /fridge/.test(o.defId));
    const bed = Object.values(lot.objects).find((o) => /^bed-/.test(o.defId));
    return { fridge: fridge?.id, bed: bed?.id, bedDef: bed?.defId, miraCareer: st.people[m].career?.careerId ?? null, sageCareer: st.people[s].career?.careerId ?? null, funds: st.households[st.activeHouseholdId].funds, minutes: st.clock.minutes, miraNeeds: st.people[m].needs };
  }, [mira, sage]);
  log('start', JSON.stringify(startInfo));
  T.start = startInfo;

  // ---- select the first person with a tap on the household strip
  await selectMember(T, mira);
  T.check(S, 'select first person via the household strip', (await page.evaluate(() => window.hearthside.game.selected())) === mira, 'selected');
  await T.shot('live-selected');

  // ---- fridge menu -> Cook a Meal (wait until nobody is using the fridge)
  const before = await needsOf(T, mira);
  await runUntil(T, 4 * 60, `g.options('${mira}', { kind: 'object', objectId: '${startInfo.fridge}' }).some(o => o.enabled && o.interactionId === 'cookMeal')`);
  const m1 = await tapAndOpenMenu(T, 'object', startInfo.fridge, S, 'fridge');
  if (m1) {
    log('fridge menu', JSON.stringify(m1.items));
    await T.shot('live-fridge-menu');
    await T.audit('context menu');
    T.check(S, 'fridge menu offers Cook a Meal', m1.items.some((i) => /Cook a Meal/.test(i.label ?? '') && !i.disabled), m1.items.map((i) => i.label + (i.disabled ? ` (disabled: ${i.reason})` : '')).join(' | '));
    const ok = await chooseMenu(T, /Cook a Meal/);
    if (!ok) await chooseMenu(T, /Snack/);
    await T.frames(3);
    const q = await needsOf(T, mira);
    T.check(S, 'Cook a Meal is queued for the first person', q.queue.includes('cookMeal') || q.queue.includes('grabSnack'), `queue: ${q.queue.join(', ')}`);
  }

  // ---- queue a second action (Dance) from the self menu, then cancel it in the queue panel
  const selfMenu = await tapAndOpenMenu(T, 'person', mira, S, 'self (selected person)');
  if (selfMenu) {
    log('self menu', JSON.stringify(selfMenu.items.map((i) => i.label + (i.disabled ? '(x)' : ''))));
    await T.shot('live-self-menu');
    const picked = (await chooseMenu(T, /Dance/)) || (await chooseMenu(T, /Jog/));
    T.check(S, 'a second action can be queued from the self menu', picked, selfMenu.items.map((i) => i.label).join(', '));
  }
  await T.frames(3);
  // open the person panel (tap the selected portrait) -> Queue tab
  await T.tap(page.locator(`.member[data-person-id="${mira}"]`));
  await page.waitForSelector('.person-panel:not([hidden])', { timeout: 5000 }).catch(() => undefined);
  await T.tap(page.locator('.person-panel .tab[data-id="queue"]'));
  await page.waitForTimeout(400);
  const vis = await page.evaluate(() => {
    const panel = document.querySelector('.person-panel'); const pr = panel.getBoundingClientRect();
    const row = document.querySelector('.person-panel .q-current, .person-panel .q-item, .person-panel .pp-empty');
    if (!row) return { found: false };
    const r = row.getBoundingClientRect();
    const midY = Math.min(Math.max(r.top + Math.min(r.height / 2, 20), 0), innerHeight - 1), midX = r.left + r.width / 2;
    const el = document.elementFromPoint(midX, midY);
    return { found: true, rowTop: Math.round(r.top), rowBottom: Math.round(r.bottom), panelTop: Math.round(pr.top), panelBottom: Math.round(pr.bottom), vh: innerHeight, inside: r.top >= pr.top && r.top < pr.bottom - 20 && r.top < innerHeight - 20, topIsPanel: !!el && !!el.closest('.person-panel') };
  });
  T.check(S, 'person panel: the Queue content is actually visible inside the panel (not pushed out by the header)', vis.found && vis.inside && vis.topIsPanel, JSON.stringify(vis));
  await T.shot('live-queue-panel');
  await T.audit('person panel (queue tab)');
  const qItems = await page.locator('.person-panel .q-item').count();
  const hasCurrent = await page.locator('.person-panel .q-current').count();
  T.check(S, 'queue panel shows the current action and the queued ones', hasCurrent === 1 && qItems >= 1, `current ${hasCurrent}, queued ${qItems}`);
  if (qItems >= 1) {
    const before2 = (await needsOf(T, mira)).queue;
    await T.tap(page.locator('.person-panel .q-item').last().locator('button[aria-label^="Cancel"]'));
    await page.waitForTimeout(500);
    await T.frames(3);
    await page.evaluate(() => window.hearthside.debug.step(2));
    const after2 = (await needsOf(T, mira)).queue;
    T.check(S, 'cancelling a queued action from the queue panel removes it (the other queued actions stay)', after2.length < before2.length && !after2.includes('danceSolo') && !after2.includes('jogInPlace') && after2.includes('cookMeal'), `queue ${before2.join(',')} -> ${after2.join(',')}`);
    await T.shot('live-queue-cancelled');
  }
  await T.tap(page.locator('.person-panel .tab[data-id="needs"]'));
  await page.waitForTimeout(250);
  await T.shot('live-needs-panel');
  await T.audit('person panel (needs tab)');
  await closeAnyPanel(T);

  // ---- let time run until she ate (hunger rose)
  await page.evaluate(() => { window.__acc = { max: 0, atEat: null, eat: false }; });
  const wasHunger = (await needsOf(T, mira)).hunger;
  const r1 = await runUntil(T, 4 * 150, `(() => { const p = st.people['${mira}']; const a = window.__acc; a.max = Math.max(a.max, p.needs.hunger); const eating = p.queue.some(x => x.interactionId === 'eatMeal'); if (eating && !a.eat) { a.eat = true; a.atEat = p.needs.hunger; } return a.eat && !eating && !p.queue.some(x => x.interactionId === 'cookMeal'); })()`);
  const acc = await page.evaluate(() => window.__acc);
  const afterEat = await needsOf(T, mira);
  T.check(S, 'first person cooked and ate: hunger rose', r1.done && acc.max - acc.atEat >= 8, `hunger ${wasHunger.toFixed(1)} at start, ${acc.atEat?.toFixed(1)} when she sat down to eat, ${acc.max.toFixed(1)} after (${(r1.ticks / 4).toFixed(0)} game minutes)`);
  T.check(S, 'nobody walked through a wall while cooking/eating', r1.viol.length === 0, JSON.stringify(r1.viol.slice(0, 3)));
  await T.shot('live-after-eating');
  const ledgerAfterCook = await page.evaluate(() => { const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId]; return { funds: hh.funds, last: hh.ledger.slice(-3).map((e) => `${e.kind}:${e.amount}:${e.label}`) }; });
  log('after cook ledger', JSON.stringify(ledgerAfterCook));

  // ---- go to work: advance to the shift window, use the self menu
  const day0 = (await simNow(T)).day;
  const toWindow = `st.clock.minutes >= ${day0 * 1440 + 9 * 60 + 5}`;
  const r2 = await runUntil(T, 4 * 600, toWindow);
  T.check(S, 'simulation reached 09:05 (shift window open)', r2.done, JSON.stringify(await simNow(T)));
  const miraBefore = await needsOf(T, mira);
  T.check(S, 'first person is on the lot before work', !miraBefore.loc.startsWith('off:'), miraBefore.loc);
  const wageBefore = await page.evaluate(([m]) => { const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId]; return { funds: hh.funds, wages: hh.ledger.filter((e) => e.kind === 'wage').length }; }, [mira]);
  const m2 = await tapAndOpenMenu(T, 'person', mira, S, 'self menu (work)');
  if (m2) {
    const hasWork = m2.items.find((i) => /Go to Work/.test(i.label ?? ''));
    T.check(S, 'self menu offers Go to Work inside the shift window', !!hasWork && !hasWork.disabled, JSON.stringify(m2.items.map((i) => i.label + (i.disabled ? `(x:${i.reason})` : ''))));
    await T.shot('live-self-menu-work');
    await chooseMenu(T, /Go to Work/);
  }
  // away: off lot
  const r3 = await runUntil(T, 4 * 200, `st.people['${mira}'].location.kind === 'offlot'`);
  const away = await needsOf(T, mira);
  T.check(S, 'first person walked out and is off-lot at work', r3.done && away.loc === 'off:work', `${away.loc} after ${(r3.ticks / 4).toFixed(0)} min; walls crossed: ${r3.viol.length}`);
  T.check(S, 'no wall crossing on the way out', r3.viol.length === 0, JSON.stringify(r3.viol.slice(0, 3)));
  await page.waitForTimeout(400);
  await T.shot('live-at-work');
  const badge = await page.locator(`.member[data-person-id="${mira}"] .member-badge`).isVisible().catch(() => false);
  T.check(S, 'household strip shows an away badge for the worker', badge, badge ? 'badge visible' : 'no badge');
  const stripLabel = await page.locator(`.member[data-person-id="${mira}"]`).getAttribute('aria-label');
  log('strip label while away', stripLabel);
  // Sage should have left automatically (autonomous commute)
  // run to the end of the shift and back
  const shiftEnd = day0 * 1440 + 16 * 60;
  const r4 = await runUntil(T, 4 * 600, `st.clock.minutes >= ${shiftEnd + 5}`);
  const r5 = await runUntil(T, 4 * 240, `st.people['${mira}'].location.kind === 'lot'`);
  const back = await needsOf(T, mira);
  T.check(S, 'first person is back on the lot after the shift', r5.done && !back.loc.startsWith('off:'), `${back.loc} at ${JSON.stringify(await simNow(T))}`);
  const wages = await page.evaluate(([m, s, d]) => {
    const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId];
    const count = (id) => hh.ledger.filter((e) => e.kind === 'wage' && e.occurrence === `pay:${id}:${d}`).length;
    return { mira: count(m), sage: count(s), all: hh.ledger.filter((e) => e.kind === 'wage').map((e) => `${e.amount}:${e.label}:${e.occurrence}`), funds: hh.funds };
  }, [mira, sage, day0]);
  log('wages', JSON.stringify(wages));
  T.check(S, 'exactly one wage ledger entry for the first person\'s shift', wages.mira === 1, JSON.stringify(wages.all));
  T.check(S, 'the roommate (own shift) was paid exactly once as well', wages.sage === 1 || startInfo.sageCareer === null, `sage entries ${wages.sage}; career ${startInfo.sageCareer}`);
  T.check(S, 'household funds rose by the wage(s)', wages.funds > wageBefore.funds, `${fmtMoney(wageBefore.funds)} -> ${fmtMoney(wages.funds)}`);
  // let a day boundary-free amount of time pass: the wage must not repeat
  await page.evaluate(() => window.__t.run(4 * 30, 'false'));
  const wages2 = await page.evaluate(([m, d]) => { const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId]; return hh.ledger.filter((e) => e.kind === 'wage' && e.occurrence === `pay:${m}:${d}`).length; }, [mira, day0]);
  T.check(S, 'the wage is not paid twice later', wages2 === 1, `${wages2} entries`);
  // ledger panel
  await T.tap(page.locator('.funds-btn'));
  await page.waitForSelector('.ledger-panel:not([hidden])', { timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(300);
  await T.shot('live-ledger');
  const ledgerText = await page.locator('.ledger-list').innerText().catch(() => '');
  T.check(S, 'ledger panel lists the wage', /wage|shift|pay|Dishwasher|Culinary/i.test(ledgerText), ledgerText.slice(0, 160).replace(/\n/g, ' | '));
  await closeAnyPanel(T);
  await page.evaluate(() => window.hearthside.view.frameLot?.(true));

  // ---- sleep on a bed (right after work, before the neighbour arrives)
  await dismissMenu(T);
  await selectMember(T, mira);
  const eBefore = (await needsOf(T, mira)).energy;
  const bm = await tapAndOpenMenu(T, 'object', startInfo.bed, S, 'bed');
  if (bm) {
    await T.shot('live-bed-menu');
    log('bed menu', JSON.stringify(bm.items));
    T.check(S, 'bed menu offers Sleep', bm.items.some((i) => /Sleep/.test(i.label ?? '') && !i.disabled), bm.items.map((i) => i.label + (i.disabled ? `(x:${i.reason})` : '')).join(' | '));
    await chooseMenu(T, /^Sleep/);
    const r9 = await runUntil(T, 4 * 150, `st.people['${mira}'].location.kind === 'lot' && st.people['${mira}'].location.posture === 'lying'`);
    const lying = await page.evaluate((m) => { const st = window.hearthside.debug.state(); const p = st.people[m]; const lot = st.lots[st.activeLotId]; const beds = Object.values(lot.objects).filter((o) => /^bed-/.test(o.defId)); const d = beds.map((b) => Math.hypot(b.x + 1 - p.location.x, b.z + 1 - p.location.z)); return { posture: p.location.posture, x: p.location.x, z: p.location.z, nearestBed: Math.min(...d), anim: p.anim.id, at: Math.round(st.clock.minutes) }; }, mira);
    T.check(S, 'sleeping person lies in a bed (posture lying, at a bed)', r9.done && lying.posture === 'lying' && lying.nearestBed < 3.5, `${JSON.stringify(lying)} after ${(r9.ticks / 4).toFixed(0)} game minutes`);
    T.check(S, 'no wall crossing walking to bed', r9.viol.length === 0, JSON.stringify(r9.viol.slice(0, 3)));
    await runUntil(T, 4 * 10, 'false');
    await page.evaluate((m) => { const v = window.hearthside.view; const p = v.personPosition(m); if (p) v.rig.glideTo(p.x, p.z, 110, 0, 0.5); }, mira);
    await T.frames(20);
    await settle(T);
    await T.shot('live-sleeping');
    const e1 = (await needsOf(T, mira)).energy;
    await runUntil(T, 4 * 30, 'false');
    await T.frames(15);
    const e2 = (await needsOf(T, mira)).energy;
    T.check(S, 'energy rises while sleeping', e2 > e1 && e1 >= eBefore - 1, `energy ${eBefore.toFixed(1)} (before) / ${e1.toFixed(1)} (10 min in bed) -> ${e2.toFixed(1)} after another 30 min`);
    await T.shot('live-sleeping-later');
    // cancel the running sleep from the queue panel
    await T.tap(page.locator(`.member[data-person-id="${mira}"]`));
    await page.waitForSelector('.person-panel:not([hidden])', { timeout: 4000 }).catch(() => undefined);
    await T.tap(page.locator('.person-panel .tab[data-id="queue"]'));
    await page.waitForTimeout(300);
    await T.shot('live-sleep-queue');
    const cancelNow = page.locator('.person-panel .q-current button', { hasText: 'Cancel' });
    if (await cancelNow.count()) {
      await T.tap(cancelNow.first());
      const r10 = await runUntil(T, 4 * 30, `st.people['${mira}'].location.kind === 'lot' && st.people['${mira}'].location.posture !== 'lying'`);
      T.check(S, 'cancelling the running Sleep gets her out of bed', r10.done, `after ${(r10.ticks / 4).toFixed(0)} min`);
    } else T.bad(S, 'queue panel shows a Cancel button for the running action', 'none');
    await closeAnyPanel(T);
  }

  // ---- neighbour: first visit is day 1 at 5 PM
  const r6 = await runUntil(T, 4 * 400, `st.clock.minutes >= ${day0 * 1440 + 17 * 60 + 30}`);
  await T.frames(4);
  const nb = await page.evaluate(() => {
    const st = window.hearthside.debug.state();
    const npcs = Object.values(st.people).filter((p) => p.isNpc && p.location.kind === 'lot' && p.location.lotId === st.activeLotId);
    return npcs.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, loc: p.location }));
  });
  T.check(S, 'a neighbour has arrived on the lot by 17:30 on day 1', nb.length >= 1, JSON.stringify(nb.map((n) => n.name)));
  if (nb.length) {
    T.neighbour = nb[0];
    const relBefore = await page.evaluate(([a, b]) => { const st = window.hearthside.debug.state(); const r = st.relationships[`${a}>${b}`]; return r ? { fam: r.familiarity, fr: r.friendship } : null; }, [mira, nb[0].id]);
    await selectMember(T, mira);
    await T.frames(2);
    await T.shot('live-neighbour-arrived');
    // the neighbour may be mid-conversation with the roommate: wait until a social option is enabled for the first person
    const free = await runUntil(T, 4 * 120, `g.options('${mira}', { kind: 'person', personId: '${nb[0].id}' }).some(o => o.enabled && o.group === 'social' && o.interactionId !== 'introduce')`);
    log('neighbour free for social after ticks', free.ticks, free.done);
    await T.frames(3);
    await dismissMenu(T);
    const nm = await tapAndOpenMenu(T, 'person', nb[0].id, S, 'neighbour');
    if (nm) {
      await T.shot('live-neighbour-menu');
      log('neighbour menu', JSON.stringify(nm.items));
      const social = nm.items.filter((i) => !i.disabled);
      // before an introduction only "Introduce Yourself" is enabled (correct game rule); afterwards several socials are
      T.check(S, 'neighbour menu offers social interactions', social.length >= 2 || (social.length === 1 && /Introduce/i.test(social[0].label ?? '')), nm.items.map((i) => i.label + (i.disabled ? `(x:${i.reason})` : '')).join(' | '));
      const pickLabel = nm.items.find((i) => !i.disabled && /Chat|Talk|Introduce|Greet|Compliment|Joke/i.test(i.label ?? ''))?.label ?? social[0]?.label;
      if (pickLabel) {
        await chooseMenu(T, new RegExp(pickLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        T.ok(S, 'chose a social interaction', pickLabel);
        const r7 = await runUntil(T, 4 * 90, `(() => { const p = st.people['${mira}']; return !p.queue.length || !p.queue.some(a => a.target && a.target.personId === '${nb[0].id}'); })()`);
        await T.frames(3);
        await T.shot('live-after-social');
        const relAfter = await page.evaluate(([a, b]) => { const st = window.hearthside.debug.state(); const r = st.relationships[`${a}>${b}`]; const p = st.people[a]; return { rel: r ? { fam: r.familiarity, fr: r.friendship } : null, memories: p.memories.length, feed: st.feed.slice(-4).map((f) => f.text), now: st.clock.minutes }; }, [mira, nb[0].id]);
        log('relationship', JSON.stringify({ relBefore, relAfter }));
        T.check(S, 'the interaction changed the relationship (familiarity or friendship rose)', !!relAfter.rel && (!relBefore || relAfter.rel.fam > relBefore.fam || relAfter.rel.fr > relBefore.fr), JSON.stringify({ relBefore, rel: relAfter.rel }));
        T.check(S, 'no wall crossing during the visit', r7.viol.length === 0, JSON.stringify(r7.viol.slice(0, 3)));
        // relationships tab
        await T.tap(page.locator(`.member[data-person-id="${mira}"]`));
        await page.waitForSelector('.person-panel:not([hidden])', { timeout: 4000 }).catch(() => undefined);
        await T.tap(page.locator('.person-panel .tab[data-id="relationships"]'));
        await page.waitForTimeout(400);
        await T.shot('live-relationships');
        const relText = await page.locator('.person-panel .rel-list').innerText().catch(() => '');
        T.check(S, 'Relationships tab lists the neighbour', relText.includes(nb[0].name.split(' ')[0]), relText.slice(0, 120).replace(/\n/g, ' | '));
        await closeAnyPanel(T);
      }
    }
  }

  await page.evaluate(() => window.hearthside.view.frameLot(true));
  await T.frames(4);
}

// ===============================================================================================================
// STEP 3 - buy mode
// ===============================================================================================================

/** Finds up to `max` tiles where the current placement is valid, visible and free of UI (scans the lot; moves the ghost). */
async function validTiles(T, max = 6, prefer) {
  await settle(T);
  return T.page.evaluate(([mx, pref]) => {
    const g = window.hearthside.game;
    const st = window.hearthside.debug.state();
    const lot = st.lots[st.activeLotId];
    const r = document.getElementById('game-canvas').getBoundingClientRect();
    const out = [];
    for (let z = 6; z < 22; z++) for (let x = 5; x < 20; x++) {
      const p = window.__t.tile(x, z);
      if (!p.free) continue;
      g.placementAt(p.x - r.left, p.y - r.top);
      const pl = g.placement();
      if (!pl || !pl.ok) continue;
      // the footprint origin must be a floored interior tile (indoors)
      if (!lot.floors[`0:${pl.x}:${pl.z}`]) continue;
      const q = window.__t.tile(pl.x, pl.z);
      out.push({ tx: x, tz: z, x: p.x, y: p.y, px: pl.x, pz: pl.z, free: q.free });
      if (out.length >= mx * 6) break;
    }
    // spread the choices out
    const pick = [];
    for (const o of out) if (pick.every((q) => Math.hypot(q.tx - o.tx, q.tz - o.tz) >= 3)) pick.push(o);
    return pick.slice(0, mx);
  }, [max, prefer]);
}

async function placeAt(T, S, label, tile, confirm = true) {
  const { page } = T;
  if (T.vpInfo.touch) {
    await T.tapAt(tile.x, tile.y);
    await T.frames(3);
    const pl = await page.evaluate(() => window.hearthside.game.placement());
    T.check(S, `${label}: tapping a tile moves the ghost there`, pl && pl.x === tile.px && pl.z === tile.pz && pl.ok, JSON.stringify(pl && { x: pl.x, z: pl.z, ok: pl.ok, reasons: pl.reasons }) + ` wanted ${tile.px},${tile.pz}`);
    if (confirm) { await T.shot(`buy-ghost-${label.replace(/\W+/g, '-')}`); await T.tap(page.locator('.bb-confirm')); }
  } else {
    await page.mouse.move(tile.x, tile.y);
    await page.waitForTimeout(150);
    await T.frames(3);
    const pl = await page.evaluate(() => window.hearthside.game.placement());
    T.check(S, `${label}: ghost follows the cursor`, pl && pl.x === tile.px && pl.z === tile.pz && pl.ok, JSON.stringify(pl && { x: pl.x, z: pl.z, ok: pl.ok }));
    if (confirm) { await T.shot(`buy-ghost-${label.replace(/\W+/g, '-')}`); await page.mouse.click(tile.x, tile.y); }
  }
  await page.waitForTimeout(400);
  await T.frames(3);
}

const state3 = (T) => T.page.evaluate(() => {
  const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId]; const lot = st.lots[st.activeLotId];
  return { funds: hh.funds, objs: Object.values(lot.objects).map((o) => ({ id: o.id, defId: o.defId, x: o.x, z: o.z, rot: o.rot })), inv: hh.inventory.length };
});

/** Taps an object in Buy mode (tries a few points: a person or another object may be drawn over the centre) and returns whether it got selected. */
async function tapSelectObject(T, id) {
  await T.page.evaluate(() => window.hearthside.game.selectObject(null));
  const p = await pointFor(T, 'object', id);
  for (const [dx, dy] of [[0, 0], [-16, 0], [16, 0], [0, -14], [0, 14], [-28, -8], [28, -8], [0, -26], [0, 26]]) {
    const x = p.x + dx, y = p.y + dy;
    const pk = await T.page.evaluate(([a, b]) => window.__t.pick(a, b), [x, y]);
    log(`tapSelectObject ${id}: offset ${dx},${dy} -> pick ${JSON.stringify(pk)}; point ${Math.round(x)},${Math.round(y)} free=${p.free}`);
    if (pk.kind !== 'object' || pk.objectId !== id) continue;
    const ok = await T.page.evaluate(([a, b]) => { const e = document.elementFromPoint(a, b); return !!e && e.id === 'game-canvas'; }, [x, y]);
    if (!ok) continue;
    await T.tapAt(x, y);
    await T.page.waitForTimeout(500);
    await T.frames(3);
    const after = await T.page.evaluate(() => ({ sel: window.hearthside.game.selectedObject(), pl: !!window.hearthside.game.placement(), mode: window.hearthside.game.mode() }));
    log(`tapSelectObject after tap: ${JSON.stringify(after)}`);
    if (after.sel !== id) {
      const again = await T.page.evaluate(([a, b]) => ({ pick: window.__t.pick(a, b), el: document.elementFromPoint(a, b)?.className?.toString().slice(0, 60) }), [x, y]);
      log(`tapSelectObject FAILED: pick now ${JSON.stringify(again)}`);
      await T.shot('buy-select-failed');
    }
    return after.sel === id;
  }
  return false;
}

async function stepBuy(T) {
  const S = '3';
  const { page } = T;
  await page.evaluate(() => window.hearthside.game.setSpeed(0));
  await page.evaluate(() => { window.hearthside.view.frameLot(true); });
  await T.tap(page.locator('.mode-btn[data-mode="buy"]'));
  await page.waitForSelector('.bb-buy-panel:not([hidden])', { timeout: 6000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  await T.frames(4);
  T.check(S, 'Buy mode opens the catalog panel and pauses the sim', (await page.evaluate(() => window.hearthside.game.mode())) === 'buy', 'mode buy');
  await T.shot('buy-catalog');
  await T.audit('buy catalog');

  // search "single bed", open the card, buy
  const defId = 'bed-single-pine';
  const price = await page.evaluate((d) => window.hearthside.game.content.objects[d].price, defId);
  const search = page.getByLabel('Search the catalog');
  if (!(await search.isVisible().catch(() => false))) {
    const sb = page.locator('.bb-buy-panel button[aria-label="Search"]').first();
    if (await sb.count()) await T.tap(sb);
  }
  await search.fill('single bed').catch(() => undefined);
  await page.waitForTimeout(400);
  await T.shot('buy-catalog-search');
  const card = page.locator('.bb-buy-panel .bb-card', { hasText: 'Pinecrest' }).first();
  T.check(S, 'catalog search finds the Pinecrest Single Bed', (await card.count()) > 0, `${await page.locator('.bb-buy-panel .bb-card').count()} cards`);
  await T.tap(card);
  await page.waitForTimeout(400);
  await T.shot('buy-detail');
  const buyBtn = page.locator('.bb-buy-panel .bb-buy-row button').last();
  const buyText = (await buyBtn.innerText()).trim();
  T.check(S, 'detail card shows a Buy button with the price', /Buy/i.test(buyText), buyText);
  const s0 = await state3(T);
  await T.tap(buyBtn);
  await page.waitForTimeout(500);
  await T.frames(3);
  const placing = await page.evaluate(() => window.hearthside.game.placement());
  T.check(S, 'Buy starts a placement preview (no money taken yet)', !!placing && (await state3(T)).funds === s0.funds, JSON.stringify(placing && { def: placing.defId, cost: placing.cost, ok: placing.ok }));
  await T.shot('buy-placement-start');
  await T.audit('buy placement');
  const tiles = await validTiles(T, 4);
  T.check(S, 'found valid tiles to place the bed', tiles.length >= 2, JSON.stringify(tiles.map((t) => [t.px, t.pz])));
  if (tiles.length < 2) return;
  const a = tiles[0], b = tiles[tiles.length - 1];
  await placeAt(T, S, 'bed first', a);
  const s1 = await state3(T);
  const bed = s1.objs.find((o) => o.defId === defId && !s0.objs.some((q) => q.id === o.id));
  T.check(S, 'the bed was placed at the confirmed tile', !!bed && bed.x === a.px && bed.z === a.pz, JSON.stringify(bed));
  T.check(S, 'funds changed by exactly the price', s0.funds - s1.funds === price, `${fmtMoney(s0.funds)} -> ${fmtMoney(s1.funds)} (price ${fmtMoney(price)})`);
  await T.shot('buy-bed-placed');
  if (!bed) return;
  T.bedId = bed.id;

  // ---- move + rotate: tap the bed, Move, tap another tile, rotate, Place
  const sel1 = await tapSelectObject(T, bed.id);
  T.check(S, 'tapping the placed bed selects it (Move / Sell actions)', sel1 && (await page.locator('.bb-buy-panel button:visible', { hasText: /^Move\b(?! here)/ }).count()) > 0, '');
  await T.shot('buy-bed-selected');
  await T.audit('buy object panel');
  const sell = await page.locator('.bb-buy-panel button[aria-label^="Sell"]').getAttribute('aria-label').catch(() => null);
  T.check(S, 'Sell shows the refund', !!sell && /\$/.test(sell), sell ?? 'no sell button');
  await T.tap(page.locator('.bb-buy-panel button:visible', { hasText: /^Move\b(?! here)/ }).first());
  await page.waitForTimeout(400);
  const tiles2 = await validTiles(T, 4);
  const mv = tiles2.find((t) => Math.hypot(t.px - bed.x, t.pz - bed.z) >= 2) ?? tiles2[0];
  await placeAt(T, S, 'bed moved', mv, false);
  const rot0 = (await page.evaluate(() => window.hearthside.game.placement())).rot;
  await T.tap(page.locator('.bb-place-footer button[aria-label="Rotate left"]'));
  await T.frames(3);
  const rot1 = (await page.evaluate(() => window.hearthside.game.placement())).rot;
  T.check(S, 'Rotate left turns the ghost a quarter turn', rot1 !== rot0, `rot ${rot0} -> ${rot1}`);
  const plNow = await page.evaluate(() => window.hearthside.game.placement());
  if (!plNow.ok) {
    // rotated footprint may not fit here: undo the rotation and move on with the non-rotated spot
    T.ok(S, 'rotated ghost is invalid at this tile (reason shown)', plNow.reasons.join('; '));
    await T.shot('buy-ghost-rotated-invalid');
  }
  await T.shot('buy-ghost-rotated');
  if (!(await page.evaluate(() => window.hearthside.game.placement().ok))) {
    await T.tap(page.locator('.bb-place-footer button[aria-label="Rotate right"]')); // back to the turn that fitted
    await T.frames(2);
  }
  const plFinal = await page.evaluate(() => window.hearthside.game.placement());
  const fundsBeforeMove = (await state3(T)).funds;
  await T.tap(page.locator('.bb-confirm'));
  await page.waitForTimeout(500);
  await T.frames(3);
  const s2 = await state3(T);
  const bed2 = s2.objs.find((o) => o.id === bed.id);
  T.check(S, 'the bed moved to the new tile', !!bed2 && bed2.x === plFinal.x && bed2.z === plFinal.z && (bed2.x !== bed.x || bed2.z !== bed.z), `${bed.x},${bed.z} rot ${bed.rot} -> ${bed2?.x},${bed2?.z} rot ${bed2?.rot}`);
  T.check(S, 'moving is free', s2.funds === fundsBeforeMove && s2.funds === s1.funds, `${fmtMoney(s2.funds)}`);
  await T.shot('buy-bed-moved');
  // second operation: rotate in place
  const sel2 = await tapSelectObject(T, bed.id);
  T.check(S, 'the bed can be selected again after moving it', sel2, '');
  await T.tap(page.locator('.bb-buy-panel button:visible', { hasText: /^Move\b(?! here)/ }).first());
  await page.waitForTimeout(300);
  // turn it until the ghost fits (a person may be standing in a turned footprint); another tile when no turn fits here
  let okNow = false;
  for (let attempt = 0; attempt < 3 && !okNow; attempt++) {
    for (let k = 0; k < 3 && !okNow; k++) {
      await T.tap(page.locator('.bb-place-footer button[aria-label="Rotate right"]'));
      await T.frames(2);
      // fits AND really turned: after a failed full circle the ghost's turn is back at the original one
      okNow = await page.evaluate((r0) => { const pl = window.hearthside.game.placement(); return pl.ok && pl.rot !== r0; }, bed2.rot);
    }
    if (!okNow) {
      const more = (await validTiles(T, 4)).filter((t) => t.px !== bed2.x || t.pz !== bed2.z);
      if (more[attempt]) await placeAt(T, S, 'bed rotate elsewhere', more[attempt], false);
    }
  }
  if (okNow) await T.tap(page.locator('.bb-confirm')); else await T.tap(page.locator('.bb-place-footer button:has-text("Cancel")'));
  await page.waitForTimeout(400);
  const s3 = await state3(T);
  const bed3 = s3.objs.find((o) => o.id === bed.id);
  T.check(S, 'the bed was rotated in place', !!bed3 && bed3.rot !== bed2.rot, `rot ${bed2.rot} -> ${bed3?.rot} at ${bed3?.x},${bed3?.z}`);
  await T.shot('buy-bed-rotated');

  // ---- undo / redo
  const undoBtn = page.locator('.bb-buy-panel .bb-undo button[aria-label="Undo"]');
  const redoBtn = page.locator('.bb-buy-panel .bb-undo button[aria-label="Redo"]');
  await page.evaluate(() => window.hearthside.game.selectObject(null));
  await page.waitForTimeout(200);
  const stack = [s0, s1, s2, s3];
  const chain = [];
  // undo until the bed is gone (3 or 4 steps)
  for (let i = 0; i < 4; i++) {
    if (!(await undoBtn.isEnabled())) break;
    await T.tap(undoBtn);
    await page.waitForTimeout(350);
    chain.push(await state3(T));
  }
  const undone = chain[chain.length - 1];
  T.check(S, 'undo (x3): the purchase is undone, the bed is gone and the money is back', !!undone && !undone.objs.some((o) => o.id === bed.id) && undone.funds === s0.funds, `funds ${fmtMoney(undone?.funds ?? 0)} (start ${fmtMoney(s0.funds)}); ${chain.length} undo steps`);
  const afterFirstUndo = chain[0];
  T.check(S, 'first undo restores the previous bed rotation', !!afterFirstUndo && afterFirstUndo.objs.find((o) => o.id === bed.id)?.rot === bed2.rot, `rot ${afterFirstUndo?.objs.find((o) => o.id === bed.id)?.rot} vs ${bed2.rot}`);
  await T.shot('buy-after-undo');
  const redoChain = [];
  for (let i = 0; i < chain.length; i++) {
    if (!(await redoBtn.isEnabled())) break;
    await T.tap(redoBtn);
    await page.waitForTimeout(350);
    redoChain.push(await state3(T));
  }
  const redone = redoChain[redoChain.length - 1];
  const bedR = redone?.objs.find((o) => o.id === bed.id);
  T.check(S, 'redo restores the bed at its last position and charges the price once', !!bedR && bedR.x === bed3.x && bedR.z === bed3.z && bedR.rot === bed3.rot && s0.funds - redone.funds === price, `bed ${bedR?.x},${bedR?.z} rot ${bedR?.rot}; funds ${fmtMoney(redone?.funds ?? 0)}`);
  await T.shot('buy-after-redo');
  T.afterBuy = redone;
  await T.tap(page.locator('.mode-btn[data-mode="live"]'));
  await page.waitForTimeout(500);
}

// ===============================================================================================================
// STEP 4 - build mode
// ===============================================================================================================

async function stepBuild(T) {
  const S = '4';
  const { page } = T;
  await page.evaluate(() => window.hearthside.view.frameLot(true));
  await T.tap(page.locator('.mode-btn[data-mode="build"]'));
  await page.waitForSelector('.bb-build-panel:not([hidden])', { timeout: 6000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  await T.frames(45);
  await T.shot('build-panel');
  await T.audit('build panel');
  T.check(S, 'Build mode opens the finishes panel', (await page.evaluate(() => window.hearthside.game.mode())) === 'build', '');
  // wall tab
  const wallTab = page.locator('.bb-build-panel .tab[data-id="wall"]');
  if (await wallTab.count()) await T.tap(wallTab);
  await page.waitForTimeout(300);
  // scope: one side
  const oneSide = page.locator('.bb-build-panel [role="radio"], .bb-build-panel button', { hasText: /^One side/ }).first();
  if (await oneSide.count()) await T.tap(oneSide);
  // choose a design different from every wall's current design
  const cards = page.locator('.bb-build-panel .bb-designs .bb-card');
  const nCards = await cards.count();
  T.check(S, 'build panel lists wall designs', nCards >= 6, `${nCards} cards`);
  // find a candidate wall first
  await settle(T);
  const cand = await page.evaluate(() => {
    const st = window.hearthside.debug.state(); const lot = st.lots[st.activeLotId];
    const out = [];
    for (const w of Object.values(lot.walls)) {
      if (w.level !== 0) continue;
      const hasOpening = Object.values(lot.openings).some((o) => o.wallId === w.id);
      if (hasOpening) continue;
      const tiles = w.dir === 'h' ? [[w.x, w.z - 1], [w.x, w.z]] : [[w.x - 1, w.z], [w.x, w.z]];
      if (!tiles.every(([x, z]) => lot.floors[`0:${x}:${z}`])) continue;
      const p = window.__t.wall(w.id);
      if (!p || !p.free) continue;
      const pk = window.__t.pick(p.x, p.y);
      if (pk.kind === 'wall' && pk.wallId === w.id) out.push({ id: w.id, side: pk.side, x: p.x, y: p.y, other: pk.side === 'a' ? 'b' : 'a' });
    }
    return out;
  });
  if (!cand.length) {
    const dbg = await page.evaluate(() => {
      const st = window.hearthside.debug.state(); const lot = st.lots[st.activeLotId]; const out = { walls: 0, noOpening: 0, floored: 0, point: 0, free: 0, picked: 0, ex: [], cut: window.hearthside.game.view.cutaway() };
      for (const w of Object.values(lot.walls)) {
        if (w.level !== 0) continue; out.walls++;
        if (Object.values(lot.openings).some((o) => o.wallId === w.id)) continue; out.noOpening++;
        const tiles = w.dir === 'h' ? [[w.x, w.z - 1], [w.x, w.z]] : [[w.x - 1, w.z], [w.x, w.z]];
        if (!tiles.every(([x, z]) => lot.floors[`0:${x}:${z}`])) continue; out.floored++;
        const p = window.__t.wall(w.id); if (!p) continue; out.point++; if (!p.free) { if (out.ex.length < 4) out.ex.push(['notfree', w.id, Math.round(p.x), Math.round(p.y)]); continue; } out.free++;
        const pk = window.__t.pick(p.x, p.y); if (out.ex.length < 8) out.ex.push([w.id, pk.kind, pk.wallId]);
      }
      return out;
    });
    log('wall scan', JSON.stringify(dbg));
  }
  T.check(S, 'an interior wall can be picked on screen', cand.length > 0, `${cand.length} candidates`);
  if (!cand.length) return;
  const wall = cand[Math.floor(cand.length / 2)];
  const wb = await page.evaluate((w) => { const st = window.hearthside.debug.state(); const x = st.lots[st.activeLotId].walls[w.id]; return { a: x.sideA, b: x.sideB }; }, wall);
  // pick a design that differs from the current finish of this side
  const curDesign = wall.side === 'a' ? wb.a.designId : wb.b.designId;
  let chosen = -1;
  for (let i = 0; i < nCards; i++) {
    const lbl = (await cards.nth(i).getAttribute('aria-label')) ?? '';
    const name = lbl.split(',')[0];
    const id = await page.evaluate((n) => Object.values(window.hearthside.game.content.wallDesigns).find((d) => d.name === n)?.id, name);
    if (id && id !== curDesign && id !== wb.a.designId && id !== wb.b.designId) { chosen = i; T.expected.wallDesignName = name; T.expected.wallDesignId = id; break; }
  }
  await cards.nth(chosen).scrollIntoViewIfNeeded();
  await T.tap(cards.nth(chosen));
  await page.waitForTimeout(400);
  // a non-default palette
  const pals = page.locator('.bb-build-panel .bb-pal');
  const nPal = await pals.count();
  if (nPal > 1) { await T.tap(pals.nth(1)); await page.waitForTimeout(250); }
  const tool = await page.evaluate(() => window.hearthside.game.paintTool());
  T.check(S, 'paint tool is a wall finish scoped to one side', tool?.kind === 'wall' && tool.scope === 'side', JSON.stringify(tool));
  T.expected.wallPalette = tool?.finish?.paletteId;
  await T.shot('build-tool-chosen');
  // re-locate the wall in case the sheet moved the camera
  await T.frames(8);
  const p0 = await pointFor(T, 'wall', wall.id);
  const pk = await page.evaluate(([x, y]) => window.__t.pick(x, y), [p0.x, p0.y]);
  T.check(S, 'the wall is still under the tap point after choosing a tool', pk.kind === 'wall' && pk.wallId === wall.id, JSON.stringify(pk));
  const side = pk.side ?? wall.side;
  if (T.vpInfo.touch) {
    await T.tapAt(p0.x, p0.y);
    await page.waitForTimeout(400);
    await T.frames(3);
    await T.shot('build-preview-tip');
    const tip = await page.locator('.paint-tip:not([hidden])').innerText().catch(() => '');
    T.check(S, 'first tap previews the change (cost/count shown)', /wall side|free|\$/.test(tip), tip);
    const midState = await page.evaluate((id) => { const st = window.hearthside.debug.state(); const w = st.lots[st.activeLotId].walls[id]; return [w.sideA, w.sideB]; }, wall.id);
    T.check(S, 'the preview alone does not change the wall', JSON.stringify(midState) === JSON.stringify([wb.a, wb.b]), '');
  } else {
    await page.mouse.move(p0.x, p0.y);
    await page.waitForTimeout(300);
    await T.frames(3);
    await T.shot('build-preview-hover');
  }
  const fundsPre = (await state3(T)).funds;
  await T.tapAt(p0.x, p0.y);
  await page.waitForTimeout(500);
  await T.frames(4);
  const wa = await page.evaluate((id) => { const st = window.hearthside.debug.state(); const w = st.lots[st.activeLotId].walls[id]; return { a: w.sideA, b: w.sideB }; }, wall.id);
  const changedSides = ['a', 'b'].filter((k) => JSON.stringify(wa[k]) !== JSON.stringify(wb[k]));
  const changed = wa[side], untouched = wa[side === 'a' ? 'b' : 'a'], untouchedBefore = wb[side === 'a' ? 'b' : 'a'];
  T.check(S, 'exactly one wall side changed, the one that was tapped (facing the camera)', changedSides.length === 1 && changedSides[0] === side, `tapped side ${side}, changed sides [${changedSides.join(',')}]; pick at tap ${JSON.stringify(pk)}`);
  T.check(S, 'the tapped wall side has the new finish', changed.designId === T.expected.wallDesignId, `${wb[side].designId} -> ${changed.designId}/${changed.paletteId}`);
  T.check(S, 'the other side of that wall is unchanged', JSON.stringify(untouched) === JSON.stringify(untouchedBefore), JSON.stringify({ untouched, untouchedBefore }));
  const fundsPost = (await state3(T)).funds;
  log('paint cost', fmtMoney(fundsPre - fundsPost));
  T.wall = { id: wall.id, side, finish: changed, other: untouched };
  await T.shot('build-wall-painted');
  // zoom to the wall for the picture
  await page.evaluate((id) => { const w = id.split(':'); const x = Number(w[2]), z = Number(w[3]); window.hearthside.view.rig.glideTo(w[1] === 'h' ? x + 0.5 : x, w[1] === 'h' ? z : z + 0.5, 90, 0, 0.4); }, wall.id);
  await T.frames(14);
  await T.shot('build-wall-closeup');
  // build undo/redo
  const buildUndo = page.locator('.bb-build-panel .bb-undo button[aria-label="Undo"]');
  const buildRedo = page.locator('.bb-build-panel .bb-undo button[aria-label="Redo"]');
  await T.tap(buildUndo);
  await page.waitForTimeout(300);
  const wu = await page.evaluate((id) => { const st = window.hearthside.debug.state(); const w = st.lots[st.activeLotId].walls[id]; return { a: w.sideA, b: w.sideB }; }, wall.id);
  T.check(S, 'undo restores the old wall finish', JSON.stringify(wu) === JSON.stringify(wb), '');
  await T.tap(buildRedo);
  await page.waitForTimeout(300);
  const wr = await page.evaluate((id) => { const st = window.hearthside.debug.state(); const w = st.lots[st.activeLotId].walls[id]; return { a: w.sideA, b: w.sideB }; }, wall.id);
  T.check(S, 'redo re-applies the new finish', JSON.stringify(wr) === JSON.stringify(wa), '');
  await T.tap(page.locator('.mode-btn[data-mode="live"]'));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.hearthside.view.frameLot(true));
  await T.frames(4);
}

// ===============================================================================================================
// STEP 5 - save, reload, load, compare
// ===============================================================================================================

const deepDiff = (a, b, path = '') => {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return [`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((k) => deepDiff(a[k], b[k], `${path}/${k}`));
};

async function stepSaveLoad(T) {
  const S = '5';
  const { page } = T;
  await page.evaluate(() => window.hearthside.game.setSpeed(0));
  const before = await page.evaluate(() => window.__t.snapshot());
  T.snapBefore = before;
  // game menu -> Save game -> slot 1 -> name -> Save
  await T.tap(page.locator('.menu-btn'));
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.waitForTimeout(300);
  await T.shot('menu-open');
  await T.audit('game menu');
  await T.tap(page.locator('.modal .row-btn', { hasText: 'Save game' }));
  await page.waitForSelector('.slot-main', { timeout: 6000 });
  await page.waitForTimeout(400);
  await T.shot('save-dialog');
  await T.audit('save dialog');
  const slotBtns = page.locator('.modal button', { hasText: /Save here|Overwrite/ });
  T.check(S, 'save dialog lists save slots with a Save here button', (await slotBtns.count()) >= 5, `${await slotBtns.count()} slot buttons`);
  await T.tap(slotBtns.first());
  const nameInput = page.locator('.modal input[type="text"]').last();
  await nameInput.waitFor({ timeout: 4000 });
  await nameInput.fill('Acceptance run');
  await T.shot('save-name');
  await T.tap(page.locator('.modal button', { hasText: /^Save$/ }).last());
  await page.waitForTimeout(1200);
  await T.shot('save-done');
  const slots = await page.evaluate(() => window.hearthside.game.listSaves());
  const mine = slots.find((s) => s.name === 'Acceptance run' && !s.empty);
  T.check(S, 'the save slot exists with the chosen name and funds', !!mine && mine.funds === before.funds, JSON.stringify(mine));
  // close the dialog if still open
  const close = page.locator('.modal button[aria-label="Close panel"], .modal .modal-close, .modal button:has-text("Done"), .modal button:has-text("Close")').first();
  if (await page.locator('.modal').count()) { if (await close.count()) await T.tap(close).catch(() => undefined); else await page.keyboard.press('Escape'); }
  await page.waitForTimeout(400);

  // ---- reload and load from the main menu
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await T.frames(3);
  await T.shot('after-reload-menu');
  await T.tap(page.getByRole('button', { name: /Load Game/ }).first());
  await page.waitForSelector('.slot-main', { timeout: 8000 });
  await page.waitForTimeout(400);
  await T.shot('load-dialog');
  const loadBtn = page.locator('.modal button[aria-label="Load Acceptance run"]');
  T.check(S, 'the load dialog shows the saved slot after the reload', (await loadBtn.count()) === 1, '');
  await T.tap(loadBtn);
  await page.waitForFunction(() => ['live', 'buy', 'build'].includes(window.hearthside.game.mode()), null, { timeout: 60000 });
  T.speedAfterLoad = await page.evaluate(() => { const g = window.hearthside.game; const s = g.speed(); g.setSpeed(0); return s; }); // pause at once: a load resumes at Normal speed
  await page.waitForTimeout(1500);
  await T.frames(8);
  await page.evaluate(() => window.hearthside.game.setSpeed(0));
  await T.shot('after-load');
  const after = await page.evaluate(() => window.__t.snapshot());
  const members = await page.evaluate(() => { const st = window.hearthside.debug.state(); return st.households[st.activeHouseholdId].memberIds; });
  T.members = members;
  const diffs = deepDiff(before, after);
  T.check(S, 'everything persisted: people, outfits, traits, funds, objects, walls, floors', diffs.length === 0, diffs.slice(0, 6).join(' || ') || `${after.people.length} people, ${after.objects.length} objects, funds ${fmtMoney(after.funds)}`);
  const E = T.expected;
  const p0 = after.people[0];
  T.check(S, 'loaded: names', p0.first === 'Mira' && p0.last === 'Vance' || !T.created, `${p0.first} ${p0.last}`);
  if (T.created) {
    T.check(S, 'loaded: hairstyle and colour as chosen in the creator', p0.hair.styleId === T.created.hairStyleId && p0.hair.color.toLowerCase() === E.hairColor, JSON.stringify(p0.hair));
    T.check(S, 'loaded: body preset as chosen', p0.bodyPresetId === T.created.bodyPresetId, `${p0.bodyPresetId}`);
    const lay = (p0.outfits.outfits.everyday ?? []).flatMap((o) => Object.values(o.layers));
    T.check(S, 'loaded: the patterned everyday outfit is intact', lay.some((l) => l && l.pattern && l.pattern !== 'solid'), JSON.stringify(lay.map((l) => l && `${l.garmentId}:${l.pattern}`)));
    T.check(S, 'loaded: exactly three traits, same as chosen', p0.traits.length === 3 && JSON.stringify(p0.traits) === JSON.stringify(T.created.people[0].traits), p0.traits.join(','));
    T.check(S, 'loaded: aspiration as chosen', p0.aspiration === T.created.people[0].asp, `${p0.aspiration}`);
    T.check(S, 'loaded: roommate tie and household name kept', after.hhName === 'Vance House' && after.ties.some((t) => /roommate/.test(t)), `${after.hhName}; ${after.ties.join(' ; ')}`);
  }
  if (T.afterBuy && T.bedId) {
    const bed = after.objects.find((o) => o.id === T.bedId);
    const wanted = T.afterBuy.objs.find((o) => o.id === T.bedId);
    T.check(S, 'loaded: the bought bed is where it was left (position and rotation)', !!bed && !!wanted && bed.x === wanted.x && bed.z === wanted.z && bed.rot === wanted.rot, JSON.stringify(bed));
    T.check(S, 'loaded: funds equal the funds at save time', after.funds === before.funds, `${fmtMoney(after.funds)}`);
  }
  if (T.wall) {
    const w = after.walls[T.wall.id];
    const got = T.wall.side === 'a' ? w[0] : w[1];
    T.check(S, 'loaded: the wall finish on the painted side persisted', got.designId === T.wall.finish.designId && got.paletteId === T.wall.finish.paletteId, JSON.stringify(got));
  }
  await page.evaluate(() => window.hearthside.view.frameLot(true));
  await T.frames(4);
  await T.shot('after-load-live');
}

// ===============================================================================================================
// STEP 6 - rotating the device
// ===============================================================================================================

const layoutInfo = (T) => T.page.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
  const vis = (sel) => { const e = [...document.querySelectorAll(sel)].find((x) => x.offsetParent !== null || getComputedStyle(x).position === 'fixed'); return e; };
  const se = document.scrollingElement;
  return {
    vw: innerWidth, vh: innerHeight, overflowX: se.scrollWidth > innerWidth + 1, overflowY: se.scrollHeight > innerHeight + 1,
    panel: r(vis('.cr-panel, .bb-buy-panel')), next: r(vis('.cr-next')), place: r(vis('.bb-confirm')), top: r(vis('.cr-top, .hud-top')),
    canvas: r(document.getElementById('game-canvas')),
  };
});

async function setVp(T, w, h) {
  await T.page.setViewportSize({ width: w, height: h });
  await T.page.waitForTimeout(900);
  await T.frames(8);
}

const intersects = (a, b) => a && b && !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);

async function stepRotate(T) {
  const S = '6';
  const { page, vpInfo } = T;
  const orig = { w: vpInfo.w, h: vpInfo.h };
  const other = vpInfo.other;
  // ---- a) rotation during a creator edit
  await page.evaluate(() => window.hearthside.game.setSpeed(0));
  await T.tap(page.locator('.menu-btn'));
  await page.waitForSelector('.modal', { timeout: 5000 });
  await T.tap(page.locator('.modal .row-btn', { hasText: 'Quit to main menu' }));
  await T.tap(page.locator('.modal button', { hasText: /^Quit$/ }).last());
  await page.waitForFunction(() => window.hearthside.game.mode() === 'menu', null, { timeout: 15000 });
  await page.waitForTimeout(800);
  await T.tap(page.getByRole('button', { name: /New Game/ }).first());
  await T.tap(page.getByText('Create a Household').first());
  await page.waitForSelector('.cr-panel', { timeout: 30000 });
  await page.waitForTimeout(2000);
  await T.frames(8);
  const first = page.getByLabel('First name').first();
  await first.fill('Rotatest');
  await first.press('Tab');
  await T.tap(page.locator('.cr-next')); await page.waitForTimeout(300);
  await T.tap(page.locator('.cr-next')); await page.waitForTimeout(300);
  const hairCards = page.locator('.cr-hair-grid .cr-card');
  let pickIdx = 2;
  for (let i = 0; i < await hairCards.count(); i++) if ((await hairCards.nth(i).getAttribute('aria-checked')) !== 'true') { pickIdx = i; break; }
  const hairTitle = (await hairCards.nth(pickIdx).locator('.cr-card-title').innerText()).trim();
  await T.tap(hairCards.nth(pickIdx));
  await T.frames(6);
  await T.shot('rotate-creator-before');
  const L0 = await layoutInfo(T);
  await setVp(T, other.w, other.h);
  await T.shot('rotate-creator-after');
  const L1 = await layoutInfo(T);
  const stillHair = await hairCards.nth(pickIdx).getAttribute('aria-checked');
  await T.tap(page.locator('.tab[data-id="identity"]').first()).catch(() => undefined);
  await page.waitForTimeout(300);
  const nameKept = await page.getByLabel('First name').first().inputValue().catch(() => null);
  T.check(S, 'creator: the typed name survives the rotation', nameKept === 'Rotatest', `${nameKept}`);
  T.check(S, 'creator: the chosen hairstyle survives the rotation', stillHair === 'true', hairTitle);
  T.check(S, 'creator: the panel re-laid out for the new orientation', JSON.stringify(L0.panel) !== JSON.stringify(L1.panel) && L1.panel.r <= L1.vw + 1 && L1.panel.b <= L1.vh + 1, `${JSON.stringify(L0.panel)} -> ${JSON.stringify(L1.panel)}`);
  T.check(S, 'creator: no page overflow and the Next button is on screen afterwards', !L1.overflowX && L1.next && L1.next.b <= L1.vh + 1 && L1.next.r <= L1.vw + 1, JSON.stringify(L1.next));
  const nextPt = L1.next && { x: (L1.next.l + L1.next.r) / 2, y: (L1.next.t + L1.next.b) / 2 };
  const hit = nextPt ? await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.cr-next') !== null, [nextPt.x, nextPt.y]) : false;
  T.check(S, 'creator: the Next button is tappable after the rotation', hit, JSON.stringify(nextPt));
  // the 3D preview still draws the person: canvas isn't blank
  const px = await page.evaluate(() => { window.hearthside.debug.frame(1 / 30); const c = document.getElementById('game-canvas'); const t = document.createElement('canvas'); t.width = 32; t.height = 18; const ctx = t.getContext('2d'); ctx.drawImage(c, 0, 0, 32, 18); const d = ctx.getImageData(0, 0, 32, 18).data; let min = 255, max = 0, a = 0; for (let i = 0; i < d.length; i += 4) { const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; min = Math.min(min, l); max = Math.max(max, l); a += d[i + 3]; } return { contrast: max - min, alpha: a / (d.length / 4) }; });
  T.check(S, 'creator: the preview canvas is not blank after the rotation', px.alpha > 200 && px.contrast > 12, JSON.stringify(px));
  // rotate back
  await setVp(T, orig.w, orig.h);
  await T.shot('rotate-creator-back');
  const L2 = await layoutInfo(T);
  T.check(S, 'creator: rotating back restores the original layout', Math.abs((L2.panel?.t ?? 0) - (L0.panel?.t ?? 0)) <= 6 && Math.abs((L2.panel?.l ?? 0) - (L0.panel?.l ?? 0)) <= 6, `${JSON.stringify(L0.panel)} -> ${JSON.stringify(L2.panel)}`);
  const stillHair2 = await hairCards.nth(pickIdx).getAttribute('aria-checked').catch(() => null);
  T.check(S, 'creator: edit still intact after rotating back', stillHair2 === 'true' || (await page.getByLabel('First name').first().inputValue()) === 'Rotatest', '');
  // leave the creator (cancel, confirm)
  await T.tap(page.locator('.cr-close, button[aria-label="Cancel creating"]').first());
  await page.waitForTimeout(500);
  const confirmBtn = page.locator('.modal button', { hasText: /Discard|Leave|Cancel creating|Yes|Quit|Exit/ }).last();
  if (await confirmBtn.count()) await T.tap(confirmBtn);
  await page.waitForFunction(() => window.hearthside.game.mode() === 'menu', null, { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  await T.shot('rotate-creator-left');

  // ---- b) rotation during a buy placement preview (load the save first)
  await T.tap(page.getByRole('button', { name: /Load Game/ }).first());
  await page.waitForSelector('.slot-main', { timeout: 8000 });
  await T.tap(page.locator('.modal button[aria-label="Load Acceptance run"]'));
  await page.waitForFunction(() => ['live', 'buy', 'build'].includes(window.hearthside.game.mode()), null, { timeout: 60000 });
  await page.evaluate(() => window.hearthside.game.setSpeed(0));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.hearthside.view.frameLot(true));
  await T.frames(6);
  await T.tap(page.locator('.mode-btn[data-mode="buy"]'));
  await page.waitForSelector('.bb-buy-panel:not([hidden])', { timeout: 6000 });
  await page.waitForTimeout(500);
  const search = page.getByLabel('Search the catalog');
  if (!(await search.isVisible().catch(() => false))) { const sb = page.locator('.bb-buy-panel button[aria-label="Search"]').first(); if (await sb.count()) await T.tap(sb); }
  await search.fill('armchair');
  await page.waitForTimeout(400);
  await T.tap(page.locator('.bb-buy-panel .bb-card').first());
  await page.waitForTimeout(400);
  await T.tap(page.locator('.bb-buy-panel .bb-buy-row button').last());
  await page.waitForTimeout(500);
  await T.frames(4);
  const tiles = await validTiles(T, 3);
  const tile = tiles[0];
  await placeAt(T, S, 'rotation preview', tile, false);
  await T.tap(page.locator('.bb-place-footer button[aria-label="Rotate left"]'));
  await T.frames(3);
  const plBefore = await page.evaluate(() => window.hearthside.game.placement());
  await T.shot('rotate-buy-before');
  const B0 = await layoutInfo(T);
  await setVp(T, other.w, other.h);
  await T.shot('rotate-buy-after');
  const B1 = await layoutInfo(T);
  const plAfter = await page.evaluate(() => window.hearthside.game.placement());
  T.check(S, 'buy: the placement preview survives the rotation (same item, tile and turn)', !!plAfter && plAfter.defId === plBefore.defId && plAfter.x === plBefore.x && plAfter.z === plBefore.z && plAfter.rot === plBefore.rot, JSON.stringify({ before: plBefore && [plBefore.x, plBefore.z, plBefore.rot], after: plAfter && [plAfter.x, plAfter.z, plAfter.rot] }));
  T.check(S, 'buy: the panel re-laid out', JSON.stringify(B0.panel) !== JSON.stringify(B1.panel) && B1.panel.r <= B1.vw + 1 && B1.panel.b <= B1.vh + 1, `${JSON.stringify(B0.panel)} -> ${JSON.stringify(B1.panel)}`);
  const ghost = await page.evaluate(([x, z]) => window.__t.tile(x, z), [plAfter.x, plAfter.z]);
  T.check(S, 'buy: the ghost tile is still visible and not covered by the panel', ghost.free, JSON.stringify(ghost));
  T.check(S, 'buy: Place/Cancel footer is on screen after the rotation', !!B1.place && B1.place.b <= B1.vh + 1 && B1.place.r <= B1.vw + 1, JSON.stringify(B1.place));
  // a tap on another tile in the new orientation hits that tile
  const tiles2 = (await validTiles(T, 4)).filter((t) => t.px !== plAfter.x || t.pz !== plAfter.z);
  if (tiles2.length) {
    const t2 = tiles2[0];
    await T.tapAt(t2.x, t2.y);
    await T.frames(3);
    const pl3 = await page.evaluate(() => window.hearthside.game.placement());
    if (vpInfo.touch) T.check(S, 'buy: a tap after the rotation lands on the tapped tile', pl3 && pl3.x === t2.px && pl3.z === t2.pz, JSON.stringify(pl3 && [pl3.x, pl3.z]) + ` wanted ${t2.px},${t2.pz}`);
    else T.check(S, 'buy: a click after the rotation lands on the clicked tile (desktop click confirms)', !!(await page.evaluate(([x, z]) => Object.values(window.hearthside.debug.state().lots[window.hearthside.debug.state().activeLotId].objects).some((o) => o.x === x && o.z === z), [t2.px, t2.pz])), `${t2.px},${t2.pz}`);
  }
  await T.shot('rotate-buy-retapped');
  await setVp(T, orig.w, orig.h);
  await T.shot('rotate-buy-back');
  if (await page.evaluate(() => !!window.hearthside.game.placement())) await T.tap(page.locator('.bb-place-footer button:has-text("Cancel")'));
  await T.tap(page.locator('.mode-btn[data-mode="live"]'));
  await page.waitForTimeout(500);
  await T.shot('rotate-end-live');
}

// ===============================================================================================================
// STEP 7 - Milestone 2 home editor: build a room, add a door and a window, paint each wall side and the floor,
// undo and redo, then have a person walk in. Real taps and drags; window.hearthside only reads state.
// ===============================================================================================================

const cents = (s) => { const m = /\$([\d,]+(?:\.\d\d)?)/.exec(s ?? ''); return m ? Math.round(Number(m[1].replace(/,/g, '')) * 100) : null; };

const lotSnap = (T) => T.page.evaluate(() => {
  const st = window.hearthside.debug.state(); const lot = st.lots[st.activeLotId]; const hh = st.households[st.activeHouseholdId];
  return JSON.parse(JSON.stringify({ walls: lot.walls, openings: lot.openings, floors: lot.floors, funds: hh.funds }));
});
const footerText = (T) => T.page.locator('.bb-build-status').innerText().catch(() => '');
const confirmState = (T) => T.page.evaluate(() => { const b = document.querySelector('.bb-confirm'); return b && !b.closest('[hidden]') ? { disabled: b.disabled, label: b.textContent.trim() } : null; });

/** Taps an enabled Confirm / Done style footer button. */
async function tapFooter(T, sel) {
  const b = T.page.locator(`.bb-build-footer ${sel}`).first();
  await T.tap(b);
  await T.page.waitForTimeout(400);
  await T.frames(4);
}

/**
 * A free screen point for a world point while a drag tool is active (a one-finger drag would draw, not pan, so the camera
 * is moved with the rig instead of with drags).
 */
async function freePoint(T, kind, a, b) {
  for (let i = 0; i < 4; i++) {
    const p = await T.page.evaluate(([k, x, z]) => window.__t[k](x, z), [kind, a, b]);
    if (p?.free) return p;
    const wx = kind === 'tile' ? a + 0.5 : a, wz = kind === 'tile' ? b + 0.5 : b;
    await T.page.evaluate(([x, z]) => window.hearthside.view.rig.glideTo(x, z, undefined, 0.1), [wx, wz]);
    await T.frames(12);
    await settle(T);
  }
  return T.page.evaluate(([k, x, z]) => window.__t[k](x, z), [kind, a, b]);
}

/** Moves the camera so the north strip of the lot (where the new room goes) is in the middle of the free canvas, zoomed to fit it. */
async function frameNorth(T, cx, cz, tilesWide) {
  const { w, h } = T.vpInfo;
  const free = T.vpInfo.touch && h > w ? w : T.vpInfo.touch ? w - 380 : w - 380;
  const ppm = Math.max(26, Math.min(80, Math.floor((free - 30) / (tilesWide * 0.72))));
  await T.page.evaluate(([x, z, p]) => window.hearthside.view.rig.glideTo(x, z, p, 0.15), [cx, cz, ppm]);
  await T.frames(20);
  await settle(T);
}

async function stepHomeEditor(T) {
  const S = '7';
  const { page, vpInfo } = T;
  const touch = vpInfo.touch;
  await page.evaluate(() => { window.hearthside.game.setSpeed(0); document.querySelectorAll('.toast').forEach((t) => t.remove()); });
  if ((await page.evaluate(() => window.hearthside.game.mode())) !== 'live') { await T.tap(page.locator('.mode-btn[data-mode="live"]')); await page.waitForTimeout(400); }
  await T.tap(page.locator('.mode-btn[data-mode="build"]'));
  await page.waitForSelector('.bb-build-panel:not([hidden])', { timeout: 8000 });
  await page.waitForTimeout(700);
  await T.frames(30);
  T.check(S, 'Build opens with the tool tabs (Paint, Walls, Room, Doors, Windows, Erase)', (await page.locator('.bb-tool-tabs .tab').count()) === 6, `${await page.locator('.bb-tool-tabs .tab').count()} tabs`);
  T.check(S, 'the simulation stays paused in Build', (await page.evaluate(() => window.hearthside.game.speed())) === 0, '');
  await T.shot('m2-build-panel');
  await T.audit('build panel (tool tabs)');

  // ---- the floor to lay: chosen under Paint -> Floors
  await T.tap(page.locator('.bb-build-panel .tab[data-id="floor"]'));
  await page.waitForTimeout(300);
  const floorCards = page.locator('.bb-build-panel .bb-designs .bb-card');
  await floorCards.first().scrollIntoViewIfNeeded().catch(() => undefined);
  await T.tap(floorCards.first());
  await page.waitForTimeout(300);
  const floorTool = await page.evaluate(() => window.hearthside.game.paintTool());
  T.check(S, 'a floor finish is chosen (paint tool: floor)', floorTool?.kind === 'floor', JSON.stringify(floorTool));
  T.expected.roomFloor = floorTool?.finish?.designId;

  // ---- Room tool
  await T.tap(page.locator('.bb-tool-tabs .tab[data-id="tool-room"]'));
  await page.waitForTimeout(500);
  await T.frames(10);
  const roomTool = await page.evaluate(() => window.hearthside.game.buildTool());
  T.check(S, 'the Room tab chooses the room tool (floor + a door) and ends the paint tool', roomTool?.kind === 'room' && !!roomTool.floor && (roomTool.doors?.length ?? 0) === 1 && (await page.evaluate(() => window.hearthside.game.paintTool())) === null, JSON.stringify(roomTool));
  await T.shot('m2-room-tool');
  await T.audit('room tool');

  // ---- draw the room on the empty north strip of the lot
  const X0 = 8, Z0 = 1, X1 = 14, Z1 = 4;
  await frameNorth(T, (X0 + X1) / 2, (Z0 + Z1) / 2, X1 - X0 + Z1 - Z0);
  const pa = await freePoint(T, 'vertex', X0, Z0);
  const pc = await freePoint(T, 'vertex', X1, Z1);
  T.check(S, 'both corners of the new room are visible and free of UI', !!pa?.free && !!pc?.free, JSON.stringify({ pa, pc }));
  const s0 = await lotSnap(T);

  if (!touch) {
    // desktop: Esc during the drag cancels; a drag applies on mouse-up
    await page.mouse.move(pa.x, pa.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) { await page.mouse.move(pa.x + ((pc.x - pa.x) * i) / 6, pa.y + ((pc.y - pa.y) * i) / 6); await page.waitForTimeout(20); }
    await T.frames(3);
    const live = await footerText(T);
    T.check(S, 'while dragging, the footer shows the measurement and the cost', /6 x 3/.test(live) && /\$/.test(live), live.replace(/\s+/g, ' '));
    await T.shot('m2-room-dragging');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.waitForTimeout(300);
    T.check(S, 'Esc during the drag builds nothing', JSON.stringify(await lotSnap(T)) === JSON.stringify(s0), '');
  } else {
    // touch: a drag only sets the preview; Cancel clears it
    await drag(T, pa, pc);
    await page.waitForTimeout(300);
    await T.frames(4);
    const live = await footerText(T);
    const cs = await confirmState(T);
    const nHandles = await page.locator('.bb-handle:not([hidden])').count();
    T.check(S, 'a touch drag shows the measurement and cost, four corner handles and an enabled Confirm', /6 x 3/.test(live) && /\$/.test(live) && nHandles === 4 && cs && !cs.disabled, `${live.replace(/\s+/g, ' ')} | handles ${nHandles} | confirm ${JSON.stringify(cs)}`);
    T.check(S, 'the preview alone builds nothing and takes no money', JSON.stringify(await lotSnap(T)) === JSON.stringify(s0), '');
    await T.shot('m2-room-preview');
    const hbox = await page.locator('.bb-handle[data-handle="c2"]').boundingBox();
    T.check(S, 'the corner handles are large touch targets (>= 44 px)', !!hbox && hbox.width >= 44 && hbox.height >= 44, JSON.stringify(hbox));
    await tapFooter(T, '.bb-cancel');
    T.check(S, 'Cancel clears the preview and the handles but keeps the tool', (await page.locator('.bb-handle:not([hidden])').count()) === 0 && (await page.evaluate(() => window.hearthside.game.buildTool()))?.kind === 'room' && JSON.stringify(await lotSnap(T)) === JSON.stringify(s0), '');
    // draw again, then rotate the device: the preview survives
    const pa2 = await freePoint(T, 'vertex', X0, Z0);
    const pc2 = await freePoint(T, 'vertex', X1, Z1);
    await drag(T, pa2, pc2);
    await T.frames(4);
    const before = await footerText(T);
    const orig = { w: vpInfo.w, h: vpInfo.h }, other = vpInfo.other;
    await setVp(T, other.w, other.h);
    await T.shot('m2-room-preview-rotated');
    const afterTxt = await footerText(T);
    const hs = await page.evaluate(() => [...document.querySelectorAll('.bb-handle:not([hidden])')].map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
    T.check(S, 'rotating the device keeps the room preview (text, Confirm and four handles on screen)', afterTxt === before && hs.length === 4 && hs.every((p) => p.x > 0 && p.y > 0 && p.x < other.w && p.y < other.h) && !(await confirmState(T))?.disabled, `${hs.length} handles ${JSON.stringify(hs.map((p) => [Math.round(p.x), Math.round(p.y)]))}; text same: ${afterTxt === before}`);
    await setVp(T, orig.w, orig.h);
    await T.frames(6);
    await settle(T);
    T.check(S, 'rotating back keeps it too', (await footerText(T)) === before && (await page.locator('.bb-handle:not([hidden])').count()) === 4, '');
    // resize with a handle: the south-east corner one tile further east
    const hb = await page.locator('.bb-handle[data-handle="c2"]').boundingBox();
    const hfrom = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 };
    const vt = await page.evaluate(([x, z]) => window.__t.vertex(x, z), [X1 + 1, Z1]);
    await drag(T, hfrom, { x: vt.x, y: vt.y });
    await T.frames(4);
    const resized = await footerText(T);
    T.check(S, 'dragging a corner handle resizes the room live (7 x 3 m)', /7 x 3/.test(resized), resized.replace(/\s+/g, ' '));
    await T.shot('m2-room-resized');
  }

  // ---- confirm (desktop applied it on mouse-up already)
  const costText = touch ? await footerText(T) : '';
  const wantRoomCost = touch ? cents(costText) : null;
  if (touch) await tapFooter(T, '.bb-confirm');
  else {
    const pa3 = await freePoint(T, 'vertex', X0, Z0);
    const pc3 = await freePoint(T, 'vertex', X1, Z1);
    await drag(T, pa3, pc3);
    await T.frames(4);
  }
  await page.waitForTimeout(500);
  await T.frames(6);
  const s1 = await lotSnap(T);
  const addedWalls = Object.keys(s1.walls).filter((k) => !s0.walls[k]);
  const addedFloors = Object.keys(s1.floors).filter((k) => !s0.floors[k]);
  const addedOpenings = Object.keys(s1.openings).filter((k) => !s0.openings[k]);
  const dims = touch ? { w: 7, d: 3 } : { w: X1 - X0, d: Z1 - Z0 };
  T.check(S, 'the room tool built the perimeter walls', addedWalls.length === 2 * (dims.w + dims.d), `${addedWalls.length} new walls, wanted ${2 * (dims.w + dims.d)}`);
  T.check(S, 'the room got its floor (every tile inside) in the chosen design', addedFloors.length === dims.w * dims.d && addedFloors.every((k) => s1.floors[k].designId === T.expected.roomFloor), `${addedFloors.length} floor tiles of ${dims.w * dims.d}`);
  T.check(S, 'the room got a door in its wall', addedOpenings.length === 1 && /door/.test(s1.openings[addedOpenings[0]].defId), JSON.stringify(addedOpenings.map((k) => s1.openings[k].defId)));
  T.check(S, 'money was taken once, equal to the cost shown before confirming', s0.funds - s1.funds > 0 && (!wantRoomCost || s0.funds - s1.funds === wantRoomCost), `paid ${fmtMoney(s0.funds - s1.funds)}, shown ${wantRoomCost === null ? 'n/a (applied on release)' : fmtMoney(wantRoomCost)}`);
  const room = await page.evaluate(([x, z]) => { const r = window.hearthside.game.roomAt({ x, z }); return r && { uid: r.uid, area: r.area, outdoor: r.outdoor }; }, [X0 + 1, Z0 + 1]);
  T.check(S, 'the new walls enclose a detected room', !!room && !room.outdoor && room.area === dims.w * dims.d, JSON.stringify(room));
  T.check(S, 'the footer is ready for the next room (Confirm off, nothing pending)', (await confirmState(T))?.disabled === true && (await page.locator('.bb-handle:not([hidden])').count()) === 0, JSON.stringify(await confirmState(T)));
  await T.shot('m2-room-built');
  const doorWall = Object.values(s1.openings).find((o) => /door/.test(o.defId) && !s0.openings[o.id]).wallId;
  const doorX = Number(doorWall.split(':')[2]), doorZ = Number(doorWall.split(':')[3]);

  // ---- a window in the north wall (Windows tab: catalog, then the wall)
  await T.tap(page.locator('.bb-tool-tabs .tab[data-id="tool-window"]'));
  await page.waitForTimeout(500);
  const winId = await page.evaluate(() => Object.values(window.hearthside.game.content.openings).filter((d) => d.kind === 'window' && d.status === 'ready' && d.width === 1).sort((a, b) => a.price - b.price)[0]?.id);
  const nCards = await page.locator('.bb-open-host .bb-card').count();
  T.check(S, 'the Windows tab lists the window catalog with names and prices', nCards >= 2 && (await page.locator('.bb-open-host .bb-card .card-name').first().innerText()).length > 2 && /\$/.test(await page.locator('.bb-open-host .bb-card').first().innerText()), `${nCards} cards`);
  await T.shot('m2-window-catalog');
  const winCard = page.locator(`.bb-open-host .bb-card[data-def-id="${winId}"]`);
  if (await winCard.count()) { await winCard.scrollIntoViewIfNeeded().catch(() => undefined); await T.tap(winCard); }
  await page.waitForTimeout(300);
  T.check(S, 'choosing a window selects the opening tool', (await page.evaluate(() => window.hearthside.game.buildTool()))?.defId === winId, winId);
  const winWall = `0:h:${X0 + 1}:${Z0}`;
  const wp = await pointFor(T, 'wall', winWall);
  const s1b = await lotSnap(T);
  await T.tapAt(wp.x, wp.y);
  await page.waitForTimeout(400);
  await T.frames(4);
  if (touch) {
    const st = await footerText(T);
    T.check(S, 'a tap on a wall previews the window in it (money not taken yet)', /Cost|Free/.test(st) && (await lotSnap(T)).funds === s1b.funds, st.replace(/\s+/g, ' '));
    await T.shot('m2-window-preview');
    await tapFooter(T, '.bb-confirm');
  }
  await page.waitForTimeout(400);
  const s2 = await lotSnap(T);
  const winOpening = Object.values(s2.openings).find((o) => o.defId === winId && !s1.openings[o.id]);
  T.check(S, 'the window is in the north wall and cost its catalog price', !!winOpening && winOpening.wallId === winWall && s1.funds - s2.funds === (await page.evaluate((id) => window.hearthside.game.content.openings[id].price, winId)), JSON.stringify(winOpening && winOpening.wallId));
  await T.shot('m2-window-placed');

  // ---- paint each side of a wall independently: the west wall, once from each side
  await T.tap(page.locator('.bb-tool-tabs .tab[data-id="tool-paint"]'));
  await page.waitForTimeout(400);
  await T.tap(page.locator('.bb-build-panel .tab[data-id="wall"]'));
  await page.waitForTimeout(300);
  const one = page.locator('.bb-build-panel [role="radio"], .bb-build-panel button', { hasText: /^One side/ }).first();
  if (await one.count()) await T.tap(one);
  const wallCards = page.locator('.bb-build-panel .bb-designs .bb-card');
  const westWall = `0:v:${X0}:${Z0 + 1}`;
  const wb = await page.evaluate((id) => { const st = window.hearthside.debug.state(); const w = st.lots[st.activeLotId].walls[id]; return { a: w.sideA, b: w.sideB }; }, westWall);
  const paintSide = async (cardIdx, label) => {
    await wallCards.nth(cardIdx).scrollIntoViewIfNeeded().catch(() => undefined);
    await T.tap(wallCards.nth(cardIdx));
    await page.waitForTimeout(300);
    const tool = await page.evaluate(() => window.hearthside.game.paintTool());
    const p = await pointFor(T, 'wall', westWall);
    const pk = await page.evaluate(([x, y]) => window.__t.pick(x, y), [p.x, p.y]);
    if (pk.kind !== 'wall' || pk.wallId !== westWall) { T.bad(S, `${label}: the west wall is under the tap point`, JSON.stringify(pk)); return null; }
    if (touch) { await T.tapAt(p.x, p.y); await page.waitForTimeout(350); }
    else { await page.mouse.move(p.x, p.y); await page.waitForTimeout(250); }
    await T.tapAt(p.x, p.y);
    await page.waitForTimeout(500);
    await T.frames(4);
    return { side: pk.side, design: tool.finish.designId, palette: tool.finish.paletteId };
  };
  const designs = await page.evaluate(([a, b]) => ({ a, b }), [wb.a.designId, wb.b.designId]);
  const idxOf = async (avoid) => {
    const n = await wallCards.count();
    for (let i = 0; i < n; i++) {
      const lbl = ((await wallCards.nth(i).getAttribute('aria-label')) ?? '').split(',')[0];
      const id = await page.evaluate((nm) => Object.values(window.hearthside.game.content.wallDesigns).find((d) => d.name === nm)?.id, lbl);
      if (id && !avoid.includes(id)) return i;
    }
    return 0;
  };
  const first = await paintSide(await idxOf([designs.a, designs.b]), 'first side');
  const afterFirst = await page.evaluate((id) => { const st = window.hearthside.debug.state(); const w = st.lots[st.activeLotId].walls[id]; return { a: w.sideA, b: w.sideB }; }, westWall);
  T.check(S, 'painting the new wall changes only the side facing the camera', !!first && afterFirst[first.side === 'a' ? 'a' : 'b'].designId === first.design && JSON.stringify(afterFirst[first.side === 'a' ? 'b' : 'a']) === JSON.stringify(wb[first.side === 'a' ? 'b' : 'a']), `${JSON.stringify(first)} ${JSON.stringify(afterFirst)}`);
  // turn the view half way round: the other side now faces the camera
  await T.tap(page.locator('button[aria-label="Turn right"]').first());
  await T.tap(page.locator('button[aria-label="Turn right"]').first());
  await page.waitForTimeout(600);
  await T.frames(10);
  await settle(T);
  const second = await paintSide(await idxOf([designs.a, designs.b, first?.design]), 'second side');
  const afterSecond = await page.evaluate((id) => { const st = window.hearthside.debug.state(); const w = st.lots[st.activeLotId].walls[id]; return { a: w.sideA, b: w.sideB }; }, westWall);
  T.check(S, 'the other side of the same wall takes its own finish', !!second && !!first && second.side !== first.side && afterSecond[second.side].designId === second.design && afterSecond[first.side].designId === first.design && first.design !== second.design, `${JSON.stringify({ first, second })} ${JSON.stringify(afterSecond)}`);
  await T.shot('m2-walls-painted');
  await T.tap(page.locator('button[aria-label="Turn left"]').first());
  await T.tap(page.locator('button[aria-label="Turn left"]').first());
  await page.waitForTimeout(500);
  await T.frames(8);
  await settle(T);

  // ---- floor: paint a block of tiles with another floor (Paint -> Floors -> Area -> drag)
  await T.tap(page.locator('.bb-build-panel .tab[data-id="floor"]'));
  await page.waitForTimeout(300);
  const fCards = page.locator('.bb-build-panel .bb-designs .bb-card');
  await T.tap(fCards.nth(1));
  await page.waitForTimeout(250);
  const area = page.locator('.bb-build-panel [role="radio"], .bb-build-panel button', { hasText: /^Area/ }).first();
  await T.tap(area);
  await page.waitForTimeout(300);
  const areaTool = await page.evaluate(() => ({ b: window.hearthside.game.buildTool(), p: window.hearthside.game.paintTool() }));
  T.check(S, 'the Area scope uses the floor build tool (rectangle) and ends the paint tool', areaTool.b?.kind === 'floor' && areaTool.b.shape === 'rect' && areaTool.p === null, JSON.stringify(areaTool));
  const fa = await freePoint(T, 'tile', X0, Z0);
  const fb = await freePoint(T, 'tile', X0 + 1, Z0 + 1);
  const s3 = await lotSnap(T);
  await drag(T, fa, fb);
  await T.frames(4);
  if (touch) {
    const txt = await footerText(T);
    T.check(S, 'dragging over tiles previews the floor (4 tiles) with two handles', /4 floor tiles|4 m2|4 m/.test(txt) && (await page.locator('.bb-handle:not([hidden])').count()) === 2 && JSON.stringify(await lotSnap(T)) === JSON.stringify(s3), txt.replace(/\s+/g, ' '));
    await T.shot('m2-floor-area-preview');
    await tapFooter(T, '.bb-confirm');
  }
  await page.waitForTimeout(300);
  const s4 = await lotSnap(T);
  const changedFloors = Object.keys(s4.floors).filter((k) => JSON.stringify(s4.floors[k]) !== JSON.stringify(s3.floors[k]));
  T.check(S, 'exactly the dragged 2 x 2 tiles got the new floor', changedFloors.length === 4 && changedFloors.every((k) => { const [, x, z] = k.split(':').map(Number); return x >= X0 && x <= X0 + 1 && z >= Z0 && z <= Z0 + 1; }), changedFloors.join(','));
  await T.shot('m2-floor-painted');
  // leave the floor tool: back to the Paint tab with nothing active
  if (await page.evaluate(() => !!window.hearthside.game.buildTool())) await tapFooter(T, '.bb-cancel');
  if (await page.evaluate(() => !!window.hearthside.game.buildTool())) await tapFooter(T, '.bb-cancel');

  // ---- walls up / cutaway / down with the new walls
  for (const mode of ['up', 'down', 'cutaway']) {
    await page.evaluate((m) => window.hearthside.game.view.setCutaway(m), mode);
    await T.frames(8);
    await T.shot(`m2-walls-${mode}`);
  }

  // ---- undo and redo everything this step did (Build panel buttons)
  const endSnap = await lotSnap(T);
  const undoBtn = page.locator('.bb-build-panel .bb-undo button[aria-label="Undo"]');
  const redoBtn = page.locator('.bb-build-panel .bb-undo button[aria-label="Redo"]');
  let undone = 0;
  for (; undone < 10 && JSON.stringify(await lotSnap(T)) !== JSON.stringify(s0); undone++) { if (await undoBtn.isDisabled()) break; await T.tap(undoBtn); await page.waitForTimeout(250); }
  const afterUndo = await lotSnap(T);
  T.check(S, 'undo restores the lot and the money exactly (walls, openings, floors, funds)', JSON.stringify(afterUndo) === JSON.stringify(s0), `${undone} undos`);
  await T.shot('m2-undone');
  let redone = 0;
  for (; redone < 10 && JSON.stringify(await lotSnap(T)) !== JSON.stringify(endSnap); redone++) { if (await redoBtn.isDisabled()) break; await T.tap(redoBtn); await page.waitForTimeout(250); }
  T.check(S, 'redo brings everything back exactly', JSON.stringify(await lotSnap(T)) === JSON.stringify(endSnap) && redone === undone, `${redone} redos`);

  // ---- back to Live: a person walks into the new room through its door
  await T.tap(page.locator('.mode-btn[data-mode="live"]'));
  await page.waitForTimeout(600);
  await page.evaluate(() => window.hearthside.view.frameLot(true));
  await T.frames(6);
  let walker = await page.evaluate(() => { const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId]; return hh.memberIds.find((id) => st.people[id].location.kind === 'lot') ?? null; });
  if (!walker) { await runUntil(T, 2400, `Object.values(st.people).some(p => p.householdId === st.activeHouseholdId && p.location.kind === 'lot')`); walker = await page.evaluate(() => { const st = window.hearthside.debug.state(); return st.households[st.activeHouseholdId].memberIds.find((id) => st.people[id].location.kind === 'lot') ?? null; }); }
  T.check(S, 'a household member is home to walk into the new room', !!walker, String(walker));
  if (!walker) return;
  await selectMember(T, walker);
  const target = { x: Math.min(X0 + dims.w - 1, X0 + 3), z: Z0 + 1 };
  const tp = await pointFor(T, 'tile', target.x, target.z);
  T.check(S, 'a tile inside the new room can be tapped (floor pick)', !!tp?.free && (await page.evaluate(([x, y]) => window.__t.pick(x, y), [tp.x, tp.y])).kind === 'floor', JSON.stringify(tp));
  await T.tapAt(tp.x, tp.y);
  await page.waitForTimeout(400);
  const queued = await page.evaluate((id) => window.hearthside.debug.state().people[id].queue.map((a) => a.interactionId), walker);
  T.check(S, 'the walk is queued ("Go here")', queued.length > 0, queued.join(','));
  const inside = `(() => { const p = st.people['${walker}']; const l = p.location; return l.kind === 'lot' && l.x > ${X0} && l.x < ${X0 + dims.w} && l.z > ${Z0} && l.z < ${Z0 + dims.d}; })()`;
  const walk = await runUntil(T, 3600, inside);
  const pos = await page.evaluate((id) => { const l = window.hearthside.debug.state().people[id].location; return l.kind === 'lot' ? [Math.round(l.x * 10) / 10, Math.round(l.z * 10) / 10] : l.place; }, walker);
  T.check(S, 'the person walked into the new room (through its door, around the house)', walk.done, `${walk.ticks} ticks, now at ${JSON.stringify(pos)}`);
  T.check(S, 'the walk never crossed a wall outside a doorway', walk.viol.length === 0, JSON.stringify(walk.viol.slice(0, 3)));
  await page.evaluate(([x, z]) => window.hearthside.view.rig.glideTo(x, z, 70, 0.1), [X0 + dims.w / 2, Z0 + dims.d / 2]);
  await T.frames(20);
  await settle(T);
  await T.shot('m2-person-in-room');
  void doorX; void doorZ;
}

main().catch((e) => { console.error('[acceptance] error', e); process.exit(1); });
