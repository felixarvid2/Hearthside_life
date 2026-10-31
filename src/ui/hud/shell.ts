// Shared context handed from the app root (src/ui/app.ts) to the HUD pieces and screens.

import type { GameAPI, PickResult, SoundId } from '../../game/api';
import type { Id } from '../../core/types';
import type { TutorialSignal } from './tutorialSteps';

export type ShellPanelKind = 'person' | 'feed' | 'ledger';
export type PersonTab = 'needs' | 'queue' | 'relationships' | 'career' | 'skills' | 'aspiration' | 'traits';

export interface Shell {
  api: GameAPI;
  /** #ui-root: screens and mode panels are mounted here. */
  root: HTMLElement;
  /** The shell's own pointer-transparent layer inside root (HUD, menus, toasts). */
  layer: HTMLElement;
  sound(id: SoundId): void;
  /** Opens one of the shell's contextual panels (closing the others). */
  openPanel(kind: ShellPanelKind, opts?: { personId?: Id; tab?: PersonTab }): void;
  closePanels(): void;
  isPanelOpen(kind: ShellPanelKind): boolean;
  openGameMenu(): void;
  openSettings(): void;
  openContextMenu(personId: Id, pick: PickResult, at?: { x: number; y: number }): void;
  closeContextMenu(): boolean;
  isContextMenuOpen(): boolean;
  tutorialSignal(s: TutorialSignal): void;
  showTutorial(): void;
  /** Re-measure covered screen areas (after panels open/close/resize). */
  requestLayout(): void;
  /** Canvas-relative point to ui-root coordinates. */
  canvasToRoot(p: { x: number; y: number }): { x: number; y: number };
}
