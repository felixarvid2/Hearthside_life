// Hair step: style cards (name + length/texture tags) with a length filter, colour, highlights, facial hair.

import type { HairDef } from '../../../content/types';
import { toggleSwitch } from '../../kit/controls';
import { h } from '../../kit/dom';
import type { StepDef } from '../context';
import { modularFacialHairSection, modularHairSection, lookOf } from './modularParts';
import { Binder, card, choiceChips, colorField, hint, section, shade, smallButton } from '../widgets';

const LENGTHS: ReadonlyArray<{ id: HairDef['length']; label: string }> = [
  { id: 'shaved', label: 'Shaved' }, { id: 'short', label: 'Short' }, { id: 'medium', label: 'Medium' }, { id: 'long', label: 'Long' },
];
const TEXTURE_NAMES: Record<HairDef['texture'], string> = {
  straight: 'Straight', wavy: 'Wavy', curly: 'Curly', coily: 'Coily', braided: 'Braided', tied: 'Tied', shaved: 'Shaved',
};
const LENGTH_NAMES: Record<HairDef['length'], string> = { shaved: 'Shaved', short: 'Short', medium: 'Medium', long: 'Long' };

export const hairStep: StepDef = {
  key: (ctx) => `${ctx.session.currentIndex}|${ctx.ui.hairLength}|${ctx.session.current.appearance.hair.highlight !== null}|${ctx.modular() ? `m:${lookOf(ctx.session).bodyId}` : ''}`,
  build(ctx) {
    const s = () => ctx.session;
    const hair = () => ctx.session.current.appearance.hair;
    const content = ctx.api.content;
    const b = new Binder();
    const commit = () => s().endEdit();

    const modular = ctx.modular();
    if (modular) {
      // Quaternius style: the manifest's hairstyles and facial hair (thumbnails); the colour is the shared hair colour. Highlights are classic-only.
      const color = b.add(colorField({
        label: 'Hair colour', swatches: content.hairColors ?? [], value: () => hair().color,
        onPick: (c) => ctx.report(s().setHairColor(c)), onCommit: commit,
      }));
      const el = h('div', { class: 'cr-step cr-step-hair cr-step-modular' },
        modularHairSection(ctx, modular, b),
        modularFacialHairSection(ctx, modular, b),
        section('Colour', color, hint('Highlights belong to the classic style and do not show here. Facial hair takes the hair colour.')),
        h('div', { class: 'cr-actions' }, smallButton('Reset hair', 'undo', () => ctx.report(s().resetCategory('hair')))),
      );
      return { el, sync: () => b.sync() };
    }

    const styles = Object.values(content.hair ?? {}).filter((x) => x.status === 'ready');
    const lengths = LENGTHS.filter((l) => styles.some((x) => x.length === l.id));
    const filter = lengths.length > 1 ? b.add(choiceChips<'all' | HairDef['length']>({
      label: 'Show lengths', options: [{ id: 'all', label: 'All' }, ...lengths],
      value: () => ctx.ui.hairLength,
      onPick: (id) => { if (id !== ctx.ui.hairLength) { ctx.ui.hairLength = id; ctx.refresh(); } },
    })) : null;
    const shown = styles.filter((x) => ctx.ui.hairLength === 'all' || x.length === ctx.ui.hairLength);
    const grid = h('div', { class: 'cr-card-grid cr-hair-grid', role: 'radiogroup', ariaLabel: 'Hairstyles' });
    const cards = shown.map((def) => {
      const c = card({
        title: def.name,
        meta: def.length === def.texture ? LENGTH_NAMES[def.length] : `${LENGTH_NAMES[def.length]} · ${TEXTURE_NAMES[def.texture]}`,
        onClick: () => ctx.report(s().setHairStyle(def.id)),
      });
      c.el.title = def.description;
      grid.appendChild(c.el);
      return { def, c };
    });
    b.fn(() => { for (const { def, c } of cards) c.set({ selected: hair().styleId === def.id }); });
    const current = h('p', { class: 'cr-static' });
    b.fn(() => {
      const d = content.hair?.[hair().styleId];
      current.textContent = d ? `Wearing: ${d.name}. ${d.description}` : 'No hairstyle chosen.';
    });

    const color = b.add(colorField({
      label: 'Hair colour', swatches: content.hairColors ?? [], value: () => hair().color,
      onPick: (c) => ctx.report(s().setHairColor(c)), onCommit: commit,
    }));

    const hasHighlight = hair().highlight !== null;
    const highlight = toggleSwitch({
      label: 'Highlights', hint: 'Lighter or contrasting streaks through the hair.', value: hasHighlight,
      onChange: (on) => { ctx.report(s().setHairHighlight(on ? shade(hair().color, 0.35) : null)); commit(); ctx.refresh(); },
    });
    b.fn(() => highlight.set(hair().highlight !== null));
    const highlightColor = hasHighlight ? b.add(colorField({
      label: 'Highlight colour', swatches: content.hairColors ?? [], value: () => hair().highlight ?? hair().color,
      onPick: (c) => ctx.report(s().setHairHighlight(c)), onCommit: commit,
    })) : null;

    const facial = Object.values(content.facialHair ?? {}).filter((x) => x.status === 'ready');
    const facialChips = facial.length > 0 ? b.add(choiceChips<string>({
      label: 'Facial hair', hideLabel: true,
      options: [{ id: '__none', label: 'None' }, ...facial.map((f) => ({ id: f.id, label: f.name, title: f.description }))],
      value: () => hair().facialHairId ?? '__none',
      onPick: (id) => ctx.report(s().setFacialHair(id === '__none' ? null : id)),
    })) : hint('No facial hair styles are available yet.');

    const el = h('div', { class: 'cr-step cr-step-hair' },
      section('Hairstyle', filter, styles.length > 0 ? grid : hint('No hairstyles are available yet.'), current),
      section('Colour', color, highlight.el, highlightColor),
      section('Facial hair', facialChips, hint('Every style is available for every frame.')),
      h('div', { class: 'cr-actions' }, smallButton('Reset hair', 'undo', () => ctx.report(s().resetCategory('hair')))),
    );
    return { el, sync: () => b.sync() };
  },
};
