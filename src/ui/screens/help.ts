// Help (Milestone 13): a short how-to per topic and the controls for touch and desktop. Opened from the main menu and the
// in-game menu. The topics are the hint catalogue (src/ui/hud/hintState.ts), so the hints and the Help never disagree.

import { modal, tabs } from '../kit/components';
import { h } from '../kit/dom';
import { icon } from '../kit/icons';
import { HINTS } from '../hud/hintState';
import type { Shell } from '../hud/shell';

export const TOUCH_CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['Tap', 'Select a person or object and open its menu'],
  ['Drag one finger', 'Look around the lot (move the camera)'],
  ['Pinch', 'Zoom in and out'],
  ['Twist two fingers', 'Turn the camera'],
  ['Camera buttons', 'Turn left or right, zoom, centre on the selected person'],
  ['Drag a sheet handle', 'Make a bottom panel taller or shorter'],
  ['Tap and hold, then drag', 'Place or move an object, draw walls and rooms in Build mode'],
];

export const DESKTOP_CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['Click', 'Select a person or object and open its menu'],
  ['Drag, WASD or arrow keys', 'Move the camera'],
  ['Scroll or + and -', 'Zoom'],
  ['Q and E', 'Turn the camera'],
  ['Space', 'Pause or resume'],
  ['1, 2 and 3', 'Game speed'],
  ['R', 'Rotate the object being placed (Shift+R the other way)'],
  ['Delete', 'Sell the selected object in Buy mode'],
  ['Ctrl+Z and Ctrl+Y', 'Undo and redo in Buy and Build'],
  ['Esc', 'Close the hint, a panel or a dialog; cancel the current tool'],
  ['Tab and Shift+Tab', 'Move between buttons; Enter or Space presses the focused one'],
  ['Arrow keys on tabs', 'Switch tab; Home and End jump to the first and last'],
];

const controlList = (rows: ReadonlyArray<readonly [string, string]>) =>
  h('dl', { class: 'facts help-controls' }, ...rows.flatMap(([k, v]) => [h('dt', {}, h('kbd', { text: k })), h('dd', { text: v })]));

export function openHelp(sh: Shell, opts: { topic?: string } = {}): void {
  const m = modal({ title: 'Help', wide: true });
  m.el.classList.add('help-modal');
  const topics = h('div', { class: 'help-topics', role: 'tabpanel' },
    ...HINTS.map((t) => {
      const d = h('details', { class: 'help-topic', dataset: { topic: t.id } },
        h('summary', {}, h('span', { text: t.title })),
        h('p', { text: t.text }),
        h('ol', { class: 'help-steps' }, ...t.steps.map((s) => h('li', { text: s }))));
      if (t.id === opts.topic) d.open = true;
      return d;
    }));
  const controls = h('div', { class: 'help-controls-wrap', role: 'tabpanel' },
    h('h3', { class: 'settings-head' }, icon('touch', 20), h('span', { text: 'Touch' })), controlList(TOUCH_CONTROLS),
    h('h3', { class: 'settings-head' }, icon('keyboard', 20), h('span', { text: 'Keyboard and mouse' })), controlList(DESKTOP_CONTROLS));
  const hintsNote = h('p', { class: 'muted-note' }, icon('info', 18), h('span', { text: 'Short hints appear the first time you reach each situation. Turn them off, or see them all again, in Settings > Help.' }));
  const show = (id: string) => { topics.hidden = id !== 'topics'; controls.hidden = id !== 'controls'; };
  const bar = tabs({ label: 'Help sections', value: opts.topic === 'controls' ? 'controls' : 'topics', items: [{ id: 'topics', label: 'How to play', icon: 'review' }, { id: 'controls', label: 'Controls', icon: 'keyboard' }], onChange: (id) => { show(id); sh.sound('click'); } });
  show(bar.current());
  m.body.append(bar.el, hintsNote, topics, controls);
  m.footer.append(h('button', { type: 'button', class: 'btn btn-primary', text: 'Close', onClick: () => m.close() }));
}
