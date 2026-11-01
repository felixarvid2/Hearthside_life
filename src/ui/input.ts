// World input on #game-canvas: pointer events (with capture) go through the pure InputMachine
// (src/ui/input/machine.ts); its effects become GameAPI calls depending on the mode.
//   live:  tap a household member to select them (tap again: their own menu), tap another person, an object or
//          an item to open the context menu for the selected person, tap the floor to walk there.
//   buy:   while placing, hover (mouse) or tap moves the preview; a mouse click also confirms. Otherwise a tap
//          selects the object under it (api.selectObject).
//   build: with a paint tool, hover (mouse) previews and a click applies; on touch the first tap previews and a
//          second tap on the same target applies. The eyedropper samples a finish and returns to the paint tool.
// Pan with one finger or any mouse button drag, pinch to zoom (two-finger twist rotates in 90-degree steps),
// wheel zooms at the cursor. Keyboard shortcuts per docs/UI_SPEC.md. Only active in live/buy/build; the
// creator may use the canvas freely while mode is 'creator'.

import type { FinishRef } from '../core/types';
import type { PaintTool, PickResult } from '../game/api';
import { toast } from './kit/components';
import { h, setText } from './kit/dom';
import { formatMoney, humanize } from './hud/format';
import type { Shell } from './hud/shell';
import { InputMachine, type InputEffect, type PointerKind } from './input/machine';
import { isTypingTarget, mapKey } from './input/keys';

export interface WorldInput { destroy(): void; reset(): void }

const KEY_PAN_SPEED = 640; // CSS px per second

export function pickKey(p: PickResult): string {
  switch (p.kind) {
    case 'person': return `p:${p.personId}`;
    case 'object': return `o:${p.objectId}`;
    case 'item': return `i:${p.itemId}`;
    case 'wall': return `w:${p.wallId}:${p.side}`;
    case 'floor': return `f:${p.level}:${p.tile.x}:${p.tile.z}`;
    default: return 'none';
  }
}

export function attachWorldInput(sh: Shell, canvas: HTMLElement, isBlocked: () => boolean): WorldInput {
  const { api } = sh;
  const machine = new InputMachine();
  const listeners: Array<() => void> = [];
  const on = <K extends keyof HTMLElementEventMap>(t: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
    t.addEventListener(type, fn as EventListener, opts);
    listeners.push(() => t.removeEventListener(type, fn as EventListener, opts));
  };
  const onWin = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
    window.addEventListener(type, fn as EventListener, opts);
    listeners.push(() => window.removeEventListener(type, fn as EventListener, opts));
  };

  const active = () => {
    const m = api.mode();
    return (m === 'live' || m === 'buy' || m === 'build') && !isBlocked();
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const kindOf = (e: PointerEvent): PointerKind => (e.pointerType === 'mouse' ? 'mouse' : e.pointerType === 'pen' ? 'pen' : 'touch');

  // ---- feedback elements ----
  const tip = h('div', { class: 'paint-tip', role: 'status', attrs: { 'aria-live': 'polite' } });
  tip.hidden = true;
  sh.layer.appendChild(tip);
  const showTip = (text: string, at: { x: number; y: number }, ok: boolean, neutral = false) => {
    const p = sh.canvasToRoot(at);
    setText(tip, text);
    tip.dataset.ok = neutral ? 'neutral' : String(ok); // 'neutral' keeps the default (non-error) colour
    tip.hidden = false;
    tip.style.left = `${Math.round(p.x)}px`;
    tip.style.top = `${Math.round(p.y)}px`;
  };
  const hideTip = () => { tip.hidden = true; };
  const ripple = (at: { x: number; y: number }) => {
    const p = sh.canvasToRoot(at);
    const r = h('div', { class: 'tap-ripple', attrs: { 'aria-hidden': 'true' } });
    r.style.left = `${p.x}px`;
    r.style.top = `${p.y}px`;
    sh.layer.appendChild(r);
    setTimeout(() => r.remove(), 600);
  };

  // ---- paint state ----
  let touchPreviewKey: string | null = null;
  let hoverKey: string | null = null;
  const lastTool: { wall: Extract<PaintTool, { kind: 'wall' }> | null; floor: Extract<PaintTool, { kind: 'floor' }> | null } = { wall: null, floor: null };
  const unsubChange = api.onChange((w) => {
    if (w === 'paint') {
      const t = api.paintTool();
      if (t?.kind === 'wall') lastTool.wall = t;
      if (t?.kind === 'floor') lastTool.floor = t;
      touchPreviewKey = null;
      hoverKey = null;
      hideTip();
    }
    if (w === 'mode') { reset(); hideTip(); }
  });

  const designName = (kind: 'wall' | 'floor', f: FinishRef) => (kind === 'wall' ? api.content.wallDesigns[f.designId]?.name : api.content.floorDesigns[f.designId]?.name) ?? humanize(f.designId);

  const previewText = (tool: PaintTool, pv: { ok: boolean; reason?: string; cost: number; count: number }) => {
    if (!pv.ok) return pv.reason ?? 'Cannot apply here';
    const what = tool.kind === 'wall' ? (pv.count === 1 ? 'wall side' : 'wall sides') : (pv.count === 1 ? 'floor tile' : 'floor tiles');
    return `${pv.count} ${what} · ${pv.cost ? formatMoney(pv.cost) : 'free'}`;
  };

  // ---- taps ----
  const liveTap = (pick: PickResult, at: { x: number; y: number }) => {
    const st = api.state();
    if (!st) return;
    const sel = api.selected();
    const needSelection = () => { toast('Select one of your household first: tap a portrait.', 'info', 2600); sh.sound('error'); };
    switch (pick.kind) {
      case 'person': {
        const p = st.people[pick.personId];
        const member = !!p && p.householdId === st.activeHouseholdId && !p.isNpc;
        if (member && sel !== pick.personId) { api.select(pick.personId); sh.sound('select'); return; }
        if (!sel) { needSelection(); return; }
        sh.openContextMenu(sel, pick, at);
        return;
      }
      case 'object':
      case 'item':
        if (!sel) { needSelection(); return; }
        sh.openContextMenu(sel, pick, at);
        return;
      case 'floor': {
        if (!sel) { needSelection(); return; }
        const r = api.goTo(sel, pick.tile);
        if (r.ok) { ripple(at); sh.sound('tap'); } else { toast(r.reason, 'warning', 2600); sh.sound('error'); }
        return;
      }
      default:
        return;
    }
  };

  const buyTap = (pick: PickResult, at: { x: number; y: number }, kind: PointerKind) => {
    if (api.placement()) {
      api.placementAt(at.x, at.y);
      if (kind === 'mouse') {
        const r = api.confirmPlacement();
        if (r.ok) sh.sound('place'); else { sh.sound('error'); toast(r.reason, 'warning', 2600); }
      } else sh.sound('tap');
      return;
    }
    if (pick.kind === 'object') { api.selectObject(pick.objectId); sh.sound('select'); }
    else if (api.selectedObject()) { api.selectObject(null); }
  };

  const buildTap = (pick: PickResult, at: { x: number; y: number }, kind: PointerKind) => {
    const tool = api.paintTool();
    if (!tool) return;
    if (tool.kind === 'eyedropper') {
      const f = api.eyedrop(pick);
      if (!f) { toast(`Nothing to pick up there. Tap a ${tool.target === 'wall' ? 'wall' : 'floor'}.`, 'info', 2400); sh.sound('error'); return; }
      const next: PaintTool = tool.target === 'wall'
        ? { kind: 'wall', finish: f, scope: lastTool.wall?.scope ?? 'side' }
        : { kind: 'floor', finish: f, scope: lastTool.floor?.scope ?? 'tile' };
      api.setPaintTool(next);
      sh.sound('select');
      toast(`Picked up ${designName(tool.target, f)}.`, 'success', 2200);
      return;
    }
    const key = pickKey(pick);
    if (kind === 'touch' && touchPreviewKey !== key) {
      const pv = api.paintPreview(pick);
      sh.paintPreviewShown(pv);
      touchPreviewKey = key;
      if (pv) { showTip(`${previewText(tool, pv)}${pv.ok ? ' · tap again to apply' : ''}`, at, pv.ok, !!pv.unchanged); sh.sound(pv.ok || pv.unchanged ? 'tap' : 'error'); }
      return;
    }
    const r = api.paintApply(pick);
    touchPreviewKey = null;
    hideTip();
    sh.paintPreviewShown(null);
    if (r.ok) { sh.sound('paint'); ripple(at); } else { sh.sound('error'); toast(r.reason, 'warning', 2600); }
  };

  const onTap = (x: number, y: number, kind: PointerKind) => {
    if (sh.closeContextMenu()) { sh.sound('close'); return; }
    const at = { x, y };
    const pick = api.view.pick(x, y);
    const m = api.mode();
    if (m === 'live') liveTap(pick, at);
    else if (m === 'buy') buyTap(pick, at, kind);
    else if (m === 'build') buildTap(pick, at, kind);
  };

  // ---- hover (mouse/pen), throttled to one per frame ----
  let hoverAt: { x: number; y: number } | null = null;
  let hoverRaf = 0;
  const processHover = () => {
    hoverRaf = 0;
    const at = hoverAt;
    hoverAt = null;
    if (!at || !active()) return;
    const m = api.mode();
    if (m === 'buy' && api.placement()) { api.placementAt(at.x, at.y); return; }
    if (m === 'build') {
      const tool = api.paintTool();
      if (!tool || tool.kind === 'eyedropper') { hideTip(); return; }
      const pick = api.view.pick(at.x, at.y);
      const key = pickKey(pick);
      if (key !== hoverKey) {
        hoverKey = key;
        const pv = api.paintPreview(pick);
        sh.paintPreviewShown(pv);
        if (pv) showTip(previewText(tool, pv), at, pv.ok, !!pv.unchanged); else hideTip();
      } else if (!tip.hidden) {
        const p = sh.canvasToRoot(at);
        tip.style.left = `${Math.round(p.x)}px`;
        tip.style.top = `${Math.round(p.y)}px`;
      }
    }
  };
  const scheduleHover = (x: number, y: number) => {
    hoverAt = { x, y };
    if (!hoverRaf) hoverRaf = requestAnimationFrame(processHover);
  };

  const run = (effects: InputEffect[]) => {
    for (const e of effects) {
      switch (e.type) {
        case 'tap': onTap(e.x, e.y, e.kind); break;
        case 'hover': scheduleHover(e.x, e.y); break;
        case 'pan': api.view.pan(e.dx, e.dy); break;
        case 'zoom': api.view.zoomAt(e.factor, e.x, e.y); break;
        case 'rotate': api.view.rotate(e.dir); sh.sound('click'); break;
        case 'panStart': sh.closeContextMenu(); canvas.classList.add('is-dragging'); touchPreviewKey = null; break;
        case 'panEnd': canvas.classList.remove('is-dragging'); break;
        default: break;
      }
    }
  };

  // ---- pointer events ----
  on(canvas, 'pointerdown', (e) => {
    if (!active()) return;
    const p = local(e);
    if (e.pointerType === 'mouse' && e.button > 2) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer may already be gone */ }
    canvas.focus({ preventScroll: true });
    run(machine.down({ id: e.pointerId, x: p.x, y: p.y, t: e.timeStamp, kind: kindOf(e), button: e.button }));
  });
  on(canvas, 'pointermove', (e) => {
    if (!active()) return;
    const p = local(e);
    run(machine.move({ id: e.pointerId, x: p.x, y: p.y, t: e.timeStamp, kind: kindOf(e) }));
  });
  on(canvas, 'pointerup', (e) => {
    const p = local(e);
    const fx = machine.up({ id: e.pointerId, x: p.x, y: p.y, t: e.timeStamp, kind: kindOf(e), button: e.button });
    if (active()) run(fx); else canvas.classList.remove('is-dragging');
  });
  on(canvas, 'pointercancel', (e) => { run(machine.cancel(e.pointerId).filter((x) => x.type === 'panEnd')); });
  on(canvas, 'lostpointercapture', (e) => { run(machine.cancel(e.pointerId).filter((x) => x.type === 'panEnd')); });
  on(canvas, 'pointerleave', (e) => { if (e.pointerType !== 'touch' && machine.pointerCount === 0 && api.mode() === 'build') { hoverKey = null; hideTip(); api.paintPreview(null); sh.paintPreviewShown(null); } });
  on(canvas, 'wheel', (e) => {
    if (!active()) return;
    e.preventDefault();
    const p = local(e);
    sh.closeContextMenu();
    run(machine.wheel(e.deltaY, p.x, p.y, e.deltaMode));
  }, { passive: false });
  on(canvas, 'contextmenu', (e) => { if (active()) e.preventDefault(); });
  // A world tap may open UI right under the finger; cancelling touchend stops the browser's synthetic click
  // from landing on it.
  on(canvas, 'touchend', (e) => { if (active() && e.cancelable) e.preventDefault(); }, { passive: false });

  // ---- keyboard ----
  const held = new Set<'left' | 'right' | 'up' | 'down'>();
  let keyRaf = 0;
  let keyLast = 0;
  const keyLoop = (now: number) => {
    if (!held.size || !active()) { keyRaf = 0; keyLast = 0; return; }
    const dt = keyLast ? Math.min(0.05, (now - keyLast) / 1000) : 1 / 60;
    keyLast = now;
    const d = KEY_PAN_SPEED * dt;
    let dx = 0, dy = 0;
    if (held.has('left')) dx += d;
    if (held.has('right')) dx -= d;
    if (held.has('up')) dy += d;
    if (held.has('down')) dy -= d;
    if (dx || dy) api.view.pan(dx, dy);
    keyRaf = requestAnimationFrame(keyLoop);
  };
  const modalOpen = () => !!document.querySelector('.modal-backdrop, .busy-overlay');
  const centre = () => { const r = canvas.getBoundingClientRect(); return { x: r.width / 2, y: r.height / 2 }; };

  onWin('keydown', (e) => {
    if (!active() || modalOpen() || isTypingTarget(e.target as HTMLElement | null)) return;
    const cmd = mapKey(e);
    if (!cmd) return;
    const m = api.mode();
    const editing = m === 'buy' || m === 'build';
    switch (cmd.kind) {
      case 'pan':
        e.preventDefault();
        held.add(cmd.dir);
        if (!keyRaf) keyRaf = requestAnimationFrame(keyLoop);
        return;
      case 'rotate': if (e.repeat) return; api.view.rotate(cmd.dir); sh.sound('click'); e.preventDefault(); return;
      case 'zoom': { const c = centre(); api.view.zoomAt(cmd.dir > 0 ? 1.2 : 1 / 1.2, c.x, c.y); e.preventDefault(); return; }
      case 'togglePause': {
        const t = e.target as HTMLElement | null;
        if (t && t.closest('button, a, [role="button"], [role="switch"], [role="tab"], summary')) return; // Space activates focused controls
        if (m !== 'live' || e.repeat) return;
        e.preventDefault();
        api.togglePause();
        sh.sound('click');
        return;
      }
      case 'speed': if (m !== 'live') return; api.setSpeed(cmd.speed); sh.sound('click'); e.preventDefault(); return;
      case 'escape': {
        if (sh.closeContextMenu()) { e.preventDefault(); sh.sound('close'); return; }
        if (m === 'buy' && api.placement()) { api.cancelPlacement(); sh.sound('close'); e.preventDefault(); return; }
        if (m === 'buy' && api.selectedObject()) { api.selectObject(null); e.preventDefault(); return; }
        if (m === 'build') {
          const t = api.paintTool();
          if (t?.kind === 'eyedropper') { const prev = lastTool[t.target]; api.setPaintTool(prev); sh.sound('close'); e.preventDefault(); return; }
          if (touchPreviewKey || !tip.hidden) { api.paintPreview(null); sh.paintPreviewShown(null); touchPreviewKey = null; hideTip(); e.preventDefault(); return; }
        }
        if (sh.isPanelOpen('person') || sh.isPanelOpen('feed') || sh.isPanelOpen('ledger')) { sh.closePanels(); sh.sound('close'); e.preventDefault(); }
        return;
      }
      case 'undo':
      case 'redo': {
        if (!editing) return;
        e.preventDefault();
        const label = cmd.kind === 'undo' ? (api.canUndo() ? api.undo() : null) : (api.canRedo() ? api.redo() : null);
        if (label) { sh.sound('click'); toast(`${cmd.kind === 'undo' ? 'Undone' : 'Redone'}: ${label}`, 'info', 2000); }
        else { sh.sound('error'); toast(cmd.kind === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.', 'info', 1800); }
        return;
      }
      case 'rotatePlacement':
        if (m === 'buy' && api.placement()) { api.rotatePlacement(e.shiftKey ? -1 : 1); sh.sound('click'); e.preventDefault(); }
        return;
      case 'delete': {
        if (m !== 'buy' || api.placement()) return;
        const id = api.selectedObject();
        if (!id) return;
        e.preventDefault();
        const value = api.saleValue(id);
        const r = api.sell(id);
        if (r.ok) { sh.sound('sell'); toast(`Sold for ${formatMoney(value)}. Undo with Ctrl+Z.`, 'success', 2600); }
        else { sh.sound('error'); toast(r.reason, 'warning'); }
        return;
      }
      default: return;
    }
  });
  onWin('keyup', (e) => {
    const cmd = mapKey({ key: e.key, code: e.code });
    if (cmd?.kind === 'pan') held.delete(cmd.dir);
  });

  const reset = () => {
    machine.reset();
    held.clear();
    canvas.classList.remove('is-dragging');
    touchPreviewKey = null;
    hoverKey = null;
  };
  onWin('blur', reset);
  const onVis = () => { if (document.hidden) reset(); };
  document.addEventListener('visibilitychange', onVis);
  listeners.push(() => document.removeEventListener('visibilitychange', onVis));

  return {
    reset,
    destroy: () => {
      for (const off of listeners.splice(0)) off();
      unsubChange();
      if (hoverRaf) cancelAnimationFrame(hoverRaf);
      if (keyRaf) cancelAnimationFrame(keyRaf);
      tip.remove();
    },
  };
}
