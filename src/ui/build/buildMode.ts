// OWNER: UI editors agent. Build mode panel (M1: finishes): Walls / Floors tabs, design grid from
// content.wallDesigns / floorDesigns ('ready' only) with family tabs, search and style filter, palette
// swatches, scope (one side or tile / whole room), eyedropper, recently used finishes, live preview result,
// walls up/cutaway/down, undo/redo and funds.
// The panel sets the paint tool (api.setPaintTool); the shell's input state machine routes canvas taps to
// api.paintPreview / api.paintApply / api.eyedrop. The panel follows api.paintTool() through onChange('paint').

import type { CutawayMode, GameAPI, PaintPreview } from '../../game/api';
import type { FinishRef } from '../../core/types';
import type { SurfaceDesign } from '../../content/types';
import type { ModeUI } from '../modes/types';
import { button, cardGrid, panel, segmented, tabs, toast, type CardGrid, type Tabs } from '../kit/components';
import { h, setChildren, setText, toggleClass } from '../kit/dom';
import { icon } from '../kit/icons';
import {
  affordReason, editorStatus, fundsInfo, formatMoney, humanize, matchesQuery, panelInsets, play, Refresher, reopenButton,
  searchField, selectField, setAttr, setBadge, setHidden, stripes, thumbImg, undoRedo, type Insets,
} from '../buy/editorCommon';
import './build.css';

export interface BuildModeUI extends ModeUI {
  /** Shows the result of the latest api.paintPreview(pick) (the shell calls this after each preview; null clears it). */
  setPreview(p: PaintPreview | null): void;
  /** Screen area covered by the Build panel (for api.view.setInsets); zeros when hidden. */
  getInsets(): Insets;
}

type Kind = 'wall' | 'floor';
type Part = 'all' | 'content' | 'funds' | 'undo' | 'tool' | 'recent' | 'camera' | 'current';

interface KindState {
  finish: FinishRef | null;
  scopeRoom: boolean;
  query: string;
  family: string;
  tag: string;
}

const UNIT: Record<Kind, { one: string; many: string; short: string }> = {
  wall: { one: 'wall side', many: 'wall sides', short: 'side' },
  floor: { one: 'tile', many: 'tiles', short: 'tile' },
};

/** Optional getter a Game implementation may offer for the latest preview (see "Contract changes needed"). */
type PreviewSource = GameAPI & { lastPaintPreview?: () => PaintPreview | null };

/** Build mode panels: wall and floor finish catalogs, palettes, scope, eyedropper, undo/redo. */
export function mountBuildMode(root: HTMLElement, api: GameAPI): BuildModeUI {
  const el = h('div', { class: 'bb-mode bb-build-mode' });
  el.hidden = true;
  root.appendChild(el);

  const p = panel({ title: 'Build', className: 'bb-panel bb-build-panel', initialHeight: 'half', onClose: () => { userClosed = true; reopen.hidden = false; } });
  el.appendChild(p.el);
  const status = editorStatus(api, 'build');
  p.header.insertBefore(status.el, p.header.querySelector('.panel-actions'));

  const refresher = new Refresher<Part>((parts) => run(parts));
  const ur = undoRedo(api, () => refresher.mark('funds', 'recent', 'tool'));

  let kind: Kind = 'wall';
  const st: Record<Kind, KindState> = {
    wall: { finish: null, scopeRoom: false, query: '', family: '', tag: '' },
    floor: { finish: null, scopeRoom: false, query: '', family: '', tag: '' },
  };
  let eyedropper = false;
  let preview: PaintPreview | null = null;
  let visible = false;
  let userClosed = false;
  let showSearch = false;
  let showFilters = false;
  const designs: Record<Kind, SurfaceDesign[]> = { wall: [], floor: [] };

  // ---- sticky sub bar: Walls / Floors + undo/redo ----
  const kindTabs = tabs({
    label: 'Finish type',
    value: kind,
    items: [{ id: 'wall', label: 'Walls', icon: 'wall' }, { id: 'floor', label: 'Floors', icon: 'floor' }],
    onChange: (id) => switchKind(id === 'floor' ? 'floor' : 'wall'),
  });
  const subbar = h('div', { class: 'bb-subbar' }, h('div', { class: 'bb-top-tabs' }, kindTabs.el), ur.el);

  // ---- current finish card (eyedropper lives here) ----
  const eyeFull = button({ icon: 'eyedropper', label: 'Eyedropper', onClick: () => toggleEyedropper() });
  const eyeIcon = button({ icon: 'eyedropper', iconOnly: true, label: 'Eyedropper', onClick: () => toggleEyedropper() });
  for (const b of [eyeFull, eyeIcon]) { b.classList.add('bb-eye-btn'); b.setAttribute('aria-pressed', 'false'); }
  const curHint = h('p', { class: 'bb-hint bb-cur-hint' });
  const curEmpty = h('div', { class: 'bb-cur-empty' }, curHint, eyeFull);
  const curThumb = h('div', { class: 'bb-cur-thumb' });
  const curName = h('div', { class: 'bb-cur-name' });
  const curMeta = h('div', { class: 'bb-cur-meta' });
  const curPrice = h('div', { class: 'bb-cur-price' });
  const curHead = h('div', { class: 'bb-cur-head' }, curThumb, h('div', { class: 'bb-cur-info' }, curName, curMeta, curPrice), eyeIcon);
  const palettes = h('div', { class: 'bb-palettes', role: 'radiogroup', ariaLabel: 'Palette' });
  const palName = h('span', { class: 'bb-swatch-name' });
  const palNote = h('p', { class: 'bb-note bb-muted' });
  const curPalettes = h('div', { class: 'field bb-pal-field' }, h('div', { class: 'field-label' }, 'Palette ', palName), palettes, palNote);
  const scopeHost = h('div', { class: 'bb-scope-host' });
  const previewLine = h('div', { class: 'bb-status-line bb-preview', role: 'status', attrs: { 'aria-live': 'polite' } });
  const current = h('section', { class: 'bb-current', ariaLabel: 'Current finish' }, curEmpty, curHead, curPalettes, scopeHost, previewLine);
  let scopeCtl: { el: HTMLElement; set(v: 'one' | 'room'): void } | null = null;
  let scopeFor: Kind | null = null;

  // ---- recent ----
  const recentRow = h('div', { class: 'bb-recent-row' });
  const recentSec = h('section', { class: 'bb-recent', ariaLabel: 'Recently used finishes' }, h('h4', { class: 'bb-section-title', text: 'Recent' }), recentRow);
  let recentKey = '\u0000';

  // ---- design browser: [search][filters][family tabs], search row, style filter, grid ----
  const search = searchField({ label: 'Search finishes', placeholder: 'Search designs', value: '', onInput: (v) => { st[kind].query = v; renderGrid(); } });
  const searchRow = h('div', { class: 'bb-toolbar' }, search.el);
  const searchBtn = button({
    icon: 'search', iconOnly: true, label: 'Search',
    onClick: () => {
      if (showSearch) { showSearch = false; if (st[kind].query) { st[kind].query = ''; search.set(''); renderGrid(); } } else showSearch = true;
      syncBrowseBar();
      if (showSearch) search.input.focus();
    },
  });
  const filterBtn = button({ icon: 'filter', iconOnly: true, label: 'Filters', onClick: () => { showFilters = !showFilters; syncBrowseBar(); } });
  const tagSel = selectField({ label: 'Style', options: [], value: '', onChange: (v) => { st[kind].tag = v; syncBrowseBar(); renderGrid(); } });
  const filters = h('div', { class: 'bb-filters' }, tagSel.el);
  const famHost = h('div', { class: 'bb-fams' });
  let famTabs: Tabs | null = null;
  const count = h('p', { class: 'bb-sr', role: 'status' });
  const gridHost = h('div', { class: 'bb-grid-host' });
  const browse = h('section', { class: 'bb-designs', ariaLabel: 'Designs' },
    h('div', { class: 'bb-catbar' }, searchBtn, filterBtn, famHost), searchRow, filters, count, gridHost);

  // ---- walls up / cutaway / down (shortcut; the HUD camera buttons do the same) ----
  const cutaway = segmented<CutawayMode>({
    label: 'Walls',
    value: safeCutaway(),
    options: [
      { id: 'up', label: 'Up', icon: 'wallsUp' },
      { id: 'cutaway', label: 'Cutaway', icon: 'wallsCut' },
      { id: 'down', label: 'Down', icon: 'wallsDown' },
    ],
    onChange: (v) => { api.view.setCutaway(v); play(api, 'toggle'); },
  });
  cutaway.el.classList.add('bb-cutaway');

  p.body.append(subbar, current, recentSec, browse, cutaway.el);

  const reopen = reopenButton('Finishes', 'roller', () => { userClosed = false; reopen.hidden = true; p.open(); });
  el.appendChild(reopen);

  let grid: CardGrid<SurfaceDesign> | null = null;
  let gridKey = '';

  // ---------------------------------------------------------------------------------------------

  function safeCutaway(): CutawayMode {
    try { return api.view.cutaway(); } catch { return 'cutaway'; }
  }

  function registry(k: Kind): Record<string, SurfaceDesign> {
    return k === 'wall' ? api.content.wallDesigns : api.content.floorDesigns;
  }

  function design(k: Kind, id: string | undefined): SurfaceDesign | undefined {
    const d = id ? registry(k)[id] : undefined;
    return d && d.status === 'ready' && d.palettes.length > 0 ? d : undefined;
  }

  function reloadContent(): void {
    for (const k of ['wall', 'floor'] as const) {
      designs[k] = Object.values(registry(k)).filter((d) => d.status === 'ready' && d.palettes.length > 0)
        .sort((a, b) => a.family.localeCompare(b.family) || a.price - b.price || a.name.localeCompare(b.name));
    }
    syncFilterOptions();
    gridKey = '';
    renderGrid();
  }

  function syncBrowseBar(): void {
    searchRow.hidden = !showSearch;
    filters.hidden = !showFilters;
    const sl = showSearch ? 'Close search' : 'Search';
    searchBtn.setAttribute('aria-label', sl);
    searchBtn.title = sl;
    searchBtn.setAttribute('aria-expanded', String(showSearch));
    toggleClass(searchBtn, 'is-active', showSearch);
    const active = st[kind].tag ? 1 : 0;
    const fl = active ? 'Filters (1 on)' : 'Filters';
    filterBtn.setAttribute('aria-label', fl);
    filterBtn.title = fl;
    filterBtn.setAttribute('aria-expanded', String(showFilters));
    setBadge(filterBtn, active);
    toggleClass(filterBtn, 'is-active', showFilters || active > 0);
  }

  function syncFilterOptions(): void {
    const list = designs[kind];
    const fams = [...new Set(list.map((d) => d.family))].sort();
    if (st[kind].family && !fams.includes(st[kind].family)) st[kind].family = '';
    famTabs = tabs({
      label: 'Design families',
      value: st[kind].family || 'all',
      items: [{ id: 'all', label: 'All' }, ...fams.map((f) => ({ id: f, label: humanize(f) }))],
      onChange: (id) => { st[kind].family = id === 'all' ? '' : id; renderGrid(); },
    });
    famTabs.el.classList.add('bb-cat-tabs');
    setChildren(famHost, famTabs.el);
    const tagsList = [...new Set(list.flatMap((d) => d.tags))].sort();
    tagSel.setOptions([{ id: '', label: 'Any style' }, ...tagsList.map((t) => ({ id: t, label: humanize(t) }))], st[kind].tag);
    st[kind].tag = tagSel.select.value;
    search.set(st[kind].query);
    search.input.placeholder = `Search ${list.length} ${kind} designs`;
    if (st[kind].query) showSearch = true;
    syncBrowseBar();
  }

  function filtered(): SurfaceDesign[] {
    const s = st[kind];
    let list = designs[kind];
    if (s.family) list = list.filter((d) => d.family === s.family);
    if (s.tag) list = list.filter((d) => d.tags.includes(s.tag));
    if (s.query) list = list.filter((d) => matchesQuery(s.query, [d.name, d.description, d.family, humanize(d.family), ...d.tags, ...d.palettes.map((pl) => pl.name)]));
    return list;
  }

  function renderCard(d: SurfaceDesign): HTMLElement {
    const k = kind;
    const selected = st[k].finish?.designId === d.id;
    const palId = selected ? st[k].finish!.paletteId : d.palettes[0]!.id;
    return h('button', {
      type: 'button',
      class: ['card', 'bb-card', selected && 'is-selected'],
      ariaLabel: `${d.name}, ${humanize(d.family)}, ${formatMoney(d.price)} per ${UNIT[k].one}`,
      attrs: { 'aria-pressed': selected },
      dataset: { designId: d.id },
      onClick: () => pickDesign(d),
    },
    thumbImg(() => api.thumbnails.surface(k, d.id, palId)),
    h('span', { class: 'card-name', text: d.name }),
    h('span', { class: 'card-meta', text: humanize(d.family) }),
    h('span', { class: 'card-meta bb-card-price', text: `${formatMoney(d.price)} / ${UNIT[k].short}` }));
  }

  function renderGrid(): void {
    const s = st[kind];
    const key = `build:${kind}:${s.family}:${s.tag}:${s.query.toLowerCase()}`;
    const items = filtered();
    if (key !== gridKey || !grid) {
      gridKey = key;
      const empty = s.query || s.family || s.tag ? 'No designs match. Try another search or filter.' : `No ${kind} designs are available yet.`;
      grid = cardGrid<SurfaceDesign>({ key, render: renderCard, empty });
      setChildren(gridHost, grid.el);
    }
    grid.setItems(items);
    setText(count, items.length === 1 ? '1 design' : `${items.length} designs`);
  }

  // ---- tool handling ----

  function applyTool(): void {
    const s = st[kind];
    preview = null;
    eyedropper = false;
    if (!s.finish) api.setPaintTool(null);
    else if (kind === 'wall') api.setPaintTool({ kind: 'wall', finish: { ...s.finish }, scope: s.scopeRoom ? 'room' : 'side' });
    else api.setPaintTool({ kind: 'floor', finish: { ...s.finish }, scope: s.scopeRoom ? 'room' : 'tile' });
    refresher.mark('tool', 'current');
  }

  function pickDesign(d: SurfaceDesign): void {
    const s = st[kind];
    if (s.finish?.designId === d.id && !eyedropper && api.paintTool()) return;
    const keep = s.finish?.designId === d.id && d.palettes.some((pl) => pl.id === s.finish!.paletteId);
    s.finish = { designId: d.id, paletteId: keep ? s.finish!.paletteId : d.palettes[0]!.id };
    play(api, 'tap');
    applyTool();
    grid?.refresh();
    const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    p.body.scrollTo?.({ top: 0, behavior: calm ? 'auto' : 'smooth' });
  }

  function pickPalette(paletteId: string): void {
    const s = st[kind];
    if (!s.finish) return;
    s.finish = { designId: s.finish.designId, paletteId };
    play(api, 'tap');
    applyTool();
    grid?.refresh();
  }

  function pickFinish(ref: FinishRef): void {
    st[kind].finish = { ...ref };
    play(api, 'tap');
    applyTool();
    grid?.refresh();
  }

  function toggleEyedropper(): void {
    if (eyedropper) { applyTool(); return; }
    preview = null;
    eyedropper = true;
    api.setPaintTool({ kind: 'eyedropper', target: kind });
    play(api, 'toggle');
    refresher.mark('tool', 'current');
  }

  function switchKind(k: Kind): void {
    if (k === kind) return;
    kind = k;
    kindTabs.select(k);
    preview = null;
    if (eyedropper) api.setPaintTool({ kind: 'eyedropper', target: k });
    else applyTool();
    syncFilterOptions();
    gridKey = '';
    renderGrid();
    recentKey = '\u0000';
    refresher.mark('tool', 'recent', 'current');
  }

  /** Reflects api.paintTool() into the panel (eyedropper results, Esc from the shell, other changes). */
  function syncFromTool(): void {
    const t = api.paintTool();
    if (t && (t.kind === 'wall' || t.kind === 'floor')) {
      const prev = st[t.kind].finish;
      const changed = !prev || prev.designId !== t.finish.designId || prev.paletteId !== t.finish.paletteId;
      if (t.kind !== kind) {
        kind = t.kind;
        kindTabs.select(kind);
        syncFilterOptions();
        gridKey = '';
        recentKey = '\u0000';
      }
      st[kind].finish = { ...t.finish };
      st[kind].scopeRoom = t.scope === 'room';
      if (eyedropper && changed) {
        const d = design(kind, t.finish.designId);
        const pal = d?.palettes.find((pl) => pl.id === t.finish.paletteId);
        if (d) toast(`Picked ${d.name}${pal ? `, ${pal.name}` : ''}`, 'success', 2200);
      }
      eyedropper = false;
      if (changed) renderGrid();
    } else if (t && t.kind === 'eyedropper') {
      eyedropper = true;
      if (t.target !== kind) switchKind(t.target);
    } else {
      eyedropper = false;
      if (st[kind].finish) { st[kind].finish = null; preview = null; grid?.refresh(); }
    }
  }

  function syncScope(): void {
    if (scopeFor !== kind || !scopeCtl) {
      scopeFor = kind;
      scopeCtl = segmented<'one' | 'room'>({
        label: kind === 'wall' ? 'Paint walls' : 'Paint floor',
        value: st[kind].scopeRoom ? 'room' : 'one',
        options: kind === 'wall'
          ? [{ id: 'one', label: 'One side', icon: 'wall' }, { id: 'room', label: 'Whole room', icon: 'home' }]
          : [{ id: 'one', label: 'One tile', icon: 'floor' }, { id: 'room', label: 'Whole room', icon: 'home' }],
        onChange: (v) => { st[kind].scopeRoom = v === 'room'; play(api, 'toggle'); applyTool(); },
      });
      scopeCtl.el.classList.add('bb-scope');
      setChildren(scopeHost, scopeCtl.el);
      delete scopeHost.dataset.value;
    }
    const v = st[kind].scopeRoom ? 'room' : 'one';
    if (scopeHost.dataset.value !== v) { scopeHost.dataset.value = v; scopeCtl.set(v); }
  }

  function renderCurrent(): void {
    const s = st[kind];
    const d = s.finish ? design(kind, s.finish.designId) : undefined;
    for (const b of [eyeFull, eyeIcon]) {
      setAttr(b, 'aria-pressed', String(eyedropper));
      toggleClass(b, 'is-active', eyedropper);
      setAttr(b, 'title', eyedropper ? 'Stop the eyedropper' : `Eyedropper: copy a finish from a ${kind === 'wall' ? 'wall' : 'floor'} in the world`);
    }
    const unit = UNIT[kind];
    const showCard = !!d && !eyedropper;
    if (!showCard) {
      const text = eyedropper
        ? `Eyedropper on: tap a ${kind === 'wall' ? 'wall' : 'floor tile'} in the world to copy its finish.`
        : kind === 'wall' ? 'Choose a design below, then tap a wall in the world to paint it.' : 'Choose a design below, then tap the floor to paint it.';
      if (curHint.dataset.key !== text) {
        curHint.dataset.key = text;
        setChildren(curHint, icon(eyedropper ? 'eyedropper' : 'roller', 20), h('span', { text }));
      }
    }
    setHidden(curEmpty, showCard);
    setHidden(curHead, !showCard);
    setHidden(curPalettes, !showCard);
    setHidden(scopeHost, !showCard);
    setHidden(previewLine, !showCard);
    toggleClass(current, 'is-empty', !showCard);
    toggleClass(current, 'is-picking', eyedropper);
    if (!d || eyedropper) return;

    const pal = d.palettes.find((pl) => pl.id === s.finish!.paletteId) ?? d.palettes[0]!;
    const thumbKey = `${kind}|${d.id}|${pal.id}`;
    if (curThumb.dataset.key !== thumbKey) {
      curThumb.dataset.key = thumbKey;
      setChildren(curThumb, thumbImg(() => api.thumbnails.surface(kind, d.id, pal.id)));
    }
    setText(curName, d.name);
    setText(curMeta, `${humanize(d.family)} · ${pal.name}`);
    setText(curPrice, `${formatMoney(d.price)} per ${unit.one}`);

    const palKey = `${kind}|${d.id}`;
    if (palettes.dataset.key !== palKey) {
      palettes.dataset.key = palKey;
      setChildren(palettes, d.palettes.map((pl) => {
        const b = h('button', { type: 'button', class: 'bb-pal', role: 'radio', title: pl.name, ariaLabel: pl.name, dataset: { id: pl.id }, onClick: () => pickPalette(pl.id) });
        b.style.background = stripes(pl.colors);
        return b;
      }));
    }
    let moved = false;
    for (const b of Array.from(palettes.children) as HTMLElement[]) {
      const on = b.dataset.id === pal.id;
      moved ||= on && !b.classList.contains('is-selected');
      toggleClass(b, 'is-selected', on);
      setAttr(b, 'aria-checked', String(on));
      setAttr(b, 'tabindex', on ? '0' : '-1');
    }
    const sel = palettes.querySelector('.bb-pal.is-selected') as HTMLElement | null;
    if (moved && sel && palettes.scrollWidth > palettes.clientWidth) {
      const left = sel.offsetLeft - palettes.offsetLeft;
      if (left < palettes.scrollLeft || left + sel.offsetWidth > palettes.scrollLeft + palettes.clientWidth) palettes.scrollLeft = Math.max(0, left - 8);
    }
    const idx = d.palettes.indexOf(pal);
    setText(palName, `- ${pal.name} (${idx + 1} of ${d.palettes.length})`);
    setText(palNote, d.paletteNote ?? '');
    setHidden(palNote, !d.paletteNote);
    syncScope();

    // preview line: live preview from the shell, otherwise what a tap does
    let state: 'ok' | 'bad' | 'info' = 'info';
    let text: string;
    let iconName = 'info';
    if (preview) {
      const afford = preview.ok ? affordReason(api, preview.cost) : null;
      if (preview.unchanged) { text = preview.reason ?? 'Already has this finish'; }
      else if (!preview.ok) { state = 'bad'; iconName = 'warning'; text = preview.reason ?? "Can't paint here."; }
      else if (preview.count === 0) { text = 'It already has this finish.'; }
      else if (afford) { state = 'bad'; iconName = 'warning'; text = afford; }
      else {
        state = 'ok'; iconName = 'check';
        const what = `${preview.count} ${preview.count === 1 ? unit.one : unit.many}`;
        text = `Preview: ${what} for ${fundsInfo(api).unlimited ? 'free (sandbox)' : formatMoney(preview.cost)}`;
      }
    } else {
      text = kind === 'wall'
        ? (s.scopeRoom ? 'Tap a wall to paint every wall side of that room.' : 'Tap a wall to paint the side facing you.')
        : (s.scopeRoom ? 'Tap the floor to paint the whole room.' : 'Tap a floor tile to paint it.');
    }
    const key = `${state}|${iconName}|${text}`;
    if (previewLine.dataset.key !== key) {
      previewLine.dataset.key = key;
      previewLine.dataset.state = state;
      setChildren(previewLine, icon(iconName, 18), h('span', { text }));
    }
  }

  function renderRecent(): void {
    let refs: FinishRef[] = [];
    try { refs = api.recentFinishes(kind); } catch { refs = []; }
    const items = refs.map((r) => {
      const d = design(kind, r.designId);
      const pal = d?.palettes.find((pl) => pl.id === r.paletteId);
      return d && pal ? { r, d, pal } : null;
    }).filter((x): x is NonNullable<typeof x> => !!x).slice(0, 8);
    const sel = st[kind].finish;
    const key = `${kind}|${items.map((x) => `${x.d.id}:${x.pal.id}`).join(',')}|${sel ? `${sel.designId}:${sel.paletteId}` : ''}|${eyedropper}`;
    if (key === recentKey) return;
    recentKey = key;
    setHidden(recentSec, items.length === 0);
    setChildren(recentRow, items.map(({ r, d, pal }) => {
      const on = !eyedropper && !!sel && sel.designId === r.designId && sel.paletteId === r.paletteId;
      return h('button', {
        type: 'button', class: ['bb-recent-btn', on && 'is-selected'], title: `${d.name}, ${pal.name}`,
        ariaLabel: `${d.name}, ${pal.name}`, attrs: { 'aria-pressed': on }, onClick: () => pickFinish(r),
      }, thumbImg(() => api.thumbnails.surface(kind, r.designId, r.paletteId)));
    }));
  }

  function run(parts: Set<Part>): void {
    if (!visible) return;
    const all = parts.has('all');
    if (all || parts.has('content')) reloadContent();
    if (all || parts.has('funds')) status.refresh();
    if (all || parts.has('undo')) ur.refresh();
    if (all || parts.has('camera')) cutaway.set(safeCutaway());
    if (all || parts.has('tool')) syncFromTool();
    renderCurrent();
    if (all || parts.has('recent') || parts.has('tool')) renderRecent();
  }

  const getPreview = (api as PreviewSource).lastPaintPreview;
  const offs: Array<() => void> = [
    api.onChange((what) => {
      switch (what) {
        case 'paint':
          if (typeof getPreview === 'function') { try { preview = getPreview.call(api); } catch { /* optional */ } }
          refresher.mark('tool', 'recent');
          break;
        case 'camera': refresher.mark('camera'); break;
        case 'undo': refresher.mark('undo', 'funds', 'recent'); break;
        case 'state': refresher.mark('undo', 'funds', 'recent'); break;
        default: break;
      }
    }),
    api.events.on('money', () => refresher.mark('funds')),
    api.events.on('lot.changed', () => refresher.mark('undo', 'recent')),
    api.events.on('state.replaced', () => refresher.mark('all')),
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
    setPreview(pv: PaintPreview | null) {
      const next = pv ? { ...pv } : null;
      if (JSON.stringify(next) === JSON.stringify(preview)) return;
      preview = next;
      if (visible) refresher.mark('current');
    },
    getInsets: () => (visible ? panelInsets(p.el) : { left: 0, right: 0, top: 0, bottom: 0 }),
  };
}
