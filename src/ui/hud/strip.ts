// Household strip: one portrait per member with mood ring, selection and away badge.
// Tap selects (and centres the camera); tapping the selected portrait again opens the person panel.

import { formatClock } from '../../core/clock';
import { householdMembers } from '../../core/state';
import type { Person, WorldState } from '../../core/types';
import { placeOf } from '../../sim/places';
import { h, setText, toggleClass } from '../kit/dom';
import { icon } from '../kit/icons';
import { initials, moodTone } from './format';
import type { Shell } from './shell';

const AWAY_LABELS: Record<string, string> = { work: 'At work', school: 'At school', errand: 'Out', visiting: 'Visiting', home: 'Away' };

/**
 * Away badge text for a person who is not on the active lot. With the world state (Milestone 7) the label says where they
 * are: "At Lakeside Park", "At home", "At work", "On the way to Lantern Hall".
 */
export function awayText(p: Person, state?: WorldState | null): { label: string; back: string; at: string } | null {
  if (p.location.kind !== 'offlot') return null;
  const label = state ? placeOf(state, p).text : AWAY_LABELS[p.location.place] ?? 'Away';
  return { label, back: p.location.until !== null ? `Back ${formatClock(p.location.until)}` : '', at: p.location.until !== null ? formatClock(p.location.until) : '' };
}

interface MemberView {
  id: string;
  btn: HTMLButtonElement;
  ring: HTMLElement;
  img: HTMLImageElement;
  ini: HTMLElement;
  badge: HTMLElement;
  name: HTMLElement;
  sig: string;
}

export interface Strip { el: HTMLElement; refresh(): void; refreshPortraits(): void }

export function createStrip(sh: Shell): Strip {
  const { api } = sh;
  const list = h('div', { class: 'strip-list', role: 'toolbar', ariaLabel: 'Household members' });
  const el = h('div', { class: 'hud-strip' }, list);
  let views: MemberView[] = [];
  let key = '';

  const build = (members: Person[]) => {
    views = members.map((p) => {
      const img = h('img', { class: 'member-img', attrs: { alt: '', draggable: 'false' } });
      img.hidden = true;
      const ini = h('span', { class: 'member-initials', text: initials(p), attrs: { 'aria-hidden': 'true' } });
      const ring = h('span', { class: 'member-ring' }, img, ini);
      const badge = h('span', { class: 'member-badge' }, icon('briefcase', 14));
      badge.hidden = true;
      const name = h('span', { class: 'member-name', text: p.firstName });
      const btn = h('button', { type: 'button', class: 'member', dataset: { personId: p.id } }, ring, badge, name);
      btn.addEventListener('click', () => {
        const st = api.state();
        const person = st?.people[p.id];
        if (!person) return;
        if (api.selected() === p.id) {
          if (sh.isPanelOpen('person')) { sh.closePanels(); sh.sound('close'); }
          else { sh.openPanel('person', { personId: p.id }); sh.sound('open'); }
        } else {
          api.select(p.id);
          sh.sound('select');
          if (person.location.kind === 'lot') api.view.focusPerson(p.id);
          if (sh.isPanelOpen('person')) sh.openPanel('person', { personId: p.id });
        }
      });
      return { id: p.id, btn, ring, img, ini, badge, name, sig: '' };
    });
    list.replaceChildren(...views.map((v) => v.btn));
  };

  const refreshPortraits = () => {
    for (const v of views) {
      const url = api.portrait(v.id);
      if (url) { if (v.img.getAttribute('src') !== url) v.img.src = url; v.img.hidden = false; v.ini.hidden = true; }
      else { v.img.hidden = true; v.ini.hidden = false; }
    }
  };

  const refresh = () => {
    const st = api.state();
    const members = st ? householdMembers(st, st.activeHouseholdId) : [];
    const k = members.map((m) => `${m.id}:${m.firstName}:${m.lastName}`).join('|');
    if (k !== key) { key = k; build(members); refreshPortraits(); }
    const sel = api.selected();
    for (const v of views) {
      const p = st?.people[v.id];
      if (!p) continue;
      const mood = api.mood(v.id);
      const tone = moodTone(mood.value);
      const away = awayText(p, st);
      const selected = sel === v.id;
      const sig = `${selected}|${tone}|${mood.label}|${away?.label ?? ''}|${away?.back ?? ''}`;
      if (sig === v.sig) continue;
      v.sig = sig;
      toggleClass(v.btn, 'is-selected', selected);
      toggleClass(v.btn, 'is-away', !!away);
      v.btn.setAttribute('aria-pressed', String(selected));
      v.ring.dataset.tone = tone;
      v.badge.hidden = !away;
      // away: the badge shows why, the name line shows the return time (the full text is in the label)
      setText(v.name, away?.at ? away.at : p.firstName);
      const label = `${p.firstName} ${p.lastName}, mood ${mood.label}${away ? `, ${away.label.toLowerCase()}${away.back ? `, ${away.back.toLowerCase()}` : ''}` : ''}${selected ? ', selected. Tap again for details' : ''}`;
      v.btn.setAttribute('aria-label', label);
      v.btn.title = label;
    }
  };

  return { el, refresh, refreshPortraits };
}
