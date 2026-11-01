// More printed wall patterns (Milestone 2): two-tone dado, stripe and plaid sets, geometric motifs, large
// blooms, cherry blossom, palm and monstera leaves, deco diamonds, fleur-de-lis trellis and playful stars and
// clouds. Same rules as wallPatterns.ts: whole pattern periods across the repeat (walls tile along a run),
// motifs measured from the floor, solid colours only.

import { leafPath, rollerTexture } from './wallPatterns';
import {
  SEED_PARAM, SKIRT_PARAM, col, drawWrapped, fitCount, hair, mix, num, polygonPath, rgba, rngFor, shade, skirting, str,
  type Canvas2DLike, type PaintSpec, type PainterDef,
} from './painterKit';

const TAU = Math.PI * 2;

function ground(ctx: Canvas2DLike, s: PaintSpec, color: string, roller = 0.2): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, s.w, s.h);
  rollerTexture(ctx, s, color, roller, rngFor(s.seed, 1));
}

/** Fine woven cloth: vertical and horizontal thread lines in one translucent tone (period divides the width). */
function threads(ctx: Canvas2DLike, s: PaintSpec, strength: number): void {
  if (strength <= 0) return;
  const step = s.w / fitCount(s.w, Math.max(0.008, 3 / s.ppm));
  ctx.fillStyle = rgba('#000000', 0.045 * strength);
  for (let x = 0; x < s.w; x += step) ctx.fillRect(x, 0, hair(s, step * 0.4, 0.5), s.h);
  ctx.fillStyle = rgba('#ffffff', 0.05 * strength);
  for (let y = s.h; y > 0; y -= step) ctx.fillRect(0, y, s.w, hair(s, step * 0.4, 0.5));
}

// ---------------------------------------------------------------------------------------------
// Two-tone dado
// ---------------------------------------------------------------------------------------------

const twoTone: PainterDef = {
  id: 'two-tone',
  surface: 'wall',
  description: 'Two painted colours split by a moulded dado rail: darker lower wall, lighter upper wall.',
  colors: ['upper', 'lower', 'rail', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    dado: { type: 'number', min: 0.5, max: 1.6, default: 0.95, doc: 'Dado rail height above the floor (m).' },
    rail: { type: 'number', min: 0.02, max: 0.08, default: 0.045, doc: 'Rail depth (m).' },
  },
  thumbSpan: 1.4,
  paint(ctx, s) {
    ground(ctx, s, col(s, 0), 0.4);
    const top = s.h - num(s, 'dado');
    ctx.fillStyle = col(s, 1);
    ctx.fillRect(0, top, s.w, s.h - top);
    rollerTexture(ctx, s, col(s, 1), 0.4, rngFor(s.seed, 2), { y: top, h: s.h - top });
    const r = num(s, 'rail'), rail = col(s, 2);
    // soft shadow under the rail, then the rail: cap, ogee face, bead
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, top + r * 0.55, s.w, r * 0.45);
    ctx.fillStyle = rail;
    ctx.fillRect(0, top - r * 0.5, s.w, r);
    ctx.fillStyle = shade(rail, 0.4);
    ctx.fillRect(0, top - r * 0.5, s.w, hair(s, 0.004));
    ctx.fillStyle = shade(rail, -0.18);
    ctx.fillRect(0, top + r * 0.1, s.w, hair(s, 0.004));
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, top + r * 0.5 - hair(s, 0.003), s.w, hair(s, 0.003));
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Stripes: candy, ticking, breton
// ---------------------------------------------------------------------------------------------

const stripeSet: PainterDef = {
  id: 'stripe-set',
  surface: 'wall',
  description: 'Woven stripes: even candy stripes, fine irregular ticking, or horizontal Breton bands.',
  colors: ['ground', 'stripe', 'accent', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    style: { type: 'enum', values: ['candy', 'ticking', 'breton'], default: 'candy', doc: 'Stripe layout.' },
    width: { type: 'number', min: 0.01, max: 0.12, default: 0.04, doc: 'Stripe (candy), group (ticking) or band (breton) width (m).' },
    weave: { type: 'number', min: 0, max: 1, default: 0.6, doc: 'Visibility of the woven thread texture.' },
  },
  thumbSpan: 0.8,
  paint(ctx, s) {
    const g = col(s, 0), stripe = col(s, 1), accent = col(s, 2);
    const style = str(s, 'style');
    ground(ctx, s, g, 0.25);
    const w = num(s, 'width');
    if (style === 'breton') {
      // bands counted up from the floor: stripe, ground, stripe ... with a thin accent edge
      const bandH = w;
      const n = Math.ceil(s.h / bandH);
      for (let k = 0; k < n; k++) {
        if (k % 2) continue;
        const y = s.h - (k + 1) * bandH;
        ctx.fillStyle = stripe;
        ctx.fillRect(0, y, s.w, bandH);
        ctx.fillStyle = rgba(shade(stripe, -0.35), 0.35);
        ctx.fillRect(0, y + bandH - hair(s, 0.003), s.w, hair(s, 0.003));
        ctx.fillStyle = rgba(accent, 0.55);
        ctx.fillRect(0, y, s.w, hair(s, 0.002));
      }
    } else if (style === 'ticking') {
      // a group: thin, gap, thick, gap, thin, then ground; groups fit the width exactly
      const n = fitCount(s.w, w * 4);
      const p = s.w / n;
      const rng = rngFor(s.seed, 7);
      for (let i = 0; i < n; i++) {
        const x0 = i * p + p * 0.06;
        const parts: Array<[number, number]> = [[0, 0.06], [0.14, 0.28], [0.36, 0.42]];
        for (const [a, b] of parts) {
          const j = (rng.next() - 0.5) * 0.01;
          ctx.fillStyle = a === 0.14 ? stripe : mix(stripe, g, 0.15);
          ctx.fillRect(x0 + (a + j) * p, 0, Math.max(hair(s, 0.002), (b - a) * p), s.h);
        }
        ctx.fillStyle = rgba(accent, 0.5);
        ctx.fillRect(x0 + 0.62 * p, 0, hair(s, 0.0018), s.h);
      }
    } else {
      const n = fitCount(s.w, w * 2, 1);
      const p = s.w / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = stripe;
        ctx.fillRect(i * p + p / 4, 0, p / 2, s.h);
        ctx.fillStyle = rgba(accent, 0.4);
        ctx.fillRect(i * p + p / 4, 0, hair(s, 0.002), s.h);
        ctx.fillRect(i * p + p * 0.75 - hair(s, 0.002), 0, hair(s, 0.002), s.h);
      }
    }
    threads(ctx, s, num(s, 'weave'));
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Plaids: buffalo check, tartan
// ---------------------------------------------------------------------------------------------

const plaidSet: PainterDef = {
  id: 'plaid-set',
  surface: 'wall',
  description: 'Woven plaids: bold two-tone buffalo check, or a tartan sett of crossing coloured bands and thin overchecks.',
  colors: ['ground', 'band', 'band2', 'overcheck', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    style: { type: 'enum', values: ['buffalo', 'tartan'], default: 'buffalo', doc: 'Plaid type.' },
    size: { type: 'number', min: 0.04, max: 0.4, default: 0.1, doc: 'Check size (buffalo) or sett size (tartan) (m).' },
    weave: { type: 'number', min: 0, max: 1, default: 0.6, doc: 'Visibility of the woven thread texture.' },
  },
  thumbSpan: 0.8,
  paint(ctx, s) {
    const g = col(s, 0), a = col(s, 1), b = col(s, 2), over = col(s, 3);
    ground(ctx, s, g, 0.15);
    const n = fitCount(s.w, num(s, 'size') * (str(s, 'style') === 'tartan' ? 1 : 2));
    const p = s.w / n; // buffalo: one 2 x 2 block; tartan: one sett
    if (str(s, 'style') === 'buffalo') {
      const c = p / 2;
      const rows = Math.ceil(s.h / c) + 1;
      for (let j = 0; j < rows; j++) {
        const y = s.h - (j + 1) * c;
        for (let i = 0; i < n * 2; i++) {
          const both = i % 2 === 0 && j % 2 === 0, none = i % 2 === 1 && j % 2 === 1;
          if (none) continue;
          ctx.fillStyle = both ? a : mix(g, a, 0.5);
          ctx.fillRect(i * c, y, c, c);
        }
      }
    } else {
      // sett as fractions of p: [from, to, colour index]
      const sett: Array<[number, number, string]> = [
        [0.0, 0.34, g], [0.34, 0.5, a], [0.5, 0.58, g], [0.58, 0.66, b], [0.66, 0.74, g], [0.74, 0.9, a], [0.9, 1, g],
      ];
      const bandsV = (alpha: number) => {
        for (let i = 0; i < n; i++) {
          for (const [f0, f1, c] of sett) {
            ctx.fillStyle = rgba(c, alpha);
            ctx.fillRect(i * p + f0 * p, 0, (f1 - f0) * p, s.h);
          }
        }
      };
      bandsV(1);
      const rows = Math.ceil(s.h / p) + 1;
      for (let j = 0; j < rows; j++) {
        const y0 = s.h - (j + 1) * p;
        for (const [f0, f1, c] of sett) {
          ctx.fillStyle = rgba(c, 0.62);
          ctx.fillRect(0, y0 + (1 - f1) * p, s.w, (f1 - f0) * p);
        }
        ctx.fillStyle = rgba(over, 0.8);
        ctx.fillRect(0, y0 + p * 0.5 - hair(s, 0.002) / 2, s.w, hair(s, 0.002));
      }
      ctx.fillStyle = rgba(over, 0.8);
      for (let i = 0; i < n; i++) ctx.fillRect(i * p + p * 0.5 - hair(s, 0.002) / 2, 0, hair(s, 0.002), s.h);
    }
    // twill
    const d = s.w / fitCount(s.w, Math.max(0.006, 4 / s.ppm));
    ctx.strokeStyle = rgba('#ffffff', 0.07 * num(s, 'weave'));
    ctx.lineWidth = hair(s, d * 0.3, 0.5);
    ctx.beginPath();
    for (let x = -s.h; x < s.w; x += d) { ctx.moveTo(x, s.h); ctx.lineTo(x + s.h, 0); }
    ctx.stroke();
    skirting(ctx, s, num(s, 'skirt'), col(s, 4));
  },
};

// ---------------------------------------------------------------------------------------------
// Geometric motifs
// ---------------------------------------------------------------------------------------------

type Pt = readonly [number, number];

function poly(ctx: Canvas2DLike, pts: readonly Pt[], fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  polygonPath(ctx, pts);
  ctx.fill();
}

const geoMotifs: PainterDef = {
  id: 'geo-motifs',
  surface: 'wall',
  description: 'Contemporary geometrics: chevron, tumbling blocks, mermaid scales, quatrefoil lattice and mid-century dots.',
  colors: ['ground', 'motifA', 'motifB', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    motif: { type: 'enum', values: ['chevron', 'tumbling', 'scales', 'quatrefoil', 'dots'], default: 'chevron', doc: 'Motif.' },
    size: { type: 'number', min: 0.05, max: 0.5, default: 0.2, doc: 'Motif width (m).' },
  },
  thumbSpan: 0.8,
  paint(ctx, s) {
    const g = col(s, 0), A = col(s, 1), B = col(s, 2);
    const motif = str(s, 'motif');
    ground(ctx, s, g, 0.2);
    const n = fitCount(s.w, num(s, 'size'), motif === 'dots' || motif === 'quatrefoil' ? 2 : 1, motif === 'dots' || motif === 'quatrefoil' ? 2 : 1);
    const p = s.w / n;
    if (motif === 'chevron') {
      // V boards, apex down; stripes alternate ground / A / B going up from the floor
      const bx = p / 2, vw = p * 0.36;
      const rows = Math.ceil((s.h + bx) / vw) + 2;
      for (let k = -1; k < rows; k++) {
        const ya = s.h - k * vw;
        const phase = ((k % 4) + 4) % 4;
        if (phase % 2) continue; // odd stripes stay ground
        const c = phase === 0 ? A : B;
        for (let i = 0; i < n; i++) {
          const cx = (2 * i + 1) * bx;
          poly(ctx, [[cx, ya], [cx - bx, ya - bx], [cx - bx, ya - bx - vw], [cx, ya - vw]], c);
          poly(ctx, [[cx, ya], [cx + bx, ya - bx], [cx + bx, ya - bx - vw], [cx, ya - vw]], c);
        }
      }
    } else if (motif === 'tumbling') {
      const r = p / Math.sqrt(3);
      const hy = r, hw = p / 2;
      const ry = 1.5 * hy;
      const rows = Math.ceil(s.h / ry) + 2;
      for (let j = -1; j < rows; j++) {
        for (let i = -1; i <= n; i++) {
          const cx = (i + 0.5 + (((j % 2) + 2) % 2) * 0.5) * p, cy = s.h - j * ry;
          poly(ctx, [[cx, cy], [cx - hw, cy - hy / 2], [cx, cy - hy], [cx + hw, cy - hy / 2]], g);
          poly(ctx, [[cx, cy], [cx - hw, cy - hy / 2], [cx - hw, cy + hy / 2], [cx, cy + hy]], A);
          poly(ctx, [[cx, cy], [cx + hw, cy - hy / 2], [cx + hw, cy + hy / 2], [cx, cy + hy]], B);
          ctx.strokeStyle = rgba('#000000', 0.18);
          ctx.lineWidth = hair(s, 0.002);
          ctx.beginPath();
          ctx.moveTo(cx - hw, cy - hy / 2); ctx.lineTo(cx, cy); ctx.lineTo(cx + hw, cy - hy / 2);
          ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + hy);
          ctx.stroke();
        }
      }
    } else if (motif === 'scales') {
      // overlapping circles, bottom row first so every row overlaps the one below
      const r = p / 2;
      const ry = r * 0.5;
      const rows = Math.ceil(s.h / ry) + 3;
      for (let j = -1; j < rows; j++) {
        for (let i = -1; i <= n; i++) {
          const cx = (i + 0.5 + (((j % 2) + 2) % 2) * 0.5) * p, cy = s.h - j * ry;
          const tone = [A, g, B][((j % 3) + 3) % 3] as string;
          for (const [k, c] of [[1, tone], [0.78, shade(tone, 0.18)], [0.56, tone], [0.34, shade(tone, 0.18)]] as const) {
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.arc(cx, cy, r * k, 0, TAU);
            ctx.fill();
          }
          ctx.strokeStyle = rgba('#000000', 0.22);
          ctx.lineWidth = hair(s, 0.0022);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0.1, Math.PI - 0.1);
          ctx.stroke();
        }
      }
    } else if (motif === 'quatrefoil') {
      const rows = Math.ceil(s.h / p) + 2;
      const r = p * 0.27;
      for (let j = -1; j < rows; j++) {
        for (let i = 0; i < n; i++) {
          const cx = (i + 0.5) * p, cy = s.h - (j + 0.5) * p;
          // lobes and the connecting square form one quatrefoil; a staggered second lattice sits between them
          for (const [ox, oy, rad, c] of [[0, 0, 1, A], [0.5, 0.5, 0.55, B]] as const) {
            const x0 = cx + ox * p, y0 = cy - oy * p;
            drawWrapped(ctx, s, x0 - p * 0.4, y0 - p * 0.4, x0 + p * 0.4, y0 + p * 0.4, () => {
              ctx.fillStyle = c;
              ctx.beginPath();
              for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
                ctx.moveTo(x0 + dx * r * rad * 0.9 + r * rad, y0 + dy * r * rad * 0.9);
                ctx.arc(x0 + dx * r * rad * 0.9, y0 + dy * r * rad * 0.9, r * rad, 0, TAU);
              }
              ctx.rect(x0 - r * rad * 0.9, y0 - r * rad * 0.9, r * rad * 1.8, r * rad * 1.8);
              ctx.fill();
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(x0, y0, r * rad * 0.28, 0, TAU);
              ctx.fill();
            });
          }
        }
      }
    } else {
      // half-drop discs: large disc, ring and a small dot in the gaps
      const rows = Math.ceil(s.h / (p * 0.5)) + 2;
      for (let j = -1; j < rows; j++) {
        for (let i = 0; i < n; i++) {
          const cx = (i + 0.5 + (((j % 2) + 2) % 2) * 0.5) * p, cy = s.h - j * p * 0.5;
          drawWrapped(ctx, s, cx - p * 0.4, cy - p * 0.4, cx + p * 0.4, cy + p * 0.4, () => {
            ctx.fillStyle = j % 2 ? B : A;
            ctx.beginPath();
            ctx.arc(cx, cy, p * 0.3, 0, TAU);
            ctx.fill();
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, p * 0.12, 0, TAU);
            ctx.fill();
            ctx.fillStyle = j % 2 ? A : B;
            ctx.beginPath();
            ctx.arc(cx + p * 0.5, cy, p * 0.06, 0, TAU);
            ctx.fill();
          });
        }
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Large blooms
// ---------------------------------------------------------------------------------------------

function bloom(ctx: Canvas2DLike, x: number, y: number, r: number, petal: string, deep: string, centre: string, rot: number, rings: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  for (let k = rings; k >= 1; k--) {
    const n = 5 + k * 2;
    const rr = (r * k) / rings;
    ctx.fillStyle = k % 2 ? petal : mix(petal, deep, 0.45);
    for (let q = 0; q < n; q++) {
      const a = (q / n) * TAU + k * 0.4;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * rr * 0.55, Math.sin(a) * rr * 0.55, rr * 0.5, rr * 0.3, a, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = rgba(deep, 0.35);
    ctx.lineWidth = Math.max(r * 0.012, 0.0008);
    ctx.beginPath();
    ctx.arc(0, 0, rr * 0.55, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = centre;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.14, 0, TAU);
  ctx.fill();
  ctx.restore();
}

const bloomLarge: PainterDef = {
  id: 'bloom-large',
  surface: 'wall',
  description: 'Big layered peony-style blooms with leaf clusters between, in a generous half-drop. A statement chintz.',
  colors: ['ground', 'petal', 'petalDeep', 'leaf', 'centre', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    spacing: { type: 'number', min: 0.2, max: 0.8, default: 0.4, doc: 'Bloom column spacing (m).' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    ground(ctx, s, col(s, 0), 0.2);
    const n = fitCount(s.w, num(s, 'spacing'), 2, 2);
    const p = s.w / n;
    const rows = Math.ceil(s.h / p) + 2;
    for (let j = -1; j < rows; j++) {
      for (let i = 0; i < n; i++) {
        const rng = rngFor(s.seed, i, j);
        const cx = (i + 0.5) * p, cy = s.h - (j + (i % 2) * 0.5) * p;
        const r = p * (0.3 + rng.next() * 0.04);
        drawWrapped(ctx, s, cx - p * 0.7, cy - p * 0.7, cx + p * 0.7, cy + p * 0.7, () => {
          // leaves first so the bloom overlaps them
          for (const [a, len] of [[-2.4, 0.55], [-0.7, 0.5], [0.9, 0.5], [2.2, 0.55], [3.1, 0.4]] as const) {
            ctx.save();
            ctx.translate(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5);
            ctx.rotate(a + Math.PI / 2);
            ctx.fillStyle = col(s, 3);
            leafPath(ctx, p * len, p * 0.14);
            ctx.fill();
            ctx.strokeStyle = shade(col(s, 3), 0.3);
            ctx.lineWidth = hair(s, 0.003, 0.7);
            ctx.beginPath();
            ctx.moveTo(0, -p * len * 0.1);
            ctx.lineTo(0, -p * len * 0.85);
            ctx.stroke();
            ctx.restore();
          }
          bloom(ctx, cx, cy, r, col(s, 1), col(s, 2), col(s, 4), rng.next() * TAU, 3);
        });
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 5));
  },
};

// ---------------------------------------------------------------------------------------------
// Cherry blossom
// ---------------------------------------------------------------------------------------------

function blossom(ctx: Canvas2DLike, x: number, y: number, r: number, rot: number, petal: string, centre: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = petal;
  for (let q = 0; q < 5; q++) {
    ctx.save();
    ctx.rotate((q / 5) * TAU);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-r * 0.7, -r * 0.2, -r * 0.55, -r * 1.0, -r * 0.12, -r * 0.92);
    ctx.lineTo(0, -r * 0.8);
    ctx.lineTo(r * 0.12, -r * 0.92);
    ctx.bezierCurveTo(r * 0.55, -r * 1.0, r * 0.7, -r * 0.2, 0, 0);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = centre;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.14, 0, TAU);
  ctx.fill();
  ctx.restore();
}

const blossomBranch: PainterDef = {
  id: 'blossom-branch',
  surface: 'wall',
  description: 'Cherry-blossom branches sweeping up the wall, with five-petal flowers, buds and drifting petals.',
  colors: ['ground', 'branch', 'petal', 'centre', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    spacing: { type: 'number', min: 0.4, max: 1.2, default: 0.7, doc: 'Branch column spacing (m).' },
  },
  thumbSpan: 1.4,
  paint(ctx, s) {
    ground(ctx, s, col(s, 0), 0.2);
    const n = fitCount(s.w, num(s, 'spacing'), 1);
    const p = s.w / n;
    for (let i = 0; i < n; i++) {
      const rng = rngFor(s.seed, 11, i);
      const dir = i % 2 ? -1 : 1;
      const x0 = i * p + p * 0.5, y0 = s.h;
      // trunk-to-twig path as a chain of quadratic curves, sampled for flower positions
      const pts: Array<[number, number]> = [];
      let x = x0, y = y0, ang = -Math.PI / 2 + dir * 0.5;
      ctx.strokeStyle = col(s, 1);
      ctx.lineCap = 'round';
      for (let seg = 0; seg < 6; seg++) {
        const len = p * (0.45 + rng.next() * 0.2) * (1 - seg * 0.06);
        const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
        const cx = x + Math.cos(ang + dir * 0.5) * len * 0.6, cy = y + Math.sin(ang + dir * 0.5) * len * 0.6;
        drawWrapped(ctx, s, Math.min(x, nx, cx) - 0.05, Math.min(y, ny, cy) - 0.05, Math.max(x, nx, cx) + 0.05, Math.max(y, ny, cy) + 0.05, () => {
          ctx.lineWidth = hair(s, p * 0.035 * (1 - seg * 0.13), 1);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(cx, cy, nx, ny);
          ctx.stroke();
        });
        pts.push([(x + nx) / 2 + (cx - x) * 0.15, (y + ny) / 2 + (cy - y) * 0.15], [nx, ny]);
        x = nx; y = ny;
        ang += dir * (rng.next() - 0.35) * 0.9;
      }
      pts.forEach(([fx, fy], q) => {
        const fr = p * (0.075 + rng.next() * 0.03);
        const rot = rng.next() * TAU;
        const bud = q % 5 === 4;
        drawWrapped(ctx, s, fx - fr * 1.5, fy - fr * 1.5, fx + fr * 1.5, fy + fr * 1.5, () => {
          if (bud) {
            ctx.fillStyle = col(s, 2);
            ctx.beginPath();
            ctx.ellipse(fx, fy, fr * 0.35, fr * 0.55, rot, 0, TAU);
            ctx.fill();
          } else blossom(ctx, fx, fy, fr, rot, col(s, 2), col(s, 3));
        });
      });
      // drifting petals
      for (let q = 0; q < 9; q++) {
        const fx = rng.next() * s.w, fy = rng.next() * s.h, fr = p * 0.025;
        const rot = rng.next() * TAU;
        drawWrapped(ctx, s, fx - fr * 2, fy - fr * 2, fx + fr * 2, fy + fr * 2, () => {
          ctx.fillStyle = rgba(col(s, 2), 0.85);
          ctx.beginPath();
          ctx.ellipse(fx, fy, fr * 1.4, fr * 0.8, rot, 0, TAU);
          ctx.fill();
        });
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 4));
  },
};

// ---------------------------------------------------------------------------------------------
// Palm fronds and monstera
// ---------------------------------------------------------------------------------------------

function palmFrond(ctx: Canvas2DLike, len: number, a: string, b: string, vein: string, lw: number): void {
  // rib curves to the right; leaflets sweep off both sides
  const steps = 16;
  const rib = (t: number): [number, number] => [len * 0.28 * Math.sin(t * 1.6) * t, -len * t];
  ctx.lineCap = 'round';
  ctx.strokeStyle = vein;
  ctx.lineWidth = lw * 1.6;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const [x, y] = rib(i / steps);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const [x, y] = rib(t);
    const L = len * 0.3 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)) * (1.05 - t * 0.4);
    for (const side of [-1, 1]) {
      ctx.fillStyle = (i + (side > 0 ? 1 : 0)) % 2 ? a : b;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + side * L * 0.55, y - L * 0.12, x + side * L * 0.95, y + L * 0.28);
      ctx.quadraticCurveTo(x + side * L * 0.5, y + L * 0.12, x, y + len * 0.02);
      ctx.fill();
    }
  }
}

function monstera(ctx: Canvas2DLike, size: number, a: string, b: string, vein: string, bg: string, lw: number): void {
  // heart-shaped leaf with base at (0,0), tip at (0,-size); slits cut with the ground colour
  ctx.fillStyle = a;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-size * 0.75, size * 0.05, -size * 0.7, -size * 0.8, 0, -size);
  ctx.bezierCurveTo(size * 0.7, -size * 0.8, size * 0.75, size * 0.05, 0, 0);
  ctx.fill();
  ctx.fillStyle = b;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(size * 0.7, -size * 0.1, size * 0.65, -size * 0.8, 0, -size);
  ctx.bezierCurveTo(size * 0.2, -size * 0.6, size * 0.2, -size * 0.3, 0, 0);
  ctx.fill();
  ctx.strokeStyle = vein;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.04);
  ctx.lineTo(0, -size * 0.92);
  ctx.stroke();
  for (let k = 0; k < 4; k++) {
    const y = -size * (0.18 + k * 0.19);
    for (const side of [-1, 1]) {
      ctx.strokeStyle = vein;
      ctx.lineWidth = lw * 0.6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(side * size * 0.55, y - size * 0.1);
      ctx.stroke();
      // slit
      ctx.strokeStyle = bg;
      ctx.lineWidth = Math.max(lw * 1.8, size * 0.035);
      ctx.beginPath();
      ctx.moveTo(side * size * 0.66, y - size * 0.02);
      ctx.lineTo(side * size * 0.3, y - size * 0.07);
      ctx.stroke();
    }
  }
}

const palmLeaf: PainterDef = {
  id: 'palm-leaf',
  surface: 'wall',
  description: 'Large tropical leaves in a half-drop: arching palm fronds or slit monstera leaves with pale veins.',
  colors: ['ground', 'leafA', 'leafB', 'vein', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    leaf: { type: 'enum', values: ['palm', 'monstera'], default: 'palm', doc: 'Leaf shape.' },
    spacing: { type: 'number', min: 0.25, max: 0.9, default: 0.5, doc: 'Column spacing (m).' },
  },
  thumbSpan: 1.4,
  paint(ctx, s) {
    ground(ctx, s, col(s, 0), 0.2);
    const palm = str(s, 'leaf') === 'palm';
    const n = fitCount(s.w, num(s, 'spacing'), 2, 2);
    const p = s.w / n;
    const rows = Math.ceil(s.h / (p * 1.2)) + 2;
    for (let j = -1; j < rows; j++) {
      for (let i = 0; i < n; i++) {
        const rng = rngFor(s.seed, i, j);
        const cx = (i + 0.5) * p + (rng.next() - 0.5) * p * 0.1;
        const cy = s.h - (j + (i % 2) * 0.5) * p * 1.2;
        const rot = (rng.next() - 0.5) * 0.9 + (i % 2 ? 0.25 : -0.25);
        const size = p * (palm ? 1.0 : 0.85);
        drawWrapped(ctx, s, cx - size * 0.8, cy - size, cx + size * 0.8, cy + size * 0.2, () => {
          ctx.save();
          ctx.translate(cx, cy + size * 0.35);
          ctx.rotate(rot);
          if (palm) palmFrond(ctx, size, col(s, 1), col(s, 2), col(s, 3), hair(s, size * 0.012, 1));
          else monstera(ctx, size, col(s, 1), col(s, 2), col(s, 3), col(s, 0), hair(s, size * 0.012, 1));
          ctx.restore();
        });
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 4));
  },
};

// ---------------------------------------------------------------------------------------------
// Deco diamonds
// ---------------------------------------------------------------------------------------------

const decoDiamonds: PainterDef = {
  id: 'deco-diamonds',
  surface: 'wall',
  description: 'Art Deco nested stepped diamonds on a lattice, with gilded rules and corner studs between them.',
  colors: ['ground', 'motif', 'gold', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    size: { type: 'number', min: 0.15, max: 0.6, default: 0.3, doc: 'Diamond width (m).' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    ground(ctx, s, col(s, 0), 0.2);
    const n = fitCount(s.w, num(s, 'size'));
    const p = s.w / n;
    const h = p * 1.25;
    const rows = Math.ceil(s.h / h) + 2;
    const diamond = (cx: number, cy: number, rx: number, ry: number): Pt[] => [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
    for (let j = -1; j < rows; j++) {
      for (let i = 0; i < n; i++) {
        const cx = (i + 0.5) * p, cy = s.h - (j + 0.5) * h;
        // nested diamonds: filled motif, ground, filled motif, gold core
        poly(ctx, diamond(cx, cy, p * 0.5, h * 0.5), col(s, 1));
        poly(ctx, diamond(cx, cy, p * 0.4, h * 0.4), col(s, 0));
        poly(ctx, diamond(cx, cy, p * 0.3, h * 0.3), col(s, 1));
        poly(ctx, diamond(cx, cy, p * 0.14, h * 0.14), col(s, 2));
        ctx.strokeStyle = col(s, 2);
        ctx.lineWidth = hair(s, 0.003, 0.9);
        ctx.beginPath();
        polygonPath(ctx, diamond(cx, cy, p * 0.45, h * 0.45));
        ctx.stroke();
        // studs at the lattice crossings between rows and columns
        ctx.fillStyle = col(s, 2);
        for (const [sx, sy] of [[cx + p / 2, cy + h / 2], [cx + p / 2, cy - h / 2]] as const) {
          drawWrapped(ctx, s, sx - 0.02, sy - 0.02, sx + 0.02, sy + 0.02, () => {
            ctx.beginPath();
            ctx.arc(sx, sy, hair(s, 0.009, 1.2), 0, TAU);
            ctx.fill();
          });
        }
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Fleur-de-lis trellis
// ---------------------------------------------------------------------------------------------

function fleur(ctx: Canvas2DLike, size: number, color: string): void {
  ctx.fillStyle = color;
  // centre petal
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.bezierCurveTo(size * 0.32, -size * 0.65, size * 0.26, -size * 0.2, 0, size * 0.05);
  ctx.bezierCurveTo(-size * 0.26, -size * 0.2, -size * 0.32, -size * 0.65, 0, -size);
  ctx.fill();
  // side petals curl outward
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * size * 0.04, -size * 0.12);
    ctx.bezierCurveTo(side * size * 0.5, -size * 0.55, side * size * 0.75, -size * 0.1, side * size * 0.5, size * 0.12);
    ctx.bezierCurveTo(side * size * 0.45, -size * 0.1, side * size * 0.3, -size * 0.12, side * size * 0.06, -size * 0.02);
    ctx.fill();
  }
  // band and tail
  ctx.fillRect(-size * 0.3, -size * 0.04, size * 0.6, size * 0.1);
  ctx.beginPath();
  ctx.moveTo(-size * 0.07, size * 0.06);
  ctx.lineTo(size * 0.07, size * 0.06);
  ctx.lineTo(0, size * 0.34);
  ctx.fill();
}

const fleurTrellis: PainterDef = {
  id: 'fleur-trellis',
  surface: 'wall',
  description: 'Fleurs-de-lis at the centre of every diamond of a fine trellis, in the manner of a Georgian drawing room.',
  colors: ['ground', 'motif', 'line', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    size: { type: 'number', min: 0.15, max: 0.5, default: 0.26, doc: 'Diamond width (m).' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    ground(ctx, s, col(s, 0), 0.25);
    const n = fitCount(s.w, num(s, 'size'));
    const p = s.w / n;
    const h = p * 1.35;
    const rows = Math.ceil(s.h / h) + 2;
    ctx.strokeStyle = col(s, 2);
    ctx.lineWidth = hair(s, 0.004, 0.9);
    // diagonal lattice lines
    for (let j = -2; j < rows; j++) {
      for (let i = 0; i < n; i++) {
        const cx = (i + 0.5) * p, cy = s.h - (j + 0.5) * h;
        drawWrapped(ctx, s, cx - p * 0.6, cy - h * 0.6, cx + p * 0.6, cy + h * 0.6, () => {
          ctx.strokeStyle = col(s, 2);
          ctx.lineWidth = hair(s, 0.004, 0.9);
          ctx.beginPath();
          polygonPath(ctx, [[cx, cy - h * 0.5], [cx + p * 0.5, cy], [cx, cy + h * 0.5], [cx - p * 0.5, cy]]);
          ctx.stroke();
          ctx.save();
          ctx.translate(cx, cy + h * 0.1);
          fleur(ctx, h * 0.3, col(s, 1));
          ctx.restore();
          ctx.fillStyle = col(s, 2);
          ctx.beginPath();
          ctx.arc(cx + p * 0.5, cy + h * 0.5, hair(s, 0.008, 1.1), 0, TAU);
          ctx.fill();
        });
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Playful: stars and clouds
// ---------------------------------------------------------------------------------------------

function star(ctx: Canvas2DLike, r: number, color: string, rot: number): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = rot + (k / 10) * TAU - Math.PI / 2;
    const rr = k % 2 ? r * 0.45 : r;
    if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

const playfulSet: PainterDef = {
  id: 'playful-set',
  surface: 'wall',
  description: "Children's prints: twinkling stars with crescent moons, or fluffy clouds with raindrops.",
  colors: ['ground', 'motifA', 'motifB', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: SKIRT_PARAM,
    motif: { type: 'enum', values: ['stars', 'clouds'], default: 'stars', doc: 'Print.' },
    spacing: { type: 'number', min: 0.15, max: 0.6, default: 0.3, doc: 'Column spacing (m).' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    ground(ctx, s, col(s, 0), 0.25);
    const stars = str(s, 'motif') === 'stars';
    const n = fitCount(s.w, num(s, 'spacing'), 2, 2);
    const p = s.w / n;
    const rows = Math.ceil(s.h / (p * 0.9)) + 2;
    for (let j = -1; j < rows; j++) {
      for (let i = 0; i < n; i++) {
        const rng = rngFor(s.seed, i, j);
        const cx = (i + 0.5 + (j % 2) * 0.5) * p + (rng.next() - 0.5) * p * 0.2;
        const cy = s.h - j * p * 0.9 + (rng.next() - 0.5) * p * 0.2;
        const pick = rng.next();
        drawWrapped(ctx, s, cx - p * 0.5, cy - p * 0.5, cx + p * 0.5, cy + p * 0.5, () => {
          ctx.save();
          ctx.translate(cx, cy);
          if (stars) {
            if (pick < 0.18) {
              // crescent moon
              ctx.fillStyle = col(s, 2);
              ctx.beginPath();
              ctx.arc(0, 0, p * 0.2, 0, TAU);
              ctx.fill();
              ctx.fillStyle = col(s, 0);
              ctx.beginPath();
              ctx.arc(p * 0.09, -p * 0.04, p * 0.17, 0, TAU);
              ctx.fill();
            } else if (pick < 0.65) star(ctx, p * (0.14 + rng.next() * 0.07), col(s, 1), rng.next() * 0.6);
            else {
              ctx.fillStyle = col(s, 2);
              for (let q = 0; q < 3; q++) {
                ctx.beginPath();
                ctx.arc((rng.next() - 0.5) * p * 0.4, (rng.next() - 0.5) * p * 0.4, hair(s, p * 0.03, 1), 0, TAU);
                ctx.fill();
              }
              star(ctx, p * 0.07, col(s, 2), 0);
            }
          } else {
            const w = p * (0.42 + rng.next() * 0.1);
            ctx.fillStyle = col(s, 1);
            ctx.beginPath();
            for (const [dx, dy, r] of [[-0.3, 0.04, 0.2], [-0.1, -0.1, 0.27], [0.15, -0.05, 0.24], [0.3, 0.06, 0.18], [0, 0.1, 0.24]] as const) {
              ctx.moveTo(dx * w + r * w, dy * w);
              ctx.arc(dx * w, dy * w, r * w, 0, TAU);
            }
            ctx.fill();
            ctx.fillStyle = rgba('#000000', 0.06);
            ctx.fillRect(-w * 0.52, w * 0.1, w * 1.04, w * 0.18);
            ctx.fillStyle = col(s, 1);
            ctx.beginPath();
            ctx.ellipse(0, w * 0.1, w * 0.5, w * 0.17, 0, 0, TAU);
            ctx.fill();
            if (pick < 0.5) {
              ctx.fillStyle = col(s, 2);
              for (const dx of [-0.2, 0, 0.2]) {
                ctx.beginPath();
                ctx.ellipse(dx * w, w * 0.45, w * 0.035, w * 0.07, 0, 0, TAU);
                ctx.fill();
              }
            }
          }
          ctx.restore();
        });
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

export const WALL_PATTERN_PAINTERS_2: readonly PainterDef[] = [
  twoTone, stripeSet, plaidSet, geoMotifs, bloomLarge, blossomBranch, palmLeaf, decoDiamonds, fleurTrellis, playfulSet,
];
