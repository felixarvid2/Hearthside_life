// Identity step: names, pronouns (presets or custom), voice and pitch, walking style, romantic interest, bio.

import { BIO_MAX_LENGTH, NAME_MAX_LENGTH, pronounPresetOf, WALK_STYLES, type PronounPreset } from '../../../characters/creator';
import { PRONOUN_MAX_LENGTH } from '../../../characters/names';
import { segmented } from '../../kit/components';
import { toggleSwitch } from '../../kit/controls';
import { h, setText } from '../../kit/dom';
import type { CreatorContext, StepDef } from '../context';
import { Binder, choiceChips, hint, section, signedFormat, sliderField, textField } from '../widgets';

type PronounChoice = PronounPreset | 'custom';
type Interest = 'any' | 'a' | 'b' | 'none';

const customShown = (ctx: CreatorContext): boolean =>
  ctx.ui.customPronouns.has(ctx.session.currentIndex) || pronounPresetOf(ctx.session.current.pronouns) === 'custom';

export const identityStep: StepDef = {
  key: (ctx) => `${ctx.session.currentIndex}|${customShown(ctx)}`,
  build(ctx) {
    const s = () => ctx.session;
    const p = () => ctx.session.current;
    const b = new Binder();
    const commit = () => s().endEdit();

    // ---- names
    const names = h('div', { class: 'cr-two' },
      b.add(textField({ label: 'First name', max: NAME_MAX_LENGTH, value: () => p().firstName, onInput: (v) => ctx.report(s().setFirstName(v)), onCommit: commit })),
      b.add(textField({ label: 'Last name', max: NAME_MAX_LENGTH, value: () => p().lastName, onInput: (v) => ctx.report(s().setLastName(v)), onCommit: commit })));

    // ---- pronouns
    const pronounSeg = segmented<PronounChoice>({
      label: 'Pronouns',
      options: [{ id: 'she', label: 'She/her' }, { id: 'he', label: 'He/him' }, { id: 'they', label: 'They/them' }, { id: 'custom', label: 'Custom' }],
      value: customShown(ctx) ? 'custom' : (pronounPresetOf(p().pronouns) as PronounChoice),
      onChange: (v) => {
        const i = s().currentIndex;
        if (v === 'custom') { ctx.ui.customPronouns.add(i); ctx.refresh(); return; }
        const wasCustom = customShown(ctx);
        ctx.ui.customPronouns.delete(i);
        ctx.report(s().setPronouns(v));
        if (wasCustom) ctx.refresh();
      },
    });
    b.fn(() => pronounSeg.set(customShown(ctx) ? 'custom' : (pronounPresetOf(p().pronouns) as PronounChoice)));
    const example = h('p', { class: 'cr-example', attrs: { 'aria-live': 'polite' } });
    b.fn(() => {
      const pr = p().pronouns;
      const name = p().firstName.trim() || 'They';
      setText(example, `Example: ${name} packed ${pr.possessive || '…'} bag. Ask ${pr.object || '…'} about the trip; ${pr.subject || '…'} loves to talk.`);
    });
    let custom: HTMLElement | null = null;
    if (customShown(ctx)) {
      const field = (label: string, key: 'subject' | 'object' | 'possessive', ph: string) => b.add(textField({
        label, max: PRONOUN_MAX_LENGTH, placeholder: ph, value: () => p().pronouns[key],
        onInput: (v) => ctx.report(s().setPronouns({ ...p().pronouns, [key]: v })), onCommit: commit,
      }));
      custom = h('div', { class: 'cr-three' }, field('Subject', 'subject', 'they'), field('Object', 'object', 'them'), field('Possessive', 'possessive', 'their'));
    }

    // ---- voice
    const voices = Object.values(ctx.api.content.voices ?? {});
    const voice = voices.length > 0
      ? b.add(choiceChips({ label: 'Voice', options: voices.map((v) => ({ id: v.id, label: v.name })), value: () => p().voice.preset, onPick: (id) => ctx.report(s().setVoicePreset(id)) }))
      : hint('No voice presets are available yet.');
    const pitch = b.add(sliderField({
      label: 'Voice pitch', min: -1, max: 1, step: 0.05, value: () => p().voice.pitch,
      format: (v) => (Math.abs(v) < 0.025 ? 'Natural' : `${v < 0 ? 'Lower' : 'Higher'} ${signedFormat(Math.abs(v))}`),
      onInput: (v) => ctx.report(s().setVoicePitch(v)), onCommit: commit,
    }));

    // ---- walk
    const walk = b.add(choiceChips({ label: 'Walking style', options: WALK_STYLES.map((w) => ({ id: w.id, label: w.name })), value: () => p().walkStyle, onPick: (id) => ctx.report(s().setWalkStyle(id)) }));

    // ---- romance
    const interestOf = (): Interest => {
      const list = p().romance.interestedIn;
      if (list.length === 0) return 'none';
      if (list.includes('any')) return 'any';
      return list[0] === 'b' ? 'b' : 'a';
    };
    const interest = segmented<Interest>({
      label: 'Romantic interest',
      options: [{ id: 'any', label: 'Anyone' }, { id: 'a', label: 'Frame A' }, { id: 'b', label: 'Frame B' }, { id: 'none', label: 'Not interested' }],
      value: interestOf(),
      onChange: (v) => ctx.report(s().setRomanceInterest(v === 'none' ? [] : [v])),
    });
    b.fn(() => interest.set(interestOf()));
    const open = toggleSwitch({ label: 'Open to romance', hint: 'When off, they are not looking for romance right now.', value: p().romance.open, onChange: (on) => ctx.report(s().setRomanceOpen(on)) });
    b.fn(() => open.set(p().romance.open));

    // ---- bio
    const bio = b.add(textField({
      label: 'Short bio', max: BIO_MAX_LENGTH, multiline: true, counter: true, placeholder: 'A sentence or two about them (optional).',
      value: () => p().bio, onInput: (v) => ctx.report(s().setBio(v)), onCommit: commit,
    }));

    const el = h('div', { class: 'cr-step cr-step-identity' },
      section('Name', names),
      section('Pronouns', pronounSeg.el, custom, custom ? hint('Custom pronouns are used everywhere the game talks about them.') : null, example),
      section('Life stage', h('p', { class: 'cr-static', text: 'Adult' }), hint('Other life stages arrive in a later update.')),
      section('Voice', voice, pitch),
      section('Walk', walk, hint('The style is saved now; matching walk animations arrive in a later update.')),
      section('Romance', interest.el, hint('Interest is based on body frame presentation only, never on pronouns.'), open.el),
      section('About', bio),
    );
    return { el, sync: () => b.sync() };
  },
};
