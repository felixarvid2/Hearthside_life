// Contract between the UI shell (src/ui/app.ts) and the screens it mounts.

import type { HouseholdDraft } from '../../core/drafts';
import type { Id, StartMode } from '../../core/types';

/** A mounted screen or mode panel. show/hide may be called repeatedly; destroy removes listeners and DOM. */
export interface ModeUI {
  el: HTMLElement;
  show(): void;
  hide(): void;
  destroy(): void;
}

export interface CreatorScreenOptions {
  mode: StartMode;
  /** Called with a valid household when the player presses Move In. */
  onDone(draft: HouseholdDraft): void;
  onCancel(): void;
}

export interface WardrobeOptions {
  personId: Id;
  onClose(): void;
}
