// Creator tools: the Tools sheet (randomize, locks, reset, copy/paste appearance, presets and templates), member
// actions and the import/export of appearance presets and household templates (versioned JSON files).

import {
  CATEGORY_NAMES, exportHouseholdTemplate, importHouseholdTemplate, LOCK_CATEGORIES, MAX_HOUSEHOLD_MEMBERS, memberName,
  premadeHouseholdList, STEP_CATEGORIES, STEP_NAMES, type LockCategory, type PremadeHousehold,
} from '../../characters/creator';
import { button, confirmDialog, modal } from '../kit/components';
import { toggleSwitch } from '../kit/controls';
import { h } from '../kit/dom';
import type { CreatorContext } from './context';
import { actionSheet, downloadText, pickTextFile, reportDialog, slug } from './widgets';

const LOCK_HINTS: Record<LockCategory, string> = {
  identity: 'Names, pronouns, voice, walk, romance and bio.',
  face: 'Skin, face shape, eyes, brows and makeup.',
  body: 'Frame and body shape.',
  hair: 'Hairstyle, colours and facial hair.',
  clothing: 'Every outfit.',
  personality: 'Traits, aspiration, likes, dislikes and job.',
};

// ---------------------------------------------------------------------------------------------
// Appearance presets and household templates
// ---------------------------------------------------------------------------------------------

export function saveAppearance(ctx: CreatorContext): void {
  const s = ctx.session;
  const json = s.exportMemberAppearance(s.currentIndex, { includeOutfits: true });
  if (!json) { ctx.status('Nobody is selected.', 'warning'); return; }
  const name = memberName(s.current, s.currentIndex);
  downloadText(`${slug(name, 'person')}-appearance.json`, json);
  ctx.status(`Saved ${name}'s appearance preset as a file.`, 'success');
}

export async function loadAppearance(ctx: CreatorContext): Promise<void> {
  const file = await pickTextFile();
  if (!file) return;
  if (!file.text) { ctx.status('That file is empty or too large.', 'warning'); return; }
  const s = ctx.session;
  const who = memberName(s.current, s.currentIndex);
  const r = s.importMemberAppearance(file.text, { outfits: ctx.ui.pasteOutfits });
  if (!r.ok) { ctx.sound('error'); ctx.status(`Could not load ${file.name}: ${r.reason}`, 'warning'); return; }
  ctx.sound('confirm');
  if (r.substitutions.length > 0) {
    await reportDialog({
      title: 'Appearance loaded with changes',
      intro: `${file.name} was applied to ${who}. Some parts are not available in this game, so they were replaced. Undo restores the previous look.`,
      lists: [{ title: 'Replaced', items: r.substitutions }],
    });
  } else ctx.status(`Applied ${file.name} to ${who}. Undo restores the previous look.`, 'success');
}

export function saveHousehold(ctx: CreatorContext): void {
  const d = ctx.session.finalDraft();
  downloadText(`${slug(d.name, 'household')}-household.json`, exportHouseholdTemplate(d));
  ctx.status(`Saved the ${d.name} household template as a file.`, 'success');
}

export async function loadHousehold(ctx: CreatorContext): Promise<void> {
  const file = await pickTextFile();
  if (!file) return;
  if (!file.text) { ctx.status('That file is empty or too large.', 'warning'); return; }
  const r = importHouseholdTemplate(file.text, ctx.api.content);
  if (!r.ok) { ctx.sound('error'); ctx.status(`Could not load ${file.name}: ${r.error}`, 'warning'); return; }
  const ok = await confirmDialog({
    title: 'Load household template?',
    text: `${r.draft.name} (${r.draft.members.length} ${r.draft.members.length === 1 ? 'person' : 'people'}) will replace everyone in the creator. Undo history starts over.`,
    confirm: 'Load template',
  });
  if (!ok) return;
  ctx.replaceDraft(r.draft, `Loaded the ${r.draft.name} household.`);
  if (r.substitutions.length > 0 || r.issues.length > 0) {
    await reportDialog({
      title: 'Template loaded',
      intro: r.substitutions.length > 0 ? 'Some parts are not available in this game and were replaced.' : 'The household was loaded. A few things still need attention before moving in.',
      lists: [{ title: 'Replaced', items: r.substitutions }, { title: 'Still to fix', items: r.issues }],
    });
  }
}

export async function usePremade(ctx: CreatorContext, p: PremadeHousehold): Promise<void> {
  const ok = await confirmDialog({
    title: `Start from the ${p.name} household?`,
    text: `${p.draft.members.map((m) => m.firstName).join(' and ')} will replace everyone in the creator. You can still change anything. Undo history starts over.`,
    confirm: 'Use this household',
  });
  if (ok) ctx.replaceDraft(p.draft, `Started from the ${p.name} household.`);
}

/** Premade households offered as starting points (the guided-start single included). */
export function premades(ctx: CreatorContext): PremadeHousehold[] {
  try { return premadeHouseholdList(ctx.api.content); } catch (err) { console.warn('[creator] premade households unavailable', err); return []; }
}

// ---------------------------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------------------------

export function addMemberSheet(ctx: CreatorContext): void {
  const s = ctx.session;
  const full = s.members.length >= MAX_HOUSEHOLD_MEMBERS;
  const reason = `A household can have at most ${MAX_HOUSEHOLD_MEMBERS} people.`;
  actionSheet({
    title: 'Add a person',
    intro: `${s.members.length} of ${MAX_HOUSEHOLD_MEMBERS} people. New people are adults and share the household's last name.`,
    actions: [
      { label: 'Random person', icon: 'dice', detail: 'A complete random adult you can change.', disabled: full, reason, run: () => { if (ctx.report(s.addMember())) ctx.status('Added a random person.', 'success'); } },
      { label: 'Blank person', icon: 'person', detail: 'Plain defaults to build from scratch.', disabled: full, reason, run: () => { if (ctx.report(s.addMember({ blank: true }))) ctx.status('Added a blank person.', 'success'); } },
      { label: `Duplicate ${memberName(s.current, s.currentIndex)}`, icon: 'duplicate', detail: 'Same look and personality, new first name.', disabled: full, reason, run: () => { if (ctx.report(s.duplicateMember())) ctx.status('Duplicated.', 'success'); } },
    ],
  });
}

export function removeMember(ctx: CreatorContext, index: number): void {
  const s = ctx.session;
  if (s.members.length <= 1) { ctx.status('A household needs at least one person.', 'warning'); return; }
  const name = memberName(s.member(index), index);
  void confirmDialog({ title: `Remove ${name}?`, text: `${name} and their relationships leave the household. Undo brings them back.`, confirm: 'Remove', danger: true })
    .then((ok) => { if (ok && ctx.report(s.removeMember(index))) ctx.status(`${name} was removed.`, 'info'); });
}

export function memberActions(ctx: CreatorContext, index: number): void {
  const s = ctx.session;
  const name = memberName(s.member(index), index);
  const n = s.members.length;
  const full = n >= MAX_HOUSEHOLD_MEMBERS;
  actionSheet({
    title: name,
    actions: [
      { label: 'Edit identity', icon: 'id', run: () => ctx.goTo('identity', index) },
      { label: 'Move earlier', icon: 'back', disabled: index === 0, reason: 'Already first.', run: () => ctx.report(s.moveMember(index, index - 1)) },
      { label: 'Move later', icon: 'next', disabled: index >= n - 1, reason: 'Already last.', run: () => ctx.report(s.moveMember(index, index + 1)) },
      { label: 'Duplicate', icon: 'duplicate', disabled: full, reason: `A household can have at most ${MAX_HOUSEHOLD_MEMBERS} people.`, run: () => ctx.report(s.duplicateMember(index)) },
      { label: 'Copy appearance', icon: 'copy', detail: 'Then select someone else and paste.', run: () => { if (ctx.report(s.copyAppearance(index))) ctx.status(`Copied ${name}'s appearance. Select someone else and choose Paste in Tools.`, 'success'); } },
      { label: 'Remove from household', icon: 'trash', danger: true, disabled: n <= 1, reason: 'A household needs at least one person.', run: () => removeMember(ctx, index) },
    ],
  });
}

// ---------------------------------------------------------------------------------------------
// Tools sheet
// ---------------------------------------------------------------------------------------------

export function openTools(ctx: CreatorContext): void {
  const s = ctx.session;
  const m = modal({ title: 'Creator tools', wide: true });
  m.el.classList.add('cr-modal', 'cr-tools');
  const who = memberName(s.current, s.currentIndex);
  const close = (fn: () => void) => () => { m.close(); fn(); };
  const row = (...els: HTMLElement[]) => h('div', { class: 'cr-actions' }, ...els);
  const btn = (label: string, iconName: string, fn: () => void, disabled = false, title?: string) => {
    const b = button({ label, icon: iconName, onClick: fn, disabled, ...(title ? { title } : {}) });
    b.classList.add('cr-btn');
    return b;
  };

  const stepCats = STEP_CATEGORIES[s.step];
  const randomize = h('section', { class: 'cr-sec' }, h('h3', { class: 'cr-sec-title', text: `Randomize ${who}` }),
    row(
      btn(`Randomize ${STEP_NAMES[s.step]}`, 'dice', close(() => ctx.report(s.randomizeStep())), stepCats.length === 0, stepCats.length === 0 ? 'Nothing to randomize on this step.' : undefined),
      btn('Randomize everything', 'dice', close(() => ctx.report(s.randomizeAll()))),
    ),
    h('p', { class: 'cr-hint', text: 'Locked categories are kept. Undo reverses any randomizing.' }));

  const locks = h('section', { class: 'cr-sec' }, h('h3', { class: 'cr-sec-title', text: 'Locks' }),
    ...LOCK_CATEGORIES.map((c) => toggleSwitch({
      label: `Lock ${CATEGORY_NAMES[c].toLowerCase()}`, hint: LOCK_HINTS[c], value: s.isLocked(c),
      onChange: (on) => { s.setLocked(c, on); ctx.sound('toggle'); },
    }).el),
    h('p', { class: 'cr-hint', text: 'Locks apply to whoever is selected and only affect randomizing.' }));

  const reset = h('section', { class: 'cr-sec' }, h('h3', { class: 'cr-sec-title', text: `Reset ${who}` }),
    row(...LOCK_CATEGORIES.map((c) => btn(`Reset ${CATEGORY_NAMES[c].toLowerCase()}`, 'undo', close(() => { if (ctx.report(s.resetCategory(c))) ctx.status(`${CATEGORY_NAMES[c]} reset. Undo brings it back.`, 'info'); })))),
    h('p', { class: 'cr-hint', text: 'Resetting identity keeps the names and pronouns.' }));

  const outfitsSwitch = toggleSwitch({ label: 'Include outfits', hint: 'When pasting or loading an appearance.', value: ctx.ui.pasteOutfits, onChange: (on) => { ctx.ui.pasteOutfits = on; } });
  const appearance = h('section', { class: 'cr-sec' }, h('h3', { class: 'cr-sec-title', text: 'Appearance' }),
    row(
      btn(`Copy ${who}`, 'copy', close(() => { if (ctx.report(s.copyAppearance())) ctx.status(`Copied ${who}'s appearance. Select someone else and paste.`, 'success'); })),
      btn(`Paste onto ${who}`, 'paste', close(() => { if (ctx.report(s.pasteAppearance({ outfits: ctx.ui.pasteOutfits }))) ctx.status(`Pasted onto ${who}. Undo restores the previous look.`, 'success'); }),
        !s.canPasteAppearance(), s.canPasteAppearance() ? undefined : 'Copy an appearance first.'),
    ),
    outfitsSwitch.el,
    row(
      btn('Save appearance preset', 'export', close(() => saveAppearance(ctx))),
      btn('Load appearance preset', 'import', close(() => { void loadAppearance(ctx); })),
    ),
    row(btn('Face and body presets', 'face', close(() => { ctx.ui.faceBodySection = 'face'; ctx.goTo('faceBody'); }))),
    h('p', { class: 'cr-hint', text: 'Presets are JSON files you can keep or share. Missing hairstyles or garments are replaced and listed.' }));

  const sections: HTMLElement[] = [randomize, locks, reset, appearance];
  if (ctx.kind === 'creator') {
    sections.push(h('section', { class: 'cr-sec' }, h('h3', { class: 'cr-sec-title', text: 'Household' }),
      row(
        btn('Save household template', 'export', close(() => saveHousehold(ctx))),
        btn('Load household template', 'import', close(() => { void loadHousehold(ctx); })),
      )));
  }
  m.body.append(...sections);
  m.footer.appendChild(button({ label: 'Done', variant: 'primary', onClick: () => m.close() }));
}
