// Reusable interface components. Each returns a root element plus methods to update it. All controls are
// touch friendly (>= 44 px targets) and keyboard operable.

import { h, setChildren, setText, shieldWorld, toggleClass } from './dom';
import { icon } from './icons';
import { layout, onLayoutChange } from './layout';

// ---------------------------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------------------------

export interface ButtonOpts {
  label?: string;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Icon-only button: label becomes aria-label and tooltip. */
  iconOnly?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  small?: boolean;
}

export function button(o: ButtonOpts): HTMLButtonElement {
  const b = h('button', {
    type: 'button',
    class: ['btn', `btn-${o.variant ?? 'secondary'}`, o.iconOnly && 'btn-icon', o.small && 'btn-small'],
    ...(o.iconOnly && o.label ? { ariaLabel: o.label, title: o.title ?? o.label } : o.title ? { title: o.title } : {}),
    disabled: !!o.disabled,
  });
  if (o.icon) b.appendChild(icon(o.icon));
  if (o.label && !o.iconOnly) b.appendChild(h('span', { class: 'btn-label', text: o.label }));
  if (o.onClick) b.addEventListener('click', () => { if (!b.disabled) o.onClick!(); });
  return b;
}

/** Button with a visible small caption under the icon (HUD style). */
export function toolButton(o: { icon: string; label: string; onClick: () => void; active?: boolean }): HTMLButtonElement {
  const b = h('button', { type: 'button', class: ['tool-btn', o.active && 'is-active'], ariaLabel: o.label, title: o.label },
    icon(o.icon), h('span', { class: 'tool-label', text: o.label }));
  b.addEventListener('click', o.onClick);
  return b;
}

// ---------------------------------------------------------------------------------------------
// Slider with -/+ and value
// ---------------------------------------------------------------------------------------------

export interface SliderOpts {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (v: number) => string;
  onInput: (v: number) => void;
  /** Called when a drag or step ends (for undo snapshots). */
  onCommit?: (v: number) => void;
}

export interface Slider { el: HTMLElement; set(v: number): void }

export function slider(o: SliderOpts): Slider {
  const fmt = o.format ?? ((v: number) => (Math.abs(v) < 1e-9 ? '0' : v.toFixed(o.step < 0.1 ? 2 : o.step < 1 ? 1 : 0)));
  const value = h('span', { class: 'slider-value' });
  const input = h('input', { type: 'range', attrs: { min: o.min, max: o.max, step: o.step, 'aria-label': o.label } });
  let v = o.value;
  const set = (nv: number, notify: boolean, commit: boolean) => {
    v = Math.min(o.max, Math.max(o.min, Math.round(nv / o.step) * o.step));
    input.value = String(v);
    setText(value, fmt(v));
    input.style.setProperty('--fill', `${((v - o.min) / (o.max - o.min)) * 100}%`);
    if (notify) o.onInput(v);
    if (commit) o.onCommit?.(v);
  };
  input.addEventListener('input', () => set(Number(input.value), true, false));
  input.addEventListener('change', () => o.onCommit?.(v));
  const minus = button({ icon: 'minus', iconOnly: true, label: `Decrease ${o.label}`, small: true, onClick: () => set(v - o.step, true, true) });
  const plus = button({ icon: 'plus', iconOnly: true, label: `Increase ${o.label}`, small: true, onClick: () => set(v + o.step, true, true) });
  const el = h('div', { class: 'slider' },
    h('div', { class: 'slider-head' }, h('label', { class: 'slider-label', text: o.label }), value),
    h('div', { class: 'slider-row' }, minus, input, plus));
  set(o.value, false, false);
  return { el, set: (nv) => set(nv, false, false) };
}

// ---------------------------------------------------------------------------------------------
// Swatches, segmented controls, chips, tabs
// ---------------------------------------------------------------------------------------------

export interface SwatchGridOpts {
  label: string;
  swatches: Array<{ id: string; name: string; color: string }>;
  value: string; // selected colour (hex) or swatch id
  /** Show a custom colour input. */
  custom?: boolean;
  onPick: (color: string, id: string | null) => void;
}

export function swatchGrid(o: SwatchGridOpts): { el: HTMLElement; set(value: string): void } {
  const grid = h('div', { class: 'swatches', role: 'radiogroup', ariaLabel: o.label });
  const buttons: HTMLButtonElement[] = [];
  for (const s of o.swatches) {
    const b = h('button', { type: 'button', class: 'swatch', title: s.name, ariaLabel: s.name, role: 'radio', dataset: { id: s.id, color: s.color.toLowerCase() } });
    b.style.setProperty('--swatch', s.color);
    b.addEventListener('click', () => { o.onPick(s.color, s.id); mark(s.color); });
    buttons.push(b);
    grid.appendChild(b);
  }
  let customInput: HTMLInputElement | null = null;
  if (o.custom) {
    customInput = h('input', { type: 'color', class: 'swatch-custom', ariaLabel: `Custom ${o.label}`, title: 'Custom colour' });
    customInput.addEventListener('input', () => { o.onPick(customInput!.value, null); mark(customInput!.value); });
    grid.appendChild(h('label', { class: 'swatch swatch-custom-wrap', title: 'Custom colour' }, customInput, icon('eyedropper', 18)));
  }
  const mark = (value: string) => {
    const v = value.toLowerCase();
    let found = false;
    for (const b of buttons) {
      const on = b.dataset.id === value || b.dataset.color === v;
      found ||= on;
      toggleClass(b, 'is-selected', on);
      b.setAttribute('aria-checked', String(on));
    }
    if (customInput && /^#[0-9a-f]{6}$/i.test(value)) { customInput.value = value; toggleClass(customInput.parentElement!, 'is-selected', !found); }
  };
  mark(o.value);
  return { el: h('div', { class: 'field' }, h('div', { class: 'field-label', text: o.label }), grid), set: mark };
}

export function segmented<T extends string>(o: { label: string; options: Array<{ id: T; label: string; icon?: string }>; value: T; onChange: (v: T) => void }): { el: HTMLElement; set(v: T): void } {
  const row = h('div', { class: 'segmented', role: 'radiogroup', ariaLabel: o.label });
  const btns = o.options.map((opt) => {
    const b = h('button', { type: 'button', class: 'seg', role: 'radio', dataset: { id: opt.id } });
    if (opt.icon) b.appendChild(icon(opt.icon, 18));
    b.appendChild(h('span', { text: opt.label }));
    b.addEventListener('click', () => { set(opt.id); o.onChange(opt.id); });
    row.appendChild(b);
    return b;
  });
  const set = (v: T) => btns.forEach((b) => { const on = b.dataset.id === v; toggleClass(b, 'is-selected', on); b.setAttribute('aria-checked', String(on)); });
  set(o.value);
  return { el: h('div', { class: 'field' }, h('div', { class: 'field-label', text: o.label }), row), set };
}

export function chip(o: { label: string; selected?: boolean; disabled?: boolean; title?: string; icon?: string; onClick: () => void }): HTMLButtonElement {
  const b = h('button', { type: 'button', class: ['chip', o.selected && 'is-selected'], disabled: !!o.disabled, ...(o.title ? { title: o.title } : {}), attrs: { 'aria-pressed': !!o.selected } });
  if (o.icon) b.appendChild(icon(o.icon, 16));
  b.appendChild(h('span', { text: o.label }));
  b.addEventListener('click', () => { if (!b.disabled) o.onClick(); });
  return b;
}

export interface Tabs { el: HTMLElement; select(id: string): void; current(): string }

/** Horizontal scrollable tab chips. Content switching is up to the caller. */
export function tabs(o: { items: Array<{ id: string; label: string; icon?: string; badge?: string }>; value: string; onChange: (id: string) => void; label: string }): Tabs {
  const bar = h('div', { class: 'tabs', role: 'tablist', ariaLabel: o.label });
  let cur = o.value;
  const btns = o.items.map((it) => {
    const b = h('button', { type: 'button', class: 'tab', role: 'tab', dataset: { id: it.id } });
    if (it.icon) b.appendChild(icon(it.icon, 18));
    b.appendChild(h('span', { text: it.label }));
    if (it.badge) b.appendChild(h('span', { class: 'badge', text: it.badge }));
    b.addEventListener('click', () => { select(it.id); o.onChange(it.id); });
    bar.appendChild(b);
    return b;
  });
  const select = (id: string) => {
    cur = id;
    for (const b of btns) {
      const on = b.dataset.id === id;
      toggleClass(b, 'is-selected', on);
      b.setAttribute('aria-selected', String(on));
      if (on) b.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  };
  select(o.value);
  return { el: bar, select, current: () => cur };
}

// ---------------------------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------------------------

/** Need/progress bar with icon, text label and a non-colour cue (stripes when low). */
export function meter(o: { label: string; icon?: string; value: number; max?: number }): { el: HTMLElement; set(v: number, text?: string): void } {
  const fill = h('div', { class: 'meter-fill' });
  const val = h('span', { class: 'meter-value' });
  const el = h('div', { class: 'meter', role: 'meter', ariaLabel: o.label, attrs: { 'aria-valuemin': 0, 'aria-valuemax': o.max ?? 100 } },
    o.icon ? icon(o.icon, 18) : null,
    h('span', { class: 'meter-label', text: o.label }),
    h('div', { class: 'meter-track' }, fill),
    val);
  const set = (v: number, text?: string) => {
    const max = o.max ?? 100;
    const pct = Math.max(0, Math.min(100, (v / max) * 100));
    fill.style.width = `${pct}%`;
    el.setAttribute('aria-valuenow', String(Math.round(v)));
    el.dataset.level = pct < 20 ? 'critical' : pct < 40 ? 'low' : pct < 70 ? 'ok' : 'good';
    setText(val, text ?? `${Math.round(pct)}`);
  };
  set(o.value);
  return { el, set };
}

// ---------------------------------------------------------------------------------------------
// Panels: bottom sheet in portrait, side panel in landscape
// ---------------------------------------------------------------------------------------------

export type SheetHeight = 'peek' | 'half' | 'full';

export interface Panel {
  el: HTMLElement;
  body: HTMLElement;
  header: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  setTitle(t: string): void;
  setHeight(hgt: SheetHeight): void;
  destroy(): void;
}

/**
 * A panel that is a bottom sheet (three heights, drag handle + explicit buttons) in portrait and a docked
 * side panel in landscape. Pointer events inside never reach the world.
 */
export function panel(o: { title: string; onClose?: () => void; className?: string; initialHeight?: SheetHeight; closable?: boolean }): Panel {
  const title = h('h2', { class: 'panel-title', text: o.title });
  let height: SheetHeight = o.initialHeight ?? 'half';
  const sizeBtn = button({ icon: 'up', iconOnly: true, label: 'Expand panel', small: true, variant: 'ghost', onClick: () => setHeight(height === 'full' ? 'half' : 'full') });
  const closeBtn = o.closable === false ? null : button({ icon: 'close', iconOnly: true, label: 'Close panel', small: true, variant: 'ghost', onClick: () => { close(); o.onClose?.(); } });
  const handle = h('div', { class: 'sheet-handle', attrs: { 'aria-hidden': 'true' } });
  const header = h('div', { class: 'panel-header' }, title, h('div', { class: 'panel-actions' }, sizeBtn, closeBtn));
  const body = h('div', { class: 'panel-body' });
  const el = h('section', { class: ['panel', o.className], role: 'dialog', ariaLabel: o.title }, handle, header, body);
  shieldWorld(el);

  // drag the handle to change sheet height (portrait only)
  let dragY: number | null = null;
  handle.addEventListener('pointerdown', (e) => { dragY = e.clientY; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointerup', (e) => {
    if (dragY === null) return;
    const dy = e.clientY - dragY; dragY = null;
    if (dy < -30) setHeight(height === 'peek' ? 'half' : 'full');
    else if (dy > 30) setHeight(height === 'full' ? 'half' : 'peek');
  });
  handle.addEventListener('pointercancel', () => { dragY = null; });

  const setHeight = (hgt: SheetHeight) => {
    height = hgt;
    el.dataset.height = hgt;
    const up = hgt !== 'full';
    sizeBtn.setAttribute('aria-label', up ? 'Expand panel' : 'Shrink panel');
    sizeBtn.title = up ? 'Expand panel' : 'Shrink panel';
    sizeBtn.classList.toggle('is-flipped', !up);
  };
  const open = () => { el.hidden = false; toggleClass(el, 'is-open', true); };
  const close = () => { toggleClass(el, 'is-open', false); el.hidden = true; };
  const unsub = onLayoutChange(() => setHeight(height));
  setHeight(height);
  el.hidden = true;
  return {
    el, body, header, open, close,
    isOpen: () => !el.hidden,
    setTitle: (t) => setText(title, t),
    setHeight,
    destroy: () => { unsub(); el.remove(); },
  };
}

// ---------------------------------------------------------------------------------------------
// Modal dialogs, confirmation, toasts
// ---------------------------------------------------------------------------------------------

export interface Modal { el: HTMLElement; body: HTMLElement; footer: HTMLElement; close(): void }

export function modal(o: { title: string; onClose?: () => void; wide?: boolean }): Modal {
  const body = h('div', { class: 'modal-body' });
  const footer = h('div', { class: 'modal-footer' });
  const backdrop = h('div', { class: 'modal-backdrop' });
  const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); o.onClose?.(); };
  // Only the top-most modal reacts to Esc (stacked modals register one listener each on document).
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    const all = document.querySelectorAll('.modal-backdrop');
    if (all[all.length - 1] !== backdrop) return;
    e.stopImmediatePropagation();
    close();
  };
  const box = h('div', { class: ['modal', o.wide && 'modal-wide'], role: 'dialog', ariaLabel: o.title, attrs: { 'aria-modal': 'true' } },
    h('div', { class: 'modal-header' }, h('h2', { text: o.title }), button({ icon: 'close', iconOnly: true, label: 'Close', variant: 'ghost', small: true, onClick: close })),
    body, footer);
  backdrop.appendChild(box);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  shieldWorld(backdrop);
  document.addEventListener('keydown', onKey);
  (document.getElementById('ui-root') ?? document.body).appendChild(backdrop);
  // Focus a text field first (prompts), else the first body/footer control, else the close button.
  queueMicrotask(() => ((box.querySelector('.modal-body input, .modal-body select, .modal-body textarea') ?? box.querySelector('.modal-body button, .modal-footer button') ?? box.querySelector('button')) as HTMLElement | null)?.focus({ preventScroll: true }));
  return { el: box, body, footer, close };
}

export function confirmDialog(o: { title: string; text: string; confirm: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({ title: o.title, onClose: () => { if (!done) resolve(false); } });
    m.body.appendChild(h('p', { text: o.text }));
    m.footer.append(
      button({ label: 'Cancel', variant: 'ghost', onClick: () => { done = true; resolve(false); m.close(); } }),
      button({ label: o.confirm, variant: o.danger ? 'danger' : 'primary', onClick: () => { done = true; resolve(true); m.close(); } }),
    );
  });
}

export function promptDialog(o: { title: string; label: string; value: string; confirm: string; maxLength?: number }): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({ title: o.title, onClose: () => { if (!done) resolve(null); } });
    const input = h('input', { type: 'text', class: 'text-input', value: o.value, attrs: { maxlength: o.maxLength ?? 40, 'aria-label': o.label } });
    m.body.append(h('label', { class: 'field-label', text: o.label }), input);
    const ok = () => { done = true; resolve(input.value.trim()); m.close(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    m.footer.append(button({ label: 'Cancel', variant: 'ghost', onClick: () => { done = true; resolve(null); m.close(); } }), button({ label: o.confirm, variant: 'primary', onClick: ok }));
  });
}

let toastHost: HTMLElement | null = null;
let toastObserver: MutationObserver | null = null;
let avoid: { left: number; top: number; right: number; bottom: number } | null = null;

/** Short, auto-hiding notification. */
export function toast(text: string, kind: 'info' | 'success' | 'warning' | 'error' = 'info', ms = 3500): void {
  if (!toastHost || !toastHost.isConnected) {
    toastObserver?.disconnect();
    toastHost = h('div', { class: 'toasts', role: 'status', attrs: { 'aria-live': 'polite' } });
    (document.getElementById('ui-root') ?? document.body).appendChild(toastHost);
    toastObserver = typeof MutationObserver !== 'undefined' ? new MutationObserver(layoutToasts) : null;
    toastObserver?.observe(toastHost, { childList: true });
  }
  const iconName = kind === 'warning' || kind === 'error' ? 'warning' : kind === 'success' ? 'check' : 'info';
  const t = h('div', { class: ['toast', `toast-${kind}`] }, icon(iconName, 18), h('span', { text }));
  toastHost.appendChild(t);
  while (toastHost.children.length > 4) toastHost.firstElementChild?.remove();
  setTimeout(() => { t.classList.add('is-leaving'); setTimeout(() => t.remove(), 300); }, ms);
}

/**
 * Keeps the toast stack clear of a floating element (the context menu), given as a viewport rectangle, or null when
 * nothing needs avoiding. The stack moves below or above it, else beside it, and hides while there is no room.
 */
export function avoidToasts(rect: { left: number; top: number; right: number; bottom: number } | null): void {
  const same = avoid && rect && avoid.left === rect.left && avoid.top === rect.top && avoid.right === rect.right && avoid.bottom === rect.bottom;
  if (same || (!avoid && !rect)) return;
  avoid = rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null;
  layoutToasts();
}

function layoutToasts(): void {
  const host = toastHost;
  if (!host || !host.isConnected) return;
  host.classList.remove('is-hidden');
  for (const prop of ['top', 'left', 'width', 'transform']) host.style.removeProperty(prop);
  const a = avoid;
  if (!a || !host.children.length) return;
  const gap = 8;
  const hit = (r: DOMRect) => r.left < a.right + 4 && r.right > a.left - 4 && r.top < a.bottom + 4 && r.bottom > a.top - 4;
  const home = host.getBoundingClientRect();
  if (!hit(home)) return;
  const origin = (host.offsetParent ?? document.body).getBoundingClientRect();
  const floorY = window.innerHeight - (Number.parseFloat(document.documentElement.style.getPropertyValue('--shell-bottom')) || 0) - gap;
  // below the menu, else above it (never above the stack's own top edge)
  if (a.bottom + gap + home.height <= floorY) { host.style.top = `${a.bottom + gap - origin.top}px`; return; }
  if (a.top - gap - home.height >= home.top) { host.style.top = `${a.top - gap - home.height - origin.top}px`; return; }
  // beside it, where there is room for a readable column
  const left = a.left - gap - 2 * gap, right = window.innerWidth - a.right - gap - 2 * gap;
  if (Math.max(left, right) >= 200) {
    const w = Math.min(420, Math.max(left, right));
    const x = right >= left ? a.right + gap : a.left - gap - w;
    host.style.left = `${x - origin.left}px`;
    host.style.width = `${w}px`;
    host.style.transform = 'none';
    return;
  }
  host.classList.add('is-hidden'); // no room: the feed keeps the story
}

// ---------------------------------------------------------------------------------------------
// Paginated card grid (catalogs): renders only the current page; keeps page per key.
// ---------------------------------------------------------------------------------------------

const savedPages = new Map<string, number>();

export interface CardGrid<T> { el: HTMLElement; setItems(items: T[]): void; refresh(): void }

export function cardGrid<T>(o: {
  key: string;
  render: (item: T) => HTMLElement;
  empty?: string;
  pageSize?: () => number;
}): CardGrid<T> {
  const grid = h('div', { class: 'card-grid' });
  const info = h('span', { class: 'pager-info' });
  const prev = button({ icon: 'back', iconOnly: true, label: 'Previous page', small: true, onClick: () => go(page - 1) });
  const next = button({ icon: 'next', iconOnly: true, label: 'Next page', small: true, onClick: () => go(page + 1) });
  const pager = h('div', { class: 'pager' }, prev, info, next);
  const el = h('div', { class: 'card-grid-wrap' }, grid, pager);
  let items: T[] = [];
  let page = savedPages.get(o.key) ?? 0;
  const size = () => Math.max(4, o.pageSize?.() ?? (layout().compact ? 8 : 12));
  const go = (p: number) => {
    const pages = Math.max(1, Math.ceil(items.length / size()));
    page = Math.max(0, Math.min(pages - 1, p));
    savedPages.set(o.key, page);
    const slice = items.slice(page * size(), page * size() + size());
    setChildren(grid, slice.length ? slice.map(o.render) : h('p', { class: 'empty', text: o.empty ?? 'Nothing here yet.' }));
    setText(info, `${page + 1} / ${pages}`);
    prev.disabled = page === 0;
    next.disabled = page >= pages - 1;
    pager.hidden = pages <= 1;
  };
  return { el, setItems: (it) => { items = it; go(page); }, refresh: () => go(page) };
}
