// More floor painters (Milestone 2): parquet layouts (chevron, basket weave, tumbling cubes), encaustic
// tiles, penny rounds, gridded tiles (porcelain, quarry, brick paving), marbled linoleum, steel tread plate,
// timber decking and cobbles. Same rules as floorPainters.ts: square repeat, seamless both ways, whole periods
// per repeat, random variation keyed by position, overflow drawn again on the opposite edge.

import type { Rng } from '../../core/rng';
import { WOOD_PARAMS, drawBoard, woodColors, woodTone } from './floorPainters';
import {
  SEED_PARAM, col, drawWrapped, fitCount, hair, num, polygonPath, rgba, rngFor, roundRectPath, shade, softBlob, speckle, str,
  wrappedKey, type Canvas2DLike, type PaintSpec, type PainterDef,
} from './painterKit';

const TAU = Math.PI * 2;
const SQRT2 = Math.SQRT2;
const SQRT3 = Math.sqrt(3);

// ---------------------------------------------------------------------------------------------
// Parquet layouts
// ---------------------------------------------------------------------------------------------

type Pt = readonly [number, number];

/** Fills a convex polygon with a wood board whose grain runs at `angle`, then rules its edges with the seam colour. */
function woodPolygon(
  ctx: Canvas2DLike, s: PaintSpec, rng: Rng, pts: readonly Pt[], angle: number, tone: string,
  c: ReturnType<typeof woodColors>, grain: number, knots: number,
): void {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const reach = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy))) + 0.01;
  ctx.save();
  ctx.beginPath();
  polygonPath(ctx, pts);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.translate(-reach, -reach);
  drawBoard(ctx, s, rng, reach * 2, reach * 2, tone, c, grain, knots, false);
  ctx.restore();
  ctx.strokeStyle = rgba(c.seam, 0.9);
  ctx.lineWidth = hair(s, 0.0016);
  ctx.beginPath();
  polygonPath(ctx, pts);
  ctx.stroke();
}

const parquetSet: PainterDef = {
  id: 'parquet-set',
  surface: 'floor',
  description: 'Wood parquet layouts built from whole boards: chevron (mitred V boards), basket weave (alternating board squares) and tumbling cubes (three-tone rhombi).',
  colors: ['base', 'light', 'dark', 'seam'],
  params: {
    seed: SEED_PARAM,
    layout: { type: 'enum', values: ['chevron', 'basket', 'cubes'], default: 'chevron', doc: 'Parquet layout.' },
    block: { type: 'number', min: 0.1, max: 1, default: 0.5, doc: 'Chevron: width of one V; basket: square side; cubes: cube width (m).' },
    ...WOOD_PARAMS,
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    const c = woodColors(s);
    ctx.fillStyle = c.seam;
    ctx.fillRect(0, 0, s.w, s.h);
    const layout = str(s, 'layout');
    const block = num(s, 'block');
    const grain = num(s, 'grain'), knots = num(s, 'knots') * 0.3, variation = num(s, 'variation');
    if (layout === 'basket') {
      const n = fitCount(s.w, block, 2, 2);
      const S = s.w / n;
      const k = Math.max(2, Math.round(S / 0.05));
      const wb = S / k;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const horizontal = (i + j) % 2 === 0;
          for (let q = 0; q < k; q++) {
            const rng = rngFor(s.seed, i, j, q);
            const tone = woodTone(rng, c, variation);
            ctx.save();
            if (horizontal) ctx.translate(i * S, j * S + q * wb);
            else { ctx.translate(i * S + q * wb, j * S); ctx.rotate(Math.PI / 2); ctx.translate(0, -wb); }
            drawBoard(ctx, s, rng, S, wb, tone, c, grain, knots, false);
            ctx.restore();
          }
        }
      }
      return;
    }
    if (layout === 'cubes') {
      const n = fitCount(s.w, block, 1);
      const r = s.w / (n * SQRT3);
      const m = fitCount(s.h, 1.5 * r, 2, 2);
      const ry = s.h / m;
      const hy = ry / 1.5, hw = (SQRT3 * r) / 2;
      for (let j = 0; j < m; j++) {
        for (let i = 0; i < n; i++) {
          const cx = (i + 0.5 + (((j % 2) + 2) % 2) * 0.5) * SQRT3 * r, cy = j * ry + hy;
          const faces: Array<{ pts: Pt[]; angle: number; shadeBy: number }> = [
            { pts: [[cx, cy], [cx - hw, cy - hy / 2], [cx, cy - hy], [cx + hw, cy - hy / 2]], angle: Math.atan2(hy / 2, hw), shadeBy: 1 },
            { pts: [[cx, cy], [cx - hw, cy - hy / 2], [cx - hw, cy + hy / 2], [cx, cy + hy]], angle: Math.PI / 2, shadeBy: 0 },
            { pts: [[cx, cy], [cx + hw, cy - hy / 2], [cx + hw, cy + hy / 2], [cx, cy + hy]], angle: Math.atan2(-hy / 2, hw), shadeBy: -1 },
          ];
          // wrapped key: every copy of the cube shares one random sequence
          const key = wrappedKey(s, cx, cy);
          drawWrapped(ctx, s, cx - hw, cy - hy, cx + hw, cy + hy, () => {
            faces.forEach((f, q) => {
              const rng = rngFor(s.seed, key, q);
              const base = f.shadeBy > 0 ? c.light : f.shadeBy < 0 ? c.dark : c.base;
              woodPolygon(ctx, s, rng, f.pts, f.angle, woodTone(rng, { ...c, base }, variation * 0.5), c, grain, knots);
            });
          });
        }
      }
      return;
    }
    // chevron: V boards with 45-degree mitres; the V's apex points down
    const n = fitCount(s.w, block, 1);
    const bx = s.w / (2 * n);
    const m = fitCount(s.h, 0.075 * SQRT2, 2);
    const vw = s.h / m;
    for (let k = 0; k < m; k++) {
      for (let i = 0; i < n; i++) {
        const cx = (2 * i + 1) * bx, ya = (k + 1) * vw;
        for (const side of [-1, 1]) {
          const x1 = cx + side * bx;
          const pts: Pt[] = [[cx, ya], [x1, ya - bx], [x1, ya - bx - vw], [cx, ya - vw]];
          const rng = rngFor(s.seed, i, k, side + 2);
          const tone = woodTone(rng, c, variation);
          const x0 = Math.min(cx, x1);
          drawWrapped(ctx, s, x0, ya - bx - vw, x0 + bx, ya, () => woodPolygon(ctx, s, rng, pts, side < 0 ? Math.PI * 1.25 : -Math.PI / 4, tone, c, grain, knots));
        }
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Encaustic tile
// ---------------------------------------------------------------------------------------------

function encausticMotif(ctx: Canvas2DLike, x: number, y: number, t: number, ground: string, a: string, b: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, t, t);
  ctx.clip();
  ctx.fillStyle = ground;
  ctx.fillRect(x, y, t, t);
  // framed border
  ctx.strokeStyle = a;
  ctx.lineWidth = t * 0.035;
  ctx.beginPath();
  ctx.rect(x + t * 0.07, y + t * 0.07, t * 0.86, t * 0.86);
  ctx.stroke();
  // quarter circles in two opposite corners, small rings in the others
  const corners: Array<[number, number, boolean]> = [[0, 0, true], [1, 1, true], [1, 0, false], [0, 1, false]];
  for (const [fx, fy, big] of corners) {
    ctx.fillStyle = big ? b : a;
    ctx.beginPath();
    ctx.arc(x + fx * t, y + fy * t, t * (big ? 0.3 : 0.17), 0, TAU);
    ctx.fill();
    if (big) {
      ctx.fillStyle = ground;
      ctx.beginPath();
      ctx.arc(x + fx * t, y + fy * t, t * 0.19, 0, TAU);
      ctx.fill();
    }
  }
  // centre: diamond within diamond, with a boss
  const cx = x + t / 2, cy = y + t / 2;
  for (const [r, c] of [[0.31, a], [0.22, ground], [0.13, b]] as const) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(cx, cy - t * r);
    ctx.lineTo(cx + t * r, cy);
    ctx.lineTo(cx, cy + t * r);
    ctx.lineTo(cx - t * r, cy);
    ctx.closePath();
    ctx.fill();
  }
  // petals on the edge midpoints
  ctx.fillStyle = b;
  for (const [fx, fy] of [[0.5, 0.13], [0.87, 0.5], [0.5, 0.87], [0.13, 0.5]] as const) {
    ctx.beginPath();
    ctx.ellipse(x + fx * t, y + fy * t, t * 0.05, t * 0.085, fx === 0.5 ? 0 : Math.PI / 2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

const encaustic: PainterDef = {
  id: 'encaustic',
  surface: 'floor',
  description: 'Victorian encaustic tiles: a framed medallion with quarter-circle corners, laid with every second tile turned a quarter so a larger pattern appears.',
  colors: ['ground', 'accent', 'accent2', 'grout'],
  params: {
    seed: SEED_PARAM,
    tile: { type: 'number', min: 0.1, max: 0.4, default: 0.2, doc: 'Tile size (m).' },
    grout: { type: 'number', min: 0.001, max: 0.006, default: 0.0025, doc: 'Grout joint (m).' },
  },
  thumbSpan: 0.8,
  paint(ctx, s) {
    ctx.fillStyle = col(s, 3);
    ctx.fillRect(0, 0, s.w, s.h);
    const n = fitCount(s.w, num(s, 'tile'), 2, 2);
    const t = s.w / n;
    const g = hair(s, num(s, 'grout'));
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        ctx.save();
        ctx.translate(i * t + t / 2, j * t + t / 2);
        ctx.rotate(((i + j) % 2) * (Math.PI / 2));
        encausticMotif(ctx, -t / 2 + g / 2, -t / 2 + g / 2, t - g, col(s, 0), col(s, 1), col(s, 2));
        ctx.restore();
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Penny rounds
// ---------------------------------------------------------------------------------------------

const pennyRound: PainterDef = {
  id: 'penny-round',
  surface: 'floor',
  description: 'Glazed round "penny" mosaic tiles packed in offset rows, with scattered accent tiles.',
  colors: ['field', 'accent', 'grout'],
  params: {
    seed: SEED_PARAM,
    size: { type: 'number', min: 0.015, max: 0.06, default: 0.03, doc: 'Tile diameter (m).' },
    accent: { type: 'number', min: 0, max: 0.5, default: 0.12, doc: 'Share of accent-coloured tiles.' },
    variation: { type: 'number', min: 0, max: 1, default: 0.4, doc: 'Tile-to-tile variation.' },
  },
  thumbSpan: 0.5,
  paint(ctx, s) {
    ctx.fillStyle = col(s, 2);
    ctx.fillRect(0, 0, s.w, s.h);
    const n = fitCount(s.w, num(s, 'size'));
    const d = s.w / n;
    const m = fitCount(s.h, (d * SQRT3) / 2, 2, 2);
    const dy = s.h / m;
    const accent = num(s, 'accent'), variation = num(s, 'variation');
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < n; i++) {
        const cx = (i + 0.5 + (j % 2) * 0.5) * d, cy = (j + 0.5) * dy;
        const rng = rngFor(s.seed, wrappedKey(s, cx, cy));
        const fill = shade(rng.next() < accent ? col(s, 1) : col(s, 0), (rng.next() - 0.5) * 0.12 * variation);
        const r = d * 0.46;
        drawWrapped(ctx, s, cx - r, cy - r, cx + r, cy + r, () => {
          ctx.fillStyle = rgba('#000000', 0.16);
          ctx.beginPath();
          ctx.arc(cx + r * 0.06, cy + r * 0.08, r, 0, TAU);
          ctx.fill();
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, TAU);
          ctx.fill();
          ctx.fillStyle = rgba('#ffffff', 0.2);
          ctx.beginPath();
          ctx.ellipse(cx - r * 0.3, cy - r * 0.32, r * 0.4, r * 0.22, -0.7, 0, TAU);
          ctx.fill();
        });
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Gridded tiles
// ---------------------------------------------------------------------------------------------

const tileGrid: PainterDef = {
  id: 'tile-grid',
  surface: 'floor',
  description: 'Rectangular tiles in stack or running bond, with a surface character: soft veined porcelain, rustic hand-made quarry, or fired brick paver.',
  colors: ['tile', 'tileAlt', 'grout'],
  params: {
    seed: SEED_PARAM,
    tileW: { type: 'number', min: 0.1, max: 0.8, default: 0.3, doc: 'Tile length (m).' },
    tileH: { type: 'number', min: 0.05, max: 0.8, default: 0.3, doc: 'Tile width (m).' },
    grout: { type: 'number', min: 0.001, max: 0.02, default: 0.004, doc: 'Grout joint (m).' },
    bond: { type: 'enum', values: ['stack', 'running'], default: 'stack', doc: 'Laying pattern.' },
    finish: { type: 'enum', values: ['porcelain', 'rustic', 'brick'], default: 'porcelain', doc: 'Surface character.' },
    variation: { type: 'number', min: 0, max: 1, default: 0.4, doc: 'Tile-to-tile variation.' },
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    ctx.fillStyle = col(s, 2);
    ctx.fillRect(0, 0, s.w, s.h);
    const running = str(s, 'bond') === 'running';
    const finish = str(s, 'finish');
    const cols = fitCount(s.w, num(s, 'tileW'));
    const rows = fitCount(s.h, num(s, 'tileH'), running ? 2 : 1, running ? 2 : 1);
    const tw = s.w / cols, th = s.h / rows;
    const g = hair(s, num(s, 'grout'));
    const variation = num(s, 'variation');
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = i * tw + (running && j % 2 ? tw / 2 : 0), y = j * th;
        const x0 = x >= s.w - 1e-9 ? x - s.w : x;
        const rng = rngFor(s.seed, i, j);
        const fill = shade(rng.next() < 0.5 ? col(s, 0) : mixTone(col(s, 0), col(s, 1), rng.next()), (rng.next() - 0.5) * 0.1 * variation);
        drawWrapped(ctx, s, x0, y, x0 + tw, y + th, () => {
          const prng = rngFor(s.seed, i, j, 9);
          const px = x0 + g / 2, py = y + g / 2, pw = tw - g, ph = th - g;
          ctx.save();
          ctx.beginPath();
          if (finish === 'rustic') roundRectPath(ctx, px, py, pw, ph, Math.min(pw, ph) * 0.06);
          else ctx.rect(px, py, pw, ph);
          ctx.clip();
          ctx.fillStyle = fill;
          ctx.fillRect(px, py, pw, ph);
          if (finish === 'porcelain') {
            // soft veining: a few long faint diagonal strokes and a glaze sheen
            ctx.strokeStyle = rgba(col(s, 1), 0.3);
            ctx.lineWidth = hair(s, 0.0025);
            for (let q = 0; q < 3; q++) {
              const sx = px + prng.next() * pw, sy = py + prng.next() * ph;
              ctx.beginPath();
              ctx.moveTo(sx, sy);
              ctx.quadraticCurveTo(sx + pw * 0.3 * (prng.next() - 0.3), sy + ph * 0.3, sx + pw * 0.4 * (prng.next() - 0.2), sy + ph * 0.6);
              ctx.stroke();
            }
            softBlob(ctx, px + pw * 0.35, py + ph * 0.3, pw * 0.4, ph * 0.18, -0.5, '#ffffff', 0.1, 4);
          } else if (finish === 'rustic') {
            for (let q = 0; q < 5; q++) {
              softBlob(ctx, px + prng.next() * pw, py + prng.next() * ph, pw * (0.15 + prng.next() * 0.3), ph * (0.15 + prng.next() * 0.3),
                prng.next() * Math.PI, prng.next() < 0.5 ? col(s, 1) : '#000000', 0.18 * variation, 4);
            }
            speckle(ctx, s, prng, 0.08, [shade(fill, -0.4), shade(fill, 0.3)], 0.45, 1.3, { x: px, y: py, w: pw, h: ph });
          } else {
            speckle(ctx, s, prng, 0.12, [shade(fill, -0.45), shade(fill, 0.25)], 0.5, 1.3, { x: px, y: py, w: pw, h: ph });
          }
          const e = Math.min(pw, ph) * 0.05;
          ctx.fillStyle = rgba('#ffffff', 0.14);
          ctx.fillRect(px, py, pw, e);
          ctx.fillRect(px, py, e, ph);
          ctx.fillStyle = rgba('#000000', 0.16);
          ctx.fillRect(px, py + ph - e, pw, e);
          ctx.fillRect(px + pw - e, py, e, ph);
          ctx.restore();
        });
      }
    }
  },
};

function mixTone(a: string, b: string, t: number): string {
  // blend towards the alternate tone by up to 60%
  const k = t * 0.6;
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k);
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('')}`;
}

// ---------------------------------------------------------------------------------------------
// Marbled linoleum
// ---------------------------------------------------------------------------------------------

const marbledLino: PainterDef = {
  id: 'marbled-lino',
  surface: 'floor',
  description: 'Marbled linoleum sheet: swirling bands of two tones through the base colour, with fine flecks.',
  colors: ['base', 'light', 'dark'],
  params: {
    seed: SEED_PARAM,
    swirl: { type: 'number', min: 0.2, max: 1, default: 0.6, doc: 'Amount and size of the swirls.' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    const base = col(s, 0), light = col(s, 1), dark = col(s, 2);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s.w, s.h);
    const rng = rngFor(s.seed, 4);
    const swirl = num(s, 'swirl');
    const count = Math.round(s.w * s.h * 26 * swirl);
    for (let i = 0; i < count; i++) {
      const x = rng.next() * s.w, y = rng.next() * s.h;
      const len = (0.12 + rng.next() * 0.3) * swirl, wid = len * (0.1 + rng.next() * 0.22);
      const rot = rng.next() * Math.PI;
      const c = rng.next() < 0.5 ? light : dark;
      const a = 0.3 + rng.next() * 0.4;
      const r = Math.max(len, wid);
      drawWrapped(ctx, s, x - r, y - r, x + r, y + r, () => {
        softBlob(ctx, x, y, len, wid, rot, c, a, 5);
        // a curved streak that follows the blob
        ctx.strokeStyle = rgba(c, a * 0.8);
        ctx.lineWidth = hair(s, wid * 0.5, 0.8);
        ctx.beginPath();
        const dx = Math.cos(rot) * len, dy = Math.sin(rot) * len;
        ctx.moveTo(x - dx, y - dy);
        ctx.quadraticCurveTo(x + dy * 0.6, y - dx * 0.6, x + dx, y + dy);
        ctx.stroke();
      });
    }
    speckle(ctx, s, rng, 0.05, [light, dark], 0.35, 1.2);
  },
};

// ---------------------------------------------------------------------------------------------
// Steel tread plate
// ---------------------------------------------------------------------------------------------

const diamondPlate: PainterDef = {
  id: 'diamond-plate',
  surface: 'floor',
  description: 'Steel tread plate: raised elongated lugs, every neighbour turned a quarter, with scuffs and wear.',
  colors: ['base', 'light', 'dark'],
  params: {
    seed: SEED_PARAM,
    lug: { type: 'number', min: 0.02, max: 0.1, default: 0.045, doc: 'Lug pitch (m).' },
    wear: { type: 'number', min: 0, max: 1, default: 0.5, doc: 'Scuffing and wear.' },
  },
  thumbSpan: 0.6,
  paint(ctx, s) {
    const base = col(s, 0), light = col(s, 1), dark = col(s, 2);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s.w, s.h);
    const n = fitCount(s.w, num(s, 'lug'), 2, 2);
    const p = s.w / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const cx = (i + 0.5) * p, cy = (j + 0.5) * p;
        const rot = (i + j) % 2 ? Math.PI / 4 : -Math.PI / 4;
        const rx = p * 0.46, ry = p * 0.12;
        drawWrapped(ctx, s, cx - rx, cy - rx, cx + rx, cy + rx, () => {
          ctx.fillStyle = rgba(dark, 0.55);
          ctx.beginPath();
          ctx.ellipse(cx + p * 0.05, cy + p * 0.07, rx, ry, rot, 0, TAU);
          ctx.fill();
          ctx.fillStyle = shade(base, 0.08);
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, rot, 0, TAU);
          ctx.fill();
          ctx.fillStyle = rgba(light, 0.6);
          ctx.beginPath();
          ctx.ellipse(cx - p * 0.02, cy - p * 0.03, rx * 0.8, ry * 0.4, rot, 0, TAU);
          ctx.fill();
        });
      }
    }
    const rng = rngFor(s.seed, 5);
    const wear = num(s, 'wear');
    speckle(ctx, s, rng, 0.06 * wear, [dark, light], 0.3, 1.3);
    for (let q = 0; q < Math.round(8 * wear); q++) {
      const x = rng.next() * s.w, y = rng.next() * s.h, len = 0.08 + rng.next() * 0.2, a = rng.next() * Math.PI;
      drawWrapped(ctx, s, x - len, y - len, x + len, y + len, () => {
        ctx.strokeStyle = rgba(rng.next() < 0.5 ? light : dark, 0.28);
        ctx.lineWidth = hair(s, 0.003);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      });
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Timber decking
// ---------------------------------------------------------------------------------------------

const decking: PainterDef = {
  id: 'decking',
  surface: 'floor',
  description: 'Garden decking: grooved boards with open gaps, butt joints on the joists and a screw at every crossing.',
  colors: ['base', 'light', 'dark', 'gap'],
  params: {
    seed: SEED_PARAM,
    board: { type: 'number', min: 0.08, max: 0.2, default: 0.14, doc: 'Board width (m).' },
    gap: { type: 'number', min: 0.004, max: 0.02, default: 0.01, doc: 'Gap between boards (m).' },
    joist: { type: 'number', min: 0.3, max: 0.8, default: 0.5, doc: 'Joist spacing (m).' },
    grain: WOOD_PARAMS.grain,
    variation: WOOD_PARAMS.variation,
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    const c = woodColors(s);
    ctx.fillStyle = c.seam;
    ctx.fillRect(0, 0, s.w, s.h);
    const rows = fitCount(s.h, num(s, 'board'));
    const bw = s.h / rows;
    const g = hair(s, num(s, 'gap'));
    const joists = fitCount(s.w, num(s, 'joist'));
    const jp = s.w / joists;
    for (let r = 0; r < rows; r++) {
      const rng = rngFor(s.seed, 500, r);
      // butt joints fall on joists: boards span 2-4 joist bays
      const bays: number[] = [];
      let rest = joists;
      while (rest > 0) {
        let b = 2 + Math.floor(rng.next() * 3);
        if (rest - b < 2 && rest - b > 0) b = rest;
        b = Math.min(b, rest);
        bays.push(b);
        rest -= b;
      }
      let bay = Math.floor(rng.next() * joists);
      bays.forEach((nb, i) => {
        const x = (bay % joists) * jp;
        const len = nb * jp;
        const x0 = x;
        const prng = rngFor(s.seed, 600, r, i);
        const tone = woodTone(prng, c, num(s, 'variation'));
        drawWrapped(ctx, s, x0, r * bw, x0 + len, r * bw + bw, () => {
          ctx.save();
          ctx.translate(x0 + g / 2, r * bw + g / 2);
          drawBoard(ctx, s, rngFor(s.seed, 700, r, i), len - g, bw - g, tone, c, num(s, 'grain'), 0.15, false);
          ctx.restore();
          // grooves along the board
          ctx.fillStyle = rgba(c.dark, 0.35);
          for (const f of [0.25, 0.4, 0.55, 0.7]) ctx.fillRect(x0 + g, r * bw + bw * f, len - 2 * g, hair(s, 0.0025));
          // screws at the joists crossing this board
          ctx.fillStyle = rgba(shade(c.dark, -0.4), 0.9);
          for (let q = 0; q <= nb; q++) {
            const sx = x0 + q * jp;
            for (const f of [0.22, 0.78]) {
              ctx.beginPath();
              ctx.arc(sx + (q === 0 ? g * 3 : q === nb ? -g * 3 : 0), r * bw + bw * f, hair(s, 0.0025, 1), 0, TAU);
              ctx.fill();
            }
          }
        });
        bay += nb;
      });
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Cobbles
// ---------------------------------------------------------------------------------------------

const cobbles: PainterDef = {
  id: 'cobbles',
  surface: 'floor',
  description: 'Rounded granite setts in offset rows with sandy joints, each with its own tone, pitting and highlight.',
  colors: ['stoneA', 'stoneB', 'stoneC', 'joint'],
  params: {
    seed: SEED_PARAM,
    size: { type: 'number', min: 0.06, max: 0.2, default: 0.11, doc: 'Sett size (m).' },
    variation: { type: 'number', min: 0, max: 1, default: 0.6, doc: 'Tone variation.' },
  },
  thumbSpan: 0.8,
  paint(ctx, s) {
    const stones = [col(s, 0), col(s, 1), col(s, 2)];
    const joint = col(s, 3);
    ctx.fillStyle = joint;
    ctx.fillRect(0, 0, s.w, s.h);
    const rng0 = rngFor(s.seed, 8);
    speckle(ctx, s, rng0, 0.05, [shade(joint, 0.2), shade(joint, -0.3)], 0.6, 1.5);
    const rows = fitCount(s.h, num(s, 'size') * 0.95, 2, 2);
    const cols = fitCount(s.w, num(s, 'size') * 1.25, 2, 2);
    const rh = s.h / rows, cw = s.w / cols;
    const variation = num(s, 'variation');
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const cx = (i + 0.5 + (j % 2) * 0.5) * cw, cy = (j + 0.5) * rh;
        const rng = rngFor(s.seed, wrappedKey(s, cx, cy));
        const fill = shade(stones[Math.floor(rng.next() * 3)] ?? joint, (rng.next() - 0.5) * 0.14 * variation);
        const rx = cw * (0.4 + rng.next() * 0.06), ry = rh * (0.4 + rng.next() * 0.06);
        const jx = (rng.next() - 0.5) * cw * 0.06, jy = (rng.next() - 0.5) * rh * 0.06;
        const rot = (rng.next() - 0.5) * 0.25;
        drawWrapped(ctx, s, cx - rx - 0.01, cy - ry - 0.01, cx + rx + 0.01, cy + ry + 0.01, () => {
          ctx.fillStyle = rgba('#000000', 0.3);
          ctx.beginPath();
          ctx.ellipse(cx + jx + rx * 0.08, cy + jy + ry * 0.12, rx, ry, rot, 0, TAU);
          ctx.fill();
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.ellipse(cx + jx, cy + jy, rx, ry, rot, 0, TAU);
          ctx.fill();
          ctx.fillStyle = rgba('#ffffff', 0.2);
          ctx.beginPath();
          ctx.ellipse(cx + jx - rx * 0.25, cy + jy - ry * 0.3, rx * 0.5, ry * 0.3, rot - 0.4, 0, TAU);
          ctx.fill();
          const prng = rngFor(s.seed, wrappedKey(s, cx, cy), 5);
          const pits = Math.round(rx * ry * s.ppm * s.ppm * 0.4);
          const d = hair(s, 0.003, 1);
          ctx.fillStyle = rgba(shade(fill, -0.45), 0.45);
          for (let q = 0; q < pits; q++) ctx.fillRect(cx + jx + (prng.next() - 0.5) * rx * 1.4, cy + jy + (prng.next() - 0.5) * ry * 1.4, d, d);
        });
      }
    }
  },
};

export const FLOOR_PAINTERS_2: readonly PainterDef[] = [
  parquetSet, encaustic, pennyRound, tileGrid, marbledLino, diamondPlate, decking, cobbles,
];
