// Family-specific painters of surface group 'floors-a' (M10 surfaces): wood boards, parquet and laminate/vinyl.
// All of them take a grain or print map (public/assets/surfaces) and draw the layout themselves: boards, blocks,
// joints, bevels, nails, caulking. Without the map (tests, first paint) every piece falls back to a flat tone with
// a few grain lines of the same geometry. Every layout is built from whole periods of the repeat and its random
// choices are keyed by the class of the piece inside the period, so textures tile seamlessly both ways.
//
//   board-floor   boards and plank-shaped tiles in rows: widths, bonds, bevels, caulk, nails, diagonal, paint
//   wood-parquet  block layouts: herringbone, chevron, basket, brick, pinwheel, hexagon, Versailles panels
//   rubber-relief  studded, coin, ribbed and speckled rubber or vinyl sheet in tiles

import type { Rng } from '../../../core/rng';
import { MAP_IDS, drawMapRect, surfaceMapImage } from '../mapKit';
import {
  SEED_PARAM, col, fitCount, flag, hair, mix, num, polygonPath, rgba, rngFor, shade, speckle, str,
  type Canvas2DLike, type PaintSpec, type PainterDef, type ParamSpec,
} from '../painterKit';

const SQRT2 = Math.SQRT2;
const SQRT3 = Math.sqrt(3);
const TAU = Math.PI * 2;

const MAP_PARAM: ParamSpec = { type: 'enum', values: MAP_IDS, default: MAP_IDS[0], doc: 'Grain or print map (public/assets/surfaces).' };

function tinted(s: PaintSpec): unknown {
  const id = s.params.map;
  return typeof id === 'string' ? surfaceMapImage(id, s.colors) : null;
}

type Pt = readonly [number, number];

/** Flat fallback piece in local space (grain along x): base tone and a few grain lines. */
function flatGrain(ctx: Canvas2DLike, s: PaintSpec, rng: Rng, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = col(s, 0);
  ctx.fillRect(x, y, w, h);
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = rgba(rng.next() < 0.5 ? col(s, 1) : col(s, 2), 0.25);
    ctx.fillRect(x, y + rng.next() * h, w, h * (0.04 + rng.next() * 0.1));
  }
}

/** Fills the local rectangle with the map at a random phase (grain along x), or the flat fallback. */
function mapRect(
  ctx: Canvas2DLike, s: PaintSpec, img: unknown, rng: Rng, x: number, y: number, w: number, h: number, tileM: number,
): void {
  const ox = x - rng.next() * tileM, oy = y - rng.next() * tileM;
  if (!drawMapRect(ctx, img, x, y, w, h, tileM, ox, oy, s.ppm)) flatGrain(ctx, s, rng, x, y, w, h);
}

/** Per-piece tone: a translucent light or dark wash over the tinted map, `bias` shifts it (alternating tones). */
function toneWash(s: PaintSpec, rng: Rng, variation: number, bias: number): string | null {
  const t = (rng.next() - 0.5) * variation + bias;
  if (Math.abs(t) < 0.004) return null;
  return rgba(t > 0 ? col(s, 1) : col(s, 2), Math.min(0.6, Math.abs(t) * 0.5));
}

// ---------------------------------------------------------------------------------------------
// board-floor
// ---------------------------------------------------------------------------------------------

type Bevel = 'square' | 'micro' | 'pillow' | 'vgroove';

function edges(ctx: Canvas2DLike, s: PaintSpec, x: number, y: number, w: number, h: number, kind: Bevel): void {
  if (kind === 'square') return;
  const e = hair(s, kind === 'micro' ? 0.0015 : 0.003);
  if (kind === 'vgroove') {
    ctx.fillStyle = rgba('#000000', 0.5);
    ctx.fillRect(x, y, w, e * 1.4);
    ctx.fillRect(x, y, e * 1.4, h);
    ctx.fillStyle = rgba('#ffffff', 0.16);
    ctx.fillRect(x, y + e * 1.4, w, e * 0.8);
    ctx.fillRect(x + e * 1.4, y, e * 0.8, h);
    return;
  }
  const a = kind === 'pillow' ? 0.2 : 0.14;
  ctx.fillStyle = rgba('#ffffff', a);
  ctx.fillRect(x, y, w, e);
  ctx.fillRect(x, y, e, h);
  ctx.fillStyle = rgba('#000000', a * 1.1);
  ctx.fillRect(x, y + h - e, w, e);
  ctx.fillRect(x + w - e, y, e, h);
  if (kind === 'pillow') {
    ctx.fillStyle = rgba('#000000', 0.07);
    ctx.fillRect(x + e, y + h - e * 2, w - e * 2, e);
    ctx.fillRect(x + w - e * 2, y + e, e, h - e * 2);
  }
}

/** Width ratios of the repeating row pattern. */
const WIDTH_PATTERNS: Record<string, readonly number[]> = {
  uniform: [1],
  mixed2: [0.75, 1.25],
  mixed3: [0.6, 1, 1.4],
  mixed4: [0.5, 1.3, 0.8, 1.4],
};

const boardFloor: PainterDef = {
  id: 'board-floor',
  surface: 'floor',
  description: 'Boards (or plank-shaped tiles) in rows cut from a tinted grain or print map: width patterns, running, third, ship and stack bonds, bevels, V-grooves, caulked or nailed joints, a diagonal lay and worn paint.',
  colors: ['base', 'light', 'dark', 'seam'],
  params: {
    seed: SEED_PARAM,
    map: MAP_PARAM,
    board: { type: 'number', min: 0.04, max: 0.7, default: 0.15, doc: 'Mean board width (m).' },
    widths: { type: 'enum', values: Object.keys(WIDTH_PATTERNS), default: 'uniform', doc: 'Row width pattern.' },
    minLen: { type: 'number', min: 0.2, max: 2.4, default: 0.8, doc: 'Shortest board (m).' },
    maxLen: { type: 'number', min: 0.2, max: 2.4, default: 1.8, doc: 'Longest board (m); equal to minLen = equal lengths.' },
    bond: { type: 'enum', values: ['random', 'half', 'third', 'ship', 'stack'], default: 'random', doc: 'How end joints line up from row to row.' },
    scale: { type: 'number', min: 0.2, max: 2.4, default: 0.6, doc: 'Metres covered by one map tile.' },
    gap: { type: 'number', min: 0.001, max: 0.02, default: 0.002, doc: 'Joint width (m).' },
    bevel: { type: 'enum', values: ['square', 'micro', 'pillow', 'vgroove'], default: 'micro', doc: 'Board edge.' },
    nails: { type: 'boolean', default: false, doc: 'Square cut nail heads near the board ends.' },
    diagonal: { type: 'boolean', default: false, doc: 'Lay the boards at 45 degrees.' },
    paint: { type: 'number', min: 0, max: 1, default: 0, doc: 'Painted finish: how much of the grain is covered (worn at the edges).' },
    inlay: { type: 'number', min: 0, max: 8, default: 0, integer: true, doc: 'A dark inlay line every N rows (N must divide the row count); 0 = none.' },
    variation: { type: 'number', min: 0, max: 1, default: 0.5, doc: 'Board-to-board tone variation.' },
  },
  thumbSpan: 1.4,
  paint(ctx, s) {
    const img = tinted(s);
    const diag = flag(s, 'diagonal');
    const period = diag ? s.w / SQRT2 : s.w; // length of the row pattern along the boards
    const across = diag ? s.w / SQRT2 : s.h; // rows must fill this distance exactly once per period
    const pattern = WIDTH_PATTERNS[str(s, 'widths')] ?? [1];
    const mean = pattern.reduce((a, b) => a + b, 0) / pattern.length;
    const cycles = Math.max(1, Math.round(across / (num(s, 'board') * mean * pattern.length)));
    const rowsN = cycles * pattern.length;
    const sum = pattern.reduce((a, b) => a + b, 0) * cycles;
    const heights: number[] = [];
    for (let r = 0; r < rowsN; r++) heights.push(((pattern[r % pattern.length] ?? 1) * across) / sum);
    const tops: number[] = [];
    heights.reduce((a, h) => { tops.push(a); return a + h; }, 0);

    const tileM = num(s, 'scale');
    const minLen = num(s, 'minLen'), maxLen = Math.max(num(s, 'maxLen'), minLen);
    const bond = str(s, 'bond');
    const bevel = str(s, 'bevel') as Bevel;
    const g = hair(s, num(s, 'gap'));
    const variation = num(s, 'variation');
    const paint = num(s, 'paint');
    const inlay = Math.round(num(s, 'inlay'));
    const nails = flag(s, 'nails');

    ctx.fillStyle = col(s, 3);
    ctx.fillRect(0, 0, s.w, s.h);
    ctx.save();
    // row classes: row r of the drawing is class r mod rowsN
    let rLo = 0, rHi = rowsN - 1, kLo = -1, kHi = 1;
    if (diag) {
      ctx.rotate(Math.PI / 4);
      rLo = -rowsN; rHi = rowsN - 1; kLo = -1; kHi = 2;
    }
    for (let r = rLo; r <= rHi; r++) {
      const cls = ((r % rowsN) + rowsN) % rowsN;
      const bw = heights[cls] ?? 0.15;
      const y = (diag ? Math.floor(r / rowsN) * across : 0) + (tops[cls] ?? 0);
      const rng = rngFor(s.seed, 300, cls);
      const lens: number[] = [];
      let offset = 0;
      if (bond === 'random') {
        let rest = period;
        while (rest > 1e-9) {
          let len = minLen + rng.next() * (maxLen - minLen);
          if (rest - len < minLen * 0.6) len = rest;
          len = Math.min(len, rest);
          lens.push(len);
          rest -= len;
        }
        offset = rng.next() * period;
      } else {
        const n = Math.max(1, Math.round(period / ((minLen + maxLen) / 2)));
        for (let i = 0; i < n; i++) lens.push(period / n);
        const len = period / n;
        const frac = bond === 'half' ? (cls % 2) / 2 : bond === 'third' ? (cls % 3) / 3 : bond === 'ship' ? ((cls * 3) % 7) / 7 : 0;
        offset = frac * len;
      }
      for (let k = kLo; k <= kHi; k++) {
        let x = offset + k * period;
        lens.forEach((len, i) => {
          const x0 = x;
          x += len;
          if (!diag && (x0 + len <= 0 || x0 >= s.w)) return;
          const prng = rngFor(s.seed, 400, cls, i);
          const px = x0 + g / 2, py = y + g / 2, pw = len - g, ph = bw - g;
          ctx.save();
          ctx.beginPath();
          ctx.rect(px, py, pw, ph);
          ctx.clip();
          ctx.translate(px, py);
          if (prng.next() < 0.5) { ctx.translate(0, ph); ctx.scale(1, -1); }
          mapRect(ctx, s, img, prng, 0, 0, pw, ph, tileM);
          ctx.restore();
          const wash = toneWash(s, prng, variation, 0);
          if (wash) { ctx.fillStyle = wash; ctx.fillRect(px, py, pw, ph); }
          if (paint > 0) {
            ctx.fillStyle = rgba(col(s, 0), 0.82 * paint);
            ctx.fillRect(px, py, pw, ph);
            speckle(ctx, s, prng, 0.25 * paint, [col(s, 1), col(s, 2)], 0.35, 1.3, { x: px, y: py, w: pw, h: ph });
            // worn through along the edges
            ctx.fillStyle = rgba(col(s, 2), 0.28 * paint);
            ctx.fillRect(px, py + ph - hair(s, 0.004), pw, hair(s, 0.004));
          }
          edges(ctx, s, px, py, pw, ph, bevel);
          if (nails) {
            const ns = Math.max(hair(s, 0.0035), 1.2 / s.ppm);
            ctx.fillStyle = rgba(col(s, 3), 0.85);
            for (const fy of [0.28, 0.72]) {
              ctx.fillRect(px + 0.025, py + ph * fy - ns / 2, ns, ns);
              ctx.fillRect(px + pw - 0.025 - ns, py + ph * fy - ns / 2, ns, ns);
            }
          }
        });
      }
      if (inlay > 0 && cls % inlay === 0) {
        const il = hair(s, 0.022);
        ctx.fillStyle = rgba(shade(col(s, 2), -0.55), 1);
        const y0 = y - il / 2;
        ctx.fillRect(diag ? -s.w * 2 : 0, y0, diag ? s.w * 4 : s.w, il);
        ctx.fillStyle = rgba(col(s, 1), 0.6);
        ctx.fillRect(diag ? -s.w * 2 : 0, y0 - hair(s, 0.0015), diag ? s.w * 4 : s.w, hair(s, 0.0015));
        ctx.fillRect(diag ? -s.w * 2 : 0, y0 + il, diag ? s.w * 4 : s.w, hair(s, 0.0015));
      }
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------------------------
// wood-parquet
// ---------------------------------------------------------------------------------------------

interface Piece { pts: Pt[]; angle: number; key: number; group: number }

/** Rectangle with its corner at (ox, oy), grain along `angle`, length len, width wid. */
function rectPts(ox: number, oy: number, angle: number, len: number, wid: number): Pt[] {
  const c = Math.cos(angle), sn = Math.sin(angle);
  const p = (u: number, v: number): Pt => [ox + u * c - v * sn, oy + u * sn + v * c];
  return [p(0, 0), p(len, 0), p(len, wid), p(0, wid)];
}

const LAYOUTS = ['herringbone', 'chevron', 'basket', 'brick', 'pinwheel', 'hexagon', 'versailles'] as const;

function parquetPieces(s: PaintSpec): Piece[] {
  const layout = str(s, 'layout');
  const block = num(s, 'block');
  const strips = Math.max(1, Math.round(num(s, 'strips')));
  const out: Piece[] = [];
  const W = s.w;
  if (layout === 'herringbone') {
    const k = Math.round(num(s, 'ratio'));
    const b = Math.max(1, Math.round(W / block));
    const w = W / (b * k * SQRT2), L = k * w;
    const toWorld = (u: number, v: number): Pt => [(u - v) / SQRT2, (u + v) / SQRT2];
    for (let m = -2; m <= b + 1; m++) {
      for (let i = -k - 3; i <= b * k + 3; i++) {
        const u0 = i * w + m * L, v0 = i * w - m * L;
        const defs = [
          { ou: u0, ov: v0, angle: Math.PI / 4, cu: u0 + L / 2, cv: v0 + w / 2 },
          { ou: u0 + w, ov: v0 + w, angle: (3 * Math.PI) / 4, cu: u0 + w / 2, cv: v0 + w + L / 2 },
        ];
        defs.forEach((d, q) => {
          const [cx, cy] = toWorld(d.cu, d.cv);
          const reach = (L + w) / 2;
          if (cx + reach < 0 || cx - reach > W || cy + reach < 0 || cy - reach > W) return;
          const [ox, oy] = toWorld(d.ou, d.ov);
          const ci = ((i % (b * k)) + b * k) % (b * k), cm = ((m % b) + b) % b;
          for (let t = 0; t < strips; t++) {
            const sw = w / strips;
            const c = Math.cos(d.angle), sn = Math.sin(d.angle);
            out.push({
              pts: rectPts(ox - sn * sw * t, oy + c * sw * t, d.angle, L, sw), angle: d.angle,
              key: ((ci * 17 + cm) * 2 + q) * 4 + t, group: (m + q) % 2,
            });
          }
        });
      }
    }
    return out;
  }
  if (layout === 'chevron') {
    const n = fitCount(W, block, 1);
    const bx = W / (2 * n);
    const t = Math.tan((num(s, 'angle') * Math.PI) / 180);
    const m = fitCount(s.h, num(s, 'board') / Math.cos(Math.atan(t)), 1);
    const vw = s.h / m;
    for (let k = -4; k < m + 4; k++) {
      for (let i = 0; i < n; i++) {
        const cx = (2 * i + 1) * bx, ya = (k + 1) * vw;
        for (const side of [-1, 1]) {
          const x1 = cx + side * bx;
          const rise = bx * t;
          const kc = ((k % m) + m) % m;
          for (let q = 0; q < strips; q++) {
            const a = q / strips, bq = (q + 1) / strips;
            const lo = ya - vw * (1 - a), hi = ya - vw * (1 - bq);
            out.push({
              pts: [[cx, lo], [x1, lo - rise], [x1, hi - rise], [cx, hi]], angle: Math.atan2(-rise, side * bx),
              key: ((i * 31 + kc) * 2 + (side + 1) / 2) * 4 + q, group: (side + 1) / 2,
            });
          }
        }
      }
    }
    return out;
  }
  if (layout === 'basket' || layout === 'brick') {
    const diag = flag(s, 'diagonal');
    if (layout === 'brick') {
      const cols = fitCount(W, block, 1);
      const L = W / cols;
      const rows = fitCount(s.h, num(s, 'board'), 2, 2);
      const bh = s.h / rows;
      for (let j = 0; j < rows; j++) {
        for (let i = -1; i <= cols; i++) {
          const ic = ((i % cols) + cols) % cols;
          out.push({ pts: rectPts(i * L + (j % 2 ? L / 2 : 0), j * bh, 0, L, bh), angle: 0, key: ic * 31 + j, group: (i + j) % 2 });
        }
      }
      return out;
    }
    // basket weave: squares of `strips` parallel boards, alternately turned a quarter
    const n = diag ? Math.max(1, Math.round(W / SQRT2 / block)) : fitCount(W, block, 2, 2);
    const S = diag ? W / SQRT2 / n : W / n;
    const turn = s.params.turn !== false;
    const range = diag ? [-1, 2 * n + 1] : [0, n - 1];
    const jr = diag ? [-n - 1, n + 1] : [0, n - 1];
    for (let j = jr[0] as number; j <= (jr[1] as number); j++) {
      for (let i = range[0] as number; i <= (range[1] as number); i++) {
        const horizontal = !turn || (((i + j) % 2) + 2) % 2 === 0;
        const base = diag ? ((((i - j) % (2 * n)) + 2 * n) % (2 * n)) * 97 + ((((i + j) % (2 * n)) + 2 * n) % (2 * n)) : (((i % n) + n) % n) * 97 + ((j % n) + n) % n;
        for (let q = 0; q < strips; q++) {
          const sw = S / strips;
          let ang = 0, ou = 0, ov = 0;
          if (horizontal) { ou = i * S; ov = j * S + q * sw; ang = 0; } else { ou = i * S + (q + 1) * sw; ov = j * S; ang = Math.PI / 2; }
          // (ou, ov) in the lattice frame; rotate the frame by 45 degrees for the diagonal lay
          const L = S, wd = sw;
          const c = Math.cos(ang), sn = Math.sin(ang);
          const loc = (u: number, v: number): Pt => [ou + u * c - v * sn, ov + u * sn + v * c];
          const corners = [loc(0, 0), loc(L, 0), loc(L, wd), loc(0, wd)];
          const pts = diag ? corners.map(([u, v]): Pt => [(u - v) / SQRT2, (u + v) / SQRT2]) : corners;
          out.push({ pts, angle: ang + (diag ? Math.PI / 4 : 0), key: base * 8 + q, group: (((i + j) % 2) + 2) % 2 });
        }
      }
    }
    return out;
  }
  if (layout === 'pinwheel') {
    const ratio = Math.max(1.5, num(s, 'ratio'));
    const n = fitCount(W, block, 1);
    const S = W / n;
    const w = S / (ratio + 1), L = ratio * w;
    for (let j = -1; j <= n; j++) {
      for (let i = -1; i <= n; i++) {
        const ox = i * S, oy = j * S;
        const ic = ((i % n) + n) % n, jc = ((j % n) + n) % n;
        const key = (ic * 31 + jc) * 8;
        out.push({ pts: rectPts(ox, oy, 0, L, w), angle: 0, key, group: 0 });
        out.push({ pts: rectPts(ox + L, oy, Math.PI / 2, L, w).map(([x, y]): Pt => [x + w, y]), angle: Math.PI / 2, key: key + 1, group: 1 });
        out.push({ pts: rectPts(ox + w, oy + L, 0, L, w), angle: 0, key: key + 2, group: 0 });
        out.push({ pts: rectPts(ox, oy + w, Math.PI / 2, L, w).map(([x, y]): Pt => [x + w, y]), angle: Math.PI / 2, key: key + 3, group: 1 });
        out.push({ pts: rectPts(ox + w, oy + w, 0, L - w, L - w), angle: ((ic + jc) % 2) * (Math.PI / 2), key: key + 4, group: 2 });
      }
    }
    return out;
  }
  if (layout === 'hexagon') {
    const nx = fitCount(W, block, 1);
    const sx = W / nx;
    const my = fitCount(s.h, block * 0.87, 2, 2);
    const vy = s.h / my;
    const rx = sx / SQRT3, ry = vy / 1.5;
    for (let j = -1; j <= my; j++) {
      for (let i = -1; i <= nx; i++) {
        const cx = (i + 0.5 + (((j % 2) + 2) % 2) * 0.5) * sx, cy = j * vy + ry;
        const ic = ((i % nx) + nx) % nx, jc = ((j % my) + my) % my;
        const pts: Pt[] = [];
        for (let v = 0; v < 6; v++) {
          const a = Math.PI / 6 + (v * Math.PI) / 3;
          pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
        }
        const key = ic * 53 + jc;
        const spin = Math.floor(rngFor(s.seed, 700, key).next() * 3);
        out.push({ pts, angle: spin * (Math.PI / 3), key, group: spin });
      }
    }
    return out;
  }
  // versailles: square panels of four mitred frame boards round a lattice of small turned diamonds
  const n = fitCount(W, block, 1);
  const P = W / n, f = P * 0.13, F = P - 2 * f;
  const a = F / 6; // half-diagonal of one diamond
  for (let j = -1; j <= n; j++) {
    for (let i = -1; i <= n; i++) {
      const ox = i * P, oy = j * P;
      const ic = ((i % n) + n) % n, jc = ((j % n) + n) % n;
      const key = (ic * 31 + jc) * 64;
      const o: Pt = [ox, oy], i1: Pt = [ox + f, oy + f];
      const frame: Array<{ pts: Pt[]; angle: number }> = [
        { pts: [o, [ox + P, oy], [ox + P - f, oy + f], i1], angle: 0 },
        { pts: [[ox + P, oy], [ox + P, oy + P], [ox + P - f, oy + P - f], [ox + P - f, oy + f]], angle: Math.PI / 2 },
        { pts: [[ox + P, oy + P], [ox, oy + P], [ox + f, oy + P - f], [ox + P - f, oy + P - f]], angle: 0 },
        { pts: [[ox, oy + P], o, i1, [ox + f, oy + P - f]], angle: Math.PI / 2 },
      ];
      frame.forEach((fr, q) => out.push({ pts: fr.pts, angle: fr.angle, key: key + q, group: q % 2 }));
      // field: diamonds with centres at multiples of a (i + j even), clipped to the inner square by the painter
      for (let dj = 0; dj <= 6; dj++) {
        for (let di = 0; di <= 6; di++) {
          if ((di + dj) % 2 !== 0) continue;
          const cx = ox + f + di * a, cy = oy + f + dj * a;
          out.push({
            pts: [[cx - a, cy], [cx, cy - a], [cx + a, cy], [cx, cy + a]], angle: ((di / 2 + dj / 2) % 2 === 0 ? 1 : -1) * (Math.PI / 4),
            key: key + 4 + dj * 7 + di, group: 2,
          });
        }
      }
    }
  }
  return out;
}

const woodParquet: PainterDef = {
  id: 'wood-parquet',
  surface: 'floor',
  description: 'Parquet blocks cut from a tinted grain map, the grain following each block: herringbone (also double), chevron at any mitre angle, basket weave (also on the diagonal), brick-bond blocks, pinwheel, turned hexagons and Versailles panels.',
  colors: ['base', 'light', 'dark', 'seam'],
  params: {
    seed: SEED_PARAM,
    map: MAP_PARAM,
    layout: { type: 'enum', values: LAYOUTS, default: 'herringbone', doc: 'Parquet layout.' },
    block: { type: 'number', min: 0.1, max: 1.4, default: 0.5, doc: 'Herringbone: columns across a repeat as repeat/block; chevron: width of one V; basket/brick/pinwheel/hexagon/versailles: block, cell or panel size (m).' },
    ratio: { type: 'number', min: 1.5, max: 8, default: 5, doc: 'Herringbone: block length / width; pinwheel: long side / short side.' },
    board: { type: 'number', min: 0.03, max: 0.2, default: 0.075, doc: 'Chevron and brick: board width (m).' },
    angle: { type: 'number', min: 30, max: 60, default: 45, doc: 'Chevron: mitre angle in degrees.' },
    strips: { type: 'number', min: 1, max: 6, default: 1, integer: true, doc: 'Parallel boards per block (double herringbone, basket squares).' },
    diagonal: { type: 'boolean', default: false, doc: 'Basket weave on the diagonal.' },
    turn: { type: 'boolean', default: true, doc: 'Basket weave: turn alternate squares a quarter (false = parallel checker).' },
    alt: { type: 'number', min: 0, max: 1, default: 0, doc: 'Alternating light and dark tone between neighbouring blocks.' },
    scale: { type: 'number', min: 0.2, max: 2.4, default: 0.6, doc: 'Metres covered by one map tile.' },
    gap: { type: 'number', min: 0.0005, max: 0.01, default: 0.0016, doc: 'Joint width (m).' },
    variation: { type: 'number', min: 0, max: 1, default: 0.5, doc: 'Block-to-block tone variation.' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    const img = tinted(s);
    ctx.fillStyle = col(s, 3);
    ctx.fillRect(0, 0, s.w, s.h);
    const layout = str(s, 'layout');
    const tileM = num(s, 'scale');
    const variation = num(s, 'variation'), alt = num(s, 'alt');
    const lw = hair(s, num(s, 'gap'));
    const pieces = parquetPieces(s);
    const inner = layout === 'versailles';
    for (const p of pieces) {
      let cx = 0, cy = 0;
      for (const [x, y] of p.pts) { cx += x; cy += y; }
      cx /= p.pts.length; cy /= p.pts.length;
      if (cx < -1.5 && cy < -1.5) continue;
      const reach = Math.max(...p.pts.map(([x, y]) => Math.hypot(x - cx, y - cy))) + 0.01;
      if (cx + reach < 0 || cx - reach > s.w || cy + reach < 0 || cy - reach > s.h) continue;
      const rng = rngFor(s.seed, 800, p.key);
      ctx.save();
      if (inner && p.group === 2) {
        // the diamond field is clipped to the inner square of its panel
        const P = s.w / Math.max(1, Math.round(s.w / num(s, 'block')));
        const f = P * 0.13;
        const px = Math.floor((cx + 1e-6) / P) * P, py = Math.floor((cy + 1e-6) / P) * P;
        ctx.beginPath();
        ctx.rect(px + f, py + f, P - 2 * f, P - 2 * f);
        ctx.clip();
      }
      ctx.beginPath();
      polygonPath(ctx, p.pts);
      ctx.clip();
      ctx.translate(cx, cy);
      ctx.rotate(p.angle);
      if (rng.next() < 0.5) ctx.scale(-1, 1);
      mapRect(ctx, s, img, rng, -reach, -reach, reach * 2, reach * 2, tileM);
      ctx.restore();
      const bias = alt > 0 ? (p.group % 2 === 0 ? 1 : -1) * alt * 0.5 : 0;
      const wash = toneWash(s, rng, variation, bias);
      ctx.save();
      if (inner && p.group === 2) {
        const P = s.w / Math.max(1, Math.round(s.w / num(s, 'block')));
        const f = P * 0.13;
        const px = Math.floor((cx + 1e-6) / P) * P, py = Math.floor((cy + 1e-6) / P) * P;
        ctx.beginPath();
        ctx.rect(px + f, py + f, P - 2 * f, P - 2 * f);
        ctx.clip();
      }
      if (wash) {
        ctx.beginPath();
        polygonPath(ctx, p.pts);
        ctx.fillStyle = wash;
        ctx.fill();
      }
      ctx.beginPath();
      polygonPath(ctx, p.pts);
      ctx.strokeStyle = rgba(col(s, 3), 0.9);
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.restore();
    }
  },
};

// ---------------------------------------------------------------------------------------------
// rubber-floor
// ---------------------------------------------------------------------------------------------

const rubberFloor: PainterDef = {
  id: 'rubber-relief',
  surface: 'floor',
  description: 'Rubber or vinyl sheet in tiles with a moulded surface: round studs, coins, parallel ribs or a plain speckled finish, over a tinted print map.',
  colors: ['base', 'light', 'dark', 'seam'],
  params: {
    seed: SEED_PARAM,
    map: MAP_PARAM,
    relief: { type: 'enum', values: ['studs', 'coins', 'ribs', 'smooth'], default: 'studs', doc: 'Surface moulding.' },
    tile: { type: 'number', min: 0.3, max: 1.2, default: 0.6, doc: 'Tile size (m); the relief fits whole times into it.' },
    pitch: { type: 'number', min: 0.01, max: 0.08, default: 0.03, doc: 'Distance between studs, coins or ribs (m).' },
    gap: { type: 'number', min: 0.001, max: 0.01, default: 0.002, doc: 'Joint width (m).' },
    scale: { type: 'number', min: 0.2, max: 2.4, default: 0.6, doc: 'Metres covered by one map tile.' },
    variation: { type: 'number', min: 0, max: 1, default: 0.25, doc: 'Tile-to-tile tone variation.' },
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    const img = tinted(s);
    ctx.fillStyle = col(s, 3);
    ctx.fillRect(0, 0, s.w, s.h);
    const nT = fitCount(s.w, num(s, 'tile'));
    const t = s.w / nT;
    const g = hair(s, num(s, 'gap'));
    const relief = str(s, 'relief');
    const cells = Math.max(2, Math.round(t / num(s, 'pitch')));
    const p = t / cells;
    for (let j = 0; j < nT; j++) {
      for (let i = 0; i < nT; i++) {
        const rng = rngFor(s.seed, 900, i, j);
        const x = i * t + g / 2, y = j * t + g / 2, w = t - g;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, w);
        ctx.clip();
        mapRect(ctx, s, img, rng, x, y, w, w, num(s, 'scale'));
        const wash = toneWash(s, rng, num(s, 'variation'), 0);
        if (wash) { ctx.fillStyle = wash; ctx.fillRect(x, y, w, w); }
        if (relief === 'ribs') {
          for (let q = 0; q < cells; q++) {
            ctx.fillStyle = rgba('#ffffff', 0.16);
            ctx.fillRect(x, y + q * p, w, p * 0.28);
            ctx.fillStyle = rgba('#000000', 0.2);
            ctx.fillRect(x, y + q * p + p * 0.62, w, p * 0.3);
          }
        } else if (relief !== 'smooth') {
          const coin = relief === 'coins';
          for (let q = 0; q < cells; q++) {
            for (let r = 0; r < cells; r++) {
              const px = x + (r + 0.5) * p + (coin && q % 2 ? p * 0.5 : 0), py = y + (q + 0.5) * p;
              const rad = p * (coin ? 0.4 : 0.3);
              for (const dx of coin && px > x + w - rad ? [0, -w] : [0]) {
                ctx.fillStyle = rgba('#000000', 0.28);
                ctx.beginPath();
                ctx.ellipse(px + dx + rad * 0.2, py + rad * 0.28, rad, rad, 0, 0, TAU);
                ctx.fill();
                ctx.fillStyle = mix(col(s, 0), col(s, 1), 0.35);
                ctx.beginPath();
                ctx.ellipse(px + dx, py, rad, rad, 0, 0, TAU);
                ctx.fill();
                ctx.fillStyle = rgba('#ffffff', 0.22);
                ctx.beginPath();
                ctx.ellipse(px + dx - rad * 0.22, py - rad * 0.25, rad * 0.5, rad * 0.4, 0, 0, TAU);
                ctx.fill();
              }
            }
          }
        } else {
          speckle(ctx, s, rng, 0.35, [shade(col(s, 1), 0.1), shade(col(s, 2), -0.1)], 0.4, 1.2, { x, y, w, h: w });
        }
        ctx.restore();
      }
    }
  },
};

export const PAINTERS_FLOORS_A: PainterDef[] = [boardFloor, woodParquet, rubberFloor];
