// Family-specific painters of surface group 'walls-d' (M10 surfaces). A content agent adds painters only here;
// the array is registered once in ../painters.ts. Prefer the shared painters (motif-wall, motif-floor, mural-wall,
// map-wall, map-floor) before writing a new one.
//
//   deco-geo   Art Deco and retro geometry: sunray, skyline, ziggurat, arches, lattice, arcs, pilaster
//   play-geo   children's prints drawn in code: bunting, confetti
//   quilt-set  a barn quilt wall: star blocks on a grid with sashing
//
// Palette roles: ground, primary, secondary, trim. All of them are seamless along the wall run.

import {
  SEED_PARAM, SKIRT_PARAM, col, drawWrapped, fromFloor, hair, mix, num, rgba, rngFor, shade, skirting, str,
  type Canvas2DLike, type PaintSpec, type PainterDef, type ParamSpec,
} from '../painterKit';

const skirtParam = { ...SKIRT_PARAM, default: 0.1 } as ParamSpec;
const ROLES = ['ground', 'primary', 'secondary', 'trim'];

function poly(ctx: Canvas2DLike, pts: ReadonlyArray<readonly [number, number]>, fill?: string, stroke?: string, lw = 0): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

/** Cells of one column across the repeat: wraps copies that cross the repeat edge. */
function columns(s: PaintSpec, size: number): { n: number; cw: number } {
  const n = Math.max(1, Math.round(s.w / size));
  return { n, cw: s.w / n };
}

// ---------------------------------------------------------------------------------------------
// deco-geo
// ---------------------------------------------------------------------------------------------

const DECO_STYLES = ['sunray', 'skyline', 'ziggurat', 'arches', 'lattice', 'arcs', 'pilaster'] as const;

function sunray(ctx: Canvas2DLike, s: PaintSpec, cw: number, n: number): void {
  // rays fan up from a point on the floor line in every column; wedges alternate ground and primary
  const rays = Math.max(6, Math.round(num(s, 'detail')));
  const g = col(s, 0), p = col(s, 1), q = col(s, 2);
  const lw = hair(s, 0.006);
  for (let i = 0; i < n; i++) {
    const x0 = i * cw, cx = x0 + cw / 2, cy = s.h + 0.05;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, cw, s.h);
    ctx.clip();
    const R = Math.hypot(cw, s.h) * 1.2;
    for (let k = 0; k < rays; k++) {
      const a0 = Math.PI + (k / rays) * Math.PI, a1 = Math.PI + ((k + 1) / rays) * Math.PI;
      poly(ctx, [[cx, cy], [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R], [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R]], k % 2 === 0 ? p : g);
    }
    // thin accent lines on every ray edge, and a rising half sun
    ctx.strokeStyle = q;
    ctx.lineWidth = lw;
    for (let k = 0; k <= rays; k++) {
      const a = Math.PI + (k / rays) * Math.PI;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
    }
    for (let r = 0; r < 3; r++) {
      ctx.beginPath(); ctx.fillStyle = r % 2 === 0 ? g : p;
      ctx.arc(cx, cy, cw * (0.34 - r * 0.1), Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = q; ctx.lineWidth = lw * 1.5; ctx.stroke();
    }
    ctx.restore();
    // column rule
    ctx.fillStyle = q;
    ctx.fillRect(x0 - lw, 0, lw * 2, s.h);
  }
}

function skyline(ctx: Canvas2DLike, s: PaintSpec, cw: number, n: number): void {
  // stepped setback towers pointing up, stacked in brick layout with pin lines
  const g = col(s, 0), p = col(s, 1), q = col(s, 2);
  const th = cw * 1.7; // row pitch
  const lw = hair(s, 0.004);
  const rows = Math.ceil(s.h / th) + 2;
  for (let j = -1; j < rows; j++) {
    for (let i = 0; i < n; i++) {
      const cx = (i + 0.5 + (j % 2 === 0 ? 0 : 0.5)) * cw;
      const base = s.h - j * th;
      drawWrapped(ctx, s, cx - cw / 2, base - th, cx + cw / 2, base, () => {
        const steps: Array<[number, number]> = [[0.36, 0.0], [0.28, 0.26], [0.2, 0.46], [0.12, 0.64], [0.05, 0.78]];
        // silhouette: left side up, spire, right side down
        const pts: Array<[number, number]> = [];
        pts.push([cx - cw * 0.36, base]);
        for (const [hw, ht] of steps) { pts.push([cx - cw * hw, base - th * ht]); pts.push([cx - cw * hw, base - th * (ht + 0.1)]); }
        pts.push([cx, base - th * 0.95]);
        for (const [hw, ht] of [...steps].reverse()) { pts.push([cx + cw * hw, base - th * (ht + 0.1)]); pts.push([cx + cw * hw, base - th * ht]); }
        pts.push([cx + cw * 0.36, base]);
        poly(ctx, pts, p);
        ctx.strokeStyle = q; ctx.lineWidth = lw;
        for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(cx + k * cw * 0.05, base - th * 0.03); ctx.lineTo(cx + k * cw * 0.05, base - th * 0.5 + Math.abs(k) * th * 0.08); ctx.stroke(); }
        ctx.fillStyle = g;
        ctx.fillRect(cx - cw * 0.03, base - th * 0.8, cw * 0.06, th * 0.1);
      });
    }
  }
}

function ziggurat(ctx: Canvas2DLike, s: PaintSpec, cw: number, n: number): void {
  // concentric stepped diamonds on a grid, with small stepped diamonds in the gaps
  const g = col(s, 0), p = col(s, 1), q = col(s, 2);
  const rows = Math.ceil(s.h / cw) + 2;
  const stepped = (cx: number, cy: number, R: number, steps: number, colors: string[]) => {
    for (let k = 0; k < steps; k++) {
      const r = R * (1 - k / steps);
      const pts: Array<[number, number]> = [];
      const m = 3;
      for (let t = 0; t < 4; t++) {
        // each quadrant is a staircase from the top point to the right point, rotated by a quarter turn
        const ang = (t * Math.PI) / 2;
        const c = Math.cos(ang), sn = Math.sin(ang);
        const rot = (x: number, y: number): [number, number] => [cx + x * c - y * sn, cy + x * sn + y * c];
        for (let u = 0; u < m; u++) {
          pts.push(rot((u * r) / m, -r + (u * r) / m), rot(((u + 1) * r) / m, -r + (u * r) / m));
        }
      }
      poly(ctx, pts, colors[k % colors.length]);
    }
  };
  for (let j = -1; j < rows; j++) {
    for (let i = 0; i < n; i++) {
      const cx = (i + 0.5) * cw, cy = s.h - (j + 0.5) * cw;
      drawWrapped(ctx, s, cx - cw / 2, cy - cw / 2, cx + cw / 2, cy + cw / 2, () => stepped(cx, cy, cw * 0.46, 4, [p, g, q, g]));
      const ox = cx + cw / 2, oy = cy + cw / 2;
      drawWrapped(ctx, s, ox - cw / 4, oy - cw / 4, ox + cw / 4, oy + cw / 4, () => stepped(ox, oy, cw * 0.16, 2, [q, g]));
    }
  }
}

function arches(ctx: Canvas2DLike, s: PaintSpec, cw: number, n: number): void {
  // nested round-topped arches with straight legs, rows offset by half a column and drawn bottom-up so each row overlaps the last
  const g = col(s, 0), p = col(s, 1), q = col(s, 2);
  const rh = cw * 0.9; // row pitch
  const rows = Math.ceil(s.h / rh) + 2;
  const archPath = (cx: number, topY: number, hw: number, legY: number) => {
    ctx.beginPath();
    ctx.moveTo(cx - hw, legY);
    ctx.lineTo(cx - hw, topY + hw);
    ctx.arc(cx, topY + hw, hw, Math.PI, 0);
    ctx.lineTo(cx + hw, legY);
    ctx.closePath();
  };
  for (let j = rows; j >= -1; j--) {
    for (let i = 0; i < n; i++) {
      const cx = (i + (j % 2 === 0 ? 0.5 : 1)) * cw;
      const base = s.h - j * rh;
      drawWrapped(ctx, s, cx - cw / 2, base - cw, cx + cw / 2, base + cw, () => {
        const cols4 = [p, g, q, g, p];
        for (let k = 0; k < 5; k++) {
          const hw = cw * 0.5 * (1 - k * 0.17);
          archPath(cx, base - cw * 0.5 - hw * 0.0 - cw * 0.1 + k * cw * 0.085 - hw, hw, base + cw * 0.6);
          ctx.fillStyle = cols4[k] as string;
          ctx.fill();
        }
      });
    }
  }
}

function lattice(ctx: Canvas2DLike, s: PaintSpec, cw: number, n: number): void {
  // diagonal double lines crossing, a pearl at each crossing and a small diamond in each cell
  const g = col(s, 0), p = col(s, 1), q = col(s, 2);
  const lw = hair(s, cw * 0.025), gap = cw * 0.05;
  const yTop = -cw, yBot = s.h + cw, span = yBot - yTop;
  const reach = Math.ceil(span / cw) + 1;
  ctx.strokeStyle = p;
  ctx.lineWidth = lw;
  for (const dir of [1, -1]) {
    for (const off of [-gap, gap]) {
      for (let i = -reach; i <= n + reach; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cw + off, yTop);
        ctx.lineTo(i * cw + off + dir * span, yBot);
        ctx.stroke();
      }
    }
  }
  // crossings sit at x = m cw/2, y = yTop + k cw/2 with m and k of equal parity; cell centres where they differ
  const pearl = cw * 0.075;
  const ks = Math.ceil(span / (cw / 2));
  for (let k = 0; k <= ks; k++) {
    for (let m = 0; m < 2 * n; m++) {
      const x = (m * cw) / 2, y = yTop + (k * cw) / 2;
      if ((m + k) % 2 === 0) {
        drawWrapped(ctx, s, x - pearl * 2, y - pearl * 2, x + pearl * 2, y + pearl * 2, () => {
          ctx.beginPath(); ctx.fillStyle = g; ctx.arc(x, y, pearl * 1.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.fillStyle = p; ctx.arc(x, y, pearl, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.fillStyle = g; ctx.arc(x, y, pearl * 0.4, 0, Math.PI * 2); ctx.fill();
        });
      } else {
        drawWrapped(ctx, s, x - cw / 4, y - cw / 4, x + cw / 4, y + cw / 4, () =>
          poly(ctx, [[x, y - cw * 0.12], [x + cw * 0.07, y], [x, y + cw * 0.12], [x - cw * 0.07, y]], q));
      }
    }
  }
}

function arcs(ctx: Canvas2DLike, s: PaintSpec, cw: number, n: number): void {
  // retro rainbow bands: concentric half circles stacked in offset rows, each row overlapping the one below
  const g = col(s, 0), p = col(s, 1), q = col(s, 2);
  const bands = [p, mix(p, q, 0.5), q, mix(q, g, 0.5), g];
  const rh = cw * 0.5;
  const rows = Math.ceil(s.h / rh) + 3;
  for (let j = rows; j >= -2; j--) {
    for (let i = 0; i < n; i++) {
      const cx = (i + (j % 2 === 0 ? 0.5 : 1)) * cw;
      const cy = s.h - j * rh;
      drawWrapped(ctx, s, cx - cw / 2, cy - cw / 2, cx + cw / 2, cy + 0.01, () => {
        for (let k = 0; k < bands.length; k++) {
          ctx.beginPath(); ctx.fillStyle = bands[k] as string;
          ctx.arc(cx, cy, (cw / 2) * (1 - k / bands.length), Math.PI, 0); ctx.closePath(); ctx.fill();
        }
      });
    }
  }
}

function pilaster(ctx: Canvas2DLike, s: PaintSpec, cw: number, n: number, skirt: number): void {
  // tall panels with notched corners, a double gold inset line and a small diamond; the trim colour is the gap
  const g = col(s, 0), p = col(s, 1), q = col(s, 2);
  const lw = hair(s, 0.005);
  const gutter = cw * 0.06;
  const top = 0.18, bottom = fromFloor(s, skirt + 0.2);
  for (let i = 0; i < n; i++) {
    const x0 = i * cw + gutter, x1 = (i + 1) * cw - gutter;
    const c = Math.min(cw * 0.12, 0.1);
    const outline = (inset: number): Array<[number, number]> => {
      const a = x0 + inset, b = x1 - inset, t = top + inset, u = bottom - inset, k = c;
      return [[a + k, t], [b - k, t], [b, t + k], [b, u - k], [b - k, u], [a + k, u], [a, u - k], [a, t + k]];
    };
    poly(ctx, outline(0), p);
    poly(ctx, outline(cw * 0.05), undefined, q, lw * 1.6);
    poly(ctx, outline(cw * 0.085), undefined, g, lw);
    const cx = (x0 + x1) / 2, cy = (top + bottom) / 2;
    poly(ctx, [[cx, cy - cw * 0.22], [cx + cw * 0.12, cy], [cx, cy + cw * 0.22], [cx - cw * 0.12, cy]], q);
    poly(ctx, [[cx, cy - cw * 0.12], [cx + cw * 0.06, cy], [cx, cy + cw * 0.12], [cx - cw * 0.06, cy]], g);
    // fluting above and below the diamond
    ctx.strokeStyle = rgba(g, 0.7); ctx.lineWidth = lw;
    for (let f = -2; f <= 2; f++) {
      const fx = cx + f * cw * 0.1;
      ctx.beginPath(); ctx.moveTo(fx, top + cw * 0.16); ctx.lineTo(fx, cy - cw * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fx, cy + cw * 0.3); ctx.lineTo(fx, bottom - cw * 0.16); ctx.stroke();
    }
  }
}

const decoGeo: PainterDef = {
  id: 'deco-geo',
  surface: 'wall',
  description: 'Art Deco and retro geometry in code: sunray columns, stepped skyline towers, stepped ziggurat diamonds, nested arches, a pearl lattice, retro rainbow arcs, or notched pilaster panels.',
  colors: ROLES,
  params: {
    seed: SEED_PARAM,
    skirt: skirtParam,
    style: { type: 'enum', values: DECO_STYLES, default: 'sunray', doc: 'Which geometry.' },
    size: { type: 'number', min: 0.15, max: 1.6, default: 0.4, doc: 'Column width of one unit (m); rounded to fit the repeat.' },
    detail: { type: 'number', min: 6, max: 24, default: 12, integer: true, doc: 'Sunray: rays per column.' },
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    const style = str(s, 'style');
    ctx.fillStyle = col(s, 0);
    ctx.fillRect(0, 0, s.w, s.h);
    const { n, cw } = columns(s, num(s, 'size'));
    const skirt = num(s, 'skirt');
    if (style === 'sunray') sunray(ctx, s, cw, n);
    else if (style === 'skyline') skyline(ctx, s, cw, n);
    else if (style === 'ziggurat') ziggurat(ctx, s, cw, n);
    else if (style === 'arches') arches(ctx, s, cw, n);
    else if (style === 'lattice') lattice(ctx, s, cw, n);
    else if (style === 'arcs') arcs(ctx, s, cw, n);
    else pilaster(ctx, s, cw, n, skirt);
    skirting(ctx, s, skirt, col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// play-geo
// ---------------------------------------------------------------------------------------------

const playGeo: PainterDef = {
  id: 'play-geo',
  surface: 'wall',
  description: "Children's prints drawn in code: swags of party bunting with triangle flags, or scattered confetti sprinkles (dots, capsules, rings and triangles).",
  colors: ROLES,
  params: {
    seed: SEED_PARAM,
    skirt: skirtParam,
    style: { type: 'enum', values: ['bunting', 'confetti'], default: 'bunting', doc: 'Which print.' },
    size: { type: 'number', min: 0.15, max: 1.2, default: 0.45, doc: 'Bunting: swag width (m). Confetti: grid cell used for the scatter (m).' },
    rows: { type: 'number', min: 1, max: 14, default: 5, integer: true, doc: 'Bunting: strings down the wall.' },
    density: { type: 'number', min: 0.2, max: 3, default: 1, doc: 'Confetti: pieces per cell.' },
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    const g = col(s, 0), a = col(s, 1), b = col(s, 2), t = col(s, 3);
    const cols4 = [a, b, t, mix(a, b, 0.5)];
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s.w, s.h);
    const { n, cw } = columns(s, num(s, 'size'));
    if (str(s, 'style') === 'bunting') {
      const rows = Math.round(num(s, 'rows'));
      const pitch = (s.h - 0.3) / rows;
      const sag = cw * 0.22;
      const string = shade(a, -0.3);
      for (let j = 0; j < rows; j++) {
        const y0 = 0.25 + j * pitch;
        const off = j % 2 === 0 ? 0 : cw / 2;
        for (let i = -1; i < n; i++) {
          const x0 = i * cw + off;
          drawWrapped(ctx, s, x0, y0, x0 + cw, y0 + sag + cw * 0.4, () => {
            const pt = (u: number): [number, number] => [x0 + u * cw, y0 + Math.sin(u * Math.PI) * sag];
            ctx.strokeStyle = string; ctx.lineWidth = hair(s, 0.004);
            ctx.beginPath();
            for (let k = 0; k <= 12; k++) { const [x, y] = pt(k / 12); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
            ctx.stroke();
            const flags = 5;
            for (let k = 0; k < flags; k++) {
              const u = (k + 0.5) / flags;
              const [x, y] = pt(u);
              const fw = cw / flags * 0.78, fh = fw * 1.15;
              // flag follows the string's slope a little
              const slope = Math.cos(u * Math.PI) * sag * Math.PI / cw;
              poly(ctx, [[x - fw / 2, y - slope * fw / 2], [x + fw / 2, y + slope * fw / 2], [x, y + fh]], cols4[(k + i + j * 2 + 8) % 4] as string);
            }
          });
        }
      }
    } else {
      const per = num(s, 'density');
      const rowsN = Math.ceil(s.h / cw) + 1;
      for (let j = 0; j < rowsN; j++) {
        for (let i = 0; i < n; i++) {
          const rng = rngFor(s.seed, 61, i, j);
          const count = Math.floor(per * 3 + rng.next());
          for (let k = 0; k < count; k++) {
            const x = (i + rng.next()) * cw, y = (j + rng.next()) * cw;
            const c = cols4[Math.floor(rng.next() * 4)] as string;
            const kind = Math.floor(rng.next() * 4);
            const r = cw * (0.035 + rng.next() * 0.04), rot = rng.next() * Math.PI;
            drawWrapped(ctx, s, x - r * 3, y - r * 3, x + r * 3, y + r * 3, () => {
              ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
              if (kind === 0) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); }
              else if (kind === 1) { ctx.strokeStyle = c; ctx.lineWidth = r * 0.7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-r * 1.4, 0); ctx.lineTo(r * 1.4, 0); ctx.stroke(); }
              else if (kind === 2) { ctx.strokeStyle = c; ctx.lineWidth = r * 0.45; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); }
              else poly(ctx, [[0, -r * 1.2], [r * 1.1, r * 0.8], [-r * 1.1, r * 0.8]], c);
              ctx.restore();
            });
          }
        }
      }
    }
    skirting(ctx, s, num(s, 'skirt'), t);
  },
};

// ---------------------------------------------------------------------------------------------
// quilt-set
// ---------------------------------------------------------------------------------------------

const quiltSet: PainterDef = {
  id: 'quilt-set',
  surface: 'wall',
  description: 'A painted barn quilt wall: square Ohio-star blocks on a grid, every other block with its colours swapped, framed by thin sashing lines.',
  colors: ROLES,
  params: {
    seed: SEED_PARAM,
    skirt: skirtParam,
    size: { type: 'number', min: 0.25, max: 1.2, default: 0.6, doc: 'Block side (m); rounded to fit the repeat.' },
    sashing: { type: 'number', min: 0, max: 0.03, default: 0.008, doc: 'Width of the trim lines between blocks (m).' },
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    const g = col(s, 0), a = col(s, 1), b = col(s, 2), t = col(s, 3);
    const { n, cw } = columns(s, num(s, 'size'));
    const rows = Math.ceil(s.h / cw) + 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s.w, s.h);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < n; i++) {
        const x0 = i * cw, y0 = s.h - (j + 1) * cw;
        const alt = (i + j) % 2 === 1;
        const bg = alt ? b : g, star = alt ? g : a, corner = alt ? a : b;
        const u = cw / 3;
        ctx.fillStyle = bg; ctx.fillRect(x0, y0, cw, cw);
        // corners
        ctx.fillStyle = corner;
        for (const [cx, cy] of [[0, 0], [2, 0], [0, 2], [2, 2]] as Array<[number, number]>) ctx.fillRect(x0 + cx * u, y0 + cy * u, u, u);
        // star points: a triangle in each edge unit pointing outward, and the centre square
        ctx.fillStyle = star;
        ctx.fillRect(x0 + u, y0 + u, u, u);
        const mid = x0 + cw / 2, midy = y0 + cw / 2;
        poly(ctx, [[x0 + u, y0 + u], [x0 + 2 * u, y0 + u], [mid, y0]], star);
        poly(ctx, [[x0 + u, y0 + 2 * u], [x0 + 2 * u, y0 + 2 * u], [mid, y0 + cw]], star);
        poly(ctx, [[x0 + u, y0 + u], [x0 + u, y0 + 2 * u], [x0, midy]], star);
        poly(ctx, [[x0 + 2 * u, y0 + u], [x0 + 2 * u, y0 + 2 * u], [x0 + cw, midy]], star);
        // inner stitch line
        ctx.strokeStyle = rgba(t, 0.5); ctx.lineWidth = hair(s, 0.003);
        ctx.beginPath(); ctx.rect(x0 + cw * 0.04, y0 + cw * 0.04, cw * 0.92, cw * 0.92); ctx.stroke();
      }
    }
    const sw = num(s, 'sashing');
    if (sw > 0) {
      ctx.fillStyle = t;
      for (let i = 0; i < n; i++) ctx.fillRect(i * cw - sw / 2, 0, sw, s.h);
      for (let j = 0; j <= rows; j++) ctx.fillRect(0, s.h - j * cw - sw / 2, s.w, sw);
    }
    skirting(ctx, s, num(s, 'skirt'), t);
  },
};

export const PAINTERS_WALLS_D: PainterDef[] = [decoGeo, playGeo, quiltSet];
