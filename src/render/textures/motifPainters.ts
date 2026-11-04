// Painters built on AI-generated motif masks and murals (mapKit.ts, surfaceMaps.ts):
//
//   motif-wall   a printed wall: one motif (and an optional filler motif) stamped in a layout over a ground colour
//   motif-floor  the same for floors, plus grouted square tiles that each show the motif (encaustic tiles, carpets)
//   mural-wall   one mural stretched over a whole repeat, tinted as a tritone
//
// A motif mask is tinted with one palette colour at run time; the layout, sizes, rotations and mirroring are
// seeded from the design id, so palettes never move the pattern. Before an image has loaded (and in tests, which
// have no images) every stamp is drawn as a soft dot or diamond of the same size, so geometry never depends on loading.
//
// Palette roles: motif-wall [ground, motif, accent (motif2), trim]; motif-floor [ground, motif, accent, grout];
// mural-wall [base, light, dark, trim].

import {
  SEED_PARAM, SKIRT_PARAM, col, drawWrapped, hair, mix, num, rgba, rngFor, skirting, str,
  type Canvas2DLike, type PaintSpec, type PainterDef, type ParamSpec,
} from './painterKit';
import { MAP_IDS, MOTIF_IDS, MURAL_IDS, drawMapRect, surfaceMapImage } from './mapKit';

const LAYOUTS = ['grid', 'half-drop', 'brick', 'diagonal', 'scatter', 'trail'] as const;
type Layout = (typeof LAYOUTS)[number];

const MOTIF_PARAM: ParamSpec = { type: 'enum', values: MOTIF_IDS, default: MOTIF_IDS[0] ?? '', doc: 'Motif mask (public/assets/surfaces/motifs).' };
const MOTIF2_PARAM: ParamSpec = { type: 'enum', values: ['', ...MOTIF_IDS], default: '', doc: 'Optional filler motif drawn between the main motifs; empty = none.' };
const GROUND_PARAM: ParamSpec = { type: 'enum', values: ['', ...MAP_IDS], default: '', doc: 'Optional material map (paper, linen, plaster, fibre) under the print, shown at low contrast around the ground colour; empty = flat ground.' };

const SHARED: Record<string, ParamSpec> = {
  seed: SEED_PARAM,
  motif: MOTIF_PARAM,
  motif2: MOTIF2_PARAM,
  ground: GROUND_PARAM,
  groundScale: { type: 'number', min: 0.2, max: 2.4, default: 0.6, doc: 'Metres covered by one ground map tile (rounded to fit the repeat).' },
  groundContrast: { type: 'number', min: 0, max: 1, default: 0.5, doc: 'Contrast of the ground map around the ground colour.' },
  layout: { type: 'enum', values: LAYOUTS, default: 'grid', doc: 'grid, half-drop (odd columns drop half a cell), brick (odd rows shift half a cell), diagonal (checkerboard: motif on one colour of cells, motif2 on the other), scatter (jittered), trail (motifs along wavy vertical lines). half-drop and diagonal use an even number of columns, floors with brick or diagonal an even number of rows, so the repeat stays seamless.' },
  cols: { type: 'number', min: 1, max: 8, default: 3, integer: true, doc: 'Motifs across one repeat.' },
  rows: { type: 'number', min: 1, max: 12, default: 3, integer: true, doc: 'Motifs down the wall height (walls) or down one repeat (floors).' },
  size: { type: 'number', min: 0.2, max: 1.2, default: 0.8, doc: 'Motif size as a fraction of its cell (the smaller cell side).' },
  rotate: { type: 'number', min: -180, max: 180, default: 0, doc: 'Rotation of every motif (degrees).' },
  rotJitter: { type: 'number', min: 0, max: 180, default: 0, doc: 'Random rotation, plus or minus (degrees).' },
  mirror: { type: 'boolean', default: false, doc: 'Mirror every other motif horizontally.' },
  scaleJitter: { type: 'number', min: 0, max: 0.5, default: 0, doc: 'Random size variation, plus or minus a share of the size.' },
  motif2Size: { type: 'number', min: 0.1, max: 1, default: 0.45, doc: 'Filler motif size as a fraction of its cell.' },
};

interface Stamp { x: number; y: number; size: number; rot: number; flip: boolean; second: boolean }

const isLayout = (v: string): v is Layout => (LAYOUTS as readonly string[]).includes(v);
const wrap = (v: number, m: number) => ((v % m) + m) % m;

/**
 * Every motif of one repeat, in metres (centre x, y, box side, rotation in radians). Positions are wrapped into the
 * repeat; drawWrapped adds the copies of stamps that cross its edge. Deterministic for (seed, params).
 */
export function motifStamps(s: PaintSpec): Stamp[] {
  const layout: Layout = isLayout(str(s, 'layout')) ? (str(s, 'layout') as Layout) : 'grid';
  const wrapY = s.wrapY;
  let cols = Math.max(1, Math.round(num(s, 'cols')));
  let rows = Math.max(1, Math.round(num(s, 'rows')));
  if (layout === 'half-drop' || layout === 'diagonal') cols += cols % 2;
  if (wrapY && (layout === 'brick' || layout === 'diagonal')) rows += rows % 2;
  const cw = s.w / cols, ch = s.h / rows;
  const cell = Math.min(cw, ch);
  const size = num(s, 'size'), sizeJ = num(s, 'scaleJitter');
  const rot0 = (num(s, 'rotate') * Math.PI) / 180, rotJ = (num(s, 'rotJitter') * Math.PI) / 180;
  const mirror = s.params.mirror === true;
  const hasSecond = str(s, 'motif2') !== '';
  const size2 = num(s, 'motif2Size');
  const out: Stamp[] = [];
  // walls do not wrap vertically: stamps one cell above and below the wall still reach into it
  const j0 = wrapY ? 0 : -1, j1 = wrapY ? rows : rows + 1;

  const add = (x: number, y: number, i: number, j: number, second: boolean, tag: number, extraRot = 0) => {
    const rng = rngFor(s.seed, 17, tag, wrap(i, cols) + 64, wrapY ? wrap(j, rows) + 64 : j + 64);
    const k = 1 + (rng.next() * 2 - 1) * sizeJ;
    const side = cell * (second ? size2 : size) * k;
    const rot = rot0 + extraRot + (rng.next() * 2 - 1) * rotJ;
    const flip = mirror && (wrap(i, 2) + wrap(j, 2)) % 2 === 1;
    out.push({ x: wrap(x, s.w), y: wrapY ? wrap(y, s.h) : y, size: side, rot, flip, second });
  };

  for (let j = j0; j < j1; j++) {
    for (let i = 0; i < cols; i++) {
      const cx = (i + 0.5) * cw, cy = (j + 0.5) * ch;
      switch (layout) {
        case 'grid':
          add(cx, cy, i, j, false, 0);
          if (hasSecond) add(cx + cw / 2, cy + ch / 2, i, j, true, 1);
          break;
        case 'half-drop': {
          const y = cy + (i % 2 === 1 ? ch / 2 : 0);
          add(cx, y, i, j, false, 0);
          if (hasSecond) add(cx + cw / 2, y + ch / 4, i, j, true, 1);
          break;
        }
        case 'brick': {
          const x = cx + (wrap(j, 2) === 1 ? cw / 2 : 0);
          add(x, cy, i, j, false, 0);
          if (hasSecond) add(x + cw / 2, cy + ch / 2, i, j, true, 1);
          break;
        }
        case 'diagonal':
          if (wrap(i + j, 2) === 0) add(cx, cy, i, j, false, 0);
          else if (hasSecond) add(cx, cy, i, j, true, 1);
          break;
        case 'scatter': {
          const rng = rngFor(s.seed, 23, i, wrapY ? wrap(j, rows) : j + 64);
          add(cx + (rng.next() - 0.5) * cw * 0.6, cy + (rng.next() - 0.5) * ch * 0.6, i, j, false, 0);
          if (hasSecond) {
            const r2 = rngFor(s.seed, 29, i, wrapY ? wrap(j, rows) : j + 64);
            add(cx + cw / 2 + (r2.next() - 0.5) * cw * 0.5, cy + ch / 2 + (r2.next() - 0.5) * ch * 0.5, i, j, true, 1);
          }
          break;
        }
        case 'trail': {
          // a wavy vertical line per column; the filler sits alternately left and right of it
          const sway = Math.sin(((j + i * 0.37) / Math.max(rows, 2)) * Math.PI * 2) * cw * 0.12;
          const x = cx + sway;
          add(x, cy, i, j, false, 0, (sway / cw) * 1.2);
          if (hasSecond) add(x + (wrap(j, 2) === 0 ? 1 : -1) * cw * 0.3, cy + ch / 2, i, j, true, 1);
          break;
        }
      }
    }
  }
  return out;
}

function motifImage(id: string, color: string): unknown {
  return id === '' ? null : surfaceMapImage(id, [color], 'motif');
}

/** A soft dot (filler) or diamond (main motif): the fallback of one stamp while its image is missing. */
function fallbackStamp(ctx: Canvas2DLike, st: Stamp, color: string): void {
  const r = st.size * 0.36;
  ctx.fillStyle = rgba(color, st.second ? 0.55 : 0.75);
  ctx.beginPath();
  if (st.second) ctx.ellipse(0, 0, r * 0.7, r * 0.7, 0, 0, Math.PI * 2);
  else { ctx.moveTo(0, -r); ctx.lineTo(r * 0.75, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.75, 0); ctx.closePath(); }
  ctx.fill();
}

function drawStamps(ctx: Canvas2DLike, s: PaintSpec, stamps: Stamp[]): void {
  const img1 = motifImage(str(s, 'motif'), col(s, 1));
  const img2 = motifImage(str(s, 'motif2'), col(s, 2));
  for (const st of stamps) {
    const img = st.second ? img2 : img1;
    const color = st.second ? col(s, 2) : col(s, 1);
    const r = st.size * 0.75; // a rotated square stays inside this radius
    drawWrapped(ctx, s, st.x - r, st.y - r, st.x + r, st.y + r, () => {
      ctx.save();
      ctx.translate(st.x, st.y);
      ctx.rotate(st.rot);
      if (st.flip) ctx.scale(-1, 1);
      if (img && ctx.drawImage) ctx.drawImage(img, -st.size / 2, -st.size / 2, st.size, st.size);
      else fallbackStamp(ctx, st, color);
      ctx.restore();
    });
  }
}

/** Fills the rectangle with the ground colour and, when a ground map is named and loaded, the map at low contrast. */
function paintGround(ctx: Canvas2DLike, s: PaintSpec, x: number, y: number, w: number, h: number, seedKey: number): void {
  const ground = col(s, 0);
  ctx.fillStyle = ground;
  ctx.fillRect(x, y, w, h);
  const id = str(s, 'ground');
  if (id === '') return;
  const k = num(s, 'groundContrast');
  const img = surfaceMapImage(id, [ground, mix(ground, '#ffffff', 0.16 * k), mix(ground, '#000000', 0.2 * k)], 'material');
  const tile = s.w / Math.max(1, Math.round(s.w / num(s, 'groundScale')));
  // a random phase per rectangle keeps neighbouring tiles from repeating the same crop
  const rng = rngFor(s.seed, 41, seedKey);
  drawMapRect(ctx, img, x, y, w, h, tile, x - rng.next() * tile, y - rng.next() * tile, s.ppm);
}

// ---------------------------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------------------------

const motifWall: PainterDef = {
  id: 'motif-wall',
  surface: 'wall',
  description: 'A printed wall: one AI-generated motif (and an optional filler motif) stamped in a grid, half-drop, brick, diagonal, scatter or trail layout over a ground colour with an optional paper or linen texture.',
  colors: ['ground', 'motif', 'accent', 'trim'],
  params: { ...SHARED, skirt: { ...SKIRT_PARAM, default: 0.1 } as ParamSpec },
  thumbSpan: 1.2,
  paint(ctx, s) {
    paintGround(ctx, s, 0, 0, s.w, s.h, 1);
    drawStamps(ctx, s, motifStamps(s));
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Floors
// ---------------------------------------------------------------------------------------------

const SPINS = ['none', 'quarter', 'random'] as const;
const ROLES = ['ground', 'motif', 'accent', 'trim'] as const;

const motifFloor: PainterDef = {
  id: 'motif-floor',
  surface: 'floor',
  description: 'A motif print for floors (patterned carpets, rugs, vinyl): the same layouts as motif-wall, seamless both ways, or layout tile: grouted square tiles that each show the motif centred and turned by a quarter-turn rule (cement and encaustic tiles).',
  colors: ['ground', 'motif', 'accent', 'grout'],
  params: {
    ...SHARED,
    layout: { type: 'enum', values: [...LAYOUTS, 'tile'], default: 'grid', doc: 'As motif-wall, or tile: square grouted tiles (cols x cols per repeat) with the motif centred in each; motif2 sits on the tile corners.' },
    grout: { type: 'number', min: 0.001, max: 0.03, default: 0.006, doc: 'Tile layout: grout joint width (m).' },
    groutColor: { type: 'enum', values: ROLES, default: 'trim', doc: 'Tile layout: palette role of the grout (ground, motif, accent, trim = the fourth colour).' },
    spin: { type: 'enum', values: SPINS, default: 'none', doc: 'Tile layout: none, quarter (a 2 x 2 pinwheel of quarter turns) or random (seeded quarter turns per tile).' },
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    if (str(s, 'layout') !== 'tile') {
      paintGround(ctx, s, 0, 0, s.w, s.h, 2);
      drawStamps(ctx, s, motifStamps(s));
      return;
    }
    const n = Math.max(1, Math.round(num(s, 'cols')));
    const tw = s.w / n, th = s.h / n;
    const role = Math.max(0, ROLES.indexOf(str(s, 'groutColor') as (typeof ROLES)[number]));
    ctx.fillStyle = col(s, role);
    ctx.fillRect(0, 0, s.w, s.h);
    const g = hair(s, num(s, 'grout'));
    const spin = str(s, 'spin');
    const img = motifImage(str(s, 'motif'), col(s, 1));
    const side = Math.min(tw, th) * num(s, 'size');
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = i * tw + g / 2, y = j * th + g / 2, w = tw - g, h = th - g;
        paintGround(ctx, s, x, y, w, h, 100 + i * 37 + j);
        const k = spin === 'quarter' ? (i % 2) + 2 * (j % 2) : spin === 'random' ? Math.floor(rngFor(s.seed, 53, i, j).next() * 4) : 0;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.translate(i * tw + tw / 2, j * th + th / 2);
        ctx.rotate((k * Math.PI) / 2);
        if (img && ctx.drawImage) ctx.drawImage(img, -side / 2, -side / 2, side, side);
        else fallbackStamp(ctx, { x: 0, y: 0, size: side, rot: 0, flip: false, second: false }, col(s, 1));
        ctx.restore();
      }
    }
    if (str(s, 'motif2') !== '') {
      const img2 = motifImage(str(s, 'motif2'), col(s, 2));
      const side2 = Math.min(tw, th) * num(s, 'motif2Size') * 0.5;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const cx = i * tw, cy = j * th;
          drawWrapped(ctx, s, cx - side2, cy - side2, cx + side2, cy + side2, () => {
            ctx.save();
            ctx.translate(cx, cy);
            if (img2 && ctx.drawImage) ctx.drawImage(img2, -side2 / 2, -side2 / 2, side2, side2);
            else fallbackStamp(ctx, { x: 0, y: 0, size: side2, rot: 0, flip: false, second: true }, col(s, 2));
            ctx.restore();
          });
        }
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Murals
// ---------------------------------------------------------------------------------------------

const muralWall: PainterDef = {
  id: 'mural-wall',
  surface: 'wall',
  description: 'A mural stretched over one repeat (the repeat is the mural width in metres, usually 3.6 to 6) and the full wall height, tinted as a tritone (map 0 -> dark, 0.5 -> base, 1 -> light), with optional skirting and a soft fade into the base colour near the floor.',
  colors: ['base', 'light', 'dark', 'trim'],
  params: {
    seed: SEED_PARAM,
    mural: { type: 'enum', values: MURAL_IDS, default: MURAL_IDS[0] ?? '', doc: 'Mural image (public/assets/surfaces/murals).' },
    skirt: { ...SKIRT_PARAM, default: 0.1 } as ParamSpec,
    fade: { type: 'number', min: 0, max: 1, default: 0, doc: 'Strength of the soft fade into the base colour near the floor; 0 = none.' },
    fadeHeight: { type: 'number', min: 0.1, max: 1.5, default: 0.5, doc: 'Height of the floor fade (m).' },
    mirror: { type: 'boolean', default: false, doc: 'Mirror the mural horizontally.' },
  },
  thumbSpan: 2.8,
  paint(ctx, s) {
    const id = str(s, 'mural');
    const img = id === '' ? null : surfaceMapImage(id, s.colors, 'mural');
    ctx.fillStyle = col(s, 0);
    ctx.fillRect(0, 0, s.w, s.h);
    if (img && ctx.drawImage) {
      ctx.save();
      if (s.params.mirror === true) { ctx.translate(s.w, 0); ctx.scale(-1, 1); }
      ctx.drawImage(img, 0, 0, s.w, s.h);
      ctx.restore();
    } else {
      // flat fallback: the base colour with three darker bands of hills, like a distant landscape
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = rgba(col(s, 2), 0.14 + k * 0.1);
        const top = s.h * (0.45 + k * 0.17);
        ctx.fillRect(0, top, s.w, s.h - top);
      }
    }
    const fade = num(s, 'fade');
    if (fade > 0) {
      const fh = Math.min(num(s, 'fadeHeight'), s.h);
      const steps = 8;
      ctx.fillStyle = col(s, 0);
      // stacked translucent bands, each starting lower than the last: the base colour thickens toward the floor
      for (let k = 0; k < steps; k++) {
        ctx.globalAlpha = Math.min(1, fade * 0.3);
        const y = s.h - fh * ((steps - k) / steps);
        ctx.fillRect(0, y, s.w, s.h - y);
      }
      ctx.globalAlpha = 1;
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

export const MOTIF_PAINTERS: PainterDef[] = [motifWall, motifFloor, muralWall];
