// Gift picker ("Give a Gift..." in the social menu): lists the small gift catalog with prices and, once the giver knows the
// recipient, a hint of how it would land. The simulation owns every rule (api.giftChoices / api.giveGift); a modal sheet
// that works in portrait, landscape and on the desktop.

import type { Id } from '../../core/types';
import type { GiftVerdict } from '../../game/api';
import { modal, toast } from '../kit/components';
import { h } from '../kit/dom';
import { icon } from '../kit/icons';
import { formatMoney } from './format';
import type { Shell } from './shell';

const HINT_TEXT: Record<GiftVerdict | 'unknown', string> = {
  loved: 'They would love this', liked: 'They would like this', fine: 'A pleasant surprise', disliked: 'Not their thing', unknown: 'You do not know them well enough to tell',
};

export function openGiftPicker(sh: Shell, giverId: Id, recipientId: Id): void {
  const { api } = sh;
  const st = api.state();
  const giver = st?.people[giverId], to = st?.people[recipientId];
  const choices = api.giftChoices?.(giverId, recipientId) ?? [];
  if (!st || !giver || !to || choices.length === 0) { toast('No gifts can be given right now.', 'info'); return; }
  const m = modal({ title: `A gift for ${to.firstName}`, wide: true });
  m.el.classList.add('evp', 'gift-picker');
  m.body.append(h('p', { class: 'evp-desc', text: 'Paid for when it is accepted. A parcel is left at their home. What they like matters more than the price.' }));
  const grid = h('div', { class: 'evp-guests', role: 'group', ariaLabel: 'Gifts' });
  for (const c of choices) {
    const b = h('button', { type: 'button', class: 'evp-guest', disabled: !c.enabled, attrs: { 'data-gift': c.id } },
      icon(c.icon, 28),
      h('span', { class: 'evp-guest-main' },
        h('span', { class: 'evp-guest-name', text: `${c.name} · ${formatMoney(c.price)}` }),
        h('span', { class: 'evp-guest-sub', text: c.enabled ? `${c.description} ${HINT_TEXT[c.hint]}.` : c.reason ?? 'Not available.' })));
    b.addEventListener('click', () => {
      const r = api.giveGift?.(giverId, recipientId, c.id);
      if (r && !r.ok) { sh.sound('error'); toast(r.reason, 'warning'); return; }
      sh.sound('confirm'); m.close();
      toast(`${giver.firstName} is taking ${c.name.toLowerCase()} over to ${to.firstName}.`, 'success');
    });
    grid.append(b);
  }
  m.body.append(grid);
}
