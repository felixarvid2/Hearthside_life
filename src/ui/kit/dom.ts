// Tiny DOM helpers used by every screen. No framework: screens build DOM with h() and update parts of it
// when relevant state changes (never every frame unless a value changed).

export type Child = Node | string | number | null | undefined | false | Child[];

export interface Props {
  class?: string | Array<string | false | null | undefined>;
  style?: Partial<CSSStyleDeclaration> | Record<string, string>;
  dataset?: Record<string, string>;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  text?: string;
  html?: string; // only for trusted, static markup such as our own SVG icons
  onClick?: (ev: MouseEvent) => void;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (ev: HTMLElementEventMap[K]) => void }>;
  ref?: (el: HTMLElement) => void;
  title?: string;
  ariaLabel?: string;
  role?: string;
  disabled?: boolean;
  type?: string;
  value?: string;
  placeholder?: string;
  tabIndex?: number;
}

/** Creates an element: h('button', { class: 'btn', onClick }, 'Save'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) applyProps(el, props);
  append(el, children);
  return el;
}

export function applyProps(el: HTMLElement, p: Props): void {
  if (p.class) el.className = Array.isArray(p.class) ? p.class.filter(Boolean).join(' ') : p.class;
  if (p.style) Object.assign(el.style, p.style);
  if (p.dataset) for (const [k, v] of Object.entries(p.dataset)) el.dataset[k] = v;
  if (p.attrs) for (const [k, v] of Object.entries(p.attrs)) {
    if (v === null || v === undefined || v === false) el.removeAttribute(k);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  if (p.text !== undefined) el.textContent = p.text;
  if (p.html !== undefined) el.innerHTML = p.html;
  if (p.onClick) el.addEventListener('click', p.onClick as EventListener);
  if (p.on) for (const [k, fn] of Object.entries(p.on)) if (fn) el.addEventListener(k, fn as EventListener);
  if (p.title) el.title = p.title;
  if (p.ariaLabel) el.setAttribute('aria-label', p.ariaLabel);
  if (p.role) el.setAttribute('role', p.role);
  if (p.disabled !== undefined && 'disabled' in el) (el as HTMLButtonElement).disabled = p.disabled;
  if (p.type !== undefined && 'type' in el) (el as HTMLInputElement).type = p.type;
  if (p.value !== undefined && 'value' in el) (el as HTMLInputElement).value = p.value;
  if (p.placeholder !== undefined && 'placeholder' in el) (el as HTMLInputElement).placeholder = p.placeholder;
  if (p.tabIndex !== undefined) el.tabIndex = p.tabIndex;
  if (p.ref) p.ref(el);
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

/** Replaces all children. */
export function setChildren(el: Node, ...children: Child[]): void {
  while (el.firstChild) el.removeChild(el.firstChild);
  append(el, children);
}

/** Sets text only when it changed (cheap to call from frequent updates). */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function toggleClass(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

/** Stops pointer/touch/wheel events from reaching the world canvas underneath a UI element. */
export function shieldWorld(el: HTMLElement): void {
  for (const type of ['pointerdown', 'wheel', 'touchstart', 'contextmenu'] as const) {
    el.addEventListener(type, (e) => e.stopPropagation(), { passive: type !== 'contextmenu' });
  }
}

/** Disposable group of listeners/unsubscribers for a screen. */
export class Disposer {
  private fns: Array<() => void> = [];
  add(fn: (() => void) | void): void { if (fn) this.fns.push(fn); }
  listen<K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  listen(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void;
  listen(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.fns.push(() => target.removeEventListener(type, fn, opts));
  }
  dispose(): void { for (const fn of this.fns.splice(0)) { try { fn(); } catch { /* ignore */ } } }
}

/** Escapes text for the rare places that build markup strings. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}
