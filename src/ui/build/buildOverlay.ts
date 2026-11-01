// Build mode overlay in the UI layer: large draggable handles on the corners / ends of the shape waiting for Confirm
// (touch targets of 48 px), and a floating tip with the measurement and money next to it. Both follow the camera
// (api.view.worldToScreen) and the session (buildSession.ts); nothing here changes the world by itself.

import type { GameAPI } from '../../game/api';
import { h, setText } from '../kit/dom';
import type { BuildHandle, BuildSession, HandleId } from './buildSession';
import { tipText } from './buildSession';

export interface BuildOverlay { update(): void; destroy(): void }

const LABELS: Record<HandleId, string> = {
  c0: 'north-west corner', c1: 'north-east corner', c2: 'south-east corner', c3: 'south-west corner', a: 'start', b: 'end',
};

export function mountBuildOverlay(opts: {
  api: GameAPI;
  session: BuildSession;
  layer: HTMLElement;
  canvas: HTMLElement;
  canvasToRoot: (p: { x: number; y: number }) => { x: number; y: number };
}): BuildOverlay {
  const { api, session, layer, canvas } = opts;
  const host = h('div', { class: 'bb-handles', attrs: { 'aria-hidden': 'false' } });
  const tip = h('div', { class: 'paint-tip bb-build-tip', role: 'status', attrs: { 'aria-live': 'polite' } });
  tip.hidden = true;
  host.hidden = true;
  layer.append(host, tip);

  const els = new Map<HandleId, HTMLButtonElement>();
  let dragging: { id: HandleId; pointer: number; dx: number; dy: number } | null = null;

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const handleEl = (hd: BuildHandle): HTMLButtonElement => {
    let el = els.get(hd.id);
    if (el) return el;
    el = h('button', {
      type: 'button', class: 'bb-handle', ariaLabel: `Drag to move the ${LABELS[hd.id]}`, title: 'Drag to resize', dataset: { handle: hd.id },
    }, h('span', { class: 'bb-handle-dot' }));
    const e = el;
    e.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      try { e.setPointerCapture(ev.pointerId); } catch { /* pointer is gone */ }
      const r = e.getBoundingClientRect();
      dragging = { id: hd.id, pointer: ev.pointerId, dx: ev.clientX - (r.left + r.width / 2), dy: ev.clientY - (r.top + r.height / 2) };
      e.classList.add('is-active');
    });
    e.addEventListener('pointermove', (ev) => {
      if (!dragging || dragging.pointer !== ev.pointerId) return;
      const p = local({ clientX: ev.clientX - dragging.dx, clientY: ev.clientY - dragging.dy });
      session.moveHandle(dragging.id, p.x, p.y);
    });
    const end = (ev: PointerEvent) => {
      if (!dragging || dragging.pointer !== ev.pointerId) return;
      dragging = null;
      e.classList.remove('is-active');
    };
    e.addEventListener('pointerup', end);
    e.addEventListener('pointercancel', end); // the shape and its preview stay
    e.addEventListener('touchstart', (ev) => ev.stopPropagation(), { passive: true });
    e.addEventListener('keydown', (ev) => {
      // keyboard: arrows nudge the handle by one tile
      const d = ev.key === 'ArrowLeft' ? [-1, 0] : ev.key === 'ArrowRight' ? [1, 0] : ev.key === 'ArrowUp' ? [0, -1] : ev.key === 'ArrowDown' ? [0, 1] : null;
      if (!d) return;
      ev.preventDefault();
      ev.stopPropagation();
      const cur = session.handles().find((x) => x.id === hd.id);
      if (!cur) return;
      const s = api.view.worldToScreen(cur.x + d[0]!, 0, cur.z + d[1]!);
      session.moveHandle(hd.id, s.x, s.y);
    });
    els.set(hd.id, e);
    host.appendChild(e);
    return e;
  };

  const place = (el: HTMLElement, x: number, y: number, z: number, keepOnScreen = false): boolean => {
    const s = api.view.worldToScreen(x, y, z);
    if (!s.visible) return false;
    const p = opts.canvasToRoot(s);
    let px = p.x, py = p.y;
    if (keepOnScreen) {
      // the tip hangs above its point: keep it clear of the top bar and the screen edges
      const area = layer.getBoundingClientRect();
      px = Math.max(90, Math.min(area.width - 90, px));
      py = Math.max(122, Math.min(area.height - 20, py));
    }
    el.style.left = `${Math.round(px)}px`;
    el.style.top = `${Math.round(py)}px`;
    return true;
  };

  const update = () => {
    const st = session.state();
    const inBuild = api.mode() === 'build' && !!st.tool;
    const handles = inBuild && st.pending ? session.handles() : [];
    host.hidden = handles.length === 0;
    const keep = new Set<HandleId>();
    for (const hd of handles) {
      keep.add(hd.id);
      const el = handleEl(hd);
      el.hidden = !place(el, hd.x, 0, hd.z);
    }
    for (const [id, el] of els) if (!keep.has(id)) { el.remove(); els.delete(id); }

    // tip: next to the far end of the shape, or the point being previewed
    const pv = st.preview;
    const t = st.target;
    if (inBuild && pv && t && (st.pending || st.dragging || st.mode === 'click')) {
      const end = st.mode === 'drag' ? (t.to ?? t.from) : t.from;
      const mid = st.mode === 'drag' && handles.length ? handles[handles.length > 2 ? 2 : 1]! : null;
      const x = mid ? mid.x : end.x, z = mid ? mid.z : end.z;
      const shown = place(tip, x, st.mode === 'click' && t.wallId ? 1.4 : 0, z, true);
      tip.hidden = !shown;
      setText(tip, tipText(pv));
      tip.dataset.ok = pv.unchanged ? 'neutral' : String(pv.ok);
    } else tip.hidden = true;
  };

  const offs = [
    session.onChange(update),
    api.onChange((what) => { if (what === 'camera' || what === 'mode') update(); }),
  ];
  const onResize = () => update();
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  update();

  return {
    update,
    destroy() {
      for (const off of offs) off();
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      host.remove();
      tip.remove();
    },
  };
}
