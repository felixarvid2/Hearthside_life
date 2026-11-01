// OWNER: UI editors agent. DEV ONLY: boots dev/buildbuy.html - the Buy and Build panels over a mock GameAPI
// with a simple top-down 2D view standing in for the renderer and a tiny stand-in for the shell's input
// handling (tap/hover routing to placementAt, selectObject, paintPreview, paintApply, eyedrop).
//
// URL parameters: mode=buy|build|live, scenario=placement|invalid|unaffordable|selected|detail|inventory|
// eyedropper|preview|closed, funds=<dollars>, sandbox=1, content=auto|mock|real.

import '../../styles/base.css';
import type { PickResult } from '../../../game/api';
import type { Hex } from '../../../core/types';
import { footprintTiles } from '../../../core/geometry';
import { tileKey } from '../../../core/ids';
import { formatMoney } from '../../../core/money';
import { button, toast } from '../../kit/components';
import { h, shieldWorld, toggleClass } from '../../kit/dom';
import { installLayoutTracking, layout, onLayoutChange } from '../../kit/layout';
import { mountBuyMode } from '../buyMode';
import { mountBuildMode } from '../../build/buildMode';
import { LOT_SIZE, MockGame } from './mockApi';
import './devPage.css';

type DevMode = 'live' | 'buy' | 'build';

export function startBuildBuyDev(): void {
  installLayoutTracking();
  const q = new URLSearchParams(location.search);
  const contentMode = (['auto', 'mock', 'real'] as const).find((m) => m === q.get('content')) ?? 'auto';
  const startMode: DevMode = q.get('mode') === 'build' ? 'build' : q.get('mode') === 'live' ? 'live' : 'buy';
  const funds = q.get('funds');
  const game = new MockGame({ contentMode, sandbox: q.get('sandbox') === '1', mode: startMode === 'build' ? 'build' : 'buy', ...(funds ? { funds: Number(funds) } : {}) });
  const api = game.api;
  const root = document.getElementById('ui-root')!;
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;

  // ---- stand-in top bar (the real HUD belongs to the shell) ----
  const modeBtns: Record<DevMode, HTMLButtonElement> = {
    live: button({ label: 'Live', icon: 'live', small: true, onClick: () => setMode('live') }),
    buy: button({ label: 'Buy', icon: 'buy', small: true, onClick: () => setMode('buy') }),
    build: button({ label: 'Build', icon: 'build', small: true, onClick: () => setMode('build') }),
  };
  const bar = h('div', { class: 'dev-topbar' }, h('span', { class: 'dev-tag', text: 'Dev mock' }), h('div', { class: 'dev-modes', role: 'group', ariaLabel: 'Mode' }, modeBtns.live, modeBtns.buy, modeBtns.build));
  shieldWorld(bar);
  root.appendChild(bar);

  const buyUi = mountBuyMode(root, api);
  const buildUi = mountBuildMode(root, api);
  let mode: DevMode = 'live';

  function setMode(m: DevMode): void {
    if (m === mode) return;
    mode = m;
    if (m !== 'live') api.setMode(m); else api.setMode('live');
    if (m === 'buy') { buildUi.hide(); buyUi.show(); } else if (m === 'build') { buyUi.hide(); buildUi.show(); } else { buyUi.hide(); buildUi.hide(); }
    for (const [k, b] of Object.entries(modeBtns)) { toggleClass(b, 'btn-primary', k === m); toggleClass(b, 'btn-secondary', k !== m); b.setAttribute('aria-pressed', String(k === m)); }
    requestDraw();
  }

  // ---- 2D view ----
  let ts = 16, ox = 0, oy = 0;
  game.screenToWorld = (sx, sy) => ({ x: (sx - ox) / ts, z: (sy - oy) / ts });

  function designColor(kind: 'wall' | 'floor', designId: string, paletteId: string): Hex {
    const d = (kind === 'wall' ? game.content.wallDesigns : game.content.floorDesigns)[designId];
    return (d?.palettes.find((p) => p.id === paletteId) ?? d?.palettes[0])?.colors[0] ?? '#cccccc';
  }

  function layoutView(): void {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ins = mode === 'buy' ? buyUi.getInsets() : mode === 'build' ? buildUi.getInsets() : { left: 0, right: 0, top: 0, bottom: 0 };
    const top = 60 + ins.top, availW = r.width - ins.left - ins.right, availH = r.height - top - ins.bottom;
    // frame the house area (tiles 2..18) so it stays readable on phones
    const span = 16;
    ts = Math.max(8, Math.min(availW / span, availH / span) * 0.96);
    ox = ins.left + availW / 2 - 10 * ts;
    oy = top + availH / 2 - 8 * ts;
  }

  let raf = 0;
  function requestDraw(): void { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }

  function draw(): void {
    layoutView();
    const r = canvas.getBoundingClientRect();
    ctx.fillStyle = '#cfdcb4';
    ctx.fillRect(0, 0, r.width, r.height);
    const lot = game.lot;
    ctx.strokeStyle = 'rgba(80,100,60,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= LOT_SIZE; i++) {
      ctx.beginPath(); ctx.moveTo(ox + i * ts, oy); ctx.lineTo(ox + i * ts, oy + LOT_SIZE * ts); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy + i * ts); ctx.lineTo(ox + LOT_SIZE * ts, oy + i * ts); ctx.stroke();
    }
    for (const [key, f] of Object.entries(lot.floors)) {
      const [, x, z] = key.split(':').map(Number);
      ctx.fillStyle = designColor('floor', f.designId, f.paletteId);
      ctx.fillRect(ox + x! * ts, oy + z! * ts, ts, ts);
    }
    // objects (rugs first, then floor, wall, surface)
    const order = { rug: 0, floor: 1, wall: 2, ceiling: 3, surface: 4 } as const;
    const objs = Object.values(lot.objects).sort((a, b) => order[game.def(a.defId)?.layer ?? 'floor'] - order[game.def(b.defId)?.layer ?? 'floor']);
    for (const o of objs) {
      const def = game.def(o.defId);
      if (!def) continue;
      const tiles = footprintTiles(o.x, o.z, def.footprint, o.rot);
      const minX = Math.min(...tiles.map((t) => t.x)), minZ = Math.min(...tiles.map((t) => t.z));
      const maxX = Math.max(...tiles.map((t) => t.x)) + 1, maxZ = Math.max(...tiles.map((t) => t.z)) + 1;
      const region = def.finishes[0];
      const sw = region?.swatches.find((s) => s.id === o.finishes[region.id]) ?? region?.swatches[0];
      const inset = def.layer === 'surface' ? 0.22 : def.layer === 'rug' ? 0.02 : 0.08;
      ctx.fillStyle = sw?.color ?? '#a08a70';
      ctx.globalAlpha = def.layer === 'rug' ? 0.55 : 1;
      roundRect(ox + (minX + inset) * ts, oy + (minZ + inset) * ts, (maxX - minX - 2 * inset) * ts, (maxZ - minZ - 2 * inset) * ts, ts * 0.15);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = o.id === game.selectedObj ? '#d9774b' : 'rgba(40,30,20,0.55)';
      ctx.lineWidth = o.id === game.selectedObj ? 3 : 1;
      ctx.stroke();
    }
    // walls
    const cut = game.cutawayMode;
    for (const w of Object.values(lot.walls)) {
      const x0 = ox + w.x * ts, z0 = oy + w.z * ts;
      const x1 = w.dir === 'h' ? x0 + ts : x0, z1 = w.dir === 'v' ? z0 + ts : z0;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = cut === 'down' ? 'rgba(60,50,40,0.35)' : '#5b5048';
      ctx.lineWidth = Math.max(3, ts * 0.22);
      ctx.beginPath(); ctx.moveTo(x0, z0); ctx.lineTo(x1, z1); ctx.stroke();
      const off = Math.max(2, ts * 0.12);
      for (const side of ['a', 'b'] as const) {
        const f = side === 'a' ? w.sideA : w.sideB;
        const s = side === 'a' ? -1 : 1;
        ctx.strokeStyle = designColor('wall', f.designId, f.paletteId);
        ctx.lineWidth = Math.max(2, ts * 0.1);
        ctx.beginPath();
        if (w.dir === 'h') { ctx.moveTo(x0 + 1, z0 + s * off); ctx.lineTo(x1 - 1, z1 + s * off); } else { ctx.moveTo(x0 + s * off, z0 + 1); ctx.lineTo(x1 + s * off, z1 - 1); }
        ctx.stroke();
      }
    }
    // ghost
    const p = game.placement;
    if (p) {
      const def = game.def(p.defId);
      if (def) {
        const tiles = footprintTiles(p.x, p.z, def.footprint, p.rot);
        ctx.fillStyle = p.ok ? 'rgba(77,154,91,0.55)' : 'rgba(200,71,61,0.55)';
        for (const t of tiles) ctx.fillRect(ox + t.x * ts + 1, oy + t.z * ts + 1, ts - 2, ts - 2);
        if (!p.ok) {
          ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
          for (const t of tiles) { ctx.beginPath(); ctx.moveTo(ox + t.x * ts + 3, oy + t.z * ts + 3); ctx.lineTo(ox + (t.x + 1) * ts - 3, oy + (t.z + 1) * ts - 3); ctx.stroke(); }
        }
        // front marker: rot 0 faces +z
        const s = tiles.reduce((a, t) => ({ x: a.x + t.x + 0.5, z: a.z + t.z + 0.5 }), { x: 0, z: 0 });
        const cx = s.x / tiles.length, cz = s.z / tiles.length;
        const dir = [{ x: 0, z: 1 }, { x: 1, z: 0 }, { x: 0, z: -1 }, { x: -1, z: 0 }][p.rot]!;
        ctx.fillStyle = '#2f2a26';
        ctx.beginPath(); ctx.arc(ox + (cx + dir.x * 0.35) * ts, oy + (cz + dir.z * 0.35) * ts, Math.max(3, ts * 0.12), 0, Math.PI * 2); ctx.fill();
      }
    }
    // build hover
    if (hoverPick && mode === 'build') {
      ctx.strokeStyle = '#2f6fd1'; ctx.lineWidth = 3;
      if (hoverPick.kind === 'floor') ctx.strokeRect(ox + hoverPick.tile.x * ts + 1.5, oy + hoverPick.tile.z * ts + 1.5, ts - 3, ts - 3);
    }
  }

  function roundRect(x: number, y: number, w: number, hh: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---- stand-in input routing (the shell's input state machine does this in the game) ----
  let down: { x: number; y: number; id: number } | null = null;
  let hoverPick: PickResult | null = null;
  const local = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function hover(x: number, y: number): void {
    if (mode === 'buy' && api.placement()) api.placementAt(x, y);
    if (mode === 'build') {
      hoverPick = api.view.pick(x, y);
      buildUi.setPreview(api.paintPreview(hoverPick));
      requestDraw();
    }
  }

  function tap(x: number, y: number, mouse: boolean): void {
    if (mode === 'buy') {
      if (api.placement()) {
        api.placementAt(x, y);
        if (mouse) { const r = api.confirmPlacement(); if (!r.ok) toast(r.reason, 'error'); }
        return;
      }
      const pick = api.view.pick(x, y);
      api.selectObject(pick.kind === 'object' ? pick.objectId : null);
    } else if (mode === 'build') {
      const pick = api.view.pick(x, y);
      const tool = api.paintTool();
      if (!tool) { toast('Choose a design first.', 'info'); return; }
      if (tool.kind === 'eyedropper') {
        const f = api.eyedrop(pick);
        if (!f) { toast(`No ${tool.target} finish there.`, 'warning'); return; }
        if (tool.target === 'wall') api.setPaintTool({ kind: 'wall', finish: f, scope: 'side' });
        else api.setPaintTool({ kind: 'floor', finish: f, scope: 'tile' });
        return;
      }
      const r = api.paintApply(pick);
      if (!r.ok) toast(r.reason, 'warning');
      buildUi.setPreview(api.paintPreview(pick));
    }
  }

  canvas.addEventListener('pointerdown', (e) => { const p = local(e); down = { ...p, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (down && Math.hypot(p.x - down.x, p.y - down.y) >= 8) down = null;
    if (e.pointerType === 'mouse' && !e.buttons) hover(p.x, p.y);
  });
  canvas.addEventListener('pointerup', (e) => { const p = local(e); if (down && down.id === e.pointerId) tap(p.x, p.y, e.pointerType === 'mouse'); down = null; });
  canvas.addEventListener('pointercancel', () => { down = null; });
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'r' || e.key === 'R') api.rotatePlacement(1);
    else if (e.key === 'Escape') { if (api.placement()) api.cancelPlacement(); else if (api.selectedObject()) api.selectObject(null); else if (mode === 'build') api.setPaintTool(null); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) api.redo(); else api.undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); api.redo(); }
  });

  api.onChange(() => requestDraw());
  onLayoutChange(() => requestDraw());
  window.addEventListener('resize', () => requestDraw());
  new ResizeObserver(() => requestDraw()).observe(document.body);
  for (const el of [buyUi.el, buildUi.el]) new MutationObserver(() => requestDraw()).observe(el, { subtree: true, attributes: true, attributeFilter: ['hidden', 'data-height', 'class'] });

  setMode(startMode);

  // ---- scenarios for screenshots ----
  const scenario = q.get('scenario');
  const sofa = game.objectByDef('sofa-tweed');
  switch (scenario) {
    case 'placement': api.startPlacement('bed-double-oak'); break;
    case 'invalid': api.startPlacement('bed-double-oak'); if (sofa) game.placeGhost(sofa.x, sofa.z - 1); break;
    case 'wall': api.startPlacement('bathroom-mirror'); game.placeGhost(12, 8); break;
    case 'unaffordable': api.startPlacement('computer-desktop'); game.placeGhost(14, 11); break;
    case 'selected': if (sofa) api.selectObject(sofa.id); break;
    case 'detail': buyUi.showItem(q.get('item') ?? 'bed-double-oak'); break;
    case 'inventory': (buyUi.el.querySelector('.tab[data-id="inventory"]') as HTMLElement | null)?.click(); break;
    case 'closed': (document.querySelector('.bb-mode:not([hidden]) [aria-label="Close panel"]') as HTMLElement | null)?.click(); break;
    case 'eyedropper': if (startMode === 'build') (buildUi.el.querySelector('.bb-eye-btn') as HTMLElement | null)?.click(); break;
    case 'preview':
      if (startMode === 'build') {
        (buildUi.el.querySelector('.bb-card') as HTMLElement | null)?.click();
        requestAnimationFrame(() => buildUi.setPreview({ ok: true, cost: 2700, count: 3 }));
      }
      break;
    default: break;
  }
  requestDraw();

  Object.assign(window, { __bb: { game, api, buyUi, buildUi, setMode, layout, formatMoney, tileKey } });
}
