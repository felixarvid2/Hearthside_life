// Entry points of the character creator and the wardrobe editor (mounted by the UI shell, src/ui/app.ts).
//
// - mountCreator: the 7-step creator (Identity, Face & Body, Hair, Clothing, Personality, Household, Review)
//   for a new household. Move In calls opts.onDone(finalDraft); Cancel asks first, then opts.onCancel().
// - mountWardrobe: the clothing step for one existing person (from the editOutfits interaction). Save calls
//   api.updateWardrobe(personId, wardrobe) and shows its error, if any; Cancel/close calls opts.onClose().
//
// Both drive the game's live preview through api.creator.show/setView/rotate/zoom and report the free preview
// area with api.view.setInsets. Neither calls api.creator.hide(): the shell does that when it closes them.

import { CreatorSession, personToDraft } from '../../characters/creator';
import type { GameAPI } from '../../game/api';
import { button, toast } from '../kit/components';
import { h } from '../kit/dom';
import type { CreatorScreenOptions, ModeUI, WardrobeOptions } from '../modes/types';
import { CreatorScreen } from './screen';

/** The 7-step character creator with live preview. */
export function mountCreator(root: HTMLElement, api: GameAPI, opts: CreatorScreenOptions): ModeUI {
  const session = new CreatorSession(api.content);
  return new CreatorScreen(root, api, {
    kind: 'creator',
    startMode: opts.mode,
    session,
    title: opts.mode === 'sandbox' ? 'Create a household (Build Sandbox)' : 'Create a household',
    onDone: (draft) => opts.onDone(draft),
    onExit: () => opts.onCancel(),
  });
}

/** Wardrobe editor for one existing person (from the editOutfits interaction). */
export function mountWardrobe(root: HTMLElement, api: GameAPI, opts: WardrobeOptions): ModeUI {
  const person = api.state()?.people[opts.personId];
  if (!person) return missingPerson(root, opts);
  const session = new CreatorSession(api.content, { draft: { name: '', members: [personToDraft(person)], ties: [] } });
  session.setStep('clothing');
  const current = person.outfits.current;
  const screen = new CreatorScreen(root, api, {
    kind: 'wardrobe',
    startMode: null,
    session,
    title: 'Outfits',
    onSave: (s) => {
      const issues = s.validate().members[0]?.filter((i) => i.step === 'clothing') ?? [];
      if (issues.length > 0) return `Fix first: ${issues[0]!.message}`;
      let r: ReturnType<GameAPI['updateWardrobe']>;
      try { r = api.updateWardrobe(opts.personId, s.current.outfits, s.isModular() ? s.current.appearance.modular : undefined); } catch (err) { r = { ok: false, reason: err instanceof Error ? err.message : 'Something went wrong.' }; }
      if (!r.ok) return `Could not save: ${r.reason}`;
      toast(`${person.firstName}'s outfits were saved.`, 'success');
      opts.onClose();
      return null;
    },
    onExit: () => opts.onClose(),
    initialOutfit: { category: current.category, index: current.index },
  });
  return screen;
}

/** Shown when the person no longer exists (e.g. moved out between the request and opening). */
function missingPerson(root: HTMLElement, opts: WardrobeOptions): ModeUI {
  const el = h('div', { class: 'cr cr-missing' },
    h('div', { class: 'cr-missing-card', role: 'dialog', ariaLabel: 'Wardrobe' },
      h('h2', { text: 'Wardrobe' }),
      h('p', { text: 'This person is no longer in the household, so their outfits cannot be edited.' }),
      button({ label: 'Close', variant: 'primary', onClick: () => opts.onClose() })));
  root.appendChild(el);
  return { el, show() { el.hidden = false; }, hide() { el.hidden = true; }, destroy() { el.remove(); } };
}
