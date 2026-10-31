// OWNER: UI editors agent. Helpers shared by the Buy and Build mode panels: funds/paused status, undo/redo,
// small persistence helpers (favourites, recent items), refresh coalescing, labels and swatch styles.
// The UI talks to the game only through GameAPI (src/game/api.ts).

import type { GameAPI, SoundId } from '../../game/api';
import type { Cents, Household } from '../../core/types';
import { formatMoney } from '../../core/money';
import { button, toast } from '../kit/components';
import { h, setText, toggleClass } from '../kit/dom';
import { icon } from '../kit/icons';
import { layout } from '../kit/layout';
import './editors.css';

export { formatMoney };

/** Set to false if the Game already plays these sounds itself when commands succeed. */
export const PLAY_SOUNDS = true;

export function play(api: GameAPI, id: SoundId): void {
  if (!PLAY_SOUNDS) return;
  try { api.sound(id); } catch { /* sound is optional */ }
}

// ---------------------------------------------------------------------------------------------
// Funds
// ---------------------------------------------------------------------------------------------

export interface FundsInfo { household: Household | null; funds: Cents; unlimited: boolean }

export function fundsInfo(api: GameAPI): FundsInfo {
  const s = api.state();
  const hh = s ? s.households[s.activeHouseholdId] ?? null : null;
  return { household: hh, funds: hh?.funds ?? 0, unlimited: !!s?.settings.unlimitedFunds };
}

/** Why a purchase of `cost` cannot be paid, or null when it can (or costs nothing). */
export function affordReason(api: GameAPI, cost: Cents): string | null {
  if (cost <= 0) return null;
  const f = fundsInfo(api);
  if (f.unlimited) return null;
  if (!f.household) return 'No active household to pay for it.';
  if (cost > f.funds) return `Not enough funds: costs ${formatMoney(cost)}, you have ${formatMoney(f.funds)}.`;
  return null;
}

/** Funds pill plus the "Simulation paused" badge, placed in a panel header. */
export function editorStatus(api: GameAPI, verb: string): { el: HTMLElement; refresh(): void } {
  const paused = h('span', {
    class: 'bb-paused', role: 'status', ariaLabel: 'Simulation paused',
    title: `Simulation paused while you ${verb}`,
  }, icon('pause', 16), h('span', { text: 'Paused' }));
  const amount = h('span', { class: 'bb-funds-amount' });
  const funds = h('span', { class: 'bb-funds', role: 'status' }, icon('money', 18), amount);
  const el = h('div', { class: 'bb-status' }, paused, funds);
  let last = '';
  const refresh = () => {
    const f = fundsInfo(api);
    const text = f.unlimited ? 'Unlimited' : f.household ? formatMoney(f.funds) : '-';
    const key = `${text}|${f.unlimited}`;
    if (key === last) return;
    last = key;
    setText(amount, text);
    toggleClass(funds, 'is-unlimited', f.unlimited);
    const label = f.unlimited ? 'Household funds: unlimited (Build Sandbox)' : `Household funds: ${text}`;
    funds.setAttribute('aria-label', label);
    funds.title = label;
  };
  refresh();
  return { el, refresh };
}

/** Undo and Redo buttons (labels as tooltips). */
export function undoRedo(api: GameAPI, after?: () => void): { el: HTMLElement; refresh(): void } {
  const run = (fn: () => string | null, verb: string) => {
    const label = fn();
    if (label) toast(`${verb}: ${label}`, 'info', 2200);
    refresh();
    after?.();
  };
  const undo = button({ icon: 'undo', iconOnly: true, label: 'Undo', onClick: () => run(() => api.undo(), 'Undone') });
  const redo = button({ icon: 'redo', iconOnly: true, label: 'Redo', onClick: () => run(() => api.redo(), 'Redone') });
  const el = h('div', { class: 'bb-undo', role: 'group', ariaLabel: 'Undo and redo' }, undo, redo);
  const refresh = () => {
    const u = !api.canUndo(), r = !api.canRedo();
    if (undo.disabled !== u) undo.disabled = u;
    if (redo.disabled !== r) redo.disabled = r;
  };
  refresh();
  return { el, refresh };
}

/** Sets `hidden` only when it changes (no DOM mutation for no-op refreshes). */
export function setHidden(el: HTMLElement, hidden: boolean): void {
  if (el.hidden !== hidden) el.hidden = hidden;
}

/** Sets an attribute only when its value changes. */
export function setAttr(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** Sets a button's visible label; `short` is shown instead in compact footers (landscape phones). */
export function setLabel(btn: HTMLButtonElement, long: string, short = long): void {
  const l = btn.querySelector('.btn-label') as HTMLElement | null;
  if (!l || (l.dataset.long === long && l.dataset.short === short)) return;
  l.dataset.long = long;
  l.dataset.short = short;
  while (l.firstChild) l.removeChild(l.firstChild);
  if (long === short) l.textContent = long;
  else l.append(h('span', { class: 'bb-lbl-long', text: long }), h('span', { class: 'bb-lbl-short', text: short }));
}

/** Small count badge on an icon button (e.g. active filters). */
export function setBadge(btn: HTMLElement, n: number): void {
  let b = btn.querySelector('.bb-count-badge') as HTMLElement | null;
  if (!n) { b?.remove(); return; }
  if (!b) { b = h('span', { class: 'bb-count-badge', attrs: { 'aria-hidden': 'true' } }); btn.appendChild(b); }
  setText(b, String(n));
}

/** Floating button that reopens a closed mode panel. */
export function reopenButton(label: string, iconName: string, onClick: () => void): HTMLButtonElement {
  const b = button({ label, icon: iconName, variant: 'primary', onClick });
  b.classList.add('bb-reopen');
  b.hidden = true;
  return b;
}

/** Screen area covered by a panel, for api.view.setInsets (computed by the caller). */
export interface Insets { left: number; right: number; top: number; bottom: number }

export function panelInsets(panelEl: HTMLElement): Insets {
  const none: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  if (panelEl.hidden || !panelEl.isConnected) return none;
  const r = panelEl.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return none;
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  if (layout().portrait) return { ...none, bottom: Math.max(0, Math.round(vh - r.top)) };
  return { ...none, right: Math.max(0, Math.round(vw - r.left)) };
}

// ---------------------------------------------------------------------------------------------
// Persistence of small per-player lists (favourites, recent). localStorage may be unavailable.
// ---------------------------------------------------------------------------------------------

export function loadList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveList(key: string, list: string[]): void {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* storage full or blocked */ }
}

/** Moves `id` to the front of a bounded recency list. */
export function pushRecent(list: string[], id: string, max = 12): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

// ---------------------------------------------------------------------------------------------
// Refresh coalescing: mark parts dirty, run once per animation frame.
// ---------------------------------------------------------------------------------------------

export class Refresher<K extends string> {
  private dirty = new Set<K>();
  private raf = 0;
  constructor(private readonly run: (parts: Set<K>) => void) {}
  mark(...parts: K[]): void {
    for (const p of parts) this.dirty.add(p);
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => this.flush());
  }
  flush(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (!this.dirty.size) return;
    const parts = new Set(this.dirty);
    this.dirty.clear();
    this.run(parts);
  }
  cancel(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.dirty.clear();
  }
}

// ---------------------------------------------------------------------------------------------
// Labels and visuals
// ---------------------------------------------------------------------------------------------

/** 'wood-planks' -> 'Wood planks', 'grabSnack' -> 'Grab snack'. */
export function humanize(id: string): string {
  const s = id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_:]+/g, ' ').trim().toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : id;
}

/** CSS background for a striped palette swatch (colours[0..2]). */
export function stripes(colors: readonly string[]): string {
  const c = colors.length ? colors : ['#cccccc'];
  const c0 = c[0]!, c1 = c[1] ?? c0, c2 = c[2] ?? c1;
  return `linear-gradient(135deg, ${c0} 0 38%, ${c1} 38% 69%, ${c2} 69% 100%)`;
}

/** A thumbnail <img>, or a neutral placeholder when the game has none. */
export function thumbImg(get: () => string, alt = ''): HTMLElement {
  let src = '';
  try { src = get(); } catch { src = ''; }
  if (!src) return h('span', { class: 'thumb bb-thumb-missing', attrs: { 'aria-hidden': 'true' } }, icon('box', 28));
  const img = h('img', { class: 'thumb', attrs: { src, alt, loading: 'lazy', decoding: 'async', draggable: 'false' } });
  img.addEventListener('error', () => img.replaceWith(h('span', { class: 'thumb bb-thumb-missing', attrs: { 'aria-hidden': 'true' } }, icon('box', 28))), { once: true });
  return img;
}

/** Search helper: every word of the query appears in one of the fields. */
export function matchesQuery(query: string, fields: Array<string | undefined>): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Labelled native select (touch friendly, >= 44 px). */
export function selectField(o: { label: string; options: Array<{ id: string; label: string }>; value: string; onChange: (v: string) => void }): { el: HTMLElement; select: HTMLSelectElement; setOptions(opts: Array<{ id: string; label: string }>, value: string): void } {
  const select = h('select', { class: 'text-input bb-select', attrs: { 'aria-label': o.label } });
  const setOptions = (opts: Array<{ id: string; label: string }>, value: string) => {
    while (select.firstChild) select.removeChild(select.firstChild);
    for (const opt of opts) select.appendChild(h('option', { value: opt.id, text: opt.label }));
    select.value = opts.some((x) => x.id === value) ? value : (opts[0]?.id ?? '');
  };
  setOptions(o.options, o.value);
  select.addEventListener('change', () => o.onChange(select.value));
  const el = h('label', { class: 'bb-select-field' }, h('span', { class: 'field-label', text: o.label }), select);
  return { el, select, setOptions };
}

/** Text search input with a clear button. */
export function searchField(o: { label: string; placeholder: string; value: string; onInput: (v: string) => void }): { el: HTMLElement; input: HTMLInputElement; set(v: string): void } {
  const input = h('input', { type: 'search', class: 'text-input bb-search-input', placeholder: o.placeholder, value: o.value, attrs: { 'aria-label': o.label, enterkeyhint: 'search', autocomplete: 'off', spellcheck: 'false' } });
  let timer = 0;
  const clear = button({ icon: 'close', iconOnly: true, label: 'Clear search', variant: 'ghost', onClick: () => { input.value = ''; sync(); o.onInput(''); input.focus(); } });
  const sync = () => { clear.hidden = !input.value; };
  input.addEventListener('input', () => {
    sync();
    window.clearTimeout(timer);
    timer = window.setTimeout(() => o.onInput(input.value.trim()), 150);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; sync(); o.onInput(''); } });
  sync();
  const el = h('div', { class: 'bb-search' }, icon('search', 18), input, clear);
  return { el, input, set: (v) => { input.value = v; sync(); } };
}
