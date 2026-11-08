// OWNER: UI editors agent. Build mode structure tools (Milestone 2): the Wall, Room, Door, Window and Erase
// sections of the Build panel and the footer with the live preview text and the explicit Confirm / Cancel (and
// Turn around) buttons. Each section only chooses the BuildTool and its options; pointer handling, previews and
// applying live in buildSession.ts. The panel (buildMode.ts) owns the tabs and the finish pickers.

import type { OpeningDef } from '../../content/types';
import type { FinishRef } from '../../core/types';
import { WALL_HEIGHT_PRESETS, type BuildTool, type GameAPI, type RoomDoorSpec } from '../../game/api';
import { affordReason, formatMoney, humanize, selectField, setHidden, setLabel, thumbImg } from '../buy/editorCommon';
import { button, cardGrid, chip, segmented, tabs, type CardGrid } from '../kit/components';
import { h, setChildren, setText } from '../kit/dom';
import { icon } from '../kit/icons';
import { layout } from '../kit/layout';
import { summarize, type BuildSession } from './buildSession';
import { exteriorHint } from './exteriorHints';
import { createStairTools } from './stairTools';

export type StructureId = 'wall' | 'room' | 'door' | 'window' | 'erase' | 'stairs';
type Side = RoomDoorSpec['side'];
type OpeningMode = 'place' | 'move' | 'flip' | 'remove';
type EraseWhat = 'wall-one' | 'wall-run' | 'wall-area' | 'opening' | 'floor-tile' | 'floor-area' | 'floor-room' | 'room';

export interface StructureDeps {
  api: GameAPI;
  session: BuildSession;
  /** The wall / floor finish chosen in the Paint section, if any. */
  selectedFinish(kind: 'wall' | 'floor'): FinishRef | null;
  designName(kind: 'wall' | 'floor', ref: FinishRef): string;
}

export interface StructureTools {
  sections: Record<StructureId, HTMLElement>;
  footer: HTMLElement;
  /** Chooses the tool of a section. */
  enter(id: StructureId): void;
  /** Leaves the structure tools (the game's tool is cleared by the caller). */
  leave(): void;
  active(): StructureId | null;
  /** Re-renders what depends on the session or the chosen finishes (cheap; runs on every preview). */
  refresh(): void;
  /** Door and window pictures arrived. */
  thumbnailsChanged(): void;
  /** Called after Cancel / Done in the footer ended the tool: the panel goes back to its own tab. */
  onDone: (() => void) | null;
}

const SIDES: Array<{ id: Side; label: string }> = [
  { id: 'n', label: 'North' }, { id: 'e', label: 'East' }, { id: 's', label: 'South' }, { id: 'w', label: 'West' },
];
const OPPOSITE: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' };

const ERASE: Array<{ id: EraseWhat; label: string; icon: string }> = [
  { id: 'wall-one', label: 'One wall piece', icon: 'wall' },
  { id: 'wall-run', label: 'Wall run', icon: 'wall' },
  { id: 'wall-area', label: 'Walls in an area', icon: 'wall' },
  { id: 'opening', label: 'Door or window', icon: 'door' },
  { id: 'floor-tile', label: 'One floor tile', icon: 'floor' },
  { id: 'floor-area', label: 'Floor in an area', icon: 'floor' },
  { id: 'floor-room', label: 'Floor of a room', icon: 'floor' },
  { id: 'room', label: 'Delete a room', icon: 'trash' },
];

export function createStructureTools(deps: StructureDeps): StructureTools {
  const { api, session } = deps;
  const touch = () => layout().touch;

  // ---- shared state ----
  const st = {
    active: null as StructureId | null,
    wallShape: 'run' as 'run' | 'segment',
    height: 2.8,
    useFinish: false,
    roomFloor: true,
    doorDef: '',
    doorSide: 's' as Side,
    windowDef: '',
    windowSide: 'n' as Side,
    opening: { door: 'place', window: 'place' } as Record<'door' | 'window', OpeningMode>,
    pick: { door: '', window: '' } as Record<'door' | 'window', string>,
    tag: { door: '', window: '' } as Record<'door' | 'window', string>,
    erase: 'wall-one' as EraseWhat,
  };

  const defs = (kind: 'door' | 'window'): OpeningDef[] =>
    Object.values(api.content.openings).filter((d) => d.kind === kind && d.status === 'ready').sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));

  // ---- the tool each section chooses ----

  const wallSpec = () => {
    const f = st.useFinish ? deps.selectedFinish('wall') : null;
    return { height: st.height, ...(f ? { finishA: { ...f }, finishB: { ...f } } : {}) };
  };

  function toolFor(id: StructureId): BuildTool | null {
    switch (id) {
      case 'wall': return { kind: 'wall', shape: st.wallShape, spec: wallSpec() };
      case 'room': {
        const doors: RoomDoorSpec[] = [];
        if (st.doorDef) doors.push({ defId: st.doorDef, side: st.doorSide });
        if (st.windowDef) {
          const wd = api.content.openings[st.windowDef];
          const same = st.windowSide === st.doorSide && !!st.doorDef;
          doors.push({ defId: st.windowDef, side: st.windowSide, ...(same && wd ? { offset: 1 } : {}) });
        }
        const floor = st.roomFloor ? deps.selectedFinish('floor') : null;
        return { kind: 'room', spec: wallSpec(), ...(floor ? { floor: { ...floor } } : {}), ...(doors.length ? { doors } : {}) };
      }
      case 'door':
      case 'window': {
        const m = st.opening[id];
        if (m === 'place') return st.pick[id] ? { kind: 'opening', defId: st.pick[id] } : null;
        if (m === 'move') return { kind: 'moveOpening', openingId: null };
        if (m === 'flip') return { kind: 'moveOpening', openingId: null, flip: true };
        return { kind: 'eraseOpening' };
      }
      case 'stairs': return stairs.tool();
      case 'erase':
        switch (st.erase) {
          case 'wall-one': return { kind: 'eraseWall', shape: 'segment' };
          case 'wall-run': return { kind: 'eraseWall', shape: 'run' };
          case 'wall-area': return { kind: 'eraseWall', shape: 'rect' };
          case 'opening': return { kind: 'eraseOpening' };
          case 'floor-tile': return { kind: 'eraseFloor', shape: 'tile' };
          case 'floor-area': return { kind: 'eraseFloor', shape: 'rect' };
          case 'floor-room': return { kind: 'eraseFloor', shape: 'room' };
          case 'room': return { kind: 'deleteRoom' };
        }
    }
  }

  function choose(): void {
    if (!st.active) return;
    session.setTool(toolFor(st.active));
    render();
  }

  // ---- wall style (height + finish), shared by the Wall and Room sections ----

  const styleControls: Array<{ height: { set(v: string): void }; finish: { set(v: 'plain' | 'chosen'): void }; note: HTMLElement }> = [];
  function wallStyle(): HTMLElement {
    const height = segmented<string>({
      label: 'Wall height',
      value: String(st.height),
      options: WALL_HEIGHT_PRESETS.map((p) => ({ id: String(p.height), label: `${p.label} ${p.height} m` })),
      onChange: (v) => { st.height = Number(v); syncStyles(); choose(); },
    });
    const finish = segmented<'plain' | 'chosen'>({
      label: 'Wall finish',
      value: st.useFinish ? 'chosen' : 'plain',
      options: [{ id: 'plain', label: 'Plain paint' }, { id: 'chosen', label: 'Chosen finish' }],
      onChange: (v) => { st.useFinish = v === 'chosen'; syncStyles(); choose(); },
    });
    const note = h('p', { class: 'bb-note bb-muted' });
    styleControls.push({ height, finish, note });
    height.el.classList.add('bb-seg-tight');
    return h('div', { class: 'bb-style' }, height.el, finish.el, note);
  }
  function syncStyles(): void {
    const f = deps.selectedFinish('wall');
    for (const c of styleControls) {
      c.height.set(String(st.height));
      c.finish.set(st.useFinish ? 'chosen' : 'plain');
      setText(c.note, st.useFinish ? (f ? `Both sides: ${deps.designName('wall', f)}.` : 'Choose a wall finish under Paint first; plain paint is used until then.') : 'Both sides get plain paint. Paint each side afterwards.');
    }
  }

  // ---- Wall section ----

  const wallShape = segmented<'run' | 'segment'>({
    label: 'Draw',
    value: st.wallShape,
    options: [{ id: 'run', label: 'A run (drag)', icon: 'wall' }, { id: 'segment', label: 'One piece (tap)', icon: 'plus' }],
    onChange: (v) => { st.wallShape = v; choose(); },
  });
  const wallSection = h('section', { class: 'bb-tool-section', ariaLabel: 'Build walls', dataset: { section: 'wall' } },
    wallShape.el, wallStyle());

  // ---- Room section ----

  const floorMode = segmented<'yes' | 'no'>({
    label: 'Floor',
    value: st.roomFloor ? 'yes' : 'no',
    options: [{ id: 'yes', label: 'Lay the chosen floor', icon: 'floor' }, { id: 'no', label: 'No floor', icon: 'close' }],
    onChange: (v) => { st.roomFloor = v === 'yes'; choose(); },
  });
  const floorNote = h('p', { class: 'bb-note bb-muted' });
  const sideOptions = SIDES.map((x) => ({ id: x.id, label: x.label }));
  const doorSel = selectField({ label: 'Door', options: [{ id: '', label: 'No door' }], value: st.doorDef, onChange: (v) => { st.doorDef = v; choose(); } });
  const doorSide = selectField({ label: 'Door side', options: sideOptions, value: st.doorSide, onChange: (v) => { st.doorSide = v as Side; if (st.windowSide === v) st.windowSide = OPPOSITE[v as Side]; sideSync(); choose(); } });
  const winSel = selectField({ label: 'Window', options: [{ id: '', label: 'No window' }], value: st.windowDef, onChange: (v) => { st.windowDef = v; choose(); } });
  const winSide = selectField({ label: 'Window side', options: sideOptions, value: st.windowSide, onChange: (v) => { st.windowSide = v as Side; sideSync(); choose(); } });
  const sideSync = () => { doorSide.select.value = st.doorSide; winSide.select.value = st.windowSide; };
  const roomSection = h('section', { class: 'bb-tool-section', ariaLabel: 'Build a room', dataset: { section: 'room' } },
    h('div', { class: 'bb-pair' }, doorSel.el, doorSide.el),
    h('div', { class: 'bb-pair' }, winSel.el, winSide.el),
    floorMode.el, floorNote, wallStyle());
  const southNote = 'South faces the street.';
  doorSide.select.title = southNote;
  winSide.select.title = southNote;

  // ---- Door and Window sections ----

  const openingSections = {} as Record<'door' | 'window', { el: HTMLElement; mode: { set(v: OpeningMode): void }; host: HTMLElement; hint: HTMLElement; grid: CardGrid<OpeningDef> | null; gridKey: string; tags: HTMLElement }>;
  for (const kind of ['door', 'window'] as const) {
    const noun = kind === 'door' ? 'door' : 'window';
    const mode = segmented<OpeningMode>({
      label: `${humanize(noun)} action`,
      value: st.opening[kind],
      options: [{ id: 'place', label: 'Place' }, { id: 'move', label: 'Move' }, { id: 'flip', label: 'Turn' }, { id: 'remove', label: 'Remove' }],
      onChange: (v) => { st.opening[kind] = v; choose(); renderOpening(kind); },
    });
    const hint = h('span', { class: 'bb-sr' });
    const host = h('div', { class: 'bb-open-host' });
    const tagHost = h('div', { class: 'bb-open-tags' });
    const el = h('section', { class: 'bb-tool-section', ariaLabel: `${humanize(noun)}s`, dataset: { section: kind } }, mode.el, tagHost, host, hint);
    openingSections[kind] = { el, mode, host, hint, grid: null, gridKey: '', tags: tagHost };
  }

  function renderOpening(kind: 'door' | 'window'): void {
    const o = openingSections[kind];
    const m = st.opening[kind];
    const noun = kind;
    const text = m === 'place' ? `Choose a ${noun}, then ${touch() ? 'tap' : 'click'} the wall to put it on. Wide ones need a long enough wall.`
      : m === 'move' ? `${touch() ? 'Tap' : 'Click'} a door or window to pick it up, then the wall to move it to.`
        : m === 'flip' ? `${touch() ? 'Tap' : 'Click'} a door or window to turn it around.`
          : `${touch() ? 'Tap' : 'Click'} a door or window to remove it. The wall stays.`;
    o.hint.title = text;
    o.mode.set(m);
    if (m !== 'place') { o.host.hidden = true; return; }
    o.host.hidden = false;
    const all = defs(kind);
    if (!st.pick[kind] || !all.some((d) => d.id === st.pick[kind])) st.pick[kind] = all[0]?.id ?? '';
    // filter by style tag (the catalog grows: pages of a few cards, never every model at once)
    const tags = [...new Set(all.flatMap((d) => d.tags))].sort();
    if (st.tag[kind] && !tags.includes(st.tag[kind])) st.tag[kind] = '';
    const tagKey = tags.join(',');
    if (o.tags.dataset.key !== `${tagKey}|${st.tag[kind]}`) {
      o.tags.dataset.key = `${tagKey}|${st.tag[kind]}`;
      o.tags.hidden = tags.length < 2;
      const t = tabs({
        label: `${humanize(kind)} styles`, value: st.tag[kind] || 'all',
        items: [{ id: 'all', label: 'All' }, ...tags.map((x) => ({ id: x, label: humanize(x) }))],
        onChange: (id) => { st.tag[kind] = id === 'all' ? '' : id; renderOpening(kind); },
      });
      setChildren(o.tags, t.el);
    }
    const list = st.tag[kind] ? all.filter((d) => d.tags.includes(st.tag[kind])) : all;
    const gridKey = `build:${kind}:${st.tag[kind]}`;
    if (!o.grid || o.gridKey !== gridKey) {
      o.gridKey = gridKey;
      o.grid = cardGrid<OpeningDef>({
        key: gridKey,
        pageSize: () => (layout().compact ? 6 : 8),
        empty: `No ${noun}s match.`,
        render: (d) => {
          const on = st.pick[kind] === d.id;
          return h('button', {
            type: 'button', class: ['card', 'bb-card', on && 'is-selected'], dataset: { defId: d.id },
            ariaLabel: `${d.name}, ${formatMoney(d.price)}${d.width > 1 ? `, ${d.width} tiles wide` : ''}`, attrs: { 'aria-pressed': on },
            onClick: () => { st.pick[kind] = d.id; api.sound('tap'); choose(); o.grid?.refresh(); },
          },
          thumbImg(() => api.thumbnails.opening(d.id)),
          h('span', { class: 'card-name', text: d.name }),
          h('span', { class: 'card-meta', text: d.width > 1 ? `${d.width} tiles wide` : humanize(d.tags[0] ?? kind) }),
          h('span', { class: 'card-meta bb-card-price', text: formatMoney(d.price) }));
        },
      });
      setChildren(o.host, o.grid.el);
    }
    o.grid.setItems(list);
  }

  // ---- Stairs section (Milestone 9) ----

  const stairs = createStairTools({ api, onChoose: () => choose() });

  // ---- Erase section ----

  const eraseChips = h('div', { class: 'bb-chips', role: 'radiogroup', ariaLabel: 'What to erase' });
  const eraseSection = h('section', { class: 'bb-tool-section', ariaLabel: 'Erase', dataset: { section: 'erase' } }, eraseChips);

  function renderErase(): void {
    setChildren(eraseChips, ERASE.map((e) => {
      const b = chip({ label: e.label, icon: e.icon, selected: st.erase === e.id, onClick: () => { st.erase = e.id; api.sound('tap'); choose(); } });
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(st.erase === e.id));
      b.dataset.erase = e.id;
      return b;
    }));
    const t = touch() ? 'tap' : 'click';
    const text: Record<EraseWhat, string> = {
      'wall-one': `${t[0]!.toUpperCase()}${t.slice(1)} a wall piece to demolish it. A door or window in it goes too and is refunded.`,
      'wall-run': 'Drag along a wall to demolish the pieces on the way.',
      'wall-area': 'Drag a rectangle: every wall piece inside it is demolished.',
      opening: `${t[0]!.toUpperCase()}${t.slice(1)} a door or window to remove it. The wall stays.`,
      'floor-tile': `${t[0]!.toUpperCase()}${t.slice(1)} a floor tile to take its floor up.`,
      'floor-area': 'Drag a rectangle: the floor inside it is taken up.',
      'floor-room': `${t[0]!.toUpperCase()}${t.slice(1)} a room to take up all of its floor.`,
      room: `${t[0]!.toUpperCase()}${t.slice(1)} a room to demolish its outer walls, doors, windows and floor. Furniture inside must be moved first.`,
    };
    eraseChips.title = text[st.erase];
  }

  // ---- footer: live text, Turn around, Cancel, Confirm ----

  const status = h('div', { class: 'bb-status-line bb-build-status', role: 'status', attrs: { 'aria-live': 'polite' } });
  const flip = button({ icon: 'rotateRight', label: 'Turn around', onClick: () => { session.flip(); const t = api.buildTool(); if (t?.kind === 'stairs') stairs.setRot(t.rot ?? 0); } });
  const cancel = button({ icon: 'close', label: 'Cancel', variant: 'secondary', onClick: () => { if (!session.cancel()) { session.setTool(null); leaveSelf(); } } });
  const confirm = button({ icon: 'check', label: 'Build', variant: 'primary', onClick: () => { session.confirm(); } });
  setLabel(flip, 'Turn', 'Turn');
  flip.setAttribute('aria-label', 'Turn around');
  flip.title = 'Turn the door or window around (R)';
  confirm.classList.add('bb-confirm');
  flip.classList.add('bb-flip');
  cancel.classList.add('bb-cancel');
  const buttons = h('div', { class: 'bb-build-buttons' }, flip, cancel, confirm);
  const footer = h('div', { class: 'bb-footer bb-build-footer', role: 'group', ariaLabel: 'Build controls' }, status, buttons);
  footer.hidden = true;

  function leaveSelf(): void { tools.onDone?.(); }

  function hintFor(): string {
    const tool = api.buildTool();
    if (!tool) return '';
    const t = touch();
    switch (tool.kind) {
      case 'wall': return tool.shape === 'run'
        ? (t ? 'Drag on the ground to draw a wall. Use two fingers to move the view.' : 'Drag on the ground to draw a wall; let go to build it. Esc cancels, right-drag moves the view.')
        : (t ? 'Tap near a grid line to place one piece of wall, then confirm.' : 'Click near a grid line to place one piece of wall.');
      case 'room': return t ? 'Drag a rectangle on the ground, adjust the corners, then confirm.' : 'Drag a rectangle on the ground; let go to build the room. Esc cancels.';
      case 'opening': return t ? 'Tap a wall to see the door or window there, then confirm.' : 'Point at a wall and click to place it. R turns it around.';
      case 'moveOpening': return tool.openingId ? 'Now tap the wall to move it to.' : tool.flip ? 'Tap a door or window to turn it around.' : 'Tap the door or window to pick it up.';
      case 'eraseOpening': return t ? 'Tap a door or window to remove it, then confirm.' : 'Click a door or window to remove it.';
      case 'eraseWall': return tool.shape === 'segment' ? (t ? 'Tap a wall piece, then confirm.' : 'Click a wall piece to demolish it.') : 'Drag to choose the walls to demolish.';
      case 'floor': case 'eraseFloor': return tool.shape === 'rect' ? 'Drag a rectangle over the floor tiles.' : (t ? 'Tap the floor, then confirm.' : 'Click the floor.');
      case 'deleteRoom': return t ? 'Tap a room, then confirm to demolish it.' : 'Click a room to demolish it.';
      case 'roomEdit': return tool.edit === 'move' ? 'Use the arrows to choose where the room goes, then confirm. Furniture moves with it.'
        : tool.edit === 'resize' ? 'Choose a side and use plus and minus to move it, then confirm.' : 'Use the arrows to choose where the copy goes, then confirm.';
      // Milestone 9 exterior tools (ui/build/exteriorTools.ts has their own tips; these are the footer's fallback)
      case 'fence': return exteriorHint(tool, t);
      case 'eraseFence': return t ? 'Tap a fence or gate, then confirm to take it down.' : 'Click a fence or gate to take it down.';
      case 'roof': return exteriorHint(tool, t);
      case 'eraseRoof': return t ? 'Tap a roof, then confirm to take it off.' : 'Click a roof to take it off.';
      case 'terrain': return exteriorHint(tool, t);
      case 'stairs': return t ? 'Tap where the stairs go, check the preview, then confirm. Turn changes which way they climb.' : 'Click where the stairs go. R turns them.';
      case 'eraseStairs': return t ? 'Tap a staircase, then confirm to take it out.' : 'Click a staircase to take it out.';
      // Milestone 12: pools
      case 'pool': return t ? 'Drag a rectangle on the ground for the pool, then confirm.' : 'Drag a rectangle on the ground; let go to build the pool. Esc cancels.';
      case 'erasePool': return t ? 'Tap a pool, then confirm to drain it.' : 'Click a pool to drain it.';
      case 'poolLadder': return tool.mode === 'move'
        ? (tool.from ? 'Now tap the edge tile to move the ladder to.' : 'Tap a ladder to move it.')
        : tool.mode === 'add' ? 'Tap an edge tile to add a ladder.' : 'Tap a ladder to remove it.';
    }
  }

  function renderFooter(): void {
    const s = session.state();
    footer.hidden = !s.tool;
    footer.closest('.panel')?.classList.toggle('has-footer', !footer.hidden);
    if (footer.hidden) return;
    const pv = s.preview;
    let kind: 'ok' | 'bad' | 'info' = 'info';
    let iconName = 'info';
    let title = hintFor();
    let detail = '';
    if (pv && s.target) {
      const sum = summarize(pv);
      kind = sum.state; title = sum.title; detail = sum.detail;
      iconName = kind === 'ok' ? 'check' : kind === 'bad' ? 'warning' : 'info';
      const afford = pv.ok && !pv.unchanged ? affordReason(api, pv.cost) : null;
      if (afford) { kind = 'bad'; iconName = 'warning'; detail = afford; }
    }
    const key = `${kind}|${iconName}|${title}|${detail}`;
    if (status.dataset.key !== key) {
      status.dataset.key = key;
      status.dataset.state = kind;
      status.title = title;
      setChildren(status, icon(iconName, 20), h('span', { class: 'bb-build-text' }, h('strong', { text: title }), detail ? h('span', { class: 'bb-build-detail', text: detail }) : null));
    }
    const erasing = s.tool?.kind === 'eraseWall' || s.tool?.kind === 'eraseOpening' || s.tool?.kind === 'eraseFloor' || s.tool?.kind === 'deleteRoom' || s.tool?.kind === 'eraseStairs' || s.tool?.kind === 'eraseFence' || s.tool?.kind === 'eraseRoof' || s.tool?.kind === 'erasePool';
    const verb = erasing ? 'Demolish' : s.tool?.kind === 'roomEdit' ? 'Apply' : 'Build';
    const cost = pv && pv.ok && !pv.unchanged ? pv.cost : 0;
    const long = cost > 0 ? `${verb} for ${formatMoney(cost)}` : cost < 0 ? `${verb}, ${formatMoney(-cost)} back` : verb;
    setLabel(confirm, long, verb);
    confirm.disabled = !s.canConfirm;
    const why = s.canConfirm ? long : s.blockedReason ?? 'Draw or tap something first.';
    confirm.title = why;
    confirm.setAttribute('aria-label', s.canConfirm ? long : `${verb} (unavailable: ${why})`);
    const hasFlip = s.tool?.kind === 'opening' || (s.tool?.kind === 'moveOpening' && !!s.tool.openingId) || s.tool?.kind === 'stairs';
    setHidden(flip, !hasFlip);
    const pendingNow = s.pending || s.dragging || !!s.target;
    setLabel(cancel, pendingNow ? 'Cancel' : 'Done', pendingNow ? 'Cancel' : 'Done');
    cancel.title = pendingNow ? 'Clear what you are drawing (Esc)' : 'Stop using this tool (Esc)';
    footer.dataset.flip = String(hasFlip);
  }

  // ---- rendering ----

  function renderRoomFields(): void {
    const doors = defs('door'), windows = defs('window');
    const fill = (sel: ReturnType<typeof selectField>, list: OpeningDef[], none: string, cur: string) => {
      const key = list.map((d) => d.id).join(',');
      if (sel.select.dataset.key !== key) {
        sel.select.dataset.key = key;
        sel.setOptions([{ id: '', label: none }, ...list.map((d) => ({ id: d.id, label: `${d.name} (${formatMoney(d.price)})` }))], cur);
      }
      sel.select.value = list.some((d) => d.id === cur) ? cur : '';
    };
    if (!st.doorDef && !roomDefaultsSet) { st.doorDef = doors[0]?.id ?? ''; roomDefaultsSet = true; }
    fill(doorSel, doors, 'No door', st.doorDef);
    fill(winSel, windows, 'No window', st.windowDef);
    st.doorDef = doorSel.select.value;
    st.windowDef = winSel.select.value;
    doorSide.el.hidden = !st.doorDef;
    winSide.el.hidden = !st.windowDef;
    const f = deps.selectedFinish('floor');
    setText(floorNote, st.roomFloor ? (f ? `Floor: ${deps.designName('floor', f)}.` : 'Choose a floor under Paint first; the room is built without a floor until then.') : 'The ground stays bare inside.');
    floorMode.set(st.roomFloor ? 'yes' : 'no');
  }
  let roomDefaultsSet = false;

  function render(): void {
    syncStyles();
    renderRoomFields();
    for (const k of ['door', 'window'] as const) if (st.active === k) renderOpening(k);
    if (st.active === 'erase') renderErase();
    if (st.active === 'stairs') stairs.render();
    wallShape.set(st.wallShape);
    renderFooter();
  }

  const tools: StructureTools = {
    sections: { wall: wallSection, room: roomSection, door: openingSections.door.el, window: openingSections.window.el, erase: eraseSection, stairs: stairs.el },
    footer,
    onDone: null,
    enter(id) {
      st.active = id;
      render();
      choose();
    },
    leave() {
      st.active = null;
      footer.hidden = true;
    },
    active: () => st.active,
    refresh() {
      if (st.active) { syncStyles(); renderRoomFields(); }
      renderFooter();
    },
    thumbnailsChanged() {
      for (const k of ['door', 'window'] as const) openingSections[k].grid?.refresh();
    },
  };
  return tools;
}
