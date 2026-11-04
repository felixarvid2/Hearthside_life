// Build mode exterior tools (Milestone 9): the Roof, Fence and Garden sections of the Build panel. Like structureTools.ts each section only
// chooses the BuildTool and its options; pointer handling, previews, Confirm / Cancel and the footer live in buildSession.ts and
// structureTools.ts (the footer is generic over every build tool). Roofs show while the Roof tab is open, whatever the wall mode is.
//
// Roof: draw a rectangle, the auto roof for the whole house, or take one off; 12 styles with pictures, pitch, ridge direction, 11
// finishes with colour palettes. Fence: 24 fence designs and 12 gates with colour variants; drag a run, tap an edge for a gate, or
// remove. Garden: terrain paint (12 paints, a tile or an area) and a shortcut to the garden objects in Buy.

import { exteriorOf, fenceVariant, type FenceDef, type PoolStyleDef, type RoofFinishDef, type RoofStyleDef, type TerrainPaintDef } from '../../content/exterior';
import { formatMoney } from '../../core/money';
import type { BuildTool, GameAPI, RoofToolSpec } from '../../game/api';
import { setHidden, stripes, thumbImg } from '../buy/editorCommon';
import { button, cardGrid, segmented, type CardGrid } from '../kit/components';
import { h, setChildren, setText } from '../kit/dom';
import { layout } from '../kit/layout';
import type { BuildSession } from './buildSession';
import { fenceThumb, finishThumb, paintThumb, poolThumb, roofThumb } from './exteriorThumbs';
import './exterior.css';

export type ExteriorId = 'roof' | 'fence' | 'garden' | 'pool';

export interface ExteriorDeps { api: GameAPI; session: BuildSession }

export interface ExteriorTools {
  sections: Record<ExteriorId, HTMLElement>;
  /** Chooses the tool of a section (and shows roofs while the roof tab is open). */
  enter(id: ExteriorId): void;
  /** Leaves the exterior tools (the game's tool is cleared by the caller). */
  leave(): void;
  active(): ExteriorId | null;
  /** The content or the funds changed: re-render prices and pictures. */
  refresh(): void;
}

type RoofMode = 'rect' | 'auto' | 'remove';
type FenceMode = 'run' | 'gate' | 'remove';
type GardenMode = 'tile' | 'area' | 'remove';
type PoolMode = 'draw' | 'remove' | 'ladder';
type LadderMode = 'move' | 'add' | 'remove';

export function createExteriorTools(deps: ExteriorDeps): ExteriorTools {
  const { api, session } = deps;
  const ex = () => exteriorOf(api.content);
  const touch = () => layout().touch;

  const st = {
    active: null as ExteriorId | null,
    roofMode: 'rect' as RoofMode,
    style: 'gable',
    pitch: undefined as number | undefined,
    ridge: 'long' as 'long' | 'h' | 'v',
    finish: 'asphalt-shingle',
    palette: {} as Record<string, string>,
    fenceMode: 'run' as FenceMode,
    fenceShape: 'run' as 'run' | 'rect',
    fence: 'picket-white',
    gate: 'gate-picket',
    variant: {} as Record<string, number>,
    gardenMode: 'tile' as GardenMode,
    paint: 'gravel',
    poolMode: 'draw' as PoolMode,
    ladderMode: 'move' as LadderMode,
    poolStyle: 'azure-mosaic',
  };

  const styles = (): RoofStyleDef[] => Object.values(ex().roofStyles).filter((s) => s.status === 'ready');
  const finishes = (): RoofFinishDef[] => Object.values(ex().roofFinishes).filter((f) => f.status === 'ready');
  const fenceDefs = (kind: 'fence' | 'gate'): FenceDef[] => Object.values(ex().fences).filter((f) => f.kind === kind && f.status === 'ready');
  const paints = (): TerrainPaintDef[] => Object.values(ex().terrain).filter((p) => p.status === 'ready');
  const poolStyles = (): PoolStyleDef[] => Object.values(ex().poolStyles).filter((s) => s.status === 'ready');
  const palOf = (fin: RoofFinishDef): string => (fin.palettes.some((p) => p.id === st.palette[fin.id]) ? st.palette[fin.id]! : fin.palettes[0]!.id);

  // ---- the tool each section chooses ----

  function roofSpec(): RoofToolSpec {
    const fin = ex().roofFinishes[st.finish] ?? finishes()[0]!;
    return { styleId: st.style, ...(st.pitch !== undefined ? { pitch: st.pitch } : {}), ridge: st.ridge === 'long' ? null : st.ridge, finish: { designId: fin.id, paletteId: palOf(fin) } };
  }

  function toolFor(id: ExteriorId): BuildTool | null {
    switch (id) {
      case 'roof':
        if (st.roofMode === 'remove') return { kind: 'eraseRoof' };
        return { kind: 'roof', shape: st.roofMode === 'auto' ? 'auto' : 'rect', spec: roofSpec() };
      case 'fence':
        if (st.fenceMode === 'remove') return { kind: 'eraseFence' };
        {
          const defId = st.fenceMode === 'gate' ? st.gate : st.fence;
          if (!ex().fences[defId]) return null;
          return st.fenceMode === 'run'
            ? { kind: 'fence', defId, variant: st.variant[defId] ?? 0, shape: st.fenceShape }
            : { kind: 'fence', defId, variant: st.variant[defId] ?? 0 };
        }
      case 'garden':
        if (st.gardenMode === 'remove') return { kind: 'terrain', paintId: 'grass', shape: 'tile' };
        return ex().terrain[st.paint] ? { kind: 'terrain', paintId: st.paint, shape: st.gardenMode === 'area' ? 'rect' : 'tile' } : null;
      case 'pool':
        if (st.poolMode === 'remove') return { kind: 'erasePool' };
        if (st.poolMode === 'ladder') return { kind: 'poolLadder', mode: st.ladderMode, poolId: null, from: null };
        return { kind: 'pool', styleId: st.poolStyle };
    }
  }

  function choose(): void {
    if (!st.active) return;
    session.setTool(toolFor(st.active));
    // the whole-house roof has no pointer: preview it at once so Confirm is ready
    if (st.active === 'roof' && st.roofMode === 'auto') session.aim({ x: 0, z: 0 });
    render();
  }

  // ---- Roof ----

  const roofMode = segmented<RoofMode>({
    label: 'Roof tool',
    value: st.roofMode,
    options: [{ id: 'rect', label: 'Draw (drag)', icon: 'roof' }, { id: 'auto', label: 'Auto roof', icon: 'home' }, { id: 'remove', label: 'Remove', icon: 'trash' }],
    onChange: (v) => { st.roofMode = v; api.sound('tap'); choose(); },
  });
  roofMode.el.classList.add('bb-seg-tight');
  const styleHost = h('div', { class: 'bb-ext-host bb-ext-styles' });
  const finishHost = h('div', { class: 'bb-ext-host bb-ext-finishes' });
  const palettes = h('div', { class: 'bb-palettes', role: 'radiogroup', ariaLabel: 'Roof colour' });
  const palName = h('span', { class: 'bb-swatch-name' });
  const palField = h('div', { class: 'field bb-pal-field' }, h('div', { class: 'field-label' }, 'Colour ', palName), palettes);
  const pitchInput = h('input', { type: 'range', class: 'bb-range', attrs: { min: '5', max: '75', step: '1', 'aria-label': 'Roof pitch' } }) as HTMLInputElement;
  const pitchText = h('span', { class: 'bb-range-value' });
  pitchInput.addEventListener('input', () => { st.pitch = Number(pitchInput.value); setText(pitchText, `${st.pitch}°`); });
  pitchInput.addEventListener('change', () => { choose(); });
  const pitchField = h('div', { class: 'field bb-range-field' }, h('div', { class: 'field-label' }, 'Pitch ', pitchText), pitchInput);
  const ridge = segmented<'long' | 'h' | 'v'>({
    label: 'Ridge direction',
    value: st.ridge,
    options: [{ id: 'long', label: 'Long side' }, { id: 'h', label: 'East-west' }, { id: 'v', label: 'North-south' }],
    onChange: (v) => { st.ridge = v; api.sound('tap'); choose(); },
  });
  ridge.el.classList.add('bb-seg-tight');
  const roofNote = h('p', { class: 'bb-note bb-muted' });
  const roofSection = h('section', { class: 'bb-tool-section', ariaLabel: 'Roofs', dataset: { section: 'roof' } },
    roofMode.el, styleHost, pitchField, ridge.el, finishHost, palField, roofNote);

  let styleGrid: CardGrid<RoofStyleDef> | null = null;
  let finishGrid: CardGrid<RoofFinishDef> | null = null;

  function renderRoof(): void {
    const remove = st.roofMode === 'remove';
    for (const n of [styleHost, pitchField, ridge.el, finishHost, palField]) n.hidden = remove;
    roofMode.set(st.roofMode);
    if (remove) { setText(roofNote, touch() ? 'Tap a roof, then confirm to take it off. Roofs are refunded like walls.' : 'Click a roof to take it off. Roofs are refunded like walls.'); return; }
    const fin = ex().roofFinishes[st.finish] ?? finishes()[0]!;
    const pal = fin.palettes.find((p) => p.id === palOf(fin)) ?? fin.palettes[0]!;
    const style = ex().roofStyles[st.style] ?? styles()[0]!;
    if (!styleGrid) {
      styleGrid = cardGrid<RoofStyleDef>({
        key: 'build:roof-styles', pageSize: () => (layout().compact ? 6 : 12), empty: 'No roof styles yet.',
        render: (s) => {
          const on = st.style === s.id;
          const f = ex().roofFinishes[st.finish] ?? finishes()[0]!;
          const p = f.palettes.find((x) => x.id === palOf(f)) ?? f.palettes[0]!;
          return h('button', {
            type: 'button', class: ['card', 'bb-card', on && 'is-selected'], dataset: { styleId: s.id }, attrs: { 'aria-pressed': on },
            ariaLabel: `${s.name} roof, ${formatMoney(s.pricePerM2)} per square metre`,
            onClick: () => { st.style = s.id; st.pitch = undefined; api.sound('tap'); choose(); },
          }, thumbImg(() => roofThumb(s.id, p, 120, s.pitch)), h('span', { class: 'card-name', text: s.name }), h('span', { class: 'card-meta bb-card-price', text: `${formatMoney(s.pricePerM2)} / m2` }));
        },
      });
      setChildren(styleHost, styleGrid.el);
    }
    styleGrid.setItems(styles());
    // pitch and ridge only matter for styles that have them
    const flat = style.pitchMin === style.pitchMax;
    pitchField.hidden = flat;
    ridge.el.hidden = !style.directional;
    if (!flat) {
      pitchInput.min = String(style.pitchMin); pitchInput.max = String(style.pitchMax);
      const v = Math.max(style.pitchMin, Math.min(style.pitchMax, st.pitch ?? style.pitch));
      pitchInput.value = String(v);
      setText(pitchText, `${v}°`);
    }
    ridge.set(st.ridge);
    if (!finishGrid) {
      finishGrid = cardGrid<RoofFinishDef>({
        key: 'build:roof-finishes', pageSize: () => (layout().compact ? 6 : 12), empty: 'No finishes yet.',
        render: (f) => {
          const on = st.finish === f.id;
          const p = f.palettes.find((x) => x.id === palOf(f)) ?? f.palettes[0]!;
          return h('button', {
            type: 'button', class: ['card', 'bb-card', on && 'is-selected'], dataset: { finishId: f.id }, attrs: { 'aria-pressed': on },
            ariaLabel: `${f.name}, ${formatMoney(f.pricePerM2)} per square metre`,
            onClick: () => { st.finish = f.id; api.sound('tap'); choose(); },
          }, thumbImg(() => finishThumb(f, p)), h('span', { class: 'card-name', text: f.name }), h('span', { class: 'card-meta bb-card-price', text: `+${formatMoney(f.pricePerM2)} / m2` }));
        },
      });
      setChildren(finishHost, finishGrid.el);
    }
    finishGrid.setItems(finishes());
    setChildren(palettes, fin.palettes.map((p) => {
      const b = h('button', { type: 'button', class: ['bb-pal', p.id === pal.id && 'is-selected'], role: 'radio', title: p.name, ariaLabel: p.name, dataset: { id: p.id }, attrs: { 'aria-checked': p.id === pal.id } });
      b.style.background = stripes(p.colors);
      b.addEventListener('click', () => { st.palette[fin.id] = p.id; api.sound('tap'); choose(); });
      return b;
    }));
    setText(palName, `- ${pal.name}`);
    const per = style.pricePerM2 + fin.pricePerM2;
    setText(roofNote, st.roofMode === 'auto'
      ? `${style.name}, ${fin.name}: ${formatMoney(per)} per m2. The auto roof covers the rooms of the top floor and replaces roofs under it.`
      : `${style.name}, ${fin.name}: ${formatMoney(per)} per m2. Drag a rectangle over the rooms.`);
  }

  // ---- Fence ----

  const fenceMode = segmented<FenceMode>({
    label: 'Fence tool',
    value: st.fenceMode,
    options: [{ id: 'run', label: 'Fence (drag)', icon: 'fence' }, { id: 'gate', label: 'Gate (tap)', icon: 'door' }, { id: 'remove', label: 'Remove', icon: 'trash' }],
    onChange: (v) => { st.fenceMode = v; api.sound('tap'); choose(); },
  });
  fenceMode.el.classList.add('bb-seg-tight');
  const fenceShape = segmented<'run' | 'rect'>({
    label: 'Fence shape',
    value: st.fenceShape,
    options: [{ id: 'run', label: 'Run or L', icon: 'fence' }, { id: 'rect', label: 'Rectangle', icon: 'move' }],
    onChange: (v) => { st.fenceShape = v; api.sound('tap'); choose(); },
  });
  fenceShape.el.classList.add('bb-seg-tight');
  const fenceHost = h('div', { class: 'bb-ext-host bb-ext-fences' });
  const variants = h('div', { class: 'bb-palettes', role: 'radiogroup', ariaLabel: 'Fence colour' });
  const varName = h('span', { class: 'bb-swatch-name' });
  const varField = h('div', { class: 'field bb-pal-field' }, h('div', { class: 'field-label' }, 'Colour ', varName), variants);
  const fenceNote = h('p', { class: 'bb-note bb-muted' });
  const fenceSection = h('section', { class: 'bb-tool-section', ariaLabel: 'Fences and gates', dataset: { section: 'fence' } }, fenceMode.el, fenceShape.el, fenceHost, varField, fenceNote);
  const fenceGrids = {} as Record<'fence' | 'gate', CardGrid<FenceDef> | null>;
  fenceGrids.fence = null; fenceGrids.gate = null;

  function renderFence(): void {
    const remove = st.fenceMode === 'remove';
    fenceMode.set(st.fenceMode);
    fenceShape.el.hidden = remove;
    fenceHost.hidden = remove; varField.hidden = remove;
    if (remove) { setText(fenceNote, touch() ? 'Tap a fence or gate, then confirm to take it down. Refunded like walls.' : 'Click a fence or gate to take it down. Refunded like walls.'); return; }
    const kind = st.fenceMode === 'gate' ? 'gate' : 'fence';
    fenceShape.el.hidden = kind === 'gate';
    fenceShape.set(st.fenceShape);
    const cur = ex().fences[kind === 'gate' ? st.gate : st.fence] ?? fenceDefs(kind)[0]!;
    if (!fenceGrids[kind]) {
      fenceGrids[kind] = cardGrid<FenceDef>({
        key: `build:fence-${kind}`, pageSize: () => (layout().compact ? 6 : 12), empty: 'No designs yet.',
        render: (d) => {
          const on = (kind === 'gate' ? st.gate : st.fence) === d.id;
          const v = st.variant[d.id] ?? 0;
          return h('button', {
            type: 'button', class: ['card', 'bb-card', on && 'is-selected'], dataset: { defId: d.id }, attrs: { 'aria-pressed': on },
            ariaLabel: `${d.name}, ${formatMoney(d.price)}${kind === 'gate' ? '' : ' per metre'}`,
            onClick: () => { if (kind === 'gate') st.gate = d.id; else st.fence = d.id; api.sound('tap'); choose(); },
          }, thumbImg(() => fenceThumb(d, v, 120)), h('span', { class: 'card-name', text: d.name }),
          h('span', { class: 'card-meta bb-card-price', text: kind === 'gate' ? formatMoney(d.price) : `${formatMoney(d.price)} / m` }));
        },
      });
    }
    setChildren(fenceHost, fenceGrids[kind]!.el);
    fenceGrids[kind]!.setItems(fenceDefs(kind));
    const vi = st.variant[cur.id] ?? 0;
    const sel = fenceVariant(cur, vi);
    setChildren(variants, cur.variants.map((v, i) => {
      const on = v.id === sel.id;
      const b = h('button', { type: 'button', class: ['bb-pal', on && 'is-selected'], role: 'radio', title: v.name, ariaLabel: v.name, dataset: { id: v.id }, attrs: { 'aria-checked': on } });
      b.style.background = stripes([v.main, v.accent]);
      b.addEventListener('click', () => { st.variant[cur.id] = i; api.sound('tap'); fenceGrids[kind]?.refresh(); choose(); });
      return b;
    }));
    setText(varName, `- ${sel.name}`);
    const loopTip = touch() ? ' Rectangle draws a loop.' : ' Shift draws a loop.';
    setText(fenceNote, `${cur.name}: ${formatMoney(cur.price)}${kind === 'gate' ? ' per gate. A gate replaces the fence on the tapped edge and people can walk through it.' : ` per metre. Drag a run or an L.${loopTip} Fences block the way, gates do not. Upstairs they work as balcony railings.`}`);
  }

  // ---- Garden ----

  const gardenMode = segmented<GardenMode>({
    label: 'Ground paint tool',
    value: st.gardenMode,
    options: [{ id: 'tile', label: 'One tile', icon: 'terrain' }, { id: 'area', label: 'Area (drag)', icon: 'move' }, { id: 'remove', label: 'Back to lawn', icon: 'trash' }],
    onChange: (v) => { st.gardenMode = v; api.sound('tap'); choose(); },
  });
  gardenMode.el.classList.add('bb-seg-tight');
  const paintHost = h('div', { class: 'bb-ext-host bb-ext-paints' });
  const gardenNote = h('p', { class: 'bb-note bb-muted' });
  const buyBtn = button({ icon: 'leaf', label: 'Garden objects in Buy', variant: 'secondary', onClick: () => { api.sound('open'); api.setMode('buy'); } });
  buyBtn.classList.add('bb-ext-buy');
  const gardenSection = h('section', { class: 'bb-tool-section', ariaLabel: 'Garden', dataset: { section: 'garden' } }, gardenMode.el, paintHost, gardenNote, buyBtn);
  let paintGrid: CardGrid<TerrainPaintDef> | null = null;

  function renderGarden(): void {
    gardenMode.set(st.gardenMode);
    const remove = st.gardenMode === 'remove';
    paintHost.hidden = remove;
    if (!paintGrid) {
      paintGrid = cardGrid<TerrainPaintDef>({
        key: 'build:paints', pageSize: () => (layout().compact ? 6 : 12), empty: 'No paints yet.',
        render: (p) => {
          const on = st.paint === p.id;
          return h('button', {
            type: 'button', class: ['card', 'bb-card', on && 'is-selected'], dataset: { paintId: p.id }, attrs: { 'aria-pressed': on },
            ariaLabel: `${p.name}, ${formatMoney(p.price)} per tile`,
            onClick: () => { st.paint = p.id; api.sound('tap'); choose(); },
          }, thumbImg(() => paintThumb(p)), h('span', { class: 'card-name', text: p.name }), h('span', { class: 'card-meta bb-card-price', text: `${formatMoney(p.price)} / tile` }));
        },
      });
      setChildren(paintHost, paintGrid.el);
    }
    paintGrid.setItems(paints());
    const p = ex().terrain[st.paint];
    setText(gardenNote, remove
      ? `${touch() ? 'Tap' : 'Click'} ground to paint it back to the lot's own grass. Free.`
      : `${p?.name ?? 'Paint'}: ${formatMoney(p?.price ?? 0)} per tile. Paint goes on open ground, never inside a room. Plant, water, weed and harvest the beds from Live mode.`);
    setHidden(buyBtn, false);
  }

  // ---- Pool (Milestone 12) ----

  const poolMode = segmented<PoolMode>({
    label: 'Pool tool',
    value: st.poolMode,
    options: [{ id: 'draw', label: 'Draw (drag)', icon: 'pool' }, { id: 'remove', label: 'Remove', icon: 'trash' }, { id: 'ladder', label: 'Ladder', icon: 'move' }],
    onChange: (v) => { st.poolMode = v; api.sound('tap'); choose(); },
  });
  poolMode.el.classList.add('bb-seg-tight');
  const ladderMode = segmented<LadderMode>({
    label: 'Ladder tool',
    value: st.ladderMode,
    options: [{ id: 'move', label: 'Move', icon: 'move' }, { id: 'add', label: 'Add', icon: 'plus' }, { id: 'remove', label: 'Remove', icon: 'minus' }],
    onChange: (v) => { st.ladderMode = v; api.sound('tap'); choose(); },
  });
  ladderMode.el.classList.add('bb-seg-tight');
  const poolHost = h('div', { class: 'bb-ext-host bb-ext-pools' });
  const poolNote = h('p', { class: 'bb-note bb-muted' });
  const poolSection = h('section', { class: 'bb-tool-section', ariaLabel: 'Pools', dataset: { section: 'pool' } }, poolMode.el, ladderMode.el, poolHost, poolNote);
  let poolGrid: CardGrid<PoolStyleDef> | null = null;

  function renderPool(): void {
    poolMode.set(st.poolMode);
    const draw = st.poolMode === 'draw';
    const ladder = st.poolMode === 'ladder';
    poolHost.hidden = !draw;
    ladderMode.el.hidden = !ladder;
    if (draw) {
      if (!poolGrid) {
        poolGrid = cardGrid<PoolStyleDef>({
          key: 'build:pool-styles', pageSize: () => (layout().compact ? 6 : 12), empty: 'No pool styles yet.',
          render: (s) => {
            const on = st.poolStyle === s.id;
            return h('button', {
              type: 'button', class: ['card', 'bb-card', on && 'is-selected'], dataset: { styleId: s.id }, attrs: { 'aria-pressed': on },
              ariaLabel: `${s.name}, ${formatMoney(s.pricePerTile)} per square metre of water`,
              onClick: () => { st.poolStyle = s.id; api.sound('tap'); choose(); },
            }, thumbImg(() => poolThumb(s, 120)), h('span', { class: 'card-name', text: s.name }), h('span', { class: 'card-meta bb-card-price', text: `${formatMoney(s.pricePerTile)} / m2` }));
          },
        });
        setChildren(poolHost, poolGrid.el);
      }
      poolGrid.setItems(poolStyles());
      const cur = ex().poolStyles[st.poolStyle] ?? poolStyles()[0];
      setText(poolNote, cur
        ? `${cur.name}: ${formatMoney(cur.pricePerTile)} per m2 of water. Drag a rectangle of at least 2 x 3 m on open ground or a ground-floor room. A ladder goes on a short side.`
        : 'Drag a rectangle on open ground.');
      return;
    }
    if (ladder) {
      ladderMode.set(st.ladderMode);
      const verb = touch() ? 'Tap' : 'Click';
      setText(poolNote, st.ladderMode === 'move'
        ? `${verb} a ladder to pick it up, then tap the edge tile to move it to.`
        : st.ladderMode === 'add'
          ? `${verb} an edge tile of a pool to add a ladder there.`
          : `${verb} a ladder to remove it. Every pool keeps at least one ladder.`);
      return;
    }
    setText(poolNote, `${touch() ? 'Tap' : 'Click'} a pool, then confirm to drain it. Refunded like the rest: 80 % back, all of it on the day it was built.`);
  }

  function render(): void {
    if (st.active === 'roof') renderRoof();
    else if (st.active === 'fence') renderFence();
    else if (st.active === 'garden') renderGarden();
    else if (st.active === 'pool') renderPool();
  }

  const tools: ExteriorTools = {
    sections: { roof: roofSection, fence: fenceSection, garden: gardenSection, pool: poolSection },
    enter(id) {
      st.active = id;
      api.view.setRoofEdit?.(id === 'roof');
      render();
      choose();
    },
    leave() {
      st.active = null;
      api.view.setRoofEdit?.(false);
    },
    active: () => st.active,
    refresh() { render(); },
  };
  return tools;
}
