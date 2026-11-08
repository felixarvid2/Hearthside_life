// Boot (loading) screen shown until api.mode() leaves 'boot', and the WebGL2 compatibility screen.

import '../styles/base.css';
import '../styles/screens.css';
import { button } from '../kit/components';
import { h } from '../kit/dom';
import { icon } from '../kit/icons';
import { progressBar } from '../kit/controls';
import { bootProgress } from '../bootProgress';

/** Original logo mark: a small house with a hearth glow. */
export function logoMark(size = 56): HTMLElement {
  const el = h('span', { class: 'logo-mark', attrs: { 'aria-hidden': 'true' } });
  el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none"><path d="M10 30L32 12l22 18" stroke="#2f2a26" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 27v25h32V27" fill="#fbf6ee" stroke="#2f2a26" stroke-width="4" stroke-linejoin="round"/><path d="M26 52V40a6 6 0 0112 0v12" fill="#f2c27b" stroke="#2f2a26" stroke-width="3"/><path d="M32 47c-3-2-3-5 0-8 3 3 3 6 0 8z" fill="#d9774b"/><circle cx="47" cy="14" r="4" fill="#2f8f83"/></svg>`;
  return el;
}

export interface BootScreen { el: HTMLElement; destroy(): void }

export function createBootScreen(root: HTMLElement): BootScreen {
  const bar = progressBar({ label: 'Loading', value: null });
  bar.set(null, 'Setting the table…');
  const el = h('div', { class: 'boot-screen', role: 'status', attrs: { 'aria-live': 'polite' } },
    h('div', { class: 'boot-card' }, logoMark(72), h('h1', { class: 'brand-title', text: 'Hearthside Life' }), h('p', { class: 'brand-tag', text: 'A cosy life on Willow Lane' }), bar.el));
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.appendChild(el);
  // Driven by the real loading steps (chunk and asset loads, see main.ts); indeterminate until the first report.
  const off = bootProgress.subscribe((v, label) => bar.set(v, label));
  return { el, destroy: () => { off(); el.classList.add('is-leaving'); setTimeout(() => el.remove(), 250); } };
}

/**
 * Shown by main.ts instead of the game when WebGL2 is unavailable. Explains the requirement and that saves
 * are safe. Can be called before createUI.
 */
export function showCompatibilityScreen(root: HTMLElement, message: string): void {
  const el = h('div', { class: 'compat-screen' },
    h('div', { class: 'compat-card', role: 'alert' },
      logoMark(64),
      h('h1', { text: 'Hearthside Life needs WebGL 2' }),
      h('p', { class: 'compat-message', text: message }),
      h('div', { class: 'compat-safe' }, icon('save', 22), h('p', { text: 'Your saved games are stored in this browser and are safe. Nothing was changed or deleted.' })),
      h('h2', { text: 'What you can try' }),
      h('ul', { class: 'compat-tips' },
        h('li', { text: 'Use a recent version of Chrome, Edge, Firefox or Safari.' }),
        h('li', { text: 'Turn on hardware acceleration in your browser settings.' }),
        h('li', { text: 'Update your graphics drivers or your device, then try again.' })),
      button({ label: 'Try again', icon: 'rotateRight', variant: 'primary', onClick: () => location.reload() })));
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.appendChild(el);
}
