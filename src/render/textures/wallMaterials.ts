// Wall painters for built and material surfaces: beadboard wainscoting, subway tile, brick, limewash
// plaster and damask. Pure functions over Canvas2DLike (see painterKit.ts). Structure that belongs at a
// height (skirting, dado rail, tile courses, brick courses) is measured from the floor line.

import {
  SEED_PARAM, SKIRT_PARAM, bevelRect, clouds, col, drawWrapped, fitCount, flag, fromFloor, hair, mix, num, rgba, rngFor,
  shade, skirting, speckle, str, wrappedKey, type Canvas2DLike, type PainterDef,
} from './painterKit';
import { leafPath, rollerTexture } from './wallPatterns';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Beadboard wainscoting
// ---------------------------------------------------------------------------------------------

const beadboard: PainterDef = {
  id: 'beadboard',
  surface: 'wall',
  description: 'Painted tongue-and-groove beadboard to dado height under a cap rail, painted wall above.',
  colors: ['upper', 'panel', 'groove', 'rail'],
  params: {
    seed: SEED_PARAM,
    skirt: { type: 'number', min: 0.06, max: 0.25, default: 0.13, doc: 'Skirting board height (m).' },
    panel: { type: 'number', min: 0.6, max: 1.5, default: 0.95, doc: 'Top of the panelling above the floor (m).' },
    board: { type: 'number', min: 0.05, max: 0.2, default: 0.1, doc: 'Board width (m).' },
    rail: { type: 'number', min: 0.02, max: 0.08, default: 0.045, doc: 'Cap rail height (m).' },
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    const upper = col(s, 0), panel = col(s, 1), groove = col(s, 2), railC = col(s, 3);
    const top = fromFloor(s, num(s, 'panel'));
    const railH = num(s, 'rail');
    ctx.fillStyle = upper;
    ctx.fillRect(0, 0, s.w, top);
    rollerTexture(ctx, s, upper, 0.45, rngFor(s.seed, 1), { y: 0, h: top - railH });
    ctx.fillStyle = panel;
    ctx.fillRect(0, top, s.w, s.h - top);
    const n = fitCount(s.w, num(s, 'board'));
    const bw = s.w / n;
    const g = hair(s, 0.004, 1);
    const rng = rngFor(s.seed, 2);
    for (let i = 0; i < n; i++) {
      const x = (i + 0.25) * bw; // joints sit off the texture edge
      // board joint: dark groove, lit bead edge, then a soft shadow
      ctx.fillStyle = groove;
      ctx.fillRect(x, top, g, s.h - top);
      ctx.fillStyle = rgba(shade(panel, 0.6), 0.55);
      ctx.fillRect(x + g, top, hair(s, 0.003), s.h - top);
      ctx.fillStyle = rgba('#000000', 0.06);
      ctx.fillRect(x + g + hair(s, 0.003), top, hair(s, 0.004), s.h - top);
      // central bead
      ctx.fillStyle = rgba(groove, 0.55);
      ctx.fillRect(x + bw / 2, top, hair(s, 0.002), s.h - top);
      ctx.fillStyle = rgba(shade(panel, 0.6), 0.4);
      ctx.fillRect(x + bw / 2 + hair(s, 0.002), top, hair(s, 0.002), s.h - top);
      // faint brushed paint over the grain
      ctx.fillStyle = rgba(shade(panel, rng.next() < 0.5 ? -0.3 : 0.3), 0.035);
      for (let k = 0; k < 3; k++) {
        const sx = (x + g + rng.next() * (bw - g * 3)) % s.w;
        ctx.fillRect(Math.min(sx, s.w - hair(s, 0.003)), top, hair(s, 0.003), s.h - top);
      }
    }
    // cap rail with a rounded nosing and the shadow it casts on the boards
    ctx.fillStyle = rgba('#000000', 0.16);
    ctx.fillRect(0, top, s.w, 0.01);
    ctx.fillStyle = rgba('#000000', 0.07);
    ctx.fillRect(0, top + 0.01, s.w, 0.012);
    ctx.fillStyle = railC;
    ctx.fillRect(0, top - railH, s.w, railH);
    ctx.fillStyle = rgba('#ffffff', 0.35);
    ctx.fillRect(0, top - railH, s.w, railH * 0.22);
    ctx.fillStyle = rgba('#000000', 0.12);
    ctx.fillRect(0, top - railH * 0.35, s.w, hair(s, 0.003));
    ctx.fillStyle = rgba('#000000', 0.1);
    ctx.fillRect(0, top - railH - 0.006, s.w, 0.006);
    skirting(ctx, s, num(s, 'skirt'), railC);
  },
};

// ---------------------------------------------------------------------------------------------
// Subway tile
// ---------------------------------------------------------------------------------------------

const subwayTile: PainterDef = {
  id: 'subway-tile',
  surface: 'wall',
  description: 'Glazed bevelled brick-shaped tiles laid from the floor up, in running or stacked bond.',
  colors: ['tile', 'grout'],
  params: {
    seed: SEED_PARAM,
    tileW: { type: 'number', min: 0.1, max: 0.3, default: 0.15, doc: 'Tile width (m).' },
    tileH: { type: 'number', min: 0.05, max: 0.15, default: 0.075, doc: 'Tile height (m).' },
    grout: { type: 'number', min: 0.001, max: 0.008, default: 0.003, doc: 'Grout joint (m).' },
    bond: { type: 'enum', values: ['running', 'stack'], default: 'running', doc: 'Laying pattern.' },
    bevel: { type: 'number', min: 0, max: 1, default: 0.6, doc: 'Edge bevel strength.' },
    variation: { type: 'number', min: 0, max: 1, default: 0.35, doc: 'Tile-to-tile glaze variation.' },
  },
  thumbSpan: 0.6,
  paint(ctx, s) {
    const tile = col(s, 0), grout = col(s, 1);
    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, s.w, s.h);
    const n = fitCount(s.w, num(s, 'tileW'));
    const tw = s.w / n;
    const th = num(s, 'tileH');
    const g = hair(s, num(s, 'grout'));
    const running = str(s, 'bond') === 'running';
    const bevel = num(s, 'bevel');
    const variation = num(s, 'variation');
    const rows = Math.ceil(s.h / th) + 1;
    for (let k = 0; k < rows; k++) {
      const y = s.h - (k + 1) * th;
      // a quarter-tile offset keeps vertical joints off the texture edge in both bonds
      const off = (running && k % 2 ? tw / 2 : 0) - tw / 4;
      for (let i = 0; i <= n; i++) {
        const x = i * tw - off;
        // each tile is drawn once from its start inside the repeat; drawWrapped adds the overflow copy
        if (x < -1e-9 || x >= s.w - 1e-9) continue;
        const rng = rngFor(s.seed, wrappedKey(s, x, 0), k);
        const t = (rng.next() - 0.5) * variation;
        const fill = shade(tile, t * 0.12);
        const glaze = 0.10 + rng.next() * 0.05;
        drawWrapped(ctx, s, x, y, x + tw, y + th, () => {
          bevelRect(ctx, x + g / 2, y + g / 2, tw - g, th - g, fill, th * 0.09 * bevel, 0.32 * bevel, 0.16 * bevel);
          // glaze: a soft highlight toward the upper left
          ctx.fillStyle = rgba('#ffffff', glaze);
          ctx.beginPath();
          ctx.ellipse(x + tw * 0.32, y + th * 0.32, tw * 0.22, th * 0.16, -0.15, 0, TAU);
          ctx.fill();
        });
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Brick
// ---------------------------------------------------------------------------------------------

const brick: PainterDef = {
  id: 'brick',
  surface: 'wall',
  description: 'Fired bricks with recessed mortar, tonal variation, speckle and worn arrises.',
  colors: ['brick', 'mortar', 'brickAlt', 'brickDark'],
  params: {
    seed: SEED_PARAM,
    brickW: { type: 'number', min: 0.18, max: 0.3, default: 0.215, doc: 'Stretcher length (m).' },
    brickH: { type: 'number', min: 0.05, max: 0.1, default: 0.065, doc: 'Brick height (m).' },
    joint: { type: 'number', min: 0.006, max: 0.016, default: 0.01, doc: 'Mortar joint (m).' },
    bond: { type: 'enum', values: ['running', 'flemish'], default: 'running', doc: 'Brick bond.' },
    variation: { type: 'number', min: 0, max: 1, default: 0.6, doc: 'Brick-to-brick colour variation.' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    const base = col(s, 0), mortar = col(s, 1), alt = col(s, 2), dark = col(s, 3);
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, s.w, s.h);
    speckle(ctx, s, rngFor(s.seed, 9), 0.06, [shade(mortar, -0.25), shade(mortar, 0.2)], 0.5);
    const S = num(s, 'brickW'), B = num(s, 'brickH'), j = num(s, 'joint');
    const flemish = str(s, 'bond') === 'flemish';
    const header = (S - j) / 2;
    const unit = flemish ? S + header + 2 * j : S + j;
    const m = fitCount(s.w, unit);
    const k = s.w / (m * unit); // horizontal scale so whole units fit the repeat
    const jx = j * k;
    const ch = B + j;
    const courses = Math.ceil(s.h / ch) + 1;
    const variation = num(s, 'variation');
    const bricks: Array<{ x: number; w: number; isHeader: boolean }> = [];
    for (let c = 0; c < courses; c++) {
      const y = s.h - (c + 1) * ch + j / 2;
      bricks.length = 0;
      if (flemish) {
        const sw = S * k, hw = header * k;
        const start = (c % 2 ? sw / 2 - hw / 2 : 0) + unit * k * 0.25;
        let x = start - (sw + hw + 2 * jx);
        let isHeader = c % 2 === 1;
        while (x < s.w + sw) {
          const w = isHeader ? hw : sw;
          bricks.push({ x, w, isHeader });
          x += w + jx;
          isHeader = !isHeader;
        }
      } else {
        const sw = S * k;
        const start = (c % 2 ? -(sw + jx) / 2 : 0) + (sw + jx) * 0.25; // perpends never on the texture edge
        for (let x = start - (sw + jx); x < s.w + sw; x += sw + jx) bricks.push({ x, w: sw, isHeader: false });
      }
      for (const b of bricks) {
        if (b.x < -1e-9 || b.x >= s.w - 1e-9) continue; // overflow is drawn by drawWrapped
        const rng = rngFor(s.seed, wrappedKey(s, b.x + jx / 2, 0), c);
        const t = rng.next();
        let fill = base;
        if (t < 0.45 * variation) fill = mix(base, alt, 0.4 + rng.next() * 0.6);
        else if (t < 0.7 * variation) fill = mix(base, dark, 0.3 + rng.next() * 0.5);
        if (b.isHeader) fill = mix(fill, dark, 0.45);
        fill = shade(fill, (rng.next() - 0.5) * 0.08);
        const x0 = b.x, w = b.w;
        const key = wrappedKey(s, b.x + jx / 2, 0);
        drawWrapped(ctx, s, x0, y, x0 + w, y + B, () => {
          // fresh generator per copy so wrapped copies draw identically
          const prng = rngFor(s.seed, key, c, 7);
          // shadow cast into the mortar bed under the brick
          ctx.fillStyle = rgba('#000000', 0.22);
          ctx.fillRect(x0, y + B, w, j * 0.5);
          ctx.fillStyle = fill;
          ctx.fillRect(x0, y, w, B);
          // tonal face patch and fire flash
          ctx.fillStyle = rgba(shade(fill, prng.next() < 0.5 ? 0.25 : -0.25), 0.18);
          ctx.beginPath();
          ctx.ellipse(x0 + w * (0.25 + prng.next() * 0.5), y + B * 0.5, w * 0.3, B * 0.35, 0, 0, TAU);
          ctx.fill();
          // speckle
          const dots = Math.round(w * B * s.ppm * s.ppm * 0.08); // about 8% of the brick's pixels
          ctx.fillStyle = rgba(shade(fill, -0.45), 0.5);
          const d = hair(s, 0.0025, 1);
          for (let q = 0; q < dots; q++) ctx.fillRect(x0 + prng.next() * (w - d), y + prng.next() * (B - d), d, d);
          // arrises: lit top edge, dark lower edge
          ctx.fillStyle = rgba('#ffffff', 0.14);
          ctx.fillRect(x0, y, w, hair(s, 0.005));
          ctx.fillStyle = rgba('#000000', 0.16);
          ctx.fillRect(x0, y + B - hair(s, 0.005), w, hair(s, 0.005));
          // an occasional chipped corner
          if (prng.next() < 0.25) {
            const cx = prng.next() < 0.5 ? x0 : x0 + w;
            const cs = B * (0.15 + prng.next() * 0.2);
            ctx.fillStyle = mortar;
            ctx.beginPath();
            ctx.moveTo(cx, y);
            ctx.lineTo(cx + (cx === x0 ? cs : -cs), y);
            ctx.lineTo(cx, y + cs);
            ctx.closePath();
            ctx.fill();
          }
        });
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Limewash plaster
// ---------------------------------------------------------------------------------------------

const limewash: PainterDef = {
  id: 'limewash',
  surface: 'wall',
  description: 'Mineral limewash over plaster: soft clouded tones crossed by broad X-shaped brush sweeps.',
  colors: ['base', 'light', 'dark'],
  params: {
    seed: SEED_PARAM,
    cloud: { type: 'number', min: 0.1, max: 1, default: 0.6, doc: 'Contrast of the clouding.' },
    scale: { type: 'number', min: 0.2, max: 1.2, default: 0.45, doc: 'Size of the clouds (m).' },
    brush: { type: 'number', min: 0, max: 1, default: 0.6, doc: 'Visibility of brush sweeps.' },
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    const base = col(s, 0), light = col(s, 1), dark = col(s, 2);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s.w, s.h);
    const rng = rngFor(s.seed, 3);
    const cloud = num(s, 'cloud');
    const size = num(s, 'scale');
    // broad, very soft tonal clouds
    clouds(ctx, s, rng, Math.round((s.w * s.h) / (size * size) * 1.4), size * 1.3, [light, dark], 0.45 * cloud);
    const brush = num(s, 'brush');
    if (brush > 0) {
      // limewash is laid on in criss-crossing X sweeps: wide soft strokes with bristle streaks
      const strokes = Math.round(s.w * s.h * 18);
      ctx.lineCap = 'round';
      for (let i = 0; i < strokes; i++) {
        const x = rng.next() * s.w;
        const y = rng.next() * s.h;
        const len = 0.35 + rng.next() * 0.45;
        const ang = (rng.next() < 0.5 ? 1 : -1) * (0.5 + rng.next() * 0.45);
        const dx = Math.sin(ang) * len / 2, dy = -Math.cos(ang) * len / 2;
        const bend = (rng.next() - 0.5) * len * 0.4;
        const c = rng.next() < 0.6 ? light : dark;
        const lw = 0.08 + rng.next() * 0.1;
        const a = (0.1 + rng.next() * 0.08) * brush;
        const r = len / 2 + lw;
        const path = (o: number) => {
          ctx.beginPath();
          ctx.moveTo(x - dx + o, y - dy);
          ctx.quadraticCurveTo(x + bend + o, y - bend * 0.5, x + dx + o, y + dy);
          ctx.stroke();
        };
        drawWrapped(ctx, s, x - r, y - r, x + r, y + r, () => {
          ctx.strokeStyle = rgba(c, a / 2);
          for (const k of [1, 0.66, 0.33]) {
            ctx.lineWidth = lw * k;
            path(0);
          }
          ctx.strokeStyle = rgba(c, a * 0.9);
          ctx.lineWidth = hair(s, lw * 0.05, 0.6);
          for (const o of [-0.35, -0.1, 0.12, 0.3]) path(o * lw);
        });
      }
    }
    speckle(ctx, s, rng, 0.03, [shade(base, 0.15), shade(base, -0.15)], 0.15);
  },
};

// ---------------------------------------------------------------------------------------------
// Damask
// ---------------------------------------------------------------------------------------------

type Seg = readonly [number, number, number, number, number, number];

/** Traces a closed outline symmetric about x = 0 from its right half (start on the axis, end on the axis). */
function traceSymmetric(ctx: Canvas2DLike, start: readonly [number, number], segs: readonly Seg[]): void {
  const pts: Array<readonly [number, number]> = [start];
  ctx.moveTo(start[0], start[1]);
  for (const sg of segs) {
    ctx.bezierCurveTo(sg[0], sg[1], sg[2], sg[3], sg[4], sg[5]);
    pts.push([sg[4], sg[5]]);
  }
  for (let k = segs.length; k >= 1; k--) {
    const sg = segs[k - 1] as Seg;
    const p = pts[k - 1] as readonly [number, number];
    ctx.bezierCurveTo(-sg[2], sg[3], -sg[0], sg[1], -p[0], p[1]);
  }
  ctx.closePath();
}

/** Right half of the central palmette (a teardrop pointing up), traced from its top point. */
const BODY: readonly Seg[] = [
  [0.02, -0.3, 0.13, -0.12, 0.13, 0.06],
  [0.13, 0.2, 0.07, 0.28, 0, 0.28],
];
const BODY_TOP: readonly [number, number] = [0, -0.4];

/** Draws a damask palmette medallion of height h (unit design space: y -0.5..0.5, x -0.36..0.36). */
function drawMedallion(ctx: Canvas2DLike, x: number, y: number, h: number, motif: string, ground: string, sheen: string, minLine: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(h, h);
  const lw = Math.max(0.024, minLine / h);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const leaf = (bx: number, by: number, ang: number, len: number, wid: number, curl: boolean) => {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ang);
    leafPath(ctx, len, wid);
    ctx.fillStyle = motif;
    ctx.fill();
    ctx.strokeStyle = sheen;
    ctx.lineWidth = lw * 0.3;
    ctx.beginPath();
    ctx.moveTo(0, -len * 0.08);
    ctx.quadraticCurveTo(wid * 0.3, -len * 0.5, 0, -len * 0.9);
    ctx.stroke();
    if (curl) {
      ctx.strokeStyle = motif;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(0.035, -len, 0.035, Math.PI, Math.PI * 2.7, false);
      ctx.stroke();
    }
    ctx.restore();
  };
  // framing acanthus: big leaves sweep up and out from the base and end in curls; smaller leaves above
  for (const m of [1, -1]) {
    ctx.save();
    ctx.scale(m, 1);
    leaf(0.04, 0.34, 0.95, 0.34, 0.1, true);
    leaf(0.05, -0.16, 0.55, 0.24, 0.07, true);
    leaf(0.12, 0.06, 1.35, 0.15, 0.05, false);
    ctx.fillStyle = motif;
    for (const [dx, dy, r] of [[0.3, -0.12, 0.018], [0.2, 0.39, 0.015], [0.27, -0.3, 0.012]] as const) {
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
  // central palmette: solid teardrop, ground cut-out, inner eye and fronds
  ctx.fillStyle = motif;
  ctx.beginPath();
  traceSymmetric(ctx, BODY_TOP, BODY);
  ctx.fill();
  ctx.save();
  ctx.translate(0, 0.05);
  ctx.scale(0.62, 0.62);
  ctx.fillStyle = ground;
  ctx.beginPath();
  traceSymmetric(ctx, BODY_TOP, BODY);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(0, 0.12);
  ctx.scale(0.3, 0.3);
  ctx.fillStyle = motif;
  ctx.beginPath();
  traceSymmetric(ctx, BODY_TOP, BODY);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = motif;
  ctx.lineWidth = lw * 0.6;
  for (const a of [-0.32, -0.16, 0.16, 0.32]) {
    ctx.beginPath();
    ctx.moveTo(0, 0.2);
    ctx.quadraticCurveTo(Math.sin(a) * 0.08, 0.02, Math.sin(a) * 0.17, -0.12 + Math.abs(a) * 0.3);
    ctx.stroke();
  }
  // finial, collar and pendant
  ctx.fillStyle = motif;
  ctx.beginPath();
  ctx.ellipse(0, -0.45, 0.022, 0.055, 0, 0, TAU);
  ctx.fill();
  for (const m of [1, -1]) {
    ctx.beginPath();
    ctx.ellipse(m * 0.04, -0.42, 0.016, 0.042, m * 0.65, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0.31, 0.09, 0.024, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 0.33);
  ctx.quadraticCurveTo(0.04, 0.4, 0, 0.46);
  ctx.quadraticCurveTo(-0.04, 0.4, 0, 0.33);
  ctx.fill();
  // sheen: a fine highlight tracing inside the palmette
  ctx.save();
  ctx.translate(0, 0.02);
  ctx.scale(0.84, 0.86);
  ctx.strokeStyle = rgba(sheen, 0.6);
  ctx.lineWidth = lw * 0.3;
  ctx.beginPath();
  traceSymmetric(ctx, BODY_TOP, BODY);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function drawFiller(ctx: Canvas2DLike, x: number, y: number, size: number, motif: string): void {
  ctx.fillStyle = motif;
  for (let q = 0; q < 4; q++) {
    const a = q * Math.PI / 2;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * size * 0.45, y + Math.sin(a) * size * 0.45, size * 0.4, size * 0.2, a, 0, TAU);
    ctx.fill();
    const b = a + Math.PI / 4;
    ctx.beginPath();
    ctx.arc(x + Math.cos(b) * size * 0.9, y + Math.sin(b) * size * 0.9, size * 0.1, 0, TAU);
    ctx.fill();
  }
}

const damask: PainterDef = {
  id: 'damask',
  surface: 'wall',
  description: 'Tone-on-tone symmetric medallions with scrolls and acanthus leaves in a half-drop, with filler rosettes.',
  colors: ['ground', 'motif', 'sheen', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    motif: { type: 'number', min: 0.25, max: 0.7, default: 0.42, doc: 'Medallion height (m).' },
    fillers: { type: 'boolean', default: true, doc: 'Small rosettes between the medallions.' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    const ground = col(s, 0), motif = col(s, 1), sheen = col(s, 2);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, s.w, s.h);
    // woven ground: a faint horizontal rib like a jacquard paper
    const rib = Math.max(0.004, 3 / s.ppm);
    ctx.fillStyle = rgba(shade(ground, -0.4), 0.025);
    for (let y = 0; y < s.h; y += rib * 2) ctx.fillRect(0, y, s.w, rib);
    const h = num(s, 'motif');
    const cols = fitCount(s.w, h * 0.8, 2, 2);
    const sx = s.w / cols;
    const sy = h * 1.22;
    const rows = Math.ceil(s.h / sy) + 2;
    const half = h * 0.38;
    for (let c = 0; c < cols; c++) {
      for (let r = -1; r <= rows; r++) {
        const x = (c + 0.5) * sx;
        const y = s.h - (r + (c % 2) * 0.5) * sy - sy * 0.55;
        drawWrapped(ctx, s, x - half, y - h / 2, x + half, y + h / 2, () =>
          drawMedallion(ctx, x, y, h, motif, ground, sheen, 0.9 / s.ppm));
        if (flag(s, 'fillers')) {
          const fx = c * sx;
          const fy = y - sy * 0.25;
          const fs = h * 0.07;
          drawWrapped(ctx, s, fx - fs, fy - fs, fx + fs, fy + fs, () => drawFiller(ctx, fx, fy, fs, motif));
        }
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

/** Wall painters for built and material surfaces. */
export const WALL_MATERIAL_PAINTERS: readonly PainterDef[] = [beadboard, subwayTile, brick, limewash, damask];

