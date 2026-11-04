// Family-specific painters of surface group 'walls-b' (M10 surfaces): fine stripes (stripe-fine), checks and
// plaids (check-fine) and contemporary geometrics (geo-pro). All three print over an optional fabric or paper
// ground map (AI-generated, shown at low contrast) and are seamless along the wall run: whole periods across the
// repeat, random choices keyed by the wrapped column so the colours repeat too.

import { MAP_IDS, drawMapRect, surfaceMapImage } from '../mapKit';
import {
  SEED_PARAM, SKIRT_PARAM, col, drawWrapped, fitCount, hair, mix, num, polygonPath, rgba, rngFor, shade, skirting, str,
  type Canvas2DLike, type PaintSpec, type PainterDef, type ParamSpec,
} from '../painterKit';

const TAU = Math.PI * 2;
type Pt = readonly [number, number];

const GROUND_PARAMS: Record<string, ParamSpec> = {
  ground: { type: 'enum', values: ['', ...MAP_IDS], default: '', doc: 'Optional fabric or paper map under the print, shown at low contrast around the ground colour; empty = flat ground.' },
  groundScale: { type: 'number', min: 0.2, max: 2.4, default: 0.6, doc: 'Metres covered by one ground map tile (rounded to fit the repeat).' },
  groundContrast: { type: 'number', min: 0, max: 1.5, default: 0.6, doc: 'Contrast of the ground map around the ground colour.' },
};

/** Ground colour plus, when the map is named and loaded, the map at low contrast. */
function paintGround(ctx: Canvas2DLike, s: PaintSpec): void {
  const g = col(s, 0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s.w, s.h);
  const id = str(s, 'ground');
  if (id === '') return;
  const k = num(s, 'groundContrast');
  const img = surfaceMapImage(id, [g, mix(g, '#ffffff', 0.16 * k), mix(g, '#000000', 0.2 * k)], 'material');
  const tile = s.w / Math.max(1, Math.round(s.w / num(s, 'groundScale')));
  const rng = rngFor(s.seed, 41);
  drawMapRect(ctx, img, 0, 0, s.w, s.h, tile, -rng.next() * tile, -rng.next() * tile, s.ppm);
}

/** Random number in [0, 1) that depends only on the wrapped cell, so repeats match across the seam. */
const cellRand = (s: PaintSpec, tag: number, i: number, n: number, j = 0): number =>
  rngFor(s.seed, tag, ((i % n) + n) % n, j + 512).next();

const poly = (ctx: Canvas2DLike, pts: readonly Pt[], fill: string): void => {
  ctx.fillStyle = fill;
  ctx.beginPath();
  polygonPath(ctx, pts);
  ctx.fill();
};
const disc = (ctx: Canvas2DLike, x: number, y: number, r: number, fill: string): void => {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(r, 0.0001), 0, TAU);
  ctx.fill();
};
const strokeW = (ctx: Canvas2DLike, s: PaintSpec, color: string, w: number): void => {
  ctx.strokeStyle = color;
  ctx.lineWidth = hair(s, w);
};

// ---------------------------------------------------------------------------------------------
// Stripes
// ---------------------------------------------------------------------------------------------

const STRIPE_STYLES = ['pencil', 'cabana', 'bayadere', 'ombre', 'shadow', 'hand', 'horizon', 'chalk', 'diagonal', 'ikat'] as const;

const stripeFine: PainterDef = {
  id: 'stripe-fine',
  surface: 'wall',
  description: 'Stripe wallcoverings on a fabric ground: pencil, cabana, bayadere, ombre, shadow, hand-painted, graduated horizontal, chalk, diagonal and ikat.',
  colors: ['ground', 'stripe', 'accent', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    ...GROUND_PARAMS,
    style: { type: 'enum', values: STRIPE_STYLES, default: 'pencil', doc: 'Stripe layout.' },
    width: { type: 'number', min: 0.01, max: 0.5, default: 0.06, doc: 'Stripe period (m): one stripe plus its gap; for horizon the tallest band.' },
    line: { type: 'number', min: 0.001, max: 0.05, default: 0.005, doc: 'Line weight (m) for pencil and chalk stripes.' },
  },
  thumbSpan: 0.8,
  paint(ctx, s) {
    paintGround(ctx, s);
    const g = col(s, 0), A = col(s, 1), B = col(s, 2);
    const style = str(s, 'style');
    const w = num(s, 'width');
    const n = fitCount(s.w, w);
    const p = s.w / n;
    ctx.globalAlpha = 0.92;
    const bar = (x: number, bw: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, 0, Math.max(bw, hair(s, 0.0015)), s.h);
    };
    if (style === 'pencil') {
      const lw = hair(s, num(s, 'line'));
      ctx.globalAlpha = 1;
      for (let i = 0; i < n; i++) bar((i + 0.5) * p - lw / 2, lw, A);
    } else if (style === 'cabana') {
      for (let i = 0; i < n; i++) {
        const x = i * p + p * 0.2, bw = p * 0.6;
        bar(x, bw, A);
        const pin = hair(s, 0.004);
        bar(x + bw * 0.1, pin, g);
        bar(x + bw * 0.9 - pin, pin, g);
        bar(x + bw * 0.5 - pin / 2, pin, B);
      }
    } else if (style === 'bayadere') {
      const parts: Array<[number, number, string]> = [
        [0.0, 0.3, A], [0.4, 0.1, B], [0.58, 0.07, mix(A, g, 0.4)], [0.72, 0.22, mix(B, g, 0.5)],
      ];
      for (let i = 0; i < n; i++) for (const [f, fw, c] of parts) bar(i * p + f * p, fw * p, c);
    } else if (style === 'ombre') {
      const steps = 28;
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < steps; k++) {
          const t = k / (steps - 1); // 0 at the floor
          const y0 = s.h * (1 - (k + 1) / steps), y1 = s.h * (1 - k / steps);
          ctx.fillStyle = mix(A, g, Math.pow(t, 1.1) * 0.88);
          ctx.fillRect(i * p + p * 0.15, y0, p * 0.5, y1 - y0 + 0.002);
        }
      }
    } else if (style === 'shadow') {
      // matte and satin: a broad stripe whose sheen runs from light to dark across the width
      const slices = 9;
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < slices; k++) {
          const t = k / (slices - 1);
          bar(i * p + p * 0.1 + (p * 0.5 * k) / slices, (p * 0.5) / slices + 0.0006, shade(A, 0.1 - t * 0.2));
        }
        bar(i * p + p * 0.1, hair(s, 0.0015), rgba(shade(A, -0.4), 0.3));
      }
    } else if (style === 'hand') {
      // painted with a wide brush: wobbling edges, uneven widths, dry streaks
      const steps = 56;
      for (let i = 0; i < n; i++) {
        const rng = rngFor(s.seed, 61, i);
        const bw = p * (0.34 + rng.next() * 0.12);
        const x0 = i * p + p * 0.12 + rng.next() * p * 0.12;
        const wobL: number[] = [], wobR: number[] = [];
        let a = 0, b = 0;
        for (let k = 0; k <= steps; k++) {
          a += (rng.next() - 0.5) * p * 0.03; a *= 0.92;
          b += (rng.next() - 0.5) * p * 0.03; b *= 0.92;
          wobL.push(a); wobR.push(b);
        }
        const pts: Pt[] = [];
        for (let k = 0; k <= steps; k++) pts.push([x0 + wobL[k]!, (k / steps) * s.h]);
        for (let k = steps; k >= 0; k--) pts.push([x0 + bw + wobR[k]!, (k / steps) * s.h]);
        poly(ctx, pts, A);
        // dry-brush streaks
        ctx.fillStyle = rgba(g, 0.35);
        for (let q = 0; q < 4; q++) ctx.fillRect(x0 + bw * (0.15 + rng.next() * 0.7), rng.next() * s.h * 0.9, hair(s, 0.0025), s.h * (0.06 + rng.next() * 0.25));
      }
    } else if (style === 'horizon') {
      // horizontal bands from the floor up, each a little thinner than the one below, alternating stripe and ground
      let y = s.h, h = w, k = 0;
      while (y > 0 && h > 0.006) {
        if (k % 2 === 0) { ctx.fillStyle = A; ctx.fillRect(0, y - h, s.w, h); }
        else if (k % 4 === 1) { ctx.fillStyle = rgba(B, 0.8); ctx.fillRect(0, y - h * 0.3, s.w, hair(s, 0.003)); }
        y -= h; h *= 0.9; k++;
      }
    } else if (style === 'chalk') {
      const lw = num(s, 'line');
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * p;
        for (let q = 3; q >= 0; q--) {
          ctx.globalAlpha = 0.17 + (3 - q) * 0.1;
          bar(x - lw / 2 - q * lw * 0.45, lw + q * lw * 0.9, A);
        }
      }
      ctx.globalAlpha = 1;
    } else if (style === 'diagonal') {
      // 45 degree bands: the horizontal pitch p divides the repeat, so the slope wraps seamlessly
      const bw = p * 0.5;
      for (let i = -Math.ceil(s.h / p) - 1; i <= n; i++) {
        const x = i * p;
        poly(ctx, [[x, s.h], [x + bw, s.h], [x + bw + s.h, 0], [x + s.h, 0]], A);
        ctx.fillStyle = rgba(B, 0.55);
        poly(ctx, [[x + bw, s.h], [x + bw + hair(s, 0.003), s.h], [x + bw + hair(s, 0.003) + s.h, 0], [x + bw + s.h, 0]], rgba(B, 0.55));
      }
    } else {
      // ikat: resist-dyed warp threads leave feathered, jagged edges
      const seg = 0.018;
      const rows = Math.ceil(s.h / seg);
      for (let i = 0; i < n; i++) {
        const c = i % 2 === 0 ? A : B;
        const x0 = i * p + p * 0.18, bw = p * 0.5;
        const rng = rngFor(s.seed, 67, i);
        let off = 0;
        for (let j = 0; j < rows; j++) {
          off += (rng.next() - 0.5) * p * 0.05; off *= 0.8;
          for (const [grow, al] of [[0.1, 0.25], [0.04, 0.4], [0, 1]] as const) {
            ctx.globalAlpha = 0.92 * al;
            ctx.fillStyle = c;
            ctx.fillRect(x0 + off - p * grow, j * seg, bw + p * grow * 2, seg + 0.001);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

const CHECK_STYLES = ['houndstooth', 'glen', 'windowpane', 'tattersall', 'harlequin', 'checkerboard', 'crossstitch', 'madras'] as const;

const checkFine: PainterDef = {
  id: 'check-fine',
  surface: 'wall',
  description: 'Checks on a fabric ground: houndstooth, glen plaid, windowpane, tattersall, harlequin, checkerboard, cross-stitch gingham and madras.',
  colors: ['ground', 'check', 'accent', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    ...GROUND_PARAMS,
    style: { type: 'enum', values: CHECK_STYLES, default: 'houndstooth', doc: 'Check type.' },
    size: { type: 'number', min: 0.01, max: 0.5, default: 0.1, doc: 'Check size (m): the houndstooth unit, a pane, a square or a diamond width.' },
    line: { type: 'number', min: 0.001, max: 0.03, default: 0.004, doc: 'Line weight (m) for windowpane, tattersall and overchecks.' },
  },
  thumbSpan: 0.8,
  paint(ctx, s) {
    paintGround(ctx, s);
    const g = col(s, 0), A = col(s, 1), B = col(s, 2);
    const style = str(s, 'style');
    const size = num(s, 'size');
    const lw = hair(s, num(s, 'line'));
    // cell-built checks stay opaque (overlapping cell edges would show as a grid at partial alpha)
    ctx.globalAlpha = ['houndstooth', 'glen', 'checkerboard', 'crossstitch'].includes(style) ? 1 : 0.92;
    const hounds = (unit: number, dark: string, light: string) => {
      const n = fitCount(s.w, unit * 8);
      const u = s.w / (n * 8);
      const rows = Math.ceil(s.h / u);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < n * 8; i++) {
          // 2/2 twill over a 4 dark / 4 light warp and weft
          const warp = (i + j) % 4 < 2;
          const dk = warp ? i % 8 < 4 : j % 8 < 4;
          ctx.fillStyle = dk ? dark : light;
          ctx.fillRect(i * u, s.h - (j + 1) * u, u + 0.0006, u + 0.0006);
        }
      }
    };
    if (style === 'houndstooth') hounds(size / 4, A, g);
    else if (style === 'glen') {
      hounds(size / 8, mix(A, g, 0.2), g);
      const n = fitCount(s.w, size * 3);
      const p = s.w / n;
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = B;
        ctx.fillRect(i * p + p * 0.3, 0, lw, s.h);
        ctx.fillStyle = rgba(A, 0.7);
        ctx.fillRect(i * p + p * 0.62, 0, lw * 2.4, s.h);
      }
      for (let y = s.h; y > -p; y -= p) {
        ctx.fillStyle = B; ctx.fillRect(0, y - p * 0.3, s.w, lw);
        ctx.fillStyle = rgba(A, 0.7); ctx.fillRect(0, y - p * 0.62, s.w, lw * 2.4);
      }
    } else if (style === 'windowpane') {
      const n = fitCount(s.w, size);
      const p = s.w / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = A;
        ctx.fillRect(i * p + p / 2 - lw / 2, 0, lw, s.h);
        ctx.fillStyle = rgba(B, 0.6);
        ctx.fillRect(i * p + p / 2 + lw * 2.2, 0, lw * 0.5, s.h);
      }
      for (let y = s.h; y > -p; y -= p) {
        ctx.fillStyle = A; ctx.fillRect(0, y - p / 2 - lw / 2, s.w, lw);
        ctx.fillStyle = rgba(B, 0.6); ctx.fillRect(0, y - p / 2 + lw * 2.2, s.w, lw * 0.5);
      }
    } else if (style === 'tattersall') {
      const n = fitCount(s.w, size * 2, 1);
      const p = s.w / (n * 2);
      for (let i = 0; i < n * 2; i++) { ctx.fillStyle = i % 2 ? B : A; ctx.fillRect(i * p + p / 2 - lw / 2, 0, lw, s.h); }
      let k = 0;
      for (let y = s.h - p / 2; y > -p; y -= p, k++) { ctx.fillStyle = k % 2 ? B : A; ctx.fillRect(0, y - lw / 2, s.w, lw); }
    } else if (style === 'harlequin') {
      const n = fitCount(s.w, size);
      const hw = s.w / n / 2, hh = hw * 1.5;
      const rows = Math.ceil(s.h / hh) + 2;
      for (let j = -1; j < rows * 2; j++) {
        for (let i = -1; i <= n * 2 + 1; i++) {
          if (((i + j) % 2 + 2) % 2 !== 0) continue;
          const cx = i * hw, cy = s.h - j * hh;
          const dark = ((i % 2) + 2) % 2 === 0;
          poly(ctx, [[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]], dark ? A : g);
        }
      }
      strokeW(ctx, s, rgba(B, 0.85), 0.0035);
      ctx.beginPath();
      for (let j = -1; j < rows * 2; j++) {
        for (let i = -1; i <= n * 2 + 1; i++) {
          if (((i + j) % 2 + 2) % 2 !== 0) continue;
          const cx = i * hw, cy = s.h - j * hh;
          ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.lineTo(cx, cy - hh);
        }
      }
      ctx.stroke();
    } else if (style === 'checkerboard') {
      const n = fitCount(s.w, size * 2, 1);
      const c = s.w / (n * 2);
      const rows = Math.ceil(s.h / c);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < n * 2; i++) {
          const y = s.h - (j + 1) * c;
          const dark = (i + j) % 2 === 0;
          const v = (cellRand(s, 71, i, n * 2, j) - 0.5) * 0.06; // each square a touch different, like painted
          ctx.fillStyle = shade(dark ? A : mix(g, B, 0.1), v);
          ctx.fillRect(i * c, y, c + 0.0006, c + 0.0006);
        }
      }
      strokeW(ctx, s, rgba(shade(A, -0.4), 0.18), 0.002);
      ctx.beginPath();
      for (let i = 0; i < n * 2; i++) { ctx.moveTo(i * c, 0); ctx.lineTo(i * c, s.h); }
      for (let y = s.h; y > 0; y -= c) { ctx.moveTo(0, y); ctx.lineTo(s.w, y); }
      ctx.stroke();
    } else if (style === 'crossstitch') {
      const n = fitCount(s.w, size * 2, 1);
      const c = s.w / (n * 2);
      const half = mix(g, A, 0.5);
      const rows: number[] = [];
      for (let y = s.h - c; y > -c; y -= c * 2) rows.push(y);
      ctx.fillStyle = half;
      for (let i = 0; i < n; i++) ctx.fillRect(i * 2 * c + c / 2, 0, c, s.h);
      for (const y of rows) ctx.fillRect(0, y, s.w, c);
      ctx.fillStyle = A;
      for (let i = 0; i < n; i++) for (const y of rows) ctx.fillRect(i * 2 * c + c / 2, y, c, c);
      // embroidered X stitches in the plain squares
      strokeW(ctx, s, B, c * 0.07);
      ctx.lineCap = 'round';
      ctx.beginPath();
      // plain squares: columns that are ground (odd band columns) crossing ground rows
      for (let i = 0; i <= n; i++) {
        const cx = i * 2 * c;
        for (let y = s.h - 2 * c; y > -c; y -= c * 2) {
          const k = c * 0.28, cy = y + c / 2;
          ctx.moveTo(cx - k, cy - k); ctx.lineTo(cx + k, cy + k);
          ctx.moveTo(cx + k, cy - k); ctx.lineTo(cx - k, cy + k);
        }
      }
      ctx.stroke();
    } else {
      // madras: translucent, bleeding bands of three colours crossing at irregular widths
      const n = fitCount(s.w, size * 3);
      const p = s.w / n;
      const set: Array<[number, number, string]> = [
        [0.04, 0.18, A], [0.3, 0.07, B], [0.42, 0.22, mix(A, B, 0.5)], [0.72, 0.05, B], [0.82, 0.12, A],
      ];
      for (let pass = 0; pass < 2; pass++) {
        for (const [f, fw, c] of set) {
          for (const [grow, al] of [[1.5, 0.12], [1, 0.3], [0.5, 0.55]] as const) {
            ctx.globalAlpha = al * 0.95;
            ctx.fillStyle = c;
            if (pass === 0) for (let i = 0; i < n; i++) ctx.fillRect(i * p + (f - fw * (grow - 1) * 0.5) * p, 0, fw * p * grow, s.h);
            else for (let y = s.h; y > -p; y -= p) ctx.fillRect(0, y - (f + fw * (1 + (grow - 1) * 0.5)) * p, s.w, fw * p * grow);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Contemporary geometrics
// ---------------------------------------------------------------------------------------------

const GEO_STYLES = [
  'honeycomb', 'facets', 'arches', 'argyle', 'ogee', 'basketweave', 'stars', 'venn', 'waves', 'bullseye', 'terrazzo',
  'memphis', 'colourblock', 'halftone', 'key', 'truchet', 'graph', 'plus', 'capsule',
] as const;

/** Closed ogee (onion) outline centred on (cx, cy): tips top and bottom, widest at the sides. */
function ogeePath(ctx: Canvas2DLike, cx: number, cy: number, hw: number, hh: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  for (const sx of [1, -1]) {
    // top tip -> belly -> bottom tip on one side, mirrored for the other
    const a = sx;
    if (sx === 1) {
      ctx.bezierCurveTo(cx + a * hw * 0.55, cy - hh * 0.85, cx + a * hw, cy - hh * 0.5, cx + a * hw, cy);
      ctx.bezierCurveTo(cx + a * hw, cy + hh * 0.5, cx + a * hw * 0.55, cy + hh * 0.85, cx, cy + hh);
    } else {
      ctx.bezierCurveTo(cx + a * hw * 0.55, cy + hh * 0.85, cx + a * hw, cy + hh * 0.5, cx + a * hw, cy);
      ctx.bezierCurveTo(cx + a * hw, cy - hh * 0.5, cx + a * hw * 0.55, cy - hh * 0.85, cx, cy - hh);
    }
  }
  ctx.closePath();
}

const geoPro: PainterDef = {
  id: 'geo-pro',
  surface: 'wall',
  description: 'Contemporary geometric wallcoverings: honeycomb, facets, arches, argyle, ogee, basketweave, star lattice, circle lattice, waves, bullseyes, terrazzo, memphis confetti, colour blocks, halftone, key meander, truchet quarter circles, graph paper, plus signs and capsules.',
  colors: ['ground', 'motifA', 'motifB', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    ...GROUND_PARAMS,
    style: { type: 'enum', values: GEO_STYLES, default: 'honeycomb', doc: 'Geometric layout.' },
    size: { type: 'number', min: 0.05, max: 0.8, default: 0.2, doc: 'Module width (m); rounded so whole modules fill the repeat.' },
    line: { type: 'number', min: 0.001, max: 0.04, default: 0.006, doc: 'Line weight (m) for outlined styles.' },
  },
  thumbSpan: 0.9,
  paint(ctx, s) {
    paintGround(ctx, s);
    const g = col(s, 0), A = col(s, 1), B = col(s, 2);
    const style = str(s, 'style');
    const even = ['argyle', 'basketweave', 'bullseye', 'key', 'truchet', 'plus', 'stars', 'arches', 'capsule', 'halftone', 'graph'].includes(style);
    const n = fitCount(s.w, num(s, 'size'), even ? 2 : 1, even ? 2 : 1);
    const p = s.w / n;
    const dark = shade(g, -0.14);

    if (style === 'honeycomb') {
      const R = p / Math.sqrt(3), ry = R * 1.5;
      const rows = Math.ceil(s.h / ry) + 2;
      for (let j = -1; j < rows; j++) {
        for (let i = -1; i <= n; i++) {
          const cx = (i + 0.5 + (((j % 2) + 2) % 2) * 0.5) * p, cy = s.h - j * ry;
          const t = cellRand(s, 81, i, n, j);
          const fill = t < 0.4 ? mix(g, A, 0.12) : t < 0.7 ? A : B;
          const pts: Pt[] = [];
          for (let k = 0; k < 6; k++) pts.push([cx + Math.cos(Math.PI / 6 + (k * TAU) / 6) * R * 0.94, cy + Math.sin(Math.PI / 6 + (k * TAU) / 6) * R * 0.94]);
          poly(ctx, pts, fill);
        }
      }
    } else if (style === 'facets') {
      const ht = p * 0.82;
      const rows = Math.ceil(s.h / ht) + 2;
      for (let j = -1; j < rows; j++) {
        const y = s.h - j * ht;
        for (let i = -1; i <= n; i++) {
          const x = i * p + (((j % 2) + 2) % 2) * (p / 2);
          const tri = (pts: Pt[], tag: number) => {
            const t = cellRand(s, 83 + tag, i, n, j);
            const base = t < 0.35 ? g : t < 0.7 ? A : B;
            poly(ctx, pts, shade(base, (cellRand(s, 89 + tag, i, n, j) - 0.5) * 0.2));
          };
          tri([[x, y], [x + p, y], [x + p / 2, y - ht]], 0);
          tri([[x + p / 2, y - ht], [x + (3 * p) / 2, y - ht], [x + p, y]], 1);
        }
      }
    } else if (style === 'arches') {
      const r = p / 2, ry = r * 1.15;
      const rows = Math.ceil(s.h / ry) + 2;
      for (let j = -1; j < rows; j++) {
        for (let i = -1; i <= n; i++) {
          const cx = (i + 0.5 + (((j % 2) + 2) % 2) * 0.5) * p, cy = s.h - j * ry;
          [[0.92, A], [0.7, g], [0.5, B], [0.28, g]].forEach(([k, c], q) => {
            ctx.fillStyle = c as string;
            ctx.beginPath();
            ctx.arc(cx, cy, r * (k as number), Math.PI, TAU);
            ctx.closePath();
            ctx.fill();
            void q;
          });
        }
      }
    } else if (style === 'argyle') {
      const hw = p / 2, hh = hw * 1.5;
      const rows = Math.ceil(s.h / hh) + 2;
      for (let j = -1; j < rows * 2; j++) {
        for (let i = -1; i <= n * 2 + 1; i++) {
          if (((i + j) % 2 + 2) % 2 !== 0) continue;
          const cx = i * hw, cy = s.h - j * hh;
          const m = ((i % 4) + 4) % 4;
          poly(ctx, [[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]], m === 0 ? A : m === 2 ? B : g);
        }
      }
      // stitched diagonal overlines through the diamond centres
      strokeW(ctx, s, rgba(shade(g, 0.6), 0.9), 0.0035);
      ctx.beginPath();
      for (let j = -2; j < rows * 2 + 2; j++) {
        for (let i = -2; i <= n * 2 + 2; i++) {
          if (((i + j) % 2 + 2) % 2 !== 0 || ((i % 2) + 2) % 2 !== 1) continue;
          const cx = i * hw, cy = s.h - j * hh;
          ctx.moveTo(cx - hw, cy - hh); ctx.lineTo(cx + hw, cy + hh);
          ctx.moveTo(cx + hw, cy - hh); ctx.lineTo(cx - hw, cy + hh);
        }
      }
      ctx.stroke();
    } else if (style === 'ogee') {
      const hw = p * 0.4, hh = p * 0.64, rowStep = p * 0.72;
      const rows = Math.ceil(s.h / rowStep) + 2;
      for (let j = -1; j < rows; j++) {
        for (let i = -1; i <= n; i++) {
          const cx = (i + (((j % 2) + 2) % 2) * 0.5) * p + (j % 2 === 0 ? 0 : 0), cy = s.h - j * rowStep;
          ogeePath(ctx, cx, cy, hw, hh);
          ctx.fillStyle = ((i + j) % 2 + 2) % 2 === 0 ? A : B;
          ctx.fill();
          ogeePath(ctx, cx, cy, hw * 0.6, hh * 0.6);
          ctx.fillStyle = g;
          ctx.fill();
          ogeePath(ctx, cx, cy, hw * 0.26, hh * 0.26);
          ctx.fillStyle = ((i + j) % 2 + 2) % 2 === 0 ? B : A;
          ctx.fill();
        }
      }
    } else if (style === 'basketweave') {
      const c = p / 2;
      const rows = Math.ceil(s.h / c) + 1;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < n * 2; i++) {
          const x = i * c, y = s.h - (j + 1) * c;
          const horiz = (i + j) % 2 === 0;
          const slot = c / 4;
          for (let k = 0; k < 4; k++) {
            ctx.fillStyle = horiz ? A : B;
            if (horiz) ctx.fillRect(x + c * 0.04, y + k * slot + slot * 0.12, c * 0.92, slot * 0.76);
            else ctx.fillRect(x + k * slot + slot * 0.12, y + c * 0.04, slot * 0.76, c * 0.92);
          }
        }
      }
    } else if (style === 'stars') {
      const rows = Math.ceil(s.h / p) + 2;
      const r = p * 0.34;
      for (let j = -1; j < rows; j++) {
        for (let i = 0; i < n; i++) {
          const cx = (i + 0.5) * p, cy = s.h - (j + 0.5) * p;
          const sq = (rad: number, rot: number): Pt[] => [0, 1, 2, 3].map((k) => [cx + Math.cos(rot + (k * TAU) / 4) * rad, cy + Math.sin(rot + (k * TAU) / 4) * rad] as Pt);
          poly(ctx, sq(r, Math.PI / 4), A);
          poly(ctx, sq(r, 0), A);
          poly(ctx, sq(r * 0.52, Math.PI / 4), g);
          poly(ctx, sq(r * 0.28, 0), B);
          disc(ctx, cx + p / 2 > s.w ? cx - p / 2 : cx + p / 2, cy - p / 2, p * 0.06, B);
        }
      }
    } else if (style === 'venn') {
      const rowH = p * 0.866;
      const rows = Math.ceil(s.h / rowH) + 3;
      strokeW(ctx, s, A, num(s, 'line'));
      ctx.beginPath();
      for (let j = -2; j < rows; j++) {
        for (let i = -1; i <= n + 1; i++) {
          const cx = (i + (((j % 2) + 2) % 2) * 0.5) * p, cy = s.h - j * rowH;
          ctx.moveTo(cx + p, cy);
          ctx.arc(cx, cy, p, 0, TAU);
        }
      }
      ctx.stroke();
      for (let j = -1; j < rows; j++) for (let i = -1; i <= n; i++) disc(ctx, (i + (((j % 2) + 2) % 2) * 0.5) * p, s.h - j * rowH, p * 0.07, B);
    } else if (style === 'waves') {
      const amp = p * 0.22, bandH = p * 0.34;
      const bands = Math.ceil((s.h + amp * 2) / bandH) + 2;
      const steps = 40 * n;
      for (let k = 0; k < bands; k++) {
        const base = s.h - k * bandH;
        ctx.fillStyle = [A, g, B, g][k % 4]!;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let q = 0; q <= steps; q++) {
          const x = (q / steps) * s.w;
          ctx.lineTo(x, base - amp * Math.sin((q / steps) * TAU * n + k * 0.5));
        }
        ctx.lineTo(s.w, 0);
        ctx.closePath();
        ctx.fill();
      }
    } else if (style === 'bullseye') {
      const rows = Math.ceil(s.h / (p * 0.9)) + 2;
      for (let j = -1; j < rows; j++) {
        for (let i = -1; i <= n; i++) {
          const cx = (i + 0.5 + (((j % 2) + 2) % 2) * 0.5) * p, cy = s.h - j * p * 0.9;
          [[0.46, A], [0.38, g], [0.28, B], [0.18, g], [0.08, A]].forEach(([k, c]) => disc(ctx, cx, cy, p * (k as number), c as string));
        }
      }
    } else if (style === 'terrazzo') {
      const area = s.w * s.h;
      const count = Math.round((area / (p * p)) * 9);
      const rng = rngFor(s.seed, 91);
      const chips: Array<{ x: number; y: number; r: number }> = [];
      const tones = [A, B, shade(A, 0.3), shade(g, -0.18), mix(A, B, 0.5), shade(B, -0.25)];
      for (let t = 0; t < count * 6 && chips.length < count; t++) {
        const r = p * (0.05 + Math.pow(rng.next(), 2) * 0.16);
        const x = rng.next() * s.w, y = rng.next() * s.h;
        let ok = true;
        for (const c of chips) {
          let dx = Math.abs(c.x - x); dx = Math.min(dx, s.w - dx);
          if (Math.hypot(dx, c.y - y) < (c.r + r) * 1.25 + p * 0.03) { ok = false; break; }
        }
        if (!ok) continue;
        chips.push({ x, y, r });
        const nv = 5 + Math.floor(rng.next() * 3);
        const rot = rng.next() * TAU;
        const pts: Pt[] = [];
        for (let k = 0; k < nv; k++) {
          const a = rot + (k * TAU) / nv + (rng.next() - 0.5) * 0.7;
          const rr = r * (0.65 + rng.next() * 0.5);
          pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85]);
        }
        const c = tones[Math.floor(rng.next() * tones.length)]!;
        drawWrapped(ctx, s, x - r * 1.3, y - r * 1.3, x + r * 1.3, y + r * 1.3, () => poly(ctx, pts, c));
      }
    } else if (style === 'memphis') {
      const cell = p * 0.5;
      const cols = Math.round(s.w / cell);
      const c = s.w / cols;
      const rows = Math.ceil(s.h / c) + 1;
      const tones = [A, B, shade(A, -0.25), shade(g, -0.3), shade(B, 0.35)];
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const rng = rngFor(s.seed, 97, i, j + 512);
          const kind = Math.floor(rng.next() * 6);
          const col2 = tones[Math.floor(rng.next() * tones.length)]!;
          const cx = (i + 0.3 + rng.next() * 0.4) * c, cy = s.h - (j + 0.3 + rng.next() * 0.4) * c;
          const r = c * (0.22 + rng.next() * 0.12), rot = rng.next() * TAU;
          drawWrapped(ctx, s, cx - c, cy - c, cx + c, cy + c, () => {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rot);
            if (kind === 0) disc(ctx, 0, 0, r * 0.7, col2);
            else if (kind === 1) poly(ctx, [[0, -r], [r * 0.9, r * 0.7], [-r * 0.9, r * 0.7]], col2);
            else if (kind === 2) { strokeW(ctx, s, col2, r * 0.28); ctx.beginPath(); for (let q = 0; q <= 24; q++) { const x = -r + (q / 24) * r * 2, y = Math.sin((q / 24) * TAU * 1.5) * r * 0.45; if (q === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); }
            else if (kind === 3) { ctx.fillStyle = col2; ctx.fillRect(-r * 0.2, -r, r * 0.4, r * 2); ctx.fillRect(-r, -r * 0.2, r * 2, r * 0.4); }
            else if (kind === 4) { ctx.fillStyle = col2; ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, TAU); ctx.closePath(); ctx.fill(); }
            else { strokeW(ctx, s, col2, r * 0.22); ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, TAU); ctx.stroke(); }
            ctx.restore();
          });
        }
      }
    } else if (style === 'colourblock') {
      const tones = [A, B, mix(A, g, 0.5), mix(B, g, 0.5), shade(g, -0.1), shade(A, -0.2)];
      // columns of uneven width, each cut into blocks of uneven height; the whole repeat is covered
      const colsN = Math.max(3, n * 2);
      const rng = rngFor(s.seed, 101);
      const widths = Array.from({ length: colsN }, () => 0.6 + rng.next());
      const total = widths.reduce((a, b) => a + b, 0);
      let x = 0;
      for (let i = 0; i < colsN; i++) {
        const cw = (widths[i]! / total) * s.w;
        let y = s.h;
        while (y > 0) {
          const bh = p * (0.5 + rng.next() * 1.4);
          const c = rng.next() < 0.3 ? g : tones[Math.floor(rng.next() * tones.length)]!;
          ctx.fillStyle = c;
          ctx.fillRect(x, y - bh, cw, bh);
          y -= bh;
        }
        x += cw;
      }
    } else if (style === 'halftone') {
      const c = p / 3;
      const cols = Math.round(s.w / c);
      const cw = s.w / cols;
      const rows = Math.ceil(s.h / cw);
      for (let j = 0; j < rows; j++) {
        const t = 1 - (j + 0.5) / rows; // 1 at the floor
        for (let i = 0; i < cols; i++) {
          const off = j % 2 ? cw / 2 : 0;
          disc(ctx, (i + 0.5) * cw + off, s.h - (j + 0.5) * cw, cw * 0.52 * Math.pow(t, 0.9), t > 0.5 ? A : B);
        }
      }
    } else if (style === 'key') {
      const u = p / 7;
      strokeW(ctx, s, A, u * 0.8);
      ctx.lineJoin = 'miter';
      ctx.lineCap = 'butt';
      const rows = Math.ceil(s.h / p) + 1;
      for (let j = -1; j < rows; j++) {
        for (let i = 0; i < n; i++) {
          const flip = i % 2 === 1;
          const x0 = i * p, y0 = s.h - (j + 1) * p;
          const path: Pt[] = [[0.5, 7], [0.5, 0.5], [6.5, 0.5], [6.5, 5.5], [2.5, 5.5], [2.5, 2.5], [4.5, 2.5], [4.5, 3.8]];
          ctx.beginPath();
          path.forEach(([px, py], q) => {
            const X = x0 + (flip ? 7 - px : px) * u, Y = y0 + py * u;
            if (q === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
          });
          ctx.stroke();
          disc(ctx, x0 + (flip ? 7 - 4.5 : 4.5) * u, y0 + 3.9 * u, u * 0.55, B);
        }
      }
    } else if (style === 'truchet') {
      const c = p / 2;
      const rows = Math.ceil(s.h / c) + 1;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < n * 2; i++) {
          const x = i * c, y = s.h - (j + 1) * c;
          const t = cellRand(s, 103, i, n * 2, j);
          const q = Math.floor(t * 4);
          const cx = x + (q % 2 === 0 ? 0 : c), cy = y + (q < 2 ? 0 : c);
          const ox = x + (q % 2 === 0 ? c : 0), oy = y + (q < 2 ? c : 0);
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, c + 0.0006, c + 0.0006);
          ctx.clip();
          disc(ctx, cx, cy, c, A);
          disc(ctx, cx, cy, c * 0.55, g);
          disc(ctx, ox, oy, c * 0.5, B);
          ctx.restore();
        }
      }
    } else if (style === 'graph') {
      const minor = p / 5;
      ctx.globalAlpha = 0.5;
      strokeW(ctx, s, A, 0.0012);
      ctx.beginPath();
      for (let i = 0; i < n * 5; i++) if (i % 5) { ctx.moveTo(i * minor, 0); ctx.lineTo(i * minor, s.h); }
      for (let k = 1; s.h - k * minor > 0; k++) if (k % 5) { ctx.moveTo(0, s.h - k * minor); ctx.lineTo(s.w, s.h - k * minor); }
      ctx.stroke();
      ctx.globalAlpha = 0.9;
      strokeW(ctx, s, A, 0.0028);
      ctx.beginPath();
      for (let i = 0; i < n; i++) { ctx.moveTo(i * p + 0.0015, 0); ctx.lineTo(i * p + 0.0015, s.h); }
      for (let k = 1; s.h - k * p > 0; k++) { ctx.moveTo(0, s.h - k * p); ctx.lineTo(s.w, s.h - k * p); }
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (let k = 1; s.h - k * p > 0; k++) for (let i = 0; i < n; i++) disc(ctx, i * p + 0.0015, s.h - k * p, p * 0.035, B);
    } else if (style === 'plus') {
      const rows = Math.ceil(s.h / (p * 0.5)) + 2;
      const r = p * 0.2;
      for (let j = -1; j < rows; j++) {
        for (let i = 0; i < n; i++) {
          const cx = (i + 0.25 + (j % 2 ? 0.5 : 0)) * p, cy = s.h - j * p * 0.5;
          const c = j % 2 ? B : A;
          drawWrapped(ctx, s, cx - r, cy - r, cx + r, cy + r, () => {
            ctx.fillStyle = c;
            ctx.fillRect(cx - r * 0.2, cy - r, r * 0.4, r * 2);
            ctx.fillRect(cx - r, cy - r * 0.2, r * 2, r * 0.4);
          });
          disc(ctx, cx + p * 0.5 > s.w ? cx - p / 2 : cx + p / 2, cy, p * 0.03, dark);
        }
      }
    } else {
      // capsule: stacked pills, every row shifted half a pill
      const ph = p * 0.3, rows = Math.ceil(s.h / (ph * 1.15)) + 2;
      for (let j = -1; j < rows; j++) {
        for (let i = -1; i <= n; i++) {
          const cx = (i + (((j % 2) + 2) % 2) * 0.5 + 0.5) * p, cy = s.h - j * ph * 1.15;
          const t = cellRand(s, 107, i, n, j);
          const c = t < 0.45 ? A : t < 0.75 ? B : mix(g, A, 0.2);
          ctx.fillStyle = c;
          ctx.beginPath();
          const w2 = p * 0.44, r = ph / 2;
          ctx.moveTo(cx - w2 + r, cy - r);
          ctx.lineTo(cx + w2 - r, cy - r);
          ctx.arc(cx + w2 - r, cy, r, -Math.PI / 2, Math.PI / 2);
          ctx.lineTo(cx - w2 + r, cy + r);
          ctx.arc(cx - w2 + r, cy, r, Math.PI / 2, (Math.PI * 3) / 2);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.lineJoin = 'miter';
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

export const PAINTERS_WALLS_B: PainterDef[] = [stripeFine, checkFine, geoPro];
