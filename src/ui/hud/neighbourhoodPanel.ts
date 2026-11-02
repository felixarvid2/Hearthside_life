// Neighbourhood map (Milestone 7): the street with its lots as tappable pins (or as a list), the trip under way, and a
// detail sheet for the chosen lot with the actions: Go here (who goes), Go home, Move here, Play this household.
// Everything it shows comes from api.neighbourhood(); the rules (what is possible and why not) are the simulation's
// (travelProblem, switchPreview, movePreview). It is a modal that works in portrait, landscape and on the desktop:
// narrow screens show the detail sheet over the map, wide screens beside it.

import type { Id } from '../../core/types';
import type { LotInfo, NeighbourhoodInfo } from '../../game/api';
import { button, modal, toast, type Modal } from '../kit/components';
import { h } from '../kit/dom';
import { icon } from '../kit/icons';
import { formatMoney } from './format';
import {
  awayFromHome, defaultTravellers, hoursLine, keepTravellers, lotActions, lotIconName, lotMarks, lotSections, lotStatus, mapSummary,
  moveSummary, peopleLine, pinPosition, tenureText, travellers, travelLine, tripView, type Traveller,
} from './neighbourhoodModel';
import type { Shell } from './shell';

export interface NeighbourhoodPanel {
  isOpen(): boolean;
  close(): void;
  /** Re-reads the neighbourhood and redraws when something visible changed. */
  refresh(): void;
}

type View = 'map' | 'list';

let current: NeighbourhoodPanel | null = null;

/** Closes the map if it is open (a game was loaded, the mode changed). */
export function closeNeighbourhood(): void { current?.close(); }

/** Opens the map (or brings the open one up to date). `lotId` selects a lot and shows its sheet. */
export function openNeighbourhood(sh: Shell, opts: { lotId?: Id } = {}): NeighbourhoodPanel | null {
  if (current?.isOpen()) { current.close(); }
  const { api } = sh;
  if (!api.neighbourhood || !api.state()) { toast('The neighbourhood map is not available here.', 'info'); return null; }

  let view: View = 'map';
  let selectedId: Id | null = opts.lotId ?? null;
  /** Who is ticked in "Who goes?"; null until the sheet of a lot is first drawn. */
  let ticked: Set<Id> | null = null;
  let tickedFor = '';
  let sig = '';
  let closed = false;

  const m: Modal = modal({ title: 'Neighbourhood', wide: true, onClose: () => { closed = true; unsub(); window.clearInterval(timer); if (current === panel) current = null; sh.sound('close'); } });
  m.el.classList.add('nbm');

  // header extras: the Map / List switch sits next to the title
  const mapBtn = h('button', { type: 'button', class: 'seg', role: 'radio', dataset: { id: 'map' }, ariaLabel: 'Map' }, icon('map', 18), h('span', { class: 'seg-text', text: 'Map' }));
  const listBtn = h('button', { type: 'button', class: 'seg', role: 'radio', dataset: { id: 'list' }, ariaLabel: 'List' }, icon('list', 18), h('span', { class: 'seg-text', text: 'List' }));
  const toggle = h('div', { class: ['segmented', 'nbm-toggle'], role: 'radiogroup', ariaLabel: 'Show as' }, mapBtn, listBtn);
  const setView = (v: View) => { view = v; sig = ''; sh.sound('click'); refresh(); };
  mapBtn.addEventListener('click', () => setView('map'));
  listBtn.addEventListener('click', () => setView('list'));
  const homeBtn = button({ icon: 'home', label: 'Go home', small: true, variant: 'secondary', title: 'Everybody who is out goes home', onClick: () => goHome() });
  homeBtn.classList.add('nbm-gohome');
  homeBtn.setAttribute('aria-label', 'Go home');
  const headSummary = h('span', { class: 'nbm-head-summary' });
  const head = m.el.querySelector('.modal-header');
  head?.insertBefore(headSummary, head.lastElementChild);
  head?.insertBefore(homeBtn, head.lastElementChild);
  head?.insertBefore(toggle, head.lastElementChild);

  // body (the summary line sits in the header on wide screens and in this bar on narrow ones)
  const summaryEl = h('span', { class: 'nbm-summary' });
  const bar = h('div', { class: 'nbm-bar' }, summaryEl);
  const tripEl = h('div', { class: 'nbm-trip', role: 'status' });
  const mapEl = h('div', { class: 'nbm-map', role: 'group', ariaLabel: 'Street map' });
  const mapScroll = h('div', { class: 'nbm-map-scroll', tabIndex: 0, ariaLabel: 'Street map, scrollable' }, mapEl);
  const listEl = h('div', { class: 'nbm-list', role: 'list' });
  const left = h('div', { class: 'nbm-left' }, mapScroll, listEl);
  const detailEl = h('section', { class: 'nbm-detail', ariaLabel: 'Place details' });
  const main = h('div', { class: 'nbm-main' }, left, detailEl);
  m.body.append(bar, tripEl, main);

  // ---- actions ----

  // The simulation announces the trip, the switch or the move in the feed (and as a toast), so the map only closes.
  const finish = () => { sh.sound('confirm'); m.close(); };

  const travelTo = (lot: LotInfo, ids: Id[]) => {
    const r = api.travel?.(ids, lot.id) ?? { ok: false as const, reason: 'Travel is not available here.' };
    if (!r.ok) { sh.sound('error'); toast(r.reason, 'warning'); refresh(true); return; }
    finish();
  };

  const goHome = (ids?: Id[]) => {
    const r = api.goHome?.(ids) ?? { ok: false as const, reason: 'Travel is not available here.' };
    if (!r.ok) { sh.sound('error'); toast(r.reason, 'warning'); refresh(true); return; }
    finish();
  };

  const confirmMove = async (lot: LotInfo) => {
    const pv = api.movePreview?.(lot.id);
    if (!pv) return;
    if (!pv.ok) { toast(pv.reason ?? 'That move is not possible.', 'warning'); return; }
    const s = moveSummary(pv, lot.name);
    const ok = await confirmDialogLines({ title: s.title, lines: s.lines, confirm: s.confirm });
    if (!ok || closed) return;
    const r = api.moveHousehold?.(lot.id) ?? { ok: false as const, reason: 'Moving is not available here.' };
    if (!r.ok) { sh.sound('error'); toast(r.reason, 'warning'); refresh(true); return; }
    sh.sound('money');
    finish();
  };

  const confirmSwitch = async (householdId: Id, householdName: string) => {
    const pv = api.switchPreview?.(householdId);
    if (!pv) return;
    if (!pv.ok) { toast(pv.reason ?? 'You cannot switch now.', 'warning'); return; }
    const ok = await confirmDialogLines({ title: `Play the ${householdName} household?`, lines: pv.consequences, confirm: 'Play this household' });
    if (!ok || closed) return;
    const r = api.switchHousehold?.(householdId) ?? { ok: false as const, reason: 'Switching is not available here.' };
    if (!r.ok) { sh.sound('error'); toast(r.reason, 'warning'); refresh(true); return; }
    finish();
  };

  // ---- drawing ----

  const peopleRow = (p: LotInfoPerson) => h('li', { class: ['nbm-person', p.yours && 'is-yours'] },
    icon('person', 16), h('span', { class: 'nbm-person-name', text: p.name }), p.yours ? h('span', { class: 'tag', text: 'You' }) : null,
    h('span', { class: 'nbm-person-where', text: p.status }));

  const markChips = (lot: LotInfo) => lotMarks(lot).map((mk) => h('span', { class: ['nbm-mark', `is-${mk.id}`] }, icon(mk.id === 'home' ? 'home' : 'pin', 14), h('span', { text: mk.text })));

  const pinLabel = (lot: LotInfo): string => {
    const st = lotStatus(lot);
    const marks = lotMarks(lot).map((x) => x.text).join(', ');
    return `${lot.name}, ${lot.label}, ${st.text}${marks ? `, ${marks}` : ''}, ${peopleLine(lot.people, 3)}${travelLine(lot) ? `, ${travelLine(lot)}` : ''}`;
  };

  const pin = (lot: LotInfo): HTMLButtonElement => {
    const pos = pinPosition(lot);
    const status = lotStatus(lot);
    const b = h('button', {
      type: 'button', class: ['nbm-pin', `kind-${lot.kind}`, lot.id === selectedId && 'is-selected', lot.active && 'is-active', lot.isHome && 'is-home'],
      dataset: { lotId: lot.id }, ariaLabel: pinLabel(lot),
      attrs: { 'aria-current': lot.active ? 'location' : null },
    },
    h('span', { class: 'nbm-pin-title' }, icon(lotIconName(lot), 16), h('span', { class: 'nbm-pin-name', text: lot.name })),
    h('span', { class: ['nbm-pin-status', `tone-${status.tone}`], text: status.text }),
    h('span', { class: 'nbm-pin-people' }, icon('people', 14), h('span', { text: peopleLine(lot.people, 2) })));
    if (lot.active || lot.isHome) b.appendChild(h('span', { class: 'nbm-pin-marks' }, ...lotMarks(lot).map((mk) => h('span', { class: ['nbm-flag', `is-${mk.id}`], title: mk.text }, icon(mk.id === 'home' ? 'home' : 'pin', 14)))));
    b.style.left = `${pos.left}%`;
    b.style.top = `${pos.top}%`;
    b.addEventListener('click', () => select(lot.id));
    return b;
  };

  const row = (lot: LotInfo): HTMLElement => {
    const status = lotStatus(lot);
    const travel = travelLine(lot);
    const b = h('button', {
      type: 'button', class: ['nbm-row', lot.id === selectedId && 'is-selected', lot.active && 'is-active'], dataset: { lotId: lot.id }, ariaLabel: pinLabel(lot),
      attrs: { 'aria-current': lot.active ? 'location' : null },
    },
    h('span', { class: 'nbm-row-icon' }, icon(lotIconName(lot), 22)),
    h('span', { class: 'nbm-row-main' },
      h('span', { class: 'nbm-row-name', text: lot.name }),
      h('span', { class: 'nbm-row-sub' }, h('span', { class: ['nbm-pin-status', `tone-${status.tone}`], text: status.text }), lot.hours ? h('span', { text: ` · ${lot.hours}` }) : null),
      h('span', { class: 'nbm-row-people' }, icon('people', 14), h('span', { text: lot.people.length > 0 ? `${lot.people.length} here: ${peopleLine(lot.people, 3)}` : 'Nobody here' }))),
    h('span', { class: 'nbm-row-end' }, ...markChips(lot), travel ? h('span', { class: 'nbm-row-travel', text: travel }) : null));
    b.addEventListener('click', () => select(lot.id));
    return h('div', { role: 'listitem' }, b);
  };

  const select = (id: Id) => {
    if (selectedId !== id) { ticked = null; }
    selectedId = id;
    sh.sound('select');
    sig = '';
    refresh();
  };

  const closeSheet = () => { selectedId = null; ticked = null; sig = ''; sh.sound('click'); refresh(); };

  const chipsFor = (list: Traveller[], onChange: () => void): HTMLElement => {
    const box = h('div', { class: 'nbm-who', role: 'group', ariaLabel: 'Who goes' });
    for (const t of list) {
      const on = !!ticked?.has(t.id);
      const b = h('button', {
        type: 'button', class: ['chip', 'nbm-chip', on && 'is-selected'], disabled: !t.canGo, dataset: { personId: t.id },
        attrs: { 'aria-pressed': on }, title: t.canGo ? `${t.name}, ${t.where}` : `${t.name} ${t.why ?? 'cannot go'}`,
      }, icon(on ? 'check' : 'person', 16), h('span', { text: t.name }), h('span', { class: 'nbm-chip-where', text: t.where }));
      b.addEventListener('click', () => {
        if (!t.canGo || !ticked) return;
        if (ticked.has(t.id)) ticked.delete(t.id); else ticked.add(t.id);
        sh.sound('toggle');
        sig = '';
        onChange();
      });
      box.appendChild(b);
    }
    return box;
  };

  const renderDetail = (info: NeighbourhoodInfo) => {
    const lot = selectedId ? info.lots.find((l) => l.id === selectedId) : undefined;
    detailEl.dataset.empty = lot ? 'false' : 'true';
    left.classList.toggle('has-sheet', !!lot);
    if (!lot) {
      detailEl.replaceChildren(h('div', { class: 'nbm-placeholder' }, icon('map', 28), h('p', { text: 'Choose a place on the map to see who is there and how to get there.' })));
      return;
    }
    const st = api.state()!;
    const hh = st.households[info.activeHouseholdId];
    const acts = lotActions(lot, info.households);
    const status = lotStatus(lot);
    const hours = hoursLine(lot);
    const tenure = tenureText(lot);
    const travel = travelLine(lot);
    const household = lot.householdId ? info.households.find((x) => x.id === lot.householdId) : undefined;

    const back = button({ icon: 'back', iconOnly: true, label: view === 'list' ? 'Back to the list' : 'Back to the map', small: true, variant: 'ghost', onClick: closeSheet });
    back.classList.add('nbm-back');
    const parts: HTMLElement[] = [
      h('div', { class: 'nbm-detail-head' }, back,
        h('span', { class: 'nbm-detail-icon' }, icon(lotIconName(lot), 26)),
        h('div', { class: 'nbm-detail-titles' }, h('h3', { text: lot.name }), h('span', { class: 'nbm-detail-sub', text: `${lot.label} · ${lot.address}` }))),
      h('div', { class: 'nbm-chips' }, ...markChips(lot), h('span', { class: ['nbm-state', `tone-${status.tone}`], text: status.text }),
        hours ? h('span', { class: 'nbm-fact' }, icon('clock', 14), h('span', { text: hours.replace(/^(Open|Closed) /, '') })) : null,
        travel ? h('span', { class: 'nbm-fact' }, icon('car', 14), h('span', { text: travel })) : null),
    ];
    if (lot.blurb) parts.push(h('p', { class: 'nbm-blurb', text: lot.blurb }));
    if (tenure) parts.push(h('p', { class: 'nbm-tenure', text: tenure }));
    if (household && lot.tenure !== 'yours') {
      parts.push(h('div', { class: 'nbm-household' }, icon('family', 18),
        h('div', {}, h('strong', { text: `${household.name} household` }), h('span', { text: `${household.memberNames.join(', ')} · ${household.where}` }))));
    }
    parts.push(h('h4', { class: 'nbm-subhead', text: lot.people.length > 0 ? `Here now (${lot.people.length})` : 'Here now' }),
      lot.people.length > 0 ? h('ul', { class: 'nbm-people' }, ...lot.people.map(peopleRow)) : h('p', { class: 'nbm-empty', text: 'Nobody is here right now.' }));

    // ---- actions ----
    const actions = h('div', { class: 'nbm-actions' });
    const reasons: string[] = [];
    if (acts.here) {
      actions.appendChild(h('p', { class: 'nbm-here' }, icon('pin', 16), h('span', { text: `You are here. Use the world view to ${lot.kind === 'venue' ? 'do things at ' + lot.name : 'live your life'}.` })));
    }
    if (acts.visit || acts.goHome) {
      const members = hh?.memberIds ?? [];
      let list = travellers(st, members);
      if (acts.goHome) list = list.filter((t) => t.kind !== 'home');
      const key = `${lot.id}:${acts.goHome}`;
      if (ticked === null || tickedFor !== key) {
        ticked = new Set(defaultTravellers(list, api.selected(), acts.goHome));
        tickedFor = key;
      } else ticked = new Set(keepTravellers(list, ticked));
      if (list.length > 0) {
        actions.append(h('div', { class: 'field-label', text: acts.goHome ? 'Who comes home?' : 'Who goes?' }), chipsFor(list, () => refresh(true)));
      }
      const ids = [...ticked];
      const problem = ids.length === 0
        ? (list.every((t) => !t.canGo) && list.length > 0 ? `${list[0]!.name} ${list[0]!.why ?? 'cannot go'}.` : 'Choose who goes.')
        : api.travelProblem?.(ids, lot.id) ?? null;
      const label = acts.goHome ? 'Go home' : 'Go here';
      const go = button({ icon: acts.goHome ? 'home' : 'car', label, variant: 'primary', disabled: !!problem, ...(problem ? { title: problem } : {}), onClick: () => (acts.goHome ? goHome(ids) : travelTo(lot, ids)) });
      go.classList.add('nbm-go');
      actions.appendChild(go);
      if (problem) reasons.push(problem);
    }
    if (acts.move) {
      const pv = api.movePreview?.(lot.id);
      const problem = pv ? (pv.ok ? null : pv.reason ?? 'You cannot move there now.') : 'Moving is not available here.';
      const cost = lot.tenure === 'for-rent' ? lot.rent : lot.price;
      const mv = button({ icon: 'key', label: 'Move here', variant: acts.visit ? 'secondary' : 'primary', disabled: !!problem, ...(problem ? { title: problem } : {}), onClick: () => { void confirmMove(lot); } });
      mv.classList.add('nbm-move');
      actions.appendChild(mv);
      if (cost !== null && !problem) actions.appendChild(h('p', { class: 'nbm-note', text: acts.move === 'rent' ? `${formatMoney(cost)} a week, first week paid now.` : `${formatMoney(cost)}, paid now.` }));
      if (problem) reasons.push(problem);
    }
    if (acts.play) {
      const hid = acts.play.id;
      const pv = api.switchPreview?.(hid);
      const problem = pv ? (pv.ok ? null : pv.reason ?? 'You cannot switch now.') : 'Switching is not available here.';
      const sw = button({ icon: 'swap', label: 'Play this household', variant: 'secondary', disabled: !!problem, ...(problem ? { title: problem } : {}), onClick: () => { void confirmSwitch(hid, acts.play!.name); } });
      sw.classList.add('nbm-play');
      actions.appendChild(sw);
      if (problem) reasons.push(problem);
    }
    if (reasons.length > 0) actions.appendChild(h('div', { class: 'nbm-reason', role: 'status' }, icon('lock', 16), h('span', { text: [...new Set(reasons)].join(' ') })));
    parts.push(actions);
    detailEl.replaceChildren(...parts);
  };

  const render = (info: NeighbourhoodInfo) => {
    const sum = mapSummary(info.lots);
    const summary = `${info.street ?? 'The neighbourhood'} · ${sum.lots} places · ${sum.open} of ${sum.venues} venues open`;
    summaryEl.textContent = summary;
    headSummary.textContent = summary;
    homeBtn.hidden = !awayFromHome(info);
    const st = api.state()!;
    const tv = tripView(info.trip, info.now, (id) => st.people[id]?.firstName ?? 'Someone');
    if (tv) tripEl.replaceChildren(icon('car', 20), h('div', { class: 'nbm-trip-text' }, h('strong', { text: tv.title }), h('span', { text: tv.line })));
    else tripEl.replaceChildren();
    tripEl.hidden = !tv;

    mapBtn.setAttribute('aria-checked', String(view === 'map'));
    listBtn.setAttribute('aria-checked', String(view === 'list'));
    mapBtn.classList.toggle('is-selected', view === 'map');
    listBtn.classList.toggle('is-selected', view === 'list');
    m.el.dataset.view = view;
    m.el.dataset.sheet = selectedId ? 'open' : 'closed';
    mapScroll.hidden = view !== 'map';
    listEl.hidden = view !== 'list';

    mapEl.replaceChildren(...info.lots.map(pin));
    listEl.replaceChildren(...lotSections(info.lots).flatMap((s) => [h('h4', { class: 'nbm-subhead', text: s.title }), ...s.lots.map(row)]));
    renderDetail(info);
  };

  /** Scrolls the map so the lot you are at is in the middle (first draw). */
  let centred = false;
  const centreMap = (info: NeighbourhoodInfo) => {
    if (centred || view !== 'map') return;
    const lot = info.lots.find((l) => l.id === (selectedId ?? info.activeLotId));
    if (!lot || mapScroll.clientWidth === 0) return;
    centred = true;
    const p = pinPosition(lot);
    mapScroll.scrollLeft = Math.max(0, (mapEl.offsetWidth * p.left) / 100 - mapScroll.clientWidth / 2);
    mapScroll.scrollTop = Math.max(0, (mapEl.offsetHeight * p.top) / 100 - mapScroll.clientHeight / 2);
  };

  const refresh = (force = false) => {
    if (closed) return;
    const info = api.neighbourhood?.();
    if (!info) return;
    // Redraw only when something visible changed (the clock moves the open/closed state and the arrival countdown by minutes).
    const next = JSON.stringify({ ...info, now: Math.floor(info.now / 5) }) + `|${view}|${selectedId}|${ticked ? [...ticked].join(',') : ''}|${api.selected()}`;
    if (!force && next === sig) return;
    sig = next;
    const scroll = { l: mapScroll.scrollLeft, t: mapScroll.scrollTop, dl: detailEl.scrollTop, ll: listEl.scrollTop };
    render(info);
    mapScroll.scrollLeft = scroll.l; mapScroll.scrollTop = scroll.t; detailEl.scrollTop = scroll.dl; listEl.scrollTop = scroll.ll;
    centreMap(info);
  };

  const unsub = api.onChange((what) => { if (what === 'lot' || what === 'neighbourhood' || what === 'state' || what === 'selection') refresh(); });
  const timer = window.setInterval(() => refresh(), 1000);

  const panel: NeighbourhoodPanel = {
    isOpen: () => !closed,
    close: () => { if (!closed) m.close(); },
    refresh: () => refresh(),
  };
  current = panel;
  refresh(true);
  sh.sound('open');
  return panel;
}

type LotInfoPerson = LotInfo['people'][number];

/** A confirmation with a list of sentences (switching households, moving house). */
function confirmDialogLines(o: { title: string; lines: string[]; confirm: string }): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const dlg = modal({ title: o.title, onClose: () => { if (!done) resolve(false); } });
    dlg.el.classList.add('nbm-confirm');
    dlg.body.appendChild(h('ul', { class: 'nbm-lines' }, ...o.lines.map((l) => h('li', { text: l }))));
    dlg.footer.append(
      button({ label: 'Cancel', variant: 'ghost', onClick: () => { done = true; resolve(false); dlg.close(); } }),
      button({ label: o.confirm, variant: 'primary', onClick: () => { done = true; resolve(true); dlg.close(); } }),
    );
  });
}
