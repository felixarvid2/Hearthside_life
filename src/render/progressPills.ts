// Milestone 11.5, task B: the DOM progress pill above a person's head (inside #world-overlay), plus the small pure
// colour/state helpers used by it and by the unit tests. No three import: this module only needs the DOM and content.

import type { ContentDB } from '../content/types';
import type { Person, WorldState } from '../core/types';
import { iconSvg } from '../ui/kit/icons';
import { actionProgress, type ActionProgress } from './actionProgress';

export type ProgressScope = 'household' | 'all' | 'off';

/** Green from here on: "nearly done". */
export const GREEN_AT = 0.85;
export const AMBER_COLOR = 'hsl(34 76% 52%)';
export const GREEN_COLOR = 'var(--good, #4d9a5b)';
export const CANCELLED_COLOR = 'var(--ink-3, #8a7f74)';
/** How long the check / grey cancel state stays after the action ends (ms). */
export const ENDING_MS = 700;

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * Fill colour at a fraction: warm amber at the start, blending to green at GREEN_AT, then the theme green.
 * The blend is eased (t^1.8) so the first half of an action still reads as amber rather than lime; the last
 * stretch before GREEN_AT is already close to green. Pure and unit-tested.
 */
export function fillColor(fraction: number): string {
  const f = clamp01(fraction);
  if (f >= GREEN_AT) return GREEN_COLOR;
  const t = (f / GREEN_AT) ** 1.8;
  const hue = Math.round(34 + (126 - 34) * t);
  const sat = Math.round(76 + (42 - 76) * t);
  const light = Math.round(52 + (40 - 52) * t);
  return `hsl(${hue} ${sat}% ${light}%)`;
}

export interface PillVisual {
  visible: boolean;
  kind: 'running' | 'almost' | 'done' | 'cancelled';
  /** 0..1 of the fill. */
  fraction: number;
  /** CSS colour for the fill. */
  color: string;
  checked: boolean;
  walking: boolean;
  icon: string;
  label: string;
}

/** Pure mapping from action progress (+ the last shown fraction) to what the pill should render. */
export function pillVisual(progress: ActionProgress | null, previous = 0, ending: 'done' | 'cancelled' | null = null): PillVisual {
  if (ending === 'done') {
    return { visible: true, kind: 'done', fraction: 1, color: GREEN_COLOR, checked: true, walking: false, icon: 'check', label: 'Done' };
  }
  if (ending === 'cancelled') {
    return { visible: true, kind: 'cancelled', fraction: clamp01(previous), color: CANCELLED_COLOR, checked: false, walking: false, icon: 'clock', label: 'Stopped' };
  }
  if (!progress) return { visible: false, kind: 'running', fraction: 0, color: AMBER_COLOR, checked: false, walking: false, icon: 'clock', label: '' };
  const f = clamp01(progress.fraction);
  if (progress.status === 'cancelled' || progress.status === 'failed') {
    return { visible: true, kind: 'cancelled', fraction: f, color: CANCELLED_COLOR, checked: false, walking: false, icon: progress.icon, label: progress.label };
  }
  if (progress.done || progress.status === 'done') {
    return { visible: true, kind: 'done', fraction: 1, color: GREEN_COLOR, checked: true, walking: false, icon: progress.icon, label: progress.label };
  }
  return {
    visible: true,
    kind: f >= GREEN_AT ? 'almost' : 'running',
    fraction: f,
    color: fillColor(f),
    checked: false,
    walking: progress.walking,
    icon: progress.icon,
    label: progress.label,
  };
}

/** Never decrease while the same action runs; a new action resets the previous value (the caller passes null). */
export function monotonicFraction(previous: number | null, next: number): number {
  const n = clamp01(next);
  return previous === null ? n : Math.max(clamp01(previous), n);
}

// ---------------------------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------------------------

export interface PillElement {
  root: HTMLDivElement;
  icon: HTMLSpanElement;
  fill: HTMLDivElement;
  check: HTMLSpanElement;
}

const injected = new WeakSet<Document>();

const PILL_CSS = `
#world-overlay .wo-pill {
  display: flex; align-items: center; gap: 3px;
  width: 56px; height: 12px; padding: 1px 3px; box-sizing: border-box;
  border-radius: 99px; overflow: hidden;
  background: rgba(28, 22, 18, 0.74);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.38), inset 0 0 0 1px rgba(255, 255, 255, 0.3);
  pointer-events: none; user-select: none;
  transition: opacity 220ms ease-out;
}
#world-overlay .wo-pill[hidden] { display: none !important; }
#world-overlay .wo-pill-icon { display: flex; flex: 0 0 9px; width: 9px; height: 9px; color: #fbf6ee; opacity: 0.92; }
#world-overlay .wo-pill-icon svg { display: block; width: 9px; height: 9px; }
#world-overlay .wo-pill-track { position: relative; flex: 1 1 auto; height: 4px; border-radius: 99px; background: rgba(255, 255, 255, 0.24); overflow: hidden; }
#world-overlay .wo-pill-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0%; border-radius: 99px; transition: width 150ms linear, background-color 200ms linear; }
#world-overlay .wo-pill-check { display: flex; flex: 0 0 10px; width: 10px; height: 10px; color: #fff; opacity: 0; transform: scale(0.6); transition: opacity 180ms ease-out, transform 180ms ease-out; }
/* The shared icon stroke (1.9/24) is under a pixel at 8-10 px and rasterises to a faint green tick; thicken it so
   the completion check reads white at 1x on the dark green capsule. */
#world-overlay .wo-pill-check svg { display: block; width: 10px; height: 10px; stroke-width: 4.5; }
#world-overlay .wo-pill.is-done { background: rgba(42, 82, 48, 0.88); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.45); }
#world-overlay .wo-pill.is-done .wo-pill-fill { width: 100% !important; }
#world-overlay .wo-pill.is-done .wo-pill-check { opacity: 1; transform: none; }
#world-overlay .wo-pill.is-cancelled { filter: saturate(0.25); opacity: 0.62; }
#world-overlay .wo-pill.is-fading { opacity: 0; }
#world-overlay .wo-pill.is-walking .wo-pill-track { opacity: 0.75; }
.reduced-motion #world-overlay .wo-pill,
.reduced-motion #world-overlay .wo-pill-fill,
.reduced-motion #world-overlay .wo-pill-check { transition: none !important; }
@media (max-width: 600px), (max-height: 500px) {
  #world-overlay .wo-pill { width: 44px; height: 10px; gap: 2px; padding: 1px 2px; }
  #world-overlay .wo-pill-icon, #world-overlay .wo-pill-icon svg { flex-basis: 8px; width: 8px; height: 8px; }
  #world-overlay .wo-pill-check, #world-overlay .wo-pill-check svg { flex-basis: 8px; width: 8px; height: 8px; }
  #world-overlay .wo-pill-check svg { stroke-width: 5; }
  #world-overlay .wo-pill-track { height: 3px; }
}
`;

function injectCss(doc: Document): void {
  if (injected.has(doc)) return;
  injected.add(doc);
  const style = doc.createElement('style');
  style.id = 'wo-pill-css';
  style.textContent = PILL_CSS;
  doc.head.appendChild(style);
}

export function createProgressPill(doc: Document = document): PillElement {
  injectCss(doc);
  const root = doc.createElement('div');
  root.className = 'wo-pill';
  root.hidden = true;
  root.setAttribute('role', 'progressbar');
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', '100');
  const icon = doc.createElement('span');
  icon.className = 'wo-pill-icon';
  const track = doc.createElement('span');
  track.className = 'wo-pill-track';
  const fill = doc.createElement('div');
  fill.className = 'wo-pill-fill';
  track.appendChild(fill);
  const check = doc.createElement('span');
  check.className = 'wo-pill-check';
  check.innerHTML = iconSvg('check', 8);
  root.append(icon, track, check);
  return { root, icon, fill, check };
}

/** Write a visual state into a pill. Exported so the DOM test can drive it without a whole PeopleView. */
export function applyPill(pill: PillElement, visual: PillVisual | null, fading = false): void {
  const root = pill.root;
  if (!visual || !visual.visible) { root.hidden = true; return; }
  root.hidden = false;
  const pct = Math.round(clamp01(visual.fraction) * 1000) / 10;
  pill.fill.style.width = `${pct}%`;
  pill.fill.style.backgroundColor = visual.color;
  root.classList.toggle('is-done', visual.kind === 'done');
  root.classList.toggle('is-cancelled', visual.kind === 'cancelled');
  root.classList.toggle('is-walking', visual.walking);
  root.classList.toggle('is-fading', fading);
  root.setAttribute('aria-valuenow', String(Math.round(pct)));
  root.setAttribute('aria-label', visual.kind === 'done' ? `${visual.label} complete` : `${visual.label} ${Math.round(pct)}%`);
  root.title = visual.kind === 'done' ? `${visual.label} - done` : `${visual.label} - ${Math.round(pct)}%`;
  if (pill.icon.dataset.icon !== visual.icon) {
    pill.icon.dataset.icon = visual.icon;
    pill.icon.innerHTML = iconSvg(visual.icon, 9);
  }
}

// ---------------------------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------------------------

interface PillState {
  pill: PillElement;
  actionId: string | null;
  lastFraction: number;
  lastStatus: ActionProgress['status'] | null;
  lastIcon: string;
  lastLabel: string;
  ending: 'done' | 'cancelled' | null;
  endingUntil: number;
  lastSample: number;
  lastWrite: number;
  lastKind: string;
  shown: boolean;
}

/**
 * Owns one pill per person. PeopleView registers a pill when it creates a person's overlay column and calls
 * `update()` from its projection loop. Sampling and DOM writes are throttled to 10 Hz; only on-screen people are
 * sampled (the caller only calls update for them).
 */
export class ProgressPills {
  private readonly states = new Map<string, PillState>();
  private scope: ProgressScope = 'household';

  constructor(private readonly now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())) {}

  get mode(): ProgressScope { return this.scope; }

  setScope(scope: ProgressScope): void {
    this.scope = scope;
    if (scope === 'off') for (const st of this.states.values()) this.hideState(st);
  }

  /** Create a pill and append it to `parent` (the person's .wo-p column). Returns the root element. */
  add(personId: string, parent: HTMLElement): HTMLElement {
    this.remove(personId);
    const pill = createProgressPill(parent.ownerDocument ?? document);
    parent.insertBefore(pill.root, parent.firstChild);
    this.states.set(personId, {
      pill, actionId: null, lastFraction: 0, lastStatus: null, lastIcon: 'clock', lastLabel: '',
      ending: null, endingUntil: 0, lastSample: -Infinity, lastWrite: -Infinity, lastKind: '', shown: false,
    });
    return pill.root;
  }

  remove(personId: string): void {
    const st = this.states.get(personId);
    if (!st) return;
    st.pill.root.remove();
    this.states.delete(personId);
  }

  clear(): void {
    for (const id of [...this.states.keys()]) this.remove(id);
  }

  /** Hide a pill without forgetting its progress (used for off-screen people). */
  hide(personId: string): void {
    const st = this.states.get(personId);
    if (st) this.hideState(st);
  }

  /**
   * Sample one person and update their pill. Returns true while the pill is visible. Calls for off-screen people
   * should use `hide()` instead, so the DOM is not touched.
   */
  update(personId: string, state: WorldState, person: Person, content: ContentDB | undefined, onScreen: boolean): boolean {
    const st = this.states.get(personId);
    if (!st) return false;
    const now = this.now();
    if (!onScreen || this.scope === 'off') {
      this.hideState(st);
      return false;
    }

    const progress = actionProgress(state, person, content);
    const inScope = progress !== null && (this.scope === 'all' || person.householdId === state.activeHouseholdId);

    if (!inScope) {
      if (progress === null && st.actionId !== null) {
        // The action ended between samples: a near-complete action gets the check, anything else fades grey.
        const kind = st.lastStatus === 'done' || st.lastFraction >= 1 ? 'done' : 'cancelled';
        this.startEnding(st, kind, now);
        st.actionId = null;
      }
      if (st.ending && now < st.endingUntil) {
        const visual = this.endingVisual(st);
        this.write(st, visual, now, now > st.endingUntil - 250, false);
        return true;
      }
      this.hideState(st);
      return false;
    }

    // Throttle action sampling to 10 Hz, but never miss a completion/cancel transition.
    const force = progress.done || progress.status === 'cancelled' || progress.status === 'failed';
    if (!force && now - st.lastSample < 100) {
      if (st.shown) return true;
    }
    st.lastSample = now;

    if (progress.actionId !== st.actionId) {
      st.actionId = progress.actionId;
      st.lastFraction = 0;
      st.ending = null;
      st.endingUntil = 0;
      st.lastKind = '';
    }
    st.lastFraction = monotonicFraction(st.lastFraction, progress.fraction);
    st.lastStatus = progress.status;
    st.lastIcon = progress.icon;
    st.lastLabel = progress.label;

    if (progress.status === 'cancelled' || progress.status === 'failed') {
      this.startEnding(st, 'cancelled', now);
    } else if (progress.done) {
      this.startEnding(st, 'done', now);
    } else if (st.ending && now >= st.endingUntil) {
      st.ending = null;
    }

    const visual = progress.done
      ? pillVisual({ ...progress, fraction: 1, status: 'done', done: true })
      : pillVisual({ ...progress, fraction: st.lastFraction }, st.lastFraction, st.ending);
    this.write(st, visual, now, false, true);
    return true;
  }

  private startEnding(st: PillState, kind: 'done' | 'cancelled', now: number): void {
    st.ending = kind;
    st.endingUntil = now + ENDING_MS;
  }

  private endingVisual(st: PillState): PillVisual {
    if (st.ending === 'done') {
      return { visible: true, kind: 'done', fraction: 1, color: GREEN_COLOR, checked: true, walking: false, icon: 'check', label: 'Done' };
    }
    return {
      visible: true, kind: 'cancelled', fraction: st.lastFraction, color: CANCELLED_COLOR,
      checked: false, walking: false, icon: st.lastIcon, label: st.lastLabel || 'Stopped',
    };
  }

  private write(st: PillState, visual: PillVisual, now: number, fading: boolean, running: boolean): void {
    const kindKey = `${visual.kind}:${visual.checked}:${visual.walking}:${fading}`;
    const changed = kindKey !== st.lastKind || !st.shown;
    if (!changed && running && now - st.lastWrite < 100) return;
    if (!running && !changed && now - st.lastWrite < 100) return;
    st.lastWrite = now;
    st.lastKind = kindKey;
    st.shown = true;
    applyPill(st.pill, visual, fading);
  }

  private hideState(st: PillState): void {
    if (st.shown) { st.pill.root.hidden = true; st.shown = false; }
    st.ending = null;
    st.endingUntil = 0;
    st.lastKind = '';
  }
}
