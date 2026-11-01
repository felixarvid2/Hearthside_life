// Surface detail maps: seamless 512 px greyscale images (AI-generated, see tools/build-surface-maps.mjs and
// dev/surfaces-ai/) that a palette tints at runtime. This file is the pure side (no DOM, no three.js): the
// provider hook the painters read maps through, and a tiled-rectangle draw helper. The browser side, which
// loads the images and builds the tinted canvases, is surfaceMaps.ts.
//
// Tint: map value 0 -> palette dark, 0.5 -> palette base, 1 -> palette light, so a palette's colours are
// ordered [base, light, dark, ...] for every map painter, like the procedural wood painters.

import type { SurfaceDesign } from '../../content/types';
import type { Canvas2DLike } from './painterKit';

/** Every shipped detail map (public/assets/surfaces/<id>.webp). */
export const MAP_IDS = [
  'grain-oak', 'grain-barn', 'stone-marble', 'stone-slate', 'fibre-berber', 'fibre-sisal',
  'concrete-aggregate', 'gravel', 'lawn',
  'plaster-rough', 'grasscloth', 'rubble-stone', 'slate-ledge', 'concrete-board', 'marble-veined',
] as const;
export type MapId = (typeof MAP_IDS)[number];

/** Returns a tinted, drawable image of the map for the palette colours, or null while it is not available. */
export type MapProvider = (mapId: string, colors: readonly string[]) => unknown;

let provider: MapProvider | null = null;

export function setSurfaceMapProvider(p: MapProvider | null): void {
  provider = p;
}

export function surfaceMapImage(mapId: string, colors: readonly string[]): unknown {
  return provider ? provider(mapId, colors) : null;
}

/** Detail maps a design needs (empty for purely procedural painters). */
export function designMaps(design: Pick<SurfaceDesign, 'params'>): string[] {
  const m = design.params.map;
  return typeof m === 'string' ? [m] : [];
}

/**
 * Fills the rectangle (x, y, w, h) (metres) with the map repeated in squares of `tileM` metres whose corner
 * grid starts at (ox, oy). Tiles overdraw by about half a pixel so no hairline gaps open between them.
 * Returns false (drawing nothing) when the canvas or the image is missing.
 */
export function drawMapRect(
  ctx: Canvas2DLike, image: unknown, x: number, y: number, w: number, h: number, tileM: number, ox: number, oy: number, ppm: number,
): boolean {
  if (!image || !ctx.drawImage || w <= 0 || h <= 0) return false;
  const pad = 0.6 / ppm;
  const i0 = Math.floor((x - ox) / tileM), i1 = Math.ceil((x + w - ox) / tileM);
  const j0 = Math.floor((y - oy) / tileM), j1 = Math.ceil((y + h - oy) / tileM);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) ctx.drawImage(image, ox + i * tileM, oy + j * tileM, tileM + pad, tileM + pad);
  }
  ctx.restore();
  return true;
}
