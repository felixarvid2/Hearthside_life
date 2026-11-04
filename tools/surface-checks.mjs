// Pure helpers of tools/build-surface-maps.mjs (no sharp, no file access), unit-tested in
// tests/unit/surfaces/buildChecks.test.ts.

/** Largest share of the border pixels that may be ink before a motif counts as cut off by the image edge. */
export const MOTIF_BORDER_MAX = 0.02;
/** Allowed ink coverage of a motif source (share of all pixels). */
export const MOTIF_COVERAGE_MIN = 0.03;
export const MOTIF_COVERAGE_MAX = 0.7;
/** Margin around the ink bounding box in the square motif image, as a share of the box side. */
export const MOTIF_MARGIN = 0.04;
/** Output sizes in pixels. */
export const MOTIF_PX = 256;
export const MURAL_W = 1024;
export const MURAL_H = 512;

/** Options of a new detail map unless the group file overrides them (`build: {...}`). */
export const GENERIC_MATERIAL = { std: 0.17, flatten: 1, drift: 0.5 };

const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

/**
 * Greyscale (0 black .. 255 white) -> ink coverage mask (0 .. 255, 255 = ink) with a soft threshold: pixels darker
 * than `lo` are fully ink, lighter than `hi` fully paper, in between they ramp (anti-aliased edges).
 */
export function coverageMask(grey, lo = 0.3, hi = 0.7) {
  const out = new Uint8Array(grey.length);
  for (let i = 0; i < grey.length; i++) {
    const v = grey[i] / 255;
    out[i] = Math.round((1 - smooth((v - lo) / (hi - lo))) * 255);
  }
  return out;
}

/** Bounding box { x0, y0, x1, y1 } (x1/y1 exclusive) of pixels with mask >= thr, or null when there is none. */
export function inkBox(mask, w, h, thr = 128) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((mask[y * w + x] ?? 0) < thr) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * Checks that a motif source really is one isolated motif. Returns { ok, reason, coverage, border } where
 * `coverage` is the ink share of the area and `border` the ink share of the border pixels.
 */
export function motifCheck(mask, w, h, thr = 128) {
  let ink = 0;
  for (let i = 0; i < mask.length; i++) if ((mask[i] ?? 0) >= thr) ink++;
  const coverage = ink / (w * h);
  let edge = 0, edgeInk = 0;
  const test = (x, y) => { edge++; if ((mask[y * w + x] ?? 0) >= thr) edgeInk++; };
  for (let x = 0; x < w; x++) { test(x, 0); test(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { test(0, y); test(w - 1, y); }
  const border = edgeInk / edge;
  if (border > MOTIF_BORDER_MAX) return { ok: false, reason: `ink touches the image border (${(border * 100).toFixed(1)} % of the border)`, coverage, border };
  if (coverage < MOTIF_COVERAGE_MIN) return { ok: false, reason: `ink covers only ${(coverage * 100).toFixed(1)} % (min ${MOTIF_COVERAGE_MIN * 100} %)`, coverage, border };
  if (coverage > MOTIF_COVERAGE_MAX) return { ok: false, reason: `ink covers ${(coverage * 100).toFixed(1)} % (max ${MOTIF_COVERAGE_MAX * 100} %)`, coverage, border };
  return { ok: true, reason: '', coverage, border };
}

/**
 * Crops the mask to the ink box and pads it to a square with MOTIF_MARGIN on each side; returns { side, data }
 * (data is side * side, 0 = paper) with the motif centred.
 */
export function squareMotif(mask, w, box, margin = MOTIF_MARGIN) {
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const inner = Math.max(bw, bh);
  const side = Math.max(1, Math.round(inner * (1 + margin * 2)));
  const data = new Uint8Array(side * side);
  const ox = Math.floor((side - bw) / 2), oy = Math.floor((side - bh) / 2);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) data[(y + oy) * side + x + ox] = mask[(box.y0 + y) * w + box.x0 + x] ?? 0;
  }
  return { side, data };
}
