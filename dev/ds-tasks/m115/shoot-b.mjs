// Task B (Milestone 11.5) visual check: the progress pill above the head while cooking at ~30% and ~90% (green),
// two people doing different actions at once, the completion check, and the "Action progress" setting in Settings,
// in portrait 390x844, landscape 844x390 and desktop 1280x720. Screenshots go to dev/ds-tasks/m115/shots/B/.
//
//   node dev/ds-tasks/m115/shoot-b.mjs
//
// The script takes /tmp/hearthside-browser.lock itself, so do not wrap it in flock. It builds its own copy of the
// game and starts a guided household with autonomy off, so the seeded actions are the only ones running. The game
// clock is paused (speed 0); ticks are advanced explicitly with debug.step.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const PORT = 5196;
const DIST = join(root, 'tests/e2e/out/dist-m115b');
const OUT = join(here, 'shots/B');

// One Chromium at a time across visual scripts. Re-exec under flock once; HEARTHSIDE_M115B_LOCKED marks the child.
if (!process.env.HEARTHSIDE_M115B_LOCKED) {
  const locked = spawnSync('flock', ['/tmp/hearthside-browser.lock', process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_M115B_LOCKED: '1' },
  });
  process.exit(locked.status ?? 1);
}
mkdirSync(OUT, { recursive: true });

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of [join(root, 'node_modules'), '/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try { return require(require.resolve('playwright', { paths: [p] })); } catch { /* next */ }
  }
  throw new Error('playwright is not installed');
}
function launchOptions(chromium) {
  const opts = {};
  if (!existsSync(chromium.executablePath())) {
    const chrome = [process.env.HEARTHSIDE_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && existsSync(p));
    if (chrome) opts.executablePath = chrome;
  }
  return opts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const note = (name, ok, evidence = '') => { log.push({ name, ok, evidence }); console.log(`[m115-b] ${ok ? 'ok  ' : 'FAIL'} ${name}${evidence ? ` — ${evidence}` : ''}`); };

const VIEWPORTS = [
  { id: 'portrait', width: 390, height: 844, mobile: true },
  { id: 'landscape', width: 844, height: 390, mobile: true },
  { id: 'desktop', width: 1280, height: 720, mobile: false },
];

async function waitForServer(url, ms, server) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (server.exitCode !== null) throw new Error(`preview server exited (${server.exitCode})`);
    try { const r = await fetch(url); if (r.ok) return; } catch { /* wait */ }
    await sleep(250);
  }
  throw new Error(`server at ${url} did not start`);
}

const frames = (page, n, dt = 1 / 30) => page.evaluate(([n2, dt2]) => { for (let i = 0; i < n2; i++) window.hearthside.debug.frame(dt2); }, [n, dt]);

async function startGame(page) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
  const started = await page.evaluate(async () => {
    const g = window.hearthside.game;
    const hhs = g.premadeHouseholds();
    const r = await g.startNewGame('guided', hhs.find((h) => h.members.length >= 2) ?? hhs[0]);
    g.setSpeed(0);
    return r;
  });
  if (!started.ok) throw new Error(`startNewGame failed: ${started.reason}`);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.querySelectorAll('.toast, .toasts > *').forEach((t) => t.remove());
    const g = window.hearthside.game;
    g.setMode('live');
    g.setSimSettings({ autonomy: false, visitors: false });
    window.hearthside.debug.step(20);
  });
  await frames(page, 6);
}

/** Queues Cook a Meal on the fridge for a member who is home and advances to the cooking stage. */
async function startCooking(page) {
  const r = await page.evaluate(() => {
    const h = window.hearthside, g = h.game, st = g.state();
    const hh = st.households[st.activeHouseholdId];
    const onLot = (id) => st.people[id]?.location.kind === 'lot';
    const lot = st.lots[st.activeLotId];
    const fridge = Object.values(lot.objects).find((o) => /fridge/.test(o.defId));
    if (!fridge) return { ok: false, reason: 'no fridge' };
    const members = hh.memberIds.filter(onLot);
    for (const id of members) for (const a of [...st.people[id].queue]) g.cancel(id, a.id);
    h.debug.step(2);
    for (const id of members) for (const a of [...st.people[id].queue]) g.cancel(id, a.id);
    let cookId = null, opt = null;
    for (const id of members) {
      const o = g.options(id, { kind: 'object', objectId: fridge.id }).find((x) => x.enabled && x.interactionId === 'cookMeal');
      if (o) { cookId = id; opt = o; break; }
    }
    if (!cookId || !opt) return { ok: false, reason: `no cook option for ${members.join(', ')}` };
    const q = g.queue(cookId, opt);
    if (!q.ok) return { ok: false, reason: q.reason };
    for (let i = 0; i < 600; i++) {
      h.debug.step(1);
      const a = st.people[cookId].queue[0];
      if (!a) return { ok: false, reason: 'cook action ended while starting' };
      if (a.phase === 'perform' && a.data.stage === 1) {
        const p = st.people[cookId];
        const loc = p.location;
        return {
          ok: true, id: cookId, name: `${p.firstName} ${p.lastName}`, duration: a.duration,
          recipeId: a.data.recipeId ?? null, x: loc.kind === 'lot' ? loc.x : 0, z: loc.kind === 'lot' ? loc.z : 0,
        };
      }
    }
    return { ok: false, reason: 'never reached the cooking stage' };
  });
  if (r.ok) {
    // Close the camera in on the cook and let the glide settle (the sim is paused).
    await page.evaluate(([x, z]) => window.hearthside.view.focusOn(x, z, true), [r.x, r.z]);
    await page.waitForTimeout(1100);
  }
  await frames(page, 8);
  return r;
}

/** Sets the cook's perform progress to `fraction` of the whole chain (stages 0-2). */
async function setCookFraction(page, id, fraction) {
  return page.evaluate(([personId, f]) => {
    const st = window.hearthside.debug.state();
    const a = st.people[personId]?.queue[0];
    if (!a || a.phase !== 'perform') return null;
    // The chain plan is [2, duration, 1] minutes; base 2 minutes is already complete at stage 1.
    const total = (a.duration ?? 0) + 3;
    a.elapsed = Math.max(0, Math.min(a.duration ?? 0, f * total - 2));
    return { elapsed: a.elapsed, duration: a.duration };
  }, [id, fraction]);
}

/** Completion check: hold the action in a successful apply so the green pill stays for the screenshot. */
async function showCompletion(page, id) {
  return page.evaluate((personId) => {
    const st = window.hearthside.debug.state();
    const a = st.people[personId]?.queue[0];
    if (!a) return null;
    a.phase = 'apply';
    a.data.result = 'done';
    a.elapsed = a.duration ?? a.elapsed;
    return { phase: a.phase, duration: a.duration };
  }, id);
}

/**
 * Waits until the visible pill has written `pct`, then disables its CSS transition and forces a style flush.
 * SwiftShader at 1280x720 renders slowly enough that a 200 ms colour transition may not have run when the DOM is
 * read/screenshotted; the pill itself (target width/colour) is already at its final state after the write.
 */
async function settleAllPills(page) {
  await page.evaluate(() => {
    for (const fill of document.querySelectorAll('#world-overlay .wo-pill-fill')) {
      fill.style.transition = 'none';
      fill.getBoundingClientRect();
    }
  });
  await frames(page, 2);
}

async function settlePill(page, pct) {
  await page.waitForFunction((p) => {
    const pill = document.querySelector('#world-overlay .wo-pill:not([hidden])');
    return pill?.getAttribute('aria-valuenow') === String(p);
  }, pct, { timeout: 8000 }).catch(() => {});
  await settleAllPills(page);
}

async function pillState(page) {
  return page.evaluate(() => {
    const pills = [...document.querySelectorAll('#world-overlay .wo-pill')]
      .filter((e) => !e.hidden && e.getBoundingClientRect().width > 0)
      .map((e) => {
        const fill = e.querySelector('.wo-pill-fill');
        const r = e.getBoundingClientRect();
        return {
          label: e.getAttribute('aria-label') ?? '', now: e.getAttribute('aria-valuenow') ?? '',
          width: fill?.style.width ?? '', colour: fill ? getComputedStyle(fill).backgroundColor : '',
          done: e.classList.contains('is-done'), cancelled: e.classList.contains('is-cancelled'),
          walking: e.classList.contains('is-walking'),
          x: Math.round(r.x + r.width / 2), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        };
      });
    return { pills, count: pills.length };
  });
}

/** Queues two different object actions for two different people and advances until both are performing. */
async function twoActions(page) {
  const r = await page.evaluate(() => {
    const h = window.hearthside, g = h.game, st = g.state();
    const hh = st.households[st.activeHouseholdId];
    const onLot = (id) => st.people[id]?.location.kind === 'lot';
    const members = hh.memberIds.filter((id) => onLot(id) && st.people[id].location.posture !== 'lying');
    const lot = st.lots[st.activeLotId];
    const objects = Object.values(lot.objects);
    for (const id of members) for (const a of [...st.people[id].queue]) g.cancel(id, a.id);
    h.debug.step(2);
    for (const id of members) for (const a of [...st.people[id].queue]) g.cancel(id, a.id);

    const candidates = [];
    for (const id of members) {
      const loc = st.people[id].location;
      for (const o of objects) {
        const d = Math.hypot((loc.x ?? 0) - o.x, (loc.z ?? 0) - o.z);
        const opts = g.options(id, { kind: 'object', objectId: o.id })
          .filter((x) => x.enabled && x.group === 'object' && x.interactionId !== 'goHere');
        for (const opt of opts) candidates.push({ person: id, objectId: o.id, x: o.x, z: o.z, d, opt });
      }
    }
    candidates.sort((a, b) => a.d - b.d);
    const tries = [];
    for (const a of candidates) {
      for (const b of candidates) {
        if (a.person === b.person || a.objectId === b.objectId || a.opt.interactionId === b.opt.interactionId) continue;
        const dist = Math.hypot(a.x - b.x, a.z - b.z);
        if (dist > 14) continue;
        tries.push([a, b]);
        if (tries.length >= 12) break;
      }
      if (tries.length >= 12) break;
    }
    for (const [a, b] of tries) {
      const qa = g.queue(a.person, a.opt);
      const qb = g.queue(b.person, b.opt);
      if (!qa.ok || !qb.ok) {
        for (const id of [a.person, b.person]) for (const act of [...st.people[id].queue]) g.cancel(id, act.id);
        h.debug.step(2);
        continue;
      }
      for (let i = 0; i < 360; i++) {
        h.debug.step(1);
        const ha = st.people[a.person].queue[0];
        const hb = st.people[b.person].queue[0];
        if (!ha || !hb) break;
        if (ha.phase === 'perform' && hb.phase === 'perform') {
          return {
            ok: true,
            a: { person: a.person, name: st.people[a.person].firstName, action: ha.interactionId },
            b: { person: b.person, name: st.people[b.person].firstName, action: hb.interactionId },
            ticks: i,
          };
        }
        // One action can end before the other starts (a short sit); retry with the next pair.
        if (ha.phase === 'cleanup' || hb.phase === 'cleanup') break;
      }
      for (const id of [a.person, b.person]) for (const act of [...st.people[id].queue]) g.cancel(id, act.id);
      h.debug.step(2);
    }
    return { ok: false, reason: `no pair started (${tries.length} tried)` };
  });
  if (r.ok) {
    await page.evaluate(() => window.hearthside.view.frameLot(true));
    await page.waitForTimeout(350);
  }
  await frames(page, 6);
  return r;
}

async function openSettings(page, mobile) {
  const click = async (loc) => { if (mobile) await loc.tap(); else await loc.click(); };
  await click(page.getByRole('button', { name: 'Menu', exact: true }).first());
  await page.waitForTimeout(500);
  await click(page.getByRole('button', { name: /^Settings/ }).first());
  await page.waitForSelector('.settings-modal', { timeout: 30000 });
  // Let the sheet finish its slide-in before scrolling, and centre the whole field (label + control), not just the
  // segmented control, so the row is readable in the narrow viewport.
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const seg = document.querySelector('.settings-modal .segmented[aria-label="Action progress"]');
    (seg?.closest('.field') ?? seg)?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => {
    const seg = document.querySelector('.settings-modal .segmented[aria-label="Action progress"]');
    const r = seg?.getBoundingClientRect();
    const selected = seg?.querySelector('.seg.is-selected')?.getAttribute('data-id') ?? null;
    const labels = [...(seg?.querySelectorAll('.seg') ?? [])].map((b) => ({ id: b.getAttribute('data-id'), text: b.textContent?.trim() ?? '' }));
    return { exists: !!seg, selected, labels, box: r ? { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) } : null };
  });
  return state;
}

async function main() {
  console.log('[m115-b] building', DIST);
  const build = spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', DIST, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
  if (build.status !== 0) throw new Error('vite build failed');

  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser = null;
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`, 30000, server);
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({ ...launchOptions(chromium), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1,
        ...(vp.mobile ? { isMobile: true, hasTouch: true } : {}),
      });
      await context.addInitScript(() => { try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, musicVolume: 0 })); } catch { /* ignore */ } });
      const page = await context.newPage();
      page.setDefaultTimeout(120_000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await startGame(page);

      const cook = await startCooking(page);
      note(`${vp.id}: cooking starts and reaches the cooking stage`, cook.ok, cook.ok ? `${cook.name} recipe=${cook.recipeId} duration=${cook.duration}` : cook.reason);
      if (!cook.ok) { await context.close(); continue; }

      // ~30% of the whole cook chain.
      const at30 = await setCookFraction(page, cook.id, 0.3);
      await settlePill(page, 30);
      let pills = await pillState(page);
      const p30 = pills.pills[0];
      note(`${vp.id}: cooking at ~30% shows a partially filled amber pill`,
        !!p30 && /%/i.test(p30.label) && parseFloat(p30.width) >= 24 && parseFloat(p30.width) <= 36 &&
          !p30.done && p30.colour.replace(/\s/g, '') !== 'rgb(77,154,91)',
        JSON.stringify({ set: at30, pill: p30 }));
      if (p30) note(`${vp.id}: the pill sits above the head and is phone-sized`, p30.h >= 9 && p30.h <= 14 && p30.w >= 40 && p30.w <= 60, `w=${p30.w} h=${p30.h} at ${p30.x},${p30.y}`);
      await page.screenshot({ path: join(OUT, `cook-30-${vp.id}.png`) });

      // ~90%: green.
      const at90 = await setCookFraction(page, cook.id, 0.9);
      await settlePill(page, 90);
      pills = await pillState(page);
      const p90 = pills.pills[0];
      const green = p90 ? p90.colour.replace(/\s/g, '') : '';
      note(`${vp.id}: cooking at ~90% is green`,
        !!p90 && parseFloat(p90.width) >= 85 && !p90.done && green === 'rgb(77,154,91)',
        JSON.stringify({ set: at90, pill: p90 }));
      await page.screenshot({ path: join(OUT, `cook-90-${vp.id}.png`) });

      // Completion: green with the check.
      await showCompletion(page, cook.id);
      await settlePill(page, 100);
      pills = await pillState(page);
      const pd = pills.pills[0];
      note(`${vp.id}: completion shows the check and the full green pill`,
        !!pd && pd.done && pd.width === '100%' && /complete/i.test(pd.label), JSON.stringify({ pill: pd }));
      await page.screenshot({ path: join(OUT, `done-check-${vp.id}.png`) });
      // Revert the held action so the pair setup starts from a clean queue.
      await page.evaluate(() => {
        const st = window.hearthside.debug.state();
        for (const p of Object.values(st.people)) for (const a of [...p.queue]) window.hearthside.game.cancel(p.id, a.id);
      });
      await page.evaluate(() => window.hearthside.debug.step(3));

      // Two different actions at the same time.
      const pair = await twoActions(page);
      note(`${vp.id}: two people show two different action pills at once`, pair.ok,
        pair.ok ? `${pair.a.name}:${pair.a.action} + ${pair.b.name}:${pair.b.action} (${pair.ticks} ticks)` : pair.reason);
      await settleAllPills(page);
      pills = await pillState(page);
      note(`${vp.id}: both pills are visible with different labels`, pills.count >= 2 && new Set(pills.pills.map((p) => p.label)).size >= 2,
        JSON.stringify(pills.pills));
      await page.screenshot({ path: join(OUT, `two-actions-${vp.id}.png`) });

      // The setting in the options screen.
      const setting = await openSettings(page, vp.mobile);
      note(`${vp.id}: Settings offers the three action-progress scopes`, setting.exists && setting.selected === 'household' &&
        ['household', 'all', 'off'].every((id) => setting.labels.some((l) => l.id === id)),
        JSON.stringify(setting));
      await page.screenshot({ path: join(OUT, `settings-${vp.id}.png`) });
      if (vp.id === 'desktop') {
        const seg = page.locator('.settings-modal .segmented[aria-label="Action progress"] .seg[data-id="off"]');
        await seg.click();
        await page.waitForTimeout(400);
        const off = await page.evaluate(() => ({
          setting: window.hearthside.game.settings().actionProgress,
          visible: [...document.querySelectorAll('#world-overlay .wo-pill')].filter((e) => !e.hidden).length,
        }));
        note('desktop: choosing Off writes the setting and hides the pills', off.setting === 'off' && off.visible === 0, JSON.stringify(off));
        await page.locator('.settings-modal .segmented[aria-label="Action progress"] .seg[data-id="household"]').click();
        await page.waitForTimeout(300);
        const back = await page.evaluate(() => window.hearthside.game.settings().actionProgress);
        note('desktop: choosing Household restores the setting', back === 'household', String(back));
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      note(`${vp.id}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' / '));
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGTERM');
    writeFileSync(join(OUT, 'shots.json'), JSON.stringify(log, null, 2));
  }

  const failed = log.filter((l) => !l.ok);
  console.log(`[m115-b] ${log.length - failed.length}/${log.length} checks passed; screenshots in dev/ds-tasks/m115/shots/B/`);
  if (failed.length) process.exitCode = 1;
}

await main();
