// OWNER: UI editors agent. Card for the object selected in Buy mode (api.selectedObject()): name, values,
// Move, Sell (shows api.saleValue, asks to confirm), Store in inventory, finish swatches per region, Close.

import type { GameAPI } from '../../game/api';
import type { PlacedObject } from '../../core/types';
import { button, confirmDialog, swatchGrid, toast } from '../kit/components';
import { h, setChildren, setText } from '../kit/dom';
import { formatMoney, play, setAttr, setLabel, thumbImg } from './editorCommon';

export interface ObjectView {
  el: HTMLElement;
  /** Non-scrolling action bar (Move, Sell, Store, Close), placed under the panel body. */
  footer: HTMLElement;
  /** Shows (or refreshes) the card for an object id. Returns false when the object no longer exists. */
  update(objectId: string): boolean;
  title(): string;
}

/** Finds a placed object on the active lot (or any lot as a fallback). */
export function findObject(api: GameAPI, objectId: string): PlacedObject | null {
  const s = api.state();
  if (!s) return null;
  const onActive = s.lots[s.activeLotId]?.objects[objectId];
  if (onActive) return onActive;
  for (const lot of Object.values(s.lots)) { const o = lot.objects[objectId]; if (o) return o; }
  return null;
}

export function objectView(api: GameAPI): ObjectView {
  const thumbHost = h('div', { class: 'bb-place-thumb' });
  const name = h('h3', { class: 'bb-place-name' });
  const values = h('div', { class: 'bb-obj-values' });
  const move = button({ icon: 'move', label: 'Move', onClick: () => act(() => api.startMove(objId)) });
  const sell = button({ icon: 'sell', label: 'Sell', onClick: () => void doSell() });
  const store = button({ icon: 'box', label: 'Store', title: 'Store in inventory', onClick: () => doStore() });
  store.setAttribute('aria-label', 'Store in inventory');
  const close = button({ icon: 'close', label: 'Close', onClick: () => { api.selectObject(null); play(api, 'close'); } });
  const finishesHost = h('div', { class: 'bb-obj-finishes' });
  const el = h('div', { class: 'bb-object' },
    h('div', { class: 'bb-place-head' }, thumbHost, h('div', { class: 'bb-place-info' }, name, values)),
    finishesHost);
  const footer = h('div', { class: 'bb-footer bb-obj-footer', role: 'group', ariaLabel: 'Object actions' }, move, sell, store, close);

  let objId = '';
  let lastKey = '';
  let titleText = '';
  const grids: Array<{ regionId: string; set(v: string): void; nameEl: HTMLElement; names: Map<string, string>; value: string }> = [];

  function act(fn: () => { ok: true } | { ok: false; reason: string }): void {
    const r = fn();
    if (!r.ok) { toast(r.reason, 'error'); play(api, 'error'); }
  }

  async function doSell(): Promise<void> {
    const o = findObject(api, objId);
    if (!o) return;
    const id = objId;
    const value = api.saleValue(id);
    const nm = api.content.objects[o.defId]?.name ?? 'this object';
    const ok = await confirmDialog({ title: `Sell ${nm}?`, text: `You get ${formatMoney(value)} back. You can undo this.`, confirm: `Sell for ${formatMoney(value)}` });
    if (!ok) return;
    const r = api.sell(id);
    if (!r.ok) { toast(r.reason, 'error'); play(api, 'error'); return; }
    play(api, 'sell');
    toast(`Sold ${nm} for ${formatMoney(value)}`, 'success', 2500);
  }

  function doStore(): void {
    const o = findObject(api, objId);
    const nm = o ? api.content.objects[o.defId]?.name ?? 'Object' : 'Object';
    const r = api.store(objId);
    if (!r.ok) { toast(r.reason, 'error'); play(api, 'error'); return; }
    play(api, 'confirm');
    toast(`${nm} moved to your inventory`, 'success', 2500);
  }

  function update(objectId: string): boolean {
    const o = findObject(api, objectId);
    if (!o) return false;
    const def = api.content.objects[o.defId];
    const nm = def?.name ?? 'Unknown object';
    titleText = nm;
    const value = api.saleValue(objectId);
    const key = `${objectId}|${o.defId}`;
    if (key !== lastKey) {
      lastKey = key;
      objId = objectId;
      setChildren(thumbHost, thumbImg(() => api.thumbnails.furniture(o.defId)));
      setText(name, nm);
      grids.length = 0;
      const regions = (def?.finishes ?? []).filter((r) => r.swatches.length > 0);
      setChildren(finishesHost, regions.length ? h('h4', { class: 'bb-section-title', text: 'Finishes' }) : null,
        ...regions.map((r) => {
          const names = new Map(r.swatches.map((s) => [s.id, s.name]));
          const nameEl = h('span', { class: 'bb-swatch-name' });
          const entry = { regionId: r.id, set: (_v: string) => {}, nameEl, names, value: '' };
          const g = swatchGrid({
            label: r.label,
            swatches: r.swatches.map((s) => ({ id: s.id, name: s.name, color: s.color })),
            value: o.finishes[r.id] ?? r.swatches[0]!.id,
            onPick: (_color, swatchId) => {
              if (!swatchId) return;
              const res = api.setObjectFinish(objId, r.id, swatchId);
              if (!res.ok) { toast(res.reason, 'error'); play(api, 'error'); }
              entry.value = ''; // the kit grid already marked the tapped swatch; re-mark from state
              refreshFinishes();
            },
          });
          g.el.classList.add('bb-obj-swatches');
          g.el.querySelector('.field-label')?.append(' ', nameEl);
          entry.set = g.set;
          grids.push(entry);
          return g.el;
        }));
    }
    const purchase = o.purchasePrice;
    const vKey = `${purchase}|${value}`;
    if (values.dataset.key !== vKey) {
      values.dataset.key = vKey;
      setChildren(values,
        h('span', null, h('span', { class: 'bb-muted', text: 'Bought for ' }), formatMoney(purchase)),
        h('span', null, h('span', { class: 'bb-muted', text: 'Sells for ' }), h('strong', { text: formatMoney(value) })));
    }
    setLabel(sell, `Sell for ${formatMoney(value)}`, 'Sell');
    setAttr(sell, 'aria-label', `Sell for ${formatMoney(value)}`);
    refreshFinishes();
    return true;
  }

  function refreshFinishes(): void {
    const o = findObject(api, objId);
    if (!o) return;
    const def = api.content.objects[o.defId];
    for (const g of grids) {
      const region = def?.finishes.find((r) => r.id === g.regionId);
      const sel = o.finishes[g.regionId] ?? region?.swatches[0]?.id ?? '';
      if (sel === g.value) continue;
      g.value = sel;
      g.set(sel);
      setText(g.nameEl, g.names.get(sel) ? `- ${g.names.get(sel)}` : '');
    }
  }

  return { el, footer, update, title: () => titleText };
}
