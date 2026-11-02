// Shared context handed from the app root (src/ui/app.ts) to the HUD pieces and screens.

import type { GameAPI, PaintPreview, PickResult, SoundId } from '../../game/api';
import type { Id } from '../../core/types';
import type { BuildSession } from '../build/buildSession';
import type { TutorialSignal } from './tutorialSteps';

export type ShellPanelKind = 'person' | 'feed' | 'ledger' | 'bills';
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
  /** Opens the event planner (phone -> Plan an Event) for a household member. */
  openEventPlanner(hostId: Id): void;
  /** Opens the neighbourhood map (HUD Map button); `lotId` shows that place's sheet. */
  openNeighbourhood(opts?: { lotId?: Id }): void;
  /** Shows the "where is X" card for a household member who is off the active lot, next to `anchor`. */
  showAwayCard(personId: Id, anchor: HTMLElement): void;
  hideAwayCard(): boolean;
  openContextMenu(personId: Id, pick: PickResult, at?: { x: number; y: number }): void;
  closeContextMenu(): boolean;
  isContextMenuOpen(): boolean;
  tutorialSignal(s: TutorialSignal): void;
  showTutorial(): void;
  /** Re-measure covered screen areas (after panels open/close/resize). */
  requestLayout(): void;
  /** Forwards a paint preview result (or null when cleared) to the Build panel (BuildModeUI.setPreview). */
  paintPreviewShown(pv: PaintPreview | null): void;
  /** Build mode structure tools: pointer targets, live previews, Confirm / Cancel (src/ui/build/buildSession.ts). */
  build: BuildSession;
  /** Canvas-relative point to ui-root coordinates. */
  canvasToRoot(p: { x: number; y: number }): { x: number; y: number };
}
