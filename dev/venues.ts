// DEV ONLY: renders the generated venue and home lots (src/world/venues.ts) with the game's own lot and object views.
// Serve with `npx vite` and open /dev/venues.html?lot=cafe&view=iso
// URL parameters: lot = park | cafe | gym | library | arts | market | home0..home5; view = top | iso | iso2 | iso3 | iso4 (the four
// dollhouse yaws); walls = up | cutaway | down; shot=1 hides the toolbar; size = pixels per metre override.
// window.__venues exposes { ready, lot, problems, objects } for automated screenshots (tools: dev/venues-shots.mjs).

import * as THREE from 'three';
import { content } from '../src/content/index';
import { createEmptyWorld } from '../src/core/state';
import { GameView } from '../src/render/gameView';
import { createLot } from '../src/world/lots';
import { buildResidentialLot, buildVenueLot, lotProblems } from '../src/world/venues';

const LOTS = ['cafe', 'gym', 'library', 'arts', 'market', 'park', 'home0', 'home1', 'home2', 'home3', 'home4', 'home5'] as const;
const VIEWS = ['top', 'iso', 'iso2', 'iso3', 'iso4'] as const;
const params = new URLSearchParams(location.search);
const lotParam = params.get('lot') ?? 'cafe';
const viewParam = params.get('view') ?? 'iso';
const wallsParam = (params.get('walls') ?? 'cutaway') as 'up' | 'cutaway' | 'down';
if (params.get('shot') === '1') document.body.classList.add('shot');

interface VenuesState { ready: boolean; lot: string; view: string; problems: string[]; objects: number; error: string | null }
const info: VenuesState = { ready: false, lot: lotParam, view: viewParam, problems: [], objects: 0, error: null };
(window as unknown as { __venues: VenuesState }).__venues = info;
window.addEventListener('error', (e) => { info.error = String(e.message); });

const bar = document.getElementById('bar')!;
const link = (label: string, patch: Record<string, string>, on: boolean) => {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(patch)) q.set(k, v);
  return `<a href="?${q.toString()}" class="${on ? 'on' : ''}">${label}</a>`;
};
bar.innerHTML = `<strong>Venue lots</strong><span class="sep"></span>${LOTS.map((l) => link(l, { lot: l }, l === lotParam)).join('')}<span class="sep"></span>`
  + `${VIEWS.map((v) => link(v, { view: v }, v === viewParam)).join('')}<span class="sep"></span>`
  + `${(['up', 'cutaway', 'down'] as const).map((w) => link(`walls ${w}`, { walls: w }, w === wallsParam)).join('')}<span id="status"></span>`;

async function main(): Promise<void> {
  const db = content();
  const state = createEmptyWorld(11, 'create');
  const isHome = lotParam.startsWith('home');
  const size = !isHome && ['park', 'arts', 'market'].includes(lotParam) ? 32 : 24;
  const lot = createLot(state, {
    name: lotParam, address: '1 Dev Lane', width: size, depth: size, kind: isHome ? 'residential' : 'venue', landValue: 100000,
    entry: { x: size / 2, z: size - 1, level: 0 }, ...(isHome ? {} : { venueType: lotParam }), ...{},
  });
  lot.ground = isHome ? 'grass' : 'paving';
  if (isHome) buildResidentialLot(state, db, lot.id, Number(lotParam.slice(4)));
  else buildVenueLot(state, db, lot.id, lotParam as never);
  state.activeLotId = lot.id;
  state.clock.minutes = 1440 + 12 * 60;
  info.problems = lotProblems(state, db, lot.id);
  info.objects = Object.keys(lot.objects).length;

  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const view = new GameView(canvas, db, null, { quality: 'high', shadows: false, reducedMotion: true, weatherEffects: true }, '/assets/');
  await view.objectAssets.loadManifest();
  await view.objectAssets.preload(new Set(Object.values(lot.objects).map((o) => db.objects[o.defId]!.model.asset)));
  view.setWorld(state, true);
  view.setCutaway(wallsParam);
  const yaw = { iso: 0, iso2: 1, iso3: 2, iso4: 3 } as const;
  const ppmOverride = Number(params.get('size') ?? 0);

  // top view: a straight-down orthographic camera over the whole lot
  const top = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  let frames = 0;
  const frame = (): void => {
    if (viewParam === 'top') {
      const r = view.ctx.renderer;
      const w = view.ctx.width, h = view.ctx.height;
      const half = Math.max(lot.width, lot.depth) / 2 + 0.5;
      const aspect = w / h;
      top.left = -half * Math.max(1, aspect); top.right = half * Math.max(1, aspect);
      top.top = half * Math.max(1, 1 / aspect); top.bottom = -half * Math.max(1, 1 / aspect);
      top.updateProjectionMatrix();
      top.position.set(lot.width / 2, 40, lot.depth / 2);
      top.up.set(0, 0, -1);
      top.lookAt(lot.width / 2, 0, lot.depth / 2);
      if (frames < 2) view.render('live', 0.016, 1); // lighting, doors and detail maps; later frames only redraw from above
      r.render(view.scene, top);
    } else {
      view.render('live', 0.016, 1);
    }
  };
  view.render('live', 0.016, 1); // first frame applies the canvas size, which the camera framing needs
  if (viewParam !== 'top') {
    view.rig.setYawStep(yaw[viewParam as keyof typeof yaw] ?? 0);
    // frame the whole lot (or the part given by focus=x0,z0,x1,z1), not just the building
    const focus = (params.get('focus') ?? `0,0,${lot.width},${lot.depth}`).split(',').map(Number) as [number, number, number, number];
    const w = focus[2] - focus[0], d = focus[3] - focus[1];
    view.rig.glideTo(focus[0] + w / 2, focus[1] + d / 2, ppmOverride > 0 ? ppmOverride : view.rig.fitPpm(w, d, 2.8, 1.02), 0);
  }
  document.getElementById('status')!.textContent = `${lot.name}: ${info.objects} objects, ${info.problems.length} problems`;
  // a few frames (models and detail maps finish loading meanwhile), then stop: software GL is slow and screenshots need an idle page
  const loop = () => {
    frame();
    if (++frames < 30) setTimeout(() => requestAnimationFrame(loop), 120);
    else info.ready = true;
  };
  loop();
}

main().catch((e) => { info.error = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e); console.error(e); });
