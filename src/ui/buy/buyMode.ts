// OWNER: UI editors agent. Buy mode panel: catalog and inventory tabs, placement controls while
// api.placement() is set, the selected-object card, undo/redo, household funds and the paused indicator.
// One kit panel() (bottom sheet in portrait, side panel in landscape) whose body switches between views.
// Canvas input (ghost movement, object picking, R/Esc/Delete) is handled by the shell's input state machine.

import type { GameAPI } from '../../game/api';
import type { ModeUI } from '../modes/types';
import { panel, tabs, type SheetHeight, type Tabs } from '../kit/components';
import { h, setChildren, toggleClass } from '../kit/dom';
import { layout, onLayoutChange } from '../kit/layout';
import { catalogView } from './catalogView';
import { inventoryView } from './inventoryView';
import { objectView, findObject } from './objectView';
import { placementView } from './placementView';
import { editorStatus, panelInsets, Refresher, reopenButton, setHidden, undoRedo, type Insets } from './editorCommon';
import './buy.css';

export interface BuyModeUI extends ModeUI {
  /** Screen area covered by the Buy panel (for api.view.setInsets); zeros when hidden. */
  getInsets(): Insets;
  /** Opens a catalog item's detail card (e.g. from a tutorial step). */
  showItem(defId: string): void;
}

type Part = 'all' | 'content' | 'funds' | 'undo' | 'inventory' | 'view';
type View = 'browse' | 'placement' | 'object';

/** Buy mode panels: catalog, placement controls, selected-object actions, inventory. */
export function mountBuyMode(root: HTMLElement, api: GameAPI): BuyModeUI {
  const el = h('div', { class: 'bb-mode bb-buy-mode' });
  el.hidden = true;
  root.appendChild(el);

  const p = panel({ title: 'Buy', className: 'bb-panel bb-buy-panel', initialHeight: 'half', onClose: () => { userClosed = true; reopen.hidden = false; } });
  el.appendChild(p.el);

  const status = editorStatus(api, 'buy');
  p.header.insertBefore(status.el, p.header.querySelector('.panel-actions'));

  const refresher = new Refresher<Part>((parts) => run(parts));
  const ur = undoRedo(api, () => refresher.mark('funds', 'inventory', 'view'));

  let browseTab: 'catalog' | 'inventory' = 'catalog';
  let invCount = -1;
  let topTabs: Tabs | null = null;
  const tabsHost = h('div', { class: 'bb-top-tabs' });
  // Sticky first row of the body (scrolls away on landscape phones, where height is scarce).
  const subbar = h('div', { class: 'bb-subbar' }, tabsHost, ur.el);

  let heightBeforeDetail: SheetHeight | null = null;
  const catalog = catalogView(api, {
    // Opening a detail card in portrait expands the sheet; going back restores the height.
    onDetail: (open) => {
      if (open) {
        if (!layout().portrait) return;
        const cur = p.el.dataset.height;
        if (cur !== 'full') { heightBeforeDetail = cur === 'peek' ? 'peek' : 'half'; p.setHeight('full'); }
      } else if (heightBeforeDetail) {
        const hgt = heightBeforeDetail;
        heightBeforeDetail = null;
        if (view === 'browse') p.setHeight(hgt); else heightBeforeAuto = hgt;
      }
    },
  });
  const inventory = inventoryView(api);
  const placement = placementView(api, {
    // After buying, return to the grid (the new object is visible in the world).
    onPlaced: (pl) => { if (pl.source === 'buy') { catalog.noteUsed(pl.defId); catalog.showDetail(null); } },
  });
  const object = objectView(api);
  p.body.append(subbar, catalog.el, inventory.el, placement.el, object.el);
  p.el.append(placement.footer, object.footer);

  const reopen = reopenButton('Catalog', 'buy', () => { userClosed = false; reopen.hidden = true; p.open(); refresher.mark('view'); });
  el.appendChild(reopen);

  let visible = false;
  let userClosed = false;
  let view: View | null = null;
  let heightBeforeAuto: SheetHeight = 'half';

  function buildTopTabs(): void {
    topTabs = tabs({
      label: 'Buy mode sections',
      value: browseTab,
      items: [
        { id: 'catalog', label: 'Catalog' },
        { id: 'inventory', label: 'Inventory', ...(invCount > 0 ? { badge: String(invCount) } : {}) },
      ],
      onChange: (id) => {
        browseTab = id === 'inventory' ? 'inventory' : 'catalog';
        if (view === 'object') api.selectObject(null);
        refresher.mark('view');
        refresher.flush();
      },
    });
    setChildren(tabsHost, topTabs.el);
  }

  function currentView(): View {
    const pl = api.placement();
    if (pl) { placement.update(pl); return 'placement'; }
    const sel = api.selectedObject();
    if (sel && findObject(api, sel) && object.update(sel)) return 'object';
    return 'browse';
  }

  function syncView(): void {
    const next = currentView();
    if (next !== view) {
      if (next !== 'browse' && (view === 'browse' || view === null)) {
        const hgt = p.el.dataset.height;
        heightBeforeAuto = hgt === 'peek' || hgt === 'full' ? hgt : 'half';
      }
      const prev = view;
      view = next;
      toggleClass(p.el, 'bb-auto', next !== 'browse');
      toggleClass(p.el, 'bb-no-close', next !== 'browse');
      if (next === 'browse' && prev !== null) p.setHeight(heightBeforeAuto);
      subbar.hidden = next !== 'browse';
      if (next !== 'browse' && !p.isOpen()) { userClosed = false; reopen.hidden = true; p.open(); }
      p.el.dataset.view = next;
    }
    setHidden(catalog.el, !(next === 'browse' && browseTab === 'catalog'));
    setHidden(inventory.el, !(next === 'browse' && browseTab === 'inventory'));
    setHidden(placement.el, next !== 'placement');
    setHidden(placement.footer, next !== 'placement');
    setHidden(object.el, next !== 'object');
    setHidden(object.footer, next !== 'object');
    const pl = api.placement();
    p.setTitle(next === 'placement' && pl ? placement.title(pl) : next === 'object' ? 'Selected' : 'Buy');
    if (topTabs && topTabs.current() !== browseTab) topTabs.select(browseTab);
  }

  function run(parts: Set<Part>): void {
    if (!visible) return;
    const all = parts.has('all');
    if (all || parts.has('content')) catalog.reloadContent();
    if (all || parts.has('funds')) { status.refresh(); catalog.refreshFunds(); }
    if (all || parts.has('undo')) ur.refresh();
    if (all || parts.has('inventory')) {
      const n = inventory.refresh();
      if (n !== invCount || !topTabs) { invCount = n; buildTopTabs(); }
    }
    syncView();
  }

  const offs: Array<() => void> = [
    api.onChange((what) => {
      switch (what) {
        case 'placement': refresher.mark('view', 'funds'); break;
        case 'selection': refresher.mark('view'); break;
        case 'undo': refresher.mark('undo', 'funds', 'inventory', 'view'); break;
        case 'state': refresher.mark('funds', 'undo', 'inventory', 'view'); break;
        default: break;
      }
    }),
    api.events.on('money', () => refresher.mark('funds')),
    api.events.on('lot.changed', () => refresher.mark('view', 'inventory', 'undo')),
    api.events.on('state.replaced', () => refresher.mark('all')),
    onLayoutChange(() => refresher.mark('view')),
  ];

  return {
    el,
    show() {
      visible = true;
      el.hidden = false;
      if (!userClosed) p.open();
      reopen.hidden = !userClosed;
      refresher.mark('all');
      refresher.flush();
    },
    hide() {
      visible = false;
      el.hidden = true;
      refresher.cancel();
    },
    destroy() {
      visible = false;
      refresher.cancel();
      for (const off of offs.splice(0)) off();
      p.destroy();
      el.remove();
    },
    getInsets: () => (visible ? panelInsets(p.el) : { left: 0, right: 0, top: 0, bottom: 0 }),
    showItem(defId: string) {
      browseTab = 'catalog';
      if (!p.isOpen()) { userClosed = false; reopen.hidden = true; p.open(); }
      catalog.showDetail(defId);
      refresher.mark('view');
    },
  };
}
