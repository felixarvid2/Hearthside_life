// Extra kit controls (added by the UI shell). Same conventions as components.ts: >= 44 px targets, visible
// labels, state never shown by colour alone.

import '../styles/kit-extra.css';
import { h, setText, toggleClass } from './dom';
import { icon } from './icons';

export interface ToggleSwitch { el: HTMLElement; set(on: boolean): void; setDisabled(disabled: boolean, reason?: string): void }

/** On/off switch row: label (+ optional hint) on the left, a switch showing "On"/"Off" text on the right. */
export function toggleSwitch(o: { label: string; hint?: string; value: boolean; onChange: (on: boolean) => void; disabled?: boolean }): ToggleSwitch {
  const state = h('span', { class: 'switch-state' });
  const btn = h('button', { type: 'button', class: 'switch', role: 'switch', ariaLabel: o.label },
    h('span', { class: 'switch-track' }, h('span', { class: 'switch-thumb' })), state);
  const hint = h('span', { class: 'switch-hint', text: o.hint ?? '' });
  hint.hidden = !o.hint;
  const el = h('div', { class: 'switch-row' }, h('span', { class: 'switch-text' }, h('span', { class: 'switch-label', text: o.label }), hint), btn);
  let on = o.value;
  const set = (v: boolean) => {
    on = v;
    btn.setAttribute('aria-checked', String(v));
    toggleClass(btn, 'is-on', v);
    setText(state, v ? 'On' : 'Off');
  };
  btn.addEventListener('click', () => { if (btn.disabled) return; set(!on); o.onChange(on); });
  el.addEventListener('click', (e) => { if (e.target !== btn && !btn.contains(e.target as Node) && !btn.disabled) btn.click(); });
  const setDisabled = (d: boolean, reason?: string) => {
    btn.disabled = d;
    toggleClass(el, 'is-disabled', d);
    if (d && reason) { setText(hint, reason); hint.hidden = false; } else { setText(hint, o.hint ?? ''); hint.hidden = !o.hint; }
  };
  set(on);
  setDisabled(!!o.disabled);
  return { el, set, setDisabled };
}

/** Indeterminate or determinate progress bar with a text label. */
export function progressBar(o: { label: string; value?: number | null }): { el: HTMLElement; set(v: number | null, text?: string): void } {
  const fill = h('div', { class: 'progress-fill' });
  const text = h('span', { class: 'progress-text' });
  const el = h('div', { class: 'progress', role: 'progressbar', ariaLabel: o.label }, h('div', { class: 'progress-track' }, fill), text);
  const set = (v: number | null, t?: string) => {
    toggleClass(el, 'is-indeterminate', v === null);
    if (v === null) { el.removeAttribute('aria-valuenow'); fill.style.width = ''; }
    else { const pct = Math.max(0, Math.min(100, v * 100)); fill.style.width = `${pct}%`; el.setAttribute('aria-valuenow', String(Math.round(pct))); }
    setText(text, t ?? '');
    text.hidden = !t;
  };
  set(o.value ?? null);
  return { el, set };
}

/** Small round busy spinner with an accessible label. */
export function spinner(label = 'Loading'): HTMLElement {
  return h('span', { class: 'spinner', role: 'img', ariaLabel: label });
}

/** A list row button: icon, title, optional subtitle, optional trailing text. Used by menus and slot lists. */
export function rowButton(o: { icon?: string; title: string; subtitle?: string; tag?: string; trailing?: string; onClick: () => void; disabled?: boolean; danger?: boolean }): HTMLButtonElement {
  const b = h('button', { type: 'button', class: ['row-btn', o.danger && 'is-danger'], disabled: !!o.disabled });
  if (o.icon) b.appendChild(h('span', { class: 'row-btn-icon' }, icon(o.icon, 22)));
  b.appendChild(h('span', { class: 'row-btn-text' }, h('span', { class: 'row-btn-title', text: o.title }), o.subtitle ? h('span', { class: 'row-btn-sub', text: o.subtitle }) : null, o.tag ? h('span', { class: 'tag row-btn-tag', text: o.tag }) : null));
  if (o.trailing) b.appendChild(h('span', { class: 'row-btn-trailing', text: o.trailing }));
  b.addEventListener('click', () => { if (!b.disabled) o.onClick(); });
  return b;
}
