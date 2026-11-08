// Creator controls for modular (Quaternius) looks: body picker and morph sliders, hairstyle grid, clothing slots with
// colour swatches and outfit presets. Used by the Face & Body, Hair and Clothing steps only while
// `ctx.modular()` is set; classic looks never reach this file. Everything edits through the CreatorSession's
// setModular* methods, so undo, Cancel and the wardrobe's Cancel cover it.

import type { CreatorSession } from '../../../characters/creator';
import { facialHairFor, garmentsFor, hairFor } from '../../../characters/modular/manifest';
import { facialHairWouldReplace, hairWouldReplace, wouldReplace } from '../../../characters/modular/equip';
import { outfitFor } from '../../../characters/modular/look';
import { matchesTag, tagFilters } from '../../../characters/modular/tags';
import { ACCESSORY_SLOTS } from '../../../characters/modular/types';
import type { ColorRegionDef, GarmentDef, ModularLook, ModularManifest, ModularSlot, OutfitPresetDef } from '../../../characters/modular/types';
import type { Swatch } from '../../../content/types';
import type { OutfitCategory } from '../../../core/types';
import type { ModularInfo } from '../../../game/api';
import { h, toggleClass } from '../../kit/dom';
import { icon } from '../../kit/icons';
import type { CreatorContext } from '../context';
import { Binder, choiceChips, colorField, hint, percentFormat, section, signedFormat, sliderField } from '../widgets';
import { FABRIC_COLORS } from './clothing';

export const SLOT_TITLES: Record<ModularSlot, string> = {
  top: 'Top', outer: 'Outer', bottom: 'Bottom', full: 'One-piece', shoes: 'Shoes',
  hat: 'Hat', eyewear: 'Eyewear', earrings: 'Earrings', neck: 'Neck', wrist: 'Wrist', waist: 'Waist', bag: 'Bag',
};
/** Order of the clothing slot sections; the accessory slots follow in their own "Accessories" group. */
const SLOT_ORDER: readonly ModularSlot[] = ['top', 'outer', 'bottom', 'full', 'shoes'];
/** Chosen filter tag per slot; survives step rebuilds for the life of the session. */
const chosenTags = new WeakMap<CreatorSession, Partial<Record<ModularSlot, string>>>();

/** The current member's stored-or-derived look. Only called while the member is modular. */
export function lookOf(session: CreatorSession): ModularLook {
  return session.modularLook() as ModularLook;
}

interface ThumbCard { el: HTMLButtonElement; set(selected: boolean): void }

/** A selectable card with a thumbnail (or a placeholder), a label and an optional second line. */
function thumbCard(o: { label: string; meta?: string; thumb?: string | undefined; none?: boolean; onClick: () => void }): ThumbCard {
  const pic = o.thumb
    ? h('img', { class: 'cr-thumb-img', attrs: { src: o.thumb, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' } })
    : h('span', { class: 'cr-thumb-ph' }, o.none ? icon('close', 22) : h('span', { text: o.label.charAt(0).toUpperCase() }));
  const el = h('button', { type: 'button', class: 'cr-thumb-card', role: 'radio' },
    h('span', { class: 'cr-thumb-pic' }, pic),
    h('span', { class: 'cr-thumb-label', text: o.label }),
    o.meta ? h('span', { class: 'cr-thumb-meta', text: o.meta }) : null,
    h('span', { class: 'cr-check' }, icon('check', 16)));
  el.addEventListener('click', o.onClick);
  // a thumbnail that is missing (not generated yet) falls back to the label's initial
  const img = el.querySelector('img');
  img?.addEventListener('error', () => { img.replaceWith(h('span', { class: 'cr-thumb-ph' }, h('span', { text: o.label.charAt(0).toUpperCase() }))); }, { once: true });
  return {
    el,
    set(selected) { toggleClass(el, 'is-selected', selected); el.setAttribute('aria-checked', String(selected)); el.setAttribute('aria-pressed', String(selected)); },
  };
}

const thumbUrl = (info: ModularInfo, path: string | undefined): string | undefined => (path ? info.url(path) : undefined);

// ---- Face & Body ----

/** Body picker plus morph sliders for the morphs the selected body declares (none while the manifest declares none). */
export function modularBodySection(ctx: CreatorContext, info: ModularInfo, b: Binder, group: 'body' | 'face'): HTMLElement[] {
  const s = () => ctx.session;
  const m = info.manifest;
  const out: HTMLElement[] = [];
  if (group === 'body') {
    const grid = h('div', { class: 'cr-thumb-grid cr-body-grid', role: 'radiogroup', ariaLabel: 'Body' });
    const cards = m.bodies.map((def) => {
      const c = thumbCard({ label: def.label, thumb: thumbUrl(info, def.thumbnail), onClick: () => { if (lookOf(s()).bodyId !== def.id) ctx.report(s().setModularBody(def.id)); } });
      grid.appendChild(c.el);
      return { def, c };
    });
    b.fn(() => { const id = lookOf(s()).bodyId; for (const { def, c } of cards) c.set(def.id === id); });
    out.push(section('Body', grid, hint('The body sets the build. Frames never limit hair, clothing, pronouns or anything else.')));
  }
  const body = m.bodies.find((x) => x.id === lookOf(s()).bodyId);
  const morphs = (body?.morphs ?? []).filter((x) => x.group === group);
  if (morphs.length > 0) {
    out.push(section(group === 'body' ? 'Build' : 'Face shape', ...morphs.map((mo) => b.add(sliderField({
      label: mo.label, min: mo.range[0], max: mo.range[1], step: 0.01,
      value: () => lookOf(s()).morphs[mo.id] ?? 0,
      format: mo.range[0] < 0 ? signedFormat : percentFormat,
      onInput: (v) => ctx.report(s().setModularMorph(mo.id, v)),
      onCommit: () => s().endEdit(),
    })))));
  }
  return out;
}

// ---- Hair ----

/** The hairstyle grid (thumbnails, a None card, pressed state) for the current body. */
export function modularHairSection(ctx: CreatorContext, info: ModularInfo, b: Binder): HTMLElement {
  const s = () => ctx.session;
  const m = info.manifest;
  const styles = hairFor(m, lookOf(s()).bodyId);
  const grid = h('div', { class: 'cr-thumb-grid cr-hair-thumbs', role: 'radiogroup', ariaLabel: 'Hairstyles' });
  const none = thumbCard({ label: 'None', none: true, onClick: () => { if (lookOf(s()).hairId !== null) ctx.report(s().setModularHair(null)); } });
  grid.appendChild(none.el);
  const cards = styles.map((def) => {
    const meta = () => {
      const w = hairWouldReplace(m, lookOf(s()), def.id);
      return w.length > 0 ? `Takes off ${w.join(', ')}` : '';
    };
    const c = thumbCard({ label: def.label, thumb: thumbUrl(info, def.thumbnail), onClick: () => { if (lookOf(s()).hairId !== def.id) ctx.report(s().setModularHair(def.id)); } });
    const metaEl = h('span', { class: 'cr-thumb-meta' });
    c.el.insertBefore(metaEl, c.el.querySelector('.cr-check'));
    grid.appendChild(c.el);
    return { def, c, metaEl, meta };
  });
  b.fn(() => {
    const l = lookOf(s());
    none.set(l.hairId === null);
    for (const x of cards) { x.c.set(l.hairId === x.def.id); const t = x.meta(); x.metaEl.textContent = t; x.metaEl.hidden = !t; }
  });
  return section('Hairstyle', styles.length > 0 ? grid : hint('No hairstyles are available for this body yet.'));
}

/** The facial hair grid (None, thumbnails, label fallback) for the current body; null when the catalog has none for it. */
export function modularFacialHairSection(ctx: CreatorContext, info: ModularInfo, b: Binder): HTMLElement | null {
  const s = () => ctx.session;
  const m = info.manifest;
  const styles = facialHairFor(m, lookOf(s()).bodyId);
  if (styles.length === 0) return null;
  const grid = h('div', { class: 'cr-thumb-grid cr-facial-thumbs', role: 'radiogroup', ariaLabel: 'Facial hair' });
  const none = thumbCard({ label: 'None', none: true, onClick: () => { if (lookOf(s()).facialHairId !== null) ctx.report(s().setModularFacialHair(null)); } });
  grid.appendChild(none.el);
  const cards = styles.map((def) => {
    const c = thumbCard({ label: def.label, thumb: thumbUrl(info, def.thumbnail), onClick: () => { if (lookOf(s()).facialHairId !== def.id) ctx.report(s().setModularFacialHair(def.id)); } });
    const metaEl = h('span', { class: 'cr-thumb-meta' });
    c.el.insertBefore(metaEl, c.el.querySelector('.cr-check'));
    grid.appendChild(c.el);
    return { def, c, metaEl };
  });
  b.fn(() => {
    const l = lookOf(s());
    none.set(l.facialHairId === null);
    for (const x of cards) {
      x.c.set(l.facialHairId === x.def.id);
      const w = l.facialHairId === x.def.id ? [] : facialHairWouldReplace(m, l, x.def.id);
      x.metaEl.textContent = w.length > 0 ? `Replaces ${w.join(', ')}` : '';
      x.metaEl.hidden = w.length === 0;
    }
  });
  return section('Facial hair', grid, hint('Facial hair takes the hair colour.'));
}

// ---- Clothing ----

const nameOfHex = (hex: string, i: number): string => FABRIC_COLORS.find((f) => f.color.toLowerCase() === hex.toLowerCase())?.name ?? `Colour ${i + 1}`;

function regionSwatches(r: ColorRegionDef): Swatch[] {
  if (r.palette && r.palette.length > 0) return r.palette.map((c, i) => ({ id: `${r.id}-${i}`, name: nameOfHex(c, i), color: c }));
  return [{ id: `${r.id}-default`, name: 'Original', color: r.default }, ...FABRIC_COLORS];
}

/** Colour controls of one worn garment: one swatch group per colour region. */
function garmentColors(ctx: CreatorContext, b: Binder, g: GarmentDef): HTMLElement {
  const s = () => ctx.session;
  const wrap = h('div', { class: 'cr-garment-colors' });
  for (const r of g.colorRegions) {
    wrap.appendChild(b.add(colorField({
      label: g.colorRegions.length > 1 ? `${g.label}: ${r.label} colour` : `${g.label} colour`,
      swatches: regionSwatches(r),
      custom: !(r.palette && r.palette.length > 0),
      value: () => lookOf(s()).colors.garments[g.id]?.[r.id] ?? r.default,
      onPick: (c) => ctx.report(s().setModularGarmentColor(g.id, r.id, c)),
      onCommit: () => s().endEdit(),
    })));
  }
  return wrap;
}

/** True when the outfit of `category` is exactly the preset's garments. */
const presetWorn = (look: ModularLook, category: OutfitCategory, p: OutfitPresetDef): boolean => {
  const o = outfitFor(look, category);
  const slots = new Set<string>([...Object.keys(o), ...Object.keys(p.outfit)]);
  return [...slots].every((k) => (o as Record<string, string | undefined>)[k] === (p.outfit as Record<string, string | undefined>)[k]);
};

/** Outfit presets, then one section per slot that has garments for the current body. */
export function modularClothingSections(ctx: CreatorContext, info: ModularInfo, b: Binder, category: OutfitCategory): HTMLElement[] {
  const s = () => ctx.session;
  const m: ModularManifest = info.manifest;
  const bodyId = lookOf(s()).bodyId;
  const out: HTMLElement[] = [];

  const presets = m.outfitPresets ?? [];
  if (presets.length > 0) {
    const row = h('div', { class: 'cr-thumb-grid cr-preset-grid', role: 'radiogroup', ariaLabel: 'Outfits' });
    const cards = presets.map((p) => {
      const c = thumbCard({ label: p.label, onClick: () => ctx.report(s().applyOutfitPreset(p.id, category)) });
      c.el.classList.add('is-text');
      row.appendChild(c.el);
      return { p, c };
    });
    b.fn(() => { const l = lookOf(s()); for (const { p, c } of cards) c.set(presetWorn(l, category, p)); });
    out.push(section('Outfits', row, hint('A ready-made outfit for this category. Change any piece afterwards.')));
  }

  /** One slot's cards, optional tag filter and colour controls (null when no garment fits the body). */
  const slotBlock = (slot: ModularSlot): HTMLElement | null => {
    const list = garmentsFor(m, bodyId, slot);
    if (list.length === 0) return null;
    const grid = h('div', { class: 'cr-thumb-grid', role: 'radiogroup', ariaLabel: `${SLOT_TITLES[slot]} garments` });
    const none = thumbCard({ label: 'None', none: true, onClick: () => { if (outfitFor(lookOf(s()), category)[slot] !== undefined) ctx.report(s().setModularGarment(category, slot, null)); } });
    grid.appendChild(none.el);
    const cards = list.map((g) => {
      const c = thumbCard({ label: g.label, thumb: thumbUrl(info, g.thumbnail), onClick: () => { if (outfitFor(lookOf(s()), category)[slot] !== g.id) ctx.report(s().setModularGarment(category, slot, g.id)); } });
      const metaEl = h('span', { class: 'cr-thumb-meta' });
      c.el.insertBefore(metaEl, c.el.querySelector('.cr-check'));
      grid.appendChild(c.el);
      return { g, c, metaEl };
    });
    // a long slot (tops) gets a compact row of tag chips; the worn garment always stays visible
    const tags = tagFilters(list);
    const chosen = (): string => chosenTags.get(s())?.[slot] ?? '';
    const filter = tags.length > 0 ? choiceChips<string>({
      label: `${SLOT_TITLES[slot]} type`, hideLabel: true,
      options: [{ id: 'all', label: 'All' }, ...tags.map((t) => ({ id: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))],
      value: () => chosen() || 'all',
      onPick: (id) => { const o = chosenTags.get(s()) ?? {}; o[slot] = id === 'all' ? '' : id; chosenTags.set(s(), o); b.sync(); },
    }) : null;
    if (filter) { filter.el.classList.add('cr-tag-filter'); b.add(filter); }
    const colors = h('div', { class: 'cr-slot-colors' });
    let shown = '';
    let cb = new Binder();
    b.fn(() => {
      const l = lookOf(s());
      const worn = outfitFor(l, category)[slot];
      none.set(worn === undefined);
      const tag = chosen();
      for (const x of cards) {
        x.c.set(worn === x.g.id);
        x.c.el.hidden = !(matchesTag(x.g, tag) || worn === x.g.id);
        const w = worn === x.g.id ? [] : wouldReplace(m, l, category, x.g.id);
        x.metaEl.textContent = w.length > 0 ? `Replaces ${w.join(', ')}` : '';
        x.metaEl.hidden = w.length === 0;
      }
      // colour controls follow the worn garment; rebuilt only when it changes
      const key = worn ?? '';
      if (key !== shown) {
        shown = key;
        const g = worn ? list.find((x) => x.id === worn) : undefined;
        cb = new Binder();
        colors.replaceChildren(...(g ? [garmentColors(ctx, cb, g)] : []));
      }
      cb.sync();
    });
    return h('div', { class: 'cr-slot-block', dataset: { slot } }, ...(filter ? [filter.el] : []), grid, colors);
  };

  for (const slot of SLOT_ORDER) {
    const block = slotBlock(slot);
    if (block) out.push(section(SLOT_TITLES[slot], block));
  }
  // accessories: one group, one sub-section per slot that has items for this body
  const subs = ACCESSORY_SLOTS.flatMap((slot) => {
    const block = slotBlock(slot);
    return block ? [h('div', { class: 'cr-subsec', dataset: { slot } }, h('h4', { class: 'cr-subsec-title', text: SLOT_TITLES[slot] }), block)] : [];
  });
  if (subs.length > 0) out.push(section('Accessories', ...subs));
  if (out.length === 0) out.push(hint('No garments are available for this body yet.'));
  return out;
}
