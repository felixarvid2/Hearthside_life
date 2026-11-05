// DOM test for the Milestone 11.5 progress pill. jsdom is not a dependency of this repository (and installing a
// package is not possible from this session), so this file drives the module through a tiny DOM stub that implements
// exactly the surface progressPills uses: createElement/append/insertBefore/remove, classList, style, dataset,
// setAttribute and hidden. The rendered DOM logic (fill width, classes, check, scope) is the real production code.

import { describe, expect, it } from 'vitest';
import type { ActionInstance, Person, WorldState } from '../../../src/core/types';
import { applyPill, createProgressPill, ProgressPills, pillVisual } from '../../../src/render/progressPills';
import { buildWorld, setNeeds } from '../sim/fixtures';

interface FakeClassList {
  add(name: string): void;
  remove(name: string): void;
  contains(name: string): boolean;
  toggle(name: string, force?: boolean): boolean;
}

class FakeEl {
  readonly tagName: string;
  className = '';
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly attrs: Record<string, string> = {};
  hidden = false;
  innerHTML = '';
  textContent = '';
  title = '';
  id = '';
  readonly children: FakeEl[] = [];
  parent: FakeEl | null = null;
  readonly ownerDocument: FakeDoc;
  readonly classList: FakeClassList;

  constructor(tagName: string, doc: FakeDoc) {
    this.tagName = tagName;
    this.ownerDocument = doc;
    const el = this;
    this.classList = {
      add(name) { const s = new Set(el.className.split(' ').filter(Boolean)); s.add(name); el.className = [...s].join(' '); },
      remove(name) { const s = new Set(el.className.split(' ').filter(Boolean)); s.delete(name); el.className = [...s].join(' '); },
      contains(name) { return el.className.split(' ').includes(name); },
      toggle(name, force) {
        const s = new Set(el.className.split(' ').filter(Boolean));
        const on = force === undefined ? !s.has(name) : force;
        if (on) s.add(name); else s.delete(name);
        el.className = [...s].join(' ');
        return on;
      },
    };
  }

  append(...nodes: FakeEl[]): void { for (const n of nodes) this.insertBefore(n, null); }
  appendChild(node: FakeEl): FakeEl { return this.insertBefore(node, null); }
  insertBefore(node: FakeEl, ref: FakeEl | null): FakeEl {
    node.parent?.remove();
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(node); else this.children.splice(i, 0, node);
    node.parent = this;
    return node;
  }
  remove(): void {
    if (!this.parent) return;
    const i = this.parent.children.indexOf(this);
    if (i >= 0) this.parent.children.splice(i, 1);
    this.parent = null;
  }
  setAttribute(name: string, value: string): void { this.attrs[name] = value; }
  getAttribute(name: string): string | null { return this.attrs[name] ?? null; }
}

class FakeDoc {
  readonly head: FakeEl;
  readonly body: FakeEl;
  constructor() {
    this.head = new FakeEl('head', this);
    this.body = new FakeEl('body', this);
  }
  createElement(tag: string): FakeEl { return new FakeEl(tag, this); }
}

const fakeDoc = new FakeDoc();
const newPill = () => createProgressPill(fakeDoc as unknown as Document);

function personWithAction(interactionId: string, over: Partial<ActionInstance> = {}): { state: WorldState; p: Person } {
  const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
  setNeeds(w.state, w.mira, 60);
  const a: ActionInstance = {
    id: 'act_pill', interactionId, actorId: w.mira, source: 'player', target: { kind: 'self' }, phase: 'perform',
    phaseSince: 0, route: [], elapsed: 15, duration: 60, replans: 0, failureReason: null, data: {},
    cancelRequested: false, queuedAt: 0, ...over,
  };
  w.state.people[w.mira]!.queue = [a];
  return { state: w.state, p: w.state.people[w.mira]! };
}

describe('progress pill DOM', () => {
  it('renders a hidden pill with an icon, a fill and a check', () => {
    const pill = newPill();
    const root = pill.root as unknown as FakeEl;
    expect(pill.root.hidden).toBe(true);
    expect(pill.root.className).toContain('wo-pill');
    expect(root.children).toHaveLength(3);
    expect(root.children[0]).toBe(pill.icon);
    expect(root.children[2]).toBe(pill.check);
    // the track is the middle child and holds the fill
    const track = root.children[1]!;
    expect(track.className).toContain('wo-pill-track');
    expect(track.children[0]).toBe(pill.fill);
    expect(fakeDoc.head.children.some((s) => s.id === 'wo-pill-css')).toBe(true);
  });

  it('updates the fill width, colour, aria value and icon as the action runs', () => {
    const pill = newPill();
    applyPill(pill, pillVisual({
      actionId: 'a', fraction: 0.3, icon: 'watchTv', label: 'Watch TV', done: false, status: 'running',
      walking: false, phase: 'perform',
    }));
    expect(pill.root.hidden).toBe(false);
    expect(pill.fill.style.width).toBe('30%');
    expect(pill.fill.style.backgroundColor).toContain('hsl(');
    expect(pill.root.getAttribute('aria-valuenow')).toBe('30');
    expect(pill.root.getAttribute('aria-label')).toBe('Watch TV 30%');
    expect(pill.icon.dataset.icon).toBe('watchTv');
    expect(pill.icon.innerHTML).toContain('<svg');
    expect(pill.root.classList.contains('is-done')).toBe(false);
  });

  it('shows the check and the green fill on completion', () => {
    const pill = newPill();
    applyPill(pill, pillVisual({
      actionId: 'a', fraction: 1, icon: 'watchTv', label: 'Watch TV', done: true, status: 'done',
      walking: false, phase: 'cleanup',
    }));
    expect(pill.root.classList.contains('is-done')).toBe(true);
    expect(pill.fill.style.width).toBe('100%');
    expect(pill.root.getAttribute('aria-label')).toBe('Watch TV complete');
    // The check itself fades in via the CSS class on the root; its SVG is already in the DOM.
    expect(pill.check.innerHTML).toContain('<svg');
  });

  it('greys a cancelled action and keeps the fraction where it stopped', () => {
    const pill = newPill();
    applyPill(pill, {
      visible: true, kind: 'cancelled', fraction: 0.4, color: 'var(--ink-3, #8a7f74)',
      checked: false, walking: false, icon: 'watchTv', label: 'Watch TV',
    });
    expect(pill.root.classList.contains('is-cancelled')).toBe(true);
    expect(pill.fill.style.width).toBe('40%');
    expect(pill.check.innerHTML).toContain('<svg');
  });
});

describe('ProgressPills controller', () => {
  it('samples at most 10 times a second and clamps the fill while one action runs', () => {
    let now = 1000;
    const pills = new ProgressPills(() => now);
    const parent = fakeDoc.createElement('div');
    pills.add('p1', parent as unknown as HTMLElement);
    const { state, p } = personWithAction('watchTv', { elapsed: 18, duration: 60 });
    expect(pills.update('p1', state, p, undefined, true)).toBe(true);
    const root = parent.children[0] as FakeEl;
    const fill = root.children[1]!.children[0]!;
    expect(fill.style.width).toBe('30%');

    // 50 ms later the action is further along, but the pill only writes at 10 Hz.
    now += 50;
    p.queue[0]!.elapsed = 30;
    pills.update('p1', state, p, undefined, true);
    expect(fill.style.width).toBe('30%');

    // After 100 ms it updates.
    now += 60;
    pills.update('p1', state, p, undefined, true);
    expect(fill.style.width).toBe('50%');

    // A smaller fraction (a replanned/loaded action) must not make it go backwards.
    now += 110;
    p.queue[0]!.elapsed = 24;
    pills.update('p1', state, p, undefined, true);
    expect(fill.style.width).toBe('50%');

    // A new action resets the clamp (progress from 0 again).
    p.queue[0] = { ...p.queue[0]!, id: 'act_next', elapsed: 3 };
    now += 120;
    pills.update('p1', state, p, undefined, true);
    expect(fill.style.width).toBe('5%');
  });

  it('hides pills for off-screen people and in the off scope', () => {
    let now = 0;
    const pills = new ProgressPills(() => now);
    const parent = fakeDoc.createElement('div');
    pills.add('p1', parent as unknown as HTMLElement);
    const { state, p } = personWithAction('watchTv');
    expect(pills.update('p1', state, p, undefined, false)).toBe(false);
    expect(parent.children[0]!.hidden).toBe(true);
    expect(pills.update('p1', state, p, undefined, true)).toBe(true);
    expect(parent.children[0]!.hidden).toBe(false);
    pills.setScope('off');
    expect(parent.children[0]!.hidden).toBe(true);
    expect(pills.update('p1', state, p, undefined, true)).toBe(false);
  });

  it('household scope excludes people outside the active household, all includes them', () => {
    const pills = new ProgressPills(() => 0);
    const parent = fakeDoc.createElement('div');
    pills.add('p1', parent as unknown as HTMLElement);
    const { state, p } = personWithAction('watchTv');
    p.householdId = 'other';
    expect(pills.update('p1', state, p, undefined, true)).toBe(false);
    pills.setScope('all');
    expect(pills.update('p1', state, p, undefined, true)).toBe(true);
  });
});
