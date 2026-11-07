// Clothing step (also the whole wardrobe editor): outfit category tabs, several outfits per category, a garment
// picker per layer filtered to the category, colours, patterns, pattern colour, accessories, automatic conflict
// notes and inline validation for the selected category.

import { LAYER_NAMES, MAX_OUTFITS_PER_CATEGORY, OUTFIT_CATEGORY_NAMES, SHOES_OPTIONAL } from '../../../characters/outfits';
import type { GarmentDef, Swatch } from '../../../content/types';
import { OUTFIT_CATEGORIES, type GarmentLayer, type Outfit, type OutfitCategory } from '../../../core/types';
import { promptDialog, tabs } from '../../kit/components';
import { h, setText, toggleClass } from '../../kit/dom';
import { icon } from '../../kit/icons';
import type { CreatorContext, StepDef } from '../context';
import { accessoryIconSvg, garmentIconSvg } from '../garmentIcon';
import { lookOf, modularClothingSections } from './modularParts';
import { outfitFor as modularOutfitFor } from '../../../characters/modular/look';
import { Binder, choiceChips, colorField, hint, issueList, noteBox, section, smallButton } from '../widgets';

const LAYERS: readonly GarmentLayer[] = ['top', 'bottom', 'full', 'outer', 'shoes'];

/** Fabric colours offered for every garment (plus its own default colour and a custom colour). */
export const FABRIC_COLORS: Swatch[] = [
  { id: 'fab-white', name: 'White', color: '#f2f0ea' },
  { id: 'fab-cream', name: 'Cream', color: '#e9e0cc' },
  { id: 'fab-sand', name: 'Sand', color: '#c8b28a' },
  { id: 'fab-camel', name: 'Camel', color: '#b8865a' },
  { id: 'fab-brown', name: 'Brown', color: '#6b4630' },
  { id: 'fab-grey', name: 'Grey', color: '#8c8c90' },
  { id: 'fab-charcoal', name: 'Charcoal', color: '#3a3b44' },
  { id: 'fab-black', name: 'Black', color: '#1f1d1c' },
  { id: 'fab-navy', name: 'Navy', color: '#2b3a5c' },
  { id: 'fab-denim', name: 'Denim', color: '#3f5a85' },
  { id: 'fab-sky', name: 'Sky', color: '#9fb7d9' },
  { id: 'fab-teal', name: 'Teal', color: '#2f8f83' },
  { id: 'fab-sage', name: 'Sage', color: '#8fa889' },
  { id: 'fab-olive', name: 'Olive', color: '#5d6b4a' },
  { id: 'fab-mustard', name: 'Mustard', color: '#d6a83a' },
  { id: 'fab-terracotta', name: 'Terracotta', color: '#d8694e' },
  { id: 'fab-red', name: 'Red', color: '#b83a3a' },
  { id: 'fab-burgundy', name: 'Burgundy', color: '#7b3f4f' },
  { id: 'fab-rose', name: 'Rose', color: '#e6a3b7' },
  { id: 'fab-lavender', name: 'Lavender', color: '#b6a2d9' },
];

const catName = (c: OutfitCategory) => OUTFIT_CATEGORY_NAMES[c];

/** Clothing issues of the current member that belong to a category (by the message prefix). */
export function categoryOfIssue(message: string): { category: OutfitCategory; index: number } | null {
  for (const c of OUTFIT_CATEGORIES) {
    const name = catName(c);
    if (message.startsWith(`${name}:`)) return { category: c, index: 0 };
    const m = new RegExp(`^${name} (\\d+):`).exec(message);
    if (m) return { category: c, index: Math.max(0, Number(m[1]) - 1) };
  }
  return null;
}

function clothingIssues(ctx: CreatorContext): string[] {
  return ctx.session.validate().members[ctx.session.currentIndex]?.filter((i) => i.step === 'clothing').map((i) => i.message) ?? [];
}

const outfitIndex = (ctx: CreatorContext, cat: OutfitCategory): number => {
  const n = ctx.session.current.outfits.outfits[cat]?.length ?? 0;
  const i = Math.max(0, Math.min(n - 1, ctx.ui.outfitIndex[cat] ?? 0));
  ctx.ui.outfitIndex[cat] = i;
  return i;
};

function outfitAt(ctx: CreatorContext): Outfit | undefined {
  const cat = ctx.ui.clothingCategory;
  return ctx.session.current.outfits.outfits[cat]?.[outfitIndex(ctx, cat)];
}

export const clothingStep: StepDef = {
  key(ctx) {
    const cat = ctx.ui.clothingCategory;
    if (ctx.modular()) {
      const look = lookOf(ctx.session);
      return `m|${ctx.session.currentIndex}|${cat}|${look.bodyId}|${JSON.stringify(modularOutfitFor(look, cat))}`;
    }
    const list = ctx.session.current.outfits.outfits[cat] ?? [];
    const o = outfitAt(ctx);
    const layers = LAYERS.map((l) => { const c = o?.layers[l]; return c ? `${c.garmentId}:${c.pattern === 'solid' ? 's' : 'p'}` : '-'; }).join(',');
    const acc = o?.accessories.map((x) => x.accessoryId).join(',') ?? '';
    return `${ctx.session.currentIndex}|${cat}|${outfitIndex(ctx, cat)}|${list.length}|${layers}|${acc}`;
  },
  enter(ctx) { ctx.preview.setCategory(ctx.ui.clothingCategory, outfitIndex(ctx, ctx.ui.clothingCategory)); },
  leave(ctx) { ctx.preview.setCategory(ctx.preview.category, null); },
  build(ctx) {
    const s = () => ctx.session;
    const p = () => ctx.session.current;
    const content = ctx.api.content;
    const b = new Binder();
    const commit = () => s().endEdit();
    const cat = ctx.ui.clothingCategory;
    const idx = outfitIndex(ctx, cat);
    ctx.preview.setCategory(cat, idx);
    const outfit = () => p().outfits.outfits[cat]?.[idx];
    const worn = () => { const cur = p().outfits.current; return cur.category === cat && cur.index === idx; };
    const wornLabel = ctx.kind === 'wardrobe' ? 'Wearing now' : 'Worn when moving in';

    // ---- category tabs with issue badges
    const catTabs = tabs({
      label: 'Outfit categories',
      items: OUTFIT_CATEGORIES.map((c) => ({ id: c, label: catName(c) })),
      value: cat,
      onChange: (id) => {
        const next = id as OutfitCategory;
        if (next === ctx.ui.clothingCategory) return;
        ctx.ui.clothingCategory = next;
        ctx.refresh();
      },
    });
    catTabs.el.classList.add('cr-subtabs');
    b.fn(() => {
      const issues = clothingIssues(ctx);
      for (const c of OUTFIT_CATEGORIES) {
        const btn = catTabs.el.querySelector<HTMLButtonElement>(`[data-id="${c}"]`);
        if (!btn) continue;
        const n = issues.filter((m) => categoryOfIssue(m)?.category === c).length;
        let badge = btn.querySelector<HTMLElement>('.badge');
        if (n > 0 && !badge) { badge = h('span', { class: 'badge' }); btn.appendChild(badge); }
        if (badge) { if (n > 0) setText(badge, String(n)); else badge.remove(); }
        btn.setAttribute('aria-label', n > 0 ? `${catName(c)}, ${n} issue${n > 1 ? 's' : ''}` : catName(c));
      }
    });

    // ---- Quaternius style: one modular outfit per category (slots with thumbnails, colours, presets)
    const modular = ctx.modular();
    if (modular) {
      const wearM = smallButton('Wear this', 'check', () => { if (ctx.report(s().setWornOutfit(cat, 0))) ctx.status(`${catName(cat)}: ${wornLabel.toLowerCase()}.`, 'success'); });
      b.fn(() => {
        const isWorn = p().outfits.current.category === cat;
        wearM.disabled = isWorn;
        setText(wearM.querySelector('.btn-label') as HTMLElement, isWorn ? wornLabel : (ctx.kind === 'wardrobe' ? 'Wear now' : 'Wear when moving in'));
      });
      const elM = h('div', { class: 'cr-step cr-step-clothing cr-step-modular' },
        catTabs.el,
        ...modularClothingSections(ctx, modular, b, cat),
        h('div', { class: 'cr-actions' }, wearM));
      return { el: elM, sync: () => b.sync() };
    }

    // ---- outfits in the category
    const list = p().outfits.outfits[cat] ?? [];
    const outfitRow = h('div', { class: 'chips cr-chips cr-outfit-chips', role: 'radiogroup', ariaLabel: `${catName(cat)} outfits` });
    const outfitBtns = list.map((_, i) => {
      const btn = h('button', { type: 'button', class: 'chip cr-chip', role: 'radio' },
        h('span', { class: 'cr-check' }, icon('check', 16)), h('span', { class: 'cr-outfit-name' }), h('span', { class: 'cr-worn-tag', text: 'worn' }));
      btn.addEventListener('click', () => { if (i !== idx) { ctx.ui.outfitIndex[cat] = i; ctx.refresh(); } });
      outfitRow.appendChild(btn);
      return btn;
    });
    b.fn(() => {
      const outs = p().outfits.outfits[cat] ?? [];
      const cur = p().outfits.current;
      outfitBtns.forEach((btn, i) => {
        const o = outs[i];
        setText(btn.querySelector('.cr-outfit-name') as HTMLElement, o?.name ?? `Outfit ${i + 1}`);
        const isWorn = cur.category === cat && cur.index === i;
        (btn.querySelector('.cr-worn-tag') as HTMLElement).hidden = !isWorn;
        toggleClass(btn, 'is-selected', i === idx);
        btn.setAttribute('aria-checked', String(i === idx));
      });
    });
    const addAt = (copy: boolean) => {
      const before = ctx.ui.outfitIndex[cat];
      ctx.ui.outfitIndex[cat] = list.length;
      const r = s().addOutfit(cat, copy ? { copyOf: idx } : {});
      if (!r.ok) { ctx.ui.outfitIndex[cat] = before; ctx.report(r); }
      else ctx.status(copy ? 'Outfit duplicated.' : 'New outfit added.', 'success');
    };
    const full = list.length >= MAX_OUTFITS_PER_CATEGORY;
    const addBtn = smallButton('New outfit', 'plus', () => addAt(false));
    const dupBtn = smallButton('Duplicate', 'duplicate', () => addAt(true));
    if (full) { addBtn.disabled = true; dupBtn.disabled = true; }
    const removeBtn = smallButton('Remove', 'trash', () => {
      const r = s().removeOutfit(cat, idx);
      if (ctx.report(r)) ctx.status('Outfit removed. Undo brings it back.', 'info');
    });
    if (list.length <= 1) { removeBtn.disabled = true; removeBtn.title = 'Every category needs at least one outfit.'; }
    const wearBtn = smallButton('Wear this', 'check', () => { if (ctx.report(s().setWornOutfit(cat, idx))) ctx.status(`${outfit()?.name ?? 'Outfit'}: ${wornLabel.toLowerCase()}.`, 'success'); });
    b.fn(() => { wearBtn.disabled = worn(); setText(wearBtn.querySelector('.btn-label') as HTMLElement, worn() ? wornLabel : (ctx.kind === 'wardrobe' ? 'Wear now' : 'Wear when moving in')); });
    const outfitActions = h('div', { class: 'cr-actions' },
      addBtn, dupBtn,
      smallButton('Rename', 'tag', () => {
        void promptDialog({ title: 'Rename outfit', label: 'Outfit name', value: outfit()?.name ?? '', confirm: 'Rename', maxLength: 32 }).then((name) => {
          if (name !== null) ctx.report(s().renameOutfit(cat, idx, name));
        });
      }),
      smallButton('Randomize', 'dice', () => ctx.report(s().randomizeOutfit(cat, idx))),
      removeBtn, wearBtn);

    const issues = issueList();
    b.fn(() => {
      const name = catName(cat);
      issues.set(clothingIssues(ctx).filter((m) => categoryOfIssue(m)?.category === cat || !categoryOfIssue(m)).map((m) => {
        if (m.startsWith(`${name}: `)) return m.slice(name.length + 2);
        const r = new RegExp(`^${name} (\\d+): `).exec(m);
        return r ? `Outfit ${r[1]}: ${m.slice(r[0].length)}` : m;
      }));
    });

    // ---- layers
    const layerSections = outfit() ? LAYERS.map((layer) => layerSection(ctx, b, cat, idx, layer)) : [hint('This outfit does not exist.')];

    // ---- accessories
    const accDefs = Object.values(content.accessories ?? {}).filter((a) => a.status === 'ready');
    let accSection: HTMLElement | null = null;
    if (accDefs.length > 0) {
      const row = h('div', { class: 'chips cr-chips', role: 'group', ariaLabel: 'Accessories' });
      const accBtns = accDefs.map((def) => {
        const btn = h('button', { type: 'button', class: 'chip cr-chip', title: def.description }, h('span', { class: 'cr-check' }, icon('check', 16)),
          h('span', { class: 'cr-glyph', html: accessoryIconSvg(def) }), h('span', { text: def.name }));
        btn.addEventListener('click', () => {
          const has = outfit()?.accessories.some((x) => x.accessoryId === def.id);
          ctx.report(has ? s().removeAccessory(cat, idx, def.id) : s().addAccessory(cat, idx, def.id));
        });
        row.appendChild(btn);
        return { def, btn };
      });
      b.fn(() => {
        const ids = outfit()?.accessories.map((x) => x.accessoryId) ?? [];
        for (const { def, btn } of accBtns) { const on = ids.includes(def.id); toggleClass(btn, 'is-selected', on); btn.setAttribute('aria-pressed', String(on)); }
      });
      const colors = (outfit()?.accessories ?? []).map((acc) => {
        const def = content.accessories[acc.accessoryId];
        return b.add(colorField({
          label: `${def?.name ?? acc.accessoryId} colour`,
          swatches: def ? [{ id: `acc-default-${def.id}`, name: 'Original', color: def.defaultColor }, ...FABRIC_COLORS] : FABRIC_COLORS,
          value: () => outfit()?.accessories.find((x) => x.accessoryId === acc.accessoryId)?.color ?? '#000000',
          onPick: (c) => ctx.report(s().setAccessoryColor(cat, idx, acc.accessoryId, c)), onCommit: commit,
        }));
      });
      accSection = section('Accessories', row, ...colors, hint('One item of each kind (glasses, hat, necklace, watch...) at a time.'));
    }

    const el = h('div', { class: 'cr-step cr-step-clothing' },
      catTabs.el,
      section(`${catName(cat)} outfits`, outfitRow, outfitActions, full ? hint(`At most ${MAX_OUTFITS_PER_CATEGORY} outfits per category.`) : null),
      issues.el,
      ...layerSections,
      accSection);
    return { el, sync: () => b.sync() };
  },
};

function garmentColors(def: GarmentDef): Swatch[] {
  const has = FABRIC_COLORS.some((f) => f.color.toLowerCase() === def.defaultColor.toLowerCase());
  return has ? FABRIC_COLORS : [{ id: `default-${def.id}`, name: 'Original', color: def.defaultColor }, ...FABRIC_COLORS];
}

function layerSection(ctx: CreatorContext, b: Binder, cat: OutfitCategory, idx: number, layer: GarmentLayer): HTMLElement {
  const s = () => ctx.session;
  const content = ctx.api.content;
  const commit = () => s().endEdit();
  const outfit = () => s().current.outfits.outfits[cat]?.[idx];
  const choice = () => outfit()?.layers[layer];
  const options = s().garmentOptions(cat, layer);
  const cur = choice();
  const curDef = cur ? content.garments[cur.garmentId] : undefined;

  const title = h('h3', { class: 'cr-sec-title' });
  b.fn(() => {
    const c = choice();
    const d = c ? content.garments[c.garmentId] : undefined;
    setText(title, `${LAYER_NAMES[layer]}: ${d ? d.name : c ? c.garmentId : 'none'}`);
  });

  const notes: HTMLElement[] = [];
  if (layer === 'full') notes.push(hint('A full outfit replaces the top and bottom.'));
  if (layer === 'outer') notes.push(hint('Worn over the top or full outfit.'));
  if (layer === 'shoes' && SHOES_OPTIONAL.includes(cat)) notes.push(hint(`Shoes are optional for ${catName(cat)}.`));
  const fullDef = (layer === 'top' || layer === 'bottom') && outfit()?.layers.full ? content.garments[outfit()!.layers.full!.garmentId] : undefined;
  if (fullDef) notes.push(noteBox(`Covered by the full outfit (${fullDef.name}). Choosing a ${LAYER_NAMES[layer].toLowerCase()} replaces it.`));

  const opts: Array<{ id: string; label: string; title?: string }> = [{ id: '__none', label: 'None' }, ...options.map((g) => ({ id: g.id, label: g.name, title: g.description, glyph: garmentIconSvg(g) }))];
  if (cur && !options.some((g) => g.id === cur.garmentId)) opts.push({ id: cur.garmentId, label: `${curDef?.name ?? cur.garmentId} (not for ${catName(cat)})` });
  const picker = options.length > 0 || cur ? b.add(choiceChips<string>({
    label: `${LAYER_NAMES[layer]} garments`, hideLabel: true, options: opts,
    value: () => choice()?.garmentId ?? '__none',
    onPick: (id) => {
      const next = id === '__none' ? null : id;
      if ((choice()?.garmentId ?? null) === next) return;
      ctx.report(s().setGarment(cat, idx, layer, next));
    },
  })) : hint(`No ${LAYER_NAMES[layer].toLowerCase()} garments are tagged for ${catName(cat)} yet.`);

  const extra: Array<HTMLElement | null> = [];
  if (cur && curDef) {
    extra.push(b.add(colorField({
      label: 'Colour', swatches: garmentColors(curDef), value: () => choice()?.color ?? curDef.defaultColor,
      onPick: (c) => ctx.report(s().setGarmentColor(cat, idx, layer, c)), onCommit: commit,
    })));
    const patterns = ['solid', ...curDef.patterns.filter((x) => x !== 'solid')];
    if (patterns.length > 1) {
      extra.push(b.add(choiceChips<string>({
        label: 'Pattern',
        options: patterns.map((id) => ({ id, label: content.patterns?.[id]?.name ?? id, ...(content.patterns?.[id] ? { title: content.patterns[id]!.description } : {}) })),
        value: () => choice()?.pattern ?? 'solid',
        onPick: (id) => ctx.report(s().setGarmentPattern(cat, idx, layer, id)),
      })));
    } else extra.push(hint('This garment has no patterns.'));
    if (cur.pattern !== 'solid') {
      extra.push(b.add(colorField({
        label: 'Pattern colour', swatches: FABRIC_COLORS, value: () => choice()?.patternColor ?? '#000000',
        onPick: (c) => ctx.report(s().setGarmentPatternColor(cat, idx, layer, c)), onCommit: commit,
      })));
    }
  }
  const sec = h('section', { class: ['cr-sec', 'cr-layer'], dataset: { layer } }, title, ...notes, picker, ...extra);
  return sec;
}

