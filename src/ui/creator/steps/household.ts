// Household step: household name, members (edit, reorder, duplicate, remove, add), the tie between every pair
// with validation messages, a family tree, the starting-funds note for the start mode, premade households and
// household templates.

import { FAMILY_TIES, HOUSEHOLD_NAME_MAX_LENGTH, MAX_HOUSEHOLD_MEMBERS, memberName, TIE_NAMES } from '../../../characters/creator';
import type { FamilyTie, StartMode } from '../../../core/types';
import { button } from '../../kit/components';
import { h, setText, toggleClass } from '../../kit/dom';
import { icon } from '../../kit/icons';
import { familyTree } from '../familyTree';
import type { StepDef } from '../context';
import { addMemberSheet, loadHousehold, memberActions, premades, saveHousehold, usePremade } from '../tools';
import { Binder, hint, initials, issueList, nextId, noteBox, section, smallButton, textField } from '../widgets';

const FUNDS_NOTES: Record<StartMode, string> = {
  create: 'Your household moves into the furnished starter house with the standard starting funds. Furniture, groceries and bills are paid from them; the balance is always shown in the top bar.',
  sandbox: 'Build Sandbox: building and furniture are free (clearly marked in the game). Everyday costs such as groceries still use the household funds.',
  guided: 'Guided Start: a manageable starting balance and a short tutorial.',
};

export const householdStep: StepDef = {
  key: (ctx) => `${ctx.session.members.length}|${ctx.session.members.map((m) => `${m.firstName}/${m.lastName}`).join(',')}`,
  build(ctx) {
    const s = () => ctx.session;
    const b = new Binder();
    const n = s().members.length;

    const name = b.add(textField({
      label: 'Household name', max: HOUSEHOLD_NAME_MAX_LENGTH, value: () => s().draft.name,
      onInput: (v) => ctx.report(s().setHouseholdName(v)), onCommit: () => s().endEdit(),
      hint: 'Shown on saves and in the game. Empty uses the first last name.',
    }));

    // ---- members
    const list = h('ul', { class: 'cr-member-list', role: 'list' });
    const rows = s().members.map((m, i) => {
      const img = h('span', { class: 'cr-mini-portrait' });
      const editBtn = h('button', { type: 'button', class: 'cr-member-row-main', ariaLabel: `Edit ${memberName(m, i)}` },
        img, h('span', { class: 'cr-member-row-text' }, h('span', { class: 'cr-member-row-name', text: memberName(m, i) }), h('span', { class: 'cr-member-row-sub' })));
      editBtn.addEventListener('click', () => ctx.goTo('identity', i));
      const up = button({ icon: 'up', iconOnly: true, label: `Move ${memberName(m, i)} earlier`, onClick: () => ctx.report(s().moveMember(i, i - 1)), disabled: i === 0 });
      const down = button({ icon: 'down', iconOnly: true, label: `Move ${memberName(m, i)} later`, onClick: () => ctx.report(s().moveMember(i, i + 1)), disabled: i >= n - 1 });
      const more = button({ icon: 'menu', iconOnly: true, label: `More for ${memberName(m, i)}`, onClick: () => memberActions(ctx, i) });
      const li = h('li', { class: 'cr-member-row' }, editBtn, h('span', { class: 'cr-member-row-actions' }, up, down, more));
      list.appendChild(li);
      return { li, img, sub: editBtn.querySelector('.cr-member-row-sub') as HTMLElement, i };
    });
    b.fn(() => {
      const v = s().validate();
      for (const r of rows) {
        const m = s().member(r.i);
        if (!m) continue;
        toggleClass(r.li, 'is-current', r.i === s().currentIndex);
        const issues = v.members[r.i]?.length ?? 0;
        setText(r.sub, `${r.i === s().currentIndex ? 'Editing now · ' : ''}${issues > 0 ? `${issues} to fix` : 'Ready'}`);
        const url = ctx.portraitOf(r.i);
        const cur = r.img.querySelector('img');
        if (url) { if (!cur || cur.getAttribute('src') !== url) r.img.replaceChildren(h('img', { attrs: { src: url, alt: '' } })); }
        else if (!cur && !r.img.textContent) r.img.textContent = initials(m.firstName, m.lastName, r.i);
      }
    });
    const full = n >= MAX_HOUSEHOLD_MEMBERS;
    const addBtn = smallButton('Add a person', 'plus', () => addMemberSheet(ctx));
    if (full) { addBtn.disabled = true; }

    // ---- ties
    const tieRows: HTMLElement[] = [];
    const tieSyncs: Array<() => void> = [];
    for (let a = 0; a < n; a++) {
      for (let bIdx = a + 1; bIdx < n; bIdx++) {
        const nameA = memberName(s().member(a), a), nameB = memberName(s().member(bIdx), bIdx);
        const id = nextId('cr-tie');
        const select = h('select', { class: 'text-input cr-tie-select', attrs: { id } });
        for (const t of FAMILY_TIES) select.appendChild(h('option', { value: t, text: TIE_NAMES[t] }));
        const msg = h('p', { class: 'cr-tie-msg', attrs: { 'aria-live': 'polite' } });
        msg.hidden = true;
        select.addEventListener('change', () => {
          const r = s().setTie(a, bIdx, select.value as FamilyTie);
          if (!r.ok) { msg.hidden = false; msg.replaceChildren(icon('warning', 16), h('span', { text: r.reason })); ctx.report(r); select.value = s().tie(a, bIdx); }
          else { msg.hidden = true; ctx.sound('select'); }
        });
        tieSyncs.push(() => { const v = s().tie(a, bIdx); if (select.value !== v) select.value = v; });
        tieRows.push(h('div', { class: 'cr-tie-row' },
          h('label', { class: 'cr-tie-label', attrs: { for: id } }, h('strong', { text: nameB }), ` is ${nameA}'s`), select, msg));
      }
    }
    b.fn(() => { for (const fn of tieSyncs) fn(); });
    const tieIssues = issueList();
    const treeHost = h('div', { class: 'cr-tree-host' });
    let lastTree = '';
    b.fn(() => {
      tieIssues.set(s().validate().household.map((i) => i.message));
      const key = JSON.stringify([s().draft.ties, s().currentIndex]);
      if (key !== lastTree) { lastTree = key; treeHost.replaceChildren(familyTree(s().draft, s().currentIndex)); }
    });

    // ---- premades
    const pre = premades(ctx);
    const preGrid = h('div', { class: 'cr-card-grid cr-premades' }, ...pre.map((p) => {
      const btn = h('button', { type: 'button', class: 'cr-card' },
        h('span', { class: 'cr-card-head' }, h('span', { class: 'cr-card-icon' }, icon(p.draft.members.length > 1 ? 'people' : 'person', 20)), h('span', { class: 'cr-card-title', text: p.name })),
        h('span', { class: 'cr-card-meta', text: p.draft.members.map((m) => m.firstName).join(', ') }),
        h('span', { class: 'cr-card-desc', text: p.description }));
      btn.addEventListener('click', () => { void usePremade(ctx, p); });
      return btn;
    }));

    const mode = ctx.startMode ?? 'create';
    const el = h('div', { class: 'cr-step cr-step-household' },
      section('Household', name),
      section(`People (${n} of ${MAX_HOUSEHOLD_MEMBERS})`, list, h('div', { class: 'cr-actions' }, addBtn),
        full ? hint(`A household can have at most ${MAX_HOUSEHOLD_MEMBERS} people.`) : hint('Everyone is created as an adult in this version.')),
      section('Relationships',
        n > 1 ? h('div', { class: 'cr-ties' }, ...tieRows) : hint('Add another person to set how they are related.'),
        tieIssues.el,
        n > 1 ? hint('Partners and spouses: one each. A parent must be an adult; siblings cannot also be parent and child.') : null),
      section('Family tree', treeHost),
      section('Starting funds', noteBox(FUNDS_NOTES[mode], 'info')),
      ...(ctx.kind === 'creator' ? [
        section('Start from a premade household', pre.length > 0 ? preGrid : hint('No premade households are available.'), hint('Replaces everyone above. You can change anything afterwards.')),
        section('Household templates', h('div', { class: 'cr-actions' },
          smallButton('Save template', 'export', () => saveHousehold(ctx)),
          smallButton('Load template', 'import', () => { void loadHousehold(ctx); })),
        hint('Templates are JSON files with everyone, their looks, outfits, personalities and relationships.')),
      ] : []),
    );
    return { el, sync: () => b.sync() };
  },
};
