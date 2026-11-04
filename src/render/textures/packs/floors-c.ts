// Family-specific painters of surface group 'floors-c' (M10 surfaces): carpets and textiles, concrete and industrial,
// exterior paving, decking, gravel and paths. The AI-generated maps supply the materials (pile, weave, stone, timber,
// pebbles); the layouts (bonds, stones, setts, patterns, gratings) are drawn here. Without images (tests, first paint)
// every painter draws a flat, speckled fallback of the same layout.
//
//   paver-bond      units in stack, running, ashlar, basket, herringbone or pinwheel bond (pavers, slabs, boards, tiles, plates)
//   carpet-pattern  woven patterns: stripe, houndstooth, tartan, trellis over a pile map
//   crazy-paving    irregular flagstones (seamless Voronoi cells)
//   stepping-stones stones set in a ground map (gravel, lawn, bark)
//   fan-setts       cobble setts laid in overlapping fans
//   grass-pavers    concrete grass blocks with grass-filled holes
//   raked-garden    raked gravel or sand with wavy furrows and boulders
//   grating         steel bar grating over a dark void
//   rubber-floor    rubber tiles with studs, ribs or coins

import type { Rng } from '../../../core/rng';
import {
  SEED_PARAM, col, drawWrapped, fitCount, flag, hair, num, polygonPath, rgba, rngFor, roundRectPath, shade, softBlob,
  speckle, str, type Canvas2DLike, type PaintSpec, type PainterDef, type ParamSpec,
} from '../painterKit';
import { MAP_IDS, drawMapRect, surfaceMapImage } from '../mapKit';
import { partition } from '../floorPainters';

const TAU = Math.PI * 2;

const mapParam = (doc: string, def = ''): ParamSpec => ({ type: 'enum', values: ['', ...MAP_IDS], default: def, doc });

/** Fills a rectangle with a map tinted by `tint` ([base, light, dark]) or, without it, flat base plus speckle. */
function texFill(
  ctx: Canvas2DLike, s: PaintSpec, mapId: string, tint: readonly string[], x: number, y: number, w: number, h: number,
  tileM: number, ox: number, oy: number, rng: Rng, speck = 0.06,
): void {
  const img = mapId === '' ? null : surfaceMapImage(mapId, tint);
  if (drawMapRect(ctx, img, x, y, w, h, tileM, ox, oy, s.ppm)) return;
  ctx.fillStyle = tint[0] ?? '#888888';
  ctx.fillRect(x, y, w, h);
  speckle(ctx, s, rng, speck, [tint[1] ?? '#aaaaaa', tint[2] ?? '#666666'], 0.35, 1.4, { x, y, w, h });
}

/** Seamless map tile edge for a whole-repeat fill: tiles per repeat rounded to fit. */
const tileFor = (s: PaintSpec, metres: number) => s.w / Math.max(1, Math.round(s.w / metres));

// ---------------------------------------------------------------------------------------------
// paver-bond
// ---------------------------------------------------------------------------------------------

const BONDS = ['stack', 'running', 'ashlar', 'basket', 'herringbone', 'pinwheel'] as const;
type Unit = { x: number; y: number; w: number; h: number; k: number };

/** Every unit of one repeat (metres). Units may cross the repeat edge; drawWrapped adds the copies. */
export function bondUnits(s: PaintSpec): Unit[] {
  const bond = str(s, 'bond');
  const u = num(s, 'unitW'), v = num(s, 'unitH');
  const out: Unit[] = [];
  const push = (x: number, y: number, w: number, h: number, k: number) => out.push({ x, y, w, h, k });
  if (bond === 'stack' || bond === 'running') {
    const running = bond === 'running';
    const nx = fitCount(s.w, u), ny = fitCount(s.h, v, running ? 2 : 1, running ? 2 : 1);
    const cw = s.w / nx, ch = s.h / ny;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) push(i * cw + (running && j % 2 ? cw / 2 : 0), j * ch, cw, ch, i * 97 + j);
  } else if (bond === 'ashlar') {
    // random coursed rows: row heights 2-3 modules, stone widths 2-4 modules (module = unitH)
    const cells = fitCount(s.w, v, 6);
    const mod = s.w / cells;
    const rng = rngFor(s.seed, 61);
    let y = 0;
    partition(cells, [2, 3], rng).forEach((hm, r) => {
      const rr = rngFor(s.seed, 62, r);
      let x = Math.floor(rr.next() * cells) * mod;
      partition(cells, [2, 3, 4], rr).forEach((wm, i) => {
        push(x >= s.w - 1e-9 ? x - s.w : x, y, wm * mod, hm * mod, r * 31 + i);
        x += wm * mod;
      });
      y += hm * mod;
    });
  } else if (bond === 'basket') {
    // square blocks of `per` bricks, alternating direction
    const per = Math.max(2, Math.round(num(s, 'per')));
    const n = fitCount(s.w, u, 2, 2);
    const L = s.w / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        for (let q = 0; q < per; q++) {
          if ((i + j) % 2 === 0) push(i * L, j * L + (q * L) / per, L, L / per, (i * 41 + j) * 7 + q);
          else push(i * L + (q * L) / per, j * L, L / per, L, (i * 41 + j) * 7 + q);
        }
      }
    }
  } else if (bond === 'herringbone') {
    // axis-aligned herringbone: brick = 2 x 1 modules, horizontal bricks where (x + y) % 4 = 0, vertical where it is 2
    const N = Math.max(4, Math.round(s.w / v / 4) * 4);
    const t = s.w / N;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const m = (x + y) % 4;
        if (m === 0) push(x * t, y * t, 2 * t, t, x * 53 + y);
        else if (m === 2) push(x * t, y * t, t, 2 * t, x * 53 + y);
      }
    }
  } else {
    // pinwheel: four 2 x 1 bricks around a 1 x 1 square, in a 3 x 3 module unit
    const n = fitCount(s.w, u * 1.5);
    const t = s.w / (3 * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const ox = i * 3 * t, oy = j * 3 * t, k = (i * 71 + j) * 5;
        push(ox, oy, 2 * t, t, k);
        push(ox + 2 * t, oy, t, 2 * t, k + 1);
        push(ox + t, oy + 2 * t, 2 * t, t, k + 2);
        push(ox, oy + t, t, 2 * t, k + 3);
        push(ox + t, oy + t, t, t, k + 4);
      }
    }
  }
  return out;
}

const paverBond: PainterDef = {
  id: 'paver-bond',
  surface: 'floor',
  description: 'Rectangular units (pavers, slabs, boards, carpet tiles, plates) in stack, running, random ashlar, basket-weave, herringbone or pinwheel bond, each cut from a tinted material map with its own tone, chamfer and joint.',
  colors: ['base', 'light', 'dark', 'joint'],
  params: {
    seed: SEED_PARAM,
    map: mapParam('Material map under the units; empty = flat speckle.'),
    bond: { type: 'enum', values: BONDS, default: 'running', doc: 'stack, running (odd rows half a unit over), ashlar (random coursed), basket (square blocks of `per` units), herringbone (2 x 1 module bricks, module = unitH), pinwheel (four bricks round a square).' },
    unitW: { type: 'number', min: 0.08, max: 1.5, default: 0.2, doc: 'Unit length (m); basket: block side; pinwheel: brick length.' },
    unitH: { type: 'number', min: 0.03, max: 1.0, default: 0.1, doc: 'Unit width (m); ashlar and herringbone: layout module.' },
    per: { type: 'number', min: 2, max: 5, default: 2, integer: true, doc: 'Basket bond: units per block.' },
    joint: { type: 'number', min: 0.0005, max: 0.03, default: 0.006, doc: 'Joint width (m).' },
    mapScale: { type: 'number', min: 0.2, max: 2.4, default: 0.6, doc: 'Metres covered by one map tile on a unit.' },
    grainAlong: { type: 'boolean', default: false, doc: 'Turn the map so its grain follows the long side of every unit (boards).' },
    variation: { type: 'number', min: 0, max: 1, default: 0.5, doc: 'Unit-to-unit tone variation.' },
    bevel: { type: 'number', min: 0, max: 1, default: 0.5, doc: 'Chamfer highlight and shade on the edges.' },
    round: { type: 'number', min: 0, max: 0.5, default: 0.05, doc: 'Corner rounding as a share of the short side.' },
    rivets: { type: 'boolean', default: false, doc: 'A rivet in each corner (steel plates).' },
  },
  thumbSpan: 1.4,
  paint(ctx, s) {
    const joint = col(s, 3);
    ctx.fillStyle = joint;
    ctx.fillRect(0, 0, s.w, s.h);
    const g = hair(s, num(s, 'joint'));
    const mapId = str(s, 'map');
    const tint = [col(s, 0), col(s, 1), col(s, 2)];
    const tileM = num(s, 'mapScale');
    const variation = num(s, 'variation'), bevel = num(s, 'bevel');
    const along = flag(s, 'grainAlong');
    for (const un of bondUnits(s)) {
      const rng = rngFor(s.seed, 910, un.k, Math.round(un.x * 1000), Math.round(un.y * 1000));
      const x = un.x + g / 2, y = un.y + g / 2, w = un.w - g, h = un.h - g;
      if (w <= 0 || h <= 0) continue;
      const toneRoll = rng.next(), toneAmt = rng.next(), shadeAmt = (rng.next() - 0.5) * 0.08 * variation;
      const px = rng.next() * tileM, py = rng.next() * tileM;
      drawWrapped(ctx, s, un.x, un.y, un.x + un.w, un.y + un.h, () => {
        ctx.save();
        ctx.beginPath();
        roundRectPath(ctx, x, y, w, h, Math.min(w, h) * num(s, 'round'));
        ctx.clip();
        if (along && h > w && mapId !== '') {
          ctx.save();
          ctx.translate(x + w / 2, y + h / 2);
          ctx.rotate(Math.PI / 2);
          texFill(ctx, s, mapId, tint, -h / 2, -w / 2, h, w, tileM, -px, -py, rng);
          ctx.restore();
        } else {
          texFill(ctx, s, mapId, tint, x, y, w, h, tileM, x - px, y - py, rng);
        }
        // tone drift: some units lean light, some dark
        if (toneRoll < 0.34) { ctx.fillStyle = rgba(col(s, 1), toneAmt * 0.3 * variation); ctx.fillRect(x, y, w, h); }
        else if (toneRoll < 0.68) { ctx.fillStyle = rgba(col(s, 2), toneAmt * 0.3 * variation); ctx.fillRect(x, y, w, h); }
        if (shadeAmt !== 0) { ctx.fillStyle = rgba(shadeAmt > 0 ? '#ffffff' : '#000000', Math.abs(shadeAmt)); ctx.fillRect(x, y, w, h); }
        if (bevel > 0) {
          const e = Math.min(hair(s, 0.004), w / 4, h / 4);
          ctx.fillStyle = rgba('#ffffff', 0.16 * bevel);
          ctx.fillRect(x, y, w, e);
          ctx.fillRect(x, y, e, h);
          ctx.fillStyle = rgba('#000000', 0.2 * bevel);
          ctx.fillRect(x, y + h - e, w, e);
          ctx.fillRect(x + w - e, y, e, h);
        }
        ctx.restore();
        if (flag(s, 'rivets')) {
          const r = Math.min(w, h) * 0.035, d = Math.min(w, h) * 0.09;
          for (const [rx, ry] of [[x + d, y + d], [x + w - d, y + d], [x + d, y + h - d], [x + w - d, y + h - d]] as const) {
            ctx.fillStyle = rgba('#000000', 0.35);
            ctx.beginPath();
            ctx.arc(rx + r * 0.3, ry + r * 0.4, r, 0, TAU);
            ctx.fill();
            ctx.fillStyle = shade(col(s, 0), 0.25);
            ctx.beginPath();
            ctx.arc(rx, ry, r, 0, TAU);
            ctx.fill();
          }
        }
      });
    }
  },
};

// ---------------------------------------------------------------------------------------------
// carpet-pattern
// ---------------------------------------------------------------------------------------------

const STYLES = ['stripe', 'houndstooth', 'tartan', 'trellis'] as const;

/** Tartan sett: [colour role, width]. Roles 0 ground, 1 pattern, 2 second, 3 accent. */
const SETT: ReadonlyArray<readonly [number, number]> = [[0, 10], [1, 5], [0, 2], [2, 8], [0, 2], [3, 1], [0, 2], [2, 8], [0, 2], [1, 5]];

const carpetPattern: PainterDef = {
  id: 'carpet-pattern',
  surface: 'floor',
  description: 'Woven carpet patterns drawn flat and then covered with a pile map: broad stripes with pin lines, houndstooth (a 2/2 twill of 4-thread checks), tartan sett, or a diamond trellis with dots at the crossings.',
  colors: ['ground', 'patternA', 'patternB', 'accent'],
  params: {
    seed: SEED_PARAM,
    style: { type: 'enum', values: STYLES, default: 'stripe', doc: 'stripe, houndstooth, tartan or trellis.' },
    size: { type: 'number', min: 0.05, max: 1.2, default: 0.3, doc: 'Metres of one stripe group, 8-thread houndstooth module, tartan sett or trellis diamond (rounded to fit the repeat).' },
    pile: mapParam('Pile map drawn over the pattern for fibre texture.'),
    pileAlpha: { type: 'number', min: 0, max: 0.6, default: 0.22, doc: 'Strength of the pile map over the pattern.' },
    pileScale: { type: 'number', min: 0.2, max: 2.4, default: 0.6, doc: 'Metres covered by one pile map tile.' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    const style = str(s, 'style');
    ctx.fillStyle = col(s, 0);
    ctx.fillRect(0, 0, s.w, s.h);
    if (style === 'stripe') {
      const n = fitCount(s.w, num(s, 'size'));
      const gw = s.w / n;
      // group: wide band, pin line pair, narrow band (fractions of the group)
      const parts: ReadonlyArray<readonly [number, number, number]> = [[0.06, 0.34, 1], [0.5, 0.04, 3], [0.58, 0.04, 3], [0.7, 0.2, 2]];
      for (let i = 0; i < n; i++) {
        for (const [a, b, role] of parts) {
          ctx.fillStyle = col(s, role);
          ctx.fillRect(i * gw + a * gw, 0, b * gw, s.h);
        }
      }
    } else if (style === 'houndstooth') {
      const p = s.w / (8 * fitCount(s.w, num(s, 'size')));
      const N = Math.round(s.w / p);
      const dark = col(s, 1), light = col(s, 0);
      for (let y = 0; y < N; y++) {
        let run = 0, runColor = '';
        for (let x = 0; x <= N; x++) {
          // warp thread colour at x, weft thread colour at y, 2/2 twill decides which shows
          const c = x < N ? (((x + y) % 4) < 2 ? ((x % 8) < 4 ? dark : light) : ((y % 8) < 4 ? dark : light)) : '';
          if (c === runColor) { run++; continue; }
          if (runColor === dark) { ctx.fillStyle = dark; ctx.fillRect((x - run) * p, y * p, run * p + 0.0004, p + 0.0004); }
          runColor = c; run = 1;
        }
      }
      // accent: a faint overcheck every four modules
      ctx.fillStyle = rgba(col(s, 3), 0.55);
      const step = s.w / fitCount(s.w, num(s, 'size') * 4);
      for (let k = 0; k < s.w / step; k++) {
        ctx.fillRect(k * step + step * 0.5 - p * 0.3, 0, p * 0.6, s.h);
        ctx.fillRect(0, k * step + step * 0.5 - p * 0.3, s.w, p * 0.6);
      }
    } else if (style === 'tartan') {
      const total = SETT.reduce((t, [, w]) => t + w, 0);
      const n = fitCount(s.w, num(s, 'size') * 2);
      const unit = s.w / n / total;
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = pass === 0 ? 1 : 0.58;
        for (let k = 0; k < n; k++) {
          let pos = k * total * unit;
          for (const [role, w] of SETT) {
            if (role !== 0) {
              ctx.fillStyle = col(s, role);
              if (pass === 0) ctx.fillRect(pos, 0, w * unit, s.h);
              else ctx.fillRect(0, pos, s.w, w * unit);
            }
            pos += w * unit;
          }
        }
      }
      ctx.globalAlpha = 1;
      // 2/2 twill: fine diagonal lines
      ctx.strokeStyle = rgba('#000000', 0.07);
      ctx.lineWidth = hair(s, 0.0015, 0.7);
      const sp = 0.007;
      ctx.beginPath();
      for (let d = -s.h; d < s.w; d += sp) { ctx.moveTo(d, 0); ctx.lineTo(d + s.h, s.h); }
      ctx.stroke();
    } else {
      const n = fitCount(s.w, num(s, 'size'));
      const c = s.w / n;
      ctx.strokeStyle = col(s, 1);
      ctx.lineWidth = Math.max(c * 0.06, hair(s, 0.004));
      ctx.lineCap = 'butt';
      ctx.beginPath();
      for (let k = -2 * n; k <= 3 * n; k++) {
        ctx.moveTo(-c, -c - k * c); ctx.lineTo(s.w + c, s.w + c - k * c);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let k = -2 * n; k <= 3 * n; k++) {
        ctx.moveTo(-c, k * c + c); ctx.lineTo(s.w + c, k * c - s.w - c);
      }
      ctx.stroke();
      // dots on the crossings, a small flower in the middle of every diamond
      for (let j = 0; j <= 2 * n; j++) {
        for (let i = 0; i <= n; i++) {
          const x = i * c + (j % 2 ? c / 2 : 0), y = (j * c) / 2;
          ctx.fillStyle = col(s, 2);
          ctx.beginPath();
          ctx.arc(x, y, c * 0.07, 0, TAU);
          ctx.fill();
        }
      }
      // the diamond centres sit half a step from the crossings
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          for (const [x, y] of [[(i + 0.5) * c, j * c], [i * c, (j + 0.5) * c]] as const) {
            ctx.fillStyle = rgba(col(s, 3), 0.9);
            for (let q = 0; q < 4; q++) {
              ctx.beginPath();
              ctx.arc(x + Math.cos((q * TAU) / 4) * c * 0.06, y + Math.sin((q * TAU) / 4) * c * 0.06, c * 0.045, 0, TAU);
              ctx.fill();
            }
          }
        }
      }
    }
    const pile = str(s, 'pile');
    const rng = rngFor(s.seed, 7);
    if (pile !== '') {
      const img = surfaceMapImage(pile, ['#808080', '#ffffff', '#000000']);
      if (img) {
        ctx.globalAlpha = num(s, 'pileAlpha');
        drawMapRect(ctx, img, 0, 0, s.w, s.h, tileFor(s, num(s, 'pileScale')), 0, 0, s.ppm);
        ctx.globalAlpha = 1;
      }
    }
    speckle(ctx, s, rng, 0.05, [shade(col(s, 0), 0.2), shade(col(s, 0), -0.25)], 0.2, 1.2);
  },
};

// ---------------------------------------------------------------------------------------------
// crazy-paving
// ---------------------------------------------------------------------------------------------

type Pt = [number, number];

/** Keeps the part of a convex polygon with nx*x + ny*y <= d. */
function clipPoly(poly: Pt[], nx: number, ny: number, d: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Pt, b = poly[(i + 1) % poly.length] as Pt;
    const da = nx * a[0] + ny * a[1] - d, db = nx * b[0] + ny * b[1] - d;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Cells of a seamless jittered Voronoi diagram, inset by half a joint. Positions in metres (may cross the repeat). */
export function voronoiCells(s: PaintSpec, n: number, jitter: number, joint: number): Array<{ poly: Pt[]; seed: Pt; k: number }> {
  const cw = s.w / n, ch = s.h / n;
  const seedAt = (i: number, j: number): Pt => {
    const wi = ((i % n) + n) % n, wj = ((j % n) + n) % n;
    const r = rngFor(s.seed, 81, wi, wj);
    const ox = Math.floor(i / n) * s.w, oy = Math.floor(j / n) * s.h;
    return [(wi + 0.5 + (r.next() - 0.5) * jitter) * cw + ox, (wj + 0.5 + (r.next() - 0.5) * jitter) * ch + oy];
  };
  const out: Array<{ poly: Pt[]; seed: Pt; k: number }> = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const p = seedAt(i, j);
      let poly: Pt[] = [[p[0] - cw * 3, p[1] - ch * 3], [p[0] + cw * 3, p[1] - ch * 3], [p[0] + cw * 3, p[1] + ch * 3], [p[0] - cw * 3, p[1] + ch * 3]];
      for (let dj = -2; dj <= 2; dj++) {
        for (let di = -2; di <= 2; di++) {
          if (di === 0 && dj === 0) continue;
          const q = seedAt(i + di, j + dj);
          const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
          const nx = dx / len, ny = dy / len;
          poly = clipPoly(poly, nx, ny, nx * ((p[0] + q[0]) / 2) + ny * ((p[1] + q[1]) / 2) - joint / 2);
          if (poly.length < 3) break;
        }
        if (poly.length < 3) break;
      }
      if (poly.length >= 3) out.push({ poly, seed: p, k: i * 37 + j });
    }
  }
  return out;
}

const crazyPaving: PainterDef = {
  id: 'crazy-paving',
  surface: 'floor',
  description: 'Irregular flagstones: a seamless jittered Voronoi layout of angular stones with mortar joints, each with its own tone and crisp edges.',
  colors: ['stoneA', 'stoneB', 'stoneC', 'joint'],
  params: {
    seed: SEED_PARAM,
    map: mapParam('Stone material map; empty = flat speckle.'),
    cells: { type: 'number', min: 3, max: 14, default: 7, integer: true, doc: 'Stones across one repeat.' },
    jitter: { type: 'number', min: 0, max: 1.2, default: 0.8, doc: 'How irregular the stone sizes and shapes are.' },
    joint: { type: 'number', min: 0.004, max: 0.04, default: 0.014, doc: 'Joint width (m).' },
    mapScale: { type: 'number', min: 0.2, max: 2.4, default: 0.7, doc: 'Metres covered by one map tile.' },
    variation: { type: 'number', min: 0, max: 1, default: 0.6, doc: 'Stone-to-stone tone variation.' },
  },
  thumbSpan: 1.6,
  paint(ctx, s) {
    ctx.fillStyle = col(s, 3);
    ctx.fillRect(0, 0, s.w, s.h);
    const rng0 = rngFor(s.seed, 9);
    speckle(ctx, s, rng0, 0.04, [shade(col(s, 3), 0.25), shade(col(s, 3), -0.3)], 0.55, 1.5);
    const mapId = str(s, 'map');
    const tileM = num(s, 'mapScale');
    const variation = num(s, 'variation');
    const stones = [col(s, 0), col(s, 1), col(s, 2)];
    for (const c of voronoiCells(s, num(s, 'cells'), num(s, 'jitter'), hair(s, num(s, 'joint')))) {
      const xs = c.poly.map((p) => p[0]), ys = c.poly.map((p) => p[1]);
      const rng = rngFor(s.seed, 82, c.k);
      const base = stones[Math.floor(rng.next() * 3)] ?? col(s, 0);
      const tone = (rng.next() - 0.5) * 0.14 * variation;
      const px = rng.next() * tileM, py = rng.next() * tileM;
      drawWrapped(ctx, s, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), () => {
        ctx.save();
        ctx.beginPath();
        polygonPath(ctx, c.poly);
        ctx.clip();
        const bx = Math.min(...xs), by = Math.min(...ys);
        texFill(ctx, s, mapId, [shade(base, tone), shade(base, tone + 0.2), shade(base, tone - 0.28)], bx, by, Math.max(...xs) - bx, Math.max(...ys) - by, tileM, bx - px, by - py, rng);
        softBlob(ctx, c.seed[0], c.seed[1], 0.12, 0.09, rng.next() * 3, rng.next() < 0.5 ? '#ffffff' : '#000000', 0.1 * variation, 4);
        ctx.restore();
        ctx.strokeStyle = rgba('#000000', 0.28);
        ctx.lineWidth = hair(s, 0.003, 1);
        ctx.beginPath();
        polygonPath(ctx, c.poly);
        ctx.stroke();
        ctx.strokeStyle = rgba('#ffffff', 0.14);
        ctx.lineWidth = hair(s, 0.002, 0.8);
        ctx.beginPath();
        c.poly.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else if (i <= 2) ctx.lineTo(p[0], p[1]); });
        ctx.stroke();
      });
    }
  },
};

// ---------------------------------------------------------------------------------------------
// stepping-stones
// ---------------------------------------------------------------------------------------------

const SHAPES = ['round', 'square', 'flag'] as const;

function blobPoints(rng: Rng, cx: number, cy: number, rx: number, ry: number, shape: string, rot: number): Pt[] {
  const pts: Pt[] = [];
  const n = shape === 'round' ? 16 : shape === 'square' ? 4 : 7;
  const off = shape === 'square' ? Math.PI / 4 : rng.next() * TAU;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU;
    let r = 1;
    if (shape === 'round') r = 0.94 + rng.next() * 0.1;
    else if (shape === 'square') r = 1.42 * (0.9 + rng.next() * 0.1);
    else r = 0.8 + rng.next() * 0.3;
    const x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r;
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return pts;
}

const steppingStones: PainterDef = {
  id: 'stepping-stones',
  surface: 'floor',
  description: 'Stones set into a ground (gravel, lawn, bark) in staggered rows: round, squared or irregular flags, each with a soft shadow and its own tone.',
  colors: ['ground', 'groundLight', 'groundDark', 'stone', 'stoneLight', 'stoneDark'],
  params: {
    seed: SEED_PARAM,
    ground: mapParam('Ground map (gravel, lawn, bark chips).'),
    groundScale: { type: 'number', min: 0.2, max: 2.4, default: 1.2, doc: 'Metres covered by one ground map tile.' },
    map: mapParam('Stone material map; empty = flat speckle.'),
    shape: { type: 'enum', values: SHAPES, default: 'round', doc: 'Round stones, squared slabs or irregular flags.' },
    cols: { type: 'number', min: 2, max: 8, default: 4, integer: true, doc: 'Stones across one repeat (rows alternate half a step).' },
    size: { type: 'number', min: 0.4, max: 1.0, default: 0.72, doc: 'Stone size as a share of its cell.' },
    jitter: { type: 'number', min: 0, max: 0.4, default: 0.12, doc: 'Random offset of stones from the grid (share of a cell).' },
  },
  thumbSpan: 1.6,
  paint(ctx, s) {
    const rng0 = rngFor(s.seed, 11);
    texFill(ctx, s, str(s, 'ground'), [col(s, 0), col(s, 1), col(s, 2)], 0, 0, s.w, s.h, tileFor(s, num(s, 'groundScale')), 0, 0, rng0, 0.1);
    const n = Math.max(2, Math.round(num(s, 'cols')));
    const rows = n % 2 === 0 ? n : n + 1;
    const cw = s.w / n, ch = s.h / rows;
    const cell = Math.min(cw, ch * 1.6);
    const shape = str(s, 'shape');
    const tint = [col(s, 3), col(s, 4), col(s, 5)];
    const mapId = str(s, 'map');
    const jit = num(s, 'jitter');
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < n; i++) {
        const rng = rngFor(s.seed, 12, i, j);
        const cx = (i + 0.5 + (j % 2 ? 0.5 : 0) + (rng.next() - 0.5) * jit * 2) * cw;
        const cy = (j + 0.5 + (rng.next() - 0.5) * jit) * ch;
        const rx = (cell * num(s, 'size')) / 2 * (0.9 + rng.next() * 0.2);
        const ry = shape === 'flag' ? rx * (0.7 + rng.next() * 0.3) : rx;
        const pts = blobPoints(rng, cx, cy, rx, ry, shape, rng.next() * Math.PI);
        const tone = (rng.next() - 0.5) * 0.12;
        const px = rng.next() * 0.6, py = rng.next() * 0.6;
        const r = Math.max(rx, ry) * 1.5;
        drawWrapped(ctx, s, cx - r, cy - r, cx + r, cy + r, () => {
          // soft shadow
          ctx.fillStyle = rgba('#000000', 0.22);
          ctx.beginPath();
          polygonPath(ctx, pts.map((p) => [p[0] + rx * 0.08, p[1] + rx * 0.12] as Pt));
          ctx.fill();
          ctx.save();
          ctx.beginPath();
          polygonPath(ctx, pts);
          ctx.clip();
          texFill(ctx, s, mapId, tint.map((c) => shade(c, tone)), cx - r, cy - r, 2 * r, 2 * r, 0.6, cx - r - px, cy - r - py, rng);
          softBlob(ctx, cx - rx * 0.2, cy - ry * 0.25, rx * 0.6, ry * 0.4, -0.5, '#ffffff', 0.14, 4);
          ctx.restore();
          ctx.strokeStyle = rgba('#000000', 0.3);
          ctx.lineWidth = hair(s, 0.003, 1);
          ctx.beginPath();
          polygonPath(ctx, pts);
          ctx.stroke();
        });
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------
// fan-setts
// ---------------------------------------------------------------------------------------------

const fanSetts: PainterDef = {
  id: 'fan-setts',
  surface: 'floor',
  description: 'Small setts laid in overlapping fans: rows of half-offset discs of concentric arcs, each row drawn over the one above, like scales.',
  colors: ['stoneA', 'stoneB', 'stoneC', 'joint'],
  params: {
    seed: SEED_PARAM,
    map: mapParam('Stone material map on the setts; empty = flat speckle.'),
    fans: { type: 'number', min: 2, max: 8, default: 4, integer: true, doc: 'Fans across one repeat.' },
    sett: { type: 'number', min: 0.03, max: 0.1, default: 0.055, doc: 'Sett size (m) along the arcs and between them.' },
    joint: { type: 'number', min: 0.002, max: 0.015, default: 0.005, doc: 'Joint width (m).' },
    variation: { type: 'number', min: 0, max: 1, default: 0.6, doc: 'Sett-to-sett tone variation.' },
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    ctx.fillStyle = col(s, 3);
    ctx.fillRect(0, 0, s.w, s.h);
    const nF = Math.max(2, Math.round(num(s, 'fans')));
    const W = s.w / nF;
    const rows = nF * 2;
    const rh = s.h / rows;
    const R = W * 0.56;
    const ringN = Math.max(2, Math.round(R / num(s, 'sett')));
    const dr = R / ringN;
    const g = hair(s, num(s, 'joint'));
    const stones = [col(s, 0), col(s, 1), col(s, 2)];
    const mapId = str(s, 'map');
    const variation = num(s, 'variation');
    const drawFan = (cx: number, cy: number, row: number, i: number) => {
      // joint disc, then rings of setts
      ctx.fillStyle = col(s, 3);
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.fill();
      for (let k = 0; k < ringN; k++) {
        const r0 = k * dr + g / 2, r1 = (k + 1) * dr - g / 2;
        const rm = (r0 + r1) / 2;
        const cnt = Math.max(5, Math.round((TAU * rm) / (num(s, 'sett') * 1.2)));
        const da = TAU / cnt;
        const rot = ((row * 17 + i * 5 + k * 3) % 7) * 0.2;
        for (let q = 0; q < cnt; q++) {
          const rng = rngFor(s.seed, 91, row, i, k * 64 + q);
          const a0 = rot + q * da + (g / 2) / rm, a1 = rot + (q + 1) * da - (g / 2) / rm;
          const base = stones[Math.floor(rng.next() * 3)] ?? col(s, 0);
          const fill = shade(base, (rng.next() - 0.5) * 0.16 * variation);
          const quad: Pt[] = [
            [cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0], [cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0],
            [cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1], [cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1],
          ];
          ctx.fillStyle = fill;
          ctx.beginPath();
          polygonPath(ctx, quad);
          ctx.fill();
          // highlight on the outer arc face, shade on the inner
          ctx.fillStyle = rgba('#ffffff', 0.13);
          ctx.beginPath();
          polygonPath(ctx, [quad[2] as Pt, quad[3] as Pt, [(quad[3] as Pt)[0] * 0.8 + cx * 0.2, (quad[3] as Pt)[1] * 0.8 + cy * 0.2], [(quad[2] as Pt)[0] * 0.8 + cx * 0.2, (quad[2] as Pt)[1] * 0.8 + cy * 0.2]]);
          ctx.fill();
          if (mapId !== '' && rng.next() < 0.5) {
            ctx.fillStyle = rgba(shade(fill, -0.4), 0.3);
            const d = hair(s, 0.003, 1);
            ctx.fillRect(cx + (Math.cos((a0 + a1) / 2) * (r0 + r1)) / 2, cy + (Math.sin((a0 + a1) / 2) * (r0 + r1)) / 2, d, d);
          }
        }
      }
    };
    const fanAt = (row: number, i: number, dy: number) => {
      const cx = (i + 0.5 + (row % 2 ? 0.5 : 0)) * W, cy = row * rh + dy;
      for (const ox of [-s.w, 0, s.w]) {
        if (cx + ox + R <= 0 || cx + ox - R >= s.w || cy + R <= 0 || cy - R >= s.h) continue;
        ctx.save();
        ctx.translate(ox, 0);
        drawFan(cx, cy, row, i);
        ctx.restore();
      }
    };
    // draw order is "each row over the row above", also across the wrap: last row once above the top, then all rows, then row 0 below the bottom
    for (let i = 0; i < nF; i++) fanAt(rows - 1, i, -s.h);
    for (let row = 0; row < rows; row++) for (let i = 0; i < nF; i++) fanAt(row, i, 0);
    for (let i = 0; i < nF; i++) fanAt(0, i, s.h);
  },
};

// ---------------------------------------------------------------------------------------------
// grass-pavers
// ---------------------------------------------------------------------------------------------

const grassPavers: PainterDef = {
  id: 'grass-pavers',
  surface: 'floor',
  description: 'Concrete grass blocks laid in running bond, each with a grid of rounded holes filled with turf.',
  colors: ['concrete', 'concreteLight', 'concreteDark', 'grass', 'grassLight', 'grassDark'],
  params: {
    seed: SEED_PARAM,
    map: mapParam('Concrete material map.'),
    grass: mapParam('Grass map in the holes.'),
    blockW: { type: 'number', min: 0.2, max: 0.8, default: 0.6, doc: 'Block length (m).' },
    blockH: { type: 'number', min: 0.2, max: 0.6, default: 0.4, doc: 'Block width (m).' },
    holesX: { type: 'number', min: 1, max: 5, default: 3, integer: true, doc: 'Holes along a block.' },
    holesY: { type: 'number', min: 1, max: 4, default: 2, integer: true, doc: 'Holes across a block.' },
    joint: { type: 'number', min: 0.002, max: 0.02, default: 0.006, doc: 'Joint between blocks (m).' },
  },
  thumbSpan: 1.4,
  paint(ctx, s) {
    ctx.fillStyle = shade(col(s, 2), -0.4);
    ctx.fillRect(0, 0, s.w, s.h);
    const nx = fitCount(s.w, num(s, 'blockW')), ny = fitCount(s.h, num(s, 'blockH'), 2, 2);
    const bw = s.w / nx, bh = s.h / ny;
    const g = hair(s, num(s, 'joint'));
    const hx = Math.round(num(s, 'holesX')), hy = Math.round(num(s, 'holesY'));
    const concrete = [col(s, 0), col(s, 1), col(s, 2)];
    const grass = [col(s, 3), col(s, 4), col(s, 5)];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x0 = i * bw + (j % 2 ? bw / 2 : 0), y0 = j * bh;
        const rng = rngFor(s.seed, 95, i, j);
        const x = x0 + g / 2, y = y0 + g / 2, w = bw - g, h = bh - g;
        const px = rng.next() * 0.6, py = rng.next() * 0.6;
        drawWrapped(ctx, s, x0, y0, x0 + bw, y0 + bh, () => {
          ctx.save();
          ctx.beginPath();
          roundRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.04);
          ctx.clip();
          texFill(ctx, s, str(s, 'map'), concrete, x, y, w, h, 0.6, x - px, y - py, rng);
          ctx.fillStyle = rgba(rng.next() < 0.5 ? col(s, 1) : col(s, 2), 0.12);
          ctx.fillRect(x, y, w, h);
          ctx.restore();
          const m = Math.min(w, h) * 0.12;
          const cw = (w - m * 2) / hx, ch = (h - m * 2) / hy;
          for (let q = 0; q < hy; q++) {
            for (let p = 0; p < hx; p++) {
              const hx0 = x + m + p * cw + cw * 0.12, hy0 = y + m + q * ch + ch * 0.12, hw = cw * 0.76, hh = ch * 0.76;
              // shaded rim, then turf
              ctx.fillStyle = rgba('#000000', 0.45);
              ctx.beginPath();
              roundRectPath(ctx, hx0 - hair(s, 0.003), hy0 - hair(s, 0.003), hw + hair(s, 0.006), hh + hair(s, 0.006), Math.min(hw, hh) * 0.3);
              ctx.fill();
              ctx.save();
              ctx.beginPath();
              roundRectPath(ctx, hx0, hy0, hw, hh, Math.min(hw, hh) * 0.28);
              ctx.clip();
              texFill(ctx, s, str(s, 'grass'), grass, hx0, hy0, hw, hh, 0.5, hx0 - rng.next() * 0.5, hy0 - rng.next() * 0.5, rng, 0.2);
              ctx.fillStyle = rgba('#000000', 0.18);
              ctx.fillRect(hx0, hy0, hw, hair(s, 0.006));
              ctx.restore();
            }
          }
        });
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------
// raked-garden
// ---------------------------------------------------------------------------------------------

const rakedGarden: PainterDef = {
  id: 'raked-garden',
  surface: 'floor',
  description: 'Raked gravel or sand: parallel wavy furrows in the ground map, with boulders ringed by concentric rake lines.',
  colors: ['ground', 'groundLight', 'groundDark', 'stone', 'stoneLight', 'stoneDark'],
  params: {
    seed: SEED_PARAM,
    ground: mapParam('Gravel or sand map.'),
    groundScale: { type: 'number', min: 0.2, max: 2.4, default: 1.2, doc: 'Metres covered by one ground map tile.' },
    spacing: { type: 'number', min: 0.02, max: 0.12, default: 0.05, doc: 'Distance between rake lines (m).' },
    waves: { type: 'number', min: 0, max: 6, default: 2, integer: true, doc: 'Wave periods across one repeat; 0 = straight lines.' },
    amplitude: { type: 'number', min: 0, max: 0.15, default: 0.05, doc: 'Wave height (m).' },
    boulders: { type: 'number', min: 0, max: 4, default: 2, integer: true, doc: 'Boulders ringed by rake lines.' },
  },
  thumbSpan: 1.6,
  paint(ctx, s) {
    const rng = rngFor(s.seed, 15);
    const tint = [col(s, 0), col(s, 1), col(s, 2)];
    const gmap = str(s, 'ground'), gtile = tileFor(s, num(s, 'groundScale'));
    texFill(ctx, s, gmap, tint, 0, 0, s.w, s.h, gtile, 0, 0, rng, 0.1);
    const lines = fitCount(s.h, num(s, 'spacing'), 4);
    const sp = s.h / lines;
    const waves = Math.round(num(s, 'waves')), amp = num(s, 'amplitude');
    const steps = Math.max(24, Math.round(s.w / 0.03));
    const stones: Array<{ x: number; y: number; r: number }> = [];
    for (let i = 0; i < Math.round(num(s, 'boulders')); i++) {
      const r = rngFor(s.seed, 16, i);
      stones.push({ x: (0.2 + r.next() * 0.6) * s.w, y: (0.2 + r.next() * 0.6) * s.h, r: 0.1 + r.next() * 0.08 });
    }
    // furrows: a dark groove with a light ridge beside it
    const furrow = (dy: number, color: string, a: number, lw: number) => {
      ctx.strokeStyle = rgba(color, a);
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      for (let l = 0; l < lines; l++) {
        ctx.beginPath();
        for (let q = 0; q <= steps; q++) {
          const x = (q / steps) * s.w;
          const y = l * sp + dy + (waves > 0 ? Math.sin((x / s.w) * waves * TAU + l * 0.15) * amp : 0);
          if (q === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };
    furrow(0, col(s, 2), 0.5, hair(s, sp * 0.3, 1));
    furrow(sp * 0.36, col(s, 1), 0.5, hair(s, sp * 0.2, 0.8));
    for (const b of stones) {
      // clear the lines around the boulder, then draw concentric rings
      const rings = 5;
      drawWrapped(ctx, s, b.x - b.r * 4, b.y - b.r * 4, b.x + b.r * 4, b.y + b.r * 4, () => {
        const clear = b.r + rings * sp + sp;
        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, clear, 0, TAU);
        ctx.clip();
        texFill(ctx, s, gmap, tint, b.x - clear, b.y - clear, clear * 2, clear * 2, gtile, 0, 0, rng, 0.1);
        ctx.restore();
        for (let k = 1; k <= rings; k++) {
          const rr = b.r + k * sp;
          ctx.strokeStyle = rgba(col(s, 2), 0.5);
          ctx.lineWidth = hair(s, sp * 0.3, 1);
          ctx.beginPath();
          ctx.arc(b.x, b.y, rr, 0, TAU);
          ctx.stroke();
          ctx.strokeStyle = rgba(col(s, 1), 0.5);
          ctx.lineWidth = hair(s, sp * 0.2, 0.8);
          ctx.beginPath();
          ctx.arc(b.x, b.y, rr + sp * 0.36, 0, TAU);
          ctx.stroke();
        }
        ctx.fillStyle = rgba('#000000', 0.3);
        ctx.beginPath();
        ctx.ellipse(b.x + b.r * 0.12, b.y + b.r * 0.2, b.r * 1.1, b.r * 0.9, 0.3, 0, TAU);
        ctx.fill();
        ctx.fillStyle = col(s, 3);
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.r * 1.1, b.r * 0.9, 0.3, 0, TAU);
        ctx.fill();
        softBlob(ctx, b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.7, b.r * 0.45, -0.5, col(s, 4), 0.6, 5);
        softBlob(ctx, b.x + b.r * 0.3, b.y + b.r * 0.4, b.r * 0.8, b.r * 0.4, -0.3, col(s, 5), 0.5, 5);
      });
    }
  },
};

// ---------------------------------------------------------------------------------------------
// grating
// ---------------------------------------------------------------------------------------------

const grating: PainterDef = {
  id: 'grating',
  surface: 'floor',
  description: 'Steel bar grating: flat bearing bars on edge with twisted cross rods between them, over a dark void.',
  colors: ['steel', 'light', 'dark', 'void'],
  params: {
    seed: SEED_PARAM,
    pitch: { type: 'number', min: 0.02, max: 0.08, default: 0.035, doc: 'Bearing bar spacing (m).' },
    cross: { type: 'number', min: 0.05, max: 0.2, default: 0.1, doc: 'Cross rod spacing (m).' },
    wear: { type: 'number', min: 0, max: 1, default: 0.4, doc: 'Scuffs and rust-free wear on the bar tops.' },
  },
  thumbSpan: 0.6,
  paint(ctx, s) {
    ctx.fillStyle = col(s, 3);
    ctx.fillRect(0, 0, s.w, s.h);
    const n = fitCount(s.w, num(s, 'pitch'));
    const p = s.w / n;
    const bar = p * 0.22;
    const m = fitCount(s.h, num(s, 'cross'));
    const q = s.h / m;
    // faint floor glimpses below the openings
    const rng = rngFor(s.seed, 21);
    speckle(ctx, s, rng, 0.03, [shade(col(s, 3), 0.18)], 0.4, 1.4);
    // cross rods under the bars
    for (let j = 0; j < m; j++) {
      const y = (j + 0.5) * q;
      ctx.fillStyle = col(s, 2);
      ctx.fillRect(0, y - bar * 0.28, s.w, bar * 0.56);
      ctx.fillStyle = rgba(col(s, 1), 0.5);
      ctx.fillRect(0, y - bar * 0.28, s.w, hair(s, 0.0015));
    }
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * p - bar / 2;
      ctx.fillStyle = rgba('#000000', 0.45);
      ctx.fillRect(x + bar * 0.4, 0, bar, s.h);
      ctx.fillStyle = col(s, 0);
      ctx.fillRect(x, 0, bar, s.h);
      ctx.fillStyle = rgba(col(s, 1), 0.85);
      ctx.fillRect(x, 0, Math.max(bar * 0.3, hair(s, 0.002)), s.h);
      ctx.fillStyle = rgba(col(s, 2), 0.7);
      ctx.fillRect(x + bar * 0.8, 0, bar * 0.2, s.h);
    }
    // twisted rod nodes where rods cross bars
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = rgba(col(s, 1), 0.55);
        ctx.fillRect((i + 0.5) * p - bar * 0.5, (j + 0.5) * q - bar * 0.2, bar, bar * 0.4);
      }
    }
    // wear: scuffs along the bar tops
    const wear = num(s, 'wear');
    for (let k = 0; k < Math.round(60 * wear); k++) {
      const i = Math.floor(rng.next() * n), y = rng.next() * s.h, len = 0.02 + rng.next() * 0.08;
      ctx.fillStyle = rgba(rng.next() < 0.5 ? col(s, 1) : col(s, 2), 0.5);
      const x = (i + 0.5) * p - bar / 2;
      ctx.fillRect(x, y, bar, len);
      if (y + len > s.h) ctx.fillRect(x, y - s.h, bar, len);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// rubber-floor
// ---------------------------------------------------------------------------------------------

const rubberFloor: PainterDef = {
  id: 'rubber-floor',
  surface: 'floor',
  description: 'Rubber flooring tiles with a moulded surface: round studs, long ribs or small coins, with fine joints between the tiles.',
  colors: ['rubber', 'light', 'dark', 'joint'],
  params: {
    seed: SEED_PARAM,
    style: { type: 'enum', values: ['studs', 'ribs', 'coins'], default: 'studs', doc: 'Round studs in staggered rows, parallel ribs, or small coins in a square grid.' },
    tile: { type: 'number', min: 0.3, max: 1.2, default: 0.6, doc: 'Tile size (m).' },
    pitch: { type: 'number', min: 0.012, max: 0.06, default: 0.028, doc: 'Stud, rib or coin spacing (m).' },
    joint: { type: 'number', min: 0.001, max: 0.01, default: 0.003, doc: 'Joint between tiles (m).' },
  },
  thumbSpan: 0.8,
  paint(ctx, s) {
    const style = str(s, 'style');
    const nt = fitCount(s.w, num(s, 'tile'));
    const tw = s.w / nt;
    const np = fitCount(tw, num(s, 'pitch'), 2, style === 'studs' ? 2 : 1);
    const p = tw / np;
    const g = hair(s, num(s, 'joint'));
    ctx.fillStyle = col(s, 3);
    ctx.fillRect(0, 0, s.w, s.h);
    const rng0 = rngFor(s.seed, 23);
    for (let tj = 0; tj < nt; tj++) {
      for (let ti = 0; ti < nt; ti++) {
        const x0 = ti * tw + g / 2, y0 = tj * tw + g / 2, w = tw - g;
        const rng = rngFor(s.seed, 24, ti, tj);
        ctx.fillStyle = shade(col(s, 0), (rng.next() - 0.5) * 0.05);
        ctx.fillRect(x0, y0, w, w);
        if (style === 'ribs') {
          for (let k = 0; k < np; k++) {
            const y = y0 + k * p;
            ctx.fillStyle = rgba(col(s, 2), 0.55);
            ctx.fillRect(x0, y + p * 0.62, w, p * 0.38);
            ctx.fillStyle = rgba(col(s, 1), 0.5);
            ctx.fillRect(x0, y + p * 0.12, w, Math.max(p * 0.12, hair(s, 0.0015)));
          }
        } else {
          const rows = style === 'studs' ? np * 2 : np;
          for (let j = 0; j < rows; j++) {
            for (let i = 0; i < np; i++) {
              const stag = style === 'studs' ? (j % 2) * 0.5 : 0;
              const px = x0 + ((((i + 0.5 + stag) * p) % w) + w) % w;
              const cy = style === 'studs' ? y0 + (j + 0.5) * (p / 2) : y0 + (j + 0.5) * p;
              const r = style === 'studs' ? p * 0.3 : p * 0.36;
              ctx.fillStyle = rgba(col(s, 2), 0.6);
              ctx.beginPath();
              ctx.arc(px + r * 0.18, cy + r * 0.28, r, 0, TAU);
              ctx.fill();
              ctx.fillStyle = shade(col(s, 0), 0.06);
              ctx.beginPath();
              ctx.arc(px, cy, r, 0, TAU);
              ctx.fill();
              ctx.fillStyle = rgba(col(s, 1), 0.6);
              ctx.beginPath();
              ctx.arc(px - r * 0.25, cy - r * 0.3, r * 0.4, 0, TAU);
              ctx.fill();
              if (style === 'coins') {
                ctx.strokeStyle = rgba(col(s, 2), 0.5);
                ctx.lineWidth = hair(s, 0.0012, 0.6);
                ctx.beginPath();
                ctx.arc(px, cy, r * 0.62, 0, TAU);
                ctx.stroke();
              }
            }
          }
        }
        // chamfered tile edge
        ctx.fillStyle = rgba('#ffffff', 0.12);
        ctx.fillRect(x0, y0, w, hair(s, 0.003));
        ctx.fillRect(x0, y0, hair(s, 0.003), w);
        ctx.fillStyle = rgba('#000000', 0.2);
        ctx.fillRect(x0, y0 + w - hair(s, 0.003), w, hair(s, 0.003));
        ctx.fillRect(x0 + w - hair(s, 0.003), y0, hair(s, 0.003), w);
      }
    }
    speckle(ctx, s, rng0, 0.05, [col(s, 1), col(s, 2)], 0.2, 1.2);
  },
};

export const PAINTERS_FLOORS_C: PainterDef[] = [
  paverBond, carpetPattern, crazyPaving, steppingStones, fanSetts, grassPavers, rakedGarden, grating, rubberFloor,
];
