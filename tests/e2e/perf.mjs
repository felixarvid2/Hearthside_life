#!/usr/bin/env node
// Milestone 13 performance harness (SwiftShader EMULATION, not real devices).
//
//   node tests/e2e/perf.mjs [--no-build] [--seconds=12] [--only=portrait,landscape,desktop] [--styles=classic,quaternius]
//                           [--extra] [--out=DIR]
//   npm run e2e:perf
//
// Loads the starter lot with seven animated people (four premade households merged: all adults, so the Quaternius
// style really uses its modular bodies) at normal speed and records, for each device profile x character style:
// load time to the menu, the steady cost of a frame (90 synchronous frames, each forced to finish: p50/p95/max), the real-time loop
// (fps and p95 of requestAnimationFrame intervals over N seconds, bursty under SwiftShader),
// draw calls, triangles, geometries, textures, the JS heap (CDP) and the quality the auto-detect chose.
// Profiles: phone portrait 390x844 and phone landscape 844x390 (DPR 3, touch, mobile UA) and desktop 1280x720. With
// --extra the phone profiles are repeated with quality forced to "high" to show what the auto-detect saves.
// Results: tests/e2e/out/perf/perf.json and a Markdown table on stdout (paste into docs/TEST_CHECKLIST.md).
// SwiftShader renders on the CPU: absolute numbers say nothing about a real phone's GPU; compare profiles with each other.
//
// The script takes the shared browser lock itself (never wrap it in flock).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PHONE_UA, VIEWPORTS, parseArgs, root, settingsInit, startBrowser, withBrowserLock } from './common.mjs';

const { argv, flag, opt } = parseArgs();
withBrowserLock(import.meta.url, argv);

const SECONDS = Number(opt('seconds', 12));
const OUT = resolve(opt('out', join(root, 'tests/e2e/out/perf')));
const ONLY = opt('only', 'portrait,landscape,desktop').split(',');
const STYLES = opt('styles', 'classic,quaternius').split(',');
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[perf]', ...a);

const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

async function measure(browser, url, profile, style, forceQuality) {
  const vp = VIEWPORTS[profile];
  const context = await browser.newContext({ ...vp, ...(vp.isMobile ? { userAgent: PHONE_UA } : {}) });
  await context.addInitScript(settingsInit({ characterStyle: style, ...(forceQuality ? { quality: forceQuality } : {}) }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 180000 });
  const loadMs = Date.now() - t0;

  const started = await page.evaluate(async () => {
    const g = window.hearthside.game;
    const list = g.premadeHouseholds();
    const members = [], ties = [];
    for (const h of list) {
      const off = members.length;
      members.push(...h.members);
      for (const t of h.ties) ties.push({ ...t, a: t.a + off, b: t.b + off });
    }
    const r = await g.startNewGame('guided', { name: 'Perf household', members: members.slice(0, 8), ties: ties.filter((t) => t.a < 8 && t.b < 8) });
    g.setSpeed(2);
    return r;
  });
  if (!started.ok) throw new Error(`startNewGame failed: ${started.reason}`);
  // let the world settle: people stand up, walk, start actions; assets for every body finish loading
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.hearthside.view.frameLot(true));
  await page.waitForTimeout(500);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const result = await page.evaluate((seconds) => new Promise((resolveP) => {
    const deltas = [];
    let last = performance.now();
    const end = last + seconds * 1000;
    const tick = (now) => {
      deltas.push(now - last);
      last = now;
      if (now < end) requestAnimationFrame(tick); else resolveP(deltas);
    };
    requestAnimationFrame(tick);
  }), SECONDS);
  const deltas = result.slice(1).sort((a, b) => a - b);
  // Cost of one frame, measured synchronously: 90 frames of simulation + render, each followed by a 1-pixel read-back that forces the
  // software GPU to finish. The real-time numbers above come in bursts under SwiftShader (the compositor queues frames), so p50 of
  // the loop alone is misleading; this is the steady cost per frame.
  const sync = await page.evaluate(() => {
    const h = window.hearthside;
    const gl = document.getElementById('game-canvas').getContext('webgl2');
    const px = new Uint8Array(4);
    const times = [];
    for (let i = 0; i < 90; i++) {
      const t = performance.now();
      h.debug.frame(1 / 30);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      times.push(performance.now() - t);
    }
    return times.sort((a, b) => a - b);
  });
  const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const info = await page.evaluate(() => {
    const h = window.hearthside, g = h.game, st = g.state();
    const canvas = document.getElementById('game-canvas');
    const onLot = Object.values(st.people).filter((p) => p.location.kind === 'lot' && p.location.lotId === st.activeLotId);
    return {
      stats: h.debug.stats(),
      quality: g.settings().quality,
      style: g.settings().characterStyle,
      people: onLot.length,
      moving: onLot.filter((p) => p.queue.length > 0).length,
      canvas: `${canvas.width}x${canvas.height}`,
      gameMinutes: Math.round(st.clock.minutes),
    };
  });
  await context.close();
  const mean = deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length);
  return {
    profile, style, quality: info.quality, forcedQuality: forceQuality ?? null, viewport: `${vp.viewport.width}x${vp.viewport.height}`,
    loadSeconds: +(loadMs / 1000).toFixed(1),
    frames: deltas.length, fps: +(1000 / mean).toFixed(1),
    loopMsP50: +pct(deltas, 0.5).toFixed(1), loopMsP95: +pct(deltas, 0.95).toFixed(1), loopMsMax: +deltas[deltas.length - 1].toFixed(1),
    frameMsP50: +pct(sync, 0.5).toFixed(1), frameMsP95: +pct(sync, 0.95).toFixed(1), frameMsMax: +sync[sync.length - 1].toFixed(1),
    gameFrameMs: info.stats.frameMs, simTickMs: info.stats.simTickMs,
    drawCalls: info.stats.drawCalls, triangles: info.stats.triangles, geometries: info.stats.geometries, textures: info.stats.textures,
    jsHeapMB: +(metrics.JSHeapUsedSize / 1048576).toFixed(1), jsHeapTotalMB: +(metrics.JSHeapTotalSize / 1048576).toFixed(1),
    canvas: info.canvas, people: info.people, peopleBusy: info.moving, errors,
  };
}

async function main() {
  const rig = await startBrowser({ noBuild: flag('no-build'), log });
  const rows = [];
  try {
    const plan = [];
    for (const p of ONLY) for (const s of STYLES) plan.push([p, s, null]);
    if (flag('extra')) for (const p of ONLY.filter((x) => x !== 'desktop')) for (const s of STYLES) plan.push([p, s, 'high']);
    for (const [profile, style, q] of plan) {
      log(`${profile} / ${style}${q ? ` / forced ${q}` : ''} ...`);
      const row = await measure(rig.browser, rig.url, profile, style, q);
      rows.push(row);
      log(JSON.stringify(row));
    }
  } finally {
    await rig.close();
  }
  writeFileSync(join(OUT, 'perf.json'), JSON.stringify(rows, null, 1));
  console.log('\n| profile | viewport | style | quality | load s | frame p50 ms | p95 ms | loop fps | loop p95 ms | draw calls | triangles | geometries | textures | JS heap MB | people |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(`| ${r.profile} | ${r.viewport} | ${r.style} | ${r.quality}${r.forcedQuality ? ' (forced)' : ' (auto)'} | ${r.loadSeconds} | ${r.frameMsP50} | ${r.frameMsP95} | ${r.fps} | ${r.loopMsP95} | ${r.drawCalls} | ${r.triangles.toLocaleString('en-US')} | ${r.geometries} | ${r.textures} | ${r.jsHeapMB} | ${r.people} |`);
  }
  const bad = rows.filter((r) => r.errors.length > 0);
  if (bad.length) { console.error('[perf] page errors:', bad.map((r) => `${r.profile}/${r.style}: ${r.errors[0]}`).join('; ')); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
