// Floor painters: wood planks, herringbone parquet, checker tile, hex mosaic, plush carpet, terrazzo,
// polished concrete and stone pavers. Floor textures are square (repeat x repeat metres) and seamless in
// both directions: every layout is built from whole periods of the repeat, random variation is keyed by
// the wrapped position, and elements crossing an edge are drawn again on the opposite side.

import type { Rng } from '../../core/rng';
import {
  SEED_PARAM, bevelRect, clouds, col, drawWrapped, fitCount, flag, hair, mix, num, polygonPath, rgba, rngFor,
  roundRectPath, shade, softBlob, speckle, str, wrappedKey, type Canvas2DLike, type PaintSpec, type PainterDef,
} from './painterKit';

const TAU = Math.PI * 2;
const SQRT2 = Math.SQRT2;

// ---------------------------------------------------------------------------------------------
// Wood grain (shared by planks and parquet)
// ---------------------------------------------------------------------------------------------

interface WoodColors { base: string; light: string; dark: string; seam: string }

function woodTone(rng: Rng, c: WoodColors, variation: number): string {
  const t = rng.next();
  let tone = c.base;
  if (t < 0.36) tone = mix(c.base, c.light, rng.next() * variation);
  else if (t < 0.72) tone = mix(c.base, c.dark, rng.next() * variation * 0.85);
  return shade(tone, (rng.next() - 0.5) * 0.04);
}

/**
 * Paints one board in local space: x along the grain from 0 to len, y across from 0 to wid. Clips to the
 * board, adds streaks, flat-sawn "cathedral" figure, straight grain, an optional knot and joint lines.
 */
function drawBoard(
  ctx: Canvas2DLike, s: PaintSpec, rng: Rng, len: number, wid: number, tone: string, c: WoodColors,
  grain: number, knots: number, cathedral: boolean,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, len, wid);
  ctx.clip();
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, len, wid);
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = rgba(rng.next() < 0.5 ? c.light : c.dark, 0.2 * grain);
    const yy = rng.next() * wid;
    ctx.fillRect(0, yy, len, wid * (0.1 + rng.next() * 0.25));
  }
  if (cathedral && rng.next() < 0.6) {
    const cx = len * (0.2 + rng.next() * 0.6);
    const cy = wid * (0.35 + rng.next() * 0.3);
    ctx.strokeStyle = rgba(shade(tone, -0.4), 0.32 * grain);
    ctx.lineWidth = hair(s, 0.0012, 0.6);
    for (let q = 0; q < 6; q++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, len * (0.05 + q * 0.045), wid * (0.07 + q * 0.085), 0, 0, TAU);
      ctx.stroke();
    }
  }
  const lines = 6 + Math.floor(rng.next() * 5);
  const steps = Math.max(8, Math.round(len / 0.04));
  for (let k = 0; k < lines; k++) {
    const y0 = rng.next() * wid;
    const amp = wid * 0.05 * rng.next();
    const wl = 0.3 + rng.next() * 0.6;
    const ph = rng.next() * TAU;
    ctx.strokeStyle = rgba(shade(tone, rng.next() < 0.75 ? -0.4 : 0.3), (0.22 + rng.next() * 0.25) * grain);
    ctx.lineWidth = hair(s, 0.0012 + rng.next() * 0.0014, 0.6);
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * len;
      const y = y0 + Math.sin((x / wl) * TAU + ph) * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  if (rng.next() < knots * 0.35) {
    const kx = len * (0.15 + rng.next() * 0.7), ky = wid * (0.25 + rng.next() * 0.5);
    const kr = Math.min(wid * 0.12, 0.012);
    ctx.fillStyle = rgba(c.dark, 0.75);
    ctx.beginPath();
    ctx.ellipse(kx, ky, kr * 1.4, kr, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(shade(c.dark, -0.2), 0.35);
    ctx.lineWidth = hair(s, 0.001, 0.6);
    for (let q = 1; q <= 3; q++) {
      ctx.beginPath();
      ctx.ellipse(kx, ky, kr * (1.4 + q * 0.9), kr * (1 + q * 0.5), 0, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();
  // joints: end joint at x = 0, long joint at y = 0, a lit arris below it
  const j = hair(s, 0.0015);
  ctx.fillStyle = rgba(c.seam, 0.85);
  ctx.fillRect(0, 0, j, wid);
  ctx.fillStyle = rgba(c.seam, 0.7);
  ctx.fillRect(0, 0, len, j);
  ctx.fillStyle = rgba('#ffffff', 0.07);
  ctx.fillRect(j, j, len - j, hair(s, 0.002));
}

function woodColors(s: PaintSpec): WoodColors {
  return { base: col(s, 0), light: col(s, 1), dark: col(s, 2), seam: col(s, 3) };
}

const WOOD_PARAMS = {
  grain: { type: 'number', min: 0, max: 1, default: 0.6, doc: 'Grain visibility.' },
  knots: { type: 'number', min: 0, max: 1, default: 0.3, doc: 'How often boards have knots.' },
  variation: { type: 'number', min: 0, max: 1, default: 0.5, doc: 'Board-to-board tone variation.' },
} as const;

// ---------------------------------------------------------------------------------------------
// Planks
// ---------------------------------------------------------------------------------------------

const planks: PainterDef = {
  id: 'planks',
  surface: 'floor',
  description: 'Random-length boards in staggered rows, with grain, cathedral figure, knots and joints.',
  colors: ['base', 'light', 'dark', 'seam'],
  params: {
    seed: SEED_PARAM,
    plank: { type: 'number', min: 0.1, max: 0.3, default: 0.18, doc: 'Board width (m).' },
    minLen: { type: 'number', min: 0.3, max: 1.5, default: 0.7, doc: 'Shortest board (m).' },
    maxLen: { type: 'number', min: 0.6, max: 2.4, default: 1.6, doc: 'Longest board (m).' },
    ...WOOD_PARAMS,
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    const c = woodColors(s);
    ctx.fillStyle = c.seam;
    ctx.fillRect(0, 0, s.w, s.h);
    const rows = fitCount(s.h, num(s, 'plank'));
    const ph = s.h / rows;
    const minLen = num(s, 'minLen'), maxLen = Math.max(num(s, 'maxLen'), num(s, 'minLen'));
    for (let r = 0; r < rows; r++) {
      const rng = rngFor(s.seed, 100, r);
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
      const y = r * ph;
      lens.forEach((len, i) => {
        const x0 = x >= s.w ? x - s.w : x;
        drawWrapped(ctx, s, x0, y, x0 + len, y + ph, () => {
          const prng = rngFor(s.seed, 200, r, i);
          const tone = woodTone(prng, c, num(s, 'variation'));
          ctx.save();
          ctx.translate(x0, y);
          drawBoard(ctx, s, prng, len, ph, tone, c, num(s, 'grain'), num(s, 'knots'), true);
          ctx.restore();
        });
        x += len;
      });
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Herringbone parquet
// ---------------------------------------------------------------------------------------------

const herringbone: PainterDef = {
  id: 'herringbone',
  surface: 'floor',
  description: 'Short wood blocks laid at 45 degrees in a herringbone, with per-block tone and grain.',
  colors: ['base', 'light', 'dark', 'seam'],
  params: {
    seed: SEED_PARAM,
    ratio: { type: 'number', min: 3, max: 8, default: 5, integer: true, doc: 'Block length / width.' },
    columns: { type: 'number', min: 1, max: 6, default: 3, integer: true, doc: 'Herringbone columns per repeat (sets the block size).' },
    ...WOOD_PARAMS,
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    const c = woodColors(s);
    ctx.fillStyle = c.seam;
    ctx.fillRect(0, 0, s.w, s.h);
    const k = Math.round(num(s, 'ratio'));
    const b = Math.round(num(s, 'columns'));
    // In the 45-degree frame the herringbone lattice is generated by (w, w) and (L, -L); rotated into the
    // texture these become (0, w*sqrt2) and (L*sqrt2, 0), so whole periods fit when R = b * k * w * sqrt2.
    const w = s.w / (b * k * SQRT2);
    const L = k * w;
    const toWorld = (u: number, v: number): [number, number] => [(u - v) / SQRT2, (u + v) / SQRT2];
    const grain = num(s, 'grain'), knots = num(s, 'knots') * 0.3, variation = num(s, 'variation');
    for (let m = -2; m <= b + 1; m++) {
      for (let i = -k - 3; i <= b * k + 3; i++) {
        const u0 = i * w + m * L, v0 = i * w - m * L;
        const blocks: Array<{ ou: number; ov: number; angle: number; cu: number; cv: number }> = [
          { ou: u0, ov: v0, angle: Math.PI / 4, cu: u0 + L / 2, cv: v0 + w / 2 },
          { ou: u0 + w, ov: v0 + w, angle: (3 * Math.PI) / 4, cu: u0 + w / 2, cv: v0 + w + L / 2 },
        ];
        for (const bl of blocks) {
          const [cx, cy] = toWorld(bl.cu, bl.cv);
          const reach = (L + w) / 2;
          if (cx + reach < 0 || cx - reach > s.w || cy + reach < 0 || cy - reach > s.h) continue;
          const [ox, oy] = toWorld(bl.ou, bl.ov);
          const rng = rngFor(s.seed, wrappedKey(s, cx, cy));
          const tone = woodTone(rng, c, variation);
          ctx.save();
          ctx.translate(ox, oy);
          ctx.rotate(bl.angle);
          drawBoard(ctx, s, rng, L, w, tone, c, grain, knots, false);
          ctx.restore();
        }
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Checker tile
// ---------------------------------------------------------------------------------------------

function glazedTile(ctx: Canvas2DLike, x: number, y: number, size: number, fill: string, rng: Rng, mottle: number): void {
  bevelRect(ctx, x, y, size, size, fill, size * 0.035, 0.18, 0.12);
  // faint mottling and veining in the glaze
  for (let q = 0; q < 3; q++) {
    softBlob(ctx, x + size * (0.2 + rng.next() * 0.6), y + size * (0.2 + rng.next() * 0.6), size * 0.3, size * 0.18,
      rng.next() * Math.PI, rng.next() < 0.5 ? '#ffffff' : '#000000', 0.05 * mottle, 4);
  }
  ctx.fillStyle = rgba('#ffffff', 0.09);
  ctx.beginPath();
  ctx.ellipse(x + size * 0.3, y + size * 0.28, size * 0.22, size * 0.12, -0.6, 0, TAU);
  ctx.fill();
}

const checker: PainterDef = {
  id: 'checker',
  surface: 'floor',
  description: 'Two-colour glazed square tiles in a checkerboard, square or set on the diagonal.',
  colors: ['tileA', 'tileB', 'grout'],
  params: {
    seed: SEED_PARAM,
    tile: { type: 'number', min: 0.2, max: 0.6, default: 0.33, doc: 'Tile size (m).' },
    grout: { type: 'number', min: 0.001, max: 0.008, default: 0.003, doc: 'Grout joint (m).' },
    diagonal: { type: 'boolean', default: false, doc: 'Lay the checkerboard at 45 degrees.' },
    variation: { type: 'number', min: 0, max: 1, default: 0.3, doc: 'Tile-to-tile variation.' },
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    const a = col(s, 0), b = col(s, 1), grout = col(s, 2);
    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, s.w, s.h);
    const g = hair(s, num(s, 'grout'));
    const variation = num(s, 'variation');
    const diagonal = flag(s, 'diagonal');
    const n = fitCount(s.w, num(s, 'tile') * (diagonal ? SQRT2 : 1), 2, 2);
    if (!diagonal) {
      const t = s.w / n;
      // the grid is offset by half a tile so the texture edges fall mid-tile, never on a grout line
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const fill = shade((i + j) % 2 ? b : a, (rngFor(s.seed, i, j).next() - 0.5) * 0.08 * variation);
          const x = (i + 0.5) * t, y = (j + 0.5) * t;
          drawWrapped(ctx, s, x, y, x + t, y + t, () => {
            const rng = rngFor(s.seed, i, j);
            rng.next();
            glazedTile(ctx, x + g / 2, y + g / 2, t - g, fill, rng, variation);
          });
        }
      }
      return;
    }
    // diagonal: squares of side t in a frame rotated 45 degrees about the texture centre
    const t = s.w / (n * SQRT2);
    const N = Math.ceil(s.w / t) + 2;
    const cos = Math.SQRT1_2;
    for (let i = -N; i <= N; i++) {
      for (let j = -N; j <= N; j++) {
        const lx = (i + 0.5) * t, ly = (j + 0.5) * t;
        const cx = s.w / 2 + (lx - ly) * cos, cy = s.h / 2 + (lx + ly) * cos;
        if (cx < -t || cx > s.w + t || cy < -t || cy > s.h + t) continue;
        const rng = rngFor(s.seed, wrappedKey(s, cx, cy));
        const fill = shade(((i + j) % 2 + 2) % 2 ? b : a, (rng.next() - 0.5) * 0.08 * variation);
        ctx.save();
        ctx.translate(s.w / 2, s.h / 2);
        ctx.rotate(Math.PI / 4);
        glazedTile(ctx, i * t + g / 2, j * t + g / 2, t - g, fill, rng, variation);
        ctx.restore();
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Hex mosaic
// ---------------------------------------------------------------------------------------------

/**
 * Chooses hex column/row counts for a square repeat: flat-top hexes of radius r have a period of
 * 3r horizontally (two columns) and sqrt(3) r vertically, so the vertical spacing is stretched by `fy`
 * (kept within a few percent) to make whole rows fit. `multiple` constrains counts for motif sublattices.
 */
export function hexLayout(repeat: number, radius: number, multiple: number): { pairs: number; rows: number; r: number; fy: number } {
  let best = { pairs: 1, rows: 1, r: repeat / 3, fy: 1, score: Infinity };
  const target = repeat / (3 * radius);
  for (let pairs = multiple; pairs <= Math.max(multiple, Math.ceil(target * 2)); pairs += multiple) {
    const r = repeat / (3 * pairs);
    const rowsF = repeat / (Math.sqrt(3) * r);
    for (const rows of [Math.floor(rowsF / multiple) * multiple, Math.ceil(rowsF / multiple) * multiple]) {
      if (rows < multiple) continue;
      const fy = repeat / (rows * Math.sqrt(3) * r);
      const score = Math.abs(fy - 1) * 4 + Math.abs(r / radius - 1);
      if (score < best.score) best = { pairs, rows, r, fy, score };
    }
  }
  return { pairs: best.pairs, rows: best.rows, r: best.r, fy: best.fy };
}

const hexMosaic: PainterDef = {
  id: 'hex-mosaic',
  surface: 'floor',
  description: 'Small glazed hexagon mosaic with rosette flowers, scattered accents or a plain field.',
  colors: ['field', 'accent', 'grout', 'centre'],
  params: {
    seed: SEED_PARAM,
    size: { type: 'number', min: 0.015, max: 0.12, default: 0.03, doc: 'Hexagon radius (m).' },
    grout: { type: 'number', min: 0.001, max: 0.006, default: 0.0022, doc: 'Grout joint (m).' },
    pattern: { type: 'enum', values: ['rosette', 'scatter', 'plain'], default: 'rosette', doc: 'Accent layout.' },
    variation: { type: 'number', min: 0, max: 1, default: 0.4, doc: 'Tile-to-tile variation.' },
  },
  thumbSpan: 0.6,
  paint(ctx, s) {
    const field = col(s, 0), accent = col(s, 1), grout = col(s, 2), centre = col(s, 3);
    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, s.w, s.h);
    const pattern = str(s, 'pattern');
    const L = hexLayout(s.w, num(s, 'size'), pattern === 'rosette' ? 4 : 1);
    const cols = L.pairs * 2;
    const rowH = Math.sqrt(3) * L.r * L.fy;
    const g = hair(s, num(s, 'grout'));
    const variation = num(s, 'variation');
    // colour map over one period (cols x rows), wrapped
    const map = new Map<string, string>();
    const key = (c: number, r: number) => `${((c % cols) + cols) % cols},${((r % L.rows) + L.rows) % L.rows}`;
    if (pattern === 'rosette') {
      for (let c = 0; c < cols; c += 4) {
        for (let r = (c / 4) % 2 ? 2 : 0; r < L.rows; r += 4) {
          map.set(key(c, r), centre);
          // neighbours in the odd-column-shifted-down layout (c is even here)
          for (const [dc, dr] of [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]] as const) map.set(key(c + dc, r + dr), accent);
        }
      }
    } else if (pattern === 'scatter') {
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < L.rows; r++) {
          const v = rngFor(s.seed, 40, c, r).next();
          if (v < 0.12) map.set(key(c, r), accent);
          else if (v < 0.16) map.set(key(c, r), centre);
        }
      }
    }
    const rad = L.r - g / 2;
    for (let c = -1; c <= cols; c++) {
      for (let r = -1; r <= L.rows; r++) {
        const cx = c * 1.5 * L.r;
        const cy = (r + (((c % 2) + 2) % 2) * 0.5) * rowH;
        const rng = rngFor(s.seed, ((c % cols) + cols) % cols, ((r % L.rows) + L.rows) % L.rows);
        const base = map.get(key(c, r)) ?? field;
        const fill = shade(base, (rng.next() - 0.5) * 0.1 * variation);
        const pts: Array<[number, number]> = [];
        for (let q = 0; q < 6; q++) {
          const a = (q / 6) * TAU;
          pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * L.fy]);
        }
        ctx.fillStyle = fill;
        ctx.beginPath();
        polygonPath(ctx, pts);
        ctx.fill();
        ctx.fillStyle = rgba('#ffffff', 0.16);
        ctx.beginPath();
        ctx.ellipse(cx - rad * 0.25, cy - rad * 0.3 * L.fy, rad * 0.42, rad * 0.22, -0.4, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = rgba('#000000', 0.12);
        ctx.lineWidth = hair(s, 0.0008, 0.5);
        ctx.beginPath();
        polygonPath(ctx, pts);
        ctx.stroke();
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Plush carpet
// ---------------------------------------------------------------------------------------------

const carpet: PainterDef = {
  id: 'carpet',
  surface: 'floor',
  description: 'Cut-pile carpet: dense fibre flecks, soft pile shading and faint vacuum lanes; optional loop pile.',
  colors: ['base', 'light', 'dark'],
  params: {
    seed: SEED_PARAM,
    pile: { type: 'number', min: 0, max: 1, default: 0.6, doc: 'Fibre fleck contrast.' },
    lanes: { type: 'number', min: 0, max: 1, default: 0.4, doc: 'Visibility of vacuum lanes.' },
    laneWidth: { type: 'number', min: 0.2, max: 0.6, default: 0.33, doc: 'Vacuum lane width (m).' },
    weave: { type: 'enum', values: ['cut', 'loop'], default: 'cut', doc: 'Cut pile or loop (berber) pile.' },
  },
  thumbSpan: 0.8,
  paint(ctx, s) {
    const base = col(s, 0), light = col(s, 1), dark = col(s, 2);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s.w, s.h);
    const rng = rngFor(s.seed, 5);
    clouds(ctx, s, rng, Math.round(s.w * s.h * 14), 0.22, [light, dark], 0.07);
    const lanes = num(s, 'lanes');
    if (lanes > 0) {
      const n = fitCount(s.h, num(s, 'laneWidth'), 2, 2);
      const lw = s.h / n;
      for (let i = 0; i < n; i++) {
        const c = i % 2 ? light : dark;
        const y0 = i * lw - lw * 0.15;
        drawWrapped(ctx, s, 0, y0, s.w, y0 + lw * 1.3, () => {
          ctx.fillStyle = c;
          for (let k = 0; k < 4; k++) {
            ctx.globalAlpha = (0.1 * lanes) / 4;
            ctx.fillRect(0, y0 + lw * 0.1 * k, s.w, lw * 1.3 - lw * 0.2 * k);
          }
          ctx.globalAlpha = 1;
        });
      }
    }
    const pile = num(s, 'pile');
    speckle(ctx, s, rng, 0.18 * pile, [light, dark], 0.45, 1.3);
    speckle(ctx, s, rng, 0.06 * pile, [shade(dark, -0.25), shade(light, 0.25)], 0.4, 1.1);
    if (str(s, 'weave') === 'loop') {
      const n = fitCount(s.w, 0.012);
      const step = s.w / n;
      ctx.strokeStyle = rgba(dark, 0.22);
      ctx.lineWidth = hair(s, 0.0014, 0.6);
      for (let j = 0; j < n; j++) {
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const x = (i + (j % 2) * 0.5) * step, y = (j + 0.5) * step;
          ctx.moveTo(x + step * 0.4, y);
          ctx.ellipse(x, y, step * 0.4, step * 0.3, 0, 0, TAU);
        }
        ctx.stroke();
      }
      speckle(ctx, s, rng, 0.004, [shade(dark, -0.35)], 0.7, 2.2);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Terrazzo
// ---------------------------------------------------------------------------------------------

const terrazzo: PainterDef = {
  id: 'terrazzo',
  surface: 'floor',
  description: 'Polished terrazzo: angular marble and glass chips of mixed sizes set in a cement ground.',
  colors: ['ground', 'chipA', 'chipB', 'chipC'],
  params: {
    seed: SEED_PARAM,
    chip: { type: 'number', min: 0.005, max: 0.05, default: 0.016, doc: 'Typical chip size (m).' },
    density: { type: 'number', min: 0.2, max: 1, default: 0.55, doc: 'Chip coverage.' },
    polish: { type: 'number', min: 0, max: 1, default: 0.5, doc: 'Polished sheen.' },
  },
  thumbSpan: 0.6,
  paint(ctx, s) {
    const ground = col(s, 0);
    const chips = [col(s, 1), col(s, 2), col(s, 3)];
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, s.w, s.h);
    const rng = rngFor(s.seed, 6);
    clouds(ctx, s, rng, Math.round(s.w * s.h * 8), 0.25, [shade(ground, 0.2), shade(ground, -0.15)], 0.2);
    speckle(ctx, s, rng, 0.02, chips, 0.55, 1.4);
    const size = num(s, 'chip');
    const count = Math.round((num(s, 'density') * s.w * s.h) / (size * size * 2.4));
    for (let i = 0; i < count; i++) {
      const x = rng.next() * s.w, y = rng.next() * s.h;
      const r = size * (0.3 + Math.pow(rng.next(), 2.2) * 1.8);
      const pick = rng.next();
      const c = shade(pick < 0.45 ? chips[0] ?? ground : pick < 0.75 ? chips[1] ?? ground : chips[2] ?? ground, (rng.next() - 0.5) * 0.12);
      const sides = 4 + Math.floor(rng.next() * 4);
      const rot = rng.next() * TAU;
      const pts: Array<[number, number]> = [];
      for (let q = 0; q < sides; q++) {
        const a = rot + (q / sides) * TAU + (rng.next() - 0.5) * 0.6;
        const rr = r * (0.55 + rng.next() * 0.45);
        pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * (0.7 + rng.next() * 0.3)]);
      }
      drawWrapped(ctx, s, x - r, y - r, x + r, y + r, () => {
        ctx.fillStyle = c;
        ctx.beginPath();
        polygonPath(ctx, pts);
        ctx.fill();
      });
    }
    const polish = num(s, 'polish');
    if (polish > 0) clouds(ctx, s, rng, Math.round(s.w * s.h * 3), 0.4, ['#ffffff'], 0.1 * polish);
  },
};

// ---------------------------------------------------------------------------------------------
// Polished concrete
// ---------------------------------------------------------------------------------------------

const concrete: PainterDef = {
  id: 'concrete',
  surface: 'floor',
  description: 'Power-trowelled concrete slabs with clouding, swirl marks, fine aggregate and saw-cut joints.',
  colors: ['base', 'light', 'dark', 'joint'],
  params: {
    seed: SEED_PARAM,
    slab: { type: 'number', min: 0.6, max: 3, default: 1.2, doc: 'Slab size between saw cuts (m).' },
    cloud: { type: 'number', min: 0, max: 1, default: 0.5, doc: 'Clouding contrast.' },
    aggregate: { type: 'number', min: 0, max: 1, default: 0.35, doc: 'Visible aggregate.' },
    joints: { type: 'boolean', default: true, doc: 'Saw-cut joints between slabs.' },
  },
  thumbSpan: 1.5,
  paint(ctx, s) {
    const base = col(s, 0), light = col(s, 1), dark = col(s, 2), joint = col(s, 3);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s.w, s.h);
    const rng = rngFor(s.seed, 7);
    const cloud = num(s, 'cloud');
    clouds(ctx, s, rng, Math.round(s.w * s.h * 3), 0.55, [light, dark], 0.5 * cloud);
    clouds(ctx, s, rng, Math.round(s.w * s.h * 10), 0.18, [light, dark], 0.3 * cloud);
    // trowel swirls
    const swirls = Math.round(s.w * s.h * 7);
    ctx.lineCap = 'round';
    for (let i = 0; i < swirls; i++) {
      const x = rng.next() * s.w, y = rng.next() * s.h;
      const r = 0.12 + rng.next() * 0.35;
      const a0 = rng.next() * TAU, span = 0.8 + rng.next() * 1.4;
      const lw = 0.02 + rng.next() * 0.05;
      const c = rgba(rng.next() < 0.6 ? light : dark, 0.07 * (0.4 + cloud));
      drawWrapped(ctx, s, x - r - lw, y - r - lw, x + r + lw, y + r + lw, () => {
        ctx.strokeStyle = c;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.arc(x, y, r, a0, a0 + span);
        ctx.stroke();
      });
    }
    const agg = num(s, 'aggregate');
    speckle(ctx, s, rng, 0.02 * agg, [shade(dark, -0.3), shade(light, 0.2)], 0.4, 1.8);
    const stones = Math.round(s.w * s.h * 400 * agg);
    for (let i = 0; i < stones; i++) {
      const x = rng.next() * s.w, y = rng.next() * s.h, r = 0.0015 + rng.next() * 0.004;
      const c = rgba(rng.next() < 0.5 ? dark : light, 0.45);
      drawWrapped(ctx, s, x - r, y - r, x + r, y + r, () => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.75, 0, 0, TAU);
        ctx.fill();
      });
    }
    if (flag(s, 'joints')) {
      const n = fitCount(s.w, num(s, 'slab'));
      const step = s.w / n;
      const jw = hair(s, 0.004, 1.2);
      for (let i = 0; i < n; i++) {
        const p = (i + 0.5) * step; // joints sit mid-texture so the edges never split a cut
        ctx.fillStyle = rgba(joint, 0.85);
        ctx.fillRect(p - jw / 2, 0, jw, s.h);
        ctx.fillRect(0, p - jw / 2, s.w, jw);
        ctx.fillStyle = rgba('#ffffff', 0.12);
        ctx.fillRect(p + jw / 2, 0, hair(s, 0.002), s.h);
        ctx.fillRect(0, p + jw / 2, s.w, hair(s, 0.002));
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Stone pavers
// ---------------------------------------------------------------------------------------------

/** Splits `total` modules into parts from `sizes` (seeded); always sums exactly to total. */
export function partition(total: number, sizes: readonly number[], rng: Rng): number[] {
  const out: number[] = [];
  let rest = total;
  const min = Math.min(...sizes);
  while (rest > 0) {
    const options = sizes.filter((v) => v <= rest && (rest - v === 0 || rest - v >= min));
    const v = options.length ? options[Math.floor(rng.next() * options.length)] as number : rest;
    out.push(v);
    rest -= v;
  }
  return out;
}

const pavers: PainterDef = {
  id: 'pavers',
  surface: 'floor',
  description: 'Riven stone flags in random coursed rows with sanded joints, chamfers, pitting and moss.',
  colors: ['stoneA', 'stoneB', 'stoneC', 'joint'],
  params: {
    seed: SEED_PARAM,
    module: { type: 'number', min: 0.1, max: 0.4, default: 0.2, doc: 'Layout module; stones are 2-4 modules (m).' },
    joint: { type: 'number', min: 0.005, max: 0.03, default: 0.012, doc: 'Joint width (m).' },
    texture: { type: 'number', min: 0, max: 1, default: 0.6, doc: 'Surface pitting and riven texture.' },
    moss: { type: 'number', min: 0, max: 1, default: 0.25, doc: 'Moss in the joints.' },
  },
  thumbSpan: 1.6,
  paint(ctx, s) {
    const stones = [col(s, 0), col(s, 1), col(s, 2)];
    const joint = col(s, 3);
    ctx.fillStyle = joint;
    ctx.fillRect(0, 0, s.w, s.h);
    const rng = rngFor(s.seed, 8);
    speckle(ctx, s, rng, 0.04, [shade(joint, 0.25), shade(joint, -0.3)], 0.6, 1.5);
    const moss = num(s, 'moss');
    if (moss > 0) speckle(ctx, s, rng, 0.03 * moss, ['#5f7a3a', '#7b8f45'], 0.75, 2.2);
    const cells = fitCount(s.w, num(s, 'module'), 6);
    const mod = s.w / cells;
    const heights = partition(cells, [2, 3], rng);
    const jw = num(s, 'joint');
    const texture = num(s, 'texture');
    let y = 0;
    heights.forEach((hm, r) => {
      const rowRng = rngFor(s.seed, 60, r);
      const widths = partition(cells, [2, 3, 4], rowRng);
      let x = Math.floor(rowRng.next() * cells) * mod;
      const h = hm * mod;
      widths.forEach((wm, i) => {
        const w = wm * mod;
        const x0 = x >= s.w - 1e-9 ? x - s.w : x;
        const y0 = y;
        drawWrapped(ctx, s, x0, y0, x0 + w, y0 + h, () => {
          const srng = rngFor(s.seed, 70, r, i);
          const fill = shade(stones[Math.floor(srng.next() * 3)] ?? joint, (srng.next() - 0.5) * 0.1);
          const sx = x0 + jw / 2, sy = y0 + jw / 2, sw = w - jw, sh = h - jw;
          ctx.save();
          ctx.beginPath();
          roundRectPath(ctx, sx, sy, sw, sh, Math.min(0.02, sw * 0.1));
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.clip();
          // riven surface: broad patches, then pits
          for (let q = 0; q < 4; q++) {
            softBlob(ctx, sx + srng.next() * sw, sy + srng.next() * sh, sw * (0.2 + srng.next() * 0.3), sh * (0.2 + srng.next() * 0.3),
              srng.next() * Math.PI, srng.next() < 0.5 ? '#ffffff' : '#000000', 0.12 * texture, 5);
          }
          const pits = Math.round(sw * sh * s.ppm * s.ppm * 0.05 * texture); // scales with pixel density
          const d = hair(s, 0.003, 1);
          ctx.fillStyle = rgba(shade(fill, -0.4), 0.45);
          for (let q = 0; q < pits; q++) ctx.fillRect(sx + srng.next() * sw, sy + srng.next() * sh, d, d);
          ctx.fillStyle = rgba(shade(fill, 0.35), 0.35);
          for (let q = 0; q < pits / 2; q++) ctx.fillRect(sx + srng.next() * sw, sy + srng.next() * sh, d, d);
          // chamfered edges: lit top/left, shaded bottom/right
          const e = Math.min(0.012, sw * 0.06, sh * 0.06);
          ctx.fillStyle = rgba('#ffffff', 0.16);
          ctx.fillRect(sx, sy, sw, e);
          ctx.fillRect(sx, sy, e, sh);
          ctx.fillStyle = rgba('#000000', 0.2);
          ctx.fillRect(sx, sy + sh - e, sw, e);
          ctx.fillRect(sx + sw - e, sy, e, sh);
          ctx.restore();
        });
        x += w;
      });
      y += h;
    });
  },
};

/** Floor painters (square, seamless in both directions). */
export const FLOOR_PAINTERS: readonly PainterDef[] = [
  planks, herringbone, checker, hexMosaic, carpet, terrazzo, concrete, pavers,
];
