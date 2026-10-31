// Small building blocks for the creator screens, on top of the shared kit (src/ui/kit). Every control returns
// its element plus a `sync()` that reads the current value again and updates the DOM only where it changed, so
// a step can be refreshed after any edit without being rebuilt (a slider being dragged is never replaced).

import type { Swatch } from '../../content/types';
import { button, modal, slider, swatchGrid } from '../kit/components';
import { h, setText, toggleClass } from '../kit/dom';
import { icon } from '../kit/icons';

export type Sync = () => void;

export interface Bound<E extends HTMLElement = HTMLElement> { el: E; sync: Sync }

/** Collects the sync functions of a step view. */
export class Binder {
  private fns: Sync[] = [];
  /** Registers a control and syncs it once. Returns the element for inline use. */
  add<E extends HTMLElement>(b: Bound<E>): E { this.fns.push(b.sync); b.sync(); return b.el; }
  fn(fn: Sync): void { this.fns.push(fn); fn(); }
  sync(): void { for (const fn of this.fns) fn(); }
}

let uid = 0;
export const nextId = (prefix: string): string => `${prefix}-${++uid}`;

// ---------------------------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------------------------

export function section(title: string, ...children: Array<Node | null | false | undefined>): HTMLElement {
  return h('section', { class: 'cr-sec' }, h('h3', { class: 'cr-sec-title', text: title }), ...children);
}

export function hint(text: string): HTMLParagraphElement { return h('p', { class: 'cr-hint', text }); }

/** An inline note with an icon (info or warning). */
export function noteBox(text: string, kind: 'info' | 'warning' = 'info'): HTMLElement {
  return h('div', { class: ['cr-note', `cr-note-${kind}`] }, icon(kind === 'warning' ? 'warning' : 'info', 18), h('span', { text }));
}

/** A list of validation messages; empty list hides it. */
export function issueList(): { el: HTMLElement; set(messages: string[]): void } {
  const ul = h('ul', { class: 'cr-issues', role: 'list' });
  let last = '';
  const set = (messages: string[]) => {
    const key = messages.join('\n');
    if (key === last) return;
    last = key;
    ul.replaceChildren(...messages.map((m) => h('li', { class: 'cr-issue' }, icon('warning', 18), h('span', { text: m }))));
    ul.hidden = messages.length === 0;
  };
  set([]);
  ul.hidden = true;
  return { el: ul, set };
}

// ---------------------------------------------------------------------------------------------
// Text fields
// ---------------------------------------------------------------------------------------------

export interface TextFieldOpts {
  label: string;
  value: () => string;
  max: number;
  onInput: (v: string) => void;
  onCommit?: () => void;
  multiline?: boolean;
  counter?: boolean;
  placeholder?: string;
  hint?: string;
}

/** Labelled text input (or textarea) that never fights the caret while focused. */
export function textField(o: TextFieldOpts): Bound {
  const id = nextId('cr-text');
  const input = o.multiline
    ? h('textarea', { class: 'text-input', attrs: { id, maxlength: o.max, rows: 3, spellcheck: 'true' } })
    : h('input', { type: 'text', class: 'text-input', attrs: { id, maxlength: o.max, autocomplete: 'off', spellcheck: 'false' } });
  if (o.placeholder) input.placeholder = o.placeholder;
  const count = o.counter ? h('span', { class: 'cr-counter', attrs: { 'aria-live': 'off' } }) : null;
  input.addEventListener('input', () => { o.onInput(input.value); if (count) setText(count, `${input.value.length} / ${o.max}`); });
  input.addEventListener('change', () => o.onCommit?.());
  input.addEventListener('blur', () => o.onCommit?.());
  const el = h('div', { class: 'field cr-text-field' },
    h('div', { class: 'cr-field-head' }, h('label', { class: 'field-label', text: o.label, attrs: { for: id } }), count),
    input,
    o.hint ? hint(o.hint) : null);
  const sync = () => {
    const v = o.value();
    if (input.value !== v && document.activeElement !== input) input.value = v;
    if (count) setText(count, `${input.value.length} / ${o.max}`);
  };
  return { el, sync };
}

// ---------------------------------------------------------------------------------------------
// Sliders, swatches
// ---------------------------------------------------------------------------------------------

export interface SliderFieldOpts {
  label: string;
  min: number;
  max: number;
  step: number;
  value: () => number;
  format?: (v: number) => string;
  onInput: (v: number) => void;
  /** End of a drag or a -/+ step (one undo step per gesture). */
  onCommit: () => void;
}

/** The kit slider (-/+ buttons, numeric value) bound to a getter. */
export function sliderField(o: SliderFieldOpts): Bound {
  let current = o.value();
  const s = slider({
    label: o.label, min: o.min, max: o.max, step: o.step, value: current,
    ...(o.format ? { format: o.format } : {}),
    onInput: (v) => { current = v; o.onInput(v); },
    onCommit: () => o.onCommit(),
  });
  s.el.classList.add('cr-slider');
  const sync = () => {
    const v = o.value();
    if (Math.abs(v - current) > 1e-6) { current = v; s.set(v); }
  };
  return { el: s.el, sync };
}

/** Signed -100..100 display for -1..1 controls. */
export const signedFormat = (v: number): string => {
  const n = Math.round(v * 100);
  return n === 0 ? '0' : n > 0 ? `+${n}` : `${n}`;
};
export const percentFormat = (v: number): string => `${Math.round(v * 100)}%`;

export interface ColorFieldOpts {
  label: string;
  swatches: readonly Swatch[];
  value: () => string;
  onPick: (hex: string) => void;
  /** Called after a discrete pick or when the custom colour picker closes. */
  onCommit: () => void;
  custom?: boolean;
}

/** Swatch grid with a custom colour input and the chosen colour's name shown as text. */
export function colorField(o: ColorFieldOpts): Bound {
  const g = swatchGrid({
    label: o.label,
    swatches: o.swatches.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    value: o.value(),
    custom: o.custom ?? true,
    onPick: (color, id) => { o.onPick(color); if (id !== null) o.onCommit(); },
  });
  g.el.classList.add('cr-color-field');
  const nameEl = h('span', { class: 'cr-field-value' });
  g.el.querySelector('.field-label')?.appendChild(nameEl);
  g.el.querySelector<HTMLInputElement>('input[type=color]')?.addEventListener('change', () => o.onCommit());
  let last = '';
  const sync = () => {
    const v = o.value().toLowerCase();
    if (v === last) return;
    last = v;
    g.set(v);
    const named = o.swatches.find((s) => s.color.toLowerCase() === v);
    setText(nameEl, named ? named.name : `Custom ${v}`);
  };
  return { el: g.el, sync };
}

// ---------------------------------------------------------------------------------------------
// Chips and cards
// ---------------------------------------------------------------------------------------------

export interface ChoiceOption<T extends string> { id: T; label: string; title?: string; icon?: string }

/** Single-choice chips (radio group) with a check mark on the chosen one. */
export function choiceChips<T extends string>(o: {
  label: string;
  options: ReadonlyArray<ChoiceOption<T>>;
  value: () => T | null;
  onPick: (id: T) => void;
  hideLabel?: boolean;
}): Bound {
  const row = h('div', { class: 'chips cr-chips', role: 'radiogroup', ariaLabel: o.label });
  const btns = o.options.map((opt) => {
    const b = h('button', { type: 'button', class: 'chip cr-chip', role: 'radio', dataset: { id: opt.id }, ...(opt.title ? { title: opt.title } : {}) },
      h('span', { class: 'cr-check' }, icon('check', 16)),
      opt.icon ? icon(opt.icon, 16) : null,
      h('span', { text: opt.label }));
    b.addEventListener('click', () => o.onPick(opt.id));
    row.appendChild(b);
    return b;
  });
  const el = o.hideLabel ? row : h('div', { class: 'field' }, h('div', { class: 'field-label', text: o.label }), row);
  const sync = () => {
    const v = o.value();
    for (const b of btns) {
      const on = b.dataset.id === v;
      toggleClass(b, 'is-selected', on);
      b.setAttribute('aria-checked', String(on));
    }
  };
  return { el, sync };
}

export interface CardState { selected: boolean; disabled?: boolean; reason?: string }

export interface Card { el: HTMLButtonElement; set(state: CardState): void }

/**
 * A large selectable card (title, optional meta line, description, icon). Disabled cards stay focusable and
 * show their reason; clicking one calls onDisabledClick (to explain) instead of onClick.
 */
export function card(o: {
  title: string;
  meta?: string;
  desc?: string;
  icon?: string;
  onClick: () => void;
  onDisabledClick?: (reason: string) => void;
  role?: 'radio' | 'checkbox';
}): Card {
  const reasonEl = h('span', { class: 'cr-card-reason' });
  reasonEl.hidden = true;
  const b = h('button', { type: 'button', class: 'cr-card', role: o.role ?? 'radio' },
    h('span', { class: 'cr-card-head' },
      o.icon ? h('span', { class: 'cr-card-icon' }, icon(o.icon, 20)) : null,
      h('span', { class: 'cr-card-title', text: o.title }),
      h('span', { class: 'cr-check' }, icon('check', 18))),
    o.meta ? h('span', { class: 'cr-card-meta', text: o.meta }) : null,
    o.desc ? h('span', { class: 'cr-card-desc', text: o.desc }) : null,
    reasonEl);
  let state: CardState = { selected: false };
  b.addEventListener('click', () => {
    if (state.disabled) o.onDisabledClick?.(state.reason ?? 'Not available right now.');
    else o.onClick();
  });
  const set = (s: CardState) => {
    state = s;
    toggleClass(b, 'is-selected', s.selected);
    toggleClass(b, 'is-disabled', !!s.disabled);
    b.setAttribute('aria-checked', String(s.selected));
    if (s.disabled) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
    const reason = s.disabled ? s.reason ?? '' : '';
    setText(reasonEl, reason);
    reasonEl.hidden = !reason;
  };
  set(state);
  return { el: b, set };
}

/** A small labelled action button row (wraps on narrow screens). */
export function actionRow(...buttons: Array<HTMLElement | null | false>): HTMLElement {
  return h('div', { class: 'cr-actions' }, ...buttons);
}

export function smallButton(label: string, iconName: string | undefined, onClick: () => void, variant: 'secondary' | 'ghost' | 'primary' | 'danger' = 'secondary'): HTMLButtonElement {
  const b = button({ label, ...(iconName ? { icon: iconName } : {}), variant, onClick });
  b.classList.add('cr-btn');
  return b;
}

// ---------------------------------------------------------------------------------------------
// Files and reports
// ---------------------------------------------------------------------------------------------

/** Offers text as a file download. */
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { attrs: { href: url, download: filename } });
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
}

/** Opens the file picker and resolves with the chosen file's text (null when cancelled or unreadable). */
export function pickTextFile(accept = '.json,application/json'): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', attrs: { accept } });
    input.style.display = 'none';
    document.body.appendChild(input);
    let done = false;
    const finish = (v: { name: string; text: string } | null) => { if (done) return; done = true; input.remove(); resolve(v); };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) { finish(null); return; }
      if (file.size > 2_000_000) { finish({ name: file.name, text: '' }); return; }
      file.text().then((text) => finish({ name: file.name, text }), () => finish(null));
    });
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}

/** File-name safe slug. */
export function slug(text: string, fallback: string): string {
  const s = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || fallback;
}

/** A modal with an intro line and one or more titled lists (substitution reports, issues). */
export function reportDialog(o: { title: string; intro: string; lists: Array<{ title: string; items: string[] }>; confirm?: string }): Promise<void> {
  return new Promise((resolve) => {
    const m = modal({ title: o.title, onClose: () => resolve() });
    m.el.classList.add('cr-modal', 'cr-report');
    m.body.appendChild(h('p', { text: o.intro }));
    for (const list of o.lists) {
      if (list.items.length === 0) continue;
      m.body.appendChild(h('h3', { class: 'cr-sec-title', text: list.title }));
      m.body.appendChild(h('ul', { class: 'cr-report-list' }, ...list.items.map((t) => h('li', { text: t }))));
    }
    m.footer.appendChild(button({ label: o.confirm ?? 'OK', variant: 'primary', onClick: () => m.close() }));
  });
}

/** A modal listing actions as large row buttons; resolves when closed. */
export function actionSheet(o: { title: string; intro?: string; actions: Array<{ label: string; icon?: string; detail?: string; disabled?: boolean; reason?: string; danger?: boolean; run: () => void }> }): void {
  const m = modal({ title: o.title });
  m.el.classList.add('cr-modal', 'cr-sheet-modal');
  if (o.intro) m.body.appendChild(h('p', { class: 'cr-hint', text: o.intro }));
  const list = h('div', { class: 'cr-sheet-actions' });
  for (const a of o.actions) {
    const b = h('button', { type: 'button', class: ['row-btn', 'cr-row-btn', a.danger && 'is-danger'], disabled: !!a.disabled },
      a.icon ? h('span', { class: 'row-btn-icon' }, icon(a.icon, 22)) : null,
      h('span', { class: 'row-btn-text' },
        h('span', { class: 'row-btn-title', text: a.label }),
        a.disabled && a.reason ? h('span', { class: 'row-btn-sub', text: a.reason }) : a.detail ? h('span', { class: 'row-btn-sub', text: a.detail }) : null));
    b.addEventListener('click', () => { if (b.disabled) return; m.close(); a.run(); });
    list.appendChild(b);
  }
  m.body.appendChild(list);
}

/** Lighter or darker variant of a hex colour (dl in -1..1 of lightness). */
export function shade(hex: string, dl: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1] as string, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const t = dl >= 0 ? c + (255 - c) * dl : c * (1 + dl);
    return Math.max(0, Math.min(255, Math.round(t)));
  });
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Initials for portrait fallbacks. */
export function initials(first: string, last: string, index: number): string {
  const s = `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase();
  return s || String(index + 1);
}
