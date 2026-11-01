// BuildSession (src/ui/build/buildSession.ts) on a real GameCore: pointer points become targets, touch previews wait for
// Confirm, mouse applies on release, handles resize the pending shape, Esc cancels, and nothing changes before Confirm.

import { describe, expect, it } from 'vitest';
import { EventBus } from '../../../src/core/events';
import type { GameAPI, PickResult, SoundId } from '../../../src/game/api';
import { BuildSession, summarize, tipText, toolMode } from '../../../src/ui/build/buildSession';
import type { GameCore } from '../../../src/game/GameCore';
import { coreWithoutSaves } from '../integration/harness';

/** The slice of GameAPI the session uses, over a GameCore; screen points are lot tiles (x, y) scaled by 10. */
function fakeApi(core: GameCore): GameAPI {
  const listeners = new Set<(w: string) => void>();
  core.onChange((w) => { for (const fn of [...listeners]) fn(w); });
  const api = {
    content: core.content,
    events: core.events as EventBus,
    onChange: (fn: (w: string) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    state: () => core.state(),
    mode: () => core.mode(),
    buildTool: () => core.buildTool(),
    setBuildTool: (t: Parameters<GameCore['setBuildTool']>[0]) => core.setBuildTool(t),
    setPaintTool: (t: Parameters<GameCore['setPaintTool']>[0]) => core.setPaintTool(t),
    buildPreview: (t: Parameters<GameCore['buildPreview']>[0]) => core.buildPreview(t),
    buildApply: (t: Parameters<GameCore['buildApply']>[0]) => core.buildApply(t),
    buildCancel: () => core.buildCancel(),
    buildHighlight: () => core.buildHighlight(),
    rooms: (l?: number) => core.rooms(l),
    roomAt: (t: Parameters<GameCore['roomAt']>[0], l?: number) => core.roomAt(t, l),
    openingAt: (id: string) => core.openingAt(id),
    highlightRoom: () => undefined,
    view: {
      groundPoint: (x: number, y: number) => ({ x: x / 10, z: y / 10 }),
      pick: (): PickResult => ({ kind: 'none' }),
    },
  };
  return api as unknown as GameAPI;
}

function setup() {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', core.premadeHouseholds()[0]!, 21)).toEqual({ ok: true });
  core.setMode('build');
  const api = fakeApi(core);
  const sounds: SoundId[] = [];
  const toasts: string[] = [];
  const session = new BuildSession(api, { sound: (id) => { sounds.push(id); }, toast: (t) => { toasts.push(t); } });
  const lotJson = () => JSON.stringify(core.state()!.lots[core.state()!.activeLotId]);
  return { core, api, session, sounds, toasts, lotJson };
}

describe('toolMode', () => {
  it('drag tools shape with two points, click tools act on one', () => {
    expect(toolMode(null)).toBe('none');
    expect(toolMode({ kind: 'room' })).toBe('drag');
    expect(toolMode({ kind: 'wall', shape: 'run' })).toBe('drag');
    expect(toolMode({ kind: 'wall', shape: 'segment' })).toBe('click');
    expect(toolMode({ kind: 'eraseWall', shape: 'rect' })).toBe('drag');
    expect(toolMode({ kind: 'floor', finish: { designId: 'a', paletteId: 'b' }, shape: 'rect' })).toBe('drag');
    expect(toolMode({ kind: 'floor', finish: { designId: 'a', paletteId: 'b' }, shape: 'room' })).toBe('click');
    expect(toolMode({ kind: 'opening', defId: 'door-panel' })).toBe('click');
    expect(toolMode({ kind: 'deleteRoom' })).toBe('click');
  });
});

describe('BuildSession on touch', () => {
  it('a drag sets the preview and handles; nothing is built until Confirm; the shape can be resized', () => {
    const { core, session, lotJson } = setup();
    const before = lotJson();
    session.setTool({ kind: 'room' });
    session.drawStart(10, 10);
    session.draw(30, 20);
    session.draw(50, 40);
    session.drawEnd(50, 40, false, false);
    const s = session.state();
    expect(s.pending).toBe(true);
    expect(s.preview).toMatchObject({ ok: true, counts: { wallsNew: 14 } });
    expect(s.canConfirm).toBe(true);
    expect(lotJson()).toBe(before);
    expect(core.buildHighlight()).toMatchObject({ ok: true });
    const hs = session.handles();
    expect(hs.map((h) => [h.id, h.x, h.z])).toEqual([['c0', 1, 1], ['c1', 5, 1], ['c2', 5, 4], ['c3', 1, 4]]);
    // drag the south-east corner outward: the opposite corner stays
    session.moveHandle('c2', 70, 50);
    expect(session.handles().map((h) => [h.id, h.x, h.z])).toEqual([['c0', 1, 1], ['c1', 7, 1], ['c2', 7, 5], ['c3', 1, 5]]);
    expect(session.state().preview!.measure.text).toContain('6 x 4');
    expect(lotJson()).toBe(before);
    const r = session.confirm();
    expect(r.ok).toBe(true);
    expect(lotJson()).not.toBe(before);
    expect(session.state().pending).toBe(false);
    expect(core.undo()).toMatch(/room/i);
    expect(lotJson()).toBe(before);
  });

  it('Cancel clears the preview but keeps the tool; a second cancel finds nothing', () => {
    const { api, session, lotJson } = setup();
    const before = lotJson();
    session.setTool({ kind: 'wall', shape: 'run' });
    session.drawStart(10, 10);
    session.drawEnd(60, 10, false, false);
    expect(session.state().pending).toBe(true);
    expect(session.cancel()).toBe(true);
    expect(session.state()).toMatchObject({ pending: false, target: null, preview: null });
    expect(api.buildTool()).toMatchObject({ kind: 'wall' });
    expect(api.buildHighlight()).toBeNull();
    expect(session.cancel()).toBe(false);
    expect(lotJson()).toBe(before);
  });

  it('an interrupted draw keeps the preview (second finger, orientation change)', () => {
    const { session } = setup();
    session.setTool({ kind: 'room' });
    session.drawStart(10, 10);
    session.draw(50, 40);
    session.drawEnd(50, 40, true, false);
    expect(session.state()).toMatchObject({ pending: true, dragging: false });
    expect(session.state().preview?.ok).toBe(true);
  });

  it('a blocked shape shows its reason and cannot be confirmed', () => {
    const { session, lotJson } = setup();
    const before = lotJson();
    session.setTool({ kind: 'room' });
    // over the starter house: walls through furniture / people
    session.drawStart(70, 70);
    session.draw(150, 140);
    session.drawEnd(150, 140, false, false);
    const s = session.state();
    expect(s.preview?.ok).toBe(false);
    expect(s.canConfirm).toBe(false);
    expect(s.blockedReason).toBeTruthy();
    expect(session.confirm().ok).toBe(false);
    expect(lotJson()).toBe(before);
    expect(summarize(s.preview!).state).toBe('bad');
    expect(tipText(s.preview!).length).toBeGreaterThan(3);
  });

  it('a tap previews a click tool and Confirm applies it; a floor rectangle can be a single tap', () => {
    const { core, session } = setup();
    session.setTool({ kind: 'wall', shape: 'segment' });
    session.tap(15, 5, 'touch', { kind: 'none' });
    expect(session.state()).toMatchObject({ pending: true, canConfirm: true });
    expect(session.confirm().ok).toBe(true);
    expect(core.canUndo()).toBe(true);
    const f = Object.values(core.content.floorDesigns)[0]!;
    session.setTool({ kind: 'floor', shape: 'rect', finish: { designId: f.id, paletteId: f.palettes[0]!.id } });
    session.tap(35, 5, 'touch', { kind: 'none' });
    expect(session.handles().map((h) => h.id)).toEqual(['a', 'b']);
    expect(session.state().preview?.counts.floorsPlaced).toBe(1);
  });
});

describe('BuildSession with a mouse', () => {
  it('a click applies a click tool at once; a drag applies on release; Esc during a drag builds nothing', () => {
    const { core, session, lotJson } = setup();
    session.setTool({ kind: 'wall', shape: 'segment' });
    session.hover(15, 5);
    expect(session.state().pending).toBe(false);
    expect(session.state().preview?.ok).toBe(true);
    session.tap(15, 5, 'mouse', { kind: 'none' });
    expect(core.canUndo()).toBe(true);
    core.undo();

    session.setTool({ kind: 'room' });
    const before = lotJson();
    session.drawStart(10, 10);
    session.draw(50, 40);
    expect(session.cancel()).toBe(true);
    session.drawEnd(50, 40, false, true);
    expect(lotJson()).toBe(before);

    session.drawStart(10, 10);
    session.draw(50, 40);
    session.drawEnd(50, 40, false, true);
    expect(lotJson()).not.toBe(before);
    expect(session.state().pending).toBe(false);
  });
});
