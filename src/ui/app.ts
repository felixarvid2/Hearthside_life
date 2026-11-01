// UI shell root: routes by api.mode() (boot -> menu -> creator -> live/buy/build), mounts the HUD, the mode
// panels (Buy/Build, from other modules), the creator and the wardrobe, shows toasts, applies settings and
// reports covered screen areas to api.view.setInsets so the camera keeps the focus visible.

import './styles/base.css';
import './styles/screens.css';
import './styles/hud.css';
import './styles/social.css';
import type { GameAPI, GameMode, SoundId } from '../game/api';
import type { HouseholdDraft } from '../core/drafts';
import type { GameEvent } from '../core/events';
import type { Id, StartMode } from '../core/types';
import type { BuildModeUI } from './build/buildMode';
import { mountBuildOverlay } from './build/buildOverlay';
import { BuildSession } from './build/buildSession';
import { mountBuyMode } from './buy/buyMode';
import { toast } from './kit/components';
import { h, toggleClass } from './kit/dom';
import { installLayoutTracking, onLayoutChange } from './kit/layout';
import type { ModeUI } from './modes/types';
import { createContextMenu } from './hud/contextMenu';
import { createDevOverlay } from './hud/devOverlay';
import { createBillsPanel } from './hud/billsPanel';
import { createFeedPanel, createLedgerPanel, createToaster } from './hud/feed';
import { createEventTracker } from './hud/eventTracker';
import { openEventPlanner } from './hud/eventPlanner';
import { createHud } from './hud/hud';
import { ZERO_INSETS, computeInsets, sameInsets, type Insets, type Rect } from './hud/insets';
import { createPersonPanel } from './hud/personPanel';
import type { PersonTab, Shell, ShellPanelKind } from './hud/shell';
import { createTutorial } from './hud/tutorial';
import { attachWorldInput } from './input';
import { createBootScreen, type BootScreen } from './screens/boot';
import { busyOverlay, errorDialog } from './screens/common';
import { openGameMenu } from './screens/gameMenu';
import { createMainMenu, type MainMenu } from './screens/menu';
import { openSettings } from './screens/settings';

export { showCompatibilityScreen } from './screens/boot';

type Route = 'boot' | 'menu' | 'creator' | 'wardrobe' | 'game';

const HUD_REFRESH_MS = 250; // need bars and clock: at most 4 updates per second

export function createUI(api: GameAPI, root: HTMLElement): { destroy(): void } {
  installLayoutTracking();
  const canvas = document.getElementById('game-canvas');
  const layer = h('div', { class: 'shell-layer' });
  root.appendChild(layer);
  const cleanups: Array<() => void> = [];
  const docStyle = document.documentElement.style;

  // ---------------------------------------------------------------------------------------------
  // Shell context
  // ---------------------------------------------------------------------------------------------

  let lastSoundAt = new Map<SoundId, number>();
  const sound = (id: SoundId) => {
    const now = performance.now();
    if (now - (lastSoundAt.get(id) ?? -1e9) < 90) return; // no machine-gun repeats
    lastSoundAt.set(id, now);
    try { api.sound(id); } catch { /* audio is optional */ }
  };

  const canvasRect = (): DOMRect => (canvas ?? root).getBoundingClientRect();
  const canvasToRoot = (p: { x: number; y: number }) => {
    const c = canvasRect(), r = root.getBoundingClientRect();
    return { x: p.x + c.left - r.left, y: p.y + c.top - r.top };
  };

  let personPanel: ReturnType<typeof createPersonPanel> | null = null;
  let feedPanel: ReturnType<typeof createFeedPanel> | null = null;
  let ledgerPanel: ReturnType<typeof createLedgerPanel> | null = null;
  let billsPanel: ReturnType<typeof createBillsPanel> | null = null;
  let tutorial: ReturnType<typeof createTutorial> | null = null;

  const buildSession = new BuildSession(api, { sound, toast });
  cleanups.push(() => buildSession.destroy());

  const sh: Shell = {
    api, root, layer, sound, build: buildSession,
    openPanel: (kind, opts) => openPanel(kind, opts),
    closePanels: () => closePanels(),
    isPanelOpen: (kind) => panelOf(kind)?.panel.isOpen() ?? false,
    openGameMenu: () => { ctx.close(); openGameMenu(sh); },
    openSettings: () => openSettings(sh),
    openEventPlanner: (hostId) => { ctx.close(); openEventPlanner(sh, hostId); },
    openContextMenu: (personId, pick, at) => ctx.open(personId, pick, at),
    closeContextMenu: () => ctx.close(),
    isContextMenuOpen: () => ctx.isOpen(),
    tutorialSignal: (s) => tutorial?.signal(s),
    showTutorial: () => tutorial?.show(),
    requestLayout: () => scheduleMeasure(),
    paintPreviewShown: (pv) => { try { buildUI?.setPreview(pv); } catch { /* panel optional */ } },
    canvasToRoot,
  };

  // ---------------------------------------------------------------------------------------------
  // Covered areas: insets for the camera, CSS variables for the layout, context-menu area
  // ---------------------------------------------------------------------------------------------

  let shellTop = 0, shellBottom = 0;
  const visibleArea = (): Rect => {
    const r = root.getBoundingClientRect();
    const sheet = Number.parseFloat(docStyle.getPropertyValue('--sheet-h')) || 0;
    const side = Number.parseFloat(docStyle.getPropertyValue('--side-cover')) || 0;
    return { left: 8, top: shellTop + 8, right: r.width - 8 - side, bottom: r.height - shellBottom - sheet - 8 };
  };
  const ctx = createContextMenu(sh, visibleArea);
  cleanups.push(() => ctx.destroy());

  let lastInsets: Insets | null = null;
  let measureRaf = 0;
  const observed = new WeakSet<Element>();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => scheduleMeasure()) : null;
  const scheduleMeasure = () => { if (!measureRaf) measureRaf = requestAnimationFrame(measure); };

  const visiblePanels = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('.panel')].filter((p) => !p.hidden && p.offsetParent !== null && p.getClientRects().length > 0);

  const measure = () => {
    measureRaf = 0;
    const rootRect = root.getBoundingClientRect();
    const c = canvasRect();
    const covers: HTMLElement[] = [];
    let report = true;
    if (route === 'game') {
      covers.push(...hud.covers());
      covers.push(...visiblePanels());
    } else if (route === 'menu' && menu) {
      covers.push(menu.card);
    } else if (route === 'creator' || route === 'wardrobe') {
      report = false; // those screens manage the preview camera themselves
    }
    for (const el of covers) if (ro && !observed.has(el)) { observed.add(el); ro.observe(el); }
    // layout variables (HUD bars only)
    let top = 0, bottom = 0;
    if (route === 'game') {
      for (const el of hud.covers()) {
        const r = el.getBoundingClientRect();
        if (r.top + r.height / 2 < rootRect.top + rootRect.height / 2) top = Math.max(top, r.bottom - rootRect.top);
        else bottom = Math.max(bottom, rootRect.bottom - r.top);
      }
    }
    shellTop = Math.round(top);
    shellBottom = Math.round(bottom);
    docStyle.setProperty('--shell-top', `${shellTop}px`);
    docStyle.setProperty('--shell-bottom', `${shellBottom}px`);
    let sheet = 0, side = 0;
    if (route === 'game') {
      for (const p of visiblePanels()) {
        const r = p.getBoundingClientRect();
        if (r.width >= rootRect.width * 0.6) sheet = Math.max(sheet, rootRect.bottom - shellBottom - r.top);
        else if (r.left + r.width / 2 > rootRect.left + rootRect.width / 2) side = Math.max(side, rootRect.right - r.left);
      }
    }
    docStyle.setProperty('--sheet-h', `${Math.max(0, Math.round(sheet))}px`);
    docStyle.setProperty('--side-cover', `${Math.max(0, Math.round(side))}px`);
    toggleClass(document.body, 'shell-side-open', side > 0);
    toggleClass(document.body, 'shell-sheet-open', sheet > 0);
    // portrait camera cluster: hide when it would not fit above an open sheet
    const cluster = hud.el.querySelector<HTMLElement>('.camera-cluster');
    if (cluster && route === 'game') {
      const room = rootRect.height - shellBottom - sheet - shellTop;
      toggleClass(cluster, 'is-squeezed', room < cluster.offsetHeight + 24);
    }
    if (report) {
      const ins = route === 'boot' ? ZERO_INSETS : computeInsets({ left: c.left, top: c.top, right: c.right, bottom: c.bottom }, covers.map((el) => el.getBoundingClientRect()));
      if (!lastInsets || !sameInsets(ins, lastInsets)) {
        lastInsets = ins;
        try { api.view.setInsets(ins); } catch { /* renderer not ready */ }
      }
    }
    ctx.reposition();
  };

  const mo = new MutationObserver((records) => {
    for (const r of records) {
      const t = r.target as HTMLElement;
      if (t.closest?.('.ctx-menu, .toasts, .tap-ripple, .paint-tip, .dev-overlay, .bb-handles')) continue;
      scheduleMeasure();
      return;
    }
  });
  mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'data-height'] });
  ro?.observe(root);
  const onTransitionEnd = () => scheduleMeasure();
  root.addEventListener('transitionend', onTransitionEnd);
  cleanups.push(() => { mo.disconnect(); ro?.disconnect(); root.removeEventListener('transitionend', onTransitionEnd); if (measureRaf) cancelAnimationFrame(measureRaf); });
  cleanups.push(onLayoutChange(() => { scheduleMeasure(); }));

  // ---------------------------------------------------------------------------------------------
  // HUD, panels, overlays
  // ---------------------------------------------------------------------------------------------

  const hud = createHud(sh);
  layer.appendChild(hud.el);
  cleanups.push(() => hud.destroy());

  const evTracker = createEventTracker(sh);
  layer.appendChild(evTracker.el);
  cleanups.push(() => evTracker.destroy());

  const onPanelClosed = () => { hud.setOpenPanel(openKind()); scheduleMeasure(); };
  const openKind = (): ShellPanelKind | null => (personPanel?.panel.isOpen() ? 'person' : feedPanel?.panel.isOpen() ? 'feed' : ledgerPanel?.panel.isOpen() ? 'ledger' : billsPanel?.panel.isOpen() ? 'bills' : null);
  personPanel = createPersonPanel(sh, onPanelClosed);
  feedPanel = createFeedPanel(sh, onPanelClosed);
  ledgerPanel = createLedgerPanel(sh, onPanelClosed);
  billsPanel = createBillsPanel(sh, onPanelClosed);
  for (const p of [personPanel.panel, feedPanel.panel, ledgerPanel.panel, billsPanel.panel]) { layer.appendChild(p.el); cleanups.push(() => p.destroy()); }

  const panelOf = (kind: ShellPanelKind) => (kind === 'person' ? personPanel : kind === 'feed' ? feedPanel : kind === 'ledger' ? ledgerPanel : billsPanel);
  function openPanel(kind: ShellPanelKind, opts?: { personId?: Id; tab?: PersonTab }): void {
    for (const k of ['person', 'feed', 'ledger', 'bills'] as const) if (k !== kind) panelOf(k)?.close();
    ctx.close();
    if (kind === 'person') {
      const id = opts?.personId ?? api.selected();
      if (!id) return;
      personPanel?.open(id, opts?.tab);
    } else if (kind === 'feed') { feedPanel?.open(); hud.markFeedSeen(); }
    else if (kind === 'bills') billsPanel?.open();
    else ledgerPanel?.open();
    hud.setOpenPanel(openKind());
    scheduleMeasure();
  }
  function closePanels(): void {
    personPanel?.close(); feedPanel?.close(); ledgerPanel?.close(); billsPanel?.close();
    hud.setOpenPanel(null);
    scheduleMeasure();
  }

  tutorial = createTutorial(sh);
  layer.appendChild(tutorial.el);
  cleanups.push(() => tutorial?.destroy());

  const dev = createDevOverlay(api);
  layer.appendChild(dev.el);
  cleanups.push(() => dev.destroy());
  const debugParam = new URLSearchParams(location.search).has('debug');

  const toaster = createToaster(sh);
  cleanups.push(() => toaster.destroy());

  // ---------------------------------------------------------------------------------------------
  // Screens and routing
  // ---------------------------------------------------------------------------------------------

  let route: Route = 'boot';
  let boot: BootScreen | null = null;
  let menu: MainMenu | null = null;
  let creator: { ui: ModeUI; mode: StartMode } | null = null;
  let wardrobe: ModeUI | null = null;
  let buyUI: ModeUI | null = null;
  let buildUI: BuildModeUI | null = null;
  let lastMode: GameMode | null = null;
  let destroyed = false;

  // The Build panel (finish catalogs, structure tools) is only needed in Build mode: a separate chunk loaded on first use.
  let buildLoading = false;
  const showBuildPanel = () => {
    if (buildUI) { buildUI.show(); return; }
    if (buildLoading) return;
    buildLoading = true;
    void import('./build/buildMode').then((mod) => {
      buildLoading = false;
      if (destroyed) return;
      buildUI ??= mod.mountBuildMode(root, api, buildSession);
      if (api.mode() === 'build') buildUI.show();
    }).catch((err: unknown) => {
      buildLoading = false;
      console.error('[ui] the Build panel could not load', err);
      toast('The Build panel could not load. Check your connection and try again.', 'error', 5000);
      if (api.mode() === 'build') api.setMode('live');
    });
  };

  let buildPrefetched = false;
  /** Fetches the Build panel chunk while the player is busy in Live mode, so Build opens at once. */
  const prefetchBuildPanel = () => {
    if (buildPrefetched) return;
    buildPrefetched = true;
    setTimeout(() => { void import('./build/buildMode').catch(() => { buildPrefetched = false; }); }, 2500);
  };

  const destroyCreator = () => { if (creator) { try { creator.ui.destroy(); } catch { /* ignore */ } creator = null; } };

  // The creator (and the wardrobe, which reuses its clothing step) is loaded on demand: a separate chunk that
  // is only needed on the way into a new game, and a failure to load it cannot take the rest of the UI down.
  let creatorModule: Promise<typeof import('./creator/creatorScreen')> | null = null;
  const loadCreatorModule = () => (creatorModule ??= import('./creator/creatorScreen').catch((err: unknown) => { creatorModule = null; throw err; }));
  let creatorLoading = false;

  const startCreator = async (mode: Extract<StartMode, 'create' | 'sandbox'>) => {
    if (creator || creatorLoading) return;
    creatorLoading = true;
    ctx.close();
    const done = busyOverlay('Opening the creator…');
    let mod: typeof import('./creator/creatorScreen');
    try { mod = await loadCreatorModule(); } catch (err) {
      done();
      creatorLoading = false;
      sound('error');
      await errorDialog({ title: 'The creator could not open', message: err instanceof Error ? err.message : 'Loading failed.', note: 'Check your connection and try again. Nothing was changed.' });
      if (api.mode() === 'creator') { try { api.creator.hide(); } catch { /* ignore */ } if (api.mode() !== 'menu') api.showMenu(); }
      routeNow();
      return;
    }
    done();
    if (destroyed) { creatorLoading = false; return; }
    // creatorLoading stays set until `creator` is assigned: mounting drives the preview, which switches the game
    // to creator mode and re-enters routeNow() before this function returns (it would open a second creator).
    try {
      const ui = mod.mountCreator(root, api, {
        mode,
        onDone: (draft: HouseholdDraft) => { void finishCreator(mode, draft); },
        onCancel: () => {
          destroyCreator();
          try { api.creator.hide(); } catch { /* ignore */ }
          if (api.mode() !== 'menu') api.showMenu();
          routeNow();
        },
      });
      creator = { ui, mode };
    } finally { creatorLoading = false; }
    creator?.ui.show();
    routeNow();
  };

  const finishCreator = async (mode: StartMode, draft: HouseholdDraft) => {
    const done = busyOverlay(`Moving the ${draft.name || 'new'} household in…`);
    let r: Awaited<ReturnType<typeof api.startNewGame>>;
    try { r = await api.startNewGame(mode, draft); } catch (err) { r = { ok: false, reason: err instanceof Error ? err.message : 'Something went wrong.' }; }
    done();
    if (!r.ok) {
      sound('error');
      await errorDialog({ title: 'Could not move in', message: r.reason, note: 'Your household is still here in the creator, so you can fix it and try again.' });
      return;
    }
    sound('confirm');
    destroyCreator();
    routeNow();
  };

  let wardrobeLoading = false;
  const openWardrobe = async (personId: Id) => {
    if (wardrobe || wardrobeLoading || !api.state()?.people[personId]) return;
    wardrobeLoading = true;
    ctx.close();
    closePanels();
    let mod: typeof import('./creator/creatorScreen');
    try { mod = await loadCreatorModule(); } catch (err) {
      wardrobeLoading = false;
      sound('error');
      void errorDialog({ title: 'The wardrobe could not open', message: err instanceof Error ? err.message : 'Loading failed.', note: 'Nothing was changed.' });
      return;
    }
    wardrobeLoading = false;
    if (destroyed || !api.state()?.people[personId]) return;
    const ui = mod.mountWardrobe(root, api, {
      personId,
      onClose: () => {
        const w = wardrobe;
        wardrobe = null;
        try { w?.destroy(); } catch { /* ignore */ }
        if (api.mode() === 'creator') { try { api.creator.hide(); } catch { /* ignore */ } }
        routeNow();
      },
    });
    wardrobe = ui;
    ui.show();
    routeNow();
  };

  const showMenu = () => {
    if (menu) return;
    menu = createMainMenu(sh, { createHousehold: (mode) => { void startCreator(mode); } });
    layer.appendChild(menu.el);
  };
  const hideMenu = () => { menu?.destroy(); menu = null; };

  const routeNow = () => {
    const m = api.mode();
    const next: Route = wardrobe ? 'wardrobe' : creator || m === 'creator' ? 'creator' : m === 'boot' ? 'boot' : m === 'menu' ? 'menu' : 'game';
    // creator finished elsewhere (e.g. the game moved to live): drop it
    if (creator && (m === 'live' || m === 'buy' || m === 'build') && !wardrobe) { destroyCreator(); return routeNow(); }
    const prevRoute = route;
    route = next;

    // boot
    if (next === 'boot') { if (!boot) boot = createBootScreen(layer); }
    else if (boot) { boot.destroy(); boot = null; }

    // menu
    if (next === 'menu') showMenu(); else hideMenu();

    // creator
    if (next === 'creator' && !creator) {
      // the game entered creator mode by itself: open the creator for a new household
      void startCreator('create');
    }

    // HUD and mode panels
    const inGame = next === 'game';
    hud.el.hidden = !inGame;
    toggleClass(document.body, 'shell-hud-on', inGame);
    toggleClass(document.body, 'shell-in-game', inGame || next === 'wardrobe');
    document.body.dataset.shellRoute = next;
    if (inGame) {
      prefetchBuildPanel();
      hud.setMode(m);
      if (m === 'buy') { buyUI ??= mountBuyMode(root, api); buyUI.show(); } else buyUI?.hide();
      if (m === 'build') showBuildPanel(); else buildUI?.hide();
      if (m !== 'live') closePanels();
      if (lastMode !== m) { ctx.close(); lastMode = m; }
      hud.onSpeed(); hud.onCamera(); hud.refresh(); evTracker.refresh();
    } else {
      evTracker.refresh();
      buyUI?.hide(); buildUI?.hide();
      closePanels();
      ctx.close();
      lastMode = null;
    }
    tutorial?.update(inGame ? m : 'menu');
    dev.setVisible((debugParam || api.settings().showStats) && next !== 'boot');
    if ((next === 'creator' || next === 'wardrobe') && prevRoute !== next) {
      lastInsets = ZERO_INSETS;
      try { api.view.setInsets(ZERO_INSETS); } catch { /* ignore */ }
    }
    scheduleMeasure();
  };

  // ---------------------------------------------------------------------------------------------
  // Game signals
  // ---------------------------------------------------------------------------------------------

  const applySettings = () => {
    const s = api.settings();
    const scale = Math.max(0.9, Math.min(1.3, Number(s.textScale) || 1));
    docStyle.setProperty('--text-scale', String(scale));
    toggleClass(document.body, 'reduced-motion', !!s.reducedMotion);
    dev.setVisible((debugParam || s.showStats) && route !== 'boot');
    scheduleMeasure();
  };

  cleanups.push(api.onChange((what) => {
    switch (what) {
      case 'mode': routeNow(); break;
      case 'selection': {
        hud.onSelection();
        const sel = api.selected();
        if (personPanel?.panel.isOpen()) { if (sel) personPanel.open(sel); else personPanel.close(); }
        break;
      }
      case 'speed': hud.onSpeed(); break;
      case 'camera': hud.onCamera(); ctx.reposition(); break;
      case 'portraits': hud.onPortraits(); personPanel?.refresh(); break;
      case 'settings': applySettings(); break;
      case 'state': hud.refresh(); evTracker.refresh(); personPanel?.refresh(); feedPanel?.refresh(); ledgerPanel?.refresh(); billsPanel?.refresh(); tutorial?.update(api.mode()); break;
      default: break;
    }
  }));

  cleanups.push(api.events.onAny((e: GameEvent) => {
    switch (e.type) {
      case 'state.replaced':
        ctx.close();
        closePanels();
        hud.resetFeed();
        tutorial?.onStateReplaced();
        hud.refresh();
        evTracker.refresh();
        break;
      case 'ui.request':
        if (e.what === 'editOutfits') void openWardrobe(e.personId);
        else if (e.what === 'planEvent') openEventPlanner(sh, e.personId);
        else if (e.what === 'bills') { api.select(e.personId); openPanel('bills'); }
        else if (e.what === 'careers') { api.select(e.personId); openPanel('person', { personId: e.personId, tab: 'career' }); }
        else if (e.what === 'focusPerson') {
          const st = api.state();
          const p = st?.people[e.personId];
          if (p && st && p.householdId === st.activeHouseholdId && !p.isNpc) api.select(e.personId);
          api.view.focusPerson(e.personId);
        }
        break;
      case 'person.removed':
        if (personPanel?.personId() === e.personId) personPanel.close();
        break;
      case 'homeEvent': evTracker.refresh(); break;
      default: break;
    }
  }));

  // periodic HUD refresh (values only change the DOM when they differ)
  const timer = setInterval(() => {
    if (document.hidden || route !== 'game') return;
    hud.refresh();
    evTracker.refresh();
    personPanel?.refresh();
    feedPanel?.refresh();
    ledgerPanel?.refresh();
    billsPanel?.refresh();
  }, HUD_REFRESH_MS);
  cleanups.push(() => clearInterval(timer));

  // world input
  if (canvas) {
    const overlay = mountBuildOverlay({ api, session: buildSession, layer, canvas, canvasToRoot });
    cleanups.push(() => overlay.destroy());
    const input = attachWorldInput(sh, canvas, () => route !== 'game');
    cleanups.push(() => input.destroy());
  }

  applySettings();
  routeNow();

  return {
    destroy: () => {
      destroyed = true;
      destroyCreator();
      try { wardrobe?.destroy(); } catch { /* ignore */ }
      try { buyUI?.destroy(); } catch { /* ignore */ }
      try { buildUI?.destroy(); } catch { /* ignore */ }
      boot?.destroy();
      hideMenu();
      for (const fn of cleanups.splice(0).reverse()) { try { fn(); } catch { /* ignore */ } }
      layer.remove();
      document.querySelectorAll('.modal-backdrop, .busy-overlay').forEach((n) => n.remove());
      for (const c of ['shell-hud-on', 'shell-in-game', 'shell-side-open', 'shell-sheet-open', 'reduced-motion']) document.body.classList.remove(c);
      lastSoundAt = new Map();
    },
  };
}
