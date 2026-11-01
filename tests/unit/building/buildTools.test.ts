// BuildTools: snapping of pointer points to vertices, edges and tiles, tool resolution (wide openings are
// centred on the pointer, room doors sit in the middle of a side), previews are pure, apply goes through the
// owner's undo stack, rooms and openings can be queried.

import { describe, expect, it } from 'vitest';
import { UndoStack } from '../../../src/core/commands';
import { EventBus } from '../../../src/core/events';
import { edgeKey } from '../../../src/core/ids';
import { BuildTools, nearestEdge, resolveBuild, snapTile, snapVertex } from '../../../src/game/core/build';
import type { BuildTool } from '../../../src/game/api';
import { fixtureContent, testWorld } from '../world/fixtures';

function setup() {
  const content = fixtureContent();
  content.openings['window-triple'] = { ...content.openings['window-wide']!, id: 'window-triple', name: 'Triple Window', width: 3, price: 60000 };
  const w = testWorld();
  const events = new EventBus();
  const stack = new UndoStack();
  let mode: 'build' | 'live' = 'build';
  let changes = 0;
  const tools = new BuildTools({
    content, events, world: () => w.state,
    run: (cmd) => stack.run({ state: w.state, content, events }, cmd),
    blocked: () => (mode === 'build' ? null : 'Open Build mode first.'),
    changed: () => { changes++; },
  });
  return { ...w, content, events, stack, tools, setMode: (m: 'build' | 'live') => { mode = m; }, changes: () => changes };
}

const json = (v: unknown) => JSON.stringify(v);

describe('snapping', () => {
  it('vertices round and stay on the lot; tiles floor; edges are the nearest', () => {
    const { lot } = setup();
    expect(snapVertex(lot, { x: 3.4, z: 7.6 })).toEqual({ x: 3, z: 8 });
    expect(snapVertex(lot, { x: -3, z: 99 })).toEqual({ x: 0, z: 24 });
    expect(snapTile({ x: 3.99, z: 0.01 })).toEqual({ x: 3, z: 0 });
    expect(nearestEdge(lot, 0, { x: 3.5, z: 4.1 }, false)).toEqual({ dir: 'h', x: 3, z: 4 });
    expect(nearestEdge(lot, 0, { x: 3.9, z: 4.5 }, false)).toEqual({ dir: 'v', x: 4, z: 4 });
    expect(nearestEdge(lot, 0, { x: 3.5, z: 4.5 }, true)).toBeNull(); // no walls yet
  });
});

describe('tool resolution', () => {
  it('runs straighten to the dominant axis; rooms need a corner drag', () => {
    const { state, lot, content } = setup();
    const run: BuildTool = { kind: 'wall', shape: 'run' };
    const r = resolveBuild(content, lot, run, { from: { x: 2.1, z: 2.1 }, to: { x: 6.2, z: 3.4 } });
    expect(r).toMatchObject({ ok: true, build: { kind: 'walls', shape: 'run' } });
    expect(r.ok && 'build' in r && r.build.kind === 'walls' && r.build.edges).toHaveLength(4);
    expect(resolveBuild(content, lot, { kind: 'room' }, { from: { x: 2, z: 2 } })).toMatchObject({ ok: false });
    void state;
  });

  it('room doors sit in the middle of the chosen side', () => {
    const { lot, content } = setup();
    const r = resolveBuild(content, lot, { kind: 'room', doors: [{ defId: 'door-panel', side: 's' }, { defId: 'window-sash', side: 'w', offset: 1 }] }, { from: { x: 6, z: 6 }, to: { x: 11, z: 10 } });
    expect(r.ok && 'build' in r && r.build.kind === 'walls' && r.build.openings).toEqual([
      { defId: 'door-panel', wallId: edgeKey(0, 'h', 8, 10) },
      { defId: 'window-sash', wallId: edgeKey(0, 'v', 6, 8) },
    ]);
    expect(resolveBuild(content, lot, { kind: 'room', doors: [{ defId: 'door-panel', side: 'n', offset: 9 }] }, { from: { x: 6, z: 6 }, to: { x: 11, z: 10 } })).toMatchObject({ ok: false });
  });
});

describe('BuildTools', () => {
  it('previews never change state; apply is undoable; wide openings are centred on the pointer', () => {
    const { state, lot, hh, tools, stack, events, content, changes } = setup();
    tools.setTool({ kind: 'room', doors: [] });
    const before = json(state);
    const pv = tools.preview({ from: { x: 6, z: 6 }, to: { x: 13, z: 10 } })!;
    expect(pv).toMatchObject({ ok: true, counts: { wallsNew: 22 }, measure: { widthM: 7, depthM: 4, areaM2: 28, text: '7 x 4 m (28 m2)' } });
    expect(json(state)).toBe(before);
    expect(tools.highlight()).toMatchObject({ ok: true });
    expect(changes()).toBeGreaterThan(0);
    const r = tools.apply({ from: { x: 6, z: 6 }, to: { x: 13, z: 10 } });
    expect(r).toMatchObject({ ok: true, cost: pv.cost });
    expect(r.rooms!.created).toHaveLength(1);
    expect(tools.highlight()).toBeNull();
    // a triple window centred on x 9.5 -> first edge x 8 (edges 8, 9, 10)
    tools.setTool({ kind: 'opening', defId: 'window-triple' });
    const pw = tools.preview({ from: { x: 9.5, z: 10.1 } })!;
    expect(pw.highlight!.openingEdges).toEqual([edgeKey(0, 'h', 8, 10), edgeKey(0, 'h', 9, 10), edgeKey(0, 'h', 10, 10)]);
    const a = tools.apply({ from: { x: 9.5, z: 10.1 } });
    expect(a.ok).toBe(true);
    expect(tools.openingAt(edgeKey(0, 'h', 10, 10))).toMatchObject({ defId: 'window-triple', kind: 'window', span: 3, wallId: edgeKey(0, 'h', 8, 10) });
    expect(tools.openingAt(edgeKey(0, 'h', 6, 10))).toBeNull();
    // rooms
    const rooms = tools.rooms();
    expect(rooms.filter((x) => !x.outdoor)).toHaveLength(1);
    expect(tools.roomAt({ x: 8, z: 8 })!.area).toBe(28);
    expect(tools.roomAt({ x: 0, z: 0 })!.outdoor).toBe(true);
    // the owner's stack owns undo
    expect(stack.undo({ state, content, events })).toBe('Place Triple Window');
    expect(Object.keys(lot.openings)).toHaveLength(0);
    expect(hh.funds).toBe(2000000 - pv.cost);
  });

  it('refuses outside Build mode and without a tool, and keeps the tool across previews', () => {
    const { tools, setMode } = setup();
    expect(tools.preview({ from: { x: 1, z: 1 } })).toBeNull();
    expect(tools.apply({ from: { x: 1, z: 1 } })).toMatchObject({ ok: false, reason: 'Choose a build tool first.' });
    tools.setTool({ kind: 'wall', shape: 'segment' });
    setMode('live');
    expect(tools.preview({ from: { x: 1.5, z: 1.1 } })).toMatchObject({ ok: false, reason: 'Open Build mode first.' });
    setMode('build');
    expect(tools.preview({ from: { x: 1.5, z: 1.1 } })).toMatchObject({ ok: true, counts: { wallsNew: 1 } });
    tools.cancel();
    expect(tools.highlight()).toBeNull();
    expect(tools.tool()).toMatchObject({ kind: 'wall' });
    tools.clear();
    expect(tools.tool()).toBeNull();
  });

  it('move opening needs a picked opening; erase opening finds it by pointer', () => {
    const { lot, tools } = setup();
    tools.setTool({ kind: 'room', doors: [{ defId: 'door-panel', side: 's' }] });
    expect(tools.apply({ from: { x: 6, z: 6 }, to: { x: 11, z: 10 } }).ok).toBe(true);
    const door = Object.values(lot.openings)[0]!;
    tools.setTool({ kind: 'moveOpening', openingId: null });
    expect(tools.preview({ from: { x: 6.5, z: 6 } })).toMatchObject({ ok: false, reason: 'Pick the door or window to move.' });
    tools.setTool({ kind: 'moveOpening', openingId: door.id });
    expect(tools.apply({ from: { x: 6.5, z: 10 } })).toMatchObject({ ok: true, openingId: door.id });
    expect(lot.openings[door.id]!.wallId).toBe(edgeKey(0, 'h', 6, 10));
    tools.setTool({ kind: 'eraseOpening' });
    expect(tools.apply({ from: { x: 6.5, z: 10.2 } })).toMatchObject({ ok: true });
    expect(Object.keys(lot.openings)).toHaveLength(0);
  });
});
