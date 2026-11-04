// Family-specific painters of surface group 'walls-e' (M10 surfaces): wood panelling and ceramic wall tiles.
//
//   wall-wood-lay     boards cut from a tinted wood grain map: planks, tongue and groove, herringbone, chevron, basketweave,
//                     fluted reeds, book-matched veneer panels, bamboo poles. Palette [base, light, dark, trim, upper].
//   wall-panel-frame  painted panelling: beadboard (with a peg rail), picture-frame, raised and flat panels, Georgian
//                     two-tier wainscot, Tudor half-timbering, trellis lattice, cane webbing. Palette [upper, panel, groove, rail].
//   wall-tile-lay     tiles from polygon layouts (brick bonds, herringbone, chevron, basketweave, diamonds, hexagons, pickets,
//                     scales, pebbles, triangles, cubes, modular, octagon and dot, arches) with an optional glaze/stone map per
//                     tile, finishes, hand-painted motifs, ombre, a listello band and a tiled dado. Palette [tile, alt, grout, ink, upper].
//
// Joints, grout and boards are always drawn here, never baked into a generated source. Without an image (tests, first
// paint) every painter draws flat tiles/boards of the same layout, so geometry never depends on loading.

import type { Rng } from '../../../core/rng';
import { rollerTexture } from '../wallPatterns';
import { MAP_IDS, MOTIF_IDS, drawMapRect, surfaceMapImage } from '../mapKit';
import {
  SEED_PARAM, SKIRT_PARAM, col, drawWrapped, fitCount, fromFloor, hair, mix, num, polygonPath, rgba, rngFor, shade, skirting, softBlob,
  speckle, str, wrappedKey, type Canvas2DLike, type PaintSpec, type PainterDef, type ParamSpec,
} from '../painterKit';

type P = [number, number];
const SQ2 = Math.SQRT2, SQ3 = Math.sqrt(3), TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const MAP_OR_NONE: ParamSpec = { type: 'enum', values: ['', ...MAP_IDS], default: '', doc: 'Material map (wood grain, glaze, stone) tinted by the palette; empty = flat colour.' };

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

interface Cell { pts: P[]; kind: number; face: number; ang: number }

const cellOf = (pts: P[], kind = 0, face = 0, ang = 0): Cell => ({ pts, kind, face, ang });

function centroid(pts: readonly P[]): P {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}

function bounds(pts: readonly P[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

/** Shortest distance from the centroid to an edge (the inradius of a convex polygon around its centre). */
function inradius(pts: readonly P[], c: P): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    best = Math.min(best, Math.abs(((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / len));
  }
  return Number.isFinite(best) ? best : 0.01;
}

/** Offsets every edge of a convex polygon inward by d (a grout joint of 2d), then jitters and rotates by `wobble` (hand-made). */
function shrink(pts: readonly P[], d: number, rng: Rng | null, wob: number): P[] {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i]!, b = pts[(i + 1) % n]!; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area >= 0 ? 1 : -1;
  const c = centroid(pts);
  const r = inradius(pts, c);
  const dd = Math.min(d, r * 0.45);
  // offset line of edge i: point + normal * dd, direction e
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n]!;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const ex = (q[0] - p[0]) / len, ey = (q[1] - p[1]) / len;
    const nx = -ey * sg, ny = ex * sg;
    return { px: p[0] + nx * dd, py: p[1] + ny * dd, ex, ey, nx, ny };
  });
  let out: P[] = pts.map((p, i) => {
    const l0 = lines[(i + n - 1) % n]!, l1 = lines[i]!;
    const cross = l0.ex * l1.ey - l0.ey * l1.ex;
    if (Math.abs(cross) < 1e-6) return [p[0] + l1.nx * dd, p[1] + l1.ny * dd] as P;
    const t = ((l1.px - l0.px) * l1.ey - (l1.py - l0.py) * l1.ex) / cross;
    return [l0.px + l0.ex * t, l0.py + l0.ey * t] as P;
  });
  if (rng && wob > 0) {
    const rot = (rng.next() - 0.5) * 0.06 * wob;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    out = out.map(([x, y]) => {
      const dx = x - c[0] + (rng.next() - 0.5) * r * 0.1 * wob, dy = y - c[1] + (rng.next() - 0.5) * r * 0.1 * wob;
      return [c[0] + dx * cs - dy * sn, c[1] + dx * sn + dy * cs] as P;
    });
  }
  return out;
}

function polyPath(ctx: Canvas2DLike, pts: readonly P[]): void {
  ctx.beginPath();
  polygonPath(ctx, pts);
}

/** Moves cells so every centroid lies in [0, w) and drops duplicates of the same wrapped cell (lattice walks list both). */
function canon(cells: Cell[], w: number): Cell[] {
  const seen = new Set<string>();
  const out: Cell[] = [];
  for (const cell of cells) {
    const c = centroid(cell.pts);
    let wx = ((c[0] % w) + w) % w;
    if (wx > w - 1e-6) wx = 0;
    const key = `${Math.round(wx * 1e4)},${Math.round(c[1] * 1e4)},${cell.kind},${cell.face}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const dx = wx - c[0];
    out.push(Math.abs(dx) < 1e-9 ? cell : { ...cell, pts: cell.pts.map(([x, y]) => [x + dx, y] as P) });
  }
  return out;
}

const rect = (x: number, y: number, w: number, h: number): P[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

function circlePts(cx: number, cy: number, rx: number, ry: number, rot: number, n = 18): P[] {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([cx + x * cs - y * sn, cy + x * sn + y * cs]);
  }
  return out;
}

/**
 * Herringbone of rectangles a x (k a) at 45 degrees. Cell lattice in plank units: horizontal planks H(t, s) cover x in
 * [t + 2ks, t + 2ks + k), row t; vertical planks cover column t + k + 2ks, rows t - k + 1 .. t. Rotated by 45 degrees
 * the wall period is k a sqrt(2), so the caller fits whole periods.
 */
function herringbone(w: number, top: number, h: number, a: number, k: number): Cell[] {
  const out: Cell[] = [];
  const f = a / SQ2;
  const tr = (U: number, V: number): P => [(U - V) * f, (U + V) * f];
  const umax = (w + h) / (SQ2 * a) + k + 2, vmin = -w / (SQ2 * a) - k - 2, vmax = h / (SQ2 * a) + k + 2;
  for (let t = Math.floor(vmin); t <= vmax; t++) {
    const s0 = Math.floor((-k - 2 - t) / (2 * k)), s1 = Math.ceil((umax - t) / (2 * k));
    for (let s = s0; s <= s1; s++) {
      const u0 = t + 2 * k * s;
      const H = [tr(u0, t), tr(u0 + k, t), tr(u0 + k, t + 1), tr(u0, t + 1)];
      const V = [tr(u0 + k, t - k + 1), tr(u0 + k + 1, t - k + 1), tr(u0 + k + 1, t + 1), tr(u0 + k, t + 1)];
      out.push(cellOf(H, 0, 0, Math.PI / 4), cellOf(V, 0, 1, -Math.PI / 4));
    }
  }
  const keep = out.filter((c) => { const b = bounds(c.pts); return b[3] > top - a && b[1] < h; });
  return keep;
}

/** Chevron: arms with horizontal run A (an even count fits w), stripes of vertical pitch d, mitred on the ridges. */
function chevron(w: number, top: number, h: number, A: number, d: number): Cell[] {
  const n = Math.max(2, 2 * Math.round(w / (2 * A)));
  const run = w / n;
  const out: Cell[] = [];
  for (let j = -1; h - j * d + run > top - d; j++) {
    const yb = h - j * d - run;
    for (let k = 0; k < n; k++) {
      const x0 = k * run, x1 = x0 + run;
      const y0 = yb + run * (k % 2), y1 = yb + run * ((k + 1) % 2);
      out.push(cellOf([[x0, y0], [x1, y1], [x1, y1 + d], [x0, y0 + d]], 0, k % 2, (k % 2 === 0 ? -1 : 1) * Math.PI / 4));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Drawing helpers shared by the wood and tile painters
// ---------------------------------------------------------------------------------------------

/** Light on top and left edges, shadow on the others (a chamfer or bevel), drawn as strokes along each edge. */
function bevelEdges(ctx: Canvas2DLike, s: PaintSpec, pts: readonly P[], width: number, alpha: number): void {
  const c = centroid(pts);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    let nx = dy / len, ny = -dx / len;
    if ((((a[0] + b[0]) / 2) - c[0]) * nx + (((a[1] + b[1]) / 2) - c[1]) * ny < 0) { nx = -nx; ny = -ny; }
    const lit = nx * -0.55 + ny * -0.83;
    if (Math.abs(lit) < 0.08) continue;
    ctx.strokeStyle = lit > 0 ? rgba('#ffffff', alpha * lit) : rgba('#000000', alpha * -lit * 0.8);
    ctx.lineWidth = Math.max(width, 0.7 / s.ppm);
    const o = width / 2;
    ctx.beginPath();
    ctx.moveTo(a[0] - nx * o, a[1] - ny * o);
    ctx.lineTo(b[0] - nx * o, b[1] - ny * o);
    ctx.stroke();
  }
}

/**
 * Fills a polygon with the map (rotated by `ang`, seeded phase) clipped to the polygon, or flat `base` without it.
 * `tileM` is the metres one map tile covers. Leaves the clip off (save/restore inside).
 */
function fillPolyMap(
  ctx: Canvas2DLike, s: PaintSpec, pts: readonly P[], img: unknown, base: string, ang: number, rng: Rng, tileM: number,
  flipX = false, alpha = 1,
): boolean {
  const c = centroid(pts);
  let r = 0;
  for (const p of pts) r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1]));
  r += 0.004;
  ctx.save();
  polyPath(ctx, pts);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(c[0] - r, c[1] - r, r * 2, r * 2);
  let drawn = false;
  if (img && ctx.drawImage) {
    ctx.save();
    ctx.translate(c[0], c[1]);
    ctx.rotate(ang);
    if (flipX) ctx.scale(-1, 1);
    ctx.globalAlpha = alpha;
    drawn = drawMapRect(ctx, img, -r, -r, r * 2, r * 2, tileM, -rng.next() * tileM, -rng.next() * tileM, s.ppm);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  ctx.restore();
  return drawn;
}

/** The fallback for a missing wood map: a few fine grain lines along `ang`. */
function grainLines(ctx: Canvas2DLike, s: PaintSpec, pts: readonly P[], ang: number, rng: Rng, dark: string): void {
  const c = centroid(pts);
  let r = 0;
  for (const p of pts) r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1]));
  ctx.save();
  polyPath(ctx, pts);
  ctx.clip();
  ctx.translate(c[0], c[1]);
  ctx.rotate(ang);
  ctx.strokeStyle = rgba(dark, 0.22);
  ctx.lineWidth = hair(s, 0.0012);
  const n = Math.max(3, Math.round(r * 30));
  for (let i = 0; i < n; i++) {
    const y = (rng.next() * 2 - 1) * r;
    ctx.beginPath();
    ctx.moveTo(-r, y);
    ctx.quadraticCurveTo(0, y + (rng.next() - 0.5) * r * 0.2, r, y + (rng.next() - 0.5) * r * 0.1);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// wall-wood-lay
// ---------------------------------------------------------------------------------------------

const WOOD_STYLES = ['planks', 'tg-v', 'tg-h', 'herringbone', 'chevron', 'basket', 'fluted', 'bookmatch', 'bamboo'] as const;

const woodLay: PainterDef = {
  id: 'wall-wood-lay',
  surface: 'wall',
  description: 'Wood panelling cut from a tinted grain map: random-width planks, tongue and groove (vertical or horizontal), herringbone, chevron, basketweave slats, fluted reeds, book-matched veneer panels and bamboo poles, with an optional cap rail and painted wall above.',
  colors: ['base', 'light', 'dark', 'trim', 'upper'],
  params: {
    seed: SEED_PARAM,
    skirt: { ...SKIRT_PARAM, default: 0.1 } as ParamSpec,
    style: { type: 'enum', values: WOOD_STYLES, default: 'planks', doc: 'Construction.' },
    map: MAP_OR_NONE,
    grain: { type: 'number', min: 0.2, max: 2.4, default: 0.8, doc: 'Metres covered by one grain-map tile.' },
    unit: { type: 'number', min: 0.03, max: 0.8, default: 0.14, doc: 'Board width, reed pitch, arm run (chevron, herringbone: plank width), slat cell or panel width (m).' },
    cell: { type: 'number', min: 0.2, max: 2.8, default: 1.2, doc: 'Panel height (bookmatch) or reed/slat length factor; ignored by other styles.' },
    length: { type: 'number', min: 2, max: 8, default: 4, integer: true, doc: 'Herringbone plank length in widths; basket: slats per square (2-4).' },
    height: { type: 'number', min: 0.6, max: 2.8, default: 2.8, doc: 'Top of the panelling above the floor (m); 2.8 = full height.' },
    gap: { type: 'number', min: 0.0005, max: 0.012, default: 0.003, doc: 'Joint width (m).' },
    variation: { type: 'number', min: 0, max: 1, default: 0.5, doc: 'Board-to-board tone variation.' },
    varWidth: { type: 'number', min: 0, max: 0.8, default: 0, doc: 'Planks: random variation of the board width.' },
    minLen: { type: 'number', min: 0.3, max: 2, default: 0.7, doc: 'Planks: shortest board (m).' },
    maxLen: { type: 'number', min: 0.5, max: 3, default: 1.6, doc: 'Planks: longest board (m).' },
    cap: { type: 'number', min: 0, max: 0.12, default: 0.05, doc: 'Cap rail height when the panelling stops below the ceiling (m).' },
    paint: { type: 'number', min: 0, max: 0.9, default: 0, doc: 'Paint over the grain: opacity of the flat base colour laid over the map (painted boards show a hint of grain).' },
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    const base = col(s, 0), light = col(s, 1), dark = col(s, 2), trim = col(s, 3), upper = col(s, 4);
    const style = str(s, 'style');
    const height = num(s, 'height');
    const full = height >= s.h - 0.01;
    const top = full ? 0 : fromFloor(s, height);
    const g = hair(s, num(s, 'gap'));
    const variation = num(s, 'variation');
    const mapId = str(s, 'map');
    const img = mapId ? surfaceMapImage(mapId, [base, light, dark]) : null;
    const rowSeed = (...k: number[]) => rngFor(s.seed, 700, ...k);
    // seamless map across a full-width board: the grain tile must divide the repeat
    const grainM = num(s, 'grain');
    const seamM = s.w / Math.max(1, Math.round(s.w / grainM));
    const u = num(s, 'unit');

    ctx.fillStyle = upper;
    ctx.fillRect(0, 0, s.w, s.h);
    if (!full) rollerTexture(ctx, s, upper, 0.4, rngFor(s.seed, 1), { y: 0, h: top });
    ctx.fillStyle = dark;
    ctx.fillRect(0, top, s.w, s.h - top);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, s.w, s.h - top);
    ctx.clip();

    /** One board: wood fill, tone, joint outline and chamfer light. */
    const paintOver = num(s, 'paint');
    const board = (pts: P[], ang: number, key: number, o: { tileM?: number; flip?: boolean; bevel?: number; wrap?: boolean } = {}) => {
      const rng = rowSeed(key);
      const b = bounds(pts);
      const paintBoard = () => {
        const inner = shrink(pts, g / 2, null, 0);
        const drawn = fillPolyMap(ctx, s, inner, img, base, ang, rng, o.tileM ?? grainM, o.flip, 1 - paintOver);
        if (!drawn) grainLines(ctx, s, inner, ang, rng, dark);
        const t = (rng.next() - 0.5) * variation;
        ctx.fillStyle = rgba(t > 0 ? light : dark, Math.abs(t) * 0.45);
        polyPath(ctx, inner);
        ctx.fill();
        bevelEdges(ctx, s, inner, hair(s, 0.0025), o.bevel ?? 0.28);
      };
      if (o.wrap === false) paintBoard();
      else drawWrapped(ctx, s, b[0] - g, b[1] - g, b[2] + g, b[3] + g, paintBoard);
    };
    const cellKey = (pts: P[]) => { const c = centroid(pts); return wrappedKey(s, c[0], c[1]); };

    if (style === 'planks') {
      // rows of boards, staggered end joints, optionally of different widths, counted up from the floor
      const span = s.h - top;
      const heights: number[] = [];
      const hr = rngFor(s.seed, 5);
      let acc = 0;
      while (acc < span - 1e-6) {
        const bh = Math.min(u * (1 + (hr.next() * 2 - 1) * num(s, 'varWidth')), span - acc + u * 0.5);
        heights.push(bh);
        acc += bh;
      }
      let y = s.h;
      heights.forEach((bh, r) => {
        const rng = rngFor(s.seed, 300, r);
        const minLen = num(s, 'minLen'), maxLen = Math.max(num(s, 'maxLen'), minLen);
        const lens: number[] = [];
        let rest = s.w;
        while (rest > 1e-9) {
          let len = minLen + rng.next() * (maxLen - minLen);
          if (rest - len < minLen * 0.6) len = rest;
          len = Math.min(len, rest);
          lens.push(len);
          rest -= len;
        }
        let x = rng.next() * s.w;
        lens.forEach((len, i) => {
          const x0 = x >= s.w ? x - s.w : x;
          board(rect(x0, y - bh, len, bh), 0, r * 97 + i * 13 + 1);
          x += len;
        });
        y -= bh;
      });
    } else if (style === 'tg-v') {
      const n = fitCount(s.w, u);
      const bw = s.w / n;
      for (let i = 0; i < n; i++) board(rect(i * bw, top - 0.01, bw, s.h - top + 0.02), Math.PI / 2, i * 31 + 7);
    } else if (style === 'tg-h') {
      const rows = fitCount(s.h - top, u);
      const bh = (s.h - top) / rows;
      for (let r = 0; r < rows; r++) board(rect(-0.1, s.h - (r + 1) * bh, s.w + 0.2, bh), 0, r * 31 + 3, { tileM: seamM, wrap: false });
    } else if (style === 'herringbone') {
      const k = Math.round(num(s, 'length'));
      const m = Math.max(1, Math.round(s.w / (k * u * SQ2)));
      const a = s.w / (m * k * SQ2);
      for (const c of canon(herringbone(s.w, top, s.h, a, k), s.w)) board(c.pts, c.ang, cellKey(c.pts) + c.face * 5);
    } else if (style === 'chevron') {
      for (const c of canon(chevron(s.w, top, s.h, u, u * SQ2), s.w)) board(c.pts, c.ang, cellKey(c.pts) + c.face * 5);
    } else if (style === 'basket') {
      const nSlat = clamp(Math.round(num(s, 'length')), 2, 4);
      const nx = Math.max(2, 2 * Math.round(s.w / (2 * u * nSlat)));
      const cs = s.w / nx;
      const rows = Math.ceil((s.h - top) / cs) + 1;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < nx; i++) {
          const x = i * cs, y = s.h - (j + 1) * cs;
          const horizontal = (i + j) % 2 === 0;
          for (let q = 0; q < nSlat; q++) {
            const sl = cs / nSlat;
            board(horizontal ? rect(x, y + q * sl, cs, sl) : rect(x + q * sl, y, sl, cs), horizontal ? 0 : Math.PI / 2, (j * nx + i) * 11 + q);
          }
        }
      }
    } else if (style === 'fluted') {
      const n = fitCount(s.w, u);
      const bw = s.w / n;
      const shades = [0.13, 0.16, 0.08, 0, -0.07, -0.13, -0.19, -0.26];
      for (let i = 0; i < n; i++) {
        const x = i * bw;
        board(rect(x, top - 0.01, bw, s.h - top + 0.02), Math.PI / 2, i * 17 + 5, { bevel: 0 });
        shades.forEach((v, q) => {
          ctx.fillStyle = rgba(v > 0 ? '#ffffff' : '#000000', Math.abs(v) * 1.1);
          ctx.fillRect(x + (q * bw) / shades.length, top, bw / shades.length + 0.4 / s.ppm, s.h - top);
        });
        ctx.fillStyle = rgba('#000000', 0.5);
        ctx.fillRect(x - g / 2, top, g, s.h - top);
        ctx.fillStyle = rgba('#ffffff', 0.12);
        ctx.fillRect(x + g / 2, top, hair(s, 0.0015), s.h - top);
      }
    } else if (style === 'bookmatch') {
      const nx = fitCount(s.w, u);
      const pw = s.w / nx;
      const rows = fitCount(s.h - top, num(s, 'cell'));
      const ph = (s.h - top) / rows;
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < nx; i++) {
          const x = i * pw, y = s.h - (r + 1) * ph;
          const key = (r * nx + i) * 19 + 2;
          const half = rect(x + g / 2, y + g / 2, pw / 2 - g / 2, ph - g);
          for (let side = 0; side < 2; side++) {
            ctx.save();
            if (side === 1) { ctx.translate(x + pw / 2, 0); ctx.scale(-1, 1); ctx.translate(-(x + pw / 2), 0); }
            const rng = rowSeed(key);
            const drawn = fillPolyMap(ctx, s, half, img, base, Math.PI / 2, rng, grainM);
            if (!drawn) grainLines(ctx, s, half, Math.PI / 2, rng, dark);
            ctx.restore();
          }
          const t = (rowSeed(key + 1).next() - 0.5) * variation;
          ctx.fillStyle = rgba(t > 0 ? light : dark, Math.abs(t) * 0.45);
          ctx.fillRect(x + g / 2, y + g / 2, pw - g, ph - g);
          ctx.fillStyle = rgba(dark, 0.3);
          ctx.fillRect(x + pw / 2 - hair(s, 0.0008) / 2, y + g, hair(s, 0.0008), ph - 2 * g);
          bevelEdges(ctx, s, rect(x + g / 2, y + g / 2, pw - g, ph - g), hair(s, 0.0025), 0.3);
        }
      }
    } else {
      // bamboo poles: round shading across each pole and node rings at random heights
      const n = fitCount(s.w, u);
      const bw = s.w / n;
      const shades = [-0.2, 0.0, 0.12, 0.18, 0.1, -0.05, -0.22];
      for (let i = 0; i < n; i++) {
        const x = i * bw + g / 2, pw = bw - g;
        const rng = rowSeed(i * 7 + 1);
        const tone = mix(base, rng.next() < 0.5 ? light : dark, rng.next() * 0.3 * variation);
        ctx.fillStyle = tone;
        ctx.fillRect(x, top, pw, s.h - top);
        shades.forEach((v, q) => {
          ctx.fillStyle = rgba(v > 0 ? '#ffffff' : '#000000', Math.abs(v));
          ctx.fillRect(x + (q * pw) / shades.length, top, pw / shades.length + 0.4 / s.ppm, s.h - top);
        });
        let y = s.h - 0.1 - rng.next() * 0.3;
        while (y > top) {
          ctx.fillStyle = rgba(dark, 0.5);
          ctx.fillRect(x, y, pw, hair(s, 0.012));
          ctx.fillStyle = rgba('#ffffff', 0.22);
          ctx.fillRect(x, y - hair(s, 0.004), pw, hair(s, 0.004));
          y -= 0.35 + rng.next() * 0.3;
        }
      }
    }
    ctx.restore();

    if (!full) {
      const cap = num(s, 'cap');
      if (cap > 0) {
        ctx.fillStyle = rgba('#000000', 0.16);
        ctx.fillRect(0, top, s.w, 0.012);
        ctx.fillStyle = trim;
        ctx.fillRect(0, top - cap, s.w, cap);
        ctx.fillStyle = shade(trim, 0.35);
        ctx.fillRect(0, top - cap, s.w, Math.min(0.008, cap * 0.2));
        ctx.fillStyle = shade(trim, -0.15);
        ctx.fillRect(0, top - hair(s, 0.004), s.w, hair(s, 0.004));
        ctx.fillStyle = rgba('#000000', 0.1);
        ctx.fillRect(0, top - cap - 0.01, s.w, 0.01);
      }
    }
    skirting(ctx, s, num(s, 'skirt'), trim);
  },
};

// ---------------------------------------------------------------------------------------------
// wall-panel-frame
// ---------------------------------------------------------------------------------------------

const FRAME_STYLES = ['bead', 'frame', 'raised', 'flat', 'georgian', 'tudor', 'lattice', 'cane'] as const;

/** An applied moulding rectangle: four mitred strips, light on top and left, shadow on bottom and right. */
function mouldedFrame(ctx: Canvas2DLike, s: PaintSpec, x: number, y: number, w: number, h: number, m: number, color: string): void {
  const light = shade(color, 0.28), dark = shade(color, -0.2);
  // soft drop shadow outside
  ctx.fillStyle = rgba('#000000', 0.12);
  ctx.fillRect(x + m * 0.3, y + h, w, m * 0.3);
  ctx.fillRect(x + w, y + m * 0.3, m * 0.3, h);
  const strip = (pts: P[], c: string) => { ctx.fillStyle = c; polyPath(ctx, pts); ctx.fill(); };
  strip([[x, y], [x + w, y], [x + w - m, y + m], [x + m, y + m]], light);
  strip([[x, y], [x + m, y + m], [x + m, y + h - m], [x, y + h]], shade(color, 0.12));
  strip([[x + w, y], [x + w, y + h], [x + w - m, y + h - m], [x + w - m, y + m]], dark);
  strip([[x, y + h], [x + m, y + h - m], [x + w - m, y + h - m], [x + w, y + h]], shade(color, -0.12));
  ctx.fillStyle = rgba('#000000', 0.18);
  ctx.fillRect(x + m, y + m, w - 2 * m, hair(s, 0.003));
}

/** A raised field: a flat centre with bevelled sides, lit from the top left. */
function raisedField(ctx: Canvas2DLike, s: PaintSpec, x: number, y: number, w: number, h: number, b: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  const strip = (pts: P[], c: string) => { ctx.fillStyle = c; polyPath(ctx, pts); ctx.fill(); };
  strip([[x, y], [x + w, y], [x + w - b, y + b], [x + b, y + b]], rgba('#000000', 0.2));
  strip([[x, y], [x + b, y + b], [x + b, y + h - b], [x, y + h]], rgba('#000000', 0.12));
  strip([[x + w, y], [x + w, y + h], [x + w - b, y + h - b], [x + w - b, y + b]], rgba('#ffffff', 0.2));
  strip([[x, y + h], [x + b, y + h - b], [x + w - b, y + h - b], [x + w, y + h]], rgba('#ffffff', 0.28));
  ctx.fillStyle = rgba('#000000', 0.22);
  ctx.fillRect(x - hair(s, 0.003), y - hair(s, 0.003), w + hair(s, 0.006), hair(s, 0.003));
  ctx.fillRect(x - hair(s, 0.003), y - hair(s, 0.003), hair(s, 0.003), h + hair(s, 0.006));
}

const panelFrame: PainterDef = {
  id: 'wall-panel-frame',
  surface: 'wall',
  description: 'Painted panelling built from mouldings: beadboard with an optional peg rail, applied picture frames, raised and flat modern panels, Georgian two-tier wainscot, Tudor half-timbering, trellis lattice and framed cane webbing.',
  colors: ['upper', 'panel', 'groove', 'rail'],
  params: {
    seed: SEED_PARAM,
    skirt: { ...SKIRT_PARAM, default: 0.12 } as ParamSpec,
    style: { type: 'enum', values: FRAME_STYLES, default: 'frame', doc: 'Construction.' },
    height: { type: 'number', min: 0.6, max: 2.8, default: 1.1, doc: 'Top of the panelling above the floor (m); 2.8 = full height. georgian: height of the lower tier.' },
    unit: { type: 'number', min: 0.03, max: 1.2, default: 0.4, doc: 'Bead board width, panel width, bay width (tudor) or lattice spacing (m).' },
    cell: { type: 'number', min: 0.05, max: 1.4, default: 0.6, doc: 'Panel height (frame, raised, flat, cane), lattice rise per diamond or cane cell size (m).' },
    mould: { type: 'number', min: 0.006, max: 0.09, default: 0.03, doc: 'Moulding or batten width (m).' },
    gap: { type: 'number', min: 0, max: 0.2, default: 0.06, doc: 'Gap between panels (m).' },
    pegs: { type: 'boolean', default: false, doc: 'Beadboard: a shelf at the top of the boards with pegs hanging below it.' },
    fill: { type: 'enum', values: ['panel', 'cane'], default: 'panel', doc: 'frame: what lies inside the frames.' },
  },
  thumbSpan: 1.4,
  paint(ctx, s) {
    const upper = col(s, 0), panel = col(s, 1), groove = col(s, 2), rail = col(s, 3);
    const style = str(s, 'style');
    const height = num(s, 'height');
    const full = height >= s.h - 0.01 || style === 'tudor' || style === 'lattice';
    const top = full ? 0 : fromFloor(s, height);
    const u = num(s, 'unit'), cellH = num(s, 'cell'), m = num(s, 'mould'), gap = num(s, 'gap');
    const rng = rngFor(s.seed, 2);
    const skirtH = num(s, 'skirt');

    ctx.fillStyle = upper;
    ctx.fillRect(0, 0, s.w, s.h);
    if (!full) rollerTexture(ctx, s, upper, 0.4, rngFor(s.seed, 1), { y: 0, h: top });

    /** Frames in a grid inside the vertical span [y0, y1]: columns fit the repeat, rows fit the span. */
    const frames = (y0: number, y1: number, rows: number, kind: 'frame' | 'raised' | 'flat' | 'cane', cols = fitCount(s.w, u)) => {
      const cw = s.w / cols, rh = (y1 - y0) / rows;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const x = i * cw + gap / 2 + cw * 0.25 * 0, y = y0 + j * rh + gap / 2;
          const w = cw - gap, h = rh - gap;
          drawWrapped(ctx, s, x - m, y - m, x + w + m, y + h + m, () => {
            if (kind === 'flat') {
              ctx.fillStyle = rgba('#000000', 0.2);
              ctx.fillRect(x - hair(s, 0.003), y - hair(s, 0.003), w + hair(s, 0.006), h + hair(s, 0.006));
              ctx.fillStyle = shade(panel, (rng.next() - 0.5) * 0.04);
              ctx.fillRect(x, y, w, h);
              ctx.fillStyle = rgba('#ffffff', 0.18);
              ctx.fillRect(x, y, w, hair(s, 0.003));
              ctx.fillStyle = rgba('#000000', 0.1);
              ctx.fillRect(x, y + h - hair(s, 0.003), w, hair(s, 0.003));
            } else if (kind === 'raised') {
              mouldedFrame(ctx, s, x, y, w, h, m * 0.55, panel);
              raisedField(ctx, s, x + m * 1.4, y + m * 1.4, w - m * 2.8, h - m * 2.8, Math.min(m * 1.2, w / 6), panel);
            } else if (kind === 'cane') {
              caneField(ctx, s, x + m, y + m, w - 2 * m, h - 2 * m, cellH > 0 ? Math.min(0.045, Math.max(0.025, m * 1.2)) : 0.04, groove, panel, rail);
              mouldedFrame(ctx, s, x, y, w, h, m, rail);
            } else {
              mouldedFrame(ctx, s, x, y, w, h, m, panel);
            }
          });
        }
      }
    };

    if (style === 'tudor') {
      // plaster bays between timber posts, rails and a few diagonal braces
      ctx.fillStyle = upper;
      ctx.fillRect(0, 0, s.w, s.h);
      rollerTexture(ctx, s, upper, 0.7, rngFor(s.seed, 1), { y: 0, h: s.h });
      const n = fitCount(s.w, u);
      const bay = s.w / n;
      const post = Math.max(m, 0.04);
      const railsAt = [0.18, 1.35, 2.65];
      const timber = (x0: number, y0: number, w: number, h: number, vertical: boolean) => {
        ctx.fillStyle = rgba('#000000', 0.2);
        ctx.fillRect(x0 + 0.006, y0 + 0.008, w, h);
        ctx.fillStyle = panel;
        ctx.fillRect(x0, y0, w, h);
        ctx.fillStyle = rgba('#ffffff', 0.14);
        if (vertical) ctx.fillRect(x0, y0, hair(s, 0.004), h); else ctx.fillRect(x0, y0, w, hair(s, 0.004));
        ctx.fillStyle = rgba('#000000', 0.25);
        if (vertical) ctx.fillRect(x0 + w - hair(s, 0.004), y0, hair(s, 0.004), h); else ctx.fillRect(x0, y0 + h - hair(s, 0.004), w, hair(s, 0.004));
        ctx.strokeStyle = rgba(groove, 0.5);
        ctx.lineWidth = hair(s, 0.0015);
        for (let q = 0; q < 6; q++) {
          const f = (q + 1) / 7;
          ctx.beginPath();
          if (vertical) { ctx.moveTo(x0 + w * f, y0); ctx.lineTo(x0 + w * f + (rng.next() - 0.5) * w * 0.2, y0 + h); }
          else { ctx.moveTo(x0, y0 + h * f); ctx.lineTo(x0 + w, y0 + h * f + (rng.next() - 0.5) * h * 0.2); }
          ctx.stroke();
        }
      };
      // diagonal braces first (they sit behind the posts)
      for (let i = 0; i < n; i++) {
        const brace = rngFor(s.seed, 900, i).next();
        if (brace < 0.5) continue;
        const flip = i % 2 === 0;
        const x0 = i * bay + post / 2, x1 = (i + 1) * bay - post / 2;
        const yA = fromFloor(s, railsAt[1]! - 0.05), yB = fromFloor(s, railsAt[0]! + 0.1);
        drawWrapped(ctx, s, x0 - post, yA - post, x1 + post, yB + post, () => {
          ctx.lineCap = 'butt';
          for (const [lw, c, dx, dy] of [[post * 0.9, rgba('#000000', 0.2), 0.006, 0.008], [post * 0.9, panel, 0, 0]] as const) {
            ctx.strokeStyle = c;
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.moveTo((flip ? x0 : x1) + dx, yA + dy);
            ctx.lineTo((flip ? x1 : x0) + dx, yB + dy);
            ctx.stroke();
          }
        });
      }
      for (const hRail of railsAt) {
        const y = fromFloor(s, hRail) - post / 2;
        timber(0, y, s.w, post, false);
      }
      for (let i = 0; i < n; i++) {
        const x = i * bay - post / 2;
        drawWrapped(ctx, s, x, 0, x + post, s.h, () => timber(x, 0, post, s.h, true));
      }
      skirting(ctx, s, skirtH, rail);
      return;
    }

    if (style === 'lattice') {
      ctx.fillStyle = panel;
      ctx.fillRect(0, 0, s.w, s.h);
      ctx.fillStyle = rgba(groove, 0.5);
      ctx.fillRect(0, 0, s.w, s.h);
      const n = fitCount(s.w, u);
      const P = s.w / n;
      const slope = Math.max(0.4, cellH / P); // a diamond is slope * P tall
      const runY = slope * P;
      const lw = Math.max(m, hair(s, 0.004));
      for (const dir of [1, -1]) {
        for (let i = -Math.ceil(s.h / runY) - 1; i <= n + Math.ceil(s.h / runY) + 1; i++) {
          const xs = i * P;
          for (const [wd, c, ox, oy] of [[lw, rgba('#000000', 0.28), 0.005, 0.007], [lw, rail, 0, 0], [lw * 0.25, shade(rail, 0.4), -lw * 0.2, 0]] as const) {
            ctx.strokeStyle = c;
            ctx.lineWidth = wd;
            ctx.beginPath();
            ctx.moveTo(xs + ox, 0 + oy);
            ctx.lineTo(xs + ox + dir * (s.h / slope), s.h + oy);
            ctx.stroke();
          }
        }
      }
      skirting(ctx, s, skirtH, rail);
      return;
    }

    if (style === 'bead' || style === 'frame' || style === 'raised' || style === 'flat' || style === 'georgian') {
      ctx.fillStyle = panel;
      ctx.fillRect(0, top, s.w, s.h - top);
    }

    if (style === 'bead') {
      const n = fitCount(s.w, u);
      const bw = s.w / n;
      for (let i = 0; i < n; i++) {
        const x = i * bw;
        const t = (rngFor(s.seed, 40, i).next() - 0.5) * 0.05;
        ctx.fillStyle = rgba(t > 0 ? '#ffffff' : '#000000', Math.abs(t));
        ctx.fillRect(x, top, bw, s.h - top);
        // tongue-and-groove joint with a bead: shadow, bead highlight, bead shade
        drawWrapped(ctx, s, x - 0.01, top, x + 0.02, s.h, () => {
          ctx.fillStyle = groove;
          ctx.fillRect(x - hair(s, 0.0015), top, hair(s, 0.003), s.h - top);
          ctx.fillStyle = rgba('#ffffff', 0.4);
          ctx.fillRect(x + hair(s, 0.0015), top, hair(s, 0.0035), s.h - top);
          ctx.fillStyle = rgba('#000000', 0.12);
          ctx.fillRect(x + hair(s, 0.0015) + hair(s, 0.0035), top, hair(s, 0.003), s.h - top);
          ctx.fillStyle = rgba('#000000', 0.1);
          ctx.fillRect(x - hair(s, 0.0015) - hair(s, 0.003), top, hair(s, 0.003), s.h - top);
        });
      }
    } else if (style === 'frame') {
      const rows = Math.max(1, Math.round((s.h - top - skirtH - 0.1) / Math.max(0.15, cellH)));
      const y0 = top + (full ? 0.12 : 0.1), y1 = s.h - skirtH - 0.04;
      frames(y0, y1, rows, str(s, 'fill') === 'cane' ? 'cane' : 'frame');
    } else if (style === 'raised' || style === 'flat') {
      const rows = Math.max(1, Math.round((s.h - top - skirtH - 0.1) / Math.max(0.15, cellH)));
      frames(top + 0.06, s.h - skirtH - 0.04, rows, style);
    } else if (style === 'georgian') {
      // lower tier to `height`, a chair rail, a tall upper tier and a crown band under the ceiling
      const dado = fromFloor(s, height);
      const crown = 0.1;
      frames(dado + 0.08, s.h - skirtH - 0.05, 1, 'raised');
      ctx.fillStyle = rgba('#000000', 0.18);
      ctx.fillRect(0, dado - 0.012, s.w, 0.02);
      ctx.fillStyle = rail;
      ctx.fillRect(0, dado - 0.03, s.w, 0.05);
      ctx.fillStyle = shade(rail, 0.4);
      ctx.fillRect(0, dado - 0.03, s.w, hair(s, 0.006));
      ctx.fillStyle = shade(rail, -0.18);
      ctx.fillRect(0, dado + 0.02 - hair(s, 0.005), s.w, hair(s, 0.005));
      frames(0.16 + crown, dado - 0.09, 1, 'raised');
      ctx.fillStyle = rail;
      ctx.fillRect(0, 0, s.w, crown);
      ctx.fillStyle = shade(rail, -0.2);
      ctx.fillRect(0, crown - hair(s, 0.008), s.w, hair(s, 0.008));
      ctx.fillStyle = shade(rail, 0.4);
      ctx.fillRect(0, 0, s.w, hair(s, 0.006));
    } else if (style === 'cane') {
      ctx.fillStyle = panel;
      ctx.fillRect(0, 0, s.w, s.h);
      const rows = Math.max(1, Math.round((s.h - skirtH - 0.1) / Math.max(0.3, cellH)));
      frames(0.06, s.h - skirtH - 0.04, rows, 'cane');
    }

    if (!full) {
      if (style === 'bead' && s.params.pegs === true) {
        // shelf on top of the boards with pegs hanging below it
        ctx.fillStyle = rgba('#000000', 0.16);
        ctx.fillRect(0, top + 0.02, s.w, 0.05);
        ctx.fillStyle = rail;
        ctx.fillRect(0, top - 0.02, s.w, 0.04);
        ctx.fillStyle = shade(rail, 0.35);
        ctx.fillRect(0, top - 0.02, s.w, hair(s, 0.005));
        ctx.fillStyle = rail;
        ctx.fillRect(0, top + 0.02, s.w, 0.07);
        ctx.fillStyle = shade(rail, -0.2);
        ctx.fillRect(0, top + 0.09 - hair(s, 0.004), s.w, hair(s, 0.004));
        const pn = fitCount(s.w, 0.2);
        for (let i = 0; i < pn; i++) {
          const x = (i + 0.5) * (s.w / pn), y = top + 0.14;
          ctx.fillStyle = rgba('#000000', 0.25);
          ctx.beginPath(); ctx.ellipse(x + 0.006, y + 0.012, 0.014, 0.05, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = shade(rail, -0.3);
          ctx.fillRect(x - 0.009, top + 0.09, 0.018, 0.07);
          ctx.fillStyle = shade(rail, -0.3);
          ctx.beginPath(); ctx.arc(x, y + 0.05, 0.022, 0, TAU); ctx.fill();
          ctx.fillStyle = shade(rail, -0.08);
          ctx.beginPath(); ctx.arc(x, y + 0.05, 0.017, 0, TAU); ctx.fill();
          ctx.fillStyle = rgba('#ffffff', 0.35);
          ctx.beginPath(); ctx.arc(x - 0.006, y + 0.043, 0.007, 0, TAU); ctx.fill();
        }
      } else if (style !== 'georgian') {
        ctx.fillStyle = rgba('#000000', 0.14);
        ctx.fillRect(0, top, s.w, 0.014);
        ctx.fillStyle = rail;
        ctx.fillRect(0, top - 0.05, s.w, 0.05);
        ctx.fillStyle = shade(rail, 0.35);
        ctx.fillRect(0, top - 0.05, s.w, hair(s, 0.007));
        ctx.fillStyle = shade(rail, -0.15);
        ctx.fillRect(0, top - hair(s, 0.004), s.w, hair(s, 0.004));
        ctx.fillStyle = rgba('#000000', 0.08);
        ctx.fillRect(0, top - 0.062, s.w, 0.012);
      }
    }
    skirting(ctx, s, skirtH, rail);
  },
};

/** Cane webbing inside a rectangle: dark openings, light vertical, horizontal and diagonal strands (octagonal weave). */
function caneField(ctx: Canvas2DLike, s: PaintSpec, x: number, y: number, w: number, h: number, p: number, hole: string, strand: string, strand2: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = hole;
  ctx.fillRect(x, y, w, h);
  const lw = Math.max(p * 0.2, 0.9 / s.ppm);
  ctx.lineWidth = lw;
  const nx = Math.ceil(w / p) + 1, ny = Math.ceil(h / p) + 1;
  ctx.strokeStyle = shade(strand, -0.05);
  for (let i = 0; i <= nx; i++) { ctx.beginPath(); ctx.moveTo(x + i * p, y); ctx.lineTo(x + i * p, y + h); ctx.stroke(); }
  ctx.strokeStyle = shade(strand, 0.08);
  for (let j = 0; j <= ny; j++) { ctx.beginPath(); ctx.moveTo(x, y + j * p); ctx.lineTo(x + w, y + j * p); ctx.stroke(); }
  ctx.strokeStyle = shade(strand2, 0.12);
  ctx.lineWidth = lw * 0.9;
  const dn = Math.ceil((w + h) / p) + 1;
  for (let i = -1; i <= dn; i++) {
    ctx.beginPath(); ctx.moveTo(x + i * p, y); ctx.lineTo(x + i * p - h, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + i * p - h, y); ctx.lineTo(x + i * p, y + h); ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// wall-tile-lay
// ---------------------------------------------------------------------------------------------

const TILE_LAYOUTS = [
  'grid', 'herringbone', 'chevron', 'basket', 'diamond', 'hex', 'picket', 'scales', 'pebble', 'triangle', 'cubes', 'mixed',
  'octagon', 'arch',
] as const;
type TileLayout = (typeof TILE_LAYOUTS)[number];

interface TileGeo { size: number; aspect: number; offset: number; vertical: boolean; slats: number; flip: boolean; alt: string; altRate: number }

/** Cells of one layout, wall space (y down, the floor at s.h), covering [top, s.h]. Wraps horizontally; canon() dedupes. */
function tileCells(layout: TileLayout, s: PaintSpec, top: number, o: TileGeo): Cell[] {
  const w = s.w, h = s.h;
  const out: Cell[] = [];
  const altOf = (i: number, j: number, rng: Rng) =>
    o.alt === 'rows' ? j % 2 : o.alt === 'checker' ? (i + j) % 2 : o.alt === 'scatter' ? (rng.next() < o.altRate ? 1 : 0) : 0;
  switch (layout) {
    case 'grid': {
      const tw = o.vertical ? o.size * o.aspect : o.size, th = o.vertical ? o.size : o.size / o.aspect;
      const steps = Math.max(1, Math.round(1 / Math.max(0.01, o.offset)));
      if (!o.vertical) {
        const nx = fitCount(w, tw), cw = w / nx;
        for (let j = 0; h - j * th > top - th; j++) {
          const sh = o.offset > 0 ? (j % steps) * o.offset * cw : 0;
          for (let i = 0; i < nx; i++) {
            const x = i * cw + sh;
            out.push(cellOf(rect(x, h - (j + 1) * th, cw, th), altOf(i, j, rngFor(s.seed, 61, i, j))));
          }
        }
      } else {
        const nx = fitCount(w, tw), cw = w / nx;
        for (let i = 0; i < nx; i++) {
          const sh = o.offset > 0 ? (i % steps) * o.offset * th : 0;
          for (let j = -1; h - j * th + sh > top - th; j++) {
            out.push(cellOf(rect(i * cw, h - (j + 1) * th + sh, cw, th), altOf(i, j, rngFor(s.seed, 61, i, j + 4))));
          }
        }
      }
      break;
    }
    case 'herringbone': {
      const k = Math.round(o.slats);
      const m = Math.max(1, Math.round(w / (k * o.size * SQ2)));
      return herringbone(w, top, h, w / (m * k * SQ2), k);
    }
    case 'chevron':
      return chevron(w, top, h, o.size * o.aspect, o.size * SQ2);
    case 'basket': {
      const n = Math.max(2, Math.round(o.slats));
      const nx = Math.max(2, 2 * Math.round(w / (2 * o.size * n)));
      const cs = w / nx;
      for (let j = 0; h - j * cs > top - cs; j++) {
        for (let i = 0; i < nx; i++) {
          const x = i * cs, y = h - (j + 1) * cs;
          const horiz = (i + j) % 2 === 0;
          for (let q = 0; q < n; q++) out.push(cellOf(horiz ? rect(x, y + (q * cs) / n, cs, cs / n) : rect(x + (q * cs) / n, y, cs / n, cs), horiz ? 0 : o.alt === 'none' ? 0 : 1));
        }
      }
      break;
    }
    case 'diamond': {
      const dw = o.size, dh = o.size / o.aspect;
      const nx = fitCount(w, dw), cw = w / nx;
      for (let j = -1; h - j * (dh / 2) > top - dh; j++) {
        for (let i = 0; i < nx; i++) {
          const cx = (i + (((j % 2) + 2) % 2) / 2) * cw, cy = h - j * (dh / 2);
          out.push(cellOf([[cx, cy - dh / 2], [cx + cw / 2, cy], [cx, cy + dh / 2], [cx - cw / 2, cy]], o.alt === 'rows' ? ((j % 2) + 2) % 2 : o.alt === 'checker' ? (i + Math.floor(j / 2)) % 2 : 0));
        }
      }
      break;
    }
    case 'hex':
    case 'picket':
    case 'cubes': {
      const nx = fitCount(w, o.size), W = w / nx;
      const R = (W / SQ3) * (layout === 'picket' ? o.aspect : 1);
      const vs: P[] = [[0, -R], [W / 2, -R / 2], [W / 2, R / 2], [0, R], [-W / 2, R / 2], [-W / 2, -R / 2]];
      for (let j = -1; h - j * 1.5 * R > top - 2 * R; j++) {
        for (let i = 0; i < nx; i++) {
          const cx = (i + 0.5 + (((j % 2) + 2) % 2) / 2) * W, cy = h - j * 1.5 * R;
          const at = (p: P): P => [cx + p[0], cy + p[1]];
          if (layout === 'cubes') {
            out.push(cellOf(([[0, 0], vs[5]!, vs[0]!, vs[1]!] as P[]).map(at), 0, 0), cellOf(([[0, 0], vs[5]!, vs[4]!, vs[3]!] as P[]).map(at), 0, 1), cellOf(([[0, 0], vs[3]!, vs[2]!, vs[1]!] as P[]).map(at), 0, 2));
          } else out.push(cellOf(vs.map(at), altOf(i, j, rngFor(s.seed, 62, i, j))));
        }
      }
      break;
    }
    case 'scales': {
      const nx = fitCount(w, o.size), W = w / nx, r = W / 2;
      const rows: Cell[][] = [];
      for (let j = -1; h - j * r * 0.9 > top - r * 2; j++) {
        const row: Cell[] = [];
        for (let i = 0; i < nx; i++) {
          const cx = (i + 0.5 + (((j % 2) + 2) % 2) / 2) * W, cy = h - j * r * 0.9 - r;
          row.push(cellOf(circlePts(cx, cy, r, r, 0, 20), altOf(i, j, rngFor(s.seed, 63, i, j))));
        }
        rows.push(row);
      }
      // arches up (scales): upper rows drawn first so lower rows overlap their lower halves; flip = scallops
      const order = o.flip ? rows : rows.slice().reverse();
      for (const r2 of order) out.push(...r2);
      break;
    }
    case 'pebble': {
      const nx = fitCount(w, o.size), W = w / nx;
      for (let j = -1; h - j * W * 0.86 > top - W; j++) {
        for (let i = 0; i < nx; i++) {
          const rng = rngFor(s.seed, 64, i, j + 3);
          const cx = (i + 0.5 + (((j % 2) + 2) % 2) / 2) * W + (rng.next() - 0.5) * W * 0.18;
          const cy = h - j * W * 0.86 + (rng.next() - 0.5) * W * 0.18;
          out.push(cellOf(circlePts(cx, cy, W * (0.4 + rng.next() * 0.1), W * (0.3 + rng.next() * 0.12), rng.next() * Math.PI, 14), 0, Math.floor(rng.next() * 3)));
        }
      }
      break;
    }
    case 'triangle': {
      const nx = fitCount(w, o.size), sw = w / nx, ht = (sw * SQ3) / 2;
      for (let j = -1; h - j * ht > top - ht; j++) {
        const off = (((j % 2) + 2) % 2) * (sw / 2), y1 = h - j * ht, y0 = y1 - ht;
        for (let k = -1; k < nx; k++) {
          const x = off + k * sw;
          out.push(cellOf([[x + sw / 2, y0], [x + sw, y1], [x, y1]], 0, Math.floor(rngFor(s.seed, 65, k + 2, j + 3).next() * 3)));
          out.push(cellOf([[x + sw / 2, y0], [x + sw * 1.5, y0], [x + sw, y1]], 0, Math.floor(rngFor(s.seed, 66, k + 2, j + 3).next() * 3)));
        }
      }
      break;
    }
    case 'mixed': {
      const nm = fitCount(w, o.size), mw = w / nm;
      let y = h, band = 0;
      while (y > top - mw) {
        const rng = rngFor(s.seed, 67, band);
        const bh = rng.next() < 0.35 ? 2 : 1;
        let x = 0, left = nm, idx = 0;
        while (left > 0) {
          let k = 1 + Math.floor(rng.next() * (bh === 2 ? 2 : 3));
          k = Math.min(k, left);
          out.push(cellOf(rect(x * mw, y - bh * mw, k * mw, bh * mw), (idx + band) % 2 === 0 || o.alt === 'none' ? 0 : 1));
          x += k; left -= k; idx++;
        }
        y -= bh * mw;
        band++;
      }
      break;
    }
    case 'octagon': {
      const nx = fitCount(w, o.size), W = w / nx;
      const R = W / (2 * Math.cos(Math.PI / 8)), rd = (W * SQ2) / (2 * (1 + SQ2)) * 1.0;
      for (let j = -1; h - j * W > top - W; j++) {
        for (let i = 0; i < nx; i++) {
          const cx = (i + 0.5) * W, cy = h - (j + 0.5) * W;
          out.push(cellOf(Array.from({ length: 8 }, (_, q) => [cx + R * Math.cos(Math.PI / 8 + (q * Math.PI) / 4), cy + R * Math.sin(Math.PI / 8 + (q * Math.PI) / 4)] as P), 0));
          const dx = cx + W / 2, dy = cy + W / 2;
          out.push(cellOf([[dx, dy - rd], [dx + rd, dy], [dx, dy + rd], [dx - rd, dy]], 1));
        }
      }
      break;
    }
    case 'arch': {
      const nx = fitCount(w, o.size), W = w / nx, H = W * o.aspect;
      for (let j = 0; h - j * H > top - H; j++) {
        for (let i = 0; i < nx; i++) {
          const x = i * W, y = h - (j + 1) * H;
          const pts: P[] = [[x, y + H]];
          for (let q = 0; q <= 14; q++) {
            const a = Math.PI + (q / 14) * Math.PI;
            pts.push([x + W / 2 + (Math.cos(a) * W) / 2, y + W / 2 + Math.sin(a) * (W / 2)]);
          }
          pts.push([x + W, y + H]);
          out.push(cellOf(pts, altOf(i, j, rngFor(s.seed, 68, i, j))));
        }
      }
      break;
    }
  }
  return out;
}

const FINISHES = ['flat', 'bevel', 'pillow', 'gloss', 'ribbed'] as const;
const MOTIF_RULES = ['all', 'checker', 'scatter', 'spin', 'quarter'] as const;

const tileLay: PainterDef = {
  id: 'wall-tile-lay',
  surface: 'wall',
  description: 'Wall tiles from polygon layouts (brick bonds, herringbone, chevron, basketweave, diamonds, hexagons, pickets, scales, pebbles, triangles, cubes, modular, octagon and dot, arches), each tile cut from a tinted glaze or stone map with its own tone, wobble and edge finish; optional hand-painted motifs, ombre, a listello band and a tiled dado with painted wall above.',
  colors: ['tile', 'alt', 'grout', 'ink', 'upper'],
  params: {
    seed: SEED_PARAM,
    layout: { type: 'enum', values: TILE_LAYOUTS, default: 'grid', doc: 'Tile arrangement.' },
    size: { type: 'number', min: 0.015, max: 1.2, default: 0.15, doc: 'Tile width (grid, hex, scales, octagon, arch, pebble, triangle side), plank width (herringbone, chevron) or module (mixed) in metres.' },
    aspect: { type: 'number', min: 0.2, max: 4, default: 2, doc: 'Grid: width to height (below 1 with vertical: height to width); diamond: width to height; chevron: arm run factor; picket: stretch; arch: height to width.' },
    offset: { type: 'number', min: 0, max: 0.5, default: 0.5, doc: 'Grid: row (or column) stagger as a share of the tile; 0 = stacked.' },
    vertical: { type: 'boolean', default: false, doc: 'Grid: tall tiles stacked in columns, staggered vertically.' },
    slats: { type: 'number', min: 2, max: 6, default: 3, integer: true, doc: 'Herringbone: tile length in widths; basket: tiles per square.' },
    flip: { type: 'boolean', default: false, doc: 'Scales: scallops (arcs down) instead of fish scales.' },
    alt: { type: 'enum', values: ['none', 'rows', 'checker', 'scatter'], default: 'none', doc: 'Which tiles take the second colour.' },
    altRate: { type: 'number', min: 0, max: 1, default: 0.15, doc: 'alt = scatter: share of second-colour tiles.' },
    map: MAP_OR_NONE,
    grain: { type: 'number', min: 0.1, max: 2.4, default: 0.5, doc: 'Metres covered by one map tile.' },
    glaze: { type: 'number', min: 0.1, max: 1, default: 0.7, doc: 'Strength of the glaze or stone map over the flat tile colour.' },
    grout: { type: 'number', min: 0.0005, max: 0.02, default: 0.003, doc: 'Grout joint width (m).' },
    variation: { type: 'number', min: 0, max: 1, default: 0.3, doc: 'Tile-to-tile tone variation.' },
    wobble: { type: 'number', min: 0, max: 1, default: 0, doc: 'Hand-made irregularity of tile edges and angles.' },
    finish: { type: 'enum', values: FINISHES, default: 'bevel', doc: 'Surface: flat, bevelled edge, soft pillow, gloss highlight or ribbed (fluted bars).' },
    motif: { type: 'enum', values: ['', ...MOTIF_IDS], default: '', doc: 'Hand-painted motif on the tiles (ink colour = palette ink).' },
    motifRule: { type: 'enum', values: MOTIF_RULES, default: 'all', doc: 'Which tiles carry the motif: all, checker, scatter (altRate), spin (all, turned by quarter turns at random), quarter (all, turned in a 2x2 sequence).' },
    motifSize: { type: 'number', min: 0.2, max: 1.2, default: 0.8, doc: 'Motif size as a share of the tile.' },
    height: { type: 'number', min: 0.4, max: 2.8, default: 2.8, doc: 'Top of the tiling above the floor (m); painted wall above.' },
    band: { type: 'number', min: 0, max: 2.6, default: 0, doc: 'Centre height of a listello band of second-colour tiles (m); 0 = none.' },
    bandH: { type: 'number', min: 0.03, max: 0.2, default: 0.07, doc: 'Listello band height (m).' },
    ombre: { type: 'number', min: 0, max: 1, default: 0, doc: 'Tile colour shifts from tile (floor) toward alt (top) by this much.' },
    bg: { type: 'enum', values: ['grout', 'alt'], default: 'grout', doc: 'What shows between the tiles: grout or the second colour.' },
  },
  thumbSpan: 0.9,
  paint(ctx, s) {
    const layout = (TILE_LAYOUTS as readonly string[]).includes(str(s, 'layout')) ? (str(s, 'layout') as TileLayout) : 'grid';
    const tileC = col(s, 0), altC = col(s, 1), groutC = col(s, 2), ink = col(s, 3), upper = col(s, 4);
    const height = num(s, 'height');
    const full = height >= s.h - 0.01;
    const top = full ? 0 : fromFloor(s, height);
    const g = hair(s, num(s, 'grout'));
    const variation = num(s, 'variation'), wobble = num(s, 'wobble'), ombre = num(s, 'ombre');
    const finish = str(s, 'finish');
    const geo: TileGeo = {
      size: num(s, 'size'), aspect: num(s, 'aspect'), offset: num(s, 'offset'), vertical: s.params.vertical === true,
      slats: Math.round(num(s, 'slats')), flip: s.params.flip === true, alt: str(s, 'alt'), altRate: num(s, 'altRate'),
    };
    const mapId = str(s, 'map');
    const tint = (c: string) => [c, shade(c, 0.24), shade(c, -0.3)];
    const imgFor = (c: string) => (mapId ? surfaceMapImage(mapId, tint(c)) : null);
    const imgA = imgFor(altC);
    const glaze = num(s, 'glaze');
    const motifId = str(s, 'motif');
    const motifImg = motifId ? surfaceMapImage(motifId, [ink], 'motif') : null;
    const motifRule = str(s, 'motifRule');
    const grainM = num(s, 'grain');

    ctx.fillStyle = upper;
    ctx.fillRect(0, 0, s.w, s.h);
    if (!full) rollerTexture(ctx, s, upper, 0.4, rngFor(s.seed, 1), { y: 0, h: top });
    ctx.fillStyle = str(s, 'bg') === 'alt' ? altC : groutC;
    ctx.fillRect(0, top, s.w, s.h - top);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, s.w, s.h - top);
    ctx.clip();

    const cells = canon(tileCells(layout, s, top, geo), s.w);
    const faceMix = [0.0, 0.5, 1.0];
    cells.forEach((cell) => {
      const c0 = centroid(cell.pts);
      const key = wrappedKey(s, c0[0], c0[1]);
      const rng = rngFor(s.seed, 800, key);
      const b0 = bounds(cell.pts);
      if (b0[3] < top - 0.02 || b0[1] > s.h + 0.02) return;
      // base colour: tile or alt, ombre toward the top, three-tone faces, per-tile tone
      let c = cell.kind === 1 ? altC : tileC;
      if (ombre > 0) c = mix(tileC, altC, Math.round(clamp(ombre * ((s.h - c0[1]) / s.h) + (rng.next() - 0.5) * 0.08, 0, 1) * 10) / 10);
      if (layout === 'triangle' || layout === 'pebble') c = mix(tileC, altC, faceMix[cell.face] ?? 0);
      if (layout === 'cubes') c = cell.face === 0 ? shade(tileC, 0.28) : cell.face === 1 ? tileC : shade(tileC, -0.3);
      const tone = (rng.next() - 0.5) * variation;
      const img = cell.kind === 1 ? imgA : imgFor(c);
      const inner = shrink(cell.pts, g / 2, wobble > 0 ? rng : null, wobble);
      drawWrapped(ctx, s, b0[0] - g, b0[1] - g, b0[2] + g, b0[3] + g, () => {
        ctx.fillStyle = rgba('#000000', 0.18);
        polyPath(ctx, inner.map(([x, y]) => [x + g * 0.4, y + g * 0.6] as P));
        ctx.fill();
        const quarter = Math.floor(rng.next() * 4) * (Math.PI / 2);
        fillPolyMap(ctx, s, inner, img, c, quarter, rng, grainM, false, glaze);
        ctx.save();
        polyPath(ctx, inner);
        ctx.clip();
        if (tone !== 0) {
          ctx.fillStyle = rgba(tone > 0 ? '#ffffff' : '#000000', Math.abs(tone) * 0.45);
          const [bx0, by0, bx1, by1] = bounds(inner);
          ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
        }
        const [bx0, by0, bx1, by1] = bounds(inner);
        if (finish === 'ribbed') {
          const bars = 6;
          for (let q = 0; q < bars; q++) {
            const v = [0.14, 0.1, 0.03, -0.05, -0.12, -0.2][q]!;
            ctx.fillStyle = rgba(v > 0 ? '#ffffff' : '#000000', Math.abs(v) * 1.2);
            ctx.fillRect(bx0 + (q * (bx1 - bx0)) / bars, by0, (bx1 - bx0) / bars + 0.4 / s.ppm, by1 - by0);
          }
        } else if (finish === 'pillow') {
          softBlob(ctx, (bx0 + bx1) / 2 - (bx1 - bx0) * 0.08, (by0 + by1) / 2 - (by1 - by0) * 0.08, (bx1 - bx0) * 0.42, (by1 - by0) * 0.42, 0, '#ffffff', 0.22, 6);
          ctx.strokeStyle = rgba('#000000', 0.2);
          ctx.lineWidth = Math.max((bx1 - bx0) * 0.07, 1 / s.ppm);
          polyPath(ctx, inner);
          ctx.stroke();
        } else if (finish === 'gloss') {
          softBlob(ctx, bx0 + (bx1 - bx0) * 0.3, by0 + (by1 - by0) * 0.28, (bx1 - bx0) * 0.38, (by1 - by0) * 0.16, -0.6, '#ffffff', 0.2, 4);
        }
        ctx.restore();
        if (layout === 'scales') {
          ctx.strokeStyle = rgba(groutC, 0.85);
          ctx.lineWidth = g * 1.2;
          polyPath(ctx, inner);
          ctx.stroke();
        }
        if (finish !== 'flat' && finish !== 'ribbed') bevelEdges(ctx, s, inner, hair(s, 0.0025), finish === 'pillow' ? 0.35 : 0.3);
        else if (finish === 'ribbed') bevelEdges(ctx, s, inner, hair(s, 0.002), 0.2);
        // hand-painted motif
        if (motifId && cell.kind === 0) {
          const cw = b0[2] - b0[0] || 1, ch = b0[3] - b0[1] || 1;
          const colI = Math.floor(c0[0] / cw), rowI = Math.round((s.h - c0[1]) / ch);
          const hit = motifRule === 'checker' ? (colI + rowI) % 2 === 0 : motifRule === 'scatter' ? rng.next() < geo.altRate : true;
          if (hit) {
            const rot = motifRule === 'spin' ? Math.floor(rng.next() * 4) * (Math.PI / 2) : motifRule === 'quarter' ? ((colI % 2) + 2 * (rowI % 2)) * (Math.PI / 2) : 0;
            const side = Math.min(b0[2] - b0[0], b0[3] - b0[1]) * num(s, 'motifSize');
            ctx.save();
            ctx.translate(c0[0], c0[1]);
            ctx.rotate(rot);
            if (motifImg && ctx.drawImage) ctx.drawImage(motifImg, -side / 2, -side / 2, side, side);
            else {
              ctx.fillStyle = rgba(ink, 0.8);
              ctx.beginPath(); ctx.moveTo(0, -side * 0.4); ctx.lineTo(side * 0.3, 0); ctx.lineTo(0, side * 0.4); ctx.lineTo(-side * 0.3, 0); ctx.closePath(); ctx.fill();
            }
            ctx.restore();
          }
        }
      });
    });

    // listello band: a row of small second-colour tiles across the field
    const band = num(s, 'band');
    if (band > 0) {
      const bh = num(s, 'bandH');
      const by = fromFloor(s, band) - bh / 2;
      ctx.fillStyle = groutC;
      ctx.fillRect(0, by - g, s.w, bh + 2 * g);
      const n = fitCount(s.w, bh * 1.4);
      const bw = s.w / n;
      for (let i = 0; i < n; i++) {
        const pts = rect(i * bw + g / 2, by, bw - g, bh);
        const rng = rngFor(s.seed, 850, i);
        fillPolyMap(ctx, s, pts, imgA, altC, 0, rng, grainM, false, glaze);
        ctx.fillStyle = rgba(rng.next() < 0.5 ? '#ffffff' : '#000000', 0.08);
        ctx.fillRect(i * bw, by, bw, bh);
        bevelEdges(ctx, s, pts, hair(s, 0.002), 0.3);
      }
    }
    ctx.restore();

    if (!full) {
      // bullnose edge: a rounded trim row with a shadow on the wall below... and a light lip on top
      const tn = Math.max(0.018, g * 4);
      ctx.fillStyle = rgba('#000000', 0.22);
      ctx.fillRect(0, top + tn, s.w, hair(s, 0.004));
      ctx.fillStyle = shade(tileC, 0.12);
      ctx.fillRect(0, top, s.w, tn);
      ctx.fillStyle = rgba('#ffffff', 0.4);
      ctx.fillRect(0, top, s.w, hair(s, 0.004));
      ctx.fillStyle = rgba('#000000', 0.18);
      ctx.fillRect(0, top + tn - hair(s, 0.004), s.w, hair(s, 0.004));
      ctx.fillStyle = rgba('#000000', 0.1);
      ctx.fillRect(0, top - 0.008, s.w, 0.008);
    }
    speckle(ctx, s, rngFor(s.seed, 9), 0.002, ['#000000'], 0.06, 1, { x: 0, y: 0, w: s.w, h: Math.max(0.001, top) });
  },
};

export const PAINTERS_WALLS_E: PainterDef[] = [woodLay, panelFrame, tileLay];
