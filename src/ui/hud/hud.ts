// Live/Buy/Build HUD: top bar (menu, day and time, speed, funds), household strip, mode bar, feed button and
// camera controls. Portrait: compact top bar, strip row under it, bottom bar with modes, floating camera
// cluster. Landscape/desktop: top bar and a bottom HUD bar (strip, modes, camera). Nodes are re-parented when
// the orientation changes so state (selection, open panel) is kept.

import type { CutawayMode, GameMode } from '../../game/api';
import { DAY_NAMES, dayIndex, formatClock, formatDay, weekday, type Speed } from '../../core/clock';
import { SEASON_NAMES, dayWithinSeason, seasonFor } from '../../core/season';
import { formatMoney, formatMoneyShort } from '../../core/money';
import { activeHousehold } from '../../core/state';
import type { Season, WeatherKind } from '../../core/types';
import { WEATHER_NAMES, currentWeather } from '../../sim/weather';
import { h, setText, toggleClass } from '../kit/dom';
import { icon } from '../kit/icons';
import { layout, onLayoutChange } from '../kit/layout';
import { tripFromState, tripView } from './neighbourhoodModel';
import { createLevelSelector } from './levelSelector';
import { createStrip } from './strip';
import type { Shell } from './shell';

const SPEEDS: Array<{ s: Speed; icon: string; label: string }> = [
  { s: 0, icon: 'pause', label: 'Pause' },
  { s: 1, icon: 'play', label: 'Normal speed' },
  { s: 2, icon: 'fast', label: 'Fast' },
  { s: 3, icon: 'faster', label: 'Very fast' },
];

const SEASON_ICONS: Record<Season, string> = { spring: 'leaf', summer: 'sun', autumn: 'leaf', winter: 'snow' };
const WEATHER_ICONS: Record<WeatherKind, string> = { clear: 'sun', cloudy: 'cloud', rain: 'rain', snow: 'snow' };

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
  /** Re-reads the trip under way (the "on the way" chip). */
  onTrip(): void;
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
  // Milestone 12: season + weather chip in the clock area ("Autumn, day 3 - Rain"); the text is hidden in the tight
  // portrait bar, where the two icons and the title/aria-label carry the information.
  const seasonIcon = h('span', { class: 'clock-sky-icon clock-season-icon' });
  const weatherIcon = h('span', { class: 'clock-sky-icon clock-weather-icon' });
  const skyText = h('span', { class: 'clock-sky-text' });
  const sky = h('span', { class: 'clock-sky' }, seasonIcon, weatherIcon, skyText);
  const clock = h('div', { class: 'clock', role: 'timer', attrs: { 'aria-live': 'off' } }, timeEl, dayEl, sky, pausedTag);
  const speedBtns = SPEEDS.map((sp) => {
    const b = h('button', { type: 'button', class: 'speed-btn', ariaLabel: sp.label, title: `${sp.label} (${sp.s === 0 ? 'Space' : sp.s})`, dataset: { speed: String(sp.s) } }, icon(sp.icon, 20));
    b.addEventListener('click', () => { api.setSpeed(sp.s); sh.sound('click'); });
    return b;
  });
  const speedGroup = h('div', { class: 'speed', role: 'group', ariaLabel: 'Game speed' }, ...speedBtns);
  const pausedNote = h('div', { class: 'paused-note', role: 'status' }, icon('pause', 16), h('span', { class: 'paused-text' }));
  pausedNote.hidden = true;
  // Two spellings of the amount: the full one, and whole dollars for narrow bars (phone landscape; CSS picks one).
  const fundsFull = h('span', { class: 'funds-full' });
  const fundsShort = h('span', { class: 'funds-short' });
  const fundsAmount = h('span', { class: 'funds-amount' }, fundsFull, fundsShort);
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

  const mapBtn = h('button', { type: 'button', class: ['hud-btn', 'map-btn'], ariaLabel: 'Neighbourhood map', title: 'Neighbourhood map' }, icon('map', 22), h('span', { class: 'hud-btn-label', text: 'Map' }));
  mapBtn.addEventListener('click', () => { sh.sound('open'); sh.openNeighbourhood(); });

  // ---- trip chip: shown while a group is on the way to another lot ----
  const tripTitle = h('span', { class: 'trip-title' });
  const tripSub = h('span', { class: 'trip-sub' });
  const tripChip = h('button', { type: 'button', class: ['hud-trip', 'hud-box'], ariaLabel: 'Trip under way. Open the map' }, icon('car', 22), h('span', { class: 'trip-text' }, tripTitle, tripSub));
  tripChip.hidden = true;
  tripChip.addEventListener('pointerdown', (e) => e.stopPropagation());
  tripChip.addEventListener('click', () => { sh.sound('open'); sh.openNeighbourhood(); });
  let lastTrip = '';

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
  // Milestone 9: roofs on or off (they only draw with the walls up, or while a roof tool is open in Build)
  const roofBtn = toolBtn({ icon: 'roof', label: 'Roof', className: 'roof-btn', onClick: () => {
    api.view.setRoofsVisible?.(!(api.view.roofsVisible?.() ?? true));
    sh.sound('toggle');
    onCamera();
  } });
  roofBtn.hidden = !api.view.setRoofsVisible;
  const centreBtn = toolBtn({ icon: 'center', label: 'Centre', className: 'centre-btn', onClick: () => { const id = api.selected(); if (id) { api.view.focusPerson(id); sh.sound('click'); } } });
  const zoomAtCentre = (f: number) => {
    const c = document.getElementById('game-canvas')?.getBoundingClientRect();
    api.view.zoomAt(f, (c?.width ?? window.innerWidth) / 2, (c?.height ?? window.innerHeight) / 2);
  };
  // Milestone 9: the floor selector (src/ui/hud/levelSelector.ts)
  const levelSel = createLevelSelector(api, (id) => sh.sound(id));
  const camBtns = [
    toolBtn({ icon: 'rotateLeft', label: 'Turn left', onClick: () => { api.view.rotate(-1); sh.sound('click'); } }),
    toolBtn({ icon: 'rotateRight', label: 'Turn right', onClick: () => { api.view.rotate(1); sh.sound('click'); } }),
    toolBtn({ icon: 'zoomIn', label: 'Zoom in', onClick: () => { zoomAtCentre(1.25); sh.sound('click'); } }),
    toolBtn({ icon: 'zoomOut', label: 'Zoom out', onClick: () => { zoomAtCentre(0.8); sh.sound('click'); } }),
    wallsBtn,
    roofBtn,
    centreBtn,
  ];
  const camGroup = h('div', { class: 'camera-bar', role: 'group', ariaLabel: 'Camera' }, ...camBtns);

  // ---- containers ----
  const topBar = h('header', { class: 'hud-top hud-box' });
  const row2 = h('div', { class: 'hud-row2' });
  const bottomBar = h('nav', { class: 'hud-bottom hud-box', ariaLabel: 'Modes and camera' });
  const cluster = h('div', { class: 'camera-cluster hud-box' });
  const el = h('div', { class: 'hud' }, topBar, row2, bottomBar, cluster, tripChip);
  for (const n of [topBar, row2, bottomBar, cluster]) n.addEventListener('pointerdown', (e) => e.stopPropagation());

  let portraitLayout: boolean | null = null;
  const arrange = () => {
    const portrait = layout().portrait;
    if (portrait === portraitLayout) return;
    portraitLayout = portrait;
    const spacer = () => h('div', { class: 'hud-spacer' });
    if (portrait) {
      // the floor selector is the last of the camera cluster: it stays on screen above an open sheet when the rest does not fit (hud.css)
      camGroup.append(levelSel.el);
      topBar.replaceChildren(menuBtn, clock, spacer(), speedGroup, pausedNote);
      row2.replaceChildren(strip.el, spacer(), fundsBtn);
      bottomBar.replaceChildren(modeBar, spacer(), mapBtn, feedBtn);
      cluster.replaceChildren(camGroup);
      row2.hidden = false;
      cluster.hidden = false;
    } else {
      // landscape: the floor selector sits in the top bar (the bottom bar is full with the member strip, modes and camera)
      topBar.replaceChildren(menuBtn, clock, speedGroup, pausedNote, levelSel.el, spacer(), mapBtn, feedBtn, fundsBtn);
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
  let lastSky = '';
  let lastFunds = '';
  let lastUnread = -1;
  const refresh = () => {
    const st = api.state();
    if (!st) return;
    const m = st.clock.minutes;
    const portrait = !!portraitLayout;
    const ck = `${Math.floor(m)}|${portrait}`;
    const season = seasonFor(m, st.settings);
    const weather = currentWeather(st);
    const skyKey = `${season}|${dayWithinSeason(m, st.settings)}|${weather}|${st.settings.seasons}|${st.settings.weather}|${portrait}`;
    if (ck !== lastClock || skyKey !== lastSky) {
      const dayInSeason = dayWithinSeason(m, st.settings);
      const label = st.settings.weather === false
        ? `${SEASON_NAMES[season]}, day ${dayInSeason} - Weather off`
        : `${SEASON_NAMES[season]}, day ${dayInSeason} - ${WEATHER_NAMES[weather]}`;
      setText(timeEl, formatClock(m));
      setText(dayEl, portrait ? `${(DAY_NAMES[weekday(m)] ?? '').slice(0, 3)} · Day ${dayIndex(m) + 1}` : formatDay(m));
      setText(skyText, label);
      sky.title = label;
      sky.setAttribute('aria-label', label);
      if (skyKey !== lastSky) {
        lastSky = skyKey;
        seasonIcon.replaceChildren(icon(SEASON_ICONS[season], 16));
        weatherIcon.replaceChildren(icon(WEATHER_ICONS[weather], 16));
      }
      clock.setAttribute('aria-label', `${formatDay(m)}, ${formatClock(m)}. ${label}`);
      lastClock = ck;
    }
    const hh = activeHousehold(st);
    const fk = `${hh?.funds ?? 0}|${st.settings.unlimitedFunds}`;
    if (fk !== lastFunds) {
      lastFunds = fk;
      setText(fundsFull, formatMoney(hh?.funds ?? 0));
      setText(fundsShort, formatMoneyShort(hh?.funds ?? 0));
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
    updateTrip();
  };

  const updateTrip = () => {
    const st = api.state();
    const trip = st && mode === 'live' ? tripView(tripFromState(st), st.clock.minutes, (id) => st.people[id]?.firstName ?? 'Someone') : null;
    const k = trip ? `${trip.title}|${trip.who}|${trip.arrivesText}|${Math.floor(trip.minutesLeft / 5)}` : '';
    if (k === lastTrip) return;
    lastTrip = k;
    tripChip.hidden = !trip;
    if (trip) {
      setText(tripTitle, trip.title);
      setText(tripSub, `${trip.who} · arrives ${trip.arrivesText}`);
      tripChip.setAttribute('aria-label', `${trip.title}, ${trip.who}, arrives ${trip.arrivesText}. Open the map`);
    }
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
    const roofsOn = api.view.roofsVisible?.() ?? true;
    roofBtn.setAttribute('aria-pressed', String(roofsOn));
    toggleClass(roofBtn, 'is-active', roofsOn);
    const rt = roofsOn ? 'Roofs shown when the walls are up (tap to hide)' : 'Roofs hidden (tap to show)';
    roofBtn.setAttribute('aria-label', rt);
    roofBtn.title = rt;
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
    mapBtn.disabled = m !== 'live';
    mapBtn.title = m === 'live' ? 'Neighbourhood map' : 'Return to Live mode to use the map';
    lastTrip = '';
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
    onTrip: () => { updateTrip(); },
    resetFeed: () => { feedSeen = null; lastTrip = ''; },
    destroy: () => { unsubLayout(); el.remove(); },
  };
}
