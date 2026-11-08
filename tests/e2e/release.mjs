#!/usr/bin/env node
// Milestone 13 release scenario (brief section 26, "release acceptance"), in a real browser under SwiftShader:
//
//   node tests/e2e/release.mjs [--no-build] [--only=portrait,landscape,desktop] [--weeks=8] [--shots=DIR]
//   npm run e2e:release
//
// A new player (1) creates a household in the creator with real taps and moves in, (2) builds a home extension with a second floor
// and a staircase and furnishes it (Build and Buy API; same GameAPI calls the tools make), (3) takes jobs and lives through several
// game weeks at fast speed (a game day with real frames at speed 3, the rest stepped) until somebody is promoted, with the bills
// paid, (4) has formed relationships, (5) visits a venue and comes home, (6) saves through the menu, reloads the page, loads through
// the main menu and compares the state, (7) opens the social dialogs once each - the event planner with its "Where?" select, the gift
// picker, the map's "What's on this week" list and the move dialog with its furniture choice - and keeps screenshots.
// Default viewports: portrait 390x844 and landscape 844x390 (touch). Screenshots: dev/shots/release/<viewport>-<name>.png.
// Fails on page errors, console errors and failed requests.
//
// The script takes the shared browser lock itself (never wrap it in flock).

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { VIEWPORTS, parseArgs, root, settingsInit, sleep, startBrowser, withBrowserLock } from './common.mjs';

const { argv, flag, opt } = parseArgs();
withBrowserLock(import.meta.url, argv);

const ONLY = opt('only', 'portrait,landscape').split(',');
const MAX_WEEKS = Number(opt('weeks', 8));
const SHOTS = resolve(opt('shots', join(root, 'dev/shots/release')));
const OUT = join(root, 'tests/e2e/out/release');
mkdirSync(OUT, { recursive: true });
const T0 = Date.now();
const log = (...a) => console.log(`[release +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
const results = [];

async function runViewport(browser, url, name) {
  const vp = VIEWPORTS[name];
  const touch = !!vp.hasTouch;
  const context = await browser.newContext({ ...vp, deviceScaleFactor: 1 });
  await context.addInitScript(settingsInit());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}${m.location()?.url ? ` @ ${m.location().url}` : ''}`); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });

  const check = (step, what, cond, evidence = '') => {
    results.push({ viewport: name, step, what, ok: !!cond, evidence: String(evidence).slice(0, 400) });
    log(`${cond ? 'PASS' : 'FAIL'} [${name}] ${step} ${what}${evidence ? ` -- ${String(evidence).slice(0, 200)}` : ''}`);
    return !!cond;
  };
  const dir = join(SHOTS);
  mkdirSync(dir, { recursive: true });
  const shot = async (label) => {
    await page.evaluate(() => { try { window.hearthside?.debug.frame(1 / 30); } catch { /* ignore */ } });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => undefined);
    const file = join(dir, `${name}-${label}.png`);
    await page.screenshot({ path: file, timeout: 120000 });
    return file;
  };
  const frames = (n = 3, dt = 1 / 30) => page.evaluate(([n2, dt2]) => { for (let i = 0; i < n2; i++) window.hearthside.debug.frame(dt2); }, [n, dt]);
  const tap = async (loc, o = {}) => {
    try { if (touch) await loc.tap({ timeout: 30000, ...o }); else await loc.click({ timeout: 30000, ...o }); } catch (e) {
      log(`tap retry: ${String(e?.message ?? e).split('\n')[0]}`);
      if (touch) await loc.tap({ timeout: 60000, ...o }); else await loc.click({ timeout: 60000, ...o });
    }
  };
  const snapshot = () => page.evaluate(() => {
    const st = window.hearthside.debug.state();
    const hh = st.households[st.activeHouseholdId];
    const lot = st.lots[hh.homeLotId];
    const stairs = Object.values(lot.objects).filter((o) => /^stair/.test(o.defId)).length;
    const rel = Object.values(st.relationships).filter((r) => hh.memberIds.includes(r.from) && !hh.memberIds.includes(r.to) && r.familiarity > 0).length;
    return {
      clock: Math.round(st.clock.minutes), funds: hh.funds, name: hh.name,
      people: hh.memberIds.map((id) => ({ n: st.people[id].firstName, career: st.people[id].career && { id: st.people[id].career.careerId, level: st.people[id].career.level, days: st.people[id].career.daysWorked } })),
      levels: lot.levels, objects: Object.keys(lot.objects).length, walls: Object.keys(lot.walls).length, floors: Object.keys(lot.floors).length, stairs, rel,
      bills: (st.bills ?? []).filter((b) => b.householdId === hh.id).map((b) => b.status).join(','),
    };
  });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  await frames(3);
  await shot('01-main-menu');

  // ---------------------------------------------------------------- 1. creator, real taps
  log(`--- [${name}] 1 creator`);
  await tap(page.getByRole('button', { name: /New Game/ }).first());
  await tap(page.getByText('Create a Household').first());
  await page.waitForFunction(() => window.hearthside.game.mode() === 'creator', null, { timeout: 60000 });
  await page.waitForSelector('.cr-panel', { timeout: 30000 });
  await page.waitForTimeout(2000);
  await frames(8);
  const first = page.getByLabel('First name').first();
  const last = page.getByLabel('Last name').first();
  await first.fill('Ada'); await first.press('Tab');
  await last.fill('Holm'); await last.press('Tab');
  await shot('02-creator');
  // walk the steps with Next until the household step, then add a roommate and name the house
  for (let i = 0; i < 12; i++) {
    if (await page.getByLabel('Household name').count()) break;
    await tap(page.locator('.cr-next'));
    await page.waitForTimeout(300);
    await frames(2);
  }
  const hhName = page.getByLabel('Household name').first();
  await hhName.fill('Holm House'); await hhName.press('Tab');
  await tap(page.getByRole('button', { name: 'Add a person' }).first());
  await page.waitForSelector('.cr-sheet-actions', { timeout: 5000 });
  await tap(page.locator('.cr-sheet-actions .row-btn', { hasText: 'Random person' }));
  await page.waitForTimeout(600);
  await frames(4);
  const tieSel = page.locator('.cr-tie-select').first();
  await tieSel.scrollIntoViewIfNeeded();
  await tieSel.selectOption({ label: 'Roommate' });
  for (let i = 0; i < 4; i++) {
    if (await page.locator('.cr-move-in').count()) break;
    await tap(page.locator('.cr-next'));
    await page.waitForTimeout(300);
  }
  await frames(4);
  await shot('03-creator-review');
  const moveIn = page.locator('.cr-move-in');
  check('1', 'review step: Move In is enabled', await moveIn.isEnabled(), (await page.locator('.cr-fix-list').count()) ? 'issues listed' : '');
  await tap(moveIn);
  await page.waitForFunction(() => ['live', 'buy', 'build'].includes(window.hearthside.game.mode()), null, { timeout: 60000 });
  await page.evaluate(() => window.hearthside.game.setSpeed(0));
  await page.waitForTimeout(1000);
  await frames(6);
  const s1 = await snapshot();
  check('1', 'two people created, household named, home on one floor', s1.people.length === 2 && s1.name === 'Holm House' && s1.levels === 1, JSON.stringify(s1));
  const members = await page.evaluate(() => { const st = window.hearthside.debug.state(); return st.households[st.activeHouseholdId].memberIds; });
  await shot('04-live-after-move-in');

  // ---------------------------------------------------------------- 2. build an extension with a second floor, stairs and furniture
  log(`--- [${name}] 2 build`);
  const built = await page.evaluate(() => {
    const g = window.hearthside.game, st = g.state();
    const floorDesign = Object.values(g.content.floorDesigns).find((d) => d.id === 'oak-planks') ?? Object.values(g.content.floorDesigns)[0];
    const OAK = { designId: floorDesign.id, paletteId: floorDesign.palettes[0].id };
    g.setMode('build');
    const out = [];
    const apply = (tool, from, to, level) => {
      g.setBuildTool(tool);
      const r = g.buildApply({ from, to, level });
      out.push({ tool: tool.kind, ok: r.ok, reason: r.ok ? '' : r.reason });
      return r;
    };
    apply({ kind: 'room', floor: OAK, doors: [{ defId: 'door-panel', side: 's' }] }, { x: 7, z: 0 }, { x: 15, z: 4 }, 0);
    apply({ kind: 'stairs', defId: 'stair-straight-basic', rot: 1 }, { x: 9.5, z: 1.5 }, undefined, 0);
    apply({ kind: 'room', floor: OAK }, { x: 7, z: 0 }, { x: 15, z: 4 }, 1);
    g.setBuildTool(null);
    return { out, funds: g.state().households[g.state().activeHouseholdId].funds };
  });
  check('2', 'extension, staircase and upper room built', built.out.length === 3 && built.out.every((r) => r.ok), JSON.stringify(built.out));
  const s2 = await snapshot();
  check('2', 'the home has two floors and a staircase', s2.levels === 2 && s2.stairs === 1, `levels ${s2.levels}, stairs ${s2.stairs}`);
  await page.evaluate(() => { const g = window.hearthside.game; g.view.setLevel?.(1); window.hearthside.view.frameLot(true); });
  await frames(10);
  await shot('05-build-second-floor');

  // furnish: a bed and a dresser upstairs, a sofa and a desk below (Buy mode: the placement preview follows a screen point)
  const furnished = await page.evaluate(async () => {
    const g = window.hearthside.game, v = window.hearthside.view;
    const defs = Object.values(g.content.objects).filter((d) => d.status === 'ready' && d.price > 0);
    const cheapest = (cat) => defs.filter((d) => d.category === cat).sort((a, b) => a.price - b.price)[0];
    const jobs = [[cheapest('beds'), 1, 8.5, 2.5], [cheapest('seating'), 0, 13.5, 1.5], [cheapest('surfaces') ?? cheapest('tables'), 0, 12.5, 3.5]].filter((j) => j[0]);
    const results = [];
    g.setMode('buy');
    for (const [def, level, x, z] of jobs) {
      g.view.setLevel?.(level);
      await new Promise((r) => requestAnimationFrame(() => r()));
      window.hearthside.debug.frame(1 / 30);
      const r0 = g.startPlacement(def.id);
      if (!r0.ok) { results.push({ id: def.id, ok: false, reason: r0.reason }); continue; }
      const s = g.view.worldToScreen(x, level * 3, z);
      g.placementAt(s.x, s.y);
      window.hearthside.debug.frame(1 / 30);
      const r = g.confirmPlacement();
      results.push({ id: def.id, level, ok: r.ok, reason: r.ok ? '' : r.reason });
      if (!r.ok) g.cancelPlacement();
    }
    g.setMode('live');
    g.view.setLevel?.(0);
    return results;
  });
  check('2', 'furniture bought and placed in the extension (at least two pieces)', furnished.filter((r) => r.ok).length >= 2, JSON.stringify(furnished));
  log(`the extension, stairs, upper room and furniture cost ${(s1.funds - (await snapshot()).funds) / 100} dollars of ${s1.funds / 100}`);
  await frames(6);
  await shot('06-furnished');

  // ---------------------------------------------------------------- 3. jobs and several game weeks at fast speed
  log(`--- [${name}] 3 weeks`);
  const jobs = await page.evaluate((ids) => {
    const g = window.hearthside.game, st = g.state();
    const careers = Object.values(g.content.careers).filter((c) => c.status === 'ready' && !c.partTime);
    const pick = ['culinary', 'software'];
    // the creator may have given somebody a starting job already; everyone else takes one now
    const out = ids.map((id, i) => {
      if (st.people[id].career) return { id, career: st.people[id].career.careerId, r: { ok: true }, had: true };
      const def = careers.find((c) => c.id === pick[i]) ?? careers[i];
      return { id, career: def.id, r: g.joinCareer(id, def.id) };
    });
    // the first bill was issued at move-in: pay what is open, then let auto-pay handle the rest
    const paid = [];
    for (const b of (st.bills ?? []).filter((x) => x.householdId === st.activeHouseholdId && x.status !== 'paid')) paid.push(g.payBill(ids[0], b.id).ok);
    g.setAutoPayBills(ids[0], true);
    g.setSimSettings({ aging: 'off' });
    return out.map((o) => ({ ...o, billsPaid: paid.length }));
  }, members);
  check('3', 'both people have a job', jobs.every((j) => j.r.ok), JSON.stringify(jobs));
  const startFunds = (await snapshot()).funds;
  // a game day at speed 3 with real frames: the speed button's effect is the real loop
  const speedProbe = await page.evaluate(async () => {
    const g = window.hearthside.game;
    g.setSpeed(3);
    const t0 = g.state().clock.minutes;
    for (let i = 0; i < 40; i++) window.hearthside.debug.frame(0.25);
    return { speed: g.speed(), advanced: g.state().clock.minutes - t0 };
  });
  check('3', 'fast speed advances the clock in the real loop', speedProbe.speed === 3 && speedProbe.advanced > 30, JSON.stringify(speedProbe));
  const weekly = [];
  let promoted = false;
  for (let w = 0; w < MAX_WEEKS && !promoted; w++) {
    await page.evaluate(() => window.hearthside.debug.step(7 * 1440 * 4));
    await frames(4);
    const s = await snapshot();
    weekly.push({ week: w + 1, funds: s.funds, levels: s.people.map((p) => p.career?.level ?? 0), rel: s.rel, bills: s.bills });
    promoted = s.people.some((p) => (p.career?.level ?? 0) >= 2);
    log(`week ${w + 1}: ${JSON.stringify(weekly[weekly.length - 1])}`);
    const mode = await page.evaluate(() => window.hearthside.game.mode());
    if (mode !== 'live') break;
  }
  check('3', 'lived through at least three game weeks', weekly.length >= 3 || promoted, `${weekly.length} weeks`);
  check('3', 'somebody was promoted', promoted, JSON.stringify(weekly.map((w) => w.levels)));
  const s3 = await snapshot();
  check('3', 'wages arrived and bills were paid (no overdue or cut-off bill)', s3.funds > startFunds - 3000 && !/overdue|cutoff/.test(s3.bills), `funds ${startFunds} -> ${s3.funds}; bills ${s3.bills}`);
  const needs = await page.evaluate(() => { const st = window.hearthside.debug.state(); return st.households[st.activeHouseholdId].memberIds.map((id) => { const n = st.people[id].needs; const k = Object.keys(n).sort((a, b) => n[a] - n[b])[0]; return `${st.people[id].firstName} ${k} ${Math.round(n[k])}`; }); });
  check('3', 'nobody is collapsing (lowest need of each person above 5)', needs.every((n) => Number(n.split(' ').pop()) > 5), `lowest needs: ${needs.join(', ')}`);
  await page.evaluate(() => window.hearthside.game.setSpeed(0));
  await frames(4);
  await shot('07-after-weeks');

  // ---------------------------------------------------------------- 4. relationship
  log(`--- [${name}] 4 relationship`);
  const rel = await page.evaluate((ids) => {
    const st = window.hearthside.debug.state();
    const known = Object.values(st.relationships).filter((r) => ids.includes(r.from) && !ids.includes(r.to) && r.familiarity > 0);
    return { known: known.length, best: Math.max(0, ...known.map((r) => r.friendship)), labels: known.map((r) => r.label ?? 'stranger').slice(0, 6) };
  }, members);
  check('4', 'the household has met neighbours (a relationship formed)', rel.known >= 1, JSON.stringify(rel));

  // ---------------------------------------------------------------- 5. a venue
  log(`--- [${name}] 5 venue`);
  let trip = { ok: false, reason: 'not tried' };
  for (let attempt = 0; attempt < 24 && !trip.ok; attempt++) {
    trip = await page.evaluate((ids) => {
      const g = window.hearthside.game;
      const info = g.neighbourhood();
      const venues = info.lots.filter((l) => l.kind === 'venue' && !l.isHome);
      let last = { ok: false, reason: 'no venue' };
      for (const venue of venues) for (const id of ids) {
        const problem = g.travelProblem([id], venue.id);
        if (problem) { last = { ok: false, reason: problem, venue: venue.name }; continue; }
        const r = g.travel([id], venue.id);
        if (r.ok) return { ok: true, reason: '', venue: venue.name, lotId: venue.id, who: id };
        last = { ok: false, reason: r.reason, venue: venue.name };
      }
      return last;
    }, members);
    // somebody at work or asleep, or the venue closed: let an hour pass and try again
    if (!trip.ok) await page.evaluate(() => window.hearthside.debug.step(240));
  }
  if (!trip.ok) log('travel not possible right now:', JSON.stringify(trip));
  let arrived = false;
  if (trip.ok) {
    for (let i = 0; i < 40 && !arrived; i++) {
      await page.evaluate(() => window.hearthside.debug.step(60));
      arrived = await page.evaluate((lotId) => window.hearthside.debug.state().activeLotId === lotId, trip.lotId);
    }
    await frames(8);
    await shot('08-venue');
  }
  check('5', 'visited a venue (the lot became active)', trip.ok && arrived, JSON.stringify(trip));
  if (arrived) {
    await page.evaluate(() => window.hearthside.game.goHome());
    let home = false;
    for (let i = 0; i < 40 && !home; i++) {
      await page.evaluate(() => window.hearthside.debug.step(60));
      home = await page.evaluate(() => { const st = window.hearthside.debug.state(); return st.activeLotId === st.households[st.activeHouseholdId].homeLotId; });
    }
    await frames(6);
    check('5', 'came home again', home);
  }
  await page.evaluate(() => { window.hearthside.game.setSpeed(0); window.hearthside.view.frameLot(true); });

  // ---------------------------------------------------------------- 6. save, reload, load, compare
  log(`--- [${name}] 6 save and reload`);
  const before = await snapshot();
  await tap(page.locator('.menu-btn'));
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.waitForTimeout(300);
  await tap(page.locator('.modal .row-btn', { hasText: 'Save game' }));
  await page.waitForSelector('.slot-main', { timeout: 6000 });
  await page.waitForTimeout(300);
  await tap(page.locator('.modal button', { hasText: /Save here|Overwrite/ }).first());
  const nameInput = page.locator('.modal input[type="text"]').last();
  await nameInput.waitFor({ timeout: 4000 });
  await nameInput.fill('Release run');
  await tap(page.locator('.modal button', { hasText: /^Save$/ }).last());
  await page.waitForTimeout(1200);
  const slots = await page.evaluate(() => window.hearthside.game.listSaves());
  const mine = slots.find((s) => s.name === 'Release run' && !s.empty);
  check('6', 'the save slot exists with the funds at save time', !!mine && mine.funds === before.funds, JSON.stringify(mine));
  if (await page.locator('.modal').count()) await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.hearthside?.ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  await frames(3);
  await shot('09-menu-after-reload');
  await tap(page.getByRole('button', { name: /Load Game/ }).first());
  await page.waitForSelector('.slot-main', { timeout: 8000 });
  await page.waitForTimeout(300);
  const loadBtn = page.locator('.modal button[aria-label="Load Release run"]');
  check('6', 'the load dialog lists the save after the reload', (await loadBtn.count()) === 1);
  await tap(loadBtn);
  await page.waitForFunction(() => ['live', 'buy', 'build'].includes(window.hearthside.game.mode()), null, { timeout: 60000 });
  await page.evaluate(() => window.hearthside.game.setSpeed(0));
  await page.waitForTimeout(1200);
  await frames(8);
  const after = await snapshot();
  const keys = ['funds', 'name', 'levels', 'objects', 'walls', 'floors', 'stairs', 'rel', 'bills'];
  const diffs = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (JSON.stringify(before.people) !== JSON.stringify(after.people)) diffs.push('people/careers');
  check('6', 'after reload and load everything persisted (funds, floors, stairs, objects, careers, relationships)', diffs.length === 0, diffs.length ? `${diffs.join(',')}: ${JSON.stringify(before)} vs ${JSON.stringify(after)}` : JSON.stringify(after));
  check('6', 'the clock resumed within a few minutes of the save', Math.abs(after.clock - before.clock) < 30, `${before.clock} -> ${after.clock}`);
  // the world still runs after the load
  await page.evaluate(() => window.hearthside.debug.step(400));
  const moved = (await snapshot()).clock - after.clock;
  check('6', 'the loaded game keeps simulating', moved > 50, `+${moved} minutes`);
  await page.evaluate(() => { window.hearthside.game.view.setLevel?.(0); window.hearthside.view.frameLot(true); });
  await frames(6);
  await shot('10-after-load');

  // ---------------------------------------------------------------- 7. the social dialogs, once each
  log(`--- [${name}] 7 dialogs`);
  const beforeDialogs = await snapshot();
  const ids = await page.evaluate(() => {
    const st = window.hearthside.debug.state();
    const hh = st.households[st.activeHouseholdId];
    const host = hh.memberIds[0];
    const known = Object.values(st.relationships).filter((r) => r.from === host && !hh.memberIds.includes(r.to) && !st.people[r.to]?.isNpc === false).sort((a, b) => b.familiarity - a.familiarity)[0];
    const anyNpc = Object.values(st.people).find((p) => p.isNpc && p.householdId !== hh.id);
    return { host, guest: known?.to ?? anyNpc?.id ?? null };
  });
  const emit = (what, personId, targetId) => page.evaluate(([w, p, t]) => window.hearthside.core.events.emit({ type: 'ui.request', what: w, personId: p, ...(t ? { targetId: t } : {}) }), [what, personId, targetId]);
  const modalOpen = () => page.locator('.modal').count();
  const closeModals = async () => { for (let i = 0; i < 4 && (await modalOpen()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } };

  // event planner with the "Where?" select
  await emit('planEvent', ids.host);
  await page.waitForSelector('.evp', { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  const where = page.locator('select.evp-where');
  const whereOptions = (await where.count()) ? await where.locator('option').allInnerTexts() : [];
  check('7', 'event planner opens with a "Where?" select listing home and venues', whereOptions.length >= 2 && (await page.getByText('Where?').count()) >= 1, whereOptions.join(' | '));
  if (whereOptions.length) await where.scrollIntoViewIfNeeded().catch(() => undefined);
  await page.waitForTimeout(200);
  await shot('11-event-planner');
  if (whereOptions.length >= 2) {
    await where.selectOption({ index: 1 });
    await page.waitForTimeout(400);
    check('7', 'choosing a venue in "Where?" updates the summary', (await page.locator('.evp-summary').innerText()).length > 0, (await page.locator('.evp-summary').innerText()).slice(0, 120));
    await shot('12-event-planner-venue');
  }
  await closeModals();

  // gift picker
  if (ids.guest) {
    await emit('giveGift', ids.host, ids.guest);
    await page.waitForSelector('.gift-picker', { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    const gifts = await page.locator('.gift-picker [data-gift]').count();
    check('7', 'the gift picker lists gifts with prices', gifts >= 3, `${gifts} gifts`);
    await shot('13-gift-picker');
    await closeModals();
  } else check('7', 'the gift picker lists gifts with prices', false, 'no neighbour to give to');

  // map: "What's on this week", then the move dialog with the furniture choice (real taps)
  await emit('map', ids.host);
  await page.waitForSelector('.nbm-map, .nbm-list', { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(700);
  const hasWhatsOn = await page.getByText("What's on this week").count();
  const eventRows = await page.locator('.nbm-events .nbm-event').count();
  check('7', "the map's \"What's on this week\" list shows events", hasWhatsOn >= 1 && eventRows >= 1, `${eventRows} events`);
  await page.locator('.nbm-events').first().scrollIntoViewIfNeeded().catch(() => undefined);
  await page.waitForTimeout(200);
  await shot('14-map-whats-on');
  // a venue's own sheet lists what is on there (in portrait the list of the whole week sits behind the map until a pin is chosen)
  const eventVenue = await page.evaluate(() => { const g = window.hearthside.game; const ev = g.neighbourhood().events ?? []; const l = ev[0] && g.neighbourhood().lots.find((x) => x.id === ev[0].lotId); return l ? l.name : null; });
  if (eventVenue) {
    await tap(page.locator('.nbm-pin', { hasText: eventVenue }).first());
    await page.waitForTimeout(500);
    const there = await page.locator('.nbm-detail .nbm-events .nbm-event').count();
    check('7', "a venue's sheet lists what is on there", there >= 1, `${eventVenue}: ${there} events`);
    await shot('14b-map-venue-events');
    const back = page.locator('.nbm-detail button[aria-label*="Back"], .nbm-sheet-close, .nbm-detail button:has-text("Back")').first();
    if (await back.count()) await tap(back).catch(() => undefined);
  }
  const forRent = await page.evaluate(() => {
    const info = window.hearthside.game.neighbourhood();
    return info.lots.filter((l) => l.tenure === 'for-rent' || l.tenure === 'for-sale').map((l) => ({ id: l.id, name: l.name, tenure: l.tenure }));
  });
  let moveShown = false;
  for (const lot of forRent.slice(0, 3)) {
    const pin = page.locator('.nbm-pin', { hasText: lot.name }).first();
    if (!(await pin.count())) continue;
    await tap(pin);
    await page.waitForTimeout(500);
    const mv = page.locator('.nbm-move');
    if (!(await mv.count()) || (await mv.first().isDisabled())) continue;
    await shot('15-map-lot-sheet');
    await tap(mv.first());
    await page.waitForSelector('.nbm-move-dialog', { timeout: 6000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    const choices = await page.locator('.nbm-move-dialog [data-furniture]').count();
    moveShown = choices >= 2;
    check('7', 'the move dialog offers the furniture choice (stay, come along, sell)', moveShown, `${choices} choices for ${lot.name}`);
    await shot('16-move-dialog');
    if (choices >= 2) { await tap(page.locator('.nbm-move-dialog [data-furniture]').nth(1)); await page.waitForTimeout(300); await shot('17-move-dialog-choice'); }
    // cancel: nothing moves
    await tap(page.locator('.nbm-move-dialog button', { hasText: 'Cancel' }));
    await page.waitForTimeout(300);
    break;
  }
  if (!moveShown) check('7', 'the move dialog offers the furniture choice (stay, come along, sell)', false, `no movable lot opened a dialog (${JSON.stringify(forRent)})`);
  await closeModals();
  const afterDialogs = await snapshot();
  check('7', 'cancelling the move changed nothing', afterDialogs.funds === beforeDialogs.funds && afterDialogs.objects === beforeDialogs.objects, `${beforeDialogs.funds} -> ${afterDialogs.funds}`);

  const errs = [...new Set(errors)];
  check('*', 'no page errors, console errors or failed requests', errs.length === 0, errs.slice(0, 5).join(' || '));
  await context.close();
}

async function main() {
  if (flag('clean-shots')) rmSync(SHOTS, { recursive: true, force: true });
  const rig = await startBrowser({ noBuild: flag('no-build'), log });
  try {
    for (const name of ONLY) {
      if (!VIEWPORTS[name]) continue;
      log(`=== ${name}`);
      try { await runViewport(rig.browser, rig.url, name); } catch (e) {
        results.push({ viewport: name, step: '*', what: 'viewport run aborted', ok: false, evidence: String(e?.stack ?? e).split('\n').slice(0, 5).join(' | ') });
        log(`FAIL [${name}] aborted: ${String(e?.message ?? e)}`);
      }
    }
  } finally {
    await rig.close();
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(results, null, 1));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n[release] ${results.length - failed.length}/${results.length} checks passed`);
  for (const f of failed) console.log(`  FAIL [${f.viewport}] ${f.step} ${f.what} -- ${f.evidence}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
