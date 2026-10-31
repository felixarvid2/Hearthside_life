import { describe, expect, it } from 'vitest';
import { InputMachine, type InputEffect, type PointerSample } from '../../../src/ui/input/machine';
import { isTypingTarget, mapKey } from '../../../src/ui/input/keys';

const touch = (id: number, x: number, y: number, t = 0): PointerSample => ({ id, x, y, t, kind: 'touch' });
const mouse = (x: number, y: number, t = 0, button = 0): PointerSample => ({ id: 1, x, y, t, kind: 'mouse', button });
const types = (effects: InputEffect[]) => effects.map((e) => e.type);

describe('InputMachine: tap vs pan', () => {
  it('a quick still press is a tap at the press point', () => {
    const m = new InputMachine();
    expect(m.down(touch(1, 100, 100, 0))).toEqual([]);
    expect(m.state).toBe('pressing');
    m.move(touch(1, 103, 104, 50)); // 5 px: still a press
    expect(m.state).toBe('pressing');
    const out = m.up(touch(1, 103, 104, 120));
    expect(out).toEqual([{ type: 'tap', x: 100, y: 100, kind: 'touch' }]);
    expect(m.state).toBe('idle');
  });

  it('moving 8 px or more becomes a pan and never taps', () => {
    const m = new InputMachine();
    m.down(touch(1, 100, 100, 0));
    const first = m.move(touch(1, 108, 100, 30));
    expect(m.state).toBe('panning');
    expect(first).toEqual([{ type: 'panStart' }, { type: 'pan', dx: 8, dy: 0 }]);
    expect(m.move(touch(1, 110, 95, 40))).toEqual([{ type: 'pan', dx: 2, dy: -5 }]);
    // coming back to the start point still is no tap
    m.move(touch(1, 100, 100, 60));
    const out = m.up(touch(1, 100, 100, 80));
    expect(types(out)).toEqual(['panEnd']);
    expect(m.state).toBe('idle');
  });

  it('just below the threshold stays a tap; the threshold is inclusive for pans', () => {
    const m = new InputMachine();
    m.down(touch(1, 0, 0, 0));
    m.move(touch(1, 7.9, 0, 10));
    expect(m.state).toBe('pressing');
    m.move(touch(1, 8, 0, 20));
    expect(m.state).toBe('panning');
  });

  it('a long press (> 500 ms) is not a tap', () => {
    const m = new InputMachine();
    m.down(touch(1, 10, 10, 0));
    expect(m.up(touch(1, 10, 10, 650))).toEqual([]);
    expect(m.state).toBe('idle');
  });

  it('mouse left click taps; mouse move without buttons hovers; touch never hovers', () => {
    const m = new InputMachine();
    expect(m.move(mouse(5, 6))).toEqual([{ type: 'hover', x: 5, y: 6 }]);
    expect(m.move(touch(9, 5, 6))).toEqual([]);
    m.down(mouse(5, 6, 0));
    expect(m.move(mouse(6, 6, 10))).toEqual([]); // no hover while pressed
    expect(types(m.up(mouse(6, 6, 50)))).toEqual(['tap']);
  });

  it('right and middle drags pan immediately and never tap', () => {
    for (const button of [1, 2]) {
      const m = new InputMachine();
      expect(types(m.down(mouse(0, 0, 0, button)))).toEqual(['panStart']);
      expect(m.state).toBe('panning');
      expect(m.move(mouse(3, 4, 10, button))).toEqual([{ type: 'pan', dx: 3, dy: 4 }]);
      expect(types(m.up(mouse(3, 4, 20, button)))).toEqual(['panEnd']);
      // a right click without movement is not a tap either
      m.down(mouse(0, 0, 30, button));
      expect(types(m.up(mouse(0, 0, 40, button)))).toEqual(['panEnd']);
    }
  });
});

describe('InputMachine: pinch', () => {
  it('two fingers zoom about the midpoint and pan with it', () => {
    const m = new InputMachine({ rotateStepDeg: 0 });
    m.down(touch(1, 100, 100, 0));
    expect(types(m.down(touch(2, 200, 100, 5)))).toEqual(['panStart']);
    expect(m.state).toBe('pinching');
    const out = m.move(touch(2, 300, 100, 20)); // distance 100 -> 200, midpoint 150 -> 200
    const zoom = out.find((e) => e.type === 'zoom');
    const pan = out.find((e) => e.type === 'pan');
    expect(zoom).toMatchObject({ type: 'zoom', x: 200, y: 100 });
    expect(zoom && zoom.type === 'zoom' && zoom.factor).toBeCloseTo(2);
    expect(pan).toEqual({ type: 'pan', dx: 50, dy: 0 });
  });

  it('pinching in gives a factor below 1', () => {
    const m = new InputMachine({ rotateStepDeg: 0 });
    m.down(touch(1, 0, 0, 0));
    m.down(touch(2, 200, 0, 0));
    const out = m.move(touch(2, 100, 0, 10));
    const zoom = out.find((e) => e.type === 'zoom');
    expect(zoom && zoom.type === 'zoom' && zoom.factor).toBeCloseTo(0.5);
  });

  it('a pinch never ends in a tap, even if fingers did not move', () => {
    const m = new InputMachine();
    m.down(touch(1, 100, 100, 0));
    m.down(touch(2, 140, 100, 10));
    expect(types(m.up(touch(1, 100, 100, 40)))).toEqual([]);
    expect(m.state).toBe('panning'); // remaining finger pans
    expect(types(m.up(touch(2, 140, 100, 60)))).toEqual(['panEnd']);
    expect(m.state).toBe('idle');
  });

  it('after lifting one finger the other pans from where it is (no jump, no tap)', () => {
    const m = new InputMachine({ rotateStepDeg: 0 });
    m.down(touch(1, 100, 100, 0));
    m.down(touch(2, 200, 100, 0));
    m.up(touch(2, 200, 100, 10));
    expect(m.move(touch(1, 104, 100, 20))).toEqual([{ type: 'pan', dx: 4, dy: 0 }]);
    expect(types(m.up(touch(1, 104, 100, 30)))).toEqual(['panEnd']);
  });

  it('a pan in progress turns into a pinch when a second finger lands', () => {
    const m = new InputMachine();
    m.down(touch(1, 0, 0, 0));
    m.move(touch(1, 20, 0, 10));
    expect(m.state).toBe('panning');
    expect(m.down(touch(2, 100, 0, 20))).toEqual([]); // already panning: no second panStart
    expect(m.state).toBe('pinching');
  });

  it('a third finger is tracked but ignored, and lifting it keeps the pinch going', () => {
    const m = new InputMachine({ rotateStepDeg: 0 });
    m.down(touch(1, 0, 0, 0));
    m.down(touch(2, 100, 0, 0));
    expect(m.down(touch(3, 50, 50, 0))).toEqual([]);
    expect(m.pointerCount).toBe(3);
    expect(m.move(touch(3, 60, 60, 5))).toEqual([]); // third finger does not drive the pinch
    m.up(touch(3, 60, 60, 10));
    expect(m.state).toBe('pinching');
    expect(m.pointerCount).toBe(2);
  });

  it('two-finger twist rotates in 90-degree steps', () => {
    const m = new InputMachine({ rotateStepDeg: 45 });
    m.down(touch(1, 0, 0, 0));
    m.down(touch(2, 100, 0, 0));
    // rotate the second finger around the first by about 60 degrees, keeping the distance
    const a = (60 * Math.PI) / 180;
    const out = m.move(touch(2, 100 * Math.cos(a), 100 * Math.sin(a), 30));
    expect(out).toContainEqual({ type: 'rotate', dir: 1 });
    // small further twist does not rotate again
    const b = (70 * Math.PI) / 180;
    expect(m.move(touch(2, 100 * Math.cos(b), 100 * Math.sin(b), 40)).some((e) => e.type === 'rotate')).toBe(false);
  });

  it('a mouse press is ignored while touches are down, and touches do not pinch with a held mouse', () => {
    const m = new InputMachine();
    m.down(touch(1, 0, 0, 0));
    expect(m.down({ id: 99, x: 5, y: 5, t: 1, kind: 'mouse', button: 0 })).toEqual([]);
    expect(m.pointerCount).toBe(1);
    const m2 = new InputMachine();
    m2.down(mouse(0, 0, 0));
    expect(m2.down(touch(5, 10, 10, 1))).toEqual([]);
    expect(m2.state).toBe('pressing');
  });
});

describe('InputMachine: cancel and edge cases', () => {
  it('pointercancel during a press resets to idle without a tap', () => {
    const m = new InputMachine();
    m.down(touch(1, 10, 10, 0));
    expect(m.cancel(1)).toEqual([]);
    expect(m.state).toBe('idle');
    expect(m.up(touch(1, 10, 10, 50))).toEqual([]); // the late pointerup is ignored
  });

  it('cancel during a pan or pinch only ends the drag', () => {
    const m = new InputMachine();
    m.down(touch(1, 0, 0, 0));
    m.move(touch(1, 30, 0, 10));
    expect(types(m.cancel(1))).toEqual(['panEnd']);
    expect(m.state).toBe('idle');
    m.down(touch(1, 0, 0, 20));
    m.down(touch(2, 50, 0, 20));
    expect(types(m.cancel(2))).toEqual(['panEnd']);
    expect(m.pointerCount).toBe(0);
  });

  it('cancel for an unknown pointer is ignored', () => {
    const m = new InputMachine();
    m.down(touch(1, 0, 0, 0));
    expect(m.cancel(42)).toEqual([]);
    expect(m.state).toBe('pressing');
  });

  it('reset (blur) forgets every pointer', () => {
    const m = new InputMachine();
    m.down(touch(1, 0, 0, 0));
    m.down(touch(2, 10, 0, 0));
    m.reset();
    expect(m.state).toBe('idle');
    expect(m.pointerCount).toBe(0);
    expect(m.up(touch(1, 0, 0, 10))).toEqual([]);
    // a fresh tap works afterwards
    m.down(touch(3, 5, 5, 20));
    expect(types(m.up(touch(3, 5, 5, 40)))).toEqual(['tap']);
  });

  it('moves and ups from untracked pointers are ignored', () => {
    const m = new InputMachine();
    expect(m.up(touch(7, 0, 0, 0))).toEqual([]);
    m.down(touch(1, 0, 0, 0));
    expect(m.move(touch(2, 50, 50, 5))).toEqual([]);
    expect(m.state).toBe('pressing');
  });

  it('a duplicate pointerdown for a tracked pointer acts as a move', () => {
    const m = new InputMachine();
    m.down(touch(1, 0, 0, 0));
    m.down(touch(1, 20, 0, 10));
    expect(m.state).toBe('panning');
    expect(m.pointerCount).toBe(1);
  });

  it('wheel zooms around the cursor; up zooms in, down zooms out; lines are scaled', () => {
    const m = new InputMachine();
    const zin = m.wheel(-100, 30, 40)[0];
    const zout = m.wheel(100, 30, 40)[0];
    expect(zin).toMatchObject({ type: 'zoom', x: 30, y: 40 });
    expect(zin && zin.type === 'zoom' && zin.factor).toBeGreaterThan(1);
    expect(zout && zout.type === 'zoom' && zout.factor).toBeLessThan(1);
    const line = m.wheel(3, 0, 0, 1)[0];
    const px = m.wheel(48, 0, 0, 0)[0];
    expect(line && line.type === 'zoom' && line.factor).toBeCloseTo(px && px.type === 'zoom' ? px.factor : 0);
    expect(m.wheel(0, 0, 0)).toEqual([]);
  });
});

describe('keyboard mapping', () => {
  it('maps the documented shortcuts', () => {
    expect(mapKey({ key: 'w' })).toEqual({ kind: 'pan', dir: 'up' });
    expect(mapKey({ key: 'ArrowLeft' })).toEqual({ kind: 'pan', dir: 'left' });
    expect(mapKey({ key: 'Q' })).toEqual({ kind: 'rotate', dir: -1 });
    expect(mapKey({ key: 'e' })).toEqual({ kind: 'rotate', dir: 1 });
    expect(mapKey({ key: '+' })).toEqual({ kind: 'zoom', dir: 1 });
    expect(mapKey({ key: '-' })).toEqual({ kind: 'zoom', dir: -1 });
    expect(mapKey({ key: ' ' })).toEqual({ kind: 'togglePause' });
    expect(mapKey({ key: '2' })).toEqual({ kind: 'speed', speed: 2 });
    expect(mapKey({ key: 'Escape' })).toEqual({ kind: 'escape' });
    expect(mapKey({ key: 'r' })).toEqual({ kind: 'rotatePlacement' });
    expect(mapKey({ key: 'Delete' })).toEqual({ kind: 'delete' });
  });

  it('maps undo and both redo forms, and ignores other modified keys', () => {
    expect(mapKey({ key: 'z', ctrlKey: true })).toEqual({ kind: 'undo' });
    expect(mapKey({ key: 'Z', ctrlKey: true, shiftKey: true })).toEqual({ kind: 'redo' });
    expect(mapKey({ key: 'y', ctrlKey: true })).toEqual({ kind: 'redo' });
    expect(mapKey({ key: 'z', metaKey: true })).toEqual({ kind: 'undo' });
    expect(mapKey({ key: 's', ctrlKey: true })).toBeNull();
    expect(mapKey({ key: 'w', altKey: true })).toBeNull();
    expect(mapKey({ key: 'x' })).toBeNull();
  });

  it('detects text fields', () => {
    expect(isTypingTarget({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTypingTarget({ tagName: 'input', type: 'range' })).toBe(false);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
