// Painters built on AI-generated detail maps (mapKit.ts): the map supplies the material (grain, stone, fibre,
// pebbles), the painter supplies layout (boards, tile cells, joints, skirting) and the palette tints it
// (palette colours are [base, light, dark, ...]: map 0 -> dark, 0.5 -> base, 1 -> light).
//
// Until a map has loaded (or in tests, which have no images) every painter draws a flat speckled fallback of
// the same layout, so geometry never depends on the palette or on the loader.

import {
  SEED_PARAM, SKIRT_PARAM, col, drawWrapped, fitCount, hair, num, rgba, rngFor, shade, skirting, speckle, wrappedKey,
  type Canvas2DLike, type PaintSpec, type PainterDef, type ParamSpec,
} from './painterKit';
import { MAP_IDS, drawMapRect, surfaceMapImage } from './mapKit';

const MAP_PARAM: ParamSpec = { type: 'enum', values: MAP_IDS, default: MAP_IDS[0], doc: 'Detail map (public/assets/surfaces).' };

function tinted(s: PaintSpec): unknown {
  const id = s.params.map;
  return typeof id === 'string' ? surfaceMapImage(id, s.colors) : null;
}

/** Fills a rectangle with the map (tiles of tileM metres, origin ox, oy) or, without it, flat base + speckle. */
function fillMap(
  ctx: Canvas2DLike, s: PaintSpec, img: unknown, x: number, y: number, w: number, h: number, tileM: number, ox: number, oy: number,
  seedKey: number,
): void {
  if (drawMapRect(ctx, img, x, y, w, h, tileM, ox, oy, s.ppm)) return;
  const base = col(s, 0);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  speckle(ctx, s, rngFor(s.seed, 31, seedKey), 0.05, [col(s, 1), col(s, 2)], 0.3, 1.4, { x, y, w, h });
}

// ---------------------------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------------------------

const mapWall: PainterDef = {
  id: 'map-wall',
  surface: 'wall',
  description: 'A tinted detail map (plaster, stone, grasscloth, concrete) over the whole wall, with optional roll seams and skirting.',
  colors: ['base', 'light', 'dark', 'trim'],
  params: {
    seed: SEED_PARAM,
    skirt: { ...SKIRT_PARAM, default: 0 } as ParamSpec,
    map: MAP_PARAM,
    tiles: { type: 'number', min: 1, max: 8, default: 2, integer: true, doc: 'Map tiles across one repeat.' },
    roll: { type: 'number', min: 0, max: 1.2, default: 0, doc: 'Width of a wallpaper roll (m): draws a fine seam between rolls; 0 = none.' },
    shade: { type: 'number', min: 0, max: 1, default: 0, doc: 'Soft ambient darkening toward the floor line.' },
  },
  thumbSpan: 1.0,
  paint(ctx, s) {
    const tileM = s.w / Math.max(1, Math.round(num(s, 'tiles')));
    fillMap(ctx, s, tinted(s), 0, 0, s.w, s.h, tileM, 0, 0, 1);
    const roll = num(s, 'roll');
    if (roll > 0) {
      const n = fitCount(s.w, roll);
      const step = s.w / n;
      const w = hair(s, 0.0015);
      for (let i = 0; i < n; i++) {
        const x = i * step + step * 0.5;
        ctx.fillStyle = rgba(shade(col(s, 2), -0.3), 0.35);
        ctx.fillRect(x, 0, w, s.h);
        ctx.fillStyle = rgba(col(s, 1), 0.3);
        ctx.fillRect(x + w, 0, w, s.h);
      }
    }
    const sh = num(s, 'shade');
    if (sh > 0) {
      ctx.fillStyle = '#000000';
      for (let k = 0; k < 5; k++) {
        ctx.globalAlpha = (0.05 * sh) / 5 * (5 - k);
        ctx.fillRect(0, s.h - 0.25 * (k + 1), s.w, 0.25);
      }
      ctx.globalAlpha = 1;
    }
    skirting(ctx, s, num(s, 'skirt'), col(s, 3));
  },
};

// ---------------------------------------------------------------------------------------------
// Floors
// ---------------------------------------------------------------------------------------------

const mapFloor: PainterDef = {
  id: 'map-floor',
  surface: 'floor',
  description: 'A tinted detail map over the floor, either continuous (pebbles, lawn, fibre) or cut into grouted cells that each show a different part of the map (stone and marble slabs).',
  colors: ['base', 'light', 'dark', 'grout'],
  params: {
    seed: SEED_PARAM,
    map: MAP_PARAM,
    tiles: { type: 'number', min: 1, max: 8, default: 2, integer: true, doc: 'Continuous mode: map tiles across one repeat.' },
    cell: { type: 'number', min: 0, max: 1.2, default: 0, doc: 'Cell size (m); 0 = continuous. Cells are grouted and each takes a random part of the map.' },
    scale: { type: 'number', min: 0.2, max: 2.4, default: 0.9, doc: 'Cell mode: metres covered by one map tile.' },
    grout: { type: 'number', min: 0.001, max: 0.02, default: 0.004, doc: 'Grout joint width (m).' },
    variation: { type: 'number', min: 0, max: 1, default: 0.4, doc: 'Cell-to-cell tone variation.' },
    bevel: { type: 'number', min: 0, max: 1, default: 0.4, doc: 'Edge highlight of cells.' },
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    const img = tinted(s);
    const cell = num(s, 'cell');
    if (cell <= 0) {
      fillMap(ctx, s, img, 0, 0, s.w, s.h, s.w / Math.max(1, Math.round(num(s, 'tiles'))), 0, 0, 2);
      return;
    }
    ctx.fillStyle = col(s, 3);
    ctx.fillRect(0, 0, s.w, s.h);
    const nx = fitCount(s.w, cell), ny = fitCount(s.h, cell);
    const cw = s.w / nx, ch = s.h / ny;
    const g = hair(s, num(s, 'grout'));
    const tileM = num(s, 'scale');
    const variation = num(s, 'variation'), bevel = num(s, 'bevel');
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const rng = rngFor(s.seed, wrappedKey(s, i * cw + cw / 2, j * ch + ch / 2));
        const x = i * cw + g / 2, y = j * ch + g / 2, w = cw - g, h = ch - g;
        // a random phase into the map gives every cell its own veining
        fillMap(ctx, s, img, x, y, w, h, tileM, x - rng.next() * tileM, y - rng.next() * tileM, i * 131 + j);
        const t = (rng.next() - 0.5) * variation;
        ctx.fillStyle = rgba(t > 0 ? col(s, 1) : col(s, 2), Math.abs(t) * 0.35);
        ctx.fillRect(x, y, w, h);
        if (bevel > 0) {
          ctx.fillStyle = rgba('#ffffff', 0.16 * bevel);
          ctx.fillRect(x, y, w, hair(s, 0.003));
          ctx.fillRect(x, y, hair(s, 0.003), h);
          ctx.fillStyle = rgba('#000000', 0.14 * bevel);
          ctx.fillRect(x, y + h - hair(s, 0.003), w, hair(s, 0.003));
          ctx.fillRect(x + w - hair(s, 0.003), y, hair(s, 0.003), h);
        }
      }
    }
  },
};

const mapBoards: PainterDef = {
  id: 'map-boards',
  surface: 'floor',
  description: 'Boards in staggered rows cut from a tinted grain map: each board takes one band of the map at a random phase, mirrored at random.',
  colors: ['base', 'light', 'dark', 'seam'],
  params: {
    seed: SEED_PARAM,
    map: MAP_PARAM,
    bands: { type: 'number', min: 1, max: 6, default: 3, integer: true, doc: 'Boards in one map tile (the map is a stack of this many boards).' },
    board: { type: 'number', min: 0.05, max: 0.4, default: 0.2, doc: 'Board width (m).' },
    minLen: { type: 'number', min: 0.3, max: 1.5, default: 0.8, doc: 'Shortest board (m).' },
    maxLen: { type: 'number', min: 0.6, max: 2.4, default: 1.8, doc: 'Longest board (m).' },
    gap: { type: 'number', min: 0.001, max: 0.012, default: 0.002, doc: 'Joint width (m).' },
    variation: { type: 'number', min: 0, max: 1, default: 0.5, doc: 'Board-to-board tone variation.' },
  },
  thumbSpan: 1.2,
  paint(ctx, s) {
    const img = tinted(s);
    ctx.fillStyle = col(s, 3);
    ctx.fillRect(0, 0, s.w, s.h);
    const rows = fitCount(s.h, num(s, 'board'));
    const bw = s.h / rows;
    const bands = Math.max(1, Math.round(num(s, 'bands')));
    const tileM = bw * bands;
    const minLen = num(s, 'minLen'), maxLen = Math.max(num(s, 'maxLen'), minLen);
    const g = hair(s, num(s, 'gap'));
    const variation = num(s, 'variation');
    for (let r = 0; r < rows; r++) {
      const rng = rngFor(s.seed, 300, r);
      const lens: number[] = [];
      let rest = s.w;
      while (rest > 1e-9) {
        let len = minLen + rng.next() * (maxLen - minLen);
        if (rest - len < minLen * 0.6) len = rest;
        len = Math.min(len, rest);
        lens.push(len);
        rest -= len;
      }
      let x = rng.next() * s.w;
      const y = r * bw;
      lens.forEach((len, i) => {
        const x0 = x >= s.w ? x - s.w : x;
        const prng = rngFor(s.seed, 400, r, i);
        const band = Math.floor(prng.next() * bands);
        const phase = prng.next() * tileM;
        const tone = (prng.next() - 0.5) * variation;
        drawWrapped(ctx, s, x0, y, x0 + len, y + bw, () => {
          // the map tile row that holds this band starts at y - band * bw
          fillMap(ctx, s, img, x0 + g / 2, y + g / 2, len - g, bw - g, tileM, x0 - phase, y - band * bw, r * 53 + i);
          ctx.fillStyle = rgba(tone > 0 ? col(s, 1) : col(s, 2), Math.abs(tone) * 0.4);
          ctx.fillRect(x0 + g / 2, y + g / 2, len - g, bw - g);
          ctx.fillStyle = rgba('#ffffff', 0.08);
          ctx.fillRect(x0 + g / 2, y + g / 2, len - g, hair(s, 0.002));
          ctx.fillStyle = rgba('#000000', 0.12);
          ctx.fillRect(x0 + g / 2, y + bw - g / 2 - hair(s, 0.002), len - g, hair(s, 0.002));
        });
        x += len;
      });
    }
  },
};

export const MAP_PAINTERS: PainterDef[] = [mapWall, mapFloor, mapBoards];
