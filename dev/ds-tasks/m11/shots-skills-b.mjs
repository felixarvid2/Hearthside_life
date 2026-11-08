// Milestone 11, task B: screenshots of a person using the yoga mat, the bread oven and the sketchbook, plus the
// skills panel showing Baking, Wellness and Creativity, in portrait, landscape and desktop.
//
//   npm run build && flock /tmp/hearthside-browser.lock node dev/ds-tasks/m11/shots-skills-b.mjs
//
// Serves ./dist on port 5194 and writes PNGs plus a JSON log to dev/ds-tasks/m11/shots/.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const LOCK = '/tmp/hearthside-browser.lock';
// Browser runs share one lock. Re-exec under flock so the invocation itself is enough.
if (!process.env.HEARTHSIDE_SKILL_SHOTS_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, HEARTHSIDE_SKILL_SHOTS_LOCKED: '1' },
  });
  process.exit(r.status ?? 1);
}
const PORT = 5194;
const DIST = join(root, 'dist');
const SHOTS = join(here, 'shots');
mkdirSync(SHOTS, { recursive: true });

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

const log = { checks: [], shots: [], viewports: [] };
const check = (name, ok, evidence) => {
  log.checks.push({ name, ok, evidence });
  console.log(`[shots] ${ok ? 'ok  ' : 'FAIL'} ${name}${evidence ? ` — ${evidence}` : ''}`);
};

async function waitForServer(url, ms, server, owner) {
  let stderr = '';
  server?.stderr?.on('data', (d) => { stderr += d; });
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (server && server.exitCode !== null) throw new Error(`preview server exited (${server.exitCode}): ${stderr.trim()}`);
    try {
      const r = await fetch(`${url}__e2e-owner.txt`);
      if (r.ok) {
        if ((await r.text()).trim() !== owner) throw new Error(`port ${PORT} is held by another server`);
        return;
      }
    } catch (e) { if (!/fetch failed|ENOTFOUND|ECONNREFUSED/.test(String(e))) throw e; }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server at ${url} did not start`);
}

const VIEWPORTS = [
  { name: 'portrait', width: 390, height: 844, isMobile: true },
  { name: 'landscape', width: 844, height: 390, isMobile: true },
  { name: 'desktop', width: 1280, height: 720, isMobile: false },
];

/** Runs in the page: places the three M11 objects on free floor tiles and gives the person some practice. */
function setupWorld() {
  const g = window.hearthside.game;
  const core = window.hearthside.core;
  const st = core.state();
  const db = core.content;
  const lot = st.lots[st.activeLotId];
  const person = st.households[st.activeHouseholdId].memberIds.map((id) => st.people[id])[0];

  // Tiles taken by the objects this script places, rugs included, so the mat and the oven never overlap.
  const taken = new Set();
  const occupied = (x, z) => {
    if (taken.has(`${x},${z}`)) return true;
    for (const o of Object.values(lot.objects)) {
      const def = db.objects[o.defId];
      if (!def || !def.blocksMovement || def.layer !== 'floor' || o.level !== 0) continue;
      const { w, d } = def.footprint;
      const wide = o.rot === 1 || o.rot === 3;
      if (x >= o.x && x < o.x + (wide ? d : w) && z >= o.z && z < o.z + (wide ? w : d)) return true;
    }
    return false;
  };
  const mark = (x, z, w, d) => { for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) taken.add(`${x + dx},${z + dz}`); };
  const freeRect = (x, z, w, d) => {
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) if (occupied(x + dx, z + dz)) return false;
    return true;
  };
  const stove = Object.values(lot.objects).find((o) => o.defId === 'stove-basic' || o.defId === 'stove-electric');
  const findSpot = (w, d, near) => {
    if (near) {
      // In front of the range first (into the room), then beside it, then behind it.
      for (const [dx, dz] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const x = near.x + dx, z = near.z + dz;
        if (x < 1 || z < 1 || x + w > lot.width - 1 || z + d > lot.depth - 1) continue;
        if (freeRect(x, z, w, d)) return { x, z };
      }
    }
    for (let z = 2; z < lot.depth - d; z++) for (let x = 2; x < lot.width - w; x++) if (freeRect(x, z, w, d)) return { x, z };
    throw new Error('no free spot');
  };
  const place = (defId, w, d, support, near, spot, rot = 0) => {
    if (support) {
      const o = { id: `shot_${defId}`, defId, level: support.level, x: support.x, z: support.z, rot: support.rot, finishes: {}, purchasePrice: 0, boughtAt: st.clock.minutes, ownerHouseholdId: lot.ownerHouseholdId, supportId: support.id, condition: { dirt: 0, broken: false } };
      lot.objects[o.id] = o;
      return o;
    }
    const { x, z } = spot ?? findSpot(w, d, near);
    mark(x, z, w, d);
    const o = { id: `shot_${defId}`, defId, level: 0, x, z, rot, finishes: {}, purchasePrice: 0, boughtAt: st.clock.minutes, ownerHouseholdId: lot.ownerHouseholdId, condition: { dirt: 0, broken: false } };
    lot.objects[o.id] = o;
    return o;
  };

  // The mat needs open floor inside the house, with no wall corner in front of the camera: scan the floored
  // interior for a free patch at least two tiles from every wall. Prefer a 2x1 mat turned across the view,
  // which reads as a mat lying on the floor rather than a strip running away from the camera.
  const interior = (x, z) => !!lot.floors[`0:${x}:${z}`];
  const nearWall = (x, z) => {
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (lot.walls[`0:h:${x + dx}:${z + dz}`] || lot.walls[`0:v:${x + dx}:${z + dz}`]) return true;
    }
    return false;
  };
  let matSpot = null;
  for (const [w, d] of [[2, 1], [1, 2]]) {
    for (let z = 2; z < lot.depth - 3 && !matSpot; z++) {
      for (let x = 2; x < lot.width - 3; x++) {
        let inside = true;
        for (let dz = 0; dz < d && inside; dz++) for (let dx = 0; dx < w; dx++) inside = inside && interior(x + dx, z + dz);
        if (!inside || !freeRect(x, z, w, d)) continue;
        let clear = true;
        for (let dz = 0; dz < d && clear; dz++) for (let dx = 0; dx < w; dx++) clear = clear && !nearWall(x + dx, z + dz);
        if (!clear) continue;
        matSpot = { x, z, w, d, rot: w === 2 ? 1 : 0 };
        break;
      }
    }
    if (matSpot) break;
  }
  if (!matSpot) matSpot = { x: 8, z: 14, w: 1, d: 2, rot: 0 };

  // The oven goes beside the range so the shot shows the new appliance rather than the old one, with its
  // front tile kept free for the person; the mat sits in the open floor found above.
  const mat = place('yoga-mat', matSpot.w, matSpot.d, null, null, matSpot, matSpot.rot);
  mark(mat.x, mat.z, 1, 2);
  const oven = place('bread-oven', 1, 1, null, stove);
  const table = Object.values(lot.objects).find((o) => o.defId === 'table-coffee') ?? Object.values(lot.objects).find((o) => o.defId === 'table-dining-oak');
  const book = place('sketchbook', 1, 1, table);

  // A practised person so the skills panel has something to show.
  person.skills.baking = { level: 6, xp: 1200 };
  person.skills.wellness = { level: 4, xp: 560 };
  person.skills.creativity = { level: 5, xp: 830 };

  return {
    person: { id: person.id, name: person.firstName },
    matId: mat.id, ovenId: oven.id, bookId: book.id,
    positions: { mat: [mat.x, mat.z], oven: [oven.x, oven.z], book: [book.x, book.z] },
    matCenter: [mat.x + matSpot.w / 2, mat.z + matSpot.d / 2],
  };
}

/** Waits for a couple of real frames and a short pause, so a slow software renderer has painted the last change. */
async function settle(page, ms = 600) {
  await page.waitForTimeout(ms);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 250)))));
}

/** Centres the camera on the person and zooms in so they and the object they use fill the frame. */
async function framePerson(page, personId) {
  await page.evaluate((id) => window.hearthside.game.view.focusPerson(id), personId);
  await page.waitForTimeout(900);
  for (const factor of [2, 1.6]) {
    const anchor = await page.evaluate((id) => window.hearthside.game.view.anchorOf({ kind: 'person', personId: id }), personId);
    if (anchor) await page.evaluate(({ f, x, y }) => window.hearthside.game.view.zoomAt(f, x, y), { f: factor, x: anchor.x, y: anchor.y });
    await page.waitForTimeout(350);
  }
  await page.evaluate((id) => window.hearthside.game.view.focusPerson(id), personId);
  await page.waitForTimeout(900);
  await settle(page);
}

/** Centres the camera on the mat itself (not just the person), so the whole mat is in frame with the walls down. */
async function frameMat(page, matId, x, z) {
  await page.evaluate(() => window.hearthside.game.view.setCutaway('down'));
  await page.evaluate(({ x, z }) => window.hearthside.view.focusOn(x, z, true), { x, z });
  await page.waitForTimeout(1100);
  const anchor = await page.evaluate((id) => window.hearthside.game.view.anchorOf({ kind: 'object', objectId: id }), matId);
  if (anchor) await page.evaluate(({ f, x, y }) => window.hearthside.game.view.zoomAt(f, x, y), { f: 1.5, x: anchor.x, y: anchor.y });
  await page.waitForTimeout(400);
  await page.evaluate(({ x, z }) => window.hearthside.view.focusOn(x, z, true), { x, z });
  await page.waitForTimeout(1100);
  await settle(page);
}

/** Software rendering can leave stale DOM layers; a hidden/visible flash and a one-pixel resize force a repaint. */
async function forceRepaint(page, width, height) {
  await page.evaluate(() => {
    const panel = document.querySelector('.person-panel');
    if (panel) {
      panel.style.visibility = 'hidden';
      void panel.offsetHeight; // flush layout, then show again so the compositor rebuilds the layer
      panel.style.visibility = '';
    }
  });
  await page.setViewportSize({ width, height: height + 1 });
  await page.waitForTimeout(350);
  await page.setViewportSize({ width, height });
  await settle(page, 500);
}

/** Steps the game until the person's queue is empty, so the next order starts immediately. */
async function clearQueue(page) {
  for (let i = 0; i < 60; i++) {
    const busy = await page.evaluate(() => {
      const st = window.hearthside.debug.state();
      const personId = st.households[st.activeHouseholdId].memberIds[0];
      const p = st.people[personId];
      if (p.queue.length) {
        window.hearthside.game.cancel(personId, p.queue[0].id);
        window.hearthside.debug.step(5);
        return true;
      }
      return false;
    });
    if (!busy) return true;
    await page.waitForTimeout(30);
  }
  return false;
}

async function stepUntilPerforming(page, personId, interactionId) {
  for (let i = 0; i < 120; i++) {
    const st = await page.evaluate(() => {
      window.hearthside.debug.step(5);
      const s = window.hearthside.debug.state();
      const hh = s.households[s.activeHouseholdId];
      const p = hh.memberIds.map((id) => s.people[id])[0];
      const a = p.queue[0];
      return a ? { interactionId: a.interactionId, phase: a.phase, elapsed: a.elapsed } : null;
    });
    if (st && st.interactionId === interactionId && st.phase === 'perform') return st;
    await page.waitForTimeout(40);
  }
  return null;
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('run `npm run build` first: dist/ is missing');
  const owner = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(join(DIST, '__e2e-owner.txt'), owner);
  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser = null;
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`, 20000, server, owner);
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({ ...launchOptions(chromium), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.isMobile, hasTouch: vp.isMobile });
      await context.addInitScript(() => {
        try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, hints: false, musicVolume: 0 })); } catch { /* ignore */ }
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
      await page.waitForTimeout(600);

      const started = await page.evaluate(async () => {
        const g = window.hearthside.game;
        const hhs = g.premadeHouseholds();
        const r = await g.startNewGame('guided', hhs[0]);
        g.setSpeed(0);
        return r;
      });
      if (!started.ok) throw new Error(`startNewGame failed: ${started.reason}`);
      await page.waitForTimeout(500);

      const setup = await page.evaluate(setupWorld);
      // setupWorld writes straight into the lot, so tell the renderer to pick the new objects up.
      await page.evaluate(() => { window.hearthside.view.lotChanged('objects'); window.hearthside.view.lotChanged('floors'); });
      await page.evaluate((id) => window.hearthside.game.select(id), setup.person.id);
      // Cutaway walls, so an interior practice is never shot through a wall corner.
      await page.evaluate(() => window.hearthside.game.view.setCutaway('down'));
      await page.waitForTimeout(300);

      const practices = [
        { shot: 'yoga-mat', id: 'doYoga', objectId: setup.matId },
        { shot: 'bread-oven', id: 'bakeTreat', objectId: setup.ovenId },
        { shot: 'sketchbook', id: 'sketchIdeas', objectId: setup.bookId },
      ];
      const optionCheck = await page.evaluate((ids) => {
        const g = window.hearthside.game;
        const person = window.hearthside.debug.state().households[window.hearthside.debug.state().activeHouseholdId].memberIds[0];
        return ids.map((x) => {
          const o = g.options(person, { kind: 'object', objectId: x.objectId }).find((m) => m.interactionId === x.id);
          return { id: x.id, found: !!o, enabled: !!o?.enabled, reason: o?.reason ?? null };
        });
      }, practices);
      for (const o of optionCheck) check(`${vp.name}: the menu offers ${o.id}`, o.found && o.enabled, o.reason ?? 'enabled');

      for (const practice of practices) {
        await clearQueue(page);
        const queued = await page.evaluate((p) => {
          const g = window.hearthside.game;
          const st = window.hearthside.debug.state();
          const person = st.households[st.activeHouseholdId].memberIds[0];
          const o = g.options(person, { kind: 'object', objectId: p.objectId }).find((m) => m.interactionId === p.id);
          return o ? g.queue(person, o) : { ok: false, reason: 'option missing' };
        }, practice);
        check(`${vp.name}: ${practice.id} is queued from the menu`, queued.ok, queued.reason ?? 'queued');
        const performing = await stepUntilPerforming(page, setup.person.id, practice.id);
        check(`${vp.name}: ${practice.id} reaches the performing phase`, !!performing, performing ? `at ${performing.elapsed} min` : 'never performed');
        if (performing) {
          if (practice.shot === 'yoga-mat') {
            // Centre on the mat in the open floor, with the person standing on it.
            await frameMat(page, setup.matId, setup.matCenter[0], setup.matCenter[1]);
            const anchors = await page.evaluate(({ personId, matId }) => ({
              person: window.hearthside.game.view.anchorOf({ kind: 'person', personId }),
              mat: window.hearthside.game.view.anchorOf({ kind: 'object', objectId: matId }),
            }), { personId: setup.person.id, matId: setup.matId });
            const onScreen = (a) => !!a && a.visible && a.x > 0 && a.x < vp.width && a.y > 0 && a.y < vp.height;
            check(`${vp.name}: the person stands on the visible mat`, onScreen(anchors.person) && onScreen(anchors.mat),
              `person ${JSON.stringify(anchors.person)}, mat ${JSON.stringify(anchors.mat)}`);
            const centred = !!anchors.mat && Math.abs(anchors.mat.x - vp.width / 2) < vp.width * 0.3 && Math.abs(anchors.mat.y - vp.height / 2) < vp.height * 0.4;
            check(`${vp.name}: the camera is centred on the mat`, centred, JSON.stringify(anchors.mat));
            (log.diagnostics ??= []).push({ viewport: vp.name, shot: practice.shot, anchors });
          } else {
            await framePerson(page, setup.person.id);
          }
          await forceRepaint(page, vp.width, vp.height);
          await page.screenshot({ path: join(SHOTS, `${vp.name}-${practice.shot}.png`) });
          log.shots.push(`${vp.name}-${practice.shot}.png`);
        }
        await clearQueue(page);
      }

      // Skills panel: Baking, Wellness and Creativity rows with levels.
      const member = page.locator(`.member[data-person-id="${setup.person.id}"]`);
      await member.click();
      await page.waitForTimeout(500);
      if (!(await page.locator('.person-panel').isVisible().catch(() => false))) await member.click();
      await page.waitForSelector('.person-panel .tab[data-id="skills"]', { state: 'attached', timeout: 5000 });
      await settle(page);
      await page.evaluate(() => document.querySelector('.person-panel .tab[data-id="skills"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await settle(page, 1400);
      await page.evaluate(() => {
        const b = document.querySelector('.person-panel .panel-body');
        if (b) b.scrollTop = 0;
        const expand = document.querySelector('.person-panel .panel-actions button[aria-label="Expand panel"]');
        expand?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await settle(page, 1200);
      const skills = await page.evaluate(() => {
        const panel = document.querySelector('.person-panel');
        const rows = [...(panel?.querySelectorAll('.skill-row') ?? [])].map((r) => ({
          name: r.querySelector('.skill-name')?.textContent?.trim() ?? '',
          level: r.querySelector('.skill-level')?.textContent?.trim() ?? '',
        }));
        return {
          rows, names: rows.map((r) => r.name),
          selected: panel?.querySelector('.tab[data-id="skills"]')?.getAttribute('aria-selected') ?? null,
          inContent: !!panel?.querySelector('.pp-content .skill-list'),
        };
      });
      const wanted = ['Baking', 'Wellness', 'Creativity'];
      check(`${vp.name}: the skills panel lists Baking, Wellness and Creativity`, wanted.every((n) => skills.names.includes(n)), skills.names.join(', '));
      check(`${vp.name}: the Skills tab is the selected tab with the skill list shown`, skills.selected === 'true' && skills.inContent,
        `aria-selected ${skills.selected}, list in content ${skills.inContent}`);
      await forceRepaint(page, vp.width, vp.height);
      // Re-check after the repaint; a stale paint would still show the old tab.
      const stillSkills = await page.evaluate(() => {
        const panel = document.querySelector('.person-panel');
        return {
          selected: panel?.querySelector('.tab[data-id="skills"]')?.getAttribute('aria-selected') ?? null,
          inContent: !!panel?.querySelector('.pp-content .skill-list'),
        };
      });
      check(`${vp.name}: the panel still shows the skill list after the repaint`, stillSkills.selected === 'true' && stillSkills.inContent,
        `aria-selected ${stillSkills.selected}, list in content ${stillSkills.inContent}`);
      await page.screenshot({ path: join(SHOTS, `${vp.name}-skills-panel.png`) });
      log.shots.push(`${vp.name}-skills-panel.png`);

      check(`${vp.name}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
      log.viewports.push({ ...vp, setup, skills });
      await context.close();
    }
  } finally {
    await browser?.close().catch(() => undefined);
    server.kill('SIGTERM');
  }
  writeFileSync(join(SHOTS, 'skills-b-log.json'), JSON.stringify(log, null, 2));
  const failed = log.checks.filter((c) => !c.ok);
  console.log(`[shots] ${log.checks.length - failed.length}/${log.checks.length} checks passed, ${log.shots.length} screenshots`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error('[shots] failed:', e); process.exitCode = 1; });
