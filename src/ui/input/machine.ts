// Pure world-input state machine (no DOM). The DOM layer (src/ui/input.ts) feeds it pointer samples and wheel
// deltas and turns the returned effects into GameAPI calls. Keeping the decisions here makes the tap/pan/pinch
// rules unit-testable (tests/unit/ui/input.test.ts).
//
// Rules (docs/UI_SPEC.md "Input state machine"):
// - A press that moves >= TAP_SLOP px becomes a pan and never issues a tap.
// - A press held longer than TAP_MAX_MS is not a tap either (it can still become a pan).
// - Two touch pointers -> pinch (zoom about the midpoint, pan with the midpoint, optional 90-degree rotate steps).
//   After a pinch the remaining finger pans; no tap is issued until every pointer is up.
// - Right or middle mouse drag pans; no tap.
// - cancel()/reset() return to idle without effects (pointercancel, lostpointercapture, blur).

export type InputState = 'idle' | 'pressing' | 'panning' | 'pinching';
export type PointerKind = 'mouse' | 'touch' | 'pen';

export interface PointerSample {
  id: number;
  x: number;
  y: number;
  /** Timestamp in ms (event.timeStamp). */
  t: number;
  kind: PointerKind;
  /** Mouse button for down/up (0 left, 1 middle, 2 right). Touch and pen use 0. */
  button?: number;
}

export type InputEffect =
  | { type: 'tap'; x: number; y: number; kind: PointerKind }
  | { type: 'hover'; x: number; y: number }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'zoom'; factor: number; x: number; y: number }
  | { type: 'rotate'; dir: 1 | -1 }
  | { type: 'panStart' }
  | { type: 'panEnd' };

export interface InputMachineOptions {
  tapSlop?: number;
  tapMaxMs?: number;
  /** Two-finger twist (degrees) that triggers one 90-degree rotate step; 0 disables gesture rotation. */
  rotateStepDeg?: number;
  /** Ignore pinch scale changes smaller than this ratio per move (jitter guard). */
  minPinchRatio?: number;
}

interface Tracked { id: number; x: number; y: number; startX: number; startY: number; t0: number; kind: PointerKind }

export const TAP_SLOP = 8;
export const TAP_MAX_MS = 500;

export class InputMachine {
  readonly tapSlop: number;
  readonly tapMaxMs: number;
  readonly rotateStepDeg: number;
  readonly minPinchRatio: number;

  private st: InputState = 'idle';
  private pointers = new Map<number, Tracked>();
  /** Pointer driving the current press/pan. */
  private primary: number | null = null;
  /** Pinch reference values. */
  private pinchDist = 0;
  private pinchMid = { x: 0, y: 0 };
  private pinchAngle = 0;
  private twist = 0;
  /** True once a gesture used more than one pointer: no tap until all pointers are up. */
  private multi = false;

  constructor(o: InputMachineOptions = {}) {
    this.tapSlop = o.tapSlop ?? TAP_SLOP;
    this.tapMaxMs = o.tapMaxMs ?? TAP_MAX_MS;
    this.rotateStepDeg = o.rotateStepDeg ?? 50;
    this.minPinchRatio = o.minPinchRatio ?? 0.002;
  }

  get state(): InputState { return this.st; }
  /** Number of pointers currently held. */
  get pointerCount(): number { return this.pointers.size; }
  isTracking(id: number): boolean { return this.pointers.has(id); }

  down(p: PointerSample): InputEffect[] {
    const button = p.button ?? 0;
    if (p.kind === 'mouse') {
      // A mouse never pinches; any mouse press while another gesture runs is ignored.
      if (this.pointers.size > 0) return [];
      if (button !== 0 && button !== 1 && button !== 2) return [];
      this.track(p);
      this.primary = p.id;
      if (button === 0) { this.st = 'pressing'; return []; }
      this.st = 'panning';
      return [{ type: 'panStart' }];
    }
    if (this.pointers.has(p.id)) return this.move(p); // duplicate down: treat as a move
    if (this.pointers.size >= 2) { this.track(p); this.multi = true; return []; } // third finger: tracked, unused
    if (this.pointers.size === 0) {
      this.track(p);
      this.primary = p.id;
      this.multi = false;
      this.st = 'pressing';
      return [];
    }
    // second pointer: start pinching (a press or pan in progress turns into a pinch, never a tap)
    if (this.mouseHeld()) return [];
    const wasPanning = this.st === 'panning';
    this.track(p);
    this.multi = true;
    this.st = 'pinching';
    this.resetPinchRef();
    return wasPanning ? [] : [{ type: 'panStart' }];
  }

  move(p: PointerSample): InputEffect[] {
    const tr = this.pointers.get(p.id);
    if (!tr) {
      // Mouse/pen moving without a press: hover (desktop previews). Touch never hovers.
      if (this.st === 'idle' && this.pointers.size === 0 && p.kind !== 'touch') return [{ type: 'hover', x: p.x, y: p.y }];
      return [];
    }
    const px = tr.x, py = tr.y;
    tr.x = p.x; tr.y = p.y;
    switch (this.st) {
      case 'pressing': {
        if (p.id !== this.primary) return [];
        const dist = Math.hypot(p.x - tr.startX, p.y - tr.startY);
        if (dist < this.tapSlop) return [];
        this.st = 'panning';
        // The first pan step covers the whole distance from the start so the world follows the finger exactly.
        return [{ type: 'panStart' }, { type: 'pan', dx: p.x - tr.startX, dy: p.y - tr.startY }];
      }
      case 'panning': {
        if (p.id !== this.primary) return [];
        const dx = p.x - px, dy = p.y - py;
        return dx || dy ? [{ type: 'pan', dx, dy }] : [];
      }
      case 'pinching':
        return this.pinchStep();
      default:
        return [];
    }
  }

  up(p: PointerSample): InputEffect[] {
    const tr = this.pointers.get(p.id);
    if (!tr) return [];
    tr.x = p.x; tr.y = p.y;
    this.pointers.delete(p.id);
    const out: InputEffect[] = [];
    switch (this.st) {
      case 'pressing': {
        if (p.id === this.primary && !this.multi) {
          const quick = p.t - tr.t0 <= this.tapMaxMs;
          const still = Math.hypot(p.x - tr.startX, p.y - tr.startY) < this.tapSlop;
          if (quick && still) out.push({ type: 'tap', x: tr.startX, y: tr.startY, kind: tr.kind });
        }
        this.finish();
        return out;
      }
      case 'panning': {
        if (p.id === this.primary || this.pointers.size === 0) { out.push({ type: 'panEnd' }); this.finish(); }
        return out;
      }
      case 'pinching': {
        const active = this.activePinchPointers();
        if (active.length >= 2) { this.resetPinchRef(); return out; } // a third finger was down: keep pinching
        if (active.length === 1) {
          // continue as a pan with the remaining finger (rebased, so no jump and no tap)
          const rest = active[0]!;
          this.primary = rest.id;
          rest.startX = rest.x; rest.startY = rest.y;
          this.st = 'panning';
          return out;
        }
        out.push({ type: 'panEnd' });
        this.finish();
        return out;
      }
      default:
        if (this.pointers.size === 0) this.finish();
        return out;
    }
  }

  /** pointercancel / lostpointercapture for one pointer: abandon the whole gesture without side effects. */
  cancel(id?: number): InputEffect[] {
    if (id !== undefined && !this.pointers.has(id)) return [];
    const wasMoving = this.st === 'panning' || this.st === 'pinching';
    this.reset();
    return wasMoving ? [{ type: 'panEnd' }] : [];
  }

  /** Window blur or mode change: forget every pointer. */
  reset(): void {
    this.pointers.clear();
    this.finish();
  }

  /** Mouse wheel / trackpad: zoom about the cursor. deltaMode 1 = lines, 2 = pages. */
  wheel(deltaY: number, x: number, y: number, deltaMode = 0): InputEffect[] {
    if (!Number.isFinite(deltaY) || deltaY === 0) return [];
    const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
    const clamped = Math.max(-200, Math.min(200, px));
    const factor = Math.exp(-clamped * 0.0018); // > 1 zooms in
    return [{ type: 'zoom', factor, x, y }];
  }

  // ---------------------------------------------------------------------------------------------

  private track(p: PointerSample): void {
    this.pointers.set(p.id, { id: p.id, x: p.x, y: p.y, startX: p.x, startY: p.y, t0: p.t, kind: p.kind });
  }

  private mouseHeld(): boolean {
    for (const tr of this.pointers.values()) if (tr.kind === 'mouse') return true;
    return false;
  }

  private finish(): void {
    if (this.pointers.size === 0) {
      this.st = 'idle';
      this.primary = null;
      this.multi = false;
      this.twist = 0;
    }
  }

  /** The two oldest pointers drive the pinch. */
  private activePinchPointers(): Tracked[] {
    return [...this.pointers.values()].slice(0, 2);
  }

  private resetPinchRef(): void {
    const [a, b] = this.activePinchPointers();
    if (!a || !b) return;
    this.pinchDist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.pinchAngle = Math.atan2(b.y - a.y, b.x - a.x);
    this.twist = 0;
  }

  private pinchStep(): InputEffect[] {
    const [a, b] = this.activePinchPointers();
    if (!a || !b) return [];
    const out: InputEffect[] = [];
    const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = mid.x - this.pinchMid.x, dy = mid.y - this.pinchMid.y;
    if (dx || dy) out.push({ type: 'pan', dx, dy });
    const ratio = dist / this.pinchDist;
    if (Math.abs(ratio - 1) >= this.minPinchRatio) {
      out.push({ type: 'zoom', factor: ratio, x: mid.x, y: mid.y });
      this.pinchDist = dist;
    }
    this.pinchMid = mid;
    if (this.rotateStepDeg > 0) {
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      let d = ang - this.pinchAngle;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      this.pinchAngle = ang;
      this.twist += (d * 180) / Math.PI;
      if (Math.abs(this.twist) >= this.rotateStepDeg) {
        out.push({ type: 'rotate', dir: this.twist > 0 ? 1 : -1 });
        this.twist = 0;
      }
    }
    return out;
  }
}
