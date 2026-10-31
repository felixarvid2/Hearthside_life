// Small shared screen helpers: busy overlay, error and report dialogs.

import { button, modal } from '../kit/components';
import { h } from '../kit/dom';
import { icon } from '../kit/icons';
import { spinner } from '../kit/controls';

/** Full-screen "working" overlay above everything; returns a function that removes it. */
export function busyOverlay(text: string): () => void {
  const el = h('div', { class: 'busy-overlay', role: 'alert', attrs: { 'aria-busy': 'true' } }, h('div', { class: 'busy-box' }, spinner(text), h('span', { text })));
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  (document.getElementById('ui-root') ?? document.body).appendChild(el);
  return () => el.remove();
}

/** Error message with optional details (e.g. an import report) and a reassurance line. */
export function errorDialog(o: { title: string; message: string; details?: string[]; note?: string }): Promise<void> {
  return new Promise((resolve) => {
    const m = modal({ title: o.title, onClose: () => resolve() });
    m.body.append(h('div', { class: 'error-box', role: 'alert' }, icon('warning', 22), h('p', { text: o.message })));
    if (o.details?.length) m.body.append(h('ul', { class: 'report-list' }, ...o.details.map((d) => h('li', { text: d }))));
    if (o.note) m.body.append(h('p', { class: 'muted-note' }, icon('info', 18), h('span', { text: o.note })));
    m.footer.append(button({ label: 'OK', variant: 'primary', onClick: () => m.close() }));
  });
}

/** Informational list (load/import reports). */
export function reportDialog(o: { title: string; intro: string; lines: string[] }): Promise<void> {
  return new Promise((resolve) => {
    const m = modal({ title: o.title, onClose: () => resolve() });
    m.body.append(h('p', { text: o.intro }), h('ul', { class: 'report-list' }, ...o.lines.map((d) => h('li', { text: d }))));
    m.footer.append(button({ label: 'OK', variant: 'primary', onClick: () => m.close() }));
  });
}
