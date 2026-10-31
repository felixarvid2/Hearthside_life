// Wall painters for printed and painted patterns: plain paint, regency stripes, gingham, floral sprig,
// diamond trellis, botanical sprays and art deco fans. Pure functions over Canvas2DLike (see painterKit.ts).
// Every painter fits whole pattern periods into the texture width, so walls tile seamlessly along a run.

import type { Rng } from '../../core/rng';
import {
  SEED_PARAM, SKIRT_PARAM, col, drawWrapped, fitCount, flag, hair, mix, num, rgba, rngFor, shade, skirting, speckle,
  type Canvas2DLike, type PaintSpec, type PainterDef,
} from './painterKit';

const TAU = Math.PI * 2;

/**
 * Faint paint-roller texture: soft vertical lanes about 23 cm wide with tiny tone shifts plus an
 * orange-peel speckle. Shared by every painted surface so paint reads as paint, not flat colour.
 */
export function rollerTexture(
  ctx: Canvas2DLike, s: PaintSpec, base: string, strength: number, rng: Rng,
  area: { y: number; h: number } = { y: 0, h: s.h },
): void {
  if (strength <= 0) return;
  const n = fitCount(s.w, 0.23);
  const lw = s.w / n;
  for (let i = 0; i < n; i++) {
    const t = rng.next() * 2 - 1;
    const c = t > 0 ? '#ffffff' : '#000000';
    const a = Math.abs(t) * 0.035 * strength;
    const x0 = i * lw - lw * 0.15;
    drawWrapped(ctx, s, x0, area.y, x0 + lw * 1.3, area.y + area.h, () => {
      ctx.fillStyle = c;
      for (let k = 0; k < 4; k++) {
        const inset = lw * 0.1 * k;
        ctx.globalAlpha = a / 4;
        ctx.fillRect(x0 + inset, area.y, lw * 1.3 - inset * 2, area.h);
      }
      ctx.globalAlpha = 1;
    });
  }
  speckle(ctx, s, rng, 0.05 * strength, [shade(base, 0.25), shade(base, -0.25)], 0.22, 1.2, { x: 0, y: area.y, w: s.w, h: area.h });
}

// ---------------------------------------------------------------------------------------------
// Plain paint
// ---------------------------------------------------------------------------------------------

const plainPaint: PainterDef = {
  id: 'plain-paint',
  surface: 'wall',
  description: 'Matt emulsion with a faint roller texture over a moulded skirting board.',
  colors: ['wall', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    texture: { type: 'number', min: 0, max: 1, default: 0.45, doc: 'Roller texture strength.' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    const wall = col(s, 0);
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, s.w, s.h);
    rollerTexture(ctx, s, wall, num(s, 'texture'), rngFor(s.seed, 1));
    skirting(ctx, s, num(s, 'skirt'), col(s, 1));
  },
};

// ---------------------------------------------------------------------------------------------
// Regency stripes
// ---------------------------------------------------------------------------------------------

const regencyStripes: PainterDef = {
  id: 'regency-stripes',
  surface: 'wall',
  description: 'Broad satin stripes flanked by fine pinstripes, in equal bands.',
  colors: ['ground', 'stripe', 'pinstripe', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    stripe: { type: 'number', min: 0.04, max: 0.2, default: 0.09, doc: 'Broad stripe width (m).' },
    pin: { type: 'number', min: 0.002, max: 0.02, default: 0.006, doc: 'Pinstripe width (m).' },
    gap: { type: 'number', min: 0.003, max: 0.03, default: 0.009, doc: 'Gap between stripe and pinstripe (m).' },
    centrePin: { type: 'boolean', default: true, doc: 'Adds a pinstripe in the middle of each ground band.' },
    sheen: { type: 'boolean', default: true, doc: 'Satin sheen lines inside the broad stripe.' },
  },
  thumbSpan: 0.8,
  paint(ctx, s) {
    const ground = col(s, 0), stripe = col(s, 1), pin = col(s, 2);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, s.w, s.h);
    rollerTexture(ctx, s, ground, 0.25, rngFor(s.seed, 1));
    const n = fitCount(s.w, num(s, 'stripe') * 2);
    const period = s.w / n;
    const sw = period / 2;
    const pw = hair(s, num(s, 'pin'));
    const gap = num(s, 'gap');
    // full-height bar that wraps around the texture edge when it crosses it
    const bar = (x: number, w: number) => {
      const x0 = ((x % s.w) + s.w) % s.w;
      ctx.fillRect(x0, 0, w, s.h);
      if (x0 + w > s.w) ctx.fillRect(x0 - s.w, 0, w, s.h);
    };
    for (let i = 0; i < n; i++) {
      // shifted by an eighth of a period so the centre pinstripe never lands on the texture edge
      const x = i * period + period / 4 + period / 8;
      ctx.fillStyle = stripe;
      bar(x, sw);
      if (flag(s, 'sheen')) {
        // satin weave: a few faint lighter lines across the stripe
        ctx.fillStyle = rgba(shade(stripe, 0.5), 0.12);
        for (const f of [0.18, 0.5, 0.82]) bar(x + sw * f - pw * 0.4, pw * 0.8);
        ctx.fillStyle = rgba(shade(stripe, -0.4), 0.10);
        bar(x, hair(s, 0.0015));
        bar(x + sw - hair(s, 0.0015), hair(s, 0.0015));
      }
      ctx.fillStyle = pin;
      bar(x - gap - pw, pw);
      bar(x + sw + gap, pw);
      if (flag(s, 'centrePin')) bar(x + sw + (period - sw) / 2 - pw / 2, pw);
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Gingham
// ---------------------------------------------------------------------------------------------

const gingham: PainterDef = {
  id: 'gingham',
  surface: 'wall',
  description: 'Woven gingham check: half-tone bands crossing into solid squares, with a fine twill.',
  colors: ['check', 'ground', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    check: { type: 'number', min: 0.02, max: 0.1, default: 0.045, doc: 'Check (band) width (m).' },
    weave: { type: 'number', min: 0, max: 1, default: 0.6, doc: 'Visibility of the woven thread texture.' },
  },
  thumbSpan: 0.7,
  paint(ctx, s) {
    const check = col(s, 0), ground = col(s, 1);
    const half = mix(ground, check, 0.5);
    const n = fitCount(s.w, num(s, 'check') * 2);
    const c = s.w / (n * 2);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, s.w, s.h);
    const rows: number[] = [];
    // vertical bands start half a band in, so no band edge sits on the texture edge;
    // horizontal bands are measured from the floor so the bottom row is whole
    for (let y = s.h - c; y > -c; y -= c * 2) rows.push(y);
    ctx.fillStyle = half;
    for (let i = 0; i < n; i++) ctx.fillRect(i * 2 * c + c / 2, 0, c, s.h);
    for (const y of rows) ctx.fillRect(0, y, s.w, c);
    ctx.fillStyle = check;
    for (let i = 0; i < n; i++) for (const y of rows) ctx.fillRect(i * 2 * c + c / 2, y, c, c);
    const weave = num(s, 'weave');
    if (weave > 0) {
      // threads along each band direction
      const step = Math.max(0.004, 2.5 / s.ppm);
      ctx.fillStyle = rgba(shade(check, -0.5), 0.07 * weave);
      for (let i = 0; i < n; i++) {
        for (let x = i * 2 * c + c / 2 + step / 2; x < i * 2 * c + c * 1.5; x += step) ctx.fillRect(x, 0, hair(s, step * 0.35, 0.5), s.h);
      }
      for (const y of rows) for (let yy = y + step / 2; yy < y + c; yy += step) ctx.fillRect(0, yy, s.w, hair(s, step * 0.35, 0.5));
      // diagonal twill across the whole cloth (period divides the width, so it stays seamless)
      const d = s.w / fitCount(s.w, Math.max(0.006, 4 / s.ppm));
      ctx.strokeStyle = rgba('#ffffff', 0.05 * weave);
      ctx.lineWidth = hair(s, d * 0.3, 0.5);
      ctx.beginPath();
      for (let x = -s.h; x < s.w; x += d) {
        ctx.moveTo(x, s.h);
        ctx.lineTo(x + s.h, 0);
      }
      ctx.stroke();
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 2));
  },
};

// ---------------------------------------------------------------------------------------------
// Floral sprig
// ---------------------------------------------------------------------------------------------

/** Leaf outline with its base at (0,0) and tip at (0,-len). */
export function leafPath(ctx: Canvas2DLike, len: number, width: number): void {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(width, -len * 0.22, width * 0.8, -len * 0.78, 0, -len);
  ctx.bezierCurveTo(-width * 0.8, -len * 0.78, -width, -len * 0.22, 0, 0);
  ctx.closePath();
}

interface SprigColors { petal: string; leaf: string; centre: string }

function drawSprig(
  ctx: Canvas2DLike, x: number, y: number, size: number, rot: number, mirror: boolean, petals: number, c: SprigColors,
  minLine: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(mirror ? -size : size, size);
  const lw = Math.max(0.05, minLine / size);
  ctx.strokeStyle = c.leaf;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-0.04, 0.62);
  ctx.quadraticCurveTo(0.12, 0.15, 0.03, -0.26);
  ctx.moveTo(0.07, 0.24);
  ctx.quadraticCurveTo(0.3, 0.08, 0.38, -0.1);
  ctx.stroke();
  // leaves
  ctx.fillStyle = c.leaf;
  for (const [lx, ly, ang, len, wid] of [
    [0.05, 0.36, -1.15, 0.36, 0.14], [0.08, 0.1, 1.0, 0.3, 0.12], [0.0, 0.52, 0.9, 0.24, 0.1],
  ] as const) {
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(ang);
    leafPath(ctx, len, wid);
    ctx.fill();
    ctx.strokeStyle = shade(c.leaf, 0.3);
    ctx.lineWidth = lw * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -len * 0.08);
    ctx.lineTo(0, -len * 0.8);
    ctx.stroke();
    ctx.restore();
  }
  // bud
  ctx.fillStyle = c.petal;
  ctx.beginPath();
  ctx.ellipse(0.4, -0.15, 0.065, 0.1, 0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.leaf;
  ctx.beginPath();
  ctx.ellipse(0.385, -0.08, 0.05, 0.04, 0.5, 0, TAU);
  ctx.fill();
  // flower head
  const fx = 0.03, fy = -0.36;
  for (let k = 0; k < petals; k++) {
    const a = (k / petals) * TAU - Math.PI / 2;
    ctx.fillStyle = c.petal;
    ctx.beginPath();
    ctx.ellipse(fx + Math.cos(a) * 0.13, fy + Math.sin(a) * 0.13, 0.125, 0.08, a, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = shade(c.petal, -0.18);
    ctx.lineWidth = lw * 0.35;
    ctx.stroke();
  }
  ctx.fillStyle = c.centre;
  ctx.beginPath();
  ctx.arc(fx, fy, 0.065, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba('#ffffff', 0.45);
  ctx.beginPath();
  ctx.arc(fx - 0.02, fy - 0.02, 0.022, 0, TAU);
  ctx.fill();
  ctx.restore();
}

const floralSprig: PainterDef = {
  id: 'floral-sprig',
  surface: 'wall',
  description: 'Small flower sprigs with leaves and a bud, arranged in a gently scattered half-drop.',
  colors: ['ground', 'petal', 'leaf', 'centre', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    spacing: { type: 'number', min: 0.08, max: 0.3, default: 0.15, doc: 'Horizontal spacing between sprig columns (m).' },
    size: { type: 'number', min: 0.02, max: 0.1, default: 0.05, doc: 'Sprig size (m).' },
    petals: { type: 'number', min: 4, max: 7, default: 5, integer: true, doc: 'Petals per flower.' },
    scatter: { type: 'number', min: 0, max: 1, default: 0.3, doc: 'Random rotation and offset.' },
  },
  thumbSpan: 0.6,
  paint(ctx, s) {
    const ground = col(s, 0);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, s.w, s.h);
    rollerTexture(ctx, s, ground, 0.2, rngFor(s.seed, 1));
    const colors: SprigColors = { petal: col(s, 1), leaf: col(s, 2), centre: col(s, 3) };
    const cols = fitCount(s.w, num(s, 'spacing'), 2, 2);
    const sx = s.w / cols;
    const sy = sx * 1.25;
    const size = num(s, 'size');
    const scatter = num(s, 'scatter');
    const petals = Math.round(num(s, 'petals'));
    const rows = Math.ceil(s.h / sy) + 1;
    for (let c = 0; c < cols; c++) {
      for (let r = -1; r <= rows; r++) {
        const rng = rngFor(s.seed, c, r);
        const x = (c + 0.5) * sx + (rng.next() - 0.5) * sx * 0.25 * scatter;
        const y = (r + (c % 2) * 0.5) * sy + (rng.next() - 0.5) * sy * 0.2 * scatter;
        const rot = (c % 2 ? -0.35 : 0.35) + (rng.next() - 0.5) * 1.2 * scatter;
        const mirror = (c + r) % 2 === 0;
        const rad = size * 0.8;
        drawWrapped(ctx, s, x - rad, y - rad, x + rad, y + rad, () =>
          drawSprig(ctx, x, y, size, rot, mirror, petals, colors, 0.9 / s.ppm));
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 4));
  },
};

// ---------------------------------------------------------------------------------------------
// Diamond trellis
// ---------------------------------------------------------------------------------------------

const diamondTrellis: PainterDef = {
  id: 'diamond-trellis',
  surface: 'wall',
  description: 'Double-ruled diagonal lattice forming tall diamonds, with quatrefoil rosettes at the crossings.',
  colors: ['ground', 'line', 'node', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    cell: { type: 'number', min: 0.1, max: 0.4, default: 0.2, doc: 'Diamond width (m).' },
    aspect: { type: 'number', min: 1, max: 2, default: 1.4, doc: 'Diamond height / width.' },
    line: { type: 'number', min: 0.002, max: 0.02, default: 0.005, doc: 'Lattice line width (m).' },
    double: { type: 'boolean', default: true, doc: 'Double-ruled lattice lines.' },
    dots: { type: 'boolean', default: true, doc: 'Small dot in the centre of each diamond.' },
  },
  thumbSpan: 0.8,
  paint(ctx, s) {
    const ground = col(s, 0), lc = col(s, 1), node = col(s, 2);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, s.w, s.h);
    rollerTexture(ctx, s, ground, 0.2, rngFor(s.seed, 1));
    const n = fitCount(s.w, num(s, 'cell'));
    const cw = s.w / n;
    const ch = cw * num(s, 'aspect');
    const lw = hair(s, num(s, 'line'));
    const run = (s.h / ch) * cw; // horizontal travel of a diagonal over the wall height
    const sinT = ch / Math.hypot(cw, ch);
    const offsets = flag(s, 'double') ? [-lw * 1.4 / sinT, lw * 1.4 / sinT] : [0];
    // anchor the lattice to the floor so a full row of crossings sits just above the skirting
    const y0 = s.h - Math.ceil(s.h / ch) * ch;
    ctx.strokeStyle = lc;
    ctx.lineWidth = lw;
    ctx.beginPath();
    const kMin = -Math.ceil(run / cw) - 2, kMax = n + Math.ceil(run / cw) + 2;
    for (let k = kMin; k <= kMax; k++) {
      for (const o of offsets) {
        const x = k * cw + o;
        ctx.moveTo(x, y0);
        ctx.lineTo(x + run + cw, y0 + s.h + ch);
        ctx.moveTo(x, y0);
        ctx.lineTo(x - run - cw, y0 + s.h + ch);
      }
    }
    ctx.stroke();
    const rows = Math.ceil((s.h - y0) / ch) + 1;
    const r = lw * 2.2 + 0.004;
    for (let j = 0; j <= rows * 2; j++) {
      const y = y0 + j * ch / 2;
      const shift = j % 2 ? cw / 2 : 0;
      for (let i = -1; i <= n; i++) {
        const x = i * cw + shift;
        // quatrefoil rosette at each crossing
        ctx.fillStyle = node;
        for (let q = 0; q < 4; q++) {
          const a = q * Math.PI / 2;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75, r * 0.62, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = shade(node, -0.25);
        ctx.beginPath();
        ctx.arc(x, y, r * 0.38, 0, TAU);
        ctx.fill();
        if (flag(s, 'dots')) {
          ctx.fillStyle = rgba(node, 0.7);
          ctx.beginPath();
          ctx.arc(x + cw / 2, y, r * 0.35, 0, TAU);
          ctx.fill();
        }
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Botanical sprays
// ---------------------------------------------------------------------------------------------

interface SprayColors { leafA: string; leafB: string; vein: string }

function drawSpray(ctx: Canvas2DLike, rng: Rng, x: number, y: number, leaf: number, angle: number, c: SprayColors, minLine: number): void {
  const len = leaf * 2.1;
  const bend = (rng.next() - 0.5) * leaf * 1.2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = c.leafB;
  ctx.lineWidth = Math.max(leaf * 0.05, minLine);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(bend, -len * 0.5, bend * 0.4, -len);
  ctx.stroke();
  const pairs = 3 + Math.floor(rng.next() * 2);
  const at = (t: number) => {
    // point and tangent on the stem curve
    const px = 2 * (1 - t) * t * bend + t * t * bend * 0.4;
    const py = 2 * (1 - t) * t * (-len * 0.5) + t * t * -len;
    const dx = 2 * (1 - t) * bend + 2 * t * (bend * 0.4 - bend);
    const dy = 2 * (1 - t) * (-len * 0.5) + 2 * t * (-len + len * 0.5);
    return { px, py, a: Math.atan2(dx, -dy) };
  };
  const leaves: Array<{ px: number; py: number; a: number; l: number; fill: string }> = [];
  for (let i = 0; i < pairs; i++) {
    const t = 0.22 + (i / pairs) * 0.68;
    const p = at(t);
    for (const side of [-1, 1]) {
      const spread = 0.75 + rng.next() * 0.35;
      leaves.push({
        px: p.px, py: p.py, a: p.a + side * spread, l: leaf * (0.62 + (1 - t) * 0.3) * (0.9 + rng.next() * 0.2),
        fill: rng.next() < 0.5 ? c.leafA : c.leafB,
      });
    }
  }
  const tip = at(1);
  leaves.push({ px: tip.px, py: tip.py, a: tip.a, l: leaf * 0.7, fill: c.leafA });
  for (const lf of leaves) {
    ctx.save();
    ctx.translate(lf.px, lf.py);
    ctx.rotate(lf.a);
    const w = lf.l * 0.3;
    leafPath(ctx, lf.l, w);
    ctx.fillStyle = shade(lf.fill, (rng.next() - 0.5) * 0.12);
    ctx.fill();
    ctx.strokeStyle = rgba(c.vein, 0.6);
    ctx.lineWidth = Math.max(lf.l * 0.03, minLine * 0.7);
    ctx.beginPath();
    ctx.moveTo(0, -lf.l * 0.05);
    ctx.lineTo(0, -lf.l * 0.88);
    for (let v = 1; v <= 3; v++) {
      const vy = -lf.l * (0.22 * v);
      ctx.moveTo(0, vy);
      ctx.lineTo(w * 0.6, vy - lf.l * 0.12);
      ctx.moveTo(0, vy);
      ctx.lineTo(-w * 0.6, vy - lf.l * 0.12);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

const botanicalSprays: PainterDef = {
  id: 'botanical-sprays',
  surface: 'wall',
  description: 'Leafy branches in two greens over a faint tone-on-tone shadow layer.',
  colors: ['ground', 'leafA', 'leafB', 'vein', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    leaf: { type: 'number', min: 0.05, max: 0.25, default: 0.1, doc: 'Leaf length (m).' },
    density: { type: 'number', min: 0.5, max: 1.5, default: 1, doc: 'Branches per area.' },
    shadows: { type: 'boolean', default: true, doc: 'Faint background layer of branches.' },
  },
  thumbSpan: 0.9,
  paint(ctx, s) {
    const ground = col(s, 0);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, s.w, s.h);
    rollerTexture(ctx, s, ground, 0.2, rngFor(s.seed, 1));
    const leaf = num(s, 'leaf');
    const cols = fitCount(s.w, (leaf * 2.6) / Math.sqrt(num(s, 'density')), 2, 2);
    const sx = s.w / cols;
    const sy = sx * 1.15;
    const rows = Math.ceil(s.h / sy) + 2;
    const reach = leaf * 2.6;
    const layers: Array<{ colors: SprayColors; scale: number; shift: number }> = [];
    if (flag(s, 'shadows')) {
      const tone = mix(ground, col(s, 2), 0.22);
      layers.push({ colors: { leafA: tone, leafB: tone, vein: tone }, scale: 0.8, shift: 0.5 });
    }
    layers.push({ colors: { leafA: col(s, 1), leafB: col(s, 2), vein: col(s, 3) }, scale: 1, shift: 0 });
    layers.forEach((layer, li) => {
      for (let c = 0; c < cols; c++) {
        for (let r = -1; r <= rows; r++) {
          const rng = rngFor(s.seed, 300 + li, c, r);
          const x = (c + 0.5 + layer.shift) * sx + (rng.next() - 0.5) * sx * 0.3;
          const y = (r + (c % 2) * 0.5 + layer.shift * 0.5) * sy + (rng.next() - 0.5) * sy * 0.3;
          const angle = (rng.next() - 0.5) * 1.6 + ((c + r) % 2 ? 0.5 : -0.5);
          drawWrapped(ctx, s, x - reach, y - reach, x + reach, y + reach, () =>
            drawSpray(ctx, rngFor(s.seed, 500 + li, c, r), x, y, leaf * layer.scale, angle, layer.colors, 0.9 / s.ppm));
        }
      }
    });
    skirting(ctx, s, num(s, 'skirt'), col(s, 4));
  },
};

// ---------------------------------------------------------------------------------------------
// Art deco fans
// ---------------------------------------------------------------------------------------------

const decoFans: PainterDef = {
  id: 'deco-fans',
  surface: 'wall',
  description: 'Overlapping rows of rayed fans with gilded outlines (a stepped scale layout).',
  colors: ['ground', 'fan', 'line', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    radius: { type: 'number', min: 0.05, max: 0.2, default: 0.09, doc: 'Fan radius (m).' },
    rays: { type: 'number', min: 5, max: 15, default: 9, integer: true, doc: 'Rays per fan.' },
    rings: { type: 'number', min: 1, max: 3, default: 2, integer: true, doc: 'Concentric rings per fan.' },
  },
  thumbSpan: 0.7,
  paint(ctx, s) {
    const ground = col(s, 0), fan = col(s, 1), lc = col(s, 2);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, s.w, s.h);
    const n = fitCount(s.w, num(s, 'radius') * 2);
    const r = s.w / (n * 2);
    const rays = Math.round(num(s, 'rays'));
    const rings = Math.round(num(s, 'rings'));
    const lw = hair(s, r * 0.035);
    const rows = Math.ceil(s.h / r) + 2;
    for (let j = 0; j <= rows; j++) {
      const cy = j * r;
      const off = (j % 2) * r;
      for (let i = 0; i < n; i++) {
        const cx = i * 2 * r + off + r;
        drawWrapped(ctx, s, cx - r - lw, cy - r - lw, cx + r + lw, cy + r + lw, () => {
          ctx.fillStyle = ground;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, TAU);
          ctx.fill();
          ctx.fillStyle = fan;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r * 0.8, Math.PI, TAU);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = lc;
          ctx.lineWidth = lw * 0.8;
          ctx.beginPath();
          for (let k = 1; k < rays; k++) {
            const a = Math.PI + (k / rays) * Math.PI;
            ctx.moveTo(cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2);
            ctx.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
          }
          ctx.stroke();
          ctx.lineWidth = lw;
          for (let q = 0; q < rings; q++) {
            ctx.beginPath();
            ctx.arc(cx, cy, r * (0.8 + (q + 1) * (0.18 / (rings + 0.5))), Math.PI, TAU);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(cx, cy, r - lw / 2, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = lc;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r * 0.2, Math.PI, TAU);
          ctx.closePath();
          ctx.fill();
        });
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

/** Wall painters for printed and painted patterns. */
export const WALL_PATTERN_PAINTERS: readonly PainterDef[] = [
  plainPaint, regencyStripes, gingham, floralSprig, diamondTrellis, botanicalSprays, decoFans,
];

