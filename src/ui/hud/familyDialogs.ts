// Family dialogs (Milestone 8): adopt a child, and move household members out or in with another household. Both show
// what will happen (api.adoptPreview / api.splitPreview) before anything is paid or moved.

import { NAME_MAX_LENGTH, randomFirstName } from '../../characters/names';
import { uiRng } from '../../core/rng';
import { STAGE_LABELS } from '../../core/lifeStages';
import type { Id } from '../../core/types';
import type { AdoptionSpec, SplitTarget } from '../../game/api';
import { button, chip, modal, segmented, toast } from '../kit/components';
import { h } from '../kit/dom';
import { icon } from '../kit/icons';
import { formatMoney } from './format';
import type { Shell } from './shell';

type AdoptStage = AdoptionSpec['stage'];
const STAGES: AdoptStage[] = ['baby', 'toddler', 'child', 'teen'];
const MAX_HOUSEHOLD = 8;

/** The adoption dialog for `adopterId`: stage, sex, name, fee and a live check. */
export function openAdoptDialog(sh: Shell, adopterId: Id): void {
  const { api } = sh;
  const st = api.state();
  const adopter = st?.people[adopterId];
  if (!st || !adopter || !api.adoptPreview || !api.adopt) { toast('Adoption is not available here.', 'warning'); return; }
  const rng = uiRng();
  let stage: AdoptStage = 'baby';
  let sex: AdoptionSpec['sex'] = 'girl';
  const avoid = () => (st.households[adopter.householdId]?.memberIds ?? []).map((id) => st.people[id]?.firstName ?? '');
  let name = randomFirstName(rng, 'she', avoid());
  const m = modal({ title: 'Adopt a child' });
  m.el.classList.add('adopt-dialog');

  const stageSeg = segmented<AdoptStage>({ label: 'Life stage', value: stage, options: STAGES.map((s) => ({ id: s, label: STAGE_LABELS[s] })), onChange: (v) => { stage = v; update(); } });
  const sexSeg = segmented<AdoptionSpec['sex']>({
    label: 'Sex', value: sex, options: [{ id: 'girl', label: 'Girl' }, { id: 'boy', label: 'Boy' }],
    onChange: (v) => { sex = v; name = randomFirstName(rng, v === 'girl' ? 'she' : 'he', avoid()); input.value = name; update(); },
  });
  const input = h('input', { type: 'text', class: 'text-input adopt-name', value: name, attrs: { maxlength: NAME_MAX_LENGTH, 'aria-label': 'First name', autocomplete: 'off' } });
  input.addEventListener('input', () => { name = input.value; update(); });
  const dice = button({ icon: 'dice', iconOnly: true, label: 'Random name', variant: 'secondary', onClick: () => { name = randomFirstName(rng, sex === 'girl' ? 'she' : 'he', avoid()); input.value = name; update(); sh.sound('click'); } });
  const note = h('p', { class: 'adopt-note' });
  const fee = h('p', { class: 'adopt-fee' });
  const adoptBtn = button({ label: 'Adopt', icon: 'heart', variant: 'primary', onClick: () => {
    const r = api.adopt!(adopterId, spec());
    if (!r.ok) { toast(r.reason, 'warning'); sh.sound('error'); update(); return; }
    sh.sound('confirm');
    m.close();
    toast(`${name.trim()} joined the family!`, 'success');
    if (r.personId) api.select(r.personId);
  } });
  const spec = (): AdoptionSpec => ({ stage, sex, firstName: name.trim() });
  function update(): void {
    const pv = api.adoptPreview!(adopterId, spec());
    fee.textContent = pv ? `Fee: ${formatMoney(pv.fee)} (household: ${pv.members} of ${pv.maxMembers} people after adopting). Parents: ${pv.parents.join(' and ')}.` : '';
    note.textContent = pv?.ok ? 'They get their looks from the parents and join the household as family.' : pv?.reason ?? '';
    note.classList.toggle('is-bad', !!pv && !pv.ok);
    adoptBtn.disabled = !pv?.ok;
  }
  m.body.append(
    h('p', { class: 'adopt-intro' }, icon('heart', 18), h('span', { text: `${adopter.firstName} phones the adoption agency. Choose who joins the family.` })),
    stageSeg.el, sexSeg.el,
    h('div', { class: 'field' }, h('label', { class: 'field-label', text: 'First name' }), h('div', { class: 'adopt-name-row' }, input, dice)),
    fee, note,
  );
  m.footer.append(button({ label: 'Cancel', variant: 'ghost', onClick: () => m.close() }), adoptBtn);
  update();
}

type Dest = 'lot' | 'household';

/** The move-out / move-in dialog: choose who goes and where, read the preview, confirm. */
export function openSplitDialog(sh: Shell, startPersonId: Id): void {
  const { api } = sh;
  const st = api.state();
  const nb = api.neighbourhood?.();
  if (!st || !nb || !api.splitPreview || !api.splitHousehold) { toast('Moving out is not available here.', 'warning'); return; }
  const hh = st.households[st.activeHouseholdId]!;
  const selected = new Set<Id>([startPersonId]);
  let dest: Dest = 'lot';
  let lotId: Id | null = null;
  let householdId: Id | null = null;
  const m = modal({ title: 'Move out or move in', wide: true });
  m.el.classList.add('split-dialog');

  const vacant = nb.lots.filter((l) => l.kind === 'residential' && (l.tenure === 'for-rent' || l.tenure === 'for-sale'));
  const others = nb.households.filter((x) => !x.active && x.memberIds.length > 0 && x.memberIds.length < MAX_HOUSEHOLD);
  lotId = vacant[0]?.id ?? null;
  householdId = others[0]?.id ?? null;

  const who = h('div', { class: 'split-who', role: 'group', attrs: { 'aria-label': 'Who moves' } });
  const where = h('div', { class: 'split-where', role: 'group', attrs: { 'aria-label': 'Where to' } });
  const lines = h('ul', { class: 'nbm-lines split-lines' });
  const reason = h('p', { class: 'adopt-note' });
  const go = button({ label: 'Move', icon: 'home', variant: 'primary', onClick: () => run() });
  const target = (): SplitTarget | null => (dest === 'lot' ? (lotId ? { kind: 'lot', lotId } : null) : (householdId ? { kind: 'household', householdId } : null));

  const renderWho = () => who.replaceChildren(...hh.memberIds.map((id) => {
    const p = st.people[id];
    return chip({ label: p ? `${p.firstName} (${STAGE_LABELS[p.lifeStage].toLowerCase()})` : id, selected: selected.has(id), onClick: () => { if (selected.has(id)) selected.delete(id); else selected.add(id); renderWho(); update(); } });
  }));
  const renderWhere = () => {
    const rows: HTMLElement[] = [];
    if (dest === 'lot') {
      if (vacant.length === 0) rows.push(h('p', { class: 'adopt-note', text: 'No empty homes are for rent or for sale right now.' }));
      for (const l of vacant) {
        rows.push(chip({ label: `${l.name} (${l.tenure === 'for-rent' ? `rent ${formatMoney(l.rent ?? 0)}/week` : `buy ${formatMoney(l.price ?? 0)}`})`, selected: lotId === l.id, onClick: () => { lotId = l.id; renderWhere(); update(); } }));
      }
    } else {
      if (others.length === 0) rows.push(h('p', { class: 'adopt-note', text: 'No other household has room.' }));
      for (const x of others) rows.push(chip({ label: `${x.name} household (${x.memberNames.join(', ')})`, selected: householdId === x.id, onClick: () => { householdId = x.id; renderWhere(); update(); } }));
    }
    where.replaceChildren(...rows);
  };
  const destSeg = segmented<Dest>({ label: 'Where to', value: dest, options: [{ id: 'lot', label: 'A home of their own' }, { id: 'household', label: 'Move in with...' }], onChange: (v) => { dest = v; renderWhere(); update(); } });

  function update(): void {
    const t = target();
    const pv = t && selected.size > 0 ? api.splitPreview!([...selected], t) : null;
    lines.replaceChildren(...(pv?.lines ?? []).map((l) => h('li', { text: l })));
    reason.textContent = pv ? (pv.ok ? '' : pv.reason ?? '') : selected.size === 0 ? 'Choose who moves.' : 'Choose where to.';
    reason.classList.toggle('is-bad', !!reason.textContent);
    go.disabled = !pv?.ok;
    go.querySelector('.btn-label')!.textContent = dest === 'lot' ? 'Move out' : 'Move in';
  }
  function run(): void {
    const t = target();
    if (!t) return;
    const r = api.splitHousehold!([...selected], t);
    if (!r.ok) { toast(r.reason, 'warning'); sh.sound('error'); update(); return; }
    sh.sound('confirm');
    m.close();
    const newId = r.householdId;
    const done = modal({ title: 'All settled' });
    done.el.classList.add('split-done');
    done.body.append(h('p', { text: 'They have moved. You can keep playing this household, or play theirs.' }));
    done.footer.append(
      button({ label: 'Stay here', variant: 'ghost', onClick: () => done.close() }),
      button({ label: 'Play their household', variant: 'primary', onClick: () => { done.close(); if (newId) { const sw = api.switchHousehold?.(newId); if (sw && !sw.ok) toast(sw.reason, 'warning'); } } }),
    );
  }

  m.body.append(
    h('p', { class: 'adopt-intro' }, icon('home', 18), h('span', { text: 'Choose who moves. Funds are shared by the number of people; at least one young adult or older stays.' })),
    reason,
    h('div', { class: 'field' }, h('div', { class: 'field-label', text: 'Who moves' }), who),
    destSeg.el, where, lines,
  );
  m.footer.append(button({ label: 'Cancel', variant: 'ghost', onClick: () => m.close() }), go);
  renderWho();
  renderWhere();
  update();
}
