// In-game menu: Save, Load, Download a backup, Import, Settings, Show tutorial, Quit to main menu.
// The game pauses while the menu is open and resumes afterwards if nothing else changed.

import { confirmDialog, modal } from '../kit/components';
import { append, h } from '../kit/dom';
import { rowButton } from '../kit/controls';
import type { Shell } from '../hud/shell';
import { exportWorldFile, importWorldFile, openLoadDialog, openSaveDialog } from './saves';

export function openGameMenu(sh: Shell): void {
  const { api } = sh;
  const stateAtOpen = api.state();
  const prevSpeed = api.speed();
  const paused = api.mode() === 'live' && prevSpeed !== 0;
  if (paused) api.setSpeed(0);
  const m = modal({
    title: 'Menu',
    onClose: () => {
      if (paused && api.state() === stateAtOpen && api.mode() === 'live' && api.speed() === 0) api.setSpeed(prevSpeed);
    },
  });
  m.el.classList.add('game-menu');
  const then = (fn: () => void) => () => { sh.sound('click'); m.close(); fn(); };
  const guided = stateAtOpen?.startMode === 'guided';
  append(m.body, [
    paused ? h('p', { class: 'muted-note game-menu-paused', text: 'The game is paused while this menu is open.' }) : null,
    h('div', { class: 'menu-choices' },
      rowButton({ icon: 'play', title: 'Resume', onClick: () => { sh.sound('close'); m.close(); } }),
      rowButton({ icon: 'save', title: 'Save game', subtitle: '5 named slots, plus autosave and backup', onClick: then(() => { void openSaveDialog(sh); }) }),
      rowButton({ icon: 'load', title: 'Load game', onClick: then(() => { void openLoadDialog(sh, { fromMenu: false }); }) }),
      rowButton({ icon: 'export', title: 'Download a backup of this world', subtitle: 'Saves a .json file to your device', onClick: () => { exportWorldFile(sh); } }),
      rowButton({ icon: 'import', title: 'Import a world file', subtitle: 'Your current game stays if the file has problems', onClick: then(() => { void importWorldFile(sh); }) }),
      rowButton({ icon: 'settings', title: 'Settings', onClick: then(() => sh.openSettings()) }),
      guided ? rowButton({ icon: 'review', title: 'Show tutorial', subtitle: 'The Guided Start checklist', onClick: then(() => sh.showTutorial()) }) : null,
      rowButton({
        icon: 'door', title: 'Quit to main menu', danger: true, onClick: () => {
          void confirmDialog({ title: 'Quit to the main menu?', text: 'Progress since your last save will be lost. The autosave keeps a recent copy.', confirm: 'Quit', danger: true }).then((ok) => {
            if (!ok) return;
            sh.sound('close');
            sh.closePanels();
            api.showMenu();
            m.close();
          });
        },
      })),
  ]);
}
