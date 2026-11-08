// Context menu for Live mode: api.options(person, pick) grouped, disabled entries with their reason, anchored
// near the target with api.view.anchorOf(pick) and kept inside the visible area. Closes on outside tap
// (taps on the canvas are consumed by the input layer), Esc, or after choosing an entry.

import type { MenuOption, PickResult } from '../../game/api';
import type { Id } from '../../core/types';
import { fishSpecies } from '../../content/fishing';
import { avoidToasts, toast } from '../kit/components';
import { h, shieldWorld } from '../kit/dom';
import { icon } from '../kit/icons';
import { layout } from '../kit/layout';
import { humanize } from './format';
import { placeAbove, type Rect } from './insets';
import type { Shell } from './shell';
import { currentOpener, restoreFocus } from '../kit/focus';
import { sectionsOf } from './socialModel';

const GROUPS: Array<{ id: MenuOption['group']; label: string }> = [
  { id: 'self', label: 'For themselves' },
  { id: 'social', label: 'Social' },
  { id: 'object', label: 'Use' },
  { id: 'move', label: 'Move' },
];

export interface ContextMenu {
  open(personId: Id, pick: PickResult, at?: { x: number; y: number }): void;
  close(): boolean;
  isOpen(): boolean;
  reposition(): void;
  destroy(): void;
}

export function createContextMenu(sh: Shell, visibleArea: () => Rect): ContextMenu {
  const { api } = sh;
  const el = h('div', { class: 'ctx-menu', role: 'menu' });
  el.hidden = true;
  shieldWorld(el);
  sh.layer.appendChild(el);
  let current: { personId: Id; pick: PickResult; at?: { x: number; y: number } } | null = null;
  let opener: HTMLElement | null = null;
  let armed = false;
  el.addEventListener('pointerdown', () => { armed = true; }, true);

  const targetTitle = (pick: PickResult): string => {
    const st = api.state();
    if (!st) return '';
    switch (pick.kind) {
      case 'person': {
        const p = st.people[pick.personId];
        return p ? `${p.firstName} ${p.lastName}` : 'Someone';
      }
      case 'object': {
        for (const lot of Object.values(st.lots)) {
          const o = lot.objects[pick.objectId];
          if (o) {
            const name = api.content.objects[o.defId]?.name ?? humanize(o.defId);
            // Condition shows in the title so a disabled "Broken" entry is easy to understand.
            return o.condition?.broken ? `${name} (broken)` : (o.condition?.dirt ?? 0) >= 0.6 ? `${name} (filthy)` : (o.condition?.dirt ?? 0) >= 0.35 ? `${name} (dirty)` : name;
          }
        }
        return 'Object';
      }
      case 'item': {
        const it = st.items[pick.itemId];
        if (it?.kind === 'dishes') return `Dirty dishes${it.portions > 1 ? ` (${it.portions} plates)` : ''}`;
        if (it?.kind === 'mess') return it.recipeId === 'crumbs' ? 'Crumbs' : it.recipeId === 'spill' ? 'Spill' : 'Puddle';
        if (it?.kind === 'gift') return `${api.content.gifts?.[it.recipeId]?.name ?? 'Gift'} (for ${st.people[it.ownerPersonId ?? '']?.firstName ?? 'someone'})`;
        if (it?.kind === 'fish') return `${fishSpecies(it.recipeId)?.name ?? 'Fish'}${it.portions > 1 ? ` (${it.portions} fish)` : ''}`;
        return it ? `${api.content.recipes[it.recipeId]?.name ?? 'Meal'}${it.portions > 1 ? ` (${it.portions} servings)` : ''}` : 'Meal';
      }
      case 'floor': return 'This spot';
      case 'wall': return 'Wall';
      default: return '';
    }
  };

  const onDocDown = (e: PointerEvent) => {
    if (!current) return;
    const t = e.target as Node | null;
    if (t && el.contains(t)) return;
    if (t instanceof HTMLElement && t.id === 'game-canvas') return; // the input layer consumes canvas taps
    close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (!current) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); sh.sound('close'); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [...el.querySelectorAll<HTMLButtonElement>('.ctx-item:not(:disabled)')];
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next]?.focus();
    }
  };
  document.addEventListener('pointerdown', onDocDown, true);
  window.addEventListener('keydown', onKey, true);

  const choose = (personId: Id, o: MenuOption) => {
    const r = api.queue(personId, o);
    if (r.ok) { sh.sound('click'); close(); }
    else { sh.sound('error'); toast(r.reason, 'warning'); }
  };

  const open = (personId: Id, pick: PickResult, at?: { x: number; y: number }) => {
    const options = api.options(personId, pick);
    const st = api.state();
    const actor = st?.people[personId];
    if (!options.length) {
      close();
      toast(`Nothing ${actor?.firstName ?? 'they'} can do with that right now.`, 'info', 2500);
      return;
    }
    if (!current) opener = currentOpener();
    current = { personId, pick, ...(at ? { at } : {}) };
    armed = false;
    if (pick.kind === 'person' || pick.kind === 'object' || pick.kind === 'item') api.view.reveal(pick); // small or off-screen: bring it into view
    const title = targetTitle(pick);
    const closeBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-icon ctx-close', ariaLabel: 'Close menu', title: 'Close menu' }, icon('close', 20));
    closeBtn.addEventListener('click', () => { close(); sh.sound('close'); });
    const sections: HTMLElement[] = [];
    const groups = GROUPS.map((g) => ({ g, items: options.filter((o) => o.group === g.id) })).filter((x) => x.items.length);
    const compact = layout().compact;
    const itemButton = (o: MenuOption): HTMLButtonElement => {
      const b = h('button', { type: 'button', class: ['ctx-item', o.hint && 'has-hint'], role: 'menuitem', disabled: !o.enabled },
        h('span', { class: 'ctx-icon' }, icon(o.icon || 'info', 20)),
        h('span', { class: 'ctx-text' },
          h('span', { class: 'ctx-label-row' }, h('span', { class: 'ctx-label', text: o.label }), o.hint ? h('span', { class: ['ctx-hint', `hint-${o.hint.split(' ')[0]!.toLowerCase()}`], text: o.hint }) : null),
          !o.enabled && o.reason ? h('span', { class: 'ctx-reason' }, icon('lock', 13), h('span', { text: o.reason })) : null));
      if (!o.enabled) b.setAttribute('aria-label', `${o.label}, unavailable: ${o.reason ?? 'not possible right now'}`);
      // Ignore the synthetic click a touch tap on the world can fire on the menu that just opened under the
      // finger ("ghost click"): only clicks that began inside the menu, or keyboard activation, count.
      b.addEventListener('click', (e) => { if (e.detail !== 0 && !armed) return; choose(personId, o); });
      return b;
    };
    for (const { g, items } of groups) {
      const list = h('div', { class: 'ctx-group', role: 'group', ariaLabel: g.label });
      if (groups.length > 1) list.appendChild(h('div', { class: 'ctx-group-label', text: g.label }));
      const parts = sectionsOf(g.id, items);
      for (const part of parts) {
        const sec = h('div', { class: 'ctx-section', role: 'group', ariaLabel: part.label || g.label });
        if (part.label && (parts.length > 1 || g.id === 'social')) sec.appendChild(h('div', { class: 'ctx-section-label', text: part.label }));
        const on = part.items.filter((o) => o.enabled), off = part.items.filter((o) => !o.enabled);
        for (const o of on) sec.appendChild(itemButton(o));
        if (off.length > 0) {
          // Unavailable entries keep their reasons but fold away on small screens so the usable ones stay in reach.
          const fold = h('details', { class: 'ctx-unavail' }, h('summary', { class: 'ctx-unavail-sum' }, icon('lock', 13), h('span', { text: `Unavailable (${off.length})` })), ...off.map(itemButton));
          fold.open = !compact || on.length === 0 && off.length <= 2;
          sec.appendChild(fold);
        }
        list.appendChild(sec);
      }
      sections.push(list);
    }
    el.replaceChildren(
      h('div', { class: 'ctx-head' }, h('div', { class: 'ctx-title' }, h('span', { class: 'ctx-target', text: title }), actor && !(pick.kind === 'person' && pick.personId === personId) ? h('span', { class: 'ctx-actor', text: `as ${actor.firstName}` }) : null), closeBtn),
      h('div', { class: 'ctx-body' }, ...sections),
    );
    el.setAttribute('aria-label', `Actions${title ? ` for ${title}` : ''}`);
    el.hidden = false;
    reposition();
    sh.sound('open');
    queueMicrotask(() => (el.querySelector('.ctx-item:not(:disabled)') as HTMLElement | null)?.focus({ preventScroll: true }));
  };

  const reposition = () => {
    if (!current) return;
    const area = visibleArea();
    const a = api.view.anchorOf(current.pick);
    const pt = a ? sh.canvasToRoot(a) : current.at ? sh.canvasToRoot(current.at) : { x: (area.left + area.right) / 2, y: (area.top + area.bottom) / 2 };
    const maxH = Math.max(120, area.bottom - area.top);
    el.style.maxHeight = `${maxH}px`;
    el.style.left = '0px';
    el.style.top = '0px';
    const box = { w: el.offsetWidth, h: Math.min(el.offsetHeight, maxH) };
    const pos = placeAbove(pt, box, area);
    el.style.left = `${pos.left}px`;
    el.style.top = `${pos.top}px`;
    el.dataset.side = pos.below ? 'below' : 'above';
    avoidToasts(el.getBoundingClientRect());
  };

  const close = (): boolean => {
    if (!current) return false;
    current = null;
    el.hidden = true;
    el.replaceChildren();
    avoidToasts(null);
    const back = opener;
    opener = null;
    restoreFocus(back, el); // keyboard users land back on the control that opened the menu
    return true;
  };

  return {
    open, close, reposition,
    isOpen: () => current !== null,
    destroy: () => { avoidToasts(null); document.removeEventListener('pointerdown', onDocDown, true); window.removeEventListener('keydown', onKey, true); el.remove(); },
  };
}
