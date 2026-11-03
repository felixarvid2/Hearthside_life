// The exterior build tools through BuildTools (game/core/build.ts): the tool kinds fence, eraseFence, roof, eraseRoof and terrain resolve
// pointer targets to exterior requests, preview without changing the state, apply through the undo stack and report cost and label.

import { describe, expect, it } from 'vitest';
import { EXTERIOR } from '../../../src/content/exterior';
import { UndoStack } from '../../../src/core/commands';
import { EventBus, type GameEvent } from '../../../src/core/events';
import { tileKey } from '../../../src/core/ids';
import { BuildTools, resolveBuild } from '../../../src/game/core/build';
import { addOpening, addRectWalls } from '../../../src/world/walls';
import { fixtureContent, testWorld } from '../world/fixtures';

const F = { designId: 'plain-paint', paletteId: 'plain-paint-p0' };
const OAK = { designId: 'oak-planks', paletteId: 'oak-planks-p0' };
const SHINGLE = { designId: 'asphalt-shingle', paletteId: 'charcoal' };

function setup() {
  const content = fixtureContent();
  const w = testWorld();
  const events = new EventBus();
  const seen: GameEvent[] = [];
  events.onAny((e) => seen.push(e));
  const stack = new UndoStack();
  const tools = new BuildTools({
    content, events, world: () => w.state,
    run: (cmd) => stack.run({ state: w.state, content, events }, cmd),
    blocked: () => null,
    changed: () => undefined,
  });
  addRectWalls(w.lot, 0, 4, 4, 10, 8, { a: F, b: F });
  for (let z = 4; z < 8; z++) for (let x = 4; x < 10; x++) w.lot.floors[tileKey(0, x, z)] = { ...OAK };
  addOpening(w.state, w.lot, content.openings['door-panel']!, '0:h:6:8');
  return { ...w, content, events, seen, stack, tools };
}

const json = (v: unknown) => JSON.stringify(v);

describe('exterior tool resolution', () => {
  it('a fence run straightens to the dominant axis, a gate takes the nearest edge, erase finds the fence under the pointer', () => {
    const { lot, content } = setup();
    const fence = resolveBuild(content, lot, { kind: 'fence', defId: 'picket-white', variant: 2 }, { from: { x: 2.1, z: 12.2 }, to: { x: 6.2, z: 13.4 } });
    expect(fence).toMatchObject({ ok: true, exterior: { kind: 'fence', defId: 'picket-white', variant: 2 } });
    expect(fence.ok && 'exterior' in fence && fence.exterior.kind === 'fence' && fence.exterior.edges).toHaveLength(4);
    const gate = resolveBuild(content, lot, { kind: 'fence', defId: 'gate-picket' }, { from: { x: 3.5, z: 12.1 } });
    expect(gate).toMatchObject({ ok: true, exterior: { kind: 'fence', defId: 'gate-picket', edges: [{ dir: 'h', x: 3, z: 12 }] } });
    expect(resolveBuild(content, lot, { kind: 'fence', defId: 'nope' }, { from: { x: 1, z: 1 }, to: { x: 4, z: 1 } })).toMatchObject({ ok: false });
    expect(resolveBuild(content, lot, { kind: 'eraseFence' }, { from: { x: 3.5, z: 12.1 } })).toMatchObject({ ok: false }); // nothing built yet
  });

  it('roofs and paint resolve their rectangles and tiles', () => {
    const { lot, content } = setup();
    const roof = resolveBuild(content, lot, { kind: 'roof', shape: 'rect', spec: { styleId: 'gable', finish: SHINGLE } }, { from: { x: 3.9, z: 4.2 }, to: { x: 10.1, z: 7.8 } });
    expect(roof).toMatchObject({ ok: true, exterior: { kind: 'roof', level: 0, rect: { x0: 4, z0: 4, x1: 10, z1: 8 } } });
    const auto = resolveBuild(content, lot, { kind: 'roof', shape: 'auto', spec: { styleId: 'hip', pitch: 30, ridge: 'v', finish: SHINGLE } }, { from: { x: 0, z: 0 } });
    expect(auto).toMatchObject({ ok: true, exterior: { kind: 'autoRoof', spec: { styleId: 'hip', pitch: 30, ridge: 'v' } } });
    const tile = resolveBuild(content, lot, { kind: 'terrain', paintId: 'gravel', shape: 'tile' }, { from: { x: 3.7, z: 12.2 } });
    expect(tile).toMatchObject({ ok: true, exterior: { kind: 'terrain', paintId: 'gravel', tiles: [{ x: 3, z: 12 }] } });
    const area = resolveBuild(content, lot, { kind: 'terrain', paintId: 'gravel', shape: 'rect' }, { from: { x: 3.7, z: 12.2 }, to: { x: 5.2, z: 13.9 } });
    expect(area.ok && 'exterior' in area && area.exterior.kind === 'terrain' && area.exterior.tiles).toHaveLength(6);
    expect(resolveBuild(content, lot, { kind: 'eraseRoof' }, { from: { x: 5.5, z: 5.5 } })).toMatchObject({ ok: true, exterior: { kind: 'eraseRoof', tile: { x: 5, z: 5 } } });
  });
});

describe('exterior tools through BuildTools', () => {
  it('previews are pure, apply is one undoable step with cost and label, highlights carry edges and tiles', () => {
    const { state, lot, hh, tools, stack, events, content, seen } = setup();
    const before = json(state);
    tools.setTool({ kind: 'fence', defId: 'picket-white', variant: 1 });
    const pv = tools.preview({ from: { x: 2, z: 12 }, to: { x: 8, z: 12 } })!;
    expect(pv.ok).toBe(true);
    expect(pv.label).toMatch(/6 m/);
    expect(pv.cost).toBe(6 * EXTERIOR.fences['picket-white']!.price);
    expect(pv.highlight!.newWalls).toHaveLength(6);
    expect(json(state)).toBe(before);
    const funds = state.households[hh.id]!.funds;
    const r = tools.apply({ from: { x: 2, z: 12 }, to: { x: 8, z: 12 } });
    expect(r.ok).toBe(true);
    expect(r.ok && r.cost).toBe(pv.cost);
    expect(Object.keys(lot.fences!)).toHaveLength(6);
    expect(state.households[hh.id]!.funds).toBe(funds - pv.cost);
    expect([...seen].reverse().find((e) => e.type === 'lot.changed')).toMatchObject({ what: 'fences' });
    stack.undo({ state, content, events });
    expect(lot.fences).toBeUndefined();
    expect(state.households[hh.id]!.funds).toBe(funds);
  });

  it('the auto roof, paint and removal go through the same path', () => {
    const { state, lot, hh, tools, stack, events, content } = setup();
    const ctx = { state, content, events };
    const funds0 = state.households[hh.id]!.funds;
    tools.setTool({ kind: 'roof', shape: 'auto', spec: { styleId: 'gable', finish: SHINGLE } });
    const pv = tools.preview({ from: { x: 0, z: 0 } })!;
    expect(pv.ok).toBe(true);
    expect(pv.label).toMatch(/Auto roof \(1 roof, 24 m2\)/);
    expect(pv.highlight!.tiles).toHaveLength(24);
    expect(tools.apply({ from: { x: 0, z: 0 } }).ok).toBe(true);
    expect(Object.values(lot.roofs!)).toHaveLength(1);
    tools.setTool({ kind: 'terrain', paintId: 'mulch', shape: 'rect' });
    expect(tools.apply({ from: { x: 12.5, z: 12.5 }, to: { x: 13.5, z: 13.5 } }).ok).toBe(true);
    expect(Object.keys(lot.terrain!)).toHaveLength(4);
    tools.setTool({ kind: 'eraseRoof' });
    const erase = tools.preview({ from: { x: 5.5, z: 5.5 } })!;
    expect(erase.ok && erase.cost < 0).toBe(true);
    expect(tools.apply({ from: { x: 5.5, z: 5.5 } }).ok).toBe(true);
    expect(lot.roofs).toBeUndefined();
    // a second erase has nothing to do
    expect(tools.preview({ from: { x: 5.5, z: 5.5 } })).toMatchObject({ unchanged: true });
    stack.undo(ctx); stack.undo(ctx); stack.undo(ctx);
    expect(lot.roofs).toBeUndefined();
    expect(lot.terrain).toBeUndefined();
    expect(state.households[hh.id]!.funds).toBe(funds0);
  });

  it('a refused plan comes back as a reason, not an exception', () => {
    const { tools, lot } = setup();
    tools.setTool({ kind: 'fence', defId: 'glass-frameless' });
    // upstairs with no floor
    const pv = tools.preview({ from: { x: 2, z: 12 }, to: { x: 5, z: 12 }, level: 1 })!;
    expect(pv.ok).toBe(false);
    expect(pv.reason).toMatch(/floor/);
    tools.setTool({ kind: 'roof', shape: 'rect', spec: { styleId: 'gable', finish: SHINGLE } });
    const bad = tools.preview({ from: { x: 14, z: 14 }, to: { x: 18, z: 17 } })!;
    expect(bad.ok).toBe(false);
    expect(bad.reason).toMatch(/walls or a floor/);
    void lot;
  });
});

