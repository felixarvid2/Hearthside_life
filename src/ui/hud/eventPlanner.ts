// Event planner (phone -> "Plan an Event"): choose the kind of gathering, the guests and the time, see at once
// whether it can be done (and why not), then send the invitations. All rules live in the simulation
// (api.eventProblem / api.planEvent); this screen only lists known people and event types and shows the answer.
// It is a modal sheet that works in portrait, landscape and on the desktop.

import type { EventDef } from '../../content/types';
import { LABEL_TEXT } from '../../core/relations';
import type { HomeEventType, Id, RelLabel } from '../../core/types';
import { button, modal, toast } from '../kit/components';
import { h } from '../kit/dom';
import { icon } from '../kit/icons';
import { formatMoney, initials } from './format';
import type { Shell } from './shell';
import { guestAvailability, guestCandidates, startOptions } from './socialModel';

export function openEventPlanner(sh: Shell, hostId: Id): void {
  const { api } = sh;
  const st0 = api.state();
  const host0 = st0?.people[hostId];
  if (!st0 || !host0) return;
  const defs = Object.values(api.content.events ?? {}).filter((d) => d.planned && d.status === 'ready');
  if (defs.length === 0) { toast('No events can be planned right now.', 'info'); return; }
  const existing = (st0.homeEvents ?? []).find((e) => e.householdId === st0.activeHouseholdId && (e.status === 'invited' || e.status === 'running'));

  const m = modal({ title: 'Plan an Event', wide: true });
  m.el.classList.add('evp');
  if (existing) {
    m.body.append(h('div', { class: 'evp-current' }, h('strong', { text: `A ${existing.title.toLowerCase()} is already ${existing.status === 'running' ? 'under way' : 'planned'}.` }),
      h('p', { text: 'Only one gathering at a time. You can call a planned event off from the goal card on the screen.' })));
    m.footer.append(button({ label: 'Close', variant: 'primary', onClick: () => m.close() }));
    return;
  }

  let type: HomeEventType = defs[0]!.id;
  const chosen = new Set<Id>();
  let startAt = 0;

  const typeBox = h('div', { class: 'evp-types', role: 'radiogroup', ariaLabel: 'Kind of event' });
  const desc = h('p', { class: 'evp-desc' });
  const guestBox = h('div', { class: 'evp-guests', role: 'group', ariaLabel: 'Guests' });
  const guestHint = h('div', { class: 'field-label' });
  const when = h('select', { class: 'evp-when', ariaLabel: 'When' });
  const summary = h('div', { class: 'evp-summary', role: 'status' });
  const send = button({ label: 'Send invitations', icon: 'phone', variant: 'primary', disabled: true, onClick: () => doSend() });
  const cancelBtn = button({ label: 'Cancel', variant: 'ghost', onClick: () => m.close() });
  m.footer.append(cancelBtn, send);
  m.body.append(
    h('div', { class: 'field' }, h('div', { class: 'field-label', text: 'What kind of event?' }), typeBox, desc),
    h('div', { class: 'field' }, guestHint, guestBox),
    h('div', { class: 'field' }, h('label', { class: 'field-label', text: 'When?' }, ), when),
    summary);

  const def = (): EventDef => api.content.events![type]!;
  const cost = (): number => {
    const st = api.state()!, host = st.people[hostId]!;
    const members = st.households[host.householdId]?.memberIds.length ?? 1;
    return def().cateringPerPerson * (members + chosen.size);
  };

  const renderTypes = () => {
    typeBox.replaceChildren(...defs.map((d) => {
      const b = h('button', { type: 'button', class: ['evp-type', d.id === type && 'is-selected'], role: 'radio', attrs: { 'aria-checked': d.id === type } },
        h('span', { class: 'evp-type-name' }, icon(d.icon, 18), h('span', { text: d.name })),
        h('span', { class: 'evp-type-sub', text: `${d.minGuests === d.maxGuests ? `${d.minGuests} guest` : `${d.minGuests}-${d.maxGuests} guests`} · ${d.cateringPerPerson ? `${formatMoney(d.cateringPerPerson)} a head` : 'no food'}` }));
      b.addEventListener('click', () => { if (type !== d.id) { type = d.id; chosen.clear(); sh.sound('click'); renderAll(); } });
      return b;
    }));
    desc.textContent = def().description;
  };

  const renderWhen = () => {
    const st = api.state()!;
    const opts = startOptions(st.clock.minutes, def().leadMinutes);
    const keep = opts.find((o) => o.at === startAt) ? startAt : opts[0]?.at ?? 0;
    startAt = keep;
    when.replaceChildren(...opts.map((o) => { const op = h('option', { text: o.label }); op.value = String(o.at); op.selected = o.at === startAt; return op; }));
    when.disabled = opts.length === 0;
  };

  const renderGuests = () => {
    const st = api.state()!, host = st.people[hostId]!, d = def();
    const people = guestCandidates(st, host, d);
    guestHint.textContent = `Guests (${chosen.size} of ${d.minGuests === d.maxGuests ? d.minGuests : `${d.minGuests}-${d.maxGuests}`})`;
    if (people.length === 0) {
      guestBox.replaceChildren(h('p', { class: 'evp-desc', text: d.romantic ? `${host.firstName} does not know anyone they could invite on a date yet.` : `${host.firstName} does not know anyone to invite yet. Meet the neighbours first.` }));
      return;
    }
    guestBox.replaceChildren(...people.map((g) => {
      const a = guestAvailability(g);
      const on = chosen.has(g.id);
      const rel = st.relationships[`${host.id}>${g.id}`];
      const label: RelLabel = rel?.label ?? 'acquaintance';
      const url = api.portrait(g.id);
      const av = url ? h('img', { class: 'rel-avatar', attrs: { src: url, alt: '' } }) : h('span', { class: 'rel-avatar rel-initials', text: initials(g), attrs: { 'aria-hidden': 'true' } });
      const b = h('button', { type: 'button', class: ['evp-guest', on && 'is-selected'], disabled: !a.ok, attrs: { 'aria-pressed': on } },
        av, h('span', { class: 'evp-guest-main' }, h('span', { class: 'evp-guest-name', text: `${g.firstName} ${g.lastName}`.trim() }),
          h('span', { class: 'evp-guest-sub', text: `${LABEL_TEXT[label]} · ${a.text}` })), on ? icon('check', 20) : null);
      b.addEventListener('click', () => {
        if (chosen.has(g.id)) chosen.delete(g.id);
        else if (chosen.size < d.maxGuests) chosen.add(g.id);
        else if (d.maxGuests === 1) { chosen.clear(); chosen.add(g.id); }
        else { toast(`At most ${d.maxGuests} guests.`, 'info', 2200); return; }
        sh.sound('click');
        renderGuests();
        renderSummary();
      });
      return b;
    }));
  };

  const request = () => ({ type, hostId, guestIds: [...chosen], startAt });

  const renderSummary = () => {
    const problem = chosen.size === 0 ? 'Choose who to invite.' : startAt === 0 ? 'No start time is available.' : api.eventProblem?.(request()) ?? null;
    const c = cost();
    summary.replaceChildren(problem
      ? h('div', { class: 'evp-problem' }, icon('warning', 18), h('span', { text: problem }))
      : h('div', { class: 'evp-ok' }, h('span', { text: `${def().name} with ${[...chosen].map((id) => api.state()!.people[id]?.firstName).join(', ')}${c ? ` · food ${formatMoney(c)}` : ''}` })));
    send.disabled = !!problem;
  };

  const renderAll = () => { renderTypes(); renderGuests(); renderWhen(); renderSummary(); };
  when.addEventListener('change', () => { startAt = Number(when.value); renderSummary(); });

  const doSend = () => {
    const r = api.planEvent?.(request());
    if (!r) return;
    if (r.ok) { sh.sound('confirm'); m.close(); toast(`Invitations sent for the ${def().name.toLowerCase()}.`, 'success'); }
    else { sh.sound('error'); toast(r.reason, 'warning'); renderSummary(); }
  };

  renderAll();
}
