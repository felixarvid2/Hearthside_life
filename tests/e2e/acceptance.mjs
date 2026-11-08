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
//     door and a window, paint both sides of a new wall and an area of floor, undo and redo, then walk a person in,
//   8 Milestone 6 careers, bills and freelance income,
//   9 Milestone 7 neighbourhood: open the map, travel to the park and wait for the arrival, one venue activity, the away card
//     of the person left at home, go home, open the preview of switching to another household and cancel it,
//   10 Milestone 8 family: aging in Settings, adopt a child from the Family tab, the School tab (schedule), a school day and
//     homework, Age up now at a birthday cake, the family tree and relatives, and the preview of moving out or in,
//   11 Milestone 9 floors (with the exterior part), 12 the exterior part on its own (only with --steps=12),
//   13 Milestone 11.5 object animations, screens and hand props: cook and eat with the progress pill, the fridge door,
//     the hand props and a computer writing screen,
//   14 Milestone 12 seasons and weather: the HUD chip, rain and snow gates, a pool built with the pool tool, a swim out
//     through a ladder, and a trip to the Quayside Baths and back.
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

// Playwright's bundled Chromium is not installed in every sandbox; fall back to a system Chrome when there is one.
function launchOptions(chromium) {
  const opts = {};
  if (!existsSync(chromium.executablePath())) {
    const chrome = [process.env.HEARTHSIDE_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && existsSync(p));
    if (chrome) opts.executablePath = chrome;
  }
  return opts;
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

/**
 * Waits for our own preview server. `owner` is a random token written into the served directory: if another process
 * already holds the port, `vite --strictPort` exits and the port would answer with someone else's app (this happened:
 * a stale server on 5190 answered while the tests screenshotted and passed against it). The token proves the page we
 * are about to drive is the build this run just made.
 */
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
    browser = await chromium.launch({
      ...launchOptions(chromium),
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
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}${m.location()?.url ? ` @ ${m.location().url}` : ''}`); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  // tutorial off: it is not part of the create flow and would cover the HUD; music off.
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('hearthside.settings.v1')) localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, hints: false, musicVolume: 0 })); } catch { /* ignore */ }
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
    async tap(loc, opts = {}) {
      const o = { timeout: 30000, ...opts };
      // The software renderer can hold the page for most of a minute on a first paint (new shaders when Build or a new
      // tool opens). Playwright then gives up waiting for a stable frame although the element has not moved; retry once.
      try { if (vp.touch) await loc.tap(o); else await loc.click(o); } catch (e) {
        log(`tap retry after ${String(e?.message ?? e).split('\n')[0]}`);
        if (vp.touch) await loc.tap({ ...o, timeout: 60000 }); else await loc.click({ ...o, timeout: 60000 });
      }
    },
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
    ['8', 'Milestone 6: career panel, pay a bill, sell freelance work', stepEconomy],
    ['9', 'Milestone 7: neighbourhood map, travel, away card, go home, household switch preview', stepNeighbourhood],
    ['10', 'Milestone 8: adopt a child, school, homework, Age up now, family tree, move-out preview', stepFamily],
    ['11', 'Milestone 9: floors - a room, a staircase, Floor 2 with a room over it, a walk upstairs, undo', stepFloors],
    // Milestone 9 exterior on its own (it also runs at the end of step 11): only with --steps=12 --fast-start
    ['12', 'Milestone 9 exterior: roofs, fences, a gate, terrain paint, a garden bed (standalone)', stepExterior],
    ['13', 'Milestone 11.5: cooking and eating - progress pill, fridge door, hand props, a writing screen', stepAnimations],
    ['14', 'Milestone 12: seasons and weather, a pool built and swum, the Quayside Baths venue', stepWorldM12],
    ['15', 'Milestone 13: a spiral and a length-4 staircase built and climbed, a room moved and undone', stepStairKinds],
  ];
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  await T.frames(3);
  await T.shot('main-menu');
  const only = opt('steps', '').split(',').filter(Boolean);
  for (const [id, title, fn] of steps) {
    if (id === '12' && !only.includes('12')) continue;
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

/**
 * Milestone 12: weather is planned from the world seed, and the acceptance run starts a new random world, so an
 * outdoor step could land on rain (the watering rule then rightly refuses: "It is raining."). Pin today's stored
 * plan to clear just for a step that needs it. This uses the debug console's same-day plan (weather.ts keeps a
 * same-day plan as stored, so it lasts until midnight and later days are planned normally); weather stays on.
 */
async function forceClearWeather(T) {
  return T.page.evaluate(() => window.hearthside.debug.setWeather('clear'));
}

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
    // A full outfit first: switching a full outfit to a top alone leaves no bottom, and Move In is then refused.
    outer: for (const layerName of ['full', 'top', 'bottom']) {
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
    // A top or bottom chosen in place of a full outfit: make sure the other half is worn too.
    const other = patterned?.layerName === 'top' ? 'bottom' : patterned?.layerName === 'bottom' ? 'top' : null;
    if (other) {
      const og = page.locator(`.cr-layer[data-layer="${other}"] [aria-label$=" garments"] .chip`);
      const nO = await og.count();
      let worn = false;
      for (let j = 0; j < nO && !worn; j++) {
        worn = (await og.nth(j).getAttribute('aria-checked')) === 'true' && !/^\W*none/i.test((await og.nth(j).innerText()).trim());
      }
      for (let j = 0; j < nO && !worn; j++) {
        if (/^\W*none/i.test((await og.nth(j).innerText()).trim())) continue;
        await T.tap(og.nth(j));
        await T.frames(3);
        worn = true;
        T.ok(S, `clothing: a ${other} added to go with the patterned ${patterned.layerName}`, (await og.nth(j).innerText()).trim());
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
  // A finger is wider than a pixel: a point 10 px from a panel or a HUD card is free on the exact pixel but is no place to
  // start a drag (the sheet and the floating floor selector sit a few px away and move with the layout).
  const isClear = (x, y, r = 16) => isFree(x, y) && isFree(x - r, y) && isFree(x + r, y) && isFree(x, y - r) && isFree(x, y + r);
  const finish = (s) => { const ok = s.vis && inView(s.x, s.y) && isFree(s.x, s.y); return { ...s, free: ok, clear: ok && isClear(s.x, s.y) }; };
  const h = () => window.hearthside;
  window.__t = {
    person(id, y = 0.9) { const p = h().view.personPosition(id); if (!p) return null; return finish(conv(h().game.view.worldToScreen(p.x, y, p.z))); },
    object(id) {
      const b = h().view.objects.boxOf(id);
      if (!b) return null;
      return finish(conv(h().game.view.worldToScreen((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2)));
    },
    tile(x, z) { return finish(conv(h().game.view.worldToScreen(x + 0.5, 0, z + 0.5))); },
    /** Milestone 9: any world point (x, height above level 0, z), e.g. a vertex or a tile centre of an upper floor. */
    at(x, y, z) { return finish(conv(h().game.view.worldToScreen(x, y, z))); },
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
    /**
     * Milestone 11.5: read-only animation state of a placed object (doors, lids and interiors). The runtime keeps
     * the motions private; this probe only reads them and evaluates the same smoothstep the renderer uses.
     */
    objectAnimState(objectId) {
      const e = h().view.objects?.objects?.get(objectId);
      const a = e?.objectAnim;
      if (!a) return null;
      const now = h().debug.state()?.clock.minutes ?? 0;
      const smooth = (t) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
      const parts = (a.parts ?? []).map((p) => {
        const m = p.motion;
        const openness = m.duration > 0 ? m.from + (m.to - m.from) * smooth((now - m.since) / m.duration) : m.to;
        return { flag: p.flag, active: !!m.active, target: m.to, openness: Math.max(0, Math.min(1, openness)) };
      });
      return { parts, interiorVisible: !!a.interior?.group?.visible };
    },
    /** Milestone 11.5: the hand props currently attached to a person (read-only). */
    handProps(personId) {
      const e = h().view.people?.entries?.get(personId);
      if (!e) return null;
      const out = {};
      for (const [slot, s] of e.props.slots) {
        out[slot] = { kind: s.group ? s.group.name.replace(/^hand-prop-/, '') : null, visible: !!s.group?.visible, portion: s.portion };
      }
      return out;
    },
    /** Milestone 11.5: what a computer/TV screen is showing right now (read-only). */
    screenMode(objectId) {
      const e = h().view.screens?.entries?.get(objectId);
      if (!e) return null;
      return { mode: e.mode, progress: e.use ? e.use.progress : null, title: e.use ? e.use.title : null };
    },
    /** Milestone 11.5: the progress pill above a person's head (read-only). */
    pill(personId) {
      const e = h().view.people?.entries?.get(personId);
      const el = e?.el?.querySelector('.wo-pill');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const fill = el.querySelector('.wo-pill-fill');
      const fr = fill?.getBoundingClientRect();
      return {
        hidden: el.hidden, label: el.getAttribute('aria-label'), value: Number(el.getAttribute('aria-valuenow')),
        done: el.classList.contains('is-done'), cancelled: el.classList.contains('is-cancelled'),
        fillWidth: fr ? Math.round(fr.width * 10) / 10 : 0,
        box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      };
    },
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

/** Waits until the camera insets (the screen area the UI panels cover) stopped changing: a panel grows a moment after a
 * tool is chosen, which re-centres the camera on the free area without moving its target (and so moves the ground under
 * a screen point that was measured earlier). */
async function settleInsets(T, maxMs = 4000) {
  const read = () => T.page.evaluate(() => JSON.stringify(window.hearthside.view.rig.insets));
  // let the panel's queued animation-frame work run (footer render, layout measure), which can predate our reads
  const raf = () => T.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const end = Date.now() + maxMs;
  await raf();
  let prev = await read(), stable = 0;
  while (Date.now() < end) {
    await T.page.waitForTimeout(250);
    await T.frames(2);
    const cur = await read();
    if (cur === prev) { if (++stable >= 2) return true; } else { stable = 0; prev = cur; }
  }
  return false;
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
    const { width: vw, height: vh } = T.page.viewportSize();
    const clampX = (x) => Math.max(20, Math.min(vw - 20, x));
    const clampY = (y) => Math.max(20, Math.min(vh - 20, y));
    const onCanvas = (x, y) => T.page.evaluate(([px, py]) => { const e = document.elementFromPoint(px, py); return !!e && e.id === 'game-canvas'; }, [x, y]);
    // The start of the drag must be on the canvas: a gesture that begins on the HUD (the camera cluster
    // sits over the middle of the free area on a phone) never reaches it and the camera does not move.
    // Prefer the old midpoint, fall back to the free centre itself (sampled as free by freeCentre).
    const candidates = [
      { x: clampX(c.x - dx / 2), y: clampY(c.y - dy / 2) },
      { x: c.x, y: c.y },
      { x: clampX(c.x - dx / 4), y: clampY(c.y - dy / 4) },
    ];
    let from = candidates[0];
    for (const cand of candidates) {
      if (await onCanvas(cand.x, cand.y)) { from = cand; break; }
    }
    await drag(T, from, { x: clampX(from.x + dx), y: clampY(from.y + dy) });
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
  // A guest who walked inside can stand behind a wall from this camera yaw, so no tap point picks them (desktop
  // has the narrowest view of the lot). Turn the camera and look again, as a player would; objects below already
  // do this. Each retry is costly because waiting advances the clock, so rotate before giving up.
  if (kind === 'person') {
    const hitAt = async (q) => q && (await T.page.evaluate(([x, y]) => { const pk = window.__t.pick(x, y); return pk.kind === 'person' ? pk.personId : null; }, [q.x, q.y]));
    let q = await pointFor(T, kind, id, personY);
    let hit = await hitAt(q);
    for (let turn = 0; turn < 3 && hit !== id; turn++) {
      log(`${label}: person pick was ${JSON.stringify(hit)}; turning the camera`);
      await T.page.evaluate(() => window.hearthside.game.view.rotate(1));
      await T.frames(30);
      await T.page.evaluate((pid) => window.hearthside.game.view.focusPerson(pid), id);
      await settle(T);
      q = await pointFor(T, kind, id, personY);
      hit = await hitAt(q);
    }
  }
  let p = await pointFor(T, kind, id, kind === 'person' ? personY : undefined);
  if (!p?.free) { T.bad(S, `${label}: visible to tap`, `point ${JSON.stringify(p)} not on free canvas`); return null; }
  let pick = await T.page.evaluate(([x, y]) => window.__t.pick(x, y), [p.x, p.y]);
  const keyOf = (pk) => (kind === 'person' ? pk.personId : kind === 'object' ? pk.objectId : null);
  if (keyOf(pick) !== id && (kind === 'object' || kind === 'person')) {
    // something else is drawn over the middle of the target (a person in the bed, two people standing together): try nearby points
    const offs = kind === 'object'
      ? [[-16, 0], [16, 0], [0, -14], [0, 14], [-28, -8], [28, -8], [-28, 10], [28, 10], [0, -26], [0, 26], [0, -45], [0, 45], [-45, 0], [45, 0], [0, -65], [0, 65], [-60, -20], [60, -20]]
      : [[0, -12], [0, 10], [-6, 0], [6, 0], [-6, -14], [6, -14], [0, -20], [0, 18], [-10, 6], [10, 6]];
    for (const [dx, dy] of offs) {
      const pk = await T.page.evaluate(([x, y]) => window.__t.pick(x, y), [p.x + dx, p.y + dy]);
      const fr = await T.page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && e.id === 'game-canvas'; }, [p.x + dx, p.y + dy]);
      if (keyOf(pk) === id && fr) { log(`${label}: centre pick was ${JSON.stringify(pick)}; using offset ${dx},${dy}`); p = { ...p, x: p.x + dx, y: p.y + dy }; pick = pk; break; }
    }
  }
  // a wall that stays up (seen from this camera turn) can still hide the whole object: turn the camera and look again
  for (let turn = 0; turn < 3 && kind === 'object' && keyOf(pick) !== id; turn++) {
    log(`${label}: pick was ${JSON.stringify(pick)}; turning the camera`);
    await T.page.evaluate(() => window.hearthside.game.view.rotate(1));
    await T.frames(30);
    const q = await pointFor(T, kind, id, undefined);
    if (!q?.free) continue;
    for (const [dx, dy] of [[0, 0], [-16, 0], [16, 0], [0, -14], [0, 14], [0, -26], [0, 26]]) {
      const pk = await T.page.evaluate(([x, y]) => window.__t.pick(x, y), [q.x + dx, q.y + dy]);
      const fr = await T.page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && e.id === 'game-canvas'; }, [q.x + dx, q.y + dy]);
      if (keyOf(pk) === id && fr) { p = { ...q, x: q.x + dx, y: q.y + dy }; pick = pk; break; }
    }
  }
  T.check(S, `${label}: tap point picks the intended thing`, keyOf(pick) === id, JSON.stringify(pick));
  await T.tapAt(p.x, p.y);
  try { await T.page.waitForSelector('.ctx-menu:not([hidden]) .ctx-item', { timeout: 4000 }); } catch {
    // what the game made of the tap: the selection, what is under the point now, any toast ("Nothing ... can do with that"), open panels
    const why = await T.page.evaluate(([x, y, kind, oid]) => {
      const st = window.hearthside.debug.state();
      const top = document.elementFromPoint(x, y);
      return {
        options: kind === 'object' ? window.hearthside.game.options(window.hearthside.game.selected(), { kind: 'object', objectId: oid }).map((o) => `${o.label}: ${o.enabled ? 'ok' : o.reason}`) : null,
        mode: window.hearthside.game.mode(), selected: window.hearthside.game.selected?.() ?? null, pickNow: window.__t.pick(x, y),
        top: top ? (top.id || top.className || top.tagName) : null, speed: st.clock.speed,
        toasts: [...document.querySelectorAll('.toast, [role="status"]')].map((t) => t.textContent?.trim()).filter(Boolean),
        panels: [...document.querySelectorAll('.panel:not([hidden])')].map((t) => t.className), ctxHidden: document.querySelector('.ctx-menu')?.hidden ?? null,
        people: Object.values(st.people).filter((q) => q.householdId === st.activeHouseholdId).map((q) => ({ id: q.id, loc: q.location.kind === 'lot' ? [q.location.x, q.location.z] : q.location.kind, queue: q.queue.map((a) => `${a.interactionId}/${a.phase}/${a.source}/${a.target?.objectId ?? ''}`) })),
      };
    }, [p.x, p.y, kind, id]).catch((e) => String(e));
    log(`${label}: no menu after the tap at ${Math.round(p.x)},${Math.round(p.y)}:`, JSON.stringify(why));
    await T.shot(`${label.replace(/\W+/g, '-')}-no-menu`).catch(() => undefined);
    T.bad(S, `${label}: context menu opens on tap`, 'no .ctx-menu'); return null;
  }
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
  const wageBefore = await page.evaluate(([m]) => { const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId]; return { funds: hh.funds, wages: hh.ledger.filter((e) => e.kind === 'wage').length, ids: hh.ledger.map((e) => e.id) }; }, [mira]);
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
  // The roommate's shift can end later than the first person's (a 9-5 business day against an 8-4 kitchen shift),
  // so let their own shift finish before checking that it was paid.
  const sageShift = await page.evaluate(([s, d]) => {
    const st = window.hearthside.debug.state();
    const p = st.people[s];
    const lvl = p?.career ? window.hearthside.game.content.careers[p.career.careerId]?.levels.find((l) => l.level === p.career.level) : null;
    const works = !!lvl && lvl.days.includes(d % 7);
    return { works, end: works ? d * 1440 + lvl.end + 5 : null, now: st.clock.minutes };
  }, [sage, day0]);
  if (sageShift.end !== null && sageShift.now < sageShift.end) await runUntil(T, 4 * 180, `st.clock.minutes >= ${sageShift.end}`);
  const wages = await page.evaluate(([m, s, d]) => {
    const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId];
    const count = (id) => hh.ledger.filter((e) => e.kind === 'wage' && e.occurrence === `pay:${id}:${d}`).length;
    // A career only pays for a shift that is scheduled on this weekday (the roommate may not work on day 0).
    const worksToday = (id) => {
      const p = st.people[id]; if (!p.career) return false;
      const def = window.hearthside.game.content.careers[p.career.careerId];
      const lvl = def?.levels.find((l) => l.level === p.career.level);
      return !!lvl && lvl.days.includes(Math.floor(st.clock.minutes / 1440) % 7);
    };
    // A shift pays by time worked, and only people who went to work have a shift record at all; the roommate may
    // simply have stayed home (autonomy), which is not a missing wage.
    const sc = st.people[s].career?.shift;
    return { mira: count(m), sage: count(s), sageWorksToday: worksToday(s), sageWorked: !!sc && (sc.workedMinutes ?? 0) > 0, all: hh.ledger.filter((e) => e.kind === 'wage').map((e) => `${e.amount}:${e.label}:${e.occurrence}`), funds: hh.funds, entries: hh.ledger.map((e) => ({ id: e.id, kind: e.kind, amount: e.amount, label: e.label })) };
  }, [mira, sage, day0, wageBefore.ids]);
  log('wages', JSON.stringify(wages));
  T.check(S, 'exactly one wage ledger entry for the first person\'s shift', wages.mira === 1, JSON.stringify(wages.all));
  T.check(S, 'the roommate (own shift) was paid exactly once if they worked today', wages.sage === 1 || !wages.sageWorksToday || !wages.sageWorked, `sage entries ${wages.sage}; career ${startInfo.sageCareer}; works today ${wages.sageWorksToday}; went to work ${wages.sageWorked}`);
  // Milestone 4 adds expenses during a shift (groceries, repairperson), so funds need not rise overall: check instead that the
  // wage was credited and that the funds change equals exactly the new ledger entries (no money appears or vanishes).
  const seen = new Set(wageBefore.ids);
  const fresh = wages.entries.filter((e) => !seen.has(e.id));
  const freshSum = fresh.reduce((a, e) => a + e.amount, 0);
  const freshWage = fresh.filter((e) => e.kind === 'wage').reduce((a, e) => a + e.amount, 0);
  T.check(S, 'household funds changed by exactly the new ledger entries, including the wage(s)', freshWage > 0 && wages.funds - wageBefore.funds === freshSum,
    `${fmtMoney(wageBefore.funds)} -> ${fmtMoney(wages.funds)}; new entries ${fresh.map((e) => `${e.kind} ${e.amount}`).join(', ')}`);
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

  // ---- sleep on a bed (right after work, before the neighbour arrives); use one the roommate is not lying on
  await dismissMenu(T);
  await selectMember(T, mira);
  const eBefore = (await needsOf(T, mira)).energy;
  const freeBed = await page.evaluate(() => {
    const st = window.hearthside.debug.state(); const lot = st.lots[st.activeLotId];
    const beds = Object.values(lot.objects).filter((b) => /^bed-/.test(b.defId));
    const near = (b, p) => p.location.kind === 'lot' && Math.hypot(p.location.x - (b.x + 1), p.location.z - (b.z + 1)) < 1.6;
    const free = beds.find((b) => !Object.values(st.people).some((p) => near(b, p)));
    return (free ?? beds[0])?.id ?? null;
  }).catch(() => null);
  if (freeBed) startInfo.bed = freeBed;
  log('bed to use', JSON.stringify({ bed: startInfo.bed, freeBed }));
  const bm = await tapAndOpenMenu(T, 'object', startInfo.bed, S, 'bed');
  if (bm) {
    await T.shot('live-bed-menu');
    log('bed menu', JSON.stringify(bm.items));
    T.check(S, 'bed menu offers Sleep', bm.items.some((i) => /Sleep/.test(i.label ?? '') && !i.disabled), bm.items.map((i) => i.label + (i.disabled ? `(x:${i.reason})` : '')).join(' | '));
    await chooseMenu(T, /^Sleep/);
    // The person may already be lying down from an autonomous nap (posture is "lying" anywhere), so "lying" alone can
    // be true before the queued sleep starts. Wait until they are lying at the chosen bed instead.
    const r9 = await runUntil(T, 4 * 150, `(() => { const st = window.hearthside.debug.state(); const p = st.people['${mira}']; if (p.location.kind !== 'lot' || p.location.posture !== 'lying') return false; const b = st.lots[st.activeLotId].objects['${startInfo.bed}']; return !!b && Math.hypot(b.x + 1 - p.location.x, b.z + 1 - p.location.z) < 3.5; })()`);
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
    // Any enabled social counts: before an introduction only "Introduce Yourself" can be enabled, so waiting for another
    // one timed out whenever the two had not met, and the step then tapped a neighbour who was still busy.
    const freeCond = `g.options('${mira}', { kind: 'person', personId: '${nb[0].id}' }).some(o => o.enabled && o.group === 'social')`;
    let free = await runUntil(T, 4 * 120, freeCond);
    if (!free.done) free = await runUntil(T, 4 * 120, `${freeCond} || (() => { const p = st.people['${nb[0].id}']; return !(p.location.kind === 'lot' && p.location.lotId === st.activeLotId); })()`);
    log('neighbour free for social after ticks', free.ticks, free.done);
    // The first visit ends on a clock (a slow screenshot or a long wait can outlast it), which used to leave the step
    // tapping a neighbour who had already gone home. Ask her over again, as a player would, and carry on.
    const stillHere = await page.evaluate((id) => {
      const st = window.hearthside.debug.state(), p = st.people[id];
      return p.location.kind === 'lot' && p.location.lotId === st.activeLotId;
    }, nb[0].id);
    if (!stillHere) {
      // In person needs both on this lot; once she has left, ring her and ask her over (a visit about an hour later).
      const invited = await page.evaluate(([host, guest]) => {
        const g = window.hearthside.game;
        const r = g.inviteHome(host, guest);
        if (r.ok) return { ...r, via: 'in person' };
        const name = window.hearthside.debug.state().people[guest].firstName;
        const opt = g.options(host, { kind: 'person', personId: host }).find((o) => o.section === 'phone' && o.label === `Invite ${name} Over`);
        if (!opt) return { ok: false, reason: `${r.reason} / no phone invite offered` };
        if (!opt.enabled) return { ok: false, reason: `${r.reason} / phone: ${opt.reason}` };
        return { ...g.queue(host, opt), via: 'phone' };
      }, [mira, nb[0].id]);
      const back = await runUntil(T, 4 * 150,`(() => { const p = st.people['${nb[0].id}']; return p.location.kind === 'lot' && p.location.lotId === st.activeLotId; })()`);
      log('neighbour gone home; invited back', JSON.stringify({ invited, back: back.done, ticks: back.ticks }));
      if (back.done) {
        await selectMember(T, mira);
        await T.frames(6);
        await runUntil(T, 4 * 30, freeCond);
      }
    }
    await T.frames(3);
    await dismissMenu(T);
    const nm = await tapAndOpenMenu(T, 'person', nb[0].id, S, 'neighbour');
    if (nm) {
      await T.shot('live-neighbour-menu');
      log('neighbour menu', JSON.stringify(nm.items));
      const social = nm.items.filter((i) => !i.disabled);
      // before an introduction only "Introduce Yourself" is enabled (correct game rule); afterwards several socials are
      T.check(S, 'neighbour menu offers social interactions', social.length >= 2 || (social.length === 1 && /Introduce/i.test(social[0].label ?? '')), nm.items.map((i) => i.label + (i.disabled ? `(x:${i.reason})` : '')).join(' | '));
      const pickLabel = nm.items.find((i) => !i.disabled && /Chat|Talk|Introduce|Greet|Compliment|Joke/i.test(i.label ?? '') && !/Group/i.test(i.label ?? ''))?.label ?? social[0]?.label;
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
    // The screen point for a tile was measured a moment before the tap. A panel transition or a camera glide can move
    // the ground under it in the meantime, which turns the tap into a tap on another tile (the ghost keeps the place it
    // had). Measure the point again right before tapping, and if the ghost still did not land where wanted, let the
    // layout settle and tap once more.
    const freshPoint = () => page.evaluate(([px, pz]) => {
      const p = window.__t.tile(px, pz);
      return p && { ...p, pick: window.__t.pick(p.x, p.y), insets: { ...window.hearthside.view.rig.insets }, ppm: window.hearthside.view.rig.ppm };
    }, [tile.px, tile.pz]);
    const tapTile = async (pt) => {
      await T.tapAt(pt?.free ? pt.x : tile.x, pt?.free ? pt.y : tile.y);
      await T.frames(3);
      return page.evaluate(() => window.hearthside.game.placement());
    };
    let fresh = await freshPoint();
    let pl = await tapTile(fresh);
    if (!(pl && pl.x === tile.px && pl.z === tile.pz && pl.ok)) {
      log(`${label}: ghost stayed at ${JSON.stringify(pl && { x: pl.x, z: pl.z, ok: pl.ok, reasons: pl.reasons })}; settling and tapping again`);
      await settleInsets(T);
      fresh = await freshPoint();
      pl = await tapTile(fresh);
      log(`${label}: retry ${JSON.stringify({ point: fresh && { x: fresh.x, y: fresh.y, free: fresh.free, pick: fresh.pick, insets: fresh.insets }, pl: pl && { x: pl.x, z: pl.z, ok: pl.ok, reasons: pl.reasons } })}`);
    }
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
  await page.waitForSelector('.bb-build-panel:not([hidden])', { timeout: 30000 }).catch(() => undefined);
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
const footerText = (T) => T.page.locator('.bb-build-status').textContent().catch(() => '');
const confirmState = (T) => T.page.evaluate(() => { const b = document.querySelector('.bb-build-footer .bb-confirm'); return b && !b.closest('[hidden]') ? { disabled: b.disabled, label: b.textContent.trim() } : null; });

/** Taps an enabled Confirm / Done style footer button. */
async function tapFooter(T, sel) {
  const b = T.page.locator(`.bb-build-footer ${sel}`).first();
  await T.tap(b);
  await T.page.waitForTimeout(400);
  await T.frames(4);
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

/**
 * Screen points for two ground points, measured under one camera. Measuring each point after recentring the camera
 * on it separately puts both in the middle of the free area, so a drag between them has zero length (this happened in
 * portrait once the room was wider than the uncovered strip). Here the camera glides to their midpoint and, if needed,
 * zooms out until both are clear of UI (a 16 px ring is canvas too, see `isClear`) and at least `minPx` apart, then both
 * are measured under that single camera.
 */
async function framePair(T, kind, a, b, minPx = 24) {
  const off = kind === 'tile' ? 0.5 : 0;
  const cx = (a[0] + b[0]) / 2 + off, cz = (a[1] + b[1]) / 2 + off;
  const measure = () => T.page.evaluate(([k, ax, az, bx, bz]) => [window.__t[k](ax, az), window.__t[k](bx, bz)], [kind, a[0], a[1], b[0], b[1]]);
  const { ppm: start, yaw } = await T.page.evaluate(() => ({ ppm: Math.round(window.hearthside.view.rig.ppm), yaw: window.hearthside.view.rig.yaw }));
  const sin = Math.sin(yaw), cos = Math.cos(yaw), sinPitch = Math.sin((37 * Math.PI) / 180);
  // Panning by (ox, oy) screen px moves the world target by this much (cameraRig.pan). Trying a few offsets is what
  // gets both points out of the HUD cards and the build sheet on a short portrait screen.
  const place = async (ppm, ox, oy) => {
    const mx = ox / ppm, my = oy / (ppm * sinPitch);
    await T.page.evaluate(([x, z, p]) => window.hearthside.view.rig.glideTo(x, z, p, 0), [cx - cos * mx - sin * my, cz + sin * mx - cos * my, ppm]);
    await T.frames(2);
  };
  const offsets = [[0, 0], [0, 30], [-70, 30], [-70, 0], [70, 0], [0, 60], [-70, 60], [0, -70], [-70, -70]];
  const tried = [];
  for (let ppm = start; ; ppm = Math.max(20, ppm - 6)) {
    for (const [ox, oy] of offsets) {
      await place(ppm, ox, oy);
      const [pa, pb] = await measure();
      const ok = !!(pa?.clear && pb?.clear && Math.hypot(pa.x - pb.x, pa.y - pb.y) >= minPx);
      tried.push({ ppm, ox, oy, ok, a: pa && { x: Math.round(pa.x), y: Math.round(pa.y), free: pa.free, clear: pa.clear }, b: pb && { x: Math.round(pb.x), y: Math.round(pb.y), free: pb.free, clear: pb.clear } });
      if (ok) return { a: pa, b: pb, ppm, tried };
    }
    if (ppm <= 20) { const [pa, pb] = await measure(); return { a: pa, b: pb, ppm, tried }; }
  }
}

async function stepHomeEditor(T) {
  const S = '7';
  const { page, vpInfo } = T;
  const touch = vpInfo.touch;
  await page.evaluate(() => { window.hearthside.game.setSpeed(0); document.querySelectorAll('.toast').forEach((t) => t.remove()); });
  if ((await page.evaluate(() => window.hearthside.game.mode())) !== 'live') { await T.tap(page.locator('.mode-btn[data-mode="live"]')); await page.waitForTimeout(400); }
  await T.tap(page.locator('.mode-btn[data-mode="build"]'));
  await page.waitForSelector('.bb-build-panel:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(700);
  await T.frames(30);
  // the new room goes on the north strip of the lot, which the house hides from the default view: look from the north
  await T.tap(page.locator('button[aria-label="Turn right"]').first());
  await T.tap(page.locator('button[aria-label="Turn right"]').first());
  await page.waitForTimeout(500);
  T.check(S, 'Build opens with the tool tabs (Paint, Walls, Room, Stairs, Doors, Windows, Erase, and the exterior tabs)', (await page.locator('.bb-tool-tabs .tab').count()) >= 7, `${await page.locator('.bb-tool-tabs .tab').count()} tabs`);
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
  const corners = await framePair(T, 'vertex', [X0, Z0], [X1, Z1]);
  const pa = corners.a, pc = corners.b;
  T.check(S, 'both corners of the new room are visible, free of UI and apart', !!pa?.free && !!pc?.free && Math.hypot(pa.x - pc.x, pa.y - pc.y) >= 24, JSON.stringify(corners));
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
    await page.evaluate(() => {
      window.__ptr = [];
      const c = document.getElementById('game-canvas');
      for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) c.addEventListener(t, (e) => { const q = window.__ptr; if (q.length < 60) q.push(`${t}:${Math.round(e.clientX)},${Math.round(e.clientY)}`); });
    });
    await drag(T, pa, pc);
    await page.waitForTimeout(300);
    await T.frames(4);
    const live = await footerText(T);
    const cs = await confirmState(T);
    const nHandles = await page.locator('.bb-handle:not([hidden])').count();
    T.check(S, 'a touch drag shows the measurement and cost, four corner handles and an enabled Confirm', /6 x 3/.test(live) && /\$/.test(live) && nHandles === 4 && cs && !cs.disabled, `${live.replace(/\s+/g, ' ')} | handles ${nHandles} | confirm ${JSON.stringify(cs)} | pa ${JSON.stringify([pa.x, pa.y])} pc ${JSON.stringify([pc.x, pc.y])} | events ${JSON.stringify(await page.evaluate(() => (window.__ptr ?? []).slice(0, 14)))}`);
    T.check(S, 'the preview alone builds nothing and takes no money', JSON.stringify(await lotSnap(T)) === JSON.stringify(s0), '');
    await T.shot('m2-room-preview');
    const hbox = await page.locator('.bb-handle[data-handle="c2"]').boundingBox();
    T.check(S, 'the corner handles are large touch targets (>= 44 px)', !!hbox && hbox.width >= 44 && hbox.height >= 44, JSON.stringify(hbox));
    await tapFooter(T, '.bb-cancel');
    T.check(S, 'Cancel clears the preview and the handles but keeps the tool', (await page.locator('.bb-handle:not([hidden])').count()) === 0 && (await page.evaluate(() => window.hearthside.game.buildTool()))?.kind === 'room' && JSON.stringify(await lotSnap(T)) === JSON.stringify(s0), '');
    // draw again, then rotate the device: the preview survives
    const again = await framePair(T, 'vertex', [X0, Z0], [X1, Z1]);
    const pa2 = again.a, pc2 = again.b;
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
    const finalCorners = await framePair(T, 'vertex', [X0, Z0], [X1, Z1]);
    const pa3 = finalCorners.a, pc3 = finalCorners.b;
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

  // ---- a window in the south wall (Windows tab: catalog, then the wall)
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
  // the south wall faces away from the (northern) camera: it stands tall and is easy to hit
  const winWall = `0:h:${X0 + 1}:${Z1}`;
  const wp = await pointFor(T, 'wall', winWall);
  const wpPick = await page.evaluate(([x, y]) => window.__t.pick(x, y), [wp.x, wp.y]);
  T.check(S, 'the wall for the window is under the tap point', wpPick.kind === 'wall' && wpPick.wallId === winWall && wp.free, JSON.stringify({ wp, wpPick }));
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
  T.check(S, 'the window is in that wall and cost its catalog price', !!winOpening && winOpening.wallId === winWall && s1.funds - s2.funds === (await page.evaluate((id) => window.hearthside.game.content.openings[id].price, winId)), JSON.stringify(winOpening && winOpening.wallId));
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
  // the camera may have zoomed out during the wall painting (MIN_PPM): frame the 2 x 2 block itself, not the whole lot
  await frameNorth(T, X0 + 1, Z0 + 1, 4);
  const s3 = await lotSnap(T);
  // measured under a camera and UI layout that stopped moving: a panel height transition re-centres the camera
  // (insets) without moving its target, which moves the ground under a screen point measured a moment earlier
  let floorPair = null, fa = null, fb = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    await settleInsets(T);
    floorPair = await framePair(T, 'tile', [X0, Z0], [X0 + 1, Z0 + 1], 20);
    fa = floorPair.a; fb = floorPair.b;
    const view = () => page.evaluate(() => JSON.stringify({ i: window.hearthside.view.rig.insets, t: [window.hearthside.view.rig.target.x, window.hearthside.view.rig.target.z], p: window.hearthside.view.rig.ppm }));
    const before = await view();
    await page.waitForTimeout(400);
    if (await view() === before) break;
    log('floor area reframe', `attempt ${attempt + 1}: the layout moved, framing again`);
  }
  log('floor area points', JSON.stringify({ fa, fb, ppm: floorPair.ppm, tried: floorPair.tried.slice(-3) }));
  const floorGuide = await page.evaluate(([ax, ay, bx, by]) => {
    const c = document.getElementById('game-canvas').getBoundingClientRect();
    const v = window.hearthside.game.view;
    return { rect: [c.left, c.top, c.width, c.height], a: v.groundPoint(ax - c.left, ay - c.top), b: v.groundPoint(bx - c.left, by - c.top), pickA: window.__t.pick(ax, ay), pickB: window.__t.pick(bx, by), insets: { ...window.hearthside.view.rig.insets } };
  }, [fa.x, fa.y, fb.x, fb.y]);
  log('floor area ground', JSON.stringify(floorGuide));
  T.check(S, 'the two drag points are over the tiles to paint', floorGuide.pickA?.tile?.x === X0 && floorGuide.pickA?.tile?.z === Z0 && floorGuide.pickB?.tile?.x === X0 + 1 && floorGuide.pickB?.tile?.z === Z0 + 1, JSON.stringify({ a: floorGuide.pickA, b: floorGuide.pickB, insets: floorGuide.insets }));
  await drag(T, fa, fb);
  await T.frames(4);
  log('floor area highlight', JSON.stringify(await page.evaluate(() => {
    const h = window.hearthside, r = h.view.rig;
    return { highlight: h.game.buildHighlight()?.highlight?.tiles, ppm: r.ppm, tx: r.target?.x, tz: r.target?.z, insets: r.insets };
  })));
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
  const tpPick = await page.evaluate(([x, y]) => window.__t.pick(x, y), [tp.x, tp.y]);
  T.check(S, 'a tile inside the new room can be tapped (floor pick)', !!tp?.free && tpPick.kind === 'floor', JSON.stringify({ tp, tpPick, mode: await page.evaluate(() => window.hearthside.game.mode()), target }));
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

// ===============================================================================================================
// STEP 8 - Milestone 6: careers, bills and freelance income
// ===============================================================================================================

async function stepEconomy(T) {
  const S = '8';
  const { page } = T;
  const [mira] = T.members;
  await page.evaluate(() => window.hearthside.game.setSpeed(0));
  await closeAnyPanel(T);
  await dismissMenu(T).catch(() => undefined);
  // A quick run with --fast-start has not simulated a tick yet, so no bill has been issued.
  const noBill = await page.evaluate(() => {
    const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId];
    return (st.bills ?? []).every((b) => b.householdId !== hh.id);
  });
  if (noBill) await page.evaluate(() => window.hearthside.debug.step(4));

  // ---- career panel: the employed first person, effort switch, promotion requirements
  await selectMember(T, mira);
  await T.tap(page.locator(`.member[data-person-id="${mira}"]`));
  await page.waitForSelector('.person-panel:not([hidden])', { timeout: 5000 }).catch(() => undefined);
  await T.tap(page.locator('.person-panel .tab[data-id="career"]'));
  await page.waitForTimeout(450);
  const careerBefore = await page.evaluate((id) => {
    const st = window.hearthside.debug.state(); const p = st.people[id];
    return { career: p.career ? p.career.careerId : null, level: p.career?.level ?? 0, effort: p.career?.effort ?? null, name: p.career ? window.hearthside.game.content.careers[p.career.careerId]?.name ?? null : null };
  }, mira);
  if (careerBefore.career) {
    const head = await page.locator('.person-panel .career-head h3').first().innerText();
    const title = await page.locator('.person-panel .career-title').first().innerText();
    T.check(S, 'career panel opens with the job, level and title', head.includes(careerBefore.name) && /Level \d+/.test(title), `${head} / ${title}`);
    T.check(S, 'career panel lists the effort choice and the next promotion requirements', (await page.locator('.person-panel .segmented .seg').count()) === 3 && (await page.locator('.person-panel .req-list .req').count()) > 0, `${await page.locator('.person-panel .req-list .req').count()} requirements`);
  } else {
    const cards = await page.locator('.person-panel .career-choice').count();
    T.check(S, 'career panel offers careers when the person has no job', cards >= 6, `${cards} careers offered`);
    if (cards) {
      await T.tap(page.locator('.person-panel .career-choice button', { hasText: 'Take job' }).first());
      await page.waitForTimeout(350);
    }
  }
  const workHard = page.locator('.person-panel .segmented .seg[data-id="hard"]').first();
  if (await workHard.count()) {
    await T.tap(workHard);
    await page.waitForTimeout(300);
    const effort = await page.evaluate((id) => window.hearthside.debug.state().people[id].career?.effort ?? null, mira);
    T.check(S, 'choosing "Work hard" changes the stored work effort', effort === 'hard', `effort ${effort}`);
  }
  await T.shot('m6-career-panel');
  await T.audit('career panel');

  // ---- bills: funds button -> ledger -> Bills and payments -> Pay
  await closeAnyPanel(T);
  await T.tap(page.locator('.funds-btn'));
  await page.waitForSelector('.ledger-panel:not([hidden])', { timeout: 5000 }).catch(() => undefined);
  const billsBtn = page.locator('.ledger-panel .ledger-actions button', { hasText: 'Bills and payments' }).first();
  T.check(S, 'the ledger links to household bills', await billsBtn.count() === 1, `${await billsBtn.count()} buttons`);
  if (await billsBtn.count()) await T.tap(billsBtn);
  await page.waitForSelector('.bills-panel:not([hidden])', { timeout: 5000 }).catch(() => undefined);
  const billBefore = await page.evaluate(() => {
    const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId];
    const open = (st.bills ?? []).filter((b) => b.householdId === hh.id && b.status !== 'paid').sort((a, b) => b.week - a.week);
    return { id: open[0]?.id ?? null, amount: open[0]?.amount ?? 0, funds: hh.funds, count: (st.bills ?? []).filter((b) => b.householdId === hh.id).length, itemCount: document.querySelectorAll('.bills-panel .bill-item').length };
  });
  log('bill before paying', JSON.stringify(billBefore));
  T.check(S, 'the bills panel lists the household bill', billBefore.id !== null && billBefore.itemCount >= 1, JSON.stringify(billBefore));
  const payBtn = page.locator('.bills-panel .bill-item button', { hasText: 'Pay' }).first();
  T.check(S, 'an unpaid bill offers a Pay button', await payBtn.count() >= 1, `${await payBtn.count()} pay buttons`);
  if (await payBtn.count()) {
    await T.tap(payBtn);
    await page.waitForTimeout(400);
    const after = await page.evaluate((id) => {
      const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId];
      const b = (st.bills ?? []).find((x) => x.id === id);
      return { status: b?.status ?? null, funds: hh.funds, occurrence: b ? `billpay:${b.id}` : null, processed: b ? st.processed[`money:billpay:${b.id}`] !== undefined : false, paidTags: document.querySelectorAll('.bills-panel .bill-item.is-paid').length };
    }, billBefore.id);
    T.check(S, 'paying a bill charges exactly once and marks it paid', after.status === 'paid' && after.processed && after.funds === billBefore.funds - billBefore.amount, `status ${after.status}, funds ${fmtMoney(after.funds)} (was ${fmtMoney(billBefore.funds)}), occurrence ${after.occurrence}`);
    T.check(S, 'the paid bill is shown as paid in the panel', after.paidTags >= 1, `${after.paidTags} paid rows`);
  }
  await T.shot('m6-bills-paid');
  await T.audit('bills panel');

  // ---- freelance: open the computer menu and write/sell an article
  await closeAnyPanel(T);
  // A member who is already busy (an autonomous nap after a long day, or any queued action) would push the
  // freelance job behind that action; pick an idle one, waiting until somebody is free if needed.
  // The member must be idle and the computer must be usable for them: a menu whose entries are all "unavailable" (the computer is
  // in use, or somebody has a use point reserved) folds them away and the tap cannot be tested.
  const idleHomeMember = () => {
    const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId];
    const lot = st.lots[st.activeLotId];
    const computer = Object.values(lot.objects).find((o) => o.defId === 'computer-desktop');
    const usable = (p) => !!computer && window.hearthside.game.options(p.id, { kind: 'object', objectId: computer.id }).some((o) => o.enabled);
    const p = hh.memberIds.map((id) => st.people[id])
      .filter((x) => x.location.kind === 'lot' && x.queue.length === 0 && usable(x))
      .sort((a, b) => (b.needs.energy - a.needs.energy) || (b.needs.fun - a.needs.fun))[0];
    return { person: p?.id ?? null, computer: computer?.id ?? null };
  };
  const whyBusy = () => page.evaluate(() => {
    const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId]; const lot = st.lots[st.activeLotId];
    const computer = Object.values(lot.objects).find((o) => o.defId === 'computer-desktop');
    return hh.memberIds.map((id) => { const p = st.people[id]; return { name: p.firstName, loc: p.location.kind === 'lot' ? [p.location.x, p.location.z] : p.location.kind, queue: p.queue.map((a) => `${a.interactionId}/${a.phase}/${a.source}/${a.target?.objectId ?? ''}`), options: computer && p.location.kind === 'lot' ? window.hearthside.game.options(id, { kind: 'object', objectId: computer.id }).map((o) => `${o.label}: ${o.enabled ? 'ok' : o.reason}`) : null }; });
  });
  let worker = await page.evaluate(idleHomeMember);
  if (!worker.person) {
    log('nobody can use the computer right now:', JSON.stringify(await whyBusy()));
    await runUntil(T, 4 * 600, `(() => { const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId]; const lot = st.lots[st.activeLotId]; const c = Object.values(lot.objects).find((o) => o.defId === 'computer-desktop'); return !!c && hh.memberIds.some((id) => { const p = st.people[id]; return p.location.kind === 'lot' && p.queue.length === 0 && g.options(id, { kind: 'object', objectId: c.id }).some((o) => o.enabled); }); })()`);
    worker = await page.evaluate(idleHomeMember);
    if (!worker.person) log('still nobody after waiting:', JSON.stringify(await whyBusy()));
  }
  T.check(S, 'a household member is home and the computer is available', !!worker.person && !!worker.computer, JSON.stringify(worker));
  if (worker.person && worker.computer) {
    await page.evaluate((id) => {
      window.__m6actions = [];
      window.__m6off?.();
      window.__m6off = window.hearthside.game.events.on('action.finished', (e) => { if (e.personId === id) window.__m6actions.push(e); });
    }, worker.person);
    await selectMember(T, worker.person);
    await page.evaluate((id) => window.hearthside.game.view.focusPerson(id), worker.person);
    await settle(T);
    const salesBefore = await page.evaluate(() => {
      const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId];
      return hh.ledger.filter((l) => l.kind === 'sale').length;
    });
    const menu = await tapAndOpenMenu(T, 'object', worker.computer, S, 'computer');
    if (menu) {
      log('computer menu', JSON.stringify(menu.items.map((i) => i.label + (i.disabled ? `(x:${i.reason})` : ''))));
      T.check(S, 'the computer menu offers freelance writing', menu.items.some((i) => /Write an Article/.test(i.label ?? '') && !i.disabled), menu.items.map((i) => i.label).join(' | '));
      const picked = await chooseMenu(T, /Write an Article/);
      T.check(S, 'picking Write an Article queues the freelance action', picked, String(picked));
      log('freelance queued', JSON.stringify(await page.evaluate((id) => {
        const st = window.hearthside.debug.state(); const p = st.people[id];
        return { queue: p.queue.map((a) => ({ id: a.id, what: a.interactionId, target: a.target })), needs: p.needs, location: p.location };
      }, worker.person)));
      const sale = await runUntil(T, 4 * 240, `st.households[st.activeHouseholdId].ledger.filter((l) => l.kind === 'sale').length > ${salesBefore}`);
      log('freelance after', JSON.stringify(await page.evaluate((id) => {
        const st = window.hearthside.debug.state(); const p = st.people[id]; const hh = st.households[st.activeHouseholdId];
        return {
          queue: p.queue.map((a) => ({ id: a.id, what: a.interactionId, target: a.target })),
          needs: p.needs, location: p.location, anim: p.anim, attrs: p.career ? { career: p.career.careerId, effort: p.career.effort } : null,
          sales: hh.ledger.filter((l) => l.kind === 'sale'),
          processed: Object.keys(st.processed).filter((k) => /freelance|cost:/.test(k)).slice(-8),
          actions: window.__m6actions ?? [],
          feed: st.feed.slice(-10).map((f) => f.text),
        };
      }, worker.person)));
      const after = await page.evaluate(() => {
        const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId];
        const sales = hh.ledger.filter((l) => l.kind === 'sale');
        return { sales: sales.map((l) => ({ amount: l.amount, occurrence: l.occurrence ?? null })), feed: st.feed.slice(-14).map((f) => f.text) };
      });
      T.check(S, 'the finished article was sold and paid once', sale.done && after.sales.length === salesBefore + 1 && after.sales.at(-1).amount > 0 && /^freelance:/.test(after.sales.at(-1).occurrence ?? ''), JSON.stringify(after.sales));
      T.check(S, 'the sale is announced in the feed', after.feed.some((f) => /sold/i.test(f)), after.feed.filter((f) => /sold/i.test(f)).slice(0, 1).join(' | '));
      await T.shot('m6-freelance-sold');
      await T.audit('after freelance sale');
    }
  }
  await closeAnyPanel(T);
}

// ===============================================================================================================
// STEP 9 - Milestone 7: the neighbourhood map, travelling, and the other households
// ===============================================================================================================

async function stepNeighbourhood(T) {
  const S = '9';
  const { page } = T;
  const g = () => page.evaluate(() => {
    const game = window.hearthside.game; const st = window.hearthside.debug.state(); const info = game.neighbourhood();
    return { st: { active: st.activeLotId, hh: st.activeHouseholdId, minutes: st.clock.minutes }, info };
  });
  const closeMap = async () => {
    const x = page.locator('.nbm .modal-header button[aria-label="Close"]').first();
    if (await x.count() && await x.isVisible().catch(() => false)) { await T.tap(x); await page.waitForTimeout(250); }
    await page.waitForSelector('.nbm', { state: 'detached', timeout: 5000 }).catch(() => undefined);
  };
  const openMap = async () => {
    await T.tap(page.locator('.map-btn'));
    await page.waitForSelector('.nbm', { timeout: 8000 });
    await page.waitForTimeout(450);
  };
  const pickLot = async (lotId) => {
    // The map pin is the real thing to tap; the list row is the fallback when a pin cannot be reached.
    const pin = page.locator(`.nbm-pin[data-lot-id="${lotId}"]`);
    try { await T.tap(pin); } catch {
      await T.tap(page.locator('.nbm-toggle .seg[data-id="list"]'));
      await T.tap(page.locator(`.nbm-row[data-lot-id="${lotId}"]`));
    }
    await page.waitForSelector('.nbm-detail h3', { timeout: 5000 });
    await page.waitForTimeout(250);
  };

  await page.evaluate(() => window.hearthside.game.setSpeed(0));
  await closeAnyPanel(T);
  await dismissMenu(T).catch(() => undefined);
  await page.waitForSelector('.map-btn', { timeout: 5000 });

  // Quiet scenario: nobody leaves for a shift in the middle of the trip, and it is daytime so the venues are open.
  const members = await page.evaluate(() => { const st = window.hearthside.debug.state(); return st.households[st.activeHouseholdId].memberIds; });
  await page.evaluate((ids) => { for (const id of ids) window.hearthside.game.quitCareer?.(id); }, members);
  const clock = (await g()).st.minutes % 1440;
  if (clock < 9 * 60 || clock > 16 * 60) await runUntil(T, 4 * ((9 * 60 - clock + 1440) % 1440), 'false');
  await T.frames(3);
  const [first, second] = members;
  await selectMember(T, first);

  // ---- 1. the map lists the neighbourhood
  const hud0 = await page.evaluate(() => { const b = document.querySelector('.map-btn'); const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, vis: r.bottom <= innerHeight && r.right <= innerWidth && r.top >= 0 && r.left >= 0 }; });
  T.check(S, 'the HUD has a Map button of at least 44 px, on screen', hud0.w >= 43.5 && hud0.h >= 43.5 && hud0.vis, JSON.stringify(hud0));
  const bars = await page.evaluate(() => [...document.querySelectorAll('.hud-top, .hud-row2, .hud-bottom')].filter((b) => !b.hidden && b.offsetParent !== null).map((b) => {
    const r = b.getBoundingClientRect();
    const out = [...b.querySelectorAll('button')].filter((c) => c.offsetParent !== null).filter((c) => { const q = c.getBoundingClientRect(); return q.right > r.right + 1 || q.left < r.left - 1; }).map((c) => c.getAttribute('aria-label') || c.className);
    return { bar: b.className.split(' ')[0], out, overflow: b.scrollWidth > b.clientWidth + 1 };
  }));
  T.check(S, 'with the Map button the HUD bars still fit: no button sticks out of its bar', bars.length > 0 && bars.every((b) => b.out.length === 0 && !b.overflow), JSON.stringify(bars));
  await openMap();
  const m0 = await page.evaluate(() => {
    const info = window.hearthside.game.neighbourhood();
    const box = document.querySelector('.nbm').getBoundingClientRect();
    return {
      lots: info.lots.length, venues: info.lots.filter((l) => l.kind === 'venue').length,
      reachable: info.lots.filter((l) => l.kind === 'venue' && l.open && l.travelProblem === null).length,
      usable: info.lots.filter((l) => l.usable).length, pins: document.querySelectorAll('.nbm-pin').length, rows: document.querySelectorAll('.nbm-row').length,
      active: document.querySelectorAll('.nbm-pin.is-active').length, home: document.querySelectorAll('.nbm-pin.is-home').length,
      overflowX: document.querySelector('.nbm').scrollWidth > box.width + 1, onScreen: box.left >= -1 && box.top >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1,
    };
  });
  T.check(S, 'the neighbourhood has at least 12 lots, all drawn on the map and listed', m0.lots >= 12 && m0.pins === m0.lots && m0.rows === m0.lots, JSON.stringify(m0));
  T.check(S, 'at least 3 venues are open and can be travelled to', m0.reachable >= 3 && m0.venues >= 6, `${m0.reachable} reachable of ${m0.venues} venues (${m0.usable} laid out so far)`);
  T.check(S, 'the active lot and the home lot are marked on the map', m0.active === 1 && m0.home === 1, `active ${m0.active}, home ${m0.home}`);
  T.check(S, 'the map fits the screen without sideways overflow', m0.onScreen && !m0.overflowX, JSON.stringify({ onScreen: m0.onScreen, overflowX: m0.overflowX }));
  await T.shot('m7-map');
  await T.audit('neighbourhood map');
  // list view
  await T.tap(page.locator('.nbm-toggle .seg[data-id="list"]'));
  await page.waitForTimeout(300);
  const listVis = await page.evaluate(() => [...document.querySelectorAll('.nbm-row')].filter((e) => e.offsetParent !== null).length);
  T.check(S, 'the list view shows the lots as rows', listVis >= 3, `${listVis} rows visible without scrolling`);
  await T.shot('m7-list');
  await T.tap(page.locator('.nbm-toggle .seg[data-id="map"]'));
  await page.waitForTimeout(250);

  // ---- 2. choose the park: the sheet offers Go here for the selected person
  const park = await page.evaluate(() => window.hearthside.game.neighbourhood().lots.find((l) => l.venueType === 'park'));
  const home = await page.evaluate(() => { const i = window.hearthside.game.neighbourhood(); return i.lots.find((l) => l.id === i.homeLotId); });
  await pickLot(park.id);
  const sheet = await page.evaluate(() => {
    const go = document.querySelector('.nbm-go');
    return {
      title: document.querySelector('.nbm-detail h3')?.textContent ?? '', go: go ? { text: go.textContent.trim(), disabled: go.disabled, h: go.getBoundingClientRect().height } : null,
      ticked: [...document.querySelectorAll('.nbm-chip.is-selected')].map((b) => b.dataset.personId), chips: document.querySelectorAll('.nbm-chip').length,
      selected: window.hearthside.game.selected(),
    };
  });
  T.check(S, 'the sheet of the park shows its name and a usable Go here button', sheet.title === park.name && sheet.go?.text === 'Go here' && sheet.go.disabled === false && sheet.go.h >= 43.5, JSON.stringify(sheet));
  T.check(S, 'the selected person is ticked to go, every household member has a toggle', sheet.ticked.length === 1 && sheet.ticked[0] === sheet.selected && sheet.chips === members.length, JSON.stringify(sheet));
  await T.shot('m7-park-sheet');
  await T.audit('neighbourhood sheet');
  const goBtnInView = await page.evaluate(() => { const b = document.querySelector('.nbm-go').getBoundingClientRect(); const d = document.querySelector('.nbm-detail').getBoundingClientRect(); return b.top >= d.top - 1 && b.bottom <= d.bottom + 1; });
  T.check(S, 'Go here is reachable without scrolling the sheet', goBtnInView, String(goBtnInView));

  // ---- 3. travel: the trip chip appears, the person walks out and arrives
  const t0 = (await g()).st.minutes;
  await T.tap(page.locator('.nbm-go'));
  await page.waitForSelector('.nbm', { state: 'detached', timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  await T.frames(3);
  const chip = await page.evaluate(() => { const c = document.querySelector('.hud-trip'); if (!c || c.hidden) return null; const r = c.getBoundingClientRect(); return { text: c.textContent.trim(), w: r.width, h: r.height, onScreen: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; });
  T.check(S, 'a trip chip with the destination and the arrival time shows in the HUD', !!chip && chip.text.includes(park.name) && /arrives \d{1,2}:\d{2} [AP]M/.test(chip.text) && chip.h >= 43.5 && chip.onScreen, JSON.stringify(chip));
  await T.shot('m7-trip-chip');
  await T.audit('trip chip');
  const trip = await page.evaluate(() => window.hearthside.game.neighbourhood().trip);
  T.check(S, 'the trip is reported with the traveller, the park and an arrival 20 to 40 minutes away', !!trip && trip.lotId === park.id && trip.personIds.length === 1 && trip.personIds[0] === first && trip.arriveAt - t0 >= 19.5 && trip.arriveAt - t0 <= 40.5, JSON.stringify(trip));
  const arrived = await runUntil(T, 4 * 90, `st.activeLotId === '${park.id}'`);
  T.check(S, 'the group arrives and the park becomes the active lot', arrived.done, `${Math.round(arrived.ticks / 4)} game minutes`);
  await T.frames(8);
  await page.waitForTimeout(600);
  const after = await page.evaluate(([a, b]) => {
    const game = window.hearthside.game;
    return { place: game.whereIs(a), other: b ? game.whereIs(b) : null, chipHidden: !document.querySelector('.hud-trip') || document.querySelector('.hud-trip').hidden };
  }, [first, second]);
  T.check(S, 'whereIs says the traveller is at the park; the chip is gone', after.place?.text === `At ${park.name}` && after.chipHidden, JSON.stringify({ place: after.place?.text, chipHidden: after.chipHidden }));
  if (second) T.check(S, 'the household member who stayed behind is at home, off the lot', after.other?.kind === 'home' && after.other.text === 'At home', JSON.stringify(after.other));
  await selectMember(T, first);
  await page.evaluate((id) => window.hearthside.game.view.focusPerson(id), first);
  await settle(T);
  await T.shot('m7-arrived-park');

  // ---- 4. somebody who is not on the lot: the away card
  if (second) {
    await T.tap(page.locator(`.member[data-person-id="${second}"]`));
    await page.waitForSelector('.away-card:not([hidden])', { timeout: 4000 }).catch(() => undefined);
    const card = await page.evaluate(() => { const c = document.querySelector('.away-card'); if (!c || c.hidden) return null; const r = c.getBoundingClientRect(); return { text: c.textContent.trim(), goTo: [...c.querySelectorAll('button')].map((b) => b.textContent.trim()), onScreen: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, small: [...c.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().height < 43.5).length }; });
    T.check(S, 'tapping somebody off the lot shows where they are with Go to and Details', !!card && /At home/.test(card.text) && card.goTo.some((t) => /^Go to /.test(t)) && card.goTo.includes('Details') && card.onScreen && card.small === 0, JSON.stringify(card));
    await T.shot('m7-away-card');
    await T.audit('away card');
    const goTo = page.locator('.away-card button', { hasText: /^Go to / }).first();
    if (await goTo.count()) {
      await T.tap(goTo);
      await page.waitForSelector('.nbm .nbm-detail h3', { timeout: 6000 }).catch(() => undefined);
      const sheetHome = await page.evaluate(() => ({ title: document.querySelector('.nbm-detail h3')?.textContent ?? '', go: document.querySelector('.nbm-go')?.textContent.trim() ?? null }));
      T.check(S, 'Go to opens the map on that place, with Go home as the action', sheetHome.title === home.name && sheetHome.go === 'Go home', JSON.stringify(sheetHome));
      await T.shot('m7-home-sheet');
      await closeMap();
    }
  }

  // ---- 5. a venue activity from the context menu
  await selectMember(T, first);
  const objs = await page.evaluate((id) => {
    const game = window.hearthside.game; const st = window.hearthside.debug.state(); const lot = st.lots[st.activeLotId]; const p = st.people[id];
    if (p.location.kind !== 'lot') return [];
    const res = [];
    for (const o of Object.values(lot.objects)) {
      const opts = game.options(id, { kind: 'object', objectId: o.id }).filter((x) => x.enabled && x.group === 'object');
      if (opts.length) res.push({ id: o.id, d: Math.hypot(o.x - p.location.x, o.z - p.location.z), labels: opts.map((x) => x.label) });
    }
    return res.sort((a, b) => a.d - b.d).slice(0, 4);
  }, first);
  if (objs.length) {
    log('park objects with options', JSON.stringify(objs));
    let done = false;
    for (const o of objs) {
      const menu = await tapAndOpenMenu(T, 'object', o.id, S, 'park object');
      if (!menu) continue;
      const wanted = menu.items.find((i) => !i.disabled);
      if (wanted && await chooseMenu(T, new RegExp(wanted.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))) {
        const q = await page.evaluate((id) => window.hearthside.debug.state().people[id].queue.map((a) => a.interactionId), first);
        T.check(S, `a venue activity is queued from the context menu (${wanted.label})`, q.length > 0, JSON.stringify(q));
        done = true;
        break;
      }
      await dismissMenu(T);
    }
    if (!done) T.bad(S, 'a venue activity can be queued from the context menu', 'no object menu entry could be chosen');
    await runUntil(T, 4 * 20, 'false');
    await T.shot('m7-venue-activity');
  } else {
    T.ok(S, 'a venue activity from the context menu', 'skipped: the park has no object with an enabled option yet');
  }

  // ---- 6. go home with the header button
  await openMap();
  const homeBtn = await page.evaluate(() => { const b = document.querySelector('.nbm-gohome'); if (!b || b.hidden) return null; const r = b.getBoundingClientRect(); return { w: r.width, h: r.height }; });
  T.check(S, 'away from home, the map offers Go home as a 44 px button', !!homeBtn && homeBtn.w >= 43.5 && homeBtn.h >= 43.5, JSON.stringify(homeBtn));
  await T.shot('m7-map-away');
  if (homeBtn) {
    await T.tap(page.locator('.nbm-gohome'));
    await page.waitForSelector('.nbm', { state: 'detached', timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    const hc = await page.evaluate(() => { const c = document.querySelector('.hud-trip'); return c && !c.hidden ? c.textContent.trim() : null; });
    T.check(S, 'the trip chip names home as the destination', !!hc && hc.includes(home.name), String(hc));
    const back = await runUntil(T, 4 * 90, `st.activeLotId === '${home.id}'`);
    T.check(S, 'the household arrives home and the home lot is active again', back.done, `${Math.round(back.ticks / 4)} game minutes`);
    await T.frames(8);
    await page.waitForTimeout(500);
    const placeBack = await page.evaluate((id) => window.hearthside.game.whereIs(id)?.text, first);
    T.check(S, 'whereIs says the traveller is at home', placeBack === 'At home', String(placeBack));
  }

  // ---- 7. another household: the preview of switching, then cancel
  await openMap();
  const npc = await page.evaluate(() => { const i = window.hearthside.game.neighbourhood(); const hh = i.households.find((x) => !x.active && x.switchable); return hh ? { id: hh.id, name: hh.name, lotId: hh.homeLotId } : null; });
  T.check(S, 'the neighbourhood has other households that can be played', !!npc, JSON.stringify(npc));
  if (npc) {
    await pickLot(npc.lotId);
    const play = await page.evaluate(() => { const b = document.querySelector('.nbm-play'); return b ? { text: b.textContent.trim(), disabled: b.disabled, h: b.getBoundingClientRect().height } : null; });
    T.check(S, 'the home of another household offers Play this household', !!play && play.text === 'Play this household' && !play.disabled && play.h >= 43.5, JSON.stringify(play));
    await T.shot('m7-npc-home-sheet');
    if (play && !play.disabled) {
      await T.tap(page.locator('.nbm-play'));
      await page.waitForSelector('.nbm-confirm .nbm-lines li', { timeout: 5000 }).catch(() => undefined);
      const dlg = await page.evaluate(() => { const d = document.querySelector('.nbm-confirm'); if (!d) return null; const r = d.getBoundingClientRect(); return { title: d.querySelector('h2')?.textContent ?? '', lines: d.querySelectorAll('.nbm-lines li').length, onScreen: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1, buttons: [...d.querySelectorAll('.modal-footer button')].map((b) => b.textContent.trim()) }; });
      T.check(S, 'the switch confirmation explains the consequences and offers Cancel', !!dlg && dlg.title.includes(npc.name) && dlg.lines >= 3 && dlg.onScreen && dlg.buttons.includes('Cancel') && dlg.buttons.includes('Play this household'), JSON.stringify(dlg));
      await T.shot('m7-switch-preview');
      await T.tap(page.locator('.nbm-confirm .modal-footer button', { hasText: 'Cancel' }));
      await page.waitForTimeout(300);
      const kept = await g();
      T.check(S, 'cancelling the switch changes nothing', kept.info.activeHouseholdId === kept.st.hh && kept.info.activeHouseholdId !== npc.id && (await page.locator('.nbm-confirm').count()) === 0, `active household ${kept.info.activeHouseholdId}`);
    }
  }
  await closeMap();
  await T.audit('after neighbourhood step');
}

// ===============================================================================================================
// STEP 11 - Milestone 9: floors. Build a room on the ground floor, place a staircase, switch to Floor 2 and build a room with a
// floor over it, walk a household member upstairs (level 1, height rising on the stairs), hide the floor with the selector, build
// and undo on Floor 2. Real taps and drags; window.hearthside only reads state.
// ===============================================================================================================

/** Like framePair, for world points (x, height above level 0, z): both measured under one camera, free of UI and `minPx` apart. */
async function framePairAt(T, a, b, minPx = 24) {
  const cx = (a[0] + b[0]) / 2, cz = (a[2] + b[2]) / 2;
  const measure = () => T.page.evaluate(([ax, ay, az, bx, by, bz]) => [window.__t.at(ax, ay, az), window.__t.at(bx, by, bz)], [...a, ...b]);
  const { ppm: start, yaw } = await T.page.evaluate(() => ({ ppm: Math.round(window.hearthside.view.rig.ppm), yaw: window.hearthside.view.rig.yaw }));
  const sin = Math.sin(yaw), cos = Math.cos(yaw), sinPitch = Math.sin((37 * Math.PI) / 180);
  const place = async (ppm, ox, oy) => {
    const mx = ox / ppm, my = oy / (ppm * sinPitch);
    await T.page.evaluate(([x, z, p]) => window.hearthside.view.rig.glideTo(x, z, p, 0), [cx - cos * mx - sin * my, cz + sin * mx - cos * my, ppm]);
    await T.frames(2);
  };
  const offsets = [[0, 0], [0, 30], [-70, 30], [-70, 0], [70, 0], [0, 60], [-70, 60], [0, -70], [-70, -70], [0, 100], [-70, 100]];
  for (let ppm = start; ; ppm = Math.max(20, ppm - 6)) {
    for (const [ox, oy] of offsets) {
      await place(ppm, ox, oy);
      const [pa, pb] = await measure();
      if (pa?.clear && pb?.clear && Math.hypot(pa.x - pb.x, pa.y - pb.y) >= minPx) return { a: pa, b: pb, ppm };
    }
    if (ppm <= 20) { const [pa, pb] = await measure(); return { a: pa, b: pb, ppm }; }
  }
}

/** Everything the floors step compares: lot structure and objects of every level, money. */
const floorsSnap = (T) => T.page.evaluate(() => {
  const st = window.hearthside.debug.state(); const lot = st.lots[st.activeLotId]; const hh = st.households[st.activeHouseholdId];
  return JSON.parse(JSON.stringify({ walls: lot.walls, openings: lot.openings, floors: lot.floors, objects: lot.objects, levels: lot.levels, funds: hh.funds }));
});
const onLevel = (map, level) => Object.keys(map).filter((k) => (map[k].level ?? Number(k.split(':')[0])) === level);

async function stepFloors(T) {
  const S = '11';
  const { page, vpInfo } = T;
  const touch = vpInfo.touch;
  const STAIR = 'stair-straight-basic';
  // the room (vertices, 8 x 4 m): the first empty stretch of the lot, with a free tile on its west side for the balcony (earlier steps
  // have built on the lot in a full run, so the place is looked up, preferring the north strip)
  const spot = await page.evaluate(() => {
    const st = window.hearthside.debug.state(), lot = st.lots[st.activeLotId];
    const defs = window.hearthside.game.content.objects;
    const busy = new Set();
    for (const k of Object.keys(lot.floors)) { const [l, x, z] = k.split(':').map(Number); if (l === 0) busy.add(`${x},${z}`); }
    for (const o of Object.values(lot.objects)) { const d = defs[o.defId]; if (o.level !== 0) continue; const w = o.rot % 2 ? d.footprint.d : d.footprint.w, dd = o.rot % 2 ? d.footprint.w : d.footprint.d; for (let i = 0; i < w; i++) for (let j = 0; j < dd; j++) busy.add(`${o.x + i},${o.z + j}`); }
    const wall = (dir, x, z) => !!lot.walls[`0:${dir}:${x}:${z}`];
    // a room of rw x 4 tiles at (x0, z0): tiles empty, no wall on any of its edges (the perimeter would share it), a lot tile west of it
    const fits = (x0, z0, rw) => {
      if (x0 < 1 || x0 + rw > lot.width || z0 + 4 > lot.depth) return false;
      for (let z = z0; z < z0 + 4; z++) for (let x = x0; x < x0 + rw; x++) if (busy.has(`${x},${z}`)) return false;
      for (let x = x0; x < x0 + rw; x++) for (let z = z0; z <= z0 + 4; z++) if (wall('h', x, z)) return false;
      for (let z = z0; z < z0 + 4; z++) for (let x = x0; x <= x0 + rw; x++) if (wall('v', x, z)) return false;
      return true;
    };
    // the north half of the lot first: the fence line the exterior part of this step draws crosses the south yard and must not run through a room
    for (const maxZ of [11, lot.depth]) for (const rw of [8, 7, 6]) for (let z = 0; z <= maxZ; z++) for (let x = 1; x + rw <= lot.width; x++) {
      if (fits(x, z, rw)) return { x, z, rw, w: lot.width, d: lot.depth };
    }
    return null;
  });
  T.check(S, 'there is an empty stretch of the lot for the new rooms', !!spot, JSON.stringify(spot));
  if (!spot) return;
  const W = spot.rw, X0 = spot.x, Z0 = spot.z, X1 = X0 + W, Z1 = Z0 + 4;
  const northish = Z1 <= 7;
  const farTile = await page.evaluate(() => {
    const st = window.hearthside.debug.state(), lot = st.lots[st.activeLotId];
    const hot = [];
    for (const k of Object.keys(lot.floors)) { const [l, x, z] = k.split(':').map(Number); if (l === 0) hot.push([x, z]); }
    for (const w of Object.values(lot.walls)) if (w.level === 0) hot.push([w.x, w.z]);
    for (const o of Object.values(lot.objects)) hot.push([o.x, o.z]);
    let best = null, bestD = -1;
    for (let z = 0; z < lot.depth; z++) for (let x = 0; x < lot.width; x++) {
      const d = Math.min(...hot.map(([hx, hz]) => Math.max(Math.abs(hx - x), Math.abs(hz - z))));
      if (d > bestD) { bestD = d; best = { x, z, d }; }
    }
    return best;
  });
  const view = () => page.evaluate(() => ({ level: window.hearthside.game.view.level?.(), levels: window.hearthside.game.view.levels?.(), mode: window.hearthside.game.mode(), y: window.hearthside.view.rig.target.y }));
  const selector = () => page.evaluate(() => {
    const e = document.querySelector('.level-select');
    if (!e || e.hidden || e.closest('[hidden]')) return null;
    const rect = (s) => { const b = e.querySelector(s)?.getBoundingClientRect(); return b ? { w: Math.round(b.width), h: Math.round(b.height) } : null; };
    return { label: e.querySelector('.level-label')?.textContent ?? '', up: !e.querySelector('.level-up').disabled, down: !e.querySelector('.level-down').disabled, upBox: rect('.level-up'), downBox: rect('.level-down') };
  });
  const personVisible = (id) => page.evaluate((i) => !!window.hearthside.view.people?.positionOf(i), id);

  await page.evaluate(() => { window.hearthside.game.setSpeed(0); document.querySelectorAll('.toast').forEach((t) => t.remove()); });
  if ((await page.evaluate(() => window.hearthside.game.mode())) !== 'live') { await T.tap(page.locator('.mode-btn[data-mode="live"]')); await page.waitForTimeout(400); }
  const s0 = await floorsSnap(T);
  T.check(S, 'the home starts on one floor (lot.levels 1, nothing above the ground)', s0.levels === 1 && onLevel(s0.floors, 1).length === 0, `levels ${s0.levels}`);
  await T.tap(page.locator('.mode-btn[data-mode="build"]'));
  await page.waitForSelector('.bb-build-panel:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(700);
  await T.frames(30);
  if (northish) {
    await T.tap(page.locator('button[aria-label="Turn right"]').first());
    await T.tap(page.locator('button[aria-label="Turn right"]').first());
    await page.waitForTimeout(500);
  }

  // ---- the floor selector and the Stairs tab
  const sel0 = await selector();
  T.check(S, 'Build shows the floor selector on Floor 1, with up available and down not', !!sel0 && sel0.label === 'Floor 1' && sel0.up && !sel0.down, JSON.stringify(sel0));
  T.check(S, 'the floor buttons are touch sized (>= 44 px)', !!sel0 && sel0.upBox.w >= 43.5 && sel0.upBox.h >= 43.5 && sel0.downBox.w >= 43.5 && sel0.downBox.h >= 43.5, JSON.stringify(sel0));
  T.check(S, 'the Build tabs include Stairs', (await page.locator('.bb-tool-tabs .tab[data-id="tool-stairs"]').count()) === 1, '');
  await T.audit('floors: build panel with the floor selector');

  // ---- a ground-floor room with a floor (finish chosen under Paint -> Floors, then the Room tool)
  await T.tap(page.locator('.bb-build-panel .tab[data-id="floor"]'));
  await page.waitForTimeout(300);
  const floorCards = page.locator('.bb-build-panel .bb-designs .bb-card');
  await floorCards.first().scrollIntoViewIfNeeded().catch(() => undefined);
  await T.tap(floorCards.first());
  await page.waitForTimeout(300);
  await T.tap(page.locator('.bb-tool-tabs .tab[data-id="tool-room"]'));
  await page.waitForTimeout(500);
  await T.frames(10);
  const roomTool = await page.evaluate(() => window.hearthside.game.buildTool());
  T.check(S, 'the Room tool is ready with a floor', roomTool?.kind === 'room' && !!roomTool.floor, JSON.stringify(roomTool));
  await frameNorth(T, (X0 + X1) / 2, (Z0 + Z1) / 2, X1 - X0 + Z1 - Z0);
  const c0 = await framePair(T, 'vertex', [X0, Z0], [X1, Z1]);
  T.check(S, 'both corners of the ground room are on screen, free of UI', !!c0.a?.free && !!c0.b?.free, JSON.stringify(c0));
  await drag(T, c0.a, c0.b);
  await T.frames(4);
  if (touch) {
    // A synthetic touch can land on a HUD control instead of the canvas (the floating floor selector sits a few px from
    // the sheet), leaving the sheet on its plain hint: drag once more before giving up on the preview.
    if (/^Drag a rectangle on the ground/.test((await footerText(T)).trim())) { await drag(T, c0.a, c0.b); await T.frames(4); }
    await T.shot('m9-room-preview');
    await tapFooter(T, '.bb-confirm');
  }
  await page.waitForTimeout(500);
  await T.frames(6);
  const s1 = await floorsSnap(T);
  T.check(S, 'the ground room has its walls (2 x (width + 4)) and a floor tile for every m2 on level 0', onLevel(s1.walls, 0).length - onLevel(s0.walls, 0).length === 2 * (W + 4) && onLevel(s1.floors, 0).length - onLevel(s0.floors, 0).length === W * 4, `new: ${onLevel(s1.walls, 0).length - onLevel(s0.walls, 0).length} walls, ${onLevel(s1.floors, 0).length - onLevel(s0.floors, 0).length} floors; room at ${X0},${Z0}`);
  T.check(S, 'the room cost money', s0.funds - s1.funds > 0, fmtMoney(s0.funds - s1.funds));
  await T.shot('m9-ground-room');

  // ---- the staircase (Stairs tab, turned a quarter so it runs along the room) placed on the ground floor
  await T.tap(page.locator('.bb-tool-tabs .tab[data-id="tool-stairs"]'));
  await page.waitForTimeout(500);
  await T.frames(6);
  const card = page.locator(`.bb-stair-host .bb-card[data-def-id="${STAIR}"]`);
  const cards = await page.locator('.bb-stair-host .bb-card').count();
  T.check(S, 'the Stairs tab lists the staircases with names and prices', cards >= 1 && /\$/.test(await page.locator('.bb-stair-host .bb-card').first().innerText()), `${cards} cards`);
  if (await card.count()) { await card.scrollIntoViewIfNeeded().catch(() => undefined); await T.tap(card); }
  else await page.evaluate((d) => window.hearthside.game.setBuildTool({ kind: 'stairs', defId: d, rot: 0 }), STAIR);
  await page.waitForTimeout(300);
  await T.tap(page.locator('.bb-build-footer .bb-flip'));
  await page.waitForTimeout(250);
  const stairTool = await page.evaluate(() => window.hearthside.game.buildTool());
  T.check(S, 'the stairs tool is chosen and Turn rotated it a quarter', stairTool?.kind === 'stairs' && stairTool.defId === STAIR && stairTool.rot === 1, JSON.stringify(stairTool));
  const stairDef = await page.evaluate((d) => { const o = window.hearthside.game.content.objects[d]; return { price: o.price, stair: o.stair, footprint: o.footprint }; }, STAIR);
  await frameNorth(T, (X0 + X1) / 2, (Z0 + Z1) / 2, X1 - X0 + Z1 - Z0);
  const stairPt = await pointFor(T, 'tile', X0 + 2, Z0 + 2);
  T.check(S, 'the tile for the stairs is on screen and free of UI', !!stairPt?.free, JSON.stringify(stairPt));
  await T.tapAt(stairPt.x, stairPt.y);
  await page.waitForTimeout(400);
  await T.frames(4);
  if (touch) {
    const txt = await footerText(T);
    T.check(S, 'a tap previews the staircase with its price (nothing built yet)', /Staircase/.test(txt) && /\$/.test(txt) && (await floorsSnap(T)).funds === s1.funds, txt.replace(/\s+/g, ' '));
    await T.shot('m9-stairs-preview');
    await tapFooter(T, '.bb-confirm');
  }
  await page.waitForTimeout(400);
  await T.frames(6);
  const s2 = await floorsSnap(T);
  const stair = Object.values(s2.objects).find((o) => o.defId === STAIR);
  T.check(S, 'the staircase stands in the room on level 0 (turned east, 3 tiles long) and cost its price', !!stair && stair.level === 0 && stair.rot === 1 && stair.z === Z0 + 2 && stair.x === X0 + 1 && s1.funds - s2.funds === stairDef.price, JSON.stringify(stair));
  T.check(S, 'the stairs have a model (procedural mesh, no missing-model placeholder)', await page.waitForFunction((id) => { const o = window.hearthside.view.objects; const b = o.boxOf(id); return !!b && b.max.y - b.min.y > 2.5 && o.hasModel(id); }, stair?.id, { timeout: 8000 }).then(() => true, () => false), '');
  await T.shot('m9-stairs-placed');

  // ---- Floor 2: the selector, the camera and the room over the room
  await T.tap(page.locator('.level-select .level-up'));
  await page.waitForTimeout(700);
  await T.frames(30);
  const v1 = await view();
  const sel1 = await selector();
  T.check(S, 'the selector switches to Floor 2 (view level 1, camera plane at 3 m)', v1.level === 1 && sel1?.label === 'Floor 2' && Math.abs(v1.y - 3) < 0.05, JSON.stringify({ v1, sel1 }));
  T.check(S, 'on Floor 2 the way up is closed at the top (floors in use 1, Floor 3 not offered)', sel1 && sel1.up === false && sel1.down === true, JSON.stringify(sel1));
  await T.shot('m9-floor2-empty');
  await T.tap(page.locator('.bb-tool-tabs .tab[data-id="tool-room"]'));
  await page.waitForTimeout(500);
  await T.frames(6);
  const c1 = await framePairAt(T, [X0, 3, Z0], [X1, 3, Z1]);
  T.check(S, 'both corners of the room on Floor 2 are on screen, free of UI', !!c1.a?.free && !!c1.b?.free, JSON.stringify(c1));
  const upTool = await page.evaluate(() => window.hearthside.game.buildTool());
  T.check(S, 'the Room tool is still chosen on Floor 2', upTool?.kind === 'room', JSON.stringify(upTool));
  await drag(T, c1.a, c1.b);
  await T.frames(4);
  if (touch) {
    const txt = await footerText(T);
    T.check(S, 'the Floor 2 preview names the room and the cost', new RegExp(`${W} x 4`).test(txt) && /\$/.test(txt), txt.replace(/\s+/g, ' '));
    await T.shot('m9-floor2-preview');
    await tapFooter(T, '.bb-confirm');
  }
  await page.waitForTimeout(500);
  await T.frames(8);
  const s3 = await floorsSnap(T);
  const upWalls = onLevel(s3.walls, 1), upFloors = onLevel(s3.floors, 1);
  T.check(S, 'Floor 2 has the room: walls 2 x (width + 4) on level 1 and a floor tile per m2 minus the 3-tile stairwell', upWalls.length === 2 * (W + 4) && upFloors.length === W * 4 - 3, `${upWalls.length} walls, ${upFloors.length} floors`);
  T.check(S, 'the stairwell has no floor above the stairs', [1, 2, 3].every((i) => !s3.floors[`1:${X0 + i}:${Z0 + 2}`]), '');
  T.check(S, 'the lot counts two floors', s3.levels === 2, `levels ${s3.levels}`);
  T.check(S, 'the upper room was paid for', s2.funds - s3.funds > 0, fmtMoney(s2.funds - s3.funds));
  const rooms1 = await page.evaluate(() => window.hearthside.game.rooms(1).filter((r) => !r.outdoor).map((r) => r.area));
  T.check(S, 'the upper walls enclose a room on level 1', rooms1.some((a) => a >= W * 4 - 3), JSON.stringify(rooms1));
  await T.shot('m9-floor2-room');
  await T.audit('floors: Floor 2 built');

  // ---- Live: a household member walks upstairs
  await T.tap(page.locator('.mode-btn[data-mode="live"]'));
  await page.waitForTimeout(600);
  await T.frames(10);
  T.check(S, 'Live keeps the chosen floor and shows the selector (two floors in use)', (await view()).level === 1 && (await selector())?.label === 'Floor 2', JSON.stringify(await selector()));
  let walker = await page.evaluate(() => { const st = window.hearthside.debug.state(); return st.households[st.activeHouseholdId].memberIds.find((id) => st.people[id].location.kind === 'lot') ?? null; });
  if (!walker) { await runUntil(T, 2400, `Object.values(st.people).some(p => p.householdId === st.activeHouseholdId && p.location.kind === 'lot')`); walker = await page.evaluate(() => { const st = window.hearthside.debug.state(); return st.households[st.activeHouseholdId].memberIds.find((id) => st.people[id].location.kind === 'lot') ?? null; }); }
  T.check(S, 'a household member is home to walk upstairs', !!walker, String(walker));
  if (!walker) return;
  await selectMember(T, walker);
  const down0 = await page.evaluate((id) => window.hearthside.debug.state().people[id].location.level, walker);
  const target = { x: X1 - 1, z: Z0 + 2 };
  const tp = await framePairAt(T, [target.x + 0.5, 3, target.z + 0.5], [target.x + 0.5, 3, target.z + 0.5], 0);
  const tpPick = await page.evaluate(([x, y]) => window.__t.pick(x, y), [tp.a.x, tp.a.y]);
  T.check(S, 'a tile of the upper room can be tapped (floor pick on level 1)', !!tp.a?.free && tpPick.kind === 'floor' && tpPick.level === 1 && tpPick.tile.x === target.x && tpPick.tile.z === target.z, JSON.stringify({ tp: tp.a, tpPick }));
  await T.tapAt(tp.a.x, tp.a.y);
  await page.waitForTimeout(400);
  const queued = await page.evaluate((id) => window.hearthside.debug.state().people[id].queue.map((a) => `${a.interactionId}@${a.target?.level}`), walker);
  T.check(S, 'the walk is queued as Go here on level 1', queued.some((q) => q === 'goHere@1'), queued.join(','));
  await page.evaluate(() => { globalThis.__maxRise = 0; globalThis.__levels = new Set(); });
  const arrived = `(() => { const l = st.people['${walker}'].location; globalThis.__maxRise = Math.max(globalThis.__maxRise, l.rise || 0); if (l.kind === 'lot') globalThis.__levels.add(l.level); return l.kind === 'lot' && l.level === 1 && !l.rise && Math.floor(l.x) === ${target.x} && Math.floor(l.z) === ${target.z}; })()`;
  const walk = await runUntil(T, 7200, arrived);
  const loc = await page.evaluate((id) => { const l = window.hearthside.debug.state().people[id].location; return l.kind === 'lot' ? { level: l.level, rise: l.rise ?? 0, x: Math.round(l.x * 10) / 10, z: Math.round(l.z * 10) / 10 } : l; }, walker);
  const climbed = await page.evaluate(() => ({ maxRise: globalThis.__maxRise, levels: [...globalThis.__levels] }));
  T.check(S, 'the member walked upstairs: their level is 1 and they stand in the upper room', walk.done && loc.level === 1 && loc.rise === 0, `${walk.ticks} ticks, from level ${down0}, now ${JSON.stringify(loc)}`);
  T.check(S, 'on the way they climbed the stairs (height rose above 2 m) through levels 0 and 1', climbed.maxRise > 2 && climbed.levels.includes(0) && climbed.levels.includes(1), JSON.stringify(climbed));
  T.check(S, 'the walk never crossed a wall outside a doorway', walk.viol.length === 0, JSON.stringify(walk.viol.slice(0, 3)));
  await page.evaluate(([x, z]) => window.hearthside.view.rig.glideTo(x, z, 70, 0.1), [(X0 + X1) / 2, (Z0 + Z1) / 2]);
  await T.frames(24);
  await settle(T);
  T.check(S, 'on Floor 2 the member is drawn', await personVisible(walker), '');
  await T.shot('m9-member-upstairs');

  // ---- the floor selector hides what is above it, and people up there
  await T.tap(page.locator('.level-select .level-down'));
  await page.waitForTimeout(700);
  await T.frames(30);
  const v0 = await view();
  const upMissing = await page.evaluate(() => { const b = window.hearthside.view.rig; return b.target.y; });
  T.check(S, 'Floor 1 is shown again (camera plane back at 0)', v0.level === 0 && Math.abs(upMissing) < 0.05, JSON.stringify(v0));
  T.check(S, 'a person upstairs is not drawn while Floor 1 is shown', !(await personVisible(walker)), '');
  await T.shot('m9-floor1-view');
  await T.tap(page.locator('.level-select .level-up'));
  await page.waitForTimeout(500);
  await T.frames(20);
  T.check(S, 'and drawn again on Floor 2', await personVisible(walker), '');

  // ---- Build on Floor 2: a balcony tile, a refused one, undo and redo
  await T.tap(page.locator('.mode-btn[data-mode="build"]'));
  await page.waitForSelector('.bb-build-panel:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(700);
  await T.frames(20);
  const s4 = await floorsSnap(T);
  T.check(S, 'Build opens on Floor 2 (the chosen floor is kept)', (await view()).level === 1 && (await selector())?.label === 'Floor 2', JSON.stringify(await selector()));
  await T.tap(page.locator('.bb-tool-tabs .tab[data-id="tool-paint"]'));
  await page.waitForTimeout(300);
  await T.tap(page.locator('.bb-build-panel .tab[data-id="floor"]'));
  await page.waitForTimeout(300);
  const fc = page.locator('.bb-build-panel .bb-designs .bb-card');
  await T.tap(fc.nth(1));
  await page.waitForTimeout(300);
  const paintTool = await page.evaluate(() => window.hearthside.game.paintTool());
  T.check(S, 'a floor finish is chosen for the balcony', paintTool?.kind === 'floor', JSON.stringify(paintTool));
  // out of reach first: a tile in the empty south-west yard has no room or wall below it and nothing within 2 tiles
  const far = { x: farTile.x, z: farTile.z };
  const fp = await framePairAt(T, [far.x + 0.5, 3, far.z + 0.5], [far.x + 0.5, 3, far.z + 0.5], 0);
  const farPick = await page.evaluate(([x, y]) => window.__t.pick(x, y), [fp.a.x, fp.a.y]);
  const farPv = await page.evaluate((pk) => window.hearthside.game.paintPreview(pk), farPick);
  T.check(S, 'a floor tile with nothing under it is refused with a reason (no support, out of balcony reach)', !!farPv && farPv.ok === false && /balcony|wall or a floored room/i.test(farPv.reason ?? ''), JSON.stringify({ farPick, farPv }));
  // a tile right beside one of the room's walls (nothing below it, a wall on its edge): a balcony within reach. The camera sees only some
  // sides over the walls, so the tiles around the room are tried until one can be picked on screen.
  const ring = [];
  for (let i = 0; i < 4; i++) ring.push({ x: X0 - 1, z: Z0 + i }, { x: X1, z: Z0 + i });
  for (let i = 0; i < W; i++) ring.push({ x: X0 + i, z: Z0 - 1 }, { x: X0 + i, z: Z1 });
  let bal = ring[0], bp = null, balPick = null;
  for (const c of ring) {
    if (c.x < 0 || c.z < 0 || c.x >= spot.w || c.z >= spot.d) continue;
    const q = await framePairAt(T, [c.x + 0.5, 3, c.z + 0.5], [c.x + 0.5, 3, c.z + 0.5], 0);
    if (!q.a?.free) continue;
    const pk = await page.evaluate(([x, y]) => window.__t.pick(x, y), [q.a.x, q.a.y]);
    if (pk.kind === 'floor' && pk.level === 1 && pk.tile.x === c.x && pk.tile.z === c.z) { bal = c; bp = q; balPick = pk; break; }
    if (!bp) { bal = c; bp = q; balPick = pk; }
  }
  T.check(S, 'the balcony tile is under the tap point on level 1', !!bp.a?.free && balPick.kind === 'floor' && balPick.level === 1 && balPick.tile.x === bal.x && balPick.tile.z === bal.z, JSON.stringify({ bp: bp.a, balPick }));
  await T.tapAt(bp.a.x, bp.a.y);
  await page.waitForTimeout(400);
  if (touch) { await T.tapAt(bp.a.x, bp.a.y); await page.waitForTimeout(400); }
  await T.frames(6);
  const s5 = await floorsSnap(T);
  T.check(S, 'the balcony floor tile was laid on level 1 and paid for', !!s5.floors[`1:${bal.x}:${bal.z}`] && s4.funds - s5.funds > 0, `${JSON.stringify(s5.floors[`1:${bal.x}:${bal.z}`])} ${fmtMoney(s4.funds - s5.funds)}`);
  await T.shot('m9-balcony');
  const undoBtn = page.locator('.bb-build-panel .bb-undo button[aria-label="Undo"]');
  const redoBtn = page.locator('.bb-build-panel .bb-undo button[aria-label="Redo"]');
  await T.tap(undoBtn);
  await page.waitForTimeout(400);
  await T.frames(6);
  const s6 = await floorsSnap(T);
  T.check(S, 'undo takes the balcony tile away and returns the money exactly', !s6.floors[`1:${bal.x}:${bal.z}`] && s6.funds === s4.funds && JSON.stringify(s6.floors) === JSON.stringify(s4.floors), '');
  await T.shot('m9-balcony-undone');
  await T.tap(redoBtn);
  await page.waitForTimeout(400);
  const s7 = await floorsSnap(T);
  T.check(S, 'redo brings it back at the same price', !!s7.floors[`1:${bal.x}:${bal.z}`] && s7.funds === s5.funds, '');
  await T.tap(undoBtn);
  await page.waitForTimeout(300);

  // ---- the staircase can be taken out again only while nobody depends on it (the member is upstairs)
  await T.tap(page.locator('.bb-tool-tabs .tab[data-id="tool-stairs"]'));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.hearthside.game.setBuildTool({ kind: 'eraseStairs' }));
  const rm = await page.evaluate(([x, z]) => window.hearthside.game.buildPreview({ from: { x, z }, level: 1 }), [X0 + 2.5, Z0 + 2.5]);
  T.check(S, 'removing the staircase is refused while somebody is upstairs (reason shown)', !!rm && rm.ok === false && /stuck|stairs/i.test(rm.reason ?? ''), JSON.stringify(rm && { ok: rm.ok, reason: rm.reason }));
  await page.evaluate(() => window.hearthside.game.setBuildTool(null));
  const endSnap = await floorsSnap(T);
  T.check(S, 'the finished structure is intact: 2 floors, the staircase, both rooms', endSnap.levels === 2 && Object.values(endSnap.objects).some((o) => o.defId === STAIR) && onLevel(endSnap.walls, 1).length === 2 * (W + 4) && onLevel(endSnap.walls, 0).length >= 24, '');

  await T.tap(page.locator('.mode-btn[data-mode="live"]'));
  await page.waitForTimeout(500);
  await T.frames(10);
  await T.shot('m9-end-live');
  await T.audit('floors: end');

  // ---- M9-ext extends this step below: roof, fence and railing on the structure built above ------------------
  await stepExterior(T);
  // ===== END OF M9-CORE FLOORS (stepFloors) =====
}

// ===============================================================================================================
// STEP 10 - Milestone 8: family and life stages (adopt a child, school, homework, Age up now, family tree, moving out)
// ===============================================================================================================

async function stepFamily(T) {
  const S = '10';
  const { page } = T;
  const read = (fn, arg) => page.evaluate(fn, arg);
  await page.evaluate(() => window.hearthside.game.setSpeed(0));
  await closeAnyPanel(T);
  await dismissMenu(T).catch(() => undefined);
  const parent = (await read(() => { const st = window.hearthside.debug.state(); return st.households[st.activeHouseholdId].memberIds[0]; }));
  const openPanelTab = async (personId, tab) => {
    await selectMember(T, personId);
    const panelOpen = await page.evaluate(() => { const p = document.querySelector('.person-panel'); return !!p && !p.hidden && p.offsetParent !== null; });
    const shownFor = await page.evaluate(() => document.querySelector('.person-panel .panel-title, .person-panel h2')?.textContent ?? '');
    const first = await page.evaluate((id) => window.hearthside.debug.state().people[id].firstName, personId);
    if (!panelOpen || !shownFor.includes(first)) {
      await T.tap(page.locator(`.member[data-person-id="${personId}"]`));
      await page.waitForSelector('.person-panel:not([hidden])', { timeout: 5000 }).catch(() => undefined);
    }
    // switch away and back so the tab is rebuilt from the latest state
    const other = tab === 'needs' ? 'queue' : 'needs';
    await T.tap(page.locator(`.person-panel .tab[data-id="${other}"]`));
    await T.tap(page.locator(`.person-panel .tab[data-id="${tab}"]`));
    await page.waitForTimeout(450);
  };
  // The panel is a half-height sheet on a phone: expand it for a screenshot of its whole content, then shrink it again.
  const shotExpanded = async (label, focus = '.person-panel .school-facts, .person-panel .family-stage') => {
    const up = page.locator('.person-panel button[aria-label="Expand panel"]');
    if (await up.count() && await up.first().isVisible().catch(() => false)) { await T.tap(up.first()); await page.waitForTimeout(350); }
    await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), focus);
    await T.shot(label);
    const down = page.locator('.person-panel button[aria-label="Shrink panel"]');
    if (await down.count() && await down.first().isVisible().catch(() => false)) { await T.tap(down.first()); await page.waitForTimeout(300); }
  };

  // ---- 1. settings: aging, custom stage days, the elder end of life switch
  await T.tap(page.locator('.menu-btn'));
  await page.waitForSelector('.game-menu', { timeout: 5000 });
  await T.tap(page.locator('.game-menu button', { hasText: 'Settings' }));
  await page.waitForSelector('.settings-modal', { timeout: 5000 });
  const agingSegs = await page.locator('.settings-modal .segmented[aria-label="Aging"] .seg').allInnerTexts();
  T.check(S, 'Settings offer Aging: Off, Long, Normal and Custom', agingSegs.join('|') === 'Off|Long|Normal|Custom', agingSegs.join('|'));
  await T.tap(page.locator('.settings-modal .segmented[aria-label="Aging"] .seg[data-id="custom"]'));
  await page.waitForTimeout(250);
  const custom = await page.evaluate(() => {
    const box = document.querySelector('.settings-modal .aging-custom');
    return { shown: !!box && !box.hidden && box.offsetParent !== null, sliders: box ? box.querySelectorAll('.slider').length : 0, aging: window.hearthside.debug.state().settings.aging, days: window.hearthside.debug.state().settings.agingDays };
  });
  T.check(S, 'Custom aging shows one days-per-stage control for each of the seven life stages and stores them', custom.shown && custom.sliders === 7 && custom.aging === 'custom' && custom.days?.baby === 3 && custom.days?.elder === 14, JSON.stringify(custom));
  await T.shot('m8-settings-custom-aging');
  await T.audit('aging settings');
  const eol = page.locator('.settings-modal', { hasText: 'Elders pass away peacefully' });
  T.check(S, 'Settings have the elder end-of-life switch', (await eol.count()) > 0, '');
  await T.tap(page.locator('.settings-modal .segmented[aria-label="Aging"] .seg[data-id="normal"]'));
  await page.waitForTimeout(200);
  const aging = await read(() => window.hearthside.debug.state().settings.aging);
  T.check(S, 'choosing Normal sets the world to normal aging', aging === 'normal', aging);
  await T.tap(page.locator('.settings-modal .modal-header button[aria-label="Close"]').first());
  await page.waitForSelector('.settings-modal', { state: 'detached', timeout: 4000 }).catch(() => undefined);

  // ---- 2. adopt a child from the Family tab
  const funds0 = await read(() => { const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId]; if (hh.funds < 400000) hh.funds = 400000; return hh.funds; });
  const count0 = await read(() => { const st = window.hearthside.debug.state(); return st.households[st.activeHouseholdId].memberIds.length; });
  await openPanelTab(parent, 'family');
  const fam0 = await page.evaluate(() => ({
    stage: document.querySelector('.person-panel .family-stage .stage-big')?.textContent ?? '',
    birthday: document.querySelector('.person-panel .family-birthday')?.textContent ?? '',
    tabs: [...document.querySelectorAll('.person-panel .tab')].map((t) => t.textContent.trim()),
    head: document.querySelector('.person-panel .stage-chip')?.textContent ?? '',
  }));
  T.check(S, 'the person panel shows the life stage and the days to the next birthday (aging on)', /Adult|Young adult/.test(fam0.stage) && /Birthday (in \d+ days|tomorrow|today)/.test(fam0.birthday) && fam0.tabs.includes('Family'), JSON.stringify(fam0));
  await shotExpanded('m8-family-tab');
  await T.audit('family tab');
  const adoptBtn = page.locator('.person-panel button', { hasText: 'Adopt a child' });
  T.check(S, 'the Family tab offers "Adopt a child" to a grown household member', (await adoptBtn.count()) === 1 && !(await adoptBtn.first().isDisabled()), '');
  await T.tap(adoptBtn.first());
  await page.waitForSelector('.adopt-dialog', { timeout: 5000 });
  await T.tap(page.locator('.adopt-dialog .segmented[aria-label="Life stage"] .seg[data-id="child"]'));
  await T.tap(page.locator('.adopt-dialog .segmented[aria-label="Sex"] .seg[data-id="girl"]'));
  await page.locator('.adopt-dialog .adopt-name').fill('Nora');
  await page.waitForTimeout(250);
  const dlg = await page.evaluate(() => {
    const d = document.querySelector('.adopt-dialog'); const r = d.getBoundingClientRect();
    return { fee: d.querySelector('.adopt-fee')?.textContent ?? '', note: d.querySelector('.adopt-note')?.textContent ?? '', adoptEnabled: !d.querySelector('.modal-footer .btn-primary')?.disabled, onScreen: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1, overflowX: d.scrollWidth > r.width + 1 };
  });
  T.check(S, 'the adoption dialog shows the fee and who the parents are, fits the screen and can be confirmed', /Fee: \$1,?500/.test(dlg.fee) && /Parents:/.test(dlg.fee) && dlg.adoptEnabled && dlg.onScreen && !dlg.overflowX, JSON.stringify(dlg));
  await T.shot('m8-adopt-dialog');
  await T.audit('adopt dialog');
  await T.tap(page.locator('.adopt-dialog .modal-footer .btn-primary'));
  await page.waitForSelector('.adopt-dialog', { state: 'detached', timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  const adopted = await read((a) => {
    const st = window.hearthside.debug.state(); const hh = st.households[st.activeHouseholdId];
    const kid = hh.memberIds.map((id) => st.people[id]).find((p) => p.firstName === 'Nora');
    return { kid: kid?.id ?? null, stage: kid?.lifeStage ?? null, parents: kid?.parentIds ?? [], funds: hh.funds, members: hh.memberIds.length, school: kid?.school?.schoolId ?? null, fee: st.feed.filter((f) => /joined the family/.test(f.text)).length };
  }, null);
  T.check(S, 'adopting creates a child in the household with the adopter as parent, a school, and charges the fee', !!adopted.kid && adopted.stage === 'child' && adopted.parents[0] === parent && adopted.school === 'elementary' && adopted.members === count0 + 1 && adopted.funds === funds0 - 150000 && adopted.fee === 1, JSON.stringify(adopted));
  const kid = adopted.kid;
  if (!kid) return;
  T.members = await read(() => { const st = window.hearthside.debug.state(); return st.households[st.activeHouseholdId].memberIds; });
  const stripHas = await page.locator(`.member[data-person-id="${kid}"]`).count();
  T.check(S, 'the new family member appears in the household strip', stripHas === 1, String(stripHas));

  // ---- 3. the school schedule in the School tab
  await openPanelTab(kid, 'career');
  const sch = await page.evaluate(() => ({
    tab: document.querySelector('.person-panel .tab[data-id="career"]')?.textContent.trim() ?? '',
    title: document.querySelector('.person-panel .career-head h3')?.textContent ?? '',
    sub: document.querySelector('.person-panel .career-title')?.textContent ?? '',
    facts: document.querySelector('.person-panel .school-facts')?.textContent ?? '',
    stage: document.querySelector('.person-panel .stage-chip')?.textContent ?? '',
  }));
  T.check(S, 'a child\'s Career tab is the School tab with the school, the days and the hours', sch.tab === 'School' && sch.title === 'Willowbrook Elementary' && /Mon to Fri/.test(sch.sub) && /8:00 AM to 2:00 PM/.test(sch.sub) && /Today/.test(sch.facts) && /Homework/.test(sch.facts), JSON.stringify(sch));
  T.check(S, 'the panel header names the child\'s life stage', /^Child/.test(sch.stage), sch.stage);
  await shotExpanded('m8-school-tab');
  await T.audit('school tab');

  // ---- 4. a school day, then homework
  const reached = await runUntil(T, 4 * 60 * 30, `(() => { const k = st.people['${kid}']; return !!k && k.school.attended >= 1 && g.family('${kid}')?.school?.homeworkDue === true; })()`);
  const sd = await read((id) => { const k = window.hearthside.debug.state().people[id]; return { attended: k.school.attended, missed: k.school.missed, loc: k.location.kind, perf: k.school.performance }; }, kid);
  T.check(S, 'the child goes to school and comes home with homework due', reached.done && sd.attended >= 1 && sd.loc === 'lot', `${JSON.stringify(sd)} after ${Math.round(reached.ticks / 4)} game minutes`);
  await openPanelTab(kid, 'career');
  const hwBtn = page.locator('.person-panel button', { hasText: 'Do homework' });
  const hwEnabled = (await hwBtn.count()) === 1 && !(await hwBtn.first().isDisabled());
  T.check(S, 'the School tab offers Do homework when it is due', hwEnabled, '');
  await shotExpanded('m8-homework-due');
  if (hwEnabled) {
    const perf0 = sd.perf;
    await T.tap(hwBtn.first());
    await page.waitForTimeout(300);
    const queued = await read((id) => window.hearthside.debug.state().people[id].queue.map((a) => a.interactionId), kid);
    T.check(S, 'Do homework queues the homework for the child', queued.includes('doHomework'), JSON.stringify(queued));
    const done = await runUntil(T, 4 * 60 * 6, `st.people['${kid}'].school.homeworkDay >= 0`);
    const after = await read((id) => { const k = window.hearthside.debug.state().people[id]; return { hw: k.school.homeworkDay, perf: k.school.performance, mood: k.moodlets.some((m) => m.id === 'homeworkDone') }; }, kid);
    T.check(S, 'the homework gets done once and raises school performance', done.done && after.perf > perf0 && after.mood, JSON.stringify({ perf0, ...after }));
    await openPanelTab(kid, 'career');
    const hwAfter = await page.locator('.person-panel button', { hasText: 'Do homework' }).first().isDisabled();
    T.check(S, 'afterwards Do homework is greyed out until the next school day', hwAfter, String(hwAfter));
  }

  // ---- 5. Age up now at a birthday cake
  const cake = await read(() => {
    const g = window.hearthside.game; const st = window.hearthside.debug.state(); const lot = st.lots[st.activeLotId];
    const r = document.getElementById('game-canvas').getBoundingClientRect();
    const tables = Object.values(lot.objects).filter((o) => { const d = g.content.objects[o.defId]; return d && d.surfaceHeight !== undefined && d.layer === 'floor' && (d.category === 'tables' || d.tags.includes('table')) && d.footprint; });
    g.setMode('buy');
    for (const t of tables) {
      const d = g.content.objects[t.defId];
      if (!g.startPlacement('birthday-cake').ok) continue;
      for (let dx = 0; dx < d.footprint.w; dx++) for (let dz = 0; dz < d.footprint.d; dz++) {
        const p = window.__t.tile(t.x + dx, t.z + dz);
        g.placementAt(p.x - r.left, p.y - r.top);
        const pl = g.placement();
        if (pl && pl.ok) { const c = g.confirmPlacement(); g.setMode('live'); return { ok: c.ok, on: t.defId, reason: c.ok ? null : c.reason }; }
      }
      g.cancelPlacement();
    }
    g.setMode('live');
    return { ok: false, tables: tables.length, reason: 'no table tile accepted the cake' };
  }, null);
  T.check(S, 'a birthday cake can be bought and put on a table', cake.ok, JSON.stringify(cake));
  await page.waitForTimeout(400);
  await T.frames(3);
  await openPanelTab(kid, 'family');
  const ageBtn = page.locator('.person-panel button', { hasText: 'Age up now' });
  const ageEnabled = (await ageBtn.count()) === 1 && !(await ageBtn.first().isDisabled());
  T.check(S, 'with a cake on the lot, Age up now is available in the Family tab', ageEnabled, await page.locator('.person-panel .family-stage').innerText().catch(() => ''));
  await shotExpanded('m8-age-up-ready');
  if (ageEnabled) {
    await T.tap(ageBtn.first());
    await page.waitForTimeout(300);
    const q = await read((id) => window.hearthside.debug.state().people[id].queue.map((a) => a.interactionId), kid);
    T.check(S, 'Age up now sends the child to the cake', q.includes('ageUpNow'), JSON.stringify(q));
    const grew = await runUntil(T, 4 * 150, `st.people['${kid}'].lifeStage !== 'child'`);
    const bd = await read((id) => { const st = window.hearthside.debug.state(); const k = st.people[id]; return { stage: k.lifeStage, school: k.school?.schoolId ?? null, stageDays: k.stageDays, memory: k.memories.some((m) => m.kind === 'birthday'), mood: k.moodlets.some((m) => m.id === 'birthday'), feed: st.feed.some((f) => /Happy birthday, Nora/.test(f.text)) }; }, kid);
    T.check(S, 'the birthday makes the child a teen with the high school, a memory, a moodlet and a notification', grew.done && bd.stage === 'teen' && bd.school === 'high' && bd.stageDays === 0 && bd.memory && bd.mood && bd.feed, JSON.stringify(bd));
    await openPanelTab(kid, 'family');
    const head = await page.evaluate(() => document.querySelector('.person-panel .stage-big')?.textContent ?? '');
    T.check(S, 'the panel shows the new life stage', head === 'Teen', head);
  }

  // ---- 6. the family tree and the relatives
  await openPanelTab(kid, 'family');
  const tree = await page.evaluate(() => {
    const svg = document.querySelector('.person-panel .pp-tree .cr-tree-svg');
    return { svg: !!svg, boxes: svg ? svg.querySelectorAll('.cr-tree-box').length : 0, rows: document.querySelectorAll('.person-panel .relative-row').length, parentRow: [...document.querySelectorAll('.person-panel .relative-row')].some((r) => /Parent/.test(r.textContent)), label: svg?.getAttribute('aria-label') ?? '' };
  });
  T.check(S, 'the Family tab draws the family tree with the parent and the child and lists the relatives', tree.svg && tree.boxes >= 2 && tree.rows >= 1 && tree.parentRow && /parent/i.test(tree.label), JSON.stringify(tree));
  await shotExpanded('m8-family-tree', '.person-panel .pp-tree');
  await T.audit('family tree');

  // ---- 7. move out or in: the preview (nothing is moved)
  await openPanelTab(parent, 'family');
  const splitBtn = page.locator('.person-panel button', { hasText: 'Move out or in' });
  await T.tap(splitBtn.first());
  await page.waitForSelector('.split-dialog', { timeout: 5000 });
  const chips = await page.locator('.split-dialog .split-who .chip').count();
  T.check(S, 'the move-out dialog lists every household member', chips === count0 + 1, String(chips));
  // everybody leaving is refused with the reason
  const allChips = page.locator('.split-dialog .split-who .chip');
  for (let i = 0; i < chips; i++) { if (!(await allChips.nth(i).evaluate((e) => e.classList.contains('is-selected')))) await T.tap(allChips.nth(i)); }
  await page.waitForTimeout(200);
  const all = await page.evaluate(() => ({ note: document.querySelector('.split-dialog .adopt-note')?.textContent ?? '', go: document.querySelector('.split-dialog .modal-footer .btn-primary')?.disabled }));
  T.check(S, 'nobody can leave the household empty: the dialog says why and Move is disabled', /Somebody has to stay/.test(all.note) && all.go === true, JSON.stringify(all));
  // the teen moves in with a neighbouring household: a valid preview with the funds share
  await T.tap(page.locator('.split-dialog .segmented[aria-label="Where to"] .seg[data-id="household"]').first());
  await page.waitForTimeout(200);
  for (let i = 0; i < chips - 1; i++) await T.tap(allChips.nth(i)); // deselect the adults, keep the teen (the last member)
  await page.waitForTimeout(250);
  const prev = await page.evaluate(() => {
    const d = document.querySelector('.split-dialog'); const r = d.getBoundingClientRect(); const go = d.querySelector('.modal-footer .btn-primary');
    return { lines: [...d.querySelectorAll('.split-lines li')].map((l) => l.textContent), note: d.querySelector('.adopt-note')?.textContent ?? '', go: go?.textContent.trim() ?? '', goEnabled: !!go && !go.disabled, onScreen: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1, overflowX: d.scrollWidth > r.width + 1 };
  });
  T.check(S, 'a valid move-in shows what happens and the share of the funds', prev.lines.length >= 2 && /share of the household funds/.test(prev.lines.join(' ')) && prev.goEnabled && /Move in/.test(prev.go) && prev.onScreen && !prev.overflowX, JSON.stringify(prev));
  await T.shot('m8-split-preview');
  await T.audit('split dialog');
  await T.tap(page.locator('.split-dialog .modal-footer button', { hasText: 'Cancel' }));
  await page.waitForSelector('.split-dialog', { state: 'detached', timeout: 4000 }).catch(() => undefined);
  const still = await read(() => { const st = window.hearthside.debug.state(); return st.households[st.activeHouseholdId].memberIds.length; });
  T.check(S, 'cancelling the preview moves nobody', still === count0 + 1, String(still));

  // ---- leave the world as step 9 left it, apart from the new family member: aging off again
  await read(() => { window.hearthside.game.setSimSettings({ aging: 'off' }); });
  await closeAnyPanel(T);
  await T.audit('after family step');
}

// ===============================================================================================================
// Milestone 9 exterior (M9-ext): roofs, fences and a gate, a member walking through the gate, terrain paint, a garden bed that
// grows and is harvested, undo and redo. Runs at the end of step 11 (stepFloors above) on the structure it built.
// ===============================================================================================================

async function stepExterior(T) {
  const S = '11';
  const { page, vpInfo } = T;
  const touch = vpInfo.touch;
  const snap = () => page.evaluate(() => {
    const st = window.hearthside.debug.state();
    const lot = st.lots[st.activeLotId];
    return JSON.parse(JSON.stringify({ funds: st.households[st.activeHouseholdId].funds, roofs: lot.roofs ?? {}, fences: lot.fences ?? {}, terrain: lot.terrain ?? {}, levels: lot.levels }));
  });
  const undoBtn = page.locator('.bb-build-panel .bb-undo button[aria-label="Undo"]');
  const redoBtn = page.locator('.bb-build-panel .bb-undo button[aria-label="Redo"]');
  const tab = (id) => page.locator(`.bb-tool-tabs .tab[data-id="${id}"]`);
  const seg = (section, id) => page.locator(`.bb-tool-section[data-section="${section}"] .seg[data-id="${id}"]`);
  // textContent: the compact landscape footer hides the detail line (cost) with CSS, but the text is there (the tip next to the shape shows the money)
  const status = () => page.locator('.bb-build-footer .bb-build-status').textContent().then((t) => t ?? '').catch(() => '');
  const visibleRoofs = () => page.evaluate(() => window.hearthside.view.exterior.roofs.visibleRoofs().length);
  const sum = (o, k) => Object.values(o).reduce((n, x) => n + (x[k] ?? 0), 0);
  /** Taps a design card of a paged grid (`host` is its container class), paging back to the first page and forward until it is found. */
  const pickCard = async (host, attr, id) => {
    const loc = page.locator(`.${host} .bb-card[data-${attr}="${id}"]`);
    if (await loc.count()) { await T.tap(loc.first()); return true; }
    const prev = page.locator(`.${host} .pager button[aria-label="Previous page"]`), next = page.locator(`.${host} .pager button[aria-label="Next page"]`);
    for (let i = 0; i < 4 && (await prev.count()) && !(await prev.first().isDisabled()); i++) { await T.tap(prev.first()); await page.waitForTimeout(150); }
    for (let i = 0; i < 5; i++) {
      if (await loc.count()) { await T.tap(loc.first()); return true; }
      if (!(await next.count()) || (await next.first().isDisabled())) return false;
      await T.tap(next.first());
      await page.waitForTimeout(200);
    }
    return false;
  };

  // ---- into Build, level 0 (a dev top-up of the funds: the roofs of a whole house cost more than what the earlier steps left)
  await page.evaluate(() => { const st = window.hearthside.debug.state(); st.households[st.activeHouseholdId].funds += 600000; document.querySelectorAll('.toast').forEach((t) => t.remove()); window.hearthside.game.view.setLevel?.(0); });
  if ((await page.evaluate(() => window.hearthside.game.mode())) !== 'build') {
    await T.tap(page.locator('.mode-btn[data-mode="build"]'));
    await page.waitForSelector('.bb-build-panel:not([hidden])', { timeout: 30000 });
  }
  await page.waitForTimeout(600);
  await T.frames(10);
  T.check(S, 'the Build tabs include Roof, Fence and Garden', (await tab('tool-roof').count()) === 1 && (await tab('tool-fence').count()) === 1 && (await tab('tool-garden').count()) === 1, '');
  T.check(S, 'the camera bar has a Roof toggle (on)', (await page.locator('.roof-btn').count()) === 1 && (await page.evaluate(() => window.hearthside.game.view.roofsVisible?.())) === true, '');

  // ---- roofs: style, pitch, finish and colour, then the auto roof
  const r0 = await snap();
  await T.tap(tab('tool-roof'));
  await page.waitForTimeout(500);
  await T.frames(6);
  const nStyle = await page.locator('.bb-ext-styles .bb-card').count();
  const nFinish = await page.locator('.bb-ext-finishes .bb-card').count();
  const nPal = await page.locator('.bb-tool-section[data-section="roof"] .bb-pal').count();
  T.check(S, 'the Roof tab lists styles and finishes with pictures and prices', nStyle >= 6 && nFinish >= 6 && nPal >= 2 && /\$/.test(await page.locator('.bb-ext-styles .bb-card').first().innerText()), `${nStyle} styles, ${nFinish} finishes, ${nPal} colours`);
  T.check(S, 'the roof toggle is told a roof tool is open (roofs show whatever the wall mode)', (await visibleRoofs()) === 0 && (await page.evaluate(() => window.hearthside.view.exterior.roofs.visibleFor(0))) === true, '');
  await pickCard('bb-ext-styles', 'style-id', 'hip');
  await page.waitForTimeout(250);
  await pickCard('bb-ext-finishes', 'finish-id', 'clay-tile');
  await page.waitForTimeout(250);
  await T.tap(page.locator('.bb-tool-section[data-section="roof"] .bb-pal').nth(1));
  await page.waitForTimeout(250);
  await page.evaluate(() => { const i = document.querySelector('.bb-tool-section[data-section="roof"] .bb-range'); if (i) { i.value = '34'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } });
  await page.waitForTimeout(250);
  await T.tap(seg('roof', 'auto'));
  await page.waitForTimeout(500);
  await T.frames(6);
  const roofTool = await page.evaluate(() => window.hearthside.game.buildTool());
  T.check(S, 'the roof tool carries the chosen style, pitch, finish and colour', roofTool?.kind === 'roof' && roofTool.shape === 'auto' && roofTool.spec.styleId === 'hip' && roofTool.spec.pitch === 34 && roofTool.spec.finish.designId === 'clay-tile' && roofTool.spec.finish.paletteId === 'brown', JSON.stringify(roofTool));
  const roofLive = await status();
  const confirm = page.locator('.bb-build-footer .bb-confirm');
  T.check(S, 'the auto roof previews its price and Build is ready', /\$|free/i.test(roofLive) && !(await confirm.isDisabled()), roofLive.replace(/\s+/g, ' '));
  await T.shot('m9ext-roof-preview');
  await T.tap(confirm);
  await page.waitForTimeout(600);
  await T.frames(8);
  const r1 = await snap();
  const roofs1 = Object.values(r1.roofs);
  T.check(S, 'the auto roof built a roof over every room without a floor above it', roofs1.length >= 1 && roofs1.every((r) => r.styleId === 'hip' && r.finish.designId === 'clay-tile' && r.pitch === 34) && roofs1.some((r) => r.level === 0) && (r1.levels < 2 || roofs1.some((r) => r.level === 1)), JSON.stringify(roofs1.map((r) => [r.level, r.x0, r.z0, r.x1, r.z1])));
  T.check(S, 'it was paid for at the roof price (area x style + finish per m2)', r0.funds - r1.funds === sum(r1.roofs, 'purchasePrice') && r0.funds - r1.funds > 0, fmtMoney(r0.funds - r1.funds));
  T.check(S, 'roofs show in the world while the Roof tab is open', (await visibleRoofs()) >= 1, `${await visibleRoofs()} drawn`);
  await T.shot('m9ext-roof-built');
  // undo and redo of the roof
  await T.tap(undoBtn);
  await page.waitForTimeout(400);
  const r2 = await snap();
  T.check(S, 'undo takes the roofs away and gives the money back exactly', Object.keys(r2.roofs).length === 0 && r2.funds === r0.funds, `${Object.keys(r2.roofs).length} roofs, ${fmtMoney(r2.funds - r0.funds)}`);
  await T.tap(redoBtn);
  await page.waitForTimeout(400);
  const r3 = await snap();
  T.check(S, 'redo brings them back at the same price', Object.keys(r3.roofs).length === roofs1.length && r3.funds === r1.funds, '');

  // visibility: Paint tab (walls cut away) hides them, Live with the walls up shows them, the Roof toggle hides them
  await T.tap(tab('tool-paint'));
  await page.waitForTimeout(400);
  T.check(S, 'leaving the Roof tab hides roofs again while the walls are cut away', (await visibleRoofs()) === 0, '');
  // Live mode (the camera buttons are there): walls up shows the roofs, the floor in view and the Roof button decide which
  await T.tap(page.locator('.mode-btn[data-mode="live"]'));
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.hearthside.game; g.view.setCutaway('up'); g.view.setLevel?.(1); });
  await T.frames(6);
  T.check(S, 'with the walls up and the top floor in view every roof is drawn', (await visibleRoofs()) === roofs1.length, `${await visibleRoofs()} of ${roofs1.length}`);
  await page.evaluate(() => window.hearthside.game.view.setLevel?.(0));
  await T.frames(3);
  T.check(S, 'looking at the ground floor hides the roofs of the floor above', (await visibleRoofs()) === roofs1.filter((r) => r.level === 0).length, `${await visibleRoofs()}`);
  await page.evaluate(() => window.hearthside.game.view.setLevel?.(1));
  await T.frames(3);
  await T.shot('m9ext-roof-walls-up');
  await T.tap(page.locator('.roof-btn').first());
  await T.frames(3);
  T.check(S, 'the Roof toggle hides the roofs', (await visibleRoofs()) === 0 && (await page.evaluate(() => window.hearthside.game.view.roofsVisible?.())) === false, '');
  await T.tap(page.locator('.roof-btn').first());
  await T.frames(3);
  T.check(S, 'and shows them again', (await visibleRoofs()) === roofs1.length, '');
  await page.evaluate(() => { const g = window.hearthside.game; g.view.setCutaway('cutaway'); g.view.setLevel?.(0); });
  await T.tap(page.locator('.mode-btn[data-mode="build"]'));
  await page.waitForSelector('.bb-build-panel:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(500);
  await T.frames(6);
  // ---- fences: a run, a gate, and the rest of the line (a fence line across the yard with the gate as the only way through)
  const pick = await page.evaluate(() => {
    const st = window.hearthside.debug.state();
    const lot = st.lots[st.activeLotId];
    const defs = window.hearthside.game.content.objects;
    const blocked = new Set();
    for (const o of Object.values(lot.objects)) {
      const d = defs[o.defId];
      if (!d || o.level !== 0) continue;
      const w = o.rot % 2 ? d.footprint.d : d.footprint.w, h = o.rot % 2 ? d.footprint.w : d.footprint.d;
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) blocked.add(`${o.x + i},${o.z + j}`);
    }
    // a row z where the line (the h edge row z, every x) crosses no wall, and a gate column x whose tiles two steps each way are free
    const lineClear = (z) => { for (let x = 0; x < lot.width; x++) if (lot.walls[`0:h:${x}:${z}`]) return false; return true; };
    const colFree = (x, z) => { for (let dz = -2; dz <= 2; dz++) if (blocked.has(`${x},${z + dz}`)) return false; for (let dz = -2; dz <= 1; dz++) if (lot.walls[`0:h:${x}:${z + dz}`]) return false; return true; };
    // never divide a room: no walled floor tile (a floor with a wall on one of its sides; bare path tiles are fine) in the tile rows
    // the line runs between or the rows of its two walking tiles. A full run builds rooms in the north strip or the yard.
    const wallRows = new Set();
    for (const k of Object.keys(lot.floors)) {
      const [lv, x, z] = k.split(':').map(Number);
      if (lv !== 0) continue;
      if (lot.walls[`0:h:${x}:${z}`] || lot.walls[`0:h:${x}:${z + 1}`] || lot.walls[`0:v:${x}:${z}`] || lot.walls[`0:v:${x + 1}:${z}`]) wallRows.add(z);
    }
    const roomFree = (z) => { for (let r = z - 1; r <= z + 2; r++) if (wallRows.has(r)) return false; return true; };
    for (const z of [19, 20, 21, 18, 17, 16]) {
      if (z + 2 >= lot.depth || !lineClear(z) || !roomFree(z)) continue;
      for (const x of [12, 11, 13, 10, 14, 9, 15, 8, 16]) if (colFree(x, z)) return { z, x };
    }
    return { z: -1, x: -1 };
  });
  const row = pick.z, GX = pick.x;
  T.check(S, 'there is a clear yard row and gate column for a fence line', row > 0 && GX >= 0, JSON.stringify(pick));
  const Z0 = row;
  const f0 = await snap();
  await T.tap(tab('tool-fence'));
  await page.waitForTimeout(500);
  await T.frames(6);
  const nFence = await page.locator('.bb-ext-fences .bb-card').count();
  T.check(S, 'the Fence tab lists fence designs with pictures, prices and colours', nFence >= 6 && /\$/.test(await page.locator('.bb-ext-fences .bb-card').first().innerText()) && (await page.locator('.bb-tool-section[data-section="fence"] .bb-pal').count()) >= 3, `${nFence} cards`);
  await pickCard('bb-ext-fences', 'def-id', 'picket-white');
  await page.waitForTimeout(250);
  await T.tap(page.locator('.bb-tool-section[data-section="fence"] .bb-pal').nth(2));
  await page.waitForTimeout(250);
  const fenceTool = await page.evaluate(() => window.hearthside.game.buildTool());
  T.check(S, 'the fence tool carries the design and colour', fenceTool?.kind === 'fence' && fenceTool.defId === 'picket-white' && fenceTool.variant === 2, JSON.stringify(fenceTool));
  const fp = await framePair(T, 'vertex', [4, Z0], [10, Z0]);
  T.check(S, 'both ends of the fence run are on screen, free of UI', !!fp.a?.free && !!fp.b?.free, JSON.stringify({ a: fp.a, b: fp.b }));
  await drag(T, fp.a, fp.b);
  await T.frames(4);
  if (touch) { T.check(S, 'a touch drag previews the length and price and waits for Confirm', /6 m/.test(await status()) && /\$/.test(await status()), (await status()).replace(/\s+/g, ' ')); await T.shot('m9ext-fence-preview'); await tapFooter(T, '.bb-confirm'); }
  await page.waitForTimeout(500);
  await T.frames(6);
  const f1 = await snap();
  const picket = await page.evaluate(() => window.hearthside.game.content.exterior.fences['picket-white'].price);
  T.check(S, 'six metres of picket fence were built in the chosen colour', Object.keys(f1.fences).length === 6 && Object.values(f1.fences).every((f) => f.defId === 'picket-white' && f.variant === 2), JSON.stringify(Object.keys(f1.fences)));
  T.check(S, 'they cost the design price per metre', f0.funds - f1.funds === 6 * picket, fmtMoney(f0.funds - f1.funds));
  // a gate: the Gate tool, a gate design, tap the edge
  await T.tap(seg('fence', 'gate'));
  await page.waitForTimeout(400);
  await pickCard('bb-ext-fences', 'def-id', 'gate-picket');
  await page.waitForTimeout(250);
  const gp = await framePairAt(T, [GX + 0.5, 0, Z0], [GX + 2.5, 0, Z0]);
  await T.tapAt(gp.a.x, gp.a.y);
  await page.waitForTimeout(350);
  if (touch) { await T.shot('m9ext-gate-preview'); await tapFooter(T, '.bb-confirm'); }
  await page.waitForTimeout(400);
  await T.frames(6);
  const f2 = await snap();
  T.check(S, 'the gate stands on the tapped edge', f2.fences[`0:h:${GX}:${Z0}`]?.defId === 'gate-picket', JSON.stringify(f2.fences[`0:h:${GX}:${Z0}`]));
  // the rest of the line (through the game API, as one run): the gate stays, so the line has exactly one way through
  const line = await page.evaluate((z) => {
    const g = window.hearthside.game;
    g.setBuildTool({ kind: 'fence', defId: 'picket-white', variant: 2 });
    const pv = g.buildPreview({ from: { x: 0, z }, to: { x: 24, z }, level: 0 });
    const ap = g.buildApply({ from: { x: 0, z }, to: { x: 24, z }, level: 0 });
    g.setBuildTool(null);
    return { pv: pv && { ok: pv.ok, reason: pv.reason }, ok: ap.ok, reason: ap.ok ? '' : ap.reason };
  }, Z0);
  await T.frames(4);
  const f3 = await snap();
  T.check(S, 'a line across the whole lot is accepted with the gate in it, and keeps the gate', line.ok && Object.keys(f3.fences).length === 24 && f3.fences[`0:h:${GX}:${Z0}`].defId === 'gate-picket', JSON.stringify(line));
  await T.shot('m9ext-fence-line');
  // take a fence away (refund) and put it back by undo
  await page.evaluate(() => window.hearthside.game.setBuildTool({ kind: 'eraseFence' }));
  const erase = await page.evaluate((z) => { const g = window.hearthside.game; const pv = g.buildPreview({ from: { x: 3.5, z }, level: 0 }); return { ok: pv.ok, cost: pv.cost, label: pv.label }; }, Z0);
  T.check(S, 'removing a fence previews a refund', erase.ok && erase.cost < 0, JSON.stringify(erase));
  await page.evaluate(() => window.hearthside.game.setBuildTool(null));

  // ---- a member walks through the gate (the line has no other way)
  await T.tap(page.locator('.mode-btn[data-mode="live"]'));
  await page.waitForTimeout(500);
  await T.frames(6);
  const walk = await page.evaluate(async ([z, gx]) => {
    const h = window.hearthside, g = h.game;
    const st = () => h.debug.state();
    const hh = st().households[st().activeHouseholdId];
    const id = hh.memberIds.find((m) => { const l = st().people[m].location; return l.kind === 'lot' && l.level === 0; }) ?? hh.memberIds[0];
    const goUntil = (tx, tz, maxTicks, track) => {
      const r = g.goTo(id, { x: tx, z: tz, level: 0 });
      if (!r.ok) return { ok: false, reason: r.reason, crossings: [] };
      const crossings = [];
      let prev = null;
      for (let i = 0; i < maxTicks; i++) {
        h.debug.step(1);
        const l = st().people[id].location;
        if (l.kind !== 'lot') continue;
        const t = { x: Math.floor(l.x), z: Math.floor(l.z) };
        if (track && prev && prev.z !== t.z && Math.min(prev.z, t.z) === z - 1 + 0) crossings.push(t.x);
        prev = t;
        if (t.x === tx && t.z === tz) return { ok: true, crossings, ticks: i };
      }
      return { ok: false, reason: 'did not arrive', crossings, at: prev };
    };
    const north = goUntil(gx, z - 2, 4 * 400, false);
    const south = north.ok ? goUntil(gx, z + 2, 4 * 400, true) : north;
    return { id, north, south };
  }, [Z0, GX]);
  T.check(S, 'a member walks to the north side of the line', walk.north.ok, JSON.stringify(walk.north));
  T.check(S, 'then through the gate (and only the gate) to the south side', walk.south.ok && walk.south.crossings.length >= 1 && walk.south.crossings.every((x) => x === GX), JSON.stringify(walk.south));
  await T.shot('m9ext-through-the-gate');

  // ---- terrain paint: one tile, then an area; undo and redo
  await T.tap(page.locator('.mode-btn[data-mode="build"]'));
  await page.waitForTimeout(300);
  if ((await page.evaluate(() => window.hearthside.game.mode())) !== 'build') { await page.evaluate(() => window.hearthside.game.setMode('build')); await page.waitForTimeout(500); }
  await T.tap(tab('tool-garden'));
  await page.waitForTimeout(500);
  await T.frames(6);
  const nPaint = await page.locator('.bb-ext-paints .bb-card').count();
  T.check(S, 'the Garden tab lists ground paints with pictures and prices', nPaint >= 6 && /\$/.test(await page.locator('.bb-ext-paints .bb-card').first().innerText()), `${nPaint} paints`);
  await pickCard('bb-ext-paints', 'paint-id', 'gravel');
  await page.waitForTimeout(250);
  const t0 = await snap();
  const tp = await framePair(T, 'tile', [3, Z0 + 1], [5, Z0 + 2]);
  await T.tapAt(tp.a.x, tp.a.y);
  await page.waitForTimeout(350);
  if (touch) await tapFooter(T, '.bb-confirm');
  await page.waitForTimeout(300);
  const t1 = await snap();
  const gravel = await page.evaluate(() => window.hearthside.game.content.exterior.terrain.gravel.price);
  T.check(S, 'one tile of gravel was painted and paid for', t1.terrain[`0:3:${Z0 + 1}`] === 'gravel' && Object.keys(t1.terrain).length === 1 && t0.funds - t1.funds === gravel, `${JSON.stringify(t1.terrain)} ${fmtMoney(t0.funds - t1.funds)}`);
  await T.tap(seg('garden', 'area'));
  await page.waitForTimeout(300);
  await pickCard('bb-ext-paints', 'paint-id', 'mulch');
  await page.waitForTimeout(250);
  const tq = await framePair(T, 'tile', [3, Z0 + 1], [5, Z0 + 2]);
  await drag(T, tq.a, tq.b);
  await T.frames(4);
  if (touch) { T.check(S, 'a touch drag previews the painted area', /6 m2|6 tiles|Paint 6/.test(await status()), (await status()).replace(/\s+/g, ' ')); await tapFooter(T, '.bb-confirm'); }
  await page.waitForTimeout(400);
  const t2 = await snap();
  T.check(S, 'a drag painted a 3 x 2 area of mulch', Object.values(t2.terrain).filter((v) => v === 'mulch').length === 6, JSON.stringify(t2.terrain));
  await T.shot('m9ext-terrain');
  await T.tap(undoBtn);
  await page.waitForTimeout(300);
  const t3 = await snap();
  T.check(S, 'undo takes the area away and restores the money exactly', Object.keys(t3.terrain).length === 1 && t3.funds === t1.funds, '');
  await T.tap(redoBtn);
  await page.waitForTimeout(300);
  const t4 = await snap();
  T.check(S, 'redo paints it again at the same price', Object.values(t4.terrain).filter((v) => v === 'mulch').length === 6 && t4.funds === t2.funds, '');

  // ---- a garden bed: buy it, plant, water, skip days in the simulation, harvest
  await page.evaluate(() => { const g = window.hearthside.game; g.setBuildTool(null); g.setMode('buy'); });
  await page.waitForTimeout(400);
  const bed = await page.evaluate(([z]) => {
    const g = window.hearthside.game, st = window.hearthside.debug.state();
    const r = document.getElementById('game-canvas').getBoundingClientRect();
    if (!g.startPlacement('garden-vegpatch').ok) return { ok: false, reason: 'cannot start' };
    for (const [x, zz] of [[8, z + 1], [14, z + 1], [17, z + 1], [1, z + 1]]) {
      const p = window.__t.tile(x, zz);
      g.placementAt(p.x - r.left, p.y - r.top);
      const pl = g.placement();
      if (pl && pl.ok) { const c = g.confirmPlacement(); if (c.ok) return { ok: true, x: pl.x, z: pl.z }; }
    }
    g.cancelPlacement();
    return { ok: false, reason: 'no valid tile' };
  }, [Z0]);
  T.check(S, 'a vegetable patch can be bought and placed in the yard', bed.ok, JSON.stringify(bed));
  await page.evaluate(() => window.hearthside.game.setMode('live'));
  await page.waitForTimeout(500);
  await T.frames(6);
  const garden = await page.evaluate(() => {
    const st = window.hearthside.debug.state(), lot = st.lots[st.activeLotId];
    const o = Object.values(lot.objects).find((x) => x.defId === 'garden-vegpatch');
    const hh = st.households[st.activeHouseholdId];
    return o ? { id: o.id, at: [o.x, o.z], member: hh.memberIds.find((m) => st.people[m].location.kind === 'lot' && st.people[m].location.level === 0) ?? hh.memberIds.find((m) => st.people[m].location.kind === 'lot') } : null;
  });
  if (bed.ok && garden) {
    // Watering (and other bed work) is weather-gated: keep this seed-independent for the run.
    const clear = await forceClearWeather(T);
    T.check(S, 'the garden step can rely on clear weather', clear === true, String(clear));
    const act = async (interactionId) => {
      const r = await page.evaluate(([m, o, i]) => {
        const g = window.hearthside.game;
        const opt = g.options(m, { kind: 'object', objectId: o }).find((x) => x.interactionId === i);
        if (!opt) return { ok: false, reason: 'not offered' };
        if (!opt.enabled) return { ok: false, reason: opt.reason ?? 'disabled' };
        return g.queue(m, opt);
      }, [garden.member, garden.id, interactionId]);
      if (!r.ok) return r;
      const done = await runUntil(T, 4 * 600, `!st.people['${garden.member}'].queue.some((a) => a.interactionId === '${interactionId}')`);
      return { ok: done.done, reason: done.done ? '' : 'timed out' };
    };
    const bedState = () => page.evaluate((id) => { const st = window.hearthside.debug.state(); const o = st.lots[st.activeLotId].objects[id]; const hh = st.households[st.activeHouseholdId]; return { garden: o.garden ? { ...o.garden } : null, funds: hh.funds, ledger: hh.ledger.map((l) => `${l.label}:${l.amount}`) }; }, garden.id);
    const g0 = await bedState();
    const plant = await act('gardenPlant');
    const g1 = await bedState();
    T.check(S, 'Plant Seeds puts a crop in the bed for the seed price ($3)', plant.ok && !!g1.garden?.crop && g1.ledger.includes('Plant Seeds:-300'), JSON.stringify({ plant, crop: g1.garden?.crop, bed: garden.at, who: await page.evaluate((m) => { const p = window.hearthside.debug.state().people[m]; return { loc: p.location, act: p.action?.interactionId ?? null, q: p.queue.map((a) => a.interactionId) }; }, garden.member) }));
    const nope = await page.evaluate(([m, o]) => { const opt = window.hearthside.game.options(m, { kind: 'object', objectId: o }).find((x) => x.interactionId === 'gardenHarvest'); return opt ? { enabled: opt.enabled, reason: opt.reason } : null; }, [garden.member, garden.id]);
    T.check(S, 'Harvest is greyed out with a reason while the crop grows', !!nope && nope.enabled === false && /ripe|planted/i.test(nope.reason ?? ''), JSON.stringify(nope));
    const watered = await act('gardenWater');
    T.check(S, 'Water the Bed fills the bed', watered.ok && (await bedState()).garden.water === 1, JSON.stringify(watered));
    await page.evaluate((id) => window.hearthside.game.view.reveal({ kind: 'object', objectId: id }), garden.id);
    await T.frames(30);
    await T.shot('m9ext-garden-planted');
    // skip game days in the simulation (watering by hand each day to keep the growth at full speed)
    const skipped = await page.evaluate((id) => {
      const h = window.hearthside;
      let days = 0;
      for (; days < 12; days++) {
        const st = h.debug.state();
        const o = st.lots[st.activeLotId].objects[id];
        if (o.garden.growth >= o.garden.need) break;
        st.clock.minutes = (Math.floor(st.clock.minutes / 1440) + 1) * 1440 - 0.25;
        h.debug.step(2);
        o.garden.water = 1;
      }
      const o = h.debug.state().lots[h.debug.state().activeLotId].objects[id];
      return { days, growth: o.garden.growth, need: o.garden.need };
    }, garden.id);
    T.check(S, 'after some game days the crop is ripe', skipped.growth >= skipped.need && skipped.days >= 3 && skipped.days <= 9, JSON.stringify(skipped));
    await T.frames(6);
    await page.evaluate((id) => window.hearthside.game.view.reveal({ kind: 'object', objectId: id }), garden.id);
    await T.frames(30);
    await T.shot('m9ext-garden-ripe');
    const before = await bedState();
    const harvested = await act('gardenHarvest');
    const after = await bedState();
    T.check(S, 'Harvest picks the crop and pays once (sold at the market)', harvested.ok && after.garden.harvests === 1 && after.ledger.filter((l) => /from the garden/.test(l)).length === 1, JSON.stringify({ harvested, harvests: after.garden.harvests, ledger: after.ledger.filter((l) => /garden/.test(l)) }));
    const feed = await page.evaluate(() => window.hearthside.debug.state().feed.some((f) => /picked/.test(f.text)));
    T.check(S, 'the feed says what was picked', feed, '');
  }

  // ---- back to Live with everything built
  await T.shot('m9ext-end-live');
  await T.audit('exterior: end');
}

// ===============================================================================================================
// Milestone 11.5: cook a meal and eat it (progress pill, fridge door, hand props), then write at a computer
// (the writing screen). The visuals are driven by the running action, so this step samples them while it runs.
// ===============================================================================================================

async function stepAnimations(T) {
  const S = '13';
  const { page } = T;
  // Render and let the real-time (10 Hz) pill sampler take a fresh sample, then wait out the fill's 150 ms
  // width transition so the measured width is the sampled one.
  const render = async () => { await T.frames(2); await page.waitForTimeout(150); await T.frames(2); await page.waitForTimeout(180); await T.frames(1); };
  const probe = (member, fridge, computer) => page.evaluate(([m, f, c]) => {
    const st = window.hearthside.debug.state();
    const p = st.people[m];
    const a = p?.queue?.[0] ?? null;
    return {
      pill: window.__t.pill(m), fridge: window.__t.objectAnimState(f), props: window.__t.handProps(m),
      screen: window.__t.screenMode(c),
      act: a ? { id: a.interactionId, stage: a.data?.stage ?? null, phase: a.phase, elapsed: a.elapsed, duration: a.duration, anim: p.anim?.id ?? null } : null,
    };
  }, [member, fridge, computer]);
  const clearQueue = async (member) => {
    await page.evaluate((m) => {
      const g = window.hearthside.game; const p = window.hearthside.debug.state().people[m];
      for (const a of [...p.queue]) g.cancel(m, a.id);
    }, member);
    await runUntil(T, 24, `st.people['${member}'].queue.length === 0`);
  };

  await page.evaluate(() => { window.hearthside.game.setSpeed(0); document.querySelectorAll('.toast').forEach((t) => t.remove()); });
  await closeAnyPanel(T);
  await dismissMenu(T).catch(() => undefined);
  if ((await page.evaluate(() => window.hearthside.game.mode())) !== 'live') {
    await T.tap(page.locator('.mode-btn[data-mode="live"]'));
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => { const g = window.hearthside.game; g.view.setLevel?.(0); g.view.setCutaway?.('cutaway'); });
  await T.frames(8);

  const info = await page.evaluate(() => {
    const st = window.hearthside.debug.state(), lot = st.lots[st.activeLotId], hh = st.households[st.activeHouseholdId];
    const g = window.hearthside.game;
    const find = (re) => Object.values(lot.objects).find((o) => re.test(o.defId));
    const fridge = find(/fridge/), computer = find(/computer/), stove = find(/stove/);
    // Step 11 builds a floor and can leave the household upstairs. The cook behaviour only looks for a stove on the
    // actor's own level, so prefer a member who is already on the ground floor (where the kitchen is).
    const onLot = hh.memberIds.filter((id) => st.people[id].location.kind === 'lot');
    const canCook = (id) => !!fridge && g.options(id, { kind: 'object', objectId: fridge.id }).some((o) => o.interactionId === 'cookMeal' && o.enabled);
    const member = onLot.find((id) => st.people[id].location.level === 0 && canCook(id))
      ?? onLot.find((id) => st.people[id].location.level === 0) ?? onLot.find(canCook) ?? onLot[0] ?? null;
    return {
      fridge: fridge?.id ?? null, fridgeDef: fridge?.defId ?? null, stove: stove?.id ?? null,
      computer: computer?.id ?? null, computerDef: computer?.defId ?? null, computerLevel: computer?.level ?? 0,
      member, memberLevel: member ? st.people[member].location.level : null,
      onLot: onLot.map((id) => ({ id, level: st.people[id].location.level, cook: canCook(id) })),
    };
  });
  T.check(S, 'the home has a fridge, a stove and a computer', !!info.fridge && !!info.stove && !!info.computer, JSON.stringify(info));
  let member = info.member;
  if (!member) {
    await runUntil(T, 4 * 240, 'Object.values(st.people).some((p) => p.householdId === st.activeHouseholdId && p.location.kind === \'lot\')');
    member = await page.evaluate(() => {
      const st = window.hearthside.debug.state(), hh = st.households[st.activeHouseholdId];
      const onLot = hh.memberIds.filter((id) => st.people[id].location.kind === 'lot');
      return onLot.find((id) => st.people[id].location.level === 0) ?? onLot[0] ?? null;
    });
  }
  T.check(S, 'a household member is on the lot to cook', !!member, String(member));
  if (!member || !info.fridge) return;
  await selectMember(T, member);
  await page.evaluate((id) => window.hearthside.game.view.focusPerson(id), member);
  await T.frames(24);
  await settle(T);
  await clearQueue(member);
  // If step 11 left the chosen member on another floor, walk them to the kitchen floor first, as a player would:
  // cookMeal's check only accepts a stove on the actor's own level.
  const startLevel = await page.evaluate((m) => window.hearthside.debug.state().people[m].location.level, member);
  if (startLevel !== 0) {
    const walk = await page.evaluate(([m, f]) => {
      const h = window.hearthside; const st = h.debug.state(); const o = st.lots[st.activeLotId].objects[f];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const t = { x: o.x + dx, z: o.z + dz, level: 0 };
        const r = h.game.goTo(m, t);
        if (r.ok) return { ok: true, tile: t };
      }
      return { ok: false };
    }, [member, info.fridge]);
    const down = await runUntil(T, 4 * 240, `st.people['${member}'].location.level === 0`);
    // Autonomy can queue something (e.g. Sleep) in the tick the walk ends; clear it so the cook is next.
    await clearQueue(member);
    log('step 13 walked down', JSON.stringify({ from: startLevel, walk, down: down.done }));
  }

  // ---- Cook a Meal: the fridge reach-in (stage 0), the stove (stage 1), the plate (stage 2), then eatMeal
  const ready = await runUntil(T, 4 * 120, `g.options('${member}', { kind: 'object', objectId: '${info.fridge}' }).some((o) => o.interactionId === 'cookMeal' && o.enabled)`);
  // The wait above ticks the sim while the member is idle, so autonomy can queue Sleep (likely late in the day): clear
  // it so the player's Cook a Meal is the next action.
  await clearQueue(member);
  const queued = await page.evaluate(([m, f]) => {
    const g = window.hearthside.game;
    const opt = g.options(m, { kind: 'object', objectId: f }).find((o) => o.interactionId === 'cookMeal');
    if (!opt) return { ok: false, reason: 'not offered' };
    if (!opt.enabled) return { ok: false, reason: opt.reason ?? 'disabled' };
    const r = g.queue(m, opt);
    return { ok: r.ok, reason: r.ok ? '' : r.reason };
  }, [member, info.fridge]);
  T.check(S, 'Cook a Meal is queued', queued.ok, JSON.stringify({ queued, ready: ready.done }));
  if (!queued.ok) return;

  // stage 0, late enough for the ingredients prop: the pill, the anchor above the head and the open fridge door
  const stage0 = await runUntil(T, 4 * 90, `(() => { const a = st.people['${member}'].queue[0]; return !!a && a.interactionId === 'cookMeal' && a.data.stage === 0 && a.phase === 'perform' && a.elapsed >= 1.4; })()`);
  await page.evaluate((id) => window.hearthside.game.view.focusPerson(id), member);
  await T.frames(20);
  await render(); // the open tween is seeded from the game clock on this first frame of the stage
  await runUntil(T, 1, 'false'); // at speed 0 frames do not advance the clock: one tick (0.25 game minutes) lets the door move
  await render();
  const A = await probe(member, info.fridge, info.computer);
  const head = await page.evaluate((m) => window.__t.person(m, 1.2), member);
  const doorA = A.fridge?.parts?.find((p) => p.flag === 'door');
  T.check(S, 'the progress pill appears above the head while cooking', !!A.pill && !A.pill.hidden && /Cook a Meal/i.test(A.pill.label ?? '') && A.pill.value >= 1 && A.pill.value < 100, JSON.stringify({ pill: A.pill, stage0: stage0.done, act: A.act }));
  T.check(S, 'the pill is anchored over the cook, not in a corner', !!head && !!A.pill && Math.abs((A.pill.box.x + A.pill.box.w / 2) - head.x) <= 90 && A.pill.box.y + A.pill.box.h <= head.y + 8, JSON.stringify({ pill: A.pill?.box, head }));
  T.check(S, 'the fridge door is open while the reach-in plays', !!doorA && doorA.target === 1 && doorA.openness > 0.5, JSON.stringify(A.fridge));
  T.check(S, 'a hand prop is carried from the fridge', Object.values(A.props ?? {}).some((s) => s.visible && s.kind === 'ingredients'), JSON.stringify(A.props));
  await T.shot('m115-cooking-pill');

  // stage 1: the fridge closes again and the spatula comes out; the fill keeps growing
  await runUntil(T, 4 * 600, `(() => { const a = st.people['${member}'].queue[0]; return !!a && a.interactionId === 'cookMeal' && a.data.stage === 1 && a.phase === 'perform'; })()`);
  await render(); // the first frame after the stage change starts the closing tween
  await runUntil(T, 3, 'false'); // 0.75 game minutes: longer than the 0.4-minute close
  await render();
  const B0 = await probe(member, info.fridge, info.computer);
  const doorB = B0.fridge?.parts?.find((p) => p.flag === 'door');
  T.check(S, 'the fridge door is closed again while the stove cooks', !!doorB && doorB.target === 0 && doorB.openness <= 0.05, JSON.stringify({ fridge: B0.fridge, act: B0.act }));
  T.check(S, 'the hand prop changes to a spatula at the stove', Object.values(B0.props ?? {}).some((s) => s.visible && s.kind === 'spatula'), JSON.stringify(B0.props));

  const lateRun = await runUntil(T, 4 * 600, `(() => { const a = st.people['${member}'].queue[0]; return !!a && a.interactionId === 'cookMeal' && a.data.stage === 1 && a.phase === 'perform' && a.duration > 0 && a.elapsed >= a.duration * 0.8; })()`);
  await render();
  const B = await probe(member, info.fridge, info.computer);
  T.check(S, 'the pill fill grows as the meal cooks', !!A.pill && !!B.pill && B.pill.value > A.pill.value && B.pill.fillWidth > A.pill.fillWidth, JSON.stringify({ early: A.pill, late: B.pill, lateRun: lateRun.done }));

  // stage 2: the served plate is carried to the table
  await runUntil(T, 4 * 60, `(() => { const a = st.people['${member}'].queue[0]; return !!a && a.interactionId === 'cookMeal' && a.data.stage === 2 && a.phase === 'perform'; })()`);
  await render();
  const C = await probe(member, info.fridge, info.computer);
  T.check(S, 'a plate is carried from the stove to the table', Object.values(C.props ?? {}).some((s) => s.visible && s.kind === 'plate'), JSON.stringify({ props: C.props, act: C.act }));

  // ---- eating: plate/fork in hand, then the completion state of the pill
  const eatCond = `(() => { const a = st.people['${member}'].queue[0]; return !!a && a.interactionId === 'eatMeal' && a.data.stage === 1 && a.phase === 'perform' && a.elapsed >= 2; })()`;
  let eatRun = await runUntil(T, 4 * 90, eatCond);
  if (!eatRun.done) {
    // Autonomy may not have sat down yet: take a portion from the served meal (a real player order) instead.
    const meal = await page.evaluate(() => {
      const st = window.hearthside.debug.state();
      const it = Object.values(st.items).find((i) => i.kind === 'meal' && i.lotId === st.activeLotId && i.portions > 0);
      return it ? it.id : null;
    });
    const eatQueued = await page.evaluate(([m, id]) => {
      const g = window.hearthside.game;
      const opt = g.options(m, { kind: 'item', itemId: id }).find((o) => o.interactionId === 'eatMeal');
      if (!opt) return { ok: false, reason: 'not offered' };
      if (!opt.enabled) return { ok: false, reason: opt.reason ?? 'disabled' };
      const r = g.queue(m, opt);
      return { ok: r.ok, reason: r.ok ? '' : r.reason };
    }, [member, meal]);
    T.check(S, 'a served meal can be taken from the counter', !!meal && eatQueued.ok, JSON.stringify({ meal, eatQueued }));
    if (eatQueued.ok) eatRun = await runUntil(T, 4 * 120, eatCond);
  }
  await page.evaluate((id) => window.hearthside.game.view.focusPerson(id), member);
  await T.frames(20);
  await settle(T);
  await render();
  const D = await probe(member, info.fridge, info.computer);
  T.check(S, 'a hand prop (plate and fork) exists while eating', Object.values(D.props ?? {}).some((s) => s.visible && (s.kind === 'plate' || s.kind === 'fork')), JSON.stringify({ props: D.props, act: D.act, eatRun: eatRun.done }));
  await T.shot('m115-eating-props');

  const applyRun = await runUntil(T, 4 * 600, `(() => { const a = st.people['${member}'].queue[0]; return !!a && a.interactionId === 'eatMeal' && (a.phase === 'apply' || (a.phase === 'cleanup' && a.data.result === 'done')); })()`);
  await render();
  const E = await probe(member, info.fridge, info.computer);
  T.check(S, 'the pill shows the completion state when the meal is finished', !!E.pill && (E.pill.done || /complete/i.test(E.pill.label ?? '')), JSON.stringify({ pill: E.pill, applyRun: applyRun.done, act: E.act }));

  await runUntil(T, 4 * 60, `!st.people['${member}'].queue.some((a) => a.interactionId === 'eatMeal' || a.interactionId === 'cookMeal')`);
  await clearQueue(member);
  await render();
  const F = await probe(member, info.fridge, info.computer);
  T.check(S, 'the cooking and eating props are put away', !!F.props && Object.values(F.props).every((s) => !s.visible), JSON.stringify(F.props));
  await T.shot('m115-after-eating');

  // ---- a computer used for writing: the document screen, and its text grows with the action
  const writeReady = await runUntil(T, 4 * 300, `g.options('${member}', { kind: 'object', objectId: '${info.computer}' }).some((o) => (o.interactionId === 'writeArticle' || o.interactionId === 'writeBook') && o.enabled)`);
  // Same as for the cook: a tired member can get an autonomy Sleep queued during the wait; clear it so the writing
  // action runs next (the option is offered whether or not they are busy).
  await clearQueue(member);
  const write = await page.evaluate(([m, c]) => {
    const g = window.hearthside.game;
    const opts = g.options(m, { kind: 'object', objectId: c });
    for (const id of ['writeArticle', 'writeBook']) {
      const opt = opts.find((o) => o.interactionId === id);
      if (opt && opt.enabled) { const r = g.queue(m, opt); return { ok: r.ok, id, reason: r.ok ? '' : r.reason }; }
    }
    return { ok: false, id: null, reason: opts.filter((o) => /write/i.test(o.interactionId)).map((o) => `${o.interactionId}:${o.enabled ? 'enabled' : o.reason}`).join(' | ') || 'not offered' };
  }, [member, info.computer]);
  T.check(S, 'a writing action is queued at the computer', write.ok, JSON.stringify({ write, ready: writeReady.done }));
  if (write.ok) {
    await page.evaluate((lv) => window.hearthside.game.view.setLevel?.(lv), info.computerLevel);
    await T.frames(10);
    const s1 = await runUntil(T, 4 * 180, `(() => { const a = st.people['${member}'].queue[0]; return !!a && a.interactionId === '${write.id}' && a.phase === 'perform' && a.elapsed >= 10; })()`);
    await render();
    const W1 = await probe(member, info.fridge, info.computer);
    const s2 = await runUntil(T, 4 * 600, `(() => { const a = st.people['${member}'].queue[0]; return !!a && a.interactionId === '${write.id}' && a.phase === 'perform' && a.duration > 0 && a.elapsed >= a.duration * 0.7; })()`);
    await render();
    const W2 = await probe(member, info.fridge, info.computer);
    T.check(S, 'the computer shows the writing screen while the piece is written', !!W1.screen && (W1.screen.mode === 'document' || W1.screen.mode === 'desktop'), JSON.stringify({ screen: W1.screen, early: s1.done }));
    T.check(S, 'the writing screen text grows with the action', !!W1.screen && !!W2.screen && W2.screen.progress > W1.screen.progress + 0.2, JSON.stringify({ early: W1.screen, late: W2.screen, late: s2.done }));
    await T.shot('m115-writing-screen');
    const done = await runUntil(T, 4 * 600, `!st.people['${member}'].queue.some((a) => a.interactionId === '${write.id}')`);
    await clearQueue(member);
    await render();
    const W3 = await probe(member, info.fridge, info.computer);
    T.check(S, 'the screen turns off when the writing is finished', !!W3.screen && W3.screen.mode === 'off', JSON.stringify({ screen: W3.screen, done: done.done }));
  }
  await page.evaluate(() => window.hearthside.game.view.setLevel?.(0));
  await T.shot('m115-end');
}

// ===============================================================================================================
// Milestone 13: the less common staircases (a spiral and a length-4 straight one) built in a two-floor structure and climbed (so the
// stairwell, the stair links and the climb animation are used by more than the basic straight stair), then the room tools: a room is
// moved with the Build panel's Move button, checked, applied and undone. Everything is driven through the game API except the room
// panel buttons, which are tapped.
// ===============================================================================================================

async function stepStairKinds(T) {
  const S = '15';
  const { page } = T;
  await page.evaluate(() => { window.hearthside.game.setSpeed(0); document.querySelectorAll('.toast').forEach((t) => t.remove()); });
  if ((await page.evaluate(() => window.hearthside.game.mode())) !== 'live') { await T.tap(page.locator('.mode-btn[data-mode="live"]')); await page.waitForTimeout(400); }
  await page.evaluate(() => { const st = window.hearthside.debug.state(); st.households[st.activeHouseholdId].funds += 900000; });

  // an empty stretch of the lot for a room of 7 x 4 tiles (room for a 4-long stair with a tile at each end, or a spiral with its entry and
  // its arrival tile) and the column east of it (the door's tile): no floor or object on the 8 x 4 tiles, no wall on the edges of the block
  // `loose`: objects standing outdoors (no floor under them) do not block the stretch; the spot then lists them so they can be sold
  // first (after steps 1-14 a full run's lot has no fully empty 8 x 4 stretch left, only garden objects and crops in the way)
  const findSpot = (avoid, loose = false) => page.evaluate(([av, looseOk]) => {
    const st = window.hearthside.debug.state(), lot = st.lots[st.activeLotId];
    const defs = window.hearthside.game.content.objects;
    const busy = new Set(av), floored = new Set(), owner = new Map();
    for (const k of Object.keys(lot.floors)) { const [l, x, z] = k.split(':').map(Number); if (l === 0) { busy.add(`${x},${z}`); floored.add(`${x},${z}`); } }
    for (const o of Object.values(lot.objects)) {
      const d = defs[o.defId]; if (o.level !== 0) continue;
      const w = o.rot % 2 ? d.footprint.d : d.footprint.w, dd = o.rot % 2 ? d.footprint.w : d.footprint.d;
      const tiles = []; for (let i = 0; i < w; i++) for (let j = 0; j < dd; j++) tiles.push(`${o.x + i},${o.z + j}`);
      const outdoor = looseOk && !d.stair && tiles.every((t) => !floored.has(t));
      for (const t of tiles) { if (outdoor) owner.set(t, o.id); else busy.add(t); }
    }
    for (const p of Object.values(lot.pools ?? {})) for (let z = p.z0; z <= p.z1; z++) for (let x = p.x0; x <= p.x1; x++) busy.add(`${x},${z}`);
    const fenced = (dir, x, z) => !!lot.fences?.[`0:${dir}:${x}:${z}`];
    const wall = (dir, x, z) => !!lot.walls[`0:${dir}:${x}:${z}`] || fenced(dir, x, z);
    for (let z = 0; z + 3 < lot.depth; z++) for (let x = 1; x + 8 < lot.width; x++) {
      let free = true;
      for (let j = 0; j < 4 && free; j++) for (let i = 0; i <= 7 && free; i++) if (busy.has(`${x + i},${z + j}`)) free = false;
      for (let i = 0; i < 7 && free; i++) for (let j = 0; j <= 4 && free; j++) if (wall('h', x + i, z + j)) free = false;
      for (let j = 0; j < 4 && free; j++) for (let i = 0; i <= 8 && free; i++) if (wall('v', x + i, z + j)) free = false;
      if (free) {
        const clear = new Set();
        for (let j = 0; j < 4; j++) for (let i = 0; i <= 7; i++) { const id = owner.get(`${x + i},${z + j}`); if (id) clear.add(id); }
        return { x, z, clear: [...clear] };
      }
    }
    return null;
  }, [avoid, loose]);

  const used = [];
  const kinds = [['stair-spiral-wood', 'spiral (4 tiles)'], ['stair-grand', 'straight, 4 tiles, two wide']];
  let first = null;
  for (const [defId, label] of kinds) {
    let spot = await findSpot(used);
    if (!spot) {
      spot = await findSpot(used, true);
      if (spot) spot.sold = await page.evaluate((ids) => ids.map((id) => window.hearthside.game.sell(id).ok), spot.clear);
    }
    T.check(S, `there is an empty stretch of the lot for the ${label} staircase`, !!spot && (spot.sold ?? []).every(Boolean), JSON.stringify(spot));
    if (!spot) return;
    const { x: X0, z: Z0 } = spot;
    for (let j = -1; j <= 4; j++) for (let i = -1; i <= 9; i++) used.push(`${X0 + i},${Z0 + j}`);
    if (!first) first = spot;
    // ---- a ground room with a floor and a door, a room over it on Floor 2
    const built = await page.evaluate(([x0, z0]) => {
      const g = window.hearthside.game;
      const fd = Object.values(g.content.floorDesigns).find((d) => d.status === 'ready');
      const floor = { designId: fd.id, paletteId: fd.palettes[0].id };
      const door = Object.values(g.content.openings).find((d) => d.kind === 'door' && d.status === 'ready' && d.width === 1);
      g.setMode('build');
      g.view.setLevel?.(0);
      g.setBuildTool({ kind: 'room', floor, doors: [{ defId: door.id, side: 'e' }] });
      const ground = g.buildApply({ from: { x: x0, z: z0 }, to: { x: x0 + 7, z: z0 + 4 }, level: 0 });
      g.setBuildTool({ kind: 'room', floor, doors: [] });
      const upper = g.buildApply({ from: { x: x0, z: z0 }, to: { x: x0 + 7, z: z0 + 4 }, level: 1 });
      g.setBuildTool(null);
      g.setMode('live');
      return { ground: ground.ok, upper: upper.ok ? true : upper.reason };
    }, [X0, Z0]);
    T.check(S, `the ${label} staircase: ground room and Floor 2 room built`, built.ground === true && built.upper === true, JSON.stringify(built));
    const memberOnLot = () => page.evaluate(() => { const st = window.hearthside.debug.state(); return st.households[st.activeHouseholdId].memberIds.find((id) => st.people[id].location.kind === 'lot') ?? null; });
    let walker = await memberOnLot();
    if (!walker) { await runUntil(T, 2400, `Object.values(st.people).some(p => p.householdId === st.activeHouseholdId && p.location.kind === 'lot')`); walker = await memberOnLot(); }
    T.check(S, 'a household member is home to climb the staircase', !!walker, String(walker));
    if (!walker || !built.ground || built.upper !== true) continue;
    // Go here on a level: queued through the real options, run until the action ends, true when the member stands on the tile
    const climb = async (level, tx, tz) => {
      const queued = await page.evaluate(([id, lv, x, z]) => {
        const g = window.hearthside.game;
        const opt = g.options(id, { kind: 'floor', tile: { x, z }, level: lv }).find((o) => o.interactionId === 'goHere' && o.enabled);
        return opt ? g.queue(id, opt).ok : false;
      }, [walker, level, tx, tz]);
      if (!queued) return { queued: false, done: false };
      await page.evaluate(() => { globalThis.__maxRise = 0; globalThis.__levels = new Set(); });
      const ended = `(() => { const p = st.people['${walker}']; const l = p.location; globalThis.__maxRise = Math.max(globalThis.__maxRise, l.rise || 0); if (l.kind === 'lot') globalThis.__levels.add(l.level); return p.queue.length === 0 || (l.kind === 'lot' && l.level === ${level} && !l.rise && Math.floor(l.x) === ${tx} && Math.floor(l.z) === ${tz}); })()`;
      const walk = await runUntil(T, 9600, ended);
      const there = await page.evaluate(([id, lv, x, z]) => { const l = window.hearthside.debug.state().people[id].location; return l.kind === 'lot' && l.level === lv && !l.rise && Math.floor(l.x) === x && Math.floor(l.z) === z; }, [walker, level, tx, tz]);
      const seen = await page.evaluate(() => ({ maxRise: globalThis.__maxRise, levels: [...globalThis.__levels] }));
      return { queued: true, ...walk, done: walk.done && there, ...seen };
    };
    // ---- the staircase: the first turn and tile in the room where the game accepts it AND the walk upstairs works (the stairs need a
    // floor tile beyond their head on Floor 2, which not every spot has), the others are taken out again
    let found = null;
    let up = null;
    const tried = [];
    for (let rot = 0; rot < 4 && !found; rot++) for (let z = Z0; z < Z0 + 4 && !found; z++) for (let x = X0; x < X0 + 7 && !found; x++) {
      const placed = await page.evaluate(([id, px, pz, r, x0, z0]) => {
        const g = window.hearthside.game;
        g.setMode('build');
        g.setBuildTool({ kind: 'stairs', defId: id, rot: r });
        const res = g.buildApply({ from: { x: px + 0.5, z: pz + 0.5 }, level: 0 });
        g.setBuildTool(null);
        g.setMode('live');
        if (!res.ok) return null;
        const st = window.hearthside.debug.state(), lot = st.lots[st.activeLotId];
        const stair = Object.values(lot.objects).find((o) => o.defId === id && o.x >= x0 && o.x < x0 + 7 && o.z >= z0 && o.z < z0 + 4);
        const d = g.content.objects[id];
        const w = stair.rot % 2 ? d.footprint.d : d.footprint.w, dd = stair.rot % 2 ? d.footprint.w : d.footprint.d;
        const holes = [];
        for (let j = 0; j < dd; j++) for (let i = 0; i < w; i++) if (!lot.floors[`1:${stair.x + i}:${stair.z + j}`]) holes.push([stair.x + i, stair.z + j]);
        let far = null, fd = -1;
        for (let zz = z0; zz < z0 + 4; zz++) for (let xx = x0; xx < x0 + 7; xx++) {
          if (!lot.floors[`1:${xx}:${zz}`] || holes.some(([hx, hz]) => hx === xx && hz === zz)) continue;
          const dist = Math.hypot(xx - stair.x, zz - stair.z);
          if (dist > fd) { fd = dist; far = { x: xx, z: zz }; }
        }
        return { id: stair.id, x: stair.x, z: stair.z, rot: stair.rot, holes: holes.length, far, kind: d.stair };
      }, [defId, x, z, rot, X0, Z0]);
      if (!placed) continue;
      if (!placed.far || placed.holes < 1) { tried.push(`${x},${z}/${rot}: no stairwell or no upper tile`); }
      else {
        const attempt = await climb(1, placed.far.x, placed.far.z);
        if (attempt.done) { found = placed; up = attempt; break; }
        tried.push(`${x},${z}/${rot}: did not arrive`);
      }
      // take this one out again (the member goes back to the ground floor first if they got up)
      await page.evaluate(([oid, px, pz]) => {
        const g = window.hearthside.game;
        g.setMode('build');
        g.setBuildTool({ kind: 'eraseStairs' });
        g.buildApply({ from: { x: px + 0.5, z: pz + 0.5 }, level: 0 });
        g.setBuildTool(null);
        g.setMode('live');
      }, [placed.id, placed.x, placed.z]);
    }
    T.check(S, `the ${label} staircase (${defId}) has a spot in the room where the stairs are usable`, !!found, found ? JSON.stringify(found) : `tried ${tried.slice(0, 5).join(' | ')}`);
    if (!found) continue;
    T.check(S, `the stairwell is cut into Floor 2 above the ${label} staircase (${found.holes} tiles open)`, found.holes >= 1, JSON.stringify(found));
    T.check(S, `the member climbed the ${label} staircase to Floor 2 (rise above 2 m, levels 0 and 1)`, up.done && up.maxRise > 2 && up.levels.includes(0) && up.levels.includes(1), JSON.stringify({ ...up, viol: up.viol?.length }));
    T.check(S, `the climb never crossed a wall outside a doorway (${label})`, (up.viol ?? []).length === 0, JSON.stringify((up.viol ?? []).slice(0, 3)));
    await T.frames(12);
    await T.shot(`m13-stairs-${defId}`);
    const down = await climb(0, X0 + 7, Z0 + 1);
    T.check(S, `and back down the ${label} staircase to the ground floor`, down.queued && down.done, JSON.stringify({ ...down, viol: down.viol?.length }));
  }

  // ---- the room tools on the first room: select it, Move, check the preview, apply, undo
  if (!first) return;
  await page.evaluate(() => { const g = window.hearthside.game; g.view.setLevel?.(0); g.setSpeed(0); });
  await T.tap(page.locator('.mode-btn[data-mode="build"]'));
  await page.waitForSelector('.bb-build-panel:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(600);
  await T.frames(20);
  const tile = { x: first.x + 1, z: first.z + 1 };
  const sel = await page.evaluate(([x, z]) => { const r = window.hearthside.game.roomAt({ x, z }, 0); return r && !r.outdoor ? { uid: r.uid, area: r.area } : null; }, [tile.x, tile.z]);
  T.check(S, 'the built room is an indoor room the Build panel can select', !!sel, JSON.stringify(sel));
  const snap = () => page.evaluate(() => { const st = window.hearthside.debug.state(), lot = st.lots[st.activeLotId]; return { floors: Object.keys(lot.floors).length, funds: st.households[st.activeHouseholdId].funds, keys: Object.keys(lot.walls).filter((k) => k.startsWith('0:')).sort().join(',') }; });
  const before = await snap();
  const pt = await pointFor(T, 'tile', tile.x, tile.z);
  T.check(S, 'a tile of the room is on screen and free of UI', !!pt?.free, JSON.stringify(pt));
  if (!pt?.free) return;
  await T.tapAt(pt.x, pt.y);
  await page.waitForTimeout(300);
  const moveBtn = page.locator('.bb-room-actions [data-room-action="move"]');
  T.check(S, 'the selected room offers Move, Resize, Copy and Demolish (touch sized buttons)', (await moveBtn.count()) === 1 && (await page.locator('.bb-room-actions .btn').count()) === 4 && ((await moveBtn.boundingBox())?.height ?? 0) >= 43.5, '');
  await T.tap(moveBtn);
  await page.waitForTimeout(300);
  T.check(S, 'Move shows the arrow pad and an Apply button that is off until the room is nudged', (await page.locator('.bb-roomedit-pad .btn').count()) === 4 && await page.locator('.bb-build-footer .bb-confirm').isDisabled(), '');
  let ok = false;
  for (const dir of ['e', 'e', 'w', 'w', 'w', 'w', 's', 's']) {
    await T.tap(page.locator(`.bb-roomedit-pad [data-nudge="${dir}"]`));
    await page.waitForTimeout(150);
    if (!(await page.locator('.bb-build-footer .bb-confirm').isDisabled())) { ok = true; break; }
  }
  const footer = (await page.locator('.bb-build-footer').innerText()).replace(/\s+/g, ' ');
  T.check(S, 'nudging the room gives a valid preview that says moving is free', ok && /Free/.test(footer), footer);
  await T.shot('m13-room-move-preview');
  const same = await snap();
  T.check(S, 'nothing changed before Apply', same.keys === before.keys && same.funds === before.funds, '');
  await T.tap(page.locator('.bb-build-footer .bb-confirm'));
  await page.waitForTimeout(400);
  const moved = await snap();
  T.check(S, 'Apply moved the room: its walls are elsewhere, the floor count and the funds are unchanged', moved.keys !== before.keys && moved.floors === before.floors && moved.funds === before.funds, '');
  await T.shot('m13-room-moved');
  await page.evaluate(() => window.hearthside.game.undo());
  await page.waitForTimeout(300);
  const undone = await snap();
  T.check(S, 'undo puts the room back exactly', undone.keys === before.keys && undone.floors === before.floors, '');
  await page.evaluate(() => window.hearthside.game.setBuildTool(null));
  await T.audit('room tools: end');
}

// ===============================================================================================================
// Milestone 12: seasons and weather (the HUD chip, the rain and snow gates), a pool built with the pool tool and
// swum out through its ladder, then a trip to the Quayside Baths and back.
// ===============================================================================================================

async function stepWorldM12(T) {
  const S = '14';
  const { page } = T;
  const touch = T.vpInfo.touch;
  const setDay = async (day, weather) => {
    const r = await page.evaluate(([d, w]) => {
      const h = window.hearthside.debug, st = h.state();
      st.clock.minutes = d * 1440 + 10 * 60;
      const ok = h.setWeather(w);
      h.step(1);
      return { ok, weather: { ...(st.weather ?? {}) }, funds: st.households[st.activeHouseholdId].funds, minutes: st.clock.minutes };
    }, [day, weather]);
    return r;
  };
  const hud = () => page.evaluate(() => {
    const e = document.querySelector('.clock-sky');
    if (!e) return null;
    return { label: e.getAttribute('aria-label') ?? '', title: e.getAttribute('title') ?? '', text: e.querySelector('.clock-sky-text')?.textContent ?? '' };
  });
  // The HUD refreshes on a 250 ms timer (and skips while the page is hidden or off the game route), so poll for the
  // chip to catch up instead of racing the timer with a fixed wait. The software renderer can hold the main thread
  // for several seconds after a big screenshot, so allow a wide ceiling before calling the chip stale.
  const waitSky = async (re, ms = 20000) => {
    const start = Date.now();
    let last = await hud();
    while (!re.test(`${last?.label ?? ''} ${last?.text ?? ''}`) && Date.now() - start < ms) {
      await page.waitForTimeout(150);
      last = await hud();
    }
    return last;
  };
  const actorOnLot = () => page.evaluate(() => {
    const st = window.hearthside.debug.state(), hh = st.households[st.activeHouseholdId];
    return hh.memberIds.find((id) => { const p = st.people[id]; return p.location.kind === 'lot' && p.location.level === 0; }) ?? null;
  });
  const clearQueue = async (member) => {
    await page.evaluate((m) => {
      const g = window.hearthside.game; const p = window.hearthside.debug.state().people[m];
      for (const a of [...p.queue]) g.cancel(m, a.id);
    }, member);
    await runUntil(T, 24, `st.people['${member}'].queue.length === 0`);
  };
  // The self menu is reached by picking the person themself (PickResult has no 'self'): optionsFor() returns
  // selfOptions() when the picked person is the actor.
  const optionOf = (member, interactionId, pick = null) => page.evaluate(([m, i, p]) => {
    const opt = window.hearthside.game.options(m, p ?? { kind: 'person', personId: m }).find((o) => o.interactionId === i);
    return opt ? { enabled: opt.enabled, reason: opt.reason ?? null, label: opt.label } : null;
  }, [member, interactionId, pick]);
  const openMap = async () => {
    await T.tap(page.locator('.map-btn'));
    await page.waitForSelector('.nbm', { timeout: 8000 });
    await page.waitForTimeout(450);
  };
  const closeMap = async () => {
    const x = page.locator('.nbm .modal-header button[aria-label="Close"]').first();
    if (await x.count() && await x.isVisible().catch(() => false)) { await T.tap(x); await page.waitForTimeout(250); }
    await page.waitForSelector('.nbm', { state: 'detached', timeout: 5000 }).catch(() => undefined);
  };
  const pickLot = async (lotId) => {
    const pin = page.locator(`.nbm-pin[data-lot-id="${lotId}"]`);
    try { await T.tap(pin); } catch {
      await T.tap(page.locator('.nbm-toggle .seg[data-id="list"]'));
      await T.tap(page.locator(`.nbm-row[data-lot-id="${lotId}"]`));
    }
    await page.waitForSelector('.nbm-detail h3', { timeout: 5000 });
    await page.waitForTimeout(250);
  };

  await page.evaluate(() => { window.hearthside.game.setSpeed(0); document.querySelectorAll('.toast').forEach((t) => t.remove()); });
  await closeAnyPanel(T);
  await dismissMenu(T).catch(() => undefined);
  if ((await page.evaluate(() => window.hearthside.game.mode())) !== 'live') {
    await T.tap(page.locator('.mode-btn[data-mode="live"]'));
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => { const g = window.hearthside.game; g.view.setLevel?.(0); g.view.setCutaway?.('cutaway'); });
  await T.frames(8);
  const members = await page.evaluate(() => { const st = window.hearthside.debug.state(); return st.households[st.activeHouseholdId].memberIds; });
  await page.evaluate((ids) => { for (const id of ids) window.hearthside.game.quitCareer?.(id); }, members);

  // ---- 1. seasons and the HUD chip: an autumn rainy morning
  const autumn = await setDay(14, 'rain');
  const chipRain = await waitSky(/Autumn.*Rain/);
  const rainText = `${chipRain?.label ?? ''} ${chipRain?.title ?? ''} ${chipRain?.text ?? ''}`;
  T.check(S, 'the HUD chip names the season and the weather', /Autumn/.test(rainText) && /Rain/.test(rainText), JSON.stringify({ chip: chipRain, state: autumn }));
  let actor = await actorOnLot();
  if (!actor) {
    await runUntil(T, 4 * 240, 'Object.values(st.people).some((p) => p.householdId === st.activeHouseholdId && p.location.kind === \'lot\' && p.location.level === 0)');
    actor = await actorOnLot();
  }
  const rakeRain = actor ? await optionOf(actor, 'rakeLeaves') : null;
  T.check(S, 'rain is on: an outdoor activity is greyed with a reason', !!rakeRain && rakeRain.enabled === false && /rain/i.test(rakeRain.reason ?? ''), JSON.stringify({ actor, rake: rakeRain }));
  await page.evaluate(() => window.hearthside.debug.setWeather('clear'));
  const chipClear = await waitSky(/Autumn.*Clear/);
  const clearText = `${chipClear?.label ?? ''} ${chipClear?.title ?? ''} ${chipClear?.text ?? ''}`;
  const rakeClear = actor ? await optionOf(actor, 'rakeLeaves') : null;
  T.check(S, 'clear weather lets the outdoor activity run again', !!rakeClear && rakeClear.enabled === true, JSON.stringify({ chip: chipClear, rake: rakeClear }));
  T.check(S, 'the HUD chip follows the weather change', /Clear/.test(clearText), JSON.stringify(chipClear));

  // ---- 2. winter snow: it lies on the ground and Build a Snowman runs
  const winter = await setDay(21, 'snow');
  const chipSnow = await waitSky(/Winter.*Snow/);
  const snowText = `${chipSnow?.label ?? ''} ${chipSnow?.title ?? ''} ${chipSnow?.text ?? ''}`;
  T.check(S, 'winter snow lies on the ground', /Winter/.test(snowText) && /Snow/.test(snowText) && !!winter.weather?.snowCover, JSON.stringify({ chip: chipSnow, weather: winter.weather }));
  actor = (await actorOnLot()) ?? actor;
  if (!actor) { T.bad(S, 'a member is home for the snowman', 'nobody on the lot'); return; }
  await selectMember(T, actor);
  await clearQueue(actor);
  const snowOpt = await optionOf(actor, 'buildSnowman');
  T.check(S, 'Build a Snowman is offered in winter snow', !!snowOpt && snowOpt.enabled === true, JSON.stringify(snowOpt));
  if (snowOpt?.enabled) {
    const q = await page.evaluate((m) => {
      const g = window.hearthside.game;
      const opt = g.options(m, { kind: 'person', personId: m }).find((o) => o.interactionId === 'buildSnowman');
      if (!opt) return { ok: false, reason: 'not offered' };
      const r = g.queue(m, opt);
      return { ok: r.ok, reason: r.ok ? '' : r.reason };
    }, actor);
    const built = await runUntil(T, 4 * 240, 'Object.values(st.lots[st.activeLotId].objects).some((o) => o.defId === \'snowman\')');
    const snowman = await page.evaluate(() => {
      const st = window.hearthside.debug.state();
      const o = Object.values(st.lots[st.activeLotId].objects).find((x) => x.defId === 'snowman');
      return o ? { id: o.id, x: o.x, z: o.z, level: o.level } : null;
    });
    T.check(S, 'Build a Snowman leaves a snowman in the yard', q.ok && built.done && !!snowman && snowman.level === 0, JSON.stringify({ q, built: built.done, snowman }));
    if (snowman) {
      await page.evaluate((id) => window.hearthside.game.view.reveal({ kind: 'object', objectId: id }), snowman.id);
      await T.frames(30);
      await T.shot('m12-snowman');
    }
  }
  // the snow stays on the ground after the weather clears (the pool is outdoors: it may only open when it is not snowing)
  const cleared = await page.evaluate(() => { const h = window.hearthside.debug; h.setWeather('clear'); h.step(1); const st = h.state(); return { current: st.weather?.current, snowCover: !!st.weather?.snowCover }; });
  T.check(S, 'snow stays on the ground after the weather clears', cleared.current === 'clear' && cleared.snowCover === true, JSON.stringify(cleared));

  // ---- 3. build a small pool with the Pool tool in Build mode
  await page.evaluate(() => { const st = window.hearthside.debug.state(); st.households[st.activeHouseholdId].funds += 500000; });
  await clearQueue(actor);
  await T.tap(page.locator('.mode-btn[data-mode="build"]'));
  await page.waitForSelector('.bb-build-panel:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(600);
  await T.frames(10);
  const poolTab = page.locator('.bb-tool-tabs .tab[data-id="tool-pool"]');
  T.check(S, 'the Build tabs include Pool', (await poolTab.count()) === 1, '');
  await T.tap(poolTab);
  await page.waitForTimeout(500);
  await T.frames(6);
  const cards = page.locator('.bb-ext-pools .bb-card');
  const cardCount = await cards.count();
  T.check(S, 'the Pool tab lists pool styles with prices', cardCount >= 2 && /\$/.test(await cards.first().innerText()), `${cardCount} styles`);
  const styleCard = page.locator('.bb-ext-pools .bb-card[data-style-id="azure-mosaic"]');
  const chosenCard = (await styleCard.count()) ? styleCard.first() : cards.first();
  await chosenCard.scrollIntoViewIfNeeded().catch(() => undefined);
  await T.tap(chosenCard);
  await page.waitForTimeout(300);
  const chosen = await page.evaluate(() => { const t = window.hearthside.game.buildTool(); return t && t.kind === 'pool' ? { kind: t.kind, styleId: t.styleId } : t; });
  T.check(S, 'the pool tool carries the chosen style', !!chosen && chosen.kind === 'pool' && !!chosen.styleId, JSON.stringify(chosen));

  const spot = await page.evaluate(() => {
    const g = window.hearthside.game;
    const st = window.hearthside.debug.state(), lot = st.lots[st.activeLotId];
    const busy = new Set();
    const mark = (x, z) => { if (x >= 0 && z >= 0 && x < lot.width && z < lot.depth) busy.add(`${x},${z}`); };
    for (const k of Object.keys(lot.floors ?? {})) {
      const [l, x, z] = k.split(':').map(Number);
      if (l === 1) mark(x, z);
    }
    for (const w of Object.values(lot.walls)) {
      if (w.level !== 0) continue;
      if (w.dir === 'h') { mark(w.x, w.z); mark(w.x + 1, w.z); } else { mark(w.x, w.z); mark(w.x, w.z + 1); }
    }
    const defs = g.content.objects;
    for (const o of Object.values(lot.objects)) {
      if (o.level !== 0) continue;
      const d = defs[o.defId];
      const w = o.rot % 2 ? d.footprint.d : d.footprint.w, dd = o.rot % 2 ? d.footprint.w : d.footprint.d;
      for (let i = 0; i < w; i++) for (let j = 0; j < dd; j++) mark(o.x + i, o.z + j);
    }
    for (const p of Object.values(st.people)) {
      const l = p.location;
      if (l.kind === 'lot' && l.lotId === lot.id && l.level === 0) mark(Math.floor(l.x), Math.floor(l.z));
    }
    for (const p of Object.values(lot.pools ?? {})) for (let x = p.x0; x <= p.x1; x++) for (let z = p.z0; z <= p.z1; z++) mark(x, z);
    for (const k of Object.keys(lot.fences ?? {})) {
      const [, dir, x, z] = k.split(':');
      const X = Number(x), Z = Number(z);
      mark(X, Z);
      if (dir === 'h') mark(X + 1, Z); else mark(X, Z + 1);
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) mark(X + dx, Z + dz);
    }
    const pref = { x: lot.width / 2, z: lot.depth - 2.5 };
    const cands = [];
    for (const [w, d] of [[3, 3], [2, 3], [3, 2]]) {
      for (let z = 0; z + d <= lot.depth; z++) for (let x = 0; x + w <= lot.width; x++) {
        let free = true;
        for (let i = 0; i < w && free; i++) for (let j = 0; j < d; j++) if (busy.has(`${x + i},${z + j}`)) { free = false; break; }
        if (free) cands.push({ x, z, w, d, dist: Math.hypot(x + w / 2 - pref.x, z + d / 2 - pref.z) });
      }
    }
    cands.sort((a, b) => a.dist - b.dist);
    for (const c of cands) {
      const pv = g.buildPreview({ from: { x: c.x, z: c.z }, to: { x: c.x + c.w - 1, z: c.z + c.d - 1 }, level: 0 });
      if (pv && pv.ok) return { ...c, cost: pv.cost, label: pv.label };
    }
    return { ok: false, reason: 'no free rectangle', cands: cands.length };
  });
  T.check(S, 'there is a free rectangle for a small pool', !!spot && spot.x !== undefined && spot.w >= 2 && spot.d >= 2, JSON.stringify(spot && { x: spot.x, z: spot.z, w: spot.w, d: spot.d, cost: spot.cost, label: spot.label }));
  if (!spot || spot.x === undefined) return;
  const funds0 = await page.evaluate(() => { const st = window.hearthside.debug.state(); return st.households[st.activeHouseholdId].funds; });
  const fp = await framePair(T, 'tile', [spot.x, spot.z], [spot.x + spot.w - 1, spot.z + spot.d - 1]);
  let applied = false;
  if (fp.a?.free && fp.b?.free) {
    await drag(T, fp.a, fp.b);
    await T.frames(4);
    if (touch) {
      const status = (await footerText(T)) ?? '';
      T.check(S, 'a drag previews the pool with its size and price', /pool/i.test(status) && /\$/.test(status), status.replace(/\s+/g, ' '));
      await T.shot('m12-pool-preview');
      await tapFooter(T, '.bb-confirm');
    }
    await page.waitForTimeout(500);
    await T.frames(8);
    applied = (await page.evaluate(() => Object.keys(window.hearthside.debug.state().lots[window.hearthside.debug.state().activeLotId].pools ?? {}).length)) > 0;
  }
  if (!applied) {
    const r = await page.evaluate(([s]) => {
      const g = window.hearthside.game;
      const t = { from: { x: s.x, z: s.z }, to: { x: s.x + s.w - 1, z: s.z + s.d - 1 }, level: 0 };
      const pv = g.buildPreview(t), ap = g.buildApply(t);
      return { pv: pv && { ok: pv.ok, reason: pv.reason }, ok: ap.ok, reason: ap.ok ? '' : ap.reason };
    }, [spot]);
    T.check(S, 'the pool tool builds the pool (the corners were under the sheet: same tool through the API)', r.ok, JSON.stringify(r));
    await T.frames(8);
    applied = r.ok;
  }
  const poolState = await page.evaluate(() => {
    const st = window.hearthside.debug.state(), lot = st.lots[st.activeLotId], hh = st.households[st.activeHouseholdId];
    return {
      funds: hh.funds,
      pools: Object.values(lot.pools ?? {}).map((p) => ({ id: p.id, x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, styleId: p.styleId, price: p.purchasePrice, ladders: p.ladders.map((l) => ({ ...l })) })),
    };
  });
  const pool = poolState.pools[0];
  T.check(S, 'a small pool was built and paid for', applied && !!pool && (pool.x1 - pool.x0 + 1) * (pool.z1 - pool.z0 + 1) >= 6 && poolState.funds === funds0 - (pool.price ?? 0), JSON.stringify({ pool: pool && { x0: pool.x0, z0: pool.z0, x1: pool.x1, z1: pool.z1, styleId: pool.styleId, price: pool.price }, paid: funds0 - poolState.funds }));
  T.check(S, 'the pool keeps a ladder on one of its edges', !!pool && pool.ladders.length >= 1 && pool.ladders.every((l) => l.x === pool.x0 || l.x === pool.x1 || l.z === pool.z0 || l.z === pool.z1), JSON.stringify(pool?.ladders));
  if (!pool) return;
  await T.shot('m12-pool-built');
  await page.evaluate(() => window.hearthside.game.setBuildTool(null));
  await T.tap(page.locator('.mode-btn[data-mode="live"]'));
  await page.waitForTimeout(500);
  await T.frames(8);

  // ---- 4. swim, then get out through the ladder (never standing on water)
  actor = (await actorOnLot()) ?? actor;
  if (!actor) { T.bad(S, 'a member is home to swim', 'nobody on the lot'); return; }
  await selectMember(T, actor);
  await clearQueue(actor);
  const ladder = pool.ladders[0];
  const swim = await page.evaluate(([m, t]) => {
    const g = window.hearthside.game;
    const opts = g.options(m, { kind: 'floor', tile: { x: t.x, z: t.z }, level: 0 });
    const opt = opts.find((o) => o.interactionId === 'swimInPool');
    if (!opt) return { ok: false, reason: 'not offered', labels: opts.map((o) => o.label) };
    if (!opt.enabled) return { ok: false, reason: opt.reason ?? 'disabled' };
    const r = g.queue(m, opt);
    return { ok: r.ok, reason: r.ok ? '' : r.reason };
  }, [actor, { x: ladder.x, z: ladder.z }]);
  T.check(S, 'Swim in the Pool is queued from the water', swim.ok, JSON.stringify(swim));
  if (swim.ok) {
    const inWater = await runUntil(T, 4 * 120, `(() => { const p = st.people['${actor}']; const a = p.queue[0]; return !!a && a.interactionId === 'swimInPool' && a.data.stage === 'swim' && a.phase === 'perform'; })()`);
    await page.evaluate((id) => window.hearthside.game.view.focusPerson(id), actor);
    await T.frames(24);
    await settle(T);
    await T.frames(10);
    const sw = await page.evaluate(([m, p]) => {
      const st = window.hearthside.debug.state(), person = st.people[m];
      const t = { x: Math.floor(person.location.x), z: Math.floor(person.location.z) };
      const water = t.x >= p.x0 && t.x <= p.x1 && t.z >= p.z0 && t.z <= p.z1;
      return { anim: person.anim?.id ?? null, tile: t, water, drawn: !!window.hearthside.view.personPosition(m), act: person.queue[0] ? { id: person.queue[0].interactionId, stage: person.queue[0].data?.stage ?? null } : null };
    }, [actor, pool]);
    T.check(S, 'the member swims in the pool water with the swim animation', inWater.done && sw.water === true && sw.anim === 'swim' && sw.drawn === true, JSON.stringify({ ...sw, ticks: inWater.ticks }));
    await T.shot('m12-pool-swim');
    // Get Out is offered on the water tile (it is a pool-water menu entry, not a self one).
    const out = await page.evaluate(([m, t]) => {
      const g = window.hearthside.game;
      const opt = g.options(m, { kind: 'floor', tile: { x: t.x, z: t.z }, level: 0 }).find((o) => o.interactionId === 'getOutOfPool');
      if (!opt) return { ok: false, reason: 'not offered' };
      if (!opt.enabled) return { ok: false, reason: opt.reason ?? 'disabled' };
      const r = g.queue(m, opt);
      return { ok: r.ok, reason: r.ok ? '' : r.reason };
    }, [actor, { x: ladder.x, z: ladder.z }]);
    T.check(S, 'Get Out is offered while swimming', out.ok, JSON.stringify(out));
    if (out.ok) {
      const swimId = await page.evaluate((m) => window.hearthside.debug.state().people[m].queue[0]?.id ?? null, actor);
      const exit = await page.evaluate(([m, p, id]) => {
        const h = window.hearthside;
        const ids = new Set(['swimInPool', 'relaxInPool', 'getOutOfPool']);
        const water = (x, z) => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1;
        const bad = [];
        let last = null;
        for (let i = 0; i < 4 * 240; i++) {
          h.debug.step(1);
          const st = h.debug.state(), person = st.people[m];
          if (person.location.kind !== 'lot') return { done: false, reason: 'left the lot', bad };
          const a = person.queue[0];
          const t = { x: Math.floor(person.location.x), z: Math.floor(person.location.z) };
          const poolAction = !!a && ids.has(a.interactionId);
          if (water(t.x, t.z) && !poolAction) bad.push({ x: t.x, z: t.z, at: Math.round(st.clock.minutes), anim: person.anim?.id ?? null, action: a?.interactionId ?? null });
          last = { x: t.x, z: t.z, level: person.location.level, anim: person.anim?.id ?? null, action: a?.interactionId ?? null };
          // stop when the swim this Get Out cancelled has finished (autonomy may queue another swim behind it)
          if (!person.queue.some((q) => q.id === id)) return { done: true, ticks: i + 1, bad, loc: last };
        }
        return { done: false, bad, loc: last };
      }, [actor, pool, swimId]);
      const deck = pool.ladders.map((l) => l.side === 'n' ? { x: l.x, z: l.z - 1 } : l.side === 's' ? { x: l.x, z: l.z + 1 } : l.side === 'w' ? { x: l.x - 1, z: l.z } : { x: l.x + 1, z: l.z });
      const onDeck = !!exit.loc && deck.some((d) => d.x === exit.loc.x && d.z === exit.loc.z);
      const onWater = !!exit.loc && exit.loc.x >= pool.x0 && exit.loc.x <= pool.x1 && exit.loc.z >= pool.z0 && exit.loc.z <= pool.z1;
      T.check(S, 'the member gets out through the ladder onto the deck, never walking on water', exit.done && !onWater && onDeck && exit.bad.length === 0, JSON.stringify({ exit, deck }));
      await page.evaluate((id) => window.hearthside.game.view.focusPerson(id), actor);
      await T.frames(24);
      await T.shot('m12-pool-out');
    }
  }

  // ---- 5. travel to the Quayside Baths and back
  const poolLot = await page.evaluate(() => { const i = window.hearthside.game.neighbourhood(); return i.lots.find((l) => l.venueType === 'pool') ?? null; });
  const homeId = await page.evaluate(() => window.hearthside.game.neighbourhood().homeLotId);
  T.check(S, 'the neighbourhood has the Quayside Baths pool venue', !!poolLot && poolLot.name === 'Quayside Baths', JSON.stringify(poolLot && { id: poolLot.id, name: poolLot.name, open: poolLot.open }));
  if (poolLot) {
    actor = (await actorOnLot()) ?? actor;
    if (actor) await selectMember(T, actor);
    await openMap();
    await pickLot(poolLot.id);
    const sheet = await page.evaluate(() => ({ title: document.querySelector('.nbm-detail h3')?.textContent ?? '', go: document.querySelector('.nbm-go')?.textContent.trim() ?? '', disabled: document.querySelector('.nbm-go')?.disabled ?? true }));
    T.check(S, 'the map shows the Quayside Baths with a Go here button', sheet.title === poolLot.name && sheet.go === 'Go here' && sheet.disabled === false, JSON.stringify(sheet));
    await T.tap(page.locator('.nbm-go'));
    await page.waitForSelector('.nbm', { state: 'detached', timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    const arrived = await runUntil(T, 4 * 120, `st.activeLotId === '${poolLot.id}'`);
    await T.frames(10);
    const venue = await page.evaluate(([id, m]) => {
      const st = window.hearthside.debug.state(), lot = st.lots[id];
      return {
        active: st.activeLotId,
        place: window.hearthside.game.whereIs(m),
        pools: Object.values(lot?.pools ?? {}).map((p) => ({ w: p.x1 - p.x0 + 1, d: p.z1 - p.z0 + 1, ladders: p.ladders.length })),
      };
    }, [poolLot.id, actor]);
    const vp = venue.pools[0];
    T.check(S, 'the household travels to the Quayside Baths and its pool is there', arrived.done && venue.place?.text === `At ${poolLot.name}` && !!vp && vp.w >= 4 && vp.d >= 4 && vp.ladders >= 2, JSON.stringify({ ...venue, ticks: arrived.ticks }));
    await page.evaluate((id) => window.hearthside.game.view.focusPerson(id), actor);
    await T.frames(24);
    await T.shot('m12-quayside');
    await openMap();
    const homeBtn = page.locator('.nbm-gohome');
    const homeReady = await homeBtn.count() && await homeBtn.first().isEnabled().catch(() => false);
    T.check(S, 'the map has a Go home button at the venue', !!homeReady, '');
    if (homeReady) await T.tap(homeBtn.first());
    await page.waitForSelector('.nbm', { state: 'detached', timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    const back = await runUntil(T, 4 * 120, `st.activeLotId === '${homeId}'`);
    T.check(S, 'the household travels back home again', back.done, JSON.stringify({ ticks: back.ticks, active: await page.evaluate(() => window.hearthside.debug.state().activeLotId) }));
    await T.frames(10);
  }
  await page.evaluate(() => { const g = window.hearthside.game; g.view.setLevel?.(0); g.view.setCutaway?.('cutaway'); });
  await T.shot('m12-end');
}

main().catch((e) => { console.error('[acceptance] error', e); process.exit(1); });
