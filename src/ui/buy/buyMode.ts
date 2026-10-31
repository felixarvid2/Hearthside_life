// OWNER: UI editors agent (buy/build panels). Stub until implemented.
import type { GameAPI } from '../../game/api';
import type { ModeUI } from '../modes/types';

/** Buy mode panels: catalog, placement controls, selected-object actions, inventory. */
export function mountBuyMode(root: HTMLElement, api: GameAPI): ModeUI {
  void api;
  const el = document.createElement('div');
  root.appendChild(el);
  return { el, show() { el.hidden = false; }, hide() { el.hidden = true; }, destroy() { el.remove(); } };
}
