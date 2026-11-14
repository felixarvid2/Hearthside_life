#!/usr/bin/env node
// Children on the real furniture of the real game (dev server, SwiftShader): the members of a household are set to the young life
// stages and sent to sit on every kind of seat on the lot (and to lie in the beds); each is photographed from the front and the side
// and measured against the seat: the lowest point of hips and thighs against the seat height, which body parts are inside the
// furniture (a ray straight up from the point leaves through an odd number of surfaces; a table over the lap counts too), and
// whether the feet are on the far side of the backrest (feetFromBack < 0).
//   node dev/shoot-kids-seats.mjs [--out=DIR] [--style=quaternius] [--stages=toddler,child,teen,adult]
// Runs under `flock /tmp/hearthside-browser.lock` (do not wrap it in another flock). Writes PNGs and seats.json to dev/shots/kids-seats/.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5399;
const args = process.argv.slice(2);
const opt = (name, def) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };

if (!process.env.MPFB_LAB_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...args], { stdio: 'inherit', env: { ...process.env, MPFB_LAB_LOCKED: '1' } });
  process.exit(r.status ?? 1);
}

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of [join(root, 'node_modules'), '/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try { return require(require.resolve('playwright', { paths: [p] })); } catch { /* next */ }
  }
  throw new Error('playwright is not installed');
}

const OUT = resolve(opt('out', join(here, 'shots', 'kids-seats')));
const STYLE = opt('style', 'quaternius');
mkdirSync(OUT, { recursive: true });

async function waitForServer(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server at ${url} did not start`);
}

const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser = null;
try {
  await waitForServer(`http://127.0.0.1:${PORT}/`, 40000);
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.addInitScript((style) => { try { localStorage.setItem('hearthside.settings.v1', JSON.stringify({ tutorial: false, hints: false, musicVolume: 0, characterStyle: style })); } catch { /* ignore */ } }, STYLE);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 180000 });
  await page.waitForTimeout(800);
  const frames = (n, dt = 1 / 30) => page.evaluate(([n2, dt2]) => { for (let i = 0; i < n2; i++) window.hearthside.debug.frame(dt2); }, [n, dt]);
  const started = await page.evaluate(async () => {
    const g = window.hearthside.game;
    const hhs = g.premadeHouseholds();
    const hh = [...hhs].sort((a, b) => b.members.length - a.members.length)[0];
    const r = await g.startNewGame('guided', hh);
    g.setSpeed(0);
    return { ok: r.ok, members: hh.members.length };
  });
  console.log('[game] started', JSON.stringify(started));
  await page.waitForTimeout(600);
  await page.evaluate(() => { document.querySelectorAll('.toast, .toasts > *').forEach((t) => t.remove()); window.hearthside.debug.step(10); });
  await frames(6);


  const STAGES = opt('stages', 'toddler,child,teen,adult').split(',');
  // every kind of seat and bed on the lot: one object per design
  const seats = await page.evaluate(() => {
    const h = window.hearthside, g = h.game, st = g.state();
    const lot = st.lots[st.activeLotId];
    const m = st.households[st.activeHouseholdId].memberIds[0];
    const seen = new Set(); const out = [];
    for (const o of Object.values(lot.objects)) {
      if (seen.has(o.defId)) continue;
      const opts = g.options(m, { kind: 'object', objectId: o.id });
      const sit = opts.find((x) => /^(sit|sitDown|relax|nap|sleep)$/i.test(x.interactionId));
      if (!sit) continue;
      seen.add(o.defId);
      out.push({ objectId: o.id, defId: o.defId, interactionId: sit.interactionId, label: sit.label, x: o.x, z: o.z, level: o.level ?? 0 });
    }
    return out;
  });
  if (opt('only', '')) { const keep = opt('only', '').split(','); for (let i = seats.length - 1; i >= 0; i--) if (!keep.includes(seats[i].defId)) seats.splice(i, 1); }
  console.log('[seats]', JSON.stringify(seats.map((s) => `${s.defId}:${s.interactionId}`)));
  const report = [];
  for (const seat of seats) {
    for (const stage of STAGES) {
      const r = await page.evaluate(async ([seat2, stage2]) => {
        const h = window.hearthside, g = h.game, st = g.state();
        // a free afternoon every time: nobody leaves for school or work, nobody is due in bed
        st.clock.minutes = 5 * 1440 + 14 * 60;
        const ids = st.households[st.activeHouseholdId].memberIds.filter((id) => st.people[id].location.kind === 'lot');
        const id = st.households[st.activeHouseholdId].memberIds[0];
        if (st.people[id].location.kind !== 'lot') return { ok: false, reason: `the sitter is ${st.people[id].location.kind}` };
        // everybody else out of the way and idle; the sitter rested, at the right age, next to the seat
        for (const other of ids) { const p = st.people[other]; for (const a of [...p.queue]) g.cancel(other, a.id); }
        const p = st.people[id];
        p.lifeStage = stage2;
        for (const k of Object.keys(p.needs)) p.needs[k] = 90;
        h.view.personChanged(id);
        h.debug.step(8);
        const opt = g.options(id, { kind: 'object', objectId: seat2.objectId }).find((x) => x.interactionId === seat2.interactionId);
        if (!opt || !opt.enabled) return { ok: false, reason: opt ? opt.reason : 'not offered' };
        const q = g.queue(id, opt);
        if (!q.ok) return { ok: false, reason: q.reason };
        for (let i = 0; i < 4 * 240; i++) {
          h.debug.step(1);
          const pp = h.game.state().people[id];
          const a = pp.queue[0];
          if (a && a.phase === 'perform' && (pp.location.posture === 'seated' || pp.location.posture === 'lying') && a.elapsed > 2) break;
        }
        const pp = h.game.state().people[id];
        return { ok: pp.location.posture !== 'standing', id, posture: pp.location.posture, x: pp.location.x, z: pp.location.z };
      }, [seat, stage]);
      if (!r.ok) { console.log(`[seats] ${seat.defId} ${stage}: not seated (${r.reason ?? r.posture})`); report.push({ ...seat, stage, ok: false, reason: r.reason ?? r.posture }); continue; }
      await page.waitForTimeout(900);        // a stage's parts and skin load
      await frames(40);
      // how the body sits against the slot: lowest skin point of hips and thighs over the slot's height, and the root
      const m = await page.evaluate(async ([id2, objectId]) => {
        const h = window.hearthside;
        // the app's own three.js module (the dev server's dependency bundle)
        const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/deps\/three\.js/.test(n));
        const THREE = await import(/* @vite-ignore */ url);
        const person = h.view.people.entries.get(id2);
        const obj = h.view.objects.objects.get(objectId);
        const model = obj?.model ?? obj?.root ?? obj?.group ?? null;
        if (!person || !model) return { probe: false, why: `person ${!!person} model ${!!model} keys ${obj ? Object.keys(obj).join(',') : ''}` };
        person.view.root.updateMatrixWorld(true); model.updateMatrixWorld(true);
        const solids = []; model.traverse((o) => { if (o.isMesh && o.visible) solids.push(o); });
        const ray = new THREE.Raycaster(); ray.firstHitOnly = false;
        const up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
        // a body point is inside the furniture when a ray from it straight up leaves through an odd number of surfaces
        // (front and back faces both count: the pieces are closed boxes)
        const parts = {}; let worst = 0, worstAt = null;
        person.view.root.traverse((o) => {
          if (!o.isSkinnedMesh || !o.visible) return;
          let n = o.parent; while (n && !/^Body_/.test(n.name)) n = n.parent;
          const region = (/^Body_/.test(o.name) ? o.name : n?.name ?? 'part').replace('Body_', '');
          if (!/^(head|neck|chest|belly|hips|thigh|calf|foot|upperarm|forearm|hand)/.test(region)) return;      // the body itself
          const pos = o.geometry.getAttribute('position');
          const step = Math.max(1, Math.floor(pos.count / 60));
          const key = region.replace(/_[lr]$/, '');
          const acc = parts[key] ?? (parts[key] = { n: 0, inside: 0, deep: 0 });
          for (let i = 0; i < pos.count; i += step) {
            o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld);
            ray.set(v, up); ray.near = 0; ray.far = 3;
            const mats = solids.map((mm) => mm.material); for (const mm of solids) { const list = Array.isArray(mm.material) ? mm.material : [mm.material]; for (const x of list) { x.__side = x.side; x.side = THREE.DoubleSide; } }
            const hits = ray.intersectObjects(solids, false);
            for (const mm of solids) { const list = Array.isArray(mm.material) ? mm.material : [mm.material]; for (const x of list) x.side = x.__side; }
            acc.n++;
            if (hits.length % 2 === 1) { acc.inside++; const d = hits[0].distance; acc.deep = Math.max(acc.deep, d); if (d > worst) { worst = d; worstAt = key; } }
          }
        });
        for (const k of Object.keys(parts)) { parts[k].deep = Math.round(parts[k].deep * 1000) / 1000; parts[k].share = Math.round(100 * parts[k].inside / Math.max(1, parts[k].n)); }
        const loc = h.game.state().people[id2].location;
        let lowThigh = 1e9; const vv = new THREE.Vector3();
        person.view.root.traverse((o) => { if (!o.isSkinnedMesh) return; let n = o.parent; while (n && !/^Body_/.test(n.name)) n = n.parent; const nm = /^Body_/.test(o.name) ? o.name : n?.name ?? ''; if (!/hips|thigh/.test(nm)) return; const pos = o.geometry.getAttribute('position'); for (let i = 0; i < pos.count; i++) { o.getVertexPosition(i, vv); vv.applyMatrix4(o.matrixWorld); lowThigh = Math.min(lowThigh, vv.y); } });
        const dbg = { lowThigh: +lowThigh.toFixed(3), rootScale: +person.view.root.scale.x.toFixed(3), slot: person.slot ? { h: person.slot.height, kind: person.slot.kind } : null, align: person.align, posture: person.posture, stage: h.game.state().people[id2].lifeStage, viewStage: person.view.stage, modular: person.view.modular, frame: h.game.state().people[id2].appearance.frame, anim: h.game.state().people[id2].anim?.id };
        {
          // which way the sitter faces against the seat's backrest (the top fifth of the model): the feet must be on the other side
          const box = new THREE.Box3().setFromObject(model); const c = new THREE.Vector3(); let n = 0; const q = new THREE.Vector3();
          model.traverse((mm) => { if (!mm.isMesh) return; const pp = mm.geometry.getAttribute('position'); for (let i = 0; i < pp.count; i++) { q.fromBufferAttribute(pp, i).applyMatrix4(mm.matrixWorld); if (q.y > box.max.y - (box.max.y - box.min.y) * 0.2) { c.add(q); n++; } } });
          c.multiplyScalar(1 / Math.max(1, n)); const ctr = box.getCenter(new THREE.Vector3());
          const bone = (nm) => { let b = null; person.view.root.traverse((o) => { if (o.isBone && o.name === nm) b = o; }); return b.getWorldPosition(new THREE.Vector3()); };
          const pel = bone('pelvis'), foot = bone('foot_l'), head = bone('Head');
          const bx = c.x - ctr.x, bz = c.z - ctr.z, bl = Math.hypot(bx, bz) || 1;
          dbg.feetFromBack = +(((foot.x - pel.x) * bx + (foot.z - pel.z) * bz) / bl).toFixed(2);      // negative: the feet are in front
          dbg.footY = +foot.y.toFixed(2); dbg.headY = +head.y.toFixed(2);
          const f2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
        }
        dbg.facing = +loc.facing.toFixed(2); dbg.slotFacing = person.slot ? +person.slot.facing.toFixed(2) : null; dbg.edge = person.slot && person.slot.kind === 'sit' ? h.view.objects.seatEdge(person.slot, 0) : null; dbg.rootRot = +person.view.root.rotation.y.toFixed(2);
        return { probe: true, dbg, facing: loc.facing, rootY: person.view.root.position.y, worst: Math.round(worst * 1000) / 1000, worstAt, parts };
      }, [r.id, seat.objectId]);
      if (!m.probe) console.log('[seats] probe failed', m.why);
      if (m.probe) console.log('[seats]   dbg', JSON.stringify({ lowThigh: m.dbg.lowThigh, seat: m.dbg.slot?.h, scale: m.dbg.rootScale, edge: m.dbg.edge, feetFromBack: m.dbg.feetFromBack, footY: m.dbg.footY, raw: opt('raw', '') ? m.dbg.raw : undefined }));
      if (!m.probe) { /* reported above */ }
      else console.log(`[seats]   inside ${JSON.stringify(Object.fromEntries(Object.entries(m.parts).filter(([, x]) => x.inside).map(([k, x]) => [k, `${x.share}%/${x.deep}m`])))}`);
      for (const [tag, yaw] of [['a', 0], ['b', 1], ['c', 2], ['d', 3]]) {
        await page.evaluate(([cx, cz, y]) => { const h = window.hearthside; h.view.rig.setYawStep(y); h.game.view.setCutaway('cutaway'); h.view.rig.glideTo(cx, cz, 520, 0, 0.05); }, [r.x, r.z, yaw]);
        await frames(24);
        await page.screenshot({ timeout: 180000, path: join(OUT, `${seat.defId}_${stage}_${tag}.png`), clip: { x: 250, y: 100, width: 600, height: 500 } });
      }
      report.push({ ...seat, stage, ok: true, posture: r.posture, ...m });
      console.log(`[seats] ${seat.defId} ${stage}: ${r.posture}`);
    }
  }
  writeFileSync(join(OUT, 'seats.json'), JSON.stringify(report, null, 1));
  if (errors.length) console.log(`[game] ${errors.length} console errors, first: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
} finally {
  await browser?.close();
  server.kill();
}
