// Shared toolkit for the procedural surface painters: a minimal Canvas2D-like interface (so painters
// stay pure and testable in Node with a fake context), painter/parameter types, colour helpers, seeded
// randomness and seamless-wrapping helpers.
//
// Painter coordinate space: metres. The caller scales the canvas so that (0, 0) is the top-left of the
// texture and (spec.w, spec.h) the bottom-right. For walls y = 0 is the TOP of the wall (2.8 m above the
// floor) and y = spec.h is the floor line; use `fromFloor()` to position structure in metres above the floor.
// No three.js and no DOM in this file.

import { Rng, seedRng } from '../../core/rng';

/** The subset of CanvasRenderingContext2D the painters use. A real 2D context satisfies it. */
export interface Canvas2DLike {
  fillStyle: string | object;
  strokeStyle: string | object;
  lineWidth: number;
  globalAlpha: number;
  lineCap: string;
  lineJoin: string;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(angle: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
  ellipse(
    x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number,
    counterclockwise?: boolean,
  ): void;
  rect(x: number, y: number, w: number, h: number): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  /** Only present on real canvases; map painters (mapPainters.ts) fall back to flat paint without it. */
  drawImage?(image: unknown, dx: number, dy: number, dw: number, dh: number): void;
}

export type ParamValue = number | string | boolean;

/** Declares one painter parameter: its type, valid range and default. */
export type ParamSpec =
  | { type: 'number'; min: number; max: number; default: number; integer?: boolean; doc: string }
  | { type: 'enum'; values: readonly string[]; default: string; doc: string }
  | { type: 'boolean'; default: boolean; doc: string };

/** Everything a painter needs to draw one texture repeat. */
export interface PaintSpec {
  /** Width and height of the painted area in metres (walls: repeat x 2.8; floors: repeat x repeat). */
  w: number;
  h: number;
  /** Floors tile in both directions; walls only horizontally. */
  wrapY: boolean;
  /** Palette colours ('#rrggbb'), in the painter's role order. */
  colors: readonly string[];
  /** Design params merged over the painter defaults. */
  params: Readonly<Record<string, ParamValue>>;
  /** Layout seed (from the design id and its `seed` param); independent of the palette. */
  seed: number;
  /** Texture pixels per metre, so hairlines can stay at least about one pixel wide. */
  ppm: number;
}

/** A procedural painter. `colors` names the palette roles; palettes need at least that many colours. */
export interface PainterDef {
  id: string;
  surface: 'wall' | 'floor';
  description: string;
  colors: readonly string[];
  params: Readonly<Record<string, ParamSpec>>;
  /** Metres shown across a catalog thumbnail (walls: measured up from the floor). */
  thumbSpan: number;
  paint(ctx: Canvas2DLike, spec: PaintSpec): void;
}

// ---------------------------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------------------------

/** Shared `seed` parameter every painter accepts (changes the layout, not the palette). */
export const SEED_PARAM: ParamSpec = { type: 'number', min: 0, max: 9999, default: 0, integer: true, doc: 'Layout seed offset.' };

/** Skirting board height in metres; 0 = none. */
export const SKIRT_PARAM: ParamSpec = { type: 'number', min: 0, max: 0.25, default: 0.1, doc: 'Skirting board height (m), 0 = none.' };

/** Merges design params over painter defaults. Unknown keys are kept (tests flag them). */
export function resolveParams(def: PainterDef, params: Readonly<Record<string, ParamValue>>): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const [k, spec] of Object.entries(def.params)) out[k] = spec.default;
  for (const [k, v] of Object.entries(params)) out[k] = v;
  return out;
}

/** Returns a list of problems with design params against a painter's specs (empty = valid). */
export function checkParams(def: PainterDef, params: Readonly<Record<string, ParamValue>>): string[] {
  const errors: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    const spec = def.params[k];
    if (!spec) { errors.push(`unknown param '${k}'`); continue; }
    if (spec.type === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`'${k}' must be a number`);
      else if (v < spec.min || v > spec.max) errors.push(`'${k}'=${v} outside ${spec.min}..${spec.max}`);
      else if (spec.integer && !Number.isInteger(v)) errors.push(`'${k}' must be an integer`);
    } else if (spec.type === 'enum') {
      if (typeof v !== 'string' || !spec.values.includes(v)) errors.push(`'${k}' must be one of ${spec.values.join('|')}`);
    } else if (typeof v !== 'boolean') errors.push(`'${k}' must be a boolean`);
  }
  return errors;
}

export function num(s: PaintSpec, key: string): number {
  const v = s.params[key];
  return typeof v === 'number' ? v : 0;
}
export function str(s: PaintSpec, key: string): string {
  const v = s.params[key];
  return typeof v === 'string' ? v : '';
}
export function flag(s: PaintSpec, key: string): boolean {
  return s.params[key] === true;
}
/** Palette colour by role index (falls back to the last colour, then mid grey). */
export function col(s: PaintSpec, i: number): string {
  return s.colors[i] ?? s.colors[s.colors.length - 1] ?? '#888888';
}

// ---------------------------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Linear blend of two hex colours (t = 0 -> a, 1 -> b). */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Lightens (amount > 0, toward white) or darkens (amount < 0, toward black). */
export function shade(hex: string, amount: number): string {
  return amount >= 0 ? mix(hex, '#ffffff', Math.min(1, amount)) : mix(hex, '#000000', Math.min(1, -amount));
}

/** CSS rgba() string for a hex colour. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

// ---------------------------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------------------------

/** FNV-1a 32-bit string hash. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Mixes integer keys into a seed (order matters). */
export function mixSeed(seed: number, ...keys: number[]): number {
  let h = seed >>> 0;
  for (const k of keys) {
    h ^= Math.imul((k | 0) + 0x9e3779b9, 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
  }
  return h >>> 0;
}

/** A fresh generator for (seed, keys...). Same inputs always give the same sequence. */
export function rngFor(seed: number, ...keys: number[]): Rng {
  return new Rng(seedRng(mixSeed(seed, ...keys)));
}

/** Stable key for a position wrapped into the repeat (so wrapped copies share colour variation). */
export function wrappedKey(s: PaintSpec, x: number, y: number): number {
  const wx = ((x % s.w) + s.w) % s.w;
  const wy = s.wrapY ? ((y % s.h) + s.h) % s.h : y;
  return mixSeed(Math.round(wx * 2000), Math.round(wy * 2000));
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------

/** Canvas y for a height above the floor (walls). */
export function fromFloor(s: PaintSpec, metresAboveFloor: number): number {
  return s.h - metresAboveFloor;
}

/** A line width in metres that is never thinner than `minPx` texture pixels. */
export function hair(s: PaintSpec, metres: number, minPx = 0.8): number {
  return Math.max(metres, minPx / s.ppm);
}

/** Number of whole repeats of `size` that fit `span` (at least `min`, rounded to a multiple of `multiple`). */
export function fitCount(span: number, size: number, min = 1, multiple = 1): number {
  const n = Math.round(span / size / multiple) * multiple;
  return Math.max(min, n);
}

/**
 * Draws an element and its periodic copies so the texture tiles seamlessly. The bounding box is in
 * metres; `draw` paints the element at its base position and is re-run under a translation for every
 * copy that overlaps the texture.
 */
export function drawWrapped(
  ctx: Canvas2DLike, s: PaintSpec, x0: number, y0: number, x1: number, y1: number, draw: () => void,
): void {
  const oxs = [-s.w, 0, s.w];
  const oys = s.wrapY ? [-s.h, 0, s.h] : [0];
  for (const oy of oys) {
    if (y1 + oy <= 0 || y0 + oy >= s.h) continue;
    for (const ox of oxs) {
      if (x1 + ox <= 0 || x0 + ox >= s.w) continue;
      if (ox === 0 && oy === 0) { draw(); continue; }
      ctx.save();
      ctx.translate(ox, oy);
      draw();
      ctx.restore();
    }
  }
}

export function roundRectPath(ctx: Canvas2DLike, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export function polygonPath(ctx: Canvas2DLike, pts: ReadonlyArray<readonly [number, number]>): void {
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

export function line(ctx: Canvas2DLike, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** A soft blob approximating a radial gradient with stacked translucent ellipses. */
export function softBlob(
  ctx: Canvas2DLike, x: number, y: number, rx: number, ry: number, rot: number, color: string, alpha: number, steps = 6,
): void {
  ctx.fillStyle = color;
  for (let i = 0; i < steps; i++) {
    const k = 1 - i / steps;
    ctx.globalAlpha = alpha / steps;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * k, ry * k, rot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * Fine grain: tiny squares at seeded positions inside the texture (never crossing an edge, so the
 * result stays seamless). `density` is dots per square texture pixel.
 */
export function speckle(
  ctx: Canvas2DLike, s: PaintSpec, rng: Rng, density: number, colors: readonly string[], alpha: number, sizePx = 1.2,
  area: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: s.w, h: s.h },
): void {
  if (density <= 0 || colors.length === 0) return;
  const size = sizePx / s.ppm;
  const count = Math.min(120000, Math.round(area.w * area.h * s.ppm * s.ppm * density));
  const per = Math.ceil(count / colors.length);
  ctx.globalAlpha = alpha;
  for (const c of colors) {
    ctx.fillStyle = c;
    for (let i = 0; i < per; i++) {
      const x = area.x + rng.next() * Math.max(0, area.w - size);
      const y = area.y + rng.next() * Math.max(0, area.h - size);
      ctx.fillRect(x, y, size, size);
    }
  }
  ctx.globalAlpha = 1;
}

/** A painted skirting board along the floor line with a moulded top edge and a soft cast shadow. */
export function skirting(ctx: Canvas2DLike, s: PaintSpec, height: number, trim: string): void {
  if (height <= 0) return;
  const top = fromFloor(s, height);
  // shadow on the wall just above the board
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(0, top - 0.008, s.w, 0.008);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(0, top - 0.016, s.w, 0.008);
  ctx.fillStyle = trim;
  ctx.fillRect(0, top, s.w, height);
  // moulding: rounded top lip, a groove, then the flat face
  ctx.fillStyle = shade(trim, 0.35);
  ctx.fillRect(0, top, s.w, Math.min(0.006, height * 0.2));
  ctx.fillStyle = shade(trim, -0.12);
  ctx.fillRect(0, top + Math.min(0.016, height * 0.3), s.w, hair(s, 0.003));
  ctx.fillStyle = shade(trim, 0.12);
  ctx.fillRect(0, top + Math.min(0.016, height * 0.3) + hair(s, 0.003), s.w, hair(s, 0.002));
  // floor contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, s.h - hair(s, 0.004), s.w, hair(s, 0.004));
}

/** Fills a tile with a bevel: light top/left edges and dark bottom/right edges. */
export function bevelRect(
  ctx: Canvas2DLike, x: number, y: number, w: number, h: number, fill: string, bevel: number, light: number, dark: number,
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (bevel <= 0) return;
  const b = Math.min(bevel, w / 3, h / 3);
  ctx.fillStyle = `rgba(255,255,255,${light.toFixed(3)})`;
  ctx.fillRect(x, y, w, b);
  ctx.fillStyle = `rgba(255,255,255,${(light * 0.6).toFixed(3)})`;
  ctx.fillRect(x, y + b, b, h - b);
  ctx.fillStyle = `rgba(0,0,0,${dark.toFixed(3)})`;
  ctx.fillRect(x, y + h - b, w, b);
  ctx.fillStyle = `rgba(0,0,0,${(dark * 0.7).toFixed(3)})`;
  ctx.fillRect(x + w - b, y, b, h - b);
}

/** Soft, low-contrast tonal clouds wrapped across the texture (used by plasters, concrete, carpet). */
export function clouds(
  ctx: Canvas2DLike, s: PaintSpec, rng: Rng, count: number, size: number, colors: readonly string[], alpha: number,
): void {
  for (let i = 0; i < count; i++) {
    const x = rng.next() * s.w;
    const y = rng.next() * s.h;
    const rx = size * (0.5 + rng.next());
    const ry = rx * (0.55 + rng.next() * 0.6);
    const rot = rng.next() * Math.PI;
    const c = colors[Math.floor(rng.next() * colors.length)] ?? '#808080';
    const a = alpha * (0.5 + rng.next() * 0.8);
    const r = Math.max(rx, ry);
    drawWrapped(ctx, s, x - r, y - r, x + r, y + r, () => softBlob(ctx, x, y, rx, ry, rot, c, a, 7));
  }
}
