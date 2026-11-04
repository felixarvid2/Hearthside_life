// Family-specific painters of surface group 'walls-f' (M10 surfaces): brick bonds, stone walling, cast and sheet
// metal panels. The material (brick face, stone, concrete, rust...) comes from an AI-generated greyscale map that
// every brick, stone or panel samples at its own random window, so the map never visibly repeats; bonds, joints,
// panels and fixings are always drawn here. Palettes are [base, light, dark, joint] and tint the map.
//
// Until a map has loaded (and in tests) every unit is a flat colour with speckle, so geometry never depends on it.

import type { Rng } from '../../../core/rng';
import {
  SEED_PARAM, SKIRT_PARAM, col, drawWrapped, fitCount, fromFloor, hair, mix, num, rgba, rngFor, shade, skirting, speckle,
  str, wrappedKey, type Canvas2DLike, type PaintSpec, type PainterDef, type ParamSpec,
} from '../painterKit';
import { MAP_IDS, drawMapRect, surfaceMapImage } from '../mapKit';

const TAU = Math.PI * 2;
type Pt = readonly [number, number];

const MAP_PARAM: ParamSpec = { type: 'enum', values: MAP_IDS, default: MAP_IDS[0], doc: 'Material map (public/assets/surfaces).' };
const SKIRT0 = { ...SKIRT_PARAM, default: 0 } as ParamSpec;

function mapImage(s: PaintSpec, key = 'map', colors: readonly string[] = s.colors): unknown {
  const id = s.params[key];
  return typeof id === 'string' && id !== '' ? surfaceMapImage(id, colors) : null;
}

function polyPath(ctx: Canvas2DLike, pts: readonly Pt[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

function rectPts(x: number, y: number, w: number, h: number): Pt[] {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

function bounds(pts: readonly Pt[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

interface FaceOpts {
  tile: number;       // metres covered by one material map tile
  variation: number;  // unit-to-unit tone variation 0..1
  relief: number;     // width (m) of the lit and shaded edges
  cast: number;       // cast shadow below the unit (m)
  mirror?: boolean;   // draw the map mirrored left-right (book-matched slabs)
  gloss?: number;     // 0..1 soft highlight
  window?: [number, number]; // fixed map window (otherwise random from rng)
}

/** One masonry unit: cast shadow, material window, tone, lit and shaded edges. `rng` is consumed identically per copy. */
function paintFace(ctx: Canvas2DLike, s: PaintSpec, img: unknown, pts: readonly Pt[], rng: Rng, o: FaceOpts): void {
  const { x0, y0, x1, y1 } = bounds(pts);
  const w = x1 - x0, h = y1 - y0;
  const r1 = rng.next(), r2 = rng.next(), tone = (rng.next() - 0.5) * o.variation, extra = rng.next();
  const win = o.window ?? [r1, r2];
  if (o.cast > 0) {
    ctx.save();
    ctx.translate(0, o.cast * 0.6);
    polyPath(ctx, pts);
    ctx.fillStyle = rgba('#000000', 0.26);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  polyPath(ctx, pts);
  ctx.clip();
  if (o.mirror && img && ctx.drawImage) {
    ctx.save();
    ctx.translate(x1, y0);
    ctx.scale(-1, 1);
    drawMapRect(ctx, img, 0, 0, w, h, o.tile, -win[0] * o.tile, -win[1] * o.tile, s.ppm);
    ctx.restore();
  } else if (!drawMapRect(ctx, img, x0, y0, w, h, o.tile, x0 - win[0] * o.tile, y0 - win[1] * o.tile, s.ppm)) {
    ctx.fillStyle = col(s, 0);
    ctx.fillRect(x0, y0, w, h);
    speckle(ctx, s, rng, 0.05, [col(s, 1), col(s, 2)], 0.3, 1.3, { x: x0, y: y0, w, h });
  }
  // unit tone: lighter or darker, and now and then a burnt or pale one
  ctx.fillStyle = rgba(tone > 0 ? col(s, 1) : col(s, 2), Math.min(0.6, Math.abs(tone) * 0.9));
  ctx.fillRect(x0, y0, w, h);
  if (extra < 0.1 * o.variation) { ctx.fillStyle = rgba(col(s, 2), 0.28); ctx.fillRect(x0, y0, w, h); }
  if (o.gloss) {
    ctx.fillStyle = rgba('#ffffff', 0.16 * o.gloss);
    ctx.fillRect(x0, y0, w, h * 0.3);
    ctx.fillStyle = rgba('#ffffff', 0.1 * o.gloss);
    ctx.fillRect(x0 + w * 0.08, y0, w * 0.1, h);
  }
  if (o.relief > 0) {
    let cx = 0, cy = 0;
    for (const [x, y] of pts) { cx += x; cy += y; }
    cx /= pts.length; cy /= pts.length;
    const lw = Math.max(o.relief, 0.9 / s.ppm);
    ctx.lineWidth = lw * 2;
    ctx.lineCap = 'butt';
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i] as Pt, b = pts[(i + 1) % pts.length] as Pt;
      let nx = b[1] - a[1], ny = a[0] - b[0];
      const len = Math.hypot(nx, ny);
      if (len < 1e-9) continue;
      nx /= len; ny /= len;
      if (nx * ((a[0] + b[0]) / 2 - cx) + ny * ((a[1] + b[1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
      const d = nx * -0.45 + ny * -0.89;
      ctx.strokeStyle = d > 0 ? rgba('#ffffff', 0.34 * d) : rgba('#000000', 0.42 * -d);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Draws a unit and its periodic copies; the rng is recreated per copy so they match. */
function unit(
  ctx: Canvas2DLike, s: PaintSpec, img: unknown, pts: readonly Pt[], key: number, o: FaceOpts, extra?: (rng: Rng) => void,
): void {
  const b = bounds(pts);
  drawWrapped(ctx, s, b.x0 - 0.02, b.y0 - 0.02, b.x1 + 0.02, b.y1 + 0.04, () => {
    const rng = rngFor(s.seed, key, 11);
    paintFace(ctx, s, img, pts, rng, o);
    if (extra) extra(rng);
  });
}

/** Splits `total` into `count` random parts (each 0.55..1.45 of the mean) that sum exactly. */
function parts(total: number, count: number, rng: Rng, spread = 0.45): number[] {
  const raw = Array.from({ length: count }, () => 1 - spread + rng.next() * spread * 2);
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => (v / sum) * total);
}

/** Cells of the 90 degree herringbone (2:1 units) on a (4u x 4u) period: horizontal at (a+b)%4==0, vertical at ==2. */
function herringCells(s: PaintSpec, u: number): Array<{ x: number; y: number; w: number; h: number; vertical: boolean }> {
  const n = fitCount(s.w, 4 * u);
  const ux = s.w / (n * 4);
  const rows = Math.ceil(s.h / u) + 4;
  const out: Array<{ x: number; y: number; w: number; h: number; vertical: boolean }> = [];
  for (let b = -2; b < rows; b++) {
    for (let a = 0; a < n * 4; a++) {
      const k = (((a + b) % 4) + 4) % 4;
      if (k !== 0 && k !== 2) continue;
      const vertical = k === 2;
      out.push({ x: a * ux, y: s.h - (b + 1) * u - (vertical ? u : 0) + u, w: vertical ? ux : 2 * ux, h: vertical ? 2 * u : u, vertical });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Brick bonds (and block walls): bond-brick
// ---------------------------------------------------------------------------------------------

const BONDS = ['running', 'stack', 'english', 'flemish', 'thirds', 'herring', 'basket', 'soldier-band', 'header', 'diaper', 'tumbled', 'sailor'] as const;

interface Cell { x: number; y: number; w: number; h: number; dark: boolean }

function brickCells(s: PaintSpec, bond: string, S: number, B: number, j: number): Cell[] {
  const cs = S + j, cb = B + j;
  const cells: Cell[] = [];
  if (bond === 'herring') {
    const u = (S + j) / 2;
    for (const c of herringCells(s, u)) cells.push({ ...c, dark: false });
    return cells;
  }
  if (bond === 'basket') {
    const L = cs, W = L / 2; // a block is two bricks side by side: L x L
    const n = fitCount(s.w, 2 * L, 1, 1);
    const lx = s.w / (n * 2);
    for (let r = -1; r * L < s.h + L; r++) {
      for (let i = 0; i < n * 2; i++) {
        const horizontal = (i + r) % 2 === 0;
        const x = i * lx, y = s.h - (r + 1) * L;
        for (let q = 0; q < 2; q++) {
          if (horizontal) cells.push({ x, y: y + q * W, w: lx, h: W, dark: false });
          else cells.push({ x: x + q * (lx / 2), y, w: lx / 2, h: L, dark: false });
        }
      }
    }
    return cells;
  }
  const rowHeight = (c: number) => (bond === 'soldier-band' && c % 7 === 6 ? cs : bond === 'sailor' ? cs : cb);
  let y = s.h;
  for (let c = 0; y > -cs; c++) {
    const h = rowHeight(c);
    y -= h;
    const rng = rngFor(s.seed, 90, c);
    const soldier = bond === 'sailor' || (bond === 'soldier-band' && c % 7 === 6);
    let unitW = soldier ? cb : cs; // width of one brick cell in this course
    let pattern: number[];
    let shift = 0;
    switch (bond) {
      case 'stack': pattern = [unitW]; break;
      case 'thirds': pattern = [unitW]; shift = (c % 3) * unitW / 3; break;
      case 'english': if (c % 2) { pattern = [unitW / 2]; } else { pattern = [unitW]; shift = (Math.floor(c / 2) % 2) * unitW / 2; } break;
      case 'flemish': pattern = [unitW, unitW / 2]; shift = c % 2 ? unitW * 0.75 : 0; break;
      case 'header': pattern = [unitW / 2]; shift = c % 2 ? unitW / 4 : 0; break;
      case 'soldier-band': pattern = [unitW]; shift = soldier ? 0 : (c % 2) * unitW / 2; break;
      case 'tumbled': pattern = []; break;
      default: pattern = [unitW]; shift = (c % 2) * unitW / 2; // running, diaper, sailor
    }
    if (bond === 'tumbled') {
      const count = fitCount(s.w, unitW);
      let x = 0;
      for (const w of parts(s.w, count, rng, 0.2)) { cells.push({ x, y, w, h: h * (0.97 + rng.next() * 0.06), dark: false }); x += w; }
      continue;
    }
    const period = pattern.reduce((a, b) => a + b, 0);
    const m = fitCount(s.w, period);
    const k = s.w / (m * period);
    unitW *= k;
    for (let rep = -1; rep <= m; rep++) {
      let x = rep * period * k + shift * k;
      for (const pw of pattern) {
        const w = pw * k;
        let xx = x;
        // keep cells that start in [0, w): the sequence is periodic, so the others are the wrapped copies
        while (xx < -1e-9) xx += s.w;
        while (xx >= s.w - 1e-9) xx -= s.w;
        if (Math.abs(xx - x) < 1e-9) cells.push({ x: xx, y, w, h, dark: false });
        x += w;
      }
    }
    if (bond === 'diaper') {
      // dark headers in crossing diagonals: half-brick column hc, flagged where hc +- course falls on a lattice
      for (const cell of cells) {
        if (Math.abs(cell.y - y) > 1e-9) continue;
        const hc = Math.round(cell.x / (cs * k) * 2);
        const m8 = (v: number) => ((v % 8) + 8) % 8;
        cell.dark = m8(hc - c) === 0 || m8(hc + c) === 0;
      }
    }
  }
  return cells;
}

const bondBrick: PainterDef = {
  id: 'bond-brick',
  surface: 'wall',
  description: 'Brick and block walling in many bonds (running, stack, English, Flemish, herringbone, basket weave, soldier band, header, diaper, tumbled, sailor). Every unit samples its own window of a face map; joints and raked beds are drawn.',
  colors: ['base', 'light', 'dark', 'mortar'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT0,
    map: MAP_PARAM,
    bond: { type: 'enum', values: BONDS, default: 'running', doc: 'Bond pattern.' },
    brickW: { type: 'number', min: 0.1, max: 0.8, default: 0.215, doc: 'Stretcher length (m).' },
    brickH: { type: 'number', min: 0.03, max: 0.3, default: 0.065, doc: 'Brick height (m).' },
    joint: { type: 'number', min: 0.004, max: 0.025, default: 0.01, doc: 'Joint width (m).' },
    variation: { type: 'number', min: 0, max: 1.4, default: 0.6, doc: 'Brick-to-brick tone variation.' },
    mapScale: { type: 'number', min: 0.2, max: 1.6, default: 0.6, doc: 'Metres covered by one face-map tile.' },
    rake: { type: 'number', min: 0, max: 1, default: 0.3, doc: 'Depth of the joints (shadow cast into the bed).' },
    gloss: { type: 'number', min: 0, max: 1, default: 0, doc: 'Glazed highlight.' },
    chip: { type: 'number', min: 0, max: 1, default: 0.06, doc: 'Share of bricks with a chipped corner.' },
    wobble: { type: 'number', min: 0, max: 1, default: 0, doc: 'Hand-laid irregularity of unit edges.' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    const mortar = col(s, 3);
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, s.w, s.h);
    speckle(ctx, s, rngFor(s.seed, 9), 0.06, [shade(mortar, -0.25), shade(mortar, 0.2)], 0.5);
    const img = mapImage(s);
    const j = num(s, 'joint'), rake = num(s, 'rake'), chip = num(s, 'chip'), wobble = num(s, 'wobble');
    const opts: FaceOpts = {
      tile: num(s, 'mapScale'), variation: num(s, 'variation'), relief: Math.min(0.004, 0.0035 + j * 0.1) * (0.6 + rake * 0.4),
      cast: j * (0.5 + rake), gloss: num(s, 'gloss'),
    };
    const dark = col(s, 2);
    for (const c of brickCells(s, str(s, 'bond'), num(s, 'brickW'), num(s, 'brickH'), j)) {
      if (c.x < -1e-9 || c.x >= s.w - 1e-9) continue;
      const key = wrappedKey(s, c.x + c.w / 2, c.y + c.h / 2);
      const wr = rngFor(s.seed, key, 5);
      const jx = (wr.next() - 0.5) * wobble * j, jy = (wr.next() - 0.5) * wobble * j;
      const pts = rectPts(c.x + j / 2 + jx, c.y + j / 2 + jy, c.w - j, c.h - j);
      unit(ctx, s, img, pts, key, opts, (rng) => {
        const [x, y] = pts[0] as Pt, w = c.w - j, h = c.h - j;
        if (c.dark) { ctx.fillStyle = rgba(dark, 0.55); ctx.fillRect(x, y, w, h); }
        if (rng.next() < chip) {
          const left = rng.next() < 0.5, sz = Math.min(w, h) * (0.15 + rng.next() * 0.25), top = rng.next() < 0.5;
          const cx = left ? x : x + w, cy = top ? y : y + h;
          ctx.fillStyle = mortar;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + (left ? sz : -sz), cy);
          ctx.lineTo(cx, cy + (top ? sz : -sz));
          ctx.closePath();
          ctx.fill();
        }
      });
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Stone walling: stone-set
// ---------------------------------------------------------------------------------------------

const STONE_LAYOUTS = ['coursed', 'banded', 'ledger', 'dry', 'herring', 'flag', 'cyclo', 'cobble', 'flint', 'hex', 'slabs', 'panels', 'diamond', 'scales'] as const;

/** Periodic Voronoi cells (convex polygons, already inset by half the joint) for jittered grid points. */
function voronoiCells(s: PaintSpec, size: number, jitter: number, joint: number, rng: Rng): Array<{ pts: Pt[]; key: number }> {
  const nx = fitCount(s.w, size), ny = fitCount(s.h, size);
  const cw = s.w / nx, ch = s.h / ny;
  const seeds: Pt[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    seeds.push([(i + 0.5 + (rng.next() - 0.5) * jitter) * cw, (j + 0.5 + (rng.next() - 0.5) * jitter) * ch]);
  }
  const out: Array<{ pts: Pt[]; key: number }> = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = seeds[j * nx + i] as Pt;
    let poly: Pt[] = rectPts(p[0] - 2 * size, p[1] - 2 * size, 4 * size, 4 * size);
    for (let dj = -2; dj <= 2 && poly.length; dj++) for (let di = -2; di <= 2 && poly.length; di++) {
      if (di === 0 && dj === 0 && true) { /* skip self below */ }
      const ii = ((i + di) % nx + nx) % nx, jj = ((j + dj) % ny + ny) % ny;
      const q0 = seeds[jj * nx + ii] as Pt;
      const q: Pt = [q0[0] + Math.floor((i + di) / nx) * s.w, q0[1] + Math.floor((j + dj) / ny) * s.h];
      if (q[0] === p[0] && q[1] === p[1]) continue;
      // keep the side of the bisector nearer p, pulled back by half the joint
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      let nxn = q[0] - p[0], nyn = q[1] - p[1];
      const len = Math.hypot(nxn, nyn);
      nxn /= len; nyn /= len;
      const off = nxn * mx + nyn * my - joint / 2;
      const next: Pt[] = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k] as Pt, b = poly[(k + 1) % poly.length] as Pt;
        const da = nxn * a[0] + nyn * a[1] - off, db = nxn * b[0] + nyn * b[1] - off;
        if (da <= 0) next.push(a);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
          const t = da / (da - db);
          next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      poly = next;
    }
    if (poly.length >= 3) out.push({ pts: poly, key: j * nx + i });
  }
  return out;
}

/** A rounded or angular blob around (cx, cy). */
function blob(cx: number, cy: number, rx: number, ry: number, corners: number, rough: number, rng: Rng): Pt[] {
  const pts: Pt[] = [];
  const rot = rng.next() * TAU;
  for (let k = 0; k < corners; k++) {
    const a = rot + (k / corners) * TAU;
    const r = 1 - rough * rng.next();
    pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  return pts;
}

const stoneSet: PainterDef = {
  id: 'stone-set',
  surface: 'wall',
  description: 'Stone walling in fourteen layouts (coursed rubble, banded blocks, ledger strips, dry stack, herringbone slips, flagstones, tight polygonal, cobbles, flint, basalt columns, book-matched slabs, split-face panels, diamond slates, fish-scale slates). Every stone samples its own window of a stone map.',
  colors: ['base', 'light', 'dark', 'joint'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT0,
    map: MAP_PARAM,
    layout: { type: 'enum', values: STONE_LAYOUTS, default: 'coursed', doc: 'How the stones are laid.' },
    size: { type: 'number', min: 0.06, max: 1.2, default: 0.3, doc: 'Typical stone size (m): course height, cell size or unit width.' },
    joint: { type: 'number', min: 0.002, max: 0.03, default: 0.012, doc: 'Joint width (m).' },
    variation: { type: 'number', min: 0, max: 1.4, default: 0.7, doc: 'Stone-to-stone tone variation.' },
    mapScale: { type: 'number', min: 0.2, max: 1.6, default: 0.6, doc: 'Metres covered by one stone-map tile.' },
    relief: { type: 'number', min: 0, max: 0.03, default: 0.006, doc: 'Width of the lit and shaded edges (m).' },
    rough: { type: 'number', min: 0, max: 1, default: 0.3, doc: 'Irregularity of stone outlines.' },
  },
  thumbSpan: 1.4,
  paint(ctx, s) {
    const joint = col(s, 3);
    ctx.fillStyle = joint;
    ctx.fillRect(0, 0, s.w, s.h);
    speckle(ctx, s, rngFor(s.seed, 9), 0.05, [shade(joint, -0.3), shade(joint, 0.2)], 0.5);
    const img = mapImage(s);
    const layout = str(s, 'layout');
    const size = num(s, 'size'), j = num(s, 'joint'), rough = num(s, 'rough');
    const o: FaceOpts = { tile: num(s, 'mapScale'), variation: num(s, 'variation'), relief: num(s, 'relief'), cast: j * 0.6 };
    const lay = rngFor(s.seed, 70);
    let n = 0;
    const put = (pts: readonly Pt[], opts: FaceOpts = o) => unit(ctx, s, img, pts, ++n * 977 + (layout.length * 31), opts);
    const jit = (v: number, amount: number, rng: Rng) => v + (rng.next() - 0.5) * amount;

    if (layout === 'coursed' || layout === 'banded' || layout === 'ledger' || layout === 'dry') {
      const heights = [1.4, 0.7, 1, 0.7]; // banded: tall, short, mid, short
      let y = s.h, c = 0;
      while (y > -size) {
        const rng = rngFor(s.seed, 71, c);
        const rh = layout === 'banded' ? size * (heights[c % 4] as number)
          : layout === 'ledger' ? size * (0.8 + rng.next() * 0.5) : size * (0.65 + rng.next() * 0.7);
        const longest = layout === 'ledger' ? 2.4 : layout === 'banded' ? 3 : layout === 'dry' ? 1.6 : 1.9;
        const count = fitCount(s.w, rh * longest * (0.8 + rng.next() * 0.5));
        const ws = parts(s.w, count, rng, layout === 'banded' ? 0.3 : 0.5);
        let x = 0;
        ws.forEach((w, i) => {
          const sr = rngFor(s.seed, 72, c, i);
          const top = y - rh;
          if (layout === 'coursed') {
            const e = rh * 0.1 * rough * 2;
            put([[x + j / 2 + jit(0, e, sr), top + j / 2 + jit(0, e, sr)], [x + w - j / 2 + jit(0, e, sr), top + j / 2 + jit(0, e, sr)],
              [x + w - j / 2 + jit(0, e, sr), y - j / 2 + jit(0, e, sr)], [x + j / 2 + jit(0, e, sr), y - j / 2 + jit(0, e, sr)]]);
          } else if (layout === 'dry') {
            const hh = rh * (0.72 + sr.next() * 0.33), e = rh * 0.12 * rough * 2;
            const t = y - hh;
            put([[x + j / 2 + jit(0, e, sr), t + jit(0, e, sr)], [x + w * 0.5, t - e * 0.5 + jit(0, e, sr)], [x + w - j / 2 + jit(0, e, sr), t + jit(0, e, sr)],
              [x + w - j / 2, y - j / 2], [x + j / 2, y - j / 2]]);
          } else put(rectPts(x + j / 2, top + j / 2, w - j, rh - j));
          x += w;
        });
        y -= rh;
        c++;
      }
    } else if (layout === 'herring') {
      const u = size / 2;
      herringCells(s, u).forEach((c, i) => {
        if (c.x < -1e-9 || c.x >= s.w - 1e-9) return;
        put(rectPts(c.x + j / 2, c.y + j / 2, c.w - j, c.h - j));
        void i;
      });
    } else if (layout === 'flag' || layout === 'cyclo') {
      const jitter = layout === 'flag' ? 0.95 : 0.5;
      for (const cell of voronoiCells(s, size, jitter, j, lay)) {
        const b = bounds(cell.pts);
        // flag stones are shrunk a little at random so mortar gaps vary; the polygon stays convex
        if ((b.x0 + b.x1) / 2 < -0.5 * size || (b.x0 + b.x1) / 2 > s.w + 0.5 * size) continue;
        put(cell.pts);
      }
    } else if (layout === 'cobble' || layout === 'flint') {
      const rowH = size * (layout === 'flint' ? 0.8 : 0.74);
      const cols = fitCount(s.w, size);
      const cw = s.w / cols;
      for (let r = -1; r * rowH < s.h + rowH; r++) {
        const rng = rngFor(s.seed, 73, r);
        for (let i = 0; i < cols; i++) {
          const cx = (i + 0.5 + (r % 2 ? 0.5 : 0) + (rng.next() - 0.5) * 0.3) * cw;
          const cy = s.h - (r + 0.5) * rowH + (rng.next() - 0.5) * rowH * 0.2;
          const rx = cw * (layout === 'flint' ? 0.5 : 0.47) * (0.85 + rng.next() * 0.25), ry = rowH * 0.58 * (0.8 + rng.next() * 0.3);
          put(blob(cx, cy, rx, ry, layout === 'flint' ? 8 + (i % 3) : 13, layout === 'flint' ? 0.3 + rough * 0.4 : rough * 0.35, rng));
        }
      }
    } else if (layout === 'hex') {
      const cols = fitCount(s.w, size * 1.732);
      const dx = s.w / cols, R = dx / 1.732, rowH = R * 1.5;
      for (let r = -1; r * rowH < s.h + rowH; r++) {
        for (let i = 0; i < cols; i++) {
          const cx = (i + 0.5 + (((r % 2) + 2) % 2 ? 0.5 : 0)) * dx, cy = s.h - r * rowH;
          const rr = R - j / 1.732;
          put(Array.from({ length: 6 }, (_, k) => [cx + Math.cos(Math.PI / 6 + (k * TAU) / 6) * rr, cy + Math.sin(Math.PI / 6 + (k * TAU) / 6) * rr] as Pt));
        }
      }
    } else if (layout === 'slabs') {
      const cols = fitCount(s.w, size, 2, 2);
      const cw = s.w / cols;
      for (let i = 0; i < cols; i++) {
        const mirror = i % 2 === 1;
        // a book-matched pair shares one window; the second slab is its mirror image
        const pairRng = rngFor(s.seed, 74, Math.floor(i / 2));
        const win: [number, number] = [pairRng.next(), pairRng.next()];
        const wx: [number, number] = mirror ? [win[0], win[1]] : win;
        put(rectPts(i * cw + j / 2, j / 2, cw - j, s.h - j), { ...o, mirror, window: wx, variation: o.variation * 0.4 });
      }
    } else if (layout === 'panels') {
      const ph = size, pw = size * 2;
      const cols = fitCount(s.w, pw), cw = s.w / cols;
      let y = s.h, c = 0;
      while (y > -ph) {
        for (let i = 0; i < cols; i++) put(rectPts((i + (c % 2) * 0.5) * cw + j / 2, y - ph + j / 2, cw - j, ph - j));
        // the half-shifted panel that wraps around the repeat edge
        y -= ph;
        c++;
      }
    } else if (layout === 'diamond') {
      const cols = fitCount(s.w, size), cw = s.w / cols, hh = cw / 2;
      for (let r = -1; r * hh < s.h + cw; r++) {
        for (let i = 0; i < cols; i++) {
          const cx = (i + 0.5 + (((r % 2) + 2) % 2 ? 0.5 : 0)) * cw, cy = s.h - r * hh;
          const a = hh - j * 0.7;
          put([[cx, cy - a], [cx + a, cy], [cx, cy + a], [cx - a, cy]]);
        }
      }
    } else { // scales: overlapping round-bottomed slates, lowest row first
      const cols = fitCount(s.w, size), cw = s.w / cols, step = cw * 0.5;
      const rows = Math.ceil(s.h / step) + 3;
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < cols; i++) {
          const cx = (i + 0.5 + (r % 2 ? 0.5 : 0)) * cw, bottom = s.h - r * step + cw * 0.25;
          const rad = cw / 2 - j / 2, top = bottom - rad - cw * 1.1;
          const pts: Pt[] = [[cx - rad, top], [cx + rad, top]];
          for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI; pts.push([cx + Math.cos(a) * rad, bottom - rad + Math.sin(a) * rad]); }
          put(pts, { ...o, cast: step * 0.18 });
        }
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Sheet and panel cladding: plate-wall
// ---------------------------------------------------------------------------------------------

const FIXINGS = ['none', 'tie', 'bolt', 'rivet', 'screw'] as const;

const plateWall: PainterDef = {
  id: 'plate-wall',
  surface: 'wall',
  description: 'Panel cladding: precast concrete with tie holes, bolted weathering-steel plates, riveted lapped plates, screw-fixed steel sheets. Every panel samples its own window of the material map.',
  colors: ['base', 'light', 'dark', 'joint'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT0,
    map: MAP_PARAM,
    plateW: { type: 'number', min: 0.2, max: 2.4, default: 1.2, doc: 'Plate width (m).' },
    plateH: { type: 'number', min: 0.2, max: 2.8, default: 0.6, doc: 'Plate height (m).' },
    reveal: { type: 'number', min: 0.002, max: 0.03, default: 0.012, doc: 'Joint or reveal width (m).' },
    fixing: { type: 'enum', values: FIXINGS, default: 'none', doc: 'Fixings: none, tie holes, corner bolts, rivet rows or screws.' },
    stagger: { type: 'number', min: 0, max: 0.5, default: 0, doc: 'Horizontal offset of alternate rows as a share of the plate width.' },
    lap: { type: 'number', min: 0, max: 1, default: 0, doc: 'Overlap shadow: every plate sits proud of the one below.' },
    variation: { type: 'number', min: 0, max: 1.4, default: 0.5, doc: 'Plate-to-plate tone variation.' },
    mapScale: { type: 'number', min: 0.2, max: 1.6, default: 0.8, doc: 'Metres covered by one map tile.' },
  },
  thumbSpan: 1.4,
  paint(ctx, s) {
    ctx.fillStyle = col(s, 3);
    ctx.fillRect(0, 0, s.w, s.h);
    const img = mapImage(s);
    const g = num(s, 'reveal'), lap = num(s, 'lap'), fixing = str(s, 'fixing'), stagger = num(s, 'stagger');
    const cols = fitCount(s.w, num(s, 'plateW'));
    const pw = s.w / cols;
    const ph = num(s, 'plateH');
    const o: FaceOpts = { tile: num(s, 'mapScale'), variation: num(s, 'variation'), relief: Math.min(0.006, g * 0.4 + 0.001), cast: Math.max(g, lap * 0.02) };
    const dark = col(s, 2), light = col(s, 1);
    // fixings are placed on a plate-relative grid
    const fix = (x: number, y: number, w: number, h: number): void => {
      const r = hair(s, fixing === 'tie' ? 0.014 : fixing === 'bolt' ? 0.012 : 0.007, 1.2);
      const inset = Math.min(0.06, w * 0.12, h * 0.2);
      const dots: Pt[] = [];
      if (fixing === 'tie') {
        const nx = Math.max(2, Math.round(w / 0.3)), ny = Math.max(1, Math.round(h / 0.3));
        for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) dots.push([x + (a + 0.5) * (w / nx), y + (b + 0.5) * (h / ny)]);
      } else if (fixing === 'bolt') {
        dots.push([x + inset, y + inset], [x + w - inset, y + inset], [x + inset, y + h - inset], [x + w - inset, y + h - inset]);
      } else if (fixing === 'rivet') {
        const n = Math.max(3, Math.round(w / 0.09));
        for (let a = 0; a < n; a++) { dots.push([x + (a + 0.5) * (w / n), y + inset * 0.5], [x + (a + 0.5) * (w / n), y + h - inset * 0.5]); }
        const m = Math.max(2, Math.round(h / 0.09));
        for (let b = 1; b < m; b++) { dots.push([x + inset * 0.5, y + b * (h / m)], [x + w - inset * 0.5, y + b * (h / m)]); }
      } else if (fixing === 'screw') {
        const n = Math.max(2, Math.round(w / 0.4));
        for (let a = 0; a < n; a++) dots.push([x + (a + 0.5) * (w / n), y + inset * 0.5], [x + (a + 0.5) * (w / n), y + h - inset * 0.5]);
      }
      for (const [dx, dy] of dots) {
        if (fixing === 'tie') {
          ctx.fillStyle = rgba('#000000', 0.55);
          ctx.beginPath(); ctx.arc(dx, dy, r, 0, TAU); ctx.fill();
          ctx.fillStyle = rgba('#ffffff', 0.18);
          ctx.beginPath(); ctx.arc(dx + r * 0.25, dy + r * 0.3, r * 0.6, 0, TAU); ctx.fill();
          ctx.fillStyle = rgba(dark, 0.9);
          ctx.beginPath(); ctx.arc(dx - r * 0.1, dy - r * 0.1, r * 0.75, 0, TAU); ctx.fill();
        } else {
          ctx.fillStyle = rgba('#000000', 0.4);
          ctx.beginPath(); ctx.arc(dx + r * 0.2, dy + r * 0.3, r, 0, TAU); ctx.fill();
          ctx.fillStyle = mix(dark, light, fixing === 'bolt' ? 0.35 : 0.6);
          ctx.beginPath(); ctx.arc(dx, dy, r, 0, TAU); ctx.fill();
          ctx.fillStyle = rgba('#ffffff', 0.55);
          ctx.beginPath(); ctx.arc(dx - r * 0.3, dy - r * 0.3, r * 0.35, 0, TAU); ctx.fill();
        }
      }
    };
    let y = s.h, row = 0;
    const rows = [];
    while (y > -ph) { rows.push({ y: y - ph, row }); y -= ph; row++; }
    // rows are listed from the floor up, so with a lap each upper plate overlaps the one beneath it
    for (const r of rows) {
      for (let i = 0; i < cols; i++) {
        const x = (i + (r.row % 2) * stagger) * pw;
        const key = wrappedKey(s, x + pw / 2, r.y + ph / 2);
        const pts = rectPts(x + g / 2, r.y + g / 2, pw - g, ph - g + (lap > 0 ? ph * 0.04 : 0));
        unit(ctx, s, img, pts, key, o, () => { if (fixing !== 'none') fix(x + g / 2, r.y + g / 2, pw - g, ph - g); });
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Standing-seam sheet metal: seam-metal
// ---------------------------------------------------------------------------------------------

const seamMetal: PainterDef = {
  id: 'seam-metal',
  surface: 'wall',
  description: 'Vertical standing-seam metal pans: each pan samples its own window of a metal map and is closed by a raised double-lock seam.',
  colors: ['base', 'light', 'dark', 'seam'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT0,
    map: MAP_PARAM,
    pan: { type: 'number', min: 0.2, max: 0.8, default: 0.4, doc: 'Pan width between seams (m).' },
    seam: { type: 'number', min: 0.01, max: 0.04, default: 0.022, doc: 'Seam width (m).' },
    variation: { type: 'number', min: 0, max: 1.4, default: 0.7, doc: 'Pan-to-pan tone variation.' },
    mapScale: { type: 'number', min: 0.2, max: 1.6, default: 0.9, doc: 'Metres covered by one map tile.' },
  },
  thumbSpan: 1.4,
  paint(ctx, s) {
    const img = mapImage(s);
    const n = fitCount(s.w, num(s, 'pan'));
    const pw = s.w / n, sm = num(s, 'seam');
    ctx.fillStyle = col(s, 0);
    ctx.fillRect(0, 0, s.w, s.h);
    for (let i = 0; i < n; i++) {
      const x = i * pw;
      unit(ctx, s, img, rectPts(x, 0, pw, s.h), wrappedKey(s, x + pw / 2, 1), { tile: num(s, 'mapScale'), variation: num(s, 'variation'), relief: 0, cast: 0 }, () => {
        // gentle pan sheen: a broad soft lift in the middle of the pan
        ctx.fillStyle = rgba('#ffffff', 0.06);
        ctx.fillRect(x + pw * 0.3, 0, pw * 0.4, s.h);
      });
    }
    for (let i = 0; i < n; i++) {
      const x = i * pw - sm / 2;
      drawWrapped(ctx, s, x - sm, 0, x + 2 * sm, s.h, () => {
        ctx.fillStyle = rgba('#000000', 0.22);
        ctx.fillRect(x + sm * 0.9, 0, sm * 1.1, s.h);
        ctx.fillStyle = col(s, 3);
        ctx.fillRect(x, 0, sm, s.h);
        ctx.fillStyle = rgba('#ffffff', 0.4);
        ctx.fillRect(x, 0, sm * 0.3, s.h);
        ctx.fillStyle = rgba('#000000', 0.3);
        ctx.fillRect(x + sm * 0.75, 0, sm * 0.25, s.h);
      });
    }
    // cross laps every so often, staggered between pans
    const lapH = 1.1;
    ctx.fillStyle = rgba('#000000', 0.16);
    for (let i = 0; i < n; i++) {
      const rng = rngFor(s.seed, 55, i);
      for (let y = s.h - rng.next() * lapH; y > 0; y -= lapH) ctx.fillRect(i * pw + sm, y, pw - sm * 2, hair(s, 0.003));
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Diamond tread plate: tread-wall
// ---------------------------------------------------------------------------------------------

const treadWall: PainterDef = {
  id: 'tread-wall',
  surface: 'wall',
  description: 'Diamond (checker) tread plate as wall cladding: raised lozenges in alternating directions over a brushed steel map, in sheets with screwed joints.',
  colors: ['base', 'light', 'dark', 'joint'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT0,
    map: MAP_PARAM,
    pitch: { type: 'number', min: 0.02, max: 0.08, default: 0.04, doc: 'Distance between lozenges (m).' },
    sheetW: { type: 'number', min: 0.4, max: 2.4, default: 1.2, doc: 'Sheet width (m).' },
    sheetH: { type: 'number', min: 0.4, max: 2.8, default: 1.4, doc: 'Sheet height (m).' },
    mapScale: { type: 'number', min: 0.2, max: 1.6, default: 0.9, doc: 'Metres covered by one map tile.' },
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    const img = mapImage(s);
    const cols = fitCount(s.w, num(s, 'sheetW')), sw = s.w / cols, sh = num(s, 'sheetH');
    ctx.fillStyle = col(s, 3);
    ctx.fillRect(0, 0, s.w, s.h);
    const p = num(s, 'pitch');
    const per = fitCount(sw, p * 2) * 2; // lozenges per sheet row (even so directions alternate cleanly)
    const lx = sw / per;
    let y = s.h, r = 0;
    while (y > -sh) {
      for (let i = 0; i < cols; i++) {
        const x0 = i * sw, y0 = y - sh;
        const pts = rectPts(x0 + 0.003, y0 + 0.003, sw - 0.006, sh - 0.006);
        unit(ctx, s, img, pts, wrappedKey(s, x0 + sw / 2, y0 + sh / 2), { tile: num(s, 'mapScale'), variation: 0.4, relief: 0.003, cast: 0.004 }, () => {
          const lw = hair(s, lx * 0.18, 1.1);
          ctx.lineCap = 'round';
          const ly = lx;
          const rows = Math.ceil(sh / ly);
          for (let a = 0; a < rows; a++) {
            for (let b = 0; b < per; b++) {
              const cx = x0 + (b + 0.5) * lx, cy = y0 + (a + 0.5) * ly;
              if (cx > x0 + sw - lx * 0.3 || cx < x0 + lx * 0.3 || cy > y0 + sh - ly * 0.3) continue;
              const dir = (a + b) % 2 === 0 ? 1 : -1; // directions alternate on the lattice
              const dx = lx * 0.3 * dir, dy = lx * 0.3;
              ctx.lineWidth = lw * 1.9;
              ctx.strokeStyle = rgba('#000000', 0.26);
              ctx.beginPath(); ctx.moveTo(cx - dx + 0.0015, cy - dy + 0.002); ctx.lineTo(cx + dx + 0.0015, cy + dy + 0.002); ctx.stroke();
              ctx.lineWidth = lw * 1.5;
              ctx.strokeStyle = rgba(col(s, 1), 0.85);
              ctx.beginPath(); ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx + dx, cy + dy); ctx.stroke();
              ctx.lineWidth = lw * 0.5;
              ctx.strokeStyle = rgba('#ffffff', 0.45);
              ctx.beginPath(); ctx.moveTo(cx - dx - 0.0008, cy - dy - 0.0008); ctx.lineTo(cx + dx - 0.0008, cy + dy - 0.0008); ctx.stroke();
            }
          }
        });
      }
      y -= sh;
      r++;
    }
    void r;
    void fromFloor;
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Pierced screen blocks: breeze-block
// ---------------------------------------------------------------------------------------------

const breezeBlock: PainterDef = {
  id: 'breeze-block',
  surface: 'wall',
  description: 'Pierced concrete screen blocks in stack bond: square blocks with round, diamond or cross cut-outs that show a dark void behind.',
  colors: ['base', 'light', 'dark', 'void'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT0,
    map: MAP_PARAM,
    pattern: { type: 'enum', values: ['circle', 'diamond', 'cross', 'quad'], default: 'circle', doc: 'Shape of the openings.' },
    block: { type: 'number', min: 0.15, max: 0.4, default: 0.2, doc: 'Block size (m).' },
    joint: { type: 'number', min: 0.004, max: 0.02, default: 0.008, doc: 'Joint width (m).' },
    mapScale: { type: 'number', min: 0.2, max: 1.6, default: 0.7, doc: 'Metres covered by one map tile.' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    const img = mapImage(s);
    const n = fitCount(s.w, num(s, 'block')), bs = s.w / n, j = num(s, 'joint'), pattern = str(s, 'pattern');
    ctx.fillStyle = col(s, 3);
    ctx.fillRect(0, 0, s.w, s.h);
    const rows = Math.ceil(s.h / bs) + 1;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < n; i++) {
        const x = i * bs, y = s.h - (r + 1) * bs;
        unit(ctx, s, img, rectPts(x + j / 2, y + j / 2, bs - j, bs - j), wrappedKey(s, x + bs / 2, y + bs / 2),
          { tile: num(s, 'mapScale'), variation: 0.35, relief: 0.003, cast: 0 }, () => {
            const cx = x + bs / 2, cy = y + bs / 2, q = bs * 0.5;
            const hole = (hx: number, hy: number, rr: number, shape: string): void => {
              const path = () => {
                ctx.beginPath();
                if (shape === 'circle') ctx.arc(hx, hy, rr, 0, TAU);
                else { ctx.moveTo(hx, hy - rr); ctx.lineTo(hx + rr, hy); ctx.lineTo(hx, hy + rr); ctx.lineTo(hx - rr, hy); ctx.closePath(); }
              };
              path();
              ctx.fillStyle = col(s, 3);
              ctx.fill();
              // inner shadow on the upper-left lip of the opening, light catching the lower-right
              ctx.save(); path(); ctx.clip();
              ctx.fillStyle = rgba('#000000', 0.5);
              ctx.fillRect(hx - rr, hy - rr, rr * 2, rr * 0.7);
              ctx.fillStyle = rgba('#ffffff', 0.12);
              ctx.fillRect(hx - rr, hy + rr * 0.55, rr * 2, rr * 0.5);
              ctx.restore();
            };
            if (pattern === 'circle') hole(cx, cy, bs * 0.36, 'circle');
            else if (pattern === 'diamond') hole(cx, cy, bs * 0.4, 'diamond');
            else if (pattern === 'quad') for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) hole(cx + a * q * 0.5, cy + b * q * 0.5, bs * 0.17, 'circle');
            else { // cross: four diamonds around a small centre one
              for (const [a, b] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) hole(cx + a * q * 0.55, cy + b * q * 0.55, bs * 0.15, 'diamond');
            }
          });
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Peeled plaster over brick: peeled-plaster
// ---------------------------------------------------------------------------------------------

const peeledPlaster: PainterDef = {
  id: 'peeled-plaster',
  surface: 'wall',
  description: 'A rendered wall that has lost patches of its plaster: running-bond brick shows through ragged holes, with a shadowed, crumbling edge.',
  colors: ['plaster', 'plasterLight', 'plasterDark', 'brick'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT0,
    map: MAP_PARAM,
    brickMap: MAP_PARAM,
    patches: { type: 'number', min: 1, max: 12, default: 5, integer: true, doc: 'Bare brick patches per repeat.' },
    size: { type: 'number', min: 0.3, max: 1.4, default: 0.7, doc: 'Typical patch size (m).' },
    mapScale: { type: 'number', min: 0.2, max: 1.6, default: 0.9, doc: 'Metres covered by one plaster-map tile.' },
  },
  thumbSpan: 1.4,
  paint(ctx, s) {
    const plasterImg = mapImage(s, 'map');
    const brickCol = col(s, 3);
    const brickImg = mapImage(s, 'brickMap', [brickCol, shade(brickCol, 0.25), shade(brickCol, -0.3)]);
    const rng = rngFor(s.seed, 61);
    const S = 0.215, B = 0.065, j = 0.01, cs = S + j, cb = B + j;
    const m = fitCount(s.w, cs), k = s.w / (m * cs);
    // the plaster: one full layer drawn through a clip made of the wall minus the holes (even-odd via many fills)
    const holes: Array<{ cx: number; cy: number; pts: Pt[] }> = [];
    for (let p = 0; p < Math.round(num(s, 'patches')); p++) {
      const cx = rng.next() * s.w, cy = 0.2 + rng.next() * (s.h - 0.5);
      const size = num(s, 'size') * (0.5 + rng.next() * 0.9);
      holes.push({ cx, cy, pts: blob(cx, cy, size * (0.7 + rng.next() * 0.5), size * (0.5 + rng.next() * 0.4), 18, 0.4, rng) });
    }
    // paint plaster in vertical strips whose bottom/top avoid holes is complex; instead draw plaster everywhere, then
    // redraw the brick layer inside each hole by clipping to it.
    ctx.save();
    ctx.fillStyle = col(s, 0);
    ctx.fillRect(0, 0, s.w, s.h);
    drawMapRect(ctx, plasterImg, 0, 0, s.w, s.h, num(s, 'mapScale'), 0, 0, s.ppm);
    ctx.restore();
    for (const h of holes) {
      const b = bounds(h.pts);
      drawWrapped(ctx, s, b.x0 - 0.05, b.y0 - 0.05, b.x1 + 0.05, b.y1 + 0.05, () => {
        // crumbling rim, then the brick window
        ctx.save();
        polyPath(ctx, h.pts);
        ctx.lineWidth = 0.02;
        ctx.strokeStyle = rgba(col(s, 2), 0.7);
        ctx.stroke();
        ctx.clip();
        ctx.fillStyle = shade(col(s, 3), -0.3);
        ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
        for (let c = Math.floor(b.y0 / cb) - 1; c * cb < b.y1 + cb; c++) {
          const y = c * cb;
          for (let i = -1; i < m + 1; i++) {
            const x = (i + (((c % 2) + 2) % 2) * 0.5) * cs * k;
            if (x > b.x1 || x + cs * k < b.x0) continue;
            const wrapped = ((Math.round(x / (cs * k)) % m) + m) % m;
            const key = mixKey(wrapped, c);
            const rr = rngFor(s.seed, key, 3);
            const bx = x + j / 2, by = y + j / 2, bw = cs * k - j, bh = cb - j;
            if (!drawMapRect(ctx, brickImg, bx, by, bw, bh, 0.5, bx - rr.next() * 0.5, by - rr.next() * 0.5, s.ppm)) {
              ctx.fillStyle = col(s, 3);
              ctx.fillRect(bx, by, bw, bh);
            }
            const t = (rr.next() - 0.5) * 0.5;
            ctx.fillStyle = rgba(t > 0 ? col(s, 1) : col(s, 2), Math.abs(t));
            ctx.fillRect(bx, by, bw, bh);
          }
        }
        // inner shadow along the plaster edge
        polyPath(ctx, h.pts);
        ctx.lineWidth = 0.035;
        ctx.strokeStyle = rgba('#000000', 0.35);
        ctx.stroke();
        ctx.restore();
        // plaster edge thickness: a light line on the lit side
        polyPath(ctx, h.pts);
        ctx.lineWidth = hair(s, 0.004);
        ctx.strokeStyle = rgba(col(s, 1), 0.7);
        ctx.stroke();
      });
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 2));
  },
};

function mixKey(a: number, b: number): number {
  return (Math.imul(a + 7919, 2654435761) ^ Math.imul(b + 104729, 40503)) >>> 0;
}

export const PAINTERS_WALLS_F: PainterDef[] = [bondBrick, stoneSet, plateWall, seamMetal, treadWall, breezeBlock, peeledPlaster];
