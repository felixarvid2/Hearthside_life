// "Choose an object" (Milestone 13, keyboard and screen-reader route to the world): a list of the objects on the lot that
// the person can use right now. Choosing one opens the same action menu as tapping the object in the world.

import type { Id } from '../../core/types';
import { modal } from '../kit/components';
import { h } from '../kit/dom';
import { icon } from '../kit/icons';
import { rowButton } from '../kit/controls';
import type { Shell } from './shell';

export function openObjectPicker(sh: Shell, personId: Id): void {
  const { api } = sh;
  const st = api.state();
  const person = st?.people[personId];
  const lot = st ? st.lots[st.activeLotId] : undefined;
  if (!st || !person || !lot) return;
  const m = modal({ title: `Choose an object for ${person.firstName}` });
  const level = api.view.level?.() ?? 0;
  const rows = Object.values(lot.objects)
    .map((o) => ({ o, name: api.content.objects[o.defId]?.name ?? o.defId, n: api.options(personId, { kind: 'object', objectId: o.id }).filter((x) => x.enabled).length }))
    .filter((r) => r.n > 0)
    .sort((a, b) => (a.o.level === level ? 0 : 1) - (b.o.level === level ? 0 : 1) || a.name.localeCompare(b.name) || a.o.id.localeCompare(b.o.id));
  if (!rows.length) {
    m.body.append(h('p', { class: 'empty' }, icon('info', 18), ' Nothing here can be used right now.'));
  } else {
    m.body.append(
      h('p', { class: 'muted-note', text: `${rows.length} objects with something to do. Floor ${level + 1} first.` }),
      h('div', { class: 'menu-choices' }, ...rows.slice(0, 80).map(({ o, name, n }) => rowButton({
        icon: 'box', title: name, subtitle: `${n} ${n === 1 ? 'action' : 'actions'}${o.level !== level ? ` · floor ${o.level + 1}` : ''}`,
        onClick: () => { sh.sound('click'); m.close(); sh.openContextMenu(personId, { kind: 'object', objectId: o.id }); },
      }))));
  }
  m.footer.append(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel', onClick: () => m.close() }));
}
