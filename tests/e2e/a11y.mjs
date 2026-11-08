#!/usr/bin/env node
// Milestone 13 accessibility and guidance check (Playwright, headless Chromium with SwiftShader).
//
//   node tests/e2e/a11y.mjs [--no-build] [--only=desktop,portrait,landscape] [--no-lock] [--no-shots]
//
// Per viewport (1280x720 desktop, 390x844 portrait touch, 844x390 landscape touch):
//  - a new game is started and moved into with the KEYBOARD only (Tab, Enter, Esc), with hints on (the default for a new player);
//  - the hint card shows for a new player, Esc and "Got it" mark it seen, "Skip hints" turns hints off, Settings > Help turns
//    them on and "Reset hints" empties the seen list;
//  - panels open from the keyboard, move focus in, close on Esc and give focus back; dialogs trap Tab; tabs use arrow keys;
//  - the keyboard route to the world (person panel > Choose an object) opens an object's action menu;
//  - focus is visible on every stop; every visible button/tab/switch/input has an accessible name on the main screens;
//  - on touch viewports every tap target of those screens is at least 44 x 44 px;
//  - UI scale 150 % and high contrast apply (and the HUD still fits); reduced motion follows the OS setting;
//  - a low need is shown with a word as well as colour.
// Screenshots (PNG, device scale 1) go to dev/shots/m13a/. Like the other e2e scripts it runs under /tmp/hearthside-browser.lock.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5193;
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };

if (!process.env.HEARTHSIDE_E2E_LOCKED && !flag('no-lock')) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...args], { stdio: 'inherit', env: { ...process.env, HEARTHSIDE_E2E_LOCKED: '1' } });
  process.exit(r.status ?? 1);
}

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of [join(root, 'node_modules'), '/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try { return require(require.resolve('playwright', { paths: [p] })); } catch { /* next */ }
  }
  throw new Error('playwright is not installed');
}
function launchOptions(chromium) {
  const o = {};
  if (!existsSync(chromium.executablePath())) {
    const c = [process.env.HEARTHSIDE_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && existsSync(p));
    if (c) o.executablePath = c;
  }
  return o;
}

const DIST = join(root, 'tests/e2e/out/dist');
const OUT = join(root, 'tests/e2e/out/a11y');
const SHOTS = join(root, 'dev/shots/m13a');
const ONLY = opt('only', 'desktop,portrait,landscape').split(',');
const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
mkdirSync(OUT, { recursive: true });
if (!flag('no-shots')) mkdirSync(SHOTS, { recursive: true });

const results = [];
const T0 = Date.now();
const log = (...a) => console.log(`[a11y +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(vp, name, ok, evidence = '') { results.push({ vp, name, ok: !!ok, evidence }); log(`${ok ? 'PASS' : 'FAIL'} [${vp}] ${name}${!ok && evidence ? ` -- ${evidence}` : ''}`); return !!ok; }

async function waitForServer(url, ms, server, owner) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (server.exitCode !== null) throw new Error(`preview server exited (${server.exitCode})`);
    try {
      const r = await fetch(`${url}__e2e-owner.txt`);
      if (r.ok) { if ((await r.text()).trim() !== owner) throw new Error(`port ${PORT} is held by another server`); return; }
    } catch (e) { if (!/fetch failed|ECONNREFUSED/.test(String(e))) throw e; }
    await sleep(250);
  }
  throw new Error('server did not start');
}

// ---- in-page helpers (strings evaluated in the page) ----------------------------------------------------------------------

const PAGE_HELPERS = () => {
  const vis = (e) => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]') && cs.opacity !== '0';
  };
  const textOf = (n) => {
    if (n.nodeType === 3) return n.textContent;
    if (n.nodeType !== 1 || n.getAttribute('aria-hidden') === 'true' || n.hidden) return '';
    return [...n.childNodes].map(textOf).join(' ');
  };
  const nameOf = (e) => {
    const al = e.getAttribute('aria-label'); if (al && al.trim()) return al.trim();
    const lb = e.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim(); if (t) return t; }
    if (e.labels && e.labels.length) { const t = [...e.labels].map((l) => textOf(l)).join(' ').trim(); if (t) return t; }
    const label = e.closest('label'); if (label) { const t = textOf(label).trim(); if (t) return t; }
    const t = textOf(e).replace(/\s+/g, ' ').trim(); if (t) return t;
    const ti = e.getAttribute('title'); if (ti && ti.trim()) return ti.trim();
    return '';
  };
  const desc = (e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`;
  window.__a11y = {
    vis, nameOf,
    unnamed() {
      const bad = [];
      for (const e of document.querySelectorAll('button, [role=button], [role=tab], [role=radio], [role=switch], [role=menuitem], a[href], input:not([type=hidden]), select, textarea, summary')) {
        if (!vis(e) || e.closest('[aria-hidden="true"]')) continue;
        if (!nameOf(e)) bad.push(desc(e));
      }
      return [...new Set(bad)];
    },
    small() {
      const bad = [];
      for (const e of document.querySelectorAll('button, [role=tab], [role=radio], select, input:not([type=color]):not([type=checkbox]):not([type=hidden]), summary')) {
        if (!vis(e)) continue;
        const r = e.getBoundingClientRect();
        if (r.width < 43.5 || r.height < 43.5) bad.push(`${desc(e)}"${nameOf(e).slice(0, 18)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return [...new Set(bad)];
    },
    focus() {
      const a = document.activeElement;
      if (!a || a === document.body) return { none: true };
      const cs = getComputedStyle(a), r = a.getBoundingClientRect();
      return {
        tag: a.tagName.toLowerCase(), cls: String(a.className).split(' ')[0], name: nameOf(a).slice(0, 40), id: a.id,
        ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 && cs.outlineColor !== 'rgba(0, 0, 0, 0)',
        inView: r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth,
        insideModal: !!a.closest('.modal'), insidePanel: !!a.closest('.panel'),
      };
    },
  };
};

async function main() {
  if (!flag('no-build') || !existsSync(join(DIST, 'index.html'))) {
    log('building...');
    const b = spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', DIST, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
    if (b.status !== 0) throw new Error('vite build failed');
  }
  const owner = `${process.pid}-${Date.now()}`;
  writeFileSync(join(DIST, '__e2e-owner.txt'), owner);
  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser = null;
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`, 20000, server, owner);
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({ ...launchOptions(chromium), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
    for (const name of ONLY) {
      if (!VIEWPORTS[name]) continue;
      log(`=== ${name}`);
      try { await runViewport(browser, name, VIEWPORTS[name]); } catch (e) { check(name, 'viewport run completed', false, String(e?.stack ?? e).split('\n').slice(0, 5).join(' | ')); }
    }
    try { await runReducedMotion(browser); } catch (e) { check('desktop', 'reduced motion run completed', false, String(e?.message ?? e)); }
  } finally {
    await browser?.close().catch(() => undefined);
    server.kill('SIGTERM');
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ results }, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n[a11y] ${results.length - failed.length} passed, ${failed.length} failed`);
  for (const f of failed) console.error(` FAIL [${f.vp}] ${f.name}: ${f.evidence}`);
  process.exit(failed.length ? 1 : 0);
}

async function newPage(browser, vp, settings, extra = {}) {
  const context = await browser.newContext({ ...vp, ...extra });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.addInitScript((s) => { try { if (!localStorage.getItem('hearthside.settings.v1')) localStorage.setItem('hearthside.settings.v1', JSON.stringify(s)); } catch { /* ignore */ } }, settings);
  await page.addInitScript(PAGE_HELPERS);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
  await page.evaluate(PAGE_HELPERS); // addInitScript runs before the document exists on some engines: make sure
  await page.waitForTimeout(800);
  return { context, page, errors };
}

async function runReducedMotion(browser) {
  const { context, page } = await newPage(browser, VIEWPORTS.desktop, { musicVolume: 0, hints: false }, { reducedMotion: 'reduce' });
  const s = await page.evaluate(() => ({ setting: window.hearthside.game.settings().reducedMotion, cls: document.documentElement.classList.contains('reduced-motion'), dur: parseFloat(getComputedStyle(document.querySelector('.btn') ?? document.body).transitionDuration) }));
  check('desktop', 'prefers-reduced-motion turns the Reduce motion setting on', s.setting === true && s.cls, JSON.stringify(s));
  check('desktop', 'with reduced motion UI transitions are effectively off', !(s.dur > 0.001), JSON.stringify(s));
  await context.close();
}

async function runViewport(browser, name, vp) {
  const touch = !!vp.hasTouch;
  const { context, page, errors } = await newPage(browser, vp, { musicVolume: 0 }); // hints stay on: a real new player
  const S = (label) => (flag('no-shots') ? undefined : page.screenshot({ path: join(SHOTS, `${name}-${label}.png`) }));
  const key = (k) => page.keyboard.press(k);
  const focus = () => page.evaluate(() => window.__a11y.focus());
  const settings = () => page.evaluate(() => window.hearthside.game.settings());
  const modeNow = () => page.evaluate(() => window.hearthside.game.mode());
  const focusRings = [];
  /** Presses Tab until the focused element's name matches; records whether the focus ring is visible on every stop. */
  const tabTo = async (re, max = 120) => {
    for (let i = 0; i < max; i++) {
      await key('Tab');
      const f = await focus();
      if (!f.none) { focusRings.push({ ok: f.ring && f.inView, at: `${f.cls}:${f.name}` }); if (re.test(f.name)) return f; }
    }
    return null;
  };
  const names = async (label) => { const bad = await page.evaluate(() => window.__a11y.unnamed()); check(name, `no unnamed controls: ${label}`, bad.length === 0, bad.join(', ')); };
  const targets = async (label) => { if (!touch) return; const bad = await page.evaluate(() => window.__a11y.small()); check(name, `tap targets >= 44 px: ${label}`, bad.length === 0, bad.slice(0, 8).join('; ')); };
  const audit = async (label) => { await names(label); await targets(label); };

  // ---------- main menu, keyboard only ----------
  await audit('main menu');
  const nb = await tabTo(/^New Game/);
  check(name, 'Tab reaches New Game with a visible focus ring', !!nb && nb.ring, JSON.stringify(nb));
  await key('Enter');
  await page.waitForSelector('.menu-view[data-view="new"]', { timeout: 10000 });
  const cb = await tabTo(/Create a Household/);
  check(name, 'Tab reaches Create a Household', !!cb, JSON.stringify(cb));
  await key('Enter');
  await page.waitForSelector('.cr-toolbar, .cr-top', { timeout: 60000 });
  await page.waitForTimeout(1500);
  const hintCreator = await page.evaluate(() => { const c = document.querySelector('.hint-card'); return c && !c.hidden ? c.dataset.hint : null; });
  check(name, 'a new player sees the "creating a household" hint in the creator', hintCreator === 'household', String(hintCreator));
  await S('creator-hint');
  await audit('creator step 1');
  await key('Escape');
  await page.waitForTimeout(300);
  const afterEsc = await page.evaluate(() => ({ shown: !!document.querySelector('.hint-card:not([hidden])'), seen: window.hearthside.game.settings().seenHints }));
  check(name, 'Esc hides the hint and counts it as seen', !afterEsc.shown && afterEsc.seen.includes('household'), JSON.stringify(afterEsc));

  // ---------- creator and move in, keyboard only ----------
  let moved = false;
  for (let step = 0; step < 9 && !moved; step++) {
    const f = await tabTo(/^(Next:|Move In)/, 260);
    if (!f) break;
    const isMove = /^Move In/.test(f.name);
    if (step === 3) await audit('creator step 4');
    await key('Enter');
    if (isMove) { moved = true; break; }
    await page.waitForTimeout(500);
  }
  check(name, 'the creator can be completed with Tab and Enter alone', moved, '');
  await page.waitForFunction(() => window.hearthside.game.mode() === 'live', null, { timeout: 120000 }).catch(() => undefined);
  check(name, 'the household moved in (Live mode)', (await modeNow()) === 'live', await modeNow());
  await page.evaluate(() => window.hearthside.game.setSpeed(0));
  await page.waitForSelector('.hint-card:not([hidden])', { timeout: 10000 }).catch(() => undefined);
  const moveIn = await page.evaluate(() => { const c = document.querySelector('.hint-card'); return c && !c.hidden ? c.dataset.hint : null; });
  check(name, 'the "moving in" hint appears for a new player', moveIn === 'moveIn', String(moveIn));
  await S('movein-hint');
  await key('Escape');
  await page.waitForTimeout(300);
  const nextHint = await page.evaluate(() => document.querySelector('.hint-card:not([hidden])')?.dataset.hint ?? null);
  check(name, 'Esc closes the hint card and marks it seen (the next one may follow)', (await settings()).seenHints.includes('moveIn') && nextHint !== 'moveIn', JSON.stringify([(await settings()).seenHints, nextHint]));

  // ---------- panels: Esc, focus in and back ----------
  await audit('live HUD');
  await page.locator('.feed-btn').focus();
  await key('Enter');
  await page.waitForTimeout(400);
  const fp = await focus();
  check(name, 'the Feed panel opens from the keyboard and focus moves into it', (await page.locator('.panel:not([hidden])').count()) === 1 && fp.insidePanel, JSON.stringify(fp));
  await audit('feed panel');
  await key('Escape');
  await page.waitForTimeout(300);
  const fb = await focus();
  check(name, 'Esc closes the panel and focus returns to the Feed button', (await page.locator('.panel:not([hidden])').count()) === 0 && /feed/i.test(fb.name || ''), JSON.stringify(fb));

  // person panel via the portrait button (select, then again)
  await page.locator('.member').first().focus();
  await key('Enter'); await page.waitForTimeout(300);
  await key('Enter'); await page.waitForTimeout(500);
  check(name, 'the person panel opens from the keyboard', (await page.locator('.person-panel:not([hidden])').count()) === 1, '');
  const tabsInfo = await page.evaluate(() => [...document.querySelectorAll('.person-panel [role=tab]')].map((t) => ({ sel: t.getAttribute('aria-selected'), ti: t.tabIndex })));
  check(name, 'tabs have role=tab, aria-selected and a single tab stop', tabsInfo.length >= 5 && tabsInfo.filter((t) => t.sel === 'true').length === 1 && tabsInfo.filter((t) => t.ti === 0).length === 1, JSON.stringify(tabsInfo));
  await page.locator('.person-panel [role=tab][aria-selected=true]').focus();
  await key('ArrowRight'); await page.waitForTimeout(300);
  const second = await page.evaluate(() => document.querySelector('.person-panel [role=tab][aria-selected=true]')?.textContent?.trim());
  check(name, 'ArrowRight moves to the next tab (Queue)', /Queue/i.test(second || ''), String(second));
  await audit('person panel: queue');
  await S('person-queue');
  // keyboard route to the world
  await page.getByRole('button', { name: 'Choose an object' }).focus();
  await key('Enter');
  await page.waitForSelector('.modal', { timeout: 5000 });
  const rows = await page.locator('.modal .row-btn').count();
  check(name, 'Choose an object lists objects with actions', rows > 0, String(rows));
  await audit('object picker');
  await key('Enter');
  await page.waitForTimeout(600);
  check(name, 'choosing an object opens its action menu', (await page.locator('.ctx-menu:not([hidden])').count()) === 1, '');
  await audit('action menu');
  await S('ctx-menu-keyboard');
  await key('Escape');
  await page.waitForTimeout(300);
  check(name, 'Esc closes the action menu and focus returns to Choose an object', (await page.locator('.ctx-menu:not([hidden])').count()) === 0 && /Choose an object/.test((await focus()).name || ''), JSON.stringify(await focus()));
  // needs tab: words for low needs
  await page.locator('.person-panel [role=tab]').first().click();
  await page.evaluate(() => { const st = window.hearthside.debug.state(); const id = window.hearthside.game.selected(); st.people[id].needs.hunger = 8; st.people[id].needs.energy = 30; });
  await page.waitForTimeout(700);
  const meters = await page.evaluate(() => [...document.querySelectorAll('.person-panel .meter')].map((m) => ({ l: m.dataset.level, v: m.querySelector('.meter-value')?.textContent, vt: m.getAttribute('aria-valuetext') })));
  check(name, 'a critical need says "Critical" and a low need "Low" in text', meters.some((m) => m.l === 'critical' && /Critical/.test(m.v)) && meters.some((m) => m.l === 'low' && /Low/.test(m.v)) && meters.every((m) => m.vt), JSON.stringify(meters));
  await audit('person panel: needs');
  await S('needs-words');
  await key('Escape'); await page.waitForTimeout(300);
  check(name, 'Esc closes the person panel', (await page.locator('.person-panel:not([hidden])').count()) === 0, '');

  // ---------- menu dialog: focus trap, Esc, return ----------
  const menuBtn = page.locator('.menu-btn');
  await menuBtn.focus();
  await key('Enter');
  await page.waitForSelector('.game-menu', { timeout: 5000 });
  await audit('game menu');
  let escaped = false;
  for (let i = 0; i < 30; i++) { await key('Tab'); const f = await focus(); if (f.none || !f.insideModal) { escaped = true; break; } }
  check(name, 'Tab stays inside the open dialog (30 presses)', !escaped, '');
  let escapedBack = false;
  for (let i = 0; i < 6; i++) { await key('Shift+Tab'); const f = await focus(); if (f.none || !f.insideModal) { escapedBack = true; break; } }
  check(name, 'Shift+Tab stays inside the dialog too', !escapedBack, '');
  await key('Escape'); await page.waitForTimeout(300);
  const mb = await focus();
  check(name, 'Esc closes the dialog and focus returns to the Menu button', (await page.locator('.modal').count()) === 0 && /menu/i.test(mb.name || ''), JSON.stringify(mb));

  // ---------- Help ----------
  await menuBtn.focus(); await key('Enter');
  await page.waitForSelector('.game-menu');
  await page.getByRole('button', { name: /^Help/ }).click();
  await page.waitForSelector('.help-modal');
  await audit('help: how to play');
  const topics = await page.locator('.help-topic').count();
  check(name, 'Help has a topic for every first-run situation', topics >= 10, String(topics));
  await page.locator('.help-modal [role=tab][aria-selected=true]').focus();
  await key('ArrowRight'); await page.waitForTimeout(200);
  const controls = await page.evaluate(() => ({ visible: !document.querySelector('.help-controls-wrap').hidden, text: document.querySelector('.help-controls-wrap').innerText }));
  check(name, 'Help > Controls lists touch and keyboard controls', controls.visible && /Pinch/.test(controls.text) && /Space/.test(controls.text) && /Esc/.test(controls.text), controls.text.slice(0, 80));
  await audit('help: controls');
  await S('help-controls');
  await key('Escape'); await page.waitForTimeout(300);

  // ---------- Settings: UI scale, high contrast, hints ----------
  await menuBtn.focus(); await key('Enter');
  await page.waitForSelector('.game-menu');
  await page.getByRole('button', { name: /^Settings/ }).click();
  await page.waitForSelector('.settings-modal');
  await audit('settings');
  const scaleGroup = page.locator('.settings-modal [role=radiogroup][aria-label^="UI scale"]');
  await scaleGroup.locator('[role=radio][aria-checked=true]').focus();
  for (let i = 0; i < 3; i++) { await key('ArrowRight'); await page.waitForTimeout(120); } // 100 > 115 > 130 > 150
  const sc = await page.evaluate(() => ({ s: window.hearthside.game.settings().textScale, fs: getComputedStyle(document.documentElement).fontSize }));
  check(name, 'UI scale 150 % is reachable with the arrow keys and applied (root font 24 px)', sc.s === 1.5 && sc.fs === '24px', JSON.stringify(sc));
  const hc = page.locator('.settings-modal .switch[aria-label="High contrast"]');
  await hc.focus(); await key('Space'); await page.waitForTimeout(200);
  const hcs = await page.evaluate(() => ({ on: window.hearthside.game.settings().highContrast, cls: document.documentElement.classList.contains('high-contrast'), ink: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() }));
  check(name, 'High contrast switches on from the keyboard and applies (black ink)', hcs.on && hcs.cls && hcs.ink === '#000000', JSON.stringify(hcs));
  await S('settings-scale150-contrast');
  await key('Escape'); await page.waitForTimeout(400);
  await page.evaluate(() => window.hearthside.game.view.frameLot?.(true));
  await page.waitForTimeout(500);
  const fit = await page.evaluate(() => {
    const bad = [];
    for (const s of ['.hud-top', '.hud-bottom']) { const e = document.querySelector(s); if (e && !e.hidden) { const r = e.getBoundingClientRect(); if (e.scrollWidth > e.clientWidth + 2 || r.right > innerWidth + 1 || r.left < -1) bad.push(`${s} ${e.scrollWidth}>${e.clientWidth} right ${Math.round(r.right)}`); } }
    if (document.scrollingElement.scrollWidth > innerWidth + 1) bad.push('page scrolls sideways');
    return bad;
  });
  check(name, 'at UI scale 150 % with high contrast the top and bottom bars still fit the screen', fit.length === 0, fit.join('; '));
  await S('hud-scale150-contrast');
  await audit('HUD at 150 % and high contrast');
  // back to normal
  await page.evaluate(() => window.hearthside.game.setSettings({ textScale: 1, highContrast: false }));
  const back = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  check(name, 'UI scale 100 % restores the 16 px root font', back === '16px', back);

  // hints: Reset hints, then Skip hints
  await menuBtn.focus(); await key('Enter');
  await page.waitForSelector('.game-menu');
  await page.getByRole('button', { name: /^Settings/ }).click();
  await page.waitForSelector('.settings-modal');
  const hintsSw = page.locator('.settings-modal .switch[aria-label="Hints"]');
  check(name, 'Settings > Help has a Hints switch that is on', (await hintsSw.getAttribute('aria-checked')) === 'true', '');
  await page.getByRole('button', { name: 'Reset hints' }).focus();
  await key('Enter'); await page.waitForTimeout(300);
  const rs = await settings();
  check(name, 'Reset hints empties the seen list and turns hints on', rs.hints === true && rs.seenHints.length === 0, JSON.stringify(rs.seenHints));
  await key('Escape'); await page.waitForTimeout(300);
  await page.evaluate(() => window.hearthside.game.setMode('buy'));
  await page.waitForTimeout(2200);
  const buyHint = await page.evaluate(() => { const c = document.querySelector('.hint-card'); return c && !c.hidden ? c.dataset.hint : null; });
  check(name, 'entering Buy mode shows its hint (the first still unseen in the queue shows first)', ['buy', 'moveIn', 'needs'].includes(buyHint), String(buyHint));
  // dismiss until the buy hint, then skip
  for (let i = 0; i < 4; i++) {
    const cur = await page.evaluate(() => document.querySelector('.hint-card:not([hidden])')?.dataset.hint ?? null);
    if (!cur || cur === 'buy') break;
    await page.getByRole('button', { name: 'Got it' }).click(); await page.waitForTimeout(900);
  }
  await S('buy-hint');
  await audit('buy mode with a hint');
  await page.getByRole('button', { name: 'Skip hints' }).click();
  await page.waitForTimeout(300);
  check(name, 'Skip hints hides the card and turns hints off', !(await page.locator('.hint-card:not([hidden])').count()) && (await settings()).hints === false, '');
  await page.evaluate(() => window.hearthside.game.setMode('live'));
  await page.evaluate(() => window.hearthside.game.setMode('build'));
  await page.waitForSelector('.bb-build-panel:not([hidden])', { timeout: 60000 });
  await page.waitForTimeout(1800);
  check(name, 'with hints off no hint appears when Build opens', (await page.locator('.hint-card:not([hidden])').count()) === 0, '');
  await audit('build mode');
  await page.evaluate(() => window.hearthside.game.setMode('live'));

  // map
  await page.locator('.map-btn').focus(); await key('Enter');
  await page.waitForSelector('.nbm', { timeout: 10000 });
  await audit('neighbourhood map');
  await key('Escape'); await page.waitForTimeout(300);
  check(name, 'Esc closes the map and focus returns to the Map button', (await page.locator('.nbm').count()) === 0 && /map/i.test((await focus()).name || ''), JSON.stringify(await focus()));

  const bad = focusRings.filter((f) => !f.ok);
  check(name, `a visible focus ring on every keyboard stop (${focusRings.length} stops)`, bad.length === 0, bad.slice(0, 6).map((b) => b.at).join('; '));
  check(name, 'no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
