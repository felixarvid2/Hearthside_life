// Pure: which part of the canvas is covered by UI (bars, sheets, side panels), reported to
// api.view.setInsets so the camera keeps the focus in the visible remainder. Tested in tests/unit/ui/insets.test.ts.

export interface Rect { left: number; top: number; right: number; bottom: number }
export interface Insets { left: number; right: number; top: number; bottom: number }

export const ZERO_INSETS: Insets = { left: 0, right: 0, top: 0, bottom: 0 };

/**
 * Wide covers (>= 60 % of the canvas width) count against the top or bottom edge depending on which half their
 * centre is in; narrower covers count against the left or right edge. Covers are clipped to the canvas.
 */
export function computeInsets(canvas: Rect, covers: Rect[]): Insets {
  const cw = canvas.right - canvas.left, ch = canvas.bottom - canvas.top;
  const out: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  if (cw <= 0 || ch <= 0) return out;
  for (const r0 of covers) {
    const r = {
      left: Math.max(canvas.left, r0.left), right: Math.min(canvas.right, r0.right),
      top: Math.max(canvas.top, r0.top), bottom: Math.min(canvas.bottom, r0.bottom),
    };
    const w = r.right - r.left, h = r.bottom - r.top;
    if (w <= 0 || h <= 0) continue;
    if (w >= cw * 0.6) {
      const cy = (r.top + r.bottom) / 2;
      if (cy < canvas.top + ch / 2) out.top = Math.max(out.top, r.bottom - canvas.top);
      else out.bottom = Math.max(out.bottom, canvas.bottom - r.top);
    } else {
      const cx = (r.left + r.right) / 2;
      if (cx >= canvas.left + cw / 2) out.right = Math.max(out.right, canvas.right - r.left);
      else out.left = Math.max(out.left, r.right - canvas.left);
    }
  }
  return { left: Math.round(out.left), right: Math.round(out.right), top: Math.round(out.top), bottom: Math.round(out.bottom) };
}

export function sameInsets(a: Insets, b: Insets, tolerance = 1): boolean {
  return Math.abs(a.left - b.left) < tolerance && Math.abs(a.right - b.right) < tolerance
    && Math.abs(a.top - b.top) < tolerance && Math.abs(a.bottom - b.bottom) < tolerance;
}

/** Keeps a box of size (w, h) inside the area, preferring to centre it above an anchor point. */
export function placeAbove(anchor: { x: number; y: number }, box: { w: number; h: number }, area: Rect, gap = 12): { left: number; top: number; below: boolean } {
  let left = anchor.x - box.w / 2;
  left = Math.max(area.left, Math.min(area.right - box.w, left));
  let top = anchor.y - gap - box.h;
  let below = false;
  if (top < area.top) {
    // not enough room above: try below the anchor, else clamp into the area
    const t2 = anchor.y + gap;
    if (t2 + box.h <= area.bottom) { top = t2; below = true; } else top = Math.max(area.top, Math.min(area.bottom - box.h, top));
  }
  return { left: Math.round(left), top: Math.round(top), below };
}
