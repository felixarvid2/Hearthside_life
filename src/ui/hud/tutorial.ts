// Guided Start tutorial card: a small dismissible checklist that ticks off from real events. Progress is kept
// per world in localStorage (a per-viewer convenience; the world save is untouched).

import type { GameMode } from '../../game/api';
import type { GameEvent } from '../../core/events';
import { activeHousehold } from '../../core/state';
import type { WorldState } from '../../core/types';
import { h, setText, shieldWorld, toggleClass } from '../kit/dom';
import { icon } from '../kit/icons';
import { layout } from '../kit/layout';
import { TUTORIAL_STEPS, applySignal, emptyProgress, isComplete, parseProgress, type TutorialProgress, type TutorialSignal } from './tutorialSteps';
import type { Shell } from './shell';

export interface Tutorial {
  el: HTMLElement;
  signal(s: TutorialSignal): void;
  /** Re-open after dismissing (from the game menu). */
  show(): void;
  /** Re-evaluates visibility (mode, settings, state). */
  update(mode: GameMode): void;
  onStateReplaced(): void;
  destroy(): void;
}

function storageKey(st: WorldState): string { return `hearthside.tutorial.${st.seed}.${st.activeHouseholdId}`; }

export function createTutorial(sh: Shell): Tutorial {
  const { api } = sh;
  let progress: TutorialProgress = emptyProgress();
  let key = '';
  let mode: GameMode = api.mode();
  // placement tracking: a placement counts once the lot changed during it (or right after it ended)
  let placing: 'buy' | 'move' | 'inventory' | null = null;
  let changedWhilePlacing = false;
  let ended: { source: 'buy' | 'move' | 'inventory'; at: number } | null = null;
  let lastPaintKind: 'wall' | 'floor' | null = null;
  let careers = new Map<string, string | null>();

  const title = h('span', { class: 'tut-title', text: 'First steps' });
  const count = h('span', { class: 'tut-count' });
  const collapseBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-icon tut-collapse' }, icon('up', 20));
  const closeBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-icon', ariaLabel: 'Hide tutorial', title: 'Hide tutorial (re-open it from the menu)' }, icon('close', 20));
  const list = h('ol', { class: 'tut-list' });
  const doneNote = h('p', { class: 'tut-done', text: 'All done! You know the basics. Enjoy Willow Lane.' });
  const el = h('aside', { class: 'tutorial-card hud-box', ariaLabel: 'Tutorial checklist' },
    h('div', { class: 'tut-head' }, icon('review', 20), h('div', { class: 'tut-heading' }, title, count), collapseBtn, closeBtn),
    h('div', { class: 'tut-body' }, list, doneNote));
  shieldWorld(el);
  el.hidden = true;

  const save = () => { if (key) { try { localStorage.setItem(key, JSON.stringify(progress)); } catch { /* storage unavailable */ } } };

  const render = () => {
    const done = new Set(progress.done);
    const firstOpen = TUTORIAL_STEPS.find((s) => !done.has(s.id));
    setText(count, `${done.size} of ${TUTORIAL_STEPS.length} done`);
    list.replaceChildren(...TUTORIAL_STEPS.map((s) => {
      const isDone = done.has(s.id);
      const isNext = s === firstOpen;
      let titleText = s.title;
      if (s.id === 'buyMove' && !isDone && (progress.bought || progress.moved)) titleText += ` (${progress.bought ? 'bought' : 'moved'}, 1 of 2)`;
      return h('li', { class: ['tut-step', isDone && 'is-done', isNext && 'is-next'] },
        h('span', { class: 'tut-check', attrs: { 'aria-hidden': 'true' } }, isDone ? icon('check', 16) : null),
        h('span', { class: 'tut-step-text' },
          h('span', { class: 'tut-step-title', text: titleText }),
          h('span', { class: 'visually-hidden', text: isDone ? ' (done)' : ' (to do)' }),
          isNext ? h('span', { class: 'tut-hint', text: s.hint }) : null));
    }));
    doneNote.hidden = !isComplete(progress);
    toggleClass(el, 'is-collapsed', progress.collapsed);
    collapseBtn.setAttribute('aria-label', progress.collapsed ? 'Show checklist' : 'Collapse checklist');
    collapseBtn.title = progress.collapsed ? 'Show checklist' : 'Collapse checklist';
    collapseBtn.classList.toggle('is-flipped', !progress.collapsed);
    collapseBtn.setAttribute('aria-expanded', String(!progress.collapsed));
  };

  const active = (): boolean => {
    const st = api.state();
    return !!st && st.startMode === 'guided';
  };

  const update = (m: GameMode) => {
    mode = m;
    const st = api.state();
    const visible = active() && api.settings().tutorial && !progress.dismissed && (m === 'live' || m === 'buy' || m === 'build');
    if (el.hidden === visible) { el.hidden = !visible; sh.requestLayout(); }
    void st;
  };

  const load = () => {
    const st = api.state();
    if (!st) { key = ''; progress = emptyProgress(); return; }
    key = storageKey(st);
    let raw: string | null = null;
    try { raw = localStorage.getItem(key); } catch { /* ignore */ }
    progress = parseProgress(raw);
    if (raw === null) progress.collapsed = layout().compact; // phones start with just the next step
    careers = new Map(Object.values(st.people).filter((p) => p.householdId === st.activeHouseholdId).map((p) => [p.id, p.career?.careerId ?? null]));
    placing = null;
    ended = null;
    lastPaintKind = null;
    render();
    update(mode);
  };

  const signal = (s: TutorialSignal) => {
    if (!active()) return;
    const next = applySignal(progress, s);
    if (next === progress) return;
    const newly = next.done.length > progress.done.length;
    progress = next;
    save();
    render();
    if (newly && !el.hidden) sh.sound(isComplete(progress) ? 'levelUp' : 'confirm');
  };

  collapseBtn.addEventListener('click', () => { progress = { ...progress, collapsed: !progress.collapsed }; save(); render(); sh.sound('click'); sh.requestLayout(); });
  closeBtn.addEventListener('click', () => { progress = { ...progress, dismissed: true }; save(); update(mode); sh.sound('close'); });

  // ---- real events ----
  const household = () => new Set(activeHousehold(api.state() ?? ({} as WorldState))?.memberIds ?? []);
  const onEvent = (e: GameEvent) => {
    if (!active()) return;
    switch (e.type) {
      case 'action.started':
      case 'action.finished': {
        if (!household().has(e.personId)) return;
        const behavior = api.content.interactions[e.interactionId]?.behavior;
        signal({ type: 'action', phase: e.type === 'action.started' ? 'started' : 'finished', interactionId: e.interactionId, ...(behavior ? { behavior } : {}), ...(e.type === 'action.finished' ? { result: e.result } : {}) });
        return;
      }
      case 'career': if (household().has(e.personId)) signal({ type: 'career', what: e.what }); return;
      case 'social': {
        const hh = household();
        const a = hh.has(e.actorId), b = hh.has(e.targetId);
        if (a !== b) signal({ type: 'social', withOutsider: true });
        return;
      }
      case 'relationship': {
        const hh = household();
        if (hh.has(e.fromId) !== hh.has(e.toId)) signal({ type: 'social', withOutsider: true });
        return;
      }
      case 'money':
        if (placing === 'buy' || (ended?.source === 'buy' && performance.now() - ended.at < 1000)) { signal({ type: 'placed', source: 'buy' }); if (ended?.source === 'buy') ended = null; }
        return;
      case 'lot.changed':
        if (e.what === 'objects' || e.what === 'all') {
          if (placing) changedWhilePlacing = true;
          else if (ended && performance.now() - ended.at < 1000) { signal({ type: 'placed', source: ended.source }); ended = null; }
        }
        if (e.what === 'walls' && lastPaintKind === 'wall') signal({ type: 'painted', kind: 'wall' });
        return;
      case 'person.changed': {
        if (!household().has(e.personId)) return;
        const p = api.state()?.people[e.personId];
        const now = p?.career?.careerId ?? null;
        if (careers.get(e.personId) === null && now) signal({ type: 'careerJoined' });
        careers.set(e.personId, now);
        return;
      }
      default: return;
    }
  };
  const unsubEvents = api.events.onAny(onEvent);
  const unsubChange = api.onChange((w) => {
    if (w === 'selection' && api.selected()) signal({ type: 'selected' });
    if (w === 'placement') {
      const pl = api.placement();
      if (pl) {
        if (placing !== pl.source) { placing = pl.source; changedWhilePlacing = false; }
      } else if (placing) {
        if (changedWhilePlacing) signal({ type: 'placed', source: placing });
        else ended = { source: placing, at: performance.now() };
        placing = null;
        changedWhilePlacing = false;
      }
    }
    if (w === 'paint') { const t = api.paintTool(); if (t && t.kind !== 'eyedropper') lastPaintKind = t.kind; }
    if (w === 'settings') update(mode);
  });

  load();

  return {
    el,
    signal,
    show: () => {
      if (!api.settings().tutorial) api.setSettings({ tutorial: true });
      progress = { ...progress, dismissed: false, collapsed: false };
      save();
      render();
      update(mode);
    },
    update,
    onStateReplaced: load,
    destroy: () => { unsubEvents(); unsubChange(); el.remove(); },
  };
}
