// "Where is X" card (Milestone 7): tapping a household member who is not on the active lot cannot centre the camera on
// them, so a small card says where they are and offers "Go to <place>" (opens the neighbourhood map on that place) and
// "Details" (the person panel). Not modal: any tap elsewhere, Esc, or a change of lot closes it.

import { h } from '../kit/dom';
import { icon } from '../kit/icons';
import { button } from '../kit/components';
import { awayIconName, awayInfo } from './neighbourhoodModel';
import type { Shell } from './shell';

export interface AwayCard { el: HTMLElement; show(personId: string, anchor: HTMLElement): void; hide(): boolean; isOpen(): boolean; destroy(): void }

export function createAwayCard(sh: Shell): AwayCard {
  const { api } = sh;
  const el = h('div', { class: ['away-card', 'hud-box'], role: 'dialog', ariaLabel: 'Where they are' });
  el.hidden = true;
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  let shownFor: string | null = null;

  const hide = (): boolean => {
    if (el.hidden) return false;
    el.hidden = true;
    el.replaceChildren();
    shownFor = null;
    return true;
  };

  const place = (anchor: HTMLElement) => {
    const root = sh.root.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const w = Math.min(300, root.width - 16);
    el.style.width = `${w}px`;
    el.style.left = `${Math.round(Math.max(8, Math.min(root.width - w - 8, a.left - root.left)))}px`;
    const below = a.top + a.height / 2 < root.top + root.height / 2;
    if (below) { el.style.top = `${Math.round(a.bottom - root.top + 6)}px`; el.style.bottom = 'auto'; }
    else { el.style.bottom = `${Math.round(root.bottom - a.top + 6)}px`; el.style.top = 'auto'; }
  };

  const show = (personId: string, anchor: HTMLElement) => {
    const st = api.state();
    const p = st?.people[personId];
    const info = st && p ? awayInfo(st, p) : null;
    if (!st || !p || !info) { hide(); return; }
    shownFor = personId;
    const goTo = info.canGoTo && info.lotId && api.travel
      ? button({ icon: info.kind === 'home' ? 'home' : 'car', label: `Go to ${info.lotName ?? 'there'}`, variant: 'primary', small: true, onClick: () => { hide(); sh.sound('open'); sh.openNeighbourhood({ lotId: info.lotId! }); } })
      : null;
    const details = button({ icon: 'person', label: 'Details', variant: 'secondary', small: true, onClick: () => { hide(); sh.openPanel('person', { personId }); sh.sound('open'); } });
    const close = button({ icon: 'close', iconOnly: true, label: 'Close', variant: 'ghost', small: true, onClick: () => { hide(); sh.sound('close'); } });
    el.replaceChildren(
      h('div', { class: 'away-head' }, icon(awayIconName(info.kind), 22),
        h('div', { class: 'away-text' }, h('strong', { text: `${p.firstName} ${p.lastName}`.trim() }), h('span', { class: 'away-where', text: info.text }), info.when ? h('span', { class: 'away-when', text: info.when }) : null),
        close),
      h('div', { class: 'away-actions' }, ...(goTo ? [goTo] : []), details));
    el.hidden = false;
    place(anchor);
  };

  const onDown = (e: PointerEvent) => {
    if (el.hidden) return;
    const t = e.target as Node | null;
    if (t && el.contains(t)) return;
    hide();
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && hide()) { e.stopPropagation(); sh.sound('close'); } };
  document.addEventListener('pointerdown', onDown, true);
  window.addEventListener('keydown', onKey, true);
  const unsub = api.onChange((what) => { if (what === 'lot' || what === 'mode' || (what === 'selection' && shownFor !== null && api.selected() !== shownFor)) hide(); });

  sh.layer.appendChild(el);
  return {
    el, show, hide, isOpen: () => !el.hidden,
    destroy: () => { document.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey, true); unsub(); el.remove(); },
  };
}
