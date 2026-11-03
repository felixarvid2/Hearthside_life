// Procedural fence and gate archetypes (Milestone 9). A design is a list of square-section rods in the edge frame:
// x runs along the edge from 0 to 1 metre, z is across it (the fence stands on z = 0), y is up from the ground of its level.
// A rod runs from `a` to `b` with cross-section w (the first perpendicular, horizontal for level runs) by t (the second,
// vertical for level runs), so a horizontal board is `rod(a, b, 0.03, height)` and a vertical post `rod(a, b, 0.1)`.
// `part` picks the colour: main and accent come from the design's variant, 'glass' and 'rope' are fixed light tones.
// Pure: no three.js. render/fenceView.ts merges the rods into one coloured mesh; tests count and bound them.

import { fenceVariant, type FenceDef } from '../content/exterior';

export type Vec3 = readonly [number, number, number];
export type FencePart = 'main' | 'accent' | 'glass' | 'foliage' | 'bloom' | 'stone';

export interface Rod { a: Vec3; b: Vec3; w: number; t: number; part: FencePart }

export interface PieceOptions {
  /** Draw the post at the far end (x = 1). Off when the next edge continues the run. */
  endPost: boolean;
  /** Colour variant index. */
  variant: number;
}

/** Deterministic 0..1 noise for stone courses and wattle weave. */
function noise(i: number, j = 0): number {
  let x = (i * 374761393 + j * 668265263 + 1274126177) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

class Builder {
  readonly rods: Rod[] = [];

  rod(a: Vec3, b: Vec3, w: number, t: number, part: FencePart = 'main'): void { this.rods.push({ a, b, w, t, part }); }

  /** Vertical post. */
  post(x: number, y0: number, y1: number, size: number, part: FencePart = 'main', z = 0): void { this.rod([x, y0, z], [x, y1, z], size, size, part); }

  /** Horizontal board or rail along x at a height, with thickness `th` (z) and height `h` (y). */
  board(x0: number, x1: number, y: number, th: number, h: number, part: FencePart = 'main', z = 0): void { this.rod([x0, y, z], [x1, y, z], th, h, part); }

  /** A flat panel in the run: from x0 to x1 and y0 to y1, `th` thick (z). */
  panel(x0: number, x1: number, y0: number, y1: number, th: number, part: FencePart = 'main', z = 0): void {
    this.rod([x0, (y0 + y1) / 2, z], [x1, (y0 + y1) / 2, z], th, y1 - y0, part);
  }

  /** Solid block from a min corner to a max corner. */
  block(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, part: FencePart = 'main'): void {
    this.rod([(x0 + x1) / 2, y0, (z0 + z1) / 2], [(x0 + x1) / 2, y1, (z0 + z1) / 2], x1 - x0, z1 - z0, part);
  }
}

type Maker = (b: Builder, h: number, o: PieceOptions, gate: boolean) => void;

const POST = 0.1;

/** Posts at x = 0 and (when the run ends here) x = 1. */
function posts(b: Builder, h: number, o: PieceOptions, size = POST, cap = true): void {
  for (const x of o.endPost ? [0.05, 0.95] : [0.05]) {
    b.post(x, 0, h, size);
    if (cap) b.block(x - size * 0.7, h, -size * 0.7, x + size * 0.7, h + 0.04, size * 0.7, 'accent');
  }
}

function picketRow(b: Builder, h: number, n: number, w: number, pointed: boolean, x0 = 0.12, x1 = 0.88, y0 = 0.08): void {
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * (i + 0.5)) / n;
    const top = h - (pointed ? 0.09 : 0);
    b.rod([x, y0, 0.03], [x, top, 0.03], w, 0.025);
    if (pointed) b.rod([x, top, 0.03], [x, h, 0.03], w * 0.45, 0.02);
  }
}

const MAKERS: Record<string, Maker> = {
  picket(b, h, o, gate) {
    posts(b, h + 0.04, o, 0.09, !gate);
    b.board(0.05, 0.95, h * 0.28, 0.04, 0.07, 'accent');
    b.board(0.05, 0.95, h * 0.72, 0.04, 0.07, 'accent');
    picketRow(b, h, 6, 0.1, false, 0.12, 0.88);
  },
  picketPointed(b, h, o, gate) {
    posts(b, h + 0.04, o, 0.09, !gate);
    b.board(0.05, 0.95, h * 0.25, 0.04, 0.07, 'accent');
    b.board(0.05, 0.95, h * 0.7, 0.04, 0.07, 'accent');
    picketRow(b, h, 7, 0.085, true, 0.12, 0.88);
  },
  picketLow(b, h, o) {
    posts(b, h, o, 0.06, false);
    b.board(0.05, 0.95, h * 0.5, 0.03, 0.05, 'accent');
    picketRow(b, h, 5, 0.075, true, 0.1, 0.9, 0.04);
  },
  picketArch(b, h) {
    // a picket gate with its own posts, an overthrow arch and a lantern-less cap
    b.post(0.06, 0, h + 0.55, 0.1); b.post(0.94, 0, h + 0.55, 0.1);
    b.board(0.04, 0.96, h + 0.5, 0.08, 0.08, 'accent');
    b.rod([0.06, h + 0.25, 0], [0.5, h + 0.62, 0], 0.05, 0.05, 'accent'); b.rod([0.94, h + 0.25, 0], [0.5, h + 0.62, 0], 0.05, 0.05, 'accent');
    b.board(0.1, 0.9, h * 0.3, 0.04, 0.07, 'accent');
    picketRow(b, h, 6, 0.1, false, 0.16, 0.84);
  },
  privacy(b, h, o) {
    posts(b, h + 0.05, o, 0.12, true);
    b.board(0.03, 0.97, h * 0.2, 0.05, 0.08, 'accent', 0.06);
    b.board(0.03, 0.97, h * 0.8, 0.05, 0.08, 'accent', 0.06);
    for (let i = 0; i < 9; i++) {
      const x = 0.1 + (0.8 * (i + 0.5)) / 9;
      b.rod([x, 0.05, 0.015], [x, h, 0.015], 0.095, 0.03, i % 2 ? 'main' : 'accent');
    }
    b.board(0.0, 1.0, h, 0.14, 0.05, 'accent');
  },
  postRail(b, h, o) {
    posts(b, h, o, 0.1, true);
    b.board(0.05, 0.95, h * 0.82, 0.05, 0.1);
    b.board(0.05, 0.95, h * 0.42, 0.05, 0.1);
  },
  ranch(b, h, o) {
    posts(b, h + 0.05, o, 0.12, true);
    for (const f of [0.2, 0.52, 0.86]) b.board(0.05, 0.95, h * f, 0.04, 0.16);
  },
  crossbuck(b, h, o) {
    posts(b, h, o, 0.1, true);
    b.board(0.05, 0.95, h * 0.9, 0.05, 0.09, 'accent');
    b.board(0.05, 0.95, h * 0.18, 0.05, 0.09, 'accent');
    b.rod([0.1, h * 0.22, 0], [0.9, h * 0.86, 0], 0.045, 0.07);
    b.rod([0.1, h * 0.86, 0], [0.9, h * 0.22, 0], 0.045, 0.07);
  },
  latticeTop(b, h, o) {
    posts(b, h + 0.05, o, 0.11, true);
    b.block(0.03, 0.04, -0.03, 0.97, h * 0.45, 0.03);
    b.board(0.03, 0.97, h * 0.45, 0.1, 0.05, 'accent');
    for (let i = 0; i < 6; i++) {
      const x0 = 0.1 + i * 0.13;
      b.rod([x0, h * 0.5, 0], [x0 + 0.26, h * 0.97, 0], 0.025, 0.03, 'accent');
      b.rod([x0 + 0.26, h * 0.5, 0], [x0, h * 0.97, 0], 0.025, 0.03, 'accent');
    }
    b.board(0.03, 0.97, h * 0.97, 0.06, 0.05, 'accent');
  },
  lattice(b, h, o) {
    posts(b, h + 0.05, o, 0.1, true);
    b.board(0.05, 0.95, h * 0.08, 0.06, 0.06, 'accent');
    b.board(0.05, 0.95, h * 0.94, 0.06, 0.06, 'accent');
    for (let i = 0; i < 5; i++) {
      const x0 = 0.1 + i * 0.16;
      b.rod([x0, h * 0.12, 0], [x0 + 0.32, h * 0.92, 0], 0.025, 0.03, 'accent');
      b.rod([x0 + 0.32, h * 0.12, 0], [x0, h * 0.92, 0], 0.025, 0.03, 'accent');
    }
  },
  wroughtSpear(b, h, o) {
    posts(b, h + 0.06, o, 0.07, true);
    b.board(0.05, 0.95, h * 0.2, 0.03, 0.04, 'accent');
    b.board(0.05, 0.95, h * 0.84, 0.03, 0.04, 'accent');
    for (let i = 0; i < 7; i++) {
      const x = 0.12 + (0.76 * i) / 6;
      b.rod([x, 0.02, 0], [x, h, 0], 0.022, 0.022);
      b.rod([x, h, 0], [x, h + 0.08, 0], 0.03, 0.01, 'accent'); // spear head
      b.rod([x, h, 0], [x, h + 0.06, 0], 0.01, 0.03, 'accent');
    }
  },
  wroughtScroll(b, h, o) {
    posts(b, h + 0.06, o, 0.07, true);
    b.board(0.05, 0.95, h * 0.1, 0.03, 0.04, 'accent');
    b.board(0.05, 0.95, h * 0.9, 0.03, 0.04, 'accent');
    for (let i = 0; i < 5; i++) {
      const x = 0.14 + (0.72 * i) / 4;
      b.rod([x, 0.05, 0], [x, h * 0.9, 0], 0.022, 0.022);
    }
    for (let i = 0; i < 4; i++) { // scroll rings between the bars, drawn as small diamonds
      const cx = 0.23 + i * 0.18, cy = h * 0.55, r = 0.06;
      b.rod([cx - r, cy, 0], [cx, cy + r, 0], 0.02, 0.02, 'accent'); b.rod([cx, cy + r, 0], [cx + r, cy, 0], 0.02, 0.02, 'accent');
      b.rod([cx + r, cy, 0], [cx, cy - r, 0], 0.02, 0.02, 'accent'); b.rod([cx, cy - r, 0], [cx - r, cy, 0], 0.02, 0.02, 'accent');
    }
  },
  wroughtArch(b, h) {
    b.post(0.06, 0, h + 0.3, 0.09); b.post(0.94, 0, h + 0.3, 0.09);
    b.board(0.04, 0.96, h * 0.15, 0.03, 0.04, 'accent');
    b.board(0.04, 0.96, h * 0.85, 0.03, 0.04, 'accent');
    for (let i = 0; i < 6; i++) { const x = 0.15 + (0.7 * i) / 5; b.rod([x, 0.02, 0], [x, h * 0.9, 0], 0.022, 0.022); }
    const seg = 8;
    for (let i = 0; i < seg; i++) { // curved overthrow
      const t0 = i / seg, t1 = (i + 1) / seg;
      const p = (t: number): Vec3 => [0.06 + 0.88 * t, h + 0.3 + Math.sin(Math.PI * t) * 0.45, 0];
      b.rod(p(t0), p(t1), 0.04, 0.04, 'accent');
    }
    b.rod([0.5, h + 0.3 + 0.45, 0], [0.5, h + 0.3 + 0.62, 0], 0.03, 0.03, 'accent');
  },
  glassFramed(b, h, o) {
    posts(b, h + 0.03, o, 0.06, true);
    b.board(0.03, 0.97, 0.08, 0.04, 0.04);
    b.board(0.03, 0.97, h, 0.05, 0.05);
    b.rod([0.5, 0.1, 0], [0.5, h - 0.02, 0], 0.012, 0.012, 'accent');
    b.panel(0.1, 0.9, 0.1, h - 0.02, 0.012, 'glass');
  },
  glassFrameless(b, h, o) {
    for (const x of o.endPost ? [0.04, 0.96] : [0.04]) b.rod([x, 0, 0], [x, h - 0.04, 0], 0.045, 0.045, 'accent');
    b.board(0.0, 1.0, h, 0.05, 0.05, 'main');
    b.panel(0.06, 0.94, 0.12, h - 0.06, 0.012, 'glass');
    for (const x of [0.12, 0.88]) b.block(x - 0.015, h * 0.2, -0.02, x + 0.015, h * 0.2 + 0.03, 0.02, 'accent');
  },
  hedgeLow(b, h) {
    b.rod([0.5, 0, 0], [0.5, h * 0.85, 0], 0.5, 0.5, 'foliage');
    b.rod([0.5, h * 0.8, 0], [0.5, h, 0], 0.4, 0.4, 'foliage');
    b.rod([0.1, 0, 0], [0.1, h * 0.8, 0], 0.4, 0.4, 'foliage');
    b.rod([0.9, 0, 0], [0.9, h * 0.8, 0], 0.4, 0.4, 'foliage');
  },
  hedgeTall(b, h) {
    b.rod([0.5, 0, 0], [0.5, h * 0.88, 0], 0.62, 0.62, 'foliage');
    b.rod([0.5, h * 0.82, 0], [0.5, h, 0], 0.5, 0.5, 'foliage');
    for (const x of [0.12, 0.88]) b.rod([x, 0, 0], [x, h * 0.92, 0], 0.46, 0.46, 'foliage');
  },
  hedgeBloom(b, h) {
    b.rod([0.5, 0, 0], [0.5, h * 0.88, 0], 0.55, 0.55, 'foliage');
    b.rod([0.5, h * 0.8, 0], [0.5, h, 0], 0.44, 0.44, 'foliage');
    for (const x of [0.1, 0.9]) b.rod([x, 0, 0], [x, h * 0.9, 0], 0.42, 0.42, 'foliage');
    for (let i = 0; i < 9; i++) {
      const x = 0.1 + 0.8 * noise(i, 1), y = h * (0.45 + 0.5 * noise(i, 2)), side = i % 2 ? 1 : -1;
      b.rod([x, y, side * 0.26], [x, y + 0.06, side * 0.26], 0.07, 0.07, 'bloom');
    }
    for (let i = 0; i < 4; i++) b.rod([0.15 + i * 0.23, h * 0.98, 0], [0.15 + i * 0.23, h + 0.05, 0], 0.07, 0.07, 'bloom');
  },
  stoneDry(b, h) {
    const rows = Math.max(3, Math.round(h / 0.2));
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const n = 3 + (r % 2);
      let x = 0;
      for (let i = 0; i < n; i++) {
        const w = (1 / n) * (0.85 + 0.3 * noise(r, i));
        const x1 = Math.min(1, x + w);
        const th = 0.3 - 0.06 * r / rows;
        b.block(x + 0.012, r * rh + 0.01, -th / 2, x1 - 0.012, (r + 1) * rh - 0.01, th / 2, noise(r, i + 7) > 0.5 ? 'main' : 'accent');
        x = x1;
      }
    }
  },
  brickLow(b, h) {
    b.block(0.0, 0, -0.12, 1.0, h - 0.07, 0.12, 'main');
    for (let r = 0; r < 4; r++) b.block(0.0, 0.1 + r * ((h - 0.2) / 4), -0.125, 1.0, 0.1 + r * ((h - 0.2) / 4) + 0.018, 0.125, 'accent'); // mortar lines
    b.block(-0.0, h - 0.07, -0.15, 1.0, h, 0.15, 'accent');
  },
  stucco(b, h) {
    b.block(0.0, 0, -0.11, 1.0, h - 0.08, 0.11, 'main');
    b.block(0.0, h - 0.08, -0.15, 1.0, h, 0.15, 'accent');
    b.block(0.0, 0, -0.13, 1.0, 0.12, 0.13, 'accent');
    for (const x of [0.0, 1.0]) b.block(x - 0.02, 0, -0.14, x + 0.02, h - 0.08, 0.14, 'accent');
  },
  wattle(b, h, o) {
    posts(b, h + 0.04, o, 0.07, false);
    for (let i = 0; i < 9; i++) {
      const x = 0.08 + (0.84 * i) / 8;
      b.rod([x, 0, 0], [x, h + (i % 2 ? 0.03 : 0), 0], 0.045, 0.045, 'accent');
    }
    for (let r = 0; r < 5; r++) {
      const y = 0.12 + (r * (h - 0.2)) / 4;
      for (let i = 0; i < 8; i++) {
        const x0 = 0.08 + (0.84 * i) / 8, x1 = 0.08 + (0.84 * (i + 1)) / 8;
        const front = (i + r) % 2 === 0;
        b.rod([x0, y, front ? 0.035 : -0.035], [x1, y, front ? 0.035 : -0.035], 0.04, 0.045, 'main');
      }
    }
  },
  chain(b, h, o) {
    posts(b, h + 0.04, o, 0.055, false);
    b.board(0.03, 0.97, h, 0.035, 0.035, 'accent');
    b.board(0.03, 0.97, 0.05, 0.03, 0.03, 'accent');
    for (let i = 0; i < 7; i++) {
      const x0 = 0.05 + i * 0.12;
      b.rod([x0, 0.07, 0], [x0 + 0.24, h - 0.02, 0], 0.012, 0.012, 'glass');
      b.rod([x0 + 0.24, 0.07, 0], [x0, h - 0.02, 0], 0.012, 0.012, 'glass');
    }
  },
  slatScreen(b, h, o) {
    posts(b, h + 0.03, o, 0.11, false);
    const n = Math.round(h / 0.14);
    for (let i = 0; i < n; i++) b.board(0.03, 0.97, 0.06 + (i * (h - 0.1)) / (n - 1), 0.04, 0.095, i % 2 ? 'main' : 'accent');
    b.post(0.05, 0, h + 0.03, 0.12, 'accent');
  },
  ropePost(b, h, o) {
    for (const x of o.endPost ? [0.06, 0.94] : [0.06]) {
      b.post(x, 0, h, 0.1, 'main');
      b.block(x - 0.07, h, -0.07, x + 0.07, h + 0.05, 0.07, 'accent');
    }
    const seg = 5;
    for (let i = 0; i < seg; i++) {
      const sag = (t: number) => h - 0.06 - Math.sin(Math.PI * t) * 0.14;
      const t0 = i / seg, t1 = (i + 1) / seg;
      b.rod([0.06 + 0.88 * t0, sag(t0), 0], [0.06 + 0.88 * t1, sag(t1), 0], 0.035, 0.035, 'accent');
    }
  },
  bamboo(b, h, o) {
    posts(b, h + 0.04, o, 0.07, false);
    for (let i = 0; i < 9; i++) {
      const x = 0.07 + (0.86 * i) / 8, top = h + (i % 3) * 0.03;
      b.rod([x, 0, 0], [x, top, 0], 0.06, 0.06, i % 2 ? 'main' : 'accent');
      for (const y of [h * 0.33, h * 0.66]) b.rod([x, y - 0.01, 0], [x, y + 0.01, 0], 0.075, 0.075, 'accent');
    }
    for (const y of [h * 0.2, h * 0.8]) b.board(0.03, 0.97, y, 0.1, 0.03, 'accent');
  },
  balustrade(b, h, o) {
    for (const x of o.endPost ? [0.07, 0.93] : [0.07]) {
      b.post(x, 0, h, 0.14, 'main');
      b.block(x - 0.09, h - 0.02, -0.09, x + 0.09, h + 0.05, 0.09, 'accent');
    }
    b.board(0.0, 1.0, 0.1, 0.12, 0.08, 'main');
    b.board(0.0, 1.0, h - 0.06, 0.14, 0.08, 'accent');
    for (let i = 0; i < 5; i++) { // turned balusters: wide waist, narrow neck
      const x = 0.22 + i * 0.14;
      b.rod([x, 0.17, 0], [x, 0.55 * h, 0], 0.08, 0.08, 'main');
      b.rod([x, 0.55 * h, 0], [x, h - 0.1, 0], 0.055, 0.055, 'main');
    }
  },
  // gates only ------------------------------------------------------------------------------
  stoneArch(b, h) {
    for (const x of [0.12, 0.88]) {
      b.block(x - 0.12, 0, -0.14, x + 0.12, h - 0.2, 0.14, 'main');
      b.block(x - 0.15, 0, -0.17, x + 0.15, 0.14, 0.17, 'accent');
      b.block(x - 0.16, h - 0.2, -0.18, x + 0.16, h - 0.1, 0.18, 'accent');
      b.block(x - 0.07, h - 0.1, -0.07, x + 0.07, h + 0.02, 0.07, 'main');
    }
    const seg = 8;
    for (let i = 0; i < seg; i++) {
      const p = (t: number): Vec3 => [0.12 + 0.76 * t, h - 0.2 + Math.sin(Math.PI * t) * 0.32, 0];
      b.rod(p(i / seg), p((i + 1) / seg), 0.16, 0.14, 'main');
    }
    b.panel(0.28, 0.72, 0.1, h - 0.45, 0.05, 'accent', 0.01); // timber door
    b.rod([0.5, 0.12, 0.04], [0.5, h - 0.5, 0.04], 0.015, 0.015, 'glass');
  },
  hedgeArch(b, h) {
    for (const x of [0.12, 0.88]) b.rod([x, 0, 0], [x, h * 0.8, 0], 0.5, 0.5, 'foliage');
    const seg = 8;
    for (let i = 0; i < seg; i++) {
      const p = (t: number): Vec3 => [0.12 + 0.76 * t, h * 0.75 + Math.sin(Math.PI * t) * 0.28, 0];
      b.rod(p(i / seg), p((i + 1) / seg), 0.44, 0.36, 'foliage');
    }
    for (let i = 0; i < 5; i++) b.rod([0.1 + 0.2 * i, h * (0.55 + 0.35 * noise(i, 4)), 0.24], [0.1 + 0.2 * i, h * (0.6 + 0.35 * noise(i, 4)), 0.24], 0.06, 0.06, 'bloom');
  },
};

/** All rods of a design, in the edge frame. A gate gets a latch and hinges on top of its archetype. */
export function fencePieces(def: FenceDef, opts: Partial<PieceOptions> = {}): Rod[] {
  const o: PieceOptions = { endPost: opts.endPost ?? true, variant: opts.variant ?? 0 };
  const b = new Builder();
  const maker = MAKERS[def.style] ?? MAKERS.picket!;
  const gate = def.kind === 'gate';
  // gates always stand on their own posts so a gate between two fences reads as a gate
  maker(b, def.height, gate ? { ...o, endPost: true } : o, gate);
  if (gate) {
    const h = def.height;
    b.block(0.86, h * 0.5, -0.045, 0.94, h * 0.5 + 0.05, 0.045, 'accent'); // latch
    for (const y of [h * 0.2, h * 0.8]) b.block(0.04, y - 0.03, -0.04, 0.14, y + 0.03, 0.04, 'accent'); // hinges
  }
  return b.rods;
}

/** Colour of a rod for a variant (hex). */
export function rodColor(def: FenceDef, variant: number, part: FencePart): string {
  const v = fenceVariant(def, variant);
  switch (part) {
    case 'main': return v.main;
    case 'accent': return v.accent;
    case 'glass': return '#bcd9df';
    case 'foliage': return v.main;
    case 'bloom': return v.accent;
    case 'stone': return v.main;
  }
}
