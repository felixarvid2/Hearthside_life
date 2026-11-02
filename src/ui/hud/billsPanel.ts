// Household bills panel (Milestone 6): open bills, due dates, late fees, power cut-offs and auto-pay.
// Reads api.state(); paying and the auto-pay toggle go through the optional GameAPI methods.

import type { Bill } from '../../core/types';
import { activeHousehold } from '../../core/state';
import { button, panel, type Panel } from '../kit/components';
import { h, setChildren } from '../kit/dom';
import { icon } from '../kit/icons';
import { formatGameTime, formatMoney } from './format';
import type { Shell } from './shell';

export interface BillsPanel { panel: Panel; open(): void; close(): void; refresh(): void }

type Tone = 'due' | 'overdue' | 'cutoff' | 'paid';

const STATUS_TEXT: Record<Tone, string> = {
  due: 'Due', overdue: 'Overdue', cutoff: 'Power cut off', paid: 'Paid',
};

function statusOf(bill: Bill): Tone {
  return bill.status;
}

export function createBillsPanel(sh: Shell, onClosed: () => void): BillsPanel {
  const { api } = sh;
  const p = panel({ title: 'Bills and payments', className: 'bills-panel', initialHeight: 'half', onClose: onClosed });
  const summary = h('div', { class: 'bills-summary' });
  const autoRow = h('div', { class: 'bills-auto' });
  const notice = h('div', { class: 'bills-notice' });
  const list = h('ol', { class: 'bill-list' });
  p.body.append(summary, autoRow, notice, h('h3', { class: 'pp-subhead', text: 'Household bills' }), list);
  let sig = '';

  const pay = (billId: string) => {
    const st = api.state();
    const hh = st ? activeHousehold(st) : undefined;
    const personId = api.selected() ?? hh?.memberIds[0] ?? '';
    const r = api.payBill?.(personId, billId) ?? { ok: false, reason: 'Payments are not available here.' };
    if (!r.ok) sh.sound('error');
    else sh.sound('money');
    sig = '';
    refresh();
  };

  const refresh = () => {
    if (!p.isOpen()) return;
    const st = api.state();
    const hh = st ? activeHousehold(st) : undefined;
    if (!st || !hh) { summary.replaceChildren(); autoRow.replaceChildren(); notice.replaceChildren(); list.replaceChildren(); return; }
    const bills = (st.bills ?? []).filter((b) => b.householdId === hh.id).sort((a, b) => b.week - a.week || b.issuedAt - a.issuedAt);
    const open = bills.filter((b) => b.status !== 'paid');
    const owed = open.reduce((n, b) => n + b.amount, 0);
    const s = `${hh.id}:${hh.funds}:${hh.powerOff}:${st.settings.autoPayBills}:${bills.map((b) => `${b.id}/${b.status}/${b.amount}/${b.week}`).join(',')}:${api.selected()}`;
    if (s === sig) return;
    sig = s;

    setChildren(summary,
      h('span', { class: 'bills-owed', text: owed > 0 ? `${formatMoney(owed)} due` : 'All bills paid' }),
      h('span', { class: 'bills-house', text: `${hh.name} household · ${formatMoney(hh.funds)} available` }),
    );
    const on = st.settings.autoPayBills === true;
    setChildren(autoRow,
      h('div', { class: 'bills-auto-text' },
        icon('money', 20),
        h('div', {}, h('strong', { text: 'Pay bills automatically' }),
          h('span', { text: on ? 'Each new bill is paid on the day it arrives.' : 'Bills wait for you to pay them.' }))),
      button({
        label: on ? 'Turn off' : 'Turn on', small: true, variant: on ? 'secondary' : 'primary',
        onClick: () => {
          const personId = api.selected() ?? hh.memberIds[0] ?? '';
          const r = api.setAutoPayBills?.(personId, !on) ?? { ok: false, reason: 'That setting is not available here.' };
          if (!r.ok) sh.sound('error'); else sh.sound('toggle');
          sig = '';
          refresh();
        },
      }));
    if (hh.powerOff) {
      notice.replaceChildren(h('div', { class: 'bills-power' }, icon('warning', 20),
        h('div', {}, h('strong', { text: 'Power is off' }),
          h('span', { text: 'Electronics and appliances will not work until the overdue bill is paid.' }))));
    } else notice.replaceChildren();

    if (!bills.length) {
      list.replaceChildren(h('li', { class: 'pp-empty' }, icon('money', 22), h('p', { text: 'No bills yet. The first one arrives in the first week.' })));
      return;
    }
    list.replaceChildren(...bills.slice(0, 8).map((b) => {
      const tone = statusOf(b);
      const canPay = b.status !== 'paid';
      return h('li', { class: ['bill-item', `is-${tone}`] },
        h('div', { class: 'bill-main' },
          h('div', { class: 'bill-head' },
            h('span', { class: 'bill-week', text: `Week ${b.week + 1}` }),
            h('span', { class: ['tag', `bill-tag-${tone}`], text: STATUS_TEXT[tone] })),
          h('span', { class: 'bill-amount', text: formatMoney(b.amount) }),
          h('span', { class: 'bill-meta', text: b.status === 'paid' && b.paidAt !== undefined
            ? `Paid ${formatGameTime(b.paidAt)}`
            : b.status === 'cutoff'
              ? 'Utilities cut off — pay to restore power'
              : `${b.status === 'overdue' ? 'Was due' : 'Due'} ${formatGameTime(b.dueAt)}${b.lateFee > 0 ? ` · includes ${formatMoney(b.lateFee)} late fee` : ''}` })),
        canPay ? button({ label: 'Pay', small: true, variant: 'primary', onClick: () => pay(b.id) }) : h('span', { class: 'bill-done' }, icon('check', 18)));
    }));
  };

  return {
    panel: p,
    open: () => { p.open(); sig = ''; refresh(); },
    close: () => { if (p.isOpen()) { p.close(); onClosed(); } },
    refresh,
  };
}
