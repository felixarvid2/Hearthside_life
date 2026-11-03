// Feed panel (recent history), ledger panel (funds and recent entries) and the toaster that turns world events
// and feed entries into short toasts with sounds.

import type { GameEvent } from '../../core/events';
import { activeHousehold } from '../../core/state';
import type { FeedEntry, LedgerKind } from '../../core/types';
import { button, panel, toast, type Panel } from '../kit/components';
import { h, setChildren } from '../kit/dom';
import { icon } from '../kit/icons';
import { formatGameTime, formatMoney, personName } from './format';
import { coalesce, eventToToast, feedToToast, type NotifyContext, type ToastCandidate } from './notify';
import type { Shell } from './shell';

const FEED_ICONS: Record<FeedEntry['kind'], string> = {
  info: 'info', social: 'social', money: 'money', career: 'briefcase', need: 'warning', warning: 'warning', aspiration: 'star', build: 'build', family: 'people',
};
const FEED_LABELS: Record<FeedEntry['kind'], string> = {
  info: 'News', social: 'Social', money: 'Money', career: 'Career', need: 'Needs', warning: 'Warning', aspiration: 'Aspiration', build: 'Home', family: 'Family',
};
const LEDGER_LABELS: Record<LedgerKind, string> = {
  wage: 'Wage', purchase: 'Purchase', refund: 'Refund', sale: 'Sale', groceries: 'Groceries', bill: 'Bill', reward: 'Reward', build: 'Building', gift: 'Gift', start: 'Start', repair: 'Repair', career: 'Work', family: 'Family',
};

export interface ListPanel { panel: Panel; open(): void; close(): void; refresh(): void }

export function createFeedPanel(sh: Shell, onClosed: () => void): ListPanel {
  const { api } = sh;
  const p = panel({ title: 'Recent events', className: 'feed-panel', initialHeight: 'half', onClose: onClosed });
  const list = h('ol', { class: 'feed-list', attrs: { 'aria-live': 'polite' } });
  p.body.append(list);
  let sig = '';
  const refresh = () => {
    if (!p.isOpen()) return;
    const st = api.state();
    const feed = st?.feed ?? [];
    const s = `${feed.length}:${feed[feed.length - 1]?.id ?? ''}`;
    if (s === sig) return;
    sig = s;
    if (!st || !feed.length) { list.replaceChildren(h('li', { class: 'pp-empty' }, icon('bell', 22), h('p', { text: 'Nothing has happened yet.' }))); return; }
    list.replaceChildren(...[...feed].reverse().map((f) => h('li', { class: ['feed-item', `feed-${f.kind}`] },
      h('span', { class: 'feed-icon', title: FEED_LABELS[f.kind] ?? 'News' }, icon(FEED_ICONS[f.kind] ?? 'info', 20)),
      h('div', { class: 'feed-main' },
        h('span', { class: 'feed-text', text: f.text }),
        h('span', { class: 'feed-meta', text: `${FEED_LABELS[f.kind] ?? 'News'} · ${formatGameTime(f.at)}${f.personId && !f.text.includes(st.people[f.personId]?.firstName ?? '\u0000') ? ` · ${personName(st, f.personId)}` : ''}` })))));
  };
  return {
    panel: p,
    open: () => { p.open(); sig = ''; refresh(); },
    close: () => { if (p.isOpen()) { p.close(); onClosed(); } },
    refresh,
  };
}

export function createLedgerPanel(sh: Shell, onClosed: () => void): ListPanel {
  const { api } = sh;
  const p = panel({ title: 'Household funds', className: 'ledger-panel', initialHeight: 'half', onClose: onClosed });
  const total = h('div', { class: 'ledger-total' });
  const list = h('ol', { class: 'ledger-list' });
  const billsBtn = button({
    icon: 'money', label: 'Bills and payments', small: true, variant: 'secondary',
    title: 'Pay household bills or turn on automatic payment',
    onClick: () => { sh.sound('open'); sh.openPanel('bills'); },
  });
  p.body.append(total, h('div', { class: 'ledger-actions' }, billsBtn), h('h3', { class: 'pp-subhead', text: 'Recent transactions' }), list);
  let sig = '';
  const refresh = () => {
    if (!p.isOpen()) return;
    const st = api.state();
    const hh = st ? activeHousehold(st) : undefined;
    const s = `${hh?.funds}:${hh?.ledger.length}:${hh?.ledger[hh.ledger.length - 1]?.id}:${st?.settings.unlimitedFunds}`;
    if (s === sig) return;
    sig = s;
    if (!st || !hh) { total.replaceChildren(); list.replaceChildren(); return; }
    setChildren(total,
      h('span', { class: 'ledger-amount', text: formatMoney(hh.funds) }),
      h('span', { class: 'ledger-house', text: `${hh.name} household` }),
      st.settings.unlimitedFunds ? h('span', { class: 'tag tag-free' }, icon('build', 14), h('span', { text: 'Unlimited building funds: buying and building are free' })) : null,
    );
    const entries = [...hh.ledger].reverse().filter((e) => e.amount !== 0 || e.kind !== 'start').slice(0, 60);
    if (!entries.length) { list.replaceChildren(h('li', { class: 'pp-empty' }, icon('money', 22), h('p', { text: 'No transactions yet.' }))); return; }
    list.replaceChildren(...entries.map((e) => {
      const plus = e.amount > 0;
      return h('li', { class: ['ledger-item', plus ? 'is-income' : e.amount < 0 ? 'is-expense' : ''] },
        h('div', { class: 'feed-main' },
          h('span', { class: 'feed-text', text: e.label }),
          h('span', { class: 'feed-meta', text: `${LEDGER_LABELS[e.kind] ?? e.kind} · ${formatGameTime(e.at)}` })),
        h('span', { class: 'ledger-value', text: `${plus ? '+' : e.amount < 0 ? '−' : ''}${formatMoney(Math.abs(e.amount))}`, ariaLabel: `${plus ? 'Income' : e.amount < 0 ? 'Expense' : 'No change'} ${formatMoney(Math.abs(e.amount))}` }));
    }));
  };
  return {
    panel: p,
    open: () => { p.open(); sig = ''; refresh(); },
    close: () => { if (p.isOpen()) { p.close(); onClosed(); } },
    refresh,
  };
}

/** Listens to world events; shows coalesced toasts and plays one sound per batch. */
export function createToaster(sh: Shell): { destroy(): void; setEnabled(on: boolean): void } {
  const { api } = sh;
  let batch: ToastCandidate[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastFlush = 0;
  let enabled = true;

  const ctx = (): NotifyContext => {
    const st = api.state();
    const hh = st ? activeHousehold(st) : undefined;
    const m = api.mode();
    return { state: st, content: api.content, household: new Set(hh?.memberIds ?? []), editing: m === 'buy' || m === 'build' };
  };

  const flush = () => {
    timer = null;
    const { toasts, sound, dropped } = coalesce(batch, 3);
    batch = [];
    if (!toasts.length) return;
    lastFlush = performance.now();
    for (const t of toasts) toast(t.text, t.kind, t.kind === 'warning' || t.kind === 'error' ? 5000 : 3800);
    if (dropped > 0) toast(`${dropped} more in the event feed`, 'info', 3000);
    if (sound) sh.sound(sound);
  };

  const push = (c: ToastCandidate | null) => {
    if (!c || !enabled) return;
    batch.push(c);
    if (timer === null) {
      const since = performance.now() - lastFlush;
      timer = setTimeout(flush, since < 700 ? 700 - since : 40);
    }
  };

  const onEvent = (e: GameEvent) => {
    if (e.type === 'state.replaced') { batch = []; return; }
    if (e.type === 'feed') {
      const entry = api.state()?.feed.find((f) => f.id === e.entryId);
      if (entry) push(feedToToast(entry, ctx()));
      return;
    }
    push(eventToToast(e, ctx()));
  };

  const unsub = api.events.onAny(onEvent);
  return {
    destroy: () => { unsub(); if (timer) clearTimeout(timer); },
    setEnabled: (on) => { enabled = on; if (!on) batch = []; },
  };
}
