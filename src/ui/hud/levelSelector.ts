// Milestone 9: the active-level selector of the camera bar: "up" and "down" buttons around a "Floor 2" label. It works in Live, Buy
// and Build (api.view.level / setLevel / levels). It is shown when the lot has more than one floor, and always in Build mode, where
// the next empty floor can be opened to build on. Floors above the chosen one are hidden; the build tools, Buy placement, picking
// and the camera follow it.

import type { GameAPI, SoundId } from '../../game/api';
import { h, setText, toggleClass } from '../kit/dom';
import { icon } from '../kit/icons';

export interface LevelSelector {
  el: HTMLElement;
  refresh(): void;
  destroy(): void;
}

export function createLevelSelector(api: GameAPI, sound: (id: SoundId) => void): LevelSelector {
  const label = h('span', { class: 'level-label', text: 'Floor 1', attrs: { 'aria-live': 'polite' } });
  const upBtn = h('button', { type: 'button', class: ['tool-btn', 'hud-tool', 'level-btn', 'level-up'], ariaLabel: 'Floor up', title: 'Floor up' }, icon('up', 20));
  const downBtn = h('button', { type: 'button', class: ['tool-btn', 'hud-tool', 'level-btn', 'level-down'], ariaLabel: 'Floor down', title: 'Floor down' }, icon('down', 20));
  const el = h('div', { class: 'level-select', role: 'group', ariaLabel: 'Floor' }, downBtn, label, upBtn);
  el.hidden = true;

  /** Highest floor that can be chosen: the top floor in use, or the next empty one while building. */
  const top = (): number => {
    const lv = api.view.levels?.();
    if (!lv) return 0;
    return Math.min(lv.max - 1, api.mode() === 'build' ? lv.count : lv.count - 1);
  };
  const go = (to: number) => {
    const max = top();
    const next = Math.max(0, Math.min(max, to));
    if (next === (api.view.level?.() ?? 0)) return;
    api.view.setLevel?.(next);
    sound('click');
  };
  upBtn.addEventListener('click', () => go((api.view.level?.() ?? 0) + 1));
  downBtn.addEventListener('click', () => go((api.view.level?.() ?? 0) - 1));
  for (const b of [upBtn, downBtn, el]) b.addEventListener('pointerdown', (e) => e.stopPropagation());

  const refresh = (): void => {
    const lv = api.view.levels?.();
    if (!lv || !api.view.setLevel || !api.state()) { el.hidden = true; return; }
    let level = api.view.level?.() ?? 0;
    // leaving Build mode (or an undo) can leave the view on a floor that is no longer there
    if (level > top()) { api.view.setLevel(top()); level = api.view.level?.() ?? top(); }
    const show = api.mode() === 'build' || lv.count > 1;
    el.hidden = !show;
    setText(label, `Floor ${level + 1}`);
    const text = lv.count > 1 ? `Floor ${level + 1} of ${lv.count}` : `Floor ${level + 1}`;
    el.title = text;
    label.setAttribute('aria-label', text);
    upBtn.disabled = level >= top();
    downBtn.disabled = level <= 0;
    toggleClass(el, 'is-upper', level > 0);
  };

  const off = api.onChange((what) => {
    if (what === 'camera' || what === 'mode' || what === 'build' || what === 'undo' || what === 'state' || what === 'lot') refresh();
  });
  const offLot = api.events.on('lot.changed', () => refresh());
  refresh();
  return { el, refresh, destroy: () => { off(); offLot(); } };
}
