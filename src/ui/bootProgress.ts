// Boot progress: main.ts reports real loading steps (chunk loads, asset loads); the boot screen shows them.
// Remembers the latest value so a screen created after some steps have finished starts in the right place.

type Listener = (value: number, label: string) => void;

let last: { value: number; label: string } | null = null;
const listeners = new Set<Listener>();

export const bootProgress = {
  /** value is 0..1 and never moves backwards. */
  set(value: number, label: string): void {
    const v = Math.max(last?.value ?? 0, Math.min(1, value));
    last = { value: v, label };
    for (const l of listeners) l(v, label);
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    if (last) fn(last.value, last.label);
    return () => { listeners.delete(fn); };
  },
};
