// Task P (Milestone 12) visual check: the Build mode "Pool" section (styles, draw/remove/ladder tools), a pool preview
// and a finished pool with a household member swimming in it, in portrait 390x844, landscape 844x390 and desktop
// 1280x720. Self-locks /tmp/hearthside-browser.lock and builds its own copy of the game.
//
//   flock /tmp/hearthside-browser.lock node dev/ds-tasks/m12/p-shots.mjs
//
// Screenshots go to dev/ds-tasks/m12/shots/P/.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5198;
const DIST = join(root, 'tests/e2e/out/dist-m12p');
const OUT = join(here, 'shots/P');
mkdirSync(OUT, { recursive: true });

if (!process.env.HEARTHSIDE_M12P_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url)], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_M12P_LOCKED: '1' },
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const note = (name, ok, evidence = '') => { log.push({ name, ok, evidence }); console.log(`[m12-p] ${ok ? 'ok  ' : 'FAIL'} ${name}${evidence ? ` — ${evidence}` : ''}`); };

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
  await page.evaluate(() => { document.querySelectorAll('.toast, .toasts > *').forEach((t) => t.remove()); window.hearthside.debug.step(20); });
  await frames(page, 6);
}

const frames = (page, n, dt = 1 / 30) => page.evaluate(([n2, dt2]) => { for (let i = 0; i < n2; i++) window.hearthside.debug.frame(dt2); }, [n, dt]);

/** Opens Build mode and the Pool tool through the real panel buttons. */
async function openPoolTool(page) {
  await page.evaluate(() => window.hearthside.game.setMode('build'));
  await page.waitForSelector('.bb-build-panel:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(500);
  const tab = page.locator('.bb-tool-tabs .tab[data-id="tool-pool"]');
  await tab.evaluate((e) => e.scrollIntoView({ inline: 'nearest', block: 'nearest' }));
  await tab.click({ timeout: 30000 });
  await page.waitForSelector('.bb-tool-section[data-section="pool"]', { state: 'visible', timeout: 30000 });
  // The tab strip is horizontal; centre the active Pool tab so the screenshot shows which tool is open.
  await page.evaluate(() => document.querySelector('.bb-tool-tabs .tab[data-id="tool-pool"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  await page.waitForTimeout(400);
}

/** The three pool styles, the draw/remove/ladder modes and the note, as rendered for this viewport. */
async function poolPanelState(page) {
  return page.evaluate(() => {
    const section = document.querySelector('.bb-tool-section[data-section="pool"]');
    const rect = section?.getBoundingClientRect();
    const cards = [...(section?.querySelectorAll('.card[data-style-id]') ?? [])].map((c) => ({
      id: c.getAttribute('data-style-id'), text: c.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      w: Math.round(c.getBoundingClientRect().width), h: Math.round(c.getBoundingClientRect().height),
    }));
    const modes = [...(section?.querySelectorAll('.seg[data-id]') ?? [])].filter((e) => !e.hidden).map((e) => e.getAttribute('data-id'));
    return {
      visible: !!section && section.getBoundingClientRect().height > 0,
      box: rect ? { w: Math.round(rect.width), h: Math.round(rect.height), top: Math.round(rect.top), bottom: Math.round(rect.bottom) } : null,
      cards,
      modes,
      note: section?.querySelector('.bb-note')?.textContent?.trim() ?? '',
      tool: window.hearthside.game.buildTool(),
    };
  });
}

/**
 * Picks a free 4 x 3 spot on the ground (south yard first, away from the front path), previews it so the highlight is
 * visible for a screenshot, and returns the rectangle plus the preview.
 */
async function previewPool(page, ppm) {
  return page.evaluate(([ppmArg]) => {
    const h = window.hearthside, g = h.game, st = g.state();
    const lot = st.lots[st.activeLotId];
    const misses = [];
    const find = (zFrom, zTo, xFrom, xTo) => {
      for (let z0 = zFrom; z0 <= zTo; z0++) {
        for (let x0 = xFrom; x0 + 3 <= xTo; x0++) {
          const target = { from: { x: x0, z: z0 }, to: { x: x0 + 3, z: z0 + 2 } };
          const pv = g.buildPreview(target);
          if (!pv) continue;
          if (pv.ok) return { rect: { x0, z0, x1: x0 + 3, z1: z0 + 2 }, charge: pv.charge, measure: pv.measure.text, label: pv.label };
          if (misses.length < 3) misses.push(`${x0},${z0}: ${pv.reasons[0] ?? pv.reason ?? '?'}`);
        }
      }
      return null;
    };
    // South yard (the guided starter house ends at z = 17), east of the front path (x 8..12) so the open Build panel
    // does not cover it on desktop; then west of the path; then anywhere.
    const southFrom = Math.max(1, lot.depth - 7), southTo = lot.depth - 2, xMax = Math.min(lot.width - 2, 19);
    const pick = find(southFrom, southTo, 13, xMax)
      ?? find(southFrom, southTo, 1, 7)
      ?? find(1, Math.max(1, lot.depth - 2), 1, lot.width - 2);
    if (!pick) return { ok: false, misses };
    const target = { from: { x: pick.rect.x0, z: pick.rect.z0 }, to: { x: pick.rect.x1, z: pick.rect.z1 } };
    const pv = g.buildPreview(target);
    // Frame the rectangle so the highlight is actually in the picture (Build mode keeps the simulation paused).
    const cx = (pick.rect.x0 + pick.rect.x1 + 1) / 2, cz = (pick.rect.z0 + pick.rect.z1 + 1) / 2;
    h.view.setCutaway('cutaway');
    h.view.rig.setYawStep(0);
    h.view.rig.glideTo(cx, cz, ppmArg, 0, 0.2);
    h.debug.frame(1 / 30);
    return { ok: true, rect: pick.rect, charge: pick.charge, measure: pick.measure, label: pick.label, misses, preview: { ok: pv?.ok ?? false, cost: pv?.cost ?? 0 } };
  }, [ppm]);
}

/** Applies the previewed pool and reads the built state back. */
async function buildPool(page, rect) {
  return page.evaluate((r) => {
    const h = window.hearthside, g = h.game, st = g.state();
    const res = g.buildApply({ from: { x: r.x0, z: r.z0 }, to: { x: r.x1, z: r.z1 } });
    const lot = st.lots[st.activeLotId];
    const pools = Object.values(lot.pools ?? {});
    const pool = pools[0] ?? null;
    return {
      ...res,
      pool: pool && { id: pool.id, x0: pool.x0, z0: pool.z0, x1: pool.x1, z1: pool.z1, styleId: pool.styleId, ladders: pool.ladders },
      pools: pools.length,
      funds: st.households[st.activeHouseholdId].funds,
    };
  }, rect);
}

/**
 * Points the camera at the pool centre and reports where that centre lands on screen, so a shot that missed the
 * basin is obvious in the log.
 */
async function framePool(page, pool, ppm) {
  return page.evaluate(([p, ppmArg]) => {
    const h = window.hearthside;
    const cx = (p.x0 + p.x1 + 1) / 2, cz = (p.z0 + p.z1 + 1) / 2;
    h.view.setCutaway('cutaway');
    h.view.rig.setYawStep(0);
    // A build/preview reveal queued earlier would glide the camera back to the house mid-screenshot; let it fire and
    // finish first (0.2 s wait + 0.5 s glide), then point at the pool again and leave no motion running.
    h.view.rig.glideTo(cx, cz, ppmArg, 0, 0.2);
    for (let i = 0; i < 48; i++) h.debug.frame(1 / 60);
    // Snap rather than glide: an animated glide would still be under way when the screenshot is taken.
    h.view.rig.glideTo(cx, cz, ppmArg, 0);
    h.debug.frame(1 / 30);
    const out = { x: 0, y: 0, visible: false };
    h.view.rig.project(cx, 0, cz, out);
    // project() answers in canvas pixels; normalise to -0.5..0.5 so a check can ask "near the middle".
    const vw = window.innerWidth || 1, vh = window.innerHeight || 1;
    return { cx, cz, screen: out, nx: out.x / vw - 0.5, ny: out.y / vh - 0.5 };
  }, [pool, ppm]);
}

/** Queues a swim for an adult/teen and steps until they are in the water and swimming. */
async function startSwim(page, pool) {
  const r = await page.evaluate(([poolArg]) => {
    const h = window.hearthside, g = h.game, st = g.state();
    g.setMode('live');
    const hh = st.households[st.activeHouseholdId];
    const stageOf = (id) => st.people[id]?.lifeStage;
    const canSwim = ['child', 'teen', 'youngAdult', 'adult', 'elder'];
    const onLot = (m) => canSwim.includes(stageOf(m)) && st.people[m].location.kind === 'lot';
    // A free person makes the shot deterministic; otherwise take whoever is home and clear their queue.
    const id = hh.memberIds.find((m) => onLot(m) && st.people[m].queue.length === 0 && st.people[m].anim.id !== 'sleep')
      ?? hh.memberIds.find(onLot);
    if (!id) return { ok: false, reason: 'no swimmer' };
    for (const a of [...st.people[id].queue]) g.cancel(id, a.id);
    h.debug.step(2);
    // Autonomy may have picked something new in those two ticks; clear it so the swim starts at once.
    for (const a of [...st.people[id].queue]) g.cancel(id, a.id);
    const cx = Math.floor((poolArg.x0 + poolArg.x1) / 2);
    const cz = Math.floor((poolArg.z0 + poolArg.z1) / 2);
    const opts = g.options(id, { kind: 'floor', tile: { x: cx, z: cz }, level: 0 });
    const opt = opts.find((o) => o.interactionId === 'swimInPool' && o.enabled);
    if (!opt) return { ok: false, reason: `no swim option (${opts.map((o) => `${o.interactionId}:${o.enabled}`).join(', ')})` };
    const q = g.queue(id, opt);
    if (!q.ok) return { ok: false, reason: q.reason };
    let swimTick = -1;
    for (let i = 0; i < 400; i++) {
      h.debug.step(1);
      const head = st.people[id].queue[0];
      // The swim stage, not the climb in/out (both use the swim animation).
      if (st.people[id].anim.id === 'swim' && head?.data.stage === 'swim') { swimTick = i; break; }
    }
    const p = st.people[id];
    const loc = p.location;
    const inWater = loc.kind === 'lot' && loc.x >= poolArg.x0 && loc.x <= poolArg.x1 && loc.z >= poolArg.z0 && loc.z <= poolArg.z1;
    if (swimTick < 0) return { ok: false, reason: `never swam (anim ${p.anim.id}, loc ${JSON.stringify(loc)})`, id };
    const head = p.queue[0];
    return {
      ok: true, id, name: `${p.firstName} ${p.lastName}`, swimTick, anim: p.anim.id, posture: loc.posture,
      inWater, outfit: p.outfits.current.category, needs: { fun: Math.round(p.needs.fun), hygiene: Math.round(p.needs.hygiene) },
      head: head?.interactionId ?? null, stage: head?.data?.stage ?? null,
    };
  }, [pool]);
  await frames(page, 10);
  return r;
}

async function main() {
  console.log('[m12-p] building', DIST);
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

      // 1. The Pool section of Build mode: three styles, draw/remove/ladder tools.
      await openPoolTool(page);
      const panel = await poolPanelState(page);
      note(`${vp.id}: the Build panel has a Pool section with styles and tools`,
        panel.visible && panel.cards.length >= 3 && panel.modes.includes('draw') && panel.modes.includes('remove') && panel.modes.includes('ladder') && panel.tool?.kind === 'pool',
        `cards=${panel.cards.map((c) => c.id).join(',')} modes=${panel.modes.join(',')} tool=${JSON.stringify(panel.tool)} box=${JSON.stringify(panel.box)}`);
      note(`${vp.id}: the pool styles are selectable cards with a price`, panel.cards.every((c) => /\/ m2/.test(c.text) && c.w > 40 && c.h > 25), panel.cards.map((c) => `${c.id}:${c.w}x${c.h}`).join(' '));
      await page.screenshot({ path: join(OUT, `pool-panel-${vp.id}.png`) });

      // 2. A previewed rectangle: the highlight is drawn on the ground before confirming.
      const ppm = Math.round(Math.min(60, Math.max(26, Math.min(vp.width, vp.height) / 9)));
      const prev = await previewPool(page, ppm);
      note(`${vp.id}: a pool rectangle previews as buildable`, prev.ok === true, prev.ok ? `${prev.label} ${prev.measure} $${(prev.charge / 100).toFixed(2)} at ${JSON.stringify(prev.rect)}` : `misses=${JSON.stringify(prev.misses)}`);
      if (!prev.ok) { await context.close(); continue; }
      await frames(page, 4);
      const prevFrame = await framePool(page, prev.rect, ppm);
      await page.screenshot({ path: join(OUT, `pool-preview-${vp.id}.png`) });
      note(`${vp.id}: the preview highlight is centred on screen`, prevFrame.screen.visible && Math.abs(prevFrame.nx) < 0.3 && prevFrame.ny > -0.45 && prevFrame.ny < 0.25,
        `screen=${JSON.stringify(prevFrame.screen)} offset=${prevFrame.nx.toFixed(2)},${prevFrame.ny.toFixed(2)}`);

      // 3. Built: the basin, coping and ladder are in the world and the charge is exact. Frame it in live mode so the
      // open Build panel does not hide half of the screenshot.
      const built = await buildPool(page, prev.rect);
      note(`${vp.id}: confirming builds one pool with a ladder`, built.ok && built.pools === 1 && built.pool?.ladders?.length >= 1,
        `${built.ok ? 'ok' : built.reason} pools=${built.pools} pool=${JSON.stringify(built.pool)}`);
      note(`${vp.id}: the pool costs the posted price`, built.cost === prev.charge, `cost=${built.cost} preview=${prev.charge}`);
      if (!built.ok || !built.pool) { await context.close(); continue; }
      await page.evaluate(() => window.hearthside.game.setMode('live'));
      await frames(page, 8);
      const builtFrame = await framePool(page, built.pool, ppm);
      await page.screenshot({ path: join(OUT, `pool-built-${vp.id}.png`) });
      note(`${vp.id}: the built pool is centred on screen`, builtFrame.screen.visible && Math.abs(builtFrame.nx) < 0.3 && Math.abs(builtFrame.ny) < 0.3,
        `screen=${JSON.stringify(builtFrame.screen)} offset=${builtFrame.nx.toFixed(2)},${builtFrame.ny.toFixed(2)}`);

      // 4. Someone changes into swimwear, climbs in and swims; the camera frames the water.
      const swim = await startSwim(page, built.pool);
      note(`${vp.id}: a household member is swimming in the built pool`,
        swim.ok && swim.inWater && swim.anim === 'swim' && swim.outfit === 'swim',
        swim.ok ? `${swim.name} anim=${swim.anim} posture=${swim.posture} outfit=${swim.outfit} head=${swim.head} stage=${swim.stage} needs=${JSON.stringify(swim.needs)}` : swim.reason);
      if (swim.ok) {
        const probe = await page.evaluate((id) => {
          const h = window.hearthside;
          const entry = h.view.people.entries.get(id);
          if (!entry) return { error: 'no entry' };
          const root = entry.view.root;
          const tmp = root.position.clone();
          const ys = [], xs = [], zs = [];
          root.updateWorldMatrix(true, true);
          root.traverse((o) => { if (o.isBone) { o.getWorldPosition(tmp); ys.push(tmp.y); xs.push(tmp.x); zs.push(tmp.z); } });
          ys.sort((a, b) => a - b); xs.sort((a, b) => a - b); zs.sort((a, b) => a - b);
          const p = h.game.state().people[id];
          const r3 = (v) => Math.round(v * 1000) / 1000;
          return { visible: entry.visible, rootVisible: root.visible, at: [r3(root.position.x), r3(root.position.y), r3(root.position.z)], scale: root.scale.x, stage: entry.view.stageHeight, anim: p.anim.id, outfit: p.outfits.current.category, bones: ys.length, y: [r3(ys[0]), r3(ys[ys.length - 1])], x: [r3(xs[0]), r3(xs[xs.length - 1])], z: [r3(zs[0]), r3(zs[zs.length - 1])], water: 0.015 };
        }, swim.id);
        console.log(`[m12-p] ${vp.id}: swim probe ${JSON.stringify(probe)}`);
        // The head/shoulders must break the water plane while the rest of the body stays under it (faintly visible
        // through the transparent water); the old standing-height sink left every bone below the basin floor.
        note(`${vp.id}: the swimmer breaks the surface (head above, body under)`,
          probe.visible === true && probe.y?.[1] > 0.02 && probe.y?.[0] < 0,
          `bones y ${JSON.stringify(probe.y)} root=${probe.at?.[1]} xz ${JSON.stringify(probe.x)},${JSON.stringify(probe.z)}`);
      }
      // A slightly wider shot than the idle view so the rim, the water and the swimmer all fit.
      const swimFrame = await framePool(page, built.pool, Math.round(ppm * 0.8));
      await page.screenshot({ path: join(OUT, `pool-swim-${vp.id}.png`) });
      // Diagnostic: did the camera stay on the pool while the screenshot was taken?
      const afterShot = await page.evaluate((p) => {
        const h = window.hearthside;
        const cx = (p.x0 + p.x1 + 1) / 2, cz = (p.z0 + p.z1 + 1) / 2;
        const out = { x: 0, y: 0, visible: false };
        h.view.rig.project(cx, 0, cz, out);
        return { target: { x: h.view.rig.target.x, z: h.view.rig.target.z }, ppm: h.view.rig.ppm, yaw: h.view.rig.yaw, screen: out };
      }, built.pool);
      console.log(`[m12-p] ${vp.id}: camera after shot ${JSON.stringify(afterShot)}`);
      note(`${vp.id}: the swimmer is framed on screen`, swimFrame.screen.visible && Math.abs(swimFrame.nx) < 0.3 && Math.abs(swimFrame.ny) < 0.35,
        `screen=${JSON.stringify(swimFrame.screen)} offset=${swimFrame.nx.toFixed(2)},${swimFrame.ny.toFixed(2)}`);

      // 5. Get Out still exists while swimming and is offered in the context menu.
      const getOut = swim.ok ? await page.evaluate(([id, pool]) => {
        const g = window.hearthside.game;
        const cx = Math.floor((pool.x0 + pool.x1) / 2), cz = Math.floor((pool.z0 + pool.z1) / 2);
        const opts = g.options(id, { kind: 'floor', tile: { x: cx, z: cz }, level: 0 });
        return opts.map((o) => ({ id: o.interactionId, enabled: o.enabled }));
      }, [swim.id, built.pool]) : [];
      note(`${vp.id}: Get Out is offered while swimming`, getOut.some((o) => o.id === 'getOutOfPool' && o.enabled), JSON.stringify(getOut.filter((o) => o.id === 'getOutOfPool')));

      note(`${vp.id}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' / '));
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGTERM');
    writeFileSync(join(OUT, 'shots.json'), JSON.stringify(log, null, 2));
  }

  const failed = log.filter((l) => !l.ok);
  console.log(`[m12-p] ${log.length - failed.length}/${log.length} checks passed; screenshots in dev/ds-tasks/m12/shots/P/`);
  if (failed.length) process.exitCode = 1;
}

await main();
