// Keyboard shortcut mapping (pure). See docs/UI_SPEC.md "Input state machine".

export type KeyCommand =
  | { kind: 'pan'; dir: 'left' | 'right' | 'up' | 'down' }
  | { kind: 'rotate'; dir: 1 | -1 }
  | { kind: 'zoom'; dir: 1 | -1 }
  | { kind: 'togglePause' }
  | { kind: 'speed'; speed: 1 | 2 | 3 }
  | { kind: 'escape' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'rotatePlacement' }
  | { kind: 'delete' };

export interface KeyLike { key: string; code?: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean }

/** Maps a keydown to a command, or null. Modifier combinations other than undo/redo are ignored. */
export function mapKey(e: KeyLike): KeyCommand | null {
  const mod = !!(e.ctrlKey || e.metaKey);
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod) {
    if (key === 'z') return e.shiftKey ? { kind: 'redo' } : { kind: 'undo' };
    if (key === 'y') return { kind: 'redo' };
    return null;
  }
  if (e.altKey) return null;
  switch (key) {
    case 'ArrowLeft': case 'a': return { kind: 'pan', dir: 'left' };
    case 'ArrowRight': case 'd': return { kind: 'pan', dir: 'right' };
    case 'ArrowUp': case 'w': return { kind: 'pan', dir: 'up' };
    case 'ArrowDown': case 's': return { kind: 'pan', dir: 'down' };
    case 'q': return { kind: 'rotate', dir: -1 };
    case 'e': return { kind: 'rotate', dir: 1 };
    case '+': case '=': return { kind: 'zoom', dir: 1 };
    case '-': case '_': return { kind: 'zoom', dir: -1 };
    case ' ': case 'Spacebar': return { kind: 'togglePause' };
    case '1': return { kind: 'speed', speed: 1 };
    case '2': return { kind: 'speed', speed: 2 };
    case '3': return { kind: 'speed', speed: 3 };
    case 'Escape': case 'Esc': return { kind: 'escape' };
    case 'r': return { kind: 'rotatePlacement' };
    case 'Delete': case 'Backspace': return { kind: 'delete' };
    default: break;
  }
  // Numpad +/- report their character in `key`, already handled; fall back on code for layouts without them.
  if (e.code === 'NumpadAdd') return { kind: 'zoom', dir: 1 };
  if (e.code === 'NumpadSubtract') return { kind: 'zoom', dir: -1 };
  return null;
}

/** True when keyboard focus is in a text field (shortcuts must not steal typing). */
export function isTypingTarget(el: { tagName?: string; isContentEditable?: boolean; type?: string } | null): boolean {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
  if (tag === 'INPUT') {
    const t = (el.type ?? 'text').toLowerCase();
    return !['button', 'checkbox', 'radio', 'range', 'color', 'submit', 'reset', 'file'].includes(t);
  }
  return false;
}
