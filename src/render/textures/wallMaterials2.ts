// More built and material wall painters (Milestone 2): wood panelling in five constructions, decorative tiles
// (zellige, pennies, arabesque), coursed ashlar, tufted upholstery, corrugated metal, a layered-hills mural and a
// bookshelf print. Structure that belongs at a height is measured from the floor line, as in wallMaterials.ts.

import type { Rng } from '../../core/rng';
import { rollerTexture } from './wallPatterns';
import {
  SEED_PARAM, SKIRT_PARAM, bevelRect, col, drawWrapped, fitCount, fromFloor, hair, mix, num, rgba, rngFor, shade, skirting,
  softBlob, speckle, str, wrappedKey, type Canvas2DLike, type PaintSpec, type PainterDef,
} from './painterKit';

const TAU = Math.PI * 2;

/** Splits `total` into `count` random parts (each at least 55% of the average) that sum exactly to total. */
function randomParts(total: number, count: number, rng: Rng): number[] {
  const w = Array.from({ length: count }, () => 0.55 + rng.next());
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((v) => (v / sum) * total);
}

// ---------------------------------------------------------------------------------------------
// Wood panelling
// ---------------------------------------------------------------------------------------------

const panelSet: PainterDef = {
  id: 'panel-set',
  surface: 'wall',
  description: 'Wood and painted panelling: raised shaker wainscot, modern slats on a dark backing, board and batten, white shiplap and stacked logs with chinking.',
  colors: ['upper', 'panel', 'groove', 'rail'],
  params: {
    seed: SEED_PARAM,
    skirt: { type: 'number', min: 0, max: 0.25, default: 0.12, doc: 'Skirting board height (m), 0 = none.' },
    style: { type: 'enum', values: ['shaker', 'slat', 'batten', 'shiplap', 'log'], default: 'shaker', doc: 'Construction.' },
    height: { type: 'number', min: 0.6, max: 2.8, default: 1.1, doc: 'Top of the panelling above the floor (m); 2.8 = full height.' },
    unit: { type: 'number', min: 0.03, max: 0.6, default: 0.4, doc: 'Panel width, slat pitch, board width or log diameter (m).' },
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    const upper = col(s, 0), panel = col(s, 1), groove = col(s, 2), railC = col(s, 3);
    const style = str(s, 'style');
    const full = num(s, 'height') >= s.h - 0.01;
    const top = full ? 0 : fromFloor(s, num(s, 'height'));
    ctx.fillStyle = upper;
    ctx.fillRect(0, 0, s.w, s.h);
    if (!full) rollerTexture(ctx, s, upper, 0.4, rngFor(s.seed, 1), { y: 0, h: top });
    const rng = rngFor(s.seed, 2);
    const u = num(s, 'unit');
    const bottom = s.h;
    if (style === 'shaker') {
      ctx.fillStyle = panel;
      ctx.fillRect(0, top, s.w, bottom - top);
      const n = fitCount(s.w, u);
      const pw = s.w / n;
      const stile = Math.min(0.07, pw * 0.16);
      const railH = 0.07;
      const inner0 = top + railH * 1.4, inner1 = bottom - 0.14 - railH * 0.6;
      for (let i = 0; i < n; i++) {
        const x0 = i * pw + pw * 0.25 + stile / 2; // stiles sit off the texture edge
        drawWrapped(ctx, s, x0 - stile, inner0, x0 + pw, inner1, () => {
          const x = x0 + stile / 2, w = pw - stile;
          // recessed field with a bevelled frame
          ctx.fillStyle = rgba('#000000', 0.12);
          ctx.fillRect(x, inner0, w, inner1 - inner0);
          ctx.fillStyle = shade(panel, -0.03);
          ctx.fillRect(x + 0.008, inner0 + 0.008, w - 0.016, inner1 - inner0 - 0.016);
          ctx.fillStyle = rgba(groove, 0.5);
          ctx.fillRect(x, inner0, w, hair(s, 0.003));
          ctx.fillRect(x, inner0, hair(s, 0.003), inner1 - inner0);
          ctx.fillStyle = rgba('#ffffff', 0.5);
          ctx.fillRect(x, inner1 - hair(s, 0.003), w, hair(s, 0.003));
          ctx.fillRect(x + w - hair(s, 0.003), inner0, hair(s, 0.003), inner1 - inner0);
        });
      }
      // cap rail
      ctx.fillStyle = rgba('#000000', 0.15);
      ctx.fillRect(0, top, s.w, 0.012);
      ctx.fillStyle = railC;
      ctx.fillRect(0, top - 0.04, s.w, 0.05);
      ctx.fillStyle = rgba('#ffffff', 0.4);
      ctx.fillRect(0, top - 0.04, s.w, hair(s, 0.005));
    } else if (style === 'slat') {
      // dark backing and vertical slats with a little grain each
      ctx.fillStyle = groove;
      ctx.fillRect(0, top, s.w, bottom - top);
      const n = fitCount(s.w, u);
      const p = s.w / n;
      const sw = p * 0.62;
      for (let i = 0; i < n; i++) {
        const x = i * p + p * 0.2;
        const tone = shade(panel, (rng.next() - 0.5) * 0.12);
        drawWrapped(ctx, s, x - 0.01, top, x + sw + 0.01, bottom, () => {
          ctx.fillStyle = rgba('#000000', 0.35);
          ctx.fillRect(x + sw, top, p * 0.1, bottom - top);
          ctx.fillStyle = tone;
          ctx.fillRect(x, top, sw, bottom - top);
          ctx.fillStyle = rgba('#ffffff', 0.16);
          ctx.fillRect(x, top, sw * 0.25, bottom - top);
          ctx.fillStyle = rgba('#000000', 0.12);
          ctx.fillRect(x + sw * 0.8, top, sw * 0.2, bottom - top);
          for (let k = 0; k < 3; k++) {
            ctx.fillStyle = rgba(shade(tone, rng.next() < 0.5 ? -0.35 : 0.3), 0.3);
            ctx.fillRect(x + sw * (0.2 + rng.next() * 0.6), top, hair(s, 0.0015, 0.7), bottom - top);
          }
        });
      }
    } else if (style === 'batten') {
      ctx.fillStyle = panel;
      ctx.fillRect(0, top, s.w, bottom - top);
      const n = fitCount(s.w, u);
      const p = s.w / n;
      const bt = Math.min(0.05, p * 0.22);
      for (let i = 0; i < n; i++) {
        const x = i * p + p * 0.3;
        // board seam hidden by a raised batten with a drop shadow
        drawWrapped(ctx, s, x - 0.02, top, x + bt + 0.03, bottom, () => {
          ctx.fillStyle = rgba('#000000', 0.2);
          ctx.fillRect(x + bt, top, hair(s, 0.012), bottom - top);
          ctx.fillStyle = railC;
          ctx.fillRect(x, top, bt, bottom - top);
          ctx.fillStyle = rgba('#ffffff', 0.35);
          ctx.fillRect(x, top, hair(s, 0.004), bottom - top);
        });
        ctx.fillStyle = rgba(groove, 0.14);
        for (let k = 0; k < 2; k++) ctx.fillRect(i * p + p * (0.55 + 0.2 * k + rng.next() * 0.1), top, hair(s, 0.002), bottom - top);
      }
      ctx.fillStyle = railC;
      ctx.fillRect(0, top, s.w, 0.045);
      ctx.fillStyle = rgba('#000000', 0.18);
      ctx.fillRect(0, top + 0.045, s.w, hair(s, 0.006));
    } else if (style === 'shiplap') {
      const rows = Math.ceil((bottom - top) / u);
      for (let k = 0; k < rows; k++) {
        const y = bottom - (k + 1) * u;
        ctx.fillStyle = shade(panel, (rng.next() - 0.5) * 0.05);
        ctx.fillRect(0, y, s.w, u);
        // nickel gap, lit upper lip, soft shade under the lap
        ctx.fillStyle = groove;
        ctx.fillRect(0, y, s.w, hair(s, 0.004, 1));
        ctx.fillStyle = rgba('#ffffff', 0.4);
        ctx.fillRect(0, y + hair(s, 0.004, 1), s.w, hair(s, 0.003));
        ctx.fillStyle = rgba('#000000', 0.07);
        ctx.fillRect(0, y + hair(s, 0.004, 1) + hair(s, 0.003), s.w, u * 0.12);
        ctx.fillStyle = rgba(shade(panel, -0.3), 0.18);
        for (let q = 0; q < 3; q++) ctx.fillRect(0, y + u * (0.3 + rng.next() * 0.6), s.w, hair(s, 0.0012, 0.6));
      }
    } else {
      // stacked round logs with chinking: shading bands across each log, the odd knot
      ctx.fillStyle = groove;
      ctx.fillRect(0, top, s.w, bottom - top);
      const rows = Math.ceil((bottom - top) / u);
      for (let k = 0; k < rows; k++) {
        const y = bottom - (k + 1) * u;
        const chink = u * 0.1;
        const tone = shade(panel, (rng.next() - 0.5) * 0.1);
        const lh = u - chink;
        const bands: Array<[number, string, number]> = [[0, '#ffffff', 0.0], [0.1, '#ffffff', 0.14], [0.3, '#ffffff', 0.06], [0.62, '#000000', 0.1], [0.85, '#000000', 0.26]];
        ctx.fillStyle = tone;
        ctx.fillRect(0, y + chink / 2, s.w, lh);
        bands.forEach(([f, c, a], q) => {
          const next = bands[q + 1]?.[0] ?? 1;
          ctx.fillStyle = rgba(c, a);
          ctx.fillRect(0, y + chink / 2 + lh * f, s.w, lh * (next - f));
        });
        for (let q = 0; q < 6; q++) {
          ctx.fillStyle = rgba(shade(tone, -0.4), 0.3);
          ctx.fillRect(0, y + chink / 2 + lh * (0.1 + rng.next() * 0.8), s.w, hair(s, 0.0014, 0.6));
        }
        // a couple of knots per log, kept off the repeat edge
        for (let q = 0; q < 2; q++) {
          const kx = s.w * (0.1 + rng.next() * 0.8), ky = y + chink / 2 + lh * (0.3 + rng.next() * 0.4);
          ctx.fillStyle = rgba(shade(tone, -0.5), 0.55);
          ctx.beginPath();
          ctx.ellipse(kx, ky, lh * 0.1, lh * 0.06, 0, 0, TAU);
          ctx.fill();
        }
      }
    }
    skirting(ctx, s, num(s, 'skirt'), railC);
  },
};

// ---------------------------------------------------------------------------------------------
// Decorative tiles
// ---------------------------------------------------------------------------------------------

const wallTileSet: PainterDef = {
  id: 'wall-tile-set',
  surface: 'wall',
  description: 'Decorative tiles: handmade zellige squares with uneven glaze, round pennies in stacked columns, or Moroccan arabesque lanterns.',
  colors: ['tile', 'tileAlt', 'grout'],
  params: {
    seed: SEED_PARAM,
    style: { type: 'enum', values: ['zellige', 'penny', 'arabesque'], default: 'zellige', doc: 'Tile type.' },
    size: { type: 'number', min: 0.02, max: 0.3, default: 0.1, doc: 'Tile size (m).' },
    variation: { type: 'number', min: 0, max: 1, default: 0.6, doc: 'Tile-to-tile variation.' },
  },
  thumbSpan: 0.6,
  paint(ctx, s) {
    const tile = col(s, 0), alt = col(s, 1), grout = col(s, 2);
    const style = str(s, 'style');
    const variation = num(s, 'variation');
    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, s.w, s.h);
    const n = fitCount(s.w, num(s, 'size'), 2, 2);
    const p = s.w / n;
    if (style === 'zellige') {
      const rows = Math.ceil(s.h / p) + 1;
      const g = hair(s, 0.006, 1.2);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < n; i++) {
          const x = (i + 0.5) * p, y = s.h - (j + 1) * p;
          const rng = rngFor(s.seed, wrappedKey(s, x, 0), j);
          const fill = mix(tile, alt, rng.next() * 0.5 * variation);
          const jx = (rng.next() - 0.5) * p * 0.06, jy = (rng.next() - 0.5) * p * 0.06, rot = (rng.next() - 0.5) * 0.05;
          drawWrapped(ctx, s, x - p * 0.1, y - p * 0.1, x + p * 1.1, y + p * 1.1, () => {
            ctx.save();
            ctx.translate(x + p / 2 + jx, y + p / 2 + jy);
            ctx.rotate(rot);
            const t = p - g;
            ctx.fillStyle = rgba('#000000', 0.2);
            ctx.fillRect(-t / 2 + 0.002, -t / 2 + 0.003, t, t);
            ctx.fillStyle = fill;
            ctx.fillRect(-t / 2, -t / 2, t, t);
            // uneven glaze pooling, a bright wet patch and a dark pit or two
            const prng = rngFor(s.seed, wrappedKey(s, x, 0), j, 3);
            for (let q = 0; q < 3; q++) {
              softBlob(ctx, (prng.next() - 0.5) * t * 0.7, (prng.next() - 0.5) * t * 0.7, t * (0.2 + prng.next() * 0.3), t * (0.15 + prng.next() * 0.25),
                prng.next() * Math.PI, prng.next() < 0.5 ? alt : '#000000', 0.14 * variation, 4);
            }
            softBlob(ctx, -t * 0.18, -t * 0.2, t * 0.3, t * 0.14, -0.6, '#ffffff', 0.16, 4);
            ctx.fillStyle = rgba('#ffffff', 0.22);
            ctx.fillRect(-t / 2, -t / 2, t, hair(s, 0.003));
            ctx.fillRect(-t / 2, -t / 2, hair(s, 0.003), t);
            ctx.restore();
          });
        }
      }
    } else if (style === 'penny') {
      const rows = Math.ceil(s.h / p) + 1;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < n; i++) {
          const cx = (i + 0.5) * p, cy = s.h - (j + 0.5) * p;
          const rng = rngFor(s.seed, wrappedKey(s, cx, 0), j);
          const fill = mix(tile, alt, rng.next() < 0.18 ? 0.8 : rng.next() * 0.25 * variation);
          const r = p * 0.46;
          ctx.fillStyle = rgba('#000000', 0.2);
          ctx.beginPath(); ctx.arc(cx + r * 0.06, cy + r * 0.08, r, 0, TAU); ctx.fill();
          ctx.fillStyle = fill;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
          ctx.fillStyle = rgba('#ffffff', 0.22);
          ctx.beginPath(); ctx.ellipse(cx - r * 0.3, cy - r * 0.3, r * 0.42, r * 0.22, -0.7, 0, TAU); ctx.fill();
        }
      }
    } else {
      // lantern lenses in staggered columns; the kite-shaped gaps between them are small tiles in the second colour
      const w = p, h = p * 1.7;
      const rows = Math.ceil(s.h / h) + 2;
      ctx.fillStyle = alt;
      ctx.fillRect(0, 0, s.w, s.h);
      const gap = hair(s, 0.004, 1);
      for (let i = 0; i < n; i++) {
        for (let j = -1; j < rows; j++) {
          const cx = (i + 0.5) * w, cy = s.h - (j + (i % 2) * 0.5) * h - h / 2;
          const rng = rngFor(s.seed, wrappedKey(s, cx, 0), j);
          const lens = mix(tile, alt, rng.next() * 0.35 * variation);
          drawWrapped(ctx, s, cx - w * 0.6, cy - h * 0.6, cx + w * 0.6, cy + h * 0.6, () => {
            ctx.fillStyle = rgba('#000000', 0.18);
            lensPath(ctx, cx + 0.002, cy + 0.003, w - gap, h - gap);
            ctx.fill();
            ctx.fillStyle = lens;
            lensPath(ctx, cx, cy, w - gap, h - gap);
            ctx.fill();
            ctx.fillStyle = rgba('#ffffff', 0.16);
            lensPath(ctx, cx - w * 0.07, cy - h * 0.06, (w - gap) * 0.55, (h - gap) * 0.7);
            ctx.fill();
            ctx.strokeStyle = grout;
            ctx.lineWidth = gap;
            lensPath(ctx, cx, cy, w, h);
            ctx.stroke();
          });
        }
      }
    }
  },
};

function lensPath(ctx: Canvas2DLike, cx: number, cy: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.quadraticCurveTo(cx + w, cy, cx, cy + h / 2);
  ctx.quadraticCurveTo(cx - w, cy, cx, cy - h / 2);
  ctx.closePath();
}

// ---------------------------------------------------------------------------------------------
// Ashlar
// ---------------------------------------------------------------------------------------------

const ashlar: PainterDef = {
  id: 'ashlar',
  surface: 'wall',
  description: 'Coursed dressed stone: blocks of several lengths in courses of different heights, with fine joints, chamfers and pitting.',
  colors: ['stoneA', 'stoneB', 'stoneC', 'joint'],
  params: {
    seed: SEED_PARAM,
    skirt: { ...SKIRT_PARAM, default: 0 } as PainterDef['params'][string],
    course: { type: 'number', min: 0.15, max: 0.5, default: 0.28, doc: 'Average course height (m).' },
    block: { type: 'number', min: 0.3, max: 1, default: 0.6, doc: 'Average block length (m).' },
    joint: { type: 'number', min: 0.004, max: 0.02, default: 0.009, doc: 'Joint width (m).' },
  },
  thumbSpan: 1.4,
  paint(ctx, s) {
    const stones = [col(s, 0), col(s, 1), col(s, 2)];
    const joint = col(s, 3);
    ctx.fillStyle = joint;
    ctx.fillRect(0, 0, s.w, s.h);
    const j = num(s, 'joint');
    let y = s.h;
    let c = 0;
    while (y > 0) {
      const rng = rngFor(s.seed, 40, c);
      const h = num(s, 'course') * (0.75 + rng.next() * 0.55);
      const count = fitCount(s.w, num(s, 'block'));
      const widths = randomParts(s.w, count, rng);
      let x = rng.next() * s.w;
      widths.forEach((w, i) => {
        const x0 = x >= s.w ? x - s.w : x;
        const y0 = y - h;
        const srng = rngFor(s.seed, 41, c, i);
        const fill = shade(stones[Math.floor(srng.next() * 3)] ?? joint, (srng.next() - 0.5) * 0.1);
        drawWrapped(ctx, s, x0, y0, x0 + w, y0 + h, () => {
          const px = x0 + j / 2, py = y0 + j / 2, pw = w - j, ph = h - j;
          const prng = rngFor(s.seed, 42, c, i);
          bevelRect(ctx, px, py, pw, ph, fill, Math.min(0.012, ph * 0.06), 0.18, 0.2);
          for (let q = 0; q < 3; q++) {
            softBlob(ctx, px + prng.next() * pw, py + prng.next() * ph, pw * (0.2 + prng.next() * 0.3), ph * (0.25 + prng.next() * 0.3), prng.next() * Math.PI,
              prng.next() < 0.5 ? '#ffffff' : '#000000', 0.09, 4);
          }
          const pits = Math.round(pw * ph * s.ppm * s.ppm * 0.03);
          const d = hair(s, 0.003, 1);
          ctx.fillStyle = rgba(shade(fill, -0.45), 0.4);
          for (let q = 0; q < pits; q++) ctx.fillRect(px + prng.next() * pw, py + prng.next() * ph, d, d);
        });
        x += w;
      });
      y -= h;
      c++;
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Tufted upholstery
// ---------------------------------------------------------------------------------------------

const tufted: PainterDef = {
  id: 'tufted',
  surface: 'wall',
  description: 'Diamond-tufted padded wall: puffed rhombus cushions between sewn pleats, with a button at every crossing.',
  colors: ['base', 'light', 'dark', 'button'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    pitch: { type: 'number', min: 0.1, max: 0.4, default: 0.2, doc: 'Distance between buttons along a row (m).' },
  },
  thumbSpan: 0.9,
  paint(ctx, s) {
    const base = col(s, 0), light = col(s, 1), dark = col(s, 2), button = col(s, 3);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s.w, s.h);
    const n = fitCount(s.w, num(s, 'pitch'));
    const p = s.w / n;
    const rows = Math.ceil(s.h / (p / 2)) + 3;
    // cushions first: a soft highlight on each rhombus and a shadow toward its lower edge
    for (let j = -2; j < rows; j++) {
      for (let i = 0; i < n; i++) {
        const x = (i + (((j % 2) + 2) % 2) * 0.5) * p, y = s.h - j * (p / 2);
        const cx = x, cy = y - p / 2;
        drawWrapped(ctx, s, cx - p / 2, cy - p / 2, cx + p / 2, cy + p / 2, () => {
          softBlob(ctx, cx - p * 0.04, cy - p * 0.06, p * 0.3, p * 0.3, 0, light, 0.5, 7);
          softBlob(ctx, cx + p * 0.05, cy + p * 0.12, p * 0.3, p * 0.22, 0, dark, 0.22, 5);
        });
      }
    }
    // pleats: diagonals between neighbouring buttons, dark with a lit edge
    ctx.lineCap = 'round';
    for (let j = -2; j < rows; j++) {
      for (let i = 0; i < n; i++) {
        const x = (i + (((j % 2) + 2) % 2) * 0.5) * p, y = s.h - j * (p / 2);
        drawWrapped(ctx, s, x - p / 2, y - p / 2, x + p / 2, y + p / 2, () => {
          for (const dx of [-p / 2, p / 2]) {
            ctx.strokeStyle = rgba(dark, 0.85);
            ctx.lineWidth = hair(s, 0.006, 1.2);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + dx, y - p / 2);
            ctx.stroke();
            ctx.strokeStyle = rgba(light, 0.4);
            ctx.lineWidth = hair(s, 0.002, 0.8);
            ctx.beginPath();
            ctx.moveTo(x + 0.004, y + 0.004);
            ctx.lineTo(x + dx + 0.004, y - p / 2 + 0.004);
            ctx.stroke();
          }
        });
      }
    }
    for (let j = -2; j < rows; j++) {
      for (let i = 0; i < n; i++) {
        const x = (i + (((j % 2) + 2) % 2) * 0.5) * p, y = s.h - j * (p / 2);
        drawWrapped(ctx, s, x - 0.03, y - 0.03, x + 0.03, y + 0.03, () => {
          ctx.fillStyle = rgba('#000000', 0.45);
          ctx.beginPath(); ctx.arc(x + 0.002, y + 0.003, hair(s, 0.011, 1.5), 0, TAU); ctx.fill();
          ctx.fillStyle = button;
          ctx.beginPath(); ctx.arc(x, y, hair(s, 0.01, 1.4), 0, TAU); ctx.fill();
          ctx.fillStyle = rgba('#ffffff', 0.55);
          ctx.beginPath(); ctx.arc(x - 0.003, y - 0.003, hair(s, 0.003, 0.6), 0, TAU); ctx.fill();
        });
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Corrugated metal
// ---------------------------------------------------------------------------------------------

const corrugated: PainterDef = {
  id: 'corrugated',
  surface: 'wall',
  description: 'Vertical corrugated sheet cladding with lapped seams, rivet lines and rust streaks running down from the fixings.',
  colors: ['base', 'light', 'dark', 'rust'],
  params: {
    seed: SEED_PARAM,
    skirt: { ...SKIRT_PARAM, default: 0 } as PainterDef['params'][string],
    wave: { type: 'number', min: 0.03, max: 0.15, default: 0.076, doc: 'Corrugation pitch (m).' },
    rust: { type: 'number', min: 0, max: 1, default: 0.5, doc: 'Rust and weathering.' },
  },
  thumbSpan: 0.8,
  paint(ctx, s) {
    const base = col(s, 0), light = col(s, 1), dark = col(s, 2), rust = col(s, 3);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s.w, s.h);
    const n = fitCount(s.w, num(s, 'wave'));
    const p = s.w / n;
    // eight tonal slices across each wave approximate the sine shading
    const slices = 8;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < slices; k++) {
        const t = Math.sin(((k + 0.5) / slices) * TAU); // -1 shadow .. 1 lit
        ctx.fillStyle = rgba(t > 0 ? light : dark, Math.abs(t) * 0.55);
        ctx.fillRect(i * p + (k / slices) * p, 0, p / slices + hair(s, 0.0005, 0.3), s.h);
      }
    }
    const rng = rngFor(s.seed, 3);
    const w = num(s, 'rust');
    // rust streaks from fixings
    for (let q = 0; q < Math.round(n * 0.6 * w); q++) {
      const x = rng.next() * s.w, y = rng.next() * s.h, len = s.h * (0.1 + rng.next() * 0.3);
      drawWrapped(ctx, s, x - 0.02, y, x + 0.02, y + len, () => {
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = rgba(rust, (0.1 * w) / (k + 1));
          ctx.fillRect(x - hair(s, 0.004) * (4 - k), y, hair(s, 0.004) * (4 - k) * 2, len * (0.5 + k * 0.16));
        }
      });
    }
    speckle(ctx, s, rng, 0.05 * w, [rust, dark], 0.4, 1.4);
    // sheet laps and rivet rows
    const sheet = s.h / 3;
    for (let k = 1; k < 3; k++) {
      const y = k * sheet;
      ctx.fillStyle = rgba('#000000', 0.3);
      ctx.fillRect(0, y, s.w, hair(s, 0.004));
      ctx.fillStyle = rgba('#ffffff', 0.18);
      ctx.fillRect(0, y + hair(s, 0.004), s.w, hair(s, 0.003));
    }
    ctx.fillStyle = rgba(shade(dark, -0.3), 0.8);
    for (let k = 0; k <= 3; k++) {
      const y = Math.min(s.h - 0.03, Math.max(0.03, k * sheet + (k === 0 ? 0.04 : k === 3 ? -0.04 : 0.03)));
      for (let i = 0; i < n; i += 2) {
        ctx.beginPath();
        ctx.arc(i * p + p * 0.5, y, hair(s, 0.007, 1.2), 0, TAU);
        ctx.fill();
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 2));
  },
};

// ---------------------------------------------------------------------------------------------
// Mural: layered hills
// ---------------------------------------------------------------------------------------------

const muralHills: PainterDef = {
  id: 'mural-hills',
  surface: 'wall',
  description: 'A landscape mural: a banded dawn sky and sun over four layers of rolling hills with pine trees on the nearest ridge.',
  colors: ['sky', 'sun', 'farHills', 'midHills', 'nearHills', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    horizon: { type: 'number', min: 0.8, max: 2.2, default: 1.5, doc: 'Height of the farthest ridge above the floor (m).' },
  },
  thumbSpan: 2.8,
  paint(ctx, s) {
    const [sky, sun, far, mid, near] = [col(s, 0), col(s, 1), col(s, 2), col(s, 3), col(s, 4)];
    const rng = rngFor(s.seed, 5);
    const hy = fromFloor(s, num(s, 'horizon'));
    // sky: bands from the sky colour to a warm glow at the horizon
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, s.w, s.h);
    const bands = 9;
    for (let k = 0; k < bands; k++) {
      ctx.fillStyle = rgba(sun, (k / bands) * 0.55);
      const y0 = hy * (0.35 + 0.65 * (k / bands));
      ctx.fillRect(0, y0, s.w, hy - y0 + 0.4);
    }
    // sun with a halo
    const sx = s.w * 0.62, sy = hy - 0.35;
    for (let k = 4; k >= 1; k--) {
      ctx.fillStyle = rgba(sun, 0.1 + 0.05 * (4 - k));
      ctx.beginPath(); ctx.arc(sx, sy, 0.16 + k * 0.1, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = sun;
    ctx.beginPath(); ctx.arc(sx, sy, 0.16, 0, TAU); ctx.fill();
    // hill layers: sums of whole sine periods across the repeat so the mural tiles along a run
    const layers = [{ c: far, drop: 0, amp: 0.16 }, { c: mid, drop: 0.32, amp: 0.2 }, { c: near, drop: 0.62, amp: 0.22 }, { c: shade(near, -0.22), drop: 0.95, amp: 0.2 }];
    layers.forEach((L, li) => {
      const f1 = 1 + li, f2 = 2 + li * 2 + 1;
      const p1 = rng.next() * TAU, p2 = rng.next() * TAU;
      const ridge = (x: number) => hy + L.drop + Math.sin((x / s.w) * TAU * f1 + p1) * L.amp * 0.6 + Math.sin((x / s.w) * TAU * f2 + p2) * L.amp * 0.4;
      ctx.fillStyle = L.c;
      ctx.beginPath();
      ctx.moveTo(0, s.h);
      const steps = 80;
      for (let i = 0; i <= steps; i++) ctx.lineTo((i / steps) * s.w, ridge((i / steps) * s.w));
      ctx.lineTo(s.w, s.h);
      ctx.closePath();
      ctx.fill();
      // a haze band on the ridge line makes distance read
      ctx.strokeStyle = rgba(sun, 0.16 - li * 0.03);
      ctx.lineWidth = hair(s, 0.03 - li * 0.006, 1);
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * s.w;
        if (i === 0) ctx.moveTo(x, ridge(x) + 0.015);
        else ctx.lineTo(x, ridge(x) + 0.015);
      }
      ctx.stroke();
      if (li === 2) {
        // pines on the nearest ridge, dark triangles
        const trees = 14;
        for (let t = 0; t < trees; t++) {
          const x = ((t + rng.next() * 0.8) / trees) * s.w, th = 0.16 + rng.next() * 0.16;
          const y = ridge(x) + 0.02;
          drawWrapped(ctx, s, x - th * 0.3, y - th, x + th * 0.3, y, () => {
            ctx.fillStyle = shade(near, -0.45);
            for (let q = 0; q < 3; q++) {
              const w = th * (0.34 - q * 0.07), yy = y - th * (0.16 + q * 0.26);
              ctx.beginPath();
              ctx.moveTo(x, yy - th * 0.4); ctx.lineTo(x + w, yy + th * 0.1); ctx.lineTo(x - w, yy + th * 0.1);
              ctx.closePath(); ctx.fill();
            }
          });
        }
      }
    });
    skirting(ctx, s, num(s, 'skirt'), col(s, 5));
  },
};

// ---------------------------------------------------------------------------------------------
// Library print
// ---------------------------------------------------------------------------------------------

const library: PainterDef = {
  id: 'library',
  surface: 'wall',
  description: 'A trompe-l\'oeil bookshelf print: rows of cloth-bound spines with gilt bands, leaning volumes and the odd gap, on plank shelves.',
  colors: ['back', 'shelf', 'bookA', 'bookB', 'bookC', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    shelf: { type: 'number', min: 0.25, max: 0.5, default: 0.34, doc: 'Distance between shelves (m).' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    const back = col(s, 0), shelf = col(s, 1);
    const spines = [col(s, 2), col(s, 3), col(s, 4), shade(col(s, 2), -0.25), shade(col(s, 3), 0.2), shade(col(s, 4), -0.3)];
    ctx.fillStyle = back;
    ctx.fillRect(0, 0, s.w, s.h);
    const rows = Math.ceil(s.h / num(s, 'shelf'));
    const rh = num(s, 'shelf');
    for (let r = 0; r < rows; r++) {
      const rng = rngFor(s.seed, 60, r);
      const floorY = s.h - r * rh; // underside of the row = top of the shelf plank below
      const plank = 0.03;
      const baseY = floorY - plank;
      const count = fitCount(s.w, 0.036, 6);
      const widths = randomParts(s.w, count, rng);
      let x = 0;
      widths.forEach((w, i) => {
        const bh = rh * (0.52 + rng.next() * 0.34);
        const gap = rng.next() < 0.06;
        if (!gap) {
          const c = spines[Math.floor(rng.next() * spines.length)] ?? shelf;
          const lean = rng.next() < 0.05 ? (rng.next() - 0.5) * 0.25 : 0;
          ctx.save();
          ctx.translate(x + w / 2, baseY);
          ctx.rotate(lean);
          ctx.fillStyle = c;
          ctx.fillRect(-w / 2, -bh, w, bh);
          ctx.fillStyle = rgba('#ffffff', 0.16);
          ctx.fillRect(-w / 2, -bh, w * 0.2, bh);
          ctx.fillStyle = rgba('#000000', 0.22);
          ctx.fillRect(w / 2 - w * 0.18, -bh, w * 0.18, bh);
          // gilt bands and a title label
          ctx.fillStyle = rgba('#d9b45a', 0.9);
          ctx.fillRect(-w / 2, -bh + bh * 0.1, w, hair(s, 0.003));
          ctx.fillRect(-w / 2, -bh + bh * 0.16, w, hair(s, 0.002));
          ctx.fillRect(-w / 2, -bh * 0.1, w, hair(s, 0.003));
          if (w > 0.03) {
            ctx.fillStyle = rgba('#f1e7cf', 0.85);
            ctx.fillRect(-w * 0.28, -bh * 0.7, w * 0.56, bh * 0.22);
          }
          ctx.restore();
        }
        x += w;
        void i;
      });
      // shadow under the books and the plank
      ctx.fillStyle = rgba('#000000', 0.22);
      ctx.fillRect(0, baseY - 0.012, s.w, 0.012);
      ctx.fillStyle = shelf;
      ctx.fillRect(0, baseY, s.w, plank);
      ctx.fillStyle = rgba('#ffffff', 0.3);
      ctx.fillRect(0, baseY, s.w, hair(s, 0.004));
      ctx.fillStyle = rgba('#000000', 0.3);
      ctx.fillRect(0, floorY - hair(s, 0.004), s.w, hair(s, 0.004));
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 5));
  },
};

export const WALL_MATERIAL_PAINTERS_2: readonly PainterDef[] = [
  panelSet, wallTileSet, ashlar, tufted, corrugated, muralHills, library,
];

export type { PaintSpec };
