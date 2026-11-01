// OWNER: UI editors agent. Buy-mode furniture catalog: category tabs, search, filters (room, price tier,
// functional/decorative), favourites and recently used (localStorage), paginated card grid and a detail card
// with the Buy button. Reads definitions through api.content (only status 'ready').

import type { GameAPI } from '../../game/api';
import type { CatalogCategory, ObjectDef, PriceTier } from '../../content/types';
import { button, cardGrid, tabs, toast, type CardGrid, type Tabs } from '../kit/components';
import { h, setChildren, setText, toggleClass } from '../kit/dom';
import { icon } from '../kit/icons';
import {
  affordReason, fundsInfo, formatMoney, humanize, loadList, matchesQuery, play, pushRecent, saveList, searchField,
  selectField, setBadge, thumbImg,
} from './editorCommon';

export const CATEGORY_ORDER: CatalogCategory[] = [
  'seating', 'beds', 'tables', 'storage', 'kitchen', 'bathroom', 'lighting', 'electronics', 'hobby', 'decor', 'outdoor', 'kids',
];

export const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  seating: 'Seating', beds: 'Beds', tables: 'Tables & desks', storage: 'Storage', kitchen: 'Kitchen', bathroom: 'Bathroom',
  lighting: 'Lighting', electronics: 'Electronics', hobby: 'Hobby & skills', decor: 'Decor', outdoor: 'Outdoor', kids: 'Kids',
};

const TIER_ORDER: PriceTier[] = ['budget', 'standard', 'premium', 'luxury'];
const TIER_LABELS: Record<PriceTier, string> = { budget: 'Budget', standard: 'Standard', premium: 'Premium', luxury: 'Luxury' };

const FAV_KEY = 'hearthside.buy.favourites';
const RECENT_KEY = 'hearthside.buy.recent';

export interface CatalogView {
  el: HTMLElement;
  /** Re-reads definitions from api.content (categories, rooms, tiers). */
  reloadContent(): void;
  /** Funds changed: refresh "Over budget" labels and the Buy button. */
  refreshFunds(): void;
  /** Opens the detail card for a definition (null returns to the grid). */
  showDetail(defId: string | null): void;
  /** Records an item as recently used. */
  noteUsed(defId: string): void;
}

export function isReadyObject(d: ObjectDef | undefined): d is ObjectDef {
  return !!d && d.status === 'ready';
}

export function catalogView(api: GameAPI, opts: { onDetail?: (open: boolean) => void } = {}): CatalogView {
  let ready: ObjectDef[] = [];
  let byId = new Map<string, ObjectDef>();
  let tab = 'all';
  let query = '';
  let room = '';
  let tier = '';
  let kind: '' | 'functional' | 'decorative' = '';
  let detailId: string | null = null;
  let favs = new Set(loadList(FAV_KEY));
  let recent = loadList(RECENT_KEY);
  let showFilters = false;
  let showSearch = false;
  let lastFundsKey = '';

  // ---- browse section: [search][filters][category tabs], then the optional search row and filters ----
  const search = searchField({ label: 'Search the catalog', placeholder: 'Search furniture', value: '', onInput: (v) => { query = v; renderGrid(); } });
  const searchRow = h('div', { class: 'bb-toolbar', attrs: { id: 'bb-buy-search' } }, search.el);
  const searchBtn = button({
    icon: 'search', iconOnly: true, label: 'Search',
    onClick: () => {
      if (showSearch) { showSearch = false; if (query) { query = ''; search.set(''); renderGrid(); } } else showSearch = true;
      syncFilters();
      if (showSearch) search.input.focus();
    },
  });
  searchBtn.setAttribute('aria-controls', 'bb-buy-search');
  const filterBtn = button({ icon: 'filter', iconOnly: true, label: 'Filters', onClick: () => { showFilters = !showFilters; syncFilters(); } });
  filterBtn.classList.add('bb-filter-btn');
  const roomSel = selectField({ label: 'Room', options: [], value: '', onChange: (v) => { room = v; syncFilters(); renderGrid(); } });
  const tierSel = selectField({ label: 'Price', options: [], value: '', onChange: (v) => { tier = v; syncFilters(); renderGrid(); } });
  const kindSel = selectField({
    label: 'Type',
    options: [{ id: '', label: 'All items' }, { id: 'functional', label: 'Functional' }, { id: 'decorative', label: 'Decorative' }],
    value: '', onChange: (v) => { kind = v === 'functional' || v === 'decorative' ? v : ''; syncFilters(); renderGrid(); },
  });
  const clearFilters = button({ label: 'Clear filters', variant: 'ghost', onClick: () => { room = ''; tier = ''; kind = ''; roomSel.select.value = ''; tierSel.select.value = ''; kindSel.select.value = ''; syncFilters(); renderGrid(); } });
  const filters = h('div', { class: 'bb-filters', attrs: { id: `bb-buy-filters` } }, roomSel.el, tierSel.el, kindSel.el, clearFilters);
  filterBtn.setAttribute('aria-controls', 'bb-buy-filters');
  const tabsHost = h('div', { class: 'bb-cats' });
  const count = h('p', { class: 'bb-sr', role: 'status' });
  const gridHost = h('div', { class: 'bb-grid-host' });
  const browse = h('div', { class: 'bb-browse' }, h('div', { class: 'bb-catbar' }, searchBtn, filterBtn, tabsHost), searchRow, filters, count, gridHost);

  // ---- detail section ----
  const detail = h('div', { class: 'bb-detail' });
  detail.hidden = true;

  const el = h('div', { class: 'bb-catalog' }, browse, detail);

  let catTabs: Tabs | null = null;
  let grid: CardGrid<ObjectDef> | null = null;
  let gridKey = '';

  const thumb = (defId: string) => thumbImg(() => api.thumbnails.furniture(defId));

  function syncFilters(): void {
    filters.hidden = !showFilters;
    filterBtn.setAttribute('aria-expanded', String(showFilters));
    searchRow.hidden = !showSearch;
    searchBtn.setAttribute('aria-expanded', String(showSearch));
    toggleClass(searchBtn, 'is-active', showSearch);
    const sl = showSearch ? 'Close search' : 'Search';
    searchBtn.setAttribute('aria-label', sl);
    searchBtn.title = sl;
    const active = (room ? 1 : 0) + (tier ? 1 : 0) + (kind ? 1 : 0);
    const fl = active ? `Filters (${active} on)` : 'Filters';
    filterBtn.setAttribute('aria-label', fl);
    filterBtn.title = fl;
    setBadge(filterBtn, active);
    toggleClass(filterBtn, 'is-active', showFilters || active > 0);
    clearFilters.hidden = active === 0;
  }

  function reloadContent(): void {
    ready = Object.values(api.content.objects).filter(isReadyObject);
    byId = new Map(ready.map((d) => [d.id, d]));
    const rooms = [...new Set(ready.flatMap((d) => d.rooms))].sort();
    roomSel.setOptions([{ id: '', label: 'Any room' }, ...rooms.map((r) => ({ id: r, label: humanize(r) }))], room);
    room = roomSel.select.value;
    const tiers = TIER_ORDER.filter((t) => ready.some((d) => d.tier === t));
    tierSel.setOptions([{ id: '', label: 'Any price' }, ...tiers.map((t) => ({ id: t, label: TIER_LABELS[t] }))], tier);
    tier = tierSel.select.value;
    search.input.placeholder = `Search ${ready.length} items`;
    const cats = CATEGORY_ORDER.filter((c) => ready.some((d) => d.category === c));
    if (tab !== 'all' && tab !== 'favs' && tab !== 'recent' && !cats.includes(tab as CatalogCategory)) tab = 'all';
    catTabs = tabs({
      label: 'Catalog categories',
      value: tab,
      items: [
        { id: 'all', label: 'All' },
        { id: 'favs', label: 'Favourites', icon: 'star' },
        { id: 'recent', label: 'Recent', icon: 'clock' },
        ...cats.map((c) => ({ id: c, label: CATEGORY_LABELS[c] })),
      ],
      onChange: (id) => { tab = id; renderGrid(); },
    });
    catTabs.el.classList.add('bb-cat-tabs');
    setChildren(tabsHost, catTabs.el);
    syncFilters();
    gridKey = '';
    renderGrid();
    if (detailId && !byId.has(detailId)) showDetail(null);
  }

  function filtered(): ObjectDef[] {
    let list: ObjectDef[];
    if (tab === 'recent') list = recent.map((id) => byId.get(id)).filter(isReadyObject);
    else if (tab === 'favs') list = ready.filter((d) => favs.has(d.id));
    else if (tab === 'all') list = ready.slice();
    else list = ready.filter((d) => d.category === tab);
    if (room) list = list.filter((d) => d.rooms.includes(room));
    if (tier) list = list.filter((d) => d.tier === tier);
    if (kind) list = list.filter((d) => d.functional === (kind === 'functional'));
    if (query) list = list.filter((d) => matchesQuery(query, [d.name, d.description, d.style, d.subcategory, CATEGORY_LABELS[d.category], ...d.tags, ...d.rooms]));
    if (tab !== 'recent') {
      list.sort((a, b) => (CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)) || a.price - b.price || a.name.localeCompare(b.name));
    }
    return list;
  }

  function emptyText(): string {
    if (query || room || tier || kind) return 'Nothing matches these filters. Try another search or clear the filters.';
    if (tab === 'favs') return 'No favourites yet. Open an item and tap "Favourite" to keep it here.';
    if (tab === 'recent') return 'Items you buy will appear here.';
    return ready.length ? 'Nothing in this category yet.' : 'The catalog is still empty.';
  }

  function renderCard(d: ObjectDef): HTMLElement {
    const over = !!affordReason(api, d.price);
    const fav = favs.has(d.id);
    const label = `${d.name}, ${formatMoney(d.price)}${d.functional ? '' : ', decorative'}${over ? ', over budget' : ''}${fav ? ', favourite' : ''}`;
    return h('button', {
      type: 'button',
      class: ['card', 'bb-card', d.id === detailId && 'is-selected'],
      ariaLabel: label,
      dataset: { defId: d.id },
      onClick: () => { play(api, 'tap'); showDetail(d.id); },
    },
    thumb(d.id),
    fav ? h('span', { class: 'bb-fav-mark', attrs: { 'aria-hidden': 'true' } }, icon('star', 16)) : null,
    h('span', { class: 'card-name', text: d.name }),
    h('span', { class: 'card-meta' }, h('span', { text: formatMoney(d.price) }), over ? h('span', { class: 'bb-over', text: 'Over budget' }) : null));
  }

  function renderGrid(): void {
    const key = `buy:${tab}:${room}:${tier}:${kind}:${query.toLowerCase()}`;
    const items = filtered();
    if (key !== gridKey || !grid) {
      gridKey = key;
      grid = cardGrid<ObjectDef>({ key, render: renderCard, empty: emptyText() });
      setChildren(gridHost, grid.el);
    }
    grid.setItems(items);
    setText(count, items.length === 1 ? '1 item' : `${items.length} items`);
  }

  // ---- detail ----
  let detailBuy: HTMLButtonElement | null = null;
  let detailReason: HTMLElement | null = null;
  let detailDef: ObjectDef | null = null;

  function toggleFav(defId: string, btn: HTMLButtonElement): void {
    if (favs.has(defId)) favs.delete(defId); else favs.add(defId);
    favs = new Set(favs);
    saveList(FAV_KEY, [...favs]);
    const on = favs.has(defId);
    btn.setAttribute('aria-pressed', String(on));
    const l = btn.querySelector('.btn-label');
    if (l) setText(l as HTMLElement, on ? 'Favourited' : 'Favourite');
    btn.title = on ? 'Remove from favourites' : 'Add to favourites';
    play(api, 'toggle');
    grid?.refresh();
  }

  function syncBuy(): void {
    if (!detailDef || !detailBuy || !detailReason) return;
    const reason = affordReason(api, detailDef.price);
    const f = fundsInfo(api);
    detailBuy.disabled = !!reason;
    const label = detailBuy.querySelector('.btn-label');
    if (label) setText(label as HTMLElement, f.unlimited ? 'Buy (free in sandbox)' : `Buy for ${formatMoney(detailDef.price)}`);
    setChildren(detailReason, reason ? [icon('warning', 18), h('span', { text: reason })] : null);
    detailReason.hidden = !reason;
  }

  function buy(d: ObjectDef): void {
    const reason = affordReason(api, d.price);
    if (reason) { toast(reason, 'warning'); play(api, 'error'); return; }
    const r = api.startPlacement(d.id);
    if (!r.ok) {
      toast(r.reason, 'error');
      play(api, 'error');
      if (detailReason) { setChildren(detailReason, icon('warning', 18), h('span', { text: r.reason })); detailReason.hidden = false; }
      return;
    }
    noteUsed(d.id);
  }

  function renderDetail(d: ObjectDef): void {
    detailDef = d;
    const back = button({ icon: 'back', label: 'Back', variant: 'ghost', onClick: () => showDetail(null) });
    back.classList.add('bb-back');
    back.setAttribute('aria-label', 'Back to catalog');
    const fav = favs.has(d.id);
    const favBtn = button({ icon: 'star', label: fav ? 'Favourited' : 'Favourite', variant: 'ghost', title: fav ? 'Remove from favourites' : 'Add to favourites', onClick: () => toggleFav(d.id, favBtn) });
    favBtn.classList.add('bb-fav-btn');
    favBtn.setAttribute('aria-pressed', String(fav));

    const stars = h('span', { class: 'bb-stars', role: 'img', ariaLabel: `Quality ${d.quality} of 5` },
      ...[1, 2, 3, 4, 5].map((i) => h('span', { class: i <= d.quality ? 'is-on' : 'is-off' }, icon('star', 16))),
      h('span', { class: 'bb-stars-text', text: `${d.quality}/5` }));

    const tags = h('div', { class: 'bb-tags' },
      d.functional
        ? h('span', { class: 'bb-tag is-functional' }, icon('check', 14), 'Functional')
        : h('span', { class: 'bb-tag is-decorative' }, icon('sparkle', 14), 'Decorative'),
      h('span', { class: 'bb-tag' }, CATEGORY_LABELS[d.category] ?? humanize(d.category)),
      d.layer === 'surface' ? h('span', { class: 'bb-tag is-needs' }, icon('box', 14), 'Needs a surface') : null,
      d.layer === 'wall' || d.needsWall ? h('span', { class: 'bb-tag is-needs' }, icon('wall', 14), 'Needs a wall') : null,
      d.layer === 'rug' ? h('span', { class: 'bb-tag' }, icon('floor', 14), 'Rug') : null);

    const facts: Array<[string, string]> = [
      ['Size', `${fmtM(d.footprint.w)} wide x ${fmtM(d.footprint.d)} deep (${d.footprint.w} x ${d.footprint.d} tiles)`],
      ['Height', fmtM(d.height)],
      ['Placement', placementText(d)],
    ];
    if (d.rooms.length) facts.push(['Rooms', d.rooms.map(humanize).join(', ')]);
    if (d.style) facts.push(['Style', humanize(d.style)]);
    facts.push(['Price range', TIER_LABELS[d.tier] ?? humanize(d.tier)]);

    const stats = statLines(d);
    const uses = d.interactions.map((id) => api.content.interactions[id]?.name ?? humanize(id));

    const finishes = d.finishes.filter((r) => r.swatches.length > 0);

    detailBuy = button({ icon: 'buy', label: 'Buy', variant: 'primary', onClick: () => detailDef && buy(detailDef) });
    detailBuy.classList.add('bb-buy-btn');
    detailReason = h('p', { class: 'bb-hint bb-buy-reason', role: 'status' });
    detailReason.hidden = true;

    setChildren(detail,
      h('div', { class: 'bb-detail-top' }, back, favBtn),
      h('div', { class: 'bb-detail-head' },
        h('div', { class: 'bb-detail-thumb' }, thumb(d.id)),
        h('div', { class: 'bb-detail-info' },
          h('h3', { class: 'bb-detail-name', text: d.name }),
          h('div', { class: 'bb-price', text: formatMoney(d.price) }),
          stars)),
      tags,
      d.description ? h('p', { class: 'bb-note', text: d.description }) : null,
      h('dl', { class: 'bb-facts' }, ...facts.map(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
      h('div', { class: 'bb-section' },
        h('h4', { class: 'bb-section-title', text: 'What it does' }),
        stats.length || uses.length
          ? h('ul', { class: 'bb-stats' },
            uses.length ? h('li', null, h('strong', { text: 'Lets people: ' }), uses.join(', ')) : null,
            ...stats.map(([k, v]) => h('li', null, h('strong', { text: `${k}: ` }), v)))
          : h('p', { class: 'bb-note', text: d.functional ? 'No special effects.' : 'Purely decorative: it makes a room look nicer but has no interactions.' })),
      finishes.length ? h('div', { class: 'bb-section' },
        h('h4', { class: 'bb-section-title', text: 'Finishes' }),
        ...finishes.map((r) => h('div', { class: 'bb-finish-preview' },
          h('span', { class: 'bb-finish-label', text: `${r.label} (${r.swatches.length})` }),
          h('span', { class: 'bb-dots', role: 'img', ariaLabel: `${r.label}: ${r.swatches.map((s) => s.name).join(', ')}` },
            ...r.swatches.map((s) => { const dot = h('span', { class: 'bb-dot', title: s.name }); dot.style.background = s.color; return dot; })))),
        h('p', { class: 'bb-note bb-muted', text: 'Change finishes after placing: tap the object, then pick a swatch.' })) : null,
      h('div', { class: 'bb-buy-row' }, detailReason, detailBuy));
    syncBuy();
  }

  function showDetail(defId: string | null): void {
    const d = defId ? byId.get(defId) : undefined;
    const wasOpen = detailId !== null;
    detailId = d ? d.id : null;
    if (wasOpen !== !!d) opts.onDetail?.(!!d);
    if (d) renderDetail(d); else { detailDef = null; detailBuy = null; detailReason = null; }
    browse.hidden = !!d;
    detail.hidden = !d;
    grid?.refresh();
    if (d) {
      el.closest('.panel-body')?.scrollTo?.({ top: 0 });
      (detail.querySelector('.bb-back') as HTMLElement | null)?.focus({ preventScroll: true });
    } else {
      const card = gridHost.querySelector(`[data-def-id="${CSS.escape(defId ?? '')}"]`) as HTMLElement | null;
      card?.focus({ preventScroll: false });
    }
  }

  function noteUsed(defId: string): void {
    recent = pushRecent(recent, defId);
    saveList(RECENT_KEY, recent);
    if (tab === 'recent') renderGrid();
  }

  function refreshFunds(): void {
    const f = fundsInfo(api);
    const key = `${f.funds}|${f.unlimited}|${!!f.household}`;
    if (key === lastFundsKey) return;
    lastFundsKey = key;
    grid?.refresh();
    syncBuy();
  }

  reloadContent();
  lastFundsKey = '';
  return { el, reloadContent, refreshFunds, showDetail, noteUsed };
}

// ---------------------------------------------------------------------------------------------
// Plain-language descriptions
// ---------------------------------------------------------------------------------------------

function fmtM(m: number): string {
  return `${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(m < 1 ? 2 : 1).replace(/0$/, '')} m`;
}

function placementText(d: ObjectDef): string {
  const parts: string[] = [];
  switch (d.layer) {
    case 'floor': parts.push('Stands on the floor'); break;
    case 'rug': parts.push('Lies flat on the floor; furniture can stand on it'); break;
    case 'wall': parts.push('Hangs on a wall'); break;
    case 'surface': parts.push('Goes on a counter, table, desk or other surface'); break;
    case 'ceiling': parts.push('Hangs from the ceiling'); break;
  }
  if (d.needsWall && d.layer !== 'wall') parts.push('needs a wall behind it');
  if (d.surfaceHeight) parts.push(`has a ${fmtM(d.surfaceHeight)} high surface for small items`);
  if (!d.blocksMovement && d.layer === 'floor') parts.push('people can walk over it');
  return parts.join('; ') + '.';
}

function pct(mult: number, more: string, less: string): string {
  const d = Math.round((mult - 1) * 100);
  if (d > 0) return `${d}% ${more} than standard`;
  if (d < 0) return `${-d}% ${less} than standard`;
  return 'standard';
}

function statLines(d: ObjectDef): Array<[string, string]> {
  const s = d.stats;
  const out: Array<[string, string]> = [];
  if (s.comfort !== undefined) {
    const word = s.comfort >= 8 ? 'very comfortable' : s.comfort >= 5 ? 'comfortable' : s.comfort >= 3 ? 'fairly basic' : 'not very comfortable';
    out.push(['Comfort', `${s.comfort} of 10 (${word})`]);
  }
  if (s.energy !== undefined) out.push(['Rest', s.energy === 1 ? 'restores energy at the standard rate' : `restores energy ${pct(s.energy, 'faster', 'slower')}`]);
  if (s.fun !== undefined) out.push(['Fun', s.fun === 1 ? 'standard fun' : `${pct(s.fun, 'more fun', 'less fun')}`]);
  if (s.hygiene !== undefined) out.push(['Hygiene', s.hygiene === 1 ? 'cleans at the standard rate' : `cleans ${pct(s.hygiene, 'better', 'worse')}`]);
  if (s.skill !== undefined) out.push(['Skill practice', s.skill === 1 ? 'standard learning speed' : `learning is ${pct(s.skill, 'faster', 'slower')}`]);
  if (s.cooking !== undefined && s.cooking !== 0) {
    const v = Math.abs(s.cooking) <= 1 ? `${Math.round(s.cooking * 100)}%` : String(s.cooking);
    out.push(['Cooking', s.cooking > 0 ? `meals come out better (+${v} quality)` : `meals come out worse (${v} quality)`]);
  }
  if (s.environment !== undefined && s.environment !== 0) {
    out.push(['Room appeal', s.environment > 0 ? `+${s.environment}: makes the room nicer to be in` : `${s.environment}: makes the room less pleasant`]);
  }
  return out;
}
