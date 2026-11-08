// Main menu over the live backdrop: Continue, New Game, Load Game, Settings; the start-mode chooser (Guided
// Start, Create a Household, Build Sandbox) and the sandbox household picker.

import type { HouseholdDraft } from '../../core/drafts';
import type { StartMode } from '../../core/types';
import { button } from '../kit/components';
import { h, setChildren } from '../kit/dom';
import { icon } from '../kit/icons';
import { rowButton, spinner } from '../kit/controls';
import { formatGameTime, relativeTime } from '../hud/format';
import type { Shell } from '../hud/shell';
import { logoMark } from './boot';
import { openLoadDialog } from './saves';
import { reportDialog } from './common';

export interface MainMenu { el: HTMLElement; card: HTMLElement; destroy(): void }

export interface MainMenuHandlers {
  /** Opens the creator; the app calls api.startNewGame(mode, draft) when it finishes. */
  createHousehold(mode: Extract<StartMode, 'create' | 'sandbox'>): void;
}

type View = 'main' | 'new' | 'sandbox';

type Latest = Awaited<ReturnType<GameAPIForMenu['latestSave']>>;
type GameAPIForMenu = Shell['api'];

export function createMainMenu(sh: Shell, handlers: MainMenuHandlers): MainMenu {
  const { api } = sh;
  const view = h('div', { class: 'menu-view' });
  const status = h('div', { class: 'menu-status', role: 'alert' });
  status.hidden = true;
  const card = h('div', { class: 'menu-card hud-box' },
    h('div', { class: 'menu-brand' }, logoMark(52), h('div', {}, h('h1', { class: 'brand-title', text: 'Hearthside Life' }), h('p', { class: 'brand-tag', text: 'A cosy life on Willow Lane' }))),
    status, view);
  const el = h('div', { class: 'menu-screen' }, card);
  card.addEventListener('pointerdown', (e) => e.stopPropagation());
  let destroyed = false;
  let busy = false;

  const showError = (text: string | null) => {
    status.hidden = !text;
    setChildren(status, text ? [icon('warning', 20), h('span', { text })] : []);
  };

  const setBusy = (text: string | null) => {
    busy = !!text;
    card.classList.toggle('is-busy', busy);
    for (const b of card.querySelectorAll<HTMLButtonElement>('button')) b.disabled = busy || b.dataset.disabled === 'true';
    const old = card.querySelector('.menu-busy');
    old?.remove();
    if (text) card.appendChild(h('div', { class: 'menu-busy', role: 'status' }, spinner(text), h('span', { text })));
  };

  const start = async (mode: StartMode, draft: HouseholdDraft | undefined) => {
    if (busy) return;
    showError(null);
    if (!draft) { showError('No ready-made household is available yet. Try Create a Household instead.'); sh.sound('error'); return; }
    sh.sound('confirm');
    setBusy(`Moving the ${draft.name} household in…`);
    let r: Awaited<ReturnType<typeof api.startNewGame>>;
    try { r = await api.startNewGame(mode, draft); } catch (err) { r = { ok: false, reason: err instanceof Error ? err.message : 'Something went wrong.' }; }
    if (destroyed) return;
    setBusy(null);
    if (!r.ok) { showError(`Could not start the game: ${r.reason}`); sh.sound('error'); }
  };

  const back = (to: View) => {
    const b = button({ icon: 'back', label: 'Back', variant: 'ghost', small: true, onClick: () => { sh.sound('click'); go(to); } });
    b.classList.add('menu-back');
    return b;
  };

  // The latest save is fetched once per menu; coming back to the main view renders it without a placeholder.
  let latestKnown: Latest | undefined;
  const latestPromise: Promise<Latest> = api.latestSave().then((l) => (latestKnown = l)).catch(() => (latestKnown = null));

  const renderMain = () => {
    const cont = h('div', { class: 'menu-continue' }, latestKnown === undefined ? h('div', { class: 'menu-skeleton', attrs: { 'aria-hidden': 'true' } }) : null);
    const newGame = button({ icon: 'plus', label: 'New Game', variant: 'primary', onClick: () => { sh.sound('click'); go('new'); } });
    const list = h('div', { class: 'menu-buttons' },
      cont,
      newGame,
      button({ icon: 'load', label: 'Load Game', onClick: () => { sh.sound('open'); void openLoadDialog(sh, { fromMenu: true }); } }),
      button({ icon: 'settings', label: 'Settings', onClick: () => { sh.sound('open'); sh.openSettings(); } }));
    setChildren(view, list);
    const fill = (latest: Latest) => {
      if (destroyed || !cont.isConnected) return;
      if (!latest) { cont.remove(); return; }
      newGame.classList.replace('btn-primary', 'btn-secondary');
      const btn = h('button', { type: 'button', class: 'btn btn-primary menu-continue-btn' },
        icon('play', 22),
        h('span', { class: 'menu-continue-text' },
          h('span', { class: 'btn-label', text: 'Continue' }),
          h('span', { class: 'menu-continue-sub', text: `${latest.householdName || 'Saved game'} · ${formatGameTime(latest.gameMinutes)} · ${latest.kind === 'autosave' ? 'autosaved' : 'saved'} ${relativeTime(latest.savedAt)}` })));
      btn.addEventListener('click', async () => {
        if (busy) return;
        showError(null);
        sh.sound('confirm');
        setBusy('Loading your game…');
        let r: Awaited<ReturnType<typeof api.loadFrom>>;
        try { r = await api.loadFrom(latest.slotId); } catch (err) { r = { ok: false, reason: err instanceof Error ? err.message : 'Something went wrong.' }; }
        if (destroyed) return;
        setBusy(null);
        if (!r.ok) { showError(`Could not load the save: ${r.reason}`); sh.sound('error'); return; }
        if (r.report?.length) void reportDialog({ title: 'Loaded with notes', intro: 'The save loaded. A few things were adjusted:', lines: r.report });
      });
      cont.replaceChildren(btn);
    };
    if (latestKnown !== undefined) fill(latestKnown); else void latestPromise.then(fill);
  };

  const renderNew = () => {
    const premade = api.premadeHouseholds();
    setChildren(view,
      h('div', { class: 'menu-head' }, back('main'), h('h2', { text: 'Start a new game' })),
      h('div', { class: 'menu-choices' },
        rowButton({ icon: 'review', title: 'Guided Start', subtitle: 'A ready-made household in a furnished home, a comfortable budget and a short tutorial.', onClick: () => { void start('guided', premade[0]); } }),
        rowButton({ icon: 'person', title: 'Create a Household', subtitle: 'Design your own people in the creator, then move into the starter house.', onClick: () => { sh.sound('click'); handlers.createHousehold('create'); } }),
        rowButton({ icon: 'build', title: 'Build Sandbox', subtitle: 'Unlimited funds for buying and building, with a ready-made or new household.', tag: 'Unlimited building funds', onClick: () => { sh.sound('click'); go('sandbox'); } })));
  };

  const renderSandbox = () => {
    const premade = api.premadeHouseholds();
    setChildren(view,
      h('div', { class: 'menu-head' }, back('new'), h('h2', { text: 'Build Sandbox' })),
      h('div', { class: 'sandbox-note' }, icon('build', 20), h('p', {}, h('strong', { text: 'Unlimited building funds. ' }), 'Buying furniture and changing finishes cost nothing. Wages and bills still apply.')),
      h('div', { class: 'menu-choices' },
        ...premade.map((d) => rowButton({
          icon: 'people', title: `${d.name} household`,
          subtitle: `${d.members.length} ${d.members.length === 1 ? 'person' : 'people'}: ${d.members.map((m) => m.firstName).join(', ')}`,
          onClick: () => { void start('sandbox', d); },
        })),
        rowButton({ icon: 'plus', title: 'Create a household', subtitle: 'Open the creator and move in with unlimited building funds.', onClick: () => { sh.sound('click'); handlers.createHousehold('sandbox'); } })),
      premade.length ? null : h('p', { class: 'muted-note', text: 'No ready-made households are available yet.' }));
  };

  const go = (v: View) => {
    showError(null);
    if (v === 'main') renderMain(); else if (v === 'new') renderNew(); else renderSandbox();
    view.dataset.view = v;
    sh.requestLayout();
  };

  go('main');
  return { el, card, destroy: () => { destroyed = true; el.remove(); } };
}
