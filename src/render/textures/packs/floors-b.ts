// Family-specific painters of surface group 'floors-b' (M10 surfaces): ceramic, porcelain, mosaic and stone floors.
//
//   tile-lay  one painter for twelve tile layouts (grid, running bond, herringbone, chevron, basketweave, hopscotch,
//             hexagon and picket, tumbling blocks, triangles, fish scale, random ashlar, crazy paving). Joints and
//             grout are always drawn here; faces are flat glaze, speckle or a tinted AI material map (marble, granite,
//             limestone, terracotta, glaze) cut at a random phase per tile so no two tiles repeat each other.
//
// Palette roles: [tile, light, dark, grout, alt, accent]. light and dark tint a material map (map 0 -> dark,
// 0.5 -> tile, 1 -> light); alt is the second tile tone (checkers, random share, cube faces) and accent the third
// (hopscotch squares, corner dots, cube faces).

import {
  SEED_PARAM, col, flag, hair, mix, num, rgba, rngFor, shade, softBlob, speckle, str,
  type Canvas2DLike, type PaintSpec, type PainterDef, type ParamSpec,
} from '../painterKit';
import { MAP_IDS, drawMapRect, surfaceMapImage } from '../mapKit';

type Pt = [number, number];
/** One tile before drawing: outline in metres, colour slot (0 tile, 1 alt, 2 accent), flags, and a repeat-stable key. */
export interface LayTile { pts: Pt[]; t: number; dot?: boolean; key: number; cx: number; cy: number }

export const LAY_LAYOUTS = [
  'grid', 'running', 'herringbone', 'chevron', 'basketweave', 'hopscotch', 'hex', 'cubes', 'triangles', 'fishscale',
  'ashlar', 'crazy',
] as const;
type Layout = (typeof LAY_LAYOUTS)[number];
const FINISHES = ['gloss', 'matt', 'handmade', 'crackle', 'speckle', 'glass', 'stone', 'terracotta'] as const;
const MODES = ['none', 'random', 'ombre', 'confetti'] as const;
const ANGLES = ['0', '45', '90'] as const;
const SQ2 = Math.SQRT2, SQ3 = Math.sqrt(3), TAU = Math.PI * 2;

const rectPts = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const areaOf = (p: readonly Pt[]): number => {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]!; a += p[i]![0] * q[1] - q[0] * p[i]![1]; }
  return a / 2;
};

/** Pulls every edge of a convex polygon inward by d (mitred); negative d grows it. */
export function insetPoly(p: readonly Pt[], d: number): Pt[] {
  const n = p.length;
  const sgn = areaOf(p) >= 0 ? 1 : -1;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = p[(i + n - 1) % n]!, b = p[i]!, c = p[(i + 1) % n]!;
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e2x = c[0] - b[0], e2y = c[1] - b[1];
    const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1;
    const n1: Pt = [-e1y / l1 * sgn, e1x / l1 * sgn], n2: Pt = [-e2y / l2 * sgn, e2x / l2 * sgn];
    const k = d / Math.max(0.35, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    out.push([b[0] + (n1[0] + n2[0]) * k, b[1] + (n1[1] + n2[1]) * k]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Layout cells (lattice based): a cell of tiles at the origin plus two lattice vectors
// ---------------------------------------------------------------------------------------------

interface Cell { tiles: Array<{ pts: Pt[]; t: number; dot?: boolean }>; b1: Pt; b2: Pt; overlap?: boolean }

function semicircle(cx: number, cy: number, r: number, steps = 14): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) { const a = (i / steps) * Math.PI; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}

export function cellFor(layout: Layout, s: PaintSpec): Cell {
  const L = num(s, 'tileW'), Wd = num(s, 'tileH');
  const checker = flag(s, 'checker');
  switch (layout) {
    case 'grid': {
      const notch = Math.min(0.45, num(s, 'notch')) * Math.min(L, Wd);
      const tiles: Cell['tiles'] = [];
      const reps = checker ? 2 : 1;
      for (let j = 0; j < reps; j++) {
        for (let i = 0; i < reps; i++) {
          const x = i * L, y = j * Wd;
          const pts: Pt[] = notch > 0
            ? [[x + notch, y], [x + L - notch, y], [x + L, y + notch], [x + L, y + Wd - notch], [x + L - notch, y + Wd], [x + notch, y + Wd], [x, y + Wd - notch], [x, y + notch]]
            : rectPts(x, y, L, Wd);
          tiles.push({ pts, t: checker ? (i + j) % 2 : 0 });
          // the diamond that fills the gap between four notched corners, once per lattice point
          if (notch > 0) tiles.push({ pts: [[x - notch, y], [x, y - notch], [x + notch, y], [x, y + notch]], t: 2, dot: true });
        }
      }
      return { tiles, b1: [L * reps, 0], b2: [0, Wd * reps] };
    }
    case 'running': {
      const off = num(s, 'offset');
      const d = Math.max(2, Math.round(1 / Math.max(0.05, Math.min(0.5, off))));
      const tiles: Cell['tiles'] = [];
      for (let k = 0; k < d; k++) tiles.push({ pts: rectPts(((k * off) % 1) * L, k * Wd, L, Wd), t: checker ? k % 2 : 0 });
      return { tiles, b1: [L, 0], b2: [0, d * Wd] };
    }
    case 'herringbone': {
      const W = Wd, k = Math.max(2, Math.min(5, Math.round(L / Wd))), Ln = k * W;
      // a horizontal tile plus the vertical tile at its right end; lattice (W, W) and (-Ln, Ln)
      return {
        tiles: [{ pts: rectPts(0, 0, Ln, W), t: 0 }, { pts: rectPts(Ln, W - Ln, W, Ln), t: checker ? 1 : 0 }],
        b1: [W, W], b2: [-Ln, Ln],
      };
    }
    case 'chevron': {
      const h = L / SQ2, p = Wd * SQ2;
      return {
        tiles: [
          { pts: [[0, 0], [h, -h], [h, -h + p], [0, p]], t: 0 },
          { pts: [[h, -h], [2 * h, 0], [2 * h, p], [h, -h + p]], t: checker ? 1 : 0 },
        ],
        b1: [2 * h, 0], b2: [0, p],
      };
    }
    case 'basketweave': {
      const bars = Math.max(2, Math.min(4, Math.round(num(s, 'bars')))), B = L, bw = B / bars;
      const tiles: Cell['tiles'] = [];
      for (const [bx, by, horiz] of [[0, 0, true], [B, B, true], [B, 0, false], [0, B, false]] as const) {
        for (let q = 0; q < bars; q++) {
          tiles.push({ pts: horiz ? rectPts(bx, by + q * bw, B, bw) : rectPts(bx + q * bw, by, bw, B), t: checker && !horiz ? 1 : 0 });
        }
      }
      return { tiles, b1: [2 * B, 0], b2: [0, 2 * B] };
    }
    case 'hopscotch': {
      // Classic hopscotch / pinwheel. One unit is a large square a with a small square b at one corner and the two
      // slim bars that fill the rest of the (a + b) square. Alternate rows mirror the unit, so the large squares of
      // each row sit b to the left of the row above (the small tile's width) and the pins pinwheel through the field.
      // The bars take the large tile's slot so it reads as squares rather than a plaid of bars; the small square takes
      // the alt tone with `checker` (accent otherwise). The cell spans two rows, so the repeat is (a + b) x 2(a + b).
      const a = L, b = Wd, small = checker ? 1 : 2, S = a + b;
      return {
        tiles: [
          { pts: rectPts(0, 0, a, a), t: 0 }, { pts: rectPts(a, a, b, b), t: small },
          { pts: rectPts(a, 0, b, a), t: 0 }, { pts: rectPts(0, a, a, b), t: 0 },
          { pts: rectPts(b, S, a, a), t: 0 }, { pts: rectPts(0, S + a, b, b), t: small },
          { pts: rectPts(0, S, b, a), t: 0 }, { pts: rectPts(b, S + a, a, b), t: 0 },
        ],
        b1: [S, 0], b2: [0, 2 * S],
      };
    }
    case 'hex': {
      const w = L, e = Wd, c = w / (2 * SQ3);
      return { tiles: [{ pts: [[0, c], [w / 2, 0], [w, c], [w, c + e], [w / 2, 2 * c + e], [0, c + e]], t: 0 }], b1: [w, 0], b2: [w / 2, e + c] };
    }
    case 'cubes': {
      const w = L, c = w / (2 * SQ3), e = 2 * c; // regular hexagon
      const ctr: Pt = [w / 2, c + e / 2];
      const A: Pt = [w / 2, 0], B: Pt = [w, c], C: Pt = [w, c + e], D: Pt = [w / 2, 2 * c + e], E: Pt = [0, c + e], F: Pt = [0, c];
      return {
        tiles: [{ pts: [A, B, ctr, F], t: 0 }, { pts: [F, ctr, D, E], t: 1 }, { pts: [ctr, B, C, D], t: 2 }],
        b1: [w, 0], b2: [w / 2, e + c],
      };
    }
    case 'triangles': {
      const w = L, h = (w * SQ3) / 2;
      return {
        tiles: [{ pts: [[0, h], [w, h], [w / 2, 0]], t: 0 }, { pts: [[w / 2, 0], [(3 * w) / 2, 0], [w, h]], t: checker ? 1 : 0 }],
        b1: [w, 0], b2: [w / 2, h],
      };
    }
    case 'fishscale': {
      const w = L, r = w / 2;
      return { tiles: [{ pts: [[0, 0], [w, 0], ...semicircle(r, r, r).reverse()], t: 0 }], b1: [w, 0], b2: [w / 2, w / 2], overlap: true };
    }
    default:
      return { tiles: [], b1: [1, 0], b2: [0, 1] };
  }
}

/** Smallest axis-aligned rectangle period (qx, qy) of a lattice rotated by theta, by brute force over small combinations. */
export function rectPeriod(b1: Pt, b2: Pt, theta: number): [number, number] {
  const c = Math.cos(theta), sn = Math.sin(theta);
  let qx = Infinity, qy = Infinity;
  for (let m = -14; m <= 14; m++) {
    for (let n = -14; n <= 14; n++) {
      const x = m * b1[0] + n * b2[0], y = m * b1[1] + n * b2[1];
      const rx = x * c - y * sn, ry = x * sn + y * c;
      if (Math.abs(ry) < 1e-7 && rx > 1e-7) qx = Math.min(qx, rx);
      if (Math.abs(rx) < 1e-7 && ry > 1e-7) qy = Math.min(qy, ry);
    }
  }
  return [qx, qy];
}

const wrapN = (v: number, m: number) => ((v % m) + m) % m;
/** Key of a tile centre wrapped into the repeat, robust at the repeat edge. */
function periodKey(cx: number, cy: number, w: number, h: number): number {
  const P = Math.max(1, Math.round(w * 2000)), Q = Math.max(1, Math.round(h * 2000));
  return wrapN(wrapN(Math.round(cx * 2000), P) * 7919 + wrapN(Math.round(cy * 2000), Q) * 104729, 2147483647);
}

function latticeTiles(layout: Layout, s: PaintSpec): { tiles: LayTile[]; overlap: boolean } {
  const cell = cellFor(layout, s);
  const ang = str(s, 'angle');
  const theta = ang === '45' ? Math.PI / 4 : ang === '90' ? Math.PI / 2 : 0;
  const [qx0, qy0] = rectPeriod(cell.b1, cell.b2, theta);
  if (!Number.isFinite(qx0) || !Number.isFinite(qy0)) return { tiles: [], overlap: false };
  const nx = Math.max(1, Math.round(s.w / qx0)), ny = Math.max(1, Math.round(s.h / qy0));
  // anisotropic fit: a few percent of stretch lets the lattice close exactly over the repeat
  const fx = s.w / (nx * qx0), fy = s.h / (ny * qy0);
  const c = Math.cos(theta), sn = Math.sin(theta);
  const rot = (x: number, y: number): Pt => [(x * c - y * sn) * fx, (x * sn + y * c) * fy];
  const l1 = Math.hypot(...cell.b1), l2 = Math.hypot(...cell.b2);
  const R = Math.ceil(((s.w + s.h) * 1.3) / Math.max(1e-4, Math.min(l1, l2))) + 3;
  const tiles: LayTile[] = [];
  for (let m = -R; m <= R; m++) {
    for (let n = -R; n <= R; n++) {
      const ox = m * cell.b1[0] + n * cell.b2[0], oy = m * cell.b1[1] + n * cell.b2[1];
      const o = rot(ox, oy);
      const reach = (l1 + l2) * 2;
      if (o[0] < -reach || o[0] > s.w + reach || o[1] < -reach || o[1] > s.h + reach) continue;
      for (const tl of cell.tiles) {
        const pts = tl.pts.map(([x, y]) => rot(x + ox, y + oy));
        let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity, sx = 0, sy = 0;
        for (const [x, y] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); sx += x; sy += y; }
        if (maxx < -0.01 || minx > s.w + 0.01 || maxy < -0.01 || miny > s.h + 0.01) continue;
        const cx = sx / pts.length, cy = sy / pts.length;
        tiles.push({ pts, t: tl.t, dot: tl.dot, key: periodKey(cx, cy, s.w, s.h), cx, cy });
      }
    }
  }
  return { tiles, overlap: cell.overlap === true };
}

/** Random-width courses that close exactly over the repeat (ashlar and Versailles-style modular floors). */
function ashlarTiles(s: PaintSpec): LayTile[] {
  const rng = rngFor(s.seed, 71);
  const rowVar = num(s, 'rowVar'), spread = num(s, 'mix');
  const nr = Math.max(1, Math.round(s.h / num(s, 'tileH')));
  const hs: number[] = [];
  for (let r = 0; r < nr; r++) hs.push(1 + (rng.next() - 0.5) * 2 * rowVar);
  const hsum = hs.reduce((a, b) => a + b, 0);
  const tiles: LayTile[] = [];
  const L = num(s, 'tileW');
  const sizes = [0.5, 0.75, 1, 1, 1.5, 2];
  let y = 0;
  for (let r = 0; r < nr; r++) {
    const rh = (hs[r]! / hsum) * s.h;
    const lens: number[] = [];
    let rest = s.w;
    while (rest > 1e-9) {
      let len = L * (1 + (sizes[Math.floor(rng.next() * sizes.length)]! - 1) * spread);
      if (rest - len < L * 0.45) len = rest;
      len = Math.min(len, rest);
      lens.push(len);
      rest -= len;
    }
    let x = 0;
    for (const len of lens) {
      tiles.push({ pts: rectPts(x, y, len, rh), t: 0, key: periodKey(x + len / 2, y + rh / 2, s.w, s.h), cx: x + len / 2, cy: y + rh / 2 });
      x += len;
    }
    y += rh;
  }
  return tiles;
}

/** Jittered Voronoi cells of a torus; every cell is already pulled in by half the grout (bisectors shifted). */
function crazyTiles(s: PaintSpec, gap: number): LayTile[] {
  const nx = Math.max(2, Math.round(s.w / num(s, 'tileW'))), ny = Math.max(2, Math.round(s.h / num(s, 'tileH')));
  const cw = s.w / nx, ch = s.h / ny, jit = num(s, 'jitter');
  const seeds: Pt[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const r = rngFor(s.seed, 83, i, j);
      seeds.push([(i + 0.5 + (r.next() - 0.5) * jit) * cw, (j + 0.5 + (r.next() - 0.5) * jit) * ch]);
    }
  }
  const tiles: LayTile[] = [];
  seeds.forEach((p, idx) => {
    let poly: Pt[] = rectPts(p[0] - cw * 2.2, p[1] - ch * 2.2, cw * 4.4, ch * 4.4);
    for (let oj = -1; oj <= 1; oj++) {
      for (let oi = -1; oi <= 1; oi++) {
        seeds.forEach((q0, k) => {
          if (poly.length < 3 || (k === idx && oi === 0 && oj === 0)) return;
          const q: Pt = [q0[0] + oi * s.w, q0[1] + oj * s.h];
          const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy);
          if (d > Math.max(cw, ch) * 3.2) return;
          const nxn = dx / d, nyn = dy / d;
          const lim = d / 2 - gap / 2; // keep (x - p) . n <= lim
          const out: Pt[] = [];
          for (let a = 0; a < poly.length; a++) {
            const u = poly[a]!, v = poly[(a + 1) % poly.length]!;
            const du = (u[0] - p[0]) * nxn + (u[1] - p[1]) * nyn - lim;
            const dv = (v[0] - p[0]) * nxn + (v[1] - p[1]) * nyn - lim;
            if (du <= 0) out.push(u);
            if (du <= 0 !== dv <= 0) { const t = du / (du - dv); out.push([u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]); }
          }
          poly = out;
        });
      }
    }
    if (poly.length < 3) return;
    const key = periodKey(p[0], p[1], s.w, s.h);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const pts = poly.map(([x, y]): Pt => [x + ox * s.w, y + oy * s.h]);
        if (pts.every(([x]) => x < -0.01) || pts.every(([x]) => x > s.w + 0.01) || pts.every(([, y]) => y < -0.01) || pts.every(([, y]) => y > s.h + 0.01)) continue;
        tiles.push({ pts, t: 0, key, cx: p[0] + ox * s.w, cy: p[1] + oy * s.h });
      }
    }
  });
  return tiles;
}

/** Every tile of one repeat (and the ones overhanging its edges) in drawing order. Pure; the tests check coverage with it. */
export function layTiles(s: PaintSpec): { tiles: LayTile[]; overlap: boolean; gapped: boolean } {
  const layout = (LAY_LAYOUTS as readonly string[]).includes(str(s, 'layout')) ? (str(s, 'layout') as Layout) : 'grid';
  if (layout === 'ashlar') return { tiles: ashlarTiles(s), overlap: false, gapped: false };
  if (layout === 'crazy') return { tiles: crazyTiles(s, hair(s, num(s, 'grout'))), overlap: false, gapped: true };
  const r = latticeTiles(layout, s);
  // fish scales: lower rows first so the rounded edge of the upper row lies on top
  if (r.overlap) r.tiles.sort((a, b) => b.cy - a.cy);
  return { tiles: r.tiles, overlap: r.overlap, gapped: false };
}

// ---------------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------------

function pathOf(ctx: Canvas2DLike, p: readonly Pt[], round: number): void {
  ctx.beginPath();
  if (round <= 0) { p.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))); ctx.closePath(); return; }
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[(i + n - 1) % n]!, b = p[i]!, c = p[(i + 1) % n]!;
    const la = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, lc = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
    const ta = Math.min(0.5, round / la), tc = Math.min(0.5, round / lc);
    const p1: Pt = [b[0] + (a[0] - b[0]) * ta, b[1] + (a[1] - b[1]) * ta];
    const p2: Pt = [b[0] + (c[0] - b[0]) * tc, b[1] + (c[1] - b[1]) * tc];
    if (i === 0) ctx.moveTo(p1[0], p1[1]); else ctx.lineTo(p1[0], p1[1]);
    ctx.quadraticCurveTo(b[0], b[1], p2[0], p2[1]);
  }
  ctx.closePath();
}

/** Smooth periodic field in 0..1 (a few sine waves with whole numbers of periods over the repeat). */
function ombre(s: PaintSpec, x: number, y: number): number {
  const r = rngFor(s.seed, 97);
  let v = 0;
  for (let k = 0; k < 3; k++) {
    const fx = 1, fy = Math.floor(r.next() * 2);
    v += Math.sin(TAU * (fx * (x / s.w) + fy * (y / s.h)) + r.next() * TAU) / 3;
  }
  return Math.max(0, Math.min(1, 0.5 + v * 0.9));
}

function slotColors(s: PaintSpec, slot: number): readonly string[] {
  if (slot === 0) return [col(s, 0), col(s, 1), col(s, 2)];
  const base = slot === 1 ? col(s, 4) : col(s, 5);
  return [base, shade(base, 0.24), shade(base, -0.3)];
}

function paintTiles(ctx: Canvas2DLike, s: PaintSpec): void {
  const { tiles, overlap, gapped } = layTiles(s);
  ctx.fillStyle = col(s, 3);
  ctx.fillRect(0, 0, s.w, s.h);
  const g = hair(s, num(s, 'grout'));
  const finish = str(s, 'finish'), mode = str(s, 'mode');
  const variation = num(s, 'variation'), bevel = num(s, 'bevel'), round = num(s, 'round');
  const wobble = num(s, 'wobble'), share = num(s, 'altShare'), altMix = num(s, 'altMix'), mapMix = num(s, 'mapMix');
  const mapId = str(s, 'map');
  const images = [0, 1, 2].map((slot) => (mapId === '' ? null : surfaceMapImage(mapId, slotColors(s, slot))));
  const mapScale = num(s, 'mapScale');
  for (const tile of tiles) {
    if (tile.pts.length < 3) continue;
    const rng = rngFor(s.seed, 5, tile.key);
    let slot = tile.t;
    let softAlt = false;
    if (slot === 0 && mode === 'random' && rng.next() < share) { if (altMix < 1) softAlt = true; else slot = 1; }
    if (slot === 0 && mode === 'confetti') { const q = rng.next(); slot = q < 0.4 ? 0 : q < 0.75 ? 1 : 2; }
    let colour = slot === 1 ? col(s, 4) : slot === 2 ? col(s, 5) : softAlt ? mix(col(s, 0), col(s, 4), altMix) : col(s, 0);
    if (mode === 'ombre' && slot === 0) {
      const w = Math.max(0, Math.min(1, ombre(s, tile.cx, tile.cy) + (rng.next() - 0.5) * 0.3));
      colour = mix(col(s, 0), col(s, 4), w);
      slot = w > 0.5 ? 1 : 0;
    }
    colour = shade(colour, (rng.next() - 0.5) * 0.16 * variation);
    let pts = overlap || gapped ? tile.pts : insetPoly(tile.pts, g / 2);
    if (wobble > 0) {
      const ang = (rng.next() - 0.5) * 0.08 * wobble, k = 1 - rng.next() * 0.04 * wobble;
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      pts = pts.map(([x, y]): Pt => [cx + ((x - cx) * ca - (y - cy) * sa) * k, cy + ((x - cx) * sa + (y - cy) * ca) * k]);
    }
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const [x, y] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    const bw = maxx - minx, bh = maxy - miny;
    const rr = round > 0 && !tile.dot ? round * Math.min(bw, bh) : 0;
    ctx.save();
    pathOf(ctx, pts, rr);
    ctx.clip();
    ctx.fillStyle = colour;
    ctx.fillRect(minx, miny, bw, bh);
    const img = images[slot] ?? images[0];
    if (img) {
      // a random phase into the map for every tile
      ctx.globalAlpha = mapMix;
      drawMapRect(ctx, img, minx, miny, bw, bh, mapScale, minx - rng.next() * mapScale, miny - rng.next() * mapScale, s.ppm);
      ctx.globalAlpha = 1;
      if (softAlt) { ctx.fillStyle = rgba(colour, 0.5); ctx.fillRect(minx, miny, bw, bh); }
      const t = (rng.next() - 0.5) * variation * 0.9;
      ctx.fillStyle = rgba(t > 0 ? '#ffffff' : '#000000', Math.abs(t) * 0.7);
      ctx.fillRect(minx, miny, bw, bh);
    } else {
      surfaceFinish(ctx, s, finish, rng, colour, minx, miny, bw, bh);
    }
    if (finish === 'gloss' || finish === 'glass') softBlob(ctx, minx + bw * 0.3, miny + bh * 0.25, bw * 0.45, bh * 0.16, -0.5, '#ffffff', finish === 'glass' ? 0.2 : 0.12, 4);
    if (finish === 'handmade') { ctx.strokeStyle = rgba('#000000', 0.18); ctx.lineWidth = Math.min(bw, bh) * 0.12; pathOf(ctx, pts, rr); ctx.stroke(); }
    if (bevel > 0) bevelEdges(ctx, s, pts, bevel, bw, bh);
    ctx.restore();
    if (overlap) {
      ctx.strokeStyle = rgba(shade(col(s, 3), -0.2), 0.9);
      ctx.lineWidth = Math.max(g, 1.2 / s.ppm);
      pathOf(ctx, pts, rr);
      ctx.stroke();
    }
  }
}

function surfaceFinish(ctx: Canvas2DLike, s: PaintSpec, finish: string, rng: ReturnType<typeof rngFor>, colour: string, x: number, y: number, w: number, h: number): void {
  const area = { x, y, w, h };
  switch (finish) {
    case 'matt':
      speckle(ctx, s, rng, 0.05, [shade(colour, -0.12), shade(colour, 0.1)], 0.3, 1.2, area);
      break;
    case 'speckle':
    case 'stone':
      speckle(ctx, s, rng, 0.12, [shade(colour, -0.4), shade(colour, 0.28), shade(colour, -0.15)], 0.5, 1.3, area);
      break;
    case 'terracotta':
      for (let q = 0; q < 4; q++) softBlob(ctx, x + rng.next() * w, y + rng.next() * h, w * (0.15 + rng.next() * 0.3), h * (0.15 + rng.next() * 0.3), rng.next() * Math.PI, rng.next() < 0.5 ? shade(colour, 0.25) : shade(colour, -0.3), 0.2, 4);
      speckle(ctx, s, rng, 0.08, [shade(colour, -0.45), shade(colour, 0.3)], 0.45, 1.3, area);
      break;
    case 'handmade': {
      const m = Math.min(w, h);
      for (let q = 0; q < 4; q++) softBlob(ctx, x + rng.next() * w, y + rng.next() * h, m * (0.2 + rng.next() * 0.3), m * (0.2 + rng.next() * 0.3), rng.next() * Math.PI, rng.next() < 0.5 ? '#ffffff' : '#000000', 0.1, 4);
      break;
    }
    case 'crackle': {
      ctx.strokeStyle = rgba(shade(colour, -0.5), 0.22);
      ctx.lineWidth = Math.max(0.0006, 0.5 / s.ppm);
      const n = Math.round(Math.min(40, 6 + (w * h) / 0.0012));
      for (let q = 0; q < n; q++) {
        const px = x + rng.next() * w, py = y + rng.next() * h, a = rng.next() * TAU, l = 0.01 + rng.next() * 0.03;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
        ctx.lineTo(px + Math.cos(a + 1) * l * 1.2, py + Math.sin(a + 1) * l * 1.2);
        ctx.stroke();
      }
      break;
    }
    case 'glass':
      softBlob(ctx, x + w * 0.6, y + h * 0.6, w * 0.5, h * 0.3, 0.7, shade(colour, -0.25), 0.18, 4);
      break;
    default:
      break;
  }
}

function bevelEdges(ctx: Canvas2DLike, s: PaintSpec, pts: readonly Pt[], bevel: number, bw: number, bh: number): void {
  const sgn = areaOf(pts) >= 0 ? 1 : -1;
  const wdt = Math.max(1.1 / s.ppm, Math.min(bw, bh) * 0.045 * bevel * 2);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1;
    const nx = (ey / l) * sgn, ny = (-ex / l) * sgn; // outward normal
    const f = (nx + ny) * -0.7071; // > 0 when the edge faces up-left (lit)
    ctx.strokeStyle = f > 0 ? rgba('#ffffff', 0.34 * f * bevel) : rgba('#000000', 0.34 * -f * bevel);
    ctx.lineWidth = wdt * 2;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
}

const MAP_PARAM: ParamSpec = { type: 'enum', values: ['', ...MAP_IDS], default: '', doc: 'Optional material map for the tile faces (marble, granite, glaze); empty = flat faces with the finish.' };

const tileLay: PainterDef = {
  id: 'tile-lay',
  surface: 'floor',
  description: 'Grouted floor tiles in twelve layouts (grid, running bond, herringbone, chevron, basketweave, hopscotch, hexagon and picket, tumbling blocks, triangles, fish scale, random ashlar, crazy paving), optionally on the diagonal, with glaze, speckle or a tinted material map on the faces.',
  colors: ['tile', 'light', 'dark', 'grout', 'alt', 'accent'],
  params: {
    seed: SEED_PARAM,
    layout: { type: 'enum', values: LAY_LAYOUTS, default: 'grid', doc: 'Tile layout.' },
    tileW: { type: 'number', min: 0.015, max: 1.2, default: 0.3, doc: 'Tile length (m); hex, cubes, triangles, fishscale: tile width; basketweave: block side; hopscotch: large square.' },
    tileH: { type: 'number', min: 0.01, max: 1.2, default: 0.3, doc: 'Tile width (m); hex: vertical side (regular = tileW / 1.732); hopscotch: small square; herringbone: the length is tileW rounded to a whole multiple of this.' },
    grout: { type: 'number', min: 0.001, max: 0.02, default: 0.004, doc: 'Grout joint (m).' },
    angle: { type: 'enum', values: ANGLES, default: '0', doc: 'Rotation of the whole lay in degrees (45 = diagonal, 90 = turned).' },
    offset: { type: 'number', min: 0.2, max: 0.5, default: 0.5, doc: 'Running bond: row offset as a share of the tile (0.5, 0.333, 0.25).' },
    checker: { type: 'boolean', default: false, doc: 'Use the alt tone for every second tile (grid: checkerboard; running: rows; herringbone, chevron, basketweave: the second direction; hopscotch: the small corner square).' },
    notch: { type: 'number', min: 0, max: 0.45, default: 0, doc: 'Grid: corner cut of each tile, filled with an accent diamond (octagon and dot, cabochon).' },
    bars: { type: 'number', min: 2, max: 4, default: 2, integer: true, doc: 'Basketweave: bars per block.' },
    jitter: { type: 'number', min: 0, max: 1, default: 0.7, doc: 'Crazy paving: how far the seed points wander.' },
    rowVar: { type: 'number', min: 0, max: 0.6, default: 0.2, doc: 'Ashlar: variation of the course heights.' },
    mix: { type: 'number', min: 0, max: 1, default: 0.7, doc: 'Ashlar: variation of the tile lengths.' },
    finish: { type: 'enum', values: FINISHES, default: 'gloss', doc: 'Face finish when no map is set.' },
    map: MAP_PARAM,
    mapScale: { type: 'number', min: 0.2, max: 2.4, default: 0.9, doc: 'Metres covered by one map tile.' },
    mode: { type: 'enum', values: MODES, default: 'none', doc: 'Tone distribution: random share of alt tiles, ombre (smooth blend of tile and alt), confetti (tile, alt and accent).' },
    altShare: { type: 'number', min: 0, max: 1, default: 0.25, doc: 'Mode random: share of alt tiles.' },
    altMix: { type: 'number', min: 0, max: 1, default: 1, doc: 'Mode random: how far a picked tile moves from the tile colour toward alt (1 = fully alt).' },
    mapMix: { type: 'number', min: 0, max: 1, default: 1, doc: 'Opacity of the material map over the tile colour (lower = calmer faces).' },
    variation: { type: 'number', min: 0, max: 1, default: 0.4, doc: 'Tile-to-tile tone variation.' },
    bevel: { type: 'number', min: 0, max: 1, default: 0.4, doc: 'Edge highlight.' },
    round: { type: 'number', min: 0, max: 0.5, default: 0, doc: 'Corner rounding as a share of the tile (pebbles).' },
    wobble: { type: 'number', min: 0, max: 1, default: 0, doc: 'Hand-made irregularity: each tile slightly turned and shrunk.' },
  },
  thumbSpan: 1.2,
  paint: paintTiles,
};

export const PAINTERS_FLOORS_B: PainterDef[] = [tileLay];
