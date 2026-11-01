// Developer overlay (?debug or the "Performance overlay" setting): api.devStats() twice a second.

import type { DevStats, GameAPI } from '../../game/api';
import { h, setText } from '../kit/dom';

const ROWS: Array<{ key: keyof DevStats; label: string; fmt?: (v: number) => string }> = [
  { key: 'fps', label: 'FPS', fmt: (v) => v.toFixed(0) },
  { key: 'frameMs', label: 'Frame', fmt: (v) => `${v.toFixed(1)} ms` },
  { key: 'drawCalls', label: 'Draw calls' },
  { key: 'triangles', label: 'Triangles', fmt: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} k` : String(v)) },
  { key: 'geometries', label: 'Geometries' },
  { key: 'textures', label: 'Textures' },
  { key: 'loadedAssets', label: 'Assets' },
  { key: 'agents', label: 'Agents' },
  { key: 'routeRequests', label: 'Routes' },
  { key: 'simTickMs', label: 'Sim tick', fmt: (v) => `${v.toFixed(2)} ms` },
  { key: 'ticksPerFrame', label: 'Ticks/frame' },
];

export function createDevOverlay(api: GameAPI): { el: HTMLElement; setVisible(on: boolean): void; destroy(): void } {
  const values = new Map<keyof DevStats, HTMLElement>();
  const grid = h('dl', { class: 'dev-grid' });
  for (const r of ROWS) {
    const v = h('dd', { text: '-' });
    values.set(r.key, v);
    grid.append(h('dt', { text: r.label }), v);
  }
  const el = h('div', { class: 'dev-overlay', role: 'status', ariaLabel: 'Performance overlay' }, grid);
  el.hidden = true;
  let timer: ReturnType<typeof setInterval> | null = null;
  const tick = () => {
    let s: DevStats;
    try { s = api.devStats(); } catch { return; }
    for (const r of ROWS) {
      const raw = s[r.key];
      const el2 = values.get(r.key);
      if (el2) setText(el2, typeof raw === 'number' ? (r.fmt ? r.fmt(raw) : String(Math.round(raw))) : '-');
    }
  };
  const setVisible = (on: boolean) => {
    el.hidden = !on;
    if (on && !timer) { tick(); timer = setInterval(tick, 500); }
    if (!on && timer) { clearInterval(timer); timer = null; }
  };
  return { el, setVisible, destroy: () => { setVisible(false); el.remove(); } };
}
