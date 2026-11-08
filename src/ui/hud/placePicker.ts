// "Choose a person" and "Go somewhere" (Milestone 13, keyboard and screen-reader route to the world, next to the object
// picker): choosing a person opens the same action menu as tapping them; choosing a place walks the person there, like tapping
// the floor. Walls have no player actions in live mode, so there is no route for them.

import type { Id } from '../../core/types';
import { objectTiles } from '../../world/placement';
import { modal, toast } from '../kit/components';
import { h } from '../kit/dom';
import { icon } from '../kit/icons';
import { rowButton } from '../kit/controls';
import { stageName } from './familyModel';
import { otherPeople, placeChoices, type RoomInput } from './pickerModel';
import type { Shell } from './shell';

export function openPersonPicker(sh: Shell, personId: Id): void {
  const { api } = sh;
  const st = api.state();
  const person = st?.people[personId];
  if (!st || !person) return;
  const m = modal({ title: `Choose a person for ${person.firstName}` });
  const rows = otherPeople(st.people, personId, st.activeLotId, st.activeHouseholdId, stageName);
  if (!rows.length) {
    m.body.append(h('p', { class: 'empty' }, icon('info', 18), ' Nobody else is here.'));
  } else {
    m.body.append(
      h('p', { class: 'muted-note', text: `${rows.length} ${rows.length === 1 ? 'person' : 'people'} on this lot.` }),
      h('div', { class: 'menu-choices' }, ...rows.map((r) => rowButton({
        icon: 'person', title: r.name, subtitle: `${r.household ? 'Your household' : 'Visitor or neighbour'} · ${r.stage}`,
        onClick: () => { sh.sound('click'); m.close(); sh.openContextMenu(personId, { kind: 'person', personId: r.id }); },
      }))));
  }
  m.footer.append(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel', onClick: () => m.close() }));
}

export function openGoHerePicker(sh: Shell, personId: Id): void {
  const { api } = sh;
  const st = api.state();
  const person = st?.people[personId];
  const lot = st ? st.lots[st.activeLotId] : undefined;
  if (!st || !person || !lot) return;
  const m = modal({ title: `Send ${person.firstName} somewhere` });
  const blocked = new Set<string>();
  const catAt = new Map<string, string>();
  for (const o of Object.values(lot.objects)) {
    const cat = api.content.objects[o.defId]?.category ?? '';
    for (const t of objectTiles(o, api.content.objects[o.defId])) { blocked.add(`${o.level}:${t.x},${t.z}`); catAt.set(`${o.level}:${t.x},${t.z}`, cat); }
  }
  const rooms: RoomInput[] = [];
  for (let level = 0; level < Math.max(1, lot.levels); level++) {
    for (const r of api.rooms(level)) {
      const cats = r.tiles.map((t) => catAt.get(`${level}:${t.x},${t.z}`)).filter((c): c is string => !!c);
      rooms.push({ uid: r.uid, level, outdoor: r.outdoor, tiles: r.tiles, categories: cats });
    }
  }
  const places = placeChoices(rooms, lot.entry, blocked);
  m.body.append(
    h('p', { class: 'muted-note', text: 'Pick a room or spot to walk to.' }),
    h('div', { class: 'menu-choices' }, ...places.map((p) => rowButton({
      icon: 'move', title: p.name, subtitle: `Floor ${p.level + 1}${p.area ? ` · ${p.area} m²` : ''}`,
      onClick: () => {
        // the middle tile may be unreachable (a closed-in corner), so try the nearest few until one is accepted
        let reason = 'Cannot go there.';
        for (const t of p.tiles.slice(0, 12)) {
          const r = api.goTo(personId, { x: t.x, z: t.z, level: p.level });
          if (r.ok) {
            sh.sound('tap'); m.close();
            // the queue list redraws with the new walk, which replaces this panel's buttons: put keyboard focus back on the new one
            let tries = 0;
            const refocus = () => {
              if (document.activeElement === document.body) {
                const b = [...document.querySelectorAll<HTMLElement>('.person-panel button')].find((x) => x.textContent?.trim() === 'Go somewhere');
                if (b) { b.focus({ preventScroll: true }); return; }
              }
              if (++tries < 12) window.setTimeout(refocus, 60);
            };
            window.setTimeout(refocus, 60);
            return;
          }
          reason = r.reason;
        }
        toast(reason, 'warning', 2600);
        sh.sound('error');
      },
    }))));
  m.footer.append(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel', onClick: () => m.close() }));
}
