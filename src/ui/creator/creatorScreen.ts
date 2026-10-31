// OWNER: creator UI agent. Stub until implemented.
import type { GameAPI } from '../../game/api';
import type { CreatorScreenOptions, ModeUI, WardrobeOptions } from '../modes/types';

/** The 7-step character creator with live preview. */
export function mountCreator(root: HTMLElement, api: GameAPI, opts: CreatorScreenOptions): ModeUI {
  void api; void opts;
  const el = document.createElement('div');
  root.appendChild(el);
  return { el, show() { el.hidden = false; }, hide() { el.hidden = true; }, destroy() { el.remove(); } };
}

/** Wardrobe editor for one existing person (from the editOutfits interaction). */
export function mountWardrobe(root: HTMLElement, api: GameAPI, opts: WardrobeOptions): ModeUI {
  void api; void opts;
  const el = document.createElement('div');
  root.appendChild(el);
  return { el, show() { el.hidden = false; }, hide() { el.hidden = true; }, destroy() { el.remove(); } };
}
