// Milestone 13: the controls of the room edit tool (move, resize, duplicate) in the Build panel. The room itself is chosen by
// tapping it with no tool in use (buildSession.selectRoomAt); the buttons here only change the tool's offset, side or size, and the
// footer (structureTools.ts) shows the live preview and the Confirm / Cancel buttons. Arrow buttons and plus/minus work with a
// finger as well as a mouse; every control is a real button with a text label for screen readers.

import type { BuildTool } from '../../game/api';
import { button, segmented } from '../kit/components';
import { h, setText } from '../kit/dom';
import type { BuildSession } from './buildSession';

type RoomEdit = Extract<BuildTool, { kind: 'roomEdit' }>;
type Side = NonNullable<RoomEdit['side']>;

const SIDE_LABEL: Record<Side, string> = { n: 'North', e: 'East', s: 'South', w: 'West' };

export interface RoomEditTools {
  el: HTMLElement;
  /** Shows or hides the controls for the session's current tool and updates their texts. */
  refresh(): void;
}

export function createRoomEditTools(session: BuildSession): RoomEditTools {
  const title = h('strong', { class: 'bb-roomedit-title' });
  const summary = h('span', { class: 'bb-roomedit-summary', attrs: { 'aria-live': 'polite' } });

  const tool = (): RoomEdit | null => { const t = session.tool(); return t && t.kind === 'roomEdit' ? t : null; };
  const nudge = (dx: number, dz: number) => {
    const t = tool();
    if (t) session.adjustRoomEdit({ dx: (t.dx ?? 0) + dx, dz: (t.dz ?? 0) + dz });
  };

  const pad = h('div', { class: 'bb-roomedit-pad', role: 'group', ariaLabel: 'Move by one tile' },
    button({ icon: 'up', iconOnly: true, label: 'Move one tile north', onClick: () => nudge(0, -1) }),
    button({ icon: 'back', iconOnly: true, label: 'Move one tile west', onClick: () => nudge(-1, 0) }),
    button({ icon: 'down', iconOnly: true, label: 'Move one tile south', onClick: () => nudge(0, 1) }),
    button({ icon: 'next', iconOnly: true, label: 'Move one tile east', onClick: () => nudge(1, 0) }));
  for (const [i, c] of ['n', 'w', 's', 'e'].entries()) (pad.children[i] as HTMLElement).dataset.nudge = c;

  const side = segmented<Side>({
    label: 'Side to move',
    value: 'e',
    options: (['n', 'e', 's', 'w'] as const).map((s) => ({ id: s, label: SIDE_LABEL[s] })),
    onChange: (s) => session.adjustRoomEdit({ side: s, delta: tool()?.delta ?? 1 }),
  });
  const grow = () => { const t = tool(); if (t) session.adjustRoomEdit({ delta: (t.delta ?? 0) + 1 }); };
  const shrink = () => { const t = tool(); if (t) session.adjustRoomEdit({ delta: (t.delta ?? 0) - 1 }); };
  const sizeRow = h('div', { class: 'bb-roomedit-size' },
    button({ icon: 'minus', label: 'Smaller', onClick: shrink }),
    button({ icon: 'plus', label: 'Bigger', onClick: grow }));
  (sizeRow.children[0] as HTMLElement).dataset.resize = 'shrink';
  (sizeRow.children[1] as HTMLElement).dataset.resize = 'grow';

  const copyFurniture = h('label', { class: 'bb-roomedit-copy' });
  const copyBox = h('input', { type: 'checkbox' }) as HTMLInputElement;
  copyBox.addEventListener('change', () => session.adjustRoomEdit({ copyObjects: copyBox.checked }));
  copyFurniture.append(copyBox, h('span', { text: 'Copy the furniture too (bought again)' }));

  const el = h('section', { class: 'bb-roomedit', ariaLabel: 'Room edit', dataset: { section: 'roomEdit' } },
    title, summary, side.el, sizeRow, pad, copyFurniture);
  el.hidden = true;

  const dirText = (dx: number, dz: number): string => {
    const parts: string[] = [];
    if (dz) parts.push(`${Math.abs(dz)} ${dz < 0 ? 'north' : 'south'}`);
    if (dx) parts.push(`${Math.abs(dx)} ${dx < 0 ? 'west' : 'east'}`);
    return parts.length ? parts.join(', ') : 'not moved yet';
  };

  return {
    el,
    refresh() {
      const t = tool();
      el.hidden = !t;
      if (!t) return;
      const resize = t.edit === 'resize';
      setText(title, t.edit === 'move' ? 'Move room' : resize ? 'Resize room' : 'Copy room');
      side.el.hidden = !resize;
      sizeRow.hidden = !resize;
      pad.hidden = resize;
      copyFurniture.hidden = t.edit !== 'duplicate';
      copyBox.checked = t.copyObjects === true;
      if (resize) {
        side.set(t.side ?? 'e');
        const d = t.delta ?? 0;
        setText(summary, `${SIDE_LABEL[t.side ?? 'e']} side: ${d === 0 ? 'unchanged' : d > 0 ? `${d} tile${d === 1 ? '' : 's'} out` : `${-d} tile${d === -1 ? '' : 's'} in`}`);
      } else setText(summary, `Offset: ${dirText(t.dx ?? 0, t.dz ?? 0)}`);
    },
  };
}
