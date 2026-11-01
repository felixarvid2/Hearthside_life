// Focused visual check for Milestone 2 (standalone wall, erase + cost preview) and Milestones 4-5 (dirty and broken
// overlays, the event goal card in landscape with the tutorial open). Not part of `npm test`; it drives a real page.
//
//   npm run visual:m5        (self-locks /tmp/hearthside-browser.lock, serves tests/e2e/out/dist on port 5192)
//
// Screenshots and a JSON log go to tests/e2e/out/visual-m5/.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5192;
const args = process.argv.slice(2);
if (!process.env.HEARTHSIDE_VISUAL_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...args], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_VISUAL_LOCKED: '1' },
  });
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
  const opts = {};
  if (!existsSync(chromium.executablePath())) {
    const chrome = [process.env.HEARTHSIDE_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && existsSync(p));
    if (chrome) opts.executablePath = chrome;
  }
  return opts;
}

const OUT = join(root, 'tests/e2e/out/visual-m5');
const DIST = join(root, 'tests/e2e/out/dist');
mkdirSync(OUT, { recursive: true });
const log = { checks: [], shots: [] };
const check = (name, ok, evidence) => { log.checks.push({ name, ok, evidence }); console.log(`[visual] ${ok ? 'ok  ' : 'FAIL'} ${name}${evidence ? ` — ${evidence}` : ''}`); };

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
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('run `npm run e2e` first: tests/e2e/out/dist is missing');
  const owner = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(join(DIST, '__e2e-owner.txt'), owner);
  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser = null;
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`, 20000, server, owner);
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({ ...launchOptions(chromium), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await context.addInitScript(() => {
      try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: true, musicVolume: 0 })); } catch { /* ignore */ }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}${m.location()?.url ? ` @ ${m.location().url}` : ''}`); });
    page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
    await page.waitForTimeout(800);
    const frames = (n) => page.evaluate((k) => { for (let i = 0; i < k; i++) window.hearthside.debug.frame(1 / 30); }, n);
    const shot = async (name) => {
      await page.screenshot({ path: join(OUT, `${name}.png`) });
      log.shots.push(`${name}.png`);
      console.log(`[visual] shot ${name}`);
    };

    const started = await page.evaluate(async () => {
      const g = window.hearthside.game;
      const hhs = g.premadeHouseholds();
      const r = await g.startNewGame('guided', hhs.find((h) => h.members.length >= 2) ?? hhs[0]);
      g.setSpeed(0);
      return r;
    });
    if (!started.ok) throw new Error(`startNewGame failed: ${started.reason}`);
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
    await frames(6);
    log.images = await page.evaluate(() => [...document.images].map((i) => ({ src: i.src.slice(0, 48), naturalWidth: i.naturalWidth, visible: i.offsetParent !== null })));
    // Which large UI boxes are on screen at the start (to identify panels that look like a floor plan in screenshots).
    log.panels = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      const named = /(panel|card|hud|sheet|overlay|plan|map|preview|popover|inset|tracker|menu)/i.test(`${el.className} ${el.id}`);
      return named && el.offsetParent !== null && !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 60 && r.height > 40;
    }).map((el) => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName, id: el.id, cls: el.className?.toString().slice(0, 90), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], text: el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 100) };
    }).slice(0, 60));

    // ---- Milestone 2: standalone wall, cost preview, erase, undo and redo through the Build API ----
    const build = await page.evaluate(() => {
      const h = window.hearthside, g = h.game;
      const walls = () => Object.keys(g.state().lots[g.state().activeLotId].walls).length;
      g.setMode('build');
      const before = walls();
      // a standalone wall on the empty north strip (the same area acceptance step 7 uses for a room)
      g.setBuildTool({ kind: 'wall', shape: 'run' });
      const wallPreview = g.buildPreview({ from: { x: 8, z: 1 }, to: { x: 14, z: 1 }, level: 0 });
      const wallApplied = g.buildApply({ from: { x: 8, z: 1 }, to: { x: 14, z: 1 }, level: 0 });
      const afterWall = walls();
      const undone = g.undo();
      const afterUndo = walls();
      const redone = g.redo();
      const afterRedo = walls();
      // preview demolishing one existing wall piece that has no door or window
      const st = g.state(), lot = st.lots[st.activeLotId];
      const wallId = Object.keys(lot.walls).find((id) => !g.openingAt(id)) ?? Object.keys(lot.walls)[0];
      const [level, dir, xs, zs] = wallId.split(':');
      const x = Number(xs) + (dir === 'h' ? 0.5 : 0), z = Number(zs) + (dir === 'v' ? 0.5 : 0);
      g.setBuildTool({ kind: 'eraseWall', shape: 'segment' });
      const erasePreview = g.buildPreview({ from: { x, z }, wallId, level: Number(level) });
      return { before, wallPreview, wallApplied, afterWall, undone, afterUndo, redone, afterRedo, wallId, erasePreview, wallsAfterWall: afterRedo };
    });
    await page.evaluate(() => window.hearthside.view.frameLot(true));
    await frames(8);
    check('wall tool previews a six-piece standalone wall with a price', !!build.wallPreview?.ok && build.wallPreview.cost > 0, JSON.stringify({ ok: build.wallPreview?.ok, cost: build.wallPreview?.cost }));
    check('building the wall adds wall pieces', build.wallApplied.ok && build.afterWall > build.before, `${build.before} -> ${build.afterWall} (undone ${build.afterUndo}, redone ${build.afterRedo})`);
    check('undo takes the wall back and redo puts it back', build.afterUndo === build.before && build.afterRedo === build.afterWall, `${build.afterUndo} / ${build.afterRedo}`);
    check('the erase tool previews demolishing a wall piece', !!build.erasePreview?.ok && !build.erasePreview.unchanged && /Demolish/i.test(build.erasePreview?.label ?? ''), JSON.stringify({ ok: build.erasePreview?.ok, label: build.erasePreview?.label, cost: build.erasePreview?.cost }));
    await shot('build-erase-preview');
    const erased = await page.evaluate((wallId) => {
      const g = window.hearthside.game, st = g.state();
      const [level, dir, xs, zs] = wallId.split(':');
      const x = Number(xs) + (dir === 'h' ? 0.5 : 0), z = Number(zs) + (dir === 'v' ? 0.5 : 0);
      const before = Object.keys(st.lots[st.activeLotId].walls).length;
      const r = g.buildApply({ from: { x, z }, wallId, level: Number(level) });
      return { r, before, after: Object.keys(g.state().lots[g.state().activeLotId].walls).length };
    }, build.wallId);
    check('applying the erase tool demolishes the wall piece', erased.r.ok && erased.after === erased.before - 1, `${erased.before} -> ${erased.after}`);
    await page.evaluate(() => { const g = window.hearthside.game; g.undo(); g.undo(); g.setBuildTool(null); g.setMode('live'); });
    await page.waitForTimeout(500);
    await frames(4);

    // ---- Milestone 4: dirt (grime + stink) and broken (warning, sparks or puddle) overlays ----
    const seeded = await page.evaluate(() => {
      const h = window.hearthside, g = h.game, st = g.state(), lot = st.lots[st.activeLotId];
      const objs = Object.values(lot.objects);
      const pick = (tag) => objs.find((o) => (g.content.objects[o.defId]?.tags ?? []).includes(tag));
      const fridge = objs.find((o) => o.defId === 'fridge-standard') ?? pick('appliance') ?? objs[0];
      const sink = pick('plumbing') ?? objs.find((o) => o !== fridge);
      const seat = objs.find((o) => o !== fridge && o !== sink) ?? objs[1];
      const set = (o, dirt, broken) => { if (o) { o.condition = { ...(o.condition ?? {}), dirt, broken }; } return o && { id: o.id, defId: o.defId, x: o.x, z: o.z }; };
      const a = set(fridge, 0.85, true);
      const b = set(sink, 0.7, true);
      const c = set(seat, 0.9, false);
      h.view.objectConditionChanged();
      const focus = b ?? a ?? c;
      h.view.rig.glideTo((focus?.x ?? 10) + 0.5, (focus?.z ?? 10) + 0.5, 62, 0);
      return { a, b, c };
    });
    await frames(12);
    check('objects carry dirt/broken condition for the overlays', !!(seeded.a || seeded.b || seeded.c), JSON.stringify(seeded));
    await shot('condition-overlays');

    // ---- Milestone 4: dirty dishes on a counter and floor messes (puddle, crumbs) ----
    const housekeeping = await page.evaluate(() => {
      const h = window.hearthside, g = h.game, st = g.state(), lot = st.lots[st.activeLotId], now = st.clock.minutes;
      const objs = Object.values(lot.objects);
      const counter = objs.find((o) => {
        const d = g.content.objects[o.defId];
        return (d?.surfaceHeight ?? 0) >= 0.85 && (d?.tags ?? []).some((t) => ['counter', 'surface', 'table', 'dining'].includes(t));
      }) ?? objs.find((o) => (g.content.objects[o.defId]?.surfaceHeight ?? 0) >= 0.85);
      const base = counter ?? objs[0];
      const mk = (id, kind, position, recipeId, portions, quality) => ({
        id, kind, lotId: lot.id, position, recipeId, portions, quality,
        createdAt: now, spoilsAt: now + 365 * 1440, ownerHouseholdId: st.activeHouseholdId,
      });
      const dishPos = counter ? { x: counter.x + 0.5, z: counter.z + 0.5, level: 0, onObjectId: counter.id } : { x: base.x + 0.5, z: base.z + 0.5, level: 0 };
      st.items.itm_vis_dishes = mk('itm_vis_dishes', 'dishes', dishPos, 'pasta-tomato', 4, 1);
      st.items.itm_vis_mess = mk('itm_vis_mess', 'mess', { x: base.x + 1.5, z: base.z + 1.5, level: 0 }, 'puddle', 1, 0.8);
      st.items.itm_vis_crumbs = mk('itm_vis_crumbs', 'mess', { x: base.x + 2.5, z: base.z + 0.5, level: 0 }, 'crumbs', 1, 0.5);
      h.view.itemsChanged();
      h.view.rig.glideTo(base.x + 1.2, base.z + 1.2, 46, 0);
      return { counter: base.id, dishes: dishPos, items: Object.keys(st.items).length };
    });
    await frames(14);
    check('dirty dishes and floor messes were added to the lot', housekeeping.items >= 3, JSON.stringify(housekeeping));
    await shot('dirty-dishes-and-messes');

    // ---- Milestone 5: plan a visit and show the goal card on the HUD with the tutorial open ----
    const planned = await page.evaluate(() => {
      const h = window.hearthside, g = h.game, st = g.state();
      const hh = st.households[st.activeHouseholdId];
      const host = hh.memberIds.map((id) => st.people[id]).find((p) => ['youngAdult', 'adult', 'elder'].includes(p.lifeStage));
      if (!host) return { ok: false, reason: 'no adult host' };
      const guest = Object.values(st.people).find((p) => p.householdId !== hh.id && !st.households[p.householdId]?.isPlayable);
      if (!guest) return { ok: false, reason: 'no outside person' };
      // a visit does not need prior familiarity, but the guest must be at their own home
      if (guest.location.kind !== 'offlot') guest.location = { kind: 'offlot', place: 'home' };
      const startAt = st.clock.minutes + 3;
      const req = { type: 'visit', hostId: host.id, guestIds: [guest.id], startAt };
      const problem = g.eventProblem?.(req);
      if (problem) return { ok: false, reason: problem, host: host.id, guest: guest.id };
      const r = g.planEvent(req);
      return { ok: r.ok, reason: r.reason, eventId: r.eventId, host: host.id, guest: guest.id, guestName: guest.firstName, startAt };
    });
    check('a visit can be planned from the game API', planned.ok, JSON.stringify(planned));
    if (planned.ok) {
      const run = await page.evaluate(() => {
        const h = window.hearthside, g = h.game;
        let ev = null;
        for (let i = 0; i < 60; i++) {
          h.debug.step(4);
          ev = (g.state().homeEvents ?? []).find((e) => e.status === 'running' || e.status === 'invited');
          if (ev?.status === 'running') break;
        }
        // let the guest arrive and the goals tick once
        for (let i = 0; i < 56; i++) h.debug.step(2);
        h.debug.frame(1 / 30);
        return { status: ev?.status, eventId: ev?.id };
      });
      await page.waitForTimeout(900);
      await frames(6);
      const state = await page.evaluate(() => {
        const tracker = document.querySelector('.ev-tracker');
        const tut = document.querySelector('.tutorial-card');
        const rect = (el) => {
          if (!el || el.hidden) return null;
          const b = el.getBoundingClientRect();
          return { top: b.top, left: b.left, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
        };
        return {
          tracker: tracker && !tracker.hidden ? { text: tracker.textContent.replace(/\s+/g, ' ').trim().slice(0, 240), rect: rect(tracker), collapsed: tracker.classList.contains('is-collapsed') } : null,
          tutorial: tut && !tut.hidden ? { rect: rect(tut), text: tut.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) } : null,
          view: { w: innerWidth, h: innerHeight },
        };
      });
      state.status = run.status;
      state.eventId = run.eventId;
      log.event = state;
      check('the event starts and the goal card appears', state.status === 'running' && !!state.tracker, JSON.stringify({ status: state.status, tracker: !!state.tracker }));
      if (state.tracker) {
        const r = state.tracker.rect, t = state.tutorial?.rect;
        const inside = r && r.top >= 0 && r.bottom <= state.view.h && r.left >= 0 && r.right <= state.view.w;
        check('the goal card stays inside the landscape screen', !!inside, JSON.stringify({ tracker: r, screen: state.view }));
        const overlapsTutorial = !!(r && t && r.top < t.bottom && r.bottom > t.top && r.left < t.right && r.right > t.left);
        check('the goal card does not overlap the tutorial card', !overlapsTutorial, JSON.stringify({ tracker: r, tutorial: t }));
        check('the goal card shows its title and countdown/goals', /visit/i.test(state.tracker.text) && /(\d|goal|Chat|Eat|Mingl|Laugh|Talk)/i.test(state.tracker.text), state.tracker.text.slice(0, 120));
      }
      await shot('event-goals');
      // unfold it if it folded itself in the short landscape corner, and check the full card still fits
      const unfolded = await page.evaluate(() => {
        const el = document.querySelector('.ev-tracker');
        if (!el || el.hidden) return null;
        const btn = el.querySelector('button[aria-label="Show goals"]');
        if (btn) btn.click();
        return { collapsed: el.classList.contains('is-collapsed'), h: el.getBoundingClientRect().height, top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, w: innerHeight };
      });
      await page.waitForTimeout(250);
      await frames(3);
      const after = await page.evaluate(() => {
        const el = document.querySelector('.ev-tracker');
        if (!el || el.hidden) return { rect: null, collapsed: null };
        const b = el.getBoundingClientRect();
        return { rect: { top: b.top, left: b.left, right: b.right, bottom: b.bottom, width: b.width, height: b.height }, collapsed: el.classList.contains('is-collapsed'), screen: { w: innerWidth, h: innerHeight } };
      });
      check('the unfolded goal card still fits on screen', !!after.rect && after.rect.top >= 0 && after.rect.bottom <= after.screen.h, JSON.stringify({ before: unfolded, after }));
      await shot('event-goals-open');
      log.eventOpen = after;
    }

    log.errors = errors;
    for (const e of errors) check(`no page error: ${e}`, false, e);
    if (errors.length === 0) check('no page or console errors', true, '');
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(log, null, 2));
    await context.close();
  } finally {
    await browser?.close().catch(() => undefined);
    server.kill('SIGTERM');
  }
  const failed = log.checks.filter((c) => !c.ok);
  console.log(`\n[visual] ${log.checks.length - failed.length} passed, ${failed.length} failed; screenshots in ${OUT}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('[visual] error', e); process.exit(1); });
