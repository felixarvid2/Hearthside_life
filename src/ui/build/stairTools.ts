// Milestone 9: the Stairs section of the Build panel. It chooses the build tool (`stairs` with the staircase and its turn, or
// `eraseStairs`); pointer handling, previews and applying live in buildSession.ts and the game (game/core/build.ts), and the
// footer with Confirm / Turn / Cancel belongs to structureTools.ts. Staircases are ordinary objects, so Buy mode can place,
// turn and sell them too; this tab is the shortcut that works on the floor being built.

import type { ObjectDef } from '../../content/types';
import type { BuildTool, GameAPI } from '../../game/api';
import { formatMoney, thumbImg } from '../buy/editorCommon';
import { cardGrid, segmented, type CardGrid } from '../kit/components';
import { h } from '../kit/dom';
import { layout } from '../kit/layout';

export type StairMode = 'place' | 'remove';

export interface StairTools {
  el: HTMLElement;
  /** The tool the section chooses now (null while nothing is picked). */
  tool(): BuildTool | null;
  /** Re-renders the card grid (content or thumbnails changed). */
  render(): void;
  /** The staircase turn was changed by the footer's Turn button. */
  setRot(rot: number): void;
}

export function createStairTools(deps: { api: GameAPI; onChoose: () => void }): StairTools {
  const { api } = deps;
  const st = { mode: 'place' as StairMode, pick: '', rot: 0 };
  const touch = () => layout().touch;

  const defs = (): ObjectDef[] => Object.values(api.content.objects)
    .filter((d) => d.status === 'ready' && !!d.stair)
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));

  const mode = segmented<StairMode>({
    label: 'Stairs',
    value: st.mode,
    options: [{ id: 'place', label: 'Build', icon: 'plus' }, { id: 'remove', label: 'Remove', icon: 'trash' }],
    onChange: (v) => { st.mode = v; render(); deps.onChoose(); },
  });
  const hint = h('p', { class: 'bb-note bb-muted' });
  const host = h('div', { class: 'bb-stair-host' });
  const el = h('section', { class: 'bb-tool-section', ariaLabel: 'Stairs', dataset: { section: 'stairs' } }, mode.el, hint, host);
  let grid: CardGrid<ObjectDef> | null = null;

  function render(): void {
    mode.set(st.mode);
    const t = touch() ? 'Tap' : 'Click';
    const level = api.view.level?.() ?? 0;
    hint.textContent = st.mode === 'remove'
      ? `${t} a staircase to take it out. The floor above stays open until you lay floor there.`
      : `${t} where the stairs go on Floor ${level + 1}; they lead up to Floor ${level + 2} and open a stairwell in its floor. Turn changes the way they climb.`;
    host.hidden = st.mode === 'remove';
    if (st.mode === 'remove') return;
    const all = defs();
    if (!st.pick || !all.some((d) => d.id === st.pick)) st.pick = all[0]?.id ?? '';
    if (!grid) {
      grid = cardGrid<ObjectDef>({
        key: 'build:stairs',
        pageSize: () => (layout().compact ? 4 : 6),
        empty: 'No staircases are available.',
        render: (d) => {
          const on = st.pick === d.id;
          return h('button', {
            type: 'button', class: ['card', 'bb-card', on && 'is-selected'], dataset: { defId: d.id },
            ariaLabel: `${d.name}, ${formatMoney(d.price)}`, attrs: { 'aria-pressed': on },
            onClick: () => { st.pick = d.id; api.sound('tap'); deps.onChoose(); grid?.refresh(); },
          },
          thumbImg(() => api.thumbnails.furniture(d.id)),
          h('span', { class: 'card-name', text: d.name }),
          h('span', { class: 'card-meta', text: `${d.stair?.kind === 'spiral' ? 'Spiral' : 'Straight'} · ${d.footprint.w} x ${d.footprint.d}` }),
          h('span', { class: 'card-meta bb-card-price', text: formatMoney(d.price) }));
        },
      });
      host.appendChild(grid.el);
    }
    grid.setItems(all);
  }

  return {
    el,
    tool: () => (st.mode === 'remove' ? { kind: 'eraseStairs' } : st.pick ? { kind: 'stairs', defId: st.pick, rot: st.rot } : null),
    render,
    setRot: (rot) => { st.rot = ((rot % 4) + 4) % 4; },
  };
}

