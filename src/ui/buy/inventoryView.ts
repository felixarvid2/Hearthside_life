// OWNER: UI editors agent. Inventory tab: objects the active household stored, each with a Place button
// (api.startPlaceFromInventory).

import type { GameAPI } from '../../game/api';
import type { InventoryEntry } from '../../core/types';
import { formatDay } from '../../core/clock';
import { button, toast } from '../kit/components';
import { h, setChildren } from '../kit/dom';
import { icon } from '../kit/icons';
import { fundsInfo, formatMoney, play, thumbImg } from './editorCommon';

export interface InventoryView {
  el: HTMLElement;
  /** Re-renders when the inventory changed. Returns the number of stored objects. */
  refresh(): number;
}

export function inventoryView(api: GameAPI): InventoryView {
  const list = h('ul', { class: 'bb-inv-list', ariaLabel: 'Stored objects' });
  const intro = h('p', { class: 'bb-note', text: 'Objects you store stay owned by the household. Place them again for free.' });
  const el = h('div', { class: 'bb-inventory' }, intro, list);
  let lastKey = '\u0000';

  function row(entry: InventoryEntry, index: number): HTMLElement {
    const def = api.content.objects[entry.object.defId];
    const nm = def?.name ?? 'Unknown object';
    const place = button({
      icon: 'move', label: 'Place', variant: 'primary',
      onClick: () => {
        const r = api.startPlaceFromInventory(index);
        if (!r.ok) { toast(r.reason, 'error'); play(api, 'error'); }
      },
    });
    place.setAttribute('aria-label', `Place ${nm}`);
    return h('li', { class: 'bb-inv-row' },
      h('div', { class: 'bb-inv-thumb' }, thumbImg(() => api.thumbnails.furniture(entry.object.defId))),
      h('div', { class: 'bb-inv-info' },
        h('span', { class: 'bb-inv-name', text: nm }),
        h('span', { class: 'bb-inv-meta', text: `Paid ${formatMoney(entry.object.purchasePrice)} · stored ${formatDay(entry.storedAt)}` }),
        def ? null : h('span', { class: 'bb-inv-meta bb-over' }, icon('warning', 14), ' Its catalog entry is missing')),
      place);
  }

  function refresh(): number {
    const hh = fundsInfo(api).household;
    const inv = hh?.inventory ?? [];
    const key = inv.map((e) => `${e.object.id}:${e.object.defId}:${e.storedAt}`).join('|');
    if (key !== lastKey) {
      lastKey = key;
      setChildren(list, inv.length
        ? inv.map(row)
        : h('li', { class: 'bb-inv-empty' }, h('p', { class: 'empty', text: hh ? 'Your inventory is empty. Select a placed object and choose "Store in inventory" to keep it here.' : 'No active household.' })));
    }
    return inv.length;
  }

  refresh();
  return { el, refresh };
}
