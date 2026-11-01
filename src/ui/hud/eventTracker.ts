// Event goal tracker on the HUD: the household's planned or running event (date, party, visit...) with its goals,
// a countdown and who has arrived, and for a short while after the end the rating. Reads api.state()/api.content only;
// cancelling a planned event goes through api.cancelEvent. Rebuilds its DOM only when the displayed text changes.

import { formatClock, formatDay, formatDuration } from '../../core/clock';
import type { HomeEvent, WorldState } from '../../core/types';
import { button, confirmDialog, toast } from '../kit/components';
import { h, toggleClass } from '../kit/dom';
import { icon } from '../kit/icons';
import type { Shell } from './shell';
import { trackedEvent } from './socialModel';

export interface EventTracker {
  el: HTMLElement;
  refresh(): void;
  destroy(): void;
}

const RATING_TEXT: Record<NonNullable<HomeEvent['rating']>, string> = {
  great: 'A great success', good: 'It went well', fair: 'It was okay', poor: 'It did not go well',
};

export function createEventTracker(sh: Shell): EventTracker {
  const { api } = sh;
  const el = h('section', { class: ['ev-tracker', 'hud-box'], ariaLabel: 'Event goals', role: 'region' });
  el.hidden = true;
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  const dismissed = new Set<string>();
  let collapsed = false;
  let sig = '';
  let shownId = '';

  const names = (st: WorldState, ids: string[]): string => ids.map((id) => st.people[id]?.firstName ?? 'someone').join(', ');

  const render = (st: WorldState, ev: HomeEvent) => {
    const def = api.content.events?.[ev.type];
    const now = st.clock.minutes;
    const arrived = ev.arrivedIds.filter((id) => ev.guestIds.includes(id)).length;
    let sub: string;
    if (ev.status === 'invited') sub = `Starts ${now >= ev.startAt - 1 ? 'now' : `in ${formatDuration(ev.startAt - now)}`} (${formatDay(ev.startAt).slice(0, 3)} ${formatClock(ev.startAt)})`;
    else if (ev.status === 'running') sub = `${formatDuration(Math.max(0, ev.endAt - now))} left · ${arrived} of ${ev.guestIds.length} here`;
    else sub = ev.rating ? RATING_TEXT[ev.rating] : 'Finished';
    const guests = names(st, ev.guestIds);
    const title = ev.type === 'date' ? `Date with ${guests}` : ev.guestIds.length === 1 && (ev.type === 'visit' || ev.type === 'dropIn' || ev.type === 'reconciliation' || ev.type === 'welcomeWagon') ? `${ev.title}: ${guests}` : ev.title;
    const collapseBtn = button({ icon: collapsed ? 'down' : 'up', iconOnly: true, label: collapsed ? 'Show goals' : 'Hide goals', small: true, variant: 'ghost', onClick: () => { collapsed = !collapsed; sig = ''; sh.sound('click'); refresh(); } });
    const head = h('div', { class: 'ev-head' }, icon(def?.icon ?? 'star', 22),
      h('div', { class: 'ev-titles' }, h('span', { class: 'ev-title', text: title }), h('span', { class: 'ev-sub', text: sub })), collapseBtn);
    const parts: Array<HTMLElement> = [head];
    if (ev.status === 'invited') {
      const foot = h('div', { class: 'ev-foot' }, h('span', { text: `Guests: ${guests}` }),
        button({ label: 'Cancel', small: true, variant: 'ghost', onClick: () => { void cancel(ev); } }));
      parts.push(foot);
    } else {
      parts.push(h('ul', { class: 'ev-goals' }, ...ev.goals.map((g) => {
        const frac = Math.max(0, Math.min(1, g.progress / g.target));
        return h('li', { class: ['ev-goal', g.done && 'is-done'] }, icon(g.done ? 'check' : 'clock', 16),
          h('span', { class: 'ev-goal-text', text: g.text }), h('span', { class: 'ev-goal-count', text: `${Math.min(g.progress, g.target)}/${g.target}` }),
          (() => { const bar = h('div', { class: 'ev-bar', attrs: { 'aria-hidden': 'true' } }, h('div', {})); (bar.firstChild as HTMLElement).style.width = `${Math.round(frac * 100)}%`; return bar; })());
      })));
      if (ev.status === 'done') {
        parts.push(h('p', { class: 'ev-result', dataset: { rating: ev.rating ?? 'fair' }, text: `${RATING_TEXT[ev.rating ?? 'fair']} (${ev.score ?? 0}/100)` }));
        parts.push(h('div', { class: 'ev-foot' }, h('span', {}), button({ label: 'Dismiss', small: true, variant: 'ghost', onClick: () => { dismissed.add(ev.id); sig = ''; refresh(); } })));
      }
    }
    toggleClass(el, 'is-collapsed', collapsed);
    el.replaceChildren(...parts);
  };

  const cancel = async (ev: HomeEvent) => {
    const ok = await confirmDialog({ title: 'Call it off?', text: `Cancel the ${ev.title.toLowerCase()}? Guests will be told, and they may be a little disappointed.`, confirm: 'Cancel event', danger: true });
    if (!ok) return;
    const r = api.cancelEvent?.(ev.id);
    if (r && !r.ok) toast(r.reason, 'warning');
    else sh.sound('close');
    refresh();
  };

  const refresh = () => {
    const st = api.state();
    const live = api.mode() === 'live';
    const ev = st && live ? trackedEvent(st, dismissed) : undefined;
    if (!st || !ev) { if (!el.hidden) { el.hidden = true; el.replaceChildren(); sig = ''; sh.requestLayout(); } return; }
    if (ev.id !== shownId) { shownId = ev.id; collapsed = false; sig = ''; }
    const now = st.clock.minutes;
    const s = `${ev.id}|${ev.status}|${collapsed}|${ev.status === 'invited' ? Math.floor((ev.startAt - now) / 5) : ev.status === 'running' ? Math.floor((ev.endAt - now) / 5) : 0}|${ev.arrivedIds.length}|${ev.goals.map((g) => `${g.progress}${g.done ? 'd' : ''}`).join(',')}|${ev.rating ?? ''}`;
    if (s === sig) return;
    sig = s;
    render(st, ev);
    if (el.hidden) { el.hidden = false; sh.requestLayout(); }
  };

  return { el, refresh, destroy: () => el.remove() };
}
