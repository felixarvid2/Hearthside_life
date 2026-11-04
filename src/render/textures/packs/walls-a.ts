// Family-specific painters of surface group 'walls-a' (M10 surfaces): painted colour blocks and gradients, decorative
// paint effects, scored render, quilted and padded fabric walls, antiqued mirror and a gilt lattice. Registered once in
// ../painters.ts. Detail-map painters use the shared mapKit (flat speckle fallback before an image has loaded).

import {
  SEED_PARAM, SKIRT_PARAM, clouds, col, drawWrapped, fitCount, hair, mix, num, polygonPath, rgba, rngFor, roundRectPath, shade,
  skirting, speckle, str, line, flag, softBlob,
  type Canvas2DLike, type PaintSpec, type PainterDef, type ParamSpec,
} from '../painterKit';
import { MAP_IDS, drawMapRect, surfaceMapImage } from '../mapKit';

const SKIRT = { ...SKIRT_PARAM, default: 0.1 } as ParamSpec;
const MAP_PARAM: ParamSpec = { type: 'enum', values: MAP_IDS, default: MAP_IDS[0], doc: 'Detail map (public/assets/surfaces).' };
const TILES_PARAM: ParamSpec = { type: 'number', min: 1, max: 8, default: 2, integer: true, doc: 'Map tiles across one repeat.' };

/** Fills the whole texture with the tinted map (or, before it loads, the base colour with a faint speckle). */
function groundMap(ctx: Canvas2DLike, s: PaintSpec, seedKey: number): void {
  const id = str(s, 'map');
  const img = id === '' ? null : surfaceMapImage(id, s.colors);
  const tiles = Math.max(1, Math.round(num(s, 'tiles')));
  if (drawMapRect(ctx, img, 0, 0, s.w, s.h, s.w / tiles, 0, 0, s.ppm)) return;
  ctx.fillStyle = col(s, 0);
  ctx.fillRect(0, 0, s.w, s.h);
  speckle(ctx, s, rngFor(s.seed, 31, seedKey), 0.04, [col(s, 1), col(s, 2)], 0.3, 1.4);
}

// ---------------------------------------------------------------------------------------------
// Painted colour
// ---------------------------------------------------------------------------------------------

const washGradient: PainterDef = {
  id: 'wash-gradient',
  surface: 'wall',
  description: 'An ombre colour wash: the wall fades from a deeper colour at the floor to a lighter one at the ceiling (or the other way round) with a soft brushed grain.',
  colors: ['floor colour', 'ceiling colour', 'trim'],
  params: {
    seed: SEED_PARAM, skirt: SKIRT,
    curve: { type: 'number', min: 0.5, max: 2.5, default: 1.2, doc: 'Gradient curve: above 1 keeps the lower colour longer.' },
    grain: { type: 'number', min: 0, max: 1, default: 0.5, doc: 'Strength of the soft brush clouds.' },
  },
  thumbSpan: 1.4,
  paint(ctx, s) {
    const n = 40, curve = num(s, 'curve');
    for (let i = 0; i < n; i++) {
      const t = Math.pow(i / (n - 1), curve); // 0 at the floor, 1 at the ceiling
      ctx.fillStyle = mix(col(s, 0), col(s, 1), t);
      const y1 = s.h - (i / n) * s.h;
      ctx.fillRect(0, y1 - s.h / n - 0.002, s.w, s.h / n + 0.004);
    }
    const g = num(s, 'grain');
    if (g > 0) clouds(ctx, s, rngFor(s.seed, 2), Math.round(s.w * s.h * 10), 0.5, [col(s, 0), col(s, 1)], 0.05 * g);
    skirting(ctx, s, num(s, 'skirt'), col(s, 2));
  },
};

const BLOCK_STYLES = ['half', 'band', 'arch', 'disc', 'peaks'] as const;

const blockPaint: PainterDef = {
  id: 'block-paint',
  surface: 'wall',
  description: 'Colour-blocked paint with taped, crisp edges: a hard horizontal split, a band, painted arches, a sun disc or a range of painted peaks.',
  colors: ['wall', 'block', 'accent', 'trim'],
  params: {
    seed: SEED_PARAM, skirt: SKIRT,
    style: { type: 'enum', values: BLOCK_STYLES, default: 'half', doc: 'half (lower wall in the block colour), band, arch, disc or peaks.' },
    level: { type: 'number', min: 0.2, max: 2.6, default: 1.2, doc: 'Height of the split, band top, arch top, disc centre or peak base (m above the floor).' },
    size: { type: 'number', min: 0.1, max: 1.8, default: 0.4, doc: 'Band height, disc radius or arch inner radius (m).' },
    count: { type: 'number', min: 1, max: 6, default: 2, integer: true, doc: 'Arches, discs or peaks per repeat.' },
    inner: { type: 'boolean', default: true, doc: 'Arches and discs get a second, accent-colour inner shape.' },
  },
  thumbSpan: 2.0,
  paint(ctx, s) {
    ctx.fillStyle = col(s, 0);
    ctx.fillRect(0, 0, s.w, s.h);
    const style = str(s, 'style'), level = num(s, 'level'), size = num(s, 'size');
    const n = Math.max(1, Math.round(num(s, 'count')));
    const yL = s.h - level;
    const edge = (x0: number, x1: number, y: number) => {
      // a hairline of paint ridge along a taped edge
      ctx.fillStyle = rgba(shade(col(s, 1), -0.35), 0.35);
      ctx.fillRect(x0, y, x1 - x0, hair(s, 0.0025));
    };
    ctx.fillStyle = col(s, 1);
    if (style === 'half') {
      ctx.fillRect(0, yL, s.w, s.h - yL);
      edge(0, s.w, yL);
    } else if (style === 'band') {
      ctx.fillRect(0, yL, s.w, size);
      edge(0, s.w, yL);
      edge(0, s.w, yL + size);
    } else if (style === 'peaks') {
      ctx.beginPath();
      ctx.moveTo(0, s.h);
      const step = s.w / n;
      for (let i = 0; i < n; i++) {
        ctx.lineTo(i * step, yL + size * 0.5);
        ctx.lineTo(i * step + step * 0.35, yL - size * 0.5);
        ctx.lineTo(i * step + step * 0.7, yL + size * 0.3);
        ctx.lineTo((i + 1) * step, yL + size * 0.5);
      }
      ctx.lineTo(s.w, s.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = col(s, 2);
      ctx.beginPath();
      ctx.moveTo(0, s.h);
      for (let i = 0; i < n; i++) {
        ctx.lineTo(i * step, yL + size * 0.9);
        ctx.lineTo(i * step + step * 0.62, yL + size * 0.15);
        ctx.lineTo((i + 1) * step, yL + size * 0.9);
      }
      ctx.lineTo(s.w, s.h);
      ctx.closePath();
      ctx.fill();
    } else {
      const step = s.w / n;
      for (let i = 0; i < n; i++) {
        const cx = (i + 0.5) * step;
        if (style === 'arch') {
          const r = Math.min(step * 0.42, size * 1.6);
          const arch = (rr: number, base: number) => {
            ctx.beginPath();
            ctx.moveTo(cx - rr, s.h - base);
            ctx.lineTo(cx - rr, yL + rr);
            ctx.arc(cx, yL + rr, rr, Math.PI, 0);
            ctx.lineTo(cx + rr, s.h - base);
            ctx.closePath();
            ctx.fill();
          };
          ctx.fillStyle = col(s, 1);
          arch(r, 0);
          if (flag(s, 'inner')) { ctx.fillStyle = col(s, 2); arch(r * 0.62, 0); }
        } else {
          const r = size;
          ctx.fillStyle = col(s, 1);
          ctx.beginPath();
          ctx.arc(cx, yL, r, 0, Math.PI * 2);
          ctx.fill();
          if (flag(s, 'inner')) { ctx.fillStyle = col(s, 2); ctx.beginPath(); ctx.arc(cx, yL, r * 0.6, 0, Math.PI * 2); ctx.fill(); }
        }
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

const GLAZES = ['sponge', 'rag', 'stipple', 'strie'] as const;

const glazeSet: PainterDef = {
  id: 'glaze-set',
  surface: 'wall',
  description: 'Decorative paint effects over a base coat: sponged glaze, rag-rolling, stippling and strie (dragged vertical streaks).',
  colors: ['base', 'glaze', 'highlight', 'trim'],
  params: {
    seed: SEED_PARAM, skirt: SKIRT,
    style: { type: 'enum', values: GLAZES, default: 'sponge', doc: 'sponge, rag, stipple or strie.' },
    scale: { type: 'number', min: 0.3, max: 3, default: 1, doc: 'Size of the marks (1 = typical).' },
    strength: { type: 'number', min: 0.1, max: 1, default: 0.6, doc: 'Contrast of the glaze.' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    ctx.fillStyle = col(s, 0);
    ctx.fillRect(0, 0, s.w, s.h);
    const style = str(s, 'style'), k = num(s, 'scale'), st = num(s, 'strength');
    const rng = rngFor(s.seed, 5);
    const area = s.w * s.h;
    if (style === 'stipple') {
      speckle(ctx, s, rng, 0.35, [col(s, 1)], 0.28 * st, 1.6);
      speckle(ctx, s, rng, 0.2, [col(s, 2)], 0.3 * st, 1.4);
      clouds(ctx, s, rng, Math.round(area * 6), 0.4, [col(s, 1)], 0.05 * st);
    } else if (style === 'sponge') {
      const count = Math.round((area * 260) / (k * k));
      for (let i = 0; i < count; i++) {
        const x = rng.next() * s.w, y = rng.next() * s.h, r = (0.012 + rng.next() * 0.03) * k;
        const c = rng.next() < 0.7 ? col(s, 1) : col(s, 2);
        drawWrapped(ctx, s, x - r, y - r, x + r, y + r, () => {
          ctx.fillStyle = rgba(c, 0.16 * st + rng.next() * 0.1 * st);
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * (0.7 + rng.next() * 0.4), rng.next() * 3, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    } else if (style === 'rag') {
      const count = Math.round((area * 55) / (k * k));
      for (let i = 0; i < count; i++) {
        const x = rng.next() * s.w, y = rng.next() * s.h, rx = (0.07 + rng.next() * 0.09) * k, ry = rx * (0.3 + rng.next() * 0.3);
        const rot = rng.next() * Math.PI;
        const c = rng.next() < 0.65 ? col(s, 1) : col(s, 2);
        const r = Math.max(rx, ry);
        drawWrapped(ctx, s, x - r, y - r, x + r, y + r, () => {
          ctx.fillStyle = rgba(c, 0.13 * st + rng.next() * 0.1 * st);
          ctx.beginPath();
          ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      speckle(ctx, s, rng, 0.05, [col(s, 1)], 0.15 * st);
    } else {
      // strie: long vertical drags of glaze through the wet coat
      const count = Math.round(s.w * 260 * k);
      ctx.lineCap = 'butt';
      for (let i = 0; i < count; i++) {
        const x = rng.next() * s.w, w = hair(s, (0.002 + rng.next() * 0.006) * k);
        const y0 = rng.next() * s.h * 0.4, len = s.h * (0.35 + rng.next() * 0.65);
        ctx.fillStyle = rgba(rng.next() < 0.6 ? col(s, 1) : col(s, 2), (0.06 + rng.next() * 0.14) * st);
        ctx.fillRect(Math.min(x, s.w - w), y0, w, Math.min(len, s.h - y0));
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

const swirlRender: PainterDef = {
  id: 'swirl-render',
  surface: 'wall',
  description: 'Fan-swirl textured render (the old Artex finish): overlapping half-circle sweeps in staggered rows, with a lit upper edge and a shadowed lower edge.',
  colors: ['base', 'light', 'dark', 'trim'],
  params: {
    seed: SEED_PARAM, skirt: SKIRT,
    size: { type: 'number', min: 0.1, max: 0.5, default: 0.22, doc: 'Fan radius (m).' },
    relief: { type: 'number', min: 0.2, max: 1, default: 0.6, doc: 'Strength of the ridges.' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    ctx.fillStyle = col(s, 0);
    ctx.fillRect(0, 0, s.w, s.h);
    const cols = fitCount(s.w, num(s, 'size') * 1.6, 2, 2);
    const dx = s.w / cols, r = num(s, 'size');
    const relief = num(s, 'relief');
    const rows = Math.ceil(s.h / (r * 0.8)) + 2;
    const lw = hair(s, 0.004);
    ctx.lineCap = 'round';
    for (let j = rows; j >= -1; j--) {
      for (let i = 0; i < cols; i++) {
        const cx = (i + 0.5 + (j % 2 === 0 ? 0 : 0.5)) * dx;
        const cy = s.h - j * r * 0.8;
        const rng = rngFor(s.seed, 7, i, j + 8);
        const a0 = Math.PI * (1 + (rng.next() - 0.5) * 0.18);
        drawWrapped(ctx, s, cx - r - 0.02, cy - r - 0.02, cx + r + 0.02, cy + 0.04, () => {
          for (let k = 0; k < 5; k++) {
            const rr = r * (0.35 + k * 0.17);
            ctx.lineWidth = lw * 1.4;
            ctx.strokeStyle = rgba(col(s, 2), 0.2 * relief);
            ctx.beginPath(); ctx.arc(cx, cy + lw, rr, a0, a0 + Math.PI); ctx.stroke();
            ctx.lineWidth = lw;
            ctx.strokeStyle = rgba(col(s, 1), 0.34 * relief);
            ctx.beginPath(); ctx.arc(cx, cy - lw * 0.5, rr, a0, a0 + Math.PI); ctx.stroke();
          }
        });
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

const sheenStripe: PainterDef = {
  id: 'sheen-stripe',
  surface: 'wall',
  description: 'Tone-on-tone stripes in a single paint colour: matt bands alternate with satin bands that catch the light, with a fine edge line.',
  colors: ['matt', 'satin', 'shadow', 'trim'],
  params: {
    seed: SEED_PARAM, skirt: SKIRT,
    width: { type: 'number', min: 0.05, max: 0.3, default: 0.12, doc: 'Width of one matt or satin band (m).' },
    contrast: { type: 'number', min: 0.2, max: 1.5, default: 0.8, doc: 'Strength of the sheen.' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    ctx.fillStyle = col(s, 0);
    ctx.fillRect(0, 0, s.w, s.h);
    const n = fitCount(s.w, num(s, 'width'), 2, 2);
    const bw = s.w / n, k = num(s, 'contrast');
    for (let i = 1; i < n; i += 2) {
      const x = i * bw;
      ctx.fillStyle = rgba(col(s, 1), Math.min(1, 0.5 * k));
      ctx.fillRect(x, 0, bw, s.h);
      // the satin catches light along the middle of the band
      ctx.fillStyle = rgba('#ffffff', 0.05 * k);
      ctx.fillRect(x + bw * 0.25, 0, bw * 0.5, s.h);
      ctx.fillStyle = rgba(col(s, 2), 0.12 * k);
      ctx.fillRect(x, 0, hair(s, 0.0025), s.h);
      ctx.fillRect(x + bw - hair(s, 0.0025), 0, hair(s, 0.0025), s.h);
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

const scoredRender: PainterDef = {
  id: 'scored-render',
  surface: 'wall',
  description: 'Rendered wall scored into large ashlar blocks in running bond: grooves cut in the plaster map, a shadow under each course and a lit edge above it.',
  colors: ['base', 'light', 'dark', 'trim'],
  params: {
    seed: SEED_PARAM, skirt: SKIRT, map: MAP_PARAM, tiles: TILES_PARAM,
    block: { type: 'number', min: 0.3, max: 1.2, default: 0.7, doc: 'Block length (m).' },
    course: { type: 'number', min: 0.15, max: 0.7, default: 0.35, doc: 'Course height (m).' },
    groove: { type: 'number', min: 0.002, max: 0.02, default: 0.006, doc: 'Groove width (m).' },
  },
  thumbSpan: 1.4,
  paint(ctx, s) {
    groundMap(ctx, s, 3);
    const rows = fitCount(s.h, num(s, 'course')), ch = s.h / rows;
    const n = fitCount(s.w, num(s, 'block'), 1);
    const bw = s.w / n, g = hair(s, num(s, 'groove'));
    for (let j = 0; j < rows; j++) {
      const y = s.h - j * ch;
      ctx.fillStyle = rgba(col(s, 2), 0.55);
      ctx.fillRect(0, y - g, s.w, g);
      ctx.fillStyle = rgba(col(s, 1), 0.4);
      ctx.fillRect(0, y - g * 2, s.w, g * 0.7);
      for (let i = 0; i < n; i++) {
        const x = (i + (j % 2 === 0 ? 0 : 0.5)) * bw;
        drawWrapped(ctx, s, x - g, y - ch, x + g, y, () => {
          ctx.fillStyle = rgba(col(s, 2), 0.5);
          ctx.fillRect(x - g / 2, y - ch, g, ch);
          ctx.fillStyle = rgba(col(s, 1), 0.35);
          ctx.fillRect(x + g / 2, y - ch, g * 0.6, ch);
        });
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Luxury
// ---------------------------------------------------------------------------------------------

const quilted: PainterDef = {
  id: 'quilted-set',
  surface: 'wall',
  description: 'Upholstered wall over a fabric or leather map: puffed vertical channels, or rectangular padded panels with piped edges and a button at the centre.',
  colors: ['base', 'light', 'dark', 'piping'],
  params: {
    seed: SEED_PARAM, skirt: SKIRT, map: MAP_PARAM, tiles: TILES_PARAM,
    style: { type: 'enum', values: ['channel', 'panel'], default: 'channel', doc: 'channel (vertical padded tubes) or panel (piped rectangles).' },
    pitch: { type: 'number', min: 0.1, max: 0.6, default: 0.2, doc: 'Channel width or panel width (m).' },
    height: { type: 'number', min: 0.3, max: 1.5, default: 0.7, doc: 'Panel height (m); channels ignore it.' },
    button: { type: 'boolean', default: false, doc: 'Panels get a button at the centre.' },
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    groundMap(ctx, s, 4);
    const style = str(s, 'style');
    const n = fitCount(s.w, num(s, 'pitch'), 2);
    const pw = s.w / n;
    if (style === 'channel') {
      for (let i = 0; i < n; i++) {
        const x = i * pw;
        ctx.fillStyle = rgba(col(s, 1), 0.22); ctx.fillRect(x + pw * 0.18, 0, pw * 0.3, s.h);
        ctx.fillStyle = rgba(col(s, 1), 0.12); ctx.fillRect(x + pw * 0.1, 0, pw * 0.5, s.h);
        ctx.fillStyle = rgba(col(s, 2), 0.28); ctx.fillRect(x + pw * 0.78, 0, pw * 0.22, s.h);
        ctx.fillStyle = rgba(col(s, 2), 0.6); ctx.fillRect(x - hair(s, 0.003), 0, hair(s, 0.006), s.h);
        ctx.fillStyle = rgba(col(s, 3), 0.55); ctx.fillRect(x + hair(s, 0.003), 0, hair(s, 0.002), s.h);
      }
    } else {
      const rows = fitCount(s.h, num(s, 'height')), ph = s.h / rows;
      for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) {
        const x = i * pw, y = j * ph, m = hair(s, 0.012);
        softBlob(ctx, x + pw * 0.42, y + ph * 0.4, pw * 0.34, ph * 0.34, 0, col(s, 1), 0.3);
        ctx.fillStyle = rgba(col(s, 2), 0.32);
        ctx.fillRect(x + pw - m - pw * 0.06, y + 2 * m, pw * 0.06, ph - 4 * m);
        ctx.fillRect(x + 2 * m, y + ph - m - ph * 0.06, pw - 4 * m, ph * 0.06);
        ctx.strokeStyle = rgba(col(s, 3), 0.9); ctx.lineWidth = hair(s, 0.006);
        ctx.beginPath(); roundRectPath(ctx, x + m, y + m, pw - 2 * m, ph - 2 * m, 0.012); ctx.stroke();
        ctx.strokeStyle = rgba(col(s, 2), 0.55); ctx.lineWidth = hair(s, 0.003);
        ctx.beginPath(); roundRectPath(ctx, x + m * 0.4, y + m * 0.4, pw - m * 0.8, ph - m * 0.8, 0.014); ctx.stroke();
        if (flag(s, 'button')) {
          ctx.fillStyle = col(s, 3); ctx.beginPath(); ctx.arc(x + pw / 2, y + ph / 2, 0.012, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = rgba('#ffffff', 0.45); ctx.beginPath(); ctx.arc(x + pw / 2 - 0.003, y + ph / 2 - 0.003, 0.004, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

const mirrorPanels: PainterDef = {
  id: 'mirror-panels',
  surface: 'wall',
  description: 'Square mirror tiles with bevelled edges, diagonal reflection streaks and, on antiqued glass, dark foxing spots from the silvering.',
  colors: ['glass', 'reflection', 'foxing', 'joint'],
  params: {
    seed: SEED_PARAM, skirt: SKIRT,
    tile: { type: 'number', min: 0.2, max: 0.8, default: 0.4, doc: 'Mirror tile size (m).' },
    foxing: { type: 'number', min: 0, max: 1, default: 0.6, doc: 'Amount of antique foxing.' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    ctx.fillStyle = col(s, 3);
    ctx.fillRect(0, 0, s.w, s.h);
    const nx = fitCount(s.w, num(s, 'tile')), ny = fitCount(s.h, num(s, 'tile'));
    const tw = s.w / nx, th = s.h / ny, g = hair(s, 0.004), b = hair(s, 0.012);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const rng = rngFor(s.seed, 9, i, j);
      const x = i * tw + g / 2, y = j * th + g / 2, w = tw - g, h = th - g;
      ctx.fillStyle = mix(col(s, 0), col(s, 2), rng.next() * 0.12);
      ctx.fillRect(x, y, w, h);
      // bevel
      ctx.fillStyle = rgba('#ffffff', 0.28); ctx.fillRect(x, y, w, b); ctx.fillRect(x, y, b, h);
      ctx.fillStyle = rgba('#000000', 0.22); ctx.fillRect(x, y + h - b, w, b); ctx.fillRect(x + w - b, y, b, h);
      // reflection streaks
      ctx.save(); ctx.beginPath(); ctx.rect(x + b, y + b, w - 2 * b, h - 2 * b); ctx.clip();
      const off = rng.next() * 0.3;
      for (let k = 0; k < 2; k++) {
        const x0 = x + w * (0.1 + off + k * 0.28), sw = w * (k === 0 ? 0.12 : 0.05);
        ctx.fillStyle = rgba(col(s, 1), k === 0 ? 0.42 : 0.28);
        ctx.beginPath(); polygonPath(ctx, [[x0, y + h], [x0 + sw, y + h], [x0 + sw + h * 0.5, y], [x0 + h * 0.5, y]]); ctx.fill();
      }
      ctx.restore();
      const spots = Math.round(num(s, 'foxing') * 26);
      for (let k = 0; k < spots; k++) {
        const r = (0.002 + rng.next() * 0.006) * (rng.next() < 0.15 ? 2 : 1);
        const edge = rng.next() < 0.6;
        const px = edge ? x + (rng.next() < 0.5 ? 0.02 : w - 0.02) * (0.3 + rng.next() * 0.7) : x + rng.next() * w;
        const py = edge ? y + rng.next() * h : y + rng.next() * h;
        ctx.fillStyle = rgba(col(s, 2), 0.1 + rng.next() * 0.22);
        ctx.beginPath(); ctx.ellipse(px, py, r, r * (0.6 + rng.next() * 0.5), rng.next() * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

const giltLattice: PainterDef = {
  id: 'gilt-lattice',
  surface: 'wall',
  description: 'A diamond lattice of fine gilt double lines on a lacquered ground, with a small rosette at every crossing and a gleam along the lines.',
  colors: ['ground', 'gilt', 'gleam', 'trim'],
  params: {
    seed: SEED_PARAM, skirt: SKIRT,
    pitch: { type: 'number', min: 0.1, max: 0.5, default: 0.25, doc: 'Lattice width (m).' },
    rosette: { type: 'number', min: 0, max: 0.05, default: 0.02, doc: 'Rosette radius at crossings (m); 0 = none.' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    ctx.fillStyle = col(s, 0);
    ctx.fillRect(0, 0, s.w, s.h);
    clouds(ctx, s, rngFor(s.seed, 2), Math.round(s.w * s.h * 8), 0.5, ['#ffffff', '#000000'], 0.05);
    const n = fitCount(s.w, num(s, 'pitch'), 1), pw = s.w / n, ph = pw * 1.3;
    const rows = Math.ceil(s.h / ph) + 2;
    const lw = hair(s, 0.006);
    for (const [c, w, a] of [[col(s, 1), lw, 1], [col(s, 2), lw * 0.35, 0.8]] as const) {
      ctx.strokeStyle = rgba(c, a); ctx.lineWidth = w;
      for (let r = -1; r <= rows; r++) for (let i = 0; i < n; i++) {
        const cx = (i + 0.5) * pw, cy = s.h - r * ph;
        drawWrapped(ctx, s, cx - pw, cy - ph, cx + pw, cy + ph, () => {
          line(ctx, cx - pw / 2, cy, cx, cy - ph / 2); line(ctx, cx, cy - ph / 2, cx + pw / 2, cy);
          line(ctx, cx - pw / 2, cy, cx, cy + ph / 2); line(ctx, cx, cy + ph / 2, cx + pw / 2, cy);
        });
      }
    }
    const rr = num(s, 'rosette');
    if (rr > 0) {
      for (let r = -1; r <= rows; r++) for (let i = 0; i < n; i++) {
        const cx = i * pw, cy = s.h - r * ph;
        drawWrapped(ctx, s, cx - rr, cy - rr, cx + rr, cy + rr, () => {
          ctx.fillStyle = col(s, 1);
          for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(cx + Math.cos(k * Math.PI / 2) * rr * 0.55, cy + Math.sin(k * Math.PI / 2) * rr * 0.55, rr * 0.5, rr * 0.5, 0, 0, Math.PI * 2); ctx.fill(); }
          ctx.fillStyle = col(s, 2); ctx.beginPath(); ctx.arc(cx, cy, rr * 0.35, 0, Math.PI * 2); ctx.fill();
        });
      }
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

export const PAINTERS_WALLS_A: PainterDef[] = [
  washGradient, blockPaint, glazeSet, swirlRender, sheenStripe, scoredRender, quilted, mirrorPanels, giltLattice,
];
