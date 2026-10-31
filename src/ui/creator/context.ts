// Shared state handed to every creator step view.

import type { CreatorResult, CreatorSession, CreatorStep } from '../../characters/creator';
import type { HairDef } from '../../content/types';
import type { HouseholdDraft } from '../../core/drafts';
import type { OutfitCategory, StartMode } from '../../core/types';
import type { GameAPI, SoundId } from '../../game/api';
import type { PreviewController } from './preview';

export type FaceBodySection = 'body' | 'skin' | 'face' | 'eyes' | 'details';

/** UI-only choices that survive step, member and orientation changes (never stored in the draft). */
export interface CreatorUiState {
  faceBodySection: FaceBodySection;
  /** Open face slider groups. */
  faceGroups: Set<string>;
  hairLength: 'all' | HairDef['length'];
  clothingCategory: OutfitCategory;
  /** Selected outfit per category (clamped to the list). */
  outfitIndex: Record<OutfitCategory, number>;
  prefMode: 'likes' | 'dislikes';
  /** Members (by index) whose custom pronoun fields are open although their pronouns match a preset. */
  customPronouns: Set<number>;
  /** Include outfits when pasting or loading an appearance. */
  pasteOutfits: boolean;
}

export function initialUiState(): CreatorUiState {
  return {
    faceBodySection: 'body',
    faceGroups: new Set(['head']),
    hairLength: 'all',
    clothingCategory: 'everyday',
    outfitIndex: { everyday: 0, formal: 0, work: 0, athletic: 0, sleep: 0, swim: 0 },
    prefMode: 'likes',
    customPronouns: new Set(),
    pasteOutfits: true,
  };
}

export type AnyResult = CreatorResult | { ok: false; reason: string };

export interface CreatorContext {
  readonly api: GameAPI;
  /** The current editing session (replaced when a premade household or template is loaded). */
  readonly session: CreatorSession;
  readonly ui: CreatorUiState;
  readonly preview: PreviewController;
  /** 'creator' for new households, 'wardrobe' for one existing person's outfits. */
  readonly kind: 'creator' | 'wardrobe';
  readonly startMode: StartMode | null;
  /** Shows the outcome of an edit: the reason on failure, the note on success. Returns ok. */
  report(r: AnyResult): boolean;
  /** Shows a message in the panel's status line. */
  status(text: string, kind?: 'info' | 'warning' | 'success'): void;
  /** Rebuilds the current step view (after a UI-only change of its structure). */
  refresh(): void;
  /** Jumps to a step (and member), used by Review's Fix links. */
  goTo(step: CreatorStep, member?: number | null, message?: string): void;
  /** Replaces the whole household with a new draft (premades, templates). Locks carry over. */
  replaceDraft(draft: HouseholdDraft, message: string): void;
  sound(id: SoundId): void;
  /** Portrait image (data URL) of a member, null while not rendered yet. */
  portraitOf(index: number): string | null;
}

export interface StepView {
  el: HTMLElement;
  /** Re-reads the session and updates the DOM where values changed. */
  sync(): void;
  destroy?(): void;
}

export interface StepDef {
  /** Structural key: the view is rebuilt when it changes and synced otherwise. */
  key(ctx: CreatorContext): string;
  build(ctx: CreatorContext): StepView;
  /** Called when the step becomes the current step (preview view changes and the like). */
  enter?(ctx: CreatorContext): void;
  leave?(ctx: CreatorContext): void;
}
