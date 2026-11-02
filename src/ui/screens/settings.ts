// Settings: volumes, reduced camera motion, text size, graphics quality and shadows, autonomy (on/off and
// level), neighbour visits, performance overlay and tutorial. Device settings go through api.setSettings
// (the game stores them in localStorage); world settings go through api.setSimSettings (stored in the save).

import type { GameSettings } from '../../game/api';
import type { SimSettings } from '../../core/types';
import { modal, segmented, slider } from '../kit/components';
import { h } from '../kit/dom';
import { icon } from '../kit/icons';
import { toggleSwitch } from '../kit/controls';
import type { Shell } from '../hud/shell';

const TEXT_SIZES: Array<{ id: string; label: string; value: number }> = [
  { id: '90', label: '90 %', value: 0.9 }, { id: '100', label: '100 %', value: 1 }, { id: '115', label: '115 %', value: 1.15 }, { id: '130', label: '130 %', value: 1.3 },
];

function nearestTextSize(v: number): string {
  let best = TEXT_SIZES[1]!;
  for (const t of TEXT_SIZES) if (Math.abs(t.value - v) < Math.abs(best.value - v)) best = t;
  return best.id;
}

export function openSettings(sh: Shell): void {
  const { api } = sh;
  const m = modal({ title: 'Settings', wide: true, onClose: () => unsub() });
  m.el.classList.add('settings-modal');
  const cfg = (): GameSettings => api.settings();
  const set = (patch: Partial<GameSettings>) => api.setSettings(patch);
  const st = api.state();
  const sim = st?.settings;
  const setSim = (patch: Partial<SimSettings>) => { api.setSimSettings(patch); };
  const section = (title: string, iconName: string, ...children: Array<HTMLElement | null>) =>
    h('section', { class: 'settings-section' }, h('h3', { class: 'settings-head' }, icon(iconName, 20), h('span', { text: title })), ...children);

  const pct = (v: number) => `${Math.round(v)} %`;
  let lastPreview = 0;
  const preview = () => { const now = performance.now(); if (now - lastPreview > 250) { lastPreview = now; sh.sound('click'); } };
  const vol = (label: string, key: 'masterVolume' | 'soundVolume' | 'musicVolume') =>
    slider({ label, min: 0, max: 100, step: 5, value: Math.round(cfg()[key] * 100), format: pct, onInput: (v) => set({ [key]: v / 100 } as Partial<GameSettings>), onCommit: preview });

  const reduced = toggleSwitch({ label: 'Reduced camera motion', hint: 'Snappier camera moves without smooth swings.', value: cfg().reducedMotion, onChange: (on) => { set({ reducedMotion: on }); sh.sound('toggle'); } });
  const text = segmented({ label: 'Text size', value: nearestTextSize(cfg().textScale), options: TEXT_SIZES.map((t) => ({ id: t.id, label: t.label })), onChange: (id) => { const t = TEXT_SIZES.find((x) => x.id === id); if (t) set({ textScale: t.value }); sh.sound('toggle'); } });
  const quality = segmented({ label: 'Graphics quality', value: cfg().quality, options: [{ id: 'low', label: 'Low (faster)' }, { id: 'high', label: 'High' }], onChange: (q) => { set({ quality: q }); sh.sound('toggle'); } });
  const style = segmented({ label: 'Character style', value: cfg().characterStyle, options: [{ id: 'mpfb', label: 'Natural' }, { id: 'detailed', label: 'Detailed' }, { id: 'classic', label: 'Classic (lighter)' }], onChange: (v) => { set({ characterStyle: v }); sh.sound('toggle'); } });
  const shadows = toggleSwitch({ label: 'Shadows', hint: 'Soft shadows under people and furniture.', value: cfg().shadows, onChange: (on) => { set({ shadows: on }); sh.sound('toggle'); } });

  const noGame = 'Available while a game is running.';
  const autonomy = toggleSwitch({ label: 'Autonomy', hint: 'Household members look after themselves when idle.', value: sim?.autonomy ?? true, disabled: !sim, onChange: (on) => { setSim({ autonomy: on }); level.el.classList.toggle('is-disabled', !on); sh.sound('toggle'); } });
  if (!sim) autonomy.setDisabled(true, noGame);
  const level = segmented<'0' | '1' | '2'>({
    label: 'How independent', value: String(sim?.autonomyLevel ?? 1) as '0' | '1' | '2',
    options: [{ id: '0', label: 'Urgent needs only' }, { id: '1', label: 'Normal' }, { id: '2', label: 'Very independent' }],
    onChange: (v) => { setSim({ autonomyLevel: Number(v) as 0 | 1 | 2 }); sh.sound('toggle'); },
  });
  if (!sim || !sim.autonomy) level.el.classList.add('is-disabled');
  if (!sim) for (const b of level.el.querySelectorAll('button')) b.disabled = true;
  const visitors = toggleSwitch({ label: 'Neighbour visits', hint: 'Neighbours may drop by on their own.', value: sim?.visitors ?? true, disabled: !sim, onChange: (on) => { setSim({ visitors: on }); sh.sound('toggle'); } });
  if (!sim) visitors.setDisabled(true, noGame);

  const stats = toggleSwitch({ label: 'Performance overlay', hint: 'Frame rate, draw calls and simulation timing.', value: cfg().showStats, onChange: (on) => { set({ showStats: on }); sh.sound('toggle'); } });
  const tutorial = toggleSwitch({ label: 'Tutorial', hint: 'Show the Guided Start checklist.', value: cfg().tutorial, onChange: (on) => { set({ tutorial: on }); sh.sound('toggle'); } });

  m.body.append(
    section('Sound', 'sound', vol('Master volume', 'masterVolume').el, vol('Sound effects', 'soundVolume').el, vol('Music', 'musicVolume').el),
    section('Display', 'sun', text.el, h('p', { class: 'text-preview', text: 'The quick brown fox naps by the hearth.' }), reduced.el, quality.el, style.el, shadows.el),
    section('Household life', 'people', autonomy.el, level.el, visitors.el, sim?.unlimitedFunds ? h('p', { class: 'muted-note' }, icon('build', 18), h('span', { text: 'This world has unlimited building funds (Build Sandbox).' })) : null),
    section('Help', 'info', tutorial.el, stats.el,
      h('details', { class: 'shortcuts' }, h('summary', { text: 'Keyboard shortcuts' }),
        h('dl', { class: 'facts' },
          ...([['WASD / arrows', 'Move the camera'], ['Q / E', 'Turn the camera'], ['+ / -', 'Zoom'], ['Space', 'Pause or resume'], ['1 / 2 / 3', 'Game speed'], ['Esc', 'Cancel or close'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo (Buy and Build)'], ['R', 'Rotate the object being placed'], ['Delete', 'Sell the selected object (Buy)']] as const)
            .flatMap(([k, v]) => [h('dt', {}, h('kbd', { text: k })), h('dd', { text: v })])))),
    h('p', { class: 'muted-note' }, icon('check', 18), h('span', { text: 'Changes apply right away and are remembered on this device. Household life settings are saved with the world.' })),
  );

  const unsub = api.onChange((w) => {
    if (w !== 'settings') return;
    const c = cfg();
    reduced.set(c.reducedMotion); shadows.set(c.shadows); stats.set(c.showStats); tutorial.set(c.tutorial);
    quality.set(c.quality); style.set(c.characterStyle); text.set(nearestTextSize(c.textScale));
  });
}
