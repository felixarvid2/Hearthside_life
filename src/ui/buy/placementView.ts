// OWNER: UI editors agent. Placement controls shown while api.placement() is set: name, cost, validity with
// text reasons, and a fixed footer with Rotate left/right, Cancel and Confirm (disabled when invalid or
// unaffordable). Canvas input (moving the ghost, click-to-confirm, R/Esc keys) belongs to the shell.

import type { GameAPI, PlacementState } from '../../game/api';
import { button, toast } from '../kit/components';
import { h, setChildren, setText } from '../kit/dom';
import { icon } from '../kit/icons';
import { layout } from '../kit/layout';
import { affordReason, fundsInfo, formatMoney, play, setAttr, setHidden, setLabel, thumbImg } from './editorCommon';

export interface PlacementView {
  /** Scrollable part (name, cost, validity, hint). */
  el: HTMLElement;
  /** Non-scrolling action bar (rotate, cancel, confirm), placed under the panel body. */
  footer: HTMLElement;
  update(p: PlacementState): void;
  /** Title for the panel header. */
  title(p: PlacementState): string;
}

const SOURCE_TEXT: Record<PlacementState['source'], string> = {
  buy: 'New purchase',
  move: 'Moving an object',
  inventory: 'From your inventory',
};

export function placementView(api: GameAPI, opts: { onPlaced?: (p: PlacementState) => void } = {}): PlacementView {
  const thumbHost = h('div', { class: 'bb-place-thumb' });
  const name = h('h3', { class: 'bb-place-name' });
  const source = h('div', { class: 'bb-place-source' });
  const costValue = h('span', { class: 'bb-price' });
  const cost = h('div', { class: 'bb-place-cost' }, h('span', { class: 'bb-muted', text: 'Cost' }), costValue);
  const status = h('div', { class: 'bb-status-line', role: 'status', attrs: { 'aria-live': 'polite' } });
  const reasons = h('ul', { class: 'bb-reasons', ariaLabel: 'Why it cannot be placed' });
  const hint = h('p', { class: 'bb-hint bb-place-hint' });

  // rot counts quarter turns counter-clockwise seen from above, so +1 turns the object to the left.
  const rotL = button({ icon: 'rotateLeft', label: 'Rotate left', onClick: () => { api.rotatePlacement(1); play(api, 'tap'); } });
  const rotR = button({ icon: 'rotateRight', label: 'Rotate right', onClick: () => { api.rotatePlacement(-1); play(api, 'tap'); } });
  const cancel = button({ icon: 'close', label: 'Cancel', variant: 'secondary', onClick: () => { api.cancelPlacement(); play(api, 'close'); } });
  const confirm = button({ icon: 'check', label: 'Place', variant: 'primary', onClick: () => doConfirm() });
  setLabel(rotL, 'Rotate left', 'Left');
  setLabel(rotR, 'Rotate right', 'Right');
  rotL.setAttribute('aria-label', 'Rotate left');
  rotR.setAttribute('aria-label', 'Rotate right');
  confirm.classList.add('bb-confirm');

  const el = h('div', { class: 'bb-placement' },
    h('div', { class: 'bb-place-head' }, thumbHost, h('div', { class: 'bb-place-info' }, name, source, cost)),
    status, reasons, hint);
  const footer = h('div', { class: 'bb-footer bb-place-footer', role: 'group', ariaLabel: 'Placement controls' }, rotL, rotR, cancel, confirm);

  let lastDef = '';
  let lastReasons = '';
  let current: PlacementState | null = null;

  const defName = (defId: string) => api.content.objects[defId]?.name ?? 'Unknown object';

  function doConfirm(): void {
    const p = current;
    if (!p) return;
    const r = api.confirmPlacement();
    if (!r.ok) { toast(r.reason, 'error'); play(api, 'error'); return; }
    play(api, 'place');
    opts.onPlaced?.(p);
  }

  function update(p: PlacementState): void {
    current = p;
    if (p.defId !== lastDef) {
      lastDef = p.defId;
      setChildren(thumbHost, thumbImg(() => api.thumbnails.furniture(p.defId)));
      setText(name, defName(p.defId));
    }
    setText(source, SOURCE_TEXT[p.source] ?? '');
    const f = fundsInfo(api);
    const costText = p.cost > 0 ? (f.unlimited ? `${formatMoney(p.cost)} (free in sandbox)` : formatMoney(p.cost))
      : p.cost < 0 ? `Refund ${formatMoney(-p.cost)}`
        : p.source === 'move' ? 'Free (moving)' : p.source === 'inventory' ? 'Free (already owned)' : 'Free';
    setText(costValue, costText);

    const afford = affordReason(api, p.cost);
    const gameMentionsFunds = p.reasons.some((r) => /fund|afford|money/i.test(r));
    const list = afford && !gameMentionsFunds ? [...p.reasons, afford] : p.reasons;
    const state = !p.ok || afford ? 'bad' : 'ok';
    // The first reason goes into the status line itself so it is visible without scrolling.
    const first = list[0];
    const statusText = !p.ok ? (first ? `Can't place: ${first}` : "Can't place it here")
      : afford ? (first ? `Fits, but ${first.charAt(0).toLowerCase()}${first.slice(1)}` : "Fits, but you can't afford it") : 'Fits here';
    const key = `${state}|${statusText}`;
    if (status.dataset.key !== key) {
      status.dataset.key = key;
      status.dataset.state = state;
      setChildren(status, icon(state === 'ok' ? 'check' : 'warning', 20), h('span', { text: statusText }));
    }
    const more = list.slice(1);
    const rKey = more.join('\n');
    if (rKey !== lastReasons) {
      lastReasons = rKey;
      setChildren(reasons, more.map((r) => h('li', null, icon('warning', 16), h('span', { text: r }))));
    }
    setHidden(reasons, more.length === 0);

    const blocked = !p.ok || !!afford;
    if (confirm.disabled !== blocked) confirm.disabled = blocked;
    const long = p.source === 'move' ? 'Move here' : p.cost > 0 && !f.unlimited ? `Place for ${formatMoney(p.cost)}` : 'Place';
    setLabel(confirm, long, p.source === 'move' ? 'Move' : 'Place');
    const tip = blocked ? `Can't confirm: ${list[0] ?? "it can't go here"}` : long;
    setAttr(confirm, 'title', tip);
    setAttr(confirm, 'aria-label', blocked ? `${long} (unavailable: ${list[0] ?? "it can't go here"})` : long);

    setText(hint, layout().touch
      ? 'Tap a tile in the world to move it there, then confirm.'
      : 'Move the pointer over the world to position it. Click or press Place to confirm, R rotates, Esc cancels.');
  }

  return {
    el,
    footer,
    update,
    title: (p) => (p.source === 'move' ? 'Moving' : 'Placing'),
  };
}
