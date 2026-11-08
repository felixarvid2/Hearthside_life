// Keyboard focus helpers (Milestone 13): which elements can take focus, a Tab trap for modal dialogs, and returning
// focus to the control that opened a dialog or panel.

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]';

/** Elements inside `root` that Tab can reach right now (visible, enabled, tabindex not negative), in DOM order. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled || el.hidden || el.closest('[hidden], [inert]')) return false;
    if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
    return el.getClientRects().length > 0;
  });
}

/** Keeps Tab and Shift+Tab inside `root`: wraps at the ends and pulls focus in when it is outside. Returns true when it acted. */
export function trapTab(root: HTMLElement, e: KeyboardEvent): boolean {
  if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return false;
  const items = focusables(root);
  if (!items.length) { e.preventDefault(); root.focus({ preventScroll: true }); return true; }
  const first = items[0]!, last = items[items.length - 1]!;
  const active = document.activeElement as HTMLElement | null;
  if (!active || !root.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus({ preventScroll: true }); return true; }
  if (e.shiftKey && active === first) { e.preventDefault(); last.focus({ preventScroll: true }); return true; }
  if (!e.shiftKey && active === last) { e.preventDefault(); first.focus({ preventScroll: true }); return true; }
  return false;
}

/** The control that has focus now, to return to later; null when nothing meaningful has focus (the page or the canvas). */
export function currentOpener(): HTMLElement | null {
  const a = document.activeElement;
  if (!(a instanceof HTMLElement) || a === document.body || a.id === 'game-canvas') return null;
  return a;
}

/** Puts focus back on `opener` if it is still on the page and focus would otherwise be lost (inside `closed`, or nowhere). */
export function restoreFocus(opener: HTMLElement | null, closed?: HTMLElement): void {
  if (!opener || !opener.isConnected || opener.closest('[hidden]') || (opener as HTMLButtonElement).disabled) return;
  const a = document.activeElement;
  const lost = !a || a === document.body || (closed && closed.contains(a));
  if (lost || !closed) opener.focus({ preventScroll: true });
}

/** True when the last focus change came from the keyboard (so moving focus into a new panel will not surprise a mouse or touch user). */
export function keyboardModality(): boolean {
  const a = document.activeElement;
  try { return a instanceof HTMLElement && a !== document.body && a.matches(':focus-visible'); } catch { return false; }
}

/**
 * Roving tabindex for tab bars, radio groups and swatch rows: one Tab stop (the checked item), arrow keys, Home and End move
 * to and activate the neighbour. `current()` says which item is checked; call the returned `sync` after the state changes.
 */
export function rovingGroup(container: HTMLElement, items: () => HTMLElement[], current: () => HTMLElement | undefined): () => void {
  const sync = () => {
    const list = items();
    const cur = current() ?? list.find((b) => !(b as HTMLButtonElement).disabled);
    for (const b of list) b.tabIndex = b === cur ? 0 : -1;
  };
  container.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const list = items().filter((b) => !(b as HTMLButtonElement).disabled);
    const i = list.indexOf(e.target as HTMLElement);
    if (i < 0 || !list.length) return;
    let to = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = (i + 1) % list.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = list.length - 1;
    if (to < 0) return;
    e.preventDefault();
    list[to]!.focus({ preventScroll: true });
    list[to]!.click();
  });
  sync();
  return sync;
}
