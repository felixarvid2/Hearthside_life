// Contextual hint card (Milestone 13): a small dismissible card that appears the first time the player reaches a
// situation (moving in, needs, the queue, Buy, Build, jobs, relationships, the map, floors, saving). One at a time,
// never over a dialog, never again once seen. "Got it" marks it seen, "Skip hints" turns hints off; Settings > Help
// has the switch and "Reset hints". The pure rules and the texts are in hintState.ts.

import type { GameEvent } from '../../core/events';
import { activeHousehold } from '../../core/state';
import { toast } from '../kit/components';
import { h, setText, shieldWorld } from '../kit/dom';
import { icon } from '../kit/icons';
import { enqueue, hintDef, markSeen, pickNext, progress, type HintId } from './hintState';
import type { Shell } from './shell';

export interface Hints {
  el: HTMLElement;
  /** Asks for a hint; it shows when hints are on, it was not seen, and the screen is free. */
  request(id: HintId): void;
  /** Hides the card for now (Esc); counts as seen. Returns false when no card was showing. */
  dismiss(): boolean;
  isShowing(): boolean;
  destroy(): void;
}

const RETRY_MS = 600;

export function createHints(sh: Shell): Hints {
  const { api } = sh;
  let pending: HintId[] = [];
  let showing: HintId | null = null;
  let timer = 0;

  const kicker = h('span', { class: 'hint-kicker' });
  const title = h('h2', { class: 'hint-title' });
  const text = h('p', { class: 'hint-text' });
  const gotIt = h('button', { type: 'button', class: 'btn btn-primary btn-small hint-ok', text: 'Got it' });
  const skip = h('button', { type: 'button', class: 'btn btn-ghost btn-small hint-skip', text: 'Skip hints', title: 'Turn hints off (Settings > Help turns them back on)' });
  const el = h('aside', { class: 'hint-card hud-box', role: 'region', ariaLabel: 'Hint', attrs: { 'aria-live': 'polite' } },
    h('div', { class: 'hint-head' }, icon('info', 20), kicker),
    title, text,
    h('div', { class: 'hint-actions' }, skip, gotIt));
  el.hidden = true;
  shieldWorld(el);

  const state = () => ({ enabled: api.settings().hints, seen: api.settings().seenHints, pending, showing });
  /** True when something should not be covered: a dialog is open or the game is not on screen. */
  const blocked = (id: HintId): boolean => {
    if (document.querySelector('.modal-backdrop, .busy-overlay')) return true;
    const route = document.body.dataset.shellRoute;
    return id === 'household' ? route !== 'creator' : route !== 'game';
  };

  const hide = () => { el.hidden = true; showing = null; };

  const schedule = () => { if (!timer && pending.length) timer = window.setTimeout(() => { timer = 0; flush(); }, RETRY_MS); };

  const flush = () => {
    if (!api.settings().hints) { pending = []; if (showing) hide(); return; }
    if (showing && el.hidden) showing = null;
    const next = pickNext(state());
    if (!next) { if (!showing) pending = []; return; }
    if (blocked(next)) { schedule(); return; }
    pending = pending.filter((id) => id !== next);
    showing = next;
    const def = hintDef(next);
    const p = progress(api.settings().seenHints);
    setText(kicker, `Hint ${Math.min(p.total, p.seen + 1)} of ${p.total}`);
    setText(title, def.title);
    setText(text, def.text);
    el.dataset.hint = next;
    el.hidden = false;
    schedule();
  };

  const finish = (): boolean => {
    if (!showing) return false;
    const id = showing;
    hide();
    api.setSettings({ seenHints: markSeen(api.settings().seenHints, id) });
    flush();
    return true;
  };

  const request = (id: HintId) => {
    const next = enqueue(state(), id);
    if (next.length === pending.length) return;
    pending = next;
    flush();
  };

  gotIt.addEventListener('click', () => { sh.sound('click'); finish(); });
  skip.addEventListener('click', () => {
    sh.sound('close');
    hide();
    pending = [];
    api.setSettings({ hints: false });
    toast('Hints are off. Turn them back on in Settings > Help.', 'info', 4000);
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sh.sound('close'); finish(); } });

  // Outside the game world (the creator) the world input is off, so Esc is handled here
  const onDocKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !showing || el.hidden || document.body.dataset.shellRoute === 'game' || document.querySelector('.modal-backdrop')) return;
    const t = e.target as HTMLElement | null;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && (t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'checkbox') return;
    e.preventDefault();
    sh.sound('close');
    finish();
  };
  document.addEventListener('keydown', onDocKey);

  // ---- situations observed here (panels, menus and the creator call sh.hint directly) ----
  const household = (): ReadonlySet<string> => new Set(activeHousehold(api.state() ?? ({} as never))?.memberIds ?? []);
  const checkFloors = () => {
    if (api.mode() !== 'live' && api.mode() !== 'build') return;
    const lv = api.view.levels?.();
    if ((api.view.level?.() ?? 0) > 0 || (lv && lv.count > 1 && api.mode() === 'live')) request('floors');
  };
  const unsubChange = api.onChange((what) => {
    switch (what) {
      case 'mode': {
        const m = api.mode();
        if (m === 'buy') request('buy');
        else if (m === 'build') request('build');
        else if (m === 'live' && api.state()) request('moveIn');
        checkFloors();
        break;
      }
      case 'selection': if (api.selected()) request('needs'); break;
      case 'camera': checkFloors(); break;
      case 'settings': flush(); break;
      default: break;
    }
  });
  const onEvent = (e: GameEvent) => {
    switch (e.type) {
      case 'state.replaced': request('moveIn'); break;
      case 'person.changed': if (e.what === 'queue' && household().has(e.personId) && (api.state()?.people[e.personId]?.queue.length ?? 0) > 0) request('queue'); break;
      case 'social': if (household().has(e.actorId) && e.actorId !== e.targetId) request('relationships'); break;
      case 'ui.request': if (e.what === 'bills' || e.what === 'careers') request('jobs'); else if (e.what === 'map') request('travel'); break;
      default: break;
    }
  };
  const unsubEvents = api.events.onAny(onEvent);
  // a dialog closing or the route changing frees the screen: look again shortly
  const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => schedule()) : null;
  mo?.observe(sh.root, { childList: true });
  mo?.observe(document.body, { attributes: true, attributeFilter: ['data-shell-route'] });

  return {
    el, request, dismiss: finish, isShowing: () => showing !== null && !el.hidden,
    destroy: () => { document.removeEventListener('keydown', onDocKey); unsubChange(); unsubEvents(); mo?.disconnect(); if (timer) clearTimeout(timer); el.remove(); },
  };
}
