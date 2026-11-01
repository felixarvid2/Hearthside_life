// Viewport and orientation tracking. Sets body classes `is-portrait` / `is-landscape` / `is-compact`
// and CSS variables --app-w / --app-h from the visual viewport, and notifies subscribers after changes
// (debounced to one animation frame). Never locks orientation.

export interface LayoutInfo {
  width: number;
  height: number;
  portrait: boolean;
  /** Small screens (phone-sized in either orientation). */
  compact: boolean;
  /** Touch-first device (coarse pointer). */
  touch: boolean;
}

type Listener = (info: LayoutInfo) => void;

const listeners = new Set<Listener>();
let current: LayoutInfo = measure();
let scheduled = false;

function measure(): LayoutInfo {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const width = Math.round(vv?.width ?? window.innerWidth);
  const height = Math.round(vv?.height ?? window.innerHeight);
  const portrait = width / Math.max(1, height) < 1;
  const compact = Math.min(width, height) < 560;
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return { width, height, portrait, compact, touch };
}

function apply(info: LayoutInfo): void {
  const b = document.body;
  b.classList.toggle('is-portrait', info.portrait);
  b.classList.toggle('is-landscape', !info.portrait);
  b.classList.toggle('is-compact', info.compact);
  b.classList.toggle('is-touch', info.touch);
  const root = document.documentElement.style;
  root.setProperty('--app-w', `${info.width}px`);
  root.setProperty('--app-h', `${info.height}px`);
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const next = measure();
    const changed = next.width !== current.width || next.height !== current.height || next.portrait !== current.portrait || next.touch !== current.touch;
    current = next;
    apply(next);
    if (changed) for (const fn of [...listeners]) fn(next);
  });
}

let installed = false;
/** Installs listeners once (window resize, orientationchange, visualViewport resize/scroll). */
export function installLayoutTracking(): void {
  if (installed) return;
  installed = true;
  apply(current);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
}

export function layout(): LayoutInfo { return current; }

export function onLayoutChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
