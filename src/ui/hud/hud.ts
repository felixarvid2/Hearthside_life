// Live/Buy/Build HUD: top bar (menu, day and time, speed, funds), household strip, mode bar, feed button and
// camera controls. Portrait: compact top bar, strip row under it, bottom bar with modes, floating camera
// cluster. Landscape/desktop: top bar and a bottom HUD bar (strip, modes, camera). Nodes are re-parented when
// the orientation changes so state (selection, open panel) is kept.

import type { CutawayMode, GameMode } from '../../game/api';
import { DAY_NAMES, dayIndex, formatClock, formatDay, weekday, type Speed } from '../../core/clock';
import { formatMoney } from '../../core/money';
import { activeHousehold } from '../../core/state';
import { h, setText, toggleClass } from '../kit/dom';
import { icon } from '../kit/icons';
import { layout, onLayoutChange } from '../kit/layout';
import { createStrip } from './strip';
import type { Shell } from './shell';

const SPEEDS: Array<{ s: Speed; icon: string; label: string }> = [
  { s: 0, icon: 'pause', label: 'Pause' },
  { s: 1, icon: 'play', label: 'Normal speed' },
  { s: 2, icon: 'fast', label: 'Fast' },
  { s: 3, icon: 'faster', label: 'Very fast' },
];

const CUTAWAY: Record<CutawayMode, { icon: string; label: string; next: CutawayMode }> = {
  up: { icon: 'wallsUp', label: 'Walls up', next: 'cutaway' },
  cutaway: { icon: 'wallsCut', label: 'Cutaway', next: 'down' },
  down: { icon: 'wallsDown', label: 'Walls down', next: 'up' },
};

export interface Hud {
  el: HTMLElement;
  /** Elements that cover the canvas edges (for insets). */
  covers(): HTMLElement[];
  setMode(m: GameMode): void;
  refresh(): void;
  onSpeed(): void;
  onCamera(): void;
  onSelection(): void;
  onPortraits(): void;
  markFeedSeen(): void;
  /** Reflects which shell panel is open on the feed and funds buttons. */
  setOpenPanel(kind: 'person' | 'feed' | 'ledger' | 'bills' | null): void;
  resetFeed(): void;
  destroy(): void;
}

function hudButton(o: { icon: string; label: string; showLabel?: boolean; className?: string; onClick: () => void }): HTMLButtonElement {
  const b = h('button', { type: 'button', class: ['hud-btn', o.className], ariaLabel: o.label, title: o.label }, icon(o.icon, 22));
  if (o.showLabel) b.appendChild(h('span', { class: 'hud-btn-label', text: o.label }));
  b.addEventListener('click', o.onClick);
  return b;
}

function toolBtn(o: { icon: string; label: string; onClick: () => void; className?: string }): HTMLButtonElement {
  const lbl = h('span', { class: 'tool-label', text: o.label });
  const b = h('button', { type: 'button', class: ['tool-btn', 'hud-tool', o.className], ariaLabel: o.label, title: o.label }, icon(o.icon), lbl);
  b.addEventListener('click', o.onClick);
  return b;
}

export function createHud(sh: Shell): Hud {
  const { api } = sh;
  let mode: GameMode = api.mode();
  /** Id of the newest feed entry the player has seen; null until the first refresh. */
  let feedSeen: string | null = null;

  // ---- top bar ----
  const menuBtn = hudButton({ icon: 'menu', label: 'Menu', showLabel: true, className: 'menu-btn', onClick: () => { sh.sound('open'); sh.openGameMenu(); } });
  const timeEl = h('span', { class: 'clock-time' });
  const dayEl = h('span', { class: 'clock-day' });
  const pausedTag = h('span', { class: 'clock-paused', text: 'Paused' });
  const clock = h('div', { class: 'clock', role: 'timer', attrs: { 'aria-live': 'off' } }, timeEl, dayEl, pausedTag);
  const speedBtns = SPEEDS.map((sp) => {
    const b = h('button', { type: 'button', class: 'speed-btn', ariaLabel: sp.label, title: `${sp.label} (${sp.s === 0 ? 'Space' : sp.s})`, dataset: { speed: String(sp.s) } }, icon(sp.icon, 20));
    b.addEventListener('click', () => { api.setSpeed(sp.s); sh.sound('click'); });
    return b;
  });
  const speedGroup = h('div', { class: 'speed', role: 'group', ariaLabel: 'Game speed' }, ...speedBtns);
  const pausedNote = h('div', { class: 'paused-note', role: 'status' }, icon('pause', 16), h('span', { class: 'paused-text' }));
  pausedNote.hidden = true;
  const fundsAmount = h('span', { class: 'funds-amount' });
  const fundsTag = h('span', { class: 'funds-tag', text: 'Free building' });
  fundsTag.hidden = true;
  const fundsBtn = h('button', { type: 'button', class: 'funds-btn' }, icon('money', 20), h('span', { class: 'funds-text' }, fundsAmount, fundsTag));
  fundsBtn.addEventListener('click', () => {
    if (sh.isPanelOpen('ledger')) { sh.closePanels(); sh.sound('close'); } else { sh.openPanel('ledger'); sh.sound('open'); }
  });
  const feedBadge = h('span', { class: 'badge feed-badge' });
  feedBadge.hidden = true;
  const feedBtn = h('button', { type: 'button', class: ['hud-btn', 'feed-btn'], ariaLabel: 'Event feed', title: 'Event feed' }, icon('bell', 22), h('span', { class: 'hud-btn-label', text: 'Feed' }), feedBadge);
  feedBtn.addEventListener('click', () => {
    if (sh.isPanelOpen('feed')) { sh.closePanels(); sh.sound('close'); } else { sh.openPanel('feed'); sh.sound('open'); }
  });

  // ---- strip ----
  const strip = createStrip(sh);

  // ---- mode bar ----
  const modeBtns = (['live', 'buy', 'build'] as const).map((m) => {
    const b = toolBtn({ icon: m, label: m === 'live' ? 'Live' : m === 'buy' ? 'Buy' : 'Build', className: 'mode-btn', onClick: () => {
      if (api.mode() === m || !api.state()) return;
      sh.closeContextMenu();
      api.setMode(m);
      sh.sound('toggle');
    } });
    b.dataset.mode = m;
    return b;
  });
  const modeBar = h('div', { class: 'mode-bar', role: 'group', ariaLabel: 'Game mode' }, ...modeBtns);

  // ---- camera ----
  const wallsBtn = toolBtn({ icon: 'wallsCut', label: 'Cutaway', className: 'walls-btn', onClick: () => { api.view.setCutaway(CUTAWAY[api.view.cutaway()].next); sh.sound('toggle'); onCamera(); } });
  const centreBtn = toolBtn({ icon: 'center', label: 'Centre', className: 'centre-btn', onClick: () => { const id = api.selected(); if (id) { api.view.focusPerson(id); sh.sound('click'); } } });
  const zoomAtCentre = (f: number) => {
    const c = document.getElementById('game-canvas')?.getBoundingClientRect();
    api.view.zoomAt(f, (c?.width ?? window.innerWidth) / 2, (c?.height ?? window.innerHeight) / 2);
  };
  const camBtns = [
    toolBtn({ icon: 'rotateLeft', label: 'Turn left', onClick: () => { api.view.rotate(-1); sh.sound('click'); } }),
    toolBtn({ icon: 'rotateRight', label: 'Turn right', onClick: () => { api.view.rotate(1); sh.sound('click'); } }),
    toolBtn({ icon: 'zoomIn', label: 'Zoom in', onClick: () => { zoomAtCentre(1.25); sh.sound('click'); } }),
    toolBtn({ icon: 'zoomOut', label: 'Zoom out', onClick: () => { zoomAtCentre(0.8); sh.sound('click'); } }),
    wallsBtn,
    centreBtn,
  ];
  const camGroup = h('div', { class: 'camera-bar', role: 'group', ariaLabel: 'Camera' }, ...camBtns);

  // ---- containers ----
  const topBar = h('header', { class: 'hud-top hud-box' });
  const row2 = h('div', { class: 'hud-row2' });
  const bottomBar = h('nav', { class: 'hud-bottom hud-box', ariaLabel: 'Modes and camera' });
  const cluster = h('div', { class: 'camera-cluster hud-box' });
  const el = h('div', { class: 'hud' }, topBar, row2, bottomBar, cluster);
  for (const n of [topBar, row2, bottomBar, cluster]) n.addEventListener('pointerdown', (e) => e.stopPropagation());

  let portraitLayout: boolean | null = null;
  const arrange = () => {
    const portrait = layout().portrait;
    if (portrait === portraitLayout) return;
    portraitLayout = portrait;
    const spacer = () => h('div', { class: 'hud-spacer' });
    if (portrait) {
      topBar.replaceChildren(menuBtn, clock, spacer(), speedGroup, pausedNote);
      row2.replaceChildren(strip.el, spacer(), fundsBtn);
      bottomBar.replaceChildren(modeBar, spacer(), feedBtn);
      cluster.replaceChildren(camGroup);
      row2.hidden = false;
      cluster.hidden = false;
    } else {
      topBar.replaceChildren(menuBtn, clock, speedGroup, pausedNote, spacer(), feedBtn, fundsBtn);
      bottomBar.replaceChildren(strip.el, modeBar, camGroup);
      row2.replaceChildren();
      row2.hidden = true;
      cluster.replaceChildren();
      cluster.hidden = true;
    }
    lastClock = '';
    refresh();
    sh.requestLayout();
  };

  // ---- updates ----
  let lastClock = '';
  let lastFunds = '';
  let lastUnread = -1;
  const refresh = () => {
    const st = api.state();
    if (!st) return;
    const m = st.clock.minutes;
    const portrait = !!portraitLayout;
    const ck = `${Math.floor(m)}|${portrait}`;
    if (ck !== lastClock) {
      lastClock = ck;
      setText(timeEl, formatClock(m));
      setText(dayEl, portrait ? `${(DAY_NAMES[weekday(m)] ?? '').slice(0, 3)} · Day ${dayIndex(m) + 1}` : formatDay(m));
      clock.setAttribute('aria-label', `${formatDay(m)}, ${formatClock(m)}`);
    }
    const hh = activeHousehold(st);
    const fk = `${hh?.funds ?? 0}|${st.settings.unlimitedFunds}`;
    if (fk !== lastFunds) {
      lastFunds = fk;
      setText(fundsAmount, formatMoney(hh?.funds ?? 0));
      fundsTag.hidden = !st.settings.unlimitedFunds;
      const label = `Household funds ${formatMoney(hh?.funds ?? 0)}${st.settings.unlimitedFunds ? ', unlimited building funds' : ''}. Open the ledger`;
      fundsBtn.setAttribute('aria-label', label);
      fundsBtn.title = label;
    }
    // feed badge
    const newest = st.feed[st.feed.length - 1]?.id ?? '';
    if (feedSeen === null) feedSeen = newest;
    const idx = feedSeen ? st.feed.findIndex((f) => f.id === feedSeen) : -1;
    const unread = sh.isPanelOpen('feed') ? 0 : !feedSeen ? st.feed.length : idx < 0 ? Math.min(st.feed.length, 10) : st.feed.length - 1 - idx;
    if (sh.isPanelOpen('feed')) feedSeen = newest;
    if (unread !== lastUnread) {
      lastUnread = unread;
      setText(feedBadge, unread > 9 ? '9+' : String(unread));
      feedBadge.hidden = unread <= 0;
      feedBtn.setAttribute('aria-label', unread > 0 ? `Event feed, ${unread} new` : 'Event feed');
    }
    if (mode === 'live') strip.refresh();
    updateCentre();
  };

  const onSpeed = () => {
    const s = api.speed();
    const editing = mode === 'buy' || mode === 'build';
    for (const b of speedBtns) {
      const on = Number(b.dataset.speed) === s && !editing;
      toggleClass(b, 'is-active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    speedGroup.hidden = editing;
    pausedNote.hidden = !editing;
    setText(pausedNote.querySelector('.paused-text') as HTMLElement, mode === 'buy' ? 'Paused while shopping' : 'Paused while building');
    toggleClass(clock, 'is-paused', s === 0 && !editing);
    clock.dataset.paused = s === 0 ? 'true' : 'false';
  };

  const onCamera = () => {
    const c = CUTAWAY[api.view.cutaway()] ?? CUTAWAY.cutaway;
    const lbl = wallsBtn.querySelector('.tool-label') as HTMLElement;
    if (lbl.textContent !== c.label) {
      setText(lbl, c.label);
      wallsBtn.replaceChild(icon(c.icon), wallsBtn.firstChild!);
      const t = `${c.label} (tap for ${CUTAWAY[c.next].label.toLowerCase()})`;
      wallsBtn.setAttribute('aria-label', t);
      wallsBtn.title = t;
    }
  };

  const updateCentre = () => {
    const id = api.selected();
    const p = id ? api.state()?.people[id] : undefined;
    centreBtn.disabled = !p || p.location.kind !== 'lot';
  };

  const setMode = (m: GameMode) => {
    mode = m;
    el.dataset.mode = m;
    for (const b of modeBtns) {
      const on = b.dataset.mode === m;
      toggleClass(b, 'is-active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    strip.el.hidden = m !== 'live';
    onSpeed();
    refresh();
    sh.requestLayout();
  };

  const unsubLayout = onLayoutChange(arrange);
  arrange();
  setMode(mode);
  onCamera();

  return {
    el,
    covers: () => [topBar, row2, bottomBar].filter((n) => !n.hidden && n.childElementCount > 0),
    setMode,
    refresh,
    onSpeed,
    onCamera,
    onSelection: () => { strip.refresh(); updateCentre(); },
    onPortraits: () => strip.refreshPortraits(),
    markFeedSeen: () => { feedSeen = api.state()?.feed.at(-1)?.id ?? ''; refresh(); },
    setOpenPanel: (kind) => {
      feedBtn.setAttribute('aria-expanded', String(kind === 'feed'));
      fundsBtn.setAttribute('aria-expanded', String(kind === 'ledger' || kind === 'bills'));
    },
    resetFeed: () => { feedSeen = null; },
    destroy: () => { unsubLayout(); el.remove(); },
  };
}
